import os
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Coroutine, Dict, List, Optional, Set, Tuple

import networkx as nx

from app.config import EXCLUDED_DIRS, EXCLUDED_EXTENSIONS
from app.models.schemas import (
    AnalysisActivityItem,
    AnalysisSummary,
    ConnectedModuleStat,
    ExecutionFlowEntry,
    ExecutionFlowResponse,
    ExecutionStep,
    FileTreeNode,
    GraphData,
    GraphEdge,
    GraphNode,
    GraphNodeMetrics,
    ImpactItem,
    ImpactReport,
    LanguageStat,
)
from app.services.parser import ParsedFile, ParsedSymbol, parse_source_file


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_rel(p: Path) -> str:
    return str(p).replace("\\", "/")


def _resolve_import_target(
    importer: ParsedFile,
    mod_str: str,
    is_relative: bool,
    level: int,
    py_module_map: Dict[str, str],
    file_path_set: Set[str],
) -> Optional[str]:
    if not mod_str and not is_relative:
        return None

    importer_dir = Path(importer.rel_path).parent

    # Python resolution
    if importer.language == "Python":
        if is_relative:
            base_dir = importer_dir
            for _ in range(max(0, level - 1)):
                base_dir = base_dir.parent
            if mod_str:
                candidate = base_dir / mod_str.replace(".", "/")
            else:
                candidate = base_dir
            cand_py = _normalize_rel(candidate.with_suffix(".py"))
            cand_init = _normalize_rel(candidate / "__init__.py")
            if cand_py in file_path_set:
                return cand_py
            if cand_init in file_path_set:
                return cand_init
        else:
            if mod_str in py_module_map:
                return py_module_map[mod_str]
            # Check prefix if importing a package symbol directly
            parts = mod_str.split(".")
            for i in range(len(parts), 0, -1):
                sub = ".".join(parts[:i])
                if sub in py_module_map:
                    return py_module_map[sub]

    # JS / TS resolution
    if mod_str.startswith("."):
        base = (importer_dir / mod_str)
        norm = os.path.normpath(str(base)).replace("\\", "/")
        for ext in ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]:
            cand = norm + ext
            if cand in file_path_set:
                return cand

    # Alias like @/foo or src/foo
    cleaned = mod_str.lstrip("@/")
    for prefix in ["", "src/"]:
        for ext in ["", ".ts", ".tsx", ".js", ".jsx", ".py"]:
            cand = f"{prefix}{cleaned}{ext}".lstrip("/")
            if cand in file_path_set:
                return cand

    return None


def _build_file_tree(parsed_files: List[ParsedFile]) -> List[Dict[str, Any]]:
    root: Dict[str, Any] = {"name": "", "path": "", "type": "directory", "children_map": {}}

    for pf in sorted(parsed_files, key=lambda f: f.rel_path):
        parts = pf.rel_path.split("/")
        curr = root
        for i, part in enumerate(parts):
            is_last = i == len(parts) - 1
            sub_path = "/".join(parts[: i + 1])
            if is_last:
                curr["children_map"][part] = {
                    "name": part,
                    "path": pf.rel_path,
                    "type": "file",
                    "language": pf.language,
                    "size": pf.size,
                    "lines": pf.lines_of_code,
                    "symbol_count": len(pf.symbols),
                    "children": None,
                }
            else:
                if part not in curr["children_map"]:
                    curr["children_map"][part] = {
                        "name": part,
                        "path": sub_path,
                        "type": "directory",
                        "children_map": {},
                    }
                curr = curr["children_map"][part]

    def finalize(node_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
        items = list(node_dict["children_map"].values())
        dirs = sorted([x for x in items if x["type"] == "directory"], key=lambda x: x["name"].lower())
        files = sorted([x for x in items if x["type"] == "file"], key=lambda x: x["name"].lower())
        result = []
        for d in dirs:
            result.append(
                {
                    "name": d["name"],
                    "path": d["path"],
                    "type": "directory",
                    "size": 0,
                    "lines": 0,
                    "symbol_count": 0,
                    "children": finalize(d),
                }
            )
        result.extend(files)
        return result

    return finalize(root)


async def analyze_repository(
    project_id: str,
    project_name: str,
    root_path: Path,
    is_demo: bool = False,
    progress_cb: Optional[Callable[[str, int, str], Coroutine[Any, Any, None]]] = None,
) -> Dict[str, Any]:
    activity: List[AnalysisActivityItem] = []

    async def notify(stage: str, pct: int, detail: str) -> None:
        activity.append(AnalysisActivityItem(step=stage, detail=detail, timestamp=_now_iso()))
        if progress_cb:
            await progress_cb(stage, pct, detail)

    await notify("scanning", 15, f"Scanning directory tree in {project_name}...")

    discovered_files: List[Tuple[str, Path]] = []
    for dirpath, dirnames, filenames in os.walk(root_path):
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDED_DIRS and not (d.startswith(".") and d not in {".github"})
        ]
        for fname in filenames:
            abs_p = Path(dirpath) / fname
            if abs_p.suffix.lower() in EXCLUDED_EXTENSIONS:
                continue
            rel = _normalize_rel(abs_p.relative_to(root_path))
            discovered_files.append((rel, abs_p))

    await notify("parsing", 35, f"Parsing {len(discovered_files)} repository files...")

    parsed_files: List[ParsedFile] = []
    for rel, abs_p in discovered_files:
        pf = parse_source_file(rel, abs_p)
        if pf:
            parsed_files.append(pf)

    await notify("building_graph", 60, "Constructing architecture, dependency, and call graphs...")

    # Build lookup maps
    file_path_set = {pf.rel_path for pf in parsed_files}
    py_module_map: Dict[str, str] = {}
    for pf in parsed_files:
        if pf.language == "Python":
            p = Path(pf.rel_path)
            if p.name == "__init__.py":
                mod = ".".join(p.parent.parts)
                if mod:
                    py_module_map[mod] = pf.rel_path
            else:
                mod = ".".join(p.with_suffix("").parts)
                py_module_map[mod] = pf.rel_path

    nodes_map: Dict[str, GraphNode] = {}
    edges_map: Dict[str, GraphEdge] = {}

    def add_node(node: GraphNode) -> None:
        if node.id not in nodes_map:
            nodes_map[node.id] = node

    def add_edge(
        source: str,
        target: str,
        etype: str,
        inferred: bool = False,
        line: Optional[int] = None,
        label: Optional[str] = None,
    ) -> None:
        if source == target:
            return
        if source not in nodes_map or target not in nodes_map:
            return
        eid = f"{source}--{etype}-->{target}"
        if eid not in edges_map:
            edges_map[eid] = GraphEdge(
                id=eid,
                source=source,
                target=target,
                type=etype,  # type: ignore
                inferred=inferred,
                line=line,
                label=label or etype,
            )
        elif not inferred and edges_map[eid].inferred:
            # Upgrade inferred edge to confirmed if a confirmed path exists
            edges_map[eid].inferred = False

    # Symbol index: file_path -> {symbol_name: node_id}, and global {symbol_name: [node_id]}
    file_symbol_index: Dict[str, Dict[str, str]] = defaultdict(dict)
    class_method_index: Dict[Tuple[str, str], Dict[str, str]] = defaultdict(dict)
    global_symbol_index: Dict[str, List[str]] = defaultdict(list)

    # Track directories as module nodes
    dir_modules: Set[str] = set()
    for pf in parsed_files:
        parent_dir = str(Path(pf.rel_path).parent).replace("\\", "/")
        if parent_dir and parent_dir != ".":
            dir_modules.add(parent_dir)

    for dpath in sorted(dir_modules):
        mod_id = f"module:{dpath}"
        add_node(
            GraphNode(
                id=mod_id,
                type="module",
                name=Path(dpath).name,
                label=dpath,
                file_path=dpath,
                line_start=1,
                line_end=1,
                metadata={"directory": dpath},
            )
        )

    # Create File, Class, Function, Method nodes
    for pf in parsed_files:
        fid = f"file:{pf.rel_path}"
        add_node(
            GraphNode(
                id=fid,
                type="file",
                name=Path(pf.rel_path).name,
                label=pf.rel_path,
                file_path=pf.rel_path,
                line_start=1,
                line_end=max(1, pf.lines_of_code),
                language=pf.language,
                metrics=GraphNodeMetrics(
                    lines_of_code=pf.lines_of_code,
                    is_entry_point=pf.is_entry_point,
                ),
                metadata={
                    "parse_method": pf.parse_method,
                    "is_config": pf.is_config,
                    "entry_reason": pf.entry_reason,
                },
            )
        )

        parent_dir = str(Path(pf.rel_path).parent).replace("\\", "/")
        if parent_dir and parent_dir != ".":
            add_edge(f"module:{parent_dir}", fid, "CONTAINS", inferred=False)

        # Classes first
        for sym in pf.symbols:
            if sym.kind == "class":
                cid = f"class:{pf.rel_path}::{sym.name}"
                add_node(
                    GraphNode(
                        id=cid,
                        type="class",
                        name=sym.name,
                        label=sym.name,
                        file_path=pf.rel_path,
                        line_start=sym.line_start,
                        line_end=sym.line_end,
                        language=pf.language,
                        signature=sym.signature,
                        docstring=sym.docstring,
                        inferred=sym.inferred,
                        metrics=GraphNodeMetrics(lines_of_code=max(1, sym.line_end - sym.line_start + 1)),
                        metadata={"bases": sym.bases, "decorators": sym.decorators},
                    )
                )
                add_edge(fid, cid, "CONTAINS", inferred=False, line=sym.line_start)
                file_symbol_index[pf.rel_path][sym.name] = cid
                global_symbol_index[sym.name].append(cid)

        # Functions & Methods
        for sym in pf.symbols:
            if sym.kind == "function":
                fn_id = f"func:{pf.rel_path}::{sym.name}"
                is_ep = sym.name == "main" or any(
                    any(k in d for k in ("app.", "router.", "bp.", "route", "get(", "post(", "put(", "delete("))
                    for d in sym.decorators
                )
                add_node(
                    GraphNode(
                        id=fn_id,
                        type="function",
                        name=sym.name,
                        label=f"{sym.name}()",
                        file_path=pf.rel_path,
                        line_start=sym.line_start,
                        line_end=sym.line_end,
                        language=pf.language,
                        signature=sym.signature,
                        docstring=sym.docstring,
                        inferred=sym.inferred,
                        metrics=GraphNodeMetrics(
                            lines_of_code=max(1, sym.line_end - sym.line_start + 1),
                            is_entry_point=is_ep,
                        ),
                        metadata={"decorators": sym.decorators},
                    )
                )
                add_edge(fid, fn_id, "CONTAINS", inferred=False, line=sym.line_start)
                file_symbol_index[pf.rel_path][sym.name] = fn_id
                global_symbol_index[sym.name].append(fn_id)

            elif sym.kind == "method":
                cls_name = sym.parent_class or "UnknownClass"
                m_id = f"method:{pf.rel_path}::{cls_name}.{sym.name}"
                add_node(
                    GraphNode(
                        id=m_id,
                        type="method",
                        name=sym.name,
                        label=f"{cls_name}.{sym.name}()",
                        file_path=pf.rel_path,
                        line_start=sym.line_start,
                        line_end=sym.line_end,
                        language=pf.language,
                        signature=sym.signature,
                        docstring=sym.docstring,
                        inferred=sym.inferred,
                        metrics=GraphNodeMetrics(lines_of_code=max(1, sym.line_end - sym.line_start + 1)),
                        metadata={"parent_class": cls_name, "decorators": sym.decorators},
                    )
                )
                cls_id = f"class:{pf.rel_path}::{cls_name}"
                if cls_id in nodes_map:
                    add_edge(cls_id, m_id, "CONTAINS", inferred=False, line=sym.line_start)
                else:
                    add_edge(fid, m_id, "CONTAINS", inferred=False, line=sym.line_start)
                class_method_index[(pf.rel_path, cls_name)][sym.name] = m_id
                global_symbol_index[sym.name].append(m_id)

    # Map imports & local symbol aliases per file
    file_imported_targets: Dict[str, Dict[str, Tuple[str, Optional[str]]]] = defaultdict(dict)
    # file_path -> {local_alias: (target_file_path, target_symbol_name_or_None)}

    for pf in parsed_files:
        src_file_id = f"file:{pf.rel_path}"
        src_dir = str(Path(pf.rel_path).parent).replace("\\", "/")

        for imp in pf.imports:
            target_rel = _resolve_import_target(
                pf, imp.module, imp.is_relative, imp.level, py_module_map, file_path_set
            )
            if target_rel and target_rel != pf.rel_path:
                tgt_file_id = f"file:{target_rel}"
                add_edge(src_file_id, tgt_file_id, "IMPORTS", inferred=False, line=imp.line)

                tgt_dir = str(Path(target_rel).parent).replace("\\", "/")
                if src_dir != tgt_dir and src_dir != "." and tgt_dir != ".":
                    add_edge(f"module:{src_dir}", f"module:{tgt_dir}", "DEPENDS_ON", inferred=False, line=imp.line)

                for local_name, full_ref in imp.alias_map.items():
                    sym_leaf = full_ref.split(".")[-1]
                    if sym_leaf in file_symbol_index.get(target_rel, {}):
                        file_imported_targets[pf.rel_path][local_name] = (target_rel, sym_leaf)
                    else:
                        file_imported_targets[pf.rel_path][local_name] = (target_rel, None)

                for raw_name in imp.names:
                    if raw_name not in imp.alias_map and raw_name in file_symbol_index.get(target_rel, {}):
                        file_imported_targets[pf.rel_path][raw_name] = (target_rel, raw_name)

        # Class inheritance
        for sym in pf.symbols:
            if sym.kind == "class" and sym.bases:
                cid = f"class:{pf.rel_path}::{sym.name}"
                for base in sym.bases:
                    base_clean = base.split(".")[-1]
                    if base_clean in file_symbol_index.get(pf.rel_path, {}):
                        add_edge(cid, file_symbol_index[pf.rel_path][base_clean], "INHERITS", inferred=False, line=sym.line_start)
                    elif base_clean in file_imported_targets.get(pf.rel_path, {}):
                        tfile, tsym = file_imported_targets[pf.rel_path][base_clean]
                        if tsym and tsym in file_symbol_index.get(tfile, {}):
                            add_edge(cid, file_symbol_index[tfile][tsym], "INHERITS", inferred=False, line=sym.line_start)

    # Resolve function/method calls
    def resolve_call(caller_file: str, caller_class: Optional[str], call_name: str, qualifier: Optional[str], call_inferred: bool) -> Tuple[Optional[str], bool]:
        # 1. self.method() / this.method() inside same class
        if qualifier in {"self", "this"} and caller_class:
            m_id = class_method_index.get((caller_file, caller_class), {}).get(call_name)
            if m_id:
                return m_id, call_inferred

        # 2. qualifier.func() where qualifier is an imported module/alias
        if qualifier and qualifier in file_imported_targets.get(caller_file, {}):
            tfile, _ = file_imported_targets[caller_file][qualifier]
            if call_name in file_symbol_index.get(tfile, {}):
                return file_symbol_index[tfile][call_name], call_inferred

        # 3. Direct call to symbol imported into file
        if not qualifier and call_name in file_imported_targets.get(caller_file, {}):
            tfile, tsym = file_imported_targets[caller_file][call_name]
            target_sym = tsym or call_name
            if target_sym in file_symbol_index.get(tfile, {}):
                return file_symbol_index[tfile][target_sym], call_inferred

        # 4. Direct call to symbol in same file
        if not qualifier and call_name in file_symbol_index.get(caller_file, {}):
            return file_symbol_index[caller_file][call_name], call_inferred

        # 5. Qualified call where qualifier matches a class in same file or imported
        if qualifier:
            if qualifier in file_symbol_index.get(caller_file, {}):
                m_id = class_method_index.get((caller_file, qualifier), {}).get(call_name)
                if m_id:
                    return m_id, call_inferred
            if qualifier in file_imported_targets.get(caller_file, {}):
                tfile, _ = file_imported_targets[caller_file][qualifier]
                m_id = class_method_index.get((tfile, qualifier), {}).get(call_name)
                if m_id:
                    return m_id, call_inferred

        # 6. Unique global symbol name match -> INFERRED
        candidates = global_symbol_index.get(call_name, [])
        if len(candidates) == 1:
            return candidates[0], True

        # 7. If multiple candidates exist across imported files, match imported file
        imported_files = {t[0] for t in file_imported_targets.get(caller_file, {}).values()}
        filtered = [c for c in candidates if nodes_map[c].file_path in imported_files]
        if len(filtered) == 1:
            return filtered[0], True

        return None, True

    for pf in parsed_files:
        for sym in pf.symbols:
            if sym.kind not in {"function", "method"}:
                continue
            caller_id = (
                f"func:{pf.rel_path}::{sym.name}"
                if sym.kind == "function"
                else f"method:{pf.rel_path}::{sym.parent_class or 'UnknownClass'}.{sym.name}"
            )
            for call in sym.calls:
                target_id, is_inf = resolve_call(pf.rel_path, sym.parent_class, call.name, call.qualifier, call.inferred)
                if target_id and target_id != caller_id:
                    add_edge(caller_id, target_id, "CALLS", inferred=is_inf, line=call.line)

        # Module-level calls (e.g. if __name__ == '__main__': main())
        src_file_id = f"file:{pf.rel_path}"
        for call in pf.module_calls:
            target_id, is_inf = resolve_call(pf.rel_path, None, call.name, call.qualifier, call.inferred)
            if target_id:
                add_edge(src_file_id, target_id, "CALLS", inferred=is_inf, line=call.line)

    await notify("computing_metrics", 80, "Calculating NetworkX centrality, dependency metrics, and execution flows...")

    # Build NetworkX DiGraph for metrics
    G = nx.DiGraph()
    for nid in nodes_map:
        G.add_node(nid)
    for edge in edges_map.values():
        G.add_edge(edge.source, edge.target, type=edge.type, inferred=edge.inferred)

    # Centrality on non-CONTAINS dependency/call graph for meaningful architectural importance
    DepG = nx.DiGraph()
    for nid in nodes_map:
        DepG.add_node(nid)
    for edge in edges_map.values():
        if edge.type != "CONTAINS":
            DepG.add_edge(edge.source, edge.target, type=edge.type, inferred=edge.inferred)

    centrality_scores = nx.degree_centrality(DepG) if len(DepG) > 1 else {n: 0.0 for n in DepG}

    for nid, node in nodes_map.items():
        node.metrics.in_degree = DepG.in_degree(nid)
        node.metrics.out_degree = DepG.out_degree(nid)
        node.metrics.centrality = round(float(centrality_scores.get(nid, 0.0)), 4)

    # Language & Framework summary
    lang_file_counts: Counter = Counter()
    lang_line_counts: Counter = Counter()
    frameworks_set: Set[str] = set()
    config_files: List[str] = []
    entry_points_meta: List[Dict[str, Any]] = []
    total_lines = 0

    for pf in parsed_files:
        lang_file_counts[pf.language] += 1
        lang_line_counts[pf.language] += pf.lines_of_code
        total_lines += pf.lines_of_code
        frameworks_set.update(pf.frameworks)
        if pf.is_config:
            config_files.append(pf.rel_path)
        if pf.is_entry_point:
            entry_points_meta.append(
                {
                    "node_id": f"file:{pf.rel_path}",
                    "name": Path(pf.rel_path).name,
                    "file_path": pf.rel_path,
                    "reason": pf.entry_reason or "Detected entry file",
                }
            )

    languages_stats: List[LanguageStat] = []
    for lang, fcount in lang_file_counts.most_common():
        lcount = lang_line_counts[lang]
        pct = round((lcount / total_lines) * 100, 1) if total_lines > 0 else 0.0
        languages_stats.append(LanguageStat(language=lang, files=fcount, lines=lcount, percentage=pct))

    # Most connected modules/files
    file_nodes = [n for n in nodes_map.values() if n.type == "file"]
    most_connected = sorted(
        file_nodes,
        key=lambda n: (n.metrics.in_degree + n.metrics.out_degree, n.metrics.lines_of_code),
        reverse=True,
    )[:8]
    most_connected_stats = [
        ConnectedModuleStat(
            id=n.id,
            name=n.name,
            file_path=n.file_path,
            in_degree=n.metrics.in_degree,
            out_degree=n.metrics.out_degree,
            total_connections=n.metrics.in_degree + n.metrics.out_degree,
            centrality=n.metrics.centrality,
            reason=f"{n.metrics.in_degree} incoming, {n.metrics.out_degree} outgoing dependencies",
        )
        for n in most_connected
        if (n.metrics.in_degree + n.metrics.out_degree) > 0 or len(file_nodes) <= 8
    ]

    # Critical components (functions/classes/files with highest in-degree / centrality)
    critical_candidates = sorted(
        [n for n in nodes_map.values() if n.type in {"file", "class", "function", "method"}],
        key=lambda n: (n.metrics.in_degree * 2 + n.metrics.out_degree, n.metrics.centrality),
        reverse=True,
    )[:8]
    critical_stats = [
        ConnectedModuleStat(
            id=n.id,
            name=n.label,
            file_path=n.file_path,
            in_degree=n.metrics.in_degree,
            out_degree=n.metrics.out_degree,
            total_connections=n.metrics.in_degree + n.metrics.out_degree,
            centrality=n.metrics.centrality,
            reason=f"High fan-in ({n.metrics.in_degree} dependents)" if n.metrics.in_degree > 0 else "Hub component",
        )
        for n in critical_candidates
        if (n.metrics.in_degree + n.metrics.out_degree) > 0
    ]

    # Build specialized subgraphs
    all_nodes_list = list(nodes_map.values())
    all_edges_list = list(edges_map.values())

    dep_nodes = [n for n in all_nodes_list if n.type in {"file", "module"}]
    dep_node_ids = {n.id for n in dep_nodes}
    dep_edges = [
        e for e in all_edges_list
        if e.source in dep_node_ids and e.target in dep_node_ids and e.type in {"IMPORTS", "DEPENDS_ON"}
    ]

    call_nodes = [n for n in all_nodes_list if n.type in {"function", "method", "file"}]
    call_edges = [e for e in all_edges_list if e.type == "CALLS"]
    active_call_node_ids = {e.source for e in call_edges} | {e.target for e in call_edges}
    # Include all functions/methods + any file that directly triggers calls
    filtered_call_nodes = [
        n for n in call_nodes
        if n.type in {"function", "method"} or n.id in active_call_node_ids
    ]

    # Execution flow generation
    execution_flows = _build_execution_flows(nodes_map, all_edges_list)

    total_functions = sum(1 for n in all_nodes_list if n.type == "function")
    total_classes = sum(1 for n in all_nodes_list if n.type == "class")
    total_methods = sum(1 for n in all_nodes_list if n.type == "method")
    total_deps = sum(1 for e in all_edges_list if e.type in {"IMPORTS", "DEPENDS_ON"})
    total_calls = sum(1 for e in all_edges_list if e.type == "CALLS")
    confirmed_edges = sum(1 for e in all_edges_list if not e.inferred)
    inferred_edges = sum(1 for e in all_edges_list if e.inferred)

    await notify("completed", 100, f"Analysis complete: {len(parsed_files)} files, {len(all_nodes_list)} nodes, {len(all_edges_list)} relationships.")

    summary = AnalysisSummary(
        project_id=project_id,
        project_name=project_name,
        is_demo=is_demo,
        total_files=len(parsed_files),
        source_files=sum(1 for pf in parsed_files if pf.parse_method != "metadata_only"),
        total_lines=total_lines,
        total_functions=total_functions,
        total_classes=total_classes,
        total_methods=total_methods,
        total_dependencies=total_deps,
        total_calls=total_calls,
        confirmed_edges=confirmed_edges,
        inferred_edges=inferred_edges,
        languages=languages_stats,
        frameworks=sorted(frameworks_set),
        entry_points=entry_points_meta,
        config_files=sorted(config_files),
        most_connected_modules=most_connected_stats,
        critical_components=critical_stats,
        recent_activity=activity,
    )

    file_tree = _build_file_tree(parsed_files)

    return {
        "summary": summary.model_dump(),
        "graph": GraphData(nodes=all_nodes_list, edges=all_edges_list).model_dump(),
        "dependencies": GraphData(nodes=dep_nodes, edges=dep_edges).model_dump(),
        "call_graph": GraphData(nodes=filtered_call_nodes, edges=call_edges).model_dump(),
        "execution_flow": execution_flows.model_dump(),
        "files": {
            "tree": file_tree,
            "file_count": len(parsed_files),
        },
    }


def _build_execution_flows(nodes_map: Dict[str, GraphNode], edges: List[GraphEdge]) -> ExecutionFlowResponse:
    outgoing_calls: Dict[str, List[GraphEdge]] = defaultdict(list)
    outgoing_imports: Dict[str, List[GraphEdge]] = defaultdict(list)
    contains_children: Dict[str, List[GraphEdge]] = defaultdict(list)

    for e in edges:
        if e.type == "CALLS":
            outgoing_calls[e.source].append(e)
        elif e.type == "IMPORTS":
            outgoing_imports[e.source].append(e)
        elif e.type == "CONTAINS":
            contains_children[e.source].append(e)

    # Identify candidate entry nodes
    entry_candidates: List[Tuple[GraphNode, str, str]] = []
    for n in nodes_map.values():
        if n.type == "function" and n.metrics.is_entry_point:
            reason = "Route handler" if n.metadata.get("decorators") else "Main entry function"
            entry_candidates.append((n, reason, "confirmed"))
        elif n.type == "file" and n.metrics.is_entry_point:
            entry_candidates.append((n, n.metadata.get("entry_reason") or "Entry file", "confirmed"))

    # Fallback if no explicit entry points found: pick top out-degree functions/files
    if not entry_candidates:
        top_fns = sorted(
            [n for n in nodes_map.values() if n.type in {"function", "file"} and n.metrics.out_degree > 0],
            key=lambda x: x.metrics.out_degree,
            reverse=True,
        )[:4]
        for n in top_fns:
            entry_candidates.append((n, "High-orchestration root (inferred entry)", "inferred"))

    # Prioritize files with module_calls or route functions, cap to 8 entry flows
    seen_entry_ids: Set[str] = set()
    flows: List[ExecutionFlowEntry] = []

    def expand_step(node_id: str, depth: int, visited: Set[str], edge_type: str, inferred: bool) -> ExecutionStep:
        node = nodes_map[node_id]
        step = ExecutionStep(
            id=f"step:{node_id}:d{depth}",
            node_id=node_id,
            name=node.label,
            node_type=node.type,
            file_path=node.file_path,
            line_start=node.line_start,
            depth=depth,
            inferred=inferred,
            edge_type=edge_type,
            children=[],
        )
        if depth >= 4:
            return step

        next_edges = outgoing_calls.get(node_id, [])
        # If starting from a file that has no direct module_calls, inspect its top-level entry functions or imports as inferred
        if not next_edges and node.type == "file" and depth == 0:
            fn_children = [
                ce for ce in contains_children.get(node_id, [])
                if ce.target in nodes_map and nodes_map[ce.target].type == "function"
            ]
            for ce in fn_children[:4]:
                if ce.target not in visited:
                    step.children.append(
                        expand_step(ce.target, depth + 1, visited | {ce.target}, "CONTAINS", True)
                    )
            if not step.children:
                for ie in outgoing_imports.get(node_id, [])[:4]:
                    if ie.target not in visited:
                        step.children.append(
                            expand_step(ie.target, depth + 1, visited | {ie.target}, "IMPORTS", True)
                        )
            return step

        for ce in sorted(next_edges, key=lambda x: x.line or 0)[:6]:
            if ce.target not in visited and ce.target in nodes_map:
                step.children.append(
                    expand_step(
                        ce.target,
                        depth + 1,
                        visited | {ce.target},
                        ce.type,
                        inferred or ce.inferred,
                    )
                )
        return step

    for node, reason, conf in entry_candidates[:8]:
        if node.id in seen_entry_ids:
            continue
        seen_entry_ids.add(node.id)
        root_step = expand_step(node.id, 0, {node.id}, "ENTRY", conf == "inferred")
        flows.append(
            ExecutionFlowEntry(
                entry_id=node.id,
                name=node.label,
                file_path=node.file_path,
                line_start=node.line_start,
                reason=reason,
                confidence=conf,  # type: ignore
                steps=[root_step],
            )
        )

    return ExecutionFlowResponse(entry_points=flows, total_flows=len(flows))


def compute_impact_analysis(graph_dict: Dict[str, Any], target_node_id: str) -> ImpactReport:
    nodes_map: Dict[str, GraphNode] = {n["id"]: GraphNode(**n) for n in graph_dict["nodes"]}
    if target_node_id not in nodes_map:
        raise ValueError(f"Node '{target_node_id}' not found in analysed graph.")

    target = nodes_map[target_node_id]

    # Build reverse dependency adjacency: target_id -> list of (dependent_id, edge_type, inferred)
    rev_adj: Dict[str, List[Tuple[str, str, bool]]] = defaultdict(list)
    for e in graph_dict["edges"]:
        etype = e["type"]
        if etype in {"CALLS", "IMPORTS", "DEPENDS_ON", "INHERITS"}:
            rev_adj[e["target"]].append((e["source"], etype, bool(e.get("inferred", False))))
        elif etype == "CONTAINS":
            # Skip CONTAINS upward propagation from cluttering file->method unless needed
            pass

    # If target is a file, also seed traversal from symbols contained inside that file
    seed_nodes: List[Tuple[str, List[str], bool]] = [(target_node_id, [target_node_id], False)]
    if target.type == "file":
        for e in graph_dict["edges"]:
            if e["type"] == "CONTAINS" and e["source"] == target_node_id:
                child_id = e["target"]
                if child_id in nodes_map:
                    seed_nodes.append((child_id, [target_node_id, child_id], False))

    visited_best: Dict[str, Tuple[int, bool, List[str], str]] = {}
    queue: deque = deque()

    for s_id, s_path, s_inf in seed_nodes:
        for dep_id, etype, e_inf in rev_adj.get(s_id, []):
            if dep_id == target_node_id:
                continue
            path_inf = s_inf or e_inf
            dist = 1
            reason = f"{etype} dependency on {nodes_map[s_id].label}"
            prev = visited_best.get(dep_id)
            if not prev or (dist < prev[0]) or (dist == prev[0] and prev[1] and not path_inf):
                new_path = s_path + [dep_id]
                visited_best[dep_id] = (dist, path_inf, new_path, reason)
                queue.append((dep_id, dist, path_inf, new_path))

    while queue:
        curr_id, dist, curr_inf, curr_path = queue.popleft()
        if dist >= 5:
            continue
        for dep_id, etype, e_inf in rev_adj.get(curr_id, []):
            if dep_id == target_node_id or dep_id in curr_path:
                continue
            new_dist = dist + 1
            new_inf = curr_inf or e_inf
            reason = f"Transitive {etype} via {nodes_map[curr_id].label}"
            prev = visited_best.get(dep_id)
            if not prev or (new_dist < prev[0]) or (new_dist == prev[0] and prev[1] and not new_inf):
                new_path = curr_path + [dep_id]
                visited_best[dep_id] = (new_dist, new_inf, new_path, reason)
                queue.append((dep_id, new_dist, new_inf, new_path))

    direct_impacts: List[ImpactItem] = []
    indirect_impacts: List[ImpactItem] = []
    uncertain_impacts: List[ImpactItem] = []
    affected_files: Set[str] = set()

    for dep_id, (dist, is_inf, path, reason) in sorted(visited_best.items(), key=lambda x: (x[1][0], x[0])):
        n = nodes_map[dep_id]
        affected_files.add(n.file_path)
        level = "uncertain" if is_inf else ("direct" if dist == 1 else "indirect")
        item = ImpactItem(
            node_id=n.id,
            name=n.label,
            type=n.type,
            file_path=n.file_path,
            line_start=n.line_start,
            impact_level=level,  # type: ignore
            distance=dist,
            path=path,
            path_labels=[nodes_map[p].label for p in path if p in nodes_map],
            reason=reason,
        )
        if level == "direct":
            direct_impacts.append(item)
        elif level == "indirect":
            indirect_impacts.append(item)
        else:
            uncertain_impacts.append(item)

    total_affected = len(direct_impacts) + len(indirect_impacts) + len(uncertain_impacts)
    if total_affected >= 10 or len(direct_impacts) >= 5:
        risk = "critical"
    elif total_affected >= 5 or len(direct_impacts) >= 3:
        risk = "high"
    elif total_affected >= 2:
        risk = "medium"
    else:
        risk = "low"

    summary = (
        f"Modifying '{target.label}' ({target.file_path}:{target.line_start}) "
        f"has {len(direct_impacts)} direct, {len(indirect_impacts)} indirect, and "
        f"{len(uncertain_impacts)} uncertain dependent(s) across {len(affected_files)} file(s)."
    )

    return ImpactReport(
        target=target,
        direct_impacts=direct_impacts,
        indirect_impacts=indirect_impacts,
        uncertain_impacts=uncertain_impacts,
        total_affected=total_affected,
        affected_files=sorted(affected_files),
        risk_level=risk,  # type: ignore
        summary=summary,
    )

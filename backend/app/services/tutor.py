import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config import GEMINI_API_KEY, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
from app.models.schemas import ChatResponse, Citation
from app.services.analyzer import compute_impact_analysis


def _read_snippet(root_path: Path, rel_path: str, line_start: int, window: int = 8) -> str:
    target = root_path / rel_path
    if not target.exists() or not target.is_file():
        return ""
    try:
        lines = target.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return ""
    start = max(0, line_start - 2)
    end = min(len(lines), line_start + window)
    numbered = [f"{i + 1}: {lines[i]}" for i in range(start, end)]
    return "\n".join(numbered)


def _retrieve_context(
    question: str,
    root_path: Path,
    analysis_blob: Dict[str, Any],
    focus_node_id: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Citation]]:
    graph = analysis_blob["graph"]
    nodes = graph["nodes"]
    edges = graph["edges"]

    tokens = [t.lower() for t in re.findall(r"[A-Za-z0-9_]+", question) if len(t) >= 2]
    scored_nodes: List[Tuple[int, Dict[str, Any]]] = []

    for n in nodes:
        score = 0
        if focus_node_id and n["id"] == focus_node_id:
            score += 50
        name_low = n["name"].lower()
        label_low = n["label"].lower()
        path_low = n["file_path"].lower()
        doc_low = (n.get("docstring") or "").lower()

        for tok in tokens:
            if tok == name_low:
                score += 20
            elif tok in name_low:
                score += 10
            if tok in label_low:
                score += 6
            if tok in path_low:
                score += 5
            if tok in doc_low:
                score += 3

        if score > 0:
            scored_nodes.append((score, n))

    scored_nodes.sort(key=lambda x: (x[0], x[1]["metrics"]["in_degree"] + x[1]["metrics"]["out_degree"]), reverse=True)
    top_nodes = [n for _, n in scored_nodes[:8]]

    # If query is very general (e.g. "explain architecture"), add top hub nodes
    if len(top_nodes) < 4:
        hubs = sorted(
            nodes,
            key=lambda n: n["metrics"]["in_degree"] + n["metrics"]["out_degree"],
            reverse=True,
        )
        seen = {n["id"] for n in top_nodes}
        for h in hubs:
            if h["id"] not in seen:
                top_nodes.append(h)
                seen.add(h["id"])
            if len(top_nodes) >= 6:
                break

    top_ids = {n["id"] for n in top_nodes}
    related_edges = [
        e for e in edges
        if e["source"] in top_ids or e["target"] in top_ids
    ][:40]

    citations: List[Citation] = []
    seen_cite = set()
    for n in top_nodes[:5]:
        key = (n["file_path"], n["line_start"])
        if key not in seen_cite:
            seen_cite.add(key)
            citations.append(
                Citation(
                    file_path=n["file_path"],
                    line=n["line_start"],
                    symbol=n["label"],
                    snippet=_read_snippet(root_path, n["file_path"], n["line_start"], window=6),
                )
            )

    return top_nodes, related_edges, citations


def _deterministic_local_answer(
    question: str,
    root_path: Path,
    analysis_blob: Dict[str, Any],
    top_nodes: List[Dict[str, Any]],
    related_edges: List[Dict[str, Any]],
    citations: List[Citation],
) -> ChatResponse:
    summary = analysis_blob["summary"]
    graph = analysis_blob["graph"]
    exec_flow = analysis_blob["execution_flow"]
    nodes_by_id = {n["id"]: n for n in graph["nodes"]}

    q_low = question.lower()
    facts: List[str] = []
    inferences: List[str] = []
    sections: List[str] = []

    # 1. Entry points / where execution begins
    if any(k in q_low for k in ["begin", "start", "entry", "execution", "bootstrap", "startup", "run"]):
        eps = summary.get("entry_points", [])
        flows = exec_flow.get("entry_points", [])
        if eps or flows:
            lines = ["### Execution Entry Points"]
            for ep in eps[:5]:
                lines.append(f"- `{ep['file_path']}:1` — **{ep['name']}** ({ep['reason']})")
                facts.append(f"Detected entry file {ep['file_path']}: {ep['reason']}")
            for fl in flows[:3]:
                root_step = fl["steps"][0] if fl["steps"] else None
                if root_step and root_step.get("children"):
                    child_names = ", ".join(f"`{c['name']}` (`{c['file_path']}:{c['line_start']}`)" for c in root_step["children"][:4])
                    lines.append(f"- Flow from `{fl['name']}` (`{fl['file_path']}:{fl['line_start']}`) -> {child_names}")
            sections.append("\n".join(lines))

    # 2. Caller / callee / modify / impact questions
    if any(k in q_low for k in ["call", "calls", "caller", "modify", "change", "affect", "impact", "break", "depend"]):
        target = next((n for n in top_nodes if n["type"] in {"function", "method", "file", "class"}), None)
        if target:
            callers = [
                (nodes_by_id[e["source"]], e)
                for e in graph["edges"]
                if e["target"] == target["id"] and e["type"] in {"CALLS", "IMPORTS", "DEPENDS_ON"} and e["source"] in nodes_by_id
            ]
            callees = [
                (nodes_by_id[e["target"]], e)
                for e in graph["edges"]
                if e["source"] == target["id"] and e["type"] in {"CALLS", "IMPORTS", "DEPENDS_ON"} and e["target"] in nodes_by_id
            ]
            lines = [f"### Relationships for `{target['label']}` (`{target['file_path']}:{target['line_start']}`)"]
            if callers:
                lines.append("**Incoming Callers / Dependents:**")
                for src, edge in callers[:8]:
                    tag = " *(inferred)*" if edge.get("inferred") else ""
                    lines.append(f"- `{src['label']}` in `{src['file_path']}:{edge.get('line') or src['line_start']}` via `{edge['type']}`{tag}")
                    (inferences if edge.get("inferred") else facts).append(
                        f"{src['label']} ({src['file_path']}) {edge['type']} {target['label']}"
                    )
            else:
                lines.append("- No incoming callers or importers were detected in the static graph.")

            if callees:
                lines.append("\n**Outgoing Calls / Imports:**")
                for tgt, edge in callees[:8]:
                    tag = " *(inferred)*" if edge.get("inferred") else ""
                    lines.append(f"- `{tgt['label']}` in `{tgt['file_path']}:{tgt['line_start']}` via `{edge['type']}`{tag}")

            if any(k in q_low for k in ["modify", "change", "affect", "impact", "break"]):
                try:
                    impact = compute_impact_analysis(graph, target["id"])
                    lines.append(f"\n**Impact Assessment ({impact.risk_level.upper()} risk):** {impact.summary}")
                    if impact.direct_impacts:
                        lines.append("- Direct impacts: " + ", ".join(f"`{i.name}` (`{i.file_path}:{i.line_start}`)" for i in impact.direct_impacts[:5]))
                    if impact.indirect_impacts:
                        lines.append("- Indirect impacts: " + ", ".join(f"`{i.name}` (`{i.file_path}:{i.line_start}`)" for i in impact.indirect_impacts[:5]))
                    if impact.uncertain_impacts:
                        inferences.append(f"{len(impact.uncertain_impacts)} uncertain impact(s) traverse inferred static-analysis edges.")
                except Exception:
                    pass
            sections.append("\n".join(lines))

    # 3. Architecture / overview / workflow / specific topic retrieval
    if not sections or any(k in q_low for k in ["architecture", "overview", "structure", "how", "work", "explain", "database", "auth", "upload", "payment"]):
        langs = ", ".join(f"{l['language']} ({l['files']} files)" for l in summary.get("languages", [])[:4])
        fws = ", ".join(summary.get("frameworks", [])) or "Standard library / custom modules"
        lines = [
            f"### Repository Architecture Summary (`{summary['project_name']}`)",
            f"- **Scale:** {summary['total_files']} files, {summary['total_functions']} functions, {summary['total_classes']} classes, {summary['total_methods']} methods, {summary['total_dependencies']} module dependencies, {summary['total_calls']} function calls.",
            f"- **Languages & Frameworks:** {langs}. Detected frameworks: {fws}.",
        ]
        facts.append(f"Repository has {summary['total_files']} files and {summary['total_dependencies']} import dependencies.")

        hubs = summary.get("most_connected_modules", [])[:4]
        if hubs:
            lines.append("- **Core Hubs:** " + ", ".join(f"`{h['file_path']}` ({h['total_connections']} connections)" for h in hubs))

        if top_nodes:
            lines.append("\n### Relevant Components Found")
            for n in top_nodes[:5]:
                doc = f" — {n['docstring'].splitlines()[0][:100]}" if n.get("docstring") else ""
                lines.append(f"- `{n['label']}` (`{n['type']}`) at `{n['file_path']}:{n['line_start']}`{doc}")
                facts.append(f"Symbol {n['label']} is defined at {n['file_path']}:{n['line_start']}.")

        sections.append("\n".join(lines))

    if citations and citations[0].snippet:
        c0 = citations[0]
        sections.append(f"### Source Preview (`{c0.file_path}:{c0.line}`)\n```\n{c0.snippet}\n```")

    if not inferences:
        inferences.append("Static AST and import resolution cannot guarantee dynamic runtime dispatch order without execution traces.")

    header_notice = "> **[Local Retrieval & Graph Fallback]** Generated deterministically from parsed AST symbols, NetworkX dependency graph, and local source snippets (no external LLM API key configured).\n\n"
    answer = header_notice + "\n\n".join(sections)

    return ChatResponse(
        answer=answer,
        mode="local_fallback",
        model_label="Local Graph + AST Retriever",
        citations=citations,
        facts=facts[:6],
        inferences=inferences[:4],
        related_node_ids=[n["id"] for n in top_nodes[:6]],
    )


async def answer_codebase_question(
    question: str,
    root_path: Path,
    analysis_blob: Dict[str, Any],
    history: List[Dict[str, str]],
    focus_node_id: Optional[str] = None,
) -> ChatResponse:
    top_nodes, related_edges, citations = _retrieve_context(question, root_path, analysis_blob, focus_node_id)

    # Attempt OpenAI-compatible or Gemini API only if explicitly configured
    if LLM_API_KEY:
        try:
            return await _call_openai_compatible(question, analysis_blob, top_nodes, related_edges, citations, history)
        except Exception:
            pass
    elif GEMINI_API_KEY:
        try:
            return await _call_gemini(question, analysis_blob, top_nodes, related_edges, citations)
        except Exception:
            pass

    return _deterministic_local_answer(question, root_path, analysis_blob, top_nodes, related_edges, citations)


def _build_llm_context_prompt(
    question: str,
    analysis_blob: Dict[str, Any],
    top_nodes: List[Dict[str, Any]],
    related_edges: List[Dict[str, Any]],
    citations: List[Citation],
) -> str:
    summary = analysis_blob["summary"]
    nodes_by_id = {n["id"]: n for n in analysis_blob["graph"]["nodes"]}
    node_lines = [
        f"- [{n['type']}] {n['label']} at {n['file_path']}:{n['line_start']} (in={n['metrics']['in_degree']}, out={n['metrics']['out_degree']})"
        for n in top_nodes
    ]
    edge_lines = []
    for e in related_edges[:25]:
        s = nodes_by_id.get(e["source"], {}).get("label", e["source"])
        t = nodes_by_id.get(e["target"], {}).get("label", e["target"])
        edge_lines.append(f"- {s} --{e['type']}--> {t} (inferred={e.get('inferred', False)})")
    snippets = "\n\n".join(
        f"File {c.file_path}:{c.line}\n```\n{c.snippet}\n```" for c in citations if c.snippet
    )
    return (
        f"Project: {summary['project_name']} | Files: {summary['total_files']} | Functions: {summary['total_functions']} | Classes: {summary['total_classes']}\n"
        f"Relevant Graph Nodes:\n" + "\n".join(node_lines) + "\n\n"
        f"Graph Relationships:\n" + "\n".join(edge_lines) + "\n\n"
        f"Source Snippets:\n{snippets}\n\n"
        f"Question: {question}\n"
        "Instructions: Answer strictly from the provided repository context. Cite exact file:line references. Never invent functions or edges. Clearly separate confirmed facts from static-analysis assumptions."
    )


async def _call_openai_compatible(
    question: str,
    analysis_blob: Dict[str, Any],
    top_nodes: List[Dict[str, Any]],
    related_edges: List[Dict[str, Any]],
    citations: List[Citation],
    history: List[Dict[str, str]],
) -> ChatResponse:
    prompt = _build_llm_context_prompt(question, analysis_blob, top_nodes, related_edges, citations)
    messages = [
        {"role": "system", "content": "You are an expert codebase intelligence assistant. Ground every claim in the supplied AST & graph context with file:line citations."},
        *history[-4:],
        {"role": "user", "content": prompt},
    ]
    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.post(
            f"{LLM_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"},
            json={"model": LLM_MODEL, "messages": messages, "temperature": 0.2},
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["message"]["content"]

    return ChatResponse(
        answer=text,
        mode="llm",
        model_label=LLM_MODEL,
        citations=citations,
        facts=[f"Context grounded across {len(top_nodes)} retrieved nodes and {len(citations)} source snippets."],
        inferences=["LLM synthesis based on static AST and graph edges."],
        related_node_ids=[n["id"] for n in top_nodes[:6]],
    )


async def _call_gemini(
    question: str,
    analysis_blob: Dict[str, Any],
    top_nodes: List[Dict[str, Any]],
    related_edges: List[Dict[str, Any]],
    citations: List[Citation],
) -> ChatResponse:
    prompt = _build_llm_context_prompt(question, analysis_blob, top_nodes, related_edges, citations)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
        resp.raise_for_status()
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]

    return ChatResponse(
        answer=text,
        mode="llm",
        model_label="gemini-2.0-flash",
        citations=citations,
        facts=[f"Context grounded across {len(top_nodes)} retrieved nodes."],
        inferences=["LLM synthesis based on static AST and graph edges."],
        related_node_ids=[n["id"] for n in top_nodes[:6]],
    )

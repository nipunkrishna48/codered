import ast
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from app.config import LANGUAGE_EXTENSIONS

# Attempt optional Tree-sitter imports cleanly
_TS_AVAILABLE = False
_TS_LANGS: Dict[str, Any] = {}
try:
    from tree_sitter import Language, Parser  # type: ignore

    try:
        import tree_sitter_javascript as tsjs  # type: ignore
        _TS_LANGS["JavaScript"] = Language(tsjs.language())
        _TS_LANGS["JavaScript (React)"] = Language(tsjs.language())
    except Exception:
        pass
    try:
        import tree_sitter_typescript as tsts  # type: ignore
        _TS_LANGS["TypeScript"] = Language(tsts.language_typescript())
        _TS_LANGS["TypeScript (React)"] = Language(tsts.language_tsx())
    except Exception:
        pass
    try:
        import tree_sitter_java as tsjava  # type: ignore
        _TS_LANGS["Java"] = Language(tsjava.language())
    except Exception:
        pass
    if _TS_LANGS:
        _TS_AVAILABLE = True
except Exception:
    _TS_AVAILABLE = False


@dataclass
class ParsedCall:
    name: str
    qualifier: Optional[str] = None
    line: int = 1
    inferred: bool = False


@dataclass
class ParsedSymbol:
    name: str
    kind: str  # "class" | "function" | "method"
    line_start: int
    line_end: int
    parent_class: Optional[str] = None
    signature: Optional[str] = None
    docstring: Optional[str] = None
    decorators: List[str] = field(default_factory=list)
    bases: List[str] = field(default_factory=list)
    calls: List[ParsedCall] = field(default_factory=list)
    inferred: bool = False


@dataclass
class ParsedImport:
    module: str
    names: List[str] = field(default_factory=list)
    alias_map: Dict[str, str] = field(default_factory=dict)  # local_name -> original target
    line: int = 1
    is_relative: bool = False
    level: int = 0


@dataclass
class ParsedFile:
    rel_path: str
    language: str
    lines_of_code: int
    size: int
    imports: List[ParsedImport] = field(default_factory=list)
    symbols: List[ParsedSymbol] = field(default_factory=list)
    module_calls: List[ParsedCall] = field(default_factory=list)
    is_entry_point: bool = False
    entry_reason: Optional[str] = None
    frameworks: Set[str] = field(default_factory=set)
    is_config: bool = False
    parse_method: str = "fallback"


CONFIG_FILENAMES = {
    "package.json",
    "tsconfig.json",
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "setup.cfg",
    "pom.xml",
    "build.gradle",
    "Cargo.toml",
    "go.mod",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".env.example",
    "vite.config.ts",
    "vite.config.js",
    "tailwind.config.js",
    "tailwind.config.ts",
}

PYTHON_BUILTINS = {
    "print", "len", "range", "enumerate", "zip", "map", "filter", "sorted",
    "list", "dict", "set", "tuple", "str", "int", "float", "bool", "isinstance",
    "issubclass", "hasattr", "getattr", "setattr", "open", "super", "type",
    "min", "max", "sum", "any", "all", "abs", "round", "repr", "id", "hash",
    "ValueError", "TypeError", "RuntimeError", "KeyError", "Exception", "HTTPException",
    "append", "extend", "get", "items", "keys", "values", "update", "pop",
    "join", "split", "strip", "replace", "format", "startswith", "endswith",
    "lower", "upper", "encode", "decode", "info", "warning", "error", "debug",
}


def detect_language(path: Path) -> str:
    if path.name == "Dockerfile":
        return "Dockerfile"
    return LANGUAGE_EXTENSIONS.get(path.suffix.lower(), "Plain Text")


def _extract_python_call_name(node: ast.Call) -> Tuple[Optional[str], Optional[str]]:
    func = node.func
    if isinstance(func, ast.Name):
        return func.id, None
    if isinstance(func, ast.Attribute):
        attr_name = func.attr
        if isinstance(func.value, ast.Name):
            return attr_name, func.value.id
        if isinstance(func.value, ast.Attribute):
            return attr_name, func.value.attr
        return attr_name, None
    return None, None


class _PythonCallVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.calls: List[ParsedCall] = []

    def visit_Call(self, node: ast.Call) -> None:
        name, qualifier = _extract_python_call_name(node)
        if name and name not in PYTHON_BUILTINS:
            self.calls.append(ParsedCall(name=name, qualifier=qualifier, line=getattr(node, "lineno", 1), inferred=False))
        self.generic_visit(node)


def _format_py_decorator(dec: ast.expr) -> str:
    try:
        return ast.unparse(dec)
    except Exception:
        if isinstance(dec, ast.Name):
            return dec.id
        return "decorator"


def _format_py_args(args: ast.arguments) -> str:
    parts = [a.arg for a in args.args]
    if args.vararg:
        parts.append(f"*{args.vararg.arg}")
    if args.kwarg:
        parts.append(f"**{args.kwarg.arg}")
    return ", ".join(parts)


def parse_python_file(rel_path: str, content: str, size: int) -> ParsedFile:
    lines = content.splitlines()
    pf = ParsedFile(
        rel_path=rel_path,
        language="Python",
        lines_of_code=len(lines),
        size=size,
        is_config=Path(rel_path).name in CONFIG_FILENAMES,
        parse_method="python_ast",
    )

    try:
        tree = ast.parse(content, filename=rel_path)
    except SyntaxError:
        return parse_regex_fallback(rel_path, content, size, "Python")

    # Detect frameworks from imports & decorators
    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                local_name = alias.asname or alias.name.split(".")[0]
                pf.imports.append(
                    ParsedImport(
                        module=alias.name,
                        names=[alias.name],
                        alias_map={local_name: alias.name},
                        line=node.lineno,
                    )
                )
                _detect_py_framework(alias.name, pf.frameworks)

        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            names = [a.name for a in node.names]
            alias_map = {}
            for a in node.names:
                local = a.asname or a.name
                full_ref = f"{mod}.{a.name}" if mod else a.name
                alias_map[local] = full_ref
            pf.imports.append(
                ParsedImport(
                    module=mod,
                    names=names,
                    alias_map=alias_map,
                    line=node.lineno,
                    is_relative=(node.level or 0) > 0,
                    level=node.level or 0,
                )
            )
            _detect_py_framework(mod, pf.frameworks)

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            decs = [_format_py_decorator(d) for d in node.decorator_list]
            if any(re.search(r"\b(app|router|bp)\.(get|post|put|delete|patch|route)\b", d) for d in decs):
                pf.is_entry_point = True
                pf.entry_reason = pf.entry_reason or f"HTTP Route handler: @{decs[0]}"
            if node.name == "main":
                pf.is_entry_point = True
                pf.entry_reason = pf.entry_reason or "Defines main() entry function"

            visitor = _PythonCallVisitor()
            for stmt in node.body:
                visitor.visit(stmt)

            sig = f"{'async ' if isinstance(node, ast.AsyncFunctionDef) else ''}def {node.name}({_format_py_args(node.args)})"
            pf.symbols.append(
                ParsedSymbol(
                    name=node.name,
                    kind="function",
                    line_start=node.lineno,
                    line_end=getattr(node, "end_lineno", node.lineno) or node.lineno,
                    signature=sig,
                    docstring=ast.get_docstring(node),
                    decorators=decs,
                    calls=visitor.calls,
                    inferred=False,
                )
            )

        elif isinstance(node, ast.ClassDef):
            bases = []
            for b in node.bases:
                try:
                    bases.append(ast.unparse(b))
                except Exception:
                    pass
            decs = [_format_py_decorator(d) for d in node.decorator_list]
            pf.symbols.append(
                ParsedSymbol(
                    name=node.name,
                    kind="class",
                    line_start=node.lineno,
                    line_end=getattr(node, "end_lineno", node.lineno) or node.lineno,
                    signature=f"class {node.name}({', '.join(bases)})" if bases else f"class {node.name}",
                    docstring=ast.get_docstring(node),
                    decorators=decs,
                    bases=bases,
                    inferred=False,
                )
            )
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    m_decs = [_format_py_decorator(d) for d in item.decorator_list]
                    m_visitor = _PythonCallVisitor()
                    for stmt in item.body:
                        m_visitor.visit(stmt)
                    sig = f"{'async ' if isinstance(item, ast.AsyncFunctionDef) else ''}def {item.name}({_format_py_args(item.args)})"
                    pf.symbols.append(
                        ParsedSymbol(
                            name=item.name,
                            kind="method",
                            parent_class=node.name,
                            line_start=item.lineno,
                            line_end=getattr(item, "end_lineno", item.lineno) or item.lineno,
                            signature=sig,
                            docstring=ast.get_docstring(item),
                            decorators=m_decs,
                            calls=m_visitor.calls,
                            inferred=False,
                        )
                    )

        elif isinstance(node, ast.If):
            try:
                test_src = ast.unparse(node.test)
            except Exception:
                test_src = ""
            if "__name__" in test_src and "__main__" in test_src:
                pf.is_entry_point = True
                pf.entry_reason = "Contains if __name__ == '__main__' execution block"
                visitor = _PythonCallVisitor()
                for stmt in node.body:
                    visitor.visit(stmt)
                pf.module_calls.extend(visitor.calls)

        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            name, qualifier = _extract_python_call_name(node.value)
            if name and name not in PYTHON_BUILTINS:
                pf.module_calls.append(ParsedCall(name=name, qualifier=qualifier, line=node.lineno, inferred=False))

    if Path(rel_path).name in {"main.py", "app.py", "server.py", "run.py", "cli.py", "wsgi.py", "asgi.py"}:
        pf.is_entry_point = True
        pf.entry_reason = pf.entry_reason or f"Conventional application entry file ({Path(rel_path).name})"

    return pf


def _detect_py_framework(mod_name: str, frameworks: Set[str]) -> None:
    low = mod_name.lower()
    if "fastapi" in low:
        frameworks.add("FastAPI")
    elif "flask" in low:
        frameworks.add("Flask")
    elif "django" in low:
        frameworks.add("Django")
    elif "sqlalchemy" in low:
        frameworks.add("SQLAlchemy")
    elif "pydantic" in low:
        frameworks.add("Pydantic")
    elif "pytest" in low:
        frameworks.add("Pytest")
    elif "streamlit" in low:
        frameworks.add("Streamlit")


def _ts_walk_calls(node: Any, code_bytes: bytes, calls: List[ParsedCall]) -> None:
    if node.type == "call_expression":
        fn_node = node.child_by_field_name("function")
        if fn_node is not None:
            raw = code_bytes[fn_node.start_byte:fn_node.end_byte].decode("utf-8", errors="ignore")
            parts = raw.split(".")
            name = parts[-1].strip()
            qualifier = parts[-2].strip() if len(parts) > 1 else None
            if name and name not in {"log", "error", "warn", "map", "filter", "forEach", "push", "slice", "split", "join", "trim"}:
                calls.append(ParsedCall(name=name, qualifier=qualifier, line=node.start_point[0] + 1, inferred=False))
    for child in node.children:
        _ts_walk_calls(child, code_bytes, calls)


def parse_with_treesitter(rel_path: str, content: str, size: int, language: str) -> Optional[ParsedFile]:
    if not _TS_AVAILABLE or language not in _TS_LANGS:
        return None
    try:
        parser = Parser(_TS_LANGS[language])
        code_bytes = content.encode("utf-8", errors="ignore")
        tree = parser.parse(code_bytes)
        root = tree.root_node
    except Exception:
        return None

    lines = content.splitlines()
    pf = ParsedFile(
        rel_path=rel_path,
        language=language,
        lines_of_code=len(lines),
        size=size,
        is_config=Path(rel_path).name in CONFIG_FILENAMES,
        parse_method="tree_sitter",
    )

    def node_text(n: Any) -> str:
        return code_bytes[n.start_byte:n.end_byte].decode("utf-8", errors="ignore")

    def visit(node: Any, current_class: Optional[str] = None) -> None:
        ntype = node.type

        # JS/TS imports
        if ntype == "import_statement":
            src_node = node.child_by_field_name("source")
            if src_node:
                mod = node_text(src_node).strip("'\"")
                pf.imports.append(
                    ParsedImport(
                        module=mod,
                        names=[],
                        line=node.start_point[0] + 1,
                        is_relative=mod.startswith("."),
                    )
                )
                if "react" in mod.lower():
                    pf.frameworks.add("React")
                elif "express" in mod.lower():
                    pf.frameworks.add("Express")
                elif "next" in mod.lower():
                    pf.frameworks.add("Next.js")

        # Java imports
        elif ntype == "import_declaration":
            txt = node_text(node).replace("import", "").replace(";", "").strip()
            pf.imports.append(ParsedImport(module=txt, line=node.start_point[0] + 1))
            if "springframework" in txt.lower():
                pf.frameworks.add("Spring Boot")

        # Classes
        elif ntype in {"class_declaration", "class"}:
            name_node = node.child_by_field_name("name")
            if name_node:
                cname = node_text(name_node)
                pf.symbols.append(
                    ParsedSymbol(
                        name=cname,
                        kind="class",
                        line_start=node.start_point[0] + 1,
                        line_end=node.end_point[0] + 1,
                        signature=f"class {cname}",
                        inferred=False,
                    )
                )
                for ch in node.children:
                    visit(ch, current_class=cname)
                return

        # Functions / Methods
        elif ntype in {"function_declaration", "method_declaration", "method_definition"}:
            name_node = node.child_by_field_name("name")
            if name_node:
                fname = node_text(name_node)
                calls: List[ParsedCall] = []
                body = node.child_by_field_name("body")
                if body:
                    _ts_walk_calls(body, code_bytes, calls)
                kind = "method" if (current_class or ntype in {"method_declaration", "method_definition"}) else "function"
                pf.symbols.append(
                    ParsedSymbol(
                        name=fname,
                        kind=kind,
                        parent_class=current_class,
                        line_start=node.start_point[0] + 1,
                        line_end=node.end_point[0] + 1,
                        signature=f"{fname}(...)",
                        calls=calls,
                        inferred=False,
                    )
                )
                if fname == "main":
                    pf.is_entry_point = True
                    pf.entry_reason = "Defines main() entry function"
                return

        # Arrow functions assigned to const/let/var
        elif ntype == "variable_declarator":
            name_node = node.child_by_field_name("name")
            val_node = node.child_by_field_name("value")
            if name_node and val_node and val_node.type in {"arrow_function", "function_expression", "function"}:
                fname = node_text(name_node)
                calls = []
                _ts_walk_calls(val_node, code_bytes, calls)
                pf.symbols.append(
                    ParsedSymbol(
                        name=fname,
                        kind="function",
                        line_start=node.start_point[0] + 1,
                        line_end=node.end_point[0] + 1,
                        signature=f"const {fname} = (...) =>",
                        calls=calls,
                        inferred=False,
                    )
                )
                return

        for ch in node.children:
            visit(ch, current_class=current_class)

    visit(root)

    fname_low = Path(rel_path).name.lower()
    if fname_low in {"index.ts", "index.tsx", "index.js", "index.jsx", "main.ts", "main.tsx", "app.ts", "app.tsx", "server.ts", "server.js"}:
        pf.is_entry_point = True
        pf.entry_reason = pf.entry_reason or f"Application entry module ({Path(rel_path).name})"

    return pf


def parse_regex_fallback(rel_path: str, content: str, size: int, language: str) -> ParsedFile:
    lines = content.splitlines()
    pf = ParsedFile(
        rel_path=rel_path,
        language=language,
        lines_of_code=len(lines),
        size=size,
        is_config=Path(rel_path).name in CONFIG_FILENAMES,
        parse_method="regex_fallback",
    )

    # Extract imports
    import_patterns = [
        re.compile(r"^\s*import\s+.*?\s+from\s+['\"]([^'\"]+)['\"]"),
        re.compile(r"^\s*import\s+['\"]([^'\"]+)['\"]"),
        re.compile(r"require\(['\"]([^'\"]+)['\"]\)"),
        re.compile(r"^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+"),
        re.compile(r"^\s*import\s+([A-Za-z0-9_.]+)"),
        re.compile(r"^\s*#include\s+[<\"]([^>\"]+)[>\"]"),
    ]
    class_pattern = re.compile(r"^\s*(?:export\s+(?:default\s+)?)?(?:public\s+|private\s+|abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)")
    func_patterns = [
        re.compile(r"^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("),
        re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>"),
        re.compile(r"^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("),
        re.compile(r"^\s*func\s+(?:\([^)]*\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\("),
        re.compile(r"^\s*(?:public|private|protected|static|\s)+[A-Za-z0-9_<>\[\]]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("),
    ]
    call_pattern = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(")
    skip_calls = {"if", "for", "while", "switch", "catch", "return", "function", "def", "class", "new", "typeof", "sizeof"}

    current_symbol: Optional[ParsedSymbol] = None

    for idx, line in enumerate(lines, start=1):
        for pat in import_patterns:
            m = pat.search(line)
            if m:
                mod = m.group(1)
                pf.imports.append(ParsedImport(module=mod, line=idx, is_relative=mod.startswith(".")))
                break

        cm = class_pattern.match(line)
        if cm:
            cname = cm.group(1)
            sym = ParsedSymbol(
                name=cname,
                kind="class",
                line_start=idx,
                line_end=idx,
                signature=line.strip()[:80],
                inferred=True,
            )
            pf.symbols.append(sym)
            current_symbol = sym
            continue

        matched_func = False
        for fp in func_patterns:
            fm = fp.match(line)
            if fm:
                fname = fm.group(1)
                if fname in skip_calls:
                    continue
                sym = ParsedSymbol(
                    name=fname,
                    kind="function",
                    line_start=idx,
                    line_end=idx,
                    signature=line.strip()[:80],
                    inferred=True,
                )
                pf.symbols.append(sym)
                current_symbol = sym
                if fname == "main":
                    pf.is_entry_point = True
                    pf.entry_reason = "Defines main() function (regex detected)"
                matched_func = True
                break
        if matched_func:
            continue

        for cm_call in call_pattern.finditer(line):
            callee = cm_call.group(1)
            if callee not in skip_calls and callee not in PYTHON_BUILTINS:
                call_obj = ParsedCall(name=callee, line=idx, inferred=True)
                if current_symbol and current_symbol.kind in {"function", "method"}:
                    current_symbol.calls.append(call_obj)
                else:
                    pf.module_calls.append(call_obj)

    if Path(rel_path).name.lower() in {"main.py", "main.go", "main.rs", "index.ts", "index.js", "app.ts", "app.js", "server.js", "server.ts"}:
        pf.is_entry_point = True
        pf.entry_reason = pf.entry_reason or f"Conventional entry file ({Path(rel_path).name})"

    return pf


def parse_source_file(rel_path: str, abs_path: Path) -> Optional[ParsedFile]:
    try:
        size = abs_path.stat().st_size
    except OSError:
        return None

    language = detect_language(abs_path)

    # Read up to MAX_FILE_READ_BYTES safely
    try:
        raw = abs_path.read_bytes()
        # Check for binary content
        if b"\x00" in raw[:4096]:
            return None
        content = raw[:512 * 1024].decode("utf-8", errors="ignore")
    except OSError:
        return None

    if language == "Python":
        return parse_python_file(rel_path, content, size)

    if language in _TS_LANGS:
        ts_res = parse_with_treesitter(rel_path, content, size, language)
        if ts_res is not None:
            return ts_res

    if language in {"JavaScript", "JavaScript (React)", "TypeScript", "TypeScript (React)", "Java", "Go", "Rust", "C++", "C", "C#", "Ruby", "PHP"}:
        return parse_regex_fallback(rel_path, content, size, language)

    # Non-code / config / docs file
    lines_count = len(content.splitlines())
    pf = ParsedFile(
        rel_path=rel_path,
        language=language,
        lines_of_code=lines_count,
        size=size,
        is_config=abs_path.name in CONFIG_FILENAMES,
        parse_method="metadata_only",
    )
    if abs_path.name == "package.json":
        if '"react"' in content:
            pf.frameworks.add("React")
        if '"next"' in content:
            pf.frameworks.add("Next.js")
        if '"express"' in content:
            pf.frameworks.add("Express")
        if '"vite"' in content:
            pf.frameworks.add("Vite")
    elif abs_path.name in {"requirements.txt", "pyproject.toml"}:
        low = content.lower()
        for fw_key, fw_label in [("fastapi", "FastAPI"), ("flask", "Flask"), ("django", "Django"), ("sqlalchemy", "SQLAlchemy"), ("networkx", "NetworkX")]:
            if fw_key in low:
                pf.frameworks.add(fw_label)
    return pf

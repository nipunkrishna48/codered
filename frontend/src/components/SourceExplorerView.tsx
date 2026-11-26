import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode2,
  Folder,
  FolderOpen,
  Loader2,
  Search,
} from "lucide-react";
import { api } from "../api/client";
import type { FileContentResponse, FileTreeNode } from "../types/api";

interface SourceExplorerViewProps {
  projectId: string;
  fileTree: FileTreeNode[];
  targetFile?: string | null;
  targetLine?: number | null;
}

function mapMonacoLang(lang: string, path: string): string {
  const low = lang.toLowerCase();
  if (low.includes("python")) return "python";
  if (low.includes("typescript")) return "typescript";
  if (low.includes("javascript")) return "javascript";
  if (low.includes("java")) return "java";
  if (low.includes("json")) return "json";
  if (low.includes("yaml")) return "yaml";
  if (low.includes("markdown") || path.endsWith(".md")) return "markdown";
  if (low.includes("html")) return "html";
  if (low.includes("css")) return "css";
  if (low.includes("sql")) return "sql";
  if (low.includes("go")) return "go";
  if (low.includes("rust")) return "rust";
  return "plaintext";
}

function findFirstFile(nodes: FileTreeNode[]): string | null {
  for (const n of nodes) {
    if (n.type === "file") return n.path;
    if (n.children) {
      const found = findFirstFile(n.children);
      if (found) return found;
    }
  }
  return null;
}

const TreeItem: React.FC<{
  node: FileTreeNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  searchQuery: string;
  depth?: number;
}> = ({ node, selectedPath, onSelect, searchQuery, depth = 0 }) => {
  const [open, setOpen] = useState(true);

  const matchesSearch = (n: FileTreeNode): boolean => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (n.path.toLowerCase().includes(q)) return true;
    return Boolean(n.children?.some(matchesSearch));
  };

  if (!matchesSearch(node)) return null;

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-1.5 py-1 px-2 rounded text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
          {open ? (
            <FolderOpen className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          )}
          <span className="truncate font-mono text-[11px]">{node.name}</span>
        </button>
        {open && node.children?.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            selectedPath={selectedPath}
            onSelect={onSelect}
            searchQuery={searchQuery}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  const active = selectedPath === node.path;
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`w-full flex items-center justify-between gap-2 py-1 px-2 rounded text-xs transition-colors ${
        active
          ? "bg-violet-600/20 text-violet-200 border border-violet-500/30"
          : "text-zinc-300 hover:bg-white/[0.04]"
      }`}
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <FileCode2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="truncate font-mono text-[11px]">{node.name}</span>
      </div>
      {node.symbol_count > 0 && (
        <span className="text-[9px] font-mono text-zinc-500 shrink-0">{node.symbol_count}</span>
      )}
    </button>
  );
};

export const SourceExplorerView: React.FC<SourceExplorerViewProps> = ({
  projectId,
  fileTree,
  targetFile,
  targetLine,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [activeLine, setActiveLine] = useState<number>(1);
  const [search, setSearch] = useState("");
  const [fileData, setFileData] = useState<FileContentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    if (targetFile) {
      setSelectedPath(targetFile);
      setActiveLine(targetLine || 1);
    } else if (!selectedPath) {
      const first = findFirstFile(fileTree);
      if (first) setSelectedPath(first);
    }
  }, [targetFile, targetLine, fileTree, selectedPath]);

  useEffect(() => {
    if (!selectedPath) return;
    setLoading(true);
    setError(null);
    api
      .getFileContent(projectId, selectedPath)
      .then((res) => setFileData(res))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load file."))
      .finally(() => setLoading(false));
  }, [projectId, selectedPath]);

  const highlightLine = useMemo(
    () => (line: number) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco || line < 1) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: "bg-violet-500/20 border-l-2 border-amber-400",
          },
        },
      ]);
    },
    []
  );

  useEffect(() => {
    if (fileData && activeLine > 1) {
      setTimeout(() => highlightLine(activeLine), 80);
    }
  }, [fileData, activeLine, highlightLine]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    if (activeLine > 1) {
      highlightLine(activeLine);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-[#07070b] overflow-hidden">
      {/* File Tree Sidebar */}
      <div className="w-64 sm:w-72 border-r border-white/[0.07] bg-[#0a0b10] flex flex-col">
        <div className="p-3 border-b border-white/[0.06]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repository files..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#12131c] border border-white/[0.08] text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {fileTree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              selectedPath={selectedPath}
              onSelect={(p) => {
                setSelectedPath(p);
                setActiveLine(1);
              }}
              searchQuery={search}
            />
          ))}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top File Header + Symbol Jump */}
        <div className="px-4 py-2.5 border-b border-white/[0.06] bg-[#0d0e14] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Code2 className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-xs font-mono text-zinc-100 truncate">
              {fileData?.path || selectedPath || "Select a file"}
            </span>
            {fileData && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] text-zinc-400">
                {fileData.language} • {fileData.lines} lines
              </span>
            )}
          </div>

          {fileData && fileData.symbols.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-md">
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Symbols:</span>
              {fileData.symbols.slice(0, 6).map((sym) => (
                <button
                  key={sym.id}
                  onClick={() => {
                    setActiveLine(sym.line_start);
                    highlightLine(sym.line_start);
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#12131c] border border-white/[0.07] hover:border-violet-500/40 text-zinc-300 shrink-0"
                >
                  {sym.label} :{sym.line_start}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Monaco Container */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              Loading source code...
            </div>
          ) : error ? (
            <div className="p-6 text-xs text-rose-300">{error}</div>
          ) : fileData ? (
            <Editor
              height="100%"
              language={mapMonacoLang(fileData.language, fileData.path)}
              value={fileData.content}
              theme="vs-dark"
              onMount={handleMount}
              options={{
                readOnly: true,
                minimap: { enabled: true },
                fontSize: 13,
                fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace",
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                renderLineHighlight: "all",
                padding: { top: 12 },
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500">
              Select a file from the explorer to view source code.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

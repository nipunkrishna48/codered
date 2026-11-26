import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileArchive,
  FolderGit2,
  Github,
  Loader2,
  Play,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { api } from "../api/client";
import type { Project } from "../types/api";
import { Logo } from "./Logo";

interface UploadPageProps {
  onBack: () => void;
  onProjectReady: (project: Project) => void;
  onTryDemo: () => void;
  isLoadingDemo: boolean;
}

const PIPELINE_STEPS = [
  { key: "extracting", label: "Extract & Validate Archive" },
  { key: "scanning", label: "Scan Repository Structure" },
  { key: "parsing", label: "Parse AST & Tree-sitter Symbols" },
  { key: "building_graph", label: "Construct Dependency & Call Graphs" },
  { key: "computing_metrics", label: "Calculate Centrality & Flows" },
];

export const UploadPage: React.FC<UploadPageProps> = ({
  onBack,
  onProjectReady,
  onTryDemo,
  isLoadingDemo,
}) => {
  const [tab, setTab] = useState<"zip" | "github">("zip");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedName, setDetectedName] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubBranch, setGithubBranch] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStage, setActiveStage] = useState<string>("");
  const [stageDetail, setStageDetail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listProjects()
      .then((list) => setRecentProjects(list.filter((p) => p.status === "completed").slice(0, 6)))
      .catch(() => {});
  }, []);

  const handleFilePick = useCallback((file: File | undefined | null) => {
    setError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Only .zip repository archives are supported.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("Archive exceeds the 50 MB prototype upload limit.");
      return;
    }
    setSelectedFile(file);
    setDetectedName(file.name.replace(/\.zip$/i, ""));
  }, []);

  const handleZipSubmit = async () => {
    if (!selectedFile) return;
    setError(null);
    setIsProcessing(true);
    setActiveStage("extracting");
    setStageDetail(`Uploading and extracting ${selectedFile.name}...`);
    setUploadProgress(0);

    try {
      const proj = await api.uploadZip(selectedFile, (pct) => {
        setUploadProgress(pct);
        if (pct === 100) {
          setActiveStage("parsing");
          setStageDetail("Parsing source files and generating NetworkX graphs...");
        }
      });
      setActiveStage("completed");
      onProjectReady(proj);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyse ZIP repository.");
      setIsProcessing(false);
    }
  };

  const handleGithubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim()) {
      setError("Please enter a GitHub repository URL or owner/repo.");
      return;
    }
    setError(null);
    setIsProcessing(true);
    setActiveStage("extracting");
    setStageDetail(`Fetching archive for ${githubUrl.trim()}...`);

    try {
      const proj = await api.importGithub(githubUrl.trim(), githubBranch.trim() || undefined);
      setActiveStage("completed");
      onProjectReady(proj);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import GitHub repository.");
      setIsProcessing(false);
    }
  };

  const stageIdx = PIPELINE_STEPS.findIndex((s) => s.key === activeStage);

  return (
    <div className="min-h-screen bg-[#07070b] text-zinc-100 flex flex-col">
      <header className="border-b border-white/[0.06] bg-[#07070b]/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
              title="Back to landing"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Logo size="sm" />
          </div>
          <button
            onClick={onTryDemo}
            disabled={isLoadingDemo || isProcessing}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20 transition-all disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isLoadingDemo ? "Analysing Demo..." : "Try demo project"}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12">
        <div className="mb-8">
          <span className="text-xs font-mono uppercase tracking-wider text-violet-400">Repository Ingestion</span>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white mt-1.5">
            Import a codebase for analysis
          </h1>
          <p className="text-sm text-zinc-400 mt-1.5">
            Upload a ZIP archive or connect a public GitHub repository. Code is parsed statically and never executed.
          </p>
        </div>

        {/* Method Tabs */}
        <div className="inline-flex p-1 rounded-lg bg-[#0d0e14] border border-white/[0.08] mb-6">
          <button
            onClick={() => {
              setTab("zip");
              setError(null);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all ${
              tab === "zip"
                ? "bg-violet-600 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            ZIP Archive Upload
          </button>
          <button
            onClick={() => {
              setTab("github");
              setError(null);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all ${
              tab === "github"
                ? "bg-violet-600 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            GitHub Repository URL
          </button>
        </div>

        {/* Main Card */}
        <div className="rounded-xl bg-[#0d0e14] border border-white/[0.08] p-6">
          {tab === "zip" ? (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFilePick(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all ${
                  dragOver
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-white/[0.1] hover:border-violet-500/40 bg-[#0a0b10]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => handleFilePick(e.target.files?.[0])}
                />
                <div className="mx-auto w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center mb-4">
                  <UploadCloud className="w-6 h-6 text-violet-400" />
                </div>
                {selectedFile ? (
                  <div>
                    <div className="text-sm font-medium text-white">{selectedFile.name}</div>
                    <div className="text-xs text-zinc-400 mt-1 font-mono">
                      Detected repository: <span className="text-amber-300">{detectedName}</span> •{" "}
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-medium text-zinc-200">
                      Drag and drop your repository <span className="text-violet-400">.zip</span> here
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      or click to browse files (max 50 MB • skips node_modules, .git, venv)
                    </div>
                  </div>
                )}
              </div>

              {selectedFile && (
                <div className="mt-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>ZipSlip protection & static-only parsing enabled</span>
                  </div>
                  <button
                    onClick={handleZipSubmit}
                    disabled={isProcessing}
                    className="px-5 py-2.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isProcessing ? "Analysing Repository..." : "Start Analysis"}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleGithubSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Public GitHub URL or <span className="font-mono text-zinc-400">owner/repo</span>
                </label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/tiangolo/fastapi or pallets/flask"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#07070b] border border-white/[0.1] focus:border-violet-500 focus:outline-none text-sm font-mono text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Branch (optional)
                  </label>
                  <input
                    type="text"
                    value={githubBranch}
                    onChange={(e) => setGithubBranch(e.target.value)}
                    placeholder="Auto-detect default branch"
                    className="w-full px-3.5 py-2 rounded-lg bg-[#07070b] border border-white/[0.1] focus:border-violet-500 focus:outline-none text-xs font-mono text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>
                <div className="flex items-end justify-end">
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isProcessing ? "Importing & Analysing..." : "Fetch & Analyse"}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Progress Indicator */}
          {isProcessing && (
            <div className="mt-6 pt-6 border-t border-white/[0.06] space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-violet-300 font-medium">{stageDetail || "Processing repository..."}</span>
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <span className="font-mono text-zinc-400">{uploadProgress}% uploaded</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {PIPELINE_STEPS.map((st, idx) => {
                  const done = activeStage === "completed" || (stageIdx > -1 && idx < stageIdx);
                  const active = st.key === activeStage;
                  return (
                    <div
                      key={st.key}
                      className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                        done
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                          : active
                          ? "bg-violet-500/15 border-violet-500/40 text-violet-200"
                          : "bg-[#0a0b10] border-white/[0.05] text-zinc-500"
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : active ? (
                        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0" />
                      )}
                      <span className="truncate">{st.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mt-5 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Previously Analysed Repositories */}
        {recentProjects.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>Recent Analysed Repositories</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onProjectReady(p)}
                  className="text-left p-4 rounded-xl bg-[#0d0e14] border border-white/[0.07] hover:border-violet-500/40 transition-all group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderGit2 className="w-4 h-4 text-violet-400 shrink-0" />
                      <span className="text-xs font-medium text-zinc-100 truncate group-hover:text-white">
                        {p.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-400">
                      {p.source_type}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-zinc-500">
                    ID: {p.id}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

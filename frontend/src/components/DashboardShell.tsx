import React, { useEffect, useState } from "react";
import {
  Bot,
  Code2,
  FolderUp,
  GitBranch,
  Home,
  LayoutDashboard,
  Loader2,
  Network,
  Search,
  Settings,
  ShieldAlert,
  UserCircle2,
  Workflow,
  Zap,
} from "lucide-react";
import { api } from "../api/client";
import type {
  AnalysisSummary,
  ExecutionFlowResponse,
  FileTreeNode,
  GraphData,
  Project,
} from "../types/api";
import { AiTutorView } from "./AiTutorView";
import { ExecutionFlowView } from "./ExecutionFlowView";
import { GraphCanvas } from "./GraphCanvas";
import { ImpactAnalysisView } from "./ImpactAnalysisView";
import { Logo } from "./Logo";
import { OverviewView } from "./OverviewView";
import { SettingsView } from "./SettingsView";
import { SourceExplorerView } from "./SourceExplorerView";

export type DashboardTab =
  | "overview"
  | "architecture"
  | "dependencies"
  | "call-graph"
  | "execution-flow"
  | "impact"
  | "ai-tutor"
  | "source"
  | "settings";

interface DashboardShellProps {
  project: Project;
  onGoHome: () => void;
  onGoUpload: () => void;
}

const NAV_ITEMS: Array<{ id: DashboardTab; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "architecture", label: "Architecture", icon: Network },
  { id: "dependencies", label: "Dependency Graph", icon: GitBranch },
  { id: "call-graph", label: "Call Graph", icon: Workflow },
  { id: "execution-flow", label: "Execution Flow", icon: Zap },
  { id: "impact", label: "Impact Analysis", icon: ShieldAlert },
  { id: "ai-tutor", label: "AI Tutor", icon: Bot },
  { id: "source", label: "Source Explorer", icon: Code2 },
  { id: "settings", label: "Settings", icon: Settings },
];

export const DashboardShell: React.FC<DashboardShellProps> = ({
  project,
  onGoHome,
  onGoUpload,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [globalSearch, setGlobalSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [dependencies, setDependencies] = useState<GraphData | null>(null);
  const [callGraph, setCallGraph] = useState<GraphData | null>(null);
  const [executionFlow, setExecutionFlow] = useState<ExecutionFlowResponse | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);

  const [sourceTarget, setSourceTarget] = useState<{ path: string; line?: number } | null>(null);
  const [impactTargetId, setImpactTargetId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getAnalysis(project.id),
      api.getGraph(project.id),
      api.getDependencies(project.id),
      api.getCallGraph(project.id),
      api.getExecutionFlow(project.id),
      api.getFiles(project.id),
    ])
      .then(([sum, g, deps, calls, flow, files]) => {
        setSummary(sum);
        setGraph(g);
        setDependencies(deps);
        setCallGraph(calls);
        setExecutionFlow(flow);
        setFileTree(files.tree);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load repository analysis.");
      })
      .finally(() => setLoading(false));
  }, [project.id]);

  const handleOpenSource = (filePath: string, line?: number) => {
    setSourceTarget({ path: filePath, line });
    setActiveTab("source");
  };

  const handleRunImpact = (nodeId: string) => {
    setImpactTargetId(nodeId);
    setActiveTab("impact");
  };

  return (
    <div className="min-h-screen bg-[#07070b] text-zinc-100 flex">
      {/* Left Sidebar */}
      <aside className="w-60 shrink-0 border-r border-white/[0.07] bg-[#0a0b10] flex flex-col">
        <div className="h-16 px-4 border-b border-white/[0.06] flex items-center justify-between">
          <button onClick={onGoHome} className="text-left">
            <Logo size="sm" />
          </button>
        </div>

        {/* Active Project Pill */}
        <div className="p-3 border-b border-white/[0.06]">
          <div className="p-2.5 rounded-lg bg-[#12131c] border border-white/[0.07]">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Active Codebase
            </div>
            <div className="text-xs font-medium text-white truncate mt-0.5" title={project.name}>
              {project.name}
            </div>
            <button
              onClick={onGoUpload}
              className="mt-2 w-full py-1 px-2 rounded text-[11px] font-mono bg-white/[0.04] hover:bg-violet-500/20 text-violet-300 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <FolderUp className="w-3 h-3" />
              Switch / Upload
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? "bg-violet-600/20 text-violet-200 border border-violet-500/35"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent"
                }`}
              >
                <item.icon className={`w-4 h-4 ${active ? "text-violet-400" : "text-zinc-500"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={onGoHome}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Landing Page</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 px-6 border-b border-white/[0.07] bg-[#0a0b10]/90 backdrop-blur-md flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-white truncate">{project.name}</span>
            <div className="hidden md:flex items-center gap-1.5">
              {summary?.languages.slice(0, 3).map((l) => (
                <span
                  key={l.language}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] text-zinc-300 border border-white/[0.06]"
                >
                  {l.language}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  if (activeTab === "overview" && e.target.value.trim()) {
                    setActiveTab("architecture");
                  }
                }}
                placeholder="Quick search symbols..."
                className="pl-8 pr-3 py-1.5 w-52 rounded-lg bg-[#12131c] border border-white/[0.08] text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {project.status}
            </span>

            <div className="w-8 h-8 rounded-full bg-[#12131c] border border-white/[0.1] flex items-center justify-center text-zinc-400" title="Team Eternals">
              <UserCircle2 className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-3 text-xs text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
              <span>Loading repository graph and analysis telemetry...</span>
            </div>
          ) : error ? (
            <div className="p-8 max-w-xl mx-auto">
              <div className="p-5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-200">
                {error}
              </div>
            </div>
          ) : (
            <>
              {activeTab === "overview" && summary && (
                <OverviewView
                  summary={summary}
                  onNavigateTab={(t) => setActiveTab(t as DashboardTab)}
                  onOpenFile={handleOpenSource}
                />
              )}

              {activeTab === "architecture" && graph && (
                <GraphCanvas
                  title="Interactive Software Architecture Graph"
                  subtitle="Full topology across modules, files, classes, functions and methods."
                  graphData={graph}
                  mode="architecture"
                  onOpenSource={handleOpenSource}
                  onRunImpact={handleRunImpact}
                  externalSearch={globalSearch}
                />
              )}

              {activeTab === "dependencies" && dependencies && (
                <GraphCanvas
                  title="Module & File Dependency Graph"
                  subtitle="Inspect import fan-in/fan-out. Click any node and choose 'Isolate Node' to focus on its upstream & downstream links."
                  graphData={dependencies}
                  mode="dependencies"
                  onOpenSource={handleOpenSource}
                  onRunImpact={handleRunImpact}
                  externalSearch={globalSearch}
                />
              )}

              {activeTab === "call-graph" && callGraph && (
                <GraphCanvas
                  title="Function-Level Call Graph"
                  subtitle="Caller-to-callee invocation chains extracted via AST & Tree-sitter. Dashed lines mark statically inferred calls."
                  graphData={callGraph}
                  mode="call-graph"
                  onOpenSource={handleOpenSource}
                  onRunImpact={handleRunImpact}
                  externalSearch={globalSearch}
                />
              )}

              {activeTab === "execution-flow" && executionFlow && (
                <ExecutionFlowView data={executionFlow} onOpenFile={handleOpenSource} />
              )}

              {activeTab === "impact" && graph && (
                <ImpactAnalysisView
                  projectId={project.id}
                  graphData={graph}
                  initialNodeId={impactTargetId}
                  onOpenSource={handleOpenSource}
                />
              )}

              {activeTab === "ai-tutor" && (
                <AiTutorView
                  projectId={project.id}
                  projectName={project.name}
                  onOpenSource={handleOpenSource}
                />
              )}

              {activeTab === "source" && (
                <SourceExplorerView
                  projectId={project.id}
                  fileTree={fileTree}
                  targetFile={sourceTarget?.path}
                  targetLine={sourceTarget?.line}
                />
              )}

              {activeTab === "settings" && summary && (
                <SettingsView
                  project={project}
                  summary={summary}
                  onSwitchProject={onGoUpload}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

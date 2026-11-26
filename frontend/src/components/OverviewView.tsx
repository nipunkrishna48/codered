import React from "react";
import {
  Activity,
  Box,
  Code2,
  FileCode2,
  GitBranch,
  Layers,
  Network,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisSummary } from "../types/api";

interface OverviewViewProps {
  summary: AnalysisSummary;
  onNavigateTab: (tab: string) => void;
  onOpenFile: (path: string, line?: number) => void;
}

const CHART_COLORS = ["#8b5cf6", "#eab308", "#10b981", "#06b6d4", "#ec4899", "#f97316"];

export const OverviewView: React.FC<OverviewViewProps> = ({
  summary,
  onNavigateTab,
  onOpenFile,
}) => {
  const kpis = [
    {
      label: "Total Files",
      value: summary.total_files,
      sub: `${summary.source_files} parsed source • ${summary.total_lines.toLocaleString()} LOC`,
      icon: FileCode2,
      color: "text-violet-400",
    },
    {
      label: "Functions & Methods",
      value: summary.total_functions + summary.total_methods,
      sub: `${summary.total_functions} functions • ${summary.total_methods} methods`,
      icon: Code2,
      color: "text-emerald-400",
    },
    {
      label: "Classes",
      value: summary.total_classes,
      sub: "Object-oriented definitions",
      icon: Box,
      color: "text-amber-400",
    },
    {
      label: "Dependencies",
      value: summary.total_dependencies,
      sub: `${summary.total_calls} function call edges`,
      icon: GitBranch,
      color: "text-cyan-400",
    },
  ];

  const moduleChartData = summary.most_connected_modules.slice(0, 6).map((m) => ({
    name: m.name,
    incoming: m.in_degree,
    outgoing: m.out_degree,
    file_path: m.file_path,
  }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-semibold text-white">{summary.project_name}</h2>
            {summary.is_demo && (
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Live Demo Pipeline
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {summary.confirmed_edges} confirmed AST/import relationships • {summary.inferred_edges} inferred static links
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {summary.frameworks.map((fw) => (
            <span
              key={fw}
              className="px-2.5 py-1 rounded-md text-xs font-mono bg-violet-500/10 text-violet-300 border border-violet-500/25"
            >
              {fw}
            </span>
          ))}
          <button
            onClick={() => onNavigateTab("architecture")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors inline-flex items-center gap-1.5"
          >
            <Network className="w-3.5 h-3.5" />
            Open Architecture Graph
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="p-4 rounded-xl bg-[#0d0e14] border border-white/[0.07] hover:border-white/[0.14] transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{k.label}</span>
              <k.icon className={`w-4 h-4 ${k.color}`} />
            </div>
            <div className="mt-2 text-2xl font-semibold text-white font-mono">
              {k.value.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Most Connected Modules Chart */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Most Connected Modules</h3>
              <p className="text-xs text-zinc-500">Incoming vs outgoing dependency fan-in/fan-out</p>
            </div>
            <button
              onClick={() => onNavigateTab("dependencies")}
              className="text-xs text-violet-400 hover:text-violet-300 font-mono"
            >
              View Dependency Graph →
            </button>
          </div>
          {moduleChartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moduleChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" stroke="#52525b" fontSize={11} />
                  <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={11} width={135} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#12131c",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="incoming" name="Incoming Dependents" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="outgoing" name="Outgoing Imports" stackId="a" fill="#eab308" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-xs text-zinc-500">
              No inter-file dependencies detected in this repository.
            </div>
          )}
        </div>

        {/* Language Breakdown */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07] flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Programming Languages</h3>
            <p className="text-xs text-zinc-500 mb-4">Detected from repository file extensions & AST</p>

            <div className="space-y-3">
              {summary.languages.map((lang, idx) => (
                <div key={lang.language} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-200 font-medium">{lang.language}</span>
                    <span className="font-mono text-zinc-400">
                      {lang.files} files • {lang.lines.toLocaleString()} lines ({lang.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, lang.percentage)}%`,
                        backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {summary.config_files.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
                Configuration Files
              </div>
              <div className="flex flex-wrap gap-1.5">
                {summary.config_files.slice(0, 8).map((cf) => (
                  <button
                    key={cf}
                    onClick={() => onOpenFile(cf, 1)}
                    className="px-2 py-1 rounded text-[11px] font-mono bg-[#12131c] border border-white/[0.07] text-zinc-300 hover:border-violet-500/40"
                  >
                    {cf}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Entry Points, Critical Components & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Entry Points */}
        <div className="p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Detected Entry Points</h3>
            </div>
            <button
              onClick={() => onNavigateTab("execution-flow")}
              className="text-[11px] font-mono text-amber-300 hover:underline"
            >
              Trace Flow →
            </button>
          </div>
          <div className="space-y-2">
            {summary.entry_points.length > 0 ? (
              summary.entry_points.map((ep) => (
                <button
                  key={ep.file_path}
                  onClick={() => onOpenFile(ep.file_path, 1)}
                  className="w-full text-left p-2.5 rounded-lg bg-[#12131c] border border-white/[0.06] hover:border-amber-500/40 transition-colors"
                >
                  <div className="text-xs font-mono text-amber-200">{ep.file_path}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{ep.reason}</div>
                </button>
              ))
            ) : (
              <div className="text-xs text-zinc-500">No explicit entry point detected.</div>
            )}
          </div>
        </div>

        {/* Critical Components */}
        <div className="p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Critical Components</h3>
            </div>
            <button
              onClick={() => onNavigateTab("impact")}
              className="text-[11px] font-mono text-violet-300 hover:underline"
            >
              Simulate Impact →
            </button>
          </div>
          <div className="space-y-2">
            {summary.critical_components.slice(0, 5).map((comp) => (
              <button
                key={comp.id}
                onClick={() => onOpenFile(comp.file_path, 1)}
                className="w-full text-left p-2.5 rounded-lg bg-[#12131c] border border-white/[0.06] hover:border-violet-500/40 transition-colors flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono text-zinc-100 truncate">{comp.name}</div>
                  <div className="text-[11px] text-zinc-500 truncate">{comp.file_path}</div>
                </div>
                <span className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/15 text-violet-300">
                  {comp.in_degree} in / {comp.out_degree} out
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Analysis Activity */}
        <div className="p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07]">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Analysis Pipeline Log</h3>
          </div>
          <div className="space-y-2.5">
            {summary.recent_activity.map((act, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-mono text-[11px] uppercase text-zinc-400">{act.step}</div>
                  <div className="text-zinc-300 text-xs">{act.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

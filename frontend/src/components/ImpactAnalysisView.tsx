import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Code2,
  GitMerge,
  Loader2,
  Search,
  ShieldAlert,
} from "lucide-react";
import { api } from "../api/client";
import type { GraphData, GraphNode, ImpactItem, ImpactReport } from "../types/api";

interface ImpactAnalysisViewProps {
  projectId: string;
  graphData: GraphData;
  initialNodeId?: string | null;
  onOpenSource: (filePath: string, line?: number) => void;
}

const RISK_STYLES: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  critical: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export const ImpactAnalysisView: React.FC<ImpactAnalysisViewProps> = ({
  projectId,
  graphData,
  initialNodeId,
  onOpenSource,
}) => {
  const [query, setQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidateNodes = useMemo(() => {
    return graphData.nodes
      .filter((n) => n.type !== "module")
      .sort((a, b) => b.metrics.in_degree - a.metrics.in_degree);
  }, [graphData.nodes]);

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidateNodes.slice(0, 40);
    return candidateNodes
      .filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.file_path.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [candidateNodes, query]);

  useEffect(() => {
    if (initialNodeId) {
      setSelectedNodeId(initialNodeId);
    } else if (!selectedNodeId && candidateNodes.length > 0) {
      // Auto-select highest fan-in symbol so user sees an immediate live impact report
      const topFn = candidateNodes.find((n) => n.metrics.in_degree > 0) || candidateNodes[0];
      if (topFn) setSelectedNodeId(topFn.id);
    }
  }, [initialNodeId, candidateNodes, selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    setLoading(true);
    setError(null);
    api
      .getImpact(projectId, selectedNodeId)
      .then((res) => setReport(res))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to compute impact."))
      .finally(() => setLoading(false));
  }, [projectId, selectedNodeId]);

  const renderImpactSection = (
    title: string,
    subtitle: string,
    items: ImpactItem[],
    badgeClass: string,
    emptyText: string
  ) => (
    <div className="p-4 rounded-xl bg-[#0d0e14] border border-white/[0.07]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-white">{title}</h4>
          <p className="text-[11px] text-zinc-500">{subtitle}</p>
        </div>
        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${badgeClass}`}>
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-zinc-500 py-4 text-center border border-dashed border-white/[0.06] rounded-lg">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.node_id}
              className="p-3 rounded-lg bg-[#12131c] border border-white/[0.06] hover:border-violet-500/35 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase text-zinc-400">{item.type}</span>
                    <span className="text-xs font-mono font-semibold text-zinc-100 truncate">
                      {item.name}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 mt-0.5">
                    {item.file_path}:{item.line_start}
                  </div>
                </div>
                <button
                  onClick={() => onOpenSource(item.file_path, item.line_start)}
                  className="shrink-0 px-2.5 py-1 rounded text-[11px] font-mono bg-white/[0.04] hover:bg-violet-500/20 text-violet-300 inline-flex items-center gap-1"
                >
                  <Code2 className="w-3 h-3" />
                  Source
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-white/[0.05] flex flex-wrap items-center gap-1 text-[10px] font-mono text-zinc-400">
                <GitMerge className="w-3 h-3 text-zinc-500 mr-1" />
                {item.path_labels.map((lbl, idx) => (
                  <React.Fragment key={idx}>
                    <span className={idx === 0 ? "text-amber-300" : "text-zinc-300"}>{lbl}</span>
                    {idx < item.path_labels.length - 1 && (
                      <ArrowRight className="w-2.5 h-2.5 text-zinc-600" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="pb-4 border-b border-white/[0.06]">
        <h2 className="text-lg font-semibold text-white">Change Impact Analysis Engine</h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Select any function, class, method, or file to traverse reverse dependency paths and inspect direct, indirect, and uncertain downstream effects.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Target Selector */}
        <div className="lg:col-span-4 rounded-xl bg-[#0d0e14] border border-white/[0.07] p-4 flex flex-col max-h-[75vh]">
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter symbol or file..."
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#07070b] border border-white/[0.08] text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredCandidates.map((n: GraphNode) => {
              const active = n.id === selectedNodeId;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedNodeId(n.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                    active
                      ? "bg-violet-600/15 border-violet-500/50"
                      : "bg-[#12131c] border-white/[0.05] hover:border-white/[0.15]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-medium text-zinc-100 truncate">{n.label}</span>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">{n.type}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-1">
                    <span className="truncate">{n.file_path}:{n.line_start}</span>
                    <span className="text-amber-300/80 shrink-0">{n.metrics.in_degree} in</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Impact Report */}
        <div className="lg:col-span-8 space-y-4">
          {loading ? (
            <div className="p-16 rounded-xl bg-[#0d0e14] border border-white/[0.07] flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              Traversing reverse dependency graph...
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
              {error}
            </div>
          ) : report ? (
            <>
              {/* Summary Header */}
              <div className="p-5 rounded-xl bg-[#0d0e14] border border-white/[0.08]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-sm font-mono font-semibold text-white">
                        Target: {report.target.label}
                      </div>
                      <div className="text-xs font-mono text-zinc-400">
                        {report.target.file_path}:{report.target.line_start}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-mono uppercase px-3 py-1 rounded-full border ${
                      RISK_STYLES[report.risk_level] || RISK_STYLES.low
                    }`}
                  >
                    {report.risk_level} risk • {report.total_affected} affected
                  </span>
                </div>

                <p className="mt-3 text-xs text-zinc-300 leading-relaxed">{report.summary}</p>

                {report.affected_files.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase text-zinc-500 mr-1">
                      Affected Files:
                    </span>
                    {report.affected_files.map((af) => (
                      <button
                        key={af}
                        onClick={() => onOpenSource(af, 1)}
                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#12131c] border border-white/[0.07] text-zinc-300 hover:border-violet-500/40"
                      >
                        {af}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {renderImpactSection(
                "Direct Impact (Distance 1 • Confirmed)",
                "Components that directly call, import, or inherit from the target.",
                report.direct_impacts,
                "bg-rose-500/15 text-rose-300 border-rose-500/30",
                "No direct confirmed dependents found."
              )}

              {renderImpactSection(
                "Indirect Impact (Transitive • Confirmed)",
                "Upstream components affected through 2+ confirmed dependency hops.",
                report.indirect_impacts,
                "bg-amber-500/15 text-amber-300 border-amber-500/30",
                "No indirect confirmed dependents found."
              )}

              {renderImpactSection(
                "Uncertain Impact (Inferred Static Links)",
                "Paths traversing heuristic or unresolved name-matched call edges.",
                report.uncertain_impacts,
                "bg-violet-500/15 text-violet-300 border-violet-500/30",
                "No uncertain inferred dependents."
              )}

              <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/[0.06] flex items-center gap-2 text-[11px] text-zinc-500">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Only relationships established in the analysed NetworkX AST/import graph are reported.</span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

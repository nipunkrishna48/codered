import React, { useState } from "react";
import { ChevronDown, ChevronRight, Code2, ExternalLink, GitCommitHorizontal, Zap } from "lucide-react";
import type { ExecutionFlowResponse, ExecutionStep } from "../types/api";

interface ExecutionFlowViewProps {
  data: ExecutionFlowResponse;
  onOpenFile: (path: string, line?: number) => void;
}

const StepTreeNode: React.FC<{
  step: ExecutionStep;
  onOpenFile: (path: string, line?: number) => void;
}> = ({ step, onOpenFile }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = step.children && step.children.length > 0;

  return (
    <div className="select-none">
      <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-white/[0.04] group transition-colors">
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-zinc-500 hover:text-zinc-200 p-0.5"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <GitCommitHorizontal className="w-3.5 h-3.5 text-zinc-600 ml-0.5" />
        )}

        <span
          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
            step.depth === 0
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : step.inferred
              ? "bg-violet-500/15 text-violet-300 border border-dashed border-violet-500/40"
              : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
          }`}
        >
          {step.depth === 0 ? "ENTRY" : step.edge_type}
        </span>

        <span className="text-xs font-mono font-medium text-zinc-100">{step.name}</span>

        <span className="text-[11px] font-mono text-zinc-500">
          {step.file_path}:{step.line_start}
        </span>

        {step.inferred && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
            inferred order
          </span>
        )}

        <button
          onClick={() => onOpenFile(step.file_path, step.line_start)}
          className="ml-auto opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200 transition-opacity"
        >
          <Code2 className="w-3 h-3" />
          <span>Source</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </button>
      </div>

      {hasChildren && expanded && (
        <div className="ml-5 pl-3 border-l border-white/[0.08] space-y-0.5 mt-0.5">
          {step.children.map((child, idx) => (
            <StepTreeNode key={`${child.id}-${idx}`} step={child} onOpenFile={onOpenFile} />
          ))}
        </div>
      )}
    </div>
  );
};

export const ExecutionFlowView: React.FC<ExecutionFlowViewProps> = ({ data, onOpenFile }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedFlow = data.entry_points[selectedIdx];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <h2 className="text-lg font-semibold text-white">Execution Flow Explorer</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Detected entry points and static call chains. Paths that static analysis cannot prove at runtime are explicitly marked <span className="text-violet-300 font-mono">inferred order</span>.
          </p>
        </div>
        <div className="text-xs font-mono text-zinc-400">
          {data.total_flows} entry flow(s) discovered
        </div>
      </div>

      {data.entry_points.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-[#0d0e14] border border-white/[0.07] text-xs text-zinc-500">
          No clear execution entry points were detected in this codebase.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Entry Points List */}
          <div className="lg:col-span-4 space-y-2.5">
            {data.entry_points.map((ep, idx) => {
              const active = idx === selectedIdx;
              return (
                <button
                  key={ep.entry_id}
                  onClick={() => setSelectedIdx(idx)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    active
                      ? "bg-violet-600/15 border-violet-500/50"
                      : "bg-[#0d0e14] border-white/[0.07] hover:border-white/[0.15]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Zap className={`w-4 h-4 shrink-0 ${active ? "text-amber-300" : "text-amber-500/70"}`} />
                      <span className="text-xs font-mono font-semibold text-white truncate">{ep.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                        ep.confidence === "confirmed"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-violet-500/15 text-violet-300"
                      }`}
                    >
                      {ep.confidence}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[11px] font-mono text-zinc-400">
                    {ep.file_path}:{ep.line_start}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">{ep.reason}</div>
                </button>
              );
            })}
          </div>

          {/* Flow Tree Canvas */}
          <div className="lg:col-span-8 p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07]">
            {selectedFlow && (
              <>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.06]">
                  <div>
                    <div className="text-sm font-semibold text-white font-mono">{selectedFlow.name}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{selectedFlow.reason}</div>
                  </div>
                  <button
                    onClick={() => onOpenFile(selectedFlow.file_path, selectedFlow.line_start)}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono bg-[#12131c] border border-white/[0.1] hover:border-violet-500/40 text-zinc-200"
                  >
                    Open {selectedFlow.file_path}:{selectedFlow.line_start}
                  </button>
                </div>

                <div className="space-y-1">
                  {selectedFlow.steps.map((st, idx) => (
                    <StepTreeNode key={`${st.id}-${idx}`} step={st} onOpenFile={onOpenFile} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

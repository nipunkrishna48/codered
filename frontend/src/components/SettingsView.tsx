import React from "react";
import { Cpu, Database, Lock, ShieldCheck } from "lucide-react";
import type { AnalysisSummary, Project } from "../types/api";

interface SettingsViewProps {
  project: Project;
  summary: AnalysisSummary;
  onSwitchProject: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  project,
  summary,
  onSwitchProject,
}) => {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="pb-4 border-b border-white/[0.06] flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Workspace & Engine Settings</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Active repository diagnostics, parser backends, and safety boundaries.
          </p>
        </div>
        <button
          onClick={onSwitchProject}
          className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white"
        >
          Import New Repository
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07] space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Database className="w-4 h-4 text-violet-400" />
            Project Metadata
          </div>
          <div className="text-xs space-y-2 font-mono">
            <div className="flex justify-between"><span className="text-zinc-500">Project ID:</span><span className="text-zinc-200">{project.id}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Source Type:</span><span className="text-zinc-200 uppercase">{project.source_type}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Status:</span><span className="text-emerald-300 uppercase">{project.status}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Total Parsed Files:</span><span className="text-zinc-200">{summary.total_files}</span></div>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07] space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Cpu className="w-4 h-4 text-amber-400" />
            Parser & Graph Stack
          </div>
          <ul className="text-xs text-zinc-400 space-y-1.5">
            <li>• Python files: Native <span className="font-mono text-zinc-200">ast</span> module</li>
            <li>• JS / TS / Java: <span className="font-mono text-zinc-200">Tree-sitter</span> + Regex Fallback</li>
            <li>• Graph Engine: <span className="font-mono text-zinc-200">NetworkX DiGraph</span></li>
            <li>• Persistence: Local <span className="font-mono text-zinc-200">SQLite</span></li>
          </ul>
        </div>

        <div className="p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07] space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Security Guardrails
          </div>
          <ul className="text-xs text-zinc-400 space-y-1.5">
            <li>• Uploaded code is never executed or imported at runtime.</li>
            <li>• ZipSlip path traversal protection active during extraction.</li>
            <li>• Automatically excludes <span className="font-mono text-zinc-300">.git, node_modules, venv, dist, build</span>.</li>
          </ul>
        </div>

        <div className="p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07] space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Lock className="w-4 h-4 text-cyan-400" />
            AI Tutor Mode
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Supports configurable <span className="font-mono text-zinc-200">OPENAI_API_KEY</span> / <span className="font-mono text-zinc-200">GEMINI_API_KEY</span> environment variables, with automatic deterministic AST & Graph Retrieval fallback when no external key is present.
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from "react";
import {
  Bot,
  CheckCircle2,
  Code2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { api } from "../api/client";
import type { ChatResponse } from "../types/api";

interface AiTutorViewProps {
  projectId: string;
  projectName: string;
  onOpenSource: (filePath: string, line?: number) => void;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  response?: ChatResponse;
}

const STARTER_QUESTIONS = [
  "Explain the architecture of this project.",
  "Where does execution begin?",
  "Which files handle persistence or ledger storage?",
  "What happens if I modify verify_api_token?",
];

export const AiTutorView: React.FC<AiTutorViewProps> = ({
  projectId,
  projectName,
  onOpenSource,
}) => {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || loading) return;

    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await api.chat(projectId, trimmed, history);
      setTurns((prev) => [...prev, { role: "assistant", content: res.answer, response: res }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to query AI Tutor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col max-w-5xl mx-auto p-6">
      <div className="pb-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-violet-400" />
            AI Codebase Tutor
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Repository-aware Q&A grounded in <span className="text-zinc-200 font-mono">{projectName}</span> AST symbols, graph edges, and source snippets.
          </p>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-[#12131c] border border-white/[0.08] text-zinc-300">
          Facts & Citations Enforced
        </span>
      </div>

      {/* Chat Stream */}
      <div className="flex-1 overflow-y-auto py-5 space-y-5 pr-1">
        {turns.length === 0 && (
          <div className="p-8 rounded-xl bg-[#0d0e14] border border-white/[0.07] text-center space-y-5 my-6">
            <div className="mx-auto w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Ask anything about {projectName}</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-lg mx-auto">
                Retrieves matching symbols, dependency chains, and source code lines. Automatically uses an LLM if configured or our deterministic AST & Graph Retriever fallback.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTER_QUESTIONS.map((sq) => (
                <button
                  key={sq}
                  onClick={() => sendQuestion(sq)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-[#12131c] border border-white/[0.08] hover:border-violet-500/40 text-zinc-300 transition-colors"
                >
                  {sq}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, idx) => (
          <div
            key={idx}
            className={`flex gap-3 ${turn.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {turn.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-violet-300" />
              </div>
            )}

            <div
              className={`max-w-3xl rounded-xl p-4 ${
                turn.role === "user"
                  ? "bg-violet-600 text-white text-sm"
                  : "bg-[#0d0e14] border border-white/[0.08] text-zinc-200 flex-1"
              }`}
            >
              {turn.role === "user" ? (
                <div>{turn.content}</div>
              ) : (
                <div className="space-y-4">
                  {turn.response && (
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                          turn.response.mode === "llm"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {turn.response.mode === "llm" ? `LLM: ${turn.response.model_label}` : turn.response.model_label}
                      </span>
                    </div>
                  )}

                  <pre className="whitespace-pre-wrap font-sans text-xs sm:text-[13px] leading-relaxed text-zinc-200">
                    {turn.content}
                  </pre>

                  {/* Clickable Citations */}
                  {turn.response && turn.response.citations.length > 0 && (
                    <div className="pt-3 border-t border-white/[0.06]">
                      <div className="text-[10px] font-mono uppercase text-zinc-500 mb-2">
                        Verified File & Line References
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {turn.response.citations.map((c, cIdx) => (
                          <button
                            key={cIdx}
                            onClick={() => onOpenSource(c.file_path, c.line)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-[#12131c] border border-white/[0.08] hover:border-violet-500/50 text-violet-300 transition-colors"
                          >
                            <Code2 className="w-3 h-3" />
                            <span>
                              {c.file_path}:{c.line}
                            </span>
                            <ExternalLink className="w-2.5 h-2.5 text-zinc-500" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Facts vs Inferences */}
                  {turn.response && (turn.response.facts.length > 0 || turn.response.inferences.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {turn.response.facts.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-emerald-300 mb-1.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Confirmed Graph Facts
                          </div>
                          <ul className="space-y-1 text-[11px] text-zinc-300">
                            {turn.response.facts.map((f, fi) => (
                              <li key={fi}>• {f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {turn.response.inferences.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-amber-300 mb-1.5">
                            <HelpCircle className="w-3 h-3" />
                            Static Analysis Notes
                          </div>
                          <ul className="space-y-1 text-[11px] text-zinc-400">
                            {turn.response.inferences.map((inf, ii) => (
                              <li key={ii}>• {inf}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {turn.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/[0.1] flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-zinc-300" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 pl-11">
            <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
            Retrieving AST context & graph edges...
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
            {error}
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        className="pt-3 border-t border-white/[0.06] flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about architecture, callers, entry points, or modification impact..."
          className="flex-1 px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[0.1] focus:border-violet-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Ask
        </button>
      </form>
    </div>
  );
};

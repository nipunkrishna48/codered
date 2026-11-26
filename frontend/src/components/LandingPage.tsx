import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Code2,
  Cpu,
  FileCode2,
  GitBranch,
  Layers,
  Network,
  Play,
  ShieldAlert,
  Sparkles,
  Terminal,
  Upload,
  Zap,
} from "lucide-react";
import { Logo } from "./Logo";

interface LandingPageProps {
  onExploreClick: () => void;
  onTryDemo: () => void;
  isLoadingDemo: boolean;
}

const DEMO_NODES = [
  { id: "main", label: "main.py", sub: "FastAPI Entry", x: 60, y: 145, color: "#eab308", badge: "ENTRY" },
  { id: "processor", label: "payment_processor.py", sub: "PaymentProcessor", x: 300, y: 145, color: "#8b5cf6", badge: "HUB" },
  { id: "auth", label: "auth.py", sub: "verify_api_token()", x: 560, y: 48, color: "#10b981", badge: "FN" },
  { id: "fraud", label: "fraud_engine.py", sub: "FraudEngine", x: 560, y: 145, color: "#a855f7", badge: "CLASS" },
  { id: "ledger", label: "ledger_store.py", sub: "LedgerRepository", x: 560, y: 242, color: "#06b6d4", badge: "DB" },
];

const DEMO_EDGES = [
  { from: { x: 205, y: 170 }, to: { x: 300, y: 170 }, label: "IMPORTS" },
  { from: { x: 468, y: 158 }, to: { x: 560, y: 74 }, label: "CALLS" },
  { from: { x: 468, y: 170 }, to: { x: 560, y: 170 }, label: "CALLS" },
  { from: { x: 468, y: 182 }, to: { x: 560, y: 268 }, label: "DEPENDS_ON" },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onExploreClick,
  onTryDemo,
  isLoadingDemo,
}) => {
  const [hoveredNode, setHoveredNode] = useState<string>("processor");

  return (
    <div className="min-h-screen bg-[#07070b] text-zinc-100 overflow-x-hidden">
      {/* Subtle radial glow background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-violet-600/12 blur-[140px] rounded-full" />
        <div className="absolute top-1/3 right-0 w-[420px] h-[420px] bg-amber-500/5 blur-[130px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06] bg-[#07070b]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-zinc-400">
            <a href="#features" className="hover:text-zinc-100 transition-colors">Capabilities</a>
            <a href="#how-it-works" className="hover:text-zinc-100 transition-colors">How it works</a>
            <a href="#architecture" className="hover:text-zinc-100 transition-colors">Engine Stack</a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={onTryDemo}
              disabled={isLoadingDemo}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-amber-200/90 bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 transition-all disabled:opacity-50"
            >
              {isLoadingDemo ? "Analysing Demo..." : "Try demo project"}
            </button>
            <button
              onClick={onExploreClick}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-950/50 transition-all"
            >
              Explore your codebase
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-300 mb-6"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>CodeRed'26 • Unisys Problem Statement 02 • Team Eternals</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="text-4xl sm:text-6xl font-semibold tracking-tight text-white leading-[1.08]"
          >
            See the whole codebase.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="mt-5 text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto"
          >
            Upload a repository. Discover its architecture, dependencies, execution flow and hidden connections.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3.5"
          >
            <button
              onClick={onExploreClick}
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white shadow-xl shadow-violet-950/60 transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Explore your codebase</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={onTryDemo}
              disabled={isLoadingDemo}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium bg-[#12131c] hover:bg-[#181a26] text-zinc-200 border border-white/[0.1] hover:border-amber-500/40 transition-all disabled:opacity-60"
            >
              <Play className="w-4 h-4 text-amber-400" />
              <span>{isLoadingDemo ? "Running AST & Graph Pipeline..." : "Try demo project"}</span>
            </button>
          </motion.div>
        </div>

        {/* Animated Code Dependency Visualisation */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-14 rounded-xl border border-white/[0.08] bg-[#0d0e14]/90 backdrop-blur-xl shadow-2xl overflow-hidden"
        >
          {/* Window Chrome */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-[#0a0b10]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <span className="ml-3 text-[11px] font-mono text-zinc-500">
                ast-graph-preview — live-dependency-topology
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                AST + NetworkX Engine
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Interactive Animated SVG Graph */}
            <div className="lg:col-span-8 relative p-4 sm:p-6 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.08),transparent_70%)] min-h-[320px] flex items-center justify-center">
              <svg viewBox="0 0 760 310" className="w-full h-auto max-h-[320px]">
                <defs>
                  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.08)" />
                  </pattern>
                </defs>
                <rect width="760" height="310" fill="url(#grid)" rx="8" />

                {/* Edges + animated packets */}
                {DEMO_EDGES.map((edge, idx) => {
                  const mx = (edge.from.x + edge.to.x) / 2;
                  const pathD = `M ${edge.from.x} ${edge.from.y} C ${mx} ${edge.from.y}, ${mx} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`;
                  return (
                    <g key={idx}>
                      <path
                        d={pathD}
                        fill="none"
                        stroke="rgba(139,92,246,0.35)"
                        strokeWidth="1.8"
                        strokeDasharray={edge.label === "DEPENDS_ON" ? "5 4" : undefined}
                      />
                      <circle r="3.5" fill={idx === 0 ? "#eab308" : "#a855f7"}>
                        <animateMotion dur={`${2.2 + idx * 0.4}s`} repeatCount="indefinite" path={pathD} />
                      </circle>
                      <text
                        x={mx}
                        y={(edge.from.y + edge.to.y) / 2 - 6}
                        textAnchor="middle"
                        className="fill-zinc-500 text-[9px] font-mono"
                      >
                        {edge.label}
                      </text>
                    </g>
                  );
                })}

                {/* Nodes */}
                {DEMO_NODES.map((n) => {
                  const active = hoveredNode === n.id;
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x}, ${n.y})`}
                      onMouseEnter={() => setHoveredNode(n.id)}
                      className="cursor-pointer"
                    >
                      <rect
                        width={n.id === "processor" ? 168 : 148}
                        height={52}
                        rx={8}
                        fill="#12131c"
                        stroke={active ? n.color : "rgba(255,255,255,0.12)"}
                        strokeWidth={active ? 1.8 : 1}
                      />
                      <rect x={8} y={9} width={40} height={14} rx={3} fill={`${n.color}22`} />
                      <text x={28} y={19} textAnchor="middle" fill={n.color} className="text-[8px] font-mono font-semibold">
                        {n.badge}
                      </text>
                      <text x={10} y={34} fill="#f4f4f5" className="text-[11px] font-mono font-medium">
                        {n.label}
                      </text>
                      <text x={10} y={46} fill="#71717a" className="text-[9px] font-mono">
                        {n.sub}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Live Inspector Preview */}
            <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-white/[0.06] p-5 bg-[#0a0b10] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-violet-400">
                    Node Telemetry
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    CONFIRMED AST
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#12131c] border border-white/[0.07] font-mono text-xs space-y-2">
                  <div className="text-zinc-200 font-semibold">
                    {DEMO_NODES.find((x) => x.id === hoveredNode)?.label}
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    Symbol: <span className="text-violet-300">{DEMO_NODES.find((x) => x.id === hoveredNode)?.sub}</span>
                  </div>
                  <div className="pt-2 border-t border-white/[0.06] text-[11px] text-zinc-400 space-y-1">
                    <div>• Direct dependents: <span className="text-amber-300">main.py:21</span></div>
                    <div>• Outgoing calls: <span className="text-emerald-300">verify_api_token()</span></div>
                    <div>• Impact radius: <span className="text-zinc-200">4 modules traversed</span></div>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-[11px] text-zinc-500">
                Hover any node to inspect static relationships. Click <span className="text-amber-300">Try demo project</span> to run the real backend analyzer.
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Feature Highlights */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <div className="mb-10">
          <span className="text-xs font-mono uppercase tracking-wider text-violet-400">Platform Capabilities</span>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mt-2">
            Every layer of your codebase, mapped with precision
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: Network,
              title: "Interactive Architecture Graph",
              desc: "Visualise files, modules, classes, functions and methods with pan, zoom, minimap, filtering and node inspection.",
              accent: "text-violet-400",
            },
            {
              icon: GitBranch,
              title: "Module Dependency Graph",
              desc: "Trace upstream and downstream imports, isolate highly connected hubs, and uncover tight coupling.",
              accent: "text-amber-400",
            },
            {
              icon: Code2,
              title: "Function-Level Call Graph",
              desc: "Inspect exact caller-to-callee chains extracted via Python AST and Tree-sitter with confirmed vs inferred badges.",
              accent: "text-emerald-400",
            },
            {
              icon: Zap,
              title: "Execution Flow Tracing",
              desc: "Automatically detect main entry points and HTTP route handlers to trace startup-to-service workflows.",
              accent: "text-cyan-400",
            },
            {
              icon: ShieldAlert,
              title: "Change Impact Engine",
              desc: "Simulate modifying any function or module to reveal direct, indirect, and uncertain downstream blast radius.",
              accent: "text-rose-400",
            },
            {
              icon: Bot,
              title: "AI Codebase Tutor",
              desc: "Ask architectural or debugging questions grounded in parsed AST symbols, graph edges, and exact file:line citations.",
              accent: "text-purple-400",
            },
          ].map((feat) => (
            <div
              key={feat.title}
              className="p-5 rounded-xl bg-[#0d0e14] border border-white/[0.07] hover:border-violet-500/35 transition-colors"
            >
              <feat.icon className={`w-5 h-5 ${feat.accent} mb-3`} />
              <h3 className="text-sm font-semibold text-zinc-100">{feat.title}</h3>
              <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative z-10 max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <div className="mb-10">
          <span className="text-xs font-mono uppercase tracking-wider text-amber-400">Pipeline</span>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mt-2">From raw repository to living map</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              step: "01",
              title: "Safe Ingestion",
              desc: "Upload a ZIP archive or paste a public GitHub URL. ZipSlip traversal checks and binary exclusions protect every scan without executing repository code.",
              icon: Upload,
            },
            {
              step: "02",
              title: "AST, Tree-sitter & NetworkX",
              desc: "Python AST, Tree-sitter grammars, and regex fallbacks extract classes, methods, imports, and call sites into a directed NetworkX graph.",
              icon: Cpu,
            },
            {
              step: "03",
              title: "Inspect, Simulate & Query",
              desc: "Navigate graphs directly into Monaco Editor at exact line numbers, simulate refactoring impact, and query the AI Tutor.",
              icon: Terminal,
            },
          ].map((item) => (
            <div key={item.step} className="p-6 rounded-xl bg-[#0d0e14] border border-white/[0.07]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono text-violet-400">STEP {item.step}</span>
                <item.icon className="w-4 h-4 text-zinc-500" />
              </div>
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Technology Section */}
      <section id="architecture" className="relative z-10 max-w-7xl mx-auto px-6 py-14 border-t border-white/[0.06]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">Built With</span>
            <h3 className="text-lg font-semibold text-white mt-1">Production-grade developer tooling</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "React Flow", icon: Layers },
              { label: "Monaco Editor", icon: FileCode2 },
              { label: "FastAPI + WebSockets", icon: Zap },
              { label: "Python AST & Tree-sitter", icon: Code2 },
              { label: "NetworkX + SQLite", icon: Network },
            ].map((tech) => (
              <span
                key={tech.label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-300 bg-[#12131c] border border-white/[0.07]"
              >
                <tech.icon className="w-3.5 h-3.5 text-violet-400" />
                {tech.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8 px-6 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>CodeAtlas Intel — Team Eternals • Unisys Problem Statement 02 • CodeRed'26</div>
          <div className="font-mono text-[11px] text-zinc-600">
            Static analysis never executes uploaded repository scripts.
          </div>
        </div>
      </footer>
    </div>
  );
};

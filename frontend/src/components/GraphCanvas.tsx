import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  Box,
  Code2,
  Eye,
  FileCode2,
  Filter,
  Folder,
  GitFork,
  Maximize2,
  Search,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { EdgeType, GraphData, GraphEdge, GraphNode, NodeType } from "../types/api";

interface GraphCanvasProps {
  title: string;
  subtitle: string;
  graphData: GraphData;
  mode: "architecture" | "dependencies" | "call-graph";
  onOpenSource: (filePath: string, line?: number) => void;
  onRunImpact: (nodeId: string) => void;
  externalSearch?: string;
}

const NODE_STYLE_META: Record<
  NodeType,
  { color: string; bg: string; border: string; label: string; icon: React.FC<{ className?: string }> }
> = {
  module: {
    color: "#818cf8",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/40",
    label: "MODULE",
    icon: Folder,
  },
  file: {
    color: "#8b5cf6",
    bg: "bg-violet-500/10",
    border: "border-violet-500/40",
    label: "FILE",
    icon: FileCode2,
  },
  class: {
    color: "#eab308",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    label: "CLASS",
    icon: Box,
  },
  function: {
    color: "#10b981",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    label: "FUNCTION",
    icon: Code2,
  },
  method: {
    color: "#06b6d4",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/40",
    label: "METHOD",
    icon: GitFork,
  },
};

const EDGE_COLORS: Record<EdgeType, string> = {
  IMPORTS: "#8b5cf6",
  DEPENDS_ON: "#eab308",
  CALLS: "#10b981",
  CONTAINS: "#475569",
  INHERITS: "#ec4899",
};

type CustomNodeData = {
  raw: GraphNode;
  highlighted: boolean;
  dimmed: boolean;
  selectedNode: boolean;
};

const CustomGraphNode: React.FC<NodeProps<Node<CustomNodeData>>> = ({ data }) => {
  const { raw, highlighted, dimmed, selectedNode } = data;
  const meta = NODE_STYLE_META[raw.type] || NODE_STYLE_META.file;
  const Icon = meta.icon;

  return (
    <div
      className={`min-w-[185px] max-w-[235px] rounded-lg px-3 py-2 bg-[#12131c] border transition-all shadow-lg ${
        selectedNode
          ? "border-amber-400 ring-2 ring-amber-400/30"
          : highlighted
          ? "border-violet-400 ring-1 ring-violet-400/30"
          : "border-white/[0.12] hover:border-white/[0.28]"
      } ${dimmed ? "opacity-25" : "opacity-100"}`}
      style={{
        borderLeftWidth: "3px",
        borderLeftColor: meta.color,
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-500 !border-0" />
      <div className="flex items-center justify-between gap-2 mb-1">
        <span
          className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${meta.bg}`}
          style={{ color: meta.color }}
        >
          <Icon className="w-2.5 h-2.5" />
          {meta.label}
        </span>
        {raw.metrics.is_entry_point && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Zap className="w-2.5 h-2.5" />
            ENTRY
          </span>
        )}
      </div>
      <div className="text-xs font-mono font-semibold text-zinc-100 truncate" title={raw.label}>
        {raw.label}
      </div>
      <div className="text-[10px] font-mono text-zinc-500 truncate mt-0.5" title={raw.file_path}>
        {raw.file_path}:{raw.line_start}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-zinc-500">
        <span>in: {raw.metrics.in_degree}</span>
        <span>out: {raw.metrics.out_degree}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-500 !border-0" />
    </div>
  );
};

const nodeTypes = { codeNode: CustomGraphNode };

function applyDagreLayout(
  rfNodes: Node<CustomNodeData>[],
  rfEdges: Edge[],
  direction: "LR" | "TB" = "LR"
): Node<CustomNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 42, ranksep: 110, marginx: 24, marginy: 24 });

  rfNodes.forEach((n) => {
    g.setNode(n.id, { width: 220, height: 82 });
  });
  rfEdges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return rfNodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: {
        x: (pos?.x ?? 0) - 110,
        y: (pos?.y ?? 0) - 41,
      },
    };
  });
}

const InnerGraphCanvas: React.FC<GraphCanvasProps> = ({
  title,
  subtitle,
  graphData,
  mode,
  onOpenSource,
  onRunImpact,
  externalSearch,
}) => {
  const { fitView } = useReactFlow();
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"LR" | "TB">("LR");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isolateSelected, setIsolateSelected] = useState(false);

  const availableNodeTypes = useMemo(() => {
    const set = new Set<NodeType>();
    graphData.nodes.forEach((n) => set.add(n.type));
    return Array.from(set);
  }, [graphData.nodes]);

  const availableEdgeTypes = useMemo(() => {
    const set = new Set<EdgeType>();
    graphData.edges.forEach((e) => set.add(e.type));
    return Array.from(set);
  }, [graphData.edges]);

  const [enabledNodeTypes, setEnabledNodeTypes] = useState<Set<NodeType>>(new Set());
  const [enabledEdgeTypes, setEnabledEdgeTypes] = useState<Set<EdgeType>>(new Set());

  useEffect(() => {
    setEnabledNodeTypes(new Set(availableNodeTypes));
    // In architecture mode, hide module->file CONTAINS if very large, otherwise show all
    const initEdges = new Set(availableEdgeTypes);
    setEnabledEdgeTypes(initEdges);
    setSelectedId(null);
    setIsolateSelected(false);
  }, [availableNodeTypes, availableEdgeTypes, mode]);

  useEffect(() => {
    if (externalSearch !== undefined) {
      setSearch(externalSearch);
    }
  }, [externalSearch]);

  const nodesById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    graphData.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [graphData.nodes]);

  // Compute connected neighbors for selected node
  const connectedSet = useMemo(() => {
    const s = new Set<string>();
    if (!selectedId) return s;
    s.add(selectedId);
    graphData.edges.forEach((e) => {
      if (e.source === selectedId) s.add(e.target);
      if (e.target === selectedId) s.add(e.source);
    });
    return s;
  }, [selectedId, graphData.edges]);

  const filteredRaw = useMemo(() => {
    const q = search.trim().toLowerCase();
    let fNodes = graphData.nodes.filter((n) => enabledNodeTypes.has(n.type));

    if (isolateSelected && selectedId) {
      fNodes = fNodes.filter((n) => connectedSet.has(n.id));
    }

    if (q) {
      const matchedIds = new Set(
        fNodes
          .filter(
            (n) =>
              n.label.toLowerCase().includes(q) ||
              n.file_path.toLowerCase().includes(q) ||
              n.name.toLowerCase().includes(q)
          )
          .map((n) => n.id)
      );
      // Include 1-hop neighbors when searching so relationships stay visible
      graphData.edges.forEach((e) => {
        if (matchedIds.has(e.source)) matchedIds.add(e.target);
        if (matchedIds.has(e.target)) matchedIds.add(e.source);
      });
      fNodes = fNodes.filter((n) => matchedIds.has(n.id));
    }

    // Performance safety cap for massive repos (keep top 160 nodes by connectivity)
    if (fNodes.length > 160) {
      fNodes = [...fNodes]
        .sort(
          (a, b) =>
            b.metrics.in_degree + b.metrics.out_degree - (a.metrics.in_degree + a.metrics.out_degree)
        )
        .slice(0, 160);
    }

    const visibleIds = new Set(fNodes.map((n) => n.id));
    const fEdges = graphData.edges.filter(
      (e) =>
        enabledEdgeTypes.has(e.type) &&
        visibleIds.has(e.source) &&
        visibleIds.has(e.target)
    );
    return { fNodes, fEdges };
  }, [graphData, enabledNodeTypes, enabledEdgeTypes, search, isolateSelected, selectedId, connectedSet]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CustomNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const rfNodes: Node<CustomNodeData>[] = filteredRaw.fNodes.map((n) => {
      const isSelected = n.id === selectedId;
      const isNeighbor = selectedId ? connectedSet.has(n.id) : false;
      return {
        id: n.id,
        type: "codeNode",
        position: { x: 0, y: 0 },
        data: {
          raw: n,
          selectedNode: isSelected,
          highlighted: isNeighbor && !isSelected,
          dimmed: Boolean(selectedId) && !isNeighbor && !isolateSelected,
        },
      };
    });

    const rfEdges: Edge[] = filteredRaw.fEdges.map((e) => {
      const color = EDGE_COLORS[e.type] || "#64748b";
      const isActive = selectedId ? e.source === selectedId || e.target === selectedId : true;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.type,
        animated: e.type === "CALLS" && isActive && !e.inferred,
        style: {
          stroke: color,
          strokeWidth: isActive ? 1.8 : 1,
          strokeDasharray: e.inferred || e.type === "CONTAINS" ? "5 4" : undefined,
          opacity: selectedId ? (isActive ? 0.95 : 0.14) : e.type === "CONTAINS" ? 0.35 : 0.72,
        },
        labelStyle: { fill: "#a1a1aa", fontSize: 9, fontFamily: "JetBrains Mono, monospace" },
        labelBgStyle: { fill: "#07070b", fillOpacity: 0.75 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 14,
          height: 14,
        },
      };
    });

    const laidOut = applyDagreLayout(rfNodes, rfEdges, direction);
    setNodes(laidOut);
    setEdges(rfEdges);
  }, [filteredRaw, direction, selectedId, connectedSet, isolateSelected, setNodes, setEdges]);

  const handleFit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.16, duration: 300 }), 40);
  }, [fitView]);

  useEffect(() => {
    handleFit();
  }, [direction, mode, isolateSelected, handleFit]);

  const selectedNodeObj = selectedId ? nodesById.get(selectedId) || null : null;

  const incomingEdges = useMemo(() => {
    if (!selectedId) return [];
    return graphData.edges
      .filter((e) => e.target === selectedId)
      .map((e) => ({ edge: e, node: nodesById.get(e.source) }))
      .filter((x): x is { edge: GraphEdge; node: GraphNode } => Boolean(x.node));
  }, [selectedId, graphData.edges, nodesById]);

  const outgoingEdges = useMemo(() => {
    if (!selectedId) return [];
    return graphData.edges
      .filter((e) => e.source === selectedId)
      .map((e) => ({ edge: e, node: nodesById.get(e.target) }))
      .filter((x): x is { edge: GraphEdge; node: GraphNode } => Boolean(x.node));
  }, [selectedId, graphData.edges, nodesById]);

  const toggleNodeType = (t: NodeType) => {
    setEnabledNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const toggleEdgeType = (t: EdgeType) => {
    setEnabledEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#07070b]">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-white/[0.06] bg-[#0a0b10] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-[11px] text-zinc-400">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search node or file..."
              className="pl-8 pr-3 py-1.5 w-48 rounded-lg bg-[#12131c] border border-white/[0.08] text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Node type pills */}
          <div className="flex items-center gap-1 bg-[#12131c] p-1 rounded-lg border border-white/[0.07]">
            <Filter className="w-3 h-3 text-zinc-500 ml-1 mr-0.5" />
            {availableNodeTypes.map((t) => {
              const active = enabledNodeTypes.has(t);
              const meta = NODE_STYLE_META[t];
              return (
                <button
                  key={t}
                  onClick={() => toggleNodeType(t)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-all ${
                    active ? "bg-white/[0.08] text-white" : "text-zinc-600 hover:text-zinc-400"
                  }`}
                  style={active ? { color: meta.color } : undefined}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Edge type pills */}
          <div className="hidden xl:flex items-center gap-1 bg-[#12131c] p-1 rounded-lg border border-white/[0.07]">
            {availableEdgeTypes.map((et) => {
              const active = enabledEdgeTypes.has(et);
              return (
                <button
                  key={et}
                  onClick={() => toggleEdgeType(et)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                    active ? "bg-white/[0.08] text-zinc-200" : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {et}
                </button>
              );
            })}
          </div>

          {selectedId && (
            <button
              onClick={() => setIsolateSelected(!isolateSelected)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border transition-colors ${
                isolateSelected
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                  : "bg-[#12131c] border-white/[0.08] text-zinc-300 hover:border-violet-500/40"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{isolateSelected ? "Showing Isolated" : "Isolate Node"}</span>
            </button>
          )}

          <button
            onClick={() => setDirection((d) => (d === "LR" ? "TB" : "LR"))}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#12131c] border border-white/[0.08] text-zinc-300 hover:border-violet-500/40"
          >
            Layout: {direction}
          </button>

          <button
            onClick={handleFit}
            className="p-1.5 rounded-lg bg-[#12131c] border border-white/[0.08] text-zinc-300 hover:text-white"
            title="Fit to screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas + Inspector Split */}
      <div className="flex-1 relative flex overflow-hidden">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => {
              setSelectedId(null);
              setIsolateSelected(false);
            }}
            fitView
            minZoom={0.15}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="rgba(255,255,255,0.05)" gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const raw = (n.data as CustomNodeData | undefined)?.raw;
                return raw ? NODE_STYLE_META[raw.type]?.color || "#8b5cf6" : "#8b5cf6";
              }}
              maskColor="rgba(7, 7, 11, 0.75)"
            />
          </ReactFlow>

          {/* Graph Legend */}
          <div className="absolute bottom-4 left-14 z-10 px-3 py-2 rounded-lg bg-[#0d0e14]/90 backdrop-blur-md border border-white/[0.08] flex flex-wrap items-center gap-3 text-[10px] font-mono text-zinc-400">
            <span className="text-zinc-500 uppercase">Legend:</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" /> IMPORTS</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> CALLS</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> DEPENDS_ON</span>
            <span className="flex items-center gap-1"><span className="w-4 border-t border-dashed border-zinc-400" /> Inferred / Contains</span>
          </div>
        </div>

        {/* Node Inspector Drawer */}
        {selectedNodeObj && (
          <aside className="w-80 sm:w-96 border-l border-white/[0.08] bg-[#0d0e14] flex flex-col overflow-hidden z-20">
            <div className="p-4 border-b border-white/[0.06] flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/[0.06]"
                    style={{ color: NODE_STYLE_META[selectedNodeObj.type]?.color }}
                  >
                    {selectedNodeObj.type}
                  </span>
                  {selectedNodeObj.language && (
                    <span className="text-[10px] font-mono text-zinc-500">{selectedNodeObj.language}</span>
                  )}
                </div>
                <h3 className="text-sm font-mono font-semibold text-white mt-1.5 break-all">
                  {selectedNodeObj.label}
                </h3>
                <div className="text-[11px] font-mono text-zinc-400 mt-0.5 break-all">
                  {selectedNodeObj.file_path}:{selectedNodeObj.line_start}
                  {selectedNodeObj.line_end > selectedNodeObj.line_start ? `-${selectedNodeObj.line_end}` : ""}
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="p-1 rounded text-zinc-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onOpenSource(selectedNodeObj.file_path, selectedNodeObj.line_start)}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  Open Source
                </button>
                <button
                  onClick={() => onRunImpact(selectedNodeObj.id)}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-[#181a26] hover:bg-[#1f2233] border border-amber-500/30 text-amber-300 inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Impact Check
                </button>
              </div>

              {selectedNodeObj.signature && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-zinc-500 mb-1">Signature</div>
                  <pre className="p-2.5 rounded-lg bg-[#07070b] border border-white/[0.06] text-[11px] font-mono text-violet-200 overflow-x-auto">
                    {selectedNodeObj.signature}
                  </pre>
                </div>
              )}

              {selectedNodeObj.docstring && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-zinc-500 mb-1">Docstring</div>
                  <div className="p-2.5 rounded-lg bg-[#12131c] border border-white/[0.06] text-xs text-zinc-300 leading-relaxed">
                    {selectedNodeObj.docstring}
                  </div>
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-[#12131c] border border-white/[0.06]">
                  <div className="text-[10px] text-zinc-500">In-Degree</div>
                  <div className="text-sm font-mono font-semibold text-white">{selectedNodeObj.metrics.in_degree}</div>
                </div>
                <div className="p-2 rounded-lg bg-[#12131c] border border-white/[0.06]">
                  <div className="text-[10px] text-zinc-500">Out-Degree</div>
                  <div className="text-sm font-mono font-semibold text-white">{selectedNodeObj.metrics.out_degree}</div>
                </div>
                <div className="p-2 rounded-lg bg-[#12131c] border border-white/[0.06]">
                  <div className="text-[10px] text-zinc-500">LOC</div>
                  <div className="text-sm font-mono font-semibold text-white">{selectedNodeObj.metrics.lines_of_code}</div>
                </div>
              </div>

              {/* Incoming Dependencies */}
              <div>
                <div className="text-[11px] font-mono uppercase text-zinc-400 mb-2">
                  Incoming ({incomingEdges.length})
                </div>
                {incomingEdges.length === 0 ? (
                  <div className="text-xs text-zinc-500">No incoming dependencies detected.</div>
                ) : (
                  <div className="space-y-1.5">
                    {incomingEdges.map(({ edge, node }) => (
                      <button
                        key={edge.id}
                        onClick={() => setSelectedId(node.id)}
                        className="w-full text-left p-2 rounded-lg bg-[#12131c] border border-white/[0.06] hover:border-violet-500/40 transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-zinc-200 truncate">{node.label}</div>
                          <div className="text-[10px] font-mono text-zinc-500 truncate">{node.file_path}</div>
                        </div>
                        <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-300">
                          {edge.type}{edge.inferred ? "*" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing Dependencies */}
              <div>
                <div className="text-[11px] font-mono uppercase text-zinc-400 mb-2">
                  Outgoing ({outgoingEdges.length})
                </div>
                {outgoingEdges.length === 0 ? (
                  <div className="text-xs text-zinc-500">No outgoing dependencies detected.</div>
                ) : (
                  <div className="space-y-1.5">
                    {outgoingEdges.map(({ edge, node }) => (
                      <button
                        key={edge.id}
                        onClick={() => setSelectedId(node.id)}
                        className="w-full text-left p-2 rounded-lg bg-[#12131c] border border-white/[0.06] hover:border-violet-500/40 transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-zinc-200 truncate">{node.label}</div>
                          <div className="text-[10px] font-mono text-zinc-500 truncate">{node.file_path}</div>
                        </div>
                        <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-300">
                          {edge.type}{edge.inferred ? "*" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 pt-2 border-t border-white/[0.06]">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <span>Edges marked with * are inferred via static name resolution.</span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export const GraphCanvas: React.FC<GraphCanvasProps> = (props) => (
  <ReactFlowProvider>
    <InnerGraphCanvas {...props} />
  </ReactFlowProvider>
);

export type ProjectStatus = "pending" | "processing" | "completed" | "failed";

export interface Project {
  id: string;
  name: string;
  source_type: "zip" | "github" | "demo";
  source_url?: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  error_message?: string | null;
  is_demo: boolean;
}

export type NodeType = "file" | "module" | "class" | "function" | "method";
export type EdgeType = "IMPORTS" | "CONTAINS" | "CALLS" | "DEPENDS_ON" | "INHERITS";

export interface GraphNodeMetrics {
  in_degree: number;
  out_degree: number;
  centrality: number;
  lines_of_code: number;
  is_entry_point: boolean;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  label: string;
  file_path: string;
  line_start: number;
  line_end: number;
  language?: string | null;
  signature?: string | null;
  docstring?: string | null;
  inferred: boolean;
  metrics: GraphNodeMetrics;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  inferred: boolean;
  line?: number | null;
  label?: string | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface LanguageStat {
  language: string;
  files: number;
  lines: number;
  percentage: number;
}

export interface ConnectedModuleStat {
  id: string;
  name: string;
  file_path: string;
  in_degree: number;
  out_degree: number;
  total_connections: number;
  centrality: number;
  reason: string;
}

export interface AnalysisActivityItem {
  step: string;
  detail: string;
  timestamp: string;
}

export interface AnalysisSummary {
  project_id: string;
  project_name: string;
  is_demo: boolean;
  total_files: number;
  source_files: number;
  total_lines: number;
  total_functions: number;
  total_classes: number;
  total_methods: number;
  total_dependencies: number;
  total_calls: number;
  confirmed_edges: number;
  inferred_edges: number;
  languages: LanguageStat[];
  frameworks: string[];
  entry_points: Array<{
    node_id: string;
    name: string;
    file_path: string;
    reason: string;
  }>;
  config_files: string[];
  most_connected_modules: ConnectedModuleStat[];
  critical_components: ConnectedModuleStat[];
  recent_activity: AnalysisActivityItem[];
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  language?: string | null;
  size: number;
  lines: number;
  symbol_count: number;
  children?: FileTreeNode[] | null;
}

export interface FileContentResponse {
  path: string;
  language: string;
  content: string;
  lines: number;
  symbols: GraphNode[];
}

export interface ExecutionStep {
  id: string;
  node_id: string;
  name: string;
  node_type: string;
  file_path: string;
  line_start: number;
  depth: number;
  inferred: boolean;
  edge_type: string;
  children: ExecutionStep[];
}

export interface ExecutionFlowEntry {
  entry_id: string;
  name: string;
  file_path: string;
  line_start: number;
  reason: string;
  confidence: "confirmed" | "inferred";
  steps: ExecutionStep[];
}

export interface ExecutionFlowResponse {
  entry_points: ExecutionFlowEntry[];
  total_flows: number;
}

export interface ImpactItem {
  node_id: string;
  name: string;
  type: string;
  file_path: string;
  line_start: number;
  impact_level: "direct" | "indirect" | "uncertain";
  distance: number;
  path: string[];
  path_labels: string[];
  reason: string;
}

export interface ImpactReport {
  target: GraphNode;
  direct_impacts: ImpactItem[];
  indirect_impacts: ImpactItem[];
  uncertain_impacts: ImpactItem[];
  total_affected: number;
  affected_files: string[];
  risk_level: "low" | "medium" | "high" | "critical";
  summary: string;
}

export interface Citation {
  file_path: string;
  line: number;
  symbol?: string | null;
  snippet?: string | null;
}

export interface ChatResponse {
  answer: string;
  mode: "llm" | "local_fallback";
  model_label: string;
  citations: Citation[];
  facts: string[];
  inferences: string[];
  related_node_ids: string[];
}

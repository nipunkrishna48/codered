from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class GitHubImportRequest(BaseModel):
    url: str = Field(..., min_length=3, description="GitHub repository URL or owner/repo")
    branch: Optional[str] = Field(None, description="Optional branch name")


class ProjectResponse(BaseModel):
    id: str
    name: str
    source_type: Literal["zip", "github", "demo"]
    source_url: Optional[str] = None
    status: Literal["pending", "processing", "completed", "failed"]
    created_at: str
    updated_at: str
    error_message: Optional[str] = None
    is_demo: bool = False


class GraphNodeMetrics(BaseModel):
    in_degree: int = 0
    out_degree: int = 0
    centrality: float = 0.0
    lines_of_code: int = 0
    is_entry_point: bool = False


class GraphNode(BaseModel):
    id: str
    type: Literal["file", "module", "class", "function", "method"]
    name: str
    label: str
    file_path: str
    line_start: int = 1
    line_end: int = 1
    language: Optional[str] = None
    signature: Optional[str] = None
    docstring: Optional[str] = None
    inferred: bool = False
    metrics: GraphNodeMetrics = Field(default_factory=GraphNodeMetrics)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: Literal["IMPORTS", "CONTAINS", "CALLS", "DEPENDS_ON", "INHERITS"]
    inferred: bool = False
    line: Optional[int] = None
    label: Optional[str] = None


class GraphData(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class LanguageStat(BaseModel):
    language: str
    files: int
    lines: int
    percentage: float


class ConnectedModuleStat(BaseModel):
    id: str
    name: str
    file_path: str
    in_degree: int
    out_degree: int
    total_connections: int
    centrality: float
    reason: str


class AnalysisActivityItem(BaseModel):
    step: str
    detail: str
    timestamp: str


class AnalysisSummary(BaseModel):
    project_id: str
    project_name: str
    is_demo: bool = False
    total_files: int
    source_files: int
    total_lines: int
    total_functions: int
    total_classes: int
    total_methods: int
    total_dependencies: int
    total_calls: int
    confirmed_edges: int
    inferred_edges: int
    languages: List[LanguageStat]
    frameworks: List[str]
    entry_points: List[Dict[str, Any]]
    config_files: List[str]
    most_connected_modules: List[ConnectedModuleStat]
    critical_components: List[ConnectedModuleStat]
    recent_activity: List[AnalysisActivityItem]


class FileTreeNode(BaseModel):
    name: str
    path: str
    type: Literal["file", "directory"]
    language: Optional[str] = None
    size: int = 0
    lines: int = 0
    symbol_count: int = 0
    children: Optional[List["FileTreeNode"]] = None


class FileContentResponse(BaseModel):
    path: str
    language: str
    content: str
    lines: int
    symbols: List[GraphNode] = Field(default_factory=list)


class ExecutionStep(BaseModel):
    id: str
    node_id: str
    name: str
    node_type: str
    file_path: str
    line_start: int
    depth: int
    inferred: bool = False
    edge_type: str = "CALLS"
    children: List["ExecutionStep"] = Field(default_factory=list)


class ExecutionFlowEntry(BaseModel):
    entry_id: str
    name: str
    file_path: str
    line_start: int
    reason: str
    confidence: Literal["confirmed", "inferred"]
    steps: List[ExecutionStep]


class ExecutionFlowResponse(BaseModel):
    entry_points: List[ExecutionFlowEntry]
    total_flows: int


class ImpactItem(BaseModel):
    node_id: str
    name: str
    type: str
    file_path: str
    line_start: int
    impact_level: Literal["direct", "indirect", "uncertain"]
    distance: int
    path: List[str]
    path_labels: List[str]
    reason: str


class ImpactReport(BaseModel):
    target: GraphNode
    direct_impacts: List[ImpactItem]
    indirect_impacts: List[ImpactItem]
    uncertain_impacts: List[ImpactItem]
    total_affected: int
    affected_files: List[str]
    risk_level: Literal["low", "medium", "high", "critical"]
    summary: str


class ChatMessageInput(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    history: List[ChatMessageInput] = Field(default_factory=list)
    focus_node_id: Optional[str] = None


class Citation(BaseModel):
    file_path: str
    line: int
    symbol: Optional[str] = None
    snippet: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    mode: Literal["llm", "local_fallback"]
    model_label: str
    citations: List[Citation]
    facts: List[str]
    inferences: List[str]
    related_node_ids: List[str]

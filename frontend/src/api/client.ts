import type {
  AnalysisSummary,
  ChatResponse,
  ExecutionFlowResponse,
  FileContentResponse,
  FileTreeNode,
  GraphData,
  ImpactReport,
  Project,
} from "../types/api";

const API_BASE = "";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, init);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.detail) {
        detail = typeof errBody.detail === "string" ? errBody.detail : JSON.stringify(errBody.detail);
      }
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => requestJson<{ status: string }>("/api/health"),
  listProjects: () => requestJson<Project[]>("/api/projects"),
  getProject: (id: string) => requestJson<Project>(`/api/projects/${id}`),
  createDemoProject: () =>
    requestJson<Project>("/api/projects/demo", {
      method: "POST",
    }),
  uploadZip: (file: File, onProgress?: (pct: number) => void): Promise<Project> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/projects/upload`);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) {
          onProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as Project);
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.detail || `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        }
      };
      xhr.onerror = () => reject(new Error("Network error while uploading ZIP file."));
      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    });
  },
  importGithub: (url: string, branch?: string) =>
    requestJson<Project>("/api/projects/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, branch: branch || null }),
    }),
  getAnalysis: (id: string) => requestJson<AnalysisSummary>(`/api/projects/${id}/analysis`),
  getGraph: (id: string) => requestJson<GraphData>(`/api/projects/${id}/graph`),
  getDependencies: (id: string) => requestJson<GraphData>(`/api/projects/${id}/dependencies`),
  getCallGraph: (id: string) => requestJson<GraphData>(`/api/projects/${id}/call-graph`),
  getExecutionFlow: (id: string) => requestJson<ExecutionFlowResponse>(`/api/projects/${id}/execution-flow`),
  getFiles: (id: string) =>
    requestJson<{ tree: FileTreeNode[]; file_count: number }>(`/api/projects/${id}/files`),
  getFileContent: (id: string, path: string) =>
    requestJson<FileContentResponse>(
      `/api/projects/${id}/files/content?path=${encodeURIComponent(path)}`
    ),
  getImpact: (id: string, nodeId: string) =>
    requestJson<ImpactReport>(
      `/api/projects/${id}/impact?node_id=${encodeURIComponent(nodeId)}`
    ),
  chat: (
    id: string,
    question: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    focusNodeId?: string
  ) =>
    requestJson<ChatResponse>(`/api/projects/${id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, focus_node_id: focusNodeId || null }),
    }),
};

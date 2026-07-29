import type {
  Catalog,
  ComponentNode,
  Connection,
  ProjectDetail,
  ProjectSummary,
  Requirement,
  SimulationResult,
} from "../types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface ProjectGraphPayload {
  name?: string;
  components: ComponentNode[];
  connections: Connection[];
  requirements: Requirement[];
}

export const api = {
  getCatalog: () => request<Catalog>("/catalog"),
  listProjects: () => request<ProjectSummary[]>("/projects"),
  createProject: (name: string) =>
    request<ProjectDetail>("/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getProject: (id: string) => request<ProjectDetail>(`/projects/${id}`),
  saveProject: (id: string, payload: ProjectGraphPayload) =>
    request<ProjectDetail>(`/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
  simulate: (id: string) =>
    request<SimulationResult>(`/projects/${id}/simulate`, { method: "POST" }),
};

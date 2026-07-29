export type Category = "edge" | "application" | "data" | "caching" | "async";

export interface CatalogEntry {
  label: string;
  category: Category;
  capacity_rps: number | null;
  latency_ms: number;
  availability_pct: number;
  managed_ha: boolean;
  description: string;
}

export interface Catalog {
  categories: Category[];
  types: Record<string, CatalogEntry>;
}

export interface ComponentProps {
  capacity_rps?: number;
  latency_ms?: number;
  availability_pct?: number;
  replicas?: number;
}

export interface ComponentNode {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  props: ComponentProps;
}

export type Protocol = "sync_http" | "async_queue" | "tcp";

export interface Connection {
  id: string;
  source_id: string;
  target_id: string;
  protocol: Protocol;
  label: string;
}

export type RequirementKind = "functional" | "nonfunctional";

export interface Requirement {
  id: string;
  kind: RequirementKind;
  subtype: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
  description: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  components: ComponentNode[];
  connections: Connection[];
  requirements: Requirement[];
}

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  rule_id: string;
  message: string;
  component_ids: string[];
  connection_ids: string[];
  requirement_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any>;
}

export interface SimulationResult {
  mode: string;
  findings: Finding[];
  load?: LoadTick | null;
}

// --- Live load simulation ---

export interface ComponentLoad {
  offered: number;
  accepted: number;
  dropped: number;
  capacity: number | null;
  utilization: number;
  latency_ms: number;
  saturated: boolean;
}

export interface ConnectionLoad {
  rps: number;
  protocol: Protocol;
  saturated: boolean;
}

export interface LoadTotals {
  arrival_rps: number;
  base_rps: number;
  served_rps: number;
  dropped_rps: number;
  max_utilization: number;
  critical_path_latency_ms: number;
  bottleneck_id: string | null;
  total_requests: number;
  total_dropped: number;
}

// --- Recommendations ---

export type Priority = "critical" | "high" | "medium" | "low";

export interface Recommendation {
  rule_id: string;
  priority: Priority;
  component_ids: string[];
  connection_ids: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any>;
}

export interface AdviceSummary {
  served_ratio: number;
  dropped_rps: number;
  max_utilization: number;
  critical_path_latency_ms: number;
  critical_count: number;
  high_count: number;
  healthy: boolean;
}

export interface AdviceResult {
  arrival_rps: number;
  summary: AdviceSummary;
  recommendations: Recommendation[];
}

export interface LoadTick {
  type?: string;
  tick: number;
  elapsed_s: number;
  components: Record<string, ComponentLoad>;
  connections: Record<string, ConnectionLoad>;
  totals: LoadTotals;
}

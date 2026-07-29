import { create } from "zustand";
import { api } from "./api/client";
import type {
  Catalog,
  ComponentNode,
  Connection,
  Finding,
  ProjectDetail,
  Requirement,
} from "./types";

function uid(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

interface EditorState {
  catalog: Catalog | null;
  projectId: string | null;
  projectName: string;
  components: ComponentNode[];
  connections: Connection[];
  requirements: Requirement[];
  selectedComponentId: string | null;
  selectedConnectionId: string | null;
  findings: Finding[];
  highlightedIds: Set<string>;
  saving: boolean;
  simulating: boolean;
  dirty: boolean;

  loadCatalog: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  reset: () => void;

  addComponent: (type: string, x: number, y: number) => void;
  updateComponentPosition: (id: string, x: number, y: number) => void;
  updateComponent: (id: string, patch: Partial<ComponentNode>) => void;
  removeComponent: (id: string) => void;

  addConnection: (sourceId: string, targetId: string) => void;
  updateConnection: (id: string, patch: Partial<Connection>) => void;
  removeConnection: (id: string) => void;

  addRequirement: (req: Omit<Requirement, "id">) => void;
  removeRequirement: (id: string) => void;

  select: (componentId: string | null, connectionId: string | null) => void;
  setHighlighted: (ids: string[]) => void;

  save: () => Promise<void>;
  runSimulation: () => Promise<void>;
}

export const useStore = create<EditorState>((set, get) => ({
  catalog: null,
  projectId: null,
  projectName: "",
  components: [],
  connections: [],
  requirements: [],
  selectedComponentId: null,
  selectedConnectionId: null,
  findings: [],
  highlightedIds: new Set(),
  saving: false,
  simulating: false,
  dirty: false,

  loadCatalog: async () => {
    if (get().catalog) return;
    const catalog = await api.getCatalog();
    set({ catalog });
  },

  openProject: async (id: string) => {
    const project: ProjectDetail = await api.getProject(id);
    set({
      projectId: project.id,
      projectName: project.name,
      components: project.components,
      connections: project.connections,
      requirements: project.requirements,
      selectedComponentId: null,
      selectedConnectionId: null,
      findings: [],
      highlightedIds: new Set(),
      dirty: false,
    });
  },

  reset: () =>
    set({
      projectId: null,
      projectName: "",
      components: [],
      connections: [],
      requirements: [],
      selectedComponentId: null,
      selectedConnectionId: null,
      findings: [],
      highlightedIds: new Set(),
      dirty: false,
    }),

  addComponent: (type, x, y) => {
    const catalog = get().catalog;
    const label = catalog?.types[type]?.label ?? type;
    const comp: ComponentNode = { id: uid(), type, name: label, x, y, props: {} };
    set((s) => ({ components: [...s.components, comp], dirty: true }));
  },

  updateComponentPosition: (id, x, y) => {
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, x, y } : c)),
      dirty: true,
    }));
  },

  updateComponent: (id, patch) => {
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      dirty: true,
    }));
  },

  removeComponent: (id) => {
    set((s) => ({
      components: s.components.filter((c) => c.id !== id),
      connections: s.connections.filter(
        (c) => c.source_id !== id && c.target_id !== id
      ),
      selectedComponentId: s.selectedComponentId === id ? null : s.selectedComponentId,
      dirty: true,
    }));
  },

  addConnection: (sourceId, targetId) => {
    const conn: Connection = {
      id: uid(),
      source_id: sourceId,
      target_id: targetId,
      protocol: "sync_http",
      label: "",
    };
    set((s) => ({ connections: [...s.connections, conn], dirty: true }));
  },

  updateConnection: (id, patch) => {
    set((s) => ({
      connections: s.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      dirty: true,
    }));
  },

  removeConnection: (id) => {
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId,
      dirty: true,
    }));
  },

  addRequirement: (req) => {
    set((s) => ({
      requirements: [...s.requirements, { ...req, id: uid() }],
      dirty: true,
    }));
  },

  removeRequirement: (id) => {
    set((s) => ({
      requirements: s.requirements.filter((r) => r.id !== id),
      dirty: true,
    }));
  },

  select: (componentId, connectionId) =>
    set({ selectedComponentId: componentId, selectedConnectionId: connectionId }),

  setHighlighted: (ids) => set({ highlightedIds: new Set(ids) }),

  save: async () => {
    const s = get();
    if (!s.projectId) return;
    set({ saving: true });
    try {
      const project = await api.saveProject(s.projectId, {
        name: s.projectName,
        components: s.components,
        connections: s.connections,
        requirements: s.requirements,
      });
      set({
        components: project.components,
        connections: project.connections,
        requirements: project.requirements,
        dirty: false,
      });
    } finally {
      set({ saving: false });
    }
  },

  runSimulation: async () => {
    const s = get();
    if (!s.projectId) return;
    await get().save();
    set({ simulating: true });
    try {
      const result = await api.simulate(s.projectId);
      set({ findings: result.findings });
    } finally {
      set({ simulating: false });
    }
  },
}));

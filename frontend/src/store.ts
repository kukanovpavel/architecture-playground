import { create } from "zustand";
import { api } from "./api/client";
import { LiveSimulationSocket } from "./api/liveSimulation";
import type {
  AdviceResult,
  Catalog,
  ComponentNode,
  Connection,
  Finding,
  LoadTick,
  ProjectDetail,
  Requirement,
} from "./types";

function uid(): string {
  // crypto.randomUUID() only exists in secure contexts (localhost/HTTPS) — it's
  // undefined when the app is opened over plain HTTP via a LAN IP, so fall back
  // to crypto.getRandomValues (available everywhere) and, failing that, Math.random.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

interface HistorySnapshot {
  components: ComponentNode[];
  connections: Connection[];
  requirements: Requirement[];
}

const MAX_HISTORY = 50;

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

  clipboard: ComponentNode | null;
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  liveRunning: boolean;
  liveTick: LoadTick | null;
  liveRate: number | null;
  liveError: string | null;
  /** Highest arrival rate seen during the run — what the advice is judged against. */
  livePeakRps: number;

  advice: AdviceResult | null;
  advising: boolean;

  loadCatalog: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  reset: () => void;

  addComponent: (type: string, x: number, y: number) => void;
  updateComponentPosition: (id: string, x: number, y: number, commit?: boolean) => void;
  updateComponent: (id: string, patch: Partial<ComponentNode>) => void;
  removeComponent: (id: string) => void;

  addConnection: (sourceId: string, targetId: string) => void;
  updateConnection: (id: string, patch: Partial<Connection>) => void;
  removeConnection: (id: string) => void;

  addRequirement: (req: Omit<Requirement, "id">) => void;
  removeRequirement: (id: string) => void;

  select: (componentId: string | null, connectionId: string | null) => void;
  setHighlighted: (ids: string[]) => void;

  deleteSelected: () => void;
  copySelected: () => void;
  cutSelected: () => void;
  pasteClipboard: () => void;
  undo: () => void;
  redo: () => void;

  save: () => Promise<void>;
  runSimulation: (initialRate?: number) => Promise<void>;
  stopSimulation: () => void;
  setLiveRate: (rps: number) => void;
  fetchAdvice: () => Promise<void>;
}

function snapshot(s: Pick<EditorState, "components" | "connections" | "requirements">): HistorySnapshot {
  return {
    components: s.components,
    connections: s.connections,
    requirements: s.requirements,
  };
}

// Merge this into a `set()` call from any mutating action to push the
// pre-mutation state onto the undo stack and clear the redo stack.
function pushUndo(s: EditorState): Pick<EditorState, "past" | "future"> {
  return {
    past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
    future: [],
  };
}

// Lives outside the store: it's an imperative connection handle, not state to
// render. The store only mirrors what the UI needs to know about it.
let liveSocket: LiveSimulationSocket | null = null;

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

  clipboard: null,
  past: [],
  future: [],

  liveRunning: false,
  liveTick: null,
  liveRate: null,
  liveError: null,
  livePeakRps: 0,

  advice: null,
  advising: false,

  loadCatalog: async () => {
    if (get().catalog) return;
    const catalog = await api.getCatalog();
    set({ catalog });
  },

  openProject: async (id: string) => {
    liveSocket?.stop();
    liveSocket = null;
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
      clipboard: null,
      past: [],
      future: [],
      liveRunning: false,
      liveTick: null,
      liveRate: null,
      liveError: null,
      livePeakRps: 0,
      advice: null,
      advising: false,
    });
  },

  reset: () => {
    liveSocket?.stop();
    liveSocket = null;
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
      clipboard: null,
      past: [],
      future: [],
      liveRunning: false,
      liveTick: null,
      liveRate: null,
      liveError: null,
      livePeakRps: 0,
      advice: null,
      advising: false,
    });
  },

  addComponent: (type, x, y) => {
    const catalog = get().catalog;
    const label = catalog?.types[type]?.label ?? type;
    const comp: ComponentNode = { id: uid(), type, name: label, x, y, props: {} };
    set((s) => ({ ...pushUndo(s), components: [...s.components, comp], dirty: true }));
  },

  updateComponentPosition: (id, x, y, commit = true) => {
    set((s) => ({
      ...(commit ? pushUndo(s) : null),
      components: s.components.map((c) => (c.id === id ? { ...c, x, y } : c)),
      dirty: true,
    }));
  },

  updateComponent: (id, patch) => {
    set((s) => ({
      ...pushUndo(s),
      components: s.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      dirty: true,
    }));
  },

  removeComponent: (id) => {
    set((s) => ({
      ...pushUndo(s),
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
    set((s) => ({ ...pushUndo(s), connections: [...s.connections, conn], dirty: true }));
  },

  updateConnection: (id, patch) => {
    set((s) => ({
      ...pushUndo(s),
      connections: s.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      dirty: true,
    }));
  },

  removeConnection: (id) => {
    set((s) => ({
      ...pushUndo(s),
      connections: s.connections.filter((c) => c.id !== id),
      selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId,
      dirty: true,
    }));
  },

  addRequirement: (req) => {
    set((s) => ({
      ...pushUndo(s),
      requirements: [...s.requirements, { ...req, id: uid() }],
      dirty: true,
    }));
  },

  removeRequirement: (id) => {
    set((s) => ({
      ...pushUndo(s),
      requirements: s.requirements.filter((r) => r.id !== id),
      dirty: true,
    }));
  },

  select: (componentId, connectionId) =>
    set({ selectedComponentId: componentId, selectedConnectionId: connectionId }),

  setHighlighted: (ids) => set({ highlightedIds: new Set(ids) }),

  deleteSelected: () => {
    const s = get();
    if (s.selectedComponentId) {
      get().removeComponent(s.selectedComponentId);
    } else if (s.selectedConnectionId) {
      get().removeConnection(s.selectedConnectionId);
    }
  },

  copySelected: () => {
    const s = get();
    const comp = s.components.find((c) => c.id === s.selectedComponentId);
    if (comp) set({ clipboard: comp });
  },

  cutSelected: () => {
    get().copySelected();
    get().deleteSelected();
  },

  pasteClipboard: () => {
    const s = get();
    if (!s.clipboard) return;
    const newComp: ComponentNode = {
      ...s.clipboard,
      id: uid(),
      x: s.clipboard.x + 40,
      y: s.clipboard.y + 40,
      props: { ...s.clipboard.props },
    };
    set((st) => ({
      ...pushUndo(st),
      components: [...st.components, newComp],
      selectedComponentId: newComp.id,
      selectedConnectionId: null,
      clipboard: newComp,
      dirty: true,
    }));
  },

  undo: () => {
    const s = get();
    if (s.past.length === 0) return;
    const previous = s.past[s.past.length - 1];
    set({
      past: s.past.slice(0, -1),
      future: [snapshot(s), ...s.future].slice(0, MAX_HISTORY),
      components: previous.components,
      connections: previous.connections,
      requirements: previous.requirements,
      selectedComponentId: null,
      selectedConnectionId: null,
      dirty: true,
    });
  },

  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[0];
    set({
      future: s.future.slice(1),
      past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
      components: next.components,
      connections: next.connections,
      requirements: next.requirements,
      selectedComponentId: null,
      selectedConnectionId: null,
      dirty: true,
    });
  },

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

  runSimulation: async (initialRate) => {
    const s = get();
    if (!s.projectId || s.liveRunning) return;

    // Save first so the backend simulates exactly what's on the canvas, then
    // report the static findings before opening the live stream.
    await get().save();
    set({ simulating: true, liveError: null });
    try {
      const result = await api.simulate(s.projectId);
      set({ findings: result.findings });
    } finally {
      set({ simulating: false });
    }

    liveSocket?.stop();
    liveSocket = new LiveSimulationSocket(s.projectId, {
      onTick: (tick) =>
        set((st) => ({
          liveTick: tick,
          livePeakRps: Math.max(st.livePeakRps, tick.totals.arrival_rps),
        })),
      onStarted: (baseRps) => {
        set({ liveRunning: true, liveRate: initialRate ?? baseRps });
        if (initialRate !== undefined) liveSocket?.setRate(initialRate);
      },
      onError: (detail) => set({ liveError: detail, liveRunning: false }),
      onClosed: () => set({ liveRunning: false }),
    });
    liveSocket.start();
  },

  stopSimulation: () => {
    liveSocket?.stop();
    liveSocket = null;
    set({ liveRunning: false });
    // The run just finished — analyze what it revealed.
    get().fetchAdvice();
  },

  setLiveRate: (rps) => {
    set({ liveRate: rps });
    liveSocket?.setRate(rps);
  },

  fetchAdvice: async () => {
    const s = get();
    if (!s.projectId || s.advising) return;
    set({ advising: true });
    try {
      // Judge the design against the worst traffic it actually saw, so the
      // advice lines up with the saturation the user just watched.
      const rate = s.livePeakRps > 0 ? s.livePeakRps : (s.liveRate ?? undefined);
      const advice = await api.advise(s.projectId, rate);
      set({ advice });
    } catch {
      set({ advice: null });
    } finally {
      set({ advising: false });
    }
  },
}));

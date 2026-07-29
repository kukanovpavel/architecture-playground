import type { LoadTick } from "../types";

function wsUrl(projectId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/projects/${projectId}/simulate/live`;
}

export interface LiveSimulationHandlers {
  onTick: (tick: LoadTick) => void;
  onStarted?: (baseRps: number) => void;
  onError?: (detail: string) => void;
  onClosed?: () => void;
}

/**
 * Thin wrapper over the simulation WebSocket. The connection stays open —
 * and the backend keeps streaming ticks — until `stop()` is called.
 */
export class LiveSimulationSocket {
  private socket: WebSocket | null = null;
  private closedByUs = false;
  private projectId: string;
  private handlers: LiveSimulationHandlers;

  constructor(projectId: string, handlers: LiveSimulationHandlers) {
    this.projectId = projectId;
    this.handlers = handlers;
  }

  start(): void {
    const socket = new WebSocket(wsUrl(this.projectId));
    this.socket = socket;

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "tick") {
        this.handlers.onTick(message as LoadTick);
      } else if (message.type === "started") {
        this.handlers.onStarted?.(message.base_rps);
      } else if (message.type === "error") {
        this.handlers.onError?.(message.detail ?? "Simulation error");
      }
    };

    socket.onerror = () => {
      if (!this.closedByUs) this.handlers.onError?.("Connection failed");
    };

    socket.onclose = () => {
      this.socket = null;
      this.handlers.onClosed?.();
    };
  }

  setRate(rps: number): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: "set_rate", rps }));
    }
  }

  stop(): void {
    this.closedByUs = true;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: "stop" }));
    }
    this.socket?.close();
    this.socket = null;
  }
}

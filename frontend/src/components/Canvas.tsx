import { useCallback, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnConnect,
  type OnNodesChange,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore } from "../store";
import { ComponentNodeView, type ComponentNodeData } from "./ComponentNodeView";
import { useCatalogText } from "../i18n";
import { useThemeStore } from "../theme";
import { formatRps } from "../format";

const nodeTypes = { component: ComponentNodeView };

export function Canvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const catalog = useStore((s) => s.catalog);
  const components = useStore((s) => s.components);
  const connections = useStore((s) => s.connections);
  const selectedComponentId = useStore((s) => s.selectedComponentId);
  const selectedConnectionId = useStore((s) => s.selectedConnectionId);
  const highlightedIds = useStore((s) => s.highlightedIds);

  const addComponent = useStore((s) => s.addComponent);
  const updateComponentPosition = useStore((s) => s.updateComponentPosition);
  const addConnection = useStore((s) => s.addConnection);
  const select = useStore((s) => s.select);
  const catalogText = useCatalogText();
  const theme = useThemeStore((s) => s.theme);
  const liveTick = useStore((s) => s.liveTick);
  const liveRunning = useStore((s) => s.liveRunning);

  const nodes: Node[] = useMemo(
    () =>
      components.map((c) => {
        const entry = catalog?.types[c.type];
        const typeLabel = catalogText.label(c.type, entry?.label ?? c.type);
        const data: ComponentNodeData = {
          label: c.name || typeLabel,
          typeLabel,
          category: (entry?.category ?? "application") as ComponentNodeData["category"],
          replicas: c.props.replicas ?? 1,
          highlighted: highlightedIds.has(c.id),
          load: liveTick?.components[c.id] ?? null,
          isBottleneck: liveTick?.totals.bottleneck_id === c.id,
        };
        return {
          id: c.id,
          type: "component",
          position: { x: c.x, y: c.y },
          data,
          selected: c.id === selectedComponentId,
        };
      }),
    [components, catalog, highlightedIds, selectedComponentId, catalogText, liveTick]
  );

  // Busiest edge sets the scale, so stroke width stays readable whether the
  // design runs at 50 rps or 50k.
  const peakRps = useMemo(() => {
    if (!liveTick) return 0;
    return Object.values(liveTick.connections).reduce((max, c) => Math.max(max, c.rps), 0);
  }, [liveTick]);

  const edges: Edge[] = useMemo(
    () =>
      connections.map((conn) => {
        const isAsync = conn.protocol === "async_queue";
        const highlighted = highlightedIds.has(conn.id);
        const load = liveTick?.connections[conn.id];

        if (liveRunning && load) {
          const share = peakRps > 0 ? load.rps / peakRps : 0;
          const idle = load.rps < 0.5;
          // Faster dash march for heavier traffic: 1.6s when barely flowing,
          // down to 0.25s at the peak.
          const duration = idle ? 0 : 1.6 - share * 1.35;
          const stroke = load.saturated
            ? "#dc2626"
            : isAsync
              ? "#db2777"
              : highlighted
                ? "#dc2626"
                : "#2563eb";
          return {
            id: conn.id,
            source: conn.source_id,
            target: conn.target_id,
            label: idle ? "—" : `${formatRps(load.rps)} rps`,
            animated: !idle,
            selected: conn.id === selectedConnectionId,
            labelStyle: { fill: stroke, fontWeight: 700, fontSize: 11 },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 4,
            labelBgStyle: { fill: "var(--color-bg-panel)", fillOpacity: 0.9 },
            style: {
              stroke,
              strokeWidth: idle ? 1 : 1.5 + share * 4,
              strokeDasharray: isAsync ? "5 4" : undefined,
              animationDuration: duration ? `${duration.toFixed(2)}s` : undefined,
              opacity: idle ? 0.35 : 1,
            },
          };
        }

        return {
          id: conn.id,
          source: conn.source_id,
          target: conn.target_id,
          label: conn.label || conn.protocol,
          animated: isAsync,
          selected: conn.id === selectedConnectionId,
          style: {
            stroke: highlighted ? "#dc2626" : isAsync ? "#db2777" : "var(--color-edge)",
            strokeWidth: highlighted ? 3 : 1.5,
            strokeDasharray: isAsync ? "5 4" : undefined,
          },
        };
      }),
    [connections, highlightedIds, selectedConnectionId, liveTick, liveRunning, peakRps]
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          // Only push an undo snapshot once the drag ends (dragging === false),
          // not on every intermediate position update while the mouse moves.
          updateComponentPosition(
            change.id,
            change.position.x,
            change.position.y,
            change.dragging === false
          );
        }
      }
    },
    [updateComponentPosition]
  );

  const onConnect: OnConnect = useCallback(
    (params) => {
      if (params.source && params.target) {
        addConnection(params.source, params.target);
      }
    },
    [addConnection]
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => select(node.id, null),
    [select]
  );
  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_e, edge) => select(null, edge.id),
    [select]
  );
  const onPaneClick = useCallback(() => select(null, null), [select]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/x-component-type");
      if (!type) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addComponent(type, position.x, position.y);
    },
    [addComponent, screenToFlowPosition]
  );

  return (
    <div ref={wrapperRef} className="canvas-wrapper" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        className={theme === "dark" ? "dark" : undefined}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        deleteKeyCode={null}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

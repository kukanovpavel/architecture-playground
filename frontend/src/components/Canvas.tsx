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
        };
        return {
          id: c.id,
          type: "component",
          position: { x: c.x, y: c.y },
          data,
          selected: c.id === selectedComponentId,
        };
      }),
    [components, catalog, highlightedIds, selectedComponentId, catalogText]
  );

  const edges: Edge[] = useMemo(
    () =>
      connections.map((conn) => {
        const isAsync = conn.protocol === "async_queue";
        const highlighted = highlightedIds.has(conn.id);
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
    [connections, highlightedIds, selectedConnectionId]
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          updateComponentPosition(change.id, change.position.x, change.position.y);
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
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

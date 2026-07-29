import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CATEGORY_COLORS } from "../categoryColors";
import type { Category, ComponentLoad } from "../types";
import { useT } from "../i18n";
import { formatRps, utilizationColor } from "../format";

export interface ComponentNodeData {
  label: string;
  typeLabel: string;
  category: Category;
  replicas: number;
  highlighted: boolean;
  load?: ComponentLoad | null;
  isBottleneck?: boolean;
  [key: string]: unknown;
}

export function ComponentNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as ComponentNodeData;
  const color = CATEGORY_COLORS[d.category] ?? "#666";
  const t = useT();
  const load = d.load;

  const borderColor = d.isBottleneck
    ? "#dc2626"
    : d.highlighted
      ? "#dc2626"
      : selected
        ? "var(--color-text)"
        : color;

  return (
    <div
      style={{
        borderRadius: 8,
        border: `2px solid ${borderColor}`,
        background: "var(--color-node-bg)",
        minWidth: 150,
        boxShadow: d.isBottleneck
          ? "0 0 0 4px rgba(220,38,38,0.3)"
          : d.highlighted
            ? "0 0 0 3px rgba(220,38,38,0.25)"
            : "0 1px 3px var(--color-node-shadow)",
        fontSize: 12,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div
        style={{
          background: color,
          color: "#fff",
          padding: "3px 8px",
          borderRadius: "6px 6px 0 0",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {d.typeLabel}
      </div>
      <div style={{ padding: "6px 8px" }}>
        <div style={{ fontWeight: 600 }}>{d.label}</div>
        {d.replicas > 1 && (
          <div style={{ color: "var(--color-text-secondary)", marginTop: 2 }}>
            x{d.replicas} {t("replicas").toLowerCase()}
          </div>
        )}

        {load && (
          <div className="node-load">
            <div className="node-load-row">
              <span className="node-load-rps">{formatRps(load.accepted)} rps</span>
              <span
                className="node-load-util"
                style={{ color: utilizationColor(load.utilization) }}
              >
                {load.capacity === null ? "—" : `${Math.round(load.utilization * 100)}%`}
              </span>
            </div>
            {load.capacity !== null && (
              <div className="node-load-bar">
                <div
                  className="node-load-bar-fill"
                  style={{
                    width: `${Math.min(load.utilization, 1) * 100}%`,
                    background: utilizationColor(load.utilization),
                  }}
                />
              </div>
            )}
            <div className="node-load-meta">
              <span>{load.latency_ms.toFixed(0)} ms</span>
              {load.dropped > 0 && (
                <span className="node-load-dropped">
                  −{formatRps(load.dropped)} {t("droppedShort")}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

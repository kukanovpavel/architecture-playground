import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CATEGORY_COLORS } from "../categoryColors";
import type { Category } from "../types";
import { useT } from "../i18n";

export interface ComponentNodeData {
  label: string;
  typeLabel: string;
  category: Category;
  replicas: number;
  highlighted: boolean;
  [key: string]: unknown;
}

export function ComponentNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as ComponentNodeData;
  const color = CATEGORY_COLORS[d.category] ?? "#666";
  const t = useT();

  return (
    <div
      style={{
        borderRadius: 8,
        border: `2px solid ${d.highlighted ? "#dc2626" : selected ? "var(--color-text)" : color}`,
        background: "var(--color-node-bg)",
        minWidth: 140,
        boxShadow: d.highlighted
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
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

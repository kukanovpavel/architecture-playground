import { useStore } from "../store";
import { useT, useCatalogText } from "../i18n";

export function PropertiesPanel() {
  const catalog = useStore((s) => s.catalog);
  const components = useStore((s) => s.components);
  const connections = useStore((s) => s.connections);
  const selectedComponentId = useStore((s) => s.selectedComponentId);
  const selectedConnectionId = useStore((s) => s.selectedConnectionId);
  const updateComponent = useStore((s) => s.updateComponent);
  const removeComponent = useStore((s) => s.removeComponent);
  const updateConnection = useStore((s) => s.updateConnection);
  const removeConnection = useStore((s) => s.removeConnection);
  const t = useT();
  const catalogText = useCatalogText();

  const component = components.find((c) => c.id === selectedComponentId);
  const connection = connections.find((c) => c.id === selectedConnectionId);

  // Nothing selected — stay out of the way rather than showing an empty panel.
  if (!component && !connection) return null;

  if (component) {
    const defaults = catalog?.types[component.type];
    const description = defaults
      ? catalogText.description(component.type, defaults.description)
      : "";
    return (
      <div className="panel">
        <h3>{t("propertiesTitle")}</h3>
        <label>
          {t("name")}
          <input
            value={component.name}
            onChange={(e) => updateComponent(component.id, { name: e.target.value })}
          />
        </label>
        <label>
          {t("replicas")}
          <input
            type="number"
            min={1}
            value={component.props.replicas ?? 1}
            onChange={(e) =>
              updateComponent(component.id, {
                props: { ...component.props, replicas: Number(e.target.value) || 1 },
              })
            }
          />
        </label>
        <label>
          {t("capacity")}
          {defaults?.capacity_rps != null ? ` — ${t("defaultWord")} ${defaults.capacity_rps}` : ""}
          <input
            type="number"
            placeholder={
              defaults?.capacity_rps != null ? String(defaults.capacity_rps) : t("unbounded")
            }
            value={component.props.capacity_rps ?? ""}
            onChange={(e) =>
              updateComponent(component.id, {
                props: {
                  ...component.props,
                  capacity_rps: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })
            }
          />
        </label>
        <label>
          {t("latency")} — {t("defaultWord")} {defaults?.latency_ms ?? 0}
          <input
            type="number"
            placeholder={String(defaults?.latency_ms ?? 0)}
            value={component.props.latency_ms ?? ""}
            onChange={(e) =>
              updateComponent(component.id, {
                props: {
                  ...component.props,
                  latency_ms: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })
            }
          />
        </label>
        <label>
          {t("availabilityPct")} — {t("defaultWord")} {defaults?.availability_pct ?? 99.9}
          <input
            type="number"
            step="0.01"
            placeholder={String(defaults?.availability_pct ?? 99.9)}
            value={component.props.availability_pct ?? ""}
            onChange={(e) =>
              updateComponent(component.id, {
                props: {
                  ...component.props,
                  availability_pct: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })
            }
          />
        </label>
        {description && <p className="hint">{description}</p>}
        <button className="danger" onClick={() => removeComponent(component.id)}>
          {t("deleteComponent")}
        </button>
      </div>
    );
  }

  if (connection) {
    return (
      <div className="panel">
        <h3>{t("propertiesTitle")}</h3>
        <label>
          {t("protocol")}
          <select
            value={connection.protocol}
            onChange={(e) =>
              updateConnection(connection.id, {
                protocol: e.target.value as typeof connection.protocol,
              })
            }
          >
            <option value="sync_http">{t("protocolSyncHttp")}</option>
            <option value="async_queue">{t("protocolAsyncQueue")}</option>
            <option value="tcp">{t("protocolTcp")}</option>
          </select>
        </label>
        <label>
          {t("label")}
          <input
            value={connection.label}
            onChange={(e) => updateConnection(connection.id, { label: e.target.value })}
          />
        </label>
        <button className="danger" onClick={() => removeConnection(connection.id)}>
          {t("deleteConnection")}
        </button>
      </div>
    );
  }

  return null;
}

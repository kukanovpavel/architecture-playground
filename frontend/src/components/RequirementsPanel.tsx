import { useState } from "react";
import { useStore } from "../store";
import { useT, useCatalogText } from "../i18n";
import type { UIKey } from "../i18n/translations";

const NONFUNCTIONAL_SUBTYPES: { value: string; labelKey: UIKey; unit: string }[] = [
  { value: "max_latency_ms", labelKey: "metricMaxLatency", unit: "ms" },
  { value: "min_throughput_rps", labelKey: "metricMinThroughput", unit: "rps" },
  { value: "min_availability_pct", labelKey: "metricMinAvailability", unit: "%" },
];

export function RequirementsPanel() {
  const catalog = useStore((s) => s.catalog);
  const requirements = useStore((s) => s.requirements);
  const addRequirement = useStore((s) => s.addRequirement);
  const removeRequirement = useStore((s) => s.removeRequirement);
  const t = useT();
  const catalogText = useCatalogText();

  const [kind, setKind] = useState<"functional" | "nonfunctional">("nonfunctional");
  const [subtype, setSubtype] = useState(NONFUNCTIONAL_SUBTYPES[0].value);
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [sequence, setSequence] = useState<string[]>([]);

  const submitNonFunctional = () => {
    if (!value) return;
    const meta = NONFUNCTIONAL_SUBTYPES.find((s) => s.value === subtype)!;
    const paramKey =
      subtype === "max_latency_ms"
        ? "value_ms"
        : subtype === "min_availability_pct"
          ? "value_pct"
          : "value";
    addRequirement({
      kind: "nonfunctional",
      subtype,
      params: { [paramKey]: Number(value) },
      description: description || `${t(meta.labelKey)}: ${value}${meta.unit}`,
    });
    setValue("");
    setDescription("");
  };

  const submitFunctional = () => {
    if (sequence.length === 0) return;
    const labels = sequence.map((key) => catalogText.label(key, key));
    addRequirement({
      kind: "functional",
      subtype: "path_exists",
      params: { types: sequence },
      description: description || `${t("pathWord")}: ${labels.join(" -> ")}`,
    });
    setSequence([]);
    setDescription("");
  };

  return (
    <div className="panel">
      <h3>{t("requirementsTitle")}</h3>
      <div className="tabs">
        <button
          className={kind === "nonfunctional" ? "active" : ""}
          onClick={() => setKind("nonfunctional")}
        >
          {t("nonFunctional")}
        </button>
        <button
          className={kind === "functional" ? "active" : ""}
          onClick={() => setKind("functional")}
        >
          {t("functional")}
        </button>
      </div>

      {kind === "nonfunctional" ? (
        <div className="req-form">
          <label>
            {t("metric")}
            <select value={subtype} onChange={(e) => setSubtype(e.target.value)}>
              {NONFUNCTIONAL_SUBTYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("threshold")}
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label>
            {t("descriptionOptional")}
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <button onClick={submitNonFunctional}>{t("addRequirement")}</button>
        </div>
      ) : (
        <div className="req-form">
          <p className="hint">{t("sequenceHint")}</p>
          <div className="sequence-builder">
            {catalog &&
              Object.entries(catalog.types).map(([key, entry]) => (
                <button
                  key={key}
                  className="chip"
                  onClick={() => setSequence((s) => [...s, key])}
                  title={catalogText.label(key, entry.label)}
                >
                  {catalogText.label(key, entry.label)}
                </button>
              ))}
          </div>
          <div className="sequence-preview">
            {sequence.length === 0 ? (
              <span className="hint">{t("noStepsYet")}</span>
            ) : (
              sequence.map((typeKey, i) => (
                <span key={i} className="sequence-step">
                  {catalogText.label(typeKey, catalog?.types[typeKey]?.label ?? typeKey)}
                  {i < sequence.length - 1 ? " → " : ""}
                </span>
              ))
            )}
            {sequence.length > 0 && (
              <button className="link" onClick={() => setSequence([])}>
                {t("clear")}
              </button>
            )}
          </div>
          <label>
            {t("descriptionOptional")}
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <button onClick={submitFunctional}>{t("addRequirement")}</button>
        </div>
      )}

      <ul className="req-list">
        {requirements.map((r) => (
          <li key={r.id}>
            <span className={`badge ${r.kind}`}>
              {r.kind === "functional" ? t("badgeFunctional") : t("badgeNonFunctional")}
            </span>
            <span className="req-desc">{r.description}</span>
            <button className="link danger" onClick={() => removeRequirement(r.id)}>
              {t("remove")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

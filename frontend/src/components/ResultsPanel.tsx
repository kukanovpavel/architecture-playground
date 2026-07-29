import { useStore } from "../store";
import type { Finding, Severity } from "../types";
import { useT, useFindingMessage } from "../i18n";
import type { UIKey } from "../i18n/translations";

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];
const SEVERITY_COLOR: Record<Severity, string> = {
  error: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",
};
const SEVERITY_LABEL_KEY: Record<Severity, UIKey> = {
  error: "severityError",
  warning: "severityWarning",
  info: "severityInfo",
};

export function ResultsPanel() {
  const findings = useStore((s) => s.findings);
  const simulating = useStore((s) => s.simulating);
  const setHighlighted = useStore((s) => s.setHighlighted);
  const t = useT();
  const findingMessage = useFindingMessage();

  const grouped: Record<Severity, Finding[]> = { error: [], warning: [], info: [] };
  for (const f of findings) grouped[f.severity].push(f);

  return (
    <div className="panel">
      <h3>{t("runResultsTitle")}</h3>
      {simulating && <p className="hint">{t("running")}</p>}
      {!simulating && findings.length === 0 && <p className="hint">{t("runHint")}</p>}
      {!simulating &&
        findings.length > 0 &&
        SEVERITY_ORDER.map((severity) =>
          grouped[severity].length === 0 ? null : (
            <div key={severity} className="results-group">
              <div className="results-group-title" style={{ color: SEVERITY_COLOR[severity] }}>
                {t(SEVERITY_LABEL_KEY[severity])} ({grouped[severity].length})
              </div>
              <ul>
                {grouped[severity].map((f, i) => (
                  <li
                    key={i}
                    className="finding"
                    onMouseEnter={() =>
                      setHighlighted([...f.component_ids, ...f.connection_ids])
                    }
                    onMouseLeave={() => setHighlighted([])}
                  >
                    <span className="finding-rule">{f.rule_id}</span>
                    <span>{findingMessage(f)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
    </div>
  );
}

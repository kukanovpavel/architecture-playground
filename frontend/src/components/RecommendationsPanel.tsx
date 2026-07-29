import { useStore } from "../store";
import { useT, useRecommendationText } from "../i18n";
import type { Priority } from "../types";

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#2563eb",
};

const PRIORITY_LABEL_KEY = {
  critical: "priorityCritical",
  high: "priorityHigh",
  medium: "priorityMedium",
  low: "priorityLow",
} as const;

export function RecommendationsPanel() {
  const t = useT();
  const text = useRecommendationText();
  const advice = useStore((s) => s.advice);
  const advising = useStore((s) => s.advising);
  const liveRunning = useStore((s) => s.liveRunning);
  const liveTick = useStore((s) => s.liveTick);
  const dirty = useStore((s) => s.dirty);
  const fetchAdvice = useStore((s) => s.fetchAdvice);
  const setHighlighted = useStore((s) => s.setHighlighted);

  // Only meaningful once a run has produced something to analyze.
  if (!advice && !advising && !liveTick) return null;

  const summary = advice?.summary;

  return (
    <div className="panel">
      <h3>{t("recommendationsTitle")}</h3>

      {advising && <p className="hint">{t("analyzing")}</p>}

      {!advising && !advice && (
        <p className="hint">{t("recommendationsHint")}</p>
      )}

      {advice && summary && (
        <>
          <div className="advice-summary">
            <span>
              {t("analyzedAt")} <strong>{Math.round(advice.arrival_rps)} rps</strong> ·{" "}
              {t("servedShare")} <strong>{Math.round(summary.served_ratio * 100)}%</strong>
            </span>
          </div>

          {dirty && <p className="hint advice-stale">{t("adviceStale")}</p>}

          {summary.healthy && advice.recommendations.length === 0 ? (
            <p className="advice-healthy">{t("adviceHealthy")}</p>
          ) : (
            <ol className="advice-list">
              {advice.recommendations.map((rec, i) => {
                const content = text(rec);
                return (
                  <li
                    key={`${rec.rule_id}-${i}`}
                    className="advice-item"
                    onMouseEnter={() =>
                      setHighlighted([...rec.component_ids, ...rec.connection_ids])
                    }
                    onMouseLeave={() => setHighlighted([])}
                  >
                    <div className="advice-head">
                      <span
                        className="advice-priority"
                        style={{ background: PRIORITY_COLOR[rec.priority] }}
                      >
                        {t(PRIORITY_LABEL_KEY[rec.priority])}
                      </span>
                      <span className="advice-title">{content.title}</span>
                    </div>
                    {content.detail && <p className="advice-detail">{content.detail}</p>}
                    {content.action && (
                      <p className="advice-action">
                        <strong>{t("adviceAction")}:</strong> {content.action}
                      </p>
                    )}
                    {content.impact && (
                      <p className="advice-impact">
                        <strong>{t("adviceImpact")}:</strong> {content.impact}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}

      {!liveRunning && (
        <button disabled={advising} onClick={() => fetchAdvice()}>
          {advice ? t("reanalyze") : t("analyze")}
        </button>
      )}
    </div>
  );
}

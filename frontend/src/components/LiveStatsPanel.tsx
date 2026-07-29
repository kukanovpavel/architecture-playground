import { useStore } from "../store";
import { useT, useCatalogText } from "../i18n";
import { formatRps, utilizationColor } from "../format";

export function LiveStatsPanel() {
  const t = useT();
  const catalogText = useCatalogText();
  const liveRunning = useStore((s) => s.liveRunning);
  const liveTick = useStore((s) => s.liveTick);
  const liveRate = useStore((s) => s.liveRate);
  const liveError = useStore((s) => s.liveError);
  const setLiveRate = useStore((s) => s.setLiveRate);
  const components = useStore((s) => s.components);
  const catalog = useStore((s) => s.catalog);

  if (!liveRunning && !liveTick && !liveError) return null;

  const totals = liveTick?.totals;
  const bottleneck = totals?.bottleneck_id
    ? components.find((c) => c.id === totals.bottleneck_id)
    : null;
  const bottleneckName =
    bottleneck &&
    (bottleneck.name ||
      catalogText.label(bottleneck.type, catalog?.types[bottleneck.type]?.label ?? bottleneck.type));

  const dropping = (totals?.dropped_rps ?? 0) > 0.5;

  return (
    <div className="panel">
      <h3>
        {liveRunning && <span className="live-running-dot" />}
        {t("liveTitle")}
      </h3>

      {liveError && <p className="hint" style={{ color: "var(--color-danger)" }}>{liveError}</p>}

      {liveRate !== null && (
        <div className="rate-slider">
          <label>
            {t("trafficRate")}: <strong>{formatRps(liveRate)} rps</strong>
            <input
              type="range"
              min={10}
              max={Math.max(5000, Math.round(liveRate * 2))}
              step={10}
              value={liveRate}
              onChange={(e) => setLiveRate(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {bottleneckName && (
        <div className="bottleneck-callout">
          {t("bottleneck")}: <strong>{bottleneckName}</strong>
          {totals && ` — ${Math.round(totals.max_utilization * 100)}%`}
        </div>
      )}

      {totals && (
        <>
          <div className="live-stats">
            <div className="live-stat">
              <div className="live-stat-label">{t("statIncoming")}</div>
              <div className="live-stat-value">{formatRps(totals.arrival_rps)}</div>
            </div>
            <div className="live-stat">
              <div className="live-stat-label">{t("statServed")}</div>
              <div className="live-stat-value">{formatRps(totals.served_rps)}</div>
            </div>
            <div className="live-stat">
              <div className="live-stat-label">{t("statDropped")}</div>
              <div
                className="live-stat-value"
                style={{ color: dropping ? "var(--color-danger)" : undefined }}
              >
                {formatRps(totals.dropped_rps)}
              </div>
            </div>
            <div className="live-stat">
              <div className="live-stat-label">{t("statMaxUtil")}</div>
              <div
                className="live-stat-value"
                style={{ color: utilizationColor(totals.max_utilization) }}
              >
                {Math.round(totals.max_utilization * 100)}%
              </div>
            </div>
            <div className="live-stat">
              <div className="live-stat-label">{t("statLatency")}</div>
              <div className="live-stat-value">
                {totals.critical_path_latency_ms.toFixed(0)} ms
              </div>
            </div>
            <div className="live-stat">
              <div className="live-stat-label">{t("statElapsed")}</div>
              <div className="live-stat-value">{liveTick?.elapsed_s.toFixed(0)}s</div>
            </div>
          </div>

          <p className="hint">
            {t("statTotalRequests")}: {Math.round(totals.total_requests).toLocaleString()}
            {totals.total_dropped > 0 && (
              <>
                {" · "}
                <span style={{ color: "var(--color-danger)" }}>
                  {t("statTotalDropped")}: {Math.round(totals.total_dropped).toLocaleString()}
                </span>
              </>
            )}
          </p>
        </>
      )}

      {!liveRunning && liveTick && <p className="hint">{t("liveStopped")}</p>}
    </div>
  );
}

/** Compact request-rate label: 842, 1.20k, 12.5k. */
export function formatRps(value: number): string {
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}k`;
  return value.toFixed(0);
}

/** Green below 70%, amber to 90%, red once saturated. */
export function utilizationColor(utilization: number): string {
  if (utilization >= 1) return "#dc2626";
  if (utilization >= 0.9) return "#ea580c";
  if (utilization >= 0.7) return "#d97706";
  return "#16a34a";
}

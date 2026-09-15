/**
 * Presentation helpers for the universal infrastructure ledger.
 *
 * Infrastructure points are an open-ended capacity total, not a 0–100 stat.
 * Keep their formatting separate from stat-bar presentation so a large city
 * cannot accidentally be rendered as a percentage.
 */
export function formatInfrastructurePoints(value: number): string {
  if (!Number.isFinite(value)) return "—";

  const rounded = Math.round(value);
  const magnitude = Math.abs(rounded);
  if (magnitude < 1_000) return rounded.toLocaleString("en-US");

  const units = [
    { threshold: 999_500_000, divisor: 1_000_000_000, suffix: "B" },
    { threshold: 999_500, divisor: 1_000_000, suffix: "M" },
    { threshold: 1_000, divisor: 1_000, suffix: "K" },
  ] as const;
  const unit = units.find(({ threshold }) => magnitude >= threshold)!;
  const scaled = rounded / unit.divisor;
  const displayed = Math.abs(scaled) >= 100
    ? Math.round(scaled).toString()
    : scaled.toFixed(2).replace(/\.?0+$/, "");
  return `${displayed}${unit.suffix}`;
}

export function formatInfrastructureIntegrity(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export function formatInfrastructureSummary(totalPoints: number, integrityPercent: number): string {
  return `${formatInfrastructurePoints(totalPoints)} · ${formatInfrastructureIntegrity(integrityPercent)}`;
}

/** The spoken label deliberately calls points points, rather than a stat score. */
export function formatInfrastructureAccessibilityLabel(totalPoints: number, integrityPercent: number): string {
  return `Infrastructure: ${formatInfrastructurePoints(totalPoints)} points, ${formatInfrastructureIntegrity(integrityPercent)} integrity`;
}
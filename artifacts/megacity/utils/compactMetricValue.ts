export function formatCompactMetricValue(value: number): string {
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
    : scaled.toFixed(1).replace(/\.0$/, "");
  return `${displayed}${unit.suffix}`;
}
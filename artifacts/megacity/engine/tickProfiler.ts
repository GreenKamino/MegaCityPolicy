// Per-section runTick cost profiler. DISABLED by default — only the debug
// profiler overlay (Task #200) turns it on. When enabled, runTick brackets
// each named section with performance.now() and feeds the delta into a small
// rolling sample buffer here. The overlay reads getProfilerSnapshot() once a
// second to show rolling avg + p95 per section so a late-game tick stutter is
// visible immediately instead of relying on ad-hoc test timings.
//
// ── Zero-cost-when-disabled contract ──────────────────────────────────────
// The recording hot path (`recordSection`) and the instrumentation in
// formulas.ts both short-circuit on a single boolean read (`_enabled`). When
// the overlay is off, NO performance.now() calls happen inside runTick and no
// samples are stored, so the profiler cannot perturb the very tick cost it is
// meant to measure. Keep that invariant: never do work in this module's hot
// path that isn't gated by `_enabled`.
//
// Kept dependency-free (no React / React Native) so the engine and vitest
// specs can import it without dragging in the RN module graph — mirrors the
// tickPerf.ts convention.

// Rolling window length, in samples (= ticks a section actually ran). At the
// live cadence of ~4 ticks/sec this is ~30s of history, enough to surface a
// p95 spike without letting one stutter dominate forever. Exported so the
// profiler specs can fill exactly one window without duplicating the number.
export const SAMPLE_CAP = 120;

let _enabled = false;

// name -> ring of the last SAMPLE_CAP per-tick durations (ms). A plain array
// with shift() is fine: pushes are O(1) amortized and the only O(n) work
// (sum + sort for p95) happens at read time, once per second, over <=120
// numbers.
const _sections = new Map<string, number[]>();

export function isTickProfilingEnabled(): boolean {
  return _enabled;
}

export function setTickProfilingEnabled(on: boolean): void {
  if (on === _enabled) return;
  _enabled = on;
  // Drop stale samples on disable so a later re-enable starts clean and the
  // overlay never shows pre-pause numbers as if they were current.
  if (!on) _sections.clear();
}

export function recordSection(name: string, ms: number): void {
  if (!_enabled) return;
  if (!Number.isFinite(ms) || ms < 0) return;
  let arr = _sections.get(name);
  if (!arr) {
    arr = [];
    _sections.set(name, arr);
  }
  arr.push(ms);
  if (arr.length > SAMPLE_CAP) arr.shift();
}

export type SectionStat = {
  name: string;
  avg: number;
  // Median (p50) per-section cost. Unlike `avg`, a single outlier tick (a GC
  // pause or OS deschedule landing inside this section) cannot drag the median,
  // so it is the robust statistic the regression tripwire asserts on — see
  // tickProfile.test.ts. A real regression still moves it (the whole
  // distribution shifts up); isolated contention spikes do not.
  median: number;
  p95: number;
  last: number;
  count: number;
};

export type ProfilerSnapshot = {
  sections: SectionStat[];
  // Sum of every section's rolling average — an approximation of total
  // measured runTick cost (the true end-to-end tick wall time, which also
  // includes event/mega-project/mission processing outside runTick, comes
  // from tickPerf.getAverageTickMs()).
  sumAvg: number;
  // Sum of every section's rolling MEDIAN — the robust counterpart to sumAvg.
  // The regression tripwire uses this as the denominator when comparing a
  // section's median cost to the rest of the tick, so an outlier tick in any
  // one section cannot distort the whole-tick baseline the way sumAvg can.
  sumMedian: number;
  // Largest per-section sample count, i.e. how many ticks the busiest section
  // has been observed across — a proxy for "is the window warmed up yet".
  maxCount: number;
};

function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sortedAsc[idx];
}

export function getProfilerSnapshot(): ProfilerSnapshot {
  const sections: SectionStat[] = [];
  let sumAvg = 0;
  let sumMedian = 0;
  let maxCount = 0;
  for (const [name, arr] of _sections) {
    const count = arr.length;
    if (count === 0) continue;
    let sum = 0;
    for (const v of arr) sum += v;
    const avg = sum / count;
    const sorted = [...arr].sort((a, b) => a - b);
    const median = percentile(sorted, 50);
    sections.push({
      name,
      avg,
      median,
      p95: percentile(sorted, 95),
      last: arr[count - 1],
      count,
    });
    sumAvg += avg;
    sumMedian += median;
    if (count > maxCount) maxCount = count;
  }
  // Hottest sections first — that's what a perf investigation wants to see.
  sections.sort((a, b) => b.avg - a.avg);
  return { sections, sumAvg, sumMedian, maxCount };
}

// Test-only reset so vitest specs can start from a known state.
export function _resetTickProfilerForTests(): void {
  _enabled = false;
  _sections.clear();
}

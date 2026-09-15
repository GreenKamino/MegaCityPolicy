// Rolling per-tick wall-clock measurement, sampled cheaply during normal play
// and consumed by UI surfaces (currently the offline-sim-depth resume-time
// labels in more.tsx) so the estimates reflect each device instead of a
// hard-coded ~2 ms/tick desktop figure.
//
// Kept dependency-free (no React, no React Native) so the engine and tests
// can import it without dragging in the RN module graph. Subscribers use a
// simple listener-set so a useSyncExternalStore consumer can re-render as
// the average stabilizes.

const SAMPLE_CAP = 32;
const samples: number[] = [];
let cachedAverage: number | null = null;

const listeners = new Set<() => void>();

// Fallback used before any samples have been recorded. Matches the historical
// hard-coded value in more.tsx and the documented engine perf range from
// engine/__tests__/perfStress.test.ts (~1.7-2.3 ms/tick on a mid-tier device).
export const FALLBACK_MS_PER_TICK = 2;

// Reject obviously bogus samples (negative, NaN, or absurd outliers caused by
// the JS event loop being blocked). 5000 ms is well above any realistic tick
// cost — anything beyond that is GC/jank, not engine work, and would skew the
// rolling average for a long time given the small SAMPLE_CAP.
const MAX_REASONABLE_SAMPLE_MS = 5000;

export function recordTickDuration(ms: number): void {
  if (!Number.isFinite(ms)) return;
  if (ms < 0 || ms > MAX_REASONABLE_SAMPLE_MS) return;
  samples.push(ms);
  if (samples.length > SAMPLE_CAP) samples.shift();
  let sum = 0;
  for (const s of samples) sum += s;
  cachedAverage = sum / samples.length;
  listeners.forEach((l) => {
    try { l(); } catch { /* ignore listener errors */ }
  });
}

export function getAverageTickMs(): number | null {
  return cachedAverage;
}

export function getEstimatedMsPerTick(): number {
  return cachedAverage ?? FALLBACK_MS_PER_TICK;
}

export function getSampleCount(): number {
  return samples.length;
}

export function subscribeTickPerf(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Test-only reset so vitest specs can start from a known state.
export function _resetTickPerfForTests(): void {
  samples.length = 0;
  cachedAverage = null;
}

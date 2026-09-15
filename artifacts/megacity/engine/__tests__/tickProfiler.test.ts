import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isTickProfilingEnabled,
  setTickProfilingEnabled,
  recordSection,
  getProfilerSnapshot,
  _resetTickProfilerForTests,
  SAMPLE_CAP,
} from "../tickProfiler";

describe("tickProfiler", () => {
  beforeEach(() => {
    _resetTickProfilerForTests();
  });

  it("is disabled by default and records nothing while off", () => {
    expect(isTickProfilingEnabled()).toBe(false);
    recordSection("Combat", 5);
    expect(getProfilerSnapshot().sections).toHaveLength(0);
  });

  it("records per-section samples once enabled", () => {
    setTickProfilingEnabled(true);
    recordSection("Combat", 2);
    recordSection("Combat", 4);
    recordSection("Banking", 1);

    const snap = getProfilerSnapshot();
    const combat = snap.sections.find((s) => s.name === "Combat");
    const banking = snap.sections.find((s) => s.name === "Banking");
    expect(combat).toMatchObject({ avg: 3, last: 4, count: 2 });
    expect(banking).toMatchObject({ avg: 1, count: 1 });
  });

  it("sorts sections by descending average and sums the averages", () => {
    setTickProfilingEnabled(true);
    recordSection("Edicts", 1);
    recordSection("Combat", 10);
    recordSection("Contracts", 5);

    const snap = getProfilerSnapshot();
    expect(snap.sections.map((s) => s.name)).toEqual(["Combat", "Contracts", "Edicts"]);
    expect(snap.sumAvg).toBeCloseTo(16, 5);
  });

  it("computes a p95 that tracks the tail, not the mean", () => {
    setTickProfilingEnabled(true);
    // 99 cheap ticks and one expensive spike — avg stays low, p95 catches it.
    for (let i = 0; i < 99; i++) recordSection("Sanitize", 1);
    recordSection("Sanitize", 50);

    const stat = getProfilerSnapshot().sections.find((s) => s.name === "Sanitize")!;
    expect(stat.avg).toBeLessThan(2);
    expect(stat.p95).toBeGreaterThanOrEqual(1);
    // With 100 samples (cap is 120) the 95th percentile index is still in the
    // cheap band, but pushing the spike count up surfaces it.
    for (let i = 0; i < 10; i++) recordSection("Sanitize", 50);
    const stat2 = getProfilerSnapshot().sections.find((s) => s.name === "Sanitize")!;
    expect(stat2.p95).toBe(50);
  });

  it("caps the rolling window so old samples decay out", () => {
    setTickProfilingEnabled(true);
    for (let i = 0; i < 200; i++) recordSection("Combat", 100);
    const before = getProfilerSnapshot().sections.find((s) => s.name === "Combat")!;
    expect(before.count).toBeLessThanOrEqual(120);

    for (let i = 0; i < 200; i++) recordSection("Combat", 2);
    const after = getProfilerSnapshot().sections.find((s) => s.name === "Combat")!;
    expect(after.avg).toBeCloseTo(2, 5);
  });

  it("rejects bogus samples (NaN, Infinity, negative)", () => {
    setTickProfilingEnabled(true);
    recordSection("Combat", Number.NaN);
    recordSection("Combat", Number.POSITIVE_INFINITY);
    recordSection("Combat", -3);
    expect(getProfilerSnapshot().sections).toHaveLength(0);
  });

  it("clears samples when disabled so a re-enable starts clean", () => {
    setTickProfilingEnabled(true);
    recordSection("Combat", 5);
    expect(getProfilerSnapshot().sections).toHaveLength(1);

    setTickProfilingEnabled(false);
    expect(getProfilerSnapshot().sections).toHaveLength(0);

    setTickProfilingEnabled(true);
    expect(getProfilerSnapshot().sections).toHaveLength(0);
  });
});

// ── Median-based regression tripwire: does it still bite? ──────────────────
//
// tickProfile.test.ts (the slow perf gate) asserts each section's MEDIAN
// rest-ratio  r = sec.median / (sumMedian - sec.median)  stays under a
// documented ceiling. That tripwire switched from the mean to the
// median so an isolated tick descheduled by CPU contention in the concurrent
// validation gate can no longer fake a regression. The tradeoff — "a REAL
// regression (whole distribution shifted up) still moves the median and still
// trips" — was only reasoned about in comments until now. These fast,
// deterministic tests feed the profiler synthetic per-section samples and
// PROVE both halves of that tradeoff, so a future change to the statistic or
// the ceiling math cannot silently make the guard toothless.
//
// The three constants below MIRROR tickProfile.test.ts (they cannot be
// imported: importing a test file would register its slow aging test into
// this fast suite). The source-sync test at the bottom greps the perf spec's
// source text and fails loudly if the mirrored values drift.
const REST_RATIO_SLACK = 1.5;
const MIN_SECTION_CEILING = 0.064;
// Only the entries this spec exercises; the sync test checks each one.
const MIRRORED_BASELINES: Record<string, number> = {
  "New Systems": 0.48,
  Sanitize: 0.5,
  "District Updates": 0.28,
  "Supply Chain": 0.066,
};

function restRatioCeilingFor(name: string): number {
  const baseline = MIRRORED_BASELINES[name] ?? 0;
  return Math.max(baseline * REST_RATIO_SLACK, MIN_SECTION_CEILING);
}

function restRatioOf(value: number, sum: number): number {
  const rest = sum - value;
  return rest > 1e-9 ? value / rest : Infinity;
}

// Feed one full rolling window (SAMPLE_CAP samples, so shift()-eviction is
// also in play) for a section whose distribution is centered on `base` ms: a
// deterministic low/base/high zig-zag (±10% of base) so the data has
// realistic spread but the median is EXACTLY `base` (n=120 sorts into 40
// lows, 40 bases, 40 highs; the p50 index 59 lands in the base band — the
// guard in the first tripwire test below fails loudly if SAMPLE_CAP ever
// stops being divisible by 3). A `scale` multiplies every sample — i.e.
// shifts the WHOLE distribution, which is what a genuine regression does.
function feedSection(name: string, base: number, scale = 1): void {
  const jitter = base * 0.1;
  for (let i = 0; i < SAMPLE_CAP; i++) {
    const offset = i % 3 === 0 ? -jitter : i % 3 === 1 ? 0 : jitter;
    recordSection(name, (base + offset) * scale);
  }
}

// Synthetic healthy tick, shaped like the real observed baselines in
// tickProfile.test.ts (median rest-ratios land between the observed values
// and their ceilings, with headroom on every section). Sums to 2.55 ms.
const HEALTHY_BASES: Record<string, number> = {
  "New Systems": 0.9, //   r = 0.9/1.65  ≈ 0.545  (ceiling 0.72)
  Sanitize: 0.95, //       r = 0.95/1.6  ≈ 0.594  (ceiling 0.75)
  "District Updates": 0.55, // r = 0.55/2.0 = 0.275 (ceiling 0.42)
  "Supply Chain": 0.13, // r = 0.13/2.42 ≈ 0.054  (ceiling 0.099)
  "Crime Demographics": 0.02, // r ≈ 0.008 (floor ceiling 0.064)
};

function feedHealthyTick(overrides: { scaleSection?: string; scale?: number } = {}): void {
  for (const [name, base] of Object.entries(HEALTHY_BASES)) {
    const scale = name === overrides.scaleSection ? (overrides.scale ?? 1) : 1;
    feedSection(name, base, scale);
  }
}

describe("median rest-ratio regression tripwire", () => {
  beforeEach(() => {
    _resetTickProfilerForTests();
    setTickProfilingEnabled(true);
  });

  it("healthy baseline distributions sit under every ceiling", () => {
    // feedSection's exact-median construction assumes the window splits into
    // three equal low/base/high bands — see its comment.
    expect(SAMPLE_CAP % 3).toBe(0);
    feedHealthyTick();
    const snap = getProfilerSnapshot();
    expect(snap.sections).toHaveLength(Object.keys(HEALTHY_BASES).length);
    for (const sec of snap.sections) {
      const r = restRatioOf(sec.median, snap.sumMedian);
      expect(r, `${sec.name} healthy rest-ratio`).toBeLessThan(restRatioCeilingFor(sec.name));
    }
  });

  it("FIRES when a section's whole distribution doubles (a real regression)", () => {
    // Double every sample of the dominant section — the exact scenario the
    // rest-ratio was chosen for (share-of-total would saturate and miss it).
    feedHealthyTick({ scaleSection: "New Systems", scale: 2 });
    const snap = getProfilerSnapshot();
    const sec = snap.sections.find((s) => s.name === "New Systems")!;

    // The median tracks the shift 1:1 (0.9 → 1.8ms)...
    expect(sec.median).toBeCloseTo(1.8, 5);
    // ...and since the REST of the tick is unchanged, the rest-ratio exactly
    // doubles (0.545 → 1.09), sailing past the 0.72 ceiling.
    const r = restRatioOf(sec.median, snap.sumMedian);
    expect(r).toBeGreaterThan(restRatioCeilingFor("New Systems"));
    expect(r).toBeCloseTo(2 * (0.9 / (2.55 - 0.9)), 5);

    // The regression is localized: every OTHER section still passes, so the
    // tripwire names the actual offender rather than flagging everything.
    for (const other of snap.sections) {
      if (other.name === "New Systems") continue;
      const or = restRatioOf(other.median, snap.sumMedian);
      expect(or, `${other.name} should not co-trip`).toBeLessThan(restRatioCeilingFor(other.name));
    }
  });

  it("a modest ~1.3x drift inside the documented slack does NOT fire", () => {
    // Sanity-check the other edge: the 1.5x slack is real headroom, not a
    // hair-trigger. A 1.3x whole-distribution shift lifts the rest-ratio to
    // r = 1.17/1.65 ≈ 0.709, which stays (just) under the 0.72 ceiling.
    feedHealthyTick({ scaleSection: "New Systems", scale: 1.3 });
    const snap = getProfilerSnapshot();
    const sec = snap.sections.find((s) => s.name === "New Systems")!;
    const r = restRatioOf(sec.median, snap.sumMedian);
    expect(r).toBeLessThan(restRatioCeilingFor("New Systems"));
  });

  it("does NOT fire on a single huge outlier tick (CPU-contention case) — but the old mean would have", () => {
    feedHealthyTick();
    // One tick of "New Systems" got descheduled for 60ms — a GC pause / OS
    // scheduler steal, not a regression. shift() evicts one old sample; the
    // other 119 remain a healthy distribution.
    recordSection("New Systems", 60);

    const snap = getProfilerSnapshot();
    const sec = snap.sections.find((s) => s.name === "New Systems")!;

    // The median shrugs the outlier off entirely → tripwire stays quiet.
    expect(sec.median).toBeCloseTo(0.9, 5);
    const medianRatio = restRatioOf(sec.median, snap.sumMedian);
    expect(medianRatio).toBeLessThan(restRatioCeilingFor("New Systems"));

    // The MEAN-based rest-ratio, by contrast, is dragged over the ceiling by
    // that single sample ((~119·0.9 + 60)/120 ≈ 1.39ms → r ≈ 0.84 > 0.72).
    // This is precisely the false positive the median switch eliminated; if
    // someone reverts the statistic to the mean, this assertion documents
    // what breaks.
    const meanRatio = restRatioOf(sec.avg, snap.sumAvg);
    expect(meanRatio).toBeGreaterThan(restRatioCeilingFor("New Systems"));

    // No other section is disturbed by the outlier.
    for (const other of snap.sections) {
      if (other.name === "New Systems") continue;
      const or = restRatioOf(other.median, snap.sumMedian);
      expect(or, `${other.name} unaffected by outlier`).toBeLessThan(
        restRatioCeilingFor(other.name),
      );
    }
  });

  it("mirrored ceiling constants stay in sync with tickProfile.test.ts", () => {
    // The perf spec cannot be imported (it would register its slow aging test
    // here), so parse its source text — same technique as the screen-config
    // specs. If the perf gate re-baselines or retunes, this fails with a
    // pointer to update the mirror above.
    const src = readFileSync(join(__dirname, "tickProfile.test.ts"), "utf8");

    const slack = src.match(/const REST_RATIO_SLACK = ([\d.]+);/);
    expect(slack, "REST_RATIO_SLACK declaration in tickProfile.test.ts").toBeTruthy();
    expect(Number(slack![1])).toBe(REST_RATIO_SLACK);

    const floor = src.match(/const MIN_SECTION_CEILING = ([\d.]+);/);
    expect(floor, "MIN_SECTION_CEILING declaration in tickProfile.test.ts").toBeTruthy();
    expect(Number(floor![1])).toBe(MIN_SECTION_CEILING);

    const baselinesBlock = src.match(
      /const SECTION_REST_RATIO_BASELINES: Record<string, number> = \{([\s\S]*?)\};/,
    );
    expect(baselinesBlock, "SECTION_REST_RATIO_BASELINES in tickProfile.test.ts").toBeTruthy();
    const entries: Record<string, number> = {};
    for (const m of baselinesBlock![1].matchAll(/["']?([\w ]+)["']?\s*:\s*([\d.]+)/g)) {
      entries[m[1].trim()] = Number(m[2]);
    }
    expect(entries).toEqual(MIRRORED_BASELINES);

    // And the rest-ratio formula itself: assert the perf spec still divides a
    // section's cost by (sum - cost), i.e. the math restRatioOf mirrors.
    expect(src).toMatch(/const rest = sumAvg - avg;/);
    expect(src).toMatch(/rest > 1e-9 \? avg \/ rest : Infinity/);
  });
});

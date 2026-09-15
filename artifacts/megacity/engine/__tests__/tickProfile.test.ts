/**
 * Per-subsystem tick PROFILE for the MEGACITY engine — the diagnostic
 * companion to tickBudget.test.ts.
 *
 * tickBudget.test.ts tells you *that* a tick got slower (its median/calibration
 * ratio trips the ceiling) but not *which* subsystem is responsible. This test
 * answers the follow-up question: it enables the runTick per-section profiler
 * (engine/tickProfiler.ts, which brackets every safeSub block in formulas.ts)
 * on the SAME fully-populated late-game state, runs a measured window, then logs
 * each section's mean cost sorted hottest-first. A budget failure plus this
 * output turns "a tick regressed" into "Combat / Contracts / Demographics
 * regressed" at a glance.
 *
 * ── Per-subsystem regression tripwire (machine-independent) ─────────────
 * tickBudget.test.ts guards TOTAL tick cost, but it has ~2.5x of headroom
 * (BUDGET_RATIO 5.0 vs OBSERVED_RATIO_BASELINE 2.0). Inside that headroom a
 * single subsystem can balloon — Combat doing 15x its work, say — while the
 * overall budget still passes, so the regression slips through. This test
 * closes that gap by asserting each section's cost RELATIVE TO THE REST of
 * the tick (sec.median / (sumMedian - sec.median)) stays under a documented
 * ceiling. The MEDIAN (not the mean) is used so an isolated tick descheduled
 * by CPU contention in the concurrent validation gate cannot fake a regression
 * — see the "Why MEDIAN, not MEAN?" note at SECTION_REST_RATIO_BASELINES.
 *
 * Why rest-ratio and not share-of-total (sec.avg / sumAvg)? Both are
 * machine-independent ratios — a box that runs every section 3x faster
 * leaves either one unchanged — but share-of-total SATURATES for a dominant
 * section and so cannot catch the very regression this task is named for.
 * "New Systems" alone is ~40% of the tick; if its cost DOUBLES (others
 * unchanged) its share only climbs to 0.8/1.4 ≈ 57%, which still sits under
 * any share*1.5 ceiling — the doubling slips through. The rest-ratio instead
 * grows in DIRECT PROPORTION to the section's own cost: double the cost (rest
 * unchanged) and the ratio doubles, full stop. So a 1.5x slack reliably
 * trips on a 2x regression of even the largest section while still leaving
 * ~35% of headroom over normal run-to-run jitter. (Note share = r / (1 + r),
 * so the two are interchangeable views of the same snapshot; we keep printing
 * share% in the log for human familiarity and assert on the rest-ratio.)
 *
 * When one subsystem regresses its avg rises, which lifts its rest-ratio
 * (rest stays roughly constant), so even a regression that keeps total tick
 * under budget trips the offending section's ceiling. Baselines live in
 * SECTION_REST_RATIO_BASELINES below and are re-baselined exactly like
 * tickBudget.test.ts's OBSERVED_RATIO_BASELINE: run this test, read the
 * "rest-ratio" column it logs, and update the map.
 *
 * We also assert the profiler actually captured per-section samples and,
 * crucially, that enabling it leaves ZERO trace in GameState (the enable
 * flag must stay an ephemeral module-level boolean and must never leak into
 * state.cheats or anywhere else in the serialised state).
 */

import { afterEach, describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  FACTORY_RULES,
  PROCUREMENT_TEMPLATES,
  PROCUREMENT_TEMPLATE_IDS,
  createDefaultVulcanState,
  type MunitionTypeId,
  type VulcanState,
} from "@/engine/munitionsCompany";
import {
  _resetTickProfilerForTests,
  getProfilerSnapshot,
  isTickProfilingEnabled,
  setTickProfilingEnabled,
} from "@/engine/tickProfiler";
import type { GameState } from "@/engine/types";

// ── Tunables (kept in step with tickBudget.test.ts) ────────────────────
// Age far enough that message / event / log arrays have hit their sanitizer
// caps and the world is "fully populated", so we profile steady-state
// late-game cost rather than the cheap opening ticks.
const AGE_TICKS = 1200;
// JIT warm-up ticks discarded before measuring. Smaller than the budget test's
// window — this is a diagnostic, not a stable-mean regression gate, so we trade
// a little precision for speed in the parallel suite.
const WARMUP_TICKS = 100;
// Measured window the profiler records over.
const MEASURE_TICKS = 400;

// ── Per-section rest-ratio baselines (machine-independent tripwire) ─────────
// Each value is a section's observed MEDIAN cost RELATIVE TO THE REST of the
// tick (sec.median / (snap.sumMedian - sec.median)) on the dev machine when
// this was last baselined, taken from the top of the observed range and rounded
// up slightly so normal jitter sits below the baseline itself. Only sections
// that carry a meaningful slice of the tick need an entry; every other section
// (Combat, Demographics, Banking, …) is governed by MIN_SECTION_CEILING below,
// which both spares the tiny, relatively-noisy sections from flaking AND catches
// a currently-cheap system ballooning into a real cost.
//
// ── Why MEDIAN, not MEAN? (the flake fix) ──────────────────────────────────
// This test runs in the `perf` validation step, which the gate runs CONCURRENTLY
// with the full parallel `test` suite (see the perf-timing-tests memory note).
// Under that CPU saturation a single tick gets descheduled for a GC pause / OS
// scheduler steal, adding tens of ms to whichever section happened to be running
// — pure contention, not a regression. The mean over the ~120-sample rolling
// window is dragged badly by even one such outlier (a 30 ms spike over 120
// samples lifts a 0.2 ms mean by >2x), which is exactly what flaked the
// "Crime Demographics" rest-ratio (0.1077 vs its 0.1050 ceiling) in the loaded
// gate while it passed in isolation. The MEDIAN ignores isolated outliers
// entirely, so the tripwire no longer trips on contention — yet a REAL
// regression still moves it, because a genuine slowdown raises the whole
// distribution (every tick, not one), which lifts the median just as much as
// the mean. We keep printing the mean/share columns for humans and assert on
// the median-based rest-ratio.
//
// rest-ratio r relates to share s by  r = s / (1 - s)  (and s = r / (1 + r)).
// We assert on r, not s, because s saturates for a dominant section: doubling
// "New Systems" (s ~0.40) only lifts s to ~0.57, under any s*1.5 ceiling,
// whereas r doubles outright — see the header comment for the full rationale.
//
// Observed at baseline time (3 isolated runs), MEDIAN rest-ratio:
//   New Systems         r 0.407–0.461
//   Sanitize            r 0.446–0.481
//   District Updates    r 0.262–0.272
//   Supply Chain        r 0.059–0.063
//   Crime Demographics  r 0.036–0.039  (now below MIN_SECTION_CEILING)
//   (all others         < 0.027, and noisy)
//
// Crime Demographics no longer needs its own entry: on the robust median its
// rest-ratio (~0.037) sits comfortably under the 0.064 floor, so the universal
// MIN_SECTION_CEILING governs it — a real ~1.7x regression still trips the
// floor, but contention no longer does.
//
// To re-baseline after an INTENTIONAL change (e.g. a new subsystem folded into
// "New Systems", or a deliberate refactor that shifts cost between sections):
// run this test, read the "rest-ratio" column it logs hottest-first, and update
// the numbers here. Mirrors tickBudget.test.ts's OBSERVED_RATIO_BASELINE flow.
const SECTION_REST_RATIO_BASELINES: Record<string, number> = {
  "New Systems": 0.48,
  Sanitize: 0.5,
  "District Updates": 0.28,
  "Supply Chain": 0.066,
};
// Slack on each baseline, read as the multiple by which a section's cost (vs
// the rest of the tick) may grow before it trips. Because the rest-ratio grows
// in lockstep with the section's own cost, a 1.5x slack catches any ≥1.5x
// single-section regression — comfortably including a 2x doubling — while
// leaving ~35% of headroom over the observed jitter above.
const REST_RATIO_SLACK = 1.5;
// Floor ceiling (in rest-ratio terms) applied to EVERY section (listed or not).
// 0.064 ≈ a section reaching ~6% of the whole tick (share 0.06 → r 0.0638). A
// currently sub-1% section must balloon to ~6% of the tick before tripping;
// that is a large, real regression (e.g. a ~15x blow-up of a sub-1% system)
// rather than noise, and it would otherwise sail under tickBudget.test.ts's
// headroom. It also spares the small, relatively-noisy sections from flaking.
const MIN_SECTION_CEILING = 0.064;

// Resolve the rest-ratio ceiling for a section: the looser of its documented
// baseline*slack and the universal floor.
function restRatioCeilingFor(name: string): number {
  const baseline = SECTION_REST_RATIO_BASELINES[name] ?? 0;
  return Math.max(baseline * REST_RATIO_SLACK, MIN_SECTION_CEILING);
}

// Cost of a section relative to the rest of the tick. Guards against a zero (or
// negative) denominator in the degenerate case of a single observed section.
function restRatioOf(avg: number, sumAvg: number): number {
  const rest = sumAvg - avg;
  return rest > 1e-9 ? avg / rest : Infinity;
}

function ageBase(ticks: number): GameState {
  let s = createInitialState();
  for (let i = 0; i < ticks; i++) s = runTick(s).newState;
  return s;
}

/**
 * Layer a fully-loaded Vulcan Arms Consortium onto the aged state so the tick
 * exercises the production / contract / delivery code paths every tick.
 * Mirrors the seeding used by tickBudget.test.ts / lateGameStress.test.ts.
 */
function seedFullyLoadedVulcan(state: GameState): GameState {
  const v: VulcanState = createDefaultVulcanState();
  const startedTick = state.totalTicks ?? 0;
  const seeded: VulcanState["factories"] = [
    { uid: "f-ammo-1", type: "ammo_plant", status: "active", buildTicksRemaining: 0, startedTick },
    { uid: "f-ammo-2", type: "ammo_plant", status: "active", buildTicksRemaining: 0, startedTick },
    { uid: "f-shell-1", type: "shell_forge", status: "active", buildTicksRemaining: 0, startedTick },
    { uid: "f-missile-1", type: "missile_works", status: "active", buildTicksRemaining: 0, startedTick },
    { uid: "f-shell-2", type: "shell_forge", status: "active", buildTicksRemaining: 0, startedTick },
    { uid: "f-missile-2", type: "missile_works", status: "active", buildTicksRemaining: 0, startedTick },
    { uid: "f-arsenal-1", type: "strategic_arsenal", status: "active", buildTicksRemaining: 0, startedTick },
    { uid: "f-arsenal-2", type: "strategic_arsenal", status: "active", buildTicksRemaining: 0, startedTick },
  ];
  v.factories = seeded.filter((f) => FACTORY_RULES[f.type] != null);

  v.contracts = PROCUREMENT_TEMPLATE_IDS.map((tid, i) => {
    const tpl = PROCUREMENT_TEMPLATES[tid];
    const maxDeliveries = Math.ceil(MEASURE_TICKS / tpl.ticksBetweenDeliveries);
    const sustainedUnits = Math.ceil(maxDeliveries * tpl.unitsPerDelivery * 2);
    return {
      uid: `c-${tid}-${i}`,
      templateId: tid,
      unitsRemaining: sustainedUnits,
      ticksUntilNextDelivery: tpl.ticksBetweenDeliveries,
      startedTick,
    };
  });

  v.reserve = Object.fromEntries(
    PROCUREMENT_TEMPLATE_IDS.map((tid) => {
      const tpl = PROCUREMENT_TEMPLATES[tid];
      return [tpl.munitionId, tpl.unitsPerDelivery * 8] as const;
    }),
  ) as Partial<Record<MunitionTypeId, number>>;

  v.totalRevenue = 0;
  v.reputation = 75;

  return { ...state, vulcan: v };
}

describe("engine per-subsystem tick profile", () => {
  // Always leave the module flag off so this diagnostic can never perturb the
  // budget test (or any other tick timing) if they run in the same process.
  afterEach(() => {
    _resetTickProfilerForTests();
  });

  it(
    "reports per-section mean cost, sorted hottest-first",
    { timeout: 180_000 },
    () => {
      // Build a fully-populated late-game state with the profiler OFF, so JIT
      // warm-up and aging carry no profiling overhead.
      let s = seedFullyLoadedVulcan(ageBase(AGE_TICKS));
      for (let i = 0; i < WARMUP_TICKS; i++) s = runTick(s).newState;

      // Snapshot cheats BEFORE enabling so we can prove enabling the profiler
      // leaves no trace in the serialised game state.
      const cheatsBefore = JSON.stringify(s.cheats);

      // Enable the profiler and run the measured window. Every safeSub block in
      // formulas.ts now feeds its per-tick duration into the rolling buffer.
      setTickProfilingEnabled(true);
      expect(isTickProfilingEnabled()).toBe(true);
      for (let i = 0; i < MEASURE_TICKS; i++) s = runTick(s).newState;

      const snap = getProfilerSnapshot();

      // getProfilerSnapshot() already sorts hottest-first (descending avg).
      // Guard against a zero denominator before deriving shares.
      const sumAvg = snap.sumAvg > 0 ? snap.sumAvg : 1;
      // The regression tripwire below asserts on the MEDIAN-based rest-ratio,
      // which is robust to the isolated per-tick outliers that CPU contention
      // in the concurrent validation gate injects. Guard its denominator too.
      const sumMedian = snap.sumMedian > 0 ? snap.sumMedian : 1;
      const rows = snap.sections.map((sec) => {
        const share = sec.avg / sumAvg;
        const restRatio = restRatioOf(sec.median, sumMedian);
        const ceiling = restRatioCeilingFor(sec.name);
        return (
          `  ${sec.name.padEnd(24)} ${sec.avg.toFixed(4)} ms avg` +
          `  | median ${sec.median.toFixed(4)} ms` +
          `  | p95 ${sec.p95.toFixed(4)} ms` +
          `  | share ${(share * 100).toFixed(2)}%` +
          `  | rest-ratio ${restRatio.toFixed(4)}` +
          ` (ceiling ${ceiling.toFixed(4)})  (n=${sec.count})`
        );
      });
      console.log(
        [
          ``,
          `=== per-subsystem tick profile ===`,
          `  aged base ticks:  ${AGE_TICKS}`,
          `  warmup ticks:     ${WARMUP_TICKS}`,
          `  measured ticks:   ${MEASURE_TICKS}`,
          `  sections seen:    ${snap.sections.length}`,
          `  sum of avgs:      ${snap.sumAvg.toFixed(4)} ms  (≈ measured runTick cost)`,
          ``,
          `  --- mean cost per safeSub section (hottest first) ---`,
          ...rows,
          ``,
          `  → A tickBudget.test.ts failure + the top rows here pinpoints the`,
          `    subsystem that regressed.`,
        ].join("\n"),
      );

      // The profiler actually captured per-section samples over the window.
      // The rolling buffer caps at SAMPLE_CAP, so the warmed-up count is the
      // smaller of the measured window and that cap — never zero, never more
      // than the ticks we ran.
      expect(snap.sections.length).toBeGreaterThan(0);
      expect(snap.maxCount).toBeGreaterThan(0);
      expect(snap.maxCount).toBeLessThanOrEqual(MEASURE_TICKS);
      // Sorted hottest-first.
      for (let i = 1; i < snap.sections.length; i++) {
        expect(snap.sections[i - 1].avg).toBeGreaterThanOrEqual(
          snap.sections[i].avg,
        );
      }
      // Every reported figure is a finite, non-negative duration.
      for (const sec of snap.sections) {
        expect(Number.isFinite(sec.avg)).toBe(true);
        expect(sec.avg).toBeGreaterThanOrEqual(0);
      }

      // ── Per-subsystem regression tripwire ───────────────────────────────
      // Each section's MEDIAN cost relative to the rest of the tick
      // (median / (sumMedian - median)) must stay under its ceiling. Because it
      // is a ratio of two timings it is machine-independent; because it uses the
      // median it shrugs off the isolated per-tick spikes CPU contention injects
      // in the concurrent gate; and because it grows in
      // direct proportion to the section's own cost it catches a single system
      // regressing — including a 2x doubling of the dominant section — even when
      // the overall tickBudget.test.ts ceiling (which has ~2.5x of headroom)
      // still passes. (Share-of-total would saturate here and miss exactly that
      // case; see the header comment.)
      expect(snap.sumMedian).toBeGreaterThan(0);
      const offenders = snap.sections
        .map((sec) => {
          const restRatio = restRatioOf(sec.median, sumMedian);
          const ceiling = restRatioCeilingFor(sec.name);
          return { name: sec.name, restRatio, ceiling };
        })
        .filter((row) => row.restRatio > row.ceiling);

      expect(
        offenders,
        offenders.length === 0
          ? ""
          : `per-subsystem tick-cost regression — these safeSub sections now ` +
              `cost more relative to the rest of the tick than their ceiling ` +
              `allows (rest-ratio = section avg / sum of OTHER section avgs):\n` +
              offenders
                .map(
                  (o) =>
                    `      ${o.name} — rest-ratio ${o.restRatio.toFixed(4)}` +
                    ` >= ceiling ${o.ceiling.toFixed(4)}`,
                )
                .join("\n") +
              `\n\n  If this is an INTENTIONAL change, re-baseline: read the ` +
              `"rest-ratio" column logged above and update ` +
              `SECTION_REST_RATIO_BASELINES at the top of this file.`,
      ).toEqual([]);

      // ── The leak guard ──────────────────────────────────────────────────
      // Enabling the profiler must NOT mutate the serialised game state: the
      // enable flag is an ephemeral module-level boolean, never a cheat flag.
      expect(JSON.stringify(s.cheats)).toBe(cheatsBefore);
      const cheatKeys = Object.keys(s.cheats);
      expect(
        cheatKeys.some((k) => /prof|profile|profiling/i.test(k)),
      ).toBe(false);
    },
  );
});

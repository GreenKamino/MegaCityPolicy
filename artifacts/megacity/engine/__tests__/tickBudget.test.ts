/**
 * Tick performance REGRESSION BUDGET for the MEGACITY engine.
 *
 * Unlike perfStress.test.ts / lateGameStress.test.ts — which verify
 * *correctness* under load and only guard against catastrophic (O(n^2))
 * blow-ups via very loose 50 ms ceilings — this test exists to lock in
 * the per-tick wins from the engine optimization pass (task #188) so that
 * a future edit to formulas.ts which re-introduces a known regression
 * pattern fails CI. The patterns we want to catch:
 *
 *   - per-tick deep clones of the whole GameState
 *   - full-array prepends (unshift) on the message / event logs
 *   - uncached Object.entries() walks over large maps every tick
 *
 * Each of those adds a small but measurable constant to every tick. A
 * raw wall-clock budget (e.g. "mean < 3 ms") cannot catch them without
 * flaking, because the absolute number swings 3-5x between a fast dev
 * box and a slow, noisy shared CI runner.
 *
 * ── Methodology: a self-calibrating (machine-independent) budget ──────
 *
 * Instead of a raw millisecond ceiling, we measure tick cost RELATIVE to
 * a fixed in-process calibration workload (`calibrationCostMs`). The
 * calibration is a deterministic CPU + allocation + sort loop that does
 * NOT depend on engine code, so it can never regress when formulas.ts
 * changes. Dividing tick cost by calibration cost cancels out the
 * machine's raw speed: a box that runs ticks 3x faster also runs the
 * calibration 3x faster, leaving the ratio roughly constant.
 *
 * We then assert:  medianTickMs / calibrationMs  <  BUDGET_RATIO
 *
 * BUDGET_RATIO is set from the ratio observed on the dev machine (logged
 * below) multiplied by a generous slack factor, so normal cross-machine
 * and run-to-run noise stays well under the ceiling while a genuine
 * per-tick regression (which inflates the numerator without touching the
 * calibration denominator) trips it.
 *
 * To re-baseline after an *intentional* perf change: run this test, read
 * the "observed ratio" it logs, and update OBSERVED_RATIO_BASELINE (and,
 * if needed, BUDGET_RATIO) to match.
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

// ── Tunables ───────────────────────────────────────────────────────────
// How far to age the base state before measuring. Far enough that the
// message / event / log arrays have hit their sanitizer caps and the
// world is "fully populated", so we measure steady-state late-game cost
// rather than the cheap opening ticks.
const AGE_TICKS = 1200;
// JIT warm-up ticks discarded before measuring — V8 needs a few hundred
// iterations through the hot path before timings stabilise.
const WARMUP_TICKS = 150;
// Measured window. Large enough that the mean is stable; small enough to
// keep the test fast so it doesn't dominate the parallel suite. The
// budget assertion has ~2.4x headroom, so a slightly noisier mean from a
// smaller window is fine.
const MEASURE_TICKS = 1000;

// Ratio of MEDIAN tick cost to one calibration unit observed on the dev
// machine at the time this test was written. Logged every run for easy
// re-baselining. (Informational — the hard ceiling is BUDGET_RATIO.)
//
// Measured here (isolated): median tick ~1.09 ms / calibration unit
// ~0.54 ms → ratio ~2.0. The ratio is stable because both numerator and
// denominator scale with machine speed, and because the median (not the
// mean) ignores the occasional tick descheduled by CPU contention.
const OBSERVED_RATIO_BASELINE = 2.0;
// Hard ceiling = baseline * generous slack (~2.5x). The slack absorbs
// cross-machine and run-to-run variation while still tripping on a
// genuine per-tick regression: re-introducing a full-state clone, an
// unshift-based log prepend, or an uncached Object.entries walk adds a
// constant cost to every tick, which raises the median and pushes the
// ratio past this ceiling.
const BUDGET_RATIO = 5.0;

/**
 * Deterministic, engine-independent reference workload. Pure CPU +
 * allocation + sort, the same kind of work the engine does, so its cost
 * tracks the machine's speed but never changes when formulas.ts changes.
 * Returns the BEST (min) of several reps to suppress GC / scheduler
 * noise — we want the machine's floor speed, not its jitter.
 */
function calibrationCostMs(): number {
  const ITER = 4000;
  const REPS = 400;
  let best = Infinity;
  let sink = 0;
  for (let r = 0; r < REPS; r++) {
    const t0 = performance.now();
    const arr = new Array<number>(ITER);
    for (let i = 0; i < ITER; i++) arr[i] = (i * 2654435761) % 100003;
    arr.sort((a, b) => a - b);
    let acc = 0;
    for (let i = 0; i < ITER; i++) acc += Math.sqrt(arr[i] + 1);
    const dt = performance.now() - t0;
    if (dt < best) best = dt;
    sink += acc;
  }
  if (!Number.isFinite(sink)) throw new Error("calibration produced NaN");
  return best;
}

function ageBase(ticks: number): GameState {
  let s = createInitialState();
  for (let i = 0; i < ticks; i++) s = runTick(s).newState;
  return s;
}

/**
 * Layer a fully-loaded Vulcan Arms Consortium onto the aged state so the
 * tick has to exercise the production / contract / delivery code paths
 * every tick — these are part of the per-tick cost we're budgeting.
 * Mirrors the seeding used by lateGameStress.test.ts.
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

function meanOf(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function medianOf(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// How many ticks the failure-only diagnostic pass runs with the profiler
// enabled. Kept small: it only runs when the budget has already tripped, so
// its only job is to gather enough per-section samples to name the culprit,
// not to produce a stable mean. It never touches the timed budget window.
const DIAG_TICKS = 200;
// How many hottest sections to name in the failure message.
const DIAG_TOP_N = 3;

describe("engine tick performance budget", () => {
  // Defensive: never let the failure-only diagnostic pass leave the module
  // profiler flag (or its samples) set for any other test sharing the process.
  afterEach(() => {
    _resetTickProfilerForTests();
  });

  it(
    "keeps median tick cost under the calibrated budget",
    { timeout: 180_000 },
    () => {
      // 1) Calibrate machine speed (engine-independent reference).
      const calibMs = calibrationCostMs();

      // 2) Build a fully-populated late-game state.
      let s = seedFullyLoadedVulcan(ageBase(AGE_TICKS));

      // 3) Warm up the JIT, discarding timings.
      for (let i = 0; i < WARMUP_TICKS; i++) s = runTick(s).newState;

      // 4) Measure. The profiler MUST stay disabled across this window so its
      // performance.now() brackets can't perturb the very cost we're timing.
      expect(isTickProfilingEnabled()).toBe(false);
      const samples = new Array<number>(MEASURE_TICKS);
      for (let i = 0; i < MEASURE_TICKS; i++) {
        const t0 = performance.now();
        s = runTick(s).newState;
        samples[i] = performance.now() - t0;
      }

      const meanTickMs = meanOf(samples);
      const medianTickMs = medianOf(samples);
      // Ratio is built from the MEDIAN tick, not the mean: this test runs
      // inside the `perf` validation step while the full parallel test
      // suite + typecheck hammer every core, so a handful of ticks get
      // descheduled for 100s of ms (GC / scheduler steal). The mean
      // absorbs those isolated spikes and blows the ratio (observed
      // >12x) even with no engine change; the median ignores them. A real
      // per-tick regression adds a constant cost to EVERY tick, so it
      // raises the median just as much as the mean — detection is intact.
      const observedRatio = medianTickMs / calibMs;

      console.log(
        [
          ``,
          `=== tick performance budget ===`,
          `  aged base ticks:      ${AGE_TICKS}`,
          `  warmup ticks:         ${WARMUP_TICKS}`,
          `  measured ticks:       ${MEASURE_TICKS}`,
          `  calibration unit:     ${calibMs.toFixed(4)} ms (min of reps)`,
          `  mean tick:            ${meanTickMs.toFixed(4)} ms`,
          `  median tick:          ${medianTickMs.toFixed(4)} ms`,
          `  OBSERVED RATIO:       ${observedRatio.toFixed(3)}  (median tick / calibration unit)`,
          `  baseline ratio:       ${OBSERVED_RATIO_BASELINE}`,
          `  budget ratio ceiling: ${BUDGET_RATIO}`,
          ``,
          `  → To re-baseline after an intentional perf change, set`,
          `    OBSERVED_RATIO_BASELINE to the OBSERVED RATIO above and`,
          `    BUDGET_RATIO to roughly 2.5x that.`,
        ].join("\n"),
      );

      // Sanity: the world really is populated (caps hit) and finite.
      expect(s.totalTicks).toBe(AGE_TICKS + WARMUP_TICKS + MEASURE_TICKS);
      expect(Number.isFinite(meanTickMs)).toBe(true);
      expect(calibMs).toBeGreaterThan(0);

      // ── Failure-only culprit diagnosis ──────────────────────────────────
      // If (and only if) the ratio has already tripped, run a short, SEPARATE
      // pass with the per-section profiler enabled to name the hottest safeSub
      // subsystem(s) right in the failure message. This runs strictly after
      // the timed window, so the measured budget above never carries any
      // profiling overhead, and the afterEach() resets the module flag so the
      // enable never leaks into other tests or into GameState.
      let culpritDetail = "";
      if (observedRatio >= BUDGET_RATIO) {
        setTickProfilingEnabled(true);
        try {
          for (let i = 0; i < DIAG_TICKS; i++) s = runTick(s).newState;
          const snap = getProfilerSnapshot();
          const top = snap.sections.slice(0, DIAG_TOP_N);
          if (top.length > 0) {
            const rows = top.map(
              (sec, idx) =>
                `      #${idx + 1} ${sec.name} — ${sec.avg.toFixed(4)} ms avg` +
                ` (p95 ${sec.p95.toFixed(4)} ms, n=${sec.count})`,
            );
            culpritDetail =
              `\n\n  Likely culprit — hottest safeSub sections over a ` +
              `${DIAG_TICKS}-tick diagnostic pass (profiler enabled only ` +
              `after the timed window):\n${rows.join("\n")}`;
          } else {
            culpritDetail =
              `\n\n  (Diagnostic pass captured no per-section samples — ` +
              `is the profiler instrumentation wired into runTick?)`;
          }
        } finally {
          setTickProfilingEnabled(false);
        }
      }

      // THE REGRESSION TRIPWIRE (machine-independent). On failure the message
      // names the subsystem to look at first, so a CI log alone points at the
      // culprit without re-running the separate tickProfile.test.ts.
      expect(
        observedRatio,
        `tick budget exceeded: observed ratio ${observedRatio.toFixed(3)} ` +
          `(median tick ${medianTickMs.toFixed(4)} ms / calibration ` +
          `${calibMs.toFixed(4)} ms) >= ceiling ${BUDGET_RATIO}.${culpritDetail}`,
      ).toBeLessThan(BUDGET_RATIO);
    },
  );
});

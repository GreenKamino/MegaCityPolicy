/**
 * Late-game stress test for the MEGACITY engine.
 *
 * Builds a deeply aged base state (10k ticks of runTick), then layers a
 * fully-loaded Vulcan Arms Consortium on top — multiple factories
 * mid-build, multiple factories already active, every contract slot
 * filled — and drives runTick + tickVulcanProduction in lockstep for
 * thousands more ticks.
 *
 * Surfaces:
 *   - Catastrophic perf regressions deep into a real playthrough.
 *   - Unbounded growth in messages, activeEvents, worldEventLog,
 *     vulcan.factories, vulcan.contracts.
 *   - Numeric drift (NaN/Infinity) in credits, reputation, stockpiles.
 *   - Reputation/log clamps holding under load.
 *
 * Loose, percentile-friendly assertions intentionally — this exists to
 * catch real regressions, not flake on cold CI runners.
 */

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  FACTORY_RULES,
  PROCUREMENT_TEMPLATES,
  PROCUREMENT_TEMPLATE_IDS,
  createDefaultVulcanState,
  tickVulcanProduction,
  type MunitionTypeId,
  type VulcanState,
} from "@/engine/munitionsCompany";
import type { GameState } from "@/engine/types";

const STRESS_TICKS = 5000;

function ageBase(ticks: number): GameState {
  let s = createInitialState();
  for (let i = 0; i < ticks; i++) s = runTick(s).newState;
  return s;
}

function seedFullyLoadedVulcan(state: GameState): GameState {
  // 8 factories across all 4 real Vulcan factory types: 4 already
  // active (producing every tick), 4 still building at varying stages
  // so factory→active transitions fire throughout the run.
  const v: VulcanState = createDefaultVulcanState();
  const startedTick = state.totalTicks ?? 0;
  const seeded: VulcanState["factories"] = [
    { uid: "f-ammo-1",      type: "ammo_plant",         status: "active",   buildTicksRemaining: 0,    startedTick },
    { uid: "f-ammo-2",      type: "ammo_plant",         status: "active",   buildTicksRemaining: 0,    startedTick },
    { uid: "f-shell-1",     type: "shell_forge",        status: "active",   buildTicksRemaining: 0,    startedTick },
    { uid: "f-missile-1",   type: "missile_works",      status: "active",   buildTicksRemaining: 0,    startedTick },
    { uid: "f-shell-2",     type: "shell_forge",        status: "building", buildTicksRemaining: 50,   startedTick },
    { uid: "f-missile-2",   type: "missile_works",      status: "building", buildTicksRemaining: 250,  startedTick },
    { uid: "f-arsenal-1",   type: "strategic_arsenal",  status: "building", buildTicksRemaining: 700,  startedTick },
    { uid: "f-arsenal-2",   type: "strategic_arsenal",  status: "building", buildTicksRemaining: 1500, startedTick }, // longest build in seed
  ];
  // Defensive sanity: every seeded type must exist in FACTORY_RULES.
  v.factories = seeded.filter((f) => FACTORY_RULES[f.type] != null);

  // Every procurement template signed at once. unitsRemaining is sized
  // to *outlast* the full stress run: 1.25x the maximum possible
  // deliveries the contract could fire over STRESS_TICKS at its native
  // cadence. This keeps delivery pressure sustained edge-to-edge rather
  // than collapsing midway and leaving the back half of the run idle.
  v.contracts = PROCUREMENT_TEMPLATE_IDS.map((tid, i) => {
    const tpl = PROCUREMENT_TEMPLATES[tid];
    const maxDeliveries = Math.ceil(STRESS_TICKS / tpl.ticksBetweenDeliveries);
    const sustainedUnits = Math.ceil(maxDeliveries * tpl.unitsPerDelivery * 1.25);
    return {
      uid: `c-${tid}-${i}`,
      templateId: tid,
      unitsRemaining: sustainedUnits,
      ticksUntilNextDelivery: tpl.ticksBetweenDeliveries,
      startedTick,
    };
  });

  // Bootstrap reserve: just enough finished goods for the first 1-2
  // deliveries per contract while the active factories warm into a
  // production rhythm. Keeping this small forces factory output to
  // matter for the bulk of the run, so production-path regressions
  // can't hide behind an over-stocked reserve.
  v.reserve = Object.fromEntries(
    PROCUREMENT_TEMPLATE_IDS.map((tid) => {
      const tpl = PROCUREMENT_TEMPLATES[tid];
      return [tpl.munitionId, tpl.unitsPerDelivery * 2] as const;
    }),
  ) as Partial<Record<MunitionTypeId, number>>;

  v.totalRevenue = 0;
  v.reputation = 75;

  return { ...state, vulcan: v };
}

type Stats = {
  ticks: number;
  totalMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

function summarize(samples: number[], totalMs: number): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const at = (q: number) => sorted[Math.min(n - 1, Math.floor(q * n))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    ticks: n,
    totalMs,
    meanMs: sum / n,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted[n - 1],
  };
}

describe("engine late-game stress (10k aged base + loaded Vulcan)", () => {
  it(
    "survives 5000 combined runTick + Vulcan ticks on a 10k-aged base",
    // Runs only in `validate:perf` (serial, RUN_STRESS=1); excluded from
    // the default parallel `test` run. Generous hang-guard timeout — the
    // real regression detectors are the per-tick percentile ceilings.
    { timeout: 600_000 },
    () => {
      const ageStart = performance.now();
      const aged = ageBase(10_000);
      const ageMs = performance.now() - ageStart;

      let s = seedFullyLoadedVulcan(aged);

      const samples = new Array<number>(STRESS_TICKS);

      let totalDeliveries = 0;
      let totalCompleted = 0;
      let totalNewlyActive = 0;
      // Sample delivery counts at quartile boundaries so we can prove
      // delivery pressure stayed sustained — not just "fired at all"
      // but "kept firing in the back half of the run".
      let deliveriesByQ1 = 0;
      let deliveriesByQ2 = 0;
      let deliveriesByQ3 = 0;
      // Per-template Q4 delivery counters — guard against per-line
      // starvation that an aggregate counter would mask. One healthy
      // contract can hide collapse in seven others if you only count
      // the total. Initialised to 0 for every seeded template id.
      const q4PerTemplate: Record<string, number> = Object.fromEntries(
        PROCUREMENT_TEMPLATE_IDS.map((tid) => [tid, 0] as const),
      );
      // In-loop transient sanity samples — check at fixed intervals
      // that reserve/stockpile arithmetic stays finite and that array
      // caps are still being enforced *during* the run, not only at
      // the terminal snapshot. Catches transient NaN/Inf or cap blow-
      // outs that get smoothed over before the run ends.
      const SAMPLE_EVERY = 250;
      let transientSanityFailures = 0;

      const wallStart = performance.now();
      for (let i = 0; i < STRESS_TICKS; i++) {
        const t0 = performance.now();
        const tickResult = runTick(s);
        s = tickResult.newState;
        const v = tickVulcanProduction(s, s.totalTicks ?? 0);
        s = { ...s, ...v.next } as GameState;
        const t1 = performance.now();
        samples[i] = t1 - t0;

        totalDeliveries += v.deliveries.length;
        totalCompleted += v.completedContracts.length;
        totalNewlyActive += v.newlyActiveFactories.length;

        // Q4 = ticks in the final quarter of the run.
        const inQ4 = i >= Math.floor(STRESS_TICKS * 0.75);
        if (inQ4) {
          for (const d of v.deliveries) {
            const c = s.vulcan?.contracts.find((x) => x.uid === d.contractUid);
            if (c) q4PerTemplate[c.templateId] = (q4PerTemplate[c.templateId] ?? 0) + 1;
          }
        }

        if (i + 1 === Math.floor(STRESS_TICKS * 0.25)) deliveriesByQ1 = totalDeliveries;
        if (i + 1 === Math.floor(STRESS_TICKS * 0.50)) deliveriesByQ2 = totalDeliveries;
        if (i + 1 === Math.floor(STRESS_TICKS * 0.75)) deliveriesByQ3 = totalDeliveries;

        // Sampled in-loop sanity — cheap, runs every 250 ticks (20x).
        if ((i + 1) % SAMPLE_EVERY === 0) {
          const reserveOk = Object.values(s.vulcan?.reserve ?? {}).every((n) =>
            Number.isFinite(n as number),
          );
          const stockOk = Object.values(s.stockpiles ?? {}).every((n) =>
            Number.isFinite(n as number),
          );
          const msgOk = (s.messages ?? []).length <= 250;
          const evtOk = (s.activeEvents ?? []).length <= 40;
          const logOk = (s.worldEventLog ?? []).length <= 60;
          if (!(reserveOk && stockOk && msgOk && evtOk && logOk)) transientSanityFailures++;
        }
      }
      const wallMs = performance.now() - wallStart;
      const stats = summarize(samples, wallMs);
      const deliveriesQ4 = totalDeliveries - deliveriesByQ3;

      const messageCount = (s.messages ?? []).length;
      const activeEventCount = (s.activeEvents ?? []).length;
      const worldEventLogCount = (s.worldEventLog ?? []).length;
      const factoryCount = s.vulcan?.factories.length ?? 0;
      const contractCount = s.vulcan?.contracts.length ?? 0;
      const reputation = s.vulcan?.reputation ?? 0;
      const finalCredits = (s.resources as { credits?: number } | undefined)?.credits ?? 0;
      const population = s.cityStats?.population ?? 0;
      const reserveValues = Object.values(s.vulcan?.reserve ?? {}) as number[];
      const stockpileValues = Object.values(s.stockpiles ?? {}) as number[];
      const allFinite = (xs: number[]) => xs.every((n) => Number.isFinite(n));

      console.log(
        [
          ``,
          `=== late-game stress: 10k aged base + 5k loaded ticks ===`,
          `  aging wall:         ${ageMs.toFixed(0)} ms (10000 cold ticks)`,
          `  stress wall:        ${wallMs.toFixed(0)} ms (${STRESS_TICKS} combined ticks)`,
          `  mean:               ${stats.meanMs.toFixed(3)} ms / combined tick`,
          `  p50/p95/p99/max:    ${stats.p50Ms.toFixed(3)} / ${stats.p95Ms.toFixed(3)} / ${stats.p99Ms.toFixed(3)} / ${stats.maxMs.toFixed(3)} ms`,
          ``,
          `  --- world state ---`,
          `  totalTicks:         ${s.totalTicks}`,
          `  population:         ${population.toLocaleString()}`,
          `  credits:            ${finalCredits.toLocaleString()}`,
          `  messages:           ${messageCount}`,
          `  activeEvents:       ${activeEventCount}`,
          `  worldEventLog:      ${worldEventLogCount}`,
          ``,
          `  --- vulcan ---`,
          `  factories:          ${factoryCount}`,
          `  contracts open:     ${contractCount}`,
          `  reputation:         ${reputation}`,
          `  newly-active fac:   ${totalNewlyActive} over run`,
          `  deliveries fired:   ${totalDeliveries} over run`,
          `    by quartile:      Q1=${deliveriesByQ1}  Q2=${deliveriesByQ2 - deliveriesByQ1}  Q3=${deliveriesByQ3 - deliveriesByQ2}  Q4=${deliveriesQ4}`,
          `    Q4 by template:   ${PROCUREMENT_TEMPLATE_IDS.map((tid) => `${tid}=${q4PerTemplate[tid]}`).join("  ")}`,
          `  contracts closed:   ${totalCompleted} over run`,
          `  reserve entries:    ${reserveValues.length} (all finite: ${allFinite(reserveValues)})`,
          `  stockpile entries:  ${stockpileValues.length} (all finite: ${allFinite(stockpileValues)})`,
          `  transient samples:  ${Math.floor(STRESS_TICKS / SAMPLE_EVERY)} taken, ${transientSanityFailures} failed`,
        ].join("\n"),
      );

      // ── Perf invariants (loose, percentile-friendly ceilings) ───────
      // Combined runTick + Vulcan tick should still fit a frame budget
      // on average even on slow CI; 50 ms is the same threshold the
      // existing perfStress suite uses for runTick alone.
      expect(stats.meanMs).toBeLessThan(50);
      // The 99th-percentile combined tick should stay well under half a
      // second. We assert on p99, never the raw max: when this runs in
      // the parallel validation suite (alongside the full test run +
      // typecheck), a single tick out of 5000 can be descheduled for a
      // GC pause or scheduler steal — observed >2 s — which is CPU
      // contention, not an engine regression. A raw-max ceiling flakes
      // on those isolated spikes; p99 ignores them while a genuine
      // O(n^2) regression (which raises the whole distribution) still
      // trips it.
      expect(stats.p99Ms).toBeLessThan(500);

      // ── State advancement sanity ────────────────────────────────────
      expect(s.totalTicks).toBe(10_000 + STRESS_TICKS);

      // ── Numeric integrity (no NaN/Infinity drift) ───────────────────
      expect(Number.isFinite(finalCredits)).toBe(true);
      expect(Number.isFinite(population)).toBe(true);
      expect(Number.isFinite(reputation)).toBe(true);
      expect(reputation).toBeGreaterThanOrEqual(0);
      expect(reputation).toBeLessThanOrEqual(100);
      // Reserve and player stockpiles must stay finite across the run —
      // this is where Vulcan production/delivery arithmetic lives, so
      // an introduced NaN would surface here before the player UI.
      expect(allFinite(reserveValues)).toBe(true);
      expect(allFinite(stockpileValues)).toBe(true);

      // ── Memory caps (tight regression tripwires) ────────────────────
      // Real engine caps from sanitizer.ARRAY_CAPS are messages=200,
      // activeEvents=30, worldEventLog=50. We allow a small buffer over
      // each cap (roughly 1.25x) so this fails fast if a cap is removed
      // or weakened, but doesn't flake on a one-off race past the cap.
      expect(messageCount).toBeLessThanOrEqual(250);
      expect(activeEventCount).toBeLessThanOrEqual(40);
      expect(worldEventLogCount).toBeLessThanOrEqual(60);

      // ── Vulcan structural integrity ─────────────────────────────────
      // We never seed more than 8 factories; the engine never adds more
      // on its own. Same for contracts — we only seed once.
      expect(factoryCount).toBeLessThanOrEqual(8);
      expect(contractCount).toBeLessThanOrEqual(PROCUREMENT_TEMPLATE_IDS.length);
      // Every initially-building factory should have come online during
      // the run. Longest seeded build is 1500 ticks << STRESS_TICKS.
      expect(totalNewlyActive).toBe(4);

      // ── Sustained delivery pressure (the whole point of the run) ───
      // Bootstrap reserve only covers ~2 deliveries per contract, so
      // by Q4 deliveries depend almost entirely on factory output.
      // Asserting Q4 > 0 proves the production→reserve→delivery
      // pipeline kept firing in the back half of the run, which is
      // what "late-game stress" actually means.
      expect(totalDeliveries).toBeGreaterThan(0);
      expect(deliveriesQ4).toBeGreaterThan(0);
      // Throughput floor: Q4 must hold at least 60% of Q2's volume.
      // A "Q4 > 0" check alone passes even on near-collapse; this
      // catches partial regressions where late-run delivery rate
      // crashes but doesn't reach zero.
      const q2Count = deliveriesByQ2 - deliveriesByQ1;
      expect(deliveriesQ4).toBeGreaterThanOrEqual(Math.floor(q2Count * 0.6));
      // Per-template non-starvation: every contract template must
      // have fired at least one delivery during Q4. Aggregate counts
      // can hide a single starved munition line behind seven healthy
      // ones; this assertion forces every line to remain alive.
      for (const tid of PROCUREMENT_TEMPLATE_IDS) {
        expect(q4PerTemplate[tid], `template ${tid} starved during Q4`).toBeGreaterThan(0);
      }
      // And contracts shouldn't have all finished early — at least one
      // should still be open at the end, proving the load held.
      expect(contractCount).toBeGreaterThan(0);

      // ── Transient mid-run integrity ────────────────────────────────
      // Sampled checks every 250 ticks must all have passed. Catches
      // intra-run NaN/Inf or cap-blowout that would be smoothed over
      // before the terminal snapshot.
      expect(transientSanityFailures).toBe(0);
    },
  );
});

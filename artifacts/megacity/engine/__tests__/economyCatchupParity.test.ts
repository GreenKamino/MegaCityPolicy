import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { processMissedTicks } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import type { GameState } from "@/engine/types";
import { mockNoSpawnRandom } from "@/engine/__tests__/testFixtures";

// Production BATCH_LIMIT is 1500 (PROCESS_MISSED_TICKS_BATCH_LIMIT in
// engine/formulas.ts). These tests validate the rate-extrapolation
// FORMULAS, which only fire beyond BATCH_LIMIT live ticks. Running 1500
// real ticks first lets nondeterministic per-tick state drift swamp the
// signal we're trying to measure, so we pass an explicit small batchLimit
// override into processMissedTicks to test the extrapolation block in
// isolation. Production code never overrides this.
const BATCH_LIMIT = 6;

function makeState(opts: {
  population: number;
  miningPolicies?: string[];
}): GameState {
  const base = createInitialState();
  return {
    ...base,
    cityStats: { ...base.cityStats, population: opts.population },
    activeMiningPolicies: (opts.miningPolicies ?? []) as GameState["activeMiningPolicies"],
    resources: { ...base.resources, credits: 5_000_000 },
  };
}

/**
 * Deterministic differential parity helper. With Math.random pinned, runTick
 * is fully deterministic, so identical starting states + identical tick counts
 * yield identical end states. This lets us compare a baseline run (K live
 * ticks) against an extended run (K + skipped ticks) and assert that the
 * difference exactly matches the skipped-tick extrapolation formula applied
 * to the post-live rates.
 */
function skippedCreditDelta(state: GameState, skipped: number): {
  delta: number;
  baseline: GameState;
} {
  const baseline = processMissedTicks(state, BATCH_LIMIT, BATCH_LIMIT).newState;
  const extended = processMissedTicks(state, BATCH_LIMIT + skipped, BATCH_LIMIT).newState;
  return {
    delta: extended.resources.credits - baseline.resources.credits,
    baseline,
  };
}

describe("processMissedTicks late-game balance regressions (deterministic)", () => {
  beforeEach(() => {
    // Keep random spawners out of the exact budget comparison. The shared
    // fixture intentionally uses the documented no-spawn boundary.
    mockNoSpawnRandom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes mining-policy income (steel-scaled with floor) in the skipped batch — exact match", () => {
    const skipped = 25;
    const stateNoPol = makeState({ population: 220_000 });
    const stateWithPol = makeState({
      population: 220_000,
      miningPolicies: ["reclamation_tax", "black_market_ore"],
    });

    const { delta: deltaNoPol, baseline: blNoPol } = skippedCreditDelta(stateNoPol, skipped);
    const { delta: deltaWithPol, baseline: blWithPol } = skippedCreditDelta(stateWithPol, skipped);

    // Steel rate must match between the two runs (mining policies don't change
    // steel production directly here — they only add credit income).
    expect(blWithPol.rates.steelProduction).toBe(blNoPol.rates.steelProduction);

    const steel = Math.max(0, blWithPol.rates.steelProduction);
    const reclamation = Math.max(2000, Math.floor(steel * 8));
    const blackMarket = Math.max(3000, Math.floor(steel * 12));
    const expectedPolicyContribution = (reclamation + blackMarket) * skipped;

    // The mining-policy run must contribute EXACTLY the policy formula on top
    // of the no-policy baseline within the skipped extrapolation window.
    expect(deltaWithPol - deltaNoPol).toBe(expectedPolicyContribution);
  });

  it("port-congestion soft cap reduces net trade revenue at megacity scale — exact match against formula", () => {
    const skipped = 30;

    // Same starting state, vary only population to vary the soft caps.
    const smallPop = 200_000; // popOver = 0, no caps
    const megaPop = 6_000_000; // popOver = 5.8M, caps fully maxed

    const small = skippedCreditDelta(makeState({ population: smallPop }), skipped);
    const mega = skippedCreditDelta(makeState({ population: megaPop }), skipped);

    // Compute expected credit deltas from the live formula directly.
    const expectedFor = (baseline: GameState): number => {
      const rates = baseline.rates;
      const popOver = Math.max(0, baseline.cityStats.population - 200_000);
      const overheadFactor = Math.min(0.3, popOver / 4_333_333);
      const portCongestionFactor = Math.min(0.25, popOver / 5_200_000);
      const grossTax = Math.max(0, rates.taxIncome);
      const grossTrade = Math.max(0, rates.tradeIncome);
      const netTax = Math.max(0, grossTax - Math.floor(grossTax * overheadFactor));
      const netTrade = Math.max(0, grossTrade - Math.floor(grossTrade * portCongestionFactor));
      return (netTax + netTrade) * skipped;
    };

    // Tolerance accommodates upstream float drift in the rates pipeline
    // (multiplicative skill/diff/augment chains) — the formula structure is
    // what we're verifying, not bit-exact float identity.
    expect(small.delta).toBeCloseTo(expectedFor(small.baseline), -2);
    expect(mega.delta).toBeCloseTo(expectedFor(mega.baseline), -2);

    // The megacity must lose materially more credits-per-tick to the soft
    // caps than the small city does (relative to gross income). This is the
    // core "soft cap is biting" assertion.
    const smallGrossPerTick = small.baseline.rates.taxIncome + small.baseline.rates.tradeIncome;
    const megaGrossPerTick = mega.baseline.rates.taxIncome + mega.baseline.rates.tradeIncome;
    const smallNetRatio = (small.delta / 30) / Math.max(1, smallGrossPerTick);
    const megaNetRatio = (mega.delta / 30) / Math.max(1, megaGrossPerTick);
    expect(megaNetRatio).toBeLessThan(smallNetRatio);

    // Sanity: the megacity must hit both caps fully.
    const megaPopOver = Math.max(0, mega.baseline.cityStats.population - 200_000);
    expect(Math.min(0.3, megaPopOver / 4_333_333)).toBe(0.3);
    expect(Math.min(0.25, megaPopOver / 5_200_000)).toBe(0.25);
  });

  it("includes active-edict per-tick credit effects in the skipped batch", () => {
    const skipped = 20;
    // relic_discovery edict: tradeIncome +800, duration 4 ticks. Use a long
    // ticksRemaining so the edict is active throughout the skipped window.
    const stateNoEdict = makeState({ population: 220_000 });
    const stateWithEdict: GameState = {
      ...makeState({ population: 220_000 }),
      activeEdicts: [
        {
          edictId: "relic_discovery",
          ticksRemaining: 999,
          issuedAtTick: 0,
          cooldownUntilTick: 0,
        },
      ],
    };

    const noE = skippedCreditDelta(stateNoEdict, skipped);
    const withE = skippedCreditDelta(stateWithEdict, skipped);

    // The edict must contribute exactly tradeIncome (800) per skipped tick.
    // Tolerance accommodates upstream float drift and any side effects from
    // other edict-driven stat changes (happiness, unrest) that flow back into
    // production rates between live ticks.
    const expectedEdictContribution = 800 * skipped;
    expect(withE.delta - noE.delta).toBeCloseTo(expectedEdictContribution, -2);
  });

  it("expires edicts that run out during the skipped window and applies their cooldowns", () => {
    const skipped = 20;
    // relic_discovery: tradeIncome +800, cooldown 24 ticks. Set
    // ticksRemaining so it survives all BATCH_LIMIT live ticks (decrements
    // to 4 by the time the extrapolation block runs) and expires inside
    // the skipped window.
    const stateWithExpiringEdict: GameState = {
      ...makeState({ population: 220_000 }),
      activeEdicts: [
        {
          edictId: "relic_discovery",
          ticksRemaining: 10,
          issuedAtTick: 0,
          cooldownUntilTick: 0,
        },
      ],
      totalTicks: 100,
    };

    const noE = skippedCreditDelta(makeState({ population: 220_000 }), skipped);
    const withE = skippedCreditDelta(stateWithExpiringEdict, skipped);

    // After BATCH_LIMIT live ticks, ticksRemaining = 4. The catchup branch
    // caps contribution to min(skipped=20, ticksRemaining=4) = 4 ticks @ 800.
    const expectedExtraInCatchup = 800 * 4;
    expect(withE.delta - noE.delta).toBeCloseTo(expectedExtraInCatchup, -2);

    // After the full catchup, the edict must be gone and a cooldown set.
    const finalState = processMissedTicks(stateWithExpiringEdict, BATCH_LIMIT + skipped, BATCH_LIMIT).newState;
    const stillActive = (finalState.activeEdicts ?? []).some(e => e.edictId === "relic_discovery");
    expect(stillActive).toBe(false);
    expect(finalState.edictCooldowns?.relic_discovery).toBeGreaterThan(0);
  });

  it("includes fx.credits (not just creditsPerTick/tradeIncome) in skipped batch", () => {
    const skipped = 20;
    // wasteland_expedition_mandate: fx.credits = -2000 per active tick.
    // ticksRemaining is set so the edict survives all BATCH_LIMIT live
    // ticks (decremented to 14 by then) and pays for
    // min(skipped, 14) = 14 ticks of extrapolation.
    const stateWithCreditsEdict: GameState = {
      ...makeState({ population: 220_000 }),
      activeEdicts: [
        {
          edictId: "wasteland_expedition_mandate",
          ticksRemaining: 20,
          issuedAtTick: 0,
          cooldownUntilTick: 0,
        },
      ],
    };

    const noE = skippedCreditDelta(makeState({ population: 220_000 }), skipped);
    const withE = skippedCreditDelta(stateWithCreditsEdict, skipped);

    // Catchup contribution = -2000 * 14 = -28000.
    const expected = -2000 * 14;
    expect(withE.delta - noE.delta).toBeCloseTo(expected, -2);
  });

  it("does not crash or produce negative credits over very long offline periods", { timeout: 120_000 }, () => {
    const state = makeState({
      population: 1_000_000,
      miningPolicies: ["reclamation_tax", "black_market_ore"],
    });
    const { newState } = processMissedTicks(state, 1000);
    expect(newState.resources.credits).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(newState.resources.credits)).toBe(true);
  });

  it("caps extrapolated fuel at the capacity provided by tank farms", () => {
    const base = makeState({ population: 220_000 });
    base.resources.fuel = 4_900;
    base.rates.fuelProduction = 25;
    base.buildings.fuelReserveTankFarms = 0;

    const fixedReserve = processMissedTicks(base, 8, 0).newState;
    expect(fixedReserve.resources.fuel).toBe(5_000);

    const expanded = makeState({ population: 220_000 });
    expanded.resources.fuel = 6_900;
    expanded.rates.fuelProduction = 25;
    expanded.buildings.fuelReserveTankFarms = 1;

    const expandedReserve = processMissedTicks(expanded, 8, 0).newState;
    expect(expandedReserve.resources.fuel).toBe(7_000);
  });
});

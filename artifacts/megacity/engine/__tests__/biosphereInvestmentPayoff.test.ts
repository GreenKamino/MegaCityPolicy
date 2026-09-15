import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  processWildlandsEcology,
  computeBiomeCaps,
} from "@/engine/wildlandsEcology";
import { applyEventMultiResponses } from "@/engine/eventResolution";
import { biomeForDistrictCategory } from "@/engine/biomes";
import { getDistrictCategory } from "@/engine/districts";
import type { Biome } from "@/engine/biomes";
import type { BiomeEcology, GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Investing in the biosphere must pay off: nature crises should calm down once
// the player heals the ecology, not spam forever regardless of effort. This
// file proves the three links in that chain end to end:
//
//   1. A healthy biosphere (cityStats.biosphere > 50) materially cuts the rate
//      of new biome-tagged crises versus a low-biosphere city.
//   2. Building stewardship / reclamation infrastructure actually lifts
//      biosphere from its cold-start value (20) up past 50 over a real
//      runTick playthrough.
//   3. Resolving a spawned nature crisis on the true resolution path runs
//      resolveBiosphereEvent — healing the biome and opening a calm window
//      that suppresses an immediate re-fire.
//
// Companion coverage: biosphereResolution.test.ts unit-tests resolveBiosphereEvent
// in isolation, and eventMultiResolution.test.ts unit-tests the applyEventMultiResponses
// reducer with a hand-built event. This file is deliberately different: it drives
// the *real* spawner (processWildlandsEcology) and the *real* recovery loop
// (runTick), so it guards the wiring rather than the individual pieces.
// ─────────────────────────────────────────────────────────────────────────────

// Small deterministic PRNG so crisis-spawn counts are fully reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A biome with every population at zero is a fixed point of the ecology step:
// zero times any growth rate is still zero, so the collapse holds tick after
// tick. That pins floraRatio (0) < 0.25 and herbRatio (0) < 0.2, which arms the
// two crisisChance-gated collapse branches (flora_collapse, herbivore_die_off)
// and nothing else — the cleanest possible probe of the biosphere gate.
function collapsedEco(): BiomeEcology {
  return {
    flora: 0,
    herbivore: 0,
    predator: 0,
    vermin: 0,
    megafauna: 0,
    scavenger: 0,
    lastDelta: {
      flora: 0,
      herbivore: 0,
      predator: 0,
      vermin: 0,
      megafauna: 0,
      scavenger: 0,
    },
  };
}

// Reduce createInitialState's 270 districts down to the single biome its first
// district belongs to, so processWildlandsEcology operates on exactly one biome
// — one spawn roll per ecology tick, no cross-biome noise.
function restrictToSingleBiome(state: GameState): Biome {
  const biome = biomeForDistrictCategory(
    getDistrictCategory(state.districts[0].id),
  );
  state.districts = state.districts.filter(
    (d) => biomeForDistrictCategory(getDistrictCategory(d.id)) === biome,
  );
  return biome;
}

// Count how many biome crises spawn across ITERATIONS independent clean rolls
// at a fixed cityStats.biosphere. Every trial resets from the same collapsed
// biome, low district ecology, and the same fixed PRNG seed, so biosphere is
// the only structural input to crisisChance and the counts are reproducible.
function countCrisesAtBiosphere(biosphere: number, iterations: number): number {
  const state = createInitialState();
  const biome = restrictToSingleBiome(state);
  state.cityStats.biosphere = biosphere;
  // Pin district ecology low so ecologyAvg stays < 50 and no ungated
  // (biosphere-independent) branch — poaching, ecological_balance — can fire.
  state.districts = state.districts.map((d) => ({ ...d, ecology: 5 }));

  // Same seed for every biosphere level: identical random stream.
  vi.spyOn(Math, "random").mockImplementation(mulberry32(0x5eed));

  let spawns = 0;
  for (let i = 1; i <= iterations; i++) {
    // ECOLOGY_TICK_PERIOD is 4; keep every trial on a processing tick.
    state.totalTicks = i * 4;
    // Fresh, independent trial: reopen every spawn gate and re-arm the
    // collapse so each iteration is a clean roll of the crisis dice.
    state.activeEvents = [];
    state.eventHistory = [];
    state.eventTriggerCooldowns = {};
    state.wildlandsEcology = { [biome]: collapsedEco() };

    processWildlandsEcology(state, []);
    spawns += state.activeEvents.length;
  }

  vi.restoreAllMocks();
  return spawns;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("biosphere investment payoff — nature crises calm down when you heal the ecology", () => {
  it("a healthy biosphere materially cuts the rate of new nature crises versus a low-biosphere city", () => {
    // Controlled experiment. Both runs start from the same collapsed biome,
    // the same low district ecology, and the same fixed PRNG seed, so each run
    // is fully deterministic and reproducible. The only setup difference is
    // cityStats.biosphere, the sole input to crisisChance:
    //   biosphere 20  -> crisisChance ~0.97 (near the natural-recovery floor)
    //   biosphere 100 -> crisisChance 0.5   (negative-crisis odds roughly halved)
    // (The two PRNG streams diverge once spawns differ, since spawning consumes
    // extra draws for candidate selection and event flavor — but the gate is
    // the only structural difference, so the ~0.55x reduction holds across the
    // 4000-trial aggregate.)
    const ITERATIONS = 4000;

    const lowBiosphereCrises = countCrisesAtBiosphere(20, ITERATIONS);
    const highBiosphereCrises = countCrisesAtBiosphere(100, ITERATIONS);

    // Both regimes must actually produce crises, or the ratio below would pass
    // vacuously on a broken setup that silently spawns nothing.
    expect(lowBiosphereCrises).toBeGreaterThan(0);
    expect(highBiosphereCrises).toBeGreaterThan(0);

    // The payoff: a thriving biosphere sees materially fewer new crises. 0.75x
    // leaves comfortable margin over the ~0.55x structural ratio while still
    // failing loudly if the gate is ever weakened or removed.
    expect(highBiosphereCrises).toBeLessThan(lowBiosphereCrises * 0.75);
  });

  it("a partially recovered biosphere (still below 50) already sees measurably fewer crises than one pinned at the natural floor", () => {
    // The below-50 payoff. Before this easing the crisisChance gate was a hard
    // no-op until biosphere 50, so a city recovering from the natural floor
    // (~15) toward 50 saw the SAME crisis storm the whole way up — recovery
    // felt like no progress. The ramp now begins at the floor, so a partially
    // recovered city already earns quieter alerts well before it reaches 50.
    //
    //   biosphere 15 -> crisisChance 1.0   (natural-recovery floor: full odds)
    //   biosphere 45 -> crisisChance ~0.82 (partial recovery, still < 50)
    //
    // Both runs stay below 50, so this cannot pass on the old above-50-only
    // gate — it fails loudly if the below-floor easing is ever removed.
    const ITERATIONS = 4000;

    const flooredCrises = countCrisesAtBiosphere(15, ITERATIONS);
    const recoveringCrises = countCrisesAtBiosphere(45, ITERATIONS);

    // Both regimes must actually produce crises so the ratio isn't vacuous.
    expect(flooredCrises).toBeGreaterThan(0);
    expect(recoveringCrises).toBeGreaterThan(0);

    // Partial recovery is a real, measurable win — fewer crises even though the
    // city is still short of a healthy biosphere. The structural crisisChance
    // ratio is ~0.82; 0.95x is a loose bound that still catches a regression to
    // the old below-50 no-op (which would make the two counts ~equal).
    expect(recoveringCrises).toBeLessThan(flooredCrises * 0.95);
  });

  it("building biosphere infrastructure lifts biosphere from its low cold-start value up past 50", () => {
    const state = createInitialState();
    state.hasCompletedOnboarding = true; // veteran: no start-paused gating
    const startBiosphere = state.cityStats.biosphere;
    expect(startBiosphere).toBeLessThan(50); // cold start is unhealthy (20)

    // A heavy stack of stewardship + reclamation infrastructure and no
    // extractive buildings. bioBonus climbs past 50 (=> +3 biosphere/tick) and
    // netSteward is strongly positive (=> up to +3 every other tick), so the
    // biosphere recovers instead of decaying.
    state.buildings = {
      ...state.buildings,
      biosphereReclamationDomes: 20,
      decontaminationForests: 20,
      bioremediationProcessingPlants: 20,
      wildlandsBioreserves: 40,
      wildlandsRangerStations: 40,
      geneVaults: 20,
      hydroponicDomes: 20,
    };

    const CAP_TICKS = 4000;
    let s: GameState = state;
    let ticks = 0;
    for (; ticks < CAP_TICKS; ticks++) {
      s = runTick(s).newState;
      if ((s.cityStats?.biosphere ?? 0) > 50) break;
    }

    expect(s.cityStats.biosphere).toBeGreaterThan(50);
    expect(s.cityStats.biosphere).toBeGreaterThan(startBiosphere);
    // The climb is a real payoff, not a marginal 4000-tick crawl.
    expect(ticks).toBeLessThan(CAP_TICKS);
  });

  it("resolving a spawned nature crisis heals the biome and the calm window blocks an immediate re-fire", () => {
    const state = createInitialState();
    const biome = restrictToSingleBiome(state);
    state.cityStats.biosphere = 20; // full crisisChance so the branch is live
    state.districts = state.districts.map((d) => ({ ...d, ecology: 5 }));

    const SPAWN_TICK = 400;
    state.totalTicks = SPAWN_TICK;
    state.activeEvents = [];
    state.eventHistory = [];
    state.eventTriggerCooldowns = {};
    state.wildlandsEcology = { [biome]: collapsedEco() };

    // Force the spawn: with Math.random() === 0 the flora_collapse branch
    // (0 < 0.4) fires and the first candidate id is chosen deterministically.
    vi.spyOn(Math, "random").mockImplementation(() => 0);
    processWildlandsEcology(state, []);

    const spawned = state.activeEvents.find((e) => e.biome === biome);
    expect(
      spawned,
      "processWildlandsEcology should spawn a biome crisis at biosphere 20",
    ).toBeDefined();

    const caps = computeBiomeCaps(state, biome);

    // Resolve through the real multi-response reducer — the same path the UI's
    // respondToEventMulti runs — which calls resolveBiosphereEvent.
    const resolved = applyEventMultiResponses(state, spawned!.id, []);

    const eco = resolved.wildlandsEcology![biome]!;
    // resolveBiosphereEvent ran: collapsed flora was restored toward its cap...
    expect(eco.flora).toBe(Math.round(caps.flora * 0.6));
    expect(eco.flora).toBeGreaterThan(0);
    // ...the post-resolution calm window opened...
    expect(eco.calmUntilTick).toBe(SPAWN_TICK + 120);
    // ...and the event was cleared from the active list.
    expect(resolved.activeEvents.some((e) => e.id === spawned!.id)).toBe(false);

    // Calm holds: 84 ticks later (past the 80-tick min-event gap, so only the
    // calm window can still be suppressing it) the biome does NOT re-fire —
    // even though herbivores are still collapsed (herbRatio 0 < 0.2 keeps the
    // herbivore_die_off branch armed).
    resolved.totalTicks = SPAWN_TICK + 84;
    resolved.activeEvents = [];
    processWildlandsEcology(resolved, []);
    expect(
      resolved.activeEvents.filter((e) => e.biome === biome).length,
    ).toBe(0);

    // Past the 120-tick calm window the biome can spawn again — the calm is a
    // temporary settle-down, not a permanent mute.
    resolved.totalTicks = SPAWN_TICK + 124;
    resolved.activeEvents = [];
    processWildlandsEcology(resolved, []);
    expect(
      resolved.activeEvents.filter((e) => e.biome === biome).length,
    ).toBeGreaterThan(0);
  });
});

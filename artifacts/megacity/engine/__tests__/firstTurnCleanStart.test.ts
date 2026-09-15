import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { applyStartStyle } from "@/engine/startStyle";
import { advanceTurn } from "@/engine/turnMode";
import { processWildlandsEcology, ensureWildlandsEcology } from "@/engine/wildlandsEcology";
import { ALL_BIOMES, biomeForDistrictCategory, type Biome } from "@/engine/biomes";
import { getDistrictCategory } from "@/engine/districts";
import { FAUNA_SPECIES } from "@/engine/faunaData";
import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// A brand-new turn-based game must not be hit by a crisis on its very first
// END TURN — for EITHER start style. This was a real bug, not veteran
// difficulty: several biomes (irradiated_jungle, fungal_caves, dead_sea_coast)
// have no herbivore species in the fauna tables, so they seeded with herbivore
// population 0 forever (0 is a fixed point of the growth step). Their
// herbRatio of 0 permanently armed the herbivore die-off crisis branch in
// processWildlandsEcology, and the very first ecology tick (tick 4 — inside
// turn one) rolled a HERBIVORE DIE-OFF / STARVATION CASCADE in ~60% of fresh
// games, guided and veteran alike. The calm-start window never gated it
// because the ecology spawner runs on tick % 4 === 0, exactly when the guided
// window (4 ticks) expires.
//
// The fix: roles with no species in a biome's flora/fauna tables are treated
// as neutral (ratio 1) — a herd that never existed cannot die off. These tests
// pin both the player-facing outcome and the mechanism.
// ─────────────────────────────────────────────────────────────────────────────

function freshTurnBasedGame(style: "guided" | "veteran"): GameState {
  let s = createInitialState();
  if (style === "veteran") s = applyStartStyle(s, "veteran");
  return { ...s, gameplayMode: "turnbased" } as GameState;
}

describe("first turn of a brand-new turn-based game runs clean", () => {
  // Probabilistic system: run many independent fresh games. Before the fix,
  // ~60 of 100 were interrupted on turn one; 0 interruptions across 60 runs
  // per style has a vanishing false-pass probability against any regression
  // that re-arms a first-tick crisis branch.
  const RUNS = 60;

  for (const style of ["guided", "veteran"] as const) {
    it(`${style}: END TURN #1 is never interrupted by a crisis (${RUNS} fresh games)`, () => {
      const interruptions: string[] = [];
      for (let i = 0; i < RUNS; i++) {
        const r = advanceTurn(freshTurnBasedGame(style));
        if (r.interruptedBy) {
          interruptions.push(`${r.interruptedBy.id} (${r.interruptedBy.severity}) at tick ${r.ticksAdvanced}`);
        }
      }
      expect(
        interruptions,
        `fresh ${style} games were interrupted on their first turn: ${interruptions.join(", ")}`,
      ).toEqual([]);
    });
  }

  it("biomes with no herbivore species never arm the herbivore die-off branch", () => {
    // The biomes whose fauna tables define zero herbivores — the exact set
    // that used to spawn phantom die-offs on a fresh map.
    const herbivoreBiomes = new Set(
      FAUNA_SPECIES.filter((f) => f.role === "herbivore").map((f) => f.biome),
    );
    const herblessBiomes = ALL_BIOMES.filter((b) => !herbivoreBiomes.has(b)) as Biome[];
    expect(
      herblessBiomes.length,
      "expected at least one biome without herbivore species (the original bug trigger); " +
        "if fauna coverage is now total, this mechanism test can be retired",
    ).toBeGreaterThan(0);

    let probed = 0;
    for (const biome of herblessBiomes) {
      const state = createInitialState();
      // Restrict the map to this biome's districts so it gets the only spawn
      // roll per ecology tick — otherwise another biome's spawn could consume
      // the global event gap and mask a regression here.
      state.districts = state.districts.filter(
        (d) => biomeForDistrictCategory(getDistrictCategory(d.id)) === biome,
      );
      if (state.districts.length === 0) continue; // biome absent from a fresh map
      state.cityStats.biosphere = 15; // full crisisChance — worst case
      state.activeEvents = [];
      state.eventHistory = [];
      state.eventTriggerCooldowns = {};
      ensureWildlandsEcology(state);
      const eco = state.wildlandsEcology?.[biome];
      expect(eco, `${biome} should seed ecology for its districts`).toBeDefined();
      expect(eco!.herbivore).toBe(0); // seeded from an empty species table

      // Run many ecology ticks; the die-off family must never spawn for this
      // biome even at maximum crisis odds. Clear actives each pass so an
      // unrelated spawn cannot saturate the active-event dedupe.
      const spawnedDieOffs: string[] = [];
      for (let i = 1; i <= 50; i++) {
        state.totalTicks = i * 4;
        processWildlandsEcology(state, []);
        for (const e of state.activeEvents ?? []) {
          if (
            e.biome === biome &&
            (e.id === "biosphere_herbivore_die_off" || e.id === "biosphere_starvation_cascade")
          ) {
            spawnedDieOffs.push(`${e.id}@tick${state.totalTicks}`);
          }
        }
        state.activeEvents = [];
      }
      expect(
        spawnedDieOffs,
        `${biome} has no herbivore species but spawned a die-off event`,
      ).toEqual([]);
      probed++;
    }
    expect(probed, "at least one herbless biome must exist on a fresh map").toBeGreaterThan(0);
  });
});

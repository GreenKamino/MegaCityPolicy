import { describe, expect, it } from "vitest";

import { resolveBiosphereEvent, computeBiomeCaps } from "@/engine/wildlandsEcology";
import { createInitialState } from "@/engine/initialState";
import type { Biome } from "@/engine/biomes";
import type { BiomeEcology, GameState } from "@/engine/types";

// Directly seed a biome's ecology so resolveBiosphereEvent has something to
// rebalance. ensureWildlandsEcology() preserves any biome already present on
// state.wildlandsEcology, so a pre-seeded entry survives even without matching
// wildlands districts.
function seedBiome(state: GameState, biome: Biome, over: Partial<BiomeEcology>): void {
  const eco: BiomeEcology = {
    flora: 0,
    herbivore: 0,
    predator: 0,
    vermin: 0,
    megafauna: 0,
    scavenger: 0,
    lastDelta: { flora: 0, herbivore: 0, predator: 0, vermin: 0, megafauna: 0, scavenger: 0 },
    ...over,
  };
  state.wildlandsEcology = { ...(state.wildlandsEcology ?? {}), [biome]: eco };
}

const BIOME: Biome = "ash_forest";

describe("resolveBiosphereEvent — post-resolution rebalance", () => {
  it("pulls a vermin swarm back under cap and opens a 120-tick calm window", () => {
    const state = createInitialState();
    state.totalTicks = 500;
    // Vermin exploded far above any plausible cap — this is what re-fires a
    // sibling swarm event if left untouched.
    seedBiome(state, BIOME, { vermin: 5_000_000 });
    const caps = computeBiomeCaps(state, BIOME);

    resolveBiosphereEvent(state, BIOME, "biosphere_vermin_swarm");

    const eco = state.wildlandsEcology![BIOME]!;
    expect(eco.vermin).toBe(Math.round(caps.vermin * 0.5));
    expect(eco.vermin).toBeLessThan(caps.vermin);
    expect(eco.calmUntilTick).toBe(500 + 120);
    // The rebalance is recorded as a negative delta (population fell).
    expect(eco.lastDelta.vermin).toBeLessThan(0);
  });

  it("restores predator overrun: culls predators and rebuilds the prey base", () => {
    const state = createInitialState();
    state.totalTicks = 200;
    seedBiome(state, BIOME, { predator: 4_000_000, herbivore: 0 });
    const caps = computeBiomeCaps(state, BIOME);

    resolveBiosphereEvent(state, BIOME, "biosphere_predator_overrun");

    const eco = state.wildlandsEcology![BIOME]!;
    expect(eco.predator).toBe(Math.round(caps.predator * 0.55));
    expect(eco.herbivore).toBe(Math.round(caps.herbivore * 0.55));
    expect(eco.calmUntilTick).toBe(200 + 120);
  });

  it("treats a disease crisis by suppressing spread rather than deleting the biome", () => {
    const state = createInitialState();
    state.totalTicks = 40;
    seedBiome(state, BIOME, { vermin: 2_000_000 });

    resolveBiosphereEvent(state, BIOME, "biosphere_zoonotic_jump");

    const eco = state.wildlandsEcology![BIOME]!;
    expect(eco.diseaseSuppressedTicks ?? 0).toBeGreaterThanOrEqual(80);
    expect(eco.vaccinationTicks ?? 0).toBeGreaterThanOrEqual(80);
    expect(eco.calmUntilTick).toBe(40 + 120);
  });

  it("is a no-op for an unrecognised event id (no calm window, no mutation)", () => {
    const state = createInitialState();
    state.totalTicks = 12;
    seedBiome(state, BIOME, { vermin: 9999 });
    const before = JSON.stringify(state.wildlandsEcology);

    resolveBiosphereEvent(state, BIOME, "not_a_biosphere_event");

    expect(JSON.stringify(state.wildlandsEcology)).toBe(before);
  });
});

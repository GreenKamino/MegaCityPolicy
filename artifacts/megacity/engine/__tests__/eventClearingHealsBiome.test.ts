import { describe, expect, it } from "vitest";

import {
  applyEventResponse,
  applyEventDismissal,
  applyEventMultiResponses,
} from "@/engine/eventResolution";
import { computeBiomeCaps } from "@/engine/wildlandsEcology";
import { createInitialState } from "@/engine/initialState";
import type { Biome } from "@/engine/biomes";
import type { BiomeEcology, EventResponse, GameEvent, GameState } from "@/engine/types";

// Single guard for the whole class of "a clearing path silently stops healing
// the biome" regressions. A player can clear a nature/biosphere crisis three
// ways — answer it (respondToEvent), dismiss it (dismissEvent), or answer a
// multi-choice version (respondToEventMulti / applyEventMultiResponses). All
// three MUST rebalance the originating biome and open a post-resolution calm
// window, or the crisis re-fires via a sibling event ~80 ticks later. Each path
// was fixed separately in the past; this parametrized test asserts the shared
// invariant across every path so a future fourth path — or a refactor that
// drops the resolveBiosphereEvent call from any existing path — fails loudly
// here instead of shipping a silently re-firing crisis.
//
// These call the real pure reducers that GameContext.respondToEvent /
// dismissEvent / respondToEventMulti delegate to, so the test exercises the
// production clearing logic, not a re-implementation.

const BIOME: Biome = "ash_forest";
const EVENT_ID = "biosphere_vermin_swarm"; // maps to the "vermin_swarm" trigger
const START_TICK = 500;
const CALM_WINDOW = 120;
const SEED_VERMIN = 5_000_000; // far above any plausible cap — re-fires if untouched

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

function biosphereEvent(over: Partial<GameEvent> = {}): GameEvent {
  return {
    id: EVENT_ID,
    title: "Vermin Swarm",
    description: "",
    severity: "high",
    effects: {},
    timestamp: 0,
    resolved: false,
    biome: BIOME,
    ...over,
  };
}

const noopResponse = (id: string): EventResponse => ({
  id,
  label: id,
  description: "",
  effects: {},
});

// Each entry is a distinct way a player clears the crisis, calling the exact
// reducer the matching GameContext handler runs.
const CLEARING_PATHS: Array<{ name: string; clear: (state: GameState) => GameState }> = [
  {
    name: "respondToEvent (single response)",
    clear: (state) => applyEventResponse(state, EVENT_ID, noopResponse("exterminate")),
  },
  {
    name: "dismissEvent (ignore)",
    clear: (state) => applyEventDismissal(state, EVENT_ID),
  },
  {
    name: "respondToEventMulti / applyEventMultiResponses (multi-choice)",
    clear: (state) => applyEventMultiResponses(state, EVENT_ID, [noopResponse("contain"), noopResponse("cull")]),
  },
];

describe("every way of clearing a nature event heals the ecosystem", () => {
  it.each(CLEARING_PATHS)(
    "$name rebalances the originating biome, opens a calm window, and clears the event",
    ({ clear }) => {
      const state = createInitialState();
      state.totalTicks = START_TICK;
      seedBiome(state, BIOME, { vermin: SEED_VERMIN });
      state.activeEvents = [biosphereEvent()];
      const caps = computeBiomeCaps(state, BIOME);

      const next = clear(state);

      const eco = next.wildlandsEcology![BIOME]!;
      // Biome rebalanced: the exploded vermin population is pulled back under
      // cap — this is exactly what stops a sibling swarm event re-firing.
      expect(eco.vermin).toBe(Math.round(caps.vermin * 0.5));
      expect(eco.vermin).toBeLessThan(caps.vermin);
      // Post-resolution calm window opened so the crisis actually stays resolved.
      expect(eco.calmUntilTick).toBe(START_TICK + CALM_WINDOW);
      // The rebalance is recorded as a negative delta (population fell).
      expect(eco.lastDelta.vermin).toBeLessThan(0);
      // The event is cleared from the active list.
      expect(next.activeEvents.some((e) => e.id === EVENT_ID)).toBe(false);
    },
  );

  it.each(CLEARING_PATHS)(
    "$name never mutates the previous state's biome (copy-on-write)",
    ({ clear }) => {
      const state = createInitialState();
      state.totalTicks = START_TICK;
      seedBiome(state, BIOME, { vermin: SEED_VERMIN });
      state.activeEvents = [biosphereEvent()];

      clear(state);

      // The original state is left untouched — healing lands on the returned
      // copy, not the input.
      expect(state.wildlandsEcology![BIOME]!.vermin).toBe(SEED_VERMIN);
      expect(state.wildlandsEcology![BIOME]!.calmUntilTick).toBeUndefined();
      expect(state.activeEvents.some((e) => e.id === EVENT_ID)).toBe(true);
    },
  );
});

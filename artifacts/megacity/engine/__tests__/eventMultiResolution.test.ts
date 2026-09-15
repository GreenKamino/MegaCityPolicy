import { describe, expect, it } from "vitest";

import { applyEventMultiResponses, applyEventResponse } from "@/engine/eventResolution";
import { computeBiomeCaps } from "@/engine/wildlandsEcology";
import { createInitialState } from "@/engine/initialState";
import type { Biome } from "@/engine/biomes";
import type { BiomeEcology, EventResponse, GameEvent, GameState } from "@/engine/types";

// Regression cover for the multi-response event path. The single-response
// (respondToEvent) and dismiss (dismissEvent) paths both rebalance the
// originating biome when a biosphere crisis is resolved; respondToEventMulti
// must do the same, or a nature crisis answered through a multi-choice event
// would silently stay out of balance and re-fire via a sibling event ~80 ticks
// later. applyEventMultiResponses is the pure reducer respondToEventMulti runs.

const BIOME: Biome = "ash_forest";
const EVENT_ID = "biosphere_vermin_swarm"; // maps to the "vermin_swarm" trigger

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

describe("applyEventMultiResponses — biosphere resolution wiring", () => {
  it("rebalances the originating biome and opens a calm window after a multi-response", () => {
    const state = createInitialState();
    state.totalTicks = 500;
    seedBiome(state, BIOME, { vermin: 5_000_000 });
    state.activeEvents = [biosphereEvent()];
    const caps = computeBiomeCaps(state, BIOME);

    const next = applyEventMultiResponses(state, EVENT_ID, [
      noopResponse("contain"),
      noopResponse("cull"),
    ]);

    const eco = next.wildlandsEcology![BIOME]!;
    // Vermin pulled back under cap — this is what stops a sibling swarm re-firing.
    expect(eco.vermin).toBe(Math.round(caps.vermin * 0.5));
    expect(eco.vermin).toBeLessThan(caps.vermin);
    expect(eco.calmUntilTick).toBe(500 + 120);
    // The event is cleared from the active list.
    expect(next.activeEvents.some((e) => e.id === EVENT_ID)).toBe(false);
  });

  it("still resolves the biome when no responses are supplied, without mutating prev", () => {
    const state = createInitialState();
    state.totalTicks = 300;
    seedBiome(state, BIOME, { vermin: 4_000_000 });
    state.activeEvents = [biosphereEvent()];

    const next = applyEventMultiResponses(state, EVENT_ID, []);

    // Previous state untouched (copy-on-write): biome unchanged, event still active.
    expect(state.wildlandsEcology![BIOME]!.vermin).toBe(4_000_000);
    expect(state.wildlandsEcology![BIOME]!.calmUntilTick).toBeUndefined();
    expect(state.activeEvents.some((e) => e.id === EVENT_ID)).toBe(true);

    // Result is resolved.
    const eco = next.wildlandsEcology![BIOME]!;
    expect(eco.vermin).toBeLessThan(4_000_000);
    expect(eco.calmUntilTick).toBe(300 + 120);
    expect(next.activeEvents.some((e) => e.id === EVENT_ID)).toBe(false);
  });

  it("leaves ecology untouched for a non-biosphere event (no biome)", () => {
    const state = createInitialState();
    state.totalTicks = 100;
    seedBiome(state, BIOME, { vermin: 1000 });
    state.activeEvents = [biosphereEvent({ id: "generic_event", biome: undefined })];

    const next = applyEventMultiResponses(state, "generic_event", [noopResponse("ok")]);

    // No biome => no rebalance, no calm window; the event is still cleared.
    expect(next.wildlandsEcology![BIOME]!.vermin).toBe(1000);
    expect(next.wildlandsEcology![BIOME]!.calmUntilTick).toBeUndefined();
    expect(next.activeEvents.some((e) => e.id === "generic_event")).toBe(false);
  });
});

describe("applyEventMultiResponses — resolution news", () => {
  it("emits one parity news item containing each selected directive", () => {
    const state = createInitialState();
    state.totalTicks = 42;
    state.activeEvents = [biosphereEvent({ id: "news_event", biome: undefined, title: "News Event" })];
    const response = noopResponse("first");
    response.label = "FIRST ORDER";

    const single = applyEventResponse(state, "news_event", response);
    const multi = applyEventMultiResponses(state, "news_event", [response]);
    expect(single.newsFeed).toHaveLength(1);
    expect(multi.newsFeed).toEqual(single.newsFeed);

    const second = noopResponse("second");
    second.label = "SECOND ORDER";
    const withTwo = applyEventMultiResponses(state, "news_event", [response, second]);
    expect(withTwo.newsFeed).toHaveLength(1);
    expect(withTwo.newsFeed![0]!.headline).toContain("FIRST ORDER + SECOND ORDER");
  });

  it("is a news no-op for a stale multi-response card", () => {
    const state = createInitialState();
    const next = applyEventMultiResponses(state, "already_gone", [noopResponse("ok")]);
    expect(next).toBe(state);
    expect(next.newsFeed).toEqual(state.newsFeed);
  });
});

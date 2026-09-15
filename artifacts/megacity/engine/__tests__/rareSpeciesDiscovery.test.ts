import { afterEach, describe, expect, it, vi } from "vitest";

import { BIOSPHERE_RESPONSE_MAP, BIOSPHERE_EVENT_POOL } from "@/engine/events";
import { applyEventResponse } from "@/engine/eventResolution";
import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";
import { runTick } from "@/engine/formulas";
import type { GameEvent, GameState } from "@/engine/types";

const EVENT_ID = "biosphere_rare_discovery";
const responses = BIOSPHERE_RESPONSE_MAP[EVENT_ID];
const canonical = BIOSPHERE_EVENT_POOL.find((event) => event.id === EVENT_ID)!;

function stateWithDiscovery(): GameState {
  const state = createInitialState();
  const event: GameEvent = {
    ...canonical,
    timestamp: 0,
    resolved: false,
  };
  return {
    ...state,
    totalTicks: 37,
    activeEvents: [event],
    hasCompletedOnboarding: true,
  };
}

describe("rare species discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(responses)("resolves exactly once for %s", (response) => {
    const before = stateWithDiscovery();
    const next = applyEventResponse(before, EVENT_ID, response);

    expect(next.activeEvents.some((event) => event.id === EVENT_ID)).toBe(false);
    expect(next.eventTriggerCooldowns?.[EVENT_ID]).toBe(37);

    const effect = response.effects as Record<string, number | undefined>;
    if (effect.credits) {
      expect(next.resources.credits - before.resources.credits).toBe(effect.credits);
    }
    if (effect.happiness) {
      expect(next.cityStats.happiness - before.cityStats.happiness).toBe(effect.happiness);
    }

    // A stale duplicate card cannot apply the same response a second time.
    expect(applyEventResponse(next, EVENT_ID, response)).toBe(next);
  });

  it("keeps the one-time completion across migrated saves", () => {
    const resolved = applyEventResponse(
      stateWithDiscovery(),
      EVENT_ID,
      responses[0],
    );
    const reloaded = sanitizeState(migrateState(JSON.parse(JSON.stringify(resolved))));
    const readyToSpawn = {
      ...reloaded,
      activeEvents: [],
      eventHistory: [],
      totalTicks: 1_000,
      cityStats: { ...reloaded.cityStats, biosphere: 90 },
    };

    vi.spyOn(Math, "random").mockReturnValue(0);
    const next = runTick(readyToSpawn).newState;

    expect(next.activeEvents.some((event) => event.id === EVENT_ID)).toBe(false);
    expect(next.eventTriggerCooldowns?.[EVENT_ID]).toBe(37);
  });

  it("uses an existing legacy cooldown stamp as the completion marker", () => {
    const state = createInitialState();
    const legacy: GameState = {
      ...state,
      hasCompletedOnboarding: true,
      totalTicks: 1_000,
      activeEvents: [],
      eventHistory: [],
      eventTriggerCooldowns: { [EVENT_ID]: 12 },
      cityStats: { ...state.cityStats, biosphere: 90 },
    };

    vi.spyOn(Math, "random").mockReturnValue(0);
    const next = runTick(legacy).newState;

    expect(next.activeEvents.some((event) => event.id === EVENT_ID)).toBe(false);
  });

  it("allows a fresh game to receive the discovery once", () => {
    const state = createInitialState();
    const fresh: GameState = {
      ...state,
      hasCompletedOnboarding: true,
      totalTicks: 100,
      activeEvents: [],
      eventHistory: [],
      eventTriggerCooldowns: {},
      cityStats: { ...state.cityStats, biosphere: 90 },
    };

    vi.spyOn(Math, "random").mockReturnValue(0);
    const next = runTick(fresh).newState;

    expect(next.activeEvents.filter((event) => event.id === EVENT_ID)).toHaveLength(1);
  });
});
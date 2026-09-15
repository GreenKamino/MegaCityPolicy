import { describe, expect, it } from "vitest";

import {
  applyEventFlavor,
  buildEventContext,
} from "@/engine/eventFlavor";
import type { GameEvent, GameState } from "@/engine/types";

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    cityStats: { crime: 30, unrest: 20, happiness: 50 },
    resources: { credits: 10000 },
    factions: [],
    officers: [],
    namedCharacters: [],
    activeEvents: [],
    eventHistory: [],
    ...overrides,
  } as unknown as GameState;
}

describe("eventFlavor", () => {
  it("does not substitute NPC or faction prose at runtime", () => {
    const event: GameEvent = {
      id: "e1",
      title: "GANG WAR",
      description: "{gangLieutenant|the gang boss} is moving on the precinct. {tycoon|A magnate} watches.",
      severity: "high",
      effects: {},
      timestamp: 0,
      resolved: false,
    };
    expect(applyEventFlavor(event, baseState())).toBe(event);
    expect(buildEventContext(baseState())).toEqual({});
  });

  it("leaves response options authored and stable", () => {
    const event: GameEvent = {
      id: "e1",
      title: "BRIBE",
      description: "x",
      severity: "low",
      effects: {},
      timestamp: 0,
      resolved: false,
      responseOptions: [
        {
          id: "take",
          label: "ACCEPT FROM {tycoon|the magnate}",
          description: "Pocket the credits.",
          effects: {},
        },
      ],
    };
    expect(applyEventFlavor(event, baseState())).toBe(event);
  });
});

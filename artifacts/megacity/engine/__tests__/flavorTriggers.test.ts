import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONDITION_TRIGGERS,
  FLAVOR_TRIGGER_IDS,
  flavorRecencyScale,
  generateConditionEvent,
  isFlavorTrigger,
} from "@/engine/eventTriggers";
import { RECURRING_EVENT_DEFS } from "@/engine/recurringEvents";
import { createInitialState } from "@/engine/initialState";
import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #480: flavor triggers — one-off storyline events whose check() gates on
// opportunity/backdrop (readiness, ticks, HEALTHY stats) rather than a failure
// the player must fix. Two contracts:
//   1. Re-fires are spaced far apart: hard-blocked until 2x the base cooldown,
//      then weight ramps back linearly, full strength only at 4x age.
//   2. Re-fires never carry repeat:true — the "STILL UNRESOLVED" badge is
//      reserved for genuine stat-gated crises.
// ─────────────────────────────────────────────────────────────────────────────

describe("FLAVOR_TRIGGER_IDS integrity", () => {
  it("every flavor id names a real CONDITION_TRIGGERS entry", () => {
    const known = new Set(CONDITION_TRIGGERS.map((t) => t.id));
    for (const id of FLAVOR_TRIGGER_IDS) {
      expect(known.has(id), `FLAVOR_TRIGGER_IDS entry "${id}" is not a CONDITION_TRIGGERS id`).toBe(true);
    }
  });

  it("no flavor id is a recurring crisis with a dismissal hint", () => {
    // recurringEvents.ts is authoritative on "this warning will return" ids;
    // an id in both lists would claim to be simultaneously a one-off story
    // and a persistent-condition crisis.
    for (const id of FLAVOR_TRIGGER_IDS) {
      expect(
        RECURRING_EVENT_DEFS[id],
        `"${id}" is flagged flavor but has a RECURRING_EVENT_DEFS hint`,
      ).toBeUndefined();
    }
  });

  it("isFlavorTrigger honors both the set and the inline flag", () => {
    const caravan = CONDITION_TRIGGERS.find((t) => t.id === "trade_caravan_arrives")!;
    const crimeWave = CONDITION_TRIGGERS.find((t) => t.id === "crime_wave_surge")!;
    expect(isFlavorTrigger(caravan)).toBe(true);
    expect(isFlavorTrigger(crimeWave)).toBe(false);
    expect(isFlavorTrigger({ ...crimeWave, id: "hypothetical_new_story", flavor: true })).toBe(true);
  });
});

describe("flavorRecencyScale", () => {
  it("never-fired triggers keep full weight", () => {
    expect(flavorRecencyScale(1000, undefined, 20)).toBe(1);
  });

  it("hard-blocks until twice the base cooldown", () => {
    // cooldown 20 → blocked through age 39, zero exactly at age 40.
    expect(flavorRecencyScale(1000, 1000 - 20, 20)).toBe(0);
    expect(flavorRecencyScale(1000, 1000 - 39, 20)).toBe(0);
    expect(flavorRecencyScale(1000, 1000 - 40, 20)).toBe(0);
  });

  it("ramps linearly and reaches full weight at four cooldowns of age", () => {
    expect(flavorRecencyScale(1000, 1000 - 60, 20)).toBeCloseTo(0.5);
    expect(flavorRecencyScale(1000, 1000 - 80, 20)).toBe(1);
    expect(flavorRecencyScale(1000, 1000 - 500, 20)).toBe(1);
  });
});

// ── Picker integration: widened spacing + no repeat badge ────────────────────

// Fresh stamps for every trigger id except `keepId`, written at tick-1 so each
// is inside its own base cooldown (and, for flavor triggers, inside the 2x
// hard-block) and cannot compete for the pick.
function blockAllExcept(keepId: string, tick: number): Record<string, number> {
  const cooldowns: Record<string, number> = {};
  for (const trigger of CONDITION_TRIGGERS) {
    if (trigger.id !== keepId) cooldowns[trigger.id] = tick - 1;
  }
  return cooldowns;
}

const CARAVAN_ID = "trade_caravan_arrives";
const CARAVAN_CD = CONDITION_TRIGGERS.find((t) => t.id === CARAVAN_ID)!.cooldownTicks;

function caravanOnlyState(tick: number, caravanStamp?: number): GameState {
  const base = createInitialState();
  return {
    ...base,
    hasCompletedOnboarding: true,
    totalTicks: tick,
    activeEvents: [],
    eventHistory: [],
    eventTriggerCooldowns: {
      ...blockAllExcept(CARAVAN_ID, tick),
      ...(caravanStamp !== undefined ? { [CARAVAN_ID]: caravanStamp } : {}),
    },
  };
}

describe("retired flavor triggers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not schedule the retired caravan story", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(generateConditionEvent(caravanOnlyState(1000))).toBeNull();
    expect(generateConditionEvent(caravanOnlyState(1000 + 3 * CARAVAN_CD, 1000))).toBeNull();
  });
});

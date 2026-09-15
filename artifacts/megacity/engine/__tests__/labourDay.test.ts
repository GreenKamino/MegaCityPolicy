import { describe, expect, it } from "vitest";

import {
  generateAnnualLabourDayEvent,
  LABOUR_DAY_RESPONSES,
} from "@/engine/events";
import { applyEventResponse } from "@/engine/eventResolution";
import {
  getLabourDayDateMatch,
  getActiveLabourDayBooster,
} from "@/engine/labourDay";
import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";

describe("Labour Day observances", () => {
  it("recognizes May 1 but not adjacent dates", () => {
    expect(getLabourDayDateMatch({ year: 2030, month: 5, day: 1, hour: 0 })?.observance).toBe("international");
    expect(getLabourDayDateMatch({ year: 2030, month: 4, day: 30, hour: 0 })).toBeNull();
    expect(getLabourDayDateMatch({ year: 2030, month: 5, day: 2, hour: 0 })).toBeNull();
  });

  it("recognizes the first Monday in September, including when it is September 1", () => {
    expect(getLabourDayDateMatch({ year: 2030, month: 9, day: 2, hour: 0 })?.observance).toBe("us");
    expect(getLabourDayDateMatch({ year: 2024, month: 9, day: 2, hour: 0 })?.observance).toBe("us");
    expect(getLabourDayDateMatch({ year: 2030, month: 9, day: 1, hour: 0 })).toBeNull();
    expect(getLabourDayDateMatch({ year: 2030, month: 9, day: 9, hour: 0 })).toBeNull();
  });

  it("fires each observance once per year and permits the next year's observance", () => {
    const state = createInitialState();
    state.gameDate = { year: 2030, month: 5, day: 1, hour: 0 };
    const first = generateAnnualLabourDayEvent(state);
    expect(first?.event.id).toBe("labour_day_international_2030");

    const marked = {
      ...state,
      activeEvents: [{ ...first!.event, resolved: false }],
      eventTriggerCooldowns: first!.cooldowns!,
    };
    expect(generateAnnualLabourDayEvent(marked)).toBeNull();

    const nextYear = {
      ...state,
      gameDate: { year: 2031, month: 5, day: 1, hour: 0 },
      eventTriggerCooldowns: first!.cooldowns!,
    };
    expect(generateAnnualLabourDayEvent(nextYear)?.event.id).toBe("labour_day_international_2031");
  });

  it("grants the holiday reward and persists the selected booster through expiry", () => {
    const state = createInitialState();
    state.gameDate = { year: 2030, month: 5, day: 1, hour: 0 };
    const generated = generateAnnualLabourDayEvent(state)!;
    const spawned = {
      ...state,
      activeEvents: [generated.event],
      eventTriggerCooldowns: generated.cooldowns!,
    };
    const beforeCredits = spawned.resources.credits;
    const resolved = applyEventResponse(
      spawned,
      generated.event.id,
      LABOUR_DAY_RESPONSES[0],
    );

    expect(resolved.resources.credits).toBe(beforeCredits + 7500);
    expect(getActiveLabourDayBooster(resolved)?.edictId).toBe("labour_day_paid_leave");
    expect(getActiveLabourDayBooster(resolved)?.ticksRemaining).toBe(8);
    expect(resolved.activeEvents).toHaveLength(0);

    const savedReload = JSON.parse(JSON.stringify(resolved));
    expect(getActiveLabourDayBooster(savedReload)?.ticksRemaining).toBe(8);

    const ticked = runTick(savedReload).newState;
    expect(ticked.resources.credits).toBeGreaterThan(savedReload.resources.credits);
    expect(getActiveLabourDayBooster(ticked)?.ticksRemaining).toBe(7);

    let expired = ticked;
    for (let i = 0; i < 7; i++) expired = runTick(expired).newState;
    expect(getActiveLabourDayBooster(expired)).toBeUndefined();
  });
});
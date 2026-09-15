import { describe, expect, it } from "vitest";

import {
  getDefaultAdvancedState,
  isWarActiveDay,
  processWarEscalation,
  startWar,
  WAR_TICKS_PER_DAY,
  WAR_QUIET_DAY_INTERVAL,
} from "@/engine/diplomacyAdvanced";
import { createInitialState } from "@/engine/initialState";
import type { TickEntry } from "@/engine/types";

describe("war pacing", () => {
  it("only advances an active war once per in-game day", () => {
    const state = createInitialState();
    state.totalTicks = 40;
    const war = startWar(state, "ferrograd", "Ferrograd");
    war.stage = "open_war";
    war.intensity = 70;
    state.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [war] };

    const entries: TickEntry[] = [];
    processWarEscalation(state, entries);
    const afterSixHours = { ...war, intensity: war.intensity, warWeariness: war.warWeariness };

    state.totalTicks += 1;
    processWarEscalation(state, entries);

    expect(war.intensity).toBe(afterSixHours.intensity);
    expect(war.warWeariness).toBe(afterSixHours.warWeariness);

    state.totalTicks += WAR_TICKS_PER_DAY - 1;
    processWarEscalation(state, entries);
    expect(war.intensity).toBeGreaterThan(afterSixHours.intensity);
    expect(war.warWeariness).toBeGreaterThan(afterSixHours.warWeariness);
  });

  it("keeps one predictable quiet day in each war week", () => {
    const state = createInitialState();
    const war = startWar(state, "ferrograd", "Ferrograd");
    const quietDayTick = war.startTick + (WAR_QUIET_DAY_INTERVAL - 1) * WAR_TICKS_PER_DAY;

    expect(isWarActiveDay({ totalTicks: war.startTick }, war)).toBe(true);
    expect(isWarActiveDay({ totalTicks: quietDayTick }, war)).toBe(false);
    expect(isWarActiveDay({ totalTicks: quietDayTick + WAR_TICKS_PER_DAY }, war)).toBe(true);
  });

  it("does not exhaust a total war on the old six-hour timeline", () => {
    const state = createInitialState();
    state.totalTicks = 0;
    const war = startWar(state, "ferrograd", "Ferrograd");
    war.stage = "total_war";
    war.intensity = 100;
    state.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [war] };

    for (let tick = 0; tick < 80; tick += 1) {
      state.totalTicks = tick;
      processWarEscalation(state, []);
    }

    expect(state.diplomacyAdvanced.wars).toHaveLength(1);
    expect(state.diplomacyAdvanced.wars[0].warWeariness).toBeLessThan(100);
  });
});
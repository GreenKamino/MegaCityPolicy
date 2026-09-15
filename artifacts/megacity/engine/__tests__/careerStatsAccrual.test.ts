// Regression test for the five lifetime CareerStats fields that used to be
// declared and capped but never incremented, so they read 0 forever in the
// career/profile UI:
//   totalPlayTime, totalCreditsEarned, totalOfficersAppointed,
//   totalFactionWars, totalBuildingsConstructed
//
// `syncProfileFromGameState` now folds each of these from the live GameState
// using the same monotonic Math.max pattern as the other career tallies.
// These tests pin that each field advances after a sync.

import { describe, expect, it } from "vitest";

import { getDefaultAdvancedState } from "@/engine/diplomacyAdvanced";
import { createInitialState } from "@/engine/initialState";
import { createDefaultProfile, syncProfileFromGameState } from "@/engine/profiles";
import type { GameState } from "@/engine/types";

function loadedState(): GameState {
  const s = createInitialState();
  s.playTime = 0;
  s.resources.credits = 0;
  s.officers = [];
  s.buildings = {};
  s.diplomacyAdvanced = getDefaultAdvancedState();
  return s;
}

describe("career-stats accrual (lifetime tallies that used to read 0)", () => {
  it("advances all five previously-dead fields from live GameState", () => {
    const profile = createDefaultProfile("Marshal", 40, "other");
    // Start from a clean slate so we can assert movement from 0.
    profile.careerStats.totalPlayTime = 0;
    profile.careerStats.totalCreditsEarned = 0;
    profile.careerStats.totalOfficersAppointed = 0;
    profile.careerStats.totalFactionWars = 0;
    profile.careerStats.totalBuildingsConstructed = 0;

    const state = loadedState();
    state.playTime = 7200;
    state.resources.credits = 123456.7;
    state.officers = [
      { appointed: true } as any,
      { appointed: false } as any,
      { appointed: true } as any,
    ];
    state.buildings = { habitat: 4, factory: 2, clinic: 1 };
    if (state.diplomacyAdvanced) state.diplomacyAdvanced.totalWars = 3;

    const synced = syncProfileFromGameState(profile, state);
    const cs = synced.careerStats;

    expect(cs.totalPlayTime).toBe(7200);
    expect(cs.totalCreditsEarned).toBe(123456); // floored
    expect(cs.totalOfficersAppointed).toBe(2);
    expect(cs.totalFactionWars).toBe(3);
    expect(cs.totalBuildingsConstructed).toBe(7); // 4 + 2 + 1
  });

  it("keeps the tallies monotonic — a smaller live snapshot never lowers them", () => {
    const profile = createDefaultProfile("Marshal", 40, "other");
    profile.careerStats.totalPlayTime = 10000;
    profile.careerStats.totalCreditsEarned = 999999;
    profile.careerStats.totalOfficersAppointed = 9;
    profile.careerStats.totalFactionWars = 12;
    profile.careerStats.totalBuildingsConstructed = 100;

    // A brand-new city: small/zero live values must not regress the lifetime tally.
    const state = loadedState();
    state.playTime = 5;
    state.resources.credits = 50;
    state.officers = [{ appointed: true } as any];
    state.buildings = { habitat: 1 };
    if (state.diplomacyAdvanced) state.diplomacyAdvanced.totalWars = 0;

    const synced = syncProfileFromGameState(profile, state);
    const cs = synced.careerStats;

    expect(cs.totalPlayTime).toBe(10000);
    expect(cs.totalCreditsEarned).toBe(999999);
    expect(cs.totalOfficersAppointed).toBe(9);
    expect(cs.totalFactionWars).toBe(12);
    expect(cs.totalBuildingsConstructed).toBe(100);
  });
});

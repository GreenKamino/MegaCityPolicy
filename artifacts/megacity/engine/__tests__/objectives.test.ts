import { describe, it, expect } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import type { GameState } from "@/engine/types";
import {
  STARTER_OBJECTIVES,
  STARTER_OBJECTIVE_TICK_WINDOW,
  currentStarterObjectiveIndex,
  getCurrentStarterObjective,
  shouldShowStarterObjectives,
} from "@/engine/objectives";

// A genuinely-new player who has just finished/skipped orientation: opt-in on,
// onboarding complete, inside the window, nothing dismissed.
function newPlayerState(): GameState {
  const s = createInitialState();
  s.hasCompletedOnboarding = true;
  s.totalTicks = 1;
  return s;
}

describe("starter objectives — fresh-game contract (drift guards)", () => {
  it("createInitialState opts a fresh game in and leaves it undismissed", () => {
    const s = createInitialState();
    expect(s.starterObjectivesActive).toBe(true);
    expect(s.starterObjectivesDismissed).toBe(false);
  });

  it("the opening objective is NOT pre-satisfied at the fresh-game baseline", () => {
    const s = createInitialState();
    expect(STARTER_OBJECTIVES[0].isComplete(s)).toBe(false);
    // and the very first thing a new player sees is therefore objective 1.
    expect(getCurrentStarterObjective(s)?.id).toBe(STARTER_OBJECTIVES[0].id);
  });

  it("exposes a stable ordered, non-empty objective list", () => {
    expect(STARTER_OBJECTIVES.length).toBeGreaterThan(0);
    const ids = STARTER_OBJECTIVES.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length); // unique ids
    expect(ids).toEqual(["stabilize_morale", "expand_the_count", "build_a_reserve"]);
  });
});

describe("getCurrentStarterObjective — ordering + skip + null", () => {
  it("returns the first incomplete objective", () => {
    const s = newPlayerState();
    expect(getCurrentStarterObjective(s)?.id).toBe("stabilize_morale");
    expect(currentStarterObjectiveIndex(s)).toBe(1);
  });

  it("advances past a satisfied objective", () => {
    const s = newPlayerState();
    s.cityStats.happiness = 60; // morale met
    expect(getCurrentStarterObjective(s)?.id).toBe("expand_the_count");
    expect(currentStarterObjectiveIndex(s)).toBe(2);
  });

  it("skips to the reserve objective once morale + growth are met", () => {
    const s = newPlayerState();
    s.cityStats.happiness = 60;
    s.cityStats.population = 1_000_000;
    expect(getCurrentStarterObjective(s)?.id).toBe("build_a_reserve");
    expect(currentStarterObjectiveIndex(s)).toBe(3);
  });

  it("returns null and index 0 when every objective is met", () => {
    const s = newPlayerState();
    s.cityStats.happiness = 60;
    s.cityStats.population = 1_000_000;
    s.resources.credits = 600_000;
    expect(getCurrentStarterObjective(s)).toBeNull();
    expect(currentStarterObjectiveIndex(s)).toBe(0);
  });
});

describe("per-objective boundary checks", () => {
  it("stabilize_morale completes at exactly 55 happiness", () => {
    const morale = STARTER_OBJECTIVES.find((o) => o.id === "stabilize_morale")!;
    const s = newPlayerState();
    s.cityStats.happiness = 54.9;
    expect(morale.isComplete(s)).toBe(false);
    s.cityStats.happiness = 55;
    expect(morale.isComplete(s)).toBe(true);
  });

  it("expand_the_count completes at exactly 1,000,000 population", () => {
    const grow = STARTER_OBJECTIVES.find((o) => o.id === "expand_the_count")!;
    const s = newPlayerState();
    s.cityStats.population = 999_999;
    expect(grow.isComplete(s)).toBe(false);
    s.cityStats.population = 1_000_000;
    expect(grow.isComplete(s)).toBe(true);
  });

  it("build_a_reserve completes at exactly 600,000 credits", () => {
    const reserve = STARTER_OBJECTIVES.find((o) => o.id === "build_a_reserve")!;
    const s = newPlayerState();
    s.resources.credits = 599_999;
    expect(reserve.isComplete(s)).toBe(false);
    s.resources.credits = 600_000;
    expect(reserve.isComplete(s)).toBe(true);
  });

  it("progress ratio is clamped to 0..1", () => {
    const morale = STARTER_OBJECTIVES.find((o) => o.id === "stabilize_morale")!;
    const s = newPlayerState();
    s.cityStats.happiness = 200;
    expect(morale.progress(s).ratio).toBe(1);
    s.cityStats.happiness = -50;
    expect(morale.progress(s).ratio).toBe(0);
  });
});

describe("shouldShowStarterObjectives — gating matrix", () => {
  it("shows for a genuinely-new player post-orientation", () => {
    expect(shouldShowStarterObjectives(newPlayerState())).toBe(true);
  });

  it("hides while the player is still in orientation", () => {
    const s = newPlayerState();
    s.hasCompletedOnboarding = false;
    expect(shouldShowStarterObjectives(s)).toBe(false);
  });

  it("hides for legacy saves (opt-in flag absent)", () => {
    const s = newPlayerState();
    s.starterObjectivesActive = undefined;
    expect(shouldShowStarterObjectives(s)).toBe(false);
  });

  it("hides for veteran starts (opt-in flag explicit false)", () => {
    const s = newPlayerState();
    s.starterObjectivesActive = false;
    expect(shouldShowStarterObjectives(s)).toBe(false);
  });

  it("hides once dismissed", () => {
    const s = newPlayerState();
    s.starterObjectivesDismissed = true;
    expect(shouldShowStarterObjectives(s)).toBe(false);
  });

  it("hides once the early-game window has elapsed", () => {
    const s = newPlayerState();
    s.totalTicks = STARTER_OBJECTIVE_TICK_WINDOW;
    expect(shouldShowStarterObjectives(s)).toBe(true); // boundary inclusive
    s.totalTicks = STARTER_OBJECTIVE_TICK_WINDOW + 1;
    expect(shouldShowStarterObjectives(s)).toBe(false);
  });

  it("hides when all objectives are complete", () => {
    const s = newPlayerState();
    s.cityStats.happiness = 60;
    s.cityStats.population = 1_000_000;
    s.resources.credits = 600_000;
    expect(shouldShowStarterObjectives(s)).toBe(false);
  });
});

describe("migrateState — opt-in must be strict and never light up for legacy", () => {
  it("preserves an explicit true (fresh/guided save round-trips)", () => {
    const saved = JSON.parse(JSON.stringify(createInitialState())) as GameState;
    expect(saved.starterObjectivesActive).toBe(true);
    expect(migrateState(saved).starterObjectivesActive).toBe(true);
  });

  it("resolves legacy saves (field absent) to off", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialState())) as Partial<GameState>;
    delete legacy.starterObjectivesActive;
    expect(migrateState(legacy as GameState).starterObjectivesActive).toBe(false);
  });

  it("resolves veteran starts (explicit false) to off", () => {
    const veteran = JSON.parse(JSON.stringify(createInitialState())) as GameState;
    veteran.starterObjectivesActive = false;
    expect(migrateState(veteran).starterObjectivesActive).toBe(false);
  });

  it("round-trips a permanent dismissal", () => {
    const dismissed = JSON.parse(JSON.stringify(createInitialState())) as GameState;
    dismissed.starterObjectivesDismissed = true;
    expect(migrateState(dismissed).starterObjectivesDismissed).toBe(true);
  });

  it("defaults dismissal to false when absent", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialState())) as Partial<GameState>;
    delete legacy.starterObjectivesDismissed;
    expect(migrateState(legacy as GameState).starterObjectivesDismissed).toBe(false);
  });
});

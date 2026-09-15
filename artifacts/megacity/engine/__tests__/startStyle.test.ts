import { describe, it, expect } from "vitest";

import { CALM_START_TICKS } from "@/engine/calmStart";
import { createInitialState } from "@/engine/initialState";
import { applyStartStyle } from "@/engine/startStyle";

// These four fields are the entire contract between the char-create start-style
// choice and the new-player onboarding systems:
//   hasCompletedOnboarding  → full HUD vs progressive disclosure
//   starterObjectivesActive → the Overview objective marker
//   hudCoachTipsActive      → the per-tab coach tips
//   calmStartTicks          → the calm Day 1 grace window
// If any future refactor of the char-create flow drops one for a Veteran start,
// the player silently gets that piece of hand-holding back — exactly the
// regression this suite guards. The tests run the REAL createInitialState +
// REAL applyStartStyle (the same function confirmCharCreate calls); nothing is
// mocked.

describe("start style — Veteran suppresses every new-player aid", () => {
  it("flips all four onboarding fields for a Veteran start", () => {
    const s = applyStartStyle(createInitialState(), "veteran");
    expect(s.hasCompletedOnboarding).toBe(true);
    expect(s.starterObjectivesActive).toBe(false);
    expect(s.hudCoachTipsActive).toBe(false);
    expect(s.calmStartTicks).toBe(0);
  });

  it("leaves the fresh-game defaults intact for a Guided start", () => {
    const fresh = createInitialState();
    const s = applyStartStyle(createInitialState(), "guided");
    // Guided is the full first-run experience — identical to a fresh game.
    expect(s.hasCompletedOnboarding).toBe(false);
    expect(s.starterObjectivesActive).toBe(true);
    expect(s.hudCoachTipsActive).toBe(true);
    expect(s.calmStartTicks).toBe(CALM_START_TICKS);
    // And it must not have drifted from what createInitialState produces.
    expect(s.hasCompletedOnboarding).toBe(fresh.hasCompletedOnboarding);
    expect(s.starterObjectivesActive).toBe(fresh.starterObjectivesActive);
    expect(s.hudCoachTipsActive).toBe(fresh.hudCoachTipsActive);
    expect(s.calmStartTicks).toBe(fresh.calmStartTicks);
  });
});

describe("start style — fresh-game defaults are the Guided experience", () => {
  it("pins createInitialState's onboarding defaults", () => {
    // Pin the defaults so a change to them is a conscious, reviewed edit rather
    // than an accidental onboarding regression that flips Guided's behavior.
    const fresh = createInitialState();
    expect(fresh.hasCompletedOnboarding).toBe(false);
    expect(fresh.starterObjectivesActive).toBe(true);
    expect(fresh.hudCoachTipsActive).toBe(true);
    expect(fresh.calmStartTicks).toBe(CALM_START_TICKS);
  });
});

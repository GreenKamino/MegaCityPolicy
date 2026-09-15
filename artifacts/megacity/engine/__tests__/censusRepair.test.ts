// Census repair — one-time load repair for saves corrupted by the
// ratcheting-edict population bug (base growth rate climbed every tick a
// growth edict was active, so one overnight offline catch-up compounded
// 5M citizens into the 100B MAX_POPULATION ceiling and drained every
// consumable). The repair runs FIRST inside runOfflineCatchup so every
// load path (slot load, app init, background→foreground resume — and the
// paused / turn-based early-return branches) passes through it exactly
// once. It only fires on populations that are both ≥10M AND >100× what
// the city's housing could ever shelter, so merely overcrowded cities are
// never touched.

import { describe, expect, it } from "vitest";
import { repairAbsurdPopulation, runOfflineCatchup } from "../offlineCatchup";
import { computeHousingCapacity } from "../formulas";
import { createInitialState } from "../initialState";
import type { GameState } from "../types";

function corruptedState(): GameState {
  const s = createInitialState();
  s.cityStats.population = 100_000_000_000; // the observed ceiling value
  // New games start paused for first-run orientation; the corrupted saves
  // this repairs were live games, so default to un-paused. The paused
  // branch is exercised explicitly below.
  s.tickPaused = false;
  return s;
}

describe("repairAbsurdPopulation", () => {
  it("repairs a ceiling-level population down to 2x housing capacity", () => {
    const s = corruptedState();
    const cap = computeHousingCapacity(s.buildings);
    const repaired = repairAbsurdPopulation(s);
    expect(repaired.cityStats.population).toBe(Math.max(1000, Math.round(cap * 2)));
    expect(repaired.cityStats.population).toBeLessThan(10_000_000);
  });

  it("tells the player via a one-time CENSUS CORRECTION inbox message", () => {
    const s = corruptedState();
    const repaired = repairAbsurdPopulation(s);
    const msg = repaired.messages[0];
    expect(msg.title).toBe("CENSUS CORRECTION");
    expect(msg.id).toBe(`census_correction_${s.totalTicks}`);
    expect(msg.category).toBe("report");
    expect(msg.priority).toBe("high");
    expect(msg.read).toBe(false);
  });

  it("is idempotent — a second pass over a repaired save changes nothing", () => {
    const once = repairAbsurdPopulation(corruptedState());
    const twice = repairAbsurdPopulation(once);
    expect(twice).toBe(once);
  });

  it("never touches a plausible population", () => {
    const s = createInitialState();
    s.cityStats.population = 5_000_000; // big, but below the 10M floor
    expect(repairAbsurdPopulation(s)).toBe(s);
  });

  it("never touches a large population backed by real housing", () => {
    const s = createInitialState();
    // 12M citizens with enough residential construction that the
    // population is under 100x capacity — a legitimate megacity, not
    // corruption.
    s.buildings = { ...s.buildings, habBlockMegaTowers: 20 };
    const cap = computeHousingCapacity(s.buildings);
    s.cityStats.population = Math.min(12_000_000, cap * 99);
    expect(repairAbsurdPopulation(s)).toBe(s);
  });
});

describe("runOfflineCatchup census integration", () => {
  it("repairs a corrupted save on the normal load path", () => {
    const s = corruptedState();
    s.lastTickTime = Date.now(); // no missed ticks — repair must still run
    const { newState } = runOfflineCatchup(s, "standard");
    expect(newState.cityStats.population).toBeLessThan(10_000_000);
    expect(newState.messages.some((m) => m.title === "CENSUS CORRECTION")).toBe(true);
  });

  it("repairs a corrupted save even when the game is paused", () => {
    const s = corruptedState();
    s.tickPaused = true;
    const { newState, report } = runOfflineCatchup(s, "standard");
    expect(report).toBeNull(); // paused games accrue no offline progress
    expect(newState.cityStats.population).toBeLessThan(10_000_000);
    expect(newState.messages.some((m) => m.title === "CENSUS CORRECTION")).toBe(true);
  });

  it("repairs a corrupted turn-based save", () => {
    const s = corruptedState();
    s.gameplayMode = "turnbased";
    const { newState, report } = runOfflineCatchup(s, "standard");
    expect(report).toBeNull();
    expect(newState.cityStats.population).toBeLessThan(10_000_000);
    expect(newState.messages.some((m) => m.title === "CENSUS CORRECTION")).toBe(true);
  });
});

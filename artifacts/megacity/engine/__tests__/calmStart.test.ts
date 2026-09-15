import { describe, it, expect } from "vitest";

import { CALM_START_TICKS, negativeEventsAllowed } from "@/engine/calmStart";
import { createInitialState } from "@/engine/initialState";
import { runNewSystemTicks } from "@/engine/tickProcessors";

describe("calm start — gate", () => {
  it("Day 2 begins at 4 ticks (1 in-game day)", () => {
    expect(CALM_START_TICKS).toBe(4);
  });

  it("suppresses negative events through Day 1 (ticks 0-3), allows them from Day 2", () => {
    for (const t of [0, 1, 2, 3]) {
      expect(negativeEventsAllowed({ totalTicks: t })).toBe(false);
    }
    for (const t of [4, 5, 12, 100]) {
      expect(negativeEventsAllowed({ totalTicks: t })).toBe(true);
    }
  });

  it("uses the default window when calmStartTicks is absent (guided / legacy saves)", () => {
    expect(negativeEventsAllowed({ totalTicks: 2 })).toBe(false);
    expect(negativeEventsAllowed({ totalTicks: 2, calmStartTicks: undefined })).toBe(false);
    expect(negativeEventsAllowed({ totalTicks: 4, calmStartTicks: undefined })).toBe(true);
  });

  it("honors a per-save calmStartTicks override (Veteran start skips the window)", () => {
    // Veteran start persists calmStartTicks: 0 — crises resume from tick 0.
    for (const t of [0, 1, 2, 3]) {
      expect(negativeEventsAllowed({ totalTicks: t, calmStartTicks: 0 })).toBe(true);
    }
    // A custom shorter window is also respected.
    expect(negativeEventsAllowed({ totalTicks: 1, calmStartTicks: 2 })).toBe(false);
    expect(negativeEventsAllowed({ totalTicks: 2, calmStartTicks: 2 })).toBe(true);
  });
});

describe("calm start — biosphere crisis gating", () => {
  // Critical disease risk would normally trigger an outbreak event the moment
  // it is processed. During Day 1 that crisis must stay suppressed; from Day 2
  // it must fire exactly as before.
  function craft(totalTicks: number) {
    const s = createInitialState();
    s.totalTicks = totalTicks;
    s.cityStats.diseaseRisk = 90;
    s.activeEvents = [];
    s.eventHistory = [];
    return s;
  }

  it("does NOT fire a disease outbreak during Day 1", () => {
    const s = craft(2);
    runNewSystemTicks(s, []);
    expect(s.activeEvents.some((e) => e.id === "biosphere_disease_outbreak")).toBe(false);
  });

  it("DOES fire the same disease outbreak from Day 2 onward", () => {
    const s = craft(4);
    runNewSystemTicks(s, []);
    expect(s.activeEvents.some((e) => e.id === "biosphere_disease_outbreak")).toBe(true);
  });
});

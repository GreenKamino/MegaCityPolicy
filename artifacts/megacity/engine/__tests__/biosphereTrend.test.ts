import { describe, expect, it } from "vitest";

import { getBiosphereTrend, HEALTHY_BIOSPHERE_THRESHOLD } from "@/engine/biosphereTrend";
import { NATURAL_BIOSPHERE_FLOOR } from "@/engine/tickProcessors";
import { createInitialState } from "@/engine/initialState";
import type { GameState, TickEntry } from "@/engine/types";

function setup(over: {
  biosphere: number;
  tickLog?: TickEntry[];
  activeEvents?: GameState["activeEvents"];
}): GameState {
  const s = createInitialState();
  s.cityStats.biosphere = over.biosphere;
  s.tickLog = over.tickLog ?? [];
  s.activeEvents = over.activeEvents ?? [];
  return s;
}

const bioEntry = (delta: number, reason: string): TickEntry => ({
  label: "Biosphere",
  delta,
  unit: "pts",
  reason,
  severity: delta >= 0 ? "positive" : "negative",
});

describe("getBiosphereTrend", () => {
  it("returns null when the biosphere is healthy", () => {
    expect(getBiosphereTrend(setup({ biosphere: HEALTHY_BIOSPHERE_THRESHOLD }))).toBeNull();
    expect(getBiosphereTrend(setup({ biosphere: 80 }))).toBeNull();
  });

  it("reports natural rewilding as recovering when at/below the floor with no outbreaks", () => {
    const trend = getBiosphereTrend(setup({ biosphere: 2 }));
    expect(trend?.direction).toBe("recovering");
    expect(trend?.floor).toBe(NATURAL_BIOSPHERE_FLOOR);
    // Reassurance must name the green-infrastructure caveat.
    expect(trend?.detail.toLowerCase()).toContain("green infrastructure");
    expect(trend?.detail).toContain(String(NATURAL_BIOSPHERE_FLOOR));
  });

  it("treats sitting exactly at the floor as recovering/holding, not degrading", () => {
    const trend = getBiosphereTrend(
      setup({
        biosphere: NATURAL_BIOSPHERE_FLOOR,
        // Even if the last tick's neglect entry attempted a negative delta, the
        // value is floored — it must not read as degrading.
        tickLog: [bioEntry(-1, "Pollution and neglect degrading biosphere")],
      }),
    );
    expect(trend?.direction).toBe("recovering");
  });

  it("does not flicker to degrading on a rest tick below the floor", () => {
    // Natural rewilding only fires every 4th tick; on the other ticks only the
    // neglect entry is present. The state condition must keep it recovering.
    const trend = getBiosphereTrend(
      setup({
        biosphere: 5,
        tickLog: [bioEntry(0, "Pollution and neglect degrading biosphere")],
      }),
    );
    expect(trend?.direction).toBe("recovering");
  });

  it("reports active outbreaks as degrading", () => {
    const trend = getBiosphereTrend(
      setup({
        biosphere: 8,
        activeEvents: [{ id: "biosphere_disease_outbreak" } as any],
      }),
    );
    expect(trend?.direction).toBe("degrading");
    expect(trend?.detail.toLowerCase()).toContain("green infrastructure");
  });

  it("uses tick deltas in the mid band: positive delta is recovering", () => {
    // The Biosphere tick entry now carries the continuous recovery rate, so even
    // a small fractional positive delta reads as recovering every tick.
    const trend = getBiosphereTrend(
      setup({
        biosphere: 22,
        tickLog: [bioEntry(0.3, "Ecological reserves and conservation efforts sustaining biosphere")],
      }),
    );
    expect(trend?.direction).toBe("recovering");
    expect(trend?.headline.toLowerCase()).toContain("climbing");
  });

  it("uses tick deltas in the mid band: negative delta is degrading", () => {
    const trend = getBiosphereTrend(
      setup({
        biosphere: 30,
        tickLog: [bioEntry(-2, "Pollution and neglect degrading biosphere")],
      }),
    );
    expect(trend?.direction).toBe("degrading");
  });

  it("returns null in the mid band when there is no net movement", () => {
    const trend = getBiosphereTrend(
      setup({
        biosphere: 30,
        tickLog: [bioEntry(0, "Ecological reserves and conservation efforts sustaining biosphere")],
      }),
    );
    expect(trend).toBeNull();
  });
});

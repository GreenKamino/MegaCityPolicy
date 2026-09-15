import { describe, expect, it } from "vitest";
import { serializeSaveExport, parseSaveImport } from "@/engine/saveExport";
import type { GameState } from "@/engine/types";

function fakeState(depth?: "lite" | "standard" | "deep"): GameState {
  return {
    saveSlot: 1,
    offlineSimDepth: depth,
    playTime: 0,
    totalTicks: 0,
    lastTickTime: 0,
    missedTicks: 0,
    gameStarted: true,
    playerTitle: "Marshal",
    cityName: "MEGACITY",
    gameDate: { day: 1, month: 1, year: 2099 } as any,
    messages: [],
    player: { name: "Cmdr", level: 1 } as any,
    resources: {} as any,
    cityStats: {} as any,
    rates: {} as any,
    buildings: {} as any,
    units: {} as any,
  } as unknown as GameState;
}

describe("offlineSimDepth survives slot envelope round-trip (cloud save mirror)", () => {
  it("each preset round-trips through serializeSaveExport / parseSaveImport", () => {
    for (const depth of ["lite", "standard", "deep"] as const) {
      const json = serializeSaveExport(fakeState(depth), 1);
      const parsed = parseSaveImport(json);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.envelope.state.offlineSimDepth).toBe(depth);
      }
    }
  });

  it("legacy envelope without offlineSimDepth still parses (backwards compatibility)", () => {
    const json = serializeSaveExport(fakeState(undefined), 1);
    const parsed = parseSaveImport(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.state.offlineSimDepth).toBeUndefined();
    }
  });
});

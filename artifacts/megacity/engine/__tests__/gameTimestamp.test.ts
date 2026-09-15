import { describe, expect, it } from "vitest";
import { gameTimestamp } from "../gameTimestamp";
import type { GameState } from "../types";

describe("gameTimestamp helper", () => {
  it("returns a fresh clone of state.gameDate when present", () => {
    const gd = { year: 2199, month: 7, day: 15, hour: 9 };
    const state = { gameDate: gd } as unknown as GameState;
    const out = gameTimestamp(state);
    expect(out).toEqual(gd);
    expect(out).not.toBe(gd);
  });

  it("returns the documented 2050 fallback when state has no gameDate", () => {
    const out = gameTimestamp({} as GameState);
    expect(out).toEqual({ year: 2050, month: 1, day: 1, hour: 0 });
  });

  it("returns the fallback when state itself is null/undefined", () => {
    expect(gameTimestamp(null)).toEqual({ year: 2050, month: 1, day: 1, hour: 0 });
    expect(gameTimestamp(undefined)).toEqual({ year: 2050, month: 1, day: 1, hour: 0 });
  });

  it("returns a fresh fallback object each call (no shared reference)", () => {
    const a = gameTimestamp(null);
    const b = gameTimestamp(null);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

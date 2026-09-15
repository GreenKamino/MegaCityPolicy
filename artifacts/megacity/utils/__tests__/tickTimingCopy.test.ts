import { describe, expect, it } from "vitest";

import {
  REALTIME_CLOCK_EXPLANATION,
  REALTIME_TICK_INTERVALS,
} from "../tickTimingCopy";

describe("real-time clock explanation", () => {
  it("covers every selectable interval with its practical game-day cadence", () => {
    expect(REALTIME_TICK_INTERVALS).toEqual([1, 5, 10, 15, 60]);
    expect(REALTIME_CLOCK_EXPLANATION).toContain("1M = 1 game day every 4 real minutes");
    expect(REALTIME_CLOCK_EXPLANATION).toContain("5M = 1 game day every 20 real minutes");
    expect(REALTIME_CLOCK_EXPLANATION).toContain("10M = 1 game day every 40 real minutes");
    expect(REALTIME_CLOCK_EXPLANATION).toContain("15M = 1 game day every 60 real minutes");
    expect(REALTIME_CLOCK_EXPLANATION).toContain("1H = 1 game day every 4 real hours");
  });

  it("states the invariant timing and automatic-advance rules", () => {
    expect(REALTIME_CLOCK_EXPLANATION).toContain("Every tick always advances 6 in-game hours");
    expect(REALTIME_CLOCK_EXPLANATION).toContain("4 ticks = 1 in-game day");
    expect(REALTIME_CLOCK_EXPLANATION).toContain("Paused and turn-based cities do not auto-advance");
    expect(REALTIME_CLOCK_EXPLANATION).toContain("offline catch-up uses your selected interval");
  });
});
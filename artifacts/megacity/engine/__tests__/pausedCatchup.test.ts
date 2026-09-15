import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runOfflineCatchup } from "@/engine/offlineCatchup";

// A paused game must accrue NO offline progress. The real-time tick loop is
// gated by tickPaused, but offline catch-up computes missed time from
// wall-clock (Date.now() - lastTickTime). While paused, lastTickTime stops
// advancing and goes stale, so without an explicit gate every catch-up entry
// point (slot load, app init, background→foreground resume) would award a
// burst of resources/messages for the span the player chose to pause through.
describe("paused games accrue no offline progress", () => {
  // A whole day of stale anchor — a non-paused catch-up would award a huge burst.
  const STALE_MS = 24 * 60 * 60 * 1000;

  it("skips catch-up entirely when paused and re-anchors lastTickTime", () => {
    const base = createInitialState();
    const paused = { ...base, tickPaused: true, lastTickTime: Date.now() - STALE_MS };

    const before = Date.now();
    const { newState, report } = runOfflineCatchup(paused, "deep");

    // No tick-report and no simulated time.
    expect(report).toBeNull();
    expect(newState.totalTicks).toBe(paused.totalTicks);
    expect(newState.gameDate).toEqual(paused.gameDate);

    // No new inbox messages.
    expect(newState.messages.length).toBe(paused.messages.length);

    // Nothing else changed either: the entire state must be identical except
    // lastTickTime (re-anchored below) and unlockedAchievements (the paused
    // branch still applies achievements, matching the missed<=0 early return).
    const { lastTickTime: _ln, unlockedAchievements: _an, ...restNew } = newState;
    const { lastTickTime: _lo, unlockedAchievements: _ao, ...restOld } = paused;
    expect(restNew).toEqual(restOld);

    // Anchor re-set to now so the paused span can never be reclaimed later.
    expect(newState.lastTickTime).toBeGreaterThanOrEqual(before);
  });

  it("DOES catch up for the same stale anchor when not paused (the gate is the only difference)", () => {
    const base = createInitialState();
    const running = { ...base, tickPaused: false, lastTickTime: Date.now() - STALE_MS };

    const { newState, report } = runOfflineCatchup(running, "deep");

    expect(report).not.toBeNull();
    expect(newState.totalTicks).toBeGreaterThan(running.totalTicks);
  });
});

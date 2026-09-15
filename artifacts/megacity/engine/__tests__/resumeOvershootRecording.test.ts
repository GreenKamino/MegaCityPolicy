import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runOfflineCatchup } from "@/engine/offlineCatchup";
import { createInitialState } from "@/engine/initialState";
import { _resetTickPerfForTests, recordTickDuration } from "@/engine/tickPerf";
import type { GameState } from "@/engine/types";
import {
  OVERSHOOT_ABS_MS,
  OVERSHOOT_RATIO,
  RESUME_OVERSHOOT_HISTORY_CAP,
  RESUME_OVERSHOOT_TICK_TTL,
} from "@/utils/format";

/** Force the tickPerf rolling average toward `targetMs` by clearing
 *  samples and seeding the buffer. Drives the predicted catch-up wall
 *  time (`estimatedWallMs = avg × ticksRun`) so each test scenario can
 *  control whether the overshoot gates trip. */
function pinEstimatedMsPerTick(targetMs: number): void {
  _resetTickPerfForTests();
  // recordTickDuration ignores 0 / non-finite values — seed at least
  // 0.001 ms so a tiny-but-positive estimate sticks.
  recordTickDuration(Math.max(targetMs, 0.001));
}

/** Replace performance.now() with a controllable clock so tests can dial
 *  the catch-up wall duration to whatever value they need (the recorded
 *  catchupWallMs is `now() - now()` straddling the simulation call). */
function mockPerfClock(advanceByMs: number): { restore: () => void } {
  const original = performance.now.bind(performance);
  let calls = 0;
  const spy = vi.spyOn(performance, "now").mockImplementation(() => {
    // Even-numbered calls (0, 2, 4 ...) return a base time; odd-numbered
    // calls return base + advanceByMs. runOfflineCatchup pairs its now()
    // calls as start/end around the simulation block.
    const base = 1_000_000;
    const c = calls++;
    return c % 2 === 0 ? base : base + advanceByMs;
  });
  return {
    restore: () => {
      spy.mockRestore();
      void original;
    },
  };
}

// Helper: fabricate a saved-state snapshot whose lastTickTime is `n`
// real-world minutes in the past so `runOfflineCatchup` will compute
// `n / tickIntervalMinutes` missed ticks. We only need 1-2 ticks of work
// for these recording-behavior tests; correctness of the catch-up itself
// is covered by the offlineCatchupParity suite.
function buildBackdatedSave(minutesAgo: number, overrides: Partial<GameState> = {}): GameState {
  const base = createInitialState();
  const tickIntervalMinutes = base.tickIntervalMinutes ?? 15;
  return {
    ...base,
    tickIntervalMinutes,
    // A game only accrues offline progress while it was RUNNING. createInitialState
    // starts paused (the title/onboarding default), and runOfflineCatchup now
    // short-circuits paused games, so these returning-player fixtures must un-pause.
    tickPaused: false,
    lastTickTime: Date.now() - minutesAgo * 60_000,
    ...overrides,
  };
}

describe("runOfflineCatchup — recentResumeOvershoots ring buffer", () => {
  let clock: { restore: () => void } | null = null;

  beforeEach(() => {
    _resetTickPerfForTests();
  });

  afterEach(() => {
    clock?.restore();
    clock = null;
  });

  it("does NOT push a record when the catch-up stayed within the budget", () => {
    // Pin the per-tick estimate generously AND mock the wall clock so
    // the actual duration is small. With est = 1ms/tick × 1 tick = 1ms
    // and an actual of 0.5ms, neither the ratio nor abs gate trips.
    pinEstimatedMsPerTick(1);
    clock = mockPerfClock(0.5);
    const saved = buildBackdatedSave(15);
    const result = runOfflineCatchup(saved, "lite");
    expect(result.report).not.toBeNull();
    expect(result.newState.recentResumeOvershoots ?? []).toEqual([]);
  });

  it("pushes a record when the catch-up overshot both gates", () => {
    // Tiny estimate (0.001ms × 1 tick ≈ 0.001ms) plus a mocked actual
    // wall time of 800ms guarantees both ratio (>>1.5×) and absolute
    // (>>400ms) gates trip regardless of machine speed.
    pinEstimatedMsPerTick(0.001);
    clock = mockPerfClock(800);
    const saved = buildBackdatedSave(15);
    const result = runOfflineCatchup(saved, "lite");
    expect(result.report).not.toBeNull();
    const ring = result.newState.recentResumeOvershoots ?? [];
    expect(ring.length).toBe(1);
    const [first] = ring;
    expect(first.actualMs).toBe(result.report!.catchupWallMs);
    expect(first.estimatedMs).toBe(result.report!.estimatedWallMs);
    expect(first.atTick).toBe(result.newState.totalTicks);
  });

  it("caps the ring buffer at RESUME_OVERSHOOT_HISTORY_CAP (oldest dropped)", () => {
    pinEstimatedMsPerTick(0.001);
    clock = mockPerfClock(800);
    // Pre-load with cap+2 prior overshoot records all stamped at the
    // current totalTicks so none age out — pushing a new one should
    // trim from the FRONT, leaving the most recent CAP entries.
    const baseTotalTicks = 500;
    const stale = Array.from({ length: RESUME_OVERSHOOT_HISTORY_CAP + 2 }, (_, i) => ({
      actualMs: 1000 + i,
      estimatedMs: 100,
      atTick: baseTotalTicks - 1, // within the TTL window
    }));
    const saved = buildBackdatedSave(15, {
      totalTicks: baseTotalTicks,
      recentResumeOvershoots: stale,
    });
    const result = runOfflineCatchup(saved, "lite");
    const ring = result.newState.recentResumeOvershoots ?? [];
    expect(ring.length).toBe(RESUME_OVERSHOOT_HISTORY_CAP);
    // The newly-pushed record (atTick = post-resume totalTicks) should
    // be the LAST entry; the oldest stale entry (actualMs 1000) should
    // be gone.
    expect(ring[ring.length - 1].atTick).toBe(result.newState.totalTicks);
    expect(ring.some((r) => r.actualMs === 1000)).toBe(false);
  });

  it("drops entries older than RESUME_OVERSHOOT_TICK_TTL before recording", () => {
    pinEstimatedMsPerTick(0.001);
    clock = mockPerfClock(800);
    const baseTotalTicks = RESUME_OVERSHOOT_TICK_TTL * 3;
    // Two stale entries: one well past TTL (should drop), one inside (should keep).
    const stale = [
      { actualMs: 9999, estimatedMs: 1, atTick: 1 }, // ancient → drop
      { actualMs: 8888, estimatedMs: 1, atTick: baseTotalTicks - 10 }, // recent → keep
    ];
    const saved = buildBackdatedSave(15, {
      totalTicks: baseTotalTicks,
      recentResumeOvershoots: stale,
    });
    const result = runOfflineCatchup(saved, "lite");
    const ring = result.newState.recentResumeOvershoots ?? [];
    expect(ring.some((r) => r.actualMs === 9999)).toBe(false);
    expect(ring.some((r) => r.actualMs === 8888)).toBe(true);
    // Plus the newly-pushed current overshoot.
    expect(ring.length).toBe(2);
  });
});

// Sanity: thresholds exported as numbers so callers can rely on them.
describe("overshoot threshold sanity", () => {
  it("ratio is > 1 and abs is > 0", () => {
    expect(OVERSHOOT_RATIO).toBeGreaterThan(1);
    expect(OVERSHOOT_ABS_MS).toBeGreaterThan(0);
  });
});

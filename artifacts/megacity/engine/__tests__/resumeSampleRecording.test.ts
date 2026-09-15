import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runOfflineCatchup } from "@/engine/offlineCatchup";
import { createInitialState } from "@/engine/initialState";
import { _resetTickPerfForTests, recordTickDuration } from "@/engine/tickPerf";
import type { GameState, ResumeSampleRecord } from "@/engine/types";
import {
  RESUME_OVERSHOOT_TICK_TTL,
  RESUME_SAMPLE_HISTORY_CAP,
} from "@/utils/format";

// Pin the rolling per-tick estimate so estimatedWallMs in the catch-up
// is deterministic regardless of how loaded the test machine is.
function pinEstimatedMsPerTick(targetMs: number): void {
  _resetTickPerfForTests();
  recordTickDuration(Math.max(targetMs, 0.001));
}

// Replace performance.now with an even/odd stub: even calls return a
// base time, odd calls return base+advanceByMs. runOfflineCatchup pairs
// its now() calls as start/end around the simulation block, so the
// recorded catchupWallMs is exactly advanceByMs.
function mockPerfClock(advanceByMs: number): { restore: () => void } {
  let calls = 0;
  const spy = vi.spyOn(performance, "now").mockImplementation(() => {
    const base = 1_000_000;
    const c = calls++;
    return c % 2 === 0 ? base : base + advanceByMs;
  });
  return { restore: () => spy.mockRestore() };
}

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

describe("runOfflineCatchup — recentResumeSamples ring buffer", () => {
  let clock: { restore: () => void } | null = null;

  beforeEach(() => {
    _resetTickPerfForTests();
  });

  afterEach(() => {
    clock?.restore();
    clock = null;
  });

  it("does NOT record a sample when no ticks were missed", () => {
    pinEstimatedMsPerTick(1);
    clock = mockPerfClock(0.5);
    // lastTickTime = now → 0 missed ticks → runOfflineCatchup short-circuits.
    const saved = buildBackdatedSave(0);
    const result = runOfflineCatchup(saved, "lite");
    expect(result.report).toBeNull();
    expect(result.newState.recentResumeSamples ?? []).toEqual([]);
  });

  it("records a sample for an on-budget resume (not just overshoots)", () => {
    pinEstimatedMsPerTick(1);
    // 0.5ms actual stays inside both overshoot gates → fast resume.
    clock = mockPerfClock(0.5);
    const saved = buildBackdatedSave(15);
    const result = runOfflineCatchup(saved, "lite");
    expect(result.report).not.toBeNull();
    const ring = result.newState.recentResumeSamples ?? [];
    expect(ring.length).toBe(1);
    const [first] = ring;
    expect(first.ticksProcessed).toBe(result.report!.simulatedTicks);
    expect(first.actualMs).toBe(result.report!.catchupWallMs);
    expect(first.estimatedMs).toBe(result.report!.estimatedWallMs);
    expect(first.atTick).toBe(result.newState.totalTicks);
    // The non-overshoot sample must NOT pollute the overshoot ring.
    expect(result.newState.recentResumeOvershoots ?? []).toEqual([]);
  });

  it("records overshoot samples in BOTH ring buffers in lockstep", () => {
    pinEstimatedMsPerTick(0.001);
    clock = mockPerfClock(800);
    const saved = buildBackdatedSave(15);
    const result = runOfflineCatchup(saved, "lite");
    expect((result.newState.recentResumeSamples ?? []).length).toBe(1);
    expect((result.newState.recentResumeOvershoots ?? []).length).toBe(1);
  });

  it("caps the sample ring buffer at RESUME_SAMPLE_HISTORY_CAP (oldest dropped)", () => {
    pinEstimatedMsPerTick(1);
    clock = mockPerfClock(0.5);
    const baseTotalTicks = 500;
    const stale: ResumeSampleRecord[] = Array.from(
      { length: RESUME_SAMPLE_HISTORY_CAP + 2 },
      (_, i) => ({
        ticksProcessed: 10 + i,
        actualMs: 100 + i,
        estimatedMs: 100,
        atTick: baseTotalTicks - 1, // within TTL window so none age out
      }),
    );
    const saved = buildBackdatedSave(15, {
      totalTicks: baseTotalTicks,
      recentResumeSamples: stale,
    });
    const result = runOfflineCatchup(saved, "lite");
    const ring = result.newState.recentResumeSamples ?? [];
    expect(ring.length).toBe(RESUME_SAMPLE_HISTORY_CAP);
    // Newest record is the freshly-pushed one; oldest stale (ticksProcessed 10) is gone.
    expect(ring[ring.length - 1].atTick).toBe(result.newState.totalTicks);
    expect(ring.some((r) => r.ticksProcessed === 10)).toBe(false);
  });

  it("ages out samples older than RESUME_OVERSHOOT_TICK_TTL game ticks", () => {
    pinEstimatedMsPerTick(1);
    clock = mockPerfClock(0.5);
    const baseTotalTicks = RESUME_OVERSHOOT_TICK_TTL * 3;
    const stale: ResumeSampleRecord[] = [
      { ticksProcessed: 5, actualMs: 9999, estimatedMs: 1, atTick: 1 }, // ancient → drop
      { ticksProcessed: 7, actualMs: 8888, estimatedMs: 1, atTick: baseTotalTicks - 10 }, // recent → keep
    ];
    const saved = buildBackdatedSave(15, {
      totalTicks: baseTotalTicks,
      recentResumeSamples: stale,
    });
    const result = runOfflineCatchup(saved, "lite");
    const ring = result.newState.recentResumeSamples ?? [];
    expect(ring.some((r) => r.actualMs === 9999)).toBe(false);
    expect(ring.some((r) => r.actualMs === 8888)).toBe(true);
    // Plus the newly-pushed current sample.
    expect(ring.length).toBe(2);
  });
});

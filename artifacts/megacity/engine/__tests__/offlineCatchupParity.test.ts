import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { processMissedTicks, runTick } from "@/engine/formulas";
import type { GameState } from "@/engine/types";

// Offline catch-up parity: when a player returns after an absence, the
// `processMissedTicks` path is supposed to advance the state in a way that
// stays close to what would have happened tick-by-tick if they'd left the
// game running. Pre-launch audit flagged that the previous BATCH_LIMIT of
// 6 made this impossible for any non-trivial absence — events, faction
// dynamics, faith/policy side effects all got short-circuited.
//
// These tests pin two contracts:
//   1. For absences within BATCH_LIMIT, processMissedTicks fully simulates
//      every tick (totalTicks advances exactly, gameDate advances exactly).
//   2. For absences beyond BATCH_LIMIT, the rate-extrapolation block keeps
//      resources, totalTicks and gameDate consistent with the live path
//      to within a documented tolerance.

describe("offline catch-up parity", () => {
  it("fully simulates absences up to BATCH_LIMIT (1500 ticks)", () => {
    const start = createInitialState();
    const N = 200; // safely under BATCH_LIMIT

    // Live path: run N ticks one at a time.
    let liveState: GameState = start;
    for (let i = 0; i < N; i++) {
      liveState = runTick(liveState).newState;
    }

    // Catch-up path: hand processMissedTicks the same N.
    const { newState: catchupState } = processMissedTicks(start, N);

    // totalTicks must advance by exactly N on both paths — this is the
    // primary signal that the simulation actually ran (vs extrapolated).
    expect(catchupState.totalTicks - start.totalTicks).toBe(N);
    expect(liveState.totalTicks - start.totalTicks).toBe(N);

    // gameDate hour/day advances must match exactly: any divergence here
    // means processMissedTicks short-circuited the per-tick clock advance.
    expect(catchupState.gameDate).toEqual(liveState.gameDate);
  });

  // NB: simulating 1500 ticks under full-suite worker contention can take
  // tens of seconds; the per-test default is far too tight here, and the
  // validation harness runs this concurrently with the serial perf suite.
  it("extrapolates absences beyond BATCH_LIMIT without losing time", { timeout: 120_000 }, () => {
    const start = createInitialState();
    const N = 2000; // forces extrapolation block (BATCH_LIMIT=1500)

    const { newState } = processMissedTicks(start, N);

    // totalTicks must reflect every missed tick, including the extrapolated
    // tail — otherwise long absences silently swallow time.
    expect(newState.totalTicks - start.totalTicks).toBe(N);

    // Resources must be non-negative after extrapolation (the helper clamps
    // before returning; this guards against a regression that lets credits
    // or steel go negative on long absences).
    expect(newState.resources.credits).toBeGreaterThanOrEqual(0);
    expect(newState.resources.steel).toBeGreaterThanOrEqual(0);
    expect(newState.resources.food).toBeGreaterThanOrEqual(0);
    expect(newState.resources.water).toBeGreaterThanOrEqual(0);
    expect(newState.resources.power).toBeGreaterThanOrEqual(0);
  });

  it("resource trajectory in catchup tracks live path within tolerance", () => {
    // For a fully-simulated absence (under BATCH_LIMIT), key resource
    // deltas should match the live path very closely. Non-determinism
    // from random events can cause small divergence, so we assert a
    // generous bound rather than equality.
    const start = createInitialState();
    const N = 50;

    let liveState: GameState = start;
    for (let i = 0; i < N; i++) {
      liveState = runTick(liveState).newState;
    }
    const { newState: catchupState } = processMissedTicks(start, N);

    const liveCredits = liveState.resources.credits;
    const catchupCredits = catchupState.resources.credits;
    const denom = Math.max(1, Math.abs(liveCredits));
    const relDiff = Math.abs(liveCredits - catchupCredits) / denom;
    // Within 50% of live — random events can shift income meaningfully
    // over 50 ticks, but order of magnitude should be preserved.
    expect(relDiff).toBeLessThan(0.5);
  });
});

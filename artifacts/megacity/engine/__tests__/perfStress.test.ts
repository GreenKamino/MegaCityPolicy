/**
 * Performance + stress test for the MEGACITY game engine.
 *
 * Runs `runTick(state)` thousands of times against a real initial state
 * and reports per-tick timing statistics. Intentionally written as a
 * vitest spec so it shares the project's TS/alias setup, but the
 * assertions are deliberately loose — this exists to surface
 * catastrophic perf regressions, not to enforce strict thresholds that
 * would flake on slow CI runners.
 *
 * Reported stats per scenario:
 *   - mean / p50 / p95 / p99 / max ms per tick
 *   - total wall time + estimated sustainable ticks-per-second
 */

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import type { GameState } from "@/engine/types";

type Stats = {
  ticks: number;
  totalMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  ticksPerSec: number;
};

function summarize(samples: number[], totalMs: number): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const at = (q: number) => sorted[Math.min(n - 1, Math.floor(q * n))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  return {
    ticks: n,
    totalMs,
    meanMs: mean,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted[n - 1],
    ticksPerSec: 1000 / mean,
  };
}

function fmt(stats: Stats, label: string): string {
  return [
    ``,
    `=== ${label} ===`,
    `  ticks:        ${stats.ticks}`,
    `  total wall:   ${stats.totalMs.toFixed(1)} ms`,
    `  mean:         ${stats.meanMs.toFixed(3)} ms / tick`,
    `  p50:          ${stats.p50Ms.toFixed(3)} ms`,
    `  p95:          ${stats.p95Ms.toFixed(3)} ms`,
    `  p99:          ${stats.p99Ms.toFixed(3)} ms`,
    `  max:          ${stats.maxMs.toFixed(3)} ms`,
    `  sustainable:  ${stats.ticksPerSec.toFixed(0)} ticks/sec at the mean`,
  ].join("\n");
}

function runScenario(state: GameState, ticks: number): Stats {
  const samples: number[] = new Array(ticks);
  let s = state;
  const wallStart = performance.now();
  for (let i = 0; i < ticks; i++) {
    const t0 = performance.now();
    const result = runTick(s);
    const t1 = performance.now();
    samples[i] = t1 - t0;
    s = result.newState;
  }
  const wallEnd = performance.now();
  return summarize(samples, wallEnd - wallStart);
}

/**
 * Build a "stressed" state: replay the engine forward N ticks first so
 * the world fills up with messages, events, contract progress, faction
 * threat shifts, etc. Approximates what the tick cost looks like deep
 * into a real playthrough rather than from frame zero.
 */
function buildAgedState(initialTicks: number): GameState {
  let s = createInitialState();
  for (let i = 0; i < initialTicks; i++) {
    s = runTick(s).newState;
  }
  return s;
}

describe("engine perf + stress", () => {
  it("runs 1000 cold-start ticks within sane budget", { timeout: 90_000 }, () => {
    const state = createInitialState();
    const stats = runScenario(state, 1000);
    console.log(fmt(stats, "scenario 1: 1000 cold-start ticks"));
    // Loose ceiling: even on a slow shared CI runner the mean tick
    // should fit comfortably under 50 ms. This exists to catch
    // accidental O(n^2) regressions, not to enforce a hard SLA.
    expect(stats.meanMs).toBeLessThan(50);
    // Tail guard on p99, never the raw max: running in the parallel
    // validation suite, a single tick can be descheduled for hundreds
    // of ms (observed >3 s) from transient CPU contention, which flakes
    // a raw-max ceiling. p99 ignores those isolated spikes while still
    // tripping on a real O(n^2) regression that raises the whole
    // distribution. 1500 ms keeps the same loose intent as before.
    expect(stats.p99Ms).toBeLessThan(1500);
  });

  it("runs 500 ticks on an aged 500-tick state without degrading badly", { timeout: 90_000 }, () => {
    const aged = buildAgedState(500);
    const stats = runScenario(aged, 500);
    console.log(fmt(stats, "scenario 2: 500 ticks on a 500-tick-aged state"));
    expect(stats.meanMs).toBeLessThan(50);
    // p99, not raw max — see scenario 1 (parallel-suite CPU contention).
    expect(stats.p99Ms).toBeLessThan(1500);
  });

  // Burn-in scenario takes ~7s wall on shared CI runners (5000 ticks
  // at ~1.5 ms/tick). Bump the per-test timeout above vitest's 5s
  // default so this only fails on real perf regressions, not on cold
  // CI runs.
  it("survives a 5000-tick burn-in without throwing", { timeout: 180_000 }, () => {
    let s = createInitialState();
    const wallStart = performance.now();
    for (let i = 0; i < 5000; i++) {
      s = runTick(s).newState;
    }
    const wallMs = performance.now() - wallStart;
    const meanMs = wallMs / 5000;
    console.log(
      [
        ``,
        `=== scenario 3: 5000-tick burn-in ===`,
        `  total wall:   ${wallMs.toFixed(1)} ms`,
        `  mean:         ${meanMs.toFixed(3)} ms / tick`,
        `  final ticks:  ${s.totalTicks}`,
        `  population:   ${s.cityStats.population.toLocaleString()}`,
        `  msg log:      ${(s.messages ?? []).length} entries`,
        `  active evts:  ${(s.activeEvents ?? []).length}`,
      ].join("\n"),
    );
    // Sanity: the engine actually advanced state.
    expect(s.totalTicks).toBe(5000);
    // Burn-in should still average well under a frame budget.
    expect(meanMs).toBeLessThan(50);
  });

  // Diagnostic: if the cold-start scenario shows a tail outlier (e.g.
  // 151 ms on a fresh JIT), this scenario isolates it by reporting
  // which tick index produced the slowest sample — useful for spotting
  // expensive cold paths vs. JIT warm-up.
  it("identifies the slowest tick index in a cold-start run", { timeout: 90_000 }, () => {
    const state = createInitialState();
    const samples: number[] = new Array(200);
    let s = state;
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      s = runTick(s).newState;
      samples[i] = performance.now() - t0;
    }
    let maxIdx = 0;
    let maxMs = samples[0];
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] > maxMs) {
        maxMs = samples[i];
        maxIdx = i;
      }
    }
    const after = samples.slice(maxIdx + 1);
    const afterMean = after.length
      ? after.reduce((a, b) => a + b, 0) / after.length
      : 0;
    console.log(
      [
        ``,
        `=== scenario 4: slowest cold-start tick ===`,
        `  slowest tick #: ${maxIdx} (of 200)`,
        `  slowest tick:   ${maxMs.toFixed(3)} ms`,
        `  mean of ticks AFTER the slowest: ${afterMean.toFixed(3)} ms`,
        `  → if slowest tick is in the first ~5 and post-mean is much`,
        `    smaller, this is JIT warm-up rather than a hot path.`,
      ].join("\n"),
    );
    // No assertion on max — purely diagnostic.
    expect(samples.length).toBe(200);
  });
});

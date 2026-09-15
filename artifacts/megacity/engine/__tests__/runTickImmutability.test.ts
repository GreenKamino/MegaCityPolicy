/**
 * Immutability contract for `runTick`.
 *
 * `runTick` is an immutable update: it must NEVER mutate the input
 * `state` object that callers (the React reducer, autosave/loadgame,
 * etc.) hand to it. Several state slices are intentionally NOT cloned
 * at the top of `runTick` — instead, the engine relies on every
 * mutation site using the `s.<slice> = [...]`-style replacement
 * pattern. If a future change introduces in-place writes to one of
 * those slices, this test will catch it before the regression ships.
 *
 * Slices guarded here:
 *   - policies      (read-only across the entire engine)
 *   - crimeStats    (only ever wholesale-replaced with `s.crimeStats = cst`)
 *   - activeEvents  (mutation sites all use immutable-replacement)
 */

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import type { GameState } from "@/engine/types";

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function runManyTicks(state: GameState, count: number): GameState {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = runTick(s).newState;
  }
  return s;
}

describe("runTick immutability contract for shared slices", () => {
  it("does not mutate input state.policies across many ticks", () => {
    const state = createInitialState();
    const before = snapshot(state.policies);

    runManyTicks(state, 50);

    expect(state.policies).toEqual(before);
  });

  it("does not mutate input state.crimeStats across many ticks", () => {
    const state = createInitialState();
    const before = snapshot(state.crimeStats);

    runManyTicks(state, 50);

    expect(state.crimeStats).toEqual(before);
  });

  it("does not mutate input state.activeEvents across many ticks", () => {
    const state = createInitialState();
    const before = snapshot(state.activeEvents ?? []);

    runManyTicks(state, 50);

    expect(state.activeEvents ?? []).toEqual(before);
  });

  it("returns a NEW top-level state object every tick", () => {
    const state = createInitialState();
    const { newState } = runTick(state);
    expect(newState).not.toBe(state);
  });
});

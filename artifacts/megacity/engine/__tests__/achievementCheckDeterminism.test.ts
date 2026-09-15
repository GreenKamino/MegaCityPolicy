/* eslint-disable no-console */
import { describe, expect, it } from "vitest";
import { ALL_BASE_ACHIEVEMENTS } from "@/engine/achievements";
import { createInitialState } from "@/engine/initialState";

/**
 * Drift guard: achievement check determinism + immutability.
 *
 * Companion to achievementCheckSafety (which pinned 0 throws + 0
 * non-bool returns + a PLAYTEST_SEED_UNLOCK_ALLOWLIST). This guard
 * adds two cheap properties every check function MUST satisfy:
 *
 *   1. Determinism — two back-to-back calls on the same state
 *      yield the same boolean. Catches hidden Date.now() /
 *      Math.random() / external state reads.
 *   2. Immutability — neither call mutates the input state. Pinned
 *      via JSON snapshot diff before/after.
 *
 * If either property breaks, achievement unlock results become
 * order-dependent, save-load-dependent, or replay-flaky — all
 * silent bugs that have bitten this codebase before.
 */

describe("achievement check determinism + immutability (drift guard)", () => {
  const state = createInitialState();
  const stateSnapshotBefore = JSON.stringify(state);

  it("every check returns the SAME boolean on two back-to-back calls", () => {
    const drifted: { id: string; first: boolean; second: boolean }[] = [];
    for (const def of ALL_BASE_ACHIEVEMENTS) {
      let first = false;
      let second = false;
      try {
        first = def.check(state);
        second = def.check(state);
      } catch {
        // Throws are pinned by achievementCheckSafety; skip here.
        continue;
      }
      if (first !== second) {
        drifted.push({ id: def.id, first, second });
      }
    }
    if (drifted.length > 0) {
      console.error("[determinism] non-deterministic checks:", drifted);
    }
    expect(drifted).toEqual([]);
  });

  it("running every check leaves the input GameState byte-identical (no mutation)", () => {
    // Re-run all checks to be sure mutation-via-side-effect is captured
    // even after the determinism pass already touched them.
    for (const def of ALL_BASE_ACHIEVEMENTS) {
      try {
        def.check(state);
      } catch {
        // Ignored — safety guard pins this separately.
      }
    }
    const stateSnapshotAfter = JSON.stringify(state);
    if (stateSnapshotBefore !== stateSnapshotAfter) {
      // Surface a small diff hint without dumping ~300 KB to logs.
      const beforeLen = stateSnapshotBefore.length;
      const afterLen = stateSnapshotAfter.length;
      console.error(
        `[determinism] state mutated during check pass: before=${beforeLen}B after=${afterLen}B`,
      );
    }
    expect(stateSnapshotAfter).toBe(stateSnapshotBefore);
  });

  it("ALL_BASE_ACHIEVEMENTS catalog has the expected size budget", () => {
    // Bump deliberately when adding/removing achievements. Lives here
    // (not in a static integrity test) so this guard's per-check loop
    // cost stays visible. 409 → 415: Task #557 added 6 interior
    // storyline achievements (Quiet Floors / Red Door + ending variants).
    expect(ALL_BASE_ACHIEVEMENTS.length).toBe(409);
  });
});

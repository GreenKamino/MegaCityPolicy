/**
 * Spawn-time cap invariant for `state.namedCharacters`.
 *
 * Background: `tickNamedCharacters` was historically the only enforcer of
 * the active/inactive caps, and it's gated to year-rollover (called from
 * formulas.ts only when `gameDate.year !== prevYear`). With 15-min
 * ticks, an in-game year is ≈35,040 ticks, so most play sessions never
 * trigger a cull and the array would grow unbounded between Januarys.
 *
 * The fix moves cap enforcement into `enforceCharacterCaps`, which now
 * also runs inside `spawnNamedCharacter`. These tests verify the cap is
 * a real invariant, not an annual janitor.
 */

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  spawnNamedCharacter,
  getOrPickActiveNPC,
  computeCityTraitMultipliers,
  computeFactionTraitMultipliers,
  listDistrictTraitContributions,
} from "@/engine/namedCharacters";
import type { CharacterRole } from "@/engine/types";

const ROLES: CharacterRole[] = [
  "gang_lieutenant",
  "journalist",
  "tycoon",
  "agitator",
  "celebrity",
  "informant",
  "fugitive",
  "preacher",
  "union_boss",
];

// Mirrors the constants in engine/namedCharacters.ts. If those change,
// this constant must change too — the drift is intentional so a quiet
// cap relaxation upstream fails this test loudly.
const MAX_ACTIVE_PER_ROLE = 6;
const MAX_INACTIVE_RETAINED = 60;
const HARD_CEILING =
  MAX_ACTIVE_PER_ROLE * ROLES.length + MAX_INACTIVE_RETAINED;

describe("namedCharacters cap invariant", () => {
  it("never exceeds the hard ceiling under tight-loop spawning", () => {
    const state = createInitialState();
    let maxObserved = 0;

    for (let i = 0; i < 500; i++) {
      const role = ROLES[i % ROLES.length];
      spawnNamedCharacter(state, role);
      const len = (state.namedCharacters ?? []).length;
      maxObserved = Math.max(maxObserved, len);
      expect(len).toBeLessThanOrEqual(HARD_CEILING);
    }

    // Sanity: we should actually be hitting the cap, not just spawning a
    // few characters and trivially passing. With 500 spawns vs a 114
    // hard ceiling, we expect to be sitting at-or-near the cap by the
    // end.
    expect(maxObserved).toBeGreaterThanOrEqual(HARD_CEILING - 5);
    expect((state.namedCharacters ?? []).length).toBeLessThanOrEqual(
      HARD_CEILING,
    );
  });

  it("respects per-role active cap after spawn flood", () => {
    const state = createInitialState();
    // Spam one role.
    for (let i = 0; i < 50; i++) {
      spawnNamedCharacter(state, "gang_lieutenant");
    }
    const activeForRole = (state.namedCharacters ?? []).filter(
      (c) => c.role === "gang_lieutenant" && c.status === "active",
    );
    expect(activeForRole.length).toBeLessThanOrEqual(MAX_ACTIVE_PER_ROLE);
  });

  it("preserves the most recent / most notorious entries when culling", () => {
    const state = createInitialState();
    // Fill a single role's active slots with low-notoriety characters,
    // then spawn a high-notoriety one. The newcomer should survive; one
    // of the low-notoriety predecessors should be the demoted one.
    const lowIds: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_PER_ROLE; i++) {
      const c = spawnNamedCharacter(state, "journalist", { notoriety: 5 });
      lowIds.push(c.id);
    }
    const survivor = spawnNamedCharacter(state, "journalist", {
      notoriety: 95,
    });

    const list = state.namedCharacters ?? [];
    const survivorEntry = list.find((c) => c.id === survivor.id);
    expect(survivorEntry?.status).toBe("active");

    // Exactly one of the low-notoriety predecessors should now be
    // missing (the others stay active until further spawns push them
    // out).
    const demotedCount = lowIds.filter(
      (id) => list.find((c) => c.id === id)?.status === "missing",
    ).length;
    expect(demotedCount).toBe(1);
  });

  it("never demotes the just-spawned character even when incumbents outrank it", () => {
    // Bug guard: pre-fix, if a role was at MAX_ACTIVE_PER_ROLE with
    // high-notoriety incumbents, spawnNamedCharacter would push the new
    // entry, then the same-call cull would pick the lowest (year,
    // notoriety) — which is the new arrival — as the demotion victim.
    // The function would return a local "active" reference while state
    // held a "missing" entry. This broke getOrPickActiveNPC's contract.
    //
    // The fix marks the just-spawned id as protected from the cull
    // candidate pool. The newcomer always survives; an incumbent
    // demotes in its place.
    const state = createInitialState();
    for (let i = 0; i < MAX_ACTIVE_PER_ROLE; i++) {
      spawnNamedCharacter(state, "celebrity", { notoriety: 95 });
    }
    const newcomer = spawnNamedCharacter(state, "celebrity", {
      notoriety: 1,
    });

    // The returned object must match what's actually in state.
    const list = state.namedCharacters ?? [];
    const stateEntry = list.find((c) => c.id === newcomer.id);
    expect(stateEntry).toBeDefined();
    expect(stateEntry?.status).toBe("active");

    // And exactly one incumbent must have stepped aside.
    const activeForRole = list.filter(
      (c) => c.role === "celebrity" && c.status === "active",
    );
    expect(activeForRole.length).toBe(MAX_ACTIVE_PER_ROLE);
  });

  it("getOrPickActiveNPC always returns an active, present character", () => {
    // Contract test: the spawn branch of getOrPickActiveNPC went
    // through a code path that could return a stale-active reference
    // pre-fix. Verify the return is always (a) present in state and
    // (b) status === "active".
    const state = createInitialState();
    // Saturate every role with high-notoriety incumbents so any new
    // spawn is forced through the at-cap code path.
    for (const role of ROLES) {
      for (let i = 0; i < MAX_ACTIVE_PER_ROLE; i++) {
        spawnNamedCharacter(state, role, { notoriety: 90 + i });
      }
    }

    for (let i = 0; i < 50; i++) {
      const role = ROLES[i % ROLES.length];
      // spawnChance: 1.0 forces the spawn branch (vs reusing an
      // incumbent), exercising the same-call cull every time.
      const picked = getOrPickActiveNPC(state, role, { spawnChance: 1.0 });
      const list = state.namedCharacters ?? [];
      const entry = list.find((c) => c.id === picked.id);
      expect(entry).toBeDefined();
      expect(entry?.status).toBe("active");
      expect(entry?.role).toBe(role);
    }
  });

  it("self-heals an already-over-cap state on next spawn (legacy save migration)", () => {
    // Simulates loading an old save that pre-dates spawn-time cap
    // enforcement and is therefore badly over-cap. The very next spawn
    // should restore the array to within bounds in one pass — proving
    // that veterans don't need a manual migration step.
    const state = createInitialState();
    // Manually inflate the array past the hard ceiling, bypassing
    // spawnNamedCharacter (which would enforce caps eagerly).
    const inflated = [];
    for (let i = 0; i < 300; i++) {
      inflated.push({
        id: `legacy-${i}`,
        name: `Legacy ${i}`,
        role: ROLES[i % ROLES.length],
        factionId: null,
        districtId: null,
        status: "active" as const,
        notoriety: 50,
        traits: [],
        backstory: "",
        bornYear: 2000,
        introducedYear: 2030,
        lastSeenYear: 2030,
        history: [],
      });
    }
    state.namedCharacters = inflated;
    expect(state.namedCharacters.length).toBe(300); // baseline: corrupt

    // One spawn should heal it.
    const newcomer = spawnNamedCharacter(state, "preacher", { notoriety: 80 });

    expect((state.namedCharacters ?? []).length).toBeLessThanOrEqual(
      HARD_CEILING,
    );
    // Newcomer survives despite the chaos.
    const entry = (state.namedCharacters ?? []).find(
      (c) => c.id === newcomer.id,
    );
    expect(entry?.status).toBe("active");
  });

  it("trims excess inactive characters past MAX_INACTIVE_RETAINED", () => {
    const state = createInitialState();
    // Force every spawn into a role-overflow situation so almost all
    // become "missing" via the per-role cap. Spamming one role 200
    // times means ~194 demotions → inactive bucket overflows.
    for (let i = 0; i < 200; i++) {
      spawnNamedCharacter(state, "tycoon", { notoriety: i });
    }
    const inactive = (state.namedCharacters ?? []).filter(
      (c) => c.status !== "active",
    );
    expect(inactive.length).toBeLessThanOrEqual(MAX_INACTIVE_RETAINED);
  });

  it(
    "keeps namedCharacters bounded across a multi-thousand-tick run",
    () => {
      // Drives the engine through real tick logic (which is the actual
      // spawn surface in production), not just direct spawnNamedCharacter
      // calls. Confirms in-engine spawn paths also pass through the cap.
      let state = createInitialState();
      const TICKS = 2000;
      let maxObserved = 0;
      for (let i = 0; i < TICKS; i++) {
        state = runTick(state).newState;
        const len = (state.namedCharacters ?? []).length;
        maxObserved = Math.max(maxObserved, len);
      }
      expect(maxObserved).toBeLessThanOrEqual(HARD_CEILING);
    },
    // Real cost is ~3.7s in isolation, but under heavy parallel suite
    // load this can balloon past the default 5s vitest timeout. Bumping
    // to 20s gives ample headroom without masking a true regression
    // (a real cap break would crash long before the timeout).
    20_000,
  );

  it("downstream consumers do not throw after a spawn-time cull", () => {
    // Smoke test for the consumer-safety risk called out in the session
    // plan: a character demoted mid-flow shouldn't break the trait /
    // multiplier consumers that read state.namedCharacters.
    const state = createInitialState();
    const factionId = state.factions?.[0]?.id ?? null;
    const districtId = state.districts?.[0]?.id ?? null;

    // Force demotions across multiple roles + faction/district anchors.
    for (let i = 0; i < 100; i++) {
      const role = ROLES[i % ROLES.length];
      spawnNamedCharacter(state, role, { factionId, districtId });
    }

    expect(() => computeCityTraitMultipliers(state)).not.toThrow();
    if (factionId) {
      expect(() =>
        computeFactionTraitMultipliers(state, factionId),
      ).not.toThrow();
    }
    if (districtId) {
      expect(() =>
        listDistrictTraitContributions(state, districtId),
      ).not.toThrow();
    }
  });
});

describe("namedCharacters byte-size bound", () => {
  it("stays under a hard byte ceiling even under tight-loop spawning", () => {
    // The character-count cap is verified above. This test asserts the
    // *byte-size* bound that the count cap implies: with at most 114
    // characters × per-character byte budget (id + name + traits +
    // backstory + ≤16 history entries), the JSON payload should never
    // exceed a generous ceiling.
    //
    // Pre-fix, a future code path that spawned 1000 NPCs in a single
    // tick (a plausible event-storm scenario) would push namedCharacters
    // to >500 KB until the next year-rollover. With spawn-time
    // enforcement, the array can't grow past the count cap, so byte
    // size also has a hard bound.
    const state = createInitialState();
    for (let i = 0; i < 1000; i++) {
      const role = ROLES[i % ROLES.length];
      spawnNamedCharacter(state, role, { notoriety: i % 100 });
    }

    const bytes = JSON.stringify({
      namedCharacters: state.namedCharacters,
    }).length;

    // 114 characters × ~5 KB worst-case per character (with full 16-
    // entry history) ≈ 570 KB ceiling. We're spawn-only here so
    // history is empty → real bytes will be much smaller (~50–100 KB).
    // The 600 KB ceiling catches a regression where the count cap
    // breaks and the array balloons past 1 MB.
    expect(bytes).toBeLessThan(600 * 1024);

    // And confirm the count cap is actually being hit (so this test
    // isn't trivially passing by spawning few characters).
    expect((state.namedCharacters ?? []).length).toBeLessThanOrEqual(
      HARD_CEILING,
    );
    expect((state.namedCharacters ?? []).length).toBeGreaterThanOrEqual(
      HARD_CEILING - 5,
    );
  });
});

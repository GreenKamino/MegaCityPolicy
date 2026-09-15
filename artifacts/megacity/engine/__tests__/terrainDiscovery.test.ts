import { describe, expect, it } from "vitest";

import { ARRAY_CAPS, sanitizeState } from "@/engine/sanitizer";
import { evaluateFirsts } from "@/engine/firsts";
import type { GameState } from "@/engine/types";

// Minimal GameState scaffold for sanitizer/firsts tests. Only the fields
// the assertions actually touch matter; the cast covers everything else
// so we don't drift when unrelated GameState properties are added.
function baseState(over: Partial<GameState> = {}): GameState {
  return {
    player: { totalDecisions: 0, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0, level: 1 },
    factions: [],
    externalMegacities: [],
    diplomaticPacts: [],
    tradeAgreements: [],
    discoveredLore: [],
    discoveredLocationIds: [],
    discoveredTerrain: [],
    unlockedTechnologies: [],
    strikeHistory: [],
    resources: { credits: 0 },
    cityStats: {},
    rates: {},
    demographics: {},
    crimeStats: {},
    districts: [],
    companies: [],
    weeklyChallengesCompleted: 0,
    totalMegaProjectsCompleted: 0,
    totalMissionsSucceeded: 0,
    totalTicks: 0,
    playTime: 0,
    lastTickTime: Date.now(),
    missedTicks: 0,
    contractCapacity: 3,
    ...over,
  } as unknown as GameState;
}

describe("sanitizer.discoveredTerrain", () => {
  it("leaves a missing field untouched on legacy saves", () => {
    const s = baseState();
    delete (s as any).discoveredTerrain;
    const out = sanitizeState(s);
    expect((out as any).discoveredTerrain).toBeUndefined();
  });

  it("dedupes repeated entries while preserving first-seen order", () => {
    const s = baseState({ discoveredTerrain: ["coast-west", "mountain-rockies", "coast-west", "mountain-rockies", "river-mississippi"] });
    const out = sanitizeState(s);
    expect(out.discoveredTerrain).toEqual(["coast-west", "mountain-rockies", "river-mississippi"]);
  });

  it("drops non-string entries from corrupted saves without throwing", () => {
    const s = baseState({ discoveredTerrain: ["coast-west", 42, null, undefined, { id: "x" }, "mountain-rockies"] as any });
    const out = sanitizeState(s);
    expect(out.discoveredTerrain).toEqual(["coast-west", "mountain-rockies"]);
  });

  it("coerces non-array values to an empty list", () => {
    const s = baseState({ discoveredTerrain: "coast-west" as any });
    const out = sanitizeState(s);
    expect(out.discoveredTerrain).toEqual([]);
  });

  it("caps length at ARRAY_CAPS.discoveredTerrain", () => {
    const oversized = Array.from({ length: ARRAY_CAPS.discoveredTerrain + 25 }, (_, i) => `feat-${i}`);
    const s = baseState({ discoveredTerrain: oversized });
    const out = sanitizeState(s);
    expect(out.discoveredTerrain).toHaveLength(ARRAY_CAPS.discoveredTerrain);
    // capArray is the head-keeping variant; first N survive.
    expect(out.discoveredTerrain?.[0]).toBe("feat-0");
  });
});

describe("sanitizer.discoveredLocationIds", () => {
  it("leaves a missing field untouched on legacy saves", () => {
    const s = baseState();
    delete (s as any).discoveredLocationIds;
    const out = sanitizeState(s);
    expect((out as any).discoveredLocationIds).toBeUndefined();
  });

  it("dedupes repeated ids while preserving discovery order", () => {
    const s = baseState({ discoveredLocationIds: ["nova-pacifica", "rust-flats", "nova-pacifica", "rust-flats", "ashen-reach"] });
    const out = sanitizeState(s);
    expect(out.discoveredLocationIds).toEqual(["nova-pacifica", "rust-flats", "ashen-reach"]);
  });

  it("drops non-string entries from corrupted saves without throwing", () => {
    const s = baseState({ discoveredLocationIds: ["nova-pacifica", 42, null, undefined, { id: "x" }, "rust-flats"] as any });
    const out = sanitizeState(s);
    expect(out.discoveredLocationIds).toEqual(["nova-pacifica", "rust-flats"]);
  });

  it("coerces non-array values to an empty list", () => {
    const s = baseState({ discoveredLocationIds: "nova-pacifica" as any });
    const out = sanitizeState(s);
    expect(out.discoveredLocationIds).toEqual([]);
  });

  it("caps length at ARRAY_CAPS.discoveredLocationIds keeping the most recent", () => {
    const oversized = Array.from({ length: ARRAY_CAPS.discoveredLocationIds + 25 }, (_, i) => `loc-${i}`);
    const s = baseState({ discoveredLocationIds: oversized });
    const out = sanitizeState(s);
    expect(out.discoveredLocationIds).toHaveLength(ARRAY_CAPS.discoveredLocationIds);
    // capArrayEnd keeps the tail: newest discoveries survive, the
    // oldest overflow entries are dropped.
    expect(out.discoveredLocationIds[0]).toBe("loc-25");
    expect(out.discoveredLocationIds[out.discoveredLocationIds.length - 1]).toBe(`loc-${ARRAY_CAPS.discoveredLocationIds + 24}`);
  });

  it("an oversized duplicate-bloated list collapses back under the cap without losing unique ids", () => {
    // Simulates the real bug surface: the same ~200 ids appended over
    // and over across save/load cycles. After sanitize, every unique id
    // must survive — the cap only removes the bloat.
    const uniques = Array.from({ length: 200 }, (_, i) => `loc-${i}`);
    const bloated = [...uniques, ...uniques, ...uniques, ...uniques];
    const s = baseState({ discoveredLocationIds: bloated });
    const out = sanitizeState(s);
    expect(out.discoveredLocationIds).toEqual(uniques);
  });
});

describe("firsts.first_terrain_charted", () => {
  it("locked when no terrain has been inspected", () => {
    const out = evaluateFirsts(baseState({ discoveredTerrain: [] }));
    expect(out.find((f) => f.def.id === "first_terrain_charted")?.unlocked).toBe(false);
  });

  it("unlocks at the first inspected feature", () => {
    const out = evaluateFirsts(baseState({ discoveredTerrain: ["mountain-rockies"] }));
    expect(out.find((f) => f.def.id === "first_terrain_charted")?.unlocked).toBe(true);
  });

  it("survives a save with discoveredTerrain absent (legacy)", () => {
    const s = baseState();
    delete (s as any).discoveredTerrain;
    const out = evaluateFirsts(s);
    expect(out.find((f) => f.def.id === "first_terrain_charted")?.unlocked).toBe(false);
  });
});

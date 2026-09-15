import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  spawnNamedCharacter,
  getOrPickActiveNPC,
  pickRoleAwareTraits,
  ensureCharacterTraits,
  maybeEmitWeeklyNotable,
  maybeEmitFactionFlashpoint,
  maybeEmitUndercityRumor,
  maybeEmitMarketMove,
  ROLE_TRAIT_POOL,
  NAMED_CHARACTER_TRAIT_EFFECTS,
} from "@/engine/namedCharacters";
import { hasCharacterTraitFlavor } from "@/engine/characterBios";
import type { GameState, NamedCharacter, CharacterRole, Faction } from "@/engine/types";

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

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameDate: { year: 2060, month: 6, day: 15, hour: 8 },
    totalTicks: 100,
    namedCharacters: [],
    factions: [],
    messages: [],
    ...overrides,
  } as unknown as GameState;
}

describe("pickRoleAwareTraits", () => {
  it("every role's trait pool is non-empty and every id has flavor coverage", () => {
    // Guard against drift: if someone adds an id to ROLE_TRAIT_POOL that
    // lacks a CHARACTER_TRAIT_FLAVOR entry, the picker silently filters
    // it out, which could leave a role with an empty effective pool.
    // Surface that immediately as a test failure.
    for (const role of ROLES) {
      const seen = new Set<string>();
      for (let i = 0; i < 80; i++) {
        for (const t of pickRoleAwareTraits(role, 2)) seen.add(t);
      }
      expect(seen.size).toBeGreaterThanOrEqual(2);
      for (const t of seen) {
        expect(hasCharacterTraitFlavor(t)).toBe(true);
      }
    }
  });

  it("returns the requested count of distinct trait ids for every role", () => {
    for (const role of ROLES) {
      const traits = pickRoleAwareTraits(role, 2);
      expect(traits).toHaveLength(2);
      expect(new Set(traits).size).toBe(2);
      for (const t of traits) {
        expect(hasCharacterTraitFlavor(t)).toBe(true);
      }
    }
  });

  it("returns an empty array for count <= 0", () => {
    expect(pickRoleAwareTraits("tycoon", 0)).toEqual([]);
    expect(pickRoleAwareTraits("tycoon", -1)).toEqual([]);
  });

  it("favors role-thematic traits (preachers skew pious/idealistic, gang lieutenants skew brutal/ruthless)", () => {
    const preacherTraits: string[] = [];
    const gangTraits: string[] = [];
    for (let i = 0; i < 200; i++) {
      preacherTraits.push(...pickRoleAwareTraits("preacher", 2));
      gangTraits.push(...pickRoleAwareTraits("gang_lieutenant", 2));
    }
    expect(preacherTraits).toContain("pious");
    expect(preacherTraits).toContain("idealistic");
    expect(preacherTraits).not.toContain("greedy");
    expect(gangTraits).toContain("brutal");
    expect(gangTraits).toContain("ruthless");
    expect(gangTraits).not.toContain("pious");
  });
});

describe("spawnNamedCharacter", () => {
  it("auto-attaches 1–2 role-aware traits when traits opt is undefined", () => {
    const state = makeState();
    for (const role of ROLES) {
      const npc = spawnNamedCharacter(state, role);
      expect(Array.isArray(npc.traits)).toBe(true);
      expect(npc.traits.length).toBeGreaterThanOrEqual(1);
      expect(npc.traits.length).toBeLessThanOrEqual(2);
      for (const t of npc.traits) {
        expect(hasCharacterTraitFlavor(t)).toBe(true);
      }
    }
  });

  it("respects an explicit empty traits array (opt-out)", () => {
    const state = makeState();
    const npc = spawnNamedCharacter(state, "tycoon", { traits: [] });
    expect(npc.traits).toEqual([]);
  });

  it("respects an explicit traits array", () => {
    const state = makeState();
    const npc = spawnNamedCharacter(state, "preacher", { traits: ["pious"] });
    expect(npc.traits).toEqual(["pious"]);
  });

  it("produces a bio that surfaces trait-driven flavor", () => {
    const state = makeState();
    const npc = spawnNamedCharacter(state, "preacher", { traits: ["pious"] });
    expect(typeof npc.backstory).toBe("string");
    expect(npc.backstory.length).toBeGreaterThan(20);
    // The "pious" trait flavor sentence should be present somewhere in the bio.
    // We can't pin the exact string (bio uses several variants) but we can
    // assert that bio differs from a no-trait baseline.
    const blank = spawnNamedCharacter(state, "preacher", { traits: [] });
    expect(npc.backstory).not.toBe(blank.backstory);
  });
});

describe("ensureCharacterTraits", () => {
  it("backfills traits onto a legacy NPC who has none and regenerates the bio", () => {
    const state = makeState();
    // Legacy NPC: no traits, blank bio.
    const legacy: NamedCharacter = {
      id: "legacy-1",
      name: "Old Friend",
      role: "preacher",
      factionId: null,
      districtId: null,
      status: "active",
      notoriety: 30,
      traits: [],
      backstory: "blank",
      bornYear: 2020,
      introducedYear: 2055,
      lastSeenYear: 2059,
      history: [],
    };
    state.namedCharacters = [legacy];
    ensureCharacterTraits(state, "legacy-1", 2);
    const updated = state.namedCharacters.find((c) => c.id === "legacy-1");
    expect(updated).toBeTruthy();
    expect(updated!.traits.length).toBeGreaterThanOrEqual(1);
    expect(updated!.backstory).not.toBe("blank");
  });

  it("is idempotent: leaves NPCs with traits untouched", () => {
    const state = makeState();
    const seeded: NamedCharacter = {
      id: "seeded-1",
      name: "Seeded",
      role: "tycoon",
      factionId: null,
      districtId: null,
      status: "active",
      notoriety: 30,
      traits: ["greedy"],
      backstory: "fixed",
      bornYear: 2020,
      introducedYear: 2055,
      lastSeenYear: 2059,
      history: [],
    };
    state.namedCharacters = [seeded];
    ensureCharacterTraits(state, "seeded-1", 2);
    const updated = state.namedCharacters.find((c) => c.id === "seeded-1");
    expect(updated!.traits).toEqual(["greedy"]);
    expect(updated!.backstory).toBe("fixed");
  });

  it("no-ops on missing character ids", () => {
    const state = makeState();
    expect(() => ensureCharacterTraits(state, "does-not-exist", 2)).not.toThrow();
  });
});

describe("getOrPickActiveNPC", () => {
  it("backfills traits onto an existing NPC who has none when surfaced", () => {
    const state = makeState();
    const legacy: NamedCharacter = {
      id: "legacy-2",
      name: "Old Crew Boss",
      role: "gang_lieutenant",
      factionId: null,
      districtId: null,
      status: "active",
      notoriety: 80,
      traits: [],
      backstory: "blank",
      bornYear: 2020,
      introducedYear: 2055,
      lastSeenYear: 2059,
      history: [],
    };
    state.namedCharacters = [legacy];
    // spawnChance=0 forces the existing-NPC branch.
    const picked = getOrPickActiveNPC(state, "gang_lieutenant", { spawnChance: 0 });
    expect(picked.id).toBe("legacy-2");
    expect(picked.traits.length).toBeGreaterThanOrEqual(1);
    expect(picked.backstory).not.toBe("blank");
    // The state's own list is also updated (not just the returned copy).
    const stored = state.namedCharacters.find((c) => c.id === "legacy-2");
    expect(stored!.traits.length).toBeGreaterThanOrEqual(1);
  });
});

describe("event hookups attach traits to surfaced NPCs", () => {
  let randSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // Force every probability gate to fire and pick the first option in
    // any role/line array. Use 0.0 which is < every gate threshold.
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    randSpy.mockRestore();
  });

  it("maybeEmitWeeklyNotable: returns a message and the surfaced NPC has traits + trait-driven bio", () => {
    const state = makeState();
    const msg = maybeEmitWeeklyNotable(state);
    expect(msg).not.toBeNull();
    const list = state.namedCharacters ?? [];
    expect(list.length).toBeGreaterThan(0);
    const npc = list[0]!;
    expect(npc.traits.length).toBeGreaterThanOrEqual(1);
    expect(npc.backstory.length).toBeGreaterThan(20);
  });

  it("maybeEmitFactionFlashpoint: returns a message and tags the NPC", () => {
    const fac: Faction = {
      id: "fac-1",
      name: "Iron Reform Bloc",
      description: "",
      influence: 50,
      loyalty: 50,
      threat: 30,
      type: "criminal",
      isActive: true,
    } as Faction;
    const state = makeState({ factions: [fac] });
    const msg = maybeEmitFactionFlashpoint(state);
    expect(msg).not.toBeNull();
    expect(msg!.body).toContain("Iron Reform Bloc");
    const npc = (state.namedCharacters ?? [])[0]!;
    expect(npc.traits.length).toBeGreaterThanOrEqual(1);
  });

  it("maybeEmitUndercityRumor: returns a message and tags the NPC", () => {
    const state = makeState();
    const msg = maybeEmitUndercityRumor(state);
    expect(msg).not.toBeNull();
    const npc = (state.namedCharacters ?? [])[0]!;
    expect(npc.traits.length).toBeGreaterThanOrEqual(1);
    expect(npc.backstory.length).toBeGreaterThan(20);
  });

  it("maybeEmitMarketMove: returns a message and tags the NPC", () => {
    const state = makeState();
    const msg = maybeEmitMarketMove(state);
    expect(msg).not.toBeNull();
    const npc = (state.namedCharacters ?? [])[0]!;
    expect(npc.traits.length).toBeGreaterThanOrEqual(1);
    expect(["tycoon", "union_boss"]).toContain(npc.role);
  });

  it("event hookups bail out (return null) when probability gate rejects", () => {
    randSpy.mockReturnValue(0.99);
    const state = makeState();
    expect(maybeEmitWeeklyNotable(state)).toBeNull();
    expect(maybeEmitFactionFlashpoint(state)).toBeNull();
    expect(maybeEmitUndercityRumor(state)).toBeNull();
    expect(maybeEmitMarketMove(state)).toBeNull();
  });

  it("event hookups return null when gameDate is missing", () => {
    randSpy.mockReturnValue(0);
    const state = makeState({ gameDate: undefined as unknown as GameState["gameDate"] });
    expect(maybeEmitWeeklyNotable(state)).toBeNull();
    expect(maybeEmitFactionFlashpoint(state)).toBeNull();
    expect(maybeEmitUndercityRumor(state)).toBeNull();
    expect(maybeEmitMarketMove(state)).toBeNull();
  });
});

describe("trait sim-effect coverage guard (task #60)", () => {
  // Build the union of all trait ids that the game can attach to a named
  // character via ROLE_TRAIT_POOL. Any id in this set MUST have at least
  // one entry in NAMED_CHARACTER_TRAIT_EFFECTS (district / faction / city)
  // — otherwise the trait is cosmetic-only and silently no-ops on the sim,
  // which is exactly the regression this guard exists to catch.
  // Derive the role list directly from ROLE_TRAIT_POOL so adding a new
  // CharacterRole + pool to the engine cannot silently bypass this guard.
  // (Architect-flagged: the file-level ROLES const is hand-maintained and
  // would be a manual sync point.)
  const POOL_ROLES = Object.keys(ROLE_TRAIT_POOL) as CharacterRole[];

  function collectPoolTraitIds(): string[] {
    const all = new Set<string>();
    for (const role of POOL_ROLES) {
      for (const t of ROLE_TRAIT_POOL[role] ?? []) all.add(t);
    }
    return [...all].sort();
  }

  function hasAnyEffect(trait: string): boolean {
    return (
      Object.prototype.hasOwnProperty.call(NAMED_CHARACTER_TRAIT_EFFECTS.district, trait) ||
      Object.prototype.hasOwnProperty.call(NAMED_CHARACTER_TRAIT_EFFECTS.faction, trait) ||
      Object.prototype.hasOwnProperty.call(NAMED_CHARACTER_TRAIT_EFFECTS.city, trait)
    );
  }

  it("every trait id in ROLE_TRAIT_POOL has at least one sim effect entry", () => {
    const pool = collectPoolTraitIds();
    expect(pool.length).toBeGreaterThan(0);
    const orphans = pool.filter((t) => !hasAnyEffect(t));
    // Failing message lists every offending trait id so the fix is obvious.
    expect(
      orphans,
      `Trait ids in ROLE_TRAIT_POOL with no entry in NAMED_CHARACTER_TRAIT_EFFECTS.{district,faction,city}: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  it("every trait id used in NAMED_CHARACTER_TRAIT_EFFECTS is reachable through ROLE_TRAIT_POOL", () => {
    // Reverse drift: an effect entry that no role can ever pick is dead
    // weight. Surface it so it can either be wired into a role pool or
    // pruned. (Treated as a soft expectation via a non-empty pool list.)
    const pool = new Set(collectPoolTraitIds());
    const effectTraits = new Set<string>([
      ...Object.keys(NAMED_CHARACTER_TRAIT_EFFECTS.district),
      ...Object.keys(NAMED_CHARACTER_TRAIT_EFFECTS.faction),
      ...Object.keys(NAMED_CHARACTER_TRAIT_EFFECTS.city),
    ]);
    const stranded = [...effectTraits].filter((t) => !pool.has(t)).sort();
    expect(
      stranded,
      `Trait ids with sim effects but unreachable from any ROLE_TRAIT_POOL: ${stranded.join(", ")}`,
    ).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NAMED_CHARACTER_TRAIT_EFFECTS,
  computeDistrictTraitMultipliers,
  computeFactionTraitMultipliers,
  computeCityTraitMultipliers,
  listFactionTraitContributions,
  listCityTraitContributions,
  applyTraitMultiplierToDelta,
} from "@/engine/namedCharacters";
import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import type { GameState, NamedCharacter, Faction, ContractInstance } from "@/engine/types";

function makeNPC(overrides: Partial<NamedCharacter>): NamedCharacter {
  return {
    id: "npc-test",
    name: "Test NPC",
    role: "gang_lieutenant",
    factionId: null,
    districtId: null,
    status: "active",
    notoriety: 50,
    traits: [],
    backstory: "",
    bornYear: 2030,
    introducedYear: 2055,
    lastSeenYear: 2060,
    history: [],
    ...overrides,
  };
}

function minimalState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameDate: { year: 2060, month: 6, day: 15, hour: 8 },
    totalTicks: 100,
    namedCharacters: [],
    factions: [],
    messages: [],
    ...overrides,
  } as unknown as GameState;
}

describe("NAMED_CHARACTER_TRAIT_EFFECTS table", () => {
  it("documents at least 40 traits with measurable effects (task #57 expansion of tasks #52/#54/#56)", () => {
    // Task #52 wired the first five trait → sim hooks; task #54 added
    // at least 8 more for a combined floor of 13; task #56 covered most
    // remaining cosmetic-only ids; task #57 finished the last batch
    // (emotional, talkative, quiet, thrill_seeking, intelligent,
    // creative, optimistic, curious, competitive), pushing total unique
    // ids past 40. Task #55 also added a `city` table on top of
    // district/faction.
    const allKeys = new Set<string>([
      ...Object.keys(NAMED_CHARACTER_TRAIT_EFFECTS.district),
      ...Object.keys(NAMED_CHARACTER_TRAIT_EFFECTS.faction),
      ...Object.keys(NAMED_CHARACTER_TRAIT_EFFECTS.city),
    ]);
    expect(allKeys.size).toBeGreaterThanOrEqual(40);
    // Soft ceiling so the table doesn't silently bloat past the design intent
    // (~44 unique trait ids in ROLE_TRAIT_POOL).
    expect(allKeys.size).toBeLessThanOrEqual(45);
  });

  it("keeps every per-trait multiplier inside the ±20% balance window", () => {
    const all = [
      ...Object.values(NAMED_CHARACTER_TRAIT_EFFECTS.district),
      ...Object.values(NAMED_CHARACTER_TRAIT_EFFECTS.faction),
      ...Object.values(NAMED_CHARACTER_TRAIT_EFFECTS.city),
    ];
    for (const fx of all) {
      for (const v of Object.values(fx) as number[]) {
        expect(v).toBeGreaterThanOrEqual(0.8);
        expect(v).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it("wires at least 4 trait ids into the new task #55 dimensions (threat + contract delay)", () => {
    const threatTraits = Object.entries(NAMED_CHARACTER_TRAIT_EFFECTS.faction)
      .filter(([, fx]) => (fx as { threatMult?: number }).threatMult !== undefined)
      .map(([k]) => k);
    // Task #58 added eventSpawnMult to the city table, so we now filter
    // by contractDelayMult specifically rather than just counting keys.
    const contractTraits = Object.entries(NAMED_CHARACTER_TRAIT_EFFECTS.city)
      .filter(([, fx]) => (fx as { contractDelayMult?: number }).contractDelayMult !== undefined)
      .map(([k]) => k);
    expect(threatTraits.length).toBeGreaterThanOrEqual(4);
    expect(contractTraits.length).toBeGreaterThanOrEqual(4);
  });

  it("wires at least 4 trait ids into the task #58 dimension (event spawn)", () => {
    const eventTraits = Object.entries(NAMED_CHARACTER_TRAIT_EFFECTS.city)
      .filter(([, fx]) => (fx as { eventSpawnMult?: number }).eventSpawnMult !== undefined)
      .map(([k]) => k);
    expect(eventTraits.length).toBeGreaterThanOrEqual(4);
  });
});

describe("computeDistrictTraitMultipliers", () => {
  it("returns identity multipliers when no NPCs are anchored to the district", () => {
    const state = minimalState();
    const m = computeDistrictTraitMultipliers(state, "d1");
    expect(m).toEqual({ crimeMult: 1, unrestMult: 1, gangInfluenceMult: 1 });
  });

  it("ruthless district NPC raises the crime multiplier", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "ruth", districtId: "d1", traits: ["ruthless"] }),
      ],
    });
    const m = computeDistrictTraitMultipliers(state, "d1");
    expect(m.crimeMult).toBeCloseTo(1.15, 5);
    expect(m.unrestMult).toBe(1);
    expect(m.gangInfluenceMult).toBe(1);
  });

  it("brutal district NPC raises the gang-influence multiplier only", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "br", districtId: "d1", traits: ["brutal"] }),
      ],
    });
    const m = computeDistrictTraitMultipliers(state, "d1");
    expect(m.gangInfluenceMult).toBeCloseTo(1.15, 5);
    expect(m.crimeMult).toBe(1);
  });

  it("charismatic and compassionate NPCs push unrest in opposite directions", () => {
    const charisma = computeDistrictTraitMultipliers(
      minimalState({ namedCharacters: [makeNPC({ districtId: "d1", traits: ["charismatic"] })] }),
      "d1",
    );
    const compass = computeDistrictTraitMultipliers(
      minimalState({ namedCharacters: [makeNPC({ districtId: "d1", traits: ["compassionate"] })] }),
      "d1",
    );
    expect(charisma.unrestMult).toBeGreaterThan(1);
    expect(compass.unrestMult).toBeLessThan(1);
  });

  it("ignores NPCs in other districts and inactive NPCs", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "wrong-district", districtId: "d2", traits: ["ruthless"] }),
        makeNPC({ id: "jailed", districtId: "d1", status: "jailed", traits: ["ruthless"] }),
        makeNPC({ id: "dead", districtId: "d1", status: "dead", traits: ["ruthless"] }),
      ],
    });
    expect(computeDistrictTraitMultipliers(state, "d1")).toEqual({
      crimeMult: 1,
      unrestMult: 1,
      gangInfluenceMult: 1,
    });
  });

  it("clamps aggregated multipliers to ±35% even with many trait-bearing NPCs", () => {
    // Six ruthless NPCs would otherwise compound to 1.15^6 ≈ 2.31x — clamp to 1.35.
    const state = minimalState({
      namedCharacters: Array.from({ length: 6 }, (_, i) =>
        makeNPC({ id: `n${i}`, districtId: "d1", traits: ["ruthless"] }),
      ),
    });
    const m = computeDistrictTraitMultipliers(state, "d1");
    expect(m.crimeMult).toBeLessThanOrEqual(1.35);
    expect(m.crimeMult).toBeGreaterThanOrEqual(1.0);
  });

  // ── task #54: new trait hooks ────────────────────────────────────────
  it("greedy district NPC raises the crime multiplier (task #54)", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "g", districtId: "d1", role: "tycoon", traits: ["greedy"] }),
      ],
    });
    const m = computeDistrictTraitMultipliers(state, "d1");
    expect(m.crimeMult).toBeGreaterThan(1);
    expect(m.unrestMult).toBe(1);
    expect(m.gangInfluenceMult).toBe(1);
  });

  it("paranoid informant in a district raises the unrest multiplier (task #54)", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "p", districtId: "d1", role: "informant", traits: ["paranoid"] }),
      ],
    });
    const m = computeDistrictTraitMultipliers(state, "d1");
    expect(m.unrestMult).toBeGreaterThan(1);
    expect(m.crimeMult).toBe(1);
  });

  it("ethical and community_minded NPCs dampen crime/unrest growth (task #54)", () => {
    const ethical = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [makeNPC({ districtId: "d1", traits: ["ethical"] })],
      }),
      "d1",
    );
    const community = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [makeNPC({ districtId: "d1", traits: ["community_minded"] })],
      }),
      "d1",
    );
    expect(ethical.crimeMult).toBeLessThan(1);
    expect(community.unrestMult).toBeLessThan(1);
  });

  it("aggressive lieutenant pushes gang influence up without touching crime/unrest (task #54)", () => {
    const m = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "gang_lieutenant", traits: ["aggressive"] }),
        ],
      }),
      "d1",
    );
    expect(m.gangInfluenceMult).toBeGreaterThan(1);
    expect(m.crimeMult).toBe(1);
    expect(m.unrestMult).toBe(1);
  });

  // ── task #56: cover remaining cosmetic-only traits ───────────────────
  it("cunning district NPC raises the crime multiplier (task #56)", () => {
    const m = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "informant", traits: ["cunning"] }),
        ],
      }),
      "d1",
    );
    expect(m.crimeMult).toBeGreaterThan(1);
    expect(m.unrestMult).toBe(1);
    expect(m.gangInfluenceMult).toBe(1);
  });

  it("reckless district NPC raises the unrest multiplier (task #56)", () => {
    const m = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "agitator", traits: ["reckless"] }),
        ],
      }),
      "d1",
    );
    expect(m.unrestMult).toBeGreaterThan(1);
    expect(m.crimeMult).toBe(1);
  });

  it("stoic and friendly NPCs dampen unrest growth on the block (task #56)", () => {
    const stoic = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [makeNPC({ districtId: "d1", traits: ["stoic"] })],
      }),
      "d1",
    );
    const friendly = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [makeNPC({ districtId: "d1", traits: ["friendly"] })],
      }),
      "d1",
    );
    expect(stoic.unrestMult).toBeLessThan(1);
    expect(friendly.unrestMult).toBeLessThan(1);
  });

  it("calculating lieutenant pushes gang influence up without touching crime/unrest (task #56)", () => {
    const m = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({
            districtId: "d1",
            role: "gang_lieutenant",
            traits: ["calculating"],
          }),
        ],
      }),
      "d1",
    );
    expect(m.gangInfluenceMult).toBeGreaterThan(1);
    expect(m.crimeMult).toBe(1);
    expect(m.unrestMult).toBe(1);
  });

  // ── task #57: cover the last cosmetic-only traits ────────────────────
  it("emotional and talkative district NPCs both raise the unrest multiplier (task #57)", () => {
    const emotional = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "agitator", traits: ["emotional"] }),
        ],
      }),
      "d1",
    );
    const talkative = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "celebrity", traits: ["talkative"] }),
        ],
      }),
      "d1",
    );
    expect(emotional.unrestMult).toBeGreaterThan(1);
    expect(talkative.unrestMult).toBeGreaterThan(1);
    expect(emotional.crimeMult).toBe(1);
    expect(talkative.crimeMult).toBe(1);
  });

  it("thrill-seeking district NPC raises the crime multiplier (task #57)", () => {
    const m = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({
            districtId: "d1",
            role: "gang_lieutenant",
            traits: ["thrill_seeking"],
          }),
        ],
      }),
      "d1",
    );
    expect(m.crimeMult).toBeGreaterThan(1);
    expect(m.unrestMult).toBe(1);
    expect(m.gangInfluenceMult).toBe(1);
  });

  it("quiet, creative, and optimistic NPCs dampen unrest growth on the block (task #57)", () => {
    const quiet = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "informant", traits: ["quiet"] }),
        ],
      }),
      "d1",
    );
    const creative = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "celebrity", traits: ["creative"] }),
        ],
      }),
      "d1",
    );
    const optimistic = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "celebrity", traits: ["optimistic"] }),
        ],
      }),
      "d1",
    );
    expect(quiet.unrestMult).toBeLessThan(1);
    expect(creative.unrestMult).toBeLessThan(1);
    expect(optimistic.unrestMult).toBeLessThan(1);
  });

  it("intelligent and curious NPCs dampen the crime multiplier (task #57)", () => {
    const intelligent = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "journalist", traits: ["intelligent"] }),
        ],
      }),
      "d1",
    );
    const curious = computeDistrictTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ districtId: "d1", role: "journalist", traits: ["curious"] }),
        ],
      }),
      "d1",
    );
    expect(intelligent.crimeMult).toBeLessThan(1);
    expect(curious.crimeMult).toBeLessThan(1);
    expect(intelligent.unrestMult).toBe(1);
    expect(curious.unrestMult).toBe(1);
  });
});

describe("computeFactionTraitMultipliers", () => {
  it("returns identity when no NPCs are anchored to the faction", () => {
    expect(computeFactionTraitMultipliers(minimalState(), "fac-1")).toEqual({
      loyaltyMult: 1,
      threatMult: 1,
    });
  });

  it("loyal faction NPC raises the loyalty multiplier", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "loyal-1", factionId: "fac-1", traits: ["loyal"] }),
      ],
    });
    const m = computeFactionTraitMultipliers(state, "fac-1");
    expect(m.loyaltyMult).toBeCloseTo(1.20, 5);
    expect(m.threatMult).toBe(1);
  });

  it("ignores NPCs anchored to a different faction", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "loyal-other", factionId: "fac-2", traits: ["loyal"] }),
      ],
    });
    expect(computeFactionTraitMultipliers(state, "fac-1").loyaltyMult).toBe(1);
  });

  // ── task #54: new faction trait hooks ──────────────────────────────
  it("ambitious faction NPC reinforces upward loyalty trends (task #54)", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "amb", factionId: "fac-1", role: "tycoon", traits: ["ambitious"] }),
      ],
    });
    expect(computeFactionTraitMultipliers(state, "fac-1").loyaltyMult).toBeGreaterThan(1);
  });

  it("corrupt faction NPC dampens upward loyalty growth (task #54)", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "cor", factionId: "fac-1", role: "tycoon", traits: ["corrupt"] }),
      ],
    });
    expect(computeFactionTraitMultipliers(state, "fac-1").loyaltyMult).toBeLessThan(1);
  });

  // ── task #56: cover remaining cosmetic-only faction traits ───────────
  it("patriotic faction NPC reinforces upward loyalty trends (task #56)", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "pat", factionId: "fac-1", role: "preacher", traits: ["patriotic"] }),
      ],
    });
    expect(computeFactionTraitMultipliers(state, "fac-1").loyaltyMult).toBeGreaterThan(1);
  });

  it("cynical and distrustful faction NPCs both dampen loyalty growth (task #56)", () => {
    const cynical = computeFactionTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ factionId: "fac-1", role: "journalist", traits: ["cynical"] }),
        ],
      }),
      "fac-1",
    );
    const distrustful = computeFactionTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ factionId: "fac-1", role: "informant", traits: ["distrustful"] }),
        ],
      }),
      "fac-1",
    );
    expect(cynical.loyaltyMult).toBeLessThan(1);
    expect(distrustful.loyaltyMult).toBeLessThan(1);
  });
});

// ── task #55: faction threat trait hooks ──────────────────────────────
describe("computeFactionTraitMultipliers — threat dimension (task #55)", () => {
  it("aggressive faction NPC raises the threat multiplier", () => {
    const m = computeFactionTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ factionId: "fac-1", role: "gang_lieutenant", traits: ["aggressive"] }),
        ],
      }),
      "fac-1",
    );
    expect(m.threatMult).toBeCloseTo(1.15, 5);
    expect(m.loyaltyMult).toBe(1);
  });

  it("ruthless faction NPC raises the threat multiplier", () => {
    const m = computeFactionTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ factionId: "fac-1", role: "gang_lieutenant", traits: ["ruthless"] }),
        ],
      }),
      "fac-1",
    );
    expect(m.threatMult).toBeGreaterThan(1);
  });

  it("reformist and compassionate faction NPCs dampen threat growth", () => {
    const reformist = computeFactionTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ factionId: "fac-1", role: "union_boss", traits: ["reformist"] }),
        ],
      }),
      "fac-1",
    );
    const compassion = computeFactionTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ factionId: "fac-1", role: "agitator", traits: ["compassionate"] }),
        ],
      }),
      "fac-1",
    );
    expect(reformist.threatMult).toBeLessThan(1);
    expect(compassion.threatMult).toBeLessThan(1);
  });

  it("vengeful faction NPC raises both loyalty AND threat multipliers", () => {
    const m = computeFactionTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ factionId: "fac-1", role: "gang_lieutenant", traits: ["vengeful"] }),
        ],
      }),
      "fac-1",
    );
    expect(m.loyaltyMult).toBeGreaterThan(1);
    expect(m.threatMult).toBeGreaterThan(1);
  });

  it("competitive faction NPC raises the threat multiplier (task #57)", () => {
    const m = computeFactionTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({
            factionId: "fac-1",
            role: "gang_lieutenant",
            traits: ["competitive"],
          }),
        ],
      }),
      "fac-1",
    );
    expect(m.threatMult).toBeGreaterThan(1);
    expect(m.loyaltyMult).toBe(1);
  });

  it("ignores faction-threat NPCs anchored to a different faction", () => {
    expect(
      computeFactionTraitMultipliers(
        minimalState({
          namedCharacters: [
            makeNPC({ factionId: "fac-2", role: "gang_lieutenant", traits: ["aggressive"] }),
          ],
        }),
        "fac-1",
      ).threatMult,
    ).toBe(1);
  });
});

// ── task #55: city-wide contract delay trait hooks ────────────────────
describe("computeCityTraitMultipliers — contract delay dimension (task #55)", () => {
  it("returns identity when no NPCs are present", () => {
    expect(computeCityTraitMultipliers(minimalState())).toEqual({
      contractDelayMult: 1,
      eventSpawnMult: 1,
    });
  });

  it("corrupt NPC pushes the contract delay multiplier upward", () => {
    const m = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ id: "cor", role: "tycoon", traits: ["corrupt"] }),
        ],
      }),
    );
    expect(m.contractDelayMult).toBeCloseTo(1.15, 5);
  });

  it("greedy and cunning NPCs both push contract delay up", () => {
    const greedy = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: [makeNPC({ role: "tycoon", traits: ["greedy"] })],
      }),
    );
    const cunning = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: [makeNPC({ role: "informant", traits: ["cunning"] })],
      }),
    );
    expect(greedy.contractDelayMult).toBeGreaterThan(1);
    expect(cunning.contractDelayMult).toBeGreaterThan(1);
  });

  it("ethical and industrious NPCs cut the contract delay multiplier", () => {
    const ethical = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: [makeNPC({ role: "journalist", traits: ["ethical"] })],
      }),
    );
    const industrious = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: [makeNPC({ role: "tycoon", traits: ["industrious"] })],
      }),
    );
    expect(ethical.contractDelayMult).toBeLessThan(1);
    expect(industrious.contractDelayMult).toBeLessThan(1);
  });

  it("aggregates from every active NPC regardless of district/faction anchor", () => {
    const m = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ id: "a", districtId: "d1", role: "tycoon", traits: ["corrupt"] }),
          makeNPC({ id: "b", factionId: "fac-1", role: "tycoon", traits: ["greedy"] }),
        ],
      }),
    );
    // 1.15 * 1.10 ≈ 1.265, well within the ±35% clamp.
    expect(m.contractDelayMult).toBeCloseTo(1.15 * 1.10, 5);
  });

  it("ignores inactive NPCs", () => {
    expect(
      computeCityTraitMultipliers(
        minimalState({
          namedCharacters: [
            makeNPC({ status: "jailed", role: "tycoon", traits: ["corrupt"] }),
            makeNPC({ status: "dead", role: "tycoon", traits: ["greedy"] }),
          ],
        }),
      ).contractDelayMult,
    ).toBe(1);
  });

  it("clamps aggregated multipliers to ±35%", () => {
    const m = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: Array.from({ length: 6 }, (_, i) =>
          makeNPC({ id: `c${i}`, role: "tycoon", traits: ["corrupt"] }),
        ),
      }),
    );
    expect(m.contractDelayMult).toBeLessThanOrEqual(1.35);
    expect(m.contractDelayMult).toBeGreaterThan(1);
  });
});

// ── task #58: city-wide event spawn rate trait hooks ──────────────────
describe("computeCityTraitMultipliers — event spawn dimension (task #58)", () => {
  it("returns identity (1) when no NPCs are present", () => {
    expect(computeCityTraitMultipliers(minimalState()).eventSpawnMult).toBe(1);
  });

  it("paranoid NPC pushes the event spawn multiplier upward", () => {
    const m = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: [makeNPC({ id: "p", role: "informant", traits: ["paranoid"] })],
      }),
    );
    expect(m.eventSpawnMult).toBeCloseTo(1.15, 5);
  });

  it("talkative and charismatic NPCs both push event spawn up", () => {
    const talky = computeCityTraitMultipliers(
      minimalState({ namedCharacters: [makeNPC({ role: "preacher", traits: ["talkative"] })] }),
    );
    const cha = computeCityTraitMultipliers(
      minimalState({ namedCharacters: [makeNPC({ role: "agitator", traits: ["charismatic"] })] }),
    );
    expect(talky.eventSpawnMult).toBeGreaterThan(1);
    expect(cha.eventSpawnMult).toBeGreaterThan(1);
  });

  it("quiet and stoic NPCs cut the event spawn multiplier", () => {
    const quiet = computeCityTraitMultipliers(
      minimalState({ namedCharacters: [makeNPC({ role: "tycoon", traits: ["quiet"] })] }),
    );
    const stoic = computeCityTraitMultipliers(
      minimalState({ namedCharacters: [makeNPC({ role: "preacher", traits: ["stoic"] })] }),
    );
    expect(quiet.eventSpawnMult).toBeLessThan(1);
    expect(stoic.eventSpawnMult).toBeLessThan(1);
  });

  it("aggregates from every active NPC regardless of district/faction anchor", () => {
    const m = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: [
          makeNPC({ id: "a", districtId: "d1", role: "informant", traits: ["paranoid"] }),
          makeNPC({ id: "b", factionId: "fac-1", role: "preacher", traits: ["talkative"] }),
        ],
      }),
    );
    // 1.15 * 1.15 = 1.3225, inside the ±35% clamp.
    expect(m.eventSpawnMult).toBeCloseTo(1.15 * 1.15, 5);
  });

  it("ignores inactive NPCs", () => {
    expect(
      computeCityTraitMultipliers(
        minimalState({
          namedCharacters: [
            makeNPC({ status: "jailed", role: "informant", traits: ["paranoid"] }),
            makeNPC({ status: "dead", role: "preacher", traits: ["talkative"] }),
          ],
        }),
      ).eventSpawnMult,
    ).toBe(1);
  });

  it("clamps aggregated multipliers to ±35%", () => {
    const m = computeCityTraitMultipliers(
      minimalState({
        namedCharacters: Array.from({ length: 6 }, (_, i) =>
          makeNPC({ id: `p${i}`, role: "informant", traits: ["paranoid"] }),
        ),
      }),
    );
    expect(m.eventSpawnMult).toBeLessThanOrEqual(1.35);
    expect(m.eventSpawnMult).toBeGreaterThan(1);
  });
});

// End-to-end: traits actually change spawn outcomes. We mock Math.random
// so the FIRST call (the spawn-gate roll) returns a value lodged in the
// gap between the default gate and the trait-shifted gate, then assert
// the gate flips. Subsequent random calls inside the helper internals
// (pickTraitFlavoredLine, getOrPickActiveNPC, etc.) get a safe mid-range
// default so that adding/reordering internal randomness later doesn't
// silently shift the gate roll under the test's feet (architect feedback).
describe("event spawn helpers consume eventSpawnMult (task #58 acceptance)", () => {
  let randSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    randSpy = vi.spyOn(Math, "random");
  });
  afterEach(() => randSpy?.mockRestore());

  // Seed exactly one queued value for the gate roll, then a stable
  // mid-range fallback for everything downstream.
  function seedGate(gateRoll: number) {
    randSpy.mockReset();
    randSpy.mockReturnValueOnce(gateRoll).mockReturnValue(0.3);
  }

  it("paranoid NPC lifts the maybeEmitWeeklyNotable gate (0.6 → ~0.69) so a 0.65 roll now spawns", () => {
    // Default gate = 0.6. 0.65 > 0.6 → control returns null.
    seedGate(0.65);
    expect(maybeEmitWeeklyNotable(minimalState())).toBeNull();

    // With paranoid (×1.15) the gate moves to 0.69. 0.65 > 0.69 is false
    // → spawn proceeds and a non-null message comes out.
    seedGate(0.65);
    const boosted = minimalState({
      namedCharacters: [
        makeNPC({ id: "p", name: "P", role: "informant", traits: ["paranoid"], notoriety: 80 }),
      ],
    });
    const msg = maybeEmitWeeklyNotable(boosted);
    expect(msg).not.toBeNull();
    expect(msg!.body.length).toBeGreaterThan(10);
  });

  it("quiet NPC dampens the maybeEmitWeeklyNotable gate (0.6 → 0.54) so a 0.57 roll now skips", () => {
    // Default gate = 0.6. 0.57 > 0.6 is false → control spawns.
    seedGate(0.57);
    expect(maybeEmitWeeklyNotable(minimalState())).not.toBeNull();

    // With quiet (×0.90) the gate drops to 0.54. 0.57 > 0.54 → null.
    seedGate(0.57);
    const damped = minimalState({
      namedCharacters: [
        makeNPC({ id: "q", name: "Q", role: "tycoon", traits: ["quiet"], notoriety: 80 }),
      ],
    });
    expect(maybeEmitWeeklyNotable(damped)).toBeNull();
  });

  it("talkative NPC lifts the maybeEmitFactionFlashpoint gate (0.45 → ~0.52) so a 0.48 roll now spawns", () => {
    seedGate(0.48);
    const ctrl = minimalState({
      factions: [{ id: "fac-1", name: "Iron Crew", isActive: true } as unknown as Faction],
    });
    expect(maybeEmitFactionFlashpoint(ctrl)).toBeNull();

    seedGate(0.48);
    const boosted = minimalState({
      namedCharacters: [
        makeNPC({ id: "t", name: "T", role: "preacher", traits: ["talkative"], notoriety: 80 }),
      ],
      factions: [{ id: "fac-1", name: "Iron Crew", isActive: true } as unknown as Faction],
    });
    expect(maybeEmitFactionFlashpoint(boosted)).not.toBeNull();
  });

  it("paranoid NPC lifts the maybeEmitUndercityRumor gate (0.35 → ~0.40) so a 0.38 roll now spawns", () => {
    // Default gate = 0.35. 0.38 > 0.35 → control returns null.
    seedGate(0.38);
    expect(maybeEmitUndercityRumor(minimalState())).toBeNull();

    // With paranoid (×1.15) gate becomes ~0.4025. 0.38 > 0.4025 is false → spawn.
    seedGate(0.38);
    const boosted = minimalState({
      namedCharacters: [
        makeNPC({ id: "p", name: "P", role: "informant", traits: ["paranoid"], notoriety: 80 }),
      ],
    });
    expect(maybeEmitUndercityRumor(boosted)).not.toBeNull();
  });

  it("quiet NPC dampens the maybeEmitMarketMove gate (0.5 → 0.45) so a 0.47 roll now skips", () => {
    // Default gate = 0.5. 0.47 > 0.5 is false → control spawns.
    seedGate(0.47);
    expect(maybeEmitMarketMove(minimalState())).not.toBeNull();

    // With quiet (×0.90) gate drops to 0.45. 0.47 > 0.45 → null.
    seedGate(0.47);
    const damped = minimalState({
      namedCharacters: [
        makeNPC({ id: "q", name: "Q", role: "tycoon", traits: ["quiet"], notoriety: 80 }),
      ],
    });
    expect(maybeEmitMarketMove(damped)).toBeNull();
  });
});

describe("applyTraitMultiplierToDelta", () => {
  it("scales positive deltas by the multiplier", () => {
    expect(applyTraitMultiplierToDelta(2, 1.15)).toBeCloseTo(2.3, 5);
  });

  it("passes negative (improvement) deltas through unchanged", () => {
    expect(applyTraitMultiplierToDelta(-3, 1.15)).toBe(-3);
    expect(applyTraitMultiplierToDelta(-3, 0.85)).toBe(-3);
  });

  it("passes zero deltas through unchanged", () => {
    expect(applyTraitMultiplierToDelta(0, 1.15)).toBe(0);
  });
});

describe("traits produce different sim deltas via runTick (acceptance)", () => {
  // Build two otherwise-identical states differing only in one NPC's
  // trait, run a tick on each, and assert the resulting district stats
  // diverge. This is the vitest case called out in task #52's
  // "Done looks like" checklist.
  function stateWithDistrictNPC(traits: string[]): GameState {
    const base = createInitialState();
    // Stage the first district to actively *worsen* this tick so the
    // trait multiplier has a positive crime/unrest/gang delta to scale.
    // Conditions chosen to drive crimeDlt/unrestDlt > 0 in the
    // district loop in formulas.ts.
    base.cityStats.crime = 70;
    base.cityStats.unrest = 50;
    base.districts = base.districts.map((d, i) =>
      i === 0
        ? { ...d, gangInfluence: 60, infraQuality: 30, crime: 40, unrest: 30 }
        : d,
    );
    const targetDistrict = base.districts[0];
    base.namedCharacters = [
      makeNPC({
        id: "npc-anchor",
        role: "gang_lieutenant",
        districtId: targetDistrict.id,
        traits,
      }),
    ];
    return base;
  }

  it("a ruthless district NPC drives a higher crime tick than a no-trait NPC", () => {
    const ruthlessState = stateWithDistrictNPC(["ruthless"]);
    const controlState = stateWithDistrictNPC([]);
    const before = ruthlessState.districts[0].crime;
    expect(controlState.districts[0].crime).toBe(before);

    const ruthlessAfter = runTick(ruthlessState).newState.districts[0].crime;
    const controlAfter = runTick(controlState).newState.districts[0].crime;

    // Both should rise (district worsening conditions), but the
    // ruthless-NPC district should rise *more*.
    expect(ruthlessAfter).toBeGreaterThan(before);
    expect(controlAfter).toBeGreaterThan(before);
    expect(ruthlessAfter).toBeGreaterThan(controlAfter);
  });

  it("a charismatic district NPC drives a higher unrest tick than a compassionate NPC", () => {
    const charismaState = stateWithDistrictNPC(["charismatic"]);
    const compassionState = stateWithDistrictNPC(["compassionate"]);
    const before = charismaState.districts[0].unrest;
    expect(compassionState.districts[0].unrest).toBe(before);

    const charismaAfter = runTick(charismaState).newState.districts[0].unrest;
    const compassionAfter = runTick(compassionState).newState.districts[0].unrest;

    expect(charismaAfter).toBeGreaterThan(compassionAfter);
  });

  it("a loyal faction NPC produces a higher faction loyalty tick than a no-trait NPC", () => {
    function stateWithFactionNPC(traits: string[]): GameState {
      const base = createInitialState();
      // Make the criminal faction's loyalty rise this tick.
      base.cityStats.crime = 70;
      const targetFaction = base.factions.find((f) => f.type === "criminal");
      if (!targetFaction) throw new Error("expected a criminal faction in initial state");
      base.namedCharacters = [
        makeNPC({
          id: "npc-faction",
          role: "gang_lieutenant",
          factionId: targetFaction.id,
          traits,
        }),
      ];
      return base;
    }

    const loyalState = stateWithFactionNPC(["loyal"]);
    const controlState = stateWithFactionNPC([]);
    const targetId = loyalState.factions.find((f: Faction) => f.type === "criminal")!.id;
    const before = loyalState.factions.find((f: Faction) => f.id === targetId)!.loyalty;
    expect(controlState.factions.find((f: Faction) => f.id === targetId)!.loyalty).toBe(before);

    const loyalAfter = runTick(loyalState).newState.factions.find((f: Faction) => f.id === targetId)!.loyalty;
    const controlAfter = runTick(controlState).newState.factions.find((f: Faction) => f.id === targetId)!.loyalty;

    expect(loyalAfter).toBeGreaterThanOrEqual(controlAfter);
    // The loyal NPC must have *strictly* moved the needle vs control.
    expect(loyalAfter - before).toBeGreaterThan(controlAfter - before);
  });

  // ── task #55: end-to-end acceptance for new dimensions ────────────────
  it("an aggressive faction NPC drives a higher faction threat tick than a no-trait NPC", () => {
    function stateWithFactionNPC(traits: string[]): GameState {
      const base = createInitialState();
      // Stage the underclass faction so its threatDlt > 0 this tick
      // (unrest > 60 → +2 threat per the faction loop).
      base.cityStats.unrest = 80;
      const targetFaction = base.factions.find((f) => f.type === "underclass");
      if (!targetFaction) throw new Error("expected an underclass faction in initial state");
      base.namedCharacters = [
        makeNPC({
          id: "npc-threat",
          role: "agitator",
          factionId: targetFaction.id,
          traits,
        }),
      ];
      return base;
    }

    const aggressiveState = stateWithFactionNPC(["aggressive"]);
    const controlState = stateWithFactionNPC([]);
    const targetId = aggressiveState.factions.find((f: Faction) => f.type === "underclass")!.id;
    const before = aggressiveState.factions.find((f: Faction) => f.id === targetId)!.threat;
    expect(controlState.factions.find((f: Faction) => f.id === targetId)!.threat).toBe(before);

    const aggressiveAfter = runTick(aggressiveState).newState.factions.find(
      (f: Faction) => f.id === targetId,
    )!.threat;
    const controlAfter = runTick(controlState).newState.factions.find(
      (f: Faction) => f.id === targetId,
    )!.threat;

    // Both should rise (faction threat trending up), but the aggressive
    // NPC must move the needle further than the control.
    expect(aggressiveAfter).toBeGreaterThan(before);
    expect(controlAfter).toBeGreaterThan(before);
    expect(aggressiveAfter - before).toBeGreaterThan(controlAfter - before);
  });

  it("corrupt city-wide NPCs trigger more contract delays than ethical ones via runTick", () => {
    // Seed a state with many active contracts; mock Math.random so
    // every roll lands on the same value. With identical contracts and
    // identical RNG, the only thing differentiating the two states
    // is the city-wide trait multiplier — so the corrupt-NPC state
    // must have at least as many delays as the ethical-NPC state, and
    // strictly more for *some* delayChance band.
    function seedActiveContract(id: string): ContractInstance {
      return {
        id,
        // ct-modular-housing → delayRisk: 14, contractor: megabuild-corp
        defId: "ct-modular-housing",
        contractorId: "megabuild-corp",
        districtId: "district-residential-1",
        status: "active",
        progress: 10,
        startTick: 0,
        ticksElapsed: 1,
        totalPaid: 0,
        procurementMethod: "openTender",
        delaysOccurred: 0,
        overrunCost: 0,
        events: [],
      } as ContractInstance;
    }

    function stateWithCityNPC(traits: string[]): GameState {
      const base = createInitialState();
      base.activeContracts = Array.from({ length: 12 }, (_, i) =>
        seedActiveContract(`c-${i}`),
      );
      base.namedCharacters = [
        makeNPC({
          id: "city-npc",
          role: "tycoon",
          districtId: null,
          factionId: null,
          traits,
        }),
      ];
      return base;
    }

    // Mock Math.random so every delay roll lands at 0.16. With base
    // delayRisk 14 → 0.14 chance: ethical (×0.90 → 0.126) stays under
    // 0.16 (no delay), corrupt (×1.15 → 0.161) sits just above 0.16
    // (delay triggers). Other Math.random callsites in the loop are
    // also pinned, but they're symmetric across both runs and so
    // wash out.
    const originalRandom = Math.random;
    try {
      Math.random = () => 0.16;
      const corruptState = stateWithCityNPC(["corrupt"]);
      const ethicalState = stateWithCityNPC(["ethical"]);

      const corruptResult = runTick(corruptState).newState;
      const ethicalResult = runTick(ethicalState).newState;

      const corruptDelays = corruptResult.activeContracts.reduce(
        (sum: number, c: ContractInstance) => sum + c.delaysOccurred,
        0,
      );
      const ethicalDelays = ethicalResult.activeContracts.reduce(
        (sum: number, c: ContractInstance) => sum + c.delaysOccurred,
        0,
      );

      // Corrupt NPCs must produce strictly more delays than ethical ones
      // at this RNG band. Both should still be in valid ranges.
      expect(corruptDelays).toBeGreaterThan(ethicalDelays);
      expect(ethicalDelays).toBe(0);
      expect(corruptDelays).toBeGreaterThan(0);
    } finally {
      Math.random = originalRandom;
    }
  });

  // ── task #64: end-to-end runTick acceptance for the four remaining
  //             city-wide contract-delay traits wired in task #55 ────────
  //
  // Task #55 wired six city-wide traits into delayChance: corrupt /
  // greedy / cunning / manipulative as amplifiers and ethical /
  // industrious as dampeners. The corrupt-vs-ethical pair above already
  // exercises one amplifier and one dampener through `runTick`. The
  // remaining four (greedy, cunning, manipulative, industrious) only
  // had table-level assertions, so a future refactor could disconnect
  // them from the contract-delay math without any test failing. The
  // tests below reuse the same Math.random-pinned pattern but compare
  // each trait against a no-trait control so the wiring is locked in
  // end-to-end.
  describe("task #64: remaining contract-delay traits each diverge from a no-trait control via runTick", () => {
    function seedActiveContract(id: string): ContractInstance {
      return {
        id,
        // ct-modular-housing → delayRisk: 14, contractor: megabuild-corp
        defId: "ct-modular-housing",
        contractorId: "megabuild-corp",
        districtId: "district-residential-1",
        status: "active",
        progress: 10,
        startTick: 0,
        ticksElapsed: 1,
        totalPaid: 0,
        procurementMethod: "openTender",
        delaysOccurred: 0,
        overrunCost: 0,
        events: [],
      } as ContractInstance;
    }

    function stateWithCityNPC(traits: string[]): GameState {
      const base = createInitialState();
      base.activeContracts = Array.from({ length: 12 }, (_, i) =>
        seedActiveContract(`c-${i}`),
      );
      base.namedCharacters = traits.length
        ? [
            makeNPC({
              id: "city-npc",
              role: "tycoon",
              districtId: null,
              factionId: null,
              traits,
            }),
          ]
        : [];
      return base;
    }

    function totalDelays(s: GameState): number {
      return s.activeContracts.reduce(
        (sum: number, c: ContractInstance) => sum + c.delaysOccurred,
        0,
      );
    }

    // Amplifier band: base delayChance = 14/100 = 0.14, amplified by
    // ×1.10 → 0.154. Pinning Math.random at 0.15 means the no-trait
    // control (0.15 < 0.14 → false) sees zero delays while a ×1.10
    // amplifier (0.15 < 0.154 → true) delays every contract. This isolates
    // the trait multiplier as the single cause of the divergence.
    const AMPLIFIER_RANDOM = 0.15;

    // Dampener band: base 0.14, dampened by ×0.90 → 0.126. Pinning
    // Math.random at 0.13 means the no-trait control (0.13 < 0.14 →
    // true) delays every contract while industrious (0.13 < 0.126 →
    // false) sees zero delays.
    const DAMPENER_RANDOM = 0.13;

    for (const trait of ["greedy", "cunning", "manipulative"] as const) {
      it(`${trait} city-wide NPC triggers more contract delays than a no-trait control via runTick`, () => {
        const originalRandom = Math.random;
        try {
          Math.random = () => AMPLIFIER_RANDOM;
          const traitState = stateWithCityNPC([trait]);
          const controlState = stateWithCityNPC([]);

          const traitDelays = totalDelays(runTick(traitState).newState);
          const controlDelays = totalDelays(runTick(controlState).newState);

          // The control band sits the random roll just above base
          // delayChance so the no-trait run never delays, while the
          // ×1.10 amplifier pulls delayChance above the threshold so
          // every seeded contract delays.
          expect(controlDelays).toBe(0);
          expect(traitDelays).toBeGreaterThan(0);
          expect(traitDelays).toBeGreaterThan(controlDelays);
        } finally {
          Math.random = originalRandom;
        }
      });
    }

    it("industrious city-wide NPC triggers fewer contract delays than a no-trait control via runTick", () => {
      const originalRandom = Math.random;
      try {
        Math.random = () => DAMPENER_RANDOM;
        const industriousState = stateWithCityNPC(["industrious"]);
        const controlState = stateWithCityNPC([]);

        const industriousDelays = totalDelays(runTick(industriousState).newState);
        const controlDelays = totalDelays(runTick(controlState).newState);

        // The dampener band sits the random roll between the dampened
        // delayChance (0.126) and the base (0.14): control delays every
        // contract, industrious delays none.
        expect(controlDelays).toBeGreaterThan(0);
        expect(industriousDelays).toBe(0);
        expect(industriousDelays).toBeLessThan(controlDelays);
      } finally {
        Math.random = originalRandom;
      }
    });
  });
});

// ── task #61: end-to-end runTick acceptance for every newly wired
//             trait from tasks #56 and #57 ──────────────────────────────
//
// Tasks #56 and #57 added a lot of new trait → multiplier rows but only
// asserted on the helper output. This block stages a full GameState,
// runs runTick, and asserts the relevant district/faction stat shifts
// in the expected direction relative to a no-trait control. If a future
// refactor disconnects a multiplier from the actual delta math, these
// tests fail.
describe("traits #56/#57 each shift the sim through runTick (acceptance)", () => {
  // Pin Math.random to a stable midpoint so trait vs control runs both
  // see the same RNG sequence inside runTick. Without this, stochastic
  // events (raids, NPC scheme rolls, etc.) drift between runs and the
  // delta comparison can flake even though the trait math is correct.
  let randomSpy: ReturnType<typeof vi.spyOn> | null = null;
  beforeEach(() => {
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = null;
  });

  // Forces district 0 into "slums" territory (wealth < 25) so
  // gangThreatPressure > 40 from the static GANGS table — that drives
  // gangDlt > 0 in the district loop. Combined with crime > 60 +
  // infraQuality < 40 + gangInfluence > 50 every district axis
  // (crime / unrest / gangInfluence) has a strictly positive delta
  // before the trait multiplier is applied, so amplifiers and
  // dampeners can both be observed against control.
  function stateWithSlumsDistrictNPC(traits: string[]): GameState {
    const base = createInitialState();
    base.cityStats.crime = 70;
    base.cityStats.unrest = 50;
    // The default state ships with policies.gangsPatrolled = true,
    // units.antiGangTaskForces = 20, and bldg.sectorHouseHQ = 1, which
    // each subtract from gangDlt / crimeDlt and would drag the control
    // *down* despite the slums staging. Disable them so the per-tick
    // delta is strictly positive in every axis we care about.
    base.policies.gangsPatrolled = false;
    base.units.antiGangTaskForces = 0;
    base.buildings.sectorHouseHQ = 0;
    base.districts = base.districts.map((d, i) =>
      i === 0
        ? {
            ...d,
            wealth: 20,
            industrialOutput: 10,
            gangInfluence: 60,
            infraQuality: 30,
            crime: 40,
            unrest: 30,
          }
        : d,
    );
    base.namedCharacters = [
      makeNPC({
        id: "npc-anchor",
        role: "gang_lieutenant",
        districtId: base.districts[0].id,
        traits,
      }),
    ];
    return base;
  }

  function stateWithFactionNPC(
    traits: string[],
    factionType: "criminal" | "underclass",
  ): GameState {
    const base = createInitialState();
    if (factionType === "criminal") {
      // crime > 50 → loyaltyDlt = +1; crime > 60 → threatDlt = +1
      base.cityStats.crime = 70;
    } else {
      // unrest > 60 → underclass threatDlt = +2
      base.cityStats.unrest = 80;
    }
    const targetFaction = base.factions.find((f) => f.type === factionType);
    if (!targetFaction) throw new Error(`expected a ${factionType} faction in initial state`);
    base.namedCharacters = [
      makeNPC({
        id: "npc-faction",
        role: "agitator",
        factionId: targetFaction.id,
        traits,
      }),
    ];
    return base;
  }

  type DistrictAxis = "crime" | "unrest" | "gangInfluence";
  type Direction = "up" | "down";

  // Each row: trait id → which district axis it should move → which
  // direction relative to the no-trait control. Every entry below was
  // wired in task #56 or task #57 (district side).
  const districtCases: Array<[string, DistrictAxis, Direction]> = [
    // task #56 — district crime
    ["cunning", "crime", "up"],
    ["opportunistic", "crime", "up"],
    ["cautious", "crime", "down"],
    ["rule_breaking", "crime", "up"],
    // task #56 — district unrest
    ["reckless", "unrest", "up"],
    ["stoic", "unrest", "down"],
    ["friendly", "unrest", "down"],
    ["suspicious", "unrest", "up"],
    // task #56 — district gang influence
    ["calculating", "gangInfluence", "up"],
    ["resourceful", "gangInfluence", "up"],
    // task #57 — district unrest
    ["emotional", "unrest", "up"],
    ["talkative", "unrest", "up"],
    ["quiet", "unrest", "down"],
    ["creative", "unrest", "down"],
    ["optimistic", "unrest", "down"],
    // task #57 — district crime
    ["thrill_seeking", "crime", "up"],
    ["intelligent", "crime", "down"],
    ["curious", "crime", "down"],
  ];

  it.each(districtCases)(
    "trait '%s' shifts district %s %s vs no-trait control",
    (trait, axis, dir) => {
      const traitState = stateWithSlumsDistrictNPC([trait]);
      const controlState = stateWithSlumsDistrictNPC([]);
      const before = traitState.districts[0][axis];
      // Sanity: identical staging.
      expect(controlState.districts[0][axis]).toBe(before);

      const traitAfter = runTick(traitState).newState.districts[0][axis];
      const controlAfter = runTick(controlState).newState.districts[0][axis];

      // Both should rise (slums conditions push every axis upward),
      // and the trait should change the climb size relative to control.
      expect(traitAfter).toBeGreaterThan(before);
      expect(controlAfter).toBeGreaterThan(before);

      const traitClimb = traitAfter - before;
      const controlClimb = controlAfter - before;
      if (dir === "up") {
        expect(traitClimb).toBeGreaterThan(controlClimb);
      } else {
        expect(traitClimb).toBeLessThan(controlClimb);
      }
    },
  );

  type FactionAxis = "loyalty" | "threat";
  const factionCases: Array<[string, FactionAxis, Direction, "criminal" | "underclass"]> = [
    // task #56 — faction loyalty (criminal: crime > 50 → loyaltyDlt = +1)
    ["patriotic", "loyalty", "up", "criminal"],
    ["idealistic", "loyalty", "up", "criminal"],
    ["cynical", "loyalty", "down", "criminal"],
    ["distrustful", "loyalty", "down", "criminal"],
    ["independent", "loyalty", "down", "criminal"],
    // task #57 — faction threat (underclass: unrest > 60 → threatDlt = +2)
    ["competitive", "threat", "up", "underclass"],
  ];

  it.each(factionCases)(
    "trait '%s' shifts faction %s %s vs no-trait control",
    (trait, axis, dir, factionType) => {
      const traitState = stateWithFactionNPC([trait], factionType);
      const controlState = stateWithFactionNPC([], factionType);
      const beforeFaction = traitState.factions.find((f: Faction) => f.type === factionType)!;
      const before = beforeFaction[axis];
      // Sanity: identical staging.
      expect(
        controlState.factions.find((f: Faction) => f.type === factionType)![axis],
      ).toBe(before);

      const traitAfter = runTick(traitState).newState.factions.find(
        (f: Faction) => f.type === factionType,
      )![axis];
      const controlAfter = runTick(controlState).newState.factions.find(
        (f: Faction) => f.type === factionType,
      )![axis];

      const traitClimb = traitAfter - before;
      const controlClimb = controlAfter - before;
      if (dir === "up") {
        expect(traitClimb).toBeGreaterThan(controlClimb);
      } else {
        expect(traitClimb).toBeLessThan(controlClimb);
      }
    },
  );
});

// ── task #59: per-NPC contribution breakdowns for the UI ──────────────
describe("listFactionTraitContributions (task #59)", () => {
  it("returns an empty array when no NPCs are anchored to the faction", () => {
    expect(listFactionTraitContributions(minimalState(), "fac-1")).toEqual([]);
  });

  it("returns one row per (NPC × trait) for traits with faction effects", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({
          id: "vex",
          name: "Vex",
          factionId: "fac-1",
          traits: ["aggressive", "loyal"],
        }),
        makeNPC({
          id: "kade",
          name: "Kade",
          factionId: "fac-1",
          traits: ["reformist"],
        }),
      ],
    });
    const rows = listFactionTraitContributions(state, "fac-1");
    expect(rows).toHaveLength(3);
    const vexAggressive = rows.find(
      (r) => r.characterId === "vex" && r.trait === "aggressive",
    );
    expect(vexAggressive).toBeDefined();
    expect(vexAggressive?.threatMult).toBeCloseTo(1.15, 5);
    expect(vexAggressive?.loyaltyMult).toBeUndefined();
    const kadeReformist = rows.find((r) => r.characterId === "kade");
    expect(kadeReformist?.threatMult).toBeCloseTo(0.85, 5);
  });

  it("ignores traits with no faction effect and inactive NPCs", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({
          id: "x",
          factionId: "fac-1",
          traits: ["brutal"], // district-only trait
        }),
        makeNPC({
          id: "y",
          factionId: "fac-1",
          status: "jailed",
          traits: ["aggressive"],
        }),
      ],
    });
    expect(listFactionTraitContributions(state, "fac-1")).toEqual([]);
  });

  it("only returns contributions for the requested faction", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "a", factionId: "fac-1", traits: ["aggressive"] }),
        makeNPC({ id: "b", factionId: "fac-2", traits: ["loyal"] }),
      ],
    });
    const fac1 = listFactionTraitContributions(state, "fac-1");
    const fac2 = listFactionTraitContributions(state, "fac-2");
    expect(fac1.map((r) => r.characterId)).toEqual(["a"]);
    expect(fac2.map((r) => r.characterId)).toEqual(["b"]);
  });
});

describe("listCityTraitContributions (task #59)", () => {
  it("returns an empty array when no NPCs are present", () => {
    expect(listCityTraitContributions(minimalState())).toEqual([]);
  });

  it("returns one row per (NPC × trait) for traits with city effects", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({
          id: "boss",
          name: "Boss",
          role: "tycoon",
          traits: ["corrupt", "greedy"],
        }),
        makeNPC({
          id: "reporter",
          name: "Reporter",
          role: "journalist",
          traits: ["ethical"],
        }),
      ],
    });
    const rows = listCityTraitContributions(state);
    expect(rows).toHaveLength(3);
    const corrupt = rows.find(
      (r) => r.characterId === "boss" && r.trait === "corrupt",
    );
    expect(corrupt?.contractDelayMult).toBeCloseTo(1.15, 5);
    const ethical = rows.find((r) => r.characterId === "reporter");
    expect(ethical?.contractDelayMult).toBeCloseTo(0.9, 5);
  });

  it("ignores inactive NPCs and traits without city effects", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "a", status: "dead", role: "tycoon", traits: ["corrupt"] }),
        makeNPC({ id: "b", role: "gang_lieutenant", traits: ["brutal"] }),
      ],
    });
    expect(listCityTraitContributions(state)).toEqual([]);
  });
});

// ── task #60: guard against silent cosmetic-only traits ─────────────────
// Every trait id surfaced by ROLE_TRAIT_POOL must wire into at least one
// of NAMED_CHARACTER_TRAIT_EFFECTS.{district,faction,city}. If someone
// adds a new trait id to a role pool without an effect entry, the trait
// would behave as cosmetic-only — which is exactly the regression that
// tasks #52/#54/#56/#57 spent their time eliminating. This test fails
// loudly and prints the offending ids.
import { ROLE_TRAIT_POOL } from "@/engine/namedCharacters";

describe("ROLE_TRAIT_POOL ↔ NAMED_CHARACTER_TRAIT_EFFECTS coverage guard", () => {
  // A trait counts as "wired" only if it has at least one numeric multiplier
  // field set in district/faction/city. An empty `{}` entry would silently
  // pass a key-presence-only check while still behaving as cosmetic-only.
  const isEffectful = (fx: Record<string, unknown> | undefined): boolean =>
    !!fx && Object.values(fx).some((v) => typeof v === "number" && Number.isFinite(v));

  it("every trait id used by any role has at least one sim effect", () => {
    const wired = new Set<string>();
    for (const tier of ["district", "faction", "city"] as const) {
      for (const [trait, fx] of Object.entries(NAMED_CHARACTER_TRAIT_EFFECTS[tier])) {
        if (isEffectful(fx as Record<string, unknown>)) wired.add(trait);
      }
    }
    const cosmeticOnly: { trait: string; roles: string[] }[] = [];
    const traitToRoles = new Map<string, string[]>();
    for (const [role, pool] of Object.entries(ROLE_TRAIT_POOL)) {
      for (const trait of pool) {
        if (!traitToRoles.has(trait)) traitToRoles.set(trait, []);
        traitToRoles.get(trait)!.push(role);
      }
    }
    for (const [trait, roles] of traitToRoles) {
      if (!wired.has(trait)) cosmeticOnly.push({ trait, roles });
    }
    if (cosmeticOnly.length > 0) {
      const msg = cosmeticOnly
        .map(({ trait, roles }) => `  - "${trait}" (used by: ${roles.join(", ")})`)
        .join("\n");
      throw new Error(
        `Found ${cosmeticOnly.length} trait id(s) in ROLE_TRAIT_POOL with no\n` +
        `entry in NAMED_CHARACTER_TRAIT_EFFECTS.{district,faction,city}.\n` +
        `These would behave as cosmetic-only — wire them into the effects\n` +
        `table or remove them from the pool:\n${msg}`
      );
    }
    expect(cosmeticOnly).toEqual([]);
  });
});

// ── task #53: listDistrictTraitContributions ─────────────────────────
import {
  listDistrictTraitContributions,
  maybeEmitWeeklyNotable,
  maybeEmitFactionFlashpoint,
  maybeEmitMarketMove,
  maybeEmitUndercityRumor,
} from "@/engine/namedCharacters";

describe("listDistrictTraitContributions (task #53)", () => {
  it("returns empty when no NPCs are anchored to the district", () => {
    expect(listDistrictTraitContributions(minimalState(), "d1")).toEqual([]);
  });

  it("returns one row per (NPC × trait) for traits with district effects", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "a", name: "A", districtId: "d1", traits: ["ruthless", "corrupt"] }),
        makeNPC({ id: "b", name: "B", districtId: "d1", traits: ["compassionate"] }),
      ],
    });
    const rows = listDistrictTraitContributions(state, "d1");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) {
      const hasAxis =
        r.crimeMult !== undefined ||
        r.unrestMult !== undefined ||
        r.gangInfluenceMult !== undefined;
      expect(hasAxis).toBe(true);
    }
  });

  it("ignores inactive NPCs and other districts", () => {
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "a", districtId: "d2", traits: ["ruthless"] }),
        makeNPC({ id: "b", status: "dead", districtId: "d1", traits: ["ruthless"] }),
      ],
    });
    expect(listDistrictTraitContributions(state, "d1")).toEqual([]);
  });
});

// ── task #50: trait-flavored news lines ──────────────────────────────
import { pickTraitFlavoredLine } from "@/engine/namedCharacters";

describe("pickTraitFlavoredLine (task #50)", () => {
  let randSpy: ReturnType<typeof vi.spyOn>;
  afterEach(() => {
    randSpy?.mockRestore();
  });

  it("returns null when the NPC has no traits", () => {
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const npc = makeNPC({ traits: [], role: "gang_lieutenant" });
    expect(pickTraitFlavoredLine(npc, "gang_lieutenant")).toBeNull();
  });

  it("returns null when none of the NPC's traits flavor the given role", () => {
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    // 'patient' has no entry in TRAIT_FLAVORED_LINES → no flavor match.
    const npc = makeNPC({ traits: ["patient"], role: "gang_lieutenant" });
    expect(pickTraitFlavoredLine(npc, "gang_lieutenant")).toBeNull();
  });

  it("picks a corrupt-flavored gang_lieutenant line when the trait matches", () => {
    // Math.random()=0 → first candidate, 0 < 0.7 → not the fallback gate.
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const npc = makeNPC({ traits: ["corrupt"], role: "gang_lieutenant" });
    const line = pickTraitFlavoredLine(npc, "gang_lieutenant");
    expect(line).not.toBeNull();
    expect(line).toContain("envelope");
  });

  it("falls back (returns null) when the random roll lands above the 70% gate", () => {
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);
    const npc = makeNPC({ traits: ["corrupt"], role: "gang_lieutenant" });
    expect(pickTraitFlavoredLine(npc, "gang_lieutenant")).toBeNull();
  });

  it("respects the role argument, not the NPC's role field", () => {
    // tycoon flavor pool exists for 'corrupt'; gang_lieutenant pool exists too.
    // Verify the role argument is what selects the pool.
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const npc = makeNPC({ traits: ["corrupt"], role: "tycoon" });
    const tycoonLine = pickTraitFlavoredLine(npc, "tycoon");
    expect(tycoonLine).not.toBeNull();
    expect(tycoonLine).toMatch(/sweetheart procurement|rival's permit/);
  });

  it("avoids reusing a line the NPC just emitted (anti-repeat window)", () => {
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    // Two corrupt lines exist for tycoon. Plant the first one (index 0)
    // in the NPC's recent history so the picker should skip it.
    const npc = makeNPC({
      traits: ["corrupt"],
      role: "tycoon",
      history: [
        { year: 1, text: "is under quiet inquiry over a sweetheart procurement deal." },
      ] as any,
    });
    const line = pickTraitFlavoredLine(npc, "tycoon");
    expect(line).not.toBeNull();
    // With the first candidate filtered out, Math.random()=0 still picks
    // index 0 of the *fresh* pool, which is now the second line.
    expect(line).not.toContain("sweetheart procurement");
    expect(line).toContain("rival's permit");
  });

  it("aggregates candidates across multiple matching traits", () => {
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const npc = makeNPC({
      traits: ["corrupt", "brutal"],
      role: "gang_lieutenant",
    });
    // Both flavors exist for gang_lieutenant; first candidate (index 0) is
    // the first 'corrupt' line because trait-iteration order is preserved.
    const line = pickTraitFlavoredLine(npc, "gang_lieutenant");
    expect(line).not.toBeNull();
    expect(line).toContain("envelope");
  });
});

// End-to-end smoke: the four maybeEmit* functions still produce sane
// messages and don't throw when an NPC carries trait-flavor-eligible
// traits. We don't pin specific strings here because getOrPickActiveNPC
// burns RNG in ways that are noisy to mock; the unit tests above
// already pin the line-picking logic.
describe("maybeEmit* functions still emit when NPCs carry flavored traits (task #50 smoke)", () => {
  let randSpy: ReturnType<typeof vi.spyOn>;
  afterEach(() => {
    randSpy?.mockRestore();
  });

  it("weekly notable beat emits a non-empty body", () => {
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "k", name: "K", role: "gang_lieutenant", traits: ["corrupt"], notoriety: 80 }),
      ],
    });
    const msg = maybeEmitWeeklyNotable(state);
    expect(msg).not.toBeNull();
    expect(msg!.body.length).toBeGreaterThan(10);
  });

  it("faction flashpoint beat emits a non-empty body", () => {
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "r", name: "R", role: "gang_lieutenant", factionId: "fac-1", traits: ["brutal"], notoriety: 80 }),
      ],
      factions: [
        { id: "fac-1", name: "Iron Crew", isActive: true } as unknown as Faction,
      ],
    });
    const msg = maybeEmitFactionFlashpoint(state);
    expect(msg).not.toBeNull();
    expect(msg!.body.length).toBeGreaterThan(10);
  });

  it("market move beat emits a non-empty body", () => {
    randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const state = minimalState({
      namedCharacters: [
        makeNPC({ id: "v", name: "V", role: "tycoon", traits: ["corrupt"], notoriety: 80 }),
      ],
    });
    const msg = maybeEmitMarketMove(state);
    expect(msg).not.toBeNull();
    expect(msg!.body.length).toBeGreaterThan(10);
  });
});

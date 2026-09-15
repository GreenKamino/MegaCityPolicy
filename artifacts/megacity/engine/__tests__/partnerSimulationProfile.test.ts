import { describe, expect, it } from "vitest";

import { derivePartnerSimulationProfile } from "@/engine/partnerSimulationProfile";
import type { ExternalMegacity, GameState, Township } from "@/engine/types";

function city(overrides: Partial<ExternalMegacity> = {}): ExternalMegacity {
  return {
    id: "profile-city",
    name: "Profile City",
    description: "A research enclave.",
    influence: 61,
    loyalty: 44,
    threat: 22,
    isActive: true,
    tradeInventory: { iron_ore: 90, quantum_processors: 12 },
    lastRefreshTick: 0,
    factionType: "megacity",
    ...overrides,
  };
}

describe("derivePartnerSimulationProfile", () => {
  it("prefers live factual fields and labels them known", () => {
    const entity = city({
      population: 123_456,
      governanceStyle: "Elected council",
      militaryStrength: "Strong patrol fleet",
      infrastructure: { military: 70, walls: 80, fuel: 60, civilian: 50 },
      dominantFaithId: null,
      leader: {
        name: "Ada Venn",
        title: "Speaker",
        attitude: "friendly",
        goals: [],
        personalityTraits: ["methodical"],
      },
      specialResources: ["quantum_processors"],
    });

    const profile = derivePartnerSimulationProfile(entity);

    expect(profile.population).toEqual({ value: 123_456, knowledge: "known", basis: "live population" });
    expect(profile.government.value).toBe("Elected council");
    expect(profile.militaryAttack.value.description).toBe("Strong patrol fleet");
    expect(profile.religionId).toMatchObject({ value: null, knowledge: "known" });
    expect(profile.behaviorTraits.value).toContain("methodical");
    expect(profile.tradeGoods.value).toContain("Quantum Processors");
    expect(profile.naturalResources.value).toContain("Iron Ore");
    expect(profile.naturalResources.value).not.toContain("Quantum Processors");
    expect(profile.uniqueTradeGood.value).toBe("Quantum Processors");
  });

  it("produces stable id-based estimates without mutating sparse entities", () => {
    const entity = city({ tradeInventory: {}, description: "", population: undefined });
    const before = structuredClone(entity);

    const first = derivePartnerSimulationProfile(entity);
    const second = derivePartnerSimulationProfile({ ...entity });

    expect(second).toEqual(first);
    expect(entity).toEqual(before);
    expect(first.population.knowledge).toBe("estimated");
    expect(first.infrastructure.knowledge).toBe("estimated");
    expect(first.research.basis).toContain("no research field exists");
    expect(first.notablePeople.knowledge).toBe("unknown");
    expect(first.religionId.knowledge).toBe("estimated");
  });

  it("supports townships and reads current relationship records without writing state", () => {
    const township: Township = {
      id: "quiet-crossing",
      name: "Quiet Crossing",
      description: "A small farming settlement.",
      population: 2400,
      loyalty: 35,
      threat: 8,
      influence: 12,
      status: "neutral",
      factionType: "township",
      specialization: "Terrace farming",
    };
    const state = {
      totalTicks: 10,
      diplomacyAdvanced: {
        factionRelations: [{
          factionA: "player",
          factionB: township.id,
          disposition: 73,
          trend: "improving",
          lastEventTick: 8,
          events: [],
        }],
        wars: [],
      },
      partnerLedgers: {
        [township.id]: {
          partnerId: township.id,
          favors: 2,
          grudges: 1,
          debts: 3,
          lastInteractionTick: 8,
          recent: [],
          reputationLine: "Reliable",
          trustTrend: "rising",
        },
      },
    } as unknown as GameState;
    const before = structuredClone(state);

    const profile = derivePartnerSimulationProfile(township, state);

    expect(profile.classification.value).toContain("township");
    expect(profile.relationships).toMatchObject({
      knowledge: "known",
      value: { playerDisposition: 73, trend: "improving", favors: 2, grudges: 1, debts: 3 },
    });
    expect(profile.currentAction.knowledge).toBe("estimated");
    expect(state).toEqual(before);
  });
});
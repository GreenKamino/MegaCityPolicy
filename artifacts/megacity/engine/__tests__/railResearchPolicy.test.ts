import { describe, expect, it } from "vitest";

import { ALL_POLICIES, POLICY_MAP } from "@/engine/policies";
import { TECHNOLOGIES, TECH_MAP, canResearch } from "@/engine/technologies";

const RAIL_TECH_IDS = [
  "basic_railways",
  "rail_freight_systems",
  "railway_electrification",
  "passenger_intermodal_rail",
  "advanced_train_designs",
  "magnetic_levitation_rail",
] as const;

describe("rail research progression", () => {
  it("contains the exact ordered transport chain with valid escalating prerequisites", () => {
    const railTechs = RAIL_TECH_IDS.map((id) => TECH_MAP[id]);

    expect(railTechs.map((tech) => tech?.id)).toEqual(RAIL_TECH_IDS);
    expect(railTechs.every((tech) => tech?.category === "transport")).toBe(true);
    expect(railTechs.map((tech) => tech?.prerequisites)).toEqual([
      [],
      ["basic_railways"],
      ["rail_freight_systems"],
      ["railway_electrification"],
      ["passenger_intermodal_rail"],
      ["advanced_train_designs"],
    ]);
    expect(railTechs.map((tech) => tech!.researchCost)).toEqual([180, 350, 600, 900, 1250, 1650]);
    expect(railTechs.map((tech) => tech!.tier)).toEqual([1, 2, 3, 4, 5, 5]);
  });

  it("makes each rail technology researchable only after its predecessor", () => {
    const unlocked: string[] = [];
    for (const [index, id] of RAIL_TECH_IDS.entries()) {
      if (index > 0) {
        expect(canResearch(id, unlocked.slice(0, -1))).toMatchObject({ available: false });
      }
      expect(canResearch(id, unlocked)).toMatchObject({ available: true });
      unlocked.push(id);
    }
  });

  it("uses only supported rail technology effect keys", () => {
    const allowed = new Set(["constructionSpeed", "tradeIncome", "infrastructureHealth", "employment"]);
    const railTechs = TECHNOLOGIES.filter((tech) => RAIL_TECH_IDS.includes(tech.id as (typeof RAIL_TECH_IDS)[number]));

    expect(railTechs).toHaveLength(RAIL_TECH_IDS.length);
    expect(railTechs.flatMap((tech) => Object.keys(tech.effects).filter((key) => !allowed.has(key)))).toEqual([]);
  });

  it("adds separately researchable train modernization nodes after advanced train designs", () => {
    const modules = [
      TECH_MAP.armored_train_plating,
      TECH_MAP.troop_transport_carriages,
      TECH_MAP.weaponized_escort_cars,
    ];
    expect(modules.map((tech) => tech?.name)).toEqual([
      "Armored Train Plating",
      "Troop-Transport Carriages",
      "Weaponized Escort Cars",
    ]);
    expect(modules.map((tech) => tech?.prerequisites)).toEqual([
      ["advanced_train_designs"],
      ["advanced_train_designs"],
      ["armored_train_plating"],
    ]);
    expect(modules.map((tech) => tech?.researchCost)).toEqual([800, 950, 1100]);
    expect(modules.every((tech) => tech?.category === "transport" && tech?.tier === 5)).toBe(true);
    expect(canResearch("armored_train_plating", ["advanced_train_designs"])).toMatchObject({ available: true });
    expect(canResearch("weaponized_escort_cars", ["advanced_train_designs"])).toMatchObject({ available: false });
  });
});

describe("rail policy catalog", () => {
  const expectedPolicies = {
    railPublicAccessMandate: {
      prerequisites: ["passenger_intermodal_rail"],
      effects: { happiness: 2, tradeIncome: -100 },
    },
    freightPriorityDispatch: {
      prerequisites: ["rail_freight_systems"],
      effects: { tradeIncome: 250, goodsProduction: 2, happiness: -1 },
    },
    automatedRailConstruction: {
      prerequisites: ["advanced_train_designs"],
      effects: { constructionSpeed: 3, employment: -2 },
    },
    railSafetyAuthority: {
      prerequisites: ["railway_electrification"],
      effects: { infrastructureHealth: 2, lawOrder: 2 },
    },
  };

  it("includes each policy with its required rail research and effects", () => {
    for (const [id, expected] of Object.entries(expectedPolicies)) {
      expect(POLICY_MAP[id]).toMatchObject({ id, ...expected });
    }
  });

  it("has no duplicate rail policy IDs", () => {
    const ids = ALL_POLICIES.map((policy) => policy.id);
    const railIds = Object.keys(expectedPolicies);

    expect(railIds.every((id) => ids.filter((policyId) => policyId === id).length === 1)).toBe(true);
  });
});
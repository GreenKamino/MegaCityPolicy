import { describe, expect, it } from "vitest";
import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { derivePartnerSimulationProfile } from "@/engine/partnerSimulationProfile";
import {
  GENERIC_MEGACITY_IDS,
  GENERIC_MEGACITY_ENTITIES,
  estimateSettlementInfrastructure,
  getOperationalSettlementSections,
  normalizeSettlementOperational,
  operationalFromSettlement,
  normalizeTradeInventory,
} from "@/engine/settlementData";
import type { SettlementOperationalData } from "@/engine/types";
import { WORLD_LOCATIONS } from "@/engine/worldMap";
import { LOCATION_POSITIONS } from "@/engine/worldMapPositions";

const requiredSections = [
  "population",
  "territoryKm2",
  "infrastructure",
  "setting",
  "government",
  "economy",
  "resources",
  "trade",
  "military",
  "stability",
  "diplomacy",
] as const;

function expectValidOperational(operational: SettlementOperationalData | undefined): void {
  expect(operational).toBeDefined();
  for (const section of requiredSections) {
    expect(operational).toHaveProperty(section);
  }
  expect(Number.isFinite(operational?.population)).toBe(true);
  expect(operational?.population).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(operational?.territoryKm2)).toBe(true);
  expect(operational?.territoryKm2).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(operational?.infrastructureScore.totalPoints)).toBe(true);
  expect(operational?.infrastructureScore.totalPoints).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(operational?.infrastructureScore.integrityPercent)).toBe(true);
  expect(operational?.infrastructureScore.integrityPercent).toBeGreaterThanOrEqual(0);
  expect(operational?.infrastructureScore.integrityPercent).toBeLessThanOrEqual(100);
  for (const value of Object.values(operational?.infrastructure ?? {})) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  }
  expect(typeof operational?.setting.terrain).toBe("string");
  expect(typeof operational?.setting.coastal).toBe("boolean");
  expect(typeof operational?.setting.wasteland).toBe("boolean");
  expect(operational?.government.style).not.toBe("");
  expect(operational?.economy.outputs.every((value) => typeof value === "string")).toBe(true);
  expect(operational?.resources.every((value) => typeof value === "string")).toBe(true);
  expect(operational?.trade.exports.every((value) => typeof value === "string")).toBe(true);
  expect(operational?.trade.imports.every((value) => typeof value === "string")).toBe(true);
  expect(["limited", "regional", "major", "continental"]).toContain(operational?.trade.capacity);
  expect(Number.isFinite(operational?.military.capacity)).toBe(true);
  expect(operational?.military.capacity).toBeGreaterThanOrEqual(0);
  expect(operational?.military.capacity).toBeLessThanOrEqual(100);
  expect(Number.isFinite(operational?.stability.score)).toBe(true);
  expect(operational?.stability.score).toBeGreaterThanOrEqual(0);
  expect(operational?.stability.score).toBeLessThanOrEqual(100);
  expect(Number.isFinite(operational?.diplomacy.influence)).toBe(true);
  expect(operational?.diplomacy.influence).toBeGreaterThanOrEqual(0);
  expect(operational?.diplomacy.influence).toBeLessThanOrEqual(100);
}

describe("standardized settlement sheets", () => {
  it("gives every generic megacity a complete operational record", () => {
    expect(GENERIC_MEGACITY_ENTITIES).toHaveLength(5);
    for (const entity of GENERIC_MEGACITY_ENTITIES) {
      expectValidOperational(entity.operational);
      expect(entity.operational?.population).toBeGreaterThan(0);
      expect(entity.operational?.trade.exports.length).toBeGreaterThan(0);
    }
  });

  it("rehydrates the shared sheet for legacy saves without replacing mutable city state", () => {
    const current = createInitialState();
    const legacy = structuredClone(current);
    legacy.externalMegacities = legacy.externalMegacities
      .filter((city) => !GENERIC_MEGACITY_IDS.includes(city.id as typeof GENERIC_MEGACITY_IDS[number]))
      .map((city) => ({ ...city, operational: undefined, influence: city.influence + 7 }));
    legacy.townships = (legacy.townships ?? []).map((township) => ({
      ...township,
      operational: undefined,
      loyalty: township.id === "dusthaven" ? 13 : township.loyalty,
    }));

    const migrated = migrateState(legacy);
    const genericIds = new Set(migrated.externalMegacities.map((city) => city.id));
    expect([...GENERIC_MEGACITY_IDS].every((id) => genericIds.has(id))).toBe(true);
    expect(migrated.externalMegacities.find((city) => city.id === "nova-pacifica")?.influence).toBe(47);
    expect((migrated.townships ?? []).find((township) => township.id === "dusthaven")?.loyalty).toBe(13);
    expect((migrated.townships ?? []).every((township) => township.operational)).toBe(true);
    expect(migrated.externalMegacities.every((city) => city.operational)).toBe(true);
  });

  it("preserves the persisted roster seed and display names during migration", () => {
    const legacy = structuredClone(createInitialState());
    legacy.megacityRoster!.entries = legacy.megacityRoster!.entries.map((entry) =>
      entry.id === "iron-khanate" ? { ...entry, displayName: "LA ADMINISTRATION" } : entry,
    );
    legacy.externalMegacities = legacy.externalMegacities.map((city) =>
      city.id === "iron-khanate" ? { ...city, name: "LA ADMINISTRATION" } : city,
    );
    const migrated = migrateState(legacy);
    expect(migrated.megacityRoster?.seed).toBe(legacy.megacityRoster?.seed);
    expect(migrated.megacityRoster?.entries.find((entry) => entry.id === "iron-khanate")?.displayName).toBe("LA ADMINISTRATION");
    expect(migrated.externalMegacities.find((city) => city.id === "iron-khanate")?.name).toBe("LA ADMINISTRATION");
  });

  it("repairs malformed nested operational data without replacing valid relationship state", () => {
    const legacy = structuredClone(createInitialState());
    const megacity = legacy.externalMegacities.find((city) => city.id === "terminus-prime");
    const township = (legacy.townships ?? []).find((candidate) => candidate.id !== "dusthaven");
    expect(megacity).toBeDefined();
    expect(township).toBeDefined();

    megacity!.influence = 17;
    megacity!.loyalty = 23;
    megacity!.controlStatus = "annexed";
    megacity!.operational = {
      population: Infinity,
      territoryKm2: Number.NaN,
      infrastructure: { military: Number.NaN, walls: -12, fuel: 900, civilian: "bad" },
      setting: { terrain: 44, coastal: "yes", wasteland: null },
      government: null,
      economy: { profile: [], outputs: ["usable output", 12, ""] },
      resources: ["usable resource", null],
      trade: { exports: [false], imports: ["food", 3], capacity: "galactic" },
      military: { capacity: -Infinity, posture: {} },
      stability: { score: Number.NaN, label: 7 },
      diplomacy: { posture: null, influence: Infinity },
    } as any;

    township!.loyalty = 31;
    township!.influence = 29;
    township!.status = "allied";
    township!.operational = {
      population: "millions",
      infrastructure: null,
      stability: { score: 140 },
      diplomacy: { influence: -25 },
    } as any;

    const migrated = migrateState(legacy);
    const repairedMegacity = migrated.externalMegacities.find((city) => city.id === megacity!.id);
    const repairedTownship = (migrated.townships ?? []).find((candidate) => candidate.id === township!.id);

    expect(repairedMegacity).toMatchObject({
      influence: 17,
      loyalty: 23,
      controlStatus: "annexed",
    });
    expect(repairedTownship).toMatchObject({
      loyalty: 31,
      influence: 29,
      status: "allied",
    });
    expectValidOperational(repairedMegacity?.operational);
    expectValidOperational(repairedTownship?.operational);
    expect(repairedMegacity?.operational?.population).toBe(megacity?.population);
    expect(repairedMegacity?.operational?.economy.outputs).toEqual(["usable output"]);
    expect(repairedMegacity?.operational?.resources).toEqual(["usable resource"]);
    expect(repairedMegacity?.operational?.trade.exports.length).toBeGreaterThan(0);
    expect(repairedMegacity?.operational?.territoryKm2).toBeGreaterThan(0);
    expect(repairedMegacity?.operational?.trade.capacity).toBe("major");
    expect(repairedMegacity?.operational?.infrastructure.walls).toBe(0);
    expect(repairedMegacity?.operational?.infrastructure.fuel).toBe(100);
    expect(repairedTownship?.operational?.stability.score).toBe(100);
    expect(repairedTownship?.operational?.diplomacy.influence).toBe(0);
  });

  it("normalizes damaged trade inventories while preserving valid order and quantities", () => {
    const legacy = structuredClone(createInitialState());
    const megacity = legacy.externalMegacities.find((city) => city.id === "terminus-prime");
    const township = (legacy.townships ?? []).find((candidate) => candidate.id !== "dusthaven");
    expect(megacity).toBeDefined();
    expect(township).toBeDefined();

    megacity!.tradeInventory = {
      iron_ore: 240.5,
      bad_nan: Number.NaN,
      steel_plates: 0,
      bad_infinity: Number.POSITIVE_INFINITY,
      fuel_cells: 12,
      bad_negative: -4,
      bad_text: "full",
    } as any;
    township!.tradeInventory = {
      food: 80,
      broken: Number.NEGATIVE_INFINITY,
      water: 15,
    } as any;

    const migrated = migrateState(legacy);
    const repairedMegacity = migrated.externalMegacities.find((city) => city.id === megacity!.id);
    const repairedTownship = (migrated.townships ?? []).find((candidate) => candidate.id === township!.id);

    expect(repairedMegacity?.tradeInventory).toEqual({
      iron_ore: 240.5,
      steel_plates: 0,
      fuel_cells: 12,
    });
    expect(repairedTownship?.tradeInventory).toEqual({
      food: 80,
      water: 15,
    });
    for (const inventory of [repairedMegacity?.tradeInventory, repairedTownship?.tradeInventory]) {
      expect(Object.values(inventory ?? {}).every((quantity) => Number.isFinite(quantity) && quantity >= 0)).toBe(true);
    }
    expect(() => derivePartnerSimulationProfile(repairedMegacity!)).not.toThrow();
    expect(derivePartnerSimulationProfile(repairedMegacity!).resourcesAndStocks.value).toEqual({
      iron_ore: 240.5,
      fuel_cells: 12,
    });
  });

  it("uses catalog inventory when the saved inventory is not an object", () => {
    const legacy = structuredClone(createInitialState());
    const megacity = legacy.externalMegacities.find((city) => city.id === "terminus-prime");
    const township = (legacy.townships ?? []).find((candidate) => candidate.id !== "dusthaven");
    const catalogMegacity = createInitialState().externalMegacities.find((city) => city.id === "terminus-prime");
    const catalogTownship = createInitialState().townships?.find((candidate) => candidate.id === township?.id);
    expect(megacity).toBeDefined();
    expect(township).toBeDefined();
    expect(catalogMegacity).toBeDefined();
    expect(catalogTownship).toBeDefined();

    megacity!.tradeInventory = "not an inventory" as any;
    township!.tradeInventory = [1, 2, 3] as any;

    const migrated = migrateState(legacy);
    const repairedMegacity = migrated.externalMegacities.find((city) => city.id === megacity!.id);
    const repairedTownship = (migrated.townships ?? []).find((candidate) => candidate.id === township!.id);

    expect(repairedMegacity?.tradeInventory).toEqual(catalogMegacity!.tradeInventory);
    expect(repairedTownship?.tradeInventory).toEqual(catalogTownship!.tradeInventory);
    expect(normalizeTradeInventory(null, { copper: 32, broken: Number.NaN })).toEqual({ copper: 32 });
    expect(normalizeTradeInventory(["invalid"], { copper: 32 })).toEqual({ copper: 32 });
  });

  it("keeps the five megacities on deterministic, distinct map pins", () => {
    const positions = GENERIC_MEGACITY_IDS.map((id) => LOCATION_POSITIONS[id]);
    expect(positions.every((position) => Number.isFinite(position?.x) && Number.isFinite(position?.y))).toBe(true);
    expect(new Set(positions.map((position) => `${position.x},${position.y}`)).size).toBe(5);
    for (const id of GENERIC_MEGACITY_IDS) {
      const location = WORLD_LOCATIONS.find((candidate) => candidate.id === id);
      expect(location?.type).toBe("megacity");
      expect(location?.operational?.population).toBe(location?.population);
      expect(location?.operational?.military.capacity).toBe(location?.defenseRating);
    }
  });

  it("estimates deterministic, bounded NPC infrastructure scores", () => {
    const operational = GENERIC_MEGACITY_ENTITIES[0].operational!;
    const first = estimateSettlementInfrastructure(operational);
    expect(estimateSettlementInfrastructure(operational)).toEqual(first);
    expect(first.totalPoints).toBeGreaterThan(0);
    expect(first.integrityPercent).toBeGreaterThanOrEqual(0);
    expect(first.integrityPercent).toBeLessThanOrEqual(100);

    const damaged = normalizeSettlementOperational({
      ...operational,
      infrastructure: { military: -50, walls: 250, fuel: Number.NaN, civilian: 50 },
      condition: { health: -20, attrition: 180 },
    });
    expect(damaged.infrastructureScore.totalPoints).toBeGreaterThanOrEqual(0);
    expect(damaged.infrastructureScore.integrityPercent).toBeGreaterThanOrEqual(0);
    expect(damaged.infrastructureScore.integrityPercent).toBeLessThanOrEqual(100);
  });

  it("keeps the shared operational contract complete for settlement classes", () => {
    const state = createInitialState();
    const settlements = [...state.externalMegacities, ...(state.townships ?? [])];
    expect(settlements.length).toBeGreaterThan(0);
    for (const settlement of settlements) {
      const operational = operationalFromSettlement(settlement);
      expect(operational.setting.foundation).toBeTruthy();
      expect(Array.isArray(operational.setting.hazards)).toBe(true);
      expect(operational.faithCulture?.faith).toBeTruthy();
      expect(Array.isArray(operational.faithCulture?.culture)).toBe(true);
      expect(Array.isArray(operational.priorities)).toBe(true);
      const sections = getOperationalSettlementSections(operational);
      expect(sections.map((section) => section.title)).toEqual([
        "SETTING",
        "GOVERNANCE & CULTURE",
        "ECONOMY & TRADE",
        "CAPABILITY & CONDITION",
        "DIPLOMACY",
      ]);
      expect(sections.flatMap((section) => section.rows.map((row) => row.label))).toEqual(expect.arrayContaining([
        "TERRAIN",
        "FOUNDATION",
        "HAZARDS",
        "GOVERNMENT",
        "FAITH / CULTURE",
        "PRIORITIES",
        "ECONOMY",
        "RESOURCES",
        "TRADE",
        "POPULATION",
        "MILITARY",
        "INFRASTRUCTURE",
        "STABILITY",
        "CONDITION",
        "POSTURE",
        "INFLUENCE",
      ]));
    }
  });

  it("scales capacity from a small town to a megacity and responds to relevant inputs", () => {
    const megacity = GENERIC_MEGACITY_ENTITIES[0].operational!;
    const town = normalizeSettlementOperational({
      ...megacity,
      population: 2_000,
      territoryKm2: 35,
      infrastructure: { military: 20, walls: 15, fuel: 25, civilian: 30 },
      military: { capacity: 18, posture: "local defense" },
      stability: { score: 35, label: "precarious" },
      economy: { profile: "survival", outputs: ["salvage"] },
      trade: { exports: ["salvage"], imports: [], capacity: "limited" },
      condition: { health: 70, attrition: 20 },
    });
    expect(megacity.infrastructureScore.totalPoints).toBeGreaterThan(town.infrastructureScore.totalPoints);

    const populationChange = normalizeSettlementOperational({ ...megacity, population: megacity.population + 1_000_000 });
    const territoryChange = normalizeSettlementOperational({ ...megacity, territoryKm2: megacity.territoryKm2 + 1_000 });
    const wallsChange = normalizeSettlementOperational({
      ...megacity,
      infrastructure: { ...megacity.infrastructure, walls: megacity.infrastructure.walls + 20 },
    });
    const conditionChange = normalizeSettlementOperational({
      ...megacity,
      condition: { health: 30, attrition: 70 },
    });
    expect(populationChange.infrastructureScore.totalPoints).not.toBe(megacity.infrastructureScore.totalPoints);
    expect(territoryChange.infrastructureScore.totalPoints).not.toBe(megacity.infrastructureScore.totalPoints);
    expect(wallsChange.infrastructureScore.integrityPercent).toBeGreaterThan(megacity.infrastructureScore.integrityPercent);
    expect(conditionChange.infrastructureScore.integrityPercent).toBeLessThan(megacity.infrastructureScore.integrityPercent);

    const unrelatedChange = normalizeSettlementOperational({
      ...megacity,
      diplomacy: { ...megacity.diplomacy, influence: 0 },
    });
    expect(unrelatedChange.infrastructureScore).toEqual(megacity.infrastructureScore);
  });
});
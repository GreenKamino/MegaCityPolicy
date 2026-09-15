import { describe, expect, it } from "vitest";
import { createInitialState } from "@/engine/initialState";
import { STARTING_REGIONS, applyStartingBonus } from "@/engine/worldMap";
import {
  applyResourceDelta,
  BASE_FUEL_STORAGE,
  FUEL_STORAGE_BUILDING_KEY,
  FUEL_STORAGE_PER_TANK_FARM,
  getResourceStorageCapacity,
  getResourceStoragePlan,
  getResourceStorageStatus,
  getSelectedBuildingStorageStatuses,
  getLogisticsStockpileBalance,
  LOGISTICS_STOCKPILE_POLICY,
  MILITARY_LOGISTICS_STOCKPILE_KEYS,
  RESOURCE_STORAGE_POLICIES,
  SELECTED_BUILDING_STORAGE_CONTRIBUTIONS,
  STORAGE_PER_DISTRIBUTION_CENTER,
  STORAGE_RESOURCE_KEYS,
  summarizeFoodStorageGain,
} from "@/engine/resourceStorage";

describe("material storage", () => {
  it("defines a policy for every top-level resource and keeps logistics separate", () => {
    expect(Object.keys(RESOURCE_STORAGE_POLICIES).sort()).toEqual([
      "ammo",
      "credits",
      "food",
      "fuel",
      "goods",
      "medSupplies",
      "power",
      "steel",
      "water",
    ]);
    expect(RESOURCE_STORAGE_POLICIES.fuel.kind).toBe("expandable_storage");
    expect(RESOURCE_STORAGE_POLICIES.power.kind).toBe("expandable_storage");
    expect(RESOURCE_STORAGE_POLICIES.food.kind).toBe("expandable_storage");
    expect(RESOURCE_STORAGE_POLICIES.water.kind).toBe("perishable_flow");
    expect(RESOURCE_STORAGE_POLICIES.credits.kind).toBe("intentionally_uncapped_reserve");
    expect(RESOURCE_STORAGE_POLICIES.ammo.kind).toBe("intentionally_uncapped_reserve");
    expect(LOGISTICS_STOCKPILE_POLICY.kind).toBe("separate_logistics_stockpile");
  });

  it("reads military stockpile balances without inventing a capacity", () => {
    const state = createInitialState();
    state.stockpiles.ammo = 24;
    state.stockpiles.fuel = 18;
    state.stockpiles.vehicleParts = 7;

    expect(MILITARY_LOGISTICS_STOCKPILE_KEYS).toEqual(["ammo", "fuel", "vehicleParts"]);
    expect(getLogisticsStockpileBalance(state, "ammo")).toBe(24);
    expect(getLogisticsStockpileBalance(state, "fuel")).toBe(18);
    expect(getLogisticsStockpileBalance(state, "vehicleParts")).toBe(7);
    expect(getLogisticsStockpileBalance(state, "unknown")).toBe(0);
  });

  it("starts at 1,000 per material and distribution centers add 5,000", () => {
    const state = createInitialState();
    expect(getResourceStorageCapacity(state, "steel")).toBe(1000);
    expect(getResourceStorageCapacity(state, "goods")).toBe(1000);
    expect(STORAGE_PER_DISTRIBUTION_CENTER).toBe(5_000);
    state.buildings.supplyChainDistributionCenters = 2;
    expect(getResourceStorageCapacity(state, "steel")).toBe(11_000);
    expect(getResourceStorageCapacity(state, "goods")).toBe(11_000);
  });

  it("adds capacity from exactly the five selected storage buildings", () => {
    const state = createInitialState();
    const unrelatedBefore = {
      fuel: getResourceStorageCapacity(state, "fuel"),
      medSupplies: getResourceStorageCapacity(state, "medSupplies"),
      power: getResourceStorageCapacity(state, "power"),
    };
    expect(SELECTED_BUILDING_STORAGE_CONTRIBUTIONS.map((building) => building.key)).toEqual([
      "wholesaleDistributionDepots",
      "freightLogisticsMegaHub",
      "harborExpansionDistrict",
      "packagingAndCratingPlant",
      "agriculturalDomeDistrict",
    ]);
    expect(getResourceStorageCapacity(state, "food")).toBe(1_000);

    state.buildings.wholesaleDistributionDepots = 2;
    state.buildings.freightLogisticsMegaHub = 3;
    state.buildings.harborExpansionDistrict = 4;
    state.buildings.packagingAndCratingPlant = 5;
    state.buildings.agriculturalDomeDistrict = 6;

    expect(getResourceStorageCapacity(state, "food")).toBe(7_000);
    expect(getResourceStorageCapacity(state, "steel")).toBe(3_250);
    expect(getResourceStorageCapacity(state, "goods")).toBe(7_500);
    expect(getResourceStorageCapacity(state, "fuel")).toBe(unrelatedBefore.fuel);
    expect(getResourceStorageCapacity(state, "medSupplies")).toBe(unrelatedBefore.medSupplies);
    expect(getResourceStorageCapacity(state, "power")).toBe(unrelatedBefore.power);

    expect(getSelectedBuildingStorageStatuses(state)).toEqual([
      expect.objectContaining({ key: "wholesaleDistributionDepots", count: 2, contribution: { goods: 1_000 } }),
      expect.objectContaining({ key: "freightLogisticsMegaHub", count: 3, contribution: { steel: 2_250, goods: 2_250 } }),
      expect.objectContaining({ key: "harborExpansionDistrict", count: 4, contribution: { goods: 2_000 } }),
      expect.objectContaining({ key: "packagingAndCratingPlant", count: 5, contribution: { goods: 1_250 } }),
      expect.objectContaining({ key: "agriculturalDomeDistrict", count: 6, contribution: { food: 6_000 } }),
    ]);
  });

  it("rejects positive overflow but always applies negative deltas", () => {
    const state = createInitialState();
    state.resources.steel = 950;
    expect(applyResourceDelta(state, "steel", 100)).toEqual({ applied: 50, rejected: 50 });
    expect(state.resources.steel).toBe(1000);
    expect(applyResourceDelta(state, "steel", -250)).toEqual({ applied: -250, rejected: 0 });
    expect(state.resources.steel).toBe(750);
  });

  it("keeps legacy over-cap balances without accepting further gains", () => {
    const state = createInitialState();
    state.resources.goods = 1800;
    const status = getResourceStorageStatus(state, "goods");
    expect(status.structuralCapacity).toBe(1000);
    expect(status.capacity).toBe(1800);
    expect(status.legacyOverflow).toBe(800);
    expect(applyResourceDelta(state, "goods", 20)).toEqual({ applied: 0, rejected: 20 });
    expect(applyResourceDelta(state, "goods", -900)).toEqual({ applied: -900, rejected: 0 });
    expect(applyResourceDelta(state, "goods", 50)).toEqual({ applied: 50, rejected: 0 });
  });

  it("gives medical supplies a base capacity and building-backed expansion", () => {
    const state = createInitialState();
    state.buildings.publicHealthMegaClinics = 0;
    expect(getResourceStorageCapacity(state, "medSupplies")).toBe(5_000);

    state.buildings.publicHealthMegaClinics = 1;
    state.buildings.emergencyDisasterResponseHQ = 1;
    state.buildings.emergencyServiceStations = 1;
    state.buildings.seasonalEmergencyDepots = 1;
    expect(getResourceStorageCapacity(state, "medSupplies")).toBe(8_500);
  });

  it("starts fuel at 5,000 and expands it by 2,000 per tank farm", () => {
    const state = createInitialState();
    expect(state.buildings[FUEL_STORAGE_BUILDING_KEY]).toBe(0);
    expect(BASE_FUEL_STORAGE).toBe(5_000);
    expect(FUEL_STORAGE_PER_TANK_FARM).toBe(2_000);
    expect(getResourceStorageCapacity(state, "fuel")).toBe(5_000);
    expect(getResourceStorageCapacity(state, "power")).toBe(5_000);
    state.buildings[FUEL_STORAGE_BUILDING_KEY] = 2;
    state.buildings.energyStorageVaults = 3;
    expect(getResourceStorageCapacity(state, "fuel")).toBe(9_000);
    expect(getResourceStorageCapacity(state, "power")).toBe(5_600);
    state.resources.fuel = 8_950;
    expect(applyResourceDelta(state, "fuel", 100)).toEqual({ applied: 50, rejected: 50 });
    expect(state.resources.fuel).toBe(9_000);
    state.resources.power = -950;
    expect(applyResourceDelta(state, "power", -100)).toEqual({ applied: -50, rejected: 0 });
    expect(state.resources.power).toBe(-1_000);
    expect(applyResourceDelta(state, "power", 10_000)).toEqual({ applied: 6_600, rejected: 3_400 });
    expect(state.resources.power).toBe(5_600);
  });

  it("keeps legacy fuel overflow and resumes gains below the expanded structural cap", () => {
    const state = createInitialState();
    state.resources.fuel = 7_500;
    expect(getResourceStorageStatus(state, "fuel")).toEqual(expect.objectContaining({
      structuralCapacity: 5_000,
      capacity: 7_500,
      legacyOverflow: 2_500,
      available: 0,
    }));
    expect(applyResourceDelta(state, "fuel", 100)).toEqual({ applied: 0, rejected: 100 });

    state.buildings[FUEL_STORAGE_BUILDING_KEY] = 1;
    expect(getResourceStorageStatus(state, "fuel").structuralCapacity).toBe(7_000);
    expect(applyResourceDelta(state, "fuel", -600)).toEqual({ applied: -600, rejected: 0 });
    expect(applyResourceDelta(state, "fuel", 200)).toEqual({ applied: 100, rejected: 100 });
    expect(state.resources.fuel).toBe(7_000);
  });

  it("caps Food while leaving Water and uncapped reserves without a gameplay capacity", () => {
    const state = createInitialState();
    expect(STORAGE_RESOURCE_KEYS).toContain("food");
    expect(STORAGE_RESOURCE_KEYS).not.toEqual(expect.arrayContaining(["credits", "water", "ammo"]));
    expect(applyResourceDelta(state, "credits", 1_000_000)).toEqual({ applied: 1_000_000, rejected: 0 });
    expect(applyResourceDelta(state, "food", 1_000_000)).toEqual({ applied: 200, rejected: 999_800 });
    expect(state.resources.food).toBe(1_000);
    expect(applyResourceDelta(state, "water", 1_000_000)).toEqual({ applied: 1_000_000, rejected: 0 });
    expect(applyResourceDelta(state, "ammo", 1_000_000)).toEqual({ applied: 1_000_000, rejected: 0 });
  });

  it("preserves legacy Food overflow and resumes gains only below structural capacity", () => {
    const state = createInitialState();
    state.resources.food = 4_000;
    expect(getResourceStorageStatus(state, "food")).toEqual(expect.objectContaining({
      structuralCapacity: 1_000,
      capacity: 4_000,
      legacyOverflow: 3_000,
      available: 0,
    }));
    expect(applyResourceDelta(state, "food", 50)).toEqual({ applied: 0, rejected: 50 });
    expect(applyResourceDelta(state, "food", -3_100)).toEqual({ applied: -3_100, rejected: 0 });
    expect(applyResourceDelta(state, "food", 50)).toEqual({ applied: 50, rejected: 0 });
  });

  it("explains accepted, rejected, full, and legacy-overflow food rewards", () => {
    const state = createInitialState();
    state.resources.food = 950;
    const partial = applyResourceDelta(state, "food", 100);
    expect(summarizeFoodStorageGain(state, partial)).toContain("+50 food stored; +50 rejected");
    expect(summarizeFoodStorageGain(state, partial)).toContain("Food consumption still works");
    expect(summarizeFoodStorageGain(state, partial)).toContain("Open Economy");

    state.resources.food = 1_000;
    const full = applyResourceDelta(state, "food", 25);
    expect(summarizeFoodStorageGain(state, full)).toContain("+0 food stored; +25 rejected");
    expect(summarizeFoodStorageGain(state, full)).toContain("Food consumption still works");

    state.resources.food = 1_500;
    const legacy = applyResourceDelta(state, "food", 25);
    expect(summarizeFoodStorageGain(state, legacy)).toContain("Food consumption still works");
    expect(summarizeFoodStorageGain(state, legacy)).toContain("legacy surplus remains available");
    expect(summarizeFoodStorageGain(state, legacy)).toContain("+25 rejected");
  });

  it("lets weather consumption make room for a food reward at a full reserve", () => {
    const state = createInitialState();
    state.resources.food = getResourceStorageCapacity(state, "food");

    const weatherDrain = applyResourceDelta(state, "food", -120);
    const encounterReward = applyResourceDelta(state, "food", 200);

    expect(weatherDrain).toEqual({ applied: -120, rejected: 0 });
    expect(encounterReward).toEqual({ applied: 120, rejected: 80 });
    expect(state.resources.food).toBe(1_000);
    expect(summarizeFoodStorageGain(state, encounterReward)).toBe(
      "+120 food stored; +80 rejected because the reserve is full. Food consumption still works while the reserve is full. Open Economy to check the food storage readout; build Agricultural Dome Districts to expand the reserve.",
    );

    const creditGain = applyResourceDelta(state, "credits", 1_000_000);
    const ammoGain = applyResourceDelta(state, "ammo", 1_000_000);
    expect(creditGain).toEqual({ applied: 1_000_000, rejected: 0 });
    expect(ammoGain).toEqual({ applied: 1_000_000, rejected: 0 });
    expect(state.resources.credits).toBeGreaterThan(1_000_000);
    expect(state.resources.ammo).toBeGreaterThan(1_000_000);
  });

  it("rejects medical gains at the cap, permits consumption, and preserves legacy overflow", () => {
    const state = createInitialState();
    state.buildings.publicHealthMegaClinics = 0;
    state.resources.medSupplies = 5_000;
    expect(applyResourceDelta(state, "medSupplies", 75)).toEqual({ applied: 0, rejected: 75 });
    expect(applyResourceDelta(state, "medSupplies", -125)).toEqual({ applied: -125, rejected: 0 });
    expect(state.resources.medSupplies).toBe(4_875);

    state.resources.medSupplies = 6_200;
    const status = getResourceStorageStatus(state, "medSupplies");
    expect(status.structuralCapacity).toBe(5_000);
    expect(status.capacity).toBe(6_200);
    expect(status.legacyOverflow).toBe(1_200);
    expect(applyResourceDelta(state, "medSupplies", 1)).toEqual({ applied: 0, rejected: 1 });
    expect(applyResourceDelta(state, "medSupplies", -1_201)).toEqual({ applied: -1_201, rejected: 0 });
    expect(applyResourceDelta(state, "medSupplies", 1)).toEqual({ applied: 1, rejected: 0 });
  });

  it("returns one actionable plan row per bounded reserve", () => {
    const state = createInitialState();
    state.buildings.supplyChainDistributionCenters = 1;
    state.buildings.energyStorageVaults = 2;
    state.buildings.fuelReserveTankFarms = 3;
    const plan = getResourceStoragePlan(state);

    expect(plan.map((entry) => entry.resource)).toEqual([
      "food", "steel", "goods", "fuel", "medSupplies", "power",
    ]);
    expect(plan.find((entry) => entry.resource === "steel")).toEqual(expect.objectContaining({
      structuralCapacity: 6_000,
      nextUpgrade: expect.objectContaining({ key: "freightLogisticsMegaHub" }),
    }));
    expect(plan.find((entry) => entry.resource === "fuel")).toEqual(expect.objectContaining({
      structuralCapacity: 11_000,
      contributors: expect.arrayContaining([
        expect.objectContaining({ key: "fuelReserveTankFarms", contribution: 6_000 }),
      ]),
    }));
    expect(plan.find((entry) => entry.resource === "power")).toEqual(expect.objectContaining({
      structuralCapacity: 5_400,
      contributors: expect.arrayContaining([
        expect.objectContaining({ key: "energyStorageVaults", contribution: 400 }),
      ]),
    }));
  });

  it("keeps startup region bonuses inside the same reserve contract", () => {
    const state = {
      resources: { food: 1_000 },
      buildings: {},
    };
    const foodRegion = STARTING_REGIONS.find((region) => region.startingBonus.resources?.food);
    expect(foodRegion).toBeDefined();
    applyStartingBonus(state, foodRegion!);
    expect(state.resources.food).toBe(1_000);
  });
});
import type { GameState, Resources, StorageResourceKey } from "@/engine/types";

/**
 * General-material storage is intentionally separate from the supply-chain
 * commodity stockpile. These resources represent bulk materials held by the
 * city and are used directly by construction, trade, and response systems.
 *
 * Existing saves never had a capacity field. Their current balance is not
 * deleted on load; if it is above the new structural capacity, it remains
 * available and future positive gains wait until the balance falls below the
 * new limit.
 */
export type ResourceStoragePolicyKind =
  | "expandable_storage"
  | "fixed_reserve"
  | "intentionally_uncapped_reserve"
  | "perishable_flow"
  | "separate_logistics_stockpile";

export type ResourceStoragePolicy = {
  kind: ResourceStoragePolicyKind;
  label: string;
  description: string;
};

/**
 * The authoritative storage contract for every top-level resource. Keep this
 * table complete when Resources gains a field: it is also covered by the
 * resource-storage regression tests.
 */
export const RESOURCE_STORAGE_POLICIES: Record<keyof Resources, ResourceStoragePolicy> = {
  credits: {
    kind: "intentionally_uncapped_reserve",
    label: "Uncapped treasury",
    description: "Credits accumulate without a gameplay ceiling; the sanitizer's large-number limit is corruption protection only.",
  },
  food: {
    kind: "expandable_storage",
    label: "Expandable food reserve",
    description: "Food is a perishable reserve with a 1,000-unit base capacity; Agricultural Dome Districts add 1,000 units each.",
  },
  water: {
    kind: "perishable_flow",
    label: "Perishable flow",
    description: "Water is produced and consumed as a live reserve. It has no warehouse cap; shortages are the limit that matters.",
  },
  power: {
    kind: "expandable_storage",
    label: "Grid buffer",
    description: "The power buffer starts at 5,000 MW and expands by 200 MW per Energy Storage Vault; deficits can run to the brownout floor.",
  },
  steel: {
    kind: "expandable_storage",
    label: "Expandable storage",
    description: "Steel storage starts at 1,000 tons and gains 5,000 tons per Supply Chain Distribution Center.",
  },
  goods: {
    kind: "expandable_storage",
    label: "Expandable storage",
    description: "Goods storage starts at 1,000 units and gains 5,000 units per Supply Chain Distribution Center.",
  },
  fuel: {
    kind: "expandable_storage",
    label: "Expandable reserve",
    description: "The city fuel reserve starts at 5,000 barrels and gains 2,000 barrels per Fuel Reserve Tank Farm. Military and commodity stockpiles are separate logistics records.",
  },
  medSupplies: {
    kind: "expandable_storage",
    label: "Expandable storage",
    description: "Medical storage starts at 5,000 units and expands with clinics, response HQs, stations, and emergency depots.",
  },
  ammo: {
    kind: "intentionally_uncapped_reserve",
    label: "Uncapped reserve",
    description: "The city ammunition reserve has no gameplay ceiling; logistics stockpiles are tracked separately when present.",
  },
};

/** `stockpiles` is intentionally open-ended because each commodity/munition
 * id is its own logistics ledger entry and there is no universal warehouse
 * capacity for that catalog. */
export const LOGISTICS_STOCKPILE_POLICY: ResourceStoragePolicy = {
  kind: "separate_logistics_stockpile",
  label: "Separate logistics stockpile",
  description: "Commodity and field-supply entries are open-ended per-item logistics records, not top-level city reserves.",
};

/** Military-facing stockpile entries. These are deliberately not part of
 * RESOURCE_STORAGE_POLICIES because no per-item gameplay capacity exists. */
export const MILITARY_LOGISTICS_STOCKPILE_KEYS = ["ammo", "fuel", "vehicleParts"] as const;
export type MilitaryLogisticsStockpileKey = (typeof MILITARY_LOGISTICS_STOCKPILE_KEYS)[number];

export function getLogisticsStockpileBalance(
  state: Pick<GameState, "stockpiles">,
  key: string,
): number {
  const balance = state.stockpiles?.[key] ?? 0;
  return Number.isFinite(balance) ? Math.max(0, balance) : 0;
}

export const STORAGE_RESOURCE_KEYS: readonly StorageResourceKey[] = ["food", "steel", "goods", "fuel", "medSupplies", "power"];
export const BASE_MATERIAL_STORAGE = 1_000;
export const STORAGE_PER_DISTRIBUTION_CENTER = 5_000;
export const STORAGE_BUILDING_KEY = "supplyChainDistributionCenters";
export const BASE_FOOD_STORAGE = 1_000;
export const FOOD_STORAGE_PER_DOME = 1_000;
export const FOOD_STORAGE_BUILDING_KEY = "agriculturalDomeDistrict";
export const BASE_POWER_STORAGE = 5_000;
export const POWER_STORAGE_PER_VAULT = 200;
export const POWER_RESERVE_FLOOR = -1_000;
export const BASE_FUEL_STORAGE = 5_000;
/** Backward-compatible name for callers that only need the zero-building baseline. */
export const FUEL_STORAGE_CAPACITY = BASE_FUEL_STORAGE;
export const FUEL_STORAGE_PER_TANK_FARM = 2_000;
export const FUEL_STORAGE_BUILDING_KEY = "fuelReserveTankFarms";
export const BASE_MEDICAL_STORAGE = 5_000;
export const MEDICAL_STORAGE_BUILDINGS: readonly { key: string; capacity: number }[] = [
  { key: "publicHealthMegaClinics", capacity: 1_000 },
  { key: "emergencyDisasterResponseHQ", capacity: 1_000 },
  { key: "emergencyServiceStations", capacity: 500 },
  { key: "seasonalEmergencyDepots", capacity: 1_000 },
];

export type SelectedBuildingStorageContribution = {
  key: string;
  label: string;
  capacity: Partial<Record<StorageResourceKey, number>>;
};

/**
 * The small set of buildings whose primary construction value includes
 * reserve room. Keep this list explicit so unrelated buildings cannot
 * accidentally become storage infrastructure.
 */
export const SELECTED_BUILDING_STORAGE_CONTRIBUTIONS: readonly SelectedBuildingStorageContribution[] = [
  { key: "wholesaleDistributionDepots", label: "Wholesale Distribution Depots", capacity: { goods: 500 } },
  { key: "freightLogisticsMegaHub", label: "Freight Logistics Mega Hub", capacity: { steel: 750, goods: 750 } },
  { key: "harborExpansionDistrict", label: "Harbor Expansion District", capacity: { goods: 500 } },
  { key: "packagingAndCratingPlant", label: "Packaging & Crating Plant", capacity: { goods: 250 } },
  { key: "agriculturalDomeDistrict", label: "Agricultural Dome District", capacity: { food: 1_000 } },
];

export type SelectedBuildingStorageStatus = SelectedBuildingStorageContribution & {
  count: number;
  contribution: Partial<Record<StorageResourceKey, number>>;
};
function isStorageResourceKey(resource: keyof Resources): resource is StorageResourceKey {
  return STORAGE_RESOURCE_KEYS.includes(resource as StorageResourceKey);
}

export type ResourceStorageStatus = {
  resource: StorageResourceKey;
  current: number;
  capacity: number;
  available: number;
  structuralCapacity: number;
  legacyOverflow: number;
  isFull: boolean;
  percent: number;
};

export type StoragePlanContributor = {
  key: string;
  label: string;
  count: number;
  capacityPerBuilding: number;
  contribution: number;
};

export type ResourceStoragePlanEntry = ResourceStorageStatus & {
  label: string;
  policy: ResourceStoragePolicy;
  contributors: StoragePlanContributor[];
  nextUpgrade: StoragePlanContributor | null;
};

type StorageState = Pick<GameState, "resources" | "buildings">;

function buildingCount(
  stateOrBuildings: StorageState | Record<string, number>,
  key: string,
): number {
  const buildings = ("buildings" in stateOrBuildings && typeof stateOrBuildings.buildings === "object")
    ? stateOrBuildings.buildings as Record<string, number>
    : stateOrBuildings as Record<string, number>;
  const count = buildings?.[key] ?? 0;
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

export function getResourceStorageCapacity(
  stateOrBuildings: StorageState | Record<string, number>,
  resource: StorageResourceKey,
): number {
  if (resource === "fuel") {
    return BASE_FUEL_STORAGE +
      buildingCount(stateOrBuildings, FUEL_STORAGE_BUILDING_KEY) * FUEL_STORAGE_PER_TANK_FARM;
  }
  if (resource === "food") {
    return BASE_FOOD_STORAGE + buildingCount(stateOrBuildings, FOOD_STORAGE_BUILDING_KEY) * FOOD_STORAGE_PER_DOME +
      SELECTED_BUILDING_STORAGE_CONTRIBUTIONS
        .filter((building) => building.key !== FOOD_STORAGE_BUILDING_KEY)
        .reduce((capacity, building) => capacity + buildingCount(stateOrBuildings, building.key) * (building.capacity.food ?? 0), 0);
  }
  if (resource === "power") {
    return BASE_POWER_STORAGE + buildingCount(stateOrBuildings, "energyStorageVaults") * POWER_STORAGE_PER_VAULT;
  }
  if (resource === "medSupplies") {
    return BASE_MEDICAL_STORAGE + MEDICAL_STORAGE_BUILDINGS.reduce(
      (capacity, building) => capacity + buildingCount(stateOrBuildings, building.key) * building.capacity,
      0,
    );
  }
  const selectedCapacity = SELECTED_BUILDING_STORAGE_CONTRIBUTIONS.reduce(
    (capacity, building) => capacity + buildingCount(stateOrBuildings, building.key) * (building.capacity[resource] ?? 0),
    0,
  );
  return BASE_MATERIAL_STORAGE + buildingCount(stateOrBuildings, STORAGE_BUILDING_KEY) * STORAGE_PER_DISTRIBUTION_CENTER + selectedCapacity;
}

export function getSelectedBuildingStorageStatuses(
  stateOrBuildings: StorageState | Record<string, number>,
): SelectedBuildingStorageStatus[] {
  return SELECTED_BUILDING_STORAGE_CONTRIBUTIONS.map((building) => {
    const count = buildingCount(stateOrBuildings, building.key);
    const contribution = Object.fromEntries(
      Object.entries(building.capacity).map(([resource, capacity]) => [resource, count * (capacity ?? 0)]),
    ) as Partial<Record<StorageResourceKey, number>>;
    return { ...building, count, contribution };
  });
}

export function getResourceStorageStatus(
  state: Pick<GameState, "resources" | "buildings">,
  resource: StorageResourceKey,
): ResourceStorageStatus {
  const rawCurrent = Number.isFinite(state.resources[resource]) ? state.resources[resource] : 0;
  const current = resource === "power" ? rawCurrent : Math.max(0, rawCurrent);
  const structuralCapacity = getResourceStorageCapacity(state, resource);
  const legacyOverflow = Math.max(0, current - structuralCapacity);
  return {
    resource,
    current,
    // The displayed capacity includes a legacy balance above the new limit so
    // old saves remain legible instead of showing an impossible negative room.
    capacity: Math.max(structuralCapacity, current),
    available: Math.max(0, structuralCapacity - current),
    structuralCapacity,
    legacyOverflow,
    isFull: current >= structuralCapacity,
    percent: structuralCapacity > 0 ? Math.min(100, (current / structuralCapacity) * 100) : 0,
  };
}

const STORAGE_RESOURCE_LABELS: Record<StorageResourceKey, string> = {
  food: "Food",
  steel: "Steel",
  goods: "Goods",
  fuel: "Fuel",
  medSupplies: "Medical Supplies",
  power: "Power",
};

const STORAGE_PLAN_CONTRIBUTORS: Record<StorageResourceKey, readonly { key: string; label: string; capacity: number }[]> = {
  food: [{ key: FOOD_STORAGE_BUILDING_KEY, label: "Agricultural Dome District", capacity: FOOD_STORAGE_PER_DOME }],
  steel: [
    { key: STORAGE_BUILDING_KEY, label: "Supply Chain Distribution Centers", capacity: STORAGE_PER_DISTRIBUTION_CENTER },
    ...SELECTED_BUILDING_STORAGE_CONTRIBUTIONS
      .filter((building) => (building.capacity.steel ?? 0) > 0)
      .map((building) => ({ key: building.key, label: building.label, capacity: building.capacity.steel ?? 0 })),
  ],
  goods: [
    { key: STORAGE_BUILDING_KEY, label: "Supply Chain Distribution Centers", capacity: STORAGE_PER_DISTRIBUTION_CENTER },
    ...SELECTED_BUILDING_STORAGE_CONTRIBUTIONS
      .filter((building) => (building.capacity.goods ?? 0) > 0)
      .map((building) => ({ key: building.key, label: building.label, capacity: building.capacity.goods ?? 0 })),
  ],
  fuel: [{ key: FUEL_STORAGE_BUILDING_KEY, label: "Fuel Reserve Tank Farms", capacity: FUEL_STORAGE_PER_TANK_FARM }],
  medSupplies: MEDICAL_STORAGE_BUILDINGS.map((building) => ({
    key: building.key,
    label: building.key === "publicHealthMegaClinics"
      ? "Public Health Mega Clinics"
      : building.key === "emergencyDisasterResponseHQ"
        ? "Disaster Response HQs"
        : building.key === "emergencyServiceStations"
          ? "Emergency Service Stations"
          : "Seasonal Emergency Depots",
    capacity: building.capacity,
  })),
  power: [{ key: "energyStorageVaults", label: "Energy Storage Vaults", capacity: POWER_STORAGE_PER_VAULT }],
};

/** One readout model for the Economy screen and any future storage planner. */
export function getResourceStoragePlan(
  state: Pick<GameState, "resources" | "buildings">,
): ResourceStoragePlanEntry[] {
  return STORAGE_RESOURCE_KEYS.map((resource) => {
    const status = getResourceStorageStatus(state, resource);
    const contributors = STORAGE_PLAN_CONTRIBUTORS[resource].map((source) => {
      const count = buildingCount(state, source.key);
      return {
        key: source.key,
        label: source.label,
        count,
        capacityPerBuilding: source.capacity,
        contribution: count * source.capacity,
      };
    });
    return {
      ...status,
      label: STORAGE_RESOURCE_LABELS[resource],
      policy: RESOURCE_STORAGE_POLICIES[resource],
      contributors,
      nextUpgrade: contributors.find((source) => source.count === 0) ?? contributors[0] ?? null,
    };
  });
}

/**
 * Medical consumption is deliberately independent from storage capacity. Both
 * live ticks and offline catch-up use this helper so a pause cannot turn
 * response consumption into free production.
 */
export function getMedicalSupplyConsumption(
  state: Pick<GameState, "cityStats">,
): number {
  const population = Number.isFinite(state.cityStats.population) ? state.cityStats.population : 0;
  const diseaseRisk = Number.isFinite(state.cityStats.diseaseRisk) ? state.cityStats.diseaseRisk : 0;
  return Math.floor(population / 40_000) +
    (diseaseRisk > 50 ? Math.floor((diseaseRisk - 50) * 0.2) : 0);
}

export type ResourceDeltaResult = {
  applied: number;
  rejected: number;
};

export const MEDICAL_STORAGE_GUIDANCE =
  "Open Economy to check the medical storage readout; build medical and response buildings to expand the reserve.";

export const FOOD_STORAGE_GUIDANCE =
  "Open Economy to check the food storage readout; build Agricultural Dome Districts to expand the reserve.";

/**
 * Keep medical reward feedback consistent across tick entries and reward
 * summaries. `applied` is the amount that actually entered the reserve;
 * `rejected` is the amount refused by the storage ceiling.
 */
export function summarizeMedicalStorageGain(result: ResourceDeltaResult): string {
  const accepted = Math.max(0, result.applied);
  const rejected = Math.max(0, result.rejected);
  if (rejected > 0) {
    return `+${accepted.toLocaleString()} medical supplies stored; +${rejected.toLocaleString()} rejected because the reserve is full. ${MEDICAL_STORAGE_GUIDANCE}`;
  }
  return `+${accepted.toLocaleString()} medical supplies stored.`;
}

/**
 * Explain how much of a map food reward entered the reserve. A legacy save can
 * still contain food above the current structural capacity; that balance is
 * deliberately preserved and remains available for consumption, but new food
 * cannot be added until the reserve drops below the capacity.
 */
export function summarizeFoodStorageGain(
  state: Pick<GameState, "resources" | "buildings">,
  result: ResourceDeltaResult,
): string {
  const accepted = Math.max(0, result.applied);
  const rejected = Math.max(0, result.rejected);
  if (rejected > 0) {
    const status = getResourceStorageStatus(state, "food");
    const legacyNote = status.legacyOverflow > 0
      ? "Food consumption still works; the legacy surplus remains available."
      : "Food consumption still works while the reserve is full.";
    return `+${accepted.toLocaleString()} food stored; +${rejected.toLocaleString()} rejected because the reserve is full. ${legacyNote} ${FOOD_STORAGE_GUIDANCE}`;
  }
  return `+${accepted.toLocaleString()} food stored.`;
}

/**
 * Apply a resource delta while respecting each bounded reserve's gameplay
 * ceiling. Negative deltas always apply (down to the power brownout floor);
 * only positive additions can be rejected.
 */
export function applyResourceDelta(
  state: Pick<GameState, "resources" | "buildings">,
  resource: keyof Resources,
  delta: number,
): ResourceDeltaResult {
  const current = Number.isFinite(state.resources[resource]) ? state.resources[resource] : 0;
  if (!Number.isFinite(delta) || delta === 0) return { applied: 0, rejected: 0 };

  if (!isStorageResourceKey(resource)) {
    const next = Math.max(0, current + delta);
    state.resources[resource] = next;
    return { applied: next - current, rejected: 0 };
  }

  if (delta < 0) {
    const next = resource === "power"
      ? Math.max(POWER_RESERVE_FLOOR, current + delta)
      : Math.max(0, current + delta);
    state.resources[resource] = next;
    return { applied: next - current, rejected: 0 };
  }

  const capacity = getResourceStorageCapacity(state, resource);
  const accepted = Math.min(delta, Math.max(0, capacity - current));
  state.resources[resource] = current + accepted;
  return { applied: accepted, rejected: delta - accepted };
}

export function getMaterialStorageSummary(state: Pick<GameState, "resources" | "buildings">): {
  distributionCenters: number;
  capacityPerResource: number;
  steel: ResourceStorageStatus;
  goods: ResourceStorageStatus;
} {
  const distributionCenters = buildingCount(state, STORAGE_BUILDING_KEY);
  return {
    distributionCenters,
    capacityPerResource: BASE_MATERIAL_STORAGE + distributionCenters * STORAGE_PER_DISTRIBUTION_CENTER,
    steel: getResourceStorageStatus(state, "steel"),
    goods: getResourceStorageStatus(state, "goods"),
  };
}
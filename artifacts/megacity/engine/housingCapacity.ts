import { RESIDENTIAL_DISTRICT_BASE_CAPACITY } from "@/engine/districts";

export type HousingCapacityKind = "permanent" | "emergency";

export type HousingCapacityContribution = {
  key: string;
  label: string;
  kind: HousingCapacityKind;
  perBuilding: number;
  count: number;
  capacity: number;
};

export type HousingCapacityBuildOption = {
  key: string;
  label: string;
  kind: HousingCapacityKind;
  perBuilding: number;
  cost: number;
  steelCost: number;
  description: string;
  effect: string;
};

export type HousingCapacityRecommendationShortfall = {
  option: HousingCapacityBuildOption;
  credits: number;
  steel: number;
};

export type HousingCapacityBreakdown = {
  baseline: number;
  permanent: number;
  emergency: number;
  total: number;
  contributions: HousingCapacityContribution[];
};

export const HOUSING_CAPACITY_BUILDINGS: ReadonlyArray<HousingCapacityBuildOption> = [
  {
    key: "habBlockMegaTowers",
    label: "HAB-BLOCK MEGA TOWERS",
    kind: "permanent",
    perBuilding: 8000,
    cost: 40000,
    steelCost: 110,
    description: "Two hundred floors of humanity, stacked like a filing cabinet for people. Eight thousand souls per tower. The elevators break weekly. Nobody moves out.",
    effect: "+8,000 permanent housing, +95 tax/tick",
  },
  {
    key: "workerHousingStacks",
    label: "WORKER HOUSING STACKS",
    kind: "permanent",
    perBuilding: 4000,
    cost: 19000,
    steelCost: 40,
    description: "Minimum space, maximum occupancy. The walls are thin, the neighbours are loud, and the rent is automatically deducted. Home sweet home.",
    effect: "+4,000 permanent housing, +40 tax/tick",
  },
  {
    key: "emergencyShelterBunkers",
    label: "EMERGENCY SHELTER BUNKERS",
    kind: "emergency",
    perBuilding: 2000,
    cost: 13000,
    steelCost: 30,
    description: "Concrete boxes designed to keep people alive, not comfortable. No windows, no complaints. When the alternative is the street, this is crisis shelter, not a permanent home.",
    effect: "+2,000 emergency shelter",
  },
  {
    key: "slumRehabProjects",
    label: "SLUM REHABILITATION PROJECTS",
    kind: "permanent",
    perBuilding: 4000,
    cost: 48000,
    steelCost: 55,
    description: "Tear down the worst, build something merely bad. The residents get relocated, the rubble gets recycled, and the area gets a new name. Progress.",
    effect: "+4,000 permanent housing, -unrest, +happiness, +loyalty",
  },
  {
    key: "modularHousingFactories",
    label: "MODULAR HOUSING FACTORIES",
    kind: "permanent",
    perBuilding: 6000,
    cost: 35000,
    steelCost: 70,
    description: "Prefab units stamped out like biscuits and stacked like containers. Assembly takes 72 hours. The warranty expires in about the same time.",
    effect: "+6,000 permanent housing, fast build",
  },
  {
    key: "highDensityResidentialPlatforms",
    label: "HIGH-DENSITY RESIDENTIAL",
    kind: "permanent",
    perBuilding: 12000,
    cost: 64000,
    steelCost: 140,
    description: "Sky-level living platforms suspended between mega-towers. The view is spectacular. The vertigo is free. Premium citizens only.",
    effect: "+12,000 permanent housing, +150 tax/tick",
  },
  {
    key: "transitIntegratedHousingNodes",
    label: "TRANSIT-INTEGRATED HOUSING",
    kind: "permanent",
    perBuilding: 5000,
    cost: 56000,
    steelCost: 100,
    description: "Live above the rail line, commute by stepping downstairs. The vibrations rattle the dishes but the commute time is zero.",
    effect: "+5,000 permanent housing, -unrest",
  },
  {
    key: "undergroundShelterNetworks",
    label: "UNDERGROUND SHELTER NETWORKS",
    kind: "emergency",
    perBuilding: 3000,
    cost: 32000,
    steelCost: 55,
    description: "A labyrinth of bunkers beneath the city. Nobody wants to live down here, but when the bombs fall, everyone will be glad they exist.",
    effect: "+3,000 emergency shelter",
  },
  {
    key: "refugeeProcessingHousing",
    label: "REFUGEE PROCESSING HOUSING",
    kind: "permanent",
    perBuilding: 3000,
    cost: 24000,
    steelCost: 40,
    description: "Where the newcomers go first. Sterile, efficient, temporary. Some have been 'temporarily' housed here for three years.",
    effect: "+3,000 permanent housing intake, -unrest spike",
  },
  {
    key: "luxuryPenthouseTowers",
    label: "LUXURY PENTHOUSE TOWERS",
    kind: "permanent",
    perBuilding: 1000,
    cost: 80000,
    steelCost: 170,
    description: "For the city's elite: panoramic views, private elevators, and a profound detachment from the chaos below. The tax revenue almost justifies the resentment.",
    effect: "+1,000 permanent housing, +150 tax/tick",
  },
  {
    key: "microApartmentHives",
    label: "MICRO-APARTMENT HIVES",
    kind: "permanent",
    perBuilding: 4000,
    cost: 13000,
    steelCost: 20,
    description: "Capsule living. Two metres by three. Bed folds into desk, desk folds into wall, dignity folds into whatever fits. But it's a roof.",
    effect: "+4,000 permanent housing, -happiness",
  },
  {
    key: "seniorCitizenComplexes",
    label: "SENIOR CITIZEN COMPLEXES",
    kind: "permanent",
    perBuilding: 2000,
    cost: 29000,
    steelCost: 40,
    description: "Quiet floors, medical staff on call, and corridors wide enough for hover-chairs. The elderly earned this. The city can afford the kindness.",
    effect: "+2,000 permanent housing, +happiness",
  },
  {
    key: "studentDormitoryBlocks",
    label: "STUDENT DORMITORY BLOCKS",
    kind: "permanent",
    perBuilding: 1500,
    cost: 22000,
    steelCost: 30,
    description: "Cramped rooms, shared kitchens, and the smell of instant noodles at 3am. The future leaders of the city live here. They'll move up. Eventually.",
    effect: "+1,500 permanent housing, +research",
  },
  {
    key: "constructionCrewBarracks",
    label: "CONSTRUCTION CREW BARRACKS",
    kind: "permanent",
    perBuilding: 1000,
    cost: 16000,
    steelCost: 20,
    description: "Rough bunk rooms near the build sites. The crews live where they work. The food is bad, the beds are hard, and the overtime is mandatory.",
    effect: "+construction speed, +employment",
  },
];

/**
 * Pick the largest one-building capacity gain that the city can place right
 * now. This is deliberately read-only: it only describes the next useful
 * card, while construction remains an explicit player action.
 */
export function getBestBuildableHousingCapacityOption({
  credits = 0,
  steel = 0,
  availableQueueSlots = 1,
}: {
  credits?: number;
  steel?: number;
  availableQueueSlots?: number;
} = {}): HousingCapacityBuildOption | null {
  if (availableQueueSlots <= 0) return null;

  const availableCredits = Number.isFinite(credits) ? Math.max(0, credits) : 0;
  const availableSteel = Number.isFinite(steel) ? Math.max(0, steel) : 0;
  return HOUSING_CAPACITY_BUILDINGS
    .filter((entry) => entry.cost <= availableCredits && entry.steelCost <= availableSteel)
    .sort((a, b) =>
      b.perBuilding - a.perBuilding ||
      (a.kind === "permanent" ? -1 : 1) - (b.kind === "permanent" ? -1 : 1) ||
      a.cost - b.cost ||
      a.key.localeCompare(b.key),
    )[0] ?? null;
}

/**
 * Find the cheapest catalog option and report the exact resources still needed
 * when no one-building option is affordable. Queue capacity is intentionally
 * part of this readout: a full queue is not a resource shortfall.
 */
export function getHousingCapacityRecommendationShortfall({
  credits = 0,
  steel = 0,
  availableQueueSlots = 1,
}: {
  credits?: number;
  steel?: number;
  availableQueueSlots?: number;
} = {}): HousingCapacityRecommendationShortfall | null {
  if (availableQueueSlots <= 0) return null;

  const availableCredits = Number.isFinite(credits) ? Math.max(0, credits) : 0;
  const availableSteel = Number.isFinite(steel) ? Math.max(0, steel) : 0;
  if (
    HOUSING_CAPACITY_BUILDINGS.some(
      (entry) => entry.cost <= availableCredits && entry.steelCost <= availableSteel,
    )
  ) {
    return null;
  }

  const option = [...HOUSING_CAPACITY_BUILDINGS].sort(
    (a, b) =>
      a.cost - b.cost ||
      a.steelCost - b.steelCost ||
      a.key.localeCompare(b.key),
  )[0];
  return {
    option,
    credits: Math.max(0, option.cost - availableCredits),
    steel: Math.max(0, option.steelCost - availableSteel),
  };
}

/**
 * Explain why no one-building housing option can be recommended. Keep this
 * beside the catalog so the capacity panel names the same resource and queue
 * constraints that determine the recommendation.
 */
export function getHousingCapacityRecommendationBlocker({
  credits = 0,
  steel = 0,
  availableQueueSlots = 1,
}: {
  credits?: number;
  steel?: number;
  availableQueueSlots?: number;
} = {}): string {
  if (availableQueueSlots <= 0) {
    return "No one-building housing option can be queued: the timed-order queue is full.";
  }

  const availableCredits = Number.isFinite(credits) ? Math.max(0, credits) : 0;
  const availableSteel = Number.isFinite(steel) ? Math.max(0, steel) : 0;
  const creditsCoverAnOption = HOUSING_CAPACITY_BUILDINGS.some(
    (entry) => entry.cost <= availableCredits,
  );
  const steelCoversAnOption = HOUSING_CAPACITY_BUILDINGS.some(
    (entry) => entry.steelCost <= availableSteel,
  );
  const blockers = [
    !creditsCoverAnOption ? "credits" : null,
    !steelCoversAnOption ? "steel" : null,
  ].filter((resource): resource is string => resource !== null);

  if (blockers.length === 2) {
    return "No one-building housing option is affordable: more credits and steel are required.";
  }
  if (blockers[0] === "credits") {
    return "No one-building housing option is affordable: more credits are required.";
  }
  if (blockers[0] === "steel") {
    return "No one-building housing option is affordable: more steel is required.";
  }
  return "No one-building housing option is currently affordable.";
}

/**
 * Total shelter available to the city. Keep this in a leaf module so
 * demographic cohorts, housing pressure, and the tick formulas all use the
 * same capacity without importing one another.
 */
export function computeHousingCapacityBreakdown(
  buildings: Record<string, number> = {},
): HousingCapacityBreakdown {
  const b = (key: string) => {
    const value = buildings[key];
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  };
  const contributions = HOUSING_CAPACITY_BUILDINGS.map((entry) => {
    const count = b(entry.key);
    return {
      ...entry,
      count,
      capacity: count * entry.perBuilding,
    };
  });
  const permanent = contributions
    .filter((entry) => entry.kind === "permanent")
    .reduce((sum, entry) => sum + entry.capacity, 0);
  const emergency = contributions
    .filter((entry) => entry.kind === "emergency")
    .reduce((sum, entry) => sum + entry.capacity, 0);

  return {
    baseline: RESIDENTIAL_DISTRICT_BASE_CAPACITY,
    permanent,
    emergency,
    total: RESIDENTIAL_DISTRICT_BASE_CAPACITY + permanent + emergency,
    contributions,
  };
}

export function computeHousingCapacity(
  buildings: Record<string, number> = {},
): number {
  return computeHousingCapacityBreakdown(buildings).total;
}
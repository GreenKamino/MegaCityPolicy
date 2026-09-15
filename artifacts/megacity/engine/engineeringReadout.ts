import type { GameState } from "@/engine/types";

export const RUST_WARDENS_ID = "rust-wardens";

export type EngineeringPosture = "STABLE" | "STRAINED" | "CRITICAL";
export type EngineeringSignalTone = "good" | "warn" | "bad" | "neutral";

export type EngineeringGroup =
  | "maintenance"
  | "utilities"
  | "construction"
  | "sanitation"
  | "heavyIndustry";

/**
 * These are deliberately not all called workers. A unit entry can be a
 * standing team, a building can be a facility, and a droid is a machine.
 * Keeping those distinctions in the readout prevents the Warden panel from
 * implying that every number is a headcount.
 */
export type EngineeringRoleKind =
  | "workers"
  | "machines"
  | "teams"
  | "facilities"
  | "population-estimate";

export type EngineeringRoleSource =
  | "units"
  | "buildings"
  | "construction"
  | "utilities"
  | "mining_operations"
  | "population";

export type EngineeringRole = {
  id: string;
  label: string;
  group: EngineeringGroup;
  kind: EngineeringRoleKind;
  source: EngineeringRoleSource;
  sourceLabel: string;
  value: number;
};

export type EngineeringLedger = {
  roles: EngineeringRole[];
  byGroup: Record<EngineeringGroup, EngineeringRole[]>;
  totals: Record<EngineeringRoleKind, number>;
  workforce: number;
  queuedWorkUnits: number;
  remainingWorkTicks: number;
  activeMiningOperations: number;
  miningVehicles: number;
  utilityShortage: number;
  constructionShortage: number;
  shortage: number;
  operationalScore: number;
};

export type EngineeringSignal = {
  label: string;
  value: string;
  tone: EngineeringSignalTone;
};

export type EngineeringReadout = {
  faction: NonNullable<GameState["factions"][number]>;
  posture: EngineeringPosture;
  postureNote: string;
  infrastructureHealth: number;
  workforce: number;
  worksQueued: number;
  ledger: EngineeringLedger;
  gridMargin: number;
  waterMargin: number;
  wasteBacklog: number;
  operationalScore: number;
  industrialOutput: number;
  signals: EngineeringSignal[];
};

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const nonNegative = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

const rounded = (value: number): number => Math.max(0, Math.round(value));

const toneFor = (value: number, inverted = false): EngineeringSignalTone => {
  const score = inverted ? 100 - value : value;
  return score >= 65 ? "good" : score >= 40 ? "warn" : "bad";
};

const SOURCE_LABELS: Record<EngineeringRoleSource, string> = {
  units: "unit roster",
  buildings: "building count",
  construction: "construction queue",
  utilities: "utility telemetry",
  mining_operations: "mining operations",
  population: "population estimate",
};

const GROUPS: EngineeringGroup[] = [
  "maintenance",
  "utilities",
  "construction",
  "sanitation",
  "heavyIndustry",
];

function sumKeys(record: Record<string, number>, keys: string[]): number {
  return keys.reduce((total, key) => total + nonNegative(record[key]), 0);
}

function createEngineeringLedger(state: GameState): EngineeringLedger {
  const cityStats = state.cityStats ?? ({} as GameState["cityStats"]);
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const units = (state.units ?? {}) as Record<string, number>;
  const population = nonNegative(cityStats.population);
  const add = (
    roles: EngineeringRole[],
    id: string,
    label: string,
    group: EngineeringGroup,
    kind: EngineeringRoleKind,
    source: EngineeringRoleSource,
    value: number,
  ) => {
    roles.push({
      id,
      label,
      group,
      kind,
      source,
      sourceLabel: SOURCE_LABELS[source],
      value: rounded(value),
    });
  };
  const roles: EngineeringRole[] = [];
  const unit = (key: string) => nonNegative(units[key]);
  const building = (key: string) => nonNegative(buildings[key]);
  const buildingsTotal = (keys: string[]) => sumKeys(buildings, keys);
  const unitsTotal = (keys: string[]) => sumKeys(units, keys);

  // Maintenance: named people are only estimated when the game has no
  // dedicated roster for them. Repair and utility units remain teams.
  add(roles, "mechanics", "Mechanics", "maintenance", "teams", "units",
    unit("infrastructureRepairTeams") + unit("utilityMaintenanceSquads"));
  add(roles, "electricians", "Electricians", "maintenance", "population-estimate", "population",
    population * 0.005);
  add(roles, "plumbers", "Plumbers", "maintenance", "population-estimate", "population",
    population * 0.004);
  add(roles, "maintenance_facilities", "Maintenance facilities", "maintenance", "facilities", "buildings",
    building("vehicleMaintenanceDepots"));
  add(roles, "maintenance_machines", "Maintenance machines", "maintenance", "machines", "units",
    unit("utilityRepairDroid") + unit("vehicleMaintenanceDepots"));

  // Utilities use the actual power/water installation keys from formulas.ts.
  // No invented waterPurificationStations or fusionMicroReactors aliases.
  const powerFacilities = buildingsTotal([
    "fusionReactors", "solarTowerFields", "microFusionGenerators",
    "geothermalWells", "powerGridStabilizers", "energyStorageVaults",
    "emergencyPowerBackup", "reactorCoolingTowers", "gridLoadBalancingAI",
    "hvTransmissionLines",
  ]);
  const waterFacilities = buildingsTotal([
    "atmosphericHarvestTowers", "megaDesalinationPlants",
    "waterRecyclingSuperFacilities", "sewerPurificationPlants",
    "undergroundWaterReservoirs", "waterPumpStations",
    "emergencyWaterDepots", "stormwaterCaptureSystems",
    "aquiferStabilizationDrills", "smartWaterDistributionGrid",
  ]);
  add(roles, "power_technicians", "Power technicians", "utilities", "teams", "units",
    unit("powerPlantEngineers"));
  add(roles, "water_technicians", "Water technicians", "utilities", "population-estimate", "population",
    population * 0.004);
  add(roles, "utility_facilities", "Power and water facilities", "utilities", "facilities", "buildings",
    powerFacilities + waterFacilities);
  add(roles, "utility_machines", "Utility machines", "utilities", "machines", "units",
    unit("utilityRepairDroid") + unit("commsRelayDroid") + unit("trafficControlDroid"));

  // Construction separates the standing crews from the queued work and the
  // automation that supplements them.
  add(roles, "construction_workers", "Construction workers", "construction", "teams", "units",
    unit("constructionCrews"));
  add(roles, "construction_facilities", "Construction facilities", "construction", "facilities", "buildings",
    buildingsTotal([
      "constructionCrewBarracks", "constructionMaterialRefineries",
      "modularHousingFactories",
    ]));
  add(roles, "construction_machines", "Construction machines", "construction", "machines", "units",
    unitsTotal([
      "heavyLifterDroid", "weldingFabricatorDroid", "excavatorDroid",
      "structuralScannerDroid", "pipeLayerDroid",
    ]));

  // Sanitation is mostly a civic service signal. The game has machine and
  // facility telemetry, but no dedicated sanitation worker roster, so the
  // human roles remain explicitly marked as estimates.
  add(roles, "sanitation_engineers", "Sanitation engineers", "sanitation", "population-estimate", "population",
    population * 0.005);
  add(roles, "waste_disposal", "Waste disposal crews", "sanitation", "population-estimate", "population",
    population * 0.004);
  add(roles, "recyclers", "Recyclers", "sanitation", "workers", "units",
    unit("recyclingFacilityWorkers"));
  add(roles, "sanitation_facilities", "Sanitation facilities", "sanitation", "facilities", "buildings",
    buildingsTotal([
      "waterRecyclingSuperFacilities", "sewerPurificationPlants",
      "industrialRecyclingFacilities", "nutrientRecyclingCenters",
    ]));
  add(roles, "sanitation_machines", "Sanitation machines", "sanitation", "machines", "units",
    unitsTotal([
      "sanitationDroid", "wasteProcessorDroid", "streetSweeperDroid",
    ]));

  // Heavy industry keeps mining crews, mine-site workers, and their vehicles
  // legible instead of folding them into generic infrastructure.
  const activeMiningOperations = (state.miningOperations ?? []).filter(
    operation => operation.active !== false,
  );
  const miningWorkers = activeMiningOperations.reduce(
    (total, operation) => total + nonNegative(operation.workers), 0,
  );
  const miningVehicles = activeMiningOperations.reduce(
    (total, operation) => total + Object.values(operation.vehicles ?? {}).reduce(
      (vehicleTotal, count) => vehicleTotal + nonNegative(count), 0,
    ), 0,
  );
  add(roles, "welders", "Welders", "heavyIndustry", "population-estimate", "population",
    population * 0.005);
  add(roles, "mining_crews", "Mining crews", "heavyIndustry", "teams", "units",
    unit("miningCrews"));
  add(roles, "mining_site_workers", "Mining site workers", "heavyIndustry", "workers", "mining_operations",
    miningWorkers);
  add(roles, "mining_machines", "Mining vehicles", "heavyIndustry", "machines", "mining_operations",
    miningVehicles);
  add(roles, "heavy_industry_facilities", "Heavy-industry facilities", "heavyIndustry", "facilities", "buildings",
    buildingsTotal([
      "megaManufacturingPlants", "metalFoundryComplexes",
      "roboticsFabricationFacilities", "constructionMaterialRefineries",
      "industrialRecyclingFacilities", "advancedMaterialsRefineries",
    ]));

  const pending = state.pendingConstructions ?? [];
  const queuedWorkUnits = pending.reduce(
    (total, order) => total + (nonNegative(order.count) || 1), 0,
  );
  const remainingWorkTicks = pending.reduce(
    (total, order) => total + (nonNegative(order.ticksRemaining) || 1) *
      (nonNegative(order.count) || 1), 0,
  );
  const constructionTeams = unit("constructionCrews");
  const constructionShortage = pending.length === 0
    ? 0
    : rounded(clamp(
      (queuedWorkUnits / Math.max(1, constructionTeams * 2)) * 100,
    ));

  const powerGeneration = nonNegative(state.rates?.powerGeneration);
  const powerDrain = nonNegative(state.rates?.powerDrain);
  const waterProduction = nonNegative(state.rates?.waterProduction);
  const waterConsumption = nonNegative(state.rates?.waterConsumption);
  const wasteGenerated = nonNegative(state.utilities?.wasteGenerated);
  const wasteProcessed = nonNegative(state.utilities?.wasteProcessed);
  const powerDeficit = Math.max(0, powerDrain - powerGeneration);
  const waterDeficit = Math.max(0, waterConsumption - waterProduction);
  const wasteBacklog = Math.max(0, wasteGenerated - wasteProcessed);
  const utilityShortage = rounded(clamp(
    (powerDeficit / Math.max(100, powerDrain)) * 45 +
    (waterDeficit / Math.max(100, waterConsumption)) * 35 +
    (wasteBacklog / Math.max(100, wasteGenerated)) * 20,
  ));
  const shortage = rounded(clamp(
    constructionShortage * 0.55 + utilityShortage * 0.45,
  ));
  const operationalScore = rounded(clamp(100 - shortage));

  const totals = {
    workers: 0,
    machines: 0,
    teams: 0,
    facilities: 0,
    "population-estimate": 0,
  } satisfies Record<EngineeringRoleKind, number>;
  roles.forEach(role => { totals[role.kind] += role.value; });
  const byGroup = Object.fromEntries(
    GROUPS.map(group => [group, roles.filter(role => role.group === group)]),
  ) as Record<EngineeringGroup, EngineeringRole[]>;

  return {
    roles,
    byGroup,
    totals,
    workforce: totals.workers + totals.teams,
    queuedWorkUnits,
    remainingWorkTicks,
    activeMiningOperations: activeMiningOperations.length,
    miningVehicles,
    utilityShortage,
    constructionShortage,
    shortage,
    operationalScore,
  };
}

export function getEngineeringLedger(state: GameState): EngineeringLedger {
  return createEngineeringLedger(state);
}

export function getEngineeringRole(
  ledger: EngineeringLedger,
  id: string,
): EngineeringRole | undefined {
  return ledger.roles.find(role => role.id === id);
}

export function getRustWardensReadout(state: GameState): EngineeringReadout | null {
  const faction = state.factions.find(candidate => candidate.id === RUST_WARDENS_ID);
  if (!faction) return null;

  const infrastructureHealth = clamp(state.cityStats.infrastructureHealth);
  const ledger = createEngineeringLedger(state);
  const workforce = ledger.workforce;
  const worksQueued = Math.max(0, state.pendingConstructions?.length ?? 0);
  const gridMargin = Math.round(
    (state.rates.powerGeneration ?? 0) - (state.rates.powerDrain ?? 0),
  );
  const waterMargin = Math.round(
    (state.rates.waterProduction ?? 0) - (state.rates.waterConsumption ?? 0),
  );
  const wasteBacklog = Math.max(
    0,
    (state.utilities?.wasteGenerated ?? 0) - (state.utilities?.wasteProcessed ?? 0),
  );
  const industrialOutput = clamp(state.cityStats.industrialOutput ?? 50);
  const posture: EngineeringPosture =
    infrastructureHealth < 35 || gridMargin < -100 || ledger.shortage >= 70 ? "CRITICAL"
      : infrastructureHealth < 60 || worksQueued >= 5 || gridMargin < 0 || ledger.shortage >= 35 ? "STRAINED"
        : "STABLE";

  return {
    faction,
    posture,
    postureNote: posture === "CRITICAL"
      ? "Engineering shortages are approaching the civic threshold; the Wardens are demanding emergency authority."
      : posture === "STRAINED"
        ? "Maintenance backlog, utility stress, or queued works are narrowing the city's room for civic works."
        : "Repairs, machine-hours, and civic works are keeping the city's skeleton online.",
    infrastructureHealth,
    workforce,
    worksQueued,
    ledger,
    gridMargin,
    waterMargin,
    wasteBacklog,
    operationalScore: ledger.operationalScore,
    industrialOutput,
    signals: [
      { label: "Infrastructure integrity", value: `${Math.round(infrastructureHealth)}%`, tone: toneFor(infrastructureHealth) },
      { label: "Engineering workforce", value: workforce.toLocaleString(), tone: workforce > 0 ? "good" : "bad" },
      { label: "Works queue", value: String(worksQueued), tone: toneFor(Math.max(0, 100 - worksQueued * 15)) },
      { label: "Grid margin", value: `${gridMargin >= 0 ? "+" : ""}${gridMargin} power`, tone: gridMargin >= 0 ? "good" : gridMargin > -100 ? "warn" : "bad" },
      { label: "Industrial output", value: `${Math.round(industrialOutput)}%`, tone: toneFor(industrialOutput) },
    ],
  };
}
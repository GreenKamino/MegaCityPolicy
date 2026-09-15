import type { GameState } from "@/engine/types";
import { computePopulationCohorts } from "@/engine/populationCohorts";
import { getIncarcerationSummary } from "@/engine/custody";

export type WorkforceSector =
  | "industrial"
  | "service"
  | "government"
  | "research"
  | "infrastructure"
  | "security"
  | "blackMarket";

export type WorkforceSource =
  | "population"
  | "buildings"
  | "units"
  | "local_businesses"
  | "mining_operations";

export type WorkforceReconciliation =
  | "population-allocation"
  | "direct-capacity"
  | "included-citizen-subset"
  | "external-job-slots";

export type WorkforceRole = {
  id: string;
  label: string;
  sector: WorkforceSector;
  source: WorkforceSource;
  sourceLabel: string;
  value: number;
  reconciliation: WorkforceReconciliation;
};

export type WorkforceCatalog = {
  roles: WorkforceRole[];
  bySector: Record<WorkforceSector, WorkforceRole[]>;
  sectorTotals: Record<WorkforceSector, number>;
  sectorTotal: number;
  employedCitizens: number;
  unemployedCitizens: number;
  employmentRate: number;
  localEconomyJobs: number;
  indieBusinessJobs: number;
  corporateChainJobs: number;
  miningJobs: number;
  directDetailedRoleTotal: number;
  populationAllocationTotal: number;
  reconciliation: {
    explainedSectorJobs: number;
    unallocatedSectorJobs: number;
    includedSubsetJobs: number;
    countedJobSlots: number;
  };
};

const SOURCE_LABELS: Record<WorkforceSource, string> = {
  population: "population estimate",
  buildings: "building capacity",
  units: "unit roster",
  local_businesses: "local businesses",
  mining_operations: "mining operations",
};

const SECTORS: WorkforceSector[] = [
  "industrial",
  "service",
  "government",
  "research",
  "infrastructure",
  "security",
  "blackMarket",
];

const n = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

const rounded = (value: number): number => Math.max(0, Math.round(value));

/**
 * Build the one read-only workforce view used by every job readout.
 *
 * Population roles are indicators, not extra people: they describe how the
 * employed population is distributed and intentionally do not get summed with
 * the durable sector totals. Building and unit roles are direct capacity
 * signals. Local-business and mining figures are included subsets/job slots,
 * so they are reported separately and never added to employed citizens.
 */
export function getWorkforceCatalog(state: GameState): WorkforceCatalog {
  const cs = state.cityStats ?? ({} as GameState["cityStats"]);
  const dm = state.demographics ?? ({} as GameState["demographics"]);
  const b = (state.buildings ?? {}) as Record<string, number>;
  const u = (state.units ?? {}) as Record<string, number>;
  const pop = n(cs.population);
  const crime = n(cs.crime) / 100;
  const corruption = n(cs.corruption) / 100;
  const homeless = n(dm.homelessPopulation);
  const employmentRate = n(dm.employmentRate ?? cs.employment);
  // `totalWorkforce` is the durable working-age/sector model. Employed
  // citizens use the shared cohort-adjusted capacity, matching the
  // employment rate without treating sector capacity as additional people.
  const cohorts = computePopulationCohorts(state);
  const incarcerated = cohorts.prisoners;
  const custodySummary = getIncarcerationSummary(state);
  const employedCitizens = rounded(cohorts.workforceCapacity * employmentRate / 100);

  const roles: WorkforceRole[] = [];
  const add = (
    id: string,
    label: string,
    sector: WorkforceSector,
    source: WorkforceSource,
    value: number,
    reconciliation: WorkforceReconciliation = source === "population"
      ? "population-allocation"
      : source === "mining_operations"
        ? "external-job-slots"
        : "direct-capacity",
  ) => {
    roles.push({
      id,
      label,
      sector,
      source,
      sourceLabel: SOURCE_LABELS[source],
      value: rounded(value),
      reconciliation,
    });
  };
  const p = (id: string, label: string, sector: WorkforceSector, ratio: number) =>
    add(id, label, sector, "population", pop * ratio);
  const unit = (key: string) => n(u[key]);
  const building = (key: string) => n(b[key]);

  // Building and unit capacity roles are the canonical direct details. The
  // remaining population roles below are useful indicators but are not added
  // to the direct total, preventing overlapping role estimates from inflating
  // the city total.
  add("food_workers", "Food workers", "industrial", "buildings",
    building("syntheticFoodPlants") * 60 + building("industrialHydroponicFarms") * 25 + building("verticalFarmingTowers") * 30);
  add("factory_workers", "Factory workers", "industrial", "units",
    unit("factoryWorkerCrews") + unit("materialsProcessingTeams"));
  add("miners", "Miners", "industrial", "units", unit("miningCrews"));
  add("engineers", "Engineers", "infrastructure", "units",
    unit("aiSystemsEngineers") + unit("powerPlantEngineers") + unit("urbanDefenseEngineers"));
  add("scientists", "Scientists", "research", "units",
    unit("researchScientists") + unit("cyberneticsResearchers") + unit("experimentalPhysicsTeams"));
  add("doctors", "Doctors", "service", "units",
    unit("emergencyMedicalTeams") + unit("fieldHospitalUnits"));
  add("nurses", "Nurses", "service", "units",
    unit("diseaseContainmentTeams") + unit("biohazardResponseUnits"));
  add("teachers", "Teachers", "government", "buildings", building("civicEducationInstitutes") * 40);
  add("merchants", "Merchants / traders", "service", "buildings", building("supplyChainDistributionCenters") * 20);
  add("mechanics", "Mechanics", "infrastructure", "units",
    unit("infrastructureRepairTeams") + unit("utilityMaintenanceSquads"));
  add("pilots", "Pilots", "security", "units", unit("judgeGunships") * 2 + unit("airbornPatrolUnits"));
  add("water_technicians", "Water technicians", "infrastructure", "population", pop * 0.004);
  add("power_technicians", "Power technicians", "infrastructure", "units",
    unit("powerPlantEngineers"));
  add("enforcers", "Judicial enforcers", "security", "units",
    unit("patrolJudges") + unit("seniorJudges") + unit("rookieJudgeCadets") + unit("streetPatrolUnits") + unit("eliteJudgeStrikeTeams"));
  add("military", "City defense forces", "security", "units",
    unit("cityDefenseInfantry") + unit("armoredResponseUnits") + unit("heavyWeaponsSquads") + unit("riotPoliceSquads") + unit("heavyRiotMechUnits"));
  add("space_navy", "Space navy", "security", "units",
    unit("orbitalSecurityMarines") + unit("boardingAssaultTeams") + unit("vacuumCombatEngineers") + unit("escortFlightCrews") + unit("platformDefenseGunners"));
  add("mining_site_workers", "Mining site workers", "industrial", "mining_operations",
    (state.miningOperations ?? []).reduce((total, operation) => total + n(operation.workers), 0),
    "external-job-slots");
  add("local_business_jobs", "Local business jobs", "service", "local_businesses",
    n(state.localEconomy?.totalEmployees),
    "included-citizen-subset");
  add("corporate_chain_jobs", "Corporate chain jobs", "service", "local_businesses",
    n(state.localEconomy?.chainEmployees),
    "included-citizen-subset");

  // Population-derived indicators formerly embedded in overview.tsx.
  p("store_owners", "Store owners", "service", 0.015);
  p("taxi_drivers", "Taxi drivers", "service", 0.005);
  p("office_workers", "Office workers", "government", (n(cs.employment) / 100) * 0.25);
  p("janitors", "Janitors / cleaners", "service", 0.012);
  p("cooks", "Cooks / chefs", "service", 0.008);
  p("bartenders", "Bartenders", "service", 0.004);
  p("barbers", "Barbers / stylists", "service", 0.003);
  p("tattoo_artists", "Tattoo artists", "service", 0.001);
  p("street_vendors", "Street vendors", "service", 0.006);
  p("couriers", "Couriers", "service", 0.007);
  p("warehouse_workers", "Warehouse workers", "industrial", 0.009);
  add("construction_workers", "Construction workers", "industrial", "units",
    unit("constructionCrews"));
  p("electricians", "Electricians", "infrastructure", 0.005);
  p("plumbers", "Plumbers", "infrastructure", 0.004);
  p("welders", "Welders", "industrial", 0.005);
  p("plasterers", "Plasterers", "industrial", 0.002);
  p("painters", "Painters (trade)", "industrial", 0.003);
  p("architects", "Architects", "government", 0.001);
  p("lawyers", "Lawyers", "government", 0.002);
  p("judges", "Judges (civil)", "government", 0.0005);
  p("accountants", "Accountants", "government", 0.003);
  p("bankers", "Bankers", "service", 0.002);
  p("insurance_agents", "Insurance agents", "service", 0.001);
  p("realtors", "Realtors", "service", 0.001);
  p("journalists", "Journalists", "service", 0.002);
  p("broadcasters", "Broadcasters", "service", 0.001);
  p("propagandists", "Propagandists", "government", corruption * 0.02);
  p("hackers", "Hackers", "blackMarket", crime * 0.02);
  p("net_runners", "Net runners", "blackMarket", crime * 0.008);
  p("data_miners", "Data miners", "research", 0.003);
  p("sys_admins", "Sys admins", "research", 0.004);
  p("programmers", "Programmers", "research", 0.006);
  p("ai_trainers", "AI trainers", "research", 0.002);
  p("pharmacists", "Pharmacists", "service", 0.002);
  p("therapists", "Therapists", "service", 0.002);
  p("dentists", "Dentists", "service", 0.001);
  p("veterinarians", "Veterinarians", "service", Math.round(pop * 0.08) * 0.01 / Math.max(pop, 1));
  p("geneticists", "Geneticists", "research", 0.0005);
  p("chemists", "Chemists", "research", 0.001);
  add("physicists", "Physicists", "research", "units", unit("experimentalPhysicsTeams") * 5, "population-allocation");
  p("biologists", "Biologists", "research", 0.001);
  p("geologists", "Geologists", "research", 0.0003);
  p("meteorologists", "Meteorologists", "research", 0.0002);
  p("firefighters", "Firefighters", "government", 0.003);
  p("emts", "EMTs", "service", 0.002);
  p("social_workers", "Social workers", "government", 0.003);
  p("psychologists", "Psychologists", "service", 0.001);
  p("librarians", "Librarians", "government", 0.001);
  p("museum_curators", "Museum curators", "service", 0.0003);
  p("athletes", "Athletes", "service", 0.002);
  p("entertainers", "Entertainers", "service", 0.004);
  p("musicians", "Musicians", "service", 0.003);
  p("actors", "Actors", "service", 0.001);
  p("dancers", "Dancers", "service", 0.001);
  p("artists", "Artists (creative)", "service", 0.002);
  p("photographers", "Photographers", "service", 0.001);
  p("tailors", "Tailors", "service", 0.002);
  p("cobblers", "Cobblers", "service", 0.001);
  p("butchers", "Butchers", "service", 0.002);
  p("bakers", "Bakers", "service", 0.002);
  p("brewers", "Brewers", "service", 0.001);
  p("distillers", "Distillers", "service", 0.0005);
  p("smugglers", "Smugglers", "blackMarket", crime * 0.015);
  p("fences", "Fences", "blackMarket", crime * 0.005);
  p("hitmen", "Hitmen", "blackMarket", crime * 0.002);
  p("pickpockets", "Pickpockets", "blackMarket", crime * 0.01);
  p("forgers", "Forgers", "blackMarket", crime * 0.003);
  p("drug_dealers", "Drug dealers", "blackMarket", crime * 0.012);
  p("arms_traders", "Arms traders", "blackMarket", crime * 0.004);
  p("scrap_dealers", "Scrap dealers", "industrial", 0.004);
  add("recyclers", "Recyclers", "industrial", "units",
    unit("recyclingFacilityWorkers"));
  p("sewage_workers", "Sewage workers", "infrastructure", 0.003);
  p("truck_drivers", "Truck drivers", "service", 0.006);
  p("train_operators", "Train operators", "service", 0.002);
  p("dock_workers", "Dock workers", "service", 0.004);
  p("ship_crew", "Ship crew", "service", 0.001);
  p("space_port_workers", "Space port workers", "service", 0.001);
  p("diplomats", "Diplomats", "government", 0.0003);
  p("spies", "Spies", "security", corruption * 0.01);
  p("bureaucrats", "Bureaucrats", "government", 0.008);
  p("tax_collectors", "Tax collectors", "government", 0.002);
  p("census_workers", "Census workers", "government", 0.001);
  p("mail_carriers", "Mail carriers", "service", 0.003);
  p("cleaners", "Cleaners (industrial)", "industrial", 0.01);
  p("security_guards", "Security guards", "security", 0.008);
  p("bouncers", "Bouncers", "security", 0.002);
  p("private_investigators", "Private investigators", "security", 0.001);
  p("bounty_hunters", "Bounty hunters", "security", crime * 0.003);
  p("mercenaries", "Mercenaries", "security", crime * 0.005);
  p("bodyguards", "Bodyguards", "security", 0.002);
  p("nannies", "Nannies", "service", 0.004);
  p("elder_carers", "Elder carers", "service", 0.005);
  p("undertakers", "Undertakers", "service", 0.001);
  p("gamblers", "Gamblers", "blackMarket", crime * 0.008);
  add("beggars", "Beggars", "blackMarket", "population", homeless * 0.4);
  add("scavengers", "Scavengers", "blackMarket", "population", homeless * 0.25);
  p("street_performers", "Street performers", "service", 0.001);
  p("graffiti_artists", "Graffiti artists", "blackMarket", crime * 0.005);
  p("sanitation_engineers", "Sanitation engineers", "infrastructure", 0.005);
  p("waste_disposal", "Waste disposal crews", "infrastructure", 0.004);
  p("vid_screen_operators", "Vid-screen operators", "government", corruption * 0.008);
  add("clone_technicians", "Clone technicians", "research", "buildings", building("cloningFacilities") * 12);
  add("droid_mechanics", "Droid mechanics", "infrastructure", "units",
    rounded((unit("surveillanceDrones") + unit("tacticalCombatDrones") + unit("patrolDrones") + unit("riotSuppressionDrones")) * 0.3 + building("roboticsFabricationFacilities") * 50 * 0.05));
  add("uplift_handlers", "Uplift handlers", "service", "population", n(cs.upliftPopulation) * 0.02);
  add("wasteland_scouts", "Wasteland scouts", "security", "units", pop * 0.001 + unit("wastelandReconTeams"));
  add("ration_officers", "Ration officers", "government", "buildings",
    building("welfareDistributionCenters") * 15 + building("syntheticFoodPlants") * 8);
  p("building_inspectors", "Building inspectors", "government", 0.0008);
  add("prisoners", "Inmates / prisoners", "government", "population",
    incarcerated,
    "population-allocation");
  add("prison_guards", "Prison guards", "government", "population",
    custodySummary.requiredGuards,
    "population-allocation");
  add("farmers", "Farmers (hydroponic / vertical)", "industrial", "buildings",
    building("industrialHydroponicFarms") * 30 + building("verticalFarmingTowers") * 35);
  p("customs_officers", "Customs officers", "government", 0.0008);
  p("translators", "Translators", "government", 0.0006);
  p("property_managers", "Property managers", "service", 0.001);
  p("real_estate_developers", "Real estate developers", "government", 0.0004);
  p("building_maintenance", "Building maintenance", "infrastructure", 0.004);
  p("ushers_concierges", "Ushers / concierges", "service", 0.002);

  const sectorTotals = Object.fromEntries(
    SECTORS.map((sector) => [sector, n(dm[`${sector}Workforce` as keyof typeof dm])]),
  ) as Record<WorkforceSector, number>;
  const bySector = Object.fromEntries(
    SECTORS.map((sector) => [sector, roles.filter((role) => role.sector === sector)]),
  ) as Record<WorkforceSector, WorkforceRole[]>;
  const directDetailedRoleTotal = roles
    .filter((role) => role.reconciliation === "direct-capacity")
    .reduce((total, role) => total + role.value, 0);
  const populationAllocationTotal = roles
    .filter((role) => role.reconciliation === "population-allocation")
    .reduce((total, role) => total + role.value, 0);
  const localEconomyJobs = n(state.localEconomy?.totalEmployees);
  const corporateChainJobs = n(state.localEconomy?.chainEmployees);
  const indieBusinessJobs = Math.max(0, localEconomyJobs - corporateChainJobs);
  const miningJobs = roles.find((role) => role.id === "mining_site_workers")?.value ?? 0;
  const sectorTotal = SECTORS.reduce((total, sector) => total + sectorTotals[sector], 0);

  return {
    roles,
    bySector,
    sectorTotals,
    sectorTotal,
    employedCitizens,
    unemployedCitizens: Math.max(0, rounded(cohorts.workforceCapacity - employedCitizens)),
    employmentRate,
    localEconomyJobs,
    indieBusinessJobs,
    corporateChainJobs,
    miningJobs,
    directDetailedRoleTotal,
    populationAllocationTotal,
    reconciliation: {
      explainedSectorJobs: directDetailedRoleTotal,
      unallocatedSectorJobs: sectorTotal - directDetailedRoleTotal,
      includedSubsetJobs: localEconomyJobs,
      countedJobSlots: employedCitizens,
    },
  };
}

export function getWorkforceRole(catalog: WorkforceCatalog, id: string): WorkforceRole | undefined {
  return catalog.roles.find((role) => role.id === id);
}
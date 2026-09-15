import { advanceHour, isDayStart } from "@/engine/clock";
import { negativeEventsAllowed } from "@/engine/calmStart";
import { processOfficerLifecycles } from "@/engine/officerLifecycle";
import {
  tickNamedCharacters,
  maybeEmitWeeklyNotable,
  maybeEmitFactionFlashpoint,
  maybeEmitUndercityRumor,
  maybeEmitMarketMove,
  computeDistrictTraitMultipliers,
  computeFactionTraitMultipliers,
  computeCityTraitMultipliers,
  applyTraitMultiplierToDelta,
} from "@/engine/namedCharacters";
import { COMPANIES, COMPANIES_MAP, isCompanyOperational } from "@/engine/companies";
import { COMBAT_DOCTRINES, COMBAT_DOCTRINES_MAP, COMBAT_UNIT_KEYS, ENGAGEMENT_TEMPLATES, ENGAGEMENT_TEMPLATES_MAP, HOSTILE_RAID_TEMPLATES, ORDNANCE_OPTIONS, ORDNANCE_OPTIONS_MAP, ZONE_TERRITORIES, resolveEngagement, computeUnitCompositionStrength, getCombatUnitCount, generateFactionComposition, pickFlavorArchetype, computeArchetypeLosses, formatHostilesSpotted, formatLossesByUnit } from "@/engine/combatData";
import { buildUnitTierMultiplierMap } from "@/engine/assetUpgrades";
import { getBankName, getZoneName } from "@/engine/displayNames";
import { CONTRACT_TEMPLATES, CONTRACT_TEMPLATES_MAP, CONTRACTORS, CONTRACTORS_MAP, CONTRACT_EXPIRY_MULTIPLIER, computeContractExpiryRecovery, summarizeCompletionEffects } from "@/engine/contracts";
import { getEdictById } from "@/engine/edicts";
import { processPendingConstructions, TRAINING_EDICT_ID, TRAINING_DOCTRINE_WINDDOWN_TICKS, TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX } from "@/engine/pendingConstruction";
import { pushNewsItem, edictLapsedNews, trainingDoctrineLapsedNews, seasonChangeNews, contractDeliveredNews, contractExpiredNews } from "@/engine/newsFeed";
import { ANY_TERRITORY_GANGS, GANGS } from "@/engine/gangs";
import { POLICY_MAP } from "@/engine/policies";
import { isBigBrotherActive, isBBContentId } from "@/engine/addons/bigBrother";
import { isSixthDayActive, isSDContentId, SD_HUMOR } from "@/engine/addons/sixthDay";
import { processSupplyChain } from "@/engine/supplyChain";
import { processMilitaryLogistics } from "@/engine/militaryLogistics";
import { TECH_MAP, canResearch, getVisibleTechnologies } from "@/engine/technologies";
import { buildTechEffectsCache, batchProcessCrime, invalidateTechCache } from "@/engine/perfCache";
import { isTickProfilingEnabled, recordSection } from "@/engine/tickProfiler";
import type { ActiveEdict, ActiveEngagement, CombatState, ContractInstance, GameMessage, GameState, MiningEvent, MiningOperation, Resources, CityStats, TickEntry } from "@/engine/types";
import { MINING_EVENT_TEMPLATES } from "@/engine/miningData";
import { generateEnhancedDailyReport, generateEnhancedAlert, generatePeriodicMessage } from "@/engine/inboxFlavor";
import { generateWartimePeriodicMessage, isAtWar } from "@/engine/wartimeEvents";
import { runNewSystemTicks, emitStatBandImprovements, emitPowerBrownoutWarning, emitProsperityGateHint, emitProsperityGateRecoveryNews } from "@/engine/tickProcessors";
import { getInstalledAugEffects } from "@/engine/playerProgression";
import { processExpansionTick } from "@/engine/districtExpansion";
import { getSeason, getSeasonalModifiers, WEATHER_EFFECTS, generateWeather } from "@/engine/weather";
import { processHumanConsequences, recordHumanConsequences } from "@/engine/humanConsequences";
import { WAR_ROOM_OPS, WAR_ROOM_OPS_MAP } from "@/engine/warRoomData";
import { sanitizeState, ARRAY_CAPS, MAX_RESOURCE, MAX_POWER_MAGNITUDE, MAX_BASE_POP_GROWTH_RATE } from "@/engine/sanitizer";
import { applyPartnerAndPlayerTickEffects } from "@/engine/partnerCityStats";
import { processEndStateCheck } from "@/engine/endState";
import { refreshPartnerDynamics, processNpcWorldEvents } from "@/engine/partnerDynamics";
import { recordCreditsEarned } from "@/engine/creditTracking";
import { RESEARCH_COST_MULTIPLIER } from "@/engine/researchConstants";
import { computeUnitUpkeep, computeInfraUpkeep, computeTaxAfterOverhead, computeTradeAfterCongestion, computeMiningPolicyIncome, computeCompanyTaxOutput } from "@/engine/economyBreakdown";
import { getTotalEffects as getSoftwareUpgradeEffects } from "@/engine/softwareUpgrades";
import {
  computeCommunicationsBreakdown,
  COMMUNICATIONS_LOW_SIGNAL_THRESHOLD,
} from "@/engine/communicationsBreakdown";
import { computePopulationDensityPressure } from "@/engine/populationDensity";
import {
  applyResourceDelta,
  getMedicalSupplyConsumption,
  getResourceStorageCapacity,
  summarizeMedicalStorageGain,
  STORAGE_RESOURCE_KEYS,
} from "@/engine/resourceStorage";
import type { StorageResourceKey } from "@/engine/types";
import {
  computePopulationCohorts,
  COHORT_HEALTH_LOAD_RATIO,
} from "@/engine/populationCohorts";
import { computeHousingCapacity } from "@/engine/housingCapacity";
import {
  computePowerProductionComponents,
  computeWaterProductionComponents,
} from "@/engine/utilityProduction";
import { getResearchBreakdown } from "@/engine/researchBreakdown";
import { getRailNetworkDiagnostics, processRailNetworkTick } from "@/engine/railNetwork";
import { applyInfrastructureHealthDelta, createInfrastructureLedger, reconcileInfrastructureLedger, withInfrastructureLedger } from "@/engine/infrastructureLedger";

const RESOURCE_KEYS = new Set<keyof Resources>(["credits", "food", "water", "power", "steel", "goods", "fuel", "medSupplies", "ammo"]);
function isResourceKey(k: string): k is keyof Resources { return RESOURCE_KEYS.has(k as keyof Resources); }

const CITY_STAT_KEYS = new Set<keyof CityStats>(["population", "populationGrowthRate", "crime", "unrest", "happiness", "lawOrder", "corruption", "employment", "housingPressure", "infrastructureHealth", "researchProgress", "researchTarget", "defenseRating", "education", "publicHealth", "biosphere", "diseaseRisk", "upliftPopulation"]);
function isCityStatKey(k: string): k is keyof CityStats { return CITY_STAT_KEYS.has(k as keyof CityStats); }

export type TickSubsystemError = { subsystem: string; error: string };
const _lastTickErrors: TickSubsystemError[] = [];
export function getLastTickErrors(): TickSubsystemError[] { return [..._lastTickErrors]; }

function safeSub(name: string, entries: TickEntry[], fn: () => void): void {
  // Profiler bracketing (Task #200). Gated on a single boolean so a normal
  // tick pays nothing — no performance.now() calls when the overlay is off.
  // The cost of a failing section is still captured (finally) so a thrown
  // subsystem can't hide a slow path.
  const prof = isTickProfilingEnabled();
  const t0 = prof ? performance.now() : 0;
  try {
    fn();
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    // Gate per-tick log behind __DEV__ — at 4 ticks/sec a persistently
    // failing subsystem floods logcat in production. The error is still
    // captured in _lastTickErrors and surfaced via the tick UI.
    if (__DEV__) console.warn(`[TICK] Subsystem "${name}" failed: ${msg}`);
    _lastTickErrors.push({ subsystem: name, error: msg });
    entries.push({
      label: name,
      delta: 0,
      unit: "error",
      reason: `Subsystem error: ${msg.slice(0, 80)}`,
      severity: "warning",
    });
  } finally {
    if (prof) recordSection(name, performance.now() - t0);
  }
}

function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}

function clampStat(val: number): number {
  return clamp(val, 0, 100);
}

function b(buildings: Record<string, number>, key: string): number {
  return buildings[key] ?? 0;
}

function u(units: Record<string, number>, key: string): number {
  return units[key] ?? 0;
}

// Preserve the established import surface while sharing the implementation
// with the cohort calculator and read-only pressure consumers.
export { computeHousingCapacity } from "@/engine/housingCapacity";

// Task #188: hoisted to module scope. Previously rebuilt every tick
// inside the combat safeSub. The per-engagement / per-raid loops then
// scanned all 270 districts with `affectedDistrictIds.includes(d.id)`
// (O(n) per district). Pre-building a Set<string> per zone makes the
// inner check O(1).
const ZONE_DISTRICT_MAP: Record<string, string[]> = {
  sector_alpha: ["central-command", "civic-admin-core", "gov-plaza", "judicial-complex", "policy-hall"],
  sector_beta: ["grand-market", "trade-exchange", "corporate-plaza", "financial-exchange", "skyline-commerce"],
  sector_gamma: ["hab-block-1", "hab-block-2", "worker-housing", "family-residential", "middle-residential"],
  sector_delta: ["skyport", "cargo-terminal", "transit-hub", "freight-dock", "logistics-corridor"],
  industrial_core: ["foundry-row", "heavy-industry", "assembly-line", "fabrication-complex", "machine-works"],
  hab_blocks_east: ["high-density-res", "transit-housing", "upper-residential", "outer-residential"],
  hab_blocks_west: ["refugee-settlement", "undercity-hab", "sublevel-housing"],
  underhive_east: ["rust-alley", "forgotten-levels", "broken-tower"],
  underhive_west: ["old-industrial-housing", "lower-transit-slums", "underpass-settlements"],
  underhive_deep: ["collapsed-block", "abandoned-sector"],
  penal_zone: ["detention-complex", "prison-block", "sector-house"],
  mutant_quarter: ["biohazard-containment", "quarantine-district"],
  toxic_flats: ["waste-processing", "recycling-industrial", "env-monitoring"],
  wasteland_north: ["outer-wall", "border-gate", "frontier-logistics"],
  wasteland_east: ["wasteland-trade", "salvage-processing", "expansion-alpha"],
  wasteland_south: ["expansion-beta", "perimeter-defense", "outer-industrial"],
};
const ZONE_DISTRICT_SET: Record<string, Set<string>> = {};
for (const [zoneId, ids] of Object.entries(ZONE_DISTRICT_MAP)) {
  ZONE_DISTRICT_SET[zoneId] = new Set(ids);
}
const EMPTY_DISTRICT_SET: Set<string> = new Set();

export function runTick(state: GameState): {
  newState: GameState;
  entries: TickEntry[];
} {
  _lastTickErrors.length = 0;
  const entries: TickEntry[] = [...(state.pendingTickEntries ?? [])];

  const s: GameState = {
    ...state,
    resources: { ...state.resources },
    cityStats: { ...state.cityStats },
    rates: { ...state.rates },
    buildings: { ...state.buildings },
    units: { ...state.units },
    // policies: read-only across the entire engine, share the reference.
    policies: state.policies,
    // crimeStats: never property-mutated; line ~1171 wholesale-replaces
    // s.crimeStats with a fresh object, so the initial clone is wasted.
    crimeStats: state.crimeStats,
    stockpiles: state.stockpiles ? { ...state.stockpiles } : ({} as any),
    demographics: { ...state.demographics },
    tourism: state.tourism ? { ...state.tourism } : ({} as any),
    utilities: state.utilities ? { ...state.utilities } : undefined as any,
    gameDate: { ...state.gameDate },
    messages: [...(state.messages ?? [])],
    pendingTickEntries: [],
    // activeEvents: every mutation site (events.ts, eventChains.ts,
    // wildlandsEcology.ts, partnerDynamics.ts) uses immutable
    // replacement (`s.activeEvents = [...s.activeEvents, x]`), so the
    // initial spread here is dead work.
    activeEvents: state.activeEvents ?? [],
    districts: state.districts.slice(),
    factions: state.factions.slice(),
    officers: state.officers.slice(),
    edictCooldowns: { ...(state.edictCooldowns ?? {}) },
    // Task #188: copy-on-write for subsystems whose deep clone is
    // expensive. ensureXClone() helpers below clone on first mutation;
    // ticks that don't touch these subsystems pay no clone tax.
    activeEdicts: state.activeEdicts ?? [],
    // messages: receives up to ~7 prepends per tick. We still need a
    // mutable copy because subsystems sometimes splice/replace it
    // wholesale (see L2516 / recon discovery), but per-message prepend
    // storms are batched via `pendingMessages` below and merged once at
    // the end of the tick.
    unlockedTechnologies: [...(state.unlockedTechnologies ?? [])],
    activeResearch: state.activeResearch ? { ...state.activeResearch } : null,
    researchQueue: [...(state.researchQueue ?? [])],
    securityWings: state.securityWings
      ? {
          ...state.securityWings,
          wings: state.securityWings.wings.map((wing) => ({ ...wing, squadIds: [...wing.squadIds] })),
        }
      : undefined,
    custody: state.custody
      ? {
          ...state.custody,
          records: state.custody.records.map((record) => ({ ...record })),
          cooldowns: { ...state.custody.cooldowns },
          actionHistory: state.custody.actionHistory.map((entry) => ({ ...entry })),
        }
      : undefined,
    activeContracts: state.activeContracts ?? [],
    completedContracts: state.completedContracts ?? [],
    tradeAgreements: state.tradeAgreements ?? [],
    banking: state.banking ?? (undefined as any),
    intelligence: state.intelligence ? { ...state.intelligence } : undefined as any,
    combat: state.combat ?? (undefined as any),
    // miningOperations is replaced wholesale via `.map()` at every
    // mutation site (L3116, L3159), so the prepay clone was 100% dead.
    miningOperations: state.miningOperations ?? [],
    miningEvents: (state.miningEvents ?? []).map((e: MiningEvent) => ({ ...e })),
    // pendingConstructions: replaced wholesale by processPendingConstructions
    // (immutable rebuild), so no eager clone needed — same pattern as
    // miningOperations above.
    pendingConstructions: state.pendingConstructions ?? [],
  };
  // Infrastructure integrity is authoritative in the ledger. Reconcile the
  // completed capacity once at tick start and keep the legacy percentage as a
  // compatibility mirror while the existing tick reducers run.
  const tickLedger = state.infrastructureLedger
    ? reconcileInfrastructureLedger(state)
    : createInfrastructureLedger(state, state.cityStats.infrastructureHealth);
  s.infrastructureLedger = tickLedger;
  s.cityStats.infrastructureHealth = withInfrastructureLedger(s, tickLedger).cityStats.infrastructureHealth;

  // ─── Copy-on-write helpers (Task #188) ────────────────────────────────
  // Each helper clones its subsystem the first time a mutation happens
  // this tick and is a no-op afterward. They preserve the exact shape
  // the previous eager clones produced so downstream mutation code is
  // unchanged.
  let _bankingCloned = false;
  function ensureBankingClone() {
    if (_bankingCloned || !s.banking) return;
    s.banking = {
      ...s.banking,
      accounts: s.banking.accounts.map((a: any) => ({ ...a })),
      loans: s.banking.loans.map((l: any) => ({ ...l })),
    };
    _bankingCloned = true;
  }

  let _combatCloned = false;
  function ensureCombatClone() {
    if (_combatCloned || !s.combat) return;
    const cbt = s.combat;
    const next: CombatState = {
      ...cbt,
      activeEngagements: (cbt.activeEngagements ?? []).map((e) => ({ ...e })),
      raidEventQueue: [...(cbt.raidEventQueue ?? [])],
      zones: (cbt.zones ?? []).map((z) => ({ ...z })),
      battleLog: [...(cbt.battleLog ?? [])],
    };
    s.combat = next;
    _combatCloned = true;
  }

  let _edictsCloned = false;
  function ensureEdictsClone() {
    if (_edictsCloned) return;
    s.activeEdicts = (s.activeEdicts ?? []).map((ae: ActiveEdict) => ({ ...ae }));
    _edictsCloned = true;
  }

  let _contractsCloned = false;
  function ensureContractsClone() {
    if (_contractsCloned) return;
    s.activeContracts = (s.activeContracts ?? []).map((c: ContractInstance) => ({
      ...c,
      events: [...(c.events ?? [])],
    }));
    _contractsCloned = true;
  }

  // Task #188: batch message prepends. Up to ~7 sites per tick used to
  // do `s.messages = [m, ...s.messages].slice(0, 200)` — each one a full
  // copy of a 200-entry array. We collect new messages and prepend once
  // at the end of the tick.
  const pendingMessages: GameMessage[] = [];
  function prependMessage(msg: GameMessage) {
    pendingMessages.push(msg);
  }

  // Task #188: hoist combat-unit composition lookups. The combat block
  // calls computeUnitCompositionStrength + getCombatUnitCount per
  // engagement and per raid; on a tick with N engagements + M raids
  // that's (N+M) full Object.entries(s.units) walks. Cache the results
  // and invalidate only on the rare ticks when s.units mutates
  // (engagement / raid casualties or contract completions).
  let _cachedCombatUnitCount: number | null = null;
  let _cachedCompositionBase: number | null = null;
  let _cachedCompositionUpgraded: number | null = null;
  let _cachedTierMap: Record<string, number> | null = null;
  function getCachedCombatUnitCount(): number {
    if (_cachedCombatUnitCount === null) {
      _cachedCombatUnitCount = getCombatUnitCount(s.units as Record<string, number>);
    }
    return _cachedCombatUnitCount;
  }
  function getCachedTierMap(): Record<string, number> {
    if (_cachedTierMap === null) {
      const map = buildUnitTierMultiplierMap(s);
      // Task #381: un-crewed / grounded / degraded vehicles contribute less
      // combat value. fleetOperational (0..1 per vehicle key) is stable in-tick
      // (computed by processMilitaryLogistics above), so bake it into the tier
      // multiplier the composition-strength calc reads. Neutral (=1) when the
      // motor pool is fully crewed, serviced and fuelled.
      const fleetOp = s.militaryOverhaul?.logistics?.fleetOperational;
      if (fleetOp) {
        for (const k in fleetOp) {
          const f = fleetOp[k];
          if (typeof f === "number") map[k] = (typeof map[k] === "number" ? map[k] : 1) * f;
        }
      }
      _cachedTierMap = map;
    }
    return _cachedTierMap;
  }
  function getCachedCompositionUpgraded(): number {
    if (_cachedCompositionUpgraded === null) {
      _cachedCompositionUpgraded = computeUnitCompositionStrength(
        s.units as Record<string, number>,
        getCachedTierMap(),
      );
    }
    return _cachedCompositionUpgraded;
  }
  function getCachedCompositionBase(): number {
    if (_cachedCompositionBase === null) {
      _cachedCompositionBase = computeUnitCompositionStrength(s.units as Record<string, number>);
    }
    return _cachedCompositionBase;
  }
  function invalidateUnitsCache() {
    _cachedCombatUnitCount = null;
    _cachedCompositionBase = null;
    _cachedCompositionUpgraded = null;
    // tier map is a function of s.assetUpgrades, immutable in-tick — keep it.
  }

  const r = s.resources;
  const cs = s.cityStats;
  const rates = s.rates;
  const bldg = s.buildings;
  const unit = s.units;
  const p = s.policies;

  function applyInfraDelta(delta: number, incidentId: string, reason: string): void {
    if (!delta) return;
    const next = applyInfrastructureHealthDelta(s, delta, incidentId, reason);
    s.infrastructureLedger = next.infrastructureLedger;
    // Preserve the existing cityStats object shared by this reducer's local
    // alias while refreshing its derived compatibility value.
    cs.infrastructureHealth = next.cityStats.infrastructureHealth;
  }

  const _clonedDistricts = new Set<number>();
  function ensureDistrictClone(idx: number) {
    if (!_clonedDistricts.has(idx)) {
      s.districts[idx] = { ...s.districts[idx] };
      _clonedDistricts.add(idx);
    }
    return s.districts[idx];
  }

  const _clonedFactions = new Set<number>();
  function ensureFactionClone(idx: number) {
    if (!_clonedFactions.has(idx)) {
      s.factions[idx] = { ...s.factions[idx] };
      _clonedFactions.add(idx);
    }
    return s.factions[idx];
  }

  const cheats = s.cheats ?? {};
  const isSpeedDemon = !!cheats.speedDemon;
  const speedMult = isSpeedDemon ? 3 : 1;

  const diff = s.difficulty ?? "medium";
  const diffMult = { easy: { income: 1.25, crime: 0.75, unrest: 0.75, upkeep: 0.8, research: 1.3 }, medium: { income: 1, crime: 1, unrest: 1, upkeep: 1, research: 1 }, hard: { income: 0.75, crime: 1.35, unrest: 1.3, upkeep: 1.2, research: 0.8 } }[diff];

  const sk = s.player?.skills ?? { leadership: 0, tactics: 0, administration: 0, investigation: 0, intimidation: 0, diplomacy: 0, engineering: 0, medicine: 0, logistics: 0, surveillance: 0, propaganda: 0, blackOps: 0 };
  const att = s.player?.attributes ?? { authority: 0, intelligence: 0, charisma: 0, combat: 0, endurance: 0 };
  const augFx = s.player ? getInstalledAugEffects(s.player) : {};

  // ─── RECALCULATE RATES FROM BUILDINGS ────────────────────────────────

  // Power generation
  rates.powerGeneration =
    b(bldg, "fusionReactors") * 500 +
    b(bldg, "solarTowerFields") * 80 +
    b(bldg, "microFusionGenerators") * 200 +
    b(bldg, "geothermalWells") * 150 +
    b(bldg, "hvTransmissionLines") * 40;

  // Power drain
  const powerStabilizer = 1 - b(bldg, "powerGridStabilizers") * 0.03;
  rates.powerDrain = Math.floor(
    (b(bldg, "habBlockMegaTowers") * 12 +
      b(bldg, "workerHousingStacks") * 8 +
      b(bldg, "highDensityResidentialPlatforms") * 15 +
      b(bldg, "megaManufacturingPlants") * 35 +
      b(bldg, "metalFoundryComplexes") * 25 +
      b(bldg, "roboticsFabricationFacilities") * 20 +
      b(bldg, "automatedAssemblyLines") * 18 +
      b(bldg, "citywideSurveillanceGrid") * 15 +
      b(bldg, "aiCrimePredictionCenters") * 20 +
      b(bldg, "quantumDataCenters") * 40 +
      b(bldg, "predictiveAnalyticsSupercomputers") * 30 +
      b(bldg, "advancedResearchLabs") * 15 +
      b(bldg, "cyberneticsDevelopmentFacilities") * 12 +
      b(bldg, "undergroundMaglevSystem") * 10 +
      b(bldg, "automatedDroneDefenseGrid") * 18 +
      b(bldg, "cityShieldGenerator") * 60 +
      b(bldg, "luxurySkyHotels") * 10 +
      b(bldg, "entertainmentMegaPlexes") * 12 +
      b(bldg, "virtualRealityArcades") * 8 +
      b(bldg, "neonDistrictPromenades") * 6 +
      u(unit, "surveillanceDrones") * 0.3 +
      u(unit, "tacticalCombatDrones") * 0.5 +
      b(bldg, "biosphereReclamationDomes") * 15 +
      b(bldg, "atmosphericBiofilterStations") * 8 +
      b(bldg, "upliftTrainingAcademies") * 10 +
      b(bldg, "aquaponicsMegaFacilities") * 12) * powerStabilizer
  );

  // Food production (x2 boost — balanced)
  rates.foodProduction =
    b(bldg, "industrialHydroponicFarms") * 160 +
    b(bldg, "syntheticFoodPlants") * 200 +
    b(bldg, "nutrientRecyclingCenters") * 60 +
    b(bldg, "verticalFarmingTowers") * 120 +
    b(bldg, "proteinVatFacilities") * 100 +
    b(bldg, "algaeBioProteinFarms") * 80 +
    b(bldg, "automatedAgriculturalLabs") * 140 +
    b(bldg, "nutrientPasteProcessingPlants") * 90 +
    b(bldg, "foodDistributionDepots") * 20 +
    b(bldg, "insectBreedingWarrens") * 40 +
    b(bldg, "mycologyCultivationCaves") * 48 +
    b(bldg, "pollinatorDroneHives") * 32 +
    b(bldg, "aquaponicsMegaFacilities") * 80 +
    b(bldg, "mutantFloraReserves") * 24 +
    b(bldg, "hydroponicDomes") * 60 +
    b(bldg, "feralLivestockPens") * 40 +
    b(bldg, "apexHuntersLodges") * 28 +
    b(bldg, "wildlandsBioreserves") * 36 +
    (p.rationsEnabled ? -20 : 0) +
    Math.floor((cs.biosphere > 50 ? (cs.biosphere - 50) * 2 : cs.biosphere < 20 ? -(20 - cs.biosphere) * 1.5 : 0));

  const dm = s.demographics;
  const highPct = dm.highIncomePopulation / Math.max(1, cs.population);
  const lowPct = dm.lowIncomePopulation / Math.max(1, cs.population);
  const classMultiplier = 1 + highPct * 0.3 - lowPct * 0.1;
  rates.foodConsumption =
    Math.floor((cs.population / 4500) * classMultiplier) + (p.rationsEnabled ? -30 : 0);

  // Water production (x2 boost — balanced)
  rates.waterProduction =
    b(bldg, "atmosphericHarvestTowers") * 80 +
    b(bldg, "megaDesalinationPlants") * 180 +
    b(bldg, "waterRecyclingSuperFacilities") * 240 +
    b(bldg, "sewerPurificationPlants") * 50 +
    b(bldg, "waterPumpStations") * 40 +
    b(bldg, "stormwaterCaptureSystems") * 30 +
    b(bldg, "undergroundWaterReservoirs") * 10 +
    b(bldg, "aquiferStabilizationDrills") * 70 +
    b(bldg, "smartWaterDistributionGrid") * 60;

  rates.waterConsumption = Math.floor((cs.population / 5500) * classMultiplier);

  // Tax income
  rates.taxIncome =
    800 +
    b(bldg, "habBlockMegaTowers") * 95 +
    b(bldg, "workerHousingStacks") * 40 +
    b(bldg, "highDensityResidentialPlatforms") * 150 +
    b(bldg, "megaManufacturingPlants") * 200 +
    b(bldg, "metalFoundryComplexes") * 135 +
    b(bldg, "roboticsFabricationFacilities") * 165 +
    b(bldg, "automatedAssemblyLines") * 115 +
    b(bldg, "constructionMaterialRefineries") * 90 +
    b(bldg, "heavyIndustryExpansion") * 175 +
    b(bldg, "skyrailTransitLines") * 25 +
    b(bldg, "undergroundMaglevSystem") * 50 +
    b(bldg, "cargoFreightMegaways") * 35 +
    b(bldg, "supplyChainDistributionCenters") * 45 +
    b(bldg, "apexHuntersLodges") * 35 +
    b(bldg, "wildlandsRangerStations") * 30 +
    b(bldg, "hydroponicDomes") * 25 +
    b(bldg, "feralLivestockPens") * 30 +
    b(bldg, "wildlandsBioreserves") * 50 +
    b(bldg, "frontierApothecaries") * 30 +
    b(bldg, "bushTanneries") * 35 +
    b(bldg, "geneVaults") * 45 +
    (p.laborDirective ? 120 : 0) +
    Math.round((((s.doctrine?.centralVsLocal ?? 50) - 50) / 50) * 50);

  rates.tradeIncome =
    200 + Math.round(-(((s.doctrine?.orderVsProsperity ?? 50) - 50) / 50) * 40) +
    b(bldg, "skyportLandingPlatforms") * 80 +
    b(bldg, "automatedFreightTerminals") * 60 +
    b(bldg, "droneLogisticsCorridors") * 40 +
    b(bldg, "cargoFreightMegaways") * 30 +
    b(bldg, "pilgrimageShrines") * 50 +
    b(bldg, "holyRelicVault") * 70 +
    b(bldg, "templeOfCommerce") * 90;

  // Tourism
  const tourismCap =
    b(bldg, "megaCityObservationDecks") * 800 +
    b(bldg, "luxurySkyHotels") * 1200 +
    b(bldg, "entertainmentMegaPlexes") * 1000 +
    b(bldg, "neonDistrictPromenades") * 600 +
    b(bldg, "skylineCableCarRoutes") * 500 +
    b(bldg, "virtualRealityArcades") * 400 +
    b(bldg, "historicalSectorMuseums") * 500 +
    b(bldg, "xenoCulturalExhibitionHalls") * 700 +
    b(bldg, "guidedUndercityTours") * 300 +
    b(bldg, "gourmetSynthFoodHalls") * 350 +
    b(bldg, "touristInfoKiosks") * 100 +
    b(bldg, "exoticFloraGardens") * 400 +
    b(bldg, "grandCathedral") * 500 +
    b(bldg, "pilgrimageShrines") * 300;

  const tourismSatisfactionBase = tourismCap > 0 ? clamp(
    50 +
    b(bldg, "historicalSectorMuseums") * 3 +
    b(bldg, "xenoCulturalExhibitionHalls") * 4 +
    b(bldg, "virtualRealityArcades") * 3 +
    b(bldg, "gourmetSynthFoodHalls") * 3 +
    b(bldg, "touristInfoKiosks") * 2 +
    b(bldg, "exoticFloraGardens") * 3 +
    b(bldg, "skylineCableCarRoutes") * 2 -
    (cs.crime > 50 ? 10 : cs.crime > 30 ? 5 : 0) -
    (cs.unrest > 50 ? 8 : cs.unrest > 30 ? 4 : 0) +
    (cs.happiness > 60 ? 5 : cs.happiness < 30 ? -5 : 0),
    10, 100
  ) : 50;

  const occupancyRate = tourismCap > 0 ? clamp(tourismSatisfactionBase / 100, 0.1, 0.95) : 0;
  const touristCount = Math.floor(tourismCap * occupancyRate);
  // Diminishing returns above the soft knee: small tourism sectors earn the
  // same as before, but large ones no longer dwarf housing/industry tax.
  const rawTourismIncome = touristCount * (tourismSatisfactionBase / 50) * 0.8;
  const TOURISM_INCOME_SOFT_KNEE = 1500;
  const tourismIncomeRate =
    rawTourismIncome <= TOURISM_INCOME_SOFT_KNEE
      ? Math.floor(rawTourismIncome)
      : TOURISM_INCOME_SOFT_KNEE + Math.floor(Math.pow(rawTourismIncome - TOURISM_INCOME_SOFT_KNEE, 0.78));

  rates.tourismIncome = tourismIncomeRate;

  // Steel
  rates.steelProduction =
    b(bldg, "megaManufacturingPlants") * 20 +
    b(bldg, "metalFoundryComplexes") * 35 +
    b(bldg, "industrialRecyclingFacilities") * 15 +
    b(bldg, "advancedMaterialsRefineries") * 25 +
    b(bldg, "constructionMaterialRefineries") * 18;

  // Goods
  // Every city begins with a small municipal supply network: local workshops,
  // recycling depots, and ration distribution that keep basic construction
  // materials circulating before the player expands heavy industry. This must
  // cover the starter housing award's 2 goods/tick draw after civilian demand,
  // otherwise a fresh city silently burns through its stockpile and contracts
  // can never complete.
  rates.goodsProduction =
    65 +
    b(bldg, "megaManufacturingPlants") * 25 +
    b(bldg, "roboticsFabricationFacilities") * 30 +
    b(bldg, "automatedAssemblyLines") * 22 +
    b(bldg, "supplyChainDistributionCenters") * 10;

  const luxuryMultiplier = 1 + highPct * 0.5 - lowPct * 0.15;
  rates.goodsConsumption = Math.floor((cs.population / 9000) * luxuryMultiplier);

  // Fuel
  rates.fuelProduction =
    b(bldg, "vehicleMaintenanceDepots") * 25 +
    b(bldg, "armoredVehicleGarages") * 15 +
    b(bldg, "cargoFreightMegaways") * 8;

  // Med supplies
  rates.medProduction =
    b(bldg, "publicHealthMegaClinics") * 20 +
    b(bldg, "medicalResearchComplexes") * 15 +
    b(bldg, "emergencyDisasterResponseHQ") * 10 +
    b(bldg, "xenoVeterinaryHospitals") * 10 +
    b(bldg, "mycologyCultivationCaves") * 5;

  if (isSpeedDemon) {
    rates.foodProduction *= 3;
    rates.waterProduction *= 3;
    rates.steelProduction *= 3;
    rates.goodsProduction *= 3;
    rates.fuelProduction *= 3;
    rates.medProduction *= 3;
    rates.taxIncome *= 3;
    rates.tradeIncome *= 3;
  }

  // ─── MINING POLICY EFFECTS ─────────────────────────────────────────
  const miningPolicies = new Set(s.activeMiningPolicies ?? []);
  if (miningPolicies.has("strip_mining")) {
    rates.steelProduction = Math.floor(rates.steelProduction * 1.2);
  }
  if (miningPolicies.has("overtime_mandate")) {
    rates.steelProduction = Math.floor(rates.steelProduction * 1.15);
  }
  if (miningPolicies.has("worker_safety")) {
    rates.steelProduction = Math.floor(rates.steelProduction * 0.9);
  }
  if (miningPolicies.has("eco_mining")) {
    rates.steelProduction = Math.floor(rates.steelProduction * 0.95);
  }
  if (miningPolicies.has("automated_ops")) {
    rates.steelProduction = Math.floor(rates.steelProduction * 1.0);
  }

  // ─── DIFFICULTY & SKILL MODIFIERS ──────────────────────────────────
  const augStr = (augFx.strength ?? 0) * 0.005;
  const augSpd = (augFx.speed ?? 0) * 0.005;
  const augEnd = (augFx.endurance ?? 0) * 0.005;
  rates.taxIncome = Math.floor(rates.taxIncome * diffMult.income * (1 + sk.administration * 0.02 + att.authority * 0.01));
  rates.tradeIncome = Math.floor(rates.tradeIncome * diffMult.income * (1 + sk.logistics * 0.02 + sk.diplomacy * 0.01 + augSpd));
  rates.foodProduction = Math.floor(rates.foodProduction * (1 + sk.logistics * 0.015 + augEnd));
  rates.steelProduction = Math.floor(rates.steelProduction * (1 + sk.engineering * 0.02 + augStr));

  // ─── TECHNOLOGY RATE BONUSES ─────────────────────────────────────────
  const techEffects = buildTechEffectsCache(s.unlockedTechnologies, bldg);
  rates.foodProduction += techEffects.foodProduction ?? 0;
  rates.steelProduction += techEffects.steelProduction ?? 0;
  rates.goodsProduction += techEffects.goodsProduction ?? 0;
  rates.fuelProduction += techEffects.fuelProduction ?? 0;
  rates.medProduction += techEffects.medProduction ?? 0;
  rates.taxIncome += techEffects.taxIncome ?? 0;
  rates.tradeIncome += techEffects.tradeIncome ?? 0;
  // Persistent trade-income modifier from resolved/auto-fired events. Added as
  // a flat, face-value bonus (like the tech/company/policy contributions
  // around it) so a "+200 trade routes" event actually shows in the budget
  // every tick instead of being wiped by the rate recompute above. See
  // applyEventEffects/applyResponseEffects in events.ts and
  // GameState.eventTradeIncome. Trade income floors at 0 downstream
  // (computeTradeAfterCongestion), so a large negative accumulator simply
  // zeroes trade rather than turning it into a charge.
  rates.tradeIncome += s.eventTradeIncome ?? 0;

  // ─── SOFTWARE UPGRADE EFFECTS ────────────────────────────────────────
  // Installed software upgrades (administration → SYSTEMS) used to be a
  // complete no-op: getTotalEffects existed but was never consumed by the
  // tick (Steam player report). Flat income lands here; percent-scaled
  // efficiency keys apply after all flat trade/consumption sources are
  // assembled (see SOFTWARE UPGRADE EFFICIENCY block below); stat keys
  // ride the same divisor path as tech stat modifiers below.
  const swEffects: Partial<Record<string, number>> = s.softwareUpgrades
    ? getSoftwareUpgradeEffects(s.softwareUpgrades)
    : {};
  rates.taxIncome += swEffects.taxIncome ?? 0;

  // ─── TECH + SOFTWARE STAT MODIFIERS (per-tick contribution) ──────────
  // The 9 city-stat keys below used to be silent (declared on tech literals
  // but never consumed), making flavor techs in RELIGION_TECHNOLOGIES,
  // ECOLOGY_TECHNOLOGIES, and STATECRAFT_SHADOW_TECHNOLOGIES tooltip-only.
  // Wired here as a per-tick additive contribution scaled by
  // TECH_STAT_DIVISOR so a tech declaring `crime: -4` does not instantly
  // pin a 0..100 clamped stat. Tune the divisor up to soften, down to
   // sharpen. constructionSpeed is consumed at construction order time by
   // pendingConstruction.ts, where it shortens frozen order durations.
  // Software upgrade stat keys share the same divisor path so an upgrade
  // declaring `crime: -3` contributes a steady per-tick pull, not an
  // instant stat jump.
  const TECH_STAT_DIVISOR = 4;
  const techCrimeMod = ((techEffects.crime ?? 0) + (swEffects.crime ?? 0)) / TECH_STAT_DIVISOR;
  const techUnrestMod = ((techEffects.unrest ?? 0) + (swEffects.unrest ?? 0)) / TECH_STAT_DIVISOR;
  const techHappyMod = ((techEffects.happiness ?? 0) + (swEffects.happiness ?? 0)) / TECH_STAT_DIVISOR;
  const techLawMod = ((techEffects.lawOrder ?? 0) + (swEffects.lawOrder ?? 0)) / TECH_STAT_DIVISOR;
  const techCorruptMod = ((techEffects.corruption ?? 0) + (swEffects.corruption ?? 0)) / TECH_STAT_DIVISOR;
  const techEmploymentMod = ((techEffects.employment ?? 0) + (swEffects.employment ?? 0)) / TECH_STAT_DIVISOR;
  const techInfraMod = ((techEffects.infrastructureHealth ?? 0) + (swEffects.infrastructureHealth ?? 0)) / TECH_STAT_DIVISOR;
  const techDefenseMod = ((techEffects.defenseRating ?? 0) + (swEffects.defenseRating ?? 0)) / TECH_STAT_DIVISOR;
  const techGrowthMod = (techEffects.populationGrowthRate ?? 0) / TECH_STAT_DIVISOR;
  const swHealthMod = (swEffects.publicHealth ?? 0) / TECH_STAT_DIVISOR;

  // ─── COMPANY CONTRIBUTIONS ───────────────────────────────────────────
  let companyMaintenance = 0;
  let companyCorruption = 0;
  let companyHappiness = 0;
  let companyCrimeModifier = 0;
  let companyStabilityBonus = 0;
  let companyEmployment = 0;
  let operationalCompanyCount = 0;

  for (const instance of s.companies) {
    if (!isCompanyOperational(instance)) continue;
    const def = COMPANIES_MAP[instance.companyId];
    if (!def) continue;
    operationalCompanyCount++;
    rates.taxIncome += def.taxOutput;
    rates.tradeIncome += def.effects.trade ?? 0;
    rates.foodProduction += def.effects.food ?? 0;
    rates.steelProduction += def.effects.steel ?? 0;
    rates.goodsProduction += def.effects.goods ?? 0;
    rates.fuelProduction += def.effects.fuel ?? 0;
    rates.medProduction += def.effects.med ?? 0;
    companyMaintenance += def.maintenanceCost;
    companyCorruption += def.corruptionRisk * 0.04;
    companyHappiness += def.effects.happiness ?? 0;
    companyCrimeModifier += def.effects.crime ?? 0;
    companyStabilityBonus += def.effects.stability ?? 0;
    companyEmployment += def.employment;
  }

  // ─── CITY POLICY RATE BONUSES ─────────────────────────────────────────
  const bbOn = isBigBrotherActive(s.addons);
  const sdOn = isSixthDayActive(s.addons);
  const activePols = (s.activePolicies ?? []).filter((pid) => {
    if (isBBContentId(pid) && !bbOn) return false;
    if (isSDContentId(pid) && !sdOn) return false;
    return true;
  });
  let policyCost = 0;
  for (const pid of activePols) {
    const pd = POLICY_MAP[pid];
    if (!pd) continue;
    policyCost += pd.costPerTick;
    const fx = pd.effects;
    if (fx.taxIncome) rates.taxIncome += fx.taxIncome;
    if (fx.tradeIncome) rates.tradeIncome += fx.tradeIncome;
    if (fx.foodProduction) rates.foodProduction += fx.foodProduction;
    if (fx.steelProduction) rates.steelProduction += fx.steelProduction;
    if (fx.goodsProduction) rates.goodsProduction += fx.goodsProduction;
    if (fx.fuelProduction) rates.fuelProduction += fx.fuelProduction;
    if (fx.medProduction) rates.medProduction += fx.medProduction;
  }

  // ─── MEGA-PROJECT PRODUCTION BONUSES ─────────────────────────────────
  // Task #169: wrapped in safeSub so a malformed megaproject instance
  // (bad projectId, missing phase, etc.) can't kill the whole tick.
  safeSub("Mega Projects", entries, () => {
  if (s.megaProjects?.length) {
    const operational = s.megaProjects.filter(p => p.phase === "operational");
    for (const p of operational) {
      switch (p.projectId) {
        case "space_elevator": rates.tradeIncome += 200; break;
        case "arcology": rates.foodProduction += 60; break;
        case "underground_rail": rates.taxIncome += 100; break;
        case "atmospheric_processor": rates.foodProduction += 80; break;
        case "mega_factory": rates.goodsProduction += 200; rates.steelProduction += 100; rates.tradeIncome += 500; break;
        case "quantum_computing_hub": rates.tradeIncome += 50; break;
        case "orbital_habitat_ring": rates.tradeIncome += 300; break;
        case "subterranean_reservoir": rates.foodProduction += 30; break;
        case "titan_forge": rates.steelProduction += 300; rates.goodsProduction += 150; break;
      }
    }
  }
  });

  // ─── PRESTIGE RESOURCE PRODUCTION MULTIPLIER ─────────────────────────
  const pResMult = s.prestigeResourceMult ?? 1;
  if (pResMult > 1) {
    rates.foodProduction = Math.floor(rates.foodProduction * pResMult);
    rates.steelProduction = Math.floor(rates.steelProduction * pResMult);
    rates.goodsProduction = Math.floor(rates.goodsProduction * pResMult);
    rates.fuelProduction = Math.floor(rates.fuelProduction * pResMult);
    rates.medProduction = Math.floor(rates.medProduction * pResMult);
  }

  // ─── SOFTWARE UPGRADE EFFICIENCY MODIFIERS ───────────────────────────
  // Percent-scaled software upgrade keys, applied AFTER every flat trade /
  // consumption source above (companies, policies, mega-projects) so the
  // multiplier covers the full base. Efficiency reductions are capped at
  // 50% defensively so stacked tiers can never zero a consumption channel.
  const swTradeEff = swEffects.tradeEfficiency ?? 0;
  if (swTradeEff > 0) {
    rates.tradeIncome = Math.floor(rates.tradeIncome * (1 + swTradeEff / 100));
  }
  const swPowerEff = Math.min(50, swEffects.powerEfficiency ?? 0);
  if (swPowerEff > 0) {
    rates.powerDrain = Math.max(0, Math.floor(rates.powerDrain * (1 - swPowerEff / 100)));
  }
  const swWaterEff = Math.min(50, swEffects.waterEfficiency ?? 0);
  if (swWaterEff > 0) {
    rates.waterConsumption = Math.max(0, Math.floor(rates.waterConsumption * (1 - swWaterEff / 100)));
  }

  // ─── REFUGEE WORKFORCE BOOST ─────────────────────────────────────────
  // Accepting refugees pays off: while the boost lasts, new arrivals staff
  // the production lines. Applied HERE (after rates are built, before the
  // resource accrual below) so the bonus lands in this tick's actual
  // steel/goods/food gain, not just the displayed rates. Granted by
  // resolveIncident (refugee crisis / war migrant wave decisions).
  safeSub("Refugee Workforce", entries, () => {
    const boostTicks = s.refugeeBoostTicksRemaining ?? 0;
    const boostMag = s.refugeeBoostMagnitude ?? 0;
    if (boostTicks > 0 && boostMag > 0) {
      const goodsBonus = Math.floor(rates.goodsProduction * boostMag);
      const steelBonus = Math.floor(rates.steelProduction * boostMag);
      const foodBonus = Math.floor(rates.foodProduction * boostMag * 0.5);
      rates.goodsProduction += goodsBonus;
      rates.steelProduction += steelBonus;
      rates.foodProduction += foodBonus;
      s.refugeeBoostTicksRemaining = boostTicks - 1;
      if (goodsBonus + steelBonus + foodBonus > 0) {
        entries.push({
          label: "Refugee Workforce",
          delta: goodsBonus + steelBonus,
          unit: "output",
          reason: `New arrivals staff the lines: +${Math.round(boostMag * 100)}% goods/steel, +${Math.round(boostMag * 50)}% food (${boostTicks - 1} ticks left)`,
          severity: "positive",
        });
      }
      if (s.refugeeBoostTicksRemaining === 0) s.refugeeBoostMagnitude = 0;
    }
  });

  // ─── INCOME ──────────────────────────────────────────────────────────
  // Bureaucratic overhead: a megacity's administrative friction grows with population.
  // Linearly ramps from 0% at 200k pop to 30% at 1.5M+, capped. Discourages pure
  // building-stack income strategies and gives late-game corruption/efficiency
  // techs a real lever to pull. The math lives in economyBreakdown (Task #473)
  // so the Economy tab's P&L shows exactly what is credited here.
  const { net: tax, overhead, factor: overheadFactor } = computeTaxAfterOverhead(rates.taxIncome, cs.population);
  r.credits += tax;
  recordCreditsEarned(s, tax);
  // Ledger discipline (Task #473): book the GROSS here and the overhead as
  // its own negative line, so the credit entries sum to the actual treasury
  // change (only the net was credited above).
  // Task #582: itemize the licensed-company share of gross tax as its own
  // ledger line so a purchased commercial license visibly pays out. The two
  // entries sum to the exact gross booked before the split, so the
  // sum(credit entries) === treasury delta invariant is untouched.
  const licensedCompanyTax = Math.min(
    computeCompanyTaxOutput(s.companies),
    Math.max(0, tax + overhead),
  );
  entries.push({
    label: "Tax Revenue",
    delta: tax + overhead - licensedCompanyTax,
    unit: "credits",
    reason: `Residential, industrial & transit base`,
    severity: "positive",
  });
  if (licensedCompanyTax > 0) {
    const n = operationalCompanyCount;
    entries.push({
      label: "Commercial Licensing",
      delta: licensedCompanyTax,
      unit: "credits",
      reason: `Tax output from ${n} licensed compan${n === 1 ? "y" : "ies"}`,
      severity: "positive",
    });
  }
  if (overhead > 0) {
    entries.push({
      label: "Bureaucratic Overhead",
      delta: -overhead,
      unit: "credits",
      reason: `Administrative friction at megacity scale (${Math.round(overheadFactor * 100)}%)`,
      severity: "negative",
    });
  }

  // Port-saturation friction: the more freight the city moves, the more its
  // trade lanes congest and lose efficiency. Symmetric to bureaucratic overhead
  // on tax — caps gross trade gracefully without hard ceilings, scaling with
  // population so small/midcap cities stay efficient and megacities pay the
  // congestion tax.
  // Rail construction advances once in the canonical tick path after base
  // rates are rebuilt and before resources accrue. It is pure and therefore
  // also naturally advances during offline catch-up's repeated runTick calls.
  const railTick = processRailNetworkTick(s);
  s.railCorridors = railTick.railCorridors;
  s.messages = railTick.messages;
  const rail = getRailNetworkDiagnostics(s);
  rates.tradeIncome += rail.tradeIncome;
  rates.goodsProduction += rail.industrialOutput;
  const { net: trade, loss: congestionLoss, factor: portCongestionFactor } = computeTradeAfterCongestion(rates.tradeIncome, cs.population);
  r.credits += trade;
  recordCreditsEarned(s, trade);
  if (rail.operatingCost > 0) {
    r.credits -= rail.operatingCost;
    entries.push({ label: "Rail Operations", delta: -rail.operatingCost, unit: "credits", reason: "Staffing, safety, and public-access operating subsidy", severity: "negative" });
  }
  entries.push({
    label: "Trade Income",
    delta: trade + congestionLoss,
    unit: "credits",
    reason: "Skyports, freight & logistics",
    severity: "positive",
  });
  if (congestionLoss > 0) {
    entries.push({
      label: "Port Congestion",
      delta: -congestionLoss,
      unit: "credits",
      reason: `Freight bottlenecks at megacity scale (${Math.round(portCongestionFactor * 100)}%)`,
      severity: "negative",
    });
  }

  // Mining policy income scales with actual steel output rather than a flat
  // late-game-trivial bonus. A small floor keeps these meaningful in early game
  // when steel production is still ramping up.
  // Task #473: mining-policy income math is shared with the Economy tab via
  // economyBreakdown, using the freshly recalculated local rates.
  const miningIncome = computeMiningPolicyIncome(s.activeMiningPolicies, rates.steelProduction);
  if (miningIncome.reclamationTax > 0) {
    r.credits += miningIncome.reclamationTax;
    recordCreditsEarned(s, miningIncome.reclamationTax);
    entries.push({ label: "Reclamation Tax", delta: miningIncome.reclamationTax, unit: "credits", reason: `Levy on ${Math.max(0, rates.steelProduction)}/tick steel output`, severity: "positive" });
  }
  if (miningIncome.blackMarketOre > 0) {
    r.credits += miningIncome.blackMarketOre;
    recordCreditsEarned(s, miningIncome.blackMarketOre);
    entries.push({ label: "Black Market Ore", delta: miningIncome.blackMarketOre, unit: "credits", reason: `Illicit sales scaled to ${Math.max(0, rates.steelProduction)}/tick steel output`, severity: "positive" });
  }

  const tourismInc = Math.max(0, rates.tourismIncome);
  if (tourismInc > 0) {
    r.credits += tourismInc;
    recordCreditsEarned(s, tourismInc);
    entries.push({
      label: "Tourism Income",
      delta: tourismInc,
      unit: "credits",
      reason: `${touristCount.toLocaleString()} visitors — ${tourismSatisfactionBase}% satisfaction`,
      severity: "positive",
    });
  }

  // ─── UPKEEP ───────────────────────────────────────────────────────────
  // Task #473: unit upkeep is derived from the authoritative UNIT_CATEGORIES
  // defs (upkeepPerUnit) via the shared economyBreakdown module — the same
  // numbers the Recruitment and Economy tabs display. Every unit type with a
  // positive upkeepPerUnit is charged; the old hand-copied 39-key list left
  // most unit types silently free.
  const adjustedLawUpkeep = computeUnitUpkeep(unit, diff);
  r.credits -= adjustedLawUpkeep;
  entries.push({
    label: "Unit Upkeep",
    delta: -adjustedLawUpkeep,
    unit: "credits",
    reason: `${Object.values(unit).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0)} total personnel`,
    severity: "negative",
  });

  // Task #473: the per-building upkeep table lives in economyBreakdown
  // (INFRA_UPKEEP) — shared with the Economy tab's P&L, so the display can
  // never drift from what is charged here.
  const adjustedInfraUpkeep = computeInfraUpkeep(bldg, diff);
  r.credits -= adjustedInfraUpkeep;
  entries.push({
    label: "Infrastructure Upkeep",
    delta: -adjustedInfraUpkeep,
    unit: "credits",
    reason: "Power, water, industrial & defense facilities",
    severity: "negative",
  });

  // Company maintenance costs
  if (companyMaintenance > 0) {
    r.credits -= companyMaintenance;
    entries.push({
      label: "Company Contracts",
      delta: -companyMaintenance,
      unit: "credits",
      reason: `${operationalCompanyCount} licensed compan${operationalCompanyCount === 1 ? "y" : "ies"}`,
      severity: "negative",
    });
  }

  // ─── SEASONAL & WEATHER MODIFIERS (applied before resource consumption) ──
  let utilityPowerGeneration = rates.powerGeneration;
  let utilityWaterProduction = rates.waterProduction;
  // Keep malformed megaproject records isolated from the rest of the tick.
  // The shared helper reads the same project IDs as this block, so it belongs
  // to the existing Mega Projects safety boundary.
  safeSub("Mega Projects", entries, () => {
    utilityPowerGeneration = computePowerProductionComponents(s).totalOutput;
    utilityWaterProduction = computeWaterProductionComponents(s).totalOutput;
  });
  rates.powerGeneration = utilityPowerGeneration;
  rates.waterProduction = utilityWaterProduction;

  if (s.season) {
    const seasonMods = getSeasonalModifiers(s.season);
    rates.foodProduction = Math.floor(rates.foodProduction * seasonMods.foodProduction);
    rates.powerDrain = Math.floor(rates.powerDrain * seasonMods.powerDrain);
    if (seasonMods.happiness) cs.happiness = clampStat(cs.happiness + seasonMods.happiness * 0.1);
    if (seasonMods.diseaseRisk && cs.diseaseRisk !== undefined) cs.diseaseRisk = Math.max(0, cs.diseaseRisk + seasonMods.diseaseRisk * 0.1);
  }
  if (s.weather) {
    const wxFx = WEATHER_EFFECTS[s.weather];
    if (wxFx) {
      if (wxFx.happiness) cs.happiness = clampStat(cs.happiness + wxFx.happiness * 0.25);
      if (wxFx.unrest) cs.unrest = clampStat(cs.unrest + wxFx.unrest * 0.25);
      if (wxFx.crime) cs.crime = clampStat(cs.crime + wxFx.crime * 0.25);
      if (wxFx.diseaseRisk && cs.diseaseRisk !== undefined) cs.diseaseRisk = Math.max(0, cs.diseaseRisk + wxFx.diseaseRisk * 0.25);
      if (wxFx.foodProduction) rates.foodProduction = Math.max(0, rates.foodProduction + wxFx.foodProduction);
      if (wxFx.powerDrain) rates.powerDrain = Math.max(0, rates.powerDrain + wxFx.powerDrain);
    }
  }

  // ─── FOOD ─────────────────────────────────────────────────────────────
  // Consume before production so a full food reserve still drains and can
  // refill the room created in the same tick.
  const foodBefore = r.food;
  applyResourceDelta(s, "food", -rates.foodConsumption);
  const foodProduction = applyResourceDelta(s, "food", rates.foodProduction);
  const foodNet = r.food - foodBefore;
  entries.push({
    label: "Food",
    delta: foodNet,
    unit: "units",
    reason: foodProduction.rejected > 0
      ? `+${rates.foodProduction} produced, -${rates.foodConsumption} consumed; ${foodProduction.rejected} could not fit in food storage`
      : `+${rates.foodProduction} produced, -${rates.foodConsumption} consumed`,
    severity: foodProduction.rejected > 0 ? "warning" : foodNet >= 0 ? "positive" : "warning",
  });

  // ─── WATER ────────────────────────────────────────────────────────────
  const waterNet = rates.waterProduction - rates.waterConsumption;
  r.water = Math.max(0, r.water + waterNet);
  entries.push({
    label: "Water",
    delta: waterNet,
    unit: "units",
    reason: `+${rates.waterProduction} recycled/harvested, -${rates.waterConsumption} used`,
    severity: waterNet >= 0 ? "positive" : "warning",
  });

  // ─── POWER ────────────────────────────────────────────────────────────
  const powerNet = rates.powerGeneration - Math.floor(rates.powerDrain);
  // Energy Storage Vaults expand the gameplay buffer; this is deliberately
  // separate from the much larger sanitizer ceiling.
  applyResourceDelta(s, "power", powerNet);
  entries.push({
    label: "Power",
    delta: powerNet,
    unit: "MW",
    reason: `+${rates.powerGeneration} gen, -${Math.floor(rates.powerDrain)} drain`,
    severity: powerNet >= 0 ? "positive" : "warning",
  });

  // ─── STEEL & GOODS ────────────────────────────────────────────────────
  const steelMaintenance = Math.floor(cs.population / 50000) +
    Math.floor(Object.values(bldg).reduce((a, v) => a + (typeof v === "number" ? v : 0), 0) * 0.3);
  const steelNet = rates.steelProduction - steelMaintenance;
  const steelStorage = applyResourceDelta(s, "steel", steelNet);
  entries.push({
    label: "Steel",
    delta: steelStorage.applied,
    unit: "tons",
    reason: steelStorage.rejected > 0
      ? `Storage full: ${steelStorage.rejected} produced steel could not be stored. Build Supply Chain Distribution Centers.`
      : `+${rates.steelProduction} produced, -${steelMaintenance} maintenance`,
    severity: steelStorage.rejected > 0 ? "warning" : steelNet >= 0 ? "positive" : "warning",
  });

  const goodsNet = rates.goodsProduction - rates.goodsConsumption;
  const goodsStorage = applyResourceDelta(s, "goods", goodsNet);
  entries.push({
    label: "Goods",
    delta: goodsStorage.applied,
    unit: "units",
    reason: goodsStorage.rejected > 0
      ? `Storage full: ${goodsStorage.rejected} produced goods could not be stored. Build Supply Chain Distribution Centers.`
      : `+${rates.goodsProduction} prod, -${rates.goodsConsumption} consumed`,
    severity: goodsStorage.rejected > 0 ? "warning" : goodsNet >= 0 ? "positive" : "warning",
  });

  // ─── FUEL & MED ───────────────────────────────────────────────────────
  const fuelConsumption =
    Math.floor(u(unit, "patrolJudges") * 0.3 +
    u(unit, "streetPatrolUnits") * 0.2 +
    u(unit, "armoredResponseUnits") * 0.5 +
    u(unit, "judgeGunships") * 1.5 +
    u(unit, "tacticalDropShips") * 1.0 +
    b(bldg, "skyrailTransitLines") * 0.5 +
    b(bldg, "cargoFreightMegaways") * 0.3);
  // Consume first, then refill the room that consumption created. Applying a
  // single positive net delta at a full cap would otherwise erase the draw.
  applyResourceDelta(s, "fuel", -fuelConsumption);
  applyResourceDelta(s, "fuel", rates.fuelProduction);

  const medConsumption = getMedicalSupplyConsumption(s);
  // Consume first, then accept production into whatever room remains. This
  // prevents a full reserve from making consumption disappear when production
  // is larger than the per-tick draw.
  const medicalConsumption = applyResourceDelta(s, "medSupplies", -medConsumption);
  const medicalProduction = applyResourceDelta(s, "medSupplies", rates.medProduction);
  entries.push({
    label: "Medical Supplies",
    delta: medicalConsumption.applied + medicalProduction.applied,
    unit: "units",
    reason: `${summarizeMedicalStorageGain(medicalProduction)} -${Math.max(0, -medicalConsumption.applied)} consumed.`,
    severity: medicalProduction.rejected > 0
      ? "warning"
      : medicalConsumption.applied + medicalProduction.applied >= 0 ? "positive" : "warning",
  });

  // ─── UTILITY LAYER ──────────────────────────────────────────────────
  if (s.utilities) {
    const ut = s.utilities;

    const powerNet = rates.powerGeneration - Math.floor(rates.powerDrain);
    ut.powerStored = clamp(ut.powerStored + powerNet * 0.5, 0, 5000 + b(bldg, "energyStorageVaults") * 500);

    ut.wasteGenerated =
      Math.floor(cs.population / 8000) +
      b(bldg, "megaManufacturingPlants") * 8 +
      b(bldg, "metalFoundryComplexes") * 6 +
      b(bldg, "automatedAssemblyLines") * 4 +
      b(bldg, "syntheticFoodPlants") * 3;

    ut.wasteProcessed =
      b(bldg, "sewerPurificationPlants") * 25 +
      b(bldg, "industrialRecyclingFacilities") * 20 +
      u(unit, "sanitationDroid") * 3 +
      u(unit, "wasteProcessorDroid") * 5 +
      u(unit, "streetSweeperDroid") * 2;

    ut.transitCapacity =
      b(bldg, "skyrailTransitLines") * 30 +
      b(bldg, "undergroundMaglevSystem") * 50 +
      b(bldg, "cargoFreightMegaways") * 20 +
      b(bldg, "droneLogisticsCorridors") * 15 +
      b(bldg, "rapidEmergencyTransitLines") * 10 +
      b(bldg, "pedestrianSkybridgeNetworks") * 8 +
      u(unit, "trafficControlDroid") * 4 +
      u(unit, "cargoHandlerDroid") * 3;
    // Rebuilt utility capacity is authoritative every tick, so add rail only
    // after that rebuild (rather than ratcheting a persisted prior value).
    ut.transitCapacity += rail.transitCapacity;

    ut.transitLoad = Math.floor(cs.population / 6000) +
      b(bldg, "megaManufacturingPlants") * 5 +
      b(bldg, "habBlockMegaTowers") * 8 +
      b(bldg, "workerHousingStacks") * 5;

    const communications = computeCommunicationsBreakdown(bldg, unit);
    ut.commsStrength = communications.strength;

    ut.fuelDistribution = clamp(
      Math.min(r.fuel, 100) +
      b(bldg, "vehicleMaintenanceDepots") * 10 +
      b(bldg, "cargoFreightMegaways") * 5 +
      b(bldg, "automatedFreightTerminals") * 8,
      0, 100
    );

    ut.sanitationLevel = clamp(
      (ut.wasteProcessed > 0 && ut.wasteGenerated > 0
        ? Math.floor((ut.wasteProcessed / Math.max(1, ut.wasteGenerated)) * 70)
        : 50) +
      u(unit, "sanitationDroid") * 1.5 +
      u(unit, "streetSweeperDroid") * 1 +
      b(bldg, "sewerPurificationPlants") * 3,
      0, 100
    );

    const wasteOverflow = ut.wasteGenerated - ut.wasteProcessed;
    if (wasteOverflow > 20) {
      cs.happiness = clampStat(cs.happiness - 1);
      cs.crime = clampStat(cs.crime + 0.5);
    }
    if (ut.transitLoad > ut.transitCapacity) {
      cs.happiness = clampStat(cs.happiness - 1);
      cs.employment = clampStat(cs.employment - 0.5);
    }
    if (ut.commsStrength < COMMUNICATIONS_LOW_SIGNAL_THRESHOLD) {
      cs.corruption = clampStat(cs.corruption + 1);
    }
    if (ut.sanitationLevel < 40) {
      cs.happiness = clampStat(cs.happiness - 1);
    }

    entries.push({
      label: "Utilities",
      delta: 0,
      unit: "",
      reason: `Waste ${ut.wasteProcessed}/${ut.wasteGenerated} | Transit ${ut.transitLoad}/${ut.transitCapacity} | Comms ${ut.commsStrength}% | Sanitation ${ut.sanitationLevel}%`,
      severity: wasteOverflow > 20 ||
        ut.transitLoad > ut.transitCapacity ||
        ut.commsStrength < COMMUNICATIONS_LOW_SIGNAL_THRESHOLD ? "warning" : "neutral",
    });
  }

  // ─── SUPPLY CHAIN ──────────────────────────────────────────────────
  safeSub("Supply Chain", entries, () => {
  if (s.stockpiles) {
    const { updatedStockpiles, produced, starved } = processSupplyChain(
      s.stockpiles, bldg, unit, s.totalTicks
    );
    s.stockpiles = updatedStockpiles;

    if (produced.length > 0 || starved.length > 0) {
      entries.push({
        label: "Supply Chain",
        delta: produced.length,
        unit: "chains",
        reason: starved.length > 0
          ? `${produced.length} active, ${starved.length} starved`
          : `${produced.length} production chains active`,
        severity: starved.length > 3 ? "warning" : "neutral",
      });
    }
  }
  });

  // ─── MILITARY LOGISTICS (Task #381) ──────────────────────────────────
  // Personnel/supply/fleet/installation economy. Derives the standing army
  // from s.units, mans installations & crews vehicles, produces supply, and
  // publishes combatReadinessMod / fleetOperational / installationDefenseBonus
  // that the combat & defense code below read. Runs after Supply Chain so
  // stockpiles/rates are settled, before combat & defenseRating.
  safeSub("Military Logistics", entries, () => {
    processMilitaryLogistics(s, entries);
  });

  // ─── TRADE AGREEMENTS ───────────────────────────────────────────────
  safeSub("Trade Agreements", entries, () => {
  if (s.tradeAgreements && s.tradeAgreements.length > 0) {
    let tradeCredits = 0;
    s.tradeAgreements = s.tradeAgreements.map((agreement) => {
      if (agreement.status !== "active") return agreement;
      if (agreement.remainingTicks <= 0) return { ...agreement, status: "expired" as const };

      const RES_MAP: Record<string, keyof typeof r> = {
        "__res_food": "food", "__res_water": "water", "__res_steel": "steel",
        "__res_power": "power", "__res_goods": "goods", "__res_fuel": "fuel",
        "__res_medSupplies": "medSupplies", "__res_ammo": "ammo",
      };
      const getPlayerQty = (id: string) => RES_MAP[id] ? r[RES_MAP[id]] : (s.stockpiles[id] ?? 0);
      const canAfford = agreement.give.every((g) => getPlayerQty(g.commodity) >= g.amount);

      let partnerCanAfford = true;
      if (agreement.partnerType === "megacity" && s.externalMegacities) {
        const mc = s.externalMegacities.find((m) => m.id === agreement.partnerId);
        if (mc) {
          partnerCanAfford = agreement.receive.every(
            (rc) => RES_MAP[rc.commodity] ? true : (mc.tradeInventory[rc.commodity] ?? 0) >= rc.amount
          );
        }
      }

      const incomingFits = agreement.receive.every((rc) => {
        const key = RES_MAP[rc.commodity];
        if (!key || !STORAGE_RESOURCE_KEYS.includes(key as StorageResourceKey)) return true;
        return rc.amount <= Math.max(0, getResourceStorageCapacity(s, key as StorageResourceKey) - r[key]);
      });

      if (canAfford && partnerCanAfford && incomingFits) {
        for (const g of agreement.give) {
          if (RES_MAP[g.commodity]) {
            const rKey = RES_MAP[g.commodity]; r[rKey] = Math.max(0, r[rKey] - g.amount);
          } else {
            s.stockpiles[g.commodity] = (s.stockpiles[g.commodity] ?? 0) - g.amount;
          }
        }
        for (const rc of agreement.receive) {
          if (RES_MAP[rc.commodity]) {
            const rcKey = RES_MAP[rc.commodity];
            applyResourceDelta(s, rcKey, rc.amount);
          } else {
            s.stockpiles[rc.commodity] = (s.stockpiles[rc.commodity] ?? 0) + rc.amount;
          }
        }
        if (agreement.partnerType === "megacity" && s.externalMegacities) {
          s.externalMegacities = s.externalMegacities.map((m) => {
            if (m.id !== agreement.partnerId) return m;
            const inv = { ...m.tradeInventory };
            for (const rc of agreement.receive) {
              if (!RES_MAP[rc.commodity]) inv[rc.commodity] = Math.max(0, (inv[rc.commodity] ?? 0) - rc.amount);
            }
            for (const g of agreement.give) {
              if (!RES_MAP[g.commodity]) inv[g.commodity] = (inv[g.commodity] ?? 0) + g.amount;
            }
            return { ...m, tradeInventory: inv };
          });
        }
        tradeCredits += agreement.creditsPerTick;
      } else if (canAfford && partnerCanAfford && !incomingFits) {
        entries.push({
          label: "Trade Blocked",
          delta: 0,
          unit: "",
            reason: "Incoming Food, Steel, Goods, Fuel, Power, or Medical Supplies cannot fit in storage. No outgoing resources were transferred; expand the relevant storage facilities.",
          severity: "warning",
        });
      }

      return { ...agreement, remainingTicks: agreement.remainingTicks - 1 };
    });

    if (tradeCredits > 0) {
      r.credits += tradeCredits;
      recordCreditsEarned(s, tradeCredits);
      entries.push({
        label: "Trade Agreements",
        delta: tradeCredits,
        unit: "credits",
        reason: `${s.tradeAgreements.filter((a) => a.status === "active").length} active agreements`,
        severity: "positive",
      });
    }
  }
  });

  // ─── JOINT PROJECTS ─────────────────────────────────────────────────
  if (s.jointProjects && s.jointProjects.length > 0) {
    let completedCount = 0;
    s.jointProjects = s.jointProjects.map((project) => {
      if (project.status !== "in_progress") return project;
      const partner = s.factions.find((f) => f.id === project.partnerId)
        ?? s.externalMegacities?.find((m) => m.id === project.partnerId);
      const currentLoyalty = partner ? (partner.loyalty ?? 50) : 50;
      const scaledContribution = Math.max(1, Math.floor(currentLoyalty / 10));
      const newProgress = project.progress + scaledContribution;
      if (newProgress >= project.target) {
        bldg[project.buildingKey] = (bldg[project.buildingKey] ?? 0) + 1;
        completedCount++;
        const msg: GameMessage = {
          id: `jp-complete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: s.gameDate,
          tick: s.totalTicks,
          category: "update",
          title: `JOINT PROJECT COMPLETE: ${project.buildingName.toUpperCase()}`,
          body: `The joint construction project with ${project.partnerName} is complete! A new ${project.buildingName} has been added to your city.`,
          read: false,
          priority: "high",
        };
        prependMessage(msg);
        return { ...project, progress: project.target, status: "complete" as const };
      }
      return { ...project, progress: newProgress };
    });

    if (completedCount > 0 || s.jointProjects.some((p) => p.status === "in_progress")) {
      entries.push({
        label: "Joint Projects",
        delta: completedCount,
        unit: "completed",
        reason: `${s.jointProjects.filter((p) => p.status === "in_progress").length} in progress`,
        severity: completedCount > 0 ? "positive" : "neutral",
      });
    }
  }

  // ─── MEGACITY TRADE INVENTORY REFRESH ─────────────────────────────
  if (s.externalMegacities) {
    s.externalMegacities = s.externalMegacities.map((m) => {
      if (s.totalTicks - m.lastRefreshTick >= 96) {
        return {
          ...m,
          lastRefreshTick: s.totalTicks,
          tradeInventory: {
            steel_ingots: 200 + Math.floor(Math.random() * 300),
            iron_ore: 300 + Math.floor(Math.random() * 400),
            copper_ingots: 150 + Math.floor(Math.random() * 200),
            titanium_alloy_bars: 40 + Math.floor(Math.random() * 80),
            steel_plates: 60 + Math.floor(Math.random() * 100),
            carbon_fiber_sheets: 30 + Math.floor(Math.random() * 60),
            aluminum_sheets: 80 + Math.floor(Math.random() * 120),
            copper_wire: 100 + Math.floor(Math.random() * 150),
            titanium_plates: 40 + Math.floor(Math.random() * 60),
            rare_earth_minerals: 20 + Math.floor(Math.random() * 40),
          },
        };
      }
      return m;
    });
  }

  // ─── DIPLOMATIC PACTS ────────────────────────────────────────────────
  if (s.diplomaticPacts && s.diplomaticPacts.length > 0) {
    s.diplomaticPacts = s.diplomaticPacts.map((pact) => {
      if (pact.status !== "active") return pact;
      if (pact.remainingTicks <= 0) return { ...pact, status: "expired" as const };

      if (pact.effects.threat) {
        if (pact.partnerType === "faction") {
          s.factions = s.factions.map((f) =>
            f.id === pact.partnerId
              ? { ...f, threat: Math.max(0, Math.min(100, f.threat + pact.effects.threat!)) }
              : f
          );
        } else if (s.externalMegacities) {
          s.externalMegacities = s.externalMegacities.map((m) =>
            m.id === pact.partnerId
              ? { ...m, threat: Math.max(0, Math.min(100, m.threat + pact.effects.threat!)) }
              : m
          );
        }
      }
      if (pact.effects.loyalty) {
        if (pact.partnerType === "faction") {
          s.factions = s.factions.map((f) =>
            f.id === pact.partnerId
              ? { ...f, loyalty: Math.max(0, Math.min(100, f.loyalty + pact.effects.loyalty!)) }
              : f
          );
        }
      }
      if (pact.effects.influence) {
        if (pact.partnerType === "faction") {
          s.factions = s.factions.map((f) =>
            f.id === pact.partnerId
              ? { ...f, influence: Math.max(0, Math.min(100, f.influence + pact.effects.influence!)) }
              : f
          );
        } else if (s.externalMegacities) {
          s.externalMegacities = s.externalMegacities.map((m) =>
            m.id === pact.partnerId
              ? { ...m, influence: Math.max(0, Math.min(100, m.influence + pact.effects.influence!)) }
              : m
          );
        }
      }
      if (pact.effects.crime) {
        cs.crime = Math.max(0, cs.crime + pact.effects.crime);
      }

      return { ...pact, remainingTicks: pact.remainingTicks - 1 };
    });
  }

  // ─── POPULATION ───────────────────────────────────────────────────────
  let growthRate = cs.populationGrowthRate;
  for (const pid of activePols) {
    const pd = POLICY_MAP[pid];
    if (pd?.effects.populationGrowthRate) growthRate += pd.effects.populationGrowthRate;
  }
  // Active-edict growth boosts are TEMPORARY, exactly like policies: they
  // contribute to this tick's effective rate only while the edict runs and
  // vanish when it expires. They previously did
  // `cs.populationGrowthRate += fx...` in the edict loop EVERY tick the
  // edict was active, permanently ratcheting the persistent base rate with
  // no reversal on expiry — the root cause of the 5M→100B offline-catchup
  // population explosion (see censusRepair in offlineCatchup.ts).
  if (s.activeEdicts && s.activeEdicts.length > 0) {
    for (const ae of s.activeEdicts) {
      if ((!bbOn && isBBContentId(ae.edictId)) || (!sdOn && isSDContentId(ae.edictId))) continue;
      // A malformed edict definition must not kill the tick from inside the
      // population block (Task #169 isolation). Skip it here silently — the
      // safeSub-wrapped ACTIVE EDICTS block below owns edict error reporting
      // and will surface the failure as an "Edicts" tick error.
      try {
        const edFx = getEdictById(ae.edictId)?.effects;
        if (edFx?.populationGrowth) growthRate += edFx.populationGrowth;
        if (edFx?.populationGrowthRate) growthRate += edFx.populationGrowthRate;
      } catch {
        continue;
      }
    }
  }
  if (r.food <= 0) growthRate -= 0.003;
  if (r.water <= 0) growthRate -= 0.002;
  if (cs.unrest > 70) growthRate -= 0.001;
  if (cs.happiness > 60) growthRate += 0.001;
  if (cs.publicHealth > 60) growthRate += 0.0005;
  if (cs.publicHealth < 25) growthRate -= 0.001;
  if (cs.diseaseRisk > 70) growthRate -= 0.001;
  if (cs.biosphere > 60) growthRate += 0.0005;
  // Housing acts as a soft ceiling on growth. Use the same authoritative
  // capacity as the homeless metric (base districts + every residential
  // building) so building housing RAISES the ceiling instead of — as the old
  // duplicate `|| 800000` calc did — lowering it the instant the first unit
  // went up. The penalty scales with how far the city has overshot capacity,
  // so population asymptotes toward what the city can actually shelter rather
  // than climbing forever (which is what a player sees with immigration off).
  const housingCap = computeHousingCapacity(bldg);
  if (cs.population > housingCap) {
    const overshoot = (cs.population - housingCap) / housingCap;
    growthRate -= Math.min(0.006, 0.002 + overshoot * 0.02);
  }

  // Apply tech growth bonus BEFORE the immigration/borders caps so a
  // sealed or immigration-banned city still has its growth ceiling
  // respected (techs represent internal growth pressure, not bypasses).
  growthRate += techGrowthMod;
  if (state.immigrationBanned && growthRate > 0) {
    growthRate *= 0.3;
  }
  if (state.bordersClosed) {
    growthRate = Math.min(growthRate, cs.populationGrowthRate * 0.1);
  }

  // Clamp the *effective* per-tick growth rate after all bonuses (base +
  // policies + edicts + tech + happiness/health/biosphere/penalties) so a
  // stack of long-game bonuses can never compound population into infinity.
  // 0.15 covers the largest legitimate stack (base capped at
  // MAX_BASE_POP_GROWTH_RATE=0.1 + every growth policy + tech mod +
  // situational bonuses ≈ 0.145) with the ×0.5/4 scaling below turning it
  // into ≤1.9%/tick. The old 0.5 cap allowed 6.25%/tick, which compounded a
  // drifted save's 5M population into the 100B ceiling during a single
  // overnight offline catch-up. Pairs with MAX_POPULATION below.
  const MAX_EFFECTIVE_GROWTH_RATE = 0.15;
  if (growthRate > MAX_EFFECTIVE_GROWTH_RATE) growthRate = MAX_EFFECTIVE_GROWTH_RATE;
  if (growthRate < -MAX_EFFECTIVE_GROWTH_RATE) growthRate = -MAX_EFFECTIVE_GROWTH_RATE;

  const dailyGrowthRate = (growthRate * 0.5) / 4;
  const popDelta = Math.floor(cs.population * dailyGrowthRate);
  // Hard ceiling matches `MAX_POPULATION` in sanitizer.ts. 100B is well
  // above any realistic Earth-scale total but small enough that formatPop
  // always returns a sane "<X>B" string and the overview banner stays
  // within its column width (a wider value caused adjacent stats to
  // visually overlap during long playthroughs).
  const POP_CEILING = 100_000_000_000;
  cs.population = Math.min(POP_CEILING, Math.max(100000, cs.population + popDelta));
  const migrationNote = state.bordersClosed ? " [BORDERS SEALED]" : state.immigrationBanned ? " [IMMIGRATION BANNED]" : "";
  entries.push({
    label: "Population",
    delta: popDelta,
    unit: "citizens",
    reason: `Daily growth ${(growthRate * 50).toFixed(3)}%/day — housing cap ${housingCap.toLocaleString()}${migrationNote}`,
    severity: popDelta >= 0 ? "neutral" : "warning",
  });

  // ─── GOVERNANCE DOCTRINE MODIFIERS ───────────────────────────────────
  const doc = s.doctrine;
  const docLaw = (doc.lawVsMercy - 50) / 50;
  const docBrute = (doc.brutalityVsLegit - 50) / 50;
  const docOrder = (doc.orderVsProsperity - 50) / 50;
  const docCentral = (doc.centralVsLocal - 50) / 50;
  const densityPressure = computePopulationDensityPressure(cs.population);

  // ─── CRIME ────────────────────────────────────────────────────────────
  // Compute law unit strength
  const lawStrength =
    u(unit, "patrolJudges") * 0.5 +
    u(unit, "streetPatrolUnits") * 0.4 +
    u(unit, "seniorJudges") * 1.5 +
    u(unit, "eliteJudgeStrikeTeams") * 2.0 +
    u(unit, "antiGangTaskForces") * 0.8 +
    u(unit, "detectiveUnits") * 0.6 +
    u(unit, "undercoverInvestigators") * 0.7 +
    u(unit, "drugEnforcementUnits") * 0.5 +
    u(unit, "sectorLawSquads") * 0.4 +
    u(unit, "surveillanceDrones") * 0.2 +
    u(unit, "patrolDrones") * 0.2 +
    u(unit, "investigativeDrones") * 0.3 +
    u(unit, "intelligenceOfficers") * 0.5 +
    u(unit, "internalAffairsAgents") * 0.4 +
    u(unit, "combatAssaultDroid") * 0.8 +
    u(unit, "perimeterSentryDroid") * 0.4 +
    u(unit, "reconScoutDroid") * 0.3;

  const securityBonus =
    b(bldg, "sectorHouseHQ") * 2 +
    b(bldg, "citywideSurveillanceGrid") * 2 +
    b(bldg, "aiCrimePredictionCenters") * 2 +
    b(bldg, "solitaryDetentionBlocks") * 1 +
    b(bldg, "megaPrisonComplexes") * 2 +
    b(bldg, "antiGangEnforcementCenters") * 1.5 +
    b(bldg, "inquisitionHQ") * 2 +
    b(bldg, "confessionalBureau") * 1.5;

  let crimeDelta = 0;
  if (cs.unrest > 60) crimeDelta += 1;
  if (cs.happiness < 30) crimeDelta += 1;
  if (r.food <= 0) crimeDelta += 2;
  if (lawStrength > 200) crimeDelta -= 1;
  else if (lawStrength > 80) crimeDelta -= 1;
  crimeDelta -= Math.floor(securityBonus * 0.15);
  if (p.martialLaw) crimeDelta -= 1;
  if (p.curfewEnabled) crimeDelta -= 1;
  if (p.surveillanceActive) crimeDelta -= 1;
  if (cs.diseaseRisk > 60) crimeDelta += 1;
  if (cs.biosphere < 20) crimeDelta += 1;
  crimeDelta -= Math.floor(sk.investigation * 0.3 + sk.intimidation * 0.2 + (augFx.intimidation ?? 0) * 0.1);
  crimeDelta -= Math.round(docLaw * 1.5);
  crimeDelta -= Math.round(docBrute * 0.5);
  if (miningPolicies.has("black_market_ore")) crimeDelta += 2;
  crimeDelta += techCrimeMod;
  crimeDelta =
    Math.round(crimeDelta * diffMult.crime) +
    densityPressure.crimePerTick * diffMult.crime;

  if (state.cheats?.zombie) {
    crimeDelta = -cs.crime;
  }
  cs.crime = clampStat(cs.crime + crimeDelta);
  if (state.player && lawStrength > 80 && crimeDelta < 0) {
    const sentenced = Math.floor(lawStrength * 0.02 * Math.abs(crimeDelta));
    if (sentenced > 0) state.player.criminalsSentenced = (state.player.criminalsSentenced ?? 0) + sentenced;
  }
  entries.push({
    label: "Crime Index",
    delta: crimeDelta,
    unit: "pts",
    reason: state.cheats?.zombie
      ? "ZOMBIE MODE: crime suppressed"
      : crimeDelta < 0
        ? "Security forces reducing crime"
        : densityPressure.active
          ? "Crowding, unrest, and city-scale complexity driving crime"
          : "Unrest and poverty driving crime",
    severity: crimeDelta <= 0 ? "positive" : "negative",
  });

  // ─── CRIME DEMOGRAPHICS (batched) ──────────────────────────────────
  safeSub("Crime Demographics", entries, () => {
  if (state.crimeStats) {
    const crimeLevel = cs.crime / 100;
    const lawLevel = cs.lawOrder / 100;
    const unrestLevel = cs.unrest / 100;
    const popFactor = cs.population / 1000000;
    const corruptionLevel = cs.corruption / 100;
    const jitterFn = (seed: number) => 0.9 + ((seed * 7919 + state.totalTicks * 31) % 100) / 500;

    const avgGangInfluence = s.districts.length > 0
      ? s.districts.reduce((sum, d) => sum + d.gangInfluence, 0) / s.districts.length / 100
      : 0;

    const cst = { ...state.crimeStats };
    const crimeParams = { crimeLevel, lawLevel, unrestLevel, popFactor, corruptionLevel, avgGangInfluence, totalTicks: state.totalTicks };

    batchProcessCrime(cst, crimeParams, techEffects, cs);

    const totalViolent = cst.murder + cst.manslaughter + cst.assault + cst.aggravatedAssault + cst.robbery + cst.armedRobbery + cst.kidnapping;
    const totalProperty = cst.theft + cst.grandTheft + cst.burglary + cst.vehicleTheft + cst.arson + cst.vandalism;
    const totalLegacy = cst.fraud + cst.identityFraud + cst.extortion + cst.blackmail + cst.drugPossession + cst.drugTrafficking + cst.weaponsViolation + cst.cyberCrime + cst.smuggling + cst.humanTrafficking + cst.organizedCrime + cst.publicDisorder + cst.corruption;
    const totalCyberCrime = cst.illegalAugmentation + cst.implantTheft + cst.forcedCyberization + cst.neuralHijacking + cst.cyberpsychosis + cst.augmentSabotage + cst.blackClinicOperations + cst.implantCounterfeiting + cst.cyberwareSmugging + cst.neuralIdentitySpoofing + cst.prostheticWeaponization;
    const totalDataCrime = cst.dataBreaches + cst.networkIntrusion + cst.aiManipulation + cst.deepfakeFraud + cst.cryptoTheft + cst.digitalRansomware + cst.surveillanceHacking + cst.informationBrokering + cst.neuralNetTrespass + cst.virtualIdentityTheft + cst.dataMining + cst.gridTampering;
    const totalStreetCrime = cst.streetRacing + cst.gangWarfare + cst.protectionRacketeering + cst.stimDealering + cst.illegalGambling + cst.streetVendorExtortion + cst.graffitiBombing + cst.squatting + cst.droneFighting + cst.pedestrianAssault + cst.transitVandalism;
    const totalIndustrialCrime = cst.industrialEspionage + cst.toxicDumping + cst.factorySabotage + cst.laborExploitation + cst.supplyChainTampering + cst.patentTheft + cst.regulatoryFraud + cst.energyTheft + cst.automationSabotage + cst.wasteTrafficking + cst.resourceHoarding;
    const totalMedicalCrime = cst.organHarvesting + cst.illegalCloning + cst.bioweaponDevelopment + cst.unlicensedGeneMods + cst.pharmaceuticalCounterfeiting + cst.clinicalTrialFraud + cst.medicalDataTrafficking + cst.plagueHoarding + cst.syntheticBloodTrafficking + cst.neurotoxinDistribution + cst.illegalPsychSurgery;
    const totalHighLevelCrime = cst.corporateAssassination + cst.governmentInfiltration + cst.massManipulation + cst.electionRigging + cst.intelligenceSelling + cst.megacorpWarfare + cst.judicialCorruption + cst.politicalBlackmail + cst.shadowGovernment + cst.diplomaticCrimes + cst.treason;
    const totalBlackMarket = cst.unregisteredWeaponsSales + cst.syntheticDrugManufacturing + cst.alienArtifactTrafficking + cst.slaveChipTrading + cst.blackMarketCybernetics + cst.contrabandeering + cst.forgeryOperations + cst.illegalBountyHunting + cst.pitFighting + cst.mutantTrafficking + cst.radioactiveMaterialSmuggling;
    const totalIncidents = totalViolent + totalProperty + totalLegacy + totalCyberCrime + totalDataCrime + totalStreetCrime + totalIndustrialCrime + totalMedicalCrime + totalHighLevelCrime + totalBlackMarket;

    cst.totalArrests = Math.round(totalIncidents * (0.3 + lawLevel * 0.4) * jitterFn(27));
    cst.totalConvictions = Math.round(cst.totalArrests * (0.5 + lawLevel * 0.25) * jitterFn(28));
    cst.totalIncarcerations = Math.round(cst.totalConvictions * (0.55 + lawLevel * 0.2) * jitterFn(29));
    cst.recidivismRate = Math.round(Math.min(80, Math.max(10, 45 - lawLevel * 20 + crimeLevel * 15)));

    s.crimeStats = cst;
  }
  });

  // ─── UNREST ───────────────────────────────────────────────────────────
  const riotStrength =
    u(unit, "riotPoliceSquads") * 0.4 +
    u(unit, "riotShieldUnits") * 0.3 +
    u(unit, "crowdDispersalTeams") * 0.3 +
    u(unit, "heavyRiotMechUnits") * 1.0 +
    u(unit, "riotDroneSquads") * 0.3 +
    u(unit, "tacticalSuppressionTeams") * 0.5 +
    u(unit, "sonicCrowdControlUnits") * 0.4;

  const unrestSuppression =
    b(bldg, "riotControlCommandCenters") * 2 +
    b(bldg, "propagandaBroadcastingTowers") * 2 +
    b(bldg, "publicEntertainmentComplexes") * 1.5 +
    b(bldg, "welfareDistributionCenters") * 2 +
    b(bldg, "publicHealthMegaClinics") * 1 +
    b(bldg, "civicEducationInstitutes") * 1 +
    b(bldg, "districtTemple") * 1.5 +
    b(bldg, "grandCathedral") * 3 +
    b(bldg, "divineBroadcastTower") * 2 +
    b(bldg, "sacredGroundPark") * 1 +
    b(bldg, "doomsdayBunkerShrine") * 2 +
    b(bldg, "zealotBarracks") * 1.5;

  let unrestDelta = 0;
  const cohortUnrestPressure = computePopulationCohorts(s).unrestPressure;
  if (cohortUnrestPressure > 8) unrestDelta += 1;
  if (cohortUnrestPressure > 20) unrestDelta += 1;
  if (r.food <= 0) unrestDelta += 2;
  if (r.water <= 0) unrestDelta += 2;
  if (r.power < -100) unrestDelta += 1;
  if (cs.happiness < 30) unrestDelta += 1;
  if (p.martialLaw) unrestDelta += 2;
  if (p.curfewEnabled) unrestDelta += 1;
  if (p.propaganda) unrestDelta -= 1;
  if (cs.crime > 60) unrestDelta += 1;
  if (cs.diseaseRisk > 70) unrestDelta += 1;
  if (cs.biosphere > 60) unrestDelta -= 1;
  if (p.welfareRationing === "generous") unrestDelta -= 1;
  if (p.welfareRationing === "cut") unrestDelta += 1;
  if (r.goods > 200) unrestDelta -= 1;
  if (riotStrength > 100) {
    unrestDelta -= 1;
    if (state.player && cs.unrest > 30) {
      state.player.riotsQuelled = (state.player.riotsQuelled ?? 0) + 1;
    }
  }
  unrestDelta -= Math.floor(unrestSuppression * 0.15);
  unrestDelta -= Math.floor(sk.leadership * 0.2 + sk.propaganda * 0.15 + att.charisma * 0.1 + (augFx.social ?? 0) * 0.05);
  unrestDelta += Math.round(docBrute * 1.5);
  unrestDelta += Math.round(docLaw * 0.5);
  unrestDelta -= Math.round(docCentral * 0.5);
  unrestDelta += techUnrestMod;
  unrestDelta =
    Math.round(unrestDelta * diffMult.unrest) +
    densityPressure.unrestPerTick * diffMult.unrest;

  if (state.cheats?.zombie) {
    unrestDelta = -cs.unrest;
  }
  cs.unrest = clampStat(cs.unrest + unrestDelta);
  entries.push({
    label: "Unrest",
    delta: unrestDelta,
    unit: "pts",
    reason: state.cheats?.zombie
      ? "ZOMBIE MODE: unrest suppressed"
      : unrestDelta <= 0
        ? "Welfare, propaganda, riot control effective"
        : densityPressure.active || cohortUnrestPressure > 8
          ? "Crowding, shortages, and civic strain fueling unrest"
          : "Shortages and oppression fueling unrest",
    severity: unrestDelta <= 0 ? "positive" : "negative",
  });

  // ─── HAPPINESS ────────────────────────────────────────────────────────
  const happinessBonus =
    b(bldg, "publicHealthMegaClinics") * 1 +
    b(bldg, "publicEntertainmentComplexes") * 2 +
    b(bldg, "welfareDistributionCenters") * 1 +
    b(bldg, "skyrailTransitLines") * 0.5 +
    b(bldg, "undergroundMaglevSystem") * 1 +
    b(bldg, "civicEducationInstitutes") * 0.5 +
    b(bldg, "slumRehabProjects") * 1.5 +
    b(bldg, "entertainmentMegaPlexes") * 1.5 +
    b(bldg, "virtualRealityArcades") * 1 +
    b(bldg, "exoticFloraGardens") * 0.5 +
    b(bldg, "districtTemple") * 1 +
    b(bldg, "grandCathedral") * 3 +
    b(bldg, "sacredGroundPark") * 1.5 +
    b(bldg, "pilgrimageShrines") * 1 +
    b(bldg, "prophetsAcademy") * 1 +
    b(bldg, "holyRelicVault") * 1 +
    b(bldg, "martyrsMemorial") * 1.5 +
    b(bldg, "doomsdayBunkerShrine") * 1;

  const medicalUnitsBonus =
    u(unit, "emergencyMedicalTeams") * 0.05 +
    u(unit, "fieldHospitalUnits") * 0.1 +
    u(unit, "welfareOfficers") * 0.05 +
    u(unit, "civicMediators") * 0.05 +
    u(unit, "medicalAssistDroid") * 0.08 +
    u(unit, "fireSuppressionDroid") * 0.04;

  let happyDelta = 0;
  if (r.food > 100) happyDelta += 1;
  if (r.water > 100) happyDelta += 1;
  if (r.goods > 100) happyDelta += 1;
  if (cs.crime > 60) happyDelta -= 1;
  if (cs.unrest > 60) happyDelta -= 1;
  if (p.propaganda) happyDelta += 1;
  if (p.martialLaw) happyDelta -= 1;
  if (p.welfareRationing === "cut") happyDelta -= 1;
  if (p.welfareRationing === "generous") happyDelta += 1;
  if (r.power < 0) happyDelta -= 1;
  if (cs.biosphere > 60) happyDelta += 1;
  if (cs.biosphere < 20) happyDelta -= 1;
  if (cs.diseaseRisk > 70) happyDelta -= 1;
  if (cs.upliftPopulation > 500) happyDelta += 1;
  happyDelta += Math.floor(happinessBonus * 0.1);
  happyDelta += Math.floor(medicalUnitsBonus * 0.5);
  happyDelta += Math.floor(sk.leadership * 0.1 + att.charisma * 0.1 + sk.propaganda * 0.08);
  if (sk.medicine > 3) happyDelta += 1;
  happyDelta -= Math.round(docLaw * 0.5);
  happyDelta -= Math.round(docBrute * 1.5);
  happyDelta -= Math.round(docOrder * 0.5);
  happyDelta -= Math.round(docCentral * 0.5);
  if (miningPolicies.has("overtime_mandate")) happyDelta -= 1;
  if (miningPolicies.has("hazard_pay")) happyDelta += 1;
  happyDelta += techHappyMod;

  cs.happiness = clampStat(cs.happiness + happyDelta);
  entries.push({
    label: "Morale",
    delta: happyDelta,
    unit: "pts",
    reason: happyDelta >= 0 ? "Adequate supplies, welfare & entertainment" : "Oppression and shortages demoralizing citizens",
    severity: happyDelta >= 0 ? "positive" : "negative",
  });

  // ─── EDUCATION ───────────────────────────────────────────────────────
  const eduBase =
    b(bldg, "civicEducationInstitutes") * 2 +
    b(bldg, "advancedResearchLabs") * 0.5 +
    b(bldg, "quantumDataCenters") * 0.5 +
    b(bldg, "prophetsAcademy") * 1 +
    b(bldg, "archiveRecoveryLabs") * 1 +
    b(bldg, "predictiveAnalyticsSupercomputers") * 0.5;

  let eduDelta = 0;
  if (eduBase > 20) eduDelta += 1;
  else if (eduBase > 10) eduDelta += 1;
  else if (eduBase < 3) eduDelta -= 1;
  if (cs.corruption > 60) eduDelta -= 1;
  if (r.credits < 0) eduDelta -= 1;
  if (cs.employment > 70 && s.totalTicks % 2 === 0) eduDelta += 1;
  if (cs.biosphere > 50 && s.totalTicks % 2 === 0) eduDelta += 1;
  if (cs.upliftPopulation > 1000) eduDelta += 1;

  cs.education = clampStat(cs.education + eduDelta);
  entries.push({
    label: "Education",
    delta: eduDelta,
    unit: "pts",
    reason: eduDelta >= 0 ? "Schools and research institutions training citizens" : "Underfunded education system declining",
    severity: eduDelta >= 0 ? "positive" : "negative",
  });

  // ─── PUBLIC HEALTH ──────────────────────────────────────────────────
  const healthBase =
    b(bldg, "publicHealthMegaClinics") * 3 +
    b(bldg, "medicalResearchComplexes") * 1.5 +
    b(bldg, "welfareDistributionCenters") * 1 +
    u(unit, "emergencyMedicalTeams") * 0.3 +
    u(unit, "fieldHospitalUnits") * 0.5 +
    u(unit, "medicalAssistDroid") * 0.2;

  let healthDelta = 0;
  const cohortHealthDemand = computePopulationCohorts(s).healthServiceDemand;
  if (cohortHealthDemand > cs.population * COHORT_HEALTH_LOAD_RATIO) healthDelta -= 1;
  if (healthBase > 20) healthDelta += 1;
  else if (healthBase > 10) healthDelta += 1;
  else if (healthBase < 3) healthDelta -= 1;
  if (r.medSupplies > 100) healthDelta += 1;
  if (r.medSupplies <= 0) healthDelta -= 1;
  if (r.food <= 0) healthDelta -= 1;
  if (r.water <= 0) healthDelta -= 1;
  if (s.utilities && s.utilities.sanitationLevel < 30) healthDelta -= 1;
  if (cs.diseaseRisk > 60) healthDelta -= 1;
  else if (cs.diseaseRisk > 40 && s.totalTicks % 2 === 0) healthDelta -= 1;
  if (cs.biosphere > 60 && s.totalTicks % 2 === 0) healthDelta += 1;
  // Medical software upgrades (diagnostics AI, pandemic early warning, etc.)
  // contribute a steady per-tick pull, same divisor model as tech stat mods.
  healthDelta += swHealthMod;
  healthDelta -= densityPressure.publicHealthDrainPerTick;

  cs.publicHealth = clampStat(cs.publicHealth + healthDelta);
  entries.push({
    label: "Public Health",
    delta: healthDelta,
    unit: "pts",
    reason:
      healthDelta >= 0
        ? "Clinics and medical teams maintaining health standards"
        : densityPressure.active || cohortHealthDemand > cs.population * COHORT_HEALTH_LOAD_RATIO
          ? "Crowding and cohort care load straining public health"
          : "Medical infrastructure failing — disease risk rising",
    severity: healthDelta >= 0 ? "positive" : "negative",
  });

  // ─── BIOSPHERE (Wildlands stewardship) ────────────────────────────────
  // Wildlands stewardship buildings push biosphere up; extractive ones pull it down.
  let biosphereDelta = 0;
  const stewardScore =
    b(bldg, "wildlandsBioreserves") * 3 +
    b(bldg, "wildlandsRangerStations") * 2 +
    b(bldg, "hydroponicDomes") * 1 +
    b(bldg, "geneVaults") * 1;
  const extractScore =
    b(bldg, "apexHuntersLodges") * 1 +
    b(bldg, "feralLivestockPens") * 1 +
    b(bldg, "bushTanneries") * 1;
  const netSteward = stewardScore - extractScore;
  if (netSteward !== 0 && s.totalTicks % 2 === 0) {
    biosphereDelta = clamp(Math.round(netSteward / 4), -2, 3);
  }
  if (biosphereDelta !== 0) {
    cs.biosphere = clampStat(cs.biosphere + biosphereDelta);
    entries.push({
      label: "Biosphere",
      delta: biosphereDelta,
      unit: "pts",
      reason: biosphereDelta > 0 ? "Wildlands stewardship is restoring the ecology" : "Wildlands extraction is depleting the biosphere",
      severity: biosphereDelta > 0 ? "positive" : "negative",
    });
  }

  // ─── LAW & ORDER ──────────────────────────────────────────────────────
  let lawDelta = 0;
  if (lawStrength > 200) lawDelta += 1;
  else if (lawStrength > 80) lawDelta += 1;
  if (p.martialLaw) lawDelta += 2;
  if (p.curfewEnabled) lawDelta += 1;
  if (cs.crime > 60) lawDelta -= 1;
  if (cs.corruption > 50) lawDelta -= 1;
  if (p.corruptionInvestigation) lawDelta += 1;
  if (b(bldg, "sectorHouseHQ") > 0) lawDelta += 1;
  if (b(bldg, "centralCityCommandNexus") > 0) lawDelta += 1;
  lawDelta += Math.min(b(bldg, "inquisitionHQ"), 3);
  lawDelta += Math.min(b(bldg, "divineBroadcastTower"), 2);
  lawDelta += Math.min(b(bldg, "confessionalBureau"), 2);
  lawDelta += Math.round(docLaw * 1.5);
  lawDelta += Math.round(docOrder * 1);
  lawDelta += Math.round(docCentral * 0.5);
  lawDelta += techLawMod;

  cs.lawOrder = clampStat(cs.lawOrder + lawDelta);
  entries.push({
    label: "Law & Order",
    delta: lawDelta,
    unit: "pts",
    reason: lawDelta >= 0 ? "Security presence effective" : "Corruption eroding authority",
    severity: lawDelta >= 0 ? "positive" : "negative",
  });

  // ─── CORRUPTION ───────────────────────────────────────────────────────
  const counterCorruptStrength =
    u(unit, "internalAffairsAgents") * 0.3 +
    u(unit, "counterCorruptionUnits") * 0.5 +
    u(unit, "deepSurveillanceAnalysts") * 0.3;

  let corruptDelta = 0;
  if (cs.crime > 50) corruptDelta += 1;
  if (p.corruptionInvestigation) corruptDelta -= 2;
  if (cs.lawOrder < 30) corruptDelta += 2;
  if (b(bldg, "citywideSurveillanceGrid") > 0) corruptDelta -= 1;
  if (b(bldg, "aiCrimePredictionCenters") > 0) corruptDelta -= 1;
  corruptDelta += Math.min(b(bldg, "templeOfCommerce"), 3);
  corruptDelta += Math.min(b(bldg, "oracleChambers"), 2);
  corruptDelta -= Math.floor(counterCorruptStrength * 0.1);
  if (operationalCompanyCount > 5) corruptDelta += 1;
  if (cs.employment < 50) corruptDelta += 1;
  if (miningPolicies.has("black_market_ore")) corruptDelta += 1;
  corruptDelta += Math.round(docBrute * 1.5);
  corruptDelta += Math.round(docCentral * 0.5);
  corruptDelta -= Math.round(docLaw * 1);
  if (miningPolicies.has("reclamation_tax")) corruptDelta += 1;
  corruptDelta += techCorruptMod;

  cs.corruption = clampStat(cs.corruption + corruptDelta);
  entries.push({
    label: "Corruption",
    delta: corruptDelta,
    unit: "pts",
    reason: corruptDelta <= 0 ? "Investigations and surveillance reducing graft" : "Criminal networks corrupting officials",
    severity: corruptDelta <= 0 ? "positive" : "negative",
  });

  // ─── COMPANY EFFECTS ON CITY STATS ───────────────────────────────────
  if (operationalCompanyCount > 0) {
    cs.happiness = clampStat(cs.happiness + Math.min(companyHappiness, 15));
    cs.crime = clampStat(cs.crime + companyCrimeModifier);
    cs.corruption = clampStat(cs.corruption + companyCorruption);
    applyInfraDelta(
      Math.min(companyStabilityBonus * 0.1, 2),
      `tick:${s.totalTicks}:companies:stability`,
      "Operational company stability",
    );
    // Employment boost from licensed companies
    const companyEmploymentPct = (companyEmployment / cs.population) * 100;
    cs.employment = clampStat(cs.employment + Math.min(companyEmploymentPct * 0.2, 5));
  }

  // ─── DEFENSE RATING ───────────────────────────────────────────────────
  const defenseBonus =
    b(bldg, "perimeterMegaWalls") * 3 +
    b(bldg, "defenseTurretTowers") * 2 +
    b(bldg, "automatedDroneDefenseGrid") * 2 +
    b(bldg, "missileDefenseSilos") * 4 +
    b(bldg, "rapidResponseBarracks") * 1 +
    b(bldg, "cityShieldGenerator") * 8 +
    b(bldg, "borderSecurityCheckpoints") * 1 +
    b(bldg, "strategicDefenseCommand") * 3 +
    b(bldg, "zealotBarracks") * 2 +
    b(bldg, "martyrsMemorial") * 1 +
    b(bldg, "doomsdayBunkerShrine") * 3;

  const militaryStrength =
    u(unit, "cityDefenseInfantry") * 0.1 +
    u(unit, "armoredResponseUnits") * 0.3 +
    u(unit, "heavyWeaponsSquads") * 0.4 +
    u(unit, "wallDefenseCrews") * 0.2 +
    u(unit, "judgeGunships") * 0.5 +
    u(unit, "tacticalDropShips") * 0.3 +
    u(unit, "combatAssaultDroid") * 0.5 +
    u(unit, "perimeterSentryDroid") * 0.3 +
    u(unit, "shieldBearerDroid") * 0.4;

  const hasNuclear = s.unlockedTechnologies.includes("mil_nuclear_weapons_program");
  const hasAntimatter = s.unlockedTechnologies.includes("mil_antimatter_warheads");
  const hasTacticalNukes = s.unlockedTechnologies.includes("tactical_nuclear_warheads");
  const nuclearDeterrent = (hasNuclear ? 5 : 0) + (hasAntimatter ? 8 : 0) + (hasTacticalNukes ? 3 : 0);
  const doctrineDef = Math.round(docOrder * 2);

  const activeOpsBonus = (s.activeWarOps ?? []).reduce((sum, w) => {
    const opDef = WAR_ROOM_OPS_MAP[w.opId];
    return sum + (opDef?.defenseBonus ?? 0);
  }, 0);

  // ─── NUCLEAR STOCKPILE ────────────────────────────────────────────────
  let stockpileDeterrence = 0;
  if (hasNuclear) {
    if (!s.nuclearStockpile) {
      s.nuclearStockpile = { warheads: 0, productionRate: 0, maintenanceCost: 0, deterrenceLevel: 0, lastProductionTick: s.totalTicks };
    }
    const nuke = s.nuclearStockpile;
    const siloCount = b(bldg, "missileDefenseSilos") + b(bldg, "interballisticMissileLaunchers");
    const labCount = b(bldg, "advancedResearchLabs") + b(bldg, "quantumDataCenters");
    const prodRate = (hasNuclear ? 0.1 : 0) + (hasTacticalNukes ? 0.05 : 0) + (hasAntimatter ? 0.08 : 0) + siloCount * 0.02 + labCount * 0.01;
    nuke.productionRate = Math.round(prodRate * 100) / 100;

    const maxWarheads = 10 + siloCount * 5 + (hasAntimatter ? 10 : 0);
    const ticksSinceLast = s.totalTicks - nuke.lastProductionTick;
    const accumulated = prodRate * ticksSinceLast;
    if (accumulated >= 1 && nuke.warheads < maxWarheads) {
      const produced = Math.min(Math.floor(accumulated), maxWarheads - nuke.warheads);
      if (produced > 0) {
        nuke.warheads += produced;
        nuke.lastProductionTick = s.totalTicks;
        entries.push({ label: "Nuclear Production", delta: produced, unit: "warheads", reason: "Weapons program output", severity: "neutral" });
      }
    }

    nuke.maintenanceCost = nuke.warheads * 200;
    r.credits -= nuke.maintenanceCost;
    // Task #473: this charge previously drained credits with no tick entry.
    if (nuke.maintenanceCost > 0) {
      entries.push({ label: "Nuclear Maintenance", delta: -nuke.maintenanceCost, unit: "credits", reason: `${nuke.warheads} warheads stockpiled`, severity: "negative" });
    }
    if (nuke.warheads > 0) {
      r.fuel = Math.max(0, (r.fuel ?? 0) - Math.ceil(nuke.warheads * 0.5));
    }

    stockpileDeterrence = Math.min(15, Math.floor(nuke.warheads * 0.8));
    nuke.deterrenceLevel = Math.min(100, nuclearDeterrent * 3 + stockpileDeterrence * 4);

    if (nuke.warheads > 5) {
      cs.unrest = clampStat(cs.unrest + 1);
    }

    if (s.externalMegacities && nuke.deterrenceLevel > 30 && s.totalTicks % 24 === 0) {
      const threatReduction = Math.min(2, Math.floor(nuke.deterrenceLevel / 40));
      s.externalMegacities = s.externalMegacities.map((m) => ({
        ...m,
        threat: Math.max(10, Math.min(100, m.threat - threatReduction)),
      }));
    }
  }

  cs.defenseRating = clampStat(
    Math.round(defenseBonus + Math.floor(militaryStrength * 0.1) + Math.floor(sk.tactics * 0.5 + att.combat * 0.3 + (augFx.combat ?? 0) * 0.2) + nuclearDeterrent + doctrineDef + activeOpsBonus + stockpileDeterrence + (s.warOpDefenseBonus ?? 0) + techDefenseMod + (s.militaryOverhaul?.logistics?.installationDefenseBonus ?? 0) + rail.armedSecurityBenefit)
  );

  // ─── INFRASTRUCTURE HEALTH ────────────────────────────────────────────
  const repairStrength =
    u(unit, "infrastructureRepairTeams") * 0.2 +
    u(unit, "utilityMaintenanceSquads") * 0.15 +
    u(unit, "emergencyRepairUnits") * 0.3 +
    u(unit, "utilityRepairDroid") * 0.25 +
    u(unit, "surveyScannerDroid") * 0.1 +
    u(unit, "heavyLifterDroid") * 0.3 +
    u(unit, "weldingFabricatorDroid") * 0.25 +
    u(unit, "excavatorDroid") * 0.2 +
    u(unit, "structuralScannerDroid") * 0.15 +
    u(unit, "pipeLayerDroid") * 0.2;

  let infraDelta = 0;
  if (r.credits > 10000) infraDelta += 1;
  if (cs.unrest > 70) infraDelta -= 2;
  if (r.steel > 100) infraDelta += 1;
  if (r.power < 0) infraDelta -= 1;
  infraDelta += Math.min(Math.floor(repairStrength * 0.1), 5);
  infraDelta += techInfraMod;

  applyInfraDelta(
    infraDelta,
    `tick:${s.totalTicks}:recurring:infrastructure`,
    infraDelta >= 0 ? "Recurring maintenance and repair sources" : "Recurring neglect and unrest degradation",
  );
  if (infraDelta !== 0) {
    entries.push({
      label: "Infrastructure",
      delta: infraDelta,
      unit: "pts",
      reason: infraDelta >= 0 ? "Maintenance and repair teams active" : "Neglect and unrest causing damage",
      severity: infraDelta >= 0 ? "positive" : "negative",
    });
  }

  // ─── RESEARCH ─────────────────────────────────────────────────────────
  let researchGain = 0;
  let researchTotalPercent = 0;
  safeSub("Mega Projects (Research)", entries, () => {
    const researchBreakdown = getResearchBreakdown(s, techEffects);
    researchGain = researchBreakdown.gain;
    researchTotalPercent = researchBreakdown.totalPercent;
  });

  cs.researchProgress += researchGain;
  if (researchGain > 0) {
    entries.push({
      label: "Research",
      delta: researchGain,
      unit: "pts",
      reason: `Research division output${researchTotalPercent !== 0 ? ` (${researchTotalPercent >= 0 ? "+" : ""}${researchTotalPercent.toFixed(1)}% modifiers)` : ""}`,
      severity: "neutral",
    });
  }

  if (s.activeResearch && researchGain > 0) {
    s.activeResearch.progress += researchGain;
    if (s.activeResearch.progress >= s.activeResearch.cost) {
      const completedTech = TECH_MAP[s.activeResearch.techId];
      const techId = s.activeResearch.techId;
      s.activeResearch = null;
      if (!s.unlockedTechnologies.includes(techId)) {
        // s.unlockedTechnologies is already a per-tick clone (see top
        // of runTick), so direct push is safe. The tech-effects cache
        // is keyed by tech-id hash and must be invalidated so the next
        // buildTechEffectsCache() call recomputes with the new tech.
        s.unlockedTechnologies.push(techId);
        invalidateTechCache();
      }
      if (completedTech) {
        const fx = completedTech.effects;
        if (fx.crime) cs.crime = clampStat(cs.crime + fx.crime);
        if (fx.unrest) cs.unrest = clampStat(cs.unrest + fx.unrest);
        if (fx.happiness) cs.happiness = clampStat(cs.happiness + fx.happiness);
        if (fx.lawOrder) cs.lawOrder = clampStat(cs.lawOrder + fx.lawOrder);
        if (fx.corruption) cs.corruption = clampStat(cs.corruption + fx.corruption);
        if (fx.infrastructureHealth) {
          applyInfraDelta(
            fx.infrastructureHealth,
            `tick:${s.totalTicks}:research:${techId}:infrastructure`,
            `Research completion "${completedTech.name}"`,
          );
        }
        if (fx.defenseRating) cs.defenseRating = clampStat(cs.defenseRating + fx.defenseRating);
        if (fx.employment) cs.employment = clampStat(cs.employment + fx.employment);
        // One-time permanent bump by design (research completion), but clamp
        // at the mutation site so no data outlier can ratchet the persistent
        // base rate past the sanitizer's cap between saves.
        if (fx.populationGrowthRate) {
          cs.populationGrowthRate = Math.min(
            MAX_BASE_POP_GROWTH_RATE,
            Math.max(-MAX_BASE_POP_GROWTH_RATE, cs.populationGrowthRate + fx.populationGrowthRate),
          );
        }
        entries.push({
          label: "Tech Unlocked",
          delta: 1,
          unit: "",
          reason: `${completedTech.name} — research complete`,
          severity: "positive",
        });
      }

      if (!s.researchQueue) s.researchQueue = [];
      let started = false;
      while (s.researchQueue.length > 0 && !started) {
        const nextId = s.researchQueue.shift()!;
        const nextTech = TECH_MAP[nextId];
        if (nextTech && !s.unlockedTechnologies.includes(nextId) && canResearch(nextId, s.unlockedTechnologies, s.addons).available) {
          s.activeResearch = { techId: nextId, progress: 0, cost: nextTech.researchCost * RESEARCH_COST_MULTIPLIER };
          started = true;
          entries.push({ label: "Queue", delta: 0, unit: "", reason: `Auto-started: ${nextTech.name}`, severity: "neutral" });
        }
      }

      if (!started && s.autoResearch) {
          const available = getVisibleTechnologies(s.addons, s.unlockedTechnologies).filter(
           (t) => !s.unlockedTechnologies.includes(t.id) && canResearch(t.id, s.unlockedTechnologies, s.addons).available
        );
        if (available.length > 0) {
          available.sort((a, b) => a.researchCost - b.researchCost);
          const pick = available[0];
          s.activeResearch = { techId: pick.id, progress: 0, cost: pick.researchCost * RESEARCH_COST_MULTIPLIER };
          entries.push({ label: "Auto-Research", delta: 0, unit: "", reason: `Auto-started: ${pick.name}`, severity: "neutral" });
        }
      }
    }
  }

  if (!s.activeResearch && researchGain > 0) {
    if (!s.researchQueue) s.researchQueue = [];
    let started = false;
    while (s.researchQueue.length > 0 && !started) {
      const nextId = s.researchQueue.shift()!;
      const nextTech = TECH_MAP[nextId];
      if (nextTech && !s.unlockedTechnologies.includes(nextId) && canResearch(nextId, s.unlockedTechnologies, s.addons).available) {
        s.activeResearch = { techId: nextId, progress: 0, cost: nextTech.researchCost * RESEARCH_COST_MULTIPLIER };
        started = true;
        entries.push({ label: "Queue", delta: 0, unit: "", reason: `Auto-started: ${nextTech.name}`, severity: "neutral" });
      }
    }
    if (!started && s.autoResearch) {
        const available = getVisibleTechnologies(s.addons, s.unlockedTechnologies).filter(
         (t) => !s.unlockedTechnologies.includes(t.id) && canResearch(t.id, s.unlockedTechnologies, s.addons).available
      );
      if (available.length > 0) {
        available.sort((a, b) => a.researchCost - b.researchCost);
        const pick = available[0];
        s.activeResearch = { techId: pick.id, progress: 0, cost: pick.researchCost * RESEARCH_COST_MULTIPLIER };
        entries.push({ label: "Auto-Research", delta: 0, unit: "", reason: `Auto-started: ${pick.name}`, severity: "neutral" });
      }
    }
  }

  // ─── EMPLOYMENT ───────────────────────────────────────────────────────
  const jobSlots =
    b(bldg, "megaManufacturingPlants") * 500 +
    b(bldg, "metalFoundryComplexes") * 300 +
    b(bldg, "roboticsFabricationFacilities") * 200 +
    b(bldg, "automatedAssemblyLines") * 400 +
    b(bldg, "syntheticFoodPlants") * 150 +
    b(bldg, "advancedResearchLabs") * 100 +
    b(bldg, "publicHealthMegaClinics") * 120 +
    b(bldg, "bureaucraticAdminCenters") * 80 +
    b(bldg, "skyrailTransitLines") * 60 +
    b(bldg, "undergroundMaglevSystem") * 80 +
    b(bldg, "monasteryComplex") * 80 +
    b(bldg, "prophetsAcademy") * 120 +
    b(bldg, "grandCathedral") * 60 +
    b(bldg, "districtTemple") * 30;

  const cohortCapacity = computePopulationCohorts(s).workforceCapacity;
  const targetEmployment = Math.min(
    100,
    Math.floor((jobSlots / Math.max(1, cohortCapacity)) * 100) + 30
  );
  cs.employment = clampStat(
    cs.employment + (targetEmployment > cs.employment ? 1 : -1) + techEmploymentMod
  );

  // ─── VEHICLE READINESS ────────────────────────────────────────────────
  // Task #381: fleet readiness is now owned by processMilitaryLogistics, which
  // sets unit.vehicleReadiness from real crew coverage + serviceability + fuel
  // (a single source of truth). The old fuel>20 && ammo>50 heuristic is gone.

  // ─── AMMO DRAIN ───────────────────────────────────────────────────────
  const totalCombatUnits =
    u(unit, "patrolJudges") +
    u(unit, "streetPatrolUnits") +
    u(unit, "seniorJudges") +
    u(unit, "eliteJudgeStrikeTeams") +
    u(unit, "cityDefenseInfantry");

  const ammoDrain = Math.floor(totalCombatUnits * 0.15);
  r.ammo = Math.max(0, r.ammo - ammoDrain);

  // ─── HOUSING PRESSURE ─────────────────────────────────────────────────
  // Capacity = the city's residential districts (housing + slums — a stable
  // base that does NOT scale with population) plus every residential building
  // the player has constructed. Pressure is the share of the population left
  // without shelter, so building housing measurably lowers it. Previously this
  // ignored district capacity entirely, so pressure pinned near 100 and almost
  // everyone read as homeless no matter how much housing was built.
  const housingCapacity = computeHousingCapacity(bldg);

  const cohortHousingDemand = computePopulationCohorts(s).housingDemand;
  const pressureTarget =
    cs.population > 0
      ? clampStat(
          Math.round(
            (Math.max(0, cohortHousingDemand - housingCapacity) / Math.max(1, cohortHousingDemand)) * 100,
          ),
        )
      : 0;
  cs.housingPressure = clampStat(
    cs.housingPressure + (pressureTarget > cs.housingPressure ? 1 : -1)
  );

  // ─── DISTRICT UPDATES ─────────────────────────────────────────────────
  safeSub("District Updates", entries, () => {
  const gangTypeWeights: Record<string, number> = {
    street: 1.0, cyberCult: 0.8, mercenary: 1.5, organizedCrime: 1.3, specialistCrew: 1.1,
  };
  const gangsByTerritory: Record<string, { threat: number; weighted: number }> = {};
  const anyGangs = ANY_TERRITORY_GANGS;
  const anyThreat = anyGangs.reduce((s, g) => s + g.threatLevel, 0);
  const anyWeighted = anyGangs.reduce((s, g) => s + g.threatLevel * (gangTypeWeights[g.type] ?? 1), 0);
  for (const g of GANGS) {
    if (g.territoryPreference === "any") continue;
    const t = g.territoryPreference;
    if (!gangsByTerritory[t]) gangsByTerritory[t] = { threat: anyThreat, weighted: anyWeighted };
    gangsByTerritory[t].threat += g.threatLevel;
    gangsByTerritory[t].weighted += g.threatLevel * (gangTypeWeights[g.type] ?? 1);
  }

  const districtRepairRate =
    repairStrength > 0
      ? Math.min(
          0.5 + repairStrength * 0.02 +
          u(unit, "constructionCrews") * 0.05 +
          u(unit, "heavyLifterDroid") * 0.08 +
          u(unit, "weldingFabricatorDroid") * 0.06,
          3
        )
      : 0;

  let districtsRepaired = 0;
  let totalInfraRecovered = 0;

  for (let _di = 0; _di < s.districts.length; _di++) {
    const d = s.districts[_di];
    let crimeDlt = 0;
    let unrestDlt = 0;
    let gangDlt = 0;
    let infraDlt = 0;

    const w = d.wealth;
    const pop = d.population;
    const nameLC = d.name.toLowerCase();
    const isDocks = nameLC.includes("dock") || nameLC.includes("port") || nameLC.includes("harbor") || nameLC.includes("wharf");
    const territory = isDocks ? "docks"
      : w < 25 ? "slums"
      : d.industrialOutput > 50 ? "industrial"
      : w > 60 ? "commercial"
      : pop > 5000 ? "residential"
      : "undercity";
    const cached = gangsByTerritory[territory] ?? { threat: anyThreat, weighted: anyWeighted };
    const gangThreatPressure = cached.threat;
    const weightedThreat = cached.weighted;

    if (d.gangInfluence > 50) crimeDlt += 1;
    if (d.gangInfluence > 30 && gangThreatPressure > 20) crimeDlt += 1;
    if (weightedThreat > 30) crimeDlt += 1;
    if (gangThreatPressure > 40) gangDlt += 1;
    if (cs.crime > 60) unrestDlt += 1;
    if (d.infraQuality < 40) unrestDlt += 1;
    if (p.gangsPatrolled) gangDlt -= 1;
    if (p.martialLaw) crimeDlt -= 2;
    if (u(unit, "antiGangTaskForces") > 10) gangDlt -= 1;
    if (b(bldg, "sectorHouseHQ") > 0) crimeDlt -= 1;
    if (b(bldg, "antiGangEnforcementCenters") > 0) gangDlt -= 1;

    if (d.infraQuality < 100 && districtRepairRate > 0) {
      const severity = 100 - d.infraQuality;
      let rate = districtRepairRate;
      if (severity > 60) rate *= 0.6;
      else if (severity > 30) rate *= 0.8;
      if (d.unrest > 70) rate *= 0.5;
      if (r.steel < 50) rate *= 0.5;
      if (r.credits < 5000) rate *= 0.7;
      infraDlt = Math.min(rate, severity);
      if (infraDlt > 0) {
        districtsRepaired++;
        totalInfraRecovered += infraDlt;
      }
    }

    if (d.infraQuality >= 100 && d.unrest > 50) {
      infraDlt = -0.5;
    }

    // Named-character trait nudges (task #52): NPCs anchored to this
    // district scale the *positive* (worsening) deltas in their thematic
    // direction. Negative deltas pass through unchanged so a single
    // trait can never flip a stat from improving to worsening.
    if (crimeDlt > 0 || unrestDlt > 0 || gangDlt > 0) {
      const tm = computeDistrictTraitMultipliers(s, d.id);
      crimeDlt = applyTraitMultiplierToDelta(crimeDlt, tm.crimeMult);
      unrestDlt = applyTraitMultiplierToDelta(unrestDlt, tm.unrestMult);
      gangDlt = applyTraitMultiplierToDelta(gangDlt, tm.gangInfluenceMult);
    }

    if (crimeDlt !== 0 || unrestDlt !== 0 || gangDlt !== 0 || infraDlt !== 0) {
      const cd = ensureDistrictClone(_di);
      cd.crime = clampStat(cd.crime + crimeDlt);
      cd.unrest = clampStat(cd.unrest + unrestDlt);
      cd.gangInfluence = clampStat(cd.gangInfluence + gangDlt);
      cd.infraQuality = clampStat(Math.round((cd.infraQuality + infraDlt) * 10) / 10);
    }
  }

  if (districtsRepaired > 0) {
    entries.push({
      label: "District Repairs",
      delta: Math.round(totalInfraRecovered * 10) / 10,
      unit: "infra pts",
      reason: `Repair crews restored infrastructure across ${districtsRepaired} district${districtsRepaired > 1 ? "s" : ""}`,
      severity: "positive",
    });
  }
  });

  // ─── FACTION UPDATES ──────────────────────────────────────────────────
  safeSub("Faction Updates", entries, () => {
  s.factions = s.factions.map((f) => {
    let loyaltyDlt = 0;
    let threatDlt = 0;

    if (f.type === "law") {
      loyaltyDlt = cs.lawOrder > 50 ? 1 : -1;
    } else if (f.type === "criminal") {
      loyaltyDlt = cs.crime > 50 ? 1 : -1;
      threatDlt = cs.crime > 60 ? 1 : -1;
    } else if (f.type === "corporate") {
      loyaltyDlt = r.credits > 30000 ? 1 : -1;
    } else if (f.type === "underclass") {
      loyaltyDlt = cs.happiness < 40 ? -1 : 0;
      threatDlt = cs.unrest > 60 ? 2 : -1;
    } else if (f.type === "institutional") {
      // The Bloc rewards a legible, orderly city and becomes more
      // confrontational when corruption makes its institutions unreliable.
      loyaltyDlt = cs.lawOrder > 50 && cs.corruption < 50 ? 1 : -1;
      threatDlt = cs.corruption > 60 ? 1 : -1;
    }

    // Named-character trait nudges (task #52): NPCs anchored to this
    // faction reinforce upward loyalty trends. Only positive deltas
    // are scaled so a single loyal lieutenant can't single-handedly
    // hold a faction together against contrary city conditions.
    // Task #55 extends this to faction *threat*: aggressive/ruthless
    // figureheads escalate threat climbs; reformist/compassionate
    // ones dampen them. Same one-sided semantics: improvements pass
    // through unchanged so a single trait can never flip the sign.
    if (loyaltyDlt > 0 || threatDlt > 0) {
      const fm = computeFactionTraitMultipliers(s, f.id);
      if (loyaltyDlt > 0) {
        loyaltyDlt = applyTraitMultiplierToDelta(loyaltyDlt, fm.loyaltyMult);
      }
      if (threatDlt > 0) {
        threatDlt = applyTraitMultiplierToDelta(threatDlt, fm.threatMult);
      }
    }

    return {
      ...f,
      loyalty: clampStat(f.loyalty + loyaltyDlt),
      threat: clampStat(f.threat + threatDlt),
    };
  });
  });

  // ─── CONTRACT PROCESSING ──────────────────────────────────────────────
  // Task #169: wrapped in safeSub so a malformed contract template,
  // missing definition, or NaN math can't kill the rest of the tick.
  safeSub("Contracts", entries, () => {
  const completedThisTick: ContractInstance[] = [];
  const expiredThisTick: ContractInstance[] = [];
  const pp = s.procurementPolicies ?? {};
  // Task #55: aggregate trait-driven city-wide multipliers once per tick
  // so corrupt/greedy/cunning power-brokers slow contract delivery and
  // ethical/industrious figures speed it up.
  const cityTraitMult = computeCityTraitMultipliers(s);

  if (s.activeContracts.length > 0) ensureContractsClone();
  let contractFeesTotal = 0;
  for (const contract of s.activeContracts) {
    if (contract.status !== "active") continue;

    const def = CONTRACT_TEMPLATES_MAP[contract.defId];
    if (!def) continue;
    const contractor = CONTRACTORS_MAP[contract.contractorId];

    if (def.recurringCostPerTick > 0) {
      const costMod = pp.lowestBidPriority ? 0.85 : 1;
      const fee = Math.floor(def.recurringCostPerTick * costMod * (contractor?.costMultiplier ?? 1));
      r.credits -= fee;
      contract.totalPaid += fee;
      contractFeesTotal += fee;
    }

    let canProgress = true;
    if (def.materialPerTick) {
      for (const [mat, amount] of Object.entries(def.materialPerTick)) {
        if (amount && isResourceKey(mat) && r[mat] < amount) {
          canProgress = false;
          break;
        }
      }
      if (canProgress) {
        for (const [mat, amount] of Object.entries(def.materialPerTick)) {
          if (amount && isResourceKey(mat)) {
            r[mat] = Math.max(0, r[mat] - amount);
          }
        }
      }
    }

    if (canProgress) {
      let speedMod = (contractor?.speed ?? 1);
      if (pp.qualityFirstProcurement) speedMod *= 0.9;
      if (pp.emergencyFastTrack && def.category === "emergency") speedMod *= 1.3;
      const droidConstructionBoost = 1 +
        u(unit, "heavyLifterDroid") * 0.02 +
        u(unit, "weldingFabricatorDroid") * 0.02 +
        u(unit, "excavatorDroid") * 0.015 +
        u(unit, "pipeLayerDroid") * 0.015;
      speedMod *= Math.min(droidConstructionBoost, 1.5);
      const effectiveProgress = def.progressPerTick * speedMod;

      let delayChance = (def.delayRisk / 100) +
        (pp.antiCorruptionOversight ? -0.05 : 0) +
        (pp.lowestBidPriority ? 0.05 : 0);
      // Task #55: NPC traits scale the *positive* portion of the delay
      // chance through the same applyTraitMultiplierToDelta helper used
      // for district/faction deltas, so a single trait can never flip a
      // contract from on-time to delayed (or vice versa) on its own.
      if (delayChance > 0) {
        delayChance = applyTraitMultiplierToDelta(delayChance, cityTraitMult.contractDelayMult);
      }
      if (Math.random() < delayChance) {
        contract.delaysOccurred++;
        contract.events.push(`Tick ${s.totalTicks}: Delay — progress halved`);
        contract.progress += effectiveProgress * 0.5;
      } else {
        contract.progress += effectiveProgress;
      }

      const corruptChance = ((def.corruptionRisk + (contractor?.corruptionRisk ?? 0)) / 200) *
        (pp.antiCorruptionOversight ? 0.6 : 1) *
        (pp.securityScreening ? 0.8 : 1);
      if (Math.random() < corruptChance * 0.15) {
        const overrun = Math.floor(def.totalCost * 0.1);
        r.credits -= overrun;
        contract.overrunCost += overrun;
        cs.corruption = clampStat(cs.corruption + 1);
        contract.events.push(`Tick ${s.totalTicks}: Cost overrun +${overrun} cr`);
        entries.push({
          label: "Contract Overrun",
          delta: -overrun,
          unit: "credits",
          reason: `${def.name} — cost overrun`,
          severity: "warning",
        });
      }
      // Task #581: work resumed — arm the stall warning for a future episode.
      if (contract.stallWarned) contract.stallWarned = false;
    } else {
      contract.events.push(`Tick ${s.totalTicks}: Stalled — insufficient materials`);
      // Task #581: a stalled contract used to sit silent forever while the
      // retainer kept billing. Warn once per stall episode, name exactly
      // what's missing, and point at the auto-scrap deadline.
      if (!contract.stallWarned) {
        contract.stallWarned = true;
        const missing: string[] = [];
        for (const [mat, amount] of Object.entries(def.materialPerTick ?? {})) {
          if (amount && isResourceKey(mat) && r[mat] < amount) missing.push(`${amount} ${mat}/tick`);
        }
        const ticksToScrap = Math.max(1, def.durationTicks * CONTRACT_EXPIRY_MULTIPLIER - contract.ticksElapsed);
        prependMessage({
          id: `contract-stalled-${contract.id}-${s.totalTicks}`,
          timestamp: s.gameDate,
          tick: s.totalTicks,
          category: "alert",
          title: `PROCUREMENT STALLED — ${def.name.toUpperCase()}`,
          body: `Work on "${def.name}" has stopped: crews are idle awaiting ${missing.join(" and ") || "materials"}. Retainer fees continue while the award stands. Restock the materials or cancel the award — otherwise the contract is scrapped in ${ticksToScrap} ticks with nothing delivered.`,
          read: false,
          priority: "high",
        });
      }
    }

    contract.ticksElapsed++;

    if (def.temporaryEffects) {
      for (const [key, val] of Object.entries(def.temporaryEffects)) {
        if (val && isCityStatKey(key)) {
          cs[key] = clampStat((cs[key] ?? 0) + val * 0.3);
        }
      }
    }

    if (contract.progress >= 100) {
      contract.progress = 100;
      contract.status = "completed";
      completedThisTick.push(contract);
    } else if (contract.ticksElapsed >= def.durationTicks * CONTRACT_EXPIRY_MULTIPLIER) {
      // Task #581: blow 3× the quoted schedule (in practice only material-
      // stalled contracts get here) and the award is scrapped instead of
      // squatting in the queue charging fees forever.
      contract.status = "expired";
      contract.events.push(`Tick ${s.totalTicks}: Contract expired — scrapped at ${Math.floor(contract.progress)}% complete, nothing delivered`);
      expiredThisTick.push(contract);
    }
  }

  // Task #473: recurring contractor fees previously drained credits with no
  // tick entry — invisible to the player and to the tick-delta invariant.
  if (contractFeesTotal > 0) {
    entries.push({ label: "Contract Fees", delta: -contractFeesTotal, unit: "credits", reason: "Recurring contractor service fees", severity: "negative" });
  }

  for (const completed of completedThisTick) {
    const def = CONTRACT_TEMPLATES_MAP[completed.defId];
    if (!def) continue;
    const actualResourceDelivery: string[] = [];

    if (def.completionEffects.buildings) {
      // s.buildings is already a per-tick clone (see top of runTick),
      // so direct mutation is safe. Local `bldg` alias captured earlier
      // points at the same object — both views stay consistent.
      for (const [bKey, bVal] of Object.entries(def.completionEffects.buildings)) {
        s.buildings[bKey] = (s.buildings[bKey] ?? 0) + bVal;
      }
      // Buildings just changed — invalidate the tech-effects cache so
      // the gate-buildings hash recomputes on the next call.
      invalidateTechCache();
    }
    if (def.completionEffects.units) {
      for (const [uKey, uVal] of Object.entries(def.completionEffects.units)) {
        s.units[uKey] = (s.units[uKey] ?? 0) + uVal;
      }
      invalidateUnitsCache();
    }
    if (def.completionEffects.cityStats) {
      for (const [sKey, sVal] of Object.entries(def.completionEffects.cityStats)) {
        if (typeof sVal === "number" && isCityStatKey(sKey)) {
          cs[sKey] = clampStat((cs[sKey] ?? 0) + sVal);
        }
      }
    }
    if (def.completionEffects.resources) {
      for (const [rKey, rVal] of Object.entries(def.completionEffects.resources)) {
        if (typeof rVal === "number" && isResourceKey(rKey)) {
          const delivery = applyResourceDelta(s, rKey, rVal);
          actualResourceDelivery.push(
            delivery.rejected > 0
              ? `+${delivery.applied} ${rKey} (${delivery.rejected} rejected: storage full)`
              : `+${delivery.applied} ${rKey}`,
          );
        }
      }
    }
    if (def.completionEffects.stockpiles) {
      for (const [sKey, sVal] of Object.entries(def.completionEffects.stockpiles)) {
        if (typeof sVal === "number") {
          s.stockpiles[sKey] = (s.stockpiles[sKey] ?? 0) + sVal;
        }
      }
    }

    const qualityMod = (def.quality / 100);
    entries.push({
      label: "Contract Complete",
      delta: 0,
      unit: "",
      reason: `${def.name} finished (quality ${Math.floor(qualityMod * 100)}%)`,
      severity: "positive",
    });

    // Task #581: deliveries used to land silently (a transient tick entry
    // only). Confirm in the inbox and on the TV ticker what actually arrived.
    // Resource grants may be partially or wholly rejected by material storage.
    // The delivery record must report the amount that actually arrived rather
    // than the authored reward, while non-resource completion effects retain
    // their normal shared summary.
    let delivered = summarizeCompletionEffects(def) || "contracted works";
    for (const [rKey, rVal] of Object.entries(def.completionEffects.resources ?? {})) {
      if (typeof rVal === "number" && isResourceKey(rKey)) {
        const authored = `+${rVal} ${rKey}`;
        const actual = actualResourceDelivery.shift()!;
        delivered = delivered.includes(authored) ? delivered.replace(authored, actual) : `${delivered}, ${actual}`;
      }
    }
    const contractor2 = CONTRACTORS_MAP[completed.contractorId];
    prependMessage({
      id: `contract-delivered-${completed.id}-${s.totalTicks}`,
      timestamp: s.gameDate,
      tick: s.totalTicks,
      category: "report",
      title: `CONTRACT DELIVERED — ${def.name.toUpperCase()}`,
      body: `"${def.name}" closed out after ${completed.ticksElapsed} ticks. Delivered: ${delivered}.${contractor2?.onCompleted ? `\n\n${contractor2.name}: "${contractor2.onCompleted}"` : ""}`,
      read: false,
      priority: "normal",
    });
    s.newsFeed = pushNewsItem(s.newsFeed, contractDeliveredNews(s, def.name, delivered, completed.id));
  }

  // Task #581: expired awards get the same loud treatment as deliveries —
  // inbox alert, ticker line, and a tick-report entry.
  for (const expired of expiredThisTick) {
    const def = CONTRACT_TEMPLATES_MAP[expired.defId];
    if (!def) continue;
    // Task #585: soften the write-off without refunding the retainer. The
    // recovery is based only on the original upfront deposit, scaled by the
    // unfinished share of the contract. Cap the applied amount here so the
    // end-of-tick resource ceiling cannot hide part of the credit mutation
    // from the ledger.
    const requestedRecovery = computeContractExpiryRecovery(def.upfrontCost, expired.progress);
    const recoveredCredits = Math.min(requestedRecovery, Math.max(0, MAX_RESOURCE - r.credits));
    if (recoveredCredits > 0) {
      r.credits += recoveredCredits;
      recordCreditsEarned(s, recoveredCredits);
      entries.push({
        label: "Contract Scrap Recovery",
        delta: recoveredCredits,
        unit: "credits",
        reason: `${def.name} — partial upfront deposit recovery`,
        severity: "positive",
      });
    }
    const recoveredSummary = recoveredCredits > 0
      ? `Recovered: +${recoveredCredits.toLocaleString()} credits from the unused upfront deposit.`
      : "Recovered: nothing (the treasury is already at its credit ceiling).";
    const writtenOff = Math.max(0, expired.totalPaid - recoveredCredits);
    prependMessage({
      id: `contract-expired-${expired.id}-${s.totalTicks}`,
      timestamp: s.gameDate,
      tick: s.totalTicks,
      category: "alert",
      title: `CONTRACT SCRAPPED — ${def.name.toUpperCase()}`,
      body: `"${def.name}" blew past ${CONTRACT_EXPIRY_MULTIPLIER}× its quoted schedule and has been scrapped at ${Math.floor(expired.progress)}% complete. Nothing was delivered. ${recoveredSummary} ${writtenOff.toLocaleString()} credits remain written off; retainer billing stops now.`,
      read: false,
      priority: "high",
    });
    s.newsFeed = pushNewsItem(s.newsFeed, contractExpiredNews(s, def.name, expired.id));
    entries.push({
      label: "Contract Expired",
      delta: 0,
      unit: "",
      reason: `${def.name} scrapped — never delivered`,
      severity: "warning",
    });
  }

  s.activeContracts = s.activeContracts.filter((c) => c.status === "active");
  const allCompleted = [...(s.completedContracts ?? []), ...completedThisTick, ...expiredThisTick];
  s.completedContracts = allCompleted.length > 200 ? allCompleted.slice(-200) : allCompleted;

  if (s.activeContracts.length > 0) {
    const activeCount = s.activeContracts.length;
    const avgProgress = s.activeContracts.reduce((sum, c) => sum + c.progress, 0) / activeCount;
    entries.push({
      label: "Active Contracts",
      delta: activeCount,
      unit: "projects",
      reason: `Avg progress ${avgProgress.toFixed(1)}%`,
      severity: "neutral",
    });
  }
  });

  // ─── CONSTRUCTION ORDERS ──────────────────────────────────────────────
  // Task #500: timed building construction. Orders were paid in full at
  // order time (GameContext), so completion only lands building counts and
  // an inbox message — never credits (no ledger entry needed). Processing
  // lives here inside runTick so real-time play, turn-based End Turn and
  // offline catch-up all advance construction identically. Wrapped in
  // safeSub so a malformed order can't kill the rest of the tick.
  safeSub("Construction Orders", entries, () => {
    const res = processPendingConstructions(s, entries, prependMessage);
    // City building counts just changed — invalidate the tech-effects
    // cache exactly like contract completions do above.
    if (res.cityCompleted) invalidateTechCache();
  });

  // ─── ACTIVE EDICTS ────────────────────────────────────────────────────
  // Task #169: wrapped in safeSub so a malformed edict instance or
  // missing edict definition can't kill the rest of the tick.
  safeSub("Edicts", entries, () => {
  s.bordersClosed = false;
  if (s.activeEdicts && s.activeEdicts.length > 0) {
    ensureEdictsClone();
    const surviving: ActiveEdict[] = [];
    for (const ae of s.activeEdicts) {
      if ((!bbOn && isBBContentId(ae.edictId)) || (!sdOn && isSDContentId(ae.edictId))) {
        ae.ticksRemaining--;
        if (ae.ticksRemaining > 0) surviving.push(ae);
        continue;
      }
      const def = getEdictById(ae.edictId);
      if (!def) continue;
      const fx = def.effects;
      if (fx.happiness) cs.happiness = clampStat(cs.happiness + fx.happiness);
      if (fx.crime) cs.crime = clampStat(cs.crime + fx.crime);
      if (fx.corruption) cs.corruption = clampStat(cs.corruption + fx.corruption);
      if (fx.unrest) cs.unrest = clampStat(cs.unrest + fx.unrest);
      if (fx.diseaseRisk) cs.diseaseRisk = clampStat(cs.diseaseRisk + fx.diseaseRisk);
      if (fx.employment) cs.employment = clampStat(cs.employment + fx.employment);
      if (fx.lawEnforcement) cs.lawOrder = clampStat(cs.lawOrder + fx.lawEnforcement);
      if (fx.credits) { r.credits += fx.credits; recordCreditsEarned(s, fx.credits); }
      if (fx.creditsPerTick) { r.credits += fx.creditsPerTick; recordCreditsEarned(s, fx.creditsPerTick); }
      // Task #473: edict credit effects were mutating the treasury with no
      // tick-ledger entry, so the entries sum drifted from the real delta the
      // moment any fiscal edict was active. Book them like Edict Trade Bonus.
      const edictCredits = (fx.credits ?? 0) + (fx.creditsPerTick ?? 0);
      if (edictCredits !== 0) {
        entries.push({
          label: "Edict Credits",
          delta: edictCredits,
          unit: "credits",
          reason: `${def.name} fiscal effect`,
          severity: edictCredits >= 0 ? "positive" : "negative",
        });
      }
      // Edict trade-income bonuses arrive after the income block has run, so
      // mutating rates.tradeIncome here is a noop. Apply directly to credits
      // and surface a tick entry. (Was previously a typo writing into
      // rates.taxIncome — equally a noop and wrong field besides.)
      if (fx.tradeIncome) {
        r.credits += fx.tradeIncome;
        recordCreditsEarned(s, fx.tradeIncome);
        entries.push({
          label: "Edict Trade Bonus",
          delta: fx.tradeIncome,
          unit: "credits",
          reason: `${def.name} trade stimulus`,
          severity: fx.tradeIncome >= 0 ? "positive" : "negative",
        });
      }
      if (fx.foodProduction) rates.foodProduction += fx.foodProduction;
      if (fx.researchSpeed) cs.researchProgress = clampStat(cs.researchProgress + fx.researchSpeed);
      if (fx.infrastructureRepair) {
        applyInfraDelta(
          fx.infrastructureRepair,
          `tick:${s.totalTicks}:edict:${ae.edictId}:infrastructure`,
          `Active edict "${ae.edictId}" repair`,
        );
      }
      // populationGrowth / populationGrowthRate are deliberately NOT applied
      // here. Mutating cs.populationGrowthRate every tick an edict is active
      // permanently ratcheted the persistent base rate (nothing reversed it
      // on expiry), which compounded population to the 100B ceiling during
      // offline catch-up. The POPULATION block in this same function now
      // reads active-edict growth effects as a per-tick temporary modifier.
      if (fx.lawOrder) cs.lawOrder = clampStat(cs.lawOrder + fx.lawOrder);
      if (fx.defenseRating) cs.defenseRating = Math.max(0, cs.defenseRating + fx.defenseRating);
      if (fx.bordersClosed) {
        s.bordersClosed = true;
      }
      if (fx.factionInfluence) {
        const fac = s.factions.find((f) => f.id === fx.factionInfluence!.factionId);
        if (fac) fac.influence = clamp(fac.influence + fx.factionInfluence.delta, 0, 100);
      }
      ae.ticksRemaining--;
      // Task #534: doctrine winding down — one-time inbox advisory when the
      // Accelerated Training Doctrine has exactly TRAINING_DOCTRINE_WINDDOWN_TICKS
      // left, reminding the player that training orders lock in the speed
      // bonus at ORDER time. Fires exactly once per activation: the counter
      // crosses this value on a single tick, and a save made after the
      // crossing resumes below it. useNewsHeadlines echoes the message onto
      // the TV-news ticker via its seen-id gate (keyed on the id prefix).
      if (ae.edictId === TRAINING_EDICT_ID && ae.ticksRemaining === TRAINING_DOCTRINE_WINDDOWN_TICKS) {
        prependMessage({
          id: `${TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX}${s.totalTicks}`,
          timestamp: s.gameDate,
          tick: s.totalTicks,
          category: "alert",
          title: "TRAINING DOCTRINE WINDING DOWN",
          body: `The Accelerated Training Doctrine lapses in ${TRAINING_DOCTRINE_WINDDOWN_TICKS} ticks. Training orders placed while it holds still lock in the faster drill pace — orders placed after it lapses train at the standard rate.`,
          read: false,
          priority: "normal",
        });
      }
      if (ae.ticksRemaining > 0) {
        surviving.push(ae);
      } else {
        if (!s.edictCooldowns) s.edictCooldowns = {};
        s.edictCooldowns[ae.edictId] = s.totalTicks + def.cooldownTicks;
        entries.push({
          label: "Edict Expired",
          delta: 0,
          unit: "",
          reason: `${def.name} has ended (cooldown: ${def.cooldownTicks} ticks)`,
          severity: "neutral",
        });
        // Task #480: reactive news — the ticker reports the edict standing
        // down at the moment the engine expires it. Task #534: the training
        // doctrine gets themed "barracks stand down" copy instead of the
        // generic lapse line.
        s.newsFeed = pushNewsItem(
          s.newsFeed,
          ae.edictId === TRAINING_EDICT_ID
            ? trainingDoctrineLapsedNews(s, ae.edictId)
            : edictLapsedNews(s, ae.edictId, def.name),
        );
      }
    }
    s.activeEdicts = surviving;
    if (surviving.length > 0) {
      entries.push({
        label: "Active Edicts",
        delta: surviving.length,
        unit: "edicts",
        reason: surviving.map((e) => getEdictById(e.edictId)?.name ?? e.edictId).join(", "),
        severity: "neutral",
      });
    }
  }
  });

  // ─── BORDER CLOSURE PRESSURE ─────────────────────────────────────────
  // Long-term cost of keeping the gates shut. Runs AFTER the edict loop so
  // s.bordersClosed reflects THIS tick's Seal All Borders state (the edict
  // loop resets and re-sets it above). Counts consecutive closed ticks
  // across the immigration ban policy OR the sealed-borders edict; after a
  // grace period the world starts to react, and the damage slowly escalates
  // the longer the closure lasts.
  safeSub("Border Pressure", entries, () => {
    if (s.immigrationBanned || s.bordersClosed) {
      s.borderClosureTicks = (s.borderClosureTicks ?? 0) + 1;
      const closed = s.borderClosureTicks;
      const GRACE = 60;
      if (closed > GRACE) {
        // 1.0x just past grace, ramping to 3.0x after ~800 more ticks.
        const sev = Math.min(3, 1 + (closed - GRACE) / 400);
        if (closed % 8 === 0) {
          const repLoss = Math.round(1 * sev * 10) / 10;
          s.diplomaticReputation = Math.max(0, Math.min(100, (s.diplomaticReputation ?? 50) - repLoss));
          cs.happiness = clampStat(cs.happiness - 0.4 * sev);
          cs.unrest = clampStat(cs.unrest + 0.4 * sev);
          entries.push({
            label: "Closed Borders",
            delta: -repLoss,
            unit: "reputation",
            reason: `Gates shut for ${closed} ticks — the world is watching, and families inside want theirs let in`,
            severity: "negative",
          });
        }
        if (closed % 40 === 0) {
          s.factions = s.factions.map((f) =>
            f.isActive ? { ...f, loyalty: Math.max(0, Math.min(100, f.loyalty - 1)) } : f,
          );
          s.externalMegacities = (s.externalMegacities ?? []).map((m) => ({
            ...m,
            loyalty: Math.max(0, Math.min(100, m.loyalty - 1)),
          }));
          entries.push({
            label: "Isolation",
            delta: -1,
            unit: "loyalty",
            reason: "Prolonged border closure sours factions and neighboring cities",
            severity: "negative",
          });
        }
        // One-time milestone advisories as the closure drags on.
        const milestone =
          closed === 100 ? { title: "BORDER CLOSURE: DIPLOMATIC STRAIN", body: "The gates have been sealed for 100 ticks. Envoys report our reputation is eroding and street mood is turning. The pressure will keep building the longer the borders stay shut.", priority: "normal" as const }
          : closed === 240 ? { title: "BORDER CLOSURE: ISOLATION DEEPENS", body: "240 ticks with the gates shut. Factions and partner cities are losing patience, unrest is climbing, and the labor pool is stagnating. Reopening the borders would stop the bleeding.", priority: "high" as const }
          : closed === 480 ? { title: "BORDER CLOSURE: PARIAH STATUS", body: "480 ticks of sealed borders. MegaCity is becoming a pariah — reputation, happiness, and loyalty are all draining at their maximum rate. Only reopening the gates will end it.", priority: "critical" as const }
          : null;
        if (milestone) {
          prependMessage({
            id: `border-closure-${closed}-${s.totalTicks}`,
            timestamp: { ...s.gameDate },
            tick: s.totalTicks,
            category: "alert",
            title: milestone.title,
            body: milestone.body,
            read: false,
            priority: milestone.priority,
          });
        }
      }
    } else if ((s.borderClosureTicks ?? 0) > 0) {
      s.borderClosureTicks = 0;
    }
  });

  // ─── CITY POLICY STAT EFFECTS & COSTS ────────────────────────────────
  safeSub("City Policies", entries, () => {
  if (activePols.length > 0) {
    for (const pid of activePols) {
      const pd = POLICY_MAP[pid];
      if (!pd) continue;
      const fx = pd.effects;
      if (fx.crime) cs.crime = clampStat(cs.crime + fx.crime);
      if (fx.unrest) cs.unrest = clampStat(cs.unrest + fx.unrest);
      if (fx.happiness) cs.happiness = clampStat(cs.happiness + fx.happiness);
      if (fx.lawOrder) cs.lawOrder = clampStat(cs.lawOrder + fx.lawOrder);
      if (fx.corruption) cs.corruption = clampStat(cs.corruption + fx.corruption);
      if (fx.employment) cs.employment = clampStat(cs.employment + fx.employment);
      if (fx.infrastructureHealth) {
        applyInfraDelta(
          fx.infrastructureHealth,
          `tick:${s.totalTicks}:policy:${pid}:infrastructure`,
          `Active policy "${pid}"`,
        );
      }
      if (fx.defenseRating) cs.defenseRating = clampStat(cs.defenseRating + fx.defenseRating);
    }
    if (policyCost !== 0) {
      r.credits -= policyCost;
      entries.push({
        label: "Policy Costs",
        delta: -policyCost,
        unit: "credits",
        reason: `${activePols.length} active ${activePols.length === 1 ? "policy" : "policies"}`,
        severity: policyCost > 0 ? "negative" : "positive",
      });
    }
  }
  });

  if (cheats.infiniteMoney) {
    if (r.credits < state.resources.credits) r.credits = state.resources.credits;
    if (r.credits < 999999) r.credits = 999999;
  }

  if (cheats.godMode) {
    cs.crime = 0;
    cs.unrest = 0;
    cs.corruption = 0;
  }

  if (cheats.unlimitedFood) {
    if (r.food < 9999) r.food = 9999;
  }
  if (cheats.unlimitedWater) {
    if (r.water < 9999) r.water = 9999;
  }

  if (cheats.anarchy) {
    cs.crime = 100;
    cs.unrest = 100;
    cs.lawOrder = 0;
  }

  s.totalTicks++;
  s.tickLog = [...entries];
  s.lastTickTime = Date.now();

  if (s.gameDate) {
    const prevYear = s.gameDate.year;
    s.gameDate = advanceHour(s.gameDate);

    const currentSeason = getSeason(s.gameDate.month);
    // Task #480: reactive news — season turnover is a real world-state change
    // worth a ticker line. Only fire on an actual transition (skip the very
    // first tick where s.season is still unset, and skip offline catch-up
    // where the same transition would spam once per replayed tick — the id
    // embeds the tick so dupes are impossible, but we still gate on change).
    if (s.season && s.season !== currentSeason) {
      s.newsFeed = pushNewsItem(s.newsFeed, seasonChangeNews(s, currentSeason));
    }
    s.season = currentSeason;

    if (isDayStart(s.gameDate)) {
      s.weather = generateWeather(s.gameDate);
    }
    if (!s.weather) {
      s.weather = generateWeather(s.gameDate);
    }

    if (s.gameDate.year !== prevYear) {
      try {
        processOfficerLifecycles(s, s.gameDate.year);
        tickNamedCharacters(s, s.gameDate.year);
      } catch (err) {
        console.warn("[lifecycle] year rollover failed", err);
      }
    }

    // Weekly notable figure beat — runs at the start of each new week.
    if (isDayStart(s.gameDate) && s.gameDate.day % 7 === 1) {
      try {
        const notable = maybeEmitWeeklyNotable(s);
        if (notable) {
          prependMessage(notable);
        }
      } catch (err) {
        console.warn("[notable] weekly beat failed", err);
      }
    }

    // Faction flashpoint beat — mid-week cadence so it doesn't collide
    // with the weekly notable beat. Surfaces gang lieutenants / agitators.
    if (isDayStart(s.gameDate) && s.gameDate.day % 7 === 4) {
      try {
        const flashpoint = maybeEmitFactionFlashpoint(s);
        if (flashpoint) {
          prependMessage(flashpoint);
        }
      } catch (err) {
        console.warn("[flashpoint] faction beat failed", err);
      }
    }

    // Undercity rumor beat — late-week cadence. Surfaces fugitives,
    // preachers, and informants.
    if (isDayStart(s.gameDate) && s.gameDate.day % 7 === 6) {
      try {
        const rumor = maybeEmitUndercityRumor(s);
        if (rumor) {
          prependMessage(rumor);
        }
      } catch (err) {
        console.warn("[undercity] rumor beat failed", err);
      }
    }

    // Market move beat — monthly cadence. Surfaces tycoons / union bosses.
    if (isDayStart(s.gameDate) && s.gameDate.day === 15) {
      try {
        const market = maybeEmitMarketMove(s);
        if (market) {
          prependMessage(market);
        }
      } catch (err) {
        console.warn("[market] monthly beat failed", err);
      }
    }
  }

  if (!s.messages) {
    s.messages = [];
  }

  if (s.gameDate && isDayStart(s.gameDate)) {
    const dayReport = generateEnhancedDailyReport(s);
    prependMessage(dayReport);
  }

  if (s.gameDate && s.gameDate.hour === 6 && negativeEventsAllowed(s)) {
    const alertMsg = generateEnhancedAlert(s);
    if (alertMsg) {
      prependMessage(alertMsg);
    }
  }

  if (s.gameDate && s.totalTicks > 8) {
    const periodicMsg = generatePeriodicMessage(s);
    if (periodicMsg) {
      prependMessage(periodicMsg);
    }

    if (isAtWar(s)) {
      const warMsg = generateWartimePeriodicMessage(s);
      if (warMsg) {
        prependMessage(warMsg);
      }
    }
  }

  // ─── RELIGION AUTO-CONSTRUCTION ──────────────────────────────────────
  safeSub("Religion Auto-Build", entries, () => {
  if (s.gameDate && isDayStart(s.gameDate) && s.gameDate.day % 3 === 0) {
    const cultFactions = s.factions.filter(
      (f) => f.type === "cult" && f.isActive && f.influence >= 25
    );
    if (cultFactions.length > 0) {
      const religionBuildings: { key: string; cost: number; steelCost: number }[] = [
        { key: "districtTemple", cost: 15000, steelCost: 20 },
        { key: "pilgrimageShrines", cost: 20000, steelCost: 15 },
        { key: "divineBroadcastTower", cost: 22000, steelCost: 30 },
        { key: "sacredGroundPark", cost: 12000, steelCost: 10 },
        { key: "confessionalBureau", cost: 18000, steelCost: 15 },
        { key: "martyrsMemorial", cost: 15000, steelCost: 20 },
        { key: "monasteryComplex", cost: 25000, steelCost: 30 },
        { key: "prophetsAcademy", cost: 30000, steelCost: 25 },
        { key: "zealotBarracks", cost: 30000, steelCost: 40 },
        { key: "grandCathedral", cost: 80000, steelCost: 100 },
        { key: "inquisitionHQ", cost: 40000, steelCost: 50 },
        { key: "templeOfCommerce", cost: 25000, steelCost: 20 },
        { key: "holyRelicVault", cost: 35000, steelCost: 40 },
        { key: "oracleChambers", cost: 20000, steelCost: 15 },
        { key: "doomsdayBunkerShrine", cost: 45000, steelCost: 60 },
      ];
      const topCult = cultFactions.reduce((a, c) => (c.influence > a.influence ? c : a), cultFactions[0]);
      const influenceFactor = topCult.influence / 100;
      const affordable = religionBuildings.filter(
        (rb) => r.credits >= rb.cost * 1.5 && (r.steel ?? 0) >= rb.steelCost
      );
      const totalReligionBuildings = religionBuildings.reduce((sum, rb) => sum + (bldg[rb.key] ?? 0), 0);
      const maxAutoBuilds = 30;
      if (affordable.length > 0 && totalReligionBuildings < maxAutoBuilds && Math.random() < influenceFactor * 0.5) {
        const pick = affordable[Math.floor(Math.random() * affordable.length)];
        const discount = Math.floor(pick.cost * 0.7);
        r.credits -= discount;
        r.steel = Math.max(0, (r.steel ?? 0) - pick.steelCost);
        bldg[pick.key] = (bldg[pick.key] ?? 0) + 1;
        const buildMsg: GameMessage = {
          id: `cult-build-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}`,
          timestamp: { ...s.gameDate },
          tick: 0,
          category: "alert",
          title: "CULT CONSTRUCTION",
          body: `${topCult.name} has erected a new ${pick.key.replace(/([A-Z])/g, " $1").trim()} using city resources. Their influence grows.`,
          read: false,
          priority: "high",
        };
        prependMessage(buildMsg);
        entries.push({
          label: "Cult Construction",
          delta: -discount,
          unit: "credits",
          reason: `${topCult.name} auto-built ${pick.key.replace(/([A-Z])/g, " $1").trim()}`,
          severity: "warning",
        });
      }
    }
  }
  });

  // ─── SIXTH DAY HUMOR ─────────────────────────────────────────────────
  if (sdOn && s.gameDate && s.gameDate.hour === 12 && Math.random() < 0.3) {
    const humorLine = SD_HUMOR[Math.floor(Math.random() * SD_HUMOR.length)];
    const humorMsg: GameMessage = {
      id: `sd-humor-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}`,
      timestamp: { ...s.gameDate },
      tick: 0,
      category: "intel",
      title: "CLONE NEWS WIRE",
      body: humorLine,
      read: false,
      priority: "low",
    };
    prependMessage(humorMsg);
  }

  // ─── TOURISM STATE UPDATE ───────────────────────────────────────────
  if (s.tourism) {
    s.tourism.tourismCapacity = tourismCap;
    s.tourism.touristCount = touristCount;
    s.tourism.tourismSatisfaction = tourismSatisfactionBase;
    s.tourism.tourismIncome = tourismIncomeRate;
  }

  // ─── COMBAT: AUTO-RESOLVE ENGAGEMENTS, RAIDS, & ZONE CONTROL ────────
  safeSub("Combat", entries, () => {
  if (!s.combat) {
    s.combat = {
      activeEngagements: [],
      battleLog: [],
      zones: ZONE_TERRITORIES.map((z) => ({ ...z })),
      activeDoctrine: "balanced",
      totalBattlesFought: 0,
      totalVictories: 0,
      totalDefeats: 0,
      totalCasualties: 0,
      totalEnemyKills: 0,
      warMorale: 70,
      raidEventQueue: [],
      totalPopulationLosses: 0,
      enemiesDefeatedByArchetype: {},
    };
    _combatCloned = true; // freshly built; treat as already-cloned
  }
  // Combat block almost always mutates (engagement ticks, raid scans,
  // zone control updates). Clone once up front instead of sprinkling
  // ensureCombatClone() across dozens of mutation sites.
  ensureCombatClone();
  {
    const cbt = s.combat;
    if (!cbt.raidEventQueue) cbt.raidEventQueue = [];
    if (cbt.totalPopulationLosses === undefined) cbt.totalPopulationLosses = 0;
    // Task #226: ensure the per-archetype lifetime tally exists so the
    // raid-repel accumulator below can write to it without a guard on
    // every increment. Old saves loaded before this field was added
    // hydrate without it; the sanitizer also fills it in, but the
    // engine touches it on every tick so we belt-and-braces here.
    if (!cbt.enemiesDefeatedByArchetype) cbt.enemiesDefeatedByArchetype = {};

    // --- Per-tick ammo/fuel consumption for active engagements ---
    for (const eng of cbt.activeEngagements) {
      if (eng.status === "active") {
        const doctrine = COMBAT_DOCTRINES_MAP[eng.doctrineId] ?? COMBAT_DOCTRINES[2];
        const ordnance = eng.tactical ? ORDNANCE_OPTIONS_MAP[eng.tactical?.ordnance ?? ""] ?? ORDNANCE_OPTIONS[0] : ORDNANCE_OPTIONS[0];
        const tickAmmo = Math.round((5 + ordnance.ammoCost * 0.1) * doctrine.ammoCostMod);
        const tickFuel = Math.round((3 + ordnance.fuelCost * 0.05) * doctrine.fuelCostMod);
        r.ammo = Math.max(0, r.ammo - tickAmmo);
        r.fuel = Math.max(0, r.fuel - tickFuel);
      }
    }

    // --- Resolve engagements ---
    for (const eng of cbt.activeEngagements) {
      if (eng.status === "resolved") continue;
      if (eng.status === "preparing") {
        eng.status = "active";
        continue;
      }
      eng.ticksRemaining = Math.max(0, eng.ticksRemaining - 1);
      if (eng.ticksRemaining <= 0) {
        const doctrine = COMBAT_DOCTRINES_MAP[eng.doctrineId] ?? COMBAT_DOCTRINES[2];
        // Task #188: cached lookups. Cache is invalidated when prior
        // engagements / raids in this same tick mutate s.units, so the
        // upgraded composition strength is still re-derived correctly.
        const compositionStr = getCachedCompositionUpgraded();
        const combatUnitTotal = getCachedCombatUnitCount();
        const playerStr = compositionStr * (s.militaryOverhaul?.logistics?.combatReadinessMod ?? 1) * (eng.unitsCommitted / Math.max(1, combatUnitTotal)) + cs.defenseRating * 2;
        const completedTechs = (s.unlockedTechnologies ?? []).length;
        const assignedOfficer = eng.tactical?.officerAssigned ? (s.officers ?? []).find((o) => o.id === eng.tactical?.officerAssigned) : undefined;
        const result = resolveEngagement(playerStr, eng.enemyStrength, cbt.warMorale, eng.enemyMorale, doctrine, eng.terrainMod, cs.defenseRating, eng.tactical ? { formation: eng.tactical.formation, ordnance: eng.tactical.ordnance, reserveCommitment: eng.tactical.reserveCommitment, officerAssigned: eng.tactical.officerAssigned, officerCompetence: assignedOfficer?.competence ?? 0 } : undefined, completedTechs);
        const tpl = ENGAGEMENT_TEMPLATES_MAP[eng.templateId];
        const creditReward = result.victory ? (tpl?.creditReward ?? 1000) : 0;
        const xpReward = result.victory ? (tpl?.xpReward ?? 20) : Math.round((tpl?.xpReward ?? 20) * 0.3);

        eng.status = "resolved";
        eng.result = {
          victory: result.victory,
          playerCasualties: result.playerCasualties,
          enemyCasualties: result.enemyCasualties,
          moraleShift: result.moraleShift,
          dominance: result.dominance,
          creditsGained: creditReward,
          xpGained: xpReward,
          populationLoss: result.populationLoss,
          factionImpact: result.factionRelationImpact ?? undefined,
          resolvedTick: s.totalTicks,
        };

        r.credits += creditReward;
        recordCreditsEarned(s, creditReward);
        cbt.warMorale = Math.min(100, Math.max(0, cbt.warMorale + result.moraleShift));
        cbt.totalBattlesFought++;
        cbt.totalCasualties += result.playerCasualties;
        recordHumanConsequences(s, "military", { militaryDeaths: result.playerCasualties });
        cbt.totalEnemyKills += result.enemyCasualties;
        cbt.totalPopulationLosses += result.populationLoss;
        cs.population = Math.max(0, cs.population - result.populationLoss);

        if (result.playerCasualties > 0) {
          const unitEntries = Object.entries(s.units as Record<string, number>).filter(
            ([key, val]) => typeof val === "number" && val > 0 && COMBAT_UNIT_KEYS.has(key)
          );
          if (unitEntries.length > 0 && combatUnitTotal > 0) {
            let remainingLosses = result.playerCasualties;
            for (const [key, count] of unitEntries) {
              if (remainingLosses <= 0) break;
              const proportion = count / combatUnitTotal;
              const losses = Math.min(count, Math.max(1, Math.round(result.playerCasualties * proportion)));
              const actualLoss = Math.min(losses, remainingLosses);
              (s.units as Record<string, number>)[key] = Math.max(0, count - actualLoss);
              remainingLosses -= actualLoss;
            }
            invalidateUnitsCache();
          }
        }

        if (result.victory) {
          cbt.totalVictories++;
          cs.defenseRating = Math.min(100, cs.defenseRating + (tpl?.defenseRewardOnWin ?? 1));
          cs.happiness = Math.min(100, cs.happiness + 1);
          const zone = cbt.zones.find((z) => z.id === eng.zoneId);
          if (zone) {
            zone.controlLevel = Math.min(100, zone.controlLevel + Math.round(result.dominance * 0.2));
            zone.threat = Math.max(0, zone.threat - Math.round(result.dominance * 0.15));
            if (zone.controlLevel >= 80) zone.controllingFaction = "player";
          }
          const affectedDistrictSet = ZONE_DISTRICT_SET[eng.zoneId] ?? EMPTY_DISTRICT_SET;
          const affectedHasAny = affectedDistrictSet.size > 0;
          for (let _ci = 0; _ci < s.districts.length; _ci++) {
            const d = s.districts[_ci];
            if (affectedDistrictSet.has(d.id) || (!affectedHasAny && Math.random() < 0.1)) {
              const cd = ensureDistrictClone(_ci);
              cd.crime = Math.max(0, cd.crime - 2);
              cd.unrest = Math.max(0, cd.unrest - 1);
              cd.loyalty = Math.min(100, cd.loyalty + 1);
              cd.defenseRating = Math.min(100, cd.defenseRating + 1);
            }
          }
          if (s.factions) {
            for (let _fi = 0; _fi < s.factions.length; _fi++) {
              if (s.factions[_fi].type === "law") {
                ensureFactionClone(_fi).loyalty = Math.min(100, s.factions[_fi].loyalty + 1);
              }
            }
          }
          if (result.creditsLooted > 0) {
            r.credits += result.creditsLooted;
            recordCreditsEarned(s, result.creditsLooted);
            entries.push({ label: "COMBAT LOOT", delta: result.creditsLooted, unit: "credits", reason: `Looted from ${eng.name}`, severity: "positive" });
          }
          if (result.ammoLooted > 0) {
            r.ammo += result.ammoLooted;
            entries.push({ label: "AMMO SALVAGE", delta: result.ammoLooted, unit: "ammo", reason: `Salvaged from ${eng.name}`, severity: "positive" });
          }
          entries.push({ label: "COMBAT VICTORY", delta: creditReward, unit: "credits", reason: `${eng.name} — VICTORY (${result.dominance}% dominance, ${result.populationLoss} pop lost)`, severity: "positive" });
        } else {
          cbt.totalDefeats++;
          cs.defenseRating = Math.max(0, cs.defenseRating - 1);
          cs.unrest = Math.min(100, cs.unrest + 2);
          cs.happiness = Math.max(0, cs.happiness - 2);
          const zone = cbt.zones.find((z) => z.id === eng.zoneId);
          if (zone) {
            zone.controlLevel = Math.max(0, zone.controlLevel - 5);
            zone.threat = Math.min(100, zone.threat + 5);
            if (zone.controlLevel < 30) zone.controllingFaction = "hostiles";
          }
          const defeatDistrictSet = ZONE_DISTRICT_SET[eng.zoneId] ?? EMPTY_DISTRICT_SET;
          const defeatHasAny = defeatDistrictSet.size > 0;
          for (let _ci = 0; _ci < s.districts.length; _ci++) {
            const d = s.districts[_ci];
            if (defeatDistrictSet.has(d.id) || (!defeatHasAny && Math.random() < 0.1)) {
              const cd = ensureDistrictClone(_ci);
              cd.crime = Math.min(100, cd.crime + 3);
              cd.unrest = Math.min(100, cd.unrest + 2);
              cd.loyalty = Math.max(0, cd.loyalty - 2);
              cd.gangInfluence = Math.min(100, cd.gangInfluence + 1);
            }
          }
          if (s.factions) {
            for (let _fi = 0; _fi < s.factions.length; _fi++) {
              if (s.factions[_fi].type === "underclass") {
                ensureFactionClone(_fi).loyalty = Math.max(0, s.factions[_fi].loyalty - 1);
              }
            }
          }
          entries.push({ label: "COMBAT DEFEAT", delta: 0, unit: "status", reason: `${eng.name} — DEFEATED (${result.playerCasualties} casualties, ${result.populationLoss} pop lost)`, severity: "negative" });
        }

        // Task #229: distribute the engagement's enemyCasualties across
        // its faction-flavored composition (mirrors the raid-repel path)
        // and roll the per-archetype kills into the lifetime tally so the
        // Defense tab readout reflects kills from BOTH raids and routine
        // engagements — not just defended raids. Old engagements without
        // a composition fall through with no per-archetype breakdown.
        const engEnemyLosses = eng.composition && eng.factionSource && result.enemyCasualties > 0
          ? computeArchetypeLosses(eng.composition, eng.factionSource, result.enemyCasualties)
          : undefined;
        if (engEnemyLosses) {
          const tally = cbt.enemiesDefeatedByArchetype!;
          for (const [archId, killed] of Object.entries(engEnemyLosses)) {
            if (typeof killed !== "number" || killed <= 0) continue;
            tally[archId] = (tally[archId] ?? 0) + killed;
          }
        }
        cbt.battleLog.unshift({
          id: `battle-${s.totalTicks}-${eng.id}`,
          tick: s.totalTicks,
          engagementName: eng.name,
          victory: result.victory,
          playerCasualties: result.playerCasualties,
          enemyCasualties: result.enemyCasualties,
          dominance: result.dominance,
          zoneId: eng.zoneId,
          doctrineUsed: eng.doctrineId,
          creditsLooted: result.creditsLooted,
          ammoLooted: result.ammoLooted,
          timestamp: { ...s.gameDate },
          composition: eng.composition,
          factionSource: eng.factionSource,
          enemyLosses: engEnemyLosses,
        });
      }
    }

    cbt.activeEngagements = cbt.activeEngagements.filter((e) => {
      if (e.status !== "resolved") return true;
      const resolvedAge = (e.result as { resolvedTick?: number })?.resolvedTick ?? 0;
      return resolvedAge > 0 && (s.totalTicks - resolvedAge) < 3;
    });

    // --- Hostile Raid Event Spawning (periodic, every 12 ticks) ---
    // Calm start: no raids spawn during Day 1 (totalTicks < 4).
    if (negativeEventsAllowed(s) && s.totalTicks % 12 === 0 && cbt.raidEventQueue.length < 3) {
      const hostileZones = cbt.zones.filter((z) => z.status === "hostile" || z.status === "contested");
      if (hostileZones.length > 0) {
        const raidRoll = ((s.totalTicks * 16807) % 2147483647) / 2147483647;
        const avgThreat = hostileZones.reduce((sum, z) => sum + z.threat, 0) / hostileZones.length;
        if (raidRoll < avgThreat / 200) {
          // Bug fix: previously tplIdx, targetZoneId, and the enemyStrength
          // jitter all derived from `raidRoll`, but the spawn gate above
          // forces raidRoll < avgThreat/200 (≈0.1–0.4), which pinned
          // floor(raidRoll * 8) to 0 and made gang_incursion the only
          // template that ever fired (verified across 800+ raids in
          // scripts/stressTestWar.ts).
          //
          // Use independent splitmix32-style hashes of totalTicks (with
          // distinct salts) for tpl + zone + strength jitter. A plain
          // Park-Miller LCG isn't enough here because the spawn gate
          // only fires every 12 ticks, so consecutive inputs differ by
          // 12 — an LCG produces tightly correlated outputs at that
          // step size and only a couple of templates fire across
          // thousands of ticks. The mixer's avalanche guarantees
          // uniform distribution across the 8 templates while still
          // being fully deterministic per-tick.
          const hashTick = (tt: number, salt: number): number => {
            let h = (Math.imul(tt + salt, 0x9e3779b9)) >>> 0;
            h ^= h >>> 16;
            h = Math.imul(h, 0x85ebca6b) >>> 0;
            h ^= h >>> 13;
            h = Math.imul(h, 0xc2b2ae35) >>> 0;
            h ^= h >>> 16;
            return (h >>> 0) / 0x100000000;
          };
          const tplRoll = hashTick(s.totalTicks, 0xa5);
          const zoneRoll = hashTick(s.totalTicks, 0xb7);
          const strengthRoll = hashTick(s.totalTicks, 0xc9);
          const tplIdx = Math.floor(tplRoll * HOSTILE_RAID_TEMPLATES.length) % HOSTILE_RAID_TEMPLATES.length;
          const raidTpl = HOSTILE_RAID_TEMPLATES[tplIdx];
          const targetZones = raidTpl.targetZonePreference.filter((zId) => cbt.zones.some((z) => z.id === zId));
          const targetZoneId = targetZones.length > 0 ? targetZones[Math.floor(zoneRoll * 1000) % targetZones.length] : hostileZones[0].id;

          const raidId = `raid-${s.totalTicks}-${raidTpl.id}`;
          const enemyStrength = raidTpl.enemyStrength + Math.floor(strengthRoll * 20);
          // Task #222: attach a deterministic faction-flavored composition so
          // the raid card / siege report can show "Hostiles spotted: 6×
          // Rust-Pack Bikers, ..." instead of just an opaque strength number.
          // Composition is purely additive — strength-based combat resolution
          // below uses raid.enemyStrength unchanged.
          const composition = generateFactionComposition(raidId, s.totalTicks, raidTpl.factionSource, enemyStrength);
          const raid = {
            id: raidId,
            templateId: raidTpl.id,
            name: raidTpl.name,
            description: raidTpl.description,
            enemyStrength,
            enemyMorale: raidTpl.enemyMorale,
            terrainMod: raidTpl.terrainMod,
            targetZoneId,
            factionSource: raidTpl.factionSource,
            populationDamage: raidTpl.populationDamage,
            ticksRemaining: raidTpl.tickDuration,
            status: "incoming" as const,
            composition,
          };
          cbt.raidEventQueue.push(raid);
          const targetZoneName = getZoneName(cbt.zones, targetZoneId);
          entries.push({ label: "HOSTILE RAID DETECTED", delta: 0, unit: "status", reason: `${raidTpl.name} targeting ${targetZoneName}`, severity: "negative" });
        }
      }
    }

    // Calm start: no auto-skirmishes spawn during Day 1 (totalTicks < 4).
    if (negativeEventsAllowed(s) && s.totalTicks % 6 === 3 && cbt.activeEngagements.filter((e) => e.status !== "resolved").length < 3) {
      const contestedOrHostile = cbt.zones.filter((z) => z.status === "contested" || z.status === "hostile");
      if (contestedOrHostile.length > 0) {
        const skirmishSeed = ((s.totalTicks * 48271) % 2147483647) / 2147483647;
        const highThreatZone = contestedOrHostile.reduce((a, b) => a.threat > b.threat ? a : b);
        if (skirmishSeed < highThreatZone.threat / 150) {
          const skirmishTypes: Array<{ type: "skirmish" | "patrol_clash" | "ambush"; name: string; desc: string }> = [
            { type: "skirmish", name: "Border Skirmish", desc: `Faction clash erupts at ${highThreatZone.name}. Forces engaged automatically.` },
            { type: "patrol_clash", name: "Patrol Contact", desc: `Patrol units encounter hostiles in ${highThreatZone.name}.` },
            { type: "ambush", name: "Faction Ambush", desc: `Enemy forces ambush patrol near ${highThreatZone.name}.` },
          ];
          const skirmishDef = skirmishTypes[Math.floor(skirmishSeed * 300) % skirmishTypes.length];
          const autoEngId = `auto-${s.totalTicks}-${Math.floor(skirmishSeed * 9999)}`;
          const autoEnemyStrength = 20 + Math.floor(highThreatZone.threat * 0.5);
          // Task #229: derive a faction-flavored composition for the
          // auto-skirmish so resolution can credit per-archetype kills to
          // combat.enemiesDefeatedByArchetype (matches the raid path).
          // Map the zone's controllingFaction onto a known signature-units
          // bucket; "player"/"contested"/"none"/"hostiles" don't have their
          // own archetype list, so generateFactionComposition's "gangs"
          // fallback covers them.
          const autoFactionSource = highThreatZone.controllingFaction || "gangs";
          const autoComposition = generateFactionComposition(autoEngId, s.totalTicks, autoFactionSource, autoEnemyStrength);
          const autoEng: ActiveEngagement = {
            id: autoEngId,
            templateId: "auto_skirmish",
            name: skirmishDef.name,
            type: skirmishDef.type,
            status: "active",
            unitsCommitted: Math.min(10, Math.max(3, Math.floor(highThreatZone.garrison * 0.3))),
            enemyStrength: autoEnemyStrength,
            enemyMorale: 40 + Math.floor(skirmishSeed * 30),
            terrainMod: 1.0,
            ticksRemaining: 1,
            zoneId: highThreatZone.id,
            doctrineId: cbt.activeDoctrine,
            composition: autoComposition,
            factionSource: autoFactionSource,
          };
          cbt.activeEngagements.push(autoEng);
          entries.push({ label: "AUTO-SKIRMISH", delta: 0, unit: "status", reason: `${skirmishDef.name} at ${highThreatZone.name}`, severity: "negative" });
        }
      }
    }

    // --- Process Raid Events ---
    // Task #188: tier map + composition strengths now flow through the
    // per-tick cache. Cache is invalidated when raid casualties mutate
    // s.units, so per-raid re-derivation is preserved.
    for (const raid of cbt.raidEventQueue) {
      if (raid.status === "incoming") {
        raid.status = "active";
        continue;
      }
      if (raid.status === "active") {
        raid.ticksRemaining--;
        const zone = cbt.zones.find((z) => z.id === raid.targetZoneId);
        if (zone) {
          zone.threat = Math.min(100, zone.threat + 3);
          if (zone.garrison > 0 || cs.defenseRating > 0) {
            const _rBaseStr = getCachedCompositionBase();
            const _rUpgStr = getCachedCompositionUpgraded();
            const _rUpFactor = _rBaseStr > 0 ? _rUpgStr / _rBaseStr : 1;
            const garrisonDefense = (zone.garrison * 8 + cs.defenseRating * 3) * _rUpFactor * (s.militaryOverhaul?.logistics?.combatReadinessMod ?? 1);
            if (garrisonDefense >= raid.enemyStrength * 0.6) {
              raid.status = "repelled";
              const garrisonLosses = Math.round(raid.enemyStrength * 0.05);
              zone.garrison = Math.max(0, zone.garrison - garrisonLosses);
              if (garrisonLosses > 0) {
                const combatEntries = Object.entries(s.units as Record<string, number>).filter(
                  ([key, val]) => typeof val === "number" && val > 0 && COMBAT_UNIT_KEYS.has(key)
                );
                const cTotal = getCachedCombatUnitCount();
                let rLosses = garrisonLosses;
                for (const [key, count] of combatEntries) {
                  if (rLosses <= 0) break;
                  const loss = Math.min(count, Math.max(1, Math.round(garrisonLosses * (count / Math.max(1, cTotal)))));
                  const actual = Math.min(loss, rLosses);
                  (s.units as Record<string, number>)[key] = Math.max(0, count - actual);
                  rLosses -= actual;
                }
                invalidateUnitsCache();
              }
              // Task #223: carry the raid's faction-flavored composition
              // (and the per-archetype losses we just inflicted) into the
              // battle-log entry so the after-action / siege debrief can
              // show "Hostiles: 6× Rust-Pack Bikers, ..." and "Losses:
              // 4× Rust-Pack Bikers down" instead of just an aggregate
              // enemyCasualties number.
              const repelEnemyStrLoss = Math.round(raid.enemyStrength * 0.3);
              const repelEnemyLosses = raid.composition
                ? computeArchetypeLosses(raid.composition, raid.factionSource, repelEnemyStrLoss)
                : undefined;
              cbt.battleLog.unshift({
                id: `raid-repel-${s.totalTicks}-${raid.id}`,
                tick: s.totalTicks,
                engagementName: `RAID: ${raid.name}`,
                victory: true,
                playerCasualties: garrisonLosses,
                enemyCasualties: repelEnemyStrLoss,
                dominance: 70,
                zoneId: raid.targetZoneId,
                doctrineUsed: cbt.activeDoctrine,
                creditsLooted: 0,
                ammoLooted: 0,
                timestamp: { ...s.gameDate },
                composition: raid.composition,
                factionSource: raid.factionSource,
                enemyLosses: repelEnemyLosses,
              });
              // Task #226: roll the per-archetype losses we just inflicted
              // into the lifetime tally so the Military > Defense screen
              // can render "Hostiles defeated to date: 12× Rust-Pack
              // Bikers, ...". computeArchetypeLosses already clamps each
              // count to the spawned amount, so we can just sum.
              if (repelEnemyLosses) {
                const tally = cbt.enemiesDefeatedByArchetype!;
                for (const [archId, killed] of Object.entries(repelEnemyLosses)) {
                  if (typeof killed !== "number" || killed <= 0) continue;
                  tally[archId] = (tally[archId] ?? 0) + killed;
                }
              }
              const repelDistrictSet = ZONE_DISTRICT_SET[raid.targetZoneId] ?? EMPTY_DISTRICT_SET;
              for (let _ci = 0; _ci < s.districts.length; _ci++) {
                const d = s.districts[_ci];
                if (repelDistrictSet.has(d.id)) {
                  const cd = ensureDistrictClone(_ci);
                  cd.loyalty = Math.min(100, cd.loyalty + 1);
                  cd.defenseRating = Math.min(100, cd.defenseRating + 1);
                }
              }
              // Task #222: name a signature archetype so the inbox reason
              // text reads "left their Slag-Cannon Crew in the wreckage"
              // instead of an anonymous strength readout.
              const repelFlavor = raid.composition ? pickFlavorArchetype(raid.composition, raid.factionSource) : null;
              const repelTail = repelFlavor ? ` — left their ${repelFlavor.displayName} in the wreckage` : "";
              // Task #225: append the same "Hostiles: ..." / "Losses by
              // unit: ..." breakdown the BATTLE LOG modal shows so players
              // who only read the inbox / tick report don't miss the
              // per-archetype after-action data. Pure presentation —
              // composition + repelEnemyLosses are already computed above.
              const repelBreakdownLines: string[] = [];
              if (raid.composition) {
                const spotted = formatHostilesSpotted(raid.composition, raid.factionSource);
                if (spotted.length > 0) repelBreakdownLines.push(`Hostiles: ${spotted}`);
                if (repelEnemyLosses) {
                  const lossLine = formatLossesByUnit(repelEnemyLosses, raid.factionSource);
                  if (lossLine.length > 0) repelBreakdownLines.push(`Losses by unit: ${lossLine}`);
                }
              }
              const repelBreakdown = repelBreakdownLines.length > 0 ? `\n${repelBreakdownLines.join("\n")}` : "";
              entries.push({ label: "RAID REPELLED", delta: 0, unit: "status", reason: `Garrison repelled ${raid.name} at ${zone.name}${repelTail}${repelBreakdown}`, severity: "positive" });
            } else if (raid.ticksRemaining <= 0) {
              raid.status = "breached";
            }
          } else if (raid.ticksRemaining <= 0) {
            raid.status = "breached";
          }
        }
        if (raid.status === "breached") {
          const zone = cbt.zones.find((z) => z.id === raid.targetZoneId);
          if (zone) {
            zone.controlLevel = Math.max(0, zone.controlLevel - 15);
            zone.threat = Math.min(100, zone.threat + 10);
            zone.controllingFaction = raid.factionSource;
          }
          cs.population = Math.max(0, cs.population - raid.populationDamage);
          cs.unrest = Math.min(100, cs.unrest + 3);
          cs.happiness = Math.max(0, cs.happiness - 3);
          cbt.totalPopulationLosses += raid.populationDamage;
          const breachDistrictSet = ZONE_DISTRICT_SET[raid.targetZoneId] ?? EMPTY_DISTRICT_SET;
          for (let _ci = 0; _ci < s.districts.length; _ci++) {
            const d = s.districts[_ci];
            if (breachDistrictSet.has(d.id)) {
              const cd = ensureDistrictClone(_ci);
              cd.crime = Math.min(100, cd.crime + 5);
              cd.unrest = Math.min(100, cd.unrest + 4);
              cd.loyalty = Math.max(0, cd.loyalty - 3);
              cd.defenseRating = Math.max(0, cd.defenseRating - 2);
              cd.gangInfluence = Math.min(100, cd.gangInfluence + 3);
            }
          }
          if (s.factions) {
            for (let _fi = 0; _fi < s.factions.length; _fi++) {
              if (s.factions[_fi].type === "underclass") {
                ensureFactionClone(_fi).loyalty = Math.max(0, s.factions[_fi].loyalty - 2);
              }
            }
          }
          // Task #230: even on a breach the garrison usually inflicts
          // some attrition before being overrun. Compute a smaller-than-
          // repel enemyStrength loss (~15% vs repel's 30%) and attach
          // per-archetype losses so the after-action shows what the wall
          // cost the attackers.
          const breachEnemyStrLoss = Math.round(raid.enemyStrength * 0.15);
          const breachEnemyLosses = raid.composition
            ? computeArchetypeLosses(raid.composition, raid.factionSource, breachEnemyStrLoss)
            : undefined;
          cbt.battleLog.unshift({
            id: `raid-breach-${s.totalTicks}-${raid.id}`,
            tick: s.totalTicks,
            engagementName: `RAID: ${raid.name}`,
            victory: false,
            playerCasualties: raid.populationDamage,
            enemyCasualties: breachEnemyStrLoss,
            dominance: 20,
            zoneId: raid.targetZoneId,
            doctrineUsed: cbt.activeDoctrine,
            creditsLooted: 0,
            ammoLooted: 0,
            timestamp: { ...s.gameDate },
            // Task #223: composition + faction tag carry into the debrief
            // even on a breach so the player can still see *who* broke the
            // wall — same archetype list as the pre-fight "Hostiles
            // spotted:" card.
            composition: raid.composition,
            factionSource: raid.factionSource,
            // Task #230: per-archetype attrition the garrison inflicted
            // before being overrun.
            enemyLosses: breachEnemyLosses,
          });
          // Task #230: roll the breach attrition into the lifetime tally
          // too, mirroring the repel branch above.
          if (breachEnemyLosses) {
            const tally = cbt.enemiesDefeatedByArchetype!;
            for (const [archId, killed] of Object.entries(breachEnemyLosses)) {
              if (typeof killed !== "number" || killed <= 0) continue;
              tally[archId] = (tally[archId] ?? 0) + killed;
            }
          }
          // Task #222: name a signature archetype in the breach reason so
          // the loss has a face — "Tumor Brutes broke the wall" reads
          // sharper than a population-loss number on its own.
          const breachFlavor = raid.composition ? pickFlavorArchetype(raid.composition, raid.factionSource) : null;
          const breachLead = breachFlavor ? `${breachFlavor.displayName} led ${raid.name}` : raid.name;
          // Task #225/#230: append the same "Hostiles: ..." / "Losses by
          // unit: ..." breakdown the BATTLE LOG modal shows so players who
          // only read the inbox / tick report don't miss the per-archetype
          // after-action data — including the attrition the garrison did
          // inflict before the wall fell.
          const breachBreakdownLines: string[] = [];
          if (raid.composition) {
            const spotted = formatHostilesSpotted(raid.composition, raid.factionSource);
            if (spotted.length > 0) breachBreakdownLines.push(`Hostiles: ${spotted}`);
            if (breachEnemyLosses) {
              const lossLine = formatLossesByUnit(breachEnemyLosses, raid.factionSource);
              if (lossLine.length > 0) breachBreakdownLines.push(`Losses by unit: ${lossLine}`);
            }
          }
          const breachBreakdown = breachBreakdownLines.length > 0 ? `\n${breachBreakdownLines.join("\n")}` : "";
          entries.push({ label: "RAID BREACHED", delta: -raid.populationDamage, unit: "population", reason: `${breachLead} breached defenses — ${raid.populationDamage} casualties${breachBreakdown}`, severity: "negative" });
        }
      }
    }
    cbt.raidEventQueue = cbt.raidEventQueue.filter((r) => r.status === "incoming" || r.status === "active");

    // --- Zone Control Updates ---
    let zoneTributeTotal = 0;
    for (const zone of cbt.zones) {
      if (!zone.controllingFaction) zone.controllingFaction = zone.status === "friendly" ? "player" : "none";
      if (zone.garrison > 0 && zone.controlLevel < 100 && zone.status !== "friendly") {
        zone.controlLevel = Math.min(100, zone.controlLevel + Math.round(zone.garrison * 0.05));
      }
      if (zone.threat > 0 && zone.garrison === 0 && zone.controlLevel > 0) {
        zone.controlLevel = Math.max(0, zone.controlLevel - Math.round(zone.threat * 0.02));
      }
      if (zone.controlLevel >= 80) { zone.status = "friendly"; zone.controllingFaction = "player"; }
      else if (zone.controlLevel >= 40) zone.status = "contested";
      else if (zone.controlLevel > 0) zone.status = "hostile";
      else if (zone.threat >= 80) zone.status = "devastated";
      else zone.status = "neutral";

      if (zone.status === "friendly" && zone.resourceBonus) {
        const pct = zone.controlLevel / 100;
        if (zone.resourceBonus.credits) { const zoneCredits = Math.round(zone.resourceBonus.credits * pct * 0.05); r.credits += zoneCredits; recordCreditsEarned(s, zoneCredits); zoneTributeTotal += zoneCredits; }
        if (zone.resourceBonus.steel) applyResourceDelta(s, "steel", Math.round(zone.resourceBonus.steel * pct * 0.05));
        if (zone.resourceBonus.fuel) applyResourceDelta(s, "fuel", Math.round(zone.resourceBonus.fuel * pct * 0.05));
        if (zone.resourceBonus.ammo) r.ammo += Math.round(zone.resourceBonus.ammo * pct * 0.05);
      }
    }

    // Task #473: surface the friendly-zone credit trickle as a tick entry so
    // the tick summary always sums to the actual credit delta.
    if (zoneTributeTotal > 0) {
      entries.push({ label: "Zone Tribute", delta: zoneTributeTotal, unit: "credits", reason: "Resource bonuses from friendly-held zones", severity: "positive" });
    }

    const totalGarrison = cbt.zones.reduce((sum, z) => sum + z.garrison, 0);
    const garrisonCreditCost = Math.floor(totalGarrison * 2);
    const garrisonAmmoCost = Math.floor(totalGarrison * 0.1);
    const garrisonFuelCost = Math.floor(totalGarrison * 0.05);
    if (garrisonCreditCost > 0) {
      r.credits -= garrisonCreditCost;
      entries.push({ label: "Garrison Upkeep", delta: -garrisonCreditCost, unit: "credits", reason: "Zone garrison maintenance", severity: "neutral" });
    }
    if (garrisonAmmoCost > 0 && r.ammo >= garrisonAmmoCost) {
      r.ammo -= garrisonAmmoCost;
      entries.push({ label: "Garrison Ammo", delta: -garrisonAmmoCost, unit: "ammo", reason: "Garrison ammunition consumption", severity: "neutral" });
    }
    if (garrisonFuelCost > 0 && r.fuel >= garrisonFuelCost) {
      r.fuel -= garrisonFuelCost;
      entries.push({ label: "Garrison Fuel", delta: -garrisonFuelCost, unit: "fuel", reason: "Garrison fuel consumption", severity: "neutral" });
    }

    if (cbt.battleLog.length > 50) cbt.battleLog = cbt.battleLog.slice(0, 50);
  }
  });

  // ─── BANKING: INTEREST & LOAN PAYMENTS ───────────────────────────────
  safeSub("Banking", entries, () => {
  if (s.banking) {
    const ticksPerDay = 4;
    const ticksPerMonth = ticksPerDay * 30;

    // Task #188: only clone if there's anything that can mutate this tick.
    // Most ticks won't trigger interest / loan payments (gated on
    // ticksPerMonth windows), so this avoids cloning every tick.
    const accounts = s.banking.accounts ?? [];
    const loans = s.banking.loans ?? [];
    const anyAcctEarns = accounts.some(
      (a: any) => a.balance > 0 && s.totalTicks - a.lastInterestTick >= ticksPerMonth,
    );
    const anyLoanTicks = loans.some((l: any) => l.remainingBalance > 0 && !l.defaulted);
    if (anyAcctEarns || anyLoanTicks) ensureBankingClone();

    for (const acct of s.banking.accounts) {
      if (acct.balance > 0 && s.totalTicks - acct.lastInterestTick >= ticksPerMonth) {
        const interest = Math.floor(acct.balance * acct.interestRate);
        acct.balance += interest;
        acct.lastInterestTick = s.totalTicks;
        s.banking.totalInterestEarned += interest;
        const acctBankName = getBankName(acct.bankId);
        entries.push({ label: "Savings Interest", delta: interest, unit: "credits", reason: `${acctBankName} deposit interest`, severity: "positive" });
      }
    }

    for (const loan of s.banking.loans) {
      if (loan.remainingBalance <= 0 || loan.defaulted) continue;
      loan.ticksRemaining = Math.max(0, loan.ticksRemaining - 1);

      if (s.totalTicks % ticksPerMonth === 0 && loan.remainingBalance > 0) {
        const payment = Math.min(loan.monthlyPayment, loan.remainingBalance);
        if (r.credits >= payment) {
          r.credits -= payment;
          loan.remainingBalance -= payment;
          s.banking.totalInterestPaid += Math.floor(payment * loan.interestRate);
          const loanBankName = getBankName(loan.bankId);
          entries.push({ label: "Loan Payment", delta: -payment, unit: "credits", reason: `${loanBankName} loan installment`, severity: "negative" });
        } else {
          s.banking.creditRating = Math.max(100, s.banking.creditRating - 10);
          if (loan.ticksRemaining <= 0) {
            loan.defaulted = true;
            const defaultBankName = getBankName(loan.bankId);
            entries.push({ label: "Loan Default", delta: 0, unit: "status", reason: `DEFAULTED on ${defaultBankName} loan — credit rating damaged`, severity: "warning" });
          }
        }
      }
    }
  }
  });

  // ─── AUTO RECONNAISSANCE ────────────────────────────────────────────
  safeSub("Auto Recon", entries, () => {
  if (s.intelligence?.autoRecon && s.totalTicks % 4 === 0) {
    const reconCost = s.intelligence.autoReconCostPerTick ?? 500;
    if (r.credits >= reconCost) {
      r.credits -= reconCost;
      entries.push({ label: "Auto Recon", delta: -reconCost, unit: "credits", reason: "Automated reconnaissance sweep", severity: "neutral" });

      const discoveryRoll = Math.random();
      if (discoveryRoll < 0.35) {
        const undiscoveredTownships = (s.townships ?? []).filter(t => t.status === "undiscovered");
        const inactiveMegacities = (s.externalMegacities ?? []).filter(m => !m.isActive);

        const allUndiscovered = [
          ...undiscoveredTownships.map(t => ({ type: "township" as const, item: t })),
          ...inactiveMegacities.map(m => ({ type: "megacity" as const, item: m })),
        ];

        if (allUndiscovered.length > 0) {
          const pick = allUndiscovered[Math.floor(Math.random() * allUndiscovered.length)];
          if (pick.type === "township") {
            s.townships = (s.townships ?? []).map(t =>
              t.id === pick.item.id ? { ...t, status: "neutral" as const } : t
            );
            entries.push({ label: "Discovery", delta: 1, unit: "township", reason: `Reconnaissance discovered ${pick.item.name}`, severity: "positive" });
            prependMessage({
              id: `recon-discovery-${s.totalTicks}-${pick.item.id}`,
              timestamp: { ...s.gameDate },
              tick: s.totalTicks,
              category: "intel" as const,
              title: `RECON: ${pick.item.name.toUpperCase()} DISCOVERED`,
              body: `Automated reconnaissance has located ${pick.item.name}. ${"description" in pick.item ? pick.item.description : "Details pending analysis."}`,
              read: false,
              priority: "high" as const,
            });
          } else {
            s.externalMegacities = s.externalMegacities.map(m =>
              m.id === pick.item.id ? { ...m, isActive: true } : m
            );
            entries.push({ label: "Discovery", delta: 1, unit: "megacity", reason: `Reconnaissance discovered ${pick.item.name}`, severity: "positive" });
            prependMessage({
              id: `recon-discovery-${s.totalTicks}-${pick.item.id}`,
              timestamp: { ...s.gameDate },
              tick: s.totalTicks,
              category: "intel" as const,
              title: `RECON: ${pick.item.name.toUpperCase()} LOCATED`,
              body: `Automated reconnaissance has established contact with ${pick.item.name}. ${"description" in pick.item ? pick.item.description : "Diplomatic channels now available."}`,
              read: false,
              priority: "high" as const,
            });
          }
        }
      }
    } else {
      entries.push({ label: "Auto Recon", delta: 0, unit: "status", reason: "Insufficient funds for reconnaissance sweep", severity: "warning" });
    }
  }
  });

  // ─── MINING OPERATIONS PROCESSING ──────────────────────────────────
  safeSub("Mining Operations", entries, () => {
  if (s.miningOperations && s.miningOperations.length > 0) {
    s.miningOperations = s.miningOperations.map((op: MiningOperation) => {
      if (!op.active || op.remainingDeposit <= 0) return op;
      if (op.shutdownUntilTick && s.totalTicks < op.shutdownUntilTick) return op;
      if (op.shutdownUntilTick && s.totalTicks >= op.shutdownUntilTick) {
        op = { ...op, shutdownUntilTick: undefined };
      }

      const vehicleBonus = Object.values(op.vehicles ?? {}).reduce((sum, count) => sum + count, 0);
      const jobBonus = Object.values(op.hiredJobs ?? {}).reduce((sum, count) => sum + count, 0);

      const efficiencyMult = (op.efficiency + vehicleBonus * 5 + jobBonus * 3) / 100;
      const actualOutput = Math.floor(op.output * efficiencyMult);
      const depletion = Math.max(1, Math.floor(actualOutput * op.depletionRate));

      const newDeposit = Math.max(0, op.remainingDeposit - depletion);
      const stockKey = `mineral_${op.resourceType}`;
      s.stockpiles[stockKey] = (s.stockpiles[stockKey] ?? 0) + actualOutput;

      return { ...op, remainingDeposit: newDeposit, active: newDeposit > 0 };
    });
  }

  if (s.miningOperations && s.miningOperations.length > 0 && s.totalTicks % 8 === 0 && Math.random() < 0.15) {
    const activeOps = s.miningOperations.filter((op: MiningOperation) => op.active && !op.shutdownUntilTick);
    if (activeOps.length > 0) {
      const targetOp = activeOps[Math.floor(Math.random() * activeOps.length)];
      const templates = MINING_EVENT_TEMPLATES;
      const template = templates[Math.floor(Math.random() * templates.length)];

      const evt: MiningEvent = {
        id: `mevt-${s.totalTicks}-${Math.random().toString(36).slice(2, 8)}`,
        operationId: targetOp.id,
        operationName: targetOp.name,
        type: template.type,
        title: template.title,
        description: template.description,
        severity: template.severity,
        tick: s.totalTicks,
        resolved: false,
      };

      s.miningEvents = [evt, ...(s.miningEvents ?? [])].slice(0, 20);

      s.miningOperations = s.miningOperations.map((op: MiningOperation) => {
        if (op.id !== targetOp.id) return op;
        let updated = { ...op };
        if (template.effects.efficiencyDelta) updated.efficiency = Math.max(10, Math.min(200, updated.efficiency + template.effects.efficiencyDelta));
        if (template.effects.depositBonus) updated.remainingDeposit += template.effects.depositBonus;
        if (template.effects.shutdownTicks) updated.shutdownUntilTick = s.totalTicks + template.effects.shutdownTicks;
        return updated;
      });

      if (template.effects.creditsDelta) {
        s.resources.credits += template.effects.creditsDelta;
        recordCreditsEarned(s, template.effects.creditsDelta);
      }

      entries.push({ label: "MINING EVENT", delta: 0, unit: "", reason: `${template.title} at ${targetOp.name}`, severity: template.severity === "positive" ? "positive" : "warning" });
    }
  }
  });

  safeSub("New Systems", entries, () => {
    runNewSystemTicks(s, entries);
  });

  safeSub("District Expansion", entries, () => {
    processExpansionTick(s, entries);
  });

  safeSub("Human Consequences", entries, () => {
    processHumanConsequences(s, entries);
  });

  safeSub("Demographics", entries, () => {
    updateDemographics(s);
  });

  // Task #367: after every stat processor has settled for the tick, fire any
  // one-time "crossed into a better band" advisories (crime, happiness). Placed
  // last so it reads the tick's final stat values. Idempotent per band via the
  // durable last-seen ranks on state. See tickProcessors.emitStatBandImprovements.
  safeSub("Stat Milestones", entries, () => {
    emitStatBandImprovements(s);
  });

  // Task #552: after the stat processors have settled, fire the one-time hint
  // that explains why the golden-age stories stay locked when the city clears
  // every core thriving bar but the biosphere floor or housing-pressure cap
  // still blocks the prosperity pool. Idempotent via the durable
  // prosperityGateHintShown flag. See tickProcessors.emitProsperityGateHint.
  safeSub("Prosperity Gate Hint", entries, () => {
    emitProsperityGateHint(s);
  });

  safeSub("Prosperity Recovery News", entries, () => {
    emitProsperityGateRecoveryNews(s);
  });

  // Task #430: after the power block and stat processors have settled, fire the
  // one-time imminent-brownout advisory when the power ETA first drops into the
  // warn window, so a player not on the overview still gets a heads-up before the
  // grid browns out. Idempotent per low-power episode via the durable
  // powerBrownoutWarned flag. See tickProcessors.emitPowerBrownoutWarning.
  safeSub("Power Warning", entries, () => {
    emitPowerBrownoutWarning(s);
  });

  // Per-tick defense in depth: cap pooled resources to MAX_RESOURCE before
  // sanitizeState runs. The sanitizer also clamps these on every save load,
  // but pinning the ceiling here mirrors the population guard above and
  // prevents a runaway intra-tick value from briefly leaking into entries
  // / event handlers / UI selectors before sanitization. Credits and power
  // can swing negative (deficits / drain > generation), so they're symmetric.
  if (r.credits > MAX_RESOURCE) r.credits = MAX_RESOURCE;
  else if (r.credits < -MAX_RESOURCE) r.credits = -MAX_RESOURCE;
  if (r.food > MAX_RESOURCE) r.food = MAX_RESOURCE;
  if (r.water > MAX_RESOURCE) r.water = MAX_RESOURCE;
  if (r.steel > MAX_RESOURCE) r.steel = MAX_RESOURCE;
  if (r.fuel > MAX_RESOURCE) r.fuel = MAX_RESOURCE;
  if (r.goods > MAX_RESOURCE) r.goods = MAX_RESOURCE;
  if (r.medSupplies > MAX_RESOURCE) r.medSupplies = MAX_RESOURCE;
  if (r.ammo > MAX_RESOURCE) r.ammo = MAX_RESOURCE;
  if (r.power > MAX_POWER_MAGNITUDE) r.power = MAX_POWER_MAGNITUDE;
  else if (r.power < -MAX_POWER_MAGNITUDE) r.power = -MAX_POWER_MAGNITUDE;

  // Task #188: flush all queued message prepends in a single splice.
  // Reverse so the first prependMessage call ends up at index 0 (mirrors
  // the behavior of the old `[msg, ...s.messages]` pattern).
  if (pendingMessages.length > 0) {
    const merged = pendingMessages.reverse().concat(s.messages);
    s.messages = merged.length > ARRAY_CAPS.messages
      ? merged.slice(0, ARRAY_CAPS.messages)
      : merged;
  }

  // Every infrastructure mutation above went through the ledger helper. Do
  // one final mirror refresh so downstream sanitization and callers never see
  // a stale legacy percentage.
  const mirrored = withInfrastructureLedger(
    s,
    s.infrastructureLedger ?? createInfrastructureLedger(s, s.cityStats.infrastructureHealth),
  );
  s.infrastructureLedger = mirrored.infrastructureLedger;
  s.cityStats.infrastructureHealth = mirrored.cityStats.infrastructureHealth;

  // Task #188 item #6: avoid the full top-of-tick + end-of-tick double
  // walk by collapsing the *top-of-tick* clone storms (item #1 — see
  // `ensureXClone` helpers above), so sanitize is the only full-state
  // pass per tick. Full sanitize stays on every tick for parity-test
  // correctness; sampling drifted population rounding by tens of
  // credits per tick, breaking processMissedTicks parity. The cheaper
  // `sanitizeStateLight` path is exported from sanitizer.ts for
  // explicit opt-in callers / future regression-test harnesses.
  // Profiled as its own section (Task #200) — sanitize is the one full-state
  // pass per tick and a prime suspect for late-game stutter, but it lives
  // outside the safeSub wrapper, so bracket it explicitly. Same zero-cost
  // gating as safeSub.
  // Sanitization is intentionally the final containment boundary too. A
  // malformed persisted record must not turn an otherwise isolated subsystem
  // failure into a thrown tick (for example, a hostile getter in a corrupted
  // mega-project record can be reached by the legacy-content scrubber).
  let sanitized: GameState = s;
  safeSub("Sanitize", entries, () => {
    // Legacy catalog scrubbing belongs at save/import boundaries; doing that
    // recursive walk on every live tick made the sanitizer dominate the tick
    // budget without adding protection to already in-memory records.
    sanitized = sanitizeState(s, { scrubLegacy: false });
  });

  return { newState: sanitized, entries };
}


/**
 * Hard sanity cap on missed ticks reported by `calculateMissedTicks`. Set to
 * 30 days of 15-minute ticks (= 2880) so that a clock-skewed device or a
 * months-old save doesn't overflow into millions of ticks. Downstream,
 * `processMissedTicks` fully simulates the first
 * `PROCESS_MISSED_TICKS_BATCH_LIMIT` (currently 1500) and extrapolates the
 * remainder, so values up to this cap are handled correctly.
 *
 * Previously this was hard-capped at 24 ticks (= 6 h at 15 min interval),
 * which made the v2.4.0 BATCH_LIMIT raise to 1500 unreachable for any real
 * resume.
 */
export const MAX_OFFLINE_MISSED_TICKS = 30 * 24 * 60 / 15; // = 2880

export function calculateMissedTicks(lastTickTime: number, intervalMinutes: number = 15): number {
  const intervalMs = intervalMinutes * 60 * 1000;
  const elapsed = Date.now() - lastTickTime;
  if (elapsed <= 0) return 0;
  return Math.min(Math.floor(elapsed / intervalMs), MAX_OFFLINE_MISSED_TICKS);
}

function updateDemographics(s: GameState): void {
  const d = s.demographics;
  const cs = s.cityStats;
  const pop = cs.population;
  const bldg = s.buildings as Record<string, number>;
  const unit = s.units as Record<string, number>;

  d.totalPopulation = pop;
  d.employmentRate = cs.employment;
  d.unemploymentRate = 100 - cs.employment;

  // Keep all population-group counts on the one shared derivation path.
  // The scalar fields remain for save/UI compatibility; the nested snapshot
  // makes the downstream capacity effects explicit and inspectable.
  const cohorts = computePopulationCohorts(s);
  d.populationCohorts = cohorts;
  // Compatibility mirror only. Aggregate custody is authoritative.
  s.crimeStats.prisonPopulation = cohorts.prisoners;

  const employed = Math.round(cohorts.workforceCapacity * (cs.employment / 100));
  d.totalWorkforce = cohorts.workforceCapacity;

  d.industrialWorkforce = Math.round(employed * 0.23) +
    (b(bldg, "megaManufacturingPlants") * 500) +
    (b(bldg, "metalFoundryComplexes") * 300) +
    (b(bldg, "automatedAssemblyLines") * 400) +
    (u(unit, "factoryWorkerCrews") + u(unit, "materialsProcessingTeams") + u(unit, "miningCrews")) * 10;

  d.serviceWorkforce = Math.round(employed * 0.35) +
    (b(bldg, "syntheticFoodPlants") * 60) +
    (b(bldg, "supplyChainDistributionCenters") * 20);

  d.governmentWorkforce = Math.round(employed * 0.09) +
    (b(bldg, "bureaucraticAdminCenters") * 80) +
    (b(bldg, "civicEducationInstitutes") * 40);

  d.researchWorkforce = Math.round(employed * 0.03) +
    (b(bldg, "advancedResearchLabs") * 100) +
    (u(unit, "researchScientists") + u(unit, "cyberneticsResearchers") + u(unit, "experimentalPhysicsTeams")) * 5;

  d.securityWorkforce =
    (u(unit, "patrolJudges") + u(unit, "seniorJudges") + u(unit, "rookieJudgeCadets") + u(unit, "streetPatrolUnits") + u(unit, "eliteJudgeStrikeTeams")) * 10 +
    (u(unit, "cityDefenseInfantry") + u(unit, "armoredResponseUnits") + u(unit, "heavyWeaponsSquads") + u(unit, "riotPoliceSquads")) * 10;

  d.infrastructureWorkforce = Math.round(employed * 0.12) +
    (u(unit, "infrastructureRepairTeams") + u(unit, "utilityMaintenanceSquads")) * 10 +
    (b(bldg, "waterPurificationStations") * 15) +
    (b(bldg, "fusionMicroReactors") * 20);

  d.blackMarketWorkforce = Math.round(pop * (cs.crime / 100) * 0.07);

  // The authoritative homeless count is the real shelter shortfall — the
  // population beyond total housing capacity, floored at zero — NOT a share of
  // the smoothed housingPressure signal (which saturates at 100 and flagged the
  // whole city homeless). A well-housed city (capacity >= population) reads 0.
  d.homelessPopulation = cohorts.homeless;
  d.prisonPopulation = cohorts.prisoners;
  d.refugeePopulation = cohorts.refugees;
  d.transientPopulation = Math.round(pop * 0.015) + (s.tourism?.touristCount ?? 0);
  d.integratedRefugees = s.integratedRefugees ?? 0;

  const popGrowthSign = cs.populationGrowthRate >= 0 ? 1 : -1;
  d.populationGrowthRate = Math.abs(cs.populationGrowthRate) * popGrowthSign * 0.01;
  d.birthRate = Math.max(0.5, 1.8 + (cs.happiness - 50) * 0.02 - (cs.diseaseRisk * 0.01));
  d.deathRate = Math.max(0.3, 1.2 + (cs.diseaseRisk * 0.02) - (cs.publicHealth * 0.005));
  d.immigrationRate = s.immigrationBanned || s.bordersClosed ? 0 : Math.max(0, 0.8 + (cs.happiness - 50) * 0.015);
  d.emigrationRate = Math.max(0, 0.4 + (cs.unrest * 0.01) + (cs.crime * 0.005) - (cs.happiness * 0.005));

  d.lowIncomePopulation = Math.round(pop * Math.max(0.2, 0.60 - cs.employment * 0.002));
  d.middleIncomePopulation = Math.round(pop * Math.min(0.50, 0.30 + cs.employment * 0.002));
  d.highIncomePopulation = Math.max(0, pop - d.lowIncomePopulation - d.middleIncomePopulation);
  d.corporateCitizens = Math.round(d.highIncomePopulation * 0.15);
  d.independentTraders = Math.round(pop * 0.009);
  d.registeredBusinesses = Math.round(pop * 0.004) + b(bldg, "supplyChainDistributionCenters") * 5;
  d.averageCitizenIncome = Math.round(800 + cs.employment * 8 + (cs.happiness * 2));
  d.consumerSpendingIndex = clamp(Math.round(40 + cs.employment * 0.3 + cs.happiness * 0.2 - cs.unrest * 0.1), 0, 100);
  d.savingsRate = clamp(Math.round(5 + cs.employment * 0.1 - cs.crime * 0.05), 0, 50);
  d.debtLevel = clamp(Math.round(60 - cs.employment * 0.2 + cs.unrest * 0.1), 0, 100);

  d.crimeParticipationRate = clamp(Math.round(cs.crime * 0.3), 0, 100);
  d.gangAffiliationRate = clamp(Math.round(cs.crime * 0.15), 0, 100);
  d.politicalActivismRate = clamp(Math.round(10 + cs.unrest * 0.2 + (100 - cs.happiness) * 0.1), 0, 100);
  d.publicSatisfactionIndex = clamp(Math.round(cs.happiness * 0.8 + cs.employment * 0.2 - cs.crime * 0.1), 0, 100);
  d.unrestPotentialIndex = clamp(Math.round(cs.unrest * 0.6 + cs.crime * 0.2 + (100 - cs.happiness) * 0.2), 0, 100);
  d.fearIndex = clamp(Math.round(30 + cs.crime * 0.3 + cs.unrest * 0.2 - cs.lawOrder * 0.2), 0, 100);
  d.loyaltyIndex = clamp(Math.round(cs.happiness * 0.4 + cs.lawOrder * 0.3 - cs.corruption * 0.3), 0, 100);
  d.civicEngagementLevel = clamp(Math.round(cs.education * 0.3 + cs.happiness * 0.2 - cs.crime * 0.1), 0, 100);
  d.corruptionExposureRate = clamp(Math.round(cs.corruption * 0.5 + cs.crime * 0.1), 0, 100);
  d.mediaInfluenceLevel = clamp(Math.round(50 + cs.education * 0.2 - cs.corruption * 0.15), 0, 100);

  d.publicHealthIndex = clamp(Math.round(cs.publicHealth * 0.7 + cs.employment * 0.1 - cs.diseaseRisk * 0.3), 0, 100);
  d.hospitalCapacityUsage = clamp(Math.round(60 + cs.diseaseRisk * 0.4 - b(bldg, "publicHealthMegaClinics") * 3), 0, 100);
  d.diseaseInfectionRate = clamp(Math.round(cs.diseaseRisk * 0.5), 0, 100);
  d.nutritionLevel = clamp(Math.round(50 + (s.resources.food > 1000 ? 20 : s.resources.food > 500 ? 10 : -10) + cs.publicHealth * 0.2), 0, 100);
  d.sanitationAccessRate = clamp(Math.round(50 + cs.infrastructureHealth * 0.3 + cs.publicHealth * 0.1), 0, 100);
  d.averageLifeExpectancy = Math.round(45 + cs.publicHealth * 0.2 + cs.employment * 0.05 - cs.crime * 0.03 - cs.diseaseRisk * 0.08);
  d.medicalCoverageRate = clamp(Math.round(30 + b(bldg, "publicHealthMegaClinics") * 5 + cs.publicHealth * 0.3), 0, 100);
  d.mentalHealthStressIndex = clamp(Math.round(40 + cs.unrest * 0.2 + cs.crime * 0.15 + (100 - cs.happiness) * 0.15), 0, 100);
  d.emergencyResponseCoverage = clamp(Math.round(40 + (u(unit, "emergencyMedicalTeams") + u(unit, "fieldHospitalUnits")) * 3 + b(bldg, "publicHealthMegaClinics") * 4), 0, 100);
  d.populationHappinessIndex = clamp(Math.round(cs.happiness * 0.9 + cs.employment * 0.1), 0, 100);

  d.clonePopulation = (b(bldg, "cloningFacilities") ?? 0) * 50;
  d.cloneWorkers = Math.round(d.clonePopulation * 0.6);
  d.cloneSoldiers = Math.round(d.clonePopulation * 0.3);
  d.clonedPets = (b(bldg, "cloningFacilities") ?? 0) * 10;
  d.clonedLivestock = (b(bldg, "cloningFacilities") ?? 0) * 20;
  d.clonedOrgansStockpile = (b(bldg, "cloningFacilities") ?? 0) * 30 + (b(bldg, "cyberSurgeryHospitals") ?? 0) * 10;
  d.deExtinctSpecies = Math.min(12, (b(bldg, "cloningFacilities") ?? 0));
  d.geneticModifiedCitizens = (b(bldg, "augmentationClinics") ?? 0) * 80 + (b(bldg, "cyberSurgeryHospitals") ?? 0) * 40;
  d.chimeraOrganisms = Math.round(d.geneticModifiedCitizens * 0.05);
  d.blacksiteProjects = Math.min(10, Math.round(cs.corruption * 0.05) + (b(bldg, "cloningFacilities") ?? 0));

  const combatPopLosses = s.combat?.totalPopulationLosses ?? 0;
  d.totalDeaths = (s.humanConsequences?.totalCivilianDeaths ?? d.totalDeaths ?? 0)
    + (s.humanConsequences?.totalMilitaryDeaths ?? 0);

  d.literacyRate = clamp(Math.round(30 + cs.education * 0.5 + cs.employment * 0.1 - (100 - cs.publicHealth) * 0.05), 0, 100);
  d.substanceAbuseRate = clamp(Math.round(10 + cs.crime * 0.15 + cs.unrest * 0.1 + (100 - cs.happiness) * 0.1 - cs.publicHealth * 0.05), 0, 60);

  const orphanBase = Math.round(pop * (d.deathRate / 1000) * 0.15 * 4);
  d.orphanPopulation = Math.max(0, Math.round(orphanBase + combatPopLosses * 0.3));

  const reclaimedCount = s.districtExpansion?.totalReclaimed ?? 0;
  d.displacedByExpansion = Math.round(reclaimedCount * 180);

  d.organDonorRegistry = Math.round(pop * 0.008) + (d.clonedOrgansStockpile * 2);
}

/**
 * Default cap on fully-simulated ticks during offline catch-up. Anything
 * beyond this is handled by the rate-extrapolation block at the bottom of
 * `processMissedTicks`. Engine perf is ~1.7-2.3 ms/tick (see
 * perfStress.test.ts), so 1500 ticks ≈ ~3 s wall-clock — acceptable for an
 * offline catch-up that runs once on resume. Raised from 6 to 1500 to give
 * events, faction dynamics, faith/policy side effects, etc. real time to
 * fire during typical absences (a 15 min tick interval × 1500 ticks ≈
 * 15 days).
 *
 * Exported so tests can either match production behavior or, by passing
 * the optional `batchLimit` argument to `processMissedTicks`, exercise the
 * extrapolation block in isolation without first running thousands of
 * live ticks that swamp the signal.
 */
export const PROCESS_MISSED_TICKS_BATCH_LIMIT = 1500;

// Caps on how many subsystem failures the catch-up report surfaces. Dedupe by
// subsystem+message already collapses a system that throws the SAME error every
// tick into one entry, but a subsystem that throws a message containing a value
// that changes each tick (an id, a counter, a timestamp) would defeat the
// dedupe and could push thousands of near-identical rows into the report. These
// caps bound the rendered list: at most CATCHUP_ERRORS_PER_SUBSYSTEM distinct
// messages per subsystem and CATCHUP_ERRORS_TOTAL distinct entries overall. Any
// suppressed errors are summarized in a single trailing "+N more" entry.
export const CATCHUP_ERRORS_PER_SUBSYSTEM = 3;
export const CATCHUP_ERRORS_TOTAL = 12;
export const CATCHUP_ERRORS_OVERFLOW_SUBSYSTEM = "More";
// On-screen we only show the bounded list above, but for a bug report the
// suppressed variants are often the most useful signal (a subsystem failing
// with an ever-changing message). We retain a capped, deduped SAMPLE of those
// suppressed errors so the "Copy report" export can include them without the
// modal ever rendering a huge list. The cap keeps memory/clipboard bounded
// even for a pathological multi-thousand-tick catch-up.
export const CATCHUP_ERRORS_SUPPRESSED_SAMPLE = 50;

export function processMissedTicks(
  state: GameState,
  count: number,
  batchLimit: number = PROCESS_MISSED_TICKS_BATCH_LIMIT,
): {
  newState: GameState;
  allEntries: TickEntry[][];
  tickErrors: TickSubsystemError[];
  // Deduped sample of errors that were suppressed from `tickErrors` (capped at
  // CATCHUP_ERRORS_SUPPRESSED_SAMPLE). Empty when nothing was suppressed.
  suppressedErrors: TickSubsystemError[];
  // Total count of suppressed error occurrences across the batch (mirrors the
  // "+N more suppressed" overflow summary). May exceed suppressedErrors.length,
  // which is a deduped, capped sample.
  suppressedCount: number;
} {
  const BATCH_LIMIT = batchLimit;
  let current = { ...state };
  const allEntries: TickEntry[][] = [];
  // Aggregate subsystem failures across the WHOLE batch. runTick() resets
  // the module-global _lastTickErrors at the start of every tick, so unless
  // we snapshot getLastTickErrors() immediately after each tick the data is
  // lost when the next tick begins — which is exactly why offline catch-up
  // used to swallow everything but the final tick's errors. Dedupe by
  // subsystem+message so a system that fails on every one of (potentially
  // thousands of) catch-up ticks surfaces once, not thousands of times.
  const tickErrorMap = new Map<string, TickSubsystemError>();
  const tickErrorPerSubsystem = new Map<string, number>();
  let tickErrorsSuppressed = 0;
  // Deduped sample of suppressed errors retained for the bug-report export
  // only (never rendered on screen). Bounded by CATCHUP_ERRORS_SUPPRESSED_SAMPLE
  // and deduped via tickErrorSuppressedSeen so an ever-changing message still
  // contributes distinct samples without unbounded growth.
  const suppressedSample: TickSubsystemError[] = [];
  const tickErrorSuppressedSeen = new Set<string>();
  const ticksToRun = Math.min(count, BATCH_LIMIT);

  for (let i = 0; i < ticksToRun; i++) {
    const { newState, entries } = runTick(current);
    current = newState;
    for (const err of getLastTickErrors()) {
      const key = `${err.subsystem}\u0000${err.error}`;
      if (tickErrorMap.has(key)) continue;
      // Bound the rendered list so a subsystem emitting an ever-changing
      // message can't defeat the dedupe and produce an unbounded report.
      const perSub = tickErrorPerSubsystem.get(err.subsystem) ?? 0;
      if (perSub >= CATCHUP_ERRORS_PER_SUBSYSTEM || tickErrorMap.size >= CATCHUP_ERRORS_TOTAL) {
        tickErrorsSuppressed++;
        // Retain a deduped, capped sample for the bug-report export only.
        if (
          suppressedSample.length < CATCHUP_ERRORS_SUPPRESSED_SAMPLE &&
          !tickErrorSuppressedSeen.has(key)
        ) {
          tickErrorSuppressedSeen.add(key);
          suppressedSample.push(err);
        }
        continue;
      }
      tickErrorMap.set(key, err);
      tickErrorPerSubsystem.set(err.subsystem, perSub + 1);
    }
    try {
      const eff = applyPartnerAndPlayerTickEffects(current);
      current = {
        ...eff.state,
        messages: [...eff.alerts, ...(eff.state.messages ?? [])].slice(0, ARRAY_CAPS.messages),
      };
    } catch (e) {
      console.warn("[MISSED-TICK] Partner/hostile effects failed:", e);
    }
    // City-end check runs AFTER partner effects so hostile strikes
    // that drove pop to zero this tick are reflected immediately.
    try {
      processEndStateCheck(current, entries);
    } catch (e) {
      console.warn("[MISSED-TICK] End-state check failed:", e);
    }
    allEntries.push(entries);
  }

  if (count > BATCH_LIMIT) {
    const skipped = count - BATCH_LIMIT;
    const r = current.resources;
    const rates = current.rates;
    // Apply same bureaucratic-overhead deduction used in runTick so fast-forward
    // doesn't overpay vs live ticks. Mirrors logic in the INCOME block above.
    const netTax = computeTaxAfterOverhead(rates.taxIncome, current.cityStats.population).net;
    // Mirror port-congestion soft cap from runTick so fast-forward and live
    // ticks agree on net trade revenue.
    const netTrade = computeTradeAfterCongestion(rates.tradeIncome, current.cityStats.population).net;
    // Mirror mining-policy income from runTick. Without this, fast-forward
    // dramatically underpays late-game cities running these policies.
    const miningSkip = computeMiningPolicyIncome(current.activeMiningPolicies, rates.steelProduction);
    const miningPolicyIncome = miningSkip.reclamationTax + miningSkip.blackMarketOre;
    // Mirror active-edict per-tick credit and trade-income effects from
    // runTick. The skipped extrapolation has to honor active edicts for the
    // remaining tick window (clamped per-edict to its actual remaining
    // duration), otherwise long offline periods short-change the player on
    // any edict that pays out per tick. We also advance the edict lifecycle
    // (decrement ticksRemaining, expire, set cooldown) so the post-skip state
    // matches what the live tick path would produce after the same elapsed
    // ticks — preventing edicts from persisting beyond their design duration.
    let edictCreditsTotal = 0;
    // Gross POSITIVE edict income only — the lifetime-earned stat must mirror
    // runTick, where each edict credit component is booked through
    // recordCreditsEarned (which no-ops on ≤0). A negative edict effect lowers
    // the spendable balance but must NOT cancel out positive earnings in the
    // career/Steam "total credits earned" tally.
    let edictCreditsGrossPositive = 0;
    if (current.activeEdicts && current.activeEdicts.length > 0) {
      const survivingEdicts: typeof current.activeEdicts = [];
      const cooldowns = { ...(current.edictCooldowns ?? {}) };
      for (const ae of current.activeEdicts) {
        const def = getEdictById(ae.edictId);
        if (!def) continue;
        const fx = def.effects;
        const edictTicks = Math.max(0, Math.min(skipped, ae.ticksRemaining));
        // Mirror exactly what runTick adds per active tick: fx.credits AND
        // fx.creditsPerTick AND fx.tradeIncome (the post-income-block fix).
        const perTick = (fx.credits ?? 0) + (fx.creditsPerTick ?? 0) + (fx.tradeIncome ?? 0);
        if (perTick !== 0 && edictTicks > 0) {
          edictCreditsTotal += perTick * edictTicks;
        }
        // Per-component positive sum, matching runTick's per-effect
        // recordCreditsEarned calls (each guarded to positive grants).
        const perTickPositive =
          Math.max(0, fx.credits ?? 0) +
          Math.max(0, fx.creditsPerTick ?? 0) +
          Math.max(0, fx.tradeIncome ?? 0);
        if (perTickPositive > 0 && edictTicks > 0) {
          edictCreditsGrossPositive += perTickPositive * edictTicks;
        }
        const newRemaining = ae.ticksRemaining - skipped;
        if (newRemaining > 0) {
          survivingEdicts.push({ ...ae, ticksRemaining: newRemaining });
        } else {
          // Expired during the skipped window — apply cooldown matching runTick.
          // In runTick, expiry happens on the tick where the post-decrement
          // ticksRemaining hits 0; cooldown is set with that tick's totalTicks.
          // If pre-catchup ticksRemaining=N, the expiry tick is offset (N-1)
          // from current.totalTicks (which has been advanced past live ticks).
          const expiredAtTick = (current.totalTicks ?? 0) + Math.max(0, ae.ticksRemaining - 1);
          cooldowns[ae.edictId] = expiredAtTick + def.cooldownTicks;
        }
      }
      current.activeEdicts = survivingEdicts;
      current.edictCooldowns = cooldowns;
    }
    const extrapolatedCredits = (netTax + netTrade + miningPolicyIncome) * skipped + edictCreditsTotal;
    r.credits += extrapolatedCredits;
    // Book the extrapolated fast-forward income into the lifetime gross-income
    // tally too, mirroring the per-tick recordCreditsEarned calls in runTick.
    // netTax/netTrade/miningPolicyIncome are already clamped ≥0 (the exact
    // amounts runTick credits), and edict income is summed as gross-positive so
    // a negative edict drains the balance without erasing earned income.
    const extrapolatedCreditsEarned =
      (netTax + netTrade + miningPolicyIncome) * skipped + edictCreditsGrossPositive;
    recordCreditsEarned(current, extrapolatedCreditsEarned);
    applyResourceDelta(current, "steel", rates.steelProduction * skipped);
    applyResourceDelta(current, "fuel", rates.fuelProduction * skipped);
    applyResourceDelta(current, "goods", (rates.goodsProduction - rates.goodsConsumption) * skipped);
    const medicalConsumption = applyResourceDelta(
      current,
      "medSupplies",
      -getMedicalSupplyConsumption(current) * skipped,
    );
    const medicalProduction = applyResourceDelta(current, "medSupplies", rates.medProduction * skipped);
    if (medicalProduction.rejected > 0) {
      allEntries.push([{
        label: "Medical Supplies (while away)",
        delta: medicalConsumption.applied + medicalProduction.applied,
        unit: "units",
        reason: `${summarizeMedicalStorageGain(medicalProduction)} -${Math.max(0, -medicalConsumption.applied)} consumed across ${skipped} missed ticks.`,
        severity: "warning",
      }]);
    }
    applyResourceDelta(current, "food", -rates.foodConsumption * skipped);
    applyResourceDelta(current, "food", rates.foodProduction * skipped);
    r.water += (rates.waterProduction - rates.waterConsumption) * skipped;
    r.ammo += (rates.ammoProduction ?? 0) * skipped;
    applyResourceDelta(
      current,
      "power",
      (rates.powerGeneration - rates.powerDrain) * skipped,
    );
    if (r.credits < 0) r.credits = 0;
    if (r.steel < 0) r.steel = 0;
    if (r.fuel < 0) r.fuel = 0;
    if (r.goods < 0) r.goods = 0;
    if (r.food < 0) r.food = 0;
    if (r.water < 0) r.water = 0;
    if (r.ammo < 0) r.ammo = 0;
    if (r.power < 0) r.power = 0;
    // Floor medSupplies too — it's used as a `<= 0` gate in healthDelta
    // (line ~1478) but isn't actually extrapolated in this block, so a
    // pre-existing negative drift carried in from the live tick path
    // would otherwise survive the catchup. Mirror the other resources
    // for symmetry / future-proofing.
    if (r.medSupplies < 0) r.medSupplies = 0;
    // Defense in depth: cap each resource after the offline-catchup
    // extrapolation (`rate * skipped` for up to 2,880 missed ticks) so
    // a high late-game rate combined with a long absence can't produce
    // a value the formatter renders as "MAX". Mirrors MAX_RESOURCE in
    // sanitizer.ts (kept inline to avoid a circular import).
    const RESOURCE_CEILING = 100_000_000_000_000;
    if (r.credits > RESOURCE_CEILING) r.credits = RESOURCE_CEILING;
    if (r.steel > RESOURCE_CEILING) r.steel = RESOURCE_CEILING;
    if (r.fuel > RESOURCE_CEILING) r.fuel = RESOURCE_CEILING;
    if (r.goods > RESOURCE_CEILING) r.goods = RESOURCE_CEILING;
    if (r.food > RESOURCE_CEILING) r.food = RESOURCE_CEILING;
    if (r.water > RESOURCE_CEILING) r.water = RESOURCE_CEILING;
    if (r.ammo > RESOURCE_CEILING) r.ammo = RESOURCE_CEILING;
    if (r.power > RESOURCE_CEILING) r.power = RESOURCE_CEILING;
    if (r.medSupplies > RESOURCE_CEILING) r.medSupplies = RESOURCE_CEILING;
    let date = current.gameDate;
    for (let i = 0; i < skipped; i++) {
      date = advanceHour(date);
    }
    current.gameDate = date;
    current.totalTicks = (current.totalTicks ?? 0) + skipped;

    // Coarse NPC dynamics + world events pass during fast-forward so the world
    // doesn't feel frozen on resume. Run one pass per ~12 skipped ticks, capped
    // to 8 passes total to avoid alert spam from very long absences.
    try {
      const passes = Math.min(8, Math.max(1, Math.floor(skipped / 12)));
      const offlineAlerts: GameMessage[] = [];
      let mc = current.externalMegacities ?? [];
      let tw = current.townships ?? [];
      for (let p = 0; p < passes; p++) {
        mc = mc.map((m) => refreshPartnerDynamics(m, current));
        tw = tw.map((t) => refreshPartnerDynamics(t, current));
        const dyn = { ...current, externalMegacities: mc, townships: tw };
        const npcRes = processNpcWorldEvents(dyn);
        current = npcRes.state;
        for (const a of npcRes.alerts) offlineAlerts.push(a);
        if (offlineAlerts.length >= 5) break;
      }
      current = {
        ...current,
        externalMegacities: mc,
        townships: tw,
        messages: [...offlineAlerts.slice(0, 5), ...(current.messages ?? [])].slice(0, ARRAY_CAPS.messages),
      };
      if (offlineAlerts.length > 0) {
        allEntries.push([{ label: `World events while away`, delta: offlineAlerts.length, unit: "alerts", reason: "NPC dynamics + war declarations during fast-forward", severity: "neutral" }]);
      }
    } catch (e) {
      console.warn("[MISSED-TICK] Offline NPC dynamics failed:", e);
    }

    allEntries.push([{ label: `Fast-forwarded ${skipped} ticks`, delta: skipped, unit: "ticks", reason: "Resources extrapolated from rates", severity: "neutral" }]);
  }

  const tickErrors = Array.from(tickErrorMap.values());
  if (tickErrorsSuppressed > 0) {
    tickErrors.push({
      subsystem: CATCHUP_ERRORS_OVERFLOW_SUBSYSTEM,
      error: `+${tickErrorsSuppressed} more similar error${tickErrorsSuppressed === 1 ? "" : "s"} suppressed`,
    });
  }
  return {
    newState: current,
    allEntries,
    tickErrors,
    suppressedErrors: suppressedSample,
    suppressedCount: tickErrorsSuppressed,
  };
}

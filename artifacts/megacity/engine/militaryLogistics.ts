// Task #381 — Standing army, military supply & vehicles.
//
// One cohesive per-tick processor that turns the previously-cosmetic military
// systems into a real logistics loop:
//
//   personnel (troops, derived from s.units)  ─┐
//                                              ├─► man installations + crew vehicles
//   installations you build (installationsBuilt)┘        │
//                                                        ▼
//   manned production installations ──► supply (ammo / fuel / rations)
//                                                        │
//                          net supply + morale + doctrine ─► readiness
//                                                        │
//   readiness  ─► combatReadinessMod (applied to combat strength in formulas)
//   crew (people) ─► fleetOperational  (HARD gate: no crew ⇒ no vehicle value)
//   fuel + serviceability ─► fleetOperational (soft factors)
//   manned installations ─► installationDefenseBonus (feeds cs.defenseRating)
//
// DESIGN RULES (verified against the engine + reviewed):
//  • PERSONNEL are the constraining resource. Crew coverage is the sole ZERO
//    gate: an un-crewed vehicle / un-manned installation contributes ~nothing.
//    Fuel and serviceability are SOFT factors with a floor.
//  • NEUTRALITY: with full crew + full serviceability + fuel supply within the
//    free baseline, every derived factor is 1.0, so a well-supplied army fights
//    exactly like it does today. combatReadinessMod is centred on the default
//    readiness (50) for the same reason.
//  • NO new ammo/fuel DRAIN here — the economy already charges military ammo
//    (formulas.ts AMMO DRAIN) and fuel (formulas.ts fuelConsumption + garrison
//    costs). We add PRODUCTION and READ shortages; only rations are drawn here.
//  • Every field written here is inert until READ in runTick. formulas.ts reads
//    combatReadinessMod, fleetOperational and installationDefenseBonus.

import type { GameState, TickEntry } from "@/engine/types";
import { computeInstallationBuildingUpkeep } from "@/engine/economyBreakdown";
import {
  createDefaultMilitaryState,
  createDefaultLogisticsState,
  MILITARY_POLICIES,
  type StandingArmy,
  type MilitaryLogisticsState,
} from "@/engine/militaryOverhaul";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import { applyResourceDelta } from "@/engine/resourceStorage";
import { getAcademy } from "@/engine/militaryAcademies";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─────────────────────────────────────────────────────────────────────────────
// Static maps (built once at module load — keep per-tick work allocation-light).
// ─────────────────────────────────────────────────────────────────────────────

// Vehicles / aircraft: equipment that needs CREW (people) and FUEL to operate.
// `crew` = personnel (headcount) required per unit; `fuel` = fuel/tick per unit
// when kept ready. These are the units the player thinks of as "the motor pool".
export const VEHICLE_SPECS: Record<string, { crew: number; fuel: number }> = {
  // Ground vehicles
  patrolBikes: { crew: 1, fuel: 2 },
  patrolCars: { crew: 2, fuel: 2 },
  judgeMotorcycles: { crew: 1, fuel: 3 },
  armoredRiotVehicles: { crew: 3, fuel: 4 },
  tacticalResponseAPCs: { crew: 3, fuel: 5 },
  armoredPersonnelCarriers: { crew: 4, fuel: 6 },
  transportHaulers: { crew: 2, fuel: 3 },
  droneCarrierTrucks: { crew: 2, fuel: 2 },
  armoredResponseUnits: { crew: 3, fuel: 3 },
  heavyRiotMechUnits: { crew: 2, fuel: 3 },
  tacticalCombatDrones: { crew: 1, fuel: 2 },
  // Aircraft
  surveillanceHelicopters: { crew: 2, fuel: 5 },
  judgeGunships: { crew: 3, fuel: 6 },
  rapidMedicalFlyers: { crew: 2, fuel: 3 },
  tacticalDropShips: { crew: 4, fuel: 5 },
  airbornPatrolUnits: { crew: 3, fuel: 4 },
};

export const VEHICLE_KEYS = Object.keys(VEHICLE_SPECS);

// Troops (people). These human squads form the manpower pool that can crew
// vehicles and man installations. Excludes vehicles/aircraft (equipment),
// civilian workers, researchers, medics, droids and pure-admin roles.
export const MILITARY_PERSONNEL_KEYS = new Set<string>([
  // Law enforcement
  "patrolJudges", "rookieJudgeCadets", "streetPatrolUnits", "detectiveUnits",
  "undercoverInvestigators", "antiGangTaskForces", "drugEnforcementUnits",
  "cybercrimeTeams", "evidenceRecoveryTeams", "sectorLawSquads",
  // Riot (human squads only — mech units are vehicles)
  "riotPoliceSquads", "riotShieldUnits", "crowdDispersalTeams",
  "sonicCrowdControlUnits", "gasDeploymentTeams", "tacticalSuppressionTeams",
  // Elite
  "seniorJudges", "eliteJudgeStrikeTeams", "rapidResponseUnits",
  "tacticalBreachSquads", "urbanCombatSpecialists", "highThreatArrestUnits",
  "judgeExecutionTeams",
  // Military / defense (human squads — armoredResponseUnits is a vehicle)
  "cityDefenseInfantry", "sectorDefenseTroops", "rapidDeploymentInfantry",
  "heavyWeaponsSquads", "urbanDefenseEngineers", "wallDefenseCrews",
  "antiVehicleTeams",
  // Special
  "mutantEnforcementSquads", "blackOpsUnits", "antiCultTaskForces",
  "rogueJudgeHunters", "experimentalCombatUnits",
  // Frontier
  "caravanEscorts", "borderRangers", "wastelandScouts", "explorationTeams",
  "salvageCrews",
  // Expanded military
  "heavyBreachSquads", "wallGuardRegiments", "mobileResponseCompanies",
  "combatEngineers", "shockTrooperCohorts", "reconRangers", "droneWarfareTeams",
  "artillerySupportBatteries", "orbitalMarineCadres", "cityDefenseInfantryExpanded",
  // Space navy (troops)
  "orbitalSecurityMarines", "boardingAssaultTeams", "vacuumCombatEngineers",
  "escortFlightCrews", "platformDefenseGunners", "fleetSecurityTroops",
  "orbitalRangers", "shuttleInfantry", "colonyDefenseCohorts",
  // Judicial
  "streetArbiters", "riotSuppressionCohorts", "rapidEnforcementTeams", "sectorMarshals",
]);

// Each unit "count" is a squad/crew of this many people. Keeps the manpower
// pool on the same headcount scale as MILITARY_BUILDINGS.personnel (20-200) and
// the "N personnel KIA" mission copy.
export const PERSONNEL_PER_UNIT = 10;

// Free supply allowances so a fresh / vanilla game (which historically runs at
// ~0 ammo & fuel with no consequence) stays exactly neutral. Pressure only
// appears once the army/motor pool grows past these baselines without the
// player building supply infrastructure.
const FUEL_BASELINE = 350; // ≥ the starting motor pool's fuel need
const AMMO_BASELINE = 40;  // ≥ the starting army's per-tick ammo drain

// Standing-army branch derivation (display + mission gating). Combat itself
// uses the s.units composition, so this is a legible summary, not the truth.
const BRANCH_MAP: Record<string, keyof Pick<StandingArmy, "infantry" | "armor" | "artillery" | "airSupport" | "specialOps" | "support">> = {
  cityDefenseInfantry: "infantry", sectorDefenseTroops: "infantry", rapidDeploymentInfantry: "infantry",
  wallDefenseCrews: "infantry", urbanDefenseEngineers: "infantry", cityDefenseInfantryExpanded: "infantry",
  wallGuardRegiments: "infantry", mobileResponseCompanies: "infantry", shockTrooperCohorts: "infantry",
  armoredResponseUnits: "armor", tacticalResponseAPCs: "armor", armoredPersonnelCarriers: "armor",
  heavyRiotMechUnits: "armor", armoredRiotVehicles: "armor",
  heavyWeaponsSquads: "artillery", antiVehicleTeams: "artillery", artillerySupportBatteries: "artillery",
  judgeGunships: "airSupport", tacticalDropShips: "airSupport", airbornPatrolUnits: "airSupport",
  surveillanceHelicopters: "airSupport", tacticalCombatDrones: "airSupport",
  eliteJudgeStrikeTeams: "specialOps", urbanCombatSpecialists: "specialOps", blackOpsUnits: "specialOps",
  experimentalCombatUnits: "specialOps", tacticalBreachSquads: "specialOps", reconRangers: "specialOps",
  combatEngineers: "support", transportHaulers: "support", supplyTransportCrews: "support",
};

// Ammo drain (from formulas.ts AMMO DRAIN) — recomputed here so we can decide
// whether ammo production keeps up, without adding a second drain.
const AMMO_DRAIN_KEYS = ["patrolJudges", "streetPatrolUnits", "seniorJudges", "eliteJudgeStrikeTeams", "cityDefenseInfantry"];

// Military installations that PRODUCE supply per tick (per building, at full
// manning). Gated by garrison coverage — an under-staffed factory makes less.
// Real MILITARY_BUILDINGS ids (the phantom PRODUCTION_CHAINS keys never existed).
export const PRODUCTION_BY_BUILDING: Record<string, Partial<{ ammo: number; fuel: number; rations: number; steel: number; vehicleParts: number }>> = {
  ammunition_factory: { ammo: 60 },
  weapon_assembly_plant: { ammo: 33, vehicleParts: 6 },
  missile_production_facility: { ammo: 24 },
  ammunition_bunker: { ammo: 12 },
  fuel_storage_complex: { fuel: 28 },
  military_supply_depot: { rations: 30, ammo: 9 },
  armored_vehicle_depot: { vehicleParts: 16 },
  transport_command_hub: { fuel: 12, vehicleParts: 8 },
};

// Units + installations that provide vehicle MAINTENANCE capacity — their
// presence lets the motor pool recover/hold serviceability.
const MAINTENANCE_UNIT_KEYS = ["transportHaulers", "supplyTransportCrews", "infrastructureRepairTeams", "constructionCrews"];

// Cached building stats keyed by id.
const INSTALLATION_PERSONNEL: Record<string, number> = {};
const INSTALLATION_DEFENSE: Record<string, number> = {};
for (const b of MILITARY_BUILDINGS) {
  INSTALLATION_PERSONNEL[b.id] = b.personnel;
  INSTALLATION_DEFENSE[b.id] = b.defenseBonus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivation helpers
// ─────────────────────────────────────────────────────────────────────────────

export type DerivedArmy = {
  standingArmy: StandingArmy;
  personnelTotal: number; // headcount available to man/crew
};

/** Derive the standing-army summary + manpower pool from the real s.units. */
export function deriveArmyFromUnits(
  units: Record<string, number>,
  prev: StandingArmy,
): DerivedArmy {
  const branch = { infantry: 0, armor: 0, artillery: 0, airSupport: 0, specialOps: 0, support: 0 };
  let personnelUnits = 0;
  for (const key in units) {
    const count = units[key];
    if (typeof count !== "number" || count <= 0) continue;
    if (MILITARY_PERSONNEL_KEYS.has(key)) personnelUnits += count;
    const branchKey = BRANCH_MAP[key];
    if (branchKey) branch[branchKey] += count;
  }
  const totalStrength = branch.infantry + branch.armor * 3 + branch.artillery * 4 + branch.airSupport * 5 + branch.specialOps * 2 + branch.support;
  const standingArmy: StandingArmy = {
    ...branch,
    totalStrength,
    readiness: prev.readiness,
    morale: prev.morale,
    deployedOnMission: prev.deployedOnMission,
  };
  return { standingArmy, personnelTotal: personnelUnits * PERSONNEL_PER_UNIT };
}

/**
 * Convert readiness (0..100) into the combat-strength scalar.
 * Centred on the DEFAULT readiness (50) = 1.0 so a well-supplied army fights
 * like today; neglect (low readiness) penalises, excellence (high) rewards.
 */
export function readinessToCombatMod(readiness: number): number {
  if (readiness <= 50) return clamp(1 - 0.012 * (50 - readiness), 0.6, 1);
  if (readiness <= 70) return 1;
  return clamp(1 + 0.005 * (readiness - 70), 1, 1.15);
}

// Keep guidance aligned with the same boundary where readiness begins to
// reduce combat strength. A force at the neutral 50% floor should remain
// uncluttered; only a genuinely penalised force needs an intervention.
export const LOW_READINESS_THRESHOLD = 50;

export type MilitaryReadinessGuidance = {
  issue: "supplies" | "personnel" | "morale";
  title: string;
  detail: string;
  actionLabel: string;
  actionTab: "units" | "production" | "policies";
  icon: "package-variant-closed" | "account-group" | "heart-broken";
};

type SupplyShortfall = "ammunition" | "fuel" | "rations";

const SUPPLY_SHORTFALL_LABELS: ReadonlyArray<{
  key: SupplyShortfall;
  label: string;
}> = [
  { key: "ammunition", label: "AMMUNITION" },
  { key: "fuel", label: "FUEL" },
  { key: "rations", label: "RATIONS" },
];

function getDominantSupplyShortfall(
  log: Partial<Pick<MilitaryLogisticsState, "suppliesTicksRemaining">>,
): { label: string; ticks: number } | null {
  const remaining = log.suppliesTicksRemaining;
  if (!remaining) return null;

  const candidates = SUPPLY_SHORTFALL_LABELS
    .map(({ key, label }, priority) => ({
      label,
      ticks: remaining[key === "ammunition" ? "ammo" : key],
      priority,
    }))
    .filter(({ ticks }) => Number.isFinite(ticks));

  if (candidates.length === 0) return null;

  const winner = candidates.reduce((best, candidate) =>
    candidate.ticks < best.ticks ||
    (candidate.ticks === best.ticks && candidate.priority < best.priority)
      ? candidate
      : best,
  );
  return { label: winner.label, ticks: Math.max(0, Math.round(winner.ticks)) };
}

/**
 * Pick one actionable explanation for a low readiness score.
 *
 * The weights mirror the readiness target below: supply shortages are the
 * largest deliberate penalties, personnel coverage is the next-largest
 * contributor, and morale is a smaller modifier. Keeping this selector beside
 * the processor prevents the UI from inventing a competing notion of cause.
 */
export function getMilitaryReadinessGuidance(
  readiness: number,
  morale: number,
  log: Pick<MilitaryLogisticsState, "crewCoverage" | "garrisonCoverage" | "supplyStatus"> &
    Partial<Pick<MilitaryLogisticsState, "suppliesTicksRemaining">>,
): MilitaryReadinessGuidance | null {
  if (!Number.isFinite(readiness) || readiness >= LOW_READINESS_THRESHOLD) return null;

  const crewGap = clamp(1 - (Number.isFinite(log.crewCoverage) ? log.crewCoverage : 1), 0, 1);
  const garrisonGap = clamp(1 - (Number.isFinite(log.garrisonCoverage) ? log.garrisonCoverage : 1), 0, 1);
  const personnelPenalty = (crewGap + garrisonGap) * 6;
  const moralePenalty = Number.isFinite(morale)
    ? clamp((60 - morale) * 0.15, 0, 5)
    : 0;
  const supplyPenalty =
    log.supplyStatus === "critical" ? 24 :
    log.supplyStatus === "shortage" ? 18 :
    0;
  const limitingSupply = getDominantSupplyShortfall(log);

  const candidates: Array<MilitaryReadinessGuidance & { score: number }> = [
    {
      issue: "supplies",
      score: supplyPenalty,
      title: "SUPPLIES ARE LIMITING READINESS",
      detail: limitingSupply
        ? `${limitingSupply.label} is the limiting supply (${limitingSupply.ticks} ticks remaining). Review SUPPLY.`
        : `Logistics status is ${log.supplyStatus.toUpperCase()}. Review ammo, fuel, and rations in SUPPLY.`,
      actionLabel: "OPEN SUPPLY",
      actionTab: "production",
      icon: "package-variant-closed",
    },
    {
      issue: "personnel",
      score: personnelPenalty,
      title: "PERSONNEL COVERAGE IS LIMITING READINESS",
      detail: `Crew ${Math.round((1 - crewGap) * 100)}% · garrison ${Math.round((1 - garrisonGap) * 100)}%. Requisition more units in UNITS.`,
      actionLabel: "OPEN UNITS",
      actionTab: "units",
      icon: "account-group",
    },
    {
      issue: "morale",
      score: moralePenalty,
      title: "MORALE IS LIMITING READINESS",
      detail: `Force morale is ${Math.round(Math.max(0, morale))}%. Review morale-affecting policies in DOCTRINE.`,
      actionLabel: "OPEN DOCTRINE",
      actionTab: "policies",
      icon: "heart-broken",
    },
  ];

  const winner = candidates.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best,
  );
  return winner.score > 0 ? winner : null;
}

/**
 * Apply mission/battle casualties to the real personnel units (largest pools
 * first). Missions used to decrement the derived totalPersonnel, which the
 * per-tick derivation immediately resurrected — casualties must hit s.units.
 * Returns the headcount actually removed.
 */
export function applyPersonnelCasualties(s: GameState, casualties: number): number {
  const units = s.units as Record<string, number>;
  if (!units || casualties <= 0) return 0;
  let squadsToRemove = Math.ceil(casualties / PERSONNEL_PER_UNIT);
  let removedHeadcount = 0;
  while (squadsToRemove > 0) {
    // Find the largest personnel pool with any strength left.
    let bestKey: string | null = null;
    let bestCount = 0;
    for (const key of MILITARY_PERSONNEL_KEYS) {
      const n = units[key];
      if (typeof n === "number" && n > bestCount) { bestCount = n; bestKey = key; }
    }
    if (!bestKey || bestCount <= 0) break;
    const take = Math.min(bestCount, squadsToRemove);
    units[bestKey] = bestCount - take;
    squadsToRemove -= take;
    removedHeadcount += take * PERSONNEL_PER_UNIT;
  }
  return removedHeadcount;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main processor
// ─────────────────────────────────────────────────────────────────────────────

export function processMilitaryLogistics(s: GameState, entries: TickEntry[]): void {
  const mil = s.militaryOverhaul ?? createDefaultMilitaryState();
  const log = mil.logistics ?? createDefaultLogisticsState();
  const units = (s.units ?? {}) as Record<string, number>;
  const r = s.resources;

  // ── 1. Derive army + manpower pool from real units ──────────────────────
  const { standingArmy, personnelTotal } = deriveArmyFromUnits(units, mil.standingArmy);
  mil.standingArmy = standingArmy;
  mil.totalPersonnel = personnelTotal;
  log.personnelTotal = personnelTotal;

  const priority = log.allocationPriority ?? "balanced";
  const installations = log.installationsBuilt ?? {};

  // ── 2. Manning demand: crews (vehicles) + garrisons (installations) ──────
  let crewDemand = 0;
  let fleetFuelNeed = 0;
  for (const key of VEHICLE_KEYS) {
    const n = units[key];
    if (typeof n === "number" && n > 0) {
      crewDemand += n * VEHICLE_SPECS[key].crew;
      fleetFuelNeed += n * VEHICLE_SPECS[key].fuel;
    }
  }
  let garrisonDemand = 0;
  for (const id in installations) {
    const n = installations[id];
    if (typeof n === "number" && n > 0) garrisonDemand += n * (INSTALLATION_PERSONNEL[id] ?? 0);
  }
  // Academy staff are part of the same finite personnel pool. Their
  // instructor demand is intentionally small but non-zero, so a city must
  // balance training quality against garrison coverage.
  for (const [id, facility] of Object.entries(mil.academies?.facilities ?? {})) {
    if ((installations[id] ?? 0) > 0) garrisonDemand += Math.max(1, facility.instructors.length);
  }
  log.crewDemand = crewDemand;
  log.garrisonDemand = garrisonDemand;

  // Allocate the finite pool to the two buckets by priority.
  let crewCoverage = 1;
  let garrisonCoverage = 1;
  const totalDemand = crewDemand + garrisonDemand;
  if (totalDemand > 0) {
    let crewAlloc: number;
    let garrisonAlloc: number;
    if (priority === "vehicles_first") {
      crewAlloc = Math.min(crewDemand, personnelTotal);
      garrisonAlloc = Math.min(garrisonDemand, Math.max(0, personnelTotal - crewAlloc));
    } else if (priority === "installations_first") {
      garrisonAlloc = Math.min(garrisonDemand, personnelTotal);
      crewAlloc = Math.min(crewDemand, Math.max(0, personnelTotal - garrisonAlloc));
    } else {
      const capped = Math.min(personnelTotal, totalDemand);
      crewAlloc = crewDemand > 0 ? capped * (crewDemand / totalDemand) : 0;
      garrisonAlloc = garrisonDemand > 0 ? capped * (garrisonDemand / totalDemand) : 0;
    }
    crewCoverage = crewDemand > 0 ? clamp(crewAlloc / crewDemand, 0, 1) : 1;
    garrisonCoverage = garrisonDemand > 0 ? clamp(garrisonAlloc / garrisonDemand, 0, 1) : 1;
  }
  log.crewCoverage = crewCoverage;
  log.garrisonCoverage = garrisonCoverage;

  // ── 3. Doctrine + research modifiers ────────────────────────────────────
  const policyIds = mil.activePolicies ?? [];
  let moraleMult = 1;
  let policyCredits = 0;
  for (const pid of policyIds) {
    const def = MILITARY_POLICIES.find((p) => p.id === pid);
    if (!def) continue;
    if (def.effects.moraleMod) moraleMult *= def.effects.moraleMod;
    if (def.effects.creditsDrain) policyCredits += def.effects.creditsDrain;
  }

  // ── 4. Production from manned installations ──────────────────────────────
  const prod = { ammo: 0, fuel: 0, rations: 0, steel: 0, vehicleParts: 0 };
  for (const id in installations) {
    const n = installations[id];
    if (typeof n !== "number" || n <= 0) continue;
    const recipe = PRODUCTION_BY_BUILDING[id];
    if (!recipe) continue;
    const eff = n * garrisonCoverage;
    if (recipe.ammo) prod.ammo += recipe.ammo * eff;
    if (recipe.fuel) prod.fuel += recipe.fuel * eff;
    if (recipe.rations) prod.rations += recipe.rations * eff;
    if (recipe.steel) prod.steel += recipe.steel * eff;
    if (recipe.vehicleParts) prod.vehicleParts += recipe.vehicleParts * eff;
  }
  prod.ammo = Math.floor(prod.ammo);
  prod.fuel = Math.floor(prod.fuel);
  prod.rations = Math.floor(prod.rations);
  prod.steel = Math.floor(prod.steel);
  prod.vehicleParts = Math.floor(prod.vehicleParts);

  // Consume rations before applying production so a full food reserve still
  // drains and can refill into the room created by this tick's consumption.
  const rationConsume = Math.max(0, Math.ceil((personnelTotal * 0.003)));
  const rationAvail = r.food;
  const rationShort = rationConsume > rationAvail;
  applyResourceDelta(s, "food", -rationConsume);

  // Add production to resources (normal path). rates.ammoProduction is also set
  // so the offline-catchup path (which reads it) stays in parity.
  if (prod.ammo) r.ammo += prod.ammo;
  if (prod.fuel) applyResourceDelta(s, "fuel", prod.fuel);
  if (prod.rations) applyResourceDelta(s, "food", prod.rations);
  if (prod.steel) applyResourceDelta(s, "steel", prod.steel);
  if (prod.vehicleParts && s.stockpiles) {
    s.stockpiles.vehicleParts = (s.stockpiles.vehicleParts ?? 0) + prod.vehicleParts;
  }
  s.rates.ammoProduction = prod.ammo;
  log.lastProduction = prod;
  mil.production = {
    ...mil.production,
    ammoPerTick: prod.ammo,
    fuelPerTick: prod.fuel,
    rationsPerTick: prod.rations,
    steelPerTick: prod.steel,
    vehiclePartsPerTick: prod.vehicleParts,
  };

  // ── 5. Rations: the one supply the army draws here (ammo & fuel are already
  //       charged by the economy). ─
  log.lastConsumption = {
    ammo: Math.floor(AMMO_DRAIN_KEYS.reduce((sum, k) => sum + (typeof units[k] === "number" ? units[k] : 0), 0) * 0.15),
    fuel: Math.round(fleetFuelNeed * crewCoverage),
    rations: rationConsume,
  };

  // ── 6. Supply sufficiency (production-capacity based, so vanilla-0 stocks
  //       don't create phantom shortages) ─────────────────────────────────
  const ammoDrainNeed = log.lastConsumption.ammo;
  const ammoSupply = prod.ammo + AMMO_BASELINE;
  const ammoShort = ammoSupply < ammoDrainNeed;

  const fuelSupply = (s.rates.fuelProduction ?? 0) + prod.fuel + FUEL_BASELINE;
  const fuelShortfall = fleetFuelNeed > 0 ? clamp((fleetFuelNeed - fuelSupply) / fleetFuelNeed, 0, 1) : 0;
  const fuelFactor = clamp(1 - 0.15 * fuelShortfall, 0.85, 1);

  log.suppliesTicksRemaining = {
    ammo: ammoDrainNeed > 0 ? Math.floor(r.ammo / ammoDrainNeed) : 999,
    fuel: fleetFuelNeed > 0 ? Math.floor((r.fuel + fuelSupply) / Math.max(1, fleetFuelNeed)) : 999,
    rations: rationConsume > 0 ? Math.floor(r.food / rationConsume) : 999,
  };

  // ── 7. Fleet serviceability + operational fraction ──────────────────────
  let maintenanceUnits = 0;
  for (const key of MAINTENANCE_UNIT_KEYS) {
    const n = units[key];
    if (typeof n === "number" && n > 0) maintenanceUnits += n;
  }
  maintenanceUnits += (installations["armored_vehicle_depot"] ?? 0) * 20;
  maintenanceUnits += (installations["transport_command_hub"] ?? 0) * 15;
  const totalVehicles = VEHICLE_KEYS.reduce((sum, k) => sum + (typeof units[k] === "number" && units[k] > 0 ? units[k] : 0), 0);
  const maintenanceRatio = totalVehicles > 0 ? clamp(maintenanceUnits / totalVehicles, 0, 1) : 1;

  const condition = log.fleetCondition ?? {};
  const fleetOperational: Record<string, number> = {};
  let operationalSum = 0;
  let operationalCount = 0;
  for (const key of VEHICLE_KEYS) {
    const n = units[key];
    if (typeof n !== "number" || n <= 0) continue;
    let cond = typeof condition[key] === "number" ? condition[key] : 100;
    // Target: full fuel + enough mechanics → holds near 100; fuel shortfall or
    // too few mechanics for the fleet size → decays.
    const target = clamp((fuelFactor >= 0.99 ? 100 : 75) * (0.6 + 0.4 * maintenanceRatio), 40, 100);
    if (cond < target) cond = Math.min(target, cond + 2 + 2 * maintenanceRatio);
    else if (cond > target) cond = Math.max(target, cond - 2);
    cond = clamp(cond, 0, 100);
    condition[key] = cond;
    const op = clamp(crewCoverage * (cond / 100) * fuelFactor, 0, 1);
    fleetOperational[key] = op;
    operationalSum += op;
    operationalCount++;
  }
  log.fleetCondition = condition;
  log.fleetOperational = fleetOperational;
  // Subsume the old cosmetic vehicleReadiness pseudo-stat (still shown in UI).
  units.vehicleReadiness = operationalCount > 0 ? Math.round((operationalSum / operationalCount) * 100) : 100;

  // ── 8. Installation defense (only counts when manned) ───────────────────
  let installDefense = 0;
  for (const id in installations) {
    const n = installations[id];
    if (typeof n !== "number" || n <= 0) continue;
    installDefense += n * (INSTALLATION_DEFENSE[id] ?? 0);
  }
  log.installationDefenseBonus = Math.round(installDefense * garrisonCoverage);

  // ── 9. Installation upkeep (credits) + doctrine credit drain ────────────
  // Task #473: computed via the shared economyBreakdown module (the Economy
  // and Military tabs read the same function), and surfaced as a tick entry
  // reflecting the ACTUAL clamped deduction so tick entries always sum to
  // the real credit delta even when the treasury cannot cover the bill.
  const upkeep = policyCredits + computeInstallationBuildingUpkeep(installations);
  if (upkeep > 0) {
    const creditsBefore = r.credits;
    r.credits = Math.max(0, creditsBefore - upkeep);
    const deducted = creditsBefore - r.credits;
    if (deducted !== 0) {
      entries.push({
        label: "Installation Upkeep",
        delta: -deducted,
        unit: "credits",
        reason: "Military bases & doctrine credit drain",
        severity: "negative",
      });
    }
  }

  // ── 10. Readiness: converge toward a supply/manning/morale target ───────
  const moraleTarget = clamp(60 * moraleMult, 0, 100);
  mil.standingArmy.morale = Math.round(mil.standingArmy.morale + clamp(moraleTarget - mil.standingArmy.morale, -4, 4));

  // NEUTRALITY: full supply (full crew + full garrison + no shortages) must
  // converge INSIDE the flat [50,70] readiness band so readinessToCombatMod is
  // exactly 1.0 — a fully-supplied army fights like today's baseline (USER HARD
  // CONSTRAINT). Max full-supply target = 50+6+6+5 = 67 < 70, and readiness only
  // rises toward it (never overshoots), so mod stays pinned at 1.0. Shortages /
  // neglect push the target below 50 (a real combat penalty); the >70 reward
  // band is reserved for future explicit over-investment, not the default state.
  let target = 50;
  target += crewCoverage * 6;      // +6 fully crewed
  target += garrisonCoverage * 6;  // +6 fully manned (or no installations at all)
  target += Math.min(3, mil.academies?.readinessBonus ?? 0);
  target += clamp((mil.standingArmy.morale - 60) * 0.15, -5, 5);
  if (ammoShort) target -= 18;
  if (rationShort) target -= 24;
  if (fuelShortfall > 0) target -= Math.round(fuelShortfall * 15);
  target = clamp(target, 0, 100);

  const prevReadiness = mil.readiness ?? 50;
  const readiness = clamp(prevReadiness + clamp(target - prevReadiness, -5, 3), 0, 100);
  mil.readiness = readiness;
  mil.standingArmy.readiness = readiness;
  log.combatReadinessMod = readinessToCombatMod(readiness);

  // ── 11. Supply status + player-facing warning ───────────────────────────
  const worstTicks = Math.min(
    log.suppliesTicksRemaining.ammo,
    log.suppliesTicksRemaining.rations,
  );
  const anyShort = ammoShort || rationShort || fuelShortfall > 0.2;
  if (anyShort) log.supplyStatus = worstTicks <= 0 ? "critical" : "shortage";
  else log.supplyStatus = worstTicks >= 40 ? "surplus" : "stable";

  if (ammoShort || rationShort) {
    const short: string[] = [];
    if (ammoShort) short.push("ammunition");
    if (rationShort) short.push("rations");
    entries.push({
      label: "Supply Shortage",
      delta: readiness - prevReadiness,
      unit: "readiness",
      reason: `Army short on ${short.join(" & ")}. Readiness slipping — build supply infrastructure.`,
      severity: "warning",
    });
  }

  mil.logistics = log;
  s.militaryOverhaul = mil;
}

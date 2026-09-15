import type { GameState } from "@/engine/types";
import type { AttackTypeId } from "@/engine/strikeData";
import type { MilitaryStrikeId } from "@/engine/diplomacyEngine";

export type LoadoutRole =
  | "infantry"
  | "armor"
  | "artillery"
  | "airSupport"
  | "specialOps"
  | "support";

export type Loadout = Record<string, number>;

export const ROLE_LABEL: Record<LoadoutRole, string> = {
  infantry: "INFANTRY",
  armor: "ARMOR",
  artillery: "ARTILLERY",
  airSupport: "AIR SUPPORT",
  specialOps: "SPECIAL OPS",
  support: "SUPPORT",
};

export const ROLE_ICON: Record<LoadoutRole, string> = {
  infantry: "account-group",
  armor: "tank",
  artillery: "cannon",
  airSupport: "helicopter",
  specialOps: "ninja",
  support: "medical-bag",
};

export const ROLE_ORDER: LoadoutRole[] = [
  "infantry",
  "armor",
  "artillery",
  "airSupport",
  "specialOps",
  "support",
];

type UnitMeta = { role: LoadoutRole; weight: number; label: string };

// Combat-relevant unit keys mapped to role + per-unit strength weight.
// Unlisted keys (welfare officers, scientists, civic mediators, etc.)
// are non-combat and never appear in the loadout picker.
export const UNIT_ROLE_MAP: Record<string, UnitMeta> = {
  // INFANTRY
  cityDefenseInfantry: { role: "infantry", weight: 1.0, label: "CITY DEFENSE INFANTRY" },
  sectorDefenseTroops: { role: "infantry", weight: 1.0, label: "SECTOR DEFENSE TROOPS" },
  rapidDeploymentInfantry: { role: "infantry", weight: 1.2, label: "RAPID DEPLOYMENT INFANTRY" },
  urbanCombatSpecialists: { role: "infantry", weight: 1.4, label: "URBAN COMBAT SPECIALISTS" },
  heavyWeaponsSquads: { role: "infantry", weight: 1.6, label: "HEAVY WEAPONS SQUADS" },
  rapidResponseUnits: { role: "infantry", weight: 1.1, label: "RAPID RESPONSE UNITS" },
  riotPoliceSquads: { role: "infantry", weight: 0.6, label: "RIOT POLICE SQUADS" },
  riotShieldUnits: { role: "infantry", weight: 0.7, label: "RIOT SHIELD UNITS" },
  tacticalSuppressionTeams: { role: "infantry", weight: 1.1, label: "TACTICAL SUPPRESSION TEAMS" },
  patrolJudges: { role: "infantry", weight: 0.5, label: "PATROL ENFORCERS" },
  sectorLawSquads: { role: "infantry", weight: 0.5, label: "SECTOR LAW SQUADS" },
  streetPatrolUnits: { role: "infantry", weight: 0.4, label: "STREET PATROL UNITS" },
  rookieJudgeCadets: { role: "infantry", weight: 0.3, label: "ROOKIE CADETS" },
  highThreatArrestUnits: { role: "infantry", weight: 1.0, label: "HIGH-THREAT ARREST UNITS" },
  wallDefenseCrews: { role: "infantry", weight: 0.9, label: "WALL DEFENSE CREWS" },

  // ARMOR
  armoredResponseUnits: { role: "armor", weight: 2.0, label: "ARMORED RESPONSE UNITS" },
  armoredPersonnelCarriers: { role: "armor", weight: 2.2, label: "ARMORED PERSONNEL CARRIERS" },
  armoredRiotVehicles: { role: "armor", weight: 1.8, label: "ARMORED RIOT VEHICLES" },
  tacticalResponseAPCs: { role: "armor", weight: 2.4, label: "TACTICAL RESPONSE APCs" },
  heavyRiotMechUnits: { role: "armor", weight: 3.5, label: "HEAVY RIOT MECH UNITS" },
  patrolCars: { role: "armor", weight: 0.6, label: "PATROL CARS" },
  patrolBikes: { role: "armor", weight: 0.4, label: "PATROL BIKES" },
  judgeMotorcycles: { role: "armor", weight: 0.7, label: "ENFORCER MOTORCYCLES" },
  tacticalDropShips: { role: "armor", weight: 2.6, label: "TACTICAL DROP SHIPS" },
  antiVehicleTeams: { role: "armor", weight: 1.8, label: "ANTI-VEHICLE TEAMS" },

  // ARTILLERY
  artillery: { role: "artillery", weight: 3.0, label: "ARTILLERY BATTERIES" },

  // AIR SUPPORT
  airSupport: { role: "airSupport", weight: 2.5, label: "AIR SUPPORT WINGS" },
  judgeGunships: { role: "airSupport", weight: 2.5, label: "ENFORCER GUNSHIPS" },
  surveillanceHelicopters: { role: "airSupport", weight: 1.4, label: "SURVEILLANCE HELICOPTERS" },
  airbornPatrolUnits: { role: "airSupport", weight: 1.2, label: "AIRBORNE PATROL UNITS" },
  rapidMedicalFlyers: { role: "airSupport", weight: 0.8, label: "RAPID MEDICAL FLYERS" },
  surveillanceDrones: { role: "airSupport", weight: 0.7, label: "SURVEILLANCE DRONES" },
  patrolDrones: { role: "airSupport", weight: 0.6, label: "PATROL DRONES" },
  investigativeDrones: { role: "airSupport", weight: 0.5, label: "INVESTIGATIVE DRONES" },
  riotDroneSquads: { role: "airSupport", weight: 0.9, label: "RIOT DRONE SQUADS" },
  riotSuppressionDrones: { role: "airSupport", weight: 0.9, label: "RIOT SUPPRESSION DRONES" },
  smugglingInterceptorDrones: { role: "airSupport", weight: 1.0, label: "SMUGGLING INTERCEPTOR DRONES" },
  tacticalCombatDrones: { role: "airSupport", weight: 1.6, label: "TACTICAL COMBAT DRONES" },
  droneCarrierTrucks: { role: "airSupport", weight: 1.2, label: "DRONE CARRIER TRUCKS" },

  // SPECIAL OPS
  specialOps: { role: "specialOps", weight: 3.0, label: "SPECIAL OPS UNITS" },
  blackOpsUnits: { role: "specialOps", weight: 4.0, label: "BLACK OPS UNITS" },
  eliteJudgeStrikeTeams: { role: "specialOps", weight: 3.5, label: "ELITE STRIKE TEAMS" },
  judgeExecutionTeams: { role: "specialOps", weight: 3.0, label: "EXECUTION TEAMS" },
  tacticalBreachSquads: { role: "specialOps", weight: 2.6, label: "TACTICAL BREACH SQUADS" },
  experimentalCombatUnits: { role: "specialOps", weight: 5.0, label: "EXPERIMENTAL COMBAT UNITS" },
  rogueJudgeHunters: { role: "specialOps", weight: 2.4, label: "ROGUE HUNTER UNITS" },
  antiCultTaskForces: { role: "specialOps", weight: 1.8, label: "ANTI-CULT TASK FORCES" },
  mutantEnforcementSquads: { role: "specialOps", weight: 1.8, label: "MUTANT ENFORCEMENT SQUADS" },
  forensicProfilers: { role: "specialOps", weight: 1.0, label: "FORENSIC PROFILERS" },
  borderRangers: { role: "specialOps", weight: 1.4, label: "BORDER RANGERS" },
  wastelandScouts: { role: "specialOps", weight: 1.0, label: "WASTELAND SCOUTS" },
  caravanEscorts: { role: "specialOps", weight: 0.9, label: "CARAVAN ESCORTS" },
  explorationTeams: { role: "specialOps", weight: 0.9, label: "EXPLORATION TEAMS" },

  // WAR BEASTS — tamed wildlife deployable in combat (Phase 5)
  ridgebackHoundPacks: { role: "specialOps", weight: 2.8, label: "RIDGEBACK HOUND PACKS" },
  glasshornOxCavalry: { role: "armor", weight: 3.2, label: "GLASSHORN OX CAVALRY" },
  skywingFliers: { role: "airSupport", weight: 2.8, label: "SKYWING FLIERS" },
  beastWranglers: { role: "specialOps", weight: 1.5, label: "BEAST WRANGLERS" },

  // SUPPORT
  support: { role: "support", weight: 0.6, label: "GENERAL SUPPORT" },
  emergencyMedicalTeams: { role: "support", weight: 0.6, label: "EMERGENCY MEDICAL TEAMS" },
  fieldHospitalUnits: { role: "support", weight: 0.7, label: "FIELD HOSPITAL UNITS" },
  emergencyRepairUnits: { role: "support", weight: 0.6, label: "EMERGENCY REPAIR UNITS" },
  infrastructureRepairTeams: { role: "support", weight: 0.6, label: "INFRASTRUCTURE REPAIR TEAMS" },
  disasterResponseCrews: { role: "support", weight: 0.6, label: "DISASTER RESPONSE CREWS" },
  diseaseContainmentTeams: { role: "support", weight: 0.5, label: "DISEASE CONTAINMENT TEAMS" },
  biohazardResponseUnits: { role: "support", weight: 0.7, label: "BIOHAZARD RESPONSE UNITS" },
  supplyTransportCrews: { role: "support", weight: 0.4, label: "SUPPLY TRANSPORT CREWS" },
  transportHaulers: { role: "support", weight: 0.4, label: "TRANSPORT HAULERS" },
};

export function getUnitMeta(key: string): UnitMeta | null {
  return UNIT_ROLE_MAP[key] ?? null;
}

export function isCombatUnit(key: string): boolean {
  return key in UNIT_ROLE_MAP;
}

export function computeLoadoutStrength(loadout: Loadout): number {
  let total = 0;
  for (const [key, count] of Object.entries(loadout)) {
    if (!count || count <= 0) continue;
    const meta = UNIT_ROLE_MAP[key];
    if (!meta) continue;
    total += count * meta.weight;
  }
  return Math.round(total);
}

export function loadoutTotalUnits(loadout: Loadout): number {
  let total = 0;
  for (const v of Object.values(loadout)) {
    if (typeof v === "number" && v > 0) total += v;
  }
  return total;
}

export function summarizeLoadoutByRole(
  loadout: Loadout
): Record<LoadoutRole, { count: number; strength: number }> {
  const out: Record<LoadoutRole, { count: number; strength: number }> = {
    infantry: { count: 0, strength: 0 },
    armor: { count: 0, strength: 0 },
    artillery: { count: 0, strength: 0 },
    airSupport: { count: 0, strength: 0 },
    specialOps: { count: 0, strength: 0 },
    support: { count: 0, strength: 0 },
  };
  for (const [key, count] of Object.entries(loadout)) {
    if (!count || count <= 0) continue;
    const meta = UNIT_ROLE_MAP[key];
    if (!meta) continue;
    out[meta.role].count += count;
    out[meta.role].strength += count * meta.weight;
  }
  return out;
}

export type AvailableUnit = {
  key: string;
  label: string;
  available: number;
  weight: number;
};

export function getAvailableUnitsByRole(
  state: GameState
): Record<LoadoutRole, AvailableUnit[]> {
  const out: Record<LoadoutRole, AvailableUnit[]> = {
    infantry: [],
    armor: [],
    artillery: [],
    airSupport: [],
    specialOps: [],
    support: [],
  };
  const units = state.units as Record<string, number>;
  for (const [key, meta] of Object.entries(UNIT_ROLE_MAP)) {
    const available = Math.max(0, Math.floor(units[key] ?? 0));
    if (available <= 0) continue;
    out[meta.role].push({ key, label: meta.label, available, weight: meta.weight });
  }
  // Sort each role by descending weight then label for stable display.
  for (const role of ROLE_ORDER) {
    out[role].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
  }
  return out;
}

// Recommended composition per attack type, expressed as fractional weights
// across the six roles. Used by the Auto-Fill button.
const COMPOSITION_RECIPES: Record<AttackTypeId, Partial<Record<LoadoutRole, number>>> = {
  troop_assault: { infantry: 0.6, armor: 0.2, support: 0.1, specialOps: 0.1 },
  missile_strike: { artillery: 0.7, support: 0.2, infantry: 0.1 },
  full_assault: { infantry: 0.4, armor: 0.25, artillery: 0.15, airSupport: 0.1, specialOps: 0.05, support: 0.05 },
  special_ops: { specialOps: 0.85, support: 0.15 },
  air_strike: { airSupport: 0.75, specialOps: 0.15, support: 0.1 },
  artillery_barrage: { artillery: 0.65, infantry: 0.2, support: 0.15 },
  siege_bombardment: { infantry: 0.35, armor: 0.2, artillery: 0.25, airSupport: 0.1, support: 0.1 },
  tarpit_titan_hunt: { armor: 0.45, artillery: 0.20, infantry: 0.20, specialOps: 0.10, support: 0.05 },
  ridge_tyrant_hunt: { armor: 0.30, artillery: 0.30, airSupport: 0.20, infantry: 0.15, support: 0.05 },
  glassback_whale_hunt: { airSupport: 0.55, artillery: 0.20, specialOps: 0.15, support: 0.10 },
};

export function recommendedComposition(
  attackTypeId: AttackTypeId,
  totalUnitsTarget: number,
  state: GameState
): Loadout {
  const recipe = COMPOSITION_RECIPES[attackTypeId] ?? COMPOSITION_RECIPES.troop_assault;
  const available = getAvailableUnitsByRole(state);
  const out: Loadout = {};

  for (const role of ROLE_ORDER) {
    const share = recipe[role] ?? 0;
    if (share <= 0) continue;
    const desired = Math.max(1, Math.round(totalUnitsTarget * share));
    const pool = available[role];
    if (pool.length === 0) continue;
    // Spread the desired count across this role's unit pool, prioritizing
    // higher-weight units first.
    let remaining = desired;
    for (const u of pool) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, u.available);
      if (take > 0) {
        out[u.key] = (out[u.key] ?? 0) + take;
        remaining -= take;
      }
    }
  }
  return out;
}

// Distribute a casualty count across the loadout proportionally to each
// unit's deployed share, capped at the deployed amount. Returns the updated
// state.units record (only changed keys mutated).
export function deductCasualties(
  units: Record<string, number>,
  loadout: Loadout,
  totalCasualties: number
): { updated: Record<string, number>; casualtyByUnit: Record<string, number> } {
  const updated = { ...units };
  const casualtyByUnit: Record<string, number> = {};
  if (totalCasualties <= 0) return { updated, casualtyByUnit };

  const deployed = Object.entries(loadout).filter(([, c]) => c > 0);
  const totalDeployed = deployed.reduce((s, [, c]) => s + c, 0);
  if (totalDeployed <= 0) return { updated, casualtyByUnit };

  const cap = Math.min(totalCasualties, totalDeployed);

  // First pass: proportional floor.
  let assigned = 0;
  for (const [key, count] of deployed) {
    const share = Math.floor((count / totalDeployed) * cap);
    const take = Math.min(share, count, Math.max(0, updated[key] ?? 0));
    if (take > 0) {
      casualtyByUnit[key] = take;
      updated[key] = Math.max(0, (updated[key] ?? 0) - take);
      assigned += take;
    }
  }
  // Second pass: distribute remainder to deployed units that still have
  // surviving deployed members.
  let remainder = cap - assigned;
  if (remainder > 0) {
    for (const [key, count] of deployed) {
      if (remainder <= 0) break;
      const alreadyTaken = casualtyByUnit[key] ?? 0;
      const headroom = Math.min(count - alreadyTaken, Math.max(0, updated[key] ?? 0));
      if (headroom <= 0) continue;
      const take = Math.min(headroom, remainder);
      casualtyByUnit[key] = alreadyTaken + take;
      updated[key] = Math.max(0, (updated[key] ?? 0) - take);
      remainder -= take;
    }
  }
  return { updated, casualtyByUnit };
}

// Returns the role share fractions a loadout actually deploys (0..1 per role).
// Used by the strike resolver to bias damage by force composition and by the
// UI to surface "your force is 60% air" hints.
export function getCompositionShares(
  loadout: Loadout
): Record<LoadoutRole, number> {
  const out: Record<LoadoutRole, number> = {
    infantry: 0, armor: 0, artillery: 0, airSupport: 0, specialOps: 0, support: 0,
  };
  const summary = summarizeLoadoutByRole(loadout);
  const total = ROLE_ORDER.reduce((s, r) => s + summary[r].strength, 0);
  if (total <= 0) return out;
  for (const r of ROLE_ORDER) {
    out[r] = summary[r].strength / total;
  }
  return out;
}

// The role with the largest share of weighted strength, or null if empty.
export function getDominantRole(loadout: Loadout): LoadoutRole | null {
  const shares = getCompositionShares(loadout);
  let best: LoadoutRole | null = null;
  let bestShare = 0;
  for (const r of ROLE_ORDER) {
    if (shares[r] > bestShare) { bestShare = shares[r]; best = r; }
  }
  return bestShare > 0.0001 ? best : null;
}

// Public read-only view of the recommended composition recipes (used by the
// attack panel to display "Recommended: 60% Infantry • 20% Armor ...").
export function getRecommendedRoleShares(
  attackTypeId: AttackTypeId
): Partial<Record<LoadoutRole, number>> {
  return COMPOSITION_RECIPES[attackTypeId] ?? COMPOSITION_RECIPES.troop_assault;
}

// Diplomatic actions in the "attack" category that are real military strikes
// (not embargoes / sanctions). These trigger the loadout picker the same way
// as launchStrike, and are charged casualties from the chosen force.
//
// Only actions with a backing reducer execution path (the MILITARY_ACTIONS set
// in GameContext.actionFaction) belong here. infrastructure-raid is a
// stat-only diplomatic action with no military reducer handler, so listing it
// here would gate it on combat units / munitions and bill loadout casualties
// for an action that performs no real strike — a contract break. Keep it out.
// Keyed by MilitaryStrikeId so this map and the cost map in
// diplomacyEngine.ts stay in lock-step: adding, renaming, or removing
// a strike id over there raises a TypeScript error here (and vice
// versa).
export const MILITARY_DIPLO_ATTACK_MAP: Record<MilitaryStrikeId, AttackTypeId> = {
  "rocket-strike": "missile_strike",
  "bombardment": "artillery_barrage",
  "lay-siege": "siege_bombardment",
};

// Pretty short summary line for log/inbox use.
export function formatLoadoutSummary(loadout: Loadout): string {
  const summary = summarizeLoadoutByRole(loadout);
  const parts: string[] = [];
  for (const role of ROLE_ORDER) {
    const r = summary[role];
    if (r.count > 0) parts.push(`${ROLE_LABEL[role]} ×${r.count}`);
  }
  return parts.join("  •  ") || "No units deployed";
}

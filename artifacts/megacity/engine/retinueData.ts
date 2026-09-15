import type { ActionCostTiming } from "@/engine/actionCostTiming";

export type TroopTier = "recruit" | "militia" | "enforcer" | "veteran" | "elite" | "champion";

export type TroopClassId =
  | "infantry"
  | "shocktrooper"
  | "marksman"
  | "medic"
  | "engineer"
  | "heavy_gunner"
  | "scout"
  | "cyber_operative"
  | "demolisher"
  | "breacher"
  | "war_medic"
  | "dragoon";

export type SquadRole = "assault" | "defense" | "recon" | "support" | "special_ops";

export type SquadDoctrine = "balanced" | "assault" | "defensive" | "recon";

export interface SquadDoctrineDef {
  id: SquadDoctrine;
  name: string;
  icon: string;
  description: string;
  benefit: string;
  cost: string;
  powerMultiplier: number;
  casualtyRiskMultiplier: number;
  operationSpeedMultiplier: number;
}

/**
 * Mission-facing inputs for a squad deployment. The resolver deliberately
 * keeps these values separate from doctrine so the same squad can be sent on
 * different operations without changing its standing composition.
 */
export interface SquadDeploymentSpec {
  /** Unmodified operation length in ticks. */
  duration: number;
  /** Operation difficulty on the same 0–100 scale used for success chance. */
  difficulty: number;
  /** Expected fraction of ready troops exposed to casualties, from 0–1. */
  casualtyRate: number;
}

export type SquadOperationId = "recon_sweep" | "supply_recovery" | "hostile_interdiction";

export interface SquadOperationDef {
  id: SquadOperationId;
  name: string;
  description: string;
  icon: string;
  spec: SquadDeploymentSpec;
  minReadyTroops: number;
}

export interface SquadDeploymentResolution {
  squadId: string;
  success: boolean;
  /** Actual operation length after doctrine speed is applied. */
  duration: number;
  casualties: number;
  successChance: number;
  combatPower: number;
  readyTroopCount: number;
  doctrineModifiers: {
    powerMultiplier: number;
    casualtyRiskMultiplier: number;
    operationSpeedMultiplier: number;
  };
}

export interface SquadDeploymentPreview {
  squadId: string;
  operationId: SquadOperationId;
  operationName: string;
  canLaunch: boolean;
  reason?: string;
  duration: number;
  successChance: number;
  combatPower: number;
  readyTroopCount: number;
  casualtyRate: number;
  projectedCasualtiesOnSuccess: number;
  projectedCasualtiesOnFailure: number;
  doctrineModifiers: SquadDeploymentResolution["doctrineModifiers"];
  timing: ActionCostTiming;
}

export interface SquadActiveOperation {
  id: string;
  operationId: SquadOperationId;
  squadId: string;
  squadName: string;
  startedTick: number;
  ticksRemaining: number;
  resolution: SquadDeploymentResolution;
}

export interface SquadOperationRecord {
  id: string;
  operationId: SquadOperationId;
  operationName: string;
  squadId: string;
  squadName: string;
  startedTick: number;
  completedTick: number;
  success: boolean;
  duration: number;
  successChance: number;
  combatPower: number;
  casualties: number;
  wounded: number;
  killed: number;
  doctrine: SquadDoctrine;
}

export interface TroopTierDef {
  tier: TroopTier;
  rank: number;
  label: string;
  xpRequired: number;
  promoteCost: number;
  promoteResources?: Partial<{ steel: number; ammo: number; medSupplies: number }>;
  combatMult: number;
  icon: string;
  nextTier: TroopTier | null;
}

export interface TroopClassDef {
  id: TroopClassId;
  name: string;
  description: string;
  /** Canonical battlefield role shared with the recruitment role filter. */
  battlefieldRole: import("./unitRoles").UnitRole;
  icon: string;
  baseCombat: number;
  baseHP: number;
  recruitCost: number;
  upkeepPerTick: number;
  strengths: string[];
  weaknesses: string[];
  bonuses: Partial<{
    attack: number;
    defense: number;
    morale: number;
    speed: number;
    healing: number;
    engineering: number;
    recon: number;
  }>;
}

export interface Troop {
  id: string;
  classId: TroopClassId;
  customName?: string;
  tier: TroopTier;
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  combat: number;
  morale: number;
  kills: number;
  missionsCompleted: number;
  status: "ready" | "injured" | "training" | "deployed" | "kia";
  squadId: string | null;
  hiredTick: number;
  specialization?: import("./retinueData").SpecializationPath;
  /** Tick when treatment completes; absent on old saves and healthy troops. */
  injuredUntilTick?: number;
}

export interface Captain {
  id: string;
  name: string;
  title: string;
  level: number;
  xp: number;
  xpToNext: number;
  leadership: number;
  combat: number;
  tactics: number;
  loyalty: number;
  squadId: string;
  kills: number;
  battlesWon: number;
  battlesLost: number;
  trait: CaptainTrait;
  status: "active" | "injured" | "kia";
  equippedItemIds: string[];
  hiredTick: number;
  /** Tick when treatment completes; absent on old saves and healthy captains. */
  injuredUntilTick?: number;
}

export type CaptainTrait =
  | "disciplinarian"
  | "tactician"
  | "berserker"
  | "inspiring"
  | "cunning"
  | "ironwall"
  | "ruthless"
  | "mentor";

export interface CaptainTraitDef {
  id: CaptainTrait;
  name: string;
  description: string;
  effects: Partial<{
    xpShareBonus: number;
    combatBonus: number;
    moraleBonus: number;
    trainingSpeed: number;
    upkeepReduction: number;
    squadSizeBonus: number;
  }>;
}

export interface Squad {
  id: string;
  name: string;
  role: SquadRole;
  /** Optional in old saves; migration and runtime readers fall back to balanced. */
  doctrine?: SquadDoctrine;
  captainId: string | null;
  /** Optional in old saves. An active deputy automatically succeeds a dismissed captain. */
  deputyCaptainId?: string | null;
  troopIds: string[];
  maxSize: number;
  formationBonus: number;
  totalKills: number;
  deploymentsCompleted: number;
  created: number;
}

export interface RetinueState {
  squads: Squad[];
  captains: Captain[];
  troops: Troop[];
  maxSquads: number;
  maxTroopsPerSquad: number;
  totalRecruits: number;
  totalPromotions: number;
  totalCasualties: number;
  totalKills: number;
  trainingQueue: { troopId: string; ticksRemaining: number }[];
  activeOperation?: SquadActiveOperation | null;
  operationHistory?: SquadOperationRecord[];
}

export const TIER_DEFS: TroopTierDef[] = [
  { tier: "recruit", rank: 0, label: "RECRUIT", xpRequired: 0, promoteCost: 0, combatMult: 0.6, icon: "account-outline", nextTier: "militia" },
  { tier: "militia", rank: 1, label: "MILITIA", xpRequired: 50, promoteCost: 200, promoteResources: { ammo: 10 }, combatMult: 0.8, icon: "account", nextTier: "enforcer" },
  { tier: "enforcer", rank: 2, label: "ENFORCER", xpRequired: 150, promoteCost: 500, promoteResources: { steel: 5, ammo: 20 }, combatMult: 1.0, icon: "shield-account", nextTier: "veteran" },
  { tier: "veteran", rank: 3, label: "VETERAN", xpRequired: 400, promoteCost: 1200, promoteResources: { steel: 15, ammo: 30 }, combatMult: 1.3, icon: "sword-cross", nextTier: "elite" },
  { tier: "elite", rank: 4, label: "ELITE", xpRequired: 800, promoteCost: 3000, promoteResources: { steel: 30, ammo: 50, medSupplies: 10 }, combatMult: 1.7, icon: "star-shooting", nextTier: "champion" },
  { tier: "champion", rank: 5, label: "CHAMPION", xpRequired: 1500, promoteCost: 8000, promoteResources: { steel: 60, ammo: 80, medSupplies: 25 }, combatMult: 2.2, icon: "crown", nextTier: null },
];

export const CLASS_DEFS: TroopClassDef[] = [
  {
    id: "infantry", name: "Infantry", description: "Standard foot soldiers. Cheap, replaceable, and never thanked.", battlefieldRole: "FRONTLINE",
    icon: "walk", baseCombat: 10, baseHP: 100, recruitCost: 100, upkeepPerTick: 2,
    strengths: ["Versatile", "Cheap"], weaknesses: ["Low specialization"],
    bonuses: { attack: 1, defense: 1 },
  },
  {
    id: "shocktrooper", name: "Shocktrooper", description: "Heavy assault troops. Sent in first. Counted last.", battlefieldRole: "FRONTLINE",
    icon: "flash", baseCombat: 16, baseHP: 120, recruitCost: 250, upkeepPerTick: 4,
    strengths: ["High damage", "Breach"], weaknesses: ["Slow", "Expensive"],
    bonuses: { attack: 3, defense: 0 },
  },
  {
    id: "marksman", name: "Marksman", description: "Long-range specialist. One scope. One breath. One name off the roster.", battlefieldRole: "RANGED",
    icon: "crosshairs-gps", baseCombat: 14, baseHP: 70, recruitCost: 200, upkeepPerTick: 3,
    strengths: ["Range", "Precision"], weaknesses: ["Fragile", "Poor CQB"],
    bonuses: { attack: 2, recon: 1 },
  },
  {
    id: "medic", name: "Combat Medic", description: "Keeps the squad breathing. Carries the names in a notebook.", battlefieldRole: "MEDICAL SUPPORT",
    icon: "medical-bag", baseCombat: 6, baseHP: 80, recruitCost: 180, upkeepPerTick: 3,
    strengths: ["Healing", "Sustain"], weaknesses: ["Low combat"],
    bonuses: { healing: 3, morale: 1 },
  },
  {
    id: "engineer", name: "Combat Engineer", description: "Builds bunkers. Blows bridges. Sleeps under trucks.", battlefieldRole: "ENGINEERING",
    icon: "wrench", baseCombat: 8, baseHP: 90, recruitCost: 220, upkeepPerTick: 3,
    strengths: ["Fortify", "Demolish"], weaknesses: ["Average fighter"],
    bonuses: { defense: 2, engineering: 3 },
  },
  {
    id: "heavy_gunner", name: "Heavy Gunner", description: "Belt-fed and unimpressed. Owns the sector until the barrel warps.", battlefieldRole: "RANGED",
    icon: "pistol", baseCombat: 18, baseHP: 130, recruitCost: 350, upkeepPerTick: 5,
    strengths: ["Suppression", "High DPS"], weaknesses: ["Immobile", "Ammo hungry"],
    bonuses: { attack: 4, defense: -1 },
  },
  {
    id: "scout", name: "Scout", description: "First in. Sees the worst. Reports half of it.", battlefieldRole: "RECONNAISSANCE",
    icon: "binoculars", baseCombat: 9, baseHP: 60, recruitCost: 150, upkeepPerTick: 2,
    strengths: ["Speed", "Intel"], weaknesses: ["Paper armor"],
    bonuses: { recon: 4, speed: 3 },
  },
  {
    id: "cyber_operative", name: "Cyber-Operative", description: "Half flesh, half wire. The other half is classified.", battlefieldRole: "SPECIAL OPERATIONS",
    icon: "robot-outline", baseCombat: 22, baseHP: 110, recruitCost: 600, upkeepPerTick: 6,
    strengths: ["Elite combat", "Hacking"], weaknesses: ["Very expensive"],
    bonuses: { attack: 3, defense: 2, recon: 2 },
  },
  {
    id: "demolisher", name: "Demolisher", description: "Owns more C4 than friends. Has reasons for both.", battlefieldRole: "ENGINEERING",
    icon: "bomb", baseCombat: 15, baseHP: 100, recruitCost: 300, upkeepPerTick: 4,
    strengths: ["Siege", "Area damage"], weaknesses: ["Friendly fire risk", "Slow"],
    bonuses: { attack: 4, engineering: 2 },
  },
  {
    id: "breacher", name: "Breacher", description: "First through the door. The door doesn't get a vote.", battlefieldRole: "FRONTLINE",
    icon: "door-open", baseCombat: 17, baseHP: 115, recruitCost: 280, upkeepPerTick: 4,
    strengths: ["CQB", "Breach & clear"], weaknesses: ["Short range", "Exposed"],
    bonuses: { attack: 3, defense: 1, speed: 2 },
  },
  {
    id: "war_medic", name: "War Medic", description: "Heals with one hand. Fires with the other. Sleeps with neither.", battlefieldRole: "MEDICAL SUPPORT",
    icon: "hospital", baseCombat: 12, baseHP: 105, recruitCost: 250, upkeepPerTick: 4,
    strengths: ["Armored healing", "Sustain"], weaknesses: ["Jack of all trades"],
    bonuses: { healing: 4, defense: 2, morale: 2 },
  },
  {
    id: "dragoon", name: "Dragoon", description: "Strikes fast. Vanishes faster. Always over the next ridge.", battlefieldRole: "MOBILITY",
    icon: "motion", baseCombat: 14, baseHP: 85, recruitCost: 320, upkeepPerTick: 5,
    strengths: ["Mobility", "Flanking"], weaknesses: ["Light armor"],
    bonuses: { attack: 2, speed: 4, recon: 1 },
  },
];

export const CAPTAIN_TRAITS: CaptainTraitDef[] = [
  { id: "disciplinarian", name: "Disciplinarian", description: "Strict drills. Troops train fast. Hate him by week two.", effects: { trainingSpeed: 0.3, moraleBonus: -5 } },
  { id: "tactician", name: "Tactician", description: "Reads the map before the bullets do.", effects: { combatBonus: 5, xpShareBonus: 0.1 } },
  { id: "berserker", name: "Berserker", description: "Leads from the front. Reckless but devastating.", effects: { combatBonus: 10, moraleBonus: 10 } },
  { id: "inspiring", name: "Inspiring", description: "Troops follow without being asked. Most don't come back.", effects: { moraleBonus: 15, xpShareBonus: 0.15 } },
  { id: "cunning", name: "Cunning", description: "Stretches every credit. Steals the rest.", effects: { upkeepReduction: 0.2, combatBonus: 3 } },
  { id: "ironwall", name: "Ironwall", description: "Holds ground. Buries comrades alphabetically.", effects: { combatBonus: 2, moraleBonus: 5 } },
  { id: "ruthless", name: "Ruthless", description: "No prisoners. Maximum efficiency.", effects: { combatBonus: 8, moraleBonus: -10 } },
  { id: "mentor", name: "Mentor", description: "Patient teacher. Has outlived three squads of students.", effects: { trainingSpeed: 0.5, xpShareBonus: 0.25 } },
];

export const SQUAD_ROLES: { id: SquadRole; label: string; icon: string; description: string }[] = [
  { id: "assault", label: "ASSAULT", icon: "sword", description: "Frontline combat operations" },
  { id: "defense", label: "DEFENSE", icon: "shield", description: "Garrison and fortification duty" },
  { id: "recon", label: "RECON", icon: "binoculars", description: "Scouting and intelligence gathering" },
  { id: "support", label: "SUPPORT", icon: "hospital-box", description: "Medical, engineering, logistics" },
  { id: "special_ops", label: "SPEC-OPS", icon: "ninja", description: "High-risk covert missions" },
];

export const SQUAD_DOCTRINES: SquadDoctrineDef[] = [
  {
    id: "balanced",
    name: "Balanced",
    icon: "scale-balance",
    description: "A measured field posture with no tactical extremes.",
    benefit: "No modifier",
    cost: "No modifier",
    powerMultiplier: 1,
    casualtyRiskMultiplier: 1,
    operationSpeedMultiplier: 1,
  },
  {
    id: "assault",
    name: "Assault",
    icon: "sword-cross",
    description: "Commit hard and fast to overwhelm the opposition.",
    benefit: "+15% squad power; +10% operation speed",
    cost: "+20% casualty risk",
    powerMultiplier: 1.15,
    casualtyRiskMultiplier: 1.2,
    operationSpeedMultiplier: 1.1,
  },
  {
    id: "defensive",
    name: "Defensive",
    icon: "shield",
    description: "Dig in, preserve the force, and accept slower progress.",
    benefit: "-30% casualty risk",
    cost: "-10% squad power; -20% operation speed",
    powerMultiplier: 0.9,
    casualtyRiskMultiplier: 0.7,
    operationSpeedMultiplier: 0.8,
  },
  {
    id: "recon",
    name: "Recon",
    icon: "binoculars",
    description: "Prioritize information and careful positioning over force.",
    benefit: "-35% casualty risk",
    cost: "-5% squad power; -10% operation speed",
    powerMultiplier: 0.95,
    casualtyRiskMultiplier: 0.65,
    operationSpeedMultiplier: 0.9,
  },
];

export const SQUAD_OPERATIONS: SquadOperationDef[] = [
  {
    id: "recon_sweep",
    name: "Recon Sweep",
    description: "Map hostile approaches and return with actionable intelligence.",
    icon: "radar",
    spec: { duration: 8, difficulty: 30, casualtyRate: 0.12 },
    minReadyTroops: 1,
  },
  {
    id: "supply_recovery",
    name: "Supply Recovery",
    description: "Recover a stranded logistics cache before scavengers strip it bare.",
    icon: "truck-fast",
    spec: { duration: 12, difficulty: 45, casualtyRate: 0.22 },
    minReadyTroops: 2,
  },
  {
    id: "hostile_interdiction",
    name: "Hostile Interdiction",
    description: "Hit an enemy staging point and disrupt its next move.",
    icon: "target",
    spec: { duration: 16, difficulty: 65, casualtyRate: 0.38 },
    minReadyTroops: 3,
  },
];

export const CAPTAIN_TRAITS_MAP: Record<string, CaptainTraitDef> = {};
for (const t of CAPTAIN_TRAITS) CAPTAIN_TRAITS_MAP[t.id] = t;

export const SQUAD_ROLES_MAP: Record<string, (typeof SQUAD_ROLES)[number]> = {};
for (const r of SQUAD_ROLES) SQUAD_ROLES_MAP[r.id] = r;

export const SQUAD_DOCTRINES_MAP: Record<string, SquadDoctrineDef> = {};
for (const d of SQUAD_DOCTRINES) SQUAD_DOCTRINES_MAP[d.id] = d;

export const DEFAULT_SQUAD_DOCTRINE: SquadDoctrine = "balanced";

export function getSquadDoctrineDef(doctrine: unknown): SquadDoctrineDef {
  return SQUAD_DOCTRINES_MAP[doctrine as string] ?? SQUAD_DOCTRINES_MAP[DEFAULT_SQUAD_DOCTRINE];
}

export const XP_SHARE_RULES = {
  captainSharePct: 0.20,
  troopSharePct: 0.80,
  trainingBaseXpPerTick: 2,
  killXpBase: 15,
  missionXpBase: 30,
  captainLevelXpScale: [0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 5800],
};

/** Leaderless squads stay operational, but lose a bounded quarter of their power. */
export const LEADERLESS_SQUAD_POWER_MULTIPLIER = 0.75;

export function xpForTroopLevel(level: number): number {
  return Math.floor(40 + level * 25 + level * level * 5);
}

export function xpForCaptainLevel(level: number): number {
  if (level < XP_SHARE_RULES.captainLevelXpScale.length) return XP_SHARE_RULES.captainLevelXpScale[level];
  return Math.floor(5800 + (level - 9) * 2000);
}

export function getTierDef(tier: TroopTier): TroopTierDef {
  return TIER_DEFS.find((t) => t.tier === tier) ?? TIER_DEFS[0];
}

export function getClassDef(classId: TroopClassId): TroopClassDef {
  return CLASS_DEFS.find((c) => c.id === classId) ?? CLASS_DEFS[0];
}

export function createDefaultRetinueState(): RetinueState {
  return {
    squads: [],
    captains: [],
    troops: [],
    maxSquads: 4,
    maxTroopsPerSquad: 8,
    totalRecruits: 0,
    totalPromotions: 0,
    totalCasualties: 0,
    totalKills: 0,
    trainingQueue: [],
    activeOperation: null,
    operationHistory: [],
  };
}

export type CaptainAbilityId =
  | "rally_cry" | "suppressive_order" | "field_triage" | "tactical_retreat"
  | "breach_charge" | "fortify_position" | "overwatch" | "flanking_maneuver"
  | "inspire_troops" | "demolition_order" | "recon_sweep" | "last_stand";

export interface CaptainAbilityDef {
  id: CaptainAbilityId;
  name: string;
  description: string;
  icon: string;
  cooldownTicks: number;
  effects: Partial<{
    combatBonus: number;
    moraleBonus: number;
    defenseBonus: number;
    healingBonus: number;
    reconBonus: number;
    xpBonus: number;
    damageMult: number;
  }>;
  requiredTrait?: CaptainTrait;
  requiredLevel: number;
}

export const CAPTAIN_ABILITIES: CaptainAbilityDef[] = [
  { id: "rally_cry", name: "Rally Cry", description: "Boosts squad morale for 3 ticks. All troops fight harder.", icon: "bullhorn", cooldownTicks: 12, effects: { moraleBonus: 20, combatBonus: 3 }, requiredLevel: 2 },
  { id: "suppressive_order", name: "Suppressive Fire", description: "Order concentrated fire. Increases damage output.", icon: "pistol", cooldownTicks: 8, effects: { combatBonus: 8, damageMult: 1.3 }, requiredLevel: 3 },
  { id: "field_triage", name: "Field Triage", description: "Emergency medical attention for the squad.", icon: "medical-bag", cooldownTicks: 10, effects: { healingBonus: 25, moraleBonus: 5 }, requiredLevel: 2 },
  { id: "tactical_retreat", name: "Tactical Retreat", description: "Ordered withdrawal. Preserves troops at cost of position.", icon: "arrow-left-bold", cooldownTicks: 15, effects: { defenseBonus: 15, moraleBonus: -5 }, requiredLevel: 4 },
  { id: "breach_charge", name: "Breach Charge", description: "Blow through fortified positions. Devastating but risky.", icon: "bomb", cooldownTicks: 10, effects: { combatBonus: 12, damageMult: 1.5 }, requiredLevel: 3, requiredTrait: "berserker" },
  { id: "fortify_position", name: "Fortify Position", description: "Dig in and hold the line. Massive defense boost.", icon: "castle", cooldownTicks: 12, effects: { defenseBonus: 20, combatBonus: -2 }, requiredLevel: 3, requiredTrait: "ironwall" },
  { id: "overwatch", name: "Overwatch", description: "Set up overlapping fields of fire. Area denial.", icon: "eye", cooldownTicks: 8, effects: { combatBonus: 6, reconBonus: 10, defenseBonus: 5 }, requiredLevel: 4, requiredTrait: "tactician" },
  { id: "flanking_maneuver", name: "Flanking Maneuver", description: "Send troops around the enemy position.", icon: "arrow-split", cooldownTicks: 10, effects: { combatBonus: 10, damageMult: 1.4 }, requiredLevel: 4, requiredTrait: "cunning" },
  { id: "inspire_troops", name: "Inspire Troops", description: "Powerful speech. Troops gain XP bonus and morale.", icon: "star-shooting", cooldownTicks: 15, effects: { moraleBonus: 25, xpBonus: 0.3 }, requiredLevel: 3, requiredTrait: "inspiring" },
  { id: "demolition_order", name: "Demolition Order", description: "Bring down structures on enemy positions.", icon: "explosion", cooldownTicks: 12, effects: { combatBonus: 15, damageMult: 1.6 }, requiredLevel: 5 },
  { id: "recon_sweep", name: "Recon Sweep", description: "Deploy scouts for intelligence gathering.", icon: "radar", cooldownTicks: 6, effects: { reconBonus: 25, combatBonus: 3 }, requiredLevel: 2 },
  { id: "last_stand", name: "Last Stand", description: "Do or die. Massive combat boost at the cost of everything.", icon: "skull", cooldownTicks: 20, effects: { combatBonus: 25, damageMult: 2.0, moraleBonus: -15 }, requiredLevel: 6, requiredTrait: "ruthless" },
];

export interface SquadSynergyDef {
  id: string;
  name: string;
  description: string;
  requiredClasses: TroopClassId[];
  minCount: Record<string, number>;
  bonuses: Partial<{
    combatBonus: number;
    defenseBonus: number;
    moraleBonus: number;
    reconBonus: number;
    healingBonus: number;
    xpBonus: number;
  }>;
}

export const SQUAD_SYNERGIES: SquadSynergyDef[] = [
  {
    id: "combined_arms", name: "Combined Arms", description: "Infantry + Heavy Gunner + Marksman — full-spectrum firepower.",
    requiredClasses: ["infantry", "heavy_gunner", "marksman"], minCount: { infantry: 1, heavy_gunner: 1, marksman: 1 },
    bonuses: { combatBonus: 8, defenseBonus: 3 },
  },
  {
    id: "breach_team", name: "Breach Team", description: "Breacher + Shocktrooper + Demolisher — nothing stays standing.",
    requiredClasses: ["breacher", "shocktrooper", "demolisher"], minCount: { breacher: 1, shocktrooper: 1, demolisher: 1 },
    bonuses: { combatBonus: 12, moraleBonus: 5 },
  },
  {
    id: "recon_force", name: "Recon Force", description: "Scout + Dragoon — fast, mobile, deadly.",
    requiredClasses: ["scout", "dragoon"], minCount: { scout: 1, dragoon: 1 },
    bonuses: { reconBonus: 15, combatBonus: 4 },
  },
  {
    id: "iron_wall", name: "Iron Wall", description: "Engineer + Infantry + Heavy Gunner — an immovable defense.",
    requiredClasses: ["engineer", "infantry", "heavy_gunner"], minCount: { engineer: 1, infantry: 2, heavy_gunner: 1 },
    bonuses: { defenseBonus: 15, moraleBonus: 5 },
  },
  {
    id: "medic_corps", name: "Medic Corps", description: "Medic + War Medic — the squad never falls.",
    requiredClasses: ["medic", "war_medic"], minCount: { medic: 1, war_medic: 1 },
    bonuses: { healingBonus: 20, moraleBonus: 10, defenseBonus: 3 },
  },
  {
    id: "cyber_strike", name: "Cyber Strike", description: "Cyber-Operative + Dragoon — augmented rapid assault.",
    requiredClasses: ["cyber_operative", "dragoon"], minCount: { cyber_operative: 1, dragoon: 1 },
    bonuses: { combatBonus: 10, reconBonus: 8 },
  },
  {
    id: "shock_and_awe", name: "Shock & Awe", description: "Shocktrooper + Demolisher + Heavy Gunner — overwhelming firepower.",
    requiredClasses: ["shocktrooper", "demolisher", "heavy_gunner"], minCount: { shocktrooper: 1, demolisher: 1, heavy_gunner: 1 },
    bonuses: { combatBonus: 15 },
  },
  {
    id: "balanced_force", name: "Balanced Force", description: "At least 4 different classes — versatile and adaptive.",
    requiredClasses: [], minCount: {},
    bonuses: { combatBonus: 5, defenseBonus: 5, moraleBonus: 5 },
  },
];

export function getSquadSynergies(troopClassIds: TroopClassId[]): SquadSynergyDef[] {
  const classCounts: Record<string, number> = {};
  for (const c of troopClassIds) classCounts[c] = (classCounts[c] ?? 0) + 1;

  return SQUAD_SYNERGIES.filter(syn => {
    if (syn.id === "balanced_force") {
      return new Set(troopClassIds).size >= 4;
    }
    for (const [classId, count] of Object.entries(syn.minCount)) {
      if ((classCounts[classId] ?? 0) < count) return false;
    }
    return true;
  });
}

export type SpecializationPath = "assault" | "defense" | "stealth" | "support";

export interface SpecializationDef {
  id: SpecializationPath;
  name: string;
  description: string;
  icon: string;
  eligibleClasses: TroopClassId[];
  ticksRequired: number;
  cost: number;
  bonuses: Partial<{
    attack: number;
    defense: number;
    speed: number;
    recon: number;
    healing: number;
    morale: number;
  }>;
}

export const SPECIALIZATIONS: SpecializationDef[] = [
  {
    id: "assault", name: "Assault Specialist", description: "Intensive combat drills. Maximizes offensive output.",
    icon: "sword", eligibleClasses: ["infantry", "shocktrooper", "breacher", "dragoon", "demolisher", "heavy_gunner"],
    ticksRequired: 16, cost: 200, bonuses: { attack: 3, speed: 1 },
  },
  {
    id: "defense", name: "Fortification Specialist", description: "Defensive tactics and entrenchment training.",
    icon: "shield", eligibleClasses: ["infantry", "engineer", "heavy_gunner", "war_medic", "breacher"],
    ticksRequired: 16, cost: 200, bonuses: { defense: 3, morale: 2 },
  },
  {
    id: "stealth", name: "Stealth Operator", description: "Infiltration, silent movement, covert operations.",
    icon: "ninja", eligibleClasses: ["scout", "cyber_operative", "dragoon", "breacher"],
    ticksRequired: 20, cost: 300, bonuses: { recon: 4, speed: 2 },
  },
  {
    id: "support", name: "Support Specialist", description: "Advanced field medicine and logistics training.",
    icon: "hospital-box", eligibleClasses: ["medic", "war_medic", "engineer"],
    ticksRequired: 14, cost: 180, bonuses: { healing: 3, defense: 1, morale: 2 },
  },
];

export interface GroupDrillDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  ticksRequired: number;
  cost: number;
  minSquadSize: number;
  effects: Partial<{
    xpPerTroop: number;
    moraleBonus: number;
    combatBonus: number;
    formationBonus: number;
  }>;
}

export const GROUP_DRILLS: GroupDrillDef[] = [
  { id: "basic_drill", name: "Basic Drill", description: "Standard formation training. XP for all troops.", icon: "human-male-male", ticksRequired: 4, cost: 100, minSquadSize: 3, effects: { xpPerTroop: 15, moraleBonus: 3 } },
  { id: "combat_exercise", name: "Combat Exercise", description: "Live-fire training scenarios. High XP, some risk.", icon: "sword-cross", ticksRequired: 6, cost: 250, minSquadSize: 4, effects: { xpPerTroop: 30, combatBonus: 2 } },
  { id: "formation_drill", name: "Formation Drill", description: "Coordinated movement practice. Improves squad cohesion.", icon: "account-multiple", ticksRequired: 8, cost: 200, minSquadSize: 5, effects: { xpPerTroop: 20, formationBonus: 5, moraleBonus: 5 } },
  { id: "endurance_march", name: "Endurance March", description: "Long-range forced march. Builds resilience.", icon: "walk", ticksRequired: 10, cost: 150, minSquadSize: 4, effects: { xpPerTroop: 25, moraleBonus: 8 } },
  { id: "siege_exercise", name: "Siege Exercise", description: "Practice assaulting fortified positions.", icon: "castle", ticksRequired: 8, cost: 350, minSquadSize: 6, effects: { xpPerTroop: 35, combatBonus: 4 } },
];

let _troopIdCounter = 0;
export function genTroopId(): string { return `trp_${Date.now()}_${++_troopIdCounter}`; }
let _captainIdCounter = 0;
export function genCaptainId(): string { return `cap_${Date.now()}_${++_captainIdCounter}`; }
let _squadIdCounter = 0;
export function genSquadId(): string { return `sqd_${Date.now()}_${++_squadIdCounter}`; }

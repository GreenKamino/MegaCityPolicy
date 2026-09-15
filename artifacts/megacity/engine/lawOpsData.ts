import type { GameState, TickEntry } from "@/engine/types";

export type LawMissionCategory = "patrol" | "raid" | "investigation" | "rescue" | "expedition" | "undercover" | "riot" | "escort";

export type LawMissionDef = {
  id: string;
  name: string;
  cost: number;
  risk: "low" | "medium" | "high" | "extreme";
  category: LawMissionCategory;
  description: string;
  crimeReduction: number;
  lawBonus: number;
  requiredUnits: number;
};

export const LAW_MISSION_CATEGORIES: Record<LawMissionCategory, string> = {
  patrol: "PATROL",
  raid: "RAID",
  investigation: "INVESTIGATION",
  rescue: "RESCUE",
  expedition: "EXPEDITION",
  undercover: "UNDERCOVER",
  riot: "RIOT CONTROL",
  escort: "ESCORT",
};

export const LAW_MISSIONS: LawMissionDef[] = [
  { id: "underhive_sweep", name: "Underhive Sweep", cost: 3000, risk: "medium", category: "patrol", description: "Clear criminal elements from underhive sectors", crimeReduction: 3, lawBonus: 2, requiredUnits: 10 },
  { id: "gang_bust", name: "Gang Bust Operation", cost: 5000, risk: "high", category: "raid", description: "Raid known gang headquarters", crimeReduction: 5, lawBonus: 3, requiredUnits: 20 },
  { id: "corruption_probe", name: "Corruption Probe", cost: 4000, risk: "low", category: "investigation", description: "Investigate corrupt officials", crimeReduction: 1, lawBonus: 2, requiredUnits: 5 },
  { id: "smuggling_intercept", name: "Smuggling Intercept", cost: 2500, risk: "medium", category: "patrol", description: "Intercept contraband shipments at border", crimeReduction: 3, lawBonus: 1, requiredUnits: 8 },
  { id: "riot_response", name: "Riot Response", cost: 6000, risk: "high", category: "riot", description: "Deploy riot control units to flashpoint", crimeReduction: 2, lawBonus: 3, requiredUnits: 25 },
  { id: "witness_protection", name: "Witness Protection", cost: 3500, risk: "low", category: "escort", description: "Protect key witnesses in major cases", crimeReduction: 0, lawBonus: 2, requiredUnits: 4 },
  { id: "serial_hunter", name: "Serial Crime Hunter", cost: 7000, risk: "high", category: "investigation", description: "Track down serial offender terrorizing sectors", crimeReduction: 4, lawBonus: 3, requiredUnits: 12 },
  { id: "drug_lab_raid", name: "Drug Lab Raid", cost: 4500, risk: "medium", category: "raid", description: "Destroy illegal narcotics production facility", crimeReduction: 4, lawBonus: 2, requiredUnits: 15 },
  { id: "checkpoint_ops", name: "Checkpoint Operations", cost: 1500, risk: "low", category: "patrol", description: "Establish vehicle checkpoints at key intersections", crimeReduction: 1, lawBonus: 1, requiredUnits: 6 },
  { id: "wasteland_patrol", name: "Wasteland Patrol", cost: 8000, risk: "high", category: "expedition", description: "Patrol Deadlands border zones", crimeReduction: 2, lawBonus: 2, requiredUnits: 20 },
  { id: "cyber_crime", name: "Cyber Crime Task Force", cost: 5500, risk: "medium", category: "investigation", description: "Investigate digital crimes and data breaches", crimeReduction: 3, lawBonus: 2, requiredUnits: 8 },
  { id: "missing_persons", name: "Missing Persons Unit", cost: 2000, risk: "low", category: "investigation", description: "Investigate disappearances across the city", crimeReduction: 1, lawBonus: 1, requiredUnits: 4 },

  { id: "black_market_sting", name: "Black Market Sting", cost: 6000, risk: "high", category: "undercover", description: "Infiltrate and bust illegal trade operations", crimeReduction: 5, lawBonus: 3, requiredUnits: 10 },
  { id: "weapons_cache_raid", name: "Weapons Cache Raid", cost: 5000, risk: "high", category: "raid", description: "Seize illegal weapons stockpile", crimeReduction: 4, lawBonus: 2, requiredUnits: 18 },
  { id: "hostage_rescue", name: "Hostage Rescue Op", cost: 8000, risk: "extreme", category: "rescue", description: "Extract hostages from armed captors", crimeReduction: 2, lawBonus: 4, requiredUnits: 15 },
  { id: "sector_lockdown", name: "Sector Lockdown", cost: 4000, risk: "medium", category: "riot", description: "Lock down a volatile district to prevent spread", crimeReduction: 3, lawBonus: 2, requiredUnits: 20 },
  { id: "fugitive_hunt", name: "Fugitive Hunt", cost: 3000, risk: "medium", category: "investigation", description: "Track down escaped prisoners and fugitives", crimeReduction: 2, lawBonus: 2, requiredUnits: 8 },
  { id: "protection_racket_bust", name: "Protection Racket Bust", cost: 4000, risk: "medium", category: "undercover", description: "Dismantle extortion rings in commercial sectors", crimeReduction: 3, lawBonus: 2, requiredUnits: 8 },
  { id: "mutant_zone_incursion", name: "Mutant Zone Incursion", cost: 7000, risk: "high", category: "expedition", description: "Clear dangerous mutant creatures from border areas", crimeReduction: 1, lawBonus: 2, requiredUnits: 25 },
  { id: "vip_escort", name: "VIP Escort Detail", cost: 3000, risk: "medium", category: "escort", description: "Protect high-value officials during transit", crimeReduction: 0, lawBonus: 1, requiredUnits: 6 },
  { id: "evidence_convoy", name: "Evidence Convoy", cost: 2500, risk: "low", category: "escort", description: "Secure transport of sensitive case evidence", crimeReduction: 0, lawBonus: 1, requiredUnits: 4 },
  { id: "organ_trade_bust", name: "Organ Trade Bust", cost: 9000, risk: "extreme", category: "raid", description: "Shut down illegal organ harvesting operation", crimeReduction: 5, lawBonus: 4, requiredUnits: 20 },
  { id: "crowd_control_drill", name: "Crowd Control Deployment", cost: 5000, risk: "medium", category: "riot", description: "Preemptive crowd management at large gatherings", crimeReduction: 1, lawBonus: 2, requiredUnits: 15 },
  { id: "tunnel_clearance", name: "Tunnel Clearance Op", cost: 6000, risk: "high", category: "expedition", description: "Clear smuggling tunnels beneath the city", crimeReduction: 4, lawBonus: 2, requiredUnits: 12 },
  { id: "cold_case_unit", name: "Cold Case Unit", cost: 3000, risk: "low", category: "investigation", description: "Reopen and investigate unsolved cases", crimeReduction: 1, lawBonus: 1, requiredUnits: 3 },
  { id: "corporate_fraud", name: "Corporate Fraud Investigation", cost: 5000, risk: "low", category: "undercover", description: "Investigate financial crimes in corpo sector", crimeReduction: 2, lawBonus: 2, requiredUnits: 6 },
  { id: "disaster_rescue", name: "Disaster Rescue Op", cost: 7000, risk: "high", category: "rescue", description: "Extract civilians from collapsed structures", crimeReduction: 0, lawBonus: 3, requiredUnits: 20 },
  { id: "prison_riot", name: "Prison Riot Suppression", cost: 8000, risk: "extreme", category: "riot", description: "Regain control of rioting prison facility", crimeReduction: 3, lawBonus: 3, requiredUnits: 30 },
  { id: "hazmat_containment", name: "Hazmat Containment", cost: 6000, risk: "high", category: "rescue", description: "Contain toxic spill and evacuate affected area", crimeReduction: 0, lawBonus: 2, requiredUnits: 15 },
  { id: "street_racing_crackdown", name: "Street Racing Crackdown", cost: 2000, risk: "low", category: "patrol", description: "Bust illegal street racing circuits", crimeReduction: 2, lawBonus: 1, requiredUnits: 6 },
];

export const LAW_OPERATION_COOLDOWN_TICKS = 12;

export const LAW_OPERATION_SUCCESS_CHANCE: Record<LawMissionDef["risk"], number> = {
  low: 0.9,
  medium: 0.75,
  high: 0.6,
  extreme: 0.45,
};

const LAW_UNIT_KEYS = [
  "patrolJudges", "rookieJudgeCadets", "seniorJudges", "eliteJudgeStrikeTeams",
  "streetPatrolUnits", "sectorLawSquads", "riotPoliceSquads", "riotShieldUnits",
  "crowdDispersalTeams", "heavyRiotMechUnits", "riotDroneSquads",
  "tacticalSuppressionTeams", "surveillanceDrones", "patrolDrones",
  "riotSuppressionDrones", "investigativeDrones",
] as const;

export type LawOperationBlockReason =
  | "unknown_operation"
  | "insufficient_credits"
  | "insufficient_units"
  | "cooldown";

export type LawOperationAvailability =
  | { ready: true }
  | { ready: false; reason: LawOperationBlockReason; cooldownRemaining?: number };

export type LawOperationDispatchResult =
  | { ok: false; reason: LawOperationBlockReason; cooldownRemaining?: number }
  | {
      ok: true;
      state: GameState;
      mission: LawMissionDef;
      success: boolean;
      crimeDelta: number;
      lawDelta: number;
      successChance: number;
      cooldownUntilTick: number;
    };

export function getAvailableLawUnits(units: GameState["units"]): number {
  return LAW_UNIT_KEYS.reduce((total, key) => total + Math.max(0, Number(units[key]) || 0), 0);
}

export function getLawOperationAvailability(
  mission: LawMissionDef,
  {
    credits,
    availableUnits,
    totalTicks = 0,
    cooldowns = {},
  }: {
    credits: number;
    availableUnits: number;
    totalTicks?: number;
    cooldowns?: Record<string, number>;
  },
): LawOperationAvailability {
  const cooldownRemaining = Math.max(0, Math.ceil((cooldowns[mission.id] ?? 0) - totalTicks));
  if (cooldownRemaining > 0) return { ready: false, reason: "cooldown", cooldownRemaining };
  if (credits < mission.cost) return { ready: false, reason: "insufficient_credits" };
  if (availableUnits < mission.requiredUnits) return { ready: false, reason: "insufficient_units" };
  return { ready: true };
}

export function dispatchLawOperation(
  state: GameState,
  missionId: string,
  roll: number = Math.random(),
): LawOperationDispatchResult {
  const mission = LAW_MISSIONS.find((candidate) => candidate.id === missionId);
  if (!mission) return { ok: false, reason: "unknown_operation" };

  const availability = getLawOperationAvailability(mission, {
    credits: state.resources.credits,
    availableUnits: getAvailableLawUnits(state.units),
    totalTicks: state.totalTicks,
    cooldowns: state.lawOperationCooldowns,
  });
  if (!availability.ready) {
    return {
      ok: false,
      reason: availability.reason,
      cooldownRemaining: availability.cooldownRemaining,
    };
  }

  const successChance = LAW_OPERATION_SUCCESS_CHANCE[mission.risk];
  const success = Math.max(0, Math.min(0.999999, roll)) < successChance;
  const crimeDelta = success ? -mission.crimeReduction : 0;
  const lawDelta = success ? mission.lawBonus : 0;
  const cooldownUntilTick = state.totalTicks + LAW_OPERATION_COOLDOWN_TICKS;
  const outcome = success
    ? `Operation succeeded: crime ${crimeDelta}, law +${lawDelta}.`
    : "Operation met organized resistance. No sector-wide improvement was secured.";
  const entry: TickEntry = {
    label: "Law Field Operation",
    delta: -mission.cost,
    unit: "credits",
    reason: `${mission.name} — ${success ? "successful" : "unsuccessful"}`,
    severity: success ? "neutral" : "warning",
  };

  return {
    ok: true,
    mission,
    success,
    crimeDelta,
    lawDelta,
    successChance,
    cooldownUntilTick,
    state: {
      ...state,
      resources: { ...state.resources, credits: state.resources.credits - mission.cost },
      cityStats: {
        ...state.cityStats,
        crime: Math.max(0, Math.min(100, state.cityStats.crime + crimeDelta)),
        lawOrder: Math.max(0, Math.min(100, state.cityStats.lawOrder + lawDelta)),
      },
      lawOperationCooldowns: {
        ...(state.lawOperationCooldowns ?? {}),
        [mission.id]: cooldownUntilTick,
      },
      pendingTickEntries: [...(state.pendingTickEntries ?? []), entry],
      messages: [
        {
          id: `law-op-${mission.id}-${state.totalTicks}-${(state.pendingTickEntries ?? []).length}`,
          timestamp: { ...state.gameDate },
          tick: state.totalTicks,
          category: "alert" as const,
          title: `${mission.name.toUpperCase()}: ${success ? "OBJECTIVES SECURED" : "OPERATION STALLED"}`,
          body: `${outcome} ${mission.cost.toLocaleString()} credits committed; ${mission.requiredUnits} units deployed.`,
          read: false,
          priority: success ? ("normal" as const) : ("high" as const),
        },
        ...(state.messages ?? []),
      ].slice(0, 200),
    },
  };
}

export const RISK_COLORS: Record<string, string> = {
  low: "#00FF41",
  medium: "#FF9500",
  high: "#FF3B30",
  extreme: "#B855FF",
};

export type TeamRole = {
  id: string;
  name: string;
  unitKey: string;
  icon: string;
  description: string;
};

export const TEAM_ROLES: TeamRole[] = [
  { id: "judge", name: "Street Enforcer", unitKey: "streetJudges", icon: "gavel", description: "Primary law enforcement officer" },
  { id: "riot", name: "Riot Squad", unitKey: "riotSquads", icon: "shield", description: "Heavy crowd control unit" },
  { id: "trooper", name: "Shock Trooper", unitKey: "stormtroopers", icon: "account-cowboy-hat", description: "Frontline combat infantry" },
  { id: "sniper", name: "Sniper Team", unitKey: "sniperTeams", icon: "crosshairs", description: "Long-range precision support" },
  { id: "drone", name: "Combat Drone", unitKey: "combatDrones", icon: "quadcopter", description: "Aerial reconnaissance and fire support" },
  { id: "tech", name: "Tech Marshal", unitKey: "techMarshals", icon: "chip", description: "Technical and cyber operations specialist" },
  { id: "medic", name: "Field Medic", unitKey: "medics", icon: "medical-bag", description: "Combat medical support" },
  { id: "cruiser", name: "Patrol Cruiser", unitKey: "patrolCruisers", icon: "car-emergency", description: "Armored patrol vehicle with crew" },
];

import type { GameState, Officer, TickEntry } from "@/engine/types";
import type { Squad } from "@/engine/retinueData";

export type SecurityWingId = "civil_security" | "secret_police";
export type SecurityWingStatus = "standby" | "deployed";
export type SecurityWingDoctrine = "protective" | "counterinsurgency" | "counterintelligence";
export type SecurityWingJurisdiction = "citywide" | "high_risk_districts";

export type SecurityWing = {
  id: SecurityWingId;
  status: SecurityWingStatus;
  squadIds: string[];
  leaderOfficerId: string | null;
  doctrine: SecurityWingDoctrine;
  jurisdiction: SecurityWingJurisdiction;
  foundedTick: number;
  readiness: number;
  loyalty: number;
  accountability: number;
  lastActionTick: number;
};

export type SecurityWingState = {
  wings: SecurityWing[];
  totalDeployments: number;
  lastReportTick: number;
};

export type SecurityWingDef = {
  id: SecurityWingId;
  name: string;
  role: string;
  description: string;
  researchId: string;
  facilityKey: string;
  leaderPosts: string[];
  minSquads: number;
  minReadyTroops: number;
  establishmentCost: { credits: number; steel: number; goods: number };
  upkeep: { credits: number; ammo: number };
  deploymentEffects: {
    crime: number;
    unrest: number;
    lawOrder: number;
    corruption: number;
    intelligence: number;
  };
};

export type SecurityWingResult = { success: boolean; error?: string };

export const SECURITY_WING_DEFS: SecurityWingDef[] = [
  {
    id: "civil_security",
    name: "Civil Security Wing",
    role: "Public-order and protective security",
    description: "A staffed city security command for patrol coverage, emergency response, and protection of critical districts.",
    researchId: "security_wing_command",
    facilityKey: "security_command_bureau",
    leaderPosts: ["City Enforcement Commander", "Sector Security Marshal", "Tactical Response Commander"],
    minSquads: 1,
    minReadyTroops: 8,
    establishmentCost: { credits: 12000, steel: 20, goods: 30 },
    upkeep: { credits: 350, ammo: 1 },
    deploymentEffects: { crime: -0.8, unrest: -0.6, lawOrder: 0.7, corruption: 0, intelligence: 0 },
  },
  {
    id: "secret_police",
    name: "Secret Police Wing",
    role: "Counterintelligence and internal threat control",
    description: "A covert security command for counterintelligence, hostile-network disruption, and high-risk investigations.",
    researchId: "counterintelligence_directorate",
    facilityKey: "counterintelligence_archive",
    leaderPosts: ["Surveillance Command Director", "Criminal Investigation Director", "Internal Oversight Commissioner", "Intelligence Liaison Officer"],
    minSquads: 1,
    minReadyTroops: 6,
    establishmentCost: { credits: 18000, steel: 25, goods: 45 },
    upkeep: { credits: 550, ammo: 1 },
    deploymentEffects: { crime: -0.5, unrest: 0.25, lawOrder: 0.3, corruption: 0.35, intelligence: 1.1 },
  },
];

export const SECURITY_WING_DOCTRINES: Record<SecurityWingDoctrine, { label: string; description: string }> = {
  protective: { label: "PROTECTIVE", description: "Prioritizes public safety and lowers unrest." },
  counterinsurgency: { label: "COUNTER-INSURGENCY", description: "Prioritizes crime suppression at a higher social cost." },
  counterintelligence: { label: "COUNTERINTELLIGENCE", description: "Prioritizes threat discovery and internal network disruption." },
};

const EMPTY_STATE: SecurityWingState = { wings: [], totalDeployments: 0, lastReportTick: -1 };

export function createDefaultSecurityWingState(): SecurityWingState {
  return { wings: [], totalDeployments: 0, lastReportTick: -1 };
}

export function getSecurityWingDef(id: SecurityWingId): SecurityWingDef {
  return SECURITY_WING_DEFS.find((def) => def.id === id) ?? SECURITY_WING_DEFS[0];
}

export function getSecurityWingState(state: GameState): SecurityWingState {
  return state.securityWings ?? EMPTY_STATE;
}

export function isSecurityWingUnlocked(state: GameState, id: SecurityWingId): boolean {
  return (state.unlockedTechnologies ?? []).includes(getSecurityWingDef(id).researchId);
}

export function getSecurityWingFacilityCount(state: GameState, id: SecurityWingId): number {
  return Math.max(0, Math.floor(Number(state.buildings?.[getSecurityWingDef(id).facilityKey] ?? 0)));
}

function getSquads(state: GameState): Squad[] {
  return Array.isArray(state.retinue?.squads) ? state.retinue!.squads : [];
}

function squadReadyTroops(state: GameState, squad: Squad): number {
  const troopMap = new Map((state.retinue?.troops ?? []).map((troop) => [troop.id, troop]));
  return squad.troopIds.filter((id) => {
    const troop = troopMap.get(id);
    return troop?.status === "ready";
  }).length;
}

export function getAssignedSecurityWingId(state: GameState, squadId: string): SecurityWingId | null {
  for (const wing of getSecurityWingState(state).wings) {
    if (wing.squadIds.includes(squadId)) return wing.id;
  }
  return null;
}

export function getSecurityWingLeader(state: GameState, wing: SecurityWing): Officer | null {
  return state.officers.find((officer) => officer.id === wing.leaderOfficerId) ?? null;
}

export function getSecurityWingReadiness(state: GameState, wing: SecurityWing): {
  readiness: number;
  readyTroops: number;
  staffed: boolean;
  leader: Officer | null;
} {
  const def = getSecurityWingDef(wing.id);
  const squads = getSquads(state).filter((squad) => wing.squadIds.includes(squad.id));
  const readyTroops = squads.reduce((sum, squad) => sum + squadReadyTroops(state, squad), 0);
  const leader = getSecurityWingLeader(state, wing);
  const staffed = squads.length >= def.minSquads && readyTroops >= def.minReadyTroops;
  const leaderBonus = leader ? Math.max(0, Math.min(15, Math.round((leader.competence - 50) / 4))) : -15;
  const squadCoverage = Math.min(70, readyTroops * 5);
  const readiness = Math.max(0, Math.min(100, Math.round((staffed ? 25 : 0) + squadCoverage + leaderBonus)));
  return { readiness, readyTroops, staffed, leader };
}

function cloneSecurityState(state: GameState): SecurityWingState {
  return {
    ...(state.securityWings ?? createDefaultSecurityWingState()),
    wings: (state.securityWings?.wings ?? []).map((wing) => ({ ...wing, squadIds: [...wing.squadIds] })),
  };
}

function canAfford(state: GameState, cost: SecurityWingDef["establishmentCost"]): boolean {
  return state.resources.credits >= cost.credits
    && state.resources.steel >= cost.steel
    && state.resources.goods >= cost.goods;
}

export function establishSecurityWing(state: GameState, id: SecurityWingId): SecurityWingResult {
  const def = getSecurityWingDef(id);
  if (!isSecurityWingUnlocked(state, id)) return { success: false, error: `Requires ${def.name} research` };
  if (getSecurityWingFacilityCount(state, id) < 1) return { success: false, error: `Requires ${def.facilityKey}` };
  const security = cloneSecurityState(state);
  if (security.wings.some((wing) => wing.id === id)) return { success: false, error: "Wing already established" };
  if (!canAfford(state, def.establishmentCost)) return { success: false, error: "Insufficient credits, steel, or goods" };
  state.resources.credits -= def.establishmentCost.credits;
  state.resources.steel -= def.establishmentCost.steel;
  state.resources.goods -= def.establishmentCost.goods;
  security.wings.push({
    id,
    status: "standby",
    squadIds: [],
    leaderOfficerId: null,
    doctrine: id === "secret_police" ? "counterintelligence" : "protective",
    jurisdiction: "citywide",
    foundedTick: state.totalTicks,
    readiness: 0,
    loyalty: 50,
    accountability: id === "secret_police" ? 35 : 65,
    lastActionTick: state.totalTicks,
  });
  state.securityWings = security;
  return { success: true };
}

export function assignSecurityWingSquad(state: GameState, wingId: SecurityWingId, squadId: string): SecurityWingResult {
  const security = cloneSecurityState(state);
  const wing = security.wings.find((candidate) => candidate.id === wingId);
  if (!wing) return { success: false, error: "Wing is not established" };
  const squad = getSquads(state).find((candidate) => candidate.id === squadId);
  if (!squad) return { success: false, error: "Squad not found" };
  if (wing.squadIds.includes(squadId)) return { success: false, error: "Squad is already assigned to this wing" };
  if (getAssignedSecurityWingId(state, squadId)) return { success: false, error: "Squad is already assigned to another security wing" };
  if (state.retinue?.activeOperation?.squadId === squadId) return { success: false, error: "Deployed squads cannot be reassigned" };
  const def = getSecurityWingDef(wingId);
  if (squadReadyTroops(state, squad) < Math.max(1, Math.ceil(def.minReadyTroops / 2))) {
    return { success: false, error: `Squad needs ${Math.ceil(def.minReadyTroops / 2)} ready personnel` };
  }
  wing.squadIds.push(squadId);
  state.securityWings = security;
  return { success: true };
}

export function unassignSecurityWingSquad(state: GameState, wingId: SecurityWingId, squadId: string): SecurityWingResult {
  const security = cloneSecurityState(state);
  const wing = security.wings.find((candidate) => candidate.id === wingId);
  if (!wing) return { success: false, error: "Wing is not established" };
  if (wing.status === "deployed") return { success: false, error: "Stand down the wing before changing staffing" };
  if (!wing.squadIds.includes(squadId)) return { success: false, error: "Squad is not assigned to this wing" };
  wing.squadIds = wing.squadIds.filter((idValue) => idValue !== squadId);
  state.securityWings = security;
  return { success: true };
}

export function appointSecurityWingLeader(state: GameState, wingId: SecurityWingId, officerId: string | null): SecurityWingResult {
  const security = cloneSecurityState(state);
  const wing = security.wings.find((candidate) => candidate.id === wingId);
  if (!wing) return { success: false, error: "Wing is not established" };
  if (wing.status === "deployed") return { success: false, error: "Stand down the wing before changing command" };
  if (officerId === null) {
    wing.leaderOfficerId = null;
    state.securityWings = security;
    return { success: true };
  }
  const def = getSecurityWingDef(wingId);
  const officer = state.officers.find((candidate) => candidate.id === officerId);
  if (!officer || !officer.appointed) return { success: false, error: "Appoint the officer before assigning command" };
  if (!def.leaderPosts.includes(officer.position)) return { success: false, error: "Officer does not hold an eligible command post" };
  const other = security.wings.find((candidate) => candidate.leaderOfficerId === officerId && candidate.id !== wingId);
  if (other) return { success: false, error: "Officer already commands another security wing" };
  wing.leaderOfficerId = officerId;
  state.securityWings = security;
  return { success: true };
}

export function setSecurityWingDoctrine(state: GameState, wingId: SecurityWingId, doctrine: SecurityWingDoctrine): SecurityWingResult {
  const security = cloneSecurityState(state);
  const wing = security.wings.find((candidate) => candidate.id === wingId);
  if (!wing) return { success: false, error: "Wing is not established" };
  if (wing.status === "deployed") return { success: false, error: "Stand down the wing before changing doctrine" };
  if (!SECURITY_WING_DOCTRINES[doctrine]) return { success: false, error: "Unknown doctrine" };
  wing.doctrine = doctrine;
  state.securityWings = security;
  return { success: true };
}

export function setSecurityWingJurisdiction(state: GameState, wingId: SecurityWingId, jurisdiction: SecurityWingJurisdiction): SecurityWingResult {
  const security = cloneSecurityState(state);
  const wing = security.wings.find((candidate) => candidate.id === wingId);
  if (!wing) return { success: false, error: "Wing is not established" };
  if (wing.status === "deployed") return { success: false, error: "Stand down the wing before changing jurisdiction" };
  wing.jurisdiction = jurisdiction;
  state.securityWings = security;
  return { success: true };
}

export function deploySecurityWing(state: GameState, wingId: SecurityWingId): SecurityWingResult {
  const security = cloneSecurityState(state);
  const wing = security.wings.find((candidate) => candidate.id === wingId);
  if (!wing) return { success: false, error: "Wing is not established" };
  if (wing.status === "deployed") return { success: false, error: "Wing is already deployed" };
  const report = getSecurityWingReadiness(state, wing);
  if (!report.staffed) return { success: false, error: `Staffing shortfall: ${report.readyTroops} ready personnel` };
  if (!report.leader) return { success: false, error: "Assign an eligible officer before deployment" };
  wing.status = "deployed";
  wing.readiness = report.readiness;
  wing.lastActionTick = state.totalTicks;
  security.totalDeployments += 1;
  state.securityWings = security;
  return { success: true };
}

export function standDownSecurityWing(state: GameState, wingId: SecurityWingId): SecurityWingResult {
  const security = cloneSecurityState(state);
  const wing = security.wings.find((candidate) => candidate.id === wingId);
  if (!wing) return { success: false, error: "Wing is not established" };
  wing.status = "standby";
  wing.lastActionTick = state.totalTicks;
  state.securityWings = security;
  return { success: true };
}

export function processSecurityWingsTick(state: GameState, entries: TickEntry[]): void {
  const current = state.securityWings;
  if (!current?.wings?.length) return;
  const security = cloneSecurityState(state);
  const policy = state.activePolicies ?? [];
  for (const wing of security.wings) {
    const report = getSecurityWingReadiness(state, wing);
    wing.readiness = report.readiness;
    if (wing.status !== "deployed") continue;
    const def = getSecurityWingDef(wing.id);
    const leader = report.leader;
    const leaderEffect = leader?.traits.includes("intelligence_officer") ? 0.1 : 0;
    const doctrineMultiplier = wing.doctrine === "counterinsurgency" ? 1.2 : wing.doctrine === "protective" ? 0.85 : 1;
    const readinessMultiplier = report.staffed ? report.readiness / 100 : 0;
    const facilityMultiplier = Math.min(1, getSecurityWingFacilityCount(state, wing.id));
    const scale = doctrineMultiplier * readinessMultiplier * facilityMultiplier;
    const stats = state.cityStats;
    stats.crime = Math.max(0, Math.min(100, stats.crime + def.deploymentEffects.crime * scale));
    stats.unrest = Math.max(0, Math.min(100, stats.unrest + (def.deploymentEffects.unrest + (wing.doctrine === "counterinsurgency" ? 0.2 : 0)) * scale));
    stats.lawOrder = Math.max(0, Math.min(100, stats.lawOrder + def.deploymentEffects.lawOrder * scale));
    stats.corruption = Math.max(0, Math.min(100, stats.corruption + def.deploymentEffects.corruption * scale));
    if (def.deploymentEffects.intelligence || leaderEffect) {
      const intel = state.intelligence;
      if (intel) {
        intel.securityLevel = Math.max(0, Math.min(100, intel.securityLevel + (def.deploymentEffects.intelligence + leaderEffect) * scale));
        intel.counterIntelRating = Math.max(0, Math.min(100, intel.counterIntelRating + (def.deploymentEffects.intelligence + leaderEffect) * scale));
      }
    }
    if (state.resources.credits >= def.upkeep.credits) {
      state.resources.credits -= def.upkeep.credits;
      if (state.resources.ammo >= def.upkeep.ammo) state.resources.ammo -= def.upkeep.ammo;
      else wing.readiness = Math.max(0, wing.readiness - 10);
      entries.push({ label: def.name, delta: -def.upkeep.credits, unit: "credits", reason: `${def.name} deployment upkeep`, severity: "neutral" });
    } else {
      wing.readiness = Math.max(0, wing.readiness - 12);
      wing.status = "standby";
      entries.push({ label: def.name, delta: 0, unit: "", reason: "Deployment stood down: upkeep funding unavailable", severity: "warning" });
    }
    if (policy.includes("thoughtcrimeUnit") && wing.id === "secret_police") {
      stats.happiness = Math.max(0, Math.min(100, stats.happiness - 0.3 * scale));
    }
  }
  security.lastReportTick = state.totalTicks;
  state.securityWings = security;
}

export function getSecurityWingSummary(state: GameState) {
  return SECURITY_WING_DEFS.map((def) => {
    const wing = getSecurityWingState(state).wings.find((candidate) => candidate.id === def.id) ?? null;
    const report = wing ? getSecurityWingReadiness(state, wing) : null;
    return {
      def,
      wing,
      report,
      facilityCount: getSecurityWingFacilityCount(state, def.id),
      unlocked: isSecurityWingUnlocked(state, def.id),
    };
  });
}

export function sanitizeSecurityWings(state: GameState): SecurityWingState {
  const raw = state.securityWings;
  if (!raw || typeof raw !== "object") return createDefaultSecurityWingState();
  const validSquads = new Set(getSquads(state).map((squad) => squad.id));
  const validOfficers = new Map(state.officers.map((officer) => [officer.id, officer]));
  const assigned = new Set<string>();
  const wings: SecurityWing[] = [];
  for (const rawWing of Array.isArray(raw.wings) ? raw.wings : []) {
    if (!rawWing || (rawWing.id !== "civil_security" && rawWing.id !== "secret_police")) continue;
    if (wings.some((wing) => wing.id === rawWing.id)) continue;
    const def = getSecurityWingDef(rawWing.id);
    const wingAssigned = new Set<string>();
    const squadIds = Array.isArray(rawWing.squadIds)
      ? rawWing.squadIds.filter((id): id is string => {
          if (typeof id !== "string" || !validSquads.has(id) || assigned.has(id) || wingAssigned.has(id)) return false;
          wingAssigned.add(id);
          return true;
        })
      : [];
    squadIds.forEach((id) => assigned.add(id));
    const leader = typeof rawWing.leaderOfficerId === "string" ? validOfficers.get(rawWing.leaderOfficerId) : null;
    const leaderOfficerId = leader?.appointed && def.leaderPosts.includes(leader.position) ? leader.id : null;
    wings.push({
      id: rawWing.id,
      status: rawWing.status === "deployed" ? "deployed" : "standby",
      squadIds,
      leaderOfficerId,
      doctrine: SECURITY_WING_DOCTRINES[rawWing.doctrine] ? rawWing.doctrine : rawWing.id === "secret_police" ? "counterintelligence" : "protective",
      jurisdiction: rawWing.jurisdiction === "high_risk_districts" ? "high_risk_districts" : "citywide",
      foundedTick: Math.max(0, Math.floor(Number(rawWing.foundedTick) || 0)),
      readiness: Math.max(0, Math.min(100, Math.floor(Number(rawWing.readiness) || 0))),
      loyalty: Math.max(0, Math.min(100, Math.floor(Number(rawWing.loyalty) || 50))),
      accountability: Math.max(0, Math.min(100, Math.floor(Number(rawWing.accountability) || 50))),
      lastActionTick: Math.max(0, Math.floor(Number(rawWing.lastActionTick) || 0)),
    });
  }
  return {
    wings,
    totalDeployments: Math.max(0, Math.floor(Number(raw.totalDeployments) || 0)),
    lastReportTick: Math.max(-1, Math.floor(Number(raw.lastReportTick) || -1)),
  };
}
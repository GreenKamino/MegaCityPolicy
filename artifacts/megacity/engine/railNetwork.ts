import type { ExternalMegacity, GameMessage, GameState, RailCorridor, RailLocation, RailTrainUpgradeId, Township } from "@/engine/types";
import { LOCATION_POSITIONS } from "@/engine/worldMapPositions";
import { WORLD_LOCATIONS } from "@/engine/worldMap";
import { reconcileInfrastructureLedger, withInfrastructureLedger } from "@/engine/infrastructureLedger";

export type RailEndpoint = { id: string; kind: "megacity" | "township"; name: string; location: RailLocation; controlled: boolean; needsConsent: boolean };
export type RailResult = { ok: true; state: GameState; corridor?: RailCorridor } | { ok: false; reason: string; state: GameState };
export const MAX_RAIL_STAFF_PER_ROLE = 100_000;
export const STANDARD_RAIL_CREW: RailCorridor["staffing"] = {
  robots: 0, engineers: 2, railWorkers: 10, security: 1, ticketing: 1, admin: 1, maintenance: 1,
};
/** Robots replace repetitive track labor only; accountable roles remain staffed. */
export const AUTOMATED_RAIL_CREW: RailCorridor["staffing"] = {
  robots: 10, engineers: 2, railWorkers: 0, security: 1, ticketing: 1, admin: 1, maintenance: 1,
};
export type RailUpgradeContribution = {
  corridorId: string;
  endpointId: string;
  endpointName: string;
  upgradeId: RailTrainUpgradeId;
  name: string;
  effects: {
    safetyResilience?: number;
    armedSecurityBenefit?: number;
    troopTransportCapacity?: number;
  };
};
export const RAIL_TRAIN_UPGRADES: Record<RailTrainUpgradeId, {
  id: RailTrainUpgradeId;
  name: string;
  researchId: string;
  credits: number;
  steel: number;
  effects: { safetyResilience?: number; armedSecurityBenefit?: number; troopTransportCapacity?: number };
}> = {
  armored_train_plating: {
    id: "armored_train_plating", name: "Armored train plating", researchId: "armored_train_plating",
    credits: 4_500, steel: 1_200, effects: { safetyResilience: 20 },
  },
  troop_transport_carriages: {
    id: "troop_transport_carriages", name: "Troop-transport carriages", researchId: "troop_transport_carriages",
    credits: 6_000, steel: 1_800, effects: { troopTransportCapacity: 40 },
  },
  weaponized_escort_cars: {
    id: "weaponized_escort_cars", name: "Weaponized escort cars", researchId: "weaponized_escort_cars",
    credits: 7_500, steel: 2_400, effects: { safetyResilience: 5, armedSecurityBenefit: 16 },
  },
};
const RAIL_TRAIN_UPGRADE_IDS = Object.keys(RAIL_TRAIN_UPGRADES) as RailTrainUpgradeId[];
const REQUIRED_RAIL_JOBS: RailCorridor["staffing"] = {
  robots: 0, engineers: 2, railWorkers: 10, security: 1, ticketing: 1, admin: 1, maintenance: 1,
};
const RAIL_ROLE_LABELS: Record<keyof RailCorridor["staffing"], string> = {
  robots: "automated robots",
  engineers: "engineers",
  railWorkers: "rail workers",
  security: "security officers",
  ticketing: "ticketing staff",
  admin: "administrators",
  maintenance: "maintenance crew",
};
const ACTIVE = new Set<RailCorridor["status"]>(["consent_pending", "under_construction", "disrupted"]);
/**
 * Stable world IDs for controlled settlements where an authored port is a
 * valid rail terminus.  This is deliberately ID-only: endpoint eligibility
 * must never derive a port from a translated name or a description string.
 */
export const CONTROLLED_RAIL_PORT_IDS = new Set<string>(["port-sulphur"]);
const DAY_TICKS = (s: GameState) => Math.max(1, Math.round(24 * 60 / (s.tickIntervalMinutes || 15)));
const YEAR_TICKS = (s: GameState) => DAY_TICKS(s) * 365;
const hash = (text: string) => [...text].reduce((n, c) => ((n * 33 + c.charCodeAt(0)) >>> 0), 5381);
const msg = (s: GameState, id: string, title: string, body: string): GameMessage => ({ id, tick: s.totalTicks, timestamp: s.gameDate, category: "update", title, body, read: false, priority: "normal" });
export function getRailDistanceAndDuration(state: GameState, endpointId: string) {
  const end = find(state, endpointId);
  if (!end) return { ok: false as const, reason: "endpoint_ineligible" };
  const origin = LOCATION_POSITIONS.megacity;
  const distance = Math.round(Math.hypot(end.location.x - origin.x, end.location.y - origin.y));
  const seed = hash(`${endpointId}:${state.totalTicks}`);
  const years = Math.max(5, Math.min(15, 5 + Math.floor(distance / 100) + seed % 3));
  const baseTicks = years * YEAR_TICKS(state);
  // A deterministic delay is included in the frozen schedule, not merely displayed.
  const setbackTicks = Math.min(Math.max(0, YEAR_TICKS(state) - 1), seed % Math.max(1, YEAR_TICKS(state)));
  const totalTicks = Math.max(5 * YEAR_TICKS(state), Math.min(15 * YEAR_TICKS(state), baseTicks + setbackTicks));
  return { ok: true as const, distance, years, setbackTicks, totalTicks };
}

function endpoint(entity: ExternalMegacity | Township, kind: RailEndpoint["kind"], discovered: Set<string>): RailEndpoint | null {
  // railLocation is retained as a migration/test override, while production
  // entities resolve from the canonical world-map coordinate table.
  const mapped = LOCATION_POSITIONS[entity.id];
  const override = entity.railLocation;
  const coordinates = override && Number.isFinite(override.x) && Number.isFinite(override.y)
    ? override : mapped;
  const world = WORLD_LOCATIONS.find(location => location.id === entity.id);
  if (!coordinates || (!world && !override) || (world && !world.discovered && !discovered.has(entity.id))) return null;
  const location: RailLocation = {
    id: entity.id,
    x: coordinates.x,
    y: coordinates.y,
    railPort: override?.railPort || CONTROLLED_RAIL_PORT_IDS.has(entity.id),
  };
  const controlled = entity.controlStatus === "occupied" || entity.controlStatus === "annexed";
  if (entity.endState === "fallen") return null;
  if (kind === "megacity") {
    const megacity = entity as ExternalMegacity;
    if (!megacity.isActive || megacity.continuance || (!controlled && megacity.stance === "hostile")) return null;
  } else {
    const township = entity as Township;
    if (!controlled && (township.status !== "allied" || township.stance === "hostile")) return null;
  }
  // A controlled port is an additional eligible terminus; controlled cities
  // and townships do not need to be ports to be eligible.
  return { id: entity.id, kind, name: entity.name, location, controlled, needsConsent: !controlled };
}
export function getEligibleRailEndpoints(state: GameState): RailEndpoint[] {
  const discovered = new Set(state.discoveredLocationIds || []);
  return [
    ...(state.externalMegacities || []).map(x => endpoint(x, "megacity", discovered)),
    ...(state.townships || []).map(x => endpoint(x, "township", discovered)),
  ].filter((x): x is RailEndpoint => !!x).sort((a, b) => a.id.localeCompare(b.id));
}
function find(state: GameState, id: string) { return getEligibleRailEndpoints(state).find(x => x.id === id); }
function clone(state: GameState, railCorridors: RailCorridor[], messages = state.messages) { return { ...state, railCorridors, messages }; }
function normalizeStaffing(staffing: Partial<RailCorridor["staffing"]>): RailCorridor["staffing"] {
  const out = { ...STANDARD_RAIL_CREW };
  // Configuration is complete rather than additive: omitted roles are zero,
  // making an intentional empty crew a visible, safe stalled state.
  for (const key of Object.keys(out) as (keyof RailCorridor["staffing"])[]) {
    const value = staffing[key] ?? 0;
    out[key] = Number.isFinite(value) ? Math.min(MAX_RAIL_STAFF_PER_ROLE, Math.max(0, Math.floor(value))) : 0;
  }
  return out;
}
export function getRailTrainUpgradeAvailability(state: GameState, corridor: RailCorridor, upgradeId: RailTrainUpgradeId) {
  const upgrade = RAIL_TRAIN_UPGRADES[upgradeId];
  if (!upgrade) return { available: false as const, reason: "unknown_upgrade" };
  if (corridor.status !== "completed") return { available: false as const, reason: "corridor_not_completed" };
  if ((corridor.installedTrainUpgrades || []).includes(upgradeId)) return { available: false as const, reason: "upgrade_already_installed" };
  if (!(state.unlockedTechnologies || []).includes(upgrade.researchId)) return { available: false as const, reason: `missing_research:${upgrade.researchId}` };
  if (state.resources.credits < upgrade.credits || state.resources.steel < upgrade.steel) {
    return { available: false as const, reason: "insufficient_funds", credits: upgrade.credits, steel: upgrade.steel };
  }
  return { available: true as const, upgrade };
}
export function installRailTrainUpgrade(state: GameState, corridorId: string, upgradeId: RailTrainUpgradeId): RailResult {
  const corridor = (state.railCorridors || []).find(item => item.id === corridorId);
  if (!corridor) return { ok: false, state, reason: "corridor_not_found" };
  const availability = getRailTrainUpgradeAvailability(state, corridor, upgradeId);
  if (!availability.available) return { ok: false, state, reason: availability.reason };
  const upgrade = availability.upgrade;
  const nextCorridor = {
    ...corridor,
    installedTrainUpgrades: [...(corridor.installedTrainUpgrades || []), upgradeId],
  };
  const next = clone({
    ...state,
    resources: {
      ...state.resources,
      credits: state.resources.credits - upgrade.credits,
      steel: state.resources.steel - upgrade.steel,
    },
    pendingTickEntries: [
      ...(state.pendingTickEntries || []),
      { label: "Rail Train Upgrade", delta: -upgrade.credits, unit: "credits", reason: `${upgrade.name}: ${corridor.endpointId}`, severity: "negative" },
      { label: "Rail Train Upgrade", delta: -upgrade.steel, unit: "steel", reason: `${upgrade.name}: ${corridor.endpointId}`, severity: "negative" },
    ],
  }, (state.railCorridors || []).map(item => item.id === corridorId ? nextCorridor : item));
  return { ok: true, state: next, corridor: nextCorridor };
}
function routeCapabilities(state: GameState) {
  const tech = new Set(state.unlockedTechnologies || []);
  if (!tech.has("basic_railways")) return [] as RailCorridor["capabilities"];
  const out: RailCorridor["capabilities"] = ["commercial"];
  if (tech.has("advanced_train_designs") && tech.has("railway_electrification")) out.push("passenger");
  if (tech.has("rail_freight_systems")) out.push("freight");
  if (tech.has("rail_freight_systems") && tech.has("railway_electrification")) out.push("industrial");
  if (tech.has("passenger_intermodal_rail")) out.push("intermodal");
  // Maglev is an upgrade to the passenger service; its presence is captured
  // in the frozen capability eligibility rather than inferred later.
  if (tech.has("magnetic_levitation_rail") && !out.includes("passenger")) out.push("passenger");
  return out;
}
export function getRailCorridorCapabilities(state: GameState, corridor: RailCorridor) {
  return routeCapabilities(state);
}
export function getRailCorridorQuote(state: GameState, endpointId: string) {
  const end = find(state, endpointId);
  if (!end) return { ok: false as const, reason: "endpoint_ineligible" };
  if (!(state.unlockedTechnologies || []).includes("basic_railways")) return { ok: false as const, reason: "missing_basic_railways" };
  if ((state.railCorridors || []).some(r => ACTIVE.has(r.status) && r.endpointId === endpointId)) return { ok: false as const, reason: "active_pair_exists" };
  const duration = getRailDistanceAndDuration(state, endpointId);
  if (!duration.ok) return duration;
  const committedCredits = 2_000 + duration.distance * 8;
  const committedSteel = 100 + Math.ceil(duration.distance / 2);
  if (state.resources.credits < committedCredits || state.resources.steel < committedSteel) return { ...duration, ok: false as const, reason: "insufficient_funds", committedCredits, committedSteel };
  return { ...duration, ok: true as const, endpoint: end, committedCredits, committedSteel };
}
export function proposeRailCorridor(state: GameState, endpointId: string, staffing: Partial<RailCorridor["staffing"]> = {}): RailResult {
  const quote = getRailCorridorQuote(state, endpointId);
  if (!quote.ok) return { ok: false, state, reason: quote.reason };
  const { endpoint: end } = quote;
  const baseStaff = normalizeStaffing(staffing);
  const r: RailCorridor = { version: 1, id: `rail:${endpointId}:${state.totalTicks}`, endpointId, endpointKind: end.kind, endpointLocationId: end.location.id,
    status: end.needsConsent ? "consent_pending" : "under_construction", reason: end.needsConsent ? "awaiting_independent_consent" : undefined,
    proposalTick: state.totalTicks, consentExpiresTick: end.needsConsent ? state.totalTicks + 30 * DAY_TICKS(state) : undefined,
    distance: quote.distance, totalTicks: quote.totalTicks, progressTicks: 0, setbackTicks: quote.setbackTicks, committedCredits: quote.committedCredits, committedSteel: quote.committedSteel, capabilities: routeCapabilities(state), staffing: baseStaff };
  const next = clone({ ...state, resources: { ...state.resources, credits: state.resources.credits - quote.committedCredits, steel: state.resources.steel - quote.committedSteel } }, [...(state.railCorridors || []), r]);
  next.pendingTickEntries = [...(state.pendingTickEntries || []),
    { label: "Rail Corridor Commitment", delta: -quote.committedCredits, unit: "credits", reason: `Construction commitment: ${end.name}`, severity: "negative" },
    { label: "Rail Corridor Steel", delta: -quote.committedSteel, unit: "steel", reason: `Construction commitment: ${end.name}`, severity: "negative" }];
  return { ok: true, state: next, corridor: r };
}
export function respondToRailConsent(state: GameState, id: string, accepted: boolean): RailResult {
  const r = (state.railCorridors || []).find(x => x.id === id);
  if (!r || r.status !== "consent_pending") return { ok: false, state, reason: "consent_not_pending" };
  const status = accepted ? "under_construction" : "rejected";
  const next = { ...r, status, reason: accepted ? undefined : "consent_refused", consentExpiresTick: undefined } as RailCorridor;
  return { ok: true, state: clone(state, state.railCorridors!.map(x => x.id === id ? next : x)), corridor: next };
}
export function cancelRailCorridor(state: GameState, id: string): RailResult {
  const r = (state.railCorridors || []).find(x => x.id === id);
  if (!r || !ACTIVE.has(r.status)) return { ok: false, state, reason: "corridor_not_cancellable" };
  const next = { ...r, status: "cancelled" as const, reason: "cancelled_by_commander" };
  return { ok: true, state: clone(state, state.railCorridors!.map(x => x.id === id ? next : x)), corridor: next };
}
export function configureRailCorridorStaffing(state: GameState, id: string, staffing: Partial<RailCorridor["staffing"]>): RailResult {
  const corridor = (state.railCorridors || []).find(item => item.id === id);
  if (!corridor) return { ok: false, state, reason: "corridor_not_found" };
  if (!["consent_pending", "under_construction", "disrupted"].includes(corridor.status)) {
    return { ok: false, state, reason: "staffing_not_configurable" };
  }
  const next = { ...corridor, staffing: normalizeStaffing(staffing) };
  return { ok: true, state: clone(state, state.railCorridors!.map(item => item.id === id ? next : item)), corridor: next };
}
export function resumeRailCorridor(state: GameState, id: string): RailResult {
  const corridor = (state.railCorridors || []).find(item => item.id === id);
  if (!corridor) return { ok: false, state, reason: "corridor_not_found" };
  if (corridor.status !== "disrupted") return { ok: false, state, reason: "corridor_not_disrupted" };
  if (!find(state, corridor.endpointId)) return { ok: false, state, reason: "endpoint_ineligible" };
  const next = { ...corridor, status: "under_construction" as const, reason: undefined };
  return { ok: true, state: clone(state, state.railCorridors!.map(item => item.id === id ? next : item)), corridor: next };
}
export function getRailNetworkDiagnostics(state: GameState) {
  const completed = (state.railCorridors || []).filter(r => r.status === "completed");
  const endpointNames = new Map(getEligibleRailEndpoints(state).map(endpoint => [endpoint.id, endpoint.name]));
  const policies = new Set(state.activePolicies || []);
  const publicAccess = policies.has("railPublicAccessMandate") ? 20 : 0;
  const freightDispatch = policies.has("freightPriorityDispatch") ? 4 : 0;
  const automated = policies.has("automatedRailConstruction");
  const safety = policies.has("railSafetyAuthority");
  const staffing = (state.railCorridors || []).filter(r => r.status === "under_construction" || r.status === "completed").map(corridor => {
    const staffedJobs = { ...corridor.staffing, railWorkers: corridor.staffing.railWorkers + corridor.staffing.robots };
    const shortages = (Object.keys(REQUIRED_RAIL_JOBS) as (keyof RailCorridor["staffing"])[])
      .filter(role => staffedJobs[role] < REQUIRED_RAIL_JOBS[role])
      .map(role => ({ role, required: REQUIRED_RAIL_JOBS[role], staffed: staffedJobs[role], missing: REQUIRED_RAIL_JOBS[role] - staffedJobs[role] }));
    return { corridorId: corridor.id, endpointId: corridor.endpointId, requiredJobs: { ...REQUIRED_RAIL_JOBS }, staffedJobs, shortages };
  });
  // A completed line still needs its accountable operating crew. Shortages
  // leave the asset visible but suppress its capacity/trade output.
  const operationalIds = new Set(staffing.filter(item => !item.shortages.length).map(item => item.corridorId));
  const operationalCompleted = completed.filter(c => operationalIds.has(c.id));
  const activeCaps = operationalCompleted.map(c => getRailCorridorCapabilities(state, c));
  const installedUpgrades = operationalCompleted.flatMap(c => c.installedTrainUpgrades || []);
  const upgradeEffects = installedUpgrades.reduce((totals, id) => {
    const effects = RAIL_TRAIN_UPGRADES[id]?.effects;
    if (!effects) return totals;
    totals.safetyResilience += effects.safetyResilience || 0;
    totals.armedSecurityBenefit += effects.armedSecurityBenefit || 0;
    totals.troopTransportCapacity += effects.troopTransportCapacity || 0;
    return totals;
  }, { safetyResilience: 0, armedSecurityBenefit: 0, troopTransportCapacity: 0 });
  const operationalTrainUpgrades: RailUpgradeContribution[] = operationalCompleted.flatMap(corridor =>
    (corridor.installedTrainUpgrades || []).flatMap(upgradeId => {
      const upgrade = RAIL_TRAIN_UPGRADES[upgradeId];
      if (!upgrade) return [];
      return [{
        corridorId: corridor.id,
        endpointId: corridor.endpointId,
        endpointName: endpointNames.get(corridor.endpointId) || corridor.endpointId,
        upgradeId,
        name: upgrade.name,
        effects: { ...upgrade.effects },
      }];
    }),
  );
  const passengerRoutes = activeCaps.filter(c => c.includes("passenger")).length;
  const freightRoutes = activeCaps.filter(c => c.includes("freight")).length;
  const operatingCost = completed.length * (safety ? 3 : 2) + publicAccess * operationalCompleted.length;
  return { completed: completed.length, transitCapacity: operationalCompleted.length * 120 + publicAccess * operationalCompleted.length, tradeIncome: operationalCompleted.length * (12 + freightDispatch), industrialOutput: activeCaps.filter(r => r.includes("industrial")).length * 2,
    safetyRating: Math.min(100, 50 + (safety ? 15 : 0) + upgradeEffects.safetyResilience), safetyResilience: upgradeEffects.safetyResilience, armedSecurityBenefit: upgradeEffects.armedSecurityBenefit, troopTransportCapacity: upgradeEffects.troopTransportCapacity,
    operationalTrainUpgrades,
    passengerCapacity: Math.max(0, passengerRoutes * (100 + publicAccess - freightDispatch * 5)), freightCapacity: freightRoutes * (80 + freightDispatch * 10), operatingCost,
    policyEffects: { railPublicAccessMandate: publicAccess > 0, freightPriorityDispatch: freightDispatch > 0, automatedRailConstruction: automated, railSafetyAuthority: safety },
    warnings: staffing.filter(item => item.shortages.length).map(item => {
      const endpointName = endpointNames.get(item.endpointId) || item.corridorId;
      const missingRoles = item.shortages
        .map(shortage => `${RAIL_ROLE_LABELS[shortage.role]} (${shortage.missing})`)
        .join(", ");
      return `Understaffed corridor: ${endpointName} — missing ${missingRoles}.`;
    }), staffing };
}
export function processRailNetworkTick(state: GameState): GameState {
  let messages = state.messages || []; let changed = false;
  const corridors = (state.railCorridors || []).map(r => {
    const refreshed = getRailCorridorCapabilities(state, r);
    if (refreshed.join("|") !== r.capabilities.join("|")) { r = { ...r, capabilities: refreshed }; changed = true; }
    if (r.status === "consent_pending" && (r.consentExpiresTick || 0) <= state.totalTicks) { changed = true; messages = [msg(state, `rail-expired:${r.id}`, "Rail consent expired", "The independent endpoint did not answer in time."), ...messages]; return { ...r, status: "rejected" as const, reason: "consent_expired" }; }
    if (!ACTIVE.has(r.status)) return r;
    const end = find(state, r.endpointId);
    if (!end) { changed = true; messages = [msg(state, `rail-disrupted:${r.id}`, "Rail corridor disrupted", "War, control loss, or endpoint eligibility ended this corridor."), ...messages]; return { ...r, status: "disrupted" as const, reason: "endpoint_control_or_war_loss" }; }
    if (r.status !== "under_construction") return r;
    // Robots substitute repetitive rail labor only; engineering, safety,
    // ticketing, administration, and maintenance stay human-accountable.
    const sufficient = r.staffing.engineers >= 2 && r.staffing.railWorkers + r.staffing.robots >= 10 && r.staffing.security >= 1 && r.staffing.ticketing >= 1 && r.staffing.admin >= 1 && r.staffing.maintenance >= 1;
    if (!sufficient) return r;
    const automatedCrew = r.staffing.robots >= REQUIRED_RAIL_JOBS.railWorkers && r.staffing.railWorkers < REQUIRED_RAIL_JOBS.railWorkers;
    const acceleration = state.activePolicies?.includes("automatedRailConstruction") && automatedCrew ? 2 : 1;
    changed = true; const progressTicks = Math.min(r.totalTicks, r.progressTicks + acceleration);
    return { ...r, progressTicks, status: progressTicks === r.totalTicks ? "completed" as const : r.status, reason: progressTicks === r.totalTicks ? undefined : r.reason };
  });
  if (!changed) return state;
  const next = clone(state, corridors, messages.filter((item, index, all) => all.findIndex(other => other.id === item.id) === index).slice(0, 200));
  return withInfrastructureLedger(next, reconcileInfrastructureLedger(next));
}
import type { GameState, NamedCharacter, TickEntry } from "@/engine/types";
import { applyCoerciveBacklash } from "@/engine/coerciveBacklash";
import { recordCharacterEvent, setCharacterStatus } from "@/engine/namedCharacters";
import { getWarExchangeEligibility, resolveAdvancedWarExchange } from "@/engine/diplomacyExchange";

export const BLACKSITE_FACILITY_KEY = "blacksiteDetentionFacilities";
export const BLACKSITE_BUILD_COST = 24000;
export const BLACKSITE_STEEL_COST = 120;
export const BLACKSITE_CAPACITY_PER_FACILITY = 80;
export const BLACKSITE_STAFF_PER_FACILITY = 8;
export const BLACKSITE_UPKEEP_PER_FACILITY = 350;
export const CUSTODY_HISTORY_CAP = 100;
export const CUSTODY_RECORD_CAP = 120;
export const CUSTODY_GROUP_CAP = 200;
export const CUSTODY_OPERATION_CAP = 300;

export type CustodySubjectKind = "named_character" | "pow" | "group" | "population";
export type CustodyHoldingStatus = "held" | "isolated" | "transferred" | "released" | "exchanged" | "recruited";
export type IncarcerationRole = "civilian" | "pow";
export type CustodyLegalStatus = "pretrial" | "sentenced" | "administrative" | "military";
export type AggregateCustodyStatus = "held" | "isolated" | "released" | "escaped" | "transferred" | "exchanged" | "recruited" | "executed" | "deceased";
export type PowOriginKind = "faction" | "settlement" | "nation" | "township" | "military_force" | "unknown";

export type AggregateCustodyGroup = {
  id: string;
  count: number;
  role: IncarcerationRole;
  legalStatus: CustodyLegalStatus;
  status: AggregateCustodyStatus;
  originKind: PowOriginKind;
  originId: string | null;
  originLabel: string;
  sourceKind?: "war" | "detained_group" | "population" | "legacy";
  sourceId?: string | null;
  admittedAtTick: number;
  updatedAtTick: number;
};

export type IncarcerationLedger = {
  groups: AggregateCustodyGroup[];
  processedOperations: string[];
};

export type CustodyRecord = {
  id: string;
  kind: CustodySubjectKind;
  subjectId: string;
  subjectName: string;
  factionId?: string | null;
  status: CustodyHoldingStatus;
  location: "municipal_prison" | "blacksite" | "blacksite_isolation" | "offsite_exchange";
  admittedAtTick: number;
  lastActionTick: number;
  lastAction?: DetaineeActionId;
  intelligenceValue: number;
};

export type CustodyActionLog = {
  id: string;
  targetId: string;
  actionId: DetaineeActionId;
  tick: number;
  outcome: "completed" | "blocked";
};

export type CustodyState = {
  records: CustodyRecord[];
  cooldowns: Record<string, number>;
  actionHistory: CustodyActionLog[];
  incarceration: IncarcerationLedger;
};

export type IncarcerationSummary = {
  total: number;
  civilians: number;
  pows: number;
  municipalCapacity: number;
  overcrowding: number;
  requiredGuards: number;
  byLegalStatus: Record<CustodyLegalStatus, number>;
  powOrigins: Array<{ key: string; kind: PowOriginKind; id: string | null; label: string; count: number }>;
};

export type DetaineeActionId =
  | "lawful-review"
  | "exchange"
  | "recruit"
  | "interrogate"
  | "isolate"
  | "transfer"
  | "release";

export type DetaineeRosterEntry = {
  id: string;
  kind: CustodySubjectKind;
  name: string;
  factionId?: string | null;
  status: CustodyHoldingStatus;
  notoriety: number;
  location: CustodyRecord["location"];
  record: CustodyRecord | null;
  aggregateGroup?: AggregateCustodyGroup;
};

export type BlacksiteSummary = {
  facilities: number;
  nominalCapacity: number;
  staffedCapacity: number;
  detainees: number;
  requiredStaff: number;
  availableStaff: number;
  readiness: number;
  upkeepPerTick: number;
};

export type DetaineeActionAvailability = {
  ready: boolean;
  reason?: string;
  cost: number;
  cooldownRemaining: number;
  requiresBlacksite: boolean;
};

export type DetaineeActionResult =
  | { ok: false; reason: string; cooldownRemaining?: number }
  | {
      ok: true;
      state: GameState;
      actionId: DetaineeActionId;
      targetName: string;
      outcome: string;
    };

export const DETAINEE_ACTIONS: Record<DetaineeActionId, {
  label: string;
  description: string;
  cost: number;
  cooldown: number;
  requiresBlacksite: boolean;
  coercive: boolean;
}> = {
  "lawful-review": {
    label: "LAWFUL REVIEW",
    description: "Review the file and move the detainee to ordinary legal processing.",
    cost: 200,
    cooldown: 4,
    requiresBlacksite: false,
    coercive: false,
  },
  exchange: {
    label: "EXCHANGE",
    description: "Offer the detainee to their faction for a controlled diplomatic concession.",
    cost: 1000,
    cooldown: 16,
    requiresBlacksite: false,
    coercive: false,
  },
  recruit: {
    label: "RECRUIT",
    description: "Offer conditional release in return for an intelligence relationship.",
    cost: 2500,
    cooldown: 20,
    requiresBlacksite: true,
    coercive: true,
  },
  interrogate: {
    label: "INTERROGATE",
    description: "Run a classified intelligence interview. Results are deterministic from the file and facility readiness.",
    cost: 500,
    cooldown: 8,
    requiresBlacksite: true,
    coercive: true,
  },
  isolate: {
    label: "ISOLATE",
    description: "Move the detainee into blacksite isolation. This improves control but creates civic and faction backlash.",
    cost: 250,
    cooldown: 8,
    requiresBlacksite: true,
    coercive: true,
  },
  transfer: {
    label: "TRANSFER",
    description: "Move the detainee to an offsite custody partner and reduce local security load.",
    cost: 350,
    cooldown: 12,
    requiresBlacksite: true,
    coercive: false,
  },
  release: {
    label: "RELEASE",
    description: "Release the detainee to the city under ordinary public jurisdiction.",
    cost: 0,
    cooldown: 12,
    requiresBlacksite: false,
    coercive: false,
  },
};

const TERMINAL_STATUSES = new Set<CustodyHoldingStatus>(["released", "exchanged", "recruited"]);

export function createDefaultCustodyState(initialCivilianCount = 0): CustodyState {
  const count = finiteInt(initialCivilianCount);
  return {
    records: [],
    cooldowns: {},
    actionHistory: [],
    incarceration: {
      groups: count > 0 ? [{
        id: "initial-civilian-custody",
        count,
        role: "civilian",
        legalStatus: "sentenced",
        status: "held",
        originKind: "unknown",
        originId: null,
        originLabel: "Not applicable",
        admittedAtTick: 0,
        updatedAtTick: 0,
      }] : [],
      processedOperations: [],
    },
  };
}

function finiteInt(value: unknown, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : fallback;
}

function facilityCount(state: GameState): number {
  return finiteInt(state.buildings?.[BLACKSITE_FACILITY_KEY]);
}

function availableStaff(state: GameState): number {
  const workforce = finiteInt((state.demographics as Partial<GameState["demographics"]> | undefined)?.securityWorkforce);
  const appointed = (state.officers ?? []).filter((officer) => officer?.appointed).length;
  return Math.max(0, Math.floor(workforce * 0.02) + appointed * 12);
}

function activeRecords(state: GameState): CustodyRecord[] {
  return (state.custody?.records ?? []).filter((record) => !TERMINAL_STATUSES.has(record.status));
}

const ACTIVE_AGGREGATE_STATUSES = new Set<AggregateCustodyStatus>(["held", "isolated"]);
const LEGAL_STATUSES: CustodyLegalStatus[] = ["pretrial", "sentenced", "administrative", "military"];

export function getIncarcerationSummary(state: Pick<GameState, "custody" | "buildings" | "cityStats">): IncarcerationSummary {
  const population = finiteInt(state.cityStats?.population);
  const active = (state.custody?.incarceration?.groups ?? []).filter((group) => ACTIVE_AGGREGATE_STATUSES.has(group.status));
  const civilians = Math.min(population, active.filter((group) => group.role === "civilian").reduce((sum, group) => sum + finiteInt(group.count), 0));
  const pows = active.filter((group) => group.role === "pow").reduce((sum, group) => sum + finiteInt(group.count), 0);
  const total = civilians + pows;
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const municipalCapacity =
    finiteInt(buildings.megaPrisonComplexes) * 200 +
    finiteInt(buildings.solitaryDetentionBlocks) * 80 +
    finiteInt(buildings.correctionalWorkCamps) * 120;
  const byLegalStatus = Object.fromEntries(LEGAL_STATUSES.map((status) => [
    status,
    active.filter((group) => group.legalStatus === status).reduce((sum, group) => sum + finiteInt(group.count), 0),
  ])) as Record<CustodyLegalStatus, number>;
  const origins = new Map<string, IncarcerationSummary["powOrigins"][number]>();
  for (const group of active.filter((entry) => entry.role === "pow")) {
    const kind = group.originKind ?? "unknown";
    const id = group.originId || null;
    const key = id ? `${kind}:${id}` : "unknown";
    const current = origins.get(key);
    const count = finiteInt(group.count);
    if (current) current.count += count;
    else origins.set(key, { key, kind, id, label: group.originLabel || "Unknown origin", count });
  }
  return {
    total,
    civilians,
    pows,
    municipalCapacity,
    overcrowding: Math.max(0, total - municipalCapacity),
    requiredGuards: Math.ceil(total / 30),
    byLegalStatus,
    powOrigins: [...origins.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

export function admitCustodyGroup(
  state: GameState,
  operationId: string,
  group: Omit<AggregateCustodyGroup, "admittedAtTick" | "updatedAtTick" | "status"> & { status?: "held" | "isolated" },
): boolean {
  const custody = sanitizeCustodyState(state.custody);
  if (!operationId || custody.incarceration.processedOperations.includes(operationId) || finiteInt(group.count) <= 0) return false;
  if (custody.incarceration.groups.some((entry) => entry.id === group.id)) return false;
  if (custody.incarceration.groups.filter((entry) => ACTIVE_AGGREGATE_STATUSES.has(entry.status)).length >= CUSTODY_GROUP_CAP) return false;
  custody.incarceration.groups.push({
    ...group,
    count: finiteInt(group.count),
    status: group.status ?? "held",
    originKind: group.role === "pow" ? group.originKind : "unknown",
    originId: group.role === "pow" && group.originId ? group.originId : null,
    originLabel: group.role === "pow" && group.originLabel ? group.originLabel : "Not applicable",
    admittedAtTick: state.totalTicks,
    updatedAtTick: state.totalTicks,
  });
  custody.incarceration.groups = retainCustodyGroups(custody.incarceration.groups);
  custody.incarceration.processedOperations = [operationId, ...custody.incarceration.processedOperations].slice(0, CUSTODY_OPERATION_CAP);
  state.custody = custody;
  return true;
}

export function transitionCustodyGroup(
  state: GameState,
  operationId: string,
  groupId: string,
  status: Exclude<AggregateCustodyStatus, "held" | "isolated">,
): boolean {
  const custody = sanitizeCustodyState(state.custody);
  if (!operationId || custody.incarceration.processedOperations.includes(operationId) || custody.incarceration.groups.some((group) => group.id.endsWith(`:${operationId}`))) return false;
  const source = custody.incarceration.groups.find((group) => group.id === groupId && ACTIVE_AGGREGATE_STATUSES.has(group.status));
  // Transitions are group-atomic. Splits must first be admitted as separate
  // groups, which makes replay safety durable even after bounded audit keys age out.
  const moved = source?.count ?? 0;
  if (!source || moved <= 0) return false;
  source.count -= moved;
  source.updatedAtTick = state.totalTicks;
  custody.incarceration.groups.push({
    ...source,
    id: `${source.id}:${status}:${operationId}`,
    count: moved,
    status,
    updatedAtTick: state.totalTicks,
  });
  custody.incarceration.groups = retainCustodyGroups(custody.incarceration.groups.filter((group) => group.count > 0));
  custody.incarceration.processedOperations = [operationId, ...custody.incarceration.processedOperations].slice(0, CUSTODY_OPERATION_CAP);
  state.custody = custody;
  updateAggregateSourceStatus(state, source, status);
  return true;
}

function updateAggregateSourceStatus(
  state: GameState,
  source: AggregateCustodyGroup,
  status: Exclude<AggregateCustodyStatus, "held" | "isolated">,
): void {
  if (source.sourceKind !== "war" || !source.sourceId) return;
  const advanced = state.diplomacyAdvanced;
  if (!advanced) return;
  for (const war of [...advanced.wars, ...advanced.concludedWars]) {
    const capture = (war.captures ?? []).find((entry) => entry.id === source.sourceId);
    if (capture) capture.status = status;
  }
}

export function getBlacksiteSummary(state: GameState): BlacksiteSummary {
  const facilities = facilityCount(state);
  const nominalCapacity = facilities * BLACKSITE_CAPACITY_PER_FACILITY;
  const requiredStaff = facilities * BLACKSITE_STAFF_PER_FACILITY;
  const staff = availableStaff(state);
  const detainees = getDetaineeRoster(state).reduce((sum, entry) => {
    if (entry.aggregateGroup?.role === "civilian") return sum;
    return sum + (entry.aggregateGroup?.count ?? 1);
  }, 0);
  const readiness = facilities <= 0 || requiredStaff <= 0
    ? 0
    : Math.max(0, Math.min(1, staff / requiredStaff));
  return {
    facilities,
    nominalCapacity,
    staffedCapacity: Math.floor(nominalCapacity * readiness),
    detainees,
    requiredStaff,
    availableStaff: staff,
    readiness,
    upkeepPerTick: facilities * BLACKSITE_UPKEEP_PER_FACILITY,
  };
}

function recordFor(state: GameState, subjectId: string): CustodyRecord | null {
  return (state.custody?.records ?? []).find((record) => record.subjectId === subjectId) ?? null;
}

function namedCharacterFor(state: GameState, subjectId: string): NamedCharacter | null {
  return (state.namedCharacters ?? []).find((character) => character.id === subjectId) ?? null;
}

export function getDetaineeRoster(state: GameState): DetaineeRosterEntry[] {
  const out: DetaineeRosterEntry[] = [];
  const seen = new Set<string>();
  for (const character of state.namedCharacters ?? []) {
    const record = recordFor(state, character.id);
    const recordHeld = record && !TERMINAL_STATUSES.has(record.status);
    if (character.status !== "jailed" && !recordHeld) continue;
    seen.add(character.id);
    out.push({
      id: character.id,
      kind: "named_character",
      name: character.name,
      factionId: character.factionId,
      status: record?.status && !TERMINAL_STATUSES.has(record.status) ? record.status : "held",
      notoriety: Math.max(0, Math.min(100, character.notoriety ?? 0)),
      location: record?.location ?? "municipal_prison",
      record,
    });
  }
  for (const record of activeRecords(state)) {
    if (seen.has(record.subjectId)) continue;
    out.push({
      id: record.subjectId,
      kind: record.kind,
      name: record.subjectName,
      factionId: record.factionId,
      status: record.status,
      notoriety: 0,
      location: record.location,
      record,
    });
  }
  for (const group of state.custody?.incarceration?.groups ?? []) {
    if (!ACTIVE_AGGREGATE_STATUSES.has(group.status) || seen.has(group.id)) continue;
    const isPow = group.role === "pow";
    out.push({
      id: group.id,
      kind: group.role === "pow" ? "pow" : group.sourceKind === "population" ? "population" : "group",
      name: isPow ? `${group.originLabel || "Unknown origin"} POW group` : "Resident civilian custody",
      factionId: group.originKind === "faction" ? group.originId : null,
      status: group.status as "held" | "isolated",
      notoriety: 0,
      location: "municipal_prison",
      record: null,
      aggregateGroup: group,
    });
  }
  return out.sort((a, b) => b.notoriety - a.notoriety || a.name.localeCompare(b.name));
}

function actionCooldownKey(targetId: string, actionId: DetaineeActionId): string {
  return `detainee:${targetId}:${actionId}`;
}

export function getDetaineeActionAvailability(
  state: GameState,
  targetId: string,
  actionId: DetaineeActionId,
): DetaineeActionAvailability {
  const definition = DETAINEE_ACTIONS[actionId];
  const target = getDetaineeRoster(state).find((entry) => entry.id === targetId);
  const summary = getBlacksiteSummary(state);
  const cooldownUntil = state.custody?.cooldowns?.[actionCooldownKey(targetId, actionId)] ?? 0;
  const cooldownRemaining = Math.max(0, cooldownUntil - state.totalTicks);
  if (!definition) return { ready: false, reason: "Unknown detainee action.", cost: 0, cooldownRemaining, requiresBlacksite: false };
  if (!target) return { ready: false, reason: "Detainee is no longer in custody.", cost: definition.cost, cooldownRemaining, requiresBlacksite: definition.requiresBlacksite };
  if (cooldownRemaining > 0) return { ready: false, reason: `Action remains on cooldown for ${cooldownRemaining} tick(s).`, cost: definition.cost, cooldownRemaining, requiresBlacksite: definition.requiresBlacksite };
  if (state.resources.credits < definition.cost) return { ready: false, reason: `Requires ${definition.cost.toLocaleString()} credits.`, cost: definition.cost, cooldownRemaining, requiresBlacksite: definition.requiresBlacksite };
  if (actionId === "exchange") {
    const eligibility = getWarExchangeEligibility(state, target);
    if (!eligibility.ready) return { ready: false, reason: eligibility.reason, cost: definition.cost, cooldownRemaining, requiresBlacksite: definition.requiresBlacksite };
  }
  if (definition.requiresBlacksite && summary.facilities <= 0) return { ready: false, reason: "Construct a blacksite detention facility first.", cost: definition.cost, cooldownRemaining, requiresBlacksite: true };
  if (definition.requiresBlacksite && summary.readiness < 1) return { ready: false, reason: "Blacksite staffing is below the required operating level.", cost: definition.cost, cooldownRemaining, requiresBlacksite: true };
  if (definition.requiresBlacksite && summary.detainees > summary.staffedCapacity) return { ready: false, reason: "Blacksite capacity is full.", cost: definition.cost, cooldownRemaining, requiresBlacksite: true };
  return { ready: true, cost: definition.cost, cooldownRemaining, requiresBlacksite: definition.requiresBlacksite };
}

function ensureCustodyRecord(state: GameState, target: DetaineeRosterEntry): CustodyRecord {
  const existing = recordFor(state, target.id);
  if (existing) return existing;
  const record: CustodyRecord = {
    id: `custody-${target.kind}-${target.id}`,
    kind: target.kind,
    subjectId: target.id,
    subjectName: target.name,
    factionId: target.factionId ?? null,
    status: "held",
    location: target.location,
    admittedAtTick: state.totalTicks,
    lastActionTick: state.totalTicks,
    intelligenceValue: Math.max(10, Math.round(target.notoriety * 0.8)),
  };
  state.custody = {
    ...(state.custody ?? createDefaultCustodyState()),
    records: [...(state.custody?.records ?? []), record],
    cooldowns: { ...(state.custody?.cooldowns ?? {}) },
    actionHistory: [...(state.custody?.actionHistory ?? [])],
  };
  return record;
}

function addMessage(state: GameState, title: string, body: string, priority: "normal" | "high" = "normal"): void {
  state.messages = [{
    id: `custody-${state.totalTicks}-${(state.messages ?? []).length}`,
    timestamp: { ...state.gameDate },
    tick: state.totalTicks,
    category: "intel" as const,
    title,
    body,
    read: false,
    priority,
  }, ...(state.messages ?? [])].slice(0, 200);
}

function actionOutcome(
  state: GameState,
  target: DetaineeRosterEntry,
  actionId: DetaineeActionId,
  record: CustodyRecord,
): string {
  const character = target.kind === "named_character" ? namedCharacterFor(state, target.id) : null;
  switch (actionId) {
    case "lawful-review":
      if (character) {
        setCharacterStatus(state, character.id, "active", "File reviewed; moved to ordinary legal processing.");
      }
      record.status = "released";
      record.location = "municipal_prison";
      return `${target.name} moved to ordinary legal processing.`;
    case "exchange":
      if (character) {
        setCharacterStatus(state, character.id, "active", "Transferred through a faction exchange.");
      }
      record.status = "exchanged";
      record.location = "offsite_exchange";
      return `${target.name} exchanged through the ${target.factionId ?? "attached"} faction channel.`;
    case "recruit":
      if (character) {
        const list = [...(state.namedCharacters ?? [])];
        const index = list.findIndex((entry) => entry.id === character.id);
        if (index >= 0) list[index] = { ...list[index], factionId: null };
        state.namedCharacters = list;
        recordCharacterEvent(state, character.id, "Accepted a conditional intelligence relationship after detention.", 0);
        setCharacterStatus(state, character.id, "active");
      }
      record.status = "recruited";
      record.location = "offsite_exchange";
      state.cityStats.lawOrder = Math.min(100, state.cityStats.lawOrder + 1);
      return `${target.name} accepted a conditional intelligence relationship.`;
    case "interrogate": {
      const leverage = Math.min(1, 0.25 + target.notoriety / 160 + (getBlacksiteSummary(state).readiness * 0.35));
      const useful = leverage >= 0.62;
      record.intelligenceValue = Math.min(100, record.intelligenceValue + (useful ? 12 : 4));
      state.cityStats.crime = Math.max(0, state.cityStats.crime - (useful ? 1 : 0.25));
      return useful
        ? `${target.name} yielded a usable lead. Crime pressure reduced by 1.`
        : `${target.name} yielded no actionable lead. The file remains open.`;
    }
    case "isolate":
      record.status = "isolated";
      record.location = "blacksite_isolation";
      return `${target.name} moved to blacksite isolation.`;
    case "transfer":
      record.status = "transferred";
      record.location = "offsite_exchange";
      return `${target.name} transferred to an offsite custody partner.`;
    case "release":
      if (character) setCharacterStatus(state, character.id, "active", "Released from custody.");
      record.status = "released";
      record.location = "municipal_prison";
      return `${target.name} released from custody.`;
  }
}

export function performDetaineeAction(
  state: GameState,
  targetId: string,
  actionId: DetaineeActionId,
): DetaineeActionResult {
  const availability = getDetaineeActionAvailability(state, targetId, actionId);
  if (!availability.ready) return { ok: false, reason: availability.reason ?? "Action unavailable.", cooldownRemaining: availability.cooldownRemaining };
  const target = getDetaineeRoster(state).find((entry) => entry.id === targetId);
  if (!target) return { ok: false, reason: "Detainee is no longer in custody." };
  const next: GameState = {
    ...state,
    resources: { ...state.resources, credits: state.resources.credits - availability.cost },
    namedCharacters: state.namedCharacters ? [...state.namedCharacters] : state.namedCharacters,
    factions: state.factions ? [...state.factions] : state.factions,
    pendingTickEntries: [...(state.pendingTickEntries ?? [])],
    diplomacyAdvanced: state.diplomacyAdvanced
      ? {
          ...state.diplomacyAdvanced,
          wars: state.diplomacyAdvanced.wars.map((war) => ({
            ...war,
            captures: war.captures?.map((capture) => ({ ...capture })),
            timeline: war.timeline
              ? { stages: war.timeline.stages.map((stage) => ({ ...stage })), reports: war.timeline.reports.map((report) => ({ ...report })) }
              : undefined,
          })),
          concludedWars: state.diplomacyAdvanced.concludedWars.map((war) => ({
            ...war,
            captures: war.captures?.map((capture) => ({ ...capture })),
            stages: war.stages.map((stage) => ({ ...stage })),
            reports: war.reports.map((report) => ({ ...report })),
          })),
          factionRelations: state.diplomacyAdvanced.factionRelations.map((relation) => ({ ...relation, events: [...relation.events] })),
        }
      : state.diplomacyAdvanced,
    custody: {
      ...(state.custody ?? createDefaultCustodyState()),
      records: (state.custody?.records ?? []).map((record) => ({ ...record })),
      cooldowns: { ...(state.custody?.cooldowns ?? {}) },
      actionHistory: [...(state.custody?.actionHistory ?? [])],
      incarceration: {
        groups: (state.custody?.incarceration?.groups ?? []).map((group) => ({ ...group })),
        processedOperations: [...(state.custody?.incarceration?.processedOperations ?? [])],
      },
    },
    cityStats: { ...state.cityStats },
  };
  if (target.aggregateGroup) {
    const aggregateStatus: "released" | "exchanged" | "transferred" | "recruited" | null =
      actionId === "exchange" ? "exchanged"
        : actionId === "transfer" ? "transferred"
          : actionId === "recruit" ? "recruited"
            : actionId === "release" || actionId === "lawful-review" ? "released"
              : null;
    if (aggregateStatus) {
      if (actionId === "exchange") {
        const exchange = resolveAdvancedWarExchange(next, target);
        if (!exchange.ok) return { ok: false, reason: exchange.reason };
      }
      const moved = transitionCustodyGroup(next, `action:${next.totalTicks}:${target.id}:${actionId}`, target.id, aggregateStatus);
      if (!moved) return { ok: false, reason: "The aggregate custody group is no longer active." };
    }
    const outcome = aggregateStatus === "exchanged"
      ? `${target.name} exchanged through the attached origin channel.`
      : aggregateStatus === "transferred"
        ? `${target.name} transferred to an offsite custody partner.`
        : aggregateStatus === "recruited"
          ? `${target.name} accepted a conditional intelligence relationship.`
          : aggregateStatus === "released"
            ? `${target.name} released from custody.`
            : `${target.name} yielded no actionable lead. The group remains in custody.`;
    next.custody!.cooldowns[actionCooldownKey(targetId, actionId)] = next.totalTicks + DETAINEE_ACTIONS[actionId].cooldown;
    next.custody!.actionHistory = [
      { id: `custody-action-${next.totalTicks}-${targetId}-${actionId}`, targetId, actionId, tick: next.totalTicks, outcome: "completed" as const },
      ...next.custody!.actionHistory,
    ].slice(0, CUSTODY_HISTORY_CAP);
    addMessage(next, "CUSTODY ACTION COMPLETED", outcome);
    return { ok: true, state: next, actionId, targetName: target.name, outcome };
  }
  const record = ensureCustodyRecord(next, target);
  if (actionId === "exchange") {
    const exchange = resolveAdvancedWarExchange(next, target);
    if (!exchange.ok) return { ok: false, reason: exchange.reason };
  }
  const outcome = actionOutcome(next, target, actionId, record);
  record.lastAction = actionId;
  record.lastActionTick = next.totalTicks;
  next.custody!.cooldowns[actionCooldownKey(targetId, actionId)] = next.totalTicks + DETAINEE_ACTIONS[actionId].cooldown;
  next.custody!.actionHistory = [
    { id: `custody-action-${next.totalTicks}-${targetId}-${actionId}`, targetId, actionId, tick: next.totalTicks, outcome: "completed" as const },
    ...next.custody!.actionHistory,
  ].slice(0, CUSTODY_HISTORY_CAP);
  if (availability.cost > 0) {
    next.pendingTickEntries!.push({
      label: "Detainee Action",
      delta: -availability.cost,
      unit: "credits",
      reason: `${DETAINEE_ACTIONS[actionId].label} — ${target.name}`,
      severity: DETAINEE_ACTIONS[actionId].coercive ? "warning" : "neutral",
    });
  }
  if (DETAINEE_ACTIONS[actionId].coercive) {
    const backed = applyCoerciveBacklash(next, {
      actionId,
      actionKey: `custody:${targetId}:${actionId}:${next.totalTicks}`,
      targetId,
      targetName: target.name,
      scope: "targeted",
      audience: "internal",
      severity: actionId === "isolate" ? "major" : "moderate",
      label: DETAINEE_ACTIONS[actionId].label,
      messageCap: 200,
    });
    addMessage(backed, "CUSTODY ACTION COMPLETED", outcome, "high");
    return { ok: true, state: backed, actionId, targetName: target.name, outcome };
  }
  addMessage(next, "CUSTODY ACTION COMPLETED", outcome);
  return { ok: true, state: next, actionId, targetName: target.name, outcome };
}

export function sanitizeCustodyState(raw: unknown): CustodyState {
  if (!raw || typeof raw !== "object") return createDefaultCustodyState();
  const value = raw as Partial<CustodyState>;
  const records = Array.isArray(value.records)
    ? value.records.filter((record): record is CustodyRecord => {
        if (!record || typeof record !== "object") return false;
        return typeof record.id === "string" && typeof record.subjectId === "string" && typeof record.subjectName === "string";
      }).map((record) => ({
        ...record,
        kind: ["named_character", "pow", "group", "population"].includes(record.kind) ? record.kind : "group",
        status: ["held", "isolated", "transferred", "released", "exchanged", "recruited"].includes(record.status) ? record.status : "held",
        location: ["municipal_prison", "blacksite", "blacksite_isolation", "offsite_exchange"].includes(record.location) ? record.location : "municipal_prison",
        factionId: typeof record.factionId === "string" ? record.factionId : null,
        admittedAtTick: finiteInt(record.admittedAtTick),
        lastActionTick: finiteInt(record.lastActionTick),
        intelligenceValue: Math.max(0, Math.min(100, finiteInt(record.intelligenceValue, 10))),
      }))
    : [];
  const deduped = [...new Map(records.map((record) => [record.subjectId, record])).values()].slice(-CUSTODY_RECORD_CAP);
  const cooldowns: Record<string, number> = {};
  if (value.cooldowns && typeof value.cooldowns === "object") {
    for (const [key, tick] of Object.entries(value.cooldowns)) {
      if (typeof tick === "number" && Number.isFinite(tick) && typeof key === "string") cooldowns[key] = Math.max(0, Math.floor(tick));
    }
  }
  const actionHistory = Array.isArray(value.actionHistory)
    ? value.actionHistory.filter((entry): entry is CustodyActionLog => Boolean(entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.targetId === "string" && typeof entry.actionId === "string")).slice(0, CUSTODY_HISTORY_CAP)
    : [];
  const rawLedger = value.incarceration && typeof value.incarceration === "object" ? value.incarceration : { groups: [], processedOperations: [] };
  const normalizedGroups = Array.isArray(rawLedger.groups)
    ? rawLedger.groups.filter((group): group is AggregateCustodyGroup => Boolean(group && typeof group === "object" && typeof group.id === "string" && group.id && finiteInt(group.count) > 0))
      .map((group) => ({
        ...group,
        count: finiteInt(group.count),
        role: (["civilian", "pow"] as string[]).includes(group.role) ? group.role : "civilian",
        legalStatus: (LEGAL_STATUSES as string[]).includes(group.legalStatus) ? group.legalStatus : (group.role === "pow" ? "military" : "pretrial"),
         status: (["held", "isolated", "released", "escaped", "transferred", "exchanged", "recruited", "executed", "deceased"] as string[]).includes(group.status) ? group.status : "held",
        originKind: (["faction", "settlement", "nation", "township", "military_force", "unknown"] as string[]).includes(group.originKind) ? group.originKind : "unknown",
        originId: typeof group.originId === "string" && group.originId ? group.originId : null,
        originLabel: typeof group.originLabel === "string" && group.originLabel ? group.originLabel : "Unknown origin",
        sourceKind: typeof group.sourceKind === "string" && (["war", "detained_group", "population", "legacy"] as string[]).includes(group.sourceKind) ? group.sourceKind as AggregateCustodyGroup["sourceKind"] : undefined,
        sourceId: typeof group.sourceId === "string" && group.sourceId ? group.sourceId : null,
        admittedAtTick: finiteInt(group.admittedAtTick),
        updatedAtTick: finiteInt(group.updatedAtTick),
      } as AggregateCustodyGroup))
    : [];
  const groups = retainCustodyGroups([...new Map(normalizedGroups.map((group) => [group.id, group])).values()]);
  const processedOperations = Array.isArray(rawLedger.processedOperations)
    ? [...new Set(rawLedger.processedOperations.filter((key): key is string => typeof key === "string" && key.length > 0))].slice(0, CUSTODY_OPERATION_CAP)
    : [];
  return { records: deduped, cooldowns, actionHistory, incarceration: { groups, processedOperations } };
}

function retainCustodyGroups(groups: AggregateCustodyGroup[]): AggregateCustodyGroup[] {
  const active = groups.filter((group) => ACTIVE_AGGREGATE_STATUSES.has(group.status));
  const terminal = groups.filter((group) => !ACTIVE_AGGREGATE_STATUSES.has(group.status));
  const terminalBudget = Math.max(0, CUSTODY_GROUP_CAP - active.length);
  return [...active, ...(terminalBudget > 0 ? terminal.slice(-terminalBudget) : [])];
}

export function processCustodyTick(state: GameState, entries: TickEntry[]): void {
  const facilities = facilityCount(state);
  if (facilities <= 0) return;
  const due = facilities * BLACKSITE_UPKEEP_PER_FACILITY;
  const paid = Math.min(Math.max(0, state.resources.credits), due);
  state.resources.credits -= paid;
  entries.push({
    label: "Blacksite Upkeep",
    delta: -paid,
    unit: "credits",
    reason: paid === due ? `${facilities} blacksite facilit${facilities === 1 ? "y" : "ies"} staffed` : "Blacksite upkeep shortfall",
    severity: paid === due ? "neutral" : "warning",
  });
  if (paid < due && state.totalTicks % 8 === 0) {
    addMessage(state, "BLACKSITE FUNDING SHORTFALL", "Blacksite upkeep could not be fully paid. Detainee operations remain restricted until funding recovers.", "high");
  }
}
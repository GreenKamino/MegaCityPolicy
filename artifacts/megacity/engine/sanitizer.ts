import type { GameState, Resources, CityStats, Rates, Demographics, CrimeStats, ExternalMegacity, Township, Officer, NamedCharacter, CompanyInstance, HumanConsequences, RailCorridor, CohortStewardshipHistoryEntry } from "@/engine/types";
import { sanitizeCustodyState } from "@/engine/custody";
import { createDefaultHumanConsequences } from "@/engine/humanConsequences";
import { ensurePartnerCityStats, defaultPopulationFor } from "@/engine/partnerCityStats";
import { applyCanonicalLACityPresentation, operationalFromSettlement } from "@/engine/settlementData";
import { normalizeMegacityRoster } from "@/engine/settlementRoster";
import { applyCanonicalContinuancePresentation } from "@/engine/continuance";
import { PARTNER_ARCHETYPES, PERSONALITY_ARCHETYPES } from "@/engine/partnerDynamics";
import { BLACK_MARKET_HISTORY_CAP } from "@/engine/blackMarketActions";
import { getDistrictCategory } from "@/engine/districts";
import { getBaseEcologyForCategory } from "@/engine/biomes";
import { generateOfficerBio, generateCharacterBio } from "@/engine/characterBios";
import { expandActiveBusinessFromSave, expandClosedBusinessRecordFromSave } from "@/engine/independentEnterprises";
import { WAR_EVENT_OCCURRENCE_IDS } from "@/engine/events";
import { TECH_MAP } from "@/engine/technologies";
import { POLICY_MAP } from "@/engine/policies";
import { RESEARCH_COST_MULTIPLIER } from "@/engine/researchConstants";
import { createDefaultAdministrativeInstitutions } from "@/engine/administrativeInstitutions";
import { isCommanderOriginId } from "@/engine/commanderOrigins";
import { DEFAULT_SQUAD_DOCTRINE, SQUAD_DOCTRINES_MAP, SQUAD_OPERATIONS } from "@/engine/retinueData";
import { MAX_CONSTRUCTION_BATCH, MAX_PENDING_CONSTRUCTION_ORDERS } from "@/engine/pendingConstruction";
import { scrubLegacyContent } from "@/engine/legacyContent";
import { sanitizeRetiredEvents } from "@/engine/eventRetirement";
import { isOfficerAutoFillDoctrineId } from "@/engine/officerAppointmentDoctrines";
import { sanitizeInfrastructureLedger, infrastructureHealthPercent } from "@/engine/infrastructureLedger";
import { sanitizeSecurityWings } from "@/engine/securityWings";

const ARCH_VALID = new Set<string>(Object.keys(PARTNER_ARCHETYPES));
const PERS_VALID = new Set<string>(Object.keys(PERSONALITY_ARCHETYPES));
const STANCE_VALID = new Set<string>(["content", "prosperous", "opportunistic", "defiant", "mourning", "mobilized", "hostile", "desperate"]);
const ECOLOGY_STANCE_VALID = new Set<string>(["poacher", "conservationist", "druid", "neutral"]);
export const ARRAY_CAPS = {
  messages: 200,
  battleLog: 50,
  completedContracts: 200,
  eventHistory: 20,
  worldEventLog: 50,
  strikeHistory: 100,
  whispers: 20,
  tickLog: 100,
  statHistory: 120,
  activeEvents: 30,
  newsFeed: 30,
  dismissedMessageIds: 200,
  dismissedTutorialTips: 500,
  unlockedAchievements: 200,
  discoveredLocationIds: 300,
  discoveredTerrain: 100,
  atlasCategoryRewardsClaimed: 32,
  researchQueue: 50,
  unlockedTechnologies: 500,
  activePolicies: 500,
  activeEdicts: 20,
  activeMissions: 30,
  megaProjects: 50,
  pendingConstructions: MAX_PENDING_CONSTRUCTION_ORDERS,
  activeEventChains: 150,
  lawMissions: 30,
  miningOperations: 30,
  scavengeExpeditions: 30,
  wildlandsProjects: 20,
  tamingQueue: 30,
  recentResumeOvershoots: 5,
  // Local economy — were inline magic numbers in
  // independentEnterprises.ts; centralized here so the corruption-
  // recovery sanitizer can also enforce them on load.
  businesses: 1500,
  // Kept at 100 to match independentEnterprises.MAX_CLOSED_HISTORY.
  // businessEventChains.ts:155 (biz_phoenix_reopen) reads the full
  // list, not just the 60 the UI displays, so trimming below 100
  // would change event-chain availability.
  closedHistory: 100,
  // Diplomacy advanced — were inline magic numbers below; lifted up so
  // they can't drift between the live tick path and the load-time
  // sanitizer.
  diplomaticIncidents: 30,
  factionRelations: 50,
  wars: 10,
  peaceConferences: 5,
  envoys: 10,
  negotiations: 10,
  // Misc previously-magic caps inside this file.
  scavengingInfrastructure: 20,
  diplomaticHistory: 100,
  expansionLog: 100,
  partnerLedgerRecent: 12,
  intelItems: 30,
  pendingPartnerResponses: 50,
  // Intrigue plots (Task #379). Few factions plot at once; a small cap keeps a
  // tampered save from spawning thousands of phantom plots.
  intriguePlots: 10,
  blackMarketHistory: BLACK_MARKET_HISTORY_CAP,
  railCorridors: 100,
  coerciveBacklashLog: 200,
  districtCommandHistory: 200,
  cohortStewardshipHistory: 200,
  pendingTickEntries: 200,
  custodyRecords: 120,
  custodyHistory: 100,
} as const;

function safeNum(v: unknown, fallback: number = 0): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return v;
}

function clamp(v: unknown, min: number, max: number, fallback: number = 0): number {
  const n = safeNum(v, fallback);
  return Math.max(min, Math.min(max, n));
}

function floorZero(v: unknown, fallback: number = 0): number {
  return Math.max(0, safeNum(v, fallback));
}

// Non-negative accumulator capped at the same MAX_RESOURCE ceiling used
// for the core pools. Long-running counters (lifetime kills, deaths,
// waste) only ever grow, so without a ceiling a 100-hour run could push
// them toward Number.MAX_SAFE_INTEGER and into scientific notation in
// the stats UI. MAX_RESOURCE (1e14) is far past any legitimate lifetime
// tally but well inside the formatter's sane range.
export function floorCap(v: unknown, fallback: number = 0): number {
  return Math.min(MAX_RESOURCE, Math.max(0, safeNum(v, fallback)));
}

function sanitizeRecord(rec: Record<string, number> | undefined): Record<string, number> {
  if (!rec || typeof rec !== "object") return {};
  // Copy-on-write: `stockpiles` typically has dozens–hundreds of keys but only
  // a handful move on any given tick, and the steady-state values are already
  // finite and in-range. Scan in place, reuse the input object when every entry
  // is already clean, and clone only on the first correction. Output values are
  // bit-identical to the original rebuild-everything pass.
  //
  // A corrupted / tampered save could hand us an Array where a plain object is
  // expected (the only non-plain shape JSON can yield). The original
  // rebuild-everything pass always produced a fresh plain object, so for an
  // array we clone up front (`{ ...rec }` → plain `{0:…,1:…}`) instead of
  // copy-on-write-returning the array unchanged when every entry is clean.
  let out: Record<string, number> = Array.isArray(rec) ? { ...rec } : rec;
  for (const k of Object.keys(rec)) {
    const v = rec[k];
    // Per-key ceiling consistent with MAX_RESOURCE. `state.stockpiles`
    // is open-ended (any commodity / munition id), and several tick
    // paths do `stockpiles[id] = (stockpiles[id] ?? 0) + amount` with no
    // upper bound, so a bonus-stacking bug or tampered save could push a
    // single entry into scientific-notation territory. Clamp magnitude
    // symmetrically so transient negatives are preserved but bounded.
    const clamped = Math.max(-MAX_RESOURCE, Math.min(MAX_RESOURCE, safeNum(v, 0)));
    if (clamped !== v) {
      if (out === rec) out = { ...rec };
      out[k] = clamped;
    }
  }
  return out;
}

// Per-event recurrence counts are durable counters written by the event
// spawners. Keep them finite, non-negative, and integer-valued on load so a
// malformed save cannot leak an unusable value into the event badge or cause
// the next recurrence to start from NaN.
function sanitizeEventRecurrenceCounts(
  counts: GameState["eventRecurrenceCounts"],
): NonNullable<GameState["eventRecurrenceCounts"]> {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return {};
  const cleaned: Record<string, number> = {};
  for (const [id, value] of Object.entries(counts)) {
    if (typeof id !== "string" || id.length === 0) continue;
    const count = safeNum(value, 0);
    cleaned[id] = Math.min(1_000_000, Math.max(0, Math.floor(count)));
  }
  return cleaned;
}

// Personal interaction fatigue is intentionally bounded: each verb only needs
// a few recent totalTicks stamps to calculate its multiplier. Drop malformed
// keys/entries on load so a hand-edited save cannot make the menu or reducer
// walk an unbounded structure.
function sanitizePersonalActionHistory(
  history: GameState["personalActionHistory"],
): NonNullable<GameState["personalActionHistory"]> {
  if (!history || typeof history !== "object" || Array.isArray(history)) return {};
  const out: NonNullable<GameState["personalActionHistory"]> = {};
  let keyCount = 0;
  for (const [key, uses] of Object.entries(history)) {
    if (keyCount >= 2000 || key.length === 0 || key.length > 160 || !Array.isArray(uses)) continue;
    const cleanUses = uses
      .filter((tick): tick is number => typeof tick === "number" && Number.isFinite(tick))
      .map((tick) => Math.max(0, Math.round(tick)))
      .slice(-8);
    if (cleanUses.length > 0) {
      out[key] = cleanUses;
      keyCount++;
    }
  }
  return out;
}

// Cooldowns share a store with personal, district, and faction-diplomacy
// commands. A large city can legitimately have four live district commands per
// ward, so retain a generous bounded set while rejecting malformed save data.
function sanitizePersonalActionCooldowns(
  cooldowns: GameState["personalActionCooldowns"],
): NonNullable<GameState["personalActionCooldowns"]> {
  if (!cooldowns || typeof cooldowns !== "object" || Array.isArray(cooldowns)) return {};
  const out: NonNullable<GameState["personalActionCooldowns"]> = {};
  let keyCount = 0;
  for (const [key, readyAt] of Object.entries(cooldowns)) {
    if (
      keyCount >= 2000 ||
      key.length === 0 ||
      key.length > 160 ||
      typeof readyAt !== "number" ||
      !Number.isFinite(readyAt)
    ) continue;
    out[key] = Math.max(0, Math.min(1_000_000_000, Math.round(readyAt)));
    keyCount++;
  }
  return out;
}

const DISTRICT_COMMAND_HISTORY_ACTIONS = new Set([
  "district-pressure",
  "district-reassure",
  "district-lay-low",
  "district-surveil",
  "district-pardon",
]);

function sanitizeDistrictCommandHistory(
  history: GameState["districtCommandHistory"],
): NonNullable<GameState["districtCommandHistory"]> {
  if (!Array.isArray(history)) return [];
  const allowedEffectFields = new Set([
    "population",
    "crime",
    "unrest",
    "loyalty",
    "infraQuality",
    "defenseRating",
    "wealth",
    "gangInfluence",
  ]);
  return history
    .filter((entry): entry is NonNullable<GameState["districtCommandHistory"]>[number] =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        entry.id.length > 0 &&
        typeof entry.districtId === "string" &&
        entry.districtId.length > 0 &&
        typeof entry.actionId === "string" &&
        DISTRICT_COMMAND_HISTORY_ACTIONS.has(entry.actionId) &&
        entry.effects &&
        typeof entry.effects === "object" &&
        !Array.isArray(entry.effects) &&
        typeof entry.timestamp === "object" &&
        entry.timestamp !== null,
      ),
    )
    .map((entry) => {
      const effects: Record<string, number> = {};
      for (const [field, value] of Object.entries(entry.effects)) {
        if (!allowedEffectFields.has(field)) continue;
        const normalized = safeNum(value, 0);
        if (normalized !== 0) effects[field] = normalized;
      }
      return {
        id: entry.id,
        districtId: entry.districtId,
        actionId: entry.actionId,
        effects,
        tick: Math.max(0, Math.round(safeNum(entry.tick, 0))),
        timestamp: {
          year: Math.max(0, Math.round(safeNum(entry.timestamp.year, 0))),
          month: Math.max(1, Math.min(12, Math.round(safeNum(entry.timestamp.month, 1)))),
          day: Math.max(1, Math.min(31, Math.round(safeNum(entry.timestamp.day, 1)))),
          hour: Math.max(0, Math.min(23, Math.round(safeNum(entry.timestamp.hour, 0)))),
        },
        cooldownUntilTick: Math.max(0, Math.min(1_000_000_000, Math.round(safeNum(entry.cooldownUntilTick, 0)))),
      };
    })
    .slice(-ARRAY_CAPS.districtCommandHistory);
}

function sanitizeBlackMarketHistory(
  history: GameState["blackMarketHistory"],
): NonNullable<GameState["blackMarketHistory"]> {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry): entry is NonNullable<GameState["blackMarketHistory"]>[number] =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.itemId === "string" &&
        typeof entry.itemName === "string" &&
        (entry.outcome === "delivered" || entry.outcome === "seized") &&
        entry.date &&
        typeof entry.date === "object",
      ),
    )
    .map((entry) => ({
      id: entry.id,
      itemId: entry.itemId,
      itemName: entry.itemName,
      cost: floorZero(entry.cost),
      outcome: entry.outcome,
      tick: Math.max(0, Math.round(safeNum(entry.tick, 0))),
      date: {
        year: Math.max(0, Math.round(safeNum(entry.date.year, 0))),
        month: Math.max(1, Math.min(12, Math.round(safeNum(entry.date.month, 1)))),
        day: Math.max(1, Math.min(31, Math.round(safeNum(entry.date.day, 1)))),
        hour: Math.max(0, Math.min(23, Math.round(safeNum(entry.date.hour, 0)))),
      },
    }))
    .slice(-ARRAY_CAPS.blackMarketHistory);
}

const COHORT_STEWARDSHIP_CONTRACT: Record<string, {
  target: CohortStewardshipHistoryEntry["target"];
  approach: CohortStewardshipHistoryEntry["approach"];
}> = {
  "shelter-outreach": { target: "homeless", approach: "humanitarian" },
  "medical-mission": { target: "sick", approach: "humanitarian" },
  "workforce-placement": { target: "unemployed", approach: "technocratic" },
  "industrial-apprenticeship": { target: "workers", approach: "technocratic" },
  "penal-labor-quota": { target: "prisoners", approach: "exploitative" },
  "executive-extraction": { target: "elites", approach: "exploitative" },
  "ration-enforcement": { target: "refugees", approach: "coercive" },
  "detention-crackdown": { target: "prisoners", approach: "coercive" },
};
const COHORT_CITY_EFFECT_FIELDS = new Set<keyof CityStats>([
  "crime", "unrest", "happiness", "lawOrder", "corruption", "employment",
  "housingPressure", "education", "publicHealth", "diseaseRisk", "industrialOutput",
]);
const COHORT_RESOURCE_FIELDS = new Set<keyof Resources>([
  "credits", "food", "water", "power", "steel", "goods", "fuel", "medSupplies", "ammo",
]);
const COHORT_FACTION_REACTION_FIELDS = new Set(["loyalty", "influence", "threat"]);
const NO_COHORT_DEMOGRAPHIC_EFFECT_FIELDS = new Set<string>();

function sanitizeCohortStewardshipHistory(
  history: GameState["cohortStewardshipHistory"],
): NonNullable<GameState["cohortStewardshipHistory"]> {
  if (!Array.isArray(history)) return [];
  const finiteDeltaMap = (
    value: unknown,
    allowed: ReadonlySet<string>,
    limit: number = allowed.size,
  ): Record<string, number> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, amount]) => allowed.has(key) && typeof amount === "number" && Number.isFinite(amount))
        .slice(0, limit)
        .map(([key, amount]) => [key, Math.max(-MAX_RESOURCE, Math.min(MAX_RESOURCE, Math.round(amount as number * 100) / 100))]),
    );
  };
  const clean = history.filter((entry): entry is CohortStewardshipHistoryEntry => Boolean(
    entry
      && typeof entry === "object"
      && typeof entry.id === "string"
      && entry.id.length > 0
      && entry.id.length <= 200
      && typeof entry.actionId === "string"
      && COHORT_STEWARDSHIP_CONTRACT[entry.actionId]?.target === entry.target
      && COHORT_STEWARDSHIP_CONTRACT[entry.actionId]?.approach === entry.approach
      && typeof entry.date === "object"
      && entry.date !== null,
  )).map((entry) => {
    const reactions = entry.factionReactions && typeof entry.factionReactions === "object"
      ? Object.fromEntries(
          Object.entries(entry.factionReactions)
            .filter(([id, value]) => id.length > 0 && id.length <= 200 && value && typeof value === "object")
            .slice(0, 50)
            .map(([id, value]) => [id, finiteDeltaMap(value, COHORT_FACTION_REACTION_FIELDS)]),
        )
      : {};
    const cityEffects = finiteDeltaMap(entry.effects?.cityStats, COHORT_CITY_EFFECT_FIELDS);
    const demographicEffects = finiteDeltaMap(entry.effects?.demographics, NO_COHORT_DEMOGRAPHIC_EFFECT_FIELDS);
    const resourceEffects = finiteDeltaMap(entry.effects?.resources, COHORT_RESOURCE_FIELDS);
    return {
      id: entry.id,
      action: entry.actionId,
      actionId: entry.actionId,
      target: entry.target,
      approach: entry.approach,
      tick: Math.max(0, Math.round(safeNum(entry.tick, 0))),
      date: {
        year: Math.max(0, Math.round(safeNum(entry.date.year, 0))),
        month: Math.max(1, Math.min(12, Math.round(safeNum(entry.date.month, 1)))),
        day: Math.max(1, Math.min(31, Math.round(safeNum(entry.date.day, 1)))),
        hour: Math.max(0, Math.min(23, Math.round(safeNum(entry.date.hour, 0)))),
      },
      effects: {
        ...(Object.keys(cityEffects).length > 0 ? { cityStats: cityEffects } : {}),
        ...(Object.keys(demographicEffects).length > 0 ? { demographics: demographicEffects } : {}),
        ...(Object.keys(resourceEffects).length > 0 ? { resources: resourceEffects } : {}),
      },
      factionReactions: reactions,
      reactions,
      costs: finiteDeltaMap(entry.costs, COHORT_RESOURCE_FIELDS),
      gains: finiteDeltaMap(entry.gains, COHORT_RESOURCE_FIELDS),
      cooldownUntilTick: Math.max(0, Math.min(1_000_000_000, Math.round(safeNum(entry.cooldownUntilTick, 0)))),
    } as CohortStewardshipHistoryEntry;
  });
  return clean.slice(-ARRAY_CAPS.cohortStewardshipHistory);
}

function sanitizeWarEventOccurrences(
  occurrences: GameState["warEventOccurrences"],
  factionIds: Set<string>,
): NonNullable<GameState["warEventOccurrences"]> {
  if (!occurrences || typeof occurrences !== "object" || Array.isArray(occurrences)) return {};

  const cleaned: NonNullable<GameState["warEventOccurrences"]> = {};
  for (const [factionId, eventCounts] of Object.entries(occurrences)) {
    if (!factionIds.has(factionId) || !eventCounts || typeof eventCounts !== "object" || Array.isArray(eventCounts)) {
      continue;
    }
    const validCounts: Record<string, number> = {};
    for (const [eventId, count] of Object.entries(eventCounts)) {
      if (!WAR_EVENT_OCCURRENCE_IDS.has(eventId)) continue;
      const normalized = Math.min(100, Math.floor(floorZero(count)));
      if (normalized > 0) validCounts[eventId] = normalized;
    }
    if (Object.keys(validCounts).length > 0) cleaned[factionId] = validCounts;
  }
  return cleaned;
}
function capArray<T>(arr: T[] | undefined, cap: number): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.length > cap ? arr.slice(0, cap) : arr;
}

function capArrayEnd<T>(arr: T[] | undefined, cap: number): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.length > cap ? arr.slice(-cap) : arr;
}

function sanitizePendingConstructions(value: unknown): NonNullable<GameState["pendingConstructions"]> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, any> =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.buildingKey === "string" &&
        typeof entry.label === "string" &&
        (entry.kind === "city" || entry.kind === "military" || entry.kind === "unit" || entry.kind === "academy"),
      ),
    )
    .map((entry) => {
      const ticksTotal = Math.max(1, Math.min(10_000, Math.floor(safeNum(entry.ticksTotal, 1))));
      const out: any = {
        id: entry.id,
        kind: entry.kind,
        buildingKey: entry.buildingKey,
        label: entry.label,
        count: Math.max(1, Math.min(MAX_CONSTRUCTION_BATCH, Math.floor(safeNum(entry.count, 1)))),
        ticksTotal,
        ticksRemaining: Math.max(0, Math.min(ticksTotal, Math.floor(safeNum(entry.ticksRemaining, ticksTotal)))),
        orderedTick: Math.max(0, Math.floor(safeNum(entry.orderedTick, 0))),
      };
      if (typeof entry.battlefieldRole === "string") out.battlefieldRole = entry.battlefieldRole;
      if (typeof entry.academyId === "string") out.academyId = entry.academyId;
      if (typeof entry.courseId === "string") out.courseId = entry.courseId;
      return out;
    })
    .slice(0, MAX_PENDING_CONSTRUCTION_ORDERS);
}

function sanitizeKnownIds(value: unknown, known: Record<string, unknown>, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(known, id) || seen.has(id)) continue;
    seen.add(id);
    cleaned.push(id);
    if (cleaned.length === cap) break;
  }
  return cleaned;
}

function sanitizeActiveResearch(value: unknown): GameState["activeResearch"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.techId !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(TECH_MAP, raw.techId)) return null;
  const tech = TECH_MAP[raw.techId];
  const cost = tech.researchCost * RESEARCH_COST_MULTIPLIER;
  const oldCost = typeof raw.cost === "number" && Number.isFinite(raw.cost) && raw.cost > 0
    ? raw.cost
    : null;
  const oldProgress = typeof raw.progress === "number" && Number.isFinite(raw.progress) && raw.progress >= 0
    ? raw.progress
    : 0;
  return {
    techId: raw.techId,
    cost,
    progress: oldCost === null ? 0 : Math.min(Math.floor((oldProgress / oldCost) * cost), cost),
  };
}

// Caps a mission log without ever dropping a live (unresolved) mission. New
// missions are appended to the end, while resolved ones accumulate in place, so
// a plain keep-first slice would silently delete freshly launched missions once
// the log fills up. Keep every unresolved mission and fill the remaining budget
// with the most recent resolved entries, preserving original (creation) order.
export function capMissionLog<T extends { resolved?: boolean }>(arr: T[] | undefined, cap: number): T[] {
  if (!Array.isArray(arr)) return [];
  if (arr.length <= cap) return arr;
  const resolved = arr.filter(m => m.resolved);
  const unresolvedCount = arr.length - resolved.length;
  const budget = Math.max(0, cap - unresolvedCount);
  const droppedResolved = new Set<T>(
    budget >= resolved.length ? [] : resolved.slice(0, resolved.length - budget)
  );
  return arr.filter(m => !droppedResolved.has(m));
}

const WILDLANDS_PROJECT_KINDS = new Set([
  "ranger_patrol",
  "cultivation",
  "restoration",
  "cull",
  "vaccinate",
  "fence",
  "beast_hunt",
  "beast_capture",
  "megafauna_retaliation",
]);
const MEGAFAUNA_IDS = new Set(["tarpit_titan", "ridge_tyrant", "glassback_whale"]);
const CAPTURABLE_BEAST_KEYS = new Set(["ridgebackHoundPacks", "glasshornOxCavalry", "skywingFliers"]);

export function sanitizeWildlandsProject(p: any): any | null {
  if (!p || typeof p !== "object") return null;
  if (typeof p.kind !== "string" || typeof p.id !== "string") return null;
  if (!WILDLANDS_PROJECT_KINDS.has(p.kind)) return null;
  const totalTicks = Math.max(1, Math.floor(safeNum(p.totalTicks, 1)));
  const ticksRemaining = Math.max(0, Math.min(totalTicks, Math.floor(safeNum(p.ticksRemaining, totalTicks))));
  const status = p.status === "completed" ? "completed" : "active";
  const out: any = { ...p, totalTicks, ticksRemaining, status };
  delete out.meta;
  if (p.meta && typeof p.meta === "object") {
    const meta: any = {};
    if (typeof p.meta.megafaunaId === "string" && MEGAFAUNA_IDS.has(p.meta.megafaunaId)) {
      meta.megafaunaId = p.meta.megafaunaId;
    }
    if (typeof p.meta.targetSpecies === "string" && CAPTURABLE_BEAST_KEYS.has(p.meta.targetSpecies)) {
      meta.targetSpecies = p.meta.targetSpecies;
    }
    if (typeof p.meta.wranglerCount === "number") {
      meta.wranglerCount = Math.max(0, Math.floor(p.meta.wranglerCount));
    }
    if (p.meta.loadoutSnapshot && typeof p.meta.loadoutSnapshot === "object") {
      const snap: Record<string, number> = {};
      for (const [k, v] of Object.entries(p.meta.loadoutSnapshot)) {
        const n = safeNum(v, 0);
        if (typeof k === "string" && n > 0) snap[k] = Math.floor(n);
      }
      meta.loadoutSnapshot = snap;
    }
    if (p.meta.huntOutcome === "wounded_retreat" || p.meta.huntOutcome === "rout") {
      meta.huntOutcome = p.meta.huntOutcome;
    }
    if (typeof p.meta.originalDeployed === "number") {
      meta.originalDeployed = Math.max(0, Math.floor(p.meta.originalDeployed));
    }
    out.meta = meta;
  }
  // Drop hunt/capture entries missing the meta they need to resolve safely.
  if (out.kind === "beast_hunt" && !out.meta?.megafaunaId) return null;
  if (out.kind === "beast_capture" && !out.meta?.targetSpecies) return null;
  if (out.kind === "megafauna_retaliation" && !out.meta?.megafaunaId) return null;
  return out;
}

export function sanitizeTamingEntry(t: any): any | null {
  if (!t || typeof t !== "object") return null;
  if (typeof t.id !== "string" || typeof t.beastUnitKey !== "string") return null;
  const totalTicks = Math.max(1, Math.floor(safeNum(t.totalTicks, 1)));
  const ticksRemaining = Math.max(0, Math.min(totalTicks, Math.floor(safeNum(t.ticksRemaining, totalTicks))));
  const count = Math.max(0, Math.floor(safeNum(t.count, 0)));
  if (count <= 0) return null;
  return {
    id: t.id,
    beastUnitKey: t.beastUnitKey,
    beastLabel: typeof t.beastLabel === "string" ? t.beastLabel : t.beastUnitKey,
    count,
    ticksRemaining,
    totalTicks,
    capturedAtTick: Math.max(0, Math.floor(safeNum(t.capturedAtTick, 0))),
    biome: typeof t.biome === "string" ? t.biome : "toxic_marsh",
  };
}

function sanitizeAllNumericFields(obj: Record<string, any>): void {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "number") {
      obj[key] = safeNum(obj[key], 0);
    }
  }
}

// Hard ceilings on resource pools. Same defense-in-depth pattern as
// MAX_POPULATION: keep accumulators well below the formatter's "MAX"
// threshold (1e15) so a corrupted save or a future bonus-stacking bug
// can never render scientific notation in the banner. 100 trillion
// (1e14) is far past anything achievable through legitimate play
// (mid-game economies sit in low billions) but inside `formatNumber`'s
// "T" tier so values still render as e.g. "12.34T" instead of "MAX".
// Power can swing negative (drain > generation), which is meaningful,
// so it's symmetric. Other pools are floored at 0 elsewhere.
export const MAX_RESOURCE = 100_000_000_000_000;
export const MAX_POWER_MAGNITUDE = 100_000_000_000_000;

function clampResource(v: unknown): number {
  return Math.max(0, Math.min(MAX_RESOURCE, safeNum(v, 0)));
}

function sanitizeResources(r: Resources): Resources {
  // MAX_RESOURCE is a corruption-safety ceiling, not gameplay storage.
  // Gameplay capacities for fuel, power, steel, goods, and medical supplies
  // live in resourceStorage.ts; food, water, credits, and ammo intentionally
  // remain uncapped/perishable at the reserve layer.
  return {
    credits: Math.max(-MAX_RESOURCE, Math.min(MAX_RESOURCE, safeNum(r.credits, 0))),
    food: clampResource(r.food),
    water: clampResource(r.water),
    power: Math.max(-MAX_POWER_MAGNITUDE, Math.min(MAX_POWER_MAGNITUDE, safeNum(r.power, 0))),
    steel: clampResource(r.steel),
    goods: clampResource(r.goods),
    fuel: clampResource(r.fuel),
    medSupplies: clampResource(r.medSupplies),
    ammo: clampResource(r.ammo),
  };
}

// Hard ceiling on absolute population. 100 billion is well above any
// realistic Earth-scale total (current world pop ~8B) but small enough that
// `formatPop` always returns a sane "<X>B" string instead of falling through
// to scientific notation. Also stops the per-tick growth multiplier from
// compounding into infinity if event effects push the growth rate high.
export const MAX_POPULATION = 100_000_000_000;

// Hard cap on the *base* per-tick population growth rate held in
// `cityStats.populationGrowthRate`. This field accumulates one-time
// permanent bumps from tech completions and event-chain rewards over a
// long playthrough. Researching EVERY growth tech in the base game plus
// both addons legitimately sums to roughly 0.05, so 0.1 gives 2x headroom
// while pulling old drifted saves (the ratcheting-edict bug pushed some
// past 3.0 = 300%/tick) back to a survivable rate on load. The old 0.5
// cap still allowed 6.25%/tick effective growth, which compounded a 5M
// population into the 100B ceiling during one overnight offline catch-up.
export const MAX_BASE_POP_GROWTH_RATE = 0.1;

function sanitizeCityStats(cs: CityStats): CityStats {
  return {
    population: Math.min(MAX_POPULATION, Math.max(0, Math.round(safeNum(cs.population, 100)))),
    populationGrowthRate: clamp(cs.populationGrowthRate, -MAX_BASE_POP_GROWTH_RATE, MAX_BASE_POP_GROWTH_RATE, 0),
    crime: clamp(cs.crime, 0, 200, 0),
    unrest: clamp(cs.unrest, 0, 200, 0),
    happiness: clamp(cs.happiness, 0, 100, 50),
    lawOrder: clamp(cs.lawOrder, 0, 100, 50),
    corruption: clamp(cs.corruption, 0, 100, 0),
    employment: clamp(cs.employment, 0, 100, 50),
    housingPressure: clamp(cs.housingPressure, 0, 200, 0),
    infrastructureHealth: clamp(cs.infrastructureHealth, 0, 100, 50),
    researchProgress: floorZero(cs.researchProgress),
    researchTarget: Math.max(1, safeNum(cs.researchTarget, 100)),
    defenseRating: clamp(cs.defenseRating, 0, 500, 10),
    education: clamp(cs.education, 0, 100, 20),
    publicHealth: clamp(cs.publicHealth, 0, 100, 50),
    biosphere: clamp(cs.biosphere, 0, 100, 50),
    biosphereRecoveryProgress: clamp(cs.biosphereRecoveryProgress ?? 0, -1, 1, 0),
    diseaseRisk: clamp(cs.diseaseRisk, 0, 100, 0),
    upliftPopulation: floorZero(cs.upliftPopulation),
    industrialOutput: cs.industrialOutput != null ? floorZero(cs.industrialOutput) : undefined,
    attrition: clamp(cs.attrition ?? 0, 0, 100, 0),
  };
}

function sanitizeRates(r: Rates): Rates {
  return {
    taxIncome: safeNum(r.taxIncome),
    tradeIncome: safeNum(r.tradeIncome),
    tourismIncome: safeNum(r.tourismIncome),
    foodProduction: safeNum(r.foodProduction),
    foodConsumption: safeNum(r.foodConsumption),
    waterProduction: safeNum(r.waterProduction),
    waterConsumption: safeNum(r.waterConsumption),
    powerGeneration: safeNum(r.powerGeneration),
    powerDrain: safeNum(r.powerDrain),
    steelProduction: safeNum(r.steelProduction),
    goodsProduction: safeNum(r.goodsProduction),
    goodsConsumption: safeNum(r.goodsConsumption),
    fuelProduction: safeNum(r.fuelProduction),
    medProduction: safeNum(r.medProduction),
    ammoProduction: safeNum(r.ammoProduction),
  };
}

function sanitizeDemographics(d: Demographics): Demographics {
  const out = { ...d };
  sanitizeAllNumericFields(out as any);
  out.totalPopulation = Math.max(0, Math.round(out.totalPopulation));
  out.homelessPopulation = Math.max(0, Math.round(out.homelessPopulation));
  out.prisonPopulation = Math.max(0, Math.round(out.prisonPopulation));
  out.refugeePopulation = Math.max(0, Math.round(out.refugeePopulation));
  out.totalDeaths = Math.round(floorCap(out.totalDeaths ?? 0));
  out.orphanPopulation = Math.max(0, Math.round(out.orphanPopulation ?? 0));
  out.displacedByExpansion = Math.max(0, Math.round(out.displacedByExpansion ?? 0));
  out.organDonorRegistry = Math.max(0, Math.round(out.organDonorRegistry ?? 0));
  out.integratedRefugees = Math.max(0, Math.round(out.integratedRefugees ?? 0));
  if (out.populationCohorts && typeof out.populationCohorts === "object") {
    const population = out.totalPopulation;
    const raw = out.populationCohorts;
    out.populationCohorts = {
      homeless: Math.min(population, Math.max(0, Math.round(safeNum(raw.homeless)))),
      refugees: Math.min(population, Math.max(0, Math.round(safeNum(raw.refugees)))),
      prisoners: Math.min(population, Math.max(0, Math.round(safeNum(raw.prisoners)))),
      sick: Math.min(population, Math.max(0, Math.round(safeNum(raw.sick)))),
      retirees: Math.min(population, Math.max(0, Math.round(safeNum(raw.retirees)))),
      orphans: Math.min(population, Math.max(0, Math.round(safeNum(raw.orphans)))),
      workforceCapacity: Math.min(population, Math.max(0, Math.round(safeNum(raw.workforceCapacity)))),
      housingDemand: Math.min(population * 1.5, Math.max(0, Math.round(safeNum(raw.housingDemand)))),
      healthServiceDemand: Math.min(population * 2, Math.max(0, Math.round(safeNum(raw.healthServiceDemand)))),
      unrestPressure: Math.min(100, Math.max(0, safeNum(raw.unrestPressure))),
      workers: Math.min(population, Math.max(0, Math.round(safeNum(raw.workers)))),
      unemployed: Math.min(population, Math.max(0, Math.round(safeNum(raw.unemployed)))),
      elites: Math.min(population, Math.max(0, Math.round(safeNum(raw.elites)))),
    };
  } else {
    delete out.populationCohorts;
  }
  return out;
}

function sanitizeHumanConsequences(value: HumanConsequences | undefined, population: number): HumanConsequences {
  const base = createDefaultHumanConsequences();
  const raw = value && typeof value === "object" ? value : base;
  const boundedCurrent = (v: unknown) => Math.min(population, Math.max(0, Math.round(safeNum(v))));
  const cumulative = (v: unknown) => Math.max(0, Math.round(floorCap(safeNum(v))));
  const causes = (v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v).filter(([, amount]) => Number.isFinite(amount)).map(([key, amount]) => [key, cumulative(amount)]),
    );
  };
  return {
    civilianWounded: boundedCurrent(raw.civilianWounded),
    civilianSick: boundedCurrent(raw.civilianSick),
    civilianMissing: boundedCurrent(raw.civilianMissing),
    totalCivilianDeaths: cumulative(raw.totalCivilianDeaths),
    totalMilitaryDeaths: cumulative(raw.totalMilitaryDeaths),
    totalRecovered: cumulative(raw.totalRecovered),
    totalMissingFound: cumulative(raw.totalMissingFound),
    deathsByCause: causes(raw.deathsByCause),
    woundedByCause: causes(raw.woundedByCause),
    missingByCause: causes(raw.missingByCause),
    lastCombatPopulationLosses: cumulative(raw.lastCombatPopulationLosses),
  };
}

function sanitizeCrimeStats(cs: CrimeStats): CrimeStats {
  const out = { ...cs };
  sanitizeAllNumericFields(out as any);
  return out;
}

function sanitizeDistricts(districts: GameState["districts"]): GameState["districts"] {
  if (!Array.isArray(districts)) return [];
  // Copy-on-write over the ~268-district array. In steady-state play almost
  // every district already holds finite, in-range values, so the per-element
  // spread (which copies ALL ~12 district fields) and the array allocation are
  // pure waste. Scan in place, reuse the input element when all seven guarded
  // fields are already clean, and clone the array lazily on the first
  // correction. Output values stay bit-identical to the old rebuild pass.
  let out = districts;
  for (let i = 0; i < districts.length; i++) {
    const d = districts[i];
    const population = Math.max(0, Math.round(safeNum(d.population, 0)));
    const loyalty = clamp(d.loyalty, 0, 100, 50);
    const crime = clamp(d.crime, 0, 200, 0);
    const infraQuality = clamp(d.infraQuality, 0, 100, 50);
    const wealth = clamp(d.wealth, 0, 100, 50);
    const unrest = clamp(d.unrest, 0, 200, 0);
    const defenseRating = clamp(d.defenseRating, 0, 100, 0);
    // The ecology default is only consumed when d.ecology is non-finite, so
    // defer the (string-parsing) category lookup behind that rare branch
    // instead of paying it for every district every tick. The finite path is
    // an exact inline of clamp(d.ecology, 0, 100, default).
    const ecology =
      typeof d.ecology === "number" && Number.isFinite(d.ecology)
        ? Math.max(0, Math.min(100, d.ecology))
        : clamp(d.ecology, 0, 100, getBaseEcologyForCategory(getDistrictCategory(d.id)));
    if (
      population === d.population &&
      loyalty === d.loyalty &&
      crime === d.crime &&
      infraQuality === d.infraQuality &&
      wealth === d.wealth &&
      unrest === d.unrest &&
      ecology === d.ecology &&
      defenseRating === d.defenseRating
    ) {
      continue;
    }
    if (out === districts) out = districts.slice();
    out[i] = {
      ...d,
      population,
      loyalty,
      crime,
      infraQuality,
      wealth,
      unrest,
      ecology,
      defenseRating,
    };
  }
  return out;
}

/**
 * Company licenses are not silently relocated when a legacy save points at a
 * district that no longer exists. Keep the record and its original ID for
 * auditability, but quarantine it so it cannot contribute income, employment,
 * or production until the reference is valid again.
 */
export function sanitizeCompanies(
  companies: unknown,
  districts: GameState["districts"],
): CompanyInstance[] {
  if (!Array.isArray(companies)) return [];
  const districtIds = new Set(
    (Array.isArray(districts) ? districts : [])
      .map((district) => district?.id)
      .filter((id): id is string => typeof id === "string"),
  );

  return companies.flatMap((raw): CompanyInstance[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const record = raw as Partial<CompanyInstance>;
    if (typeof record.companyId !== "string" || typeof record.districtId !== "string") return [];

    const districtKnown = districtIds.has(record.districtId);
    const cleaned: CompanyInstance = {
      companyId: record.companyId,
      districtId: record.districtId,
      licenseDate: Math.max(0, Math.floor(safeNum(record.licenseDate, 0))),
    };
    if (!districtKnown) {
      cleaned.status = "quarantined";
      cleaned.quarantineReason = "unknown_district";
    }
    return [cleaned];
  });
}

export const LEGACY_COMPANY_QUARANTINE_ADVISORY_ID =
  "save-repair-company-license-quarantine";

/**
 * Explain a load-time company repair without changing the quarantined records.
 * The fixed message ID makes this idempotent across retries and repeated loads;
 * replacing an older copy also keeps the count accurate when a different save
 * is loaded into the same session.
 */
export function addCompanyQuarantineAdvisory(state: GameState): GameState {
  const quarantinedCount = (state.companies ?? []).filter(
    (company) =>
      company.status === "quarantined" &&
      company.quarantineReason === "unknown_district",
  ).length;
  if (quarantinedCount === 0) return state;

  const licenseWord = quarantinedCount === 1 ? "license was" : "licenses were";
  const advisory = {
    id: LEGACY_COMPANY_QUARANTINE_ADVISORY_ID,
    timestamp: state.gameDate,
    tick: state.totalTicks,
    category: "alert" as const,
    title: "LICENSE AUDIT: LEGACY RECORDS QUARANTINED",
    body: `${quarantinedCount} legacy company ${licenseWord} quarantined during save repair. No district was invented or reassigned. Review Commercial Licensing to audit the original district IDs and remove the quarantined records.`,
    read: false,
    priority: "high" as const,
  };

  return {
    ...state,
    messages: [
      advisory,
      ...(state.messages ?? []).filter(
        (message) => message.id !== LEGACY_COMPANY_QUARANTINE_ADVISORY_ID,
      ),
    ].slice(0, ARRAY_CAPS.messages),
  };
}

function sanitizeFactions(factions: GameState["factions"]): GameState["factions"] {
  if (!Array.isArray(factions)) return [];
  const factionDomains = new Set([
    "administration",
    "inspection",
    "legal",
    "auditing",
    "finance",
    "procurement",
  ]);
  return factions.filter((f) => f.id !== "corrupt").map(f => ({
    ...f,
    loyalty: clamp(f.loyalty, 0, 100, 50),
    influence: clamp(f.influence, 0, 100, 10),
    threat: clamp(f.threat, 0, 100, 0),
      scope: f.scope === "internal" || f.scope === "external" ? f.scope : undefined,
    color: typeof f.color === "string" && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : undefined,
    domains: Array.isArray(f.domains)
      ? f.domains.filter((domain): domain is NonNullable<typeof f.domains>[number] =>
          typeof domain === "string" && factionDomains.has(domain),
        )
      : undefined,
    mechanicalRole: f.mechanicalRole === "institutional_governance"
      ? f.mechanicalRole
      : undefined,
    institutionalPresence: f.institutionalPresence === undefined
      ? undefined
      : clamp(f.institutionalPresence, 0, 100, 0),
    ecologyStance: ECOLOGY_STANCE_VALID.has(f.ecologyStance as string) ? f.ecologyStance : undefined,
  }));
}

function sanitizeAdministrativeInstitutions(
  value: GameState["administrativeInstitutions"],
): NonNullable<GameState["administrativeInstitutions"]> {
  const fallback = createDefaultAdministrativeInstitutions();
  if (!value || typeof value !== "object" || !value.cohorts) return fallback;
  const cohorts = { ...fallback.cohorts };
  for (const id of Object.keys(cohorts) as Array<keyof typeof cohorts>) {
    const saved = value.cohorts[id];
    if (!saved || typeof saved !== "object") continue;
    cohorts[id] = {
      id,
      staffing: Math.round(clamp(saved.staffing, 0, 250_000, 0)),
      capacity: clamp(saved.capacity, 0, 100, 50),
      effectiveness: clamp(saved.effectiveness, 0, 100, 50),
      independence: clamp(saved.independence, 0, 100, 50),
      workload: clamp(saved.workload, 0, 100, 50),
      corruptionExposure: clamp(saved.corruptionExposure, 0, 100, 50),
    };
  }
  return {
    cohorts,
    overallCapacity: clamp(value.overallCapacity, 0, 100, 50),
    overallEffectiveness: clamp(value.overallEffectiveness, 0, 100, 50),
    oversightCoverage: clamp(value.oversightCoverage, 0, 100, 50),
    workloadPressure: clamp(value.workloadPressure, 0, 100, 50),
    corruptionExposure: clamp(value.corruptionExposure, 0, 100, 50),
    pressure: clamp(value.pressure, 0, 100, 50),
    reformDirection: new Set([
      "balanced",
      "watchdog_expansion",
      "centralization",
      "decentralization",
      "austerity",
      "expedited_approvals",
      "public_prosecution",
    ]).has(value.reformDirection as string)
      ? value.reformDirection!
      : "balanced",
    reformAdoptedTick: Math.max(0, Math.round(safeNum(value.reformAdoptedTick, 0))),
    lastUpdatedTick: Math.max(0, Math.round(safeNum(value.lastUpdatedTick, 0))),
  };
}

function sanitizePartnerCityArray<T extends ExternalMegacity | Township>(arr: T[] | undefined): T[] {
  if (!Array.isArray(arr)) return [] as T[];
  return arr.map((entity) => {
    const ensured = ensurePartnerCityStats(
      applyCanonicalContinuancePresentation(applyCanonicalLACityPresentation(entity as ExternalMegacity)) as T,
    );
    const popDefault = defaultPopulationFor(entity);
    const uprisingSince = (ensured as ExternalMegacity).uprisingDiscontentSinceTick;
    const isControlled = ensured.controlStatus === "occupied" || ensured.controlStatus === "annexed";
    return {
      ...ensured,
      population: Math.max(0, Math.round(safeNum(ensured.population, popDefault))),
      operational: operationalFromSettlement(ensured),
      cityHealth: clamp(ensured.cityHealth ?? 100, 0, 100, 100),
      attrition: clamp(ensured.attrition ?? 0, 0, 100, 0),
      controlStatus: ["independent", "occupied", "annexed"].includes(ensured.controlStatus ?? "")
        ? ensured.controlStatus
        : "independent",
      tributePerTick: Math.max(0, safeNum(ensured.tributePerTick, 0)),
      occupiedSinceTick: ensured.occupiedSinceTick != null ? safeNum(ensured.occupiedSinceTick, 0) : undefined,
      uprisingDiscontentSinceTick: isControlled && uprisingSince != null
        ? Math.max(0, safeNum(uprisingSince, 0))
        : undefined,
      archetype: ARCH_VALID.has(ensured.archetype as string) ? ensured.archetype : undefined,
      personalityArchetype: PERS_VALID.has(ensured.personalityArchetype as string) ? ensured.personalityArchetype : undefined,
      currentAction: typeof ensured.currentAction === "string" ? ensured.currentAction.slice(0, 200) : undefined,
      concerns: Array.isArray(ensured.concerns) ? ensured.concerns.filter((c) => typeof c === "string").slice(0, 3) : undefined,
      stance: STANCE_VALID.has(ensured.stance as string) ? ensured.stance : undefined,
    } as T;
  });
}

function sanitizeCombat(combat: GameState["combat"]): GameState["combat"] {
  if (!combat) return undefined;
  const c = { ...combat };
  c.warMorale = clamp(c.warMorale, 0, 100, 50);
  c.totalBattlesFought = floorCap(c.totalBattlesFought);
  c.totalVictories = floorCap(c.totalVictories);
  c.totalDefeats = floorCap(c.totalDefeats);
  c.totalCasualties = floorCap(c.totalCasualties);
  c.totalEnemyKills = floorCap(c.totalEnemyKills);
  c.totalPopulationLosses = floorCap(c.totalPopulationLosses);
  // Task #226: lifetime per-archetype kill tally. Drop non-string keys,
  // non-finite values, and zero/negative counts so a tampered or old
  // save can't crash the Military screen. Cap to a generous archetype
  // count (the registry currently has 27; 200 leaves room for future
  // factions). Per-count clamp matches floorZero (non-negative int).
  if (c.enemiesDefeatedByArchetype && typeof c.enemiesDefeatedByArchetype === "object") {
    const cleaned: Record<string, number> = {};
    let kept = 0;
    for (const [key, val] of Object.entries(c.enemiesDefeatedByArchetype)) {
      if (kept >= 200) break;
      if (typeof key !== "string" || key.length === 0 || key.length > 64) continue;
      const n = floorZero(val as number);
      if (n <= 0) continue;
      cleaned[key] = n;
      kept++;
    }
    c.enemiesDefeatedByArchetype = cleaned;
  } else {
    c.enemiesDefeatedByArchetype = {};
  }
  // Task #239: clamp the persisted Defense-tab faction chip selections to
  // the eight known factionSource buckets (or "all"). Unknown / malformed
  // values reset to undefined so the UI's `?? "all"` fallback shows the
  // unfiltered view rather than a stuck chip the player can't see.
  const FACTION_FILTER_KEYS = new Set([
    "all", "gangs", "mutants", "raiders", "corporations",
    "cults", "rival_cities", "insurgents", "pirates",
  ]);
  if (typeof c.killFactionFilter !== "string" || !FACTION_FILTER_KEYS.has(c.killFactionFilter)) {
    c.killFactionFilter = undefined;
  }
  if (typeof c.logFactionFilter !== "string" || !FACTION_FILTER_KEYS.has(c.logFactionFilter)) {
    c.logFactionFilter = undefined;
  }
  if (c.battleLog) c.battleLog = capArray(c.battleLog, ARRAY_CAPS.battleLog);
  if (c.raidEventQueue) c.raidEventQueue = capArray(c.raidEventQueue, 30);
  if (c.zones) {
    c.zones = c.zones.map(z => ({
      ...z,
      controlLevel: clamp(z.controlLevel, 0, 100, 50),
    }));
  }
  return c;
}

function sanitizeUtilities(u: GameState["utilities"]): GameState["utilities"] {
  if (!u) return { powerStored: 0, wasteGenerated: 0, wasteProcessed: 0, transitCapacity: 0, transitLoad: 0, commsStrength: 0, fuelDistribution: 0, sanitationLevel: 0 };
  return {
    powerStored: floorZero(u.powerStored),
    wasteGenerated: floorCap(u.wasteGenerated),
    wasteProcessed: floorCap(u.wasteProcessed),
    transitCapacity: floorZero(u.transitCapacity),
    transitLoad: floorZero(u.transitLoad),
    commsStrength: clamp(u.commsStrength, 0, 100, 50),
    fuelDistribution: floorZero(u.fuelDistribution),
    sanitationLevel: clamp(u.sanitationLevel, 0, 100, 50),
  };
}

function sanitizeTourism(t: GameState["tourism"]): GameState["tourism"] {
  if (!t) return { touristCount: 0, tourismIncome: 0, tourismSatisfaction: 50, tourismCapacity: 0 };
  return {
    touristCount: floorZero(t.touristCount),
    tourismIncome: safeNum(t.tourismIncome),
    tourismSatisfaction: clamp(t.tourismSatisfaction, 0, 100, 50),
    tourismCapacity: floorZero(t.tourismCapacity),
  };
}

function sanitizeRailCorridors(value: unknown): RailCorridor[] {
  if (!Array.isArray(value)) return [];
  const statuses = new Set(["consent_pending", "under_construction", "disrupted", "completed", "cancelled", "rejected"]);
  const seen = new Set<string>();
  const activePairs = new Set<string>();
  // Sort before de-duplicating active endpoint pairs so a reordered save has
  // the same survivor (oldest proposal, then stable corridor id).
  return [...value].sort((a: any, b: any) =>
    safeNum(a?.proposalTick) - safeNum(b?.proposalTick) || String(a?.id ?? "").localeCompare(String(b?.id ?? ""))
  ).filter((raw): raw is RailCorridor => {
    if (!raw || typeof raw !== "object") return false;
    const r = raw as any;
    if (r.version !== 1 || typeof r.id !== "string" || !r.id || seen.has(r.id) ||
      typeof r.endpointId !== "string" || !["megacity", "township"].includes(r.endpointKind) ||
      typeof r.endpointLocationId !== "string" || !statuses.has(r.status)) return false;
    seen.add(r.id);
    r.proposalTick = floorZero(r.proposalTick);
    r.consentExpiresTick = r.consentExpiresTick === undefined ? undefined : floorZero(r.consentExpiresTick);
    r.distance = floorZero(r.distance);
    r.totalTicks = Math.max(1, Math.round(floorZero(r.totalTicks, 1)));
    r.progressTicks = Math.min(r.totalTicks, Math.round(floorZero(r.progressTicks)));
    r.setbackTicks = Math.round(floorZero(r.setbackTicks));
    r.committedCredits = floorZero(r.committedCredits);
    r.committedSteel = floorZero(r.committedSteel);
    r.capabilities = Array.isArray(r.capabilities) ? r.capabilities.filter((x: unknown) =>
      ["passenger", "freight", "intermodal", "industrial", "commercial"].includes(x as string)) : [];
    const upgrades = new Set(["armored_train_plating", "troop_transport_carriages", "weaponized_escort_cars"]);
    r.installedTrainUpgrades = Array.isArray(r.installedTrainUpgrades)
      ? [...new Set(r.installedTrainUpgrades.filter((x: unknown): x is string => typeof x === "string" && upgrades.has(x)))].slice(0, 3)
      : [];
    const staff = r.staffing && typeof r.staffing === "object" ? r.staffing : {};
    r.staffing = Object.fromEntries(["robots", "engineers", "railWorkers", "security", "ticketing", "admin", "maintenance"]
      .map(key => [key, Math.min(100_000, Math.round(floorZero(staff[key])))])) as RailCorridor["staffing"];
    if (r.reason !== undefined && typeof r.reason !== "string") delete r.reason;
    if (["consent_pending", "under_construction", "disrupted"].includes(r.status)) {
      if (activePairs.has(r.endpointId)) return false;
      activePairs.add(r.endpointId);
    }
    return true;
  }).slice(-ARRAY_CAPS.railCorridors);
}

// Task #188: lightweight per-tick sanitize. The full sanitizeState walks
// dozens of subsystems and re-validates every numeric field; this is
// expensive at 4 ticks/sec on populous late-game saves. The numeric
// clamps that matter for next-tick math (resources / cityStats /
// rates) are already enforced by the runTick MAX_RESOURCE block, and
// the only thing that can grow uncapped per-tick is a handful of
// append-only arrays. Enforce just those caps here, and let
// `sanitizeState` run periodically (every N ticks via the runTick
// scheduler) to catch the rare drift the cap-only pass misses.
export function sanitizeStateLight(s: GameState): GameState {
  const out = s;
  const retired = sanitizeRetiredEvents(out);
  out.activeEvents = retired.activeEvents;
  out.eventHistory = retired.eventHistory;
  out.activeEventChains = retired.activeEventChains;
  // Per-tick math depends on these three being clamped/rounded
  // (population is rounded; rates/resources are scrubbed of NaN). Skip
  // the dozens of subsystem walks the full sanitize does, but keep
  // these three so the live tick path stays bit-stable across the
  // sampling window.
  out.resources = sanitizeResources(out.resources);
  out.cityStats = sanitizeCityStats(out.cityStats);
  out.infrastructureLedger = sanitizeInfrastructureLedger(
    out.infrastructureLedger,
    out,
    out.cityStats.infrastructureHealth,
  );
  out.cityStats.infrastructureHealth = infrastructureHealthPercent(out.infrastructureLedger);
  out.rates = sanitizeRates(out.rates);
  if (Array.isArray(out.messages) && out.messages.length > ARRAY_CAPS.messages) {
    out.messages = out.messages.slice(0, ARRAY_CAPS.messages);
  }
  if (Array.isArray(out.completedContracts) && out.completedContracts.length > ARRAY_CAPS.completedContracts) {
    out.completedContracts = out.completedContracts.slice(-ARRAY_CAPS.completedContracts);
  }
  if (Array.isArray(out.eventHistory) && out.eventHistory.length > ARRAY_CAPS.eventHistory) {
    out.eventHistory = out.eventHistory.slice(0, ARRAY_CAPS.eventHistory);
  }
  if (Array.isArray(out.worldEventLog) && out.worldEventLog.length > ARRAY_CAPS.worldEventLog) {
    out.worldEventLog = out.worldEventLog.slice(0, ARRAY_CAPS.worldEventLog);
  }
  if (Array.isArray(out.tickLog) && out.tickLog.length > ARRAY_CAPS.tickLog) {
    out.tickLog = out.tickLog.slice(0, ARRAY_CAPS.tickLog);
  }
  if (Array.isArray(out.activeEvents) && out.activeEvents.length > ARRAY_CAPS.activeEvents) {
    out.activeEvents = out.activeEvents.slice(0, ARRAY_CAPS.activeEvents);
  }
  if (Array.isArray(out.activeEdicts) && out.activeEdicts.length > ARRAY_CAPS.activeEdicts) {
    out.activeEdicts = out.activeEdicts.slice(0, ARRAY_CAPS.activeEdicts);
  }
  if (Array.isArray(out.newsFeed) && out.newsFeed.length > ARRAY_CAPS.newsFeed) {
    out.newsFeed = out.newsFeed.slice(0, ARRAY_CAPS.newsFeed);
  }
  if (Array.isArray(out.railCorridors) && out.railCorridors.length > ARRAY_CAPS.railCorridors) {
    out.railCorridors = out.railCorridors.slice(-ARRAY_CAPS.railCorridors);
  }
  if (Array.isArray(out.cohortStewardshipHistory) && out.cohortStewardshipHistory.length > ARRAY_CAPS.cohortStewardshipHistory) {
    out.cohortStewardshipHistory = out.cohortStewardshipHistory.slice(-ARRAY_CAPS.cohortStewardshipHistory);
  }
  if (out.combat?.battleLog && out.combat.battleLog.length > ARRAY_CAPS.battleLog) {
    out.combat.battleLog = out.combat.battleLog.slice(0, ARRAY_CAPS.battleLog);
  }
  return out;
}

export function sanitizeState(
  s: GameState,
  options: { scrubLegacy?: boolean } = {},
): GameState {
  // Legacy-ID scrubbing is a load/import boundary concern. Walking the whole
  // JSON-shaped state on every live tick is both unnecessary and expensive;
  // live processors already operate on the in-memory state and the regular
  // sanitizer below still enforces all gameplay caps. Callers that accept
  // persisted or externally supplied data keep the secure default.
  const out = options.scrubLegacy === false
    ? { ...s }
    : scrubLegacyContent({ ...s });
  const retired = sanitizeRetiredEvents(out);
  out.activeEvents = retired.activeEvents;
  out.eventHistory = retired.eventHistory;
  out.activeEventChains = retired.activeEventChains;

  out.totalTicks = Math.max(0, Math.round(safeNum(out.totalTicks, 0)));
  const rawAutoFillResult = out.lastOfficerAutoFillResult;
  if (
    rawAutoFillResult
    && typeof rawAutoFillResult === "object"
    && isOfficerAutoFillDoctrineId(rawAutoFillResult.doctrineId)
  ) {
    out.lastOfficerAutoFillResult = {
      doctrineId: rawAutoFillResult.doctrineId,
      filled: Math.max(0, Math.round(safeNum(rawAutoFillResult.filled, 0))),
      totalCost: Math.max(0, Math.round(safeNum(rawAutoFillResult.totalCost, 0))),
      appliedAtTick: Math.max(0, Math.round(safeNum(rawAutoFillResult.appliedAtTick, 0))),
      appliedYear: Math.max(0, Math.round(safeNum(rawAutoFillResult.appliedYear, 0))),
      averageCompetenceDelta: clamp(rawAutoFillResult.averageCompetenceDelta, -100, 100),
      averageLoyaltyDelta: clamp(rawAutoFillResult.averageLoyaltyDelta, -100, 100),
      averageCorruptionDelta: clamp(rawAutoFillResult.averageCorruptionDelta, -100, 100),
      affectedFactionCount: Math.max(0, Math.round(safeNum(rawAutoFillResult.affectedFactionCount, 0))),
      factionLoyaltyDelta: clamp(rawAutoFillResult.factionLoyaltyDelta, -100, 100),
      factionInfluenceDelta: clamp(rawAutoFillResult.factionInfluenceDelta, -100, 100),
      factionThreatDelta: clamp(rawAutoFillResult.factionThreatDelta, -100, 100),
    };
  } else {
    out.lastOfficerAutoFillResult = null;
  }
  out.coerciveBacklashLog = Array.isArray(out.coerciveBacklashLog)
    ? [...new Set(out.coerciveBacklashLog.filter((v): v is string => typeof v === "string" && v.length > 0))].slice(-ARRAY_CAPS.coerciveBacklashLog)
    : [];
  // Monotonic lifetime gross-income tally; floor at 0 and default legacy saves
  // (written before this field existed) to 0 so career/Steam stats never read
  // NaN/undefined.
  out.totalCreditsEarned = floorZero(out.totalCreditsEarned);
  // Persistent event trade-income modifier. Can be negative (e.g. embargoes),
  // so it is not floored at 0; legacy saves written before this field existed
  // default to 0. Symmetrically capped at ±MAX_RESOURCE like other
  // accumulators so a tampered save cannot inject an absurd rate.
  out.eventTradeIncome = Math.max(
    -MAX_RESOURCE,
    Math.min(MAX_RESOURCE, Math.round(safeNum(out.eventTradeIncome, 0))),
  );
  out.playTime = floorZero(out.playTime);
  out.lastTickTime = safeNum(out.lastTickTime, Date.now());
  out.missedTicks = floorZero(out.missedTicks);
  out.contractCapacity = Math.max(1, safeNum(out.contractCapacity, 3));

  // Play mode. Legacy saves (written before turn-based existed) have no field —
  // default them to the classic real-time idle loop. Any corrupted value that
  // is not one of the two known modes also falls back to "realtime".
  const VALID_GAMEPLAY_MODES = new Set(["realtime", "turnbased"]);
  out.gameplayMode = VALID_GAMEPLAY_MODES.has(out.gameplayMode as string)
    ? out.gameplayMode
    : "realtime";
  out.commanderOrigin = isCommanderOriginId(out.commanderOrigin) ? out.commanderOrigin : "none";
  const rawLawCooldowns = out.lawOperationCooldowns;
  out.lawOperationCooldowns = {};
  if (rawLawCooldowns && typeof rawLawCooldowns === "object" && !Array.isArray(rawLawCooldowns)) {
    for (const [missionId, untilTick] of Object.entries(rawLawCooldowns)) {
      const cleanTick = Math.max(0, Math.round(safeNum(untilTick, 0)));
      if (cleanTick > out.totalTicks) out.lawOperationCooldowns[missionId] = cleanTick;
    }
  }

  if (!out.doctrine || typeof out.doctrine !== "object") {
    out.doctrine = { lawVsMercy: 60, brutalityVsLegit: 45, orderVsProsperity: 55, centralVsLocal: 50 };
  } else {
    out.doctrine.lawVsMercy = safeNum(out.doctrine.lawVsMercy, 60);
    out.doctrine.brutalityVsLegit = safeNum(out.doctrine.brutalityVsLegit, 45);
    out.doctrine.orderVsProsperity = safeNum(out.doctrine.orderVsProsperity, 55);
    out.doctrine.centralVsLocal = safeNum(out.doctrine.centralVsLocal, 50);
  }

  // Normalize new endState block (Task: zero-pop city-end). Optional
  // and recomputed every tick by processEndStateCheck, but a malformed
  // persisted blob could still poison transition logic.
  if (out.endState !== undefined) {
    if (
      out.endState === null ||
      typeof out.endState !== "object" ||
      Array.isArray(out.endState)
    ) {
      // Corrupted shape (primitive, null, or array) — reset to canonical default.
      out.endState = { status: "active", survivalMode: "biological" };
    } else {
      const validStatuses = new Set(["active", "fallen", "ascended-machine", "ascended-bio"]);
      const validModes = new Set(["biological", "machine", "hybrid"]);
      if (!validStatuses.has(out.endState.status as string)) out.endState.status = "active";
      if (!validModes.has(out.endState.survivalMode as string)) out.endState.survivalMode = "biological";
      if (out.endState.endedAtTick !== undefined) out.endState.endedAtTick = floorZero(out.endState.endedAtTick);
      if (out.endState.cause !== undefined && typeof out.endState.cause !== "string") delete out.endState.cause;
    }
  }

  out.activeWarOps = out.activeWarOps ?? [];
  out.warOpDefenseBonus = safeNum(out.warOpDefenseBonus, 0);
  if (out.nuclearStockpile && typeof out.nuclearStockpile === "object") {
    out.nuclearStockpile.warheads = Math.max(0, safeNum(out.nuclearStockpile.warheads, 0));
    out.nuclearStockpile.productionRate = safeNum(out.nuclearStockpile.productionRate, 0);
    out.nuclearStockpile.maintenanceCost = safeNum(out.nuclearStockpile.maintenanceCost, 0);
    out.nuclearStockpile.deterrenceLevel = Math.max(0, Math.min(100, safeNum(out.nuclearStockpile.deterrenceLevel, 0)));
    out.nuclearStockpile.lastProductionTick = safeNum(out.nuclearStockpile.lastProductionTick, 0);
  }

  out.resources = sanitizeResources(out.resources);
  out.cityStats = sanitizeCityStats(out.cityStats);
  out.infrastructureLedger = sanitizeInfrastructureLedger(
    out.infrastructureLedger,
    out,
    out.cityStats.infrastructureHealth,
  );
  out.cityStats.infrastructureHealth = infrastructureHealthPercent(out.infrastructureLedger);
  out.rates = sanitizeRates(out.rates);
  out.demographics = sanitizeDemographics(out.demographics);
  out.humanConsequences = sanitizeHumanConsequences(out.humanConsequences, out.cityStats.population);
  if (!s.humanConsequences) {
    out.humanConsequences.totalCivilianDeaths = Math.max(0, Math.round(out.demographics.totalDeaths ?? 0));
    out.humanConsequences.lastCombatPopulationLosses = Math.max(0, Math.round(out.combat?.totalPopulationLosses ?? 0));
  }
  if ((out.demographics.totalDeaths ?? 0) === 0 && out.totalTicks > 0) {
    out.demographics.totalDeaths = Math.round(out.totalTicks * 3);
  }
  out.crimeStats = sanitizeCrimeStats(out.crimeStats);
  out.districts = sanitizeDistricts(out.districts);
  out.companies = sanitizeCompanies(out.companies, out.districts);
  out.factions = sanitizeFactions(out.factions);
  out.administrativeInstitutions = sanitizeAdministrativeInstitutions(out.administrativeInstitutions);
  out.warEventOccurrences = sanitizeWarEventOccurrences(
    out.warEventOccurrences,
    new Set(out.factions.map((f) => f.id)),
  );
  out.externalMegacities = sanitizePartnerCityArray(out.externalMegacities);
  out.megacityRoster = normalizeMegacityRoster(out.megacityRoster);
  out.externalMegacities = out.externalMegacities.map((city) => {
    const rosterEntry = out.megacityRoster?.entries.find((entry) => entry.id === city.id);
    return rosterEntry ? { ...city, name: rosterEntry.displayName } : city;
  });
  out.townships = sanitizePartnerCityArray(out.townships);
  out.combat = sanitizeCombat(out.combat);
  // Do this before the rest of the load consumers can call .includes(),
  // .filter(), or dereference a technology/policy definition.
  out.unlockedTechnologies = sanitizeKnownIds(
    out.unlockedTechnologies,
    TECH_MAP,
    ARRAY_CAPS.unlockedTechnologies,
  );
  out.researchQueue = sanitizeKnownIds(out.researchQueue, TECH_MAP, ARRAY_CAPS.researchQueue);
  out.activeResearch = sanitizeActiveResearch(out.activeResearch);
  out.activePolicies = sanitizeKnownIds(out.activePolicies, POLICY_MAP, ARRAY_CAPS.activePolicies);
  out.utilities = sanitizeUtilities(out.utilities);
  out.tourism = sanitizeTourism(out.tourism);
  out.railCorridors = sanitizeRailCorridors(out.railCorridors);
  out.stockpiles = sanitizeRecord(out.stockpiles);
  out.eventRecurrenceCounts = sanitizeEventRecurrenceCounts(out.eventRecurrenceCounts);
  out.personalActionHistory = sanitizePersonalActionHistory(out.personalActionHistory);
  out.personalActionCooldowns = sanitizePersonalActionCooldowns(out.personalActionCooldowns);
  out.districtCommandHistory = sanitizeDistrictCommandHistory(out.districtCommandHistory);
  out.cohortStewardshipHistory = sanitizeCohortStewardshipHistory(out.cohortStewardshipHistory);
  if (!Array.isArray(out.pendingTickEntries)) out.pendingTickEntries = [];
  else out.pendingTickEntries = out.pendingTickEntries
    .filter((entry) => Boolean(entry && typeof entry === "object" && typeof entry.label === "string" && typeof entry.unit === "string" && typeof entry.reason === "string" && Number.isFinite(entry.delta)))
    .map((entry) => ({
      label: entry.label.slice(0, 200),
      delta: Math.max(-MAX_RESOURCE, Math.min(MAX_RESOURCE, entry.delta)),
      unit: entry.unit.slice(0, 80),
      reason: entry.reason.slice(0, 500),
      severity: entry.severity === "positive"
        || entry.severity === "negative"
        || entry.severity === "warning"
        || entry.severity === "neutral"
        ? entry.severity
        : "neutral",
    }))
    .slice(-ARRAY_CAPS.pendingTickEntries);
  out.blackMarketHistory = sanitizeBlackMarketHistory(out.blackMarketHistory);

  out.messages = capArray(out.messages, ARRAY_CAPS.messages);
  if (out.dismissedMessageIds) {
    const seen = new Set<string>();
    // Dismissals are append-only tombstones. Keep the newest IDs so a long
    // campaign cannot resurrect a recently dismissed mission after reload.
    out.dismissedMessageIds = capArrayEnd(
      out.dismissedMessageIds
      .filter((id): id is string => {
        if (typeof id !== "string" || seen.has(id)) return false;
        seen.add(id);
        return true;
      }),
      ARRAY_CAPS.dismissedMessageIds,
    );
  }
  out.blackMarketHistory = capArrayEnd(out.blackMarketHistory, ARRAY_CAPS.blackMarketHistory);
  out.completedContracts = capArrayEnd(out.completedContracts, ARRAY_CAPS.completedContracts);
  out.eventHistory = capArray(out.eventHistory, ARRAY_CAPS.eventHistory);
  out.worldEventLog = capArray(out.worldEventLog, ARRAY_CAPS.worldEventLog);
  out.tickLog = capArray(out.tickLog, ARRAY_CAPS.tickLog);
  out.activeEvents = capArray(out.activeEvents, ARRAY_CAPS.activeEvents);
  out.activeEdicts = capArray(out.activeEdicts, ARRAY_CAPS.activeEdicts);
  if (out.innerCircle && typeof out.innerCircle === "object") {
    out.innerCircle.whispers = capArrayEnd(out.innerCircle.whispers, ARRAY_CAPS.whispers);
  }
  out.pendingConstructions = sanitizePendingConstructions(out.pendingConstructions)
    .slice(0, ARRAY_CAPS.pendingConstructions);
  if (out.militaryOverhaul && typeof out.militaryOverhaul === "object") {
    const rawAcademies = out.militaryOverhaul.academies;
    const facilities = rawAcademies?.facilities && typeof rawAcademies.facilities === "object"
      ? rawAcademies.facilities
      : {};
    const normalizedFacilities: Record<string, { quality: number; instructors: string[] }> = {};
    for (const [academyId, facility] of Object.entries(facilities)) {
      if (!facility || typeof facility !== "object") continue;
      normalizedFacilities[academyId] = {
        quality: Math.max(0, Math.min(100, Math.round(safeNum((facility as any).quality, 0)))),
        instructors: Array.isArray((facility as any).instructors)
          ? (facility as any).instructors.filter((id: unknown): id is string => typeof id === "string").slice(0, 20)
          : [],
      };
    }
    out.militaryOverhaul.academies = {
      facilities: normalizedFacilities,
      qualifications: rawAcademies?.qualifications && typeof rawAcademies.qualifications === "object"
        ? Object.fromEntries(Object.entries(rawAcademies.qualifications).map(([id, count]) => [id, Math.max(0, Math.floor(safeNum(count, 0)))]))
        : {},
      completedCourses: Math.max(0, Math.floor(safeNum(rawAcademies?.completedCourses, 0))),
      graduationRate: Math.max(0, Math.min(100, safeNum(rawAcademies?.graduationRate, 0))),
      readinessBonus: Math.max(0, Math.min(100, safeNum(rawAcademies?.readinessBonus, 0))),
    };
  }
  if (out.newsFeed) out.newsFeed = capArray(out.newsFeed, ARRAY_CAPS.newsFeed);

  if (out.strikeHistory) out.strikeHistory = capArray(out.strikeHistory, ARRAY_CAPS.strikeHistory);
  if (out.dismissedTutorialTips) out.dismissedTutorialTips = capArray(out.dismissedTutorialTips, ARRAY_CAPS.dismissedTutorialTips);
  if (out.unlockedAchievements) out.unlockedAchievements = capArray(out.unlockedAchievements, ARRAY_CAPS.unlockedAchievements);
  if (out.discoveredTerrain !== undefined) {
    const arr = Array.isArray(out.discoveredTerrain) ? out.discoveredTerrain : [];
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const v of arr) {
      if (typeof v !== "string") continue;
      if (seen.has(v)) continue;
      seen.add(v);
      cleaned.push(v);
    }
    out.discoveredTerrain = capArray(cleaned, ARRAY_CAPS.discoveredTerrain);
  }
  if (out.atlasCategoryRewardsClaimed !== undefined) {
    const arr = Array.isArray(out.atlasCategoryRewardsClaimed) ? out.atlasCategoryRewardsClaimed : [];
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const v of arr) {
      if (typeof v !== "string") continue;
      if (seen.has(v)) continue;
      seen.add(v);
      cleaned.push(v);
    }
    out.atlasCategoryRewardsClaimed = capArray(cleaned, ARRAY_CAPS.atlasCategoryRewardsClaimed);
  }
  if (out.discoveredLocationIds !== undefined) {
    const arr = Array.isArray(out.discoveredLocationIds) ? out.discoveredLocationIds : [];
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const v of arr) {
      if (typeof v !== "string") continue;
      if (seen.has(v)) continue;
      seen.add(v);
      cleaned.push(v);
    }
    // Keep the most recently discovered ids: every discovery path appends
    // to the END of this list (worldEvents reveal, location-action reveal,
    // profile lore reveal), so the end-keeping slice preserves the newest
    // finds. The world map defines ~229 locations total — well under the
    // 300 cap — so after dedupe a legitimate save can never exceed the
    // cap; the trim only ever bites on corrupted or duplicate-bloated
    // saves, and never hides a genuinely discovered Atlas entry.
    out.discoveredLocationIds = capArrayEnd(cleaned, ARRAY_CAPS.discoveredLocationIds);
  }
  if (out.recentResumeOvershoots !== undefined) {
    // Defensively parse each ring-buffer entry: drop anything that isn't
    // a plain {actualMs, estimatedMs, atTick} of finite non-negative
    // numbers so a corrupted save can't escalate the warning forever.
    const arr = Array.isArray(out.recentResumeOvershoots) ? out.recentResumeOvershoots : [];
    const cleaned = arr
      .map((r: any) => {
        if (!r || typeof r !== "object") return null;
        const actualMs = safeNum(r.actualMs, -1);
        const estimatedMs = safeNum(r.estimatedMs, -1);
        const atTick = safeNum(r.atTick, -1);
        if (actualMs < 0 || estimatedMs < 0 || atTick < 0) return null;
        return { actualMs, estimatedMs, atTick };
      })
      .filter((r): r is { actualMs: number; estimatedMs: number; atTick: number } => r !== null);
    out.recentResumeOvershoots = capArrayEnd(cleaned, ARRAY_CAPS.recentResumeOvershoots);
  }
  if (out.statHistory) out.statHistory = capArray(out.statHistory as any[], ARRAY_CAPS.statHistory) as any;
  if (out.activeMissions) out.activeMissions = capMissionLog(out.activeMissions as any[], ARRAY_CAPS.activeMissions) as any;
  if (out.megaProjects) out.megaProjects = capArray(out.megaProjects as any[], ARRAY_CAPS.megaProjects) as any;
  if (out.activeEventChains) out.activeEventChains = capArray(out.activeEventChains as any[], ARRAY_CAPS.activeEventChains) as any;
  if (out.lawMissions) out.lawMissions = capArray(out.lawMissions, ARRAY_CAPS.lawMissions);
  if (out.miningOperations) out.miningOperations = capArray(out.miningOperations, ARRAY_CAPS.miningOperations);
  if (out.scavengeExpeditions) out.scavengeExpeditions = capArray(out.scavengeExpeditions, ARRAY_CAPS.scavengeExpeditions);
  if (out.wildlandsProjects) {
    // Filter invalid entries first, then cap. Cap-then-filter could starve a
    // valid entry out of the retention window if a corrupted save piled junk
    // ahead of it. Guard against truthy non-array shapes from corrupted saves.
    const projects = Array.isArray(out.wildlandsProjects) ? out.wildlandsProjects : [];
    out.wildlandsProjects = capArray(
      projects.map(sanitizeWildlandsProject).filter((p: any): p is any => p !== null),
      ARRAY_CAPS.wildlandsProjects,
    );
  }
  if (out.tamingQueue) {
    const queue = Array.isArray(out.tamingQueue) ? out.tamingQueue : [];
    out.tamingQueue = capArray(
      queue.map(sanitizeTamingEntry).filter((t: any): t is any => t !== null),
      ARRAY_CAPS.tamingQueue,
    );
  }
  if (out.wildlandsTrophies && typeof out.wildlandsTrophies === "object") {
    const t: any = out.wildlandsTrophies;
    out.wildlandsTrophies = {
      ivory: floorZero(safeNum(t.ivory, 0)),
      alphaPheromones: floorZero(safeNum(t.alphaPheromones, 0)),
      exoticPelts: floorZero(safeNum(t.exoticPelts, 0)),
      geneVaultSamples: floorZero(safeNum(t.geneVaultSamples, 0)),
    };
  }
  if (out.unitUpgradeTiers && typeof out.unitUpgradeTiers === "object") {
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(out.unitUpgradeTiers)) {
      const n = safeNum(v, 0);
      if (n > 0) cleaned[k] = Math.min(10, Math.floor(n));
    }
    out.unitUpgradeTiers = cleaned;
  }
  if (out.captainUpgrades && typeof out.captainUpgrades === "object") {
    const cleaned: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(out.captainUpgrades)) {
      if (Array.isArray(v)) cleaned[k] = v.filter((s) => typeof s === "string").slice(0, 20);
    }
    out.captainUpgrades = cleaned;
  }
  if (out.followerUpgrades && typeof out.followerUpgrades === "object") {
    const cleaned: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(out.followerUpgrades)) {
      if (Array.isArray(v)) cleaned[k] = v.filter((s) => typeof s === "string").slice(0, 20);
    }
    out.followerUpgrades = cleaned;
  }
  if (out.scavengingInfrastructure) out.scavengingInfrastructure = capArray(out.scavengingInfrastructure, ARRAY_CAPS.scavengingInfrastructure);
  if (out.diplomaticHistory) out.diplomaticHistory = capArray(out.diplomaticHistory as any[], ARRAY_CAPS.diplomaticHistory) as any;
  if (out.districtExpansion?.expansionLog) out.districtExpansion.expansionLog = capArray(out.districtExpansion.expansionLog, ARRAY_CAPS.expansionLog);
  // Local economy: enforce the same caps the live tick path enforces,
  // so a corrupted save with an oversized businesses[] / closedHistory[]
  // is recovered to a sane shape on load instead of carrying the bloat
  // forward into Steam Cloud sync.
  if (out.localEconomy && typeof out.localEconomy === "object") {
    const econ = out.localEconomy as any;
    if (Array.isArray(econ.businesses)) {
      // Rehydrate compacted records first (writeSlotSave drops default-
      // valued fields to shrink saves), then enforce the cap. Consumers
      // like businessEventChains.ts read the full shape.
      econ.businesses = capArray(
        econ.businesses.map(expandActiveBusinessFromSave),
        ARRAY_CAPS.businesses,
      );
    }
    if (Array.isArray(econ.closedHistory)) {
      econ.closedHistory = capArray(
        econ.closedHistory.map(expandClosedBusinessRecordFromSave),
        ARRAY_CAPS.closedHistory,
      );
    }
  }
  if (out.diplomaticReputation != null) out.diplomaticReputation = clamp(out.diplomaticReputation, 0, 100, 50);
  // Refugee & border-pressure fields (optional, added mid-project): backfill
  // legacy saves to 0 and keep them finite/non-negative.
  out.borderClosureTicks = floorCap(out.borderClosureTicks);
  out.refugeeBoostTicksRemaining = Math.min(200, floorCap(out.refugeeBoostTicksRemaining));
  out.refugeeBoostMagnitude = clamp(safeNum(out.refugeeBoostMagnitude, 0), 0, 0.5, 0);
  out.integratedRefugees = floorCap(out.integratedRefugees);
  if (out.diplomacyCooldowns && typeof out.diplomacyCooldowns === "object") {
    for (const key of Object.keys(out.diplomacyCooldowns)) {
      const v = out.diplomacyCooldowns[key];
      if (typeof v !== "number" || !Number.isFinite(v)) delete out.diplomacyCooldowns[key];
    }
  }
  if (out.completedDiplomaticActions && typeof out.completedDiplomaticActions === "object") {
    for (const key of Object.keys(out.completedDiplomaticActions)) {
      const arr = out.completedDiplomaticActions[key];
      if (!Array.isArray(arr)) { delete out.completedDiplomaticActions[key]; continue; }
      out.completedDiplomaticActions[key] = arr.filter((v: unknown) => typeof v === "string");
    }
  }
  if (out.diplomacyAdvanced && typeof out.diplomacyAdvanced === "object") {
    const da = out.diplomacyAdvanced as any;
    if (da.incidents) {
      da.incidents = capArray(da.incidents, ARRAY_CAPS.diplomaticIncidents);
      // Resolved incidents never need their `responses` array again —
      // it's only consumed when the player picks an option for an
      // unresolved incident (see diplomacyAdvanced.ts:722). Drop it on
      // load so old saves shrink immediately instead of waiting for the
      // next tick's compaction pass.
      for (const inc of da.incidents) {
        if (inc && inc.resolved && Array.isArray(inc.responses) && inc.responses.length > 0) {
          inc.responses = [];
        }
      }
    }
    if (da.factionRelations) da.factionRelations = capArray(da.factionRelations, ARRAY_CAPS.factionRelations);
    if (da.wars) da.wars = capArray(da.wars, ARRAY_CAPS.wars);
    if (!Array.isArray(da.concludedWars)) da.concludedWars = [];
    da.concludedWars = capArray(da.concludedWars, 20);
    const sanitizeWarCaptures = (war: any) => {
      if (!war || typeof war !== "object") return;
      if (!Array.isArray(war.captures)) {
        war.captures = [];
        return;
      }
      war.captures = war.captures
        .filter((capture: any) => capture && typeof capture.id === "string" && capture.id.length > 0 && Number.isFinite(capture.count) && capture.count > 0)
        .map((capture: any) => ({
          id: capture.id,
          count: Math.max(0, Math.floor(capture.count)),
          originKind: ["faction", "settlement", "nation", "township", "military_force", "unknown"].includes(capture.originKind) ? capture.originKind : "unknown",
          originId: typeof capture.originId === "string" && capture.originId.length > 0 ? capture.originId : null,
          originLabel: typeof capture.originLabel === "string" && capture.originLabel.length > 0 ? capture.originLabel : "Unknown origin",
          status: ["held", "isolated", "released", "escaped", "transferred", "exchanged", "recruited", "executed", "deceased"].includes(capture.status) ? capture.status : "held",
        }))
        .slice(-100);
    };
    for (const war of da.wars) sanitizeWarCaptures(war);
    for (const history of da.concludedWars) {
      if (!history || typeof history !== "object") continue;
      if (!Array.isArray(history.stages)) history.stages = [];
      if (!Array.isArray(history.reports)) history.reports = [];
      history.stages = history.stages.slice(-5);
      history.reports = history.reports.slice(-8);
      sanitizeWarCaptures(history);
    }
    if (da.peaceConferences) da.peaceConferences = capArray(da.peaceConferences, ARRAY_CAPS.peaceConferences);
    if (da.envoys) da.envoys = capArray(da.envoys, ARRAY_CAPS.envoys);
    if (da.negotiations) da.negotiations = capArray(da.negotiations, ARRAY_CAPS.negotiations);
  }
  if (!out.partnerLedgers || typeof out.partnerLedgers !== "object") out.partnerLedgers = {};
  if (!Array.isArray(out.intelItems)) out.intelItems = [];
  if (!Array.isArray(out.pendingPartnerResponses)) out.pendingPartnerResponses = [];
  if (out.partnerLedgers && typeof out.partnerLedgers === "object") {
    for (const key of Object.keys(out.partnerLedgers)) {
      const led = out.partnerLedgers[key];
      if (!led || typeof led !== "object") { delete out.partnerLedgers[key]; continue; }
      led.favors = clamp(led.favors, 0, 200, 0);
      led.grudges = clamp(led.grudges, 0, 200, 0);
      led.debts = clamp(led.debts, -100, 100, 0);
      led.lastInteractionTick = safeNum(led.lastInteractionTick, 0);
      if (!Array.isArray(led.recent)) led.recent = [];
      led.recent = capArray(led.recent, ARRAY_CAPS.partnerLedgerRecent);
      if (typeof led.reputationLine !== "string") led.reputationLine = "No formal record yet.";
      if (!["rising", "steady", "falling"].includes(led.trustTrend)) led.trustTrend = "steady";
    }
  }
  if (out.intelItems && Array.isArray(out.intelItems)) {
    out.intelItems = capArray(out.intelItems, ARRAY_CAPS.intelItems);
  }
  if (out.pendingPartnerResponses && Array.isArray(out.pendingPartnerResponses)) {
    out.pendingPartnerResponses = capArray(out.pendingPartnerResponses, ARRAY_CAPS.pendingPartnerResponses);
  }

  // Intrigue (Task #379): clamp radicalization 0-100 and cap/clean plots so a
  // corrupt save can't feed the tick loop NaN progress or unbounded plots.
  if (out.intrigue && typeof out.intrigue === "object") {
    const intr: any = out.intrigue;
    if (!intr.radicalization || typeof intr.radicalization !== "object" || Array.isArray(intr.radicalization)) {
      intr.radicalization = {};
    } else {
      for (const k of Object.keys(intr.radicalization)) {
        intr.radicalization[k] = clamp(intr.radicalization[k], 0, 100, 0);
      }
    }
    if (!Array.isArray(intr.plots)) {
      intr.plots = [];
    } else {
      intr.plots = capArray(
        intr.plots.filter((p: any) => p && typeof p === "object" && typeof p.id === "string"),
        ARRAY_CAPS.intriguePlots,
      );
      for (const p of intr.plots) {
        p.progress = clamp(p.progress, 0, 100, 0);
        if (!Array.isArray(p.warnedStages)) p.warnedStages = [];
        p.matured = !!p.matured;
      }
    }
  }

  if (out.prestigeResourceMult != null) out.prestigeResourceMult = safeNum(out.prestigeResourceMult, 1);
  if (out.prestigeResearchMult != null) out.prestigeResearchMult = safeNum(out.prestigeResearchMult, 1);
  if (out.prestigeBusinessSpawnMult != null) out.prestigeBusinessSpawnMult = safeNum(out.prestigeBusinessSpawnMult, 1);
  if (out.prestigeChainExpansionMult != null) out.prestigeChainExpansionMult = safeNum(out.prestigeChainExpansionMult, 1);
  if (out.prestigeAntiMonopolyCapDelta != null) out.prestigeAntiMonopolyCapDelta = floorZero(out.prestigeAntiMonopolyCapDelta);

  if (out.player) {
    if (!Array.isArray(out.player.selectedPerks)) out.player.selectedPerks = [];
    if (typeof out.player.activeTitle !== "string") out.player.activeTitle = "City Commander";
    out.player.totalDecisions = floorCap(out.player.totalDecisions);
    out.player.contractsCompleted = floorCap(out.player.contractsCompleted);
    out.player.criminalsSentenced = floorCap(out.player.criminalsSentenced);
    out.player.riotsQuelled = floorCap(out.player.riotsQuelled);
  }

  // Weekly challenge delta-math guard. `baseline` snapshots a lifetime
  // counter at generation time and `getProgress` computes `current -
  // baseline`. Now that those source counters are floorCap'd, a
  // pre-cap save could carry a `baseline` (or a tampered `target`) far
  // above MAX_RESOURCE, which would render as scientific notation in the
  // challenge UI and permanently freeze progress at 0 (current - huge
  // baseline). Clamp both to the same ceiling so the delta stays sane.
  if (out.weeklyChallenge && typeof out.weeklyChallenge === "object") {
    out.weeklyChallenge.baseline = floorCap(out.weeklyChallenge.baseline);
    out.weeklyChallenge.target = floorCap(out.weeklyChallenge.target);
  }
  if (out.weeklyChallengesCompleted != null) {
    out.weeklyChallengesCompleted = floorCap(out.weeklyChallengesCompleted);
  }

  const lr = out.locationRelations;
  if (lr && typeof lr === "object") {
    for (const key of Object.keys(lr)) {
      const rel = lr[key];
      if (rel) {
        rel.disposition = safeNum(rel.disposition, 0);
        rel.aidSent = floorCap(rel.aidSent);
        rel.raidsSent = floorCap(rel.raidsSent);
        rel.tradesMade = floorCap(rel.tradesMade);
        rel.scoutsMade = floorCap(rel.scoutsMade);
      }
    }
  }

  if (out.banking) {
    const b = { ...out.banking };
    if (b.loans) {
      b.loans = b.loans.map(l => ({
        ...l,
        remainingBalance: floorZero(l.remainingBalance),
        monthlyPayment: floorZero(l.monthlyPayment),
        interestRate: clamp(l.interestRate, 0, 1, 0.05),
      }));
    }
    out.banking = b;
  }

  if (out.retinue && typeof out.retinue === "object") {
    const r = out.retinue;
    if (!Array.isArray(r.squads)) r.squads = [];
    if (!Array.isArray(r.captains)) r.captains = [];
    if (!Array.isArray(r.troops)) r.troops = [];
    if (!Array.isArray(r.trainingQueue)) r.trainingQueue = [];
    r.maxSquads = safeNum(r.maxSquads, 4);
    r.maxTroopsPerSquad = safeNum(r.maxTroopsPerSquad, 8);
    r.totalRecruits = floorCap(r.totalRecruits);
    r.totalPromotions = floorCap(r.totalPromotions);
    r.totalCasualties = floorCap(r.totalCasualties);
    r.totalKills = floorCap(r.totalKills);
    if (!Array.isArray(r.operationHistory)) r.operationHistory = [];
    r.operationHistory = r.operationHistory
      .filter((entry: any) => entry && typeof entry === "object")
      .slice(0, 30);
    if (r.activeOperation && typeof r.activeOperation === "object") {
      const active = r.activeOperation;
      const operation = SQUAD_OPERATIONS.find(op => op.id === active.operationId);
      const validResolution = active.resolution && typeof active.resolution === "object";
      if (!operation || typeof active.squadId !== "string" || !validResolution) {
        r.activeOperation = null;
      } else {
        active.ticksRemaining = Math.max(1, Math.floor(safeNum(active.ticksRemaining, 1)));
        active.startedTick = Math.max(0, Math.floor(safeNum(active.startedTick, 0)));
        active.resolution.duration = Math.max(1, Math.floor(safeNum(active.resolution.duration, operation.spec.duration)));
        active.resolution.successChance = clamp(active.resolution.successChance, 5, 95, 50);
        active.resolution.casualties = floorCap(active.resolution.casualties);
        active.resolution.readyTroopCount = floorCap(active.resolution.readyTroopCount);
      }
    } else {
      r.activeOperation = null;
    }
    r.troops = r.troops.slice(0, 200);
    r.captains = r.captains.slice(0, 20);
    r.squads = r.squads.slice(0, 20);
    for (const squad of r.squads) {
      if (squad && typeof squad === "object") {
        squad.doctrine = Object.prototype.hasOwnProperty.call(SQUAD_DOCTRINES_MAP, squad.doctrine ?? "")
          ? squad.doctrine
          : DEFAULT_SQUAD_DOCTRINE;
        squad.deputyCaptainId = typeof squad.deputyCaptainId === "string" && squad.deputyCaptainId.length > 0
          ? squad.deputyCaptainId
          : null;
      }
    }
    r.trainingQueue = r.trainingQueue.slice(0, 50);
  }

  out.securityWings = sanitizeSecurityWings(out);
  if (out.custody) {
    const custody = sanitizeCustodyState(out.custody);
    custody.records = custody.records.slice(-ARRAY_CAPS.custodyRecords);
    custody.actionHistory = custody.actionHistory.slice(0, ARRAY_CAPS.custodyHistory);
    out.custody = custody;
  } else {
    out.custody = sanitizeCustodyState(undefined);
  }

  if (out.inventory && typeof out.inventory === "object") {
    const inv = out.inventory;
    if (!Array.isArray(inv.items)) inv.items = [];
    inv.maxSlots = safeNum(inv.maxSlots, 30);
    inv.totalItemsFound = floorCap(inv.totalItemsFound);
    inv.totalItemsSold = floorCap(inv.totalItemsSold);
    inv.items = inv.items.slice(0, 100);
  }

  backfillOfficerBackstories(out.officers);
  backfillCharacterBackstories(out.namedCharacters);

  return out;
}

export function backfillOfficerBackstories(list: unknown): void {
  if (!Array.isArray(list)) return;
  for (const o of list as Officer[]) {
    if (!o || typeof o !== "object") continue;
    if (typeof o.backstory !== "string" || o.backstory.length === 0) {
      try {
        o.backstory = generateOfficerBio(o);
      } catch {
        o.backstory = "Background details unavailable.";
      }
    }
  }
}

export function backfillCharacterBackstories(list: unknown): void {
  if (!Array.isArray(list)) return;
  for (const c of list as NamedCharacter[]) {
    if (!c || typeof c !== "object") continue;
    if (typeof c.backstory !== "string" || c.backstory.length === 0) {
      try {
        c.backstory = generateCharacterBio(c);
      } catch {
        c.backstory = "Background details unavailable.";
      }
    }
  }
}

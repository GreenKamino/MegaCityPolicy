import type { GameState, Faction, DiplomaticHistoryEntry, ActiveOperation, ActiveOperationType, TickEntry, PartnerKind, EcologyStance } from "./types";
import { ledgerAcceptanceModifier } from "./partnerLedger";
import { personalityModifier } from "./partnerPersonality";
import { recordCreditsEarned } from "@/engine/creditTracking";
import { applyInfrastructureHealthDelta } from "@/engine/infrastructureLedger";

const ECOLOGY_ACTIONS: Set<string> = new Set([
  "poaching-deal", "sanctuary-treaty", "gene-bank-exchange", "plague-swarm",
]);

function ecologyStanceModifier(stance: EcologyStance | undefined, action: string): number {
  if (!stance || stance === "neutral") return 0;
  if (!ECOLOGY_ACTIONS.has(action)) return 0;
  if (stance === "poacher") {
    if (action === "poaching-deal") return 25;
    if (action === "plague-swarm") return 10;
    if (action === "sanctuary-treaty") return -30;
    if (action === "gene-bank-exchange") return 5;
  }
  if (stance === "conservationist") {
    if (action === "sanctuary-treaty") return 30;
    if (action === "gene-bank-exchange") return 15;
    if (action === "poaching-deal") return -35;
    if (action === "plague-swarm") return -40;
  }
  if (stance === "druid") {
    if (action === "sanctuary-treaty") return 35;
    if (action === "gene-bank-exchange") return -10;
    if (action === "poaching-deal") return -45;
    if (action === "plague-swarm") return -25;
  }
  return 0;
}

export type DiplomacyCheckResult = {
  allowed: boolean;
  reason?: string;
  cooldownRemaining?: number;
  missingPrerequisite?: string;
};

export type DiplomacyOutcome = {
  accepted: boolean;
  acceptChance: number;
  counterAction?: string;
  counterReason?: string;
  loyaltyPenalty: number;
  reputationChange: number;
  rejectionDialogue?: string;
};

const PREREQUISITE_CHAINS: Partial<Record<DiplomaticActionId, DiplomaticActionId[]>> = {
  "request-audience": ["open-comms"],
  "negotiate-ceasefire": ["open-comms"],
  "propose-alliance": ["request-audience"],
  "trade-agreement": ["open-comms"],
  "resource-exchange": ["open-comms"],
  "technology-sharing": ["request-audience", "trade-agreement"],
  "smuggling-deal": ["open-comms"],
  "spy-network": ["buy-rumors"],
  "counter-intel": ["open-comms"],
  "request-intel": ["open-comms"],
  "joint-research": ["request-audience", "technology-sharing"],
  "joint-operation": ["request-audience"],
  "mercenary-contract": ["request-audience"],
  "arms-deal": ["trade-agreement"],
  "rebuild-assistance": ["request-audience", "send-aid"],
  "refugee-program": ["open-comms"],
  "medical-mission": ["open-comms"],
  "impose-blockade": ["open-comms"],
  "trade-embargo": ["open-comms"],
  "demand-tribute": ["open-comms"],
  "protection-racket": ["open-comms"],
  "proxy-war": ["spy-network"],
  "covert-destabilize": ["spy-network"],
  "cultural-subversion": ["buy-rumors"],
  "infrastructure-raid": ["open-comms"],
  "cyber-attack": ["spy-network"],
  "diplomatic-marriage": ["request-audience", "propose-alliance"],
  "hostage-exchange": ["open-comms"],
  "impose-sanctions": ["open-comms"],
  "gun-running": ["smuggling-deal"],
  "false-flag": ["spy-network", "counter-intel"],
  "poaching-deal": ["smuggling-deal"],
  "sanctuary-treaty": ["trade-agreement"],
  "gene-bank-exchange": ["technology-sharing"],
  "plague-swarm": ["spy-network"],
  "extradition-treaty": ["open-comms", "request-audience"],
  "non-aggression-pact": ["open-comms"],
  "cultural-exchange": ["open-comms"],
  "open-borders": ["trade-agreement"],
};

const ACTION_LABELS: Record<DiplomaticActionId, string> = {
  "open-comms": "Open Communications",
  "request-audience": "Request Audience",
  "negotiate-ceasefire": "Negotiate Ceasefire",
  "propose-alliance": "Propose Alliance",
  "trade-agreement": "Trade Agreement",
  "resource-exchange": "Resource Exchange",
  "technology-sharing": "Technology Sharing",
  "smuggling-deal": "Smuggling Deal",
  "buy-rumors": "Buy Rumors",
  "spy-network": "Establish Spy Network",
  "counter-intel": "Counter-Intelligence",
  "request-intel": "Request Intelligence",
  "joint-research": "Joint Research Project",
  "joint-operation": "Joint Military Operation",
  "mercenary-contract": "Mercenary Contract",
  "arms-deal": "Arms Deal",
  "declare-war": "Declare War",
  "issue-ultimatum": "Issue Ultimatum",
  "send-aid": "Send Humanitarian Aid",
  "rebuild-assistance": "Reconstruction Aid",
  "refugee-program": "Refugee Program",
  "medical-mission": "Medical Mission",
  "impose-blockade": "Impose Blockade",
  "trade-embargo": "Trade Embargo",
  "demand-tribute": "Demand Tribute",
  "protection-racket": "Protection Racket",
  "proxy-war": "Proxy War",
  "covert-destabilize": "Covert Destabilization",
  "cultural-subversion": "Cultural Subversion",
  "infrastructure-raid": "Infrastructure Raid",
  "cyber-attack": "Cyber Attack",
  "diplomatic-marriage": "Diplomatic Marriage",
  "hostage-exchange": "Hostage Exchange",
  "impose-sanctions": "Impose Sanctions",
  "gun-running": "Gun Running",
  "false-flag": "False Flag Operation",
  "request-summit": "Request Summit",
  "joint-treaty": "Joint Treaty",
  "diplomatic-recognition": "Diplomatic Recognition",
  "offer-protection": "Offer Protection",
  "annexation-offer": "Annexation Offer",
  "petition-leader": "Petition Leader",
  "rally-support": "Rally Support",
  "negotiate-charter": "Negotiate Charter",
  "demand-cut": "Demand a Cut",
  "betray-deal": "Betray Existing Deal",
  "audit-records": "Audit Records",
  "joint-patrol": "Joint Patrol",
  "buyout-offer": "Buyout Offer",
  "regulatory-capture": "Regulatory Capture",
  "land-grant": "Land Grant",
  "amnesty": "General Amnesty",
  "shrine-construction": "Shrine Construction",
  "prophecy-request": "Request Prophecy",
  "rocket-strike": "Rocket Strike",
  "bombardment": "Sustained Bombardment",
  "lay-siege": "Lay Siege",
  "occupy": "Military Occupation",
  "annex": "Formal Annexation",
  "send-relief": "Send Relief Convoy",
  "poaching-deal": "Poaching Deal",
  "sanctuary-treaty": "Wildlife Sanctuary Treaty",
  "gene-bank-exchange": "Gene-Bank Exchange",
  "plague-swarm": "Release Plague Swarm",
  "extradition-treaty": "Extradition Treaty",
  "non-aggression-pact": "Non-Aggression Pact",
  "cultural-exchange": "Cultural Exchange",
  "open-borders": "Open-Borders Agreement",
};

export const ACTION_PARTNER_KINDS: Partial<Record<DiplomaticActionId, PartnerKind[]>> = {
  "request-summit": ["megacity", "nation"],
  "joint-treaty": ["megacity", "nation"],
  "diplomatic-recognition": ["megacity", "nation", "township"],
  "offer-protection": ["township", "settlement", "group"],
  "annexation-offer": ["township", "settlement"],
  "petition-leader": ["group", "underclass"],
  "rally-support": ["group", "underclass"],
  "negotiate-charter": ["group", "underclass"],
  "demand-cut": ["criminal"],
  "betray-deal": ["criminal", "corporate"],
  "audit-records": ["law", "corporate"],
  "joint-patrol": ["law"],
  "buyout-offer": ["corporate"],
  "regulatory-capture": ["corporate"],
  "land-grant": ["underclass", "settlement", "group"],
  "amnesty": ["underclass", "criminal"],
  "shrine-construction": ["cult"],
  "prophecy-request": ["cult"],
  "rocket-strike": ["megacity", "nation", "township", "settlement", "group", "law", "criminal", "corporate", "underclass", "cult"],
  "bombardment": ["megacity", "nation", "township", "settlement", "group", "law", "criminal", "corporate", "underclass", "cult"],
  "lay-siege": ["megacity", "nation", "township", "settlement", "group"],
  "occupy": ["megacity", "nation", "township", "settlement", "group"],
  "annex": ["megacity", "nation", "township", "settlement", "group"],
  "send-relief": ["megacity", "nation", "township", "settlement", "group", "underclass"],
  "extradition-treaty": ["megacity", "nation", "township", "settlement", "group", "law"],
  "open-borders": ["megacity", "nation", "township", "settlement"],
};

export function actionAvailableForKind(action: EngineDiplomaticActionId, partnerKind: PartnerKind): boolean {
  if (!isDiplomaticActionId(action)) return true;
  const restricted = ACTION_PARTNER_KINDS[action];
  if (!restricted) return true;
  return restricted.includes(partnerKind);
}

/**
 * Shape of the per-action stat changes applied by the reducer when a
 * diplomatic action successfully resolves: deltas for partner loyalty,
 * the player's influence with that partner, and partner threat. Any field
 * may be omitted (treated as zero).
 */
export type DiplomaticActionEffects = {
  loyalty?: number;
  influence?: number;
  threat?: number;
};

/**
 * Single source of truth for diplomatic-action rules.
 *
 * Each entry defines the credit cost, influence requirement, cooldown (in
 * ticks), and the per-action loyalty/influence/threat effects applied by the
 * reducer for one menu action. The diplomacy menu (`app/(game)/diplomacy.tsx`)
 * and the reducer (`actionFaction` in `context/GameContext.tsx`) both read
 * from this map, so updating an action here updates it everywhere.
 *
 * The `as const satisfies Record<string, { ...; effects: ... }>` clause
 * forces every entry to declare `effects`, so a designer cannot add a new
 * action's costs without also defining its stat changes — what used to
 * silently fail the reducer's `if (!effects) return prev;` guard now becomes
 * a TypeScript error at definition time.
 *
 * To add, remove, or rename an action, edit this map. The `DiplomaticActionId`
 * type is derived from its keys, so any drift in the menu or reducer becomes
 * a TypeScript error at the call site.
 */
export const DIPLOMATIC_ACTION_RULES = {
  "open-comms":             { requiresInfluence: 0,  cost: 0,     cooldown: 4,  effects: { loyalty: 5,   influence: 3 } },
  "request-audience":       { requiresInfluence: 10, cost: 500,   cooldown: 8,  effects: { loyalty: 8,   influence: 5 } },
  "negotiate-ceasefire":    { requiresInfluence: 20, cost: 2000,  cooldown: 16, effects: { loyalty: 15,  threat: -20 } },
  "propose-alliance":       { requiresInfluence: 50, cost: 10000, cooldown: 24, effects: { loyalty: 25,  influence: 15, threat: -15 } },
  "trade-agreement":        { requiresInfluence: 15, cost: 3000,  cooldown: 12, effects: { loyalty: 10,  influence: 8 } },
  "resource-exchange":      { requiresInfluence: 20, cost: 1000,  cooldown: 4,  effects: { loyalty: 5,   influence: 3 } },
  "technology-sharing":     { requiresInfluence: 40, cost: 5000,  cooldown: 16, effects: { loyalty: 12,  influence: 10 } },
  "smuggling-deal":         { requiresInfluence: 10, cost: 2000,  cooldown: 8,  effects: { influence: 8, threat: 5 } },
  "buy-rumors":             { requiresInfluence: 5,  cost: 800,   cooldown: 4,  effects: { influence: 3 } },
  "spy-network":            { requiresInfluence: 25, cost: 5000,  cooldown: 20, effects: { influence: 10, threat: 5 } },
  "counter-intel":          { requiresInfluence: 30, cost: 3000,  cooldown: 12, effects: { threat: -8 } },
  "request-intel":          { requiresInfluence: 35, cost: 1500,  cooldown: 8,  effects: { loyalty: 5,   influence: 5 } },
  "joint-research":         { requiresInfluence: 45, cost: 8000,  cooldown: 20, effects: { loyalty: 10,  influence: 12 } },
  "joint-operation":        { requiresInfluence: 40, cost: 8000,  cooldown: 20, effects: { loyalty: 15,  influence: 10, threat: -10 } },
  "mercenary-contract":     { requiresInfluence: 20, cost: 5000,  cooldown: 12, effects: { influence: 8 } },
  "arms-deal":              { requiresInfluence: 25, cost: 6000,  cooldown: 12, effects: { influence: 10, threat: 5 } },
  "declare-war":            { requiresInfluence: 0,  cost: 0,     cooldown: 48, effects: { loyalty: -30, threat: 40,  influence: -20 } },
  "issue-ultimatum":        { requiresInfluence: 30, cost: 1000,  cooldown: 16, effects: { loyalty: -10, threat: 15 } },
  "send-aid":               { requiresInfluence: 5,  cost: 3000,  cooldown: 4,  effects: { loyalty: 20,  influence: 5,  threat: -10 } },
  "rebuild-assistance":     { requiresInfluence: 20, cost: 8000,  cooldown: 16, effects: { loyalty: 25,  influence: 10, threat: -15 } },
  "refugee-program":        { requiresInfluence: 10, cost: 2000,  cooldown: 8,  effects: { loyalty: 15,  influence: 5 } },
  "medical-mission":        { requiresInfluence: 15, cost: 4000,  cooldown: 8,  effects: { loyalty: 18,  influence: 8,  threat: -5 } },
  "impose-blockade":        { requiresInfluence: 50, cost: 15000, cooldown: 32, effects: { loyalty: -25, threat: 30,  influence: -10 } },
  "trade-embargo":          { requiresInfluence: 30, cost: 5000,  cooldown: 24, effects: { loyalty: -15, threat: 15,  influence: -5 } },
  "demand-tribute":         { requiresInfluence: 40, cost: 8000,  cooldown: 20, effects: { loyalty: -20, threat: 25,  influence: -15 } },
  "protection-racket":      { requiresInfluence: 20, cost: 3000,  cooldown: 24, effects: { loyalty: -10, threat: 15,  influence: 5 } },
  "proxy-war":              { requiresInfluence: 55, cost: 20000, cooldown: 40, effects: { loyalty: -30, threat: 35,  influence: -10 } },
  "covert-destabilize":     { requiresInfluence: 50, cost: 18000, cooldown: 32, effects: { loyalty: -20, threat: 20,  influence: -8 } },
  "cultural-subversion":    { requiresInfluence: 25, cost: 6000,  cooldown: 24, effects: { loyalty: -5,  influence: 10 } },
  "infrastructure-raid":    { requiresInfluence: 45, cost: 12000, cooldown: 20, effects: { loyalty: -35, threat: 40,  influence: -15 } },
  "cyber-attack":           { requiresInfluence: 35, cost: 10000, cooldown: 16, effects: { loyalty: -15, threat: 20,  influence: -5 } },
  "diplomatic-marriage":    { requiresInfluence: 60, cost: 25000, cooldown: 48, effects: { loyalty: 35,  influence: 20, threat: -25 } },
  "hostage-exchange":       { requiresInfluence: 20, cost: 5000,  cooldown: 16, effects: { loyalty: 5,   influence: 3 } },
  "impose-sanctions":       { requiresInfluence: 25, cost: 4000,  cooldown: 20, effects: { loyalty: -12, threat: 10,  influence: -5 } },
  "gun-running":            { requiresInfluence: 30, cost: 8000,  cooldown: 16, effects: { influence: 8, threat: 10 } },
  "false-flag":             { requiresInfluence: 60, cost: 25000, cooldown: 32, effects: { loyalty: -25, threat: 30,  influence: -20 } },
  "request-summit":         { requiresInfluence: 25, cost: 4000,  cooldown: 24, effects: { loyalty: 8,   influence: 6 } },
  "joint-treaty":           { requiresInfluence: 50, cost: 12000, cooldown: 32, effects: { loyalty: 22,  influence: 18, threat: -15 } },
  "diplomatic-recognition": { requiresInfluence: 15, cost: 2000,  cooldown: 16, effects: { loyalty: 12,  influence: 8 } },
  "offer-protection":       { requiresInfluence: 30, cost: 6000,  cooldown: 16, effects: { loyalty: 18,  influence: 10, threat: -8 } },
  "annexation-offer":       { requiresInfluence: 65, cost: 18000, cooldown: 32, effects: { loyalty: -5,  influence: 25, threat: 5 } },
  "petition-leader":        { requiresInfluence: 5,  cost: 0,     cooldown: 4,  effects: { loyalty: 6,   influence: 3 } },
  "rally-support":          { requiresInfluence: 15, cost: 1000,  cooldown: 8,  effects: { loyalty: 10,  influence: 8 } },
  "negotiate-charter":      { requiresInfluence: 30, cost: 5000,  cooldown: 16, effects: { loyalty: 14,  influence: 10, threat: -5 } },
  "demand-cut":             { requiresInfluence: 20, cost: 0,     cooldown: 12, effects: { loyalty: -15, influence: 5,  threat: 12 } },
  "betray-deal":            { requiresInfluence: 0,  cost: 0,     cooldown: 24, effects: { loyalty: -30, influence: -10, threat: 20 } },
  "audit-records":          { requiresInfluence: 30, cost: 2500,  cooldown: 12, effects: { loyalty: -5,  influence: 8,  threat: 4 } },
  "joint-patrol":           { requiresInfluence: 25, cost: 4000,  cooldown: 12, effects: { loyalty: 12,  influence: 8,  threat: -10 } },
  "buyout-offer":           { requiresInfluence: 60, cost: 30000, cooldown: 24, effects: { loyalty: 20,  influence: 25, threat: -10 } },
  "regulatory-capture":     { requiresInfluence: 45, cost: 15000, cooldown: 20, effects: { loyalty: 8,   influence: 18, threat: 5 } },
  "land-grant":             { requiresInfluence: 35, cost: 8000,  cooldown: 20, effects: { loyalty: 25,  influence: 12, threat: -8 } },
  "amnesty":                { requiresInfluence: 25, cost: 6000,  cooldown: 16, effects: { loyalty: 20,  influence: 5,  threat: -12 } },
  "shrine-construction":    { requiresInfluence: 40, cost: 14000, cooldown: 24, effects: { loyalty: 30,  influence: 15, threat: -10 } },
  "prophecy-request":       { requiresInfluence: 10, cost: 1500,  cooldown: 8,  effects: { loyalty: 8,   influence: 6 } },
  "rocket-strike":          { requiresInfluence: 30, cost: 0,     cooldown: 8,  effects: { loyalty: -40, threat: 35,  influence: -10 } },
  "bombardment":            { requiresInfluence: 50, cost: 0,     cooldown: 12, effects: { loyalty: -55, threat: 45,  influence: -15 } },
  "lay-siege":              { requiresInfluence: 60, cost: 0,     cooldown: 24, effects: { loyalty: -45, threat: 30,  influence: 5 } },
  "occupy":                 { requiresInfluence: 50, cost: 5000,  cooldown: 48, effects: { loyalty: -60, threat: 25,  influence: 30 } },
  "annex":                  { requiresInfluence: 75, cost: 12000, cooldown: 96, effects: { loyalty: -30, threat: -10, influence: 50 } },
  "send-relief":            { requiresInfluence: 5,  cost: 2500,  cooldown: 6,  effects: { loyalty: 25,  influence: 10, threat: -15 } },
  "poaching-deal":          { requiresInfluence: 15, cost: 4000,  cooldown: 12, effects: { loyalty: 8,   influence: 6,  threat: 4 } },
  "sanctuary-treaty":       { requiresInfluence: 25, cost: 6000,  cooldown: 32, effects: { loyalty: 18,  influence: 10, threat: -10 } },
  "gene-bank-exchange":     { requiresInfluence: 35, cost: 9000,  cooldown: 24, effects: { loyalty: 14,  influence: 12, threat: -5 } },
  "plague-swarm":           { requiresInfluence: 60, cost: 22000, cooldown: 40, effects: { loyalty: -50, threat: 45,  influence: -25 } },
  "extradition-treaty":     { requiresInfluence: 30, cost: 6000,  cooldown: 20, effects: { loyalty: 12,  influence: 8,  threat: -10 } },
  "non-aggression-pact":    { requiresInfluence: 35, cost: 7000,  cooldown: 24, effects: { loyalty: 18,  influence: 8,  threat: -25 } },
  "cultural-exchange":      { requiresInfluence: 15, cost: 3000,  cooldown: 12, effects: { loyalty: 12,  influence: 6 } },
  "open-borders":           { requiresInfluence: 45, cost: 9000,  cooldown: 24, effects: { loyalty: 20,  influence: 15, threat: -8 } },
} as const satisfies Record<string, { requiresInfluence: number; cost: number; cooldown: number; effects: DiplomaticActionEffects }>;

export type DiplomaticActionId = keyof typeof DIPLOMATIC_ACTION_RULES;
export type DiplomaticActionRules = (typeof DIPLOMATIC_ACTION_RULES)[DiplomaticActionId];

const DIPLOMATIC_ACTION_IDS: ReadonlySet<string> = new Set(Object.keys(DIPLOMATIC_ACTION_RULES));

/**
 * Type guard for menu diplomatic action ids. Use this at any boundary
 * where a string-typed action id enters the engine (e.g. loading from
 * a save, deserializing a network payload, or narrowing a wider
 * `DiplomaticActionId | EventOnlyActionId` union for a menu-only
 * lookup). Pushing the guard out to the call site means a typo in a
 * raw string is caught before it ever reaches the lookup tables —
 * instead of silently missing them and hitting a runtime fallback.
 */
export function isDiplomaticActionId(action: string): action is DiplomaticActionId {
  return DIPLOMATIC_ACTION_IDS.has(action);
}

/**
 * Look up the shared rules for an action id. Returns `undefined` for ids that
 * are not part of the diplomacy menu (e.g. event-only actions like `fund`,
 * `negotiate`, `suppress` which the reducer handles separately).
 */
export function getDiplomaticActionRules(action: string): DiplomaticActionRules | undefined {
  return (DIPLOMATIC_ACTION_RULES as Record<string, DiplomaticActionRules>)[action];
}

/**
 * Look up the per-action stat effects (loyalty/influence/threat deltas) for
 * a menu diplomatic action. Returns `undefined` for ids that are not part of
 * the diplomacy menu — event-only actions (`fund`, `negotiate`, `suppress`)
 * live in `EVENT_ONLY_ACTION_RULES` below and are looked up via
 * `getEventOnlyActionRules()`.
 */
export function getDiplomaticActionEffects(action: string): DiplomaticActionEffects | undefined {
  return getDiplomaticActionRules(action)?.effects;
}

/**
 * Single source of truth for event-only diplomatic actions — the ones the
 * reducer in `actionFaction` (`context/GameContext.tsx`) handles outside the
 * diplomacy menu (faction-screen and crisis flows). They have no influence
 * gate or cooldown, only a credit cost and stat effects.
 *
 * The `as const satisfies Record<string, { cost; effects }>` clause forces
 * every entry to declare both fields, mirroring the drift protection on
 * `DIPLOMATIC_ACTION_RULES`. To add a new event-only action, add an entry
 * here — the derived `EventOnlyActionId` type below will then surface every
 * call site that needs to handle it.
 */
export const EVENT_ONLY_ACTION_RULES = {
  // Diplomatic — open hands, ceremony, charm. Loyalty up, threat down.
  "negotiate":        { cost: 0,     effects: { loyalty: 10, threat: -5 } },
  "host-banquet":     { cost: 4000,  effects: { loyalty: 12, influence: 3 } },
  "grant-honor":      { cost: 2500,  effects: { loyalty: 10, influence: 5 } },
  // Economic — credits and concessions. Carrot or stick.
  "fund":             { cost: 5000,  effects: { loyalty: 15, influence: 5, threat: -3 } },
  "tax-concession":   { cost: 3000,  effects: { loyalty: 10, threat: -3 } },
  "seize-assets":     { cost: 0,     effects: { loyalty: -15, influence: 8, threat: 12 } },
  // Covert — quiet knives. Cheap, dirty, deniable.
  "plant-informant":  { cost: 3500,  effects: { influence: 6, threat: 4 } },
  "spread-rumors":    { cost: 1500,  effects: { loyalty: -8, influence: 4 } },
  "arrange-accident": { cost: 8000,  effects: { loyalty: -22, threat: -10, influence: 4 } },
  // Hostile — boots on the ground, public retribution.
  "suppress":         { cost: 0,     effects: { influence: -10, threat: 15 } },
  "arrest-leaders":   { cost: 6000,  effects: { loyalty: -20, influence: 12, threat: 8 } },
  "purge":            { cost: 12000, effects: { loyalty: -40, influence: 20, threat: 25 } },
} as const satisfies Record<string, { cost: number; effects: DiplomaticActionEffects }>;

export type EventOnlyActionId = keyof typeof EVENT_ONLY_ACTION_RULES;
export type EventOnlyActionRules = { cost: number; effects: DiplomaticActionEffects };

/**
 * Union of every action id the diplomacy engine understands — both menu
 * actions (`DiplomaticActionId`) and event-only actions
 * (`EventOnlyActionId`). Public engine functions that handle both flows
 * (e.g. `canPerformAction`, `resolveDiplomaticAction`,
 * `recordDiplomaticAction`) accept this union, so callers can no longer
 * smuggle an arbitrary string in. Boundaries that take raw strings —
 * loading from a save, deserializing a network payload, untyped UI
 * dispatch — must narrow with `isDiplomaticActionId` /
 * `isEventOnlyActionId` before calling the engine.
 */
export type EngineDiplomaticActionId = DiplomaticActionId | EventOnlyActionId;

const EVENT_ONLY_ACTION_IDS: ReadonlySet<string> = new Set(Object.keys(EVENT_ONLY_ACTION_RULES));

/**
 * Type guard for event-only action ids. Use this at lookup boundaries
 * (e.g. the reducer's `actionFaction`) so a downstream `EVENT_ONLY_ACTION_RULES[action]`
 * read is typed against the derived `EventOnlyActionId` key set rather
 * than an unconstrained `string`.
 */
export function isEventOnlyActionId(action: string): action is EventOnlyActionId {
  return EVENT_ONLY_ACTION_IDS.has(action);
}

/**
 * Look up the shared rules for an event-only action id. Returns `undefined`
 * for ids that are not event-only (e.g. menu diplomatic actions, which live
 * in `DIPLOMATIC_ACTION_RULES`). The return type is widened to
 * `DiplomaticActionEffects` so callers can read `effects.loyalty` etc.
 * without TypeScript narrowing to a single id's literal effect shape.
 */
export function getEventOnlyActionRules(action: string): EventOnlyActionRules | undefined {
  return isEventOnlyActionId(action) ? EVENT_ONLY_ACTION_RULES[action] : undefined;
}

// Single source of truth for the ammo + fuel a real military diplomatic
// strike costs. Both the diplomacy menu's pre-flight check (to decide
// whether the loadout picker should open) and the actionFaction reducer's
// MILITARY_ACTIONS handler (which actually deducts the resources) read
// from this map. The strike-id key set is exported as MilitaryStrikeId
// and is reused by MILITARY_DIPLO_ATTACK_MAP in engine/loadout.ts, so
// adding, renaming, or removing an id here raises a TypeScript error in
// every call site (menu + reducer + attack-type map).
//
// Only strikes that have a backing reducer execution path (the
// MILITARY_ACTIONS set in GameContext) belong here. infrastructure-raid
// is a stat-only diplomatic action with no military reducer handler, so
// it is intentionally excluded — see the comment on
// MILITARY_DIPLO_ATTACK_MAP in engine/loadout.ts for the full rationale.
export const MILITARY_STRIKE_COSTS = {
  "rocket-strike": { ammo: 200, fuel: 100 },
  "bombardment":   { ammo: 400, fuel: 200 },
  "lay-siege":     { ammo: 80,  fuel: 60  },
} as const satisfies Record<string, { ammo: number; fuel: number }>;

export type MilitaryStrikeId = keyof typeof MILITARY_STRIKE_COSTS;

const MILITARY_STRIKE_IDS: ReadonlySet<string> = new Set(Object.keys(MILITARY_STRIKE_COSTS));

export function isMilitaryStrikeId(action: string): action is MilitaryStrikeId {
  return MILITARY_STRIKE_IDS.has(action);
}

export function getMilitaryStrikeCost(action: MilitaryStrikeId): { ammo: number; fuel: number } {
  return MILITARY_STRIKE_COSTS[action];
}

const LOYALTY_THRESHOLDS: Record<DiplomaticActionId, number> = {
  "open-comms": 0,
  "request-audience": 10,
  "negotiate-ceasefire": 5,
  "propose-alliance": 40,
  "trade-agreement": 15,
  "resource-exchange": 10,
  "technology-sharing": 30,
  "smuggling-deal": 10,
  "buy-rumors": 5,
  "spy-network": 20,
  "counter-intel": 15,
  "request-intel": 20,
  "joint-research": 35,
  "joint-operation": 35,
  "mercenary-contract": 20,
  "arms-deal": 20,
  "declare-war": 0,
  "issue-ultimatum": 0,
  "send-aid": 0,
  "rebuild-assistance": 10,
  "refugee-program": 5,
  "medical-mission": 5,
  "impose-blockade": 0,
  "trade-embargo": 0,
  "demand-tribute": 0,
  "protection-racket": 0,
  "proxy-war": 0,
  "covert-destabilize": 0,
  "cultural-subversion": 0,
  "infrastructure-raid": 0,
  "cyber-attack": 0,
  "diplomatic-marriage": 50,
  "hostage-exchange": 0,
  "impose-sanctions": 0,
  "gun-running": 10,
  "false-flag": 0,
  "request-summit": 15,
  "joint-treaty": 40,
  "diplomatic-recognition": 10,
  "offer-protection": 20,
  "annexation-offer": 5,
  "petition-leader": 5,
  "rally-support": 10,
  "negotiate-charter": 20,
  "demand-cut": 0,
  "betray-deal": 0,
  "audit-records": 0,
  "joint-patrol": 25,
  "buyout-offer": 30,
  "regulatory-capture": 20,
  "land-grant": 25,
  "amnesty": 15,
  "shrine-construction": 30,
  "prophecy-request": 10,
  "rocket-strike": 0,
  "bombardment": 0,
  "lay-siege": 0,
  "occupy": 0,
  "annex": 0,
  "send-relief": 0,
  "poaching-deal": 5,
  "sanctuary-treaty": 25,
  "gene-bank-exchange": 30,
  "plague-swarm": 0,
  "extradition-treaty": 20,
  "non-aggression-pact": 5,
  "cultural-exchange": 10,
  "open-borders": 30,
};

const ATTITUDE_MODIFIERS: Record<string, number> = {
  friendly: 25,
  neutral: 0,
  suspicious: -15,
  hostile: -35,
  fearful: -5,
};

const ALWAYS_ACCEPT_IDS: readonly DiplomaticActionId[] = [
  "open-comms", "declare-war", "issue-ultimatum", "send-aid",
  "rebuild-assistance", "refugee-program", "medical-mission",
  "impose-blockade", "trade-embargo", "demand-tribute", "impose-sanctions",
  "infrastructure-raid", "cyber-attack", "false-flag",
  "rocket-strike", "bombardment", "lay-siege", "occupy", "annex", "send-relief",
  "plague-swarm",
];

const ALWAYS_ACCEPT: ReadonlySet<DiplomaticActionId> = new Set(ALWAYS_ACCEPT_IDS);

const COUNTER_PROPOSALS: Partial<Record<DiplomaticActionId, DiplomaticActionId[]>> = {
  "propose-alliance": ["trade-agreement", "negotiate-ceasefire"],
  "technology-sharing": ["trade-agreement", "resource-exchange"],
  "joint-research": ["technology-sharing", "trade-agreement"],
  "joint-operation": ["mercenary-contract", "negotiate-ceasefire"],
  "spy-network": ["buy-rumors", "request-intel"],
  "arms-deal": ["trade-agreement", "resource-exchange"],
  "mercenary-contract": ["arms-deal"],
  "protection-racket": ["trade-agreement"],
  "proxy-war": ["mercenary-contract", "arms-deal"],
  "diplomatic-marriage": ["propose-alliance", "trade-agreement"],
  "gun-running": ["arms-deal", "smuggling-deal"],
};

const REJECTION_LINES: Record<string, string[]> = {
  law: [
    "The Authority denies your request. Your standing is insufficient.",
    "Request denied. Improve your compliance record first.",
    "Insufficient trust. The law requires demonstrated loyalty.",
    "Your proposal has been reviewed and found wanting. Build credibility first.",
  ],
  criminal: [
    "Not happening, Commander. You haven't earned that kind of trust.",
    "Ha! You want THAT? Come back when we actually like you.",
    "The Boss says no. Bring more credits next time. Or better manners.",
    "You're dreaming. We don't deal with strangers at this level.",
  ],
  corporate: [
    "Our risk assessment rates this proposal as unfavorable. Declined.",
    "The board has voted. Your proposal lacks sufficient value proposition.",
    "Insufficient relationship equity. Build your portfolio with us first.",
    "Denied. Our analysts require a stronger track record of cooperation.",
  ],
  underclass: [
    "We... we can't trust you with that. Not yet. You need to prove yourself.",
    "The elders say no. Too much, too soon. Help us first, then we'll talk.",
    "We've been burned before by promises from above. Show us you mean it.",
    "Not yet. The Collective needs to see more from you before we go that far.",
  ],
  cult: [
    "The omens do not favor this arrangement. The stars say... not yet.",
    "The Council sees your intent, but the time is not aligned. Patience.",
    "Your energy is misaligned with this request. Attune yourself further.",
    "The shadows whisper 'no.' When they whisper 'yes,' you will know.",
  ],
  megacity: [
    "Our diplomatic council has reviewed your proposal and respectfully declines at this time.",
    "The current state of our relations does not support this level of cooperation.",
    "We appreciate the overture, but our interests are not yet aligned for this.",
    "Declined. Build stronger ties with us through smaller agreements first.",
  ],
  default: [
    "Your proposal has been considered and rejected.",
    "Not at this time. Build a stronger relationship first.",
    "We cannot agree to this under current conditions.",
    "Declined. Demonstrate more goodwill before approaching us with this.",
  ],
};

function getCooldownKey(factionId: string, action: string): string {
  return `${factionId}::${action}`;
}

export function getDiplomacyCooldownRemaining(
  state: GameState,
  factionId: string,
  action: EngineDiplomaticActionId
): number {
  // Event-only sandbox actions (faction-screen verbs like host-banquet,
  // arrange-accident, purge) have no cooldown by design — the player should
  // be able to chain them freely so long as they pay the credit cost.
  if (isEventOnlyActionId(action)) return 0;
  const key = getCooldownKey(factionId, action);
  const cooldowns = state.diplomacyCooldowns ?? {};
  if (!(key in cooldowns)) return 0;
  const lastTick = cooldowns[key];
  const cooldown = getDiplomaticActionRules(action)?.cooldown ?? 8;
  const remaining = (lastTick + cooldown) - state.totalTicks;
  return Math.max(0, remaining);
}

export function getCompletedActionsForFaction(
  state: GameState,
  factionId: string
): string[] {
  return (state.completedDiplomaticActions ?? {})[factionId] ?? [];
}

export function getMissingPrerequisites(
  state: GameState,
  factionId: string,
  action: EngineDiplomaticActionId
): DiplomaticActionId[] {
  if (!isDiplomaticActionId(action)) return [];
  const prereqs = PREREQUISITE_CHAINS[action];
  if (!prereqs) return [];
  const completed = getCompletedActionsForFaction(state, factionId);
  return prereqs.filter((p) => !completed.includes(p));
}

export function canPerformAction(
  state: GameState,
  factionId: string,
  action: EngineDiplomaticActionId
): DiplomacyCheckResult {
  const cooldownRemaining = getDiplomacyCooldownRemaining(state, factionId, action);
  if (cooldownRemaining > 0) {
    return { allowed: false, reason: `Cooldown: ${cooldownRemaining} ticks remaining`, cooldownRemaining };
  }

  const missing = getMissingPrerequisites(state, factionId, action);
  if (missing.length > 0) {
    const readable = missing.map((m) => ACTION_LABELS[m] ?? m.replace(/-/g, " ").toUpperCase()).join(", ");
    return { allowed: false, reason: `Prerequisite required: ${readable}`, missingPrerequisite: missing[0] };
  }

  return { allowed: true };
}

export function getAcceptanceChance(
  state: GameState,
  factionId: string,
  action: EngineDiplomaticActionId
): number {
  if (isDiplomaticActionId(action) && ALWAYS_ACCEPT.has(action)) return 100;

  const factions = state.factions ?? [];
  const megacities = state.externalMegacities ?? [];
  const townships = state.townships ?? [];

  const faction = factions.find((f) => f.id === factionId);
  const megacity = megacities.find((m) => m.id === factionId);
  const township = townships.find((t) => t.id === factionId);

  const loyalty = faction?.loyalty ?? megacity?.loyalty ?? township?.loyalty ?? 0;
  const attitude = faction?.leader?.attitude ?? megacity?.leader?.attitude ?? township?.leader?.attitude ?? "neutral";
  const reputation = state.diplomaticReputation ?? 50;
  const threshold = isDiplomaticActionId(action) ? LOYALTY_THRESHOLDS[action] : 10;

  const loyaltyFactor = Math.min(40, Math.max(0, (loyalty - threshold) * 1.5));
  const attitudeMod = ATTITUDE_MODIFIERS[attitude] ?? 0;
  const reputationMod = (reputation - 50) * 0.3;

  const personality = faction?.personality ?? megacity?.personality ?? township?.personality;
  const persMod = personality ? personalityModifier(personality, action) : 0;

  const ledger = (state.partnerLedgers ?? {})[factionId];
  const ledgerMod = ledger ? ledgerAcceptanceModifier(ledger, personality) : 0;

  const ecologyMod = ecologyStanceModifier(faction?.ecologyStance, action);

  const base = 40 + loyaltyFactor + attitudeMod + reputationMod + persMod + ledgerMod + ecologyMod;
  const yesman = state.cheats?.yesman ?? false;
  if (yesman) return 100;

  return Math.max(3, Math.min(97, Math.round(base)));
}

export function resolveDiplomaticAction(
  state: GameState,
  factionId: string,
  action: EngineDiplomaticActionId
): DiplomacyOutcome {
  const acceptChance = getAcceptanceChance(state, factionId, action);

  if (isDiplomaticActionId(action) && ALWAYS_ACCEPT.has(action)) {
    return {
      accepted: true,
      acceptChance: 100,
      loyaltyPenalty: 0,
      reputationChange: action === "send-aid" || action === "rebuild-assistance" || action === "refugee-program" || action === "medical-mission" ? 2 : 0,
    };
  }

  const roll = Math.random() * 100;
  const accepted = roll < acceptChance;

  if (accepted) {
    return {
      accepted: true,
      acceptChance,
      loyaltyPenalty: 0,
      reputationChange: 1,
    };
  }

  const counters = isDiplomaticActionId(action) ? COUNTER_PROPOSALS[action] : undefined;
  let counterAction: string | undefined;
  let counterReason: string | undefined;

  if (counters && counters.length > 0 && acceptChance >= 25) {
    const completedActions = getCompletedActionsForFaction(state, factionId);
    const validCounters = counters.filter((c) => {
      const missingP = (PREREQUISITE_CHAINS[c] ?? []).filter((p) => !completedActions.includes(p));
      return missingP.length === 0;
    });
    if (validCounters.length > 0) {
      counterAction = validCounters[Math.floor(Math.random() * validCounters.length)];
      counterReason = `They're not ready for ${action.replace(/-/g, " ")} but would consider ${counterAction.replace(/-/g, " ")} instead.`;
    }
  }

  const factions = state.factions ?? [];
  const faction = factions.find((f) => f.id === factionId);
  const megacity = (state.externalMegacities ?? []).find((m) => m.id === factionId);
  const partnerType = faction?.type ?? (megacity ? "megacity" : "default");
  const lines = REJECTION_LINES[partnerType] ?? REJECTION_LINES.default;
  const rejectionDialogue = lines[Math.floor(Math.random() * lines.length)];

  return {
    accepted: false,
    acceptChance,
    counterAction,
    counterReason,
    loyaltyPenalty: -2,
    reputationChange: -1,
    rejectionDialogue,
  };
}

export function recordDiplomaticAction(
  state: GameState,
  factionId: string,
  factionName: string,
  action: EngineDiplomaticActionId,
  outcome: DiplomacyOutcome
): Partial<GameState> {
  // Event-only sandbox actions skip cooldown bookkeeping — see
  // `getDiplomacyCooldownRemaining`. Writing a timestamp would only bloat
  // state since the read path short-circuits to 0 anyway.
  const newCooldowns = isEventOnlyActionId(action)
    ? (state.diplomacyCooldowns ?? {})
    : { ...(state.diplomacyCooldowns ?? {}), [getCooldownKey(factionId, action)]: state.totalTicks };

  const newReputation = Math.max(0, Math.min(100,
    (state.diplomaticReputation ?? 50) + outcome.reputationChange
  ));

  const entry: DiplomaticHistoryEntry = {
    id: `dh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tick: state.totalTicks,
    factionId,
    factionName,
    action,
    outcome: outcome.counterAction ? "counter-proposed" : outcome.accepted ? "accepted" : "rejected",
    counterAction: outcome.counterAction,
    reputationChange: outcome.reputationChange,
  };

  const newHistory = [entry, ...(state.diplomaticHistory ?? [])].slice(0, 100);

  const completedActions = { ...(state.completedDiplomaticActions ?? {}) };
  if (outcome.accepted) {
    const factionCompleted = [...(completedActions[factionId] ?? [])];
    if (!factionCompleted.includes(action)) {
      factionCompleted.push(action);
    }
    completedActions[factionId] = factionCompleted;
  }

  return {
    diplomacyCooldowns: newCooldowns,
    diplomaticReputation: newReputation,
    diplomaticHistory: newHistory,
    completedDiplomaticActions: completedActions,
  };
}

const OPERATION_DEFS: Partial<Record<DiplomaticActionId, {
  type: ActiveOperationType;
  duration: number;
  upkeep: number;
  intensity: number;
  retaliationChance: number;
  discoveryChance: number;
  covert: boolean;
  effects: ActiveOperation["effects"];
  narrative: string;
}>> = {
  "impose-blockade": {
    type: "blockade",
    duration: 40,
    upkeep: 3000,
    intensity: 60,
    retaliationChance: 0.08,
    discoveryChance: 0,
    covert: false,
    effects: { tradeIncome: -80, loyaltyTarget: -3, loyaltyAll: -1, threatTarget: 8 },
    narrative: "Your forces have established a naval and ground blockade around {target}. Supply convoys are being turned away. Their markets are starving.",
  },
  "trade-embargo": {
    type: "embargo",
    duration: 48,
    upkeep: 1500,
    intensity: 40,
    retaliationChance: 0.05,
    discoveryChance: 0,
    covert: false,
    effects: { tradeIncome: -50, loyaltyTarget: -2, credits: -500 },
    narrative: "All trade with {target} has been formally suspended. Their merchants are banned from MegaCity markets. Your own traders grumble about lost profits.",
  },
  "impose-sanctions": {
    type: "sanctions",
    duration: 60,
    upkeep: 800,
    intensity: 30,
    retaliationChance: 0.03,
    discoveryChance: 0,
    covert: false,
    effects: { tradeIncome: -30, loyaltyTarget: -1, credits: -200 },
    narrative: "Economic sanctions are now in effect against {target}. Asset freezes, import bans, and financial restrictions are squeezing their economy.",
  },
  "demand-tribute": {
    type: "tribute",
    duration: 80,
    upkeep: 0,
    intensity: 50,
    retaliationChance: 0.06,
    discoveryChance: 0,
    covert: false,
    effects: { credits: 2000, loyaltyTarget: -4, loyaltyAll: -2, threatTarget: 5 },
    narrative: "{target} is paying tribute to MegaCity. Regular shipments of credits and resources arrive under armed escort. Their pride is broken. For now.",
  },
  "protection-racket": {
    type: "protection-racket",
    duration: 100,
    upkeep: 500,
    intensity: 35,
    retaliationChance: 0.04,
    discoveryChance: 0.02,
    covert: false,
    effects: { credits: 1200, loyaltyTarget: -2, corruption: 2 },
    narrative: "{target} pays for 'protection' from threats that may or may not exist. Your enforcers collect regularly. This is technically legal. Technically.",
  },
  "proxy-war": {
    type: "proxy-war",
    duration: 60,
    upkeep: 4000,
    intensity: 75,
    retaliationChance: 0.10,
    discoveryChance: 0.06,
    covert: true,
    effects: { loyaltyTarget: -5, threatTarget: 10, unrest: 2, crime: 2 },
    narrative: "Mercenaries and insurgents funded by MegaCity are destabilizing {target} from within. Their leadership suspects outside involvement but cannot prove it.",
  },
  "covert-destabilize": {
    type: "destabilization",
    duration: 48,
    upkeep: 3500,
    intensity: 65,
    retaliationChance: 0.08,
    discoveryChance: 0.07,
    covert: true,
    effects: { loyaltyTarget: -4, threatTarget: 5, unrest: 1, crime: 3, corruption: 1 },
    narrative: "Your operatives are fomenting unrest within {target}. Propaganda leaflets, staged incidents, bribed officials — the usual toolkit of regime change.",
  },
  "cultural-subversion": {
    type: "cultural-subversion",
    duration: 80,
    upkeep: 1200,
    intensity: 25,
    retaliationChance: 0.02,
    discoveryChance: 0.04,
    covert: true,
    effects: { loyaltyTarget: -2, loyaltyAll: 1, corruption: 1 },
    narrative: "MegaCity media, fashion, and ideology are infiltrating {target}'s culture. Their youth wear your brands. Their elders are horrified.",
  },
  "infrastructure-raid": {
    type: "blockade",
    duration: 8,
    upkeep: 0,
    intensity: 80,
    retaliationChance: 0.15,
    discoveryChance: 0,
    covert: false,
    effects: { loyaltyTarget: -8, threatTarget: 15, infrastructureHealth: -5, defenseRating: -3 },
    narrative: "Strike teams have hit {target}'s critical infrastructure. Power grids flickering, water systems compromised. They won't forget this.",
  },
  "cyber-attack": {
    type: "cyber-campaign",
    duration: 16,
    upkeep: 2000,
    intensity: 55,
    retaliationChance: 0.06,
    discoveryChance: 0.05,
    covert: true,
    effects: { loyaltyTarget: -3, threatTarget: 5, credits: 1500 },
    narrative: "Your hackers have penetrated {target}'s financial networks. Credits are being siphoned. Data is being harvested. Their firewalls are paper.",
  },
  "gun-running": {
    type: "gun-pipeline",
    duration: 60,
    upkeep: 2500,
    intensity: 45,
    retaliationChance: 0.07,
    discoveryChance: 0.06,
    covert: true,
    effects: { credits: 800, loyaltyTarget: -3, crime: 3, corruption: 2 },
    narrative: "Weapons stamped with {target}'s insignia are flooding the black market — except these came from your factories. Profit is profit.",
  },
  "false-flag": {
    type: "destabilization",
    duration: 12,
    upkeep: 5000,
    intensity: 85,
    retaliationChance: 0.12,
    discoveryChance: 0.10,
    covert: true,
    effects: { loyaltyTarget: -10, loyaltyAll: -3, threatTarget: 15, unrest: 3 },
    narrative: "An attack on MegaCity infrastructure has been staged to look like {target}'s work. Public outrage is building. Your hands appear clean. For now.",
  },
};

export function createOperation(
  state: GameState,
  action: EngineDiplomaticActionId,
  targetId: string,
  targetName: string
): ActiveOperation | null {
  if (!isDiplomaticActionId(action)) return null;
  const def = OPERATION_DEFS[action];
  if (!def) return null;

  const existing = (state.activeOperations ?? []).filter(
    (op) => op.status === "active" && op.targetId === targetId && op.type === def.type
  );
  if (existing.length > 0) return null;

  return {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: def.type,
    targetId,
    targetName,
    startTick: state.totalTicks,
    duration: def.duration,
    remainingTicks: def.duration,
    status: "active",
    intensity: def.intensity,
    upkeepPerTick: def.upkeep,
    effects: { ...def.effects },
    retaliationChance: def.retaliationChance,
    discoveryChance: def.covert ? def.discoveryChance : 0,
    discovered: !def.covert,
    narrative: def.narrative.replace(/\{target\}/g, targetName),
  };
}

export function isOperationAction(action: EngineDiplomaticActionId): action is DiplomaticActionId {
  return isDiplomaticActionId(action) && action in OPERATION_DEFS;
}

export function processActiveOperations(state: GameState, entries: TickEntry[]): void {
  const operations = state.activeOperations ?? [];
  if (operations.length === 0) return;

  for (const op of operations) {
    if (op.status !== "active") continue;

    op.remainingTicks--;
    if (op.remainingTicks <= 0) {
      op.status = "expired";
      entries.push({
        label: "OPERATION ENDED",
        delta: 0,
        unit: "",
        reason: `${op.type.toUpperCase().replace(/-/g, " ")} against ${op.targetName} has concluded`,
        severity: "neutral",
      });
      continue;
    }

    if (op.upkeepPerTick > 0) {
      state.resources.credits -= op.upkeepPerTick;
      if (state.resources.credits < -50000) {
        op.status = "cancelled";
        entries.push({
          label: "OPERATION CANCELLED",
          delta: 0,
          unit: "",
          reason: `${op.type.toUpperCase().replace(/-/g, " ")} against ${op.targetName} cancelled — treasury depleted`,
          severity: "warning",
        });
        continue;
      }
    }

    if (op.effects.credits) {
      state.resources.credits += op.effects.credits;
      recordCreditsEarned(state, op.effects.credits);
    }
    if (op.effects.unrest) {
      state.cityStats.unrest = Math.min(100, Math.max(0, state.cityStats.unrest + op.effects.unrest * 0.1));
    }
    if (op.effects.crime) {
      state.cityStats.crime = Math.min(100, Math.max(0, state.cityStats.crime + op.effects.crime * 0.05));
    }
    if (op.effects.corruption) {
      state.cityStats.corruption = Math.min(100, Math.max(0, state.cityStats.corruption + op.effects.corruption * 0.05));
    }

    if (op.effects.loyaltyTarget) {
      const faction = state.factions.find((f) => f.id === op.targetId);
      if (faction) faction.loyalty = Math.max(0, Math.min(100, faction.loyalty + op.effects.loyaltyTarget * 0.1));
      const megacity = (state.externalMegacities ?? []).find((m) => m.id === op.targetId);
      if (megacity) megacity.loyalty = Math.max(0, Math.min(100, megacity.loyalty + op.effects.loyaltyTarget * 0.1));
    }
    if (op.effects.threatTarget) {
      const faction = state.factions.find((f) => f.id === op.targetId);
      if (faction) faction.threat = Math.max(0, Math.min(100, faction.threat + op.effects.threatTarget * 0.1));
      const megacity = (state.externalMegacities ?? []).find((m) => m.id === op.targetId);
      if (megacity) megacity.threat = Math.max(0, Math.min(100, megacity.threat + op.effects.threatTarget * 0.1));
    }
    if (op.effects.loyaltyAll) {
      for (const f of state.factions) {
        if (f.id !== op.targetId) {
          f.loyalty = Math.max(0, Math.min(100, f.loyalty + op.effects.loyaltyAll * 0.05));
        }
      }
    }

    if (!op.discovered && op.discoveryChance > 0 && Math.random() < op.discoveryChance) {
      op.discovered = true;
      op.retaliationChance *= 2;
      if (state.diplomaticReputation != null) {
        state.diplomaticReputation = Math.max(0, state.diplomaticReputation - 5);
      }
      entries.push({
        label: "OPERATION EXPOSED",
        delta: -5,
        unit: "rep",
        reason: `Your covert ${op.type.replace(/-/g, " ")} against ${op.targetName} has been discovered!`,
        severity: "negative",
      });
    }

    if (op.retaliationChance > 0 && Math.random() < op.retaliationChance * 0.3) {
      op.status = "retaliated";
      const damage = Math.floor(op.intensity * 0.5);
      state.cityStats.unrest = Math.min(100, state.cityStats.unrest + damage * 0.2);
      state.resources.credits -= damage * 100;
      if (op.effects.infrastructureHealth) {
        const infrastructure = applyInfrastructureHealthDelta(
          state,
          op.effects.infrastructureHealth * 0.5,
          `operation:${op.id}:retaliation:${state.totalTicks}`,
          `${op.targetName} retaliation`,
        );
        state.infrastructureLedger = infrastructure.infrastructureLedger;
        state.cityStats.infrastructureHealth = infrastructure.cityStats.infrastructureHealth;
      }
      entries.push({
        label: "RETALIATION",
        delta: -damage,
        unit: "dmg",
        reason: `${op.targetName} has retaliated against your ${op.type.replace(/-/g, " ")} operation!`,
        severity: "negative",
      });
    }
  }

  state.activeOperations = operations.filter((op) => op.status === "active" || op.remainingTicks > -4);
}

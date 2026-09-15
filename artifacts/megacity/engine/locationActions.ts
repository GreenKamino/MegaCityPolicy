import type { GameMessage, GameState, LocationRelation } from "./types";
import type { WorldLocation } from "./worldMap";
import {
  normalizeActionCostTiming,
  type ActionCostTiming,
} from "./actionCostTiming";

// Sandbox actions exposed on the World Map's selected-location panel —
// Crusader-Kings-style breadth beyond the core scout / trade / aid / raid
// verbs. Every action declared here MUST also be wired into:
//   - app/(game)/worldmap.tsx WORLD_ACTIONS catalog (UI buttons + ctx menu)
//   - the SANDBOX_LOCATION_ACTION_IDS dispatch set in worldmap.tsx
//   - engine/__tests__/locationSandboxActions.test.ts (drift guard)
//
// Unlike the existing scout/trade/aid/raid path (which is intertwined with
// weather, encounters, and undiscovered-revelation), these sandbox verbs go
// through performLocationActionTransaction — a pure helper that mutates
// only credits, ammo, locationRelations, discoveredLocationIds, and
// messages. Keep it simple, keep it deterministic, keep it testable.

export type LocationActionId =
  | "bombard"
  | "blockade"
  | "infiltrate"
  | "settle_outpost"
  | "instigate_revolt";

export type LocationActionCategory =
  | "military"
  | "covert"
  | "settlement";

export type LocationActionEffects = {
  /** Direct disposition delta on the target relation, clamped -100..100. */
  dispositionDelta?: number;
  /** Ammo cost (subtracted from resources.ammo). */
  ammoCost?: number;
  /** Counter increments on the target relation. */
  raidsSent?: number;
  scoutsMade?: number;
  tradesMade?: number;
  aidSent?: number;
  /**
   * Probability (0..1) that the action reveals one undiscovered location
   * connected to the target. Used by infiltrate.
   */
  revealConnectedChance?: number;
  /**
   * If true, the action posts a worldEventLog entry (in addition to the
   * inbox message) so the news ticker reflects sandbox aggression.
   */
  logWorldEvent?: boolean;
};

export type LocationActionRule = {
  cost: number;
  /** Sandbox actions resolve immediately; this keeps the lifecycle explicit. */
  cooldownTicks: number;
  effects: LocationActionEffects;
};

/**
 * Single source of truth for sandbox-action numbers. Lookups, validators,
 * UI labels, and tests all read from this table.
 */
export const LOCATION_ACTION_RULES: Record<LocationActionId, LocationActionRule> = {
  // Military — direct hostile force.
  bombard: {
    cost: 12000,
    cooldownTicks: 0,
    effects: { dispositionDelta: -30, ammoCost: 30, raidsSent: 1, logWorldEvent: true },
  },
  blockade: {
    cost: 6000,
    cooldownTicks: 0,
    effects: { dispositionDelta: -15, raidsSent: 1, logWorldEvent: true },
  },
  // Covert — espionage and subversion.
  infiltrate: {
    cost: 7500,
    cooldownTicks: 0,
    effects: { dispositionDelta: -5, scoutsMade: 2, revealConnectedChance: 0.65 },
  },
  instigate_revolt: {
    cost: 9000,
    cooldownTicks: 0,
    effects: { dispositionDelta: -40, raidsSent: 1, logWorldEvent: true },
  },
  // Settlement — establish a forward foothold.
  settle_outpost: {
    cost: 25000,
    cooldownTicks: 0,
    effects: { dispositionDelta: 35, aidSent: 1 },
  },
};

export function getLocationActionCostTiming(
  state: Pick<GameState, "resources" | "totalTicks">,
  action: LocationActionId,
): ActionCostTiming {
  const rule = LOCATION_ACTION_RULES[action];
  const ammoCost = rule.effects.ammoCost ?? 0;
  return normalizeActionCostTiming({
    kind: "instant",
    upfrontCostCredits: rule.cost,
    resourceCosts: ammoCost > 0 ? { ammo: ammoCost } : undefined,
    availableCredits: state.resources?.credits,
    availableResources: state.resources ?? undefined,
    cooldownTicks: rule.cooldownTicks,
    cooldownStarts: "activation",
    currentTick: state.totalTicks,
    cancellation: "unavailable",
  });
}

export type LocationActionMeta = {
  id: LocationActionId;
  label: string;
  icon: string;
  description: string;
  category: LocationActionCategory;
  variant: "primary" | "secondary" | "warning" | "danger";
};

/**
 * UI-side metadata: labels, icons, descriptions, category, and visual
 * variant. Effects/cost stay in LOCATION_ACTION_RULES.
 */
export const LOCATION_ACTION_META: Record<LocationActionId, LocationActionMeta> = {
  bombard:          { id: "bombard",          label: "BOMBARD",          icon: "crosshair",   description: "Long-range artillery strike. Burns ammo, burns bridges.",                category: "military",   variant: "danger"  },
  blockade:         { id: "blockade",         label: "BLOCKADE",         icon: "shield-off",  description: "Choke supply lines. Disposition cools, trade with them ends.",            category: "military",   variant: "warning" },
  infiltrate:       { id: "infiltrate",       label: "INFILTRATE",       icon: "user-x",      description: "Plant agents. Higher chance to reveal connected locations than scouts.",   category: "covert",     variant: "warning" },
  instigate_revolt: { id: "instigate_revolt", label: "INSTIGATE REVOLT", icon: "alert-octagon", description: "Foment rebellion against the local faction. Hostile-only. Permanent enemy.", category: "covert",     variant: "danger"  },
  settle_outpost:   { id: "settle_outpost",   label: "SETTLE OUTPOST",   icon: "flag",        description: "Establish a forward base. Expensive. Dramatically improves disposition.",  category: "settlement", variant: "primary" },
};

export const LOCATION_ACTION_CATEGORY_ORDER: LocationActionCategory[] = [
  "military",
  "covert",
  "settlement",
];

export const LOCATION_ACTION_CATEGORY_LABELS: Record<LocationActionCategory, string> = {
  military:   "MILITARY",
  covert:     "COVERT",
  settlement: "SETTLEMENT",
};

export const SANDBOX_LOCATION_ACTION_IDS: ReadonlySet<LocationActionId> = new Set(
  Object.keys(LOCATION_ACTION_RULES) as LocationActionId[],
);

const EMPTY_RELATION: LocationRelation = {
  disposition: 0,
  aidSent: 0,
  raidsSent: 0,
  tradesMade: 0,
  scoutsMade: 0,
  lastInteractionTick: 0,
};

function getRelation(prev: GameState, locId: string): LocationRelation {
  return prev.locationRelations?.[locId] ?? { ...EMPTY_RELATION };
}

/**
 * Eligibility check. Returns null if the action can be performed against
 * the given location, otherwise a player-facing reason string. Cost /
 * credits / ammo checks live in the transaction helper — this is purely
 * about "does this verb make sense for THIS location right now".
 */
export function getLocationActionIneligibility(
  action: LocationActionId,
  loc: WorldLocation,
  effectiveStatus: WorldLocation["status"],
): string | null {
  if (loc.type === "player_city") {
    return "Cannot target your own city.";
  }
  if (effectiveStatus === "undiscovered") {
    return "Location not yet discovered.";
  }
  switch (action) {
    case "bombard": {
      if (effectiveStatus === "allied") return "Will not bombard an ally.";
      if (loc.population <= 0) return "Nothing left to bombard.";
      return null;
    }
    case "blockade": {
      if (effectiveStatus === "allied") return "Will not blockade an ally.";
      if (loc.population <= 0) return "No supply lines to choke.";
      return null;
    }
    case "infiltrate": {
      if (loc.population <= 0) return "No population to infiltrate.";
      return null;
    }
    case "instigate_revolt": {
      if (effectiveStatus !== "hostile") return "Only hostile factions can be turned against themselves.";
      if (loc.population <= 0) return "No populace to incite.";
      return null;
    }
    case "settle_outpost": {
      if (effectiveStatus === "hostile") return "Cannot settle in hostile territory.";
      if (loc.population > 500_000) return "Site too densely populated for an outpost.";
      return null;
    }
    default:
      return null;
  }
}

function clampDisposition(n: number): number {
  return Math.max(-100, Math.min(100, n));
}

/**
 * Apply effects to a relation immutably. Counter increments default to 0,
 * disposition is clamped, lastInteractionTick is updated.
 */
export function applyLocationActionRelation(
  rel: LocationRelation,
  action: LocationActionId,
  tick: number,
): LocationRelation {
  const e = LOCATION_ACTION_RULES[action].effects;
  return {
    ...rel,
    disposition: clampDisposition((rel.disposition ?? 0) + (e.dispositionDelta ?? 0)),
    raidsSent:   (rel.raidsSent   ?? 0) + (e.raidsSent   ?? 0),
    scoutsMade:  (rel.scoutsMade  ?? 0) + (e.scoutsMade  ?? 0),
    tradesMade:  (rel.tradesMade  ?? 0) + (e.tradesMade  ?? 0),
    aidSent:     (rel.aidSent     ?? 0) + (e.aidSent     ?? 0),
    lastInteractionTick: tick,
  };
}

export type PerformLocationActionResult =
  | {
      ok: true;
      next: Pick<
        GameState,
        "resources" | "locationRelations" | "discoveredLocationIds" | "messages" | "worldEventLog"
      >;
      revealedLocationId: string | null;
    }
  | { ok: false; reason: string };

/**
 * Pure transaction helper for sandbox location actions. Centralizes
 * eligibility checking, cost/ammo validation, relation update, optional
 * reveal of a connected location, inbox message, and worldEventLog entry.
 *
 * On failure, NO state is mutated — credits, ammo, and relations are all
 * untouched. Caller is responsible for splatting `next` into the prev
 * state via setState.
 *
 * @param rng — injection point for tests; defaults to Math.random.
 */
export function performLocationActionTransaction(
  prev: GameState,
  loc: WorldLocation,
  action: LocationActionId,
  effectiveStatus: WorldLocation["status"],
  allLocations: WorldLocation[],
  rng: () => number = Math.random,
): PerformLocationActionResult {
  const ineligible = getLocationActionIneligibility(action, loc, effectiveStatus);
  if (ineligible) return { ok: false, reason: ineligible };

  const rule = LOCATION_ACTION_RULES[action];
  const meta = LOCATION_ACTION_META[action];

  const credits = prev.resources?.credits ?? 0;
  if (rule.cost > 0 && credits < rule.cost) {
    return {
      ok: false,
      reason: `Insufficient credits — need ${rule.cost.toLocaleString()}c.`,
    };
  }

  const ammoCost = rule.effects.ammoCost ?? 0;
  const ammo = prev.resources?.ammo ?? 0;
  if (ammoCost > 0 && ammo < ammoCost) {
    return {
      ok: false,
      reason: `Insufficient ammo — need ${ammoCost}.`,
    };
  }

  const tick = prev.totalTicks ?? 0;
  const rel = getRelation(prev, loc.id);
  const nextRel = applyLocationActionRelation(rel, action, tick);

  // Optional reveal: pick one undiscovered location connected to the target.
  let revealedLocationId: string | null = null;
  const revealChance = rule.effects.revealConnectedChance ?? 0;
  let discoveredIds = prev.discoveredLocationIds ?? [];
  if (revealChance > 0 && rng() < revealChance) {
    const undiscovered = allLocations.filter(
      (wl) =>
        wl.id !== loc.id &&
        !wl.discovered &&
        !discoveredIds.includes(wl.id) &&
        wl.connectedTo.includes(loc.id),
    );
    if (undiscovered.length > 0) {
      const idx = Math.floor(rng() * undiscovered.length);
      const pick = undiscovered[Math.min(idx, undiscovered.length - 1)];
      revealedLocationId = pick.id;
      discoveredIds = [...discoveredIds, pick.id];
    }
  }

  // Intentional asymmetry vs autonomous tickers (corporateChains /
  // independentEnterprises): player-initiated action paths SKIP the
  // message log when gameDate is unset rather than fall back to
  // gameTimestamp()'s 2050 sentinel. If game time hasn't been
  // established, the action still applies but produces no log entry.
  const message: GameMessage | null = prev.gameDate
    ? {
        id: `loc-action-${loc.id}-${action}-${tick}`,
        timestamp: { ...prev.gameDate },
        tick,
        category: "report",
        title: `${meta.label}: ${loc.name}`,
        body: revealedLocationId
          ? `${meta.description} Connected site revealed: ${revealedLocationId}.`
          : meta.description,
        read: false,
        priority: meta.variant === "danger" ? "high" : "normal",
      }
    : null;

  let worldEventLog = prev.worldEventLog;
  if (rule.effects.logWorldEvent) {
    worldEventLog = [
      ...(prev.worldEventLog ?? []),
      {
        tick,
        event: `${meta.label} on ${loc.name}`,
        type: "sandbox_action",
        timestamp: Date.now(),
        title: meta.label,
        description: `${loc.name}: ${meta.description}`,
        revealed: null,
      },
    ].slice(-200);
  }

  return {
    ok: true,
    revealedLocationId,
    next: {
      resources: {
        ...prev.resources,
        credits: credits - rule.cost,
        ammo: Math.max(0, ammo - ammoCost),
      },
      locationRelations: {
        ...(prev.locationRelations ?? {}),
        [loc.id]: nextRel,
      },
      discoveredLocationIds: discoveredIds,
      messages: message
        ? [message, ...(prev.messages ?? [])].slice(0, 200)
        : prev.messages,
      worldEventLog,
    },
  };
}

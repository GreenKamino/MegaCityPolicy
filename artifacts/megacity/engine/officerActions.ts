import type { GameMessage, GameState, Officer } from "./types";
import { RANK_ORDER } from "./officers";

// Sandbox actions exposed on the Officer Lobby screen — Crusader-Kings-style
// breadth beyond the core appoint / dismiss / consult verbs. Every action
// declared here MUST also be wired into:
//   - GameContext.performOfficerAction (the reducer that applies effects)
//   - app/(game)/officers.tsx OFFICER_ACTION_META consumer (UI)
//   - engine/__tests__/officerSandboxActions.test.ts (drift guard)

export type OfficerActionId =
  | "promote"
  | "decorate"
  | "bribe"
  | "reprimand"
  | "demote"
  | "investigate"
  | "blackmail"
  | "exile";

export type OfficerActionCategory =
  | "reward"
  | "discipline"
  | "covert"
  | "removal";

export type OfficerActionEffects = {
  loyalty?: number;
  ambition?: number;
  corruption?: number;
  popularity?: number;
  fearFactor?: number;
  competence?: number;
  /** -1 demote one rank, +1 promote one rank. */
  rankDelta?: -1 | 1;
  /** Vacate the seat after applying effects (preserves career log). */
  removeOfficer?: boolean;
  /** Effects rippled to every OTHER appointed officer in the cabinet. */
  ripple?: {
    fearFactor?: number;
    ambition?: number;
    loyalty?: number;
  };
};

export type OfficerActionRule = {
  cost: number;
  effects: OfficerActionEffects;
};

/**
 * Single source of truth for sandbox-action numbers. Lookups, validators,
 * UI labels, and tests all read from this table.
 */
export const OFFICER_ACTION_RULES: Record<OfficerActionId, OfficerActionRule> = {
  // Reward — carrots, ceremony, money.
  promote:     { cost: 4000, effects: { rankDelta: 1, loyalty: 8, ambition: 5, popularity: 5 } },
  decorate:    { cost: 2500, effects: { loyalty: 12, popularity: 10 } },
  bribe:       { cost: 6000, effects: { loyalty: 15, corruption: 8 } },
  // Discipline — sticks, public dressing-down.
  reprimand:   { cost: 0,    effects: { ambition: -10, popularity: -5, loyalty: 4, fearFactor: 6 } },
  demote:      { cost: 0,    effects: { rankDelta: -1, loyalty: -15, ambition: -12, popularity: -8 } },
  // Covert — knives in the dark.
  investigate: { cost: 3000, effects: { corruption: -12, loyalty: -6, fearFactor: 4 } },
  blackmail:   { cost: 4500, effects: { loyalty: 18, ambition: -8, corruption: 5 } },
  // Removal — burn the seat, send a message.
  exile:       { cost: 5000, effects: { removeOfficer: true, ripple: { fearFactor: 4, ambition: -2 } } },
};

export type OfficerActionMeta = {
  id: OfficerActionId;
  label: string;
  description: string;
  category: OfficerActionCategory;
  variant: "primary" | "secondary" | "warning" | "danger";
};

/**
 * UI-side metadata: labels, descriptions, category, and visual variant for
 * the action buttons. Effects/cost stay in OFFICER_ACTION_RULES.
 */
export const OFFICER_ACTION_META: Record<OfficerActionId, OfficerActionMeta> = {
  promote:     { id: "promote",     label: "PROMOTE",     description: "Advance one rank. Loyalty and ambition climb.",                     category: "reward",     variant: "primary"   },
  decorate:    { id: "decorate",    label: "DECORATE",    description: "Public ceremony, medal, kind words. Loyalty and popularity rise.",  category: "reward",     variant: "secondary" },
  bribe:       { id: "bribe",       label: "BRIBE",       description: "Quiet envelope. Buys deep loyalty at the cost of integrity.",       category: "reward",     variant: "secondary" },
  reprimand:   { id: "reprimand",   label: "REPRIMAND",   description: "Formal warning. Ambition cools, fear sharpens.",                    category: "discipline", variant: "warning"   },
  demote:      { id: "demote",      label: "DEMOTE",      description: "Strip one rank. Loyalty and pride collapse.",                       category: "discipline", variant: "warning"   },
  investigate: { id: "investigate", label: "INVESTIGATE", description: "Internal Affairs probe. Roots out corruption, breeds resentment.",   category: "covert",     variant: "warning"   },
  blackmail:   { id: "blackmail",   label: "BLACKMAIL",   description: "Use what you know. Loyalty soars, ambition dies, dirt spreads.",    category: "covert",     variant: "warning"   },
  exile:       { id: "exile",       label: "EXILE",       description: "Permanent removal. The cabinet remembers — fear ripples outward.",  category: "removal",    variant: "danger"    },
};

export const OFFICER_ACTION_CATEGORY_ORDER: OfficerActionCategory[] = [
  "reward",
  "discipline",
  "covert",
  "removal",
];

export const OFFICER_ACTION_CATEGORY_LABELS: Record<OfficerActionCategory, string> = {
  reward:     "REWARD",
  discipline: "DISCIPLINE",
  covert:     "COVERT",
  removal:    "REMOVAL",
};

/**
 * Eligibility check. Returns null if the action can be performed against the
 * given officer, otherwise a player-facing reason string. Cost / credits
 * checks live in the reducer — this is purely about "does this verb make
 * sense for THIS officer right now".
 */
export function getOfficerActionIneligibility(
  action: OfficerActionId,
  officer: Officer,
): string | null {
  if (!officer.appointed) {
    return "Officer is not appointed.";
  }
  switch (action) {
    case "promote": {
      const idx = RANK_ORDER.indexOf(officer.rank);
      if (idx < 0 || idx >= RANK_ORDER.length - 1) {
        return "Already at top rank.";
      }
      if (officer.competence < 50) {
        return "Competence below 50 — cannot justify promotion.";
      }
      return null;
    }
    case "demote": {
      const idx = RANK_ORDER.indexOf(officer.rank);
      if (idx <= 0) return "Already at bottom rank.";
      return null;
    }
    case "investigate": {
      if ((officer.corruption ?? 0) < 15) {
        return "No reasonable cause for investigation.";
      }
      return null;
    }
    case "blackmail": {
      if ((officer.corruption ?? 0) < 20) {
        return "No leverage — officer's record is too clean.";
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Applies the effect block to an officer (immutable copy). Clamps stats to
 * 0-100 and resolves rankDelta against RANK_ORDER. Caller handles credit
 * cost, ripple effects on other officers, careerLog/messages, and removal
 * (removeOfficer is signalled but not enforced here so the reducer can
 * still write a final career-log entry before vacating).
 */
export function applyOfficerActionEffects(
  officer: Officer,
  action: OfficerActionId,
): Officer {
  const rule = OFFICER_ACTION_RULES[action];
  const e = rule.effects;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  let rank = officer.rank;
  if (e.rankDelta) {
    const idx = RANK_ORDER.indexOf(officer.rank);
    if (idx >= 0) {
      const next = Math.max(0, Math.min(RANK_ORDER.length - 1, idx + e.rankDelta));
      rank = RANK_ORDER[next];
    }
  }

  return {
    ...officer,
    rank,
    loyalty:    clamp((officer.loyalty    ?? 0) + (e.loyalty    ?? 0)),
    ambition:   clamp((officer.ambition   ?? 0) + (e.ambition   ?? 0)),
    corruption: clamp((officer.corruption ?? 0) + (e.corruption ?? 0)),
    popularity: clamp((officer.popularity ?? 0) + (e.popularity ?? 0)),
    fearFactor: clamp((officer.fearFactor ?? 0) + (e.fearFactor ?? 0)),
    competence: clamp((officer.competence ?? 0) + (e.competence ?? 0)),
  };
}

/**
 * Pure transaction helper for the GameContext.performOfficerAction reducer.
 * Centralizes ineligibility checking, cost validation, effect application,
 * ripple, removal, career-log entry, and inbox message so it can be unit
 * tested independently of React. The reducer itself is a thin wrapper.
 *
 * Returns either a successful next-state slice or a failure reason. On
 * failure, NO state is mutated — credits and officers are untouched.
 */
export type PerformOfficerActionResult =
  | {
      ok: true;
      next: Pick<GameState, "officers" | "resources" | "messages">;
    }
  | { ok: false; reason: string };

export function performOfficerActionTransaction(
  prev: GameState,
  officerId: string,
  action: OfficerActionId,
): PerformOfficerActionResult {
  const officers = prev.officers ?? [];
  const target = officers.find((o) => o.id === officerId);
  if (!target) return { ok: false, reason: "Officer not found." };

  const ineligible = getOfficerActionIneligibility(action, target);
  if (ineligible) return { ok: false, reason: ineligible };

  const rule = OFFICER_ACTION_RULES[action];
  const meta = OFFICER_ACTION_META[action];
  const credits = prev.resources?.credits ?? 0;
  if (rule.cost > 0 && credits < rule.cost) {
    return {
      ok: false,
      reason: `Insufficient credits — need ${rule.cost.toLocaleString()}c.`,
    };
  }

  const year = prev.gameDate?.year ?? 0;
  let next = applyOfficerActionEffects(target, action);
  const logEntry = { year, text: `${meta.label}: ${meta.description}` };
  const careerLog = [...(next.careerLog ?? []), logEntry].slice(-24);
  next = { ...next, careerLog };

  let officersAfter = officers.map((o) => (o.id === officerId ? next : o));

  if (rule.effects.ripple) {
    officersAfter = applyOfficerActionRipple(officersAfter, officerId, action);
  }

  if (rule.effects.removeOfficer) {
    officersAfter = officersAfter.map((o) =>
      o.id === officerId
        ? {
            ...o,
            appointed: false,
            appointmentMethod: null,
            exitYear: year,
            exitReason: "dismissed" as const,
          }
        : o,
    );
  }

  // Intentional asymmetry vs autonomous tickers (corporateChains /
  // independentEnterprises): player-initiated action paths SKIP the
  // message log when gameDate is unset rather than fall back to
  // gameTimestamp()'s 2050 sentinel. If game time hasn't been
  // established, the action still applies but produces no log entry.
  const message: GameMessage | null = prev.gameDate
    ? {
        id: `officer-action-${officerId}-${action}-${prev.totalTicks ?? 0}`,
        timestamp: { ...prev.gameDate },
        tick: prev.totalTicks ?? 0,
        category: "report",
        title: `${meta.label}: ${target.position}`,
        body: `${target.name} — ${meta.description}`,
        read: false,
        priority: rule.effects.removeOfficer ? "high" : "normal",
      }
    : null;

  return {
    ok: true,
    next: {
      resources: {
        ...prev.resources,
        credits: credits - rule.cost,
      },
      officers: officersAfter,
      messages: message
        ? [message, ...(prev.messages ?? [])].slice(0, 200)
        : prev.messages,
    },
  };
}

/**
 * Apply ripple effects to every appointed officer EXCEPT the target. Used
 * by exile to broadcast the lesson to the rest of the cabinet.
 */
export function applyOfficerActionRipple(
  officers: Officer[],
  targetId: string,
  action: OfficerActionId,
): Officer[] {
  const ripple = OFFICER_ACTION_RULES[action].effects.ripple;
  if (!ripple) return officers;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return officers.map((o) => {
    if (o.id === targetId || !o.appointed) return o;
    return {
      ...o,
      fearFactor: clamp((o.fearFactor ?? 0) + (ripple.fearFactor ?? 0)),
      ambition:   clamp((o.ambition   ?? 0) + (ripple.ambition   ?? 0)),
      loyalty:    clamp((o.loyalty    ?? 0) + (ripple.loyalty    ?? 0)),
    };
  });
}

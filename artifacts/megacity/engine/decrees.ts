// Pure decree-effect application, extracted from GameContext.issueDecree so
// the player-action path is directly testable (decrees are actions, never
// tick effects — see engine/__tests__/decreeEffects.test.ts).
//
// Targeting decision (Task #492): the `loyalty` effect key applies to OFFICER
// loyalty, uniformly across the roster. Rationale: two of the three seeded
// decrees that carry it are explicitly officer-facing (DEPARTMENTAL PURGE,
// PROMOTE A LOYALIST), and officer loyalty feeds calculateApproval
// (approval.officers) and generatePoliticalThreats (disloyal-officer plot
// threats) — so the effect is both thematic and mechanically live. Note the
// intrigue tick reads FACTION loyalty, not officer loyalty. Faction and
// district loyalty are NOT touched by decrees.

import type { GameState } from "@/engine/types";
import {
  type PoliticalDecreeDef,
  calculateRepTitle,
  createDefaultPoliticsState,
} from "@/engine/politicsData";

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Applies a decree's cost, effects, cooldown, and bookkeeping to the state.
 * Affordability and cooldown gating are the caller's responsibility — this
 * function assumes the decree has already been validated as issuable.
 */
export function applyDecreeEffects(prev: GameState, def: PoliticalDecreeDef): GameState {
  const p = prev.politics ?? createDefaultPoliticsState();
  const rep = { ...p.reputation };
  const cs = { ...prev.cityStats };
  if (def.effects.unrest) cs.unrest = clamp100(cs.unrest + def.effects.unrest);
  if (def.effects.happiness) cs.happiness = clamp100(cs.happiness + def.effects.happiness);
  if (def.effects.corruption) cs.corruption = clamp100(cs.corruption + def.effects.corruption);
  if (def.effects.lawOrder) cs.lawOrder = clamp100(cs.lawOrder + def.effects.lawOrder);
  if (def.effects.defenseRating) cs.defenseRating = Math.max(0, cs.defenseRating + def.effects.defenseRating);
  if (def.effects.fear) rep.fear = clamp100(rep.fear + def.effects.fear);
  if (def.effects.mercy) rep.mercy = clamp100(rep.mercy + def.effects.mercy);
  if (def.effects.transparency) rep.transparency = clamp100(rep.transparency + def.effects.transparency);
  if (def.effects.populism) rep.populism = clamp100(rep.populism + def.effects.populism);
  if (def.effects.stability) rep.stability = clamp100(rep.stability + def.effects.stability);
  rep.title = calculateRepTitle(rep);
  // Officer loyalty — see targeting decision at the top of this file.
  const loyaltyDelta = def.effects.loyalty ?? 0;
  const officers = loyaltyDelta !== 0
    ? prev.officers.map((o) => ({ ...o, loyalty: clamp100((o.loyalty ?? 50) + loyaltyDelta) }))
    : prev.officers;
  const creditEffect = (def.effects.credits ?? 0) - def.cost;
  // Record only the gross positive grant (decree payout), not the net of
  // the decree's cost — totalCreditsEarned tracks income, never spending.
  const decreeCreditGrant = Math.max(0, def.effects.credits ?? 0);
  return {
    ...prev,
    resources: { ...prev.resources, credits: prev.resources.credits + creditEffect },
    totalCreditsEarned: (prev.totalCreditsEarned ?? 0) + decreeCreditGrant,
    cityStats: cs,
    officers,
    politics: {
      ...p,
      reputation: rep,
      decreeCooldowns: { ...p.decreeCooldowns, [def.id]: prev.totalTicks + def.cooldownTicks },
      totalDecrees: p.totalDecrees + 1,
      lastDecreeTick: prev.totalTicks,
    },
  };
}

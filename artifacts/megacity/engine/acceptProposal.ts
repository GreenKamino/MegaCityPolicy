import type { GameState } from "@/engine/types";
import { applyRecruitBatchProposal } from "@/engine/autoRecruit";
import { applyDomainProposal } from "@/engine/autoDomainManagers";

/**
 * Single source of truth for accepting an Advisor Briefing (auto-manager
 * proposal). Pure (returns a new state): finds the queued proposal,
 * applies the matching domain handler, dequeues it, and stamps the
 * per-domain decision tick.
 *
 * Both GameContext.acceptAutoManagerProposal (the React glue) and the
 * auto-manager integration tests call this so the real accept flow and
 * the tested flow can never drift apart.
 *
 * Recruit proposals route through applyRecruitBatchProposal; every other
 * domain routes through applyDomainProposal, which re-derives its action
 * from current state so a stale briefing applies as a no-op rather than
 * an outdated/unaffordable action. If the proposal id isn't queued (or
 * autoManagers is absent), the state is returned unchanged.
 */
export function applyAcceptProposal(state: GameState, proposalId: string): GameState {
  const am = state.autoManagers;
  if (!am) return state;
  const proposal = am.queue.find((p) => p.id === proposalId);
  if (!proposal) return state;

  let next: GameState = state;
  if (proposal.kind === "recruit-batch" && proposal.domain === "recruit") {
    next = applyRecruitBatchProposal(state, proposal);
  } else if (proposal.domain !== "recruit") {
    next = applyDomainProposal(state, proposal);
  }

  return {
    ...next,
    autoManagers: {
      ...am,
      queue: am.queue.filter((p) => p.id !== proposalId),
      lastDecisionTick: { ...am.lastDecisionTick, [proposal.domain]: state.totalTicks },
    },
  };
}

/**
 * Single source of truth for declining an Advisor Briefing. Pure (returns a
 * new state): dequeues the proposal and stamps the per-domain decision tick
 * (so the domain's interval gate restarts just as it would after an accept),
 * but applies no domain handler. If the proposal id isn't queued (or
 * autoManagers is absent), the state is returned unchanged.
 *
 * Both GameContext.declineAutoManagerProposal (the React glue) and the
 * auto-manager tests call this so the real decline flow and the tested flow
 * can never drift apart.
 */
export function applyDeclineProposal(state: GameState, proposalId: string): GameState {
  const am = state.autoManagers;
  if (!am) return state;
  const proposal = am.queue.find((p) => p.id === proposalId);
  if (!proposal) return state;

  return {
    ...state,
    autoManagers: {
      ...am,
      queue: am.queue.filter((p) => p.id !== proposalId),
      lastDecisionTick: { ...am.lastDecisionTick, [proposal.domain]: state.totalTicks },
    },
  };
}

/**
 * Single source of truth for snoozing an Advisor Briefing. Pure (returns a
 * new state): dequeues the proposal and replaces any existing snooze entry
 * for the proposal's kind with a fresh one whose untilTick is the current
 * tick plus at least one tick (ticks is floored at 1). Unlike decline, this
 * does NOT stamp lastDecisionTick — snooze suppresses the proposal kind for a
 * window rather than recording a per-domain decision. If the proposal id
 * isn't queued (or autoManagers is absent), the state is returned unchanged.
 *
 * Both GameContext.snoozeAutoManagerProposal (the React glue) and the
 * auto-manager tests call this so the real snooze flow and the tested flow
 * can never drift apart.
 */
export function applySnoozeProposal(state: GameState, proposalId: string, ticks: number): GameState {
  const am = state.autoManagers;
  if (!am) return state;
  const proposal = am.queue.find((p) => p.id === proposalId);
  if (!proposal) return state;

  const snoozedKinds = am.snoozedKinds.filter((k) => k.kind !== proposal.kind);
  snoozedKinds.push({ kind: proposal.kind, untilTick: state.totalTicks + Math.max(1, ticks) });

  return {
    ...state,
    autoManagers: {
      ...am,
      queue: am.queue.filter((p) => p.id !== proposalId),
      snoozedKinds,
    },
  };
}

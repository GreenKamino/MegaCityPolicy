import type { GameState, TickEntry } from "@/engine/types";
import type { InnerCircleRole } from "@/engine/innerCircleData";

export type AutoManagerMode = "off" | "suggest" | "act";

export type AutoManagerDomain =
  | "recruit"
  | "research"
  | "intel"
  | "espionage"
  | "agriculture"
  | "trade"
  | "military"
  | "edicts";

export const AUTO_MANAGER_DOMAINS: AutoManagerDomain[] = [
  "recruit",
  "research",
  "intel",
  "espionage",
  "agriculture",
  "trade",
  "military",
  "edicts",
];

export const DOMAIN_LABELS: Record<AutoManagerDomain, string> = {
  recruit: "AUTO-RECRUIT",
  research: "AUTO-RESEARCH",
  intel: "AUTO-INTELLIGENCE",
  espionage: "AUTO-ESPIONAGE",
  agriculture: "AUTO-AGRICULTURE",
  trade: "AUTO-TRADE",
  military: "AUTO-MILITARY",
  edicts: "AUTO-EDICTS",
};

export const DOMAIN_DESCRIPTIONS: Record<AutoManagerDomain, string> = {
  recruit: "Recruit troops and refill empty officer slots within a credit budget.",
  research: "Pick the next prereq-met tech from your priority categories.",
  intel: "Run surveillance and intel ops against your watch list.",
  espionage: "Counter-intel and retaliation against incoming espionage.",
  agriculture: "Maintain food stockpile band; queue farm contracts.",
  trade: "Auto-accept profitable trade offers within rules.",
  military: "Top up fuel/ammo/rations; suggest mobilization.",
  edicts: "Tune taxes and edicts to keep stats inside a target band.",
};

// Inner Circle role required to enable a domain. When the role is unfilled,
// the domain is shown but the player is told who to appoint.
export const DOMAIN_ROLES: Record<AutoManagerDomain, InnerCircleRole | "agriculture_minister"> = {
  recruit: "enforcer",
  research: "science_advisor",
  intel: "spymaster",
  espionage: "spymaster",
  agriculture: "agriculture_minister",
  trade: "diplomat",
  military: "war_marshal",
  edicts: "chancellor",
};

export type AutoManagerProposalKind =
  | "recruit-batch"
  | "research-pick"
  | "intel-op"
  | "counter-op"
  | "farm-contract"
  | "trade-accept"
  | "military-topup"
  | "edict-tune"
  | "generic";

export type AutoManagerProposal = {
  id: string;
  domain: AutoManagerDomain;
  kind: AutoManagerProposalKind;
  officerId?: string;
  title: string;
  summary: string;
  rationale: string;
  costPreview?: string;
  // Opaque payload the downstream domain handler interprets when the
  // player accepts. Foundations only stores it; per-domain modules own
  // the schema (e.g. recruit-batch uses { hires: TroopClassId[] }).
  payload?: unknown;
  createdTick: number;
  expiresAtTick: number;
  declineable: boolean;
};

// Capped at this length; oldest proposals get pruned when full so an
// unattended queue can't grow without bound.
export const QUEUE_CAP = 20;

// Default time-to-live for a proposal, in ticks. Past this, it expires
// silently. Per-domain code can override per-proposal.
export const DEFAULT_PROPOSAL_TTL = 96;

export type AutoManagerState = {
  modes: Partial<Record<AutoManagerDomain, AutoManagerMode>>;
  queue: AutoManagerProposal[];
  // Global kill-switch: when true, every domain effectively runs as
  // SUGGEST (no autonomous mutations) regardless of per-domain mode.
  pauseAllAct: boolean;
  // Proposal kinds the player has marked "always allow" so the domain
  // module can skip the queue and apply directly. Tracked here so the
  // setting survives the Advisor Briefings panel being closed.
  alwaysAllow: AutoManagerProposalKind[];
  // Proposal kinds the player has snoozed; entries auto-expire when
  // the tick passes `untilTick`.
  snoozedKinds: { kind: AutoManagerProposalKind; untilTick: number }[];
  // Last tick a proposal was accepted/declined per domain — used for
  // "trust building" UI and to throttle noisy domains.
  lastDecisionTick: Partial<Record<AutoManagerDomain, number>>;
};

export function createDefaultAutoManagerState(): AutoManagerState {
  return {
    modes: {},
    queue: [],
    pauseAllAct: false,
    alwaysAllow: [],
    snoozedKinds: [],
    lastDecisionTick: {},
  };
}

/**
 * Resolve the *effective* mode for a domain, after honor-mode and
 * pause-all interlocks. Domain modules MUST go through this rather
 * than reading state.modes directly so the player's safety toggles
 * are always honored.
 */
export function getEffectiveMode(s: GameState, domain: AutoManagerDomain): AutoManagerMode {
  const am = s.autoManagers ?? createDefaultAutoManagerState();
  const raw = am.modes[domain] ?? "off";
  if (raw === "off") return "off";
  // Honor mode bans ACT — same purity rationale as save-scumming.
  if (s.honorMode === true && raw === "act") return "suggest";
  // Global pause-all kill switch.
  if (am.pauseAllAct && raw === "act") return "suggest";
  return raw;
}

/**
 * Persist a per-domain mode. Honor-mode interlock is enforced HERE at
 * the mutation point so even if a caller bypasses the UI (e.g. from a
 * console or future scripting), ACT can never be persisted while honor
 * mode is on. The UI separately disables the ACT button under honor
 * mode and shows an inline reason.
 */
export function setAutoManagerMode(
  s: AutoManagerState,
  domain: AutoManagerDomain,
  mode: AutoManagerMode,
  honorMode: boolean = false,
): AutoManagerState {
  const coerced: AutoManagerMode = honorMode && mode === "act" ? "suggest" : mode;
  return { ...s, modes: { ...s.modes, [domain]: coerced } };
}

/**
 * Always-allow replay: if a proposal's kind is on the always-allow list
 * and not currently snoozed, the caller can apply the proposal directly
 * without queuing it for player approval. Returns true when the proposal
 * was auto-accepted (caller should NOT enqueue), false when it should
 * fall through to the normal approval queue.
 *
 * Honor mode + pause-all act as kill switches: even with always-allow,
 * ACT-mode autonomous mutations are forbidden under either, so the
 * proposal falls back to the queue.
 */
export function shouldAutoAcceptProposal(
  s: GameState,
  proposal: AutoManagerProposal,
): boolean {
  const am = s.autoManagers;
  if (!am) return false;
  const effective = getEffectiveMode(s, proposal.domain);
  if (effective !== "act") return false;
  if (!am.alwaysAllow.includes(proposal.kind)) return false;
  if (isKindSnoozed(am, proposal.kind, s.totalTicks)) return false;
  return true;
}

/**
 * Push a proposal into the queue. If the queue is full, the OLDEST
 * declineable proposal is pruned to make room (so unattended queues
 * eventually flush themselves rather than silently dropping new
 * arrivals). Non-declineable proposals are protected from pruning.
 */
export function enqueueProposal(s: AutoManagerState, proposal: AutoManagerProposal): AutoManagerState {
  let queue = [...s.queue];
  if (queue.length >= QUEUE_CAP) {
    const idx = queue.findIndex((p) => p.declineable);
    if (idx >= 0) queue.splice(idx, 1);
    else return s; // queue full of pinned proposals — drop the new one
  }
  queue.push(proposal);
  return { ...s, queue };
}

export function removeProposal(s: AutoManagerState, id: string): AutoManagerState {
  return { ...s, queue: s.queue.filter((p) => p.id !== id) };
}

export function snoozeKind(
  s: AutoManagerState,
  kind: AutoManagerProposalKind,
  untilTick: number,
): AutoManagerState {
  const snoozedKinds = s.snoozedKinds.filter((k) => k.kind !== kind);
  snoozedKinds.push({ kind, untilTick });
  return { ...s, snoozedKinds };
}

export function isKindSnoozed(s: AutoManagerState, kind: AutoManagerProposalKind, currentTick: number): boolean {
  return s.snoozedKinds.some((k) => k.kind === kind && k.untilTick > currentTick);
}

export function setAlwaysAllow(s: AutoManagerState, kind: AutoManagerProposalKind, allow: boolean): AutoManagerState {
  const alwaysAllow = s.alwaysAllow.filter((k) => k !== kind);
  if (allow) alwaysAllow.push(kind);
  return { ...s, alwaysAllow };
}

export function setPauseAllAct(s: AutoManagerState, paused: boolean): AutoManagerState {
  return { ...s, pauseAllAct: paused };
}

/**
 * Per-tick housekeeping for the auto-manager subsystem.
 *
 * Foundations responsibilities:
 *  - Fast-bail when nothing is enabled (~0 cost so disabled managers
 *    don't tax the tick budget).
 *  - Expire stale proposals.
 *  - Garbage-collect snoozes that have passed their untilTick.
 *
 * Per-domain auto-managers (Phase 1+) extend this loop in their own
 * tickProcessor entries; this function only owns the shared infra.
 */
export function processAutoManagers(s: GameState, entries: TickEntry[]): void {
  const am = s.autoManagers;
  if (!am) return;

  const anyEnabled = Object.values(am.modes).some((m) => m && m !== "off");
  const hasQueue = am.queue.length > 0;
  const hasSnoozes = am.snoozedKinds.length > 0;
  if (!anyEnabled && !hasQueue && !hasSnoozes) return;

  const tick = s.totalTicks;
  let next = am;

  if (hasQueue) {
    const remaining = am.queue.filter((p) => p.expiresAtTick > tick);
    if (remaining.length !== am.queue.length) {
      const expired = am.queue.length - remaining.length;
      next = { ...next, queue: remaining };
      entries.push({
        label: "Advisor Briefings",
        delta: -expired,
        unit: "proposals",
        reason: "Stale advisor proposals expired",
        severity: "neutral",
      });
    }
  }

  if (hasSnoozes) {
    const liveSnoozes = am.snoozedKinds.filter((k) => k.untilTick > tick);
    if (liveSnoozes.length !== am.snoozedKinds.length) {
      next = { ...next, snoozedKinds: liveSnoozes };
    }
  }

  if (next !== am) s.autoManagers = next;
}

export function unresolvedProposalCount(s: GameState): number {
  return s.autoManagers?.queue.length ?? 0;
}

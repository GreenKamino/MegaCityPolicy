import type { GameState, GameMessage, TickEntry } from "@/engine/types";
import {
  getClassDef,
  type TroopClassId,
} from "@/engine/retinueData";
import { recruitTroop } from "@/engine/retinue";
import {
  enqueueProposal,
  getEffectiveMode,
  type AutoManagerProposal,
} from "@/engine/autoManagers";

/**
 * Auto-Hire cadence: per spec, the budget is enforced as a per-tick
 * credit cap (`budgetPerTick`) with `RECRUIT_INTERVAL = 1`. The
 * interval constant is retained so a future product change to a slower
 * cadence is a one-line tweak.
 *
 * Apply an accepted recruit-batch proposal: replays each planned hire
 * via recruitTroop (which deducts credits) and slots the new troop
 * into the first under-strength squad, mirroring ACT-mode behavior.
 *
 * Pure (returns a new state); GameContext.acceptAutoManagerProposal
 * wraps this in its setState reducer. Insufficient funds short-circuit
 * the rest of the batch — partial execution is intentional so the
 * player isn't penalized for accepting an outdated proposal.
 */
export function applyRecruitBatchProposal(
  state: GameState,
  proposal: AutoManagerProposal,
): GameState {
  if (proposal.kind !== "recruit-batch" || proposal.domain !== "recruit") {
    return state;
  }
  const payload = proposal.payload as { hires?: unknown } | undefined;
  const plan: TroopClassId[] = Array.isArray(payload?.hires)
    ? (payload!.hires as unknown[]).filter((id): id is TroopClassId => typeof id === "string")
    : [];
  if (plan.length === 0 || !state.retinue) return state;
  const cloned: GameState = {
    ...state,
    resources: { ...state.resources },
    messages: [...(state.messages ?? [])],
    retinue: {
      ...state.retinue,
      troops: [...state.retinue.troops],
      squads: state.retinue.squads.map((sq) => ({ ...sq, troopIds: [...sq.troopIds] })),
    },
  };
  for (const classId of plan) {
    const def = getClassDef(classId);
    if (!def) continue;
    const result = recruitTroop(cloned, classId);
    if (!result.success || !result.troop) break;
    const openSquad = cloned.retinue!.squads.find((sq) => sq.troopIds.length < sq.maxSize);
    if (openSquad) {
      openSquad.troopIds.push(result.troop.id);
      const t = cloned.retinue!.troops.find((x) => x.id === result.troop!.id);
      if (t) t.squadId = openSquad.id;
    }
  }
  return cloned;
}

export type AutoRecruitConfig = {
  budgetPerTick: number;
  /**
   * Target retinue strength as a percentage (0–100) of the player's
   * maximum roster capacity (maxSquads * maxTroopsPerSquad). Auto-hire
   * stops once active troop count meets or exceeds this percentage of
   * the cap. Stored as a percentage rather than absolute count so it
   * scales with retinue upgrades.
   */
  targetStrengthPercent: number;
  classPriority: TroopClassId[];
  lastRecruitTick: number;
};

export const RECRUIT_INTERVAL = 1;

const DEFAULT_PRIORITY: TroopClassId[] = [
  "infantry",
  "shocktrooper",
  "marksman",
  "war_medic",
  "breacher",
  "demolisher",
  "dragoon",
  "scout",
  "engineer",
  "heavy_gunner",
  "medic",
  "cyber_operative",
];

export const DEFAULT_AUTO_RECRUIT: AutoRecruitConfig = {
  budgetPerTick: 2000,
  targetStrengthPercent: 75,
  classPriority: DEFAULT_PRIORITY,
  lastRecruitTick: 0,
};

export function createDefaultAutoRecruitConfig(): AutoRecruitConfig {
  return {
    ...DEFAULT_AUTO_RECRUIT,
    classPriority: [...DEFAULT_PRIORITY],
  };
}

function hasEnforcer(s: GameState): boolean {
  return (s.innerCircle?.members ?? []).some((m) => m.role === "enforcer");
}

function getEnforcerOfficerId(s: GameState): string | undefined {
  return (s.innerCircle?.members ?? []).find((m) => m.role === "enforcer")?.officerId;
}

function activeTroopCount(s: GameState): number {
  return (s.retinue?.troops ?? []).filter((t) => t.status !== "kia").length;
}

/**
 * Maximum roster capacity = squads × troops-per-squad. Both fields live
 * on retinueState and grow with retinue upgrades, so the strength %
 * target tracks the player's current ceiling automatically.
 */
export function getMaxRetinueStrength(s: GameState): number {
  const ret = s.retinue;
  if (!ret) return 0;
  return Math.max(0, ret.maxSquads * ret.maxTroopsPerSquad);
}

function getTargetTroopCount(s: GameState, config: AutoRecruitConfig): number {
  const cap = getMaxRetinueStrength(s);
  const pct = Math.max(0, Math.min(100, config.targetStrengthPercent));
  return Math.floor((cap * pct) / 100);
}

/**
 * Find the first squad with an open slot (existing troop count below
 * maxSize). Used to satisfy the "fills empty slots first" contract:
 * freshly-recruited troops are slotted into under-strength squads
 * before being left as floating reserves.
 */
function findOpenSquad(s: GameState): { id: string } | null {
  const squads = s.retinue?.squads ?? [];
  for (const sq of squads) {
    if (sq.troopIds.length < sq.maxSize) return { id: sq.id };
  }
  return null;
}

/**
 * Pick the next class to hire under the per-tick budget.
 *
 * `creditsAvailable` is the caller's view of the treasury at this
 * step. ACT mode passes `s.resources.credits` directly because
 * `recruitTroop` mutates credits between iterations; SUGGEST mode
 * (which doesn't mutate state) passes `initialCredits - spentSoFar`
 * so a planned batch never exceeds what the treasury can fund.
 */
function pickNextClass(
  s: GameState,
  config: AutoRecruitConfig,
  spentSoFar: number,
  creditsAvailable: number,
): TroopClassId | null {
  const budgetRemaining = config.budgetPerTick - spentSoFar;
  for (const classId of config.classPriority) {
    const def = getClassDef(classId);
    if (!def) continue;
    if (def.recruitCost > budgetRemaining) continue;
    if (def.recruitCost > creditsAvailable) continue;
    if (
      classId === "cyber_operative" &&
      !(s.unlockedTechnologies ?? []).includes("basic_cybernetics")
    ) {
      continue;
    }
    return classId;
  }
  return null;
}

/**
 * Plan the next batch under budget without mutating state. Walks the
 * priority list greedily and stops when the budget is exhausted, the
 * target ceiling is hit, or no class is affordable. Used by SUGGEST
 * mode to compose a multi-hire proposal preview.
 */
function planBatch(
  s: GameState,
  config: AutoRecruitConfig,
  startCount: number,
  targetCount: number,
): { hires: { classId: TroopClassId; cost: number }[]; totalCost: number } {
  const hires: { classId: TroopClassId; cost: number }[] = [];
  const initialCredits = s.resources.credits;
  let spent = 0;
  let count = startCount;
  while (count < targetCount) {
    // SUGGEST is non-mutating, so simulate treasury drawdown locally.
    const classId = pickNextClass(s, config, spent, initialCredits - spent);
    if (!classId) break;
    const def = getClassDef(classId);
    if (!def) break;
    hires.push({ classId, cost: def.recruitCost });
    spent += def.recruitCost;
    count += 1;
  }
  return { hires, totalCost: spent };
}

function pushPerHireMessage(s: GameState, classId: TroopClassId, cost: number, seq: number): void {
  const def = getClassDef(classId);
  const name = def?.name ?? classId;
  const gameDate = s.gameDate ?? { year: 2030, month: 1, day: 1, hour: 0 };
  const msg: GameMessage = {
    // Deterministic ID: tick + class + per-tick sequence. Stable across
    // replays/save round-trips and keyed-list renders.
    id: `auto-recruit-${s.totalTicks}-${classId}-${seq}`,
    title: "AUTO-RECRUIT: TROOP HIRED",
    body: `Your Enforcer hired a ${name} for ${cost.toLocaleString()} credits.`,
    timestamp: gameDate,
    tick: s.totalTicks,
    read: false,
    category: "update",
    priority: "normal",
  };
  s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
}

function summarizeBatch(hires: { classId: TroopClassId; cost: number }[]): string {
  // Group consecutive same-class hires for compact summaries
  // ("Hire 2 Dragoons + 1 Marksman").
  const counts = new Map<TroopClassId, number>();
  for (const h of hires) counts.set(h.classId, (counts.get(h.classId) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([cid, n]) => {
      const name = getClassDef(cid)?.name ?? cid;
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    })
    .join(" + ");
}

/**
 * Per-tick auto-recruit. Gated by:
 *  - Enforcer must be appointed in the inner circle (DOMAIN_ROLES).
 *  - Effective mode must be SUGGEST or ACT (honor + pause-all interlocks
 *    handled by getEffectiveMode).
 *  - RECRUIT_INTERVAL throttle.
 *  - Active troop count must be below the target % of max strength.
 *
 * SUGGEST: enqueue a single Advisor Briefing proposal previewing the
 * full batch (count, classes, total cost) the auto-manager would have
 * hired. The accept handler in GameContext consumes the proposal and
 * runs the same plan.
 * ACT: hire troops greedily by priority order, capped by budgetPerTick
 * and the strength-% ceiling; freshly-hired troops are slotted into
 * the first under-strength squad ("fill empty slots first"). Each hire
 * emits its own message so the player sees per-troop arrival in the
 * inbox.
 */
export function processAutoRecruit(s: GameState, entries: TickEntry[]): void {
  const config = s.autoRecruit;
  if (!config) return;

  const mode = getEffectiveMode(s, "recruit");
  if (mode === "off") return;
  if (!hasEnforcer(s)) return;
  if (s.totalTicks - config.lastRecruitTick < RECRUIT_INTERVAL) return;

  const current = activeTroopCount(s);
  const target = getTargetTroopCount(s, config);
  if (current >= target) return;

  if (mode === "suggest") {
    const { hires, totalCost } = planBatch(s, config, current, target);
    if (hires.length === 0) return;
    const am = s.autoManagers;
    if (!am) return;
    const summary = summarizeBatch(hires);
    const proposalId = `recruit-batch-${s.totalTicks}`;
    if (am.queue.some((p) => p.id === proposalId)) return;
    // Throttle briefing noise: if any prior recruit-batch proposal is
    // still pending in the queue, skip emitting a new one. The player
    // hasn't acted on the previous suggestion yet, so a duplicate adds
    // clutter without new information.
    if (am.queue.some((p) => p.kind === "recruit-batch" && p.domain === "recruit")) return;
    const proposal: AutoManagerProposal = {
      id: proposalId,
      domain: "recruit",
      kind: "recruit-batch",
      officerId: getEnforcerOfficerId(s),
      title: `Hire ${hires.length} ${hires.length === 1 ? "troop" : "troops"} (${summary})`,
      summary: `Recruit ${summary} to bring active troops to ${current + hires.length}/${target}.`,
      rationale: `Active troops below target (${current}/${target} = ${config.targetStrengthPercent}% of ${getMaxRetinueStrength(s)} cap). Plan fits within ${config.budgetPerTick.toLocaleString()}c per-tick budget.`,
      costPreview: `${totalCost.toLocaleString()} credits`,
      // Persist the full plan so accept reproduces it without
      // recomputing against changed state.
      payload: { hires: hires.map((h) => h.classId) },
      createdTick: s.totalTicks,
      expiresAtTick: s.totalTicks + 48,
      declineable: true,
    };
    s.autoManagers = enqueueProposal(am, proposal);
    s.autoRecruit = { ...config, lastRecruitTick: s.totalTicks };
    return;
  }

  // ACT mode — actually hire.
  let spent = 0;
  let hired = 0;
  const hires: { classId: TroopClassId; cost: number }[] = [];

  while (current + hired < target) {
    // ACT: recruitTroop mutates s.resources.credits each iteration, so
    // pass the live treasury value (not a simulated remainder).
    const classId = pickNextClass(s, config, spent, s.resources.credits);
    if (!classId) break;
    const def = getClassDef(classId);
    if (!def) break;
    const result = recruitTroop(s, classId);
    if (!result.success || !result.troop) break;
    spent += def.recruitCost;
    hired += 1;
    hires.push({ classId, cost: def.recruitCost });

    // Slot-first: assign the new troop into the first squad with an
    // open seat so under-strength squads are filled before floating
    // reserves grow. Direct mutation mirrors the assignTroopToSquad
    // helper but skips its safety checks (we just created the troop).
    const open = findOpenSquad(s);
    if (open) {
      const ret = s.retinue!;
      const squad = ret.squads.find((sq) => sq.id === open.id);
      const troop = ret.troops.find((t) => t.id === result.troop!.id);
      if (squad && troop && squad.troopIds.length < squad.maxSize) {
        squad.troopIds.push(troop.id);
        troop.squadId = squad.id;
      }
    }

    // Per-hire inbox notification (requirement: emit a message per hire).
    pushPerHireMessage(s, classId, def.recruitCost, hired);
  }

  if (hired === 0) return;

  s.autoRecruit = { ...config, lastRecruitTick: s.totalTicks };
  entries.push({
    label: "Auto-Recruit",
    delta: -spent,
    unit: "credits",
    reason: `Hired ${hired} troop${hired === 1 ? "" : "s"} (${summarizeBatch(hires)})`,
    severity: "neutral",
  });
}

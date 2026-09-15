// Weekly procedural challenges — leverages existing player counters and
// event/mission systems. One challenge per ISO week, deterministic per
// (week, save slot), with a small reward on completion.
//
// The system uses delta tracking: when a challenge is generated, it snapshots
// the relevant counter as a baseline; progress is `current - baseline`.

import type { GameState, WeeklyChallenge } from "@/engine/types";

// ── ISO week key ────────────────────────────────────────────────────────────
//
// Returns a string like "2026-W18" for the current ISO week.
export function isoWeekKey(now: Date = new Date()): string {
  // Algorithm: ISO 8601 week numbering.
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7, Mon..Sun
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ── Stat readers — what we can reasonably track from existing GameState ────
//
// All counters are monotonically non-decreasing during normal play, which
// matters for delta math. If a counter ever resets mid-week (e.g. via cheat
// or rebirth), progress simply pauses; it doesn't go negative because the
// generator clamps at 0.

export type ChallengeStatKey =
  | "criminalsSentenced"
  | "contractsCompleted"
  | "totalDecisions"
  | "riotsQuelled"
  | "totalTicks"
  | "eventsResolved"
  | "researchUnlocked"
  | "officerMissionsCompleted";

export function readStat(state: GameState, key: ChallengeStatKey): number {
  switch (key) {
    case "criminalsSentenced": return state.player?.criminalsSentenced ?? 0;
    case "contractsCompleted": return state.player?.contractsCompleted ?? 0;
    case "totalDecisions": return state.player?.totalDecisions ?? 0;
    case "riotsQuelled": return state.player?.riotsQuelled ?? 0;
    case "totalTicks": return state.totalTicks ?? 0;
    case "eventsResolved": return (state.eventHistory ?? []).length;
    case "researchUnlocked": return (state.unlockedTechnologies ?? []).length;
    case "officerMissionsCompleted":
      return state.militaryOverhaul?.completedMissions ?? 0;
  }
}

// ── Templates ──────────────────────────────────────────────────────────────

export type ChallengeTemplate = {
  id: string;
  title: string;
  description: string;
  statKey: ChallengeStatKey;
  target: number;
  rewardCredits: number;
  rewardResearch: number;
};

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: "weekly_criminals_25",
    title: "JUSTICE QUOTA",
    description: "Sentence 25 criminals through the courts this week.",
    statKey: "criminalsSentenced",
    target: 25,
    rewardCredits: 12_000,
    rewardResearch: 3,
  },
  {
    id: "weekly_contracts_3",
    title: "PROCUREMENT DRIVE",
    description: "Complete 3 city contracts this week.",
    statKey: "contractsCompleted",
    target: 3,
    rewardCredits: 15_000,
    rewardResearch: 2,
  },
  {
    id: "weekly_decisions_50",
    title: "COMMAND CADENCE",
    description: "Issue 50 command decisions this week.",
    statKey: "totalDecisions",
    target: 50,
    rewardCredits: 10_000,
    rewardResearch: 4,
  },
  {
    id: "weekly_riots_2",
    title: "RIOT SUPPRESSION",
    description: "Quell 2 riots this week.",
    statKey: "riotsQuelled",
    target: 2,
    rewardCredits: 18_000,
    rewardResearch: 2,
  },
  {
    id: "weekly_ticks_200",
    title: "WATCHFUL EYE",
    description: "Govern the city for 200 ticks this week.",
    statKey: "totalTicks",
    target: 200,
    rewardCredits: 8_000,
    rewardResearch: 3,
  },
  {
    id: "weekly_events_8",
    title: "INCIDENT TRIAGE",
    description: "Resolve 8 events this week.",
    statKey: "eventsResolved",
    target: 8,
    rewardCredits: 11_000,
    rewardResearch: 3,
  },
  {
    id: "weekly_research_1",
    title: "TECH ACCELERATION",
    description: "Unlock 1 new technology this week.",
    statKey: "researchUnlocked",
    target: 1,
    rewardCredits: 14_000,
    rewardResearch: 2,
  },
  {
    id: "weekly_missions_2",
    title: "FIELD OPERATIONS",
    description: "Complete 2 officer missions this week.",
    statKey: "officerMissionsCompleted",
    target: 2,
    rewardCredits: 16_000,
    rewardResearch: 3,
  },
];

// ── Deterministic per (weekKey, slot) selection ────────────────────────────

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickTemplate(weekKey: string, saveSlot: number): ChallengeTemplate {
  const idx = hash(`${weekKey}:${saveSlot}`) % CHALLENGE_TEMPLATES.length;
  return CHALLENGE_TEMPLATES[idx];
}

// ── Public API ─────────────────────────────────────────────────────────────

export function createWeeklyChallenge(
  state: GameState,
  weekKey: string = isoWeekKey(),
  saveSlot: number = state.saveSlot ?? 1,
): WeeklyChallenge {
  const tpl = pickTemplate(weekKey, saveSlot);
  return {
    weekKey,
    templateId: tpl.id,
    statKey: tpl.statKey,
    baseline: readStat(state, tpl.statKey),
    target: tpl.target,
    claimed: false,
  };
}

export function refreshWeeklyChallenge(
  challenge: WeeklyChallenge | undefined,
  state: GameState,
  now: Date = new Date(),
): WeeklyChallenge {
  const week = isoWeekKey(now);
  if (!challenge || challenge.weekKey !== week) {
    return createWeeklyChallenge(state, week);
  }
  return challenge;
}

export function getProgress(challenge: WeeklyChallenge, state: GameState): number {
  const cur = readStat(state, challenge.statKey);
  return Math.max(0, cur - challenge.baseline);
}

export function isComplete(challenge: WeeklyChallenge, state: GameState): boolean {
  return getProgress(challenge, state) >= challenge.target;
}

export function getTemplate(challenge: WeeklyChallenge): ChallengeTemplate | null {
  return CHALLENGE_TEMPLATES.find((t) => t.id === challenge.templateId) ?? null;
}

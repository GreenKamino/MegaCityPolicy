// Daily login streak — small free-engagement system.
//
// Rules:
//   - A "day" is the player's local YYYY-MM-DD.
//   - Visiting the game updates `lastVisitedDay` but does NOT auto-claim
//     the bonus. Claim is an explicit action so the reward feels earned.
//   - Claim is available once per real-world day, while the city is loaded.
//   - If the player claims on a day exactly one after their last claim,
//     the streak increments. If they skip one or more days, it resets to 1.
//   - `longest` tracks the all-time max streak in this save.
//
// Reward scales with current streak, capped, deterministic.

import type { DailyStreak } from "@/engine/types";

export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayDiff(a: string, b: string): number {
  // Positive when b is after a. Both YYYY-MM-DD local dates.
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86_400_000);
}

export function createDefaultDailyStreak(): DailyStreak {
  return { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null };
}

export function refreshDailyVisit(streak: DailyStreak, today: string = todayKey()): DailyStreak {
  if (streak.lastVisitedDay === today) return streak;
  return { ...streak, lastVisitedDay: today };
}

export function isClaimAvailable(streak: DailyStreak, today: string = todayKey()): boolean {
  if (streak.lastClaimedDay === null) return true;
  if (streak.lastClaimedDay === today) return false;
  // Reject "available" if today is BEFORE the last claim (clock rollback / timezone shift).
  // Player must wait until real-world clock catches up past the last-claimed day.
  return dayDiff(streak.lastClaimedDay, today) > 0;
}

export type DailyReward = {
  credits: number;
  research: number;
  streakAfter: number;
  message: string;
};

export function computeDailyReward(streakAfter: number): DailyReward {
  // Modest, hand-tuned rewards. Cap streak bonus at day 14.
  const tier = Math.min(streakAfter, 14);
  const credits = 500 + tier * 250;          // day 1: 750 cr ... day 14+: 4000 cr
  const research = 1 + Math.floor(tier / 5); // day 1: 1 RP ... day 10+: 3 RP
  return {
    credits,
    research,
    streakAfter,
    message:
      streakAfter === 1
        ? "Daily check-in registered."
        : `Day ${streakAfter} streak — bonus rations approved.`,
  };
}

export function applyDailyClaim(
  streak: DailyStreak,
  today: string = todayKey(),
): { streak: DailyStreak; reward: DailyReward } {
  if (streak.lastClaimedDay === today) {
    // Already claimed — return current streak unchanged with a no-op-style reward
    // (caller should gate on isClaimAvailable; this keeps the function total).
    const reward = computeDailyReward(streak.current || 1);
    return { streak, reward: { ...reward, credits: 0, research: 0, message: "Already claimed today." } };
  }

  // Clock-rollback safety: if today is BEFORE the last-claimed day, refuse the
  // claim outright. We never move `lastClaimedDay` backwards — that would let a
  // player roll their device clock back and re-claim each prior date.
  if (streak.lastClaimedDay && dayDiff(streak.lastClaimedDay, today) < 0) {
    const reward = computeDailyReward(streak.current || 1);
    return {
      streak,
      reward: { ...reward, credits: 0, research: 0, message: "Clock rolled back — claim unavailable." },
    };
  }

  let newCurrent = 1;
  if (streak.lastClaimedDay) {
    const diff = dayDiff(streak.lastClaimedDay, today);
    if (diff === 1) newCurrent = streak.current + 1;
    else newCurrent = 1; // missed a day, reset
  }

  const next: DailyStreak = {
    current: newCurrent,
    longest: Math.max(streak.longest, newCurrent),
    lastClaimedDay: today,
    lastVisitedDay: today,
  };
  return { streak: next, reward: computeDailyReward(newCurrent) };
}

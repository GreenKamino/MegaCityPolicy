import { describe, expect, it } from "vitest";

import {
  applyDailyClaim,
  computeDailyReward,
  createDefaultDailyStreak,
  isClaimAvailable,
  refreshDailyVisit,
  todayKey,
} from "@/engine/dailyStreak";

describe("dailyStreak.todayKey", () => {
  it("formats a YYYY-MM-DD string", () => {
    const key = todayKey(new Date(2026, 0, 5));
    expect(key).toBe("2026-01-05");
  });

  it("zero-pads single-digit months/days", () => {
    expect(todayKey(new Date(2026, 8, 9))).toBe("2026-09-09");
  });
});

describe("dailyStreak.refreshDailyVisit", () => {
  it("returns the same object when already visited today", () => {
    const s = { ...createDefaultDailyStreak(), lastVisitedDay: "2026-04-29" };
    expect(refreshDailyVisit(s, "2026-04-29")).toBe(s);
  });

  it("stamps lastVisitedDay otherwise", () => {
    const s = createDefaultDailyStreak();
    expect(refreshDailyVisit(s, "2026-04-29").lastVisitedDay).toBe("2026-04-29");
  });
});

describe("dailyStreak.isClaimAvailable", () => {
  it("is true when not yet claimed today", () => {
    const s = { ...createDefaultDailyStreak(), lastClaimedDay: "2026-04-28" };
    expect(isClaimAvailable(s, "2026-04-29")).toBe(true);
  });

  it("is false when already claimed today", () => {
    const s = { ...createDefaultDailyStreak(), lastClaimedDay: "2026-04-29" };
    expect(isClaimAvailable(s, "2026-04-29")).toBe(false);
  });

  it("is false when the device clock has rolled back before lastClaimedDay", () => {
    const s = { ...createDefaultDailyStreak(), lastClaimedDay: "2026-04-29" };
    expect(isClaimAvailable(s, "2026-04-28")).toBe(false);
    expect(isClaimAvailable(s, "2025-12-31")).toBe(false);
  });
});

describe("dailyStreak.applyDailyClaim", () => {
  it("starts streak at 1 on first claim", () => {
    const out = applyDailyClaim(createDefaultDailyStreak(), "2026-04-29");
    expect(out.streak.current).toBe(1);
    expect(out.streak.longest).toBe(1);
    expect(out.streak.lastClaimedDay).toBe("2026-04-29");
    expect(out.reward.streakAfter).toBe(1);
    expect(out.reward.credits).toBeGreaterThan(0);
  });

  it("increments streak on consecutive day", () => {
    let s = createDefaultDailyStreak();
    s = applyDailyClaim(s, "2026-04-29").streak;
    s = applyDailyClaim(s, "2026-04-30").streak;
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
  });

  it("resets streak to 1 when a day was missed", () => {
    let s = createDefaultDailyStreak();
    s = applyDailyClaim(s, "2026-04-29").streak;
    s = applyDailyClaim(s, "2026-04-30").streak;
    s = applyDailyClaim(s, "2026-05-02").streak;
    expect(s.current).toBe(1);
    expect(s.longest).toBe(2);
  });

  it("is idempotent on the same day", () => {
    const first = applyDailyClaim(createDefaultDailyStreak(), "2026-04-29");
    const second = applyDailyClaim(first.streak, "2026-04-29");
    expect(second.streak).toEqual(first.streak);
    expect(second.reward.credits).toBe(0);
  });

  it("refuses to award rewards or move lastClaimedDay backwards on clock rollback", () => {
    const claimed = applyDailyClaim(createDefaultDailyStreak(), "2026-04-29").streak;
    expect(claimed.lastClaimedDay).toBe("2026-04-29");

    // Simulate the device clock rolling back to a prior day.
    const out = applyDailyClaim(claimed, "2026-04-28");
    expect(out.streak).toBe(claimed); // identity-preserved, no mutation
    expect(out.streak.lastClaimedDay).toBe("2026-04-29");
    expect(out.streak.current).toBe(1);
    expect(out.reward.credits).toBe(0);
    expect(out.reward.research).toBe(0);
    expect(out.reward.message).toMatch(/clock rolled back/i);
  });

  it("computeDailyReward caps streak bonus at day 14", () => {
    const r14 = computeDailyReward(14);
    const r99 = computeDailyReward(99);
    expect(r14.credits).toBe(r99.credits);
    expect(r14.research).toBe(r99.research);
  });
});

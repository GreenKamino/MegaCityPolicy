import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  CHALLENGE_TEMPLATES,
  createWeeklyChallenge,
  getProgress,
  getTemplate,
  isComplete,
  isoWeekKey,
  pickTemplate,
  readStat,
  refreshWeeklyChallenge,
} from "@/engine/weeklyChallenges";

describe("weeklyChallenges.isoWeekKey", () => {
  it("returns YYYY-Www format", () => {
    const key = isoWeekKey(new Date(Date.UTC(2026, 3, 29))); // April 29, 2026 = ISO 2026-W18
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("agrees on the same week for adjacent days", () => {
    const a = isoWeekKey(new Date(Date.UTC(2026, 3, 27))); // Mon
    const b = isoWeekKey(new Date(Date.UTC(2026, 3, 30))); // Thu
    expect(a).toBe(b);
  });
});

describe("weeklyChallenges.pickTemplate", () => {
  it("is deterministic for the same (week, slot)", () => {
    const a = pickTemplate("2026-W18", 1);
    const b = pickTemplate("2026-W18", 1);
    expect(a.id).toBe(b.id);
  });

  it("returns a valid template from the table", () => {
    const t = pickTemplate("2026-W18", 3);
    expect(CHALLENGE_TEMPLATES.some((x) => x.id === t.id)).toBe(true);
  });
});

describe("weeklyChallenges progress + completion", () => {
  it("snapshots baseline at creation so progress starts at 0", () => {
    const state = createInitialState();
    state.player.criminalsSentenced = 100;
    const challenge = createWeeklyChallenge(state, "2026-W18", 1);
    expect(getProgress(challenge, state)).toBe(0);
    expect(isComplete(challenge, state)).toBe(false);
  });

  it("counts deltas against the baseline", () => {
    const state = createInitialState();
    state.player.totalDecisions = 10;
    // Force a template we control by directly building a challenge
    const challenge = {
      weekKey: "2026-W18",
      templateId: "weekly_decisions_50",
      statKey: "totalDecisions" as const,
      baseline: 10,
      target: 50,
      claimed: false,
    };
    state.player.totalDecisions = 30;
    expect(getProgress(challenge, state)).toBe(20);
    state.player.totalDecisions = 60;
    expect(getProgress(challenge, state)).toBe(50);
    expect(isComplete(challenge, state)).toBe(true);
  });

  it("clamps progress to non-negative when stats reset", () => {
    const state = createInitialState();
    const challenge = {
      weekKey: "2026-W18",
      templateId: "weekly_decisions_50",
      statKey: "totalDecisions" as const,
      baseline: 100,
      target: 50,
      claimed: false,
    };
    state.player.totalDecisions = 5;
    expect(getProgress(challenge, state)).toBe(0);
  });

  it("getTemplate looks up the active template by id", () => {
    const state = createInitialState();
    const c = createWeeklyChallenge(state, "2026-W18", 1);
    const tpl = getTemplate(c);
    expect(tpl?.id).toBe(c.templateId);
  });
});

describe("weeklyChallenges.refreshWeeklyChallenge", () => {
  it("creates a new challenge when none exists", () => {
    const state = createInitialState();
    const c = refreshWeeklyChallenge(undefined, state);
    expect(c.weekKey).toBe(isoWeekKey());
    expect(c.target).toBeGreaterThan(0);
  });

  it("rolls over when the week changes", () => {
    const state = createInitialState();
    const old = createWeeklyChallenge(state, "2025-W01", 1);
    const refreshed = refreshWeeklyChallenge(old, state);
    expect(refreshed.weekKey).not.toBe(old.weekKey);
  });

  it("preserves the existing challenge within the same week", () => {
    const state = createInitialState();
    const cur = createWeeklyChallenge(state, isoWeekKey(), state.saveSlot ?? 1);
    const refreshed = refreshWeeklyChallenge(cur, state);
    expect(refreshed).toBe(cur);
  });
});

describe("weeklyChallenges.readStat", () => {
  it("never throws and returns numbers for every supported key", () => {
    const state = createInitialState();
    for (const tpl of CHALLENGE_TEMPLATES) {
      const v = readStat(state, tpl.statKey);
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

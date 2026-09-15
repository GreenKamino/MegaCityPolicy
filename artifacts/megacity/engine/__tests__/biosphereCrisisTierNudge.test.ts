import { describe, expect, it } from "vitest";

import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import { getBiosphereCrisisRisk } from "@/engine/wildlandsEcology";
import type { BiosphereCrisisRiskTier } from "@/engine/wildlandsEcology";
import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #365: the moment a player's nature-crisis risk improves to a new tier
// (HIGH -> EASING -> LOW), they should get ONE positive advisory. It must fire
// only on the improving transition, never repeat for the same tier, and use the
// SAME shared getBiosphereCrisisRisk ramp as the on-screen NATURE CRISIS RISK
// gauges. The last-seen tier is persisted on the game state so the nudge is
// idempotent across saves/reloads.
// ─────────────────────────────────────────────────────────────────────────────

const NUDGE_TITLES: Record<string, boolean> = {
  "NATURE CRISES EASING": true,
  "NATURE CRISES AT LOW RISK": true,
};

function nudgeMessages(s: GameState) {
  return (s.messages ?? []).filter((m) => NUDGE_TITLES[m.title]);
}

function riskWarnings(s: GameState) {
  return (s.newsFeed ?? []).filter((n) => n.id.startsWith("news-biosphere-risk-rising-"));
}

// Biosphere values chosen to land squarely inside each tier band per the shared
// ramp (high: <=32, easing: 33..66, low: >66). Assert the fixture, so a ramp
// change surfaces here instead of silently drifting the test.
function tierFor(bio: number): BiosphereCrisisRiskTier {
  return getBiosphereCrisisRisk(bio).tier;
}

describe("nature crisis tier improvement nudge", () => {
  it("fixtures sit in the expected tiers", () => {
    expect(tierFor(20)).toBe("high");
    expect(tierFor(50)).toBe("easing");
    expect(tierFor(90)).toBe("low");
  });

  it("fires a single easing advisory when risk improves high -> easing", () => {
    const s = createInitialState();
    s.lastSeenBiosphereCrisisTier = "high";
    s.cityStats.biosphere = 50; // easing tier

    const { newState } = runTick(s);

    const nudges = nudgeMessages(newState);
    expect(nudges.length).toBe(1);
    expect(nudges[0].title).toBe("NATURE CRISES EASING");
    expect(newState.lastSeenBiosphereCrisisTier).toBe("easing");
  });

  it("does not repeat the nudge on subsequent ticks at the same tier", () => {
    let s = createInitialState();
    s.lastSeenBiosphereCrisisTier = "high";
    s.cityStats.biosphere = 50;

    s = runTick(s).newState;
    expect(nudgeMessages(s).length).toBe(1);

    // Keep the biosphere pinned in the easing band across several more ticks.
    for (let i = 0; i < 5; i++) {
      s.cityStats.biosphere = 50;
      s = runTick(s).newState;
    }
    expect(nudgeMessages(s).length).toBe(1);
  });

  it("fires again for a NEW improving tier (easing -> low)", () => {
    let s = createInitialState();
    s.lastSeenBiosphereCrisisTier = "easing";
    s.cityStats.biosphere = 90; // low tier

    s = runTick(s).newState;
    const nudges = nudgeMessages(s);
    expect(nudges.length).toBe(1);
    expect(nudges[0].title).toBe("NATURE CRISES AT LOW RISK");
    expect(s.lastSeenBiosphereCrisisTier).toBe("low");
  });

  it("does not fire on degradation, but still records the worsened tier", () => {
    const s = createInitialState();
    s.lastSeenBiosphereCrisisTier = "low";
    s.cityStats.biosphere = 20; // dropped back to high tier

    const { newState } = runTick(s);
    expect(nudgeMessages(newState).length).toBe(0);
    expect(newState.lastSeenBiosphereCrisisTier).toBe("high");
  });

  it("puts a ticker warning on the first transition into a worse risk tier", () => {
    const s = createInitialState();
    s.lastSeenBiosphereCrisisTier = "low";
    s.cityStats.biosphere = 50; // easing tier

    const { newState } = runTick(s);

    expect(riskWarnings(newState)).toHaveLength(1);
    expect(riskWarnings(newState)[0].headline).toContain("NATURE CRISIS RISK RISING");
  });

  it("does not repeat the ticker warning while the risk tier is unchanged", () => {
    let s = createInitialState();
    s.lastSeenBiosphereCrisisTier = "low";
    s.cityStats.biosphere = 50;

    s = runTick(s).newState;
    s.cityStats.biosphere = 50;
    s = runTick(s).newState;

    expect(riskWarnings(s)).toHaveLength(1);
  });

  it("uses the stronger warning when risk enters the highest crisis band", () => {
    const s = createInitialState();
    s.lastSeenBiosphereCrisisTier = "low";
    s.cityStats.biosphere = 20; // high tier

    const { newState } = runTick(s);

    expect(riskWarnings(newState)).toHaveLength(1);
    expect(riskWarnings(newState)[0].headline).toContain("NATURE CRISIS RISK HIGH");
  });

  it("does not fire when the tier is unchanged", () => {
    const s = createInitialState();
    s.lastSeenBiosphereCrisisTier = "easing";
    s.cityStats.biosphere = 50; // still easing

    const { newState } = runTick(s);
    expect(nudgeMessages(newState).length).toBe(0);
    expect(newState.lastSeenBiosphereCrisisTier).toBe("easing");
  });

  it("advisory copy carries no emojis or exclamation marks", () => {
    const s = createInitialState();
    s.lastSeenBiosphereCrisisTier = "high";
    s.cityStats.biosphere = 90; // jump straight to low tier

    const { newState } = runTick(s);
    const nudges = nudgeMessages(newState);
    expect(nudges.length).toBe(1);
    for (const m of nudges) {
      expect(m.title).not.toMatch(/!/);
      expect(m.body).not.toMatch(/!/);
      // No emoji / non-ASCII pictographs in the player-facing copy.
      expect(m.title).toMatch(/^[\x00-\x7F]*$/);
      expect(m.body).toMatch(/^[\x00-\x7F]*$/);
    }
  });
});

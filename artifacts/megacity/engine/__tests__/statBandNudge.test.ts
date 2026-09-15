import { describe, expect, it } from "vitest";

import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import { emitStatBandImprovements } from "@/engine/tickProcessors";
import {
  rankForStat,
  computeStatBandRank,
  STAT_WIN_BAND_BY_KEY,
} from "@/engine/statWinBands";
import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #367: when a tracked high-signal stat (crime, happiness) crosses into a
// healthier band, the player should get ONE positive advisory. It must fire only
// on the improving transition, never repeat for the same band, and stay
// idempotent across saves via a durable per-stat last-seen band rank. Mirrors the
// biosphere-crisis-tier nudge (Task #365) but with a rank scale where 0 is the
// worst band and 2 is the best band regardless of stat direction.
// ─────────────────────────────────────────────────────────────────────────────

const NUDGE_TITLES: Record<string, boolean> = {
  "CRIME EASING": true,
  "CRIME UNDER CONTROL": true,
  "MORALE RECOVERING": true,
  "MORALE HIGH": true,
};

function nudgeMessages(s: GameState) {
  return (s.messages ?? []).filter((m) => NUDGE_TITLES[m.title]);
}

describe("stat band improvement nudge", () => {
  it("ranks a lower-is-better stat with the best band at low values", () => {
    // crime edges [35, 65], lower is better.
    expect(rankForStat(20, [35, 65], false)).toBe(2);
    expect(rankForStat(50, [35, 65], false)).toBe(1);
    expect(rankForStat(80, [35, 65], false)).toBe(0);
  });

  it("ranks a higher-is-better stat with the best band at high values", () => {
    // happiness edges [35, 65], higher is better.
    expect(rankForStat(80, [35, 65], true)).toBe(2);
    expect(rankForStat(50, [35, 65], true)).toBe(1);
    expect(rankForStat(20, [35, 65], true)).toBe(0);
  });

  it("fires a single crime advisory when crime improves worst -> mid", () => {
    const s = createInitialState();
    s.lastSeenCrimeBandRank = 0;
    s.cityStats.crime = 50; // mid band (rank 1)

    emitStatBandImprovements(s);

    const nudges = nudgeMessages(s);
    expect(nudges.length).toBe(1);
    expect(nudges[0].title).toBe("CRIME EASING");
    expect(s.lastSeenCrimeBandRank).toBe(1);
  });

  it("fires the low-crime advisory when crime jumps worst -> best", () => {
    const s = createInitialState();
    s.lastSeenCrimeBandRank = 0;
    s.cityStats.crime = 20; // best band (rank 2)

    emitStatBandImprovements(s);

    const nudges = nudgeMessages(s);
    expect(nudges.length).toBe(1);
    expect(nudges[0].title).toBe("CRIME UNDER CONTROL");
    expect(s.lastSeenCrimeBandRank).toBe(2);
  });

  it("does not repeat the nudge on subsequent calls at the same band", () => {
    const s = createInitialState();
    s.lastSeenCrimeBandRank = 0;
    s.cityStats.crime = 50;

    emitStatBandImprovements(s);
    expect(nudgeMessages(s).length).toBe(1);

    for (let i = 0; i < 5; i++) {
      s.cityStats.crime = 50; // pinned in the mid band
      emitStatBandImprovements(s);
    }
    expect(nudgeMessages(s).length).toBe(1);
  });

  it("fires again for a NEW improving band (mid -> best)", () => {
    const s = createInitialState();
    s.lastSeenCrimeBandRank = 1;
    s.cityStats.crime = 20; // best band

    emitStatBandImprovements(s);
    const nudges = nudgeMessages(s);
    expect(nudges.length).toBe(1);
    expect(nudges[0].title).toBe("CRIME UNDER CONTROL");
    expect(s.lastSeenCrimeBandRank).toBe(2);
  });

  it("does not fire on degradation, but still records the worsened band", () => {
    const s = createInitialState();
    s.lastSeenCrimeBandRank = 2;
    s.cityStats.crime = 80; // dropped back to the worst band

    emitStatBandImprovements(s);
    expect(nudgeMessages(s).length).toBe(0);
    expect(s.lastSeenCrimeBandRank).toBe(0);
  });

  it("does not fire when the band is unchanged", () => {
    const s = createInitialState();
    s.lastSeenCrimeBandRank = 1;
    s.cityStats.crime = 50; // still mid

    emitStatBandImprovements(s);
    expect(nudgeMessages(s).length).toBe(0);
    expect(s.lastSeenCrimeBandRank).toBe(1);
  });

  it("records the current band without firing on an unseeded save", () => {
    const s = createInitialState();
    // Simulate a legacy/malformed save whose fields never got backfilled.
    s.lastSeenCrimeBandRank = undefined;
    s.cityStats.crime = 20; // already in the best band

    emitStatBandImprovements(s);
    expect(nudgeMessages(s).length).toBe(0);
    expect(s.lastSeenCrimeBandRank).toBe(2);
  });

  it("celebrates the higher-is-better happiness stat when it climbs", () => {
    const s = createInitialState();
    s.lastSeenHappinessBandRank = 0;
    s.cityStats.happiness = 80; // best band (rank 2)

    emitStatBandImprovements(s);
    const nudges = nudgeMessages(s);
    expect(nudges.length).toBe(1);
    expect(nudges[0].title).toBe("MORALE HIGH");
    expect(s.lastSeenHappinessBandRank).toBe(2);
  });

  it("advisory copy carries no emojis or exclamation marks", () => {
    const s = createInitialState();
    s.lastSeenCrimeBandRank = 0;
    s.lastSeenHappinessBandRank = 0;
    s.cityStats.crime = 20; // best crime band
    s.cityStats.happiness = 80; // best happiness band

    emitStatBandImprovements(s);
    const nudges = nudgeMessages(s);
    expect(nudges.length).toBe(2);
    for (const m of nudges) {
      expect(m.title).not.toMatch(/!/);
      expect(m.body).not.toMatch(/!/);
      // No emoji / non-ASCII pictographs in the player-facing copy.
      expect(m.title).toMatch(/^[\x00-\x7F]*$/);
      expect(m.body).toMatch(/^[\x00-\x7F]*$/);
    }
  });

  it("a fresh city is seeded to its current band so no seed-mismatch win can fire", () => {
    const s = createInitialState();
    // Seeding each last-seen band to the fresh city's CURRENT band is what
    // prevents a spurious win on the first tick (a mismatch would look like an
    // instant improvement).
    expect(s.lastSeenCrimeBandRank).toBe(
      computeStatBandRank(s.cityStats, STAT_WIN_BAND_BY_KEY.crime),
    );
    expect(s.lastSeenHappinessBandRank).toBe(
      computeStatBandRank(s.cityStats, STAT_WIN_BAND_BY_KEY.happiness),
    );

    // With the seed matching the current band, a plain call fires nothing.
    emitStatBandImprovements(s);
    expect(nudgeMessages(s).length).toBe(0);
  });

  it("wires through runTick: a crossed band fires during a real tick", () => {
    const s = createInitialState();
    s.lastSeenCrimeBandRank = 0; // pretend crime was in the worst band last seen
    s.cityStats.crime = 5; // deep in the best band; one tick cannot lift it past 35

    const { newState } = runTick(s);
    const nudges = nudgeMessages(newState);
    expect(nudges.length).toBe(1);
    expect(nudges[0].title).toBe("CRIME UNDER CONTROL");
    expect(newState.lastSeenCrimeBandRank).toBe(2);
  });
});

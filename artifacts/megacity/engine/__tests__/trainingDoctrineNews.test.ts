/**
 * Training-doctrine news & near-expiry advisory (Task #534).
 *
 * Contract under test:
 *   - Enacting the Accelerated Training Doctrine produces a THEMED
 *     "barracks run hot" news item (builder-level: GameContext picks
 *     trainingDoctrineEnactedNews for this edict id).
 *   - When the active doctrine reaches exactly
 *     TRAINING_DOCTRINE_WINDDOWN_TICKS remaining (after the per-tick
 *     decrement), runTick emits ONE inbox advisory with a stable id
 *     prefixed TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX — and never again
 *     for the same activation, across subsequent ticks.
 *   - At expiry the news feed gets the THEMED "barracks stand down"
 *     lapse line instead of the generic edict-lapsed copy; other edicts
 *     keep the generic line.
 *   - The whole flow is driven through full runTick calls so real-time,
 *     turn-based and offline catch-up behave identically.
 */

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX,
  TRAINING_DOCTRINE_WINDDOWN_TICKS,
  TRAINING_EDICT_ID,
} from "@/engine/pendingConstruction";
import {
  trainingDoctrineEnactedNews,
  trainingDoctrineLapsedNews,
} from "@/engine/newsFeed";
import { getEdictById } from "@/engine/edicts";
import type { GameState } from "@/engine/types";

function withDoctrine(state: GameState, ticksRemaining: number): GameState {
  return {
    ...state,
    resources: { ...state.resources, credits: 10_000_000 },
    activeEdicts: [
      ...(state.activeEdicts ?? []),
      {
        edictId: TRAINING_EDICT_ID,
        ticksRemaining,
        issuedAtTick: state.totalTicks,
        cooldownUntilTick: 0,
      },
    ],
  };
}

function winddownMessages(state: GameState) {
  return (state.messages ?? []).filter((m) =>
    m.id.startsWith(TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX),
  );
}

describe("training doctrine winding-down advisory (Task #534)", () => {
  it("fires exactly once across the full doctrine lifetime, at the winddown threshold", () => {
    let s = withDoctrine(createInitialState(), 5);
    let firedAtRemaining: number | null = null;

    // Run the doctrine all the way to expiry plus a few extra ticks.
    for (let i = 0; i < 8; i++) {
      const before = winddownMessages(s).length;
      s = runTick(s).newState;
      const after = winddownMessages(s).length;
      if (after > before) {
        expect(after - before).toBe(1);
        const inst = (s.activeEdicts ?? []).find((ae) => ae.edictId === TRAINING_EDICT_ID);
        firedAtRemaining = inst?.ticksRemaining ?? -1;
      }
    }

    // Exactly one advisory in the inbox at the end of the run.
    const msgs = winddownMessages(s);
    expect(msgs).toHaveLength(1);
    // It fired on the tick that left exactly the winddown count remaining.
    expect(firedAtRemaining).toBe(TRAINING_DOCTRINE_WINDDOWN_TICKS);
    // Message contract the ticker echo and inbox rely on.
    expect(msgs[0].title).toBe("TRAINING DOCTRINE WINDING DOWN");
    expect(msgs[0].body).toContain("Accelerated Training Doctrine");
    expect(msgs[0].body).toContain(`${TRAINING_DOCTRINE_WINDDOWN_TICKS} ticks`);
    expect(msgs[0].category).toBe("alert");
    // Doctrine itself is gone (expired) by the end of the run.
    expect((s.activeEdicts ?? []).some((ae) => ae.edictId === TRAINING_EDICT_ID)).toBe(false);
  });

  it("does not fire when a save resumes below the threshold (no repeat spam across saves)", () => {
    // Simulates loading a save made AFTER the advisory tick: the instance
    // is already under the threshold, so no second advisory may appear.
    let s = withDoctrine(createInitialState(), TRAINING_DOCTRINE_WINDDOWN_TICKS);
    for (let i = 0; i < 4; i++) {
      s = runTick(s).newState;
    }
    expect(winddownMessages(s)).toHaveLength(0);
  });

  it("a fresh activation later fires its own advisory (once per activation)", () => {
    let s = withDoctrine(createInitialState(), 4);
    for (let i = 0; i < 6; i++) s = runTick(s).newState;
    expect(winddownMessages(s)).toHaveLength(1);

    // Re-issue the doctrine (cooldown cleared for the test) and run again.
    s = withDoctrine({ ...s, edictCooldowns: {} }, 4);
    for (let i = 0; i < 6; i++) s = runTick(s).newState;
    expect(winddownMessages(s)).toHaveLength(2);
  });
});

describe("themed doctrine news lines (Task #534)", () => {
  it("expiry pushes the themed 'barracks stand down' lapse line, not the generic copy", () => {
    let s = withDoctrine(createInitialState(), 2);
    for (let i = 0; i < 3; i++) s = runTick(s).newState;

    const lapse = (s.newsFeed ?? []).filter((n) =>
      n.id.startsWith(`news-edict-lapse-${TRAINING_EDICT_ID}-`),
    );
    expect(lapse).toHaveLength(1);
    expect(lapse[0].headline).toContain("BARRACKS STAND DOWN");
    expect(lapse[0].headline).toContain("ACCELERATED TRAINING DOCTRINE LAPSES");
    // The reminder that new orders train slower is part of the copy.
    expect(lapse[0].headline).toContain("STANDARD DRILL SCHEDULE");
  });

  it("other edicts keep the generic lapse copy", () => {
    const base = createInitialState();
    const other = { ...base, resources: { ...base.resources, credits: 10_000_000 } };
    let s: GameState = {
      ...other,
      activeEdicts: [
        {
          edictId: "open_records_initiative",
          ticksRemaining: 1,
          issuedAtTick: other.totalTicks,
          cooldownUntilTick: 0,
        },
      ],
    };
    expect(getEdictById("open_records_initiative")).toBeDefined();
    s = runTick(s).newState;

    const lapse = (s.newsFeed ?? []).filter((n) =>
      n.id.startsWith("news-edict-lapse-open_records_initiative-"),
    );
    expect(lapse).toHaveLength(1);
    expect(lapse[0].headline).toContain("HAS RUN ITS COURSE");
    expect(lapse[0].headline).not.toContain("BARRACKS");
  });

  it("builders share the generic id schemes and follow the ticker copy rules", () => {
    const s = createInitialState();
    const enact = trainingDoctrineEnactedNews(s, TRAINING_EDICT_ID);
    const lapse = trainingDoctrineLapsedNews(s, TRAINING_EDICT_ID);

    // Same id scheme as the generic builders → pushNewsItem idempotency
    // holds no matter which builder an emission site picks.
    expect(enact.id).toBe(`news-edict-enact-${TRAINING_EDICT_ID}-${s.totalTicks}`);
    expect(lapse.id).toBe(`news-edict-lapse-${TRAINING_EDICT_ID}-${s.totalTicks}`);

    expect(enact.headline).toContain("BARRACKS RUN HOT");
    for (const h of [enact.headline, lapse.headline]) {
      expect(h).not.toMatch(/!/);
      expect(h).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(h).toBe(h.toUpperCase());
    }
  });
});

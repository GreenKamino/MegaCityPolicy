import { describe, expect, it } from "vitest";

import {
  emitProsperityGateHint,
  emitProsperityGateRecoveryNews,
} from "@/engine/tickProcessors";
import { prosperityGateBlock } from "@/engine/prosperityTriggers";
import { runLiveTick } from "@/engine/liveTickPipeline";
import { createInitialState } from "@/engine/initialState";
import type { GameMessage, GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #552: a city that clears every core thriving bar but is blocked ONLY by
// the biosphere floor (< 30) or the housing-pressure cap (> 65) gets ONE
// advisor hint explaining what holds the golden-age coverage back. These tests
// pin four things:
//   1. Detection: prosperityGateBlock names the blocking term(s) and stays
//      null when a core bar fails or the city is fully thriving.
//   2. The full tick path (runLiveTick) delivers the hint exactly once, and
//      the durable flag keeps it from ever repeating.
//   3. The copy names the right fix per blocker and follows house rules
//      (no emojis, no exclamation marks).
//   4. The idempotency flag is seeded in the fresh state.
// ─────────────────────────────────────────────────────────────────────────────

// Core bars all pass; biosphere stays at the fresh-city 20 (blocked) unless
// overridden; housing pressure low unless overridden.
function coreBarsMetState(overrides: Partial<GameState["cityStats"]> = {}): GameState {
  const base = createInitialState();
  return {
    ...base,
    hasCompletedOnboarding: true,
    totalTicks: 500,
    cityStats: {
      ...base.cityStats,
      employment: 92,
      happiness: 82,
      unrest: 5,
      crime: 8,
      corruption: 10,
      ...overrides,
    },
    resources: { ...base.resources, credits: 120000, food: 400 },
    activeEvents: [],
    eventHistory: [],
  };
}

function hintMessages(s: GameState): GameMessage[] {
  return (s.messages ?? []).filter((m) => m.id.startsWith("prosperity-gate-hint-"));
}

describe("prosperityGateBlock detection", () => {
  it("names the biosphere as the blocker for an eco-neglected city", () => {
    // Fresh-city biosphere is 20, below the 30 floor.
    const block = prosperityGateBlock(coreBarsMetState());
    expect(block).toEqual({ biosphereBlocked: true, housingBlocked: false });
  });

  it("names housing as the blocker for an overcrowded city", () => {
    const block = prosperityGateBlock(
      coreBarsMetState({ biosphere: 70, housingPressure: 80 }),
    );
    expect(block).toEqual({ biosphereBlocked: false, housingBlocked: true });
  });

  it("names both when both terms fail", () => {
    const block = prosperityGateBlock(
      coreBarsMetState({ biosphere: 20, housingPressure: 80 }),
    );
    expect(block).toEqual({ biosphereBlocked: true, housingBlocked: true });
  });

  it("stays null when a core bar also fails, or when the city is thriving", () => {
    // Unrest 40 misses the <= 25 bar: the city is not "one fix away", so no hint.
    expect(prosperityGateBlock(coreBarsMetState({ unrest: 40 }))).toBeNull();
    // Fully thriving: nothing blocked, nothing to explain.
    expect(
      prosperityGateBlock(coreBarsMetState({ biosphere: 70, housingPressure: 10 })),
    ).toBeNull();
  });
});

describe("one-time hint through the real tick path", () => {
  it("fires exactly once and never repeats on later ticks", () => {
    let state = coreBarsMetState();
    expect(state.prosperityGateHintShown).toBe(false);

    state = runLiveTick(state).state;
    const afterFirst = hintMessages(state);
    expect(afterFirst).toHaveLength(1);
    expect(state.prosperityGateHintShown).toBe(true);

    // The blocking condition persists (no stewardship buildings), but the
    // durable flag keeps the hint from repeating.
    for (let i = 0; i < 3; i++) {
      state = runLiveTick(state).state;
    }
    expect(hintMessages(state)).toHaveLength(1);
  });

  it("does not fire for a city that is short on a core bar", () => {
    const result = runLiveTick(coreBarsMetState({ unrest: 40, happiness: 40 }));
    expect(hintMessages(result.state)).toHaveLength(0);
    expect(result.state.prosperityGateHintShown).toBe(false);
  });
});

describe("hint copy per blocker", () => {
  function emitOn(s: GameState): GameMessage {
    emitProsperityGateHint(s);
    const msgs = hintMessages(s);
    expect(msgs).toHaveLength(1);
    return msgs[0];
  }

  it("points at wildlands stewardship when the biosphere blocks", () => {
    const msg = emitOn(coreBarsMetState());
    expect(msg.id).toContain("-biosphere-");
    expect(msg.body).toContain("wildlands stewardship");
    expect(msg.body).not.toContain("housing");
  });

  it("points at housing when housing pressure blocks", () => {
    const msg = emitOn(coreBarsMetState({ biosphere: 70, housingPressure: 80 }));
    expect(msg.id).toContain("-housing-");
    expect(msg.body).toContain("housing");
    expect(msg.body).not.toContain("stewardship");
  });

  it("names both fixes when both terms block", () => {
    const msg = emitOn(coreBarsMetState({ biosphere: 20, housingPressure: 80 }));
    expect(msg.id).toContain("-both-");
    expect(msg.body).toContain("wildlands stewardship");
    expect(msg.body).toContain("housing");
  });

  it("follows house copy rules: ASCII only, no exclamation marks", () => {
    const variants = [
      coreBarsMetState(),
      coreBarsMetState({ biosphere: 70, housingPressure: 80 }),
      coreBarsMetState({ biosphere: 20, housingPressure: 80 }),
    ];
    for (const s of variants) {
      const msg = emitOn(s);
      const copy = `${msg.title} ${msg.body}`;
      expect(copy.includes("!"), `hint copy contains an exclamation mark`).toBe(false);
      // eslint-disable-next-line no-control-regex
      expect(/^[\x00-\x7F]*$/.test(copy), `hint copy contains non-ASCII`).toBe(true);
    }
  });
});

describe("durable flag seeding", () => {
  it("the fresh state seeds the hint as unshown", () => {
    expect(createInitialState().prosperityGateHintShown).toBe(false);
  });

  it("a fresh city cannot fire the hint before it earns the core bars", () => {
    // The starting city misses employment/happiness/unrest by design, so a new
    // player never sees this hint on tick one.
    expect(prosperityGateBlock(createInitialState())).toBeNull();
  });
});

describe("golden-age recovery news", () => {
  it("celebrates once after the announced coverage blocker clears", () => {
    const state = coreBarsMetState();
    emitProsperityGateHint(state);
    expect(state.prosperityGateHintShown).toBe(true);
    expect(state.prosperityGateRecoveryCelebrated).toBe(false);

    state.cityStats = {
      ...state.cityStats,
      biosphere: 70,
      housingPressure: 20,
    };
    emitProsperityGateRecoveryNews(state);
    expect(state.prosperityGateRecoveryCelebrated).toBe(true);
    expect(state.newsFeed?.filter((item) => item.id.startsWith("news-golden-age-recovery-"))).toHaveLength(1);
    expect(state.newsFeed?.[0].headline).toContain("GOLDEN-AGE COVERAGE CLEARED");

    emitProsperityGateRecoveryNews(state);
    expect(state.newsFeed?.filter((item) => item.id.startsWith("news-golden-age-recovery-"))).toHaveLength(1);
  });

  it("does not celebrate before the coverage hold was announced", () => {
    const state = coreBarsMetState({ biosphere: 70, housingPressure: 20 });
    emitProsperityGateRecoveryNews(state);
    expect(state.prosperityGateRecoveryCelebrated).toBe(false);
    expect(state.newsFeed?.some((item) => item.id.startsWith("news-golden-age-recovery-")) ?? false).toBe(false);
  });
});

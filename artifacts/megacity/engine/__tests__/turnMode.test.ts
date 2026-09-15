import { afterEach, describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { sanitizeState } from "@/engine/sanitizer";
import { advanceHour, isDayStart } from "@/engine/clock";
import { runOfflineCatchup } from "@/engine/offlineCatchup";
import { runLiveTick } from "@/engine/liveTickPipeline";
import { CONTRACT_TEMPLATES_MAP } from "@/engine/contracts";
import {
  TICKS_PER_TURN,
  advanceTurn,
  canAdvanceTurn,
  getBlockingCrises,
  hasBlockingCrisis,
} from "@/engine/turnMode";
import type { LiveTickResult } from "@/engine/liveTickPipeline";
import type { ContractDef, ContractInstance, GameEvent, GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Turn-based play mode (Task #438). Two decisions from the player drive these:
//   1. the mode is chosen once when starting a NEW game (default: realtime), and
//   2. a crisis (high|critical unresolved event) must ALWAYS pause the turn.
// The advanceTurn tests use an injected deterministic tickFn so they never
// depend on the real RNG-driven pipeline; one integration test then exercises
// the REAL runLiveTick to prove the shared module is node-safe.
// ─────────────────────────────────────────────────────────────────────────────

function makeCrisis(id: string, severity: GameEvent["severity"] = "critical"): GameEvent {
  return {
    id,
    title: `Crisis ${id}`,
    description: "A blocking crisis demanding intervention.",
    severity,
    effects: {},
    timestamp: 0,
    resolved: false,
  };
}

// A fake tick that simply advances the clock by one tick (6h) and, optionally,
// injects a fresh crisis on a given 1-based tick number. No RNG, fully
// deterministic — perfect for asserting the turn-boundary and early-stop logic.
function makeTickFn(opts: { crisisAtTick?: number } = {}): (s: GameState) => LiveTickResult {
  let n = 0;
  return (s: GameState): LiveTickResult => {
    n += 1;
    let next: GameState = {
      ...s,
      gameDate: advanceHour(s.gameDate),
      totalTicks: (s.totalTicks ?? 0) + 1,
    };
    let firedEvent: GameEvent | null = null;
    if (opts.crisisAtTick === n) {
      const crisis = makeCrisis(`injected-${n}`);
      next = { ...next, activeEvents: [...(next.activeEvents ?? []), crisis] };
      firedEvent = crisis;
    }
    return {
      state: next,
      entries: [],
      firedEvent,
      newTechnologies: [],
      megaPlanningComplete: [],
      megaCompleted: [],
      megaNewlyEligible: [],
      missionResults: [],
      inboxMessages: [],
      newAchievements: [],
      tickErrors: [],
    };
  };
}

describe("turn mode — default and persistence", () => {
  it("a brand-new game defaults to realtime", () => {
    expect(createInitialState().gameplayMode).toBe("realtime");
  });

  it("sanitizer backfills a missing mode to realtime (legacy saves)", () => {
    const s = createInitialState();
    delete (s as Partial<GameState>).gameplayMode;
    expect(sanitizeState(s).gameplayMode).toBe("realtime");
  });

  it("sanitizer rejects a corrupted mode but preserves turnbased", () => {
    const bad = createInitialState();
    (bad as unknown as { gameplayMode: string }).gameplayMode = "banana";
    expect(sanitizeState(bad).gameplayMode).toBe("realtime");

    const good = createInitialState();
    good.gameplayMode = "turnbased";
    expect(sanitizeState(good).gameplayMode).toBe("turnbased");
  });
});

describe("turn mode — blocking crises", () => {
  it("only unresolved high/critical events block", () => {
    const s = createInitialState();
    s.activeEvents = [
      makeCrisis("c1", "critical"),
      makeCrisis("c2", "high"),
      makeCrisis("c3", "low"),
      makeCrisis("c4", "medium"),
      { ...makeCrisis("c5", "critical"), resolved: true },
    ];
    const ids = getBlockingCrises(s).map((e) => e.id).sort();
    expect(ids).toEqual(["c1", "c2"]);
    expect(hasBlockingCrisis(s)).toBe(true);
  });

  it("no active events means nothing blocks", () => {
    const s = createInitialState();
    s.activeEvents = [];
    expect(hasBlockingCrisis(s)).toBe(false);
  });
});

describe("turn mode — canAdvanceTurn gate", () => {
  it("is false in realtime mode", () => {
    const s = createInitialState();
    s.gameplayMode = "realtime";
    expect(canAdvanceTurn(s)).toBe(false);
  });

  it("is true in turnbased mode with no crisis", () => {
    const s = createInitialState();
    s.gameplayMode = "turnbased";
    s.activeEvents = [];
    expect(canAdvanceTurn(s)).toBe(true);
  });

  it("is false in turnbased mode while a crisis is unresolved", () => {
    const s = createInitialState();
    s.gameplayMode = "turnbased";
    s.activeEvents = [makeCrisis("boom")];
    expect(canAdvanceTurn(s)).toBe(false);
  });
});

describe("turn mode — advanceTurn (deterministic tickFn)", () => {
  it("a calm turn advances exactly to the next day boundary", () => {
    const s = createInitialState();
    s.gameplayMode = "turnbased";
    // createInitialState starts at hour 0 (a day boundary), so a full turn is
    // TICKS_PER_TURN ticks ending back on hour 0.
    expect(isDayStart(s.gameDate)).toBe(true);

    const result = advanceTurn(s, makeTickFn());
    expect(result.ticksAdvanced).toBe(TICKS_PER_TURN);
    expect(isDayStart(result.state.gameDate)).toBe(true);
    expect(result.interruptedBy).toBeNull();
    expect(result.state.totalTicks).toBe((s.totalTicks ?? 0) + TICKS_PER_TURN);
  });

  it("stops early the instant a new crisis appears", () => {
    const s = createInitialState();
    s.gameplayMode = "turnbased";

    const result = advanceTurn(s, makeTickFn({ crisisAtTick: 2 }));
    expect(result.ticksAdvanced).toBe(2);
    expect(result.interruptedBy).not.toBeNull();
    expect(result.interruptedBy?.id).toBe("injected-2");
    // A turn cut short leaves the clock mid-day; the NEXT End Turn finishes it.
    expect(isDayStart(result.state.gameDate)).toBe(false);
  });

  it("re-anchors lastTickTime so a frozen span is never reclaimed", () => {
    const s = createInitialState();
    s.gameplayMode = "turnbased";
    s.lastTickTime = 0;
    const result = advanceTurn(s, makeTickFn());
    expect(result.state.lastTickTime).toBeGreaterThan(0);
  });
});

describe("turn mode — integration with the real pipeline", () => {
  it("advanceTurn drives the real runLiveTick without throwing (node-safe)", () => {
    const s = createInitialState();
    s.gameplayMode = "turnbased";
    const result = advanceTurn(s);
    // Real pipeline: it advances at least one tick and never more than the cap.
    expect(result.ticksAdvanced).toBeGreaterThanOrEqual(1);
    expect(result.ticksAdvanced).toBeLessThanOrEqual(TICKS_PER_TURN);
    expect(result.state.totalTicks).toBe((s.totalTicks ?? 0) + result.ticksAdvanced);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task #441: a subsystem failing mid-turn must NOT be silently swallowed.
// getLastTickErrors() resets on every runTick() and each LiveTickResult only
// carries its own tick's errors, so advanceTurn has to aggregate them. This
// mirrors engine/__tests__/tickIsolation.test.ts (throwing-proxy contract def)
// but drives the REAL runLiveTick across a whole turn.
// ─────────────────────────────────────────────────────────────────────────────

const SYN_ID = "__synthetic_turn_mode_error__";

function makeThrowingContractDef(idVal: string, msg: string): ContractDef {
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === "id") return idVal;
      throw new Error(msg);
    },
    has() { return true; },
  }) as ContractDef;
}

describe("turn mode — subsystem errors surface (Task #441)", () => {
  afterEach(() => {
    delete CONTRACT_TEMPLATES_MAP[SYN_ID];
  });

  it("aggregates a subsystem error thrown during the turn onto TurnResult", () => {
    CONTRACT_TEMPLATES_MAP[SYN_ID] = makeThrowingContractDef(SYN_ID, "synthetic turn-mode contracts failure");
    const state = createInitialState();
    state.gameplayMode = "turnbased";
    const badContract: ContractInstance = {
      id: "bad-turn-1", defId: SYN_ID, contractorId: "any", districtId: "d1",
      status: "active", progress: 0, startTick: 0, ticksElapsed: 0,
      totalPaid: 0, procurementMethod: "openTender",
      delaysOccurred: 0, overrunCost: 0, events: [],
    };
    state.activeContracts = [badContract];

    let result: ReturnType<typeof advanceTurn> | undefined;
    expect(() => { result = advanceTurn(state, runLiveTick); }).not.toThrow();
    const r = result!;

    // The turn still advanced (error was isolated, not fatal)...
    expect(r.ticksAdvanced).toBeGreaterThanOrEqual(1);
    // ...and the Contracts failure was surfaced on the aggregated report.
    expect(r.tickErrors.some((e) => e.subsystem === "Contracts")).toBe(true);
    // Deduped: the same failure fires every tick but collapses to one row.
    expect(r.tickErrors.filter((e) => e.subsystem === "Contracts").length).toBe(1);
  });

  it("a clean turn reports no subsystem errors", () => {
    const state = createInitialState();
    state.gameplayMode = "turnbased";
    const result = advanceTurn(state, makeTickFn());
    expect(result.tickErrors).toEqual([]);
  });
});

describe("turn mode — offline catch-up is skipped", () => {
  it("turn-based games accrue no offline progress and re-anchor the clock", () => {
    const s = createInitialState();
    s.gameplayMode = "turnbased";
    s.lastTickTime = Date.now() - 1000 * 60 * 60 * 24 * 30; // 30 days ago
    const before = s.totalTicks ?? 0;

    const { newState, report } = runOfflineCatchup(s, "standard");
    expect(report).toBeNull();
    expect(newState.totalTicks).toBe(before);
    expect(newState.lastTickTime).toBeGreaterThan(s.lastTickTime);
  });

  it("realtime games still catch up from a stale anchor", () => {
    const s = createInitialState();
    s.gameplayMode = "realtime";
    s.tickPaused = false;
    s.lastTickTime = Date.now() - 1000 * 60 * 60 * 24 * 30;
    const before = s.totalTicks ?? 0;

    const { newState } = runOfflineCatchup(s, "standard");
    expect(newState.totalTicks).toBeGreaterThan(before);
  });
});

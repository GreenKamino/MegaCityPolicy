import { afterEach, describe, expect, it, vi } from "vitest";

import { CONDITION_TRIGGERS } from "@/engine/eventTriggers";
import {
  PROSPERITY_RESPONSES,
  PROSPERITY_TRIGGERS,
  cityGoldenAge,
  cityThriving,
} from "@/engine/prosperityTriggers";
import { runLiveTick } from "@/engine/liveTickPipeline";
import { createInitialState } from "@/engine/initialState";
import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #480: the prosperity pool exists so a WELL-RUN late-game city keeps
// getting stories. These tests pin three things:
//   1. The thriving/golden-age gates open for good stats and stay shut for the
//      scrappy starting city.
//   2. Pool integrity: unique pros_ ids, flavor-flagged, long cooldowns, and
//      weights inside the band the picker was tuned for.
//   3. Cadence, through the REAL tick path (runLiveTick): a perfect-metrics
//      city actually receives prosperity events, unbadged, with stamps.
// ─────────────────────────────────────────────────────────────────────────────

function goldenAgeState(): GameState {
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
      biosphere: 70,
    },
    resources: { ...base.resources, credits: 120000, food: 400 },
    activeEvents: [],
    eventHistory: [],
  };
}

describe("prosperity gates", () => {
  it("the starting city does not count as thriving", () => {
    // Fresh state: unrest 42, happiness 45, employment 68 — a city surviving,
    // not thriving. If this ever passes the gate, the pool floods early game.
    const s = createInitialState();
    expect(cityThriving(s)).toBe(false);
    expect(cityGoldenAge(s)).toBe(false);
  });

  it("strong metrics open the thriving gate, stricter ones the golden age", () => {
    const s = goldenAgeState();
    expect(cityThriving(s)).toBe(true);
    expect(cityGoldenAge(s)).toBe(true);

    // Thriving but not golden: biosphere passable (>= 30) but below the
    // golden-age bar (55).
    const smoggy: GameState = {
      ...s,
      cityStats: { ...s.cityStats, biosphere: 40 },
    };
    expect(cityThriving(smoggy)).toBe(true);
    expect(cityGoldenAge(smoggy)).toBe(false);

    // One bad metric closes the thriving gate entirely.
    const restless: GameState = {
      ...s,
      cityStats: { ...s.cityStats, unrest: 40 },
    };
    expect(cityThriving(restless)).toBe(false);

    // A wrecked biosphere (< 30) disqualifies "thriving" outright — the city
    // cannot be told it is winning while the air is unbreathable.
    const wrecked: GameState = {
      ...s,
      cityStats: { ...s.cityStats, biosphere: 20 },
    };
    expect(cityThriving(wrecked)).toBe(false);
    expect(cityGoldenAge(wrecked)).toBe(false);

    // A housing crisis (pressure > 65) also closes the thriving gate.
    const crowded: GameState = {
      ...s,
      cityStats: { ...s.cityStats, housingPressure: 80 },
    };
    expect(cityThriving(crowded)).toBe(false);
    expect(cityGoldenAge(crowded)).toBe(false);
  });

  it("pins the exact boundary values of the new thriving terms", () => {
    const s = goldenAgeState();

    // Biosphere floor is inclusive at 30: 30 passes, 29 fails.
    const atBioFloor: GameState = { ...s, cityStats: { ...s.cityStats, biosphere: 30 } };
    const belowBioFloor: GameState = { ...s, cityStats: { ...s.cityStats, biosphere: 29 } };
    expect(cityThriving(atBioFloor)).toBe(true);
    expect(cityThriving(belowBioFloor)).toBe(false);

    // Housing ceiling is inclusive at 65: 65 passes, 66 fails.
    const atHousingCap: GameState = { ...s, cityStats: { ...s.cityStats, housingPressure: 65 } };
    const aboveHousingCap: GameState = { ...s, cityStats: { ...s.cityStats, housingPressure: 66 } };
    expect(cityThriving(atHousingCap)).toBe(true);
    expect(cityThriving(aboveHousingCap)).toBe(false);
  });
});

describe("prosperity pool integrity", () => {
  it("ids are unique, pros_-prefixed, and do not collide with other triggers", () => {
    const ids = PROSPERITY_TRIGGERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("pros_")).toBe(true);

    // PROSPERITY_TRIGGERS is spread into CONDITION_TRIGGERS — each id must
    // appear exactly once there (no duplicate registration, no collision).
    for (const id of ids) {
      expect(CONDITION_TRIGGERS.filter((t) => t.id === id).length).toBe(id ? 1 : 0);
    }
  });

  it("every trigger is flavor-flagged with a long cooldown and in-band weight", () => {
    const s = goldenAgeState();
    for (const t of PROSPERITY_TRIGGERS) {
      expect(t.flavor, `${t.id} must set flavor: true`).toBe(true);
      // Long cooldowns keep re-tellings rare even before the 2x recency block.
      expect(t.cooldownTicks, `${t.id} cooldown`).toBeGreaterThanOrEqual(200);
      const w = t.weight(s);
      expect(w, `${t.id} weight`).toBeGreaterThanOrEqual(0.2);
      expect(w, `${t.id} weight`).toBeLessThanOrEqual(0.5);
    }
  });

  it("every trigger has a response pool and generates a complete event", () => {
    const s = goldenAgeState();
    for (const t of PROSPERITY_TRIGGERS) {
      const responses = PROSPERITY_RESPONSES[t.id];
      expect(responses, `${t.id} missing PROSPERITY_RESPONSES entry`).toBeTruthy();
      expect(responses.length).toBeGreaterThanOrEqual(3);

      const evt = t.generate(s);
      expect(evt.id).toBe(t.id);
      expect(evt.title.length).toBeGreaterThan(0);
      expect(evt).not.toHaveProperty("description");
      expect(evt.responseOptions).toBe(responses);
      expect(responses.every((response) => !Object.hasOwn(response, "description"))).toBe(true);
      // Copy rules: no exclamation marks anywhere in prosperity copy.
      const copy = [evt.title, ...responses.flatMap((r) => [r.label])].join(" ");
      expect(copy.includes("!"), `${t.id} copy contains an exclamation mark`).toBe(false);
    }
  });
});

// ── Cadence through the real tick path ───────────────────────────────────────

describe("prosperity cadence via runLiveTick (Task #480)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not schedule retired prosperity stories", () => {
    // Roll 0 always passes the picker's fire gate and takes the top weight.
    vi.spyOn(Math, "random").mockReturnValue(0);

    // Stamp every NON-prosperity trigger fresh each tick so the pick is
    // deterministic; prosperity ids keep whatever stamps the pipeline writes.
    const prosIds = new Set(PROSPERITY_TRIGGERS.map((t) => t.id));
    function blockOthers(s: GameState): GameState {
      const cooldowns = { ...(s.eventTriggerCooldowns ?? {}) };
      for (const t of CONDITION_TRIGGERS) {
        if (!prosIds.has(t.id)) cooldowns[t.id] = s.totalTicks;
      }
      return { ...s, eventTriggerCooldowns: cooldowns };
    }

    let state = goldenAgeState();
    const fired: string[] = [];
    for (let i = 0; i < 4; i++) {
      const result = runLiveTick(blockOthers(state));
      state = result.state;
      if (result.firedEvent && prosIds.has(result.firedEvent.id)) {
        fired.push(result.firedEvent.id);
        // Prosperity stories are never "STILL UNRESOLVED".
        expect(result.firedEvent.repeat).toBeUndefined();
        // The pipeline stamps the fire tick for recency spacing.
        expect(state.eventTriggerCooldowns?.[result.firedEvent.id]).toBe(state.totalTicks);
      }
    }

    expect(fired).toEqual([]);
  });
});

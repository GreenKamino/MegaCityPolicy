import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  computeBiosphereBreakdown,
  computeRecoveryRate,
  NATURAL_BIOSPHERE_FLOOR,
  type BiosphereSuggestionTarget,
} from "@/engine/biosphereBreakdown";
import type { GameState } from "@/engine/types";
import { navigateToBiosphereSuggestion } from "@/utils/biosphereNavigation";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
import { router } from "expo-router";

// ─────────────────────────────────────────────────────────────────────────────
// Task #413 — ecological collapse must be reversible. Before this change the
// biosphere recovery rate was an integer step function with a "dead zone": a
// moderate green investment (bioBonus roughly 5–15) mapped to +0 per tick, so a
// player who invested but not lavishly saw NO recovery and gave up. The rate is
// now continuous — any genuine green investment produces a strictly positive
// per-tick rate that scales with the size of the investment — while neglect
// still drains toward (but never below) the natural survivable floor.
//
// Companion coverage: biosphereInvestmentPayoff.test.ts proves the heavy-
// investment climb and the crisis-rate payoff; longPlaythroughInvariant.test.ts
// proves passive neglect settles at the floor over a very long playthrough.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
});

describe("biosphere recovery rate — no dead zone", () => {
  it("computeRecoveryRate is strictly positive across the old dead zone (bioBonus 5..15)", () => {
    for (let bioBonus = 5; bioBonus <= 15; bioBonus++) {
      // No units, no policies, no penalties: the raw infrastructure rate must be
      // strictly positive for ANY positive green investment. This is the crux of
      // the fix — the old step function returned 0 for this whole range.
      const rate = computeRecoveryRate(bioBonus, 0, 0, 0);
      expect(rate).toBeGreaterThan(0);
    }
  });

  it("recovery rate scales with investment and caps at +3", () => {
    // Monotonic in bioBonus...
    expect(computeRecoveryRate(30, 0, 0, 0)).toBeGreaterThan(
      computeRecoveryRate(15, 0, 0, 0),
    );
    // ...and capped so the top tier matches the old maximum (+3/tick).
    expect(computeRecoveryRate(45, 0, 0, 0)).toBeCloseTo(3, 5);
    expect(computeRecoveryRate(300, 0, 0, 0)).toBeCloseTo(3, 5);
  });

  it("no green investment at all drains at the neglect rate (-1)", () => {
    expect(computeRecoveryRate(0, 0, 0, 0)).toBe(-1);
  });

  it("a real state with a moderate (dead-zone) investment reports a positive rate and names the driver", () => {
    const state = createInitialState();
    // bioBonus 10 (exoticFloraGardens weight 1 x 10) — squarely inside the old
    // dead zone. No disease-reduction side effects, so this isolates the rate.
    state.buildings = { ...state.buildings, exoticFloraGardens: 10 };
    const breakdown = computeBiosphereBreakdown(state);
    expect(breakdown.bioBonus).toBe(10);
    expect(breakdown.recoveryRate).toBeGreaterThan(0);
    expect(breakdown.positives.some((p) => p.label === "Green infrastructure")).toBe(true);
    expect(breakdown.suggestions.length).toBeGreaterThan(0);
  });
});

describe("biosphere recovery over real runTick playthroughs", () => {
  it("a moderate (dead-zone) investment produces real, strictly positive recovery", () => {
    const state = createInitialState();
    state.hasCompletedOnboarding = true; // veteran: no start-paused gating
    state.cityStats.biosphere = 30; // mid band, below healthy, above the floor
    state.cityStats.biosphereRecoveryProgress = 0;
    // bioBonus 10 (dead zone) plus disease reduction so a short run stays clean
    // of outbreaks: bioremediationProcessingPlants gives bioBonus 4 + disease
    // reduction 3 each; exoticFloraGardens adds bioBonus with no side effects.
    state.buildings = {
      ...state.buildings,
      bioremediationProcessingPlants: 2, // bioBonus 8
      exoticFloraGardens: 2, // bioBonus 2  => total 10 (dead zone)
    };

    // Keep probabilistic events out of the way; the recovery math is deterministic.
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const start = state.cityStats.biosphere;
    let s: GameState = state;
    for (let i = 0; i < 30; i++) s = runTick(s).newState;

    // The whole point of the fix: a moderate investment moves the needle.
    expect(s.cityStats.biosphere).toBeGreaterThan(start);
  });

  it("a collapsed biosphere at the floor recovers to healthy with a solid investment", () => {
    const state = createInitialState();
    state.hasCompletedOnboarding = true;
    state.cityStats.biosphere = NATURAL_BIOSPHERE_FLOOR; // collapsed at the floor
    state.cityStats.biosphereRecoveryProgress = 0;
    // A solid green stack that also controls disease (reclamation domes and
    // decontamination forests each add disease reduction), so the climb isn't
    // sabotaged by an outbreak on the way up. bioBonus 30 => ~+2/tick.
    state.buildings = {
      ...state.buildings,
      biosphereReclamationDomes: 3, // bioBonus 15 + disease reduction
      decontaminationForests: 3, // bioBonus 15 + disease reduction
    };

    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const CAP_TICKS = 300;
    let s: GameState = state;
    let ticks = 0;
    for (; ticks < CAP_TICKS; ticks++) {
      s = runTick(s).newState;
      if ((s.cityStats?.biosphere ?? 0) >= 50) break;
    }

    expect(s.cityStats.biosphere).toBeGreaterThanOrEqual(50);
    expect(ticks).toBeLessThan(CAP_TICKS); // a real climb, not a marginal crawl
  });

  it("pure neglect still drains the biosphere down toward, but not below, the floor", () => {
    const state = createInitialState();
    state.hasCompletedOnboarding = true;
    state.cityStats.biosphere = 40; // healthy-ish, no green infrastructure
    state.cityStats.biosphereRecoveryProgress = 0;
    state.buildings = {}; // no green investment at all -> neglect

    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const start = state.cityStats.biosphere;
    let s: GameState = state;
    for (let i = 0; i < 20; i++) s = runTick(s).newState;

    // Neglect still bites (recovery is not a free ride)...
    expect(s.cityStats.biosphere).toBeLessThan(start);
    // ...but nature resists collapse to a dead zero: it never falls below the floor.
    expect(s.cityStats.biosphere).toBeGreaterThanOrEqual(NATURAL_BIOSPHERE_FLOOR);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The on-screen trend chip is driven by breakdown.netPerTick, so that number must
// mirror what the tick ACTUALLY applies — not the raw recoveryRate. Below the
// natural floor, mere neglect is absorbed (pinned) and slow rewilding climbs the
// value back, so the readout must never say "degrading" while the sim is holding
// or climbing. (Regression guard for the misleading -1.0/tick chip.)
// ─────────────────────────────────────────────────────────────────────────────

describe("biosphere breakdown — net direction mirrors the sim's floor behavior", () => {
  // Mirrors the wildlands chip thresholds (app/(game)/wildlands.tsx).
  const dirOf = (net: number) =>
    net > 0.05 ? "recovering" : net < -0.05 ? "degrading" : "holding";

  it("below the floor with pure neglect reads as recovering (rewilding), not degrading", () => {
    const state = createInitialState();
    state.cityStats.biosphere = 10; // below the floor
    state.buildings = {}; // no green investment -> raw recoveryRate is -1
    state.activeEvents = [];
    const b = computeBiosphereBreakdown(state);
    expect(b.recoveryRate).toBeLessThan(0); // raw rate is a drain...
    expect(b.netPerTick).toBeGreaterThan(0); // ...but the sim rewilds it back up
    expect(dirOf(b.netPerTick)).toBe("recovering");
    expect(b.positives.some((p) => p.label === "Natural rewilding")).toBe(true);
    // The absorbed drain must not be surfaced as an active drain.
    expect(b.negatives.some((n) => n.label === "Neglect and pollution")).toBe(false);
  });

  it("exactly at the floor with pure neglect reads as holding", () => {
    const state = createInitialState();
    state.cityStats.biosphere = NATURAL_BIOSPHERE_FLOOR; // pinned, no rewilding
    state.buildings = {};
    state.activeEvents = [];
    const b = computeBiosphereBreakdown(state);
    expect(dirOf(b.netPerTick)).toBe("holding");
    expect(b.positives.some((p) => p.label === "Natural rewilding")).toBe(false);
  });

  it("above the floor with pure neglect still reads as degrading (genuine drain)", () => {
    const state = createInitialState();
    state.cityStats.biosphere = 40; // above the floor -> neglect really bites
    state.buildings = {};
    state.activeEvents = [];
    const b = computeBiosphereBreakdown(state);
    expect(b.netPerTick).toBeLessThan(0);
    expect(dirOf(b.netPerTick)).toBe("degrading");
    expect(b.negatives.some((n) => n.label === "Neglect and pollution")).toBe(true);
  });

  it("an active outbreak below the floor reads as degrading (erosion overrides rewilding)", () => {
    const state = createInitialState();
    state.cityStats.biosphere = 10; // below the floor
    state.buildings = {};
    // An active outbreak both erodes the biosphere and blocks rewilding.
    state.activeEvents = [
      { id: "biosphere_disease_outbreak" },
    ] as unknown as typeof state.activeEvents;
    const b = computeBiosphereBreakdown(state);
    expect(b.outbreakRate).toBeLessThan(0);
    expect(b.netPerTick).toBeLessThan(0);
    expect(dirOf(b.netPerTick)).toBe("degrading");
    expect(b.positives.some((p) => p.label === "Natural rewilding")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A construction-category recovery tip should not just open the right category —
// it should name the single highest-impact building so the UI can land the
// player directly on it. Only the two tips that name a concrete fix (green
// infrastructure and extractive-wildlands) carry a highlight; the rest omit it
// and the UI falls back gracefully to opening the category.
// ─────────────────────────────────────────────────────────────────────────────
describe("biosphere recovery suggestions — deep-link building highlight", () => {
  type ConstructionTarget = Extract<BiosphereSuggestionTarget, { screen: "construction" }>;
  const constructionTargets = (state: GameState): ConstructionTarget[] =>
    computeBiosphereBreakdown(state)
      .suggestions.map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");

  it("the green-infrastructure tip lands on the highest-weight green building", () => {
    const state = createInitialState();
    state.cityStats.biosphere = 30;
    state.buildings = {}; // bioBonus 0 -> green-infrastructure tip fires
    const tip = constructionTargets(state).find((t) => t.category === "biosphere");
    expect(tip).toBeTruthy();
    expect(tip?.highlight).toBe("biosphereReclamationDomes");
  });

  it("the extractive-wildlands tip lands on the top stewardship building", () => {
    const state = createInitialState();
    state.cityStats.biosphere = 40;
    state.buildings = { apexHuntersLodges: 5 }; // netSteward < 0 -> wildlands tip fires
    const tip = constructionTargets(state).find((t) => t.category === "wildlands");
    expect(tip).toBeTruthy();
    expect(tip?.highlight).toBe("wildlandsBioreserves");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task #419 — ecology recovery tips must always deep-link somewhere valid. Each
// construction-category suggestion carries a { screen: "construction", category }
// target, and construction.tsx builds its tabs from a CATEGORIES list; a tip
// whose category is not a real category id would silently fall back to the first
// tab — a confusing dead-end. This reads the category ids straight from the
// construction screen (source of truth) and asserts every construction target
// emitted by computeBiosphereBreakdown resolves to one of them. It drives every
// suggestion branch at once so a newly-added or renamed tip can't slip through.
// ─────────────────────────────────────────────────────────────────────────────
describe("biosphere recovery suggestions — construction deep-links stay valid", () => {
  const push = router.push as unknown as ReturnType<typeof vi.fn>;
  type ConstructionTarget = Extract<BiosphereSuggestionTarget, { screen: "construction" }>;

  // Read the real category ids from construction.tsx rather than importing the
  // screen: it is a React Native / expo-router module and pulling it into the
  // node test env would require mocking its entire native dependency graph. A
  // text parse still ties this test to the source, so a rename or removal there
  // is caught here.
  const constructionSource = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../app/(game)/construction.tsx",
    ),
    "utf8",
  );
  const validCategoryIds = new Set(
    [...constructionSource.matchAll(/id:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]),
  );

  // Guard against a silently-broken parse (moved file, changed shape): if this
  // ever comes up empty the coverage assertions below would pass vacuously.
  it("parses a sane set of construction category ids", () => {
    expect(validCategoryIds.size).toBeGreaterThanOrEqual(10);
    for (const id of ["biosphere", "wildlands", "security", "infrastructure"]) {
      expect(validCategoryIds.has(id)).toBe(true);
    }
  });

  // A single maximally-degraded sector trips every recovery branch at once:
  //   outbreaks > 0        -> inbox tip
  //   netSteward < 0       -> construction/wildlands
  //   bioBonus < 15        -> construction/biosphere
  //   crime > 70           -> construction/security
  //   infrastructure < 20  -> construction/infrastructure
  //   no ecology policy    -> law tip
  //   population density   -> construction/biosphere mitigation
  const worstCaseState = (): GameState => {
    const state = createInitialState();
    state.cityStats.biosphere = 30;
    state.cityStats.crime = 80;
    state.cityStats.infrastructureHealth = 10;
    state.buildings = { apexHuntersLodges: 5 };
    state.units = {};
    state.activePolicies = [];
    state.activeEvents = [
      { id: "biosphere_disease_outbreak" },
    ] as unknown as typeof state.activeEvents;
    return state;
  };

  it("drives every suggestion branch", () => {
    const { suggestions } = computeBiosphereBreakdown(worstCaseState());
    // All seven branches fire. If a new branch is added and this test does not
    // exercise it, the count changes and forces this to be updated.
    expect(suggestions).toHaveLength(7);
    const screens = suggestions.map((s) => s.target?.screen);
    expect(screens).toContain("inbox");
    expect(screens).toContain("law");
    const categories = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction")
      .map((t) => t.category);
    expect(categories).toEqual(
      expect.arrayContaining(["wildlands", "biosphere", "security", "infrastructure"]),
    );
  });

  it("every construction deep-link target resolves to a real category id", () => {
    const { suggestions } = computeBiosphereBreakdown(worstCaseState());
    const constructionTargets = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");
    expect(constructionTargets.length).toBeGreaterThan(0);
    for (const target of constructionTargets) {
      expect(
        validCategoryIds.has(target.category),
        `recovery tip deep-links to construction category "${target.category}", which is not a real CATEGORIES id in construction.tsx`,
      ).toBe(true);
    }
  });

  it("navigates every target a worst-case diagnosis can emit — no dead taps", () => {
    const { suggestions } = computeBiosphereBreakdown(worstCaseState());
    const targets = suggestions
      .map((suggestion) => suggestion.target)
      .filter((target): target is BiosphereSuggestionTarget => !!target);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      push.mockReset();
      navigateToBiosphereSuggestion(target);
      expect(push, `biosphere recovery tip for screen "${target.screen}" did nothing`).toHaveBeenCalledTimes(1);
    }
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "@/engine/initialState";
import {
  computeCrimeBreakdown,
  computeSecurityBonus,
  computeLawStrength,
  LAW_STRENGTH_THRESHOLD,
  type CrimeSuggestionTarget,
} from "@/engine/crimeBreakdown";
import type { GameState } from "@/engine/types";
import {
  isCrimeSuggestionNavigable,
  navigateToCrimeSuggestion,
} from "@/utils/crimeNavigation";

// The crime navigator is the only module under test here that touches
// expo-router; mock it so we can assert route jumps without pulling the native
// navigation graph into the node test env. vitest hoists vi.mock above imports,
// so the navigator picks up the mocked router.
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
import { router } from "expo-router";

// ─────────────────────────────────────────────────────────────────────────────
// Crime breakdown — mirrors the biosphere "diagnose -> one-tap fix" pattern for
// the Crime Index. The Law screen turns each diagnosis into a tappable recovery
// tip that deep-links straight to the right screen (a construction category, the
// military recruiter, the mining policies, or stays on Law for public-order
// policies). These tests prove:
//   1. the readout mirrors the sim's suppressor/driver levers, and
//   2. every construction-category deep-link resolves to a real category id, so
//      a rename or removal in construction.tsx is caught here (same spirit as
//      biosphereReversibility.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

describe("crime breakdown — suppressors and drivers mirror the sim", () => {
  it("computeSecurityBonus / computeLawStrength weight the enforcement stacks", () => {
    // sectorHouseHQ weight 2, seniorJudges weight 1.5.
    expect(computeSecurityBonus({ sectorHouseHQ: 3 })).toBe(6);
    expect(computeLawStrength({ seniorJudges: 4 })).toBeCloseTo(6, 5);
  });

  it("a calm, well-policed sector reports no suggestions", () => {
    const state = createInitialState();
    state.cityStats.crime = 10;
    state.cityStats.unrest = 10;
    state.cityStats.happiness = 80;
    state.cityStats.diseaseRisk = 10;
    state.cityStats.biosphere = 70;
    state.resources.food = 5000;
    // A heavy enforcement stack so nothing is rising and crime is low.
    state.buildings = { ...state.buildings, sectorHouseHQ: 20 };
    state.units = { ...state.units, seniorJudges: 100 };
    state.activeMiningPolicies = [];
    const bd = computeCrimeBreakdown(state);
    expect(bd.netPerTick).toBeLessThanOrEqual(0);
    expect(bd.suggestions).toHaveLength(0);
    expect(bd.positives.length).toBeGreaterThan(0);
  });

  it("law enforcement units only count as a suppressor above the threshold", () => {
    const belowState = createInitialState();
    belowState.units = { patrolJudges: 1 }; // lawStrength 0.5, below threshold
    const below = computeCrimeBreakdown(belowState);
    expect(below.lawStrength).toBeLessThanOrEqual(LAW_STRENGTH_THRESHOLD);
    expect(below.positives.some((p) => p.label === "Law enforcement units")).toBe(false);

    const aboveState = createInitialState();
    aboveState.units = { seniorJudges: 100 }; // lawStrength 150, above threshold
    const above = computeCrimeBreakdown(aboveState);
    expect(above.lawStrength).toBeGreaterThan(LAW_STRENGTH_THRESHOLD);
    expect(above.positives.some((p) => p.label === "Law enforcement units")).toBe(true);
  });

  it("a lawless, neglected sector reads as rising with named drivers", () => {
    const state = createInitialState();
    state.cityStats.crime = 60;
    state.cityStats.unrest = 80;
    state.cityStats.happiness = 20;
    state.cityStats.diseaseRisk = 80;
    state.cityStats.biosphere = 10;
    state.resources.food = 0;
    state.buildings = {};
    state.units = {};
    state.activeMiningPolicies = ["black_market_ore"];
    const bd = computeCrimeBreakdown(state);
    expect(bd.netPerTick).toBeGreaterThan(0);
    const drivers = bd.negatives.map((n) => n.label);
    expect(drivers).toEqual(
      expect.arrayContaining([
        "High unrest",
        "Low happiness",
        "Starvation",
        "Disease outbreak",
        "Ecological collapse",
        "Black-market ore trade",
      ]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Crime recovery tips must always deep-link somewhere valid. Every construction
// target carries a { screen: "construction", category } that construction.tsx
// must recognise — a tip whose category is not a real CATEGORIES id would
// silently fall back to the first tab, a confusing dead-end. This reads the
// category ids straight from the construction screen (source of truth) and
// asserts every construction target emitted by computeCrimeBreakdown resolves to
// one of them, driving every suggestion branch at once.
// ─────────────────────────────────────────────────────────────────────────────
describe("crime recovery suggestions — deep-links stay valid", () => {
  type ConstructionTarget = Extract<CrimeSuggestionTarget, { screen: "construction" }>;

  // Text-parse the real category ids from construction.tsx rather than importing
  // the screen (a React Native / expo-router module whose native graph would need
  // mocking in the node test env). A rename or removal there is still caught here.
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
    for (const id of ["security", "beautification", "food", "civic", "biosphere"]) {
      expect(validCategoryIds.has(id)).toBe(true);
    }
  });

  // A single maximally-degraded sector trips every recovery branch at once:
  //   securityBonus < 40      -> construction/security
  //   lawStrength <= threshold-> military
  //   no order policy         -> law
  //   black_market_ore        -> mining
  //   happiness < 30          -> construction/beautification
  //   food <= 0               -> construction/food
  //   diseaseRisk > 60        -> construction/civic
  //   biosphere < 20          -> construction/biosphere
  const worstCaseState = (): GameState => {
    const state = createInitialState();
    state.cityStats.crime = 80;
    state.cityStats.unrest = 80;
    state.cityStats.happiness = 20;
    state.cityStats.diseaseRisk = 80;
    state.cityStats.biosphere = 10;
    state.resources.food = 0;
    state.buildings = {};
    state.units = {};
    state.policies = { ...state.policies, martialLaw: false, curfewEnabled: false, surveillanceActive: false };
    state.activeMiningPolicies = ["black_market_ore"];
    return state;
  };

  it("drives every suggestion branch", () => {
    const { suggestions } = computeCrimeBreakdown(worstCaseState());
    // All eight branches fire. If a new branch is added and this test does not
    // exercise it, the count changes and forces this to be updated.
    expect(suggestions).toHaveLength(8);
    const screens = suggestions.map((s) => s.target?.screen);
    expect(screens).toContain("military");
    expect(screens).toContain("law");
    expect(screens).toContain("mining");
    const categories = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction")
      .map((t) => t.category);
    expect(categories).toEqual(
      expect.arrayContaining(["security", "beautification", "food", "civic", "biosphere"]),
    );
  });

  it("every construction deep-link target resolves to a real category id", () => {
    const { suggestions } = computeCrimeBreakdown(worstCaseState());
    const constructionTargets = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");
    expect(constructionTargets.length).toBeGreaterThan(0);
    for (const target of constructionTargets) {
      expect(
        validCategoryIds.has(target.category),
        `crime recovery tip deep-links to construction category "${target.category}", which is not a real CATEGORIES id in construction.tsx`,
      ).toBe(true);
    }
  });

  it("the enforcement tip lands on the highest-weight security building", () => {
    const { suggestions } = computeCrimeBreakdown(worstCaseState());
    const securityTip = suggestions
      .map((s) => s.target)
      .find((t): t is ConstructionTarget => t?.screen === "construction" && t.category === "security");
    expect(securityTip).toBeTruthy();
    expect(securityTip?.highlight).toBe("sectorHouseHQ");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The crime "one-tap fix" navigation is a SINGLE shared helper
// (utils/crimeNavigation.ts) used by BOTH the Law screen and the overview,
// so the two can never drift. These tests pin its routing and, crucially, prove
// every target a diagnosis can emit is actually handled: from the overview every
// tip routes somewhere, and from the Law screen every tip routes except the
// on-screen "law" policies tip, which is a deliberate no-op. Combined with the
// exhaustive `never` switch in the helper (a typecheck guard), adding a new
// CrimeSuggestionTarget variant can no longer leave a tapped tip doing nothing.
// ─────────────────────────────────────────────────────────────────────────────
describe("crime one-tap fix — one shared navigator for both screens", () => {
  const push = router.push as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => push.mockReset());

  // Same maximally-degraded sector as above: trips every recovery branch.
  const degradedState = (): GameState => {
    const state = createInitialState();
    state.cityStats.crime = 80;
    state.cityStats.unrest = 80;
    state.cityStats.happiness = 20;
    state.cityStats.diseaseRisk = 80;
    state.cityStats.biosphere = 10;
    state.resources.food = 0;
    state.buildings = {};
    state.units = {};
    state.policies = { ...state.policies, martialLaw: false, curfewEnabled: false, surveillanceActive: false };
    state.activeMiningPolicies = ["black_market_ore"];
    return state;
  };

  it("routes each target type from the overview (not already on Law)", () => {
    navigateToCrimeSuggestion({ screen: "construction", category: "security", highlight: "sectorHouseHQ" });
    expect(push).toHaveBeenCalledWith({
      pathname: "/(game)/construction",
      params: { category: "security", highlight: "sectorHouseHQ" },
    });

    push.mockReset();
    navigateToCrimeSuggestion({ screen: "military" });
    expect(push).toHaveBeenCalledWith("/(game)/military");

    push.mockReset();
    navigateToCrimeSuggestion({ screen: "mining" });
    expect(push).toHaveBeenCalledWith("/(game)/mining");

    push.mockReset();
    navigateToCrimeSuggestion({ screen: "law" });
    expect(push).toHaveBeenCalledWith("/(game)/law");
  });

  it("makes only the 'law' target a no-op when already on the Law screen", () => {
    expect(isCrimeSuggestionNavigable({ screen: "law" }, { alreadyOnLaw: true })).toBe(false);
    expect(isCrimeSuggestionNavigable({ screen: "military" }, { alreadyOnLaw: true })).toBe(true);

    navigateToCrimeSuggestion({ screen: "law" }, { alreadyOnLaw: true });
    expect(push).not.toHaveBeenCalled();

    // Every other target still routes, even from the Law screen.
    navigateToCrimeSuggestion({ screen: "military" }, { alreadyOnLaw: true });
    expect(push).toHaveBeenCalledWith("/(game)/military");
  });

  it("navigates every target a worst-case diagnosis can emit — no dead taps", () => {
    const { suggestions } = computeCrimeBreakdown(degradedState());
    const targets = suggestions
      .map((s) => s.target)
      .filter((t): t is CrimeSuggestionTarget => !!t);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      // From the overview, every tip must go somewhere.
      push.mockReset();
      navigateToCrimeSuggestion(target);
      expect(
        push,
        `overview tip for screen "${target.screen}" did nothing`,
      ).toHaveBeenCalledTimes(1);

      // From the Law screen, every tip routes except the on-screen "law" policies.
      push.mockReset();
      navigateToCrimeSuggestion(target, { alreadyOnLaw: true });
      expect(push).toHaveBeenCalledTimes(target.screen === "law" ? 0 : 1);
    }
  });
});

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "@/engine/initialState";
import {
  computeHealthBase,
  computeHealthBreakdown,
  HEALTH_BASE_BUILDING_WEIGHTS,
  HEALTH_BASE_UNIT_WEIGHTS,
  HEALTH_BASE_DRIFT_THRESHOLD,
  HEALTH_BASE_COLLAPSE_THRESHOLD,
  MED_SUPPLIES_BONUS_THRESHOLD,
  HEALTH_SANITATION_PENALTY_BELOW,
  HEALTH_DISEASE_SEVERE_THRESHOLD,
  HEALTH_DISEASE_MILD_THRESHOLD,
  HEALTH_BIOSPHERE_BONUS_THRESHOLD,
  type HealthSuggestionTarget,
} from "@/engine/healthBreakdown";
import type { GameState } from "@/engine/types";
import { navigateToHealthSuggestion } from "@/utils/healthNavigation";
import { router } from "expo-router";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

// ─────────────────────────────────────────────────────────────────────────────
// Public health breakdown — the "diagnose -> one-tap fix" card for Public
// Health, mirroring the defense / infrastructure pattern. Public Health is a
// 0..100 stat (higher is better) moved by flat per-tick swings; the readout
// decomposes the swing the sim will apply. These tests prove:
//   1. the readout's weights and thresholds mirror the sim exactly,
//   2. the task's reported death spiral (penalties stacking to -6 while a lone
//      clinic cannot reach the +1 threshold) is fully visible in the readout,
//   3. every deep-link resolves to a real screen / construction category, and
//   4. the sim's dead `healthBase > 20` branch stays dead — if it is ever
//      retuned, this trips so the card copy is updated too.
// ─────────────────────────────────────────────────────────────────────────────

const engineSource = (rel: string) =>
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), "utf8");

// A healthy sector with every lever explicitly set, so each test opts in to
// exactly the contributors it means to exercise.
function healthyState(): GameState {
  const s = createInitialState();
  s.buildings = { publicHealthMegaClinics: 4 }; // base 12 -> +1 network drift
  s.units = {};
  s.cityStats.publicHealth = 80;
  s.cityStats.diseaseRisk = 10;
  s.cityStats.biosphere = 50; // below the every-2nd-tick bonus threshold
  s.resources.medSupplies = 150;
  s.resources.food = 500;
  s.resources.water = 500;
  s.utilities.sanitationLevel = 80;
  return s;
}

describe("health breakdown — contributors mirror the sim", () => {
  it("computeHealthBase weights buildings and units like the sim", () => {
    // 2 clinics * 3 + 2 med research * 1.5 + 1 welfare * 1 = 10.
    expect(
      computeHealthBase(
        { publicHealthMegaClinics: 2, medicalResearchComplexes: 2, welfareDistributionCenters: 1 },
        {},
      ),
    ).toBe(10);
    // 10 med teams * 0.3 + 2 field hospitals * 0.5 + 5 droids * 0.2 = 5.
    expect(
      computeHealthBase(
        {},
        { emergencyMedicalTeams: 10, fieldHospitalUnits: 2, medicalAssistDroid: 5 },
      ),
    ).toBe(5);
  });

  it("a healthy sector lists its gains and raises no suggestions", () => {
    const bd = computeHealthBreakdown(healthyState());
    const density = bd.negatives.find((n) => n.label === "Population density");
    expect(bd.healthBase).toBe(12);
    expect(bd.positives.find((p) => p.label === "Medical network")?.amount).toBe(1);
    expect(bd.positives.find((p) => p.label === "Med supply reserves")?.amount).toBe(1);
    expect(density?.amount).toBeGreaterThan(0);
    expect(bd.netPerTick).toBeCloseTo(2 - density!.amount, 8);
    // A healthy sector must not nag the Commander.
    expect(bd.suggestions).toHaveLength(0);
  });

  it("every-2nd-tick terms are averaged to 0.5 and labeled as such", () => {
    const s = healthyState();
    s.cityStats.diseaseRisk = HEALTH_DISEASE_MILD_THRESHOLD + 5; // mild band
    s.cityStats.biosphere = HEALTH_BIOSPHERE_BONUS_THRESHOLD + 10;
    const bd = computeHealthBreakdown(s);
    const bio = bd.positives.find((p) => p.label.includes("biosphere"));
    expect(bio?.amount).toBe(0.5);
    expect(bio?.label).toContain("every 2nd tick");
    const mild = bd.negatives.find((n) => n.label.includes("disease risk"));
    expect(mild?.amount).toBe(0.5);
    expect(mild?.label).toContain("every 2nd tick");
    // Severe disease risk replaces the mild every-2nd-tick term with a full -1.
    s.cityStats.diseaseRisk = HEALTH_DISEASE_SEVERE_THRESHOLD + 5;
    const bd2 = computeHealthBreakdown(s);
    expect(bd2.negatives.find((n) => n.label === "Severe disease risk")?.amount).toBe(1);
    expect(bd2.negatives.some((n) => n.label.includes("every 2nd tick"))).toBe(false);
  });

  it("the reported death spiral is fully visible: shortages stack to -6", () => {
    // The task report: health pinned at 1 despite a clinic, because
    // medSupplies/food/water/sanitation/disease penalties stack to -6/tick.
    const s = createInitialState();
    s.buildings = { publicHealthMegaClinics: 1 }; // base 3 — below the +1 threshold
    s.units = {};
    s.cityStats.publicHealth = 1;
    s.cityStats.diseaseRisk = HEALTH_DISEASE_SEVERE_THRESHOLD + 10;
    s.cityStats.biosphere = 10;
    s.resources.medSupplies = 0;
    s.resources.food = 0;
    s.resources.water = 0;
    s.utilities.sanitationLevel = 10;
    const bd = computeHealthBreakdown(s);
    // base 3 is not < 3, so no "No medical network" — but no bonus either.
    expect(bd.positives).toHaveLength(0);
    const labels = bd.negatives.map((n) => n.label);
    expect(labels).toContain("Med supplies exhausted");
    expect(labels).toContain("Famine");
    expect(labels).toContain("Water shortage");
    expect(labels).toContain("Failing sanitation");
    expect(labels).toContain("Severe disease risk");
    const density = bd.negatives.find((n) => n.label === "Population density")!;
    expect(bd.netPerTick).toBeCloseTo(-5 - density.amount, 8);
    // With base below the collapse threshold it reaches the full -6.
    s.buildings = {};
    expect(computeHealthBreakdown(s).netPerTick).toBeCloseTo(
      -6 - density.amount,
      8,
    );
    // Every stacked penalty gets its own targeted fix.
    const screens = computeHealthBreakdown(s).suggestions.map((sg) => sg.target?.screen);
    expect(screens).toContain("construction");
    expect(screens).toContain("recruitment");
    expect(screens).toContain("law");
  });

  it("the card always offers at least one fix when health is low", () => {
    // Health is low but every specific branch is satisfied -> fallback fires.
    const s = healthyState();
    s.cityStats.publicHealth = 30;
    const bd = computeHealthBreakdown(s);
    expect(bd.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(bd.suggestions[0].target).toBeDefined();
  });
});

describe("health recovery suggestions — deep-links stay valid", () => {
  type ConstructionTarget = Extract<HealthSuggestionTarget, { screen: "construction" }>;

  // Text-parse the real category ids from construction.tsx (source of truth)
  // rather than importing the RN/expo-router screen, exactly like the defense test.
  const constructionSource = engineSource("../../app/(game)/construction.tsx");
  const validCategoryIds = new Set(
    [...constructionSource.matchAll(/id:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]),
  );

  // A worst-case sector that trips every suggestion branch at once.
  const crisisState = (): GameState => {
    const s = createInitialState();
    s.buildings = {};
    s.units = {};
    s.cityStats.publicHealth = 1;
    s.cityStats.diseaseRisk = 90;
    s.cityStats.biosphere = 5;
    s.resources.medSupplies = 0;
    s.resources.food = 0;
    s.resources.water = 0;
    s.utilities.sanitationLevel = 5;
    return s;
  };

  it("every construction deep-link resolves to a real category id", () => {
    const targets = computeHealthBreakdown(crisisState())
      .suggestions.map((sg) => sg.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(
        validCategoryIds.has(target.category),
        `health recovery tip deep-links to construction category "${target.category}", which is not a real CATEGORIES id in construction.tsx`,
      ).toBe(true);
    }
  });

  it("every suggested deep-link resolves to a known destination screen", () => {
    const validScreens = new Set(["construction", "recruitment", "law"]);
    const screens = computeHealthBreakdown(crisisState())
      .suggestions.map((sg) => sg.target?.screen)
      .filter((x): x is NonNullable<typeof x> => x != null);
    expect(screens.length).toBeGreaterThan(0);
    for (const screen of screens) {
      expect(validScreens.has(screen), `unknown deep-link screen "${screen}"`).toBe(true);
    }
  });

  it("navigates every target a worst-case diagnosis can emit — no dead taps", () => {
    const push = router.push as unknown as ReturnType<typeof vi.fn>;
    const targets = computeHealthBreakdown(crisisState())
      .suggestions.map((suggestion) => suggestion.target)
      .filter((target): target is NonNullable<typeof target> => !!target);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      push.mockReset();
      navigateToHealthSuggestion(target);
      expect(push, `health recovery tip for screen "${target.screen}" did nothing`).toHaveBeenCalledTimes(1);
    }
  });

  it("the clinic tip lands on the clinic building", () => {
    const tip = computeHealthBreakdown(crisisState())
      .suggestions.map((sg) => sg.target)
      .find((t): t is ConstructionTarget => t?.screen === "construction" && t.category === "civic");
    expect(tip?.highlight).toBe("publicHealthMegaClinics");
  });
});

describe("health weights and thresholds stay pinned to the sim", () => {
  const formulasSource = engineSource("../formulas.ts");

  // Assert each mirrored weight still appears in formulas.ts's PUBLIC HEALTH
  // block as `"<key>") * <weight>` — a value change in the sim trips this.
  const pinned = (key: string, weight: number): boolean => {
    const w = String(weight).replace(".", "\\.");
    return new RegExp(`"${key}"\\s*\\)\\s*\\*\\s*${w}\\b`).test(formulasSource);
  };

  it("every medical building and unit weight matches the sim", () => {
    for (const [key, weight] of Object.entries(HEALTH_BASE_BUILDING_WEIGHTS)) {
      expect(pinned(key, weight), `medical building "${key}" (weight ${weight}) drifted`).toBe(true);
    }
    for (const [key, weight] of Object.entries(HEALTH_BASE_UNIT_WEIGHTS)) {
      expect(pinned(key, weight), `medical unit "${key}" (weight ${weight}) drifted`).toBe(true);
    }
  });

  it("every threshold the readout mirrors matches the sim", () => {
    expect(formulasSource).toMatch(
      new RegExp(`healthBase > ${HEALTH_BASE_DRIFT_THRESHOLD}\\b`),
    );
    expect(formulasSource).toMatch(
      new RegExp(`healthBase < ${HEALTH_BASE_COLLAPSE_THRESHOLD}\\b`),
    );
    expect(formulasSource).toMatch(
      new RegExp(`medSupplies > ${MED_SUPPLIES_BONUS_THRESHOLD}\\b`),
    );
    expect(formulasSource).toMatch(
      new RegExp(`sanitationLevel < ${HEALTH_SANITATION_PENALTY_BELOW}\\b`),
    );
    expect(formulasSource).toMatch(
      new RegExp(`diseaseRisk > ${HEALTH_DISEASE_SEVERE_THRESHOLD}\\b`),
    );
    expect(formulasSource).toMatch(
      new RegExp(`diseaseRisk > ${HEALTH_DISEASE_MILD_THRESHOLD}\\b`),
    );
    expect(formulasSource).toMatch(
      new RegExp(`biosphere > ${HEALTH_BIOSPHERE_BONUS_THRESHOLD}\\b`),
    );
  });

  it("the dead `healthBase > 20` branch stays dead (flagged, not retuned)", () => {
    // The sim's > 20 and > 10 branches BOTH add exactly +1, so passing 20
    // confers nothing extra and the card reports a single +1 once base > 10.
    // If this branch is ever retuned to a bigger bonus, this trips so the
    // readout (and its card copy) get updated in the same change.
    expect(formulasSource).toMatch(
      /if \(healthBase > 20\) healthDelta \+= 1;\s*\n\s*else if \(healthBase > 10\) healthDelta \+= 1;/,
    );
  });
});

describe("health breakdown — overview entry points stay wired", () => {
  // The card is only discoverable if the overview screen actually links to it.
  // These are source pins on app/(game)/overview.tsx (an un-importable Expo
  // screen module) — the same readFileSync approach used elsewhere in this file.
  const overviewSource = engineSource("../../app/(game)/overview.tsx");

  it("PUBLIC HEALTH and DISEASE RISK stat cells scroll to the health card", () => {
    expect(overviewSource).toContain('"PUBLIC HEALTH": "scroll:health"');
    expect(overviewSource).toContain('"DISEASE RISK": "scroll:health"');
    // And the scroll target is registered where the card is rendered.
    expect(overviewSource).toContain("breakdownCardYRef.current.health");
    expect(overviewSource).toContain("<HealthBreakdownCard state={state} />");
  });

  it("the card shows every factor — no truncation of contributors", () => {
    const cardSource = engineSource("../../components/HealthBreakdownCard.tsx");
    expect(cardSource).not.toContain(".slice(0,");
  });
});

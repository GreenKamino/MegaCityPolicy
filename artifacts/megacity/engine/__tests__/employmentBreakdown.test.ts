import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "@/engine/initialState";
import { COMPANIES, COMPANIES_MAP } from "@/engine/companies";
import { ALL_EDICTS, getEdictById } from "@/engine/edicts";
import { ALL_POLICIES } from "@/engine/policies";
import {
  computeEmploymentBreakdown,
  computeEmploymentTarget,
  computeJobSlots,
  JOB_SLOT_WEIGHTS,
  EMPLOYMENT_TARGET_BASE_BONUS,
  EMPLOYMENT_DRIFT_PER_TICK,
  COMPANY_EMPLOYMENT_FACTOR,
  COMPANY_EMPLOYMENT_CAP,
  type EmploymentSuggestionTarget,
} from "@/engine/employmentBreakdown";
import type { GameState } from "@/engine/types";
import { navigateToEmploymentSuggestion } from "@/utils/employmentNavigation";
import { router } from "expo-router";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

// ─────────────────────────────────────────────────────────────────────────────
// Employment breakdown — the "diagnose -> one-tap fix" card for Employment,
// mirroring the defense / infrastructure pattern. Employment drifts 1/tick
// toward a job-slot target, then recurring modifiers (edicts, policies,
// companies, the transit overload drain) push on top. These tests prove:
//   1. the readout's job-slot weights and target formula mirror the sim,
//   2. the task's reported invisible fall (population outrunning job slots
//      plus the silent transit -0.5 drain) is fully visible in the readout,
//   3. edict/policy/company contributions are derived from the live data
//      tables, and
//   4. every deep-link resolves to a real screen / construction category.
// ─────────────────────────────────────────────────────────────────────────────

const engineSource = (rel: string) =>
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), "utf8");

// A clean slate with no jobs, modifiers, or transit anything, so each test
// opts in to exactly the contributors it means to exercise.
function baseState(): GameState {
  const s = createInitialState();
  s.buildings = {};
  s.units = {};
  s.companies = [];
  s.activeEdicts = [];
  s.activePolicies = [];
  s.cityStats.employment = 70; // no alarm unless a test lowers it
  s.cityStats.population = 100_000;
  return s;
}

const activeEdict = (edictId: string) => ({
  edictId,
  ticksRemaining: 5,
  issuedAtTick: 0,
  cooldownUntilTick: 10,
});

describe("employment breakdown — job market mirrors the sim", () => {
  it("computeJobSlots weights the industry stacks like the sim", () => {
    // 2 mega plants * 500 + 1 assembly * 400 + 3 temples * 30 = 1490.
    expect(
      computeJobSlots({
        megaManufacturingPlants: 2,
        automatedAssemblyLines: 1,
        districtTemple: 3,
      }),
    ).toBe(1490);
  });

  it("computeEmploymentTarget mirrors the sim's coverage + 30, capped at 100", () => {
    // floor(5000 / 10000 * 100) + 30 = 80.
    expect(computeEmploymentTarget(5000, 10_000)).toBe(80);
    // Massive coverage caps at 100.
    expect(computeEmploymentTarget(100_000, 10_000)).toBe(100);
    // Zero population cannot divide; the readout falls back to the base bonus.
    expect(computeEmploymentTarget(0, 0)).toBe(EMPLOYMENT_TARGET_BASE_BONUS);
  });

  it("the drift direction follows the target exactly like the sim", () => {
    const s = baseState();
    s.buildings = { megaManufacturingPlants: 200 }; // 100k slots -> target 100
    s.cityStats.employment = 40;
    const rising = computeEmploymentBreakdown(s);
    expect(rising.targetEmployment).toBe(100);
    expect(
      rising.positives.find((p) => p.label.includes("Job market"))?.amount,
    ).toBe(EMPLOYMENT_DRIFT_PER_TICK);
    // The sim drifts DOWN when the target is not strictly above the stat.
    s.buildings = {};
    s.cityStats.employment = 70; // target floor(0)+30 = 30 < 70
    const falling = computeEmploymentBreakdown(s);
    expect(falling.targetEmployment).toBe(30);
    expect(
      falling.negatives.find((n) => n.label.includes("Job shortage"))?.amount,
    ).toBe(EMPLOYMENT_DRIFT_PER_TICK);
  });

  it("the reported invisible fall is fully visible: weak target + transit drain", () => {
    // The task report: employment falling every turn because population
    // outran job slots while an overloaded transit grid drained -0.5 silently.
    const s = baseState();
    s.cityStats.employment = 55;
    s.cityStats.population = 600_000; // transit load 100 vs capacity 0
    s.buildings = { districtTemple: 1 }; // 30 slots -> target 30
    const bd = computeEmploymentBreakdown(s);
    expect(bd.transitOverloaded).toBe(true);
    expect(bd.negatives.find((n) => n.label === "Transit overload")?.amount).toBe(0.5);
    expect(bd.netPerTick).toBe(-(EMPLOYMENT_DRIFT_PER_TICK + 0.5));
    // The transit drain gets its own named fix.
    const transitTip = bd.suggestions.find((sg) => /transit overload/i.test(sg.text));
    expect(transitTip?.target).toEqual({
      screen: "construction",
      category: "transit",
      highlight: "undergroundMaglevSystem",
    });
  });
});

describe("employment breakdown — modifiers derive from the live data tables", () => {
  it("licensed companies contribute the sim's capped boost", () => {
    const company = COMPANIES.find((c) => c.employment > 0);
    expect(company).toBeDefined();
    const s = baseState();
    s.cityStats.population = 100_000;
    s.companies = [{ companyId: company!.id, districtId: "d1", licenseDate: 0 }];
    const expected = Math.min(
      ((COMPANIES_MAP[company!.id].employment / 100_000) * 100) * COMPANY_EMPLOYMENT_FACTOR,
      COMPANY_EMPLOYMENT_CAP,
    );
    const bd = computeEmploymentBreakdown(s);
    if (expected > 0) {
      expect(
        bd.positives.find((p) => p.label === "Licensed companies")?.amount,
      ).toBeCloseTo(expected, 5);
    }
    // A huge payroll against a small population hits the sim's +5 cap.
    s.cityStats.population = 100;
    const capped = computeEmploymentBreakdown(s);
    expect(
      capped.positives.find((p) => p.label === "Licensed companies")?.amount,
    ).toBe(COMPANY_EMPLOYMENT_CAP);
  });

  it("employment-boosting and employment-draining edicts both surface", () => {
    const boosting = ALL_EDICTS.find((e) => (e.effects.employment ?? 0) > 0);
    const draining = ALL_EDICTS.find((e) => (e.effects.employment ?? 0) < 0);
    expect(boosting).toBeDefined();
    expect(draining).toBeDefined();
    const s = baseState();
    s.activeEdicts = [activeEdict(boosting!.id), activeEdict(draining!.id)];
    const bd = computeEmploymentBreakdown(s);
    expect(bd.positives.find((p) => p.label === "Employment edicts")?.amount).toBe(
      boosting!.effects.employment,
    );
    expect(bd.negatives.find((n) => n.label === "Restrictive edicts")?.amount).toBe(
      -draining!.effects.employment!,
    );
    // The lookup goes through the same table as the sim.
    expect(getEdictById(boosting!.id)?.effects.employment).toBe(boosting!.effects.employment);
  });

  it("jobs and austerity policies both surface", () => {
    const boosting = ALL_POLICIES.find((p) => (p.effects.employment ?? 0) > 0);
    const draining = ALL_POLICIES.find((p) => (p.effects.employment ?? 0) < 0);
    expect(boosting).toBeDefined();
    expect(draining).toBeDefined();
    const s = baseState();
    s.activePolicies = [boosting!.id, draining!.id];
    const bd = computeEmploymentBreakdown(s);
    expect(bd.positives.find((p) => p.label === "Jobs policies")?.amount).toBe(
      boosting!.effects.employment,
    );
    expect(bd.negatives.find((n) => n.label === "Austerity policies")?.amount).toBe(
      -draining!.effects.employment!,
    );
  });

  it("any employment-boosting edict suppresses the enact-an-edict tip", () => {
    const s = baseState();
    s.cityStats.employment = 20; // alarm
    const before = computeEmploymentBreakdown(s);
    expect(before.suggestions.some((sg) => sg.target?.screen === "law")).toBe(true);
    const boosting = ALL_EDICTS.find((e) => (e.effects.employment ?? 0) > 0);
    s.activeEdicts = [activeEdict(boosting!.id)];
    const after = computeEmploymentBreakdown(s);
    expect(after.suggestions.some((sg) => sg.target?.screen === "law")).toBe(false);
  });
});

describe("employment fix suggestions — deep-links stay valid", () => {
  type ConstructionTarget = Extract<EmploymentSuggestionTarget, { screen: "construction" }>;

  const constructionSource = engineSource("../../app/(game)/construction.tsx");
  const validCategoryIds = new Set(
    [...constructionSource.matchAll(/id:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]),
  );

  // A worst-case sector that trips every suggestion branch at once: no jobs,
  // no companies, no edicts, overloaded transit, and a job-slot target (30)
  // at or below current employment so the market is dragging it down.
  const crisisState = (): GameState => {
    const s = baseState();
    s.cityStats.employment = 40;
    s.cityStats.population = 600_000; // transit load 100 vs capacity 0
    return s;
  };

  it("the worst case offers the full fix set", () => {
    const { suggestions } = computeEmploymentBreakdown(crisisState());
    // build-industry + fix-transit + enact-edict + license-companies.
    expect(suggestions).toHaveLength(4);
    const screens = suggestions.map((sg) => sg.target?.screen);
    expect(screens).toContain("construction");
    expect(screens).toContain("law");
    expect(screens).toContain("companies");
  });

  it("every construction deep-link resolves to a real category id", () => {
    const targets = computeEmploymentBreakdown(crisisState())
      .suggestions.map((sg) => sg.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(
        validCategoryIds.has(target.category),
        `employment fix tip deep-links to construction category "${target.category}", which is not a real CATEGORIES id in construction.tsx`,
      ).toBe(true);
    }
  });

  it("every suggested deep-link resolves to a known destination screen", () => {
    const validScreens = new Set(["construction", "law", "companies"]);
    const screens = computeEmploymentBreakdown(crisisState())
      .suggestions.map((sg) => sg.target?.screen)
      .filter((x): x is NonNullable<typeof x> => x != null);
    expect(screens.length).toBeGreaterThan(0);
    for (const screen of screens) {
      expect(validScreens.has(screen), `unknown deep-link screen "${screen}"`).toBe(true);
    }
  });

  it("navigates every target a worst-case diagnosis can emit — no dead taps", () => {
    const push = router.push as unknown as ReturnType<typeof vi.fn>;
    const targets = computeEmploymentBreakdown(crisisState())
      .suggestions.map((suggestion) => suggestion.target)
      .filter((target): target is NonNullable<typeof target> => !!target);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      push.mockReset();
      navigateToEmploymentSuggestion(target);
      expect(push, `employment recovery tip for screen "${target.screen}" did nothing`).toHaveBeenCalledTimes(1);
    }
  });

  it("the card always offers at least one fix when employment is low", () => {
    // Employment low but every specific branch satisfied -> fallback fires.
    const s = baseState();
    s.cityStats.employment = 40;
    s.buildings = { megaManufacturingPlants: 200 }; // target 100 > employment
    const boosting = ALL_EDICTS.find((e) => (e.effects.employment ?? 0) > 0);
    s.activeEdicts = [activeEdict(boosting!.id)];
    const company = COMPANIES.find((c) => c.employment > 0);
    s.companies = [{ companyId: company!.id, districtId: "d1", licenseDate: 0 }];
    const bd = computeEmploymentBreakdown(s);
    expect(bd.suggestions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("employment weights and formulas stay pinned to the sim", () => {
  const formulasSource = engineSource("../formulas.ts");

  const pinned = (key: string, weight: number): boolean => {
    const w = String(weight).replace(".", "\\.");
    return new RegExp(`"${key}"\\s*\\)\\s*\\*\\s*${w}\\b`).test(formulasSource);
  };

  it("every job-slot weight matches the sim", () => {
    for (const [key, weight] of Object.entries(JOB_SLOT_WEIGHTS)) {
      expect(pinned(key, weight), `job-slot building "${key}" (weight ${weight}) drifted`).toBe(true);
    }
  });

  it("the target formula, drift, and company boost match the sim", () => {
    // Target: floor(jobSlots / shared cohort workforce capacity * 100) + 30,
    // capped at 100.
    expect(formulasSource).toMatch(
      new RegExp(
        `Math\\.floor\\(\\(jobSlots / Math\\.max\\(1, cohortCapacity\\)\\) \\* 100\\) \\+ ${EMPLOYMENT_TARGET_BASE_BONUS}\\b`,
      ),
    );
    // Drift: strictly-above target -> +1, otherwise -1.
    expect(formulasSource).toMatch(
      /targetEmployment > cs\.employment \? 1 : -1/,
    );
    // Company boost: min(payroll% * 0.2, 5).
    expect(formulasSource).toMatch(
      new RegExp(
        `companyEmploymentPct \\* ${String(COMPANY_EMPLOYMENT_FACTOR).replace(".", "\\.")}, ${COMPANY_EMPLOYMENT_CAP}\\b`,
      ),
    );
    // Active edicts and policies both apply fx.employment per tick.
    const applications = formulasSource.match(
      /if \(fx\.employment\) cs\.employment = clampStat\(cs\.employment \+ fx\.employment\);/g,
    );
    expect(applications?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("employment breakdown — overview entry points stay wired", () => {
  // The card is only discoverable if the overview screen actually links to it.
  // Source pins on app/(game)/overview.tsx (un-importable Expo screen module).
  const overviewSource = engineSource("../../app/(game)/overview.tsx");

  it("the EMPLOYMENT stat cell scrolls to the employment card", () => {
    expect(overviewSource).toContain('EMPLOYMENT: "scroll:employment"');
    // And the scroll target is registered where the card is rendered.
    expect(overviewSource).toContain("breakdownCardYRef.current.employment");
    expect(overviewSource).toContain("<EmploymentBreakdownCard state={state} />");
  });

  it("the card shows every factor — no truncation of contributors", () => {
    const cardSource = engineSource("../../components/EmploymentBreakdownCard.tsx");
    expect(cardSource).not.toContain(".slice(0,");
  });
});

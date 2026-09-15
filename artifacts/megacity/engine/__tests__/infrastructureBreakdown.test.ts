import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "@/engine/initialState";
import { applyInfrastructureHealthDelta } from "@/engine/infrastructureLedger";
import {
  computeInfrastructureBreakdown,
  computeRepairStrength,
  computeRepairContribution,
  REPAIR_UNIT_WEIGHTS,
  INFRA_CREDITS_BONUS_THRESHOLD,
  INFRA_STEEL_BONUS_THRESHOLD,
  INFRA_UNREST_PENALTY_THRESHOLD,
  INFRA_REPAIR_CONTRIBUTION_CAP,
  INFRA_TECH_STAT_DIVISOR,
  INFRASTRUCTURE_HEALTH_CAP,
  INFRA_EDICT_IDS,
  type InfraSuggestionTarget,
} from "@/engine/infrastructureBreakdown";
import type { GameState } from "@/engine/types";
import { runTick } from "@/engine/formulas";
import { navigateToInfraSuggestion } from "@/utils/infrastructureNavigation";
import { router } from "expo-router";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure breakdown — the "diagnose -> one-tap fix" card for Infrastructure
// Health, mirroring the power / water / crime pattern. Higher is better, so a
// positive netPerTick means the stat is RISING (good). These tests prove:
//   1. the readout's repair weights and stockpile / disorder thresholds match the
//      sim's INFRASTRUCTURE HEALTH block exactly, and
//   2. every construction-category deep-link resolves to a real category id.
// ─────────────────────────────────────────────────────────────────────────────

const engineSource = (rel: string) =>
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), "utf8");

// A clean slate: every infra lever neutral, so each test opts in to exactly the
// contributors it means to exercise.
function baseState(): GameState {
  const s = createInitialState();
  s.units = {};
  s.unlockedTechnologies = [];
  s.resources = { ...s.resources, credits: 0, steel: 0, power: 100 };
  s.cityStats.unrest = 10;
  s.cityStats.infrastructureHealth = 70;
  return s;
}

describe("infrastructure breakdown — levers mirror the sim", () => {
  it("exposes open-ended ledger capacity, integrity, and recent incident scope", () => {
    const s = baseState();
    s.infrastructureLedger = {
      version: 1,
      totalPoints: 1_240_000,
      intactPoints: 1_078_800,
      assets: {
        "military:shield": {
          id: "military:shield",
          key: "shield",
          source: "military",
          category: "defense",
          count: 1,
          points: 3,
          maxIntegrity: 100,
          integrity: 87,
        },
      },
      incidents: [
        {
          id: "repair-1",
          kind: "repair",
          amount: 120,
          tick: 12,
          reason: "Crew dispatch",
        },
        {
          id: "damage-1",
          kind: "damage",
          amount: 340,
          tick: 11,
          reason: "Orbital strike",
          assetId: "military:shield",
        } as NonNullable<typeof s.infrastructureLedger>["incidents"][number] & { assetId: string },
      ],
      summaries: {},
    };
    const bd = computeInfrastructureBreakdown(s);

    expect(bd.totalPoints).toBe(1_240_000);
    expect(bd.intactPoints).toBe(1_078_800);
    expect(bd.integrityPercent).toBeCloseTo(87, 5);
    expect(bd.recentDamage).toEqual(expect.objectContaining({
      amount: 340,
      source: "military",
      category: "defense",
      reason: "Orbital strike",
    }));
    expect(bd.recentRepair).toEqual(expect.objectContaining({
      amount: 120,
      reason: "Crew dispatch",
    }));
  });

  it("computeRepairStrength / computeRepairContribution weight and cap the crews", () => {
    // infrastructureRepairTeams weight 0.2 -> strength 20 -> floor(2) = 2.
    expect(computeRepairStrength({ infrastructureRepairTeams: 100 })).toBeCloseTo(20, 5);
    expect(computeRepairContribution({ infrastructureRepairTeams: 100 })).toBe(2);
    // emergencyRepairUnits weight 0.3 -> strength 90 -> floor(9) capped at 5.
    expect(computeRepairContribution({ emergencyRepairUnits: 300 })).toBe(5);
  });

  it("a well-funded, repaired sector reports a rising trend and no alarms", () => {
    const s = baseState();
    s.units = { infrastructureRepairTeams: 100 }; // +2
    s.resources = { ...s.resources, credits: 20000, steel: 200, power: 500 }; // +1, +1
    s.cityStats.infrastructureHealth = 80;
    const bd = computeInfrastructureBreakdown(s);
    expect(bd.netPerTick).toBe(4);
    expect(bd.positives.find((p) => p.label === "Repair & maintenance crews")?.amount).toBe(2);
    expect(bd.positives.some((p) => p.label === "Funded treasury")).toBe(true);
    expect(bd.positives.some((p) => p.label === "Steel stockpile")).toBe(true);
    expect(bd.suggestions).toHaveLength(0);
  });

  it("treats 100 as a valid hard cap instead of reporting a hidden rise", () => {
    const s = baseState();
    s.cityStats.infrastructureHealth = INFRASTRUCTURE_HEALTH_CAP;
    s.units = { emergencyRepairUnits: 300 };
    s.resources = { ...s.resources, credits: 20000, steel: 200, power: 500 };

    const bd = computeInfrastructureBreakdown(s);

    expect(bd.infrastructureHealth).toBe(INFRASTRUCTURE_HEALTH_CAP);
    expect(bd.projectedInfrastructureHealth).toBe(INFRASTRUCTURE_HEALTH_CAP);
    expect(bd.netPerTick).toBe(0);
    expect(bd.trend).toBe("holding");
    expect(bd.atCap).toBe(true);
  });

  it("includes recurring edict and licensed-company contributions before applying the cap", () => {
    const s = baseState();
    s.activeEdicts = [
      { edictId: "infrastructure_blitz", ticksRemaining: 3, issuedAtTick: 0, cooldownUntilTick: 20 },
    ];
    s.companies = [{
      companyId: "helios-grid",
      districtId: s.districts[0]?.id ?? "central-command",
      licenseDate: 0,
    }];

    const bd = computeInfrastructureBreakdown(s);

    expect(bd.positives).toContainEqual(expect.objectContaining({
      label: "Infrastructure Repair Blitz edict",
      amount: 12,
    }));
    expect(bd.positives).toContainEqual(expect.objectContaining({
      label: "Licensed company stability",
      amount: 0.2,
    }));
    expect(bd.netPerTick).toBeCloseTo(12.2, 5);
  });

  it("proves the live tick can reach the valid 100-point target", () => {
    const initial = createInitialState();
    const s = applyInfrastructureHealthDelta(
      initial,
      99 - initial.cityStats.infrastructureHealth,
      "test:seed:near-cap",
    );
    s.tickPaused = false;
    s.cityStats.unrest = 0;
    s.resources = { ...s.resources, credits: 20000, steel: 200, power: 500 };
    s.units = { emergencyRepairUnits: 300 };
    s.companies = [];
    s.activeEdicts = [];
    s.unlockedTechnologies = [];
    s.activeEvents = [];

    const { newState } = runTick(s);

    expect(newState.cityStats.infrastructureHealth).toBe(INFRASTRUCTURE_HEALTH_CAP);
  });

  it("a neglected sector lists the drags and reads as degrading", () => {
    const s = baseState();
    s.cityStats.unrest = 80; // > 70 -> -2
    s.resources = { ...s.resources, power: -10 }; // < 0 -> -1
    const bd = computeInfrastructureBreakdown(s);
    expect(bd.negatives.find((n) => n.label === "Civil unrest")?.amount).toBe(2);
    expect(bd.negatives.find((n) => n.label === "Power deficit")?.amount).toBe(1);
    expect(bd.netPerTick).toBe(-3);
  });

  it("includes the same technology infrastructure modifier as the tick", () => {
    const s = baseState();
    // advanced_fusion_reactors declares infrastructureHealth: 2; formulas.ts applies
    // it through techInfraMod = effect / TECH_STAT_DIVISOR (2 / 4 = 0.5).
    s.unlockedTechnologies = ["advanced_fusion_reactors"];
    const bd = computeInfrastructureBreakdown(s);
    expect(INFRA_TECH_STAT_DIVISOR).toBe(4);
    expect(bd.netPerTick).toBe(0.5);
    expect(bd.positives).toContainEqual({
      label: "Infrastructure research",
      amount: 0.5,
    });
  });
});

describe("infrastructure recovery suggestions — deep-links stay valid", () => {
  type ConstructionTarget = Extract<InfraSuggestionTarget, { screen: "construction" }>;

  const constructionSource = engineSource("../../app/(game)/construction.tsx");
  const validCategoryIds = new Set(
    [...constructionSource.matchAll(/id:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]),
  );

  // A run-down sector with no crews, a power deficit, high unrest, and empty
  // stockpiles trips every recovery branch at once.
  const worstCaseState = (): GameState => {
    const s = baseState();
    s.cityStats.infrastructureHealth = 10;
    s.cityStats.unrest = 80;
    s.resources = { ...s.resources, credits: 0, steel: 0, power: -10 };
    s.units = {};
    return s;
  };

  it("parses a sane set of construction category ids", () => {
    expect(validCategoryIds.size).toBeGreaterThanOrEqual(10);
    expect(validCategoryIds.has("energy")).toBe(true);
    expect(validCategoryIds.has("industrial")).toBe(true);
  });

  it("drives every suggestion branch", () => {
    const { suggestions } = computeInfrastructureBreakdown(worstCaseState());
    // crews + power + unrest + enact-an-edict + steel + treasury = 6 branches.
    expect(suggestions).toHaveLength(6);
    const screens = suggestions.map((s) => s.target?.screen);
    expect(screens).toContain("recruitment");
    expect(screens).toContain("law");
    // The treasury tip is deliberately targetless (no single screen fixes it).
    expect(suggestions.filter((s) => !s.target)).toHaveLength(1);
    const categories = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction")
      .map((t) => t.category);
    expect(categories).toEqual(["energy", "industrial"]);
    // With no infra edict active, the card offers enacting one (law screen).
    const edictTip = suggestions.find((s) => /edict/i.test(s.text));
    expect(edictTip?.target).toEqual({ screen: "law" });
  });

  it("the enact-an-edict tip disappears once an infrastructure edict is in force", () => {
    const s = worstCaseState();
    s.activeEdicts = [
      { edictId: INFRA_EDICT_IDS[0], ticksRemaining: 4, issuedAtTick: 0, cooldownUntilTick: 30 },
    ];
    const { suggestions } = computeInfrastructureBreakdown(s);
    // crews + power + unrest + steel + treasury = 5 branches, no edict tip.
    expect(suggestions).toHaveLength(5);
    expect(suggestions.some((sg) => /edict/i.test(sg.text))).toBe(false);
  });

  it("a repair edict outside the recommended list still suppresses the tip", () => {
    const s = worstCaseState();
    // emergency_infrastructure_blitz adds infrastructureRepair but is not named in
    // INFRA_EDICT_IDS — the derived gate must still catch it and drop the nag.
    s.activeEdicts = [
      { edictId: "emergency_infrastructure_blitz", ticksRemaining: 3, issuedAtTick: 0, cooldownUntilTick: 20 },
    ];
    const { suggestions } = computeInfrastructureBreakdown(s);
    expect(suggestions.some((sg) => /edict/i.test(sg.text))).toBe(false);
  });

  it("every construction deep-link resolves to a real category id", () => {
    const targets = computeInfrastructureBreakdown(worstCaseState())
      .suggestions.map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(
        validCategoryIds.has(target.category),
        `infra recovery tip deep-links to construction category "${target.category}", which is not a real CATEGORIES id in construction.tsx`,
      ).toBe(true);
    }
  });

  it("navigates every target a worst-case diagnosis can emit — no dead taps", () => {
    const push = router.push as unknown as ReturnType<typeof vi.fn>;
    const targets = computeInfrastructureBreakdown(worstCaseState())
      .suggestions.map((suggestion) => suggestion.target)
      .filter((target): target is NonNullable<typeof target> => !!target);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      push.mockReset();
      navigateToInfraSuggestion(target);
      expect(push, `infrastructure recovery tip for screen "${target.screen}" did nothing`).toHaveBeenCalledTimes(1);
    }
  });

  it("the power tip lands on the highest-output power plant", () => {
    const tip = computeInfrastructureBreakdown(worstCaseState())
      .suggestions.map((s) => s.target)
      .find(
        (t): t is ConstructionTarget => t?.screen === "construction" && t.category === "energy",
      );
    expect(tip?.highlight).toBe("fusionReactors");
  });
});

describe("infrastructure levers stay pinned to the sim", () => {
  const formulasSource = engineSource("../formulas.ts");

  it("every repair-unit weight matches the sim", () => {
    for (const [key, weight] of Object.entries(REPAIR_UNIT_WEIGHTS)) {
      const w = String(weight).replace(".", "\\.");
      expect(
        new RegExp(`"${key}"\\s*\\)\\s*\\*\\s*${w}\\b`).test(formulasSource),
        `repair unit "${key}" (weight ${weight}) drifted`,
      ).toBe(true);
    }
  });

  it("the stockpile / disorder thresholds and repair cap match the sim", () => {
    expect(new RegExp(`credits\\s*>\\s*${INFRA_CREDITS_BONUS_THRESHOLD}\\b`).test(formulasSource)).toBe(
      true,
    );
    expect(new RegExp(`steel\\s*>\\s*${INFRA_STEEL_BONUS_THRESHOLD}\\b`).test(formulasSource)).toBe(
      true,
    );
    expect(new RegExp(`unrest\\s*>\\s*${INFRA_UNREST_PENALTY_THRESHOLD}\\b`).test(formulasSource)).toBe(
      true,
    );
    expect(/power\s*<\s*0\b/.test(formulasSource)).toBe(true);
    // min(floor(repairStrength * 0.1), <cap>)
    expect(
      new RegExp(`Math\\.floor\\(repairStrength\\s*\\*\\s*0\\.1\\)\\s*,\\s*${INFRA_REPAIR_CONTRIBUTION_CAP}\\b`).test(
        formulasSource,
      ),
    ).toBe(true);
  });

  it("the infrastructure modifier is applied by the sim and uses the same divisor", () => {
    expect(/const TECH_STAT_DIVISOR = 4/.test(formulasSource)).toBe(true);
    expect(
      /const techInfraMod =[\s\S]*?\/ TECH_STAT_DIVISOR;/.test(formulasSource),
    ).toBe(true);
    expect(/infraDelta\s*\+=\s*techInfraMod/.test(formulasSource)).toBe(true);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTION_COST_PLAYER_GUIDE,
  ACTION_COST_TERMINOLOGY,
  formatActionCostTiming,
  getDecreeCostTiming,
  getEdictCostTiming,
  getPolicyCostTiming,
  getTimedActionCostTiming,
} from "@/engine/actionCostTiming";
import { EDICTS } from "@/engine/edicts";
import { ALL_POLICIES } from "@/engine/policies";
import { POLITICAL_DECREES } from "@/engine/politicsData";
import { OFFICER_MISSIONS } from "@/engine/officerMissions";
import { MILITARY_MISSIONS, MILITARY_RESEARCH } from "@/engine/militaryOverhaul";
import { getWarRoomOpDuration, WAR_ROOM_OPS } from "@/engine/warRoomData";

const projectRoot = process.cwd();

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const absolute = path.join(root, name);
    if (statSync(absolute).isDirectory()) out.push(...sourceFiles(absolute));
    else if (/\.(?:ts|tsx)$/.test(name)) out.push(absolute);
  }
  return out;
}

describe("game-wide action display parity", () => {
  it("formats every credit-based action catalog from live definitions", () => {
    const models = [
      ...EDICTS.map((definition) => [definition.id, getEdictCostTiming(definition)] as const),
      ...ALL_POLICIES.map((definition) => [definition.id, getPolicyCostTiming(definition)] as const),
      ...POLITICAL_DECREES.map((definition) => [definition.id, getDecreeCostTiming(definition)] as const),
      ...OFFICER_MISSIONS.map((definition) => [
        definition.id,
        getTimedActionCostTiming({ cost: definition.creditsCost, duration: definition.duration }),
      ] as const),
      ...MILITARY_MISSIONS.map((definition) => [
        definition.id,
        getTimedActionCostTiming({ cost: definition.creditsCost, duration: definition.duration }),
      ] as const),
      ...MILITARY_RESEARCH.map((definition) => [
        definition.id,
        getTimedActionCostTiming({ cost: definition.cost, duration: definition.ticksToComplete }),
      ] as const),
      ...WAR_ROOM_OPS.map((definition) => [
        definition.id,
        getTimedActionCostTiming({ cost: definition.cost, duration: getWarRoomOpDuration(definition) }),
      ] as const),
    ];

    expect(models.length).toBeGreaterThan(100);
    for (const [id, model] of models) {
      const rows = formatActionCostTiming(model);
      expect(rows, id).toContainEqual({
        key: "upfront-cost",
        label: ACTION_COST_TERMINOLOGY.upfrontCost,
        value: model.upfrontCostCredits > 0
          ? `${model.upfrontCostCredits.toLocaleString()} cr`
          : "None",
      });
      expect(rows.some((row) => row.key === "duration"), id).toBe(true);
      expect(rows.some((row) => row.key === "maximum-cost"), id).toBe(true);
      if (model.runningCostPerTickCredits > 0) {
        expect(rows.some((row) => row.key === "running-cost"), id).toBe(true);
      }
      if (model.cooldownTicks > 0) {
        expect(rows.some((row) => row.key === "cooldown"), id).toBe(true);
      }
    }
  });

  it("does not allow ambiguous credit/duration slash labels in player-facing source", () => {
    const files = [
      ...sourceFiles(path.join(projectRoot, "app")),
      ...sourceFiles(path.join(projectRoot, "components")),
      path.join(projectRoot, "data", "manualContent.ts"),
    ];
    const ambiguous =
      /(?:\d[\d,.]*|\$\{[^}]+\})\s*(?:cr|credits?)\s*\/\s*(?:\d[\d,.]*|\$\{[^}]+\})\s*(?:ticks?|turns?)/gi;
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(ambiguous)) {
        offenders.push(`${path.relative(projectRoot, file)}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps Codex, onboarding, and the manual on one terminology guide", () => {
    expect(ACTION_COST_PLAYER_GUIDE).toContain(ACTION_COST_TERMINOLOGY.upfrontCost);
    expect(ACTION_COST_PLAYER_GUIDE).toContain(ACTION_COST_TERMINOLOGY.runningCost);
    expect(ACTION_COST_PLAYER_GUIDE).toContain(ACTION_COST_TERMINOLOGY.activeFor);
    expect(ACTION_COST_PLAYER_GUIDE).toContain(ACTION_COST_TERMINOLOGY.maximumTotalCost);
    expect(ACTION_COST_PLAYER_GUIDE).toContain(ACTION_COST_TERMINOLOGY.cooldown);

    for (const relativePath of [
      "app/(game)/codex.tsx",
      "app/(game)/onboarding.tsx",
      "data/manualContent.ts",
    ]) {
      expect(readFileSync(path.join(projectRoot, relativePath), "utf8"), relativePath)
        .toContain("ACTION_COST_PLAYER_GUIDE");
    }

    const onboarding = readFileSync(path.join(projectRoot, "app/(game)/onboarding.tsx"), "utf8");
    expect(onboarding).toContain("getEdictCostTiming");
    expect(onboarding).not.toContain("ONBOARDING_BUILD_COST");
  });

  it("keeps hand-authored guides free of numeric credit claims", () => {
    const numericCreditClaim = /\b\d[\d,]*\s*(?:cr|credits?)\b/gi;
    const offenders: string[] = [];
    for (const relativePath of [
      "app/(game)/codex.tsx",
      "app/(game)/onboarding.tsx",
      "data/manualContent.ts",
    ]) {
      const source = readFileSync(path.join(projectRoot, relativePath), "utf8");
      for (const match of source.matchAll(numericCreditClaim)) {
        offenders.push(`${relativePath}: ${match[0]}`);
      }
    }
    expect(offenders, "Numeric action costs belong in live definitions and shared formatters").toEqual([]);
  });
});
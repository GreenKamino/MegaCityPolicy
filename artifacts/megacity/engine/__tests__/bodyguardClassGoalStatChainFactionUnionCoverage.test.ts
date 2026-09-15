import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BODYGUARD_DEFS,
  type BodyguardClass,
} from "@/engine/bodyguardData";
import {
  PERSONAL_GOAL_TEMPLATES,
  readGoalStat,
  type GoalStatKey,
} from "@/engine/personalGoals";
import { CORPORATE_CHAINS, type ChainFaction } from "@/engine/corporateChains";
import { createInitialState } from "@/engine/initialState";

/**
 * Drift guard: bodyguard / goal-stat / chain-faction unions.
 *
 *   BodyguardClass(9)  ↔ BODYGUARD_DEFS[].classId — 1:1, unique
 *                         classIds, non-empty narrative, positive
 *                         baseCombat / baseLoyalty / recruitCost,
 *                         ≥1 ability per def.
 *
 *   GoalStatKey(9)     ↔ PERSONAL_GOAL_TEMPLATES[].statKey usage
 *                         AND readGoalStat() switch — every union
 *                         member is reachable both as a template
 *                         tag and as a switch branch (no orphan
 *                         counter, no orphan reader). Each branch
 *                         returns a finite non-negative number on
 *                         a fresh state.
 *
 *   ChainFaction(7)    ↔ CORPORATE_CHAINS[].faction — every union
 *                         member used by ≥1 chain (no dead faction
 *                         splash); ids unique.
 */

const BODYGUARD_SRC = readFileSync(
  join(__dirname, "..", "bodyguardData.ts"),
  "utf8",
);
const GOALS_SRC = readFileSync(join(__dirname, "..", "personalGoals.ts"), "utf8");
const CHAIN_SRC = readFileSync(
  join(__dirname, "..", "corporateChains.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const BODYGUARD_CLASS = parseUnion(BODYGUARD_SRC, "BodyguardClass");
const GOAL_STAT_KEY = parseUnion(GOALS_SRC, "GoalStatKey");
const CHAIN_FACTION = parseUnion(CHAIN_SRC, "ChainFaction");

describe("bodyguard / goal-stat / chain-faction union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(BODYGUARD_CLASS.length).toBe(9);
    expect(GOAL_STAT_KEY.length).toBe(9);
    expect(CHAIN_FACTION.length).toBe(7);
  });

  it("BODYGUARD_DEFS catalog matches BodyguardClass 1:1 with sane invariants", () => {
    const want = [...BODYGUARD_CLASS].sort();
    const got = BODYGUARD_DEFS.map((d) => d.classId as string).sort();
    expect(got).toEqual(want);
    const ids = new Set<string>();
    for (const d of BODYGUARD_DEFS) {
      expect(ids.has(d.classId), `duplicate bodyguard class ${d.classId}`).toBe(false);
      ids.add(d.classId);
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(d.baseCombat).toBeGreaterThan(0);
      expect(d.baseLoyalty).toBeGreaterThan(0);
      expect(d.recruitCost).toBeGreaterThan(0);
      expect(d.abilities.length).toBeGreaterThan(0);
    }
    // Type touch.
    const sample: BodyguardClass = BODYGUARD_DEFS[0].classId;
    expect(typeof sample).toBe("string");
  });

  it("GoalStatKey — every union member is used by ≥1 PERSONAL_GOAL_TEMPLATES entry AND has a readGoalStat() branch", () => {
    const known = new Set(GOAL_STAT_KEY);
    const usedByTemplate = new Set<string>();
    for (const t of PERSONAL_GOAL_TEMPLATES) {
      expect(known.has(t.statKey), `${t.id} unknown statKey ${t.statKey}`).toBe(true);
      usedByTemplate.add(t.statKey);
    }
    const orphanTpl = GOAL_STAT_KEY.filter((k) => !usedByTemplate.has(k));
    expect(orphanTpl, "GoalStatKey members unused in PERSONAL_GOAL_TEMPLATES").toEqual([]);

    // Switch coverage: every union literal must appear as a `case`
    // branch in readGoalStat(). Source-grep is sufficient since the
    // function is module-private at the switch level.
    for (const k of GOAL_STAT_KEY) {
      expect(GOALS_SRC, `readGoalStat missing case "${k}"`).toContain(`case "${k}"`);
    }

    // Behavioural smoke: each branch returns a finite non-negative
    // number on a fresh game state.
    const state = createInitialState();
    for (const k of GOAL_STAT_KEY) {
      const v = readGoalStat(state, k as GoalStatKey, 0);
      expect(Number.isFinite(v), `readGoalStat(${k}) returned non-finite ${v}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("CORPORATE_CHAINS[].faction covers every ChainFaction union member; ids unique", () => {
    const known = new Set(CHAIN_FACTION);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const c of CORPORATE_CHAINS) {
      expect(known.has(c.faction), `${c.id} unknown faction ${c.faction}`).toBe(true);
      expect(ids.has(c.id), `duplicate chain id ${c.id}`).toBe(false);
      ids.add(c.id);
      used.add(c.faction);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.shortName.length).toBeGreaterThan(0);
    }
    const orphan = CHAIN_FACTION.filter((f) => !used.has(f));
    expect(orphan, "ChainFaction members unused in CORPORATE_CHAINS").toEqual([]);
  });
});

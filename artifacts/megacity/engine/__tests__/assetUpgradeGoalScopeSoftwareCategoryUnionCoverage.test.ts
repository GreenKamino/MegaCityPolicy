import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ASSET_UPGRADES,
  type AssetUpgradeTarget,
} from "@/engine/assetUpgrades";
import {
  PERSONAL_GOAL_TEMPLATES,
  type GoalScope,
} from "@/engine/personalGoals";
import {
  SOFTWARE_UPGRADES,
  UPGRADE_CATEGORY_LABELS,
  UPGRADE_CATEGORY_ICONS,
  type UpgradeCategory,
} from "@/engine/softwareUpgrades";

/**
 * Drift guard: progression / meta-goal / software unions vs the
 * catalogs and Records that source them.
 *
 *   AssetUpgradeTarget(3) ↔ ASSET_UPGRADES[].target usage; every
 *                            union member used by ≥1 def; literal
 *                            order pinned unit → captain → follower.
 *
 *   GoalScope(3)          ↔ PERSONAL_GOAL_TEMPLATES[].scope usage;
 *                            every scope has ≥1 template (otherwise
 *                            refreshPersonalGoals() leaves a slot
 *                            permanently empty); literal order
 *                            pinned short → mid → long matches the
 *                            scope iteration order in
 *                            refreshPersonalGoals().
 *
 *   UpgradeCategory(8)    ↔ UPGRADE_CATEGORY_LABELS /
 *                            UPGRADE_CATEGORY_ICONS Records (1:1)
 *                            AND SOFTWARE_UPGRADES[].category usage;
 *                            every member used by ≥1 def with
 *                            UPPERCASE labels.
 */

const ASSET_SRC = readFileSync(join(__dirname, "..", "assetUpgrades.ts"), "utf8");
const GOALS_SRC = readFileSync(join(__dirname, "..", "personalGoals.ts"), "utf8");
const SOFTWARE_SRC = readFileSync(
  join(__dirname, "..", "softwareUpgrades.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const ASSET_UPGRADE_TARGET = parseUnion(ASSET_SRC, "AssetUpgradeTarget");
const GOAL_SCOPE = parseUnion(GOALS_SRC, "GoalScope");
const UPGRADE_CATEGORY = parseUnion(SOFTWARE_SRC, "UpgradeCategory");

describe("asset-upgrade / goal-scope / software-category union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(ASSET_UPGRADE_TARGET.length).toBe(3);
    expect(GOAL_SCOPE.length).toBe(3);
    expect(UPGRADE_CATEGORY.length).toBe(8);
  });

  it("AssetUpgradeTarget literal order pinned unit→captain→follower; ASSET_UPGRADES covers every member with sane reqs", () => {
    expect(ASSET_UPGRADE_TARGET).toEqual(["unit", "captain", "follower"]);
    const known = new Set(ASSET_UPGRADE_TARGET);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const u of ASSET_UPGRADES) {
      expect(known.has(u.target), `${u.id} unknown target ${u.target}`).toBe(true);
      expect(ids.has(u.id), `duplicate asset-upgrade id ${u.id}`).toBe(false);
      ids.add(u.id);
      used.add(u.target);
      expect(u.name.length).toBeGreaterThan(0);
      expect(u.effectSummary.length).toBeGreaterThan(0);
      expect(u.reqs.credits).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(u.reqs.techIds)).toBe(true);
      expect(Array.isArray(u.reqs.items)).toBe(true);
    }
    const orphan = ASSET_UPGRADE_TARGET.filter((t) => !used.has(t));
    expect(orphan, "AssetUpgradeTarget members unused in ASSET_UPGRADES").toEqual([]);
  });

  it("GoalScope literal order pinned short→mid→long matches refreshPersonalGoals iteration order; every scope has ≥1 template", () => {
    expect(GOAL_SCOPE).toEqual(["short", "mid", "long"]);
    expect(GOALS_SRC).toContain('const scopes: GoalScope[] = ["short", "mid", "long"];');
    const known = new Set(GOAL_SCOPE);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const t of PERSONAL_GOAL_TEMPLATES) {
      expect(known.has(t.scope), `${t.id} unknown scope ${t.scope}`).toBe(true);
      expect(ids.has(t.id), `duplicate goal template id ${t.id}`).toBe(false);
      ids.add(t.id);
      used.add(t.scope);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.title).toBe(t.title.toUpperCase());
      expect(t.target).toBeGreaterThan(0);
      expect(t.rewardCredits).toBeGreaterThan(0);
      expect(t.rewardXp).toBeGreaterThan(0);
    }
    for (const s of GOAL_SCOPE) {
      expect(used.has(s), `scope ${s} has no PERSONAL_GOAL_TEMPLATES entry`).toBe(true);
    }
    // pickTemplate() falls back to repeats only if the same scope has
    // any templates at all — pin minimum 2 per scope so the
    // "no-repeat" path stays exercised in normal play.
    for (const s of GOAL_SCOPE) {
      const count = PERSONAL_GOAL_TEMPLATES.filter((t) => t.scope === s).length;
      expect(count, `scope ${s} has too few templates`).toBeGreaterThanOrEqual(2);
    }
  });

  it("UPGRADE_CATEGORY_LABELS and _ICONS cover UpgradeCategory exactly with UPPERCASE labels and non-empty icons", () => {
    const want = [...UPGRADE_CATEGORY].sort();
    expect(Object.keys(UPGRADE_CATEGORY_LABELS).sort()).toEqual(want);
    expect(Object.keys(UPGRADE_CATEGORY_ICONS).sort()).toEqual(want);
    for (const c of UPGRADE_CATEGORY) {
      const k = c as UpgradeCategory;
      const label = UPGRADE_CATEGORY_LABELS[k];
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.toUpperCase());
      expect(UPGRADE_CATEGORY_ICONS[k].length).toBeGreaterThan(0);
    }
  });

  it("SOFTWARE_UPGRADES[].category covers every UpgradeCategory union member with sane tier ladders", () => {
    const known = new Set(UPGRADE_CATEGORY);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const u of SOFTWARE_UPGRADES) {
      expect(known.has(u.category), `${u.id} unknown category ${u.category}`).toBe(true);
      expect(ids.has(u.id), `duplicate software-upgrade id ${u.id}`).toBe(false);
      ids.add(u.id);
      used.add(u.category);
      expect(u.name.length).toBeGreaterThan(0);
      expect(u.tiers.length).toBeGreaterThan(0);
      expect(u.tiers.length).toBeLessThanOrEqual(u.maxTier);
      // Tier ladder: tiers strictly ascend by tier index, costs
      // monotonically increase, every tier has a non-empty effect.
      let prevTier = 0;
      let prevCost = 0;
      for (const t of u.tiers) {
        expect(t.tier).toBeGreaterThan(prevTier);
        expect(t.cost).toBeGreaterThan(prevCost);
        expect(t.description.length).toBeGreaterThan(0);
        expect(Object.keys(t.effects).length).toBeGreaterThan(0);
        prevTier = t.tier;
        prevCost = t.cost;
      }
    }
    const orphan = UPGRADE_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "UpgradeCategory members unused in SOFTWARE_UPGRADES").toEqual([]);
    // Type touch.
    const sample: AssetUpgradeTarget = ASSET_UPGRADES[0].target;
    const sampleScope: GoalScope = PERSONAL_GOAL_TEMPLATES[0].scope;
    expect(typeof sample).toBe("string");
    expect(typeof sampleScope).toBe("string");
  });
});

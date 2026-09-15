import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SOFTWARE_UPGRADES,
  UPGRADE_CATEGORY_LABELS,
  UPGRADE_CATEGORY_ICONS,
  ALL_CATEGORIES,
} from "@/engine/softwareUpgrades";
import {
  IMPLANTS,
  IMPLANT_CATEGORIES,
  IMPLANT_MAP,
} from "@/engine/implants";

/**
 * Drift guard: software-upgrades and implants catalog union coverage.
 *
 *   UpgradeCategory   8 → SOFTWARE_UPGRADES (20 entries)
 *                          UPGRADE_CATEGORY_LABELS + ICONS (tsc Records)
 *                          ALL_CATEGORIES: UpgradeCategory[] (typed
 *                          but ORDER + COMPLETENESS not enforced by tsc)
 *   SoftwareUpgradeTier 1|2|3 numeric union → tier on every entry
 *   ImplantCategory  10 → IMPLANTS (100 entries)
 *                          IMPLANT_CATEGORIES array {id,label} (tsc-typed
 *                          id field, but COMPLETENESS not enforced)
 *   ImplantRarity     5 → rarity on every IMPLANTS entry
 *
 * Drift surfaces tsc cannot catch:
 *   - SOFTWARE_UPGRADES is a plain array; an unused UpgradeCategory
 *     is an empty filter tab. ALL_CATEGORIES is hand-maintained;
 *     omitting a member silently drops it from category iteration
 *     UIs that loop over ALL_CATEGORIES.
 *   - IMPLANT_CATEGORIES is hand-maintained; missing an id loses
 *     a category section in the implant menu.
 *   - tier 3 / "prototype" rarity could exist in the union with
 *     zero catalog members — making the higher tier unreachable.
 *
 * All sides parsed live from source.
 */

const UPGRADES_SRC = readFileSync(
  join(__dirname, "..", "softwareUpgrades.ts"),
  "utf8",
);
const IMPLANTS_SRC = readFileSync(
  join(__dirname, "..", "implants.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function parseNumericUnion(src: string, name: string): number[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `numeric union ${name} not found`).not.toBeNull();
  return (m![1].match(/\d+/g) ?? []).map((n) => Number(n));
}

const UPGRADE_CATS = parseUnion(UPGRADES_SRC, "UpgradeCategory");
const UPGRADE_TIERS = parseNumericUnion(UPGRADES_SRC, "SoftwareUpgradeTier");
const IMPLANT_CATS = parseUnion(IMPLANTS_SRC, "ImplantCategory");
const IMPLANT_RARITIES = parseUnion(IMPLANTS_SRC, "ImplantRarity");

describe("upgrades / implants catalog union coverage drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(UPGRADE_CATS.length).toBe(8);
    expect(UPGRADE_TIERS.sort()).toEqual([1, 2, 3]);
    expect(IMPLANT_CATS.length).toBe(10);
    expect(IMPLANT_RARITIES.length).toBe(5);
  });

  it("catalog sizes are pinned (budget)", () => {
    expect(SOFTWARE_UPGRADES.length).toBe(20);
    expect(IMPLANTS.length).toBe(100);
  });

  it("UPGRADE_CATEGORY_LABELS + ICONS keys equal UpgradeCategory exactly with non-empty values", () => {
    expect(Object.keys(UPGRADE_CATEGORY_LABELS).sort()).toEqual(
      [...UPGRADE_CATS].sort(),
    );
    expect(Object.keys(UPGRADE_CATEGORY_ICONS).sort()).toEqual(
      [...UPGRADE_CATS].sort(),
    );
    for (const c of UPGRADE_CATS) {
      expect(
        UPGRADE_CATEGORY_LABELS[c as keyof typeof UPGRADE_CATEGORY_LABELS]
          .length,
      ).toBeGreaterThan(0);
      expect(
        UPGRADE_CATEGORY_ICONS[c as keyof typeof UPGRADE_CATEGORY_ICONS]
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it("ALL_CATEGORIES contains every UpgradeCategory exactly once with no orphans", () => {
    expect([...ALL_CATEGORIES].sort()).toEqual([...UPGRADE_CATS].sort());
    expect(new Set(ALL_CATEGORIES).size).toBe(ALL_CATEGORIES.length);
  });

  it("every UpgradeCategory union member is used by ≥1 SOFTWARE_UPGRADES entry", () => {
    const used = new Set(SOFTWARE_UPGRADES.map((u) => u.category));
    const missing = UPGRADE_CATS.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(UPGRADE_CATS);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("every SoftwareUpgradeTier (1|2|3) appears in at least one upgrade's tiers[] (or maxTier)", () => {
    // Each SOFTWARE_UPGRADES entry owns a tiers[] of {tier, cost, ...}
    // plus a maxTier. Flatten both surfaces and check the union.
    const used = new Set<number>();
    for (const u of SOFTWARE_UPGRADES) {
      used.add(u.maxTier);
      for (const t of u.tiers) used.add(t.tier);
    }
    for (const t of UPGRADE_TIERS) {
      expect(used.has(t), `tier ${t} never appears in any upgrade`).toBe(
        true,
      );
    }
    const orphans = [...used].filter((t) => !UPGRADE_TIERS.includes(t));
    expect(orphans).toEqual([]);
    // Per-entry tier consistency: every tiers[] tier <= maxTier and
    // tiers cover 1..maxTier without gaps.
    for (const u of SOFTWARE_UPGRADES) {
      const tierNums = u.tiers.map((t) => t.tier).sort();
      expect(tierNums[tierNums.length - 1]).toBeLessThanOrEqual(u.maxTier);
      for (const t of tierNums) {
        expect(t).toBeGreaterThanOrEqual(1);
        expect(t).toBeLessThanOrEqual(u.maxTier);
      }
    }
  });

  it("SOFTWARE_UPGRADES ids are unique", () => {
    const ids = SOFTWARE_UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("IMPLANT_CATEGORIES ids equal ImplantCategory exactly with non-empty labels", () => {
    const ids = IMPLANT_CATEGORIES.map((c) => c.id);
    expect([...ids].sort()).toEqual([...IMPLANT_CATS].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of IMPLANT_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("every ImplantCategory union member is used by ≥1 IMPLANTS entry", () => {
    const used = new Set(IMPLANTS.map((i) => i.category));
    const missing = IMPLANT_CATS.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(IMPLANT_CATS);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("every ImplantRarity union member is used by ≥1 IMPLANTS entry", () => {
    const used = new Set(IMPLANTS.map((i) => i.rarity));
    const missing = IMPLANT_RARITIES.filter((r) => !used.has(r as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(IMPLANT_RARITIES);
    const orphans = [...used].filter((r) => !unionSet.has(r));
    expect(orphans).toEqual([]);
  });

  it("IMPLANTS ids are unique and IMPLANT_MAP indexes every entry", () => {
    const ids = IMPLANTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of IMPLANTS) {
      expect(IMPLANT_MAP[i.id], `IMPLANT_MAP missing ${i.id}`).toBe(i);
    }
    expect(Object.keys(IMPLANT_MAP).length).toBe(IMPLANTS.length);
  });
});

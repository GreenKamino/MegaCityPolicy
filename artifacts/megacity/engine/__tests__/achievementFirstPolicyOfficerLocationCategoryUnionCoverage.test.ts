import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALL_BASE_ACHIEVEMENTS,
  type AchievementCategory,
} from "@/engine/achievements";
import { FIRSTS, type FirstCategory } from "@/engine/firsts";
import { CITY_POLICIES, type PolicyCategory } from "@/engine/policies";
import {
  OFFICER_ACTION_META,
  OFFICER_ACTION_CATEGORY_ORDER,
  OFFICER_ACTION_CATEGORY_LABELS,
  type OfficerActionCategory,
} from "@/engine/officerActions";
import {
  LOCATION_ACTION_META,
  LOCATION_ACTION_CATEGORY_ORDER,
  LOCATION_ACTION_CATEGORY_LABELS,
  type LocationActionCategory,
} from "@/engine/locationActions";

/**
 * Drift guard: catalog-category unions vs the catalogs they tag.
 *
 *   AchievementCategory(15) ↔ ACHIEVEMENTS[].category — every
 *                              member used by ≥1 achievement;
 *                              ACHIEVEMENTS use only declared
 *                              categories.
 *
 *   FirstCategory(8)        ↔ FIRSTS[].category — same shape; ids
 *                              unique; check is callable.
 *
 *   PolicyCategory(14)      ↔ CITY_POLICIES[].category — every
 *                              union member used by ≥1 policy;
 *                              policies use only declared categories.
 *
 *   OfficerActionCategory(4) ↔ OFFICER_ACTION_META[].category AND
 *                              OFFICER_ACTION_CATEGORY_ORDER /
 *                              _LABELS Records (1:1) AND order list
 *                              matches union literal order.
 *
 *   LocationActionCategory(3) ↔ LOCATION_ACTION_META[].category AND
 *                              LOCATION_ACTION_CATEGORY_ORDER /
 *                              _LABELS Records (1:1) AND order list
 *                              matches union literal order.
 */

const ACHIEVEMENTS_SRC = readFileSync(
  join(__dirname, "..", "achievements.ts"),
  "utf8",
);
const FIRSTS_SRC = readFileSync(join(__dirname, "..", "firsts.ts"), "utf8");
const POLICIES_SRC = readFileSync(
  join(__dirname, "..", "policies.ts"),
  "utf8",
);
const OFFICER_SRC = readFileSync(
  join(__dirname, "..", "officerActions.ts"),
  "utf8",
);
const LOCATION_SRC = readFileSync(
  join(__dirname, "..", "locationActions.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const ACHIEVEMENT_CATEGORY = parseUnion(ACHIEVEMENTS_SRC, "AchievementCategory");
const FIRST_CATEGORY = parseUnion(FIRSTS_SRC, "FirstCategory");
const POLICY_CATEGORY = parseUnion(POLICIES_SRC, "PolicyCategory");
const OFFICER_ACTION_CATEGORY = parseUnion(OFFICER_SRC, "OfficerActionCategory");
const LOCATION_ACTION_CATEGORY = parseUnion(
  LOCATION_SRC,
  "LocationActionCategory",
);

describe("achievement / first / policy / officer-action / location-action category union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(ACHIEVEMENT_CATEGORY.length).toBe(15);
    expect(FIRST_CATEGORY.length).toBe(8);
    expect(POLICY_CATEGORY.length).toBe(14);
    expect(OFFICER_ACTION_CATEGORY.length).toBe(4);
    expect(LOCATION_ACTION_CATEGORY.length).toBe(3);
  });

  it("ACHIEVEMENTS[].category is a subset of AchievementCategory and every member is used", () => {
    const known = new Set(ACHIEVEMENT_CATEGORY);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const a of ALL_BASE_ACHIEVEMENTS) {
      expect(known.has(a.category), `${a.id} unknown category ${a.category}`).toBe(true);
      expect(ids.has(a.id), `duplicate achievement id ${a.id}`).toBe(false);
      ids.add(a.id);
      used.add(a.category);
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
      expect(typeof a.check).toBe("function");
    }
    const orphan = ACHIEVEMENT_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "AchievementCategory members unused in ACHIEVEMENTS").toEqual([]);
  });

  it("FIRSTS[].category is a subset of FirstCategory and every member is used", () => {
    const known = new Set(FIRST_CATEGORY);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const f of FIRSTS) {
      expect(known.has(f.category), `${f.id} unknown category ${f.category}`).toBe(true);
      expect(ids.has(f.id), `duplicate first id ${f.id}`).toBe(false);
      ids.add(f.id);
      used.add(f.category);
      expect(typeof f.check).toBe("function");
    }
    const orphan = FIRST_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "FirstCategory members unused in FIRSTS").toEqual([]);
  });

  it("CITY_POLICIES[].category is a subset of PolicyCategory and every member is used", () => {
    const known = new Set(POLICY_CATEGORY);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const p of CITY_POLICIES) {
      expect(known.has(p.category), `${p.id} unknown category ${p.category}`).toBe(true);
      expect(ids.has(p.id), `duplicate policy id ${p.id}`).toBe(false);
      ids.add(p.id);
      used.add(p.category);
      expect(p.name.length).toBeGreaterThan(0);
    }
    const orphan = POLICY_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "PolicyCategory members unused in CITY_POLICIES").toEqual([]);
  });

  it("OFFICER_ACTION_META + ORDER + LABELS all align with OfficerActionCategory in literal order", () => {
    expect(OFFICER_ACTION_CATEGORY).toEqual(["reward", "discipline", "covert", "removal"]);
    expect(OFFICER_ACTION_CATEGORY_ORDER).toEqual(OFFICER_ACTION_CATEGORY);
    expect(Object.keys(OFFICER_ACTION_CATEGORY_LABELS).sort()).toEqual(
      [...OFFICER_ACTION_CATEGORY].sort(),
    );
    for (const c of OFFICER_ACTION_CATEGORY) {
      const k = c as OfficerActionCategory;
      const label = OFFICER_ACTION_CATEGORY_LABELS[k];
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.toUpperCase());
    }
    const known = new Set(OFFICER_ACTION_CATEGORY);
    const used = new Set<string>();
    for (const meta of Object.values(OFFICER_ACTION_META)) {
      expect(known.has(meta.category), `meta ${meta.id} unknown category ${meta.category}`).toBe(true);
      used.add(meta.category);
    }
    const orphan = OFFICER_ACTION_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "OfficerActionCategory members unused in OFFICER_ACTION_META").toEqual([]);
  });

  it("LOCATION_ACTION_META + ORDER + LABELS all align with LocationActionCategory in literal order", () => {
    expect(LOCATION_ACTION_CATEGORY).toEqual(["military", "covert", "settlement"]);
    expect(LOCATION_ACTION_CATEGORY_ORDER).toEqual(LOCATION_ACTION_CATEGORY);
    expect(Object.keys(LOCATION_ACTION_CATEGORY_LABELS).sort()).toEqual(
      [...LOCATION_ACTION_CATEGORY].sort(),
    );
    for (const c of LOCATION_ACTION_CATEGORY) {
      const k = c as LocationActionCategory;
      const label = LOCATION_ACTION_CATEGORY_LABELS[k];
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.toUpperCase());
    }
    const known = new Set(LOCATION_ACTION_CATEGORY);
    const used = new Set<string>();
    for (const meta of Object.values(LOCATION_ACTION_META)) {
      expect(known.has(meta.category), `meta ${meta.id} unknown category ${meta.category}`).toBe(true);
      used.add(meta.category);
    }
    const orphan = LOCATION_ACTION_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "LocationActionCategory members unused in LOCATION_ACTION_META").toEqual([]);
  });
});

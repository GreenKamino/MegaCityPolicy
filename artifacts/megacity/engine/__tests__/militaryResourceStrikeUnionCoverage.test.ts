import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MILITARY_BUILDINGS,
  MILITARY_BUILDING_CATEGORIES,
  type MilitaryBuildingCategory,
} from "@/engine/militaryBuildings";
import {
  RESOURCE_NODE_LABELS,
  RESOURCE_NODE_ICONS,
  RESOURCE_NODE_COLORS,
  RESOURCE_NODE_DEFS,
  RICHNESS_LABELS,
  RICHNESS_MULT,
  type ResourceNodeType,
  type ResourceNodeRichness,
} from "@/engine/resourceNodes";
import {
  ATTACK_TYPES,
  ATTACK_TYPES_MAP,
  TARGET_CATEGORIES,
  TARGET_CATEGORIES_MAP,
} from "@/engine/strikeData";

/**
 * Drift guard: military / resource node / strike unions vs catalog
 * arrays and Records.
 *
 *   MilitaryBuildingCategory 10 ↔ MILITARY_BUILDING_CATEGORIES Record
 *                                    (tsc) + every union member used
 *                                    by ≥1 MILITARY_BUILDINGS entry
 *   MILITARY_BUILDINGS       50 — id uniqueness, positive costs
 *
 *   ResourceNodeType         10 ↔ RESOURCE_NODE_LABELS / ICONS /
 *                                    COLORS triple Records (tsc) +
 *                                    every member used by ≥1
 *                                    RESOURCE_NODE_DEFS entry
 *   ResourceNodeRichness      4 ↔ RICHNESS_LABELS / RICHNESS_MULT
 *                                    (tsc) + monotone-by-tier mult
 *
 *   AttackTypeId             10 ↔ ATTACK_TYPES array ids (no Record
 *                                    — array element typed by id;
 *                                    completeness-of-use must be
 *                                    pinned manually)
 *   TargetCategoryId          5 ↔ TARGET_CATEGORIES array ids
 *
 * All Records here are tsc-Record<Union,...> so completeness is
 * enforced; this guard pins counts (budget), label/icon/color
 * non-emptiness, runtime *_MAP coverage, catalog→union round-trip,
 * and value-shape sanity.
 */

const STRIKE_DATA_SRC = readFileSync(
  join(__dirname, "..", "strikeData.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const ATTACK_TYPE_IDS = parseUnion(STRIKE_DATA_SRC, "AttackTypeId");
const TARGET_CATEGORY_IDS = parseUnion(STRIKE_DATA_SRC, "TargetCategoryId");

describe("military / resource node / strike union coverage drift guard", () => {
  it("union and catalog sizes are pinned (budget)", () => {
    expect(Object.keys(MILITARY_BUILDING_CATEGORIES).length).toBe(10);
    expect(MILITARY_BUILDINGS.length).toBe(55);
    expect(Object.keys(RESOURCE_NODE_LABELS).length).toBe(10);
    expect(Object.keys(RESOURCE_NODE_ICONS).length).toBe(10);
    expect(Object.keys(RESOURCE_NODE_COLORS).length).toBe(10);
    expect(Object.keys(RICHNESS_LABELS).length).toBe(4);
    expect(Object.keys(RICHNESS_MULT).length).toBe(4);
    expect(ATTACK_TYPE_IDS.length).toBe(10);
    expect(TARGET_CATEGORY_IDS.length).toBe(5);
    expect(ATTACK_TYPES.length).toBe(10);
    expect(TARGET_CATEGORIES.length).toBe(5);
  });

  it("MILITARY_BUILDING_CATEGORIES values are non-empty UPPERCASE labels", () => {
    for (const [k, v] of Object.entries(MILITARY_BUILDING_CATEGORIES)) {
      expect(v.length, `${k} has empty label`).toBeGreaterThan(0);
      expect(v, `${k} label not uppercase`).toBe(v.toUpperCase());
    }
  });

  it("every MilitaryBuildingCategory union member is used by ≥1 MILITARY_BUILDINGS entry", () => {
    const usedCats = new Set(MILITARY_BUILDINGS.map((b) => b.category));
    const known = new Set(
      Object.keys(MILITARY_BUILDING_CATEGORIES) as MilitaryBuildingCategory[],
    );
    const orphanCats = [...known].filter((c) => !usedCats.has(c));
    expect(orphanCats, "MilitaryBuildingCategory members with no buildings").toEqual([]);
    for (const b of MILITARY_BUILDINGS) {
      expect(known.has(b.category), `${b.id} has unknown category ${b.category}`).toBe(true);
    }
  });

  it("MILITARY_BUILDINGS ids are unique with non-empty names and positive costs/upkeep/personnel", () => {
    const ids = MILITARY_BUILDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of MILITARY_BUILDINGS) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.buildCost).toBeGreaterThan(0);
      expect(b.upkeep).toBeGreaterThan(0);
      expect(b.personnel).toBeGreaterThan(0);
      expect(b.defenseBonus).toBeGreaterThanOrEqual(0);
    }
  });

  it("RESOURCE_NODE_LABELS / ICONS / COLORS share identical key sets with non-empty values", () => {
    const labelKeys = Object.keys(RESOURCE_NODE_LABELS).sort();
    expect(Object.keys(RESOURCE_NODE_ICONS).sort()).toEqual(labelKeys);
    expect(Object.keys(RESOURCE_NODE_COLORS).sort()).toEqual(labelKeys);
    for (const k of labelKeys) {
      const key = k as ResourceNodeType;
      expect(RESOURCE_NODE_LABELS[key].length, `${k} label empty`).toBeGreaterThan(0);
      expect(RESOURCE_NODE_ICONS[key].length, `${k} icon empty`).toBeGreaterThan(0);
      expect(RESOURCE_NODE_COLORS[key].length, `${k} color empty`).toBeGreaterThan(0);
      // Color is a hex literal in the existing palette.
      expect(RESOURCE_NODE_COLORS[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("every ResourceNodeType used in RESOURCE_NODE_DEFS is in the labels Record", () => {
    const known = new Set(Object.keys(RESOURCE_NODE_LABELS));
    for (const def of RESOURCE_NODE_DEFS) {
      expect(
        known.has(def.resourceType),
        `def ${def.locationId} has unknown resourceType ${def.resourceType}`,
      ).toBe(true);
    }
    // Sanity: catalog is non-empty.
    expect(RESOURCE_NODE_DEFS.length).toBeGreaterThan(0);
  });

  it("RICHNESS_LABELS values are non-empty UPPERCASE; RICHNESS_MULT is monotone increasing scarce→abundant", () => {
    for (const [k, v] of Object.entries(RICHNESS_LABELS)) {
      expect(v.length, `${k} richness label empty`).toBeGreaterThan(0);
      expect(v, `${k} label not uppercase`).toBe(v.toUpperCase());
    }
    const order: ResourceNodeRichness[] = ["scarce", "moderate", "rich", "abundant"];
    for (const k of order) {
      expect(RICHNESS_MULT[k]).toBeGreaterThan(0);
      expect(Number.isFinite(RICHNESS_MULT[k])).toBe(true);
    }
    for (let i = 1; i < order.length; i++) {
      expect(
        RICHNESS_MULT[order[i]],
        `${order[i]} mult must exceed ${order[i - 1]}`,
      ).toBeGreaterThan(RICHNESS_MULT[order[i - 1]]);
    }
  });

  it("ATTACK_TYPES ids match AttackTypeId union exactly with non-empty fields and *_MAP coverage", () => {
    const arrayIds = ATTACK_TYPES.map((a) => a.id).sort();
    expect(arrayIds).toEqual([...ATTACK_TYPE_IDS].sort());
    expect(new Set(arrayIds).size).toBe(arrayIds.length);
    for (const a of ATTACK_TYPES) {
      expect(a.name.length, `${a.id} name empty`).toBeGreaterThan(0);
      expect(ATTACK_TYPES_MAP[a.id], `${a.id} missing from ATTACK_TYPES_MAP`).toBe(a);
    }
    expect(Object.keys(ATTACK_TYPES_MAP).length).toBe(ATTACK_TYPES.length);
  });

  it("TARGET_CATEGORIES ids match TargetCategoryId union exactly with bounded risk fields and *_MAP coverage", () => {
    const arrayIds = TARGET_CATEGORIES.map((t) => t.id).sort();
    expect(arrayIds).toEqual([...TARGET_CATEGORY_IDS].sort());
    expect(new Set(arrayIds).size).toBe(arrayIds.length);
    for (const t of TARGET_CATEGORIES) {
      expect(t.name.length, `${t.id} name empty`).toBeGreaterThan(0);
      expect(t.description.length, `${t.id} description empty`).toBeGreaterThan(0);
      expect(t.collateralRisk).toBeGreaterThanOrEqual(0);
      expect(t.collateralRisk).toBeLessThanOrEqual(1);
      expect(t.civilianCasualties).toBeGreaterThanOrEqual(0);
      expect(t.civilianCasualties).toBeLessThanOrEqual(1);
      expect(t.diplomaticPenalty).toBeGreaterThanOrEqual(0);
      expect(TARGET_CATEGORIES_MAP[t.id], `${t.id} missing from TARGET_CATEGORIES_MAP`).toBe(t);
    }
    expect(Object.keys(TARGET_CATEGORIES_MAP).length).toBe(TARGET_CATEGORIES.length);
  });
});

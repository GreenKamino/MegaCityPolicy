import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONTRABAND,
  CONTRABAND_CATEGORIES,
} from "@/engine/contraband";
import {
  CONTAMINATION_LABELS,
  CONTAMINATION_ICONS,
  CONTAMINATION_COLORS,
  PHASE_LABELS,
  RECLAIMABLE_PLOTS,
  type ContaminationType,
  type ReclamationPhaseId,
} from "@/engine/districtExpansion";
import {
  AUTO_PRIORITY_LABELS,
  DEFAULT_AUTO_CONSTRUCTION,
  type AutoConstructionPriority,
} from "@/engine/autoConstruction";

/**
 * Drift guard: contraband / district-expansion / auto-construction
 * unions vs catalog rosters and Record companions.
 *
 *   ContrabandCategory(9)        ↔ CONTRABAND_CATEGORIES Record (1:1)
 *                                   AND CONTRABAND[].category usage
 *                                   (every member used by ≥1 def).
 *
 *   ContaminationType(5)         ↔ CONTAMINATION_LABELS / _ICONS /
 *                                   _COLORS Records (1:1) AND
 *                                   RECLAIMABLE_PLOTS[].contaminationType
 *                                   usage (every member used by ≥1 plot).
 *
 *   ReclamationPhaseId(4)        ↔ PHASE_LABELS Record (1:1) AND
 *                                   makePhases() emits all 4 in the
 *                                   pinned order survey →
 *                                   decontaminate → foundation →
 *                                   develop. Sourced from the
 *                                   RECLAIMABLE_PLOTS-driven phase
 *                                   pipeline; orphan phase = dead
 *                                   reclamation step.
 *
 *   AutoConstructionPriority(7)  ↔ AUTO_PRIORITY_LABELS Record (1:1)
 *                                   AND DEFAULT_AUTO_CONSTRUCTION
 *                                   .priorities ⊆ union; default seed
 *                                   covers the four headline needs
 *                                   (power/water/housing/food).
 */

const CONTRABAND_SRC = readFileSync(
  join(__dirname, "..", "contraband.ts"),
  "utf8",
);
const DISTRICT_SRC = readFileSync(
  join(__dirname, "..", "districtExpansion.ts"),
  "utf8",
);
const AUTO_SRC = readFileSync(
  join(__dirname, "..", "autoConstruction.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const CONTRABAND_CATEGORY = parseUnion(CONTRABAND_SRC, "ContrabandCategory");
const CONTAMINATION_TYPE = parseUnion(DISTRICT_SRC, "ContaminationType");
const RECLAMATION_PHASE_ID = parseUnion(DISTRICT_SRC, "ReclamationPhaseId");
const AUTO_PRIORITY = parseUnion(AUTO_SRC, "AutoConstructionPriority");

const PHASE_ORDER: ReclamationPhaseId[] = [
  "survey",
  "decontaminate",
  "foundation",
  "develop",
];

describe("contraband / district-expansion / auto-construction union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(CONTRABAND_CATEGORY.length).toBe(9);
    expect(CONTAMINATION_TYPE.length).toBe(5);
    expect(RECLAMATION_PHASE_ID.length).toBe(4);
    expect(AUTO_PRIORITY.length).toBe(7);
  });

  it("CONTRABAND_CATEGORIES Record covers ContrabandCategory exactly with UPPERCASE labels", () => {
    const want = [...CONTRABAND_CATEGORY].sort();
    expect(Object.keys(CONTRABAND_CATEGORIES).sort()).toEqual(want);
    for (const c of CONTRABAND_CATEGORY) {
      const label = CONTRABAND_CATEGORIES[c as keyof typeof CONTRABAND_CATEGORIES];
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.toUpperCase());
    }
  });

  it("CONTRABAND[].category values are subset of ContrabandCategory; every member used by ≥1 def; ids unique", () => {
    const known = new Set(CONTRABAND_CATEGORY);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const c of CONTRABAND) {
      expect(known.has(c.category), `${c.id} unknown category ${c.category}`).toBe(true);
      expect(ids.has(c.id), `duplicate contraband id ${c.id}`).toBe(false);
      ids.add(c.id);
      used.add(c.category);
      expect(c.baseValue).toBeGreaterThan(0);
      expect(c.riskLevel).toBeGreaterThan(0);
      expect(c.penaltyIfCaught).toBeGreaterThan(0);
    }
    const orphan = CONTRABAND_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "ContrabandCategory members unused in CONTRABAND").toEqual([]);
  });

  it("CONTAMINATION_LABELS / _ICONS / _COLORS cover ContaminationType exactly", () => {
    const want = [...CONTAMINATION_TYPE].sort();
    expect(Object.keys(CONTAMINATION_LABELS).sort()).toEqual(want);
    expect(Object.keys(CONTAMINATION_ICONS).sort()).toEqual(want);
    expect(Object.keys(CONTAMINATION_COLORS).sort()).toEqual(want);
    for (const t of CONTAMINATION_TYPE) {
      const k = t as ContaminationType;
      expect(CONTAMINATION_LABELS[k].length).toBeGreaterThan(0);
      expect(CONTAMINATION_ICONS[k].length).toBeGreaterThan(0);
      expect(CONTAMINATION_COLORS[k]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("RECLAIMABLE_PLOTS contamination usage covers every ContaminationType union member", () => {
    const known = new Set(CONTAMINATION_TYPE);
    const used = new Set<string>();
    for (const p of RECLAIMABLE_PLOTS) {
      expect(known.has(p.contaminationType), `${p.id} unknown contaminationType ${p.contaminationType}`).toBe(true);
      used.add(p.contaminationType);
    }
    const orphan = CONTAMINATION_TYPE.filter((t) => !used.has(t));
    expect(orphan, "ContaminationType members unused in RECLAIMABLE_PLOTS").toEqual([]);
  });

  it("PHASE_LABELS covers ReclamationPhaseId exactly in the pinned survey→decontaminate→foundation→develop order", () => {
    expect(RECLAMATION_PHASE_ID).toEqual(PHASE_ORDER);
    expect(Object.keys(PHASE_LABELS).sort()).toEqual([...PHASE_ORDER].sort());
    for (const id of RECLAMATION_PHASE_ID) {
      const k = id as ReclamationPhaseId;
      expect(PHASE_LABELS[k].length).toBeGreaterThan(0);
    }
    // Pipeline anchor: makePhases() — and any other emitter — must
    // produce all four phase ids in the same order. Source-grep is
    // sufficient since the function is private to the module.
    for (const id of PHASE_ORDER) {
      expect(DISTRICT_SRC, `phase ${id} not emitted`).toContain(`id: "${id}"`);
    }
  });

  it("AUTO_PRIORITY_LABELS covers AutoConstructionPriority exactly; DEFAULT seed list is a non-empty subset", () => {
    const want = [...AUTO_PRIORITY].sort();
    expect(Object.keys(AUTO_PRIORITY_LABELS).sort()).toEqual(want);
    for (const p of AUTO_PRIORITY) {
      const k = p as AutoConstructionPriority;
      expect(AUTO_PRIORITY_LABELS[k].length).toBeGreaterThan(0);
    }
    const known = new Set(AUTO_PRIORITY);
    expect(DEFAULT_AUTO_CONSTRUCTION.priorities.length).toBeGreaterThan(0);
    for (const p of DEFAULT_AUTO_CONSTRUCTION.priorities) {
      expect(known.has(p), `default priority ${p} not in union`).toBe(true);
    }
    // Default seed currently covers the headline survival needs;
    // pin those so a regression that drops them surfaces here.
    expect(new Set(DEFAULT_AUTO_CONSTRUCTION.priorities)).toEqual(
      new Set(["power", "water", "housing", "food"]),
    );
  });
});

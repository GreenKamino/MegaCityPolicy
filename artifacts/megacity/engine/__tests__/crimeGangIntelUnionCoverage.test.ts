import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALL_CRIME_TYPES,
  CRIME_TYPES,
  CRIME_CATEGORY_LABELS,
} from "@/engine/crimeTypes";
import { GANGS, GANG_TYPE_LABELS } from "@/engine/gangs";
import {
  INTEL_POLICIES,
  INTEL_POLICY_CATEGORIES,
  INTEL_POLICY_COLORS,
} from "@/engine/intelData";

/**
 * Drift guard: crime / gang / intel-policy catalog union coverage.
 *
 * Three independent law-and-shadow systems each pair a closed
 * union with a plain-array catalog whose category literals are
 * NOT type-checked:
 *
 *   CrimeCategory  16 → CRIME_TYPES + ALL_CRIME_TYPES (134+ entries)
 *                       CRIME_CATEGORY_LABELS Record (tsc-covered)
 *   CrimeSeverity   4 → severity literal on every CRIME_TYPES entry
 *   GangType        5 → GANGS catalog (53 entries)
 *                       GANG_TYPE_LABELS Record (tsc-covered)
 *   IntelPolicyCat  8 → INTEL_POLICIES catalog (30 entries)
 *                       INTEL_POLICY_CATEGORIES + COLORS Records (tsc)
 *
 * Each catalog drives a UI surface that filters by category. A
 * union member with no entry is an empty filter tab. An orphan
 * literal is content the filter tab cannot render.
 *
 * All sides parsed live from source. Cumulative budget pin:
 * surprising swings in catalog sizes flag accidental dupes / drops.
 */

const CRIME_SRC = readFileSync(
  join(__dirname, "..", "crimeTypes.ts"),
  "utf8",
);
const GANGS_SRC = readFileSync(
  join(__dirname, "..", "gangs.ts"),
  "utf8",
);
const INTEL_SRC = readFileSync(
  join(__dirname, "..", "intelData.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const CRIME_CATEGORIES = parseUnion(CRIME_SRC, "CrimeCategory");
const CRIME_SEVERITIES = parseUnion(CRIME_SRC, "CrimeSeverity");
const GANG_TYPES = parseUnion(GANGS_SRC, "GangType");
const INTEL_CATEGORIES = parseUnion(INTEL_SRC, "IntelPolicyCategory");

describe("crime / gang / intel-policy catalog union coverage drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(CRIME_CATEGORIES.length).toBe(16);
    expect(CRIME_SEVERITIES.length).toBe(4);
    expect(GANG_TYPES.length).toBe(5);
    expect(INTEL_CATEGORIES.length).toBe(8);
  });

  it("catalog sizes are pinned (budget)", () => {
    expect(CRIME_TYPES.length).toBe(134);
    expect(GANGS.length).toBe(53);
    expect(INTEL_POLICIES.length).toBe(30);
    // ALL_CRIME_TYPES merges Sixth-Day add-on crimes; must be ≥ CRIME_TYPES.
    expect(ALL_CRIME_TYPES.length).toBeGreaterThanOrEqual(CRIME_TYPES.length);
  });

  it("CRIME_CATEGORY_LABELS keys equal CrimeCategory exactly with non-empty labels", () => {
    expect(Object.keys(CRIME_CATEGORY_LABELS).sort()).toEqual(
      [...CRIME_CATEGORIES].sort(),
    );
    for (const c of CRIME_CATEGORIES) {
      const label =
        CRIME_CATEGORY_LABELS[c as keyof typeof CRIME_CATEGORY_LABELS];
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("every CrimeCategory union member is used by ≥1 ALL_CRIME_TYPES entry", () => {
    const used = new Set(ALL_CRIME_TYPES.map((c) => c.category));
    const missing = CRIME_CATEGORIES.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(CRIME_CATEGORIES);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("every CrimeSeverity union member is used by ≥1 CRIME_TYPES entry", () => {
    const used = new Set(CRIME_TYPES.map((c) => c.severity));
    const missing = CRIME_SEVERITIES.filter((s) => !used.has(s as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(CRIME_SEVERITIES);
    const orphans = [...used].filter((s) => !unionSet.has(s));
    expect(orphans).toEqual([]);
  });

  it("CRIME_TYPES ids are unique and baseRate is finite & non-negative", () => {
    const ids = CRIME_TYPES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CRIME_TYPES) {
      expect(Number.isFinite(c.baseRate)).toBe(true);
      expect(c.baseRate).toBeGreaterThanOrEqual(0);
    }
  });

  it("GANG_TYPE_LABELS keys equal GangType exactly with non-empty labels", () => {
    expect(Object.keys(GANG_TYPE_LABELS).sort()).toEqual(
      [...GANG_TYPES].sort(),
    );
    for (const g of GANG_TYPES) {
      expect(
        GANG_TYPE_LABELS[g as keyof typeof GANG_TYPE_LABELS].length,
      ).toBeGreaterThan(0);
    }
  });

  it("every GangType union member is used by ≥1 GANGS entry", () => {
    const used = new Set(GANGS.map((g) => g.type));
    const missing = GANG_TYPES.filter((t) => !used.has(t as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(GANG_TYPES);
    const orphans = [...used].filter((t) => !unionSet.has(t));
    expect(orphans).toEqual([]);
  });

  it("GANGS ids are unique and threatLevel is in the declared 1..5 range", () => {
    const ids = GANGS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GANGS) {
      expect(g.threatLevel).toBeGreaterThanOrEqual(1);
      expect(g.threatLevel).toBeLessThanOrEqual(5);
    }
  });

  it("INTEL_POLICY_CATEGORIES and INTEL_POLICY_COLORS keys equal IntelPolicyCategory exactly", () => {
    expect(Object.keys(INTEL_POLICY_CATEGORIES).sort()).toEqual(
      [...INTEL_CATEGORIES].sort(),
    );
    expect(Object.keys(INTEL_POLICY_COLORS).sort()).toEqual(
      [...INTEL_CATEGORIES].sort(),
    );
    for (const c of INTEL_CATEGORIES) {
      const k = c as keyof typeof INTEL_POLICY_CATEGORIES;
      expect(INTEL_POLICY_CATEGORIES[k].length).toBeGreaterThan(0);
      expect(
        INTEL_POLICY_COLORS[c as keyof typeof INTEL_POLICY_COLORS].length,
      ).toBeGreaterThan(0);
    }
  });

  it("every IntelPolicyCategory union member is used by ≥1 INTEL_POLICIES entry", () => {
    const used = new Set(INTEL_POLICIES.map((p) => p.category));
    const missing = INTEL_CATEGORIES.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(INTEL_CATEGORIES);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("INTEL_POLICIES ids are unique and cost is positive", () => {
    const ids = INTEL_POLICIES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of INTEL_POLICIES) {
      expect(p.cost).toBeGreaterThan(0);
    }
  });
});

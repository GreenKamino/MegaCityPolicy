import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  INNER_CIRCLE_PERKS,
  type InnerCircleRole,
} from "@/engine/innerCircleData";

/**
 * Drift guard: InnerCircleRole(8) vs every parallel record/catalog.
 *
 *   ROLE_LABELS         Record<InnerCircleRole, string>   (1:1, non-empty)
 *   ROLE_DESCRIPTIONS   Record<InnerCircleRole, string>   (1:1, non-empty)
 *   INNER_CIRCLE_PERKS  Array<{ role, levelRequired }>     (every role
 *                                                          gets perks at
 *                                                          tiers 1/3/5/8)
 *
 *   Catalog budget: 8 roles × 4 perk tiers = 32 perks. Pin to catch
 *   accidental dupes or missing entries when adding a 9th role.
 */

const INNER_SRC = readFileSync(
  join(__dirname, "..", "innerCircleData.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const INNER_CIRCLE_ROLE = parseUnion(INNER_SRC, "InnerCircleRole");
const REQUIRED_TIERS = [1, 3, 5, 8];

describe("inner circle role union coverage drift guard", () => {
  it("InnerCircleRole has 8 members; INNER_CIRCLE_PERKS is the 8x4 grid (32 entries)", () => {
    expect(INNER_CIRCLE_ROLE.length).toBe(8);
    expect(INNER_CIRCLE_PERKS.length).toBe(32);
  });

  it("ROLE_LABELS and ROLE_DESCRIPTIONS cover InnerCircleRole exactly with non-empty values", () => {
    const want = [...INNER_CIRCLE_ROLE].sort();
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(want);
    expect(Object.keys(ROLE_DESCRIPTIONS).sort()).toEqual(want);
    for (const r of INNER_CIRCLE_ROLE) {
      const role = r as InnerCircleRole;
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
      expect(ROLE_DESCRIPTIONS[role].length).toBeGreaterThan(0);
    }
  });

  it("every INNER_CIRCLE_PERKS.role is in InnerCircleRole; every role gets perks at tiers 1/3/5/8", () => {
    const known = new Set(INNER_CIRCLE_ROLE);
    const perksByRole = new Map<string, number[]>();
    const ids = new Set<string>();
    for (const p of INNER_CIRCLE_PERKS) {
      expect(known.has(p.role), `${p.id} unknown role ${p.role}`).toBe(true);
      expect(p.id.length).toBeGreaterThan(0);
      expect(ids.has(p.id), `duplicate perk id ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      const arr = perksByRole.get(p.role) ?? [];
      arr.push(p.levelRequired);
      perksByRole.set(p.role, arr);
    }
    for (const r of INNER_CIRCLE_ROLE) {
      const tiers = perksByRole.get(r) ?? [];
      expect(tiers.length, `role ${r} should have 4 perks`).toBe(4);
      expect([...tiers].sort((a, b) => a - b)).toEqual(REQUIRED_TIERS);
    }
  });

  it("every InnerCircleRole label is uppercase and ends with no trailing whitespace", () => {
    for (const r of INNER_CIRCLE_ROLE) {
      const label = ROLE_LABELS[r as InnerCircleRole];
      expect(label).toBe(label.toUpperCase());
      expect(label.trim()).toBe(label);
    }
  });

  // tsc reachability anchor.
  it("type-side anchor compiles", () => {
    const _all: InnerCircleRole[] = INNER_CIRCLE_ROLE as InnerCircleRole[];
    expect(_all.length).toBe(INNER_CIRCLE_ROLE.length);
  });
});

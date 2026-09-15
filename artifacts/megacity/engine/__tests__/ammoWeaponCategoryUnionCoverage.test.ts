import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AMMO_TYPES, WEAPONS } from "@/engine/weapons";

/**
 * Drift guard: AmmoDef.category(8) and WeaponDef.category(14)
 * inline unions vs runtime catalog usage.
 *
 *   AmmoDef.category(8)        ↔ AMMO_TYPES.category usage:
 *                                exhaustive — every union member
 *                                used by ≥1 ammo def; every
 *                                catalog entry's category ∈ union.
 *
 *   WeaponDef.category(14)     ↔ WEAPONS.category usage. Today
 *                                only 13 of 14 are referenced;
 *                                "explosive" is a documented orphan
 *                                (grenades are filed as "grenade").
 *                                The orphan set is pinned so any
 *                                change — adding/removing an
 *                                "explosive" weapon, or removing
 *                                another category from the
 *                                catalog — fails immediately.
 *
 *   Both unions are inline on their owner type (no top-level
 *   `export type X = …`), so we parse the field directly out of
 *   types.ts via parseInlineFieldUnion.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");

function parseInlineFieldUnion(
  src: string,
  ownerType: string,
  field: string,
): string[] {
  const re = new RegExp(`export type ${ownerType}\\s*=\\s*\\{([\\s\\S]*?)\\};`);
  const owner = src.match(re);
  expect(owner, `owner type ${ownerType} not found`).not.toBeNull();
  const fre = new RegExp(`${field}:\\s*([^;]+);`);
  const f = owner![1].match(fre);
  expect(f, `field ${ownerType}.${field} not found`).not.toBeNull();
  return (f![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const AMMO_CATEGORY = parseInlineFieldUnion(TYPES_SRC, "AmmoDef", "category");
const WEAPON_CATEGORY = parseInlineFieldUnion(TYPES_SRC, "WeaponDef", "category");

// Documented orphan: WeaponDef.category permits "explosive" but no
// catalog entry uses it (grenades are filed under "grenade", launchers
// under "launcher"). Pin it; if a future weapon adopts "explosive",
// or this orphan changes, this test fails on purpose.
const KNOWN_WEAPON_CATEGORY_ORPHANS = ["explosive"] as const;

describe("ammo + weapon category union coverage drift guard", () => {
  it("inline union member counts are budget-pinned", () => {
    expect(AMMO_CATEGORY.length).toBe(8);
    expect(WEAPON_CATEGORY.length).toBe(14);
  });

  it("AMMO_TYPES.category values are exactly AmmoDef.category; every union member used by ≥1 ammo def", () => {
    const known = new Set(AMMO_CATEGORY);
    const used = new Set<string>();
    for (const a of AMMO_TYPES) {
      expect(known.has(a.category), `${a.id} unknown ammo category ${a.category}`).toBe(true);
      used.add(a.category);
    }
    const orphan = AMMO_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "AmmoDef.category members unused in AMMO_TYPES").toEqual([]);
  });

  it("WEAPONS.category values ⊆ WeaponDef.category; orphan set matches the documented pin", () => {
    const known = new Set(WEAPON_CATEGORY);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const w of WEAPONS) {
      expect(known.has(w.category), `${w.id} unknown weapon category ${w.category}`).toBe(true);
      expect(ids.has(w.id), `duplicate weapon id ${w.id}`).toBe(false);
      ids.add(w.id);
      used.add(w.category);
    }
    const orphan = WEAPON_CATEGORY.filter((c) => !used.has(c)).sort();
    expect(orphan).toEqual([...KNOWN_WEAPON_CATEGORY_ORPHANS].sort());
    // Sanity: the catalog covers everything except the pinned orphans.
    expect(used.size).toBe(WEAPON_CATEGORY.length - KNOWN_WEAPON_CATEGORY_ORPHANS.length);
  });

  it("AMMO_TYPES has unique ids and non-empty descriptions", () => {
    const ids = new Set<string>();
    for (const a of AMMO_TYPES) {
      expect(ids.has(a.id), `duplicate ammo id ${a.id}`).toBe(false);
      ids.add(a.id);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
      expect(Number.isFinite(a.costPer100)).toBe(true);
      expect(Number.isFinite(a.damage_modifier)).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TECH_CATEGORY_LABELS,
  TECH_CATEGORY_ICONS,
  TECH_TIER_LABELS,
  TECHNOLOGIES,
  RELIGION_TECHNOLOGIES,
  BIOSPHERE_TECHNOLOGIES,
  STORY_ARC_TECHNOLOGIES,
  ECOLOGY_TECHNOLOGIES,
  STATECRAFT_SHADOW_TECHNOLOGIES,
  ALL_TECHNOLOGIES,
  TECH_MAP,
} from "@/engine/technologies";
import { SD_TECHNOLOGIES } from "@/engine/addons/sixthDay";
import { BB_TECHNOLOGIES } from "@/engine/addons/bigBrother";
import {
  WEAPONS,
  AMMO_TYPES,
  ADDITIONAL_AMMO,
  MISSILES,
  VEHICLE_WEAPONS,
  NUCLEAR_WEAPONS,
  WEAPON_CATEGORIES,
  AMMO_CATEGORIES,
  MISSILE_GUIDANCE_LABELS,
  VEHICLE_WEAPON_CATEGORIES,
  NUCLEAR_WEAPON_CATEGORIES,
} from "@/engine/weapons";
import {
  CONTRACT_TEMPLATES,
  CONTRACT_TEMPLATES_MAP,
  CONTRACTORS,
  CONTRACTORS_MAP,
} from "@/engine/contracts";

/**
 * Drift guard: tech tree, weapons records, contracts.
 *
 *   TechCategory               32 → TECH_CATEGORY_LABELS / ICONS
 *                                    declared Record<string,string> →
 *                                    completeness NOT enforced by tsc.
 *                                    Used as TechDef.category (typed).
 *   TechTier                    5 → TECH_TIER_LABELS Record<number,string>;
 *                                    every TechDef.tier must be 1..5.
 *
 *   VehicleWeaponCategory       8 → VEHICLE_WEAPON_CATEGORIES Record<string>
 *   NuclearWeaponCategory       7 → NUCLEAR_WEAPON_CATEGORIES Record<string>
 *   WEAPON_CATEGORIES, AMMO_CATEGORIES, MISSILE_GUIDANCE_LABELS:
 *     no narrow union → only id-uniqueness + value-non-empty pinned.
 *
 *   ContractDef.category is ContractCategory-typed; CONTRACT_TEMPLATES_MAP
 *   and CONTRACTORS_MAP are id→def. Pin map ↔ list 1:1, no shadowing.
 *
 * All sides parsed live from source. Counts pinned for budget.
 */

const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const TECH_CATS = parseUnion(TYPES_SRC, "TechCategory");
const VEHICLE_WEAPON_CATS = parseUnion(TYPES_SRC, "VehicleWeaponCategory");
const NUCLEAR_WEAPON_CATS = parseUnion(TYPES_SRC, "NuclearWeaponCategory");

describe("tech / weapons / contracts catalog union coverage drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(TECH_CATS.length).toBe(32);
    expect(VEHICLE_WEAPON_CATS.length).toBe(8);
    expect(NUCLEAR_WEAPON_CATS.length).toBe(7);
  });

  it("catalog sizes are pinned (budget)", () => {
    expect(TECHNOLOGIES.length).toBe(419);
    expect(SD_TECHNOLOGIES.length).toBe(185);
    expect(BB_TECHNOLOGIES.length).toBe(10);
    expect(RELIGION_TECHNOLOGIES.length).toBe(18);
    expect(BIOSPHERE_TECHNOLOGIES.length).toBe(73);
    expect(STORY_ARC_TECHNOLOGIES.length).toBe(4);
    expect(ECOLOGY_TECHNOLOGIES.length).toBe(4);
    expect(STATECRAFT_SHADOW_TECHNOLOGIES.length).toBe(14);
    expect(ALL_TECHNOLOGIES.length).toBe(
      TECHNOLOGIES.length +
        SD_TECHNOLOGIES.length +
        BB_TECHNOLOGIES.length +
        RELIGION_TECHNOLOGIES.length +
        BIOSPHERE_TECHNOLOGIES.length +
        STORY_ARC_TECHNOLOGIES.length +
        ECOLOGY_TECHNOLOGIES.length +
        STATECRAFT_SHADOW_TECHNOLOGIES.length,
    );
    expect(WEAPONS.length).toBe(114);
    expect(AMMO_TYPES.length).toBe(40);
    expect(ADDITIONAL_AMMO.length).toBe(39);
    expect(MISSILES.length).toBe(20);
    expect(VEHICLE_WEAPONS.length).toBe(50);
    expect(NUCLEAR_WEAPONS.length).toBe(40);
    expect(CONTRACT_TEMPLATES.length).toBe(65);
    expect(CONTRACTORS.length).toBe(25);
  });

  it("TECH_CATEGORY_LABELS keys equal TechCategory union exactly (no drift)", () => {
    const keys = Object.keys(TECH_CATEGORY_LABELS).sort();
    expect(keys).toEqual([...TECH_CATS].sort());
    for (const [k, v] of Object.entries(TECH_CATEGORY_LABELS)) {
      expect(v.length, `label for ${k} is empty`).toBeGreaterThan(0);
    }
  });

  it("TECH_CATEGORY_ICONS keys equal TechCategory union exactly", () => {
    const keys = Object.keys(TECH_CATEGORY_ICONS).sort();
    expect(keys).toEqual([...TECH_CATS].sort());
    for (const [k, v] of Object.entries(TECH_CATEGORY_ICONS)) {
      expect(v.length, `icon for ${k} is empty`).toBeGreaterThan(0);
    }
  });

  it("TECH_TIER_LABELS covers every TechTier (1..5) with non-empty labels", () => {
    const keys = Object.keys(TECH_TIER_LABELS).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([1, 2, 3, 4, 5]);
    for (const k of keys) {
      expect(TECH_TIER_LABELS[k].length).toBeGreaterThan(0);
    }
  });

  it("every ALL_TECHNOLOGIES entry has a known category and tier in 1..5; ids are unique; TECH_MAP indexes 1:1", () => {
    const cats = new Set(TECH_CATS);
    const ids = new Map<string, string>();
    for (const t of ALL_TECHNOLOGIES) {
      expect(cats.has(t.category), `tech ${t.id} has unknown category ${t.category}`).toBe(true);
      expect([1, 2, 3, 4, 5]).toContain(t.tier);
      const prev = ids.get(t.id);
      expect(prev, `duplicate tech id ${t.id}`).toBeUndefined();
      ids.set(t.id, t.id);
      expect(t.name.length).toBeGreaterThan(0);
      expect(TECH_MAP[t.id], `TECH_MAP missing ${t.id}`).toBe(t);
    }
    expect(Object.keys(TECH_MAP).length).toBe(ALL_TECHNOLOGIES.length);
  });

  it("VEHICLE_WEAPON_CATEGORIES keys equal VehicleWeaponCategory union exactly; every VEHICLE_WEAPONS entry uses a known category", () => {
    const keys = Object.keys(VEHICLE_WEAPON_CATEGORIES).sort();
    expect(keys).toEqual([...VEHICLE_WEAPON_CATS].sort());
    const known = new Set(VEHICLE_WEAPON_CATS);
    for (const w of VEHICLE_WEAPONS) {
      expect(known.has(w.category), `vehicle weapon ${w.id} has unknown category ${w.category}`).toBe(true);
    }
    const used = new Set(VEHICLE_WEAPONS.map((w) => w.category));
    const unused = VEHICLE_WEAPON_CATS.filter((c) => !used.has(c as never));
    expect(unused, "vehicle weapon categories without any entries").toEqual([]);
  });

  it("NUCLEAR_WEAPON_CATEGORIES keys equal NuclearWeaponCategory union exactly; every NUCLEAR_WEAPONS entry uses a known category", () => {
    const keys = Object.keys(NUCLEAR_WEAPON_CATEGORIES).sort();
    expect(keys).toEqual([...NUCLEAR_WEAPON_CATS].sort());
    const known = new Set(NUCLEAR_WEAPON_CATS);
    for (const n of NUCLEAR_WEAPONS) {
      expect(known.has(n.category), `nuclear weapon ${n.id} has unknown category ${n.category}`).toBe(true);
    }
    const used = new Set(NUCLEAR_WEAPONS.map((n) => n.category));
    const unused = NUCLEAR_WEAPON_CATS.filter((c) => !used.has(c as never));
    expect(unused, "nuclear weapon categories without any entries").toEqual([]);
  });

  it("WEAPON_CATEGORIES, AMMO_CATEGORIES, MISSILE_GUIDANCE_LABELS keys are unique with non-empty values", () => {
    for (const [name, rec] of [
      ["WEAPON_CATEGORIES", WEAPON_CATEGORIES],
      ["AMMO_CATEGORIES", AMMO_CATEGORIES],
      ["MISSILE_GUIDANCE_LABELS", MISSILE_GUIDANCE_LABELS],
    ] as const) {
      const keys = Object.keys(rec);
      expect(new Set(keys).size, `${name} has duplicate keys`).toBe(keys.length);
      for (const [k, v] of Object.entries(rec)) {
        expect(v.length, `${name}[${k}] is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("every WEAPONS entry has a category present in WEAPON_CATEGORIES (no orphan UI bucket)", () => {
    const known = new Set(Object.keys(WEAPON_CATEGORIES));
    for (const w of WEAPONS) {
      expect(known.has(w.category), `weapon ${w.id} has unknown category ${w.category}`).toBe(true);
    }
  });

  it("every AMMO_TYPES + ADDITIONAL_AMMO entry has a category present in AMMO_CATEGORIES", () => {
    const known = new Set(Object.keys(AMMO_CATEGORIES));
    for (const a of [...AMMO_TYPES, ...ADDITIONAL_AMMO]) {
      expect(known.has(a.category), `ammo ${a.id} has unknown category ${a.category}`).toBe(true);
    }
  });

  it("every MISSILES guidance value is present in MISSILE_GUIDANCE_LABELS", () => {
    const known = new Set(Object.keys(MISSILE_GUIDANCE_LABELS));
    for (const m of MISSILES) {
      expect(known.has(m.guidance), `missile ${m.id} has unknown guidance ${m.guidance}`).toBe(true);
    }
  });

  it("WEAPONS, AMMO (combined), MISSILES, VEHICLE_WEAPONS, NUCLEAR_WEAPONS all have unique ids", () => {
    for (const [name, list] of [
      ["WEAPONS", WEAPONS],
      ["AMMO_TYPES", AMMO_TYPES],
      ["ADDITIONAL_AMMO", ADDITIONAL_AMMO],
      ["MISSILES", MISSILES],
      ["VEHICLE_WEAPONS", VEHICLE_WEAPONS],
      ["NUCLEAR_WEAPONS", NUCLEAR_WEAPONS],
    ] as const) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size, `${name} has duplicate ids`).toBe(ids.length);
    }
    // Cross-check: AMMO_TYPES + ADDITIONAL_AMMO ids do not collide.
    const allAmmo = [...AMMO_TYPES, ...ADDITIONAL_AMMO].map((a) => a.id);
    expect(new Set(allAmmo).size).toBe(allAmmo.length);
  });

  it("CONTRACT_TEMPLATES_MAP and CONTRACTORS_MAP are 1:1 with their lists", () => {
    expect(Object.keys(CONTRACT_TEMPLATES_MAP).length).toBe(CONTRACT_TEMPLATES.length);
    for (const t of CONTRACT_TEMPLATES) {
      expect(CONTRACT_TEMPLATES_MAP[t.id]).toBe(t);
    }
    expect(Object.keys(CONTRACTORS_MAP).length).toBe(CONTRACTORS.length);
    for (const c of CONTRACTORS) {
      expect(CONTRACTORS_MAP[c.id]).toBe(c);
    }
  });

  it("every CONTRACT_TEMPLATES.contractorId resolves to a known CONTRACTORS entry (no dangling FK)", () => {
    const known = new Set(CONTRACTORS.map((c) => c.id));
    const dangling = CONTRACT_TEMPLATES
      .filter((t) => !known.has(t.contractorId))
      .map((t) => `${t.id}→${t.contractorId}`);
    expect(dangling, "contracts with unknown contractorId").toEqual([]);
  });
});

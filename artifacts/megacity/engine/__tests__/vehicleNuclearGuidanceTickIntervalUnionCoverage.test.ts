import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  VEHICLE_WEAPONS,
  NUCLEAR_WEAPONS,
  MISSILES,
} from "@/engine/weapons";
import { createInitialState } from "@/engine/initialState";
import type {
  VehicleWeaponCategory,
  NuclearWeaponCategory,
  TickIntervalMinutes,
} from "@/engine/types";

/**
 * Drift guard: residual weapon-catalog and tick-interval unions vs
 * runtime catalog usage and persisted state.
 *
 *   VehicleWeaponCategory(8)  ↔ VEHICLE_WEAPONS.category usage:
 *                               every entry's category ∈ union;
 *                               every union member used by ≥1
 *                               vehicle weapon (orphan = dead
 *                               loadout filter branch).
 *
 *   NuclearWeaponCategory(7)  ↔ NUCLEAR_WEAPONS.category usage:
 *                               same contract as above. Adding an
 *                               8th category without a catalog
 *                               entry fails immediately.
 *
 *   MissileDef.guidance(5)    ↔ MISSILES.guidance usage. Inline
 *                               union on MissileDef parsed from
 *                               types.ts; every member used by ≥1
 *                               missile.
 *
 *   TickIntervalMinutes(5)    ↔ literal union from types.ts;
 *                               createInitialState defaults to a
 *                               valid member; the runtime
 *                               saveLoad/_layout fallbacks (15 / 5)
 *                               must also be valid members.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const SAVELOAD_SRC = readFileSync(
  join(__dirname, "..", "saveLoad.ts"),
  "utf8",
);
const GAME_LAYOUT_SRC = readFileSync(
  join(__dirname, "..", "..", "app", "(game)", "_layout.tsx"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

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

function parseNumericUnion(src: string, name: string): number[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([^;]+);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/\b\d+\b/g) ?? []).map(Number);
}

const VEHICLE_WEAPON_CATEGORY = parseUnion(TYPES_SRC, "VehicleWeaponCategory");
const NUCLEAR_WEAPON_CATEGORY = parseUnion(TYPES_SRC, "NuclearWeaponCategory");
const MISSILE_GUIDANCE = parseInlineFieldUnion(TYPES_SRC, "MissileDef", "guidance");
const TICK_INTERVAL = parseNumericUnion(TYPES_SRC, "TickIntervalMinutes");

describe("vehicle / nuclear / guidance / tick-interval union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(VEHICLE_WEAPON_CATEGORY.length).toBe(8);
    expect(NUCLEAR_WEAPON_CATEGORY.length).toBe(7);
    expect(MISSILE_GUIDANCE.length).toBe(5);
    expect(TICK_INTERVAL.length).toBe(5);
  });

  it("VEHICLE_WEAPONS.category values are exactly VehicleWeaponCategory; every member used", () => {
    const known = new Set(VEHICLE_WEAPON_CATEGORY);
    const used = new Set<string>();
    for (const w of VEHICLE_WEAPONS) {
      expect(known.has(w.category), `${w.id} unknown category ${w.category}`).toBe(true);
      used.add(w.category);
    }
    const orphan = VEHICLE_WEAPON_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "VehicleWeaponCategory members unused in catalog").toEqual([]);
  });

  it("NUCLEAR_WEAPONS.category values are exactly NuclearWeaponCategory; every member used", () => {
    const known = new Set(NUCLEAR_WEAPON_CATEGORY);
    const used = new Set<string>();
    for (const w of NUCLEAR_WEAPONS) {
      expect(known.has(w.category), `${w.id} unknown category ${w.category}`).toBe(true);
      used.add(w.category);
    }
    const orphan = NUCLEAR_WEAPON_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "NuclearWeaponCategory members unused in catalog").toEqual([]);
  });

  it("MISSILES.guidance values are exactly MissileDef.guidance inline union; every member used", () => {
    const known = new Set(MISSILE_GUIDANCE);
    const used = new Set<string>();
    for (const m of MISSILES) {
      expect(known.has(m.guidance), `${m.id} unknown guidance ${m.guidance}`).toBe(true);
      used.add(m.guidance);
    }
    const orphan = MISSILE_GUIDANCE.filter((g) => !used.has(g));
    expect(orphan, "MissileDef.guidance members unused in MISSILES").toEqual([]);
  });

  it("TickIntervalMinutes is exactly [1,5,10,15,60]; runtime defaults and fallbacks are valid members", () => {
    expect([...TICK_INTERVAL].sort((a, b) => a - b)).toEqual([1, 5, 10, 15, 60]);

    const known = new Set(TICK_INTERVAL);
    const init = createInitialState();
    expect(
      known.has(init.tickIntervalMinutes),
      `createInitialState default ${init.tickIntervalMinutes} not in TickIntervalMinutes`,
    ).toBe(true);

    // saveLoad fallback: `tickIntervalMinutes: saved.tickIntervalMinutes ?? 15`
    const saveFallback = SAVELOAD_SRC.match(
      /tickIntervalMinutes:\s*saved\.tickIntervalMinutes\s*\?\?\s*(\d+)/,
    );
    expect(saveFallback, "saveLoad fallback not found").not.toBeNull();
    expect(known.has(Number(saveFallback![1]))).toBe(true);

    // layout fallback: `tickIntervalMinutes: state.tickIntervalMinutes ?? 5`
    const layoutFallback = GAME_LAYOUT_SRC.match(
      /tickIntervalMinutes:\s*state\.tickIntervalMinutes\s*\?\?\s*(\d+)/,
    );
    expect(layoutFallback, "_layout fallback not found").not.toBeNull();
    expect(known.has(Number(layoutFallback![1]))).toBe(true);
  });

  // tsc reachability anchors.
  it("type-side anchors compile", () => {
    const _vw: VehicleWeaponCategory[] =
      VEHICLE_WEAPON_CATEGORY as VehicleWeaponCategory[];
    const _nw: NuclearWeaponCategory[] =
      NUCLEAR_WEAPON_CATEGORY as NuclearWeaponCategory[];
    const _ti: TickIntervalMinutes[] = TICK_INTERVAL as TickIntervalMinutes[];
    expect(_vw.length + _nw.length + _ti.length + MISSILE_GUIDANCE.length).toBe(
      VEHICLE_WEAPON_CATEGORY.length +
        NUCLEAR_WEAPON_CATEGORY.length +
        TICK_INTERVAL.length +
        MISSILE_GUIDANCE.length,
    );
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { WILDLANDS_PROJECTS } from "@/engine/wildlandsProjects";
import { MEGAFAUNA_BOSSES } from "@/engine/megafaunaHunts";
import {
  WEAPONS,
  AMMO_TYPES,
  MISSILES,
  WEAPON_CATEGORIES,
  AMMO_CATEGORIES,
  MISSILE_GUIDANCE_LABELS,
} from "@/engine/weapons";
import type {
  WildlandsProjectKind,
  WildlandsProjectStatus,
  MegafaunaId,
} from "@/engine/types";

/**
 * Drift guard: wildlands project taxonomy + megafauna roster +
 * inline weapon / ammo / missile literal unions in WeaponDef /
 * AmmoDef / MissileDef.
 *
 *   WildlandsProjectKind(9)   ↔ WILDLANDS_PROJECTS Record. The Record
 *                                is typed `Record<WildlandsProjectKind, …>`
 *                                so the keyspace is TS-enforced; the
 *                                runtime check verifies each entry's
 *                                `kind` field equals its key.
 *   WildlandsProjectStatus(2) ↔ engine/wildlandsProjects.ts. Every
 *                                literal must appear as either a
 *                                `status: "..."` assignment or a
 *                                `status === "..."` filter.
 *   MegafaunaId(3)            ↔ MEGAFAUNA_BOSSES Record (TS-enforced
 *                                via Record<MegafaunaId, …>) cross-
 *                                checked against MEGAFAUNA_IDS Set
 *                                in sanitizer.ts so save round-trip
 *                                cannot strip a valid id.
 *   WeaponDef.category(14)    ↔ WEAPONS[].category and WEAPON_CATEGORIES
 *                                Record keys. Inline union parsed from
 *                                types.ts; every member used by ≥1
 *                                weapon and ≥1 label row, modulo a
 *                                documented orphan allowlist
 *                                {explosive} — "explosive" is shared
 *                                with AmmoDef.category and currently
 *                                has no WeaponDef instances (kept in
 *                                the union for future explosive-class
 *                                infantry weapons). Still must have a
 *                                WEAPON_CATEGORIES label.
 *   AmmoDef.category(8)       ↔ AMMO_TYPES[].category and AMMO_CATEGORIES
 *                                Record keys. Same pattern.
 *   MissileDef.guidance(5)    ↔ MISSILES[].guidance and
 *                                MISSILE_GUIDANCE_LABELS Record keys.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const WP_SRC = readFileSync(
  join(__dirname, "..", "wildlandsProjects.ts"),
  "utf8",
);
const SANITIZER_SRC = readFileSync(
  join(__dirname, "..", "sanitizer.ts"),
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
  typeName: string,
  field: string,
): string[] {
  const typeRe = new RegExp(
    `export type ${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\};`,
  );
  const tm = src.match(typeRe);
  expect(tm, `type ${typeName} not found`).not.toBeNull();
  const fieldRe = new RegExp(`${field}\\s*:\\s*([^;]+);`);
  const fm = tm![1].match(fieldRe);
  expect(fm, `${typeName}.${field} not found`).not.toBeNull();
  return (fm![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const WILDLANDS_KIND = parseUnion(TYPES_SRC, "WildlandsProjectKind");
const WILDLANDS_STATUS = parseUnion(TYPES_SRC, "WildlandsProjectStatus");
const MEGAFAUNA = parseUnion(TYPES_SRC, "MegafaunaId");
const WEAPON_CAT = parseInlineFieldUnion(TYPES_SRC, "WeaponDef", "category");
const AMMO_CAT = parseInlineFieldUnion(TYPES_SRC, "AmmoDef", "category");
const MISSILE_GUIDANCE = parseInlineFieldUnion(
  TYPES_SRC,
  "MissileDef",
  "guidance",
);

describe("wildlands / megafauna / weapon+ammo+missile inline union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(WILDLANDS_KIND.length).toBe(9);
    expect(WILDLANDS_STATUS.length).toBe(2);
    expect(MEGAFAUNA.length).toBe(3);
    expect(WEAPON_CAT.length).toBe(14);
    expect(AMMO_CAT.length).toBe(8);
    expect(MISSILE_GUIDANCE.length).toBe(5);
  });

  it("WildlandsProjectKind — WILDLANDS_PROJECTS entries' kind field equals its Record key for every union member", () => {
    const known = new Set(WILDLANDS_KIND);
    for (const lit of WILDLANDS_KIND) {
      const def = (WILDLANDS_PROJECTS as Record<string, { kind: string }>)[lit];
      expect(def, `WILDLANDS_PROJECTS missing entry for ${lit}`).toBeDefined();
      expect(def.kind, `entry ${lit} has mismatched kind ${def.kind}`).toBe(lit);
      expect(known.has(def.kind)).toBe(true);
    }
    const sample: WildlandsProjectKind = "ranger_patrol";
    expect(known.has(sample)).toBe(true);
  });

  it("WildlandsProjectStatus — every literal reachable as `status: \"..\"` write or `status === \"..\"` filter in wildlandsProjects.ts", () => {
    for (const lit of WILDLANDS_STATUS) {
      const re = new RegExp(
        `(status\\s*:\\s*"${lit}"|status\\s*(?:===|!==)\\s*"${lit}")`,
      );
      expect(
        re.test(WP_SRC),
        `WildlandsProjectStatus literal "${lit}" never used in wildlandsProjects.ts`,
      ).toBe(true);
    }
    const sample: WildlandsProjectStatus = "active";
    expect(WILDLANDS_STATUS).toContain(sample);
  });

  it("MegafaunaId — MEGAFAUNA_BOSSES Record entries' id matches key, and sanitizer Set whitelist matches union", () => {
    const known = new Set(MEGAFAUNA);
    for (const lit of MEGAFAUNA) {
      const boss = (MEGAFAUNA_BOSSES as Record<string, { id: string }>)[lit];
      expect(boss, `MEGAFAUNA_BOSSES missing entry ${lit}`).toBeDefined();
      expect(boss.id).toBe(lit);
    }
    const setMatch = SANITIZER_SRC.match(
      /MEGAFAUNA_IDS\s*=\s*new Set\(\[(.*?)\]\)/s,
    );
    expect(setMatch, "MEGAFAUNA_IDS set literal not found").not.toBeNull();
    const allowlist = new Set(
      (setMatch![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
        s.replace(/"/g, ""),
      ),
    );
    for (const lit of MEGAFAUNA) {
      expect(allowlist.has(lit), `MEGAFAUNA_IDS missing ${lit}`).toBe(true);
    }
    expect(allowlist.size).toBe(MEGAFAUNA.length);
    const sample: MegafaunaId = "tarpit_titan";
    expect(known.has(sample)).toBe(true);
  });

  it("WeaponDef.category — every inline union member used by ≥1 entry in WEAPONS (modulo documented orphan {explosive}) and has a label in WEAPON_CATEGORIES", () => {
    const known = new Set(WEAPON_CAT);
    const KNOWN_WEAPON_CAT_ORPHANS = new Set<string>(["explosive"]);
    const usedByDef = new Set<string>();
    for (const w of WEAPONS) {
      expect(known.has(w.category as string), `${w.id} unknown weapon category ${w.category}`).toBe(true);
      usedByDef.add(w.category as string);
    }
    const orphan = WEAPON_CAT.filter((c) => !usedByDef.has(c));
    expect(
      new Set(orphan),
      "WeaponDef.category orphan set drifted from documented allowlist",
    ).toEqual(KNOWN_WEAPON_CAT_ORPHANS);
    for (const lit of WEAPON_CAT) {
      if (KNOWN_WEAPON_CAT_ORPHANS.has(lit)) continue;
      expect(
        Object.prototype.hasOwnProperty.call(WEAPON_CATEGORIES, lit),
        `WEAPON_CATEGORIES missing label for ${lit}`,
      ).toBe(true);
    }
  });

  it("AmmoDef.category — every inline union member used by ≥1 entry in AMMO_TYPES and has a label in AMMO_CATEGORIES", () => {
    const known = new Set(AMMO_CAT);
    const usedByDef = new Set<string>();
    for (const a of AMMO_TYPES) {
      expect(known.has(a.category as string), `${a.id} unknown ammo category ${a.category}`).toBe(true);
      usedByDef.add(a.category as string);
    }
    for (const lit of AMMO_CAT) {
      expect(usedByDef.has(lit), `AmmoDef.category ${lit} has no entries in AMMO_TYPES`).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(AMMO_CATEGORIES, lit),
        `AMMO_CATEGORIES missing label for ${lit}`,
      ).toBe(true);
    }
  });

  it("MissileDef.guidance — every inline union member used by ≥1 entry in MISSILES and has a label in MISSILE_GUIDANCE_LABELS", () => {
    const known = new Set(MISSILE_GUIDANCE);
    const usedByDef = new Set<string>();
    for (const m of MISSILES) {
      expect(known.has(m.guidance as string), `${m.id} unknown guidance ${m.guidance}`).toBe(true);
      usedByDef.add(m.guidance as string);
    }
    for (const lit of MISSILE_GUIDANCE) {
      expect(usedByDef.has(lit), `MissileDef.guidance ${lit} has no entries in MISSILES`).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(MISSILE_GUIDANCE_LABELS, lit),
        `MISSILE_GUIDANCE_LABELS missing label for ${lit}`,
      ).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  APPOINTMENT_METHODS,
} from "@/engine/officers";
import {
  VEHICLE_WEAPONS,
  NUCLEAR_WEAPONS,
  VEHICLE_WEAPON_CATEGORIES,
  NUCLEAR_WEAPON_CATEGORIES,
} from "@/engine/weapons";
import type {
  PartnerControlStatus,
  AppointmentMethod,
  VehicleWeaponCategory,
  NuclearWeaponCategory,
} from "@/engine/types";

/**
 * Drift guard: partner control status + officer appointment method
 * + vehicle weapon category + nuclear weapon category.
 *
 *   PartnerControlStatus(3)  ↔ engine/partnerCityStats.ts — every
 *                               literal must be reachable as either
 *                               a default fallback, an `as const`
 *                               assignment, or a `===` branch in
 *                               the partner control state machine.
 *   AppointmentMethod(4)     ↔ APPOINTMENT_METHODS catalog. id field
 *                               of every entry must be a known
 *                               literal; every literal must appear
 *                               as ≥1 entry id. 1:1.
 *   VehicleWeaponCategory(8) ↔ VEHICLE_WEAPONS[].category and
 *                               VEHICLE_WEAPON_CATEGORIES Record
 *                               keys. Every union member used by
 *                               ≥1 weapon and ≥1 label row.
 *   NuclearWeaponCategory(7) ↔ NUCLEAR_WEAPONS[].category and
 *                               NUCLEAR_WEAPON_CATEGORIES Record
 *                               keys. Every union member used by
 *                               ≥1 weapon and ≥1 label row.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const PARTNER_CITY_SRC = readFileSync(
  join(__dirname, "..", "partnerCityStats.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const PARTNER_CONTROL = parseUnion(TYPES_SRC, "PartnerControlStatus");
const APPOINTMENT = parseUnion(TYPES_SRC, "AppointmentMethod");
const VEHICLE_CAT = parseUnion(TYPES_SRC, "VehicleWeaponCategory");
const NUCLEAR_CAT = parseUnion(TYPES_SRC, "NuclearWeaponCategory");

describe("partner control / appointment / vehicle+nuclear weapon category union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(PARTNER_CONTROL.length).toBe(3);
    expect(APPOINTMENT.length).toBe(4);
    expect(VEHICLE_CAT.length).toBe(8);
    expect(NUCLEAR_CAT.length).toBe(7);
  });

  it("PartnerControlStatus — every union member reachable as default, `as const`, or `===` branch in partnerCityStats.ts", () => {
    for (const lit of PARTNER_CONTROL) {
      const re = new RegExp(
        `(\\?\\?\\s*"${lit}"|"${lit}"\\s+as\\s+const|controlStatus\\s*(?:===|!==)\\s*"${lit}")`,
      );
      expect(
        re.test(PARTNER_CITY_SRC),
        `PartnerControlStatus literal "${lit}" never used in partnerCityStats.ts`,
      ).toBe(true);
    }
    const sample: PartnerControlStatus = "independent";
    expect(PARTNER_CONTROL).toContain(sample);
  });

  it("AppointmentMethod — APPOINTMENT_METHODS catalog matches union 1:1", () => {
    const known = new Set(APPOINTMENT);
    const used = new Set<string>();
    for (const m of APPOINTMENT_METHODS) {
      expect(known.has(m.id), `unknown AppointmentMethod id ${m.id}`).toBe(true);
      expect(typeof m.name).toBe("string");
      expect(m.name.length).toBeGreaterThan(0);
      used.add(m.id);
    }
    expect(used.size).toBe(APPOINTMENT.length);
    for (const lit of APPOINTMENT) {
      expect(used.has(lit), `AppointmentMethod ${lit} missing from catalog`).toBe(true);
    }
    const sample: AppointmentMethod = "direct";
    expect(known.has(sample)).toBe(true);
  });

  it("VehicleWeaponCategory — every union member used by ≥1 vehicle weapon and ≥1 label row", () => {
    const known = new Set(VEHICLE_CAT);
    const usedByDef = new Set<string>();
    for (const w of VEHICLE_WEAPONS) {
      expect(known.has(w.category as string), `${w.id} unknown vehicle category ${w.category}`).toBe(true);
      usedByDef.add(w.category as string);
    }
    for (const lit of VEHICLE_CAT) {
      expect(usedByDef.has(lit), `VehicleWeaponCategory ${lit} has no weapons`).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(VEHICLE_WEAPON_CATEGORIES, lit),
        `VEHICLE_WEAPON_CATEGORIES missing label for ${lit}`,
      ).toBe(true);
    }
    const sample: VehicleWeaponCategory = "cannon";
    expect(known.has(sample)).toBe(true);
  });

  it("NuclearWeaponCategory — every union member used by ≥1 nuclear weapon and ≥1 label row", () => {
    const known = new Set(NUCLEAR_CAT);
    const usedByDef = new Set<string>();
    for (const w of NUCLEAR_WEAPONS) {
      expect(known.has(w.category as string), `${w.id} unknown nuclear category ${w.category}`).toBe(true);
      usedByDef.add(w.category as string);
    }
    for (const lit of NUCLEAR_CAT) {
      expect(usedByDef.has(lit), `NuclearWeaponCategory ${lit} has no weapons`).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(NUCLEAR_WEAPON_CATEGORIES, lit),
        `NUCLEAR_WEAPON_CATEGORIES missing label for ${lit}`,
      ).toBe(true);
    }
    const sample: NuclearWeaponCategory = "tactical";
    expect(known.has(sample)).toBe(true);
  });
});

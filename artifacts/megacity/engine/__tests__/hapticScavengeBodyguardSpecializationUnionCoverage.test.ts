import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SCAVENGE_ZONES,
  ZONE_TYPE_LABELS,
  ZONE_TYPE_COLORS,
  type ScavengeZoneType,
} from "@/engine/scavengingData";
import {
  SPECIALIZATIONS,
  type SpecializationPath,
} from "@/engine/retinueData";

/**
 * Drift guard: small QoL/cosmetic unions that are easy to drop a
 * member from when refactoring.
 *
 *   HapticIntensity(4)      ↔ playHaptic() switch in haptics.ts.
 *                             Every union member must have its own
 *                             case branch; no orphan intensities.
 *
 *   ScavengeZoneType(6)     ↔ ZONE_TYPE_LABELS / ZONE_TYPE_COLORS
 *                             Records (1:1) AND
 *                             SCAVENGE_ZONES[].type usage; every
 *                             member used by ≥1 zone; UPPERCASE
 *                             labels; hex colors.
 *
 *   BodyguardOrigin(3)      ↔ BODYGUARDS[].origin usage in
 *                             bodyguardData.ts; every union member
 *                             used by ≥1 def.
 *
 *   SpecializationPath(4)   ↔ SPECIALIZATIONS catalog (1:1, unique
 *                             ids, eligibleClasses non-empty,
 *                             positive ticksRequired/cost).
 */

const HAPTICS_SRC = readFileSync(join(__dirname, "..", "haptics.ts"), "utf8");
const SCAVENGE_SRC = readFileSync(
  join(__dirname, "..", "scavengingData.ts"),
  "utf8",
);
const BODYGUARD_SRC = readFileSync(
  join(__dirname, "..", "bodyguardData.ts"),
  "utf8",
);
const RETINUE_SRC = readFileSync(
  join(__dirname, "..", "retinueData.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const HAPTIC_INTENSITY = parseUnion(HAPTICS_SRC, "HapticIntensity");
const SCAVENGE_ZONE_TYPE = parseUnion(SCAVENGE_SRC, "ScavengeZoneType");
const BODYGUARD_ORIGIN = parseUnion(BODYGUARD_SRC, "BodyguardOrigin");
const SPECIALIZATION_PATH = parseUnion(RETINUE_SRC, "SpecializationPath");

describe("haptic / scavenge / bodyguard / specialization union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(HAPTIC_INTENSITY.length).toBe(4);
    expect(SCAVENGE_ZONE_TYPE.length).toBe(6);
    expect(BODYGUARD_ORIGIN.length).toBe(3);
    expect(SPECIALIZATION_PATH.length).toBe(4);
  });

  it("playHaptic switch covers every HapticIntensity member with its own case branch", () => {
    for (const i of HAPTIC_INTENSITY) {
      expect(HAPTICS_SRC, `playHaptic missing case "${i}"`).toContain(
        `case "${i}":`,
      );
    }
    // Pin the canonical light→medium→heavy + error tier to catch
    // an accidental reorder that breaks UX intensity expectations.
    expect(HAPTIC_INTENSITY).toEqual(["light", "medium", "heavy", "error"]);
  });

  it("ZONE_TYPE_LABELS and ZONE_TYPE_COLORS cover ScavengeZoneType exactly with UPPERCASE labels and hex colors", () => {
    const want = [...SCAVENGE_ZONE_TYPE].sort();
    expect(Object.keys(ZONE_TYPE_LABELS).sort()).toEqual(want);
    expect(Object.keys(ZONE_TYPE_COLORS).sort()).toEqual(want);
    for (const t of SCAVENGE_ZONE_TYPE) {
      const k = t as ScavengeZoneType;
      const label = ZONE_TYPE_LABELS[k];
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.toUpperCase());
      expect(ZONE_TYPE_COLORS[k]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("SCAVENGE_ZONES[].type values are subset of ScavengeZoneType; every member used by ≥1 zone; ids unique", () => {
    const known = new Set(SCAVENGE_ZONE_TYPE);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const z of SCAVENGE_ZONES) {
      expect(known.has(z.type), `${z.id} unknown zone type ${z.type}`).toBe(true);
      expect(ids.has(z.id), `duplicate zone id ${z.id}`).toBe(false);
      ids.add(z.id);
      used.add(z.type);
      expect(z.dangerLevel).toBeGreaterThan(0);
      expect(z.discoveryChance).toBeGreaterThan(0);
      expect(z.minTeam).toBeGreaterThan(0);
      expect(z.possibleLoot.length).toBeGreaterThan(0);
    }
    const orphan = SCAVENGE_ZONE_TYPE.filter((t) => !used.has(t));
    expect(orphan, "ScavengeZoneType members unused in SCAVENGE_ZONES").toEqual([]);
  });

  it("BODYGUARDS[].origin usage covers every BodyguardOrigin union member", () => {
    const known = new Set(BODYGUARD_ORIGIN);
    const used = new Set<string>();
    const re = /origin:\s*"([a-zA-Z_]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(BODYGUARD_SRC)) !== null) {
      // Only count origins that are valid union members; the type
      // alias literal itself appears in the source too.
      if (known.has(m[1])) used.add(m[1]);
    }
    const orphan = BODYGUARD_ORIGIN.filter((o) => !used.has(o));
    expect(orphan, "BodyguardOrigin members unused in BODYGUARDS").toEqual([]);
  });

  it("SPECIALIZATIONS catalog matches SpecializationPath 1:1 with sane budget invariants", () => {
    const want = [...SPECIALIZATION_PATH].sort();
    const got = SPECIALIZATIONS.map((s) => s.id as string).sort();
    expect(got).toEqual(want);
    const ids = new Set<string>();
    for (const s of SPECIALIZATIONS) {
      expect(ids.has(s.id), `duplicate specialization id ${s.id}`).toBe(false);
      ids.add(s.id);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.icon.length).toBeGreaterThan(0);
      expect(s.eligibleClasses.length).toBeGreaterThan(0);
      expect(s.ticksRequired).toBeGreaterThan(0);
      expect(s.cost).toBeGreaterThan(0);
      expect(Object.keys(s.bonuses).length).toBeGreaterThan(0);
    }
    // Type touch — preserve drift guard if catalog is rewritten.
    const sample: SpecializationPath = SPECIALIZATIONS[0].id;
    expect(typeof sample).toBe("string");
  });
});

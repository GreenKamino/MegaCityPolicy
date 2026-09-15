import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WASTELAND_RESOURCES,
  SCAVENGER_FACTIONS,
  RAIDER_GANGS,
  WASTELAND_STRUCTURES,
  WASTELAND_EVENTS,
  WASTELAND_TECHS,
  WASTELAND_DISCOVERIES,
  SECTOR_TYPE_DISTRIBUTION,
} from "@/engine/wasteland";
import {
  BIOMES,
  ALL_BIOMES,
  ECOLOGY_TIER_BAND,
  ECOLOGY_TIER_BASELINE,
  DISTRICT_CATEGORY_TO_BIOME,
} from "@/engine/biomes";
import { MEGAFAUNA_BOSSES } from "@/engine/megafaunaHunts";
import {
  OFFICER_POSITIONS,
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  RANK_LABELS,
  RANK_ORDER,
  APPOINTMENT_METHODS,
} from "@/engine/officers";

/**
 * Drift guard: wasteland / biomes / megafauna / officers union coverage.
 *
 * Surfaces tsc cannot enforce on its own:
 *
 *   WastelandResourceRarity 3 → rarity literal on every WASTELAND_RESOURCES
 *                                entry (untyped Record path)
 *   SECTOR_TYPE_DISTRIBUTION    Record<WastelandSectorType, …> (tsc) but
 *                                count + label values can drift to 0/empty
 *   Biome                   7 → BIOMES Record (tsc), ALL_BIOMES = derived
 *                                from Object.keys (consistency check)
 *                                DISTRICT_CATEGORY_TO_BIOME values must be
 *                                in the union (Record<string, Biome>)
 *   EcologyTier             4 → ECOLOGY_TIER_BAND + BASELINE (tsc Records)
 *   MegafaunaId             3 → MEGAFAUNA_BOSSES Record (tsc), values must
 *                                have id matching their key
 *   OfficerDepartment      11 → DEPARTMENT_LABELS Record (tsc),
 *                                DEPARTMENT_ORDER hand-maintained list,
 *                                OFFICER_POSITIONS departments
 *   OfficerRank             6 → RANK_LABELS Record (tsc),
 *                                RANK_ORDER hand-maintained list
 *   AppointmentMethod       4 → APPOINTMENT_METHODS array {id,name,...}
 *
 * Hand-maintained order arrays + array-of-{id,…} catalogs are the
 * primary drift surfaces here — tsc types the id field but does not
 * enforce that every union member appears, or that the order list
 * has no dupes.
 */

const WASTELAND_SRC = readFileSync(
  join(__dirname, "..", "wasteland.ts"),
  "utf8",
);
const BIOMES_SRC = readFileSync(
  join(__dirname, "..", "biomes.ts"),
  "utf8",
);
const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const SECTOR_TYPES = parseUnion(WASTELAND_SRC, "WastelandSectorType");
const RESOURCE_RARITIES = parseUnion(
  WASTELAND_SRC,
  "WastelandResourceRarity",
);
const BIOME_KEYS = parseUnion(BIOMES_SRC, "Biome");
const ECOLOGY_TIERS = parseUnion(BIOMES_SRC, "EcologyTier");
const MEGAFAUNA_IDS = parseUnion(TYPES_SRC, "MegafaunaId");
const DEPARTMENTS = parseUnion(TYPES_SRC, "OfficerDepartment");
const RANKS = parseUnion(TYPES_SRC, "OfficerRank");
const APPOINTMENT_METHOD_KEYS = parseUnion(TYPES_SRC, "AppointmentMethod");

describe("wasteland / biomes / megafauna / officers drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(SECTOR_TYPES.length).toBe(10);
    expect(RESOURCE_RARITIES.length).toBe(3);
    expect(BIOME_KEYS.length).toBe(7);
    expect(ECOLOGY_TIERS.length).toBe(4);
    expect(MEGAFAUNA_IDS.length).toBe(3);
    expect(DEPARTMENTS.length).toBe(11);
    expect(RANKS.length).toBe(6);
    expect(APPOINTMENT_METHOD_KEYS.length).toBe(4);
  });

  it("wasteland catalog sizes are pinned (budget)", () => {
    expect(SCAVENGER_FACTIONS.length).toBe(50);
    expect(RAIDER_GANGS.length).toBe(50);
    expect(WASTELAND_STRUCTURES.length).toBe(100);
    expect(WASTELAND_EVENTS.length).toBe(100);
    expect(WASTELAND_TECHS.length).toBe(93);
    expect(WASTELAND_DISCOVERIES.length).toBe(40);
  });

  it("SECTOR_TYPE_DISTRIBUTION covers WastelandSectorType with positive counts and non-empty labels", () => {
    expect(Object.keys(SECTOR_TYPE_DISTRIBUTION).sort()).toEqual(
      [...SECTOR_TYPES].sort(),
    );
    for (const s of SECTOR_TYPES) {
      const k = s as keyof typeof SECTOR_TYPE_DISTRIBUTION;
      expect(SECTOR_TYPE_DISTRIBUTION[k].count).toBeGreaterThan(0);
      expect(SECTOR_TYPE_DISTRIBUTION[k].label.length).toBeGreaterThan(0);
    }
  });

  it("every WastelandResourceRarity union member is used by ≥1 WASTELAND_RESOURCES entry", () => {
    const used = new Set(WASTELAND_RESOURCES.map((r) => r.rarity));
    const missing = RESOURCE_RARITIES.filter((r) => !used.has(r as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(RESOURCE_RARITIES);
    const orphans = [...used].filter((r) => !unionSet.has(r));
    expect(orphans).toEqual([]);
  });

  it("wasteland catalog ids are unique within each catalog", () => {
    for (const [name, list] of [
      ["SCAVENGER_FACTIONS", SCAVENGER_FACTIONS],
      ["RAIDER_GANGS", RAIDER_GANGS],
      ["WASTELAND_STRUCTURES", WASTELAND_STRUCTURES],
      ["WASTELAND_EVENTS", WASTELAND_EVENTS],
      ["WASTELAND_TECHS", WASTELAND_TECHS],
      ["WASTELAND_DISCOVERIES", WASTELAND_DISCOVERIES],
    ] as const) {
      const ids = (list as { id: string }[]).map((e) => e.id);
      expect(
        new Set(ids).size,
        `${name} contains duplicate ids`,
      ).toBe(ids.length);
    }
  });

  it("BIOMES Record keys equal Biome union exactly; ALL_BIOMES is the same set", () => {
    expect(Object.keys(BIOMES).sort()).toEqual([...BIOME_KEYS].sort());
    expect([...ALL_BIOMES].sort()).toEqual([...BIOME_KEYS].sort());
    expect(new Set(ALL_BIOMES).size).toBe(ALL_BIOMES.length);
  });

  it("DISTRICT_CATEGORY_TO_BIOME values are all in the Biome union", () => {
    const unionSet = new Set(BIOME_KEYS);
    const orphans = Object.values(DISTRICT_CATEGORY_TO_BIOME).filter(
      (b) => !unionSet.has(b),
    );
    expect(orphans).toEqual([]);
    // No empty mapping table.
    expect(Object.keys(DISTRICT_CATEGORY_TO_BIOME).length).toBeGreaterThan(0);
  });

  it("ECOLOGY_TIER_BAND + ECOLOGY_TIER_BASELINE keys equal EcologyTier exactly with sane values", () => {
    expect(Object.keys(ECOLOGY_TIER_BAND).sort()).toEqual(
      [...ECOLOGY_TIERS].sort(),
    );
    expect(Object.keys(ECOLOGY_TIER_BASELINE).sort()).toEqual(
      [...ECOLOGY_TIERS].sort(),
    );
    for (const t of ECOLOGY_TIERS) {
      const k = t as keyof typeof ECOLOGY_TIER_BAND;
      const [lo, hi] = ECOLOGY_TIER_BAND[k];
      expect(lo).toBeLessThanOrEqual(hi);
      const baseline =
        ECOLOGY_TIER_BASELINE[t as keyof typeof ECOLOGY_TIER_BASELINE];
      expect(Number.isFinite(baseline)).toBe(true);
    }
  });

  it("MEGAFAUNA_BOSSES Record keys equal MegafaunaId union exactly with self-consistent ids", () => {
    expect(Object.keys(MEGAFAUNA_BOSSES).sort()).toEqual(
      [...MEGAFAUNA_IDS].sort(),
    );
    for (const id of MEGAFAUNA_IDS) {
      const boss = MEGAFAUNA_BOSSES[id as keyof typeof MEGAFAUNA_BOSSES];
      expect(boss.id, `MEGAFAUNA_BOSSES[${id}].id mismatches key`).toBe(id);
    }
  });

  it("DEPARTMENT_LABELS keys equal OfficerDepartment exactly with non-empty labels", () => {
    expect(Object.keys(DEPARTMENT_LABELS).sort()).toEqual(
      [...DEPARTMENTS].sort(),
    );
    for (const d of DEPARTMENTS) {
      expect(
        DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS].length,
      ).toBeGreaterThan(0);
    }
  });

  it("DEPARTMENT_ORDER contains every OfficerDepartment exactly once", () => {
    expect([...DEPARTMENT_ORDER].sort()).toEqual([...DEPARTMENTS].sort());
    expect(new Set(DEPARTMENT_ORDER).size).toBe(DEPARTMENT_ORDER.length);
  });

  it("RANK_LABELS keys equal OfficerRank exactly; RANK_ORDER contains each rank once", () => {
    expect(Object.keys(RANK_LABELS).sort()).toEqual([...RANKS].sort());
    expect([...RANK_ORDER].sort()).toEqual([...RANKS].sort());
    expect(new Set(RANK_ORDER).size).toBe(RANK_ORDER.length);
    for (const r of RANKS) {
      expect(RANK_LABELS[r as keyof typeof RANK_LABELS].length).toBeGreaterThan(
        0,
      );
    }
  });

  it("APPOINTMENT_METHODS ids equal AppointmentMethod exactly with non-empty descriptions", () => {
    const ids = APPOINTMENT_METHODS.map((m) => m.id);
    expect([...ids].sort()).toEqual([...APPOINTMENT_METHOD_KEYS].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of APPOINTMENT_METHODS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.effects.length).toBeGreaterThan(0);
    }
  });

  it("OFFICER_POSITIONS catalog covers every OfficerDepartment and ids are unique", () => {
    expect(OFFICER_POSITIONS.length).toBe(105);
    const ids = OFFICER_POSITIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const used = new Set(OFFICER_POSITIONS.map((p) => p.department));
    const missing = DEPARTMENTS.filter((d) => !used.has(d as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(DEPARTMENTS);
    const orphans = [...used].filter((d) => !unionSet.has(d));
    expect(orphans).toEqual([]);
  });
});

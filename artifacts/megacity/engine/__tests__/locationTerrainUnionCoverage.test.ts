import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TERRAIN_LABELS,
  TERRAIN_ICONS,
  TERRAIN_COLORS,
  WORLD_LOCATIONS,
} from "@/engine/worldMap";
import type { LocationTerrain } from "@/engine/worldMap";

/**
 * Drift guard: LocationTerrain union coverage.
 *
 *   LocationTerrain(18 members) is the source-of-truth for every
 *   .terrain field stamped onto WORLD_LOCATIONS. It is consumed by
 *   three parallel typed Records (LABELS, ICONS, COLORS) and by the
 *   map encounter predicate set.
 *
 *   This test re-parses the union from worldMap.ts (regex on the
 *   `export type LocationTerrain = "…" | …;` declaration), pins
 *   the member count to 18, then asserts:
 *     - each of the three Records has exactly the union as keys
 *       (no missing, no orphan)
 *     - every WORLD_LOCATIONS[].terrain value is a known union
 *       member (subset; union members not used by any location are
 *       allowed — some terrains exist for future authoring)
 *     - sample of orbital and submerged emit ≥1x to keep the more
 *       exotic terrains from rotting unnoticed
 */

const WORLDMAP_SRC = readFileSync(join(__dirname, "..", "worldMap.ts"), "utf8");

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const LOCATION_TERRAIN = parseUnion(WORLDMAP_SRC, "LocationTerrain");
const LOCATION_TERRAIN_SET = new Set(LOCATION_TERRAIN);

describe("LocationTerrain union coverage drift guard", () => {
  it("union member count is budget-pinned (18)", () => {
    expect(LOCATION_TERRAIN.length).toBe(18);
    expect(new Set(LOCATION_TERRAIN).size).toBe(LOCATION_TERRAIN.length);
    // Spot-pin a few canonical members so a rename surfaces here too.
    for (const t of [
      "urban",
      "coastal",
      "mountain",
      "wasteland",
      "orbital",
      "submerged",
    ]) {
      expect(LOCATION_TERRAIN, `LocationTerrain ${t} missing`).toContain(t);
    }
  });

  it("TERRAIN_LABELS, TERRAIN_ICONS, TERRAIN_COLORS each cover LocationTerrain 1:1", () => {
    const records: Record<string, Record<string, unknown>> = {
      TERRAIN_LABELS: TERRAIN_LABELS as unknown as Record<string, unknown>,
      TERRAIN_ICONS: TERRAIN_ICONS as unknown as Record<string, unknown>,
      TERRAIN_COLORS: TERRAIN_COLORS as unknown as Record<string, unknown>,
    };
    for (const [label, rec] of Object.entries(records)) {
      const keys = Object.keys(rec);
      expect(new Set(keys).size, `${label} duplicate keys`).toBe(keys.length);
      expect(keys.length, `${label} key count != union size`).toBe(
        LOCATION_TERRAIN.length,
      );
      for (const t of LOCATION_TERRAIN) {
        expect(rec[t], `${label} missing terrain ${t}`).toBeDefined();
      }
      for (const k of keys) {
        expect(
          LOCATION_TERRAIN_SET.has(k),
          `${label}: orphan terrain key ${k}`,
        ).toBe(true);
      }
    }
  });

  it("every WORLD_LOCATIONS[].terrain value is a known LocationTerrain", () => {
    const used = new Set<string>();
    for (const loc of WORLD_LOCATIONS) {
      if (loc.terrain) used.add(loc.terrain);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const t of used) {
      expect(
        LOCATION_TERRAIN_SET.has(t),
        `WORLD_LOCATIONS terrain ${t} not in LocationTerrain union`,
      ).toBe(true);
    }
    // Compile-time + runtime assertion that the union is what we
    // think it is from a known-good sample.
    const sample: LocationTerrain = "urban";
    expect(LOCATION_TERRAIN_SET.has(sample)).toBe(true);
  });
});

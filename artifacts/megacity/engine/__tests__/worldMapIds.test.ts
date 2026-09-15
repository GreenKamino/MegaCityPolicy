import { describe, expect, it } from "vitest";

import {
  hasCoastalAccess,
  STARTING_REGIONS,
  STARTING_REGIONS_WITH_WATER_ACCESS,
  WORLD_LOCATIONS,
} from "@/engine/worldMap";
import { LOCATION_POSITIONS } from "@/engine/worldMapPositions";

describe("world map id uniqueness", () => {
  it("WORLD_LOCATIONS has no duplicate ids", () => {
    const ids = WORLD_LOCATIONS.map((l) => l.id);
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dups, `duplicate WORLD_LOCATIONS ids: ${dups.join(", ")}`).toEqual([]);
  });

  it("STARTING_REGIONS has no duplicate ids", () => {
    const ids = STARTING_REGIONS.map((r) => r.id);
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dups, `duplicate STARTING_REGIONS ids: ${dups.join(", ")}`).toEqual([]);
  });

  it("WORLD_LOCATIONS and STARTING_REGIONS share no ids", () => {
    const locIds = new Set(WORLD_LOCATIONS.map((l) => l.id));
    const collisions = STARTING_REGIONS.map((r) => r.id).filter((id) => locIds.has(id));
    expect(
      collisions,
      `starting region ids collide with world location ids: ${collisions.join(", ")}`,
    ).toEqual([]);
  });

  it("LOCATION_POSITIONS contains an entry for every WORLD_LOCATION", () => {
    const expected = WORLD_LOCATIONS.map((l) => l.id);
    const missing = expected.filter((id) => !(id in LOCATION_POSITIONS));
    expect(missing, `missing LOCATION_POSITIONS entries: ${missing.join(", ")}`).toEqual([]);
    expect(Object.keys(LOCATION_POSITIONS).length).toBe(expected.length);
  });

  // STARTING_REGIONS spawn coordinates live on the region entry (playerX/playerY)
  // and must NOT be duplicated into LOCATION_POSITIONS. A copy in both places
  // means the auto-generated map data and the live spawn can silently disagree
  // — exactly the bug this guard prevents from being reintroduced.
  it("LOCATION_POSITIONS contains no STARTING_REGION ids", () => {
    const regionIds = new Set(STARTING_REGIONS.map((r) => r.id));
    const leaked = Object.keys(LOCATION_POSITIONS).filter((id) => regionIds.has(id));
    expect(
      leaked,
      `STARTING_REGION ids leaked into LOCATION_POSITIONS: ${leaked.join(", ")}`,
    ).toEqual([]);
  });

  it("includes the two #912 presets with exactly one new coastal start", () => {
    const addedIds = ["heartland-redoubt", "pacific-foothold"];
    expect(STARTING_REGIONS).toHaveLength(14);
    expect(STARTING_REGIONS.map((region) => region.id)).toEqual(expect.arrayContaining(addedIds));
    expect(hasCoastalAccess("pacific-foothold")).toBe(true);
    expect(hasCoastalAccess("heartland-redoubt")).toBe(false);
    expect(STARTING_REGIONS_WITH_WATER_ACCESS.has("pacific-foothold")).toBe(true);
    expect(STARTING_REGIONS_WITH_WATER_ACCESS.has("heartland-redoubt")).toBe(false);
  });

});

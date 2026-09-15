import { describe, expect, it } from "vitest";

import {
  WORLD_MAP_TERRAIN_HIT_TARGET_Z_INDEX,
  getWorldMapHitTargetPriority,
  sortWorldMapLocationsForHitTesting,
} from "@/utils/worldMapHitTargets";

describe("world-map marker hit priority", () => {
  it("always paints megacities above area-like locations", () => {
    expect(getWorldMapHitTargetPriority("megacity")).toBeGreaterThan(
      getWorldMapHitTargetPriority("nation"),
    );
    expect(getWorldMapHitTargetPriority("megacity")).toBeGreaterThan(
      getWorldMapHitTargetPriority("township"),
    );
    expect(getWorldMapHitTargetPriority("megacity")).toBeGreaterThan(
      getWorldMapHitTargetPriority("notable"),
    );
    expect(getWorldMapHitTargetPriority("megacity")).toBeGreaterThan(
      getWorldMapHitTargetPriority("resource_node"),
    );
  });

  it("keeps broad terrain interactions below every location node", () => {
    expect(getWorldMapHitTargetPriority("resource_node")).toBeGreaterThan(
      WORLD_MAP_TERRAIN_HIT_TARGET_Z_INDEX,
    );
  });

  it("returns a stable, non-mutating order for crowded markers", () => {
    const locations = [
      { id: "zeta", type: "megacity" as const },
      { id: "area", type: "nation" as const },
      { id: "alpha", type: "megacity" as const },
      { id: "site", type: "notable" as const },
    ];

    expect(sortWorldMapLocationsForHitTesting(locations).map((loc) => loc.id)).toEqual([
      "site",
      "area",
      "alpha",
      "zeta",
    ]);
    expect(locations.map((loc) => loc.id)).toEqual(["zeta", "area", "alpha", "site"]);
  });
});
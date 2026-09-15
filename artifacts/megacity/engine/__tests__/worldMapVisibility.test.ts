import { describe, expect, it } from "vitest";
import { isWorldLocationVisibleOnMap, WORLD_LOCATIONS } from "@/engine/worldMap";

describe("world map marker visibility", () => {
  it("shows hidden megacities as uncharted map signals", () => {
    const hiddenMegacities = WORLD_LOCATIONS.filter(
      (location) => location.type === "megacity" && !location.discovered,
    );

    expect(hiddenMegacities.length).toBeGreaterThan(0);
    for (const location of hiddenMegacities) {
      expect(isWorldLocationVisibleOnMap(location, [])).toBe(true);
    }
  });

  it("keeps other undiscovered locations in the fog until discovered", () => {
    const hiddenNonMegacity = WORLD_LOCATIONS.find(
      (location) => location.type !== "megacity" && !location.discovered,
    );

    expect(hiddenNonMegacity).toBeDefined();
    expect(isWorldLocationVisibleOnMap(hiddenNonMegacity!, [])).toBe(false);
    expect(isWorldLocationVisibleOnMap(hiddenNonMegacity!, [hiddenNonMegacity!.id])).toBe(true);
  });
});
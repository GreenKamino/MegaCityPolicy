import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const constructionSource = readFileSync(path.resolve(here, "../../app/(game)/construction.tsx"), "utf8");
const economySource = readFileSync(path.resolve(here, "../../app/(game)/economy.tsx"), "utf8");
const worldMapSource = readFileSync(path.resolve(here, "../../app/(game)/worldmap.tsx"), "utf8");

describe("selected building storage UI", () => {
  it("explains every selected building's per-building capacity on construction cards", () => {
    expect(constructionSource).toContain("+500 Goods storage");
    expect(constructionSource).toContain("+750 Steel / +750 Goods storage");
    expect(constructionSource).toContain("+250 Goods storage");
    expect(constructionSource).toContain("+1,000 Food storage");
  });

  it("shows Food current/capacity and every contributor count on Economy", () => {
    expect(constructionSource).toContain("+5,000 Steel & Goods capacity");
    expect(economySource).toContain('title="Selected Building Storage"');
    expect(economySource).toContain("foodStorage.current");
    expect(economySource).toContain("foodStorage.capacity");
    expect(economySource).toContain("selectedStorageBuildings.map");
    expect(economySource).toContain("building.count");
    expect(economySource).toContain("Supply Chain Distribution Centers:");
    expect(economySource).toContain("STORAGE_PER_DISTRIBUTION_CENTER");
  });

  it("surfaces the tank farm capacity on construction and Economy", () => {
    expect(constructionSource).toContain('key: "fuelReserveTankFarms"');
    expect(constructionSource).toContain("+2,000 Fuel storage");
    expect(economySource).toContain('title="Fuel Reserve Storage"');
    expect(economySource).toContain("fuelTankFarms * FUEL_STORAGE_PER_TANK_FARM");
    expect(economySource).toContain("positive fuel gains are rejected; consumption still applies");
  });

  it("shows a single actionable plan for every bounded reserve", () => {
    expect(economySource).toContain('title="Storage Plan"');
    expect(economySource).toContain("getResourceStoragePlan");
    expect(economySource).toContain("entry.current");
    expect(economySource).toContain("entry.capacity");
    expect(economySource).toContain("entry.available");
    expect(economySource).toContain("entry.structuralCapacity");
    expect(economySource).toContain("entry.nextUpgrade");
    expect(economySource).toContain("Water, Credits, city Ammo");
  });

  it("routes world-map food gains and drains through the shared storage helper", () => {
    expect(worldMapSource).toContain('import { applyResourceDelta } from "@/engine/resourceStorage"');
    expect(worldMapSource).toContain('applyResourceDelta(s, "food", foodDelta)');
    expect(worldMapSource).toContain('applyResourceDelta(s, "ammo", ammoDelta)');
    expect(worldMapSource).not.toContain("s.resources.food = Math.max");
  });
});
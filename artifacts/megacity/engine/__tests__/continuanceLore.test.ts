import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WORLD_LOCATIONS, getWorldRoutes, isWorldLocationVisibleOnMap } from "@/engine/worldMap";
import { DEFAULT_CONTINUANCE_OPERATIONAL, getEffectiveContinuanceDiscoveryStage } from "@/engine/continuance";

const worldMapScreenSource = readFileSync(resolve(process.cwd(), "app/(game)/worldmap.tsx"), "utf8");

describe("USR — United States Remnants — map presence", () => {
  it("keeps USR hidden until location discovery", () => {
    const cheyenne = WORLD_LOCATIONS.find((l) => l.id === "cheyenne-mountain");
    expect(cheyenne).toBeDefined();
    expect(cheyenne!.type).toBe("notable");
    expect(cheyenne!.discovered).toBe(false);
    expect(cheyenne!.population).toBe(0);
    expect(cheyenne!.defenseRating).toBe(0);
    expect(cheyenne!.name).toBe("USR (United States Remnants)");
    expect(cheyenne!.faction).toBe("United States Remnants");
    expect(isWorldLocationVisibleOnMap(cheyenne!, [])).toBe(false);
    expect(isWorldLocationVisibleOnMap(cheyenne!, null as never)).toBe(false);
    expect(isWorldLocationVisibleOnMap(cheyenne!, [cheyenne!.id])).toBe(true);
  });

  it("preserves Cheyenne Mountain map routes without exposing them before discovery", () => {
    const cheyenne = WORLD_LOCATIONS.find((l) => l.id === "cheyenne-mountain")!;
    const neighbors = cheyenne.connectedTo.map((id) => WORLD_LOCATIONS.find((l) => l.id === id)).filter(Boolean);
    expect(neighbors.length).toBe(cheyenne.connectedTo.length);
    expect(cheyenne.connectedTo).toEqual(["the-pit", "dead-zone-seven", "irongate"]);
    expect(getWorldRoutes([]).flatMap((route) => [route.from, route.to])).not.toContain(cheyenne.id);
  });

  it("uses staged intelligence clearance and separate civilian and military offices", () => {
    expect(getEffectiveContinuanceDiscoveryStage(DEFAULT_CONTINUANCE_OPERATIONAL, [], 0)).toBe(0);
    expect(getEffectiveContinuanceDiscoveryStage(DEFAULT_CONTINUANCE_OPERATIONAL, ["cheyenne-mountain"], 0)).toBe(1);
    expect(getEffectiveContinuanceDiscoveryStage(DEFAULT_CONTINUANCE_OPERATIONAL, ["cheyenne-mountain"], 65)).toBe(2);
    expect(getEffectiveContinuanceDiscoveryStage(DEFAULT_CONTINUANCE_OPERATIONAL, ["cheyenne-mountain"], 80)).toBe(3);
    expect(getEffectiveContinuanceDiscoveryStage(DEFAULT_CONTINUANCE_OPERATIONAL, ["cheyenne-mountain"], 95)).toBe(4);
    expect(DEFAULT_CONTINUANCE_OPERATIONAL.militaryCommander.role).not.toBe(DEFAULT_CONTINUANCE_OPERATIONAL.civilianPresident.role);
    expect(DEFAULT_CONTINUANCE_OPERATIONAL.militaryCommander.name).not.toBe(DEFAULT_CONTINUANCE_OPERATIONAL.civilianPresident.name);
  });

  it("renders only the clearance-appropriate Continuance report sections", () => {
    expect(worldMapScreenSource).toContain("CONTINUANCE INTELLIGENCE REPORT");
    expect(worldMapScreenSource).toContain("continuanceStage === 1");
    expect(worldMapScreenSource).toContain("continuanceStage === 2");
    expect(worldMapScreenSource).toContain("continuanceStage === 3");
    expect(worldMapScreenSource).toContain("continuanceStage === 4");
    expect(worldMapScreenSource).toContain("MILITARY OFFICE:");
    expect(worldMapScreenSource).toContain("CIVILIAN OFFICE:");
    expect(worldMapScreenSource).toContain("selectedLocation.id !== CONTINUANCE_ID");
    expect(worldMapScreenSource).toContain("isContinuanceMapInteractionLocked(loc.id)");
    expect(worldMapScreenSource).toContain("Only the intelligence report is available.");
  });

  it("Grand Canyon exists as a discovered notable marker", () => {
    const gc = WORLD_LOCATIONS.find((l) => l.id === "grand-canyon");
    expect(gc).toBeDefined();
    expect(gc!.type).toBe("notable");
    expect(gc!.discovered).toBe(true);
    expect(gc!.population).toBe(0);
  });
});

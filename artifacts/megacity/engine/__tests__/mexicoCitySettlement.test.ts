import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { EVENT_POOL } from "@/engine/events";
import { WORLD_LOCATIONS, getWorldRoutes } from "@/engine/worldMap";

describe("Mexico City settlement compatibility", () => {
  it("uses Mexico City presentation while retaining the dusthaven save ID", () => {
    const state = createInitialState();
    const settlement = state.townships?.find((township) => township.id === "dusthaven");

    expect(settlement).toMatchObject({
      id: "dusthaven",
      name: "Mexico City",
      population: 9209944,
      specialization: "Government, manufacturing, services, and regional transit",
      leader: {
        name: "Mexico City Civil Protection Directorate",
        title: "Municipal Operations Directorate",
      },
    });
  });

  it("normalizes an old Dusthaven save without dropping relationship state", () => {
    const legacy = createInitialState();
    legacy.townships = legacy.townships?.map((township) =>
      township.id === "dusthaven"
        ? {
            ...township,
            name: "Dusthaven",
            description: "A scrappy frontier settlement.",
            population: 3000,
            leader: {
              name: "Elder Ria Dustwalker",
              portraitId: "ria_dustwalker",
              title: "Settlement Elder",
              attitude: "friendly",
              goals: ["Secure water supply"],
              personalityTraits: ["resilient"],
            },
            loyalty: 73,
          }
        : township,
    );

    const migrated = migrateState(legacy);
    const settlement = migrated.townships?.find((township) => township.id === "dusthaven");

    expect(settlement).toMatchObject({
      id: "dusthaven",
      name: "Mexico City",
      population: 9209944,
      loyalty: 73,
      leader: {
        name: "Mexico City Civil Protection Directorate",
      },
    });
  });

  it("keeps discovery and route relationships on the compatibility ID", () => {
    const cityCore = WORLD_LOCATIONS.find((location) => location.id === "megacity");
    const routes = getWorldRoutes(["dusthaven"]);

    expect(cityCore?.connectedTo).toContain("dusthaven");
    expect(cityCore?.discovered).toBe(true);
    expect(routes.some((route) => route.from === "megacity" && route.to === "dusthaven")).toBe(true);
  });

  it("does not leave the retired fictional settlement identity in the live event surface", () => {
    const event = EVENT_POOL.find((candidate) => candidate.id === "township_dusthaven_water_crisis");

    expect(event).toMatchObject({
      title: "MEXICO CITY — WATER SYSTEMS CRISIS",
    });
    expect(JSON.stringify(event)).not.toContain("Dusthaven");
    expect(JSON.stringify(event)).not.toContain("Dustwalker");
  });
});
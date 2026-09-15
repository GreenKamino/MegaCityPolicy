import { describe, expect, it } from "vitest";
import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { LA_CITY_ID, LA_CITY_OPERATIONAL } from "@/engine/settlementData";
import { WORLD_LOCATIONS } from "@/engine/worldMap";

describe("LA CITY replacement", () => {
  it("publishes the canonical LA CITY operational sheet on the durable location id", () => {
    const city = createInitialState().externalMegacities.find((candidate) => candidate.id === LA_CITY_ID);
    const location = WORLD_LOCATIONS.find((candidate) => candidate.id === LA_CITY_ID);

    expect(city).toMatchObject({
      id: LA_CITY_ID,
      name: "LA CITY",
      factionType: "megacity",
      population: 3898747,
      influence: 75,
      loyalty: 10,
      threat: 85,
      operational: LA_CITY_OPERATIONAL,
    });
    expect(city?.leader).toBeUndefined();
    expect(city?.voiceLines).toBeUndefined();
    expect(city?.operational?.infrastructure.civilian).toBe(49);
    expect(city?.operational?.stability.label).toContain("seismic recovery");
    expect(location).toMatchObject({
      id: LA_CITY_ID,
      name: "LA CITY",
      type: "megacity",
      population: LA_CITY_OPERATIONAL.population,
      defenseRating: 58,
      status: "hostile",
      connectedTo: ["nova-pacifica", "the-dock-of-ghosts", "rn-saltworks-pans"],
      operational: LA_CITY_OPERATIONAL,
    });
  });

  it("replaces legacy presentation while retaining mutable LA CITY save state", () => {
    const legacy = structuredClone(createInitialState());
    const city = legacy.externalMegacities.find((candidate) => candidate.id === LA_CITY_ID)!;
    Object.assign(city, {
      name: "The Iron Khanate",
      description: "legacy presentation",
      influence: 81,
      loyalty: 17,
      threat: 93,
      isActive: true,
      tradeInventory: { steel_plates: 987, fuel_cells: 4 },
      lastRefreshTick: 321,
      controlStatus: "occupied",
      dominantFaithId: "ancestor-cult",
      leader: { name: "Khan Torgrim", title: "Khan", attitude: "hostile", goals: [], personalityTraits: [], portraitId: "khan_torgrim" },
    });

    const migrated = migrateState(legacy);
    const restored = migrated.externalMegacities.find((candidate) => candidate.id === LA_CITY_ID)!;

    expect(restored.name).toBe("LA CITY");
    expect(restored.description).toContain("seismic recovery");
    expect(restored.leader).toBeUndefined();
    expect(restored.influence).toBe(81);
    expect(restored.loyalty).toBe(17);
    expect(restored.threat).toBe(93);
    expect(restored.isActive).toBe(true);
    expect(restored.tradeInventory).toEqual({ steel_plates: 987, fuel_cells: 4 });
    expect(restored.lastRefreshTick).toBe(321);
    expect(restored.controlStatus).toBe("occupied");
    expect(restored.dominantFaithId).toBe("ancestor-cult");
    expect(restored.operational).toMatchObject(LA_CITY_OPERATIONAL);
    expect(restored.operational!.infrastructureScore).toEqual(
      LA_CITY_OPERATIONAL.infrastructureScore,
    );
  });
});
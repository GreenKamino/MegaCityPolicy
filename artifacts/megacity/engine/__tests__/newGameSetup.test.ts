import { describe, expect, it } from "vitest";

import { createDefaultProfile } from "@/engine/profiles";
import { buildConfiguredNewGame, type NewCitySetup } from "@/engine/newGameSetup";
import { getPlayerFaction } from "@/engine/playerFaction";
import { STARTING_REGIONS } from "@/engine/worldMap";
import {
  createMegacityRoster,
  RESERVED_MEGACITY_IDS,
} from "@/engine/settlementRoster";

function setup(overrides: Partial<NewCitySetup> = {}): NewCitySetup {
  return {
    slot: 3,
    cityName: "Iron Horizon",
    difficulty: "hard",
    startStyle: "veteran",
    gameplayMode: "turnbased",
    commanderOrigin: "field_veteran",
    backgroundFaction: "military",
    region: STARTING_REGIONS[0],
    factionIdentity: {
      name: "THE RED WATCH",
      motto: "Hold until dawn.",
      primaryColor: "#FF3B30",
      secondaryColor: "#5C0F0F",
      glyph: "megacity",
    },
    ...overrides,
  };
}

describe("unified commander and city setup", () => {
  it("composes commander, city, origin, faction, region, mode, identity, and Veteran routing state once", () => {
    const profile = createDefaultProfile("Commander Vale", 42, "other", "player_other_1");
    profile.backstory = "A test backstory that must reach the save.";
    profile.attributes = { authority: 4, intelligence: 7, charisma: 5, combat: 6, endurance: 8 };
    profile.attributePoints = 2;
    profile.traits = ["Iron Will", "Wasteland Scout"];

    const s = buildConfiguredNewGame(profile, setup());
    const identity = getPlayerFaction(s);

    expect(s.saveSlot).toBe(3);
    expect(s.cityName).toBe("Iron Horizon");
    expect(s.player.name).toBe("Commander Vale");
    expect(s.player.backstory).toBe(profile.backstory);
    expect(s.player.portraitId).toBe("player_other_1");
    expect(s.player.traits).toEqual(expect.arrayContaining(["Iron Will", "Wasteland Scout", "Military Veteran"]));
    expect(s.commanderOrigin).toBe("field_veteran");
    expect(s.playerTitle).toBe("War Commander");
    expect(s.startingRegion).toBe(STARTING_REGIONS[0].id);
    expect(s.playerCityPosition).toEqual({
      x: STARTING_REGIONS[0].playerX,
      y: STARTING_REGIONS[0].playerY,
    });
    expect(s.discoveredLocationIds).toEqual(STARTING_REGIONS[0].initialDiscovered);
    expect(s.gameplayMode).toBe("turnbased");
    expect(s.difficulty).toBe("hard");
    expect(s.hasCompletedOnboarding).toBe(true);
    expect(s.starterObjectivesActive).toBe(false);
    expect(s.hudCoachTipsActive).toBe(false);
    expect(s.calmStartTicks).toBe(0);
    expect(identity).toEqual({
      key: "military",
      name: "THE RED WATCH",
      motto: "Hold until dawn.",
      primaryColor: "#FF3B30",
      secondaryColor: "#5C0F0F",
      glyph: "megacity",
    });
    expect(s.messages.find((message) => message.id === "msg-welcome")?.body).toContain("Iron Horizon");
    expect(s.messages.find((message) => message.id === "msg-welcome")?.body).toContain("FIELD VETERAN");
  });

  it("keeps Guided defaults and uses the established fallback city name", () => {
    const profile = createDefaultProfile("Commander North", 35, "female", "player_female_1");
    const s = buildConfiguredNewGame(
      profile,
      setup({
        cityName: "   ",
        startStyle: "guided",
        gameplayMode: "realtime",
        commanderOrigin: "none",
        backgroundFaction: "law_enforcement",
      }),
    );

    expect(s.cityName).toBe("MEGACITY JUAN");
    expect(s.gameplayMode).toBe("realtime");
    expect(s.hasCompletedOnboarding).toBe(false);
    expect(s.starterObjectivesActive).toBe(true);
    expect(s.hudCoachTipsActive).toBe(true);
  });

  it("persists roster renames without changing stable IDs or non-name state", () => {
    const profile = createDefaultProfile("Roster Tester", 35, "other", "player_other_roster");
    const roster = createMegacityRoster(1234);
    const renamed = roster.entries.map((entry) =>
      entry.id === "iron-khanate" ? { ...entry, displayName: "PACIFIC ADMINISTRATION" } : entry,
    );
    const s = buildConfiguredNewGame(profile, setup({ megacityRoster: { ...roster, entries: renamed } }));
    const city = s.externalMegacities.find((candidate) => candidate.id === "iron-khanate");
    expect(city?.name).toBe("PACIFIC ADMINISTRATION");
    expect(s.megacityRoster?.entries.map((entry) => entry.id)).toEqual(roster.entries.map((entry) => entry.id));
    expect(city?.population).toBeGreaterThan(0);
    expect(city?.tradeInventory).toBeDefined();
  });

  it("falls back to a deterministic ten-entry roster when setup metadata is omitted", () => {
    const profile = createDefaultProfile("Roster Fallback", 35, "other", "player_other_fallback");
    const first = buildConfiguredNewGame(profile, setup());
    const second = buildConfiguredNewGame(profile, setup());
    expect(first.megacityRoster?.entries).toEqual(second.megacityRoster?.entries);
    expect(first.megacityRoster?.entries).toHaveLength(10);
    expect(RESERVED_MEGACITY_IDS.every((id) => first.megacityRoster?.entries.some((entry) => entry.id === id))).toBe(true);
  });
});
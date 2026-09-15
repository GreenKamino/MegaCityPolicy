import { applyCommanderOrigin, getCommanderOrigin, type CommanderOriginId } from "./commanderOrigins";
import { buildWelcomeBody, createInitialState } from "./initialState";
import {
  presetForKey,
  setPlayerFaction,
  type PlayerFactionGlyph,
  type PlayerFactionKey,
} from "./playerFaction";
import { injectProfileIntoGameState } from "./profiles";
import { applyStartStyle, type StartStyle } from "./startStyle";
import type { GameState, GameplayMode, PlayerProfile } from "./types";
import { applyStartingBonus, type StartingRegion } from "./worldMap";
import {
  applyMegacityRosterNames,
  createMegacityRoster,
  normalizeMegacityRoster,
  rosterSeedFromString,
  type MegacityRosterMetadata,
} from "./settlementRoster";

export type NewGameDifficulty = "easy" | "medium" | "hard";

export type NewCommanderSetup = {
  name: string;
  age: number;
  sex: "male" | "female" | "other";
  portraitId: string;
  customPortraitUri?: string;
  backstory: string;
  attributes: PlayerProfile["attributes"];
  attributePoints: number;
  traits: string[];
};

export type NewCitySetup = {
  slot: number;
  cityName: string;
  difficulty: NewGameDifficulty;
  startStyle: StartStyle;
  gameplayMode: GameplayMode;
  commanderOrigin: CommanderOriginId;
  backgroundFaction: PlayerFactionKey;
  region: StartingRegion;
  factionIdentity: {
    name: string;
    motto: string;
    primaryColor: string;
    secondaryColor: string;
    glyph: PlayerFactionGlyph;
  };
  megacityRoster?: MegacityRosterMetadata;
};

const FACTION_TITLES: Record<PlayerFactionKey, string> = {
  law_enforcement: "Justice Commander",
  military: "War Commander",
  corporate: "Executive Director",
  intelligence: "Shadow Director",
  underground: "People's Marshal",
};

export function buildConfiguredNewGame(profile: PlayerProfile, setup: NewCitySetup): GameState {
  const chosenCityName = setup.cityName.trim() || "MEGACITY JUAN";
  const originDefinition = getCommanderOrigin(setup.commanderOrigin);
  const megacityRoster = normalizeMegacityRoster(
    setup.megacityRoster ?? createMegacityRoster(
      rosterSeedFromString(`${profile.id}:${setup.slot}:${chosenCityName}`),
    ),
  );
  const base = injectProfileIntoGameState(profile, {
    ...createInitialState(),
    saveSlot: setup.slot,
  });
  const s: GameState = {
    ...base,
    cityName: chosenCityName,
    messages: base.messages.map((message) =>
      message.id === "msg-welcome"
        ? {
            ...message,
            body: buildWelcomeBody(
              chosenCityName,
              setup.commanderOrigin === "none" ? undefined : originDefinition.name,
            ),
          }
        : message,
    ),
    playerTitle: FACTION_TITLES[setup.backgroundFaction],
    resources: { ...base.resources },
    cityStats: { ...base.cityStats },
    startingRegion: setup.region.id,
    playerCityPosition: { x: setup.region.playerX, y: setup.region.playerY },
    discoveredLocationIds: [...setup.region.initialDiscovered],
    difficulty: setup.difficulty,
    gameplayMode: setup.gameplayMode,
    megacityRoster,
  };
  s.externalMegacities = applyMegacityRosterNames(s.externalMegacities, megacityRoster);

  if (setup.backgroundFaction === "law_enforcement") {
    s.cityStats.lawOrder = Math.min(100, s.cityStats.lawOrder + 2);
    s.player.attributes.authority = Math.min(10, s.player.attributes.authority + 1);
  } else if (setup.backgroundFaction === "military") {
    s.cityStats.defenseRating = Math.min(100, s.cityStats.defenseRating + 2);
    s.player.attributes.combat = Math.min(10, s.player.attributes.combat + 1);
    s.resources.ammo += 50;
  } else if (setup.backgroundFaction === "corporate") {
    s.resources.credits += 10_000;
    s.player.attributes.charisma = Math.min(10, s.player.attributes.charisma + 1);
  } else if (setup.backgroundFaction === "intelligence") {
    s.player.attributes.intelligence = Math.min(10, s.player.attributes.intelligence + 1);
  } else {
    s.cityStats.unrest = Math.max(0, s.cityStats.unrest - 5);
    s.cityStats.happiness = Math.min(100, s.cityStats.happiness + 2);
    s.player.attributes.endurance = Math.min(10, s.player.attributes.endurance + 1);
  }

  applyStartingBonus(s, setup.region);
  const withOrigin = applyCommanderOrigin(s, setup.commanderOrigin);
  const preset = presetForKey(setup.backgroundFaction);
  const withIdentity = setPlayerFaction(withOrigin, {
    key: setup.backgroundFaction,
    name: setup.factionIdentity.name,
    motto: setup.factionIdentity.motto,
    primaryColor: setup.factionIdentity.primaryColor || preset.primaryColor,
    secondaryColor: setup.factionIdentity.secondaryColor || preset.secondaryColor,
    glyph: setup.factionIdentity.glyph,
  });
  return applyStartStyle(withIdentity, setup.startStyle);
}
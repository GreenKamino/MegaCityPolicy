import { useMemo } from "react";

import type {
  CombatZone,
  Faction,
  GameState,
  NamedCharacter,
  Officer,
} from "@/engine/types";

export type GameLookups = {
  factionById: ReadonlyMap<string, Faction>;
  zoneById: ReadonlyMap<string, CombatZone>;
  officerById: ReadonlyMap<string, Officer>;
  namedCharacterById: ReadonlyMap<string, NamedCharacter>;
};

// Exported for unit testing. Building Maps with a for-loop is meaningfully faster
// than `new Map(arr.map(...))` because it avoids the intermediate tuple array.
export function indexById<T extends { id: string }>(arr: ReadonlyArray<T> | undefined): ReadonlyMap<string, T> {
  if (!arr || arr.length === 0) return new Map<string, T>();
  const m = new Map<string, T>();
  for (const item of arr) m.set(item.id, item);
  return m;
}

export function useGameLookups(state: GameState | null | undefined): GameLookups {
  const factions = state?.factions;
  const zones = state?.combat?.zones;
  const officers = state?.officers;
  const namedCharacters = state?.namedCharacters;

  const factionById = useMemo(() => indexById(factions), [factions]);
  const zoneById = useMemo(() => indexById(zones), [zones]);
  const officerById = useMemo(() => indexById(officers), [officers]);
  const namedCharacterById = useMemo(() => indexById(namedCharacters), [namedCharacters]);

  return useMemo(
    () => ({ factionById, zoneById, officerById, namedCharacterById }),
    [factionById, zoneById, officerById, namedCharacterById],
  );
}


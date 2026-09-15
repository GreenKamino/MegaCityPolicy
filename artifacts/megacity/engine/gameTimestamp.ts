import type { GameDate, GameState } from "./types";

const FALLBACK_GAME_DATE: GameDate = { year: 2050, month: 1, day: 1, hour: 0 };

export function gameTimestamp(state: GameState | undefined | null): GameDate {
  const d = state?.gameDate;
  return d ? { ...d } : { ...FALLBACK_GAME_DATE };
}

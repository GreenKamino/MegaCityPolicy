import type { Faction, GameEvent, GameState } from "./types";

export type EventFlavorContext = Record<string, never>;

/** @deprecated Dynamic event context is retired; retained for save/test API compatibility. */
export function buildEventContext(_state: GameState): EventFlavorContext {
  return {};
}

/**
 * Compatibility shim for old callers and archived imports. Event cards now
 * use authored operational copy verbatim; NPC/faction substitution was
 * retired so a save can never produce a new prose variant at render time.
 */
export function applyEventFlavor<T extends GameEvent>(
  event: T,
  _state?: GameState,
): T {
  return event;
}

// Kept as a no-op compatibility export for archived consumers. Faction
// identity is not rendered on operational event cards.
export const FACTION_TYPE_COLORS: Record<Faction["type"], string> = {
  law: "#4a8fe7",
  criminal: "#c44545",
  corporate: "#d99a2a",
  underclass: "#9b6bd1",
  cult: "#7e3ab8",
  institutional: "#4fd1c4",
};

export function lookupFactionStamp(
  state: GameState,
  factionId: string | undefined,
): { name: string; color: string } | null {
  void state;
  void factionId;
  return null;
}

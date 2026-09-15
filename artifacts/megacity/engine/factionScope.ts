import type { Faction } from "@/engine/types";

/**
 * Internal factions are city institutions and movements that operate inside
 * the player's city. Their operational panels should not be mixed into the
 * external-affairs card list, even when their legacy diplomatic `type` is
 * something like "underclass".
 */
export function isInternalFaction(faction: Pick<Faction, "scope" | "type">): boolean {
  return faction.scope === "internal" || faction.type === "institutional";
}
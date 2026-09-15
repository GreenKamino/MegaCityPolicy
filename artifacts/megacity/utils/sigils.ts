import { ImageSourcePropType } from "react-native";

// Megacity banner sigils, sliced from the supplied emblem sheet. Keyed by
// the shared partner/world-map id (externalMegacities ids and worldMap.ts
// location ids use the same values). "megacity" is the player's own city.
// Metro needs static require() calls, so this map mirrors utils/portraits.ts.
const SIGIL_MAP: Record<string, ImageSourcePropType> = {
  megacity: require("@/assets/sigils/megacity.webp"),
  "nova-pacifica": require("@/assets/sigils/nova_pacifica.webp"),
  "helix-commune": require("@/assets/sigils/helix_commune.webp"),
  "aureus-dominion": require("@/assets/sigils/aureus_dominion.webp"),
  "ghost-meridian": require("@/assets/sigils/ghost_meridian.webp"),
  "crimson-reach": require("@/assets/sigils/crimson_reach.webp"),
  "terminus-prime": require("@/assets/sigils/terminus_prime.webp"),
  "new-olympus": require("@/assets/sigils/new_olympus.webp"),
  panopticon: require("@/assets/sigils/panopticon.webp"),
  "ashfall-dominion": require("@/assets/sigils/ashfall_dominion.webp"),
  "the-recursion": require("@/assets/sigils/the_recursion.webp"),
};

/** Banner sigil for a megacity id, or null when no sigil art exists
 *  (e.g. Mega-Habana, nations, settlements — callers keep their icon
 *  fallback for those). */
export function getMegacitySigil(id?: string): ImageSourcePropType | null {
  if (id && SIGIL_MAP[id]) return SIGIL_MAP[id];
  return null;
}

/** Every id that has sigil art, for drift tests. */
export const SIGIL_IDS: readonly string[] = Object.keys(SIGIL_MAP);

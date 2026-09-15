import { ImageSourcePropType } from "react-native";

import { isCustomPortraitId, resolveCustomPortrait } from "./customPortraits";

const PORTRAIT_MAP: Record<string, ImageSourcePropType> = {
  draven_korr: require("@/assets/portraits/draven_korr.webp"),
  razor_vex: require("@/assets/portraits/razor_vex.webp"),
  victoria_ashford_crane: require("@/assets/portraits/victoria_ashford_crane.webp"),
  mother_scoria: require("@/assets/portraits/mother_scoria.webp"),
  solara_venn: require("@/assets/portraits/solara_venn.webp"),
  kael_drift: require("@/assets/portraits/kael_drift.webp"),
  lyssa_helix: require("@/assets/portraits/lyssa_helix.webp"),
  rivet_caine: require("@/assets/portraits/rivet_caine.webp"),
  mako_steele: require("@/assets/portraits/mako_steele.webp"),

  mira_solenne: require("@/assets/portraits/mira_solenne.webp"),
  lyra_7: require("@/assets/portraits/lyra_7.webp"),
  cassius_vex_aurelius: require("@/assets/portraits/cassius_vex_aurelius.webp"),
  thalia_greenmantle: require("@/assets/portraits/thalia_greenmantle.webp"),
  jak_cinder: require("@/assets/portraits/jak_cinder.webp"),
  krell: require("@/assets/portraits/krell.webp"),
  admiral_kessler: require("@/assets/portraits/admiral_kessler.webp"),

  brock_hammerjaw: require("@/assets/portraits/brock_hammerjaw.webp"),
  chem_voss: require("@/assets/portraits/chem_voss.webp"),
  verdana_sol: require("@/assets/portraits/verdana_sol.webp"),
  scrap_king_renzo: require("@/assets/portraits/scrap_king_renzo.webp"),
  ash_volkov: require("@/assets/portraits/ash_volkov.webp"),
  silas_wayward: require("@/assets/portraits/silas_wayward.webp"),
  grol_the_changed: require("@/assets/portraits/grol_the_changed.webp"),
  delia_crypt: require("@/assets/portraits/delia_crypt.webp"),
  ignis_thorne: require("@/assets/portraits/ignis_thorne.webp"),
  the_listener: require("@/assets/portraits/the_listener.webp"),
  juno_aer: require("@/assets/portraits/juno_aer.webp"),
  dara_kline: require("@/assets/portraits/dara_kline.webp"),
  coral_wren: require("@/assets/portraits/coral_wren.webp"),
  nyx_pale: require("@/assets/portraits/nyx_pale.webp"),

  el_caiman_quintero: require("@/assets/portraits/el_caiman_quintero.webp"),

  // -- Player commander portraits. Selectable from the New Commander
  // creation flow and re-selectable from the Character screen. The
  // portrait id rides along on PlayerCharacter.portraitId, so getPortrait()
  // resolves player faces the same way it resolves NPC leader faces.
  // Any key prefixed with "player_" is treated as a reachable player
  // portrait by the portrait test (it does not need a leader-name map
  // entry to escape the orphan check).
  player_male_1: require("@/assets/portraits/player_male_1.webp"),
  player_male_2: require("@/assets/portraits/player_male_2.webp"),
  player_male_3: require("@/assets/portraits/player_male_3.webp"),
  player_female_1: require("@/assets/portraits/player_female_1.webp"),
  player_female_2: require("@/assets/portraits/player_female_2.webp"),
  player_female_3: require("@/assets/portraits/player_female_3.webp"),
  player_other_1: require("@/assets/portraits/player_other_1.webp"),
  player_other_2: require("@/assets/portraits/player_other_2.webp"),

  // -- Curated commander portrait gallery (sliced from the supplied portrait
  // sheets). Available to any commander regardless of sex.
  player_face_01: require("@/assets/portraits/player_face_01.webp"),
  player_face_02: require("@/assets/portraits/player_face_02.webp"),
  player_face_03: require("@/assets/portraits/player_face_03.webp"),
  player_face_04: require("@/assets/portraits/player_face_04.webp"),
  player_face_05: require("@/assets/portraits/player_face_05.webp"),
  player_face_06: require("@/assets/portraits/player_face_06.webp"),
  player_face_07: require("@/assets/portraits/player_face_07.webp"),
  player_face_08: require("@/assets/portraits/player_face_08.webp"),
  player_face_09: require("@/assets/portraits/player_face_09.webp"),
  player_face_10: require("@/assets/portraits/player_face_10.webp"),
  player_face_11: require("@/assets/portraits/player_face_11.webp"),
  player_face_12: require("@/assets/portraits/player_face_12.webp"),
  player_face_13: require("@/assets/portraits/player_face_13.webp"),
  player_face_14: require("@/assets/portraits/player_face_14.webp"),
  player_face_15: require("@/assets/portraits/player_face_15.webp"),
  player_face_16: require("@/assets/portraits/player_face_16.webp"),
  player_face_17: require("@/assets/portraits/player_face_17.webp"),
  player_face_18: require("@/assets/portraits/player_face_18.webp"),
  player_face_19: require("@/assets/portraits/player_face_19.webp"),
  player_face_20: require("@/assets/portraits/player_face_20.webp"),
  player_face_21: require("@/assets/portraits/player_face_21.webp"),
  player_face_22: require("@/assets/portraits/player_face_22.webp"),
  player_face_23: require("@/assets/portraits/player_face_23.webp"),
  player_face_24: require("@/assets/portraits/player_face_24.webp"),
};

/**
 * Every player-selectable commander portrait, as a single flat gallery. The
 * new-game creation picker and the Character-screen change-later picker both
 * render this whole set as a scrollable thumbnail grid — portraits are
 * available to any commander regardless of sex.
 *
 * Keep every id here in 1:1 sync with a "player_"-prefixed PORTRAIT_MAP entry
 * above; the portrait test cross-checks the registry against the .webp files
 * on disk.
 */
export const PLAYER_PORTRAIT_GALLERY: readonly string[] = [
  "player_male_1", "player_male_2", "player_male_3",
  "player_female_1", "player_female_2", "player_female_3",
  "player_other_1", "player_other_2",
  "player_face_01", "player_face_02", "player_face_03", "player_face_04",
  "player_face_05", "player_face_06", "player_face_07", "player_face_08",
  "player_face_09", "player_face_10", "player_face_11", "player_face_12",
  "player_face_13", "player_face_14", "player_face_15", "player_face_16",
  "player_face_17", "player_face_18", "player_face_19", "player_face_20",
  "player_face_21", "player_face_22", "player_face_23", "player_face_24",
];

/** Flat set of every player portrait id. Cheap membership check used by
 *  the portrait drift test. */
export const PLAYER_PORTRAIT_IDS: ReadonlySet<string> = new Set(PLAYER_PORTRAIT_GALLERY);

/** Default portrait for a freshly-created commander (sex-agnostic). */
export function getDefaultPlayerPortraitId(): string {
  return PLAYER_PORTRAIT_GALLERY[0];
}

const NAME_TO_PORTRAIT: Record<string, string> = {
  "Grand Marshal Draven Korr": "draven_korr",
  "Razor Vex": "razor_vex",
  "Victoria Ashford-Crane": "victoria_ashford_crane",
  "Mother Scoria": "mother_scoria",
  "Archpriest Solara Venn": "solara_venn",
  "Guildmaster Kael Drift": "kael_drift",
  "Dr. Lyssa Helix": "lyssa_helix",
  "Chief Warden Mako Steele": "mako_steele",
  "Chancellor Mira Solenne": "mira_solenne",
  "Consensus Node Lyra-7": "lyra_7",
  "Archon Cassius Vex-Aurelius": "cassius_vex_aurelius",
  "High Druid Thalia Greenmantle": "thalia_greenmantle",
  "Warden Jak Cinder": "jak_cinder",
  "Forge-Master Krell": "krell",
  "Warlord-Admiral Kessler": "admiral_kessler",
  "Foreman Brock Hammerjaw": "brock_hammerjaw",
  "Baroness Chem Voss": "chem_voss",
  "Sister Verdana Sol": "verdana_sol",
  "Scrap King Renzo": "scrap_king_renzo",
  "Commander Ash Volkov": "ash_volkov",
  "Keeper Silas Wayward": "silas_wayward",
  "Chieftain Grol the Changed": "grol_the_changed",
  "Overseer Delia Crypt": "delia_crypt",
  "Magister Ignis Thorne": "ignis_thorne",
  "The Listener": "the_listener",
  "Windkeeper Juno Aer": "juno_aer",
  "Forge Marshal Dara Kline": "dara_kline",
  "Admiral Coral Wren": "coral_wren",
  "Archivist Nyx Pale": "nyx_pale",
  "Judge-Cardinal Rafael 'El Caimán' Quintero-Vargas": "el_caiman_quintero",
};

export function getPortrait(portraitId?: string, leaderName?: string): ImageSourcePropType | null {
  if (portraitId && isCustomPortraitId(portraitId)) {
    const uri = resolveCustomPortrait(portraitId);
    if (uri) return { uri };
    // Unresolved custom id (registry not hydrated yet, or the owning
    // profile was deleted): fall back to the default player portrait so a
    // commander never renders with an empty frame.
    return PORTRAIT_MAP[getDefaultPlayerPortraitId()] ?? null;
  }
  if (portraitId && PORTRAIT_MAP[portraitId]) return PORTRAIT_MAP[portraitId];
  if (leaderName) {
    const mapped = NAME_TO_PORTRAIT[leaderName];
    if (mapped && PORTRAIT_MAP[mapped]) return PORTRAIT_MAP[mapped];
  }
  return null;
}

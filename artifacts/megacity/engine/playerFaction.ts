// Player faction identity (Pack A — Faction customization).
//
// Lets the player customize the visible identity of their faction:
// display name, motto, primary + secondary color, and banner glyph.
//
// All persisted fields live under `state.playerFaction` as an OPTIONAL
// object. Old saves with no playerFaction read fine — `getPlayerFaction`
// derives sensible defaults from the existing playerTitle / cityName so
// every surface that pulls identity always gets a complete record.
//
// Strictly cosmetic: no combat math, no spawn rules, no loyalty hooks.

import type { GameState } from "./types";

export type PlayerFactionKey =
  | "law_enforcement"
  | "military"
  | "corporate"
  | "intelligence"
  | "underground";

export type PlayerFactionGlyph =
  | "megacity"
  | "judges"
  | "gangs"
  | "corps"
  | "mutants"
  | "corrupt"
  | "iron-circuit"
  | "deep-root-collective"
  | "eternal-flame"
  | "free-traders";

/** Persisted player-faction identity. All fields are user-editable. */
export interface PlayerFactionIdentity {
  key: PlayerFactionKey;
  name: string;
  motto: string;
  primaryColor: string;
  secondaryColor: string;
  glyph: PlayerFactionGlyph;
}

/** Hex palette the customization UI offers. Eight muted cyberpunk tones
 *  drawn from the existing app theme so picks stay on-brand. */
export const PLAYER_FACTION_PALETTE: { id: string; hex: string; label: string }[] = [
  { id: "neon-lime",   hex: "#00FF41", label: "Neon Lime" },
  { id: "ice-cyan",    hex: "#00C8FF", label: "Ice Cyan" },
  { id: "blood-red",   hex: "#FF3B30", label: "Blood Red" },
  { id: "amber-burn",  hex: "#FF9500", label: "Amber Burn" },
  { id: "vapor-rose",  hex: "#FF4F8B", label: "Vapor Rose" },
  { id: "void-violet", hex: "#B855FF", label: "Void Violet" },
  { id: "rust-gold",   hex: "#D4A017", label: "Rust Gold" },
  { id: "ash-grey",    hex: "#8A8F98", label: "Ash Grey" },
  { id: "toxic-jade",  hex: "#3DDC84", label: "Toxic Jade" },
  { id: "cobalt-deep", hex: "#3F6DFF", label: "Cobalt Deep" },
  { id: "ember-coal",  hex: "#FF6A3D", label: "Ember Coal" },
  { id: "bone-ivory",  hex: "#E6DDC4", label: "Bone Ivory" },
  { id: "rad-yellow",  hex: "#F5E14A", label: "Rad Yellow" },
  { id: "wine-rust",   hex: "#8B2E3C", label: "Wine Rust" },
];

/** Dark banner-background palette for the secondary color pickers. Kept
 *  deliberately darker than PLAYER_FACTION_PALETTE so any primary color
 *  stays readable on top of it. Includes every faction preset secondary
 *  so a preset pick always appears selected in the swatch row. */
export const PLAYER_FACTION_BG_PALETTE: { id: string; hex: string; label: string }[] = [
  { id: "abyss-navy",   hex: "#0F3D5C", label: "Abyss Navy" },
  { id: "oxblood",      hex: "#5C0F0F", label: "Oxblood" },
  { id: "scorch-umber", hex: "#5C3A0F", label: "Scorch Umber" },
  { id: "murk-violet",  hex: "#3A0F5C", label: "Murk Violet" },
  { id: "pit-green",    hex: "#0F5C2E", label: "Pit Green" },
  { id: "vault-black",  hex: "#101418", label: "Vault Black" },
  { id: "gunmetal",     hex: "#2A313A", label: "Gunmetal" },
  { id: "night-teal",   hex: "#0F4C4C", label: "Night Teal" },
  { id: "dust-maroon",  hex: "#4A1F2E", label: "Dust Maroon" },
  { id: "bunker-olive", hex: "#3B3F1E", label: "Bunker Olive" },
];

/** Generic, faction-agnostic motto pool used by the "🎲 ROLL" buttons
 *  next to the motto inputs in both the new-game flow and the in-game
 *  banner editor. Kept short, punchy, and tonally consistent with the
 *  game's grim-cyberpunk vibe so any random pick reads as plausible. */
export const PLAYER_FACTION_MOTTO_POOL: string[] = [
  "Order Above All.",
  "We Burn Brighter.",
  "Steel & Resolve.",
  "Hold the Line.",
  "Justice Is Iron.",
  "By Any Means.",
  "The City Endures.",
  "Strength Through Unity.",
  "From the Ashes.",
  "Blood Pays Blood.",
  "We Do Not Yield.",
  "Light the Dark.",
  "One Banner. One Will.",
  "Until the Last.",
  "The Wheel Turns.",
  "No Step Back.",
  "Through Fire.",
  "What We Defend, We Become.",
];

/** Returns a random motto from the pool, optionally avoiding the
 *  current value so a roll always produces a visible change. Falls
 *  back to the first pool entry if `avoid` matches every entry. */
export function rollPlayerFactionMotto(avoid?: string): string {
  const pool = avoid ? PLAYER_FACTION_MOTTO_POOL.filter((m) => m !== avoid) : PLAYER_FACTION_MOTTO_POOL;
  if (pool.length === 0) return PLAYER_FACTION_MOTTO_POOL[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Banner-glyph options. Reuses the existing Insignia component IDs so
 *  no new SVG art is needed. */
export const PLAYER_FACTION_GLYPHS: { id: PlayerFactionGlyph; label: string }[] = [
  { id: "megacity",              label: "Sector Crown" },
  { id: "judges",                label: "Judge's Baton" },
  { id: "gangs",                 label: "Syndicate Diamond" },
  { id: "corps",                 label: "Corp Cube" },
  { id: "mutants",               label: "Mutant Bloom" },
  { id: "corrupt",               label: "Patronage Spire" },
  { id: "iron-circuit",          label: "Iron Circuit" },
  { id: "deep-root-collective",  label: "Deep Root" },
  { id: "eternal-flame",         label: "Eternal Flame" },
  { id: "free-traders",          label: "Free Traders" },
];

/** Per-faction default identity. Picked when the player chooses a key
 *  during character creation but hasn't customized anything yet. */
export const FACTION_PRESETS: Record<PlayerFactionKey, PlayerFactionIdentity> = {
  law_enforcement: {
    key: "law_enforcement",
    name: "JUSTICE DEPARTMENT",
    motto: "Order Above All.",
    primaryColor: "#00C8FF",
    secondaryColor: "#0F3D5C",
    glyph: "judges",
  },
  military: {
    key: "military",
    name: "WAR COMMAND",
    motto: "By Steel, By Blood.",
    primaryColor: "#FF3B30",
    secondaryColor: "#5C0F0F",
    glyph: "megacity",
  },
  corporate: {
    key: "corporate",
    name: "EXECUTIVE COUNCIL",
    motto: "Profit Is Peace.",
    primaryColor: "#FF9500",
    secondaryColor: "#5C3A0F",
    glyph: "corps",
  },
  intelligence: {
    key: "intelligence",
    name: "SHADOW BUREAU",
    motto: "Watch. Wait. Win.",
    primaryColor: "#B855FF",
    secondaryColor: "#3A0F5C",
    glyph: "iron-circuit",
  },
  underground: {
    key: "underground",
    name: "PEOPLE'S CIRCLE",
    motto: "From The Ashes, Us.",
    primaryColor: "#00FF41",
    secondaryColor: "#0F5C2E",
    glyph: "deep-root-collective",
  },
};

const ALL_KEYS: PlayerFactionKey[] = [
  "law_enforcement",
  "military",
  "corporate",
  "intelligence",
  "underground",
];

const ALL_GLYPHS: PlayerFactionGlyph[] = PLAYER_FACTION_GLYPHS.map((g) => g.id);

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** Defensive type guards so legacy or hand-edited saves can't slip a
 *  bogus key/glyph/color through into the UI. */
export function isPlayerFactionKey(v: unknown): v is PlayerFactionKey {
  return typeof v === "string" && (ALL_KEYS as string[]).includes(v);
}
export function isPlayerFactionGlyph(v: unknown): v is PlayerFactionGlyph {
  return typeof v === "string" && (ALL_GLYPHS as string[]).includes(v);
}
function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v);
}

/** Build an identity record from a faction key, falling back to the
 *  law_enforcement preset if the key is unknown. Pure / no IO. */
export function presetForKey(key: string): PlayerFactionIdentity {
  if (isPlayerFactionKey(key)) return { ...FACTION_PRESETS[key] };
  return { ...FACTION_PRESETS.law_enforcement };
}

/**
 * Project a fully-populated identity record for the current save.
 * Reads `state.playerFaction` if present, otherwise derives a sensible
 * default from playerTitle (legacy saves predate the customization
 * step). Always returns a valid record — never null/undefined — so
 * every renderer can pull `name`, `motto`, `glyph`, etc. unconditionally.
 *
 * Per-field defensive fallback: a stray bad color or unknown glyph in
 * the save (legacy migration, hand-edit, etc.) is replaced from the
 * preset so the screen never throws.
 */
export function getPlayerFaction(state: GameState): PlayerFactionIdentity {
  const stored = state.playerFaction;
  const guessedKey = guessKeyFromTitle(state.playerTitle);
  const preset = presetForKey(guessedKey);

  if (!stored || typeof stored !== "object") return preset;

  const key = isPlayerFactionKey(stored.key) ? stored.key : guessedKey;
  const base = presetForKey(key);

  return {
    key,
    // Length caps are enforced here as well as at the input layer so that
    // imported saves or hand-edited storage cannot inject a 10kb string
    // and break the HUD layout. Trim first, then truncate.
    name: typeof stored.name === "string" && stored.name.trim().length > 0
      ? stored.name.trim().slice(0, PLAYER_FACTION_NAME_MAX)
      : base.name,
    motto: typeof stored.motto === "string" && stored.motto.trim().length > 0
      ? stored.motto.trim().slice(0, PLAYER_FACTION_MOTTO_MAX)
      : base.motto,
    primaryColor: isHex(stored.primaryColor) ? stored.primaryColor : base.primaryColor,
    secondaryColor: isHex(stored.secondaryColor) ? stored.secondaryColor : base.secondaryColor,
    glyph: isPlayerFactionGlyph(stored.glyph) ? stored.glyph : base.glyph,
  };
}

/**
 * Heuristic mapping from the existing `playerTitle` text to a faction
 * key, so legacy saves get a colored banner that matches their start
 * choice instead of a generic default.
 */
export function guessKeyFromTitle(title: string | undefined): PlayerFactionKey {
  const t = (title ?? "").toLowerCase();
  // Order matters: more-specific brand words first so titles like
  // "Director-General" route to corporate (its primary noun) instead of
  // military (the qualifier).
  if (t.includes("director") || t.includes("executive") || t.includes("ceo")) return "corporate";
  if (t.includes("shadow") || t.includes("spy") || t.includes("intel")) return "intelligence";
  if (t.includes("people") || t.includes("street") || t.includes("union")) return "underground";
  if (t.includes("marshal") || t.includes("judge") || t.includes("warden") || t.includes("justice")) return "law_enforcement";
  if (t.includes("war") || t.includes("commander") || t.includes("general")) return "military";
  return "law_enforcement";
}

/**
 * Merge a partial identity update into the saved record. Validates each
 * field; bad input is dropped (rather than throwing) so the UI can
 * offer free-text inputs without crashing the game.
 */
export function setPlayerFaction(
  state: GameState,
  patch: Partial<PlayerFactionIdentity>,
): GameState {
  const current = getPlayerFaction(state);
  const merged: PlayerFactionIdentity = {
    key: isPlayerFactionKey(patch.key) ? patch.key : current.key,
    // Same trim+truncate as getPlayerFaction so an oversized patch
    // (from a script, cheat console, or stale UI) cannot land in
    // state and corrupt downstream layouts.
    name: typeof patch.name === "string" && patch.name.trim().length > 0
      ? patch.name.trim().slice(0, PLAYER_FACTION_NAME_MAX)
      : current.name,
    motto: typeof patch.motto === "string" && patch.motto.trim().length > 0
      ? patch.motto.trim().slice(0, PLAYER_FACTION_MOTTO_MAX)
      : current.motto,
    primaryColor: isHex(patch.primaryColor) ? patch.primaryColor : current.primaryColor,
    secondaryColor: isHex(patch.secondaryColor) ? patch.secondaryColor : current.secondaryColor,
    glyph: isPlayerFactionGlyph(patch.glyph) ? patch.glyph : current.glyph,
  };
  return { ...state, playerFaction: merged };
}

/** Cap on user-editable text fields so the UI doesn't overflow on the
 *  HUD / summary card. Same cap the city-name and player-name inputs use. */
export const PLAYER_FACTION_NAME_MAX = 30;
export const PLAYER_FACTION_MOTTO_MAX = 60;

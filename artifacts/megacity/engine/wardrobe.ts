// Wardrobe & sidearm loadout (Pack B — Equipment & uniforms).
//
// Cosmetic-only selector layer over a fixed set of uniform and sidearm
// variants. Each variant is just an id + label + icon + flavor — no new
// items are added to the inventory catalog and no combat math changes.
//
// Storage is two optional GameState fields:
//   - state.playerOutfit          — single record for the player
//   - state.officerOutfits        — Record<officerId, OfficerOutfit>
// Both are optional; old saves read defaults via the getter helpers.

import type { GameState } from "./types";

export type UniformId =
  | "field"
  | "parade"
  | "stealth"
  | "hazmat"
  | "dress"
  | "riot";

export type SidearmId =
  | "service-pistol"
  | "heavy-magnum"
  | "smartgun"
  | "taser-baton"
  | "autocarbine"
  | "monoblade";

export interface UniformVariant {
  id: UniformId;
  label: string;
  /** Short situational tone — kept terse to match game voice. */
  description: string;
  /** MaterialCommunityIcons name, reused so no new art ships. */
  icon: string;
}

export interface SidearmVariant {
  id: SidearmId;
  label: string;
  description: string;
  icon: string;
}

/** Six wardrobe variants. Order is the canonical pick order in the UI. */
export const UNIFORM_VARIANTS: UniformVariant[] = [
  { id: "field",   label: "FIELD",   description: "Standard armored fatigues. The default for active duty.", icon: "shield-account" },
  { id: "parade",  label: "PARADE",  description: "Full dress: medals visible, jackboots polished. For the cameras.", icon: "medal" },
  { id: "stealth", label: "STEALTH", description: "Matte black, no insignia. For work no one's supposed to see.", icon: "ninja" },
  { id: "hazmat",  label: "HAZMAT",  description: "Sealed environmental suit. Wasteland recon and quarantine duty.", icon: "biohazard" },
  { id: "dress",   label: "DRESS",   description: "Diplomatic blacks. Worn at summits and signing ceremonies.", icon: "tie" },
  { id: "riot",    label: "RIOT",    description: "Heavy plate and visor. For breaking up crowds, or worse.", icon: "shield-half-full" },
];

/** Six sidearm variants. Cosmetic only — no stats are derived from this. */
export const SIDEARM_VARIANTS: SidearmVariant[] = [
  { id: "service-pistol", label: "SERVICE PISTOL", description: "Standard issue. Reliable, unflashy, on every officer's hip.", icon: "pistol" },
  { id: "heavy-magnum",   label: "HEAVY MAGNUM",   description: "Hand cannon. Loud. Shows the citizen what authority looks like.", icon: "bullseye" },
  { id: "smartgun",       label: "SMARTGUN",       description: "Linked to your retina. Locks the trigger if it doesn't recognize you.", icon: "crosshairs-gps" },
  { id: "taser-baton",    label: "TASER BATON",    description: "Less-lethal. For arrests that need to look clean on the broadcast.", icon: "lightning-bolt" },
  { id: "autocarbine",    label: "AUTOCARBINE",    description: "Compact full-auto. Worn slung, drawn fast.", icon: "magazine-rifle" },
  { id: "monoblade",      label: "MONOBLADE",      description: "Edge one molecule wide. Drawn rarely. Remembered always.", icon: "knife-military" },
];

export interface PlayerOutfit {
  uniformId: UniformId;
  sidearmId: SidearmId;
}

export interface OfficerOutfit {
  uniformId: UniformId;
  sidearmId: SidearmId;
}

/** Default loadout for any character without an explicit pick. */
export const DEFAULT_OUTFIT: PlayerOutfit = {
  uniformId: "field",
  sidearmId: "service-pistol",
};

const ALL_UNIFORMS: UniformId[] = UNIFORM_VARIANTS.map((u) => u.id);
const ALL_SIDEARMS: SidearmId[] = SIDEARM_VARIANTS.map((s) => s.id);

export function isUniformId(v: unknown): v is UniformId {
  return typeof v === "string" && (ALL_UNIFORMS as string[]).includes(v);
}
export function isSidearmId(v: unknown): v is SidearmId {
  return typeof v === "string" && (ALL_SIDEARMS as string[]).includes(v);
}

function sanitizeOutfit(raw: any, fallback: PlayerOutfit): PlayerOutfit {
  if (!raw || typeof raw !== "object") return { ...fallback };
  return {
    uniformId: isUniformId(raw.uniformId) ? raw.uniformId : fallback.uniformId,
    sidearmId: isSidearmId(raw.sidearmId) ? raw.sidearmId : fallback.sidearmId,
  };
}

/** Read the player's loadout, falling back to the default field uniform
 *  + service pistol for any save that hasn't picked yet. */
export function getPlayerOutfit(state: GameState): PlayerOutfit {
  return sanitizeOutfit(state.playerOutfit, DEFAULT_OUTFIT);
}

/** Read an officer's loadout. Falls back to the default kit so the
 *  selector always renders against a known starting state. */
export function getOfficerOutfit(state: GameState, officerId: string): OfficerOutfit {
  const map = state.officerOutfits;
  if (!map || typeof map !== "object") return { ...DEFAULT_OUTFIT };
  return sanitizeOutfit(map[officerId], DEFAULT_OUTFIT);
}

/** Merge a partial player-outfit update into the save. Bad input is
 *  silently dropped so the UI can be lenient. */
export function setPlayerOutfit(state: GameState, patch: Partial<PlayerOutfit>): GameState {
  const current = getPlayerOutfit(state);
  const next: PlayerOutfit = {
    uniformId: isUniformId(patch.uniformId) ? patch.uniformId : current.uniformId,
    sidearmId: isSidearmId(patch.sidearmId) ? patch.sidearmId : current.sidearmId,
  };
  return { ...state, playerOutfit: next };
}

/** Merge a partial officer-outfit update into the save. */
export function setOfficerOutfit(
  state: GameState,
  officerId: string,
  patch: Partial<OfficerOutfit>,
): GameState {
  if (!officerId) return state;
  const current = getOfficerOutfit(state, officerId);
  const next: OfficerOutfit = {
    uniformId: isUniformId(patch.uniformId) ? patch.uniformId : current.uniformId,
    sidearmId: isSidearmId(patch.sidearmId) ? patch.sidearmId : current.sidearmId,
  };
  const map = { ...(state.officerOutfits ?? {}) };
  map[officerId] = next;
  return { ...state, officerOutfits: map };
}

export function getUniformVariant(id: UniformId): UniformVariant {
  return UNIFORM_VARIANTS.find((v) => v.id === id) ?? UNIFORM_VARIANTS[0];
}
export function getSidearmVariant(id: SidearmId): SidearmVariant {
  return SIDEARM_VARIANTS.find((v) => v.id === id) ?? SIDEARM_VARIANTS[0];
}

/** Short one-line summary used on character cards / retinue rows. */
export function formatOutfitSummary(outfit: PlayerOutfit | OfficerOutfit): string {
  const u = getUniformVariant(outfit.uniformId);
  const s = getSidearmVariant(outfit.sidearmId);
  return `${u.label} · ${s.label}`;
}

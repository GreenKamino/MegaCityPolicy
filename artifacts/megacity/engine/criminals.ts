// engine/criminals.ts — derives criminal-registry data from existing fields.
//
// Task #80 ("Criminals tab in named characters") asked for a status enum
// (wanted / fugitive / detained / executed / MIA / probation), a short
// rap sheet, and a last-known-location string. The existing data shape
// (CharacterStatus = "active" | "jailed" | "dead" | "exiled" | "missing"
//  + role + history) already carries everything we need — touching the
// shape would invalidate every save. So everything here is DERIVED.
//
// The crime/strike/diplomacy events that flip a character's status keep
// running through setCharacterStatus / recordCharacterEvent unchanged;
// this module only re-projects them for the registry UI.

import { getCharacterRoleLabel } from "./namedCharacters";
import type {
  CharacterRole,
  GameState,
  NamedCharacter,
  NamedCharacterEvent,
} from "./types";

export type CriminalStatus =
  | "wanted"
  | "fugitive"
  | "detained"
  | "executed"
  | "missing"
  | "probation";

// Roles whose subjects belong in the criminal registry by default.
// Other roles only show up if their *status* is criminal-typed
// (jailed / exiled). A celebrity who gets jailed is on the rap sheet;
// a celebrity who is fine is not.
const CRIMINAL_ROLES: ReadonlySet<CharacterRole> = new Set<CharacterRole>([
  "gang_lieutenant",
  "fugitive",
]);

// Status flips that put a non-criminal-role NPC onto the registry.
// "missing" alone isn't enough — plenty of journalists / informants
// "fade from public view" without being criminals. Only jail or exile
// counts as a non-role criminal flag.
const CRIMINAL_STATUS_FLAGS = new Set<NamedCharacter["status"]>([
  "jailed",
  "exiled",
]);

const CRIME_KEYWORDS = [
  "raid",
  "hit",
  "heist",
  "stash",
  "smuggle",
  "smuggling",
  "theft",
  "stole",
  "killed",
  "shooting",
  "shot",
  "sentenced",
  "jail",
  "arrest",
  "arrested",
  "busted",
  "caught",
  "escape",
  "escaped",
  "fled",
  "wanted",
  "fugitive",
  "ambush",
  "extort",
  "racket",
  "gang",
  "bribe",
  "contraband",
  "executed",
  "kidnap",
  "murder",
  "assault",
  "blackmail",
  "blackmailed",
];

const ESCAPE_KEYWORDS = ["escape", "escaped", "fled", "broke out", "breakout"];
const PROBATION_KEYWORDS = [
  "paroled",
  "released",
  "probation",
  "early release",
  "parole",
];

export function isCriminalRole(role: CharacterRole): boolean {
  return CRIMINAL_ROLES.has(role);
}

/**
 * Project an NPC onto the criminal-registry status enum, or return null
 * when the NPC doesn't belong on the registry at all.
 *
 * Rules (first match wins):
 *  - status=jailed  -> detained
 *  - status=dead    -> executed (criminal-typed roles only)
 *  - status=missing -> missing  (criminal-typed roles only)
 *  - status=exiled  -> fugitive
 *  - status=active + criminal role:
 *      - latest history mentions an escape/breakout -> fugitive
 *      - latest history mentions parole/release     -> probation
 *      - role=fugitive                              -> fugitive
 *      - otherwise                                  -> wanted
 *  - non-criminal role with status=active           -> null
 */
export function deriveCriminalStatus(
  npc: NamedCharacter,
): CriminalStatus | null {
  const isRoleCrim = isCriminalRole(npc.role);
  const isStatusCrim = CRIMINAL_STATUS_FLAGS.has(npc.status);

  if (!isRoleCrim && !isStatusCrim) {
    // Non-criminal role with non-criminal status. The only remaining
    // way to land here would be a dead/missing non-criminal — which
    // shouldn't appear on a criminal registry.
    return null;
  }

  switch (npc.status) {
    case "jailed":
      return "detained";
    case "exiled":
      return "fugitive";
    case "dead":
      return isRoleCrim ? "executed" : null;
    case "missing":
      return isRoleCrim ? "missing" : null;
    case "active": {
      const hist = Array.isArray(npc.history) ? npc.history : [];
      // Walk history newest-first looking for the most recent
      // status-toning entry. If we find an escape, that wins; if we
      // find a parole, probation wins. Stop at the first hit so older
      // events don't override more recent state.
      for (let i = hist.length - 1; i >= 0; i--) {
        const t = (hist[i].text || "").toLowerCase();
        if (ESCAPE_KEYWORDS.some((k) => t.includes(k))) return "fugitive";
        if (PROBATION_KEYWORDS.some((k) => t.includes(k))) return "probation";
      }
      return npc.role === "fugitive" ? "fugitive" : "wanted";
    }
    default:
      return null;
  }
}

export function isCriminalNPC(npc: NamedCharacter): boolean {
  return deriveCriminalStatus(npc) !== null;
}

/**
 * Pull up to `max` rap-sheet entries from npc.history, filtered down to
 * crime-flavored events (raid / arrest / sentenced / killed / etc.).
 * Returns an empty array when no offenses are on record — the UI shows
 * "NO PRIOR OFFENSES ON RECORD." in that case so we don't pad the rap
 * sheet with unrelated life events.
 *
 * Returned newest-first.
 */
export function deriveRapSheet(
  npc: NamedCharacter,
  max: number = 5,
): NamedCharacterEvent[] {
  const hist = Array.isArray(npc.history) ? npc.history : [];
  if (hist.length === 0) return [];
  const matches = hist.filter((e) => {
    const t = (e.text || "").toLowerCase();
    return CRIME_KEYWORDS.some((k) => t.includes(k));
  });
  if (matches.length === 0) return [];
  const cap = Math.max(1, Math.floor(max));
  return matches.slice(-cap).reverse();
}

/**
 * Resolve a printable last-known-location for the registry. Prefers the
 * NPC's current districtId (looked up in state.districts). Falls back
 * to "UNKNOWN" so the UI never has to deal with null.
 */
export function deriveLastKnownLocation(
  npc: NamedCharacter,
  state: GameState,
): string {
  if (npc.districtId) {
    const districts = Array.isArray(state.districts) ? state.districts : [];
    const d = districts.find((x) => x.id === npc.districtId);
    if (d?.name) return d.name;
  }
  return "UNKNOWN";
}

export type CriminalEntry = {
  npc: NamedCharacter;
  criminalStatus: CriminalStatus;
  rapSheet: NamedCharacterEvent[];
  lastKnownLocation: string;
};

/**
 * Produce the criminal registry from the current game state. Sorted by
 * notoriety descending then name ascending so high-priority targets
 * surface at the top.
 */
export function listCriminals(state: GameState): CriminalEntry[] {
  const list = Array.isArray(state.namedCharacters) ? state.namedCharacters : [];
  const out: CriminalEntry[] = [];
  for (const npc of list) {
    const cs = deriveCriminalStatus(npc);
    if (cs === null) continue;
    out.push({
      npc,
      criminalStatus: cs,
      rapSheet: deriveRapSheet(npc),
      lastKnownLocation: deriveLastKnownLocation(npc, state),
    });
  }
  out.sort((a, b) => {
    if (a.npc.notoriety !== b.npc.notoriety) {
      return b.npc.notoriety - a.npc.notoriety;
    }
    return a.npc.name.localeCompare(b.npc.name);
  });
  return out;
}

export type CriminalSummary = Record<CriminalStatus, number> & { total: number };

export function summarizeCriminals(entries: CriminalEntry[]): CriminalSummary {
  const out: CriminalSummary = {
    total: entries.length,
    wanted: 0,
    fugitive: 0,
    detained: 0,
    executed: 0,
    missing: 0,
    probation: 0,
  };
  for (const e of entries) {
    out[e.criminalStatus] += 1;
  }
  return out;
}

export const CRIMINAL_STATUS_LABELS: Record<CriminalStatus, string> = {
  wanted: "WANTED",
  fugitive: "FUGITIVE",
  detained: "DETAINED",
  executed: "EXECUTED",
  missing: "MIA",
  probation: "PROBATION",
};

export const CRIMINAL_STATUS_ORDER: CriminalStatus[] = [
  "wanted",
  "fugitive",
  "detained",
  "probation",
  "missing",
  "executed",
];

/**
 * Apply the screen's user-facing filters (status chip + free-text query)
 * to a registry list. Pulled into the engine module so the filter logic
 * is unit-testable instead of locked inside the screen component.
 *
 * Search matches name / role (raw + display label) / status badge /
 * location / rap-sheet text — case-insensitive.
 */
export function filterCriminals(
  entries: CriminalEntry[],
  opts: { status?: CriminalStatus | "all"; query?: string },
): CriminalEntry[] {
  const status = opts.status ?? "all";
  const q = (opts.query ?? "").trim().toLowerCase();
  return entries.filter((e) => {
    if (status !== "all" && e.criminalStatus !== status) return false;
    if (!q) return true;
    if (e.npc.name.toLowerCase().includes(q)) return true;
    if (e.npc.role.toLowerCase().includes(q)) return true;
    if (getCharacterRoleLabel(e.npc.role).toLowerCase().includes(q)) return true;
    if (CRIMINAL_STATUS_LABELS[e.criminalStatus].toLowerCase().includes(q)) return true;
    if (e.lastKnownLocation.toLowerCase().includes(q)) return true;
    for (const r of e.rapSheet) {
      if ((r.text || "").toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

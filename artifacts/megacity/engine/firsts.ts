// Trophy Wall — "Firsts" — career milestones that the player crosses for
// the first time. Distinct from achievements: this is a curated, narrative
// timeline of the player character's lifetime firsts (first contract,
// first riot, first prestige, first faction war won, etc).
//
// Pure derivation only: every first is checked against current GameState
// counters. No new persistent state is needed.

import type { GameState } from "@/engine/types";
import { ATLAS_CATEGORIES } from "@/engine/atlasCategoryRewards";
import {
  FACTION_SIGNATURE_UNITS,
  archetypeDisplayName,
} from "@/engine/combatData";

// Per-category atlas survey firsts. Title/icon table is keyed by the
// atlas category id (see ATLAS_CATEGORIES in atlasCategoryRewards.ts).
const ATLAS_FIRST_META: Record<string, { title: string; description: string; icon: string }> = {
  zone: {
    title: "Zone Mapper",
    description: "Charted every terrain zone in the Wasteland Atlas.",
    icon: "grid",
  },
  mountain: {
    title: "Range-Finder",
    description: "Charted every mountain range in the Wasteland Atlas.",
    icon: "triangle",
  },
  water: {
    title: "Hydrographer",
    description: "Charted every water body in the Wasteland Atlas.",
    icon: "droplet",
  },
  coast: {
    title: "Coastline Surveyor",
    description: "Charted every coast segment in the Wasteland Atlas.",
    icon: "wind",
  },
  canyon: {
    title: "Canyon Cartographer",
    description: "Charted every canyon mark in the Wasteland Atlas.",
    icon: "git-branch",
  },
  plateau: {
    title: "Plateau Pathfinder",
    description: "Charted every plateau in the Wasteland Atlas.",
    icon: "square",
  },
  river: {
    title: "Dead River Tracer",
    description: "Charted every dried river in the Wasteland Atlas.",
    icon: "git-commit",
  },
  dune: {
    title: "Dune Field Surveyor",
    description: "Charted every dune field in the Wasteland Atlas.",
    icon: "cloud",
  },
  scatter: {
    title: "Scatter Field Logger",
    description: "Charted every scatter field in the Wasteland Atlas.",
    icon: "more-horizontal",
  },
  cliff: {
    title: "Cliffside Surveyor",
    description: "Charted every cliff edge in the Wasteland Atlas.",
    icon: "bar-chart-2",
  },
};

export type FirstCategory =
  | "command"
  | "law"
  | "construction"
  | "diplomacy"
  | "discovery"
  | "military"
  | "economy"
  | "endgame";

export type FirstDef = {
  id: string;
  category: FirstCategory;
  title: string;
  description: string;
  icon: string;       // Feather name
  // Returns true once the player has accomplished the first.
  check: (state: GameState) => boolean;
  // Optional rarity hint for UI styling.
  rarity?: "common" | "uncommon" | "rare" | "legendary";
};

export const FIRSTS: FirstDef[] = [
  // ── COMMAND ──
  {
    id: "first_decision",
    category: "command",
    title: "First Order Issued",
    description: "You issued your very first command decision.",
    icon: "edit-3",
    check: (s) => (s.player?.totalDecisions ?? 0) >= 1,
    rarity: "common",
  },
  {
    id: "first_hundred_decisions",
    category: "command",
    title: "Centurion of Decrees",
    description: "Issued 100 command decisions.",
    icon: "feather",
    check: (s) => (s.player?.totalDecisions ?? 0) >= 100,
    rarity: "uncommon",
  },
  {
    id: "first_thousand_decisions",
    category: "command",
    title: "Iron Bureaucrat",
    description: "Issued 1,000 command decisions.",
    icon: "shield",
    check: (s) => (s.player?.totalDecisions ?? 0) >= 1_000,
    rarity: "rare",
  },

  // ── LAW ──
  {
    id: "first_arrest",
    category: "law",
    title: "First Arrest",
    description: "Sentenced your first criminal.",
    icon: "alert-triangle",
    check: (s) => (s.player?.criminalsSentenced ?? 0) >= 1,
    rarity: "common",
  },
  {
    id: "first_riot_quelled",
    category: "law",
    title: "First Riot Quelled",
    description: "Brought order back to the streets.",
    icon: "shield-off",
    check: (s) => (s.player?.riotsQuelled ?? 0) >= 1,
    rarity: "common",
  },
  {
    id: "first_hundred_arrests",
    category: "law",
    title: "Sweeping the Sector",
    description: "Sentenced 100 criminals.",
    icon: "lock",
    check: (s) => (s.player?.criminalsSentenced ?? 0) >= 100,
    rarity: "uncommon",
  },

  // ── CONSTRUCTION ──
  {
    id: "first_contract",
    category: "construction",
    title: "First Contract Closed",
    description: "Completed your first city contract.",
    icon: "clipboard",
    check: (s) => (s.player?.contractsCompleted ?? 0) >= 1,
    rarity: "common",
  },
  {
    id: "first_megaproject",
    category: "construction",
    title: "Monument Erected",
    description: "Completed your first megaproject.",
    icon: "octagon",
    check: (s) => (s.totalMegaProjectsCompleted ?? 0) >= 1,
    rarity: "rare",
  },

  // ── DIPLOMACY ──
  {
    id: "first_faction_met",
    category: "diplomacy",
    title: "First Contact",
    description: "Made first contact with another faction.",
    icon: "users",
    check: (s) => (s.factions ?? []).filter((f) => f.isActive).length >= 1,
    rarity: "common",
  },
  {
    id: "first_megacity_discovered",
    category: "diplomacy",
    title: "Beyond the Walls",
    description: "Discovered another megacity on the map.",
    icon: "globe",
    check: (s) => (s.externalMegacities ?? []).length >= 1,
    rarity: "common",
  },
  {
    id: "first_diplomatic_pact",
    category: "diplomacy",
    title: "Words Over Bullets",
    description: "Signed your first diplomatic pact.",
    icon: "feather",
    check: (s) => (s.diplomaticPacts ?? []).length >= 1,
    rarity: "uncommon",
  },
  {
    id: "first_trade_deal",
    category: "diplomacy",
    title: "First Trade Deal",
    description: "Established a trade agreement with a partner.",
    icon: "repeat",
    check: (s) => (s.tradeAgreements ?? []).length >= 1,
    rarity: "common",
  },

  // ── DISCOVERY ──
  {
    id: "first_lore_found",
    category: "discovery",
    title: "First Field Document",
    description: "Recovered your first lore artifact.",
    icon: "book-open",
    check: (s) => (s.discoveredLore ?? []).length >= 1,
    rarity: "common",
  },
  {
    id: "first_terrain_charted",
    category: "discovery",
    title: "Cartographer",
    description: "Inspected a terrain feature on the wasteland map.",
    icon: "map",
    check: (s) => (s.discoveredTerrain ?? []).length >= 1,
    rarity: "common",
  },
  {
    id: "first_location_discovered",
    category: "discovery",
    title: "Off the Map",
    description: "Discovered a notable location.",
    icon: "map-pin",
    check: (s) => (s.discoveredLocationIds ?? []).length >= 1,
    rarity: "common",
  },
  {
    id: "first_research",
    category: "discovery",
    title: "First Breakthrough",
    description: "Completed your first technology.",
    icon: "cpu",
    check: (s) => (s.unlockedTechnologies ?? []).length >= 1,
    rarity: "common",
  },
  {
    id: "ten_research",
    category: "discovery",
    title: "Lab Rat",
    description: "Unlocked 10 technologies.",
    icon: "zap",
    check: (s) => (s.unlockedTechnologies ?? []).length >= 10,
    rarity: "uncommon",
  },

  // ── MILITARY ──
  {
    id: "first_strike",
    category: "military",
    title: "First Strike",
    description: "Launched your first military strike.",
    icon: "target",
    check: (s) => (s.strikeHistory ?? []).length >= 1,
    rarity: "common",
  },
  {
    id: "first_strike_success",
    category: "military",
    title: "Direct Hit",
    description: "Successfully completed a strike.",
    icon: "crosshair",
    check: (s) => (s.strikeHistory ?? []).some((r) => r.success),
    rarity: "uncommon",
  },
  {
    id: "first_mission",
    category: "military",
    title: "Operation Closed",
    description: "Completed your first officer mission.",
    icon: "flag",
    check: (s) => (s.totalMissionsSucceeded ?? 0) >= 1
      || (s.militaryOverhaul?.completedMissions ?? 0) >= 1,
    rarity: "common",
  },

  // ── ECONOMY ──
  {
    id: "first_million_credits",
    category: "economy",
    title: "First Million",
    description: "Held one million credits in the treasury.",
    icon: "trending-up",
    check: (s) => (s.resources?.credits ?? 0) >= 1_000_000,
    rarity: "uncommon",
  },
  {
    id: "first_company",
    category: "economy",
    title: "Open for Business",
    description: "Licensed your first company.",
    icon: "briefcase",
    check: (s) => (s.companies ?? []).length >= 1,
    rarity: "common",
  },

  // ── ENDGAME ──
  {
    id: "first_weekly_complete",
    category: "endgame",
    title: "Weekly Win",
    description: "Completed a weekly challenge.",
    icon: "calendar",
    check: (s) => (s.weeklyChallengesCompleted ?? 0) >= 1,
    rarity: "common",
  },
  {
    id: "level_10",
    category: "endgame",
    title: "Seasoned Marshal",
    description: "Reached commander level 10.",
    icon: "award",
    check: (s) => (s.player?.level ?? 0) >= 10,
    rarity: "uncommon",
  },
  {
    id: "level_25",
    category: "endgame",
    title: "Veteran Marshal",
    description: "Reached commander level 25.",
    icon: "star",
    check: (s) => (s.player?.level ?? 0) >= 25,
    rarity: "rare",
  },
  {
    id: "level_50",
    category: "endgame",
    title: "Living Legend",
    description: "Reached the maximum commander level.",
    icon: "zap",
    check: (s) => (s.player?.level ?? 0) >= 50,
    rarity: "legendary",
  },
];

// ── MILITARY: ARCHETYPE-SPECIFIC KILL MILESTONES ──
// One "first kill" first per faction signature archetype id, plus a
// 100-kill milestone per archetype. Sourced from FACTION_SIGNATURE_UNITS
// so new archetypes light up here automatically. Display names come
// from `archetypeDisplayName` so they match the after-action debrief
// and the Military > Defense lifetime tally readout (Task #226).
const ARCHETYPE_FIRSTS_SEEN = new Set<string>();
for (const list of Object.values(FACTION_SIGNATURE_UNITS)) {
  for (const u of list) {
    if (ARCHETYPE_FIRSTS_SEEN.has(u.id)) continue;
    ARCHETYPE_FIRSTS_SEEN.add(u.id);
    const name = archetypeDisplayName(u.id);
    FIRSTS.push({
      id: `first_kill_archetype_${u.id}`,
      category: "military",
      title: `First ${name} Down`,
      description: `Recorded your first ${name} kill in defense of the sector.`,
      icon: "crosshair",
      check: (s) => ((s.combat?.enemiesDefeatedByArchetype ?? {})[u.id] ?? 0) >= 1,
      rarity: "common",
    });
    FIRSTS.push({
      id: `hundred_kills_archetype_${u.id}`,
      category: "military",
      title: `${name}: Century Mark`,
      description: `Put down 100 ${name} over your career.`,
      icon: "target",
      check: (s) => ((s.combat?.enemiesDefeatedByArchetype ?? {})[u.id] ?? 0) >= 100,
      rarity: "rare",
    });
  }
}

// ── DISCOVERY: WASTELAND ATLAS SURVEYS ──
// One per atlas category; unlocks when the category reward has been claimed
// (i.e. its id is present in `state.atlasCategoryRewardsClaimed`).
for (const cat of ATLAS_CATEGORIES) {
  const meta = ATLAS_FIRST_META[cat.id] ?? {
    title: `${cat.label} Surveyor`,
    description: `Charted every entry in the ${cat.label} category.`,
    icon: "map",
  };
  FIRSTS.push({
    id: `atlas_category_${cat.id}`,
    category: "discovery",
    title: meta.title,
    description: meta.description,
    icon: meta.icon,
    check: (s) => (s.atlasCategoryRewardsClaimed ?? []).includes(cat.id),
    rarity: "uncommon",
  });
}

export const CATEGORY_LABELS: Record<FirstCategory, string> = {
  command: "COMMAND",
  law: "LAW & ORDER",
  construction: "CONSTRUCTION",
  diplomacy: "DIPLOMACY",
  discovery: "DISCOVERY",
  military: "MILITARY",
  economy: "ECONOMY",
  endgame: "ENDGAME",
};

export type FirstStatus = {
  def: FirstDef;
  unlocked: boolean;
};

export function evaluateFirsts(state: GameState): FirstStatus[] {
  return FIRSTS.map((def) => ({ def, unlocked: def.check(state) }));
}

export function countUnlocked(state: GameState): { unlocked: number; total: number } {
  let n = 0;
  for (const f of FIRSTS) if (f.check(state)) n++;
  return { unlocked: n, total: FIRSTS.length };
}

// Returns the set of currently-unlocked first ids for the given state.
export function unlockedFirstIds(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const f of FIRSTS) if (f.check(state)) out.add(f.id);
  return out;
}

// Returns the FirstDef entries that became unlocked in `state` but were not in
// `prevUnlockedIds`. Used by the unlock-toast bridge so a transient banner can
// fire whenever evaluation flips a Firsts entry from locked to unlocked.
export function diffNewlyUnlockedFirsts(
  prevUnlockedIds: ReadonlySet<string>,
  state: GameState
): FirstDef[] {
  const out: FirstDef[] = [];
  for (const f of FIRSTS) {
    if (prevUnlockedIds.has(f.id)) continue;
    if (f.check(state)) out.push(f);
  }
  return out;
}

export function groupByCategory(statuses: FirstStatus[]): Record<FirstCategory, FirstStatus[]> {
  const out = {} as Record<FirstCategory, FirstStatus[]>;
  for (const cat of Object.keys(CATEGORY_LABELS) as FirstCategory[]) out[cat] = [];
  for (const st of statuses) out[st.def.category].push(st);
  return out;
}

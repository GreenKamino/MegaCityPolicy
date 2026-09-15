// Atlas Category Rewards
//
// The Wasteland Atlas (atlas.tsx) groups discovered terrain features into
// categories (zones, ranges, waters, coasts, canyons, plateaus, dead rivers,
// dune fields, scatter fields, cliffs). Filling every feature in a single
// category grants a one-time XP bump and pushes a worldEventLog entry.
//
// `applyAtlasCategoryRewards` is idempotent: it only grants categories whose
// id is not already in `state.atlasCategoryRewardsClaimed`, so reloading a
// save (or running it again on the next discovery) never double-grants.

import {
  CANYON_MARKS,
  CLIFF_EDGES,
  COAST_SEGMENTS,
  DRIED_RIVERS,
  DUNE_FIELDS,
  MOUNTAIN_RANGES,
  PLATEAU_MARKS,
  SCATTER_DOTS,
  TERRAIN_ZONES,
  WATER_BODIES,
} from "@/engine/worldMapData";
import { xpForLevel as playerXpForLevel } from "@/engine/profiles";
import type { GameState } from "@/engine/types";

export const ATLAS_CATEGORY_XP_REWARD = 75;

// Capstone reward for fully charting every atlas category. Sized to dwarf the
// per-category XP so finishing the atlas feels like a real long-tail goal
// instead of ten independent 75-XP grants. Granted exactly once via the
// `atlasCapstoneClaimed` flag on GameState.
export const ATLAS_CAPSTONE_XP_REWARD = 1000;
export const ATLAS_CAPSTONE_TITLE = "Master Cartographer";

type SourceItem = { id: string; label?: string; lore?: string };

type CategoryDef = {
  id: string;
  label: string;
  prefix: string;
  source: SourceItem[];
};

// Mirrors the build() filter in atlas.tsx: only items that have both a
// label and lore are countable atlas entries.
const RAW_CATEGORIES: CategoryDef[] = [
  { id: "zone", label: "ZONES", prefix: "zone", source: TERRAIN_ZONES as SourceItem[] },
  { id: "mountain", label: "RANGES", prefix: "mountain", source: MOUNTAIN_RANGES as SourceItem[] },
  { id: "water", label: "WATERS", prefix: "water", source: WATER_BODIES as SourceItem[] },
  { id: "coast", label: "COASTS", prefix: "coast", source: COAST_SEGMENTS as SourceItem[] },
  { id: "canyon", label: "CANYONS", prefix: "canyon", source: CANYON_MARKS as SourceItem[] },
  { id: "plateau", label: "PLATEAUS", prefix: "plateau", source: PLATEAU_MARKS as SourceItem[] },
  { id: "river", label: "DEAD RIVERS", prefix: "river", source: DRIED_RIVERS as SourceItem[] },
  { id: "dune", label: "DUNE FIELDS", prefix: "dune", source: DUNE_FIELDS as SourceItem[] },
  { id: "scatter", label: "SCATTER FIELDS", prefix: "scatter", source: SCATTER_DOTS as SourceItem[] },
  { id: "cliff", label: "CLIFFS", prefix: "cliff", source: CLIFF_EDGES as SourceItem[] },
];

export type AtlasCategoryMeta = {
  id: string;
  label: string;
  prefix: string;
  totalIds: string[];
};

export const ATLAS_CATEGORIES: AtlasCategoryMeta[] = RAW_CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
  prefix: c.prefix,
  totalIds: c.source
    .filter((it) => !!it.label && !!it.lore)
    .map((it) => `${c.prefix}-${it.id}`),
})).filter((c) => c.totalIds.length > 0);

export type AtlasCategoryStatus = {
  id: string;
  label: string;
  found: number;
  total: number;
  complete: boolean;
  claimed: boolean;
};

export function getAtlasCategoryStatuses(state: GameState): AtlasCategoryStatus[] {
  const discovered = new Set(state.discoveredTerrain ?? []);
  const claimed = new Set(state.atlasCategoryRewardsClaimed ?? []);
  return ATLAS_CATEGORIES.map((c) => {
    let found = 0;
    for (const id of c.totalIds) if (discovered.has(id)) found++;
    const total = c.totalIds.length;
    return {
      id: c.id,
      label: c.label,
      found,
      total,
      complete: total > 0 && found >= total,
      claimed: claimed.has(c.id),
    };
  });
}

export type AtlasRewardGranted = {
  id: string;
  label: string;
  xp: number;
};

export type AtlasCapstoneGranted = {
  xp: number;
  title: string;
  previousTitle: string;
};

function applyXp(player: NonNullable<GameState["player"]>, gain: number) {
  let xp = player.xp + gain;
  let level = player.level;
  let xpToNext = player.xpToNext;
  let attributePoints = player.attributePoints;
  let skillPoints = player.skillPoints;
  while (xp >= xpToNext && level < 50) {
    xp -= xpToNext;
    level += 1;
    xpToNext = playerXpForLevel(level);
    attributePoints += 1;
    if (level % 3 === 0) skillPoints += 1;
  }
  return { ...player, xp, level, xpToNext, attributePoints, skillPoints };
}

export function applyAtlasCategoryRewards(
  state: GameState
): { state: GameState; granted: AtlasRewardGranted[]; capstone?: AtlasCapstoneGranted } {
  const discovered = new Set(state.discoveredTerrain ?? []);
  const claimed = new Set(state.atlasCategoryRewardsClaimed ?? []);
  const granted: AtlasRewardGranted[] = [];

  for (const c of ATLAS_CATEGORIES) {
    if (claimed.has(c.id)) continue;
    let found = 0;
    for (const id of c.totalIds) if (discovered.has(id)) found++;
    if (found < c.totalIds.length) continue;
    granted.push({ id: c.id, label: c.label, xp: ATLAS_CATEGORY_XP_REWARD });
  }

  // Capstone fires the moment every atlas category is claimed (counting the
  // ones we just granted in this sweep). The `atlasCapstoneClaimed` flag
  // makes the bonus idempotent across reloads.
  const allClaimedAfter = new Set([
    ...claimed,
    ...granted.map((g) => g.id),
  ]);
  const capstoneEligible =
    !state.atlasCapstoneClaimed &&
    ATLAS_CATEGORIES.every((c) => allClaimedAfter.has(c.id));

  if (granted.length === 0 && !capstoneEligible) return { state, granted };

  const next: GameState = { ...state };
  if (granted.length > 0) {
    next.atlasCategoryRewardsClaimed = [
      ...(state.atlasCategoryRewardsClaimed ?? []),
      ...granted.map((g) => g.id),
    ];
  }

  const totalCategoryXp = granted.reduce((sum, g) => sum + g.xp, 0);

  let capstone: AtlasCapstoneGranted | undefined;
  if (capstoneEligible) {
    const previousTitle = state.playerTitle ?? "City Commander";
    capstone = {
      xp: ATLAS_CAPSTONE_XP_REWARD,
      title: ATLAS_CAPSTONE_TITLE,
      previousTitle,
    };
    next.atlasCapstoneClaimed = true;
    next.playerTitle = ATLAS_CAPSTONE_TITLE;
  }

  const xpGain = totalCategoryXp + (capstone ? capstone.xp : 0);
  if (next.player && xpGain > 0) {
    next.player = applyXp(next.player, xpGain);
  }

  const tick = next.totalTicks ?? 0;
  const ts = Date.now();
  const logEntries = granted.map((g) => ({
    tick,
    event: `Atlas category fully charted: ${g.label} (+${g.xp} XP)`,
    type: "discovery",
    timestamp: ts,
    title: `${g.label} CHARTED`,
    description: `Every feature in the ${g.label} category is now recorded in the Wasteland Atlas. Council awards +${g.xp} XP for completing the survey.`,
  }));
  if (capstone) {
    logEntries.push({
      tick,
      event: `Wasteland Atlas fully charted — Council confers the title "${capstone.title}" (+${capstone.xp} XP)`,
      type: "discovery",
      timestamp: ts,
      title: "WASTELAND ATLAS COMPLETE",
      description: `Every category in the Wasteland Atlas is now fully charted. The Council awards a +${capstone.xp} XP capstone bonus and confers the unique commander title "${capstone.title}" upon ${previousTitleHonorific(capstone.previousTitle)}.`,
    });
  }
  next.worldEventLog = [...(next.worldEventLog ?? []), ...logEntries];

  if (capstone) {
    const msg = {
      id: `atlas-capstone-${ts}`,
      timestamp: next.gameDate ?? { year: 0, month: 0, day: 0, hour: 0 },
      tick,
      category: "update" as const,
      title: `WASTELAND ATLAS COMPLETE — TITLE CONFERRED: ${capstone.title.toUpperCase()}`,
      body: `Surveyors have signed off on the final atlas category. Every range, water, coast, canyon, plateau, dead river, dune field, scatter field, cliff, and zone is now charted in the Wasteland Atlas.\n\nThe Council formally confers the unique commander title "${capstone.title}" and awards a one-time +${capstone.xp} XP capstone bonus for completing the survey.`,
      read: false,
      priority: "high" as const,
    };
    next.messages = [msg, ...(state.messages ?? [])].slice(0, 200);
  }

  return { state: next, granted, capstone };
}

function previousTitleHonorific(title: string): string {
  const t = (title ?? "").trim();
  return t.length > 0 ? `the ${t}` : "the commander";
}

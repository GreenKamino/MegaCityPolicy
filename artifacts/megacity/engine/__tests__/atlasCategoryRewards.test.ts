import { describe, expect, it } from "vitest";

import {
  ATLAS_CAPSTONE_TITLE,
  ATLAS_CAPSTONE_XP_REWARD,
  ATLAS_CATEGORIES,
  ATLAS_CATEGORY_XP_REWARD,
  applyAtlasCategoryRewards,
  getAtlasCategoryStatuses,
} from "@/engine/atlasCategoryRewards";
import type { GameState } from "@/engine/types";

function baseState(over: Partial<GameState> = {}): GameState {
  return {
    player: {
      level: 1,
      xp: 0,
      xpToNext: 100_000_000,
      attributePoints: 0,
      skillPoints: 0,
    },
    playerTitle: "City Commander",
    gameDate: { year: 2099, month: 1, day: 1, hour: 0 },
    messages: [],
    discoveredTerrain: [],
    atlasCategoryRewardsClaimed: [],
    atlasCapstoneClaimed: false,
    worldEventLog: [],
    totalTicks: 0,
    ...over,
  } as unknown as GameState;
}

function allAtlasIds(): string[] {
  const ids: string[] = [];
  for (const c of ATLAS_CATEGORIES) ids.push(...c.totalIds);
  return ids;
}

describe("atlasCategoryRewards", () => {
  it("ATLAS_CATEGORIES exposes all ten terrain categories", () => {
    const ids = ATLAS_CATEGORIES.map((c) => c.id).sort();
    expect(ids).toEqual(
      ["canyon", "cliff", "coast", "dune", "mountain", "plateau", "river", "scatter", "water", "zone"]
    );
    for (const c of ATLAS_CATEGORIES) {
      expect(c.totalIds.length).toBeGreaterThan(0);
      for (const id of c.totalIds) expect(id.startsWith(`${c.prefix}-`)).toBe(true);
    }
  });

  it("getAtlasCategoryStatuses reports found/total/complete/claimed accurately", () => {
    const cat = ATLAS_CATEGORIES[0];
    const partial = cat.totalIds.slice(0, Math.max(1, cat.totalIds.length - 1));
    const statuses = getAtlasCategoryStatuses(baseState({ discoveredTerrain: partial }));
    const st = statuses.find((s) => s.id === cat.id)!;
    expect(st.found).toBe(partial.length);
    expect(st.total).toBe(cat.totalIds.length);
    expect(st.complete).toBe(partial.length === cat.totalIds.length);
    expect(st.claimed).toBe(false);
  });

  it("does not grant when no category is fully charted", () => {
    const s = baseState({ discoveredTerrain: [ATLAS_CATEGORIES[0].totalIds[0]] });
    const { state, granted } = applyAtlasCategoryRewards(s);
    expect(granted).toEqual([]);
    expect(state).toBe(s);
  });

  it("grants XP and logs a world event when a category is fully charted", () => {
    const cat = ATLAS_CATEGORIES.find((c) => c.id === "mountain")!;
    const s = baseState({ discoveredTerrain: [...cat.totalIds] });
    const { state, granted } = applyAtlasCategoryRewards(s);
    expect(granted).toHaveLength(1);
    expect(granted[0].id).toBe("mountain");
    expect(granted[0].xp).toBe(ATLAS_CATEGORY_XP_REWARD);
    expect(state.atlasCategoryRewardsClaimed).toContain("mountain");
    expect(state.player!.xp).toBe(ATLAS_CATEGORY_XP_REWARD);
    expect(state.worldEventLog!.length).toBe(1);
    expect(state.worldEventLog![0].type).toBe("discovery");
  });

  it("is idempotent — re-applying does not double-grant", () => {
    const cat = ATLAS_CATEGORIES.find((c) => c.id === "cliff")!;
    const s = baseState({ discoveredTerrain: [...cat.totalIds] });
    const first = applyAtlasCategoryRewards(s);
    const second = applyAtlasCategoryRewards(first.state);
    expect(second.granted).toEqual([]);
    expect(second.state).toBe(first.state);
    expect(first.state.player!.xp).toBe(ATLAS_CATEGORY_XP_REWARD);
  });

  it("grants multiple categories in a single sweep", () => {
    const a = ATLAS_CATEGORIES[0];
    const b = ATLAS_CATEGORIES[1];
    const s = baseState({ discoveredTerrain: [...a.totalIds, ...b.totalIds] });
    const { state, granted } = applyAtlasCategoryRewards(s);
    expect(granted.map((g) => g.id).sort()).toEqual([a.id, b.id].sort());
    expect(state.player!.xp).toBe(2 * ATLAS_CATEGORY_XP_REWARD);
    expect(state.worldEventLog!.length).toBe(2);
  });

  it("grants the capstone reward when every category is fully charted", () => {
    const s = baseState({ discoveredTerrain: allAtlasIds() });
    const { state, granted, capstone } = applyAtlasCategoryRewards(s);
    expect(granted.length).toBe(ATLAS_CATEGORIES.length);
    expect(capstone).toBeDefined();
    expect(capstone!.xp).toBe(ATLAS_CAPSTONE_XP_REWARD);
    expect(capstone!.title).toBe(ATLAS_CAPSTONE_TITLE);
    expect(capstone!.previousTitle).toBe("City Commander");
    expect(state.atlasCapstoneClaimed).toBe(true);
    expect(state.playerTitle).toBe(ATLAS_CAPSTONE_TITLE);
    expect(state.player!.xp).toBe(
      ATLAS_CATEGORIES.length * ATLAS_CATEGORY_XP_REWARD + ATLAS_CAPSTONE_XP_REWARD
    );
    // Per-category log entries plus the capstone entry.
    expect(state.worldEventLog!.length).toBe(ATLAS_CATEGORIES.length + 1);
    const capstoneLog = state.worldEventLog!.at(-1)!;
    expect(capstoneLog.title).toBe("WASTELAND ATLAS COMPLETE");
    expect(state.messages!.length).toBe(1);
    expect(state.messages![0].title).toContain("WASTELAND ATLAS COMPLETE");
    expect(state.messages![0].priority).toBe("high");
  });

  it("capstone is idempotent across reloads (does not double-grant)", () => {
    const s = baseState({ discoveredTerrain: allAtlasIds() });
    const first = applyAtlasCategoryRewards(s);
    const second = applyAtlasCategoryRewards(first.state);
    expect(second.granted).toEqual([]);
    expect(second.capstone).toBeUndefined();
    expect(second.state).toBe(first.state);
    // Title should remain the conferred capstone title.
    expect(first.state.playerTitle).toBe(ATLAS_CAPSTONE_TITLE);
  });

  it("capstone fires only once even if categories were already claimed before", () => {
    // Simulate a save where every category is already claimed but the
    // capstone flag was never set (e.g. an old save predating the capstone).
    const s = baseState({
      discoveredTerrain: allAtlasIds(),
      atlasCategoryRewardsClaimed: ATLAS_CATEGORIES.map((c) => c.id),
      atlasCapstoneClaimed: false,
    });
    const { state, granted, capstone } = applyAtlasCategoryRewards(s);
    expect(granted).toEqual([]);
    expect(capstone).toBeDefined();
    expect(state.atlasCapstoneClaimed).toBe(true);
    expect(state.playerTitle).toBe(ATLAS_CAPSTONE_TITLE);
    expect(state.player!.xp).toBe(ATLAS_CAPSTONE_XP_REWARD);
    // Only the capstone log entry should be added.
    expect(state.worldEventLog!.length).toBe(1);
    expect(state.worldEventLog![0].title).toBe("WASTELAND ATLAS COMPLETE");
  });

  it("does not re-grant capstone when atlasCapstoneClaimed is already true", () => {
    const s = baseState({
      discoveredTerrain: allAtlasIds(),
      atlasCategoryRewardsClaimed: ATLAS_CATEGORIES.map((c) => c.id),
      atlasCapstoneClaimed: true,
      playerTitle: ATLAS_CAPSTONE_TITLE,
    });
    const { state, granted, capstone } = applyAtlasCategoryRewards(s);
    expect(granted).toEqual([]);
    expect(capstone).toBeUndefined();
    expect(state).toBe(s);
  });

  it("levels up the player when accumulated XP crosses xpToNext", () => {
    const cat = ATLAS_CATEGORIES.find((c) => c.id === "water")!;
    const s = baseState({
      discoveredTerrain: [...cat.totalIds],
      player: {
        level: 2,
        xp: 0,
        xpToNext: 50,
        attributePoints: 0,
        skillPoints: 0,
      },
    } as unknown as Partial<GameState>);
    const { state } = applyAtlasCategoryRewards(s);
    expect(state.player!.level).toBeGreaterThan(2);
    expect(state.player!.attributePoints).toBeGreaterThan(0);
  });
});

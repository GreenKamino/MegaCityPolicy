import { describe, expect, it } from "vitest";

import {
  CATEGORY_LABELS,
  FIRSTS,
  countUnlocked,
  diffNewlyUnlockedFirsts,
  evaluateFirsts,
  groupByCategory,
  unlockedFirstIds,
} from "@/engine/firsts";
import { ATLAS_CATEGORIES } from "@/engine/atlasCategoryRewards";
import {
  FACTION_SIGNATURE_UNITS,
  archetypeDisplayName,
} from "@/engine/combatData";
import type { GameState } from "@/engine/types";

function emptyState(over: Partial<GameState> = {}): GameState {
  return {
    player: { totalDecisions: 0, contractsCompleted: 0, criminalsSentenced: 0, riotsQuelled: 0, level: 1 },
    factions: [],
    externalMegacities: [],
    diplomaticPacts: [],
    tradeAgreements: [],
    discoveredLore: [],
    discoveredLocationIds: [],
    unlockedTechnologies: [],
    strikeHistory: [],
    resources: { credits: 0 },
    companies: [],
    weeklyChallengesCompleted: 0,
    totalMegaProjectsCompleted: 0,
    totalMissionsSucceeded: 0,
    ...over,
  } as unknown as GameState;
}

describe("firsts.FIRSTS", () => {
  it("has unique ids", () => {
    const ids = FIRSTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every category has at least one entry", () => {
    const cats = new Set(FIRSTS.map((f) => f.category));
    for (const cat of Object.keys(CATEGORY_LABELS)) {
      expect(cats.has(cat as any)).toBe(true);
    }
  });
});

describe("firsts.evaluateFirsts", () => {
  it("nothing is unlocked on a fresh state", () => {
    const out = evaluateFirsts(emptyState());
    expect(out.every((f) => !f.unlocked)).toBe(true);
  });

  it("first_decision unlocks at totalDecisions >= 1", () => {
    const state = emptyState({ player: { totalDecisions: 1 } as any });
    const out = evaluateFirsts(state).find((f) => f.def.id === "first_decision");
    expect(out?.unlocked).toBe(true);
  });

  it("first_strike_success requires at least one successful strike", () => {
    const failed = emptyState({ strikeHistory: [{ id: "s", success: false } as any] });
    const won = emptyState({ strikeHistory: [{ id: "s", success: true } as any] });
    expect(evaluateFirsts(failed).find((f) => f.def.id === "first_strike_success")?.unlocked).toBe(false);
    expect(evaluateFirsts(won).find((f) => f.def.id === "first_strike_success")?.unlocked).toBe(true);
  });

  it("level milestones use player level", () => {
    const out10 = evaluateFirsts(emptyState({ player: { level: 10 } as any }));
    expect(out10.find((f) => f.def.id === "level_10")?.unlocked).toBe(true);
    expect(out10.find((f) => f.def.id === "level_25")?.unlocked).toBe(false);
  });

  it("first_million_credits triggers at >= 1,000,000 credits", () => {
    const high = emptyState({ resources: { credits: 1_000_000 } as any });
    expect(evaluateFirsts(high).find((f) => f.def.id === "first_million_credits")?.unlocked).toBe(true);
  });

  it("first_mission counts either totalMissionsSucceeded or militaryOverhaul.completedMissions", () => {
    const a = emptyState({ totalMissionsSucceeded: 1 });
    const b = emptyState({ militaryOverhaul: { completedMissions: 2 } as any });
    expect(evaluateFirsts(a).find((f) => f.def.id === "first_mission")?.unlocked).toBe(true);
    expect(evaluateFirsts(b).find((f) => f.def.id === "first_mission")?.unlocked).toBe(true);
  });

  it("first_faction_met requires at least one ACTIVE faction", () => {
    const inactive = emptyState({ factions: [{ id: "f", isActive: false } as any] });
    const active = emptyState({ factions: [{ id: "f", isActive: true } as any] });
    expect(evaluateFirsts(inactive).find((f) => f.def.id === "first_faction_met")?.unlocked).toBe(false);
    expect(evaluateFirsts(active).find((f) => f.def.id === "first_faction_met")?.unlocked).toBe(true);
  });
});

describe("firsts atlas category surveys", () => {
  it("each atlas category has a corresponding discovery first", () => {
    for (const cat of ATLAS_CATEGORIES) {
      const def = FIRSTS.find((f) => f.id === `atlas_category_${cat.id}`);
      expect(def, `missing atlas first for ${cat.id}`).toBeTruthy();
      expect(def?.category).toBe("discovery");
    }
  });

  it("unlocks only when the category id is in atlasCategoryRewardsClaimed", () => {
    const without = emptyState();
    const def = FIRSTS.find((f) => f.id === "atlas_category_mountain");
    expect(def?.check(without)).toBe(false);
    const withClaim = emptyState({ atlasCategoryRewardsClaimed: ["mountain"] } as any);
    expect(def?.check(withClaim)).toBe(true);
  });
});

describe("firsts archetype kill milestones", () => {
  // Pick a known archetype id that exists in FACTION_SIGNATURE_UNITS.
  const archetypeId = "rust_pack_bikers";

  it("the chosen fixture archetype is registered in FACTION_SIGNATURE_UNITS", () => {
    const all = Object.values(FACTION_SIGNATURE_UNITS).flat();
    expect(all.some((u) => u.id === archetypeId)).toBe(true);
  });

  it("every signature archetype has a first-kill and 100-kill entry", () => {
    const ids = new Set<string>();
    for (const list of Object.values(FACTION_SIGNATURE_UNITS)) {
      for (const u of list) ids.add(u.id);
    }
    for (const id of ids) {
      const firstKill = FIRSTS.find((f) => f.id === `first_kill_archetype_${id}`);
      const century = FIRSTS.find((f) => f.id === `hundred_kills_archetype_${id}`);
      expect(firstKill, `missing first-kill first for ${id}`).toBeTruthy();
      expect(century, `missing 100-kill first for ${id}`).toBeTruthy();
      expect(firstKill?.category).toBe("military");
      expect(century?.category).toBe("military");
    }
  });

  it("titles use archetypeDisplayName for the chosen archetype", () => {
    const name = archetypeDisplayName(archetypeId);
    const firstKill = FIRSTS.find((f) => f.id === `first_kill_archetype_${archetypeId}`);
    const century = FIRSTS.find((f) => f.id === `hundred_kills_archetype_${archetypeId}`);
    expect(firstKill?.title).toBe(`First ${name} Down`);
    expect(century?.title).toBe(`${name}: Century Mark`);
  });

  it("both entries are locked at 0 kills", () => {
    const state = emptyState({ combat: { enemiesDefeatedByArchetype: {} } } as any);
    const firstKill = FIRSTS.find((f) => f.id === `first_kill_archetype_${archetypeId}`);
    const century = FIRSTS.find((f) => f.id === `hundred_kills_archetype_${archetypeId}`);
    expect(firstKill?.check(state)).toBe(false);
    expect(century?.check(state)).toBe(false);
  });

  it("first-kill unlocks at 1 kill and century stays locked", () => {
    const state = emptyState({
      combat: { enemiesDefeatedByArchetype: { [archetypeId]: 1 } },
    } as any);
    const firstKill = FIRSTS.find((f) => f.id === `first_kill_archetype_${archetypeId}`);
    const century = FIRSTS.find((f) => f.id === `hundred_kills_archetype_${archetypeId}`);
    expect(firstKill?.check(state)).toBe(true);
    expect(century?.check(state)).toBe(false);
  });

  it("century mark unlocks at exactly 100 kills", () => {
    const just_under = emptyState({
      combat: { enemiesDefeatedByArchetype: { [archetypeId]: 99 } },
    } as any);
    const at_100 = emptyState({
      combat: { enemiesDefeatedByArchetype: { [archetypeId]: 100 } },
    } as any);
    const century = FIRSTS.find((f) => f.id === `hundred_kills_archetype_${archetypeId}`);
    expect(century?.check(just_under)).toBe(false);
    expect(century?.check(at_100)).toBe(true);
  });

  it("kills against another archetype do not unlock this one's firsts", () => {
    const state = emptyState({
      combat: { enemiesDefeatedByArchetype: { some_other_archetype: 500 } },
    } as any);
    const firstKill = FIRSTS.find((f) => f.id === `first_kill_archetype_${archetypeId}`);
    const century = FIRSTS.find((f) => f.id === `hundred_kills_archetype_${archetypeId}`);
    expect(firstKill?.check(state)).toBe(false);
    expect(century?.check(state)).toBe(false);
  });
});

describe("firsts.countUnlocked", () => {
  it("returns 0 for an empty state", () => {
    const c = countUnlocked(emptyState());
    expect(c.unlocked).toBe(0);
    expect(c.total).toBe(FIRSTS.length);
  });

  it("counts unlocked firsts", () => {
    const state = emptyState({
      player: { totalDecisions: 1, contractsCompleted: 1, level: 10 } as any,
      unlockedTechnologies: ["t"],
    });
    const c = countUnlocked(state);
    expect(c.unlocked).toBeGreaterThan(0);
  });
});

describe("firsts.diffNewlyUnlockedFirsts", () => {
  it("returns nothing when state is unchanged", () => {
    const state = emptyState({ player: { totalDecisions: 1 } as any });
    const prev = unlockedFirstIds(state);
    expect(diffNewlyUnlockedFirsts(prev, state)).toEqual([]);
  });

  it("returns only firsts that flipped from locked to unlocked", () => {
    const before = emptyState();
    const prev = unlockedFirstIds(before);
    const after = emptyState({ player: { totalDecisions: 1 } as any });
    const newly = diffNewlyUnlockedFirsts(prev, after);
    const ids = newly.map((f) => f.id);
    expect(ids).toContain("first_decision");
  });

  it("does not re-emit firsts that were already unlocked", () => {
    const start = emptyState({ player: { totalDecisions: 1 } as any });
    const prev = unlockedFirstIds(start);
    const next = emptyState({
      player: { totalDecisions: 1, contractsCompleted: 1 } as any,
    });
    const newly = diffNewlyUnlockedFirsts(prev, next);
    const ids = newly.map((f) => f.id);
    expect(ids).not.toContain("first_decision");
    expect(ids).toContain("first_contract");
  });
});

describe("firsts.diffNewlyUnlockedFirsts archetype kill toast bridge", () => {
  // Non-`gangs` faction signature unit so cross-faction archetypes are
  // exercised by the toast bridge as well.
  const archetypeId = "tumor_brutes";

  it("the chosen non-gangs archetype is registered under a non-gangs faction", () => {
    expect(FACTION_SIGNATURE_UNITS.mutants.some((u) => u.id === archetypeId)).toBe(true);
    expect(FACTION_SIGNATURE_UNITS.gangs.some((u) => u.id === archetypeId)).toBe(false);
  });

  it("walks 0 → 1 → 100 kills and only emits each milestone once", () => {
    const firstKillId = `first_kill_archetype_${archetypeId}`;
    const centuryId = `hundred_kills_archetype_${archetypeId}`;

    const at0 = emptyState({
      combat: { enemiesDefeatedByArchetype: { [archetypeId]: 0 } },
    } as any);
    const at1 = emptyState({
      combat: { enemiesDefeatedByArchetype: { [archetypeId]: 1 } },
    } as any);
    const at100 = emptyState({
      combat: { enemiesDefeatedByArchetype: { [archetypeId]: 100 } },
    } as any);

    // 0 kills → nothing fires for this archetype.
    let prev = unlockedFirstIds(at0);
    expect(prev.has(firstKillId)).toBe(false);
    expect(prev.has(centuryId)).toBe(false);

    // 0 → 1 kills: first-kill toast fires, century stays locked.
    let newly = diffNewlyUnlockedFirsts(prev, at1);
    let ids = newly.map((f) => f.id);
    expect(ids).toContain(firstKillId);
    expect(ids).not.toContain(centuryId);
    const firstKillDef = newly.find((f) => f.id === firstKillId);
    expect(firstKillDef?.category).toBe("military");
    expect(firstKillDef?.title).toBe(`First ${archetypeDisplayName(archetypeId)} Down`);

    // Re-evaluating the same state must not re-emit the toast.
    prev = unlockedFirstIds(at1);
    expect(diffNewlyUnlockedFirsts(prev, at1).map((f) => f.id)).not.toContain(firstKillId);

    // 1 → 100 kills: century-mark toast fires, first-kill is not re-emitted.
    newly = diffNewlyUnlockedFirsts(prev, at100);
    ids = newly.map((f) => f.id);
    expect(ids).toContain(centuryId);
    expect(ids).not.toContain(firstKillId);
    const centuryDef = newly.find((f) => f.id === centuryId);
    expect(centuryDef?.category).toBe("military");
    expect(centuryDef?.title).toBe(`${archetypeDisplayName(archetypeId)}: Century Mark`);

    // Re-evaluating the post-century state again must emit nothing for this archetype.
    prev = unlockedFirstIds(at100);
    const finalNewly = diffNewlyUnlockedFirsts(prev, at100).map((f) => f.id);
    expect(finalNewly).not.toContain(firstKillId);
    expect(finalNewly).not.toContain(centuryId);
  });
});

describe("firsts.groupByCategory", () => {
  it("returns one bucket per category, all keys present", () => {
    const grouped = groupByCategory(evaluateFirsts(emptyState()));
    for (const cat of Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]) {
      expect(Array.isArray(grouped[cat])).toBe(true);
    }
  });

  it("the sum across categories equals total firsts", () => {
    const grouped = groupByCategory(evaluateFirsts(emptyState()));
    const sum = Object.values(grouped).reduce((a, arr) => a + arr.length, 0);
    expect(sum).toBe(FIRSTS.length);
  });
});

import { describe, expect, it } from "vitest";

import {
  FACTION_SIGNATURE_UNITS,
  HOSTILE_RAID_TEMPLATES,
  generateFactionComposition,
  computeArchetypeLosses,
} from "@/engine/combatData";
import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import { sanitizeState } from "@/engine/sanitizer";
import type { BattleLogEntry, GameState } from "@/engine/types";

/**
 * Cross-cutting integrity tests for the faction-flavored combat data
 * added across Tasks #222–#240. These guard the seams between the
 * engine's hostile raid catalog, the per-faction archetype rosters,
 * the persisted lifetime tally, and the Defense-tab faction chip
 * filter list.
 */

// Ground-truth list of factionSource buckets used by the Defense tab
// chip row. Mirrors KILL_FACTION_FILTERS in app/(game)/military.tsx —
// kept in this engine-side test on purpose so a drift between the UI
// chip list and the engine's emitted factionSource keys breaks here
// instead of silently hiding kills under "All".
const UI_FACTION_FILTER_KEYS = [
  "gangs",
  "mutants",
  "raiders",
  "corporations",
  "cults",
  "rival_cities",
  "insurgents",
  "pirates",
];

describe("faction data integrity (engine ↔ UI ↔ persistence)", () => {
  it("every HOSTILE_RAID_TEMPLATES factionSource has a roster in FACTION_SIGNATURE_UNITS", () => {
    for (const tpl of HOSTILE_RAID_TEMPLATES) {
      const roster = FACTION_SIGNATURE_UNITS[tpl.factionSource];
      expect(
        roster,
        `raid template "${tpl.id}" emits factionSource "${tpl.factionSource}" with no roster in FACTION_SIGNATURE_UNITS`,
      ).toBeDefined();
      expect(roster!.length, `roster for "${tpl.factionSource}" is empty`).toBeGreaterThan(0);
    }
  });

  it("every FACTION_SIGNATURE_UNITS faction is reachable by a raid template (no orphan rosters)", () => {
    const emittedFactions = new Set(HOSTILE_RAID_TEMPLATES.map((t) => t.factionSource));
    for (const faction of Object.keys(FACTION_SIGNATURE_UNITS)) {
      expect(
        emittedFactions.has(faction),
        `faction roster "${faction}" exists but no raid template ever spawns it (dead data)`,
      ).toBe(true);
    }
  });

  it("UI faction filter chip list matches the engine's set of factionSource keys exactly", () => {
    const engineFactions = new Set(HOSTILE_RAID_TEMPLATES.map((t) => t.factionSource));
    const uiFactions = new Set(UI_FACTION_FILTER_KEYS);

    for (const f of engineFactions) {
      expect(uiFactions.has(f), `engine emits factionSource "${f}" but UI filter chip is missing`).toBe(true);
    }
    for (const f of uiFactions) {
      expect(engineFactions.has(f), `UI exposes filter chip "${f}" but no raid template ever emits it`).toBe(true);
    }
  });

  it("every faction can produce a non-empty composition that allocates losses to its own roster", () => {
    for (const faction of Object.keys(FACTION_SIGNATURE_UNITS)) {
      const composition = generateFactionComposition(`int-${faction}`, 1, faction, 50);
      const ids = Object.keys(composition);
      expect(ids.length, `generateFactionComposition produced empty composition for "${faction}"`).toBeGreaterThan(0);

      const losses = computeArchetypeLosses(composition, faction, 30);
      const lossIds = Object.keys(losses).filter((id) => (losses[id] ?? 0) > 0);
      expect(lossIds.length, `computeArchetypeLosses produced no allocation for "${faction}"`).toBeGreaterThan(0);

      const rosterIds = new Set(FACTION_SIGNATURE_UNITS[faction].map((u) => u.id));
      for (const id of lossIds) {
        expect(rosterIds.has(id), `losses for "${faction}" leaked to non-roster archetype "${id}"`).toBe(true);
      }
    }
  });
});

describe("save/load survives a long war: combat tally + battle log", () => {
  // Build a state that has: a populated lifetime kill tally, a packed
  // battle log carrying composition/factionSource/enemyLosses, and the
  // persisted faction chip filters. Then run it through the same
  // sanitizer the load path uses and assert nothing is lost or mangled.
  function stateWithLongWarHistory(): GameState {
    const s = createInitialState();
    if (!s.combat) throw new Error("combat slice missing on initial state");

    // Populated lifetime tally across multiple factions.
    const tally: Record<string, number> = {};
    for (const faction of Object.keys(FACTION_SIGNATURE_UNITS)) {
      const roster = FACTION_SIGNATURE_UNITS[faction];
      for (let i = 0; i < roster.length; i++) {
        tally[roster[i].id] = 7 + i * 3 + (faction.length % 5);
      }
    }

    // A packed battle log mixing raid + non-raid entries with full
    // composition/factionSource/enemyLosses fields.
    const baseTimestamp = (s.combat.battleLog[0]?.timestamp ??
      (s as any).gameDate ?? { year: 2087, day: 1, season: "spring" }) as BattleLogEntry["timestamp"];
    const log: BattleLogEntry[] = Array.from({ length: 25 }, (_, i) => {
      const faction = Object.keys(FACTION_SIGNATURE_UNITS)[i % 8];
      const composition = generateFactionComposition(`hist-${i}`, i + 1, faction, 40 + i);
      const enemyLosses = computeArchetypeLosses(composition, faction, 20);
      return {
        id: `hist-${i}`,
        tick: 1000 + i,
        engagementName: i % 3 === 0 ? `Raid ${i}` : `Skirmish ${i}`,
        victory: true,
        playerCasualties: 5,
        enemyCasualties: 20,
        dominance: 70,
        zoneId: "sector_alpha",
        doctrineUsed: "balanced",
        creditsLooted: 100,
        ammoLooted: 50,
        timestamp: baseTimestamp,
        composition,
        factionSource: faction,
        enemyLosses,
      };
    });

    s.combat = {
      ...s.combat,
      enemiesDefeatedByArchetype: tally,
      battleLog: log,
      killFactionFilter: "cults",
      logFactionFilter: "all",
    } as typeof s.combat;

    return s;
  }

  it("sanitizer preserves the populated archetype tally across all factions", () => {
    const before = stateWithLongWarHistory();
    const tallyBefore = { ...(before.combat!.enemiesDefeatedByArchetype ?? {}) };

    const after = sanitizeState(before);

    const tallyAfter = after.combat!.enemiesDefeatedByArchetype ?? {};
    expect(Object.keys(tallyAfter).sort()).toEqual(Object.keys(tallyBefore).sort());
    for (const [id, count] of Object.entries(tallyBefore)) {
      expect(tallyAfter[id]).toBe(count);
    }
  });

  it("sanitizer preserves persisted faction chip filters when valid", () => {
    const after = sanitizeState(stateWithLongWarHistory());
    expect(after.combat!.killFactionFilter).toBe("cults");
    expect(after.combat!.logFactionFilter).toBe("all");
  });

  it("drops retired factions from legacy saves", () => {
    const state = createInitialState();
    state.factions.push({
      ...state.factions[0],
      id: "corrupt",
      name: "Retired faction",
    });

    const after = sanitizeState(state);

    expect(after.factions.some((faction) => faction.id === "corrupt")).toBe(false);
  });

  it("sanitizer preserves battle-log composition/factionSource/enemyLosses (modal breakdown survives reload)", () => {
    const before = stateWithLongWarHistory();
    const after = sanitizeState(before);

    const log = after.combat!.battleLog ?? [];
    expect(log.length).toBeGreaterThan(0);

    for (const entry of log) {
      // Each historical entry was constructed with these fields — none
      // should be stripped by the sanitizer.
      expect((entry as any).composition, `entry ${entry.id} lost composition`).toBeDefined();
      expect((entry as any).factionSource, `entry ${entry.id} lost factionSource`).toBeDefined();
      expect((entry as any).enemyLosses, `entry ${entry.id} lost enemyLosses`).toBeDefined();
    }
  });

  it("sanitizer drops corrupted tally entries but keeps valid neighbors intact", () => {
    const s = stateWithLongWarHistory();
    const cbt = s.combat! as any;
    // Inject realistic corruption that can show up in a torn save:
    cbt.enemiesDefeatedByArchetype["__bad_negative"] = -3;
    cbt.enemiesDefeatedByArchetype["__bad_zero"] = 0;
    cbt.enemiesDefeatedByArchetype["__bad_nan"] = Number.NaN;
    cbt.enemiesDefeatedByArchetype[123 as any] = 9; // non-string-ish key
    const oversized = "x".repeat(200);
    cbt.enemiesDefeatedByArchetype[oversized] = 5;

    // And corrupt the persisted filters.
    cbt.killFactionFilter = "not_a_faction";
    cbt.logFactionFilter = 42;

    const after = sanitizeState(s);
    const tally = after.combat!.enemiesDefeatedByArchetype ?? {};

    expect(tally["__bad_negative"]).toBeUndefined();
    expect(tally["__bad_zero"]).toBeUndefined();
    expect(tally["__bad_nan"]).toBeUndefined();
    expect(tally[oversized]).toBeUndefined();

    // Faction chips fall back so the UI's `?? "all"` shows everything
    // instead of getting stuck on a chip the player can't see.
    expect(after.combat!.killFactionFilter).toBeUndefined();
    expect(after.combat!.logFactionFilter).toBeUndefined();

    // Valid entries from the original tally must still be there.
    const firstFaction = Object.keys(FACTION_SIGNATURE_UNITS)[0];
    const firstArchetypeId = FACTION_SIGNATURE_UNITS[firstFaction][0].id;
    expect(tally[firstArchetypeId]).toBeGreaterThan(0);
  });
});

describe("lifetime archetype tally only grows from real combat resolutions", () => {
  it("a fresh state's tally only contains keys belonging to known faction rosters after 300 ticks", () => {
    // We don't try to suppress all raids (the engine has scripted /
    // event-driven spawns we can't gate from outside). Instead we
    // assert the tally never gains a key that isn't a real archetype
    // id — i.e. nothing junky leaks in even when raids DO fire.
    let s = createInitialState();
    if (!s.combat) throw new Error("combat slice missing on initial state");
    s.combat = { ...s.combat, enemiesDefeatedByArchetype: {} } as typeof s.combat;

    for (let i = 0; i < 300; i++) {
      s = runTick(s).newState;
    }

    const tally = s.combat!.enemiesDefeatedByArchetype ?? {};
    const knownArchetypes = new Set<string>();
    for (const roster of Object.values(FACTION_SIGNATURE_UNITS)) {
      for (const u of roster) knownArchetypes.add(u.id);
    }

    for (const id of Object.keys(tally)) {
      expect(knownArchetypes.has(id), `tally gained unknown archetype id "${id}" — composition leaked junk`).toBe(true);
      expect(tally[id], `tally for "${id}" is non-positive`).toBeGreaterThan(0);
      expect(Number.isInteger(tally[id]), `tally for "${id}" is not an integer`).toBe(true);
    }
  });
});

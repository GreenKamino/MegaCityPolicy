import { describe, expect, it } from "vitest";

import {
  FACTION_SIGNATURE_UNITS,
  computeArchetypeLosses,
  generateFactionComposition,
} from "@/engine/combatData";
import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import type { ActiveEngagement, GameState } from "@/engine/types";

/**
 * Task #236: Cover non-raid archetype tally with an automated test.
 *
 * Task #229 made auto-skirmish / non-raid engagement resolution feed
 * `combat.enemiesDefeatedByArchetype` (the lifetime "Hostiles defeated to
 * date" trophy wall) the same way raid-repel does. This test drives the
 * full runTick engagement-resolution path with a known composition +
 * factionSource and asserts:
 *
 *   1. The resolved engagement increments the per-archetype tally on
 *      `combat.enemiesDefeatedByArchetype` for the faction's archetypes.
 *   2. The battle log entry written by the same code path carries the
 *      `composition`, `factionSource`, and `enemyLosses` fields used by
 *      the BATTLE LOG modal breakdown.
 */
describe("non-raid engagement archetype tally (Task #236)", () => {
  function stateWithEngagement(): { state: GameState; composition: Record<string, number>; factionSource: string } {
    const s = createInitialState();
    if (!s.combat) throw new Error("combat slice missing on initial state");

    // Give the player a meaningful combat force so resolveEngagement
    // actually produces enemyCasualties > 0 on victory. heavyWeaponsSquads
    // is in COMBAT_UNIT_KEYS and weighted high enough to crush a 50-strength
    // skirmish.
    s.units = { ...s.units, heavyWeaponsSquads: 60 } as typeof s.units;

    const factionSource = "gangs";
    const composition = generateFactionComposition("eng-int-test", 1, factionSource, 50);

    const eng: ActiveEngagement = {
      id: "eng-int-test",
      templateId: "underhive_skirmish",
      name: "Test Skirmish",
      type: "skirmish",
      status: "active",
      unitsCommitted: 30,
      enemyStrength: 50,
      enemyMorale: 40,
      terrainMod: 1.0,
      // ticksRemaining=1 → decrements to 0 → resolves on this tick.
      ticksRemaining: 1,
      zoneId: "sector_alpha",
      doctrineId: "balanced",
      composition,
      factionSource,
    };

    s.combat = {
      ...s.combat,
      activeEngagements: [eng],
      enemiesDefeatedByArchetype: {},
      battleLog: [],
    };

    return { state: s, composition, factionSource };
  }

  it("rolls per-archetype kills into combat.enemiesDefeatedByArchetype", () => {
    const { state, composition, factionSource } = stateWithEngagement();

    const { newState } = runTick(state);

    const eng = (newState.combat!.activeEngagements ?? []).find((e) => e.id === "eng-int-test");
    expect(eng?.status).toBe("resolved");

    const enemyCasualties = eng!.result!.enemyCasualties;
    expect(enemyCasualties, "engagement produced no enemy casualties — adjust fixture").toBeGreaterThan(0);

    const expected = computeArchetypeLosses(composition, factionSource, enemyCasualties);
    const expectedIds = Object.keys(expected).filter((k) => (expected[k] ?? 0) > 0);
    expect(expectedIds.length, "expected at least one archetype to take losses").toBeGreaterThan(0);

    const tally = newState.combat!.enemiesDefeatedByArchetype ?? {};
    const factionIds = new Set(FACTION_SIGNATURE_UNITS[factionSource].map((a) => a.id));
    let totalCounted = 0;
    for (const id of expectedIds) {
      expect(factionIds.has(id), `archetype "${id}" not in "${factionSource}" roster`).toBe(true);
      expect(tally[id]).toBe(expected[id]);
      totalCounted += tally[id]!;
    }
    expect(totalCounted).toBeGreaterThan(0);
  });

  it("writes a battle log entry carrying composition, factionSource, and enemyLosses", () => {
    const { state, composition, factionSource } = stateWithEngagement();

    const { newState } = runTick(state);

    const log = newState.combat!.battleLog ?? [];
    const entry = log.find((b) => b.id.includes("eng-int-test"));
    expect(entry, "no battle log entry written for the resolved engagement").toBeDefined();

    expect(entry!.composition).toEqual(composition);
    expect(entry!.factionSource).toBe(factionSource);
    expect(entry!.enemyLosses).toBeDefined();

    const expected = computeArchetypeLosses(composition, factionSource, entry!.enemyCasualties);
    expect(entry!.enemyLosses).toEqual(expected);
  });
});

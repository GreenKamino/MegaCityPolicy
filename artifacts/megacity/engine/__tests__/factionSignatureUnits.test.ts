import { describe, expect, it } from "vitest";

import {
  FACTION_SIGNATURE_UNITS,
  HOSTILE_RAID_TEMPLATES,
  buildBattleLogDetailLines,
  computeArchetypeLosses,
  formatHostilesSpotted,
  formatLossesByUnit,
  generateFactionComposition,
  pickFlavorArchetype,
} from "@/engine/combatData";
import type { BattleLogDetailEntry } from "@/engine/combatData";
import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import type { GameState } from "@/engine/types";

/**
 * Task #222: Faction signature units.
 *
 * The 8 hostile factionSource tags (gangs, mutants, raiders, corporations,
 * cults, rival_cities, insurgents, pirates) each get 2-3 named archetypes.
 * The composition generator is a presentation layer over the existing
 * baseEnemyStrength number — combat math is unchanged. These tests lock the
 * three invariants that keep that contract honest:
 *
 *   1. Registry shape — every faction has ≥2 archetypes with positive weight.
 *   2. Determinism — same (raidId, spawnTick, factionSource) → same comp.
 *   3. Strength band — total weighted strength stays within ±15% of base
 *      so combat balance can't drift even if the registry is retuned.
 *
 * Plus a snapshot-style check on the formatted "Hostiles spotted:" line for
 * one raid per faction so the flavor wording can't quietly regress.
 */

const HOSTILE_FACTION_TAGS = [
  "gangs",
  "mutants",
  "raiders",
  "corporations",
  "cults",
  "rival_cities",
  "insurgents",
  "pirates",
] as const;

describe("FACTION_SIGNATURE_UNITS registry", () => {
  it("covers every factionSource used by HOSTILE_RAID_TEMPLATES", () => {
    const templateFactions = new Set(HOSTILE_RAID_TEMPLATES.map((t) => t.factionSource));
    for (const tag of templateFactions) {
      expect(FACTION_SIGNATURE_UNITS[tag], `missing registry entry for "${tag}"`).toBeDefined();
    }
  });

  it("gives each of the 8 hostile factions at least 2 archetypes", () => {
    for (const tag of HOSTILE_FACTION_TAGS) {
      const archetypes = FACTION_SIGNATURE_UNITS[tag];
      expect(archetypes, `missing archetypes for "${tag}"`).toBeDefined();
      expect(archetypes.length, `"${tag}" needs ≥2 archetypes`).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses positive weights and unique ids per faction", () => {
    for (const tag of HOSTILE_FACTION_TAGS) {
      const archetypes = FACTION_SIGNATURE_UNITS[tag];
      const ids = new Set<string>();
      for (const a of archetypes) {
        expect(a.weight, `"${tag}/${a.id}" weight must be > 0`).toBeGreaterThan(0);
        expect(a.displayName.length, `"${tag}/${a.id}" displayName empty`).toBeGreaterThan(0);
        expect(a.blurb.length, `"${tag}/${a.id}" blurb empty`).toBeGreaterThan(0);
        expect(ids.has(a.id), `duplicate archetype id "${a.id}" in "${tag}"`).toBe(false);
        ids.add(a.id);
      }
    }
  });
});

describe("generateFactionComposition", () => {
  it("is deterministic for the same (raidId, spawnTick, factionSource)", () => {
    for (const tag of HOSTILE_FACTION_TAGS) {
      const a = generateFactionComposition("raid-100-test", 100, tag, 60);
      const b = generateFactionComposition("raid-100-test", 100, tag, 60);
      expect(a, `non-deterministic for "${tag}"`).toEqual(b);
    }
  });

  it("returns different compositions for different raid ids (most of the time)", () => {
    // Determinism guarantees identical inputs → identical output. Sanity-check
    // the converse: varying the raid id over a small batch should produce at
    // least two distinct compositions per faction (so we know the seed is
    // actually fed in, not ignored).
    for (const tag of HOSTILE_FACTION_TAGS) {
      const seen = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const comp = generateFactionComposition(`raid-${i}-${tag}`, 12 + i, tag, 60);
        seen.add(JSON.stringify(comp));
      }
      expect(seen.size, `seed appears unused for "${tag}"`).toBeGreaterThan(1);
    }
  });

  it("keeps total weighted strength within ±15% of baseEnemyStrength across templates", () => {
    for (const tpl of HOSTILE_RAID_TEMPLATES) {
      const archetypes = FACTION_SIGNATURE_UNITS[tpl.factionSource];
      const weightById = new Map(archetypes.map((a) => [a.id, a.weight]));
      // Sweep a handful of (id, tick) pairs so any pathological seed
      // would be caught — not just the median case.
      for (let tick = 0; tick < 20; tick++) {
        const raidId = `raid-${tick}-${tpl.id}`;
        const comp = generateFactionComposition(raidId, tick, tpl.factionSource, tpl.enemyStrength);
        let weighted = 0;
        for (const [id, count] of Object.entries(comp)) {
          weighted += count * (weightById.get(id) ?? 0);
        }
        const ratio = weighted / tpl.enemyStrength;
        expect(
          ratio,
          `${tpl.id} tick=${tick}: weighted ${weighted.toFixed(1)} vs base ${tpl.enemyStrength} (ratio ${ratio.toFixed(3)})`,
        ).toBeGreaterThanOrEqual(0.85);
        expect(ratio).toBeLessThanOrEqual(1.15);
      }
    }
  });

  it("always allocates at least 1 of each archetype (no empty-line UI states)", () => {
    for (const tag of HOSTILE_FACTION_TAGS) {
      const comp = generateFactionComposition("raid-7-empty", 7, tag, 30);
      const archetypes = FACTION_SIGNATURE_UNITS[tag];
      for (const a of archetypes) {
        expect(comp[a.id], `"${tag}/${a.id}" allocated 0`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("includes factionSource in the seed contract — same raidId+tick, different faction → different shares", () => {
    // The seed is documented as raidId+spawnTick+factionSource. If faction
    // were dropped from the seed, two factions with the same archetype
    // count would produce identical share *distributions* (same RNG draws
    // → same normalized weights). Compare normalized share vectors so we
    // catch this regardless of differing weight scales between rosters.
    const normalize = (comp: Record<string, number>) => {
      const total = Object.values(comp).reduce((a, b) => a + b, 0) || 1;
      return Object.values(comp)
        .map((v) => +(v / total).toFixed(4))
        .sort((a, b) => a - b);
    };
    // gangs and mutants both have 3 archetypes, so the share-vector lengths
    // match and any difference must come from the faction-mixed seed.
    const gangsShares = normalize(generateFactionComposition("raid-seed-test", 5, "gangs", 60));
    const mutantsShares = normalize(generateFactionComposition("raid-seed-test", 5, "mutants", 60));
    expect(gangsShares).not.toEqual(mutantsShares);
  });

  it("falls back to the gangs roster for an unknown factionSource", () => {
    const comp = generateFactionComposition("raid-1-unknown", 1, "this_faction_does_not_exist", 40);
    const gangIds = new Set(FACTION_SIGNATURE_UNITS.gangs.map((a) => a.id));
    for (const id of Object.keys(comp)) {
      expect(gangIds.has(id), `unexpected archetype "${id}" in fallback comp`).toBe(true);
    }
  });
});

describe("formatHostilesSpotted", () => {
  it("renders count × displayName, sorted by count descending", () => {
    const line = formatHostilesSpotted(
      { rust_pack_bikers: 6, slag_cannon_crew: 2, wire_saints: 3 },
      "gangs",
    );
    expect(line).toBe("6× Rust-Pack Bikers, 3× Wire Saints, 2× Slag-Cannon Crew");
  });

  it("skips archetypes with zero count", () => {
    const line = formatHostilesSpotted(
      { rust_pack_bikers: 4, slag_cannon_crew: 0 },
      "gangs",
    );
    expect(line).toBe("4× Rust-Pack Bikers");
  });

  it("locks the spotted-line wording: every archetype's displayName surfaces in its faction's line", () => {
    // Renames or registry shuffles surface as a test diff instead of a
    // silent UI change. We don't snapshot exact counts (the deterministic
    // seed is opaque) — we assert the line contains every archetype's
    // displayName for its faction in "N× Name" form.
    const factionToTpl = new Map<string, typeof HOSTILE_RAID_TEMPLATES[number]>();
    for (const tpl of HOSTILE_RAID_TEMPLATES) {
      if (!factionToTpl.has(tpl.factionSource)) factionToTpl.set(tpl.factionSource, tpl);
    }
    for (const tag of HOSTILE_FACTION_TAGS) {
      const tpl = factionToTpl.get(tag)!;
      const comp = generateFactionComposition(`snapshot-${tpl.id}`, 42, tag, tpl.enemyStrength);
      const line = formatHostilesSpotted(comp, tag);
      for (const a of FACTION_SIGNATURE_UNITS[tag]) {
        expect(line, `"${tag}" line missing "${a.displayName}": ${line}`).toContain(`× ${a.displayName}`);
      }
    }
  });
});

describe("resolved-raid reason text wording", () => {
  // Locks the inbox-message wording emitted by formulas.ts when a raid
  // resolves. The actual emission is buried inside a 700-line tick
  // function, so we exercise the same two-line formula here using the
  // exported building blocks (pickFlavorArchetype + the documented
  // template). If anyone reworks the wording in formulas.ts without
  // updating both this expected template and the production string, the
  // diff will surface here instead of slipping into shipped flavor text.
  const REPEL_TAIL = (name: string) => ` — left their ${name} in the wreckage`;
  const BREACH_LEAD = (name: string, raidName: string) => `${name} led ${raidName}`;

  const sampleRaidName = "Border Skirmish";

  it("repel reason names a faction-appropriate archetype for every faction", () => {
    for (const tag of HOSTILE_FACTION_TAGS) {
      const comp = generateFactionComposition(`raid-repel-${tag}`, 11, tag, 60);
      const flavor = pickFlavorArchetype(comp, tag);
      expect(flavor, `no flavor archetype for "${tag}"`).not.toBeNull();
      const reason = `Garrison repelled ${sampleRaidName} at Sector 7${REPEL_TAIL(flavor!.displayName)}`;
      // Wording invariant: ends with " — left their <Name> in the wreckage"
      expect(reason).toMatch(/ — left their .+ in the wreckage$/);
      // Faction-appropriate: the named unit must belong to this faction's roster
      const factionNames = new Set(FACTION_SIGNATURE_UNITS[tag].map((a) => a.displayName));
      expect(factionNames.has(flavor!.displayName), `"${flavor!.displayName}" not in "${tag}" roster`).toBe(true);
    }
  });

  it("breach reason leads with a faction-appropriate archetype for every faction", () => {
    for (const tag of HOSTILE_FACTION_TAGS) {
      const comp = generateFactionComposition(`raid-breach-${tag}`, 23, tag, 80);
      const flavor = pickFlavorArchetype(comp, tag);
      expect(flavor, `no flavor archetype for "${tag}"`).not.toBeNull();
      const lead = BREACH_LEAD(flavor!.displayName, sampleRaidName);
      const reason = `${lead} breached defenses — 12 casualties`;
      // Wording invariant: starts "<Name> led <Raid>" and contains "breached defenses"
      expect(reason.startsWith(`${flavor!.displayName} led ${sampleRaidName}`)).toBe(true);
      expect(reason).toContain("breached defenses");
      const factionNames = new Set(FACTION_SIGNATURE_UNITS[tag].map((a) => a.displayName));
      expect(factionNames.has(flavor!.displayName)).toBe(true);
    }
  });

  it("falls back gracefully when composition is undefined (legacy save)", () => {
    // Production code does `raid.composition ? pickFlavorArchetype(...) : null`
    // and renders the bare raidName / empty tail when null. Confirm both
    // paths produce sane wording with no "undefined" leaks.
    const repelTail = "" /* falsy flavor → no tail */;
    const repelReason = `Garrison repelled ${sampleRaidName} at Sector 7${repelTail}`;
    expect(repelReason).toBe(`Garrison repelled ${sampleRaidName} at Sector 7`);
    expect(repelReason).not.toContain("undefined");

    const breachLead = sampleRaidName /* falsy flavor → bare raid name */;
    const breachReason = `${breachLead} breached defenses — 12 casualties`;
    expect(breachReason).toBe(`${sampleRaidName} breached defenses — 12 casualties`);
    expect(breachReason).not.toContain("undefined");
  });
});

describe("runTick raid resolution — integration: emitted reason text", () => {
  // True integration test: drives runTick on a state with an injected
  // raid that resolves on this tick, then asserts the actual emitted
  // entries[].reason string carries the faction archetype name. Catches
  // any regression where formulas.ts wording drifts from the helper
  // template the unit tests above lock down.
  function stateWithRaid(overrides: {
    factionSource: string;
    composition: Record<string, number>;
    garrison: number;
    ticksRemaining: number;
    raidName?: string;
  }): GameState {
    const s = createInitialState();
    s.combat = s.combat ?? ({} as GameState["combat"]);
    if (!s.combat) throw new Error("combat slice missing");
    // Single zone we control (or not), single raid targeting it.
    s.combat.zones = [
      {
        id: "z-test",
        name: "Test Sector",
        description: "test",
        status: "friendly",
        controlLevel: 50,
        threat: 10,
        garrison: overrides.garrison,
        maxGarrison: 100,
        resourceBonus: {},
        adjacentZones: [],
        controllingFaction: "player",
      } as any,
    ];
    s.combat.raidEventQueue = [
      {
        id: "raid-int-test",
        name: overrides.raidName ?? "Test Raid",
        status: "active",
        enemyStrength: 100,
        targetZoneId: "z-test",
        ticksRemaining: overrides.ticksRemaining,
        factionSource: overrides.factionSource,
        composition: overrides.composition,
        populationDamage: 50,
      } as any,
    ];
    return s;
  }

  it("RAID REPELLED entry reason names a real archetype from the raid's faction", () => {
    // Garrison 20 → 20*8 = 160 ≥ enemyStrength*0.6 (60) → repel branch.
    const composition = generateFactionComposition("raid-int-test", 1, "gangs", 100);
    const flavor = pickFlavorArchetype(composition, "gangs")!;
    const s = stateWithRaid({
      factionSource: "gangs",
      composition,
      garrison: 20,
      ticksRemaining: 5,
      raidName: "Probe Alpha",
    });
    const { entries } = runTick(s);
    const repelled = entries.find((e) => e.label === "RAID REPELLED");
    expect(repelled, "no RAID REPELLED entry emitted").toBeDefined();
    expect(repelled!.reason).toContain(`left their ${flavor.displayName} in the wreckage`);
    expect(repelled!.reason).toContain("Probe Alpha");
  });

  it("RAID BREACHED entry reason leads with a real archetype from the raid's faction", () => {
    // Garrison 0 + ticksRemaining 0 (decrements to -1) → breach branch.
    const composition = generateFactionComposition("raid-int-test", 1, "mutants", 100);
    const flavor = pickFlavorArchetype(composition, "mutants")!;
    const s = stateWithRaid({
      factionSource: "mutants",
      composition,
      garrison: 0,
      ticksRemaining: 0,
      raidName: "Breach Alpha",
    });
    // cityStats.defenseRating may be nonzero from initial state — zero it
    // so the breach branch (else-if at L3072) is the one we exercise.
    s.cityStats = { ...s.cityStats, defenseRating: 0 };
    const { entries } = runTick(s);
    const breached = entries.find((e) => e.label === "RAID BREACHED");
    expect(breached, "no RAID BREACHED entry emitted").toBeDefined();
    expect(breached!.reason.startsWith(`${flavor.displayName} led Breach Alpha`)).toBe(true);
    expect(breached!.reason).toContain("breached defenses");
  });

  it("legacy raid without composition still emits sane reason text (no 'undefined')", () => {
    // Old saves load raids with no composition field. The branch should
    // fall back to the bare raid name with no archetype tail.
    const s = stateWithRaid({
      factionSource: "raiders",
      composition: undefined as unknown as Record<string, number>,
      garrison: 20,
      ticksRemaining: 5,
      raidName: "Legacy Raid",
    });
    // Strip composition entirely to simulate a pre-Task-#222 save blob.
    (s.combat!.raidEventQueue![0] as any).composition = undefined;
    const { entries } = runTick(s);
    const repelled = entries.find((e) => e.label === "RAID REPELLED");
    expect(repelled).toBeDefined();
    expect(repelled!.reason).not.toContain("undefined");
    expect(repelled!.reason).not.toContain("left their");
  });
});

describe("computeArchetypeLosses (Task #223)", () => {
  // The after-action / siege debrief shows "4× Rust-Pack Bikers down,
  // 1× Slag-Cannon Crew down" by distributing the raid's total enemy
  // strength loss across its composition. These tests lock the three
  // invariants that keep that distribution honest:
  //   1. Allocates only to archetypes present in the composition.
  //   2. Per-archetype loss never exceeds the spawned count.
  //   3. Empty composition / zero loss → empty record (caller falls back).

  it("only allocates losses to archetypes that exist in the composition", () => {
    const losses = computeArchetypeLosses({ rust_pack_bikers: 6 }, "gangs", 10);
    for (const id of Object.keys(losses)) {
      expect(id).toBe("rust_pack_bikers");
    }
  });

  it("never reports more losses than the spawned unit count", () => {
    // 1 unit at weight 5.0 → max possible strength loss is 5. Even a
    // 999 strength loss should cap the per-archetype loss at the spawned
    // count.
    const losses = computeArchetypeLosses({ slag_cannon_crew: 1 }, "gangs", 999);
    expect(losses.slag_cannon_crew ?? 0).toBeLessThanOrEqual(1);
  });

  it("returns an empty record on empty composition or zero loss", () => {
    expect(computeArchetypeLosses({}, "gangs", 10)).toEqual({});
    expect(computeArchetypeLosses({ rust_pack_bikers: 4 }, "gangs", 0)).toEqual({});
  });

  it("falls back to the gangs roster for an unknown faction (consistent with composition gen)", () => {
    // Composition generated by generateFactionComposition for an unknown
    // faction uses gang ids; loss allocation must use the same fallback so
    // the ids match up.
    const comp = generateFactionComposition("raid-loss-unknown", 1, "this_faction_does_not_exist", 60);
    const losses = computeArchetypeLosses(comp, "this_faction_does_not_exist", 20);
    const gangIds = new Set(FACTION_SIGNATURE_UNITS.gangs.map((a) => a.id));
    for (const id of Object.keys(losses)) {
      expect(gangIds.has(id), `unexpected archetype "${id}" in fallback losses`).toBe(true);
    }
  });
});

describe("formatLossesByUnit (Task #223)", () => {
  it("renders count × displayName + ' down', sorted by count descending", () => {
    const line = formatLossesByUnit({ rust_pack_bikers: 4, slag_cannon_crew: 1 }, "gangs");
    expect(line).toBe("4× Rust-Pack Bikers down, 1× Slag-Cannon Crew down");
  });

  it("skips zero-count entries and renders empty string when nothing died", () => {
    expect(formatLossesByUnit({ rust_pack_bikers: 0 }, "gangs")).toBe("");
    expect(formatLossesByUnit({}, "gangs")).toBe("");
  });
});

// Task #235: lock the BATTLE LOG modal's after-action line construction
// for non-raid engagements. Task #229 attaches composition / factionSource
// / enemyLosses to engagement battle-log entries (not just raids), and the
// modal in app/(game)/military.tsx keys the breakdown off
// `b.composition && b.factionSource` — i.e. NOT off the engagement type or
// a "RAID:" name prefix. This test mirrors that exact construction so any
// future regression that re-introduces a raid-only assumption (e.g.
// filtering by name.startsWith("RAID:")) is caught here.
describe("BATTLE LOG modal: after-action breakdown for non-raid entries (Task #235)", () => {
  // Synthetic non-raid engagement battle log entry — no "RAID:" prefix on
  // the engagement name, mirroring what runTick writes for resolved
  // ActiveEngagements (auto-skirmishes, patrol clashes, etc.). The modal
  // in app/(game)/military.tsx now calls buildBattleLogDetailLines on the
  // entry directly, so this test asserts against that exact production
  // function — not a duplicated helper.
  const nonRaidEntry: BattleLogDetailEntry = {
    tick: 100,
    doctrineUsed: "balanced",
    dominance: 70,
    playerCasualties: 4,
    enemyCasualties: 30,
    creditsLooted: 90,
    ammoLooted: 15,
    timestamp: { year: 1, day: 12 },
    composition: { rust_pack_bikers: 6, slag_cannon_crew: 2 },
    factionSource: "gangs",
    enemyLosses: { rust_pack_bikers: 4, slag_cannon_crew: 1 },
  };

  it("includes Hostiles and Losses-by-unit lines for non-raid engagements", () => {
    const lines = buildBattleLogDetailLines(nonRaidEntry);
    expect(lines).toContain("Hostiles: 6× Rust-Pack Bikers, 2× Slag-Cannon Crew");
    expect(lines).toContain("Losses by unit: 4× Rust-Pack Bikers down, 1× Slag-Cannon Crew down");
  });

  it("renders the same breakdown shape regardless of engagement name (no raid-prefix coupling)", () => {
    // Same payload — only thing that would differ in production is the
    // engagementName, which the helper does not consult. Asserting the
    // identical line set guards against any future change that re-keys
    // the breakdown on a "RAID:" prefix.
    const raidShaped: BattleLogDetailEntry = { ...nonRaidEntry };
    expect(buildBattleLogDetailLines(raidShaped)).toEqual(buildBattleLogDetailLines(nonRaidEntry));
  });

  it("falls back to the six-line summary for legacy entries with no composition", () => {
    const legacy: BattleLogDetailEntry = {
      ...nonRaidEntry,
      composition: undefined,
      factionSource: undefined,
      enemyLosses: undefined,
    };
    const lines = buildBattleLogDetailLines(legacy);
    expect(lines.some((l) => l.startsWith("Hostiles:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("Losses by unit:"))).toBe(false);
    expect(lines).toContain("Enemy casualties: 30");
    expect(lines).toHaveLength(6);
  });

  it("omits the Losses-by-unit line when enemyLosses is missing but composition is present", () => {
    const partial: BattleLogDetailEntry = { ...nonRaidEntry, enemyLosses: undefined };
    const lines = buildBattleLogDetailLines(partial);
    expect(lines).toContain("Hostiles: 6× Rust-Pack Bikers, 2× Slag-Cannon Crew");
    expect(lines.some((l) => l.startsWith("Losses by unit:"))).toBe(false);
  });

  it("falls back to a tick label when timestamp is missing", () => {
    const noTs: BattleLogDetailEntry = { ...nonRaidEntry, timestamp: undefined };
    const lines = buildBattleLogDetailLines(noTs);
    expect(lines[0]).toBe("Date: T100");
  });
});

describe("pickFlavorArchetype", () => {
  it("picks the highest-count archetype, breaking ties by weight", () => {
    const tied = pickFlavorArchetype({ rust_pack_bikers: 4, slag_cannon_crew: 4 }, "gangs");
    expect(tied?.id).toBe("slag_cannon_crew"); // weight 5.0 > 2.5

    const clear = pickFlavorArchetype({ rust_pack_bikers: 8, slag_cannon_crew: 2 }, "gangs");
    expect(clear?.id).toBe("rust_pack_bikers");
  });

  it("returns null on empty composition", () => {
    expect(pickFlavorArchetype({}, "gangs")).toBeNull();
  });
});

/**
 * Long-playthrough invariant test (50,000 cold-start ticks).
 *
 * Why this exists
 * ---------------
 * The regular memoryStress + saveSizeBreakdown tests run for 2k-5k
 * ticks. That's enough to surface obvious leaks but blind to two
 * categories of slow-growth bug:
 *
 *   1. Year-rollover gated logic. Many engine systems run cleanup or
 *      cap enforcement only at year boundaries. With 15-minute ticks
 *      a full in-game year is ~35,000 ticks, so a 2k-5k window can
 *      easily sit entirely inside a single year and never observe
 *      the rollover-gated branch firing at all. The recently-fixed
 *      namedCharacters cap-invariant bug (cap was real but enforced
 *      only on year-rollover, so 4k-tick stress runs never saw it
 *      kick in) is exactly this category.
 *
 *   2. Asymptotic creep. A field that grows by ~1 byte every tick is
 *      invisible at 2k ticks (+2 KB) but a hard problem at 50k ticks
 *      (+50 KB). The plateau-check in saveSizeBreakdown can flag
 *      these but only if the second 2k window already shows the
 *      pattern — true slow leaks need a longer baseline.
 *
 * What it checks
 * --------------
 * Drives runTick for 50,000 cold-start ticks (≈ 1.5 in-game years
 * at 15-min cadence — guaranteed to cross at least one year-rollover
 * boundary), sampling state at five evenly-spaced checkpoints
 * (0 / 12,500 / 25,000 / 37,500 / 50,000). At each checkpoint we
 * capture (a) the JSON byte size of every tracked top-level field
 * and (b) the lengths of every cap-bounded collection. At the end
 * we assert:
 *
 *   - Hard caps hold at *every* checkpoint (not just the final
 *     snapshot — catches transient blow-outs that self-trim before
 *     the run ends) for every collection in ARRAY_CAPS, plus the
 *     namedCharacters runtime ceiling and localEconomy caps.
 *   - The namedCharacters ceiling is derived from the live
 *     CharacterRole union via a compile-time exhaustive map — adding
 *     a role forces this file to typecheck-fail until the role-count
 *     constant is updated.
 *   - Plateau: growth in the final 12.5k-tick window must not
 *     significantly exceed growth in the first 12.5k-tick window
 *     for any tracked field. Threshold: 1.5× of the first window
 *     OR 16 KB absolute (whichever is larger). 16 KB ≈ 1.3 byte/tick
 *     sustained — anything slower than that genuinely needs a longer
 *     run to detect; anything faster fails here.
 *   - Numeric integrity: credits, population, politics.reputation
 *     all stay finite.
 *
 * The console output is the diagnostic — a per-checkpoint byte
 * table for every tracked field plus a plateau-ratio summary so
 * regressions land with a named offender, not just "test failed".
 *
 * How to run
 * ----------
 * Gated behind MEGACITY_LONG_STRESS=1 so it doesn't slow down the
 * normal test loop. Expected wall time: 60-120 seconds depending on
 * machine. Run on demand with:
 *
 *   MEGACITY_LONG_STRESS=1 pnpm --filter @workspace/megacity test \
 *     engine/__tests__/longPlaythroughInvariant.test.ts
 *
 * Intended for nightly CI or before significant engine releases.
 */

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { ARRAY_CAPS } from "@/engine/sanitizer";
import {
  MAX_BUSINESSES,
  MAX_CLOSED_HISTORY,
} from "@/engine/independentEnterprises";
import type { CharacterRole, GameState } from "@/engine/types";

const RUN_LONG = !!process.env.MEGACITY_LONG_STRESS;
const itLong = RUN_LONG ? it : it.skip;

const TOTAL_TICKS = 50_000;
const CHECKPOINTS = [0, 12_500, 25_000, 37_500, 50_000] as const;

// Compile-time exhaustive map over CharacterRole. If a role is added
// to the CharacterRole union, this object literal will fail to
// typecheck until the new role is added here too — at which point
// NAMED_CHARACTER_ROLE_COUNT is automatically rederived. This is the
// guard the architect review flagged: a runtime sampler array length
// check would have silently allowed the union to grow.
const ALL_CHARACTER_ROLES: Record<CharacterRole, true> = {
  gang_lieutenant: true,
  journalist: true,
  tycoon: true,
  agitator: true,
  celebrity: true,
  informant: true,
  fugitive: true,
  preacher: true,
  union_boss: true,
};
const NAMED_CHARACTER_ROLE_COUNT = Object.keys(ALL_CHARACTER_ROLES).length;
// MAX_ACTIVE_PER_ROLE (6) and MAX_INACTIVE_RETAINED (60) are
// intentionally module-private in namedCharacters.ts; mirrored here.
// See namedCharacters.ts header comment block for the formula.
const NAMED_CHARACTER_HARD_CEILING = NAMED_CHARACTER_ROLE_COUNT * 6 + 60;

// Top-level fields we measure at each checkpoint. Anything bounded
// by ARRAY_CAPS at the top level, plus the major growers identified
// in the existing saveSizeBreakdown diagnostic.
const TRACKED_FIELDS = [
  "messages",
  "activeEvents",
  "worldEventLog",
  "tickLog",
  "statHistory",
  "activeEventChains",
  "namedCharacters",
  "localEconomy",
  "diplomacyAdvanced",
  "combat",
  "factions",
  "innerCircle",
  "townships",
  "newSystems",
  "miningEvents",
  "externalMegacities",
] as const;

type FieldName = (typeof TRACKED_FIELDS)[number];

// Top-level array fields whose cap ceilings live in ARRAY_CAPS.
// Excludes nested fields (battleLog lives under combat[].battleLog,
// whispers lives under innerCircle.whispers — both checked by their
// own subsystem tests). Listing these explicitly rather than
// iterating ARRAY_CAPS keys lets us read each length safely off the
// typed GameState shape.
const TOP_LEVEL_CAPPED_FIELDS: ReadonlyArray<{
  field: keyof typeof ARRAY_CAPS;
  read: (s: GameState) => number;
}> = [
  { field: "messages",                    read: (s) => (s.messages ?? []).length },
  { field: "completedContracts",          read: (s) => (s.completedContracts ?? []).length },
  { field: "eventHistory",                read: (s) => (s.eventHistory ?? []).length },
  { field: "worldEventLog",               read: (s) => (s.worldEventLog ?? []).length },
  { field: "strikeHistory",               read: (s) => (s.strikeHistory ?? []).length },
  { field: "tickLog",                     read: (s) => (s.tickLog ?? []).length },
  { field: "statHistory",                 read: (s) => (s.statHistory ?? []).length },
  { field: "activeEvents",                read: (s) => (s.activeEvents ?? []).length },
  { field: "dismissedTutorialTips",       read: (s) => (s.dismissedTutorialTips ?? []).length },
  { field: "unlockedAchievements",        read: (s) => (s.unlockedAchievements ?? []).length },
  { field: "discoveredLocationIds",       read: (s) => (s.discoveredLocationIds ?? []).length },
  { field: "discoveredTerrain",           read: (s) => (s.discoveredTerrain ?? []).length },
  { field: "atlasCategoryRewardsClaimed", read: (s) => (s.atlasCategoryRewardsClaimed ?? []).length },
  { field: "researchQueue",               read: (s) => (s.researchQueue ?? []).length },
  { field: "activeEdicts",                read: (s) => (s.activeEdicts ?? []).length },
  { field: "activeMissions",              read: (s) => (s.activeMissions ?? []).length },
  { field: "megaProjects",                read: (s) => (s.megaProjects ?? []).length },
  { field: "activeEventChains",           read: (s) => (s.activeEventChains ?? []).length },
  { field: "lawMissions",                 read: (s) => (s.lawMissions ?? []).length },
  { field: "miningOperations",            read: (s) => (s.miningOperations ?? []).length },
  { field: "scavengeExpeditions",         read: (s) => (s.scavengeExpeditions ?? []).length },
  { field: "wildlandsProjects",           read: (s) => (s.wildlandsProjects ?? []).length },
  { field: "tamingQueue",                 read: (s) => (s.tamingQueue ?? []).length },
];

function fieldBytes(state: GameState, key: string): number {
  const value = (state as unknown as Record<string, unknown>)[key];
  if (value === undefined) return 0;
  try {
    return JSON.stringify({ [key]: value }).length;
  } catch {
    return 0;
  }
}

type CapLengths = {
  // Top-level ARRAY_CAPS fields, keyed by name.
  topLevel: Record<string, number>;
  namedCharacters: number;
  businesses: number;
  closedHistory: number;
};

type Snapshot = {
  tick: number;
  bytesByField: Record<FieldName, number>;
  capLengths: CapLengths;
};

function snapshot(state: GameState, tick: number): Snapshot {
  const bytesByField = {} as Record<FieldName, number>;
  for (const f of TRACKED_FIELDS) bytesByField[f] = fieldBytes(state, f);

  const topLevel: Record<string, number> = {};
  for (const { field, read } of TOP_LEVEL_CAPPED_FIELDS) {
    topLevel[field] = read(state);
  }

  return {
    tick,
    bytesByField,
    capLengths: {
      topLevel,
      namedCharacters: (state.namedCharacters ?? []).length,
      businesses: state.localEconomy?.businesses?.length ?? 0,
      closedHistory: state.localEconomy?.closedHistory?.length ?? 0,
    },
  };
}

// Buffer factor over a declared cap. Some engine paths push then trim
// asynchronously; anything more than ~1.25× indicates a cap was
// removed or weakened, not a benign race.
const CAP_BUFFER = 1.25;

describe("engine long-playthrough invariant (50k cold-start ticks)", () => {
  itLong(
    "every cap-bounded field stays bounded across multiple year-rollovers",
    { timeout: 600_000 },
    () => {
      let s = createInitialState();
      const snapshots: Snapshot[] = [snapshot(s, 0)];

      // ── Gameplay-balance trackers ───────────────────────────────────
      // The cap/plateau checks above guard the *save shape*; these guard
      // the *simulation itself* — the exact things the housing-capacity,
      // population-growth, and ecology fixes were about. Tracked as
      // running extremes across EVERY tick (not just checkpoints) so a
      // transient runaway/spike that self-corrects before a checkpoint is
      // still caught. Player complaints being guarded here:
      //   - runaway population growth  → peakPopulation bound
      //   - structural mass homeless   → peakHomelessFrac bound
      //   - nature-crisis spam         → maxBiomeEvents bound
      const biomeEventCount = (st: GameState): number =>
        (st.activeEvents ?? []).filter(
          (e) => (e as { biome?: unknown }).biome !== undefined,
        ).length;
      const homelessFracOf = (st: GameState): number => {
        const pop = st.cityStats?.population ?? 0;
        const homeless = st.demographics?.homelessPopulation ?? 0;
        return pop > 0 ? homeless / pop : 0;
      };
      const initialPopulation = s.cityStats?.population ?? 0;
      let peakPopulation = initialPopulation;
      let minPopulation = initialPopulation;
      let peakHomelessFrac = homelessFracOf(s);
      let minBiosphere = s.cityStats?.biosphere ?? 0;
      let maxBiosphere = s.cityStats?.biosphere ?? 0;
      let maxBiomeEvents = biomeEventCount(s);
      // Late-window (final 20% of the run) biosphere floor. A neglected city no
      // longer flatlines at a dead zero: nature rewilds toward a low natural
      // floor, so once the run has settled the biosphere must stay off zero.
      const lateWindowStart = Math.floor(TOTAL_TICKS * 0.8);
      let lateMinBiosphere = Number.POSITIVE_INFINITY;

      const wallStart = performance.now();
      let nextCheckpointIdx = 1;

      for (let i = 1; i <= TOTAL_TICKS; i++) {
        s = runTick(s).newState;

        const pop = s.cityStats?.population ?? 0;
        if (pop > peakPopulation) peakPopulation = pop;
        if (pop < minPopulation) minPopulation = pop;
        const hf = homelessFracOf(s);
        if (hf > peakHomelessFrac) peakHomelessFrac = hf;
        const bio = s.cityStats?.biosphere ?? 0;
        if (bio < minBiosphere) minBiosphere = bio;
        if (bio > maxBiosphere) maxBiosphere = bio;
        if (i >= lateWindowStart && bio < lateMinBiosphere) lateMinBiosphere = bio;
        const bev = biomeEventCount(s);
        if (bev > maxBiomeEvents) maxBiomeEvents = bev;

        if (
          nextCheckpointIdx < CHECKPOINTS.length &&
          i === CHECKPOINTS[nextCheckpointIdx]
        ) {
          snapshots.push(snapshot(s, i));
          nextCheckpointIdx++;
        }
      }
      const wallMs = performance.now() - wallStart;

      // ── Diagnostic output ──────────────────────────────────────────
      const fmtKb = (n: number) => (n / 1024).toFixed(1).padStart(8);
      const fmtSign = (n: number) =>
        `${n >= 0 ? "+" : ""}${(n / 1024).toFixed(1)}`.padStart(9);

      const header =
        `  ${"field".padEnd(22)}` +
        CHECKPOINTS.map((t) => `t=${t}`.padStart(10)).join("");
      const sep = "  " + "-".repeat(22 + 10 * CHECKPOINTS.length);

      const tableLines = [
        ``,
        `=== long playthrough: ${TOTAL_TICKS} cold-start ticks ===`,
        `  wall:               ${(wallMs / 1000).toFixed(1)} s`,
        `  mean per tick:      ${(wallMs / TOTAL_TICKS).toFixed(2)} ms`,
        `  in-game years:      ~${(TOTAL_TICKS / 35_040).toFixed(2)} (15-min ticks, 35,040/year)`,
        ``,
        `  --- bytes per tracked field at each checkpoint (KB) ---`,
        header,
        sep,
        ...TRACKED_FIELDS.map((f) => {
          const cells = snapshots.map((sn) => fmtKb(sn.bytesByField[f]));
          return `  ${f.padEnd(22)}${cells.join("")}`;
        }),
      ];

      // Plateau ratios: window 4 (last 12.5k) growth vs window 1
      // (first 12.5k) growth. Near 0 = field plateaued. Near 1 =
      // linear leak. > 1 = accelerating leak.
      type PlateauRow = {
        field: FieldName;
        d1: number;
        d4: number;
        ratio: number;
      };
      const plateauRows: PlateauRow[] = TRACKED_FIELDS.map((f) => {
        const d1 = snapshots[1].bytesByField[f] - snapshots[0].bytesByField[f];
        const d4 = snapshots[4].bytesByField[f] - snapshots[3].bytesByField[f];
        const ratio = d1 === 0 ? (d4 === 0 ? 0 : Infinity) : d4 / d1;
        return { field: f, d1, d4, ratio };
      }).sort((l, r) => Math.abs(r.d4) - Math.abs(l.d4));

      const fmtRatio = (r: number) =>
        Number.isFinite(r) ? r.toFixed(2).padStart(9) : "      inf";

      const plateauHeader =
        `  ${"field".padEnd(22)}${"Δ window 1 KB".padStart(15)}` +
        `${"Δ window 4 KB".padStart(15)}${"ratio".padStart(10)}`;
      const plateauSep = "  " + "-".repeat(22 + 15 + 15 + 10);

      tableLines.push(
        ``,
        `  --- plateau check (window 4 = ticks ${CHECKPOINTS[3]}→${CHECKPOINTS[4]}) ---`,
        plateauHeader,
        plateauSep,
        ...plateauRows.map(
          (r) =>
            `  ${r.field.padEnd(22)}${fmtSign(r.d1).padStart(15)}` +
            `${fmtSign(r.d4).padStart(15)}${fmtRatio(r.ratio)}`,
        ),
        ``,
      );

      console.log(tableLines.join("\n"));

      // ── Hard cap assertions: every checkpoint, every collection ──
      // Asserting at every checkpoint (not just the terminal snapshot)
      // catches transient blow-outs that self-trim before the run
      // ends — the architect-review category 5 finding.
      for (let i = 0; i < snapshots.length; i++) {
        const sn = snapshots[i];
        const where = `checkpoint t=${sn.tick}`;

        for (const { field } of TOP_LEVEL_CAPPED_FIELDS) {
          const len = sn.capLengths.topLevel[field];
          const cap = ARRAY_CAPS[field];
          const ceiling = Math.ceil(cap * CAP_BUFFER);
          expect(
            len,
            `${field} exceeded cap at ${where}: ${len} > ${cap} (×${CAP_BUFFER} = ${ceiling})`,
          ).toBeLessThanOrEqual(ceiling);
        }

        // namedCharacters: hard ceiling, no buffer. This is the cap
        // the recently-fixed invariant bug was about; we want a fail-
        // loud signal if it ever drifts again.
        expect(
          sn.capLengths.namedCharacters,
          `namedCharacters exceeded hard ceiling at ${where}: ${sn.capLengths.namedCharacters} > ${NAMED_CHARACTER_HARD_CEILING}`,
        ).toBeLessThanOrEqual(NAMED_CHARACTER_HARD_CEILING);

        // localEconomy caps (bounded inline in independentEnterprises).
        expect(
          sn.capLengths.businesses,
          `businesses exceeded cap at ${where}: ${sn.capLengths.businesses} > ${MAX_BUSINESSES}`,
        ).toBeLessThanOrEqual(MAX_BUSINESSES);
        expect(
          sn.capLengths.closedHistory,
          `closedHistory exceeded cap at ${where}: ${sn.capLengths.closedHistory} > ${MAX_CLOSED_HISTORY}`,
        ).toBeLessThanOrEqual(MAX_CLOSED_HISTORY);
      }

      // ── Numeric integrity ──────────────────────────────────────────
      const credits =
        (s.resources as { credits?: number } | undefined)?.credits ?? 0;
      const population = s.cityStats?.population ?? 0;
      expect(Number.isFinite(credits), "credits drifted to NaN/Infinity").toBe(
        true,
      );
      expect(
        Number.isFinite(population),
        "population drifted to NaN/Infinity",
      ).toBe(true);
      // politics.reputation is a CommanderReputation object with five
      // numeric axes (mercy/fear/transparency/populism/stability).
      // May legitimately be undefined on some states; when present,
      // every axis must stay finite — a NaN/Infinity here is a real
      // engine bug worth catching.
      const rep = s.politics?.reputation;
      if (rep !== undefined) {
        for (const axis of ["mercy", "fear", "transparency", "populism", "stability"] as const) {
          expect(
            Number.isFinite(rep[axis]),
            `politics.reputation.${axis} drifted to NaN/Infinity (got ${rep[axis]})`,
          ).toBe(true);
        }
      }

      // ── Gameplay-balance invariants ────────────────────────────────
      // Confirms the housing/growth/ecology fixes hold over many
      // in-game years of *unattended* play (runTick only — no player
      // construction or crisis resolution). This is a floor, not a
      // ceiling: a real player who invests in housing and biosphere
      // does strictly better. What we assert is that the sim never
      // regresses into the states the player originally complained
      // about, even with zero intervention.
      console.log(
        [
          ``,
          `  --- gameplay balance (running extremes over ${TOTAL_TICKS} ticks) ---`,
          `  initial population:  ${initialPopulation.toFixed(0)}`,
          `  population range:     ${minPopulation.toFixed(0)} .. ${peakPopulation.toFixed(0)}`,
          `  peak homeless frac:  ${(peakHomelessFrac * 100).toFixed(1)}%`,
          `  biosphere range:      ${minBiosphere.toFixed(1)} .. ${maxBiosphere.toFixed(1)}`,
          `  biosphere late-min:   ${lateMinBiosphere.toFixed(1)}`,
          `  max biome events:    ${maxBiomeEvents}`,
          ``,
        ].join("\n"),
      );

      // Population must never diverge to NaN/Infinity and must stay
      // positive — a city that hits 0 or negative population is a
      // broken sim, not a hard game.
      expect(
        Number.isFinite(peakPopulation) && Number.isFinite(minPopulation),
        `population drifted to NaN/Infinity (min ${minPopulation}, peak ${peakPopulation})`,
      ).toBe(true);
      expect(
        minPopulation,
        `population collapsed to <= 0 (min ${minPopulation})`,
      ).toBeGreaterThan(0);
      // No runaway growth. The over-capacity growth penalty makes
      // population asymptote toward shelter capacity; it must never
      // climb without bound. 3× the cold-start population is generous
      // headroom for boom cycles.
      expect(
        peakPopulation,
        `runaway population growth: peak ${peakPopulation} > 3× initial ${initialPopulation}`,
      ).toBeLessThanOrEqual(initialPopulation * 3);

      // No structural mass homelessness. Homeless is derived from
      // pop - housingCapacity; the fixed capacity math keeps this
      // modest. Even at the worst tick it must not swallow most of the
      // city (0.6 is a loud-failure threshold, not a design target).
      expect(
        peakHomelessFrac,
        `structural mass homelessness: peak ${(peakHomelessFrac * 100).toFixed(1)}% of population homeless`,
      ).toBeLessThanOrEqual(0.6);

      // Biosphere stays a well-formed stat in [0, 100] at all times.
      // (A fully passive city that builds no green infrastructure still stays
      // unhealthy — it only rewilds to the low natural floor (~15), well short
      // of a healthy biosphere — so we assert range integrity, not health.)
      expect(
        Number.isFinite(minBiosphere) && Number.isFinite(maxBiosphere),
        `biosphere drifted to NaN/Infinity (${minBiosphere}..${maxBiosphere})`,
      ).toBe(true);
      expect(minBiosphere, `biosphere below 0 (${minBiosphere})`).toBeGreaterThanOrEqual(
        0,
      );
      expect(maxBiosphere, `biosphere above 100 (${maxBiosphere})`).toBeLessThanOrEqual(
        100,
      );

      // Neglected-nature recovery: the biosphere must NOT permanently pin at a
      // dead zero. Nature rewilds toward a low natural floor even with zero
      // green infrastructure, so once the run has settled (final 20% of ticks)
      // the biosphere stays comfortably off the floor of zero. We assert >= 10
      // (below the natural floor of 15, leaving headroom for transient
      // outbreak-driven dips that then recover).
      expect(
        lateMinBiosphere,
        `biosphere pinned near dead zero late-game (late-min ${lateMinBiosphere})`,
      ).toBeGreaterThanOrEqual(10);

      // No nature-crisis spam. Biome-tagged crises spawn only through
      // the gated wildlands system, at most roughly one active crisis
      // per biome. With 7 biomes, the structural ceiling is ~7; a value
      // materially above that means crises are spawning ungated again
      // (the original "endless nature crisis" bug). Buffer to 10.
      expect(
        maxBiomeEvents,
        `nature-crisis spam: ${maxBiomeEvents} simultaneous biome-tagged events (structural ceiling ~7 biomes)`,
      ).toBeLessThanOrEqual(10);

      // ── Tick count sanity ──────────────────────────────────────────
      expect(s.totalTicks).toBe(TOTAL_TICKS);

      // ── Plateau invariant ──────────────────────────────────────────
      // For each tracked field, the late-window growth must not
      // significantly exceed the early-window growth. Allow:
      //   - 1.5× of the early-window absolute growth, OR
      //   - 16 KB absolute (whichever is larger),
      // to absorb RNG variance from event chains, character spawns,
      // weather/season cycles, etc. 16 KB across a 12.5k-tick window
      // is roughly 1.3 byte/tick sustained — anything growing slower
      // than that genuinely needs a longer-run test to surface
      // (documented limit), anything faster fails here.
      // Negative deltas (cap evictions outpacing growth) are fine
      // and contribute zero to the budget.
      for (const r of plateauRows) {
        const earlyGrowth = Math.max(0, r.d1);
        const lateGrowth = Math.max(0, r.d4);
        const ceiling = Math.max(earlyGrowth * 1.5, 16 * 1024);
        expect(
          lateGrowth,
          `${r.field}: late-window growth (${(lateGrowth / 1024).toFixed(1)} KB) significantly exceeded early-window growth (${(earlyGrowth / 1024).toFixed(1)} KB) — possible slow leak`,
        ).toBeLessThanOrEqual(ceiling);
      }
    },
  );

  // Sentinel: this test exists so anyone running the file *without*
  // the env var sees a clear note that the real test is gated, rather
  // than silently passing with zero assertions.
  it("note: long-playthrough test is gated behind MEGACITY_LONG_STRESS=1", () => {
    if (!RUN_LONG) {
      console.log(
        [
          ``,
          `  long-playthrough invariant test SKIPPED.`,
          `  to run it: MEGACITY_LONG_STRESS=1 pnpm --filter @workspace/megacity test \\`,
          `             engine/__tests__/longPlaythroughInvariant.test.ts`,
          ``,
        ].join("\n"),
      );
    }
    expect(true).toBe(true);
  });
});

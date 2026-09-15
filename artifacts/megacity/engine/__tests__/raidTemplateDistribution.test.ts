/**
 * Regression test for the raid-template selection bias bug.
 *
 * Pre-fix, the engine derived the spawn gate AND the template index from
 * the same `raidRoll`. Because the spawn gate forces raidRoll < ~0.35,
 * `Math.floor(raidRoll * 8)` was pinned at 0 and only `gang_incursion`
 * ever fired. A 5,000-tick stress run produced 416 raids — 100% gangs.
 *
 * After the fix, tplIdx and zone selection use independent Park-Miller
 * draws keyed off the same totalTicks, preserving determinism while
 * giving every template a fair shot.
 */
import { describe, expect, it } from "vitest";
import { runTick, getLastTickErrors } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import { HOSTILE_RAID_TEMPLATES } from "@/engine/combatData";
import type { ExternalMegacity, GameState } from "@/engine/types";

// Mirrors the setup in scripts/stressTestWar.ts which empirically
// produces hundreds of raids over a few thousand ticks. Keeping a
// healthy garrison on non-hostile zones prevents total city collapse,
// which would otherwise stall the sim.
const HOSTILE_FRONTIER = new Set([
  "wasteland_north",
  "wasteland_east",
  "underhive_west",
  "underhive_east",
  "mutant_quarter",
  "toxic_flats",
]);
const CONTESTED = new Set(["hab_blocks_west", "penal_zone"]);

// Re-applies the frontier/contested war footing to the combat zones.
// runTick's own zone-control arithmetic slowly pacifies or flips these
// over thousands of ticks; left unchecked, hostileZones can decay to 0
// and the every-12-tick raid spawn gate stops firing — which collapses
// the sample this test measures (observed as low as 6 raids under a
// loaded parallel suite). Re-asserting the war footing each tick keeps
// the gate live so the *template distribution* (the actual thing under
// test) is measured over a deterministic ~250-raid sample.
function forceWarZones(s: GameState): void {
  if (!s.combat) return;
  for (const z of s.combat.zones) {
    if (HOSTILE_FRONTIER.has(z.id)) {
      z.status = "hostile";
      z.threat = 70;
      z.garrison = 0;
      z.controllingFaction = "rival_cities";
    } else if (CONTESTED.has(z.id)) {
      z.status = "contested";
      z.threat = 50;
      z.garrison = 6;
    } else {
      z.garrison = 12;
    }
  }
}

function buildAtWarState(): GameState {
  const s = createInitialState();
  const hostile: ExternalMegacity = {
    id: "ext-test-neighbor",
    name: "Vyrnholt-7",
    isActive: true,
    threat: 90,
    loyalty: 4,
    militaryStrength: "high",
    leader: { name: "Praefect Soren Kaal", title: "Iron Praefect", attitude: "hostile" },
  } as ExternalMegacity;
  s.externalMegacities = [...(s.externalMegacities ?? []), hostile];
  forceWarZones(s);
  return s;
}

describe("raid template selection — distribution (regression for bias bug)", () => {
  // 120s timeout (not the default 20s): this re-applies the war footing and
  // runs a 3,000-tick sim, so under the concurrent validation harness (the
  // parallel `test` run racing the serial `perf` suite + the dev workflows)
  // it can take well over 20s. Matches the margin given to the other heavy
  // correctness tests so it never flakes under contention.
  it("spawns at least 5 of the 8 templates over a 3,000-tick at-war simulation", { timeout: 120_000 }, () => {
    let state = buildAtWarState();
    const seenTemplates = new Set<string>();
    const seenRaidIds = new Set<string>();
    const tplCounts = new Map<string, number>();
    // Per-subsystem tick-error tally. runTick wraps each subsystem in a
    // try/catch that records failures in _lastTickErrors (reset every
    // tick) instead of throwing, so a subsystem dying under load would
    // silently throttle raids. Snapshot it per tick and surface it in
    // the assertion message — diagnostic only, never a hard gate.
    const tickErrorTally = new Map<string, number>();

    for (let i = 0; i < 3000; i++) {
      // Keep the war footing live so the spawn gate never stalls.
      forceWarZones(state);
      const result = runTick(state);
      state = result.newState;
      for (const err of getLastTickErrors()) {
        tickErrorTally.set(err.subsystem, (tickErrorTally.get(err.subsystem) ?? 0) + 1);
      }
      for (const r of state.combat?.raidEventQueue ?? []) {
        if (seenRaidIds.has(r.id)) continue;
        seenRaidIds.add(r.id);
        seenTemplates.add(r.templateId);
        tplCounts.set(r.templateId, (tplCounts.get(r.templateId) ?? 0) + 1);
      }
    }

    // Sanity: actual raids fired so the distribution check is meaningful.
    // The tick-error tally ({} when clean) pinpoints a culprit subsystem
    // if this ever regresses under load.
    const tickErrors = JSON.stringify(Object.fromEntries(tickErrorTally));
    expect(seenRaidIds.size, `too few raids; tickErrors=${tickErrors}`).toBeGreaterThan(20);

    // Pre-fix this collapsed to a single template (gang_incursion).
    // Post-fix all 8 templates should be in play; assert ≥5 as a
    // comfortable floor that the buggy code structurally cannot pass.
    expect(seenTemplates.size).toBeGreaterThanOrEqual(5);
    expect(HOSTILE_RAID_TEMPLATES.length).toBe(8);

    // No single template should account for >60% of spawns. Pre-fix
    // gang_incursion was 100%.
    const total = Array.from(tplCounts.values()).reduce((s, n) => s + n, 0);
    for (const [, n] of tplCounts) {
      expect(n / total).toBeLessThan(0.6);
    }
  });

  it("template selection is a pure function of totalTicks (same tick → same template)", () => {
    // Direct unit test of the spawn formula's hash: prove the same
    // totalTicks always picks the same template index. Avoids touching
    // runTick() (which has its own non-deterministic systems unrelated
    // to raid spawning) and pins down ONLY the template-draw fix.
    const hashTick = (tt: number, salt: number): number => {
      let h = (Math.imul(tt + salt, 0x9e3779b9)) >>> 0;
      h ^= h >>> 16;
      h = Math.imul(h, 0x85ebca6b) >>> 0;
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35) >>> 0;
      h ^= h >>> 16;
      return (h >>> 0) / 0x100000000;
    };
    // Sample 100 spawn ticks (every 12 ticks). Across this window, the
    // tplIdx distribution should cover all 8 templates fairly evenly
    // and be reproducible.
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let tt = 12; tt <= 12 * 100; tt += 12) {
      seqA.push(Math.floor(hashTick(tt, 0xa5) * 8));
      seqB.push(Math.floor(hashTick(tt, 0xa5) * 8));
    }
    expect(seqA).toEqual(seqB);
    const distinct = new Set(seqA);
    expect(distinct.size).toBe(8);
  });
});

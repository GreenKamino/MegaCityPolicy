/**
 * Long-term war stress test.
 *
 * Builds an at-war state (hostile neighbour megacity + a wide ring of
 * hostile/contested zones to maximise raid pressure and trip the "under
 * siege" predicate), drives the engine through THOUSANDS of ticks, and
 * prints a war-correspondent-style report covering:
 *
 *   - raid spawn cadence and per-faction breakdown
 *   - repelled vs breached outcomes and casualty totals
 *   - which signature archetypes actually showed up in this war
 *   - siege time-in-state and worst-case breach run
 *   - resources, population, war morale, and unrest over time
 *
 * Run from the repo root with:
 *   pnpm --filter @workspace/megacity exec tsx scripts/stressTestWar.ts
 *
 * Optional env knobs:
 *   TICKS=10000      total ticks to simulate (default 5000 ≈ 208 days)
 *   ZONE_THREAT=80   starting threat level on hostile zones (default 70)
 *   GARRISON=12      garrison per friendly zone (default 12 — moderate)
 */
import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import {
  FACTION_SIGNATURE_UNITS,
  formatHostilesSpotted,
} from "@/engine/combatData";
import { getWarContext, isAtWar } from "@/engine/wartimeEvents";
import type { ExternalMegacity, GameState } from "@/engine/types";

const TICKS = Number(process.env.TICKS ?? 5000);
const ZONE_THREAT = Number(process.env.ZONE_THREAT ?? 70);
const GARRISON = Number(process.env.GARRISON ?? 12);
// SIEGE_MODE=1 re-asserts hostile zones every N ticks to simulate a
// sustained enemy offensive that keeps pushing the frontier back. Without
// this the engine's auto-pacification clears every hostile zone within
// the first ~500 ticks and the siege predicate (hostileZones > 3) goes
// permanently false, so a long siege is structurally unreachable.
const SIEGE_MODE = process.env.SIEGE_MODE === "1";
const SIEGE_REASSERT_EVERY = Number(process.env.SIEGE_REASSERT_EVERY ?? 24);

function buildAtWarState(): GameState {
  const s = createInitialState();

  // 1. Inject a hostile neighbour megacity so isAtWar() is true and the
  //    wartime dispatchers fire.
  const hostile: ExternalMegacity = {
    id: "ext-stress-neighbor",
    name: "Vyrnholt-7",
    isActive: true,
    threat: 90,
    loyalty: 4,
    militaryStrength: "high",
    leader: {
      name: "Praefect Soren Kaal",
      title: "Iron Praefect of Vyrnholt",
      attitude: "hostile",
    },
  } as ExternalMegacity;
  s.externalMegacities = [...(s.externalMegacities ?? []), hostile];

  // 2. Seed combat zones so raid templates have valid targets and the
  //    siege predicate (hostileZones > 3 + active raid) can trip.
  if (s.combat) {
    for (const z of s.combat.zones) {
      if (
        z.id === "wasteland_north" ||
        z.id === "wasteland_east" ||
        z.id === "underhive_west" ||
        z.id === "underhive_east" ||
        z.id === "mutant_quarter" ||
        z.id === "toxic_flats"
      ) {
        z.status = "hostile";
        z.threat = ZONE_THREAT;
        z.garrison = 0;
        z.controllingFaction = "rival_cities";
      } else if (z.id === "hab_blocks_west" || z.id === "penal_zone") {
        z.status = "contested";
        z.threat = Math.max(40, ZONE_THREAT - 20);
        z.garrison = Math.max(5, Math.floor(GARRISON / 2));
      } else {
        z.garrison = GARRISON;
      }
    }
  }

  return s;
}

interface RaidStats {
  spawned: number;
  repelled: number;
  breached: number;
  byFaction: Map<string, { spawned: number; repelled: number; breached: number }>;
  archetypeCounts: Map<string, number>;
  populationLossesFromBreaches: number;
}

interface SiegeStats {
  ticksUnderSiege: number;
  ticksAtWar: number;
  longestSiegeRun: number;
  currentSiegeRun: number;
  enteredSiegeCount: number;
}

function emptyRaidStats(): RaidStats {
  return {
    spawned: 0,
    repelled: 0,
    breached: 0,
    byFaction: new Map(),
    archetypeCounts: new Map(),
    populationLossesFromBreaches: 0,
  };
}

function bumpFaction(stats: RaidStats, faction: string, key: "spawned" | "repelled" | "breached") {
  const cur = stats.byFaction.get(faction) ?? { spawned: 0, repelled: 0, breached: 0 };
  cur[key]++;
  stats.byFaction.set(faction, cur);
}

function pad(s: string | number, n: number, right = false): string {
  const str = String(s);
  if (str.length >= n) return str.slice(0, n);
  return right ? str.padStart(n) : str.padEnd(n);
}

function bar(value: number, max: number, width = 30): string {
  if (max <= 0) return "";
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
}

function main() {
  const startWall = Date.now();
  let state = buildAtWarState();
  const initialPopulation = state.cityStats.population;
  const initialResources = { ...state.resources };

  const raids = emptyRaidStats();
  const siege: SiegeStats = {
    ticksUnderSiege: 0,
    ticksAtWar: 0,
    longestSiegeRun: 0,
    currentSiegeRun: 0,
    enteredSiegeCount: 0,
  };

  // Snapshots every 500 ticks for the timeline section.
  const snapshots: Array<{
    tick: number;
    population: number;
    credits: number;
    food: number;
    warMorale: number;
    happiness: number;
    unrest: number;
    activeRaids: number;
    underSiege: boolean;
    hostileZones: number;
  }> = [];

  let lowestPopulation = initialPopulation;
  let lowestFood = initialResources.food;
  let lowestMorale = state.combat?.warMorale ?? 70;
  let peakActiveRaids = 0;
  let lastBreachExample = "";
  let lastRepelExample = "";

  // Track which raid IDs we've already counted so we don't double-count
  // long-running raids. Composition is recorded once at first sighting.
  const seenRaidIds = new Set<string>();
  // Map raidId → factionSource so when a raid resolves and disappears
  // from the queue, we can still attribute its outcome to the right
  // faction. Set when first seen, kept for the run.
  const raidFaction = new Map<string, string>();
  // Track each raid's last-seen status so we can detect transitions to
  // "repelled" or "breached" within the same tick the engine flips it
  // (the queue-filter at the end of the raid block drops resolved raids
  // before we can read them post-tick).
  const lastSeenStatus = new Map<string, string>();

  // The frontier zones we re-assert as hostile under SIEGE_MODE. Picked
  // to ensure hostileZones > 3 so the siege predicate trips and stays
  // tripped for the duration of the offensive.
  const SIEGE_FRONTIER = [
    "wasteland_north",
    "wasteland_east",
    "underhive_west",
    "underhive_east",
    "mutant_quarter",
    "toxic_flats",
  ];

  for (let i = 0; i < TICKS; i++) {
    if (SIEGE_MODE && i > 0 && i % SIEGE_REASSERT_EVERY === 0 && state.combat) {
      // Sustained enemy push: every SIEGE_REASSERT_EVERY ticks the enemy
      // re-takes the frontier ring. Mirrors a real siege where the
      // attacker keeps replacing losses faster than the defender can
      // pacify the ground.
      for (const z of state.combat.zones) {
        if (SIEGE_FRONTIER.includes(z.id)) {
          z.status = "hostile";
          z.threat = Math.max(z.threat, ZONE_THREAT);
          z.controlLevel = 5;
          z.controllingFaction = "rival_cities";
        }
      }
    }
    const result = runTick(state);
    state = result.newState;

    // Inspect the combat queue for new raids and accumulate composition.
    const queue = state.combat?.raidEventQueue ?? [];
    for (const r of queue) {
      if (!seenRaidIds.has(r.id)) {
        seenRaidIds.add(r.id);
        raids.spawned++;
        raidFaction.set(r.id, r.factionSource);
        bumpFaction(raids, r.factionSource, "spawned");
        if (r.composition) {
          for (const [archetypeId, count] of Object.entries(r.composition)) {
            raids.archetypeCounts.set(
              archetypeId,
              (raids.archetypeCounts.get(archetypeId) ?? 0) + count,
            );
          }
        }
      }
      lastSeenStatus.set(r.id, r.status);
    }

    // Inspect this tick's emitted entries to count outcomes + grab
    // representative reason text. The label set is authoritative — we
    // only need to attribute back to a faction via raidFaction.
    // Pull the battle-log entries from THIS tick to map outcome → raidId,
    // since the queue has already been filtered by the time we read it.
    const log = state.combat?.battleLog ?? [];
    const thisTickLog = log.filter((l) => l.tick === state.totalTicks);
    for (const e of result.entries) {
      if (e.label === "RAID REPELLED") {
        raids.repelled++;
        if (!lastRepelExample) lastRepelExample = e.reason;
      } else if (e.label === "RAID BREACHED") {
        raids.breached++;
        raids.populationLossesFromBreaches += Math.abs(e.delta ?? 0);
        lastBreachExample = e.reason;
      }
    }
    // Per-faction attribution: battleLog ids look like
    // `raid-repel-${tick}-${raidId}` or `raid-breach-${tick}-${raidId}`.
    for (const entry of thisTickLog) {
      const m = entry.id.match(/^raid-(repel|breach)-\d+-(.+)$/);
      if (!m) continue;
      const [, kind, raidId] = m;
      const faction = raidFaction.get(raidId);
      if (faction) bumpFaction(raids, faction, kind === "repel" ? "repelled" : "breached");
    }

    // War / siege state.
    if (isAtWar(state)) {
      siege.ticksAtWar++;
      const ctx = getWarContext(state);
      if (ctx.underSiege) {
        siege.ticksUnderSiege++;
        siege.currentSiegeRun++;
        if (siege.currentSiegeRun === 1) siege.enteredSiegeCount++;
        if (siege.currentSiegeRun > siege.longestSiegeRun) {
          siege.longestSiegeRun = siege.currentSiegeRun;
        }
      } else {
        siege.currentSiegeRun = 0;
      }
      peakActiveRaids = Math.max(peakActiveRaids, ctx.activeRaids.length);
    }

    // Lows.
    if (state.cityStats.population < lowestPopulation) lowestPopulation = state.cityStats.population;
    if (state.resources.food < lowestFood) lowestFood = state.resources.food;
    const wm = state.combat?.warMorale ?? 70;
    if (wm < lowestMorale) lowestMorale = wm;

    if (i % 500 === 0 || i === TICKS - 1) {
      const ctx = getWarContext(state);
      snapshots.push({
        tick: state.totalTicks,
        population: state.cityStats.population,
        credits: state.resources.credits,
        food: state.resources.food,
        warMorale: wm,
        happiness: state.cityStats.happiness,
        unrest: state.cityStats.unrest,
        activeRaids: ctx.activeRaids.length,
        underSiege: ctx.underSiege,
        hostileZones: ctx.hostileZones,
      });
    }
  }

  const wallMs = Date.now() - startWall;

  // ─── Report ────────────────────────────────────────────────────────
  const ctxFinal = getWarContext(state);
  const out: string[] = [];
  out.push("");
  out.push("═".repeat(78));
  out.push("  LONG-TERM WAR STRESS TEST — Vyrnholt-7 Conflict");
  out.push("═".repeat(78));
  out.push(`  Ticks simulated     : ${TICKS.toLocaleString()}`);
  out.push(`  Wall-clock duration : ${(wallMs / 1000).toFixed(2)}s  (${(TICKS / (wallMs / 1000)).toFixed(0)} ticks/sec)`);
  out.push(`  In-game days        : ~${Math.round(TICKS / 24)}  (24 ticks ≈ 1 day)`);
  out.push(`  Hostile neighbour   : Vyrnholt-7 (threat 90, attitude hostile)`);
  out.push(`  Starting hostile zones: 6 (+ 2 contested)`);
  out.push("");
  out.push("─── WAR / SIEGE TIMELINE ───");
  out.push(`  Ticks at war         : ${siege.ticksAtWar.toLocaleString()} (${((siege.ticksAtWar / TICKS) * 100).toFixed(1)}%)`);
  out.push(`  Ticks under siege    : ${siege.ticksUnderSiege.toLocaleString()} (${((siege.ticksUnderSiege / TICKS) * 100).toFixed(1)}%)`);
  out.push(`  Times entered siege  : ${siege.enteredSiegeCount}`);
  out.push(`  Longest siege run    : ${siege.longestSiegeRun} ticks (~${(siege.longestSiegeRun / 24).toFixed(1)} days)`);
  out.push(`  Peak active raids    : ${peakActiveRaids} concurrently`);
  out.push("");
  out.push("─── RAID OUTCOMES ───");
  out.push(`  Total raids spawned  : ${raids.spawned}`);
  out.push(`  Repelled             : ${raids.repelled}`);
  out.push(`  Breached             : ${raids.breached}`);
  const resolved = raids.repelled + raids.breached;
  if (resolved > 0) {
    out.push(`  Repel rate           : ${((raids.repelled / resolved) * 100).toFixed(1)}%`);
  }
  out.push(`  Population lost to breaches: ${raids.populationLossesFromBreaches.toLocaleString()}`);
  out.push("");

  out.push("─── PER-FACTION BREAKDOWN ───");
  out.push(`  ${pad("Faction", 16)}  ${pad("Spawned", 9, true)}  ${pad("Repelled", 9, true)}  ${pad("Breached", 9, true)}  Repel%`);
  out.push(`  ${"-".repeat(16)}  ${"-".repeat(9)}  ${"-".repeat(9)}  ${"-".repeat(9)}  ------`);
  const factionRows = Array.from(raids.byFaction.entries()).sort(
    (a, b) => b[1].spawned - a[1].spawned,
  );
  for (const [faction, fs] of factionRows) {
    const r = fs.repelled + fs.breached;
    const pct = r > 0 ? `${((fs.repelled / r) * 100).toFixed(0)}%` : "—";
    out.push(`  ${pad(faction, 16)}  ${pad(fs.spawned, 9, true)}  ${pad(fs.repelled, 9, true)}  ${pad(fs.breached, 9, true)}  ${pad(pct, 6, true)}`);
  }
  out.push("");

  out.push("─── HOSTILE ARCHETYPES SEEN (top 15 by total units across all raids) ───");
  // Build displayName lookup.
  const idToName = new Map<string, string>();
  for (const archs of Object.values(FACTION_SIGNATURE_UNITS)) {
    for (const a of archs) idToName.set(a.id, a.displayName);
  }
  const archRows = Array.from(raids.archetypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  const maxArch = archRows[0]?.[1] ?? 1;
  for (const [id, count] of archRows) {
    const name = idToName.get(id) ?? id;
    out.push(`  ${pad(name, 28)}  ${pad(count, 5, true)}  ${bar(count, maxArch, 30)}`);
  }
  out.push("");

  out.push("─── REPRESENTATIVE INBOX TEXT ───");
  if (lastRepelExample) out.push(`  REPEL : ${lastRepelExample}`);
  if (lastBreachExample) out.push(`  BREACH: ${lastBreachExample}`);
  if (ctxFinal.activeRaids.length > 0) {
    const r = ctxFinal.activeRaids[0];
    if (r.composition) {
      out.push(`  LIVE  : ${r.name} — Hostiles spotted: ${formatHostilesSpotted(r.composition, r.factionSource)}`);
    }
  }
  out.push("");

  out.push("─── ATTRITION ───");
  out.push(`  Population start → end : ${initialPopulation.toLocaleString()} → ${state.cityStats.population.toLocaleString()}  (Δ ${(state.cityStats.population - initialPopulation).toLocaleString()})`);
  out.push(`  Population low-water   : ${lowestPopulation.toLocaleString()}`);
  out.push(`  Credits start → end    : ${initialResources.credits.toLocaleString()} → ${state.resources.credits.toLocaleString()}`);
  out.push(`  Food start → end       : ${initialResources.food.toLocaleString()} → ${state.resources.food.toLocaleString()}  (low: ${lowestFood.toLocaleString()})`);
  out.push(`  War morale start → end : 70 → ${state.combat?.warMorale ?? "?"}  (low: ${lowestMorale})`);
  out.push(`  Happiness end          : ${state.cityStats.happiness}`);
  out.push(`  Unrest end             : ${state.cityStats.unrest}`);
  out.push("");

  out.push("─── TIMELINE SNAPSHOTS ───");
  out.push(`  ${pad("tick", 6, true)}  ${pad("pop", 9, true)}  ${pad("credits", 10, true)}  ${pad("food", 8, true)}  ${pad("morale", 6, true)}  ${pad("hap", 4, true)}  ${pad("unr", 4, true)}  ${pad("raids", 5, true)}  ${pad("hZ", 3, true)}  siege?`);
  for (const sn of snapshots) {
    out.push(
      `  ${pad(sn.tick, 6, true)}  ${pad(sn.population, 9, true)}  ${pad(sn.credits, 10, true)}  ${pad(sn.food, 8, true)}  ${pad(sn.warMorale, 6, true)}  ${pad(sn.happiness, 4, true)}  ${pad(sn.unrest, 4, true)}  ${pad(sn.activeRaids, 5, true)}  ${pad(sn.hostileZones, 3, true)}  ${sn.underSiege ? "YES" : "no"}`,
    );
  }
  out.push("");

  out.push("─── INVARIANT CHECKS ───");
  const checks: Array<[string, boolean, string]> = [
    ["State remained at war throughout", siege.ticksAtWar === TICKS, `${siege.ticksAtWar}/${TICKS} ticks at war`],
    ["At least one raid spawned", raids.spawned > 0, `${raids.spawned} raids`],
    ["At least one raid resolved", resolved > 0, `${resolved} resolutions`],
    ["No 'undefined' leaked into reason text", !lastRepelExample.includes("undefined") && !lastBreachExample.includes("undefined"), "ok"],
    ["Population stayed non-negative", state.cityStats.population >= 0, `pop=${state.cityStats.population}`],
    ["Food stayed non-negative", state.resources.food >= 0, `food=${state.resources.food}`],
    ["War morale stayed in [0,100]", (state.combat?.warMorale ?? 70) >= 0 && (state.combat?.warMorale ?? 70) <= 100, `wm=${state.combat?.warMorale}`],
    ["Battle log bounded", (state.combat?.battleLog?.length ?? 0) <= 500, `log=${state.combat?.battleLog?.length}`],
    ["Composition seen for spawned raids", raids.archetypeCounts.size > 0, `${raids.archetypeCounts.size} distinct archetypes`],
  ];
  let anyFail = false;
  for (const [desc, ok, detail] of checks) {
    out.push(`  ${ok ? "PASS" : "FAIL"}  ${pad(desc, 48)}  (${detail})`);
    if (!ok) anyFail = true;
  }
  out.push("");
  out.push("═".repeat(78));
  out.push(`  RESULT: ${anyFail ? "INVARIANT FAILURES — see above" : "ALL INVARIANTS HELD"}`);
  out.push("═".repeat(78));
  out.push("");

  console.log(out.join("\n"));
  if (anyFail) process.exit(1);
}

main();

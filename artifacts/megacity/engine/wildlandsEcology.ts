import type { GameState, TickEntry, BiomeEcology, GameEvent } from "@/engine/types";
import { ALL_BIOMES, BIOMES, biomeBaselineEcology, biomeForDistrictCategory, type Biome } from "@/engine/biomes";
import { getDistrictCategory } from "@/engine/districts";
import { FAUNA_SPECIES } from "@/engine/faunaData";
import { FLORA_SPECIES } from "@/engine/floraData";
import { BIOSPHERE_EVENT_POOL } from "@/engine/events";
import { negativeEventsAllowed } from "@/engine/calmStart";

const ECOLOGY_TICK_PERIOD = 4;
const MIN_EVENT_GAP_TICKS = 80;
const GLOBAL_EVENT_GAP_TICKS = 30;

type RoleKey = "flora" | "herbivore" | "predator" | "vermin" | "megafauna" | "scavenger";

const ROLES: RoleKey[] = ["flora", "herbivore", "predator", "vermin", "megafauna", "scavenger"];

function emptyDelta(): BiomeEcology["lastDelta"] {
  return { flora: 0, herbivore: 0, predator: 0, vermin: 0, megafauna: 0, scavenger: 0 };
}

// Per-biome district roll-up. Computing this once per tick and threading it
// through the helpers avoids re-scanning all districts ~3×perBiome (each call
// re-parses every district id via getDistrictCategory). Accumulation order
// matches the per-biome scans below, so ecology averages stay bit-identical.
type BiomeAgg = Partial<Record<Biome, { count: number; ecoSum: number }>>;

function computeBiomeAggregates(state: GameState): BiomeAgg {
  const agg: BiomeAgg = {};
  for (const d of state.districts ?? []) {
    const biome = biomeForDistrictCategory(getDistrictCategory(d.id));
    let a = agg[biome];
    if (!a) {
      a = { count: 0, ecoSum: 0 };
      agg[biome] = a;
    }
    a.count++;
    a.ecoSum += d.ecology ?? 25;
  }
  return agg;
}

function biomeDistrictCount(state: GameState, biome: Biome, agg?: BiomeAgg): number {
  if (agg) return agg[biome]?.count ?? 0;
  let n = 0;
  for (const d of state.districts ?? []) {
    const cat = getDistrictCategory(d.id);
    if (biomeForDistrictCategory(cat) === biome) n++;
  }
  return n;
}

function biomeEcologyAvg(state: GameState, biome: Biome, agg?: BiomeAgg): number {
  if (agg) {
    const a = agg[biome];
    return !a || a.count === 0 ? biomeBaselineEcology(biome) : a.ecoSum / a.count;
  }
  let sum = 0;
  let n = 0;
  for (const d of state.districts ?? []) {
    const cat = getDistrictCategory(d.id);
    if (biomeForDistrictCategory(cat) !== biome) continue;
    sum += d.ecology ?? 25;
    n++;
  }
  return n === 0 ? biomeBaselineEcology(biome) : sum / n;
}

// basePopByRole / avgGrowthRateByRole depend only on the static species tables,
// so memoize per biome (computed at most once each) instead of re-scanning
// FLORA_SPECIES + FAUNA_SPECIES every biome every tick. Cached result is the
// same object identity, so callers must treat it as read-only (they do).
const __basePopCache = new Map<Biome, Record<RoleKey, number>>();
const __growthRateCache = new Map<Biome, Record<RoleKey, number>>();

function basePopByRole(biome: Biome): Record<RoleKey, number> {
  const cached = __basePopCache.get(biome);
  if (cached) return cached;
  const out: Record<RoleKey, number> = { flora: 0, herbivore: 0, predator: 0, vermin: 0, megafauna: 0, scavenger: 0 };
  for (const f of FLORA_SPECIES) if (f.biome === biome) out.flora += f.basePopulation;
  for (const f of FAUNA_SPECIES) if (f.biome === biome) {
    if (f.role === "herbivore") out.herbivore += f.basePopulation;
    else if (f.role === "predator") out.predator += f.basePopulation;
    else if (f.role === "vermin") out.vermin += f.basePopulation;
    else if (f.role === "megafauna") out.megafauna += f.basePopulation;
    else if (f.role === "scavenger") out.scavenger += f.basePopulation;
  }
  __basePopCache.set(biome, out);
  return out;
}

function avgGrowthRateByRole(biome: Biome): Record<RoleKey, number> {
  const cached = __growthRateCache.get(biome);
  if (cached) return cached;
  const sums: Record<RoleKey, { sum: number; n: number }> = {
    flora: { sum: 0, n: 0 }, herbivore: { sum: 0, n: 0 }, predator: { sum: 0, n: 0 },
    vermin: { sum: 0, n: 0 }, megafauna: { sum: 0, n: 0 }, scavenger: { sum: 0, n: 0 },
  };
  for (const f of FLORA_SPECIES) if (f.biome === biome) { sums.flora.sum += f.growthRate; sums.flora.n++; }
  for (const f of FAUNA_SPECIES) if (f.biome === biome) {
    const r = f.role as RoleKey;
    if (sums[r]) { sums[r].sum += f.growthRate; sums[r].n++; }
  }
  const out: Record<RoleKey, number> = { flora: 0, herbivore: 0, predator: 0, vermin: 0, megafauna: 0, scavenger: 0 };
  for (const k of ROLES) {
    out[k] = sums[k].n > 0 ? sums[k].sum / sums[k].n : 0;
  }
  __growthRateCache.set(biome, out);
  return out;
}

export function seedBiomeEcology(state: GameState, biome: Biome, agg?: BiomeAgg): BiomeEcology {
  const eco = biomeEcologyAvg(state, biome, agg);
  const districts = Math.max(1, biomeDistrictCount(state, biome, agg));
  const factor = Math.max(0.05, eco / 60);
  const base = basePopByRole(biome);
  return {
    flora: Math.round(base.flora * factor * districts),
    herbivore: Math.round(base.herbivore * factor * districts),
    predator: Math.round(base.predator * factor * districts),
    vermin: Math.round(base.vermin * Math.max(0.2, 1.2 - factor) * districts),
    megafauna: Math.round(base.megafauna * factor * districts),
    scavenger: Math.round(base.scavenger * factor * districts),
    lastDelta: emptyDelta(),
  };
}

export function ensureWildlandsEcology(state: GameState, agg?: BiomeAgg): Partial<Record<Biome, BiomeEcology>> {
  const map = { ...(state.wildlandsEcology ?? {}) } as Partial<Record<Biome, BiomeEcology>>;
  let changed = false;
  for (const b of ALL_BIOMES) {
    if (biomeDistrictCount(state, b, agg) === 0) continue;
    if (!map[b]) {
      map[b] = seedBiomeEcology(state, b, agg);
      changed = true;
    }
  }
  if (changed) state.wildlandsEcology = map;
  return map;
}

function tryTriggerEcologyEvent(
  state: GameState,
  biome: Biome,
  ecoState: BiomeEcology,
  pickIds: string[],
  reason: string,
  entries: TickEntry[],
): boolean {
  const tick = state.totalTicks ?? 0;
  if (ecoState.lastEventTick !== undefined && tick - ecoState.lastEventTick < MIN_EVENT_GAP_TICKS) return false;
  // Post-resolution calm window: after the player resolves a crisis here, hold
  // off on any new ecology event until the biome has had time to rebalance.
  if (ecoState.calmUntilTick !== undefined && tick < ecoState.calmUntilTick) return false;
  const cooldowns = state.eventTriggerCooldowns ?? {};
  const activeIds = new Set((state.activeEvents ?? []).map((e) => e.id));
  const recentIds = new Set((state.eventHistory ?? []).slice(-8).map((e) => e.id));
  const lastGlobal = cooldowns["__wildlands_ecology"] ?? -9999;
  if (tick - lastGlobal < GLOBAL_EVENT_GAP_TICKS) return false;

  const candidates = pickIds.filter((id) => {
    if (activeIds.has(id)) return false;
    if (recentIds.has(id)) return false;
    const cd = cooldowns[id] ?? -9999;
    if (tick - cd < MIN_EVENT_GAP_TICKS) return false;
    return true;
  });
  if (candidates.length === 0) return false;

  const chosenId = candidates[Math.floor(Math.random() * candidates.length)];
  const def = BIOSPHERE_EVENT_POOL.find((e) => e.id === chosenId);
  if (!def) return false;

  const newEvent: GameEvent = { ...def, timestamp: Date.now(), resolved: false, biome };
  state.activeEvents = [...(state.activeEvents ?? []), newEvent];
  state.eventTriggerCooldowns = { ...cooldowns, [chosenId]: tick, "__wildlands_ecology": tick };
  ecoState.lastEventTick = tick;
  entries.push({
    label: def.title,
    delta: 0,
    unit: "",
    reason: `${BIOMES[biome].shortName}: ${reason}`,
    severity: "warning",
  });
  return true;
}

const EVENTS_BY_TRIGGER: Record<string, string[]> = {
  vermin_swarm: ["biosphere_vermin_swarm", "biosphere_rat_plague_local", "biosphere_grub_infestation"],
  predator_overrun: ["biosphere_predator_overrun", "biosphere_pack_attacks", "biosphere_apex_breakout"],
  flora_collapse: ["biosphere_flora_collapse", "biosphere_blight_spread", "biosphere_keystone_die_off"],
  herbivore_die_off: ["biosphere_herbivore_die_off", "biosphere_starvation_cascade"],
  megafauna_sighted: ["biosphere_megafauna_spotted", "biosphere_titan_migration"],
  bloom: ["biosphere_super_bloom", "biosphere_pollinator_surge"],
  pollination_collapse: ["biosphere_pollinator_loss", "biosphere_silent_grove"],
  scavenger_glut: ["biosphere_scavenger_glut", "biosphere_carrion_field"],
  disease: ["biosphere_zoonotic_jump", "biosphere_fungal_plague", "biosphere_blood_fever"],
  poaching: ["biosphere_poacher_camp", "biosphere_skin_market"],
  invasive: ["biosphere_invasive_species", "biosphere_alien_creeper"],
  ecological_balance: ["biosphere_balanced_grove", "biosphere_keystone_returns"],
};

// --- Biosphere crisis-odds ramp (shared by the simulation and the UI) --------
// Negative ecology crises scale their spawn odds by getBiosphereCrisisChance,
// which eases as the city's biosphere recovers: full odds at/below the
// natural-recovery floor (where a neglected city settles), easing to ~0.5 by
// biosphere 100 (never below MIN_CRISIS_CHANCE). Keeping the ramp in one place
// lets the Wildlands "nature crisis risk" card show players the exact odds the
// simulation is rolling, so investing in the biosphere feels like progress.
export const BIOSPHERE_CRISIS_FLOOR = 15;
export const CRISIS_EASE_SPAN = 170;
export const MIN_CRISIS_CHANCE = 0.35;

export function getBiosphereCrisisChance(biosphere: number): number {
  return Math.max(
    MIN_CRISIS_CHANCE,
    1 - Math.max(0, biosphere - BIOSPHERE_CRISIS_FLOOR) / CRISIS_EASE_SPAN,
  );
}

export type BiosphereCrisisRiskTier = "high" | "easing" | "low";

export interface BiosphereCrisisRisk {
  biosphere: number;
  /** Odds multiplier on negative crises: 1.0 at the floor -> 0.5 at biosphere 100. */
  chance: number;
  /** Whole-percent fewer crises than a barren biosphere: 0 at the floor -> 50 at 100. */
  reductionPct: number;
  tier: BiosphereCrisisRiskTier;
}

export function getBiosphereCrisisRisk(biosphere: number): BiosphereCrisisRisk {
  const chance = getBiosphereCrisisChance(biosphere);
  const reductionPct = Math.round((1 - chance) * 100);
  const tier: BiosphereCrisisRiskTier =
    chance >= 0.9 ? "high" : chance >= 0.7 ? "easing" : "low";
  return { biosphere, chance, reductionPct, tier };
}

export function processWildlandsEcology(state: GameState, entries: TickEntry[]): void {
  const tick = state.totalTicks ?? 0;
  if (tick % ECOLOGY_TICK_PERIOD !== 0) return;
  const agg = computeBiomeAggregates(state);
  const map = ensureWildlandsEcology(state, agg);

  for (const biome of ALL_BIOMES) {
    const districts = biomeDistrictCount(state, biome, agg);
    if (districts === 0) continue;
    let eco = map[biome];
    if (!eco) continue;

    const ecologyAvg = biomeEcologyAvg(state, biome, agg);
    const factor = Math.max(0.05, ecologyAvg / 60);
    const base = basePopByRole(biome);
    const growth = avgGrowthRateByRole(biome);

    const cap = {
      flora: Math.max(1000, base.flora * districts * factor * 1.5),
      herbivore: Math.max(200, base.herbivore * districts * factor * 1.4),
      predator: Math.max(50, base.predator * districts * factor * 1.3),
      vermin: Math.max(500, base.vermin * districts * Math.max(0.3, 1.4 - factor) * 1.6),
      megafauna: Math.max(20, base.megafauna * districts * factor * 1.2),
      scavenger: Math.max(200, base.scavenger * districts * factor * 1.4),
    };

    const fenced = (eco.fencingTicks ?? 0) > 0;
    const tickScale = ECOLOGY_TICK_PERIOD * 0.5;

    const floraGrowth = (eco.flora * growth.flora * tickScale * (1 - eco.flora / Math.max(1, cap.flora))) -
      (eco.vermin * 0.0008 * (fenced ? 0.4 : 1));
    const herbivoreGrowth = (eco.herbivore * growth.herbivore * tickScale * Math.min(1, eco.flora / Math.max(1, cap.flora * 0.6)) * (1 - eco.herbivore / Math.max(1, cap.herbivore))) -
      (eco.predator * 0.012 * (fenced ? 0.5 : 1));
    const predatorGrowth = (eco.predator * growth.predator * tickScale * Math.min(1.2, eco.herbivore / Math.max(1, cap.herbivore * 0.5))) -
      (eco.predator * 0.02 * Math.max(0, 1 - eco.herbivore / Math.max(1, cap.herbivore * 0.3)));
    const verminGrowth = (eco.vermin * growth.vermin * tickScale * (1 - eco.vermin / Math.max(1, cap.vermin))) -
      (eco.predator * 0.6) - (eco.scavenger * 0.05);
    const megaGrowth = ecologyAvg > 60
      ? eco.megafauna * 0.005 * tickScale
      : -eco.megafauna * 0.01 * tickScale;
    const scavGrowth = (eco.scavenger * growth.scavenger * tickScale * (1 - eco.scavenger / Math.max(1, cap.scavenger)));

    const newFlora = Math.max(0, Math.round(eco.flora + floraGrowth));
    const newHerb = Math.max(0, Math.round(eco.herbivore + herbivoreGrowth));
    const newPred = Math.max(0, Math.round(eco.predator + predatorGrowth));
    const newVerm = Math.max(0, Math.round(eco.vermin + verminGrowth));
    const newMega = Math.max(0, Math.round(eco.megafauna + megaGrowth));
    const newScav = Math.max(0, Math.round(eco.scavenger + scavGrowth));

    const lastDelta = {
      flora: newFlora - eco.flora,
      herbivore: newHerb - eco.herbivore,
      predator: newPred - eco.predator,
      vermin: newVerm - eco.vermin,
      megafauna: newMega - eco.megafauna,
      scavenger: newScav - eco.scavenger,
    };

    const next: BiomeEcology = {
      ...eco,
      flora: newFlora,
      herbivore: newHerb,
      predator: newPred,
      vermin: newVerm,
      megafauna: newMega,
      scavenger: newScav,
      lastDelta,
      vaccinationTicks: Math.max(0, (eco.vaccinationTicks ?? 0) - ECOLOGY_TICK_PERIOD),
      fencingTicks: Math.max(0, (eco.fencingTicks ?? 0) - ECOLOGY_TICK_PERIOD),
      diseaseSuppressedTicks: Math.max(0, (eco.diseaseSuppressedTicks ?? 0) - ECOLOGY_TICK_PERIOD),
    };
    map[biome] = next;

    // Apply ecology pressure back to district ecology when populations are unbalanced
    //
    // Roles with NO species in the biome's flora/fauna tables (base pop 0 —
    // e.g. irradiated_jungle, fungal_caves and dead_sea_coast have no herbivore
    // species at all) are not part of that biome's food chain. Their raw ratio
    // is 0/cap-floor = 0 forever (0 population is a fixed point of the growth
    // step), which used to permanently arm the "population crashed" branches:
    // a fresh game rolled a HERBIVORE DIE-OFF / STARVATION CASCADE on its very
    // first ecology tick (~60% of new games interrupted on turn one) for herds
    // that never existed. Treat absent roles as neutral (ratio 1) so crash
    // events and pressure penalties only ever arm for roles the biome actually
    // supports. Vermin stays raw: its branches trigger on HIGH ratios, and an
    // absent vermin role is already 0. Tests hold a biome at zero POPULATIONS
    // to probe these branches — that still works, because this keys off the
    // species tables, not the current population.
    let ecoPressure = 0;
    const verminRatio = newVerm / Math.max(1, cap.vermin);
    const floraRatio = base.flora > 0 ? newFlora / Math.max(1, cap.flora) : 1;
    const herbRatio = base.herbivore > 0 ? newHerb / Math.max(1, cap.herbivore) : 1;
    const predRatio = base.predator > 0 ? newPred / Math.max(1, cap.predator) : 1;
    if (verminRatio > 1.3) ecoPressure -= 1;
    if (floraRatio < 0.4) ecoPressure -= 1;
    if (herbRatio < 0.3) ecoPressure -= 1;
    if (predRatio > 1.4 && herbRatio < 0.5) ecoPressure -= 1;
    if (floraRatio > 0.9 && herbRatio > 0.7 && verminRatio < 0.6) ecoPressure += 1;

    if (ecoPressure !== 0) {
      state.districts = state.districts.map((d) => {
        const cat = getDistrictCategory(d.id);
        if (biomeForDistrictCategory(cat) !== biome) return d;
        return { ...d, ecology: Math.max(0, Math.min(100, (d.ecology ?? 25) + ecoPressure)) };
      });
      entries.push({
        label: "BIOME ECOLOGY",
        delta: ecoPressure,
        unit: "",
        reason: `${BIOMES[biome].shortName}: ecosystem pressure ${ecoPressure > 0 ? "stabilizing" : "destabilizing"} sectors`,
        severity: ecoPressure > 0 ? "positive" : "warning",
      });
    }

    // Report notable population swings even when no event fires
    const swingThreshold = 0.12; // 12% delta vs prior population
    const reportSwing = (
      role: string,
      oldVal: number,
      newVal: number,
      label: string,
      crashReason: string,
      surgeReason: string,
    ) => {
      if (oldVal < 50) return;
      const pct = (newVal - oldVal) / oldVal;
      if (Math.abs(pct) < swingThreshold) return;
      const delta = newVal - oldVal;
      entries.push({
        label,
        delta,
        unit: "",
        reason: `${BIOMES[biome].shortName}: ${pct < 0 ? crashReason : surgeReason}`,
        severity: pct < -0.25 ? "warning" : pct > 0 ? "positive" : "negative",
      });
    };
    reportSwing("flora", eco.flora, newFlora, "FLORA", "vegetation crash", "flora bloom");
    reportSwing("herbivore", eco.herbivore, newHerb, "HERBIVORES", "herd collapse", "herd surge");
    reportSwing("predator", eco.predator, newPred, "PREDATORS", "predator die-off", "predator surge");
    reportSwing("vermin", eco.vermin, newVerm, "VERMIN", "vermin culled", "vermin surge");
    reportSwing("scavenger", eco.scavenger, newScav, "SCAVENGERS", "scavenger drop", "scavenger glut");
    if (eco.megafauna === 0 && newMega > 0) {
      entries.push({ label: "MEGAFAUNA", delta: newMega, unit: "", reason: `${BIOMES[biome].shortName}: megafauna returning to range`, severity: "positive" });
    } else if (eco.megafauna > 0 && newMega === 0) {
      entries.push({ label: "MEGAFAUNA", delta: -eco.megafauna, unit: "", reason: `${BIOMES[biome].shortName}: megafauna gone from range`, severity: "warning" });
    }

    // Event triggers
    // Keep ecology events inside the same per-save calm window as the rest of
    // the event pump. A fixture may intentionally extend that window beyond
    // the generic tutorial threshold.
    if (!negativeEventsAllowed(state)) continue;
    let triggered = false;
    // Biosphere infrastructure (which raises cs.biosphere) makes biomes more
    // resilient: negative ecology crises scale their odds DOWN as the city's
    // biosphere recovers. The ramp lives in getBiosphereCrisisChance (above) so
    // the Wildlands "nature crisis risk" card reads the exact same odds the
    // simulation uses. Positive events (bloom, megafauna, balance) are left
    // untouched so a thriving biosphere still shows life.
    const bio = state.cityStats?.biosphere ?? 50;
    const crisisChance = getBiosphereCrisisChance(bio);
    if (verminRatio > 1.6 && Math.random() < 0.5 * crisisChance) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.vermin_swarm, "vermin populations exploding", entries);
    } else if (predRatio > 1.4 && herbRatio < 0.4 && Math.random() < 0.45 * crisisChance) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.predator_overrun, "predators overrunning the food chain", entries);
    } else if (floraRatio < 0.25 && Math.random() < 0.4 * crisisChance) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.flora_collapse, "vegetation collapsing", entries);
    } else if (herbRatio < 0.2 && Math.random() < 0.35 * crisisChance) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.herbivore_die_off, "herbivore die-off", entries);
    } else if (newMega > 0 && ecologyAvg > 65 && Math.random() < 0.06 && (next.megafaunaSightedTick === undefined || tick - next.megafaunaSightedTick > 200)) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.megafauna_sighted, "megafauna spotted near perimeter", entries);
      if (triggered) next.megafaunaSightedTick = tick;
    } else if (floraRatio > 1.2 && herbRatio > 0.8 && Math.random() < 0.2) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.bloom, "biome entering super-bloom", entries);
    } else if (floraRatio > 1.0 && herbRatio < 0.3 && Math.random() < 0.2 * crisisChance) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.pollination_collapse, "pollinator chain weakening", entries);
    } else if (newScav > cap.scavenger * 1.4 && Math.random() < 0.25 * crisisChance) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.scavenger_glut, "scavenger glut on dead biomass", entries);
    } else if ((next.diseaseSuppressedTicks ?? 0) === 0 && (newVerm > cap.vermin * 0.9 || newPred > cap.predator * 1.1) && Math.random() < 0.15 * crisisChance) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.disease, "zoonotic illness rising", entries);
    } else if (ecologyAvg > 50 && Math.random() < 0.05) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.poaching, "poacher activity detected", entries);
    } else if (verminRatio > 1.0 && Math.random() < 0.08 * crisisChance) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.invasive, "invasive species sighted", entries);
    } else if (ecologyAvg > 70 && floraRatio > 0.8 && herbRatio > 0.6 && predRatio > 0.5 && predRatio < 1.1 && Math.random() < 0.04) {
      triggered = tryTriggerEcologyEvent(state, biome, next, EVENTS_BY_TRIGGER.ecological_balance, "biome reaching equilibrium", entries);
    }
  }

  state.wildlandsEcology = map;
}

export function getBiomeEcologyState(state: GameState, biome: Biome): BiomeEcology | undefined {
  return state.wildlandsEcology?.[biome];
}

export function applyInterventionToEcology(
  state: GameState,
  biome: Biome,
  intervention: "cull" | "vaccinate" | "fence",
): void {
  const map = ensureWildlandsEcology(state);
  const eco = map[biome];
  if (!eco) return;
  if (intervention === "cull") {
    map[biome] = {
      ...eco,
      vermin: Math.round(eco.vermin * 0.45),
      predator: Math.round(eco.predator * 0.7),
      lastDelta: { ...eco.lastDelta, vermin: -Math.round(eco.vermin * 0.55), predator: -Math.round(eco.predator * 0.3) },
    };
  } else if (intervention === "vaccinate") {
    map[biome] = {
      ...eco,
      vaccinationTicks: 80,
      diseaseSuppressedTicks: 80,
    };
  } else if (intervention === "fence") {
    map[biome] = {
      ...eco,
      fencingTicks: 60,
    };
  }
  state.wildlandsEcology = map;
}

// ── Post-resolution biosphere rebalance ─────────────────────────────────
// Every biosphere event id mapped back to the ecological trigger that spawned
// it, so resolving the event can correct the population that caused it.
const TRIGGER_BY_EVENT_ID: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [trigger, ids] of Object.entries(EVENTS_BY_TRIGGER)) {
    for (const id of ids) m[id] = trigger;
  }
  return m;
})();

// How long a biome stays calm (no new ecology events) after the player
// resolves a crisis there, letting the rebalanced populations settle.
const ECOLOGY_RESOLUTION_CALM_TICKS = 120;

// Per-role population cap for a biome. This MUST mirror the `cap` object inside
// processWildlandsEcology; it is duplicated here (rather than shared) to avoid
// disturbing that perf-sensitive, bit-identical hot loop. Change one, change
// the other.
export function computeBiomeCaps(state: GameState, biome: Biome): Record<RoleKey, number> {
  const districts = Math.max(1, biomeDistrictCount(state, biome));
  const ecologyAvg = biomeEcologyAvg(state, biome);
  const factor = Math.max(0.05, ecologyAvg / 60);
  const base = basePopByRole(biome);
  return {
    flora: Math.max(1000, base.flora * districts * factor * 1.5),
    herbivore: Math.max(200, base.herbivore * districts * factor * 1.4),
    predator: Math.max(50, base.predator * districts * factor * 1.3),
    vermin: Math.max(500, base.vermin * districts * Math.max(0.3, 1.4 - factor) * 1.6),
    megafauna: Math.max(20, base.megafauna * districts * factor * 1.2),
    scavenger: Math.max(200, base.scavenger * districts * factor * 1.4),
  };
}

// Called when the player resolves a biosphere/ecology event. applyResponseEffects
// only touches global city stats, so without this the population that triggered
// the crisis is untouched and a sibling event re-fires ~80 ticks later. Here we
// pull the offending role(s) back across their trigger threshold (targeting a
// fraction of the cap, so even a near-zero collapse is restored) and set a calm
// window on the biome.
export function resolveBiosphereEvent(state: GameState, biome: Biome, eventId: string): void {
  const trigger = TRIGGER_BY_EVENT_ID[eventId];
  if (!trigger) return;
  const map = ensureWildlandsEcology(state);
  const eco = map[biome];
  if (!eco) return;
  const caps = computeBiomeCaps(state, biome);
  const tick = state.totalTicks ?? 0;
  const next: BiomeEcology = { ...eco, lastDelta: { ...eco.lastDelta } };

  const setRole = (role: RoleKey, value: number) => {
    const v = Math.max(0, Math.round(value));
    next.lastDelta[role] = v - next[role];
    next[role] = v;
  };

  switch (trigger) {
    case "vermin_swarm":
    case "invasive":
      setRole("vermin", Math.min(next.vermin, caps.vermin * 0.5));
      break;
    case "predator_overrun":
      setRole("predator", Math.min(next.predator, caps.predator * 0.55));
      setRole("herbivore", Math.max(next.herbivore, caps.herbivore * 0.55));
      break;
    case "scavenger_glut":
      setRole("scavenger", Math.min(next.scavenger, caps.scavenger * 0.6));
      break;
    case "flora_collapse":
    case "pollination_collapse":
      setRole("flora", Math.max(next.flora, caps.flora * 0.6));
      break;
    case "herbivore_die_off":
      setRole("herbivore", Math.max(next.herbivore, caps.herbivore * 0.55));
      setRole("flora", Math.max(next.flora, caps.flora * 0.5));
      break;
    case "disease":
      next.diseaseSuppressedTicks = Math.max(next.diseaseSuppressedTicks ?? 0, 80);
      next.vaccinationTicks = Math.max(next.vaccinationTicks ?? 0, 80);
      setRole("vermin", Math.min(next.vermin, caps.vermin * 0.7));
      break;
    default:
      // bloom / megafauna_sighted / poaching / ecological_balance are not
      // overpopulation/collapse crises, so leave populations untouched.
      break;
  }

  next.calmUntilTick = tick + ECOLOGY_RESOLUTION_CALM_TICKS;
  map[biome] = next;
  state.wildlandsEcology = map;
}

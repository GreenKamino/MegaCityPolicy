import type { GameState } from "@/engine/types";
import { CRISIS_THRESHOLDS } from "@/engine/crisisThresholds";
import {
  computeMegaprojectOutput,
  computePowerGeneration as computeBasePowerGeneration,
  computePowerProductionComponents,
  POWER_GEN_WEIGHTS as SHARED_POWER_GEN_WEIGHTS,
  POWER_MEGAPROJECT_IDS as SHARED_POWER_MEGAPROJECT_IDS,
  POWER_MEGAPROJECT_OUTPUT as SHARED_POWER_MEGAPROJECT_OUTPUT,
  sumWeighted,
} from "@/engine/utilityProduction";

export const POWER_GEN_WEIGHTS = SHARED_POWER_GEN_WEIGHTS;
export const POWER_MEGAPROJECT_IDS = SHARED_POWER_MEGAPROJECT_IDS;
export const POWER_MEGAPROJECT_OUTPUT = SHARED_POWER_MEGAPROJECT_OUTPUT;

// ─────────────────────────────────────────────────────────────────────────────
// Power breakdown — the single source of truth for what is generating and
// draining the sector's power grid each tick, and by how much, plus concrete
// one-tap recovery suggestions that deep-link to the right screen. This mirrors
// the crime / biosphere breakdown pattern (see crimeBreakdown.ts) but for power,
// where HIGHER is better: `netPerTick` is the per-tick power balance (MW), so a
// positive value means a SURPLUS (good) and a negative value means a DEFICIT
// (brownouts — bad).
//
// This is a LEAF module: it imports only types. The per-tick power math it
// mirrors lives in formulas.ts's runTick (the POWER block), including the
// seasonal and weather drain swings that block applies — mirrored here via
// SEASON_POWER_DRAIN_MULT / WEATHER_POWER_DRAIN_DELTA and read off the grid's
// own state.season / state.weather, so the readout's net matches the tick
// during winter or a storm instead of quietly under-reporting the load. Other
// secondary modifiers the sim also applies (technology bonuses, company output,
// active policies, prestige multiplier) are intentionally omitted — the readout
// names the actionable levers a player can build, not every hidden coefficient.
// ─────────────────────────────────────────────────────────────────────────────

// Power-plant buildings and their per-building MW generation. Mirrored from the
// powerGeneration sum in formulas.ts.
// Power-consuming buildings grouped into legible sectors. Each entry's weight is
// the per-building MW drain, mirrored from the powerDrain sum in formulas.ts.
// The buckets are display-only; the flat weight table (POWER_DRAIN_WEIGHTS,
// derived below) is what the sim-matching total is summed from.
export const POWER_DRAIN_BUCKETS: Record<string, Record<string, number>> = {
  "Residential blocks": {
    habBlockMegaTowers: 12,
    workerHousingStacks: 8,
    highDensityResidentialPlatforms: 15,
  },
  "Industry": {
    megaManufacturingPlants: 35,
    metalFoundryComplexes: 25,
    roboticsFabricationFacilities: 20,
    automatedAssemblyLines: 18,
  },
  "Data & research": {
    quantumDataCenters: 40,
    predictiveAnalyticsSupercomputers: 30,
    aiCrimePredictionCenters: 20,
    advancedResearchLabs: 15,
    citywideSurveillanceGrid: 15,
    cyberneticsDevelopmentFacilities: 12,
  },
  "Defense grid": {
    cityShieldGenerator: 60,
    automatedDroneDefenseGrid: 18,
  },
  "Life support": {
    biosphereReclamationDomes: 15,
    aquaponicsMegaFacilities: 12,
    upliftTrainingAcademies: 10,
    atmosphericBiofilterStations: 8,
  },
  "Leisure & nightlife": {
    entertainmentMegaPlexes: 12,
    luxurySkyHotels: 10,
    virtualRealityArcades: 8,
    neonDistrictPromenades: 6,
  },
  "Transit": {
    undergroundMaglevSystem: 10,
  },
};

// Power-consuming units grouped into one display bucket. Mirrored from the unit
// drain terms in formulas.ts's powerDrain sum.
export const POWER_DRAIN_UNIT_BUCKETS: Record<string, Record<string, number>> = {
  "Drone patrols": {
    tacticalCombatDrones: 0.5,
    surveillanceDrones: 0.3,
  },
};

// Flat building-drain weight table, derived from the buckets so the two can
// never disagree.
export const POWER_DRAIN_WEIGHTS: Record<string, number> = Object.assign(
  {},
  ...Object.values(POWER_DRAIN_BUCKETS),
);

// Flat unit-drain weight table.
export const POWER_DRAIN_UNIT_WEIGHTS: Record<string, number> = Object.assign(
  {},
  ...Object.values(POWER_DRAIN_UNIT_BUCKETS),
);

// Each power grid stabilizer trims total drain by 3% (multiplicative). Mirrored
// from the powerStabilizer factor in formulas.ts, which is NOT clamped — see
// computeStabilizerFactor for the deliberate no-clamp behavior on over-stacks.
export const STABILIZER_DRAIN_REDUCTION = 0.03;

// Seasonal power-drain multipliers, applied to the stabilized drain. Mirrored
// from getSeasonalModifiers().powerDrain in weather.ts (all >= 1.0, so every
// season holds or raises demand — summer cooling and winter heating cost the
// most). Read via state.season so this module stays a leaf; the parity test in
// powerReversibility.test.ts pins these to weather.ts so they can't drift.
export const SEASON_POWER_DRAIN_MULT: Record<string, number> = {
  spring: 1.0,
  summer: 1.15,
  autumn: 1.05,
  winter: 1.25,
};

// Flat per-tick MW the active weather adds to drain, applied after the seasonal
// multiply (floored at 0). Mirrored from the powerDrain deltas in weather.ts's
// WEATHER_EFFECTS — only the storms and temperature extremes that actually cost
// power are listed; calm weather (e.g. "Overcast") adds nothing. Pinned to
// weather.ts by the parity test so the two can't drift.
export const WEATHER_POWER_DRAIN_DELTA: Record<string, number> = {
  "Electromagnetic Storm": 15,
  "Ion Storm": 20,
  "Solar Flare": 25,
  Heatwave: 10,
  Scorching: 5,
  Freezing: 10,
  "Cold Winds": 5,
  "Clear & Cold": 3,
  "Plasma Rain": 15,
  "Static Storm": 30,
  "Aurora Toxica": 10,
};

// Megaprojects that deliver a large power boost once operational, and the exact
// per-tick powerGeneration each adds. Mirrored from the powerGeneration
// megaproject switch in formulas.ts — these MUST stay in sync so the readout's
// supply matches the tick (a fusion_nexus/arcology can turn a plant-only deficit
// into a real surplus).
// The set of project IDs that generate power (used to suppress the "commission a
// power megaproject" tip once one is already operational). Derived from the
// output map so the two can never drift apart.
// Energy storage vaults buffer the grid against brownouts (they raise the power
// stockpile cap rather than adding per-tick generation). Named so the storage
// suggestion can highlight them.
export const ENERGY_STORAGE_BUILDING = "energyStorageVaults";
export const STABILIZER_BUILDING = "powerGridStabilizers";

// The single highest-weight building in a weight table — the exact card a
// recovery suggestion should land the player on. Ties resolve to the first
// (insertion-order) maximum, keeping the choice deterministic.
function highestWeightKey(weights: Record<string, number>): string | undefined {
  let best: string | undefined;
  let bestWeight = -Infinity;
  for (const key in weights) {
    if (weights[key] > bestWeight) {
      bestWeight = weights[key];
      best = key;
    }
  }
  return best;
}

// Precomputed top power plant, so a tapped "build generation" tip lands directly
// on the highest-output card in the energy category.
const TOP_GEN_BUILDING = highestWeightKey(POWER_GEN_WEIGHTS);

// powerGeneration: weighted power-plant output. Shared so the sim and the
// readout can never disagree.
export function computePowerGeneration(buildings: Record<string, number>): number {
  return computeBasePowerGeneration(buildings ?? {});
}

// Raw power drain (before grid stabilizers), summing the building and unit load.
export function computePowerDrain(
  buildings: Record<string, number>,
  units: Record<string, number>,
): number {
  return (
    sumWeighted(buildings ?? {}, POWER_DRAIN_WEIGHTS) +
    sumWeighted(units ?? {}, POWER_DRAIN_UNIT_WEIGHTS)
  );
}

// The multiplicative drain factor from grid stabilizers. Mirrors formulas.ts's
// powerStabilizer EXACTLY, including that it is NOT clamped: an over-stack of
// stabilizers drives the factor negative in the sim (drain flips into a small
// generation bonus), so the readout must mirror that rather than clamp at 0 and
// diverge from the tick math. Players won't realistically stack ~34+, but the
// diagnosis has to match what the grid actually does.
export function computeStabilizerFactor(buildings: Record<string, number>): number {
  const count = (buildings ?? {})[STABILIZER_BUILDING] ?? 0;
  return 1 - count * STABILIZER_DRAIN_REDUCTION;
}

export type PowerContributor = {
  label: string;
  /** Positive magnitude of this contributor's per-tick MW effect. Whether it
   *  adds supply or draws load is conveyed by which list it is in (positives
   *  generate power / cut drain; negatives consume power). */
  amount: number;
};

// Where a recovery suggestion deep-links to. Pure data (no navigation import) so
// this stays a leaf module; the UI maps these to concrete routes. A suggestion
// with no target renders as plain, non-tappable text.
export type PowerSuggestionTarget =
  // `highlight` (optional) is a building key the UI should scroll to and briefly
  // emphasize after opening the category — the last step of the fix loop.
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "megaprojects" };

export type PowerSuggestion = {
  text: string;
  target?: PowerSuggestionTarget;
};

export type PowerBreakdown = {
  /** Current power stockpile (MW), for the card headline. */
  power: number;
  generation: number;
  /** Raw drain before grid stabilizers. */
  rawDrain: number;
  /** Effective drain the sim subtracts: raw drain after grid stabilizers, then
   *  the active season's power multiplier and the active weather's flat power
   *  delta (floored at 0), mirroring formulas.ts's POWER block exactly. */
  effectiveDrain: number;
  /** Per-tick MW balance: positive = surplus (good), negative = deficit (bad).
   *  Mirrors the primary power levers in the sim (generation − effective drain,
   *  where effective drain already folds in the seasonal/weather swings). */
  netPerTick: number;
  /** Contributors adding grid headroom this tick (generation + stabilizer savings). */
  positives: PowerContributor[];
  /** Contributors drawing the grid down this tick (drain by sector). */
  negatives: PowerContributor[];
  suggestions: PowerSuggestion[];
};

function hasOperationalPowerMegaproject(state: GameState): boolean {
  const ids = new Set<string>(POWER_MEGAPROJECT_IDS);
  const projects = Array.isArray(state.megaProjects) ? state.megaProjects : [];
  return projects.some(
    (p) =>
      p &&
      (p as { phase?: string }).phase === "operational" &&
      ids.has((p as { projectId?: string }).projectId ?? ""),
  );
}

// Total per-tick power generation from operational megaprojects. Mirrors the
// powerGeneration additions in formulas.ts's operational-megaproject loop, so
// the readout's supply includes fusion_nexus/arcology output rather than
// diagnosing a deficit the sim doesn't actually have.
export function computeMegaprojectPowerOutput(state: GameState): number {
  const projects = Array.isArray(state.megaProjects) ? state.megaProjects : [];
  let total = 0;
  for (const p of projects) {
    if (!p || (p as { phase?: string }).phase !== "operational") continue;
    total += POWER_MEGAPROJECT_OUTPUT[(p as { projectId?: string }).projectId ?? ""] ?? 0;
  }
  return total;
}

/**
 * Compute a complete, legible breakdown of what is moving the power grid this
 * tick: the biggest supply and demand contributors, the net per-tick balance,
 * and concrete suggested recovery actions with deep-link targets. Pure and
 * read-only. Mirrors the actionable levers in formulas.ts's POWER block.
 */
export function computePowerBreakdown(
  state: GameState,
  authoritativeGeneration?: number,
): PowerBreakdown {
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const units = (state.units ?? {}) as Record<string, number>;

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const power = num(state.resources?.power, 0);

  const positives: PowerContributor[] = [];
  const negatives: PowerContributor[] = [];

  // ── Supply ──────────────────────────────────────────────────────────────────
  const production = computePowerProductionComponents(state);
  const generation =
    typeof authoritativeGeneration === "number" && Number.isFinite(authoritativeGeneration)
      ? authoritativeGeneration
      : production.totalOutput;
  const addOutputContribution = (label: string, amount: number) => {
    if (amount > 0) positives.push({ label, amount });
    if (amount < 0) negatives.push({ label, amount: -amount });
  };
  addOutputContribution("Power generation", production.speedAdjustedBase);
  addOutputContribution("Technology output", production.technologyOutput);
  addOutputContribution("Licensed corporations", production.licensedCorporationOutput);
  addOutputContribution("Active policies", production.policyOutput);
  addOutputContribution("Power megaproject output", production.megaprojectOutput);
  addOutputContribution(
    "Prestige multiplier",
    production.postPrestigeOutput - production.prePrestigeOutput,
  );
  const rawDrain = computePowerDrain(buildings, units);
  const stabilizerFactor = computeStabilizerFactor(buildings);
  const stabilizedDrain = Math.floor(rawDrain * stabilizerFactor);
  const stabilizerSavings = rawDrain - stabilizedDrain;
  if (stabilizerSavings > 0) {
    positives.push({ label: "Grid stabilizers", amount: stabilizerSavings });
  }

  // ── Seasonal & weather demand swings ─────────────────────────────────────────
  // Mirror formulas.ts's SEASONAL & WEATHER block exactly: multiply the
  // stabilized drain by the active season's power factor, then add the active
  // weather's flat power delta (floored at 0). Reading state.season /
  // state.weather (plain fields) keeps this a leaf module. Surfacing the extra
  // as one demand contributor keeps the card's net honest in winter or a storm
  // rather than under-reporting the load the sim actually applies.
  const season = typeof state.season === "string" ? state.season : undefined;
  const weather = typeof state.weather === "string" ? state.weather : undefined;
  const seasonalDrain = season
    ? Math.floor(stabilizedDrain * (SEASON_POWER_DRAIN_MULT[season] ?? 1))
    : stabilizedDrain;
  const weatherDelta = weather ? WEATHER_POWER_DRAIN_DELTA[weather] ?? 0 : 0;
  const effectiveDrain = weatherDelta
    ? Math.max(0, seasonalDrain + weatherDelta)
    : seasonalDrain;
  const seasonExtra = seasonalDrain - stabilizedDrain;
  const weatherExtra = effectiveDrain - seasonalDrain;
  const conditionExtra = effectiveDrain - stabilizedDrain;
  if (conditionExtra > 0) {
    const label =
      seasonExtra > 0 && weatherExtra > 0
        ? "Seasonal & weather load"
        : seasonExtra > 0
          ? "Seasonal load"
          : "Weather load";
    negatives.push({ label, amount: conditionExtra });
  }

  // ── Demand (drain by sector) ─────────────────────────────────────────────────
  for (const [label, weights] of Object.entries(POWER_DRAIN_BUCKETS)) {
    const load = sumWeighted(buildings, weights);
    if (load > 0) negatives.push({ label, amount: load });
  }
  for (const [label, weights] of Object.entries(POWER_DRAIN_UNIT_BUCKETS)) {
    const load = sumWeighted(units, weights);
    if (load > 0) negatives.push({ label, amount: load });
  }

  const netPerTick = generation - effectiveDrain;

  // Keep the biggest movers first so the UI can show a short, honest summary.
  positives.sort((a, b) => b.amount - a.amount);
  negatives.sort((a, b) => b.amount - a.amount);

  // ── Concrete, prioritized recovery suggestions ───────────────────────────────
  // Only nag when the grid is genuinely a concern: running a deficit, or the
  // stockpile is low enough that a brownout is near.
  const deficit = netPerTick < 0;
  const lowStockpile = power <= CRISIS_THRESHOLDS.power.trigger;
  const needsAttention = deficit || lowStockpile;
  const suggestions: PowerSuggestion[] = [];

  if (needsAttention) {
    if (deficit) {
      suggestions.push({
        text: "Build more generation — fusion reactors and micro-fusion generators add the most power per plant.",
        target: { screen: "construction", category: "energy", highlight: TOP_GEN_BUILDING },
      });
    }
    if (deficit && rawDrain > 0 && stabilizerFactor > 0.4) {
      suggestions.push({
        text: "Add power grid stabilizers — each one trims 3% off your total drain, stretching existing generation further.",
        target: { screen: "construction", category: "energy", highlight: STABILIZER_BUILDING },
      });
    }
    if (needsAttention && (buildings[ENERGY_STORAGE_BUILDING] ?? 0) === 0) {
      suggestions.push({
        text: "Build energy storage vaults — they bank surplus power to ride out brownouts before the grid goes dark.",
        target: { screen: "construction", category: "energy", highlight: ENERGY_STORAGE_BUILDING },
      });
    }
    if (deficit && !hasOperationalPowerMegaproject(state)) {
      suggestions.push({
        text: "Commission a power megaproject — the Fusion Nexus and Arcology deliver a massive one-shot boost to generation.",
        target: { screen: "megaprojects" },
      });
    }
  }

  return {
    power,
    generation,
    rawDrain,
    effectiveDrain,
    netPerTick,
    positives,
    negatives,
    suggestions,
  };
}

// The stockpile value at which the grid starts browning out: once the buffer is
// spent, the sector runs on live generation alone and the deficit bites.
export const POWER_BROWNOUT_THRESHOLD = 0;
// The hard floor the sim clamps the power stockpile to (Math.max(-1000, …) in
// formulas.ts's POWER block). Past a brownout the deficit keeps digging the
// stockpile down to here, where the grid is fully dark.
export const POWER_STOCKPILE_FLOOR = -1000;

// Task #430: the imminent-brownout warn window, in ticks. When computePowerEta
// projects the grid reaching its next dark milestone (a brownout at 0, or a full
// blackout at the floor) within this many ticks, the engine fires a single
// on-screen advisory so a player not looking at the power card still gets a
// heads-up. Kept beside the thresholds it is measured against so the warn timing
// stays next to the ETA math it depends on.
export const POWER_BROWNOUT_WARN_TICKS = 12;

export type PowerEta = {
  /** "brownout" — the stockpile is still positive and about to hit 0, where the
   *  buffer runs out and the grid starts browning out; "blackout" — already in
   *  the red, sinking toward the -1000 floor where the grid goes fully dark. */
  kind: "brownout" | "blackout";
  /** The stockpile value being approached (0 for a brownout, the floor for a
   *  blackout). */
  target: number;
  /** Whole ticks until the target is reached at the current deficit pace. */
  ticks: number;
};

/**
 * Project how many ticks until the power grid goes dark at the current pace.
 * Mirrors the biosphere ETA (computeBiosphereEta): pure and read-only, and only
 * honest when the grid is genuinely losing ground. Returns null when the grid
 * is balanced or in surplus (netPerTick >= 0), since there is nothing to warn
 * about — the stockpile is holding or climbing.
 *
 * The sim drains the stockpile by netPerTick each tick and clamps it with
 * Math.max(-1000, …), so this walks the same path:
 *   - a positive stockpile hits the brownout threshold (0) first, then
 *   - a stockpile already at or below 0 sinks toward the -1000 floor.
 * Returns null once the stockpile is already at/below the floor (the drain is
 * clamped there, so there is no further ETA to promise).
 */
export function computePowerEta(
  breakdown: PowerBreakdown,
  currentStockpile: number,
): PowerEta | null {
  const net = breakdown.netPerTick;
  // Balanced or surplus (including a near-zero hold): nothing going dark.
  if (!Number.isFinite(net) || net >= -0.05) return null;
  const drain = -net; // positive per-tick deficit magnitude
  const power = Number.isFinite(currentStockpile)
    ? currentStockpile
    : breakdown.power;

  if (power > POWER_BROWNOUT_THRESHOLD) {
    const ticks = Math.ceil((power - POWER_BROWNOUT_THRESHOLD) / drain);
    if (!Number.isFinite(ticks) || ticks <= 0) return null;
    return { kind: "brownout", target: POWER_BROWNOUT_THRESHOLD, ticks };
  }
  if (power > POWER_STOCKPILE_FLOOR) {
    const ticks = Math.ceil((power - POWER_STOCKPILE_FLOOR) / drain);
    if (!Number.isFinite(ticks) || ticks <= 0) return null;
    return { kind: "blackout", target: POWER_STOCKPILE_FLOOR, ticks };
  }
  return null; // already at/below the floor — the sim clamps the drain here
}

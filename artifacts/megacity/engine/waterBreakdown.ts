import type { GameState } from "@/engine/types";
import {
  computeMegaprojectOutput,
  computeWaterProduction as computeBaseWaterProduction,
  computeWaterProductionComponents,
  WATER_MEGAPROJECT_IDS as SHARED_WATER_MEGAPROJECT_IDS,
  WATER_MEGAPROJECT_OUTPUT as SHARED_WATER_MEGAPROJECT_OUTPUT,
  WATER_PROD_WEIGHTS as SHARED_WATER_PROD_WEIGHTS,
} from "@/engine/utilityProduction";

export const WATER_PROD_WEIGHTS = SHARED_WATER_PROD_WEIGHTS;
export const WATER_MEGAPROJECT_OUTPUT = SHARED_WATER_MEGAPROJECT_OUTPUT;
export const WATER_MEGAPROJECT_IDS = SHARED_WATER_MEGAPROJECT_IDS;

// ─────────────────────────────────────────────────────────────────────────────
// Water breakdown — the single source of truth for what is producing and
// consuming the sector's water supply each tick, and by how much, plus concrete
// one-tap recovery suggestions that deep-link to the right screen. This mirrors
// the power / crime / biosphere breakdown pattern (see powerBreakdown.ts) but
// for water, where HIGHER is better: `netPerTick` is the per-tick water balance,
// so a positive value means a SURPLUS (good) and a negative value means a
// SHORTAGE (the stockpile is draining — bad).
//
// This is a LEAF module: it imports only types. The per-tick water math it
// mirrors lives in formulas.ts's runTick (the waterProduction / waterConsumption
// block). Secondary modifiers the sim also applies (technology bonuses, company
// output, active policies, prestige multiplier, seasonal swings, the speed-demon
// x3) are intentionally omitted here — the readout names the actionable levers a
// player can build, not every hidden coefficient.
// ─────────────────────────────────────────────────────────────────────────────

// Water-production buildings and their per-building output. Mirrored from the
// waterProduction sum in formulas.ts.
// Water demand is driven by the population, scaled by the income-class mix:
// wealthier citizens use more, poorer citizens use less. Mirrored exactly from
// formulas.ts's waterConsumption line:
//   classMultiplier = 1 + highPct*0.3 - lowPct*0.1
//   waterConsumption = floor((population / WATER_CONSUMPTION_DIVISOR) * classMultiplier)
export const WATER_CONSUMPTION_DIVISOR = 5500;
export const HIGH_INCOME_WATER_MULT = 0.3;
export const LOW_INCOME_WATER_MULT = 0.1;

// Megaprojects that deliver a large water boost once operational, and the exact
// per-tick waterProduction each adds. Mirrored from the waterProduction
// megaproject switch in formulas.ts — these MUST stay in sync so the readout's
// supply matches the tick (a subterranean_reservoir can turn a plant-only
// shortage into a real surplus).
// The set of project IDs that produce water (used to suppress the "commission a
// water megaproject" tip once one is already operational). Derived from the
// output map so the two can never drift apart.
// The single highest-output building in a weight table — the exact card a
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

// Precomputed top water plant, so a tapped "build production" tip lands directly
// on the highest-output card in the water category.
const TOP_PROD_BUILDING = highestWeightKey(WATER_PROD_WEIGHTS);

// waterProduction: weighted water-plant output. Shared so the sim and the
// readout can never disagree.
export function computeWaterProduction(buildings: Record<string, number>): number {
  return computeBaseWaterProduction(buildings ?? {});
}

// waterConsumption: the population's per-tick water draw, scaled by the
// income-class mix. Mirrors formulas.ts EXACTLY, including the Math.floor.
export function computeWaterConsumption(
  population: number,
  highIncomePopulation: number,
  lowIncomePopulation: number,
): number {
  const pop = Number.isFinite(population) && population > 0 ? population : 0;
  if (pop <= 0) return 0;
  const denom = Math.max(1, pop);
  const highPct = (Number.isFinite(highIncomePopulation) ? highIncomePopulation : 0) / denom;
  const lowPct = (Number.isFinite(lowIncomePopulation) ? lowIncomePopulation : 0) / denom;
  const classMultiplier = 1 + highPct * HIGH_INCOME_WATER_MULT - lowPct * LOW_INCOME_WATER_MULT;
  return Math.floor((pop / WATER_CONSUMPTION_DIVISOR) * classMultiplier);
}

export type WaterContributor = {
  label: string;
  /** Positive magnitude of this contributor's per-tick water effect. Whether it
   *  adds supply or draws demand is conveyed by which list it is in (positives
   *  produce water; negatives consume it). */
  amount: number;
};

// Where a recovery suggestion deep-links to. Pure data (no navigation import) so
// this stays a leaf module; the UI maps these to concrete routes. A suggestion
// with no target renders as plain, non-tappable text.
export type WaterSuggestionTarget =
  // `highlight` (optional) is a building key the UI should scroll to and briefly
  // emphasize after opening the category — the last step of the fix loop.
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "megaprojects" };

export type WaterSuggestion = {
  text: string;
  target?: WaterSuggestionTarget;
};

export type WaterBreakdown = {
  /** Current water stockpile, for the card headline. */
  water: number;
  production: number;
  consumption: number;
  /** Per-tick water balance: positive = surplus (good), negative = shortage
   *  (bad). Mirrors the primary water levers in the sim (production − consumption). */
  netPerTick: number;
  /** Contributors adding to the supply this tick (production by plant). */
  positives: WaterContributor[];
  /** Contributors drawing the supply down this tick (population demand). */
  negatives: WaterContributor[];
  suggestions: WaterSuggestion[];
};

function hasOperationalWaterMegaproject(state: GameState): boolean {
  const ids = new Set<string>(WATER_MEGAPROJECT_IDS);
  const projects = Array.isArray(state.megaProjects) ? state.megaProjects : [];
  return projects.some(
    (p) =>
      p &&
      (p as { phase?: string }).phase === "operational" &&
      ids.has((p as { projectId?: string }).projectId ?? ""),
  );
}

// Total per-tick water production from operational megaprojects. Mirrors the
// waterProduction additions in formulas.ts's operational-megaproject loop, so
// the readout's supply includes subterranean_reservoir output rather than
// diagnosing a shortage the sim doesn't actually have.
export function computeMegaprojectWaterOutput(state: GameState): number {
  return computeMegaprojectOutput(state, WATER_MEGAPROJECT_OUTPUT);
}

/**
 * Compute a complete, legible breakdown of what is moving the water supply this
 * tick: the biggest production and demand contributors, the net per-tick
 * balance, and concrete suggested recovery actions with deep-link targets. Pure
 * and read-only. Mirrors the actionable levers in formulas.ts's water block.
 */
export function computeWaterBreakdown(
  state: GameState,
  authoritativeProduction?: number,
): WaterBreakdown {
  const buildings = (state.buildings ?? {}) as Record<string, number>;

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const water = num(state.resources?.water, 0);
  const population = num(state.cityStats?.population, 0);
  const highIncome = num(state.demographics?.highIncomePopulation, 0);
  const lowIncome = num(state.demographics?.lowIncomePopulation, 0);

  const positives: WaterContributor[] = [];
  const negatives: WaterContributor[] = [];

  // ── Supply ──────────────────────────────────────────────────────────────────
  const productionComponents = computeWaterProductionComponents(state);
  const hasAuthoritativeProduction =
    typeof authoritativeProduction === "number" && Number.isFinite(authoritativeProduction);
  const production = hasAuthoritativeProduction
    ? authoritativeProduction
    : productionComponents.totalOutput;
  const addOutputContribution = (label: string, amount: number) => {
    if (amount > 0) positives.push({ label, amount });
    if (amount < 0) negatives.push({ label, amount: -amount });
  };
  addOutputContribution("Water production", productionComponents.speedAdjustedBase);
  addOutputContribution("Technology output", productionComponents.technologyOutput);
  addOutputContribution("Licensed corporations", productionComponents.licensedCorporationOutput);
  addOutputContribution("Active policies", productionComponents.policyOutput);
  addOutputContribution("Water megaproject output", productionComponents.megaprojectOutput);
  addOutputContribution(
    "Prestige multiplier",
    productionComponents.postPrestigeOutput - productionComponents.prePrestigeOutput,
  );
  const finalModifierDelta = production - productionComponents.postPrestigeOutput;
  addOutputContribution(
    hasAuthoritativeProduction && production !== productionComponents.totalOutput
      ? "Other active modifiers"
      : "Seasonal water output",
    finalModifierDelta,
  );

  // ── Demand ───────────────────────────────────────────────────────────────────
  const consumption = computeWaterConsumption(population, highIncome, lowIncome);
  if (consumption > 0) {
    negatives.push({ label: "Population water use", amount: consumption });
  }

  const netPerTick = production - consumption;

  // Keep the biggest movers first so the UI can show a short, honest summary.
  positives.sort((a, b) => b.amount - a.amount);
  negatives.sort((a, b) => b.amount - a.amount);

  // ── Concrete, prioritized recovery suggestions ───────────────────────────────
  // Only nag when the supply is genuinely a concern: running a shortage, or the
  // stockpile is low enough that a dry-out is near.
  const shortage = netPerTick < 0;
  const lowStockpile = water < 500;
  const needsAttention = shortage || lowStockpile;
  const suggestions: WaterSuggestion[] = [];

  if (needsAttention) {
    suggestions.push({
      text: "Build more water production — recycling super-facilities and mega-desalination plants add the most water per plant.",
      target: { screen: "construction", category: "water", highlight: TOP_PROD_BUILDING },
    });
    if (shortage && !hasOperationalWaterMegaproject(state)) {
      suggestions.push({
        text: "Commission the Subterranean Reservoir megaproject — it delivers a massive one-shot boost to water production.",
        target: { screen: "megaprojects" },
      });
    }
  }

  return {
    water,
    production,
    consumption,
    netPerTick,
    positives,
    negatives,
    suggestions,
  };
}

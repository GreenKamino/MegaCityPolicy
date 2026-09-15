import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Transit breakdown — the single source of truth for the sector's transit
// capacity vs load, what is providing capacity, what is generating load, and
// concrete one-tap fixes when the grid is overloaded. This mirrors the power /
// water / crime "diagnose -> one-tap fix" pattern. Transit is a capacity-vs-
// demand system (like power and water), not a 0..100 drift stat: the sim only
// penalizes when load exceeds capacity, and the penalty is a steady per-tick
// drain on Happiness (-1) and Employment (-0.5).
//
// This is a LEAF module: it imports only types. The transit math it mirrors
// lives in formulas.ts's utilities block (transitCapacity / transitLoad and
// the overload penalty).
// ─────────────────────────────────────────────────────────────────────────────

// Transit infrastructure and its per-building capacity. Mirrored from the
// transitCapacity sum in formulas.ts.
export const TRANSIT_CAPACITY_BUILDING_WEIGHTS: Record<string, number> = {
  undergroundMaglevSystem: 50,
  skyrailTransitLines: 30,
  cargoFreightMegaways: 20,
  droneLogisticsCorridors: 15,
  rapidEmergencyTransitLines: 10,
  pedestrianSkybridgeNetworks: 8,
};

// Transit droids and their per-unit capacity. Mirrored from the
// transitCapacity sum in formulas.ts.
export const TRANSIT_CAPACITY_UNIT_WEIGHTS: Record<string, number> = {
  trafficControlDroid: 4,
  cargoHandlerDroid: 3,
};

// Load generators and their per-building load. Mirrored from the transitLoad
// sum in formulas.ts.
export const TRANSIT_LOAD_BUILDING_WEIGHTS: Record<string, number> = {
  habBlockMegaTowers: 8,
  megaManufacturingPlants: 5,
  workerHousingStacks: 5,
};

// Every 6,000 citizens add 1 point of transit load. Mirrored from formulas.ts.
export const TRANSIT_POP_PER_LOAD_POINT = 6000;

// The per-tick penalties the sim applies while load > capacity. Mirrored from
// the overload branch in formulas.ts's utilities block.
export const TRANSIT_OVERLOAD_HAPPINESS_PENALTY = 1;
export const TRANSIT_OVERLOAD_EMPLOYMENT_PENALTY = 0.5;

// The card starts warning when load reaches this share of capacity, so the
// Commander hears about the squeeze before the penalties start.
export const TRANSIT_WARN_LOAD_RATIO = 0.9;

function sumWeights(
  counts: Record<string, number>,
  weights: Record<string, number>,
): number {
  let total = 0;
  for (const key in weights) {
    total += (counts[key] ?? 0) * weights[key];
  }
  return total;
}

// Total transit capacity from lines, corridors, and droids. Shared so the sim
// and the readout can never disagree.
export function computeTransitCapacity(
  buildings: Record<string, number>,
  units: Record<string, number>,
): number {
  return (
    sumWeights(buildings ?? {}, TRANSIT_CAPACITY_BUILDING_WEIGHTS) +
    sumWeights(units ?? {}, TRANSIT_CAPACITY_UNIT_WEIGHTS)
  );
}

// Total transit load from population and heavy buildings. Shared so the sim
// and the readout can never disagree.
export function computeTransitLoad(
  population: number,
  buildings: Record<string, number>,
): number {
  return (
    Math.floor(Math.max(0, population) / TRANSIT_POP_PER_LOAD_POINT) +
    sumWeights(buildings ?? {}, TRANSIT_LOAD_BUILDING_WEIGHTS)
  );
}

export type TransitContributor = {
  label: string;
  /** Capacity points provided (capacity list) or load points generated
   *  (load list). Always a positive magnitude. */
  amount: number;
};

// Where a fix suggestion deep-links to. Pure data (no navigation import) so
// this stays a leaf module; the UI maps these to concrete routes. A suggestion
// with no target renders as plain, non-tappable text.
export type TransitSuggestionTarget =
  // `highlight` (optional) is a building key the UI should scroll to and
  // briefly emphasize after opening the category — the last step of the fix loop.
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "recruitment" };

export type TransitSuggestion = {
  text: string;
  target?: TransitSuggestionTarget;
};

export type TransitBreakdown = {
  transitCapacity: number;
  transitLoad: number;
  /** True while the sim is applying the overload penalties (load > capacity). */
  overloaded: boolean;
  /** Capacity minus load — negative while overloaded. */
  headroom: number;
  /** What is providing transit capacity (good). */
  capacitySources: TransitContributor[];
  /** What is generating transit load (demand). */
  loadSources: TransitContributor[];
  suggestions: TransitSuggestion[];
};

/**
 * Compute a complete, legible breakdown of the sector's transit grid: total
 * capacity vs total load, which infrastructure provides the capacity, what
 * generates the demand, whether the overload penalty is active, and concrete
 * suggested fixes with deep-link targets. Pure and read-only. Mirrors the
 * transit math in formulas.ts's utilities block.
 */
export function computeTransitBreakdown(state: GameState): TransitBreakdown {
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const units = (state.units ?? {}) as Record<string, number>;

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const population = num(state.cityStats?.population, 0);

  const transitCapacity = computeTransitCapacity(buildings, units);
  const transitLoad = computeTransitLoad(population, buildings);
  const overloaded = transitLoad > transitCapacity;
  const headroom = transitCapacity - transitLoad;

  // ── Capacity sources (good) ─────────────────────────────────────────────────
  const capacityLabels: Record<string, string> = {
    undergroundMaglevSystem: "Underground maglev",
    skyrailTransitLines: "Skyrail lines",
    cargoFreightMegaways: "Freight megaways",
    droneLogisticsCorridors: "Drone corridors",
    rapidEmergencyTransitLines: "Emergency transit lines",
    pedestrianSkybridgeNetworks: "Skywalk networks",
    trafficControlDroid: "Traffic control droids",
    cargoHandlerDroid: "Cargo handler droids",
  };
  const capacitySources: TransitContributor[] = [];
  for (const key in TRANSIT_CAPACITY_BUILDING_WEIGHTS) {
    const amount = (buildings[key] ?? 0) * TRANSIT_CAPACITY_BUILDING_WEIGHTS[key];
    if (amount > 0) capacitySources.push({ label: capacityLabels[key] ?? key, amount });
  }
  for (const key in TRANSIT_CAPACITY_UNIT_WEIGHTS) {
    const amount = (units[key] ?? 0) * TRANSIT_CAPACITY_UNIT_WEIGHTS[key];
    if (amount > 0) capacitySources.push({ label: capacityLabels[key] ?? key, amount });
  }

  // ── Load sources (demand) ───────────────────────────────────────────────────
  const loadSources: TransitContributor[] = [];
  const popLoad = Math.floor(Math.max(0, population) / TRANSIT_POP_PER_LOAD_POINT);
  if (popLoad > 0) loadSources.push({ label: "Citizen commuters", amount: popLoad });
  const loadLabels: Record<string, string> = {
    habBlockMegaTowers: "Hab-block mega towers",
    megaManufacturingPlants: "Mega manufacturing",
    workerHousingStacks: "Worker housing stacks",
  };
  for (const key in TRANSIT_LOAD_BUILDING_WEIGHTS) {
    const amount = (buildings[key] ?? 0) * TRANSIT_LOAD_BUILDING_WEIGHTS[key];
    if (amount > 0) loadSources.push({ label: loadLabels[key] ?? key, amount });
  }

  // Keep the biggest movers first so the UI can show a short, honest summary.
  capacitySources.sort((a, b) => b.amount - a.amount);
  loadSources.sort((a, b) => b.amount - a.amount);

  // ── Concrete, prioritized fixes ─────────────────────────────────────────────
  // Nag when the grid is overloaded, or close enough that growth will tip it.
  const nearCapacity =
    transitLoad > 0 && transitLoad >= transitCapacity * TRANSIT_WARN_LOAD_RATIO;
  const needsAttention = overloaded || nearCapacity;
  const suggestions: TransitSuggestion[] = [];

  if (needsAttention) {
    suggestions.push({
      text: "Build transit lines — an Underground Maglev System adds 50 capacity, Skyrail Transit Lines add 30 each.",
      target: { screen: "construction", category: "transit", highlight: "undergroundMaglevSystem" },
    });
    suggestions.push({
      text: "Hire traffic control and cargo handler droids — a quick capacity patch without new construction.",
      target: { screen: "recruitment" },
    });
    if (overloaded) {
      // No screen demolishes load, so this stays a plain, non-tappable note.
      suggestions.push({
        text: "Heavy districts strain the grid — every hab-block mega tower, worker housing stack, and mega manufacturing plant adds load, so pair them with new lines.",
      });
    }
  }

  return {
    transitCapacity,
    transitLoad,
    overloaded,
    headroom,
    capacitySources,
    loadSources,
    suggestions,
  };
}

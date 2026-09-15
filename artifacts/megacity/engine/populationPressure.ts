import { computeJobSlots } from "@/engine/employmentBreakdown";
import { computeHousingCapacity } from "@/engine/housingCapacity";
import { computePopulationCohorts } from "@/engine/populationCohorts";
import { computeHealthBase } from "@/engine/healthBreakdown";
import { computeRepairStrength } from "@/engine/infrastructureBreakdown";
import {
  computeTransitCapacity,
  computeTransitLoad,
} from "@/engine/transitBreakdown";
import type { GameState } from "@/engine/types";

export const POPULATION_CAPACITY_RESERVE_RATIO = 0.12;

export const POPULATION_TIERS = [
  { id: "enclave", label: "ENCLAVE", minPopulation: 0 },
  { id: "sector-city", label: "SECTOR CITY", minPopulation: 250_000 },
  { id: "metropolis", label: "METROPOLIS", minPopulation: 500_000 },
  { id: "megacity", label: "MEGACITY", minPopulation: 1_000_000 },
  { id: "greater-megacity", label: "GREATER MEGACITY", minPopulation: 1_500_000 },
  { id: "continental-hub", label: "CONTINENTAL HUB", minPopulation: 3_000_000 },
  { id: "titan-city", label: "TITAN CITY", minPopulation: 5_000_000 },
] as const;

export type PopulationTier = (typeof POPULATION_TIERS)[number];
export type PopulationCapacityStatus = "ready" | "tight" | "shortfall";

export type PopulationCapacityMetric = {
  id:
    | "food"
    | "water"
    | "power"
    | "housing"
    | "jobs"
    | "medical"
    | "transit"
    | "infrastructure"
    | "emergency"
    | "security"
    | "military";
  label: string;
  actual: number;
  target: number;
  reserveTarget: number;
  unit: string;
  status: PopulationCapacityStatus;
  coverage: number;
};

export type PopulationPressureSnapshot = {
  population: number;
  tier: PopulationTier;
  nextTier: PopulationTier | null;
  progressToNextTier: number;
  approachingNextTier: boolean;
  recentlyEnteredTier: boolean;
  reserveRatio: number;
  metrics: PopulationCapacityMetric[];
  pressuredMetrics: PopulationCapacityMetric[];
};

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

export function getPopulationTier(population: number): {
  tier: PopulationTier;
  nextTier: PopulationTier | null;
  progressToNextTier: number;
} {
  const pop = finite(population);
  let tier: PopulationTier = POPULATION_TIERS[0];
  let tierIndex = 0;
  for (let i = 1; i < POPULATION_TIERS.length; i += 1) {
    if (pop < POPULATION_TIERS[i].minPopulation) break;
    tier = POPULATION_TIERS[i];
    tierIndex = i;
  }
  const nextTier = POPULATION_TIERS[tierIndex + 1] ?? null;
  const progressToNextTier = nextTier
    ? Math.max(
        0,
        Math.min(
          1,
          (pop - tier.minPopulation) /
            Math.max(1, nextTier.minPopulation - tier.minPopulation),
        ),
      )
    : 1;
  return { tier, nextTier, progressToNextTier };
}

function metric(
  id: PopulationCapacityMetric["id"],
  label: string,
  actual: number,
  target: number,
  unit: string,
): PopulationCapacityMetric {
  const safeActual = finite(actual);
  const safeTarget = finite(target);
  const reserveTarget = safeTarget * (1 + POPULATION_CAPACITY_RESERVE_RATIO);
  const coverage = reserveTarget > 0 ? safeActual / reserveTarget : 1;
  return {
    id,
    label,
    actual: safeActual,
    target: safeTarget,
    reserveTarget,
    unit,
    coverage,
    status:
      safeActual < safeTarget
        ? "shortfall"
        : safeActual < reserveTarget
          ? "tight"
          : "ready",
  };
}

/**
 * Read-only city-planning snapshot. It intentionally does not mutate percentage
 * health stats or persist tier state: old saves, live ticks, and catch-up ticks
 * all derive the same targets from the population and current capacity.
 */
export function computePopulationPressure(
  state: GameState,
): PopulationPressureSnapshot {
  const population = finite(state.cityStats?.population);
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const units = (state.units ?? {}) as Record<string, number>;
  const rates = state.rates;
  const demographics = state.demographics;
  const logistics = state.militaryOverhaul?.logistics;
  const cohorts = computePopulationCohorts(state);

  const workforce = cohorts.workforceCapacity;
  const employedCitizens =
    workforce * (finite(state.cityStats?.employment) / 100);
  const jobTarget = workforce * 0.7;
  const medicalTarget = (population + cohorts.healthServiceDemand) / 100_000;
  const infrastructureTarget = population / 100_000;
  const emergencyCoverage =
    population * (finite(demographics?.emergencyResponseCoverage) / 100);
  const securityTarget = population / 5_000;
  const militaryTarget = population / 5_000;

  const metrics: PopulationCapacityMetric[] = [
    metric("food", "FOOD", rates?.foodProduction, rates?.foodConsumption, "/tick"),
    metric("water", "WATER", rates?.waterProduction, rates?.waterConsumption, "/tick"),
    metric("power", "POWER", rates?.powerGeneration, rates?.powerDrain, "MW"),
    metric("housing", "HOUSING", computeHousingCapacity(buildings), cohorts.housingDemand, "people"),
    metric("jobs", "JOBS", Math.max(computeJobSlots(buildings), employedCitizens), jobTarget, "jobs"),
    metric("medical", "MEDICAL", computeHealthBase(buildings, units), medicalTarget, "capacity"),
    metric("transit", "TRANSIT", computeTransitCapacity(buildings, units), computeTransitLoad(population, buildings), "load"),
    metric("infrastructure", "REPAIR", computeRepairStrength(units), infrastructureTarget, "capacity"),
    metric("emergency", "EMERGENCY", emergencyCoverage, population * 0.85, "people"),
    metric("security", "SECURITY", demographics?.securityWorkforce, securityTarget, "staff"),
    metric(
      "military",
      "MILITARY",
      logistics?.personnelTotal ?? state.militaryOverhaul?.totalPersonnel ?? 0,
      militaryTarget,
      "staff",
    ),
  ];

  const tierInfo = getPopulationTier(population);
  const pressuredMetrics = metrics
    .filter((item) => item.status !== "ready")
    .sort((a, b) => a.coverage - b.coverage);

  return {
    population,
    ...tierInfo,
    approachingNextTier:
      tierInfo.nextTier !== null && tierInfo.progressToNextTier >= 0.8,
    recentlyEnteredTier:
      tierInfo.tier.minPopulation > 0 &&
      population <=
        tierInfo.tier.minPopulation +
          Math.max(25_000, tierInfo.tier.minPopulation * 0.025),
    reserveRatio: POPULATION_CAPACITY_RESERVE_RATIO,
    metrics,
    pressuredMetrics,
  };
}

export function formatPopulationCapacityValue(
  value: number,
  unit: string,
): string {
  const rounded = Math.round(value);
  if (unit === "people" || unit === "jobs" || unit === "staff") {
    return rounded.toLocaleString();
  }
  return rounded.toString();
}
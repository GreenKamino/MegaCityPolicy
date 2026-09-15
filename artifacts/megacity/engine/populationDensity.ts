import type { GameState } from "@/engine/types";

/**
 * Population density is a gradual strategic tradeoff, not a tier penalty.
 * Pressure begins above 750k citizens, rises smoothly with each doubling, and
 * caps at 3× so growth remains desirable and every drain stays counterable.
 */
export const DENSITY_PRESSURE_START_POPULATION = 750_000;
export const MAX_DENSITY_PRESSURE_LEVEL = 3;

export type PopulationDensityPressure = {
  population: number;
  level: number;
  active: boolean;
  crimePerTick: number;
  unrestPerTick: number;
  diseaseRiskPerTick: number;
  publicHealthDrainPerTick: number;
  biosphereDrainPerTick: number;
};

function finitePopulation(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

export function computePopulationDensityPressure(
  stateOrPopulation: GameState | number,
): PopulationDensityPressure {
  const population = finitePopulation(
    typeof stateOrPopulation === "number"
      ? stateOrPopulation
      : stateOrPopulation.cityStats?.population,
  );
  const level =
    population > DENSITY_PRESSURE_START_POPULATION
      ? Math.min(
          MAX_DENSITY_PRESSURE_LEVEL,
          Math.log2(population / DENSITY_PRESSURE_START_POPULATION),
        )
      : 0;

  return {
    population,
    level,
    active: level > 0,
    crimePerTick: level * 0.08,
    unrestPerTick: level * 0.06,
    diseaseRiskPerTick: level * 0.08,
    publicHealthDrainPerTick: level * 0.06,
    biosphereDrainPerTick: level * 0.1,
  };
}
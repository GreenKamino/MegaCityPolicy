import { computeHousingCapacity } from "@/engine/housingCapacity";
import type { GameState, PopulationCohorts } from "@/engine/types";
import { getIncarcerationSummary } from "@/engine/custody";

/**
 * First-wave citizen cohorts. These are intentionally derived from existing
 * population, building, and health mechanics rather than becoming a second
 * population total. Counts may overlap (a homeless resident can also be sick),
 * while the capacity fields are bounded model inputs for downstream systems.
 */
export const COHORT_SICK_RATE_FACTOR = 0.08;
export const COHORT_REFUGEE_HOUSING_FACTOR = 0.2;
// Keep the extra flat health penalty for crisis-scale cohort load so ordinary
// disease risk remains represented by the existing disease-risk term.
export const COHORT_HEALTH_LOAD_RATIO = 0.2;

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function boundedCount(value: unknown, population: number): number {
  return Math.min(population, Math.round(finite(value)));
}

function building(buildings: Record<string, number>, key: string): number {
  return finite(buildings[key]);
}

/**
 * Derive the shared cohort snapshot used by the engine and all readouts.
 * Derivation is read-only and safe for partially shaped legacy states.
 */
export function computePopulationCohorts(state: Pick<
  GameState,
  "cityStats" | "buildings" | "demographics" | "custody"
>): PopulationCohorts {
  const population = finite(state.cityStats?.population);
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const demographics = state.demographics ?? ({} as GameState["demographics"]);

  const homeless = boundedCount(
    Math.max(0, population - computeHousingCapacity(buildings)),
    population,
  );
  // POWs are external captives, not resident citizens. Only civilian custody
  // reduces the resident workforce; guard and capacity demand use total custody.
  const prisoners = boundedCount(getIncarcerationSummary(state).civilians, population);
  const refugees = boundedCount(
    building(buildings, "refugeeProcessingHousing") * 200 +
      Math.round(population * 0.01),
    population,
  );

  // Disease risk is the live source of truth. The small factor preserves the
  // existing readout's scale (roughly 2% sick in an ordinary city) while
  // allowing severe outbreaks to create a larger care cohort.
  const diseaseRisk = Math.min(100, finite(state.cityStats?.diseaseRisk));
  const sick = boundedCount(
    population * (diseaseRisk / 100) * COHORT_SICK_RATE_FACTOR,
    population,
  );

  const lifeExpectancy = finite(demographics.averageLifeExpectancy) || 50;
  const retireeRatio =
    lifeExpectancy > 60 ? 0.15 : lifeExpectancy > 45 ? 0.12 : 0.08;
  const retirees = boundedCount(population * retireeRatio, population);
  const orphans = boundedCount(demographics.orphanPopulation, population);
  // These are capacity/demand signals, not extra citizens. They cap at a
  // small multiple of population so malformed or extreme saves cannot turn
  // one cohort into an unbounded engine multiplier.
  const workforceCapacity = Math.min(
    population,
    Math.max(
      0,
      population -
        retirees -
        orphans -
        prisoners -
        sick * 0.5 -
        homeless * 0.25,
    ),
  );
  const housingDemand = Math.min(
    population * 1.5,
    population + refugees * COHORT_REFUGEE_HOUSING_FACTOR + orphans * 0.1,
  );
  const healthServiceDemand = Math.min(
    population * 2,
    sick * 2 + homeless * 0.5 + refugees * 0.15 + prisoners * 0.25,
  );
  const unrestPressure =
    population > 0
      ? Math.min(
          100,
          ((homeless * 1.5 + refugees * 0.4 + prisoners * 0.25 + orphans * 0.5) /
            population) *
            100,
        )
      : 0;
  // Match the canonical workforce catalog: employment is a share of the
  // cohort-adjusted working capacity, not a share of every resident.
  const employmentRate = Math.min(100, finite(state.cityStats?.employment));
  const workers = boundedCount(workforceCapacity * employmentRate / 100, population);
  const unemployed = boundedCount(workforceCapacity - workers, population);
  // Mirror updateDemographics from live source fields so this target does not
  // lag one tick behind a stewardship action that changes employment.
  const lowIncome = population * Math.max(0.2, 0.60 - employmentRate * 0.002);
  const middleIncome = population * Math.min(0.50, 0.30 + employmentRate * 0.002);
  const highIncome = Math.max(0, population - lowIncome - middleIncome);
  const elites = boundedCount(highIncome * 1.15, population);

  return {
    homeless,
    refugees,
    prisoners,
    sick,
    retirees,
    orphans,
    workforceCapacity: Math.round(workforceCapacity),
    housingDemand: Math.round(housingDemand),
    healthServiceDemand: Math.round(healthServiceDemand),
    unrestPressure,
    workers,
    unemployed,
    elites,
  };
}
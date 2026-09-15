import { isBigBrotherActive, isBBContentId } from "@/engine/addons/bigBrother";
import { isSixthDayActive, isSDContentId } from "@/engine/addons/sixthDay";
import { COMPANIES_MAP, isCompanyOperational } from "@/engine/companies";
import { buildTechEffectsCache } from "@/engine/perfCache";
import { POLICY_MAP } from "@/engine/policies";
import { getSeasonalModifiers } from "@/engine/weather";
import type { GameState } from "@/engine/types";

export const POWER_GEN_WEIGHTS: Record<string, number> = {
  fusionReactors: 500,
  microFusionGenerators: 200,
  geothermalWells: 150,
  solarTowerFields: 80,
  hvTransmissionLines: 40,
};

export const WATER_PROD_WEIGHTS: Record<string, number> = {
  atmosphericHarvestTowers: 80,
  megaDesalinationPlants: 180,
  waterRecyclingSuperFacilities: 240,
  sewerPurificationPlants: 50,
  waterPumpStations: 40,
  stormwaterCaptureSystems: 30,
  undergroundWaterReservoirs: 10,
  aquiferStabilizationDrills: 70,
  smartWaterDistributionGrid: 60,
};

export const POWER_MEGAPROJECT_OUTPUT: Record<string, number> = {
  fusion_nexus: 2000,
  arcology: 200,
};

export const WATER_MEGAPROJECT_OUTPUT: Record<string, number> = {
  subterranean_reservoir: 200,
};

export const POWER_MEGAPROJECT_IDS = Object.keys(
  POWER_MEGAPROJECT_OUTPUT,
) as ReadonlyArray<string>;

export const WATER_MEGAPROJECT_IDS = Object.keys(
  WATER_MEGAPROJECT_OUTPUT,
) as ReadonlyArray<string>;

export function sumWeighted(
  counts: Record<string, number> | undefined,
  weights: Record<string, number>,
): number {
  let total = 0;
  for (const key in weights) {
    total += (counts?.[key] ?? 0) * weights[key];
  }
  return total;
}

export function computePowerGeneration(buildings: Record<string, number>): number {
  return sumWeighted(buildings, POWER_GEN_WEIGHTS);
}

export function computeWaterProduction(buildings: Record<string, number>): number {
  return sumWeighted(buildings, WATER_PROD_WEIGHTS);
}

function activePolicyProduction(state: GameState, key: "powerGeneration" | "waterProduction"): number {
  const bbOn = isBigBrotherActive(state.addons);
  const sdOn = isSixthDayActive(state.addons);
  let total = 0;
  for (const policyId of state.activePolicies ?? []) {
    if ((isBBContentId(policyId) && !bbOn) || (isSDContentId(policyId) && !sdOn)) continue;
    const effects = POLICY_MAP[policyId]?.effects;
    if (!effects) continue;
    if (key === "powerGeneration") total += effects.powerGeneration ?? 0;
    if (key === "waterProduction") total += effects.waterProduction ?? 0;
  }
  return total;
}

export type LicensedCompanyUtilityContribution = {
  companyId: string;
  name: string;
  amount: number;
};

/**
 * Return the named company contributions used by the shared utility totals.
 *
 * Keep this filter in one place with licensedCompanyProduction: quarantined
 * legacy licenses, unknown company definitions, and companies with no effect
 * for the requested utility must not appear in the audit.
 */
export function getLicensedCompanyUtilityContributions(
  state: GameState,
  key: "power" | "water",
): LicensedCompanyUtilityContribution[] {
  return (state.companies ?? []).flatMap((instance) => {
    if (!isCompanyOperational(instance)) return [];
    const def = COMPANIES_MAP[instance.companyId];
    const amount = def?.effects[key] ?? 0;
    if (!def || amount <= 0) return [];
    return [{ companyId: instance.companyId, name: def.name, amount }];
  });
}

function licensedCompanyProduction(state: GameState, key: "power" | "water"): number {
  return getLicensedCompanyUtilityContributions(state, key)
    .reduce((total, contribution) => total + contribution.amount, 0);
}

export function computeMegaprojectOutput(
  state: GameState,
  outputs: Record<string, number>,
): number {
  let total = 0;
  for (const project of state.megaProjects ?? []) {
    if (project?.phase !== "operational") continue;
    total += outputs[project.projectId] ?? 0;
  }
  return total;
}

export type UtilityProductionComponents = {
  baseOutput: number;
  speedAdjustedBase: number;
  technologyOutput: number;
  licensedCorporationOutput: number;
  policyOutput: number;
  megaprojectOutput: number;
  prePrestigeOutput: number;
  prestigeMultiplier: number;
  postPrestigeOutput: number;
  seasonalMultiplier: number;
  totalOutput: number;
};

function prestigeMultiplier(state: GameState): number {
  const multiplier = state.prestigeResourceMult ?? 1;
  return multiplier > 1 ? multiplier : 1;
}

export function computePowerProductionComponents(
  state: GameState,
): UtilityProductionComponents {
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const baseOutput = computePowerGeneration(buildings);
  const speedAdjustedBase = baseOutput * (state.cheats?.speedDemon ? 3 : 1);
  const technologyOutput =
    buildTechEffectsCache(state.unlockedTechnologies ?? [], buildings).powerGeneration ?? 0;
  const licensedCorporationOutput = licensedCompanyProduction(state, "power");
  const policyOutput = activePolicyProduction(state, "powerGeneration");
  const megaprojectOutput = computeMegaprojectOutput(state, POWER_MEGAPROJECT_OUTPUT);
  const prePrestigeOutput =
    speedAdjustedBase +
    technologyOutput +
    licensedCorporationOutput +
    policyOutput +
    megaprojectOutput;
  const multiplier = prestigeMultiplier(state);
  const postPrestigeOutput = multiplier > 1
    ? Math.floor(prePrestigeOutput * multiplier)
    : prePrestigeOutput;

  return {
    baseOutput,
    speedAdjustedBase,
    technologyOutput,
    licensedCorporationOutput,
    policyOutput,
    megaprojectOutput,
    prePrestigeOutput,
    prestigeMultiplier: multiplier,
    postPrestigeOutput,
    seasonalMultiplier: 1,
    totalOutput: postPrestigeOutput,
  };
}

export function computeWaterProductionComponents(
  state: GameState,
): UtilityProductionComponents {
  const buildings = (state.buildings ?? {}) as Record<string, number>;
  const baseOutput = computeWaterProduction(buildings);
  const speedAdjustedBase = baseOutput * (state.cheats?.speedDemon ? 3 : 1);
  const technologyOutput =
    buildTechEffectsCache(state.unlockedTechnologies ?? [], buildings).waterProduction ?? 0;
  const licensedCorporationOutput = licensedCompanyProduction(state, "water");
  const policyOutput = activePolicyProduction(state, "waterProduction");
  const megaprojectOutput = computeMegaprojectOutput(state, WATER_MEGAPROJECT_OUTPUT);
  const prePrestigeOutput =
    speedAdjustedBase +
    technologyOutput +
    licensedCorporationOutput +
    policyOutput +
    megaprojectOutput;
  const multiplier = prestigeMultiplier(state);
  const postPrestigeOutput = multiplier > 1
    ? Math.floor(prePrestigeOutput * multiplier)
    : prePrestigeOutput;
  const seasonalMultiplier = state.season
    ? getSeasonalModifiers(state.season).waterProduction
    : 1;
  const totalOutput = state.season
    ? Math.floor(postPrestigeOutput * seasonalMultiplier)
    : postPrestigeOutput;

  return {
    baseOutput,
    speedAdjustedBase,
    technologyOutput,
    licensedCorporationOutput,
    policyOutput,
    megaprojectOutput,
    prePrestigeOutput,
    prestigeMultiplier: multiplier,
    postPrestigeOutput,
    seasonalMultiplier,
    totalOutput,
  };
}
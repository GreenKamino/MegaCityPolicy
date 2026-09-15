import { COMPANIES_MAP, isCompanyOperational } from "@/engine/companies";
import { isBigBrotherActive, isBBContentId } from "@/engine/addons/bigBrother";
import { isSixthDayActive, isSDContentId } from "@/engine/addons/sixthDay";
import { getInstalledAugEffects } from "@/engine/playerProgression";
import { POLICY_MAP } from "@/engine/policies";
import { getTotalTechEffects, TECH_MAP } from "@/engine/technologies";
import { getTotalEffects as getSoftwareUpgradeEffects } from "@/engine/softwareUpgrades";
import type { GameState } from "@/engine/types";

type ResearchLineUnit = "points" | "percent";

export type ResearchBreakdownLine = {
  id: string;
  label: string;
  value: number;
  unit: ResearchLineUnit;
  detail?: string;
};

export type ResearchBreakdown = {
  base: number;
  corporations: number;
  specialists: number;
  rawPoints: number;
  technologyPercent: number;
  policyPercent: number;
  educationPercent: number;
  commanderPercent: number;
  prestigePercent: number;
  megaProjectPercent: number;
  difficultyPercent: number;
  totalPercent: number;
  multiplier: number;
  unroundedGain: number;
  gain: number;
  lines: ResearchBreakdownLine[];
};

export type ResearchUnlockEstimate = {
  remainingPoints: number;
  ticksRemaining: number | null;
  minutesRemaining: number | null;
};

export type ResearchEstimateTiming = {
  /** Duration if the simulation keeps advancing at the current tick interval. */
  theoreticalMinutesRemaining: number | null;
  /** Duration that can currently advance on the wall clock. Null while paused. */
  advancingMinutesRemaining: number | null;
};

export type ResearchEstimateSnapshot = {
  breakdown: ResearchBreakdown;
  researchRate: number;
  tickIntervalMinutes: number;
  activeResearch: ResearchUnlockEstimate | null;
};

/**
 * The save loader normally removes unknown and duplicate IDs. Keep the
 * research screen defensive as well because fixtures, in-memory migrations,
 * and older callers can still hand it an unnormalized queue. Returning the
 * canonical list here ensures ETA indexes match rendered rows.
 */
export function getResearchQueueTechIds(value: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(TECH_MAP, id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function getResearchEstimateTiming(
  estimate: ResearchUnlockEstimate | null,
  tickPaused: boolean,
): ResearchEstimateTiming {
  const theoreticalMinutesRemaining = estimate?.minutesRemaining ?? null;
  return {
    theoreticalMinutesRemaining,
    advancingMinutesRemaining: tickPaused ? null : theoreticalMinutesRemaining,
  };
}

export function getResearchQueueUnlockEstimates(
  costs: readonly number[],
  researchRate: number,
  tickIntervalMinutes: number,
  initialTicksRemaining = 0,
): ResearchUnlockEstimate[] {
  if (researchRate <= 0) {
    return costs.map((cost) => ({
      remainingPoints: Math.max(0, cost),
      ticksRemaining: null,
      minutesRemaining: null,
    }));
  }

  let cumulativeTicks = Math.max(0, Math.ceil(initialTicksRemaining));
  return costs.map((cost) => {
    const estimate = getResearchUnlockEstimate(0, cost, researchRate, tickIntervalMinutes);
    cumulativeTicks += estimate.ticksRemaining ?? 0;
    return {
      remainingPoints: estimate.remainingPoints,
      ticksRemaining: cumulativeTicks,
      minutesRemaining: cumulativeTicks * Math.max(0, tickIntervalMinutes),
    };
  });
}

export function getResearchUnlockEstimate(
  progress: number,
  cost: number,
  researchRate: number,
  tickIntervalMinutes: number,
): ResearchUnlockEstimate {
  const remainingPoints = Math.max(0, cost - progress);
  if (researchRate <= 0) {
    return {
      remainingPoints,
      ticksRemaining: null,
      minutesRemaining: null,
    };
  }

  const ticksRemaining = Math.ceil(remainingPoints / researchRate);
  return {
    remainingPoints,
    ticksRemaining,
    minutesRemaining: ticksRemaining * Math.max(0, tickIntervalMinutes),
  };
}

/**
 * Build the research screen's live estimate from the same breakdown used by
 * the tick processor. Keeping this derived snapshot together prevents the
 * remaining points and ETA from being calculated from different rates after a
 * difficulty/output change or an offline catch-up batch.
 */
export function getResearchEstimateSnapshot(
  state: GameState,
  techEffects: Record<string, number> = getTotalTechEffects(state.unlockedTechnologies),
): ResearchEstimateSnapshot {
  const breakdown = getResearchBreakdown(state, techEffects);
  const tickIntervalMinutes = state.tickIntervalMinutes ?? 15;
  const activeResearch = state.activeResearch
    ? getResearchUnlockEstimate(
      state.activeResearch.progress,
      state.activeResearch.cost,
      breakdown.gain,
      tickIntervalMinutes,
    )
    : null;
  return {
    breakdown,
    researchRate: breakdown.gain,
    tickIntervalMinutes,
    activeResearch,
  };
}

const DIFFICULTY_RESEARCH_MULTIPLIER: Record<NonNullable<GameState["difficulty"]>, number> = {
  easy: 1.3,
  medium: 1,
  hard: 0.8,
};

const RESEARCH_BUILDING_OUTPUTS: ReadonlyArray<readonly [string, number]> = [
  ["advancedResearchLabs", 12],
  ["cyberneticsDevelopmentFacilities", 10],
  ["forensicScienceInstitutes", 6],
  ["experimentalTechVaults", 8],
  ["urbanSystemsAICenters", 10],
  ["archiveRecoveryLabs", 5],
  ["medicalResearchComplexes", 8],
  ["weaponDevelopmentFacilities", 7],
  ["quantumDataCenters", 20],
  ["predictiveAnalyticsSupercomputers", 15],
  ["oracleChambers", 6],
  ["geneVaults", 6],
];

const RESEARCH_SPECIALIST_OUTPUTS: ReadonlyArray<readonly [string, number]> = [
  ["researchScientists", 0.2],
  ["aiSystemsEngineers", 0.3],
  ["cyberneticsResearchers", 0.25],
  ["experimentalPhysicsTeams", 0.5],
  ["dataArchiveAnalysts", 0.1],
];

function sumCatalogOutputs(
  catalog: ReadonlyArray<readonly [string, number]>,
  values: Record<string, number>,
): number {
  return catalog.reduce((sum, [key, output]) => sum + (values[key] ?? 0) * output, 0);
}

/**
 * The single source of truth for research output.
 *
 * Point contributors (buildings, specialists, and licensed companies) are
 * added before percentage modifiers. This means every point shown here is also
 * applied to activeResearch.progress by the tick processor. `techEffects` is
 * injectable so the tick can reuse its cached aggregate.
 */
export function getResearchBreakdown(
  state: GameState,
  techEffects: Record<string, number> = getTotalTechEffects(state.unlockedTechnologies),
): ResearchBreakdown {
  const buildings = state.buildings as Record<string, number>;
  const units = state.units as Record<string, number>;
  const base = sumCatalogOutputs(RESEARCH_BUILDING_OUTPUTS, buildings);
  const specialists = sumCatalogOutputs(RESEARCH_SPECIALIST_OUTPUTS, units);

  let corporations = 0;
  for (const instance of state.companies ?? []) {
    if (!isCompanyOperational(instance)) continue;
    corporations += COMPANIES_MAP[instance.companyId]?.effects.research ?? 0;
  }

  const softwareEffects = state.softwareUpgrades
    ? getSoftwareUpgradeEffects(state.softwareUpgrades)
    : {};
  const technologyPercent = techEffects.researchSpeed ?? 0;
  const policyPercent = (state.activePolicies ?? [])
    .filter((id) => {
      if (isBBContentId(id) && !isBigBrotherActive(state.addons)) return false;
      if (isSDContentId(id) && !isSixthDayActive(state.addons)) return false;
      return true;
    })
    .reduce((sum, id) => sum + (POLICY_MAP[id]?.effects.researchSpeed ?? 0), 0);
  const educationPercent =
    state.cityStats.education > 60 ? 10 :
      state.cityStats.education > 40 ? 5 :
        state.cityStats.education < 20 ? -10 : 0;
  const augEffects = state.player ? getInstalledAugEffects(state.player) : {};
  const commanderPercent = Math.floor(
    (state.player?.attributes.intelligence ?? 0) * 2 +
    (state.player?.skills.engineering ?? 0) * 1.5 +
    (augEffects.cognition ?? 0) * 0.5,
  );
  const prestigePercent = ((state.prestigeResearchMult ?? 1) - 1) * 100;
  const megaProjectPercent = (state.megaProjects ?? []).reduce((sum, project) => {
    if (!project || project.phase !== "operational") return sum;
    if (project.projectId === "neural_collective") return sum + 100;
    if (project.projectId === "quantum_computing_hub") return sum + 150;
    return sum;
  }, 0);
  const difficultyMultiplier =
    DIFFICULTY_RESEARCH_MULTIPLIER[state.difficulty ?? "medium"];
  const difficultyPercent = (difficultyMultiplier - 1) * 100;
  const totalPercent =
    technologyPercent +
    (softwareEffects.researchSpeed ?? 0) +
    policyPercent +
    educationPercent +
    commanderPercent +
    prestigePercent +
    megaProjectPercent;
  const rawPoints = base + corporations + specialists;
  const multiplier = (1 + totalPercent / 100) * difficultyMultiplier;
  const unroundedGain = rawPoints * multiplier;
  const gain = Math.max(0, Math.floor(unroundedGain));

  const lines: ResearchBreakdownLine[] = [
    {
      id: "base",
      label: "Research facilities",
      value: base,
      unit: "points",
      detail: "Labs, archives, AI, medical and weapons research buildings",
    },
    {
      id: "corporations",
      label: "Licensed corporations",
      value: corporations,
      unit: "points",
      detail: "Operational licensed companies; values come from each company definition",
    },
    {
      id: "specialists",
      label: "Research specialists",
      value: specialists,
      unit: "points",
      detail: "Recruited scientists, engineers, researchers, physics teams and analysts",
    },
    {
      id: "technology",
      label: "Technologies",
      value: technologyPercent,
      unit: "percent",
      detail: "Unlocked research-speed effects",
    },
    {
      id: "software",
      label: "Software upgrades",
      value: softwareEffects.researchSpeed ?? 0,
      unit: "percent",
      detail: "Installed software research-speed effects",
    },
    {
      id: "policies",
      label: "Policies",
      value: policyPercent,
      unit: "percent",
      detail: "Active policies with research-speed effects",
    },
    {
      id: "education",
      label: "Education",
      value: educationPercent,
      unit: "percent",
      detail: "City education band",
    },
    {
      id: "commander",
      label: "Commander expertise",
      value: commanderPercent,
      unit: "percent",
      detail: "Intelligence, engineering and cognition augmentation",
    },
    {
      id: "prestige",
      label: "Prestige",
      value: prestigePercent,
      unit: "percent",
      detail: "Persistent prestige research multiplier",
    },
    {
      id: "mega-projects",
      label: "Mega-projects",
      value: megaProjectPercent,
      unit: "percent",
      detail: "Operational Neural Collective or Quantum Computing Hub",
    },
    {
      id: "difficulty",
      label: "Difficulty",
      value: difficultyPercent,
      unit: "percent",
      detail: `${state.difficulty ?? "medium"} difficulty multiplier`,
    },
  ];

  return {
    base,
    corporations,
    specialists,
    rawPoints,
    technologyPercent,
    policyPercent,
    educationPercent,
    commanderPercent,
    prestigePercent,
    megaProjectPercent,
    difficultyPercent,
    totalPercent,
    multiplier,
    unroundedGain,
    gain,
    lines,
  };
}
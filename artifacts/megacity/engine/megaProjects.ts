import type { GameState, GameMessage, GameDate } from "./types";
import { applyInfrastructureHealthDelta } from "./infrastructureLedger";

export type MegaProjectId =
  | "space_elevator"
  | "arcology"
  | "fusion_nexus"
  | "orbital_defense"
  | "underground_rail"
  | "atmospheric_processor"
  | "mega_factory"
  | "neural_collective"
  | "quantum_computing_hub"
  | "orbital_habitat_ring"
  | "subterranean_reservoir"
  | "titan_forge";

export type MegaProjectPhase = "locked" | "planning" | "construction" | "operational";

export type MegaProjectDef = {
  id: MegaProjectId;
  name: string;
  description: string;
  icon: string;
  flavorText: string;
  requirements: {
    minPopulation: number;
    minCredits: number;
    minSteel: number;
    requiredTech?: string[];
    requiredBuildings?: Record<string, number>;
  };
  planningCost: number;
  constructionCost: number;
  steelCost: number;
  ticksToComplete: number;
  workforceRequired: number;
  completionEffects: {
    label: string;
    description: string;
  }[];
};

export type MegaProjectInstance = {
  projectId: MegaProjectId;
  phase: MegaProjectPhase;
  progress: number;
  totalRequired: number;
  investedCredits: number;
  investedSteel: number;
  startedTick: number;
  completedTick?: number;
};

export const MEGA_PROJECTS: MegaProjectDef[] = [
  {
    id: "space_elevator",
    name: "Orbital Tether",
    description: "A carbon-nanotube elevator connecting the surface to low orbit. Dramatically reduces launch costs and enables orbital manufacturing.",
    icon: "rocket-launch",
    flavorText: "They said it couldn't be done. They were wrong.",
    requirements: {
      minPopulation: 600_000,
      minCredits: 400_000,
      minSteel: 1500,
      requiredTech: ["orbital_engineering"],
      requiredBuildings: { spacelaunchFacilities: 2 },
    },
    planningCost: 80_000,
    constructionCost: 1_200_000,
    steelCost: 2400,
    ticksToComplete: 100,
    workforceRequired: 5000,
    completionEffects: [
      { label: "+200 trade income/tick", description: "Orbital trade routes opened" },
      { label: "+50% space program efficiency", description: "Drastically reduced launch costs" },
      { label: "+15 happiness", description: "A symbol of civilization's triumph" },
    ],
  },
  {
    id: "arcology",
    name: "The Arcology",
    description: "A self-contained mega-structure housing 500,000 citizens with integrated food production, power, and recycling. A city within a city.",
    icon: "city-variant",
    flavorText: "Vertical living, perfected. No sky needed.",
    requirements: {
      minPopulation: 500_000,
      minCredits: 250_000,
      minSteel: 1200,
    },
    planningCost: 65_000,
    constructionCost: 800_000,
    steelCost: 2000,
    ticksToComplete: 80,
    workforceRequired: 3000,
    completionEffects: [
      { label: "+500,000 population capacity", description: "Massive integrated housing" },
      { label: "+60 food production", description: "Hydroponic farms within structure" },
      { label: "+200 power generation", description: "Internal fusion micro-reactors" },
    ],
  },
  {
    id: "fusion_nexus",
    name: "Fusion Nexus",
    description: "A centralized fusion power network that links all reactors into a single grid, providing virtually unlimited energy and enabling city-wide force fields.",
    icon: "lightning-bolt-circle",
    flavorText: "We have become the sun.",
    requirements: {
      minPopulation: 400_000,
      minCredits: 300_000,
      minSteel: 800,
      requiredBuildings: { fusionReactors: 5 },
    },
    planningCost: 95_000,
    constructionCost: 650_000,
    steelCost: 1200,
    ticksToComplete: 65,
    workforceRequired: 2000,
    completionEffects: [
      { label: "+2000 MW power generation", description: "Networked fusion cascade" },
      { label: "-50% power upkeep costs", description: "Fusion efficiency maximized" },
      { label: "+10 infrastructure health", description: "Stable power prevents decay" },
    ],
  },
  {
    id: "orbital_defense",
    name: "Orbital Defense Grid",
    description: "A network of armed satellites and kinetic bombardment platforms. No enemy can approach without facing devastating orbital fire.",
    icon: "shield-star",
    flavorText: "Peace through superior firepower — from orbit.",
    requirements: {
      minPopulation: 700_000,
      minCredits: 500_000,
      minSteel: 1800,
      requiredBuildings: { spacelaunchFacilities: 3 },
    },
    planningCost: 120_000,
    constructionCost: 1_600_000,
    steelCost: 3200,
    ticksToComplete: 120,
    workforceRequired: 4000,
    completionEffects: [
      { label: "+50 defense rating", description: "Orbital weapons platforms" },
      { label: "-30% crime rate", description: "Surveillance from space" },
      { label: "+20 faction fear", description: "Nobody challenges orbital superiority" },
    ],
  },
  {
    id: "underground_rail",
    name: "Deep Metro Network",
    description: "A vast underground transit system connecting every district. Eliminates surface congestion and provides bomb-proof civilian shelters.",
    icon: "subway-variant",
    flavorText: "Below the chaos, order moves at 300 km/h.",
    requirements: {
      minPopulation: 300_000,
      minCredits: 150_000,
      minSteel: 600,
    },
    planningCost: 40_000,
    constructionCost: 480_000,
    steelCost: 950,
    ticksToComplete: 40,
    workforceRequired: 2500,
    completionEffects: [
      { label: "+25 happiness", description: "Effortless city-wide transit" },
      { label: "+100 tax income/tick", description: "Economic connectivity boost" },
      { label: "-15% unrest", description: "Reduced commute frustration" },
    ],
  },
  {
    id: "atmospheric_processor",
    name: "Atmospheric Processor",
    description: "Industrial-scale terraforming technology that cleanses the toxic atmosphere, enabling open-air agriculture and reducing disease rates to near zero.",
    icon: "weather-windy",
    flavorText: "Breathe deep. For the first time in a century, it won't kill you.",
    requirements: {
      minPopulation: 400_000,
      minCredits: 280_000,
      minSteel: 800,
    },
    planningCost: 72_000,
    constructionCost: 560_000,
    steelCost: 1400,
    ticksToComplete: 75,
    workforceRequired: 1500,
    completionEffects: [
      { label: "+50 biosphere", description: "Atmospheric purification" },
      { label: "+80 food production", description: "Open-air farming restored" },
      { label: "-80% disease risk", description: "Clean air eliminates airborne pathogens" },
    ],
  },
  {
    id: "mega_factory",
    name: "Mega-Factory Complex",
    description: "A continent-scale automated manufacturing hub. Produces everything from consumer goods to military hardware at unprecedented scale.",
    icon: "factory",
    flavorText: "The machines never sleep. Neither does production.",
    requirements: {
      minPopulation: 400_000,
      minCredits: 200_000,
      minSteel: 1200,
    },
    planningCost: 48_000,
    constructionCost: 400_000,
    steelCost: 1600,
    ticksToComplete: 55,
    workforceRequired: 4000,
    completionEffects: [
      { label: "+200 goods production", description: "Automated manufacturing lines" },
      { label: "+100 steel production", description: "Integrated smelting" },
      { label: "+500 credits/tick", description: "Export surplus to neighboring zones" },
    ],
  },
  {
    id: "neural_collective",
    name: "Neural Collective",
    description: "A city-wide neural network connecting every citizen's mind, enabling instant communication, shared knowledge, and collective decision-making.",
    icon: "brain",
    flavorText: "One mind. One city. One purpose.",
    requirements: {
      minPopulation: 800_000,
      minCredits: 600_000,
      minSteel: 800,
      requiredTech: ["neural_interface_protocol"],
      requiredBuildings: { quantumDataCenters: 3 },
    },
    planningCost: 160_000,
    constructionCost: 960_000,
    steelCost: 1200,
    ticksToComplete: 90,
    workforceRequired: 1000,
    completionEffects: [
      { label: "+100% research speed", description: "Collective intelligence" },
      { label: "+30 education", description: "Shared knowledge base" },
      { label: "-50% corruption", description: "Transparent collective governance" },
    ],
  },
  {
    id: "quantum_computing_hub",
    name: "Quantum Computing Hub",
    description: "A massive quantum processing facility that revolutionizes data analysis, cryptography, and scientific simulation across every sector of the city.",
    icon: "atom-variant",
    flavorText: "We stopped calculating. We started knowing.",
    requirements: {
      minPopulation: 500_000,
      minCredits: 350_000,
      minSteel: 600,
      requiredTech: ["quantum_materials_science"],
      requiredBuildings: { quantumDataCenters: 2 },
    },
    planningCost: 90_000,
    constructionCost: 720_000,
    steelCost: 1000,
    ticksToComplete: 70,
    workforceRequired: 1500,
    completionEffects: [
      { label: "+150% research speed", description: "Quantum-accelerated computation" },
      { label: "+50 credits/tick", description: "Quantum financial modeling" },
      { label: "+15 education", description: "Advanced simulation training" },
    ],
  },
  {
    id: "orbital_habitat_ring",
    name: "Orbital Habitat Ring",
    description: "A rotating orbital station providing luxury zero-g habitation, research labs, and tourism facilities high above the ruined surface.",
    icon: "orbit-variant",
    flavorText: "Above the ashes, a new world turns.",
    requirements: {
      minPopulation: 700_000,
      minCredits: 550_000,
      minSteel: 2000,
      requiredTech: ["habitat_ring_design"],
      requiredBuildings: { spacelaunchFacilities: 3 },
    },
    planningCost: 140_000,
    constructionCost: 1_400_000,
    steelCost: 3000,
    ticksToComplete: 110,
    workforceRequired: 6000,
    completionEffects: [
      { label: "+300 trade income/tick", description: "Orbital commerce hub" },
      { label: "+25 happiness", description: "Hope beyond the horizon" },
      { label: "+100,000 population capacity", description: "Orbital habitation modules" },
    ],
  },
  {
    id: "subterranean_reservoir",
    name: "Subterranean Reservoir",
    description: "An enormous underground water storage and purification system tapping deep aquifers, ensuring the city never thirsts again.",
    icon: "water-well",
    flavorText: "Dig deep enough and even the wasteland bleeds water.",
    requirements: {
      minPopulation: 350_000,
      minCredits: 200_000,
      minSteel: 900,
      requiredTech: ["subterranean_engineering"],
    },
    planningCost: 50_000,
    constructionCost: 500_000,
    steelCost: 1100,
    ticksToComplete: 50,
    workforceRequired: 2000,
    completionEffects: [
      { label: "+200 water production", description: "Deep aquifer access" },
      { label: "+30 food production", description: "Irrigation for hydroponics" },
      { label: "-30% disease risk", description: "Pure water reduces pathogens" },
    ],
  },
  {
    id: "titan_forge",
    name: "Titan Forge",
    description: "A superheated plasma foundry capable of smelting exotic alloys and manufacturing components for the most advanced military and civilian hardware.",
    icon: "anvil",
    flavorText: "In the heart of the forge, we remake the world.",
    requirements: {
      minPopulation: 450_000,
      minCredits: 300_000,
      minSteel: 1500,
      requiredTech: ["industrial_titan_alloys"],
    },
    planningCost: 70_000,
    constructionCost: 600_000,
    steelCost: 2000,
    ticksToComplete: 60,
    workforceRequired: 3500,
    completionEffects: [
      { label: "+300 steel production", description: "Plasma-forged alloys" },
      { label: "+150 goods production", description: "Advanced manufacturing" },
      { label: "+20 defense rating", description: "Military-grade hardware output" },
    ],
  },
];

export function canStartProject(state: GameState, projectId: MegaProjectId): { eligible: boolean; reasons: string[] } {
  const def = MEGA_PROJECTS.find(p => p.id === projectId);
  if (!def) return { eligible: false, reasons: ["Unknown project"] };

  const existing = (state.megaProjects ?? []).find(p => p.projectId === projectId);
  if (existing) return { eligible: false, reasons: ["Project already started or completed"] };

  const reasons: string[] = [];
  const req = def.requirements;

  if (state.cityStats.population < req.minPopulation) {
    reasons.push(`Population: ${state.cityStats.population.toLocaleString()} / ${req.minPopulation.toLocaleString()}`);
  }
  if (state.resources.credits < req.minCredits) {
    reasons.push(`Credits: ${state.resources.credits.toLocaleString()} / ${req.minCredits.toLocaleString()}`);
  }
  if (state.resources.steel < req.minSteel) {
    reasons.push(`Steel: ${state.resources.steel} / ${req.minSteel}`);
  }
  if (req.requiredTech) {
    const unlocked = state.unlockedTechnologies ?? [];
    for (const techId of req.requiredTech) {
      if (!unlocked.includes(techId)) {
        reasons.push(`Requires technology: ${techId.replace(/_/g, " ")}`);
      }
    }
  }
  if (req.requiredBuildings) {
    for (const [bld, count] of Object.entries(req.requiredBuildings)) {
      if ((state.buildings[bld] ?? 0) < count) {
        reasons.push(`Need ${count}x ${bld} (have ${state.buildings[bld] ?? 0})`);
      }
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Late-game cost scaling: a megaproject is supposed to be a city-defining
 * generational effort. With static costs, a 1.6M credit project gets
 * funded in ~30 ticks once income hits 50k/tick. Scale with population
 * (the natural late-game "size" axis) so the relative weight stays high.
 *
 * Floor at 1x (no penalty for new commanders) and cap at 2.5x so the
 * largest cities don't get totally locked out.
 */
export function getMegaProjectCostScale(state: GameState): number {
  const pop = state.cityStats?.population ?? 0;
  const raw = 1 + Math.max(0, pop - 200_000) / 600_000;
  return Math.min(2.5, raw);
}

export function getScaledPlanningCost(state: GameState, def: MegaProjectDef): number {
  return Math.round(def.planningCost * getMegaProjectCostScale(state));
}

export function getScaledConstructionCost(state: GameState, def: MegaProjectDef): number {
  return Math.round(def.constructionCost * getMegaProjectCostScale(state));
}

export function getScaledSteelCost(state: GameState, def: MegaProjectDef): number {
  // Steel scales gentler than credits — steel production caps out lower.
  const scale = 1 + (getMegaProjectCostScale(state) - 1) * 0.5;
  return Math.round(def.steelCost * scale);
}

export function beginProject(state: GameState, projectId: MegaProjectId): GameState | null {
  const def = MEGA_PROJECTS.find(p => p.id === projectId);
  if (!def) return null;

  const { eligible } = canStartProject(state, projectId);
  if (!eligible) return null;

  const planning = getScaledPlanningCost(state, def);
  if (state.resources.credits < planning) return null;

  const instance: MegaProjectInstance = {
    projectId,
    phase: "planning",
    progress: 0,
    totalRequired: def.ticksToComplete,
    investedCredits: planning,
    investedSteel: 0,
    startedTick: state.totalTicks,
  };

  return {
    ...state,
    resources: {
      ...state.resources,
      credits: state.resources.credits - planning,
    },
    megaProjects: [...(state.megaProjects ?? []), instance],
  };
}

export function advanceToConstruction(state: GameState, projectId: MegaProjectId): GameState | null {
  const projects = [...(state.megaProjects ?? [])];
  const idx = projects.findIndex(p => p.projectId === projectId && p.phase === "planning");
  if (idx === -1) return null;
  if (projects[idx].progress < 10) return null;

  const def = MEGA_PROJECTS.find(p => p.id === projectId);
  if (!def) return null;

  const constr = getScaledConstructionCost(state, def);
  const steel = getScaledSteelCost(state, def);
  if (state.resources.credits < constr || state.resources.steel < steel) return null;

  projects[idx] = {
    ...projects[idx],
    phase: "construction",
    progress: 0,
  };

  return {
    ...state,
    resources: {
      ...state.resources,
      credits: state.resources.credits - constr,
      steel: state.resources.steel - steel,
    },
    megaProjects: projects,
  };
}

export function processMegaProjectTick(state: GameState): { state: GameState; completed: MegaProjectId[]; planningComplete: MegaProjectId[]; newlyEligible: MegaProjectId[] } {
  const projects = [...(state.megaProjects ?? [])];
  const completed: MegaProjectId[] = [];
  const planningComplete: MegaProjectId[] = [];

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (p.phase === "planning") {
      if (p.progress < 10) {
        projects[i] = { ...p, progress: p.progress + 1 };
        if (projects[i].progress >= 10) {
          planningComplete.push(p.projectId);
        }
      }
    } else if (p.phase === "construction") {
      projects[i] = { ...p, progress: p.progress + 1 };
      if (projects[i].progress >= p.totalRequired) {
        projects[i] = {
          ...projects[i],
          phase: "operational",
          completedTick: state.totalTicks,
        };
        completed.push(p.projectId);
      }
    }
  }

  let result: GameState = { ...state, megaProjects: projects };

  for (const pid of completed) {
    result = applyProjectEffects(result, pid);
  }
  if (completed.length > 0) {
    result = { ...result, totalMegaProjectsCompleted: (result.totalMegaProjectsCompleted ?? 0) + completed.length };
  }

  const seenSet = new Set(state.seenEligibleMegaProjects ?? []);
  const currentEligible: MegaProjectId[] = [];
  const newlyEligible: MegaProjectId[] = [];
  for (const def of MEGA_PROJECTS) {
    const started = projects.some(p => p.projectId === def.id);
    if (!started && canStartProject(result, def.id).eligible) {
      currentEligible.push(def.id);
      if (!seenSet.has(def.id)) {
        newlyEligible.push(def.id);
        seenSet.add(def.id);
      }
    }
  }
  result = { ...result, eligibleMegaProjects: currentEligible, seenEligibleMegaProjects: [...seenSet] };

  return { state: result, completed, planningComplete, newlyEligible };
}

function applyProjectEffects(state: GameState, projectId: MegaProjectId): GameState {
  const s = { ...state };
  const cs = { ...s.cityStats };
  const r = { ...s.resources };

  switch (projectId) {
    case "space_elevator":
      cs.happiness = Math.min(100, cs.happiness + 15);
      break;
    case "arcology":
      break;
    case "fusion_nexus":
      break;
    case "orbital_defense":
      cs.crime = Math.max(0, cs.crime - 10);
      break;
    case "underground_rail":
      cs.happiness = Math.min(100, cs.happiness + 25);
      cs.unrest = Math.max(0, cs.unrest - 10);
      break;
    case "atmospheric_processor":
      cs.biosphere = Math.min(100, (cs.biosphere ?? 50) + 50);
      break;
    case "mega_factory":
      break;
    case "neural_collective":
      cs.education = Math.min(100, (cs.education ?? 50) + 30);
      cs.corruption = Math.max(0, (cs.corruption ?? 0) - 15);
      break;
    case "quantum_computing_hub":
      cs.education = Math.min(100, (cs.education ?? 50) + 15);
      break;
    case "orbital_habitat_ring":
      cs.happiness = Math.min(100, cs.happiness + 25);
      break;
    case "subterranean_reservoir":
      cs.diseaseRisk = Math.max(0, (cs.diseaseRisk ?? 0) - 10);
      break;
    case "titan_forge":
      cs.defenseRating = Math.min(100, cs.defenseRating + 20);
      break;
  }

  s.cityStats = cs;
  s.resources = r;
  if (projectId === "fusion_nexus") {
    const infrastructure = applyInfrastructureHealthDelta(
      s,
      10,
      `mega-project:${projectId}:complete`,
      "Fusion Nexus completion",
    );
    s.infrastructureLedger = infrastructure.infrastructureLedger;
    s.cityStats = infrastructure.cityStats;
  }
  return s;
}

const PLANNING_COMPLETE_FLAVOR = [
  "The blueprints are finalized. Engineering teams await your order to begin construction.",
  "Planning phase complete. All simulations pass. Ready for ground-breaking.",
  "Architectural review approved. The project is cleared for construction.",
  "Design phase concluded. Resource allocation pending your authorization.",
];

const CONSTRUCTION_COMPLETE_FLAVOR = [
  "Construction crews report the final bolt is in place. The project is fully operational.",
  "After countless ticks of labor, the project stands complete. A new era begins.",
  "The construction crews have packed up. What remains is something that will change this city forever.",
  "Project completion confirmed. All systems nominal. The city will never be the same.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const NEWLY_AVAILABLE_FLAVOR = [
  "Engineering division reports a new mega-scale initiative is within our reach.",
  "Our city's growth has unlocked the prerequisites for a landmark project.",
  "The bureau of development confirms: a new mega-project is now feasible.",
  "Strategic assessment complete — we have the resources and infrastructure for a new initiative.",
];

export function generateMegaProjectMessage(
  projectId: MegaProjectId,
  event: "planning_complete" | "construction_complete" | "newly_available",
  gameDate: GameDate,
  totalTicks: number,
  state?: GameState,
): GameMessage {
  const def = MEGA_PROJECTS.find(p => p.id === projectId);
  const name = def?.name ?? projectId;
  const planning = def && state ? getScaledPlanningCost(state, def) : def?.planningCost ?? 0;
  const constr = def && state ? getScaledConstructionCost(state, def) : def?.constructionCost ?? 0;
  const steel = def && state ? getScaledSteelCost(state, def) : def?.steelCost ?? 0;

  if (event === "newly_available") {
    const reqLines: string[] = [];
    if (def) {
      reqLines.push(`Planning cost: ${planning.toLocaleString()} cr`);
      reqLines.push(`Population required: ${def.requirements.minPopulation.toLocaleString()}`);
    }
    return {
      id: `megaproj-avail-${projectId}-${totalTicks}`,
      timestamp: { ...gameDate },
      tick: totalTicks,
      category: "update",
      title: `NEW MEGA-PROJECT AVAILABLE: ${name.toUpperCase()}`,
      body: `${pick(NEWLY_AVAILABLE_FLAVOR)}\n\n─── ${name} ───\n${def?.description ?? ""}\n\n${reqLines.join("\n")}\n\nNavigate to Mega-Projects to begin planning.`,
      read: false,
      priority: "normal",
    };
  }

  if (event === "planning_complete") {
    return {
      id: `megaproj-plan-${projectId}-${totalTicks}`,
      timestamp: { ...gameDate },
      tick: totalTicks,
      category: "update",
      title: `MEGA-PROJECT: ${name.toUpperCase()} — PLANNING COMPLETE`,
      body: `${pick(PLANNING_COMPLETE_FLAVOR)}\n\n─── ${name} ───\n${def?.description ?? ""}\n\nConstruction cost: ${constr.toLocaleString()} cr + ${steel.toLocaleString()} steel\nEstimated duration: ${def?.ticksToComplete} ticks\n\nNavigate to Mega-Projects to authorize construction.`,
      read: false,
      priority: "high",
    };
  }

  const effectLines = def?.completionEffects.map(e => `• ${e.label}: ${e.description}`).join("\n") ?? "";
  return {
    id: `megaproj-done-${projectId}-${totalTicks}`,
    timestamp: { ...gameDate },
    tick: totalTicks,
    category: "update",
    title: `MEGA-PROJECT: ${name.toUpperCase()} — NOW OPERATIONAL`,
    body: `${pick(CONSTRUCTION_COMPLETE_FLAVOR)}\n\n─── ${name} ───\n${def?.flavorText ?? ""}\n\nActive bonuses:\n${effectLines}`,
    read: false,
    priority: "critical",
  };
}

export function getMegaProjectBonuses(projects: MegaProjectInstance[]): {
  tradeIncomeBonus: number;
  powerBonus: number;
  foodBonus: number;
  waterBonus: number;
  goodsBonus: number;
  steelBonus: number;
  creditBonus: number;
  researchSpeedBonus: number;
  defenseBonus: number;
  taxBonus: number;
} {
  const bonuses = {
    tradeIncomeBonus: 0,
    powerBonus: 0,
    foodBonus: 0,
    waterBonus: 0,
    goodsBonus: 0,
    steelBonus: 0,
    creditBonus: 0,
    researchSpeedBonus: 0,
    defenseBonus: 0,
    taxBonus: 0,
  };

  for (const p of projects) {
    if (p.phase !== "operational") continue;
    switch (p.projectId) {
      case "space_elevator":
        bonuses.tradeIncomeBonus += 200;
        break;
      case "arcology":
        bonuses.foodBonus += 60;
        bonuses.powerBonus += 200;
        break;
      case "fusion_nexus":
        bonuses.powerBonus += 2000;
        break;
      case "orbital_defense":
        bonuses.defenseBonus += 50;
        break;
      case "underground_rail":
        bonuses.taxBonus += 100;
        break;
      case "atmospheric_processor":
        bonuses.foodBonus += 80;
        break;
      case "mega_factory":
        bonuses.goodsBonus += 200;
        bonuses.steelBonus += 100;
        bonuses.creditBonus += 500;
        break;
      case "neural_collective":
        bonuses.researchSpeedBonus += 100;
        break;
      case "quantum_computing_hub":
        bonuses.researchSpeedBonus += 150;
        bonuses.creditBonus += 50;
        break;
      case "orbital_habitat_ring":
        bonuses.tradeIncomeBonus += 300;
        break;
      case "subterranean_reservoir":
        bonuses.waterBonus += 200;
        bonuses.foodBonus += 30;
        break;
      case "titan_forge":
        bonuses.steelBonus += 300;
        bonuses.goodsBonus += 150;
        bonuses.defenseBonus += 20;
        break;
    }
  }

  return bonuses;
}

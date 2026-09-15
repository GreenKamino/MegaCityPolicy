// Run Summary — derives a comprehensive end-of-run recap from current
// GameState. Pure derivation: no IO, no Date.now(), no globals. The summary
// reflects the city as it stands right now plus career-long counters that
// the engine maintains (eventHistory, strikeHistory, completedContracts,
// unlockedTechnologies, unlockedAchievements, firsts).
//
// We surface the major axes the simulation actually tracks — population &
// demographics, workforce breakdown, resources, production rates, quality of
// life, order/crime, infrastructure, research, diplomacy, and milestones —
// rather than just a handful of bars, so the card honestly represents the
// breadth of the run.

import { evaluateFirsts } from "@/engine/firsts";
import { countFulfilledContracts } from "@/engine/contracts";
import type { Faction, GameState, PopulationCohorts, Resources } from "@/engine/types";
import { getCommanderOrigin, type CommanderOriginId } from "@/engine/commanderOrigins";
import { getWorkforceCatalog } from "@/engine/workforceCatalog";
import { computePopulationCohorts } from "@/engine/populationCohorts";

export type FactionStanding = {
  id: string;
  name: string;
  type: string;
  loyalty: number;
  influence: number;
  threat: number;
};

export type WorkforceBreakdown = {
  total: number;
  industrial: number;
  service: number;
  government: number;
  research: number;
  infrastructure: number;
  security: number;
  blackMarket: number;
  employmentRate: number;
  unemploymentRate: number;
  sectorTotal: number;
  directDetailedRoleTotal: number;
  localEconomyJobs: number;
  miningJobs: number;
};

export type IncomeBreakdown = {
  low: number;
  middle: number;
  high: number;
};

export type ProductionBalance = {
  food: { production: number; consumption: number; net: number };
  water: { production: number; consumption: number; net: number };
  power: { generation: number; drain: number; net: number };
  goods: { production: number; consumption: number; net: number };
};

export type IncomeRates = {
  tax: number;
  trade: number;
  tourism: number;
};

export type QualityOfLife = {
  happiness: number;
  education: number;
  publicHealth: number;
  biosphere: number;
  literacy: number;
  lifeExpectancy: number;
  homeless: number;
  hospitalCapacity: number;
};

export type OrderStats = {
  lawOrder: number;
  crime: number;
  unrest: number;
  corruption: number;
  fearIndex: number;
  loyaltyIndex: number;
};

export type Infrastructure = {
  buildingsCount: number;
  uniqueBuildingTypes: number;
  unitsCount: number;
  districtsCount: number;
  infrastructureHealth: number;
  defenseRating: number;
};

export type ResearchProgress = {
  technologiesUnlocked: number;
  activeResearchId: string | null;
  queueLength: number;
  progressPct: number;
};

export type Diplomacy = {
  tradeAgreements: number;
  diplomaticPacts: number;
  jointProjects: number;
  activeOperations: number;
  knownMegacities: number;
  knownTownships: number;
  notableLocations: number;
};

export type Tourism = {
  visitors: number;
  capacity: number;
  satisfaction: number;
};

export type Governance = {
  // Note: prestige (legacy points / rebirth count) lives on PlayerProfile in
  // a separate AsyncStorage store, not on GameState — it's intentionally
  // omitted from this pure derivation rather than faked.
  activeEdicts: number;
  activePolicies: number;
  creditRating: number;
  outstandingLoans: number;
};

export type CareerCounters = {
  eventsHandled: number;
  strikesExecuted: number;
  strikesSucceeded: number;
  contractsCompleted: number;
  contractsActive: number;
  miningOps: number;
  scavengeExpeditions: number;
  lawMissions: number;
  totalDeaths: number;
};

export type StateOfCity = {
  // One-word readout that doubles as a section badge ("STARVING", "BOOMING",
  // "STABLE", etc.). Always present — the derivation falls back to "SURVIVING"
  // for unremarkable mid-game runs.
  headline: string;
  // 2-3 sentence dystopian narration of the sector's current condition,
  // chosen from a small set of hand-written templates keyed off the most
  // extreme stat. Pure derivation — no randomness.
  narrative: string;
};

export type RunArchetype = {
  id: string;
  name: string;     // Display label — uppercased noun ("WARLORD", "TRADER").
  tagline: string;  // Single dystopian sentence describing the playstyle.
};

export type MilestoneEntry = {
  // 1-based slot in the timeline. We don't have per-event tick stamps in
  // GameEvent.timestamp (it's wall-clock from Date.now), so the slot is the
  // chronological position after filtering down to the most severe events.
  slot: number;
  label: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
};

export type RunSummary = {
  // Identity
  cityName: string;
  playerName: string;
  playerTitle: string;
  commanderOrigin: CommanderOriginId;

  // Time
  daysSurvived: number;
  totalTicks: number;
  gameDateLabel: string;

  // Population
  population: number;
  populationGrowthRate: number;
  birthRate: number;
  deathRate: number;
  workforce: WorkforceBreakdown;
  incomeClasses: IncomeBreakdown;
  populationCohorts: PopulationCohorts;

  // Economy
  resources: Resources;
  incomeRates: IncomeRates;
  production: ProductionBalance;
  registeredBusinesses: number;
  averageCitizenIncome: number;

  // Quality of life
  qol: QualityOfLife;

  // Order
  order: OrderStats;

  // Infrastructure
  infrastructure: Infrastructure;

  // Research
  research: ResearchProgress;

  // Diplomacy
  diplomacy: Diplomacy;
  topFactions: FactionStanding[];

  // Tourism
  tourism: Tourism;

  // Governance & meta
  governance: Governance;

  // Career
  career: CareerCounters;

  // Milestones
  firstsUnlocked: number;
  firstsTotal: number;
  achievementsUnlocked: number;

  // Defining moment
  biggestEvent: { title: string; description: string } | null;

  // Steam-release polish: end-of-run clarity additions.
  // - stateOfCity: one-paragraph dystopian readout of the sector's current
  //   condition, chosen by which stat is most extreme right now.
  // - archetype: career tag derived from dominant axis of play (WARLORD,
  //   TRADER, BUILDER, etc.) — gives the run an identity in one word.
  // - milestoneTimeline: top severe events from eventHistory in chronological
  //   order, so the player can see the shape of the run, not just the totals.
  stateOfCity: StateOfCity;
  archetype: RunArchetype;
  milestoneTimeline: MilestoneEntry[];
};

export function buildRunSummary(state: GameState): RunSummary {
  const cityName = state.cityName ?? "UNNAMED CITY";
  const playerName = state.player?.name ?? "MARSHAL";
  const playerTitle = state.playerTitle ?? "MARSHAL";
  const commanderOrigin = getCommanderOrigin(state.commanderOrigin).id;

  const totalTicks = state.totalTicks ?? 0;
  const daysSurvived = Math.floor(totalTicks / 24);

  const gd = state.gameDate;
  const pad = (n: number) => String(n).padStart(2, "0");
  const gameDateLabel = gd
    ? `Y${gd.year} M${pad(gd.month)} D${pad(gd.day)} ${pad(gd.hour)}:00`
    : "";

  const stats = state.cityStats ?? ({} as GameState["cityStats"]);
  const demo = state.demographics ?? ({} as GameState["demographics"]);
  const rates = state.rates ?? ({} as GameState["rates"]);

  // Resources — clone with safe defaults so the card never shows undefined.
  const baseRes: Resources = {
    credits: 0, food: 0, water: 0, power: 0, steel: 0,
    goods: 0, fuel: 0, medSupplies: 0, ammo: 0,
  };
  const resources: Resources = { ...baseRes, ...(state.resources ?? {}) };

  const workforceCatalog = getWorkforceCatalog(state);
  const populationCohorts = computePopulationCohorts(state);
  const workforce: WorkforceBreakdown = {
    total: workforceCatalog.employedCitizens,
    industrial: workforceCatalog.sectorTotals.industrial,
    service: workforceCatalog.sectorTotals.service,
    government: workforceCatalog.sectorTotals.government,
    research: workforceCatalog.sectorTotals.research,
    infrastructure: workforceCatalog.sectorTotals.infrastructure,
    security: workforceCatalog.sectorTotals.security,
    blackMarket: workforceCatalog.sectorTotals.blackMarket,
    employmentRate: workforceCatalog.employmentRate,
    unemploymentRate: workforceCatalog.unemployedCitizens /
      Math.max(1, workforceCatalog.employedCitizens + workforceCatalog.unemployedCitizens) * 100,
    sectorTotal: workforceCatalog.sectorTotal,
    directDetailedRoleTotal: workforceCatalog.directDetailedRoleTotal,
    localEconomyJobs: workforceCatalog.localEconomyJobs,
    miningJobs: workforceCatalog.miningJobs,
  };

  const incomeClasses: IncomeBreakdown = {
    low: demo.lowIncomePopulation ?? 0,
    middle: demo.middleIncomePopulation ?? 0,
    high: demo.highIncomePopulation ?? 0,
  };

  const production: ProductionBalance = {
    food: {
      production: rates.foodProduction ?? 0,
      consumption: rates.foodConsumption ?? 0,
      net: (rates.foodProduction ?? 0) - (rates.foodConsumption ?? 0),
    },
    water: {
      production: rates.waterProduction ?? 0,
      consumption: rates.waterConsumption ?? 0,
      net: (rates.waterProduction ?? 0) - (rates.waterConsumption ?? 0),
    },
    power: {
      generation: rates.powerGeneration ?? 0,
      drain: rates.powerDrain ?? 0,
      net: (rates.powerGeneration ?? 0) - (rates.powerDrain ?? 0),
    },
    goods: {
      production: rates.goodsProduction ?? 0,
      consumption: rates.goodsConsumption ?? 0,
      net: (rates.goodsProduction ?? 0) - (rates.goodsConsumption ?? 0),
    },
  };

  const incomeRates: IncomeRates = {
    tax: rates.taxIncome ?? 0,
    trade: rates.tradeIncome ?? 0,
    tourism: rates.tourismIncome ?? 0,
  };

  const qol: QualityOfLife = {
    happiness: stats.happiness ?? 0,
    education: stats.education ?? 0,
    publicHealth: stats.publicHealth ?? 0,
    biosphere: stats.biosphere ?? 0,
    literacy: demo.literacyRate ?? 0,
    lifeExpectancy: demo.averageLifeExpectancy ?? 0,
    homeless: demo.homelessPopulation ?? 0,
    hospitalCapacity: demo.hospitalCapacityUsage ?? 0,
  };

  const order: OrderStats = {
    lawOrder: stats.lawOrder ?? 0,
    crime: stats.crime ?? 0,
    unrest: stats.unrest ?? 0,
    corruption: stats.corruption ?? 0,
    fearIndex: demo.fearIndex ?? 0,
    loyaltyIndex: demo.loyaltyIndex ?? 0,
  };

  // Buildings/Units are Record<string, number> — sum the values for total
  // count and count the keys for variety.
  const buildings = state.buildings ?? {};
  const units = state.units ?? {};
  const buildingsCount = Object.values(buildings).reduce(
    (a, b) => a + (Number(b) || 0),
    0,
  );
  const uniqueBuildingTypes = Object.keys(buildings).filter(
    (k) => (Number(buildings[k]) || 0) > 0,
  ).length;
  const unitsCount = Object.values(units).reduce(
    (a, b) => a + (Number(b) || 0),
    0,
  );

  const infrastructure: Infrastructure = {
    buildingsCount,
    uniqueBuildingTypes,
    unitsCount,
    districtsCount: state.districts?.length ?? 0,
    infrastructureHealth: stats.infrastructureHealth ?? 0,
    defenseRating: stats.defenseRating ?? 0,
  };

  const activeResearch = state.activeResearch;
  const research: ResearchProgress = {
    technologiesUnlocked: state.unlockedTechnologies?.length ?? 0,
    activeResearchId: activeResearch?.techId ?? null,
    queueLength: state.researchQueue?.length ?? 0,
    progressPct: activeResearch && activeResearch.cost > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((activeResearch.progress / activeResearch.cost) * 100)),
        )
      : 0,
  };

  // Tourism — surface visitor / capacity / satisfaction since income-only is
  // hard to interpret on its own.
  const tourismState = state.tourism ?? ({} as GameState["tourism"]);
  const tourism: Tourism = {
    visitors: tourismState.touristCount ?? 0,
    capacity: tourismState.tourismCapacity ?? 0,
    satisfaction: tourismState.tourismSatisfaction ?? 0,
  };

  // Governance & meta — prestige, edicts, policies, banking. All optional on
  // GameState so we guard each access.
  const banking = state.banking;
  const outstandingLoans =
    banking?.loans?.reduce(
      (acc, l) => acc + (l.defaulted ? 0 : l.remainingBalance ?? l.principal ?? 0),
      0,
    ) ?? 0;
  const governance: Governance = {
    activeEdicts: state.activeEdicts?.length ?? 0,
    activePolicies: state.activePolicies?.length ?? 0,
    creditRating: banking?.creditRating ?? 0,
    outstandingLoans,
  };

  const diplomacy: Diplomacy = {
    tradeAgreements: state.tradeAgreements?.length ?? 0,
    diplomaticPacts: state.diplomaticPacts?.length ?? 0,
    jointProjects: state.jointProjects?.length ?? 0,
    activeOperations: state.activeOperations?.length ?? 0,
    knownMegacities: state.externalMegacities?.length ?? 0,
    knownTownships: state.townships?.length ?? 0,
    notableLocations: state.notableLocations?.length ?? 0,
  };

  const events = state.eventHistory ?? [];
  const strikes = state.strikeHistory ?? [];
  const career: CareerCounters = {
    eventsHandled: events.length,
    strikesExecuted: strikes.length,
    strikesSucceeded: strikes.filter((s) => s.success).length,
    contractsCompleted: countFulfilledContracts(state.completedContracts),
    contractsActive: state.activeContracts?.length ?? 0,
    miningOps: state.miningOperations?.length ?? 0,
    scavengeExpeditions: state.scavengeExpeditions?.length ?? 0,
    lawMissions: state.lawMissions?.length ?? 0,
    totalDeaths: demo.totalDeaths ?? 0,
  };

  const factions: Faction[] = state.factions ?? [];
  const topFactions: FactionStanding[] = factions
    .filter((f) => f.isActive)
    .map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      loyalty: f.loyalty ?? 0,
      influence: f.influence ?? 0,
      threat: f.threat ?? 0,
    }))
    .sort((a, b) => b.influence - a.influence)
    .slice(0, 5);

  const firsts = evaluateFirsts(state);
  const firstsUnlocked = firsts.filter((f) => f.unlocked).length;
  const firstsTotal = firsts.length;
  const achievementsUnlocked = state.unlockedAchievements?.length ?? 0;

  const sevRank: Record<string, number> = {
    critical: 4, high: 3, medium: 2, low: 1,
  };
  let biggestEvent: { title: string; description: string } | null = null;
  let bestRank = -1;
  for (const e of events) {
    const rank = sevRank[e.severity] ?? 0;
    if (rank >= bestRank) {
      bestRank = rank;
      biggestEvent = { title: e.title, description: e.description ?? e.title };
    }
  }

  const stateOfCity = deriveStateOfCity({
    totalTicks,
    qol,
    order,
    production,
    resources,
  });

  const archetype = deriveArchetype({
    infrastructure,
    career,
    research,
    diplomacy,
    governance,
    qol,
    order,
    registeredBusinesses: demo.registeredBusinesses ?? 0,
  });

  const milestoneTimeline = deriveMilestoneTimeline(events);

  return {
    cityName,
    playerName,
    playerTitle,
    commanderOrigin,
    daysSurvived,
    totalTicks,
    gameDateLabel,
    population: stats.population ?? 0,
    populationGrowthRate: stats.populationGrowthRate ?? 0,
    birthRate: demo.birthRate ?? 0,
    deathRate: demo.deathRate ?? 0,
    workforce,
    incomeClasses,
    populationCohorts,
    resources,
    incomeRates,
    production,
    registeredBusinesses: demo.registeredBusinesses ?? 0,
    averageCitizenIncome: demo.averageCitizenIncome ?? 0,
    qol,
    order,
    infrastructure,
    research,
    diplomacy,
    topFactions,
    tourism,
    governance,
    career,
    firstsUnlocked,
    firstsTotal,
    achievementsUnlocked,
    biggestEvent,
    stateOfCity,
    archetype,
    milestoneTimeline,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Steam-release polish derivations.
//
// Each helper is a pure function over already-derived sub-records (rather than
// raw GameState) so they're trivial to test in isolation and impossible to
// accidentally couple to engine internals.
// ─────────────────────────────────────────────────────────────────────────────

function deriveStateOfCity(args: {
  totalTicks: number;
  qol: QualityOfLife;
  order: OrderStats;
  production: ProductionBalance;
  resources: Resources;
}): StateOfCity {
  const { totalTicks, qol, order, production, resources } = args;

  // Opening sequence — fewer than 5 ticks of state means the player has
  // barely started; nothing's gone wrong yet because nothing has happened.
  if (totalTicks < 5) {
    return {
      headline: "FRESH ASSIGNMENT",
      narrative:
        "The sector is quiet. Watch posts read green. The Council has not yet decided whether to forget you. Spend this lull building the foundations of whatever comes next.",
    };
  }

  // Hard-failure conditions are checked first because a single shortage will
  // dominate the player's experience even if everything else looks fine.
  if (production.food.net < -50 && resources.food < 100) {
    return {
      headline: "STARVING",
      narrative:
        "Food queues snake through every district. Riot teams have stopped pretending the rations will arrive. By morning the protests will not be polite. Fix the supply or fund the funerals.",
    };
  }

  if (production.water.net < -20 && resources.water < 100) {
    return {
      headline: "PARCHED",
      narrative:
        "The aqueducts run dry. Black-market water hawkers price by the litre. Cholera surveillance teams are quietly stockpiling body bags. The clock on this is measured in days, not weeks.",
    };
  }

  if (production.power.net < -10 && resources.power < 50) {
    return {
      headline: "DARK SECTOR",
      narrative:
        "Brownouts roll across the sector on a schedule the citizens already memorised. Hospitals run on diesel. Factories idle. Every hour the lights stay off, the gangs grow another block of territory.",
    };
  }

  if (order.unrest > 70 || order.crime > 70) {
    return {
      headline: "RIOTING",
      narrative:
        "Barricades on the arterials. Patrol drones flying nervous. Half the sector is trying to flee, the other half is trying to take the streets. The Council expects you to choose a side before it is chosen for you.",
    };
  }

  if (qol.publicHealth < 25) {
    return {
      headline: "PLAGUE-RIDDEN",
      narrative:
        "Clinics are turning patients away. The morgue queue spills into the parking deck. Underground apothecaries are charging triple for last year's antibiotics. Every day without medical capacity costs you a generation.",
    };
  }

  if (order.lawOrder < 25) {
    return {
      headline: "LAWLESS",
      narrative:
        "Authority is now a suggestion. Whichever faction owns your block runs the courts. The corps have started hiring their own judges. By the time the Council notices, this sector will not be yours to give back.",
    };
  }

  // Positive states — only fire when several stats agree, otherwise the
  // copy reads like marketing rather than a sit-rep.
  if (qol.happiness >= 75 && order.lawOrder >= 60 && order.unrest < 30) {
    return {
      headline: "BOOMING",
      narrative:
        "Growth indicators are green across every column. Citizens line up to enlist, invest, breed. Other sectors send delegations to study how you did it. Enjoy this — it does not last.",
    };
  }

  if (qol.happiness >= 55 && order.unrest < 40) {
    return {
      headline: "STABLE",
      narrative:
        "The sector hums. Resources flow, factions grumble within tolerance, the streets stay swept. This is what the Council calls success. It is also what they call complacency.",
    };
  }

  // Soft-warning fallback — we have a deficit somewhere but reserves are
  // covering. Worth flagging before it becomes a hard failure.
  if (production.food.net < 0 || production.water.net < 0 || production.power.net < 0) {
    return {
      headline: "SHORTAGES",
      narrative:
        "Production lags consumption on at least one essential. Right now the stockpiles cover the gap. They will not cover it forever. Fix the curve before the curve fixes you.",
    };
  }

  // Nothing dominates either way.
  return {
    headline: "SURVIVING",
    narrative:
      "No fires, no riots, no obvious wins. The sector grinds on under your watch — the citizens are neither grateful nor mutinous. The Council files no report. Make something of the silence.",
  };
}

const ARCHETYPE_DEFINITIONS: Record<string, RunArchetype> = {
  builder:       { id: "builder",       name: "BUILDER",       tagline: "Walls before words. Concrete before charity." },
  warlord:       { id: "warlord",       name: "WARLORD",       tagline: "Rule by force. Sleep with one eye open." },
  trader:        { id: "trader",        name: "TRADER",        tagline: "Every neighbour a customer. Every contract a leash." },
  scientist:     { id: "scientist",     name: "TECHNOCRAT",    tagline: "Solve every crisis with the next breakthrough." },
  autocrat:      { id: "autocrat",      name: "AUTOCRAT",      tagline: "Order is the only freedom that scales." },
  humanist:      { id: "humanist",      name: "HUMANIST",      tagline: "The sector is the citizens. Forget that and lose them both." },
  industrialist: { id: "industrialist", name: "INDUSTRIALIST", tagline: "Strip the wastes. Smelt the proceeds." },
  kleptocrat:    { id: "kleptocrat",    name: "KLEPTOCRAT",    tagline: "Skim the top. Bury the books. Repeat." },
  survivor:      { id: "survivor",      name: "SURVIVOR",      tagline: "Still here. That is the policy." },
};

function deriveArchetype(args: {
  infrastructure: Infrastructure;
  career: CareerCounters;
  research: ResearchProgress;
  diplomacy: Diplomacy;
  governance: Governance;
  qol: QualityOfLife;
  order: OrderStats;
  registeredBusinesses: number;
}): RunArchetype {
  const { infrastructure: inf, career, research, diplomacy, governance, qol, order, registeredBusinesses } = args;

  // Each axis caps individual signals so a single runaway counter (e.g.
  // 10000 unlocked techs from a 30-year save) cannot drown out other axes.
  const scores: Record<string, number> = {
    builder:       Math.min(50, inf.uniqueBuildingTypes * 2) + Math.min(50, inf.buildingsCount / 10),
    warlord:       Math.min(50, inf.unitsCount / 5) + Math.min(30, career.strikesExecuted * 3) + Math.min(20, inf.defenseRating / 2),
    trader:        Math.min(50, diplomacy.tradeAgreements * 5) + Math.min(30, career.contractsCompleted) + Math.min(20, diplomacy.knownTownships),
    scientist:     Math.min(80, research.technologiesUnlocked * 2),
    autocrat:      Math.min(40, governance.activeEdicts * 4) + Math.min(30, order.lawOrder / 2) + Math.min(30, order.fearIndex / 2),
    humanist:      Math.min(40, qol.happiness / 2) + Math.min(40, qol.publicHealth / 2) + Math.min(20, qol.literacy / 5),
    industrialist: Math.min(50, career.miningOps * 2) + Math.min(30, career.scavengeExpeditions) + Math.min(20, registeredBusinesses / 50),
    kleptocrat:    Math.min(50, order.corruption / 2) + Math.min(30, governance.outstandingLoans / 50_000),
  };

  let winner = "survivor";
  let max = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > max) {
      max = v;
      winner = k;
    }
  }

  // No axis crossed the floor — the player is just hanging on. SURVIVOR is
  // the honest tag.
  if (max < 25) winner = "survivor";

  return ARCHETYPE_DEFINITIONS[winner] ?? ARCHETYPE_DEFINITIONS.survivor;
}

function deriveMilestoneTimeline(events: GameState["eventHistory"]): MilestoneEntry[] {
  if (!events || events.length === 0) return [];

  const sevRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

  // Pick the top-N most severe events from history, then re-sort the
  // survivors by their original chronological order so the timeline reads
  // as a story rather than a leaderboard.
  const indexed = events.map((e, i) => ({ e, i }));
  indexed.sort((a, b) => {
    const r = (sevRank[b.e.severity] ?? 0) - (sevRank[a.e.severity] ?? 0);
    if (r !== 0) return r;
    return a.i - b.i;
  });
  const top = indexed.slice(0, 8);
  top.sort((a, b) => a.i - b.i);

  return top.map((x, idx) => ({
    slot: idx + 1,
    label: x.e.title,
    description: x.e.description ?? x.e.title,
    severity: x.e.severity,
  }));
}

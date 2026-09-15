import type { GameState } from "./types";

export type LegacyBonusId =
  | "starting_credits"
  | "resource_production"
  | "starting_population"
  | "research_speed"
  | "starting_officers"
  | "faction_reputation"
  | "lucky_start"
  | "patron_of_streets"
  | "trust_buster"
  | "industrialist_heritage";

export type LegacyBonus = {
  id: LegacyBonusId;
  name: string;
  description: string;
  icon: string;
  maxTier: number;
  costPerTier: number[];
  effectPerTier: string[];
};

export type EcologicalLegacyBonusId =
  | "seeded_biomes"
  | "starting_livestock"
  | "tamed_cohort"
  | "gene_archive"
  | "druid_envoy";

export type EcologicalLegacyBonus = {
  id: EcologicalLegacyBonusId;
  name: string;
  description: string;
  icon: string;
  maxTier: number;
  costPerTier: number[];
  effectPerTier: string[];
};

export const ECOLOGICAL_LEGACY_BONUSES: EcologicalLegacyBonus[] = [
  {
    id: "seeded_biomes",
    name: "Seeded Biomes",
    description: "Each new run starts with restored biome ecology — flora, herbivores, and pollinators already present.",
    icon: "leaf",
    maxTier: 3,
    costPerTier: [4, 10, 24],
    effectPerTier: ["+10 starting biosphere", "+20 starting biosphere", "+35 starting biosphere"],
  },
  {
    id: "starting_livestock",
    name: "Starting Livestock",
    description: "Begin with managed herds already producing food. The pens are full from day one.",
    icon: "food-drumstick",
    maxTier: 3,
    costPerTier: [5, 12, 28],
    effectPerTier: ["+1 Aquaponics facility free", "+2 Aquaponics facilities free", "+3 Aquaponics facilities free"],
  },
  {
    id: "tamed_cohort",
    name: "Tamed Cohort",
    description: "A cohort of tamed beasts joins each new city as garrison support.",
    icon: "paw",
    maxTier: 2,
    costPerTier: [10, 30],
    effectPerTier: ["+15 starting defense rating", "+30 starting defense rating"],
  },
  {
    id: "gene_archive",
    name: "Inherited Gene Archive",
    description: "Carry over biological samples between runs. The Gene Vault starts pre-stocked.",
    icon: "dna",
    maxTier: 2,
    costPerTier: [12, 32],
    effectPerTier: ["+5% research speed", "+10% research speed"],
  },
  {
    id: "druid_envoy",
    name: "Druid Envoy",
    description: "An envoy from the old Druid covenant arrives at run start, raising loyalty with conservationist factions.",
    icon: "account-tree",
    maxTier: 2,
    costPerTier: [8, 20],
    effectPerTier: ["+5 loyalty for conservationist & druid factions", "+10 loyalty for conservationist & druid factions"],
  },
];

export type PrestigeState = {
  totalLegacyPoints: number;
  availableLegacyPoints: number;
  timesReborn: number;
  lastRebirthTick: number;
  purchasedBonuses: Record<LegacyBonusId, number>;
  highestLPEarned: number;
  totalEcologicalLegacy: number;
  availableEcologicalLegacy: number;
  highestEcologicalLegacyEarned: number;
  purchasedEcologicalBonuses: Record<EcologicalLegacyBonusId, number>;
};

export type LegacyTier = {
  tier: number;
  name: string;
  minLP: number;
  color: string;
};

export const LEGACY_TIERS: LegacyTier[] = [
  { tier: 0, name: "Unproven", minLP: 0, color: "#666666" },
  { tier: 1, name: "Overseer", minLP: 10, color: "#88AA88" },
  { tier: 2, name: "Warden", minLP: 30, color: "#44CC44" },
  { tier: 3, name: "Prefect", minLP: 75, color: "#00FF41" },
  { tier: 4, name: "Archon", minLP: 150, color: "#00CCFF" },
  { tier: 5, name: "Sovereign", minLP: 300, color: "#8844FF" },
  { tier: 6, name: "Imperator", minLP: 500, color: "#FF8800" },
  { tier: 7, name: "Eternal", minLP: 800, color: "#FF4444" },
  { tier: 8, name: "Transcendent", minLP: 1200, color: "#FF00FF" },
  { tier: 9, name: "Apex", minLP: 2000, color: "#FFD700" },
];

export const LEGACY_BONUSES: LegacyBonus[] = [
  {
    id: "starting_credits",
    name: "Financial Legacy",
    description: "Start each city with bonus credits",
    icon: "cash-multiple",
    maxTier: 3,
    costPerTier: [5, 15, 40],
    effectPerTier: ["+25% starting credits", "+50% starting credits", "+100% starting credits"],
  },
  {
    id: "resource_production",
    name: "Industrial Heritage",
    description: "All resource production rates boosted",
    icon: "factory",
    maxTier: 5,
    costPerTier: [8, 16, 30, 50, 80],
    effectPerTier: ["+5% production", "+10% production", "+15% production", "+20% production", "+25% production"],
  },
  {
    id: "starting_population",
    name: "Mass Migration",
    description: "Start with a larger population base",
    icon: "account-group",
    maxTier: 3,
    costPerTier: [10, 25, 50],
    effectPerTier: ["+10% starting pop", "+20% starting pop", "+30% starting pop"],
  },
  {
    id: "research_speed",
    name: "Inherited Knowledge",
    description: "Research completes faster",
    icon: "brain",
    maxTier: 3,
    costPerTier: [12, 30, 60],
    effectPerTier: ["+10% research speed", "+20% research speed", "+30% research speed"],
  },
  {
    id: "starting_officers",
    name: "Veteran Cadre",
    description: "Start with additional appointed officers",
    icon: "account-tie",
    maxTier: 2,
    costPerTier: [15, 40],
    effectPerTier: ["+2 starting officers", "+4 starting officers"],
  },
  {
    id: "faction_reputation",
    name: "Legendary Reputation",
    description: "All factions start with higher approval",
    icon: "handshake",
    maxTier: 2,
    costPerTier: [10, 30],
    effectPerTier: ["+5 faction approval", "+10 faction approval"],
  },
  {
    id: "lucky_start",
    name: "Cartographer's Legacy",
    description: "Start with extra discovered map locations",
    icon: "map-marker-plus",
    maxTier: 2,
    costPerTier: [8, 20],
    effectPerTier: ["+3 discovered locations", "+6 discovered locations"],
  },

  // ── BUSINESS-ECONOMY LEGACY BONUSES ──────────────────────────────────
  {
    id: "patron_of_streets",
    name: "Patron of the Streets",
    description: "Independent shops open faster on every run",
    icon: "storefront-outline",
    maxTier: 3,
    costPerTier: [10, 25, 60],
    effectPerTier: ["+10% spawn rate", "+20% spawn rate", "+30% spawn rate"],
  },
  {
    id: "trust_buster",
    name: "Trust-Buster Legacy",
    description: "Corporate chains expand slower and hit antitrust caps sooner",
    icon: "scale-balance",
    maxTier: 3,
    costPerTier: [12, 30, 75],
    effectPerTier: [
      "-15% chain expansion · -5 monopoly cap",
      "-30% chain expansion · -10 monopoly cap",
      "-45% chain expansion · -15 monopoly cap",
    ],
  },
  {
    id: "industrialist_heritage",
    name: "Industrialist Heritage",
    description: "Corporate chains expand faster — capital concentrates",
    icon: "domain",
    maxTier: 3,
    costPerTier: [10, 25, 60],
    effectPerTier: [
      "+10% chain expansion",
      "+20% chain expansion",
      "+30% chain expansion",
    ],
  },
];

export function createDefaultPrestigeState(): PrestigeState {
  return {
    totalLegacyPoints: 0,
    availableLegacyPoints: 0,
    timesReborn: 0,
    lastRebirthTick: 0,
    purchasedBonuses: {
      starting_credits: 0,
      resource_production: 0,
      starting_population: 0,
      research_speed: 0,
      starting_officers: 0,
      faction_reputation: 0,
      lucky_start: 0,
      patron_of_streets: 0,
      trust_buster: 0,
      industrialist_heritage: 0,
    },
    highestLPEarned: 0,
    totalEcologicalLegacy: 0,
    availableEcologicalLegacy: 0,
    highestEcologicalLegacyEarned: 0,
    purchasedEcologicalBonuses: {
      seeded_biomes: 0,
      starting_livestock: 0,
      tamed_cohort: 0,
      gene_archive: 0,
      druid_envoy: 0,
    },
  };
}

export function normalizePrestigeState(prestige: Partial<PrestigeState> | undefined | null): PrestigeState {
  const fresh = createDefaultPrestigeState();
  if (!prestige) return fresh;
  return {
    ...fresh,
    ...prestige,
    purchasedBonuses: { ...fresh.purchasedBonuses, ...(prestige.purchasedBonuses ?? {}) },
    purchasedEcologicalBonuses: { ...fresh.purchasedEcologicalBonuses, ...(prestige.purchasedEcologicalBonuses ?? {}) },
    totalEcologicalLegacy: prestige.totalEcologicalLegacy ?? 0,
    availableEcologicalLegacy: prestige.availableEcologicalLegacy ?? 0,
    highestEcologicalLegacyEarned: prestige.highestEcologicalLegacyEarned ?? 0,
  };
}

export function getCurrentLegacyTier(totalLP: number): LegacyTier {
  let current = LEGACY_TIERS[0];
  for (const tier of LEGACY_TIERS) {
    if (totalLP >= tier.minLP) current = tier;
    else break;
  }
  return current;
}

export function getNextLegacyTier(totalLP: number): LegacyTier | null {
  for (const tier of LEGACY_TIERS) {
    if (totalLP < tier.minLP) return tier;
  }
  return null;
}

export const REBIRTH_REQUIREMENTS = {
  minPopulation: 500_000,
  minTicks: 100,
  minTechResearched: 1,
};

export function canRebirth(state: GameState): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (state.cityStats.population < REBIRTH_REQUIREMENTS.minPopulation) {
    reasons.push(`Population must be at least ${(REBIRTH_REQUIREMENTS.minPopulation).toLocaleString()} (current: ${state.cityStats.population.toLocaleString()})`);
  }
  if (state.totalTicks < REBIRTH_REQUIREMENTS.minTicks) {
    reasons.push(`Must have at least ${REBIRTH_REQUIREMENTS.minTicks} ticks played (current: ${state.totalTicks})`);
  }
  if ((state.unlockedTechnologies?.length ?? 0) < REBIRTH_REQUIREMENTS.minTechResearched) {
    reasons.push(`Must have researched at least ${REBIRTH_REQUIREMENTS.minTechResearched} technology`);
  }
  return { eligible: reasons.length === 0, reasons };
}

export function calculateLegacyPoints(state: GameState): { total: number; breakdown: { label: string; points: number }[] } {
  const breakdown: { label: string; points: number }[] = [];

  const popPoints = Math.floor(state.cityStats.population / 10_000);
  if (popPoints > 0) breakdown.push({ label: "Population", points: popPoints });

  const techPoints = Math.floor((state.unlockedTechnologies?.length ?? 0) / 50);
  if (techPoints > 0) breakdown.push({ label: "Technologies", points: techPoints });

  const creditPoints = Math.floor(state.resources.credits / 100_000);
  if (creditPoints > 0) breakdown.push({ label: "Treasury", points: creditPoints });

  const achPoints = Math.floor((state.unlockedAchievements?.length ?? 0) / 10);
  if (achPoints > 0) breakdown.push({ label: "Achievements", points: achPoints });

  if (state.cityStats.population > 2_000_000) {
    breakdown.push({ label: "Mega-city bonus", points: 2 });
  }

  const tickBonus = Math.floor(state.totalTicks / 500);
  if (tickBonus > 0) breakdown.push({ label: "Longevity", points: Math.min(tickBonus, 10) });

  const total = breakdown.reduce((sum, b) => sum + b.points, 0);
  return { total: Math.max(1, total), breakdown };
}

export function calculateEcologicalLegacy(state: GameState): { total: number; breakdown: { label: string; points: number }[] } {
  const breakdown: { label: string; points: number }[] = [];

  const bioScore = state.cityStats.biosphere ?? 0;
  const bioPoints = Math.floor(Math.max(0, bioScore - 30) / 10);
  if (bioPoints > 0) breakdown.push({ label: "Biosphere restored", points: bioPoints });

  const bld = state.buildings as Record<string, number>;
  const sanctuaryCount = (bld.biosphereReclamationDomes ?? 0) + (bld.aquaponicsMegaFacilities ?? 0);
  const sanctuaryPoints = Math.floor(sanctuaryCount / 2);
  if (sanctuaryPoints > 0) breakdown.push({ label: "Eco infrastructure", points: Math.min(sanctuaryPoints, 8) });

  const geneVaults = bld.geneVaults ?? 0;
  if (geneVaults > 0) breakdown.push({ label: "Gene vaults", points: Math.min(geneVaults, 4) });

  const uplift = state.cityStats.upliftPopulation ?? 0;
  const upliftPoints = Math.floor(uplift / 1000);
  if (upliftPoints > 0) breakdown.push({ label: "Uplift cohort", points: Math.min(upliftPoints, 6) });

  const eco = state.wildlandsEcology ?? {};
  const restoredBiomes = Object.values(eco).filter((b) => (b?.flora ?? 0) > 100 && (b?.herbivore ?? 0) > 50).length;
  if (restoredBiomes > 0) breakdown.push({ label: "Restored biomes", points: restoredBiomes });

  const druid = (state.factions ?? []).find((f) => f.id === "deep-root-collective");
  if (druid && druid.loyalty >= 60) breakdown.push({ label: "Druid alliance", points: 2 });

  const total = breakdown.reduce((sum, b) => sum + b.points, 0);
  return { total: Math.max(0, total), breakdown };
}

export function getBonusTier(prestige: PrestigeState, bonusId: LegacyBonusId): number {
  return prestige.purchasedBonuses[bonusId] ?? 0;
}

export function getEcologicalBonusTier(prestige: PrestigeState, bonusId: EcologicalLegacyBonusId): number {
  return prestige.purchasedEcologicalBonuses?.[bonusId] ?? 0;
}

export function canPurchaseEcologicalBonus(prestige: PrestigeState, bonusId: EcologicalLegacyBonusId): boolean {
  const bonus = ECOLOGICAL_LEGACY_BONUSES.find((b) => b.id === bonusId);
  if (!bonus) return false;
  const currentTier = getEcologicalBonusTier(prestige, bonusId);
  if (currentTier >= bonus.maxTier) return false;
  const cost = bonus.costPerTier[currentTier];
  return (prestige.availableEcologicalLegacy ?? 0) >= cost;
}

export function purchaseEcologicalBonus(prestige: PrestigeState, bonusId: EcologicalLegacyBonusId): PrestigeState | null {
  if (!canPurchaseEcologicalBonus(prestige, bonusId)) return null;
  const bonus = ECOLOGICAL_LEGACY_BONUSES.find((b) => b.id === bonusId)!;
  const currentTier = getEcologicalBonusTier(prestige, bonusId);
  const cost = bonus.costPerTier[currentTier];
  return {
    ...prestige,
    availableEcologicalLegacy: (prestige.availableEcologicalLegacy ?? 0) - cost,
    purchasedEcologicalBonuses: {
      ...(prestige.purchasedEcologicalBonuses ?? {
        seeded_biomes: 0, starting_livestock: 0, tamed_cohort: 0, gene_archive: 0, druid_envoy: 0,
      }),
      [bonusId]: currentTier + 1,
    },
  };
}

export function getStartingBiosphereBonus(prestige: PrestigeState): number {
  const tier = getEcologicalBonusTier(prestige, "seeded_biomes");
  if (tier === 0) return 0;
  if (tier === 1) return 10;
  if (tier === 2) return 20;
  return 35;
}

export function getStartingAquaponicsBonus(prestige: PrestigeState): number {
  return getEcologicalBonusTier(prestige, "starting_livestock");
}

export function getStartingDefenseBonus(prestige: PrestigeState): number {
  const tier = getEcologicalBonusTier(prestige, "tamed_cohort");
  return tier * 15;
}

export function getEcologicalResearchSpeedMultiplier(prestige: PrestigeState): number {
  const tier = getEcologicalBonusTier(prestige, "gene_archive");
  return 1 + tier * 0.05;
}

export function getDruidEnvoyLoyaltyBonus(prestige: PrestigeState): number {
  const tier = getEcologicalBonusTier(prestige, "druid_envoy");
  return tier * 5;
}

export function canPurchaseBonus(prestige: PrestigeState, bonusId: LegacyBonusId): boolean {
  const bonus = LEGACY_BONUSES.find(b => b.id === bonusId);
  if (!bonus) return false;
  const currentTier = getBonusTier(prestige, bonusId);
  if (currentTier >= bonus.maxTier) return false;
  const cost = bonus.costPerTier[currentTier];
  return prestige.availableLegacyPoints >= cost;
}

export function purchaseBonus(prestige: PrestigeState, bonusId: LegacyBonusId): PrestigeState | null {
  if (!canPurchaseBonus(prestige, bonusId)) return null;
  const bonus = LEGACY_BONUSES.find(b => b.id === bonusId)!;
  const currentTier = getBonusTier(prestige, bonusId);
  const cost = bonus.costPerTier[currentTier];
  return {
    ...prestige,
    availableLegacyPoints: prestige.availableLegacyPoints - cost,
    purchasedBonuses: {
      ...prestige.purchasedBonuses,
      [bonusId]: currentTier + 1,
    },
  };
}

export function getResourceProductionMultiplier(prestige: PrestigeState): number {
  const tier = getBonusTier(prestige, "resource_production");
  return 1 + tier * 0.05;
}

export function getStartingCreditsMultiplier(prestige: PrestigeState): number {
  const tier = getBonusTier(prestige, "starting_credits");
  return 1 + tier * 0.25;
}

export function getStartingPopulationMultiplier(prestige: PrestigeState): number {
  const tier = getBonusTier(prestige, "starting_population");
  return 1 + tier * 0.10;
}

export function getResearchSpeedMultiplier(prestige: PrestigeState): number {
  const tier = getBonusTier(prestige, "research_speed");
  return 1 + tier * 0.10;
}

export function getStartingOfficerBonus(prestige: PrestigeState): number {
  const tier = getBonusTier(prestige, "starting_officers");
  return tier * 2;
}

export function getFactionApprovalBonus(prestige: PrestigeState): number {
  const tier = getBonusTier(prestige, "faction_reputation");
  return tier * 5;
}

export function getExtraDiscoveredLocations(prestige: PrestigeState): number {
  const tier = getBonusTier(prestige, "lucky_start");
  return tier * 3;
}

// Multiplier applied to SPAWN_INTERVAL_TICKS — values < 1 mean shops appear
// FASTER (shorter interval). Patron of the Streets shortens interval per tier.
export function getBusinessSpawnIntervalMultiplier(prestige: PrestigeState): number {
  const tier = getBonusTier(prestige, "patron_of_streets");
  return Math.max(0.5, 1 - tier * 0.10);
}

// Multiplier applied to CHAIN_EXPANSION_BASE_CHANCE per chain.
// Trust-Buster pushes it down, Industrialist Heritage pushes it up; both stack.
export function getChainExpansionChanceMultiplier(prestige: PrestigeState): number {
  const tBust = getBonusTier(prestige, "trust_buster");
  const indus = getBonusTier(prestige, "industrialist_heritage");
  return Math.max(0.1, 1 - tBust * 0.15 + indus * 0.10);
}

// Locations to subtract from ANTI_MONOPOLY_LOCATION_CAP. Trust-Buster lowers
// the cap by 5/10/15 per tier so antitrust events fire earlier.
export function getAntiMonopolyCapDelta(prestige: PrestigeState): number {
  const tier = getBonusTier(prestige, "trust_buster");
  return tier * 5;
}

export type ReputationGrade = "S" | "A" | "B" | "C" | "D" | "F";

export type ReputationBreakdown = {
  score: number;
  grade: ReputationGrade;
  factors: { label: string; value: number; max: number }[];
};

export function calculateReputationScore(state: GameState): ReputationBreakdown {
  const cs = state.cityStats;
  const factors: { label: string; value: number; max: number }[] = [];

  const happinessScore = Math.min(25, Math.floor(cs.happiness / 4));
  factors.push({ label: "Citizen Happiness", value: happinessScore, max: 25 });

  const crimeScore = Math.min(20, Math.floor((100 - cs.crime) / 5));
  factors.push({ label: "Crime Control", value: crimeScore, max: 20 });

  const stabilityScore = Math.min(15, Math.floor((100 - cs.unrest) / 7));
  factors.push({ label: "Civil Stability", value: stabilityScore, max: 15 });

  const factions = state.factions ?? [];
  const avgLoyalty = factions.length > 0 ? factions.reduce((s, f) => s + f.loyalty, 0) / factions.length : 50;
  const factionScore = Math.min(15, Math.floor(avgLoyalty / 7));
  factors.push({ label: "Faction Relations", value: factionScore, max: 15 });

  const empScore = Math.min(10, Math.floor(cs.employment / 10));
  factors.push({ label: "Employment", value: empScore, max: 10 });

  const techCount = state.unlockedTechnologies?.length ?? 0;
  const techScore = Math.min(10, Math.floor(techCount / 3));
  factors.push({ label: "Technological Progress", value: techScore, max: 10 });

  const popScore = Math.min(5, Math.floor(state.cityStats.population / 200000));
  factors.push({ label: "Population Growth", value: popScore, max: 5 });

  const total = factors.reduce((s, f) => s + f.value, 0);
  let grade: ReputationGrade = "F";
  if (total >= 90) grade = "S";
  else if (total >= 75) grade = "A";
  else if (total >= 60) grade = "B";
  else if (total >= 45) grade = "C";
  else if (total >= 30) grade = "D";

  return { score: total, grade, factors };
}

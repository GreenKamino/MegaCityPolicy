import type { GameState, PlayerCharacter, PlayerAttributes } from "@/engine/types";
import { AUGMENTS } from "@/engine/augments";

export interface UnlockableTrait {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "governance" | "military" | "economy" | "social" | "survival";
  effects: Partial<{
    crimeReduction: number;
    unrestReduction: number;
    happinessBonus: number;
    creditMultiplier: number;
    researchSpeedBonus: number;
    combatBonus: number;
    defenseBonus: number;
    corruptionReduction: number;
    taxBonus: number;
    tradeBonus: number;
    constructionSpeedBonus: number;
    recruitCostReduction: number;
    xpMultiplier: number;
    upkeepReduction: number;
    diplomaticBonus: number;
  }>;
  condition: (s: GameState) => boolean;
  conditionLabel: string;
}

export const UNLOCKABLE_TRAITS: UnlockableTrait[] = [
  {
    id: "iron_marshal", name: "Iron Marshal", description: "Governed with an iron fist through 500 ticks. Crime cannot flourish under your watch.",
    icon: "shield-check", category: "governance",
    effects: { crimeReduction: 5, unrestReduction: 3 },
    condition: (s) => s.totalTicks >= 500 && s.cityStats.crime < 20,
    conditionLabel: "Reach 500 ticks with crime below 20",
  },
  {
    id: "peoples_protector", name: "People's Protector", description: "Kept happiness above 70 for 300 consecutive ticks.",
    icon: "heart-pulse", category: "social",
    effects: { happinessBonus: 5, unrestReduction: 2 },
    condition: (s) => s.totalTicks >= 300 && s.cityStats.happiness >= 70,
    conditionLabel: "Maintain happiness above 70 for 300+ ticks",
  },
  {
    id: "fiscal_savant", name: "Fiscal Savant", description: "Accumulated over 500,000 credits. Your treasury overflows.",
    icon: "cash-multiple", category: "economy",
    effects: { creditMultiplier: 0.05, taxBonus: 3 },
    condition: (s) => s.resources.credits >= 500000,
    conditionLabel: "Accumulate 500,000+ credits",
  },
  {
    id: "tech_visionary", name: "Tech Visionary", description: "Unlocked 50 technologies. The city advances at your command.",
    icon: "atom", category: "economy",
    effects: { researchSpeedBonus: 10 },
    condition: (s) => s.unlockedTechnologies.length >= 50,
    conditionLabel: "Unlock 50+ technologies",
  },
  {
    id: "warmaster", name: "Warmaster", description: "Commanded forces through 20 successful military operations.",
    icon: "sword-cross", category: "military",
    effects: { combatBonus: 8, defenseBonus: 5 },
    condition: (s) => s.player.riotsQuelled >= 20,
    conditionLabel: "Quell 20+ riots or win 20+ engagements",
  },
  {
    id: "incorruptible", name: "Incorruptible", description: "Maintained corruption below 10 for 200 ticks. Your integrity is unquestioned.",
    icon: "scale-balance", category: "governance",
    effects: { corruptionReduction: 5, happinessBonus: 3 },
    condition: (s) => s.totalTicks >= 200 && s.cityStats.corruption < 10,
    conditionLabel: "Keep corruption below 10 for 200+ ticks",
  },
  {
    id: "merchant_prince", name: "Merchant Prince", description: "Generated 1,000,000 in lifetime trade income.",
    icon: "store", category: "economy",
    effects: { tradeBonus: 10, creditMultiplier: 0.03 },
    condition: (s) => (s.rates.tradeIncome ?? 0) > 200,
    conditionLabel: "Achieve trade income above 200/tick",
  },
  {
    id: "master_builder", name: "Master Builder", description: "Constructed 50 buildings across the city.",
    icon: "office-building", category: "economy",
    effects: { constructionSpeedBonus: 15 },
    condition: (s) => Object.values(s.buildings).reduce((a, v) => a + v, 0) >= 50,
    conditionLabel: "Construct 50+ buildings total",
  },
  {
    id: "legion_commander", name: "Legion Commander", description: "Maintained a retinue of 30+ troops.",
    icon: "account-group", category: "military",
    effects: { recruitCostReduction: 0.15, combatBonus: 3 },
    condition: (s) => (s.retinue?.troops?.length ?? 0) >= 30,
    conditionLabel: "Have 30+ troops in your retinue",
  },
  {
    id: "survivor", name: "Survivor", description: "Endured 5 critical-severity events without the city collapsing.",
    icon: "skull-crossbones", category: "survival",
    effects: { unrestReduction: 5, happinessBonus: 2 },
    condition: (s) => s.eventHistory.filter(e => e.severity === "critical").length >= 5,
    conditionLabel: "Survive 5+ critical events",
  },
  {
    id: "shadowmaster", name: "Shadowmaster", description: "Ran 10+ black ops or spy operations successfully.",
    icon: "eye-off", category: "military",
    effects: { corruptionReduction: 3, combatBonus: 5 },
    condition: (s) => s.player.skills.blackOps >= 8,
    conditionLabel: "Reach Black Ops skill level 8+",
  },
  {
    id: "crisis_handler", name: "Crisis Handler", description: "Resolved 30 events without losing control.",
    icon: "alert-decagram", category: "governance",
    effects: { unrestReduction: 4, crimeReduction: 2 },
    condition: (s) => s.player.totalDecisions >= 30,
    conditionLabel: "Make 30+ event decisions",
  },
  {
    id: "peacemaker", name: "Peacemaker", description: "Negotiated peace with 3 factions that had threat above 60.",
    icon: "handshake", category: "social",
    effects: { diplomaticBonus: 10, unrestReduction: 3 },
    condition: (s) => s.factions.filter(f => f.loyalty >= 60).length >= 3,
    conditionLabel: "Achieve 60+ loyalty with 3 factions",
  },
  {
    id: "census_master", name: "Census Master", description: "Governed a population exceeding 980,000 citizens.",
    icon: "account-multiple-check", category: "governance",
    effects: { happinessBonus: 3, taxBonus: 5 },
    condition: (s) => s.demographics.totalPopulation >= 980000,
    conditionLabel: "Reach 980,000+ population",
  },
  {
    id: "fortifier", name: "Fortifier", description: "Raised city defense rating above 80.",
    icon: "shield-lock", category: "military",
    effects: { defenseBonus: 8, combatBonus: 3 },
    condition: (s) => s.cityStats.defenseRating >= 80,
    conditionLabel: "Achieve defense rating 80+",
  },
  {
    id: "efficiency_expert", name: "Efficiency Expert", description: "Maintained employment above 90 for 100 ticks.",
    icon: "chart-timeline-variant", category: "economy",
    effects: { creditMultiplier: 0.04, constructionSpeedBonus: 10 },
    condition: (s) => s.totalTicks >= 100 && s.cityStats.employment >= 90,
    conditionLabel: "Maintain 90%+ employment for 100+ ticks",
  },
  {
    id: "propaganda_lord", name: "Propaganda Lord", description: "Mastered the art of public manipulation. Propaganda skill 8+.",
    icon: "bullhorn", category: "social",
    effects: { happinessBonus: 5, unrestReduction: 5 },
    condition: (s) => s.player.skills.propaganda >= 8,
    conditionLabel: "Reach Propaganda skill level 8+",
  },
  {
    id: "contract_king", name: "Contract King", description: "Completed 50 contracts for the city.",
    icon: "file-sign", category: "economy",
    effects: { creditMultiplier: 0.03, tradeBonus: 5 },
    condition: (s) => s.player.contractsCompleted >= 50,
    conditionLabel: "Complete 50+ contracts",
  },
  {
    id: "wasteland_reclaimer", name: "Wasteland Reclaimer", description: "Reclaimed 10 plots from the irradiated wastes.",
    icon: "map-marker-radius", category: "survival",
    effects: { constructionSpeedBonus: 10, happinessBonus: 2 },
    condition: (s) => (s.districtExpansion?.totalReclaimed ?? 0) >= 10,
    conditionLabel: "Reclaim 10+ wasteland plots",
  },
  {
    id: "old_guard", name: "Old Guard", description: "Reached player level 25. A veteran of the wastes.",
    icon: "crown", category: "governance",
    effects: { xpMultiplier: 0.10, diplomaticBonus: 5 },
    condition: (s) => s.player.level >= 25,
    conditionLabel: "Reach player level 25",
  },
];

export interface DynamicTitle {
  id: string;
  title: string;
  description: string;
  condition: (s: GameState) => boolean;
  conditionLabel: string;
  priority: number;
}

export const DYNAMIC_TITLES: DynamicTitle[] = [
  { id: "city_commander", title: "City Commander", description: "Default rank. Starting position.", condition: () => true, conditionLabel: "Default", priority: 0 },
  { id: "district_warden", title: "District Warden", description: "Overseen 50 districts.", condition: (s) => s.districts.length >= 50, conditionLabel: "Govern 50+ districts", priority: 5 },
  { id: "sector_marshal", title: "Field Commander", description: "Reached level 10. Rising through the ranks.", condition: (s) => s.player.level >= 10, conditionLabel: "Reach level 10", priority: 10 },
  { id: "iron_judge", title: "Iron Judge", description: "Sentenced 100 criminals. Justice is absolute.", condition: (s) => s.player.criminalsSentenced >= 100, conditionLabel: "Sentence 100+ criminals", priority: 15 },
  { id: "grand_marshal", title: "Grand Marshal", description: "Population exceeds 500,000 under your command.", condition: (s) => s.demographics.totalPopulation >= 500000, conditionLabel: "Govern 500K+ citizens", priority: 20 },
  { id: "high_chancellor", title: "High Chancellor", description: "Maintained city stability above 70 for 500 ticks.", condition: (s) => s.totalTicks >= 500 && s.cityStats.happiness >= 70, conditionLabel: "500+ ticks with 70+ happiness", priority: 25 },
  { id: "war_sovereign", title: "War Sovereign", description: "Quelled 30 riots. The city bows to your military might.", condition: (s) => s.player.riotsQuelled >= 30, conditionLabel: "Quell 30+ riots", priority: 30 },
  { id: "archon", title: "Archon", description: "Reached level 20. Supreme authority.", condition: (s) => s.player.level >= 20, conditionLabel: "Reach level 20", priority: 35 },
  { id: "trade_baron", title: "Trade Baron", description: "Amassed over 1,000,000 credits.", condition: (s) => s.resources.credits >= 1000000, conditionLabel: "Hold 1M+ credits", priority: 30 },
  { id: "overlord", title: "Overlord", description: "Controlled 250+ districts. The megacity IS you.", condition: (s) => s.districts.length >= 250, conditionLabel: "Govern 250+ districts", priority: 40 },
  { id: "undying", title: "The Undying", description: "Survived 1000 ticks. Outlasted everything the wasteland threw at you.", condition: (s) => s.totalTicks >= 1000, conditionLabel: "Survive 1000+ ticks", priority: 25 },
  { id: "sovereign", title: "Sovereign", description: "Reached level 30. Your word is law.", condition: (s) => s.player.level >= 30, conditionLabel: "Reach level 30", priority: 50 },
  { id: "peacekeeper", title: "Peacekeeper", description: "All factions at 50+ loyalty simultaneously.", condition: (s) => s.factions.every(f => f.loyalty >= 50), conditionLabel: "All factions 50+ loyalty", priority: 35 },
  { id: "apex_commander", title: "Apex Commander", description: "100 technologies unlocked. Master of all domains.", condition: (s) => s.unlockedTechnologies.length >= 100, conditionLabel: "Unlock 100+ technologies", priority: 45 },
  { id: "eternal_marshal", title: "Eternal Marshal", description: "Reached level 40. Legendary status achieved.", condition: (s) => s.player.level >= 40, conditionLabel: "Reach level 40", priority: 60 },
];

export interface PlayerPerk {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: number;
  category: "command" | "warfare" | "economics" | "administration" | "espionage";
  effects: Partial<{
    crimeReduction: number;
    unrestReduction: number;
    happinessBonus: number;
    creditMultiplier: number;
    researchSpeedBonus: number;
    combatBonus: number;
    defenseBonus: number;
    corruptionReduction: number;
    taxBonus: number;
    tradeBonus: number;
    constructionSpeedBonus: number;
    recruitCostReduction: number;
    xpMultiplier: number;
    upkeepReduction: number;
    diplomaticBonus: number;
    squadSizeBonus: number;
    maxSquadBonus: number;
    inventorySlotBonus: number;
  }>;
}

export const PLAYER_PERKS: PlayerPerk[] = [
  { id: "inspiring_presence", name: "Inspiring Presence", description: "Your mere presence lifts morale across the city.", icon: "star-face", tier: 1, category: "command", effects: { happinessBonus: 3, unrestReduction: 2 } },
  { id: "tactical_genius", name: "Tactical Genius", description: "Superior battlefield planning reduces casualties.", icon: "chess-knight", tier: 1, category: "warfare", effects: { combatBonus: 5, defenseBonus: 3 } },
  { id: "tax_reform", name: "Tax Reform", description: "Restructured taxation brings in more revenue.", icon: "cash-register", tier: 1, category: "economics", effects: { taxBonus: 8, creditMultiplier: 0.03 } },
  { id: "bureaucratic_efficiency", name: "Bureaucratic Efficiency", description: "Streamlined administration. Everything moves faster.", icon: "cog-outline", tier: 1, category: "administration", effects: { constructionSpeedBonus: 15, researchSpeedBonus: 5 } },
  { id: "intelligence_network", name: "Intelligence Network", description: "Eyes and ears everywhere. Nothing escapes your notice.", icon: "web", tier: 1, category: "espionage", effects: { crimeReduction: 4, corruptionReduction: 3 } },

  { id: "iron_discipline", name: "Iron Discipline", description: "Your forces obey without question.", icon: "gavel", tier: 2, category: "command", effects: { unrestReduction: 5, crimeReduction: 3 } },
  { id: "combined_arms", name: "Combined Arms", description: "Squads fight better together. Synergy amplified.", icon: "account-group", tier: 2, category: "warfare", effects: { combatBonus: 8, squadSizeBonus: 2 } },
  { id: "trade_empire", name: "Trade Empire", description: "Your trade networks span the wasteland.", icon: "chart-line", tier: 2, category: "economics", effects: { tradeBonus: 15, creditMultiplier: 0.05 } },
  { id: "rapid_mobilization", name: "Rapid Mobilization", description: "Troops deploy faster. Construction accelerates.", icon: "run-fast", tier: 2, category: "administration", effects: { constructionSpeedBonus: 20, recruitCostReduction: 0.10 } },
  { id: "black_budget", name: "Black Budget", description: "Covert funding for shadow operations.", icon: "incognito", tier: 2, category: "espionage", effects: { corruptionReduction: 5, upkeepReduction: 0.08 } },
];

export interface AttributeThresholdBonus {
  attribute: keyof PlayerAttributes;
  threshold: number;
  label: string;
  description: string;
  effects: Partial<{
    crimeReduction: number;
    unrestReduction: number;
    happinessBonus: number;
    creditMultiplier: number;
    researchSpeedBonus: number;
    combatBonus: number;
    defenseBonus: number;
    corruptionReduction: number;
    diplomaticBonus: number;
  }>;
}

export const ATTRIBUTE_THRESHOLDS: AttributeThresholdBonus[] = [
  { attribute: "authority", threshold: 10, label: "Commanding Presence", description: "Your authority discourages lawbreakers.", effects: { crimeReduction: 3, unrestReduction: 2 } },
  { attribute: "authority", threshold: 20, label: "Absolute Authority", description: "No one dares challenge your rule.", effects: { crimeReduction: 6, unrestReduction: 5, corruptionReduction: 3 } },
  { attribute: "intelligence", threshold: 10, label: "Quick Learner", description: "Research proceeds faster under your guidance.", effects: { researchSpeedBonus: 8 } },
  { attribute: "intelligence", threshold: 20, label: "Genius Intellect", description: "Your mind processes information at superhuman speed.", effects: { researchSpeedBonus: 15, creditMultiplier: 0.03 } },
  { attribute: "charisma", threshold: 10, label: "Natural Leader", description: "Citizens trust you. Happiness stabilized.", effects: { happinessBonus: 4, diplomaticBonus: 5 } },
  { attribute: "charisma", threshold: 20, label: "Cult of Personality", description: "The people adore you. Factions respect you.", effects: { happinessBonus: 8, diplomaticBonus: 10, unrestReduction: 3 } },
  { attribute: "combat", threshold: 10, label: "Battle-Hardened", description: "Your military experience improves city defense.", effects: { combatBonus: 5, defenseBonus: 3 } },
  { attribute: "combat", threshold: 20, label: "Living Legend", description: "Your combat prowess is the stuff of legend.", effects: { combatBonus: 12, defenseBonus: 8 } },
  { attribute: "endurance", threshold: 10, label: "Resilient", description: "You endure what would break lesser commanders.", effects: { unrestReduction: 3, corruptionReduction: 2 } },
  { attribute: "endurance", threshold: 20, label: "Indestructible", description: "Nothing can stop you. Crises barely register.", effects: { unrestReduction: 6, corruptionReduction: 5, happinessBonus: 3 } },
];

export function getUnlockedTraits(state: GameState): UnlockableTrait[] {
  return UNLOCKABLE_TRAITS.filter(t => t.condition(state));
}

export function getAvailableTitles(state: GameState): DynamicTitle[] {
  return DYNAMIC_TITLES.filter(t => t.condition(state)).sort((a, b) => b.priority - a.priority);
}

export function getHighestTitle(state: GameState): string {
  const available = getAvailableTitles(state);
  return available.length > 0 ? available[0].title : "City Commander";
}

export function getAvailablePerks(player: PlayerCharacter, selectedPerkIds: string[]): PlayerPerk[] {
  const perkSlots = Math.floor(player.level / 5);
  if (selectedPerkIds.length >= perkSlots) return [];
  const maxTier = Math.min(Math.floor(player.level / 10) + 1, 2);
  return PLAYER_PERKS.filter(p => p.tier <= maxTier && !selectedPerkIds.includes(p.id));
}

export function getActiveThresholdBonuses(attrs: PlayerAttributes): AttributeThresholdBonus[] {
  return ATTRIBUTE_THRESHOLDS.filter(t => attrs[t.attribute] >= t.threshold);
}

export function aggregateProgressionEffects(
  state: GameState,
  selectedPerkIds: string[],
): Record<string, number> {
  const totals: Record<string, number> = {};

  const unlockedTraits = getUnlockedTraits(state);
  for (const trait of unlockedTraits) {
    if (!state.player.traits.includes(trait.id)) continue;
    for (const [k, v] of Object.entries(trait.effects)) {
      totals[k] = (totals[k] ?? 0) + (v as number);
    }
  }

  for (const perkId of selectedPerkIds) {
    const perk = PLAYER_PERKS.find(p => p.id === perkId);
    if (!perk) continue;
    for (const [k, v] of Object.entries(perk.effects)) {
      totals[k] = (totals[k] ?? 0) + (v as number);
    }
  }

  const thresholds = getActiveThresholdBonuses(state.player.attributes);
  for (const t of thresholds) {
    for (const [k, v] of Object.entries(t.effects)) {
      totals[k] = (totals[k] ?? 0) + (v as number);
    }
  }

  return totals;
}

export function installAugmentation(state: GameState, slotId: string, augmentId: string): { success: boolean; message: string } {
  const player = state.player;
  if (!player) return { success: false, message: "No player character." };

  const slot = (player.augmentationSlots ?? []).find(s => s.id === slotId);
  if (!slot) return { success: false, message: "Invalid augmentation slot." };
  if (slot.installed) return { success: false, message: `Slot already occupied by ${slot.installed}. Remove it first.` };

  const aug = AUGMENTS.find(a => a.id === augmentId);
  if (!aug) return { success: false, message: "Unknown augmentation." };

  const installCost = 5000 + Object.values(aug.effects as Record<string, number>).reduce((s: number, v: number) => s + Math.abs(v) * 500, 0);
  if (state.resources.credits < installCost) return { success: false, message: `Installation costs ${installCost.toLocaleString()} credits. Insufficient funds.` };

  state.resources.credits -= installCost;
  slot.installed = augmentId;

  return { success: true, message: `${aug.name} installed in ${slot.label}. Cost: ${installCost.toLocaleString()} credits.` };
}

export function removeAugmentation(state: GameState, slotId: string): { success: boolean; message: string } {
  const player = state.player;
  if (!player) return { success: false, message: "No player character." };

  const slot = (player.augmentationSlots ?? []).find(s => s.id === slotId);
  if (!slot) return { success: false, message: "Invalid augmentation slot." };
  if (!slot.installed) return { success: false, message: "No augmentation installed in this slot." };

  const removeCost = 2000;
  if (state.resources.credits < removeCost) return { success: false, message: `Removal costs ${removeCost.toLocaleString()} credits. Insufficient funds.` };

  state.resources.credits -= removeCost;
  const removedId = slot.installed;
  slot.installed = null;

  return { success: true, message: `Augmentation removed from ${slot.label}. Cost: ${removeCost.toLocaleString()} credits.` };
}

export function getInstalledAugEffects(player: PlayerCharacter): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const slot of player.augmentationSlots ?? []) {
    if (!slot.installed) continue;
    const aug = AUGMENTS.find((a: any) => a.id === slot.installed);
    if (!aug) continue;
    for (const [k, v] of Object.entries(aug.effects as Record<string, number>)) {
      totals[k] = (totals[k] ?? 0) + v;
    }
  }
  return totals;
}

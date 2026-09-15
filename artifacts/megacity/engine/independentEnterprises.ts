import type { GameState, TickEntry, GameMessage } from "@/engine/types";
import type { ActiveChain } from "@/engine/corporateChains";
import { aggregateChainEffects } from "@/engine/corporateChains";
import { gameTimestamp } from "@/engine/gameTimestamp";
import { recordCreditsEarned } from "@/engine/creditTracking";

export type BusinessTier = 1 | 2 | 3;

export type BusinessCategory =
  | "food_drink"
  | "nightlife"
  | "entertainment"
  | "personal_services"
  | "repair_utility"
  | "retail"
  | "fitness_wellness"
  | "transport"
  | "construction"
  | "education_craft"
  | "professional"
  | "grey_market"
  | "cultural_faith"
  | "media_tech";

export type BusinessStatus = "thriving" | "stable" | "struggling" | "closing";

export interface BusinessArchetype {
  id: string;
  displayName: string;
  category: BusinessCategory;
  tier: BusinessTier;
  baseEmployees: number;
  baseTaxPerTick: number;
  baseHappinessContribution: number;
  minPopulation: number;
  weight: number;
  spawnModifiers: {
    immigrationBonus?: number;
    povertyBonus?: number;
    wealthBonus?: number;
    crimeBonus?: number;
    crimePenalty?: number;
  };
  closureSensitivity: {
    crime: number;
    unrest: number;
    happiness: number;
  };
  ownerSurnameStyle: "diverse" | "anglo" | "corporate" | "satirical";
  notableOpening?: boolean;
  openingFlavor?: string;
}

export interface ActiveBusiness {
  uid: string;
  archetypeId: string;
  name: string;
  ownerName?: string;
  districtId: string;
  tier: BusinessTier;
  locations: number;
  employees: number;
  yearsActive: number;
  ticksActive: number;
  reputation: number;
  status: BusinessStatus;
  notable: boolean;
  spawnedAtTick: number;
}

export interface ClosedBusinessRecord {
  uid: string;
  name: string;
  archetypeId: string;
  districtId: string;
  tier: BusinessTier;
  yearsActive: number;
  closedAtTick: number;
  reason: string;
}

export interface LocalEconomyState {
  businesses: ActiveBusiness[];
  closedHistory: ClosedBusinessRecord[];
  totalsByCategory: Record<string, number>;
  uniqueArchetypesActive: string[];
  everSeenArchetypes: string[];
  vibrancyBonus: number;
  taxPerTick: number;
  totalEmployees: number;
  lastSpawnTick: number;
  lastDecayTick: number;
  corporateChains?: ActiveChain[];
  chainTaxPerTick?: number;
  chainEmployees?: number;
  totalLocations?: number;
  jobsByDistrict?: Record<string, number>;
  landmarkCount?: number;
  dynastyCount?: number;
  oldestBusinessYears?: number;
  legacyBonus?: number;
  highestEverBusinessCount?: number;
  totalBusinessesEverOpened?: number;
}

export const VICE_ARCHETYPE_IDS = new Set<string>([
  "speakeasy",
  "hookah_lounge",
  "jazz_club",
  "sports_bar",
]);

export const TICKS_PER_YEAR = 96;
export const SPAWN_INTERVAL_TICKS = 6;
export const DECAY_INTERVAL_TICKS = 6;
export const MAX_BUSINESSES = 1500;
// Kept at 100: while local-economy.tsx slices to 60 for display,
// businessEventChains.ts:155 (`biz_phoenix_reopen`) filters the full
// list for entries with yearsActive >= 5, so trimming below 100
// would starve a long-running event chain.
export const MAX_CLOSED_HISTORY = 100;
export const MAX_TAX_PER_TICK = 30000;
export const ANNIVERSARY_YEARS = [10, 25, 50];

// Returns the effective spawn interval for this tick, factoring in active
// policies (Small Business Stimulus, Corporate Welcome Mat, Marketplace
// Equilibrium) and prestige bonuses (Patron of the Streets). Lower means
// shops appear more often. Floor of 2 ticks prevents pathological spawn
// floods if a player stacks every accelerator.
export function getEffectiveSpawnInterval(s: GameState): number {
  let mult = 1;
  const policies = s.activePolicies ?? [];
  if (policies.includes("smallBusinessStimulus")) mult *= 0.5;
  if (policies.includes("corporateWelcomeMat")) mult *= 2.0;
  if (policies.includes("marketplaceEquilibrium")) mult *= 0.85;
  if (s.prestigeBusinessSpawnMult != null) mult *= s.prestigeBusinessSpawnMult;
  return Math.max(2, Math.round(SPAWN_INTERVAL_TICKS * mult));
}

export const TIER_1_ARCHETYPES: BusinessArchetype[] = [
  {
    id: "family_noodle_shop",
    displayName: "Family Noodle Shop",
    category: "food_drink",
    tier: 1,
    baseEmployees: 4,
    baseTaxPerTick: 0.6,
    baseHappinessContribution: 0.02,
    minPopulation: 2000,
    weight: 1.4,
    spawnModifiers: { immigrationBonus: 1.5, crimePenalty: 1.0 },
    closureSensitivity: { crime: 1.0, unrest: 0.8, happiness: 1.2 },
    ownerSurnameStyle: "diverse",
  },
  {
    id: "corner_cafe",
    displayName: "Corner Cafe",
    category: "food_drink",
    tier: 1,
    baseEmployees: 3,
    baseTaxPerTick: 0.5,
    baseHappinessContribution: 0.02,
    minPopulation: 1500,
    weight: 1.6,
    spawnModifiers: { wealthBonus: 0.5 },
    closureSensitivity: { crime: 0.8, unrest: 0.6, happiness: 1.0 },
    ownerSurnameStyle: "diverse",
  },
  {
    id: "vat_protein_grill",
    displayName: "Vat-Protein Grill",
    category: "food_drink",
    tier: 1,
    baseEmployees: 5,
    baseTaxPerTick: 0.7,
    baseHappinessContribution: 0.01,
    minPopulation: 3000,
    weight: 1.2,
    spawnModifiers: { povertyBonus: 0.5 },
    closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.7 },
    ownerSurnameStyle: "satirical",
  },
  {
    id: "neighborhood_bakery",
    displayName: "Neighborhood Bakery",
    category: "food_drink",
    tier: 1,
    baseEmployees: 4,
    baseTaxPerTick: 0.5,
    baseHappinessContribution: 0.025,
    minPopulation: 2000,
    weight: 1.3,
    spawnModifiers: { immigrationBonus: 0.8 },
    closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.0 },
    ownerSurnameStyle: "diverse",
  },
  {
    id: "dive_bar",
    displayName: "Dive Bar",
    category: "nightlife",
    tier: 1,
    baseEmployees: 5,
    baseTaxPerTick: 0.8,
    baseHappinessContribution: 0.02,
    minPopulation: 3000,
    weight: 1.2,
    spawnModifiers: { povertyBonus: 0.4, crimeBonus: 0.3 },
    closureSensitivity: { crime: 0.4, unrest: 0.3, happiness: 0.6 },
    ownerSurnameStyle: "anglo",
  },
  {
    id: "indie_arcade",
    displayName: "Indie Arcade",
    category: "entertainment",
    tier: 1,
    baseEmployees: 3,
    baseTaxPerTick: 0.4,
    baseHappinessContribution: 0.03,
    minPopulation: 4000,
    weight: 0.9,
    spawnModifiers: { wealthBonus: 0.3 },
    closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 1.1 },
    ownerSurnameStyle: "anglo",
  },
  {
    id: "vinyl_shop",
    displayName: "Vinyl & Vapor Music Store",
    category: "entertainment",
    tier: 1,
    baseEmployees: 2,
    baseTaxPerTick: 0.3,
    baseHappinessContribution: 0.025,
    minPopulation: 5000,
    weight: 0.6,
    spawnModifiers: { wealthBonus: 0.5 },
    closureSensitivity: { crime: 0.9, unrest: 0.8, happiness: 1.3 },
    ownerSurnameStyle: "anglo",
  },
  {
    id: "beauty_salon",
    displayName: "Beauty Salon",
    category: "personal_services",
    tier: 1,
    baseEmployees: 5,
    baseTaxPerTick: 0.7,
    baseHappinessContribution: 0.025,
    minPopulation: 2500,
    weight: 1.3,
    spawnModifiers: { wealthBonus: 0.4 },
    closureSensitivity: { crime: 0.8, unrest: 0.6, happiness: 1.0 },
    ownerSurnameStyle: "diverse",
  },
  {
    id: "neighborhood_barber",
    displayName: "Neighborhood Barber",
    category: "personal_services",
    tier: 1,
    baseEmployees: 2,
    baseTaxPerTick: 0.3,
    baseHappinessContribution: 0.02,
    minPopulation: 1500,
    weight: 1.5,
    spawnModifiers: {},
    closureSensitivity: { crime: 0.7, unrest: 0.5, happiness: 0.9 },
    ownerSurnameStyle: "anglo",
  },
  {
    id: "indie_droid_repair",
    displayName: "Indie Droid Repair",
    category: "repair_utility",
    tier: 1,
    baseEmployees: 4,
    baseTaxPerTick: 0.8,
    baseHappinessContribution: 0.02,
    minPopulation: 5000,
    weight: 1.0,
    spawnModifiers: {},
    closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.7 },
    ownerSurnameStyle: "anglo",
  },
  {
    id: "electronics_repair",
    displayName: "Electronics Repair Bench",
    category: "repair_utility",
    tier: 1,
    baseEmployees: 2,
    baseTaxPerTick: 0.4,
    baseHappinessContribution: 0.015,
    minPopulation: 2000,
    weight: 1.1,
    spawnModifiers: {},
    closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.6 },
    ownerSurnameStyle: "anglo",
  },
  {
    id: "laundromat",
    displayName: "Laundromat",
    category: "repair_utility",
    tier: 1,
    baseEmployees: 2,
    baseTaxPerTick: 0.3,
    baseHappinessContribution: 0.01,
    minPopulation: 2000,
    weight: 1.4,
    spawnModifiers: { povertyBonus: 0.3 },
    closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.6 },
    ownerSurnameStyle: "diverse",
  },
  {
    id: "pet_store",
    displayName: "Pet & Critter Store",
    category: "retail",
    tier: 1,
    baseEmployees: 3,
    baseTaxPerTick: 0.4,
    baseHappinessContribution: 0.025,
    minPopulation: 3000,
    weight: 0.9,
    spawnModifiers: { wealthBonus: 0.3 },
    closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.0 },
    ownerSurnameStyle: "anglo",
  },
  {
    id: "secondhand_bookshop",
    displayName: "Secondhand Bookshop",
    category: "retail",
    tier: 1,
    baseEmployees: 2,
    baseTaxPerTick: 0.2,
    baseHappinessContribution: 0.025,
    minPopulation: 4000,
    weight: 0.7,
    spawnModifiers: { wealthBonus: 0.4 },
    closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.2 },
    ownerSurnameStyle: "anglo",
  },
  {
    id: "pawn_shop",
    displayName: "Pawn Shop",
    category: "retail",
    tier: 1,
    baseEmployees: 2,
    baseTaxPerTick: 0.5,
    baseHappinessContribution: 0.005,
    minPopulation: 2500,
    weight: 1.0,
    spawnModifiers: { povertyBonus: 1.0, crimeBonus: 0.5 },
    closureSensitivity: { crime: 0.3, unrest: 0.3, happiness: 0.4 },
    ownerSurnameStyle: "diverse",
  },
  {
    id: "neighborhood_gym",
    displayName: "Neighborhood Gym",
    category: "fitness_wellness",
    tier: 1,
    baseEmployees: 4,
    baseTaxPerTick: 0.6,
    baseHappinessContribution: 0.025,
    minPopulation: 3500,
    weight: 1.0,
    spawnModifiers: { wealthBonus: 0.3 },
    closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.9 },
    ownerSurnameStyle: "anglo",
  },
  {
    id: "indie_taxi_coop",
    displayName: "Independent Taxi Co-op",
    category: "transport",
    tier: 1,
    baseEmployees: 8,
    baseTaxPerTick: 1.0,
    baseHappinessContribution: 0.02,
    minPopulation: 5000,
    weight: 0.8,
    spawnModifiers: {},
    closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.7 },
    ownerSurnameStyle: "diverse",
  },
  {
    id: "cram_school",
    displayName: "Back-Alley Cram School",
    category: "education_craft",
    tier: 1,
    baseEmployees: 3,
    baseTaxPerTick: 0.4,
    baseHappinessContribution: 0.02,
    minPopulation: 3000,
    weight: 0.9,
    spawnModifiers: { immigrationBonus: 0.6, wealthBonus: 0.2 },
    closureSensitivity: { crime: 0.8, unrest: 0.6, happiness: 0.9 },
    ownerSurnameStyle: "diverse",
  },
  {
    id: "freelance_paperwork",
    displayName: "Freelance Paperwork Fixer",
    category: "professional",
    tier: 1,
    baseEmployees: 1,
    baseTaxPerTick: 0.3,
    baseHappinessContribution: 0.01,
    minPopulation: 1500,
    weight: 1.1,
    spawnModifiers: { immigrationBonus: 0.8 },
    closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.6 },
    ownerSurnameStyle: "satirical",
  },
  {
    id: "fortune_teller",
    displayName: "Fortune Teller's Parlor",
    category: "cultural_faith",
    tier: 1,
    baseEmployees: 1,
    baseTaxPerTick: 0.2,
    baseHappinessContribution: 0.015,
    minPopulation: 2000,
    weight: 0.7,
    spawnModifiers: { immigrationBonus: 0.5, povertyBonus: 0.3 },
    closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.8 },
    ownerSurnameStyle: "diverse",
  },

  // ========== FOOD & DRINK (+6) ==========
  { id: "ramen_counter", displayName: "Ramen Counter", category: "food_drink", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.5, baseHappinessContribution: 0.025, minPopulation: 2000, weight: 1.4, spawnModifiers: { immigrationBonus: 1.2 }, closureSensitivity: { crime: 0.9, unrest: 0.7, happiness: 1.1 }, ownerSurnameStyle: "diverse" },
  { id: "street_food_cart", displayName: "Street Food Cart", category: "food_drink", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.3, baseHappinessContribution: 0.02, minPopulation: 1500, weight: 1.7, spawnModifiers: { povertyBonus: 0.6 }, closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.8 }, ownerSurnameStyle: "diverse" },
  { id: "sushi_train", displayName: "Conveyor Sushi Bar", category: "food_drink", tier: 1, baseEmployees: 5, baseTaxPerTick: 0.7, baseHappinessContribution: 0.025, minPopulation: 4000, weight: 0.9, spawnModifiers: { wealthBonus: 0.5 }, closureSensitivity: { crime: 0.9, unrest: 0.8, happiness: 1.0 }, ownerSurnameStyle: "diverse" },
  { id: "taco_stand", displayName: "Taco Stand", category: "food_drink", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.4, baseHappinessContribution: 0.025, minPopulation: 1500, weight: 1.5, spawnModifiers: { immigrationBonus: 0.9 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.9 }, ownerSurnameStyle: "diverse" },
  { id: "private_soup_kitchen", displayName: "Private Soup Kitchen", category: "food_drink", tier: 1, baseEmployees: 4, baseTaxPerTick: 0.2, baseHappinessContribution: 0.04, minPopulation: 3000, weight: 0.8, spawnModifiers: { povertyBonus: 1.2 }, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.6 }, ownerSurnameStyle: "anglo", notableOpening: true, openingFlavor: "A new private soup kitchen has opened. The Welfare Office insists their numbers are sufficient. The kitchen disagrees, quietly, with bowls." },
  { id: "gourmet_vendor", displayName: "Gourmet Insect Protein Vendor", category: "food_drink", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.6, baseHappinessContribution: 0.015, minPopulation: 4000, weight: 0.6, spawnModifiers: { wealthBonus: 0.8 }, closureSensitivity: { crime: 0.9, unrest: 0.8, happiness: 1.4 }, ownerSurnameStyle: "satirical" },

  // ========== NIGHTLIFE (+5) ==========
  { id: "jazz_club", displayName: "Jazz Club", category: "nightlife", tier: 1, baseEmployees: 8, baseTaxPerTick: 1.2, baseHappinessContribution: 0.04, minPopulation: 6000, weight: 0.5, spawnModifiers: { wealthBonus: 0.7 }, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 1.1 }, ownerSurnameStyle: "anglo", notableOpening: true, openingFlavor: "A new jazz club has opened. The cover charge is steep. The brass is real." },
  { id: "karaoke_booths", displayName: "Karaoke Booth Rental", category: "nightlife", tier: 1, baseEmployees: 4, baseTaxPerTick: 0.8, baseHappinessContribution: 0.03, minPopulation: 4000, weight: 1.0, spawnModifiers: { immigrationBonus: 0.6 }, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.9 }, ownerSurnameStyle: "diverse" },
  { id: "hookah_lounge", displayName: "Hookah Lounge", category: "nightlife", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.6, baseHappinessContribution: 0.02, minPopulation: 4000, weight: 0.7, spawnModifiers: { immigrationBonus: 0.7 }, closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.7 }, ownerSurnameStyle: "diverse" },
  { id: "speakeasy", displayName: "After-Hours Speakeasy", category: "nightlife", tier: 1, baseEmployees: 5, baseTaxPerTick: 0.9, baseHappinessContribution: 0.025, minPopulation: 5000, weight: 0.5, spawnModifiers: { wealthBonus: 0.4, crimeBonus: 0.4 }, closureSensitivity: { crime: 0.4, unrest: 0.3, happiness: 0.6 }, ownerSurnameStyle: "anglo", notableOpening: true, openingFlavor: "An unmarked door has appeared on a quiet corridor. The password changes weekly. Nobody officially knows it exists." },
  { id: "sports_bar", displayName: "Sports Bar", category: "nightlife", tier: 1, baseEmployees: 6, baseTaxPerTick: 0.9, baseHappinessContribution: 0.025, minPopulation: 5000, weight: 0.9, spawnModifiers: {}, closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.8 }, ownerSurnameStyle: "anglo" },

  // ========== ENTERTAINMENT (+5) ==========
  { id: "vr_parlor", displayName: "VR Parlor", category: "entertainment", tier: 1, baseEmployees: 4, baseTaxPerTick: 0.7, baseHappinessContribution: 0.03, minPopulation: 5000, weight: 0.8, spawnModifiers: { wealthBonus: 0.5 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 1.0 }, ownerSurnameStyle: "anglo" },
  { id: "indie_cinema", displayName: "Indie Cinema", category: "entertainment", tier: 1, baseEmployees: 5, baseTaxPerTick: 0.5, baseHappinessContribution: 0.035, minPopulation: 6000, weight: 0.4, spawnModifiers: { wealthBonus: 0.6 }, closureSensitivity: { crime: 0.9, unrest: 0.8, happiness: 1.3 }, ownerSurnameStyle: "anglo", notableOpening: true, openingFlavor: "A small cinema has opened, screening pre-Collapse films. The projectionist refuses to show approved propaganda reels. Critics call this brave. Censors call it 'noted'." },
  { id: "board_game_cafe", displayName: "Board Game Cafe", category: "entertainment", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.4, baseHappinessContribution: 0.03, minPopulation: 4000, weight: 0.7, spawnModifiers: { wealthBonus: 0.4 }, closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.1 }, ownerSurnameStyle: "anglo" },
  { id: "comic_shop", displayName: "Comic & Manga Shop", category: "entertainment", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.3, baseHappinessContribution: 0.025, minPopulation: 4000, weight: 0.6, spawnModifiers: { wealthBonus: 0.3 }, closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.2 }, ownerSurnameStyle: "diverse" },
  { id: "holo_theater", displayName: "Holo-Theater", category: "entertainment", tier: 1, baseEmployees: 6, baseTaxPerTick: 0.8, baseHappinessContribution: 0.035, minPopulation: 7000, weight: 0.4, spawnModifiers: { wealthBonus: 0.7 }, closureSensitivity: { crime: 0.9, unrest: 0.8, happiness: 1.2 }, ownerSurnameStyle: "anglo" },

  // ========== PERSONAL SERVICES (+4) ==========
  { id: "tattoo_parlor", displayName: "Tattoo Parlor", category: "personal_services", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.6, baseHappinessContribution: 0.02, minPopulation: 3000, weight: 1.0, spawnModifiers: { crimeBonus: 0.2 }, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.8 }, ownerSurnameStyle: "anglo" },
  { id: "nail_studio", displayName: "Nail & Lash Studio", category: "personal_services", tier: 1, baseEmployees: 4, baseTaxPerTick: 0.5, baseHappinessContribution: 0.02, minPopulation: 2500, weight: 1.2, spawnModifiers: { wealthBonus: 0.4 }, closureSensitivity: { crime: 0.8, unrest: 0.6, happiness: 0.9 }, ownerSurnameStyle: "diverse" },
  { id: "massage_parlor", displayName: "Therapeutic Massage Parlor", category: "personal_services", tier: 1, baseEmployees: 4, baseTaxPerTick: 0.6, baseHappinessContribution: 0.025, minPopulation: 3500, weight: 1.0, spawnModifiers: { wealthBonus: 0.3 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.8 }, ownerSurnameStyle: "diverse" },
  { id: "matchmaker_office", displayName: "Matchmaker's Office", category: "personal_services", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.4, baseHappinessContribution: 0.02, minPopulation: 4000, weight: 0.5, spawnModifiers: { immigrationBonus: 0.6 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.9 }, ownerSurnameStyle: "diverse" },

  // ========== REPAIR & UTILITY (+4) ==========
  { id: "bike_repair", displayName: "Bike & Scooter Repair", category: "repair_utility", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.3, baseHappinessContribution: 0.015, minPopulation: 2000, weight: 1.2, spawnModifiers: { povertyBonus: 0.4 }, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.6 }, ownerSurnameStyle: "anglo" },
  { id: "locksmith", displayName: "Locksmith", category: "repair_utility", tier: 1, baseEmployees: 1, baseTaxPerTick: 0.4, baseHappinessContribution: 0.01, minPopulation: 2000, weight: 1.0, spawnModifiers: { crimeBonus: 0.5 }, closureSensitivity: { crime: 0.4, unrest: 0.3, happiness: 0.5 }, ownerSurnameStyle: "anglo" },
  { id: "indie_plumber", displayName: "Indie Plumbing Crew", category: "repair_utility", tier: 1, baseEmployees: 4, baseTaxPerTick: 0.7, baseHappinessContribution: 0.015, minPopulation: 3000, weight: 1.0, spawnModifiers: {}, closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.5 }, ownerSurnameStyle: "anglo" },
  { id: "courier_service", displayName: "Courier Service", category: "repair_utility", tier: 1, baseEmployees: 6, baseTaxPerTick: 0.8, baseHappinessContribution: 0.015, minPopulation: 4000, weight: 1.0, spawnModifiers: {}, closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.5 }, ownerSurnameStyle: "diverse" },

  // ========== RETAIL (+5) ==========
  { id: "corner_store", displayName: "Corner Store", category: "retail", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.5, baseHappinessContribution: 0.02, minPopulation: 1500, weight: 1.8, spawnModifiers: { immigrationBonus: 0.6 }, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.7 }, ownerSurnameStyle: "diverse" },
  { id: "vintage_clothing", displayName: "Vintage Clothing Boutique", category: "retail", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.4, baseHappinessContribution: 0.025, minPopulation: 4000, weight: 0.7, spawnModifiers: { wealthBonus: 0.5 }, closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.2 }, ownerSurnameStyle: "anglo" },
  { id: "hardware_store", displayName: "Hardware Store", category: "retail", tier: 1, baseEmployees: 4, baseTaxPerTick: 0.6, baseHappinessContribution: 0.015, minPopulation: 2500, weight: 1.2, spawnModifiers: {}, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.6 }, ownerSurnameStyle: "anglo" },
  { id: "flower_stall", displayName: "Flower & Hydroponic Stall", category: "retail", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.3, baseHappinessContribution: 0.025, minPopulation: 2000, weight: 0.9, spawnModifiers: { wealthBonus: 0.4 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 1.1 }, ownerSurnameStyle: "diverse" },
  { id: "antique_dealer", displayName: "Pre-War Antique Dealer", category: "retail", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.5, baseHappinessContribution: 0.02, minPopulation: 5000, weight: 0.4, spawnModifiers: { wealthBonus: 0.7 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 1.2 }, ownerSurnameStyle: "anglo" },

  // ========== FITNESS & WELLNESS (+4) ==========
  { id: "boxing_gym", displayName: "Boxing Gym", category: "fitness_wellness", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.5, baseHappinessContribution: 0.025, minPopulation: 4000, weight: 0.7, spawnModifiers: { povertyBonus: 0.4 }, closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.7 }, ownerSurnameStyle: "anglo" },
  { id: "yoga_studio", displayName: "Yoga & Meditation Studio", category: "fitness_wellness", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.5, baseHappinessContribution: 0.03, minPopulation: 4000, weight: 0.7, spawnModifiers: { wealthBonus: 0.6 }, closureSensitivity: { crime: 0.9, unrest: 0.8, happiness: 1.2 }, ownerSurnameStyle: "diverse" },
  { id: "herbalist", displayName: "Herbalist's Shop", category: "fitness_wellness", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.3, baseHappinessContribution: 0.02, minPopulation: 2500, weight: 0.8, spawnModifiers: { immigrationBonus: 0.6 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.8 }, ownerSurnameStyle: "diverse" },
  { id: "acupuncture", displayName: "Acupuncture Clinic", category: "fitness_wellness", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.4, baseHappinessContribution: 0.025, minPopulation: 4000, weight: 0.5, spawnModifiers: { immigrationBonus: 0.5, wealthBonus: 0.3 }, closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 0.9 }, ownerSurnameStyle: "diverse" },

  // ========== TRANSPORT (+3) ==========
  { id: "jitney_service", displayName: "Jitney Service", category: "transport", tier: 1, baseEmployees: 6, baseTaxPerTick: 0.8, baseHappinessContribution: 0.02, minPopulation: 4000, weight: 0.9, spawnModifiers: { povertyBonus: 0.5 }, closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.6 }, ownerSurnameStyle: "diverse" },
  { id: "bike_messenger", displayName: "Bike Messenger Co-op", category: "transport", tier: 1, baseEmployees: 5, baseTaxPerTick: 0.5, baseHappinessContribution: 0.015, minPopulation: 3000, weight: 0.9, spawnModifiers: {}, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.7 }, ownerSurnameStyle: "anglo" },
  { id: "gondola_op", displayName: "Skyway Gondola Operator", category: "transport", tier: 1, baseEmployees: 5, baseTaxPerTick: 0.9, baseHappinessContribution: 0.025, minPopulation: 6000, weight: 0.4, spawnModifiers: { wealthBonus: 0.4 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.8 }, ownerSurnameStyle: "anglo" },

  // ========== CONSTRUCTION (+3) ==========
  { id: "indie_contractor", displayName: "Indie General Contractor", category: "construction", tier: 1, baseEmployees: 8, baseTaxPerTick: 1.2, baseHappinessContribution: 0.015, minPopulation: 4000, weight: 0.9, spawnModifiers: { immigrationBonus: 0.4 }, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.6 }, ownerSurnameStyle: "diverse" },
  { id: "sign_painter", displayName: "Sign Painter Workshop", category: "construction", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.3, baseHappinessContribution: 0.02, minPopulation: 3000, weight: 0.5, spawnModifiers: {}, closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.1 }, ownerSurnameStyle: "anglo" },
  { id: "scaffolding_crew", displayName: "Scaffolding Crew", category: "construction", tier: 1, baseEmployees: 10, baseTaxPerTick: 1.4, baseHappinessContribution: 0.01, minPopulation: 5000, weight: 0.6, spawnModifiers: {}, closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.5 }, ownerSurnameStyle: "anglo" },

  // ========== EDUCATION & CRAFT (+4) ==========
  { id: "art_workshop", displayName: "Indie Art Workshop", category: "education_craft", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.3, baseHappinessContribution: 0.03, minPopulation: 4000, weight: 0.5, spawnModifiers: { wealthBonus: 0.5 }, closureSensitivity: { crime: 0.9, unrest: 0.8, happiness: 1.3 }, ownerSurnameStyle: "anglo" },
  { id: "music_teacher", displayName: "Music Teacher's Studio", category: "education_craft", tier: 1, baseEmployees: 1, baseTaxPerTick: 0.2, baseHappinessContribution: 0.025, minPopulation: 3000, weight: 0.7, spawnModifiers: { wealthBonus: 0.3 }, closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.0 }, ownerSurnameStyle: "diverse" },
  { id: "language_tutor", displayName: "Language Tutor", category: "education_craft", tier: 1, baseEmployees: 1, baseTaxPerTick: 0.2, baseHappinessContribution: 0.02, minPopulation: 2500, weight: 1.0, spawnModifiers: { immigrationBonus: 1.0 }, closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 0.8 }, ownerSurnameStyle: "diverse" },
  { id: "machinists_guild", displayName: "Machinists' Hall", category: "education_craft", tier: 1, baseEmployees: 6, baseTaxPerTick: 0.7, baseHappinessContribution: 0.025, minPopulation: 6000, weight: 0.4, spawnModifiers: { povertyBonus: 0.3 }, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.7 }, ownerSurnameStyle: "anglo", notableOpening: true, openingFlavor: "A new machinists' hall has opened — apprenticeships, tooling, and mutual-aid contracts. Officially recognized by no faction. Quietly tolerated by several." },

  // ========== PROFESSIONAL (+4) ==========
  { id: "notary_office", displayName: "Notary & Permit Office", category: "professional", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.4, baseHappinessContribution: 0.01, minPopulation: 2500, weight: 1.0, spawnModifiers: {}, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.6 }, ownerSurnameStyle: "satirical" },
  { id: "indie_accountant", displayName: "Independent Accountant", category: "professional", tier: 1, baseEmployees: 1, baseTaxPerTick: 0.3, baseHappinessContribution: 0.01, minPopulation: 3000, weight: 0.8, spawnModifiers: { wealthBonus: 0.3 }, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.6 }, ownerSurnameStyle: "anglo" },
  { id: "freelance_translator", displayName: "Freelance Translator", category: "professional", tier: 1, baseEmployees: 1, baseTaxPerTick: 0.2, baseHappinessContribution: 0.01, minPopulation: 2500, weight: 0.8, spawnModifiers: { immigrationBonus: 1.0 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.7 }, ownerSurnameStyle: "diverse" },
  { id: "private_eye", displayName: "Private Investigator", category: "professional", tier: 1, baseEmployees: 1, baseTaxPerTick: 0.4, baseHappinessContribution: 0.01, minPopulation: 4000, weight: 0.5, spawnModifiers: { crimeBonus: 0.4 }, closureSensitivity: { crime: 0.4, unrest: 0.3, happiness: 0.5 }, ownerSurnameStyle: "anglo", notableOpening: true, openingFlavor: "A private investigator has hung out a shingle. Discreet inquiries. Cash only. The lobby ashtray is always full." },

  // ========== GREY MARKET (+5) ==========
  { id: "chip_mod_shop", displayName: "Chip-Mod Shop", category: "grey_market", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.5, baseHappinessContribution: 0.015, minPopulation: 3000, weight: 0.7, spawnModifiers: { povertyBonus: 0.4, crimeBonus: 0.5 }, closureSensitivity: { crime: 0.4, unrest: 0.3, happiness: 0.5 }, ownerSurnameStyle: "anglo" },
  { id: "currency_exchange", displayName: "Off-Books Currency Exchange", category: "grey_market", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.6, baseHappinessContribution: 0.005, minPopulation: 3500, weight: 0.6, spawnModifiers: { immigrationBonus: 0.6, crimeBonus: 0.4 }, closureSensitivity: { crime: 0.4, unrest: 0.3, happiness: 0.4 }, ownerSurnameStyle: "diverse" },
  { id: "scrap_dealer", displayName: "Scrap & Salvage Dealer", category: "grey_market", tier: 1, baseEmployees: 4, baseTaxPerTick: 0.6, baseHappinessContribution: 0.005, minPopulation: 2500, weight: 1.0, spawnModifiers: { povertyBonus: 0.7 }, closureSensitivity: { crime: 0.4, unrest: 0.3, happiness: 0.4 }, ownerSurnameStyle: "anglo" },
  { id: "document_forger", displayName: "Discreet Documents Office", category: "grey_market", tier: 1, baseEmployees: 1, baseTaxPerTick: 0.4, baseHappinessContribution: 0.005, minPopulation: 4000, weight: 0.4, spawnModifiers: { immigrationBonus: 0.7, crimeBonus: 0.6 }, closureSensitivity: { crime: 0.3, unrest: 0.2, happiness: 0.3 }, ownerSurnameStyle: "satirical", notableOpening: true, openingFlavor: "A new 'discreet documents' office has opened. The signage is in three languages. The clientele is in a hurry. The proprietor asks no questions." },
  { id: "off_books_mechanic", displayName: "Off-Books Mechanic", category: "grey_market", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.5, baseHappinessContribution: 0.01, minPopulation: 3000, weight: 0.8, spawnModifiers: { crimeBonus: 0.4 }, closureSensitivity: { crime: 0.4, unrest: 0.3, happiness: 0.4 }, ownerSurnameStyle: "anglo" },

  // ========== CULTURAL & FAITH (+4) ==========
  { id: "shrine_keeper", displayName: "Shrine Keeper", category: "cultural_faith", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.2, baseHappinessContribution: 0.025, minPopulation: 2500, weight: 0.6, spawnModifiers: { immigrationBonus: 0.6 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.9 }, ownerSurnameStyle: "diverse" },
  { id: "tarot_reader", displayName: "Tarot & Numerology Reader", category: "cultural_faith", tier: 1, baseEmployees: 1, baseTaxPerTick: 0.2, baseHappinessContribution: 0.015, minPopulation: 2500, weight: 0.7, spawnModifiers: { povertyBonus: 0.3, immigrationBonus: 0.4 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.8 }, ownerSurnameStyle: "diverse" },
  { id: "neighborhood_temple", displayName: "Neighborhood Temple", category: "cultural_faith", tier: 1, baseEmployees: 4, baseTaxPerTick: 0.3, baseHappinessContribution: 0.04, minPopulation: 4000, weight: 0.5, spawnModifiers: { immigrationBonus: 0.8 }, closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.0 }, ownerSurnameStyle: "diverse", notableOpening: true, openingFlavor: "A new temple has opened. Faith is technically a registered hobby. The congregation has ignored this for centuries." },
  { id: "memorial_florist", displayName: "Memorial Florist", category: "cultural_faith", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.3, baseHappinessContribution: 0.02, minPopulation: 3000, weight: 0.6, spawnModifiers: {}, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 0.9 }, ownerSurnameStyle: "anglo" },

  // ========== MEDIA & TECH (+4) ==========
  { id: "podcast_studio", displayName: "Indie Podcast Studio", category: "media_tech", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.5, baseHappinessContribution: 0.025, minPopulation: 5000, weight: 0.5, spawnModifiers: { wealthBonus: 0.4 }, closureSensitivity: { crime: 0.8, unrest: 0.7, happiness: 1.1 }, ownerSurnameStyle: "anglo", notableOpening: true, openingFlavor: "A new indie podcast studio has opened. Episode One is rumored to be critical of municipal water policy. Censors call this 'a phase'." },
  { id: "zine_printer", displayName: "Zine & Pamphlet Printer", category: "media_tech", tier: 1, baseEmployees: 2, baseTaxPerTick: 0.3, baseHappinessContribution: 0.02, minPopulation: 4000, weight: 0.5, spawnModifiers: { povertyBonus: 0.3 }, closureSensitivity: { crime: 0.7, unrest: 0.6, happiness: 1.0 }, ownerSurnameStyle: "anglo" },
  { id: "drone_repair", displayName: "Civilian Drone Repair", category: "media_tech", tier: 1, baseEmployees: 3, baseTaxPerTick: 0.6, baseHappinessContribution: 0.015, minPopulation: 4000, weight: 0.8, spawnModifiers: {}, closureSensitivity: { crime: 0.6, unrest: 0.5, happiness: 0.6 }, ownerSurnameStyle: "anglo" },
  { id: "freelance_hacker", displayName: "Freelance Software Consultant", category: "media_tech", tier: 1, baseEmployees: 1, baseTaxPerTick: 0.5, baseHappinessContribution: 0.01, minPopulation: 4000, weight: 0.6, spawnModifiers: { wealthBonus: 0.4, crimeBonus: 0.3 }, closureSensitivity: { crime: 0.5, unrest: 0.4, happiness: 0.5 }, ownerSurnameStyle: "satirical" },
];

const ALL_ARCHETYPES: BusinessArchetype[] = [...TIER_1_ARCHETYPES];
const ARCHETYPE_BY_ID: Map<string, BusinessArchetype> = new Map(ALL_ARCHETYPES.map((a) => [a.id, a]));

export function getArchetypeById(id: string): BusinessArchetype | undefined {
  return ARCHETYPE_BY_ID.get(id);
}

export function getAllArchetypes(): BusinessArchetype[] {
  return ALL_ARCHETYPES;
}

const DIVERSE_SURNAMES = [
  "Nguyen", "Patel", "Chen", "Okafor", "Rodriguez", "Kim", "Hassan", "Ivanov",
  "Tanaka", "Singh", "Garcia", "Petrov", "Yamamoto", "Mwangi", "Akinyemi",
  "Reyes", "Suzuki", "Volkov", "Mensah", "Sato", "Park", "Diallo", "Khan",
  "Rossi", "Andersson", "Hernández", "Cohen", "Achebe", "Wong", "Bauer",
  "Tran", "Liu", "Nakamura", "Osei", "Cruz", "Karimov", "Goldberg", "Adebayo",
  "Müller", "Lopez", "Yılmaz", "Sharma", "Abadi", "Ferreira", "Choi", "Dubois",
  "Eze", "Iqbal", "Romano", "Boateng", "Salonen", "Nazarov", "Espinoza", "Tahir",
  "Ramírez", "Watanabe", "Levi", "Asante", "Demir", "Maluleke",
  "Okonkwo", "Saito", "Brahimi", "Castellano", "Dimitriou", "Eskandari",
  "Fonseca", "Gunawan", "Halilović", "Ishikawa", "Joubert", "Kaplan",
  "Lehtinen", "Mbeki", "Novak", "Owusu", "Park-Sun", "Quintero",
  "Rahimi", "Said", "Tomescu", "Ueno", "Vásquez", "Weiss",
  "Xu", "Yamashita", "Zarif", "Abara", "Bocelli", "Chowdhury",
];
const DIVERSE_FIRSTS = [
  "Mama", "Papa", "Old", "Auntie", "Uncle", "Tito", "Sister", "Brother",
  "Granny", "Cousin", "Big", "Little", "Tía", "Abuela", "Lola", "Halmoni",
  "Bibi", "Yaya", "Nana", "Tata", "Ammi", "Abu", "Ye-ye", "Nai-nai",
  "Babcia", "Dziadek", "Ojiisan", "Obaachan",
];
const ANGLO_SURNAMES = [
  "Brennan", "Holloway", "Whitaker", "Cole", "Sutton", "Marlowe", "Dale",
  "Pruitt", "Hartford", "Kowalski", "Bryce", "Fenwick", "Ash", "Vance",
  "Quill", "Mercer", "Trask", "Hollister", "Crane", "Doyle", "Vaughn", "Drake",
  "Beckett", "Holt", "Garrick", "Sloan", "Reardon", "Calloway", "Pemberton",
  "Sterling", "Kerrigan", "Whittle", "Yates", "Donovan", "Macready", "Caine",
  "Tilbrook", "Penhaligon", "Whitlock", "Shackleton", "Mortimer", "Ainsworth",
  "Crowley", "Larkin", "Bramwell", "Strickland", "Renshaw", "Wexler",
  "Thackeray", "Vellacott", "Drumgoole", "Halliburton", "Pickering", "Quigley",
  "Ridley", "Snowdon", "Tremaine", "Underhill", "Vesper", "Wickham",
];
const ANGLO_FIRSTS = [
  "Eddie's", "Ray's", "Sal's", "Frank's", "Joe's", "Mike's", "Hank's", "Doc",
  "Tony's", "Vinny's", "Big Lou's", "Murph's", "Sully's", "Pete's", "Curtis's",
  "Old Man", "Cousin Ed's", "Smitty's", "The Captain's",
  "Lefty's", "Knuckles'", "Whiskey", "Two-Tooth", "One-Eye", "Half-Hand",
  "Greasy Pete's", "Honest Mick's", "Sticky Fingers'", "The Widow", "Brass-Knuckle",
  "Dirty Sal's", "Six-Finger", "The Deacon's", "Mad Dog", "Crooked Tom's",
];
const SATIRICAL_PREFIXES = [
  "Department of", "Bureau of", "Office of", "Sub-Committee for",
  "Authorized", "Licensed", "Approved", "Compliant",
  "Commission on", "Directorate for", "Branch of", "Working Group on",
  "Provisional", "Conditionally Authorized", "Pre-Cleared", "Officially Tolerated",
  "Subdivision of", "Special Envoy for", "Standing Committee on",
  "Acting Office of", "Interim Authority for", "Provisional Liaison to",
  "Joint Task Force on", "Formerly the Bureau of", "Reorganized",
  "Reconstituted", "Newly Renamed", "Forthcoming",
];
const SATIRICAL_SUFFIXES = [
  "Compliance Services", "Authorized Outcomes", "Voluntary Cheer",
  "Mandatory Hospitality", "Approved Refreshment", "Optimal Throughput",
  "Sanctioned Joy", "Audited Comfort",
  "Permitted Recreation", "Quality Assurance", "Civic Wellness", "Registered Leisure",
  "Standardized Refreshment", "Contractually-Specified Joy", "Verified Authenticity",
  "Mandatory Wellness", "Endorsed Hospitality", "Reviewed Outcomes",
  "Tolerated Behaviors", "Permitted Indulgences", "Reasonable Discretion",
  "Approved Enthusiasms", "Documented Pleasures", "Quality-Adjusted Living",
  "Performance-Based Mercy", "Outcomes Reconciliation", "Behavioral Optimization",
  "Acceptable Variance", "Calibrated Empathy", "Provisional Forgiveness",
];
const DISTRICT_NUMBERS_RE = /\d+/;

export function generateBusinessName(archetype: BusinessArchetype, districtName: string, rng: () => number): string {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

  switch (archetype.ownerSurnameStyle) {
    case "diverse": {
      const sur = pick(DIVERSE_SURNAMES);
      const first = pick(DIVERSE_FIRSTS);
      const variants = [
        `${first} ${sur}'s`,
        `${sur} & Sons`,
        `${sur} Family ${shortLabel(archetype)}`,
        `Old ${sur}'s`,
      ];
      return pick(variants);
    }
    case "anglo": {
      const sur = pick(ANGLO_SURNAMES);
      const first = pick(ANGLO_FIRSTS);
      const variants = [
        `${first} ${shortLabel(archetype)}`,
        `${sur}'s`,
        `${sur} & Co.`,
        `The ${sur} ${shortLabel(archetype)}`,
      ];
      return pick(variants);
    }
    case "satirical": {
      const prefix = pick(SATIRICAL_PREFIXES);
      const suffix = pick(SATIRICAL_SUFFIXES);
      return `${prefix} ${suffix}`;
    }
    case "corporate":
    default: {
      const num = districtName.match(DISTRICT_NUMBERS_RE)?.[0] ?? "";
      return `${archetype.displayName}${num ? ` #${num}` : ""}`;
    }
  }
}

function shortLabel(a: BusinessArchetype): string {
  switch (a.category) {
    case "food_drink": return "Kitchen";
    case "nightlife": return "Lounge";
    case "entertainment": return "Hall";
    case "personal_services": return "Salon";
    case "repair_utility": return "Repair";
    case "retail": return "Goods";
    case "fitness_wellness": return "Gym";
    case "transport": return "Cab Co.";
    case "construction": return "Works";
    case "education_craft": return "Academy";
    case "professional": return "Office";
    case "grey_market": return "Exchange";
    case "cultural_faith": return "Parlor";
    case "media_tech": return "Studio";
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensureLocalEconomy(s: GameState): LocalEconomyState {
  if (!s.localEconomy) {
    s.localEconomy = {
      businesses: [],
      closedHistory: [],
      totalsByCategory: {},
      uniqueArchetypesActive: [],
      everSeenArchetypes: [],
      vibrancyBonus: 0,
      taxPerTick: 0,
      totalEmployees: 0,
      lastSpawnTick: 0,
      lastDecayTick: 0,
      jobsByDistrict: {},
    };
  }
  if (!s.localEconomy.everSeenArchetypes) {
    s.localEconomy.everSeenArchetypes = Array.from(new Set(s.localEconomy.businesses.map((b) => b.archetypeId)));
  }
  return s.localEconomy;
}

function computeSpawnWeight(arch: BusinessArchetype, district: GameState["districts"][number], cityImmigration: number): number {
  if (district.population < arch.minPopulation) return 0;

  let w = arch.weight;
  const mods = arch.spawnModifiers;

  const wealth01 = Math.max(0, Math.min(1, (district.wealth ?? 50) / 100));
  const crime01 = Math.max(0, Math.min(1, (district.crime ?? 0) / 100));
  const poverty01 = 1 - wealth01;
  const immigration01 = Math.max(0, Math.min(1, cityImmigration));

  if (mods.immigrationBonus) w += mods.immigrationBonus * immigration01;
  if (mods.wealthBonus) w += mods.wealthBonus * wealth01;
  if (mods.povertyBonus) w += mods.povertyBonus * poverty01;
  if (mods.crimeBonus) w += mods.crimeBonus * crime01;
  if (mods.crimePenalty) w -= mods.crimePenalty * crime01;

  return Math.max(0, w);
}

function pickWeighted<T extends { w: number }>(items: T[], rng: () => number): T | null {
  const total = items.reduce((s, i) => s + i.w, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function processIndependentEnterprises(s: GameState, entries: TickEntry[]): void {
  const tick = s.totalTicks ?? 0;
  const econ = ensureLocalEconomy(s);
  const districts = s.districts ?? [];
  if (districts.length === 0) return;

  const rng = mulberry32(tick * 9301 + 49297);

  const districtSoftCap = 6;
  const cityCap = MAX_BUSINESSES;
  const cityImmigration = Math.max(0, Math.min(1, ((s.demographics?.immigrationRate ?? 0) / 5)));
  const activePolicies = s.activePolicies ?? [];
  const smallBizCredit = activePolicies.includes("smallBusinessCredit");
  const viceBan = activePolicies.includes("viceBan");

  if (tick - econ.lastSpawnTick >= getEffectiveSpawnInterval(s) && econ.businesses.length < cityCap) {
    econ.lastSpawnTick = tick;

    const districtCounts = new Map<string, number>();
    for (const b of econ.businesses) {
      districtCounts.set(b.districtId, (districtCounts.get(b.districtId) ?? 0) + 1);
    }

    const candidates: { d: GameState["districts"][number]; weight: number }[] = [];
    for (const d of districts) {
      const have = districtCounts.get(d.id) ?? 0;
      if (have >= districtSoftCap) continue;
      if ((d.population ?? 0) < 1000) continue;
      const headroom = districtSoftCap - have;
      const happiness01 = Math.max(0, Math.min(1, (s.cityStats?.happiness ?? 50) / 100));
      const wealth01 = Math.max(0, Math.min(1, (d.wealth ?? 50) / 100));
      candidates.push({ d, weight: headroom * (0.4 + 0.6 * happiness01 + 0.3 * wealth01) });
    }

    const spawnsThisTick = Math.min(8, Math.floor(districts.length / 40) + 1);
    for (let i = 0; i < spawnsThisTick && econ.businesses.length < cityCap; i++) {
      const districtPick = pickWeighted(candidates.map((c) => ({ ...c, w: c.weight })), rng);
      if (!districtPick) break;
      const district = districtPick.d;

      const archCandidates = ALL_ARCHETYPES
        .filter((a) => !(viceBan && VICE_ARCHETYPE_IDS.has(a.id)))
        .map((a) => ({ a, w: computeSpawnWeight(a, district, cityImmigration) * (smallBizCredit ? 1.4 : 1) }))
        .filter((c) => c.w > 0);
      const archPick = pickWeighted(archCandidates, rng);
      if (!archPick) continue;
      const arch = archPick.a;

      const name = generateBusinessName(arch, district.name, rng);
      const uid = `biz_${tick}_${i}_${Math.floor(rng() * 1e6).toString(36)}`;
      const isFirstEver = !econ.everSeenArchetypes.includes(arch.id);
      const business: ActiveBusiness = {
        uid,
        archetypeId: arch.id,
        name,
        districtId: district.id,
        tier: arch.tier,
        locations: 1,
        employees: arch.baseEmployees,
        yearsActive: 0,
        ticksActive: 0,
        reputation: 0,
        status: "stable",
        notable: isFirstEver && !!arch.notableOpening,
        spawnedAtTick: tick,
      };
      econ.businesses.push(business);

      if (isFirstEver) {
        econ.everSeenArchetypes.push(arch.id);
        if (arch.notableOpening) {
          pushBusinessMessage(s, {
            category: "report",
            title: "NEW ESTABLISHMENT OPENED",
            body: `${name.toUpperCase()} (${arch.displayName}) has opened in ${district.name}. ${arch.openingFlavor ?? ""}`.trim(),
            priority: "low",
          });
        }
      }
    }
  }

  if (tick - econ.lastDecayTick >= DECAY_INTERVAL_TICKS && econ.businesses.length > 0) {
    econ.lastDecayTick = tick;

    const survivors: ActiveBusiness[] = [];
    const cityCrime01 = Math.max(0, Math.min(1, (s.cityStats?.crime ?? 0) / 100));
    const cityUnrest01 = Math.max(0, Math.min(1, (s.cityStats?.unrest ?? 0) / 100));
    const cityHappiness01 = Math.max(0, Math.min(1, (s.cityStats?.happiness ?? 50) / 100));

    const districtById = new Map(districts.map((d) => [d.id, d]));

    for (const b of econ.businesses) {
      b.ticksActive += 1;
      const newYears = Math.floor(b.ticksActive / TICKS_PER_YEAR);
      const yearChanged = newYears !== b.yearsActive;
      b.yearsActive = newYears;
      b.reputation = Math.min(100, b.yearsActive * 4);

      const arch = getArchetypeById(b.archetypeId);
      if (!arch) {
        survivors.push(b);
        continue;
      }

      const d = districtById.get(b.districtId);
      const localCrime01 = d ? Math.max(0, Math.min(1, (d.crime ?? 0) / 100)) : cityCrime01;
      const localUnrest01 = d ? Math.max(0, Math.min(1, (d.unrest ?? 0) / 100)) : cityUnrest01;

      const closurePressure =
        arch.closureSensitivity.crime * localCrime01 +
        arch.closureSensitivity.unrest * localUnrest01 +
        arch.closureSensitivity.happiness * (1 - cityHappiness01);

      const reputationBuffer = b.reputation / 200;
      const closureRoll = rng();
      const isVice = VICE_ARCHETYPE_IDS.has(b.archetypeId);
      const policyMod =
        (smallBizCredit ? 0.5 : 1) *
        (viceBan && isVice ? 6 : 1);
      const baseClosureChance = 0.005 + closurePressure * 0.02;
      const afterReputation = Math.max(0, baseClosureChance - reputationBuffer);
      const adjustedClosureChance = afterReputation * policyMod;

      if (closureRoll < adjustedClosureChance) {
        const reason = pickClosureReason(localCrime01, localUnrest01, cityHappiness01, rng);
        const isLandmark = b.yearsActive >= 10;

        econ.closedHistory.unshift({
          uid: b.uid,
          name: b.name,
          archetypeId: b.archetypeId,
          districtId: b.districtId,
          tier: b.tier,
          yearsActive: b.yearsActive,
          closedAtTick: tick,
          reason,
        });
        if (econ.closedHistory.length > MAX_CLOSED_HISTORY) {
          econ.closedHistory.length = MAX_CLOSED_HISTORY;
        }

        if (isLandmark) {
          pushBusinessMessage(s, {
            category: "report",
            title: "LOCAL LANDMARK CLOSED",
            body: `${b.name.toUpperCase()} has closed after ${b.yearsActive} years. ${flavorClosureLine(reason, rng)}`,
            priority: "low",
          });
        }
        continue;
      }

      if (closurePressure > 1.5) b.status = "struggling";
      else if (b.reputation > 30 && closurePressure < 0.6) b.status = "thriving";
      else b.status = "stable";

      if (yearChanged && ANNIVERSARY_YEARS.includes(b.yearsActive)) {
        b.notable = true;
        pushBusinessMessage(s, {
          category: "report",
          title: `${b.yearsActive} YEARS IN BUSINESS`,
          body: `${b.name.toUpperCase()} has served ${districtNameOf(s, b.districtId)} for ${b.yearsActive} years. ${flavorAnniversaryLine(b.yearsActive, rng)}`,
          priority: "low",
        });
      }

      survivors.push(b);
    }

    econ.businesses = survivors;
  }

  recomputeAggregates(econ, s);
  if (econ.businesses.length > 0 && tick % 8 === 0) {
    entries.push({
      label: "Local economy",
      delta: econ.businesses.length,
      unit: "shops",
      reason: `${econ.businesses.length} indie businesses, +${Math.round(econ.taxPerTick)} cr/tick`,
      severity: "neutral",
    });
  }
}

function pickClosureReason(crime: number, unrest: number, happiness: number, rng: () => number): string {
  const reasons: { reason: string; w: number }[] = [
    { reason: "rent_hike", w: 1.0 },
    { reason: "smog_tax", w: 0.6 },
    { reason: "no_customers", w: 1.0 + (1 - happiness) },
    { reason: "extortion", w: 0.4 + crime * 1.2 },
    { reason: "riot_damage", w: 0.2 + unrest * 1.0 },
    { reason: "owner_retirement", w: 0.5 },
    { reason: "MumCorp_competition", w: 0.7 },
  ];
  const pick = pickWeighted(reasons.map((r) => ({ ...r, w: r.w })), rng);
  return pick?.reason ?? "no_customers";
}

const CLOSURE_LINES: Record<string, string[]> = {
  rent_hike: [
    "The owner blames the rent. The rent does not deny it.",
    "The landlord doubled the rate overnight. Math did the rest.",
  ],
  smog_tax: [
    "The owner blamed the smog tax in a final social-media post. They were not wrong.",
    "Filtration permits cost more than the inventory. The math stopped working.",
  ],
  no_customers: [
    "The neighborhood moved on. Or the customers did. Or both.",
    "Foot traffic dried up. The space will become a vape lounge by next month.",
  ],
  extortion: [
    "Three men in identical coats explained the new arrangement. The owner declined.",
    "Protection fees grew faster than profits. A reasonable person would call it racketeering.",
  ],
  riot_damage: [
    "The riot took the windows. The insurance took the rest.",
    "Damage from civil unrest exceeded the rebuild budget.",
  ],
  owner_retirement: [
    "The owner has retired to a quieter floor. Possibly off-world. Possibly nowhere.",
    "After decades on the line, the proprietor finally hung up the apron.",
  ],
  MumCorp_competition: [
    "A MumBux opened across the corridor. It was always going to end this way.",
    "MumCorp's logistics arm offered a buyout. The buyout was declined. The lease was not renewed.",
  ],
};

function flavorClosureLine(reason: string, rng: () => number): string {
  const lines = CLOSURE_LINES[reason] ?? CLOSURE_LINES.no_customers;
  return lines[Math.floor(rng() * lines.length)];
}

const ANNIVERSARY_LINES_10: string[] = [
  "A decade of service. The original sign still hangs.",
  "Ten years. The owner's children now run the registers.",
  "A neighborhood institution, formally recognized. Cake was served.",
];
const ANNIVERSARY_LINES_25: string[] = [
  "Twenty-five years. Three generations have walked through the door.",
  "Quarter-century in operation. Outlasted four mayors and one minor uprising.",
  "Patrons have included regulars, renegades, and at least one fugitive.",
];
const ANNIVERSARY_LINES_50: string[] = [
  "Half a century in business. The original ovens still work. The original owner does not.",
  "Fifty years. The smell from the kitchen now appears on tourist maps.",
  "Outlasted the war, the collapse, and three rounds of urban renewal.",
];

function flavorAnniversaryLine(years: number, rng: () => number): string {
  const pool = years >= 50 ? ANNIVERSARY_LINES_50 : years >= 25 ? ANNIVERSARY_LINES_25 : ANNIVERSARY_LINES_10;
  return pool[Math.floor(rng() * pool.length)];
}

function districtNameOf(s: GameState, districtId: string): string {
  const d = s.districts?.find((x) => x.id === districtId);
  return d?.name ?? "the district";
}

function pushBusinessMessage(s: GameState, msg: { category: GameMessage["category"]; title: string; body: string; priority: GameMessage["priority"] }): void {
  if (!s.messages) s.messages = [];
  const gameMsg: GameMessage = {
    id: `biz_msg_${s.totalTicks}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    timestamp: gameTimestamp(s),
    tick: s.totalTicks ?? 0,
    category: msg.category,
    title: msg.title,
    body: msg.body,
    read: false,
    priority: msg.priority,
  };
  s.messages = [gameMsg, ...s.messages].slice(0, 200);
}

function recomputeAggregates(econ: LocalEconomyState, s: GameState): void {
  const totalsByCategory: Record<string, number> = {};
  const uniqueArchetypes = new Set<string>();
  const jobsByDistrict: Record<string, number> = {};
  let indieTax = 0;
  let indieEmployees = 0;
  let landmarkCount = 0;
  let dynastyCount = 0;
  let oldest = 0;

  for (const b of econ.businesses) {
    const arch = ARCHETYPE_BY_ID.get(b.archetypeId);
    if (!arch) continue;
    totalsByCategory[arch.category] = (totalsByCategory[arch.category] ?? 0) + 1;
    uniqueArchetypes.add(b.archetypeId);
    const reputationBoost = 1 + b.reputation / 200;
    indieTax += arch.baseTaxPerTick * b.locations * reputationBoost;
    const bizJobs = b.employees * b.locations;
    indieEmployees += bizJobs;
    if (b.districtId) {
      jobsByDistrict[b.districtId] = (jobsByDistrict[b.districtId] ?? 0) + bizJobs;
    }
    if (b.yearsActive >= 10) landmarkCount += 1;
    if (b.yearsActive >= 25) dynastyCount += 1;
    if (b.yearsActive > oldest) oldest = b.yearsActive;
  }

  if (indieTax > MAX_TAX_PER_TICK) indieTax = MAX_TAX_PER_TICK;

  const chainEffects = aggregateChainEffects(s);
  let totalLocations = 0;
  for (const c of econ.corporateChains ?? []) totalLocations += c.locationCount;

  econ.totalsByCategory = totalsByCategory;
  econ.uniqueArchetypesActive = Array.from(uniqueArchetypes);
  econ.taxPerTick = indieTax + chainEffects.tax;
  econ.totalEmployees = indieEmployees + chainEffects.employees;
  econ.chainTaxPerTick = chainEffects.tax;
  econ.chainEmployees = chainEffects.employees;
  econ.totalLocations = totalLocations;
  econ.jobsByDistrict = jobsByDistrict;

  const variety = uniqueArchetypes.size;
  const varietyComponent = Math.min(0.03, Math.floor(variety / 15) * 0.005);
  const landmarkComponent = Math.min(0.02, landmarkCount * 0.001);
  const dynastyComponent = Math.min(0.02, dynastyCount * 0.005);
  econ.vibrancyBonus = Math.min(0.05, varietyComponent + landmarkComponent);
  econ.legacyBonus = Math.min(0.04, landmarkComponent + dynastyComponent);
  econ.landmarkCount = landmarkCount;
  econ.dynastyCount = dynastyCount;
  econ.oldestBusinessYears = oldest;
  if ((econ.highestEverBusinessCount ?? 0) < econ.businesses.length) {
    econ.highestEverBusinessCount = econ.businesses.length;
  }
}

// Task #473: floored to keep the treasury integral (every other credit flow
// floors), and booked as a tick entry so the credits ledger accounts for it —
// this was the last recurring flow that moved credits invisibly.
export function applyIndependentEnterpriseTax(s: GameState, entries?: TickEntry[]): void {
  const econ = s.localEconomy;
  if (!econ || econ.taxPerTick <= 0) return;
  const amount = Math.floor(econ.taxPerTick);
  if (amount <= 0) return;
  s.resources.credits = (s.resources.credits ?? 0) + amount;
  recordCreditsEarned(s, amount);
  entries?.push({
    label: "Enterprise Tax",
    delta: amount,
    unit: "credits",
    reason: `${econ.businesses?.length ?? 0} independent businesses & chains`,
    severity: "positive",
  });
}

// ── Save-time compaction ──────────────────────────────────────────────────
// Business records carry several fields that are at-default for the vast
// majority of records (a freshly-spawned shop has reputation=0,
// notable=false, status="stable", locations=1, employees=arch.baseEmployees,
// yearsActive=0, ticksActive=0). Stripping these on serialization shrinks
// saves significantly without changing gameplay — the sanitizer rehydrates
// the missing fields on load to the same defaults so consumers
// (businessEventChains.ts, local-economy.tsx) don't have to special-case.
//
// For ClosedBusinessRecord: tier is dropped when it matches the archetype's
// tier (it always does, since we record b.tier from the live business which
// itself came from arch.tier). archetypeId is preserved because
// businessEventChains.ts:163 (biz_phoenix_reopen) reads it back.

export function compactActiveBusinessForSave(b: ActiveBusiness): Record<string, unknown> {
  const out: Record<string, unknown> = {
    uid: b.uid,
    archetypeId: b.archetypeId,
    name: b.name,
    districtId: b.districtId,
    tier: b.tier,
    spawnedAtTick: b.spawnedAtTick,
  };
  const arch = ARCHETYPE_BY_ID.get(b.archetypeId);
  if (!arch || b.employees !== arch.baseEmployees) out.employees = b.employees;
  if (b.locations !== 1) out.locations = b.locations;
  if (b.status !== "stable") out.status = b.status;
  if (b.reputation !== 0) out.reputation = b.reputation;
  if (b.notable) out.notable = true;
  if (b.yearsActive !== 0) out.yearsActive = b.yearsActive;
  if (b.ticksActive !== 0) out.ticksActive = b.ticksActive;
  if (b.ownerName) out.ownerName = b.ownerName;
  return out;
}

export function expandActiveBusinessFromSave(raw: any): ActiveBusiness {
  const arch = raw && typeof raw.archetypeId === "string" ? ARCHETYPE_BY_ID.get(raw.archetypeId) : undefined;
  return {
    uid: String(raw?.uid ?? ""),
    archetypeId: String(raw?.archetypeId ?? ""),
    name: String(raw?.name ?? ""),
    ownerName: typeof raw?.ownerName === "string" ? raw.ownerName : undefined,
    districtId: String(raw?.districtId ?? ""),
    tier: (raw?.tier ?? arch?.tier ?? 1) as BusinessTier,
    locations: typeof raw?.locations === "number" ? raw.locations : 1,
    employees: typeof raw?.employees === "number" ? raw.employees : (arch?.baseEmployees ?? 0),
    yearsActive: typeof raw?.yearsActive === "number" ? raw.yearsActive : 0,
    ticksActive: typeof raw?.ticksActive === "number" ? raw.ticksActive : 0,
    reputation: typeof raw?.reputation === "number" ? raw.reputation : 0,
    status: (raw?.status ?? "stable") as BusinessStatus,
    notable: raw?.notable === true,
    spawnedAtTick: typeof raw?.spawnedAtTick === "number" ? raw.spawnedAtTick : 0,
  };
}

export function compactClosedBusinessRecordForSave(c: ClosedBusinessRecord): Record<string, unknown> {
  const arch = ARCHETYPE_BY_ID.get(c.archetypeId);
  const out: Record<string, unknown> = {
    uid: c.uid,
    name: c.name,
    archetypeId: c.archetypeId,
    districtId: c.districtId,
    yearsActive: c.yearsActive,
    closedAtTick: c.closedAtTick,
    reason: c.reason,
  };
  if (!arch || c.tier !== arch.tier) out.tier = c.tier;
  return out;
}

export function expandClosedBusinessRecordFromSave(raw: any): ClosedBusinessRecord {
  const arch = raw && typeof raw.archetypeId === "string" ? ARCHETYPE_BY_ID.get(raw.archetypeId) : undefined;
  return {
    uid: String(raw?.uid ?? ""),
    name: String(raw?.name ?? ""),
    archetypeId: String(raw?.archetypeId ?? ""),
    districtId: String(raw?.districtId ?? ""),
    tier: (raw?.tier ?? arch?.tier ?? 1) as BusinessTier,
    yearsActive: typeof raw?.yearsActive === "number" ? raw.yearsActive : 0,
    closedAtTick: typeof raw?.closedAtTick === "number" ? raw.closedAtTick : 0,
    reason: typeof raw?.reason === "string" ? raw.reason : "unknown",
  };
}

// Returns a shallow-cloned state with localEconomy.businesses and
// localEconomy.closedHistory replaced by their compacted forms. Called by
// the slot writer and export serializers right before JSON.stringify so the
// in-memory state used by the running tick path is never touched.
export function compactStateForSave<T extends GameState>(state: T): T {
  if (!state || !state.localEconomy) return state;
  const econ = state.localEconomy;
  const businesses = Array.isArray(econ.businesses) ? econ.businesses : [];
  const closedHistory = Array.isArray(econ.closedHistory) ? econ.closedHistory : [];
  return {
    ...state,
    localEconomy: {
      ...econ,
      businesses: businesses.map(compactActiveBusinessForSave) as unknown as ActiveBusiness[],
      closedHistory: closedHistory.map(compactClosedBusinessRecordForSave) as unknown as ClosedBusinessRecord[],
    },
  };
}

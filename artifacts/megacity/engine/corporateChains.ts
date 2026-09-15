import type { GameState, GameMessage } from "@/engine/types";
import type { BusinessCategory } from "@/engine/independentEnterprises";
import { gameTimestamp } from "@/engine/gameTimestamp";

export type ChainFaction =
  | "corps"
  | "judges"
  | "gangs"
  | "helix-commune"
  | "aureus-dominion"
  | "verdant-enclave"
  | "independent";

export interface CorporateChain {
  id: string;
  name: string;
  shortName: string;
  faction: ChainFaction;
  category: BusinessCategory;
  tagline: string;
  baseLocations: number;
  maxLocations: number;
  taxPerLocation: number;
  employeesPerLocation: number;
  expansionWeight: number;
  flavor: string;
}

export interface ActiveChain {
  chainId: string;
  locationCount: number;
  foundedTick: number;
  lastExpansionTick: number;
  notableMilestones: number[];
}

export const CHAIN_EXPANSION_INTERVAL = 16;
export const CHAIN_EXPANSION_BASE_CHANCE = 0.15;
export const CHAIN_MILESTONE_LOCATIONS = [25, 50, 100, 200];

export const CORPORATE_CHAINS: CorporateChain[] = [
  // ===== MUMCORP / CORPS (5 chains) =====
  {
    id: "mumbux_coffee",
    name: "MumBux Coffee",
    shortName: "MumBux",
    faction: "corps",
    category: "food_drink",
    tagline: "The Mug of MumCorp",
    baseLocations: 40,
    maxLocations: 220,
    taxPerLocation: 8,
    employeesPerLocation: 12,
    expansionWeight: 1.6,
    flavor: "Identical mugs, identical music, identical compliance training. The coffee is acceptable. The footprint is enormous.",
  },
  {
    id: "mumfresh_grocer",
    name: "MumFresh Neighborhood Grocer",
    shortName: "MumFresh",
    faction: "corps",
    category: "retail",
    tagline: "Your friendly neighborhood megachain.",
    baseLocations: 28,
    maxLocations: 180,
    taxPerLocation: 14,
    employeesPerLocation: 35,
    expansionWeight: 1.3,
    flavor: "Started as a bodega buyout program. Now occupies one in eight retail slots citywide.",
  },
  {
    id: "mumlogistics",
    name: "MumLogistics Same-Hour",
    shortName: "MumLog",
    faction: "corps",
    category: "transport",
    tagline: "Faster than thought.",
    baseLocations: 18,
    maxLocations: 90,
    taxPerLocation: 22,
    employeesPerLocation: 80,
    expansionWeight: 1.1,
    flavor: "Drone hubs in every district. Drivers paid by the second. Liability waivers signed in advance.",
  },
  {
    id: "mumcare_clinics",
    name: "MumCare Walk-In Clinics",
    shortName: "MumCare",
    faction: "corps",
    category: "fitness_wellness",
    tagline: "Wellness, brought to you by us.",
    baseLocations: 22,
    maxLocations: 140,
    taxPerLocation: 16,
    employeesPerLocation: 28,
    expansionWeight: 1.2,
    flavor: "Subscriptions only. Out-of-network fees apply. 'Care' is trademarked.",
  },
  {
    id: "mumstream_lounges",
    name: "MumStream Entertainment Lounges",
    shortName: "MumStream",
    faction: "corps",
    category: "entertainment",
    tagline: "Recreation, optimized.",
    baseLocations: 16,
    maxLocations: 110,
    taxPerLocation: 12,
    employeesPerLocation: 18,
    expansionWeight: 1.0,
    flavor: "VR pods preloaded with approved content. Exit interviews are voluntary, mostly.",
  },

  // ===== AUREUS DOMINION (4 chains — luxury) =====
  {
    id: "aurum_boutiques",
    name: "Aurum Holdings Boutiques",
    shortName: "Aurum",
    faction: "aureus-dominion",
    category: "retail",
    tagline: "Legacy, refined.",
    baseLocations: 12,
    maxLocations: 60,
    taxPerLocation: 38,
    employeesPerLocation: 14,
    expansionWeight: 0.7,
    flavor: "Pre-Collapse antiques, certified scarce. Shoppers verify net worth at the door.",
  },
  {
    id: "platinum_spires",
    name: "Platinum Spires Concierge Dining",
    shortName: "Platinum",
    faction: "aureus-dominion",
    category: "food_drink",
    tagline: "Served by name.",
    baseLocations: 8,
    maxLocations: 40,
    taxPerLocation: 45,
    employeesPerLocation: 22,
    expansionWeight: 0.5,
    flavor: "Reservation-only. The waitlist is heritable. The wine list is a property bond.",
  },
  {
    id: "vesper_couture",
    name: "Vesper Couture",
    shortName: "Vesper",
    faction: "aureus-dominion",
    category: "personal_services",
    tagline: "Tailored to your station.",
    baseLocations: 10,
    maxLocations: 55,
    taxPerLocation: 30,
    employeesPerLocation: 16,
    expansionWeight: 0.6,
    flavor: "Bespoke garments, bespoke prices. Off-the-rack is treated as a personal failing.",
  },
  {
    id: "halcyon_clubs",
    name: "Halcyon Members' Clubs",
    shortName: "Halcyon",
    faction: "aureus-dominion",
    category: "nightlife",
    tagline: "Members only. Always.",
    baseLocations: 6,
    maxLocations: 35,
    taxPerLocation: 50,
    employeesPerLocation: 30,
    expansionWeight: 0.4,
    flavor: "Annual dues exceed the median wage. The membership committee meets in shadow.",
  },

  // ===== HELIX COMMUNE (4 chains — bio/medical/clone) =====
  {
    id: "fleshfresh_cafe",
    name: "FleshFresh Cloning Cafe",
    shortName: "FleshFresh",
    faction: "helix-commune",
    category: "food_drink",
    tagline: "Lab-grown. Soul-free.",
    baseLocations: 18,
    maxLocations: 100,
    taxPerLocation: 14,
    employeesPerLocation: 16,
    expansionWeight: 1.1,
    flavor: "Cellular-cultured everything. Ethical, allegedly. Tastes like a compromise.",
  },
  {
    id: "helix_pharmacy",
    name: "Helix Wellness Pharmacy",
    shortName: "HelixRx",
    faction: "helix-commune",
    category: "fitness_wellness",
    tagline: "Better living through chemistry.",
    baseLocations: 24,
    maxLocations: 130,
    taxPerLocation: 18,
    employeesPerLocation: 14,
    expansionWeight: 1.2,
    flavor: "Prescription nootropics, mood stabilizers, longevity packs. Side effects disclosed in fine print.",
  },
  {
    id: "vat_grow_groceries",
    name: "Vat-Grow Groceries",
    shortName: "Vat-Grow",
    faction: "helix-commune",
    category: "retail",
    tagline: "Honest produce. Honest origins.",
    baseLocations: 20,
    maxLocations: 110,
    taxPerLocation: 12,
    employeesPerLocation: 18,
    expansionWeight: 1.0,
    flavor: "Tank-grown vegetables in standardized cubes. Soil is a luxury most can't afford.",
  },
  {
    id: "longevity_labs",
    name: "Longevity Labs Clinics",
    shortName: "LongLab",
    faction: "helix-commune",
    category: "fitness_wellness",
    tagline: "Tomorrow, longer.",
    baseLocations: 10,
    maxLocations: 60,
    taxPerLocation: 32,
    employeesPerLocation: 22,
    expansionWeight: 0.7,
    flavor: "Telomere refresh, organ tune-ups, memory backups. Subscription required. Lapses fatal.",
  },

  // ===== JUDGES / AUTHORITY (3 chains) =====
  {
    id: "graybox_logistics",
    name: "GrayBox Authorized Logistics",
    shortName: "GrayBox",
    faction: "judges",
    category: "transport",
    tagline: "Approved freight, on time.",
    baseLocations: 16,
    maxLocations: 80,
    taxPerLocation: 24,
    employeesPerLocation: 60,
    expansionWeight: 1.0,
    flavor: "Contract carrier for the Authority. Cargo manifests reviewed by three departments before departure.",
  },
  {
    id: "civic_compliance_office",
    name: "Civic Compliance Office",
    shortName: "CivCom",
    faction: "judges",
    category: "professional",
    tagline: "Permits processed.",
    baseLocations: 30,
    maxLocations: 150,
    taxPerLocation: 10,
    employeesPerLocation: 8,
    expansionWeight: 1.4,
    flavor: "Window-counter franchises in every district. The line is the product. The stamps are the service.",
  },
  {
    id: "patriot_security",
    name: "Patriot Security Services",
    shortName: "Patriot",
    faction: "judges",
    category: "professional",
    tagline: "Order, on contract.",
    baseLocations: 14,
    maxLocations: 80,
    taxPerLocation: 28,
    employeesPerLocation: 35,
    expansionWeight: 0.9,
    flavor: "Private guard contracts for those who can pay. Off-the-books backup for those who can pay more.",
  },

  // ===== GANGS / SYNDICATES (3 chains — grey market T3) =====
  {
    id: "razors_pawn",
    name: "Razor's Pawn & Loan Network",
    shortName: "Razor's",
    faction: "gangs",
    category: "grey_market",
    tagline: "Cash today. Questions never.",
    baseLocations: 18,
    maxLocations: 110,
    taxPerLocation: 9,
    employeesPerLocation: 6,
    expansionWeight: 1.2,
    flavor: "Pawn shops, payday lenders, currency exchanges. Commonly owned. Never officially.",
  },
  {
    id: "syndicate_imports",
    name: "Syndicate Import/Export Co.",
    shortName: "SynImports",
    faction: "gangs",
    category: "grey_market",
    tagline: "Goods you can't find elsewhere.",
    baseLocations: 12,
    maxLocations: 70,
    taxPerLocation: 16,
    employeesPerLocation: 22,
    expansionWeight: 0.9,
    flavor: "Storefront warehouses moving sanctioned and unsanctioned cargo through the same loading bay.",
  },
  {
    id: "underline_arcades",
    name: "Underline Gambling Arcades",
    shortName: "Underline",
    faction: "gangs",
    category: "nightlife",
    tagline: "Loose machines. Tight payouts.",
    baseLocations: 14,
    maxLocations: 80,
    taxPerLocation: 20,
    employeesPerLocation: 14,
    expansionWeight: 1.0,
    flavor: "Card rooms behind chip-mod shops. The cameras film customers. The other cameras film the cameras.",
  },

  // ===== VERDANT ENCLAVE (3 chains — eco/wellness/indie-feeling) =====
  {
    id: "greenleaf_grocers",
    name: "Greenleaf Heritage Grocers",
    shortName: "Greenleaf",
    faction: "verdant-enclave",
    category: "retail",
    tagline: "Soil-grown. Always.",
    baseLocations: 8,
    maxLocations: 50,
    taxPerLocation: 22,
    employeesPerLocation: 12,
    expansionWeight: 0.6,
    flavor: "Real dirt. Real prices. Customers tip the seedlings.",
  },
  {
    id: "biodome_botanicals",
    name: "Biodome Botanicals",
    shortName: "Biodome",
    faction: "verdant-enclave",
    category: "fitness_wellness",
    tagline: "From the last gardens.",
    baseLocations: 6,
    maxLocations: 40,
    taxPerLocation: 26,
    employeesPerLocation: 10,
    expansionWeight: 0.5,
    flavor: "Herbal remedies sourced from sealed greenhouses. Stocked sparingly. Sold solemnly.",
  },
  {
    id: "wildline_apparel",
    name: "Wildline Reclaimed Apparel",
    shortName: "Wildline",
    faction: "verdant-enclave",
    category: "retail",
    tagline: "Worn before. Worn well.",
    baseLocations: 10,
    maxLocations: 55,
    taxPerLocation: 14,
    employeesPerLocation: 9,
    expansionWeight: 0.7,
    flavor: "Pre-Collapse textile salvage, restitched and resold. Each garment certified by handwritten tag.",
  },

  // ===== INDEPENDENT (3 chains — beloved local successes) =====
  {
    id: "old_jin_dynasty",
    name: "Old Jin's Family Restaurant Group",
    shortName: "Old Jin's",
    faction: "independent",
    category: "food_drink",
    tagline: "Three generations. Same recipe.",
    baseLocations: 6,
    maxLocations: 28,
    taxPerLocation: 12,
    employeesPerLocation: 18,
    expansionWeight: 0.5,
    flavor: "Started as a noodle shop in Sector 7. The original owner still works the wok at the original location. The other 22 are run by his children.",
  },
  {
    id: "iron_brennan_bars",
    name: "Iron Brennan Public Houses",
    shortName: "Iron B's",
    faction: "independent",
    category: "nightlife",
    tagline: "Honest pour. Honest fight.",
    baseLocations: 5,
    maxLocations: 24,
    taxPerLocation: 15,
    employeesPerLocation: 11,
    expansionWeight: 0.5,
    flavor: "Family-owned pubs. The Brennans don't sell. They've been offered. Repeatedly.",
  },
  {
    id: "doc_pruitts_repair",
    name: "Doc Pruitt's Repair Network",
    shortName: "Doc Pruitt's",
    faction: "independent",
    category: "repair_utility",
    tagline: "Fixed right or refunded.",
    baseLocations: 7,
    maxLocations: 30,
    taxPerLocation: 11,
    employeesPerLocation: 8,
    expansionWeight: 0.6,
    flavor: "A genuine indie success — droid, drone, and electronics repair. Doc Pruitt is in his nineties. The brand outlives him.",
  },
];

const CHAIN_BY_ID: Map<string, CorporateChain> = new Map(CORPORATE_CHAINS.map((c) => [c.id, c]));

export function getChainById(id: string): CorporateChain | undefined {
  return CHAIN_BY_ID.get(id);
}

export const ANTI_MONOPOLY_LOCATION_CAP = 60;

export function milestonesAlreadyMet(locations: number): number[] {
  return CHAIN_MILESTONE_LOCATIONS.filter((m) => locations >= m);
}

export function ensureCorporateChains(s: GameState): ActiveChain[] {
  if (!s.localEconomy) return [];
  if (!s.localEconomy.corporateChains) {
    s.localEconomy.corporateChains = CORPORATE_CHAINS.map((c) => {
      const startLocations = Math.max(1, Math.round(c.baseLocations * 0.5));
      return {
        chainId: c.id,
        locationCount: startLocations,
        foundedTick: 0,
        lastExpansionTick: 0,
        notableMilestones: milestonesAlreadyMet(startLocations),
      };
    });
  } else {
    const existing = new Set(s.localEconomy.corporateChains.map((a) => a.chainId));
    for (const c of CORPORATE_CHAINS) {
      if (!existing.has(c.id)) {
        const startLocations = Math.max(1, Math.round(c.baseLocations * 0.5));
        s.localEconomy.corporateChains.push({
          chainId: c.id,
          locationCount: startLocations,
          foundedTick: s.totalTicks ?? 0,
          lastExpansionTick: s.totalTicks ?? 0,
          notableMilestones: milestonesAlreadyMet(startLocations),
        });
      }
    }
    // Backfill notableMilestones for pre-existing entries that lost the field
    for (const a of s.localEconomy.corporateChains) {
      if (!a.notableMilestones || a.notableMilestones.length === 0) {
        a.notableMilestones = milestonesAlreadyMet(a.locationCount);
      }
    }
  }
  return s.localEconomy.corporateChains;
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

function pushChainMessage(s: GameState, msg: { title: string; body: string }): void {
  if (!s.messages) s.messages = [];
  const gameMsg: GameMessage = {
    id: `chain_msg_${s.totalTicks}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    timestamp: gameTimestamp(s),
    tick: s.totalTicks ?? 0,
    category: "report",
    title: msg.title,
    body: msg.body,
    read: false,
    priority: "low",
  };
  s.messages = [gameMsg, ...s.messages].slice(0, 200);
}

// Returns the effective base chance per-chain for this tick, factoring in
// active policies and prestige bonuses (Trust-Buster lowers it, Industrialist
// Heritage raises it). Floor of 0.005 keeps a sliver of expansion possible
// even with maxed Trust-Buster.
export function getEffectiveChainExpansionChance(s: GameState): number {
  let mult = 1;
  const policies = s.activePolicies ?? [];
  if (policies.includes("smallBusinessStimulus")) mult *= 0.7;
  if (policies.includes("corporateWelcomeMat")) mult *= 1.5;
  if (policies.includes("marketplaceEquilibrium")) mult *= 0.85;
  if (s.prestigeChainExpansionMult != null) mult *= s.prestigeChainExpansionMult;
  return Math.max(0.005, CHAIN_EXPANSION_BASE_CHANCE * mult);
}

// Effective antitrust cap for non-independent chains when the Anti-Monopoly
// Act is active. Trust-Buster Legacy lowers the cap by 5/10/15.
export function getEffectiveAntiMonopolyCap(s: GameState): number {
  const delta = s.prestigeAntiMonopolyCapDelta ?? 0;
  return Math.max(20, ANTI_MONOPOLY_LOCATION_CAP - delta);
}

export function processCorporateChains(s: GameState): void {
  const tick = s.totalTicks ?? 0;
  if (!s.localEconomy) return;
  const active = ensureCorporateChains(s);
  if (active.length === 0) return;

  if (tick % CHAIN_EXPANSION_INTERVAL !== 0) return;

  const rng = mulberry32(tick * 7919 + 13);
  const antiMonopoly = (s.activePolicies ?? []).includes("antiMonopolyAct");
  const cityHappiness01 = Math.max(0, Math.min(1, (s.cityStats?.happiness ?? 50) / 100));
  const cityWealth01 = Math.max(0, Math.min(1, (s.cityStats?.employment ?? 50) / 100));
  const cityCrime01 = Math.max(0, Math.min(1, (s.cityStats?.crime ?? 0) / 100));

  const baseChance = getEffectiveChainExpansionChance(s);
  const monopolyCap = getEffectiveAntiMonopolyCap(s);

  const factionThreatById = new Map<string, number>();
  for (const f of s.factions ?? []) {
    factionThreatById.set(f.id, f.threat ?? 0);
  }

  for (const chain of active) {
    const def = getChainById(chain.chainId);
    if (!def) continue;
    const effectiveCap = antiMonopoly && def.faction !== "independent"
      ? Math.min(def.maxLocations, monopolyCap)
      : def.maxLocations;
    if (chain.locationCount >= effectiveCap) continue;

    let chance = baseChance * def.expansionWeight;
    if (antiMonopoly && def.faction !== "independent") chance *= 0.4;

    chance *= 0.6 + 0.6 * cityHappiness01;
    if (def.faction === "aureus-dominion" || def.faction === "corps") {
      chance *= 0.7 + 0.6 * cityWealth01;
    }
    if (def.faction === "gangs") {
      chance *= 0.7 + 0.8 * cityCrime01;
    }
    if (def.faction === "judges") {
      chance *= 1 + (1 - cityCrime01) * 0.4;
    }

    const factionThreat = factionThreatById.get(def.faction) ?? 0;
    if (def.faction !== "independent") {
      const threat01 = Math.max(0, Math.min(1, factionThreat / 100));
      chance *= 0.5 + threat01 * 1.0;
    }

    if (rng() < chance) {
      chain.locationCount += 1;
      chain.lastExpansionTick = tick;

      for (const milestone of CHAIN_MILESTONE_LOCATIONS) {
        if (chain.locationCount >= milestone && !chain.notableMilestones.includes(milestone)) {
          chain.notableMilestones.push(milestone);
          pushChainMessage(s, {
            title: "CORPORATE EXPANSION",
            body: `${def.name.toUpperCase()} has reached ${milestone} locations citywide. ${def.flavor}`,
          });
        }
      }
    }
  }
}

export function aggregateChainEffects(s: GameState): { tax: number; employees: number } {
  const active = s.localEconomy?.corporateChains ?? [];
  let tax = 0;
  let employees = 0;
  for (const chain of active) {
    const def = getChainById(chain.chainId);
    if (!def) continue;
    tax += def.taxPerLocation * chain.locationCount;
    employees += def.employeesPerLocation * chain.locationCount;
  }
  return { tax, employees };
}

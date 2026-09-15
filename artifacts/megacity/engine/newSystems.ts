import type { GameState, TickEntry } from "@/engine/types";
import { ITEM_DEFS } from "@/engine/inventoryData";
import { addItemToInventory, recruitTroop } from "@/engine/retinue";
import { createDefaultRetinueState, type TroopClassId } from "@/engine/retinueData";
import { recordCreditsEarned } from "@/engine/creditTracking";
import { applyResourceDelta } from "@/engine/resourceStorage";
import { applyInfrastructureHealthDelta } from "@/engine/infrastructureLedger";

function clamp(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export type CivilWarState = {
  factionId: string;
  factionName: string;
  phase: "brewing" | "active" | "ceasefire" | "resolved";
  intensity: number;
  ticksRemaining: number;
  ticksElapsed: number;
  casualties: number;
  infrastructureDamage: number;
  triggerReason: string;
};

export type Expedition = {
  id: string;
  name: string;
  destination: string;
  type: "scavenge" | "recon" | "diplomacy" | "research" | "combat";
  personnelSent: number;
  supplyCost: number;
  ticksRemaining: number;
  ticksTotal: number;
  status: "active" | "completed" | "failed" | "lost";
  dangerLevel: number;
  discoveries: string[];
};

export type SeasonalEvent = {
  id: string;
  name: string;
  season: "dust-storm" | "acid-rain" | "solar-flare" | "deep-freeze" | "smog-season" | "bloom-tide";
  ticksRemaining: number;
  effects: {
    happiness?: number;
    crime?: number;
    unrest?: number;
    foodProduction?: number;
    powerDrain?: number;
    healthPenalty?: number;
    tradeBonus?: number;
    researchBonus?: number;
  };
};

export type CitizenClass = {
  id: string;
  name: string;
  population: number;
  happiness: number;
  productivity: number;
  taxRate: number;
  unrestContribution: number;
};

export type DistrictSpecialization = {
  districtId: string;
  spec: "manufacturing" | "commerce" | "research" | "military" | "residential" | "entertainment" | "agricultural" | "energy";
  level: number;
  bonusApplied: boolean;
};

export type PrestigePath = {
  id: string;
  name: string;
  description: string;
  level: number;
  xp: number;
  xpToNext: number;
  bonuses: Record<string, number>;
};

export type PendingLootItem = {
  id: string;
  itemDefId: string;
  itemName: string;
  rarity: string;
  source: string;
  timestamp: number;
};

export type NewSystemsState = {
  civilWars: CivilWarState[];
  expeditions: Expedition[];
  seasonalEvent: SeasonalEvent | null;
  seasonCycleTick: number;
  citizenClasses: CitizenClass[];
  districtSpecs: DistrictSpecialization[];
  prestigePaths: PrestigePath[];
  tradeAIEnabled: boolean;
  tradeAIAggressiveness: number;
  totalExpeditionsLaunched: number;
  totalCivilWars: number;
  pendingLoot: PendingLootItem[];
};

export function createDefaultNewSystems(): NewSystemsState {
  return {
    civilWars: [],
    expeditions: [],
    seasonalEvent: null,
    seasonCycleTick: 0,
    citizenClasses: [
      { id: "elite", name: "Corporate Elite", population: 50000, happiness: 80, productivity: 1.5, taxRate: 0.15, unrestContribution: -5 },
      { id: "middle", name: "Licensed Citizens", population: 350000, happiness: 55, productivity: 1.0, taxRate: 0.25, unrestContribution: 0 },
      { id: "working", name: "Labor Class", population: 400000, happiness: 40, productivity: 0.8, taxRate: 0.35, unrestContribution: 5 },
      { id: "undercity", name: "Undercity Denizens", population: 150000, happiness: 20, productivity: 0.5, taxRate: 0.05, unrestContribution: 15 },
      { id: "mutant", name: "Changed", population: 50000, happiness: 15, productivity: 0.6, taxRate: 0.0, unrestContribution: 10 },
    ],
    districtSpecs: [],
    prestigePaths: [
      { id: "iron-fist", name: "Iron Fist", description: "Rule through strength and order. Military and law enforcement bonuses.", level: 0, xp: 0, xpToNext: 100, bonuses: {} },
      { id: "peoples-champion", name: "People's Champion", description: "Rule through popularity and welfare. Happiness and loyalty bonuses.", level: 0, xp: 0, xpToNext: 100, bonuses: {} },
      { id: "corporate-king", name: "Corporate King", description: "Rule through wealth and commerce. Trade and credit bonuses.", level: 0, xp: 0, xpToNext: 100, bonuses: {} },
      { id: "shadow-broker", name: "Shadow Broker", description: "Rule through information and manipulation. Intelligence and faction bonuses.", level: 0, xp: 0, xpToNext: 100, bonuses: {} },
      { id: "tech-prophet", name: "Tech Prophet", description: "Rule through innovation and progress. Research and production bonuses.", level: 0, xp: 0, xpToNext: 100, bonuses: {} },
    ],
    tradeAIEnabled: false,
    tradeAIAggressiveness: 50,
    totalExpeditionsLaunched: 0,
    totalCivilWars: 0,
    pendingLoot: [],
  };
}

const SEASON_CYCLE: SeasonalEvent["season"][] = [
  "dust-storm", "acid-rain", "solar-flare", "deep-freeze", "smog-season", "bloom-tide",
];

const SEASON_DATA: Record<SeasonalEvent["season"], { name: string; duration: number; effects: SeasonalEvent["effects"] }> = {
  "dust-storm": {
    name: "Dust Storm Season",
    duration: 24,
    effects: { happiness: -2, foodProduction: -3, healthPenalty: 1, unrest: 1 },
  },
  "acid-rain": {
    name: "Acid Rain Season",
    duration: 20,
    effects: { happiness: -3, healthPenalty: 2, foodProduction: -2, crime: 1 },
  },
  "solar-flare": {
    name: "Solar Flare Event",
    duration: 12,
    effects: { powerDrain: 5, researchBonus: -2, unrest: 2 },
  },
  "deep-freeze": {
    name: "Deep Freeze",
    duration: 28,
    effects: { happiness: -4, foodProduction: -4, powerDrain: 3, crime: 2 },
  },
  "smog-season": {
    name: "Industrial Smog Season",
    duration: 16,
    effects: { healthPenalty: 3, happiness: -2, tradeBonus: 2 },
  },
  "bloom-tide": {
    name: "Bloom Tide",
    duration: 20,
    effects: { happiness: 3, foodProduction: 2, healthPenalty: -1, researchBonus: 1 },
  },
};

const EXPEDITION_TEMPLATES = [
  { name: "Ruin Sweep", type: "scavenge" as const, destination: "Collapsed Sector 7", dangerLevel: 20, duration: 8, personnel: 10, supplyCost: 500 },
  { name: "Deep Wasteland Probe", type: "recon" as const, destination: "The Glass Desert", dangerLevel: 50, duration: 16, personnel: 5, supplyCost: 1000 },
  { name: "Undercity Mapping", type: "recon" as const, destination: "Sub-Level 40", dangerLevel: 35, duration: 12, personnel: 8, supplyCost: 700 },
  { name: "Mutant Settlement Contact", type: "diplomacy" as const, destination: "Mireholm Outskirts", dangerLevel: 25, duration: 10, personnel: 3, supplyCost: 300 },
  { name: "Pre-War Bunker Breach", type: "research" as const, destination: "Vault 17-B", dangerLevel: 60, duration: 20, personnel: 15, supplyCost: 2000 },
  { name: "Raider Nest Assault", type: "combat" as const, destination: "Blackridge Perimeter", dangerLevel: 75, duration: 12, personnel: 25, supplyCost: 3000 },
  { name: "Satellite Debris Recovery", type: "scavenge" as const, destination: "Orbital Graveyard", dangerLevel: 40, duration: 14, personnel: 12, supplyCost: 1500 },
  { name: "Toxic Lake Survey", type: "research" as const, destination: "Lake Arcadia", dangerLevel: 30, duration: 10, personnel: 6, supplyCost: 800 },
  { name: "Old Highway Convoy", type: "scavenge" as const, destination: "Interstate Ruins", dangerLevel: 45, duration: 16, personnel: 20, supplyCost: 1200 },
  { name: "Forge Recon", type: "combat" as const, destination: "The Crucible Perimeter", dangerLevel: 70, duration: 14, personnel: 20, supplyCost: 2500 },
  { name: "Cathedral Depths Survey", type: "research" as const, destination: "Cathedral of Rust", dangerLevel: 55, duration: 18, personnel: 12, supplyCost: 1800 },
  { name: "Sky Needle Approach", type: "recon" as const, destination: "The Sky Needle", dangerLevel: 65, duration: 20, personnel: 8, supplyCost: 2200 },
  { name: "Gene Vault Extraction", type: "research" as const, destination: "Gene Vault Prime", dangerLevel: 70, duration: 22, personnel: 15, supplyCost: 2800 },
  { name: "Echo Chamber Signals Survey", type: "recon" as const, destination: "The Echo Chamber", dangerLevel: 40, duration: 12, personnel: 6, supplyCost: 900 },
  { name: "Ghost Relay Intercept", type: "recon" as const, destination: "Ghost Relay", dangerLevel: 45, duration: 14, personnel: 5, supplyCost: 1100 },
  { name: "Sunken Arcadia Salvage", type: "scavenge" as const, destination: "Sunken Arcadia", dangerLevel: 35, duration: 14, personnel: 10, supplyCost: 1000 },
  { name: "Sky Haven Resupply", type: "diplomacy" as const, destination: "Sky Haven", dangerLevel: 20, duration: 10, personnel: 4, supplyCost: 600 },
  { name: "Sector Zero Reconnaissance", type: "recon" as const, destination: "Sector Zero Crater", dangerLevel: 85, duration: 24, personnel: 6, supplyCost: 3500 },
  { name: "Mexico City Trade Delegation", type: "diplomacy" as const, destination: "Mexico City", dangerLevel: 15, duration: 8, personnel: 3, supplyCost: 400 },
  { name: "Irongate Customs Negotiation", type: "diplomacy" as const, destination: "Irongate", dangerLevel: 30, duration: 10, personnel: 4, supplyCost: 700 },
  { name: "Port Sulphur Dock Raid", type: "combat" as const, destination: "Port Sulphur", dangerLevel: 55, duration: 10, personnel: 18, supplyCost: 2000 },
  { name: "Scrapyard City Salvage Run", type: "scavenge" as const, destination: "Scrapyard City", dangerLevel: 30, duration: 10, personnel: 14, supplyCost: 800 },
  { name: "Vault Zero Breach", type: "research" as const, destination: "Vault Zero", dangerLevel: 80, duration: 24, personnel: 20, supplyCost: 4000 },
  { name: "Ember Falls Mineral Survey", type: "scavenge" as const, destination: "Ember Falls", dangerLevel: 25, duration: 10, personnel: 8, supplyCost: 600 },
  { name: "Chem Springs Analysis", type: "research" as const, destination: "Chem Springs", dangerLevel: 40, duration: 12, personnel: 6, supplyCost: 900 },
  { name: "Train Graveyard Strip", type: "scavenge" as const, destination: "Train Graveyard", dangerLevel: 35, duration: 12, personnel: 16, supplyCost: 900 },
  { name: "Crystal Caves Expedition", type: "research" as const, destination: "Crystal Caves", dangerLevel: 50, duration: 16, personnel: 8, supplyCost: 1400 },
  { name: "Parliament of Crows Parley", type: "diplomacy" as const, destination: "Parliament of Crows", dangerLevel: 35, duration: 12, personnel: 3, supplyCost: 500 },
  { name: "The Last Library Retrieval", type: "research" as const, destination: "The Last Library", dangerLevel: 45, duration: 16, personnel: 10, supplyCost: 1500 },
  { name: "Eastern Recovery Coordination", type: "diplomacy" as const, destination: "Eastern Recovery Operations", dangerLevel: 50, duration: 18, personnel: 5, supplyCost: 1800 },
  { name: "Helix Commune Exchange", type: "diplomacy" as const, destination: "Helix Commune", dangerLevel: 20, duration: 12, personnel: 4, supplyCost: 800 },
  { name: "Memory Archive Dig", type: "research" as const, destination: "The Memory Archive", dangerLevel: 55, duration: 18, personnel: 10, supplyCost: 1600 },
  { name: "Reactor Twelve Inspection", type: "recon" as const, destination: "Reactor Twelve", dangerLevel: 60, duration: 14, personnel: 8, supplyCost: 1800 },
  { name: "Spore Caves Bioharvest", type: "scavenge" as const, destination: "Spore Caves", dangerLevel: 50, duration: 14, personnel: 10, supplyCost: 1200 },
  { name: "Dead Satellite Recovery", type: "scavenge" as const, destination: "Dead Satellite Field", dangerLevel: 45, duration: 16, personnel: 12, supplyCost: 1400 },
  { name: "Petrified Army Survey", type: "recon" as const, destination: "The Petrified Army", dangerLevel: 55, duration: 14, personnel: 6, supplyCost: 1200 },
  { name: "Hollow Mountain Assault", type: "combat" as const, destination: "Hollow Mountain", dangerLevel: 80, duration: 18, personnel: 30, supplyCost: 3500 },
  { name: "Razorback Range Patrol", type: "combat" as const, destination: "Razorback Range", dangerLevel: 65, duration: 12, personnel: 22, supplyCost: 2200 },
  { name: "Bone Road Caravan Guard", type: "combat" as const, destination: "The Bone Road", dangerLevel: 60, duration: 14, personnel: 20, supplyCost: 2000 },
  { name: "Hanging Gardens Survey", type: "scavenge" as const, destination: "The Hanging Gardens", dangerLevel: 30, duration: 12, personnel: 8, supplyCost: 700 },
];

export function processCivilWars(s: GameState, entries: TickEntry[]): void {
  const ns = s.newSystems ?? createDefaultNewSystems();

  for (const faction of s.factions) {
    if (!faction.isActive) continue;
    if (ns.civilWars.some((w) => w.factionId === faction.id && w.phase !== "resolved")) continue;

    if (faction.threat > 80 && faction.loyalty < 20 && Math.random() < 0.03) {
      const war: CivilWarState = {
        factionId: faction.id,
        factionName: faction.name,
        phase: "brewing",
        intensity: Math.floor(faction.threat * 0.5),
        ticksRemaining: 40 + Math.floor(Math.random() * 40),
        ticksElapsed: 0,
        casualties: 0,
        infrastructureDamage: 0,
        triggerReason: `${faction.name} has reached critical threat levels with minimal loyalty`,
      };
      ns.civilWars.push(war);
      ns.totalCivilWars++;
      entries.push({
        label: "CIVIL WAR BREWING",
        delta: -faction.threat,
        unit: "threat",
        reason: `${faction.name} is mobilizing against your administration. Civil unrest is spreading.`,
        severity: "negative",
      });
    }
  }

  for (const war of ns.civilWars) {
    if (war.phase === "resolved") continue;
    war.ticksElapsed++;
    war.ticksRemaining--;

    if (war.phase === "brewing" && war.ticksElapsed >= 8) {
      war.phase = "active";
      entries.push({
        label: "CIVIL WAR ACTIVE",
        delta: 0,
        unit: "",
        reason: `${war.factionName} has launched open hostilities. Fighting in the streets.`,
        severity: "negative",
      });
    }

    if (war.phase === "active") {
      const dmg = Math.floor(war.intensity * 0.1) + Math.floor(Math.random() * 3);
      const casualties = Math.floor(Math.random() * 500) + 100;
      war.casualties += casualties;
      war.infrastructureDamage += dmg;

      s.cityStats.unrest = clamp(s.cityStats.unrest + 3, 0, 100);
      s.cityStats.crime = clamp(s.cityStats.crime + 2, 0, 100);
      const infrastructure = applyInfrastructureHealthDelta(
        s,
        -dmg,
        `civil-war:${war.factionId}:${war.ticksElapsed}`,
        `Civil war damage from ${war.factionName}`,
      );
      s.infrastructureLedger = infrastructure.infrastructureLedger;
      s.cityStats.infrastructureHealth = infrastructure.cityStats.infrastructureHealth;
      s.cityStats.happiness = clamp(s.cityStats.happiness - 2, 0, 100);

      const randomDistricts = s.districts
        .filter(() => Math.random() < 0.05)
        .slice(0, 3);
      for (const d of randomDistricts) {
        const idx = s.districts.indexOf(d);
        if (idx >= 0) {
          s.districts[idx] = {
            ...d,
            infraQuality: clamp(d.infraQuality - Math.floor(Math.random() * 5 + 2), 0, 100),
            unrest: clamp(d.unrest + 5, 0, 100),
            crime: clamp(d.crime + 3, 0, 100),
          };
        }
      }

      const fac = s.factions.find((f) => f.id === war.factionId);
      if (fac) {
        if (s.cityStats.lawOrder > 60 && s.cityStats.defenseRating > 50) {
          war.intensity = Math.max(0, war.intensity - 2);
          fac.threat = clamp(fac.threat - 1, 0, 100);
        } else {
          war.intensity = Math.min(100, war.intensity + 1);
        }
      }
    }

    if (war.ticksRemaining <= 0 || war.intensity <= 5) {
      if (war.phase === "active") {
        war.phase = "ceasefire";
        war.ticksRemaining = 8;
        entries.push({
          label: "CEASEFIRE",
          delta: 0,
          unit: "",
          reason: `${war.factionName} conflict winding down. ${war.casualties} total casualties. ${war.infrastructureDamage} infrastructure damage.`,
          severity: "warning",
        });
      } else if (war.phase === "ceasefire") {
        war.phase = "resolved";
        const fac = s.factions.find((f) => f.id === war.factionId);
        if (fac) {
          fac.threat = clamp(fac.threat - 20, 0, 100);
          fac.loyalty = clamp(fac.loyalty + 5, 0, 100);
        }
        entries.push({
          label: "Civil War Ended",
          delta: war.casualties,
          unit: "casualties",
          reason: `The ${war.factionName} conflict is over. The city can begin rebuilding.`,
          severity: "positive",
        });
      }
    }
  }

  // Prune resolved civil wars. The previous filter compared
  // `w.ticksElapsed < w.ticksElapsed + 20` which is always true, so
  // resolved wars accumulated forever. Keep only the most recent 5
  // resolved wars (for history/UI) plus all unresolved ones.
  const unresolved = ns.civilWars.filter((w) => w.phase !== "resolved");
  const resolved = ns.civilWars
    .filter((w) => w.phase === "resolved")
    .slice(-5);
  ns.civilWars = [...unresolved, ...resolved];
  s.newSystems = ns;
}

export function processExpeditions(s: GameState, entries: TickEntry[]): void {
  const ns = s.newSystems ?? createDefaultNewSystems();

  for (const exp of ns.expeditions) {
    if (exp.status !== "active") continue;
    exp.ticksRemaining--;

    if (exp.ticksRemaining <= 0) {
      const successChance = Math.max(20, 85 - exp.dangerLevel + Math.floor(s.cityStats.defenseRating * 0.2));
      const roll = Math.random() * 100;

      if (roll < successChance) {
        exp.status = "completed";
        const creditReward = Math.floor(exp.supplyCost * (1.5 + Math.random()));
        const steelReward = Math.floor(50 + Math.random() * 200);
        const fuelReward = Math.floor(20 + Math.random() * 80);
        const ammoReward = Math.floor(10 + Math.random() * 60);
        s.resources.credits += creditReward;
        recordCreditsEarned(s, creditReward);
        applyResourceDelta(s, "steel", steelReward);
        applyResourceDelta(s, "fuel", fuelReward);
        s.resources.ammo += ammoReward;

        const bonusLines: string[] = [];
        bonusLines.push(`+${steelReward} steel, +${fuelReward} fuel, +${ammoReward} ammo`);

        const discoveryRoll = Math.random();
        if (discoveryRoll < 0.3) {
          const techItems = ITEM_DEFS.filter(d =>
            (d.category === "relic" || d.category === "gear" || d.category === "augment") &&
            (d.rarity === "uncommon" || d.rarity === "rare")
          );
          if (techItems.length > 0) {
            const pick = techItems[Math.floor(Math.random() * techItems.length)];
            const addRes = addItemToInventory(s, pick.id);
            if (addRes.success) {
              exp.discoveries.push(`Pre-war cache: ${pick.name} [${pick.rarity.toUpperCase()}]`);
              bonusLines.push(`Item: ${pick.name}`);
            } else {
              const ns2 = s.newSystems ?? createDefaultNewSystems();
              ns2.pendingLoot.push({
                id: `loot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                itemDefId: pick.id,
                itemName: pick.name,
                rarity: pick.rarity,
                source: exp.name,
                timestamp: Date.now(),
              });
              s.newSystems = ns2;
              exp.discoveries.push(`Pre-war cache: ${pick.name} [${pick.rarity.toUpperCase()}] — AWAITING RETRIEVAL (inventory full)`);
              bonusLines.push(`Pending: ${pick.name} (inventory full)`);
            }
          }
        }
        if (discoveryRoll < 0.15) {
          exp.discoveries.push("Survivor settlement integrated — population boost");
          s.cityStats.population += Math.floor(50 + Math.random() * 200);
          const troopClasses: TroopClassId[] = ["infantry", "scout", "medic", "shocktrooper", "marksman", "engineer", "heavy_gunner", "cyber_operative", "demolisher", "breacher", "war_medic", "dragoon"];
          const pick = troopClasses[Math.floor(Math.random() * troopClasses.length)];
          if (!s.retinue) s.retinue = createDefaultRetinueState();
          const saved = s.resources.credits;
          const recResult = recruitTroop(s, pick);
          s.resources.credits = saved;
          if (recResult.success) {
            bonusLines.push(`Recruited: ${pick}`);
          }
        }
        if (exp.type === "research") {
          const researchItems = ITEM_DEFS.filter(d => d.category === "augment" || d.category === "gear");
          if (researchItems.length > 0) {
            const pick = researchItems[Math.floor(Math.random() * researchItems.length)];
            const addRes = addItemToInventory(s, pick.id);
            if (addRes.success) {
              exp.discoveries.push(`Research data: ${pick.name}`);
              bonusLines.push(`Research item: ${pick.name}`);
            } else {
              const ns2 = s.newSystems ?? createDefaultNewSystems();
              ns2.pendingLoot.push({
                id: `loot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                itemDefId: pick.id,
                itemName: pick.name,
                rarity: pick.rarity,
                source: `${exp.name} (research)`,
                timestamp: Date.now(),
              });
              s.newSystems = ns2;
              exp.discoveries.push(`Research data: ${pick.name} [${pick.rarity.toUpperCase()}] — AWAITING RETRIEVAL (inventory full)`);
              bonusLines.push(`Pending: ${pick.name} (inventory full)`);
            }
          }
        }

        entries.push({
          label: "Expedition Success",
          delta: creditReward,
          unit: "credits",
          reason: `${exp.name} returned from ${exp.destination}. ${bonusLines.join(". ")}.${exp.discoveries.length > 0 ? " Discoveries: " + exp.discoveries.join(", ") : ""}`,
          severity: "positive",
        });
      } else if (roll < successChance + 30) {
        exp.status = "failed";
        const lostPersonnel = Math.floor(exp.personnelSent * 0.3);
        entries.push({
          label: "Expedition Failed",
          delta: -lostPersonnel,
          unit: "personnel",
          reason: `${exp.name} encountered heavy resistance at ${exp.destination}. ${lostPersonnel} personnel lost.`,
          severity: "negative",
        });
      } else {
        exp.status = "lost";
        entries.push({
          label: "EXPEDITION LOST",
          delta: -exp.personnelSent,
          unit: "personnel",
          reason: `${exp.name} failed to return from ${exp.destination}. All ${exp.personnelSent} personnel presumed dead.`,
          severity: "negative",
        });
      }
    }
  }

  // Prune finished expeditions. The previous filter relied on
  // `ticksRemaining > -20`, but ticksRemaining stops decrementing
  // once status flips off "active" (line 336 short-circuits), so
  // completed/lost expeditions stuck at ~0 ticksRemaining were never
  // dropped. Keep all active plus the last 10 finished for history.
  const activeExp = ns.expeditions.filter((e) => e.status === "active");
  const finishedExp = ns.expeditions
    .filter((e) => e.status !== "active")
    .slice(-10);
  ns.expeditions = [...activeExp, ...finishedExp];
  s.newSystems = ns;
}

export function processSeasons(s: GameState, entries: TickEntry[]): void {
  const ns = s.newSystems ?? createDefaultNewSystems();
  ns.seasonCycleTick++;

  if (ns.seasonalEvent) {
    ns.seasonalEvent.ticksRemaining--;
    const fx = ns.seasonalEvent.effects;

    if (fx.happiness) s.cityStats.happiness = clamp(s.cityStats.happiness + fx.happiness * 0.1, 0, 100);
    if (fx.crime) s.cityStats.crime = clamp(s.cityStats.crime + fx.crime * 0.1, 0, 100);
    if (fx.unrest) s.cityStats.unrest = clamp(s.cityStats.unrest + fx.unrest * 0.1, 0, 100);
    if (fx.healthPenalty) s.cityStats.publicHealth = clamp(s.cityStats.publicHealth - fx.healthPenalty * 0.1, 0, 100);
    if (fx.powerDrain) s.resources.power -= fx.powerDrain;

    if (ns.seasonalEvent.ticksRemaining <= 0) {
      entries.push({
        label: "Season Ended",
        delta: 0,
        unit: "",
        reason: `${ns.seasonalEvent.name} has passed.`,
        severity: "neutral",
      });
      ns.seasonalEvent = null;
    }
  }

  if (!ns.seasonalEvent && ns.seasonCycleTick % 120 === 0) {
    const seasonIdx = Math.floor(ns.seasonCycleTick / 120) % SEASON_CYCLE.length;
    const seasonId = SEASON_CYCLE[seasonIdx];
    const data = SEASON_DATA[seasonId];
    ns.seasonalEvent = {
      id: `season-${ns.seasonCycleTick}`,
      name: data.name,
      season: seasonId,
      ticksRemaining: data.duration,
      effects: { ...data.effects },
    };
    entries.push({
      label: "SEASONAL EVENT",
      delta: 0,
      unit: "",
      reason: `${data.name} has begun. Expected duration: ${data.duration} ticks.`,
      severity: data.effects.happiness && data.effects.happiness > 0 ? "positive" : "warning",
    });
  }

  s.newSystems = ns;
}

export function processCitizenClasses(s: GameState, entries: TickEntry[]): void {
  const ns = s.newSystems ?? createDefaultNewSystems();
  if (!ns.citizenClasses || ns.citizenClasses.length === 0) return;

  const totalPop = s.cityStats.population;
  const cs = s.cityStats;

  const empRate = cs.employment / 100;
  const happyRate = cs.happiness / 100;
  const healthRate = cs.publicHealth / 100;
  const crimeRate = cs.crime / 100;

  const elitePct = clamp(0.03 + empRate * 0.03 + happyRate * 0.02 - crimeRate * 0.01, 0.01, 0.12);
  const middlePct = clamp(0.25 + empRate * 0.12 + healthRate * 0.05 - crimeRate * 0.05, 0.15, 0.50);
  const mutantPct = clamp(0.02 + crimeRate * 0.03 + (cs.diseaseRisk / 100) * 0.02, 0.01, 0.10);
  const undercityPct = clamp(0.08 + crimeRate * 0.08 + (1 - empRate) * 0.06 - healthRate * 0.03, 0.03, 0.25);
  const workingPct = Math.max(0.1, 1 - elitePct - middlePct - undercityPct - mutantPct);

  for (const cc of ns.citizenClasses) {
    if (cc.id === "elite") {
      cc.happiness = clamp(cc.happiness + (s.resources.credits > 50000 ? 1 : -1), 0, 100);
      cc.population = Math.floor(totalPop * elitePct);
    } else if (cc.id === "middle") {
      cc.happiness = clamp(cc.happiness + (cs.employment > 60 ? 1 : -1), 0, 100);
      cc.population = Math.floor(totalPop * middlePct);
    } else if (cc.id === "working") {
      cc.happiness = clamp(cc.happiness + (cs.happiness > 40 ? 0 : -1), 0, 100);
      cc.population = Math.floor(totalPop * workingPct);
    } else if (cc.id === "undercity") {
      cc.happiness = clamp(cc.happiness + (cs.publicHealth > 50 ? 1 : -2), 0, 100);
      cc.population = Math.floor(totalPop * undercityPct);
    } else if (cc.id === "mutant") {
      cc.happiness = clamp(cc.happiness + (cs.publicHealth > 60 ? 1 : -1), 0, 100);
      cc.population = Math.floor(totalPop * mutantPct);
    }
  }

  const avgClassHappiness = ns.citizenClasses.reduce((sum, c) => sum + c.happiness * (c.population / Math.max(totalPop, 1)), 0);
  const classUnrest = ns.citizenClasses.reduce((sum, c) => sum + c.unrestContribution * (c.population / Math.max(totalPop, 1)), 0);

  if (avgClassHappiness < 30) {
    s.cityStats.unrest = clamp(s.cityStats.unrest + 0.5, 0, 100);
  }
  if (classUnrest > 5) {
    s.cityStats.unrest = clamp(s.cityStats.unrest + 0.3, 0, 100);
  }

  s.newSystems = ns;
}

export function processDistrictSpecializations(s: GameState, entries: TickEntry[]): void {
  const ns = s.newSystems ?? createDefaultNewSystems();
  if (!ns.districtSpecs || ns.districtSpecs.length === 0) {
    s.newSystems = ns;
    return;
  }

  for (const spec of ns.districtSpecs) {
    const district = s.districts.find((d) => d.id === spec.districtId);
    if (!district) continue;

    if (spec.level > 0 && !spec.bonusApplied) {
      const idx = s.districts.indexOf(district);
      const bonus = getSpecBonus(spec.spec, spec.level);
      s.districts[idx] = {
        ...district,
        industrialOutput: clamp(district.industrialOutput + (bonus.industrialOutput ?? 0), 0, 100),
        wealth: clamp(district.wealth + (bonus.wealth ?? 0), 0, 100),
        loyalty: clamp(district.loyalty + (bonus.loyalty ?? 0), 0, 100),
      };
      spec.bonusApplied = true;
    }

    if (s.totalTicks % 40 === 0 && spec.level < 5) {
      const qualifies = district.infraQuality > 60 && district.unrest < 40;
      if (qualifies) {
        spec.level++;
        spec.bonusApplied = false;
        entries.push({
          label: "Specialization Up",
          delta: spec.level,
          unit: "level",
          reason: `${district.name} ${spec.spec} specialization reached level ${spec.level}`,
          severity: "positive",
        });
      }
    }
  }

  s.newSystems = ns;
}

function getSpecBonus(spec: DistrictSpecialization["spec"], level: number): { industrialOutput?: number; wealth?: number; loyalty?: number } {
  const mult = level;
  switch (spec) {
    case "manufacturing": return { industrialOutput: 2 * mult };
    case "commerce": return { wealth: 2 * mult };
    case "research": return { industrialOutput: 1 * mult, wealth: 1 * mult };
    case "military": return { loyalty: 2 * mult };
    case "residential": return { loyalty: 1 * mult, wealth: 1 * mult };
    case "entertainment": return { wealth: 2 * mult, loyalty: 1 * mult };
    case "agricultural": return { industrialOutput: 1 * mult };
    case "energy": return { industrialOutput: 2 * mult };
    default: return {};
  }
}

export function processPrestigePaths(s: GameState, entries: TickEntry[]): void {
  const ns = s.newSystems ?? createDefaultNewSystems();
  const cs = s.cityStats;

  for (const path of ns.prestigePaths) {
    let xpGain = 0;

    switch (path.id) {
      case "iron-fist":
        if (cs.lawOrder > 70) xpGain += 2;
        if (cs.defenseRating > 60) xpGain += 1;
        if (cs.crime < 20) xpGain += 1;
        break;
      case "peoples-champion":
        if (cs.happiness > 60) xpGain += 2;
        if (cs.publicHealth > 60) xpGain += 1;
        if (cs.unrest < 20) xpGain += 1;
        break;
      case "corporate-king":
        if (s.resources.credits > 100000) xpGain += 2;
        if (cs.employment > 70) xpGain += 1;
        break;
      case "shadow-broker":
        if (cs.corruption > 40) xpGain += 1;
        if (s.factions.filter((f) => f.loyalty > 60).length >= 3) xpGain += 2;
        break;
      case "tech-prophet":
        if ((s.unlockedTechnologies?.length ?? 0) > 50) xpGain += 1;
        if (s.activeResearch) xpGain += 1;
        break;
    }

    if (xpGain > 0) {
      path.xp += xpGain;
      if (path.xp >= path.xpToNext && path.level < 10) {
        path.level++;
        path.xp = 0;
        path.xpToNext = Math.floor(path.xpToNext * 1.5);
        updatePrestigeBonuses(path);
        entries.push({
          label: "Prestige Level Up",
          delta: path.level,
          unit: "",
          reason: `${path.name} reached level ${path.level}!`,
          severity: "positive",
        });
      }
    }
  }

  for (const path of ns.prestigePaths) {
    if (path.level > 0 && Object.keys(path.bonuses).length > 0) {
      const b = path.bonuses;
      if (b.lawOrderBonus) s.cityStats.lawOrder = clamp(s.cityStats.lawOrder + b.lawOrderBonus * 0.1, 0, 100);
      if (b.defenseBonus) s.cityStats.defenseRating = clamp(s.cityStats.defenseRating + b.defenseBonus * 0.1, 0, 100);
      if (b.crimeReduction) s.cityStats.crime = clamp(s.cityStats.crime - b.crimeReduction * 0.1, 0, 100);
      if (b.happinessBonus) s.cityStats.happiness = clamp(s.cityStats.happiness + b.happinessBonus * 0.05, 0, 100);
      if (b.healthBonus) s.cityStats.publicHealth = clamp(s.cityStats.publicHealth + b.healthBonus * 0.05, 0, 100);
      if (b.unrestReduction) s.cityStats.unrest = clamp(s.cityStats.unrest - b.unrestReduction * 0.05, 0, 100);
      if (b.corruptionReduction) s.cityStats.corruption = clamp((s.cityStats.corruption ?? 0) - b.corruptionReduction * 0.05, 0, 100);
    }
  }

  s.newSystems = ns;
}

function updatePrestigeBonuses(path: PrestigePath): void {
  const lvl = path.level;
  switch (path.id) {
    case "iron-fist":
      path.bonuses = { lawOrderBonus: lvl * 2, defenseBonus: lvl, crimeReduction: lvl };
      break;
    case "peoples-champion":
      path.bonuses = { happinessBonus: lvl * 2, healthBonus: lvl, unrestReduction: lvl };
      break;
    case "corporate-king":
      path.bonuses = { creditMultiplier: 1 + lvl * 0.05, tradeBonus: lvl * 3, employmentBonus: lvl };
      break;
    case "shadow-broker":
      path.bonuses = { factionInfluenceBonus: lvl * 2, intelligenceBonus: lvl * 3, corruptionReduction: lvl };
      break;
    case "tech-prophet":
      path.bonuses = { researchSpeedBonus: lvl * 5, productionBonus: lvl * 2 };
      break;
  }
}

type TradeResource = "food" | "water" | "steel" | "medSupplies" | "power" | "fuel" | "goods" | "ammo";

type TradeRule = {
  resource: TradeResource;
  buyBelow: number;
  sellAbove: number;
  buyAmount: number;
  sellAmount: number;
  priority: number;
};

const TRADE_PRICES: Record<TradeResource, { buy: number; sell: number }> = {
  food: { buy: 4, sell: 2 },
  water: { buy: 3, sell: 1.5 },
  steel: { buy: 50, sell: 25 },
  medSupplies: { buy: 30, sell: 15 },
  power: { buy: 5, sell: 2 },
  fuel: { buy: 8, sell: 4 },
  goods: { buy: 6, sell: 3 },
  ammo: { buy: 20, sell: 10 },
};

const TRADE_RULES: TradeRule[] = [
  { resource: "food",       buyBelow: 1000, sellAbove: 8000,  buyAmount: 500,  sellAmount: 1000, priority: 1 },
  { resource: "water",      buyBelow: 800,  sellAbove: 6000,  buyAmount: 400,  sellAmount: 800,  priority: 2 },
  { resource: "medSupplies", buyBelow: 100, sellAbove: 800,   buyAmount: 80,   sellAmount: 150,  priority: 3 },
  { resource: "power",      buyBelow: 300,  sellAbove: 5000,  buyAmount: 200,  sellAmount: 500,  priority: 4 },
  { resource: "steel",      buyBelow: 200,  sellAbove: 5000,  buyAmount: 100,  sellAmount: 500,  priority: 5 },
  { resource: "fuel",       buyBelow: 200,  sellAbove: 3000,  buyAmount: 150,  sellAmount: 400,  priority: 6 },
  { resource: "goods",      buyBelow: 300,  sellAbove: 4000,  buyAmount: 200,  sellAmount: 500,  priority: 7 },
  { resource: "ammo",       buyBelow: 100,  sellAbove: 2000,  buyAmount: 80,   sellAmount: 200,  priority: 8 },
];

export function processTradeAI(s: GameState, entries: TickEntry[]): void {
  const ns = s.newSystems ?? createDefaultNewSystems();
  if (!ns.tradeAIEnabled) {
    s.newSystems = ns;
    return;
  }

  if (s.totalTicks % 8 !== 0) {
    s.newSystems = ns;
    return;
  }

  const agg = ns.tradeAIAggressiveness / 100;
  const r = s.resources;
  const pop = s.cityStats.population;
  const popScale = Math.max(1, pop / 500000);
  let tradesThisTick = 0;
  const maxTrades = Math.floor(2 + agg * 3);

  const sortedRules = [...TRADE_RULES].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (tradesThisTick >= maxTrades) break;

    const res = rule.resource;
    const current = r[res] ?? 0;
    const prices = TRADE_PRICES[res];

    const scaledBuyBelow = Math.floor(rule.buyBelow * popScale);
    const scaledSellAbove = Math.floor(rule.sellAbove * popScale);

    if (current < scaledBuyBelow) {
      const amount = Math.floor(rule.buyAmount * (1 + agg) * popScale);
      const cost = Math.floor(amount * prices.buy * (1.1 - agg * 0.1));
      const minCredits = Math.floor(20000 * popScale);
      if (r.credits > minCredits + cost) {
        r.credits -= cost;
        r[res] = current + amount;
        entries.push({
          label: "Trade AI",
          delta: amount,
          unit: res,
          reason: `Auto-purchased ${amount} ${res} for ${cost.toLocaleString()} credits (reserves below ${scaledBuyBelow})`,
          severity: "neutral",
        });
        tradesThisTick++;
      }
    }

    if (current > scaledSellAbove && tradesThisTick < maxTrades) {
      const surplus = current - scaledSellAbove;
      const amount = Math.min(Math.floor(rule.sellAmount * agg * popScale), surplus);
      if (amount > 0) {
        const revenue = Math.floor(amount * prices.sell * (0.9 + agg * 0.1));
        r[res] = current - amount;
        r.credits += revenue;
        recordCreditsEarned(s, revenue);
        entries.push({
          label: "Trade AI",
          delta: revenue,
          unit: "credits",
          reason: `Auto-sold ${amount} surplus ${rule.resource} for ${revenue.toLocaleString()} credits`,
          severity: "neutral",
        });
        tradesThisTick++;
      }
    }
  }

  if (r.credits < 5000 * popScale && tradesThisTick < maxTrades) {
    for (const rule of sortedRules.reverse()) {
      if (tradesThisTick >= maxTrades) break;
      const res = rule.resource;
      const current = r[res] ?? 0;
      const prices = TRADE_PRICES[res];
      const emergencySellThreshold = Math.floor(rule.buyBelow * popScale * 2);
      if (current > emergencySellThreshold) {
        const amount = Math.floor(rule.sellAmount * 0.5 * popScale);
        const revenue = Math.floor(amount * prices.sell * 0.8);
        r[res] = current - amount;
        r.credits += revenue;
        recordCreditsEarned(s, revenue);
        entries.push({
          label: "Trade AI",
          delta: revenue,
          unit: "credits",
          reason: `Emergency sale: ${amount} ${rule.resource} for ${revenue.toLocaleString()} credits (treasury critical)`,
          severity: "warning",
        });
        tradesThisTick++;
      }
    }
  }

  s.newSystems = ns;
}

export function processAllNewSystems(s: GameState, entries: TickEntry[]): void {
  if (!s.newSystems) s.newSystems = createDefaultNewSystems();
  processCivilWars(s, entries);
  processExpeditions(s, entries);
  processSeasons(s, entries);
  processCitizenClasses(s, entries);
  processDistrictSpecializations(s, entries);
  processPrestigePaths(s, entries);
  processTradeAI(s, entries);
}

export function launchExpedition(s: GameState, templateIndex: number): { success: boolean; message: string } {
  const ns = s.newSystems ?? createDefaultNewSystems();
  if (templateIndex < 0 || templateIndex >= EXPEDITION_TEMPLATES.length) {
    return { success: false, message: "Invalid expedition." };
  }
  const template = EXPEDITION_TEMPLATES[templateIndex];

  if (ns.expeditions.filter((e) => e.status === "active").length >= 3) {
    return { success: false, message: "Maximum 3 active expeditions." };
  }
  if (s.resources.credits < template.supplyCost) {
    return { success: false, message: `Need ${template.supplyCost} credits.` };
  }

  s.resources.credits -= template.supplyCost;
  const exp: Expedition = {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: template.name,
    destination: template.destination,
    type: template.type,
    personnelSent: template.personnel,
    supplyCost: template.supplyCost,
    ticksRemaining: template.duration,
    ticksTotal: template.duration,
    status: "active",
    dangerLevel: template.dangerLevel,
    discoveries: [],
  };
  ns.expeditions.push(exp);
  ns.totalExpeditionsLaunched++;
  s.newSystems = ns;

  return { success: true, message: `${template.name} launched to ${template.destination}. ETA: ${template.duration} ticks.` };
}

export function claimPendingLoot(s: GameState, lootId: string): { success: boolean; message: string } {
  const ns = s.newSystems ?? createDefaultNewSystems();
  const idx = ns.pendingLoot.findIndex(l => l.id === lootId);
  if (idx === -1) return { success: false, message: "Loot not found." };

  const loot = ns.pendingLoot[idx];
  const addRes = addItemToInventory(s, loot.itemDefId);
  if (!addRes.success) return { success: false, message: "Inventory still full — make space first." };

  ns.pendingLoot.splice(idx, 1);
  s.newSystems = ns;
  return { success: true, message: `${loot.itemName} added to inventory.` };
}

export { EXPEDITION_TEMPLATES };

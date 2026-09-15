import type { Biome } from "@/engine/biomes";

export type ScavengeZoneType = "ruins" | "wasteland" | "underhive" | "industrial" | "military" | "anomaly";

export type ScavengeZoneDef = {
  id: string;
  name: string;
  type: ScavengeZoneType;
  biome?: Biome;
  dangerLevel: number;
  discoveryChance: number;
  minTeam: number;
  description: string;
  possibleLoot: string[];
};

export type ScavengeActionDef = {
  id: string;
  name: string;
  phase: "scout" | "scavenge" | "excavate" | "reclaim";
  cost: number;
  ticksDuration: number;
  description: string;
  requiredResearch?: string;
};

export type ScavengeInfraDef = {
  id: string;
  name: string;
  cost: number;
  effect: string;
  description: string;
};

export type ScavengePolicyDef = {
  id: string;
  name: string;
  cost: number;
  effect: string;
  description: string;
};

export const ZONE_TYPE_LABELS: Record<ScavengeZoneType, string> = {
  ruins: "RUINS",
  wasteland: "WASTELAND",
  underhive: "UNDERHIVE",
  industrial: "INDUSTRIAL",
  military: "MILITARY",
  anomaly: "ANOMALY",
};

export const ZONE_TYPE_COLORS: Record<ScavengeZoneType, string> = {
  ruins: "#FF9500",
  wasteland: "#B87333",
  underhive: "#FF3B30",
  industrial: "#C0C0C0",
  military: "#00C8FF",
  anomaly: "#B855FF",
};

export const SCAVENGE_ZONES: ScavengeZoneDef[] = [
  { id: "zone_old_quarter", name: "Old Quarter Ruins", type: "ruins", biome: "ruined_park", dangerLevel: 20, discoveryChance: 60, minTeam: 5, description: "Pre-war residential district, partially collapsed", possibleLoot: ["credits", "goods", "medSupplies"] },
  { id: "zone_collapsed_mall", name: "Collapsed MegaMall", type: "ruins", biome: "ruined_park", dangerLevel: 30, discoveryChance: 70, minTeam: 8, description: "Multi-level commercial center, unstable floors", possibleLoot: ["credits", "goods", "food"] },
  { id: "zone_sunken_precinct", name: "Sunken Precinct", type: "ruins", biome: "toxic_marsh", dangerLevel: 40, discoveryChance: 50, minTeam: 10, description: "Flooded law enforcement compound", possibleLoot: ["ammo", "weapons", "intel"] },
  { id: "zone_dust_flats", name: "Dust Flats", type: "wasteland", biome: "glass_desert", dangerLevel: 25, discoveryChance: 40, minTeam: 6, description: "Irradiated open plains between city sectors", possibleLoot: ["steel", "fuel", "scrap"] },
  { id: "zone_rad_canyon", name: "Radiation Canyon", type: "wasteland", biome: "irradiated_jungle", dangerLevel: 60, discoveryChance: 45, minTeam: 15, description: "Deeply irradiated gorge with mineral deposits", possibleLoot: ["uranium", "titanium", "rare-earth"] },
  { id: "zone_bone_desert", name: "Bone Desert", type: "wasteland", biome: "glass_desert", dangerLevel: 50, discoveryChance: 30, minTeam: 12, description: "Vast bleached wasteland, remnants of old highways", possibleLoot: ["fuel", "steel", "vehicles"] },
  { id: "zone_sub_level_7", name: "Sub-Level 7", type: "underhive", biome: "fungal_caves", dangerLevel: 55, discoveryChance: 55, minTeam: 10, description: "Deepest accessible underhive level, gang territory", possibleLoot: ["contraband", "credits", "weapons"] },
  { id: "zone_sewer_nexus", name: "Sewer Nexus", type: "underhive", biome: "toxic_marsh", dangerLevel: 35, discoveryChance: 50, minTeam: 8, description: "Massive sewer junction with hidden communities", possibleLoot: ["food", "water", "medSupplies"] },
  { id: "zone_mutant_warren", name: "Mutant Warren", type: "underhive", biome: "fungal_caves", dangerLevel: 70, discoveryChance: 35, minTeam: 20, description: "Dense mutant colony, extremely hostile", possibleLoot: ["biosamples", "tech", "artifacts"] },
  { id: "zone_factory_complex", name: "Abandoned Factory Complex", type: "industrial", biome: "ash_forest", dangerLevel: 30, discoveryChance: 65, minTeam: 8, description: "Pre-war manufacturing plant, partially operational", possibleLoot: ["steel", "goods", "machinery"] },
  { id: "zone_power_station", name: "Dead Power Station", type: "industrial", biome: "irradiated_jungle", dangerLevel: 45, discoveryChance: 40, minTeam: 12, description: "Defunct nuclear power plant, highly contaminated", possibleLoot: ["power", "uranium", "tech"] },
  { id: "zone_recycling_hub", name: "Mega Recycling Hub", type: "industrial", biome: "ash_forest", dangerLevel: 20, discoveryChance: 75, minTeam: 5, description: "Massive recycling center with sorted materials", possibleLoot: ["steel", "copper", "goods"] },
  { id: "zone_bunker_complex", name: "Military Bunker Complex", type: "military", biome: "glass_desert", dangerLevel: 65, discoveryChance: 30, minTeam: 15, description: "Underground military installation, automated defenses", possibleLoot: ["ammo", "weapons", "missiles", "vehicles"] },
  { id: "zone_airfield", name: "Abandoned Airfield", type: "military", biome: "glass_desert", dangerLevel: 40, discoveryChance: 45, minTeam: 10, description: "Pre-war military airstrip with hangars", possibleLoot: ["fuel", "vehicles", "ammo"] },
  { id: "zone_warp_zone", name: "The Warp Zone", type: "anomaly", biome: "irradiated_jungle", dangerLevel: 80, discoveryChance: 20, minTeam: 20, description: "Reality distortion zone, laws of physics unreliable", possibleLoot: ["artifacts", "tech", "anomalous_material"] },
  { id: "zone_crater", name: "Impact Crater Omega", type: "anomaly", biome: "glass_desert", dangerLevel: 75, discoveryChance: 25, minTeam: 18, description: "Massive crater with unknown alien material", possibleLoot: ["rare-earth", "artifacts", "alien_tech"] },
];

export function getZoneBiome(zone: ScavengeZoneDef): Biome {
  if (zone.biome) return zone.biome;
  switch (zone.type) {
    case "ruins": return "ruined_park";
    case "wasteland": return "glass_desert";
    case "underhive": return "fungal_caves";
    case "industrial": return "ash_forest";
    case "military": return "glass_desert";
    case "anomaly": return "irradiated_jungle";
    default: return "glass_desert";
  }
}

export const SCAVENGE_ACTIONS: ScavengeActionDef[] = [
  { id: "quick_scout", name: "Quick Scout", phase: "scout", cost: 500, ticksDuration: 24, description: "Send a small team to survey the area" },
  { id: "deep_survey", name: "Deep Survey", phase: "scout", cost: 2000, ticksDuration: 72, description: "Thorough geological and structural survey" },
  { id: "drone_recon", name: "Drone Reconnaissance", phase: "scout", cost: 1500, ticksDuration: 12, description: "Aerial drone survey for quick intel" },
  { id: "surface_scavenge", name: "Surface Scavenge", phase: "scavenge", cost: 1000, ticksDuration: 48, description: "Collect easily accessible materials" },
  { id: "deep_scavenge", name: "Deep Scavenge", phase: "scavenge", cost: 3000, ticksDuration: 96, description: "Thorough salvage of all recoverable materials" },
  { id: "precision_recovery", name: "Precision Recovery", phase: "scavenge", cost: 5000, ticksDuration: 72, description: "Careful extraction of high-value items" },
  { id: "drill_excavation", name: "Drill Excavation", phase: "excavate", cost: 8000, ticksDuration: 168, description: "Use heavy machinery to reach buried resources" },
  { id: "blast_excavation", name: "Blast Excavation", phase: "excavate", cost: 12000, ticksDuration: 120, description: "Explosive charges to access sealed areas" },
  { id: "tunnel_bore", name: "Tunnel Bore", phase: "excavate", cost: 15000, ticksDuration: 240, description: "Bore tunnels to reach deep deposits" },
  { id: "sector_reclaim", name: "Sector Reclamation", phase: "reclaim", cost: 20000, ticksDuration: 480, description: "Full cleanup and integration of an area into the city" },
  { id: "foundation_rebuild", name: "Foundation Rebuild", phase: "reclaim", cost: 30000, ticksDuration: 720, description: "Rebuild infrastructure for habitation" },
  { id: "decontaminate", name: "Decontamination", phase: "reclaim", cost: 10000, ticksDuration: 336, description: "Remove radiation and toxic contamination" },
];

export const SCAVENGE_INFRASTRUCTURE: ScavengeInfraDef[] = [
  { id: "scout_outpost", name: "Scout Outpost", cost: 5000, effect: "+20% discovery chance", description: "Forward observation post for scouting operations" },
  { id: "salvage_yard", name: "Salvage Yard", cost: 8000, effect: "+15% loot quality", description: "Processing facility for recovered materials" },
  { id: "excavation_rig", name: "Excavation Rig", cost: 15000, effect: "Enable excavation ops", description: "Heavy machinery for deep dig operations" },
  { id: "decontam_station", name: "Decontamination Station", cost: 12000, effect: "Enable rad-zone ops", description: "Radiation and chemical decontamination facility" },
  { id: "field_hospital", name: "Field Hospital", cost: 10000, effect: "-50% casualty rate", description: "Mobile medical facility for injured scavengers" },
  { id: "comm_relay", name: "Communications Relay", cost: 6000, effect: "+coordination bonus", description: "Extended range comms for remote operations" },
  { id: "supply_cache", name: "Supply Cache Network", cost: 4000, effect: "+expedition duration", description: "Pre-positioned supply drops in the wasteland" },
  { id: "drone_hangar", name: "Recon Drone Hangar", cost: 9000, effect: "Automated scouting", description: "Automated drone deployment for continuous recon" },
];

export const SCAVENGE_POLICIES: ScavengePolicyDef[] = [
  { id: "hazard_bonus", name: "Hazard Bonus Pay", cost: 2000, effect: "+recruitment, +wage cost", description: "Premium pay for scavenge teams" },
  { id: "automated_scav", name: "Automated Scavenging", cost: 10000, effect: "Auto-run completed zones", description: "Deploy robots for routine scavenging" },
  { id: "loot_tax", name: "Scavenge Loot Tax", cost: 0, effect: "+city revenue from loot", description: "Tax all recovered materials" },
  { id: "priority_military", name: "Military Priority Salvage", cost: 3000, effect: "Military loot first", description: "Prioritize weapons and ammo recovery" },
  { id: "civilian_scav", name: "Civilian Scavenging Permits", cost: 1000, effect: "+total loot, +risk", description: "Allow civilians to join scavenge ops" },
  { id: "deep_zone_auth", name: "Deep Zone Authorization", cost: 5000, effect: "Unlock anomaly zones", description: "Authorize expeditions to dangerous anomaly zones" },
  { id: "artifact_research", name: "Artifact Research Program", cost: 8000, effect: "+tech from artifacts", description: "Study recovered artifacts for tech breakthroughs" },
  { id: "wasteland_treaty", name: "Wasteland Non-Aggression", cost: 4000, effect: "-danger in wasteland", description: "Negotiate safe passage with wasteland groups" },
];

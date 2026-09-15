export type EngagementType = "skirmish" | "raid" | "assault" | "siege" | "ambush" | "defense" | "counterattack" | "patrol_clash" | "aerial_strike" | "cyber_attack";

export type DoctrineId = "aggressive" | "defensive" | "balanced" | "guerrilla" | "blitzkrieg" | "attrition" | "scorched_earth" | "shock_and_awe" | "encirclement" | "deep_battle" | "fortress" | "terror" | "combined_arms" | "asymmetric";

export type FormationId = "line" | "column" | "wedge" | "phalanx" | "dispersed" | "reserve_echelon";
export type OrdnanceId = "standard" | "heavy_artillery" | "air_support" | "orbital_strike" | "incendiary" | "emp_burst";

export type TacticalDecision = {
  formation: FormationId;
  ordnance: OrdnanceId;
  reserveCommitment: number;
  officerAssigned: string | null;
  officerCompetence?: number;
};

export type FormationDef = {
  id: FormationId;
  name: string;
  description: string;
  attackMod: number;
  defenseMod: number;
  casualtyMod: number;
};

export type OrdnanceDef = {
  id: OrdnanceId;
  name: string;
  description: string;
  damageMod: number;
  ammoCost: number;
  fuelCost: number;
  moraleDamage: number;
};

export type HostileRaidTemplate = {
  id: string;
  name: string;
  description: string;
  enemyStrength: number;
  enemyMorale: number;
  terrainMod: number;
  targetZonePreference: string[];
  factionSource: string;
  populationDamage: number;
  tickDuration: number;
};

export type ZoneStatus = "friendly" | "contested" | "hostile" | "neutral" | "devastated";

export type CombatDoctrine = {
  id: DoctrineId;
  name: string;
  description: string;
  attackMod: number;
  defenseMod: number;
  casualtyMod: number;
  moraleMod: number;
  fuelCostMod: number;
  ammoCostMod: number;
};

export type EngagementDef = {
  id: string;
  name: string;
  type: EngagementType;
  description: string;
  baseEnemyStrength: number;
  enemyMorale: number;
  terrainMod: number;
  minUnits: number;
  creditsCost: number;
  ammoCost: number;
  fuelCost: number;
  xpReward: number;
  creditReward: number;
  defenseRewardOnWin: number;
  zoneThreat: number;
};

export type ZoneTerritory = {
  id: string;
  name: string;
  description: string;
  status: ZoneStatus;
  controlLevel: number;
  threat: number;
  garrison: number;
  maxGarrison: number;
  resourceBonus: { credits?: number; steel?: number; fuel?: number; ammo?: number };
  adjacentZones: string[];
  controllingFaction: string;
};

export const COMBAT_DOCTRINES: CombatDoctrine[] = [
  { id: "aggressive", name: "AGGRESSIVE DOCTRINE", description: "Maximum firepower, rapid advance. High casualties, high damage.", attackMod: 1.4, defenseMod: 0.7, casualtyMod: 1.3, moraleMod: 1.1, fuelCostMod: 1.2, ammoCostMod: 1.5 },
  { id: "defensive", name: "DEFENSIVE DOCTRINE", description: "Fortified positions, minimal exposure. Low casualties, lower offense.", attackMod: 0.7, defenseMod: 1.5, casualtyMod: 0.6, moraleMod: 1.0, fuelCostMod: 0.7, ammoCostMod: 0.8 },
  { id: "balanced", name: "BALANCED DOCTRINE", description: "Standard combined arms approach. No bonuses, no penalties.", attackMod: 1.0, defenseMod: 1.0, casualtyMod: 1.0, moraleMod: 1.0, fuelCostMod: 1.0, ammoCostMod: 1.0 },
  { id: "guerrilla", name: "GUERRILLA DOCTRINE", description: "Hit-and-run tactics, ambushes. Low fuel, unpredictable results.", attackMod: 0.9, defenseMod: 0.8, casualtyMod: 0.7, moraleMod: 0.9, fuelCostMod: 0.5, ammoCostMod: 0.6 },
  { id: "blitzkrieg", name: "BLITZKRIEG DOCTRINE", description: "Lightning assault with armor and air. Devastating but expensive.", attackMod: 1.6, defenseMod: 0.6, casualtyMod: 1.1, moraleMod: 1.3, fuelCostMod: 2.0, ammoCostMod: 1.8 },
  { id: "attrition", name: "ATTRITION DOCTRINE", description: "Grind the enemy down over time. Slow but relentless.", attackMod: 0.8, defenseMod: 1.2, casualtyMod: 0.9, moraleMod: 0.8, fuelCostMod: 1.1, ammoCostMod: 1.3 },
  { id: "scorched_earth", name: "SCORCHED EARTH", description: "Deny everything to the enemy. Destroys territory value.", attackMod: 1.2, defenseMod: 1.0, casualtyMod: 1.0, moraleMod: 0.7, fuelCostMod: 1.5, ammoCostMod: 1.4 },
  { id: "shock_and_awe", name: "SHOCK & AWE", description: "Overwhelming force to break enemy morale. High ammo, high terror.", attackMod: 1.3, defenseMod: 0.9, casualtyMod: 0.8, moraleMod: 1.5, fuelCostMod: 1.3, ammoCostMod: 2.0 },
  { id: "encirclement", name: "ENCIRCLEMENT DOCTRINE", description: "Surround and cut off enemy supply lines. Slow but devastating.", attackMod: 1.1, defenseMod: 1.1, casualtyMod: 0.9, moraleMod: 1.2, fuelCostMod: 1.4, ammoCostMod: 1.1 },
  { id: "deep_battle", name: "DEEP BATTLE DOCTRINE", description: "Penetrate enemy lines and strike command structures behind front.", attackMod: 1.5, defenseMod: 0.5, casualtyMod: 1.2, moraleMod: 1.4, fuelCostMod: 1.8, ammoCostMod: 1.6 },
  { id: "fortress", name: "FORTRESS DOCTRINE", description: "Maximum fortification. Impregnable defense, minimal offensive capability.", attackMod: 0.4, defenseMod: 2.0, casualtyMod: 0.4, moraleMod: 0.9, fuelCostMod: 0.5, ammoCostMod: 0.6 },
  { id: "terror", name: "TERROR DOCTRINE", description: "Psychological warfare. Demoralize the enemy through fear and intimidation.", attackMod: 1.0, defenseMod: 0.7, casualtyMod: 1.1, moraleMod: 1.8, fuelCostMod: 0.9, ammoCostMod: 1.2 },
  { id: "combined_arms", name: "COMBINED ARMS", description: "Synchronized infantry, armor, and air support. Well-rounded but complex.", attackMod: 1.3, defenseMod: 1.2, casualtyMod: 0.85, moraleMod: 1.15, fuelCostMod: 1.5, ammoCostMod: 1.4 },
  { id: "asymmetric", name: "ASYMMETRIC WARFARE", description: "Unconventional tactics exploiting enemy weaknesses. Low cost, high risk.", attackMod: 1.1, defenseMod: 0.6, casualtyMod: 1.0, moraleMod: 1.0, fuelCostMod: 0.4, ammoCostMod: 0.5 },
];

export const ENGAGEMENT_TEMPLATES: EngagementDef[] = [
  { id: "sector_patrol_clash", name: "Sector Patrol Clash", type: "patrol_clash", description: "Routine patrol encounters hostile elements in contested blocks.", baseEnemyStrength: 30, enemyMorale: 40, terrainMod: 1.0, minUnits: 5, creditsCost: 500, ammoCost: 20, fuelCost: 10, xpReward: 15, creditReward: 800, defenseRewardOnWin: 1, zoneThreat: 10 },
  { id: "underhive_skirmish", name: "Underhive Skirmish", type: "skirmish", description: "Gang violence erupts in the lower levels. Deploy squads to suppress.", baseEnemyStrength: 45, enemyMorale: 55, terrainMod: 1.2, minUnits: 10, creditsCost: 1200, ammoCost: 40, fuelCost: 15, xpReward: 25, creditReward: 1500, defenseRewardOnWin: 2, zoneThreat: 20 },
  { id: "mutant_raid", name: "Mutant Raider Attack", type: "raid", description: "Irradiated mutant warbands assault outer perimeter sectors.", baseEnemyStrength: 60, enemyMorale: 70, terrainMod: 1.1, minUnits: 15, creditsCost: 2000, ammoCost: 80, fuelCost: 30, xpReward: 40, creditReward: 2500, defenseRewardOnWin: 3, zoneThreat: 35 },
  { id: "corporate_militia_assault", name: "Corporate Militia Assault", type: "assault", description: "Rogue corporation deploys private army against government sectors.", baseEnemyStrength: 80, enemyMorale: 65, terrainMod: 1.0, minUnits: 25, creditsCost: 5000, ammoCost: 150, fuelCost: 60, xpReward: 60, creditReward: 5000, defenseRewardOnWin: 4, zoneThreat: 45 },
  { id: "wasteland_incursion", name: "Wasteland Incursion", type: "raid", description: "Nomad warband pushes into city outskirts. Repel invaders.", baseEnemyStrength: 55, enemyMorale: 60, terrainMod: 0.9, minUnits: 12, creditsCost: 1500, ammoCost: 60, fuelCost: 40, xpReward: 35, creditReward: 2000, defenseRewardOnWin: 2, zoneThreat: 25 },
  { id: "cult_uprising", name: "Cult Uprising", type: "assault", description: "Doomsday cult launches coordinated attacks across multiple blocks.", baseEnemyStrength: 70, enemyMorale: 90, terrainMod: 1.3, minUnits: 20, creditsCost: 3500, ammoCost: 100, fuelCost: 40, xpReward: 50, creditReward: 3000, defenseRewardOnWin: 3, zoneThreat: 40 },
  { id: "rival_city_probe", name: "Rival City Probe Attack", type: "assault", description: "Hostile megacity sends probing force to test our defenses.", baseEnemyStrength: 100, enemyMorale: 75, terrainMod: 1.0, minUnits: 30, creditsCost: 8000, ammoCost: 200, fuelCost: 100, xpReward: 80, creditReward: 8000, defenseRewardOnWin: 5, zoneThreat: 55 },
  { id: "pirate_convoy_ambush", name: "Pirate Convoy Ambush", type: "ambush", description: "Supply convoy ambushed by organized pirates. Rescue or lose supplies.", baseEnemyStrength: 40, enemyMorale: 50, terrainMod: 1.1, minUnits: 8, creditsCost: 800, ammoCost: 30, fuelCost: 20, xpReward: 20, creditReward: 1200, defenseRewardOnWin: 1, zoneThreat: 15 },
  { id: "perimeter_defense", name: "Perimeter Defense Stand", type: "defense", description: "Mass assault on outer walls. Hold the line at all costs.", baseEnemyStrength: 120, enemyMorale: 80, terrainMod: 0.8, minUnits: 40, creditsCost: 10000, ammoCost: 300, fuelCost: 80, xpReward: 100, creditReward: 12000, defenseRewardOnWin: 6, zoneThreat: 65 },
  { id: "rebel_stronghold_siege", name: "Rebel Stronghold Siege", type: "siege", description: "Lay siege to entrenched rebel fortification deep in the undercity.", baseEnemyStrength: 90, enemyMorale: 85, terrainMod: 1.4, minUnits: 35, creditsCost: 12000, ammoCost: 250, fuelCost: 120, xpReward: 90, creditReward: 10000, defenseRewardOnWin: 5, zoneThreat: 50 },
  { id: "sector_counterattack", name: "Sector Counterattack", type: "counterattack", description: "Launch counteroffensive to reclaim lost blocks.", baseEnemyStrength: 75, enemyMorale: 60, terrainMod: 1.1, minUnits: 25, creditsCost: 6000, ammoCost: 180, fuelCost: 90, xpReward: 70, creditReward: 6000, defenseRewardOnWin: 4, zoneThreat: 40 },
  { id: "drone_swarm_defense", name: "Drone Swarm Defense", type: "defense", description: "Enemy deploys autonomous drone swarm. Activate AA countermeasures.", baseEnemyStrength: 65, enemyMorale: 100, terrainMod: 0.9, minUnits: 15, creditsCost: 4000, ammoCost: 120, fuelCost: 50, xpReward: 45, creditReward: 3500, defenseRewardOnWin: 3, zoneThreat: 30 },
  { id: "megablock_clearance", name: "Megablock Clearance Op", type: "assault", description: "Floor-by-floor clearance of hostile-held megablock.", baseEnemyStrength: 85, enemyMorale: 70, terrainMod: 1.5, minUnits: 30, creditsCost: 7000, ammoCost: 200, fuelCost: 50, xpReward: 75, creditReward: 7000, defenseRewardOnWin: 4, zoneThreat: 45 },
  { id: "tunnel_network_assault", name: "Tunnel Network Assault", type: "assault", description: "Storm underground tunnel system used by smugglers and insurgents.", baseEnemyStrength: 50, enemyMorale: 65, terrainMod: 1.6, minUnits: 18, creditsCost: 3000, ammoCost: 90, fuelCost: 25, xpReward: 45, creditReward: 4000, defenseRewardOnWin: 2, zoneThreat: 30 },
  { id: "orbital_drop_defense", name: "Orbital Drop Pod Defense", type: "defense", description: "Enemy drops shock troops from orbit. Intercept and eliminate.", baseEnemyStrength: 140, enemyMorale: 90, terrainMod: 1.0, minUnits: 50, creditsCost: 15000, ammoCost: 400, fuelCost: 150, xpReward: 120, creditReward: 15000, defenseRewardOnWin: 8, zoneThreat: 75 },
  { id: "warlord_elimination", name: "Warlord Elimination Strike", type: "raid", description: "Surgical strike to eliminate hostile warlord and command structure.", baseEnemyStrength: 110, enemyMorale: 95, terrainMod: 1.3, minUnits: 20, creditsCost: 10000, ammoCost: 150, fuelCost: 80, xpReward: 100, creditReward: 12000, defenseRewardOnWin: 5, zoneThreat: 55 },
  { id: "aerial_bombardment", name: "Aerial Bombardment Strike", type: "aerial_strike", description: "Deploy VTOL gunships and bombers for precision air assault on enemy strongpoint.", baseEnemyStrength: 95, enemyMorale: 60, terrainMod: 0.7, minUnits: 15, creditsCost: 9000, ammoCost: 250, fuelCost: 180, xpReward: 85, creditReward: 9000, defenseRewardOnWin: 4, zoneThreat: 50 },
  { id: "cyber_warfare_op", name: "Cyber Warfare Operation", type: "cyber_attack", description: "Launch cyberattack to disable enemy comms, targeting systems, and infrastructure.", baseEnemyStrength: 70, enemyMorale: 50, terrainMod: 1.0, minUnits: 8, creditsCost: 7000, ammoCost: 10, fuelCost: 5, xpReward: 65, creditReward: 6000, defenseRewardOnWin: 3, zoneThreat: 25 },
];

export const ZONE_TERRITORIES: ZoneTerritory[] = [
  { id: "sector_alpha", name: "Sector Alpha — City Center", description: "Government district. High-value infrastructure.", status: "friendly", controlLevel: 90, threat: 5, garrison: 10, maxGarrison: 100, resourceBonus: { credits: 2000 }, adjacentZones: ["sector_beta", "sector_gamma", "industrial_core"], controllingFaction: "player" },
  { id: "sector_beta", name: "Sector Beta — Commercial Hub", description: "Corporate towers and trade exchanges.", status: "friendly", controlLevel: 80, threat: 10, garrison: 5, maxGarrison: 80, resourceBonus: { credits: 1500, steel: 50 }, adjacentZones: ["sector_alpha", "sector_delta", "hab_blocks_east"], controllingFaction: "player" },
  { id: "sector_gamma", name: "Sector Gamma — Residential West", description: "Dense habitation blocks, millions of citizens.", status: "friendly", controlLevel: 75, threat: 15, garrison: 5, maxGarrison: 60, resourceBonus: { credits: 800 }, adjacentZones: ["sector_alpha", "hab_blocks_west", "underhive_west"], controllingFaction: "player" },
  { id: "sector_delta", name: "Sector Delta — Spaceport District", description: "Orbital launch facilities and cargo terminals.", status: "friendly", controlLevel: 70, threat: 20, garrison: 5, maxGarrison: 90, resourceBonus: { credits: 1200, fuel: 100 }, adjacentZones: ["sector_beta", "wasteland_north", "industrial_core"], controllingFaction: "player" },
  { id: "industrial_core", name: "Industrial Core", description: "Manufacturing plants and foundries.", status: "friendly", controlLevel: 85, threat: 10, garrison: 5, maxGarrison: 80, resourceBonus: { steel: 200, credits: 500 }, adjacentZones: ["sector_alpha", "sector_delta", "toxic_flats"], controllingFaction: "player" },
  { id: "hab_blocks_east", name: "Hab-Blocks East", description: "Worker housing and transit hubs.", status: "friendly", controlLevel: 65, threat: 25, garrison: 3, maxGarrison: 50, resourceBonus: { credits: 600 }, adjacentZones: ["sector_beta", "underhive_east", "penal_zone"], controllingFaction: "player" },
  { id: "hab_blocks_west", name: "Hab-Blocks West", description: "Overcrowded residential towers.", status: "contested", controlLevel: 50, threat: 35, garrison: 2, maxGarrison: 50, resourceBonus: { credits: 400 }, adjacentZones: ["sector_gamma", "underhive_west", "mutant_quarter"], controllingFaction: "contested" },
  { id: "underhive_east", name: "Underhive East", description: "Lawless subterranean warren of gangs and outcasts.", status: "contested", controlLevel: 30, threat: 55, garrison: 0, maxGarrison: 40, resourceBonus: { ammo: 50, credits: 200 }, adjacentZones: ["hab_blocks_east", "penal_zone", "underhive_deep"], controllingFaction: "gangs" },
  { id: "underhive_west", name: "Underhive West", description: "Abandoned infrastructure reclaimed by insurgents.", status: "hostile", controlLevel: 15, threat: 65, garrison: 0, maxGarrison: 40, resourceBonus: { ammo: 30 }, adjacentZones: ["hab_blocks_west", "sector_gamma", "underhive_deep", "mutant_quarter"], controllingFaction: "insurgents" },
  { id: "underhive_deep", name: "Underhive Deep", description: "Deepest levels. Radiation, mutants, forgotten tech.", status: "hostile", controlLevel: 5, threat: 80, garrison: 0, maxGarrison: 30, resourceBonus: { steel: 100, ammo: 80 }, adjacentZones: ["underhive_east", "underhive_west", "toxic_flats"], controllingFaction: "mutants" },
  { id: "penal_zone", name: "Penal Zone", description: "Prison blocks and forced labor camps.", status: "contested", controlLevel: 45, threat: 40, garrison: 0, maxGarrison: 60, resourceBonus: { credits: 300, steel: 80 }, adjacentZones: ["hab_blocks_east", "underhive_east", "wasteland_east"], controllingFaction: "contested" },
  { id: "mutant_quarter", name: "Mutant Quarter", description: "Irradiated ghetto. Mutant warbands rule.", status: "hostile", controlLevel: 10, threat: 70, garrison: 0, maxGarrison: 30, resourceBonus: { fuel: 50 }, adjacentZones: ["hab_blocks_west", "underhive_west", "wasteland_south"], controllingFaction: "mutants" },
  { id: "toxic_flats", name: "Toxic Flats", description: "Chemical wasteland between city and wilderness.", status: "hostile", controlLevel: 5, threat: 60, garrison: 0, maxGarrison: 20, resourceBonus: { fuel: 80 }, adjacentZones: ["industrial_core", "underhive_deep", "wasteland_south"], controllingFaction: "raiders" },
  { id: "wasteland_north", name: "Northern Wasteland", description: "Irradiated expanse. Nomad warbands and scavengers.", status: "neutral", controlLevel: 0, threat: 50, garrison: 0, maxGarrison: 40, resourceBonus: { fuel: 60, steel: 40 }, adjacentZones: ["sector_delta", "wasteland_east"], controllingFaction: "none" },
  { id: "wasteland_east", name: "Eastern Wastes", description: "Rocky badlands with raider camps.", status: "neutral", controlLevel: 0, threat: 45, garrison: 0, maxGarrison: 40, resourceBonus: { ammo: 40, steel: 30 }, adjacentZones: ["penal_zone", "wasteland_north", "wasteland_south"], controllingFaction: "none" },
  { id: "wasteland_south", name: "Southern Deadlands", description: "Blasted crater-fields and ruins of the old world.", status: "neutral", controlLevel: 0, threat: 55, garrison: 0, maxGarrison: 40, resourceBonus: { steel: 60, fuel: 40 }, adjacentZones: ["mutant_quarter", "toxic_flats", "wasteland_east"], controllingFaction: "none" },
];

export const COMBAT_DOCTRINES_MAP: Record<string, CombatDoctrine> = {};
for (const d of COMBAT_DOCTRINES) {
  COMBAT_DOCTRINES_MAP[d.id] = d;
}

export const ENGAGEMENT_TEMPLATES_MAP: Record<string, EngagementDef> = {};
for (const t of ENGAGEMENT_TEMPLATES) {
  ENGAGEMENT_TEMPLATES_MAP[t.id] = t;
}

export const ZONE_TERRITORIES_MAP: Record<string, ZoneTerritory> = {};
for (const z of ZONE_TERRITORIES) {
  ZONE_TERRITORIES_MAP[z.id] = z;
}

export const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  skirmish: "SKIRMISH",
  raid: "RAID",
  assault: "ASSAULT",
  siege: "SIEGE",
  ambush: "AMBUSH",
  defense: "DEFENSE",
  counterattack: "COUNTERATTACK",
  patrol_clash: "PATROL CLASH",
  aerial_strike: "AIR STRIKE",
  cyber_attack: "CYBER OPS",
};

export const ENGAGEMENT_TYPE_COLORS: Record<EngagementType, string> = {
  skirmish: "#00C8FF",
  raid: "#FF9500",
  assault: "#FF3B30",
  siege: "#FF2D55",
  ambush: "#FF6B00",
  defense: "#00FF41",
  counterattack: "#AF52DE",
  patrol_clash: "#5AC8FA",
  aerial_strike: "#FF6EC7",
  cyber_attack: "#00FFFF",
};

export const ZONE_STATUS_COLORS: Record<ZoneStatus, string> = {
  friendly: "#00FF41",
  contested: "#FF9500",
  hostile: "#FF3B30",
  neutral: "#8E8E93",
  devastated: "#555555",
};

export const FORMATIONS: FormationDef[] = [
  { id: "line", name: "LINE FORMATION", description: "Standard battle line. Balanced offense and defense.", attackMod: 1.0, defenseMod: 1.0, casualtyMod: 1.0 },
  { id: "column", name: "COLUMN ADVANCE", description: "Concentrated thrust. High attack, vulnerable flanks.", attackMod: 1.3, defenseMod: 0.7, casualtyMod: 1.1 },
  { id: "wedge", name: "WEDGE ASSAULT", description: "Armored spearhead. Punches through enemy lines.", attackMod: 1.5, defenseMod: 0.6, casualtyMod: 1.2 },
  { id: "phalanx", name: "PHALANX DEFENSE", description: "Tight defensive formation. Nearly impenetrable front.", attackMod: 0.6, defenseMod: 1.6, casualtyMod: 0.6 },
  { id: "dispersed", name: "DISPERSED GRID", description: "Spread units to minimize casualties. Reduced firepower.", attackMod: 0.8, defenseMod: 1.1, casualtyMod: 0.5 },
  { id: "reserve_echelon", name: "RESERVE ECHELON", description: "Hold reserves for counter-punch. Adaptable but slow.", attackMod: 0.9, defenseMod: 1.2, casualtyMod: 0.8 },
];

export const ORDNANCE_OPTIONS: OrdnanceDef[] = [
  { id: "standard", name: "STANDARD MUNITIONS", description: "Regulation small arms and grenades.", damageMod: 1.0, ammoCost: 0, fuelCost: 0, moraleDamage: 0 },
  { id: "heavy_artillery", name: "HEAVY ARTILLERY", description: "Long-range bombardment. Devastating but costly.", damageMod: 1.6, ammoCost: 80, fuelCost: 20, moraleDamage: 15 },
  { id: "air_support", name: "AIR SUPPORT", description: "VTOL gunship strikes. Highly effective against ground forces.", damageMod: 1.4, ammoCost: 50, fuelCost: 60, moraleDamage: 10 },
  { id: "orbital_strike", name: "ORBITAL STRIKE", description: "Kinetic bombardment from orbit. Maximum destruction.", damageMod: 2.5, ammoCost: 200, fuelCost: 100, moraleDamage: 30 },
  { id: "incendiary", name: "INCENDIARY BARRAGE", description: "Area denial through fire. Devastates terrain.", damageMod: 1.3, ammoCost: 60, fuelCost: 30, moraleDamage: 20 },
  { id: "emp_burst", name: "EMP BURST", description: "Electromagnetic pulse. Disables enemy electronics and drones.", damageMod: 0.8, ammoCost: 40, fuelCost: 15, moraleDamage: 25 },
];

export const ORDNANCE_OPTIONS_MAP: Record<string, OrdnanceDef> = {};
for (const o of ORDNANCE_OPTIONS) {
  ORDNANCE_OPTIONS_MAP[o.id] = o;
}

export const HOSTILE_RAID_TEMPLATES: HostileRaidTemplate[] = [
  { id: "gang_incursion", name: "Gang Incursion", description: "Local gang pushes into controlled territory.", enemyStrength: 35, enemyMorale: 45, terrainMod: 1.1, targetZonePreference: ["hab_blocks_west", "underhive_east", "underhive_west"], factionSource: "gangs", populationDamage: 50, tickDuration: 2 },
  { id: "mutant_horde", name: "Mutant Horde", description: "Irradiated mutants swarm from the wastes.", enemyStrength: 60, enemyMorale: 70, terrainMod: 1.0, targetZonePreference: ["mutant_quarter", "toxic_flats", "hab_blocks_west"], factionSource: "mutants", populationDamage: 200, tickDuration: 3 },
  { id: "raider_strike", name: "Raider Strike Force", description: "Wasteland raiders launch coordinated attack.", enemyStrength: 50, enemyMorale: 55, terrainMod: 0.9, targetZonePreference: ["wasteland_north", "wasteland_east", "sector_delta"], factionSource: "raiders", populationDamage: 100, tickDuration: 2 },
  { id: "corporate_coup", name: "Corporate Security Op", description: "Megacorp sends private military to seize assets.", enemyStrength: 80, enemyMorale: 65, terrainMod: 1.0, targetZonePreference: ["sector_beta", "industrial_core", "sector_delta"], factionSource: "corporations", populationDamage: 50, tickDuration: 3 },
  { id: "cult_terror", name: "Cult Terror Attack", description: "Doomsday cult launches suicide attacks.", enemyStrength: 45, enemyMorale: 95, terrainMod: 1.2, targetZonePreference: ["hab_blocks_east", "hab_blocks_west", "sector_gamma"], factionSource: "cults", populationDamage: 300, tickDuration: 2 },
  { id: "rival_city_raid", name: "Rival City Raid", description: "Hostile megacity probes our defenses.", enemyStrength: 100, enemyMorale: 75, terrainMod: 1.0, targetZonePreference: ["wasteland_north", "sector_delta", "wasteland_east"], factionSource: "rival_cities", populationDamage: 150, tickDuration: 4 },
  { id: "insurgent_uprising", name: "Insurgent Uprising", description: "Internal rebels seize government buildings.", enemyStrength: 55, enemyMorale: 80, terrainMod: 1.3, targetZonePreference: ["sector_alpha", "sector_gamma", "penal_zone"], factionSource: "insurgents", populationDamage: 100, tickDuration: 3 },
  { id: "pirate_raid", name: "Pirate Supply Raid", description: "Organized pirates target supply depots.", enemyStrength: 40, enemyMorale: 50, terrainMod: 1.1, targetZonePreference: ["sector_delta", "industrial_core", "sector_beta"], factionSource: "pirates", populationDamage: 25, tickDuration: 2 },
];

export const UNIT_COMBAT_WEIGHTS: Record<string, number> = {
  cityDefenseInfantry: 3.0, armoredResponseUnits: 5.0, sectorDefenseTroops: 2.5,
  rapidDeploymentInfantry: 3.5, heavyWeaponsSquads: 6.0, urbanDefenseEngineers: 2.0,
  wallDefenseCrews: 1.5, antiVehicleTeams: 4.0, eliteJudgeStrikeTeams: 7.0,
  tacticalBreachSquads: 6.5, urbanCombatSpecialists: 8.0, judgeExecutionTeams: 9.0,
  riotPoliceSquads: 1.5, heavyRiotMechUnits: 4.0, blackOpsUnits: 10.0,
  experimentalCombatUnits: 8.0, mutantEnforcementSquads: 5.0, antiCultTaskForces: 3.5,
  patrolJudges: 1.5, seniorJudges: 3.0, tacticalCombatDrones: 4.0,
  judgeGunships: 8.0, tacticalDropShips: 6.0, armoredPersonnelCarriers: 3.5,
  tacticalResponseAPCs: 4.5, antiGangTaskForces: 2.5, highThreatArrestUnits: 5.5,
  rapidResponseUnits: 4.0, riotDroneSquads: 2.0, rogueJudgeHunters: 7.5,
  // Phase 5 — Wildlands war beasts. Weights set so beasts count in canonical
  // combat strength (computeUnitCompositionStrength) and minUnits checks.
  ridgebackHoundPacks: 4.5,    // fast skirmisher pack
  glasshornOxCavalry: 7.0,     // heavy charge, soaks fire
  skywingFliers: 6.0,          // aerial strike/recon
  beastWranglers: 1.5,         // capture/handler role; light combat value
};

export const COMBAT_UNIT_KEYS = new Set(Object.keys(UNIT_COMBAT_WEIGHTS));

export function getCombatUnitCount(units: Record<string, number>): number {
  let total = 0;
  for (const [key, count] of Object.entries(units)) {
    if (typeof count !== "number" || count <= 0) continue;
    if (COMBAT_UNIT_KEYS.has(key)) total += count;
  }
  return total;
}

export function computeUnitCompositionStrength(
  units: Record<string, number>,
  tierMultipliers?: Record<string, number>,
): number {
  let weighted = 0;
  let total = 0;
  for (const [key, count] of Object.entries(units)) {
    if (typeof count !== "number" || count <= 0) continue;
    if (!COMBAT_UNIT_KEYS.has(key)) continue;
    const weight = UNIT_COMBAT_WEIGHTS[key];
    const tierMult = tierMultipliers && typeof tierMultipliers[key] === "number" && tierMultipliers[key]! > 0
      ? tierMultipliers[key]!
      : 1;
    weighted += count * weight * tierMult;
    total += count;
  }
  return total > 0 ? weighted : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Task #222: Faction signature units.
//
// Every hostile raid carries a `factionSource` tag (gangs, mutants, raiders,
// corporations, cults, rival_cities, insurgents, pirates). Until now the UI
// only ever showed an opaque `enemyStrength` number — the player never saw
// *who* was attacking. This registry attaches 2–3 named archetypes per faction
// so encounters read "Hostiles spotted: 6× Rust-Pack Bikers, 2× Slag-Cannon
// Crew" instead of "Strength 60". Names are original (no copyrighted IP);
// the bar is the existing Iron Brotherhood / Free Choir voice — gritty,
// culturally specific, one-line blurb each.
//
// Weights are drawn from the same scale as UNIT_COMBAT_WEIGHTS so the
// composition's total weighted strength can approximate the raid's
// baseEnemyStrength to within ±15%.
export type FactionSignatureUnit = {
  id: string;
  displayName: string;
  blurb: string;
  weight: number;
};

export const FACTION_SIGNATURE_UNITS: Record<string, FactionSignatureUnit[]> = {
  gangs: [
    { id: "rust_pack_bikers", displayName: "Rust-Pack Bikers", blurb: "Welded plate, two-stroke engines, no helmets, no patience.", weight: 2.5 },
    { id: "slag_cannon_crew", displayName: "Slag-Cannon Crew", blurb: "Fires scrap shells from looted industrial torch heads. One in three actually flies.", weight: 5.0 },
    { id: "wire_saints", displayName: "Wire Saints", blurb: "Knife-fighters who tattoo every kill on the inside of their forearms.", weight: 1.5 },
  ],
  mutants: [
    { id: "glow_crawlers", displayName: "Glow-Crawlers", blurb: "Quadrupedal, eyeless, faintly luminous. Travel in chittering packs.", weight: 2.0 },
    { id: "tumor_brutes", displayName: "Tumor Brutes", blurb: "Eight-foot, lopsided, swing rebar like a parent swings a child.", weight: 6.0 },
    { id: "ash_lung_howlers", displayName: "Ash-Lung Howlers", blurb: "Lungs scorched into bagpipes. Their warcry alone collapses morale and cheap masonry.", weight: 3.5 },
  ],
  raiders: [
    { id: "buzzard_outriders", displayName: "Buzzard Outriders", blurb: "Sand-skiff scouts who circle a target for two days before striking.", weight: 2.5 },
    { id: "wreck_lance_cavalry", displayName: "Wreck-Lance Cavalry", blurb: "Mount old highway barriers as lances. Charge first, aim second.", weight: 5.5 },
    { id: "salt_skinned_marksmen", displayName: "Salt-Skinned Marksmen", blurb: "Wrap themselves in cured hide. Calm shooters who count breaths instead of rounds.", weight: 4.0 },
  ],
  corporations: [
    { id: "brand_compliant_pmc", displayName: "Brand-Compliant PMC Riflemen", blurb: "Helmets repainted with last quarter's logo. Paid in script.", weight: 3.0 },
    { id: "drone_controller_ops", displayName: "Drone-Controller Operators", blurb: "Run four killdrones from a field tablet and one cooling pack.", weight: 5.0 },
    { id: "audit_class_heavies", displayName: "Audit-Class Heavies", blurb: "Powered exoframes leased from the parent company. Pay-per-firing-pin.", weight: 7.5 },
  ],
  cults: [
    { id: "last_hour_penitents", displayName: "Last-Hour Penitents", blurb: "Robe-clad walking bombs. Cannot be talked out of it. Have already written their confessions.", weight: 3.5 },
    { id: "choir_of_smoke", displayName: "Choir of Smoke", blurb: "Sing while they burn buildings. The harmonies are reportedly excellent.", weight: 1.5 },
    { id: "bone_mask_censers", displayName: "Bone-Mask Censers", blurb: "Swing flaming censers full of acid. Their leaders never carry weapons.", weight: 4.0 },
  ],
  rival_cities: [
    { id: "coastal_levy_riflemen", displayName: "Coastal Levy Riflemen", blurb: "Conscripts in matching grey. Drilled but unenthusiastic. Three-deep firing lines.", weight: 2.5 },
    { id: "iron_spear_lancers", displayName: "Iron-Spear Lancers", blurb: "Mechanised lance-cavalry from the rival capital's guard regiment. Polished. Expensive.", weight: 7.0 },
    { id: "citadel_siege_engineers", displayName: "Citadel Siege Engineers", blurb: "Build pontoon bridges under fire and complain about the cost overruns.", weight: 2.0 },
  ],
  insurgents: [
    { id: "sleeper_cell_bombers", displayName: "Sleeper-Cell Bombers", blurb: "Ordinary citizens until the codeword. Then explosives in a backpack and a list of names.", weight: 4.5 },
    { id: "barricade_captains", displayName: "Barricade Captains", blurb: "Lead street-by-street defense from behind stacked municipal furniture.", weight: 2.5 },
    { id: "pamphlet_snipers", displayName: "Pamphlet Snipers", blurb: "Fire one shot and leave a mimeographed manifesto in the cartridge case.", weight: 5.0 },
  ],
  pirates: [
    { id: "hookline_boarders", displayName: "Hookline Boarders", blurb: "Climb supply trains with grappling lines and bad teeth. Take the cargo, leave the crew.", weight: 3.0 },
    { id: "brine_coated_cutters", displayName: "Brine-Coated Cutters", blurb: "Two-man hatchet teams. Open containers and skulls with the same tool.", weight: 4.0 },
    { id: "hold_master_quartermasters", displayName: "Hold-Master Quartermasters", blurb: "Don't fight unless cornered. Calculate exactly which crate is worth dying for.", weight: 2.0 },
  ],
};

// Deterministic 32-bit string hash (FNV-1a). Exported so tests can reproduce
// the same seed the spawn site uses without re-implementing the formula.
export function hashRaidSeedString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let st = seed >>> 0;
  return () => {
    st = (st + 0x6D2B79F5) >>> 0;
    let t = st;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generates a faction-flavored unit composition whose total weighted strength
// approximates `baseEnemyStrength` (within ±15%, enforced by the test in
// __tests__/factionSignatureUnits.test.ts).
//
// Determinism: same (raidId, spawnTick, factionSource) → same composition.
// Falls back to the "gangs" archetype list for any unknown factionSource so
// the UI never shows an empty "Hostiles spotted:" line.
export function generateFactionComposition(
  raidId: string,
  spawnTick: number,
  factionSource: string,
  baseEnemyStrength: number,
): Record<string, number> {
  const archetypes = FACTION_SIGNATURE_UNITS[factionSource] ?? FACTION_SIGNATURE_UNITS.gangs;
  const target = Math.max(1, baseEnemyStrength);
  // Mix factionSource into the seed (alongside raidId + spawnTick) so two
  // raids that happen to share an id and tick but differ in faction get
  // different compositions — matches the documented seed contract and keeps
  // the registry change/swap-resistant.
  const seed = (hashRaidSeedString(`${raidId}|${spawnTick | 0}|${factionSource}`)) >>> 0;
  const rng = mulberry32(seed);

  const shares = archetypes.map(() => 0.5 + rng());
  const sumShares = shares.reduce((a, b) => a + b, 0) || 1;

  const comp: Record<string, number> = {};
  let allocated = 0;
  for (let i = 0; i < archetypes.length; i++) {
    const a = archetypes[i];
    const slice = target * (shares[i] / sumShares);
    const count = Math.max(1, Math.round(slice / Math.max(0.5, a.weight)));
    comp[a.id] = count;
    allocated += count * a.weight;
  }

  // Nudge the highest-weight archetype to land within ±10% of target so the
  // ±15% invariant holds with margin.
  const heaviest = [...archetypes].sort((a, b) => b.weight - a.weight)[0];
  let guard = 0;
  while (guard++ < 8 && Math.abs(allocated - target) / target > 0.1) {
    const delta = (target - allocated) / heaviest.weight;
    const adj = delta > 0 ? Math.ceil(delta) : Math.floor(delta);
    const newCount = Math.max(1, comp[heaviest.id] + adj);
    allocated += (newCount - comp[heaviest.id]) * heaviest.weight;
    if (newCount === comp[heaviest.id]) break;
    comp[heaviest.id] = newCount;
  }

  return comp;
}

// "6× Rust-Pack Bikers, 2× Slag-Cannon Crew" — used by the raid card and
// the siege-report inbox body. Falls back to the raw archetype id if the
// faction is unknown so we never silently drop a unit.
export function formatHostilesSpotted(
  composition: Record<string, number>,
  factionSource: string,
): string {
  const archetypes = FACTION_SIGNATURE_UNITS[factionSource] ?? FACTION_SIGNATURE_UNITS.gangs;
  const nameById = new Map(archetypes.map((a) => [a.id, a.displayName]));
  return Object.entries(composition)
    .filter(([, c]) => typeof c === "number" && c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => `${c}× ${nameById.get(id) ?? id}`)
    .join(", ");
}

// Picks the archetype the player is most likely to remember from a resolved
// raid (highest count, ties broken by highest weight) so the inbox reason
// text can mention it by name. Returns null when the composition is empty.
export function pickFlavorArchetype(
  composition: Record<string, number>,
  factionSource: string,
): FactionSignatureUnit | null {
  const archetypes = FACTION_SIGNATURE_UNITS[factionSource] ?? FACTION_SIGNATURE_UNITS.gangs;
  const byId = new Map(archetypes.map((a) => [a.id, a]));
  let best: { unit: FactionSignatureUnit; count: number } | null = null;
  for (const [id, count] of Object.entries(composition)) {
    if (typeof count !== "number" || count <= 0) continue;
    const unit = byId.get(id);
    if (!unit) continue;
    if (!best || count > best.count || (count === best.count && unit.weight > best.unit.weight)) {
      best = { unit, count };
    }
  }
  return best?.unit ?? null;
}

// Task #223: distribute a total enemy strength loss across the raid's
// composition so the after-action debrief can show "4× Rust-Pack Bikers
// down, 1× Slag-Cannon Crew escaped". Allocation is proportional to each
// archetype's total weighted strength contribution, then converted to a
// whole-unit count (round, capped at the spawned count). Returns an empty
// object when composition has no recognised archetypes — the caller can
// then fall back to the existing aggregate enemyCasualties number.
export function computeArchetypeLosses(
  composition: Record<string, number>,
  factionSource: string,
  totalStrengthLoss: number,
): Record<string, number> {
  if (!composition || totalStrengthLoss <= 0) return {};
  const archetypes = FACTION_SIGNATURE_UNITS[factionSource] ?? FACTION_SIGNATURE_UNITS.gangs;
  const byId = new Map(archetypes.map((a) => [a.id, a]));
  const entries = Object.entries(composition).filter(([id, c]) => byId.has(id) && typeof c === "number" && c > 0);
  if (entries.length === 0) return {};
  const totalStr = entries.reduce((acc, [id, c]) => acc + (byId.get(id)!.weight * c), 0);
  if (totalStr <= 0) return {};
  const losses: Record<string, number> = {};
  for (const [id, c] of entries) {
    const w = byId.get(id)!.weight;
    const archStr = w * c;
    const share = archStr / totalStr;
    const strLoss = totalStrengthLoss * share;
    const unitLoss = Math.max(0, Math.min(c, Math.round(strLoss / Math.max(0.5, w))));
    if (unitLoss > 0) losses[id] = unitLoss;
  }
  return losses;
}

// "4× Rust-Pack Bikers down, 1× Slag-Cannon Crew down" — used by the
// after-action debrief. Survivors-by-archetype rendering uses the same
// archetype id → display-name lookup as formatHostilesSpotted.
export function formatLossesByUnit(
  losses: Record<string, number>,
  factionSource: string,
): string {
  const archetypes = FACTION_SIGNATURE_UNITS[factionSource] ?? FACTION_SIGNATURE_UNITS.gangs;
  const nameById = new Map(archetypes.map((a) => [a.id, a.displayName]));
  return Object.entries(losses)
    .filter(([, c]) => typeof c === "number" && c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => `${c}× ${nameById.get(id) ?? id} down`)
    .join(", ");
}

// Task #226: archetype-id → display name lookup that ignores the
// faction grouping. Used by the lifetime "Hostiles defeated to date"
// readout, where the player has historic kills across many factions
// and we just need a name for each id. Built once per process — the
// FACTION_SIGNATURE_UNITS registry is module-static.
const ARCHETYPE_NAME_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const list of Object.values(FACTION_SIGNATURE_UNITS)) {
    for (const u of list) {
      if (!m.has(u.id)) m.set(u.id, u.displayName);
    }
  }
  return m;
})();

export function archetypeDisplayName(archetypeId: string): string {
  return ARCHETYPE_NAME_INDEX.get(archetypeId) ?? archetypeId;
}

// Returns the lifetime kill tally as a list sorted by descending kill
// count, with the display name resolved. Unknown ids fall through to
// the raw id so a renamed/removed archetype still renders something
// rather than vanishing from the player's trophy wall.
export function rankArchetypeKills(
  tally: Record<string, number> | undefined,
): Array<{ id: string; displayName: string; count: number }> {
  if (!tally) return [];
  return Object.entries(tally)
    .filter(([, c]) => typeof c === "number" && c > 0)
    .map(([id, c]) => ({ id, displayName: archetypeDisplayName(id), count: c }))
    .sort((a, b) => b.count - a.count);
}

// Task #235: shared after-action line builder used by the BATTLE LOG modal
// in app/(game)/military.tsx. Extracted to engine code so the same string
// construction is testable in isolation and can't drift between the modal,
// the inbox tick reports, and any future surface that wants to render the
// debrief.
//
// Contract:
//   - Returns the date / doctrine / dominance / casualties / loot lines
//     unconditionally.
//   - Appends "Hostiles: ..." and "Losses by unit: ..." when the entry
//     carries composition + factionSource (and enemyLosses for the second
//     line). The check is on the data shape — NOT on engagement type or a
//     "RAID:" name prefix — so non-raid engagements (Task #229 attaches
//     these fields to them too) get the same breakdown raid entries do.
//   - Legacy entries without composition fall through with the original
//     six-line summary, unchanged.
export type BattleLogDetailEntry = {
  tick: number;
  doctrineUsed: string;
  dominance?: number;
  playerCasualties?: number;
  enemyCasualties?: number;
  creditsLooted?: number;
  ammoLooted?: number;
  timestamp?: { year: number; day: number };
  composition?: Record<string, number>;
  factionSource?: string;
  enemyLosses?: Record<string, number>;
};

export function buildBattleLogDetailLines(entry: BattleLogDetailEntry): string[] {
  const dateLabel = entry.timestamp
    ? `Y${entry.timestamp.year}.${String(entry.timestamp.day).padStart(3, "0")}`
    : `T${entry.tick}`;
  const lines = [
    `Date: ${dateLabel}`,
    `Doctrine: ${entry.doctrineUsed}`,
    `Dominance: ${entry.dominance ?? 0}%`,
    `Player casualties: ${(entry.playerCasualties ?? 0).toLocaleString()}`,
    `Enemy casualties: ${(entry.enemyCasualties ?? 0).toLocaleString()}`,
    `Loot: ${(entry.creditsLooted ?? 0).toLocaleString()} cr · ${(entry.ammoLooted ?? 0).toLocaleString()} ammo`,
  ];
  if (entry.composition && entry.factionSource) {
    const spotted = formatHostilesSpotted(entry.composition, entry.factionSource);
    if (spotted.length > 0) lines.push(`Hostiles: ${spotted}`);
    if (entry.enemyLosses) {
      const lossLine = formatLossesByUnit(entry.enemyLosses, entry.factionSource);
      if (lossLine.length > 0) lines.push(`Losses by unit: ${lossLine}`);
    }
  }
  return lines;
}

export function resolveEngagement(
  playerStrength: number,
  enemyStrength: number,
  playerMorale: number,
  enemyMorale: number,
  doctrine: CombatDoctrine,
  terrainMod: number,
  defenseRating: number,
  tactical?: TacticalDecision,
  techLevel?: number
): {
  victory: boolean;
  playerCasualties: number;
  enemyCasualties: number;
  moraleShift: number;
  dominance: number;
  populationLoss: number;
  creditsLooted: number;
  ammoLooted: number;
  factionRelationImpact: { factionSource: string; change: number } | null;
} {
  const seed = (playerStrength * 31 + enemyStrength * 17 + playerMorale * 7 + enemyMorale * 13 + Math.round(defenseRating * 11)) % 2147483647;
  const rng = ((Math.abs(seed) * 16807 + 1) % 2147483647) / 2147483647;
  const techMod = 1 + (techLevel ?? 0) * 0.03;

  const formation = tactical ? FORMATIONS.find((f) => f.id === tactical.formation) ?? FORMATIONS[0] : FORMATIONS[0];
  const ordnance = tactical ? ORDNANCE_OPTIONS.find((o) => o.id === tactical.ordnance) ?? ORDNANCE_OPTIONS[0] : ORDNANCE_OPTIONS[0];
  const reserveBonus = tactical ? 1 + tactical.reserveCommitment * 0.002 : 1.0;
  const officerBase = tactical?.officerAssigned ? 1.05 : 1.0;
  const officerSkill = tactical?.officerCompetence ? (tactical.officerCompetence / 100) * 0.15 : 0;
  const officerBonus = officerBase + officerSkill;

  const playerAttack = playerStrength * doctrine.attackMod * formation.attackMod * ordnance.damageMod * reserveBonus * officerBonus * techMod * (1 + defenseRating * 0.005);
  const playerDefense = playerStrength * doctrine.defenseMod * formation.defenseMod * techMod * (1 + defenseRating * 0.008);
  const effectiveEnemy = enemyStrength * terrainMod;

  const playerScore = playerAttack * (0.7 + rng * 0.6) * (playerMorale / 100);
  const enemyScoreRaw = effectiveEnemy * (0.6 + (1 - rng) * 0.5) * (enemyMorale / 100);
  const defenseReduction = Math.min(0.5, playerDefense / Math.max(1, enemyScoreRaw + playerDefense));
  const enemyScore = enemyScoreRaw * (1 - defenseReduction);

  const victory = playerScore > enemyScore;
  const dominance = Math.min(100, Math.max(0, Math.round(((playerScore - enemyScore) / Math.max(1, playerScore + enemyScore)) * 100 + 50)));

  const defenseCasualtyReduction = Math.min(0.4, playerDefense / Math.max(1, playerDefense + effectiveEnemy * 50));
  const baseCasualties = Math.max(1, Math.round(playerStrength * 0.05 * doctrine.casualtyMod * formation.casualtyMod * (1 - defenseCasualtyReduction)));
  const playerCasualties = victory
    ? Math.max(0, Math.round(baseCasualties * (1 - dominance / 200)))
    : Math.round(baseCasualties * (1 + (100 - dominance) / 150));

  const enemyCasualties = victory
    ? Math.round(enemyStrength * 0.3 * (dominance / 80))
    : Math.round(enemyStrength * 0.1);

  const moraleShift = victory
    ? Math.round(5 * doctrine.moraleMod * (dominance / 100))
    : -Math.round(8 * (1 - dominance / 100));

  const populationLoss = victory ? Math.round(playerCasualties * 0.5) : Math.round((playerCasualties + enemyStrength * 0.1) * 1.5);

  const creditsLooted = victory ? Math.round(enemyCasualties * 3 * (dominance / 100)) : 0;
  const ammoLooted = victory ? Math.round(enemyCasualties * 0.5 * (dominance / 100)) : 0;

  const factionRelationImpact = victory
    ? null
    : { factionSource: "hostiles", change: -2 };

  return { victory, playerCasualties, enemyCasualties, moraleShift, dominance, populationLoss, creditsLooted, ammoLooted, factionRelationImpact };
}

export type WarOpCategory = "defensive" | "offensive" | "intel" | "training" | "special" | "logistics" | "siege" | "naval" | "aerial" | "cyber";

export type WarRoomOp = {
  id: string;
  name: string;
  cost: number;
  type: WarOpCategory;
  description: string;
  defenseBonus: number;
  requirement?: string;
};

export function getWarRoomOpDuration(op: Pick<WarRoomOp, "cost">): number {
  return Math.max(2, Math.ceil(op.cost / 2000));
}

export const WAR_OP_CATEGORIES: Record<WarOpCategory, string> = {
  defensive: "DEFENSIVE",
  offensive: "OFFENSIVE",
  intel: "RECON & INTEL",
  training: "TRAINING",
  special: "SPECIAL OPS",
  logistics: "LOGISTICS",
  siege: "SIEGE",
  naval: "NAVAL",
  aerial: "AERIAL",
  cyber: "CYBER",
};

export const WAR_ROOM_OPS: WarRoomOp[] = [
  { id: "patrol_perimeter", name: "Patrol Perimeter", cost: 500, type: "defensive", description: "Deploy patrols along city walls", defenseBonus: 3 },
  { id: "reinforce_walls", name: "Reinforce Walls", cost: 2000, type: "defensive", description: "Strengthen outer defenses", defenseBonus: 4 },
  { id: "bunker_network", name: "Bunker Network Activation", cost: 3500, type: "defensive", description: "Activate underground bunker system", defenseBonus: 5 },
  { id: "minefield_deployment", name: "Minefield Deployment", cost: 4000, type: "defensive", description: "Lay anti-personnel mines on approach routes", defenseBonus: 4 },
  { id: "shield_wall_protocol", name: "Shield Wall Protocol", cost: 6000, type: "defensive", description: "Deploy riot shields and barricades at key chokepoints", defenseBonus: 5 },
  { id: "convoy_escort", name: "Convoy Escort Detail", cost: 2500, type: "defensive", description: "Protect supply convoys", defenseBonus: 2 },
  { id: "border_lockdown", name: "Border Lockdown", cost: 4000, type: "defensive", description: "Seal all entry/exit points", defenseBonus: 3 },
  { id: "aa_defense", name: "Anti-Air Defense Grid", cost: 12000, type: "defensive", description: "Activate anti-aircraft systems", defenseBonus: 5 },

  { id: "mobilize_reserves", name: "Mobilize Reserves", cost: 5000, type: "offensive", description: "Call up reserve forces", defenseBonus: 2 },
  { id: "establish_fob", name: "Establish Forward Base", cost: 10000, type: "offensive", description: "Build forward operating base in wasteland", defenseBonus: 3 },
  { id: "sniper_teams", name: "Deploy Sniper Teams", cost: 3500, type: "offensive", description: "Position snipers at strategic points", defenseBonus: 2 },
  { id: "mech_assault", name: "Mech Assault Plan", cost: 20000, type: "offensive", description: "Plan mech walker offensive", defenseBonus: 4 },
  { id: "tank_column", name: "Tank Column Advance", cost: 15000, type: "offensive", description: "Deploy armored column into contested territory", defenseBonus: 3 },
  { id: "shock_troop_insertion", name: "Shock Troop Insertion", cost: 8000, type: "offensive", description: "Fast-deploy shock troops behind enemy lines", defenseBonus: 2 },
  { id: "scorched_earth", name: "Scorched Earth Protocol", cost: 25000, type: "offensive", description: "Deny resources to advancing enemy forces", defenseBonus: 1 },
  { id: "urban_assault", name: "Urban Assault Drills", cost: 7000, type: "offensive", description: "Train units for block-by-block combat", defenseBonus: 3 },

  { id: "aerial_recon", name: "Aerial Reconnaissance", cost: 1500, type: "intel", description: "Deploy drones for surveillance", defenseBonus: 1 },
  { id: "orbital_scan", name: "Orbital Scan Request", cost: 25000, type: "intel", description: "Request satellite scan of region", defenseBonus: 2 },
  { id: "signals_intercept", name: "Signals Intercept Station", cost: 5000, type: "intel", description: "Monitor enemy radio and comms traffic", defenseBonus: 1 },
  { id: "scout_patrol", name: "Long Range Scout Patrol", cost: 3000, type: "intel", description: "Send scouts deep into wasteland", defenseBonus: 1 },
  { id: "terrain_mapping", name: "Terrain Mapping", cost: 2000, type: "intel", description: "Detailed topographic survey of surrounding areas", defenseBonus: 1 },
  { id: "enemy_assessment", name: "Enemy Force Assessment", cost: 4000, type: "intel", description: "Estimate hostile force composition and strength", defenseBonus: 2 },

  { id: "artillery_drill", name: "Artillery Drill", cost: 3000, type: "training", description: "Live-fire exercise for artillery crews", defenseBonus: 2 },
  { id: "boot_camp_expansion", name: "Boot Camp Expansion", cost: 6000, type: "training", description: "Increase recruit training capacity", defenseBonus: 2 },
  { id: "officer_academy", name: "Officer Academy Course", cost: 8000, type: "training", description: "Advanced leadership training for officers", defenseBonus: 2 },
  { id: "combat_simulation", name: "Combat Simulation Drills", cost: 4000, type: "training", description: "VR-enhanced combat training scenarios", defenseBonus: 2 },
  { id: "urban_warfare_school", name: "Urban Warfare School", cost: 5000, type: "training", description: "Specialized training for city combat", defenseBonus: 3 },
  { id: "wasteland_survival", name: "Wasteland Survival Training", cost: 3500, type: "training", description: "Harsh environment survival skills", defenseBonus: 1 },

  { id: "cyber_warfare", name: "Cyber Warfare Ops", cost: 8000, type: "cyber", description: "Launch digital attacks on hostile networks", defenseBonus: 2 },
  { id: "emp_strike", name: "EMP Strike Planning", cost: 15000, type: "cyber", description: "Prepare electromagnetic pulse weapon", defenseBonus: 3 },
  { id: "network_hardening", name: "Network Hardening", cost: 6000, type: "cyber", description: "Strengthen city digital infrastructure against attack", defenseBonus: 3 },
  { id: "ai_warfare_suite", name: "AI Warfare Suite", cost: 12000, type: "cyber", description: "Deploy AI-driven autonomous combat systems", defenseBonus: 4 },
  { id: "data_warfare", name: "Data Warfare Division", cost: 7000, type: "cyber", description: "Corrupt enemy logistics and intelligence databases", defenseBonus: 2 },
  { id: "comm_jamming", name: "Communications Jamming", cost: 5000, type: "cyber", description: "Disrupt enemy radio and satellite comms", defenseBonus: 2 },

  { id: "propaganda_drop", name: "Propaganda Drop", cost: 1000, type: "special", description: "Leaflet drop over hostile territory", defenseBonus: 0 },
  { id: "sabotage_mission", name: "Sabotage Mission", cost: 7500, type: "special", description: "Infiltrate and disable enemy infrastructure", defenseBonus: 1 },
  { id: "recruit_mercenaries", name: "Recruit Mercenaries", cost: 15000, type: "special", description: "Hire freelance combatants", defenseBonus: 2 },
  { id: "assassination_protocol", name: "Assassination Protocol", cost: 20000, type: "special", description: "Targeted elimination of hostile leadership", defenseBonus: 1 },
  { id: "false_flag_op", name: "False Flag Operation", cost: 12000, type: "special", description: "Stage incident to provoke faction conflict", defenseBonus: 0 },
  { id: "dead_hand_protocol", name: "Dead Hand Protocol", cost: 50000, type: "special", description: "Automated retaliatory strike system", defenseBonus: 5 },

  { id: "arms_manufacturing", name: "Arms Manufacturing Push", cost: 6000, type: "logistics", description: "Increase weapons production", defenseBonus: 1 },
  { id: "ammo_stockpile", name: "Ammunition Stockpile", cost: 4000, type: "logistics", description: "Build emergency ammo reserves", defenseBonus: 1 },
  { id: "vehicle_refit", name: "Vehicle Refit Program", cost: 8000, type: "logistics", description: "Upgrade and repair military vehicles", defenseBonus: 2 },
  { id: "fuel_reserve", name: "Strategic Fuel Reserve", cost: 5000, type: "logistics", description: "Stockpile fuel for extended operations", defenseBonus: 1 },
  { id: "medical_corps", name: "Field Medical Corps", cost: 4500, type: "logistics", description: "Deploy mobile medical units to front lines", defenseBonus: 1 },
  { id: "supply_line_fortify", name: "Fortify Supply Lines", cost: 7000, type: "logistics", description: "Harden supply routes against interdiction", defenseBonus: 2 },
  { id: "war_factory_overdrive", name: "War Factory Overdrive", cost: 10000, type: "logistics", description: "Push military factories to maximum output", defenseBonus: 2 },

  { id: "siege_artillery", name: "Siege Artillery Deployment", cost: 18000, type: "siege", description: "Position heavy artillery for sustained bombardment", defenseBonus: 3 },
  { id: "tunnel_warfare", name: "Tunnel Warfare", cost: 9000, type: "siege", description: "Dig tunnels beneath enemy fortifications", defenseBonus: 2 },
  { id: "wall_breaker", name: "Wall Breaker Charges", cost: 12000, type: "siege", description: "Prepare demolition charges for fortification walls", defenseBonus: 2 },
  { id: "blockade_ops", name: "Blockade Operations", cost: 8000, type: "siege", description: "Cut off supply routes to hostile territory", defenseBonus: 2 },

  { id: "gunship_sortie", name: "Gunship Sortie", cost: 10000, type: "aerial", description: "Deploy attack helicopters on combat patrol", defenseBonus: 3 },
  { id: "bomber_strike", name: "Bomber Strike Package", cost: 20000, type: "aerial", description: "Coordinate heavy bomber attack on target", defenseBonus: 4 },
  { id: "air_superiority", name: "Air Superiority Mission", cost: 15000, type: "aerial", description: "Establish air dominance over combat zone", defenseBonus: 5 },
  { id: "cargo_drop", name: "Cargo Drop Operation", cost: 5000, type: "aerial", description: "Aerial resupply to isolated units", defenseBonus: 1 },
  { id: "drone_swarm", name: "Drone Swarm Attack", cost: 14000, type: "aerial", description: "Release autonomous combat drone swarm", defenseBonus: 4 },

  { id: "coastal_patrol", name: "Coastal Patrol", cost: 4000, type: "naval", description: "Monitor and defend waterway approaches", defenseBonus: 2 },
  { id: "river_blockade", name: "River Blockade", cost: 6000, type: "naval", description: "Block hostile waterway traffic", defenseBonus: 2 },
  { id: "amphibious_assault", name: "Amphibious Assault Plan", cost: 18000, type: "naval", description: "Plan waterborne troop insertion", defenseBonus: 3 },
  { id: "submarine_patrol", name: "Submarine Patrol", cost: 12000, type: "naval", description: "Deploy submersible units for deep-water surveillance", defenseBonus: 3 },
];

export const WAR_ROOM_OPS_MAP: Record<string, WarRoomOp> = {};
for (const op of WAR_ROOM_OPS) {
  WAR_ROOM_OPS_MAP[op.id] = op;
}

export const WAR_ROOM_OPS_COUNT_BY_TYPE: Record<string, number> = {};
for (const op of WAR_ROOM_OPS) {
  WAR_ROOM_OPS_COUNT_BY_TYPE[op.type] = (WAR_ROOM_OPS_COUNT_BY_TYPE[op.type] ?? 0) + 1;
}

export const WAR_OP_CATEGORY_COLORS: Record<WarOpCategory, string> = {
  defensive: "#00C8FF",
  offensive: "#FF3B30",
  intel: "#FF9500",
  training: "#00FF41",
  special: "#B855FF",
  logistics: "#FF9500",
  siege: "#FF6B6B",
  naval: "#4DA6FF",
  aerial: "#87CEEB",
  cyber: "#00FFCC",
};

export type OrdnanceCategory = "small_arms" | "heavy" | "explosives" | "missiles" | "vehicles" | "special";

export type OrdnanceItem = {
  id: string;
  name: string;
  category: OrdnanceCategory;
  quantity: number;
  costPerUnit: number;
  description: string;
};

export const ORDNANCE_CATEGORIES: Record<OrdnanceCategory, string> = {
  small_arms: "SMALL ARMS",
  heavy: "HEAVY WEAPONS",
  explosives: "EXPLOSIVES",
  missiles: "MISSILES & ROCKETS",
  vehicles: "VEHICLES",
  special: "SPECIAL ORDNANCE",
};

export const ORDNANCE_INVENTORY: OrdnanceItem[] = [
  { id: "rifle_rounds", name: "Standard Rifle Rounds", category: "small_arms", quantity: 50000, costPerUnit: 1, description: "7.62mm general-purpose ammunition" },
  { id: "ap_rounds", name: "Armor-Piercing Rounds", category: "small_arms", quantity: 10000, costPerUnit: 3, description: "Tungsten-core penetrator rounds" },
  { id: "energy_cells", name: "Energy Weapon Cells", category: "small_arms", quantity: 5000, costPerUnit: 10, description: "Rechargeable laser/plasma power cells" },
  { id: "shotgun_shells", name: "Shotgun Shells", category: "small_arms", quantity: 15000, costPerUnit: 2, description: "12-gauge buckshot and slug rounds" },
  { id: "smg_ammo", name: "SMG Ammunition", category: "small_arms", quantity: 30000, costPerUnit: 1, description: "9mm subsonic suppressed-compatible" },
  { id: "sniper_match", name: "Match-Grade Sniper Rounds", category: "small_arms", quantity: 2000, costPerUnit: 15, description: "Precision .338 Lapua Magnum" },

  { id: "hmg_belts", name: "HMG Belt Ammo", category: "heavy", quantity: 8000, costPerUnit: 5, description: "12.7mm heavy machine gun belt links" },
  { id: "autocannon_shells", name: "Autocannon Shells", category: "heavy", quantity: 3000, costPerUnit: 25, description: "30mm high-explosive dual-purpose" },
  { id: "railgun_slugs", name: "Railgun Slugs", category: "heavy", quantity: 500, costPerUnit: 200, description: "Hypersonic electromagnetic projectiles" },
  { id: "minigun_ammo", name: "Minigun Ammo Drums", category: "heavy", quantity: 12000, costPerUnit: 3, description: "7.62mm high-speed rotary barrels" },

  { id: "frag_grenades", name: "Fragmentation Grenades", category: "explosives", quantity: 5000, costPerUnit: 20, description: "Standard anti-personnel fragmentation" },
  { id: "flashbangs", name: "Flashbang Grenades", category: "explosives", quantity: 3000, costPerUnit: 15, description: "Non-lethal stun grenades" },
  { id: "demo_charges", name: "Demolition Charges", category: "explosives", quantity: 500, costPerUnit: 100, description: "C-8 plastic explosive charges" },
  { id: "incendiary_bombs", name: "Incendiary Bombs", category: "explosives", quantity: 1000, costPerUnit: 50, description: "Thermite-based area denial weapons" },
  { id: "emp_devices", name: "EMP Grenades", category: "explosives", quantity: 200, costPerUnit: 500, description: "Electromagnetic pulse devices" },

  { id: "atgm", name: "Anti-Tank Guided Missiles", category: "missiles", quantity: 300, costPerUnit: 2000, description: "Wire-guided anti-armor missiles" },
  { id: "sam", name: "Surface-to-Air Missiles", category: "missiles", quantity: 150, costPerUnit: 5000, description: "Heat-seeking anti-aircraft missiles" },
  { id: "cruise_missiles", name: "Cruise Missiles", category: "missiles", quantity: 25, costPerUnit: 50000, description: "Long-range precision strike weapons" },
  { id: "rocket_pods", name: "Unguided Rocket Pods", category: "missiles", quantity: 800, costPerUnit: 500, description: "70mm FFAR rocket pods for gunships" },
  { id: "tactical_nukes", name: "Tactical Nuclear Warheads", category: "missiles", quantity: 3, costPerUnit: 500000, description: "Low-yield battlefield nuclear weapons" },
  { id: "icbm", name: "ICBM Warheads", category: "missiles", quantity: 1, costPerUnit: 2000000, description: "Intercontinental ballistic missile" },

  { id: "apcs_stock", name: "APC Units", category: "vehicles", quantity: 12, costPerUnit: 50000, description: "Armored personnel carriers" },
  { id: "tanks_stock", name: "Main Battle Tanks", category: "vehicles", quantity: 6, costPerUnit: 200000, description: "Heavy armored fighting vehicles" },
  { id: "gunships_stock", name: "Attack Gunships", category: "vehicles", quantity: 4, costPerUnit: 350000, description: "Armed rotary-wing aircraft" },
  { id: "mechs_stock", name: "Mech Walkers", category: "vehicles", quantity: 2, costPerUnit: 1000000, description: "Bipedal combat exoskeletons" },
  { id: "drones_stock", name: "Combat Drones", category: "vehicles", quantity: 50, costPerUnit: 15000, description: "Autonomous aerial combat drones" },

  { id: "chem_shells", name: "Chemical Warheads", category: "special", quantity: 10, costPerUnit: 100000, description: "Nerve agent delivery munitions" },
  { id: "bio_canisters", name: "Biological Canisters", category: "special", quantity: 5, costPerUnit: 250000, description: "Engineered pathogen dispersal units" },
  { id: "plasma_charges", name: "Plasma Charges", category: "special", quantity: 20, costPerUnit: 75000, description: "Experimental plasma detonation devices" },
  { id: "gravity_bombs", name: "Gravity Bombs", category: "special", quantity: 3, costPerUnit: 1500000, description: "Localized gravitational anomaly weapons" },
];

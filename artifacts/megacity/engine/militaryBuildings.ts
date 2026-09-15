export type MilitaryBuildingCategory = "command" | "training" | "manufacturing" | "research" | "logistics" | "defense" | "security" | "aerospace" | "naval" | "special_projects";

export type MilitaryBuildingDef = {
  id: string;
  name: string;
  category: MilitaryBuildingCategory;
  description: string;
  buildCost: number;
  upkeep: number;
  personnel: number;
  defenseBonus: number;
  academy?: {
    role: "military" | "security" | "intelligence" | "emergency" | "specialist";
    capacity: number;
    courseIds: string[];
    prerequisiteTechnologies: string[];
    prerequisiteBuildings: string[];
  };
};

export const MILITARY_BUILDING_CATEGORIES: Record<MilitaryBuildingCategory, string> = {
  command: "COMMAND INFRASTRUCTURE",
  training: "TRAINING FACILITIES",
  manufacturing: "MANUFACTURING",
  research: "RESEARCH",
  logistics: "LOGISTICS",
  defense: "DEFENSE",
  security: "SECURITY",
  aerospace: "AEROSPACE",
  naval: "NAVAL",
  special_projects: "SPECIAL PROJECTS",
};

export const MILITARY_BUILDINGS: MilitaryBuildingDef[] = [
  { id: "military_hq", name: "Military Headquarters", category: "command", description: "Where the war is run. Bunker beneath. Coffee always hot.", buildCost: 50000, upkeep: 2000, personnel: 200, defenseBonus: 5 },
  { id: "strategic_war_room", name: "Strategic War Room", category: "command", description: "Maps on every wall. Pins for the dead. The pins outnumber the survivors.", buildCost: 35000, upkeep: 1500, personnel: 50, defenseBonus: 3 },
  { id: "intelligence_directorate", name: "Intelligence Directorate", category: "command", description: "Where rumors become files. Files become orders. Orders become bodies.", buildCost: 40000, upkeep: 1800, personnel: 100, defenseBonus: 2 },
  { id: "tactical_command_center", name: "Tactical Command Center", category: "command", description: "Every battlefield, one screen at a time. Operators rotate every six hours.", buildCost: 30000, upkeep: 1200, personnel: 80, defenseBonus: 4 },
  { id: "battlefield_sim_lab", name: "Battlefield Simulation Lab", category: "command", description: "Wargame the next war. Lose the simulation. Adjust the doctrine.", buildCost: 25000, upkeep: 1000, personnel: 40, defenseBonus: 1 },
  { id: "infantry_training_grounds", name: "Infantry Training Grounds", category: "training", description: "Mud, marches, and obstacle courses. Eight weeks. Then the real thing.", buildCost: 15000, upkeep: 600, personnel: 150, defenseBonus: 1 },
  { id: "vehicle_training_range", name: "Vehicle Training Range", category: "training", description: "Where rookies learn that tanks run out of fuel. Then learn it again.", buildCost: 20000, upkeep: 800, personnel: 80, defenseBonus: 1 },
  { id: "urban_combat_facility", name: "Urban Combat Training Facility", category: "training", description: "A fake city for practicing the real one. Each room kills someone in theory.", buildCost: 22000, upkeep: 900, personnel: 100, defenseBonus: 1 },
  { id: "special_forces_compound", name: "Special Forces Training Compound", category: "training", description: "One in twenty finishes. The rest go back to the regular army quieter than they came.", buildCost: 30000, upkeep: 1200, personnel: 60, defenseBonus: 2 },
  { id: "drone_pilot_academy", name: "Drone Pilot Academy", category: "training", description: "Pilots fly missions from a chair. Sleep in their own bed. Wake up screaming anyway.", buildCost: 18000, upkeep: 700, personnel: 50, defenseBonus: 1 },
  { id: "ammunition_factory", name: "Ammunition Factory", category: "manufacturing", description: "Three shifts. Six days. Output measured in tons. Workers measured in fingers.", buildCost: 25000, upkeep: 1000, personnel: 120, defenseBonus: 0 },
  { id: "weapon_assembly_plant", name: "Weapon Assembly Plant", category: "manufacturing", description: "Each rifle test-fired at a paper torso. The torsos are recycled.", buildCost: 30000, upkeep: 1200, personnel: 150, defenseBonus: 0 },
  { id: "missile_production_facility", name: "Missile Production Facility", category: "manufacturing", description: "Welds the warheads. Wires the seekers. Ships them in unmarked crates.", buildCost: 45000, upkeep: 1800, personnel: 100, defenseBonus: 0 },
  { id: "rocket_engine_factory", name: "Rocket Engine Factory", category: "manufacturing", description: "Builds the fire that pushes the bomb. Test fires shake windows three sectors over.", buildCost: 40000, upkeep: 1600, personnel: 90, defenseBonus: 0 },
  { id: "warhead_manufacturing_lab", name: "Warhead Manufacturing Lab", category: "manufacturing", description: "Where payloads come from. Workers wear three badges. None of them are name tags.", buildCost: 50000, upkeep: 2000, personnel: 80, defenseBonus: 0 },
  { id: "military_tech_lab", name: "Military Technology Lab", category: "research", description: "White coats. Black projects. Long hours.", buildCost: 35000, upkeep: 1400, personnel: 60, defenseBonus: 1 },
  { id: "ballistics_research", name: "Ballistics Research Center", category: "research", description: "Studies what bullets do to plate. Then what plate does to bullets. Iterates.", buildCost: 28000, upkeep: 1100, personnel: 40, defenseBonus: 1 },
  { id: "drone_warfare_institute", name: "Drone Warfare Institute", category: "research", description: "Teaches machines to choose targets. The machines learn fast.", buildCost: 32000, upkeep: 1300, personnel: 50, defenseBonus: 1 },
  { id: "energy_weapons_lab", name: "Energy Weapons Laboratory", category: "research", description: "Lasers, masers, and questions about funding. Mostly funding.", buildCost: 45000, upkeep: 1800, personnel: 40, defenseBonus: 1 },
  { id: "experimental_weapons_facility", name: "Experimental Weapons Facility", category: "research", description: "What lives behind the third fence. Visitors sign three NDAs and walk back through a scrubber.", buildCost: 60000, upkeep: 2500, personnel: 30, defenseBonus: 2 },
  { id: "military_supply_depot", name: "Military Supply Depot", category: "logistics", description: "Concrete acres. Forklifts at midnight. The clipboard never sleeps.", buildCost: 12000, upkeep: 500, personnel: 60, defenseBonus: 0 },
  { id: "fuel_storage_complex", name: "Fuel Storage Complex", category: "logistics", description: "Tanks the size of buildings. One spark away from a national emergency.", buildCost: 15000, upkeep: 600, personnel: 30, defenseBonus: 0 },
  { id: "armored_vehicle_depot", name: "Armored Vehicle Depot", category: "logistics", description: "Where the tanks sleep. Mechanics swear at each one by name.", buildCost: 20000, upkeep: 800, personnel: 70, defenseBonus: 1 },
  { id: "ammunition_bunker", name: "Ammunition Bunker", category: "logistics", description: "Hardened ammunition storage facility.", buildCost: 18000, upkeep: 700, personnel: 20, defenseBonus: 1 },
  { id: "transport_command_hub", name: "Transport Command Hub", category: "logistics", description: "Military logistics coordination center.", buildCost: 22000, upkeep: 900, personnel: 80, defenseBonus: 0 },
  { id: "missile_defense_battery", name: "Missile Defense Battery", category: "defense", description: "Anti-missile interceptor launch platform.", buildCost: 40000, upkeep: 1600, personnel: 40, defenseBonus: 8 },
  { id: "anti_air_defense_tower", name: "Anti-Air Defense Tower", category: "defense", description: "Automated anti-aircraft weapon systems.", buildCost: 25000, upkeep: 1000, personnel: 30, defenseBonus: 6 },
  { id: "artillery_battery", name: "Artillery Battery", category: "defense", description: "Sees nothing. Hits everything. Ears bleed by the third salvo.", buildCost: 30000, upkeep: 1200, personnel: 50, defenseBonus: 7 },
  { id: "radar_installation", name: "Radar Installation", category: "defense", description: "The dish never stops turning. Operators stop noticing the hum after a week.", buildCost: 20000, upkeep: 800, personnel: 20, defenseBonus: 4 },
  { id: "early_warning_station", name: "Early Warning Station", category: "defense", description: "Watches for the launch that ends everything. Hopes to retire bored.", buildCost: 22000, upkeep: 900, personnel: 25, defenseBonus: 5 },
  { id: "military_prison", name: "Military Prison", category: "security", description: "Steel doors. No windows. Sentences measured in regimes.", buildCost: 18000, upkeep: 700, personnel: 80, defenseBonus: 1 },
  { id: "interrogation_facility", name: "Interrogation Facility", category: "security", description: "Soundproof rooms. Bright lights. Everyone talks eventually.", buildCost: 15000, upkeep: 600, personnel: 30, defenseBonus: 1 },
  { id: "tactical_response_base", name: "Tactical Response Base", category: "security", description: "Boots ready, engines warm. Twelve minutes from siren to wheels-up.", buildCost: 20000, upkeep: 800, personnel: 100, defenseBonus: 3 },
  { id: "riot_suppression_armory", name: "Riot Suppression Armory", category: "security", description: "Batons, gas, plastic shields. Inventory grows every quarter.", buildCost: 10000, upkeep: 400, personnel: 20, defenseBonus: 1 },
  { id: "military_airfield", name: "Military Airfield", category: "aerospace", description: "Concrete runway. Fueled and armed. The sky is half a war zone.", buildCost: 45000, upkeep: 1800, personnel: 150, defenseBonus: 5 },
  { id: "drone_launch_base", name: "Drone Launch Base", category: "aerospace", description: "No pilots in the cockpits. No coffins in the hangar.", buildCost: 25000, upkeep: 1000, personnel: 40, defenseBonus: 4 },
  { id: "missile_silo_complex", name: "Missile Silo Complex", category: "aerospace", description: "Concrete tubes a hundred meters deep. Each one ends a country.", buildCost: 80000, upkeep: 3000, personnel: 60, defenseBonus: 10 },
  { id: "space_launch_platform", name: "Space Launch Platform", category: "aerospace", description: "Rockets up. Payloads classified. The neighbors stopped asking years ago.", buildCost: 100000, upkeep: 4000, personnel: 200, defenseBonus: 6 },
  { id: "orbital_defense_command", name: "Orbital Defense Command", category: "aerospace", description: "Tracks every object in low orbit. Decides which ones get to stay.", buildCost: 120000, upkeep: 5000, personnel: 100, defenseBonus: 12 },
  { id: "naval_dockyard", name: "Naval Dockyard", category: "naval", description: "Hulls in dry dock. Welders on three shifts. The tide doesn't wait.", buildCost: 60000, upkeep: 2400, personnel: 200, defenseBonus: 4 },
  { id: "submarine_base", name: "Submarine Base", category: "naval", description: "Boats slip in. Boats slip out. Nobody outside knows the schedule.", buildCost: 70000, upkeep: 2800, personnel: 120, defenseBonus: 6 },
  { id: "coastal_defense_battery", name: "Coastal Defense Battery", category: "naval", description: "Watches the horizon. Sinks anything that crosses the line.", buildCost: 35000, upkeep: 1400, personnel: 50, defenseBonus: 7 },
  { id: "nuclear_weapons_lab", name: "Nuclear Weapons Laboratory", category: "special_projects", description: "White rooms. Lead walls. Three signatures per door. Nobody hurries.", buildCost: 150000, upkeep: 6000, personnel: 50, defenseBonus: 3 },
  { id: "hazard_containment_facility", name: "Hazard Containment Facility", category: "special_projects", description: "Concrete vaults for the things that shouldn't exist. Ledger tracks every gram.", buildCost: 40000, upkeep: 1600, personnel: 40, defenseBonus: 1 },
  { id: "cyber_warfare_center", name: "Cyber Warfare Center", category: "special_projects", description: "Open laptops. Closed mouths. Wars fought in seven keystrokes.", buildCost: 35000, upkeep: 1400, personnel: 60, defenseBonus: 3 },
  { id: "electronic_warfare_station", name: "Electronic Warfare Station", category: "special_projects", description: "Owns the airwaves. Their radios stop working when ours start.", buildCost: 30000, upkeep: 1200, personnel: 40, defenseBonus: 4 },
  { id: "autonomous_weapons_factory", name: "Autonomous Weapons Factory", category: "special_projects", description: "Robots build robots that build the killing kind. Nobody tours this floor.", buildCost: 55000, upkeep: 2200, personnel: 30, defenseBonus: 2 },
  { id: "experimental_vehicle_hangar", name: "Experimental Vehicle Hangar", category: "special_projects", description: "Tomorrow's tanks. Half never leave. The other half come back with stories.", buildCost: 45000, upkeep: 1800, personnel: 50, defenseBonus: 1 },
  { id: "military_ai_control_center", name: "Military AI Control Center", category: "special_projects", description: "The machines call the shots here. The humans nod and sign things.", buildCost: 65000, upkeep: 2600, personnel: 40, defenseBonus: 5 },
  { id: "strategic_defense_grid_hub", name: "Strategic Defense Grid Hub", category: "special_projects", description: "Sees every threat at once. Sleeps never. Failures are catastrophic.", buildCost: 80000, upkeep: 3200, personnel: 60, defenseBonus: 10 },
  { id: "combined_arms_academy", name: "Combined Arms Academy", category: "training", description: "Officer-led command training for coordinated infantry, armor, and support formations.", buildCost: 68000, upkeep: 1800, personnel: 70, defenseBonus: 2, academy: { role: "military", capacity: 24, courseIds: ["combined_arms_command"], prerequisiteTechnologies: ["mil_military_academies", "mil_urban_warfare_doctrine"], prerequisiteBuildings: ["infantry_training_grounds"] } },
  { id: "security_command_academy", name: "Security Command Academy", category: "security", description: "Qualifies commanders for city security, incident response, and lawful force deployment.", buildCost: 58000, upkeep: 1500, personnel: 60, defenseBonus: 2, academy: { role: "security", capacity: 20, courseIds: ["security_operations"], prerequisiteTechnologies: ["mil_military_academies", "mil_military_communications"], prerequisiteBuildings: ["tactical_response_base"] } },
  { id: "intelligence_analysis_academy", name: "Intelligence Analysis Academy", category: "research", description: "Trains analysts to turn field reports, signals, and reconnaissance into usable command decisions.", buildCost: 72000, upkeep: 1900, personnel: 45, defenseBonus: 1, academy: { role: "intelligence", capacity: 16, courseIds: ["intelligence_analysis"], prerequisiteTechnologies: ["mil_military_academies", "mil_military_communications"], prerequisiteBuildings: ["intelligence_directorate"] } },
  { id: "emergency_response_academy", name: "Emergency Response Academy", category: "logistics", description: "Cross-trains medical, rescue, and logistics officers for disaster mobilization.", buildCost: 52000, upkeep: 1300, personnel: 50, defenseBonus: 1, academy: { role: "emergency", capacity: 18, courseIds: ["emergency_response"], prerequisiteTechnologies: ["mil_military_academies", "mil_field_hospitals"], prerequisiteBuildings: ["military_supply_depot"] } },
  { id: "specialist_operations_academy", name: "Specialist Operations Academy", category: "special_projects", description: "High-risk qualification pipeline for specialist and special-operations leadership.", buildCost: 95000, upkeep: 2400, personnel: 35, defenseBonus: 3, academy: { role: "specialist", capacity: 10, courseIds: ["specialist_operations"], prerequisiteTechnologies: ["mil_military_academies", "mil_special_forces_training"], prerequisiteBuildings: ["special_forces_compound"] } },
];

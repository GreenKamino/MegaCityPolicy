export type MineralType = "gas" | "oil" | "iron" | "copper" | "titanium" | "uranium" | "lithium" | "rare-earth";

export type MiningSiteDef = {
  id: string;
  name: string;
  resourceType: MineralType;
  baseOutput: number;
  setupCost: number;
  workersNeeded: number;
  depositSize: number;
  description: string;
};

export type MiningVehicleDef = {
  id: string;
  name: string;
  cost: number;
  efficiency: number;
  description: string;
};

export type MiningJobDef = {
  id: string;
  name: string;
  wage: number;
  skill: string;
  description: string;
};

export type MiningPolicyDef = {
  id: string;
  name: string;
  cost: number;
  effect: string;
  description: string;
};

export const MINERAL_LABELS: Record<MineralType, string> = {
  gas: "Natural Gas",
  oil: "Crude Oil",
  iron: "Iron Ore",
  copper: "Copper",
  titanium: "Titanium",
  uranium: "Uranium",
  lithium: "Lithium",
  "rare-earth": "Rare Earth Elements",
};

export const MINERAL_COLORS: Record<MineralType, string> = {
  gas: "#87CEEB",
  oil: "#2F2F2F",
  iron: "#B87333",
  copper: "#FF9500",
  titanium: "#C0C0C0",
  uranium: "#00FF41",
  lithium: "#4DA6FF",
  "rare-earth": "#B855FF",
};

export const MINING_SITES: MiningSiteDef[] = [
  { id: "gas_field_alpha", name: "Alpha Gas Field", resourceType: "gas", baseOutput: 50, setupCost: 15000, workersNeeded: 20, depositSize: 100000, description: "Shallow gas deposit in sector 7 wasteland" },
  { id: "gas_deep_well", name: "Deep Well Extraction", resourceType: "gas", baseOutput: 120, setupCost: 45000, workersNeeded: 40, depositSize: 500000, description: "High-pressure deep gas reservoir" },
  { id: "gas_landfill_capture", name: "Landfill Methane Capture", resourceType: "gas", baseOutput: 30, setupCost: 8000, workersNeeded: 10, depositSize: 999999, description: "Tap centuries of buried refuse — the dump never stops giving" },
  { id: "gas_shale_fracture", name: "Shale Fracture Site", resourceType: "gas", baseOutput: 95, setupCost: 38000, workersNeeded: 35, depositSize: 350000, description: "High-pressure fracking through brittle shale; tremors guaranteed" },
  { id: "gas_thermal_vent", name: "Geothermal Vent Tap", resourceType: "gas", baseOutput: 70, setupCost: 28000, workersNeeded: 25, depositSize: 220000, description: "Volcanic vent leaks methane and worse from the mantle line" },
  { id: "oil_refinery_east", name: "Eastern Oil Pocket", resourceType: "oil", baseOutput: 80, setupCost: 25000, workersNeeded: 30, depositSize: 250000, description: "Oil deposit near eastern wall perimeter" },
  { id: "oil_tar_sands", name: "Tar Sands Operation", resourceType: "oil", baseOutput: 200, setupCost: 80000, workersNeeded: 60, depositSize: 800000, description: "Massive tar sands requiring heavy processing" },
  { id: "oil_wreck_salvage", name: "Tanker Graveyard Salvage", resourceType: "oil", baseOutput: 45, setupCost: 12000, workersNeeded: 18, depositSize: 999999, description: "Bleed crude from rusted-out hulls grounded in the harbor flats" },
  { id: "oil_offshore_platform", name: "Offshore Drilling Platform", resourceType: "oil", baseOutput: 160, setupCost: 95000, workersNeeded: 70, depositSize: 600000, description: "Reactivated pre-Collapse rig; corrosion eats the catwalks" },
  { id: "oil_shale_extraction", name: "Shale Oil Retort", resourceType: "oil", baseOutput: 110, setupCost: 50000, workersNeeded: 45, depositSize: 400000, description: "Cook kerogen out of shale — slow, hot, and the air goes black" },
  { id: "iron_openpit", name: "Open Pit Iron Mine", resourceType: "iron", baseOutput: 100, setupCost: 20000, workersNeeded: 50, depositSize: 400000, description: "Surface-level iron ore deposit" },
  { id: "iron_deep_shaft", name: "Deep Shaft Mine", resourceType: "iron", baseOutput: 180, setupCost: 60000, workersNeeded: 80, depositSize: 700000, description: "Underground iron ore extraction facility" },
  { id: "copper_vein", name: "Copper Vein Extraction", resourceType: "copper", baseOutput: 60, setupCost: 18000, workersNeeded: 25, depositSize: 150000, description: "Rich copper vein in northern wastes" },
  { id: "copper_recycling", name: "Copper Recycling Plant", resourceType: "copper", baseOutput: 40, setupCost: 10000, workersNeeded: 15, depositSize: 999999, description: "Recover copper from urban waste streams" },
  { id: "titanium_mine", name: "Titanium Strip Mine", resourceType: "titanium", baseOutput: 30, setupCost: 50000, workersNeeded: 40, depositSize: 100000, description: "Scarce titanium deposits in irradiated zone" },
  { id: "titanium_asteroid", name: "Crash Site Salvage", resourceType: "titanium", baseOutput: 15, setupCost: 25000, workersNeeded: 20, depositSize: 50000, description: "Recover titanium from orbital debris impact" },
  { id: "uranium_deposit", name: "Uranium Mine", resourceType: "uranium", baseOutput: 10, setupCost: 100000, workersNeeded: 30, depositSize: 50000, description: "Highly regulated uranium extraction" },
  { id: "uranium_reprocessing", name: "Nuclear Reprocessing", resourceType: "uranium", baseOutput: 5, setupCost: 150000, workersNeeded: 20, depositSize: 999999, description: "Reprocess spent nuclear fuel rods" },
  { id: "lithium_brine", name: "Lithium Brine Pool", resourceType: "lithium", baseOutput: 25, setupCost: 35000, workersNeeded: 15, depositSize: 200000, description: "Extract lithium from underground brine" },
  { id: "lithium_hardrock", name: "Hard Rock Lithium Mine", resourceType: "lithium", baseOutput: 40, setupCost: 55000, workersNeeded: 35, depositSize: 300000, description: "Traditional lithium ore mining" },
  { id: "rare_earth_pit", name: "Rare Earth Open Pit", resourceType: "rare-earth", baseOutput: 8, setupCost: 75000, workersNeeded: 50, depositSize: 80000, description: "Open pit mining for rare earth elements" },
  { id: "rare_earth_recycling", name: "E-Waste Rare Earth Recovery", resourceType: "rare-earth", baseOutput: 5, setupCost: 40000, workersNeeded: 20, depositSize: 999999, description: "Extract rare earths from electronic waste" },
];

export const MINING_VEHICLES: MiningVehicleDef[] = [
  { id: "excavator", name: "Heavy Excavator", cost: 25000, efficiency: 15, description: "Large hydraulic digging machine" },
  { id: "drill_rig", name: "Rotary Drill Rig", cost: 40000, efficiency: 20, description: "Deep-bore drilling platform" },
  { id: "haul_truck", name: "Mining Haul Truck", cost: 15000, efficiency: 10, description: "200-ton capacity ore hauler" },
  { id: "loader", name: "Front-End Loader", cost: 12000, efficiency: 8, description: "Rapid material loading vehicle" },
  { id: "crusher_mobile", name: "Mobile Crusher", cost: 35000, efficiency: 12, description: "On-site ore crushing unit" },
  { id: "conveyor_system", name: "Automated Conveyor", cost: 20000, efficiency: 18, description: "Long-range material transport belt" },
  { id: "survey_drone", name: "Survey Drone Fleet", cost: 8000, efficiency: 5, description: "Autonomous geological survey drones" },
  { id: "bore_mech", name: "Bore Mech Walker", cost: 80000, efficiency: 30, description: "Bipedal mining mech for hazardous terrain" },
];

export const MINING_JOBS: MiningJobDef[] = [
  { id: "miner", name: "Miner", wage: 50, skill: "manual_labor", description: "General extraction worker" },
  { id: "drill_operator", name: "Drill Operator", wage: 80, skill: "machinery", description: "Operates heavy drilling equipment" },
  { id: "blaster", name: "Demolitions Expert", wage: 100, skill: "explosives", description: "Rock blasting and controlled demolition" },
  { id: "geologist", name: "Field Geologist", wage: 120, skill: "geology", description: "Surveys and assesses mineral deposits" },
  { id: "refinery_tech", name: "Refinery Technician", wage: 90, skill: "chemistry", description: "Processes raw ore into usable materials" },
  { id: "safety_officer", name: "Mine Safety Officer", wage: 85, skill: "safety", description: "Ensures compliance with safety protocols" },
  { id: "transport_driver", name: "Haul Driver", wage: 60, skill: "driving", description: "Operates heavy transport vehicles" },
  { id: "maintenance_eng", name: "Maintenance Engineer", wage: 110, skill: "engineering", description: "Keeps mining equipment operational" },
];

export const MINING_POLICIES: MiningPolicyDef[] = [
  { id: "strip_mining", name: "Strip Mining Authorization", cost: 5000, effect: "+20% output, +pollution", description: "Allow aggressive surface mining techniques" },
  { id: "deep_bore", name: "Deep Bore Protocol", cost: 8000, effect: "Unlock deep deposits", description: "Authorize drilling below safe depth limits" },
  { id: "worker_safety", name: "Enhanced Worker Safety", cost: 3000, effect: "-10% output, -accidents", description: "Mandatory safety equipment and training" },
  { id: "overtime_mandate", name: "Overtime Mandate", cost: 2000, effect: "+15% output, -happiness", description: "Require extended shift operations" },
  { id: "automated_ops", name: "Automated Operations", cost: 15000, effect: "-50% workers, same output", description: "Replace workers with autonomous systems" },
  { id: "hazard_pay", name: "Hazard Pay Program", cost: 4000, effect: "+happiness, +wage costs", description: "Premium pay for dangerous conditions" },
  { id: "reclamation_tax", name: "Reclamation Tax", cost: 0, effect: "+2000 CR/tick, -loyalty", description: "Tax mining operations for city coffers" },
  { id: "eco_mining", name: "Eco-Mining Standards", cost: 6000, effect: "-5% output, +reputation", description: "Environmentally responsible extraction" },
  { id: "black_market_ore", name: "Black Market Ore Sales", cost: 0, effect: "+credits, +crime, +corruption", description: "Sell ore through unofficial channels" },
  { id: "military_priority", name: "Military Priority Allocation", cost: 3000, effect: "Military gets first access to minerals", description: "Reserve key minerals for military use" },
];

export type MiningEventType = "rich_vein" | "cave_in" | "equipment_failure" | "artifact_found" | "gas_pocket" | "worker_strike" | "efficiency_boost" | "toxic_leak";

export type MiningEventDef = {
  type: MiningEventType;
  title: string;
  description: string;
  severity: "positive" | "neutral" | "negative" | "critical";
  effects: {
    outputMult?: number;
    efficiencyDelta?: number;
    depositBonus?: number;
    creditsDelta?: number;
    workerLoss?: number;
    shutdownTicks?: number;
  };
};

export const MINING_EVENT_TEMPLATES: MiningEventDef[] = [
  { type: "rich_vein", title: "RICH VEIN DISCOVERED", description: "Geological survey team has identified a dense mineral seam adjacent to current operations. Estimated 40% yield increase.", severity: "positive", effects: { outputMult: 1.4, depositBonus: 20000 } },
  { type: "cave_in", title: "TUNNEL COLLAPSE", description: "Section 7-B has experienced a catastrophic structural failure. Three crew members are trapped. Emergency rescue underway.", severity: "critical", effects: { efficiencyDelta: -25, workerLoss: 3, shutdownTicks: 8 } },
  { type: "equipment_failure", title: "DRILL RIG MALFUNCTION", description: "Primary bore assembly has seized. Maintenance engineers are fabricating replacement parts from salvage.", severity: "negative", effects: { efficiencyDelta: -15, creditsDelta: -2000 } },
  { type: "artifact_found", title: "PRE-COLLAPSE ARTIFACT", description: "Workers unearthed a sealed vault from before the Collapse. Contents include intact data drives and preserved technology samples.", severity: "positive", effects: { creditsDelta: 8000 } },
  { type: "gas_pocket", title: "PRESSURIZED GAS POCKET", description: "Drill team breached a high-pressure methane pocket. Operations halted for safety assessment. Potential gas extraction opportunity.", severity: "neutral", effects: { efficiencyDelta: -10, depositBonus: 15000 } },
  { type: "worker_strike", title: "WILDCAT STRIKE", description: "Mine workers are demanding hazard pay increases. Production halted until management responds.", severity: "negative", effects: { outputMult: 0, shutdownTicks: 4, creditsDelta: -3000 } },
  { type: "efficiency_boost", title: "PROCESS OPTIMIZATION", description: "New extraction algorithm has been implemented by the engineering team. Throughput improved significantly.", severity: "positive", effects: { efficiencyDelta: 20 } },
  { type: "toxic_leak", title: "TOXIC RUNOFF DETECTED", description: "Environmental sensors detect dangerous chemical concentrations in drainage systems. Containment protocols activated.", severity: "critical", effects: { efficiencyDelta: -20, creditsDelta: -5000, shutdownTicks: 6 } },
];

export type SurveyResult = {
  title: string;
  description: string;
  outcome: "rich_deposit" | "nothing" | "hazard" | "artifact" | "new_vein";
  effects: {
    depositBonus?: number;
    creditsDelta?: number;
    efficiencyDelta?: number;
    outputBonus?: number;
  };
};

export const SURVEY_OUTCOMES: SurveyResult[] = [
  { title: "MASSIVE DEPOSIT DETECTED", description: "Deep-penetrating sonar reveals a previously uncharted mineral formation. Estimated reserves: enormous.", outcome: "rich_deposit", effects: { depositBonus: 50000 } },
  { title: "SECONDARY VEIN LOCATED", description: "Survey team has identified a secondary mineral vein running parallel to main extraction path.", outcome: "new_vein", effects: { depositBonus: 25000, outputBonus: 15 } },
  { title: "ANCIENT TECH CACHE", description: "Ground-penetrating radar detected a sealed chamber. Contains pre-Collapse mining equipment in working condition.", outcome: "artifact", effects: { creditsDelta: 5000, efficiencyDelta: 10 } },
  { title: "UNSTABLE GEOLOGY", description: "Survey reveals dangerous fault lines beneath the operation. Additional reinforcement will be required.", outcome: "hazard", effects: { efficiencyDelta: -10, creditsDelta: -2000 } },
  { title: "NOTHING OF NOTE", description: "Survey complete. No significant geological features detected beyond known deposits.", outcome: "nothing", effects: {} },
  { title: "NOTHING OF NOTE", description: "Standard geological profile confirmed. No new opportunities identified at this time.", outcome: "nothing", effects: {} },
  { title: "MINERAL TRACES", description: "Faint mineral signatures detected at extreme depth. Not economically viable with current equipment.", outcome: "nothing", effects: { depositBonus: 5000 } },
];

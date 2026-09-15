import type { Officer } from "@/engine/types";
import type { MilitaryAcademyState } from "@/engine/militaryAcademies";

export type MilitaryPolicyDef = {
  id: string;
  name: string;
  description: string;
  category: "conscription" | "engagement" | "logistics" | "doctrine" | "budget";
  effects: {
    unrest?: number;
    happiness?: number;
    defenseRating?: number;
    creditsDrain?: number;
    recruitRate?: number;
    casualtyMod?: number;
    ammoDrain?: number;
    fuelDrain?: number;
    moraleMod?: number;
    populationDrain?: number;
  };
  exclusive?: string[];
};

export const MILITARY_POLICIES: MilitaryPolicyDef[] = [
  {
    id: "conscription_volunteer",
    name: "VOLUNTEER ENLISTMENT",
    description: "Citizens serve willingly. Slow recruitment, high morale. Keeps the peace.",
    category: "conscription",
    effects: { recruitRate: 1, moraleMod: 1.2, happiness: 0 },
    exclusive: ["conscription_mandatory", "conscription_emergency"],
  },
  {
    id: "conscription_mandatory",
    name: "MANDATORY SERVICE",
    description: "All citizens serve 2-year terms. Steady flow of warm bodies. Steady flow of complaints.",
    category: "conscription",
    effects: { recruitRate: 3, moraleMod: 0.9, happiness: -2, unrest: 2, populationDrain: 50 },
    exclusive: ["conscription_volunteer", "conscription_emergency"],
  },
  {
    id: "conscription_emergency",
    name: "EMERGENCY DRAFT",
    description: "Press-gang every able body. Fills ranks fast. Empties streets faster. Morale is optional.",
    category: "conscription",
    effects: { recruitRate: 8, moraleMod: 0.5, happiness: -6, unrest: 8, populationDrain: 200 },
    exclusive: ["conscription_volunteer", "conscription_mandatory"],
  },
  {
    id: "roe_restrained",
    name: "RESTRAINED ROE",
    description: "Minimum force. Officers hate it. Citizens appreciate not being shot.",
    category: "engagement",
    effects: { casualtyMod: 0.7, happiness: 2, unrest: -1, defenseRating: -2 },
    exclusive: ["roe_standard", "roe_unrestricted"],
  },
  {
    id: "roe_standard",
    name: "STANDARD ROE",
    description: "Proportional response. The default. Nobody's happy, nobody's dead. Usually.",
    category: "engagement",
    effects: { casualtyMod: 1.0 },
    exclusive: ["roe_restrained", "roe_unrestricted"],
  },
  {
    id: "roe_unrestricted",
    name: "UNRESTRICTED ROE",
    description: "Weapons free. Maximum lethality. Effective. Controversial. Popular with the troops.",
    category: "engagement",
    effects: { casualtyMod: 1.5, defenseRating: 3, happiness: -3, unrest: 3 },
    exclusive: ["roe_restrained", "roe_standard"],
  },
  {
    id: "patrol_intensity_high",
    name: "HIGH PATROL INTENSITY",
    description: "Boots on every corner. Fuel and ammo drain increases. Crime decreases. Sleep is for civilians.",
    category: "logistics",
    effects: { ammoDrain: 5, fuelDrain: 3, defenseRating: 2, unrest: -1 },
    exclusive: ["patrol_intensity_low"],
  },
  {
    id: "patrol_intensity_low",
    name: "REDUCED PATROLS",
    description: "Conservation mode. Saves supplies. Criminals notice. They always notice.",
    category: "logistics",
    effects: { ammoDrain: -3, fuelDrain: -2, defenseRating: -1, unrest: 1 },
    exclusive: ["patrol_intensity_high"],
  },
  {
    id: "martial_law_ready",
    name: "MARTIAL LAW STANDBY",
    description: "Pre-positioned units at key infrastructure. Ready to lock the city down in minutes. Citizens sleep uneasily.",
    category: "doctrine",
    effects: { defenseRating: 3, unrest: 2, happiness: -2, creditsDrain: 2000 },
  },
  {
    id: "military_budget_priority",
    name: "MILITARY BUDGET PRIORITY",
    description: "Defense gets first pick of the budget. Everything else gets what's left. Guns before butter.",
    category: "budget",
    effects: { defenseRating: 2, creditsDrain: 5000, happiness: -1 },
  },
  {
    id: "veterans_affairs",
    name: "VETERANS AFFAIRS PROGRAM",
    description: "Support for retired and wounded personnel. Costs money. Builds loyalty. Reduces desertion.",
    category: "budget",
    effects: { creditsDrain: 1500, moraleMod: 1.1, happiness: 1 },
  },
];

export type MilitaryResearchDef = {
  id: string;
  name: string;
  description: string;
  cost: number;
  ticksToComplete: number;
  category: "armor" | "weapons" | "tactics" | "logistics" | "special";
  effects: string;
  prerequisite?: string;
  bonuses: {
    defenseRating?: number;
    attackMod?: number;
    casualtyReduction?: number;
    ammEfficiency?: number;
    fuelEfficiency?: number;
    productionSpeed?: number;
    recruitSpeed?: number;
  };
};

export const MILITARY_RESEARCH: MilitaryResearchDef[] = [
  {
    id: "advanced_armor_plating",
    name: "ADVANCED ARMOR PLATING",
    description: "Composite ceramic-steel plates. Your people come home more often.",
    cost: 25000, ticksToComplete: 20, category: "armor",
    effects: "-15% casualties in engagements",
    bonuses: { casualtyReduction: 0.15 },
  },
  {
    id: "reactive_armor_systems",
    name: "REACTIVE ARMOR SYSTEMS",
    description: "Explosive reactive tiles that neutralize incoming projectiles. Vehicles survive things they shouldn't.",
    cost: 40000, ticksToComplete: 30, category: "armor",
    effects: "+3 defense rating, -10% vehicle casualties",
    prerequisite: "advanced_armor_plating",
    bonuses: { defenseRating: 3, casualtyReduction: 0.1 },
  },
  {
    id: "railgun_systems",
    name: "RAILGUN WEAPONS SYSTEMS",
    description: "Electromagnetic acceleration. Turns a slug into a city block's worst nightmare.",
    cost: 60000, ticksToComplete: 40, category: "weapons",
    effects: "+20% attack modifier in engagements",
    bonuses: { attackMod: 0.2 },
  },
  {
    id: "plasma_weapons_tech",
    name: "PLASMA WEAPONS TECHNOLOGY",
    description: "Superheated matter projection. Expensive, unstable, and absolutely terrifying.",
    cost: 80000, ticksToComplete: 50, category: "weapons",
    effects: "+30% attack modifier, +5% ammo consumption",
    prerequisite: "railgun_systems",
    bonuses: { attackMod: 0.3 },
  },
  {
    id: "drone_swarm_coordination",
    name: "DRONE SWARM COORDINATION",
    description: "Autonomous drone clusters operating as one. A cloud of eyes and teeth.",
    cost: 35000, ticksToComplete: 25, category: "tactics",
    effects: "+2 defense, -10% casualties",
    bonuses: { defenseRating: 2, casualtyReduction: 0.1 },
  },
  {
    id: "tactical_ai_targeting",
    name: "TACTICAL AI TARGETING",
    description: "Machine-learning fire control. Never misses. Never hesitates. Never feels guilty.",
    cost: 45000, ticksToComplete: 30, category: "tactics",
    effects: "+15% attack modifier",
    prerequisite: "drone_swarm_coordination",
    bonuses: { attackMod: 0.15 },
  },
  {
    id: "supply_chain_automation",
    name: "SUPPLY CHAIN AUTOMATION",
    description: "Automated logistics. Ammo and fuel get where they need to be without human error.",
    cost: 20000, ticksToComplete: 15, category: "logistics",
    effects: "-20% ammo drain, -15% fuel drain",
    bonuses: { ammEfficiency: 0.2, fuelEfficiency: 0.15 },
  },
  {
    id: "rapid_deployment_systems",
    name: "RAPID DEPLOYMENT SYSTEMS",
    description: "Drop pods, fast-rope rigs, and sprint-capable transports. First on scene, every time.",
    cost: 30000, ticksToComplete: 20, category: "logistics",
    effects: "+2 defense rating, faster mission completion",
    prerequisite: "supply_chain_automation",
    bonuses: { defenseRating: 2, recruitSpeed: 0.2 },
  },
  {
    id: "siege_engineering",
    name: "SIEGE ENGINEERING",
    description: "Purpose-built fortification breakers. When diplomacy was never really on the table.",
    cost: 50000, ticksToComplete: 35, category: "special",
    effects: "+25% attack in siege engagements",
    bonuses: { attackMod: 0.25 },
  },
  {
    id: "bio_deterrent_program",
    name: "BIO-DETERRENT PROGRAM",
    description: "Classified. Highly classified. The kind of classified that makes ethics committees resign.",
    cost: 100000, ticksToComplete: 60, category: "special",
    effects: "+5 defense rating, -3 happiness, +4 unrest",
    prerequisite: "siege_engineering",
    bonuses: { defenseRating: 5 },
  },
];

export type MilitaryMissionDef = {
  id: string;
  name: string;
  description: string;
  type: "strike" | "raid" | "patrol" | "escort" | "recon" | "siege" | "wasteland_op";
  duration: number;
  unitCost: number;
  ammoCost: number;
  fuelCost: number;
  creditsCost: number;
  difficulty: number;
  rewards: {
    credits?: number;
    steel?: number;
    ammo?: number;
    fuel?: number;
    xp?: number;
    defenseBonus?: number;
    intel?: number;
  };
  riskDescription: string;
};

export const MILITARY_MISSIONS: MilitaryMissionDef[] = [
  {
    id: "border_patrol_sweep",
    name: "BORDER PATROL SWEEP",
    description: "Full perimeter sweep. Find the holes before someone else does.",
    type: "patrol", duration: 4, unitCost: 20, ammoCost: 10, fuelCost: 8, creditsCost: 2000,
    difficulty: 20,
    rewards: { credits: 1000, xp: 50, defenseBonus: 1 },
    riskDescription: "Low risk. Possible minor skirmishes with wasteland scavengers.",
  },
  {
    id: "faction_strike",
    name: "FACTION STRIKE OPERATION",
    description: "Targeted assault on hostile faction infrastructure. Hit them where it hurts.",
    type: "strike", duration: 8, unitCost: 80, ammoCost: 40, fuelCost: 20, creditsCost: 8000,
    difficulty: 60,
    rewards: { credits: 5000, steel: 50, ammo: 20, xp: 200 },
    riskDescription: "High risk. Significant casualties expected. Faction relations will suffer.",
  },
  {
    id: "wasteland_salvage_run",
    name: "WASTELAND SALVAGE RUN",
    description: "Send a column into the irradiated wastes. Bring back anything useful. Bring back everyone if possible.",
    type: "wasteland_op", duration: 6, unitCost: 40, ammoCost: 15, fuelCost: 25, creditsCost: 3000,
    difficulty: 40,
    rewards: { credits: 3000, steel: 80, fuel: 15, xp: 120 },
    riskDescription: "Moderate risk. Radiation, mutant fauna, and rival scavengers.",
  },
  {
    id: "convoy_escort_duty",
    name: "CONVOY ESCORT DUTY",
    description: "Protect a supply convoy through contested territory. Every crate matters.",
    type: "escort", duration: 4, unitCost: 30, ammoCost: 10, fuelCost: 15, creditsCost: 1500,
    difficulty: 30,
    rewards: { credits: 2000, xp: 80 },
    riskDescription: "Moderate risk. Ambush likely in sector 7 corridor.",
  },
  {
    id: "deep_recon_mission",
    name: "DEEP RECONNAISSANCE",
    description: "Eyes and ears beyond the wall. Map enemy positions, count their guns, come home alive.",
    type: "recon", duration: 8, unitCost: 15, ammoCost: 5, fuelCost: 10, creditsCost: 2500,
    difficulty: 45,
    rewards: { xp: 150, intel: 3, defenseBonus: 2 },
    riskDescription: "Moderate-high risk. Discovery means no extraction.",
  },
  {
    id: "raider_camp_assault",
    name: "RAIDER CAMP ASSAULT",
    description: "Clear out a fortified raider position. They've been hitting our supply lines for weeks.",
    type: "raid", duration: 6, unitCost: 60, ammoCost: 30, fuelCost: 15, creditsCost: 5000,
    difficulty: 50,
    rewards: { credits: 4000, ammo: 25, steel: 30, xp: 180 },
    riskDescription: "High risk. Entrenched defenders with improvised explosives.",
  },
  {
    id: "siege_operation",
    name: "SIEGE OPERATION",
    description: "Surround and starve. Then knock. Loudly.",
    type: "siege", duration: 16, unitCost: 150, ammoCost: 80, fuelCost: 40, creditsCost: 15000,
    difficulty: 80,
    rewards: { credits: 12000, steel: 100, ammo: 40, fuel: 20, xp: 400 },
    riskDescription: "Extreme risk. Extended engagement. Attrition will be brutal.",
  },
  {
    id: "mutant_pacification",
    name: "MUTANT PACIFICATION",
    description: "The wastes are restless. Something big moved into sector 12. Make it un-move.",
    type: "wasteland_op", duration: 5, unitCost: 50, ammoCost: 25, fuelCost: 12, creditsCost: 4000,
    difficulty: 55,
    rewards: { credits: 2500, xp: 160, defenseBonus: 1 },
    riskDescription: "High risk. Unknown hostile organisms. Bring heavy weapons.",
  },
];

export type ProductionChainDef = {
  id: string;
  name: string;
  description: string;
  buildingKey: string;
  inputKey?: string;
  inputRate?: number;
  outputKey: "ammo" | "fuel" | "steel" | "armaments" | "vehicleParts" | "rations";
  outputRate: number;
  powerCost: number;
};

export const PRODUCTION_CHAINS: ProductionChainDef[] = [
  { id: "ammo_press", name: "AMMUNITION PRODUCTION", description: "Steel in, bullets out. Simple economics of violence.", buildingKey: "ammunitionPressLines", inputKey: "steel", inputRate: 2, outputKey: "ammo", outputRate: 8, powerCost: 10 },
  { id: "fuel_refinery", name: "FUEL REFINING", description: "Crude to refined. Keeps the war machine rolling.", buildingKey: "propellantTankFarm", outputKey: "fuel", outputRate: 5, powerCost: 15 },
  { id: "steel_foundry", name: "STEEL PRODUCTION", description: "The backbone of everything you build and everything you destroy.", buildingKey: "metalFoundryComplexes", outputKey: "steel", outputRate: 6, powerCost: 12 },
  { id: "arms_forge", name: "ARMAMENTS PRODUCTION", description: "Weapons manufacturing. Quality control is someone else's problem.", buildingKey: "smallArmsFactories", inputKey: "steel", inputRate: 3, outputKey: "armaments", outputRate: 4, powerCost: 20 },
  { id: "vehicle_assembly", name: "VEHICLE PARTS", description: "Wheels, tracks, armor plates. Assembly required.", buildingKey: "tireTreadFactories", inputKey: "steel", inputRate: 4, outputKey: "vehicleParts", outputRate: 3, powerCost: 18 },
  { id: "field_rations", name: "COMBAT RATIONS", description: "Technically food. Technically edible. Keeps soldiers functional.", buildingKey: "fieldEquipmentAssembly", outputKey: "rations", outputRate: 10, powerCost: 5 },
];

export type MilitaryEventDef = {
  id: string;
  title: string;
  description: string;
  condition: (state: { defenseRating: number; unrest: number; totalUnits: number; warMorale: number; credits: number }) => boolean;
  responses: { id: string; label: string; description: string; effects: Record<string, number> }[];
};

export const MILITARY_EVENTS: MilitaryEventDef[] = [
  {
    id: "supply_line_sabotage",
    title: "SUPPLY LINE SABOTAGE",
    description: "Unknown hostiles have hit our primary supply corridor. Three convoys destroyed. Ammo and fuel reserves taking a hit.",
    condition: (s) => s.totalUnits > 100,
    responses: [
      { id: "increase_escorts", label: "INCREASE CONVOY ESCORTS", description: "Double the guards. Double the fuel cost.", effects: { ammo: -20, fuel: -15, defenseRating: 1 } },
      { id: "reroute_supplies", label: "REROUTE SUPPLY LINES", description: "Longer route, safer path. Slower delivery.", effects: { credits: -3000 } },
      { id: "hunt_saboteurs", label: "HUNT THE SABOTEURS", description: "Send strike teams. Find them. End them.", effects: { ammo: -10, credits: -5000, defenseRating: 2 } },
    ],
  },
  {
    id: "desertion_wave",
    title: "DESERTION WAVE",
    description: "Morale is cracking. Soldiers are disappearing during night patrols. Some took their weapons with them.",
    condition: (s) => s.warMorale < 40,
    responses: [
      { id: "improve_conditions", label: "IMPROVE CONDITIONS", description: "Better pay, better food. Money talks.", effects: { credits: -8000, happiness: 2 } },
      { id: "military_police", label: "DEPLOY MILITARY POLICE", description: "Anyone caught deserting faces the tribunal.", effects: { unrest: 3, happiness: -2 } },
      { id: "amnesty", label: "OFFER AMNESTY", description: "Come back, no questions asked. This time.", effects: { happiness: 1, defenseRating: -1 } },
    ],
  },
  {
    id: "arms_dealer_offer",
    title: "ARMS DEALER IN TOWN",
    description: "A wasteland arms dealer has arrived with a cargo truck full of pre-war military hardware. Prices are steep. Quality is questionable. Availability is now.",
    condition: (s) => s.credits > 10000,
    responses: [
      { id: "buy_weapons", label: "BUY EVERYTHING", description: "Clean them out. Ask questions never.", effects: { credits: -15000, ammo: 50, defenseRating: 2 } },
      { id: "selective_purchase", label: "SELECTIVE PURCHASE", description: "Pick the good stuff, leave the junk.", effects: { credits: -6000, ammo: 20, defenseRating: 1 } },
      { id: "arrest_dealer", label: "ARREST THE DEALER", description: "Confiscate the goods. Send a message.", effects: { ammo: 30, unrest: 1, happiness: -1 } },
    ],
  },
  {
    id: "friendly_fire_incident",
    title: "FRIENDLY FIRE INCIDENT",
    description: "A patrol unit opened fire on a civilian transport. Six dead. The unit claims they received hostile fire first. Witnesses disagree.",
    condition: (s) => s.totalUnits > 50,
    responses: [
      { id: "cover_up", label: "SUPPRESS THE REPORT", description: "It never happened. The families will be compensated quietly.", effects: { happiness: -1, unrest: 1 } },
      { id: "tribunal", label: "MILITARY TRIBUNAL", description: "Public accountability. The troops won't like it.", effects: { happiness: 2, unrest: -1, defenseRating: -1 } },
      { id: "blame_hostiles", label: "BLAME HOSTILE FORCES", description: "Enemy infiltrators caused this tragedy. Rally the people.", effects: { unrest: -2, happiness: -1, defenseRating: 1 } },
    ],
  },
  {
    id: "equipment_malfunction",
    title: "CRITICAL EQUIPMENT FAILURE",
    description: "Batch of defective power cells shipped to frontline units. Weapons are overheating, vehicles are stalling. Someone in procurement has explaining to do.",
    condition: (s) => s.totalUnits > 80,
    responses: [
      { id: "emergency_recall", label: "EMERGENCY RECALL", description: "Pull everything back. Replace the cells. Defense drops temporarily.", effects: { credits: -5000, defenseRating: -2 } },
      { id: "field_repair", label: "FIELD REPAIR TEAMS", description: "Patch what you can. Pray for the rest.", effects: { credits: -2000 } },
      { id: "investigate_procurement", label: "INVESTIGATE PROCUREMENT", description: "Find out who signed off on this garbage.", effects: { credits: -1000 } },
    ],
  },
  {
    id: "veteran_uprising",
    title: "VETERANS DEMAND ANSWERS",
    description: "Retired military personnel are organizing. They want pensions, medical care, and someone to explain why their service records were 'lost.' Crowd is growing.",
    condition: (s) => s.totalUnits > 200,
    responses: [
      { id: "fund_veterans", label: "FUND VETERANS PROGRAM", description: "They earned it. Pay up.", effects: { credits: -10000, happiness: 3, unrest: -2 } },
      { id: "disperse_crowd", label: "DISPERSE THE GATHERING", description: "Riot control. Against veterans. This will look great.", effects: { unrest: 4, happiness: -3, defenseRating: -1 } },
      { id: "promise_review", label: "PROMISE A REVIEW", description: "Form a committee. That should buy time.", effects: { credits: -1000, unrest: 1 } },
    ],
  },
  {
    id: "arms_race_escalation",
    title: "ARMS RACE ESCALATION",
    description: "Intelligence reports confirm a rival megacity has doubled weapons production. Our military advisors are recommending an immediate response.",
    condition: (s) => s.defenseRating > 30,
    responses: [
      { id: "match_buildup", label: "MATCH THEIR BUILDUP", description: "Dollar for dollar, gun for gun. Expensive but necessary.", effects: { credits: -20000, defenseRating: 4 } },
      { id: "diplomatic_channel", label: "OPEN DIPLOMATIC CHANNEL", description: "Talk first, arm later. Cheaper. Riskier.", effects: { credits: -2000 } },
      { id: "covert_sabotage", label: "COVERT SABOTAGE", description: "Can't build weapons if your factories are on fire.", effects: { credits: -8000, defenseRating: 2, unrest: 1 } },
    ],
  },
  {
    id: "captured_intel",
    title: "CAPTURED ENEMY INTELLIGENCE",
    description: "A recon team recovered encrypted data drives from a destroyed enemy outpost. Could be troop movements. Could be a trap.",
    condition: (s) => s.defenseRating > 20,
    responses: [
      { id: "decrypt_immediately", label: "DECRYPT IMMEDIATELY", description: "Full crypto team on it. Results in hours.", effects: { credits: -3000, defenseRating: 2 } },
      { id: "cautious_analysis", label: "CAUTIOUS ANALYSIS", description: "Sweep for traps first. Slower but safer.", effects: { credits: -1000, defenseRating: 1 } },
      { id: "share_with_allies", label: "SHARE WITH ALLIES", description: "Build goodwill. Lose exclusivity.", effects: { happiness: 1 } },
    ],
  },
  {
    id: "munitions_shortage",
    title: "MUNITIONS SHORTAGE",
    description: "Ammo reserves are critically low. Frontline units reporting they're down to half loads. Training exercises suspended.",
    condition: (s) => s.totalUnits > 100,
    responses: [
      { id: "emergency_production", label: "EMERGENCY PRODUCTION RUN", description: "Overtime at the ammo plants. Expensive but immediate.", effects: { credits: -8000, ammo: 40 } },
      { id: "ration_ammo", label: "RATION AMMUNITION", description: "Half loads become the new standard. Temporarily.", effects: { defenseRating: -2 } },
      { id: "buy_foreign", label: "BUY FROM FOREIGN SOURCES", description: "Wasteland dealers charge a premium for desperation.", effects: { credits: -12000, ammo: 60 } },
    ],
  },
  {
    id: "rogue_unit",
    title: "ROGUE UNIT REPORTED",
    description: "A special operations team has gone dark. Last contact placed them 40 klicks outside the wall. They've stopped responding to recall orders.",
    condition: (s) => s.totalUnits > 150,
    responses: [
      { id: "send_retrieval", label: "SEND RETRIEVAL TEAM", description: "Bring them back. Alive if possible.", effects: { credits: -4000, ammo: -10, fuel: -8 } },
      { id: "cut_ties", label: "DISAVOW AND BLACKLIST", description: "They're on their own. We never heard of them.", effects: { happiness: -1 } },
      { id: "negotiate", label: "OPEN COMMUNICATIONS", description: "Find out what they want. Everyone has a price.", effects: { credits: -2000 } },
    ],
  },
  {
    id: "weapons_test_success",
    title: "WEAPONS TEST SUCCESS",
    description: "The experimental weapons division reports a successful live-fire test. The new ordinance exceeded all projections. Several buildings were accidentally destroyed in the process.",
    condition: (s) => s.defenseRating > 40,
    responses: [
      { id: "full_production", label: "AUTHORIZE FULL PRODUCTION", description: "Get these to the front lines.", effects: { credits: -15000, defenseRating: 3 } },
      { id: "more_testing", label: "MORE TESTING REQUIRED", description: "One success doesn't mean it's ready.", effects: { credits: -5000, defenseRating: 1 } },
      { id: "classify_project", label: "CLASSIFY THE PROJECT", description: "Nobody needs to know about this. Yet.", effects: { credits: -2000 } },
    ],
  },
  {
    id: "mercenary_offer",
    title: "MERCENARY COMPANY AVAILABLE",
    description: "The Iron Wolves — a veteran mercenary outfit — are offering their services. 200 experienced fighters with their own equipment. Loyalty strictly tied to payment.",
    condition: (s) => s.credits > 15000,
    responses: [
      { id: "hire_full", label: "HIRE FULL COMPANY", description: "200 guns for hire. Expensive but combat-ready now.", effects: { credits: -20000, defenseRating: 4 } },
      { id: "hire_partial", label: "HIRE A PLATOON", description: "50 specialists. More affordable, still useful.", effects: { credits: -6000, defenseRating: 1 } },
      { id: "decline", label: "DECLINE THE OFFER", description: "Mercenaries are unreliable. We fight our own wars.", effects: {} },
    ],
  },
];

export type ActiveMilitaryResearch = {
  techId: string;
  progress: number;
  totalTicks: number;
};

export type ActiveMission = {
  id: string;
  missionId: string;
  name: string;
  unitsDeployed: number;
  ticksRemaining: number;
  totalTicks: number;
  status: "active" | "completed" | "failed";
  result?: {
    success: boolean;
    casualties: number;
    rewards: Record<string, number>;
    report: string;
  };
};

export type StandingArmy = {
  infantry: number;
  armor: number;
  artillery: number;
  airSupport: number;
  specialOps: number;
  support: number;
  totalStrength: number;
  readiness: number;
  morale: number;
  deployedOnMission: number;
};

export type MilitaryProductionState = {
  ammoPerTick: number;
  fuelPerTick: number;
  steelPerTick: number;
  armamentsPerTick: number;
  vehiclePartsPerTick: number;
  rationsPerTick: number;
};

// Task #381 — Logistics & manning economy. Personnel (troops) are the
// constraining resource: they must CREW vehicles and MAN installations
// (walls, gates, sentry guns, batteries). Un-crewed vehicles and un-manned
// installations contribute reduced or zero combat/defense value.
//
// The personnel pool and branch breakdown are DERIVED from s.units every
// tick (never authored by hand); only the fields below are truly persisted
// player choices + slow-moving derived snapshots used by combat/UI.
export type AllocationPriority = "installations_first" | "vehicles_first" | "balanced";

export type MilitaryLogisticsState = {
  // Persisted player state:
  installationsBuilt: Record<string, number>; // MILITARY_BUILDINGS id -> count owned
  allocationPriority: AllocationPriority;      // how scarce personnel are prioritised
  fleetCondition: Record<string, number>;      // vehicle unit key -> serviceability 0..100

  // Derived each tick (persisted so the UI + combat can read the last result):
  personnelTotal: number;       // total troops available to man/crew
  crewDemand: number;           // personnel required to fully crew the motor pool
  garrisonDemand: number;       // personnel required to fully man all installations
  crewCoverage: number;         // 0..1 fraction of crew demand met
  garrisonCoverage: number;     // 0..1 fraction of garrison demand met
  fleetOperational: Record<string, number>; // vehicle key -> operational fraction 0..1
  installationDefenseBonus: number;          // manned installation defense -> defenseRating
  combatReadinessMod: number;                // 0.55..1.15 scalar applied to combat strength
  suppliesTicksRemaining: { ammo: number; fuel: number; rations: number };
  lastConsumption: { ammo: number; fuel: number; rations: number };
  lastProduction: { ammo: number; fuel: number; rations: number; steel: number; vehicleParts: number };
  supplyStatus: "surplus" | "stable" | "shortage" | "critical";
};

export function createDefaultLogisticsState(): MilitaryLogisticsState {
  return {
    installationsBuilt: {},
    allocationPriority: "balanced",
    fleetCondition: {},
    personnelTotal: 0,
    crewDemand: 0,
    garrisonDemand: 0,
    crewCoverage: 1,
    garrisonCoverage: 1,
    fleetOperational: {},
    installationDefenseBonus: 0,
    combatReadinessMod: 1,
    suppliesTicksRemaining: { ammo: 0, fuel: 0, rations: 0 },
    lastConsumption: { ammo: 0, fuel: 0, rations: 0 },
    lastProduction: { ammo: 0, fuel: 0, rations: 0, steel: 0, vehicleParts: 0 },
    supplyStatus: "stable",
  };
}

export type MilitaryOverhaulState = {
  standingArmy: StandingArmy;
  activePolicies: string[];
  activeResearch: ActiveMilitaryResearch | null;
  activeResearchId: string | null;
  researchProgress: number;
  completedResearch: string[];
  researchQueue: string[];
  activeMissions: ActiveMission[];
  completedMissions: number;
  failedMissions: number;
  production: MilitaryProductionState;
  conscriptionPool: number;
  totalConscripted: number;
  totalPersonnel: number;
  readiness: number;
  lastEventTick: number;
  logistics: MilitaryLogisticsState;
  academies: MilitaryAcademyState;
};

export function createDefaultMilitaryState(): MilitaryOverhaulState {
  return {
    standingArmy: {
      infantry: 0,
      armor: 0,
      artillery: 0,
      airSupport: 0,
      specialOps: 0,
      support: 0,
      totalStrength: 0,
      readiness: 50,
      morale: 60,
      deployedOnMission: 0,
    },
    activePolicies: ["conscription_volunteer", "roe_standard"],
    activeResearch: null,
    activeResearchId: null,
    researchProgress: 0,
    completedResearch: [],
    researchQueue: [],
    activeMissions: [],
    completedMissions: 0,
    failedMissions: 0,
    production: {
      ammoPerTick: 0,
      fuelPerTick: 0,
      steelPerTick: 0,
      armamentsPerTick: 0,
      vehiclePartsPerTick: 0,
      rationsPerTick: 0,
    },
    conscriptionPool: 0,
    totalConscripted: 0,
    totalPersonnel: 0,
    readiness: 50,
    lastEventTick: 0,
    logistics: createDefaultLogisticsState(),
    academies: {
      facilities: {},
      qualifications: {},
      completedCourses: 0,
      graduationRate: 0,
      readinessBonus: 0,
    },
  };
}

const MISSION_SUCCESS_LINES = [
  "Mission complete. All objectives achieved. Minimal casualties.",
  "Textbook operation. The troops performed beyond expectations.",
  "Objective secured. Losses within acceptable parameters. Barely.",
  "Target neutralized. Extraction successful. Nobody's talking about what happened in sector 4.",
  "Operation concluded. The reputation of the office precedes itself.",
  "All units accounted for. The enemy was... less fortunate.",
];

const MISSION_FAILURE_LINES = [
  "Mission failed. Surviving units have been extracted. Morale is in the gutter.",
  "Objective not achieved. Casualties were severe. Review of tactics recommended.",
  "We lost good people out there. The enemy was better prepared than intelligence suggested.",
  "Extraction under fire. Half the unit didn't make it back. Questions will be asked.",
  "Operation aborted. The situation deteriorated faster than anyone predicted.",
  "Failed. There's no other word for it. The memorial service is tomorrow.",
];

export function calculateArmyStrength(army: StandingArmy): number {
  return army.infantry + army.armor * 3 + army.artillery * 4 + army.airSupport * 5 + army.specialOps * 2 + army.support;
}


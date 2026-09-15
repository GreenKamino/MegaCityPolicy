export type UpgradeCategory =
  | "security"
  | "grid"
  | "civic_ai"
  | "logistics"
  | "defense"
  | "comms"
  | "medical"
  | "enviro";

export type SoftwareUpgradeTier = 1 | 2 | 3;

export type SoftwareUpgradeDef = {
  id: string;
  name: string;
  category: UpgradeCategory;
  maxTier: SoftwareUpgradeTier;
  tiers: {
    tier: SoftwareUpgradeTier;
    cost: number;
    requiredTech?: string;
    description: string;
    effects: Partial<{
      lawOrder: number;
      crime: number;
      unrest: number;
      happiness: number;
      corruption: number;
      defenseRating: number;
      researchSpeed: number;
      taxIncome: number;
      powerEfficiency: number;
      waterEfficiency: number;
      publicHealth: number;
      employment: number;
      tradeEfficiency: number;
      intelligence: number;
      infrastructureHealth: number;
    }>;
  }[];
};

export type SoftwareUpgradeState = {
  installed: Record<string, SoftwareUpgradeTier>;
  totalInstalled: number;
  totalSpent: number;
};

export const UPGRADE_CATEGORY_LABELS: Record<UpgradeCategory, string> = {
  security: "SECURITY FIRMWARE",
  grid: "GRID MANAGEMENT",
  civic_ai: "CIVIC AI",
  logistics: "LOGISTICS OS",
  defense: "DEFENSE MATRIX",
  comms: "COMMS PROTOCOL",
  medical: "MEDICAL SYSTEMS",
  enviro: "ENVIRO MONITORING",
};

export const UPGRADE_CATEGORY_ICONS: Record<UpgradeCategory, string> = {
  security: "shield-lock",
  grid: "flash",
  civic_ai: "robot",
  logistics: "truck-delivery",
  defense: "sword-cross",
  comms: "antenna",
  medical: "hospital-box",
  enviro: "weather-partly-cloudy",
};

export const SOFTWARE_UPGRADES: SoftwareUpgradeDef[] = [
  {
    id: "sec_predictive_policing",
    name: "Predictive Policing Engine",
    category: "security",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 30000, description: "v1.0 — Basic crime pattern analysis. The algorithm is crude, but it catches the stupid criminals. Which is most of them.", effects: { lawOrder: 2, crime: -2 } },
      { tier: 2, cost: 75000, requiredTech: "adv_surveillance_networks", description: "v2.0 — Neural network integration. Predicts crimes before they happen. The ethics committee had concerns. The ethics committee was disbanded.", effects: { lawOrder: 4, crime: -4 } },
      { tier: 3, cost: 180000, requiredTech: "quantum_computing_core", description: "v3.0 — Quantum-enhanced precognition algorithms. Arrests happen before the thought forms. Civil liberties groups are suspiciously quiet.", effects: { lawOrder: 7, crime: -7, unrest: 2 } },
    ],
  },
  {
    id: "sec_surveillance_os",
    name: "Surveillance Operating System",
    category: "security",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 25000, description: "v1.0 — Centralised camera feeds with facial recognition. Every face indexed. Every movement logged. Privacy died here.", effects: { lawOrder: 1, crime: -1, intelligence: 2 } },
      { tier: 2, cost: 60000, description: "v2.0 — Gait analysis, emotion detection, and predictive loitering alerts. The cameras see more than eyes ever could.", effects: { lawOrder: 3, crime: -3, intelligence: 5 } },
      { tier: 3, cost: 150000, requiredTech: "neural_interface_basics", description: "v3.0 — Full spectrum monitoring: visual, thermal, acoustic, electromagnetic. Nothing moves in this city without being catalogued.", effects: { lawOrder: 5, crime: -5, intelligence: 8, happiness: -1 } },
    ],
  },
  {
    id: "sec_firewall_suite",
    name: "City Firewall Suite",
    category: "security",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 20000, description: "v1.0 — Perimeter cyber-defense. Blocks the script kiddies and automated attacks. The real hackers laugh at it, but it's a start.", effects: { corruption: -1, defenseRating: 1 } },
      { tier: 2, cost: 55000, description: "v2.0 — Intrusion detection with counter-offensive capability. Attacks on city systems are now traced and their operators receive unpleasant visitors.", effects: { corruption: -3, defenseRating: 2 } },
      { tier: 3, cost: 140000, requiredTech: "quantum_computing_core", description: "v3.0 — Quantum-encrypted infrastructure. Every data packet is a fortress. Hackers don't retire from attacking this city — they disappear.", effects: { corruption: -5, defenseRating: 3, intelligence: 3 } },
    ],
  },
  {
    id: "grid_power_optimizer",
    name: "Power Grid Optimizer",
    category: "grid",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 22000, description: "v1.0 — Load-balancing algorithms distribute power evenly. The lights stop flickering in Sector 7. Residents are confused but grateful.", effects: { powerEfficiency: 5, infrastructureHealth: 1 } },
      { tier: 2, cost: 58000, requiredTech: "smart_grid_load_balancing", description: "v2.0 — Predictive demand modeling. The grid knows when you'll turn on the heater before you feel cold. Power waste drops 15%.", effects: { powerEfficiency: 12, infrastructureHealth: 2 } },
      { tier: 3, cost: 130000, description: "v3.0 — Self-healing grid architecture. Faults are isolated, rerouted, and repaired before anyone notices. Blackouts become a historical curiosity.", effects: { powerEfficiency: 20, infrastructureHealth: 4 } },
    ],
  },
  {
    id: "grid_water_management",
    name: "Water Distribution AI",
    category: "grid",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 20000, description: "v1.0 — Leak detection and pressure management. Finds the 300 leaks that maintenance swore didn't exist. Water loss drops immediately.", effects: { waterEfficiency: 5, publicHealth: 1 } },
      { tier: 2, cost: 50000, description: "v2.0 — Contamination prediction and automated quarantine valves. Poisoned water is isolated in seconds. The bacteria don't stand a chance.", effects: { waterEfficiency: 10, publicHealth: 3 } },
      { tier: 3, cost: 120000, description: "v3.0 — Molecular-level water quality monitoring with real-time purification adjustments. Every drop that leaves a tap is cleaner than nature intended.", effects: { waterEfficiency: 18, publicHealth: 5, happiness: 1 } },
    ],
  },
  {
    id: "grid_waste_processor",
    name: "Waste Processing Firmware",
    category: "grid",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 18000, description: "v1.0 — Automated sorting and routing. Recyclables go left, organics go right, hazmat goes somewhere nobody asks about.", effects: { infrastructureHealth: 2, employment: 1 } },
      { tier: 2, cost: 45000, description: "v2.0 — Resource recovery optimization. 40% of waste becomes raw materials. One city's trash is the same city's construction supplies.", effects: { infrastructureHealth: 3, employment: 2, taxIncome: 200 } },
      { tier: 3, cost: 110000, description: "v3.0 — Molecular disassembly protocols. Everything is recycled. Everything. The landfills are closing. The recycling plants are cathedrals.", effects: { infrastructureHealth: 5, employment: 3, taxIncome: 500, happiness: 1 } },
    ],
  },
  {
    id: "civic_admin_suite",
    name: "Administrative AI Suite",
    category: "civic_ai",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 35000, description: "v1.0 — Automates permit processing and licence reviews. 47 civil servants now supervise a computer doing their job. Morale is complicated.", effects: { corruption: -2, taxIncome: 300, employment: -1 } },
      { tier: 2, cost: 85000, description: "v2.0 — Budget optimization and fraud detection. The AI found three ghost departments that existed only on paper. Someone was embezzling. Past tense.", effects: { corruption: -5, taxIncome: 600 } },
      { tier: 3, cost: 200000, requiredTech: "basic_cybernetics", description: "v3.0 — Autonomous governance protocols. The AI runs the bureaucracy. The bureaucrats file appeals. The AI processes the appeals. In milliseconds.", effects: { corruption: -8, taxIncome: 1000, happiness: -1 } },
    ],
  },
  {
    id: "civic_corruption_scanner",
    name: "Corruption Detection Grid",
    category: "civic_ai",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 28000, description: "v1.0 — Financial audit algorithms. Follows the money. The small fish get caught first. The big fish start sweating.", effects: { corruption: -3 } },
      { tier: 2, cost: 70000, description: "v2.0 — Behavioral analysis of public officials. Unusual spending, unexplained meetings, sudden lifestyle changes. The system notices everything.", effects: { corruption: -6, lawOrder: 1 } },
      { tier: 3, cost: 160000, description: "v3.0 — Total financial transparency engine. Every credit earned, spent, or hidden is tracked. Privacy is dead. Corruption is dying. Trust in government is... complicated.", effects: { corruption: -10, lawOrder: 2, happiness: -2 } },
    ],
  },
  {
    id: "civic_citizen_services",
    name: "Citizen Services Platform",
    category: "civic_ai",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 22000, description: "v1.0 — Digital complaint system. Citizens submit grievances electronically instead of rioting. The queue is 40,000 deep. Progress is progress.", effects: { happiness: 1, unrest: -1 } },
      { tier: 2, cost: 55000, description: "v2.0 — AI-powered resolution engine. 60% of complaints resolved automatically. The other 40% are told their complaint is 'under review.' Forever.", effects: { happiness: 2, unrest: -2 } },
      { tier: 3, cost: 130000, description: "v3.0 — Predictive citizen needs platform. The system knows what you need before you do. It's helpful. It's efficient. It's terrifying.", effects: { happiness: 4, unrest: -3, taxIncome: 300 } },
    ],
  },
  {
    id: "log_supply_chain",
    name: "Supply Chain Intelligence",
    category: "logistics",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 25000, description: "v1.0 — Inventory tracking across all sectors. We now know where everything is. It turns out 12% of our supplies were in the wrong warehouse.", effects: { tradeEfficiency: 3, taxIncome: 200 } },
      { tier: 2, cost: 65000, description: "v2.0 — Predictive ordering and automated restocking. Shortages are detected before they happen. The warehouses are always full. The accountants are almost happy.", effects: { tradeEfficiency: 6, taxIncome: 400 } },
      { tier: 3, cost: 150000, description: "v3.0 — Full supply chain autonomy. Raw materials to finished goods, tracked molecule by molecule. Waste approaches zero. Efficiency approaches perfection.", effects: { tradeEfficiency: 10, taxIncome: 800, employment: 2 } },
    ],
  },
  {
    id: "log_transport_os",
    name: "Transport Network OS",
    category: "logistics",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 20000, description: "v1.0 — Traffic signal optimization. Commute times drop 8%. The citizens don't notice. They will when it breaks.", effects: { happiness: 1, infrastructureHealth: 1 } },
      { tier: 2, cost: 52000, description: "v2.0 — Autonomous vehicle coordination. Cars don't crash when computers drive. The insurance industry is in crisis. The hospitals are quieter.", effects: { happiness: 2, infrastructureHealth: 2, publicHealth: 1 } },
      { tier: 3, cost: 125000, description: "v3.0 — Unified mobility network. Every vehicle, train, elevator, and drone coordinated in real-time. The city moves like a single organism. Beautiful and slightly unsettling.", effects: { happiness: 3, infrastructureHealth: 3, publicHealth: 2, taxIncome: 300 } },
    ],
  },
  {
    id: "def_threat_analysis",
    name: "Threat Analysis Engine",
    category: "defense",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 30000, description: "v1.0 — Automated perimeter monitoring. Identifies approaching threats from wasteland raiders to rogue weather systems. Basic but functional.", effects: { defenseRating: 2, intelligence: 3 } },
      { tier: 2, cost: 75000, description: "v2.0 — Tactical prediction modeling. The system war-games every possible attack scenario and prepares countermeasures. Paranoia as a service.", effects: { defenseRating: 4, intelligence: 6 } },
      { tier: 3, cost: 180000, description: "v3.0 — Precognitive defense matrix. Identifies threats that don't exist yet. Allocates resources against attacks that might never come. Better safe than extinct.", effects: { defenseRating: 7, intelligence: 10 } },
    ],
  },
  {
    id: "def_weapons_firmware",
    name: "Weapons Systems Firmware",
    category: "defense",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 28000, description: "v1.0 — Targeting calibration update. Accuracy improves 12%. Collateral damage decreases proportionally. The lawyers are relieved.", effects: { defenseRating: 2 } },
      { tier: 2, cost: 68000, description: "v2.0 — Integrated fire control. All defensive weapons coordinated through a single AI. Overlapping fields of fire. No blind spots. No escape routes.", effects: { defenseRating: 4, unrest: -1 } },
      { tier: 3, cost: 160000, description: "v3.0 — Autonomous engagement protocols. The weapons choose their own targets. The response time is measured in microseconds. Human oversight is... optional.", effects: { defenseRating: 7, unrest: -2 } },
    ],
  },
  {
    id: "comms_data_backbone",
    name: "Data Backbone Protocol",
    category: "comms",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 22000, description: "v1.0 — Network bandwidth tripled. Data flows faster. The citizens stream better entertainment. The surveillance cameras stream better footage. Everybody wins.", effects: { researchSpeed: 2, intelligence: 2 } },
      { tier: 2, cost: 55000, description: "v2.0 — Mesh network architecture. Every device is a relay. The network can't be taken down by destroying a single node. Resilience through redundancy.", effects: { researchSpeed: 4, intelligence: 4 } },
      { tier: 3, cost: 135000, description: "v3.0 — Quantum communication backbone. Information travels instantaneously. Latency is a memory. The scientists say this shouldn't be possible. The network doesn't care.", effects: { researchSpeed: 7, intelligence: 7, defenseRating: 1 } },
    ],
  },
  {
    id: "comms_propaganda_engine",
    name: "Media Management Engine",
    category: "comms",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 18000, description: "v1.0 — Automated press release generation. The news says what you want it to say. Mostly. The AI sometimes editorialises. It's being retrained.", effects: { happiness: 1, unrest: -1 } },
      { tier: 2, cost: 48000, description: "v2.0 — Sentiment analysis and narrative shaping. Public opinion is measured in real-time and adjusted accordingly. Democracy as a managed service.", effects: { happiness: 2, unrest: -3 } },
      { tier: 3, cost: 120000, description: "v3.0 — Deep synthetic media platform. Any event can be shown, denied, or reimagined. Reality is a broadcast. History is editable. The truth is whatever streams best.", effects: { happiness: 3, unrest: -5, corruption: 2 } },
    ],
  },
  {
    id: "med_diagnostic_ai",
    name: "Diagnostic AI Network",
    category: "medical",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 24000, description: "v1.0 — Symptom analysis algorithms. Patients diagnosed in seconds instead of hours. The doctors feel undermined. The patients feel relieved.", effects: { publicHealth: 3 } },
      { tier: 2, cost: 60000, description: "v2.0 — Predictive health modeling. The system knows you're getting sick before you do. Early intervention saves lives and credits. Win-win.", effects: { publicHealth: 6, happiness: 1 } },
      { tier: 3, cost: 145000, description: "v3.0 — Autonomous medical response network. Diagnosis, treatment planning, and pharmaceutical dispatch — all automated. The doctors are now supervisors. The patients have never been healthier.", effects: { publicHealth: 10, happiness: 2 } },
    ],
  },
  {
    id: "med_pandemic_shield",
    name: "Pandemic Prevention Shield",
    category: "medical",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 28000, description: "v1.0 — Disease surveillance network. Tracks infections across sectors. When something nasty appears, we know about it within hours instead of weeks.", effects: { publicHealth: 2, intelligence: 1 } },
      { tier: 2, cost: 70000, description: "v2.0 — Automated quarantine protocols. Infected sectors sealed in minutes. The disease is contained. The citizens in the sealed sector are... contained too.", effects: { publicHealth: 5, intelligence: 3, happiness: -1 } },
      { tier: 3, cost: 165000, description: "v3.0 — Genetic threat prediction engine. Identifies potential pandemics before the virus evolves. Vaccines are developed against diseases that don't exist yet. Proactive paranoia at its finest.", effects: { publicHealth: 8, intelligence: 5 } },
    ],
  },
  {
    id: "env_pollution_monitor",
    name: "Pollution Monitoring Grid",
    category: "enviro",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 18000, description: "v1.0 — Air and water quality sensors across all sectors. We now know exactly how toxic the city is. The numbers are alarming. Knowledge is the first step.", effects: { publicHealth: 1, happiness: 1 } },
      { tier: 2, cost: 48000, description: "v2.0 — Source identification and automated compliance enforcement. Polluters are found, fined, and sometimes found again. The air is measurably cleaner.", effects: { publicHealth: 3, happiness: 2, taxIncome: 200 } },
      { tier: 3, cost: 115000, description: "v3.0 — Atmospheric management system. Air quality is actively controlled. Toxins are neutralised in real-time. Breathing in MegaCity is almost pleasant. Almost.", effects: { publicHealth: 5, happiness: 3, taxIncome: 400 } },
    ],
  },
  {
    id: "env_resource_recycler",
    name: "Resource Recovery AI",
    category: "enviro",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 22000, description: "v1.0 — Waste stream analysis identifies recoverable materials. 8% of landfill content turns out to be perfectly good steel. Embarrassing for the previous administration.", effects: { infrastructureHealth: 1, taxIncome: 150 } },
      { tier: 2, cost: 55000, description: "v2.0 — Closed-loop material tracking. Every atom of waste is catalogued and assigned a second life. The concept of 'garbage' becomes philosophically obsolete.", effects: { infrastructureHealth: 2, taxIncome: 350, employment: 1 } },
      { tier: 3, cost: 130000, description: "v3.0 — Zero-waste city protocol. Material recovery approaches 99%. The landfills are being converted to parks. The parks are nicer than the housing. Nobody mentions this.", effects: { infrastructureHealth: 4, taxIncome: 600, employment: 2, happiness: 1 } },
    ],
  },
  {
    id: "env_weather_prediction",
    name: "Weather Prediction Array",
    category: "enviro",
    maxTier: 3,
    tiers: [
      { tier: 1, cost: 20000, description: "v1.0 — Basic atmospheric modeling. Predicts acid rain 6 hours in advance. Enough time to close the skylights. Not enough time to fix the roof.", effects: { infrastructureHealth: 1, publicHealth: 1 } },
      { tier: 2, cost: 52000, description: "v2.0 — Multi-variable weather simulation. Predicts nanite storms, radiation waves, and gravitational anomalies 48 hours ahead. Preparation saves districts.", effects: { infrastructureHealth: 3, publicHealth: 2, defenseRating: 1 } },
      { tier: 3, cost: 130000, description: "v3.0 — Comprehensive atmospheric intelligence. Every weather pattern predicted a week in advance. The city adapts before the storm arrives. Nature is no longer a surprise.", effects: { infrastructureHealth: 5, publicHealth: 3, defenseRating: 2, happiness: 1 } },
    ],
  },
];

export function createDefaultSoftwareUpgradeState(): SoftwareUpgradeState {
  return {
    installed: {},
    totalInstalled: 0,
    totalSpent: 0,
  };
}

export function getCurrentTier(state: SoftwareUpgradeState, upgradeId: string): SoftwareUpgradeTier | 0 {
  return state.installed[upgradeId] ?? 0;
}

export function getNextTier(state: SoftwareUpgradeState, upgradeId: string): SoftwareUpgradeTier | null {
  const current = getCurrentTier(state, upgradeId);
  const def = SOFTWARE_UPGRADES.find((u) => u.id === upgradeId);
  if (!def) return null;
  if (current >= def.maxTier) return null;
  return (current + 1) as SoftwareUpgradeTier;
}

export function getTotalEffects(state: SoftwareUpgradeState): Record<string, number> {
  const effects: Record<string, number> = {};
  for (const [upgradeId, tier] of Object.entries(state.installed)) {
    const def = SOFTWARE_UPGRADES.find((u) => u.id === upgradeId);
    if (!def) continue;
    const tierDef = def.tiers.find((t) => t.tier === tier);
    if (!tierDef) continue;
    for (const [key, val] of Object.entries(tierDef.effects)) {
      effects[key] = (effects[key] ?? 0) + (val as number);
    }
  }
  return effects;
}

export function getUpgradesByCategory(category: UpgradeCategory): SoftwareUpgradeDef[] {
  return SOFTWARE_UPGRADES.filter((u) => u.category === category);
}

export const ALL_CATEGORIES: UpgradeCategory[] = ["security", "grid", "civic_ai", "logistics", "defense", "comms", "medical", "enviro"];

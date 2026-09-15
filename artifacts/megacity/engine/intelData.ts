export type IntelPolicyCategory = "surveillance" | "counterintel" | "humint" | "sigint" | "cyber" | "covert" | "analysis" | "diplomatic";

export type IntelPolicy = {
  id: string;
  name: string;
  cost: number;
  category: IntelPolicyCategory;
  description: string;
  effect: string;
};

export const INTEL_POLICY_CATEGORIES: Record<IntelPolicyCategory, string> = {
  surveillance: "SURVEILLANCE",
  counterintel: "COUNTER-INTEL",
  humint: "HUMINT",
  sigint: "SIGINT",
  cyber: "CYBER OPS",
  covert: "COVERT OPS",
  analysis: "ANALYSIS",
  diplomatic: "DIPLOMATIC INTEL",
};

export const INTEL_POLICY_COLORS: Record<IntelPolicyCategory, string> = {
  surveillance: "#00C8FF",
  counterintel: "#FF3B30",
  humint: "#FF9500",
  sigint: "#B855FF",
  cyber: "#00FFCC",
  covert: "#FF6B6B",
  analysis: "#00FF41",
  diplomatic: "#4DA6FF",
};

export const INTEL_POLICIES: IntelPolicy[] = [
  { id: "surveillance_expansion", name: "Surveillance Expansion", cost: 3000, category: "surveillance", description: "Widen domestic surveillance network", effect: "+5% crime detection" },
  { id: "facial_recognition", name: "Facial Recognition Grid", cost: 8000, category: "surveillance", description: "AI-powered identity tracking across all sectors", effect: "+8% suspect identification" },
  { id: "drone_surveillance", name: "Drone Surveillance Net", cost: 6000, category: "surveillance", description: "Autonomous aerial monitoring of city districts", effect: "+6% area coverage" },
  { id: "predictive_policing", name: "Predictive Policing AI", cost: 10000, category: "surveillance", description: "Machine learning crime prediction algorithms", effect: "-3 crime rate" },

  { id: "counter_intel", name: "Counter-Intelligence Program", cost: 5000, category: "counterintel", description: "Hunt enemy agents within the city", effect: "+10 counter-intel rating" },
  { id: "double_agent", name: "Double Agent Program", cost: 9000, category: "counterintel", description: "Turn enemy agents to your side", effect: "Convert hostile assets" },
  { id: "mole_hunt", name: "Mole Hunt Protocol", cost: 7000, category: "counterintel", description: "Systematic sweep for infiltrators in government", effect: "-5 corruption" },
  { id: "deception_ops", name: "Deception Operations", cost: 6000, category: "counterintel", description: "Feed false intelligence to rival factions", effect: "Reduce enemy accuracy" },

  { id: "informant_network", name: "Informant Network", cost: 2000, category: "humint", description: "Recruit civilian informants in every district", effect: "+3 intel per tick" },
  { id: "deep_cover_agents", name: "Deep Cover Agents", cost: 8000, category: "humint", description: "Plant operatives in rival factions long-term", effect: "Faction intel access" },
  { id: "safe_houses", name: "Safe House Network", cost: 4500, category: "humint", description: "Establish covert meeting locations", effect: "+5 agent security" },
  { id: "dead_drops", name: "Dead Drop Protocol", cost: 1500, category: "humint", description: "Set up anonymous information exchanges", effect: "Secure comms channel" },
  { id: "sleeper_cells", name: "Sleeper Cell Activation", cost: 12000, category: "humint", description: "Activate dormant agents in hostile territories", effect: "Behind-lines intel" },

  { id: "signal_intercept", name: "Signal Interception", cost: 4000, category: "sigint", description: "Monitor all radio and digital communications", effect: "+5 comms intercept" },
  { id: "satellite_recon", name: "Satellite Reconnaissance", cost: 12000, category: "sigint", description: "Deploy intelligence satellite for orbital surveillance", effect: "+10 area awareness" },
  { id: "radar_network", name: "Radar Intelligence Network", cost: 7000, category: "sigint", description: "Track all aerial and vehicle movements in region", effect: "+8 movement tracking" },
  { id: "comms_decrypt", name: "Communications Decryption", cost: 9000, category: "sigint", description: "Break enemy encrypted communications", effect: "Access enemy plans" },

  { id: "crypto_division", name: "Cryptography Division", cost: 6000, category: "cyber", description: "Establish code-breaking and encryption unit", effect: "+5 cyber defense" },
  { id: "network_infiltration", name: "Network Infiltration", cost: 8000, category: "cyber", description: "Hack into rival faction digital infrastructure", effect: "Data exfiltration" },
  { id: "dark_web_monitor", name: "Dark Web Monitoring", cost: 5000, category: "cyber", description: "Track illegal transactions and black market activity", effect: "-2 smuggling" },
  { id: "digital_forensics", name: "Digital Forensics Lab", cost: 4000, category: "cyber", description: "Analyze captured devices and data storage", effect: "+3 evidence quality" },

  { id: "black_site", name: "Establish Black Site", cost: 15000, category: "covert", description: "Secret interrogation and detention facility", effect: "+15 intel extraction" },
  { id: "psyops", name: "Psychological Operations", cost: 7000, category: "covert", description: "Disinformation and propaganda campaigns", effect: "-5 enemy morale" },
  { id: "assassination_bureau", name: "Assassination Bureau", cost: 20000, category: "covert", description: "Covert elimination of high-value targets", effect: "Remove hostile leaders" },
  { id: "smuggler_network", name: "Smuggler Network Co-opt", cost: 6000, category: "covert", description: "Turn smuggling routes into intelligence pipelines", effect: "+4 border intel" },

  { id: "threat_analysis", name: "Threat Analysis Center", cost: 5000, category: "analysis", description: "Centralized threat assessment and prediction", effect: "+5 threat awareness" },
  { id: "pattern_recognition", name: "Pattern Recognition Unit", cost: 7000, category: "analysis", description: "AI-driven analysis of intelligence data patterns", effect: "Predict enemy actions" },
  { id: "fusion_center", name: "Intelligence Fusion Center", cost: 10000, category: "analysis", description: "Combine all intel sources into unified picture", effect: "+10 overall intel" },

  { id: "border_intel", name: "Border Intelligence Unit", cost: 3500, category: "diplomatic", description: "Monitor all border crossings and trade routes", effect: "+5 border security" },
  { id: "tech_espionage", name: "Technology Espionage", cost: 10000, category: "diplomatic", description: "Steal research and technology from rival cities", effect: "+5 research speed" },
];

export type SpyNetworkDef = {
  id: string;
  name: string;
  targetType: "faction" | "megacity" | "independent";
  targetId: string;
  agents: number;
  maxAgents: number;
  coverStrength: number;
  intelGathered: number;
  status: "establishing" | "active" | "compromised" | "burned";
  costPerTick: number;
};

export const INITIAL_SPY_NETWORKS: SpyNetworkDef[] = [
  { id: "net_underhive", name: "Underhive Network", targetType: "faction", targetId: "underhive_syndicate", agents: 0, maxAgents: 5, coverStrength: 100, intelGathered: 0, status: "establishing", costPerTick: 200 },
  { id: "net_corpo", name: "Corporate Infiltration", targetType: "faction", targetId: "corpo_bloc", agents: 0, maxAgents: 4, coverStrength: 100, intelGathered: 0, status: "establishing", costPerTick: 350 },
  { id: "net_mutant", name: "Mutant Zone Watchers", targetType: "faction", targetId: "mutant_collective", agents: 0, maxAgents: 3, coverStrength: 100, intelGathered: 0, status: "establishing", costPerTick: 150 },
  { id: "net_blackmarket", name: "Black Market Moles", targetType: "faction", targetId: "black_market", agents: 0, maxAgents: 4, coverStrength: 100, intelGathered: 0, status: "establishing", costPerTick: 300 },
  { id: "net_cult", name: "Cult Infiltrators", targetType: "faction", targetId: "cult_of_machine", agents: 0, maxAgents: 3, coverStrength: 100, intelGathered: 0, status: "establishing", costPerTick: 250 },
  { id: "net_novaplex", name: "NovaPlex Station", targetType: "megacity", targetId: "novaplex", agents: 0, maxAgents: 3, coverStrength: 100, intelGathered: 0, status: "establishing", costPerTick: 400 },
  { id: "net_ironhaven", name: "IronHaven Listening Post", targetType: "megacity", targetId: "ironhaven", agents: 0, maxAgents: 3, coverStrength: 100, intelGathered: 0, status: "establishing", costPerTick: 400 },
  { id: "net_ashfall", name: "Ashfall Informants", targetType: "megacity", targetId: "ashfall", agents: 0, maxAgents: 2, coverStrength: 100, intelGathered: 0, status: "establishing", costPerTick: 250 },
];

export type ClandestineOp = {
  id: string;
  name: string;
  type: "sabotage" | "assassination" | "extraction" | "infiltration" | "surveillance" | "destabilize";
  cost: number;
  riskLevel: "low" | "medium" | "high" | "extreme";
  description: string;
  successBase: number;
  reward: string;
};

export const CLANDESTINE_OPS: ClandestineOp[] = [
  { id: "clan_wiretap", name: "Plant Wiretap", type: "surveillance", cost: 2000, riskLevel: "low", description: "Bug a faction leader's communications", successBase: 80, reward: "+10 intel" },
  { id: "clan_dead_drop_raid", name: "Dead Drop Raid", type: "surveillance", cost: 3000, riskLevel: "low", description: "Intercept enemy dead drop exchange", successBase: 75, reward: "Enemy plans revealed" },
  { id: "clan_asset_recruit", name: "Recruit Asset", type: "infiltration", cost: 5000, riskLevel: "medium", description: "Turn an enemy operative to your side", successBase: 55, reward: "New double agent" },
  { id: "clan_document_theft", name: "Document Theft", type: "infiltration", cost: 4000, riskLevel: "medium", description: "Steal classified documents from rival HQ", successBase: 60, reward: "+15 intel, tech clue" },
  { id: "clan_supply_sabotage", name: "Supply Line Sabotage", type: "sabotage", cost: 6000, riskLevel: "medium", description: "Destroy enemy supply depot or convoy", successBase: 65, reward: "-10 enemy resources" },
  { id: "clan_infrastructure_hit", name: "Infrastructure Strike", type: "sabotage", cost: 8000, riskLevel: "high", description: "Cripple enemy power grid or water supply", successBase: 50, reward: "Major disruption" },
  { id: "clan_prison_break", name: "Prison Break", type: "extraction", cost: 10000, riskLevel: "high", description: "Extract captured agents from enemy prison", successBase: 40, reward: "Agents recovered" },
  { id: "clan_defector_escort", name: "Defector Escort", type: "extraction", cost: 7000, riskLevel: "medium", description: "Safely extract a high-value defector", successBase: 55, reward: "Major intel dump" },
  { id: "clan_vip_elimination", name: "VIP Elimination", type: "assassination", cost: 15000, riskLevel: "extreme", description: "Eliminate a hostile faction commander", successBase: 30, reward: "Leadership chaos" },
  { id: "clan_coup_support", name: "Coup Support", type: "destabilize", cost: 20000, riskLevel: "extreme", description: "Support internal faction rebellion", successBase: 25, reward: "Faction destabilized" },
  { id: "clan_propaganda_inject", name: "Propaganda Injection", type: "destabilize", cost: 5000, riskLevel: "low", description: "Spread disinformation within enemy ranks", successBase: 70, reward: "-5 enemy cohesion" },
  { id: "clan_tech_heist", name: "Technology Heist", type: "infiltration", cost: 12000, riskLevel: "high", description: "Steal prototype technology from rival lab", successBase: 35, reward: "Free tech unlock" },
];

export const CLANDESTINE_RISK_COLORS: Record<string, string> = {
  low: "#00FF41",
  medium: "#FF9500",
  high: "#FF3B30",
  extreme: "#B855FF",
};

export const CLANDESTINE_TYPE_LABELS: Record<string, string> = {
  sabotage: "SABOTAGE",
  assassination: "ASSASSINATION",
  extraction: "EXTRACTION",
  infiltration: "INFILTRATION",
  surveillance: "SURVEILLANCE",
  destabilize: "DESTABILIZE",
};

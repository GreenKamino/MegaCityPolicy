export type PolicyCategory =
  | "lawEnforcement"
  | "economic"
  | "infrastructure"
  | "cyberTech"
  | "healthSocial"
  | "environmental"
  | "civilRights"
  | "militaryDefense"
  | "cultural"
  | "emergency"
  | "religion"
  | "utopian"
  | "orwellian"
  | "tyrannical";

export type PolicyEffect = Partial<{
  crime: number;
  unrest: number;
  happiness: number;
  lawOrder: number;
  corruption: number;
  employment: number;
  infrastructureHealth: number;
  defenseRating: number;
  populationGrowthRate: number;
  taxIncome: number;
  tradeIncome: number;
  foodProduction: number;
  waterProduction: number;
  powerGeneration: number;
  steelProduction: number;
  goodsProduction: number;
  fuelProduction: number;
  medProduction: number;
  researchSpeed: number;
  constructionSpeed: number;
}>;

export type PolicyDef = {
  id: string;
  name: string;
  category: PolicyCategory;
  description: string;
  costPerTick: number;
  effects: PolicyEffect;
  prerequisites?: string[];
};

export const POLICY_CATEGORY_LABELS: Record<PolicyCategory, string> = {
  lawEnforcement: "Law Enforcement",
  economic: "Economic",
  infrastructure: "Infrastructure",
  cyberTech: "Cybernetic & Technology",
  healthSocial: "Health & Social",
  environmental: "Environmental",
  civilRights: "Civil Rights",
  militaryDefense: "Military & Defense",
  cultural: "Cultural",
  emergency: "Emergency",
  religion: "Religion & Cult Oversight",
  utopian: "Utopian Initiatives",
  orwellian: "Orwellian Oversight",
  tyrannical: "Tyrannical Edicts",
};

export const CITY_POLICIES: PolicyDef[] = [
  // ── LAW ENFORCEMENT (10) ─────────────────────────────────────────────
  { id: "zeroTolerancePatrols", name: "Zero-Tolerance Patrols", category: "lawEnforcement", description: "Aggressive street patrols arrest all violators on sight. Reduces crime sharply but damages happiness.", costPerTick: 800, effects: { crime: -3, happiness: -2, lawOrder: 2, unrest: 1 } },
  { id: "predictivePolicing", name: "Predictive Policing AI", category: "lawEnforcement", description: "Deploy AI-driven crime prediction to pre-position enforcement units.", costPerTick: 1200, effects: { crime: -2, lawOrder: 3, corruption: -1 }, prerequisites: ["predictive_crime_analytics"] },
  { id: "gangSuppressionOps", name: "Gang Suppression Operations", category: "lawEnforcement", description: "Dedicated task forces raid known gang territories and dismantle networks.", costPerTick: 1500, effects: { crime: -4, unrest: 2, happiness: -1 } },
  { id: "enhancedSurveillance", name: "Enhanced Surveillance Network", category: "lawEnforcement", description: "Expand camera and drone coverage across all sectors for real-time monitoring.", costPerTick: 600, effects: { crime: -2, lawOrder: 2, happiness: -1 } },
  { id: "communityPolicing", name: "Community Policing Initiative", category: "lawEnforcement", description: "Embed officers within communities to build trust and gather intelligence.", costPerTick: 500, effects: { crime: -1, happiness: 2, lawOrder: 1, corruption: -1 } },
  { id: "mandatorySentencing", name: "Mandatory Minimum Sentencing", category: "lawEnforcement", description: "Impose strict minimum sentences for all offenses. Deters crime but crowds prisons.", costPerTick: 300, effects: { crime: -2, happiness: -2, unrest: 1, lawOrder: 1 } },
  { id: "digitalForensicsUnit", name: "Digital Forensics Unit", category: "lawEnforcement", description: "Specialized cybercrime investigation and digital evidence processing.", costPerTick: 900, effects: { crime: -1, lawOrder: 2 }, prerequisites: ["advanced_forensic_tools"] },
  { id: "borderInspections", name: "Strict Border Inspections", category: "lawEnforcement", description: "Enhanced screening at all sector entry points reduces smuggling.", costPerTick: 700, effects: { crime: -2, tradeIncome: -100, lawOrder: 1 } },
  { id: "nightPatrolSurge", name: "Night Patrol Surge", category: "lawEnforcement", description: "Double patrol presence during night cycles when crime peaks.", costPerTick: 600, effects: { crime: -2, happiness: -1 } },
  { id: "antiCorruptionBureau", name: "Anti-Corruption Bureau", category: "lawEnforcement", description: "Independent oversight body investigates corruption in all departments.", costPerTick: 1000, effects: { corruption: -3, lawOrder: 1, happiness: 1 } },

  // ── ECONOMIC (10) ─────────────────────────────────────────────────────
  { id: "tradeLiberalization", name: "Trade Liberalization Act", category: "economic", description: "Remove trade barriers and encourage free market commerce across sectors.", costPerTick: 200, effects: { tradeIncome: 300, corruption: 1, employment: 2, happiness: 1 } },
  { id: "industrialSubsidies", name: "Industrial Subsidies Program", category: "economic", description: "Government subsidies for manufacturing and heavy industry expansion.", costPerTick: 1500, effects: { steelProduction: 10, goodsProduction: 8, employment: 3, corruption: 1 } },
  { id: "taxReform", name: "Progressive Tax Reform", category: "economic", description: "Restructure tax brackets to increase revenue from wealthy districts.", costPerTick: 100, effects: { taxIncome: 500, happiness: -1, unrest: 1 } },
  { id: "publicWorksProgram", name: "Public Works Employment", category: "economic", description: "Government-funded jobs program for unemployed citizens.", costPerTick: 2000, effects: { employment: 5, happiness: 2, infrastructureHealth: 1, unrest: -2 } },
  { id: "austerityMeasures", name: "Austerity Measures", category: "economic", description: "Slash government spending across all departments to save credits.", costPerTick: -3000, effects: { happiness: -4, employment: -3, unrest: 3, infrastructureHealth: -2 } },
  { id: "fuelPriceControls", name: "Fuel Price Controls", category: "economic", description: "Cap fuel prices to stabilize transport and industry costs.", costPerTick: 800, effects: { happiness: 1, fuelProduction: -5, tradeIncome: -50 } },
  { id: "exportIncentives", name: "Export Incentive Scheme", category: "economic", description: "Tax breaks for companies that export goods beyond city borders.", costPerTick: 600, effects: { tradeIncome: 400, goodsProduction: 3, taxIncome: -200 } },
  { id: "smallBusinessGrants", name: "Small Business Grants", category: "economic", description: "Micro-grants for citizen entrepreneurs to start businesses.", costPerTick: 1200, effects: { employment: 3, happiness: 2, taxIncome: 150, corruption: 1 } },
  { id: "priceStabilization", name: "Price Stabilization Fund", category: "economic", description: "Government fund to prevent price spikes on essential goods.", costPerTick: 700, effects: { happiness: 2, unrest: -1 } },
  { id: "foreignInvestmentZone", name: "Foreign Investment Zone", category: "economic", description: "Designate areas with special tax rates to attract outside investment.", costPerTick: 400, effects: { tradeIncome: 500, taxIncome: 200, corruption: 2, crime: 1 } },

  // ── INFRASTRUCTURE (10) ───────────────────────────────────────────────
  { id: "emergencyInfraRepair", name: "Emergency Infrastructure Repair", category: "infrastructure", description: "Accelerated repair crews fix critical infrastructure failures.", costPerTick: 1800, effects: { infrastructureHealth: 3, employment: 2 } },
  { id: "smartGridUpgrade", name: "Smart Grid Upgrade", category: "infrastructure", description: "Install intelligent power distribution across all sectors.", costPerTick: 1200, effects: { powerGeneration: 30, infrastructureHealth: 1 }, prerequisites: ["smart_grid_load_balancing"] },
  { id: "waterReclamation", name: "Water Reclamation Mandate", category: "infrastructure", description: "Require all facilities to recycle wastewater for reuse.", costPerTick: 500, effects: { waterProduction: 20, happiness: -1 } },
  { id: "transitExpansion", name: "Transit System Expansion", category: "infrastructure", description: "Extend transit coverage to underserved sectors.", costPerTick: 2000, effects: { happiness: 2, employment: 2, infrastructureHealth: 1, tradeIncome: 100 } },
  { id: "buildingCodeEnforcement", name: "Building Code Enforcement", category: "infrastructure", description: "Strict structural safety inspections for all habitation blocks.", costPerTick: 400, effects: { infrastructureHealth: 2, happiness: 1, corruption: -1 } },
  { id: "undergroundExpansion", name: "Underground Network Expansion", category: "infrastructure", description: "Expand undercity tunnels for freight and emergency evacuation.", costPerTick: 2500, effects: { infrastructureHealth: 2, defenseRating: 1, employment: 3 } },
  { id: "powerRationing", name: "Power Rationing Protocol", category: "infrastructure", description: "Ration power distribution to non-essential sectors to prevent blackouts.", costPerTick: 0, effects: { powerGeneration: 15, happiness: -3, employment: -1, unrest: 2 } },
  { id: "roadNetworkOverhaul", name: "Road Network Overhaul", category: "infrastructure", description: "Major reconstruction of ground-level transportation routes.", costPerTick: 1500, effects: { infrastructureHealth: 2, tradeIncome: 150, employment: 2 } },
  { id: "wasteProcessingExpansion", name: "Waste Processing Expansion", category: "infrastructure", description: "Build additional waste processing capacity to handle population growth.", costPerTick: 800, effects: { infrastructureHealth: 1, happiness: 1 } },
  { id: "communicationsUpgrade", name: "Communications Grid Upgrade", category: "infrastructure", description: "Upgrade city-wide communications backbone for faster data.", costPerTick: 600, effects: { infrastructureHealth: 1, lawOrder: 1, researchSpeed: 1 } },
  { id: "railPublicAccessMandate", name: "Rail Public Access Mandate", category: "infrastructure", description: "Guarantee affordable public access to intermodal rail; expanded service requires a continuing operating subsidy.", costPerTick: 900, effects: { happiness: 2, tradeIncome: -100 }, prerequisites: ["passenger_intermodal_rail"] },
  { id: "automatedRailConstruction", name: "Automated Rail Construction", category: "infrastructure", description: "Authorize automated crews to build rail extensions faster, reducing the need for manual construction jobs.", costPerTick: 1250, effects: { constructionSpeed: 3, employment: -2 }, prerequisites: ["advanced_train_designs"] },

  // ── RAIL OPERATIONS ────────────────────────────────────────────────────
  { id: "freightPriorityDispatch", name: "Freight Priority Dispatch", category: "economic", description: "Give scheduled freight trains priority on rail corridors, raising industrial throughput while limiting passenger access.", costPerTick: 750, effects: { tradeIncome: 250, goodsProduction: 2, happiness: -1 }, prerequisites: ["rail_freight_systems"] },
  { id: "railSafetyAuthority", name: "Rail Safety Authority", category: "lawEnforcement", description: "Fund an independent electric-rail safety authority to inspect infrastructure and enforce operating standards.", costPerTick: 1100, effects: { infrastructureHealth: 2, lawOrder: 2 }, prerequisites: ["railway_electrification"] },

  // ── CYBERNETIC & TECHNOLOGY (10) ──────────────────────────────────────
  { id: "augmentationSubsidies", name: "Augmentation Subsidies", category: "cyberTech", description: "Government-funded cybernetic augmentation for essential workers.", costPerTick: 1800, effects: { employment: 3, happiness: 2, medProduction: 5, crime: 1 }, prerequisites: ["basic_cybernetics"] },
  { id: "neuralNetRegulation", name: "Neural Net Regulation", category: "cyberTech", description: "Strict oversight of neural interface technology and data privacy.", costPerTick: 500, effects: { crime: -2, happiness: -1, researchSpeed: -1, lawOrder: 1 } },
  { id: "aiResearchGrants", name: "AI Research Grants", category: "cyberTech", description: "Fund artificial intelligence research programs across institutions.", costPerTick: 2000, effects: { researchSpeed: 3, employment: 1, corruption: 1 } },
  { id: "openSourceTechPolicy", name: "Open-Source Tech Policy", category: "cyberTech", description: "Mandate public access to government-funded technology research.", costPerTick: 300, effects: { researchSpeed: 2, happiness: 1, tradeIncome: -100 } },
  { id: "cybercrimeTaskForce", name: "Cybercrime Task Force", category: "cyberTech", description: "Dedicated unit to combat digital theft, ransomware, and hacking.", costPerTick: 1000, effects: { crime: -2, lawOrder: 2 }, prerequisites: ["advanced_forensic_tools"] },
  { id: "implantRegistry", name: "Mandatory Implant Registry", category: "cyberTech", description: "All cybernetic implants must be registered with sector authorities.", costPerTick: 400, effects: { crime: -1, lawOrder: 1, happiness: -2 } },
  { id: "techStartupIncubator", name: "Tech Startup Incubator", category: "cyberTech", description: "Government-backed incubator for technology startups.", costPerTick: 1500, effects: { employment: 2, taxIncome: 200, researchSpeed: 1, happiness: 1 } },
  { id: "automationIncentives", name: "Automation Incentives", category: "cyberTech", description: "Tax breaks for companies adopting automated manufacturing.", costPerTick: 800, effects: { goodsProduction: 10, steelProduction: 5, employment: -3, taxIncome: -150 } },
  { id: "dataPrivacyAct", name: "Data Privacy Act", category: "cyberTech", description: "Protect citizen data from corporate and government overreach.", costPerTick: 200, effects: { happiness: 2, lawOrder: 1, crime: 1 } },
  { id: "quantumEncryption", name: "Quantum Encryption Mandate", category: "cyberTech", description: "Require quantum-grade encryption for all government communications.", costPerTick: 1200, effects: { corruption: -2, lawOrder: 2, crime: -1 }, prerequisites: ["quantum_data_centers"] },

  // ── HEALTH & SOCIAL (10) ──────────────────────────────────────────────
  { id: "universalHealthcare", name: "Universal Healthcare Program", category: "healthSocial", description: "Free medical care for all registered citizens.", costPerTick: 3000, effects: { happiness: 4, populationGrowthRate: 0.001, medProduction: -5, unrest: -2 } },
  { id: "mentalHealthServices", name: "Mental Health Services", category: "healthSocial", description: "Fund clinics for psychological treatment and cyberpsychosis prevention.", costPerTick: 1200, effects: { happiness: 2, crime: -1, unrest: -1 } },
  { id: "substanceRehabProgram", name: "Substance Rehabilitation", category: "healthSocial", description: "Government rehab centers for stim and drug addiction.", costPerTick: 800, effects: { crime: -1, happiness: 1, employment: 1, unrest: -1 } },
  { id: "publicHousingExpansion", name: "Public Housing Expansion", category: "healthSocial", description: "Build affordable housing blocks for low-income citizens.", costPerTick: 2500, effects: { happiness: 3, unrest: -2, employment: 2, crime: -1 } },
  { id: "childWelfareProgram", name: "Child Welfare Program", category: "healthSocial", description: "Protect minors and fund education and nutrition programs.", costPerTick: 1000, effects: { happiness: 2, populationGrowthRate: 0.001, crime: -1 } },
  { id: "elderCareSubsidies", name: "Elder Care Subsidies", category: "healthSocial", description: "Fund assisted living and medical care for aging population.", costPerTick: 700, effects: { happiness: 2, medProduction: -2 } },
  { id: "foodBankNetwork", name: "Food Bank Network", category: "healthSocial", description: "Distribute surplus food to impoverished districts.", costPerTick: 500, effects: { happiness: 2, unrest: -2, foodProduction: -10 } },
  { id: "diseaseScreening", name: "Mandatory Disease Screening", category: "healthSocial", description: "Regular health screenings to prevent epidemics.", costPerTick: 600, effects: { happiness: 1, populationGrowthRate: 0.001, medProduction: -3 } },
  { id: "workerSafetyStandards", name: "Worker Safety Standards", category: "healthSocial", description: "Enforce strict workplace safety regulations in factories.", costPerTick: 400, effects: { happiness: 2, employment: -1, steelProduction: -3, goodsProduction: -2 } },
  { id: "veteranSupportProgram", name: "Veteran Support Program", category: "healthSocial", description: "Benefits and reintegration services for former enforcement personnel.", costPerTick: 500, effects: { happiness: 1, lawOrder: 1, crime: -1 } },

  // ── ENVIRONMENTAL (10) ────────────────────────────────────────────────
  { id: "emissionsControl", name: "Industrial Emissions Control", category: "environmental", description: "Regulate factory emissions to reduce atmospheric pollution.", costPerTick: 800, effects: { happiness: 2, steelProduction: -3, goodsProduction: -2, populationGrowthRate: 0.001 } },
  { id: "toxicWasteCleanup", name: "Toxic Waste Cleanup Program", category: "environmental", description: "Remediate contaminated zones in industrial and undercity sectors.", costPerTick: 1500, effects: { happiness: 2, infrastructureHealth: 1, employment: 2 } },
  { id: "greenEnergyMandate", name: "Green Energy Mandate", category: "environmental", description: "Require renewable energy sources for new construction.", costPerTick: 600, effects: { powerGeneration: 15, happiness: 1, infrastructureHealth: 1 } },
  { id: "waterQualityStandards", name: "Water Quality Standards", category: "environmental", description: "Strict monitoring and purification requirements for water supply.", costPerTick: 400, effects: { happiness: 1, waterProduction: -5, populationGrowthRate: 0.001 } },
  { id: "noiseReduction", name: "Noise Reduction Ordinance", category: "environmental", description: "Enforce noise limits in residential zones during rest cycles.", costPerTick: 200, effects: { happiness: 2, employment: -1 } },
  { id: "urbanGreenSpaces", name: "Urban Green Spaces Program", category: "environmental", description: "Convert abandoned lots into parks and green areas.", costPerTick: 1000, effects: { happiness: 3, crime: -1, unrest: -1, populationGrowthRate: 0.001 } },
  { id: "recyclingMandate", name: "Mandatory Recycling Program", category: "environmental", description: "All districts must sort and process recyclable materials.", costPerTick: 300, effects: { steelProduction: 3, goodsProduction: 2, happiness: -1 } },
  { id: "radiationMonitoring", name: "Radiation Monitoring Network", category: "environmental", description: "Deploy radiation sensors across all sectors for early warning.", costPerTick: 500, effects: { happiness: 1, defenseRating: 1 } },
  { id: "atmosphericProcessing", name: "Atmospheric Processing", category: "environmental", description: "Filter and clean the air in enclosed habitation sectors.", costPerTick: 1200, effects: { happiness: 2, populationGrowthRate: 0.001, powerGeneration: -10 } },
  { id: "mutantFloraConservation", name: "Mutant Flora Conservation", category: "environmental", description: "Protect and study mutated plant species for potential benefits.", costPerTick: 400, effects: { happiness: 1, researchSpeed: 1, foodProduction: 5 } },

  // ── CIVIL RIGHTS (10) ─────────────────────────────────────────────────
  { id: "freeAssemblyRights", name: "Free Assembly Rights", category: "civilRights", description: "Allow citizens to gather and protest peacefully without interference.", costPerTick: 0, effects: { happiness: 3, unrest: 2, crime: 1, corruption: -1 } },
  { id: "pressFreedom", name: "Press Freedom Act", category: "civilRights", description: "Remove censorship restrictions on media outlets.", costPerTick: 0, effects: { happiness: 2, corruption: -2, unrest: 1, lawOrder: -1 } },
  { id: "mutantEqualRights", name: "Mutant Equal Rights Act", category: "civilRights", description: "Grant full citizenship rights to mutant population.", costPerTick: 200, effects: { happiness: 3, unrest: 2, populationGrowthRate: 0.001 } },
  { id: "privacyProtection", name: "Privacy Protection Law", category: "civilRights", description: "Limit government surveillance and data collection on citizens.", costPerTick: 100, effects: { happiness: 3, crime: 2, lawOrder: -2, corruption: -1 } },
  { id: "laborUnionRights", name: "Labor Union Rights", category: "civilRights", description: "Legalize and protect worker unions for collective bargaining.", costPerTick: 0, effects: { happiness: 2, employment: 1, steelProduction: -2, goodsProduction: -2, unrest: -1 } },
  { id: "antiDiscrimination", name: "Anti-Discrimination Law", category: "civilRights", description: "Prohibit discrimination based on augmentation status or origin.", costPerTick: 100, effects: { happiness: 2, employment: 1, unrest: -1 } },
  { id: "rightToAugmentation", name: "Right to Augmentation", category: "civilRights", description: "Citizens have the legal right to voluntary cybernetic enhancement.", costPerTick: 0, effects: { happiness: 2, crime: 1, employment: 1 } },
  { id: "deathPenaltyBan", name: "Death Penalty Abolition", category: "civilRights", description: "Ban capital punishment for all crimes.", costPerTick: 0, effects: { happiness: 2, crime: 1, unrest: -1, corruption: -1 } },
  { id: "refugeeAcceptance", name: "Refugee Acceptance Policy", category: "civilRights", description: "Accept refugees from wasteland and other mega-cities.", costPerTick: 1000, effects: { populationGrowthRate: 0.002, happiness: 1, crime: 1, employment: -2, unrest: 1 } },
  { id: "transparentGovernment", name: "Transparent Government Act", category: "civilRights", description: "Public access to government budgets, decisions, and records.", costPerTick: 200, effects: { corruption: -3, happiness: 2, lawOrder: 1 } },

  // ── MILITARY & DEFENSE (10) ───────────────────────────────────────────
  { id: "fortifiedPerimeter", name: "Fortified Perimeter Protocol", category: "militaryDefense", description: "Reinforce all city walls and border defenses.", costPerTick: 2000, effects: { defenseRating: 4, steelProduction: -5, employment: 2 } },
  { id: "militaryDraft", name: "Military Conscription Act", category: "militaryDefense", description: "Mandatory military service for eligible citizens.", costPerTick: 500, effects: { defenseRating: 3, happiness: -4, employment: -3, unrest: 3 } },
  { id: "weaponsStockpiling", name: "Weapons Stockpiling Order", category: "militaryDefense", description: "Increase ammunition and weapons production for strategic reserves.", costPerTick: 1500, effects: { defenseRating: 2, steelProduction: -3, goodsProduction: -2 } },
  { id: "civilDefenseTraining", name: "Civil Defense Training", category: "militaryDefense", description: "Train civilians in emergency procedures and basic defense.", costPerTick: 600, effects: { defenseRating: 1, happiness: -1, unrest: -1, lawOrder: 1 } },
  { id: "antiAirDefense", name: "Anti-Air Defense Priority", category: "militaryDefense", description: "Prioritize air defense systems and radar coverage.", costPerTick: 1200, effects: { defenseRating: 3, powerGeneration: -15 } },
  { id: "militaryIntelligence", name: "Military Intelligence Ops", category: "militaryDefense", description: "Fund covert intelligence gathering beyond city borders.", costPerTick: 1800, effects: { defenseRating: 2, corruption: 1, crime: -1 } },
  { id: "veteranRecruitment", name: "Veteran Recruitment Drive", category: "militaryDefense", description: "Recruit experienced veterans for elite defense units.", costPerTick: 800, effects: { defenseRating: 2, employment: 1, lawOrder: 1 } },
  { id: "droneDefenseExpansion", name: "Drone Defense Expansion", category: "militaryDefense", description: "Expand autonomous drone patrols along perimeter zones.", costPerTick: 1000, effects: { defenseRating: 2, crime: -1, powerGeneration: -10 }, prerequisites: ["tactical_drone_swarms"] },
  { id: "bunkerConstruction", name: "Emergency Bunker Program", category: "militaryDefense", description: "Build deep shelters to protect population during attacks.", costPerTick: 2500, effects: { defenseRating: 2, happiness: 1, steelProduction: -5, employment: 3 } },
  { id: "borderMilitarization", name: "Border Militarization", category: "militaryDefense", description: "Deploy heavy military assets along all border sectors.", costPerTick: 1500, effects: { defenseRating: 3, tradeIncome: -200, happiness: -2, unrest: 1 } },

  // ── CULTURAL (10) ─────────────────────────────────────────────────────
  { id: "publicEntertainment", name: "Public Entertainment Fund", category: "cultural", description: "Sponsor free entertainment events across all sectors.", costPerTick: 800, effects: { happiness: 3, unrest: -2, crime: -1 } },
  { id: "propagandaCampaign", name: "State Propaganda Campaign", category: "cultural", description: "Broadcast pro-government messaging through all media channels.", costPerTick: 600, effects: { unrest: -3, happiness: -1, corruption: 1, lawOrder: 2 } },
  { id: "educationReform", name: "Education Reform Initiative", category: "cultural", description: "Modernize schools and fund vocational training programs.", costPerTick: 1500, effects: { employment: 3, happiness: 2, researchSpeed: 1, crime: -1 } },
  { id: "historicalPreservation", name: "Historical Preservation Act", category: "cultural", description: "Protect and maintain historical sites from the pre-catastrophe era.", costPerTick: 400, effects: { happiness: 1, tradeIncome: 100 } },
  { id: "sportsLeagueFunding", name: "Sports League Funding", category: "cultural", description: "Fund city-wide sports leagues and arenas for public engagement.", costPerTick: 700, effects: { happiness: 2, unrest: -2, crime: -1 } },
  { id: "artCommissions", name: "Public Art Commissions", category: "cultural", description: "Commission murals, sculptures, and installations across sectors.", costPerTick: 500, effects: { happiness: 2, unrest: -1 } },
  { id: "mediaCensorship", name: "Media Censorship Protocol", category: "cultural", description: "Control information flow through approved channels only.", costPerTick: 300, effects: { unrest: -2, happiness: -3, corruption: 2, lawOrder: 1 } },
  { id: "religiousTolerance", name: "Religious Tolerance Decree", category: "cultural", description: "Protect freedom of worship for all recognized faiths.", costPerTick: 100, effects: { happiness: 2, unrest: -1 } },
  { id: "virtualEntertainment", name: "Virtual Reality Entertainment", category: "cultural", description: "Fund VR entertainment centers for stress relief.", costPerTick: 900, effects: { happiness: 3, unrest: -1, crime: -1, employment: 1 } },
  { id: "culturalExchangeProgram", name: "Cultural Exchange Program", category: "cultural", description: "Exchange programs with other mega-cities for mutual understanding.", costPerTick: 600, effects: { happiness: 1, tradeIncome: 200, unrest: -1 } },

  // ── EMERGENCY (10) ────────────────────────────────────────────────────
  { id: "emergencyFoodDistrib", name: "Emergency Food Distribution", category: "emergency", description: "Distribute emergency rations to all districts immediately.", costPerTick: 2000, effects: { happiness: 2, unrest: -3, foodProduction: -20 } },
  { id: "emergencyPowerReserves", name: "Emergency Power Reserves", category: "emergency", description: "Activate backup generators and battery reserves.", costPerTick: 1500, effects: { powerGeneration: 50, infrastructureHealth: -1 } },
  { id: "disasterResponseMode", name: "Disaster Response Mode", category: "emergency", description: "Redirect all available resources to emergency response.", costPerTick: 3000, effects: { happiness: 1, infrastructureHealth: 3, employment: 2, tradeIncome: -300 } },
  { id: "quarantineProtocol", name: "Quarantine Protocol", category: "emergency", description: "Isolate infected sectors to prevent disease spread.", costPerTick: 1000, effects: { populationGrowthRate: -0.001, happiness: -3, crime: -1, tradeIncome: -200 } },
  { id: "evacuationOrder", name: "Sector Evacuation Order", category: "emergency", description: "Evacuate endangered sectors to safe zones.", costPerTick: 2500, effects: { happiness: -2, unrest: 2, defenseRating: 1, crime: 1 } },
  { id: "emergencyMedicalSurge", name: "Emergency Medical Surge", category: "emergency", description: "Deploy all available medical personnel and supplies.", costPerTick: 2000, effects: { medProduction: 15, happiness: 2, populationGrowthRate: 0.001 } },
  { id: "communicationsBlackout", name: "Communications Blackout", category: "emergency", description: "Shut down non-essential communications to prevent panic.", costPerTick: 0, effects: { unrest: -2, happiness: -4, tradeIncome: -400, crime: 2, lawOrder: 2 } },
  { id: "emergencyRecruitment", name: "Emergency Recruitment Drive", category: "emergency", description: "Fast-track recruitment of enforcement and defense personnel.", costPerTick: 1500, effects: { defenseRating: 2, lawOrder: 2, employment: 3, happiness: -1 } },
  { id: "shelterInPlace", name: "Shelter-In-Place Order", category: "emergency", description: "Order all citizens to remain in their habitation blocks.", costPerTick: 0, effects: { crime: -4, happiness: -5, employment: -4, unrest: 3, tradeIncome: -500 } },
  { id: "emergencyTaxLevy", name: "Emergency Tax Levy", category: "emergency", description: "Impose emergency taxes on all citizens and businesses.", costPerTick: -5000, effects: { happiness: -4, unrest: 3, taxIncome: 800 } },

  // ── LAW ENFORCEMENT (5 additional) ──────────────────────────────────
  { id: "dronesOnPatrol", name: "Autonomous Patrol Drones", category: "lawEnforcement", description: "Deploy AI-piloted micro-drones for constant aerial surveillance of high-crime zones.", costPerTick: 1100, effects: { crime: -3, lawOrder: 2, happiness: -1 }, prerequisites: ["tactical_drone_swarms"] },
  { id: "witnessProtection", name: "Witness Protection Program", category: "lawEnforcement", description: "Shield informants and witnesses to encourage testimony against organized crime.", costPerTick: 700, effects: { crime: -2, corruption: -1, happiness: 1 } },
  { id: "forensicBioScanning", name: "Forensic Bio-Scanning", category: "lawEnforcement", description: "Mandatory biometric scans at crime scenes using DNA micro-analysis drones.", costPerTick: 900, effects: { crime: -2, lawOrder: 2 } },
  { id: "underCoverOps", name: "Undercover Operations Division", category: "lawEnforcement", description: "Deep-cover agents infiltrate criminal organizations from within.", costPerTick: 1400, effects: { crime: -3, corruption: -2, lawOrder: 1 } },
  { id: "civilianBountySystem", name: "Civilian Bounty System", category: "lawEnforcement", description: "Offer credit bounties to citizens who report criminal activity.", costPerTick: 500, effects: { crime: -2, happiness: -1, corruption: 1, lawOrder: 1 } },
  { id: "viceBan", name: "Municipal Vice Ban", category: "lawEnforcement", description: "Outlaws speakeasies, hookah lounges, jazz clubs, and sports bars. Crime drops, happiness drops harder, and the underground gets richer.", costPerTick: 600, effects: { crime: -3, happiness: -4, lawOrder: 2, corruption: 2, unrest: 2, taxIncome: -150 } },

  // ── ECONOMIC (5 additional) ─────────────────────────────────────────
  { id: "universalBasicIncome", name: "Universal Basic Income", category: "economic", description: "Provide a minimum credit allowance to every registered citizen.", costPerTick: 3000, effects: { happiness: 4, unrest: -3, employment: -2, crime: -1 } },
  { id: "corporateTaxOverhaul", name: "Corporate Tax Overhaul", category: "economic", description: "Restructure business taxes to close loopholes and boost revenue.", costPerTick: 200, effects: { taxIncome: 600, corruption: -1, happiness: -1 } },
  { id: "blackMarketTolerance", name: "Black Market Tolerance Zone", category: "economic", description: "Designate unofficial trade zones where black market activity is overlooked.", costPerTick: 0, effects: { tradeIncome: 500, crime: 3, corruption: 2, happiness: 1, employment: 2 } },
  { id: "cryptoCurrencyAdoption", name: "Crypto-Currency Adoption", category: "economic", description: "Legalize decentralized digital currencies alongside official credits.", costPerTick: 300, effects: { tradeIncome: 300, taxIncome: -200, crime: 1, corruption: 1 } },
  { id: "debtCollectiveProgram", name: "Collective Debt Program", category: "economic", description: "Pool citizen debts into government-managed bonds to lower interest.", costPerTick: 800, effects: { happiness: 2, unrest: -1, taxIncome: 100 } },

  // ── INFRASTRUCTURE (5 additional) ───────────────────────────────────
  { id: "pneumaticFreightNetwork", name: "Pneumatic Freight Network", category: "infrastructure", description: "Install pressurized tube freight systems for rapid goods transport.", costPerTick: 1800, effects: { tradeIncome: 250, goodsProduction: 5, employment: 2, infrastructureHealth: 1 } },
  { id: "verticalFarmingMandate", name: "Vertical Farming Mandate", category: "infrastructure", description: "Require all new towers to incorporate hydroponic food production.", costPerTick: 1000, effects: { foodProduction: 15, happiness: 1, employment: 2 } },
  { id: "solarCanopyProject", name: "Solar Canopy Project", category: "infrastructure", description: "Install solar collection arrays across rooftops and skyways.", costPerTick: 900, effects: { powerGeneration: 25, infrastructureHealth: 1 } },
  { id: "sewerRehabProgram", name: "Deep Sewer Rehabilitation", category: "infrastructure", description: "Restore the failing undercity sewage and drainage systems.", costPerTick: 1200, effects: { infrastructureHealth: 2, happiness: 1, waterProduction: 10 } },
  { id: "elevatedHighwayExpansion", name: "Elevated Highway Expansion", category: "infrastructure", description: "Construct new skyway highways to relieve ground-level congestion.", costPerTick: 2200, effects: { tradeIncome: 200, employment: 3, happiness: 1, infrastructureHealth: 1 } },

  // ── CYBERNETIC & TECHNOLOGY (5 additional) ──────────────────────────
  { id: "neuralWorkforceProgram", name: "Neural Workforce Uplink", category: "cyberTech", description: "Government-subsidized brain-computer interfaces for skilled workers.", costPerTick: 1600, effects: { employment: 3, researchSpeed: 2, happiness: 1, crime: 1 }, prerequisites: ["basic_cybernetics"] },
  { id: "biosyntheticOrgans", name: "Biosynthetic Organ Program", category: "cyberTech", description: "Fund mass production of lab-grown replacement organs.", costPerTick: 1400, effects: { happiness: 2, populationGrowthRate: 0.001, medProduction: 5 } },
  { id: "hackingCountermeasures", name: "Hacking Countermeasures Act", category: "cyberTech", description: "Mandate anti-intrusion firmware in all networked public infrastructure.", costPerTick: 800, effects: { crime: -2, infrastructureHealth: 1, lawOrder: 1 } },
  { id: "roboticCitizenshipDebate", name: "Synthetic Rights Debate", category: "cyberTech", description: "Open legislative debate on sentient AI and android civil rights.", costPerTick: 100, effects: { happiness: 1, unrest: 2, researchSpeed: 1 } },
  { id: "techRecyclingFund", name: "Tech Recycling Initiative", category: "cyberTech", description: "Mandate recycling of obsolete cybernetics and electronics for raw materials.", costPerTick: 400, effects: { steelProduction: 5, goodsProduction: 3, happiness: 1 } },

  // ── HEALTH & SOCIAL (5 additional) ──────────────────────────────────
  { id: "cyberpsychosisScreening", name: "Cyberpsychosis Screening", category: "healthSocial", description: "Mandatory psychological evaluations for heavily augmented citizens.", costPerTick: 900, effects: { crime: -2, happiness: -1, medProduction: -2 } },
  { id: "organDonorRegistry", name: "Mandatory Organ Donor Registry", category: "healthSocial", description: "All citizens registered as organ donors unless they opt out.", costPerTick: 200, effects: { happiness: -1, medProduction: 3, populationGrowthRate: 0.001 } },
  { id: "homelessResettlement", name: "Homeless Resettlement Initiative", category: "healthSocial", description: "Provide temporary housing and job placement for homeless citizens.", costPerTick: 1500, effects: { happiness: 3, crime: -2, employment: 2, unrest: -2 } },
  { id: "pandemicPreparedness", name: "Pandemic Preparedness Fund", category: "healthSocial", description: "Stockpile medical supplies and train response teams for future outbreaks.", costPerTick: 800, effects: { medProduction: 8, happiness: 1, populationGrowthRate: 0.001 } },
  { id: "birthRateIncentive", name: "Birth Rate Incentive Program", category: "healthSocial", description: "Financial bonuses for families with newborns to combat population decline.", costPerTick: 1200, effects: { populationGrowthRate: 0.003, happiness: 2, employment: -1 } },

  // ── ENVIRONMENTAL (5 additional) ────────────────────────────────────
  { id: "acidRainShields", name: "Acid Rain Shield Network", category: "environmental", description: "Deploy atmospheric neutralization drones to counter acid precipitation.", costPerTick: 1500, effects: { happiness: 2, infrastructureHealth: 1, populationGrowthRate: 0.001 } },
  { id: "underCityReclamation", name: "Undercity Reclamation Project", category: "environmental", description: "Reclaim toxic undercity zones for habitable use.", costPerTick: 2000, effects: { happiness: 2, employment: 3, populationGrowthRate: 0.001, crime: -1 } },
  { id: "lightPollutionControl", name: "Light Pollution Control", category: "environmental", description: "Regulate neon and holographic advertising to reduce light pollution.", costPerTick: 300, effects: { happiness: 2, tradeIncome: -100 } },
  { id: "contaminationSensors", name: "Contamination Sensor Grid", category: "environmental", description: "Deploy chemical and biological contamination detectors city-wide.", costPerTick: 600, effects: { happiness: 1, populationGrowthRate: 0.001, defenseRating: 1 } },
  { id: "skyGardenInitiative", name: "Sky Garden Initiative", category: "environmental", description: "Convert upper-level rooftops into public gardens and oxygen farms.", costPerTick: 900, effects: { happiness: 3, foodProduction: 8, populationGrowthRate: 0.001 } },

  // ── CIVIL RIGHTS (5 additional) ─────────────────────────────────────
  { id: "androidEmancipation", name: "Android Emancipation Act", category: "civilRights", description: "Grant legal personhood to sentient androids and synthetics.", costPerTick: 0, effects: { happiness: 2, unrest: 3, employment: -1, researchSpeed: 1 } },
  { id: "universalVoting", name: "Universal Voting Rights", category: "civilRights", description: "Extend voting rights to all beings within city limits regardless of origin.", costPerTick: 100, effects: { happiness: 3, unrest: 1, corruption: -2, lawOrder: -1 } },
  { id: "informationFreedomAct", name: "Information Freedom Act", category: "civilRights", description: "Citizens have unrestricted access to government databases and research.", costPerTick: 0, effects: { happiness: 2, corruption: -2, crime: 1, researchSpeed: 1 } },
  { id: "antiSurveillanceProtection", name: "Anti-Surveillance Protection", category: "civilRights", description: "Prohibit government tracking of citizens outside active investigations.", costPerTick: 0, effects: { happiness: 3, crime: 3, lawOrder: -3, corruption: -1 } },
  { id: "rightToDisconnect", name: "Right to Disconnect", category: "civilRights", description: "Citizens may legally refuse neural network connections and data sharing.", costPerTick: 0, effects: { happiness: 2, employment: -1, researchSpeed: -1 } },

  // ── MILITARY & DEFENSE (5 additional) ───────────────────────────────
  { id: "orbitalDefensePlatform", name: "Orbital Defense Priority", category: "militaryDefense", description: "Divert resources to maintaining orbital weapon platforms.", costPerTick: 3000, effects: { defenseRating: 5, powerGeneration: -20, steelProduction: -5 } },
  { id: "mechanizedInfantry", name: "Mechanized Infantry Program", category: "militaryDefense", description: "Equip ground forces with powered exoskeletons and heavy weapons.", costPerTick: 2000, effects: { defenseRating: 3, employment: 2, steelProduction: -3 } },
  { id: "cyberWarfareDivision", name: "Cyber Warfare Division", category: "militaryDefense", description: "Establish a dedicated unit for offensive and defensive cyber operations.", costPerTick: 1500, effects: { defenseRating: 2, crime: -1, corruption: -1 }, prerequisites: ["quantum_data_centers"] },
  { id: "wastelandScoutCorps", name: "Wasteland Scout Corps", category: "militaryDefense", description: "Send ranger teams beyond city borders for intelligence and salvage.", costPerTick: 800, effects: { defenseRating: 1, tradeIncome: 200, steelProduction: 3 } },
  { id: "civilianMilitiaAct", name: "Civilian Militia Act", category: "militaryDefense", description: "Authorize citizen militias to supplement city defense forces.", costPerTick: 400, effects: { defenseRating: 2, happiness: -1, crime: 1, unrest: 1 } },

  // ── CULTURAL (5 additional) ─────────────────────────────────────────
  { id: "mandatoryLiteracy", name: "Mandatory Literacy Program", category: "cultural", description: "Universal education mandate ensuring all citizens can read and compute.", costPerTick: 1000, effects: { happiness: 2, employment: 2, researchSpeed: 1, crime: -1 } },
  { id: "digitalArtsFund", name: "Digital Arts Funding", category: "cultural", description: "Support holographic art, VR experiences, and digital creative works.", costPerTick: 600, effects: { happiness: 2, unrest: -1, tradeIncome: 100 } },
  { id: "heritageMonthDecree", name: "Heritage Month Decree", category: "cultural", description: "Monthly celebrations of pre-catastrophe culture and history.", costPerTick: 400, effects: { happiness: 2, unrest: -1 } },
  { id: "publicDebateForum", name: "Public Debate Forums", category: "cultural", description: "Open forums where citizens can publicly debate government policy.", costPerTick: 200, effects: { happiness: 1, unrest: 1, corruption: -1 } },
  { id: "xenoCulturalStudies", name: "Xeno-Cultural Studies", category: "cultural", description: "Research and celebrate mutant and non-human cultural traditions.", costPerTick: 500, effects: { happiness: 2, unrest: -1, researchSpeed: 1 } },

  // ── EMERGENCY (5 additional) ────────────────────────────────────────
  { id: "radiationDecontamination", name: "Radiation Decontamination", category: "emergency", description: "Emergency irradiation cleanup of contaminated sectors.", costPerTick: 2500, effects: { happiness: 1, populationGrowthRate: 0.001, infrastructureHealth: 1 } },
  { id: "crashEvacTransit", name: "Emergency Evacuation Transit", category: "emergency", description: "Activate emergency subway and airship evacuation routes.", costPerTick: 1800, effects: { happiness: -1, defenseRating: 1, unrest: 1, crime: -1 } },
  { id: "martialMedicalAuth", name: "Martial Medical Authority", category: "emergency", description: "Grant emergency medical powers to enforce quarantine and treatment.", costPerTick: 1200, effects: { medProduction: 10, happiness: -3, lawOrder: 2 } },
  { id: "emergencyCreditFreeze", name: "Emergency Credit Freeze", category: "emergency", description: "Freeze all private banking to prevent economic panic.", costPerTick: 0, effects: { tradeIncome: -600, happiness: -4, unrest: 2, corruption: -2 } },
  { id: "volunteerMobilization", name: "Volunteer Mobilization Order", category: "emergency", description: "Call upon civilian volunteers for disaster relief and aid.", costPerTick: 500, effects: { happiness: 2, employment: 2, infrastructureHealth: 1, unrest: -1 } },

  // ── RELIGION & CULT OVERSIGHT (30) ────────────────────────────────────
  { id: "stateAtheismDecree", name: "State Atheism Decree", category: "religion", description: "All religious practice banned. Temples repurposed as storage. The state is the only higher power.", costPerTick: 400, effects: { happiness: -4, unrest: 3, corruption: -2, lawOrder: 2 } },
  { id: "religiousFreedomAct", name: "Religious Freedom Act", category: "religion", description: "Citizens may worship freely. Temples, shrines, and gatherings permitted without license.", costPerTick: 200, effects: { happiness: 3, unrest: -2, corruption: 1 } },
  { id: "cultMonitoringBureau", name: "Cult Monitoring Bureau", category: "religion", description: "Dedicated agency tracks fringe religious movements, infiltrates leadership, and reports on recruitment.", costPerTick: 600, effects: { crime: -2, lawOrder: 2, happiness: -1 } },
  { id: "stateSponsoredFaith", name: "State-Sponsored Faith", category: "religion", description: "Government endorses an official religion. Subsidized worship. Dissenting faiths discouraged.", costPerTick: 800, effects: { happiness: 2, unrest: -3, corruption: 2 } },
  { id: "taxExemptTemples", name: "Tax-Exempt Temples", category: "religion", description: "Religious institutions pay no taxes. Popular with the faithful. Less popular with the treasury.", costPerTick: 500, effects: { happiness: 3, taxIncome: -5, unrest: -2 } },
  { id: "mandatoryWorship", name: "Mandatory Worship Attendance", category: "religion", description: "All citizens required to attend weekly state-approved services. Compliance is monitored.", costPerTick: 600, effects: { happiness: -3, unrest: 2, lawOrder: 3, crime: -1 } },
  { id: "religiousEducation", name: "Religious Education Mandate", category: "religion", description: "State religion taught in all schools. History rewritten to include divine mandate of the Commander.", costPerTick: 400, effects: { happiness: 1, unrest: -1, researchSpeed: -1 } },
  { id: "prophetProtectionAct", name: "Prophet Protection Act", category: "religion", description: "Religious leaders given state protection, security details, and diplomatic immunity.", costPerTick: 300, effects: { happiness: 2, corruption: 2, crime: -1 } },
  { id: "heresyLaws", name: "Heresy Laws", category: "religion", description: "Speaking against the state faith is a criminal offense. Blasphemy carries severe penalties.", costPerTick: 500, effects: { happiness: -4, unrest: -2, lawOrder: 3, crime: -2 } },
  { id: "cultCrackdownSquad", name: "Cult Crackdown Squad", category: "religion", description: "Armed response teams raid cult compounds and arrest charismatic leaders.", costPerTick: 900, effects: { crime: -3, unrest: 2, happiness: -2, lawOrder: 2 } },
  { id: "divineMandateOfCommander", name: "Divine Mandate of Commander", category: "religion", description: "Declare yourself divinely appointed. All resistance is heresy. All obedience is worship.", costPerTick: 1000, effects: { happiness: -2, unrest: -4, lawOrder: 4, corruption: 3 } },
  { id: "templeDistrictFunding", name: "Temple District Funding", category: "religion", description: "Dedicate city funds to build and maintain religious districts. Architecture as devotion.", costPerTick: 700, effects: { happiness: 3, employment: 2, unrest: -2 } },
  { id: "interfaithDialogueCouncil", name: "Interfaith Dialogue Council", category: "religion", description: "Establish a council where representatives of all faiths discuss coexistence. Mostly shouting.", costPerTick: 300, effects: { happiness: 2, unrest: -2, corruption: -1 } },
  { id: "religiousPolice", name: "Religious Police Force", category: "religion", description: "Vice squad enforcing moral codes. Dress codes, behavioral standards, mandatory prayer times.", costPerTick: 800, effects: { crime: -3, happiness: -5, unrest: 3, lawOrder: 3 } },
  { id: "sacredHolidayDecrees", name: "Sacred Holiday Decrees", category: "religion", description: "Mandatory religious holidays. Production stops. Citizens celebrate. Or else.", costPerTick: 400, effects: { happiness: 3, employment: -2, unrest: -1 } },
  { id: "relicRecoveryProgram", name: "Relic Recovery Program", category: "religion", description: "Fund expeditions to recover pre-catastrophe religious artifacts. Archaeological faith.", costPerTick: 500, effects: { happiness: 2, researchSpeed: 1, tradeIncome: 200 } },
  { id: "deathCultSuppression", name: "Death Cult Suppression", category: "religion", description: "Aggressive action against nihilistic doomsday cults recruiting in the slums.", costPerTick: 700, effects: { crime: -2, unrest: -1, happiness: 1, lawOrder: 2 } },
  { id: "faithBasedWelfare", name: "Faith-Based Welfare", category: "religion", description: "Religious organizations administer food banks and shelters. Charity with a sermon.", costPerTick: 600, effects: { happiness: 3, foodProduction: 3, unrest: -2, corruption: 1 } },
  { id: "pilgrimageTourism", name: "Pilgrimage Tourism", category: "religion", description: "Market the city's temples as pilgrimage destinations. Holy sites bring holy revenue.", costPerTick: 300, effects: { happiness: 1, tradeIncome: 400 } },
  { id: "technoPriestInitiative", name: "Techno-Priest Initiative", category: "religion", description: "Merge religious devotion with technological worship. The Machine God demands upgrades.", costPerTick: 600, effects: { researchSpeed: 2, happiness: 1, unrest: -1 } },
  { id: "confessionSurveillance", name: "Confession Surveillance", category: "religion", description: "Monitor confessional booths for intelligence. Trust in God. The state trusts in data.", costPerTick: 500, effects: { crime: -2, lawOrder: 2, happiness: -3, corruption: 1 } },
  { id: "monasticLabor", name: "Monastic Labor Program", category: "religion", description: "Religious orders contribute manual labor. Vows of poverty make them cheap.", costPerTick: 200, effects: { employment: 3, happiness: -1 } },
  { id: "exorcismServices", name: "State Exorcism Services", category: "religion", description: "Government-funded exorcists respond to reports of demonic activity. Surprisingly popular.", costPerTick: 400, effects: { happiness: 2, crime: -1, unrest: -1 } },
  { id: "prophetBounties", name: "False Prophet Bounties", category: "religion", description: "Cash rewards for reporting unauthorized religious leaders. Faith meets capitalism.", costPerTick: 500, effects: { crime: -1, corruption: 2, happiness: -2, lawOrder: 2 } },
  { id: "spiritualRehabProgram", name: "Spiritual Rehabilitation", category: "religion", description: "Mandatory deprogramming for cult members. Reconditioning through state-approved spirituality.", costPerTick: 600, effects: { happiness: -1, unrest: -2, lawOrder: 1 } },
  { id: "divineArchitectureCode", name: "Divine Architecture Code", category: "religion", description: "All new buildings must incorporate religious symbols and scripture. The city itself becomes a temple.", costPerTick: 400, effects: { happiness: 2, infrastructureHealth: 1, unrest: -1 } },
  { id: "apocalypsePrepFund", name: "Apocalypse Preparation Fund", category: "religion", description: "Stockpile supplies for prophesied end times. Doomsday bunkers for the faithful.", costPerTick: 800, effects: { defenseRating: 2, happiness: -1, foodProduction: 2 } },
  { id: "holyWarDoctrine", name: "Holy War Doctrine", category: "religion", description: "Military operations framed as divine crusades. Soldiers fight with zealous fervor.", costPerTick: 1000, effects: { defenseRating: 4, happiness: -3, unrest: 3 } },
  { id: "sanctifiedCensorship", name: "Sanctified Censorship", category: "religion", description: "Ban all media deemed blasphemous. Only state-faith-approved content allowed.", costPerTick: 500, effects: { happiness: -3, unrest: -2, lawOrder: 2, researchSpeed: -1 } },
  { id: "tithingEnforcement", name: "Mandatory Tithing", category: "religion", description: "10% of all citizen income collected as religious tax. The state collects on God's behalf.", costPerTick: 0, effects: { taxIncome: 8, happiness: -3, unrest: 2, corruption: 2 } },
  { id: "theocraticConstitution", name: "Theocratic Constitution", category: "religion", description: "Replace secular law with religious scripture as the supreme legal authority.", costPerTick: 1200, effects: { happiness: -2, unrest: -4, lawOrder: 5, corruption: 3, researchSpeed: -2 } },
  { id: "messiahDeclaration", name: "Messiah Declaration", category: "religion", description: "Declare yourself the prophesied savior. Dissent is apostasy. Obedience is salvation.", costPerTick: 1500, effects: { happiness: -5, unrest: -6, lawOrder: 6, corruption: 4 } },
  { id: "inquisitionBureau", name: "Grand Inquisition Bureau", category: "religion", description: "Establish an inquisitorial body to root out heretics and apostates through any means necessary.", costPerTick: 1000, effects: { crime: -4, happiness: -6, unrest: -3, lawOrder: 4, corruption: 3 } },
  { id: "sacredMilitia", name: "Sacred Militia Conscription", category: "religion", description: "Arm the faithful. Religious zealots patrol streets enforcing moral law.", costPerTick: 800, effects: { crime: -3, happiness: -4, defenseRating: 3, unrest: 2 } },
  { id: "oracleNetwork", name: "Oracle Network", category: "religion", description: "Network of 'prophets' in each sector providing divine guidance that suspiciously aligns with policy goals.", costPerTick: 600, effects: { happiness: 2, corruption: 3, unrest: -2, lawOrder: 1 } },
  { id: "martyrFund", name: "Martyr Commemoration Fund", category: "religion", description: "Honor those who died for the faith with monuments and pensions for families. Sacrifice sanctified.", costPerTick: 400, effects: { happiness: 2, unrest: -2, defenseRating: 1 } },
  { id: "geneticPurityDoctrine", name: "Genetic Purity Doctrine", category: "religion", description: "Religious decree that genetic modification is an abomination. Nature's design is divine.", costPerTick: 500, effects: { happiness: -2, unrest: 2, researchSpeed: -2 } },
  { id: "spiritTax", name: "Spirit Tax", category: "religion", description: "Tax on non-believers. The faithless subsidize the faithful. Pay for salvation or pay anyway.", costPerTick: 0, effects: { taxIncome: 5, happiness: -4, unrest: 3 } },
  { id: "deificationProgram", name: "Commander Deification Program", category: "religion", description: "Build a cult of personality around yourself. Living god status. Statues mandatory.", costPerTick: 2000, effects: { happiness: -3, unrest: -5, lawOrder: 5, corruption: 5 } },
  { id: "sacredGroundAct", name: "Sacred Ground Act", category: "religion", description: "Designate entire city sectors as holy ground. Building restrictions apply. Shoes optional.", costPerTick: 400, effects: { happiness: 2, employment: -1, unrest: -1 } },
  { id: "ritualSacrifice", name: "Ritual Sacrifice Legalization", category: "religion", description: "Legalize religious animal sacrifice. Some cults push for more. The line is thin.", costPerTick: 200, effects: { happiness: -2, unrest: -1, foodProduction: 1 } },
  { id: "prophecyDepartment", name: "Ministry of Prophecy", category: "religion", description: "Government department that produces official prophecies. All predictions come true. Eventually.", costPerTick: 600, effects: { happiness: 1, corruption: 3, unrest: -2 } },
  { id: "sanctifiedScience", name: "Sanctified Science Decree", category: "religion", description: "All research must be approved by religious authorities. Science serves faith.", costPerTick: 500, effects: { researchSpeed: -3, happiness: -1, unrest: -2, corruption: 2 } },
  { id: "templeOfCommerce", name: "Temple of Commerce", category: "religion", description: "Merge religious worship with commercial activity. Buy salvation. Trade indulgences.", costPerTick: 300, effects: { tradeIncome: 500, happiness: 1, corruption: 3 } },
  { id: "divineInheritanceLaw", name: "Divine Inheritance Law", category: "religion", description: "Property of the deceased passes to the temple, not heirs. God's will is profitable.", costPerTick: 0, effects: { taxIncome: 4, happiness: -4, unrest: 3, corruption: 2 } },
  { id: "holyWaterTreatment", name: "Holy Water Treatment", category: "religion", description: "Bless the water supply. Citizens drink holy water daily. Placebo effect measured at 3%.", costPerTick: 200, effects: { happiness: 2, waterProduction: 1 } },
  { id: "pilgrimageLevy", name: "Pilgrimage Levy", category: "religion", description: "Tax citizens who fail to make annual pilgrimage to the Grand Temple.", costPerTick: 0, effects: { taxIncome: 3, happiness: -3, unrest: 2 } },
  { id: "cosmicEnlightenment", name: "Cosmic Enlightenment Program", category: "religion", description: "State-funded mystical experiences via neural stimulation. See God for 50 credits.", costPerTick: 700, effects: { happiness: 4, unrest: -3, researchSpeed: -1 } },
  { id: "eternityPledge", name: "Eternity Pledge Mandate", category: "religion", description: "Citizens pledge their eternal soul to the state. Contracts are spiritually binding.", costPerTick: 100, effects: { happiness: -3, unrest: -2, lawOrder: 2 } },

  { id: "biosphereProtectionAct", name: "Biosphere Protection Act", category: "environmental", description: "Strict environmental regulations protecting mutant ecosystems within city limits.", costPerTick: 800, effects: { happiness: 2, tradeIncome: -100 } },
  { id: "upliftCitizenshipProgram", name: "Uplift Citizenship Program", category: "healthSocial", description: "Grant full citizenship rights to uplifted species meeting sapience thresholds.", costPerTick: 600, effects: { happiness: 3, unrest: -2, employment: 2 } },
  { id: "xenofaunaHuntingPermits", name: "Xenofauna Hunting Permits", category: "economic", description: "Regulated hunting of surplus mutant fauna for population control and profit.", costPerTick: -200, effects: { crime: -1, happiness: -1, tradeIncome: 200 } },
  { id: "mandatoryBioDecontamination", name: "Mandatory Bio-Decontamination", category: "healthSocial", description: "All citizens entering contaminated zones must undergo decontamination.", costPerTick: 1000, effects: { happiness: -1, medProduction: 5, crime: -1 } },
  { id: "floraRestorationSubsidy", name: "Flora Restoration Subsidy", category: "environmental", description: "Government subsidies for citizens who cultivate native mutant plant species.", costPerTick: 500, effects: { happiness: 2, foodProduction: 10, employment: 1 } },
  { id: "upliftLabourRegulations", name: "Uplift Labour Regulations", category: "healthSocial", description: "Workplace protections and fair wage requirements for uplift workers.", costPerTick: 400, effects: { happiness: 2, employment: 1, tradeIncome: -50 } },
  { id: "geneticPoachingCrackdown", name: "Genetic Poaching Crackdown", category: "lawEnforcement", description: "Dedicated enforcement squads targeting illegal wildlife trafficking.", costPerTick: 1200, effects: { crime: -3, lawOrder: 2, happiness: 1 } },
  { id: "biosphereResearchGrants", name: "Biosphere Research Grants", category: "economic", description: "Fund xenobiology research programs at public institutions.", costPerTick: 1500, effects: { researchSpeed: 3, happiness: 1, employment: 1 } },
  { id: "interspeciesIntegration", name: "Interspecies Integration Policy", category: "healthSocial", description: "Programs promoting coexistence between human and uplift communities.", costPerTick: 700, effects: { happiness: 3, unrest: -2, crime: -1 } },
  { id: "ecosystemMonitoringNetwork", name: "Ecosystem Monitoring Network", category: "environmental", description: "City-wide sensor grid tracking biosphere health in real-time.", costPerTick: 900, effects: { happiness: 1, medProduction: 3, researchSpeed: 1 } },
  { id: "upliftBreedingControls", name: "Uplift Breeding Controls", category: "healthSocial", description: "Regulate uplift population growth to prevent overpopulation.", costPerTick: 300, effects: { happiness: -3, unrest: 2, employment: -1 } },
  { id: "biohazardInsurance", name: "Biohazard Insurance Mandate", category: "economic", description: "Mandatory insurance for all citizens against bio-contamination events.", costPerTick: 400, effects: { happiness: -1, taxIncome: 200, crime: -1 } },
  { id: "smallBusinessCredit", name: "Small Business Credit Facility", category: "economic", description: "Subsidised loans, rent relief, and licensing waivers for independent shops. Boosts indie spawn rate and shields small businesses from closure.", costPerTick: 1200, effects: { happiness: 2, employment: 2, taxIncome: -100, corruption: 1 } },
  { id: "antiMonopolyAct", name: "Anti-Monopoly Act", category: "economic", description: "Caps corporate-chain expansion citywide and slows new openings. Independents thrive; the conglomerates do not.", costPerTick: 700, effects: { happiness: 2, tradeIncome: -200, corruption: -2, employment: -1 } },
  { id: "wildlifeSanctuaryFunding", name: "Wildlife Sanctuary Funding", category: "environmental", description: "Establish protected reserves within city borders for endangered mutant species.", costPerTick: 1000, effects: { happiness: 3, foodProduction: -5, tradeIncome: 100 } },
  { id: "upliftMilitaryService", name: "Uplift Military Service Act", category: "militaryDefense", description: "Allow uplifted species to serve in military roles.", costPerTick: 200, effects: { defenseRating: 2, employment: 2, happiness: 1, unrest: 1 } },
  { id: "bioWeaponsProhibition", name: "Bio-Weapons Prohibition Treaty", category: "militaryDefense", description: "Ban development and use of biological weapons within city limits.", costPerTick: 0, effects: { happiness: 2, defenseRating: -1, lawOrder: 1 } },

  // ── UTOPIAN INITIATIVES (20) ─────────────────────────────────────────
  { id: "utopianUBI", name: "Universal Basic Income (Utopian)", category: "utopian", description: "Every registered citizen receives a guaranteed monthly credit stipend regardless of employment status. The cost is staggering but the streets are quieter.", costPerTick: 5000, effects: { happiness: 5, unrest: -4, crime: -2, employment: -2, corruption: 1 } },
  { id: "openBordersPolicy", name: "Open Borders Directive", category: "utopian", description: "Remove all border restrictions. Anyone may enter the city freely. The wasteland's tired and hungry pour in — and some of them bring skills, hope, and dangerous ideas.", costPerTick: 1500, effects: { populationGrowthRate: 0.003, happiness: 2, crime: 2, employment: -2, unrest: 1, tradeIncome: 300 } },
  { id: "debtJubilee", name: "Debt Jubilee", category: "utopian", description: "Cancel all citizen debts. Corporate, personal, medical. A clean slate. The banks will hate you. The people will weep with relief.", costPerTick: 4000, effects: { happiness: 6, unrest: -3, taxIncome: -400, corruption: -2, crime: -1 } },
  { id: "fourHourWorkday", name: "Four-Hour Workday", category: "utopian", description: "Mandate a maximum four-hour workday for all sectors. Productivity drops. Happiness soars. The economists are having seizures.", costPerTick: 3000, effects: { happiness: 5, employment: 3, goodsProduction: -8, steelProduction: -5, unrest: -3 } },
  { id: "freePublicTransit", name: "Free Public Transit", category: "utopian", description: "All transit systems operate at zero cost. The sector trains are packed, the streets are clearer, and the lower blocks can finally reach the upper city.", costPerTick: 2500, effects: { happiness: 4, employment: 2, unrest: -2, tradeIncome: 200, crime: -1 } },
  { id: "communalHousing", name: "Communal Housing Programme", category: "utopian", description: "Replace private housing blocks with communal living complexes. Shared kitchens, shared gardens, shared lives. Some call it paradise. Others call it a nightmare.", costPerTick: 3500, effects: { happiness: 4, unrest: -2, crime: -2, employment: 2, corruption: -1 } },
  { id: "universalEducation", name: "Universal Free Education", category: "utopian", description: "Education from cradle to doctorate, funded entirely by the state. Every child learns. Every adult can retrain. Knowledge becomes a right, not a commodity.", costPerTick: 3000, effects: { happiness: 4, researchSpeed: 3, employment: 2, crime: -2, populationGrowthRate: 0.001 } },
  { id: "democraticWorkplace", name: "Democratic Workplace Mandate", category: "utopian", description: "All companies must be worker-owned cooperatives. Management elected by employees. Profits shared equally. The corporations are apoplectic.", costPerTick: 1000, effects: { happiness: 4, employment: 2, corruption: -3, goodsProduction: -3, taxIncome: -200, unrest: -2 } },
  { id: "restorative_justice", name: "Restorative Justice System", category: "utopian", description: "Replace punitive sentencing with mediation, community service, and rehabilitation. Prisons emptied. Reoffending drops. The Judges are confused.", costPerTick: 2000, effects: { happiness: 3, crime: 1, unrest: -2, lawOrder: -1, corruption: -2, employment: 1 } },
  { id: "publicOwnershipUtilities", name: "Public Utility Ownership", category: "utopian", description: "Nationalise all power, water, and waste systems. No more corporate middlemen. Citizens pay nothing for essential services.", costPerTick: 4000, effects: { happiness: 5, powerGeneration: 10, waterProduction: 10, corruption: -2, taxIncome: -500 } },
  { id: "universalMentalHealth", name: "Universal Mental Health Access", category: "utopian", description: "Free psychological and psychiatric care for every citizen. Trauma counselling, addiction support, cyberpsychosis prevention — the invisible wounds of the city, finally treated.", costPerTick: 2500, effects: { happiness: 4, crime: -2, unrest: -2, medProduction: -5, employment: 1 } },
  { id: "greenNewCity", name: "Green New City Initiative", category: "utopian", description: "Massive investment in renewable infrastructure, urban farming, and atmospheric cleaning. The air tastes different. The sky looks bluer. It only costs everything.", costPerTick: 5000, effects: { happiness: 4, powerGeneration: 20, foodProduction: 15, populationGrowthRate: 0.002, steelProduction: -5, employment: 3 } },
  { id: "artForAll", name: "Art For All Programme", category: "utopian", description: "Fund artists, musicians, writers, and performers as essential workers. Murals replace advertisements. Music fills the transit corridors. Beauty as public infrastructure.", costPerTick: 1500, effects: { happiness: 4, unrest: -3, crime: -1, employment: 2 } },
  { id: "citizensAssembly", name: "Citizens' Assembly", category: "utopian", description: "Establish a randomly-selected citizens' assembly with real legislative power. Democracy by lottery. The people govern themselves — messily, loudly, and sometimes brilliantly.", costPerTick: 1000, effects: { happiness: 3, corruption: -4, unrest: 2, lawOrder: -1 } },
  { id: "utopianDisconnect", name: "Right to Disconnect Act (Utopian)", category: "utopian", description: "Citizens have a legal right to go offline. No surveillance, no tracking, no neural-net monitoring during personal hours. Privacy restored by law.", costPerTick: 500, effects: { happiness: 4, crime: 2, lawOrder: -2, corruption: -2, unrest: -1 } },
  { id: "landValueTax", name: "Land Value Tax Reform", category: "utopian", description: "Replace all taxation with a single tax on land value. Landowners pay. Renters don't. Speculators flee. The housing market undergoes cardiac arrest — then recovers healthier.", costPerTick: 0, effects: { happiness: 3, taxIncome: 600, corruption: -2, employment: 1, unrest: 1 } },
  { id: "foodSovereignty", name: "Food Sovereignty Act", category: "utopian", description: "Every district must produce at least thirty percent of its own food. Rooftop farms, vertical gardens, community kitchens. The city feeds itself.", costPerTick: 2000, effects: { happiness: 3, foodProduction: 20, employment: 3, tradeIncome: -200, unrest: -1 } },
  { id: "techForAll", name: "Technology Commons", category: "utopian", description: "All patents and intellectual property become public domain after three years. Innovation explodes. Corporate R&D departments collapse. Knowledge belongs to everyone.", costPerTick: 800, effects: { researchSpeed: 4, happiness: 3, tradeIncome: -300, corruption: -1, employment: 1 } },
  { id: "elderCouncil", name: "Elder Council Authority", category: "utopian", description: "Grant governance authority to a council of the city's oldest citizens. Their memory stretches back before the walls. Their wisdom is slow but deep.", costPerTick: 500, effects: { happiness: 2, corruption: -3, unrest: -2, researchSpeed: -1, lawOrder: 1 } },
  { id: "sanctuaryCity", name: "Sanctuary City Declaration", category: "utopian", description: "Declare the city a sanctuary for all — mutants, refugees, political exiles, the displaced and desperate. Every soul is welcome. The consequences are profound.", costPerTick: 3000, effects: { happiness: 4, populationGrowthRate: 0.003, crime: 1, unrest: 1, employment: -1, corruption: -2, tradeIncome: 200 } },

  // ── ORWELLIAN OVERSIGHT (10) ─────────────────────────────────────────
  { id: "thoughtcrimeUnit", name: "Thoughtcrime Prevention Unit", category: "orwellian", description: "Neural monitoring agents embedded in every sector. Citizens are scanned for disloyal thought patterns. Those who think wrongly are disappeared. Those who remain learn to think correctly.", costPerTick: 1800, effects: { crime: -4, happiness: -6, unrest: -4, lawOrder: 4, corruption: 2 } },
  { id: "memoryHoleDepartment", name: "Ministry of Memory", category: "orwellian", description: "A department dedicated to rewriting history. Unfavorable records are destroyed. Inconvenient people are erased from archives. The past is whatever you say it is.", costPerTick: 1200, effects: { happiness: -2, unrest: -3, corruption: 3, lawOrder: 2, researchSpeed: -1 } },
  { id: "doublespeakProtocol", name: "Doublespeak Protocol", category: "orwellian", description: "Official communications use deliberately inverted language. War is Peace. Freedom is Slavery. Citizens who question the contradictions are flagged for re-education.", costPerTick: 600, effects: { happiness: -3, unrest: -2, lawOrder: 2, corruption: 2 } },
  { id: "telescreenNetwork", name: "Telescreen Network", category: "orwellian", description: "Mandatory two-way screens in every habitation unit. The state watches you eat. The state watches you sleep. The state watches you watching the state. There is no off switch.", costPerTick: 2000, effects: { crime: -5, happiness: -7, unrest: -3, lawOrder: 5, corruption: 1 } },
  { id: "unpersonProtocol", name: "Unperson Protocol", category: "orwellian", description: "Citizens who commit thoughtcrime are declared unpersons. Their names are erased. Their families are relocated. They never existed. You never knew them.", costPerTick: 800, effects: { crime: -2, happiness: -5, unrest: -4, lawOrder: 3, populationGrowthRate: -0.001 } },
  { id: "newspeakMandate", name: "Newspeak Standardization Act", category: "orwellian", description: "Replace the common tongue with a reduced vocabulary designed to make dissent linguistically impossible. Fewer words. Fewer thoughts. Fewer problems.", costPerTick: 500, effects: { happiness: -4, unrest: -3, researchSpeed: -2, lawOrder: 2, corruption: 1 } },
  { id: "joyDivision", name: "Mandatory Joy Sessions", category: "orwellian", description: "Daily compulsory happiness exercises broadcast via telescreen. Citizens perform government-approved smiling. Refusal is reported. Sadness is sedition.", costPerTick: 700, effects: { happiness: -1, unrest: -3, lawOrder: 1, crime: -1 } },
  { id: "innerPartyPrivilege", name: "Inner Party Privilege System", category: "orwellian", description: "A tiered citizenship system. Inner Party members receive luxury rations, real coffee, and the ability to turn off their telescreens for thirty minutes daily. Everyone else gets victory gin.", costPerTick: 1500, effects: { happiness: -4, unrest: 2, corruption: 4, lawOrder: 2, employment: 1 } },
  { id: "perpetualWarDoctrine", name: "Perpetual War Doctrine", category: "orwellian", description: "The city is always at war. The enemy changes but the war never ends. Resources are diverted. Citizens rally. Questions are treason. The war is the point.", costPerTick: 2500, effects: { defenseRating: 4, happiness: -3, unrest: -4, employment: 3, steelProduction: -5, goodsProduction: -3 } },
  { id: "childrensSpyLeague", name: "Children's Spy League", category: "orwellian", description: "Youth organizations that train children to monitor and report their parents. Good children report thoughtcrime. The best children report it before it happens.", costPerTick: 400, effects: { crime: -3, happiness: -6, unrest: -2, lawOrder: 3, corruption: 2, populationGrowthRate: -0.001 } },

  // ── TYRANNICAL EDICTS (10) ───────────────────────────────────────────
  { id: "publicExecutions", name: "Public Execution Broadcasts", category: "tyrannical", description: "Convicted criminals executed live on every telescreen. Attendance at public squares is mandatory. The crowd cheers because the crowd has learned what happens when it doesn't.", costPerTick: 300, effects: { crime: -5, happiness: -8, unrest: -3, lawOrder: 4, corruption: 1 } },
  { id: "collectivePunishment", name: "Collective Punishment Doctrine", category: "tyrannical", description: "When one citizen commits a crime, their entire habitation block is punished. Fines, ration cuts, curfews. Neighbors become enforcers. Trust becomes a liability.", costPerTick: 0, effects: { crime: -4, happiness: -7, unrest: -2, lawOrder: 3, corruption: 2, populationGrowthRate: -0.001 } },
  { id: "forcedLabourCamps", name: "Forced Labour Camps", category: "tyrannical", description: "Dissidents, debtors, and the inconvenient are sent to camps beyond the wall. They break rocks. They build roads. They do not return. Production targets are always met.", costPerTick: -2000, effects: { employment: 4, happiness: -8, unrest: -5, steelProduction: 8, crime: -3, corruption: 3, populationGrowthRate: -0.002 } },
  { id: "fearTax", name: "Fear Tax", category: "tyrannical", description: "An arbitrary levy assessed at random intervals on random citizens. The amount is unpredictable. The reasoning is opaque. The only certainty is that it will come for you eventually.", costPerTick: 0, effects: { taxIncome: 600, happiness: -5, unrest: 2, crime: -1, corruption: 3 } },
  { id: "informantBonuses", name: "Informant Bonus Network", category: "tyrannical", description: "Pay citizens to inform on each other. Neighbor against neighbor. Friend against friend. The most prolific informants receive better rations. Trust costs too much.", costPerTick: 1000, effects: { crime: -4, happiness: -6, unrest: -2, corruption: 3, lawOrder: 3 } },
  { id: "curfewAbsolute", name: "Absolute Curfew Enforcement", category: "tyrannical", description: "No citizen moves after dark. Patrol drones shoot on sight. The night belongs to the state. Those found outside are arrested — if they're lucky.", costPerTick: 1200, effects: { crime: -6, happiness: -7, unrest: -1, lawOrder: 4, tradeIncome: -300, employment: -2 } },
  { id: "purgeWeek", name: "Purge Week Authorization", category: "tyrannical", description: "One week per season, enforcement is withdrawn from designated sectors. Citizens settle their own scores. The streets run red. Afterward, the survivors are remarkably well-behaved.", costPerTick: -500, effects: { crime: 2, happiness: -6, unrest: -5, lawOrder: -2, populationGrowthRate: -0.002, defenseRating: 1 } },
  { id: "loyaltyScoring", name: "Citizen Loyalty Score", category: "tyrannical", description: "Every citizen receives a score. High scores earn ration bonuses. Low scores earn scrutiny. The algorithm is secret. The criteria are opaque. Everyone smiles. Everyone is terrified.", costPerTick: 800, effects: { crime: -3, happiness: -5, unrest: -4, lawOrder: 3, corruption: 2, employment: 1 } },
  { id: "hostageGovernance", name: "Hostage Governance Protocol", category: "tyrannical", description: "Family members of key personnel held in secure facilities as 'guests of the state.' Loyalty is guaranteed. Defection is unthinkable. Everyone does their job very, very well.", costPerTick: 600, effects: { corruption: -3, happiness: -6, unrest: -2, lawOrder: 3, employment: 2 } },
  { id: "decimationPolicy", name: "Decimation Policy", category: "tyrannical", description: "For every act of organized resistance, one in ten residents of the offending sector is selected at random for public punishment. The math is simple. The message is clear.", costPerTick: 0, effects: { crime: -5, happiness: -9, unrest: -6, lawOrder: 5, populationGrowthRate: -0.002, corruption: 2 } },

  // ── ECONOMY & MARKETPLACE POLICIES ────────────────────────────────────
  { id: "smallBusinessStimulus", name: "Small Business Stimulus", category: "economic", description: "Tax credits, cheap commercial leases, and storefront grants for independent operators. The street level fills with new shops. The chain stores grumble.", costPerTick: 1500, effects: { happiness: 4, employment: 2, tradeIncome: 200 } },
  { id: "corporateWelcomeMat", name: "Corporate Welcome Mat", category: "economic", description: "Permits expedited, leases subsidized, paperwork waived — for chains. Independent applications go to the back of the queue. Brand uniformity arrives by the convoy.", costPerTick: -800, effects: { happiness: -3, employment: 3, tradeIncome: 600, corruption: 2 } },
  { id: "marketplaceEquilibrium", name: "Marketplace Equilibrium Doctrine", category: "economic", description: "A measured policy: gentle stimulus for small operators, gentle friction for chain expansion. Civil servants call it 'the Goldilocks doctrine.' Lobbyists call it 'inadequate.'", costPerTick: 600, effects: { happiness: 2, employment: 1, tradeIncome: 150 } },

  // ── SANDBOX EXPANSION BATCH ──────────────────────────────────────────
  // Twenty-five additional persistent policies to widen sandbox stance
  // choices. Distributed across the categories that were lightest in the
  // existing set (tyrannical, orwellian, civilRights, cultural,
  // healthSocial, cyberTech, emergency). All entries use only existing
  // PolicyEffect keys so no engine wiring is required; the union-coverage
  // tests will accept them automatically.

  // tyrannical (5)
  { id: "publicExecutionDecree", name: "Public Execution Decree", category: "tyrannical", description: "Capital sentences are carried out in plaza spectacles, broadcast across every district feed. Crime drops sharply. So does anyone's appetite for street-level dissent.", costPerTick: 400, effects: { crime: -5, happiness: -7, unrest: -3, lawOrder: 4, populationGrowthRate: -0.001 } },
  { id: "preemptiveDetention", name: "Preemptive Detention Authority", category: "tyrannical", description: "Anyone flagged by the algorithm can be held for ninety days without charge. The cells fill faster than they empty. Streets get quieter. Lawyers don't.", costPerTick: 1100, effects: { crime: -4, happiness: -5, unrest: -2, lawOrder: 3, corruption: 2 } },
  { id: "loyaltyOathRequirement", name: "Universal Loyalty Oath", category: "tyrannical", description: "Every citizen renews a sworn oath of fealty quarterly. Refusal is, technically, legal. Refusal is also, technically, career-ending.", costPerTick: 300, effects: { happiness: -4, unrest: -3, lawOrder: 2, corruption: 1 } },
  { id: "bannedAssemblyAct", name: "Banned Assembly Act", category: "tyrannical", description: "More than four people gathering in public requires a permit. Permits are denied. Drones enforce dispersal. The plazas have never been quieter.", costPerTick: 700, effects: { unrest: -4, happiness: -5, crime: -2, lawOrder: 3 } },
  { id: "ministryOfReeducation", name: "Ministry of Re-education", category: "tyrannical", description: "Citizens whose attitudes test poorly attend mandatory residential reform programs. They emerge calmer. They emerge quieter. They emerge.", costPerTick: 1400, effects: { happiness: -6, unrest: -5, lawOrder: 3, employment: 1, corruption: 2 } },

  // orwellian (5)
  { id: "linguisticPurificationOffice", name: "Linguistic Purification Office", category: "orwellian", description: "A standing bureau curates the official lexicon, retiring inconvenient words and inventing comforting ones. Reports get easier to read. Thoughts get harder to have.", costPerTick: 600, effects: { happiness: -3, unrest: -2, corruption: 1, researchSpeed: -1 } },
  { id: "behavioralMetricsTracking", name: "Behavioral Metrics Tracking", category: "orwellian", description: "Every citizen's gait, dwell time, and gaze pattern is logged in a city-wide database. The algorithm knows when you're nervous. The algorithm files a note.", costPerTick: 1300, effects: { crime: -3, happiness: -4, lawOrder: 2, unrest: -1 } },
  { id: "mandatoryJournalingProgram", name: "Mandatory Citizen Journaling", category: "orwellian", description: "Every adult submits a weekly self-report. Failure to submit is itself a flag. Truth is optional. Submission is not.", costPerTick: 500, effects: { happiness: -3, unrest: -2, corruption: 2, lawOrder: 1 } },
  { id: "consciousnessAuditing", name: "Consciousness Auditing Bureau", category: "orwellian", description: "Random citizens are escorted to neuro-screening sessions. The findings are confidential. The summons is not.", costPerTick: 1500, effects: { crime: -2, happiness: -5, unrest: -3, lawOrder: 2, corruption: 2 } },
  { id: "preferredOpinionPublishing", name: "Preferred Opinion Bulletins", category: "orwellian", description: "The state publishes the day's correct opinions every morning. Citizens who quote them accurately are scored well. Originality is its own punishment.", costPerTick: 700, effects: { happiness: -2, unrest: -3, lawOrder: 1, researchSpeed: -1 } },

  // civilRights (4)
  { id: "protestPermitFastTrack", name: "Protest Permit Fast-Track", category: "civilRights", description: "Lawful demonstrations get same-day permits and a designated route. Steam vents safely. Some marches still go where they're not supposed to.", costPerTick: 400, effects: { happiness: 4, unrest: -3, lawOrder: -1 } },
  { id: "publicDefenderExpansion", name: "Public Defender Expansion", category: "civilRights", description: "Every defendant gets a properly-resourced lawyer. Cases take longer. Convictions get cleaner. Wrongful arrests get more expensive for the state.", costPerTick: 1200, effects: { happiness: 3, corruption: -2, crime: 1, lawOrder: 1 } },
  { id: "whistleblowerShield", name: "Whistleblower Shield Act", category: "civilRights", description: "Citizens who expose corruption are legally protected and financially rewarded. The bureaucracy learns to be careful what it writes down.", costPerTick: 800, effects: { corruption: -3, happiness: 3, lawOrder: 1 } },
  { id: "habeasCorpusGuarantee", name: "Habeas Corpus Guarantee", category: "civilRights", description: "Detainees must be charged within 48 hours or released. Enforcement officers grumble; the public exhales.", costPerTick: 600, effects: { happiness: 4, unrest: -2, crime: 1, corruption: -2 } },

  // cyberTech (3)
  { id: "openSourceMandate", name: "Open Source Mandate", category: "cyberTech", description: "All publicly-funded software ships with source. Vendors hate it; civic hackers thrive on it. Patches arrive from everywhere.", costPerTick: 500, effects: { researchSpeed: 2, corruption: -1, infrastructureHealth: 1 } },
  { id: "cyberInsuranceFund", name: "Municipal Cyber-Insurance Fund", category: "cyberTech", description: "A pooled fund covers ransomware payouts and breach recovery for small businesses. Premiums are modest. The criminals notice.", costPerTick: 900, effects: { tradeIncome: 200, happiness: 1, crime: -1 } },
  { id: "quantumEncryptionGrant", name: "Quantum Encryption Grant", category: "cyberTech", description: "Subsidize post-quantum cryptography rollout across critical infrastructure. Eye-watering up-front cost; sleeps soundly afterward.", costPerTick: 1800, effects: { researchSpeed: 2, defenseRating: 2, infrastructureHealth: 1 } },

  // healthSocial (3)
  { id: "preventiveCareExpansion", name: "Preventive Care Expansion", category: "healthSocial", description: "Free annual screenings for every citizen. Catches problems early; pays for itself in a decade. Politicians rarely think in decades.", costPerTick: 1100, effects: { happiness: 4, populationGrowthRate: 0.002, medProduction: 1 } },
  { id: "communityKitchenNetwork", name: "Community Kitchen Network", category: "healthSocial", description: "Volunteer-run kitchens in every district serve hot meals at-cost. Hunger drops. Loneliness drops. The smell of soup carries for blocks.", costPerTick: 700, effects: { happiness: 5, unrest: -2, foodProduction: 1 } },
  { id: "sleepWellnessCampaign", name: "Sleep Wellness Campaign", category: "healthSocial", description: "Public awareness drive plus subsidies on quiet-hour HVAC retrofits. A rested workforce is, surprisingly, a productive one.", costPerTick: 400, effects: { happiness: 3, employment: 1 } },

  // cultural (3)
  { id: "streetPerformerLicense", name: "Street Performer Licensing", category: "cultural", description: "Cheap, fast-issue busking permits across the plaza network. The city sounds alive. Some of it is even in tune.", costPerTick: 200, effects: { happiness: 3, tradeIncome: 100 } },
  { id: "literaryFellowshipProgram", name: "Literary Fellowship Program", category: "cultural", description: "Annual stipends for novelists, poets, and journalists. Subversive works occasionally get funded. The state pretends not to notice.", costPerTick: 600, effects: { happiness: 3, researchSpeed: 1 } },
  { id: "publicMuralCommissions", name: "Public Mural Commissions", category: "cultural", description: "Pay local artists to cover blank walls and dead infrastructure with murals. The graffiti budget halves on its own.", costPerTick: 500, effects: { happiness: 3, crime: -1, infrastructureHealth: 1 } },

  // emergency (2)
  { id: "rapidEvacuationDrills", name: "Rapid Evacuation Drills", category: "emergency", description: "Quarterly full-district evacuation rehearsals. Inconvenient. Embarrassing. The day a real emergency hits, everyone moves like clockwork.", costPerTick: 800, effects: { defenseRating: 2, happiness: -1, unrest: -1, infrastructureHealth: 1 } },
  { id: "emergencyBroadcastNetwork", name: "Emergency Broadcast Network", category: "emergency", description: "A redundant, low-bandwidth alerting mesh that works when the main grid doesn't. Citizens hear the warnings before the rumors.", costPerTick: 600, effects: { unrest: -2, defenseRating: 1, happiness: 1 } },

  // ── SANDBOX EXPANSION BATCH (ROUND 2) ────────────────────────────────
  // Twenty-five more persistent policies. This round fills out the
  // categories the first round didn't touch much: militaryDefense,
  // lawEnforcement, infrastructure, environmental, economic, and
  // utopian, with a few more in healthSocial / cultural / cyberTech /
  // emergency. All use only existing PolicyEffect keys and category
  // enums; no engine wiring required.

  // militaryDefense (3)
  { id: "rapidReactionForce", name: "Rapid Reaction Force", category: "militaryDefense", description: "A standing strike unit kept on permanent five-minute readiness. Expensive. Arrives before the situation gets a chance to develop.", costPerTick: 1600, effects: { defenseRating: 3, crime: -2, lawOrder: 1 } },
  { id: "armoredResponseUnits", name: "Armored Response Units", category: "militaryDefense", description: "Armored vehicle squadrons assigned to every precinct. Riots end early. Body shops complain about the bumper damage.", costPerTick: 1400, effects: { defenseRating: 2, crime: -2, unrest: -2, happiness: -1 } },
  { id: "cyberDefenseCommand", name: "Cyber-Defense Command", category: "militaryDefense", description: "A dedicated military cyber-warfare command center. Most of what they do is invisible. Most of what they prevent never makes the news.", costPerTick: 1700, effects: { defenseRating: 2, infrastructureHealth: 1, researchSpeed: 1 } },

  // lawEnforcement (3)
  { id: "forensicLabExpansion", name: "Forensic Lab Expansion", category: "lawEnforcement", description: "Triple the city's processing capacity for crime-scene analysis. Cold cases warm up. Wrongful convictions thaw out too.", costPerTick: 1100, effects: { crime: -2, lawOrder: 2, corruption: -1 } },
  { id: "specializedFraudUnit", name: "Specialized Financial Fraud Unit", category: "lawEnforcement", description: "Sworn auditors and investigators chase white-collar crime full-time. Recovers more than it costs. Eventually.", costPerTick: 1000, effects: { corruption: -3, taxIncome: 200, happiness: 1 } },
  { id: "ridealongCommunityProgram", name: "Ride-Along Community Program", category: "lawEnforcement", description: "Citizens spend rotating shifts shadowing patrol officers. Trust climbs; dispatchers learn very colorful new vocabulary.", costPerTick: 400, effects: { happiness: 3, lawOrder: 1, corruption: -1 } },

  // infrastructure (3)
  { id: "stormDrainExpansion", name: "Storm-Drain Expansion Program", category: "infrastructure", description: "Continuous drainage upgrades for monsoon-prone districts. Floods rarely make the news anymore. Engineers who finish on time get medals.", costPerTick: 900, effects: { infrastructureHealth: 3, happiness: 1, defenseRating: 1 } },
  { id: "fiberOpticBackbone", name: "Fiber-Optic Backbone Initiative", category: "infrastructure", description: "Lay redundant fiber spines across the entire transit corridor network. The whole city gets faster. Construction crews get richer.", costPerTick: 1300, effects: { researchSpeed: 2, tradeIncome: 200, infrastructureHealth: 1 } },
  { id: "structuralRetrofitProgram", name: "Structural Retrofit Program", category: "infrastructure", description: "Continuous seismic and blast-resistance upgrades on aging high-rises. Casualties drop the next time something hits.", costPerTick: 1500, effects: { infrastructureHealth: 3, defenseRating: 1, happiness: 1 } },

  // environmental (3)
  { id: "carbonOffsetMandate", name: "Carbon Offset Mandate", category: "environmental", description: "Every commercial license requires verified offset purchases. Industries grumble; the haze over the Spire thins out a little.", costPerTick: 600, effects: { happiness: 2, tradeIncome: -150, infrastructureHealth: 1 } },
  { id: "industrialEmissionsCap", name: "Industrial Emissions Cap", category: "environmental", description: "Hard ceiling on per-factory atmospheric dumping. Compliance teams stay busy. The morning air smells less like a workshop fire.", costPerTick: 800, effects: { happiness: 3, goodsProduction: -1, populationGrowthRate: 0.001 } },
  { id: "wildlifeCorridorsProgram", name: "Wildlife Corridors Program", category: "environmental", description: "Protected greenways thread through the city, connecting parks and rooftop habitats. Birds come back. Schoolchildren visit on field trips.", costPerTick: 500, effects: { happiness: 3, populationGrowthRate: 0.001 } },

  // economic (3)
  { id: "publicMarketsExpansion", name: "Public Markets Expansion", category: "economic", description: "Build covered public markets in every district. Local producers get stalls; chains get heartburn.", costPerTick: 800, effects: { happiness: 3, employment: 2, tradeIncome: 250 } },
  { id: "exportZoneEstablishment", name: "Export Zone Establishment", category: "economic", description: "Tariff-free industrial zones tied to outbound logistics. Factories cluster fast. Customs agents get creative.", costPerTick: 1100, effects: { tradeIncome: 700, employment: 3, corruption: 2 } },
  { id: "tourismIncentiveProgram", name: "Tourism Incentive Program", category: "economic", description: "Hotel grants, signage upgrades, and a city-wide visitor pass. Outsiders arrive, spend, leave reviews. Some of them stay.", costPerTick: 700, effects: { happiness: 2, tradeIncome: 400, employment: 2 } },

  // healthSocial (2)
  { id: "addictionRecoveryNetwork", name: "Addiction Recovery Network", category: "healthSocial", description: "Funded treatment beds and outpatient clinics in every district. Crime drops. The graveyards get less crowded.", costPerTick: 1100, effects: { happiness: 4, crime: -2, populationGrowthRate: 0.001, medProduction: 1 } },
  { id: "maternityCareExpansion", name: "Maternity Care Expansion", category: "healthSocial", description: "Universal pre- and post-natal coverage with home visits. Birth outcomes improve sharply.", costPerTick: 1000, effects: { happiness: 3, populationGrowthRate: 0.003, medProduction: 1 } },

  // emergency (2)
  { id: "rapidShelterDeployment", name: "Rapid Shelter Deployment", category: "emergency", description: "Pre-positioned modular shelter caches in every sector. Disasters get a roof inside an hour. Storage facilities multiply.", costPerTick: 700, effects: { defenseRating: 2, infrastructureHealth: 1, happiness: 1 } },
  { id: "stockpileRotationMandate", name: "Strategic Stockpile Rotation", category: "emergency", description: "Continuous turnover of food, water, and medical reserves so nothing expires in the silos. Boring. Effective.", costPerTick: 600, effects: { foodProduction: 2, waterProduction: 1, medProduction: 1 } },

  // cultural (2)
  { id: "publicLibraryExpansion", name: "Public Library Expansion", category: "cultural", description: "New branches in under-served districts, longer hours, no fines. Quiet, civilized happiness in modest doses.", costPerTick: 600, effects: { happiness: 4, researchSpeed: 1 } },
  { id: "festivalCircuitGrants", name: "Festival Circuit Grants", category: "cultural", description: "Year-round funding for district-level festivals. Streets close; budgets stretch; everyone has a story.", costPerTick: 700, effects: { happiness: 4, tradeIncome: 200, unrest: -1 } },

  // cyberTech (2)
  { id: "publicWifiInitiative", name: "Public Wi-Fi Initiative", category: "cyberTech", description: "Free city-wide wireless on every plaza and transit platform. Productivity rises. So do the surveillance opportunities.", costPerTick: 600, effects: { happiness: 2, researchSpeed: 1, employment: 1 } },
  { id: "automatedCustomsClearance", name: "Automated Customs Clearance", category: "cyberTech", description: "AI-driven cargo screening at every entry node. Wait times collapse. Smugglers learn to write better paperwork.", costPerTick: 900, effects: { tradeIncome: 400, crime: -1, corruption: 1 } },

  // utopian (2)
  { id: "guaranteedHousingProgram", name: "Guaranteed Housing Program", category: "utopian", description: "Every legal resident is entitled to a baseline apartment. Construction never stops. Homelessness becomes a memory.", costPerTick: 2400, effects: { happiness: 6, unrest: -4, populationGrowthRate: 0.002, crime: -1 } },
  { id: "leisureFirstWorkweek", name: "Leisure-First Workweek", category: "utopian", description: "A four-day workweek with full pay, mandated across all sectors. Productivity per hour rises. Profit-margin lobbyists do not rejoice.", costPerTick: 1600, effects: { happiness: 6, employment: -1, tradeIncome: -200, populationGrowthRate: 0.001 } },
];

import { BB_POLICIES, BB_LAWS } from "@/engine/addons/bigBrother";
import { SD_POLICIES } from "@/engine/addons/sixthDay";

export const ALL_POLICIES: PolicyDef[] = [...CITY_POLICIES, ...BB_POLICIES, ...BB_LAWS, ...SD_POLICIES];

export const POLICY_MAP: Record<string, PolicyDef> = {};
for (const p of ALL_POLICIES) {
  POLICY_MAP[p.id] = p;
}

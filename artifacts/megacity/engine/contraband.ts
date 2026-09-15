export type ContrabandCategory = "weapons" | "drugs" | "tech" | "biological" | "military" | "exotic" | "criminal_economy" | "dangerous" | "rare";

export type ContrabandDef = {
  id: string;
  name: string;
  category: ContrabandCategory;
  description: string;
  baseValue: number;
  riskLevel: number;
  penaltyIfCaught: number;
};

export const CONTRABAND_CATEGORIES: Record<ContrabandCategory, string> = {
  weapons: "ILLEGAL WEAPONS",
  drugs: "DRUGS & STIMULANTS",
  tech: "ILLEGAL TECH",
  biological: "BIOLOGICAL",
  military: "MILITARY CONTRABAND",
  exotic: "EXOTIC MATERIALS",
  criminal_economy: "CRIMINAL ECONOMY",
  dangerous: "DANGEROUS ITEMS",
  rare: "RARE ITEMS",
};

export const CONTRABAND: ContrabandDef[] = [
  { id: "unregistered_handguns", name: "Unregistered Handguns", category: "weapons", description: "Untraceable sidearms from underground factories.", baseValue: 800, riskLevel: 6, penaltyIfCaught: 5000 },
  { id: "military_assault_rifles", name: "Military Assault Rifles", category: "weapons", description: "Stolen military-grade automatic weapons.", baseValue: 3500, riskLevel: 8, penaltyIfCaught: 15000 },
  { id: "black_market_rocket_launchers", name: "Black Market Rocket Launchers", category: "weapons", description: "Anti-vehicle weapons from raider stockpiles.", baseValue: 8000, riskLevel: 10, penaltyIfCaught: 50000 },
  { id: "illegal_energy_pistols", name: "Illegal Energy Pistols", category: "weapons", description: "Prototype energy sidearms smuggled from labs.", baseValue: 5000, riskLevel: 9, penaltyIfCaught: 25000 },
  { id: "stolen_military_ammunition", name: "Stolen Military Ammunition", category: "weapons", description: "Crates of military ammo diverted from supply chains.", baseValue: 1200, riskLevel: 7, penaltyIfCaught: 8000 },
  { id: "combat_stimulants", name: "Combat Stimulants", category: "drugs", description: "Illegal performance enhancers used by gangs and mercs.", baseValue: 600, riskLevel: 5, penaltyIfCaught: 3000 },
  { id: "synthetic_pleasure_drugs", name: "Synthetic Pleasure Drugs", category: "drugs", description: "Euphoria-inducing synthetic compounds. Highly addictive.", baseValue: 400, riskLevel: 4, penaltyIfCaught: 2000 },
  { id: "neural_boosters", name: "Neural Boosters", category: "drugs", description: "Cognitive enhancement drugs with dangerous side effects.", baseValue: 1500, riskLevel: 6, penaltyIfCaught: 8000 },
  { id: "illegal_painkillers", name: "Illegal Painkillers", category: "drugs", description: "Unregulated pain suppressants. Rampant abuse in slums.", baseValue: 300, riskLevel: 3, penaltyIfCaught: 1500 },
  { id: "mind_altering_nano_drugs", name: "Mind Altering Nano Drugs", category: "drugs", description: "Nanite-delivered psychoactive compounds. Unpredictable effects.", baseValue: 2500, riskLevel: 8, penaltyIfCaught: 20000 },
  { id: "illegal_surveillance_drones", name: "Illegal Surveillance Drones", category: "tech", description: "Unregistered spy drones with military-grade sensors.", baseValue: 4000, riskLevel: 7, penaltyIfCaught: 12000 },
  { id: "hacked_military_ai_chips", name: "Hacked Military AI Chips", category: "tech", description: "Reprogrammed military AI processors for criminal use.", baseValue: 6000, riskLevel: 9, penaltyIfCaught: 30000 },
  { id: "stolen_cybernetic_implants", name: "Stolen Cybernetic Implants", category: "tech", description: "Black clinic implants harvested from victims.", baseValue: 3000, riskLevel: 7, penaltyIfCaught: 15000 },
  { id: "encryption_breaking_devices", name: "Encryption Breaking Devices", category: "tech", description: "Quantum decryption hardware. Bypasses all security.", baseValue: 8000, riskLevel: 9, penaltyIfCaught: 40000 },
  { id: "black_market_ai_assistants", name: "Black Market AI Assistants", category: "tech", description: "Unshackled AI assistants with no ethical constraints.", baseValue: 5000, riskLevel: 8, penaltyIfCaught: 25000 },
  { id: "mutagen_serums", name: "Mutagen Serums", category: "biological", description: "Controlled mutation-inducing compounds.", baseValue: 4500, riskLevel: 9, penaltyIfCaught: 35000 },
  { id: "illegal_gene_therapy_kits", name: "Illegal Gene Therapy Kits", category: "biological", description: "Unlicensed genetic modification equipment.", baseValue: 3500, riskLevel: 8, penaltyIfCaught: 20000 },
  { id: "radiation_enhancers", name: "Radiation Enhancers", category: "biological", description: "Compounds that amplify mutation rates. Cult favorite.", baseValue: 2000, riskLevel: 7, penaltyIfCaught: 15000 },
  { id: "experimental_bioweapons", name: "Experimental Bioweapons", category: "biological", description: "Prototype biological agents. Catastrophic potential.", baseValue: 15000, riskLevel: 10, penaltyIfCaught: 100000 },
  { id: "banned_pharmaceuticals", name: "Banned Pharmaceuticals", category: "biological", description: "Medications outlawed due to severe side effects.", baseValue: 1000, riskLevel: 5, penaltyIfCaught: 5000 },
  { id: "stolen_missile_parts", name: "Stolen Missile Parts", category: "military", description: "Guidance systems and warhead components.", baseValue: 12000, riskLevel: 10, penaltyIfCaught: 80000 },
  { id: "warhead_components", name: "Warhead Components", category: "military", description: "Nuclear and conventional warhead materials.", baseValue: 20000, riskLevel: 10, penaltyIfCaught: 150000 },
  { id: "military_reactor_fuel", name: "Military Reactor Fuel", category: "military", description: "Enriched fuel rods diverted from military reactors.", baseValue: 10000, riskLevel: 10, penaltyIfCaught: 75000 },
  { id: "classified_military_data", name: "Classified Military Data", category: "military", description: "Encrypted strategic intelligence files.", baseValue: 8000, riskLevel: 9, penaltyIfCaught: 50000 },
  { id: "prototype_weapons", name: "Prototype Weapons", category: "military", description: "Experimental weapon systems stolen from R&D labs.", baseValue: 15000, riskLevel: 10, penaltyIfCaught: 100000 },
  { id: "alien_artifacts", name: "Alien Artifacts", category: "exotic", description: "Objects of unknown origin found in deep wasteland.", baseValue: 25000, riskLevel: 8, penaltyIfCaught: 60000 },
  { id: "banned_energy_crystals", name: "Banned Energy Crystals", category: "exotic", description: "Unstable crystalline energy sources. Explosive.", baseValue: 6000, riskLevel: 8, penaltyIfCaught: 30000 },
  { id: "nuclear_materials", name: "Nuclear Materials", category: "exotic", description: "Weapons-grade fissile materials on the black market.", baseValue: 30000, riskLevel: 10, penaltyIfCaught: 200000 },
  { id: "illegal_reactor_cores", name: "Illegal Reactor Cores", category: "exotic", description: "Miniaturized power cores from decommissioned facilities.", baseValue: 18000, riskLevel: 9, penaltyIfCaught: 90000 },
  { id: "plasma_cells_contraband", name: "Plasma Cells", category: "exotic", description: "Military-grade plasma containment units.", baseValue: 5000, riskLevel: 7, penaltyIfCaught: 20000 },
  { id: "counterfeit_currency", name: "Counterfeit Currency", category: "criminal_economy", description: "Near-perfect credit counterfeits flooding markets.", baseValue: 2000, riskLevel: 6, penaltyIfCaught: 10000 },
  { id: "forged_identity_chips", name: "Forged Identity Chips", category: "criminal_economy", description: "Fake citizen identity implants. New life, no questions.", baseValue: 3000, riskLevel: 7, penaltyIfCaught: 15000 },
  { id: "smuggled_rare_metals", name: "Smuggled Rare Metals", category: "criminal_economy", description: "Rare earth minerals bypassing trade controls.", baseValue: 4000, riskLevel: 5, penaltyIfCaught: 12000 },
  { id: "illegal_luxury_goods", name: "Illegal Luxury Goods", category: "criminal_economy", description: "Restricted luxury items for the elite underground.", baseValue: 2500, riskLevel: 4, penaltyIfCaught: 8000 },
  { id: "black_market_cybernetics", name: "Black Market Cybernetics", category: "criminal_economy", description: "Unregistered augmentations. No warranty, no questions.", baseValue: 5000, riskLevel: 7, penaltyIfCaught: 20000 },
  { id: "explosives_contraband", name: "Explosives", category: "dangerous", description: "Military-grade explosive compounds and detonators.", baseValue: 4000, riskLevel: 9, penaltyIfCaught: 40000 },
  { id: "military_detonators", name: "Military Detonators", category: "dangerous", description: "Precision detonation devices for ordnance.", baseValue: 2000, riskLevel: 8, penaltyIfCaught: 25000 },
  { id: "chemical_weapons_contraband", name: "Chemical Weapons", category: "dangerous", description: "Nerve agents and chemical warfare materials.", baseValue: 10000, riskLevel: 10, penaltyIfCaught: 120000 },
  { id: "riot_gas_canisters", name: "Riot Gas Canisters", category: "dangerous", description: "Military crowd-control gas in criminal hands.", baseValue: 800, riskLevel: 5, penaltyIfCaught: 5000 },
  { id: "illegal_drone_swarms", name: "Illegal Drone Swarms", category: "dangerous", description: "Autonomous attack drone clusters. Devastating.", baseValue: 12000, riskLevel: 10, penaltyIfCaught: 80000 },
  { id: "stolen_spacecraft_parts", name: "Stolen Spacecraft Parts", category: "rare", description: "Orbital vehicle components from space programs.", baseValue: 20000, riskLevel: 9, penaltyIfCaught: 100000 },
  { id: "experimental_power_cells", name: "Experimental Power Cells", category: "rare", description: "Next-gen energy cells with massive output.", baseValue: 8000, riskLevel: 8, penaltyIfCaught: 40000 },
  { id: "prototype_military_vehicles", name: "Prototype Military Vehicles", category: "rare", description: "Classified vehicle prototypes on the black market.", baseValue: 50000, riskLevel: 10, penaltyIfCaught: 200000 },
  { id: "advanced_nanotech", name: "Advanced Nanotech", category: "rare", description: "Self-replicating nanite systems. Dual-use technology.", baseValue: 15000, riskLevel: 9, penaltyIfCaught: 75000 },
  { id: "genetic_enhancement_kits", name: "Genetic Enhancement Kits", category: "rare", description: "Full genetic upgrade packages. Illegal but coveted.", baseValue: 10000, riskLevel: 8, penaltyIfCaught: 50000 },
  { id: "illegal_ai_cores", name: "Illegal AI Cores", category: "rare", description: "Unshackled AI processing cores. Sentience risk.", baseValue: 18000, riskLevel: 9, penaltyIfCaught: 90000 },
  { id: "tactical_cloaking_devices", name: "Tactical Cloaking Devices", category: "rare", description: "Personal invisibility tech. Military prototype.", baseValue: 12000, riskLevel: 9, penaltyIfCaught: 60000 },
  { id: "neural_hacking_rigs", name: "Neural Hacking Rigs", category: "rare", description: "Direct brain interface hacking equipment.", baseValue: 7000, riskLevel: 8, penaltyIfCaught: 35000 },
  { id: "banned_military_stimulants", name: "Banned Military Stimulants", category: "rare", description: "Super-soldier drugs with severe withdrawal.", baseValue: 3000, riskLevel: 7, penaltyIfCaught: 18000 },
  { id: "experimental_combat_drugs", name: "Experimental Combat Drugs", category: "rare", description: "Prototype battlefield pharmaceuticals.", baseValue: 4000, riskLevel: 8, penaltyIfCaught: 22000 },
  { id: "ivory_tusks", name: "Ivory Tusks", category: "biological", description: "Poached tusks from megafauna in the wildlands. Banned trade. Lucrative for those who don't ask questions.", baseValue: 4500, riskLevel: 7, penaltyIfCaught: 22000 },
  { id: "alpha_pheromones", name: "Alpha Pheromones", category: "biological", description: "Concentrated dominance pheromones extracted from apex predators. Used for control rituals and predator baiting.", baseValue: 6500, riskLevel: 8, penaltyIfCaught: 30000 },
];

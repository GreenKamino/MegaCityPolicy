export type GangType = "street" | "cyberCult" | "mercenary" | "organizedCrime" | "specialistCrew";

export type GangDef = {
  id: string;
  name: string;
  type: GangType;
  threatLevel: 1 | 2 | 3 | 4 | 5;
  territoryPreference: "slums" | "industrial" | "commercial" | "residential" | "undercity" | "docks" | "any";
  crimeSpecialties: string[];
  description: string;
};

export const GANGS: GangDef[] = [
  { id: "neon_reapers", name: "Neon Reapers", type: "street", threatLevel: 3, territoryPreference: "slums", crimeSpecialties: ["gangWarfare", "stimDealering", "streetRacing"], description: "Neon-painted bruisers who run the lower hab-blocks with fists and modified stim-injectors." },
  { id: "chrome_fangs", name: "Chrome Fangs", type: "street", threatLevel: 4, territoryPreference: "slums", crimeSpecialties: ["protectionRacketeering", "pedestrianAssault", "armedRobbery"], description: "Chrome-jawed enforcers who collect protection money from every vendor in the lower sectors." },
  { id: "dead_volts", name: "Dead Volts", type: "street", threatLevel: 2, territoryPreference: "residential", crimeSpecialties: ["graffitiBombing", "transitVandalism", "vandalism"], description: "Young taggers and vandals who short-circuit transit systems for kicks." },
  { id: "rust_wolves", name: "Rust Wolves", type: "street", threatLevel: 3, territoryPreference: "industrial", crimeSpecialties: ["energyTheft", "squatting", "streetVendorExtortion"], description: "Factory-district squatters who tap power lines and shake down street vendors." },
  { id: "gutter_kings", name: "Gutter Kings", type: "street", threatLevel: 2, territoryPreference: "undercity", crimeSpecialties: ["illegalGambling", "droneFighting", "theft"], description: "Undercity gamblers running drone-fighting rings in abandoned maintenance tunnels." },
  { id: "scarlet_razors", name: "Scarlet Razors", type: "street", threatLevel: 4, territoryPreference: "slums", crimeSpecialties: ["assault", "gangWarfare", "weaponsViolation"], description: "Blade-augmented street warriors known for territorial knife wars in the slum corridors." },
  { id: "hollow_boys", name: "Hollow Boys", type: "street", threatLevel: 2, territoryPreference: "residential", crimeSpecialties: ["burglary", "vehicleTheft", "theft"], description: "Teenage hab-block break-in artists who strip vehicles for parts." },
  { id: "acid_saints", name: "Acid Saints", type: "street", threatLevel: 3, territoryPreference: "slums", crimeSpecialties: ["stimDealering", "drugPossession", "drugTrafficking"], description: "Stim-dealing gang with a quasi-religious devotion to consciousness expansion." },
  { id: "bone_circuit", name: "Bone Circuit", type: "street", threatLevel: 3, territoryPreference: "undercity", crimeSpecialties: ["pitFighting", "illegalGambling", "protectionRacketeering"], description: "Underground pit-fighting promoters who wire contestants with combat augs." },
  { id: "static_hounds", name: "Static Hounds", type: "street", threatLevel: 2, territoryPreference: "any", crimeSpecialties: ["streetRacing", "transitVandalism", "publicDisorder"], description: "Street racers and transit hackers who jam traffic control systems for illegal drag runs." },

  { id: "church_of_the_machine", name: "Church of the Machine", type: "cyberCult", threatLevel: 4, territoryPreference: "undercity", crimeSpecialties: ["forcedCyberization", "cyberpsychosis", "massManipulation"], description: "Zealots who believe flesh is sin, forcibly augmenting captured citizens in underground temples." },
  { id: "neural_ascendants", name: "Neural Ascendants", type: "cyberCult", threatLevel: 5, territoryPreference: "any", crimeSpecialties: ["neuralHijacking", "aiManipulation", "neuralNetTrespass"], description: "Elite hackers seeking digital transcendence by uploading consciousness into city networks." },
  { id: "iron_communion", name: "Iron Communion", type: "cyberCult", threatLevel: 3, territoryPreference: "industrial", crimeSpecialties: ["illegalAugmentation", "blackClinicOperations", "implantCounterfeiting"], description: "Industrial-district cultists who run illegal augmentation rituals in abandoned factories." },
  { id: "void_signal", name: "Void Signal", type: "cyberCult", threatLevel: 4, territoryPreference: "any", crimeSpecialties: ["surveillanceHacking", "dataBreaches", "digitalRansomware"], description: "Mysterious collective that broadcasts encrypted signals driving listeners to acts of cyber-terrorism." },
  { id: "silicon_prophets", name: "Silicon Prophets", type: "cyberCult", threatLevel: 3, territoryPreference: "residential", crimeSpecialties: ["deepfakeFraud", "massManipulation", "informationBrokering"], description: "Charismatic cult leaders using deepfake tech to impersonate officials and recruit followers." },
  { id: "flesh_denied", name: "Flesh Denied", type: "cyberCult", threatLevel: 4, territoryPreference: "slums", crimeSpecialties: ["organHarvesting", "forcedCyberization", "illegalCloning"], description: "Extremists who harvest organic tissue to fund full-body cyberization for their congregation." },
  { id: "archive_keepers", name: "Archive Keepers", type: "cyberCult", threatLevel: 2, territoryPreference: "any", crimeSpecialties: ["dataMining", "informationBrokering", "virtualIdentityTheft"], description: "Data-obsessed sect that hoards stolen information in hidden server farms beneath the city." },
  { id: "pulse_children", name: "Pulse Children", type: "cyberCult", threatLevel: 3, territoryPreference: "undercity", crimeSpecialties: ["neurotoxinDistribution", "illegalPsychSurgery", "cyberpsychosis"], description: "Neural-hackers who dose victims with experimental stimulants to push their cognition past safe limits." },
  { id: "digital_saints", name: "Digital Saints", type: "cyberCult", threatLevel: 3, territoryPreference: "commercial", crimeSpecialties: ["cryptoTheft", "networkIntrusion", "gridTampering"], description: "Self-proclaimed digital Robin Hoods who hack financial systems to redistribute wealth." },
  { id: "chrome_heralds", name: "Chrome Heralds", type: "cyberCult", threatLevel: 4, territoryPreference: "any", crimeSpecialties: ["augmentSabotage", "neuralIdentitySpoofing", "cyberwareSmugging"], description: "Evangelical cyborg missionaries spreading their faith through gifted—and tracked—implants." },

  { id: "iron_wolves_pmc", name: "Iron Wolves PMC", type: "mercenary", threatLevel: 5, territoryPreference: "any", crimeSpecialties: ["corporateAssassination", "gangWarfare", "armedRobbery"], description: "Elite private military contractors who take any job for the right price, from corp hits to gang wars." },
  { id: "blackout_brigade", name: "Blackout Brigade", type: "mercenary", threatLevel: 4, territoryPreference: "industrial", crimeSpecialties: ["factorySabotage", "automationSabotage", "industrialEspionage"], description: "Sabotage specialists who cripple factory output on contract from rival megacorps." },
  { id: "razor_company", name: "Razor Company", type: "mercenary", threatLevel: 4, territoryPreference: "any", crimeSpecialties: ["kidnapping", "illegalBountyHunting", "armedRobbery"], description: "Bounty hunters and extraction teams who operate in the grey zone between law and crime." },
  { id: "ghost_protocol", name: "Ghost Protocol", type: "mercenary", threatLevel: 5, territoryPreference: "any", crimeSpecialties: ["intelligenceSelling", "governmentInfiltration", "corporateAssassination"], description: "Untraceable operatives who specialize in political assassinations and deep-cover infiltration." },
  { id: "steel_curtain", name: "Steel Curtain", type: "mercenary", threatLevel: 3, territoryPreference: "docks", crimeSpecialties: ["smuggling", "contrabandeering", "unregisteredWeaponsSales"], description: "Dock-based smugglers who move illegal cargo through fortified shipping corridors." },
  { id: "war_dogs", name: "War Dogs", type: "mercenary", threatLevel: 4, territoryPreference: "any", crimeSpecialties: ["gangWarfare", "weaponsViolation", "prostheticWeaponization"], description: "Combat-augmented veterans who sell their firepower to the highest bidder." },
  { id: "night_talons", name: "Night Talons", type: "mercenary", threatLevel: 3, territoryPreference: "any", crimeSpecialties: ["illegalBountyHunting", "kidnapping", "extortion"], description: "Nocturnal hunters who specialize in night-time extraction and intimidation operations." },
  { id: "siege_breakers", name: "Siege Breakers", type: "mercenary", threatLevel: 4, territoryPreference: "industrial", crimeSpecialties: ["factorySabotage", "arson", "energyTheft"], description: "Demolition experts who can crack any fortified position—for a price." },
  { id: "spectre_unit", name: "Spectre Unit", type: "mercenary", threatLevel: 5, territoryPreference: "any", crimeSpecialties: ["governmentInfiltration", "intelligenceSelling", "shadowGovernment"], description: "Former intelligence operatives running a parallel shadow network within city governance." },
  { id: "havoc_corps", name: "Havoc Corps", type: "mercenary", threatLevel: 3, territoryPreference: "any", crimeSpecialties: ["publicDisorder", "arson", "gangWarfare"], description: "Chaos-for-hire mercenaries contracted to create diversions and civil disruptions." },

  { id: "obsidian_cartel", name: "Obsidian Cartel", type: "organizedCrime", threatLevel: 5, territoryPreference: "commercial", crimeSpecialties: ["syntheticDrugManufacturing", "drugTrafficking", "megacorpWarfare"], description: "The dominant narcotics syndicate controlling synthetic drug manufacturing across multiple sectors." },
  { id: "golden_circuit", name: "Golden Circuit", type: "organizedCrime", threatLevel: 5, territoryPreference: "commercial", crimeSpecialties: ["fraud", "judicialCorruption", "electionRigging"], description: "White-collar crime syndicate with tendrils in every financial institution and courtroom." },
  { id: "crimson_hand", name: "Crimson Hand", type: "organizedCrime", threatLevel: 4, territoryPreference: "any", crimeSpecialties: ["extortion", "humanTrafficking", "protectionRacketeering"], description: "Brutal crime family running protection rackets and human trafficking operations citywide." },
  { id: "night_market_consortium", name: "Night Market Consortium", type: "organizedCrime", threatLevel: 4, territoryPreference: "undercity", crimeSpecialties: ["blackMarketCybernetics", "contrabandeering", "forgeryOperations"], description: "Underground trade network that controls the flow of all black-market goods in the undercity." },
  { id: "viper_syndicate", name: "Viper Syndicate", type: "organizedCrime", threatLevel: 4, territoryPreference: "docks", crimeSpecialties: ["smuggling", "radioactiveMaterialSmuggling", "wasteTrafficking"], description: "Dock syndicate specializing in hazardous materials smuggling and toxic waste disposal contracts." },
  { id: "phantom_exchange", name: "Phantom Exchange", type: "organizedCrime", threatLevel: 3, territoryPreference: "any", crimeSpecialties: ["cryptoTheft", "identityFraud", "digitalRansomware"], description: "Digital crime syndicate running shadow financial markets and crypto laundering operations." },
  { id: "silk_road_revival", name: "Silk Road Revival", type: "organizedCrime", threatLevel: 4, territoryPreference: "commercial", crimeSpecialties: ["alienArtifactTrafficking", "slaveChipTrading", "mutantTrafficking"], description: "Ancient crime network reborn, trafficking in exotic goods, slave chips, and mutant specimens." },
  { id: "steel_throne", name: "Steel Throne", type: "organizedCrime", threatLevel: 5, territoryPreference: "any", crimeSpecialties: ["corporateAssassination", "politicalBlackmail", "shadowGovernment"], description: "The apex crime organization suspected of controlling puppet officials throughout city governance." },
  { id: "emerald_serpents", name: "Emerald Serpents", type: "organizedCrime", threatLevel: 3, territoryPreference: "residential", crimeSpecialties: ["pharmaceuticalCounterfeiting", "medicalDataTrafficking", "clinicalTrialFraud"], description: "Medical crime syndicate dealing in counterfeit pharmaceuticals and stolen patient data." },
  { id: "black_ledger", name: "Black Ledger", type: "organizedCrime", threatLevel: 4, territoryPreference: "commercial", crimeSpecialties: ["regulatoryFraud", "industrialEspionage", "patentTheft"], description: "Corporate crime ring that steals patents and sells regulatory approvals to the highest bidder." },

  { id: "neural_ghosts", name: "Neural Ghosts", type: "specialistCrew", threatLevel: 4, territoryPreference: "any", crimeSpecialties: ["neuralHijacking", "neuralIdentitySpoofing", "dataBreaches"], description: "Elite netrunners who steal memories and identities through direct neural interface hacking." },
  { id: "chrome_surgeons", name: "Chrome Surgeons", type: "specialistCrew", threatLevel: 3, territoryPreference: "slums", crimeSpecialties: ["blackClinicOperations", "implantCounterfeiting", "organHarvesting"], description: "Back-alley cyber-surgeons running illegal implant shops in the lower sectors." },
  { id: "grid_runners", name: "Grid Runners", type: "specialistCrew", threatLevel: 3, territoryPreference: "any", crimeSpecialties: ["networkIntrusion", "gridTampering", "surveillanceHacking"], description: "Infrastructure hackers who penetrate city grid systems for espionage or sabotage." },
  { id: "gene_splitters", name: "Gene Splitters", type: "specialistCrew", threatLevel: 4, territoryPreference: "undercity", crimeSpecialties: ["unlicensedGeneMods", "bioweaponDevelopment", "illegalCloning"], description: "Rogue geneticists performing illegal modifications and growing clones in hidden labs." },
  { id: "phantom_couriers", name: "Phantom Couriers", type: "specialistCrew", threatLevel: 2, territoryPreference: "any", crimeSpecialties: ["smuggling", "cyberwareSmugging", "contrabandeering"], description: "Untraceable delivery service moving illegal packages through drone networks and dead drops." },
  { id: "circuit_breakers", name: "Circuit Breakers", type: "specialistCrew", threatLevel: 4, territoryPreference: "industrial", crimeSpecialties: ["automationSabotage", "factorySabotage", "energyTheft"], description: "Anti-automation activists who disable factory robots and steal industrial power." },
  { id: "memory_merchants", name: "Memory Merchants", type: "specialistCrew", threatLevel: 3, territoryPreference: "commercial", crimeSpecialties: ["virtualIdentityTheft", "deepfakeFraud", "informationBrokering"], description: "Black-market dealers in stolen memories, experiences, and fabricated identities." },
  { id: "toxin_weavers", name: "Toxin Weavers", type: "specialistCrew", threatLevel: 4, territoryPreference: "undercity", crimeSpecialties: ["neurotoxinDistribution", "syntheticDrugManufacturing", "plagueHoarding"], description: "Underground chemists who synthesize designer neurotoxins and weaponized pathogens." },
  { id: "vault_crackers", name: "Vault Crackers", type: "specialistCrew", threatLevel: 3, territoryPreference: "commercial", crimeSpecialties: ["grandTheft", "cryptoTheft", "forgeryOperations"], description: "Master thieves specializing in high-security vault breaches and crypto wallet extraction." },
  { id: "skin_artists", name: "Skin Artists", type: "specialistCrew", threatLevel: 2, territoryPreference: "any", crimeSpecialties: ["illegalAugmentation", "prostheticWeaponization", "implantTheft"], description: "Cosmetic cyber-modders who also weaponize prosthetics and strip augments from victims." },
  { id: "rust_prophets", name: "Rust Prophets", type: "cyberCult", threatLevel: 3, territoryPreference: "industrial", crimeSpecialties: ["factorySabotage", "publicDisorder", "arson"], description: "Industrial doomsday cult that worships machine decay and ritually sabotages factory equipment." },
  { id: "deep_current", name: "Deep Current", type: "organizedCrime", threatLevel: 4, territoryPreference: "docks", crimeSpecialties: ["humanTrafficking", "smuggling", "extortion"], description: "Shadowy dock syndicate controlling human trafficking routes through underwater cargo tunnels." },
  { id: "pulse_jockeys", name: "Pulse Jockeys", type: "street", threatLevel: 2, territoryPreference: "residential", crimeSpecialties: ["streetRacing", "vehicleTheft", "pedestrianAssault"], description: "Adrenaline-junkie street racers who steal vehicles and terrorize residential blocks with illegal drag runs." },
];

export const GANGS_MAP: Record<string, GangDef> = {};
for (const g of GANGS) {
  GANGS_MAP[g.id] = g;
}

export const ANY_TERRITORY_GANGS: GangDef[] = GANGS.filter(
  (g) => g.territoryPreference === "any",
);

export const GANGS_BY_TYPE: Record<string, GangDef[]> = {};
for (const g of GANGS) {
  if (!GANGS_BY_TYPE[g.type]) GANGS_BY_TYPE[g.type] = [];
  GANGS_BY_TYPE[g.type].push(g);
}

export const GANG_TYPE_LABELS: Record<GangType, string> = {
  street: "Street Gangs",
  cyberCult: "Cyber Cults",
  mercenary: "Mercenary Groups",
  organizedCrime: "Organized Crime",
  specialistCrew: "Specialist Crews",
};

export function getGangThreatColor(level: number): string {
  if (level >= 5) return "#FF1744";
  if (level >= 4) return "#FF9100";
  if (level >= 3) return "#FFD600";
  if (level >= 2) return "#B0BEC5";
  return "#78909C";
}

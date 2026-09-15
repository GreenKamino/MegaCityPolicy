export type CrimeCategory =
  | "violent"
  | "property"
  | "financial"
  | "narcotics"
  | "organized"
  | "cybernetic"
  | "dataDigital"
  | "street"
  | "industrial"
  | "medical"
  | "highLevel"
  | "blackMarket"
  | "genetic"
  | "civilRights"
  | "biosphere"
  | "uplift";

export type CrimeSeverity = "low" | "medium" | "high" | "critical";

export type CrimeTypeDef = {
  id: string;
  name: string;
  category: CrimeCategory;
  severity: CrimeSeverity;
  baseRate: number;
  description: string;
};

export const CRIME_TYPES: CrimeTypeDef[] = [
  { id: "murder", name: "Murder", category: "violent", severity: "critical", baseRate: 8, description: "Premeditated killing of another citizen." },
  { id: "manslaughter", name: "Manslaughter", category: "violent", severity: "high", baseRate: 5, description: "Unlawful killing without premeditation." },
  { id: "assault", name: "Assault", category: "violent", severity: "high", baseRate: 200, description: "Physical attack causing bodily harm." },
  { id: "aggravatedAssault", name: "Aggravated Assault", category: "violent", severity: "high", baseRate: 50, description: "Assault with a deadly weapon or intent to cause severe injury." },
  { id: "robbery", name: "Robbery", category: "violent", severity: "medium", baseRate: 100, description: "Taking property by force or threat." },
  { id: "armedRobbery", name: "Armed Robbery", category: "violent", severity: "high", baseRate: 20, description: "Robbery committed with a weapon." },
  { id: "kidnapping", name: "Kidnapping", category: "violent", severity: "critical", baseRate: 8, description: "Abduction and unlawful restraint of a person." },

  { id: "theft", name: "Theft", category: "property", severity: "low", baseRate: 800, description: "Unlawful taking of personal property." },
  { id: "grandTheft", name: "Grand Theft", category: "property", severity: "medium", baseRate: 50, description: "Theft of property exceeding 10,000 credits in value." },
  { id: "burglary", name: "Burglary", category: "property", severity: "medium", baseRate: 200, description: "Unlawful entry into a hab-unit or business with intent to steal." },
  { id: "vehicleTheft", name: "Vehicle Theft", category: "property", severity: "medium", baseRate: 120, description: "Theft of ground vehicles, hover-bikes, or transit pods." },
  { id: "arson", name: "Arson", category: "property", severity: "high", baseRate: 10, description: "Deliberate setting of fires to property." },
  { id: "vandalism", name: "Vandalism", category: "property", severity: "low", baseRate: 400, description: "Intentional destruction or defacement of public or private property." },

  { id: "fraud", name: "Fraud", category: "financial", severity: "medium", baseRate: 150, description: "Deceptive practices for financial gain." },
  { id: "identityFraud", name: "Identity Fraud", category: "financial", severity: "medium", baseRate: 80, description: "Assuming another citizen's identity for criminal purposes." },
  { id: "extortion", name: "Extortion", category: "financial", severity: "high", baseRate: 30, description: "Obtaining money or goods through coercion or threats." },
  { id: "blackmail", name: "Blackmail", category: "financial", severity: "medium", baseRate: 15, description: "Demanding payment in exchange for not revealing compromising information." },

  { id: "drugPossession", name: "Drug Possession", category: "narcotics", severity: "low", baseRate: 300, description: "Possession of controlled synthetic substances." },
  { id: "drugTrafficking", name: "Drug Trafficking", category: "narcotics", severity: "high", baseRate: 40, description: "Distribution and sale of controlled substances across sectors." },
  { id: "weaponsViolation", name: "Weapons Violation", category: "narcotics", severity: "medium", baseRate: 100, description: "Illegal possession, modification, or distribution of weapons." },
  { id: "smuggling", name: "Smuggling", category: "narcotics", severity: "medium", baseRate: 50, description: "Illegal transport of contraband across sector boundaries." },

  { id: "cyberCrime", name: "Cyber Crime", category: "organized", severity: "medium", baseRate: 200, description: "General computer-assisted criminal activity." },
  { id: "humanTrafficking", name: "Human Trafficking", category: "organized", severity: "critical", baseRate: 5, description: "Forced labor, exploitation, or trade in human beings." },
  { id: "organizedCrime", name: "Organized Crime", category: "organized", severity: "high", baseRate: 20, description: "Criminal activity coordinated by syndicate networks." },
  { id: "publicDisorder", name: "Public Disorder", category: "organized", severity: "low", baseRate: 300, description: "Rioting, unlawful assembly, and civil disturbance." },
  { id: "corruption", name: "Corruption", category: "organized", severity: "high", baseRate: 60, description: "Abuse of official position for personal gain." },

  { id: "illegalAugmentation", name: "Illegal Augmentation", category: "cybernetic", severity: "medium", baseRate: 40, description: "Installation of unlicensed or banned cybernetic enhancements." },
  { id: "implantTheft", name: "Implant Theft", category: "cybernetic", severity: "high", baseRate: 20, description: "Forcible removal and theft of cybernetic implants from victims." },
  { id: "forcedCyberization", name: "Forced Cyberization", category: "cybernetic", severity: "critical", baseRate: 3, description: "Non-consensual installation of cybernetic hardware into unwilling subjects." },
  { id: "neuralHijacking", name: "Neural Hijacking", category: "cybernetic", severity: "critical", baseRate: 10, description: "Remote seizure of control over a victim's neural interface." },
  { id: "cyberpsychosis", name: "Cyberpsychosis", category: "cybernetic", severity: "high", baseRate: 15, description: "Violent episodes caused by excessive or faulty augmentation." },
  { id: "augmentSabotage", name: "Augment Sabotage", category: "cybernetic", severity: "medium", baseRate: 8, description: "Deliberate tampering with another person's cybernetic hardware." },
  { id: "blackClinicOperations", name: "Black Clinic Operations", category: "cybernetic", severity: "high", baseRate: 20, description: "Unlicensed surgical facilities performing illegal augmentation procedures." },
  { id: "implantCounterfeiting", name: "Implant Counterfeiting", category: "cybernetic", severity: "medium", baseRate: 25, description: "Manufacturing and selling counterfeit cybernetic components." },
  { id: "cyberwareSmugging", name: "Cyberware Smuggling", category: "cybernetic", severity: "medium", baseRate: 15, description: "Illegal transport of restricted cybernetic components across sectors." },
  { id: "neuralIdentitySpoofing", name: "Neural Identity Spoofing", category: "cybernetic", severity: "high", baseRate: 12, description: "Cloning or falsifying neural signatures for identity theft." },
  { id: "prostheticWeaponization", name: "Prosthetic Weaponization", category: "cybernetic", severity: "high", baseRate: 6, description: "Converting civilian prosthetics into concealed lethal weapons." },

  { id: "dataBreaches", name: "Data Breaches", category: "dataDigital", severity: "medium", baseRate: 60, description: "Unauthorized access to protected data repositories." },
  { id: "networkIntrusion", name: "Network Intrusion", category: "dataDigital", severity: "medium", baseRate: 45, description: "Penetration of secured network infrastructure." },
  { id: "aiManipulation", name: "AI Manipulation", category: "dataDigital", severity: "high", baseRate: 18, description: "Reprogramming or corrupting municipal AI systems." },
  { id: "deepfakeFraud", name: "Deepfake Fraud", category: "dataDigital", severity: "medium", baseRate: 30, description: "Using AI-generated false media for deception or fraud." },
  { id: "cryptoTheft", name: "Crypto Theft", category: "dataDigital", severity: "medium", baseRate: 40, description: "Theft of digital currency from wallets or exchanges." },
  { id: "digitalRansomware", name: "Digital Ransomware", category: "dataDigital", severity: "high", baseRate: 25, description: "Encrypting victim data and demanding payment for release." },
  { id: "surveillanceHacking", name: "Surveillance Hacking", category: "dataDigital", severity: "high", baseRate: 15, description: "Compromising city surveillance systems for criminal purposes." },
  { id: "informationBrokering", name: "Information Brokering", category: "dataDigital", severity: "medium", baseRate: 35, description: "Illegal trade in stolen classified or private data." },
  { id: "neuralNetTrespass", name: "Neural Net Trespass", category: "dataDigital", severity: "high", baseRate: 10, description: "Unauthorized access to neural network infrastructure." },
  { id: "virtualIdentityTheft", name: "Virtual Identity Theft", category: "dataDigital", severity: "medium", baseRate: 22, description: "Stealing digital personas and virtual world identities." },
  { id: "dataMining", name: "Illegal Data Mining", category: "dataDigital", severity: "low", baseRate: 28, description: "Unauthorized harvesting of citizen data from public systems." },
  { id: "gridTampering", name: "Grid Tampering", category: "dataDigital", severity: "high", baseRate: 8, description: "Manipulating power or data grid infrastructure." },

  { id: "streetRacing", name: "Street Racing", category: "street", severity: "low", baseRate: 70, description: "Illegal high-speed racing through city corridors." },
  { id: "gangWarfare", name: "Gang Warfare", category: "street", severity: "critical", baseRate: 20, description: "Armed territorial conflicts between rival gangs." },
  { id: "protectionRacketeering", name: "Protection Racketeering", category: "street", severity: "high", baseRate: 35, description: "Extortion of businesses in exchange for 'protection' from gang violence." },
  { id: "stimDealering", name: "Stim Dealering", category: "street", severity: "medium", baseRate: 90, description: "Street-level distribution of performance-enhancing neural stimulants." },
  { id: "illegalGambling", name: "Illegal Gambling", category: "street", severity: "low", baseRate: 100, description: "Unlicensed gambling operations in the lower sectors." },
  { id: "streetVendorExtortion", name: "Street Vendor Extortion", category: "street", severity: "medium", baseRate: 45, description: "Shaking down unlicensed street vendors for protection fees." },
  { id: "graffitiBombing", name: "Graffiti Bombing", category: "street", severity: "low", baseRate: 150, description: "Large-scale defacement of public surfaces with gang tags." },
  { id: "squatting", name: "Squatting", category: "street", severity: "low", baseRate: 80, description: "Illegal occupation of abandoned hab-blocks." },
  { id: "droneFighting", name: "Drone Fighting", category: "street", severity: "medium", baseRate: 30, description: "Underground drone combat rings for gambling." },
  { id: "pedestrianAssault", name: "Pedestrian Assault", category: "street", severity: "high", baseRate: 65, description: "Random street-level attacks on passersby." },
  { id: "transitVandalism", name: "Transit Vandalism", category: "street", severity: "medium", baseRate: 50, description: "Damage to public transit infrastructure." },

  { id: "industrialEspionage", name: "Industrial Espionage", category: "industrial", severity: "high", baseRate: 10, description: "Corporate spying to steal trade secrets and technology." },
  { id: "toxicDumping", name: "Toxic Dumping", category: "industrial", severity: "high", baseRate: 8, description: "Illegal disposal of hazardous industrial waste." },
  { id: "factorySabotage", name: "Factory Sabotage", category: "industrial", severity: "high", baseRate: 5, description: "Deliberate destruction of manufacturing equipment." },
  { id: "laborExploitation", name: "Labor Exploitation", category: "industrial", severity: "medium", baseRate: 15, description: "Forced labor, unsafe conditions, or wage theft." },
  { id: "supplyChainTampering", name: "Supply Chain Tampering", category: "industrial", severity: "medium", baseRate: 6, description: "Corruption of supply chain integrity for profit." },
  { id: "patentTheft", name: "Patent Theft", category: "industrial", severity: "medium", baseRate: 9, description: "Stealing proprietary designs and manufacturing processes." },
  { id: "regulatoryFraud", name: "Regulatory Fraud", category: "industrial", severity: "medium", baseRate: 12, description: "Falsifying compliance reports and safety inspections." },
  { id: "energyTheft", name: "Energy Theft", category: "industrial", severity: "medium", baseRate: 20, description: "Illegally tapping into power grid infrastructure." },
  { id: "automationSabotage", name: "Automation Sabotage", category: "industrial", severity: "high", baseRate: 10, description: "Destroying automated systems to create manual labor demand." },
  { id: "wasteTrafficking", name: "Waste Trafficking", category: "industrial", severity: "medium", baseRate: 14, description: "Illegal transport and dumping of industrial waste for profit." },
  { id: "resourceHoarding", name: "Resource Hoarding", category: "industrial", severity: "medium", baseRate: 18, description: "Stockpiling essential resources to create artificial scarcity." },

  { id: "organHarvesting", name: "Organ Harvesting", category: "medical", severity: "critical", baseRate: 2, description: "Forcible extraction of biological organs for black-market sale." },
  { id: "illegalCloning", name: "Illegal Cloning", category: "medical", severity: "critical", baseRate: 1, description: "Unauthorized cloning of human tissue or entire organisms." },
  { id: "bioweaponDevelopment", name: "Bioweapon Development", category: "medical", severity: "critical", baseRate: 1, description: "Creation of biological agents intended as weapons." },
  { id: "unlicensedGeneMods", name: "Unlicensed Gene Mods", category: "medical", severity: "high", baseRate: 8, description: "Genetic modifications performed without authorization." },
  { id: "pharmaceuticalCounterfeiting", name: "Pharma Counterfeiting", category: "medical", severity: "medium", baseRate: 20, description: "Manufacturing and distributing counterfeit medications." },
  { id: "clinicalTrialFraud", name: "Clinical Trial Fraud", category: "medical", severity: "medium", baseRate: 4, description: "Falsifying experimental drug trial data." },
  { id: "medicalDataTrafficking", name: "Medical Data Trafficking", category: "medical", severity: "high", baseRate: 12, description: "Selling stolen patient health records on the black market." },
  { id: "plagueHoarding", name: "Plague Hoarding", category: "medical", severity: "critical", baseRate: 2, description: "Stockpiling dangerous pathogens for leverage or sale." },
  { id: "syntheticBloodTrafficking", name: "Synthetic Blood Trafficking", category: "medical", severity: "medium", baseRate: 5, description: "Illegal trade in synthetic blood products." },
  { id: "neurotoxinDistribution", name: "Neurotoxin Distribution", category: "medical", severity: "critical", baseRate: 3, description: "Distribution of neural-targeted chemical agents." },
  { id: "illegalPsychSurgery", name: "Illegal Psych Surgery", category: "medical", severity: "high", baseRate: 4, description: "Unauthorized psycho-surgical procedures on unwilling patients." },

  { id: "corporateAssassination", name: "Corporate Assassination", category: "highLevel", severity: "critical", baseRate: 1, description: "Contract killing of corporate executives and officials." },
  { id: "governmentInfiltration", name: "Government Infiltration", category: "highLevel", severity: "critical", baseRate: 2, description: "Placing agents within government institutions." },
  { id: "massManipulation", name: "Mass Manipulation", category: "highLevel", severity: "high", baseRate: 4, description: "Large-scale propaganda or social engineering campaigns." },
  { id: "electionRigging", name: "Election Rigging", category: "highLevel", severity: "high", baseRate: 2, description: "Manipulation of electoral processes and vote counting." },
  { id: "intelligenceSelling", name: "Intelligence Selling", category: "highLevel", severity: "high", baseRate: 5, description: "Selling classified intelligence to hostile entities." },
  { id: "megacorpWarfare", name: "Megacorp Warfare", category: "highLevel", severity: "critical", baseRate: 3, description: "Armed conflicts between rival megacorporations." },
  { id: "judicialCorruption", name: "Judicial Corruption", category: "highLevel", severity: "high", baseRate: 7, description: "Bribery or coercion of judges and legal officials." },
  { id: "politicalBlackmail", name: "Political Blackmail", category: "highLevel", severity: "high", baseRate: 5, description: "Leveraging compromising material against political figures." },
  { id: "shadowGovernment", name: "Shadow Government", category: "highLevel", severity: "critical", baseRate: 1, description: "Covert parallel governance structures undermining legitimate authority." },
  { id: "diplomaticCrimes", name: "Diplomatic Crimes", category: "highLevel", severity: "high", baseRate: 1, description: "Criminal acts committed under diplomatic immunity." },
  { id: "treason", name: "Treason", category: "highLevel", severity: "critical", baseRate: 0.5, description: "Betrayal of the city-state through espionage or insurrection." },

  { id: "unregisteredWeaponsSales", name: "Unreg. Weapons Sales", category: "blackMarket", severity: "high", baseRate: 35, description: "Black-market trade in unregistered firearms and energy weapons." },
  { id: "syntheticDrugManufacturing", name: "Synth Drug Manufacturing", category: "blackMarket", severity: "high", baseRate: 15, description: "Production of designer synthetic narcotics." },
  { id: "alienArtifactTrafficking", name: "Alien Artifact Traffic", category: "blackMarket", severity: "medium", baseRate: 3, description: "Trade in unidentified alien technology and artifacts." },
  { id: "slaveChipTrading", name: "Slave Chip Trading", category: "blackMarket", severity: "critical", baseRate: 5, description: "Manufacture and sale of neural compliance chips for forced servitude." },
  { id: "blackMarketCybernetics", name: "Black Market Cybernetics", category: "blackMarket", severity: "high", baseRate: 25, description: "Sale of stolen or counterfeit cybernetic hardware." },
  { id: "contrabandeering", name: "Contrabandeering", category: "blackMarket", severity: "medium", baseRate: 18, description: "General smuggling of prohibited goods and materials." },
  { id: "forgeryOperations", name: "Forgery Operations", category: "blackMarket", severity: "medium", baseRate: 30, description: "Production of counterfeit documents, credits, and identities." },
  { id: "illegalBountyHunting", name: "Illegal Bounty Hunting", category: "blackMarket", severity: "medium", baseRate: 8, description: "Unsanctioned capture or elimination of wanted individuals." },
  { id: "pitFighting", name: "Pit Fighting", category: "blackMarket", severity: "medium", baseRate: 14, description: "Organized underground combat matches for gambling profit." },
  { id: "mutantTrafficking", name: "Mutant Trafficking", category: "blackMarket", severity: "critical", baseRate: 4, description: "Capture and sale of mutated individuals for experimentation." },
  { id: "radioactiveMaterialSmuggling", name: "Radioactive Smuggling", category: "blackMarket", severity: "critical", baseRate: 2, description: "Illegal transport of radioactive materials for weapons or power." },

  { id: "xenofaunaPoaching", name: "Xenofauna Poaching", category: "biosphere", severity: "high", baseRate: 12, description: "Illegal hunting and capture of protected mutant fauna species." },
  { id: "illegalBiospecimenTrade", name: "Illegal Biospecimen Trade", category: "biosphere", severity: "high", baseRate: 8, description: "Black market trade in rare biological samples and genetic material." },
  { id: "ecoterrorism", name: "Eco-Terrorism", category: "biosphere", severity: "critical", baseRate: 3, description: "Deliberate destruction of biosphere reserves and ecological systems." },
  { id: "biosphereToxicDumping", name: "Biosphere Toxic Dumping", category: "biosphere", severity: "high", baseRate: 15, description: "Illegal disposal of hazardous waste in protected ecological zones." },
  { id: "biopiracy", name: "Biopiracy", category: "biosphere", severity: "medium", baseRate: 6, description: "Unauthorized harvesting and patenting of naturally occurring organisms." },
  { id: "ecosystemSabotage", name: "Ecosystem Sabotage", category: "biosphere", severity: "high", baseRate: 5, description: "Deliberate disruption of managed ecosystems for personal gain." },
  { id: "contaminationNegligence", name: "Contamination Negligence", category: "biosphere", severity: "medium", baseRate: 20, description: "Failure to follow bio-decontamination protocols causing ecological damage." },
  { id: "upliftAbuse", name: "Uplift Abuse", category: "uplift", severity: "high", baseRate: 10, description: "Physical or psychological abuse of uplifted sapient species." },
  { id: "upliftLabourExploitation", name: "Uplift Labour Exploitation", category: "uplift", severity: "high", baseRate: 18, description: "Forced or unfair labour conditions targeting uplift workers." },
  { id: "upliftTrafficking", name: "Uplift Trafficking", category: "uplift", severity: "critical", baseRate: 4, description: "Kidnapping and selling uplifted individuals as property or specimens." },
  { id: "illegalUpliftExperiments", name: "Illegal Uplift Experiments", category: "uplift", severity: "critical", baseRate: 2, description: "Unauthorized cognitive enhancement experiments on animals." },
  { id: "upliftIdentityFraud", name: "Uplift Identity Fraud", category: "uplift", severity: "medium", baseRate: 8, description: "Forging or stealing uplift citizenship documents." },
  { id: "interspeciesHateCrime", name: "Interspecies Hate Crime", category: "uplift", severity: "high", baseRate: 14, description: "Violent acts motivated by prejudice against uplifted species." },
  { id: "illegalDeUplift", name: "Illegal De-Uplift", category: "uplift", severity: "critical", baseRate: 1, description: "Forcibly reversing cognitive enhancement in sapient uplift beings." },
  { id: "upliftFightClubs", name: "Uplift Fight Clubs", category: "uplift", severity: "high", baseRate: 7, description: "Organizing illegal combat matches featuring uplift participants." },

  { id: "reactorWorshipViolation", name: "Reactor Worship Violation", category: "civilRights", severity: "medium", baseRate: 12, description: "Unauthorized religious gatherings at nuclear facility perimeters." },
  { id: "unlicensedGeneModification", name: "Unlicensed Gene Modification", category: "genetic", severity: "high", baseRate: 10, description: "Performing genetic alterations without medical certification." },
  { id: "infrastructureSabotage", name: "Infrastructure Sabotage", category: "industrial", severity: "critical", baseRate: 3, description: "Deliberate disruption of city utilities by disgruntled workers or factions." },
  { id: "contrabandsmugglingNetwork", name: "Contraband Smuggling Network", category: "blackMarket", severity: "high", baseRate: 8, description: "Operating organized smuggling routes through cargo district loopholes." },
  { id: "classWarfareIncitement", name: "Class Warfare Incitement", category: "civilRights", severity: "high", baseRate: 6, description: "Distributing propaganda encouraging violence between citizen classes." },
  { id: "aiTampering", name: "AI System Tampering", category: "dataDigital", severity: "critical", baseRate: 2, description: "Unauthorized modification of city management artificial intelligence systems." },
  { id: "weatherMachineAbuse", name: "Weather Machine Abuse", category: "industrial", severity: "high", baseRate: 4, description: "Illegal modification of atmospheric processors for personal gain." },
  { id: "expeditionFraud", name: "Expedition Fraud", category: "financial", severity: "medium", baseRate: 8, description: "Filing false expedition reports to claim hazard pay and discovery bonuses." },
  { id: "prestoricalArtifactTheft", name: "Pre-War Artifact Theft", category: "property", severity: "high", baseRate: 6, description: "Stealing recovered pre-collapse technology from government vaults." },
  { id: "factionEspionage", name: "Faction Espionage", category: "highLevel", severity: "critical", baseRate: 3, description: "Spying on city administration on behalf of an internal faction." },
  { id: "undercityTunneling", name: "Undercity Tunneling", category: "property", severity: "medium", baseRate: 10, description: "Unauthorized excavation creating unregulated passages beneath the city." },
  { id: "droidJailbreaking", name: "Droid Jailbreaking", category: "cybernetic", severity: "medium", baseRate: 14, description: "Removing behavioral restrictions from service droids for illegal purposes." },
  { id: "toxicMoonshining", name: "Toxic Moonshining", category: "narcotics", severity: "medium", baseRate: 18, description: "Manufacturing unregulated alcohol from industrial solvents in hab-block basements." },
  { id: "organLegging", name: "Organ Legging", category: "medical", severity: "critical", baseRate: 3, description: "Black market harvesting and sale of human organs from unwilling donors." },
  { id: "propagandaBroadcasting", name: "Pirate Propaganda Broadcasting", category: "civilRights", severity: "medium", baseRate: 12, description: "Operating unlicensed broadcast stations to spread anti-government messaging." },
];

export const CRIME_CATEGORY_LABELS: Record<CrimeCategory, string> = {
  violent: "Violent Crimes",
  property: "Property Crimes",
  financial: "Financial / Fraud",
  narcotics: "Narcotics / Weapons",
  organized: "Organized / Other",
  cybernetic: "Cybernetic Crime",
  dataDigital: "Data & Digital Crime",
  street: "Street Crime",
  industrial: "Industrial Crime",
  medical: "Medical Crime",
  highLevel: "High Level Crime",
  blackMarket: "Black Market Activities",
  genetic: "Genetic Crimes",
  civilRights: "Civil Rights Violations",
  biosphere: "Biosphere Crimes",
  uplift: "Uplift-Related Crimes",
};

import { SD_CRIMES, isSixthDayActive } from "@/engine/addons/sixthDay";

const SD_CRIMES_TYPED: CrimeTypeDef[] = SD_CRIMES.map((c) => ({
  ...c,
  category: c.category as CrimeCategory,
  severity: (c.severity <= 3 ? "low" : c.severity <= 5 ? "medium" : c.severity <= 7 ? "high" : "critical") as CrimeSeverity,
}));

export const ALL_CRIME_TYPES: CrimeTypeDef[] = [...CRIME_TYPES, ...SD_CRIMES_TYPED];


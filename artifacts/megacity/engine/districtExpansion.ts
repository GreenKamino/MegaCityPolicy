import type { District, TickEntry, GameMessage, GameDate } from "@/engine/types";

const EXPANSION_LOG_CAP = 100;

function pushExpansionLog(
  log: { tick: number; message: string }[],
  entry: { tick: number; message: string },
): void {
  log.push(entry);
  if (log.length > EXPANSION_LOG_CAP) log.splice(0, log.length - EXPANSION_LOG_CAP);
}

export type ContaminationType = "irradiated" | "flooded" | "collapsed" | "toxic" | "unstable";
export type ReclamationPhaseId = "survey" | "decontaminate" | "foundation" | "develop";

export type PhaseCost = {
  credits: number;
  steel: number;
  fuel: number;
  goods: number;
};

export type ReclamationPhase = {
  id: ReclamationPhaseId;
  label: string;
  ticksRequired: number;
  cost: PhaseCost;
  recurringPerTick: Partial<PhaseCost>;
};

export type PlotCategory =
  | "industrial_reclaim"
  | "hydroponic_sector"
  | "salvage_yard"
  | "reclaimed_residential"
  | "fortified_outpost"
  | "research_annex"
  | "energy_reclaim"
  | "water_reclaim";

export type ReclaimablePlot = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  contaminationType: ContaminationType;
  severity: number;
  targetCategory: PlotCategory;
  phases: ReclamationPhase[];
  resultDistrict: Omit<District, "id" | "name" | "subtitle">;
  requiredTech?: string;
  unlockTick?: number;
};

export type ActiveReclamation = {
  plotId: string;
  currentPhaseIndex: number;
  ticksElapsed: number;
  paused: boolean;
  startedTick: number;
  progressAccumulator?: number;
};

export type DistrictUpgradeTier = 1 | 2 | 3 | 4 | 5;

export type UpgradeCost = {
  credits: number;
  steel: number;
  goods: number;
};

export type ActiveUpgrade = {
  districtId: string;
  targetTier: DistrictUpgradeTier;
  ticksElapsed: number;
  ticksRequired: number;
};

export type DistrictExpansionState = {
  activeReclamations: ActiveReclamation[];
  completedPlotIds: string[];
  autoDevEnabled: boolean;
  totalReclaimed: number;
  districtTiers: Record<string, DistrictUpgradeTier>;
  activeUpgrades: ActiveUpgrade[];
  expansionLog: { tick: number; message: string }[];
};

export const CONTAMINATION_LABELS: Record<ContaminationType, string> = {
  irradiated: "Irradiated",
  flooded: "Flooded",
  collapsed: "Structurally Collapsed",
  toxic: "Toxic Waste",
  unstable: "Geologically Unstable",
};

export const CONTAMINATION_ICONS: Record<ContaminationType, string> = {
  irradiated: "zap",
  flooded: "cloud-rain",
  collapsed: "alert-triangle",
  toxic: "alert-octagon",
  unstable: "activity",
};

export const CONTAMINATION_COLORS: Record<ContaminationType, string> = {
  irradiated: "#CCFF00",
  flooded: "#4DA6FF",
  collapsed: "#FF8C00",
  toxic: "#9B59B6",
  unstable: "#E74C3C",
};

export const CATEGORY_LABELS: Record<PlotCategory, string> = {
  industrial_reclaim: "Industrial Reclaim",
  hydroponic_sector: "Hydroponic Sector",
  salvage_yard: "Salvage Yard",
  reclaimed_residential: "Reclaimed Residential",
  fortified_outpost: "Fortified Outpost",
  research_annex: "Research Annex",
  energy_reclaim: "Energy Reclaim",
  water_reclaim: "Water Reclaim",
};

export const PHASE_LABELS: Record<ReclamationPhaseId, string> = {
  survey: "Survey & Assess",
  decontaminate: "Decontaminate",
  foundation: "Lay Foundation",
  develop: "Develop District",
};

function makePhases(severity: number, category: PlotCategory): ReclamationPhase[] {
  const sm = severity;
  const catMult = category === "fortified_outpost" ? 1.3 :
    category === "research_annex" ? 1.4 :
    category === "energy_reclaim" ? 1.1 : 1.0;
  return [
    {
      id: "survey",
      label: "Survey & Assess",
      ticksRequired: Math.floor((8 + sm * 4) * catMult),
      cost: { credits: Math.floor((2000 + sm * 1500) * catMult), steel: 0, fuel: Math.floor(50 * sm), goods: 0 },
      recurringPerTick: { credits: Math.floor(50 * sm), fuel: Math.floor(5 * sm) },
    },
    {
      id: "decontaminate",
      label: "Decontaminate",
      ticksRequired: Math.floor((20 + sm * 12) * catMult),
      cost: { credits: Math.floor((8000 + sm * 5000) * catMult), steel: Math.floor(200 * sm), fuel: Math.floor(300 * sm), goods: Math.floor(100 * sm) },
      recurringPerTick: { credits: Math.floor(200 * sm), fuel: Math.floor(20 * sm) },
    },
    {
      id: "foundation",
      label: "Lay Foundation",
      ticksRequired: Math.floor((16 + sm * 8) * catMult),
      cost: { credits: Math.floor((12000 + sm * 6000) * catMult), steel: Math.floor(500 * sm * catMult), fuel: Math.floor(150 * sm), goods: Math.floor(200 * sm) },
      recurringPerTick: { credits: Math.floor(300 * sm), steel: Math.floor(15 * sm) },
    },
    {
      id: "develop",
      label: "Develop District",
      ticksRequired: Math.floor((24 + sm * 10) * catMult),
      cost: { credits: Math.floor((20000 + sm * 10000) * catMult), steel: Math.floor(400 * sm), fuel: Math.floor(100 * sm), goods: Math.floor(500 * sm * catMult) },
      recurringPerTick: { credits: Math.floor(500 * sm), goods: Math.floor(10 * sm) },
    },
  ];
}

export const RECLAIMABLE_PLOTS: ReclaimablePlot[] = [
  {
    id: "plot-sector-77",
    name: "Sector 77 (Irradiated)",
    subtitle: "Former reactor district, heavily irradiated",
    description: "Once home to the city's secondary fusion grid, Sector 77 was abandoned after a catastrophic meltdown. Radiation levels remain lethal without decontamination.",
    contaminationType: "irradiated",
    severity: 4,
    targetCategory: "energy_reclaim",
    phases: makePhases(4, "energy_reclaim"),
    resultDistrict: { population: 5000, wealth: 60, crime: 15, unrest: 12, loyalty: 65, infraQuality: 72, gangInfluence: 8, mutationRate: 15, defenseRating: 55, industrialOutput: 70, ecology: 15 },
  },
  {
    id: "plot-drowned-levels",
    name: "The Drowned Levels",
    subtitle: "Flooded sub-sectors beneath the waterline",
    description: "These lower levels were submerged when the old seawall collapsed. Pumping them dry reveals usable infrastructure and salvageable material.",
    contaminationType: "flooded",
    severity: 3,
    targetCategory: "salvage_yard",
    phases: makePhases(3, "salvage_yard"),
    resultDistrict: { population: 3000, wealth: 40, crime: 25, unrest: 20, loyalty: 50, infraQuality: 55, gangInfluence: 18, mutationRate: 8, defenseRating: 40, industrialOutput: 65, ecology: 8 },
  },
  {
    id: "plot-ironside-ruins",
    name: "Ironside Ruins",
    subtitle: "Collapsed megastructure debris field",
    description: "The twisted remains of the Ironside hab-tower. A forest of rebar and concrete, but the foundations are sound enough for reconstruction.",
    contaminationType: "collapsed",
    severity: 3,
    targetCategory: "reclaimed_residential",
    phases: makePhases(3, "reclaimed_residential"),
    resultDistrict: { population: 12000, wealth: 45, crime: 22, unrest: 18, loyalty: 55, infraQuality: 60, gangInfluence: 15, mutationRate: 5, defenseRating: 45, industrialOutput: 25, ecology: 22 },
  },
  {
    id: "plot-chemical-flats",
    name: "Chemical Flats",
    subtitle: "Abandoned industrial waste zone",
    description: "Decades of unregulated dumping left these blocks saturated with toxic compounds. Full remediation could yield prime industrial land.",
    contaminationType: "toxic",
    severity: 5,
    targetCategory: "industrial_reclaim",
    phases: makePhases(5, "industrial_reclaim"),
    resultDistrict: { population: 6000, wealth: 50, crime: 28, unrest: 25, loyalty: 45, infraQuality: 58, gangInfluence: 22, mutationRate: 20, defenseRating: 48, industrialOutput: 85, ecology: 10 },
  },
  {
    id: "plot-tremor-ridge",
    name: "Tremor Ridge",
    subtitle: "Seismically active perimeter zone",
    description: "Frequent micro-quakes have rendered this sector uninhabitable, but geothermal energy potential is enormous if stabilized.",
    contaminationType: "unstable",
    severity: 4,
    targetCategory: "energy_reclaim",
    phases: makePhases(4, "energy_reclaim"),
    resultDistrict: { population: 4000, wealth: 55, crime: 12, unrest: 15, loyalty: 60, infraQuality: 65, gangInfluence: 5, mutationRate: 8, defenseRating: 50, industrialOutput: 60, ecology: 15 },
  },
  {
    id: "plot-fungal-gardens",
    name: "Fungal Gardens",
    subtitle: "Bio-contaminated hydroponics facility",
    description: "An experimental vertical farm overrun by mutant fungal growth. With proper decontamination, it could feed thousands.",
    contaminationType: "toxic",
    severity: 2,
    targetCategory: "hydroponic_sector",
    phases: makePhases(2, "hydroponic_sector"),
    resultDistrict: { population: 4000, wealth: 52, crime: 10, unrest: 8, loyalty: 70, infraQuality: 68, gangInfluence: 5, mutationRate: 12, defenseRating: 35, industrialOutput: 40, ecology: 55 },
  },
  {
    id: "plot-sunken-works",
    name: "Sunken Works",
    subtitle: "Partially flooded manufacturing block",
    description: "Water seeps through cracked foundations, but the heavy machinery below is still partially functional. Worth reclaiming for industry.",
    contaminationType: "flooded",
    severity: 2,
    targetCategory: "industrial_reclaim",
    phases: makePhases(2, "industrial_reclaim"),
    resultDistrict: { population: 7000, wealth: 48, crime: 25, unrest: 22, loyalty: 48, infraQuality: 55, gangInfluence: 20, mutationRate: 6, defenseRating: 42, industrialOutput: 78, ecology: 10 },
  },
  {
    id: "plot-north-bastion",
    name: "North Bastion",
    subtitle: "Ruined perimeter defense complex",
    description: "An old wall-fortress on the city's northern edge, blasted during the faction wars. Rebuild it and gain a formidable defensive position.",
    contaminationType: "collapsed",
    severity: 3,
    targetCategory: "fortified_outpost",
    phases: makePhases(3, "fortified_outpost"),
    resultDistrict: { population: 2500, wealth: 55, crime: 8, unrest: 10, loyalty: 75, infraQuality: 78, gangInfluence: 3, mutationRate: 2, defenseRating: 90, industrialOutput: 15, ecology: 18 },
  },
  {
    id: "plot-ashfall-crater",
    name: "Ashfall Crater",
    subtitle: "Impact site from orbital debris strike",
    description: "A massive crater from a derelict satellite impact. The surrounding area is irradiated but the crater itself is geologically rich.",
    contaminationType: "irradiated",
    severity: 5,
    targetCategory: "research_annex",
    phases: makePhases(5, "research_annex"),
    resultDistrict: { population: 3000, wealth: 70, crime: 10, unrest: 8, loyalty: 72, infraQuality: 80, gangInfluence: 2, mutationRate: 18, defenseRating: 60, industrialOutput: 30, ecology: 30 },
    requiredTech: "advanced_decontamination_protocols",
  },
  {
    id: "plot-pipeline-delta",
    name: "Pipeline Delta",
    subtitle: "Ruptured water main junction",
    description: "The convergence of three major water mains, all ruptured. Fix them and this becomes a water processing hub for the entire eastern wall.",
    contaminationType: "flooded",
    severity: 3,
    targetCategory: "water_reclaim",
    phases: makePhases(3, "water_reclaim"),
    resultDistrict: { population: 5000, wealth: 55, crime: 15, unrest: 12, loyalty: 62, infraQuality: 70, gangInfluence: 8, mutationRate: 5, defenseRating: 45, industrialOutput: 45, ecology: 35 },
  },
  {
    id: "plot-reactor-sub-7",
    name: "Reactor Sub-Level 7",
    subtitle: "Deep underground reactor chamber",
    description: "Buried beneath collapsed tunnels, this pre-war reactor chamber still has viable containment. Could provide massive power output.",
    contaminationType: "irradiated",
    severity: 3,
    targetCategory: "energy_reclaim",
    phases: makePhases(3, "energy_reclaim"),
    resultDistrict: { population: 2000, wealth: 62, crime: 8, unrest: 10, loyalty: 68, infraQuality: 75, gangInfluence: 3, mutationRate: 12, defenseRating: 55, industrialOutput: 65, ecology: 15 },
  },
  {
    id: "plot-black-marsh",
    name: "Black Marsh",
    subtitle: "Toxic wetland on southern perimeter",
    description: "A stagnant lake of industrial runoff, but beneath it lies fertile ground. Full bioremediation could create the city's largest food source.",
    contaminationType: "toxic",
    severity: 4,
    targetCategory: "hydroponic_sector",
    phases: makePhases(4, "hydroponic_sector"),
    resultDistrict: { population: 6000, wealth: 50, crime: 12, unrest: 10, loyalty: 68, infraQuality: 65, gangInfluence: 6, mutationRate: 15, defenseRating: 30, industrialOutput: 35, ecology: 55 },
  },
  {
    id: "plot-scrap-canyon",
    name: "Scrap Canyon",
    subtitle: "Vehicle graveyard and debris ravine",
    description: "A kilometre-long ravine filled with crushed vehicles and broken drones. Endless salvage potential if the unstable walls can be shored up.",
    contaminationType: "unstable",
    severity: 2,
    targetCategory: "salvage_yard",
    phases: makePhases(2, "salvage_yard"),
    resultDistrict: { population: 3500, wealth: 38, crime: 30, unrest: 22, loyalty: 42, infraQuality: 50, gangInfluence: 25, mutationRate: 5, defenseRating: 35, industrialOutput: 72, ecology: 8 },
  },
  {
    id: "plot-hab-19",
    name: "Hab-Block 19",
    subtitle: "Condemned residential mega-tower",
    description: "A 180-story housing block condemned after structural failure. Demolish the upper floors and rebuild from the sound lower structure.",
    contaminationType: "collapsed",
    severity: 2,
    targetCategory: "reclaimed_residential",
    phases: makePhases(2, "reclaimed_residential"),
    resultDistrict: { population: 15000, wealth: 42, crime: 28, unrest: 22, loyalty: 50, infraQuality: 55, gangInfluence: 18, mutationRate: 4, defenseRating: 40, industrialOutput: 20, ecology: 22 },
  },
  {
    id: "plot-western-wall",
    name: "Western Wall Breach",
    subtitle: "Destroyed wall section, open to wasteland",
    description: "A 300-metre gap in the western perimeter wall. Seal it and the surrounding blocks become a viable military outpost.",
    contaminationType: "collapsed",
    severity: 4,
    targetCategory: "fortified_outpost",
    phases: makePhases(4, "fortified_outpost"),
    resultDistrict: { population: 3000, wealth: 50, crime: 12, unrest: 15, loyalty: 70, infraQuality: 72, gangInfluence: 5, mutationRate: 3, defenseRating: 88, industrialOutput: 20, ecology: 18 },
  },
  {
    id: "plot-spore-vault",
    name: "Spore Vault",
    subtitle: "Bio-hazard containment facility",
    description: "A sealed bio-weapons research lab that breached containment. Dangerous to clear, but the equipment inside is invaluable for research.",
    contaminationType: "toxic",
    severity: 5,
    targetCategory: "research_annex",
    phases: makePhases(5, "research_annex"),
    resultDistrict: { population: 2000, wealth: 75, crime: 8, unrest: 5, loyalty: 78, infraQuality: 85, gangInfluence: 2, mutationRate: 22, defenseRating: 65, industrialOutput: 25, ecology: 30 },
    requiredTech: "deep_soil_remediation",
  },
  {
    id: "plot-acid-basin",
    name: "Acid Basin",
    subtitle: "Corroded industrial reservoir",
    description: "A massive industrial holding tank that overflowed, creating an acidic lake. Neutralise it and reclaim prime water infrastructure.",
    contaminationType: "toxic",
    severity: 3,
    targetCategory: "water_reclaim",
    phases: makePhases(3, "water_reclaim"),
    resultDistrict: { population: 4000, wealth: 52, crime: 12, unrest: 10, loyalty: 65, infraQuality: 68, gangInfluence: 6, mutationRate: 8, defenseRating: 42, industrialOutput: 40, ecology: 35 },
  },
  {
    id: "plot-quake-shelf",
    name: "Quake Shelf",
    subtitle: "Elevated plateau prone to tremors",
    description: "An elevated section of the city shifted during seismic activity. Stabilise the ground and it becomes an excellent residential sector with views.",
    contaminationType: "unstable",
    severity: 3,
    targetCategory: "reclaimed_residential",
    phases: makePhases(3, "reclaimed_residential"),
    resultDistrict: { population: 10000, wealth: 55, crime: 18, unrest: 15, loyalty: 58, infraQuality: 62, gangInfluence: 10, mutationRate: 4, defenseRating: 48, industrialOutput: 22, ecology: 22 },
  },
  {
    id: "plot-silo-complex",
    name: "Silo Complex",
    subtitle: "Buried pre-war missile silos",
    description: "A cluster of decommissioned missile silos. The underground chambers are vast and structurally sound — perfect for deep-level research.",
    contaminationType: "irradiated",
    severity: 2,
    targetCategory: "research_annex",
    phases: makePhases(2, "research_annex"),
    resultDistrict: { population: 2500, wealth: 68, crime: 5, unrest: 5, loyalty: 75, infraQuality: 80, gangInfluence: 2, mutationRate: 10, defenseRating: 70, industrialOutput: 35, ecology: 30 },
  },
  {
    id: "plot-rust-hollow",
    name: "Rust Hollow",
    subtitle: "Decaying freight terminal",
    description: "An enormous freight sorting facility, its roof collapsed under years of corrosion. The rail connections are still viable for industrial use.",
    contaminationType: "collapsed",
    severity: 2,
    targetCategory: "industrial_reclaim",
    phases: makePhases(2, "industrial_reclaim"),
    resultDistrict: { population: 5000, wealth: 45, crime: 28, unrest: 22, loyalty: 48, infraQuality: 52, gangInfluence: 20, mutationRate: 5, defenseRating: 40, industrialOutput: 80, ecology: 10 },
  },
  {
    id: "plot-glass-field",
    name: "Glass Field",
    subtitle: "Vitrified blast zone from thermal weapon",
    description: "Ground turned to glass by an ancient thermal detonation. The radiation has faded enough for reclamation, and the flat terrain is ideal for solar arrays.",
    contaminationType: "irradiated",
    severity: 3,
    targetCategory: "energy_reclaim",
    phases: makePhases(3, "energy_reclaim"),
    resultDistrict: { population: 3000, wealth: 58, crime: 8, unrest: 8, loyalty: 65, infraQuality: 70, gangInfluence: 3, mutationRate: 10, defenseRating: 50, industrialOutput: 55, ecology: 15 },
  },
  {
    id: "plot-overflow-stacks",
    name: "Overflow Stacks",
    subtitle: "Flooded waste processing towers",
    description: "The old waste processing towers, flooded when the pumps failed. Drain them and you have a functional waste-to-energy facility.",
    contaminationType: "flooded",
    severity: 4,
    targetCategory: "energy_reclaim",
    phases: makePhases(4, "energy_reclaim"),
    resultDistrict: { population: 3500, wealth: 50, crime: 15, unrest: 12, loyalty: 60, infraQuality: 62, gangInfluence: 8, mutationRate: 8, defenseRating: 45, industrialOutput: 60, ecology: 15 },
  },
  {
    id: "plot-bone-yard",
    name: "The Bone Yard",
    subtitle: "Mass grave and collapsed necropolis",
    description: "A grim legacy of the plague years. The mass graves have been sealed but the ground is rich in rare minerals from decomposition.",
    contaminationType: "toxic",
    severity: 2,
    targetCategory: "salvage_yard",
    phases: makePhases(2, "salvage_yard"),
    resultDistrict: { population: 2000, wealth: 35, crime: 32, unrest: 25, loyalty: 38, infraQuality: 45, gangInfluence: 28, mutationRate: 10, defenseRating: 30, industrialOutput: 55, ecology: 8 },
  },
  {
    id: "plot-south-gate",
    name: "South Gate Redoubt",
    subtitle: "Destroyed gatehouse and barracks",
    description: "The southern approach to the city, once heavily fortified. Restore the gate and gain control of the major southern trade route.",
    contaminationType: "collapsed",
    severity: 3,
    targetCategory: "fortified_outpost",
    phases: makePhases(3, "fortified_outpost"),
    resultDistrict: { population: 3000, wealth: 55, crime: 10, unrest: 10, loyalty: 72, infraQuality: 75, gangInfluence: 4, mutationRate: 2, defenseRating: 85, industrialOutput: 18, ecology: 18 },
  },
  {
    id: "plot-mire-district",
    name: "The Mire",
    subtitle: "Waterlogged slum district",
    description: "A low-lying area that floods every rain season. Install proper drainage and it becomes prime real estate for the city's growing population.",
    contaminationType: "flooded",
    severity: 1,
    targetCategory: "reclaimed_residential",
    phases: makePhases(1, "reclaimed_residential"),
    resultDistrict: { population: 18000, wealth: 38, crime: 32, unrest: 28, loyalty: 42, infraQuality: 48, gangInfluence: 22, mutationRate: 6, defenseRating: 32, industrialOutput: 18, ecology: 22 },
  },
];

export const UPGRADE_TIER_LABELS: Record<DistrictUpgradeTier, string> = {
  1: "Tier I — Basic Refurbishment",
  2: "Tier II — Infrastructure Overhaul",
  3: "Tier III — Advanced Systems",
  4: "Tier IV — Full Modernisation",
  5: "Tier V — Apex District",
};

export const UPGRADE_TIER_COSTS: Record<DistrictUpgradeTier, UpgradeCost> = {
  1: { credits: 5000, steel: 100, goods: 50 },
  2: { credits: 15000, steel: 300, goods: 150 },
  3: { credits: 40000, steel: 600, goods: 400 },
  4: { credits: 80000, steel: 1000, goods: 800 },
  5: { credits: 150000, steel: 2000, goods: 1500 },
};

export const UPGRADE_TIER_TICKS: Record<DistrictUpgradeTier, number> = {
  1: 16,
  2: 32,
  3: 48,
  4: 72,
  5: 100,
};

export const UPGRADE_TIER_BONUSES: Record<DistrictUpgradeTier, Partial<Record<keyof District, number>>> = {
  1: { wealth: 3, infraQuality: 5, crime: -2, loyalty: 2 },
  2: { wealth: 5, infraQuality: 8, crime: -4, loyalty: 4, industrialOutput: 3, defenseRating: 3 },
  3: { wealth: 8, infraQuality: 12, crime: -6, loyalty: 6, industrialOutput: 5, defenseRating: 5, gangInfluence: -3 },
  4: { wealth: 12, infraQuality: 15, crime: -8, loyalty: 8, industrialOutput: 8, defenseRating: 8, gangInfluence: -5, mutationRate: -3 },
  5: { wealth: 15, infraQuality: 20, crime: -10, loyalty: 12, industrialOutput: 12, defenseRating: 12, gangInfluence: -8, mutationRate: -5, unrest: -5 },
};

export const EXPANSION_TECHS = [
  {
    id: "advanced_decontamination_protocols",
    name: "Advanced Decontamination Protocols",
    description: "Enables reclamation of heavily irradiated zones. Reduces decontamination phase duration by 20%.",
    tier: 3,
    category: "construction",
    researchCost: 180,
    effects: { constructionSpeed: 5, infrastructureHealth: 3 },
    prerequisites: ["underground_bunker_network"],
  },
  {
    id: "deep_soil_remediation",
    name: "Deep Soil Remediation",
    description: "Bio-engineered microbes break down deep toxic contamination. Enables reclamation of severity-5 toxic plots.",
    tier: 4,
    category: "food",
    researchCost: 240,
    effects: { infrastructureHealth: 5 },
    prerequisites: ["advanced_decontamination_protocols"],
  },
  {
    id: "rapid_foundation_laying",
    name: "Rapid Foundation Laying",
    description: "Pre-fabricated foundation modules halve the foundation phase duration for all reclamation projects.",
    tier: 2,
    category: "construction",
    researchCost: 120,
    effects: { constructionSpeed: 8 },
    prerequisites: ["rapid_concrete_polymerization"],
  },
  {
    id: "automated_survey_drones",
    name: "Automated Survey Drones",
    description: "Autonomous drones perform site surveys at 3x speed, dramatically reducing the survey phase duration.",
    tier: 2,
    category: "construction",
    researchCost: 100,
    effects: { constructionSpeed: 5 },
    prerequisites: ["automated_construction_drones"],
  },
  {
    id: "structural_reclamation_engineering",
    name: "Structural Reclamation Engineering",
    description: "Specialised techniques for rebuilding on collapsed foundations. Reduces all phase costs for collapsed plots by 25%.",
    tier: 3,
    category: "construction",
    researchCost: 160,
    effects: { constructionSpeed: 6, infrastructureHealth: 4 },
    prerequisites: ["rapid_foundation_laying"],
  },
  {
    id: "expansion_logistics_network",
    name: "Expansion Logistics Network",
    description: "Dedicated supply chains for expansion projects. Reduces recurring costs across all reclamation phases by 30%.",
    tier: 3,
    category: "civic",
    researchCost: 150,
    effects: { constructionSpeed: 4 },
    prerequisites: ["infrastructure_planning_algorithms"],
  },
  {
    id: "seismic_stabilisation_arrays",
    name: "Seismic Stabilisation Arrays",
    description: "Deep-bore stabilisers neutralise geological instability. Reduces all phase durations for unstable plots by 30%.",
    tier: 3,
    category: "construction",
    researchCost: 170,
    effects: { infrastructureHealth: 6 },
    prerequisites: ["rapid_foundation_laying"],
  },
  {
    id: "mega_reclamation_initiative",
    name: "Mega-Reclamation Initiative",
    description: "City-wide expansion programme. All reclamation projects gain +50% speed and auto-develop unlocks globally.",
    tier: 5,
    category: "civic",
    researchCost: 350,
    effects: { constructionSpeed: 15, infrastructureHealth: 10 },
    prerequisites: ["structural_reclamation_engineering", "expansion_logistics_network"],
  },
  {
    id: "district_modernisation_programme",
    name: "District Modernisation Programme",
    description: "Enables district upgrades to Tier III and above. Reduces upgrade costs by 15%.",
    tier: 3,
    category: "civic",
    researchCost: 140,
    effects: { infrastructureHealth: 5, happiness: 3 },
    prerequisites: ["elite_district_governance"],
  },
  {
    id: "apex_district_engineering",
    name: "Apex District Engineering",
    description: "Unlocks Tier V district upgrades. Apex districts become self-sustaining economic powerhouses.",
    tier: 5,
    category: "construction",
    researchCost: 320,
    effects: { constructionSpeed: 10, infrastructureHealth: 12 },
    prerequisites: ["district_modernisation_programme", "self_repairing_infrastructure"],
  },
];

export function initExpansionState(): DistrictExpansionState {
  return {
    activeReclamations: [],
    completedPlotIds: [],
    autoDevEnabled: false,
    totalReclaimed: 0,
    districtTiers: {},
    activeUpgrades: [],
    expansionLog: [],
  };
}

function getTechSpeedMult(unlockedTechs: string[], plot: ReclaimablePlot, phaseId: ReclamationPhaseId): number {
  let mult = 1.0;
  if (unlockedTechs.includes("automated_survey_drones") && phaseId === "survey") mult *= 3.0;
  if (unlockedTechs.includes("rapid_foundation_laying") && phaseId === "foundation") mult *= 2.0;
  if (unlockedTechs.includes("mega_reclamation_initiative")) mult *= 1.5;
  if (unlockedTechs.includes("seismic_stabilisation_arrays") && plot.contaminationType === "unstable") mult *= 1.3;
  if (unlockedTechs.includes("advanced_decontamination_protocols") && phaseId === "decontaminate") mult *= 1.2;
  return mult;
}

function getTechCostMult(unlockedTechs: string[], plot: ReclaimablePlot): number {
  let mult = 1.0;
  if (unlockedTechs.includes("structural_reclamation_engineering") && plot.contaminationType === "collapsed") mult *= 0.75;
  if (unlockedTechs.includes("expansion_logistics_network")) mult *= 0.7;
  if (unlockedTechs.includes("district_modernisation_programme")) mult *= 0.85;
  return mult;
}

export function canAffordPhase(
  resources: { credits: number; steel: number; fuel: number; goods: number },
  phase: ReclamationPhase,
  costMult: number,
): boolean {
  return (
    resources.credits >= Math.floor(phase.cost.credits * costMult) &&
    resources.steel >= Math.floor(phase.cost.steel * costMult) &&
    resources.fuel >= Math.floor(phase.cost.fuel * costMult) &&
    resources.goods >= Math.floor(phase.cost.goods * costMult)
  );
}

export function canAffordUpgrade(
  resources: { credits: number; steel: number; goods: number },
  tier: DistrictUpgradeTier,
  costMult: number,
): boolean {
  const cost = UPGRADE_TIER_COSTS[tier];
  return (
    resources.credits >= Math.floor(cost.credits * costMult) &&
    resources.steel >= Math.floor(cost.steel * costMult) &&
    resources.goods >= Math.floor(cost.goods * costMult)
  );
}

export function getAvailablePlots(
  state: { unlockedTechnologies: string[]; districtExpansion?: DistrictExpansionState },
): ReclaimablePlot[] {
  const exp = state.districtExpansion ?? initExpansionState();
  const activeIds = new Set(exp.activeReclamations.map(r => r.plotId));
  const completedIds = new Set(exp.completedPlotIds);
  return RECLAIMABLE_PLOTS.filter(p => {
    if (activeIds.has(p.id) || completedIds.has(p.id)) return false;
    if (p.requiredTech && !state.unlockedTechnologies.includes(p.requiredTech)) return false;
    return true;
  });
}

export function processExpansionTick(
  s: {
    districtExpansion?: DistrictExpansionState;
    districts: District[];
    resources: { credits: number; steel: number; fuel: number; goods: number; food: number; water: number; power: number; medSupplies: number; ammo: number };
    unlockedTechnologies: string[];
    totalTicks: number;
    gameDate: GameDate;
    messages: GameMessage[];
  },
  entries: TickEntry[],
): void {
  if (!s.districtExpansion) s.districtExpansion = initExpansionState();
  const exp = s.districtExpansion;

  for (const rec of exp.activeReclamations) {
    if (rec.paused) continue;
    const plot = RECLAIMABLE_PLOTS.find(p => p.id === rec.plotId);
    if (!plot) continue;
    const phase = plot.phases[rec.currentPhaseIndex];
    if (!phase) continue;

    const costMult = getTechCostMult(s.unlockedTechnologies, plot);
    const recurring = phase.recurringPerTick;
    const rcCredits = Math.floor((recurring.credits ?? 0) * costMult);
    const rcSteel = Math.floor((recurring.steel ?? 0) * costMult);
    const rcFuel = Math.floor((recurring.fuel ?? 0) * costMult);
    const rcGoods = Math.floor((recurring.goods ?? 0) * costMult);

    if (s.resources.credits < rcCredits || s.resources.steel < rcSteel ||
        s.resources.fuel < rcFuel || s.resources.goods < rcGoods) {
      entries.push({
        label: `Reclamation: ${plot.name}`,
        delta: 0,
        unit: "status",
        reason: "Insufficient resources — reclamation paused",
        severity: "warning",
      });
      rec.paused = true;
      continue;
    }

    s.resources.credits -= rcCredits;
    s.resources.steel -= rcSteel;
    s.resources.fuel -= rcFuel;
    s.resources.goods -= rcGoods;

    const speedMult = getTechSpeedMult(s.unlockedTechnologies, plot, phase.id);
    rec.progressAccumulator = (rec.progressAccumulator ?? 0) + speedMult;
    const wholeProgress = Math.floor(rec.progressAccumulator);
    rec.progressAccumulator -= wholeProgress;
    rec.ticksElapsed += Math.max(1, wholeProgress);

    if (rec.ticksElapsed >= phase.ticksRequired) {
      rec.ticksElapsed = 0;
      const isLastPhase = rec.currentPhaseIndex >= plot.phases.length - 1;

      if (isLastPhase) {
        const newDistrict: District = {
          id: `reclaimed-${plot.id}`,
          name: plot.name.replace(/ \(.*\)/, ""),
          subtitle: CATEGORY_LABELS[plot.targetCategory],
          ...plot.resultDistrict,
        };
        s.districts.push(newDistrict);
        exp.completedPlotIds.push(plot.id);
        exp.totalReclaimed++;
        pushExpansionLog(exp.expansionLog, { tick: s.totalTicks, message: `${plot.name} fully reclaimed — new district operational` });

        const msg: GameMessage = {
          id: `reclaim-complete-${plot.id}-${s.totalTicks}`,
          timestamp: { ...s.gameDate },
          tick: s.totalTicks,
          category: "update",
          title: "DISTRICT RECLAIMED",
          body: `${plot.name} reclamation complete. New ${CATEGORY_LABELS[plot.targetCategory]} district is now operational with ${plot.resultDistrict.population.toLocaleString()} citizens.`,
          read: false,
          priority: "high",
        };
        s.messages = [msg, ...s.messages].slice(0, 200);

        entries.push({
          label: `Reclamation: ${plot.name}`,
          delta: 1,
          unit: "district",
          reason: "Reclamation complete — new district added",
          severity: "positive",
        });
      } else {
        rec.currentPhaseIndex++;
        const nextPhase = plot.phases[rec.currentPhaseIndex];

        if (exp.autoDevEnabled && nextPhase) {
          if (canAffordPhase(s.resources, nextPhase, getTechCostMult(s.unlockedTechnologies, plot))) {
            s.resources.credits -= Math.floor(nextPhase.cost.credits * getTechCostMult(s.unlockedTechnologies, plot));
            s.resources.steel -= Math.floor(nextPhase.cost.steel * getTechCostMult(s.unlockedTechnologies, plot));
            s.resources.fuel -= Math.floor(nextPhase.cost.fuel * getTechCostMult(s.unlockedTechnologies, plot));
            s.resources.goods -= Math.floor(nextPhase.cost.goods * getTechCostMult(s.unlockedTechnologies, plot));
          } else {
            rec.paused = true;
            entries.push({
              label: `Reclamation: ${plot.name}`,
              delta: 0,
              unit: "status",
              reason: `Cannot afford ${nextPhase.label} phase — auto-develop paused`,
              severity: "warning",
            });
          }
        } else if (!exp.autoDevEnabled) {
          rec.paused = true;
        }

        pushExpansionLog(exp.expansionLog, { tick: s.totalTicks, message: `${plot.name}: ${phase.label} phase complete` });
        entries.push({
          label: `Reclamation: ${plot.name}`,
          delta: 0,
          unit: "phase",
          reason: `${phase.label} phase complete`,
          severity: "positive",
        });
      }
    }
  }

  exp.activeReclamations = exp.activeReclamations.filter(r => {
    return !exp.completedPlotIds.includes(r.plotId);
  });

  for (const upg of exp.activeUpgrades) {
    upg.ticksElapsed++;
    if (upg.ticksElapsed >= upg.ticksRequired) {
      const tier = upg.targetTier;
      exp.districtTiers[upg.districtId] = tier;
      const bonuses = UPGRADE_TIER_BONUSES[tier];
      const distIdx = s.districts.findIndex(d => d.id === upg.districtId);
      if (distIdx >= 0 && bonuses) {
        s.districts[distIdx] = { ...s.districts[distIdx] };
        const bd = s.districts[distIdx];
        for (const [key, val] of Object.entries(bonuses)) {
          const k = key as keyof District;
          if (typeof bd[k] === "number" && typeof val === "number") {
            (bd as any)[k] = Math.max(0, Math.min(100, (bd[k] as number) + val));
          }
        }
      }
      const dist = distIdx >= 0 ? s.districts[distIdx] : undefined;

      pushExpansionLog(exp.expansionLog, { tick: s.totalTicks, message: `${dist?.name ?? upg.districtId} upgraded to ${UPGRADE_TIER_LABELS[tier]}` });
      entries.push({
        label: `District Upgrade: ${dist?.name ?? upg.districtId}`,
        delta: tier,
        unit: "tier",
        reason: `Upgraded to ${UPGRADE_TIER_LABELS[tier]}`,
        severity: "positive",
      });

      const msg: GameMessage = {
        id: `upgrade-${upg.districtId}-t${tier}-${s.totalTicks}`,
        timestamp: { ...s.gameDate },
        tick: s.totalTicks,
        category: "update",
        title: "DISTRICT UPGRADED",
        body: `${dist?.name ?? upg.districtId} has been upgraded to ${UPGRADE_TIER_LABELS[tier]}.`,
        read: false,
        priority: "normal",
      };
      s.messages = [msg, ...s.messages].slice(0, 200);
    }
  }

  exp.activeUpgrades = exp.activeUpgrades.filter(u => u.ticksElapsed < u.ticksRequired);
}

export function getMaxUpgradeTier(unlockedTechs: string[]): DistrictUpgradeTier {
  if (unlockedTechs.includes("apex_district_engineering")) return 5;
  if (unlockedTechs.includes("district_modernisation_programme")) return 4;
  return 2;
}

export function getUpgradeCostMult(unlockedTechs: string[]): number {
  let mult = 1.0;
  if (unlockedTechs.includes("district_modernisation_programme")) mult *= 0.85;
  return mult;
}

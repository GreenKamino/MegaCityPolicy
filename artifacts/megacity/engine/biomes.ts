export type Biome =
  | "toxic_marsh"
  | "ash_forest"
  | "glass_desert"
  | "irradiated_jungle"
  | "fungal_caves"
  | "dead_sea_coast"
  | "ruined_park";

export type SpeciesRole =
  | "producer"
  | "herbivore"
  | "predator"
  | "scavenger"
  | "vermin"
  | "megafauna";

export type EcologyTier = "barren" | "fragile" | "stable" | "thriving";

export type BiomeDef = {
  id: Biome;
  name: string;
  shortName: string;
  description: string;
  color: string;
  ecologyTier: EcologyTier;
  dominantRoles: SpeciesRole[];
};

export const BIOMES: Record<Biome, BiomeDef> = {
  toxic_marsh: {
    id: "toxic_marsh",
    name: "Toxic Marshlands",
    shortName: "MARSH",
    description: "Stagnant chemical bogs choked with mutated reeds. Anything that drinks the water dies, but the marsh teems with life that has stopped caring.",
    color: "#5A7A4A",
    ecologyTier: "fragile",
    dominantRoles: ["producer", "vermin", "scavenger"],
  },
  ash_forest: {
    id: "ash_forest",
    name: "Ash Forest",
    shortName: "ASH",
    description: "Charred groves of glassed timber where blackened sap still flows. The canopy is dead. The undergrowth is fierce.",
    color: "#5A4A3A",
    ecologyTier: "stable",
    dominantRoles: ["producer", "herbivore", "predator"],
  },
  glass_desert: {
    id: "glass_desert",
    name: "Glass Desert",
    shortName: "GLASS",
    description: "Plains fused into black glass by old fires. Almost nothing grows. What lives here has learned to drink moisture from stone.",
    color: "#7A6A4A",
    ecologyTier: "barren",
    dominantRoles: ["vermin", "scavenger"],
  },
  irradiated_jungle: {
    id: "irradiated_jungle",
    name: "Irradiated Jungle",
    shortName: "GLOWFOREST",
    description: "Riots of mutant growth around old fission spills. Everything is bigger, hungrier, and luminous in the dark.",
    color: "#6A8A4A",
    ecologyTier: "thriving",
    dominantRoles: ["producer", "predator", "megafauna"],
  },
  fungal_caves: {
    id: "fungal_caves",
    name: "Fungal Caves",
    shortName: "FUNGAL",
    description: "Sunken complexes overrun by spore mats and stalked horrors. The air burns the lungs and the walls breathe.",
    color: "#4A3A6A",
    ecologyTier: "fragile",
    dominantRoles: ["producer", "vermin", "predator"],
  },
  dead_sea_coast: {
    id: "dead_sea_coast",
    name: "Dead Sea Coast",
    shortName: "COAST",
    description: "Salt flats and oil-slick tide pools along the shattered coastline. Wading birds and bottom-feeders endure where nothing else will.",
    color: "#4A6A7A",
    ecologyTier: "fragile",
    dominantRoles: ["scavenger", "producer", "predator"],
  },
  ruined_park: {
    id: "ruined_park",
    name: "Ruined Parklands",
    shortName: "PARK",
    description: "Pre-collapse green spaces that survived the war. Stunted trees, careful birds, the occasional verified deer. The closest thing to a garden you have left.",
    color: "#5A8A5A",
    ecologyTier: "thriving",
    dominantRoles: ["producer", "herbivore", "scavenger"],
  },
};

export const ALL_BIOMES: Biome[] = Object.keys(BIOMES) as Biome[];

export const ECOLOGY_TIER_BAND: Record<EcologyTier, [number, number]> = {
  barren: [0, 20],
  fragile: [20, 45],
  stable: [45, 70],
  thriving: [70, 100],
};

export function ecologyTierFor(score: number): EcologyTier {
  if (score < 20) return "barren";
  if (score < 45) return "fragile";
  if (score < 70) return "stable";
  return "thriving";
}

export const BASE_ECOLOGY_BY_CATEGORY: Record<string, number> = {
  admin: 25,
  commercial: 15,
  industrial: 8,
  energy: 18,
  water: 35,
  housing: 22,
  slums: 8,
  transport: 18,
  research: 35,
  medical: 30,
  security: 20,
  frontier: 40,
  unclaimed: 55,
  wasteland: 12,
};

export const ECOLOGY_DEFAULT = 25;

export function getBaseEcologyForCategory(category: string | undefined): number {
  if (!category) return ECOLOGY_DEFAULT;
  return BASE_ECOLOGY_BY_CATEGORY[category] ?? ECOLOGY_DEFAULT;
}

export function defaultBiomeForScavengeType(type: string): Biome {
  switch (type) {
    case "ruins": return "ruined_park";
    case "wasteland": return "glass_desert";
    case "underhive": return "fungal_caves";
    case "industrial": return "ash_forest";
    case "military": return "glass_desert";
    case "anomaly": return "irradiated_jungle";
    default: return "glass_desert";
  }
}

export function defaultBiomeForTerrain(terrain: string | undefined): Biome {
  switch (terrain) {
    // Marsh-like
    case "swamp":
    case "marsh":
    case "riverine":
    case "lakeside":
      return "toxic_marsh";
    // Burned forest / volcanic
    case "forest":
    case "ashland":
    case "volcanic":
      return "ash_forest";
    // Hardpan, desert, wasteland, exposed highlands
    case "desert":
    case "wasteland":
    case "elevated":
    case "mountain":
    case "canyon":
    case "mobile":
    case "orbital":
      return "glass_desert";
    // Mutant overgrowth zones
    case "jungle":
    case "rad_zone":
      return "irradiated_jungle";
    // Underground / cave systems
    case "subterranean":
    case "cave":
      return "fungal_caves";
    // Tidewater
    case "coastal":
    case "coast":
    case "shore":
    case "submerged":
    case "offshore":
      return "dead_sea_coast";
    // Surviving green / urban parkland
    case "urban":
    case "park":
    case "plains":
      return "ruined_park";
    default:
      return "glass_desert";
  }
}

export type PlotEcologyCategory =
  | "industrial_reclaim"
  | "hydroponic_sector"
  | "salvage_yard"
  | "reclaimed_residential"
  | "fortified_outpost"
  | "research_annex"
  | "energy_reclaim"
  | "water_reclaim";

export const BASE_ECOLOGY_BY_PLOT_CATEGORY: Record<PlotEcologyCategory, number> = {
  industrial_reclaim: 10,
  hydroponic_sector: 55,
  salvage_yard: 8,
  reclaimed_residential: 22,
  fortified_outpost: 18,
  research_annex: 30,
  energy_reclaim: 15,
  water_reclaim: 35,
};

export function getBaseEcologyForPlotCategory(category: string | undefined): number {
  if (!category) return ECOLOGY_DEFAULT;
  return BASE_ECOLOGY_BY_PLOT_CATEGORY[category as PlotEcologyCategory] ?? ECOLOGY_DEFAULT;
}

export const DISTRICT_CATEGORY_TO_BIOME: Record<string, Biome> = {
  admin: "ruined_park",
  commercial: "ruined_park",
  industrial: "ash_forest",
  energy: "ash_forest",
  water: "toxic_marsh",
  housing: "ruined_park",
  slums: "fungal_caves",
  transport: "glass_desert",
  research: "ruined_park",
  medical: "ruined_park",
  security: "glass_desert",
  frontier: "dead_sea_coast",
  unclaimed: "irradiated_jungle",
  wasteland: "glass_desert",
};

export function biomeForDistrictCategory(category: string | undefined): Biome {
  if (!category) return "ruined_park";
  return DISTRICT_CATEGORY_TO_BIOME[category] ?? "ruined_park";
}

export const ECOLOGY_TIER_BASELINE: Record<EcologyTier, number> = {
  barren: 10,
  fragile: 32,
  stable: 57,
  thriving: 80,
};

export function biomeBaselineEcology(biome: Biome): number {
  return ECOLOGY_TIER_BASELINE[BIOMES[biome].ecologyTier];
}

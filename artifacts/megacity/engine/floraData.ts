import type { Biome, SpeciesRole } from "@/engine/biomes";

export type FloraSpecies = {
  id: string;
  name: string;
  biome: Biome;
  role: Extract<SpeciesRole, "producer">;
  basePopulation: number;
  growthRate: number;
  harvestYield: number;
  description: string;
};

export const FLORA_SPECIES: FloraSpecies[] = [
  { id: "flora_rust_reed", name: "Rust Reed", biome: "toxic_marsh", role: "producer", basePopulation: 8000, growthRate: 0.04, harvestYield: 3, description: "Iron-tinted reeds that filter heavy metals from marsh water." },
  { id: "flora_bone_lily", name: "Bone Lily", biome: "toxic_marsh", role: "producer", basePopulation: 1200, growthRate: 0.02, harvestYield: 6, description: "Pale lilies whose roots draw calcium from drowned skeletons." },
  { id: "flora_ash_oak", name: "Ash Oak", biome: "ash_forest", role: "producer", basePopulation: 2400, growthRate: 0.01, harvestYield: 12, description: "Charred oaks that survive on cinders. Slow-growing but enduring." },
  { id: "flora_cinder_grass", name: "Cinder Grass", biome: "ash_forest", role: "producer", basePopulation: 12000, growthRate: 0.06, harvestYield: 2, description: "Fast-spreading scrub that recolonizes burned ground." },
  { id: "flora_obsidian_thistle", name: "Obsidian Thistle", biome: "glass_desert", role: "producer", basePopulation: 600, growthRate: 0.005, harvestYield: 4, description: "Glassy spikes the height of a child. The sap is faintly intoxicating." },
  { id: "flora_drift_lichen", name: "Drift Lichen", biome: "glass_desert", role: "producer", basePopulation: 4500, growthRate: 0.02, harvestYield: 1, description: "Rust-colored lichen scraped from black-glass plains. Edible if you boil it twice." },
  { id: "flora_glow_fern", name: "Glow Fern", biome: "irradiated_jungle", role: "producer", basePopulation: 3500, growthRate: 0.05, harvestYield: 5, description: "Luminous ferns that thrive on background radiation. Mildly hallucinogenic." },
  { id: "flora_split_palm", name: "Split Palm", biome: "irradiated_jungle", role: "producer", basePopulation: 900, growthRate: 0.03, harvestYield: 9, description: "Mutant palm with double trunks. The pith is dense and fibrous." },
  { id: "flora_giant_morel", name: "Giant Morel", biome: "fungal_caves", role: "producer", basePopulation: 1500, growthRate: 0.07, harvestYield: 7, description: "Mushrooms taller than a person. Edible, calorie-dense, and territorial." },
  { id: "flora_spore_mat", name: "Spore Mat", biome: "fungal_caves", role: "producer", basePopulation: 9000, growthRate: 0.10, harvestYield: 1, description: "Living carpet of orange spores. Touch with care." },
  { id: "flora_salt_kelp", name: "Salt Kelp", biome: "dead_sea_coast", role: "producer", basePopulation: 5000, growthRate: 0.04, harvestYield: 4, description: "Tough kelp from the dead tide. High in iodine, lower in everything else." },
  { id: "flora_brine_grass", name: "Brine Grass", biome: "dead_sea_coast", role: "producer", basePopulation: 2200, growthRate: 0.025, harvestYield: 3, description: "Coarse coastal grass. Cattle won't touch it. Goats will." },
  { id: "flora_old_oak", name: "Old Oak", biome: "ruined_park", role: "producer", basePopulation: 800, growthRate: 0.008, harvestYield: 18, description: "Pre-war hardwoods that somehow survived the fires. Sacred in some traditions." },
  { id: "flora_iron_clover", name: "Iron Clover", biome: "ruined_park", role: "producer", basePopulation: 6500, growthRate: 0.06, harvestYield: 2, description: "Hardy ground cover that re-knit itself across the parklands." },
];

export function getFloraByBiome(biome: Biome): FloraSpecies[] {
  return FLORA_SPECIES.filter(f => f.biome === biome);
}

export function getFloraById(id: string): FloraSpecies | undefined {
  return FLORA_SPECIES.find(f => f.id === id);
}

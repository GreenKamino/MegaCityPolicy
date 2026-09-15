import type { Biome, SpeciesRole } from "@/engine/biomes";

export type FaunaRole = Exclude<SpeciesRole, "producer">;

export type FaunaSpecies = {
  id: string;
  name: string;
  biome: Biome;
  role: FaunaRole;
  basePopulation: number;
  growthRate: number;
  harvestYield: number;
  scavWeight: number;
  description: string;
};

export const FAUNA_SPECIES: FaunaSpecies[] = [
  { id: "fauna_marsh_rat", name: "Marsh Rat", biome: "toxic_marsh", role: "vermin", basePopulation: 6000, growthRate: 0.12, harvestYield: 1, scavWeight: 4, description: "Bloated rodents the size of a small dog. Filthy. Numerous." },
  { id: "fauna_acid_eel", name: "Acid Eel", biome: "toxic_marsh", role: "predator", basePopulation: 800, growthRate: 0.04, harvestYield: 3, scavWeight: 2, description: "Eels that secrete a corrosive mucus. Patient ambushers." },
  { id: "fauna_swamp_strider", name: "Swamp Strider", biome: "toxic_marsh", role: "herbivore", basePopulation: 1500, growthRate: 0.05, harvestYield: 4, scavWeight: 2, description: "Long-legged grazer that walks across reed mats without sinking." },
  { id: "fauna_ashen_deer", name: "Ashen Deer", biome: "ash_forest", role: "herbivore", basePopulation: 1200, growthRate: 0.04, harvestYield: 8, scavWeight: 3, description: "Grey-coated deer with blackened antlers. Wary, but a real meal." },
  { id: "fauna_cinder_wolf", name: "Cinder Wolf", biome: "ash_forest", role: "predator", basePopulation: 350, growthRate: 0.03, harvestYield: 5, scavWeight: 2, description: "Pack hunters whose pelts smell permanently of smoke." },
  { id: "fauna_carrion_crow", name: "Carrion Crow", biome: "ash_forest", role: "scavenger", basePopulation: 4500, growthRate: 0.08, harvestYield: 1, scavWeight: 4, description: "Black crows that follow expeditions from the air." },
  { id: "fauna_dust_lizard", name: "Dust Lizard", biome: "glass_desert", role: "herbivore", basePopulation: 2200, growthRate: 0.05, harvestYield: 2, scavWeight: 3, description: "Skittering reptiles that drink dew from glass." },
  { id: "fauna_glass_scorpion", name: "Glass Scorpion", biome: "glass_desert", role: "predator", basePopulation: 900, growthRate: 0.03, harvestYield: 2, scavWeight: 3, description: "Translucent scorpion the length of a forearm. The venom is paralytic." },
  { id: "fauna_sand_jackal", name: "Sand Jackal", biome: "glass_desert", role: "scavenger", basePopulation: 1100, growthRate: 0.04, harvestYield: 3, scavWeight: 3, description: "Pack scavengers that strip carcasses overnight." },
  { id: "fauna_glow_boar", name: "Glow Boar", biome: "irradiated_jungle", role: "megafauna", basePopulation: 280, growthRate: 0.02, harvestYield: 24, scavWeight: 2, description: "Tusked boar the size of a vehicle. Faintly luminescent. Very angry." },
  { id: "fauna_split_jaw", name: "Split Jaw", biome: "irradiated_jungle", role: "predator", basePopulation: 150, growthRate: 0.02, harvestYield: 9, scavWeight: 1, description: "Apex predator with a hinged double mandible. Hunts at twilight." },
  { id: "fauna_glow_moth", name: "Glow Moth", biome: "irradiated_jungle", role: "vermin", basePopulation: 8500, growthRate: 0.15, harvestYield: 1, scavWeight: 5, description: "Fist-sized moths that swarm any heat source." },
  { id: "fauna_cave_mantis", name: "Cave Mantis", biome: "fungal_caves", role: "predator", basePopulation: 220, growthRate: 0.02, harvestYield: 4, scavWeight: 2, description: "Pale mantis the size of a mid-sized dog. Hunts by vibration." },
  { id: "fauna_spore_grub", name: "Spore Grub", biome: "fungal_caves", role: "vermin", basePopulation: 7200, growthRate: 0.14, harvestYield: 1, scavWeight: 5, description: "Slow grubs that strip fungal mats clean overnight." },
  { id: "fauna_blind_salamander", name: "Blind Salamander", biome: "fungal_caves", role: "scavenger", basePopulation: 1800, growthRate: 0.05, harvestYield: 2, scavWeight: 3, description: "Eyeless amphibian that maps caves by scent. Edible. Apparently." },
  { id: "fauna_rust_gull", name: "Rust Gull", biome: "dead_sea_coast", role: "scavenger", basePopulation: 5500, growthRate: 0.09, harvestYield: 1, scavWeight: 4, description: "Salt-rusted seabirds that pick apart anything left on the shore." },
  { id: "fauna_oil_crab", name: "Oil Crab", biome: "dead_sea_coast", role: "scavenger", basePopulation: 3200, growthRate: 0.07, harvestYield: 2, scavWeight: 4, description: "Black-shelled crabs that thrive in slick tide pools." },
  { id: "fauna_brine_seal", name: "Brine Seal", biome: "dead_sea_coast", role: "predator", basePopulation: 400, growthRate: 0.03, harvestYield: 12, scavWeight: 2, description: "Heavy-bodied seal hunters. The fat renders to clean heating oil." },
  { id: "fauna_park_doe", name: "Parkland Doe", biome: "ruined_park", role: "herbivore", basePopulation: 950, growthRate: 0.05, harvestYield: 7, scavWeight: 3, description: "Verified deer. Three confirmed populations. Heavily protected." },
  { id: "fauna_feral_dog", name: "Feral Dog", biome: "ruined_park", role: "predator", basePopulation: 1400, growthRate: 0.06, harvestYield: 3, scavWeight: 3, description: "Pack-living descendants of pre-war pets. Smarter than expected." },
  { id: "fauna_park_rabbit", name: "Parkland Rabbit", biome: "ruined_park", role: "herbivore", basePopulation: 4800, growthRate: 0.11, harvestYield: 2, scavWeight: 4, description: "Common, fast-breeding, faintly reassuring." },
];

export function getFaunaByBiome(biome: Biome): FaunaSpecies[] {
  return FAUNA_SPECIES.filter(f => f.biome === biome);
}

export function getFaunaById(id: string): FaunaSpecies | undefined {
  return FAUNA_SPECIES.find(f => f.id === id);
}

export function getFaunaByBiomeAndRole(biome: Biome, role: FaunaRole): FaunaSpecies[] {
  return FAUNA_SPECIES.filter(f => f.biome === biome && f.role === role);
}

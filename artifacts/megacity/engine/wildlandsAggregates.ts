import type { BiomeEcology, GameState } from "@/engine/types";
import type { Biome } from "@/engine/biomes";
import { BIOMES, biomeForDistrictCategory, biomeBaselineEcology } from "@/engine/biomes";
import { getDistrictCategory } from "@/engine/districts";
import { FLORA_SPECIES } from "@/engine/floraData";
import { FAUNA_SPECIES } from "@/engine/faunaData";

export type Trend = "up" | "flat" | "down";

export type WildlandsFeedItem = {
  id: string;
  kind: "threat" | "opportunity" | "info";
  text: string;
};

export type RoleTrend = "up" | "flat" | "down";

export type BiomeAggregate = {
  biome: Biome;
  name: string;
  shortName: string;
  description: string;
  color: string;
  districtCount: number;
  ecologyAvg: number;
  baseline: number;
  trend: Trend;
  delta: number;
  dominantSpeciesName: string;
  dominantSpeciesRole: string;
  totalFlora: number;
  totalFauna: number;
  populations: {
    flora: number;
    herbivore: number;
    predator: number;
    vermin: number;
    megafauna: number;
    scavenger: number;
  };
  populationTrends: {
    flora: RoleTrend;
    herbivore: RoleTrend;
    predator: RoleTrend;
    vermin: RoleTrend;
    megafauna: RoleTrend;
    scavenger: RoleTrend;
  };
  vaccinated: boolean;
  fenced: boolean;
  megafaunaActive: boolean;
  feed: WildlandsFeedItem[];
  weakestDistrictName?: string;
  weakestDistrictEcology?: number;
};

function pickDominantSpecies(biome: Biome, ecologyAvg: number, districtCount: number) {
  const flora = FLORA_SPECIES.filter((s) => s.biome === biome);
  const fauna = FAUNA_SPECIES.filter((s) => s.biome === biome);
  const all: { name: string; role: string; pop: number }[] = [];
  for (const f of flora) all.push({ name: f.name, role: f.role, pop: estimateSpeciesPop(f.basePopulation, ecologyAvg, districtCount) });
  for (const f of fauna) all.push({ name: f.name, role: f.role, pop: estimateSpeciesPop(f.basePopulation, ecologyAvg, districtCount) });
  if (all.length === 0) return { name: "—", role: "—" };
  all.sort((a, b) => b.pop - a.pop);
  return { name: all[0].name, role: all[0].role };
}

function estimateSpeciesPop(basePopulation: number, ecologyAvg: number, districtCount: number): number {
  // Scale species presence by biome health and territory footprint
  const ecologyFactor = Math.max(0.05, ecologyAvg / 60);
  const footprint = Math.max(1, districtCount);
  return Math.round(basePopulation * ecologyFactor * footprint);
}

function biomeTotals(biome: Biome, ecologyAvg: number, districtCount: number) {
  const flora = FLORA_SPECIES.filter((s) => s.biome === biome);
  const fauna = FAUNA_SPECIES.filter((s) => s.biome === biome);
  const totalFlora = flora.reduce((s, f) => s + estimateSpeciesPop(f.basePopulation, ecologyAvg, districtCount), 0);
  const totalFauna = fauna.reduce((s, f) => s + estimateSpeciesPop(f.basePopulation, ecologyAvg, districtCount), 0);
  return { totalFlora, totalFauna };
}

function buildFeed(biome: Biome, ecologyAvg: number, weakest: { name: string; ecology: number } | null, activeProjectCount: number): WildlandsFeedItem[] {
  const feed: WildlandsFeedItem[] = [];
  const def = BIOMES[biome];

  if (weakest && weakest.ecology < 18) {
    feed.push({
      id: `${biome}-collapse`,
      kind: "threat",
      text: `Ecology collapse risk in ${weakest.name} — ${Math.round(weakest.ecology)}%.`,
    });
  }

  if (ecologyAvg < 25) {
    const vermin = FAUNA_SPECIES.find((s) => s.biome === biome && s.role === "vermin");
    if (vermin) {
      feed.push({
        id: `${biome}-vermin`,
        kind: "threat",
        text: `${vermin.name} swarms reported across ${def.shortName} sectors.`,
      });
    } else {
      feed.push({
        id: `${biome}-degradation`,
        kind: "threat",
        text: `Soil degradation accelerating in ${def.shortName} zones.`,
      });
    }
  }

  if (ecologyAvg >= 55) {
    const producer = FLORA_SPECIES.find((s) => s.biome === biome);
    if (producer) {
      feed.push({
        id: `${biome}-bloom`,
        kind: "opportunity",
        text: `Bloom window open: ${producer.name} ready for harvest in ${def.shortName}.`,
      });
    }
  }

  if (ecologyAvg >= 40 && ecologyAvg < 55) {
    feed.push({
      id: `${biome}-stabilizing`,
      kind: "info",
      text: `${def.shortName} biome holding steady. Ranger sweeps recommended.`,
    });
  }

  const predator = FAUNA_SPECIES.find((s) => s.biome === biome && (s.role === "predator" || s.role === "megafauna"));
  if (predator && ecologyAvg >= 35 && feed.length < 3) {
    feed.push({
      id: `${biome}-predator`,
      kind: "threat",
      text: `${predator.name} sightings logged near outer perimeter.`,
    });
  }

  if (activeProjectCount > 0 && feed.length < 3) {
    feed.push({
      id: `${biome}-active`,
      kind: "info",
      text: `${activeProjectCount} active wildlands operation${activeProjectCount > 1 ? "s" : ""} underway.`,
    });
  }

  return feed.slice(0, 3);
}

export function getBiomeAggregates(state: GameState): BiomeAggregate[] {
  const buckets = new Map<Biome, { ecologySum: number; count: number; weakest: { name: string; ecology: number } | null }>();

  for (const d of state.districts ?? []) {
    const cat = getDistrictCategory(d.id);
    const biome = biomeForDistrictCategory(cat);
    const ecology = d.ecology ?? 25;
    const slot = buckets.get(biome) ?? { ecologySum: 0, count: 0, weakest: null };
    slot.ecologySum += ecology;
    slot.count++;
    if (!slot.weakest || ecology < slot.weakest.ecology) {
      slot.weakest = { name: d.name, ecology };
    }
    buckets.set(biome, slot);
  }

  const projects = state.wildlandsProjects ?? [];
  const projectsPerBiome = new Map<string, number>();
  for (const p of projects) {
    if (p.status !== "active") continue;
    projectsPerBiome.set(p.biome, (projectsPerBiome.get(p.biome) ?? 0) + 1);
  }

  const ecologyByBiome: Record<string, BiomeEcology> = state.wildlandsEcology ?? {};

  const results: BiomeAggregate[] = [];
  for (const [biome, data] of buckets.entries()) {
    const def = BIOMES[biome];
    const ecologyAvg = data.count > 0 ? data.ecologySum / data.count : 0;
    const baseline = biomeBaselineEcology(biome);
    const delta = ecologyAvg - baseline;
    const trend: Trend = delta > 5 ? "up" : delta < -5 ? "down" : "flat";
    const dominant = pickDominantSpecies(biome, ecologyAvg, data.count);
    const fallbackTotals = biomeTotals(biome, ecologyAvg, data.count);
    const activeProjects = projectsPerBiome.get(biome) ?? 0;
    const feed = buildFeed(biome, ecologyAvg, data.weakest, activeProjects);
    const eco = ecologyByBiome[biome];
    const populations = eco
      ? {
          flora: Math.round(eco.flora),
          herbivore: Math.round(eco.herbivore),
          predator: Math.round(eco.predator),
          vermin: Math.round(eco.vermin),
          megafauna: Math.round(eco.megafauna),
          scavenger: Math.round(eco.scavenger),
        }
      : {
          flora: Math.round(fallbackTotals.totalFlora),
          herbivore: Math.round(fallbackTotals.totalFauna * 0.55),
          predator: Math.round(fallbackTotals.totalFauna * 0.2),
          vermin: Math.round(fallbackTotals.totalFauna * 0.15),
          megafauna: 0,
          scavenger: Math.round(fallbackTotals.totalFauna * 0.1),
        };
    const trendFor = (val: number): RoleTrend =>
      val > 0.5 ? "up" : val < -0.5 ? "down" : "flat";
    const populationTrends = eco
      ? {
          flora: trendFor(eco.lastDelta.flora),
          herbivore: trendFor(eco.lastDelta.herbivore),
          predator: trendFor(eco.lastDelta.predator),
          vermin: trendFor(eco.lastDelta.vermin),
          megafauna: trendFor(eco.lastDelta.megafauna),
          scavenger: trendFor(eco.lastDelta.scavenger),
        }
      : {
          flora: "flat" as RoleTrend,
          herbivore: "flat" as RoleTrend,
          predator: "flat" as RoleTrend,
          vermin: "flat" as RoleTrend,
          megafauna: "flat" as RoleTrend,
          scavenger: "flat" as RoleTrend,
        };
    const totalFlora = populations.flora;
    const totalFauna =
      populations.herbivore +
      populations.predator +
      populations.vermin +
      populations.megafauna +
      populations.scavenger;
    results.push({
      biome,
      name: def.name,
      shortName: def.shortName,
      description: def.description,
      color: def.color,
      districtCount: data.count,
      ecologyAvg,
      baseline,
      trend,
      delta,
      dominantSpeciesName: dominant.name,
      dominantSpeciesRole: dominant.role,
      totalFlora,
      totalFauna,
      populations,
      populationTrends,
      vaccinated: (eco?.vaccinationTicks ?? 0) > 0,
      fenced: (eco?.fencingTicks ?? 0) > 0,
      megafaunaActive: (eco?.megafauna ?? 0) > 0,
      feed,
      weakestDistrictName: data.weakest?.name,
      weakestDistrictEcology: data.weakest?.ecology,
    });
  }

  // Sort by ecology score descending — healthiest first
  results.sort((a, b) => b.ecologyAvg - a.ecologyAvg);
  return results;
}

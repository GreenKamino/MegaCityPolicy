import { TECH_MAP } from "@/engine/technologies";
import { GANGS } from "@/engine/gangs";
import type { GameState } from "@/engine/types";

// ─── Module-level cache convention ───────────────────────────────────
//
// Singleton caches in this file (and the wider engine/ tree) must follow
// one of these two rules so they cannot return stale results:
//
//   1) Key on a CONTENT HASH of every input that affects the output.
//      Weak fingerprints — array length, first/last id, "did anything
//      change" booleans — collide silently. The original tech-effects
//      cache keyed on (count, first, last) and returned stale bonuses
//      forever after any same-length swap that preserved the endpoints
//      (prestige rerolls, cheat-driven tech edits, content swaps). It
//      now uses an order-independent djb2 hash over the sorted ids; see
//      `hashTechIds` below for the pattern to copy when adding a new
//      cache that depends on a variable-length collection.
//
//   2) Key on a MODULE CONSTANT that is never mutated at runtime, in
//      which case no rekeying is needed — the cache is effectively a
//      lazy memoization of immutable data. `_gangSpecCache` qualifies
//      (depends only on the exported `GANGS` array), as do the
//      module-init Maps `CHAIN_BY_ID` and `ARCHETYPE_BY_ID`. If the
//      backing data ever becomes mutable, the cache must be promoted
//      to rule 1 or get explicit invalidation calls at every mutation
//      site.
//
// Audit (2026-05): the caches reviewed in `engine/` are
//   - `_cachedTechEffects` here (rule 1, content hash)
//   - `_gangSpecCache` here (rule 2, GANGS is `export const`, never
//      mutated anywhere in the codebase)
//   - `cachedAverage` in tickPerf.ts (recomputed on every sample, no
//      key to go stale)
//   - `VISUAL_CACHE` in traitIcons.ts (rule 2, keyed on the full
//      normalized trait string against the const TRAIT_RULES table)
//   - `CHAIN_BY_ID` / `ARCHETYPE_BY_ID` (rule 2)
// No other module-level memoizations in `engine/` keyed on a fingerprint
// weaker than full content; if you add one, document which rule it
// satisfies right next to the cache declaration.

export type TechEffectsCache = Record<string, number> & {
  _techSet: Set<string>;
  _hasCyber: boolean;
  _hasGenetics: boolean;
  _hasMutant: boolean;
};

const CYBER_TECH_IDS = new Set([
  "basic_cybernetics", "prosthetic_engineering", "neural_interface_basics",
  "synthetic_muscle_tech", "optical_augmentation",
]);
const GENETICS_TECH_IDS = new Set([
  "genetic_disease_screening", "genetic_conservation_protocols",
  "sd_crispr_fundamentals", "sd_human_cloning_research",
  "sd_animal_cloning", "mil_clone_army_program",
]);
const MUTANT_TECH_IDS = new Set([
  "uplift_neural_interfaces", "uplift_cognitive_enhancement",
  "xenofauna_domestication", "xeno_flora_survey", "bio_monitoring_implants",
]);

let _cachedTechEffects: TechEffectsCache | null = null;
let _cachedTechHash = "";
let _cachedBuildingsHash = "";
// Task #188: identity fast-path. The tick code passes the same
// `state.unlockedTechnologies` reference (plus a `state.buildings`
// reference that's reseated only when buildings change) for many ticks
// in a row. If both references match the last call, skip even the
// O(n log n) sort + djb2 hash and return the cached value directly.
let _lastUnlockedRef: string[] | null = null;
let _lastBuildingsRef: Record<string, number> | null = null;

// Order-independent content hash. Earlier we keyed only on (length, first id,
// last id) which collided on any same-length swap that preserved the
// endpoints — prestige rerolls, cheat-driven tech edits, future content swaps
// would all return stale bonuses indefinitely. djb2-style hash over the
// sorted ids gives a cheap O(n) fingerprint that actually differs when the
// set differs.
function hashTechIds(unlocked: string[]): string {
  if (unlocked.length === 0) return "0:";
  const sorted = [...unlocked].sort();
  let hash = 5381;
  for (const id of sorted) {
    for (let i = 0; i < id.length; i++) {
      hash = (((hash << 5) + hash) + id.charCodeAt(i)) | 0;
    }
    hash = (((hash << 5) + hash) + 0x7c) | 0; // separator
  }
  return `${unlocked.length}:${(hash >>> 0).toString(36)}`;
}

// Building gates only depend on a fixed handful of keys, but their counts
// change independently of techs. Hash just those so building-driven gate
// flips also bust the cache.
const GATE_BUILDING_KEYS = [
  "cyberneticsDevelopmentFacilities",
  "geneSplicingLabs",
  "cloningFacilities",
  "upliftTrainingAcademies",
  "biotechFarms",
] as const;

function hashGateBuildings(buildings: Record<string, number>): string {
  let out = "";
  for (const k of GATE_BUILDING_KEYS) {
    out += `${(buildings[k] ?? 0) > 0 ? 1 : 0}`;
  }
  return out;
}

export function buildTechEffectsCache(unlocked: string[], buildings: Record<string, number>): TechEffectsCache {
  // Identity fast-path: if both refs match, the cached result is valid
  // and we can skip hashing entirely. Mutations to the unlocked array
  // happen via wholesale replacement (`s.unlockedTechnologies = [...]`)
  // in formulas.ts and via push() in tech research code. The hash path
  // below remains as a safety net for the push() case where the ref
  // stays the same but the contents grew.
  if (
    _cachedTechEffects &&
    _lastUnlockedRef === unlocked &&
    _lastBuildingsRef === buildings &&
    _lastUnlockedRef !== null
  ) {
    return _cachedTechEffects;
  }
  const techHash = hashTechIds(unlocked);
  const bldgHash = hashGateBuildings(buildings);
  if (_cachedTechEffects && techHash === _cachedTechHash && bldgHash === _cachedBuildingsHash) {
    _lastUnlockedRef = unlocked;
    _lastBuildingsRef = buildings;
    return _cachedTechEffects;
  }

  const totals: Record<string, number> = {};
  const techSet = new Set<string>();

  for (const id of unlocked) {
    techSet.add(id);
    const tech = TECH_MAP[id];
    if (!tech) continue;
    for (const [key, val] of Object.entries(tech.effects)) {
      totals[key] = (totals[key] ?? 0) + (val as number);
    }
  }

  let hasCyber = (buildings.cyberneticsDevelopmentFacilities ?? 0) > 0;
  let hasGenetics = (buildings.geneSplicingLabs ?? 0) > 0 || (buildings.cloningFacilities ?? 0) > 0;
  let hasMutant = (buildings.upliftTrainingAcademies ?? 0) > 0 || (buildings.biotechFarms ?? 0) > 0;

  if (!hasCyber) {
    for (const id of CYBER_TECH_IDS) {
      if (techSet.has(id)) { hasCyber = true; break; }
    }
  }
  if (!hasGenetics) {
    for (const id of GENETICS_TECH_IDS) {
      if (techSet.has(id)) { hasGenetics = true; break; }
    }
  }
  if (!hasMutant) {
    for (const id of MUTANT_TECH_IDS) {
      if (techSet.has(id)) { hasMutant = true; break; }
    }
  }

  const cache = totals as TechEffectsCache;
  cache._techSet = techSet;
  cache._hasCyber = hasCyber;
  cache._hasGenetics = hasGenetics;
  cache._hasMutant = hasMutant;

  _cachedTechEffects = cache;
  _cachedTechHash = techHash;
  _cachedBuildingsHash = bldgHash;
  _lastUnlockedRef = unlocked;
  _lastBuildingsRef = buildings;
  return cache;
}

export function invalidateTechCache(): void {
  _cachedTechEffects = null;
  _cachedTechHash = "";
  _cachedBuildingsHash = "";
  _lastUnlockedRef = null;
  _lastBuildingsRef = null;
}

let _gangSpecCache: Record<string, number> | null = null;

export function getGangSpecialtyCounts(): Record<string, number> {
  if (_gangSpecCache) return _gangSpecCache;
  const gangTypeMultipliers: Record<string, number> = {
    street: 1.0, cyberCult: 0.8, mercenary: 1.5, organizedCrime: 1.3, specialistCrew: 1.1,
  };
  const counts: Record<string, number> = {};
  for (const gang of GANGS) {
    const typeMult = gangTypeMultipliers[gang.type] ?? 1;
    for (const spec of gang.crimeSpecialties) {
      counts[spec] = (counts[spec] ?? 0) + gang.threatLevel * typeMult;
    }
  }
  _gangSpecCache = counts;
  return counts;
}

export type CrimeParams = {
  crimeLevel: number;
  lawLevel: number;
  unrestLevel: number;
  popFactor: number;
  corruptionLevel: number;
  avgGangInfluence: number;
  totalTicks: number;
};

function jitter(seed: number, totalTicks: number): number {
  return 0.9 + ((seed * 7919 + totalTicks * 31) % 100) / 500;
}

function crimeCalc(base: number, scaling: number, factor: number, seed: number, totalTicks: number, gangMod: number, lawReduction: number, lawLevel: number): number {
  return Math.max(0, Math.round((base + scaling * factor) * jitter(seed, totalTicks) * gangMod * (1 - lawLevel * lawReduction)));
}

type CrimeSpec = {
  key: string;
  base: number;
  scaling: number;
  factor: "crime" | "unrest" | "corruption" | "crimePop" | "unrestPop" | "corruptionPop";
  seed: number;
  gangSpec?: string;
  lawReduction: number;
  gated?: "cyber" | "genetics" | "mutant";
};

const FACTOR_MAP = {
  crime: (p: CrimeParams) => p.crimeLevel,
  unrest: (p: CrimeParams) => p.unrestLevel,
  corruption: (p: CrimeParams) => p.corruptionLevel,
  crimePop: (p: CrimeParams) => p.crimeLevel * p.popFactor,
  unrestPop: (p: CrimeParams) => p.unrestLevel * p.popFactor,
  corruptionPop: (p: CrimeParams) => p.corruptionLevel * p.popFactor,
};

const CRIME_SPECS: CrimeSpec[] = [
  { key: "murder", base: 8, scaling: 25, factor: "crimePop", seed: 1, lawReduction: 0.5 },
  { key: "manslaughter", base: 5, scaling: 12, factor: "crimePop", seed: 2, lawReduction: 0 },
  { key: "assault", base: 200, scaling: 400, factor: "crimePop", seed: 3, lawReduction: 0.3 },
  { key: "aggravatedAssault", base: 50, scaling: 120, factor: "crimePop", seed: 4, lawReduction: 0 },
  { key: "robbery", base: 100, scaling: 300, factor: "crimePop", seed: 5, lawReduction: 0.4 },
  { key: "armedRobbery", base: 20, scaling: 80, factor: "crimePop", seed: 6, gangSpec: "armedRobbery", lawReduction: 0 },
  { key: "theft", base: 800, scaling: 2500, factor: "crimePop", seed: 7, lawReduction: 0.3 },
  { key: "grandTheft", base: 50, scaling: 200, factor: "crimePop", seed: 8, lawReduction: 0 },
  { key: "burglary", base: 200, scaling: 600, factor: "crimePop", seed: 9, lawReduction: 0.35 },
  { key: "vehicleTheft", base: 120, scaling: 400, factor: "crimePop", seed: 10, lawReduction: 0 },
  { key: "extortion", base: 30, scaling: 80, factor: "crimePop", seed: 13, gangSpec: "extortion", lawReduction: 0 },
  { key: "arson", base: 10, scaling: 40, factor: "unrestPop", seed: 15, lawReduction: 0 },
  { key: "vandalism", base: 400, scaling: 800, factor: "unrestPop", seed: 16, lawReduction: 0.2 },
  { key: "drugPossession", base: 300, scaling: 900, factor: "crimePop", seed: 17, lawReduction: 0 },
  { key: "drugTrafficking", base: 40, scaling: 120, factor: "crimePop", seed: 18, gangSpec: "drugTrafficking", lawReduction: 0.5 },
  { key: "weaponsViolation", base: 100, scaling: 250, factor: "crimePop", seed: 19, lawReduction: 0 },
  { key: "cyberCrime", base: 200, scaling: 500, factor: "crimePop", seed: 20, lawReduction: 0 },
  { key: "smuggling", base: 50, scaling: 150, factor: "crimePop", seed: 21, lawReduction: 0.4 },
  { key: "humanTrafficking", base: 5, scaling: 25, factor: "crimePop", seed: 22, lawReduction: 0.6 },
  { key: "kidnapping", base: 8, scaling: 30, factor: "crimePop", seed: 23, lawReduction: 0 },
  { key: "organizedCrime", base: 20, scaling: 80, factor: "crimePop", seed: 24, gangSpec: "organizedCrime", lawReduction: 0 },
  { key: "publicDisorder", base: 300, scaling: 700, factor: "unrestPop", seed: 25, lawReduction: 0 },
  { key: "corruption", base: 60, scaling: 3, factor: "corruptionPop", seed: 26, lawReduction: 0 },

  { key: "illegalAugmentation", base: 40, scaling: 100, factor: "crimePop", seed: 30, gangSpec: "illegalAugmentation", gated: "cyber", lawReduction: 0 },
  { key: "implantTheft", base: 20, scaling: 60, factor: "crimePop", seed: 31, gated: "cyber", lawReduction: 0 },
  { key: "forcedCyberization", base: 3, scaling: 12, factor: "crimePop", seed: 32, gangSpec: "forcedCyberization", gated: "cyber", lawReduction: 0.6 },
  { key: "neuralHijacking", base: 10, scaling: 35, factor: "crimePop", seed: 33, gated: "cyber", lawReduction: 0 },
  { key: "cyberpsychosis", base: 15, scaling: 50, factor: "crimePop", seed: 34, gated: "cyber", lawReduction: 0 },
  { key: "augmentSabotage", base: 8, scaling: 25, factor: "crimePop", seed: 35, gated: "cyber", lawReduction: 0 },
  { key: "blackClinicOperations", base: 20, scaling: 60, factor: "crimePop", seed: 36, gangSpec: "blackClinicOperations", gated: "cyber", lawReduction: 0 },
  { key: "implantCounterfeiting", base: 25, scaling: 70, factor: "crimePop", seed: 37, gated: "cyber", lawReduction: 0 },
  { key: "cyberwareSmugging", base: 15, scaling: 40, factor: "crimePop", seed: 38, gated: "cyber", lawReduction: 0.4 },
  { key: "neuralIdentitySpoofing", base: 12, scaling: 40, factor: "crimePop", seed: 39, gated: "cyber", lawReduction: 0 },
  { key: "prostheticWeaponization", base: 6, scaling: 20, factor: "crimePop", seed: 40, gated: "cyber", lawReduction: 0 },

  { key: "dataBreaches", base: 60, scaling: 150, factor: "crimePop", seed: 41, lawReduction: 0 },
  { key: "networkIntrusion", base: 45, scaling: 120, factor: "crimePop", seed: 42, lawReduction: 0 },
  { key: "aiManipulation", base: 18, scaling: 55, factor: "crimePop", seed: 43, lawReduction: 0 },
  { key: "deepfakeFraud", base: 30, scaling: 80, factor: "corruptionPop", seed: 44, lawReduction: 0 },
  { key: "cryptoTheft", base: 40, scaling: 110, factor: "crimePop", seed: 45, lawReduction: 0 },
  { key: "digitalRansomware", base: 25, scaling: 70, factor: "crimePop", seed: 46, gangSpec: "digitalRansomware", lawReduction: 0 },
  { key: "surveillanceHacking", base: 15, scaling: 45, factor: "crimePop", seed: 47, lawReduction: 0.5 },
  { key: "informationBrokering", base: 35, scaling: 90, factor: "crimePop", seed: 48, lawReduction: 0 },
  { key: "neuralNetTrespass", base: 10, scaling: 35, factor: "crimePop", seed: 49, lawReduction: 0 },
  { key: "virtualIdentityTheft", base: 22, scaling: 60, factor: "crimePop", seed: 50, lawReduction: 0 },
  { key: "dataMining", base: 28, scaling: 75, factor: "crimePop", seed: 51, lawReduction: 0 },
  { key: "gridTampering", base: 8, scaling: 30, factor: "crimePop", seed: 52, lawReduction: 0 },

  { key: "streetRacing", base: 70, scaling: 200, factor: "crimePop", seed: 53, lawReduction: 0 },
  { key: "gangWarfare", base: 20, scaling: 60, factor: "crimePop", seed: 54, gangSpec: "gangWarfare", lawReduction: 0 },
  { key: "protectionRacketeering", base: 35, scaling: 100, factor: "crimePop", seed: 55, gangSpec: "protectionRacketeering", lawReduction: 0 },
  { key: "stimDealering", base: 90, scaling: 250, factor: "crimePop", seed: 56, gangSpec: "stimDealering", lawReduction: 0 },
  { key: "illegalGambling", base: 100, scaling: 280, factor: "crimePop", seed: 57, lawReduction: 0 },
  { key: "streetVendorExtortion", base: 45, scaling: 120, factor: "crimePop", seed: 58, gangSpec: "streetVendorExtortion", lawReduction: 0 },
  { key: "graffitiBombing", base: 150, scaling: 400, factor: "unrestPop", seed: 59, lawReduction: 0 },
  { key: "squatting", base: 80, scaling: 220, factor: "crimePop", seed: 60, lawReduction: 0 },
  { key: "droneFighting", base: 30, scaling: 80, factor: "crimePop", seed: 61, lawReduction: 0 },
  { key: "pedestrianAssault", base: 65, scaling: 180, factor: "crimePop", seed: 62, lawReduction: 0 },
  { key: "transitVandalism", base: 50, scaling: 130, factor: "unrestPop", seed: 63, lawReduction: 0 },

  { key: "industrialEspionage", base: 10, scaling: 40, factor: "corruptionPop", seed: 64, lawReduction: 0 },
  { key: "toxicDumping", base: 8, scaling: 25, factor: "crimePop", seed: 65, lawReduction: 0 },
  { key: "factorySabotage", base: 5, scaling: 18, factor: "crimePop", seed: 66, lawReduction: 0 },
  { key: "laborExploitation", base: 15, scaling: 50, factor: "corruptionPop", seed: 67, lawReduction: 0 },
  { key: "supplyChainTampering", base: 6, scaling: 20, factor: "crimePop", seed: 68, lawReduction: 0 },
  { key: "patentTheft", base: 9, scaling: 30, factor: "corruptionPop", seed: 69, lawReduction: 0 },
  { key: "regulatoryFraud", base: 12, scaling: 40, factor: "corruptionPop", seed: 70, lawReduction: 0 },
  { key: "energyTheft", base: 20, scaling: 55, factor: "crimePop", seed: 71, lawReduction: 0 },
  { key: "automationSabotage", base: 10, scaling: 30, factor: "crimePop", seed: 72, lawReduction: 0 },
  { key: "wasteTrafficking", base: 14, scaling: 40, factor: "crimePop", seed: 73, lawReduction: 0 },
  { key: "resourceHoarding", base: 18, scaling: 50, factor: "crimePop", seed: 74, lawReduction: 0 },

  { key: "organHarvesting", base: 2, scaling: 8, factor: "crimePop", seed: 75, gangSpec: "organHarvesting", lawReduction: 0.7 },
  { key: "illegalCloning", base: 1, scaling: 5, factor: "crimePop", seed: 76, gated: "genetics", lawReduction: 0 },
  { key: "bioweaponDevelopment", base: 1, scaling: 3, factor: "crimePop", seed: 77, lawReduction: 0.8 },
  { key: "unlicensedGeneMods", base: 8, scaling: 25, factor: "crimePop", seed: 78, gated: "genetics", lawReduction: 0 },
  { key: "pharmaceuticalCounterfeiting", base: 20, scaling: 55, factor: "crimePop", seed: 79, lawReduction: 0 },
  { key: "clinicalTrialFraud", base: 4, scaling: 12, factor: "corruptionPop", seed: 80, lawReduction: 0 },
  { key: "medicalDataTrafficking", base: 12, scaling: 35, factor: "crimePop", seed: 81, lawReduction: 0 },
  { key: "plagueHoarding", base: 2, scaling: 6, factor: "crimePop", seed: 82, lawReduction: 0 },
  { key: "syntheticBloodTrafficking", base: 5, scaling: 15, factor: "crimePop", seed: 83, lawReduction: 0 },
  { key: "neurotoxinDistribution", base: 3, scaling: 8, factor: "crimePop", seed: 84, lawReduction: 0.6 },
  { key: "illegalPsychSurgery", base: 4, scaling: 14, factor: "crimePop", seed: 85, lawReduction: 0 },

  { key: "corporateAssassination", base: 1, scaling: 5, factor: "crimePop", seed: 86, lawReduction: 0.7 },
  { key: "governmentInfiltration", base: 2, scaling: 8, factor: "corruptionPop", seed: 87, lawReduction: 0 },
  { key: "massManipulation", base: 4, scaling: 12, factor: "corruptionPop", seed: 88, lawReduction: 0 },
  { key: "electionRigging", base: 2, scaling: 6, factor: "corruptionPop", seed: 89, lawReduction: 0 },
  { key: "intelligenceSelling", base: 5, scaling: 18, factor: "corruptionPop", seed: 90, lawReduction: 0 },
  { key: "megacorpWarfare", base: 3, scaling: 8, factor: "crimePop", seed: 91, lawReduction: 0 },
  { key: "judicialCorruption", base: 7, scaling: 22, factor: "corruptionPop", seed: 92, lawReduction: 0 },
  { key: "politicalBlackmail", base: 5, scaling: 15, factor: "corruptionPop", seed: 93, lawReduction: 0 },
  { key: "shadowGovernment", base: 1, scaling: 3, factor: "corruptionPop", seed: 94, lawReduction: 0 },
  { key: "diplomaticCrimes", base: 1, scaling: 5, factor: "corruptionPop", seed: 95, lawReduction: 0 },
  { key: "treason", base: 0.5, scaling: 2, factor: "crimePop", seed: 96, lawReduction: 0.8 },

  { key: "unregisteredWeaponsSales", base: 35, scaling: 95, factor: "crimePop", seed: 97, gangSpec: "unregisteredWeaponsSales", lawReduction: 0 },
  { key: "syntheticDrugManufacturing", base: 15, scaling: 45, factor: "crimePop", seed: 98, gangSpec: "syntheticDrugManufacturing", lawReduction: 0 },
  { key: "alienArtifactTrafficking", base: 3, scaling: 10, factor: "crimePop", seed: 99, lawReduction: 0 },
  { key: "slaveChipTrading", base: 5, scaling: 18, factor: "crimePop", seed: 100, gangSpec: "slaveChipTrading", lawReduction: 0.6 },
  { key: "blackMarketCybernetics", base: 25, scaling: 70, factor: "crimePop", seed: 101, gangSpec: "blackMarketCybernetics", gated: "cyber", lawReduction: 0 },
  { key: "contrabandeering", base: 18, scaling: 50, factor: "crimePop", seed: 102, lawReduction: 0.4 },
  { key: "forgeryOperations", base: 30, scaling: 80, factor: "crimePop", seed: 103, lawReduction: 0 },
  { key: "illegalBountyHunting", base: 8, scaling: 25, factor: "crimePop", seed: 104, lawReduction: 0 },
  { key: "pitFighting", base: 14, scaling: 40, factor: "crimePop", seed: 105, gangSpec: "pitFighting", lawReduction: 0 },
  { key: "mutantTrafficking", base: 4, scaling: 12, factor: "crimePop", seed: 106, gated: "mutant", lawReduction: 0 },
  { key: "radioactiveMaterialSmuggling", base: 2, scaling: 7, factor: "crimePop", seed: 107, lawReduction: 0.5 },
];

const SPECIAL_CRIME_KEYS: Record<string, true> = {
  fraud: true, identityFraud: true, blackmail: true,
  streetRacing: true, gangWarfare: true,
  assault: true,
};

export function batchProcessCrime(
  cst: Record<string, any>,
  params: CrimeParams,
  techCache: TechEffectsCache,
  cs: { corruption: number; population: number; crime: number; unrest: number },
): void {
  const gangSpecs = getGangSpecialtyCounts();
  const { avgGangInfluence, totalTicks, lawLevel, popFactor, crimeLevel, unrestLevel, corruptionLevel } = params;

  for (const spec of CRIME_SPECS) {
    if (spec.gated) {
      const gateCheck = spec.gated === "cyber" ? techCache._hasCyber
        : spec.gated === "genetics" ? techCache._hasGenetics
        : techCache._hasMutant;
      if (!gateCheck) { cst[spec.key] = 0; continue; }
    }

    const factor = FACTOR_MAP[spec.factor](params);
    const gangMod = spec.gangSpec
      ? (() => { const w = gangSpecs[spec.gangSpec!] ?? 0; return w > 0 ? 1 + (w / 50) * avgGangInfluence : 1; })()
      : 1;

    cst[spec.key] = crimeCalc(spec.base, spec.scaling, factor, spec.seed, totalTicks, gangMod, spec.lawReduction, lawLevel);
  }

  cst.fraud = Math.max(0, Math.round((150 + cs.corruption * 4 * popFactor) * jitter(11, totalTicks)));
  cst.identityFraud = Math.max(0, Math.round((80 + cs.corruption * 3 * popFactor) * jitter(12, totalTicks)));
  cst.blackmail = Math.max(0, Math.round((15 + cs.corruption * 1.5 * popFactor) * jitter(14, totalTicks)));
  const unrestFactor = unrestLevel * 100;
  const assaultExtra = unrestLevel * 100;
  cst.assault = Math.max(0, Math.round((200 + crimeLevel * 400 * popFactor + assaultExtra) * jitter(3, totalTicks) * (1 - lawLevel * 0.3)));
  cst.streetRacing = Math.max(0, Math.round((70 + crimeLevel * 200 * popFactor + unrestLevel * 50) * jitter(53, totalTicks)));
  cst.gangWarfare = Math.max(0, Math.round((20 + crimeLevel * 60 * popFactor) * jitter(54, totalTicks) * (gangSpecs["gangWarfare"] ? 1 + (gangSpecs["gangWarfare"] / 50) * avgGangInfluence : 1) * 1.5));
  cst.organizedCrime = Math.max(0, Math.round((20 + crimeLevel * 80 * popFactor + cs.corruption * 0.5) * jitter(24, totalTicks) * (gangSpecs["organizedCrime"] ? 1 + (gangSpecs["organizedCrime"] / 50) * avgGangInfluence : 1)));
  cst.factorySabotage = Math.max(0, Math.round((5 + crimeLevel * 18 * popFactor + unrestLevel * 10) * jitter(66, totalTicks)));
  cst.automationSabotage = Math.max(0, Math.round((10 + crimeLevel * 30 * popFactor + unrestLevel * 15) * jitter(72, totalTicks)));
  cst.pedestrianAssault = Math.max(0, Math.round((65 + crimeLevel * 180 * popFactor + unrestLevel * 40) * jitter(62, totalTicks)));
}

import type {
  ExternalMegacity,
  FaithId,
  FactionInfrastructure,
  GameState,
  PartnerPersonalityTrait,
  Township,
} from "./types";
import {
  computeConcerns,
  computeCurrentAction,
  computeStance,
  inferArchetype,
  inferPersonalityArchetype,
  PARTNER_ARCHETYPES,
} from "./partnerDynamics";
import { defaultPopulationFor } from "./partnerCityStats";

export type SimulationProfileKnowledge = "known" | "estimated" | "unknown";

export type SimulationProfileField<T> = {
  value: T;
  knowledge: SimulationProfileKnowledge;
  basis: string;
};

export type PartnerSimulationProfile = {
  id: string;
  name: string;
  classification: SimulationProfileField<string>;
  government: SimulationProfileField<string>;
  population: SimulationProfileField<number>;
  militaryAttack: SimulationProfileField<{ description: string; rating: number }>;
  defense: SimulationProfileField<{ rating: number; walls: number; military: number }>;
  research: SimulationProfileField<number>;
  industry: SimulationProfileField<number>;
  infrastructure: SimulationProfileField<FactionInfrastructure>;
  resourcesAndStocks: SimulationProfileField<Record<string, number>>;
  tradeGoods: SimulationProfileField<string[]>;
  naturalResources: SimulationProfileField<string[]>;
  religionId: SimulationProfileField<FaithId | null>;
  stance: SimulationProfileField<string>;
  behaviorTraits: SimulationProfileField<string[]>;
  cultureTags: SimulationProfileField<string[]>;
  leader: SimulationProfileField<{ name: string; title: string }>;
  notablePeople: SimulationProfileField<string[]>;
  uniqueUnit: SimulationProfileField<string>;
  uniqueTechnology: SimulationProfileField<string>;
  uniqueTradeGood: SimulationProfileField<string>;
  currentAction: SimulationProfileField<string>;
  concerns: SimulationProfileField<string[]>;
  relationships: SimulationProfileField<{
    loyalty: number;
    influence: number;
    threat: number;
    playerDisposition: number;
    trend: "improving" | "stable" | "deteriorating";
    favors: number;
    grudges: number;
    debts: number;
  }>;
  flavor: string;
};

type PartnerEntity = ExternalMegacity | Township;

const FAITHS: readonly FaithId[] = [
  "eternal-flame",
  "machine-choir",
  "ancestor-cult",
  "the-ledger",
  "the-tidekeepers",
  "helix-commune",
  "free-choir",
];

const NATURAL_RESOURCE_PATTERN =
  /(?:_ore|_raw|_deposits|minerals|scrap|salvage|limestone|clay|sand|coal|sulfur|graphite|water|flora|seeds)$/;

const ARCHETYPE_DEFAULTS = {
  "nomad": {
    government: "Clan confederation",
    unit: "Wasteland outriders",
    technology: "Mobile reclamation rigs",
    good: "Route salvage",
    culture: ["mobile", "clan-based"],
    research: 32,
    industry: 38,
  },
  "tech-enclave": {
    government: "Technocratic council",
    unit: "Prototype drone cadre",
    technology: "Adaptive computation",
    good: "Research data",
    culture: ["technocratic", "research-focused"],
    research: 88,
    industry: 62,
  },
  "religious-order": {
    government: "Clerical council",
    unit: "Temple guard",
    technology: "Relic preservation",
    good: "Consecrated relics",
    culture: ["ritual", "faith-led"],
    research: 42,
    industry: 40,
  },
  "corporate-state": {
    government: "Executive directorate",
    unit: "Contract security cadre",
    technology: "Automated market logistics",
    good: "Corporate instruments",
    culture: ["commercial", "contractual"],
    research: 68,
    industry: 82,
  },
  "syndicate": {
    government: "Syndicate council",
    unit: "Covert enforcement crew",
    technology: "Counter-surveillance mesh",
    good: "Contraband",
    culture: ["clandestine", "mercantile"],
    research: 44,
    industry: 48,
  },
  "settlement": {
    government: "Local assembly",
    unit: "Citizen wardens",
    technology: "Closed-cycle utilities",
    good: "Local provisions",
    culture: ["communal", "self-reliant"],
    research: 30,
    industry: 35,
  },
  "military-junta": {
    government: "Military command",
    unit: "Command guard",
    technology: "Integrated fire control",
    good: "Military surplus",
    culture: ["martial", "disciplined"],
    research: 52,
    industry: 72,
  },
  "feudal-realm": {
    government: "Hereditary court",
    unit: "Household lancers",
    technology: "Citadel engineering",
    good: "Court artisan goods",
    culture: ["hierarchical", "traditional"],
    research: 38,
    industry: 52,
  },
} as const;

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function seeded(entity: PartnerEntity, key: string, min: number, max: number): number {
  return min + (hash(`${entity.id}:${key}`) % (max - min + 1));
}

function known<T>(value: T, basis: string): SimulationProfileField<T> {
  return { value, knowledge: "known", basis };
}

function estimated<T>(value: T, basis: string): SimulationProfileField<T> {
  return { value, knowledge: "estimated", basis };
}

function label(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function inventoryOf(entity: PartnerEntity): Record<string, number> {
  return Object.fromEntries(
    Object.entries(entity.tradeInventory ?? {})
      .filter(([, amount]) => typeof amount === "number" && Number.isFinite(amount) && amount > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * Builds a read-only intelligence snapshot from a live foreign entity.
 * It never normalizes or writes back to the entity/state/save. Missing schema
 * values are stable id-seeded estimates and are explicitly marked as such.
 */
export function derivePartnerSimulationProfile(
  entity: PartnerEntity,
  state?: GameState,
): PartnerSimulationProfile {
  const archetype = inferArchetype(entity);
  const personalityArchetype = inferPersonalityArchetype(entity);
  const defaults = ARCHETYPE_DEFAULTS[archetype];
  const inventory = inventoryOf(entity);
  const inventoryKeys = Object.keys(inventory);
  const naturalKeys = inventoryKeys.filter((key) => NATURAL_RESOURCE_PATTERN.test(key));
  const manufacturedKeys = inventoryKeys.filter((key) => !NATURAL_RESOURCE_PATTERN.test(key));
  const specialResources = "specialResources" in entity ? (entity.specialResources ?? []) : [];
  const naturalSpecialResources = specialResources.filter((key) => NATURAL_RESOURCE_PATTERN.test(key));
  const infrastructure = entity.infrastructure
    ? known({ ...entity.infrastructure }, "live infrastructure")
    : estimated({
      military: seeded(entity, "infra-military", 30, 85),
      walls: seeded(entity, "infra-walls", 30, 85),
      fuel: seeded(entity, "infra-fuel", 30, 85),
      civilian: seeded(entity, "infra-civilian", 30, 85),
    }, "id-seeded estimate; infrastructure is absent");
  const attackRating = Math.round(
    infrastructure.value.military * 0.65 + Math.max(0, Math.min(100, entity.threat)) * 0.35,
  );
  const defenseRating = Math.round(
    infrastructure.value.walls * 0.65 + infrastructure.value.military * 0.35,
  );
  const personalityTraits = entity.personality
    ? [entity.personality.primary, entity.personality.secondary].filter(
      (trait): trait is PartnerPersonalityTrait => !!trait,
    )
    : [];
  const leaderTraits = entity.leader?.personalityTraits ?? [];
  const traits = [...new Set([...personalityTraits, ...leaderTraits])];
  const cultureTags = [...new Set([
    ...defaults.culture,
    archetype,
    entity.factionType,
  ])];
  const playerRelation = state?.diplomacyAdvanced?.factionRelations?.find(
    (relation) =>
      (relation.factionA === "player" && relation.factionB === entity.id)
      || (relation.factionB === "player" && relation.factionA === entity.id),
  );
  const ledger = state?.partnerLedgers?.[entity.id];
  const hasRelationshipRecords = !!playerRelation || !!ledger;
  const action = entity.currentAction
    ? known(entity.currentAction, "live partner action")
    : state
      ? estimated(computeCurrentAction(entity, state), "derived from live conditions")
      : estimated("Maintaining domestic operations.", "id-stable archetype baseline; no world state supplied");
  const concerns = entity.concerns?.length
    ? known([...entity.concerns], "live partner concerns")
    : state
      ? estimated(computeConcerns(entity, state), "derived from live conditions")
      : estimated([`Maintaining ${archetype.replace("-", " ")} priorities`], "archetype baseline; no world state supplied");
  const strongestStock = inventoryKeys
    .slice()
    .sort((a, b) => inventory[b] - inventory[a] || a.localeCompare(b))[0];
  const uniqueGood = specialResources[0] ?? strongestStock;

  return {
    id: entity.id,
    name: entity.name,
    classification: known(`${entity.factionType} / ${archetype}`, "live faction type; derived archetype"),
    government: "governanceStyle" in entity && entity.governanceStyle
      ? known(entity.governanceStyle, "live governance record")
      : estimated(defaults.government, "id-stable archetype baseline; government is absent"),
    population: typeof entity.population === "number"
      ? known(entity.population, "live population")
      : estimated(defaultPopulationFor(entity), "id-seeded schema default"),
    militaryAttack: "militaryStrength" in entity && entity.militaryStrength
      ? known({ description: entity.militaryStrength, rating: attackRating }, "live military description and infrastructure")
      : estimated({ description: `${archetype.replace("-", " ")} forces`, rating: attackRating }, "derived from threat and infrastructure"),
    defense: infrastructure.knowledge === "known"
      ? known({ rating: defenseRating, walls: infrastructure.value.walls, military: infrastructure.value.military }, "live infrastructure")
      : estimated({ rating: defenseRating, walls: infrastructure.value.walls, military: infrastructure.value.military }, infrastructure.basis),
    research: estimated(
      Math.max(0, Math.min(100, Math.round(defaults.research * 0.7 + infrastructure.value.fuel * 0.3))),
      "archetype and infrastructure estimate; no research field exists",
    ),
    industry: estimated(
      Math.max(0, Math.min(100, Math.round(defaults.industry * 0.6 + infrastructure.value.civilian * 0.4))),
      "archetype and infrastructure estimate; no industry field exists",
    ),
    infrastructure,
    resourcesAndStocks: inventoryKeys.length
      ? known(inventory, "live trade inventory")
      : estimated({}, "no stocks observed"),
    tradeGoods: manufacturedKeys.length
      ? known(manufacturedKeys.map(label), "manufactured goods in live inventory")
      : estimated([uniqueGood ? label(uniqueGood) : defaults.good], "special resource or archetype estimate"),
    naturalResources: naturalKeys.length || naturalSpecialResources.length
      ? known([...new Set([...naturalKeys, ...naturalSpecialResources])].map(label), "live inventory and natural special resources")
      : estimated([defaults.good], "archetype estimate; no resource survey exists"),
    religionId: entity.dominantFaithId !== undefined
      ? known(entity.dominantFaithId, "live dominant faith record")
      : estimated(FAITHS[hash(`${entity.id}:faith`) % FAITHS.length], "id-seeded estimate; faith is unrecorded"),
    stance: entity.stance
      ? known(entity.stance, "live stance")
      : estimated(computeStance(entity), "derived from live loyalty, threat, health, and control"),
    behaviorTraits: traits.length
      ? known(traits, "live personality and leader records")
      : estimated([personalityArchetype], "id-stable personality archetype"),
    cultureTags: estimated(cultureTags, "classification and archetype-derived tags"),
    leader: entity.leader
      ? known({ name: entity.leader.name, title: entity.leader.title }, "live leader record")
      : estimated({ name: "Unidentified", title: defaults.government }, "leadership is unrecorded"),
    notablePeople: entity.leader
      ? known([entity.leader.name], "live named people")
      : { value: [], knowledge: "unknown", basis: "no notable people are recorded" },
    uniqueUnit: estimated(defaults.unit, "id-stable archetype estimate; no partner unit field exists"),
    uniqueTechnology: estimated(defaults.technology, "id-stable archetype estimate; no partner technology field exists"),
    uniqueTradeGood: uniqueGood
      ? known(label(uniqueGood), specialResources[0] ? "live special resource" : "largest live stock")
      : estimated(defaults.good, "id-stable archetype estimate"),
    currentAction: action,
    concerns,
    relationships: hasRelationshipRecords
      ? known({
        loyalty: entity.loyalty,
        influence: entity.influence,
        threat: entity.threat,
        playerDisposition: playerRelation?.disposition ?? 50,
        trend: playerRelation?.trend ?? (
          ledger?.trustTrend === "rising"
            ? "improving"
            : ledger?.trustTrend === "falling" ? "deteriorating" : "stable"
        ),
        favors: ledger?.favors ?? 0,
        grudges: ledger?.grudges ?? 0,
        debts: ledger?.debts ?? 0,
      }, "live entity and diplomacy records")
      : estimated({
        loyalty: entity.loyalty,
        influence: entity.influence,
        threat: entity.threat,
        playerDisposition: Math.max(0, Math.min(100, entity.loyalty)),
        trend: "stable",
        favors: 0,
        grudges: 0,
        debts: 0,
      }, "live entity metrics; disposition estimated from loyalty"),
    flavor: PARTNER_ARCHETYPES[archetype].label.toLowerCase(),
  };
}
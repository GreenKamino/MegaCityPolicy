import type {
  ExternalMegacity,
  SettlementInfrastructureScore,
  SettlementOperationalData,
  Township,
} from "@/engine/types";

export const GENERIC_MEGACITY_IDS = [
  "terminus-prime",
  "new-olympus",
  "panopticon",
  "ashfall-dominion",
  "the-recursion",
] as const;

/** Durable id retained from the pre-LA CITY catalog. */
export const LA_CITY_ID = "iron-khanate";

const sharedInfrastructure = (military: number, walls: number, fuel: number, civilian: number) => ({
  military,
  walls,
  fuel,
  civilian,
});

type SettlementInfrastructureEstimateInput = Pick<
  SettlementOperationalData,
  "population" | "territoryKm2" | "infrastructure" | "economy" | "trade" | "military" | "stability"
> & {
  condition?: SettlementOperationalData["condition"];
};

const clampPercent = (value: unknown, fallback = 0): number => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, numeric));
};

const average = (...values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

/**
 * Estimate an NPC settlement's physical infrastructure without constructing a
 * player building ledger. The inputs are all already-persisted operational
 * facts, so this remains a pure and deterministic read model for map sheets.
 *
 * Points grow sub-linearly with population and territory (a megacity has more
 * capacity than a town without producing runaway values). Integrity is the
 * weighted condition of the physical dimensions and operating systems.
 */
export function estimateSettlementInfrastructure(
  operational: SettlementInfrastructureEstimateInput,
): SettlementInfrastructureScore {
  const population = Math.max(0, Number.isFinite(operational.population) ? operational.population : 0);
  const territory = Math.max(0, Number.isFinite(operational.territoryKm2) ? operational.territoryKm2 : 0);
  const dimensions = operational.infrastructure;
  const walls = clampPercent(dimensions.walls);
  const utilities = average(clampPercent(dimensions.fuel), clampPercent(dimensions.civilian));
  const militaryInfrastructure = clampPercent(dimensions.military);
  const militaryCapacity = clampPercent(operational.military.capacity);
  const defenses = average(militaryInfrastructure, militaryCapacity);
  const structural = average(
    militaryInfrastructure,
    walls,
    clampPercent(dimensions.fuel),
    clampPercent(dimensions.civilian),
  );
  const tradeWeight: Record<SettlementOperationalData["trade"]["capacity"], number> = {
    limited: 12,
    regional: 35,
    major: 62,
    continental: 88,
  };
  const economy = Math.max(
    0,
    Math.min(100, operational.economy.outputs.length * 8 + tradeWeight[operational.trade.capacity] * 0.55),
  );
  const stability = clampPercent(operational.stability.score);
  const health = clampPercent(operational.condition?.health, 100);
  const attrition = clampPercent(operational.condition?.attrition);
  const condition = average(health, 100 - attrition);

  const scalePoints = Math.log10(population + 10) * 24 + Math.sqrt(territory) * 0.65;
  const totalPoints = Math.max(0, Math.round(
    scalePoints
      + structural * 0.9
      + defenses * 0.42
      + walls * 0.38
      + utilities * 0.52
      + economy * 0.46
      + militaryCapacity * 0.22
      + stability * 0.2
      + condition * 0.2,
  ));
  const integrityPercent = Math.max(0, Math.min(100, Math.round(
    structural * 0.2
      + defenses * 0.14
      + walls * 0.13
      + utilities * 0.14
      + economy * 0.1
      + militaryCapacity * 0.1
      + stability * 0.1
      + condition * 0.09,
  )));

  return { totalPoints, integrityPercent };
}

/** Alias emphasizing that this is the settlement-facing score, not the
 * player's asset ledger. */
export const estimateSettlementInfrastructureScore = estimateSettlementInfrastructure;

function withInfrastructureScore(
  operational: Omit<SettlementOperationalData, "infrastructureScore">,
): SettlementOperationalData {
  return {
    ...operational,
    infrastructureScore: estimateSettlementInfrastructure(operational),
  };
}

/**
 * Bounded operating sheet for LA CITY. Civilian infrastructure and perimeter
 * ratings include the outstanding seismic-recovery work.
 */
export const LA_CITY_OPERATIONAL: SettlementOperationalData = withInfrastructureScore({
  population: 3898747,
  territoryKm2: 1302,
  infrastructure: sharedInfrastructure(58, 42, 57, 49),
  setting: { terrain: "Los Angeles urban basin", coastal: true, wasteland: false },
  government: { style: "Municipal emergency administration", institution: "LA CITY Operations Coordination Office" },
  economy: {
    profile: "Port logistics, repair construction, media systems, and light manufacturing",
    outputs: ["port cargo handling", "repair services", "solar power", "reclaimed water"],
  },
  resources: ["port cargo", "solar power", "reclaimed water", "construction aggregates"],
  trade: {
    exports: ["port cargo handling", "repair services", "solar power"],
    imports: ["food", "fuel", "medical supplies", "seismic retrofit materials"],
    capacity: "major",
  },
  military: { capacity: 95, posture: "Regional civil defense, port security, and emergency response units" },
  stability: { score: 54, label: "Stressed; seismic recovery remains in progress" },
  diplomacy: { posture: "Cautious regional coordination", influence: 75 },
});

/** Player-facing identity applied both to fresh state and legacy saves. */
export const LA_CITY_PRESENTATION = {
  name: "LA CITY",
  description: "Major coastal urban center operating through ongoing seismic recovery. Damaged transport corridors and civic systems keep infrastructure capacity constrained.",
  factionType: "megacity" as const,
  governanceStyle: "Municipal emergency administration",
  militaryStrength: "Regional civil defense, port security, and emergency response units",
  specialResources: ["port_cargo", "solar_power", "reclaimed_water", "construction_aggregates"],
};

export const SETTLEMENT_OPERATIONAL_BY_ID: Record<string, SettlementOperationalData> = {
  "terminus-prime": withInfrastructureScore({
    population: 8600000,
    territoryKm2: 6200,
    infrastructure: sharedInfrastructure(88, 74, 81, 69),
    setting: { terrain: "Wasteland crater", coastal: false, wasteland: true },
    government: { style: "Technocratic crater directorate", institution: "Prime Directorate" },
    economy: { profile: "Closed orbital-recovery and precision manufacturing economy", outputs: ["orbital salvage", "precision components", "reactor heat"] },
    resources: ["orbital salvage", "rare earth minerals", "reactor fuel"],
    trade: { exports: ["precision components", "orbital salvage"], imports: ["food", "medical supplies"], capacity: "major" },
    military: { capacity: 86, posture: "Fortified perimeter with autonomous interception grids" },
    stability: { score: 68, label: "Controlled but brittle" },
    diplomacy: { posture: "Transactional and distant", influence: 72 },
  }),
  "new-olympus": withInfrastructureScore({
    population: 3100000,
    territoryKm2: 2800,
    infrastructure: sharedInfrastructure(79, 91, 63, 58),
    setting: { terrain: "Mountain fortress", coastal: false, wasteland: false },
    government: { style: "Uploaded civic council", institution: "Olympian Consensus Array" },
    economy: { profile: "High-skill fabrication and mountain logistics", outputs: ["machine intelligence", "armaments", "ceramics"] },
    resources: ["tungsten", "silicon ore", "hydropower"],
    trade: { exports: ["machine intelligence", "armaments"], imports: ["food", "fuel"], capacity: "regional" },
    military: { capacity: 91, posture: "Defensive high-ground doctrine with elite autonomous units" },
    stability: { score: 82, label: "Highly ordered" },
    diplomacy: { posture: "Selective and superiority-minded", influence: 67 },
  }),
  panopticon: withInfrastructureScore({
    population: 12400000,
    territoryKm2: 5100,
    infrastructure: sharedInfrastructure(76, 68, 94, 83),
    setting: { terrain: "Urban surveillance basin", coastal: false, wasteland: false },
    government: { style: "Algorithmic surveillance state", institution: "Compliance Directorate" },
    economy: { profile: "Data extraction, logistics, and automated services", outputs: ["predictive analytics", "security systems", "processed goods"] },
    resources: ["data centers", "industrial power", "automated labor"],
    trade: { exports: ["security systems", "analytics"], imports: ["raw materials", "specialist medicine"], capacity: "continental" },
    military: { capacity: 84, posture: "Internal control first; drone-heavy border defense" },
    stability: { score: 74, label: "Stable under coercion" },
    diplomacy: { posture: "Observational and coercive", influence: 90 },
  }),
  "ashfall-dominion": withInfrastructureScore({
    population: 5800000,
    territoryKm2: 4300,
    infrastructure: sharedInfrastructure(71, 62, 97, 54),
    setting: { terrain: "Volcanic ash belt", coastal: false, wasteland: true },
    government: { style: "Hereditary geothermal dominion", institution: "Ashfall Crown and Works" },
    economy: { profile: "Geothermal power, mineral processing, and heat-resistant industry", outputs: ["geothermal power", "sulfur", "ceramics"] },
    resources: ["geothermal energy", "sulfur", "obsidian", "rare metals"],
    trade: { exports: ["geothermal power", "sulfur", "ceramics"], imports: ["food", "clean water"], capacity: "major" },
    military: { capacity: 78, posture: "Hazard-adapted garrison with ash-screened approaches" },
    stability: { score: 57, label: "Strained by the ashfall" },
    diplomacy: { posture: "Guarded and extractive", influence: 61 },
  }),
  "the-recursion": withInfrastructureScore({
    population: 4200000,
    territoryKm2: 3900,
    infrastructure: sharedInfrastructure(52, 48, 73, 46),
    setting: { terrain: "Unmapped interior plain", coastal: false, wasteland: true },
    government: { style: "Unverified recursive administration", institution: "Municipal Continuity Signal" },
    economy: { profile: "Unconfirmed; satellite signatures imply automated production", outputs: ["unknown manufactured goods", "signal services"] },
    resources: ["survey data", "automated factories", "unknown reserves"],
    trade: { exports: ["unknown"], imports: ["unknown"], capacity: "limited" },
    military: { capacity: 63, posture: "Unconfirmed; no ground force has been observed" },
    stability: { score: 49, label: "Unreadable" },
    diplomacy: { posture: "Non-contact", influence: 45 },
  }),
};

export const GENERIC_MEGACITY_ENTITIES: ExternalMegacity[] = GENERIC_MEGACITY_IDS.map((id) => {
  const operational = SETTLEMENT_OPERATIONAL_BY_ID[id];
  return {
    id,
    name: {
      "terminus-prime": "Terminus Prime",
      "new-olympus": "Olympus",
      panopticon: "Panopticon City",
      "ashfall-dominion": "Ashfall State",
      "the-recursion": "The Recursion",
    }[id],
    description: {
      "terminus-prime": "A crater megacity whose signals return with impossible timing.",
      "new-olympus": "A mountain fortress-city governed by uploaded civic minds.",
      panopticon: "A city where automated observation reaches into every district.",
      "ashfall-dominion": "A geothermal megacity beneath a permanent fall of volcanic ash.",
      "the-recursion": "A city visible from orbit but absent from every ground survey.",
    }[id],
    influence: operational.diplomacy.influence,
    loyalty: operational.stability.score,
    threat: operational.military.capacity,
    isActive: true,
    tradeInventory: Object.fromEntries(operational.trade.exports.map((resource, index) => [resource, 100 + index * 50])),
    lastRefreshTick: 0,
    factionType: "megacity",
    governanceStyle: operational.government.style,
    militaryStrength: operational.military.posture,
    specialResources: operational.resources,
    population: operational.population,
    infrastructure: operational.infrastructure,
    operational,
  };
});

type SettlementOperationalFallback = {
    population?: number;
    territoryKm2?: number;
    infrastructure?: Partial<SettlementOperationalData["infrastructure"]>;
    terrain?: string;
    coastal?: boolean;
    wasteland?: boolean;
    governmentStyle?: string;
    institution?: string;
    economyProfile?: string;
    outputs?: string[];
    resources?: string[];
    tradeExports?: string[];
    tradeImports?: string[];
    tradeCapacity?: SettlementOperationalData["trade"]["capacity"];
    militaryCapacity?: number;
    militaryPosture?: string;
    stabilityScore?: number;
    stabilityLabel?: string;
    diplomacyPosture?: string;
    influence?: number;
    condition?: Partial<NonNullable<SettlementOperationalData["condition"]>>;
    cityHealth?: number;
    attrition?: number;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

/**
 * Keeps trade consumers from seeing malformed save values as stock. A valid
 * inventory is copied in Object.entries order; invalid entries are omitted so
 * NaN, infinities, negative stock, and non-numeric values cannot become
 * tradable quantities. Non-record shapes use the catalog fallback instead.
 */
export function normalizeTradeInventory(
  value: unknown,
  fallback: unknown = {},
): Record<string, number> {
  const source = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fallback !== null && typeof fallback === "object" && !Array.isArray(fallback)
      ? fallback as Record<string, unknown>
      : {};

  return Object.fromEntries(
    Object.entries(source).filter(([resource, quantity]) =>
      resource.trim().length > 0
      && typeof quantity === "number"
      && Number.isFinite(quantity)
      && quantity >= 0,
    ),
  ) as Record<string, number>;
}

function firstFiniteNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

const boundedInteger = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  Math.max(min, Math.min(max, Math.round(firstFiniteNumber(value))));

function nonEmptyString(value: unknown, fallback: unknown, defaultValue: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof fallback === "string" && fallback.trim().length > 0) return fallback;
  return defaultValue;
}

function stringList(value: unknown, fallback: unknown, requireOne = false): string[] {
  const normalize = (candidate: unknown): string[] =>
    Array.isArray(candidate)
      ? candidate.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
  const values = normalize(value);
  if (values.length > 0 || (Array.isArray(value) && !requireOne)) return values;
  return normalize(fallback);
}

const TRADE_CAPACITIES = new Set<SettlementOperationalData["trade"]["capacity"]>([
  "limited",
  "regional",
  "major",
  "continental",
]);

export function normalizeSettlementOperational(
  value: Partial<SettlementOperationalData> | null | undefined,
  fallback: SettlementOperationalFallback = {},
): SettlementOperationalData {
  const root = asRecord(value);
  const infrastructure = asRecord(root.infrastructure);
  const fallbackInfrastructure = asRecord(fallback.infrastructure);
  const setting = asRecord(root.setting);
  const faithCulture = asRecord(root.faithCulture);
  const government = asRecord(root.government);
  const economy = asRecord(root.economy);
  const trade = asRecord(root.trade);
  const military = asRecord(root.military);
  const stability = asRecord(root.stability);
  const diplomacy = asRecord(root.diplomacy);
  const condition = asRecord(root.condition);
  const fallbackCondition = asRecord(fallback.condition);

  const population = boundedInteger(firstFiniteNumber(root.population, fallback.population));
  const outputs = stringList(economy.outputs, fallback.outputs ?? fallback.resources, true);
  const resources = stringList(root.resources, fallback.resources ?? outputs, true);
  const tradeExports = stringList(trade.exports, fallback.tradeExports ?? outputs, true);
  const tradeImports = stringList(trade.imports, fallback.tradeImports);
  const militaryCapacity = firstFiniteNumber(
    military.capacity,
    fallback.militaryCapacity,
    infrastructure.military,
    fallbackInfrastructure.military,
  );
  const stabilityScore = firstFiniteNumber(stability.score, fallback.stabilityScore, 50);
  const capacity = TRADE_CAPACITIES.has(trade.capacity as SettlementOperationalData["trade"]["capacity"])
    ? trade.capacity as SettlementOperationalData["trade"]["capacity"]
    : fallback.tradeCapacity && TRADE_CAPACITIES.has(fallback.tradeCapacity)
      ? fallback.tradeCapacity
    : tradeExports.length > 3
      ? "major"
      : tradeExports.length > 0
        ? "regional"
        : "limited";

  const normalized: Omit<SettlementOperationalData, "infrastructureScore"> = {
    population,
    territoryKm2: boundedInteger(firstFiniteNumber(root.territoryKm2, fallback.territoryKm2)),
    infrastructure: {
      military: boundedInteger(firstFiniteNumber(infrastructure.military, fallbackInfrastructure.military), 0, 100),
      walls: boundedInteger(firstFiniteNumber(infrastructure.walls, fallbackInfrastructure.walls), 0, 100),
      fuel: boundedInteger(firstFiniteNumber(infrastructure.fuel, fallbackInfrastructure.fuel), 0, 100),
      civilian: boundedInteger(firstFiniteNumber(infrastructure.civilian, fallbackInfrastructure.civilian), 0, 100),
    },
    setting: {
      terrain: nonEmptyString(setting.terrain, fallback.terrain, "Unclassified"),
      coastal: typeof setting.coastal === "boolean" ? setting.coastal : fallback.coastal === true,
      wasteland: typeof setting.wasteland === "boolean" ? setting.wasteland : fallback.wasteland === true,
      foundation: nonEmptyString(setting.foundation, undefined, "Unrecorded"),
      hazards: stringList(setting.hazards, [], false),
    },
    faithCulture: {
      faith: nonEmptyString(faithCulture.faith, undefined, "Unreported"),
      culture: stringList(faithCulture.culture, [], false),
    },
    government: {
      style: nonEmptyString(government.style, fallback.governmentStyle, "Local authority"),
      institution: nonEmptyString(government.institution, fallback.institution, "Independent administration"),
    },
    economy: {
      profile: nonEmptyString(economy.profile, fallback.economyProfile, "Mixed survival economy"),
      outputs: [...outputs],
    },
    resources: [...resources],
    trade: {
      exports: [...tradeExports],
      imports: [...tradeImports],
      capacity,
    },
    military: {
      capacity: boundedInteger(militaryCapacity, 0, 100),
      posture: nonEmptyString(military.posture, fallback.militaryPosture, "Local defense"),
    },
    stability: {
      score: boundedInteger(stabilityScore, 0, 100),
      label: nonEmptyString(stability.label, fallback.stabilityLabel, "Unassessed"),
    },
    condition: {
      health: boundedInteger(firstFiniteNumber(
        condition.health,
        fallbackCondition.health,
        fallback.cityHealth,
        100,
      ), 0, 100),
      attrition: boundedInteger(firstFiniteNumber(
        condition.attrition,
        fallbackCondition.attrition,
        fallback.attrition,
        0,
      ), 0, 100),
    },
    diplomacy: {
      posture: nonEmptyString(diplomacy.posture, fallback.diplomacyPosture, "Independent"),
      influence: boundedInteger(firstFiniteNumber(diplomacy.influence, fallback.influence), 0, 100),
    },
    priorities: stringList(root.priorities, [], false),
  };
  return {
    ...normalized,
    infrastructureScore: estimateSettlementInfrastructure(normalized),
  };
}

export type SettlementOperationalSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

const operationalList = (items: string[] | undefined, empty = "UNREPORTED"): string =>
  items && items.length > 0 ? items.join(" · ") : empty;

const operationalTradeList = (items: string[] | undefined, empty = "NONE"): string =>
  items && items.length > 0 ? items.join(", ") : empty;

/**
 * Shared presentation rows for every populated settlement class. Keeping the
 * row contract next to the normalized read model prevents World Map,
 * Diplomacy, and future settlement surfaces from quietly drifting apart.
 */
export function getOperationalSettlementSections(
  operational: SettlementOperationalData,
): SettlementOperationalSection[] {
  return [
    {
      title: "SETTING",
      rows: [
        { label: "TERRAIN", value: operational.setting.terrain || "UNCLASSIFIED" },
        { label: "TERRITORY", value: operational.territoryKm2 > 0 ? `${operational.territoryKm2.toLocaleString()} km²` : "UNREPORTED" },
        { label: "FOUNDATION", value: operational.setting.foundation || "UNRECORDED" },
        { label: "HAZARDS", value: operationalList(operational.setting.hazards, "NONE REPORTED") },
      ],
    },
    {
      title: "GOVERNANCE & CULTURE",
      rows: [
        { label: "GOVERNMENT", value: `${operational.government.style} · ${operational.government.institution}` },
        { label: "FAITH / CULTURE", value: `${operational.faithCulture?.faith || "UNREPORTED"} · ${operationalList(operational.faithCulture?.culture)}` },
        { label: "PRIORITIES", value: operationalList(operational.priorities) },
      ],
    },
    {
      title: "ECONOMY & TRADE",
      rows: [
        { label: "ECONOMY", value: `${operational.economy.profile} · ${operationalList(operational.economy.outputs, "NONE REPORTED")}` },
        { label: "RESOURCES", value: operationalList(operational.resources, "NONE REPORTED") },
        { label: "TRADE", value: `${operational.trade.capacity.toUpperCase()} · OUT ${operationalTradeList(operational.trade.exports, "none")} · IN ${operationalTradeList(operational.trade.imports, "none")}` },
      ],
    },
    {
      title: "CAPABILITY & CONDITION",
      rows: [
        { label: "POPULATION", value: operational.population > 0 ? operational.population.toLocaleString() : "UNREPORTED" },
        { label: "MILITARY", value: `${operational.military.capacity} · ${operational.military.posture}` },
        { label: "INFRASTRUCTURE", value: `${operational.infrastructureScore.totalPoints} pts · ${operational.infrastructureScore.integrityPercent}% integrity` },
        { label: "STABILITY", value: `${operational.stability.score} · ${operational.stability.label}` },
        { label: "CONDITION", value: `HEALTH ${operational.condition?.health ?? "UNREPORTED"} · ATTRITION ${operational.condition?.attrition ?? "UNREPORTED"}` },
      ],
    },
    {
      title: "DIPLOMACY",
      rows: [
        { label: "POSTURE", value: operational.diplomacy.posture || "UNREPORTED" },
        { label: "INFLUENCE", value: Number.isFinite(operational.diplomacy.influence) ? `${operational.diplomacy.influence}` : "UNREPORTED" },
      ],
    },
  ];
}

export function operationalFromSettlement(
  entity: ExternalMegacity | Township,
  catalogFallback?: SettlementOperationalData,
): SettlementOperationalData {
  const anyEntity = entity as ExternalMegacity & Township;
  const tradeInventory = asRecord(anyEntity.tradeInventory);
  const outputs = Object.keys(tradeInventory);
  const population = typeof anyEntity.population === "number" && Number.isFinite(anyEntity.population)
    ? anyEntity.population
    : catalogFallback?.population;
  const infrastructure = Object.keys(asRecord(anyEntity.infrastructure)).length > 0
    ? anyEntity.infrastructure
    : catalogFallback?.infrastructure;
  return normalizeSettlementOperational(entity.operational, {
    population,
    territoryKm2: catalogFallback?.territoryKm2,
    infrastructure,
    terrain: catalogFallback?.setting.terrain,
    coastal: typeof anyEntity.acrossWater === "boolean"
      ? anyEntity.acrossWater
      : catalogFallback?.setting.coastal,
    wasteland: catalogFallback?.setting.wasteland,
    governmentStyle: typeof anyEntity.governanceStyle === "string"
      ? anyEntity.governanceStyle
      : catalogFallback?.government.style,
    institution: typeof anyEntity.factionType === "string"
      ? anyEntity.factionType
      : catalogFallback?.government.institution,
    economyProfile: typeof anyEntity.specialization === "string"
      ? anyEntity.specialization
      : catalogFallback?.economy.profile,
    outputs: outputs.length > 0 ? outputs : catalogFallback?.economy.outputs,
    resources: Array.isArray(anyEntity.specialResources)
      ? anyEntity.specialResources
      : catalogFallback?.resources ?? outputs,
    tradeExports: outputs.length > 0 ? outputs : catalogFallback?.trade.exports,
    tradeImports: catalogFallback?.trade.imports,
    tradeCapacity: catalogFallback?.trade.capacity,
    militaryCapacity: catalogFallback?.military.capacity,
    stabilityScore: firstFiniteNumber(
      anyEntity.cityHealth,
      anyEntity.loyalty,
      catalogFallback?.stability.score,
      50,
    ),
    cityHealth: typeof anyEntity.cityHealth === "number" && Number.isFinite(anyEntity.cityHealth)
      ? anyEntity.cityHealth
      : catalogFallback?.condition?.health,
    attrition: typeof anyEntity.attrition === "number" && Number.isFinite(anyEntity.attrition)
      ? anyEntity.attrition
      : catalogFallback?.condition?.attrition,
    stabilityLabel: catalogFallback?.stability.label,
    militaryPosture: typeof anyEntity.militaryStrength === "string"
      ? anyEntity.militaryStrength
      : catalogFallback?.military.posture,
    diplomacyPosture: catalogFallback?.diplomacy.posture,
    influence: firstFiniteNumber(anyEntity.influence, catalogFallback?.diplomacy.influence),
  });
}

export type SettlementCardFacts = {
  population: number;
  government: string;
};

/**
 * Small public summary for compact diplomacy cards. Legacy entities return
 * null so callers can retain their existing deterministic profile fallback;
 * Continuance-only fields are never part of this card contract.
 */
export function getSettlementCardFacts(
  entity: ExternalMegacity | Township,
): SettlementCardFacts | null {
  if (!entity.operational) return null;
  const operational = operationalFromSettlement(entity);
  return {
    population: operational.population,
    government: operational.government.style,
  };
}

/**
 * Replaces only catalog presentation for the durable legacy id. Dynamic
 * relationship, control, faith, inventory, and refresh fields remain on the
 * supplied entity and are deliberately not reconstructed here.
 */
export function applyCanonicalLACityPresentation<T extends ExternalMegacity>(entity: T): T {
  if (entity.id !== LA_CITY_ID) return entity;
  return {
    ...entity,
    ...LA_CITY_PRESENTATION,
    population: LA_CITY_OPERATIONAL.population,
    infrastructure: { ...LA_CITY_OPERATIONAL.infrastructure },
    operational: normalizeSettlementOperational(LA_CITY_OPERATIONAL),
    leader: undefined,
    voiceLines: undefined,
  } as T;
}
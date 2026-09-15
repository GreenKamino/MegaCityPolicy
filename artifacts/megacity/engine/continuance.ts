import type { ContinuanceOperationalState, ExternalMegacity } from "@/engine/types";

export const CONTINUANCE_ID = "cheyenne-mountain";

/** The sealed facility exposes intelligence only; generic map missions cannot enter or attack it. */
export function isContinuanceMapInteractionLocked(locationId: string): boolean {
  return locationId === CONTINUANCE_ID;
}
export type ContinuanceOperationalInput = Omit<Partial<ContinuanceOperationalState>,
  "cohorts" | "bunker" | "industry" | "weapons" | "militaryCommander" | "civilianPresident" | "restorationPlan"
> & {
  cohorts?: Partial<ContinuanceOperationalState["cohorts"]>;
  bunker?: Partial<ContinuanceOperationalState["bunker"]>;
  industry?: Partial<ContinuanceOperationalState["industry"]>;
  weapons?: Partial<ContinuanceOperationalState["weapons"]>;
  militaryCommander?: Partial<ContinuanceOperationalState["militaryCommander"]>;
  civilianPresident?: Partial<ContinuanceOperationalState["civilianPresident"]>;
  restorationPlan?: Omit<Partial<ContinuanceOperationalState["restorationPlan"]>, "readinessThresholds"> & {
    readinessThresholds?: Partial<ContinuanceOperationalState["restorationPlan"]["readinessThresholds"]>;
  };
};

export const CONTINUANCE_PRESENTATION = {
  id: CONTINUANCE_ID,
  name: "USR (United States Remnants)",
  description: "A sealed Cheyenne Mountain Complex continuity government preserving a federal restoration mandate.",
  factionType: "nation" as const,
  governanceStyle: "Civilian continuity government under protected military command",
  militaryStrength: "Hardened bunker garrison and reserve cadre",
  specialResources: ["bunker_industry", "continuity_records", "secure_comms"],
};

export const DEFAULT_CONTINUANCE_OPERATIONAL: ContinuanceOperationalState = {
  cohorts: {
    totalSurvivors: 4800,
    dependents: 900,
    workers: 2250,
    administrators: 350,
    activeDuty: 800,
    reserves: 400,
    command: 100,
  },
  bunker: { capacity: 6000, food: 82, water: 88, power: 76, air: 91, housing: 6000 },
  industry: { capacity: 42, output: 36 },
  weapons: { readiness: 68, stockpile: 54 },
  morale: 64,
  legitimacy: 57,
  secrecy: 89,
  intelligenceReach: 38,
  reclamationCapability: 31,
  militaryCommander: {
    name: "General Mara Vance",
    role: "Megacity Commander",
    authority: 82,
    approval: 66,
    loyalty: 91,
    succession: "Deputy commander assumes defense authority.",
  },
  civilianPresident: {
    name: "President Elias Ward",
    role: "Civilian President",
    authority: 74,
    approval: 61,
    loyalty: 84,
    succession: "Vice president assumes civilian authority.",
  },
  doctrine: "Sole legitimate government; restore lawful civilian administration when viable.",
  restorationPlan: {
    planning: 46,
    infiltration: 18,
    reconnaissance: 29,
    mobilization: 22,
    targetRegions: ["Colorado Front Range", "Rocky Mountain corridor"],
    readinessThresholds: { infiltration: 55, reconnaissance: 60, mobilization: 65 },
    discoveryRisk: 14,
  },
  discoveryStage: 0,
};

const boundedInt = (value: unknown, fallback: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number.isFinite(value as number) ? Number(value) : fallback)));

const text = (value: unknown, fallback: string, max = 120) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

const percentage = (value: unknown, fallback: number) => boundedInt(value, fallback, 0, 100);

function normalizeLeader(
  value: Partial<ContinuanceOperationalState["militaryCommander"]> | undefined,
  fallback: ContinuanceOperationalState["militaryCommander"],
) {
  return {
    name: text(value?.name, fallback.name, 80),
    role: text(value?.role, fallback.role, 80),
    authority: percentage(value?.authority, fallback.authority),
    approval: percentage(value?.approval, fallback.approval),
    loyalty: percentage(value?.loyalty, fallback.loyalty),
    succession: text(value?.succession, fallback.succession, 120),
  };
}

/** Purely normalizes untrusted saves; it neither progresses a plan nor changes discovery. */
export function normalizeContinuanceOperational(value: ContinuanceOperationalInput | null | undefined): ContinuanceOperationalState {
  const source = value ?? {};
  const cohorts: Partial<ContinuanceOperationalState["cohorts"]> = source.cohorts ?? {};
  const housing = boundedInt(source.bunker?.housing, DEFAULT_CONTINUANCE_OPERATIONAL.bunker.housing, 1, 50000);
  const capacity = Math.max(housing, boundedInt(source.bunker?.capacity, DEFAULT_CONTINUANCE_OPERATIONAL.bunker.capacity, 1, 50000));
  const dependents = boundedInt(cohorts.dependents, DEFAULT_CONTINUANCE_OPERATIONAL.cohorts.dependents, 0, housing);
  const workers = boundedInt(cohorts.workers, DEFAULT_CONTINUANCE_OPERATIONAL.cohorts.workers, 0, housing - dependents);
  const administrators = boundedInt(cohorts.administrators, DEFAULT_CONTINUANCE_OPERATIONAL.cohorts.administrators, 0, housing - dependents - workers);
  const activeDuty = boundedInt(cohorts.activeDuty, DEFAULT_CONTINUANCE_OPERATIONAL.cohorts.activeDuty, 0, housing - dependents - workers - administrators);
  const reserves = boundedInt(cohorts.reserves, DEFAULT_CONTINUANCE_OPERATIONAL.cohorts.reserves, 0, housing - dependents - workers - administrators - activeDuty);
  const command = boundedInt(cohorts.command, DEFAULT_CONTINUANCE_OPERATIONAL.cohorts.command, 0, housing - dependents - workers - administrators - activeDuty - reserves);
  const totalSurvivors = dependents + workers + administrators + activeDuty + reserves + command;
  const plan = source.restorationPlan ?? {};
  const targets = Array.isArray(plan.targetRegions)
    ? plan.targetRegions.filter((target): target is string => typeof target === "string" && target.trim().length > 0).slice(0, 8).map((target) => target.trim().slice(0, 80))
    : [...DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.targetRegions];

  return {
    cohorts: { totalSurvivors, dependents, workers, administrators, activeDuty, reserves, command },
    bunker: {
      capacity,
      food: percentage(source.bunker?.food, DEFAULT_CONTINUANCE_OPERATIONAL.bunker.food),
      water: percentage(source.bunker?.water, DEFAULT_CONTINUANCE_OPERATIONAL.bunker.water),
      power: percentage(source.bunker?.power, DEFAULT_CONTINUANCE_OPERATIONAL.bunker.power),
      air: percentage(source.bunker?.air, DEFAULT_CONTINUANCE_OPERATIONAL.bunker.air),
      housing,
    },
    industry: { capacity: percentage(source.industry?.capacity, DEFAULT_CONTINUANCE_OPERATIONAL.industry.capacity), output: percentage(source.industry?.output, DEFAULT_CONTINUANCE_OPERATIONAL.industry.output) },
    weapons: { readiness: percentage(source.weapons?.readiness, DEFAULT_CONTINUANCE_OPERATIONAL.weapons.readiness), stockpile: percentage(source.weapons?.stockpile, DEFAULT_CONTINUANCE_OPERATIONAL.weapons.stockpile) },
    morale: percentage(source.morale, DEFAULT_CONTINUANCE_OPERATIONAL.morale),
    legitimacy: percentage(source.legitimacy, DEFAULT_CONTINUANCE_OPERATIONAL.legitimacy),
    secrecy: percentage(source.secrecy, DEFAULT_CONTINUANCE_OPERATIONAL.secrecy),
    intelligenceReach: percentage(source.intelligenceReach, DEFAULT_CONTINUANCE_OPERATIONAL.intelligenceReach),
    reclamationCapability: percentage(source.reclamationCapability, DEFAULT_CONTINUANCE_OPERATIONAL.reclamationCapability),
    militaryCommander: normalizeLeader(source.militaryCommander, DEFAULT_CONTINUANCE_OPERATIONAL.militaryCommander),
    civilianPresident: normalizeLeader(source.civilianPresident, DEFAULT_CONTINUANCE_OPERATIONAL.civilianPresident),
    doctrine: text(source.doctrine, DEFAULT_CONTINUANCE_OPERATIONAL.doctrine, 180),
    restorationPlan: {
      planning: percentage(plan.planning, DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.planning),
      infiltration: percentage(plan.infiltration, DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.infiltration),
      reconnaissance: percentage(plan.reconnaissance, DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.reconnaissance),
      mobilization: percentage(plan.mobilization, DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.mobilization),
      targetRegions: targets,
      readinessThresholds: {
        infiltration: percentage(plan.readinessThresholds?.infiltration, DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.readinessThresholds.infiltration),
        reconnaissance: percentage(plan.readinessThresholds?.reconnaissance, DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.readinessThresholds.reconnaissance),
        mobilization: percentage(plan.readinessThresholds?.mobilization, DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.readinessThresholds.mobilization),
      },
      discoveryRisk: percentage(plan.discoveryRisk, DEFAULT_CONTINUANCE_OPERATIONAL.restorationPlan.discoveryRisk),
    },
    discoveryStage: boundedInt(source.discoveryStage, DEFAULT_CONTINUANCE_OPERATIONAL.discoveryStage, 0, 4) as 0 | 1 | 2 | 3 | 4,
  };
}

/** Checks the bounded invariants after normalization or for callers accepting external input. */
export function isValidContinuanceOperational(value: unknown): value is ContinuanceOperationalState {
  if (!value || typeof value !== "object") return false;
  const normalized = normalizeContinuanceOperational(value as Partial<ContinuanceOperationalState>);
  const raw = value as ContinuanceOperationalState;
  return raw.cohorts?.totalSurvivors === normalized.cohorts.totalSurvivors
    && raw.cohorts.totalSurvivors <= raw.bunker.housing
    && raw.bunker.capacity >= raw.bunker.housing;
}

/** Removes operationally sensitive plan and command details for non-cleared presentation. */
export function redactContinuanceOperational(value: ContinuanceOperationalInput | null | undefined): ContinuanceOperationalState {
  const normalized = normalizeContinuanceOperational(value);
  return {
    ...normalized,
    militaryCommander: { ...normalized.militaryCommander, succession: "Classified" },
    civilianPresident: { ...normalized.civilianPresident, succession: "Classified" },
    restorationPlan: { ...normalized.restorationPlan, infiltration: 0, targetRegions: [], readinessThresholds: { infiltration: 0, reconnaissance: 0, mobilization: 0 } },
  };
}

/** Computes visibility only. It never mutates state or begins a restoration campaign. */
export function getEffectiveContinuanceDiscoveryStage(
  value: ContinuanceOperationalInput | null | undefined,
  discoveredLocationIds: readonly string[] | null | undefined,
  securityLevel: unknown,
): 0 | 1 | 2 | 3 | 4 {
  const base = normalizeContinuanceOperational(value).discoveryStage;
  const locationStage = Array.isArray(discoveredLocationIds) && discoveredLocationIds.includes(CONTINUANCE_ID) ? 1 : 0;
  const security = percentage(securityLevel, 0);
  const intelligenceStage = security >= 95 ? 4 : security >= 80 ? 3 : security >= 65 ? 2 : security >= 40 ? 1 : 0;
  return Math.max(base, locationStage, intelligenceStage) as 0 | 1 | 2 | 3 | 4;
}

/** Refreshes only canonical identity and structure; diplomacy, control, trade, and activity remain save-owned. */
export function applyCanonicalContinuancePresentation<T extends ExternalMegacity>(entity: T): T {
  if (entity.id !== CONTINUANCE_ID) return entity;
  return {
    ...entity,
    ...CONTINUANCE_PRESENTATION,
    continuance: normalizeContinuanceOperational(entity.continuance),
    leader: undefined,
    voiceLines: undefined,
  } as T;
}
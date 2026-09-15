// Unified interaction menu — personal-action catalog and helpers.
//
// This is the small, new layer that sits ON TOP of the existing engines for the
// Crusader-Kings-style unified interaction menu (Task #382). The faction
// diplomacy actions (EVENT_ONLY_ACTION_RULES in diplomacyEngine.ts) and the
// deep advisor/bodyguard dialogues are reused as-is; this module only adds the
// handful of new *personal* verbs that can be aimed at either a faction's
// leadership, one of your own officers, a retinue captain, or the population
// as a single political audience. "leader" is a named faction leader
// (resolved through the faction record); "civic" is a named civic officer.
//
// Everything here is pure and framework-free so it can be unit tested. The
// actual state mutation lives in context/GameContext.tsx (performPersonal
// Interaction), which reads these definitions.

import type { DiplomaticActionEffects, EventOnlyActionId } from "./diplomacyEngine";
import { computePopulationCohorts } from "./populationCohorts";
import type {
  CohortStewardshipHistoryEntry,
  CohortStewardshipTargetId,
  DistrictCommandHistoryEntry,
  GameState,
  GameMessage,
  Resources,
  TickEntry,
} from "./types";
export type { CohortStewardshipTargetId } from "./types";

export type InteractionVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "warning"
  | "muted";

// Three kinds of actor can be pointed at. A faction target engages the faction's
// leadership (loyalty / influence / threat); an officer target engages one of
// your own people (loyalty / fear / corruption); and a captain target engages
// a retinue leader (loyalty).
export type InteractionTargetKind =
  | "faction"
  | "leader"
  | "officer"
  | "civic"
  | "captain"
  | "population"
  | "cohort"
  | "district";

export type PersonalInteractionTarget =
  | { kind: "cohort"; id: CohortStewardshipTargetId }
  | { kind: Exclude<InteractionTargetKind, "cohort">; id: string };

export type PersonalActionId =
  | "give-gift"
  | "flatter"
  | "grant-favor"
  | "bribe"
  | "threaten"
  | "promise-reform"
  | "share-secrets"
  | "bind-by-debt"
  | "public-humiliation"
  | "address-the-masses"
  | "ration-and-reassure"
  | "surveillance-sweep"
  | "collective-punishment"
  | "declare-amnesty"
  | "compulsory-civic-service"
  | "weaponize-scarcity"
  | "stage-public-tribunals"
  | "population-transfer-orders"
  | "district-pressure"
  | "district-reassure"
  | "district-lay-low"
  | "district-surveil"
  | "district-pardon"
  | "shelter-outreach"
  | "medical-mission"
  | "workforce-placement"
  | "industrial-apprenticeship"
  | "penal-labor-quota"
  | "executive-extraction"
  | "ration-enforcement"
  | "detention-crackdown";

export type CohortStewardshipApproach =
  | "humanitarian"
  | "technocratic"
  | "exploitative"
  | "coercive";

export type CohortCondition = {
  cohortAtLeast?: number;
  cityStats?: Partial<Record<keyof GameState["cityStats"], { atLeast?: number; atMost?: number }>>;
  demographics?: Partial<Record<keyof GameState["demographics"], { atLeast?: number; atMost?: number }>>;
  resources?: Partial<Record<keyof Resources, { atLeast?: number; atMost?: number }>>;
  buildings?: Record<string, { atLeast?: number; atMost?: number }>;
};

export type CohortPersonalEffect = {
  cityStats?: Partial<Record<keyof GameState["cityStats"], number>>;
  demographics?: Partial<Record<keyof GameState["demographics"], number>>;
  resources?: Partial<Record<keyof Resources, number>>;
};

export type CohortFactionReaction = FactionPersonalEffect;

// Effect shapes are declared per target kind because a faction and an officer
// expose different relationship fields. Keeping them separate (rather than one
// loose bag) means the reducer can apply exactly the fields that exist on each
// actor with no silent no-ops.
export type FactionPersonalEffect = {
  loyalty?: number;
  influence?: number;
  threat?: number;
};

export type OfficerPersonalEffect = {
  loyalty?: number;
  fearFactor?: number;
  corruption?: number;
  popularity?: number;
};

export type CaptainPersonalEffect = {
  loyalty?: number;
};

export type PopulationPersonalEffect = {
  happiness?: number;
  unrest?: number;
  crime?: number;
  lawOrder?: number;
  corruption?: number;
};

// District commands deliberately operate on the district record alone. They
// never proxy changes into cityStats, demographics, or global resources beyond
// their stated credit cost.
export type DistrictPersonalEffect = {
  population?: number;
  crime?: number;
  unrest?: number;
  loyalty?: number;
  infraQuality?: number;
  defenseRating?: number;
  wealth?: number;
  gangInfluence?: number;
};

export type DistrictConditionField =
  | "crime"
  | "unrest"
  | "loyalty"
  | "infraQuality"
  | "gangInfluence"
  | "wealth";

export type DistrictCondition = {
  field: DistrictConditionField;
  operator: "atLeast" | "atMost";
  value: number;
};

export type DistrictConditionGroup = {
  mode: "all" | "any";
  conditions: readonly DistrictCondition[];
};

/** Conditions are grouped so a command can require infrastructure plus one of
 * several local problems without duplicating gate logic in the screen. */
export type DistrictPrerequisite = {
  groups: readonly DistrictConditionGroup[];
};

export type DistrictUnderworldHeatBand = "quiet" | "watched" | "burning";

export type DistrictUnderworldHeat = {
  band: DistrictUnderworldHeatBand;
  label: "Quiet" | "Watched" | "Burning";
  score: number;
};

/**
 * Underworld heat is a presentation signal, not another persisted stat.
 * The higher of crime and gang influence keeps either visible pressure source
 * from disappearing inside an average.
 */
export function getDistrictUnderworldHeat(
  district: Pick<GameState["districts"][number], "crime" | "gangInfluence">,
): DistrictUnderworldHeat {
  const score = Math.max(
    0,
    Math.min(100, Math.round(Math.max(district.crime, district.gangInfluence))),
  );
  if (score >= 60) return { band: "burning", label: "Burning", score };
  if (score >= 30) return { band: "watched", label: "Watched", score };
  return { band: "quiet", label: "Quiet", score };
}

// Named faction leaders and civic figures deliberately reuse only the
// relationship fields their backing records already expose. The aliases keep
// the catalog readable while preserving the actor-specific effect contract.
export type LeaderPersonalEffect = FactionPersonalEffect;
export type CivicPersonalEffect = OfficerPersonalEffect;

export type PersonalActionDef = {
  id: PersonalActionId;
  label: string;
  description: string;
  variant: InteractionVariant;
  // Credit cost. 0 means free (words / deeds rather than money).
  cost: number;
  // Per-target cooldown in ticks (Task #393). Every verb has one so none can
  // be spammed against the same person; the free verbs carry the longest
  // cooldowns because credits are not gating them.
  cooldownTicks: number;
  faction: FactionPersonalEffect;
  leader: LeaderPersonalEffect;
  officer: OfficerPersonalEffect;
  civic: CivicPersonalEffect;
  captain: CaptainPersonalEffect;
  population: PopulationPersonalEffect;
  district?: DistrictPersonalEffect;
  districtPrerequisite?: DistrictPrerequisite;
  /** Optional cohort stewardship contract. Cohort actions never use derived
   * populationCohorts as writable state; this is only a requirement/effect
   * declaration read by the pure reducer below. */
  approach?: CohortStewardshipApproach;
  cohortTargets?: readonly CohortStewardshipTargetId[];
  requirements?: CohortCondition;
  cohort?: CohortPersonalEffect;
  factionReaction?: CohortFactionReaction;
};

// The personal-verb catalog. Small on purpose — the plan defers the heavier
// covert / ideological / military tiers. Each verb reads clearly against both
// target kinds and trades off along a different axis (credits vs. goodwill vs.
// intimidation) so no verb is strictly better than another.
export const PERSONAL_ACTIONS: Record<PersonalActionId, PersonalActionDef> = {
  "give-gift": {
    id: "give-gift",
    label: "GIVE GIFT",
    description: "A considered gift. Warms relations at a modest cost.",
    variant: "primary",
    cost: 1500,
    cooldownTicks: 12,
    faction: { loyalty: 8, influence: 2 },
    leader: { loyalty: 8, influence: 2 },
    officer: { loyalty: 8 },
    civic: { loyalty: 8 },
    captain: { loyalty: 8 },
    population: {},
  },
  "flatter": {
    id: "flatter",
    label: "FLATTER",
    description: "Public praise. Cheap, and it lands — for a while.",
    variant: "secondary",
    cost: 0,
    cooldownTicks: 16,
    faction: { loyalty: 3 },
    leader: { loyalty: 3 },
    officer: { loyalty: 3 },
    civic: { loyalty: 3 },
    captain: { loyalty: 3 },
    population: {},
  },
  "grant-favor": {
    id: "grant-favor",
    label: "GRANT FAVOR",
    description: "Do them a quiet good turn. Costs no credits, buys real goodwill.",
    variant: "secondary",
    cost: 0,
    cooldownTicks: 24,
    faction: { loyalty: 7, threat: -2 },
    leader: { loyalty: 7, threat: -2 },
    officer: { loyalty: 7 },
    civic: { loyalty: 7 },
    captain: { loyalty: 7 },
    population: {},
  },
  "bribe": {
    id: "bribe",
    label: "BRIBE",
    description: "Credits under the table. Buys compliance, breeds corruption.",
    variant: "warning",
    cost: 3000,
    cooldownTicks: 16,
    faction: { loyalty: 6, influence: 4, threat: -2 },
    leader: { loyalty: 6, influence: 4, threat: -2 },
    officer: { loyalty: 6, corruption: 6 },
    civic: { loyalty: 6, corruption: 6 },
    captain: { loyalty: 6 },
    population: {},
  },
  "threaten": {
    id: "threaten",
    label: "THREATEN",
    description: "A pointed warning. They fall in line, but they remember it.",
    variant: "warning",
    cost: 0,
    cooldownTicks: 24,
    faction: { threat: -8, loyalty: -3 },
    leader: { threat: -8, loyalty: -3 },
    officer: { fearFactor: 8, loyalty: -3 },
    civic: { fearFactor: 8, loyalty: -3 },
    captain: { loyalty: -3 },
    population: {},
  },
  "promise-reform": {
    id: "promise-reform",
    label: "PROMISE REFORM",
    description: "Offer a future the regime may never deliver. Hope buys time, and scrutiny.",
    variant: "secondary",
    cost: 0,
    cooldownTicks: 24,
    faction: { loyalty: 4, influence: 1 },
    leader: { loyalty: 4, influence: 1 },
    officer: { loyalty: 4, popularity: 3 },
    civic: { loyalty: 4, popularity: 3 },
    captain: { loyalty: 4 },
    population: {},
  },
  "share-secrets": {
    id: "share-secrets",
    label: "SHARE SECRETS",
    description: "Trade a piece of restricted intelligence for leverage. Trust is a currency too.",
    variant: "warning",
    cost: 1000,
    cooldownTicks: 16,
    faction: { influence: 6, threat: 2 },
    leader: { influence: 6, threat: 2 },
    officer: { loyalty: 4, corruption: 2 },
    civic: { loyalty: 4, corruption: 2 },
    captain: { loyalty: 3 },
    population: {},
  },
  "bind-by-debt": {
    id: "bind-by-debt",
    label: "BIND BY DEBT",
    description: "Make an expensive concession they will be expected to repay.",
    variant: "primary",
    cost: 4500,
    cooldownTicks: 16,
    faction: { loyalty: 10, threat: -3 },
    leader: { loyalty: 10, threat: -3 },
    officer: { loyalty: 8, corruption: 4 },
    civic: { loyalty: 8, corruption: 4 },
    captain: { loyalty: 8 },
    population: {},
  },
  "public-humiliation": {
    id: "public-humiliation",
    label: "PUBLIC HUMILIATION",
    description: "Break their standing in front of the city. Fear fills the space where loyalty was.",
    variant: "danger",
    cost: 0,
    cooldownTicks: 32,
    faction: { loyalty: -6, threat: -5 },
    leader: { loyalty: -6, threat: -5 },
    officer: { loyalty: -6, fearFactor: 10 },
    civic: { loyalty: -6, fearFactor: 10 },
    captain: { loyalty: -6 },
    population: {},
  },
  "address-the-masses": {
    id: "address-the-masses",
    label: "ADDRESS THE MASSES",
    description: "Take the broadcast towers. Promise survival in a voice everyone can hear.",
    variant: "primary",
    cost: 0,
    cooldownTicks: 24,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: { happiness: 5, unrest: -4 },
  },
  "ration-and-reassure": {
    id: "ration-and-reassure",
    label: "RATION & REASSURE",
    description: "Buy a calmer queue with emergency relief and a carefully edited announcement.",
    variant: "secondary",
    cost: 2000,
    cooldownTicks: 20,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: { happiness: 2, unrest: -6, corruption: 1 },
  },
  "surveillance-sweep": {
    id: "surveillance-sweep",
    label: "SURVEILLANCE SWEEP",
    description: "Put every camera on the streets. Crime drops; privacy becomes a historical term.",
    variant: "warning",
    cost: 5000,
    cooldownTicks: 32,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: { crime: -8, lawOrder: 8, happiness: -4, corruption: 2 },
  },
  "collective-punishment": {
    id: "collective-punishment",
    label: "COLLECTIVE PUNISHMENT",
    description: "Make one district answer for another. Order returns before anyone forgives you.",
    variant: "danger",
    cost: 0,
    cooldownTicks: 40,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: { unrest: -10, crime: -5, happiness: -10, lawOrder: 10, corruption: 4 },
  },
  "declare-amnesty": {
    id: "declare-amnesty",
    label: "DECLARE AMNESTY",
    description: "Open the gates for minor offenders. Mercy lowers the temperature, but invites opportunists.",
    variant: "secondary",
    cost: 3000,
    cooldownTicks: 40,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: { unrest: -8, happiness: 3, crime: 3 },
  },
  "compulsory-civic-service": {
    id: "compulsory-civic-service",
    label: "COMPULSORY CIVIC SERVICE",
    description: "Assign every able resident a state duty. The city gets orderly hands at the price of willing hearts.",
    variant: "warning",
    cost: 0,
    cooldownTicks: 28,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: { crime: -3, lawOrder: 6, happiness: -5, corruption: 2 },
  },
  "weaponize-scarcity": {
    id: "weaponize-scarcity",
    label: "WEAPONIZE SCARCITY",
    description: "Reward compliant blocks first and let the defiant watch the ration lines close.",
    variant: "danger",
    cost: 0,
    cooldownTicks: 48,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: { unrest: -9, crime: 4, happiness: -14, corruption: 5 },
  },
  "stage-public-tribunals": {
    id: "stage-public-tribunals",
    label: "STAGE PUBLIC TRIBUNALS",
    description: "Turn punishment into nightly theatre. Fear sharpens obedience while grievance spreads backstage.",
    variant: "danger",
    cost: 0,
    cooldownTicks: 56,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: { crime: -8, lawOrder: 7, happiness: -12, unrest: 3, corruption: 6 },
  },
  "population-transfer-orders": {
    id: "population-transfer-orders",
    label: "POPULATION TRANSFER ORDERS",
    description: "Reassign households by decree until every troublesome neighborhood is administratively quiet.",
    variant: "danger",
    cost: 8000,
    cooldownTicks: 64,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: { unrest: -7, crime: -4, lawOrder: 8, happiness: -9, corruption: 5 },
  },
  "district-pressure": {
    id: "district-pressure",
    label: "SEAL THE BLOCK",
    description: "Enforce a hard cordon. The streets quiet down; the ward pays for it.",
    variant: "danger",
    cost: 0,
    cooldownTicks: 40,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: {},
    district: { crime: -8, unrest: -6, loyalty: -9, population: -250, defenseRating: 6 },
    districtPrerequisite: {
      groups: [{
        mode: "any",
        conditions: [
          { field: "crime", operator: "atLeast", value: 60 },
          { field: "unrest", operator: "atLeast", value: 60 },
        ],
      }],
    },
  },
  "district-reassure": {
    id: "district-reassure",
    label: "RELIEF ALLOCATION",
    description: "Route relief through loyal hands. Stability improves; the local treasury thins.",
    variant: "primary",
    cost: 4000,
    cooldownTicks: 28,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: {},
    district: { population: 180, unrest: -8, loyalty: 7, infraQuality: 4, wealth: -5 },
    districtPrerequisite: {
      groups: [{
        mode: "any",
        conditions: [
          { field: "unrest", operator: "atLeast", value: 30 },
          { field: "wealth", operator: "atMost", value: 25 },
          { field: "loyalty", operator: "atMost", value: 35 },
          { field: "infraQuality", operator: "atMost", value: 40 },
        ],
      }],
    },
  },
  "district-lay-low": {
    id: "district-lay-low",
    label: "LAY LOW",
    description: "Pull the crews off the streets and let the ward cool down. Reach and visibility fall with the heat.",
    variant: "secondary",
    cost: 3500,
    cooldownTicks: 32,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: {},
    district: { crime: -6, gangInfluence: -8 },
    districtPrerequisite: {
      groups: [{
        mode: "any",
        conditions: [
          { field: "crime", operator: "atLeast", value: 30 },
          { field: "gangInfluence", operator: "atLeast", value: 30 },
        ],
      }],
    },
  },
  "district-surveil": {
    id: "district-surveil",
    label: "GRID SWEEP",
    description: "Flood the ward with eyes. Crime contracts while trust and commerce retreat.",
    variant: "warning",
    cost: 6000,
    cooldownTicks: 36,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: {},
    district: { crime: -12, unrest: 4, loyalty: -5, defenseRating: 4, wealth: -3 },
    districtPrerequisite: {
      groups: [
        {
          mode: "all",
          conditions: [{ field: "infraQuality", operator: "atLeast", value: 50 }],
        },
        {
          mode: "any",
          conditions: [
            { field: "crime", operator: "atLeast", value: 30 },
            { field: "gangInfluence", operator: "atLeast", value: 30 },
          ],
        },
      ],
    },
  },
  "district-pardon": {
    id: "district-pardon",
    label: "CASEFILE AMNESTY",
    description: "Erase minor files and release the queue. The ward exhales; opportunists notice.",
    variant: "secondary",
    cost: 2500,
    cooldownTicks: 44,
    faction: {},
    leader: {},
    officer: {},
    civic: {},
    captain: {},
    population: {},
    district: { unrest: -10, loyalty: 8, crime: 5, wealth: -2, defenseRating: -3 },
    districtPrerequisite: {
      groups: [{
        mode: "any",
        conditions: [
          { field: "crime", operator: "atLeast", value: 30 },
          { field: "unrest", operator: "atLeast", value: 30 },
        ],
      }],
    },
  },
  "shelter-outreach": {
    id: "shelter-outreach",
    label: "SHELTER OUTREACH",
    description: "Route food and goods to residents without shelter.",
    variant: "primary",
    cost: 0,
    cooldownTicks: 32,
    faction: { loyalty: 1 }, leader: {}, officer: {}, civic: {}, captain: {}, population: {},
    approach: "humanitarian",
    cohortTargets: ["homeless"],
    requirements: { cohortAtLeast: 1000, cityStats: { housingPressure: { atLeast: 20 } }, resources: { food: { atLeast: 100 }, goods: { atLeast: 20 } } },
    cohort: {
      cityStats: { housingPressure: -8, happiness: 4, unrest: -6, employment: 1 },
      resources: { food: -100, goods: -20 },
    },
    factionReaction: { loyalty: 3, influence: 1, threat: -1 },
  },
  "medical-mission": {
    id: "medical-mission",
    label: "MEDICAL MISSION",
    description: "Deploy clinics and medicine to the active care cohort.",
    variant: "primary",
    cost: 0,
    cooldownTicks: 36,
    faction: { loyalty: 1 }, leader: {}, officer: {}, civic: {}, captain: {}, population: {},
    approach: "humanitarian",
    cohortTargets: ["sick"],
    requirements: { cohortAtLeast: 500, cityStats: { diseaseRisk: { atLeast: 20 } }, resources: { medSupplies: { atLeast: 30 } } },
    cohort: {
      cityStats: { diseaseRisk: -8, publicHealth: 8, happiness: 2, unrest: -2 },
      resources: { medSupplies: -30 },
    },
    factionReaction: { loyalty: 2, influence: 2, threat: -1 },
  },
  "workforce-placement": {
    id: "workforce-placement",
    label: "WORKFORCE PLACEMENT",
    description: "Match unemployed residents to open shifts and services.",
    variant: "primary",
    cost: 0,
    cooldownTicks: 28,
    faction: { loyalty: 1 }, leader: {}, officer: {}, civic: {}, captain: {}, population: {},
    approach: "technocratic",
    cohortTargets: ["unemployed"],
    requirements: {
      cohortAtLeast: 1000,
      demographics: { unemploymentRate: { atLeast: 5 } },
      cityStats: { employment: { atMost: 90 } },
      resources: { goods: { atLeast: 15 } },
    },
    cohort: {
      cityStats: { employment: 8, happiness: 3, unrest: -4, industrialOutput: 4 },
      resources: { goods: -15 },
    },
    factionReaction: { loyalty: 4, influence: 2, threat: -1 },
  },
  "industrial-apprenticeship": {
    id: "industrial-apprenticeship",
    label: "INDUSTRIAL APPRENTICESHIP",
    description: "Convert available workers into trained industrial capacity.",
    variant: "secondary",
    cost: 0,
    cooldownTicks: 40,
    faction: { loyalty: 1 }, leader: {}, officer: {}, civic: {}, captain: {}, population: {},
    approach: "technocratic",
    cohortTargets: ["workers"],
    requirements: { cohortAtLeast: 1000, cityStats: { employment: { atLeast: 30 } }, resources: { steel: { atLeast: 40 } } },
    cohort: {
      cityStats: { industrialOutput: 8, education: 5, employment: 2, happiness: 1 },
      resources: { steel: -40, goods: 25 },
    },
    factionReaction: { loyalty: 2, influence: 4, threat: 1 },
  },
  "penal-labor-quota": {
    id: "penal-labor-quota",
    label: "PENAL LABOR QUOTA",
    description: "Assign detention labor to state production targets.",
    variant: "warning",
    cost: 0,
    cooldownTicks: 48,
    faction: { loyalty: 1 }, leader: {}, officer: {}, civic: {}, captain: {}, population: {},
    approach: "exploitative",
    cohortTargets: ["prisoners"],
    requirements: { cohortAtLeast: 100, buildings: { correctionalWorkCamps: { atLeast: 1 } } },
    cohort: {
      cityStats: { industrialOutput: 8, employment: 2, unrest: 6, happiness: -7, corruption: 5 },
      resources: { steel: 80, goods: 40 },
    },
    factionReaction: { loyalty: -3, influence: 2, threat: 4 },
  },
  "executive-extraction": {
    id: "executive-extraction",
    label: "EXECUTIVE EXTRACTION",
    description: "Tax elite reserves immediately and accept the investment chill.",
    variant: "danger",
    cost: 0,
    cooldownTicks: 56,
    faction: { loyalty: 1 }, leader: {}, officer: {}, civic: {}, captain: {}, population: {},
    approach: "exploitative",
    cohortTargets: ["elites"],
    requirements: { cohortAtLeast: 1000, cityStats: { corruption: { atMost: 85 } } },
    cohort: {
      cityStats: { corruption: 8, crime: 3, unrest: 4, happiness: -5, employment: -2 },
      resources: { credits: 12000 },
    },
    factionReaction: { loyalty: -2, influence: 5, threat: 2 },
  },
  "ration-enforcement": {
    id: "ration-enforcement",
    label: "RATION ENFORCEMENT",
    description: "Prioritize compliant intake lines and enforce ration discipline.",
    variant: "warning",
    cost: 0,
    cooldownTicks: 44,
    faction: { loyalty: 1 }, leader: {}, officer: {}, civic: {}, captain: {}, population: {},
    approach: "coercive",
    cohortTargets: ["refugees"],
    requirements: { cohortAtLeast: 1000, cityStats: { unrest: { atLeast: 20 } }, resources: { food: { atLeast: 60 } } },
    cohort: {
      cityStats: { unrest: -8, crime: -3, happiness: -6, lawOrder: 7, corruption: 3 },
      resources: { food: -60 },
    },
    factionReaction: { loyalty: -4, influence: 1, threat: 5 },
  },
  "detention-crackdown": {
    id: "detention-crackdown",
    label: "DETENTION CRACKDOWN",
    description: "Increase controls around detention and prisoner release.",
    variant: "danger",
    cost: 0,
    cooldownTicks: 52,
    faction: { loyalty: 1 }, leader: {}, officer: {}, civic: {}, captain: {}, population: {},
    approach: "coercive",
    cohortTargets: ["prisoners"],
    requirements: { cohortAtLeast: 100, cityStats: { crime: { atLeast: 40 } }, resources: { ammo: { atLeast: 25 } } },
    cohort: {
      cityStats: { crime: -8, lawOrder: 10, unrest: 8, happiness: -10, corruption: 5 },
      resources: { ammo: -25 },
    },
    factionReaction: { loyalty: -3, influence: 1, threat: 6 },
  },
};

export const PERSONAL_ACTION_ORDER: PersonalActionId[] = [
  "give-gift",
  "flatter",
  "grant-favor",
  "bribe",
  "threaten",
  "promise-reform",
  "share-secrets",
  "bind-by-debt",
  "public-humiliation",
  "address-the-masses",
  "ration-and-reassure",
  "surveillance-sweep",
  "collective-punishment",
  "declare-amnesty",
  "compulsory-civic-service",
  "weaponize-scarcity",
  "stage-public-tribunals",
  "population-transfer-orders",
  "district-pressure",
  "district-reassure",
  "district-lay-low",
  "district-surveil",
  "district-pardon",
  "shelter-outreach",
  "medical-mission",
  "workforce-placement",
  "industrial-apprenticeship",
  "penal-labor-quota",
  "executive-extraction",
  "ration-enforcement",
  "detention-crackdown",
];

export const COHORT_STEWARDSHIP_ACTION_ORDER: PersonalActionId[] = [
  "shelter-outreach",
  "medical-mission",
  "workforce-placement",
  "industrial-apprenticeship",
  "penal-labor-quota",
  "executive-extraction",
  "ration-enforcement",
  "detention-crackdown",
];
export const COHORT_STEWARDSHIP_TARGETS: readonly CohortStewardshipTargetId[] = [
  "homeless", "refugees", "prisoners", "sick", "workers", "unemployed", "elites",
];

export function getCohortStewardshipActions(
  target?: CohortStewardshipTargetId,
): PersonalActionId[] {
  return COHORT_STEWARDSHIP_ACTION_ORDER.filter((id) =>
    target === undefined || PERSONAL_ACTIONS[id].cohortTargets?.includes(target),
  );
}

export const PERSONAL_ACTOR_ACTION_ORDER: PersonalActionId[] = [
  "give-gift",
  "flatter",
  "grant-favor",
  "bribe",
  "threaten",
  "promise-reform",
  "share-secrets",
  "bind-by-debt",
  "public-humiliation",
];

export const PERSONAL_POPULATION_ACTION_ORDER: PersonalActionId[] = [
  "address-the-masses",
  "ration-and-reassure",
  "surveillance-sweep",
  "collective-punishment",
  "declare-amnesty",
  "compulsory-civic-service",
  "weaponize-scarcity",
  "stage-public-tribunals",
  "population-transfer-orders",
];

/** District-only command order, exported for the interaction menu surface. */
export const PERSONAL_DISTRICT_ACTION_ORDER: PersonalActionId[] = [
  "district-pressure",
  "district-reassure",
  "district-lay-low",
  "district-surveil",
  "district-pardon",
];

// A quiet stretch of roughly two game days clears the social fatigue from a
// verb. The history is tick-based, like cooldowns, so it remains deterministic
// across saves and offline catch-up regardless of the wall-clock interval.
export const PERSONAL_ACTION_DECAY_WINDOW_TICKS = 96;
export const PERSONAL_ACTION_DECAY_MULTIPLIERS = [1, 0.6, 0.3, 0.25] as const;
const PERSONAL_ACTION_HISTORY_MAX_USES = 8;
// A full city can contain hundreds of districts. Four command verbs per ward,
// plus actor and diplomacy entries, fit comfortably below this durable cap.
export const PERSONAL_ACTION_STORE_KEY_CAP = 2_000;
export const DISTRICT_COMMAND_HISTORY_CAP = 200;
export const COHORT_STEWARDSHIP_HISTORY_CAP = 200;

export type PersonalActionHistory = Record<string, number[]>;

export function stampCohortStewardshipHistory(
  history: GameState["cohortStewardshipHistory"] | undefined,
  entry: CohortStewardshipHistoryEntry,
): CohortStewardshipHistoryEntry[] {
  return [...(history ?? []), entry].slice(-COHORT_STEWARDSHIP_HISTORY_CAP);
}

export function stampDistrictCommandHistory(
  history: GameState["districtCommandHistory"] | undefined,
  entry: DistrictCommandHistoryEntry,
): DistrictCommandHistoryEntry[] {
  return [...(history ?? []), entry].slice(-DISTRICT_COMMAND_HISTORY_CAP);
}

export type PersonalActionPreviewContext = {
  target: PersonalInteractionTarget;
  history?: PersonalActionHistory;
  totalTicks: number;
};

/**
 * Return the current strength of a verb for this target. The first use is
 * full strength; repeats in the recent window step down to 60%, 30%, then a
 * 25% floor. Uses outside the window do not contribute to fatigue.
 */
export function personalActionDecayMultiplier(
  history: PersonalActionHistory | undefined,
  target: PersonalInteractionTarget,
  id: PersonalActionId,
  totalTicks: number,
): number {
  const uses = history?.[personalCooldownKey(target, id)];
  if (!Array.isArray(uses)) return PERSONAL_ACTION_DECAY_MULTIPLIERS[0];
  const cutoff = totalTicks - PERSONAL_ACTION_DECAY_WINDOW_TICKS;
  const recentUses = uses.filter(
    (tick) =>
      typeof tick === "number" &&
      Number.isFinite(tick) &&
      tick >= cutoff &&
      tick <= totalTicks,
  ).length;
  return PERSONAL_ACTION_DECAY_MULTIPLIERS[
    Math.min(recentUses, PERSONAL_ACTION_DECAY_MULTIPLIERS.length - 1)
  ];
}

/**
 * Record a successful use and discard old entries so this state stays small.
 */
export function stampPersonalActionHistory(
  history: PersonalActionHistory | undefined,
  target: PersonalInteractionTarget,
  id: PersonalActionId,
  totalTicks: number,
): PersonalActionHistory {
  const cutoff = totalTicks - PERSONAL_ACTION_DECAY_WINDOW_TICKS;
  const next: PersonalActionHistory = {};
  const currentKey = personalCooldownKey(target, id);
  const entryLimit = Object.prototype.hasOwnProperty.call(history ?? {}, currentKey)
    ? PERSONAL_ACTION_STORE_KEY_CAP
    : PERSONAL_ACTION_STORE_KEY_CAP - 1;
  let entryCount = 0;
  for (const [key, uses] of Object.entries(history ?? {})) {
    if (entryCount >= entryLimit) break;
    if (!Array.isArray(uses)) continue;
    const recent = uses.filter(
      (tick) =>
        typeof tick === "number" &&
        Number.isFinite(tick) &&
        tick >= cutoff &&
        tick <= totalTicks,
    );
    if (recent.length > 0) {
      next[key] = recent.slice(-PERSONAL_ACTION_HISTORY_MAX_USES);
      entryCount++;
    }
  }
  next[currentKey] = [...(next[currentKey] ?? []), totalTicks].slice(-PERSONAL_ACTION_HISTORY_MAX_USES);
  return next;
}

function scalePersonalActionEffect(
  effect: FactionPersonalEffect | OfficerPersonalEffect | PopulationPersonalEffect | DistrictPersonalEffect,
  multiplier: number,
): FactionPersonalEffect | OfficerPersonalEffect | PopulationPersonalEffect | DistrictPersonalEffect {
  const scaled: Record<string, number> = {};
  for (const [key, value] of Object.entries(effect)) {
    if (typeof value === "number") {
      // Relationship stats can be fractional elsewhere in the engine, but
      // avoid exposing floating-point noise such as 1.7999999998 in copy.
      scaled[key] = Math.round(value * multiplier * 100) / 100;
    }
  }
  return scaled as FactionPersonalEffect | OfficerPersonalEffect | PopulationPersonalEffect | DistrictPersonalEffect;
}

function scaleCohortEffect(effect: CohortPersonalEffect, multiplier: number): CohortPersonalEffect {
  const scaleBag = <T extends Record<string, unknown>>(bag: T | undefined): Partial<T> => {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(bag ?? {})) {
      if (typeof value === "number") out[key] = Math.round(value * multiplier * 100) / 100;
    }
    return out as Partial<T>;
  };
  return {
    cityStats: scaleBag(effect.cityStats as Record<string, unknown> | undefined),
    demographics: scaleBag(effect.demographics as Record<string, unknown> | undefined),
    resources: scaleBag(effect.resources as Record<string, unknown> | undefined),
  };
}

const DISTRICT_CONDITION_LABELS: Record<DistrictConditionField, string> = {
  crime: "crime",
  unrest: "unrest",
  loyalty: "loyalty",
  infraQuality: "infrastructure",
  gangInfluence: "gang influence",
  wealth: "wealth",
};

function districtConditionValue(
  district: GameState["districts"][number],
  condition: DistrictCondition,
): number {
  return district[condition.field];
}

function districtConditionSatisfied(
  district: GameState["districts"][number],
  condition: DistrictCondition,
): boolean {
  const current = districtConditionValue(district, condition);
  return condition.operator === "atLeast"
    ? current >= condition.value
    : current <= condition.value;
}

function formatDistrictCondition(condition: DistrictCondition): string {
  const operator = condition.operator === "atLeast" ? "≥" : "≤";
  return `${DISTRICT_CONDITION_LABELS[condition.field]} ${operator} ${condition.value}`;
}

function formatDistrictConditionStatus(
  district: GameState["districts"][number],
  condition: DistrictCondition,
): string {
  return `${DISTRICT_CONDITION_LABELS[condition.field]} ${Math.round(districtConditionValue(district, condition))}`;
}

/**
 * Return the exact local condition blocking a district command, or null when
 * the district qualifies. This is shared by the menu and reducer so a stale
 * menu cannot bypass a local gate.
 */
export function districtPrerequisiteReason(
  id: PersonalActionId,
  district: GameState["districts"][number],
): string | null {
  const prerequisite = PERSONAL_ACTIONS[id].districtPrerequisite;
  if (!prerequisite) return null;

  const blockedGroups = prerequisite.groups.filter((group) => {
    const satisfied = group.conditions.filter((condition) =>
      districtConditionSatisfied(district, condition),
    ).length;
    return group.mode === "all"
      ? satisfied !== group.conditions.length
      : satisfied === 0;
  });
  if (blockedGroups.length === 0) return null;

  const details = blockedGroups.map((group) => {
    const joiner = group.mode === "all" ? " and " : " or ";
    const requirement = group.conditions.map(formatDistrictCondition).join(joiner);
    const current = group.conditions.map((condition) =>
      formatDistrictConditionStatus(district, condition),
    ).join(", ");
    return `Needs ${requirement} (current: ${current})`;
  });
  return details.join("; ");
}

const COHORT_LABELS: Record<CohortStewardshipTargetId, string> = {
  homeless: "homeless",
  refugees: "refugees",
  prisoners: "prisoners",
  sick: "sick residents",
  workers: "workers",
  unemployed: "unemployed residents",
  elites: "elites",
};
const COHORT_TARGET_IDS = new Set<CohortStewardshipTargetId>([
  "homeless", "refugees", "prisoners", "sick", "workers", "unemployed", "elites",
]);

function cohortValue(
  cohorts: ReturnType<typeof computePopulationCohorts>,
  target: CohortStewardshipTargetId,
): number {
  return cohorts[target] ?? 0;
}

function conditionReason(
  state: GameState,
  target: CohortStewardshipTargetId,
  condition: CohortCondition,
): string | null {
  const cohorts = computePopulationCohorts(state);
  const failures: string[] = [];
  if (condition.cohortAtLeast !== undefined && cohortValue(cohorts, target) < condition.cohortAtLeast) {
    failures.push(`Needs ${condition.cohortAtLeast.toLocaleString()} ${COHORT_LABELS[target]} (current: ${Math.round(cohortValue(cohorts, target)).toLocaleString()})`);
  }
  const checkRecord = (
    values: Record<string, unknown>,
    requirements: Record<string, { atLeast?: number; atMost?: number }> | undefined,
  ) => {
    for (const [field, rule] of Object.entries(requirements ?? {})) {
      const value = typeof values[field] === "number" && Number.isFinite(values[field]) ? values[field] as number : 0;
      if (rule.atLeast !== undefined && value < rule.atLeast) failures.push(`Needs ${field} ≥ ${rule.atLeast} (current: ${Math.round(value)})`);
      if (rule.atMost !== undefined && value > rule.atMost) failures.push(`Needs ${field} ≤ ${rule.atMost} (current: ${Math.round(value)})`);
    }
  };
  checkRecord(state.cityStats as unknown as Record<string, unknown>, condition.cityStats as Record<string, { atLeast?: number; atMost?: number }> | undefined);
  checkRecord(state.demographics as unknown as Record<string, unknown>, condition.demographics as Record<string, { atLeast?: number; atMost?: number }> | undefined);
  checkRecord(state.resources as unknown as Record<string, unknown>, condition.resources as Record<string, { atLeast?: number; atMost?: number }> | undefined);
  checkRecord(state.buildings as unknown as Record<string, unknown>, condition.buildings);
  return failures.length > 0 ? failures.join("; ") : null;
}

export function cohortStewardshipPrerequisiteReason(
  id: PersonalActionId,
  target: CohortStewardshipTargetId,
  state: GameState,
): string | null {
  const def = PERSONAL_ACTIONS[id];
  if (!def?.cohortTargets || !def.cohort) return "Not available for this target";
  if (!def.cohortTargets.includes(target)) return "Not available for this cohort";
  return conditionReason(state, target, def.requirements ?? {});
}

/**
 * Apply one personal interaction to a game state.
 *
 * Keeping this transition beside the catalog makes the affordability,
 * cooldown, target-kind, clamping, and message-cap rules testable without
 * importing the React Native provider.
 */
export function applyPersonalInteraction(
  prev: GameState,
  target: PersonalInteractionTarget,
  optionId: PersonalActionId,
  messageCap: number = 200,
): GameState {
  const def = PERSONAL_ACTIONS[optionId];
  if (!def) return prev;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const cost = def.cost;

  const factionTarget = (target.kind === "faction" || target.kind === "leader")
    ? prev.factions.find((f) => f.id === target.id)
    : undefined;
  const officerTarget = (target.kind === "officer" || target.kind === "civic")
    ? prev.officers.find((o) => o.id === target.id)
    : undefined;
  const captainTarget = target.kind === "captain"
    ? prev.retinue?.captains.find((c) => c.id === target.id)
    : undefined;
  const populationTarget = target.kind === "population" && target.id === "population";
  const districtTarget = target.kind === "district"
    ? prev.districts.find((district) => district.id === target.id)
    : undefined;
  if (target.kind === "leader" && !factionTarget?.leader) return prev;
  if (target.kind !== "cohort" && !factionTarget && !officerTarget && !captainTarget && !populationTarget && !districtTarget) return prev;
  const isCohortTarget = target.kind === "cohort" && COHORT_TARGET_IDS.has(target.id as CohortStewardshipTargetId);
  if (target.kind === "cohort" && !isCohortTarget) return prev;
  if (target.kind === "cohort") {
    const cohortId = target.id as CohortStewardshipTargetId;
    const cohortReason = cohortStewardshipPrerequisiteReason(optionId, cohortId, prev);
    if (cohortReason) return prev;
  }
  if (target.kind === "district" && districtTarget) {
    // Re-check local conditions at execution time. A menu can remain open
    // while another action or tick changes the selected district.
    if (districtPrerequisiteReason(optionId, districtTarget)) return prev;
  }
  const targetEffect = getPersonalActionEffect(target.kind, optionId);
  if (target.kind === "cohort") {
    if (!PERSONAL_ACTIONS[optionId].cohort) return prev;
  }
  if (!Object.values(targetEffect).some((value) => typeof value === "number" && value !== 0)) {
    if (target.kind !== "cohort") return prev;
  }

  if (personalCooldownRemaining(prev.personalActionCooldowns, target, optionId, prev.totalTicks) > 0) {
    return prev;
  }

  const availableCredits = Number.isFinite(prev.resources?.credits)
    ? prev.resources.credits
    : 0;
  if (cost > 0 && availableCredits < cost) {
    const blockedMsg: GameMessage = {
      id: `personal-blocked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: prev.gameDate,
      tick: prev.totalTicks,
      category: "alert",
      title: `${def.label}: INSUFFICIENT CREDITS`,
      body: `Cannot ${def.label.toLowerCase()} — need ${cost.toLocaleString()} credits (current: ${Math.floor(availableCredits).toLocaleString()}).`,
      read: false,
      priority: "normal",
    };
    return { ...prev, messages: [blockedMsg, ...(prev.messages ?? [])].slice(0, messageCap) };
  }

  const decayMultiplier = personalActionDecayMultiplier(
    prev.personalActionHistory,
    target,
    optionId,
    prev.totalTicks,
  );
  const stampedHistory = stampPersonalActionHistory(
    prev.personalActionHistory,
    target,
    optionId,
    prev.totalTicks,
  );
  const stampedCooldowns = stampPersonalCooldown(
    prev.personalActionCooldowns,
    target,
    optionId,
    prev.totalTicks,
  );

  if (target.kind === "cohort") {
    const def = PERSONAL_ACTIONS[optionId];
    const effect = scaleCohortEffect(def.cohort!, decayMultiplier);
    const resourceDeltas = effect.resources ?? {};
    for (const [key, delta] of Object.entries(resourceDeltas)) {
      const current = Number((prev.resources as Record<string, number>)[key] ?? 0);
      if (delta < 0 && current < Math.abs(delta)) return prev;
    }
    const cityStats = { ...prev.cityStats };
    for (const [key, delta] of Object.entries(effect.cityStats ?? {})) {
      const current = Number((cityStats as Record<string, number>)[key] ?? 0);
      const max = key === "industrialOutput" ? Number.MAX_SAFE_INTEGER : 100;
      (cityStats as Record<string, number>)[key] = Math.max(0, Math.min(max, current + (delta ?? 0)));
    }
    const demographics = { ...prev.demographics };
    for (const [key, delta] of Object.entries(effect.demographics ?? {})) {
      const current = Number((demographics as unknown as Record<string, number>)[key] ?? 0);
      const percentageFields = new Set(["employmentRate", "unemploymentRate", "crimeParticipationRate", "gangAffiliationRate", "politicalActivismRate", "publicSatisfactionIndex", "unrestPotentialIndex", "fearIndex", "loyaltyIndex", "civicEngagementLevel", "corruptionExposureRate", "mediaInfluenceLevel", "publicHealthIndex", "hospitalCapacityUsage", "diseaseInfectionRate", "nutritionLevel", "sanitationAccessRate", "medicalCoverageRate", "mentalHealthStressIndex", "emergencyResponseCoverage", "populationHappinessIndex", "literacyRate", "substanceAbuseRate"]);
      const max = percentageFields.has(key) ? 100 : Number.MAX_SAFE_INTEGER;
      (demographics as unknown as Record<string, number>)[key] = Math.max(0, Math.min(max, current + (delta ?? 0)));
    }
    const resources = { ...prev.resources };
    const actualResourceDeltas: Partial<Record<keyof Resources, number>> = {};
    for (const [key, delta] of Object.entries(resourceDeltas)) {
      const current = Number((resources as Record<string, number>)[key] ?? 0);
      const nextValue = Math.max(0, current + (delta ?? 0));
      (resources as Record<string, number>)[key] = nextValue;
      if (nextValue !== current) (actualResourceDeltas as Record<string, number>)[key] = nextValue - current;
    }
    resources.credits = Math.max(0, resources.credits - cost);
    if (cost > 0) actualResourceDeltas.credits = -cost;
    const factions = prev.factions.map((f) => {
      const reaction = scalePersonalActionEffect(def.factionReaction ?? {}, decayMultiplier) as FactionPersonalEffect;
      const loyalty = clamp((f.loyalty ?? 50) + (reaction.loyalty ?? 0));
      const influence = clamp((f.influence ?? 50) + (reaction.influence ?? 0));
      const threat = clamp((f.threat ?? 30) + (reaction.threat ?? 0));
      return { ...f, loyalty, influence, threat };
    });
    const actualFactionReactions: Record<string, { loyalty?: number; influence?: number; threat?: number }> = {};
    for (const f of prev.factions) {
      const next = factions.find((entry) => entry.id === f.id)!;
      const reaction: { loyalty?: number; influence?: number; threat?: number } = {};
      if (next.loyalty !== f.loyalty) reaction.loyalty = next.loyalty - f.loyalty;
      if (next.influence !== f.influence) reaction.influence = next.influence - f.influence;
      if (next.threat !== f.threat) reaction.threat = next.threat - f.threat;
      if (Object.keys(reaction).length) actualFactionReactions[f.id] = reaction;
    }
    const actualEffects: CohortStewardshipHistoryEntry["effects"] = {};
    for (const [key, delta] of Object.entries(cityStats)) {
      const before = (prev.cityStats as Record<string, number>)[key];
      if (typeof before === "number" && delta !== before) (actualEffects.cityStats ??= {})[key as keyof GameState["cityStats"]] = delta - before;
    }
    for (const [key, delta] of Object.entries(demographics)) {
      const before = (prev.demographics as unknown as Record<string, unknown>)[key];
      if (typeof before === "number" && typeof delta === "number" && delta !== before) (actualEffects.demographics ??= {})[key as keyof GameState["demographics"]] = delta - before;
    }
    if (Object.keys(actualResourceDeltas).length > 0) {
      actualEffects.resources = actualResourceDeltas;
    }
    const cooldownUntilTick = stampedCooldowns[personalCooldownKey(target, optionId)] ?? prev.totalTicks;
    const auditId = `cohort-stewardship-${prev.totalTicks}-${target.id}-${optionId}`;
    const audit: CohortStewardshipHistoryEntry = {
      id: auditId, action: optionId, actionId: optionId, target: target.id as CohortStewardshipTargetId,
      approach: def.approach!, tick: prev.totalTicks, date: { ...prev.gameDate },
      effects: actualEffects, factionReactions: actualFactionReactions, reactions: actualFactionReactions,
      costs: Object.fromEntries(Object.entries(actualResourceDeltas).filter(([, value]) => (value as number) < 0).map(([key, value]) => [key, -(value as number)])) as Partial<Record<keyof Resources, number>>,
      gains: Object.fromEntries(Object.entries(actualResourceDeltas).filter(([, value]) => (value as number) > 0)) as Partial<Record<keyof Resources, number>>,
      cooldownUntilTick,
    };
    const resourceEntries: TickEntry[] = Object.entries(actualResourceDeltas).map(([key, delta]) => ({
      label: `Cohort stewardship: ${def.label}`,
      delta: delta as number,
      unit: key,
      reason: `${COHORT_LABELS[target.id as CohortStewardshipTargetId]} / ${def.approach}`,
      severity: (delta as number) >= 0 ? "positive" : "negative",
    }));
    const summary = [
      formatEffectDeltas(effect.cityStats as PopulationPersonalEffect ?? {}),
      formatEffectDeltas(effect.demographics as PopulationPersonalEffect ?? {}),
    ].filter(Boolean).join(" | ");
    const msg: GameMessage = {
      id: auditId, timestamp: { ...prev.gameDate }, tick: prev.totalTicks,
      category: "call", title: `COHORT: ${def.label} — ${COHORT_LABELS[target.id as CohortStewardshipTargetId]}`,
      body: `Approach: ${def.approach}. Effects: ${summary || "none"}. Resources: ${resourceEntries.map((entry) => `${entry.delta > 0 ? "+" : ""}${entry.delta} ${entry.unit}`).join(" | ") || "none"}. Cooldown: ${def.cooldownTicks} ticks.`,
      read: false, priority: def.approach === "coercive" ? "high" : "normal",
    };
    return {
      ...prev, resources, cityStats, demographics, factions,
      personalActionCooldowns: stampedCooldowns, personalActionHistory: stampedHistory,
      cohortStewardshipHistory: [...(prev.cohortStewardshipHistory ?? []), audit].slice(-200),
      pendingTickEntries: [...(prev.pendingTickEntries ?? []), ...resourceEntries].slice(-200),
      messages: [msg, ...(prev.messages ?? [])].slice(0, messageCap),
    };
  }

  if (target.kind === "faction" || target.kind === "leader") {
    const faction = factionTarget!;
    const eff = computePersonalFactionRelationshipDeltas(
      target.kind,
      optionId,
      {
        loyalty: faction.loyalty ?? 50,
        influence: faction.influence ?? 50,
        threat: faction.threat ?? 30,
      },
      {
        target,
        history: prev.personalActionHistory,
        totalTicks: prev.totalTicks,
      },
    );
    const targetName = target.kind === "leader"
      ? faction.leader!.name
      : faction.leader?.name ?? faction.name;
    const newFactions = prev.factions.map((f) =>
      f.id === target.id
        ? {
            ...f,
            loyalty: clamp((f.loyalty ?? 50) + (("loyalty" in eff ? eff.loyalty : 0) ?? 0)),
            influence: clamp((f.influence ?? 50) + (("influence" in eff ? eff.influence : 0) ?? 0)),
            threat: clamp((f.threat ?? 30) + (("threat" in eff ? eff.threat : 0) ?? 0)),
          }
        : f,
    );
    const summary = formatEffectDeltas(eff);
    const msg: GameMessage = {
      id: `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: prev.gameDate,
      tick: prev.totalTicks,
      category: "call",
      title: `${targetName}: ${def.label}`,
      body: `"${def.description}"\n\n— ${faction.name} Leadership\n\nEffects: ${summary}${cost > 0 ? `\nCost: ${cost.toLocaleString()} credits` : ""}`,
      read: false,
      priority: "normal",
    };
    return {
      ...prev,
      resources: { ...prev.resources, credits: prev.resources.credits - cost },
      factions: newFactions,
      personalActionCooldowns: stampedCooldowns,
      personalActionHistory: stampedHistory,
      messages: [msg, ...(prev.messages ?? [])].slice(0, messageCap),
    };
  }

  if (target.kind === "captain") {
    const captain = captainTarget!;
    // A stale menu must not be able to affect a captain who has since died.
    if (captain.status === "kia") return prev;
    const eff = scalePersonalActionEffect(
      getPersonalActionEffect("captain", optionId),
      decayMultiplier,
    ) as CaptainPersonalEffect;
    const newRetinue = prev.retinue
      ? {
          ...prev.retinue,
          captains: prev.retinue.captains.map((c) =>
            c.id === target.id
              ? {
                  ...c,
                  loyalty: clamp((c.loyalty ?? 50) + (eff.loyalty ?? 0)),
                }
              : c,
          ),
        }
      : prev.retinue;
    const summary = formatEffectDeltas(eff);
    const msg: GameMessage = {
      id: `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: prev.gameDate,
      tick: prev.totalTicks,
      category: "call",
      title: `${captain.name}: ${def.label}`,
      body: `"${def.description}"\n\n— ${captain.title}\n\nEffects: ${summary}${cost > 0 ? `\nCost: ${cost.toLocaleString()} credits` : ""}`,
      read: false,
      priority: "normal",
    };
    return {
      ...prev,
      resources: { ...prev.resources, credits: prev.resources.credits - cost },
      retinue: newRetinue,
      personalActionCooldowns: stampedCooldowns,
      personalActionHistory: stampedHistory,
      messages: [msg, ...(prev.messages ?? [])].slice(0, messageCap),
    };
  }

  if (target.kind === "district") {
    const district = districtTarget!;
    const eff = scalePersonalActionEffect(
      getPersonalActionEffect("district", optionId),
      decayMultiplier,
    ) as DistrictPersonalEffect;
    const districtStatClamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
    const newDistricts = prev.districts.map((entry) =>
      entry.id === target.id
        ? {
            ...entry,
            population: Math.max(0, Math.round(entry.population + (eff.population ?? 0))),
            crime: districtStatClamp(entry.crime + (eff.crime ?? 0), 200),
            unrest: districtStatClamp(entry.unrest + (eff.unrest ?? 0), 200),
            loyalty: districtStatClamp(entry.loyalty + (eff.loyalty ?? 0), 100),
            infraQuality: districtStatClamp(entry.infraQuality + (eff.infraQuality ?? 0), 100),
            defenseRating: districtStatClamp(entry.defenseRating + (eff.defenseRating ?? 0), 100),
            wealth: districtStatClamp(entry.wealth + (eff.wealth ?? 0), 100),
            gangInfluence: districtStatClamp(entry.gangInfluence + (eff.gangInfluence ?? 0), 100),
          }
        : entry,
    );
    const summary = formatEffectDeltas(eff);
    const updatedDistrict = newDistricts.find((entry) => entry.id === target.id)!;
    const appliedEffects: DistrictCommandHistoryEntry["effects"] = {};
    for (const field of ["population", "crime", "unrest", "loyalty", "infraQuality", "defenseRating", "wealth", "gangInfluence"] as const) {
      const delta = updatedDistrict[field] - district[field];
      if (delta !== 0) appliedEffects[field] = delta;
    }
    const msg: GameMessage = {
      id: `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: prev.gameDate,
      tick: prev.totalTicks,
      category: "call",
      title: `${district.name}: ${def.label}`,
      body: `"${def.description}"\n\n— ${district.name} District\n\nConsequences: ${summary}${cost > 0 ? `\nCost: ${cost.toLocaleString()} credits` : ""}`,
      read: false,
      priority: "normal",
    };
    return {
      ...prev,
      resources: { ...prev.resources, credits: prev.resources.credits - cost },
      districts: newDistricts,
      personalActionCooldowns: stampedCooldowns,
      personalActionHistory: stampedHistory,
      districtCommandHistory: stampDistrictCommandHistory(prev.districtCommandHistory, {
        id: `district-command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        districtId: target.id,
        actionId: optionId,
        effects: appliedEffects,
        tick: prev.totalTicks,
        timestamp: { ...prev.gameDate },
        cooldownUntilTick: stampedCooldowns[personalCooldownKey(target, optionId)] ?? prev.totalTicks,
      }),
      messages: [msg, ...(prev.messages ?? [])].slice(0, messageCap),
    };
  }

  if (target.kind === "population") {
    const eff = scalePersonalActionEffect(
      getPersonalActionEffect("population", optionId),
      decayMultiplier,
    ) as PopulationPersonalEffect;
    const cityStats = {
      ...prev.cityStats,
      happiness: clamp((prev.cityStats.happiness ?? 0) + (eff.happiness ?? 0)),
      unrest: clamp((prev.cityStats.unrest ?? 0) + (eff.unrest ?? 0)),
      crime: clamp((prev.cityStats.crime ?? 0) + (eff.crime ?? 0)),
      lawOrder: clamp((prev.cityStats.lawOrder ?? 0) + (eff.lawOrder ?? 0)),
      corruption: clamp((prev.cityStats.corruption ?? 0) + (eff.corruption ?? 0)),
    };
    const summary = formatEffectDeltas(eff);
    const msg: GameMessage = {
      id: `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: prev.gameDate,
      tick: prev.totalTicks,
      category: "call",
      title: `THE POPULATION: ${def.label}`,
      body: `"${def.description}"\n\n— ${prev.cityName} Population\n\nEffects: ${summary}${cost > 0 ? `\nCost: ${cost.toLocaleString()} credits` : ""}`,
      read: false,
      priority: "normal",
    };
    return {
      ...prev,
      resources: { ...prev.resources, credits: prev.resources.credits - cost },
      cityStats,
      personalActionCooldowns: stampedCooldowns,
      personalActionHistory: stampedHistory,
      messages: [msg, ...(prev.messages ?? [])].slice(0, messageCap),
    };
  }

  const officer = officerTarget!;
  const eff = scalePersonalActionEffect(
    getPersonalActionEffect(target.kind, optionId),
    decayMultiplier,
  );
  const newOfficers = prev.officers.map((o) =>
    o.id === target.id
      ? {
          ...o,
          loyalty: clamp((o.loyalty ?? 50) + (("loyalty" in eff ? eff.loyalty : 0) ?? 0)),
          fearFactor: clamp((o.fearFactor ?? 0) + (("fearFactor" in eff ? eff.fearFactor : 0) ?? 0)),
          corruption: clamp((o.corruption ?? 0) + (("corruption" in eff ? eff.corruption : 0) ?? 0)),
           popularity: clamp((o.popularity ?? 50) + (("popularity" in eff ? eff.popularity : 0) ?? 0)),
        }
      : o,
  );
  const summary = formatEffectDeltas(eff);
  const msg: GameMessage = {
    id: `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: prev.gameDate,
    tick: prev.totalTicks,
    category: "call",
    title: `${officer.name}: ${def.label}`,
    body: `"${def.description}"\n\n— ${officer.name}\n\nEffects: ${summary}${cost > 0 ? `\nCost: ${cost.toLocaleString()} credits` : ""}`,
    read: false,
    priority: "normal",
  };
  return {
    ...prev,
    resources: { ...prev.resources, credits: prev.resources.credits - cost },
    officers: newOfficers,
    personalActionCooldowns: stampedCooldowns,
    personalActionHistory: stampedHistory,
    messages: [msg, ...(prev.messages ?? [])].slice(0, messageCap),
  };
}

// Human-readable labels for the relationship fields a personal action can move.
const EFFECT_FIELD_LABELS: Record<string, string> = {
  loyalty: "loyalty",
  influence: "influence",
  threat: "threat",
  fearFactor: "fear",
  corruption: "corruption",
  popularity: "popularity",
  happiness: "happiness",
  unrest: "unrest",
  crime: "crime",
  lawOrder: "law/order",
  population: "population",
  infraQuality: "infrastructure",
  defenseRating: "defense",
  wealth: "wealth",
  gangInfluence: "gang influence",
  housingPressure: "housing pressure",
  industrialOutput: "industrial output",
  education: "education",
  diseaseRisk: "disease risk",
  publicHealth: "public health",
  employment: "employment",
  employmentRate: "employment rate",
  unemploymentRate: "unemployment rate",
  literacyRate: "literacy rate",
  publicSatisfactionIndex: "public satisfaction",
  medicalCoverageRate: "medical coverage",
  consumerSpendingIndex: "consumer spending",
  fearIndex: "fear",
  civicEngagementLevel: "civic engagement",
  corruptionExposureRate: "corruption exposure",
  emigrationRate: "emigration rate",
  prisonPopulation: "prison population",
  homelessPopulation: "homeless population",
  averageCitizenIncome: "citizen income",
  debtLevel: "debt",
};

// The order fields are printed in, so previews read consistently.
const EFFECT_FIELD_ORDER = [
  "loyalty",
  "influence",
  "threat",
  "fearFactor",
  "corruption",
  "popularity",
  "happiness",
  "unrest",
  "crime",
  "lawOrder",
  "population",
  "infraQuality",
  "defenseRating",
  "wealth",
  "gangInfluence",
  "housingPressure",
  "industrialOutput",
  "education",
  "diseaseRisk",
  "publicHealth",
  "employment",
  "employmentRate",
  "unemploymentRate",
  "literacyRate",
  "publicSatisfactionIndex",
  "medicalCoverageRate",
  "consumerSpendingIndex",
  "fearIndex",
  "civicEngagementLevel",
  "corruptionExposureRate",
  "emigrationRate",
  "prisonPopulation",
  "homelessPopulation",
  "averageCitizenIncome",
  "debtLevel",
] as const;

/**
 * Return the effect object that applies to the given target kind.
 */
export function getPersonalActionEffect(
  kind: InteractionTargetKind,
  id: PersonalActionId,
): FactionPersonalEffect | OfficerPersonalEffect | CaptainPersonalEffect | PopulationPersonalEffect | DistrictPersonalEffect {
  const def = PERSONAL_ACTIONS[id];
  // Cohort stewardship metadata deliberately cannot be aimed at actors,
  // populations, or districts even though the legacy catalog shape requires
  // those effect bags to exist.
  if (def.cohortTargets && kind !== "cohort") return {};
  if (kind === "faction") return def.faction;
  if (kind === "leader") return def.leader;
  if (kind === "officer") return def.officer;
  if (kind === "civic") return def.civic;
  if (kind === "population") return def.population;
  if (kind === "cohort") return (def.cohort ?? {}) as unknown as PopulationPersonalEffect;
  if (kind === "district") return def.district ?? {};
  return def.captain;
}

/**
 * Effective faction/leader relationship deltas after repetition decay and
 * target clamps. Shared by the preview and reducer so capped relationships
 * never advertise changes that cannot be applied.
 */
export function computePersonalFactionRelationshipDeltas(
  kind: "faction" | "leader",
  id: PersonalActionId,
  current: { loyalty: number; influence: number; threat: number },
  context: PersonalActionPreviewContext,
): { loyalty: number; influence: number; threat: number } {
  const multiplier = personalActionDecayMultiplier(
    context.history,
    context.target,
    id,
    context.totalTicks,
  );
  const effect = scalePersonalActionEffect(
    getPersonalActionEffect(kind, id),
    multiplier,
  ) as FactionPersonalEffect;
  const resolve = (value: number, delta: number | undefined): number => {
    const next = Math.max(0, Math.min(100, value + (delta ?? 0)));
    return Math.round((next - value) * 100) / 100;
  };
  return {
    loyalty: resolve(current.loyalty, effect.loyalty),
    influence: resolve(current.influence, effect.influence),
    threat: resolve(current.threat, effect.threat),
  };
}

/**
 * Format a personal action's stat changes, e.g. "+8 loyalty | +2 influence".
 * Cost is intentionally excluded so callers can place it where they like.
 */
export function formatEffectDeltas(
  effect: FactionPersonalEffect | OfficerPersonalEffect | CaptainPersonalEffect | PopulationPersonalEffect | DistrictPersonalEffect | CohortPersonalEffect,
): string {
  const bag = effect as Record<string, number | undefined>;
  const parts: string[] = [];
  for (const field of EFFECT_FIELD_ORDER) {
    const v = bag[field];
    if (v == null || v === 0) continue;
    parts.push(`${v > 0 ? "+" : ""}${v} ${EFFECT_FIELD_LABELS[field]}`);
  }
  return parts.join(" | ");
}

export type FactionRelationshipPreviewContext = {
  current: { loyalty: number; influence: number; threat: number };
  playerAttributes?: { charisma?: number; intelligence?: number };
  corruption?: number;
};

/**
 * Resolve accepted faction relationship deltas with the same character,
 * corruption, rounding, and clamp rules used by the authoritative reducer.
 */
export function computeFactionActionRelationshipDeltas(
  context: FactionRelationshipPreviewContext,
  effects: DiplomaticActionEffects,
): { loyalty: number; influence: number; threat: number } {
  const charBonus = context.playerAttributes
    ? 1
      + (context.playerAttributes.charisma ?? 0) * 0.02
      + (context.playerAttributes.intelligence ?? 0) * 0.01
    : 1;
  const corruptionPenalty = 1 - ((context.corruption ?? 0) / 200);
  const scale = charBonus * corruptionPenalty;
  const resolve = (current: number, raw: number | undefined): number => {
    const scaled = Math.round((raw ?? 0) * scale);
    const next = Math.max(0, Math.min(100, current + scaled));
    return next - current;
  };
  return {
    loyalty: resolve(context.current.loyalty, effects.loyalty),
    influence: resolve(context.current.influence, effects.influence),
    threat: resolve(context.current.threat, effects.threat),
  };
}

/**
 * Subtitle for a personal action button: stat deltas plus credit cost.
 */
export function formatPersonalActionSubtitle(
  kind: InteractionTargetKind,
  id: PersonalActionId,
  context?: PersonalActionPreviewContext,
): string {
  const def = PERSONAL_ACTIONS[id];
  const parts: string[] = [];
  const multiplier = context
    ? personalActionDecayMultiplier(context.history, context.target, id, context.totalTicks)
    : 1;
  if (kind === "cohort" && def.cohort) {
    const effect = scaleCohortEffect(def.cohort, multiplier);
    const parts = [
      formatEffectDeltas(effect.cityStats as PopulationPersonalEffect ?? {}),
      formatEffectDeltas(effect.demographics as PopulationPersonalEffect ?? {}),
    ].filter(Boolean);
    for (const [resource, value] of Object.entries(effect.resources ?? {})) {
      if (value) parts.push(`${value > 0 ? "+" : ""}${value} ${resource}`);
    }
    if (def.cost > 0) parts.push(`${def.cost.toLocaleString()}c`);
    if (multiplier < 1) parts.push(`Reduced effect: ${Math.round(multiplier * 100)}%`);
    return parts.join(" | ");
  }
  const deltas = formatEffectDeltas(
    scalePersonalActionEffect(getPersonalActionEffect(kind, id), multiplier),
  );
  if (deltas) parts.push(deltas);
  if (def.cost > 0) parts.push(`${def.cost.toLocaleString()}c`);
  if (multiplier < 1) {
    parts.push(`Reduced effect: ${Math.round(multiplier * 100)}%`);
  }
  return parts.join(" | ");
}

/**
 * Shared affordability check. Returns a short reason string when the action is
 * unaffordable, or null when it is affordable. Used by both personal actions
 * and the reused faction actions so the "greyed with a reason" copy is
 * consistent across the whole menu.
 */
export function affordabilityReason(cost: number, credits: number): string | null {
  return cost > 0 && (!Number.isFinite(credits) || credits < cost)
    ? `Need ${cost.toLocaleString()} credits`
    : null;
}

export type OptionEligibility = { eligible: boolean; reason?: string };

// ── Per-target cooldowns (Task #393) ────────────────────────────────────────
//
// Without a gate, the free verbs (flatter / grant-favor / threaten) could be
// tapped repeatedly to push a target straight to 100 loyalty. Each use now
// stamps `state.personalActionCooldowns[key] = totalTicks + cooldownTicks`
// (the tick the verb becomes usable again), mirroring the edictCooldowns
// pattern: expiry is a pure comparison against totalTicks, so it persists in
// save data and survives offline catch-up with no extra tick-loop wiring.

export type PersonalCooldownMap = Record<string, number>;

/** Stable cooldown-map key for one verb aimed at one target. */
export function personalCooldownKey(
  target: PersonalInteractionTarget,
  id: PersonalActionId,
): string {
  return `${target.kind}:${target.id}:${id}`;
}

/**
 * Ticks left before the verb can be used on this target again. 0 = ready.
 */
export function personalCooldownRemaining(
  cooldowns: PersonalCooldownMap | undefined,
  target: PersonalInteractionTarget,
  id: PersonalActionId,
  totalTicks: number,
): number {
  const readyAt = (cooldowns ?? {})[personalCooldownKey(target, id)];
  if (readyAt == null) return 0;
  return Math.max(0, Math.ceil(readyAt - totalTicks));
}

/**
 * Return a new cooldown map with this use stamped, pruning any entries that
 * have already expired so the record never grows past the handful of targets
 * the player is actively working.
 */
export function stampPersonalCooldown(
  cooldowns: PersonalCooldownMap | undefined,
  target: PersonalInteractionTarget,
  id: PersonalActionId,
  totalTicks: number,
): PersonalCooldownMap {
  const next: PersonalCooldownMap = {};
  const currentKey = personalCooldownKey(target, id);
  const entryLimit = Object.prototype.hasOwnProperty.call(cooldowns ?? {}, currentKey)
    ? PERSONAL_ACTION_STORE_KEY_CAP
    : PERSONAL_ACTION_STORE_KEY_CAP - 1;
  let entryCount = 0;
  for (const [k, readyAt] of Object.entries(cooldowns ?? {})) {
    if (entryCount >= entryLimit) break;
    if (typeof readyAt === "number" && Number.isFinite(readyAt) && readyAt > totalTicks) {
      next[k] = readyAt;
      entryCount++;
    }
  }
  next[currentKey] = totalTicks + PERSONAL_ACTIONS[id].cooldownTicks;
  return next;
}

// ── Per-faction cooldowns for reused diplomacy verbs (Task #468) ────────────
//
// The faction menu also reuses the older faction-level diplomacy actions
// (EVENT_ONLY_ACTION_RULES in diplomacyEngine.ts). Any of those that RAISE
// loyalty could be tapped repeatedly to farm relationship gains — the same
// exploit Task #393 closed for the personal verbs, through a different door.
// The loyalty-raising subset gets a per-faction cooldown here, stored in the
// SAME personalActionCooldowns map (so persistence and offline catch-up come
// for free) under the same "faction:<id>:<action>" key shape. The two id
// namespaces are disjoint (PersonalActionId vs EventOnlyActionId), so keys
// can never collide.
//
// Verbs that lower loyalty or trade influence for threat (seize-assets,
// suppress, spread-rumors, arrange-accident, arrest-leaders, purge,
// plant-informant) are self-limiting — there is no farming loop — and stay
// uncapped so sandbox play keeps its "chain hostile verbs freely" feel
// (see factionSandboxActions.test.ts).
export const FACTION_DIPLOMACY_COOLDOWNS: Partial<Record<EventOnlyActionId, number>> = {
  // Free — nothing but the cooldown gates it, so it carries the longest one
  // (mirrors the free personal verbs at 24).
  "negotiate": 24,
  // Paid loyalty-raisers. Credits slow the spam but late-game treasuries
  // don't, so they cool down like the paid personal verbs (bribe = 16).
  "host-banquet": 16,
  "grant-honor": 16,
  "fund": 16,
  "tax-concession": 16,
};

/** Shared "greyed with a reason" copy for a verb that is still cooling down. */
function recentlyUsedReason(wait: number): string {
  return `Recently used — wait ${wait} tick${wait === 1 ? "" : "s"}`;
}

/** Stable cooldown-map key for a faction-level diplomacy verb. */
export function factionDiplomacyCooldownKey(
  factionId: string,
  action: EventOnlyActionId,
): string {
  return `faction:${factionId}:${action}`;
}

/**
 * Ticks left before this diplomacy verb can be used on this faction again.
 * Always 0 for verbs without a configured cooldown.
 */
export function factionDiplomacyCooldownRemaining(
  cooldowns: PersonalCooldownMap | undefined,
  factionId: string,
  action: EventOnlyActionId,
  totalTicks: number,
): number {
  if (FACTION_DIPLOMACY_COOLDOWNS[action] == null) return 0;
  const readyAt = (cooldowns ?? {})[factionDiplomacyCooldownKey(factionId, action)];
  if (readyAt == null) return 0;
  return Math.max(0, Math.ceil(readyAt - totalTicks));
}

/**
 * Eligibility gate for the cooldown alone: returns the "Recently used —
 * wait N ticks" reason while cooling down, or null when the verb is ready
 * (or has no cooldown configured).
 */
export function factionDiplomacyCooldownReason(
  cooldowns: PersonalCooldownMap | undefined,
  factionId: string,
  action: EventOnlyActionId,
  totalTicks: number,
): string | null {
  const wait = factionDiplomacyCooldownRemaining(cooldowns, factionId, action, totalTicks);
  return wait > 0 ? recentlyUsedReason(wait) : null;
}

/**
 * Stamp a use of a faction-level diplomacy verb. No-op (returns the input
 * map unchanged) for verbs without a configured cooldown, so callers can
 * stamp unconditionally. Prunes expired entries like stampPersonalCooldown.
 */
export function stampFactionDiplomacyCooldown(
  cooldowns: PersonalCooldownMap | undefined,
  factionId: string,
  action: EventOnlyActionId,
  totalTicks: number,
): PersonalCooldownMap {
  const cooldownTicks = FACTION_DIPLOMACY_COOLDOWNS[action];
  if (cooldownTicks == null) return cooldowns ?? {};
  const next: PersonalCooldownMap = {};
  const currentKey = factionDiplomacyCooldownKey(factionId, action);
  const entryLimit = Object.prototype.hasOwnProperty.call(cooldowns ?? {}, currentKey)
    ? PERSONAL_ACTION_STORE_KEY_CAP
    : PERSONAL_ACTION_STORE_KEY_CAP - 1;
  let entryCount = 0;
  for (const [k, readyAt] of Object.entries(cooldowns ?? {})) {
    if (entryCount >= entryLimit) break;
    if (typeof readyAt === "number" && Number.isFinite(readyAt) && readyAt > totalTicks) {
      next[k] = readyAt;
      entryCount++;
    }
  }
  next[currentKey] = totalTicks + cooldownTicks;
  return next;
}

export type PersonalActionContext = {
  target: PersonalInteractionTarget;
  cooldowns: PersonalCooldownMap | undefined;
  history?: PersonalActionHistory;
  totalTicks: number;
  state?: GameState;
};

/**
 * Eligibility for a personal action against a target with the given available
 * credits. Two gates: the per-target cooldown (checked first, so the greyed
 * reason explains the wait even when the player is also broke), then
 * affordability. Returned as {eligible, reason} so the UI can grey the button
 * and show why rather than hiding it. `ctx` is optional so pure
 * affordability checks (and older tests) still work without a game state.
 */
export function evaluatePersonalAction(
  id: PersonalActionId,
  credits: number,
  ctx?: PersonalActionContext,
): OptionEligibility {
  let cooldownReason: string | null = null;
  if (ctx) {
    const wait = personalCooldownRemaining(ctx.cooldowns, ctx.target, id, ctx.totalTicks);
    if (wait > 0) {
      cooldownReason = recentlyUsedReason(wait);
    }
  }
  if (ctx?.target.kind === "cohort") {
    if (!COHORT_TARGET_IDS.has(ctx.target.id as CohortStewardshipTargetId)) {
      return { eligible: false, reason: "Unknown cohort" };
    }
    const state = ctx.state;
    if (!state) return { eligible: false, reason: "Cohort context required" };
    const prerequisiteReason = cohortStewardshipPrerequisiteReason(
      id,
      ctx.target.id as CohortStewardshipTargetId,
      state,
    );
    if (cooldownReason) {
      return {
        eligible: false,
        reason: prerequisiteReason ? `${cooldownReason}; ${prerequisiteReason}` : cooldownReason,
      };
    }
    if (prerequisiteReason) return { eligible: false, reason: prerequisiteReason };
    const cohortEffect = PERSONAL_ACTIONS[id].cohort;
    if (!cohortEffect) return { eligible: false, reason: "Not available for this target" };
    return { eligible: true };
  }
  const effect = getPersonalActionEffect(ctx?.target.kind ?? "faction", id);
  const hasEffect = Object.values(effect).some((value) => typeof value === "number" && value !== 0);
  if (!hasEffect) {
    return {
      eligible: false,
      reason: cooldownReason ?? "Not available for this target",
    };
  }
  let localReason: string | null = null;
  if (ctx?.target.kind === "district" && ctx.state) {
    const district = ctx.state.districts.find((entry) => entry.id === ctx.target.id);
    if (!district) {
      return { eligible: false, reason: cooldownReason ?? "District no longer exists" };
    }
    localReason = districtPrerequisiteReason(id, district);
  }
  if (cooldownReason) {
    return {
      eligible: false,
      reason: localReason ? `${cooldownReason}; ${localReason}` : cooldownReason,
    };
  }
  if (localReason) return { eligible: false, reason: localReason };
  const def = PERSONAL_ACTIONS[id];
  const reason = affordabilityReason(def.cost, credits);
  return reason ? { eligible: false, reason } : { eligible: true };
}

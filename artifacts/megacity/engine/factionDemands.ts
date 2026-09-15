import { ADMINISTRATIVE_BLOC_ID } from "@/engine/administrativeBloc";
import type {
  AdministrativeReformDirection,
  EventResponse,
  Faction,
  GameEvent,
  GameState,
} from "@/engine/types";

export const FACTION_DEMAND_INTERVAL = 12;
export const FACTION_DEMAND_COOLDOWN = 24;
const DEMAND_PREFIX = "faction-demand-";

type DemandProfile = {
  ask: string;
  rationale: string;
};

export type AdministrativeDemandKind =
  | "workload"
  | "corruption"
  | "vacancies"
  | "treasury"
  | "law_order"
  | "policy_review";

type AdministrativeDemandProfile = {
  title: string;
  condition: string;
  responses: Array<{
    id: string;
    label: string;
    reform?: AdministrativeReformDirection;
    effects: EventResponse["effects"];
  }>;
};

const administrativeResponse = (
  id: string,
  label: string,
  reform: AdministrativeReformDirection | undefined,
  effects: EventResponse["effects"],
) => ({ id, label, reform, effects });

const ADMINISTRATIVE_DEMANDS: Record<AdministrativeDemandKind, AdministrativeDemandProfile> = {
  workload: {
    title: "APPROVAL BACKLOG",
    condition: "Workload exceeds institutional throughput.",
    responses: [
      administrativeResponse("centralize", "CENTRALIZE AUTHORITY", "centralization", {
        credits: -3000, lawOrder: 2, unrest: 1, factionLoyalty: 7, factionThreat: -3,
        administrativeCapacity: 8, institutionalIndependence: -7, administrativePressure: -10,
      }),
      administrativeResponse("decentralize", "DEVOLVE TO DISTRICTS", "decentralization", {
        credits: -4500, unrest: -1, factionLoyalty: 5, factionInfluence: 2,
        administrativeCapacity: 4, institutionalIndependence: 5, administrativePressure: -7,
      }),
      administrativeResponse("expedite", "EXPEDITE APPROVALS", "expedited_approvals", {
        credits: -1000, corruption: 3, lawOrder: -1, factionLoyalty: -2,
        administrativeCapacity: 10, institutionalIndependence: -10, administrativePressure: -12,
      }),
      administrativeResponse("resist", "REJECT THE REQUEST", undefined, {
        unrest: 2, factionLoyalty: -7, factionThreat: 6,
        administrativePressure: 8, administrativeRadicalization: 5,
      }),
    ],
  },
  corruption: {
    title: "OVERSIGHT FAILURE",
    condition: "Corruption exposure exceeds audit and legal coverage.",
    responses: [
      administrativeResponse("watchdogs", "EXPAND WATCHDOGS", "watchdog_expansion", {
        credits: -7000, corruption: -5, lawOrder: 1, factionLoyalty: 8, factionInfluence: 3,
        administrativeCapacity: -2, institutionalIndependence: 10, administrativePressure: -10,
      }),
      administrativeResponse("prosecute", "PUBLIC PROSECUTION", "public_prosecution", {
        credits: -5000, corruption: -7, lawOrder: 3, unrest: 2, factionLoyalty: 6, factionThreat: -2,
        administrativeCapacity: -3, institutionalIndependence: 12, administrativePressure: -8,
      }),
      administrativeResponse("shield", "SHIELD APPOINTEES", "centralization", {
        credits: -1500, corruption: 5, lawOrder: -2, factionLoyalty: -4, factionThreat: 4,
        administrativeCapacity: 5, institutionalIndependence: -12, administrativePressure: 4,
      }),
      administrativeResponse("resist", "CLOSE THE FILE", undefined, {
        corruption: 4, unrest: 2, factionLoyalty: -8, factionThreat: 7,
        administrativePressure: 10, administrativeRadicalization: 7,
      }),
    ],
  },
  vacancies: {
    title: "STAFFING VACANCIES",
    condition: "Key administrative departments lack appointed leadership.",
    responses: [
      administrativeResponse("decentralize", "EMPOWER CAREER STAFF", "decentralization", {
        credits: -3500, lawOrder: 1, factionLoyalty: 8, factionInfluence: 2,
        administrativeCapacity: 5, institutionalIndependence: 8, administrativePressure: -9,
      }),
      administrativeResponse("centralize", "INSTALL LOYAL APPOINTEES", "centralization", {
        credits: -2000, lawOrder: 2, factionLoyalty: 2, factionThreat: 1,
        administrativeCapacity: 8, institutionalIndependence: -9, administrativePressure: -7,
      }),
      administrativeResponse("austerity", "CONSOLIDATE OFFICES", "austerity", {
        credits: -500, unrest: 2, factionLoyalty: -4, factionInfluence: -2,
        administrativeCapacity: -7, institutionalIndependence: -3, administrativePressure: 5,
      }),
      administrativeResponse("resist", "LEAVE POSTS VACANT", undefined, {
        lawOrder: -1, factionLoyalty: -7, factionThreat: 5,
        administrativePressure: 9, administrativeRadicalization: 5,
      }),
    ],
  },
  treasury: {
    title: "TREASURY STRESS",
    condition: "Available credits cannot support the current administrative load.",
    responses: [
      administrativeResponse("austerity", "IMPOSE AUSTERITY", "austerity", {
        credits: -500, unrest: 4, lawOrder: -2, factionLoyalty: -5, factionInfluence: -2,
        administrativeCapacity: -10, institutionalIndependence: -3, administrativePressure: 8,
      }),
      administrativeResponse("watchdogs", "PROTECT OVERSIGHT", "watchdog_expansion", {
        credits: -4000, corruption: -3, factionLoyalty: 6,
        administrativeCapacity: -3, institutionalIndependence: 8, administrativePressure: -5,
      }),
      administrativeResponse("expedite", "SELL FAST-TRACK ACCESS", "expedited_approvals", {
        credits: -1000, corruption: 5, lawOrder: -2, factionLoyalty: -3, factionThreat: 3,
        administrativeCapacity: 8, institutionalIndependence: -10, administrativePressure: -5,
      }),
      administrativeResponse("resist", "ORDER THEM TO COPE", undefined, {
        unrest: 3, factionLoyalty: -8, factionThreat: 6,
        administrativePressure: 10, administrativeRadicalization: 6,
      }),
    ],
  },
  law_order: {
    title: "LEGAL CAPACITY EMERGENCY",
    condition: "Crime and weak law order are overwhelming legal administration.",
    responses: [
      administrativeResponse("prosecute", "PUBLIC PROSECUTION", "public_prosecution", {
        credits: -6000, crime: -3, corruption: -4, lawOrder: 4, unrest: 1, factionLoyalty: 8,
        administrativeCapacity: -2, institutionalIndependence: 10, administrativePressure: -8,
      }),
      administrativeResponse("centralize", "EMERGENCY LEGAL REVIEW", "centralization", {
        credits: -3500, crime: -2, lawOrder: 5, unrest: 2, factionLoyalty: 4,
        administrativeCapacity: 7, institutionalIndependence: -6, administrativePressure: -7,
      }),
      administrativeResponse("expedite", "WAIVE DUE PROCESS", "expedited_approvals", {
        crime: -5, corruption: 4, lawOrder: 3, unrest: 5, factionLoyalty: -5, factionThreat: 4,
        administrativeCapacity: 9, institutionalIndependence: -12, administrativePressure: -4,
      }),
      administrativeResponse("resist", "DENY EXTRA POWERS", undefined, {
        crime: 2, lawOrder: -2, factionLoyalty: -7, factionThreat: 6,
        administrativePressure: 9, administrativeRadicalization: 5,
      }),
    ],
  },
  policy_review: {
    title: "REFORM REVIEW",
    condition: "The Bloc is reviewing the commander's recent administrative policy.",
    responses: [
      administrativeResponse("balance", "RESTORE BALANCED PROCESS", "balanced", {
        credits: -2000, unrest: -1, factionLoyalty: 4,
        administrativeCapacity: 1, institutionalIndependence: 2, administrativePressure: -4,
      }),
      administrativeResponse("watchdogs", "EXPAND WATCHDOGS", "watchdog_expansion", {
        credits: -6000, corruption: -4, lawOrder: 1, factionLoyalty: 7,
        institutionalIndependence: 9, administrativePressure: -7,
      }),
      administrativeResponse("decentralize", "DEVOLVE AUTHORITY", "decentralization", {
        credits: -3500, unrest: -2, factionLoyalty: 5,
        administrativeCapacity: 4, institutionalIndependence: 5, administrativePressure: -6,
      }),
      administrativeResponse("resist", "RETAIN CURRENT POLICY", undefined, {
        factionLoyalty: -5, factionThreat: 4,
        administrativePressure: 6, administrativeRadicalization: 3,
      }),
    ],
  },
};

const PROFILES: Record<Faction["type"], DemandProfile> = {
  law: {
    ask: "Grant the Authority expanded patrol powers in a troubled sector.",
    rationale: "They argue that visible order is the only language a frightened city understands.",
  },
  criminal: {
    ask: "Look the other way while the underhive moves a protected shipment.",
    rationale: "The Syndicates promise quiet streets if their informal economy gets room to breathe.",
  },
  corporate: {
    ask: "Award MegaCorp an exclusive contract for the next major civic project.",
    rationale: "Their executives offer speed and investment, but an exclusive deal will narrow your options.",
  },
  underclass: {
    ask: "Reserve more city capacity for neglected residents and mutant citizens.",
    rationale: "The Collective says dignity is becoming a test of whether your regime deserves to last.",
  },
  cult: {
    ask: "Permit a public rite to spread the machine-faith through city systems.",
    rationale: "The Iron Circuit promises technical breakthroughs while asking for access you may not be able to retract.",
  },
  institutional: {
    ask: "Protect the administrative chain from political shortcuts and opaque spending.",
    rationale: "The Bloc argues that inspections, legal review, and accountable procurement are the price of a city that can still govern itself.",
  },
};

export function makeFactionDemandEvent(state: GameState, faction: Faction): GameEvent {
  if (faction.id === ADMINISTRATIVE_BLOC_ID || faction.type === "institutional") {
    return makeAdministrativeDemandEvent(state, faction);
  }
  const profile = PROFILES[faction.type];
  const id = `${DEMAND_PREFIX}${faction.id}`;
  const response = (
    idSuffix: string,
    label: string,
    effects: EventResponse["effects"],
  ): EventResponse => ({ id: `${id}-${idSuffix}`, label, effects });

  return {
    id,
    title: `${faction.name.toUpperCase()}: A DEMAND`,
    description: `${profile.ask} ${profile.rationale}`,
    severity: faction.threat >= 65 ? "high" : "medium",
    effects: {},
    timestamp: Date.now(),
    resolved: false,
    factionId: faction.id,
    responseOptions: [
      response("concede", "CONCEDE", {
        credits: faction.type === "corporate" ? -8000 : faction.type === "underclass" ? -5000 : -2500,
        happiness: faction.type === "underclass" ? 2 : 0,
        unrest: faction.type === "law" || faction.type === "criminal" ? -2 : 0,
        factionLoyalty: 8,
        factionInfluence: 3,
        factionThreat: -5,
      }),
      response("compromise", "NEGOTIATE A COMPROMISE", {
        credits: -1500,
        happiness: 1,
        factionLoyalty: 3,
        factionInfluence: 1,
        factionThreat: -1,
      }),
      response("resist", "RESIST", {
        unrest: faction.type === "underclass" || faction.type === "criminal" ? 3 : 1,
        happiness: faction.type === "law" ? -1 : 0,
        factionLoyalty: -7,
        factionInfluence: -2,
        factionThreat: 6,
      }),
    ],
  };
}

export function selectAdministrativeDemandKind(state: GameState): AdministrativeDemandKind {
  const telemetry = state.administrativeInstitutions;
  const appointed = (state.officers ?? []).filter(officer => officer.appointed).length;
  if ((state.cityStats.corruption ?? 0) >= 55 || (telemetry?.corruptionExposure ?? 0) >= 65) return "corruption";
  if ((state.resources.credits ?? 0) < 100_000) return "treasury";
  if ((state.cityStats.lawOrder ?? 100) < 42 || (state.cityStats.crime ?? 0) > 60) return "law_order";
  if (appointed < 5) return "vacancies";
  if ((telemetry?.workloadPressure ?? 0) > (telemetry?.overallEffectiveness ?? 50) + 8) return "workload";
  if (
    telemetry?.reformDirection &&
    telemetry.reformDirection !== "balanced" &&
    (state.totalTicks ?? 0) - (telemetry.reformAdoptedTick ?? 0) <= 48
  ) return "policy_review";
  return "workload";
}

export function makeAdministrativeDemandEvent(state: GameState, faction: Faction): GameEvent {
  const kind = selectAdministrativeDemandKind(state);
  const profile = ADMINISTRATIVE_DEMANDS[kind];
  const telemetry = state.administrativeInstitutions;
  const id = `${DEMAND_PREFIX}${faction.id}`;
  const pressure = Math.round(telemetry?.pressure ?? 50);
  const workload = Math.round(telemetry?.workloadPressure ?? 50);
  const effectiveness = Math.round(telemetry?.overallEffectiveness ?? 50);
  return {
    id,
    title: `${faction.name.toUpperCase()}: ${profile.title}`,
    description: `${profile.condition} Pressure ${pressure}/100 · workload ${workload} · effectiveness ${effectiveness}.`,
    severity: pressure >= 75 ? "high" : "medium",
    effects: {},
    timestamp: Date.now(),
    resolved: false,
    factionId: faction.id,
    responseOptions: profile.responses.map(option => ({
      id: `${id}-${option.id}`,
      label: option.label,
      effects: option.effects,
      administrativeReform: option.reform,
    })),
  };
}

export function applyFactionDemandResponse(
  state: GameState,
  event: Pick<GameEvent, "factionId">,
  response: Pick<EventResponse, "id" | "effects" | "administrativeReform">,
): GameState {
  const factionId = event.factionId;
  if (!factionId) return state;
  const effects = response.effects as EventResponse["effects"] & {
    factionLoyalty?: number;
    factionInfluence?: number;
    factionThreat?: number;
  };
  let next: GameState = {
    ...state,
    factions: state.factions.map((faction) =>
      faction.id !== factionId
        ? faction
        : {
            ...faction,
            loyalty: Math.max(0, Math.min(100, faction.loyalty + (effects.factionLoyalty ?? 0))),
            influence: Math.max(0, Math.min(100, faction.influence + (effects.factionInfluence ?? 0))),
            threat: Math.max(0, Math.min(100, faction.threat + (effects.factionThreat ?? 0))),
          },
    ),
  };
  if (factionId !== ADMINISTRATIVE_BLOC_ID || !state.administrativeInstitutions) return next;

  const clamp100 = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const capacityDelta = effects.administrativeCapacity ?? 0;
  const independenceDelta = effects.institutionalIndependence ?? 0;
  const pressureDelta = effects.administrativePressure ?? 0;
  const administrativeInstitutions = {
    ...state.administrativeInstitutions,
    cohorts: Object.fromEntries(
      Object.entries(state.administrativeInstitutions.cohorts).map(([id, cohort]) => [
        id,
        {
          ...cohort,
          capacity: clamp100(cohort.capacity + capacityDelta),
          independence: clamp100(cohort.independence + independenceDelta),
          effectiveness: clamp100(cohort.effectiveness + capacityDelta * 0.45 + independenceDelta * 0.2),
        },
      ]),
    ) as typeof state.administrativeInstitutions.cohorts,
    overallCapacity: clamp100(state.administrativeInstitutions.overallCapacity + capacityDelta),
    overallEffectiveness: clamp100(
      state.administrativeInstitutions.overallEffectiveness + capacityDelta * 0.45 + independenceDelta * 0.2,
    ),
    oversightCoverage: clamp100(state.administrativeInstitutions.oversightCoverage + independenceDelta * 0.6),
    pressure: clamp100(state.administrativeInstitutions.pressure + pressureDelta),
    reformDirection: response.administrativeReform ?? state.administrativeInstitutions.reformDirection,
    reformAdoptedTick: response.administrativeReform
      ? Math.max(0, Math.round(state.totalTicks ?? 0))
      : state.administrativeInstitutions.reformAdoptedTick,
  };
  next = { ...next, administrativeInstitutions };
  if (next.intrigue && effects.administrativeRadicalization !== undefined) {
    next = {
      ...next,
      intrigue: {
        ...next.intrigue,
        radicalization: {
          ...next.intrigue.radicalization,
          [ADMINISTRATIVE_BLOC_ID]: clamp100(
            (next.intrigue.radicalization[ADMINISTRATIVE_BLOC_ID] ?? 0) +
            effects.administrativeRadicalization,
          ),
        },
      },
    };
  }
  return next;
}

export function processFactionDemands(state: GameState): GameEvent | null {
  if (state.gameplayMode === "turnbased" || (state.totalTicks ?? 0) < FACTION_DEMAND_INTERVAL) return null;
  if ((state.activeEvents ?? []).some((event) => event.id.startsWith(DEMAND_PREFIX))) return null;
  if ((state.totalTicks ?? 0) % FACTION_DEMAND_INTERVAL !== 0) return null;

  const eligible = state.factions
    .filter((faction) => faction.isActive && ((faction.influence ?? 0) >= 15 || (faction.threat ?? 0) >= 20))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (eligible.length === 0) return null;

  const pressuredBloc = eligible.find(faction =>
    faction.id === ADMINISTRATIVE_BLOC_ID && (state.administrativeInstitutions?.pressure ?? 0) >= 60,
  );
  const index = Math.floor((state.totalTicks ?? 0) / FACTION_DEMAND_INTERVAL) % eligible.length;
  const faction = pressuredBloc ?? eligible[index];
  const eventId = `${DEMAND_PREFIX}${faction.id}`;
  const lastDemandTick = state.eventTriggerCooldowns?.[eventId];
  if (lastDemandTick !== undefined && (state.totalTicks ?? 0) - lastDemandTick < FACTION_DEMAND_COOLDOWN) {
    return null;
  }
  return makeFactionDemandEvent(state, faction);
}
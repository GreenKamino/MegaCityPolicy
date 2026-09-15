import type {
  AppointmentMethod,
  GameState,
  OfficerAutoFillDoctrineId,
  OfficerAutoFillResult,
} from "@/engine/types";

export type OfficerAutoFillDoctrine = {
  id: OfficerAutoFillDoctrineId;
  name: string;
  description: string;
  appointmentMethod: AppointmentMethod;
  costPerSeat: number;
  competenceDelta: number;
  loyaltyDelta: number;
  corruptionDelta: number;
  factionLoyaltyDelta: number;
  factionInfluenceDelta: number;
  factionThreatDelta: number;
  factionConsequence: string;
};

export const OFFICER_AUTO_FILL_DOCTRINES: OfficerAutoFillDoctrine[] = [
  {
    id: "loyalists",
    name: "Loyalist Slate",
    description: "Prioritize personal loyalty over independent expertise.",
    appointmentMethod: "direct",
    costPerSeat: 1200,
    competenceDelta: -4,
    loyaltyDelta: 15,
    corruptionDelta: 6,
    factionLoyaltyDelta: -2,
    factionInfluenceDelta: 0,
    factionThreatDelta: 1,
    factionConsequence: "Internal factions resent exclusion.",
  },
  {
    id: "meritocrats",
    name: "Meritocratic Commission",
    description: "Fund examinations and appoint the strongest administrators.",
    appointmentMethod: "merit",
    costPerSeat: 2000,
    competenceDelta: 12,
    loyaltyDelta: -4,
    corruptionDelta: -6,
    factionLoyaltyDelta: -3,
    factionInfluenceDelta: -1,
    factionThreatDelta: 1,
    factionConsequence: "Faction patronage networks lose influence.",
  },
  {
    id: "faction_balance",
    name: "Faction Balance",
    description: "Distribute offices across the active internal blocs.",
    appointmentMethod: "faction_nomination",
    costPerSeat: 1600,
    competenceDelta: 3,
    loyaltyDelta: 5,
    corruptionDelta: 2,
    factionLoyaltyDelta: 4,
    factionInfluenceDelta: 1,
    factionThreatDelta: -2,
    factionConsequence: "Internal factions gain representation and influence.",
  },
  {
    id: "emergency_conscription",
    name: "Emergency Conscription",
    description: "Fill every desk immediately with available personnel.",
    appointmentMethod: "council_vote",
    costPerSeat: 400,
    competenceDelta: -12,
    loyaltyDelta: -8,
    corruptionDelta: 8,
    factionLoyaltyDelta: -5,
    factionInfluenceDelta: 0,
    factionThreatDelta: 3,
    factionConsequence: "Internal factions oppose compulsory appointments.",
  },
];

const OFFICER_AUTO_FILL_DOCTRINE_IDS = new Set<OfficerAutoFillDoctrineId>(
  OFFICER_AUTO_FILL_DOCTRINES.map((doctrine) => doctrine.id),
);

export function isOfficerAutoFillDoctrineId(
  value: unknown,
): value is OfficerAutoFillDoctrineId {
  return typeof value === "string"
    && OFFICER_AUTO_FILL_DOCTRINE_IDS.has(value as OfficerAutoFillDoctrineId);
}

export type OfficerAutoFillTransaction =
  | { ok: true; next: GameState; result: OfficerAutoFillResult }
  | { ok: false; reason: string };

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

export function getOfficerAutoFillDoctrine(
  id: OfficerAutoFillDoctrineId,
): OfficerAutoFillDoctrine {
  const doctrine = OFFICER_AUTO_FILL_DOCTRINES.find((candidate) => candidate.id === id);
  if (!doctrine) throw new Error(`Unknown officer auto-fill doctrine: ${id}`);
  return doctrine;
}

export function getOfficerAutoFillCost(
  doctrineId: OfficerAutoFillDoctrineId,
  vacancyCount: number,
): number {
  return getOfficerAutoFillDoctrine(doctrineId).costPerSeat * Math.max(0, vacancyCount);
}

export function applyOfficerAutoFillDoctrine(
  state: GameState,
  doctrineId: OfficerAutoFillDoctrineId,
): OfficerAutoFillTransaction {
  const doctrine = getOfficerAutoFillDoctrine(doctrineId);
  const vacancies = (state.officers ?? []).filter((officer) => !officer.appointed);
  if (vacancies.length === 0) return { ok: false, reason: "No officer vacancies remain." };

  const totalCost = getOfficerAutoFillCost(doctrineId, vacancies.length);
  const credits = state.resources?.credits ?? 0;
  if (credits < totalCost) {
    return {
      ok: false,
      reason: `Requires ${totalCost.toLocaleString()} credits; treasury holds ${Math.floor(credits).toLocaleString()}.`,
    };
  }

  const year = state.gameDate?.year ?? 0;
  let competenceDeltaTotal = 0;
  let loyaltyDeltaTotal = 0;
  let corruptionDeltaTotal = 0;
  const officers = (state.officers ?? []).map((officer) => {
    if (officer.appointed) return officer;
    const competence = clamp(officer.competence + doctrine.competenceDelta);
    const loyalty = clamp(officer.loyalty + doctrine.loyaltyDelta);
    const corruption = clamp(officer.corruption + doctrine.corruptionDelta);
    competenceDeltaTotal += competence - officer.competence;
    loyaltyDeltaTotal += loyalty - officer.loyalty;
    corruptionDeltaTotal += corruption - officer.corruption;
    const careerLog = [
      ...(officer.careerLog ?? []),
      { year, text: `Appointed under ${doctrine.name}.` },
    ];
    return {
      ...officer,
      appointed: true,
      appointmentMethod: doctrine.appointmentMethod,
      appointedYear: year,
      yearsServed: 0,
      competence,
      loyalty,
      corruption,
      careerLog: careerLog.slice(-24),
    };
  });

  let affectedFactionCount = 0;
  let factionLoyaltyDeltaTotal = 0;
  let factionInfluenceDeltaTotal = 0;
  let factionThreatDeltaTotal = 0;
  const factions = (state.factions ?? []).map((faction) => {
    if (!faction.isActive || faction.scope !== "internal") return faction;
    const loyalty = clamp(faction.loyalty + doctrine.factionLoyaltyDelta);
    const influence = clamp(faction.influence + doctrine.factionInfluenceDelta);
    const threat = clamp(faction.threat + doctrine.factionThreatDelta);
    affectedFactionCount += 1;
    factionLoyaltyDeltaTotal += loyalty - faction.loyalty;
    factionInfluenceDeltaTotal += influence - faction.influence;
    factionThreatDeltaTotal += threat - faction.threat;
    return {
      ...faction,
      loyalty,
      influence,
      threat,
    };
  });
  const averageDelta = (total: number, count: number): number => (
    count > 0 ? Number((total / count).toFixed(1)) : 0
  );

  const result: OfficerAutoFillResult = {
    doctrineId,
    filled: vacancies.length,
    totalCost,
    appliedAtTick: state.totalTicks ?? 0,
    appliedYear: year,
    averageCompetenceDelta: averageDelta(competenceDeltaTotal, vacancies.length),
    averageLoyaltyDelta: averageDelta(loyaltyDeltaTotal, vacancies.length),
    averageCorruptionDelta: averageDelta(corruptionDeltaTotal, vacancies.length),
    affectedFactionCount,
    factionLoyaltyDelta: averageDelta(factionLoyaltyDeltaTotal, affectedFactionCount),
    factionInfluenceDelta: averageDelta(factionInfluenceDeltaTotal, affectedFactionCount),
    factionThreatDelta: averageDelta(factionThreatDeltaTotal, affectedFactionCount),
  };

  return {
    ok: true,
    result,
    next: {
      ...state,
      officers,
      factions,
      resources: { ...state.resources, credits: credits - totalCost },
      lastOfficerAutoFillResult: result,
    },
  };
}
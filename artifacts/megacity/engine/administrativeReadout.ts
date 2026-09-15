import { ADMINISTRATIVE_BLOC_ID } from "@/engine/administrativeBloc";
import type { AdministrativeCohortId, GameState } from "@/engine/types";

export const ADMINISTRATIVE_COHORT_LABELS: Record<AdministrativeCohortId, string> = {
  civil_administration: "Civil administration",
  inspection: "Inspection",
  legal: "Legal",
  auditing: "Auditing",
  treasury_finance: "Treasury / finance",
  procurement: "Procurement",
  financial_district: "Financial-district administration",
};

export const ADMINISTRATIVE_EFFECT_LABELS: Record<string, string> = {
  factionLoyalty: "Faction loyalty",
  factionInfluence: "Faction influence",
  factionThreat: "Faction threat",
  administrativeCapacity: "Administrative capacity",
  institutionalIndependence: "Institutional independence",
  administrativePressure: "Administrative pressure",
  administrativeRadicalization: "Bloc radicalization",
};

export function formatAdministrativeEffectLabel(key: string): string {
  return ADMINISTRATIVE_EFFECT_LABELS[key] ?? key;
}

export type AdministrativeSurface = "economy" | "finances" | "law" | "officers" | "districts";

export type AdministrativeReadout = {
  telemetry: NonNullable<GameState["administrativeInstitutions"]>;
  faction: NonNullable<GameState["factions"][number]>;
  staffing: { appointed: number; total: number; vacancies: number };
  demand: NonNullable<GameState["activeEvents"]>[number] | null;
  posture: "STABLE" | "STRAINED" | "CRITICAL";
  postureNote: string;
  surface: Record<AdministrativeSurface, Array<{ label: string; value: string; tone: "good" | "warn" | "bad" | "neutral" }>>;
};

const pct = (value: number) => `${Math.round(value)}%`;
const toneFor = (value: number, inverted = false): "good" | "warn" | "bad" | "neutral" => {
  const score = inverted ? 100 - value : value;
  return score >= 65 ? "good" : score >= 40 ? "warn" : "bad";
};

export function getAdministrativeReadout(state: GameState): AdministrativeReadout | null {
  const telemetry = state.administrativeInstitutions;
  const faction = state.factions.find(candidate => candidate.id === ADMINISTRATIVE_BLOC_ID);
  if (!telemetry || !faction) return null;
  const appointed = (state.officers ?? []).filter(officer => officer.appointed).length;
  const total = state.officers?.length ?? 0;
  const pressure = telemetry.pressure;
  const posture = pressure >= 70 ? "CRITICAL" : pressure >= 50 ? "STRAINED" : "STABLE";
  const demand = (state.activeEvents ?? []).find(event => event.factionId === ADMINISTRATIVE_BLOC_ID) ?? null;
  const cohorts = telemetry.cohorts;
  const averageDistrict = (state.districts ?? []).length > 0
    ? (state.districts ?? []).reduce((sum, district) => sum + district.infraQuality, 0) / state.districts.length
    : 0;
  const relevantOfficers = (departmentNames: string[]) =>
    (state.officers ?? []).filter(officer => departmentNames.includes(officer.department)).length;

  return {
    telemetry,
    faction,
    staffing: { appointed, total, vacancies: Math.max(0, total - appointed) },
    demand,
    posture,
    postureNote: pressure >= 70
      ? "Critical pressure is increasing Bloc threat and intrigue risk."
      : pressure >= 50
        ? "Workload or institutional stress is narrowing response capacity."
        : "Institutional pressure is within the operating band.",
    surface: {
      economy: [
        { label: "Procurement throughput", value: pct(cohorts.procurement.effectiveness), tone: toneFor(cohorts.procurement.effectiveness) },
        { label: "Approval workload", value: pct(cohorts.civil_administration.workload), tone: toneFor(cohorts.civil_administration.workload, true) },
        { label: "Financial administration", value: pct(cohorts.treasury_finance.effectiveness), tone: toneFor(cohorts.treasury_finance.effectiveness) },
      ],
      finances: [
        { label: "Treasury / finance", value: pct(cohorts.treasury_finance.effectiveness), tone: toneFor(cohorts.treasury_finance.effectiveness) },
        { label: "Treasury reserve", value: `${Math.round(state.resources.credits).toLocaleString()} cr`, tone: state.resources.credits < 100_000 ? "bad" : "neutral" },
        { label: "Financial district", value: pct(cohorts.financial_district.effectiveness), tone: toneFor(cohorts.financial_district.effectiveness) },
      ],
      law: [
        { label: "Legal workload", value: pct(cohorts.legal.workload), tone: toneFor(cohorts.legal.workload, true) },
        { label: "Inspection coverage", value: pct(cohorts.inspection.effectiveness), tone: toneFor(cohorts.inspection.effectiveness) },
        { label: "Audit exposure", value: pct(cohorts.auditing.corruptionExposure), tone: toneFor(cohorts.auditing.corruptionExposure, true) },
      ],
      officers: [
        { label: "Appointed staff", value: `${appointed}/${total}`, tone: appointed === total ? "good" : "warn" },
        { label: "Vacant posts", value: String(Math.max(0, total - appointed)), tone: total - appointed > 0 ? "warn" : "good" },
        { label: "Administrative departments", value: String(relevantOfficers(["executive_council", "economic", "district", "infrastructure"])), tone: "neutral" },
      ],
      districts: [
        { label: "District support", value: pct(averageDistrict), tone: toneFor(averageDistrict) },
        { label: "Inspection workload", value: pct(cohorts.inspection.workload), tone: toneFor(cohorts.inspection.workload, true) },
        { label: "Procurement capacity", value: pct(cohorts.procurement.capacity), tone: toneFor(cohorts.procurement.capacity) },
      ],
    },
  };
}
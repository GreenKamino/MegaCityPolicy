import { ADMINISTRATIVE_BLOC_ID } from "@/engine/administrativeBloc";
import type {
  AdministrativeCohort,
  AdministrativeCohortId,
  AdministrativeInstitutions,
  AdministrativeReformDirection,
  GameState,
  Officer,
  OfficerDepartment,
  TickEntry,
} from "@/engine/types";
import { applyInfrastructureHealthDelta } from "@/engine/infrastructureLedger";

const COHORT_IDS: AdministrativeCohortId[] = [
  "civil_administration",
  "inspection",
  "legal",
  "auditing",
  "treasury_finance",
  "procurement",
  "financial_district",
];

const DEPARTMENTS: Record<AdministrativeCohortId, OfficerDepartment[]> = {
  civil_administration: ["supreme_leadership", "executive_council", "civic", "district"],
  inspection: ["infrastructure", "law_enforcement", "district"],
  legal: ["judicial", "law_enforcement"],
  auditing: ["executive_council", "economic", "law_enforcement"],
  treasury_finance: ["economic", "executive_council"],
  procurement: ["economic", "infrastructure", "defense"],
  financial_district: ["economic", "district"],
};

const DISTRICT_TERMS: Record<AdministrativeCohortId, string[]> = {
  civil_administration: ["command", "administr", "government", "policy", "records"],
  inspection: ["monitoring", "inspection", "industrial", "utility"],
  legal: ["judicial", "tribunal", "court"],
  auditing: ["records", "data", "treasury", "exchange"],
  treasury_finance: ["treasury", "financial", "exchange", "corporate"],
  procurement: ["industrial", "logistics", "warehouse", "construction"],
  financial_district: ["financial", "exchange", "commerce", "corporate", "market"],
};

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const round1 = (value: number): number => Math.round(value * 10) / 10;
const average = (values: number[], fallback = 50): number =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;

const REFORM_EFFECTS: Record<
  AdministrativeReformDirection,
  { capacity: number; independence: number; oversight: number; workload: number; exposure: number }
> = {
  balanced: { capacity: 0, independence: 0, oversight: 0, workload: 0, exposure: 0 },
  watchdog_expansion: { capacity: -2, independence: 8, oversight: 10, workload: 4, exposure: -8 },
  centralization: { capacity: 8, independence: -7, oversight: -2, workload: -5, exposure: 3 },
  decentralization: { capacity: 3, independence: 5, oversight: 2, workload: -4, exposure: -2 },
  austerity: { capacity: -9, independence: -2, oversight: -5, workload: 7, exposure: 5 },
  expedited_approvals: { capacity: 10, independence: -10, oversight: -8, workload: -8, exposure: 9 },
  public_prosecution: { capacity: -3, independence: 10, oversight: 8, workload: 5, exposure: -12 },
};

function relevantOfficers(state: GameState, id: AdministrativeCohortId): Officer[] {
  return (state.officers ?? []).filter(
    officer => officer.appointed && DEPARTMENTS[id].includes(officer.department),
  );
}

function districtSupport(state: GameState, id: AdministrativeCohortId): number {
  const terms = DISTRICT_TERMS[id];
  const districts = (state.districts ?? []).filter(district => {
    const text = `${district.id} ${district.name} ${district.subtitle}`.toLowerCase();
    return terms.some(term => text.includes(term));
  });
  if (districts.length === 0) return 45;
  return average(
    districts.map(district =>
      clamp(
        district.infraQuality * 0.45 +
        district.loyalty * 0.2 +
        district.wealth * 0.15 +
        (100 - district.crime) * 0.1 +
        (100 - district.unrest) * 0.1,
      ),
    ),
  );
}

function workloadFor(state: GameState, id: AdministrativeCohortId): number {
  const populationLoad = clamp(Math.log10(Math.max(10, state.demographics?.totalPopulation ?? 10)) * 10, 10, 75);
  const contracts = (state.activeContracts?.length ?? 0) * 5;
  const operations = (state.activeOperations?.length ?? 0) * 4 + (state.lawMissions?.filter(m => m.status === "active").length ?? 0) * 3;
  const companies = (state.companies?.length ?? 0) * 1.5;
  const construction = (state.pendingConstructions?.length ?? 0) * 4;
  const crime = clamp(state.cityStats?.crime ?? 0);
  const corruption = clamp(state.cityStats?.corruption ?? 0);
  const baseByCohort: Record<AdministrativeCohortId, number> = {
    civil_administration: populationLoad + contracts * 0.4,
    inspection: populationLoad * 0.45 + construction + companies + crime * 0.25,
    legal: populationLoad * 0.35 + operations + crime * 0.45,
    auditing: contracts + companies * 1.2 + corruption * 0.55,
    treasury_finance: populationLoad * 0.3 + companies * 1.5 + contracts * 0.5,
    procurement: construction + contracts * 1.5 + (state.units ? Object.values(state.units).reduce((sum, n) => sum + (Number(n) || 0), 0) * 0.02 : 0),
    financial_district: companies * 2 + contracts * 0.5 + corruption * 0.25,
  };
  return clamp(baseByCohort[id]);
}

function computeCohort(state: GameState, id: AdministrativeCohortId): AdministrativeCohort {
  const officers = relevantOfficers(state, id);
  const officerCompetence = average(officers.map(officer => clamp(officer.competence)), 42);
  const officerIntegrity = average(officers.map(officer => 100 - clamp(officer.corruption)), 48);
  const officerLoyalty = average(officers.map(officer => clamp(officer.loyalty)), 50);
  const support = districtSupport(state, id);
  const workload = workloadFor(state, id);
  const presence = state.factions.find(faction => faction.id === ADMINISTRATIVE_BLOC_ID)?.institutionalPresence ?? 50;
  const staffing = Math.round(clamp(
    (state.demographics?.totalPopulation ?? 0) / 8000 +
    officers.length * 650 +
    support * 35,
    500,
    250_000,
  ));
  const capacity = clamp(support * 0.42 + officerCompetence * 0.3 + presence * 0.18 + Math.min(100, officers.length * 8) * 0.1);
  const independence = clamp(officerIntegrity * 0.52 + officerLoyalty * 0.18 + (100 - (state.cityStats?.corruption ?? 0)) * 0.3);
  const corruptionExposure = clamp(
    (state.cityStats?.corruption ?? 0) * 0.42 +
    (100 - officerIntegrity) * 0.33 +
    workload * 0.25,
  );
  const effectiveness = clamp(capacity * 0.48 + independence * 0.27 + support * 0.2 - Math.max(0, workload - capacity) * 0.45 + 5);
  return {
    id,
    staffing,
    capacity: round1(capacity),
    effectiveness: round1(effectiveness),
    independence: round1(independence),
    workload: round1(workload),
    corruptionExposure: round1(corruptionExposure),
  };
}

export function computeAdministrativeInstitutions(state: GameState): AdministrativeInstitutions {
  const reformDirection = state.administrativeInstitutions?.reformDirection ?? "balanced";
  const reform = REFORM_EFFECTS[reformDirection] ?? REFORM_EFFECTS.balanced;
  const cohorts = Object.fromEntries(
    COHORT_IDS.map(id => [id, computeCohort(state, id)]),
  ) as Record<AdministrativeCohortId, AdministrativeCohort>;
  for (const cohort of Object.values(cohorts)) {
    cohort.capacity = round1(clamp(cohort.capacity + reform.capacity));
    cohort.independence = round1(clamp(cohort.independence + reform.independence));
    cohort.workload = round1(clamp(cohort.workload + reform.workload));
    cohort.corruptionExposure = round1(clamp(cohort.corruptionExposure + reform.exposure));
    cohort.effectiveness = round1(clamp(
      cohort.effectiveness +
      reform.capacity * 0.55 +
      reform.independence * 0.25 -
      reform.workload * 0.35 -
      reform.exposure * 0.2,
    ));
  }
  const values = COHORT_IDS.map(id => cohorts[id]);
  const overallCapacity = round1(average(values.map(value => value.capacity)));
  const overallEffectiveness = round1(average(values.map(value => value.effectiveness)));
  const workloadPressure = round1(average(values.map(value => value.workload)));
  const corruptionExposure = round1(average(values.map(value => value.corruptionExposure)));
  const oversightCoverage = round1(clamp(average([
    cohorts.inspection.effectiveness,
    cohorts.auditing.effectiveness,
    cohorts.legal.independence,
  ]) + reform.oversight));
  const appointed = (state.officers ?? []).filter(officer => officer.appointed).length;
  const vacancyPressure = clamp((5 - appointed) * 5, 0, 25);
  const treasuryPressure = state.resources.credits < 25_000
    ? 20
    : state.resources.credits < 100_000 ? 10 : 0;
  const lawPressure = Math.max(0, 45 - state.cityStats.lawOrder) * 0.4 +
    Math.max(0, state.cityStats.crime - 50) * 0.25;
  const pressure = round1(clamp(
    35 +
    (workloadPressure - overallEffectiveness) * 0.75 +
    corruptionExposure * 0.22 +
    vacancyPressure +
    treasuryPressure +
    lawPressure -
    oversightCoverage * 0.12,
  ));
  return {
    cohorts,
    overallCapacity,
    overallEffectiveness,
    oversightCoverage,
    workloadPressure,
    corruptionExposure,
    pressure,
    reformDirection,
    reformAdoptedTick: state.administrativeInstitutions?.reformAdoptedTick ?? 0,
    lastUpdatedTick: Math.max(0, Math.round(state.totalTicks ?? 0)),
  };
}

export function createDefaultAdministrativeInstitutions(): AdministrativeInstitutions {
  const cohort = (id: AdministrativeCohortId): AdministrativeCohort => ({
    id,
    staffing: 0,
    capacity: 50,
    effectiveness: 50,
    independence: 50,
    workload: 50,
    corruptionExposure: 50,
  });
  return {
    cohorts: Object.fromEntries(COHORT_IDS.map(id => [id, cohort(id)])) as Record<AdministrativeCohortId, AdministrativeCohort>,
    overallCapacity: 50,
    overallEffectiveness: 50,
    oversightCoverage: 50,
    workloadPressure: 50,
    corruptionExposure: 50,
    pressure: 50,
    reformDirection: "balanced",
    reformAdoptedTick: 0,
    lastUpdatedTick: 0,
  };
}

export function processAdministrativeInstitutions(state: GameState, entries: TickEntry[]): void {
  const tick = Math.max(0, Math.round(state.totalTicks ?? 0));
  const previous = state.administrativeInstitutions;
  // Demands and administrative stat effects both consume this snapshot on
  // four-tick boundaries. Refresh once after hydration, then share that cadence.
  if (previous && previous.lastUpdatedTick > 0 && tick % 4 !== 0) return;

  const telemetry = computeAdministrativeInstitutions(state);
  state.administrativeInstitutions = telemetry;

  if (tick % 8 === 4 && state.intrigue) {
    const current = state.intrigue.radicalization[ADMINISTRATIVE_BLOC_ID] ?? 0;
    const pressureDelta = clamp((telemetry.pressure - 55) / 12, -1.5, 3);
    state.intrigue = {
      ...state.intrigue,
      radicalization: {
        ...state.intrigue.radicalization,
        [ADMINISTRATIVE_BLOC_ID]: round1(clamp(current + pressureDelta)),
      },
    };
  }

  if (tick % 4 !== 0) return;
  const net = clamp((telemetry.overallEffectiveness - telemetry.workloadPressure) / 20, -2, 2);
  const oversight = clamp((telemetry.oversightCoverage - telemetry.corruptionExposure) / 25, -2, 2);
  if (Math.abs(net) >= 0.1) {
    const infrastructure = applyInfrastructureHealthDelta(
      state,
      net * 0.25,
      `tick:${tick}:administrative-capacity`,
      net >= 0 ? "Administrative capacity repair" : "Administrative capacity degradation",
    );
    state.infrastructureLedger = infrastructure.infrastructureLedger;
    state.cityStats.infrastructureHealth = infrastructure.cityStats.infrastructureHealth;
    state.cityStats.lawOrder = clamp(state.cityStats.lawOrder + net * 0.2);
    state.cityStats.crime = clamp(state.cityStats.crime - net * 0.12);
    entries.push({
      label: "Administrative Capacity",
      delta: round1(net),
      unit: "index",
      reason: net >= 0 ? "Institutional throughput exceeds current workload" : "Administrative workload exceeds institutional throughput",
      severity: net >= 0 ? "positive" : "warning",
    });
  }
  if (Math.abs(oversight) >= 0.1) {
    state.cityStats.corruption = clamp(state.cityStats.corruption - oversight * 0.18);
    entries.push({
      label: "Institutional Oversight",
      delta: round1(oversight),
      unit: "index",
      reason: oversight >= 0 ? "Auditing and legal independence constrain corruption exposure" : "Corruption exposure exceeds oversight coverage",
      severity: oversight >= 0 ? "positive" : "warning",
    });
  }
}
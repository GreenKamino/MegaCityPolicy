import { describe, expect, it } from "vitest";

import {
  computeAdministrativeInstitutions,
  processAdministrativeInstitutions,
} from "@/engine/administrativeInstitutions";
import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { runLiveTick } from "@/engine/liveTickPipeline";
import { migrateState } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";
import type { GameState, TickEntry } from "@/engine/types";
import { ADMINISTRATIVE_BLOC_ID } from "@/engine/administrativeBloc";

function strongState(): GameState {
  const state = createInitialState();
  state.officers = state.officers.map(officer => ({
    ...officer,
    appointed: true,
    competence: 90,
    loyalty: 85,
    corruption: 5,
  }));
  state.cityStats.corruption = 8;
  state.cityStats.crime = 12;
  state.districts = state.districts.map(district => ({
    ...district,
    infraQuality: 90,
    loyalty: 85,
    crime: 8,
    unrest: 8,
  }));
  return state;
}

describe("administrative institutions", () => {
  it("computes seven deterministic, bounded aggregate cohorts", () => {
    const state = createInitialState();
    const first = computeAdministrativeInstitutions(state);
    const second = computeAdministrativeInstitutions(state);
    expect(first).toEqual(second);
    expect(Object.keys(first.cohorts)).toHaveLength(7);
    for (const cohort of Object.values(first.cohorts)) {
      expect(cohort.staffing).toBeGreaterThanOrEqual(0);
      for (const value of [
        cohort.capacity,
        cohort.effectiveness,
        cohort.independence,
        cohort.workload,
        cohort.corruptionExposure,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("reflects strong staffing and weak, corrupt vacancies", () => {
    const strong = computeAdministrativeInstitutions(strongState());
    const weakState = createInitialState();
    weakState.officers = weakState.officers.map(officer => ({
      ...officer,
      appointed: false,
      competence: 10,
      corruption: 95,
    }));
    weakState.cityStats.corruption = 95;
    weakState.cityStats.crime = 85;
    weakState.activeContracts = Array.from({ length: 20 }, (_, index) => ({
      ...weakState.activeContracts[0],
      id: `work-${index}`,
    })).filter(Boolean) as GameState["activeContracts"];
    const weak = computeAdministrativeInstitutions(weakState);

    expect(strong.overallEffectiveness).toBeGreaterThan(weak.overallEffectiveness);
    expect(strong.oversightCoverage).toBeGreaterThan(weak.oversightCoverage);
    expect(strong.corruptionExposure).toBeLessThan(weak.corruptionExposure);
    expect(strong.pressure).toBeLessThan(weak.pressure);
  });

  it("tracks district, company, contract, construction, and legal workload", () => {
    const baselineState = createInitialState();
    const baseline = computeAdministrativeInstitutions(baselineState);
    const loaded = createInitialState();
    loaded.companies = Array.from({ length: 20 }, (_, index) => ({ ...loaded.companies[0], id: `company-${index}` })).filter(Boolean) as GameState["companies"];
    loaded.activeContracts = Array.from({ length: 12 }, (_, index) => ({ ...loaded.activeContracts[0], id: `contract-${index}` })).filter(Boolean) as GameState["activeContracts"];
    loaded.pendingConstructions = Array.from({ length: 8 }, (_, index) => ({ ...loaded.pendingConstructions?.[0], id: `build-${index}` })).filter(Boolean) as NonNullable<GameState["pendingConstructions"]>;
    loaded.lawMissions = Array.from({ length: 8 }, (_, index) => ({
      id: `law-${index}`,
      name: "Audit",
      description: "",
      type: "investigation",
      status: "active",
      difficulty: 1,
      requiredUnits: 1,
      assignedUnits: 1,
      ticksRemaining: 2,
      rewards: {},
      risks: "",
    }));
    const result = computeAdministrativeInstitutions(loaded);
    expect(result.workloadPressure).toBeGreaterThan(baseline.workloadPressure);
    expect(result.cohorts.procurement.workload).toBeGreaterThan(baseline.cohorts.procurement.workload);
    expect(result.cohorts.legal.workload).toBeGreaterThan(baseline.cohorts.legal.workload);
  });

  it("applies bounded effects and emits operational telemetry every four ticks", () => {
    const state = strongState();
    state.totalTicks = 4;
    const before = { ...state.cityStats };
    const entries: TickEntry[] = [];
    processAdministrativeInstitutions(state, entries);
    expect(state.administrativeInstitutions?.lastUpdatedTick).toBe(4);
    expect(state.cityStats.infrastructureHealth).toBeGreaterThanOrEqual(before.infrastructureHealth);
    expect(state.cityStats.corruption).toBeLessThanOrEqual(before.corruption);
    expect(entries.some(entry => entry.label === "Administrative Capacity")).toBe(true);
  });

  it("runs through both full-tick entry points", () => {
    const state = createInitialState();
    const direct = runTick(state).newState;
    const live = runLiveTick(state).state;
    expect(direct.administrativeInstitutions?.lastUpdatedTick).toBe(direct.totalTicks);
    expect(live.administrativeInstitutions).toEqual(direct.administrativeInstitutions);
  });

  it("makes reform directions persistently alter capacity and independence", () => {
    const centralized = strongState();
    centralized.administrativeInstitutions = {
      ...centralized.administrativeInstitutions!,
      reformDirection: "centralization",
      reformAdoptedTick: 10,
    };
    const watched = strongState();
    watched.administrativeInstitutions = {
      ...watched.administrativeInstitutions!,
      reformDirection: "watchdog_expansion",
      reformAdoptedTick: 10,
    };
    const centralResult = computeAdministrativeInstitutions(centralized);
    const watchdogResult = computeAdministrativeInstitutions(watched);
    expect(centralResult.overallCapacity).toBeGreaterThan(watchdogResult.overallCapacity);
    expect(watchdogResult.cohorts.auditing.independence)
      .toBeGreaterThan(centralResult.cohorts.auditing.independence);
    expect(watchdogResult.corruptionExposure).toBeLessThan(centralResult.corruptionExposure);
  });

  it("feeds sustained administrative pressure into the existing intrigue record", () => {
    const state = createInitialState();
    state.totalTicks = 12;
    state.resources.credits = 0;
    state.cityStats.corruption = 90;
    state.cityStats.lawOrder = 20;
    state.officers = state.officers.map(officer => ({ ...officer, appointed: false }));
    state.intrigue = { radicalization: { [ADMINISTRATIVE_BLOC_ID]: 10 }, plots: [] };
    processAdministrativeInstitutions(state, []);
    expect(state.administrativeInstitutions!.pressure).toBeGreaterThan(60);
    expect(state.intrigue.radicalization[ADMINISTRATIVE_BLOC_ID]).toBeGreaterThan(10);
  });

  it("backfills legacy saves and clamps malformed telemetry", () => {
    const legacy = { ...createInitialState(), administrativeInstitutions: undefined };
    expect(migrateState(legacy).administrativeInstitutions).toBeDefined();

    const malformed = createInitialState();
    malformed.administrativeInstitutions = {
      ...malformed.administrativeInstitutions!,
      overallCapacity: 999,
      corruptionExposure: -30,
      pressure: 999,
      reformDirection: "not-real" as any,
      reformAdoptedTick: -20,
      cohorts: {
        ...malformed.administrativeInstitutions!.cohorts,
        auditing: {
          ...malformed.administrativeInstitutions!.cohorts.auditing,
          effectiveness: Number.NaN,
          workload: 900,
        },
      },
    };
    const repaired = sanitizeState(malformed).administrativeInstitutions!;
    expect(repaired.overallCapacity).toBe(100);
    expect(repaired.corruptionExposure).toBe(0);
    expect(repaired.pressure).toBe(100);
    expect(repaired.reformDirection).toBe("balanced");
    expect(repaired.reformAdoptedTick).toBe(0);
    expect(repaired.cohorts.auditing.effectiveness).toBe(50);
    expect(repaired.cohorts.auditing.workload).toBe(100);
  });
});
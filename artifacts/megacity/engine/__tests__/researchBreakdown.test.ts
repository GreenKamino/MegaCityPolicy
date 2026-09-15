import { describe, expect, it } from "vitest";

import { createInitialState, createOneMonthState } from "@/engine/initialState";
import {
  getResearchBreakdown,
  getResearchEstimateSnapshot,
  getResearchEstimateTiming,
  getResearchQueueTechIds,
  getResearchQueueUnlockEstimates,
  getResearchUnlockEstimate,
} from "@/engine/researchBreakdown";
import { migrateState } from "@/engine/saveLoad";
import { TECH_MAP } from "@/engine/technologies";
import { runTick } from "@/engine/formulas";
import { COMPANIES_MAP } from "@/engine/companies";
import { runOfflineCatchup } from "@/engine/offlineCatchup";

describe("research breakdown", () => {
  it("matches the amount applied to active research", () => {
    const state = createInitialState();
    state.activeResearch = { techId: "advanced_fusion_reactors", progress: 0, cost: 2400 };
    state.units.researchScientists = 10;
    state.units.aiSystemsEngineers = 10;
    state.units.cyberneticsResearchers = 0;
    state.units.experimentalPhysicsTeams = 0;
    state.units.dataArchiveAnalysts = 0;
    state.companies = [{
      companyId: "novalogic-systems",
      districtId: state.districts[0]!.id,
      licenseDate: 0,
      status: "active",
    }];
    const before = state.activeResearch.progress;
    const expected = getResearchBreakdown(state).gain;
    const next = runTick(state).newState;

    expect(next.activeResearch?.progress ?? 0).toBe(before + expected);
    expect(next.cityStats.researchProgress).toBe(expected);
    expect(getResearchBreakdown(state).specialists).toBe(5);
  });

  it("includes the documented full value of operational licensed corporations", () => {
    const state = createInitialState();
    state.companies = [{
      companyId: "novalogic-systems",
      districtId: state.districts[0]!.id,
      licenseDate: 0,
      status: "active",
    }];
    const breakdown = getResearchBreakdown(state);
    expect(breakdown.corporations).toBe(COMPANIES_MAP["novalogic-systems"]!.effects.research);
  });

  it("covers early, mid and late progression bands without changing tech costs", () => {
    const early = createInitialState();
    const mid = createOneMonthState();
    const late = createOneMonthState();
    late.buildings.quantumDataCenters = 2;
    late.buildings.advancedResearchLabs = 6;
    late.units.experimentalPhysicsTeams = 8;
    late.difficulty = "hard";

    const earlyRate = getResearchBreakdown(early).gain;
    const midRate = getResearchBreakdown(mid).gain;
    const lateRate = getResearchBreakdown(late).gain;

    expect(earlyRate).toBeGreaterThan(0);
    expect(midRate).toBeGreaterThan(earlyRate);
    expect(lateRate).toBeGreaterThan(midRate);
    expect(lateRate).toBeLessThan(1000);
  });

  it("estimates remaining ticks and real time from the applied research gain", () => {
    expect(getResearchUnlockEstimate(125, 1000, 35, 5)).toEqual({
      remainingPoints: 875,
      ticksRemaining: 25,
      minutesRemaining: 125,
    });
  });

  it("reports a stalled estimate when the shared research gain is zero", () => {
    expect(getResearchUnlockEstimate(125, 1000, 0, 5)).toEqual({
      remainingPoints: 875,
      ticksRemaining: null,
      minutesRemaining: null,
    });
  });

  it("keeps a zero-capacity city numerically valid with an active project", () => {
    const state = createInitialState();
    state.buildings = {
      ...state.buildings,
      advancedResearchLabs: 0,
      cyberneticsDevelopmentFacilities: 0,
      forensicScienceInstitutes: 0,
      experimentalTechVaults: 0,
      urbanSystemsAICenters: 0,
      archiveRecoveryLabs: 0,
      medicalResearchComplexes: 0,
      weaponDevelopmentFacilities: 0,
      quantumDataCenters: 0,
      predictiveAnalyticsSupercomputers: 0,
      oracleChambers: 0,
      geneVaults: 0,
    };
    state.units = {
      ...state.units,
      researchScientists: 0,
      aiSystemsEngineers: 0,
      cyberneticsResearchers: 0,
      experimentalPhysicsTeams: 0,
      dataArchiveAnalysts: 0,
    };
    state.companies = [];
    state.activeResearch = {
      techId: "advanced_fusion_reactors",
      progress: 0,
      cost: 2400,
    };

    const snapshot = getResearchEstimateSnapshot(state);

    expect(snapshot.breakdown.base).toBe(0);
    expect(snapshot.breakdown.corporations).toBe(0);
    expect(snapshot.breakdown.specialists).toBe(0);
    expect(snapshot.breakdown.rawPoints).toBe(0);
    expect(snapshot.researchRate).toBe(0);
    expect(snapshot.activeResearch).toEqual({
      remainingPoints: 2400,
      ticksRemaining: null,
      minutesRemaining: null,
    });
    expect(Number.isFinite(snapshot.breakdown.multiplier)).toBe(true);
    expect(snapshot.breakdown.lines.every((line) => Number.isFinite(line.value))).toBe(true);
  });

  it("refreshes the estimate when difficulty changes the shared research output", () => {
    const state = createInitialState();
    state.buildings.advancedResearchLabs = 1;
    state.activeResearch = { techId: "advanced_fusion_reactors", progress: 0, cost: 2400 };

    const medium = getResearchEstimateSnapshot(state);
    const hard = getResearchEstimateSnapshot({ ...state, difficulty: "hard" });

    expect(medium.researchRate).toBeGreaterThan(hard.researchRate);
    expect(hard.activeResearch?.ticksRemaining).toBeGreaterThan(medium.activeResearch?.ticksRemaining ?? 0);
    expect(hard.activeResearch?.remainingPoints).toBe(medium.activeResearch?.remainingPoints);
  });

  it("recomputes wall-clock duration when the tick interval changes", () => {
    const state = createInitialState();
    state.buildings.advancedResearchLabs = 1;
    state.activeResearch = { techId: "advanced_fusion_reactors", progress: 125, cost: 1000 };

    const fast = getResearchEstimateSnapshot({ ...state, tickIntervalMinutes: 5 });
    const slow = getResearchEstimateSnapshot({ ...state, tickIntervalMinutes: 60 });

    expect(fast.activeResearch?.ticksRemaining).toBe(slow.activeResearch?.ticksRemaining);
    expect(slow.activeResearch?.minutesRemaining).toBe((fast.activeResearch?.minutesRemaining ?? 0) * 12);
  });

  it("labels paused duration as theoretical instead of advancing wall-clock time", () => {
    const estimate = getResearchUnlockEstimate(125, 1000, 35, 5);

    expect(getResearchEstimateTiming(estimate, true)).toEqual({
      theoreticalMinutesRemaining: 125,
      advancingMinutesRemaining: null,
    });
    expect(getResearchEstimateTiming(estimate, false)).toEqual({
      theoreticalMinutesRemaining: 125,
      advancingMinutesRemaining: 125,
    });
  });

  it("refreshes remaining points and ETA from the post-catch-up shared breakdown", () => {
    const state = createInitialState();
    state.tickPaused = false;
    state.lastTickTime = Date.now() - (state.tickIntervalMinutes ?? 15) * 60_000 * 2;
    state.buildings.advancedResearchLabs = 1;
    state.activeResearch = { techId: "advanced_fusion_reactors", progress: 0, cost: 2400 };

    const before = getResearchEstimateSnapshot(state);
    const { newState } = runOfflineCatchup(state, "lite", 1);
    const after = getResearchEstimateSnapshot(newState);

    expect(after.activeResearch?.remainingPoints).toBeLessThan(before.activeResearch?.remainingPoints ?? 0);
    expect(after.activeResearch?.ticksRemaining).toBeLessThan(before.activeResearch?.ticksRemaining ?? Infinity);
    expect(after.researchRate).toBe(getResearchBreakdown(newState).gain);
  });

  it("projects queued technologies cumulatively after active research", () => {
    expect(getResearchQueueUnlockEstimates([100, 80], 25, 5, 3)).toEqual([
      {
        remainingPoints: 100,
        ticksRemaining: 7,
        minutesRemaining: 35,
      },
      {
        remainingPoints: 80,
        ticksRemaining: 11,
        minutesRemaining: 55,
      },
    ]);
  });

  it("stalls every queued estimate when research output is zero", () => {
    expect(getResearchQueueUnlockEstimates([100, 80], 0, 5, 3)).toEqual([
      {
        remainingPoints: 100,
        ticksRemaining: null,
        minutesRemaining: null,
      },
      {
        remainingPoints: 80,
        ticksRemaining: null,
        minutesRemaining: null,
      },
    ]);
  });

  it("normalizes a migrated queue before deriving cumulative ETAs", () => {
    const fresh = createInitialState();
    const [firstTech, secondTech] = Object.keys(TECH_MAP);
    const migrated = migrateState({
      ...fresh,
      researchQueue: [secondTech, "legacy-removed-tech", secondTech, firstTech, "toString"] as any,
    });
    const queueTechIds = getResearchQueueTechIds(migrated.researchQueue);
    const estimates = getResearchQueueUnlockEstimates(
      queueTechIds.map((id) => TECH_MAP[id].researchCost),
      25,
      5,
      3,
    );

    expect(queueTechIds).toEqual([secondTech, firstTech]);
    expect(estimates).toHaveLength(2);
    expect(estimates[0]?.ticksRemaining).toBe(Math.ceil(TECH_MAP[secondTech].researchCost / 25) + 3);
    expect(estimates[1]?.ticksRemaining).toBe(
      Math.ceil(TECH_MAP[secondTech].researchCost / 25) +
      Math.ceil(TECH_MAP[firstTech].researchCost / 25) +
      3,
    );
    expect(estimates.every((estimate) =>
      estimate.ticksRemaining !== null &&
      estimate.minutesRemaining !== null &&
      Number.isFinite(estimate.ticksRemaining) &&
      Number.isFinite(estimate.minutesRemaining),
    )).toBe(true);
  });

  it("drops unknown and duplicate IDs defensively for direct screen inputs", () => {
    const [known] = Object.keys(TECH_MAP);
    expect(getResearchQueueTechIds(["missing", known, known, null, "toString"])).toEqual([known]);
  });
});

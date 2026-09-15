import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { processHumanConsequences, recordHumanConsequences } from "@/engine/humanConsequences";
import { sanitizeState } from "@/engine/sanitizer";
import {
  applySquadDeploymentResolution,
  processRetinueTick,
  type SquadDeploymentResolution,
} from "@/engine/retinue";
import { createDefaultRetinueState, type Troop } from "@/engine/retinueData";

describe("human consequences", () => {
  it("turns harsh city conditions into bounded persistent wounded, sick, missing, and dead residents", () => {
    const state = createInitialState();
    state.cityStats.population = 1_000_000;
    state.cityStats.crime = 90;
    state.cityStats.diseaseRisk = 90;
    state.cityStats.publicHealth = 20;
    state.cityStats.infrastructureHealth = 20;
    state.cityStats.lawOrder = 20;
    state.demographics.emergencyResponseCoverage = 10;
    state.weather = "Radioactive Winds";
    state.activeEvents = [{
      id: "reactor-collapse",
      title: "REACTOR COLLAPSE",
      description: "A radiological disaster.",
      severity: "critical",
      timestamp: state.totalTicks,
      resolved: false,
      effects: {},
      responseOptions: [],
    }];

    const beforePopulation = state.cityStats.population;
    processHumanConsequences(state, []);
    const harm = state.humanConsequences!;

    expect(harm.civilianWounded).toBeGreaterThan(0);
    expect(harm.civilianSick).toBeGreaterThan(0);
    expect(harm.civilianMissing).toBeGreaterThan(0);
    expect(harm.totalCivilianDeaths).toBeGreaterThan(0);
    expect(state.cityStats.population).toBe(beforePopulation - harm.totalCivilianDeaths);
    expect(harm.woundedByCause.crime).toBeGreaterThan(0);
    expect(harm.woundedByCause.radiation).toBeGreaterThan(0);
    expect(harm.deathsByCause.disease).toBeGreaterThan(0);
  });

  it("transfers cumulative combat population losses exactly once", () => {
    const state = createInitialState();
    state.combat!.totalPopulationLosses = 120;
    processHumanConsequences(state, []);
    const first = state.humanConsequences!.totalCivilianDeaths;
    expect(state.humanConsequences!.deathsByCause.attack).toBe(120);

    processHumanConsequences(state, []);
    expect(state.humanConsequences!.deathsByCause.attack).toBe(120);
    expect(state.humanConsequences!.totalCivilianDeaths - first).toBeLessThan(200);

    state.combat!.totalPopulationLosses = 150;
    processHumanConsequences(state, []);
    expect(state.humanConsequences!.deathsByCause.attack).toBe(150);
  });

  it("resolves missing people and severe untreated cases over multiple ticks without negative pools", () => {
    const state = createInitialState();
    state.cityStats.population = 10_000;
    state.cityStats.crime = 0;
    state.cityStats.diseaseRisk = 0;
    state.cityStats.publicHealth = 100;
    state.cityStats.lawOrder = 100;
    state.demographics.emergencyResponseCoverage = 100;
    recordHumanConsequences(state, "event", { wounded: 40, sick: 40, missing: 40 });

    for (let i = 0; i < 12; i++) processHumanConsequences(state, []);
    expect(state.humanConsequences!.totalRecovered).toBeGreaterThan(0);
    expect(state.humanConsequences!.totalMissingFound).toBeGreaterThan(0);
    expect(state.humanConsequences!.civilianWounded).toBeGreaterThanOrEqual(0);
    expect(state.humanConsequences!.civilianSick).toBeGreaterThanOrEqual(0);
    expect(state.humanConsequences!.civilianMissing).toBeGreaterThanOrEqual(0);
  });

  it("sanitizes malformed legacy consequence data", () => {
    const state = createInitialState();
    state.humanConsequences = {
      ...state.humanConsequences!,
      civilianWounded: Number.NaN,
      civilianSick: -50,
      civilianMissing: 99_999_999,
      totalCivilianDeaths: -1,
    };
    const clean = sanitizeState(state).humanConsequences!;
    expect(clean.civilianWounded).toBe(0);
    expect(clean.civilianSick).toBe(0);
    expect(clean.civilianMissing).toBe(state.cityStats.population);
    expect(clean.totalCivilianDeaths).toBe(0);
  });
});

describe("squad casualty commitment", () => {
  it("persists KIA and injuries, then returns treated survivors to duty", () => {
    const state = createInitialState();
    const retinue = createDefaultRetinueState();
    const troops: Troop[] = Array.from({ length: 8 }, (_, i) => ({
      id: `troop-${i}`,
      classId: i === 7 ? "medic" : "infantry",
      tier: "enforcer",
      level: 1,
      xp: 0,
      xpToNext: 100,
      hp: 100,
      maxHp: 100,
      combat: 20,
      morale: 60,
      kills: 0,
      missionsCompleted: 0,
      status: "ready",
      squadId: "squad-1",
      hiredTick: 0,
    }));
    retinue.troops = troops;
    retinue.squads = [{
      id: "squad-1",
      name: "Test Squad",
      role: "assault",
      doctrine: "balanced",
      captainId: null,
      troopIds: troops.map(t => t.id),
      maxSize: 8,
      formationBonus: 0,
      totalKills: 0,
      deploymentsCompleted: 0,
      created: 0,
    }];
    state.retinue = retinue;
    const result: SquadDeploymentResolution = {
      squadId: "squad-1",
      success: false,
      duration: 4,
      casualties: 6,
      successChance: 25,
      combatPower: 40,
      readyTroopCount: 8,
      doctrineModifiers: { powerMultiplier: 1, casualtyRiskMultiplier: 1, operationSpeedMultiplier: 1 },
    };

    const committed = applySquadDeploymentResolution(state, result);
    expect(committed.killed).toBeGreaterThan(0);
    expect(committed.wounded).toBeGreaterThan(0);
    expect(state.retinue.totalCasualties).toBe(6);
    expect(state.retinue.squads[0].troopIds).toHaveLength(8);

    state.totalTicks = Math.max(...state.retinue.troops.map(t => t.injuredUntilTick ?? 0));
    processRetinueTick(state, []);
    expect(state.retinue.troops.filter(t => t.status === "injured")).toHaveLength(0);
    expect(state.retinue.troops.filter(t => t.status === "ready")).toHaveLength(8 - committed.killed);
  });
});
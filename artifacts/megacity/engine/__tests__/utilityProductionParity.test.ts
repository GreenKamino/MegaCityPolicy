import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { computePowerBreakdown } from "@/engine/powerBreakdown";
import { computeWaterBreakdown } from "@/engine/waterBreakdown";
import { createUtilityParityFixtureState } from "@/engine/demoSeeder";
import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { getLicensedCompanyUtilityContributions } from "@/engine/utilityProduction";
import type { GameState } from "@/engine/types";

function licensedState(): GameState {
  const state = createInitialState();
  state.tickPaused = false;
  state.buildings = {};
  state.companies = [
    {
      companyId: "helios-grid",
      districtId: state.districts[0]?.id ?? "central-command",
      licenseDate: 0,
    },
    {
      companyId: "clearflow-water",
      districtId: state.districts[0]?.id ?? "central-command",
      licenseDate: 0,
    },
  ];
  return state;
}

describe("utility production parity", () => {
  it("includes operational licensed corporations in both authoritative rates and breakdowns", () => {
    const baselineState = licensedState();
    baselineState.companies = [];
    const baseline = runTick(baselineState).newState;
    const licensed = runTick(licensedState()).newState;

    expect(licensed.rates.powerGeneration - baseline.rates.powerGeneration).toBe(120);
    expect(licensed.rates.waterProduction - baseline.rates.waterProduction).toBe(110);

    const power = computePowerBreakdown(licensed, licensed.rates.powerGeneration);
    const water = computeWaterBreakdown(licensed, licensed.rates.waterProduction);
    expect(power.generation).toBe(licensed.rates.powerGeneration);
    expect(water.production).toBe(licensed.rates.waterProduction);
    expect(power.positives).toContainEqual({ label: "Licensed corporations", amount: 120 });
    expect(water.positives).toContainEqual({ label: "Licensed corporations", amount: 110 });
  });

  it("does not count quarantined company licenses as production", () => {
    const state = licensedState();
    state.companies = state.companies.map((company) => ({
      ...company,
      status: "quarantined" as const,
    }));

    expect(computePowerBreakdown(state).positives).not.toContainEqual(
      expect.objectContaining({ label: "Licensed corporations" }),
    );
    expect(computeWaterBreakdown(state).positives).not.toContainEqual(
      expect.objectContaining({ label: "Licensed corporations" }),
    );
  });

  it("names only operational companies with a positive effect for the requested utility", () => {
    const state = licensedState();
    state.companies.push(
      {
        companyId: "aurora-solar",
        districtId: state.districts[0]?.id ?? "central-command",
        licenseDate: 0,
        status: "quarantined",
      },
      {
        companyId: "clearflow-water",
        districtId: state.districts[0]?.id ?? "central-command",
        licenseDate: 1,
        status: "quarantined",
      },
      {
        companyId: "central-city-admin",
        districtId: state.districts[0]?.id ?? "central-command",
        licenseDate: 2,
      },
      {
        companyId: "no-such-company",
        districtId: state.districts[0]?.id ?? "central-command",
        licenseDate: 3,
      },
    );

    expect(getLicensedCompanyUtilityContributions(state, "power")).toEqual([
      { companyId: "helios-grid", name: "Helios Grid Authority", amount: 120 },
    ]);
    expect(getLicensedCompanyUtilityContributions(state, "water")).toEqual([
      { companyId: "clearflow-water", name: "ClearFlow Water Authority", amount: 110 },
    ]);
  });

  it("overview and economy use the same live utility rates as the detailed cards", () => {
    const overview = readFileSync(
      path.resolve(process.cwd(), "app/(game)/overview.tsx"),
      "utf8",
    );
    const economy = readFileSync(
      path.resolve(process.cwd(), "app/(game)/economy.tsx"),
      "utf8",
    );

    expect(overview).toContain("const powerNet = rates.powerGeneration - Math.floor(rates.powerDrain)");
    expect(overview).toContain("const waterNet = rates.waterProduction - rates.waterConsumption");
    expect(overview).toContain("computePowerBreakdown(state, rates.powerGeneration)");
    expect(overview).toContain("computeWaterBreakdown(state, rates.waterProduction)");
    expect(economy).toContain("rates.waterProduction - rates.waterConsumption");
    expect(economy).toContain("rates.powerGeneration - rates.powerDrain");
    expect(economy).toContain("computePowerProductionComponents(state).licensedCorporationOutput");
    expect(economy).toContain("computeWaterProductionComponents(state).licensedCorporationOutput");
    expect(economy).toContain("Licensed Company Power");
    expect(economy).toContain("Licensed Company Water");
    expect(economy).toContain("licensedUtilityOutput.power > 0 || licensedUtilityOutput.water > 0");
  });

  it("keeps every utility modifier in the authoritative boundary snapshot", () => {
    const state = createUtilityParityFixtureState(createInitialState());
    const power = computePowerBreakdown(state, state.rates.powerGeneration);
    const water = computeWaterBreakdown(state, state.rates.waterProduction);

    // The tick ran with spring active and advanced the returned state into
    // summer. The breakdown must retain the live snapshot instead of replacing
    // it with a fresh calculation from the new season.
    expect(state.season).toBe("summer");
    expect(state.rates.powerGeneration).toBe(7918);
    expect(state.rates.waterProduction).toBe(3374);
    expect(power.generation).toBe(state.rates.powerGeneration);
    expect(water.production).toBe(state.rates.waterProduction);

    expect(power.positives).toEqual(
      expect.arrayContaining([
        { label: "Power generation", amount: 4200 },
        { label: "Power megaproject output", amount: 2000 },
        { label: "Prestige multiplier", amount: 1583 },
        { label: "Licensed corporations", amount: 120 },
      ]),
    );
    expect(water.positives).toEqual(
      expect.arrayContaining([
        { label: "Water production", amount: 2130 },
        { label: "Prestige multiplier", amount: 613 },
        { label: "Other active modifiers", amount: 306 },
        { label: "Water megaproject output", amount: 200 },
      ]),
    );
  });
});
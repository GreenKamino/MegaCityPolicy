import { describe, expect, it } from "vitest";
import {
  formatActionCostTiming,
  getDecreeCostTiming,
  getEdictCostTiming,
  getPolicyCostTiming,
  normalizeActionCostTiming,
} from "@/engine/actionCostTiming";
import { EDICTS } from "@/engine/edicts";
import { POLITICAL_DECREES } from "@/engine/politicsData";

describe("action cost and timing contract", () => {
  it("calculates Emergency Ration Distribution from the live edict definition", () => {
    const edict = EDICTS.find((candidate) => candidate.id === "emergency_rations")!;
    const model = getEdictCostTiming(edict);

    expect(model.upfrontCostCredits).toBe(40_000);
    expect(model.runningCostPerTickCredits).toBe(3_000);
    expect(model.durationTicks).toBe(5);
    expect(model.maximumTotalCostCredits).toBe(55_000);
    expect(model.activeTicksRemaining).toBeNull();
    expect(model.remainingMaximumCostCredits).toBeNull();
    expect(model.phase).toBe("available");
    expect(edict.cooldownTicks).toBe(14);
    expect(model.cooldownTicks).toBe(14);
    expect(model.cooldownStarts).toBe("expiry");
    expect(formatActionCostTiming(model)).toEqual([
      { key: "phase", label: "STATUS", value: "AVAILABLE" },
      { key: "upfront-cost", label: "UPFRONT COST", value: "40,000 cr" },
      { key: "running-cost", label: "RUNNING COST", value: "3,000 cr per tick" },
      { key: "duration", label: "ACTIVE FOR", value: "5 ticks" },
      { key: "maximum-cost", label: "MAXIMUM TOTAL COST", value: "55,000 cr" },
      {
        key: "cooldown",
        label: "COOLDOWN",
        value: `${edict.cooldownTicks} ticks after expiry`,
      },
      {
        key: "insufficient-funds",
        label: "IF FUNDS RUN SHORT",
        value: "Running cost continues while active",
      },
      { key: "cancellation", label: "CANCELLATION", value: "Cannot be cancelled" },
    ]);
    expect(model.activationFundsRule).toBe("requires-upfront-cost");
    expect(model.runningFundsRule).toBe("continues-while-active");
  });

  it("calculates remaining running cost without counting active time as cooldown", () => {
    const edict = EDICTS.find((candidate) => candidate.id === "emergency_rations")!;
    const model = getEdictCostTiming(edict, {
      active: { ticksRemaining: 2 },
      cooldownUntilTick: 30,
      currentTick: 21,
    });

    expect(model.remainingMaximumCostCredits).toBe(6_000);
    expect(model.cooldownRemainingTicks).toBe(0);
    expect(model.phase).toBe("active");
    expect(formatActionCostTiming(model)).toEqual(expect.arrayContaining([
      { key: "next-tick-charge", label: "NEXT-TICK CHARGE", value: "3,000 cr" },
      { key: "remaining-cost", label: "REMAINING MAXIMUM COST", value: "6,000 cr" },
    ]));
  });

  it("reads an expired edict cooldown from the authoritative cooldown map value", () => {
    const edict = EDICTS.find((candidate) => candidate.id === "emergency_rations")!;
    const model = getEdictCostTiming(edict, {
      cooldownUntilTick: 30,
      currentTick: 21,
    });

    expect(model.activeTicksRemaining).toBeNull();
    expect(model.cooldownRemainingTicks).toBe(9);
    expect(model.phase).toBe("cooldown");
    expect(formatActionCostTiming(model)).toContainEqual({
      key: "cooldown-remaining",
      label: "COOLDOWN REMAINING",
      value: "9 ticks",
    });
  });

  it("reports an upfront affordability shortfall without assuming future tick solvency", () => {
    const edict = EDICTS.find((candidate) => candidate.id === "emergency_rations")!;
    const model = getEdictCostTiming(edict, { availableCredits: 35_000 });

    expect(model.activationAffordable).toBe(false);
    expect(model.upfrontShortfallCredits).toBe(5_000);
    expect(formatActionCostTiming(model)).toContainEqual({
      key: "affordability",
      label: "CANNOT ACTIVATE",
      value: "5,000 cr short",
    });
  });

  it("uses the signed live balance for upfront affordability", () => {
    const edict = EDICTS.find((candidate) => candidate.id === "emergency_rations")!;
    const model = getEdictCostTiming(edict, { availableCredits: -500 });

    expect(model.activationAffordable).toBe(false);
    expect(model.upfrontShortfallCredits).toBe(40_500);
  });

  it("does not require upfront funds for a zero-cost edict", () => {
    const edict = EDICTS.find((candidate) => candidate.id === "wage_freeze_decree")!;
    const model = getEdictCostTiming(edict, { availableCredits: 0 });

    expect(model.upfrontCostCredits).toBe(0);
    expect(model.activationFundsRule).toBe("no-upfront-cost");
    expect(model.activationAffordable).toBe(true);
    expect(formatActionCostTiming(model)).toContainEqual({
      key: "upfront-cost",
      label: "UPFRONT COST",
      value: "None",
    });
  });

  it("represents toggleable policies without a misleading finite duration", () => {
    const model = getPolicyCostTiming({ costPerTick: 800 });

    expect(model.kind).toBe("toggleable");
    expect(model.durationTicks).toBeNull();
    expect(model.maximumTotalCostCredits).toBeNull();
    expect(model.cancellation).toBe("stops-future-costs");
    expect(formatActionCostTiming(model)).toEqual(expect.arrayContaining([
      { key: "running-cost", label: "RUNNING COST", value: "800 cr per tick" },
      { key: "duration", label: "ACTIVE FOR", value: "Until deactivated" },
      { key: "cancellation", label: "CANCELLATION", value: "Deactivate any time; future costs and effects stop" },
    ]));
  });

  it("represents revenue policies as income rather than negative cost", () => {
    const model = getPolicyCostTiming({ costPerTick: -3_000 });

    expect(model.runningCostPerTickCredits).toBe(0);
    expect(model.runningIncomePerTickCredits).toBe(3_000);
    expect(formatActionCostTiming(model)).toContainEqual({
      key: "running-income",
      label: "RUNNING INCOME",
      value: "3,000 cr per tick",
    });
  });

  it("represents instant decrees with activation cooldowns", () => {
    const decree = POLITICAL_DECREES.find((candidate) => candidate.id === "economic_stimulus")!;
    const model = getDecreeCostTiming(decree, {
      currentTick: 20,
      cooldownUntilTick: 35,
      availableCredits: 10_000,
    });

    expect(model).toMatchObject({
      kind: "instant",
      upfrontCostCredits: 25_000,
      cooldownTicks: 30,
      cooldownStarts: "activation",
      cooldownRemainingTicks: 15,
      phase: "cooldown",
      activationAffordable: false,
      upfrontShortfallCredits: 15_000,
    });
    expect(formatActionCostTiming(model)).toEqual(expect.arrayContaining([
      { key: "duration", label: "EFFECT TIMING", value: "Immediate" },
      { key: "cooldown", label: "COOLDOWN", value: "30 ticks from activation" },
      { key: "cooldown-remaining", label: "COOLDOWN REMAINING", value: "15 ticks" },
    ]));
  });

  it("represents a charge-up-to-available action without falsely blocking it", () => {
    const model = normalizeActionCostTiming({
      kind: "instant",
      upfrontCostCredits: 25_000,
      availableCredits: 4_000,
      activationFundsRule: "charges-up-to-available",
    });

    expect(model.activationAffordable).toBe(true);
    expect(model.upfrontShortfallCredits).toBe(0);
    expect(formatActionCostTiming(model)).toContainEqual({
      key: "insufficient-funds",
      label: "IF FUNDS RUN SHORT",
      value: "Spends the available treasury and still completes",
    });
  });

  it.each([
    ["instant", null, []],
    ["permanent", null, [{ key: "duration", label: "EFFECT", value: "Permanent" }]],
    ["indefinite", null, [{ key: "duration", label: "ACTIVE FOR", value: "Indefinitely" }]],
  ] as const)("represents %s actions without a fake tick duration", (kind, duration, expectedRows) => {
    const model = normalizeActionCostTiming({ kind, upfrontCostCredits: 500 });

    expect(model.durationTicks).toBe(duration);
    for (const row of expectedRows) expect(formatActionCostTiming(model)).toContainEqual(row);
  });

  it("normalizes malformed legacy values safely", () => {
    const model = normalizeActionCostTiming({
      durationTicks: Number.NaN,
      cooldownTicks: -4,
      upfrontCostCredits: Number.POSITIVE_INFINITY,
      recurringCreditsPerTick: Number.NaN,
    });

    expect(model).toMatchObject({
      kind: "timed",
      upfrontCostCredits: 0,
      recurringCreditsPerTick: 0,
      durationTicks: 0,
      cooldownTicks: 0,
      cooldownStarts: "not-applicable",
    });
  });

  it("ignores malformed legacy edict effect components independently", () => {
    const model = getEdictCostTiming({
      cost: 10,
      durationTicks: 2,
      cooldownTicks: 3,
      effects: {
        credits: Number.NaN,
        creditsPerTick: -4,
        tradeIncome: Number.POSITIVE_INFINITY,
      },
    });

    expect(model.recurringCreditsPerTick).toBe(-4);
    expect(model.maximumTotalCostCredits).toBe(18);
  });
});
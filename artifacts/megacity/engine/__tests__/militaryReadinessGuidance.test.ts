import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  getMilitaryReadinessGuidance,
  LOW_READINESS_THRESHOLD,
} from "@/engine/militaryLogistics";
import { createDefaultLogisticsState } from "@/engine/militaryOverhaul";

const screenSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/(game)/military.tsx"),
  "utf8",
);

describe("military readiness guidance", () => {
  it("selects supply recovery when logistics has the largest readiness penalty", () => {
    const log = { ...createDefaultLogisticsState(), supplyStatus: "critical" as const };

    expect(getMilitaryReadinessGuidance(30, 60, log)).toMatchObject({
      issue: "supplies",
      actionTab: "production",
      actionLabel: "OPEN SUPPLY",
    });
  });

  it.each([
    ["ammunition", { ammo: 0, fuel: 12, rations: 8 }, "AMMUNITION", 0],
    ["fuel", { ammo: 12, fuel: 2, rations: 8 }, "FUEL", 2],
    ["rations", { ammo: 12, fuel: 8, rations: 1 }, "RATIONS", 1],
  ])("names %s as the dominant supply shortfall", (_name, ticks, label, remaining) => {
    const log = {
      ...createDefaultLogisticsState(),
      supplyStatus: "critical" as const,
      suppliesTicksRemaining: ticks,
    };

    expect(getMilitaryReadinessGuidance(30, 60, log)).toMatchObject({
      issue: "supplies",
      detail: `${label} is the limiting supply (${remaining} ticks remaining). Review SUPPLY.`,
    });
  });

  it("keeps aggregate supply guidance when the live per-supply readout is unavailable", () => {
    const log = {
      ...createDefaultLogisticsState(),
      supplyStatus: "critical" as const,
      suppliesTicksRemaining: undefined,
    };

    expect(getMilitaryReadinessGuidance(30, 60, log)).toMatchObject({
      issue: "supplies",
      detail: "Logistics status is CRITICAL. Review ammo, fuel, and rations in SUPPLY.",
    });
  });

  it("selects personnel when supply is healthy and coverage is the active shortfall", () => {
    const log = {
      ...createDefaultLogisticsState(),
      crewCoverage: 0.35,
      garrisonCoverage: 1,
    };

    expect(getMilitaryReadinessGuidance(40, 60, log)).toMatchObject({
      issue: "personnel",
      actionTab: "units",
      actionLabel: "OPEN UNITS",
    });
  });

  it("selects doctrine review when morale is the active shortfall", () => {
    const log = createDefaultLogisticsState();

    expect(getMilitaryReadinessGuidance(40, 20, log)).toMatchObject({
      issue: "morale",
      actionTab: "policies",
      actionLabel: "OPEN DOCTRINE",
    });
  });

  it("keeps the normal readiness presentation uncluttered", () => {
    const log = { ...createDefaultLogisticsState(), supplyStatus: "critical" as const };

    expect(getMilitaryReadinessGuidance(LOW_READINESS_THRESHOLD, 0, log)).toBeNull();
    expect(getMilitaryReadinessGuidance(70, 0, log)).toBeNull();
  });

  it("wires the selected guidance into the ARMY tab as one conditional action", () => {
    expect(screenSource).toContain("getMilitaryReadinessGuidance(");
    expect(screenSource).toContain('testID="military-readiness-guidance"');
    expect(screenSource).toContain('testID="military-readiness-guidance-action"');
    expect(screenSource).toContain("setMilTab(readinessGuidance.actionTab)");
  });
});
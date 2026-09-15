import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  formatInfrastructureAccessibilityLabel,
  formatInfrastructureIntegrity,
  formatInfrastructurePoints,
  formatInfrastructureSummary,
} from "@/utils/infrastructurePresentation";

describe("infrastructure presentation formatting", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1_000, "1K"],
    [12_345, "12.35K"],
    [1_240_000, "1.24M"],
    [1_234_567_890, "1.23B"],
  ])("formats %s points as %s without a percentage cap", (points, expected) => {
    expect(formatInfrastructurePoints(points)).toBe(expected);
  });

  it("clamps only integrity, not the point total", () => {
    expect(formatInfrastructureIntegrity(87.4)).toBe("87%");
    expect(formatInfrastructureIntegrity(120)).toBe("100%");
    expect(formatInfrastructureSummary(1_240_000, 87.4)).toBe("1.24M · 87%");
  });

  it("uses an explicit accessible points-and-integrity label", () => {
    expect(formatInfrastructureAccessibilityLabel(1_240_000, 87.4))
      .toBe("Infrastructure: 1.24M points, 87% integrity");
  });

  it("wires the open-ended ledger presentation into the overview banner", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "app/(game)/overview.tsx"),
      "utf8",
    );
    expect(source).toContain('label="INFRASTRUCTURE"');
    expect(source).toContain("formatInfrastructureSummary(infrastructureBreakdown.totalPoints, infrastructureBreakdown.integrityPercent)");
    expect(source).toContain("formatInfrastructureAccessibilityLabel(infrastructureBreakdown.totalPoints, infrastructureBreakdown.integrityPercent)");
    expect(source).not.toContain("Math.round(infrastructureBreakdown.totalPoints)");
  });
});
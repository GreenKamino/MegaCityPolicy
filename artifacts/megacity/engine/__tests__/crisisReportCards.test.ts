import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("Overview crisis report hierarchy", () => {
  const frame = source("../../components/CrisisReportFrame.tsx");
  const overview = source("../../app/(game)/overview.tsx");
  const law = source("../../app/(game)/law.tsx");

  it("keeps severity, movement, causes, impacts, and actions as distinct layers", () => {
    expect(frame).toContain(">SEVERITY<");
    expect(frame).toContain(">IMPACT / FAILURE MODE<");
    expect(frame).toContain(">AVAILABLE COUNTERMEASURES<");
    expect(frame).toContain('detailsLabel = "ACTIVE FACTORS"');
    expect(frame).toContain("statusLabel");
    expect(frame).toContain("headline");
    expect(frame).toContain('movement === "improving"');
    expect(frame).toContain('movement === "worsening"');
    expect(frame).toContain("↓");
    expect(frame).toContain("↑");
  });

  it("shows explicit movement beside the four major crisis metrics", () => {
    const health = source("../../components/HealthBreakdownCard.tsx");
    const infrastructure = source("../../components/InfrastructureBreakdownCard.tsx");

    expect(overview).toContain('movement={recovering ? "improving" : "worsening"}');
    expect(overview).toContain('movement={dir === "falling" ? "improving"');
    expect(health).toContain('movement={dir === "recovering" ? "improving"');
    expect(infrastructure).toContain('movement={dir === "rising" ? "improving"');
  });

  it("uses the shared frame across every Overview diagnostic domain", () => {
    for (const file of [
      "HealthBreakdownCard.tsx",
      "EmploymentBreakdownCard.tsx",
      "TransitBreakdownCard.tsx",
      "CommunicationsBreakdownCard.tsx",
      "DefenseBreakdownCard.tsx",
      "InfrastructureBreakdownCard.tsx",
      "EconomyBreakdownCard.tsx",
    ]) {
      expect(source(`../../components/${file}`)).toContain("<CrisisReportFrame");
    }
    expect(overview.match(/<CrisisReportFrame/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("states real failure consequences without changing simulation thresholds", () => {
    expect(source("../../components/HealthBreakdownCard.tsx")).toContain("lethal outbreaks");
    expect(source("../../components/DefenseBreakdownCard.tsx")).toContain("killing residents");
    expect(source("../../components/InfrastructureBreakdownCard.tsx")).toContain("casualties");
    expect(overview).toContain("blackout conditions");
    expect(overview).toContain("lethal disease and unrest");
    expect(overview).toContain("ecological-collapse risk");
  });

  it("preserves the existing one-tap destinations", () => {
    expect(source("../../components/HealthBreakdownCard.tsx")).toContain("navigateToHealthSuggestion(t.target!)");
    expect(source("../../components/EmploymentBreakdownCard.tsx")).toContain("navigateToEmploymentSuggestion(t.target!)");
    expect(source("../../components/TransitBreakdownCard.tsx")).toContain("navigateToTransitSuggestion(t.target!)");
    expect(source("../../components/DefenseBreakdownCard.tsx")).toContain("navigateToDefenseSuggestion(t.target!)");
    expect(source("../../components/InfrastructureBreakdownCard.tsx")).toContain("navigateToInfraSuggestion(t.target!)");
    expect(source("../../components/EconomyBreakdownCard.tsx")).toContain('router.push("/(game)/economy")');
    expect(overview).toContain("navigateToCrimeSuggestion(tip.target!)");
    expect(overview).toContain("navigateToPowerSuggestion(t.target!)");
    expect(overview).toContain("navigateToWaterSuggestion(t.target!)");
  });

  it("does not present the Law screen's same-screen crime hint as a dead tap", () => {
    expect(law).toContain("isCrimeSuggestionNavigable(t.target, { alreadyOnLaw: true })");
    expect(law).toContain("The public-order controls are below.");
    expect(law).toContain('accessibilityRole="text"');
  });
});
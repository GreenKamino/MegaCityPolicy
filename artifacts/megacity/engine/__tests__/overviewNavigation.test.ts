import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseOverviewSectionTarget } from "@/utils/overviewSections";

const screenSource = (rel: string) =>
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), "utf8");

const overviewSource = screenSource("../../app/(game)/overview.tsx");
const overviewNavigationSource = screenSource("../../utils/overviewNavigation.ts");

describe("overview City tab internal sections", () => {
  it("validates public section targets and rejects missing or invalid values", () => {
    expect(parseOverviewSectionTarget("status")).toBe("status");
    expect(parseOverviewSectionTarget("people")).toBe("people");
    expect(parseOverviewSectionTarget("infrastructure")).toBe("infrastructure");
    expect(parseOverviewSectionTarget("supply")).toBe("supply");
    expect(parseOverviewSectionTarget("governance")).toBe("governance");
    expect(parseOverviewSectionTarget(["people", "status"])).toBe("people");
    expect(parseOverviewSectionTarget("People")).toBeNull();
    expect(parseOverviewSectionTarget("unknown")).toBeNull();
    expect(parseOverviewSectionTarget(undefined)).toBeNull();
  });

  it("initializes from a valid route target without remounting the Overview tree", () => {
    expect(overviewSource).toContain("useLocalSearchParams<{ section?: string | string[] }>()");
    expect(overviewSource).toContain("requestedCitySection ? CITY_SECTION_FOR_TARGET[requestedCitySection] : \"Status\"");
    expect(overviewSource).toContain("if (!requestedCitySection) return;");
    expect(overviewSource).toContain("setCitySection(current => current === nextSection ? current : nextSection)");
  });

  it("exposes a helper that links other screens to the existing Overview route and requested section", () => {
    expect(overviewNavigationSource).toContain("export function navigateToOverviewSection(section: OverviewSectionTarget)");
    expect(overviewNavigationSource).toContain('pathname: "/(game)/overview"');
    expect(overviewNavigationSource).toContain("params: { section }");
  });

  it("defines the five persistent internal sections: Status, People, Infrastructure, Supply, and Governance", () => {
    expect(overviewSource).toContain("CITY_SECTIONS = [\"Status\", \"People\", \"Infrastructure\", \"Supply\", \"Governance\"] as const");
  });

  it("ensures sections have no duplicate unique section headings (each section is unique without duplication)", () => {
    // Assert exactly ONE occurrence of specific headings
    const headings = [
      'title="City Status Matrix"',
      'title="Utility Status"',
      'title="Infrastructure & Research"',
      'title="Stockpiles & Supply"',
      'title="Legacy Directives"',
    ];
    headings.forEach(heading => {
      const occurrences = (overviewSource.match(new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g")) || []).length;
      expect(occurrences).toBe(1);
    });
  });

  it("updates same-screen breakdown navigation with stable callbacks and typed mapping", () => {
    expect(overviewSource).toContain("SECTION_FOR_SCROLL_KEY");
    expect(overviewSource).toContain("if (citySection !== section)");
    expect(overviewSource).toContain("pendingScrollTo");
    expect(overviewSource).toContain("selectCitySection");
  });
  
  it("keeps internal navigation outside the vertical ScrollView and uses ScrollView for the horizontal tabs", () => {
    expect(overviewSource).toContain("</ScrollView>\n        </View>\n      )}\n\n      <ScrollView ref={overviewScrollRef}");
  });

  it("asserts exact section ownership conditionals", () => {
    expect(overviewSource).toContain('citySection === "Status" && (<>');
    expect(overviewSource).toContain('citySection === "People" && (<>');
    expect(overviewSource).toContain('citySection === "Infrastructure" && (<>');
    expect(overviewSource).toContain('citySection === "Supply" && (<>');
    expect(overviewSource).toContain('citySection === "Governance" && (<>');
    const peopleStart = overviewSource.indexOf('citySection === "People" && (<>');
    const infrastructureStart = overviewSource.indexOf('citySection === "Infrastructure" && (<>');
    const peopleSection = overviewSource.slice(peopleStart, infrastructureStart);
    expect(peopleSection).toContain("<EmploymentBreakdownCard");
    expect(peopleSection).toContain("<PopulationPressureCard");
  });

  it("keeps section controls accessible and resets the shared scroll view on direct tab changes", () => {
    expect(overviewSource).toContain('accessibilityRole="tab"');
    expect(overviewSource).toContain('accessibilityLabel={`${sec} city section`}');
    expect(overviewSource).toContain("accessibilityState={{ selected: citySection === sec }}");
    expect(overviewSource).toContain('scrollTo({ y: 0, animated: false })');
  });

  it("surfaces cohort stewardship choices in the demographics tab with real interaction wiring", () => {
    expect(overviewSource).toContain("COHORT STEWARDSHIP");
    expect(overviewSource).toContain("handleCohortAction");
    expect(overviewSource).toContain("getCohortStewardshipActions(cohortId)");
    expect(overviewSource).toContain("evaluatePersonalAction");
    expect(overviewSource).toContain("{ kind: \"cohort\"");
    expect(overviewSource).toContain("const executed = performPersonalInteraction(target, id)");
    expect(overviewSource).toContain("Order no longer available");
  });
});

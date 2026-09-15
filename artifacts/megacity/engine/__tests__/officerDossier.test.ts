// Officer dossiers: computed threat/stability scores plus deterministic
// intelligence-style dossier text derived entirely from existing Officer
// fields (no new state). Verifies score bounds and direction, determinism,
// full trait coverage (every OfficerTrait yields real doctrine/quote text),
// and that the real initial-state roster renders complete dossiers.
import { describe, expect, it } from "vitest";

import {
  buildOfficerDossier,
  getOfficerStabilityValue,
  getOfficerThreatScore,
  getThreatBand,
} from "@/engine/officerDossier";
import { createInitialState } from "@/engine/initialState";
import type { Officer, OfficerTrait } from "@/engine/types";

const ALL_TRAITS: OfficerTrait[] = [
  "efficient", "bureaucratic", "visionary", "incompetent",
  "ambitious", "loyal", "corrupt", "idealistic",
  "strict", "strategist", "aggressive", "cautious",
  "investor_friendly", "worker_advocate", "corporate_loyalist", "budget_hawk",
  "perfectionist", "delegator", "micromanager", "reformist",
  "populist", "paranoid", "diplomat", "ruthless",
  "veteran", "intelligence_officer", "peacekeeper", "enforcer",
  "seasoned", "tenured", "loyal_lifer", "embittered",
];

function makeOfficer(overrides: Partial<Officer> = {}): Officer {
  return {
    id: "off-test-1",
    name: "Test Subject",
    position: "Analyst",
    department: "civic",
    rank: "officer",
    competence: 50,
    loyalty: 50,
    ambition: 50,
    corruption: 20,
    popularity: 40,
    fearFactor: 20,
    traits: ["efficient"],
    backstory: "",
    factionAffiliation: null,
    rivals: [],
    appointed: true,
    appointmentMethod: "direct",
    level: 1,
    xp: 0,
    ...overrides,
  };
}

describe("threat and stability scores", () => {
  it("stay within 0..100 at the extremes", () => {
    const worst = makeOfficer({ ambition: 100, corruption: 100, fearFactor: 100, popularity: 100, loyalty: 0 });
    const best = makeOfficer({ ambition: 0, corruption: 0, fearFactor: 0, popularity: 0, loyalty: 100, competence: 100 });
    for (const o of [worst, best]) {
      const t = getOfficerThreatScore(o);
      const st = getOfficerStabilityValue(o);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(100);
      expect(st).toBeGreaterThanOrEqual(0);
      expect(st).toBeLessThanOrEqual(100);
    }
  });

  it("disloyal ambitious schemers score higher threat than loyal servants", () => {
    const schemer = makeOfficer({ ambition: 90, corruption: 70, loyalty: 20 });
    const servant = makeOfficer({ ambition: 20, corruption: 5, loyalty: 95 });
    expect(getOfficerThreatScore(schemer)).toBeGreaterThan(getOfficerThreatScore(servant));
    expect(getOfficerStabilityValue(servant)).toBeGreaterThan(getOfficerStabilityValue(schemer));
  });

  it("threat bands cover the whole range in order", () => {
    expect(getThreatBand(10)).toBe("low");
    expect(getThreatBand(35)).toBe("guarded");
    expect(getThreatBand(55)).toBe("elevated");
    expect(getThreatBand(85)).toBe("severe");
  });
});

describe("dossier text", () => {
  it("is deterministic for the same officer", () => {
    const o = makeOfficer();
    const a = buildOfficerDossier(o);
    const b = buildOfficerDossier(o);
    expect(a).toEqual(b);
  });

  it("every trait yields real doctrine and quote text (no fallback)", () => {
    for (const trait of ALL_TRAITS) {
      const d = buildOfficerDossier(makeOfficer({ id: `off-${trait}`, traits: [trait] }));
      expect(d.preferredDoctrine.length, trait).toBeGreaterThan(10);
      expect(d.quote.length, trait).toBeGreaterThan(10);
      expect(d.preferredDoctrine).not.toContain("No stated doctrine");
      expect(d.quote).not.toContain("No quotable statements");
    }
  });

  it("a trait-less officer gets the explicit no-file fallback, not a crash", () => {
    const d = buildOfficerDossier(makeOfficer({ traits: [] }));
    expect(d.preferredDoctrine).toContain("No stated doctrine");
    expect(d.quote).toContain("No quotable statements");
  });

  it("assessment reflects threat band and always closes with a conclusion", () => {
    const menace = buildOfficerDossier(makeOfficer({ ambition: 95, corruption: 90, loyalty: 5, fearFactor: 80, popularity: 80 }));
    expect(menace.privateAssessment).toContain("CONCLUSION");
    expect(menace.privateAssessment).toContain("rival");

    const anchor = buildOfficerDossier(makeOfficer({ ambition: 10, corruption: 0, loyalty: 95, competence: 90 }));
    expect(anchor.privateAssessment).toContain("CONCLUSION");
    expect(anchor.privateAssessment).toContain("stabilizing asset");
  });

  it("renders a complete dossier for every officer in the real initial roster", () => {
    const s = createInitialState();
    const officers = s.officers ?? [];
    expect(officers.length).toBeGreaterThan(0);
    for (const o of officers) {
      const d = buildOfficerDossier(o);
      expect(d.publicReputation.length, o.id).toBeGreaterThan(10);
      expect(d.privateAssessment, o.id).toContain("CONCLUSION");
      expect(d.preferredDoctrine.length, o.id).toBeGreaterThan(5);
      expect(d.quote.length, o.id).toBeGreaterThan(5);
    }
  });
});

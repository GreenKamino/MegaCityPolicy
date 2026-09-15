import { describe, expect, it } from "vitest";
import { disclosureEvidenceLabel, getEntityDisclosure } from "../entitySheets";

describe("entity sheet disclosure", () => {
  it("keeps undiscovered entities at identity-only", () => {
    const disclosure = getEntityDisclosure({ entityId: "unknown", kind: "nation" });
    expect(disclosure.level).toBe("identity");
    expect(disclosure.hasOperationalFacts).toBe(false);
    expect(disclosure.evidence).toEqual([]);
  });

  it("combines scouting, communication, trade, intelligence, and relationship evidence", () => {
    const disclosure = getEntityDisclosure({
      entityId: "north",
      kind: "megacity",
      isDiscovered: true,
      relation: { disposition: 1, aidSent: 0, raidsSent: 0, tradesMade: 1, scoutsMade: 1, lastInteractionTick: 12 },
      ledger: {
        partnerId: "north", favors: 1, grudges: 0, debts: 0, lastInteractionTick: 12,
        recent: [], reputationLine: "", trustTrend: "rising",
      },
      history: [{ id: "h", tick: 12, factionId: "north", factionName: "North", action: "trade-mission", outcome: "accepted", reputationChange: 1 }],
      intel: [{ id: "i", source: "scout", kind: "intel", subjectId: "north", content: "", acquiredTick: 1, expiresTick: 20, reliability: 80, acted: false }],
    });
    expect(disclosure.level).toBe("relationship");
    expect(disclosure.evidence).toEqual(["communication", "trade", "intelligence", "scouting", "relationship"]);
    expect(disclosureEvidenceLabel(disclosure.evidence)).toContain("INTELLIGENCE");
  });

  it("does not hide player-controlled and character sheets behind foreign contact gates", () => {
    expect(getEntityDisclosure({ entityId: "commander", kind: "character" }).level).toBe("relationship");
    expect(getEntityDisclosure({ entityId: "city", kind: "faction", isPlayerControlled: true }).hasStrategicFacts).toBe(true);
  });
});
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSettlementCardFacts } from "../settlementData";

const appRoot = join(__dirname, "../../app/(game)");
const overviewSource = readFileSync(join(appRoot, "overview.tsx"), "utf8");
const worldMapSource = readFileSync(join(appRoot, "worldmap.tsx"), "utf8");
const diplomacySource = readFileSync(join(appRoot, "diplomacy.tsx"), "utf8");
const factionsSource = readFileSync(join(appRoot, "factions.tsx"), "utf8");
const characterSource = readFileSync(join(appRoot, "character.tsx"), "utf8");

describe("settlement operational UI coverage", () => {
  it("keeps the active-city setting and government summary beside date/status", () => {
    expect(overviewSource).toContain('accessibilityLabel="Active city setting and government"');
    expect(overviewSource).toContain("SETTING: WASTELAND METROPOLIS");
    expect(overviewSource).toContain("GOVERNMENT: SECTOR COMMAND");
  });

  it("renders the shared settlement sheet rather than a megacity-only dossier", () => {
    expect(worldMapSource).toContain('(!selectedOperational || selectedLocation.type === "player_city" || selectedLocation.type === "resource_node")');
    expect(worldMapSource).not.toContain('<Text style={styles.infoPanelDesc}>{selectedLocation.description}</Text>\n\n                {selectedLocation.type');
    expect(worldMapSource).toContain('accessibilityLabel={`${selectedLocation.name} operational sheet`}');
    for (const label of [
      "TERRITORY",
      "SETTING",
      "GOVERNMENT",
      "INSTITUTION",
      "ECONOMY",
      "OUTPUTS",
      "RESOURCES",
      "TRADE",
      "INFRASTRUCTURE",
      "MILITARY",
      "STABILITY",
      "DIPLOMACY",
    ]) {
      expect(worldMapSource, `missing sheet row ${label}`).toContain(`>${label}<`);
    }
    expect(worldMapSource).toContain("operationalFromSettlement");
    expect(worldMapSource).toContain("selectedOperational.trade.exports");
    expect(worldMapSource).toContain("selectedOperational.infrastructureScore.totalPoints");
    expect(worldMapSource).toContain("selectedOperational.infrastructureScore.integrityPercent");
    expect(worldMapSource).toContain("formatInfrastructureSummary");
    expect(worldMapSource).toContain("formatInfrastructureAccessibilityLabel");
  });

  it("reuses the shared operational facts in megacity and township diplomacy details", () => {
    expect(diplomacySource).toContain('accessibilityLabel={`${profile.name} operational facts`}');
    expect(diplomacySource).toContain("operationalFromSettlement((cityEntity ?? entity)");
    expect(diplomacySource).toContain("const hasSharedOperationalRecord = Boolean(cityEntity?.operational)");
    expect(diplomacySource).toContain(">OPERATIONAL FACTS<");
    expect(diplomacySource).toContain('renderField("INFRASTRUCTURE SCORE"');
    expect(diplomacySource).toContain("operational.infrastructureScore");
    expect(diplomacySource).toContain("formatInfrastructureSummary");
    expect(diplomacySource).toContain("formatInfrastructureAccessibilityLabel");
    for (const label of [
      "POPULATION",
      "GOVERNMENT",
      "ECONOMY",
      "RESOURCES",
      "TRADE",
      "MILITARY",
      "STABILITY",
    ]) {
      expect(diplomacySource, `missing diplomacy operational row ${label}`)
        .toContain(`renderField("${label}", { value: operational.`);
    }
    expect(diplomacySource).not.toContain("operational.continuance");
    expect(diplomacySource).not.toContain("continuance.cohorts");
    expect(diplomacySource).not.toContain("continuance.bunker");
    expect(diplomacySource).toContain('!hasSharedOperationalRecord && renderField("GOVERNMENT"');
    expect(diplomacySource).toContain('!hasSharedOperationalRecord && renderField("POPULATION"');
    expect(diplomacySource).toContain('!hasSharedOperationalRecord && renderField("EXPORTS"');
    expect(diplomacySource).toContain('!hasSharedOperationalRecord && renderField("RESOURCES"');
  });

  it("uses shared population/government facts on compact cards and preserves legacy fallback", () => {
    expect(diplomacySource).toContain("getSettlementCardFacts(m)");
    expect(diplomacySource).toContain("getSettlementCardFacts(t)");
    expect(diplomacySource).toContain("const population = sharedFacts?.population ?? prof.population.value");
    expect(diplomacySource).toContain("const government = sharedFacts?.government ?? prof.government.value");

    const shared = getSettlementCardFacts({
      id: "shared",
      name: "Shared",
      description: "",
      influence: 1,
      loyalty: 1,
      threat: 1,
      isActive: true,
      tradeInventory: {},
      lastRefreshTick: 0,
      factionType: "megacity",
      operational: {
        population: 123456,
        territoryKm2: 1,
        infrastructure: { military: 1, walls: 1, fuel: 1, civilian: 1 },
      infrastructureScore: { totalPoints: 42, integrityPercent: 75 },
        setting: { terrain: "test", coastal: false, wasteland: false },
        government: { style: "Civic council", institution: "Public office" },
        economy: { profile: "test", outputs: [] },
        resources: [],
        trade: { exports: [], imports: [], capacity: "limited" },
        military: { capacity: 1, posture: "defensive" },
        stability: { score: 1, label: "stable" },
        diplomacy: { posture: "open", influence: 1 },
      },
    });
    expect(shared).toEqual({ population: 123456, government: "Civic council" });
    expect(getSettlementCardFacts({
      id: "legacy",
      name: "Legacy",
      description: "",
      influence: 1,
      loyalty: 1,
      threat: 1,
      isActive: true,
      tradeInventory: {},
      lastRefreshTick: 0,
      factionType: "megacity",
      population: 987,
      governanceStyle: "Legacy council",
    })).toBeNull();
  });

  it("uses the same disclosure-aware sheet contract across entity screens", () => {
    for (const source of [worldMapSource, diplomacySource, factionsSource, characterSource]) {
      expect(source).toContain("OperationalEntitySheet");
      expect(source).toContain("disclosureLabel");
      expect(source).toContain("evidenceLabel");
    }
    expect(diplomacySource).toContain("getEntityDisclosure");
    expect(diplomacySource).toContain("state.intelItems");
    expect(diplomacySource).toContain("state.diplomaticHistory");
    expect(worldMapSource).toContain("discoveredIds.includes(selectedLocation.id)");
    expect(factionsSource).toContain('kind="internal faction"');
    expect(characterSource).toContain('kind="appointed officer"');
  });
});
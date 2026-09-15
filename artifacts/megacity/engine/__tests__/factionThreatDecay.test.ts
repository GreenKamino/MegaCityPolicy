import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { processFactionThreatDecay } from "@/engine/tickProcessors";
import type { Faction } from "@/engine/types";

function makeFaction(overrides: Partial<Faction>): Faction {
  return {
    id: "test_faction",
    name: "Test Faction",
    description: "test",
    influence: 50,
    loyalty: 50,
    threat: 50,
    type: "criminal",
    isActive: true,
    ...overrides,
  } as Faction;
}

describe("processFactionThreatDecay", () => {
  it("does nothing on empty faction list", () => {
    const s = createInitialState();
    s.factions = [];
    expect(() => processFactionThreatDecay(s, [])).not.toThrow();
    expect(s.factions).toEqual([]);
  });

  it("does not decay below the friction floor of 5", () => {
    const s = createInitialState();
    s.factions = [makeFaction({ id: "low", threat: 5, loyalty: 0 })];
    processFactionThreatDecay(s, []);
    expect(s.factions[0].threat).toBe(5);
  });

  it("decays high threat downward by at least 0.2", () => {
    const s = createInitialState();
    s.factions = [makeFaction({ id: "hot", threat: 80, loyalty: 50 })];
    const before = s.factions[0].threat;
    processFactionThreatDecay(s, []);
    expect(s.factions[0].threat).toBeLessThan(before);
    expect(before - s.factions[0].threat).toBeGreaterThanOrEqual(0.2);
  });

  it("loyal factions decay faster than disloyal ones", () => {
    const s = createInitialState();
    s.factions = [
      makeFaction({ id: "loyal", threat: 60, loyalty: 100 }),
      makeFaction({ id: "rebel", threat: 60, loyalty: 0 }),
    ];
    processFactionThreatDecay(s, []);
    const loyalDrop = 60 - s.factions[0].threat;
    const rebelDrop = 60 - s.factions[1].threat;
    expect(loyalDrop).toBeGreaterThan(rebelDrop);
  });

  it("skips inactive factions", () => {
    const s = createInitialState();
    s.factions = [makeFaction({ id: "off", threat: 80, isActive: false })];
    processFactionThreatDecay(s, []);
    expect(s.factions[0].threat).toBe(80);
  });

  it("skips factions in active civil war", () => {
    const s = createInitialState();
    s.factions = [makeFaction({ id: "war", threat: 90 })];
    (s as any).newSystems = {
      civilWars: [{ factionId: "war", phase: "active" }],
    };
    processFactionThreatDecay(s, []);
    expect(s.factions[0].threat).toBe(90);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildLogbook,
  summarizeCategory,
  summarizeLogbook,
} from "@/engine/logbook";
import type { GameState } from "@/engine/types";

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    factions: [],
    externalMegacities: [],
    townships: [],
    notableLocations: [],
    namedCharacters: [],
    ...over,
  } as unknown as GameState;
}

describe("logbook.buildLogbook", () => {
  it("returns one entry per category, even when state is empty", () => {
    const cats = buildLogbook(makeState());
    expect(cats.map((c) => c.id)).toEqual([
      "factions",
      "megacities",
      "townships",
      "locations",
      "namedCharacters",
    ]);
    for (const c of cats) {
      expect(c.entries).toEqual([]);
    }
  });

  it("marks active factions as discovered, inactive as locked", () => {
    const state = makeState({
      factions: [
        { id: "a", name: "A", description: "alpha", type: "law", influence: 10, loyalty: 50, threat: 0, isActive: true },
        { id: "b", name: "B", description: "beta", type: "criminal", influence: 0, loyalty: 0, threat: 90, isActive: false },
      ] as any,
    });
    const cat = buildLogbook(state)[0];
    const byId = Object.fromEntries(cat.entries.map((e) => [e.id, e]));
    expect(byId["a"].discovered).toBe(true);
    expect(byId["b"].discovered).toBe(false);
  });

  it("marks active megacities as discovered", () => {
    const state = makeState({
      externalMegacities: [
        { id: "m1", name: "Aurora", description: "x", isActive: true } as any,
        { id: "m2", name: "Hidden", description: "y", isActive: false } as any,
      ],
    });
    const cat = buildLogbook(state).find((c) => c.id === "megacities")!;
    const byId = Object.fromEntries(cat.entries.map((e) => [e.id, e]));
    expect(byId["m1"].discovered).toBe(true);
    expect(byId["m2"].discovered).toBe(false);
  });

  it("treats townships with status='undiscovered' as locked", () => {
    const state = makeState({
      townships: [
        { id: "t1", name: "Allied Town", status: "allied" } as any,
        { id: "t2", name: "Mystery", status: "undiscovered" } as any,
      ],
    });
    const cat = buildLogbook(state).find((c) => c.id === "townships")!;
    expect(cat.entries.find((e) => e.id === "t1")!.discovered).toBe(true);
    expect(cat.entries.find((e) => e.id === "t2")!.discovered).toBe(false);
  });

  it("uses NotableLocation.discovered flag", () => {
    const state = makeState({
      notableLocations: [
        { id: "l1", name: "Beacon", description: "", type: "landmark", discovered: true },
        { id: "l2", name: "Dark Tower", description: "", type: "ruin", discovered: false },
      ],
    });
    const cat = buildLogbook(state).find((c) => c.id === "locations")!;
    expect(cat.entries.find((e) => e.id === "l1")!.discovered).toBe(true);
    expect(cat.entries.find((e) => e.id === "l2")!.discovered).toBe(false);
  });

  it("treats every named character in state as discovered", () => {
    const state = makeState({ namedCharacters: [{ id: "n", name: "Foo" }] as any });
    const cat = buildLogbook(state).find((c) => c.id === "namedCharacters")!;
    expect(cat.entries[0].discovered).toBe(true);
  });
});

describe("logbook.summarizeCategory + summarizeLogbook", () => {
  it("counts discovered vs total", () => {
    const state = makeState({
      factions: [
        { id: "a", name: "A", description: "", type: "law", influence: 0, loyalty: 0, threat: 0, isActive: true },
        { id: "b", name: "B", description: "", type: "law", influence: 0, loyalty: 0, threat: 0, isActive: false },
      ] as any,
      notableLocations: [
        { id: "l1", name: "x", description: "", type: "landmark", discovered: true },
      ],
    });
    const cats = buildLogbook(state);
    const factions = summarizeCategory(cats[0]);
    expect(factions.total).toBe(2);
    expect(factions.discovered).toBe(1);
    const total = summarizeLogbook(state);
    expect(total.total).toBe(3);
    expect(total.discovered).toBe(2);
  });

  it("returns 0/0 for an empty state", () => {
    expect(summarizeLogbook(makeState())).toEqual({ discovered: 0, total: 0 });
  });
});

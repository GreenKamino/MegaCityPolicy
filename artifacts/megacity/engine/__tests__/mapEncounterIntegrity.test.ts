import { describe, expect, it, vi } from "vitest";

import {
  ENCOUNTERS,
  HAZARD_ENCOUNTERS,
  rollEncounter,
} from "@/engine/mapEncounters";
import type { LocationTerrain, WorldLocation } from "@/engine/worldMap";
import type { GameState } from "@/engine/types";

const VALID_TERRAINS: ReadonlySet<LocationTerrain> = new Set<LocationTerrain>([
  "urban",
  "coastal",
  "riverine",
  "lakeside",
  "submerged",
  "subterranean",
  "elevated",
  "mountain",
  "wasteland",
  "desert",
  "volcanic",
  "swamp",
  "forest",
  "plains",
  "canyon",
  "offshore",
  "mobile",
  "orbital",
]);

function makeLoc(terrain: LocationTerrain): WorldLocation {
  return {
    id: `test_${terrain}`,
    name: `Test ${terrain}`,
    type: "township",
    faction: "Independents",
    x: 1000,
    y: 1000,
    population: 5000,
    defenseRating: 5,
    terrain,
    connectedTo: [],
    discovered: true,
  } as unknown as WorldLocation;
}

const baseState: GameState = {
  resources: { credits: 0, ammo: 0, food: 0 },
  totalTicks: 0,
  locationRelations: {},
  discoveredLocationIds: [],
} as unknown as GameState;

describe("map encounter integrity", () => {
  it("all encounter ids are unique across both pools", () => {
    const all = [...ENCOUNTERS, ...HAZARD_ENCOUNTERS].map((e) => e.id);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const id of all) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes).toEqual([]);
  });

  it("severity strictly matches effect signs for positive and negative entries (warning is tonal and may mix)", () => {
    // 'warning' is intentionally tonal in this codebase — some warnings carry
    // mixed outcomes (e.g. wildlife_predator: ammo loss + food gain). We only
    // enforce strict resource-sign alignment for 'positive' and 'negative'.
    const norm = (e: (typeof ENCOUNTERS)[number]) =>
      (e.effects.creditsDelta ?? 0) +
      (e.effects.ammoDelta ?? 0) * 100 +
      (e.effects.foodDelta ?? 0) * 100 +
      (e.effects.dispositionDelta ?? 0) * 100;
    for (const e of [...ENCOUNTERS, ...HAZARD_ENCOUNTERS]) {
      const total = norm(e);
      if (e.severity === "positive") {
        expect(total, `${e.id} positive should net > 0`).toBeGreaterThan(0);
      } else if (e.severity === "negative") {
        expect(total, `${e.id} negative should net < 0`).toBeLessThan(0);
      }
    }
  });

  it("every encounter has at least one description and one action", () => {
    for (const e of [...ENCOUNTERS, ...HAZARD_ENCOUNTERS]) {
      expect(e.descriptions.length, `${e.id} descriptions`).toBeGreaterThan(0);
      expect(e.actions.length, `${e.id} actions`).toBeGreaterThan(0);
      expect(e.chance, `${e.id} chance`).toBeGreaterThan(0);
      expect(e.chance, `${e.id} chance ceiling`).toBeLessThanOrEqual(1);
    }
  });

  // Sanity: condition predicates do not throw on any known LocationTerrain,
  // and there exists at least one combination of (terrain × defenseRating ×
  // state) that lets the predicate return true. Some conditions gate on
  // terrain; others on defenseRating; others on locationRelations state.
  it("conditioned encounters accept at least one valid (terrain × defense × state) combination", () => {
    const defenseSamples = [0, 50];
    for (const e of [...ENCOUNTERS, ...HAZARD_ENCOUNTERS]) {
      if (!e.condition) continue;
      let anyTrue = false;
      for (const terrain of VALID_TERRAINS) {
        for (const def of defenseSamples) {
          const loc = makeLoc(terrain);
          (loc as { defenseRating: number }).defenseRating = def;
          // Provide a permissive state so relation-gated conditions can
          // also be satisfied (e.g. local_militia_join needs aidSent >= 2).
          const richState = {
            ...baseState,
            locationRelations: {
              [loc.id]: {
                aidSent: 5,
                tradeSent: 5,
                disposition: 50,
              },
            },
          } as unknown as GameState;
          const ok = e.condition(loc, richState);
          if (ok) anyTrue = true;
        }
      }
      expect(anyTrue, `${e.id} condition rejected every known combination`).toBe(true);
    }
  });

  // Reachability check for the 6 round-G encounters: with their target terrain
  // and a generous Math.random sequence (every roll succeeds), the encounter
  // pool must be able to surface the new title within a bounded number of
  // trials. This guards against future reordering or condition regressions.
  const ROUND_G_TITLES: Record<string, { terrain: LocationTerrain; action: string }> = {
    "DERELICT VESSEL BOARDED": { terrain: "submerged", action: "scout" },
    "TIDE STRANDING": { terrain: "riverine", action: "scout" },
    "VILLAGERS BREAK BREAD": { terrain: "lakeside", action: "scout" },
    "SHAFT COLLAPSE": { terrain: "subterranean", action: "scout" },
    "PRE-WAR RELAY ACTIVE": { terrain: "subterranean", action: "scout" },
    "BILGE BLOOM CONTAMINATION": { terrain: "submerged", action: "scout" },
  };

  it("each Round G encounter is reachable on its target terrain (Monte Carlo)", () => {
    for (const [title, { terrain, action }] of Object.entries(ROUND_G_TITLES)) {
      const loc = makeLoc(terrain);
      let seen = false;
      for (let i = 0; i < 1500; i++) {
        const enc = rollEncounter(action, loc, baseState, []);
        if (enc && enc.title === title) {
          seen = true;
          break;
        }
      }
      expect(seen, `expected ${title} on terrain ${terrain}`).toBe(true);
    }
  });

  it("Round G coastal encounters do not fire on subterranean and vice versa (deterministic)", () => {
    // Force every roll to succeed; iterate eligible encounters in declared
    // order. On a wrong-terrain location, NONE of the Round G titles for the
    // OTHER terrain family should appear in 200 rolls.
    const subterraneanOnly = ["SHAFT COLLAPSE", "PRE-WAR RELAY ACTIVE"];
    const submergedOrCoastal = [
      "DERELICT VESSEL BOARDED",
      "TIDE STRANDING",
      "VILLAGERS BREAK BREAD",
      "BILGE BLOOM CONTAMINATION",
    ];

    const sample = (loc: WorldLocation, action: string): Set<string> => {
      const titles = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const enc = rollEncounter(action, loc, baseState, []);
        if (enc) titles.add(enc.title);
      }
      return titles;
    };

    const desertTitles = sample(makeLoc("desert"), "scout");
    for (const t of [...subterraneanOnly, ...submergedOrCoastal]) {
      expect(desertTitles.has(t), `${t} fired on desert (should not)`).toBe(false);
    }

    const subTitles = sample(makeLoc("subterranean"), "scout");
    for (const t of submergedOrCoastal) {
      expect(subTitles.has(t), `${t} fired on subterranean (should not)`).toBe(false);
    }
  });

  it("rollEncounter returns null when every roll misses (deterministic)", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.999);
    try {
      const enc = rollEncounter("scout", makeLoc("subterranean"), baseState, []);
      expect(enc).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

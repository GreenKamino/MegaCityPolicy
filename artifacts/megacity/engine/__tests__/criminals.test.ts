import { describe, expect, it } from "vitest";

import {
  CRIMINAL_STATUS_LABELS,
  CRIMINAL_STATUS_ORDER,
  deriveCriminalStatus,
  deriveLastKnownLocation,
  deriveRapSheet,
  filterCriminals,
  isCriminalNPC,
  isCriminalRole,
  listCriminals,
  summarizeCriminals,
  type CriminalEntry,
} from "../criminals";
import type {
  CharacterRole,
  CharacterStatus,
  District,
  GameState,
  NamedCharacter,
  NamedCharacterEvent,
} from "../types";

function ev(year: number, text: string): NamedCharacterEvent {
  return { year, text };
}

function npc(over: Partial<NamedCharacter> = {}): NamedCharacter {
  return {
    id: over.id ?? "n1",
    name: over.name ?? "Razor Vex",
    role: over.role ?? "gang_lieutenant",
    factionId: over.factionId ?? null,
    districtId: over.districtId ?? null,
    status: (over.status ?? "active") as CharacterStatus,
    notoriety: over.notoriety ?? 50,
    traits: over.traits ?? [],
    backstory: over.backstory ?? "",
    bornYear: over.bornYear ?? 2050,
    introducedYear: over.introducedYear ?? 2080,
    lastSeenYear: over.lastSeenYear ?? 2090,
    history: over.history ?? [],
  };
}

function district(id: string, name: string): District {
  return {
    id,
    name,
    subtitle: "",
    population: 1000,
    wealth: 10,
    crime: 10,
    unrest: 10,
    loyalty: 50,
    infraQuality: 50,
    gangInfluence: 10,
    mutationRate: 0,
    defenseRating: 50,
    industrialOutput: 10,
    ecology: 50,
  };
}

function gameState(over: { namedCharacters?: NamedCharacter[]; districts?: District[] } = {}): GameState {
  return {
    namedCharacters: over.namedCharacters ?? [],
    districts: over.districts ?? [],
  } as unknown as GameState;
}

describe("isCriminalRole", () => {
  it("returns true for gang lieutenant and fugitive", () => {
    expect(isCriminalRole("gang_lieutenant")).toBe(true);
    expect(isCriminalRole("fugitive")).toBe(true);
  });
  it("returns false for journalist, tycoon, preacher, etc.", () => {
    const others: CharacterRole[] = [
      "journalist", "tycoon", "agitator", "celebrity",
      "informant", "preacher", "union_boss",
    ];
    for (const r of others) expect(isCriminalRole(r)).toBe(false);
  });
});

describe("deriveCriminalStatus", () => {
  it("returns null for non-criminal active NPCs", () => {
    expect(deriveCriminalStatus(npc({ role: "journalist", status: "active" }))).toBeNull();
    expect(deriveCriminalStatus(npc({ role: "tycoon", status: "active" }))).toBeNull();
  });

  it("returns 'detained' for jailed NPCs regardless of role", () => {
    expect(deriveCriminalStatus(npc({ role: "gang_lieutenant", status: "jailed" }))).toBe("detained");
    expect(deriveCriminalStatus(npc({ role: "journalist", status: "jailed" }))).toBe("detained");
  });

  it("returns 'fugitive' for exiled NPCs (any role)", () => {
    expect(deriveCriminalStatus(npc({ role: "gang_lieutenant", status: "exiled" }))).toBe("fugitive");
    expect(deriveCriminalStatus(npc({ role: "preacher", status: "exiled" }))).toBe("fugitive");
  });

  it("returns 'executed' only for criminal-role dead NPCs", () => {
    expect(deriveCriminalStatus(npc({ role: "gang_lieutenant", status: "dead" }))).toBe("executed");
    expect(deriveCriminalStatus(npc({ role: "fugitive", status: "dead" }))).toBe("executed");
    expect(deriveCriminalStatus(npc({ role: "journalist", status: "dead" }))).toBeNull();
  });

  it("returns 'missing' only for criminal-role missing NPCs", () => {
    expect(deriveCriminalStatus(npc({ role: "gang_lieutenant", status: "missing" }))).toBe("missing");
    expect(deriveCriminalStatus(npc({ role: "tycoon", status: "missing" }))).toBeNull();
  });

  it("returns 'wanted' for active gang lieutenants with no special history", () => {
    expect(deriveCriminalStatus(npc({ role: "gang_lieutenant", status: "active" }))).toBe("wanted");
  });

  it("returns 'fugitive' for active fugitive role even without history", () => {
    expect(deriveCriminalStatus(npc({ role: "fugitive", status: "active" }))).toBe("fugitive");
  });

  it("returns 'fugitive' when most recent history mentions escape/breakout/fled", () => {
    expect(
      deriveCriminalStatus(npc({
        role: "gang_lieutenant",
        status: "active",
        history: [ev(2090, "Sentenced to ten years."), ev(2092, "Escaped from holding.")],
      })),
    ).toBe("fugitive");
    expect(
      deriveCriminalStatus(npc({
        role: "gang_lieutenant",
        status: "active",
        history: [ev(2092, "Fled the sector ahead of the raid.")],
      })),
    ).toBe("fugitive");
  });

  it("returns 'probation' when most recent history mentions parole/release", () => {
    expect(
      deriveCriminalStatus(npc({
        role: "gang_lieutenant",
        status: "active",
        history: [ev(2090, "Caught running contraband."), ev(2093, "Paroled after good behavior.")],
      })),
    ).toBe("probation");
  });

  it("escape outranks an older parole entry", () => {
    expect(
      deriveCriminalStatus(npc({
        role: "gang_lieutenant",
        status: "active",
        history: [
          ev(2090, "Released on parole."),
          ev(2092, "Escaped during sweep."),
        ],
      })),
    ).toBe("fugitive");
  });

  it("parole outranks an older escape entry", () => {
    expect(
      deriveCriminalStatus(npc({
        role: "gang_lieutenant",
        status: "active",
        history: [
          ev(2090, "Escaped from holding."),
          ev(2093, "Paroled after good behavior."),
        ],
      })),
    ).toBe("probation");
  });
});

describe("isCriminalNPC", () => {
  it("matches deriveCriminalStatus !== null", () => {
    expect(isCriminalNPC(npc({ role: "gang_lieutenant", status: "active" }))).toBe(true);
    expect(isCriminalNPC(npc({ role: "journalist", status: "active" }))).toBe(false);
    expect(isCriminalNPC(npc({ role: "celebrity", status: "jailed" }))).toBe(true);
  });
});

describe("deriveRapSheet", () => {
  it("returns empty array for empty history", () => {
    expect(deriveRapSheet(npc({ history: [] }))).toEqual([]);
  });

  it("filters to crime-flavored entries when any match", () => {
    const out = deriveRapSheet(npc({
      history: [
        ev(2080, "Born in the lower stacks."),
        ev(2090, "Arrested for assault."),
        ev(2091, "Got married."),
        ev(2092, "Caught running a heist."),
      ],
    }));
    expect(out.map((e) => e.year)).toEqual([2092, 2090]);
  });

  it("returns empty when no crime keywords match (no padding with life events)", () => {
    const out = deriveRapSheet(npc({
      history: [
        ev(2080, "Born in the lower stacks."),
        ev(2085, "Worked the docks."),
        ev(2090, "Met a stranger."),
      ],
    }));
    expect(out).toEqual([]);
  });

  it("caps to max entries (default 5) and returns newest-first", () => {
    const hist = Array.from({ length: 10 }, (_, i) => ev(2080 + i, "Ran a raid."));
    const out = deriveRapSheet(npc({ history: hist }));
    expect(out).toHaveLength(5);
    expect(out[0].year).toBe(2089);
    expect(out[4].year).toBe(2085);
  });

  it("respects custom max", () => {
    const hist = Array.from({ length: 10 }, (_, i) => ev(2080 + i, "Sentenced again."));
    expect(deriveRapSheet(npc({ history: hist }), 3)).toHaveLength(3);
  });
});

describe("deriveLastKnownLocation", () => {
  const districts = [district("d1", "Sector 7"), district("d2", "Old Quarter")];
  const state = gameState({ districts });

  it("resolves districtId to district name", () => {
    expect(deriveLastKnownLocation(npc({ districtId: "d1" }), state)).toBe("Sector 7");
    expect(deriveLastKnownLocation(npc({ districtId: "d2" }), state)).toBe("Old Quarter");
  });

  it("returns UNKNOWN for missing districtId", () => {
    expect(deriveLastKnownLocation(npc({ districtId: null }), state)).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when districtId doesn't match any district", () => {
    expect(deriveLastKnownLocation(npc({ districtId: "ghost" }), state)).toBe("UNKNOWN");
  });

  it("handles missing state.districts gracefully", () => {
    const s = { namedCharacters: [] } as unknown as GameState;
    expect(deriveLastKnownLocation(npc({ districtId: "d1" }), s)).toBe("UNKNOWN");
  });
});

describe("listCriminals", () => {
  it("filters out non-criminal NPCs", () => {
    const state = gameState({
      namedCharacters: [
        npc({ id: "a", name: "A", role: "gang_lieutenant", status: "active", notoriety: 70 }),
        npc({ id: "b", name: "B", role: "journalist", status: "active", notoriety: 80 }),
        npc({ id: "c", name: "C", role: "celebrity", status: "jailed", notoriety: 30 }),
      ],
    });
    const out = listCriminals(state);
    expect(out.map((e) => e.npc.id).sort()).toEqual(["a", "c"]);
  });

  it("sorts by notoriety desc then name asc", () => {
    const state = gameState({
      namedCharacters: [
        npc({ id: "a", name: "Zed", role: "gang_lieutenant", status: "active", notoriety: 50 }),
        npc({ id: "b", name: "Aria", role: "gang_lieutenant", status: "active", notoriety: 50 }),
        npc({ id: "c", name: "Cole", role: "fugitive", status: "active", notoriety: 90 }),
      ],
    });
    const out = listCriminals(state);
    expect(out.map((e) => e.npc.id)).toEqual(["c", "b", "a"]);
  });

  it("populates rapSheet and lastKnownLocation per entry", () => {
    const districts = [district("d1", "Sector 7")];
    const state = gameState({
      districts,
      namedCharacters: [
        npc({
          id: "a", name: "Razor", role: "gang_lieutenant", status: "active",
          districtId: "d1",
          history: [ev(2090, "Ran a heist.")],
        }),
      ],
    });
    const out = listCriminals(state);
    expect(out[0].lastKnownLocation).toBe("Sector 7");
    expect(out[0].rapSheet).toHaveLength(1);
    expect(out[0].rapSheet[0].text).toContain("heist");
  });

  it("handles missing namedCharacters array", () => {
    const s = {} as GameState;
    expect(listCriminals(s)).toEqual([]);
  });
});

describe("summarizeCriminals", () => {
  it("counts by status with a total", () => {
    const entries: CriminalEntry[] = [
      { npc: npc(), criminalStatus: "wanted", rapSheet: [], lastKnownLocation: "X" },
      { npc: npc(), criminalStatus: "wanted", rapSheet: [], lastKnownLocation: "X" },
      { npc: npc(), criminalStatus: "detained", rapSheet: [], lastKnownLocation: "X" },
      { npc: npc(), criminalStatus: "fugitive", rapSheet: [], lastKnownLocation: "X" },
    ];
    const sum = summarizeCriminals(entries);
    expect(sum.total).toBe(4);
    expect(sum.wanted).toBe(2);
    expect(sum.detained).toBe(1);
    expect(sum.fugitive).toBe(1);
    expect(sum.executed).toBe(0);
    expect(sum.probation).toBe(0);
    expect(sum.missing).toBe(0);
  });
});

describe("filterCriminals", () => {
  const districts = [district("d1", "Sector 7"), district("d2", "Old Quarter")];
  const state = gameState({
    districts,
    namedCharacters: [
      npc({
        id: "a", name: "Razor Vex", role: "gang_lieutenant", status: "active",
        districtId: "d1", notoriety: 80,
        history: [ev(2092, "Caught running contraband.")],
      }),
      npc({
        id: "b", name: "Ghost", role: "fugitive", status: "active",
        districtId: "d2", notoriety: 60,
        history: [ev(2091, "Fled the sweep.")],
      }),
      npc({
        id: "c", name: "Marsh Cole", role: "gang_lieutenant", status: "jailed",
        districtId: "d1", notoriety: 40,
        history: [ev(2093, "Sentenced for assault.")],
      }),
    ],
  });
  const all = listCriminals(state);

  it("returns everything when no filters provided", () => {
    expect(filterCriminals(all, {}).length).toBe(3);
  });

  it("filters by status chip", () => {
    expect(filterCriminals(all, { status: "wanted" }).map((e) => e.npc.id)).toEqual(["a"]);
    expect(filterCriminals(all, { status: "detained" }).map((e) => e.npc.id)).toEqual(["c"]);
    expect(filterCriminals(all, { status: "fugitive" }).map((e) => e.npc.id)).toEqual(["b"]);
  });

  it("status='all' returns everything", () => {
    expect(filterCriminals(all, { status: "all" }).length).toBe(3);
  });

  it("query matches name", () => {
    expect(filterCriminals(all, { query: "razor" }).map((e) => e.npc.id)).toEqual(["a"]);
  });

  it("query matches role (raw enum and display label)", () => {
    // 'b' has role=fugitive. 'a' is also a fugitive in the *derived* status
    // sense (active gang_lieutenant defaults to wanted, but the derived
    // status filter is separate). The query "fugitive" hits the role label
    // for 'b' and the status badge ("FUGITIVE") for whichever entries are
    // currently flagged that way — here only 'b'.
    expect(filterCriminals(all, { query: "fugitive" }).map((e) => e.npc.id)).toEqual(["b"]);
    expect(filterCriminals(all, { query: "gang_lieutenant" }).map((e) => e.npc.id).sort()).toEqual(["a", "c"]);
    // Display label search — "Gang Lieutenant" is what the user actually sees.
    expect(filterCriminals(all, { query: "gang lieutenant" }).map((e) => e.npc.id).sort()).toEqual(["a", "c"]);
  });

  it("query matches status badge label", () => {
    expect(filterCriminals(all, { query: "wanted" }).map((e) => e.npc.id)).toEqual(["a"]);
    expect(filterCriminals(all, { query: "detained" }).map((e) => e.npc.id)).toEqual(["c"]);
  });

  it("query matches location", () => {
    expect(filterCriminals(all, { query: "old quarter" }).map((e) => e.npc.id)).toEqual(["b"]);
  });

  it("query matches rap-sheet text", () => {
    expect(filterCriminals(all, { query: "contraband" }).map((e) => e.npc.id)).toEqual(["a"]);
    expect(filterCriminals(all, { query: "assault" }).map((e) => e.npc.id)).toEqual(["c"]);
  });

  it("status + query combine (AND)", () => {
    expect(
      filterCriminals(all, { status: "wanted", query: "ghost" }).map((e) => e.npc.id),
    ).toEqual([]);
    expect(
      filterCriminals(all, { status: "wanted", query: "razor" }).map((e) => e.npc.id),
    ).toEqual(["a"]);
  });
});

describe("status labels and order", () => {
  it("has a label for every status in the order array", () => {
    for (const s of CRIMINAL_STATUS_ORDER) {
      expect(CRIMINAL_STATUS_LABELS[s]).toBeTruthy();
    }
  });
  it("MIA label maps to internal 'missing' status", () => {
    expect(CRIMINAL_STATUS_LABELS.missing).toBe("MIA");
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  generateSortieReport,
  generateAerialEngagementReport,
  generateCyberWarfareReport,
  generatePropagandaReport,
  generateSiegeBreachAlert,
  generateWartimePeriodicMessage,
  isAtWar,
  getWarContext,
} from "@/engine/wartimeEvents";
import { createInitialState } from "@/engine/initialState";
import type { GameState, ExternalMegacity } from "@/engine/types";

// Deterministic peacetime fixture. createInitialState() picks a random
// starting region whose initialDiscovered list MAY include locations
// whose status === "hostile" in WORLD_LOCATIONS — making
// getHostileEntities() return non-empty and activeWarContext() return
// non-null. That breaks "returns null when not at war" assertions
// non-deterministically (Math.random advances across earlier tests in
// the file, so which test fails depends on roll order). Strip the two
// inputs that getHostileEntities reads — discoveredLocationIds and any
// hostile externalMegacities — to guarantee a peacetime gate.
function makePeacetimeState(gameDate: GameState["gameDate"]): GameState {
  const s = createInitialState();
  s.gameDate = gameDate;
  s.discoveredLocationIds = [];
  s.externalMegacities = (s.externalMegacities ?? []).filter(
    m => !(m.isActive && m.loyalty < 15 && m.threat > 50),
  );
  return s;
}

function makeWarState(opts: { underSiege?: boolean; blockaded?: boolean } = {}): GameState {
  const s = createInitialState();
  s.gameDate = { year: 2200, month: 4, day: 8, hour: 12 };
  // Inject a hostile megacity so isAtWar() / getWarContext.atWar are true.
  const hostile: ExternalMegacity = {
    id: "ext-hostile-test",
    name: "Iron Republic",
    isActive: true,
    threat: 80,
    loyalty: 5,
    militaryStrength: "high",
    leader: { name: "Praetor Vex", title: "Iron Praetor", attitude: "hostile" },
  } as ExternalMegacity;
  s.externalMegacities = [...(s.externalMegacities ?? []), hostile];
  if (opts.underSiege || opts.blockaded) {
    s.combat = s.combat ?? ({} as GameState["combat"]);
    if (s.combat) {
      s.combat.zones = [
        ...(s.combat.zones ?? []),
        { id: "z1", status: "hostile" } as any,
        { id: "z2", status: "hostile" } as any,
        { id: "z3", status: "hostile" } as any,
        { id: "z4", status: "hostile" } as any,
        { id: "z5", status: "hostile" } as any,
      ];
      s.combat.raidEventQueue = [
        ...(s.combat.raidEventQueue ?? []),
        { id: "raid1", name: "Active Probe", status: "active", enemyStrength: 200, targetZoneId: "z1", ticksRemaining: 10 } as any,
      ];
    }
    if (opts.blockaded) s.bordersClosed = true;
  }
  return s;
}

describe("wartime — sortie report", () => {
  it("returns null when not at war", () => {
    const s = makePeacetimeState({ year: 2200, month: 4, day: 8, hour: 12 });
    expect(generateSortieReport(s)).toBeNull();
  });

  it("returns null when at war but no siege and no active raids", () => {
    const s = makeWarState();
    expect(generateSortieReport(s)).toBeNull();
  });

  it("emits a structured report when under siege", () => {
    const s = makeWarState({ underSiege: true });
    const msg = generateSortieReport(s);
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("SORTIE");
    expect(msg!.body).toContain("MISSION SUMMARY");
    expect(msg!.priority).toBe("high");
  });
});

describe("wartime — aerial engagement", () => {
  it("returns null when not at war", () => {
    const s = makePeacetimeState({ year: 2200, month: 4, day: 8, hour: 12 });
    expect(generateAerialEngagementReport(s)).toBeNull();
  });

  it("emits a digest when at war", () => {
    const s = makeWarState();
    const msg = generateAerialEngagementReport(s);
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("AERIAL");
    expect(msg!.body).toContain("ENGAGEMENT NOTE");
  });
});

describe("wartime — cyber warfare", () => {
  it("returns null when not at war", () => {
    const s = makePeacetimeState({ year: 2200, month: 4, day: 8, hour: 18 });
    expect(generateCyberWarfareReport(s)).toBeNull();
  });

  it("emits a high-priority intel bulletin when at war", () => {
    const s = makeWarState();
    const msg = generateCyberWarfareReport(s);
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("CYBER");
    expect(msg!.category).toBe("intel");
    expect(msg!.priority).toBe("high");
  });
});

describe("wartime — propaganda volley", () => {
  it("returns null when not at war", () => {
    const s = makePeacetimeState({ year: 2200, month: 4, day: 8, hour: 18 });
    expect(generatePropagandaReport(s)).toBeNull();
  });

  it("frames body by current war morale", () => {
    const s = makeWarState();
    s.combat = { ...(s.combat ?? ({} as any)), warMorale: 75 } as any;
    const high = generatePropagandaReport(s);
    expect(high!.body).toContain("Counter-propaganda is holding");

    s.combat = { ...(s.combat ?? ({} as any)), warMorale: 20 } as any;
    const low = generatePropagandaReport(s);
    expect(low!.body).toContain("losing the narrative");
  });
});

describe("wartime — siege breach alert", () => {
  it("returns null when not under siege", () => {
    const s = makeWarState(); // at war but not under siege
    expect(generateSiegeBreachAlert(s)).toBeNull();
  });

  it("emits a critical alert when under siege", () => {
    const s = makeWarState({ underSiege: true });
    const msg = generateSiegeBreachAlert(s);
    expect(msg).not.toBeNull();
    expect(msg!.priority).toBe("critical");
    expect(msg!.category).toBe("alert");
    expect(msg!.title).toContain("BREACH");
  });
});

describe("wartime — periodic dispatch routes new event types", () => {
  it("returns null in peacetime regardless of slot", () => {
    const s = makePeacetimeState({ year: 2200, month: 4, day: 4, hour: 12 });
    expect(generateWartimePeriodicMessage(s)).toBeNull();
  });

  it("routes hour 12 day%4==2 to aerial engagement", () => {
    const s = makeWarState();
    s.gameDate = { year: 2200, month: 4, day: 6, hour: 12 }; // day%4==2
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("aerial-engage");
  });

  it("routes hour 18 day%4==1 to cyber warfare", () => {
    const s = makeWarState();
    s.gameDate = { year: 2200, month: 4, day: 5, hour: 18 }; // day%4==1
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("cyber-war");
  });

  it("routes hour 18 day%4==3 to propaganda", () => {
    const s = makeWarState();
    s.gameDate = { year: 2200, month: 4, day: 7, hour: 18 }; // day%4==3
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("propaganda");
  });

  it("routes hour 12 day%4==0 to sortie report when siege precondition met", () => {
    const s = makeWarState({ underSiege: true });
    s.gameDate = { year: 2200, month: 4, day: 4, hour: 12 }; // day%4==0
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("sortie-report");
  });

  it("falls through cleanly when sortie precondition is not met", () => {
    const s = makeWarState(); // at war but no siege/raids
    s.gameDate = { year: 2200, month: 4, day: 4, hour: 12 }; // day%4==0
    // sortie returns null → dispatcher falls through to other slots; the
    // remaining hour-12 slot at d%4==0 should still resolve to null cleanly.
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).toBeNull();
  });

  it("routes hour 0 day%5==0 to siege breach alert when under siege", () => {
    const s = makeWarState({ underSiege: true });
    s.gameDate = { year: 2200, month: 4, day: 5, hour: 0 }; // day%5==0
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("siege-breach");
  });

  it("isAtWar agrees with the war-state fixture", () => {
    expect(isAtWar(makeWarState())).toBe(true);
    expect(getWarContext(makeWarState({ underSiege: true })).underSiege).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Regression tests for the previously-orphaned wartime generators that were
// scheduled on hours {9, 11, 15, 17, 19, 21} — hours the engine clock never
// produces (advanceHour() increments by 6, so hour ∈ {0, 6, 12, 18}).
// These tests lock the revived dispatch paths.
// ────────────────────────────────────────────────────────────────────────────

describe("wartime — periodic dispatch routes revived legacy generators", () => {
  it("routes hour 12 day%4==1 to siege report (revived)", () => {
    const s = makeWarState({ underSiege: true, blockaded: true });
    s.gameDate = { year: 2200, month: 4, day: 5, hour: 12 }; // day%4==1
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("siege-report");
  });

  it("routes hour 12 day%4==3 to war casualties (revived)", () => {
    const s = makeWarState({ underSiege: true, blockaded: true });
    s.gameDate = { year: 2200, month: 4, day: 7, hour: 12 }; // day%4==3
    // Casualties report requires battles to have actually been fought.
    if (s.combat) s.combat.totalBattlesFought = 1;
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("war-casualties");
  });

  it("routes hour 18 day%4==0 to blockade report (revived)", () => {
    const s = makeWarState({ underSiege: true, blockaded: true });
    s.gameDate = { year: 2200, month: 4, day: 4, hour: 18 }; // day%4==0
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("blockade-report");
  });

  it("routes hour 18 day%4==2 to home front report (revived)", () => {
    const s = makeWarState({ underSiege: true, blockaded: true });
    s.gameDate = { year: 2200, month: 4, day: 6, hour: 18 }; // day%4==2
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("home-front");
  });

  it("routes hour 0 day%5==1 to war diplomacy update (revived)", () => {
    const s = makeWarState({ underSiege: true, blockaded: true });
    s.gameDate = { year: 2200, month: 4, day: 6, hour: 0 }; // day%5==1
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("war-diplomacy");
  });

  it("routes hour 0 day%5==2 to war dispatch (revived second slot)", () => {
    const s = makeWarState({ underSiege: true, blockaded: true });
    s.gameDate = { year: 2200, month: 4, day: 7, hour: 0 }; // day%5==2
    const msg = generateWartimePeriodicMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.id).toContain("war-dispatch");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Invariant: the dispatcher must only schedule on hours the engine clock
// actually produces. clock.ts:advanceHour increments by 6, so the only valid
// `hour ===` literals are {0, 6, 12, 18}. Any other literal is dead code
// (this is the regression that hid 6 wartime generators for many releases).
// ────────────────────────────────────────────────────────────────────────────

describe("wartime — dispatcher schedule invariant", () => {
  it("every `hour === N` literal in generateWartimePeriodicMessage is in {0,6,12,18}", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "..", "wartimeEvents.ts"), "utf8");

    const fnStart = src.indexOf("export function generateWartimePeriodicMessage");
    expect(fnStart, "dispatcher function not found").toBeGreaterThan(-1);

    const afterFn = src.indexOf("\nexport function", fnStart + 1);
    const body = afterFn > -1 ? src.slice(fnStart, afterFn) : src.slice(fnStart);

    const hourLiterals = [...body.matchAll(/hour\s*===\s*(\d+)/g)].map((m) =>
      Number(m[1]),
    );
    expect(hourLiterals.length, "no hour literals found in dispatcher").toBeGreaterThan(0);

    const valid = new Set([0, 6, 12, 18]);
    for (const h of hourLiterals) {
      expect(
        valid.has(h),
        `Dispatcher uses unreachable hour ${h}; engine ticks at 6h granularity, so hour ∈ {0,6,12,18} only.`,
      ).toBe(true);
    }
  });
});

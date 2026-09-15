// Refugee & migration systems: (1) wars spawn migrant waves at the gates,
// (2) long-term closed borders carry an escalating diplomatic/social cost,
// (3) accepting refugees grants population plus a visible temporary
// workforce production boost. These exercise the real engine paths
// (processDiplomacyTick / runTick), not the builders in isolation.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getDefaultAdvancedState,
  maybeSpawnWarRefugeeWave,
  processDiplomacyTick,
  resolveIncident,
  startWar,
} from "@/engine/diplomacyAdvanced";
import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import { sanitizeState } from "@/engine/sanitizer";
import type { GameState, TickEntry } from "@/engine/types";

afterEach(() => {
  vi.restoreAllMocks();
});

function stateAtWar(mutate: (war: ReturnType<typeof startWar>) => void): {
  s: GameState;
  warId: string;
} {
  const s = createInitialState();
  s.totalTicks = 50;
  const war = startWar(s, "ferrograd", "Ferrograd");
  mutate(war);
  s.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [war] };
  return { s, warId: war.id };
}

describe("war-driven migrant waves", () => {
  it("a war escalating to total war spawns a refugee incident, ticker headline, and tick entry", () => {
    const { s, warId } = stateAtWar((w) => {
      w.stage = "open_war";
      w.intensity = 95;
    });
    // Suppress the random incident/negotiation generators so the only
    // refugee incident can be the war wave.
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const entries: TickEntry[] = [];

    processDiplomacyTick(s, entries);

    const adv = s.diplomacyAdvanced!;
    expect(adv.wars[0].stage).toBe("total_war");
    const refugeeIncidents = adv.incidents.filter((i) => i.category === "refugee");
    expect(refugeeIncidents).toHaveLength(1);
    const inc = refugeeIncidents[0];
    expect(inc.id.startsWith(`inc-warref-${warId}`)).toBe(true);
    expect(inc.severity).toBe("crisis");
    expect(inc.instigatorId).not.toBe("player");
    // The accept option must carry the visible workforce payoff.
    const accept = inc.responses.find((r) => r.id === "refugee-accept");
    expect(accept?.effects.populationGain).toBeGreaterThan(0);
    expect(accept?.effects.refugeeBoostTicks).toBeGreaterThan(0);
    expect((s.newsFeed ?? []).some((n) => n.id.startsWith(`news-refugee-wave-${warId}`))).toBe(true);
    expect(entries.some((e) => e.label === "MIGRANT WAVE")).toBe(true);
  });

  it("does not stack a second wave while a refugee incident is still unresolved", () => {
    const { s } = stateAtWar((w) => {
      w.stage = "open_war";
      w.intensity = 95;
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const entries: TickEntry[] = [];
    processDiplomacyTick(s, entries);
    expect(s.diplomacyAdvanced!.incidents.filter((i) => i.category === "refugee")).toHaveLength(1);

    // Re-arm the trigger as if another escalation happened this tick.
    s.diplomacyAdvanced!.wars[0].lastEscalationTick = s.totalTicks;
    maybeSpawnWarRefugeeWave(s, entries);

    expect(s.diplomacyAdvanced!.incidents.filter((i) => i.category === "refugee")).toHaveLength(1);
  });

  it("stays silent during the calm-start window", () => {
    const { s } = stateAtWar((w) => {
      w.stage = "open_war";
      w.lastEscalationTick = 0;
    });
    s.totalTicks = 0;
    const entries: TickEntry[] = [];

    maybeSpawnWarRefugeeWave(s, entries);

    expect(s.diplomacyAdvanced!.incidents.filter((i) => i.category === "refugee")).toHaveLength(0);
  });
});

describe("refugee intake payoff (resolveIncident + runTick)", () => {
  function stateWithRefugeeIncident(): GameState {
    const { s, warId } = stateAtWar((w) => {
      w.stage = "open_war";
      w.intensity = 95;
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    processDiplomacyTick(s, []);
    vi.restoreAllMocks();
    const inc = s.diplomacyAdvanced!.incidents.find((i) => i.id.startsWith(`inc-warref-${warId}`));
    expect(inc).toBeDefined();
    return s;
  }

  it("accepting refugees adds population, tracks the lifetime count, and arms the workforce boost", () => {
    const s = stateWithRefugeeIncident();
    const inc = s.diplomacyAdvanced!.incidents.find((i) => i.category === "refugee")!;
    const popBefore = s.cityStats.population;

    const patch = resolveIncident(s, inc.id, "refugee-accept");

    expect(patch.cityStats!.population).toBeGreaterThan(popBefore);
    expect(patch.integratedRefugees).toBe(patch.cityStats!.population - popBefore);
    expect(patch.refugeeBoostTicksRemaining).toBeGreaterThan(0);
    expect(patch.refugeeBoostMagnitude).toBeGreaterThan(0);
  });

  it("intake scales with city size so it stays meaningful for a metropolis", () => {
    const s = stateWithRefugeeIncident();
    const inc = s.diplomacyAdvanced!.incidents.find((i) => i.category === "refugee")!;
    const base = inc.responses.find((r) => r.id === "refugee-accept")!.effects.populationGain!;
    s.cityStats.population = 40_000_000; // rival-megacity scale

    const patch = resolveIncident(s, inc.id, "refugee-accept");

    const gain = patch.cityStats!.population - 40_000_000;
    expect(gain).toBe(Math.round(base * (40_000_000 / 2_000_000))); // 20x
    expect(patch.integratedRefugees).toBe(gain);
  });

  it("an armed boost produces a Refugee Workforce entry in runTick and counts down to zero", () => {
    const s = createInitialState();
    s.totalTicks = 50;
    // Enough industry that the fractional boost floors to a nonzero bonus.
    s.buildings.megaManufacturingPlants = 10;
    s.buildings.metalFoundryComplexes = 5;
    s.refugeeBoostTicksRemaining = 2;
    s.refugeeBoostMagnitude = 0.1;

    const first = runTick(s);
    expect(first.entries.some((e) => e.label === "Refugee Workforce")).toBe(true);
    expect(first.newState.refugeeBoostTicksRemaining).toBe(1);

    const second = runTick(first.newState);
    expect(second.newState.refugeeBoostTicksRemaining).toBe(0);
    // Magnitude clears when the boost expires, and a third tick stays quiet.
    expect(second.newState.refugeeBoostMagnitude).toBe(0);
    const third = runTick(second.newState);
    expect(third.entries.some((e) => e.label === "Refugee Workforce")).toBe(false);
  });
});

describe("border closure pressure (runTick)", () => {
  it("counts closed ticks but stays cost-free inside the grace window", () => {
    const s = createInitialState();
    s.totalTicks = 50;
    s.immigrationBanned = true;
    s.borderClosureTicks = 10;

    const { newState, entries } = runTick(s);

    expect(newState.borderClosureTicks).toBe(11);
    expect(entries.some((e) => e.label === "Closed Borders" || e.label === "Isolation")).toBe(false);
  });

  it("past the grace window, an 8-tick pulse drains reputation and mood", () => {
    const s = createInitialState();
    s.totalTicks = 50;
    s.immigrationBanned = true;
    s.borderClosureTicks = 63; // becomes 64 this tick; 64 % 8 === 0
    s.diplomaticReputation = 50;

    const { newState, entries } = runTick(s);

    expect(newState.borderClosureTicks).toBe(64);
    expect(entries.some((e) => e.label === "Closed Borders")).toBe(true);
    expect(newState.diplomaticReputation).toBeLessThan(50);
  });

  it("a 40-tick pulse drains faction and partner-city loyalty", () => {
    // Other tick systems also drift faction loyalty (e.g. law factions gain
    // +1 while lawOrder > 50), so compare against a control run that is
    // identical except for the closure counter. Randomness pinned so both
    // runs take the same event path.
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const make = (closureTicks: number) => {
      const s = createInitialState();
      s.totalTicks = 50;
      s.immigrationBanned = true;
      s.borderClosureTicks = closureTicks;
      return s;
    };
    const activeFaction = make(0).factions.find((f) => f.isActive);
    expect(activeFaction).toBeDefined();

    const control = runTick(make(10)); // inside grace, no pulse
    const pulsed = runTick(make(79)); // becomes 80; 80 % 40 === 0

    expect(pulsed.entries.some((e) => e.label === "Isolation")).toBe(true);
    const controlLoyalty = control.newState.factions.find((f) => f.id === activeFaction!.id)!.loyalty;
    const pulsedLoyalty = pulsed.newState.factions.find((f) => f.id === activeFaction!.id)!.loyalty;
    expect(pulsedLoyalty).toBe(controlLoyalty - 1);
  });

  it("hitting the 100-tick milestone files a one-time advisory in the inbox", () => {
    const s = createInitialState();
    s.totalTicks = 50;
    s.immigrationBanned = true;
    s.borderClosureTicks = 99; // becomes 100 this tick

    const { newState } = runTick(s);

    expect((newState.messages ?? []).some((m) => m.id.startsWith("border-closure-100"))).toBe(true);
  });

  it("reopening the borders resets the counter", () => {
    const s = createInitialState();
    s.totalTicks = 50;
    s.immigrationBanned = false;
    s.bordersClosed = false;
    s.borderClosureTicks = 120;

    const { newState } = runTick(s);

    expect(newState.borderClosureTicks).toBe(0);
  });
});

describe("sanitizer backfill for refugee fields", () => {
  it("backfills missing fields to 0 and clamps the boost fields", () => {
    const s = createInitialState();
    delete (s as Partial<GameState>).borderClosureTicks;
    delete (s as Partial<GameState>).refugeeBoostTicksRemaining;
    delete (s as Partial<GameState>).refugeeBoostMagnitude;
    delete (s as Partial<GameState>).integratedRefugees;

    const clean = sanitizeState(s);
    expect(clean.borderClosureTicks).toBe(0);
    expect(clean.refugeeBoostTicksRemaining).toBe(0);
    expect(clean.refugeeBoostMagnitude).toBe(0);
    expect(clean.integratedRefugees).toBe(0);

    s.refugeeBoostTicksRemaining = 9999;
    s.refugeeBoostMagnitude = 7;
    s.integratedRefugees = -5;
    const clamped = sanitizeState(s);
    expect(clamped.refugeeBoostTicksRemaining).toBe(200);
    expect(clamped.refugeeBoostMagnitude).toBe(0.5);
    expect(clamped.integratedRefugees).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import { runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import { emitPowerBrownoutWarning } from "@/engine/tickProcessors";
import {
  POWER_BROWNOUT_WARN_TICKS,
  POWER_GEN_WEIGHTS,
  POWER_DRAIN_WEIGHTS,
  POWER_DRAIN_UNIT_WEIGHTS,
} from "@/engine/powerBreakdown";
import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #430: the moment the power grid's ETA drops into the imminent-brownout
// window, a player who is NOT looking at the overview power card should still get
// ONE on-screen advisory. It must fire once per low-power episode (never spam
// every tick), re-fire after the grid recovers, cover both the brownout (about to
// hit 0) and blackout (heading for the -1000 floor) cases, and carry copy with
// no emojis or exclamation marks (user Lauren). The advisory's timing reuses the
// same computePowerBreakdown / computePowerEta the on-screen card uses so the two
// can never disagree.
// ─────────────────────────────────────────────────────────────────────────────

const WARN_TITLES: Record<string, boolean> = {
  "POWER GRID BROWNOUT IMMINENT": true,
  "POWER GRID GOING DARK": true,
};

function warnMessages(s: GameState) {
  return (s.messages ?? []).filter((m) => WARN_TITLES[m.title]);
}

// Task #436: the all-clear the grid fires once it recovers from a warned-about
// episode.
function recoveryMessages(s: GameState) {
  return (s.messages ?? []).filter((m) => m.title === "POWER GRID STABILIZED");
}

// Neutralize whatever power plants / consumers createInitialState seeds so each
// scenario's supply and demand are exactly what the test sets. Zeroing only the
// keys computePowerBreakdown actually sums keeps the fixture honest against the
// real math. Spring (mult 1.0) + Overcast (no weather delta) keeps drain flat.
function zeroGrid(s: GameState): void {
  const b = s.buildings as Record<string, number>;
  const u = (s.units ?? {}) as Record<string, number>;
  for (const k of Object.keys(POWER_GEN_WEIGHTS)) b[k] = 0;
  for (const k of Object.keys(POWER_DRAIN_WEIGHTS)) b[k] = 0;
  for (const k of Object.keys(POWER_DRAIN_UNIT_WEIGHTS)) u[k] = 0;
  s.units = u;
  s.megaProjects = [];
  s.season = "spring";
  s.weather = "Overcast";
}

// A grid running a fixed deficit: habBlockMegaTowers drain 12 MW each, no
// generation. `towers` sets the deficit size; `power` sets the current reserve.
function deficitState(towers: number, power: number): GameState {
  const s = createInitialState();
  zeroGrid(s);
  (s.buildings as Record<string, number>).habBlockMegaTowers = towers;
  s.resources.power = power;
  s.messages = [];
  s.powerBrownoutWarned = undefined;
  return s;
}

describe("power brownout warning advisory", () => {
  it("does not fire while the grid is holding or in surplus, and re-arms", () => {
    const s = createInitialState();
    zeroGrid(s);
    (s.buildings as Record<string, number>).fusionReactors = 1; // +500 MW, no drain
    s.resources.power = 500;
    s.messages = [];
    s.powerBrownoutWarned = true; // pretend a prior episode warned

    emitPowerBrownoutWarning(s);

    expect(warnMessages(s).length).toBe(0);
    // A surplus is the recovery signal, so the flag re-arms for next time.
    expect(s.powerBrownoutWarned).toBe(false);
  });

  it("fires one all-clear when the grid recovers from a warned-about episode", () => {
    const s = createInitialState();
    zeroGrid(s);
    (s.buildings as Record<string, number>).fusionReactors = 1; // +500 MW, no drain
    s.resources.power = 500;
    s.messages = [];
    s.totalTicks = 30;
    s.powerBrownoutWarned = true; // a prior episode DID warn the player

    emitPowerBrownoutWarning(s);

    const recovery = recoveryMessages(s);
    expect(recovery.length).toBe(1);
    expect(recovery[0].title).toBe("POWER GRID STABILIZED");
    expect(recovery[0].id.startsWith("power-brownout-recovery-")).toBe(true);
    expect(recovery[0].category).toBe("update");
    expect(recovery[0].priority).toBe("normal");
    // The all-clear closes the episode and re-arms for next time.
    expect(s.powerBrownoutWarned).toBe(false);
  });

  it("does not congratulate a grid that was never in trouble", () => {
    const s = createInitialState();
    zeroGrid(s);
    (s.buildings as Record<string, number>).fusionReactors = 1; // surplus
    s.resources.power = 500;
    s.messages = [];
    s.powerBrownoutWarned = undefined; // no warning ever fired

    emitPowerBrownoutWarning(s);

    expect(recoveryMessages(s).length).toBe(0);
    expect(s.powerBrownoutWarned).toBe(false);
  });

  it("emits the all-clear once, then stays quiet while the grid holds", () => {
    const s = createInitialState();
    zeroGrid(s);
    (s.buildings as Record<string, number>).fusionReactors = 1; // surplus
    s.resources.power = 500;
    s.messages = [];
    s.powerBrownoutWarned = true;

    emitPowerBrownoutWarning(s);
    expect(recoveryMessages(s).length).toBe(1);

    // A healthy grid across several more ticks must not keep re-announcing.
    for (let i = 0; i < 5; i++) emitPowerBrownoutWarning(s);
    expect(recoveryMessages(s).length).toBe(1);
  });

  it("all-clear copy carries no emojis or exclamation marks", () => {
    const s = createInitialState();
    zeroGrid(s);
    (s.buildings as Record<string, number>).fusionReactors = 1;
    s.resources.power = 500;
    s.messages = [];
    s.powerBrownoutWarned = true;

    emitPowerBrownoutWarning(s);
    const recovery = recoveryMessages(s);
    expect(recovery.length).toBe(1);
    for (const m of recovery) {
      expect(m.title).not.toMatch(/!/);
      expect(m.body).not.toMatch(/!/);
      expect(m.title).toMatch(/^[\x00-\x7F]*$/);
      expect(m.body).toMatch(/^[\x00-\x7F]*$/);
    }
  });

  it("does not fire when a deficit is still further out than the warn window", () => {
    // drain 12/tick, reserve 1000 -> ~84 ticks out, well past the warn window.
    const s = deficitState(1, 1000);
    expect(Math.ceil(1000 / 12)).toBeGreaterThan(POWER_BROWNOUT_WARN_TICKS);

    emitPowerBrownoutWarning(s);

    expect(warnMessages(s).length).toBe(0);
    expect(s.powerBrownoutWarned).toBeFalsy();
  });

  it("fires one brownout advisory when the reserve is about to hit zero", () => {
    // drain 120/tick, reserve 500 -> ~5 ticks to brownout, inside the window.
    const s = deficitState(10, 500);

    emitPowerBrownoutWarning(s);

    const warns = warnMessages(s);
    expect(warns.length).toBe(1);
    expect(warns[0].title).toBe("POWER GRID BROWNOUT IMMINENT");
    expect(warns[0].id.startsWith("power-brownout-warning-")).toBe(true);
    expect(warns[0].category).toBe("alert");
    expect(warns[0].priority).toBe("high");
    expect(s.powerBrownoutWarned).toBe(true);
  });

  it("fires a going-dark advisory once the reserve is already in the red", () => {
    // drain 120/tick, reserve -50 -> heading for the -1000 floor, inside window.
    const s = deficitState(10, -50);

    emitPowerBrownoutWarning(s);

    const warns = warnMessages(s);
    expect(warns.length).toBe(1);
    expect(warns[0].title).toBe("POWER GRID GOING DARK");
    expect(s.powerBrownoutWarned).toBe(true);
  });

  it("does not repeat the advisory on later ticks in the same episode", () => {
    const s = deficitState(10, 500);

    emitPowerBrownoutWarning(s);
    expect(warnMessages(s).length).toBe(1);

    // Keep the grid inside the warn window across several more calls.
    for (let i = 0; i < 5; i++) emitPowerBrownoutWarning(s);
    expect(warnMessages(s).length).toBe(1);
  });

  it("re-fires after the grid recovers and then relapses", () => {
    const s = deficitState(10, 500);
    s.totalTicks = 10;

    emitPowerBrownoutWarning(s);
    expect(warnMessages(s).length).toBe(1);

    // Recover: add generation so the grid runs a surplus. This clears the flag.
    (s.buildings as Record<string, number>).fusionReactors = 1; // +500 vs 120 drain
    emitPowerBrownoutWarning(s);
    expect(s.powerBrownoutWarned).toBe(false);
    expect(warnMessages(s).length).toBe(1); // recovery adds no new message

    // Relapse: drop the generation and advance the clock. A fresh advisory fires.
    (s.buildings as Record<string, number>).fusionReactors = 0;
    s.totalTicks = 40;
    emitPowerBrownoutWarning(s);

    const warns = warnMessages(s);
    expect(warns.length).toBe(2);
    // Distinct stable ids (tick-suffixed) so the ticker can scroll each once.
    expect(new Set(warns.map((m) => m.id)).size).toBe(2);
  });

  it("advisory copy carries no emojis or exclamation marks", () => {
    for (const power of [500, -50]) {
      const s = deficitState(10, power);
      emitPowerBrownoutWarning(s);
      const warns = warnMessages(s);
      expect(warns.length).toBe(1);
      for (const m of warns) {
        expect(m.title).not.toMatch(/!/);
        expect(m.body).not.toMatch(/!/);
        expect(m.title).toMatch(/^[\x00-\x7F]*$/);
        expect(m.body).toMatch(/^[\x00-\x7F]*$/);
      }
    }
  });

  it("is wired into runTick: a full tick on a deficit grid emits the advisory", () => {
    const s = deficitState(10, 500);

    const { newState } = runTick(s);

    const warns = warnMessages(newState);
    expect(warns.length).toBe(1);
    expect(warns[0].id.startsWith("power-brownout-warning-")).toBe(true);
    expect(newState.powerBrownoutWarned).toBe(true);
  });
});

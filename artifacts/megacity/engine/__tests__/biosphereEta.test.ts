import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  computeBiosphereBreakdown,
  computeBiosphereEta,
  HEALTHY_BIOSPHERE_THRESHOLD,
  NATURAL_BIOSPHERE_FLOOR,
} from "@/engine/biosphereBreakdown";
import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #417 — turn the truthful net-per-tick direction into a legible ETA:
// "healthy in ~N ticks" when recovering, "hits the floor in ~N ticks" when
// degrading. The projection must never promise a climb the sim would not
// actually deliver (rewilding stops at the floor; the recovery rate is capped),
// and it must hide gracefully when there is nothing honest to show.
// ─────────────────────────────────────────────────────────────────────────────

function setup(over: {
  biosphere: number;
  buildings?: Record<string, number>;
  units?: Record<string, number>;
  activePolicies?: string[];
  activeEvents?: { id: string }[];
}): GameState {
  const s = createInitialState();
  s.cityStats.biosphere = over.biosphere;
  if (over.buildings) s.buildings = { ...s.buildings, ...over.buildings } as GameState["buildings"];
  if (over.units) s.units = { ...s.units, ...over.units } as GameState["units"];
  if (over.activePolicies) s.activePolicies = over.activePolicies;
  if (over.activeEvents) s.activeEvents = over.activeEvents as GameState["activeEvents"];
  return s;
}

const etaOf = (s: GameState) => computeBiosphereEta(computeBiosphereBreakdown(s));

describe("computeBiosphereEta — recovering toward healthy", () => {
  it("projects ticks-to-healthy from a real sustained recovery", () => {
    // bioBonus 45 -> infraRate capped at +3/tick, biosphere well below healthy.
    const s = setup({ biosphere: 20, buildings: { decontaminationForests: 9 } });
    const b = computeBiosphereBreakdown(s);
    expect(b.netPerTick).toBeGreaterThan(0);
    const eta = computeBiosphereEta(b);
    expect(eta).not.toBeNull();
    expect(eta!.direction).toBe("recovering");
    expect(eta!.target).toBe(HEALTHY_BIOSPHERE_THRESHOLD);
    // The capped +3 green recovery is reduced by the city's small, continuous
    // density/pollution load, and the ETA must use that honest net rate.
    expect(b.negatives.some((n) => n.label === "City density and pollution")).toBe(true);
    expect(eta!.ticks).toBe(
      Math.ceil((HEALTHY_BIOSPHERE_THRESHOLD - 20) / b.recoveryRate),
    );
  });

  it("hides when the biosphere is already at/above the healthy threshold", () => {
    const s = setup({ biosphere: 55, buildings: { decontaminationForests: 9 } });
    expect(etaOf(s)).toBeNull();
  });

  it("does NOT promise a climb driven only by natural rewilding (impossible above the floor)", () => {
    // Below the floor with no green investment: net reads slightly positive from
    // rewilding, but rewilding stops at the floor and can never reach healthy.
    const s = setup({ biosphere: 8 });
    const b = computeBiosphereBreakdown(s);
    expect(b.netPerTick).toBeGreaterThan(0);
    expect(b.rewildingRate).toBeGreaterThan(0);
    expect(computeBiosphereEta(b)).toBeNull();
  });

  it("respects the +3/tick cap: a huge investment cannot promise a faster climb", () => {
    const capped = setup({ biosphere: 20, buildings: { decontaminationForests: 9 } });
    const massive = setup({ biosphere: 20, buildings: { decontaminationForests: 200 } });
    const cappedEta = etaOf(capped);
    const massiveEta = etaOf(massive);
    expect(cappedEta).not.toBeNull();
    expect(massiveEta).not.toBeNull();
    // Both cap the infra rate at +3, so a massive investment cannot shorten the
    // ETA past the cap — the two projections are identical.
    expect(massiveEta!.ticks).toBe(cappedEta!.ticks);
  });

  it("does NOT promise healthy recovery when a below-floor net is positive but the true above-floor rate is negative", () => {
    // Regression: below the floor the sim absorbs the neglect drain and adds
    // rewilding, so netPerTick reads positive (RECOVERING) even though there is
    // no green infrastructure. With only stewardship (+0.5) and a -1 neglect
    // drain, the biosphere can climb to the floor but degrades again above it —
    // an oscillation, not a climb to healthy. The ETA must not promise recovery.
    const s = setup({ biosphere: 10, buildings: { wildlandsBioreserves: 1 } });
    const b = computeBiosphereBreakdown(s);
    expect(b.bioBonus).toBe(0); // no green infrastructure
    expect(b.netPerTick).toBeGreaterThan(0.05); // reads RECOVERING right now...
    // ...but the sustained above-floor rate is negative, so no healthy climb.
    expect(b.recoveryRate + b.stewardRate + b.outbreakRate).toBeLessThanOrEqual(0.05);
    expect(computeBiosphereEta(b)).toBeNull();
  });
});

describe("computeBiosphereEta — degrading toward the floor", () => {
  it("projects ticks-to-floor from a real drain", () => {
    // No green infrastructure at all -> neglect drain of -1/tick from above floor.
    const s = setup({ biosphere: 40 });
    const b = computeBiosphereBreakdown(s);
    expect(b.netPerTick).toBeLessThan(0);
    const eta = computeBiosphereEta(b);
    expect(eta).not.toBeNull();
    expect(eta!.direction).toBe("degrading");
    expect(eta!.target).toBe(NATURAL_BIOSPHERE_FLOOR);
    // (40 - 15) / 1 = 25 ticks.
    expect(eta!.ticks).toBe(25);
  });

  it("hides when the biosphere is already at/below the floor", () => {
    const s = setup({ biosphere: NATURAL_BIOSPHERE_FLOOR });
    expect(etaOf(s)).toBeNull();
  });
});

describe("computeBiosphereEta — holding", () => {
  it("hides when the net per tick is ~0", () => {
    // At the floor with pure neglect: the drain is absorbed, no rewilding -> flat.
    const s = setup({ biosphere: NATURAL_BIOSPHERE_FLOOR });
    const b = computeBiosphereBreakdown(s);
    expect(Math.abs(b.netPerTick)).toBeLessThanOrEqual(0.05);
    expect(computeBiosphereEta(b)).toBeNull();
  });
});

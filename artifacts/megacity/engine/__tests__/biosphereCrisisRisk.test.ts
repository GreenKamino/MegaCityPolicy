import { describe, expect, it } from "vitest";

import {
  getBiosphereCrisisChance,
  getBiosphereCrisisRisk,
  BIOSPHERE_CRISIS_FLOOR,
  CRISIS_EASE_SPAN,
  MIN_CRISIS_CHANCE,
} from "@/engine/wildlandsEcology";

// ─────────────────────────────────────────────────────────────────────────────
// The Wildlands "nature crisis risk" card reads getBiosphereCrisisRisk, and the
// simulation's negative-crisis spawner reads getBiosphereCrisisChance. They MUST
// be the same ramp so the player-facing odds never drift from the odds actually
// rolled. These tests pin the shape of that shared ramp: full odds at the floor,
// a monotonic ease, roughly halved by biosphere 100, and honest tier labels.
// If the constants change, the copy on the card ("full at biosphere 15, roughly
// halved at 100") must be revisited — these assertions fail loudly to force it.
// ─────────────────────────────────────────────────────────────────────────────

describe("getBiosphereCrisisChance ramp", () => {
  it("is full (1.0) at and below the natural-recovery floor", () => {
    expect(getBiosphereCrisisChance(BIOSPHERE_CRISIS_FLOOR)).toBeCloseTo(1, 5);
    expect(getBiosphereCrisisChance(0)).toBeCloseTo(1, 5);
    expect(getBiosphereCrisisChance(-20)).toBeCloseTo(1, 5);
  });

  it("is roughly halved at a thriving biosphere (100)", () => {
    expect(getBiosphereCrisisChance(100)).toBeCloseTo(0.5, 5);
  });

  it("matches the documented mid-band easing points", () => {
    // biosphere 50 -> 1 - 35/170 ≈ 0.794 (recovering, still short of healthy)
    expect(getBiosphereCrisisChance(50)).toBeCloseTo(1 - 35 / CRISIS_EASE_SPAN, 5);
    // biosphere 45 -> 1 - 30/170 ≈ 0.824
    expect(getBiosphereCrisisChance(45)).toBeCloseTo(1 - 30 / CRISIS_EASE_SPAN, 5);
  });

  it("decreases monotonically as biosphere climbs", () => {
    let prev = Infinity;
    for (let bio = 0; bio <= 100; bio += 5) {
      const c = getBiosphereCrisisChance(bio);
      expect(c).toBeLessThanOrEqual(prev + 1e-9);
      prev = c;
    }
  });

  it("never falls below the hard floor", () => {
    expect(getBiosphereCrisisChance(1000)).toBeCloseTo(MIN_CRISIS_CHANCE, 5);
    expect(getBiosphereCrisisChance(100)).toBeGreaterThanOrEqual(MIN_CRISIS_CHANCE);
  });
});

describe("getBiosphereCrisisRisk tiers and reduction", () => {
  it("reports HIGH near the floor with no reduction", () => {
    const r = getBiosphereCrisisRisk(BIOSPHERE_CRISIS_FLOOR);
    expect(r.tier).toBe("high");
    expect(r.reductionPct).toBe(0);
  });

  it("reports EASING for a partially recovered city", () => {
    const r = getBiosphereCrisisRisk(50);
    expect(r.tier).toBe("easing");
    expect(r.reductionPct).toBeGreaterThan(0);
    expect(r.reductionPct).toBeLessThan(50);
  });

  it("reports LOW and ~50% fewer crises at a thriving biosphere", () => {
    const r = getBiosphereCrisisRisk(100);
    expect(r.tier).toBe("low");
    expect(r.reductionPct).toBe(50);
  });

  it("reduction rises as biosphere climbs", () => {
    expect(getBiosphereCrisisRisk(20).reductionPct)
      .toBeLessThan(getBiosphereCrisisRisk(60).reductionPct);
    expect(getBiosphereCrisisRisk(60).reductionPct)
      .toBeLessThan(getBiosphereCrisisRisk(100).reductionPct);
  });
});

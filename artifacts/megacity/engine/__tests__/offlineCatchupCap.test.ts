import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_OFFLINE_MISSED_TICKS, calculateMissedTicks } from "@/engine/formulas";

// Regression coverage for the launch-blocker fix that raised the offline
// catch-up cap from 24 ticks (6h @ 15min) to 30 days. If anyone re-introduces
// the old `Math.min(..., 24)` cap or accidentally returns a negative value
// for clock-skewed devices, these tests fail.

describe("calculateMissedTicks", () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when elapsed is exactly zero", () => {
    expect(calculateMissedTicks(NOW, 15)).toBe(0);
  });

  it("returns 0 for non-positive elapsed (clock skew / future lastTickTime)", () => {
    expect(calculateMissedTicks(NOW + 60_000, 15)).toBe(0);
    expect(calculateMissedTicks(NOW + 24 * 60 * 60 * 1000, 15)).toBe(0);
  });

  it("returns >24 ticks when the resume is longer than 6h (no more 24-tick cap)", () => {
    // 12 hours at the default 15-minute tick interval = 48 ticks.
    const sixHoursAgo = NOW - 12 * 60 * 60 * 1000;
    const ticks = calculateMissedTicks(sixHoursAgo, 15);
    expect(ticks).toBe(48);
    expect(ticks).toBeGreaterThan(24);
  });

  it("returns >24 ticks for a 1-day resume at 15-minute interval", () => {
    const oneDayAgo = NOW - 24 * 60 * 60 * 1000;
    expect(calculateMissedTicks(oneDayAgo, 15)).toBe(96);
  });

  it("caps at MAX_OFFLINE_MISSED_TICKS (30 days = 2880) for very old saves", () => {
    expect(MAX_OFFLINE_MISSED_TICKS).toBe(2880);
    // 90 days ago — well past the cap.
    const ninetyDaysAgo = NOW - 90 * 24 * 60 * 60 * 1000;
    expect(calculateMissedTicks(ninetyDaysAgo, 15)).toBe(MAX_OFFLINE_MISSED_TICKS);
    // A year ago — still capped.
    const yearAgo = NOW - 365 * 24 * 60 * 60 * 1000;
    expect(calculateMissedTicks(yearAgo, 15)).toBe(MAX_OFFLINE_MISSED_TICKS);
  });

  it("respects custom tick intervals when computing the cap", () => {
    // At a 60-minute tick interval, 30 days = 720 ticks, well under the cap.
    const thirtyDaysAgo = NOW - 30 * 24 * 60 * 60 * 1000;
    expect(calculateMissedTicks(thirtyDaysAgo, 60)).toBe(720);
    // But at 1-minute interval the same elapsed would explode to 43200,
    // so the cap must clamp it back to 2880.
    expect(calculateMissedTicks(thirtyDaysAgo, 1)).toBe(MAX_OFFLINE_MISSED_TICKS);
  });
});

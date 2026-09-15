import { describe, expect, it, beforeEach } from "vitest";
import {
  recordTickDuration,
  getAverageTickMs,
  getEstimatedMsPerTick,
  getSampleCount,
  subscribeTickPerf,
  FALLBACK_MS_PER_TICK,
  _resetTickPerfForTests,
} from "../tickPerf";

describe("tickPerf", () => {
  beforeEach(() => {
    _resetTickPerfForTests();
  });

  it("returns the fallback before any samples are recorded", () => {
    expect(getAverageTickMs()).toBeNull();
    expect(getEstimatedMsPerTick()).toBe(FALLBACK_MS_PER_TICK);
  });

  it("averages recorded samples", () => {
    recordTickDuration(2);
    recordTickDuration(4);
    recordTickDuration(6);
    expect(getAverageTickMs()).toBeCloseTo(4, 5);
    expect(getEstimatedMsPerTick()).toBeCloseTo(4, 5);
    expect(getSampleCount()).toBe(3);
  });

  it("rejects bogus samples (negative, NaN, Infinity, absurd outliers)", () => {
    recordTickDuration(Number.NaN);
    recordTickDuration(Number.POSITIVE_INFINITY);
    recordTickDuration(-1);
    recordTickDuration(10_000);
    expect(getSampleCount()).toBe(0);
    expect(getEstimatedMsPerTick()).toBe(FALLBACK_MS_PER_TICK);
  });

  it("caps the rolling window so old samples decay out of the average", () => {
    for (let i = 0; i < 50; i++) recordTickDuration(100);
    expect(getSampleCount()).toBeLessThanOrEqual(32);
    for (let i = 0; i < 50; i++) recordTickDuration(10);
    expect(getAverageTickMs()).toBeCloseTo(10, 5);
  });

  it("notifies subscribers on each recorded sample", () => {
    let calls = 0;
    const unsub = subscribeTickPerf(() => { calls++; });
    recordTickDuration(2);
    recordTickDuration(3);
    expect(calls).toBe(2);
    unsub();
    recordTickDuration(4);
    expect(calls).toBe(2);
  });
});

import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  setTickProfilingEnabled,
  getProfilerSnapshot,
  _resetTickProfilerForTests,
} from "@/engine/tickProfiler";

// End-to-end check that runTick's safeSub instrumentation (and the explicit
// Sanitize bracket) actually feed the profiler — and, crucially, that they
// record NOTHING while the profiler is off (the zero-cost-when-disabled
// contract).
describe("tickProfiler ↔ runTick wiring", () => {
  beforeEach(() => {
    _resetTickProfilerForTests();
  });
  afterEach(() => {
    _resetTickProfilerForTests();
  });

  it("records no samples while profiling is disabled", () => {
    let state = createInitialState();
    for (let i = 0; i < 5; i++) state = runTick(state).newState;
    expect(getProfilerSnapshot().sections).toHaveLength(0);
  });

  it("captures per-section timings for known sections once enabled", () => {
    setTickProfilingEnabled(true);
    let state = createInitialState();
    for (let i = 0; i < 5; i++) state = runTick(state).newState;

    const snap = getProfilerSnapshot();
    const names = new Set(snap.sections.map((s) => s.name));

    // Sections called explicitly with these names from the task spec.
    for (const expected of ["Combat", "Contracts", "Banking", "Edicts", "Sanitize"]) {
      expect(names.has(expected)).toBe(true);
    }

    // Every recorded section should have a sane stat shape.
    for (const s of snap.sections) {
      expect(s.count).toBeGreaterThan(0);
      expect(s.avg).toBeGreaterThanOrEqual(0);
      expect(s.p95).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.avg)).toBe(true);
    }
    expect(snap.sumAvg).toBeGreaterThanOrEqual(0);

    setTickProfilingEnabled(false);
  });
});

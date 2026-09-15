import { describe, expect, it } from "vitest";

import { buildTickErrorReport } from "@/engine/tickErrorReport";

describe("buildTickErrorReport", () => {
  it("includes the save context header and every subsystem failure", () => {
    const report = buildTickErrorReport({
      tick: 42,
      errors: [
        { subsystem: "economy", error: "division by zero" },
        { subsystem: "diplomacy", error: "missing faction" },
      ],
      cityName: "NEW HAVEN",
      totalTicks: 1234,
      saveSlot: 2,
    });

    expect(report).toContain("MEGACITY TICK ERROR REPORT");
    expect(report).toContain("City: NEW HAVEN");
    expect(report).toContain("Total Ticks: 1234");
    expect(report).toContain("Save Slot: 2");
    expect(report).toContain("Failed Tick: 42");
    expect(report).toContain("Subsystem Failures: 2");
    expect(report).toContain("1. economy");
    expect(report).toContain("division by zero");
    expect(report).toContain("2. diplomacy");
    expect(report).toContain("missing faction");
  });

  it("falls back to safe defaults for missing fields", () => {
    const report = buildTickErrorReport({
      tick: 1,
      errors: [{ subsystem: "render", error: "" }],
      cityName: "",
      totalTicks: 0,
      saveSlot: 1,
    });

    expect(report).toContain("City: MEGACITY");
    expect(report).toContain("unknown error");
  });

  it("handles an empty error list gracefully", () => {
    const report = buildTickErrorReport({
      tick: 7,
      errors: [],
      cityName: "ZONE",
      totalTicks: 10,
      saveSlot: 3,
    });

    expect(report).toContain("Subsystem Failures: 0");
    expect(report).toContain("(no subsystem errors recorded)");
  });

  it("appends suppressed errors with a count and sample when the sample is partial", () => {
    const report = buildTickErrorReport({
      tick: 5,
      errors: [{ subsystem: "Contracts", error: "boom #1" }],
      cityName: "ZONE",
      totalTicks: 99,
      saveSlot: 1,
      suppressedErrors: [
        { subsystem: "Contracts", error: "boom #2" },
        { subsystem: "Contracts", error: "boom #3" },
      ],
      suppressedCount: 17,
    });

    // On-screen errors still serialize.
    expect(report).toContain("1. Contracts");
    expect(report).toContain("boom #1");
    // Suppressed appendix carries the FULL count plus the capped sample.
    expect(report).toContain("Suppressed Errors (not shown on screen): 17");
    expect(report).toContain("Sample of 2 suppressed:");
    expect(report).toContain("boom #2");
    expect(report).toContain("boom #3");
  });

  it("labels the suppressed list 'Suppressed:' when the sample is complete", () => {
    const report = buildTickErrorReport({
      tick: 5,
      errors: [{ subsystem: "Contracts", error: "boom" }],
      cityName: "ZONE",
      totalTicks: 99,
      saveSlot: 1,
      suppressedErrors: [{ subsystem: "Banking", error: "overflow" }],
      suppressedCount: 1,
    });

    expect(report).toContain("Suppressed Errors (not shown on screen): 1");
    expect(report).toContain("Suppressed:");
    expect(report).not.toContain("Sample of");
    expect(report).toContain("overflow");
  });

  it("omits the suppressed appendix entirely when nothing was suppressed", () => {
    const report = buildTickErrorReport({
      tick: 5,
      errors: [{ subsystem: "Contracts", error: "boom" }],
      cityName: "ZONE",
      totalTicks: 99,
      saveSlot: 1,
      suppressedErrors: [],
      suppressedCount: 0,
    });

    expect(report).not.toContain("Suppressed");
  });
});

import { describe, it, expect } from "vitest";
import {
  MINING_SITES,
  MINING_VEHICLES,
  MINING_JOBS,
  MINING_POLICIES,
  MINERAL_LABELS,
  MINERAL_COLORS,
} from "@/engine/miningData";

// Defensive coverage for static mining data tables. These tables are read
// directly by the mining UI; an id collision or a malformed row produces a
// silent UI bug that doesn't surface until a player reaches that screen.

describe("MINING_SITES", () => {
  it("has unique ids", () => {
    const ids = MINING_SITES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares only known mineral types per resourceType", () => {
    const valid = new Set(Object.keys(MINERAL_LABELS));
    for (const site of MINING_SITES) {
      expect(valid.has(site.resourceType)).toBe(true);
    }
  });

  it("has positive economic shape on every row", () => {
    for (const site of MINING_SITES) {
      expect(site.baseOutput).toBeGreaterThan(0);
      expect(site.setupCost).toBeGreaterThan(0);
      expect(site.workersNeeded).toBeGreaterThan(0);
      expect(site.depositSize).toBeGreaterThan(0);
      expect(site.name.length).toBeGreaterThan(0);
      expect(site.description.length).toBeGreaterThan(0);
    }
  });

  it("covers gas and oil with multiple options each (tier choices)", () => {
    const gas = MINING_SITES.filter((s) => s.resourceType === "gas");
    const oil = MINING_SITES.filter((s) => s.resourceType === "oil");
    expect(gas.length).toBeGreaterThanOrEqual(3);
    expect(oil.length).toBeGreaterThanOrEqual(3);
  });
});

describe("MINING_VEHICLES / JOBS / POLICIES", () => {
  it("vehicles have unique ids and positive cost/efficiency", () => {
    const ids = MINING_VEHICLES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of MINING_VEHICLES) {
      expect(v.cost).toBeGreaterThan(0);
      expect(v.efficiency).toBeGreaterThan(0);
    }
  });

  it("jobs have unique ids and positive wage", () => {
    const ids = MINING_JOBS.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const j of MINING_JOBS) {
      expect(j.wage).toBeGreaterThan(0);
    }
  });

  it("policies have unique ids", () => {
    const ids = MINING_POLICIES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("MINERAL_LABELS / MINERAL_COLORS", () => {
  it("labels and colors cover the same mineral keys", () => {
    expect(Object.keys(MINERAL_LABELS).sort()).toEqual(
      Object.keys(MINERAL_COLORS).sort(),
    );
  });

  it("colors are valid hex strings", () => {
    for (const c of Object.values(MINERAL_COLORS)) {
      expect(c).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });
});

import { describe, it, expect } from "vitest";
import { sanitizeWildlandsProject, sanitizeState } from "@/engine/sanitizer";
import { createInitialState } from "@/engine/initialState";

// Defensive coverage for malformed save payloads in wildlandsProjects[].
// Each case mirrors a failure mode a corrupted/old save could produce. The
// sanitizer must drop the entry (return null) or normalise it to a safe shape
// — never let a malformed entry reach a resolver.

describe("sanitizeWildlandsProject — malformed input", () => {
  it("returns null for null/undefined/non-object input", () => {
    expect(sanitizeWildlandsProject(null)).toBeNull();
    expect(sanitizeWildlandsProject(undefined)).toBeNull();
    expect(sanitizeWildlandsProject("beast_hunt")).toBeNull();
    expect(sanitizeWildlandsProject(42)).toBeNull();
    expect(sanitizeWildlandsProject([])).toBeNull();
  });

  it("returns null when id or kind are missing or wrong type", () => {
    expect(sanitizeWildlandsProject({ kind: "beast_hunt" })).toBeNull();
    expect(sanitizeWildlandsProject({ id: "x" })).toBeNull();
    expect(sanitizeWildlandsProject({ id: 1, kind: "beast_hunt" })).toBeNull();
    expect(sanitizeWildlandsProject({ id: "x", kind: 99 })).toBeNull();
  });

  it("returns null for unknown project kinds", () => {
    expect(sanitizeWildlandsProject({ id: "x", kind: "totally_made_up" })).toBeNull();
    expect(sanitizeWildlandsProject({ id: "x", kind: "" })).toBeNull();
  });

  it("clamps ticksRemaining into [0, totalTicks]", () => {
    const overflow = sanitizeWildlandsProject({
      id: "p1", kind: "ranger_patrol", totalTicks: 4, ticksRemaining: 999,
    });
    expect(overflow?.ticksRemaining).toBe(4);

    const negative = sanitizeWildlandsProject({
      id: "p2", kind: "ranger_patrol", totalTicks: 4, ticksRemaining: -7,
    });
    expect(negative?.ticksRemaining).toBe(0);
  });

  it("normalises totalTicks to at least 1 even if NaN/zero/negative", () => {
    const out = sanitizeWildlandsProject({
      id: "p3", kind: "ranger_patrol", totalTicks: NaN, ticksRemaining: 0,
    });
    expect(out?.totalTicks).toBe(1);

    const zero = sanitizeWildlandsProject({
      id: "p4", kind: "ranger_patrol", totalTicks: 0,
    });
    expect(zero?.totalTicks).toBe(1);
  });

  it("snaps unknown status values to active", () => {
    const out = sanitizeWildlandsProject({
      id: "p5", kind: "ranger_patrol", totalTicks: 3, ticksRemaining: 1, status: "weird",
    });
    expect(out?.status).toBe("active");
  });

  it("preserves status='completed' verbatim", () => {
    const out = sanitizeWildlandsProject({
      id: "p6", kind: "ranger_patrol", totalTicks: 3, ticksRemaining: 0, status: "completed",
    });
    expect(out?.status).toBe("completed");
  });

  it("drops beast_hunt entries missing megafaunaId in meta", () => {
    expect(sanitizeWildlandsProject({
      id: "h1", kind: "beast_hunt", totalTicks: 4, ticksRemaining: 2,
    })).toBeNull();

    expect(sanitizeWildlandsProject({
      id: "h2", kind: "beast_hunt", totalTicks: 4, ticksRemaining: 2,
      meta: { megafaunaId: "not_a_real_boss" },
    })).toBeNull();
  });

  it("drops beast_capture entries missing valid targetSpecies", () => {
    expect(sanitizeWildlandsProject({
      id: "c1", kind: "beast_capture", totalTicks: 4, ticksRemaining: 2,
    })).toBeNull();

    expect(sanitizeWildlandsProject({
      id: "c2", kind: "beast_capture", totalTicks: 4, ticksRemaining: 2,
      meta: { targetSpecies: "imaginary_unicorn" },
    })).toBeNull();
  });

  it("drops megafauna_retaliation entries missing valid megafaunaId", () => {
    expect(sanitizeWildlandsProject({
      id: "r1", kind: "megafauna_retaliation", totalTicks: 6, ticksRemaining: 6,
    })).toBeNull();

    expect(sanitizeWildlandsProject({
      id: "r2", kind: "megafauna_retaliation", totalTicks: 6, ticksRemaining: 6,
      meta: { megafaunaId: "fake_boss", huntOutcome: "rout", originalDeployed: 50 },
    })).toBeNull();
  });

  it("drops invalid huntOutcome on megafauna_retaliation but keeps the entry", () => {
    const out = sanitizeWildlandsProject({
      id: "r3", kind: "megafauna_retaliation", totalTicks: 6, ticksRemaining: 6,
      biome: "ash_forest",
      meta: {
        megafaunaId: "ridge_tyrant",
        huntOutcome: "panicked", // bogus
        originalDeployed: 50,
      },
    });
    expect(out).not.toBeNull();
    expect(out.meta.huntOutcome).toBeUndefined();
    expect(out.meta.megafaunaId).toBe("ridge_tyrant");
  });

  it("clamps originalDeployed to a non-negative integer", () => {
    const negative = sanitizeWildlandsProject({
      id: "r4", kind: "megafauna_retaliation", totalTicks: 6, ticksRemaining: 6,
      biome: "ash_forest",
      meta: {
        megafaunaId: "ridge_tyrant", huntOutcome: "rout", originalDeployed: -50,
      },
    });
    expect(negative?.meta.originalDeployed).toBe(0);

    const fractional = sanitizeWildlandsProject({
      id: "r5", kind: "megafauna_retaliation", totalTicks: 6, ticksRemaining: 6,
      biome: "ash_forest",
      meta: {
        megafaunaId: "ridge_tyrant", huntOutcome: "rout", originalDeployed: 12.7,
      },
    });
    expect(fractional?.meta.originalDeployed).toBe(12);
  });

  it("strips non-numeric or zero entries from loadoutSnapshot", () => {
    const out = sanitizeWildlandsProject({
      id: "h3", kind: "beast_hunt", totalTicks: 4, ticksRemaining: 2,
      meta: {
        megafaunaId: "ridge_tyrant",
        loadoutSnapshot: {
          cityDefenseInfantry: 50,
          sectorDefenseTroops: 0,
          mechWalkers: -5,
          weird: "junk",
          fractional: 12.9,
        },
      },
    });
    expect(out?.meta.loadoutSnapshot).toEqual({
      cityDefenseInfantry: 50,
      fractional: 12,
    });
  });

  it("drops the meta block entirely when input meta is not an object", () => {
    const out = sanitizeWildlandsProject({
      id: "p7", kind: "ranger_patrol", totalTicks: 4, ticksRemaining: 2,
      meta: "garbage",
    });
    // Non-hunt projects don't require meta, so the entry survives.
    expect(out).not.toBeNull();
    expect(out.meta).toBeUndefined();
  });

  it("strips unknown meta fields silently", () => {
    const out = sanitizeWildlandsProject({
      id: "p8", kind: "ranger_patrol", totalTicks: 4, ticksRemaining: 2,
      meta: {
        evilField: "oh no",
        anotherOne: { nested: "junk" },
      },
    });
    expect(out?.meta?.evilField).toBeUndefined();
    expect(out?.meta?.anotherOne).toBeUndefined();
  });
});

// Regression: a corrupted save can produce a truthy non-array value for
// wildlandsProjects/tamingQueue (e.g. an object or a string). The sanitizer
// must coerce these to [] without throwing.
describe("sanitizeState — truthy non-array corruption", () => {
  it("does not throw when wildlandsProjects is a non-array object", () => {
    const corrupted: any = { ...createInitialState(), wildlandsProjects: { not: "an array" } };
    expect(() => sanitizeState(corrupted)).not.toThrow();
    const out: any = sanitizeState(corrupted);
    expect(Array.isArray(out.wildlandsProjects)).toBe(true);
    expect(out.wildlandsProjects.length).toBe(0);
  });

  it("does not throw when wildlandsProjects is a string", () => {
    const corrupted: any = { ...createInitialState(), wildlandsProjects: "garbage" };
    expect(() => sanitizeState(corrupted)).not.toThrow();
    const out: any = sanitizeState(corrupted);
    expect(Array.isArray(out.wildlandsProjects)).toBe(true);
  });

  it("does not throw when tamingQueue is a non-array object", () => {
    const corrupted: any = { ...createInitialState(), tamingQueue: { bad: true } };
    expect(() => sanitizeState(corrupted)).not.toThrow();
    const out: any = sanitizeState(corrupted);
    expect(Array.isArray(out.tamingQueue)).toBe(true);
    expect(out.tamingQueue.length).toBe(0);
  });

  it("does not throw when tamingQueue is a number", () => {
    const corrupted: any = { ...createInitialState(), tamingQueue: 42 };
    expect(() => sanitizeState(corrupted)).not.toThrow();
    const out: any = sanitizeState(corrupted);
    expect(Array.isArray(out.tamingQueue)).toBe(true);
  });

  it("normalizes batched construction orders and drops malformed entries", () => {
    const corrupted: any = {
      ...createInitialState(),
      pendingConstructions: [
        {
          id: "batch",
          kind: "city",
          buildingKey: "workerHousingStacks",
          label: "WORKER HOUSING STACKS",
          count: 9999,
          ticksTotal: 8,
          ticksRemaining: 999,
          orderedTick: -4,
        },
        { id: "missing-shape", kind: "city", count: 10 },
      ],
    };
    const out: any = sanitizeState(corrupted);
    expect(out.pendingConstructions).toHaveLength(1);
    expect(out.pendingConstructions[0]).toMatchObject({
      id: "batch",
      count: 100,
      ticksRemaining: 8,
      orderedTick: 0,
    });
  });
});

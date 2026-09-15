import { describe, it, expect } from "vitest";
import {
  sanitizeWildlandsProject,
  sanitizeTamingEntry,
  ARRAY_CAPS,
} from "@/engine/sanitizer";

describe("sanitizeWildlandsProject", () => {
  const validBase = {
    id: "wp-1",
    kind: "ranger_patrol",
    totalTicks: 10,
    ticksRemaining: 5,
    status: "active",
  };

  describe("rejects malformed inputs", () => {
    it("returns null for null", () => {
      expect(sanitizeWildlandsProject(null)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(sanitizeWildlandsProject(undefined)).toBeNull();
    });

    it("returns null for non-object primitives", () => {
      expect(sanitizeWildlandsProject("string")).toBeNull();
      expect(sanitizeWildlandsProject(42)).toBeNull();
      expect(sanitizeWildlandsProject(true)).toBeNull();
    });

    it("returns null for unknown kind", () => {
      expect(
        sanitizeWildlandsProject({ ...validBase, kind: "drone_strike" }),
      ).toBeNull();
    });

    it("returns null when kind is not a string", () => {
      expect(
        sanitizeWildlandsProject({ ...validBase, kind: 123 }),
      ).toBeNull();
    });

    it("returns null when id is missing", () => {
      const { id: _id, ...noId } = validBase;
      expect(sanitizeWildlandsProject(noId)).toBeNull();
    });

    it("returns null when id is not a string", () => {
      expect(
        sanitizeWildlandsProject({ ...validBase, id: 99 }),
      ).toBeNull();
    });

    it("drops beast_hunt entries with no megafaunaId in meta", () => {
      expect(
        sanitizeWildlandsProject({ ...validBase, kind: "beast_hunt" }),
      ).toBeNull();
      expect(
        sanitizeWildlandsProject({
          ...validBase,
          kind: "beast_hunt",
          meta: { wranglerCount: 5 },
        }),
      ).toBeNull();
    });

    it("drops beast_hunt entries with an invalid megafaunaId", () => {
      expect(
        sanitizeWildlandsProject({
          ...validBase,
          kind: "beast_hunt",
          meta: { megafaunaId: "godzilla" },
        }),
      ).toBeNull();
    });

    it("drops beast_capture entries with no targetSpecies", () => {
      expect(
        sanitizeWildlandsProject({
          ...validBase,
          kind: "beast_capture",
          meta: {},
        }),
      ).toBeNull();
    });

    it("drops beast_capture entries with an invalid targetSpecies", () => {
      expect(
        sanitizeWildlandsProject({
          ...validBase,
          kind: "beast_capture",
          meta: { targetSpecies: "dragons" },
        }),
      ).toBeNull();
    });
  });

  describe("normalizes numeric fields", () => {
    it("clamps NaN totalTicks to a minimum of 1", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        totalTicks: NaN,
      });
      expect(out).not.toBeNull();
      expect(out.totalTicks).toBe(1);
    });

    it("clamps Infinity totalTicks back to a finite fallback", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        totalTicks: Infinity,
      });
      expect(out).not.toBeNull();
      expect(out.totalTicks).toBe(1);
    });

    it("clamps negative totalTicks to a minimum of 1", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        totalTicks: -5,
      });
      expect(out.totalTicks).toBe(1);
    });

    it("clamps ticksRemaining above totalTicks down to totalTicks", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        totalTicks: 10,
        ticksRemaining: 999,
      });
      expect(out.ticksRemaining).toBe(10);
    });

    it("floors negative ticksRemaining to 0", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        ticksRemaining: -3,
      });
      expect(out.ticksRemaining).toBe(0);
    });

    it("handles NaN ticksRemaining without crashing", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        ticksRemaining: NaN,
      });
      expect(out).not.toBeNull();
      expect(Number.isFinite(out.ticksRemaining)).toBe(true);
    });

    it("normalizes status to active when not 'completed'", () => {
      expect(
        sanitizeWildlandsProject({ ...validBase, status: "garbage" }).status,
      ).toBe("active");
      expect(
        sanitizeWildlandsProject({ ...validBase, status: undefined }).status,
      ).toBe("active");
      expect(
        sanitizeWildlandsProject({ ...validBase, status: "completed" }).status,
      ).toBe("completed");
    });
  });

  describe("sanitizes meta payloads", () => {
    it("drops invalid megafaunaId from meta but keeps the project if not a hunt", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        kind: "ranger_patrol",
        meta: { megafaunaId: "fake_beast" },
      });
      expect(out).not.toBeNull();
      expect(out.meta?.megafaunaId).toBeUndefined();
    });

    it("preserves valid megafaunaId on a hunt", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        kind: "beast_hunt",
        meta: { megafaunaId: "tarpit_titan", wranglerCount: 5 },
      });
      expect(out).not.toBeNull();
      expect(out.meta.megafaunaId).toBe("tarpit_titan");
      expect(out.meta.wranglerCount).toBe(5);
    });

    it("floors fractional wranglerCount to an integer", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        kind: "beast_hunt",
        meta: { megafaunaId: "tarpit_titan", wranglerCount: 7.9 },
      });
      expect(out.meta.wranglerCount).toBe(7);
    });

    it("clamps negative wranglerCount to 0", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        kind: "beast_hunt",
        meta: { megafaunaId: "tarpit_titan", wranglerCount: -10 },
      });
      expect(out.meta.wranglerCount).toBe(0);
    });

    it("ignores non-numeric wranglerCount", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        kind: "beast_hunt",
        meta: { megafaunaId: "tarpit_titan", wranglerCount: "twenty" },
      });
      expect(out.meta.wranglerCount).toBeUndefined();
    });

    it("filters loadoutSnapshot to non-empty integer counts", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        kind: "beast_hunt",
        meta: {
          megafaunaId: "tarpit_titan",
          loadoutSnapshot: {
            ammo: 50,
            fuel: 0,
            grenades: -5,
            scrap: NaN,
            beans: 3.7,
            crowbar: "weapon",
          },
        },
      });
      expect(out.meta.loadoutSnapshot).toEqual({
        ammo: 50,
        beans: 3,
      });
    });

    it("ignores non-object loadoutSnapshot", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        kind: "beast_hunt",
        meta: {
          megafaunaId: "tarpit_titan",
          loadoutSnapshot: "not an object",
        },
      });
      expect(out.meta.loadoutSnapshot).toBeUndefined();
    });

    it("ignores non-object meta", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        meta: "not an object",
      });
      expect(out.meta).toBeUndefined();
    });

    it("preserves valid targetSpecies on a beast_capture", () => {
      const out = sanitizeWildlandsProject({
        ...validBase,
        kind: "beast_capture",
        meta: { targetSpecies: "ridgebackHoundPacks" },
      });
      expect(out).not.toBeNull();
      expect(out.meta.targetSpecies).toBe("ridgebackHoundPacks");
    });
  });

  describe("happy paths", () => {
    it("accepts each known wildlands kind that does not require meta", () => {
      const independentKinds = [
        "ranger_patrol",
        "cultivation",
        "restoration",
        "cull",
        "vaccinate",
        "fence",
      ];
      for (const kind of independentKinds) {
        const out = sanitizeWildlandsProject({ ...validBase, kind });
        expect(out, `expected ${kind} to survive`).not.toBeNull();
        expect(out.kind).toBe(kind);
      }
    });
  });
});

describe("sanitizeTamingEntry", () => {
  const validEntry = {
    id: "tame-1",
    beastUnitKey: "ridgebackHoundPacks",
    beastLabel: "Ridgeback Hounds",
    count: 3,
    ticksRemaining: 5,
    totalTicks: 10,
    capturedAtTick: 100,
    biome: "wildlands",
  };

  describe("rejects malformed inputs", () => {
    it("returns null for null/undefined/non-objects", () => {
      expect(sanitizeTamingEntry(null)).toBeNull();
      expect(sanitizeTamingEntry(undefined)).toBeNull();
      expect(sanitizeTamingEntry(7)).toBeNull();
      expect(sanitizeTamingEntry("x")).toBeNull();
    });

    it("returns null when id is missing or wrong type", () => {
      expect(sanitizeTamingEntry({ ...validEntry, id: undefined })).toBeNull();
      expect(sanitizeTamingEntry({ ...validEntry, id: 42 })).toBeNull();
    });

    it("returns null when beastUnitKey is missing or wrong type", () => {
      expect(
        sanitizeTamingEntry({ ...validEntry, beastUnitKey: undefined }),
      ).toBeNull();
      expect(
        sanitizeTamingEntry({ ...validEntry, beastUnitKey: 99 }),
      ).toBeNull();
    });

    it("returns null when count is zero or negative", () => {
      expect(sanitizeTamingEntry({ ...validEntry, count: 0 })).toBeNull();
      expect(sanitizeTamingEntry({ ...validEntry, count: -5 })).toBeNull();
    });

    it("returns null when count is NaN/Infinity (falls back to 0)", () => {
      expect(sanitizeTamingEntry({ ...validEntry, count: NaN })).toBeNull();
      expect(
        sanitizeTamingEntry({ ...validEntry, count: -Infinity }),
      ).toBeNull();
    });
  });

  describe("normalizes numeric fields", () => {
    it("floors fractional count to an integer", () => {
      const out = sanitizeTamingEntry({ ...validEntry, count: 4.9 });
      expect(out?.count).toBe(4);
    });

    it("clamps NaN totalTicks to 1", () => {
      const out = sanitizeTamingEntry({ ...validEntry, totalTicks: NaN });
      expect(out?.totalTicks).toBe(1);
    });

    it("clamps Infinity totalTicks to a finite fallback", () => {
      const out = sanitizeTamingEntry({ ...validEntry, totalTicks: Infinity });
      expect(Number.isFinite(out?.totalTicks)).toBe(true);
    });

    it("clamps ticksRemaining above totalTicks down to totalTicks", () => {
      const out = sanitizeTamingEntry({
        ...validEntry,
        totalTicks: 10,
        ticksRemaining: 9999,
      });
      expect(out?.ticksRemaining).toBe(10);
    });

    it("floors negative ticksRemaining and capturedAtTick to 0", () => {
      const out = sanitizeTamingEntry({
        ...validEntry,
        ticksRemaining: -3,
        capturedAtTick: -100,
      });
      expect(out?.ticksRemaining).toBe(0);
      expect(out?.capturedAtTick).toBe(0);
    });
  });

  describe("normalizes optional fields", () => {
    it("falls back to beastUnitKey when beastLabel is missing", () => {
      const { beastLabel: _label, ...noLabel } = validEntry;
      const out = sanitizeTamingEntry(noLabel);
      expect(out?.beastLabel).toBe(noLabel.beastUnitKey);
    });

    it("falls back to beastUnitKey when beastLabel is wrong type", () => {
      const out = sanitizeTamingEntry({ ...validEntry, beastLabel: 42 });
      expect(out?.beastLabel).toBe(validEntry.beastUnitKey);
    });

    it("falls back to a default biome when biome is wrong type", () => {
      const out = sanitizeTamingEntry({ ...validEntry, biome: 12 });
      expect(out?.biome).toBe("toxic_marsh");
    });

    it("returns a clean object containing only known fields", () => {
      const out = sanitizeTamingEntry({
        ...validEntry,
        somethingExtra: "should be dropped",
      });
      expect(out).not.toBeNull();
      expect(Object.keys(out!).sort()).toEqual(
        [
          "beastLabel",
          "beastUnitKey",
          "biome",
          "capturedAtTick",
          "count",
          "id",
          "ticksRemaining",
          "totalTicks",
        ].sort(),
      );
    });
  });
});

describe("ARRAY_CAPS", () => {
  it("declares caps for wildlandsProjects and tamingQueue", () => {
    expect(ARRAY_CAPS.wildlandsProjects).toBeGreaterThan(0);
    expect(ARRAY_CAPS.tamingQueue).toBeGreaterThan(0);
  });
});

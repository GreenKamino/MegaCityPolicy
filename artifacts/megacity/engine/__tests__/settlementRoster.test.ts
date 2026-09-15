import { describe, expect, it } from "vitest";

import {
  MEGACITY_ROSTER_CAP,
  RESERVED_MEGACITY_IDS,
  createMegacityRoster,
  normalizeMegacityRoster,
  validateMegacityRoster,
} from "@/engine/settlementRoster";

describe("deterministic megacity roster", () => {
  it("keeps the cap, reservations, unique IDs, and valid map placements", () => {
    const roster = createMegacityRoster(42);
    expect(roster.entries).toHaveLength(MEGACITY_ROSTER_CAP);
    expect(new Set(roster.entries.map((entry) => entry.id)).size).toBe(roster.entries.length);
    expect(RESERVED_MEGACITY_IDS.every((id) => roster.entries.some((entry) => entry.id === id))).toBe(true);
    expect(roster.entries.every((entry) =>
      Number.isFinite(entry.placement.x) && Number.isFinite(entry.placement.y),
    )).toBe(true);
    expect(roster.entries.filter((entry) => entry.source === "generated")).toHaveLength(1);
    expect(validateMegacityRoster(roster, [{ x: 472, y: 406 }])).toEqual([]);
  });

  it("is stable for a seed and changes generated selection for a different seed", () => {
    const first = createMegacityRoster(100);
    expect(createMegacityRoster(100)).toEqual(first);
    expect(createMegacityRoster(101).entries.map((entry) => entry.id)).not.toEqual(first.entries.map((entry) => entry.id));
  });

  it("normalizes malformed metadata without accepting unknown IDs or blank names", () => {
    const normalized = normalizeMegacityRoster({
      seed: 9,
      entries: [
        { id: "iron-khanate", displayName: "  LA ADMIN  " } as any,
        { id: "not-real", displayName: "Injected" } as any,
      ],
    });
    expect(normalized.entries).toHaveLength(MEGACITY_ROSTER_CAP);
    expect(normalized.entries.find((entry) => entry.id === "iron-khanate")?.displayName).toBe("LA ADMIN");
    expect(normalized.entries.some((entry) => entry.id === "not-real")).toBe(false);
  });
});
import { describe, it, expect } from "vitest";
import { createInitialState } from "@/engine/initialState";
import { FAITH_DEFS, FAITH_IDS } from "@/engine/faiths";
import type { FaithId, Faction, ExternalMegacity, Township } from "@/engine/types";

const initialState = createInitialState();

const isFaithIdOrNullish = (v: unknown): v is FaithId | null | undefined =>
  v === null || v === undefined || (typeof v === "string" && (FAITH_IDS as readonly string[]).includes(v));

describe("dominant religion seeding on external entities", () => {
  it("every faction's dominantFaithId (if present) is a known FaithId", () => {
    for (const f of initialState.factions) {
      expect(isFaithIdOrNullish(f.dominantFaithId)).toBe(true);
    }
  });

  it("every external megacity's dominantFaithId (if present) is a known FaithId", () => {
    for (const m of initialState.externalMegacities) {
      expect(isFaithIdOrNullish(m.dominantFaithId)).toBe(true);
    }
  });

  it("every township's dominantFaithId (if present) is a known FaithId", () => {
    for (const t of initialState.townships ?? []) {
      expect(isFaithIdOrNullish(t.dominantFaithId)).toBe(true);
    }
  });

  it("seeds thematic religion mappings on flagship entities", () => {
    const expectedFactions: Record<string, FaithId> = {
      "eternal-flame": "eternal-flame",
      "iron-circuit": "machine-choir",
      "reliquary-see": "machine-choir",
      "free-traders": "the-ledger",
      corps: "the-ledger",
    };
    for (const [id, faith] of Object.entries(expectedFactions)) {
      const f = initialState.factions.find((x: Faction) => x.id === id);
      expect(f, `faction ${id} should exist in seed`).toBeDefined();
      expect(f!.dominantFaithId).toBe(faith);
    }

    const expectedMegacities: Record<string, FaithId> = {
      "iron-khanate": "ancestor-cult",
      "aureus-dominion": "the-ledger",
      "verdant-enclave": "the-tidekeepers",
      "crimson-reach": "machine-choir",
      beneath: "ancestor-cult",
      "mega-habana": "ancestor-cult",
    };
    for (const [id, faith] of Object.entries(expectedMegacities)) {
      const m = initialState.externalMegacities.find((x: ExternalMegacity) => x.id === id);
      expect(m, `megacity ${id} should exist in seed`).toBeDefined();
      expect(m!.dominantFaithId).toBe(faith);
    }
    const laCity = initialState.externalMegacities.find((x: ExternalMegacity) => x.id === "iron-khanate");
    expect(laCity?.name).toBe("LA CITY");
    expect(laCity?.dominantFaithId).toBe("ancestor-cult");

    const expectedTownships: Record<string, FaithId> = {
      "new-eden": "the-tidekeepers",
      "pilgrim-station": "ancestor-cult",
    };
    for (const [id, faith] of Object.entries(expectedTownships)) {
      const t = (initialState.townships ?? []).find((x: Township) => x.id === id);
      expect(t, `township ${id} should exist in seed`).toBeDefined();
      expect(t!.dominantFaithId).toBe(faith);
    }
  });

  it("entities without a seeded dominantFaithId leave it absent (rendered as 'No religion')", () => {
    // Flagship secular entities should not falsely claim a religion.
    const judges = initialState.factions.find((x: Faction) => x.id === "judges");
    expect(judges?.dominantFaithId).toBeUndefined();
    const helix = initialState.externalMegacities.find((x: ExternalMegacity) => x.id === "helix-commune");
    expect(helix?.dominantFaithId).toBeUndefined();
    const mexicoCity = (initialState.townships ?? []).find((x: Township) => x.id === "dusthaven");
    expect(mexicoCity?.name).toBe("Mexico City");
    expect(mexicoCity?.dominantFaithId).toBeUndefined();
  });

  it("FAITH_DEFS contains color + shortName for every seeded faith id (UI prerequisite)", () => {
    const seeded = new Set<FaithId>();
    for (const f of initialState.factions) if (f.dominantFaithId) seeded.add(f.dominantFaithId);
    for (const m of initialState.externalMegacities) if (m.dominantFaithId) seeded.add(m.dominantFaithId);
    for (const t of initialState.townships ?? []) if (t.dominantFaithId) seeded.add(t.dominantFaithId);
    for (const id of seeded) {
      expect(FAITH_DEFS[id]).toBeDefined();
      expect(FAITH_DEFS[id].color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(FAITH_DEFS[id].shortName.length).toBeGreaterThan(0);
    }
  });
});

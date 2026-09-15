import { describe, expect, it } from "vitest";

import {
  DEFAULT_OUTFIT,
  formatOutfitSummary,
  getOfficerOutfit,
  getPlayerOutfit,
  getSidearmVariant,
  getUniformVariant,
  isSidearmId,
  isUniformId,
  setOfficerOutfit,
  setPlayerOutfit,
  SIDEARM_VARIANTS,
  UNIFORM_VARIANTS,
} from "../wardrobe";
import type { GameState } from "../types";

function stubState(overrides: Partial<GameState> = {}): GameState {
  return {
    playerTitle: "City Commander",
    cityName: "MEGACITY JUAN",
    ...overrides,
  } as unknown as GameState;
}

describe("wardrobe — catalog", () => {
  it("has 6 uniform variants and 6 sidearms", () => {
    expect(UNIFORM_VARIANTS.length).toBe(6);
    expect(SIDEARM_VARIANTS.length).toBe(6);
  });

  it("has unique ids in each catalog", () => {
    const u = new Set(UNIFORM_VARIANTS.map((v) => v.id));
    const s = new Set(SIDEARM_VARIANTS.map((v) => v.id));
    expect(u.size).toBe(UNIFORM_VARIANTS.length);
    expect(s.size).toBe(SIDEARM_VARIANTS.length);
  });

  it("every variant carries a label, description, and icon", () => {
    for (const v of [...UNIFORM_VARIANTS, ...SIDEARM_VARIANTS]) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
      expect(v.icon.length).toBeGreaterThan(0);
    }
  });
});

describe("wardrobe — type guards", () => {
  it("validates known uniform ids", () => {
    expect(isUniformId("field")).toBe(true);
    expect(isUniformId("riot")).toBe(true);
    expect(isUniformId("kilt")).toBe(false);
    expect(isUniformId(null)).toBe(false);
  });

  it("validates known sidearm ids", () => {
    expect(isSidearmId("service-pistol")).toBe(true);
    expect(isSidearmId("monoblade")).toBe(true);
    expect(isSidearmId("rocket")).toBe(false);
  });
});

describe("wardrobe — getPlayerOutfit defaults", () => {
  it("returns the field/service-pistol default when state is empty", () => {
    expect(getPlayerOutfit(stubState())).toEqual(DEFAULT_OUTFIT);
  });

  it("returns the stored outfit when present", () => {
    const next = setPlayerOutfit(stubState(), {
      uniformId: "stealth",
      sidearmId: "monoblade",
    });
    expect(getPlayerOutfit(next)).toEqual({
      uniformId: "stealth",
      sidearmId: "monoblade",
    });
  });

  it("repairs a bad uniform id silently", () => {
    const id = getPlayerOutfit(
      stubState({
        playerOutfit: { uniformId: "kilt" as any, sidearmId: "service-pistol" },
      }),
    );
    expect(id.uniformId).toBe(DEFAULT_OUTFIT.uniformId);
    expect(id.sidearmId).toBe("service-pistol");
  });

  it("repairs a bad sidearm id silently", () => {
    const id = getPlayerOutfit(
      stubState({
        playerOutfit: { uniformId: "riot", sidearmId: "rocket" as any },
      }),
    );
    expect(id.uniformId).toBe("riot");
    expect(id.sidearmId).toBe(DEFAULT_OUTFIT.sidearmId);
  });
});

describe("wardrobe — setPlayerOutfit merge", () => {
  it("seeds an outfit when none exists", () => {
    const next = setPlayerOutfit(stubState(), { uniformId: "parade" });
    expect(next.playerOutfit?.uniformId).toBe("parade");
    expect(next.playerOutfit?.sidearmId).toBe(DEFAULT_OUTFIT.sidearmId);
  });

  it("preserves the other field on a partial patch", () => {
    const seeded = setPlayerOutfit(stubState(), {
      uniformId: "parade",
      sidearmId: "heavy-magnum",
    });
    const next = setPlayerOutfit(seeded, { uniformId: "stealth" });
    expect(next.playerOutfit?.uniformId).toBe("stealth");
    expect(next.playerOutfit?.sidearmId).toBe("heavy-magnum");
  });

  it("ignores garbage patches", () => {
    const seeded = setPlayerOutfit(stubState(), { uniformId: "parade" });
    const next = setPlayerOutfit(seeded, { uniformId: "kilt" as any });
    expect(next.playerOutfit?.uniformId).toBe("parade");
  });

  it("never mutates the input state", () => {
    const before = stubState();
    const after = setPlayerOutfit(before, { uniformId: "parade" });
    expect(before.playerOutfit).toBeUndefined();
    expect(after).not.toBe(before);
  });
});

describe("wardrobe — officer outfits", () => {
  it("returns default when officer has no outfit", () => {
    expect(getOfficerOutfit(stubState(), "officer-1")).toEqual(DEFAULT_OUTFIT);
  });

  it("stores per-officer outfits independently", () => {
    let s = stubState();
    s = setOfficerOutfit(s, "officer-1", { uniformId: "parade" });
    s = setOfficerOutfit(s, "officer-2", { uniformId: "stealth", sidearmId: "monoblade" });

    expect(getOfficerOutfit(s, "officer-1").uniformId).toBe("parade");
    expect(getOfficerOutfit(s, "officer-2").uniformId).toBe("stealth");
    expect(getOfficerOutfit(s, "officer-2").sidearmId).toBe("monoblade");
    expect(getOfficerOutfit(s, "officer-3")).toEqual(DEFAULT_OUTFIT);
  });

  it("ignores empty officerId silently", () => {
    const before = stubState();
    const after = setOfficerOutfit(before, "", { uniformId: "parade" });
    expect(after).toBe(before);
  });

  it("does not affect other officers when patching one", () => {
    let s = stubState();
    s = setOfficerOutfit(s, "officer-1", { uniformId: "parade" });
    s = setOfficerOutfit(s, "officer-2", { uniformId: "stealth" });
    s = setOfficerOutfit(s, "officer-1", { sidearmId: "taser-baton" });
    expect(getOfficerOutfit(s, "officer-1")).toEqual({
      uniformId: "parade",
      sidearmId: "taser-baton",
    });
    expect(getOfficerOutfit(s, "officer-2").uniformId).toBe("stealth");
  });
});

describe("wardrobe — variant lookups", () => {
  it("getUniformVariant returns the requested variant", () => {
    expect(getUniformVariant("riot").label).toBe("RIOT");
  });

  it("getSidearmVariant returns the requested variant", () => {
    expect(getSidearmVariant("monoblade").label).toBe("MONOBLADE");
  });

  it("formatOutfitSummary builds a one-line string", () => {
    const text = formatOutfitSummary({ uniformId: "parade", sidearmId: "smartgun" });
    expect(text).toContain("PARADE");
    expect(text).toContain("SMARTGUN");
  });
});

import { describe, expect, it } from "vitest";
import { applyCommanderOrigin, COMMANDER_ORIGIN_TRAITS, COMMANDER_ORIGINS, getCommanderOrigin } from "@/engine/commanderOrigins";
import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";

describe("commander origins", () => {
  it("contains a neutral option and valid existing trait packages", () => {
    expect(COMMANDER_ORIGINS.map((origin) => origin.id)).toContain("none");
    expect(COMMANDER_ORIGINS).toHaveLength(7);
    for (const origin of COMMANDER_ORIGINS) {
      expect(origin.name.length).toBeGreaterThan(0);
      expect(origin.description.length).toBeGreaterThan(20);
      expect(origin.advantage.length).toBeGreaterThan(0);
      expect(origin.tradeoff.length).toBeGreaterThan(0);
      expect(origin.dispatchLine.length).toBeGreaterThan(20);
      if (origin.trait) expect(COMMANDER_ORIGIN_TRAITS.has(origin.trait)).toBe(true);
    }
    expect(getCommanderOrigin("not-a-real-origin").id).toBe("none");
  });

  it("applies every origin's package once and does not stack on repeat", () => {
    const baseline = createInitialState();
    for (const origin of COMMANDER_ORIGINS) {
      const applied = applyCommanderOrigin(baseline, origin.id);
      expect(applied.commanderOrigin).toBe(origin.id);
      if (origin.id === "none") {
        expect(applied).toBe(baseline);
        continue;
      }
      expect(applied.player).not.toBe(baseline.player);
      expect(applyCommanderOrigin(applied, origin.id)).toBe(applied);
      expect(applied.player.traits).toEqual(
        expect.arrayContaining(origin.trait ? [origin.trait] : []),
      );
    }
  });

  it("normalizes missing and invalid origins for old or malformed saves", () => {
    const fresh = createInitialState();
    expect(fresh.commanderOrigin).toBe("none");
    expect(sanitizeState({ ...fresh, commanderOrigin: undefined }).commanderOrigin).toBe("none");
    expect(sanitizeState({ ...fresh, commanderOrigin: "forged" as never }).commanderOrigin).toBe("none");
    expect(migrateState({ ...fresh, commanderOrigin: "academy_officer" }).commanderOrigin).toBe("academy_officer");
  });
});
import { describe, expect, it } from "vitest";
import { applyDialogueCityEffects } from "@/engine/dialogueEffects";
import { createInitialState } from "@/engine/initialState";

describe("dialogue city effects", () => {
  it("applies every shared command/officer/retinue city effect", () => {
    const state = createInitialState();
    state.resources.credits = 100;
    state.cityStats = {
      ...state.cityStats,
      unrest: 20,
      corruption: 10,
      happiness: 40,
      lawOrder: 50,
      defenseRating: 60,
      researchProgress: 10,
      researchTarget: 100,
    };

    const next = applyDialogueCityEffects(state, {
      credits: -25,
      unrest: 2,
      corruption: -3,
      happiness: 4,
      lawOrder: 5,
      defenseRating: 6,
      research: 7,
    });

    expect(next.resources.credits).toBe(75);
    expect(next.cityStats.unrest).toBe(22);
    expect(next.cityStats.corruption).toBe(7);
    expect(next.cityStats.happiness).toBe(44);
    expect(next.cityStats.lawOrder).toBe(55);
    expect(next.cityStats.defenseRating).toBe(66);
    expect(next.cityStats.researchProgress).toBe(17);
    expect(state.resources.credits).toBe(100);
    expect(state.cityStats.defenseRating).toBe(60);
  });

  it("caps research grants at the current research target", () => {
    const state = createInitialState();
    state.cityStats = { ...state.cityStats, researchProgress: 95, researchTarget: 100 };

    const next = applyDialogueCityEffects(state, { research: 20 });

    expect(next.cityStats.researchProgress).toBe(100);
  });
});
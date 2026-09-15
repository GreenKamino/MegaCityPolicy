import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import type { GameState } from "@/engine/types";

const originalRandom = Math.random;
beforeEach(() => { Math.random = () => 0.5; });
afterEach(() => { Math.random = originalRandom; });

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

describe("material-storage trade", () => {
  it("blocks a Steel/Goods shipment atomically without spending outgoing resources or awarding credits", () => {
    const base = createInitialState();
    base.resources.steel = 1_000;
    base.resources.goods = 1_000;
    base.tradeAgreements = [{
      id: "full-store-trade",
      partnerId: "test-faction",
      partnerName: "Test Faction",
      partnerType: "faction",
      give: [{ commodity: "__res_food", amount: 10 }],
      receive: [{ commodity: "__res_steel", amount: 25 }, { commodity: "__res_goods", amount: 25 }],
      creditsPerTick: 500,
      duration: 5,
      remainingTicks: 5,
      status: "active",
      createdTick: 0,
    }];

    const blocked = runTick(clone(base)).newState;
    const control = runTick({ ...clone(base), tradeAgreements: [] }).newState;
    expect(blocked.resources.food).toBe(control.resources.food);
    expect(blocked.resources.credits).toBe(control.resources.credits);
    expect(blocked.resources.steel).toBe(control.resources.steel);
    expect(blocked.resources.goods).toBe(control.resources.goods);
    expect(runTick(clone(base)).entries.some((entry) => entry.label === "Trade Blocked")).toBe(true);
  });

  it("blocks a medical shipment when the medical reserve is full", () => {
    const base = createInitialState();
    base.buildings.publicHealthMegaClinics = 0;
    base.cityStats.population = 0;
    base.resources.medSupplies = 5_000;
    base.resources.food = 100;
    base.tradeAgreements = [{
      id: "full-medical-store-trade",
      partnerId: "test-faction",
      partnerName: "Test Faction",
      partnerType: "faction",
      give: [{ commodity: "__res_food", amount: 10 }],
      receive: [{ commodity: "__res_medSupplies", amount: 25 }],
      creditsPerTick: 500,
      duration: 5,
      remainingTicks: 5,
      status: "active",
      createdTick: 0,
    }];

    const blocked = runTick(clone(base));
    const control = runTick({ ...clone(base), tradeAgreements: [] });
    expect(blocked.newState.resources.food).toBe(control.newState.resources.food);
    expect(blocked.newState.resources.medSupplies).toBe(5_000);
    expect(blocked.entries.some((entry) => entry.label === "Trade Blocked")).toBe(true);
  });

  it("blocks a Food shipment atomically when the food reserve is full", () => {
    const base = createInitialState();
    base.resources.food = 1_000;
    base.tradeAgreements = [{
      id: "full-food-store-trade",
      partnerId: "test-faction",
      partnerName: "Test Faction",
      partnerType: "faction",
      give: [{ commodity: "__res_water", amount: 10 }],
      receive: [{ commodity: "__res_food", amount: 5_000 }],
      creditsPerTick: 500,
      duration: 5,
      remainingTicks: 5,
      status: "active",
      createdTick: 0,
    }];

    const blocked = runTick(clone(base));
    const control = runTick({ ...clone(base), tradeAgreements: [] });
    expect(blocked.newState.resources.water).toBe(control.newState.resources.water);
    expect(blocked.newState.resources.credits).toBe(control.newState.resources.credits);
    expect(blocked.entries.some((entry) => entry.label === "Trade Blocked")).toBe(true);
  });
});
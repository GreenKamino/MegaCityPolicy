import { describe, expect, it } from "vitest";
import { applyEventEffects, applyResponseEffects } from "@/engine/events";
import { applyChainEffects } from "@/engine/eventChains";
import { processMissedTicks, runTick } from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import { processWildlandsProjects } from "@/engine/wildlandsProjects";
import { applyZoneBonuses } from "@/engine/zoneControl";
import { WORLD_LOCATIONS } from "@/engine/worldMap";
import { createDefaultResourceNodeState } from "@/engine/resourceNodes";
import type { EventResponse, GameEvent, GameState, TickEntry } from "@/engine/types";

function entries(): TickEntry[] {
  return [];
}

function fullFoodState(): GameState {
  const state = createInitialState();
  state.resources.food = 1_000;
  return state;
}

describe("food storage gain paths", () => {
  it("caps event, response, chain, zone, and completed wildlands rewards", () => {
    const event: GameEvent = {
      id: "food-storage-event",
      title: "Food shipment",
      description: "A ration shipment arrives.",
      severity: "low",
      effects: { food: 400 },
      timestamp: 0,
      resolved: false,
    };
    const response: EventResponse = {
      id: "food-storage-response",
      label: "Receive",
      description: "Receive the shipment.",
      effects: { food: 400 },
    };
    const eventState = fullFoodState();
    expect(applyEventEffects(eventState, event).resources.food).toBe(1_000);
    expect(applyResponseEffects(eventState, response).resources.food).toBe(1_000);
    applyChainEffects(eventState, { food: 400 });
    expect(eventState.resources.food).toBe(1_000);

    const zoneState = fullFoodState();
    const coastal = WORLD_LOCATIONS.find((location) => location.terrain === "coastal");
    expect(coastal).toBeDefined();
    zoneState.discoveredLocationIds = [coastal!.id];
    zoneState.locationRelations[coastal!.id] = {
      disposition: 100,
      aidSent: 0,
      raidsSent: 0,
      tradesMade: 0,
      scoutsMade: 0,
      lastInteractionTick: 0,
    };
    applyZoneBonuses(zoneState, entries());
    expect(zoneState.resources.food).toBe(1_000);

    const projectState = fullFoodState();
    projectState.wildlandsProjects = [{
      id: "food-project",
      kind: "ranger_patrol",
      biome: "ash_forest",
      ticksRemaining: 1,
      totalTicks: 1,
      status: "active",
      startedAtTick: 0,
    }];
    processWildlandsProjects(projectState, entries());
    expect(projectState.resources.food).toBe(1_000);
  });

  it("caps extrapolated production while still applying offline consumption", () => {
    const full = fullFoodState();
    full.rates.foodConsumption = 20;
    full.rates.foodProduction = 100;
    expect(processMissedTicks(full, 10, 0).newState.resources.food).toBe(1_000);

    const consuming = fullFoodState();
    consuming.rates.foodConsumption = 20;
    consuming.rates.foodProduction = 0;
    expect(processMissedTicks(consuming, 10, 0).newState.resources.food).toBe(800);
  });

  it("routes resource-node Food yields through the same storage ceiling", () => {
    const state = fullFoodState();
    state.cityStats.population = 0;
    state.resourceNodes = createDefaultResourceNodeState();
    state.resourceNodes.exploiting["rn-fungal-grotto"] = { startTick: 0, ticksRemaining: 10 };

    expect(runTick(state).newState.resources.food).toBeLessThanOrEqual(1_000);
  });
});
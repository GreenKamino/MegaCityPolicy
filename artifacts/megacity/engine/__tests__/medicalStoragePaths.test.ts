import { describe, expect, it, vi } from "vitest";
import { applyEventEffects, applyResponseEffects } from "@/engine/events";
import { createInitialState } from "@/engine/initialState";
import { processMissedTicks, runTick } from "@/engine/formulas";
import { processWildlandsCityDemand } from "@/engine/tickProcessors";
import { applyZoneBonuses } from "@/engine/zoneControl";
import { processWildlandsProjects } from "@/engine/wildlandsProjects";
import { MEGAFAUNA_BOSSES, resolveMegafaunaHunt } from "@/engine/megafaunaHunts";
import { WORLD_LOCATIONS } from "@/engine/worldMap";
import { createDefaultResourceNodeState } from "@/engine/resourceNodes";
import type { EventResponse, GameEvent, GameState, TickEntry } from "@/engine/types";

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function entries(): TickEntry[] {
  return [];
}

function baseCapacityState(): GameState {
  const state = createInitialState();
  state.buildings.publicHealthMegaClinics = 0;
  state.buildings.emergencyDisasterResponseHQ = 0;
  state.buildings.emergencyServiceStations = 0;
  state.buildings.seasonalEmergencyDepots = 0;
  return state;
}

describe("medical storage gain paths", () => {
  it("caps event, response, zone, and completed wildlands rewards", () => {
    const event: GameEvent = {
      id: "medical-storage-event",
      title: "Medical shipment",
      description: "A sealed shipment arrives.",
      severity: "low",
      effects: { medSupplies: 400 },
      timestamp: 0,
      resolved: false,
    };
    const response: EventResponse = {
      id: "medical-storage-response",
      label: "Receive",
      description: "Receive the shipment.",
      effects: { medSupplies: 400 },
    };
    const full = baseCapacityState();
    full.resources.medSupplies = 4_900;
    const eventResult = applyEventEffects(full, event);
    expect(eventResult.resources.medSupplies).toBe(5_000);
    expect(eventResult.messages?.[0]).toEqual(expect.objectContaining({
      title: "MEDICAL RESERVE CAP REACHED",
      body: expect.stringContaining("+100 medical supplies stored; +300 rejected"),
    }));
    expect(eventResult.messages?.[0]?.body).toContain("Economy");
    expect(eventResult.messages?.[0]?.body).toContain("medical and response buildings");

    const responseResult = applyResponseEffects(full, response);
    expect(responseResult.resources.medSupplies).toBe(5_000);
    expect(responseResult.messages?.[0]?.body).toContain("+100 medical supplies stored; +300 rejected");

    const zoneState = baseCapacityState();
    zoneState.resources.medSupplies = 4_999;
    const swamp = WORLD_LOCATIONS.find((location) => location.terrain === "swamp");
    expect(swamp).toBeDefined();
    zoneState.discoveredLocationIds = [swamp!.id];
    zoneState.locationRelations[swamp!.id] = {
      disposition: 100,
      aidSent: 0,
      raidsSent: 0,
      tradesMade: 0,
      scoutsMade: 0,
      lastInteractionTick: 0,
    };
    const zoneEntries = entries();
    applyZoneBonuses(zoneState, zoneEntries);
    expect(zoneState.resources.medSupplies).toBe(5_000);
    expect(zoneEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        unit: "medical supplies",
        reason: expect.stringContaining("+1 medical supplies stored; +2 rejected"),
        severity: "warning",
      }),
    ]));

    const projectState = baseCapacityState();
    projectState.resources.medSupplies = 4_990;
    projectState.wildlandsProjects = [{
      id: "medical-project",
      kind: "restoration",
      biome: "ash_forest",
      ticksRemaining: 1,
      totalTicks: 1,
      status: "active",
      startedAtTick: 0,
    }];
    const projectEntries = entries();
    processWildlandsProjects(projectState, projectEntries);
    expect(projectState.resources.medSupplies).toBe(5_000);
    expect(projectEntries[0].reason).toContain("+10 medical supplies stored; +15 rejected");
    expect(projectEntries[0].reason).toContain("Economy");
    expect(projectEntries[0].severity).toBe("warning");
  });

  it("caps offline production while still applying offline medical consumption", () => {
    const full = baseCapacityState();
    full.resources.medSupplies = 5_000;
    full.cityStats.population = 1;
    full.rates.medProduction = 100;
    const fullCatchup = processMissedTicks(full, 10, 0);
    const afterFull = fullCatchup.newState;
    expect(afterFull.resources.medSupplies).toBe(5_000);
    expect(fullCatchup.allEntries.flat().some((entry) =>
      entry.reason.includes("+1,000 rejected") &&
      entry.reason.includes("Economy"),
    )).toBe(true);

    const consuming = baseCapacityState();
    consuming.resources.medSupplies = 100;
    consuming.cityStats.population = 80_000;
    consuming.rates.medProduction = 0;
    const afterConsumption = processMissedTicks(consuming, 10, 0).newState;
    expect(afterConsumption.resources.medSupplies).toBe(80);
  });

  it("routes a resource-node medical yield through the same storage ceiling", () => {
    const state = baseCapacityState();
    state.cityStats.population = 0;
    state.resources.medSupplies = 4_999;
    state.resourceNodes = createDefaultResourceNodeState();
    state.resourceNodes.exploiting["rn-pharma-tomb"] = { startTick: 0, ticksRemaining: 10 };

    const tick = runTick(state);
    const after = tick.newState;
    expect(after.resources.medSupplies).toBe(5_000);
    expect(tick.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Resource Nodes",
        unit: "medical supplies",
        reason: expect.stringContaining("rejected"),
        severity: "warning",
      }),
    ]));
  });

  it("reports capped wildlands commodity and hunt medical gains", () => {
    const wildlandsState = baseCapacityState();
    wildlandsState.cityStats.population = 10_000_000;
    wildlandsState.resources.medSupplies = 5_000;
    wildlandsState.stockpiles = {
      medicinal_herbs: 40,
      wildlands_antitoxin: 5,
    };
    const wildlandsEntries = entries();
    processWildlandsCityDemand(wildlandsState, wildlandsEntries);
    expect(wildlandsEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Wildlands Medical Supply",
        reason: expect.stringContaining("+9 rejected"),
        severity: "warning",
      }),
    ]));

    const huntState = baseCapacityState();
    huntState.resources.medSupplies = 4_990;
    const huntEntries = entries();
    const project = {
      id: "medical-hunt",
      kind: "beast_hunt" as const,
      biome: "toxic_marsh" as const,
      ticksRemaining: 0,
      totalTicks: 4,
      status: "completed" as const,
      startedAtTick: 0,
      meta: {
        megafaunaId: "tarpit_titan" as const,
        loadoutSnapshot: { infantry: 500 },
      },
    };
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      resolveMegafaunaHunt(huntState, project, huntEntries);
    } finally {
      randomSpy.mockRestore();
    }
    expect(huntEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: expect.stringContaining("BIG GAME"),
        reason: expect.stringContaining("+10 medical supplies stored; +110 rejected"),
        severity: "warning",
      }),
    ]));
    expect(huntState.resources.medSupplies).toBe(5_000);
    expect(MEGAFAUNA_BOSSES.tarpit_titan.loot.medSupplies).toBe(120);
  });
});
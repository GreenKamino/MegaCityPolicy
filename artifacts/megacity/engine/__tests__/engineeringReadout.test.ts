import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  getEngineeringLedger,
  getEngineeringRole,
  getRustWardensReadout,
  RUST_WARDENS_ID,
} from "@/engine/engineeringReadout";
import { migrateState } from "@/engine/saveLoad";

describe("Rust Wardens engineering readout", () => {
  it("identifies the existing faction as an internal workers movement", () => {
    const state = createInitialState();
    const faction = state.factions.find((candidate) => candidate.id === RUST_WARDENS_ID);

    expect(faction).toMatchObject({
      id: RUST_WARDENS_ID,
      name: "The Rust Wardens",
      type: "underclass",
      scope: "internal",
    });
  });

  it("turns live infrastructure conditions into a readable posture", () => {
    const state = createInitialState();
    state.cityStats.infrastructureHealth = 24;
    state.rates.powerGeneration = 100;
    state.rates.powerDrain = 250;
    state.pendingConstructions = Array.from({ length: 6 }, (_, index) => ({ id: `build-${index}` } as any));

    const readout = getRustWardensReadout(state);

    expect(readout?.posture).toBe("CRITICAL");
    expect(readout?.signals.map((signal) => signal.label)).toEqual([
      "Infrastructure integrity",
      "Engineering workforce",
      "Works queue",
      "Grid margin",
      "Industrial output",
    ]);
    expect(readout?.signals.find((signal) => signal.label === "Grid margin")?.value).toBe("-150 power");
  });

  it("backfills internal scope on legacy saves without changing faction type", () => {
    const fresh = createInitialState();
    const legacy = {
      ...fresh,
      factions: fresh.factions.map((faction) =>
        faction.id === RUST_WARDENS_ID ? { ...faction, scope: undefined } : faction,
      ),
    };

    const migrated = migrateState(legacy);
    const wardens = migrated.factions.find((faction) => faction.id === RUST_WARDENS_ID);

    expect(wardens).toMatchObject({ type: "underclass", scope: "internal" });
  });

  it("keeps labor, machines, facilities, and population estimates distinct", () => {
    const ledger = getEngineeringLedger(createInitialState());

    expect(getEngineeringRole(ledger, "mechanics")).toMatchObject({
      kind: "teams",
      source: "units",
    });
    expect(getEngineeringRole(ledger, "maintenance_facilities")).toMatchObject({
      kind: "facilities",
      source: "buildings",
    });
    expect(getEngineeringRole(ledger, "sanitation_engineers")).toMatchObject({
      kind: "population-estimate",
      source: "population",
    });
    expect(getEngineeringRole(ledger, "mining_machines")).toMatchObject({
      kind: "machines",
      source: "mining_operations",
    });
  });

  it("reacts to live units, utility buildings, mining operations, and queued works", () => {
    const state = createInitialState();
    const before = getEngineeringLedger(state);

    state.units.constructionCrews += 12;
    state.units.recyclingFacilityWorkers += 9;
    state.buildings.waterRecyclingSuperFacilities += 2;
    state.miningOperations = [{
      ...(state.miningOperations?.[0] as any),
      workers: 77,
      vehicles: { excavator: 4, haul_truck: 3 },
      active: true,
    }];
    state.pendingConstructions = [{
      id: "queued-water-plant",
      kind: "city",
      buildingKey: "waterRecyclingSuperFacilities",
      label: "Water recycling facility",
      count: 3,
      ticksTotal: 6,
      ticksRemaining: 4,
      orderedTick: state.totalTicks,
    }];

    const after = getEngineeringLedger(state);

    expect(getEngineeringRole(after, "construction_workers")?.value)
      .toBe(getEngineeringRole(before, "construction_workers")!.value + 12);
    expect(getEngineeringRole(after, "recyclers")?.value)
      .toBe(getEngineeringRole(before, "recyclers")!.value + 9);
    expect(getEngineeringRole(after, "sanitation_facilities")?.value)
      .toBe(getEngineeringRole(before, "sanitation_facilities")!.value + 2);
    expect(getEngineeringRole(after, "mining_site_workers")?.value).toBe(77);
    expect(getEngineeringRole(after, "mining_machines")?.value).toBe(7);
    expect(after.queuedWorkUnits).toBe(3);
    expect(after.remainingWorkTicks).toBe(12);
    expect(after.constructionShortage).toBeGreaterThan(before.constructionShortage);
  });

  it("lets utility and construction shortages lower the Warden operational signal", () => {
    const state = createInitialState();
    const stable = getRustWardensReadout(state);

    state.rates.powerGeneration = 40;
    state.rates.powerDrain = 400;
    state.rates.waterProduction = 20;
    state.rates.waterConsumption = 300;
    state.utilities.wasteGenerated = 400;
    state.utilities.wasteProcessed = 0;
    state.units.constructionCrews = 0;
    state.pendingConstructions = Array.from({ length: 8 }, (_, index) => ({
      id: `backlog-${index}`,
      kind: "city" as const,
      buildingKey: "workerHousingStacks",
      label: "Worker housing",
      count: 2,
      ticksTotal: 6,
      ticksRemaining: 6,
      orderedTick: state.totalTicks,
    }));

    const strained = getRustWardensReadout(state);

    expect(strained?.ledger.shortage).toBeGreaterThan(stable?.ledger.shortage ?? 0);
    expect(strained?.operationalScore).toBeLessThan(stable?.operationalScore ?? 100);
    expect(strained?.posture).toBe("CRITICAL");
  });
});
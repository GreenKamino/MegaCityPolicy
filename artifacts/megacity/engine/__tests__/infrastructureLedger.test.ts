import { describe, expect, it } from "vitest";
import { createInitialState } from "@/engine/initialState";
import {
  INFRASTRUCTURE_ASSET_CATALOG,
  INFRASTRUCTURE_HISTORY_CAP,
  addInfrastructureCapacity,
  applyInfrastructureDamage,
  createInfrastructureLedger,
  infrastructureHealthPercent,
  reconcileInfrastructureLedger,
  removeInfrastructureCapacity,
  repairInfrastructure,
  applyInfrastructureHealthDelta,
} from "@/engine/infrastructureLedger";
import { migrateState } from "@/engine/saveLoad";
import { applyEventResponse } from "@/engine/eventResolution";
import { applyResponseEffects } from "@/engine/events";

describe("universal infrastructure ledger", () => {
  it("catalogs every ordinary completed building and every military definition", () => {
    const state = createInitialState();
    const keys = new Set(INFRASTRUCTURE_ASSET_CATALOG.map(asset => `${asset.source}:${asset.key}`));
    for (const key of Object.keys(state.buildings)) expect(keys.has(`city:${key}`)).toBe(true);
    for (const key of Object.keys(state.militaryOverhaul?.logistics?.installationsBuilt ?? {})) {
      expect(keys.has(`military:${key}`)).toBe(true);
    }
    expect(INFRASTRUCTURE_ASSET_CATALOG.some(asset => asset.source === "rail")).toBe(true);
  });

  it("migrates legacy health into intact points and keeps the mirror derived", () => {
    const state = createInitialState();
    const legacy = { ...state, infrastructureLedger: undefined, cityStats: { ...state.cityStats, infrastructureHealth: 37 } };
    const migrated = migrateState(legacy);
    expect(migrated.infrastructureLedger?.totalPoints).toBeGreaterThan(0);
    expect(migrated.cityStats.infrastructureHealth).toBeCloseTo(37, 5);
    expect(migrated.cityStats.infrastructureHealth).toBeCloseTo(infrastructureHealthPercent(migrated.infrastructureLedger!), 5);
  });

  it("preserves configured initial health instead of forcing a new city to 100", () => {
    const state = createInitialState();
    expect(state.cityStats.infrastructureHealth).toBeLessThan(100);
    expect(state.cityStats.infrastructureHealth).toBeCloseTo(
      infrastructureHealthPercent(state.infrastructureLedger!),
      5,
    );
  });

  it("uses legacy health for malformed ledgers and drops phantom persisted assets", () => {
    const state = createInitialState();
    const malformed = migrateState({
      ...state,
      cityStats: { ...state.cityStats, infrastructureHealth: 43 },
      infrastructureLedger: {} as typeof state.infrastructureLedger,
    });
    expect(malformed.cityStats.infrastructureHealth).toBeCloseTo(43, 5);

    const withPhantom = migrateState({
      ...state,
      infrastructureLedger: {
        ...state.infrastructureLedger!,
        assets: {
          ...state.infrastructureLedger!.assets,
          "city:not-a-real-asset": {
            id: "city:not-a-real-asset",
            key: "not-a-real-asset",
            source: "city",
            category: "construction",
            count: 999,
            points: 999,
            maxIntegrity: 99_900,
            integrity: 99_900,
          },
        },
      },
    });
    expect(withPhantom.infrastructureLedger?.assets["city:not-a-real-asset"]).toBeUndefined();
  });

  it("reconciles completion capacity while preserving damage", () => {
    const state = createInitialState();
    let ledger = createInfrastructureLedger(state);
    // Use a seeded physical asset so this proves existing capacity is
    // preserved while one newly completed copy arrives intact.
    ledger = applyInfrastructureDamage(ledger, { incidentId: "strike-1", amount: 25, assetId: "city:skyrailTransitLines" });
    const damagedBeforeCompletion = ledger.assets["city:skyrailTransitLines"];
    const next = { ...state, buildings: { ...state.buildings, skyrailTransitLines: (state.buildings.skyrailTransitLines ?? 0) + 1 }, infrastructureLedger: ledger };
    const reconciled = reconcileInfrastructureLedger(next);
    const afterCompletion = reconciled.assets["city:skyrailTransitLines"];
    expect(afterCompletion.count).toBe((state.buildings.skyrailTransitLines ?? 0) + 1);
    expect(afterCompletion.maxIntegrity).toBe(damagedBeforeCompletion.maxIntegrity + 100);
    expect(afterCompletion.integrity).toBe(damagedBeforeCompletion.integrity + 100);
  });

  it("makes damage and repair idempotent by incident id and bounds integrity", () => {
    const state = createInitialState();
    let ledger = createInfrastructureLedger(state);
    ledger = applyInfrastructureDamage(ledger, { incidentId: "strike-2", amount: 1000, category: "transit" });
    const once = ledger.intactPoints;
    expect(applyInfrastructureDamage(ledger, { incidentId: "strike-2", amount: 1000, category: "transit" })).toBe(ledger);
    ledger = repairInfrastructure(ledger, { incidentId: "repair-2", amount: 1000, category: "transit" });
    expect(ledger.intactPoints).toBeGreaterThanOrEqual(once);
    expect(repairInfrastructure(ledger, { incidentId: "repair-2", amount: 1000, category: "transit" })).toBe(ledger);
    for (const asset of Object.values(ledger.assets)) expect(asset.integrity).toBeGreaterThanOrEqual(0);
  });

  it("accounts weighted asset damage in infrastructure points", () => {
    const state = createInitialState();
    const base = createInfrastructureLedger(state);
    const weighted = addInfrastructureCapacity(base, "rail_corridor", 1, "rail");
    const before = weighted.intactPoints;
    const damaged = applyInfrastructureDamage(weighted, {
      incidentId: "weighted-rail-hit",
      amount: 4,
      assetId: "rail:rail_corridor",
      reason: "Bombardment",
    });
    expect(before - damaged.intactPoints).toBeCloseTo(4, 5);
    expect(damaged.incidents.at(-1)).toMatchObject({
      amount: 4,
      assetId: "rail:rail_corridor",
      source: "rail",
      category: "transit",
    });
  });

  it("adds and removes physical capacity without affecting unrelated assets", () => {
    const state = createInitialState();
    let ledger = createInfrastructureLedger(state);
    const before = ledger.totalPoints;
    ledger = addInfrastructureCapacity(ledger, { key: "fusionReactors", count: 2, incidentId: "build-1" });
    expect(ledger.totalPoints).toBe(before + 2);
    expect(addInfrastructureCapacity(ledger, { key: "fusionReactors", count: 2, incidentId: "build-1" })).toBe(ledger);
    ledger = removeInfrastructureCapacity(ledger, { key: "fusionReactors", count: 1, incidentId: "demolish-1" });
    expect(ledger.totalPoints).toBe(before + 1);
    expect(ledger.incidents.length).toBeLessThanOrEqual(INFRASTRUCTURE_HISTORY_CAP);
  });

  it("preserves absolute damage when damaged grouped capacity is removed", () => {
    const state = createInitialState();
    let ledger = createInfrastructureLedger(state);
    ledger = addInfrastructureCapacity(ledger, {
      key: "fusionReactors",
      count: 2,
      incidentId: "build-damaged-group",
    });
    ledger = applyInfrastructureDamage(ledger, {
      incidentId: "damage-group",
      amount: 0.5,
      assetId: "city:fusionReactors",
    });
    const damaged = ledger.assets["city:fusionReactors"];
    const absoluteDamage = damaged.maxIntegrity - damaged.integrity;
    ledger = removeInfrastructureCapacity(ledger, {
      key: "fusionReactors",
      count: 1,
      incidentId: "remove-damaged-group",
    });
    const remaining = ledger.assets["city:fusionReactors"];
    expect(remaining.maxIntegrity - remaining.integrity).toBeCloseTo(absoluteDamage, 5);
  });

  it("blocks incident replay after the visible activity history rolls over", () => {
    const state = createInitialState();
    let ledger = createInfrastructureLedger(state);
    ledger = applyInfrastructureDamage(ledger, {
      incidentId: "old-stable-id",
      amount: 1,
    });
    for (let index = 0; index <= INFRASTRUCTURE_HISTORY_CAP; index++) {
      ledger = applyInfrastructureDamage(ledger, {
        incidentId: `newer-${index}`,
        amount: 0.01,
      });
    }
    expect(ledger.incidents.some(incident => incident.id === "old-stable-id")).toBe(false);
    const beforeReplay = ledger.intactPoints;
    const replayed = applyInfrastructureDamage(ledger, {
      incidentId: "old-stable-id",
      amount: 1,
    });
    expect(replayed).toBe(ledger);
    expect(replayed.intactPoints).toBe(beforeReplay);
  });

  it("routes generic response damage and repair through the ledger exactly once", () => {
    const state = createInitialState();
    const damaged = applyInfrastructureHealthDelta(
      state,
      -20,
      "test:generic:damage",
      "test damage",
    );
    const afterDamage = damaged.cityStats.infrastructureHealth;
    const repaired = applyResponseEffects(damaged, {
      id: "repair",
      label: "REPAIR",
      effects: { infrastructureHealth: 5 },
    }, { incidentId: "event:test:response:repair" });
    expect(repaired.cityStats.infrastructureHealth).toBeGreaterThan(afterDamage);
    const repeated = applyResponseEffects(repaired, {
      id: "repair",
      label: "REPAIR",
      effects: { infrastructureHealth: 5 },
    }, { incidentId: "event:test:response:repair" });
    expect(repeated.infrastructureLedger).toBeDefined();
    expect(repeated.infrastructureLedger?.incidents.filter(
      (incident) => incident.id === "event:test:response:repair",
    )).toHaveLength(1);
    expect(repeated.cityStats.infrastructureHealth).toBe(repaired.cityStats.infrastructureHealth);
  });

  it("uses the resolved event id as the stable incident key", () => {
    const state = createInitialState();
    state.infrastructureLedger = applyInfrastructureHealthDelta(
      state,
      -10,
      "test:event:seed",
    ).infrastructureLedger;
    const event = {
      id: "test-event",
      title: "TEST EVENT",
      severity: "high" as const,
      effects: {},
      timestamp: 0,
      resolved: false,
    };
    state.activeEvents = [event];
    const response = {
      id: "strike",
      label: "STRIKE",
      effects: { infrastructureHealth: -4 },
    };
    const once = applyEventResponse(state, event.id, response);
    const twice = applyEventResponse(once, event.id, response);
    expect(twice).toBe(once);
    expect(once.infrastructureLedger?.incidents.filter(
      (incident) => incident.id === "event:test-event:response:strike",
    )).toHaveLength(1);
  });

  it("allows recurring repair and degradation sources to share the ledger", () => {
    const state = createInitialState();
    const degraded = applyInfrastructureHealthDelta(
      state,
      -12,
      "tick:12:recurring:infrastructure",
      "recurring degradation",
    );
    const repaired = applyInfrastructureHealthDelta(
      degraded,
      3,
      "tick:13:recurring:infrastructure",
      "recurring authorized repair",
    );
    expect(repaired.cityStats.infrastructureHealth).toBeGreaterThan(
      degraded.cityStats.infrastructureHealth,
    );
    expect(repaired.infrastructureLedger?.incidents.map((incident) => incident.id)).toEqual(
      expect.arrayContaining([
        "tick:12:recurring:infrastructure",
        "tick:13:recurring:infrastructure",
      ]),
    );
    expect(applyInfrastructureHealthDelta(
      repaired,
      3,
      "tick:13:recurring:infrastructure",
    ).cityStats.infrastructureHealth).toBe(repaired.cityStats.infrastructureHealth);
  });
});
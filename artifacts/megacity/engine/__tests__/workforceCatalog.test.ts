import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { getWorkforceCatalog, getWorkforceRole } from "@/engine/workforceCatalog";
import { admitCustodyGroup } from "@/engine/custody";

describe("workforce catalog", () => {
  it("calculates representative roles from their declared source", () => {
    const state = createInitialState();
    state.buildings.syntheticFoodPlants = 2;
    state.units.factoryWorkerCrews = 11;
    state.units.materialsProcessingTeams = 4;
    state.miningOperations = [{ workers: 37 } as any];

    const catalog = getWorkforceCatalog(state);

    expect(getWorkforceRole(catalog, "food_workers")).toMatchObject({
      value: 175,
      source: "buildings",
      sourceLabel: "building capacity",
    });
    expect(getWorkforceRole(catalog, "factory_workers")).toMatchObject({
      value: 15,
      source: "units",
      sourceLabel: "unit roster",
    });
    expect(getWorkforceRole(catalog, "mining_site_workers")).toMatchObject({
      value: 37,
      source: "mining_operations",
      reconciliation: "external-job-slots",
    });
  });

  it("tracks source changes without changing the population workforce", () => {
    const state = createInitialState();
    const before = getWorkforceCatalog(state);

    state.buildings.syntheticFoodPlants = 3;
    state.localEconomy = {
      ...(state.localEconomy as any),
      totalEmployees: 240,
      chainEmployees: 90,
    };
    const after = getWorkforceCatalog(state);

    expect(after.employedCitizens).toBe(before.employedCitizens);
    expect(after.localEconomyJobs).toBe(240);
    expect(after.indieBusinessJobs).toBe(150);
    expect(after.corporateChainJobs).toBe(90);
    expect(after.localEconomyJobs).not.toBe(after.employedCitizens);
    expect(getWorkforceRole(after, "food_workers")?.value).toBe(235);
  });

  it("reconciles totals without double-counting local or mining subsets", () => {
    const state = createInitialState();
    state.localEconomy = {
      ...(state.localEconomy as any),
      totalEmployees: 500,
      chainEmployees: 125,
    };
    state.miningOperations = [{ workers: 80 }, { workers: 20 }] as any;

    const catalog = getWorkforceCatalog(state);
    const sectorSum = Object.values(catalog.sectorTotals).reduce((sum, value) => sum + value, 0);

    expect(catalog.sectorTotal).toBe(sectorSum);
    expect(catalog.reconciliation.countedJobSlots).toBe(catalog.employedCitizens);
    expect(catalog.reconciliation.includedSubsetJobs).toBe(500);
    expect(catalog.miningJobs).toBe(100);
    expect(catalog.reconciliation.unallocatedSectorJobs).toBe(
      catalog.sectorTotal - catalog.directDetailedRoleTotal,
    );
  });

  it("keeps legacy saves valid when derived role fields are absent", () => {
    const state = createInitialState();
    const legacy = {
      ...state,
      demographics: {
        ...state.demographics,
        totalWorkforce: undefined,
        industrialWorkforce: undefined,
        serviceWorkforce: undefined,
      },
    } as any;

    const migrated = migrateState(legacy);
    const catalog = getWorkforceCatalog(migrated);

    expect(catalog.employedCitizens).toBeGreaterThan(0);
    expect(catalog.sectorTotals.industrial).toBeGreaterThanOrEqual(0);
    expect(catalog.roles.every((role) => Number.isFinite(role.value))).toBe(true);
  });

  it("uses authoritative incarceration for inmate and guard roles", () => {
    const state = createInitialState();
    state.custody = undefined;
    state.buildings.megaPrisonComplexes = 50;
    admitCustodyGroup(state, "custody-workforce", {
      id: "sentenced-group",
      count: 61,
      role: "civilian",
      legalStatus: "sentenced",
      originKind: "unknown",
      originId: null,
      originLabel: "Not applicable",
    });
    admitCustodyGroup(state, "pow-workforce", {
      id: "pow-group",
      count: 30,
      role: "pow",
      legalStatus: "military",
      originKind: "unknown",
      originId: null,
      originLabel: "Unknown origin",
    });
    const catalog = getWorkforceCatalog(state);
    expect(getWorkforceRole(catalog, "prisoners")?.value).toBe(61);
    expect(getWorkforceRole(catalog, "prison_guards")?.value).toBe(4);
  });
});
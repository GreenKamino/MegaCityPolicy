import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  FACTION_DEMAND_COOLDOWN,
  FACTION_DEMAND_INTERVAL,
  applyFactionDemandResponse,
  makeFactionDemandEvent,
  makeAdministrativeDemandEvent,
  processFactionDemands,
  selectAdministrativeDemandKind,
} from "@/engine/factionDemands";
import { applyEventResponse } from "@/engine/eventResolution";
import { ADMINISTRATIVE_BLOC_ID } from "@/engine/administrativeBloc";
import type { GameState } from "@/engine/types";

const stateAt = (tick: number): GameState => ({
  ...createInitialState(),
  totalTicks: tick,
  gameplayMode: "realtime",
});

describe("faction demands", () => {
  it("does not interrupt turn-based mode or the early game", () => {
    expect(processFactionDemands({ ...stateAt(FACTION_DEMAND_INTERVAL), gameplayMode: "turnbased" })).toBeNull();
    expect(processFactionDemands(stateAt(FACTION_DEMAND_INTERVAL - 1))).toBeNull();
  });

  it("presents one active faction demand on the Free-mode cadence", () => {
    const event = processFactionDemands(stateAt(FACTION_DEMAND_INTERVAL));
    expect(event).not.toBeNull();
    expect(event?.id).toMatch(/^faction-demand-/);
    expect(event?.factionId).toBeTruthy();
    expect(event?.responseOptions).toHaveLength(3);
    expect(event?.responseOptions?.map((response) => response.label)).toEqual([
      "CONCEDE",
      "NEGOTIATE A COMPROMISE",
      "RESIST",
    ]);
    expect(event?.description).toMatch(/\. /);
    expect(event?.responseOptions?.every((response) => !Object.hasOwn(response, "description"))).toBe(true);
  });

  it("does not duplicate a visible demand or reissue one during cooldown", () => {
    const first = processFactionDemands(stateAt(FACTION_DEMAND_INTERVAL))!;
    const onlyFaction = first.factionId;
    const oneFaction = (tick: number): GameState => ({
      ...stateAt(tick),
      factions: stateAt(tick).factions.map((faction) => ({
        ...faction,
        isActive: faction.id === onlyFaction,
      })),
    });
    const visible = {
      ...oneFaction(FACTION_DEMAND_INTERVAL),
      activeEvents: [first],
    };
    expect(processFactionDemands(visible)).toBeNull();

    const cooled = {
      ...oneFaction(FACTION_DEMAND_INTERVAL * 2),
      eventTriggerCooldowns: {
        [`faction-demand-${first.factionId}`]: FACTION_DEMAND_INTERVAL * 2 - FACTION_DEMAND_COOLDOWN + 1,
      },
    };
    expect(processFactionDemands(cooled)).toBeNull();
    expect(
      processFactionDemands({
        ...cooled,
        eventTriggerCooldowns: {
          [`faction-demand-${first.factionId}`]: cooled.totalTicks - FACTION_DEMAND_COOLDOWN,
        },
      }),
    ).not.toBeNull();
  });

  it("skips inactive factions and applies the three relationship outcomes", () => {
    const base = stateAt(FACTION_DEMAND_INTERVAL);
    const faction = base.factions.find((candidate) => candidate.isActive && candidate.type !== "institutional")!;
    const inactiveState = {
      ...base,
      factions: base.factions.map((candidate) => ({ ...candidate, isActive: false })),
    };
    expect(processFactionDemands(inactiveState)).toBeNull();

    const event = makeFactionDemandEvent(base, faction);
    const original = base.factions.find((candidate) => candidate.id === faction.id)!;
    for (const [index, expected] of [[0, 8], [1, 3], [2, -7]] as const) {
      const result = applyFactionDemandResponse(base, event, event.responseOptions![index]);
      const changed = result.factions.find((candidate) => candidate.id === faction.id)!;
      expect(changed.loyalty - original.loyalty).toBe(expected);
    }
  });

  it("selects deterministic Administrative Bloc demands from live pressure conditions", () => {
    const base = stateAt(FACTION_DEMAND_INTERVAL);
    base.administrativeInstitutions!.workloadPressure = 80;
    base.administrativeInstitutions!.overallEffectiveness = 40;
    base.officers = base.officers.map(officer => ({ ...officer, appointed: true }));
    expect(selectAdministrativeDemandKind(base)).toBe("workload");

    expect(selectAdministrativeDemandKind({
      ...base,
      cityStats: { ...base.cityStats, corruption: 70 },
    })).toBe("corruption");
    expect(selectAdministrativeDemandKind({
      ...base,
      resources: { ...base.resources, credits: 20_000 },
    })).toBe("treasury");
    expect(selectAdministrativeDemandKind({
      ...base,
      cityStats: { ...base.cityStats, lawOrder: 20, crime: 75 },
    })).toBe("law_order");
  });

  it("offers legible reform choices with materially different institutional outcomes", () => {
    const base = stateAt(FACTION_DEMAND_INTERVAL);
    base.cityStats.corruption = 70;
    base.administrativeInstitutions!.pressure = 80;
    const bloc = base.factions.find(candidate => candidate.id === ADMINISTRATIVE_BLOC_ID)!;
    const event = makeAdministrativeDemandEvent(base, bloc);
    expect(event.responseOptions).toHaveLength(4);
    expect(event.description).toMatch(/^Corruption exposure exceeds audit and legal coverage\. Pressure \d+\/100 · workload \d+ · effectiveness \d+\.$/);
    expect(event.responseOptions?.every(response => response.description === undefined)).toBe(true);

    const watchdogs = event.responseOptions!.find(response => response.administrativeReform === "watchdog_expansion")!;
    const shield = event.responseOptions!.find(response => response.id.endsWith("-shield"))!;
    const watchdogState = applyFactionDemandResponse(base, event, watchdogs);
    const shieldState = applyFactionDemandResponse(base, event, shield);
    expect(watchdogState.administrativeInstitutions!.reformDirection).toBe("watchdog_expansion");
    expect(watchdogState.administrativeInstitutions!.cohorts.auditing.independence)
      .toBeGreaterThan(shieldState.administrativeInstitutions!.cohorts.auditing.independence);
    expect(watchdogState.factions.find(faction => faction.id === ADMINISTRATIVE_BLOC_ID)!.loyalty)
      .toBeGreaterThan(shieldState.factions.find(faction => faction.id === ADMINISTRATIVE_BLOC_ID)!.loyalty);
  });

  it("resolves administrative choices once, stamps cooldown, and applies city and reform effects", () => {
    const base = stateAt(FACTION_DEMAND_INTERVAL);
    base.cityStats.corruption = 70;
    const bloc = base.factions.find(candidate => candidate.id === ADMINISTRATIVE_BLOC_ID)!;
    const event = makeAdministrativeDemandEvent(base, bloc);
    base.activeEvents = [event];
    const prosecution = event.responseOptions!.find(response => response.administrativeReform === "public_prosecution")!;
    const next = applyEventResponse(base, event.id, prosecution);
    expect(next.cityStats.corruption).toBeLessThan(base.cityStats.corruption);
    expect(next.cityStats.lawOrder).toBeGreaterThan(base.cityStats.lawOrder);
    expect(next.resources.credits).toBeLessThan(base.resources.credits);
    expect(next.administrativeInstitutions!.reformDirection).toBe("public_prosecution");
    expect(next.eventTriggerCooldowns?.[event.id]).toBe(base.totalTicks);
    expect(applyEventResponse(next, event.id, prosecution)).toBe(next);
  });
});
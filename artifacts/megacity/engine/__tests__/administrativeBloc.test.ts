import { describe, expect, it } from "vitest";

import {
  ADMINISTRATIVE_BLOC_COLOR,
  ADMINISTRATIVE_BLOC_DOMAINS,
  ADMINISTRATIVE_BLOC_ID,
  ADMINISTRATIVE_BLOC_NAME,
  ADMINISTRATIVE_BLOC_ROLE,
  createAdministrativeBloc,
} from "@/engine/administrativeBloc";
import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import { runTick } from "@/engine/formulas";

describe("Administrative Bloc", () => {
  it("starts as a coherent internal institutional faction", () => {
    const state = createInitialState();
    const bloc = state.factions.find((f) => f.id === ADMINISTRATIVE_BLOC_ID);

    expect(bloc).toBeDefined();
    expect(bloc).toMatchObject({
      id: ADMINISTRATIVE_BLOC_ID,
      name: ADMINISTRATIVE_BLOC_NAME,
      type: "institutional",
      isActive: true,
      influence: 58,
      loyalty: 62,
      threat: 18,
      color: ADMINISTRATIVE_BLOC_COLOR,
      mechanicalRole: ADMINISTRATIVE_BLOC_ROLE,
      institutionalPresence: 72,
    });
    expect(bloc?.domains).toEqual([...ADMINISTRATIVE_BLOC_DOMAINS]);
    expect(bloc?.domains).toEqual(
      expect.arrayContaining([
        "administration",
        "inspection",
        "legal",
        "auditing",
        "finance",
        "procurement",
      ]),
    );
  });

  it("has a stable, reusable identity factory", () => {
    const first = createAdministrativeBloc();
    const second = createAdministrativeBloc();

    expect(first).toEqual(second);
    expect(first.domains).not.toBe(second.domains);
    expect(first.type).toBe("institutional");
    expect(first.leader).toBeUndefined();
  });

  it("repairs a legacy save that predates the Bloc without resetting other factions", () => {
    const fresh = createInitialState();
    const legacy = {
      ...fresh,
      factions: fresh.factions
        .filter((f) => f.id !== ADMINISTRATIVE_BLOC_ID)
        .map((f) => (f.id === "judges" ? { ...f, loyalty: 13, threat: 77 } : f)),
    };

    const migrated = migrateState(legacy);
    const bloc = migrated.factions.find((f) => f.id === ADMINISTRATIVE_BLOC_ID);
    const judges = migrated.factions.find((f) => f.id === "judges");

    expect(bloc).toBeDefined();
    expect(bloc?.type).toBe("institutional");
    expect(bloc?.domains).toEqual([...ADMINISTRATIVE_BLOC_DOMAINS]);
    expect(judges).toMatchObject({ loyalty: 13, threat: 77 });
  });

  it("backfills a save with no faction array at all", () => {
    const legacy = { ...createInitialState(), factions: undefined } as any;
    const migrated = migrateState(legacy);
    const bloc = migrated.factions.find((f) => f.id === ADMINISTRATIVE_BLOC_ID);

    expect(bloc).toBeDefined();
    expect(bloc?.institutionalPresence).toBe(72);
  });

  it("preserves a present Bloc's player-tuned values while restoring identity metadata", () => {
    const fresh = createInitialState();
    const legacy = {
      ...fresh,
      factions: fresh.factions.map((f) =>
        f.id === ADMINISTRATIVE_BLOC_ID
          ? {
              ...f,
              name: "Renamed Civic Office",
              influence: 91,
              loyalty: 24,
              threat: 68,
              color: undefined,
              domains: undefined,
              mechanicalRole: undefined,
              institutionalPresence: 41,
            }
          : f,
      ),
    };

    const migrated = migrateState(legacy);
    const bloc = migrated.factions.find((f) => f.id === ADMINISTRATIVE_BLOC_ID);

    expect(bloc).toMatchObject({
      name: "Renamed Civic Office",
      influence: 91,
      loyalty: 24,
      threat: 68,
      institutionalPresence: 41,
      color: ADMINISTRATIVE_BLOC_COLOR,
      domains: [...ADMINISTRATIVE_BLOC_DOMAINS],
      mechanicalRole: ADMINISTRATIVE_BLOC_ROLE,
    });
  });

  it("participates in the normal full-tick faction update", () => {
    const state = createInitialState();
    state.totalTicks = 1;
    const before = state.factions.find((f) => f.id === ADMINISTRATIVE_BLOC_ID)!;

    const { newState } = runTick(state);
    const after = newState.factions.find((f) => f.id === ADMINISTRATIVE_BLOC_ID);

    expect(after).toBeDefined();
    expect(after?.loyalty).toBe(before.loyalty + 1);
    expect(after?.threat).toBe(before.threat - 1);
    expect(after?.influence).toBe(before.influence);
    expect(after?.institutionalPresence).toBe(before.institutionalPresence);
  });
});

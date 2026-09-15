import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  LAW_MISSIONS,
  LAW_OPERATION_COOLDOWN_TICKS,
  dispatchLawOperation,
} from "@/engine/lawOpsData";

describe("dispatchLawOperation", () => {
  it("spends the catalog cost and applies catalog outcomes on success", () => {
    const before = createInitialState();
    const mission = LAW_MISSIONS.find((item) => item.id === "underhive_sweep")!;
    before.units.patrolJudges = mission.requiredUnits;
    before.cityStats.crime = 50;
    before.cityStats.lawOrder = 40;

    const result = dispatchLawOperation(before, mission.id, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.resources.credits).toBe(before.resources.credits - mission.cost);
    expect(result.state.cityStats.crime).toBe(50 - mission.crimeReduction);
    expect(result.state.cityStats.lawOrder).toBe(40 + mission.lawBonus);
    expect(result.state.pendingTickEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Law Field Operation", delta: -mission.cost }),
    ]));
  });

  it("keeps credit and unit failures distinct without mutating state", () => {
    const mission = LAW_MISSIONS[0];
    const noCredits = createInitialState();
    noCredits.resources.credits = mission.cost - 1;
    expect(dispatchLawOperation(noCredits, mission.id, 0)).toEqual({
      ok: false,
      reason: "insufficient_credits",
      cooldownRemaining: undefined,
    });

    const noUnits = createInitialState();
    noUnits.units = {} as typeof noUnits.units;
    expect(dispatchLawOperation(noUnits, mission.id, 0)).toEqual({
      ok: false,
      reason: "insufficient_units",
      cooldownRemaining: undefined,
    });
  });

  it("uses risk to resolve failure and enforces a durable tick cooldown", () => {
    const before = createInitialState();
    const mission = LAW_MISSIONS.find((item) => item.risk === "extreme")!;
    before.units.patrolJudges = mission.requiredUnits;
    const failed = dispatchLawOperation(before, mission.id, 0.99);

    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.success).toBe(false);
    expect(failed.state.cityStats.crime).toBe(before.cityStats.crime);
    expect(failed.state.cityStats.lawOrder).toBe(before.cityStats.lawOrder);
    expect(failed.cooldownUntilTick).toBe(before.totalTicks + LAW_OPERATION_COOLDOWN_TICKS);

    expect(dispatchLawOperation(failed.state, mission.id, 0)).toEqual({
      ok: false,
      reason: "cooldown",
      cooldownRemaining: LAW_OPERATION_COOLDOWN_TICKS,
    });

    const cooled = {
      ...failed.state,
      totalTicks: failed.cooldownUntilTick,
    };
    expect(dispatchLawOperation(cooled, mission.id, 0).ok).toBe(true);
  });
});
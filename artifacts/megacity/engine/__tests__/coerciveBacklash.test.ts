import { describe, expect, it } from "vitest";
import {
  applyCoerciveBacklash,
  getCoerciveBacklashPreview,
  isCoerciveActionId,
} from "../coerciveBacklash";
import { createInitialState } from "../initialState";
import { migrateState } from "../saveLoad";
import type { GameState } from "../types";

function stateWithTargets(): GameState {
  const state = createInitialState();
  state.cityStats.happiness = 60;
  state.cityStats.unrest = 10;
  state.diplomaticReputation = 70;
  state.factions = [
    { ...state.factions[0], id: "internal-law", name: "The Authority", loyalty: 80, threat: 10, scope: "internal" },
  ];
  state.externalMegacities = [{
    ...state.externalMegacities[0],
    id: "target-city",
    name: "Target City",
    loyalty: 80,
    threat: 10,
  }];
  return state;
}

describe("coercive backlash", () => {
  it("recognizes coercive actions but leaves peaceful and humanitarian actions alone", () => {
    expect(isCoerciveActionId("purge")).toBe(true);
    expect(isCoerciveActionId("rocket-strike")).toBe(true);
    expect(isCoerciveActionId("arrest_leaders")).toBe(true);
    expect(isCoerciveActionId("compulsory-civic-service")).toBe(true);
    expect(isCoerciveActionId("weaponize-scarcity")).toBe(true);
    expect(isCoerciveActionId("stage-public-tribunals")).toBe(true);
    expect(isCoerciveActionId("population-transfer-orders")).toBe(true);
    expect(isCoerciveActionId("send-aid")).toBe(false);
    expect(isCoerciveActionId("lift_suppression")).toBe(false);
    expect(isCoerciveActionId("trade-agreement")).toBe(false);
  });

  it("applies domestic and targeted foreign consequences with normal clamps", () => {
    const before = stateWithTargets();
    const after = applyCoerciveBacklash(before, {
      actionId: "bombardment",
      actionKey: "strike:one",
      targetId: "target-city",
      targetName: "Target City",
      scope: "targeted",
      audience: "external",
    });

    expect(after.cityStats.happiness).toBeLessThan(before.cityStats.happiness);
    expect(after.cityStats.unrest).toBeGreaterThan(before.cityStats.unrest);
    expect(after.externalMegacities[0].loyalty).toBeLessThan(before.externalMegacities[0].loyalty);
    expect(after.externalMegacities[0].threat).toBeGreaterThan(before.externalMegacities[0].threat);
    expect(after.messages[0].title).toContain("BACKLASH");
    expect(after.cityStats.happiness).toBeGreaterThanOrEqual(0);
    expect(after.cityStats.unrest).toBeLessThanOrEqual(100);
  });

  it("previews the same targeted political deltas that the reducer applies", () => {
    const before = stateWithTargets();
    const preview = getCoerciveBacklashPreview("seize-assets", "targeted", "internal");
    expect(preview).toEqual({
      severity: "moderate",
      happinessDelta: -1,
      unrestDelta: 2,
      diplomaticReputationDelta: -1,
      targetLoyaltyDelta: -6,
      targetThreatDelta: 4,
      otherFactionLoyaltyDelta: -1,
      otherFactionThreatDelta: 1,
      districtCrimeDelta: 1,
      unrelatedExternalLoyaltyDelta: 0,
      unrelatedExternalThreatDelta: 0,
    });

    const after = applyCoerciveBacklash(before, {
      actionId: "seize-assets",
      actionKey: "faction:seize-assets",
      targetId: "internal-law",
      audience: "internal",
      scope: "targeted",
    });
    expect(after.cityStats.happiness - before.cityStats.happiness).toBe(preview!.happinessDelta);
    expect(after.cityStats.unrest - before.cityStats.unrest).toBe(preview!.unrestDelta);
    expect((after.diplomaticReputation ?? 0) - (before.diplomaticReputation ?? 0))
      .toBe(preview!.diplomaticReputationDelta);
    expect(after.factions[0].loyalty - before.factions[0].loyalty).toBe(preview!.targetLoyaltyDelta);
    expect(after.factions[0].threat - before.factions[0].threat).toBe(preview!.targetThreatDelta);
  });

  it("is idempotent for a replayed action key", () => {
    const before = stateWithTargets();
    const once = applyCoerciveBacklash(before, {
      actionId: "purge",
      actionKey: "event:123:purge",
      scope: "citywide",
      audience: "population",
    });
    const twice = applyCoerciveBacklash(once, {
      actionId: "purge",
      actionKey: "event:123:purge",
      scope: "citywide",
      audience: "population",
    });

    expect(twice).toBe(once);
    expect(twice.cityStats).toEqual(once.cityStats);
    expect(twice.messages).toHaveLength(once.messages.length);
  });

  it("normalizes the persisted action ledger through save migration", () => {
    const state = stateWithTargets();
    state.coerciveBacklashLog = ["strike:one", "strike:one", 42 as unknown as string, ""];
    const loaded = migrateState(state);
    expect(loaded.coerciveBacklashLog).toEqual(["strike:one"]);
  });
});
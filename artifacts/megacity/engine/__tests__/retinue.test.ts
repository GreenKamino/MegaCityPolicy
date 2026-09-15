import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { sanitizeState } from "@/engine/sanitizer";
import {
  appointSquadCaptain,
  assignSquadDeputy,
  dismissCaptain,
  disbandSquad,
  getSquadDeploymentPreview,
  getSquadCompositionBreakdown,
  getTroopPromotionPreview,
  getTroopTrainingPreview,
  startTraining,
} from "@/engine/retinue";
import {
  createDefaultRetinueState,
  LEADERLESS_SQUAD_POWER_MULTIPLIER,
  type Captain,
  type Squad,
  type Troop,
} from "@/engine/retinueData";

function captain(id: string, squadId = ""): Captain {
  return {
    id,
    name: id,
    title: "Captain",
    level: 1,
    xp: 0,
    xpToNext: 100,
    leadership: 10,
    combat: 8,
    tactics: 5,
    loyalty: 50,
    squadId,
    kills: 0,
    battlesWon: 0,
    battlesLost: 0,
    trait: "tactician",
    status: "active",
    equippedItemIds: [],
    hiredTick: 0,
  };
}

function makeState(withDeputy = false) {
  const state = createInitialState();
  const squad: Squad = {
    id: "squad-1",
    name: "First Watch",
    role: "assault",
    doctrine: "balanced",
    captainId: "captain-1",
    deputyCaptainId: withDeputy ? "captain-2" : null,
    troopIds: ["troop-1"],
    maxSize: 8,
    formationBonus: 0,
    totalKills: 0,
    deploymentsCompleted: 0,
    created: 0,
  };
  const troop: Troop = {
    id: "troop-1",
    classId: "infantry",
    tier: "enforcer",
    level: 1,
    xp: 0,
    xpToNext: 100,
    hp: 100,
    maxHp: 100,
    combat: 10,
    morale: 100,
    kills: 0,
    missionsCompleted: 0,
    status: "ready",
    squadId: squad.id,
    hiredTick: 0,
  };
  state.retinue = {
    ...createDefaultRetinueState(),
    squads: [squad],
    captains: [captain("captain-1", squad.id), captain("captain-2")],
    troops: [troop],
  };
  return state;
}

describe("squad captain succession", () => {
  it("promotes an assigned deputy without losing the troop roster", () => {
    const state = makeState(true);

    expect(dismissCaptain(state, "captain-1")).toEqual({ success: true });
    expect(state.retinue!.squads[0].captainId).toBe("captain-2");
    expect(state.retinue!.squads[0].deputyCaptainId).toBeNull();
    expect(state.retinue!.squads[0].troopIds).toEqual(["troop-1"]);
    expect(state.retinue!.troops[0].squadId).toBe("squad-1");
  });

  it("keeps a squad leaderless when there is no eligible replacement", () => {
    const state = makeState();
    const before = getSquadCompositionBreakdown(state, "squad-1");

    state.retinue!.captains[1].status = "kia";
    expect(dismissCaptain(state, "captain-1")).toEqual({ success: true });

    const squad = state.retinue!.squads[0];
    const after = getSquadCompositionBreakdown(state, squad.id);
    expect(squad.captainId).toBeNull();
    expect(squad.troopIds).toEqual(["troop-1"]);
    expect(state.retinue!.troops[0].squadId).toBe(squad.id);
    expect(after.leaderless).toBe(true);
    expect(after.combatPower).toBe(Math.round(after.preDoctrinePower * LEADERLESS_SQUAD_POWER_MULTIPLIER));
    expect(after.statusMessages.join(" ")).toContain("LEADERLESS");
  });

  it("allows an eligible captain to restore a leaderless squad", () => {
    const state = makeState();
    dismissCaptain(state, "captain-1");

    expect(appointSquadCaptain(state, "squad-1", "captain-2")).toEqual({ success: true });
    expect(state.retinue!.squads[0].captainId).toBe("captain-2");
    expect(state.retinue!.captains.find(c => c.id === "captain-2")!.squadId).toBe("squad-1");
    expect(getSquadCompositionBreakdown(state, "squad-1").leaderless).toBe(false);
  });

  it("assigns a deputy only once and rejects captains assigned elsewhere", () => {
    const state = makeState();
    expect(assignSquadDeputy(state, "squad-1", "captain-2")).toEqual({ success: true });
    expect(assignSquadDeputy(state, "squad-1", "captain-2")).toEqual({ success: true });

    state.retinue!.squads.push({
      ...state.retinue!.squads[0],
      id: "squad-2",
      captainId: null,
      deputyCaptainId: null,
      troopIds: [],
    });
    expect(assignSquadDeputy(state, "squad-2", "captain-2")).toEqual({
      success: false,
      error: "Captain is already assigned to another squad",
    });
  });

  it("only disbanding intentionally clears squad assignments", () => {
    const state = makeState();

    expect(disbandSquad(state, "squad-1")).toEqual({ success: true });
    expect(state.retinue!.squads).toHaveLength(0);
    expect(state.retinue!.troops[0].squadId).toBeNull();
    expect(state.retinue!.captains[0].squadId).toBe("");
  });

  it("backfills the deputy field on legacy squad saves", () => {
    const state = makeState();
    delete state.retinue!.squads[0].deputyCaptainId;

    expect(sanitizeState(state).retinue!.squads[0].deputyCaptainId).toBeNull();
  });
});

describe("retinue action cost and timing previews", () => {
  it("shows promotion credits and field resources without changing the troop", () => {
    const state = makeState();
    const troop = state.retinue!.troops[0];
    troop.xp = 400;
    state.resources.credits = 10_000;
    state.stockpiles.steel = 20;
    state.stockpiles.ammo = 40;

    const preview = getTroopPromotionPreview(state, troop.id);
    expect(preview.canAct).toBe(true);
    expect(preview.timing.kind).toBe("instant");
    expect(preview.timing.upfrontCostCredits).toBe(1_200);
    expect(preview.timing.resourceCosts).toEqual([
      { resource: "steel", amount: 15 },
      { resource: "ammo", amount: 30 },
    ]);
    expect(preview.timing.cancellation).toBe("unavailable");
    expect(troop.tier).toBe("enforcer");
  });

  it("switches the training preview to active remaining time after queueing", () => {
    const state = makeState();
    const troop = state.retinue!.troops[0];
    state.resources.credits = 100;

    const available = getTroopTrainingPreview(state, troop.id);
    expect(available.timing.durationTicks).toBe(8);
    expect(available.timing.activeTicksRemaining).toBeNull();
    expect(available.canAct).toBe(true);

    expect(startTraining(state, troop.id)).toEqual({ success: true });
    const active = getTroopTrainingPreview(state, troop.id);
    expect(active.timing.phase).toBe("active");
    expect(active.timing.activeTicksRemaining).toBe(8);
    expect(active.reason).toBe("Already training");
  });

  it("includes launch duration, cancellation, and active remaining time", () => {
    const state = makeState();
    const preview = getSquadDeploymentPreview(state, "squad-1", "recon_sweep");
    expect(preview).not.toBeNull();
    expect(preview!.timing.durationTicks).toBe(preview!.duration);
    expect(preview!.timing.cancellation).toBe("unavailable");

    state.retinue!.activeOperation = {
      id: "op-1",
      operationId: "recon_sweep",
      squadId: "squad-1",
      squadName: "First Watch",
      startedTick: 0,
      ticksRemaining: 3,
      resolution: {
        squadId: "squad-1",
        success: true,
        duration: preview!.duration,
        casualties: 0,
        successChance: preview!.successChance,
        combatPower: preview!.combatPower,
        readyTroopCount: preview!.readyTroopCount,
        doctrineModifiers: preview!.doctrineModifiers,
      },
    };
    const active = getSquadDeploymentPreview(state, "squad-1", "recon_sweep");
    expect(active!.timing.phase).toBe("active");
    expect(active!.timing.activeTicksRemaining).toBe(3);
  });
});
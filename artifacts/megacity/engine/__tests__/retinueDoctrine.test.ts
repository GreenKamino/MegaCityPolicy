import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { sanitizeState } from "@/engine/sanitizer";
import {
  DEFAULT_SQUAD_DOCTRINE,
  SQUAD_DOCTRINES,
  createDefaultRetinueState,
  type Squad,
} from "@/engine/retinueData";
import {
  getSquadCombatPower,
  getSquadDoctrineModifiers,
  getSquadDeploymentPreview,
  launchSquadOperation,
  processRetinueTick,
  resolveSquadDeployment,
  setSquadDoctrine,
} from "@/engine/retinue";

function makeSquad(doctrine?: Squad["doctrine"]): Squad {
  return {
    id: "squad-doctrine-test",
    name: "Doctrine Test Squad",
    role: "assault",
    doctrine,
    captainId: null,
    troopIds: ["troop-doctrine-test"],
    maxSize: 8,
    formationBonus: 0,
    totalKills: 0,
    deploymentsCompleted: 0,
    created: 0,
  };
}

function makeState(doctrine?: Squad["doctrine"]) {
  const state = createInitialState();
  state.retinue = {
    ...createDefaultRetinueState(),
    squads: [makeSquad(doctrine)],
    troops: [{
      id: "troop-doctrine-test",
      classId: "infantry",
      tier: "enforcer",
      level: 1,
      xp: 0,
      xpToNext: 100,
      hp: 100,
      maxHp: 100,
      combat: 100,
      morale: 100,
      kills: 0,
      missionsCompleted: 0,
      status: "ready",
      squadId: "squad-doctrine-test",
      hiredTick: 0,
    }],
  };
  return state;
}

describe("squad doctrines", () => {
  it("covers every doctrine with deterministic power and risk tradeoffs", () => {
    const state = makeState();
    const basePower = getSquadCombatPower(state, "squad-doctrine-test");

    for (const doctrine of SQUAD_DOCTRINES) {
      state.retinue!.squads[0].doctrine = doctrine.id;
      expect(getSquadCombatPower(state, "squad-doctrine-test")).toBe(
        Math.round(basePower * doctrine.powerMultiplier),
      );
      expect(getSquadDoctrineModifiers(state, "squad-doctrine-test")).toEqual({
        powerMultiplier: doctrine.powerMultiplier,
        casualtyRiskMultiplier: doctrine.casualtyRiskMultiplier,
        operationSpeedMultiplier: doctrine.operationSpeedMultiplier,
      });
    }

    expect(SQUAD_DOCTRINES.map(d => d.id)).toEqual(["balanced", "assault", "defensive", "recon"]);
    expect(SQUAD_DOCTRINES.find(d => d.id === "assault")!.powerMultiplier).toBeGreaterThan(1);
    expect(SQUAD_DOCTRINES.find(d => d.id === "assault")!.casualtyRiskMultiplier).toBeGreaterThan(1);
    expect(SQUAD_DOCTRINES.find(d => d.id === "defensive")!.powerMultiplier).toBeLessThan(1);
    expect(SQUAD_DOCTRINES.find(d => d.id === "defensive")!.casualtyRiskMultiplier).toBeLessThan(1);
    expect(SQUAD_DOCTRINES.find(d => d.id === "recon")!.casualtyRiskMultiplier).toBeLessThan(1);
  });

  it("changes a squad doctrine through the engine action", () => {
    const state = makeState();
    expect(setSquadDoctrine(state, "squad-doctrine-test", "defensive")).toEqual({ success: true });
    expect(state.retinue!.squads[0].doctrine).toBe("defensive");
    expect(setSquadDoctrine(state, "squad-doctrine-test", "not-a-doctrine" as never)).toEqual({
      success: false,
      error: "Unknown squad doctrine",
    });
    expect(setSquadDoctrine(state, "missing-squad", "recon")).toEqual({
      success: false,
      error: "Squad not found",
    });
  });

  it("backfills a neutral doctrine for legacy and invalid squad records", () => {
    const legacy = makeState();
    delete legacy.retinue!.squads[0].doctrine;
    const malformed = makeState("not-a-doctrine" as never);

    expect(sanitizeState(legacy).retinue!.squads[0].doctrine).toBe(DEFAULT_SQUAD_DOCTRINE);
    expect(sanitizeState(malformed).retinue!.squads[0].doctrine).toBe(DEFAULT_SQUAD_DOCTRINE);
  });

  it("applies each doctrine to squad deployment success, duration, and casualties", () => {
    const state = makeState();
    const squad = state.retinue!.squads[0];
    for (let i = 2; i <= 7; i++) {
      const troopId = `troop-doctrine-test-${i}`;
      squad.troopIds.push(troopId);
      state.retinue!.troops.push({
        ...state.retinue!.troops[0],
        id: troopId,
        squadId: squad.id,
      });
    }
    const spec = { duration: 20, difficulty: 40, casualtyRate: 0.6 };

    const balanced = resolveSquadDeployment(state, "squad-doctrine-test", spec, () => 0)!;
    state.retinue!.squads[0].doctrine = "assault";
    const assault = resolveSquadDeployment(state, "squad-doctrine-test", spec, () => 0)!;
    state.retinue!.squads[0].doctrine = "defensive";
    const defensive = resolveSquadDeployment(state, "squad-doctrine-test", spec, () => 0)!;
    state.retinue!.squads[0].doctrine = "recon";
    const recon = resolveSquadDeployment(state, "squad-doctrine-test", spec, () => 0)!;

    expect(balanced.success).toBe(true);
    expect(assault.success).toBe(true);
    expect(defensive.success).toBe(true);
    expect(recon.success).toBe(true);

    expect(assault.duration).toBe(19);
    expect(defensive.duration).toBe(25);
    expect(recon.duration).toBe(23);
    expect(assault.duration).toBeLessThan(balanced.duration);
    expect(defensive.duration).toBeGreaterThan(balanced.duration);
    expect(recon.duration).toBeGreaterThan(balanced.duration);

    expect(assault.casualties).toBeGreaterThan(balanced.casualties);
    expect(defensive.casualties).toBeLessThan(balanced.casualties);
    expect(recon.casualties).toBeLessThan(balanced.casualties);
    expect(assault.doctrineModifiers.casualtyRiskMultiplier).toBe(1.2);
    expect(defensive.doctrineModifiers.casualtyRiskMultiplier).toBe(0.7);
    expect(recon.doctrineModifiers.casualtyRiskMultiplier).toBe(0.65);
  });

  it("uses the doctrine-adjusted squad power when resolving success", () => {
    const state = makeState();
    const spec = { duration: 8, difficulty: 65, casualtyRate: 0 };

    state.retinue!.squads[0].doctrine = "assault";
    const assault = resolveSquadDeployment(state, "squad-doctrine-test", spec, () => 0.55)!;
    state.retinue!.squads[0].doctrine = "defensive";
    const defensive = resolveSquadDeployment(state, "squad-doctrine-test", spec, () => 0.55)!;

    expect(assault.combatPower).toBeGreaterThan(defensive.combatPower);
    expect(assault.successChance).toBeGreaterThan(defensive.successChance);
    expect(assault.success).toBe(true);
    expect(defensive.success).toBe(false);
  });

  it("returns no deployment for an unknown squad", () => {
    expect(resolveSquadDeployment(makeState(), "missing-squad", {
      duration: 4,
      difficulty: 20,
      casualtyRate: 0.1,
    }, () => 0)).toBeNull();
  });

  it("launches an eligible operation, marks troops deployed, and records its return", () => {
    const state = makeState();
    const squad = state.retinue!.squads[0];
    const captain = {
      id: "captain-doctrine-test",
      name: "Test Captain",
      title: "Captain",
      level: 1,
      xp: 0,
      xpToNext: 100,
      leadership: 10,
      combat: 8,
      tactics: 8,
      loyalty: 60,
      squadId: squad.id,
      kills: 0,
      battlesWon: 0,
      battlesLost: 0,
      trait: "tactician" as const,
      status: "active" as const,
      equippedItemIds: [],
      hiredTick: 0,
    };
    state.retinue!.captains = [captain];
    squad.captainId = captain.id;

    const preview = getSquadDeploymentPreview(state, squad.id, "recon_sweep")!;
    expect(preview.canLaunch).toBe(true);
    expect(preview.duration).toBe(8);
    expect(preview.successChance).toBeGreaterThan(0);
    expect(preview.projectedCasualtiesOnFailure).toBeGreaterThanOrEqual(preview.projectedCasualtiesOnSuccess);

    expect(launchSquadOperation(state, squad.id, "recon_sweep", () => 0)).toEqual({ success: true });
    expect(state.retinue!.activeOperation?.ticksRemaining).toBe(preview.duration);
    expect(state.retinue!.troops[0].status).toBe("deployed");

    for (let tick = 1; tick <= preview.duration; tick++) {
      state.totalTicks = tick;
      processRetinueTick(state, []);
    }

    expect(state.retinue!.activeOperation).toBeNull();
    expect(state.retinue!.troops[0].status).toBe("ready");
    expect(state.retinue!.troops[0].missionsCompleted).toBe(1);
    expect(state.retinue!.squads[0].deploymentsCompleted).toBe(1);
    expect(state.retinue!.operationHistory).toHaveLength(1);
    expect(state.retinue!.operationHistory![0]).toMatchObject({
      operationId: "recon_sweep",
      squadId: squad.id,
      success: true,
      duration: preview.duration,
    });
  });

  it("does not preview a launch for a squad without an active captain", () => {
    const state = makeState();
    const preview = getSquadDeploymentPreview(state, "squad-doctrine-test", "recon_sweep")!;
    expect(preview.canLaunch).toBe(false);
    expect(preview.reason).toBe("An active captain is required.");
  });
});
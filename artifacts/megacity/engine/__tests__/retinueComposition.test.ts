import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  createDefaultRetinueState,
  SQUAD_SYNERGIES,
  type Squad,
  type Troop,
} from "@/engine/retinueData";
import {
  formatSquadSynergyEffect,
  getSquadAssignmentPreview,
  getSquadCombatPower,
  getSquadCompositionBreakdown,
  getSquadSynergyEffects,
} from "@/engine/retinue";

const squad: Squad = {
  id: "composition-squad",
  name: "Composition Test",
  role: "assault",
  doctrine: "balanced",
  captainId: null,
  troopIds: [],
  maxSize: 4,
  formationBonus: 0,
  totalKills: 0,
  deploymentsCompleted: 0,
  created: 0,
};

function troop(id: string, classId: Troop["classId"], status: Troop["status"] = "ready"): Troop {
  return {
    id,
    classId,
    tier: "enforcer",
    level: 1,
    xp: 0,
    xpToNext: 100,
    hp: status === "injured" ? 20 : 100,
    maxHp: 100,
    combat: 10,
    morale: 100,
    kills: 0,
    missionsCompleted: 0,
    status,
    squadId: "composition-squad",
    hiredTick: 0,
  };
}

function makeState(troops: Troop[], troopIds = troops.map(t => t.id)) {
  const state = createInitialState();
  state.retinue = {
    ...createDefaultRetinueState(),
    squads: [{ ...squad, troopIds }],
    troops: troops.map(t => ({ ...t, squadId: troopIds.includes(t.id) ? squad.id : null })),
  };
  return state;
}

describe("squad composition breakdown", () => {
  it("uses the same synergy calculation for live power and the displayed ledger", () => {
    const state = makeState([
      troop("infantry-1", "infantry"),
      troop("gunner-1", "heavy_gunner"),
      troop("marksman-1", "marksman"),
    ]);

    const breakdown = getSquadCompositionBreakdown(state, squad.id);

    expect(breakdown.activeSynergies.map(syn => syn.id)).toContain("combined_arms");
    expect(breakdown.synergyPower).toBe(8);
    expect(breakdown.synergyEffects.map(effect => `${effect.label}:${effect.value}`)).toEqual([
      "combat power:8",
      "defense:3",
    ]);
    expect(breakdown.troopPower).toBe(30);
    expect(breakdown.combatPower).toBe(29);
    expect(getSquadCombatPower(state, squad.id)).toBe(breakdown.combatPower);
  });

  it("previews the power and composition change before assigning a troop", () => {
    const state = makeState([
      troop("infantry-1", "infantry"),
      troop("gunner-1", "heavy_gunner"),
      troop("marksman-1", "marksman"),
      troop("medic-1", "medic"),
    ], ["infantry-1", "gunner-1"]);

    const preview = getSquadAssignmentPreview(state, squad.id, "marksman-1");

    expect(preview.canAssign).toBe(true);
    expect(preview.current.activeSynergies).toHaveLength(0);
    expect(preview.preview.activeSynergies.map(syn => syn.id)).toContain("combined_arms");
    expect(preview.gainedSynergyEffects.map(effect => `${effect.label}:${effect.value}`)).toEqual([
      "combat power:8",
      "defense:3",
    ]);
    expect(preview.delta).toBe(preview.preview.combatPower - preview.current.combatPower);
    expect(preview.delta).toBe(14);
    expect(state.retinue!.squads[0].troopIds).toEqual(["infantry-1", "gunner-1"]);
  });

  it("formats every non-zero operational effect on a combination", () => {
    const medicCorps = SQUAD_SYNERGIES.find(synergy => synergy.id === "medic_corps")!;
    const effects = getSquadSynergyEffects(medicCorps);

    expect(effects.map(formatSquadSynergyEffect)).toEqual([
      "+3 defense",
      "+10 morale",
      "+20 healing",
    ]);
  });

  it("explains missing combinations, capacity, and unavailable troop records", () => {
    const state = makeState([
      troop("infantry-1", "infantry"),
      troop("injured-1", "marksman", "injured"),
      troop("kia-1", "medic", "kia"),
      troop("training-1", "engineer", "training"),
      troop("extra-1", "scout"),
    ]);
    state.retinue!.squads[0].maxSize = 3;

    const breakdown = getSquadCompositionBreakdown(state, squad.id);

    expect(breakdown.missingSynergies.some(status =>
      status.synergy.id === "combined_arms" &&
      status.missingRequirements.some(req => req.label === "Heavy Gunner 0/1"),
    )).toBe(true);
    expect(breakdown.overCapacityBy).toBe(2);
    expect(breakdown.injuredTroopCount).toBe(1);
    expect(breakdown.kiaTroopCount).toBe(1);
    expect(breakdown.unavailableTroopCount).toBe(1);
    expect(breakdown.statusMessages).toEqual(expect.arrayContaining([
      "2 troops over capacity — remove an assignment.",
      "1 injured troop contributes no combat power until recovered.",
      "1 KIA troop record contributes no combat power and should be removed.",
      "1 unavailable troop contributes no combat power while training or deployed.",
    ]));
  });

  it("rejects KIA and full-squad assignment previews without mutating state", () => {
    const state = makeState([
      troop("ready-1", "infantry"),
      troop("ready-2", "heavy_gunner"),
      troop("kia-1", "marksman", "kia"),
    ], ["ready-1", "ready-2"]);
    state.retinue!.squads[0].maxSize = 2;

    const fullPreview = getSquadAssignmentPreview(state, squad.id, "kia-1");
    expect(fullPreview.canAssign).toBe(false);
    expect(fullPreview.reason).toBe("KIA troops cannot be assigned.");
    expect(fullPreview.preview.troopCount).toBe(3);
    expect(state.retinue!.squads[0].troopIds).toEqual(["ready-1", "ready-2"]);
  });
});
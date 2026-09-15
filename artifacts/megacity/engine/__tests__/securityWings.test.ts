import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { sanitizeState } from "@/engine/sanitizer";
import {
  appointSecurityWingLeader,
  assignSecurityWingSquad,
  deploySecurityWing,
  establishSecurityWing,
  processSecurityWingsTick,
  setSecurityWingDoctrine,
  SECURITY_WING_DEFS,
} from "@/engine/securityWings";
import { createDefaultRetinueState, type Squad, type Troop } from "@/engine/retinueData";

function makeState() {
  const state = createInitialState();
  state.unlockedTechnologies = ["spy_field_doctrine", "security_wing_command"];
  state.buildings.security_command_bureau = 1;
  const squad: Squad = {
    id: "security-squad-1",
    name: "Civic Watch Alpha",
    role: "defense",
    doctrine: "defensive",
    captainId: null,
    deputyCaptainId: null,
    troopIds: [
      "security-troop-1", "security-troop-2", "security-troop-3", "security-troop-4",
      "security-troop-5", "security-troop-6", "security-troop-7", "security-troop-8",
    ],
    maxSize: 8,
    formationBonus: 0,
    totalKills: 0,
    deploymentsCompleted: 0,
    created: 0,
  };
  const troops: Troop[] = squad.troopIds.map((id) => ({
    id,
    classId: "infantry",
    tier: "enforcer",
    level: 1,
    xp: 0,
    xpToNext: 100,
    hp: 100,
    maxHp: 100,
    combat: 10,
    morale: 80,
    kills: 0,
    missionsCompleted: 0,
    status: "ready",
    squadId: squad.id,
    hiredTick: 0,
  }));
  state.retinue = { ...createDefaultRetinueState(), squads: [squad], troops };
  const officer = state.officers.find((candidate) => candidate.position === "City Enforcement Commander")!;
  officer.appointed = true;
  officer.competence = 70;
  return state;
}

describe("staffed security wings", () => {
  it("establishes without creating personnel and rejects duplicate squad ownership", () => {
    const state = makeState();
    const troopCount = state.retinue!.troops.length;

    expect(establishSecurityWing(state, "civil_security")).toEqual({ success: true });
    expect(assignSecurityWingSquad(state, "civil_security", "security-squad-1")).toEqual({ success: true });
    expect(assignSecurityWingSquad(state, "civil_security", "security-squad-1")).toEqual({
      success: false,
      error: "Squad is already assigned to this wing",
    });
    expect(state.retinue!.troops).toHaveLength(troopCount);
    expect(state.securityWings!.wings[0].squadIds).toEqual(["security-squad-1"]);
  });

  it("requires an exact appointed command post before deployment", () => {
    const state = makeState();
    establishSecurityWing(state, "civil_security");
    assignSecurityWingSquad(state, "civil_security", "security-squad-1");

    expect(appointSecurityWingLeader(state, "civil_security", "missing-officer")).toEqual({
      success: false,
      error: "Appoint the officer before assigning command",
    });
    state.officers[0].appointed = true;
    expect(appointSecurityWingLeader(state, "civil_security", state.officers[0].id)).toEqual({
      success: false,
      error: "Officer does not hold an eligible command post",
    });
    const commander = state.officers.find((candidate) => candidate.position === "City Enforcement Commander")!;
    expect(appointSecurityWingLeader(state, "civil_security", commander.id)).toEqual({ success: true });
    expect(deploySecurityWing(state, "civil_security")).toEqual({ success: true });
  });

  it("applies upkeep and live effects from staffed deployment, then stands down when unfunded", () => {
    const state = makeState();
    establishSecurityWing(state, "civil_security");
    assignSecurityWingSquad(state, "civil_security", "security-squad-1");
    const commander = state.officers.find((candidate) => candidate.position === "City Enforcement Commander")!;
    appointSecurityWingLeader(state, "civil_security", commander.id);
    deploySecurityWing(state, "civil_security");

    const crimeBefore = state.cityStats.crime;
    const creditsBefore = state.resources.credits;
    const entries: any[] = [];
    processSecurityWingsTick(state, entries);

    expect(state.cityStats.crime).toBeLessThan(crimeBefore);
    expect(state.resources.credits).toBe(creditsBefore - SECURITY_WING_DEFS[0].upkeep.credits);
    expect(entries.some((entry) => entry.label === "Civil Security Wing")).toBe(true);

    state.resources.credits = 0;
    processSecurityWingsTick(state, []);
    expect(state.securityWings!.wings[0].status).toBe("standby");
  });

  it("sanitizes unknown, duplicate, and cross-owned squads from persisted wing state", () => {
    const state = makeState();
    state.securityWings = {
      wings: [
        {
          id: "civil_security",
          status: "deployed",
          squadIds: ["security-squad-1", "security-squad-1", "missing-squad"],
          leaderOfficerId: state.officers[0].id,
          doctrine: "nonsense" as any,
          jurisdiction: "invalid" as any,
          foundedTick: -10,
          readiness: 999,
          loyalty: -4,
          accountability: 999,
          lastActionTick: -2,
        },
        {
          id: "secret_police",
          status: "deployed",
          squadIds: ["security-squad-1"],
          leaderOfficerId: "missing-officer",
          doctrine: "counterintelligence",
          jurisdiction: "citywide",
          foundedTick: 0,
          readiness: 50,
          loyalty: 50,
          accountability: 50,
          lastActionTick: 0,
        },
        { id: "unknown" as any, squadIds: [] } as any,
      ],
      totalDeployments: -5,
      lastReportTick: -4,
    };

    const clean = sanitizeState(state);
    expect(clean.securityWings!.wings).toHaveLength(2);
    expect(clean.securityWings!.wings[0].squadIds).toEqual(["security-squad-1"]);
    expect(clean.securityWings!.wings[1].squadIds).toEqual([]);
    expect(clean.securityWings!.wings[0].leaderOfficerId).toBeNull();
    expect(clean.securityWings!.wings[0].readiness).toBe(100);
    expect(clean.securityWings!.totalDeployments).toBe(0);
    expect(clean.securityWings!.lastReportTick).toBe(-1);
  });

  it("supports doctrine changes only while the wing is not deployed", () => {
    const state = makeState();
    establishSecurityWing(state, "civil_security");
    expect(setSecurityWingDoctrine(state, "civil_security", "counterinsurgency")).toEqual({ success: true });
    expect(state.securityWings!.wings[0].doctrine).toBe("counterinsurgency");
  });
});
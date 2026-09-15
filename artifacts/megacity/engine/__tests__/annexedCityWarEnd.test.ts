import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { runLiveTick } from "@/engine/liveTickPipeline";
import {
  CONTROL_UPRISING_HOSTILE_THREAT,
  CONTROL_UPRISING_MIN_ATTRITION,
  CONTROL_UPRISING_MIN_TICKS,
  CONTROL_UPRISING_MAX_LOYALTY,
  applyPartnerAndPlayerTickEffects,
} from "@/engine/partnerCityStats";
import { getHostileEntities, isAtWar } from "@/engine/wartimeEvents";
import {
  endWarsInvolving,
  forceGenerateIncident,
  getDefaultAdvancedState,
  maybeGenerateIncident,
  type DiplomacyAdvancedState,
  type PeaceConference,
  type WarState,
} from "@/engine/diplomacyAdvanced";
import type { ExternalMegacity, GameState, PartnerControlStatus, Township } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #478: annexed megacities must stop generating war reports.
//
// Player bug (Stefan/SRB): after annexing the Khanate megacity, war reports
// against it kept arriving forever. Annexation sets controlStatus: "annexed"
// but does NOT reset loyalty/threat, and every hostility gate keyed on those
// numbers alone:
//   1. getHostileEntities (wartime dispatch generator + isAtWar) kept the
//      annexed city as a belligerent → endless wartime dispatches.
//   2. pickInstigator could still choose annexed/occupied cities as
//      instigators of NEW diplomatic incidents.
//   3. An active war in diplomacyAdvanced.wars was never ended on
//      annexation → ghost war escalating and raising unrest forever.
//
// Fixes proved here through the REAL tick pipeline (runTick) per project
// convention, plus the pure endWarsInvolving helper the GameContext
// annex/occupy handler shares with the per-tick self-heal.
// ─────────────────────────────────────────────────────────────────────────────

// Every message-id prefix a wartime dispatch can carry (see wartimeEvents.ts
// generators routed by generateWartimePeriodicMessage).
const WARTIME_MSG_ID_PREFIXES = [
  "sortie-report", "aerial-engage", "cyber-war", "propaganda", "siege-breach",
  "siege-report", "war-casualties", "blockade-report", "home-front",
  "war-diplomacy", "war-dispatch",
];

function makeHostileCity(controlStatus?: PartnerControlStatus): ExternalMegacity {
  return {
    id: "ext-khanate-test",
    name: "Khanate of Rust",
    isActive: true,
    threat: 85,
    loyalty: 3,
    militaryStrength: "high",
    leader: { name: "Khan Verrik", title: "Iron Khan", attitude: "hostile" },
    controlStatus,
  } as ExternalMegacity;
}

// Deterministic fixture: strip every OTHER hostility source so the injected
// city is the only possible belligerent (same trick as wartimeDispatch.test's
// makePeacetimeState — random starting regions can discover hostile
// WORLD_LOCATIONS).
function baseState(): GameState {
  const s = createInitialState();
  s.hasCompletedOnboarding = true;
  s.calmStartTicks = 0;
  s.totalTicks = 100;
  s.gameDate = { year: 2200, month: 4, day: 6, hour: 6 };
  s.discoveredLocationIds = [];
  s.externalMegacities = (s.externalMegacities ?? []).filter(
    (m) => !(m.isActive && m.loyalty < 15 && m.threat > 50),
  );
  return s;
}

function makeWar(targetId: string, targetName: string): WarState {
  return {
    id: `war-test-${targetId}`,
    belligerents: ["player", targetId],
    belligerentNames: ["MegaCity", targetName],
    stage: "open_war",
    intensity: 70,
    startTick: 0,
    lastEscalationTick: 0,
    playerInitiated: false,
    casualties: { a: 200, b: 200 },
    infrastructureDamage: { a: 1, b: 1 },
    warWeariness: 5,
    peaceOffered: false,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("annexed/occupied cities are never hostile belligerents (Task #478)", () => {
  it("getHostileEntities excludes annexed and occupied megacities despite hostile loyalty/threat", () => {
    const s = baseState();
    s.externalMegacities = [
      ...(s.externalMegacities ?? []),
      makeHostileCity("annexed"),
      { ...makeHostileCity("occupied"), id: "ext-occ-test", name: "Occupied Hold" },
    ];
    const { megacities } = getHostileEntities(s);
    expect(megacities).toHaveLength(0);
    expect(isAtWar(s)).toBe(false);
  });

  it("the same city WITHOUT control status still registers as hostile (gate is control status, not the fixture)", () => {
    const s = baseState();
    s.externalMegacities = [...(s.externalMegacities ?? []), makeHostileCity(undefined)];
    expect(getHostileEntities(s).megacities.map((m) => m.id)).toEqual(["ext-khanate-test"]);
    expect(isAtWar(s)).toBe(true);
  });

  it("full-tick: an annexed hostile city produces zero wartime dispatches across a full day cycle", () => {
    // Pin randomness high so random spawners stay quiet and the only message
    // dynamics in play are the deterministic wartime dispatch slots.
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    let s = baseState();
    s.externalMegacities = [...(s.externalMegacities ?? []), makeHostileCity("annexed")];

    // 12 ticks = 3 in-game days → covers every dispatch slot (hours 0/6/12/18,
    // day%4 and day%5 routing) that would fire while at war.
    for (let i = 0; i < 12; i++) {
      s = runTick(s).newState;
      expect(isAtWar(s)).toBe(false);
    }

    const warMsgs = (s.messages ?? []).filter((m) =>
      WARTIME_MSG_ID_PREFIXES.some((p) => m.id.includes(p)),
    );
    expect(warMsgs).toHaveLength(0);

    // The hostile-strike leak (partnerCityStats) must stay closed too.
    const strikes = (s.messages ?? []).filter((m) => m.id.startsWith("enemy-strike-ext-khanate-test"));
    expect(strikes).toHaveLength(0);
  });
});

describe("controlled megacity uprisings", () => {
  it.each(["occupied", "annexed"] as const)(
    "full-tick: sustained discontent reverts an %s megacity to independent with one critical alert",
    (controlStatus) => {
      vi.spyOn(Math, "random").mockReturnValue(0.99);
      const s = baseState();
      const city = {
        ...makeHostileCity(controlStatus),
        attrition: CONTROL_UPRISING_MIN_ATTRITION,
        tributePerTick: controlStatus === "occupied" ? 500 : 0,
        // runLiveTick increments totalTicks before partner effects. This puts
        // the city exactly on the uprising threshold during that full tick.
        uprisingDiscontentSinceTick: s.totalTicks + 1 - CONTROL_UPRISING_MIN_TICKS,
      };
      s.externalMegacities = [...(s.externalMegacities ?? []), city];

      const next = runLiveTick(s).state;
      const rebelled = next.externalMegacities.find((m) => m.id === city.id);
      expect(rebelled?.controlStatus).toBe("independent");
      expect(rebelled?.tributePerTick).toBe(0);
      expect(rebelled?.occupiedSinceTick).toBeUndefined();
      expect(rebelled?.uprisingDiscontentSinceTick).toBeUndefined();

      const uprisingAlerts = (next.messages ?? []).filter(
        (m) => m.id.startsWith(`control-uprising-${city.id}-`),
      );
      expect(uprisingAlerts).toHaveLength(1);
      expect(uprisingAlerts[0].priority).toBe("critical");
      expect(uprisingAlerts[0].body).toContain("declared independence");
    },
  );

  it("requires the full control duration and both low loyalty and high attrition", () => {
    const s = baseState();
    const atThreshold = s.totalTicks - CONTROL_UPRISING_MIN_TICKS;
    const cases: ExternalMegacity[] = [
      {
        ...makeHostileCity("annexed"),
        id: "too-soon",
        attrition: CONTROL_UPRISING_MIN_ATTRITION,
        uprisingDiscontentSinceTick: atThreshold + 1,
      },
      {
        ...makeHostileCity("annexed"),
        id: "loyal-enough",
        loyalty: 15,
        attrition: CONTROL_UPRISING_MIN_ATTRITION,
        uprisingDiscontentSinceTick: atThreshold,
      },
      {
        ...makeHostileCity("annexed"),
        id: "attrition-manageable",
        attrition: CONTROL_UPRISING_MIN_ATTRITION - 1,
        uprisingDiscontentSinceTick: atThreshold,
      },
    ];
    s.externalMegacities = cases;

    const result = applyPartnerAndPlayerTickEffects(s);
    expect(result.state.externalMegacities.map((m) => m.controlStatus)).toEqual([
      "annexed",
      "annexed",
      "annexed",
    ]);
    expect(result.alerts.some((m) => m.id.startsWith("control-uprising-"))).toBe(false);
  });

  it("legacy controlled saves and newly bad conditions start a fresh discontent window", () => {
    const s = baseState();
    const legacy = {
      ...makeHostileCity("occupied"),
      attrition: 100,
      // The city has been occupied for a long time, but the legacy save has no
      // consecutive-discontent timestamp. It must not rebel immediately.
      occupiedSinceTick: 0,
      uprisingDiscontentSinceTick: undefined,
    };
    s.externalMegacities = [legacy];

    const next = runLiveTick(s).state;
    const stillControlled = next.externalMegacities.find((m) => m.id === legacy.id);
    expect(stillControlled?.controlStatus).toBe("occupied");
    expect(stillControlled?.uprisingDiscontentSinceTick).toBe(next.totalTicks);
    expect((next.messages ?? []).some((m) => m.id.startsWith("control-uprising-"))).toBe(false);
  });

  it("recovery resets the discontent streak before a later deterioration", () => {
    const s = baseState();
    s.externalMegacities = [{
      ...makeHostileCity("annexed"),
      loyalty: CONTROL_UPRISING_MAX_LOYALTY,
      attrition: CONTROL_UPRISING_MIN_ATTRITION,
      uprisingDiscontentSinceTick: 0,
    }];

    const recovered = applyPartnerAndPlayerTickEffects(s).state;
    expect(recovered.externalMegacities[0].uprisingDiscontentSinceTick).toBeUndefined();
    expect(recovered.externalMegacities[0].controlStatus).toBe("annexed");

    recovered.externalMegacities[0] = {
      ...recovered.externalMegacities[0],
      loyalty: CONTROL_UPRISING_MAX_LOYALTY - 1,
    };
    const deteriorated = applyPartnerAndPlayerTickEffects(recovered).state;
    expect(deteriorated.externalMegacities[0].uprisingDiscontentSinceTick).toBe(s.totalTicks);
    expect(deteriorated.externalMegacities[0].controlStatus).toBe("annexed");
  });

  it("qualifying occupied townships keep their tribute and never use the megacity uprising path", () => {
    const s = baseState();
    const tribute = 75;
    s.externalMegacities = [];
    s.townships = [{
      id: "township-controlled-test",
      name: "Controlled Hamlet",
      description: "",
      population: 2000,
      loyalty: 0,
      threat: 90,
      influence: 0,
      status: "hostile",
      factionType: "township",
      controlStatus: "occupied",
      tributePerTick: tribute,
      occupiedSinceTick: 0,
      attrition: 100,
    } as Township];
    const creditsBefore = s.resources.credits;

    const result = applyPartnerAndPlayerTickEffects(s);
    expect(result.state.townships?.[0].controlStatus).toBe("occupied");
    expect(result.state.townships?.[0].tributePerTick).toBe(tribute);
    expect(result.state.resources.credits).toBe(creditsBefore + tribute);
    expect(result.alerts.some((m) => m.id.startsWith("control-uprising-"))).toBe(false);
  });

  it("full-tick: wartime messaging stays off through the uprising tick and resumes only afterward", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let s = baseState();
    const city = {
      ...makeHostileCity("annexed"),
      // Controlled cities can be deactivated or have threat suppressed by
      // deterrence. The uprising must restore both hostile prerequisites.
      isActive: false,
      threat: 10,
      attrition: CONTROL_UPRISING_MIN_ATTRITION,
      uprisingDiscontentSinceTick: s.totalTicks + 1 - CONTROL_UPRISING_MIN_TICKS,
    };
    s.externalMegacities = [...(s.externalMegacities ?? []), city];
    expect(isAtWar(s)).toBe(false);

    // runTick's wartime dispatch stage occurs before partner control effects,
    // so the rebellion alert fires now but no war report can precede it.
    s = runLiveTick(s).state;
    const rebelled = s.externalMegacities.find((m) => m.id === city.id);
    expect(rebelled?.isActive).toBe(true);
    expect(rebelled?.threat).toBe(CONTROL_UPRISING_HOSTILE_THREAT);
    expect(getHostileEntities(s).megacities.map((m) => m.id)).toContain(city.id);
    expect(isAtWar(s)).toBe(true);
    expect((s.messages ?? []).some((m) =>
      WARTIME_MSG_ID_PREFIXES.some((prefix) => m.id.includes(prefix)),
    )).toBe(false);

    // The next full tick sees the now-independent hostile city. Starting at
    // hour 6 makes this land on hour 18/day 6, a deterministic home-front slot.
    s = runLiveTick(s).state;
    expect((s.messages ?? []).some((m) =>
      WARTIME_MSG_ID_PREFIXES.some((prefix) => m.id.includes(prefix)),
    )).toBe(true);
  });
});

describe("annexed/occupied partners never instigate diplomatic incidents (Task #478)", () => {
  function controlledOnlyState(): GameState {
    const s = baseState();
    s.factions = s.factions.map((f) => ({ ...f, isActive: false }));
    s.externalMegacities = [makeHostileCity("annexed")];
    s.townships = [
      {
        id: "twn-test",
        name: "Rust Hollow",
        description: "",
        population: 500,
        loyalty: 10,
        threat: 60,
        influence: 0,
        status: "neutral",
        factionType: "township",
        controlStatus: "occupied",
      } as Township,
    ];
    return s;
  }

  it("forceGenerateIncident returns null when every candidate is annexed/occupied", () => {
    const s = controlledOnlyState();
    for (let i = 0; i < 50; i++) {
      expect(forceGenerateIncident(s)).toBeNull();
    }
  });

  it("incident instigators are always drawn from non-controlled partners", () => {
    const s = controlledOnlyState();
    const free: ExternalMegacity = { ...makeHostileCity(undefined), id: "ext-free", name: "Free Hold" };
    s.externalMegacities = [makeHostileCity("annexed"), free];
    for (let i = 0; i < 100; i++) {
      const inc = forceGenerateIncident(s);
      expect(inc).not.toBeNull();
      expect(inc!.instigatorId).toBe("ext-free");
    }
    // Random path too (maybeGenerateIncident) — force the roll to pass.
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const inc = maybeGenerateIncident(s);
    if (inc) expect(inc.instigatorId).toBe("ext-free");
  });

  it("full-tick: the forced tick-8 incident is skipped when only controlled partners exist", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let s = controlledOnlyState();
    // processDiplomacyTick runs AFTER runTick increments totalTicks, so start
    // at 7 to land exactly on the forced-incident tick (totalTicks === 8).
    s.totalTicks = 7;
    s.diplomacyAdvanced = getDefaultAdvancedState();
    const { newState, entries } = runTick(s);
    expect(newState.totalTicks).toBe(8);
    expect(newState.diplomacyAdvanced?.incidents ?? []).toHaveLength(0);
    expect(entries.some((e) => e.label === "DIPLOMATIC INCIDENT")).toBe(false);
  });
});

describe("endWarsInvolving — pure helper shared by annex/occupy handler and self-heal (Task #478)", () => {
  it("removes every war involving the target plus linked peace conferences, leaving other wars intact", () => {
    const w1 = makeWar("ext-khanate-test", "Khanate of Rust");
    const w2 = makeWar("ext-other", "Other City");
    const pc: PeaceConference = {
      id: "peace-1",
      warId: w1.id,
      participants: [...w1.belligerents],
      participantNames: [...w1.belligerentNames],
      startTick: 0,
      demands: [],
      status: "negotiating",
      roundsRemaining: 3,
      playerMediator: true,
    };
    const adv: DiplomacyAdvancedState = {
      ...getDefaultAdvancedState(),
      wars: [w1, w2],
      peaceConferences: [pc],
    };

    const res = endWarsInvolving(adv, "ext-khanate-test");
    expect(res.endedWars.map((w) => w.id)).toEqual([w1.id]);
    expect(res.adv.wars.map((w) => w.id)).toEqual([w2.id]);
    expect(res.adv.peaceConferences).toHaveLength(0);

    // No wars against the target → identity no-op.
    const noop = endWarsInvolving(res.adv, "ext-khanate-test");
    expect(noop.adv).toBe(res.adv);
    expect(noop.endedWars).toHaveLength(0);
  });
});

describe("self-heal: existing saves with ghost wars against annexed cities recover on the next tick (Task #478)", () => {
  it("full-tick: a war whose belligerent is annexed is resolved, its peace conference dropped, and a WAR CONCLUDED entry emitted", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let s = baseState();
    s.externalMegacities = [...(s.externalMegacities ?? []), makeHostileCity("annexed")];
    const war = makeWar("ext-khanate-test", "Khanate of Rust");
    const pc: PeaceConference = {
      id: "peace-heal",
      warId: war.id,
      participants: [...war.belligerents],
      participantNames: [...war.belligerentNames],
      startTick: 0,
      demands: [],
      status: "negotiating",
      roundsRemaining: 3,
      playerMediator: true,
    };
    s.diplomacyAdvanced = {
      ...getDefaultAdvancedState(),
      wars: [war],
      peaceConferences: [pc],
    };

    const { newState, entries } = runTick(s);
    expect(newState.diplomacyAdvanced?.wars ?? []).toHaveLength(0);
    expect(newState.diplomacyAdvanced?.peaceConferences ?? []).toHaveLength(0);
    expect(entries.some((e) => e.label === "WAR CONCLUDED")).toBe(true);
    // The ghost war must not escalate on the tick it heals.
    expect(entries.some((e) => e.label === "WAR ESCALATION" || e.label === "TOTAL WAR")).toBe(false);
  });

  it("full-tick: the healed war stops raising unrest on subsequent ticks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let s = baseState();
    s.externalMegacities = [...(s.externalMegacities ?? []), makeHostileCity("annexed")];
    s.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [makeWar("ext-khanate-test", "Khanate of Rust")] };

    s = runTick(s).newState; // heals
    for (let i = 0; i < 4; i++) {
      const { newState, entries } = runTick(s);
      expect(newState.diplomacyAdvanced?.wars ?? []).toHaveLength(0);
      expect(entries.some((e) => e.label === "WAR ESCALATION" || e.label === "TOTAL WAR")).toBe(false);
      s = newState;
    }
  });

  it("full-tick: wars against INDEPENDENT cities are untouched by the self-heal", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const s = baseState();
    const free: ExternalMegacity = { ...makeHostileCity(undefined), id: "ext-free", name: "Free Hold" };
    s.externalMegacities = [...(s.externalMegacities ?? []), free];
    s.diplomacyAdvanced = { ...getDefaultAdvancedState(), wars: [makeWar("ext-free", "Free Hold")] };

    const { newState } = runTick(s);
    expect((newState.diplomacyAdvanced?.wars ?? []).map((w) => w.belligerents[1])).toEqual(["ext-free"]);
  });
});

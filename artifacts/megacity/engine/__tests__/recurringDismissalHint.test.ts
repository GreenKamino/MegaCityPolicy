import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { applyEventDismissal, applyEventResponse } from "@/engine/eventResolution";
import { CRISIS_THRESHOLDS } from "@/engine/crisisThresholds";
import { CONDITION_TRIGGERS, isFlavorTrigger } from "@/engine/eventTriggers";
import {
  DISMISS_RECURRENCE_HINT_ID_PREFIX,
  RECURRING_EVENT_DEFS,
  getRecurrenceFixTarget,
  getRecurrenceHintPhrase,
  getRecurrenceRemediation,
} from "@/engine/recurringEvents";
import type { GameEvent, GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #456: dismissing a RECURRING stat-triggered crisis (the Task #452/#455
// cooldown-stamped ids) must leave the player a brief, non-blocking hint that
// the warning WILL return while the underlying condition stays critical — and
// one-off events must NOT get such a hint. The hint is an inbox GameMessage
// with a stable id prefix; useNewsHeadlines echoes it onto the news ticker.
// ─────────────────────────────────────────────────────────────────────────────

const COLLAPSE_ID = "biosphere_ecosystem_collapse";

const hintMessages = (s: GameState) =>
  (s.messages ?? []).filter((m) => m.id.startsWith(DISMISS_RECURRENCE_HINT_ID_PREFIX));

// Same arming trick as crisisRetriggerCooldown.test.ts: biosphere pinned under
// the deterministic collapse threshold with the calm-start window zeroed so
// processBiosphere fires the collapse on the next tick.
function armedState(): GameState {
  const s = createInitialState();
  return {
    ...s,
    hasCompletedOnboarding: true,
    calmStartTicks: 0,
    cityStats: { ...s.cityStats, biosphere: 5 },
  };
}

function fireCollapse(): GameState {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  const next = runTick(armedState()).newState;
  next.cityStats = { ...next.cityStats, biosphere: 5 };
  expect(next.activeEvents.some((e) => e.id === COLLAPSE_ID)).toBe(true);
  return next;
}

describe("recurring dismissal hint (Task #456)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dismissing a stat-triggered crisis while the stat is still critical posts the hint message", () => {
    const s = fireCollapse();
    const before = hintMessages(s).length;
    const after = applyEventDismissal(s, COLLAPSE_ID);

    const hints = hintMessages(after);
    expect(hints.length).toBe(before + 1);
    // Prepended so the inbox surfaces it on top, and body reads as the
    // player-facing sentence the ticker scrolls verbatim.
    expect(after.messages![0].id.startsWith(DISMISS_RECURRENCE_HINT_ID_PREFIX)).toBe(true);
    expect(after.messages![0].body).toContain("will return while the biosphere stays critical");
    expect(after.messages![0].priority).toBe("low");
    // The dismissal itself still cleared the event and stamped the cooldown.
    expect(after.activeEvents.some((e) => e.id === COLLAPSE_ID)).toBe(false);
    expect(after.eventTriggerCooldowns?.[COLLAPSE_ID]).toBe(s.totalTicks);
  });

  it("no hint when the underlying stat already recovered by dismissal time", () => {
    const s = fireCollapse();
    // Player fixed the biosphere before dismissing the stale card: the
    // dismissal genuinely ends the matter, so no "it will return" note.
    const recovered: GameState = {
      ...s,
      cityStats: { ...s.cityStats, biosphere: 60 },
    };
    const after = applyEventDismissal(recovered, COLLAPSE_ID);
    expect(hintMessages(after).length).toBe(0);
    expect(after.activeEvents.some((e) => e.id === COLLAPSE_ID)).toBe(false);
  });

  it("no hint for a one-off (non stat-triggered) event", () => {
    const s = createInitialState();
    const oneOff: GameEvent = {
      id: "one_off_test_event",
      title: "ONE OFF INCIDENT",
      description: "A single occurrence.",
      severity: "medium",
      effects: {},
      timestamp: Date.now(),
      resolved: false,
    } as GameEvent;
    const withEvent: GameState = { ...s, activeEvents: [...s.activeEvents, oneOff] };
    const after = applyEventDismissal(withEvent, oneOff.id);
    expect(hintMessages(after).length).toBe(0);
    expect(after.activeEvents.some((e) => e.id === oneOff.id)).toBe(false);
  });

  it("RESPONDING to a recurring crisis posts no hint (only dismissal is a snooze)", () => {
    const s = fireCollapse();
    const ev = s.activeEvents.find((e) => e.id === COLLAPSE_ID)!;
    const response = ev.responseOptions?.[0] ?? {
      id: "test_ack",
      label: "ACK",
      description: "",
      effects: {},
    };
    const after = applyEventResponse(s, COLLAPSE_ID, response);
    expect(hintMessages(after).length).toBe(0);
    expect(after.activeEvents.some((e) => e.id === COLLAPSE_ID)).toBe(false);
  });

  // Drift backstop for the mirrored predicates: arm each condition exactly at
  // its event trigger threshold and prove the leaf-module predicate agrees
  // (fires at the threshold, clears once recovered).
  it("condition-crisis predicates mirror the event trigger thresholds", () => {
    const base = createInitialState();
    const withStats = (stats: Partial<GameState["cityStats"]>): GameState => ({
      ...base,
      cityStats: { ...base.cityStats, ...stats },
    });
    const withResources = (resources: Partial<GameState["resources"]>): GameState => ({
      ...base,
      resources: { ...base.resources, ...resources },
    });

    expect(
      getRecurrenceHintPhrase(withStats({ biosphere: 15 }), { id: COLLAPSE_ID }),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(withStats({ biosphere: 16 }), { id: COLLAPSE_ID }),
    ).toBeNull();

    expect(
      getRecurrenceHintPhrase(withStats({ diseaseRisk: 75 }), { id: "biosphere_disease_outbreak" }),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(withStats({ diseaseRisk: 74 }), { id: "biosphere_disease_outbreak" }),
    ).toBeNull();

    expect(
      getRecurrenceHintPhrase(
        withStats({ diseaseRisk: 50, biosphere: 30 }),
        { id: "biosphere_toxic_bloom" },
      ),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(
        withStats({ diseaseRisk: 49, biosphere: 30 }),
        { id: "biosphere_toxic_bloom" },
      ),
    ).toBeNull();

    expect(
      getRecurrenceHintPhrase(
        withStats({ crime: CRISIS_THRESHOLDS.crime.trigger }),
        { id: "crime_wave_surge" },
      ),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(
        withStats({ crime: CRISIS_THRESHOLDS.crime.trigger - 1 }),
        { id: "crime_wave_surge" },
      ),
    ).toBeNull();

    expect(
      getRecurrenceHintPhrase(
        withResources({ food: CRISIS_THRESHOLDS.food.trigger }),
        { id: "food_crisis" },
      ),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(
        withResources({ food: CRISIS_THRESHOLDS.food.trigger + 1 }),
        { id: "food_crisis" },
      ),
    ).toBeNull();

    expect(
      getRecurrenceHintPhrase(
        withResources({ power: CRISIS_THRESHOLDS.power.trigger }),
        { id: "power_crisis" },
      ),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(
        withResources({ power: CRISIS_THRESHOLDS.power.trigger + 1 }),
        { id: "power_crisis" },
      ),
    ).toBeNull();

    expect(
      getRecurrenceHintPhrase(
        withStats({ unrest: CRISIS_THRESHOLDS.unrest.trigger }),
        { id: "unrest_boiling" },
      ),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(
        withStats({ unrest: CRISIS_THRESHOLDS.unrest.trigger - 1 }),
        { id: "unrest_boiling" },
      ),
    ).toBeNull();

    expect(
      getRecurrenceHintPhrase(
        withStats({ diseaseRisk: CRISIS_THRESHOLDS.diseaseRisk.trigger }),
        { id: "health_emergency" },
      ),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(
        withStats({ diseaseRisk: CRISIS_THRESHOLDS.diseaseRisk.trigger - 1 }),
        { id: "health_emergency" },
      ),
    ).toBeNull();

    expect(
      getRecurrenceHintPhrase(
        withStats({ corruption: CRISIS_THRESHOLDS.corruption.trigger }),
        { id: "corruption_endemic" },
      ),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(
        withStats({ corruption: CRISIS_THRESHOLDS.corruption.trigger - 1 }),
        { id: "corruption_endemic" },
      ),
    ).toBeNull();
  });

  it("the infrastructure dismissal predicate mirrors the condition crisis gate", () => {
    const base = createInitialState();
    const withHealth = (infrastructureHealth: number): GameState => ({
      ...base,
      cityStats: { ...base.cityStats, infrastructureHealth },
    });

    expect(
      getRecurrenceHintPhrase(
        withHealth(CRISIS_THRESHOLDS.infrastructureHealth.trigger),
        { id: "infrastructure_decay" },
      ),
    ).toBeTruthy();
    expect(
      getRecurrenceHintPhrase(
        withHealth(CRISIS_THRESHOLDS.infrastructureHealth.trigger + 1),
        { id: "infrastructure_decay" },
      ),
    ).toBeNull();
  });

  it("one-shot condition stories do not get a recurrence hint", () => {
    const base = createInitialState();
    expect(
      getRecurrenceHintPhrase(base, { id: "population_boom" }),
    ).toBeNull();
    expect(
      getRecurrenceHintPhrase(base, { id: "trade_caravan_arrives" }),
    ).toBeNull();
  });

  it("gives a repeat biosphere crisis a structural remediation", () => {
    const base = createInitialState();
    const critical = {
      ...base,
      cityStats: { ...base.cityStats, biosphere: 10, diseaseRisk: 80 },
    };

    expect(
      getRecurrenceRemediation(critical, { id: "biosphere_ecosystem_collapse" }),
    ).toContain("reclamation domes");
    expect(
      getRecurrenceRemediation(critical, { id: "biosphere_disease_outbreak" }),
    ).toContain("Mass Vaccination Drive");
    expect(
      getRecurrenceRemediation(
        { ...critical, cityStats: { ...critical.cityStats, biosphere: 60 } },
        { id: "biosphere_ecosystem_collapse" },
      ),
    ).toBeNull();
  });

  it("gives a repeat officer crisis a roster-level remediation", () => {
    const base = createInitialState();
    const critical = {
      ...base,
      officers: [
        ...base.officers.slice(0, 1),
        {
          ...base.officers[0],
          id: "corrupt-officer",
          appointed: true,
          corruption: 80,
        },
      ],
    };

    const remediation = getRecurrenceRemediation(critical, { id: "officer_embezzlement" });
    expect(remediation).toContain("Relieve corrupt officers");
    expect(remediation).toContain("replacements");
    expect(
      getRecurrenceRemediation(
        { ...critical, officers: critical.officers.map((o) => ({ ...o, corruption: 10 })) },
        { id: "officer_embezzlement" },
      ),
    ).toBeNull();
  });

  it("maps active repeat crises to their management surfaces", () => {
    const base = createInitialState();
    const biosphereCritical = {
      ...base,
      cityStats: { ...base.cityStats, biosphere: 10, diseaseRisk: 80 },
    };
    const officerCritical = {
      ...base,
      officers: [
        ...base.officers.slice(0, 1),
        { ...base.officers[0], appointed: true, corruption: 80 },
      ],
    };

    expect(getRecurrenceFixTarget(biosphereCritical, { id: "biosphere_ecosystem_collapse" })).toEqual({
      screen: "wildlands",
    });
    expect(getRecurrenceFixTarget(biosphereCritical, { id: "biosphere_disease_outbreak" })).toEqual({
      screen: "construction",
      category: "biosphere",
      highlight: "atmosphericBiofilterStations",
    });
    expect(getRecurrenceFixTarget(officerCritical, { id: "officer_embezzlement" })).toEqual({
      screen: "officers",
    });
    expect(getRecurrenceFixTarget(base, { id: "biosphere_ecosystem_collapse" })).toBeNull();
    expect(getRecurrenceFixTarget(biosphereCritical, { id: "power_crisis" })).toBeNull();
  });

  it("every persistent non-flavor crisis has a dismissal hint definition", () => {
    // Persistent is deliberately opt-in: unmarked condition triggers are
    // one-shot incidents/opportunities, while flavor triggers have their own
    // explicit exemption and must never acquire a recurrence hint.
    const persistentCrises = CONDITION_TRIGGERS.filter(
      (trigger) => trigger.persistent === true && !isFlavorTrigger(trigger),
    );

    for (const trigger of persistentCrises) {
      const definition = RECURRING_EVENT_DEFS[trigger.id];
      expect(
        definition,
        `Persistent crisis "${trigger.id}" needs a recurrence predicate and phrase in recurringEvents.ts`,
      ).toBeDefined();
      expect(
        definition?.stillCritical,
        `Persistent crisis "${trigger.id}" needs a recurrence predicate in recurringEvents.ts`,
      ).toBeTypeOf("function");
      expect(
        definition?.phrase,
        `Persistent crisis "${trigger.id}" needs a recurrence phrase in recurringEvents.ts`,
      ).toMatch(/^[a-z].{5,}$/);
    }
  });

  it("every recurring def has a lowercase sentence-fragment phrase", () => {
    for (const [id, def] of Object.entries(RECURRING_EVENT_DEFS)) {
      expect(def.phrase.length, id).toBeGreaterThan(5);
      // Fragments complete "This warning will return while <phrase>." — no
      // leading capitals or trailing punctuation.
      expect(def.phrase, id).toMatch(/^[a-z]/);
      expect(def.phrase, id).not.toMatch(/[.!]$/);
      expect(def.remediation, id).toMatch(/^[A-Z].{10,}[.!]?$/);
    }
  });
});

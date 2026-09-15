import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  BIO_STAT_RETRIGGER_COOLDOWN_TICKS,
  OFFICER_EVENT_RETRIGGER_COOLDOWN_TICKS,
  processOfficerEvents,
} from "@/engine/tickProcessors";
import {
  applyEventDismissal,
  applyEventMultiResponses,
  applyEventResponse,
} from "@/engine/eventResolution";
import type { GameState, Officer } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #452: a dismissed (or resolved) stat-triggered crisis must NOT re-fire
// on the very next tick while the underlying stat is still bad.
//
// Root cause this file guards against: processBiosphere's canTrigger gate only
// consulted activeEvents + the last 5 eventHistory entries, but none of the
// player clearing paths (dismissEvent / respondToEvent / respondToEventMulti —
// all routed through clearEventAndHealBiome) write the cleared event into
// eventHistory. So the deterministic gate (biosphere <= 15 fires
// biosphere_ecosystem_collapse) re-spawned the SAME crisis one tick after every
// clear, trapping turn-based players in a resolve → END TURN → 1-tick
// interrupt loop.
//
// The fix: clearEventAndHealBiome stamps eventTriggerCooldowns[event.id] at the
// clearing tick, and processBiosphere's canTrigger refuses to re-fire an id
// until BIO_STAT_RETRIGGER_COOLDOWN_TICKS have elapsed. This file proves both
// halves against the REAL tick pipeline (runTick), plus the "not silenced
// forever" guarantee: a stat that stays critical re-raises the crisis once the
// cooldown expires.
// ─────────────────────────────────────────────────────────────────────────────

const COLLAPSE_ID = "biosphere_ecosystem_collapse";

// Same arming trick as the ?midturncrisis=1 demo fixture: biosphere pinned
// under the deterministic collapse threshold (<= 15) with the calm-start
// window zeroed, so processBiosphere WILL fire the collapse on any tick where
// the gate allows it. hasCompletedOnboarding avoids first-run gating paths.
function armedState(): GameState {
  const s = createInitialState();
  return {
    ...s,
    hasCompletedOnboarding: true,
    calmStartTicks: 0,
    cityStats: { ...s.cityStats, biosphere: 5 },
  };
}

// One real tick with the biosphere re-pinned afterwards (runTick nudges stats
// incrementally, so over a long cooldown probe it could drift past the <= 15
// threshold and invalidate the "stat is still critical" premise).
function tickPinned(s: GameState): GameState {
  const next = runTick(s).newState;
  next.cityStats = { ...next.cityStats, biosphere: 5 };
  return next;
}

const hasCollapse = (s: GameState) =>
  s.activeEvents.some((e) => e.id === COLLAPSE_ID);

describe("stat-triggered crisis re-fire cooldown (Task #452)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires the collapse, then a DISMISSAL suppresses the same id for the full cooldown, then it re-raises", () => {
    // Suppress every random spawner (wildlands rolls, condition triggers,
    // officer events, rare discovery, toxic bloom) so the only event dynamics
    // in play are the deterministic stat gates under test.
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    let s = armedState();
    s = tickPinned(s);
    expect(hasCollapse(s)).toBe(true);

    // Player dismisses it on the real path (GameContext.dismissEvent →
    // applyEventDismissal → clearEventAndHealBiome).
    const clearedAtTick = s.totalTicks;
    s = applyEventDismissal(s, COLLAPSE_ID);
    expect(hasCollapse(s)).toBe(false);
    // The clear stamped the per-id cooldown.
    expect(s.eventTriggerCooldowns?.[COLLAPSE_ID]).toBe(clearedAtTick);

    // The very next tick — the exact repro from the e2e run — must NOT
    // re-interrupt, and neither may any tick inside the cooldown window.
    while (s.totalTicks - clearedAtTick < BIO_STAT_RETRIGGER_COOLDOWN_TICKS) {
      s = tickPinned(s);
      if (s.totalTicks - clearedAtTick < BIO_STAT_RETRIGGER_COOLDOWN_TICKS) {
        expect(hasCollapse(s)).toBe(false);
      }
    }

    // NOT silenced forever: the stat is still pinned critical, so the first
    // tick at/after the cooldown boundary re-raises the crisis.
    expect(s.totalTicks - clearedAtTick).toBeGreaterThanOrEqual(
      BIO_STAT_RETRIGGER_COOLDOWN_TICKS,
    );
    if (!hasCollapse(s)) {
      // Boundary tick may land exactly on the threshold; one more tick is the
      // latest the re-raise may arrive.
      s = tickPinned(s);
    }
    expect(hasCollapse(s)).toBe(true);
  });

  it("RESPONDING to the crisis (single and multi paths) stamps the same cooldown", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    let s = armedState();
    s = tickPinned(s);
    const ev = s.activeEvents.find((e) => e.id === COLLAPSE_ID);
    expect(ev).toBeTruthy();

    // Single-response path (GameContext.respondToEvent).
    const response = ev!.responseOptions?.[0] ?? {
      id: "test_ack",
      label: "ACK",
      description: "",
      effects: {},
    };
    const afterRespond = applyEventResponse(s, COLLAPSE_ID, response);
    expect(afterRespond.activeEvents.some((e) => e.id === COLLAPSE_ID)).toBe(false);
    expect(afterRespond.eventTriggerCooldowns?.[COLLAPSE_ID]).toBe(s.totalTicks);

    // Multi-response path (GameContext.respondToEventMulti) — also the
    // zero-responses variant used by some clear flows.
    const afterMulti = applyEventMultiResponses(s, COLLAPSE_ID, []);
    expect(afterMulti.activeEvents.some((e) => e.id === COLLAPSE_ID)).toBe(false);
    expect(afterMulti.eventTriggerCooldowns?.[COLLAPSE_ID]).toBe(s.totalTicks);

    // And the suppressed id genuinely holds through the next tick on the
    // respond path too (the e2e loop repro used dismissal, but respondToEvent
    // shares the gate).
    const next = tickPinned(afterRespond);
    expect(next.activeEvents.some((e) => e.id === COLLAPSE_ID)).toBe(false);
  });

  it("does not delay the FIRST firing of a crisis (cooldown only applies after a player clear)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let s = armedState();
    expect(s.eventTriggerCooldowns?.[COLLAPSE_ID]).toBeUndefined();
    s = tickPinned(s);
    expect(hasCollapse(s)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task #455: the same "dismissed alerts must not nag again right away" contract
// for the officer-event spawner (processOfficerEvents). Officer events are
// random-gated, but their conditions are persistent roster stats (a corrupt
// officer stays corrupt), so a dismissed EMBEZZLEMENT SCANDAL could re-roll on
// the very next officer-event window (every 8 ticks) with an unlucky roll.
// clearEventAndHealBiome already stamps eventTriggerCooldowns[id] on every
// player clearing path; this proves processOfficerEvents' canTrigger now reads
// it — and that a roster that stays problematic re-raises after the cooldown.
// ─────────────────────────────────────────────────────────────────────────────

const EMBEZZLEMENT_ID = "officer_embezzlement";

// A single appointed officer whose ONLY eligible incident is embezzlement
// (corruption > 25). Every other officer-event filter is deliberately missed:
// ambition low, loyalty mid (not > 65, not < 40), competence mid, no rivals,
// fearFactor/popularity low, rank below commissioner, and only one officer
// (systemic_failure needs 3, loyalty_dividend needs 5).
function corruptOfficer(): Officer {
  return {
    id: "test_corrupt_officer",
    name: "Test Officer Venn",
    position: "Procurement Director",
    department: "economic",
    rank: "director",
    competence: 50,
    loyalty: 50,
    ambition: 20,
    corruption: 60,
    popularity: 10,
    fearFactor: 10,
    traits: [],
    backstory: "",
    factionAffiliation: null,
    rivals: [],
    appointed: true,
    appointmentMethod: "direct",
    level: 1,
    xp: 0,
  };
}

// State parked on an officer-event window (totalTicks % 8 === 0) with the
// corrupt officer appointed. processOfficerEvents is called directly so the
// mocked always-pass roll (0.01) cannot detonate unrelated random spawners the
// way a full runTick would.
function officerState(tick: number): GameState {
  const s = createInitialState();
  return {
    ...s,
    hasCompletedOnboarding: true,
    totalTicks: tick,
    officers: [corruptOfficer()],
  };
}

const hasEmbezzlement = (s: GameState) =>
  s.activeEvents.some((e) => e.id === EMBEZZLEMENT_ID);

describe("officer event re-fire cooldown (Task #455)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires, then a DISMISSAL suppresses the same id across officer-event windows until the cooldown elapses", () => {
    // Always pass the 0.15 probability roll — the ONLY thing that may hold the
    // event back is the gate under test.
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    let s = officerState(8);
    processOfficerEvents(s, []);
    expect(hasEmbezzlement(s)).toBe(true);

    // Player dismisses on the real path (GameContext.dismissEvent →
    // applyEventDismissal → clearEventAndHealBiome): the per-id cooldown is
    // stamped at the clearing tick.
    const clearedAtTick = s.totalTicks;
    s = applyEventDismissal(s, EMBEZZLEMENT_ID);
    expect(hasEmbezzlement(s)).toBe(false);
    expect(s.eventTriggerCooldowns?.[EMBEZZLEMENT_ID]).toBe(clearedAtTick);

    // Every officer-event window inside the cooldown stays quiet even though
    // the officer is still corrupt and the roll always passes.
    for (
      let tick = clearedAtTick + 8;
      tick - clearedAtTick < OFFICER_EVENT_RETRIGGER_COOLDOWN_TICKS;
      tick += 8
    ) {
      s = { ...s, totalTicks: tick };
      processOfficerEvents(s, []);
      expect(hasEmbezzlement(s)).toBe(false);
    }

    // NOT silenced forever: the first window at/after the cooldown boundary
    // re-raises the incident (the roster is still problematic).
    const refireTick =
      clearedAtTick +
      Math.ceil(OFFICER_EVENT_RETRIGGER_COOLDOWN_TICKS / 8) * 8;
    s = { ...s, totalTicks: refireTick };
    processOfficerEvents(s, []);
    expect(hasEmbezzlement(s)).toBe(true);
  });

  it("RESPONDING stamps the same cooldown and the next window stays quiet", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    let s = officerState(8);
    processOfficerEvents(s, []);
    const ev = s.activeEvents.find((e) => e.id === EMBEZZLEMENT_ID);
    expect(ev).toBeTruthy();

    const response = ev!.responseOptions?.[0] ?? {
      id: "test_ack",
      label: "ACK",
      description: "",
      effects: {},
    };
    let after = applyEventResponse(s, EMBEZZLEMENT_ID, response);
    expect(after.activeEvents.some((e) => e.id === EMBEZZLEMENT_ID)).toBe(false);
    expect(after.eventTriggerCooldowns?.[EMBEZZLEMENT_ID]).toBe(s.totalTicks);

    after = { ...after, totalTicks: after.totalTicks + 8 };
    processOfficerEvents(after, []);
    expect(after.activeEvents.some((e) => e.id === EMBEZZLEMENT_ID)).toBe(false);
  });

  it("does not delay the FIRST firing (no stamp, no suppression)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const s = officerState(8);
    expect(s.eventTriggerCooldowns?.[EMBEZZLEMENT_ID]).toBeUndefined();
    processOfficerEvents(s, []);
    expect(hasEmbezzlement(s)).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { processOfficerEvents } from "@/engine/tickProcessors";
import { applyEventDismissal } from "@/engine/eventResolution";
import { CONDITION_TRIGGERS, generateConditionEvent } from "@/engine/eventTriggers";
import type { GameState, Officer, TickEntry } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #458: when a spawner re-fires an id that carries a prior
// eventTriggerCooldowns stamp, the spawned event must be marked repeat: true
// so the UI can badge it "STILL UNRESOLVED" — a returning known crisis must
// not read like a brand-new incident. First-time firings (no stamp) must stay
// unmarked. Covers all three spawn sites that consult the stamps:
//   - processBiosphere → triggerBioEvent   (via the real runTick pipeline)
//   - processOfficerEvents → triggerOfficerEvent
//   - generateConditionEvent (stamps are written at fire time there)
// ─────────────────────────────────────────────────────────────────────────────

const COLLAPSE_ID = "biosphere_ecosystem_collapse";

// Same arming fixture as crisisRetriggerCooldown.test.ts: biosphere pinned
// under the deterministic collapse threshold with calm-start zeroed.
function armedState(): GameState {
  const s = createInitialState();
  return {
    ...s,
    hasCompletedOnboarding: true,
    calmStartTicks: 0,
    cityStats: { ...s.cityStats, biosphere: 5 },
  };
}

function tickPinned(s: GameState): GameState {
  const next = runTick(s).newState;
  next.cityStats = { ...next.cityStats, biosphere: 5 };
  return next;
}

const findCollapse = (s: GameState) =>
  s.activeEvents.find((e) => e.id === COLLAPSE_ID);

describe("biosphere repeat marker (Task #458)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first firing is NOT marked repeat; the post-cooldown re-fire IS", () => {
    // Suppress every random spawner so only the deterministic stat gate fires.
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    let s = armedState();
    s = tickPinned(s);
    const first = findCollapse(s);
    expect(first).toBeTruthy();
    // First-time alert: unchanged, no repeat marker.
    expect(first!.repeat).toBeUndefined();

    // Player dismisses on the real path → cooldown stamp written.
    const clearedAtTick = s.totalTicks;
    s = applyEventDismissal(s, COLLAPSE_ID);
    expect(s.eventTriggerCooldowns?.[COLLAPSE_ID]).toBe(clearedAtTick);

    // Tick through the cooldown until the still-critical stat re-raises it.
    let refire = findCollapse(s);
    for (let i = 0; i < 20 && !refire; i++) {
      s = tickPinned(s);
      refire = findCollapse(s);
    }
    expect(refire).toBeTruthy();
    // The returning alert is visibly a repeat.
    expect(refire!.repeat).toBe(true);
    expect(refire!.returnCount).toBe(1);
    expect(s.eventRecurrenceCounts?.[COLLAPSE_ID]).toBe(1);

    // A second dismiss-and-refire cycle keeps the durable counter rather than
    // restarting at one.
    s = applyEventDismissal(s, COLLAPSE_ID);
    let secondRefire = findCollapse(s);
    for (let i = 0; i < 20 && !secondRefire; i++) {
      s = tickPinned(s);
      secondRefire = findCollapse(s);
    }
    expect(secondRefire).toBeTruthy();
    expect(secondRefire!.repeat).toBe(true);
    expect(secondRefire!.returnCount).toBe(2);
    expect(s.eventRecurrenceCounts?.[COLLAPSE_ID]).toBe(2);
  });
});

// ── Officer incident path ────────────────────────────────────────────────────

const EMBEZZLEMENT_ID = "officer_embezzlement";

// Officer whose ONLY eligible incident is embezzlement (corruption > 25) —
// same fixture rationale as crisisRetriggerCooldown.test.ts.
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

function officerState(tick: number): GameState {
  const s = createInitialState();
  return {
    ...s,
    hasCompletedOnboarding: true,
    totalTicks: tick,
    officers: [corruptOfficer()],
  };
}

const findEmbezzlement = (s: GameState) =>
  s.activeEvents.find((e) => e.id === EMBEZZLEMENT_ID);

describe("officer incident repeat marker (Task #458)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first firing is NOT marked repeat; the post-cooldown re-fire IS", () => {
    // Always pass the probability roll.
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    const s = officerState(8);
    processOfficerEvents(s, []);
    const first = findEmbezzlement(s);
    expect(first).toBeTruthy();
    expect(first!.repeat).toBeUndefined();

    // Dismiss → stamp → jump far past the cooldown to an officer-event window.
    let cleared = applyEventDismissal(s, EMBEZZLEMENT_ID);
    expect(cleared.eventTriggerCooldowns?.[EMBEZZLEMENT_ID]).toBeDefined();
    cleared = { ...cleared, totalTicks: cleared.totalTicks + 64 };
    processOfficerEvents(cleared, []);
    const refire = findEmbezzlement(cleared);
    expect(refire).toBeTruthy();
    expect(refire!.repeat).toBe(true);

    const secondCleared = applyEventDismissal(cleared, EMBEZZLEMENT_ID);
    const secondCycle = {
      ...secondCleared,
      totalTicks: secondCleared.totalTicks + 64,
    };
    processOfficerEvents(secondCycle, []);
    const secondRefire = findEmbezzlement(secondCycle);
    expect(secondRefire).toBeTruthy();
    expect(secondRefire!.returnCount).toBe(2);
    expect(secondCycle.eventRecurrenceCounts?.[EMBEZZLEMENT_ID]).toBe(2);
  });
});

// ── Spawn-site log wording (Task #464) ──────────────────────────────────────
// The tick-log entry pushed at spawn time (which also feeds the news-ticker
// "new incident" announcement) must say the crisis RESURFACED on a repeat
// spawn instead of reading like a brand-new incident. First-time spawns keep
// their original per-trigger wording.

const BIO_REPEAT_REASON = "Known crisis resurfaced — still unresolved";
const OFFICER_REPEAT_REASON = "Known officer incident resurfaced — still unresolved";

describe("repeat spawn log wording (Task #464)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bio: first fire keeps the trigger wording, the re-fire logs resurfaced wording", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    let s = armedState();
    const first = runTick(s);
    s = first.newState;
    s.cityStats = { ...s.cityStats, biosphere: 5 };
    expect(findCollapse(s)).toBeTruthy();
    // First-time spawn: original stat-gate wording, no resurfaced phrasing.
    expect(first.entries.some((e) => e.reason === "Critically low biosphere triggered collapse event")).toBe(true);
    expect(first.entries.some((e) => e.reason === BIO_REPEAT_REASON)).toBe(false);

    s = applyEventDismissal(s, COLLAPSE_ID);

    let refireEntries: TickEntry[] | null = null;
    for (let i = 0; i < 20 && !refireEntries; i++) {
      const res = runTick(s);
      s = res.newState;
      s.cityStats = { ...s.cityStats, biosphere: 5 };
      if (findCollapse(s)) refireEntries = res.entries;
    }
    expect(refireEntries).toBeTruthy();
    // The returning alert announces itself as the same known crisis.
    expect(refireEntries!.some((e) => e.reason === BIO_REPEAT_REASON)).toBe(true);
    expect(refireEntries!.some((e) => e.reason === "Critically low biosphere triggered collapse event")).toBe(false);
  });

  it("officer: first fire keeps the generic wording, the re-fire logs resurfaced wording", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    const s = officerState(8);
    const firstEntries: TickEntry[] = [];
    processOfficerEvents(s, firstEntries);
    expect(findEmbezzlement(s)).toBeTruthy();
    expect(firstEntries.some((e) => e.reason === "Officer incident requires your attention")).toBe(true);
    expect(firstEntries.some((e) => e.reason === OFFICER_REPEAT_REASON)).toBe(false);

    let cleared = applyEventDismissal(s, EMBEZZLEMENT_ID);
    cleared = { ...cleared, totalTicks: cleared.totalTicks + 64 };
    const refireEntries: TickEntry[] = [];
    processOfficerEvents(cleared, refireEntries);
    expect(findEmbezzlement(cleared)).toBeTruthy();
    expect(refireEntries.some((e) => e.reason === OFFICER_REPEAT_REASON)).toBe(true);
    expect(refireEntries.some((e) => e.reason === "Officer incident requires your attention")).toBe(false);
  });

  it("repeat wording carries no emojis or exclamation marks", () => {
    for (const copy of [BIO_REPEAT_REASON, OFFICER_REPEAT_REASON]) {
      expect(copy).not.toMatch(/!/);
      expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

// ── generateConditionEvent path ──────────────────────────────────────────────
// Condition-trigger stamps are written at FIRE time (not clear time), so any
// re-fire of the same trigger id after its cooldown carries a prior stamp.
// Task #480 scoped the badge to genuine stat-gated crises: flavor triggers
// (FLAVOR_TRIGGER_IDS / flavor: true) are exempt because their re-fires are
// new stories, not the same unresolved condition. This suite therefore pins
// the contract on crime_wave_surge, a real crisis trigger, and makes the
// pick deterministic by stamping every OTHER trigger onto a fresh cooldown.

describe("condition-trigger repeat marker (Task #458)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Fresh stamps for every trigger id except `keepId`, written at tick-1 so
  // each is inside its own base cooldown and cannot compete for the pick.
  function blockAllExcept(keepId: string, tick: number): Record<string, number> {
    const cooldowns: Record<string, number> = {};
    for (const trigger of CONDITION_TRIGGERS) {
      if (trigger.id !== keepId) cooldowns[trigger.id] = tick - 1;
    }
    return cooldowns;
  }

  it("marks a crisis re-fire repeat when a prior stamp exists, leaves the first fire unmarked", () => {
    // Roll 0 always passes the fire gate and selects the sole eligible trigger.
    vi.spyOn(Math, "random").mockReturnValue(0);

    const base = createInitialState();
    const s: GameState = {
      ...base,
      hasCompletedOnboarding: true,
      totalTicks: 100,
      cityStats: { ...base.cityStats, crime: 100 },
      eventTriggerCooldowns: blockAllExcept("crime_wave_surge", 100),
    };

    const first = generateConditionEvent(s);
    expect(first).toBeTruthy();
    expect(first!.event.id).toBe("crime_wave_surge");
    expect(first!.event.repeat).toBeUndefined();
    expect(first!.cooldowns.crime_wave_surge).toBe(100);

    // Same crisis far past the cooldown, with the stamp now present.
    const laterTick = 600;
    const later: GameState = {
      ...s,
      totalTicks: laterTick,
      eventTriggerCooldowns: {
        ...blockAllExcept("crime_wave_surge", laterTick),
        crime_wave_surge: first!.cooldowns.crime_wave_surge,
      },
      // Keep active/history clear so the same trigger stays eligible.
      activeEvents: [],
      eventHistory: [],
    };
    const second = generateConditionEvent(later);
    expect(second).toBeTruthy();
    expect(second!.event.id).toBe("crime_wave_surge");
    // The returning crisis is visibly a repeat.
    expect(second!.event.repeat).toBe(true);
  });
});

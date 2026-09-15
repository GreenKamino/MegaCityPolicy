import { describe, expect, it } from "vitest";

import {
  WAR_EVENT_POOL,
  applyEventEffects,
  getAvailableWarEvents,
} from "@/engine/events";
import {
  CEASEFIRE_HOLDS_ID_PREFIX,
  applyEventDismissal,
  applyEventMultiResponses,
  applyEventResponse,
} from "@/engine/eventResolution";
import { dedupeActiveEventsById, migrateState } from "@/engine/saveLoad";
import { createInitialState } from "@/engine/initialState";
import { ARRAY_CAPS } from "@/engine/sanitizer";
import type { EventResponse, GameEvent, GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #562: duplicate ceasefire proposals + infinite Accept exploit.
// These tests pin the four repair layers:
//   1. Spawn dedup: a war event whose id is already active can never be
//      picked again, and original-pool war events now honor retrigger
//      cooldown stamps (previously only pack ids did).
//   2. Resolution idempotency: responding to / dismissing an event id that is
//      not in activeEvents is a hard no-op — no effects, no news, no stamps.
//      This closes the exploit where a stale duplicate card let the player
//      farm ACCEPT TERMS effects forever.
//   3. Ceasefire diplomacy: accepting or countering the proposal cools the
//      instigating faction below the hostile threshold (deterministically),
//      so the generator stops proposing ceasefires for an ended war. Legacy
//      events without a factionId stamp fall back to the [NAME CONFLICT]
//      description prefix.
//   4. Save repair: migrateState dedupes activeEvents by id (oldest wins) so
//      pre-fix saves shed their piled-up copies on load.
// No multi-tick RNG runs here — every assertion is deterministic.
// ─────────────────────────────────────────────────────────────────────────────

const CEASEFIRE_ID = "war_ceasefire_offer";

const ceasefireTemplate = WAR_EVENT_POOL.find((e) => e.id === CEASEFIRE_ID)!;

function acceptResponse(): EventResponse {
  return ceasefireTemplate.responseOptions!.find((r) => r.id === "ceasefire_accept")!;
}

function rejectResponse(): EventResponse {
  return ceasefireTemplate.responseOptions!.find((r) => r.id === "ceasefire_reject")!;
}

function counterResponse(): EventResponse {
  return ceasefireTemplate.responseOptions!.find((r) => r.id === "ceasefire_counter")!;
}

function ceasefireHoldsMessages(state: GameState) {
  return (state.messages ?? []).filter((m) => m.id.startsWith(CEASEFIRE_HOLDS_ID_PREFIX));
}

function baseState(): GameState {
  const base = createInitialState();
  return {
    ...base,
    hasCompletedOnboarding: true,
    totalTicks: 500,
    activeEvents: [],
    eventHistory: [],
    eventTriggerCooldowns: {},
    factions: base.factions.map((f, i) =>
      i === 0 ? { ...f, threat: 90 } : { ...f, threat: 10 },
    ),
  };
}

function ceasefireEvent(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    ...ceasefireTemplate,
    timestamp: Date.now(),
    resolved: false,
    ...overrides,
  };
}

describe("war event spawn dedup (Task #562)", () => {
  it("an id already in activeEvents is never available to spawn", () => {
    const s = baseState();
    s.activeEvents = [ceasefireEvent()];
    const available = getAvailableWarEvents(s);
    expect(available.some((e) => e.id === CEASEFIRE_ID)).toBe(false);
    // The rest of the pool is unaffected.
    expect(available.length).toBeGreaterThan(0);
  });

  it("original-pool war events honor cooldown stamps from player clears", () => {
    const s = baseState();
    // clearEventAndHealBiome stamps eventTriggerCooldowns[id] at resolve time;
    // pre-#562 the war filter ignored the stamp for non-pack ids.
    s.eventTriggerCooldowns = { [CEASEFIRE_ID]: s.totalTicks - 1 };
    expect(getAvailableWarEvents(s).some((e) => e.id === CEASEFIRE_ID)).toBe(false);

    // Once the default cooldown (3 days at 96 ticks/day) lapses it returns.
    s.eventTriggerCooldowns = { [CEASEFIRE_ID]: s.totalTicks - 3 * 96 - 1 };
    expect(getAvailableWarEvents(s).some((e) => e.id === CEASEFIRE_ID)).toBe(true);
  });

  it("applyEventEffects refuses to append a second copy of an active id", () => {
    const s = baseState();
    const first = applyEventEffects(s, ceasefireEvent());
    expect(first.activeEvents.filter((e) => e.id === CEASEFIRE_ID)).toHaveLength(1);

    const second = applyEventEffects(first, ceasefireEvent());
    expect(second).toBe(first);
    expect(second.activeEvents.filter((e) => e.id === CEASEFIRE_ID)).toHaveLength(1);
  });
});

describe("resolution idempotency (Task #562)", () => {
  it("responding to an id that is not active is a hard no-op", () => {
    const s = baseState();
    expect(applyEventResponse(s, CEASEFIRE_ID, acceptResponse())).toBe(s);
    expect(applyEventMultiResponses(s, CEASEFIRE_ID, [acceptResponse()])).toBe(s);
    expect(applyEventDismissal(s, CEASEFIRE_ID)).toBe(s);
  });

  it("the second Accept on the same event applies nothing (exploit closed)", () => {
    const s = baseState();
    s.activeEvents = [ceasefireEvent({ factionId: s.factions[0].id })];

    const once = applyEventResponse(s, CEASEFIRE_ID, acceptResponse());
    expect(once.activeEvents.some((e) => e.id === CEASEFIRE_ID)).toBe(false);
    // Accept grants +8 happiness (clamped) exactly once.
    expect(once.cityStats.happiness).toBe(
      Math.min(100, s.cityStats.happiness + 8),
    );

    const twice = applyEventResponse(once, CEASEFIRE_ID, acceptResponse());
    expect(twice).toBe(once);
  });
});

describe("ceasefire diplomacy (Task #562)", () => {
  it("accepting cools the stamped faction below the hostile threshold", () => {
    const s = baseState();
    const factionId = s.factions[0].id;
    s.activeEvents = [ceasefireEvent({ factionId })];
    s.warEventOccurrences = {
      [factionId]: { war_evt_field_hospital_overflow: 4 },
      [s.factions[1].id]: { war_evt_field_hospital_overflow: 1 },
    };

    const after = applyEventResponse(s, CEASEFIRE_ID, acceptResponse());
    const faction = after.factions.find((f) => f.id === factionId)!;
    expect(faction.threat).toBeLessThan(70);
    // Deterministic: min(90 - 15, 65) = 65.
    expect(faction.threat).toBe(65);
    // Other factions untouched.
    for (const f of after.factions) {
      if (f.id !== factionId) {
        expect(f.threat).toBe(s.factions.find((x) => x.id === f.id)!.threat);
      }
    }
    // The cooled faction's next escalation is a new conflict. Other factions'
    // counts remain intact so their active wars keep their own limits.
    expect(after.warEventOccurrences).toEqual({
      [s.factions[1].id]: { war_evt_field_hospital_overflow: 1 },
    });
  });

  it("legacy events without factionId cool via the [NAME CONFLICT] prefix", () => {
    const s = baseState();
    const faction = s.factions[0];
    s.activeEvents = [
      ceasefireEvent({
        description: `[${faction.name.toUpperCase()} CONFLICT] ${ceasefireTemplate.description}`,
      }),
    ];

    const after = applyEventResponse(s, CEASEFIRE_ID, acceptResponse());
    expect(after.factions.find((f) => f.id === faction.id)!.threat).toBe(65);
  });

  it("rejecting the ceasefire leaves the conflict hot", () => {
    const s = baseState();
    const factionId = s.factions[0].id;
    s.activeEvents = [ceasefireEvent({ factionId })];

    const after = applyEventResponse(s, CEASEFIRE_ID, rejectResponse());
    expect(after.factions.find((f) => f.id === factionId)!.threat).toBe(90);
  });
});

describe("ceasefire holds signal (Task #564)", () => {
  it("accepting posts ONE prepended inbox confirmation naming the faction", () => {
    const s = baseState();
    const faction = s.factions[0];
    s.activeEvents = [ceasefireEvent({ factionId: faction.id })];

    const after = applyEventResponse(s, CEASEFIRE_ID, acceptResponse());
    const holds = ceasefireHoldsMessages(after);
    expect(holds).toHaveLength(1);
    // Prepended: the confirmation lands at the TOP of the inbox.
    expect(after.messages![0].id).toBe(holds[0].id);
    // Message contract the ticker echo and inbox rely on.
    expect(holds[0].title).toBe("CEASEFIRE HOLDS");
    expect(holds[0].body).toContain(faction.name);
    expect(holds[0].body).toContain("standing down");
    expect(holds[0].category).toBe("world-news");
    // Copy rules: no exclamation marks, no emoji.
    expect(holds[0].body).not.toMatch(/!/);
    expect(holds[0].body).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("countering posts the confirmation too", () => {
    const s = baseState();
    const faction = s.factions[0];
    s.activeEvents = [ceasefireEvent({ factionId: faction.id })];

    const after = applyEventResponse(s, CEASEFIRE_ID, counterResponse());
    const holds = ceasefireHoldsMessages(after);
    expect(holds).toHaveLength(1);
    expect(holds[0].body).toContain(faction.name);
  });

  it("rejecting posts nothing — the conflict stays hot on purpose", () => {
    const s = baseState();
    s.activeEvents = [ceasefireEvent({ factionId: s.factions[0].id })];

    const after = applyEventResponse(s, CEASEFIRE_ID, rejectResponse());
    expect(ceasefireHoldsMessages(after)).toHaveLength(0);
  });

  it("dismissing the proposal posts nothing", () => {
    const s = baseState();
    s.activeEvents = [ceasefireEvent({ factionId: s.factions[0].id })];

    const after = applyEventDismissal(s, CEASEFIRE_ID);
    expect(ceasefireHoldsMessages(after)).toHaveLength(0);
  });

  it("legacy events name the faction via the [NAME CONFLICT] fallback", () => {
    const s = baseState();
    const faction = s.factions[0];
    s.activeEvents = [
      ceasefireEvent({
        description: `[${faction.name.toUpperCase()} CONFLICT] ${ceasefireTemplate.description}`,
      }),
    ];

    const after = applyEventResponse(s, CEASEFIRE_ID, acceptResponse());
    const holds = ceasefireHoldsMessages(after);
    expect(holds).toHaveLength(1);
    expect(holds[0].body).toContain(faction.name);
  });

  it("an unresolvable instigator emits no confirmation (and no threat change)", () => {
    const s = baseState();
    s.activeEvents = [ceasefireEvent({ description: "No prefix here." })];

    const after = applyEventResponse(s, CEASEFIRE_ID, acceptResponse());
    expect(ceasefireHoldsMessages(after)).toHaveLength(0);
    expect(after.factions.find((f) => f.id === s.factions[0].id)!.threat).toBe(90);
  });

  it("a full inbox stays capped when the confirmation is prepended", () => {
    const s = baseState();
    s.activeEvents = [ceasefireEvent({ factionId: s.factions[0].id })];
    s.messages = Array.from({ length: ARRAY_CAPS.messages }, (_, i) => ({
      id: `filler-${i}`,
      timestamp: { day: 1, tick: 0 } as any,
      tick: 0,
      category: "update" as const,
      title: "FILLER",
      body: "Filler message.",
      read: true,
      priority: "low" as const,
    }));

    const after = applyEventResponse(s, CEASEFIRE_ID, acceptResponse());
    expect(after.messages!.length).toBeLessThanOrEqual(ARRAY_CAPS.messages);
    expect(after.messages![0].id.startsWith(CEASEFIRE_HOLDS_ID_PREFIX)).toBe(true);
  });
});

describe("save repair (Task #562)", () => {
  it("dedupeActiveEventsById keeps the first (oldest) copy of each id", () => {
    const a = ceasefireEvent({ timestamp: 1 });
    const b = ceasefireEvent({ timestamp: 2 });
    const other = ceasefireEvent({ id: "war_supply_convoy", timestamp: 3 });
    const out = dedupeActiveEventsById([a, b, other, { ...other, timestamp: 4 }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(a);
    expect(out[1].id).toBe("war_supply_convoy");
    expect(out[1].timestamp).toBe(3);
  });

  it("migrateState strips duplicate active events from pre-fix saves", () => {
    const s = baseState();
    s.activeEvents = [
      ceasefireEvent({ timestamp: 1 }),
      ceasefireEvent({ timestamp: 2 }),
      ceasefireEvent({ timestamp: 3 }),
    ];
    const migrated = migrateState(s);
    const copies = migrated.activeEvents.filter((e) => e.id === CEASEFIRE_ID);
    expect(copies).toHaveLength(1);
    expect(copies[0].timestamp).toBe(1);
  });
});

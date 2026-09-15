import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EVENT_POOL,
  EXPANSION_EVENT_POOL,
  WAR_EVENT_POOL,
  WAR_EVENT_OCCURRENCE_IDS,
  applyEventEffects,
  generateRandomEvent,
  getAvailableWarEvents,
  resetEndedWarEventOccurrences,
} from "@/engine/events";
import {
  WARTIME_MASTER_COOLDOWN_TICKS,
  WARTIME_MASTER_EVENTS,
  wartimeEventCustodySource,
  wartimeEventNewsItem,
} from "@/engine/wartimeEventPack";
import { getIncarcerationSummary } from "@/engine/custody";
import { applyEventResponse } from "@/engine/eventResolution";
import { createInitialState } from "@/engine/initialState";
import { migrateState, unwrapSave, wrapSave } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";
import type { GameState } from "@/engine/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task #540: Wartime Events Master pack. These tests pin four things:
//   1. Pack integrity: all 12 events are spread into WAR_EVENT_POOL with
//      unique ids, a cooldown entry, a news headline, and only trigger-effect
//      keys the applyEventEffects dispatcher actually applies (dead keys are
//      silently dropped — a card that "does nothing" ships without this).
//   2. War-only firing: without a hostile faction (threat >= 70 — the war
//      pool's operative "at war" gate) a pack event can never fire; the pack
//      lives ONLY in WAR_EVENT_POOL, never the ungated random pools.
//   3. Spawn contract: while at war a pack event fires with a faction stamp,
//      no narrative payload, stamps its retrigger cooldown, applies its
//      effects, and pushes its WAR DESK headline onto the news feed.
//   4. Cooldowns: a freshly stamped pack event cannot re-fire inside its
//      cooldown window and becomes eligible again after it lapses.
// ─────────────────────────────────────────────────────────────────────────────

const PACK_IDS = WARTIME_MASTER_EVENTS.map((e) => e.id);
const PACK_OCCURRENCE_LIMITS: Record<string, number> = {
  war_evt_air_raid_false_alarm: 2,
  war_evt_field_hospital_overflow: 4,
  war_evt_munitions_factory_explosion: 2,
  war_evt_enemy_broadcast_hijack: 3,
  war_evt_conscript_train_missing: 2,
  war_evt_power_grid_targeted: 5,
  war_evt_refugee_gate_crush: 4,
  war_evt_fuel_ration_black_market: 4,
  war_evt_unexploded_ordnance_school: 3,
  war_evt_allied_unit_brawl: 2,
  war_evt_frontline_factory_mutiny: 3,
  war_evt_enemy_prisoners_food_crisis: 2,
};
const LEGACY_OCCURRENCE_ID = "war_frontline_report";

// Every key applyEventEffects dispatches for GameEvent.effects. A pack event
// using any other key would silently do nothing at spawn time.
const APPLIED_EVENT_EFFECT_KEYS = new Set([
  "credits",
  "food",
  "water",
  "power",
  "fuel",
  "unrest",
  "crime",
  "happiness",
  "lawOrder",
  "corruption",
  "employment",
  "defenseRating",
  "medSupplies",
  "tradeIncome",
]);

// hasCompletedOnboarding true + totalTicks 500 puts the state past every
// onboarding window and far below the first anniversary threshold, so
// generateRandomEvent reaches the war branch deterministically.
function warState(): GameState {
  const base = createInitialState();
  const factions = base.factions.map((f, i) =>
    i === 0 ? { ...f, threat: 90 } : { ...f, threat: 10 },
  );
  return {
    ...base,
    hasCompletedOnboarding: true,
    totalTicks: 500,
    factions,
    activeEvents: [],
    eventHistory: [],
    eventTriggerCooldowns: {},
  };
}

function peaceState(): GameState {
  const base = warState();
  return {
    ...base,
    factions: base.factions.map((f) => ({ ...f, threat: 10 })),
  };
}

// generateRandomEvent's war branch consumes Math.random three times:
// the 20% gate, the event pick, then the faction pick.
function mockWarRoll(eventFraction: number) {
  const seq = [0.1, eventFraction, 0];
  let call = 0;
  return vi
    .spyOn(Math, "random")
    .mockImplementation(() => seq[Math.min(call++, seq.length - 1)]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("wartime pack integrity", () => {
  it("all 12 pack events are in WAR_EVENT_POOL and ids stay unique pool-wide", () => {
    expect(WARTIME_MASTER_EVENTS).toHaveLength(12);
    const poolIds = WAR_EVENT_POOL.map((e) => e.id);
    for (const id of PACK_IDS) {
      expect(poolIds, `pack event "${id}" missing from WAR_EVENT_POOL`).toContain(id);
    }
    expect(new Set(poolIds).size, "duplicate ids inside WAR_EVENT_POOL").toBe(poolIds.length);
  });

  it("every pack event has its source cooldown and per-war limit, a headline, responses, and only applied trigger-effect keys", () => {
    const state = warState();
    for (const event of WARTIME_MASTER_EVENTS) {
      expect(
        WARTIME_MASTER_COOLDOWN_TICKS[event.id],
        `pack event "${event.id}" has no retrigger cooldown`,
      ).toBeGreaterThan(0);
      expect(
        event.maxOccurrencesPerWar,
        `pack event "${event.id}" has no source maxOccurrencesPerWar`,
      ).toBe(PACK_OCCURRENCE_LIMITS[event.id]);

      const news = wartimeEventNewsItem(state, event.id);
      expect(news, `pack event "${event.id}" has no linked headline`).not.toBeNull();
      expect(news!.headline).toContain("WAR DESK");
      expect(news!.headline).not.toMatch(/!/);
      expect(news!.id).toBe(`news-${event.id}-${state.totalTicks}`);
      expect(news!.tick).toBe(state.totalTicks);

      expect(event.responseOptions?.length ?? 0, `"${event.id}" needs choices`).toBe(3);

      for (const key of Object.keys(event.effects)) {
        expect(
          APPLIED_EVENT_EFFECT_KEYS.has(key),
          `pack event "${event.id}" trigger-effect key "${key}" is silently dropped by applyEventEffects`,
        ).toBe(true);
      }
    }
  });

  it("returns null headlines for non-pack ids so applyEventEffects can call it unconditionally", () => {
    expect(wartimeEventNewsItem(warState(), "gang_war")).toBeNull();
    expect(wartimeEventNewsItem(warState(), "war_supply_convoy")).toBeNull();
  });

  it("pack events live only in the war pool, never the ungated random pools", () => {
    const randomPoolIds = new Set(
      [...EVENT_POOL, ...EXPANSION_EVENT_POOL].map((e) => e.id),
    );
    for (const id of PACK_IDS) {
      expect(randomPoolIds.has(id), `pack event "${id}" leaked into an ungated pool`).toBe(false);
    }
  });
});

describe("war-only firing", () => {
  it("never fires a pack event when no faction is hostile", () => {
    const state = peaceState();
    for (let i = 0; i < 200; i++) {
      const result = generateRandomEvent(state);
      if (result) {
        expect(PACK_IDS, `pack event fired at peace: "${result.event.id}"`).not.toContain(
          result.event.id,
        );
      }
    }
  });

  it("fires a pack event at war without prose and stamps its cooldown", () => {
    const state = warState();
    const idx = WAR_EVENT_POOL.findIndex((e) => e.id === "war_evt_field_hospital_overflow");
    expect(idx).toBeGreaterThanOrEqual(0);
    mockWarRoll((idx + 0.5) / WAR_EVENT_POOL.length);

    const result = generateRandomEvent(state);
    expect(result).not.toBeNull();
    expect(result!.event.id).toBe("war_evt_field_hospital_overflow");
    expect(result!.event).not.toHaveProperty("description");
    expect(result!.cooldowns?.["war_evt_field_hospital_overflow"]).toBe(state.totalTicks);
  });

  it("original war pool events stamp spawn cooldowns too (Task #562)", () => {
    // Pre-#562 the original pool spawned cooldown-free, so a static-id event
    // like war_ceasefire_offer could re-fire tick after tick. Every war event
    // now stamps its spawn tick.
    const state = warState();
    const idx = WAR_EVENT_POOL.findIndex((e) => e.id === WAR_EVENT_POOL[0].id);
    expect(PACK_IDS).not.toContain(WAR_EVENT_POOL[0].id);
    mockWarRoll((idx + 0.5) / WAR_EVENT_POOL.length);

    const result = generateRandomEvent(state);
    expect(result).not.toBeNull();
    expect(result!.event.id).toBe(WAR_EVENT_POOL[0].id);
    expect(result!.cooldowns?.[WAR_EVENT_POOL[0].id]).toBe(state.totalTicks);
    // The instigating faction is stamped so ceasefire resolution can cool it.
    expect(result!.event.factionId).toBe(state.factions[0].id);
  });

  it("preserves legacy prose on load and resolves old ceasefires by prefix", () => {
    const base = warState();
    const faction = base.factions[0];
    const template = WAR_EVENT_POOL.find((event) => event.id === "war_ceasefire_offer")!;
    const legacyEvent = {
      ...template,
      description: `[${faction.name.toUpperCase()} CONFLICT] Legacy proposal`,
      timestamp: base.totalTicks,
      resolved: false,
    };
    const loaded = sanitizeState(migrateState({
      ...base,
      activeEvents: [legacyEvent],
    }));
    expect(loaded.activeEvents[0].description).toContain("Legacy proposal");

    const response = template.responseOptions!.find((r) => r.id === "ceasefire_accept")!;
    const resolved = applyEventResponse(loaded, legacyEvent.id, response);
    expect(resolved.factions.find((f) => f.id === faction.id)?.threat).toBeLessThan(
      faction.threat,
    );
  });
});

describe("spawn effects and news", () => {
  it("applies trigger effects and pushes the WAR DESK headline when the event lands", () => {
    const state = warState();
    const idx = WAR_EVENT_POOL.findIndex((e) => e.id === "war_evt_field_hospital_overflow");
    mockWarRoll((idx + 0.5) / WAR_EVENT_POOL.length);
    const result = generateRandomEvent(state)!;
    vi.restoreAllMocks();

    const after = applyEventEffects(state, result.event);

    expect(after.activeEvents.some((e) => e.id === "war_evt_field_hospital_overflow")).toBe(true);
    // Template: { happiness: -4, unrest: 2, medSupplies: -20 }
    expect(after.cityStats.happiness).toBe(Math.max(0, state.cityStats.happiness - 4));
    expect(after.cityStats.unrest).toBe(Math.min(100, state.cityStats.unrest + 2));
    expect(after.resources.medSupplies).toBe(Math.max(0, state.resources.medSupplies - 20));

    const news = (after.newsFeed ?? [])[0];
    expect(news).toBeDefined();
    expect(news.id).toBe(`news-war_evt_field_hospital_overflow-${state.totalTicks}`);
    expect(news.headline).toContain("WAR DESK: TRAUMA WARDS EXCEED EMERGENCY CAPACITY");
  });

  it("registers the prisoner-compound event as one deduplicated aggregate POW group", () => {
    const state = warState();
    const event = {
      ...WARTIME_MASTER_EVENTS.find((entry) => entry.id === "war_evt_enemy_prisoners_food_crisis")!,
      timestamp: 123456,
      resolved: false,
      factionId: state.factions[0].id,
    };
    const source = wartimeEventCustodySource(state, event);
    expect(source).toMatchObject({
      id: `wartime-prisoners-war_evt_enemy_prisoners_food_crisis-${state.factions[0].id}-123456`,
      count: 24,
      originId: state.factions[0].id,
    });

    const after = applyEventEffects(state, event);
    expect(getIncarcerationSummary(after).pows).toBe(24);
    expect(after.custody?.incarceration.groups.filter((group) => group.role === "pow")).toHaveLength(1);

    const replayed = applyEventEffects(after, event);
    expect(getIncarcerationSummary(replayed).pows).toBe(24);
    expect(replayed.custody?.incarceration.groups.filter((group) => group.role === "pow")).toHaveLength(1);
  });

  it("non-pack events do not push a pack headline", () => {
    const state = warState();
    const template = WAR_EVENT_POOL[0];
    const after = applyEventEffects(state, {
      ...template,
      timestamp: Date.now(),
      resolved: false,
    });
    expect(after.newsFeed ?? []).toHaveLength(state.newsFeed?.length ?? 0);
  });
});

describe("retrigger cooldowns", () => {
  it("a stamped pack event cannot re-fire inside its cooldown window", () => {
    const base = warState();
    const stamps: Record<string, number> = {};
    for (const id of PACK_IDS) stamps[id] = base.totalTicks;
    const state: GameState = {
      ...base,
      totalTicks: base.totalTicks + 100,
      eventTriggerCooldowns: stamps,
    };

    // Sweep the pick roll across the whole selection range: whatever index the
    // filtered pool maps to, the fired event must never be a pack event.
    for (let i = 0; i < 50; i++) {
      mockWarRoll(i / 50);
      const result = generateRandomEvent(state);
      vi.restoreAllMocks();
      expect(result).not.toBeNull();
      expect(PACK_IDS, "cooled-down pack event re-fired").not.toContain(result!.event.id);
    }
  });

  it("a pack event becomes eligible again after its cooldown lapses", () => {
    const base = warState();
    const id = "war_evt_munitions_factory_explosion"; // longest cooldown in the pack
    const state: GameState = {
      ...base,
      totalTicks: base.totalTicks + WARTIME_MASTER_COOLDOWN_TICKS[id] + 1,
      eventTriggerCooldowns: { [id]: base.totalTicks },
    };

    const idx = WAR_EVENT_POOL.findIndex((e) => e.id === id);
    mockWarRoll((idx + 0.5) / WAR_EVENT_POOL.length);
    const result = generateRandomEvent(state);

    expect(result).not.toBeNull();
    expect(result!.event.id).toBe(id);
    // Re-stamped at the new spawn tick.
    expect(result!.cooldowns?.[id]).toBe(state.totalTicks);
  });
});

describe("per-war occurrence limits", () => {
  const id = "war_evt_field_hospital_overflow";
  const limit = PACK_OCCURRENCE_LIMITS[id];
  const legacyLimit = WAR_EVENT_POOL.find(
    (event) => event.id === LEGACY_OCCURRENCE_ID,
  )!.maxOccurrencesPerWar!;

  it("preserves separate faction budgets through a wrapped save reload", () => {
    const base = warState();
    const exhaustedFaction = base.factions[0];
    const remainingFaction = base.factions[1];
    const state: GameState = {
      ...base,
      factions: base.factions.map((faction, index) =>
        index < 2 ? { ...faction, threat: 90 } : faction,
      ),
      warEventOccurrences: {
        [exhaustedFaction.id]: { [id]: limit },
        [remainingFaction.id]: {
          [id]: 1,
          war_evt_power_grid_targeted: 3,
          [LEGACY_OCCURRENCE_ID]: 2,
        },
      },
    };

    const envelope = wrapSave(JSON.stringify(state));
    const unwrapped = unwrapSave(envelope);
    expect(unwrapped.valid).toBe(true);
    const reloaded = sanitizeState(migrateState(JSON.parse(unwrapped.json) as GameState));

    expect(reloaded.warEventOccurrences).toEqual(state.warEventOccurrences);
    expect(getAvailableWarEvents(reloaded).some((event) => event.id === id)).toBe(true);

    const index = WAR_EVENT_POOL.findIndex((event) => event.id === id);
    mockWarRoll((index + 0.5) / WAR_EVENT_POOL.length);
    const result = generateRandomEvent(reloaded);

    expect(result?.event.factionId).toBe(remainingFaction.id);
    expect(result?.warEventOccurrences).toEqual({
      [exhaustedFaction.id]: { [id]: limit },
      [remainingFaction.id]: {
        [id]: 2,
        war_evt_power_grid_targeted: 3,
        [LEGACY_OCCURRENCE_ID]: 2,
      },
    });
  });

  it("derives persisted budget IDs from both legacy and master wartime sources", () => {
    expect(WAR_EVENT_OCCURRENCE_IDS.has(LEGACY_OCCURRENCE_ID)).toBe(true);
    for (const event of WARTIME_MASTER_EVENTS) {
      expect(WAR_EVENT_OCCURRENCE_IDS.has(event.id)).toBe(true);
    }

    const base = warState();
    const factionId = base.factions[0].id;
    const state: GameState = {
      ...base,
      warEventOccurrences: {
        [factionId]: {
          [LEGACY_OCCURRENCE_ID]: 2,
          war_evt_field_hospital_overflow: 1,
          unknown_future_war_event: 99,
        },
      },
    };

    const unwrapped = unwrapSave(wrapSave(JSON.stringify(state)));
    const reloaded = sanitizeState(migrateState(JSON.parse(unwrapped.json) as GameState));

    expect(reloaded.warEventOccurrences).toEqual({
      [factionId]: {
        [LEGACY_OCCURRENCE_ID]: 2,
        war_evt_field_hospital_overflow: 1,
      },
    });
  });

  it("removes a pack event from availability once its hostile faction reaches the source limit", () => {
    const state = warState();
    const factionId = state.factions[0].id;
    state.warEventOccurrences = { [factionId]: { [id]: limit } };

    expect(getAvailableWarEvents(state).some((event) => event.id === id)).toBe(false);
    // This is a per-event limit, not a blanket freeze on the faction's war pool.
    expect(getAvailableWarEvents(state).some((event) => event.id === "war_evt_power_grid_targeted")).toBe(true);
  });

  it("increments the instigating faction's occurrence count when a capped pack event fires", () => {
    const state = warState();
    const index = WAR_EVENT_POOL.findIndex((event) => event.id === id);
    mockWarRoll((index + 0.5) / WAR_EVENT_POOL.length);

    const result = generateRandomEvent(state);

    expect(result?.event.id).toBe(id);
    expect(result?.event.factionId).toBe(state.factions[0].id);
    expect(result?.warEventOccurrences).toEqual({
      [state.factions[0].id]: { [id]: 1 },
    });
  });

  it("increments and then exhausts a capped legacy war event", () => {
    const state = warState();
    const factionId = state.factions[0].id;
    const index = WAR_EVENT_POOL.findIndex(
      (event) => event.id === LEGACY_OCCURRENCE_ID,
    );
    state.warEventOccurrences = {
      [factionId]: { [LEGACY_OCCURRENCE_ID]: legacyLimit - 1 },
    };
    mockWarRoll((index + 0.5) / WAR_EVENT_POOL.length);

    const result = generateRandomEvent(state);

    expect(result?.event.id).toBe(LEGACY_OCCURRENCE_ID);
    expect(result?.event.factionId).toBe(factionId);
    expect(result?.warEventOccurrences).toEqual({
      [factionId]: { [LEGACY_OCCURRENCE_ID]: legacyLimit },
    });

    const afterCooldown: GameState = {
      ...state,
      totalTicks: state.totalTicks + 3 * 96 + 1,
      eventTriggerCooldowns: {},
      warEventOccurrences: result!.warEventOccurrences,
    };
    expect(
      getAvailableWarEvents(afterCooldown).some(
        (event) => event.id === LEGACY_OCCURRENCE_ID,
      ),
    ).toBe(false);
  });

  it("allows the same event for another hostile faction whose separate conflict has capacity", () => {
    const state = warState();
    const cappedFaction = state.factions[0];
    const eligibleFaction = state.factions[1];
    state.factions = state.factions.map((f, index) =>
      index === 1 ? { ...f, threat: 90 } : f,
    );
    state.warEventOccurrences = { [cappedFaction.id]: { [id]: limit } };

    expect(getAvailableWarEvents(state).some((event) => event.id === id)).toBe(true);

    const index = WAR_EVENT_POOL.findIndex((event) => event.id === id);
    mockWarRoll((index + 0.5) / WAR_EVENT_POOL.length);
    const result = generateRandomEvent(state);

    expect(result?.event.id).toBe(id);
    expect(result?.event.factionId).toBe(eligibleFaction.id);
    expect(result?.warEventOccurrences).toEqual({
      [cappedFaction.id]: { [id]: limit },
      [eligibleFaction.id]: { [id]: 1 },
    });
  });

  it("clears only a faction whose conflict has cooled below the hostile threshold", () => {
    const state = warState();
    const cooledFaction = state.factions[0];
    const stillHostileFaction = state.factions[1];
    state.factions = state.factions.map((f, index) =>
      index === 1 ? { ...f, threat: 90 } : { ...f, threat: 65 },
    );
    state.warEventOccurrences = {
      [cooledFaction.id]: { [id]: limit },
      [stillHostileFaction.id]: { [id]: 1 },
    };

    const reset = resetEndedWarEventOccurrences(state);

    expect(reset).not.toBe(state);
    expect(reset.warEventOccurrences).toEqual({
      [stillHostileFaction.id]: { [id]: 1 },
    });
  });
});

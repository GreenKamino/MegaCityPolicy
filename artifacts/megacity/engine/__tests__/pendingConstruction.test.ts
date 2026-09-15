/**
 * Timed building construction (Task #500).
 *
 * Contract under test:
 *   - Flat per-category durations with a default fallback; military
 *     installations resolve their category from MILITARY_BUILDINGS.
 *   - Orders are paid upfront at order time (GameContext) — runTick
 *     completion only lands counts + an inbox message, never credits.
 *   - A batch order (count > 1) completes as ONE unit on the same tick.
 *   - Completion increments buildings / installationsBuilt exactly once
 *     and emits one CONSTRUCTION COMPLETE inbox message per order.
 *   - Processing lives inside runTick, so real-time, turn-based End Turn
 *     and offline catch-up (all of which loop runTick) advance timers
 *     identically — no per-mode code exists to test separately.
 *   - Legacy saves without the field behave as "nothing under
 *     construction" (migrateState backfills []).
 *   - The onboarding build beat fires on COMPLETION, not at order time.
 */

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { migrateState } from "@/engine/saveLoad";
import {
  CITY_CONSTRUCTION_TICKS,
  DEFAULT_CONSTRUCTION_TICKS,
  DEFAULT_TRAINING_TICKS,
  MILITARY_CONSTRUCTION_TICKS,
  TRAINING_COMBINED_CAP,
  TRAINING_EDICT_ID,
  TRAINING_EDICT_REDUCTION,
  TRAINING_SPEED_CAP,
  TRAINING_SPEED_PER_FACILITY,
  UNIT_TRAINING_TICKS,
  createPendingConstruction,
  getConstructionSpeedReduction,
  getConstructionTicks,
  getFacilityTrainingReduction,
  getTrainingDoctrineRemainingTicks,
  getTrainingSpeedReduction,
  getTrainingSpeedSourcesLabel,
  isTrainingEdictActive,
  MAX_CONSTRUCTION_BATCH,
  MAX_PENDING_CONSTRUCTION_ORDERS,
  validateCityConstructionBatch,
} from "@/engine/pendingConstruction";
import { EDICTS, getEdictById } from "@/engine/edicts";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import { UNIT_CATEGORIES } from "@/engine/contracts";
import { createDefaultMilitaryState } from "@/engine/militaryOverhaul";
import {
  ONBOARDING_BUILD_BASELINE,
  ONBOARDING_BUILD_KEY,
  isBeatActionSatisfied,
} from "@/engine/onboardingFlow";
import type { GameState } from "@/engine/types";

function withOrder(
  state: GameState,
  order: ReturnType<typeof createPendingConstruction>,
): GameState {
  return { ...state, pendingConstructions: [...(state.pendingConstructions ?? []), order] };
}

function runTicks(state: GameState, count: number): GameState {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = runTick(s).newState;
  }
  return s;
}

describe("validateCityConstructionBatch", () => {
  it("reduces a requested batch to what credits and steel can afford", () => {
    const state = createInitialState();
    state.resources.credits = 350;
    state.resources.steel = 25;

    const result = validateCityConstructionBatch(state, {
      count: 10,
      cost: 100,
      steelCost: 10,
    });

    expect(result.allowedCount).toBe(2);
    expect(result.totalCost).toBe(200);
    expect(result.totalSteel).toBe(20);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "Available credits cover 3 at this price.",
      "Available steel covers 2 at this price.",
    ]));
  });

  it("treats a batch as one queue slot and blocks a full timed-order queue", () => {
    const state = createInitialState();
    state.resources.credits = 1_000_000;
    state.resources.steel = 1_000_000;
    state.pendingConstructions = Array.from(
      { length: MAX_PENDING_CONSTRUCTION_ORDERS },
      (_, index) => ({ id: `pending-${index}` } as any),
    );

    const full = validateCityConstructionBatch(state, { count: 100, cost: 1, steelCost: 1 });
    expect(full.allowedCount).toBe(0);
    expect(full.reasons.join(" ")).toContain("timed-order queue is full");

    state.pendingConstructions = state.pendingConstructions.slice(0, -1);
    const oneSlot = validateCityConstructionBatch(state, { count: 100, cost: 1, steelCost: 1 });
    expect(oneSlot.allowedCount).toBe(100);
    expect(oneSlot.availableQueueSlots).toBe(1);
  });

  it("caps malformed/direct callers at the supported batch size", () => {
    const state = createInitialState();
    state.resources.credits = 1_000_000;
    state.resources.steel = 1_000_000;

    const result = validateCityConstructionBatch(state, { count: 999, cost: 1, steelCost: 1 });
    expect(result.allowedCount).toBe(MAX_CONSTRUCTION_BATCH);
    expect(result.reasons).toContain(`The maximum batch is ${MAX_CONSTRUCTION_BATCH} buildings.`);
  });
});

describe("getConstructionTicks", () => {
  it("applies researched constructionSpeed to city and military orders at order time", () => {
    const state = createInitialState();
    state.unlockedTechnologies = ["modular_hab_block_construction"];
    expect(getConstructionSpeedReduction(state)).toBe(0.08);
    expect(getConstructionTicks("city", "solarArrays", "energy", state)).toBe(7);
    expect(getConstructionTicks("military", MILITARY_BUILDINGS[0].id, undefined, state)).toBe(
      Math.round(MILITARY_CONSTRUCTION_TICKS[MILITARY_BUILDINGS[0].category] * 0.92),
    );
  });

  it("returns the flat per-category duration for known city categories", () => {
    expect(getConstructionTicks("city", "solarArrays", "energy")).toBe(
      CITY_CONSTRUCTION_TICKS.energy,
    );
    expect(getConstructionTicks("city", "anything", "upgrades")).toBe(
      CITY_CONSTRUCTION_TICKS.upgrades,
    );
  });

  it("falls back to the default for unknown or missing categories", () => {
    expect(getConstructionTicks("city", "x", "no_such_category")).toBe(
      DEFAULT_CONSTRUCTION_TICKS,
    );
    expect(getConstructionTicks("city", "x", undefined)).toBe(DEFAULT_CONSTRUCTION_TICKS);
  });

  it("resolves military durations from the installation def, no category param needed", () => {
    const def = MILITARY_BUILDINGS[0];
    expect(getConstructionTicks("military", def.id)).toBe(
      MILITARY_CONSTRUCTION_TICKS[def.category],
    );
    expect(getConstructionTicks("military", "not_a_real_installation")).toBe(
      DEFAULT_CONSTRUCTION_TICKS,
    );
  });

  it("has a positive duration for every military category", () => {
    for (const def of MILITARY_BUILDINGS) {
      expect(getConstructionTicks("military", def.id)).toBeGreaterThan(0);
    }
  });

  // Task #524: troop training durations.
  it("resolves unit training durations from the recruitment catalog", () => {
    const def = UNIT_CATEGORIES[0];
    expect(getConstructionTicks("unit", def.key)).toBe(UNIT_TRAINING_TICKS[def.category]);
    expect(getConstructionTicks("unit", "not_a_real_unit")).toBe(DEFAULT_TRAINING_TICKS);
  });

  it("has a training duration entry for every unit category (drift guard)", () => {
    const categories = new Set(UNIT_CATEGORIES.map((d) => d.category));
    for (const cat of categories) {
      expect(UNIT_TRAINING_TICKS[cat], `missing UNIT_TRAINING_TICKS["${cat}"]`).toBeGreaterThan(0);
    }
  });

  it("has a positive duration for every recruitable unit", () => {
    for (const def of UNIT_CATEGORIES) {
      expect(getConstructionTicks("unit", def.key)).toBeGreaterThan(0);
    }
  });
});

// Task #526: built training facilities speed up troop training.
describe("training speed from training facilities", () => {
  const TRAINING_FACILITIES = MILITARY_BUILDINGS.filter((d) => d.category === "training");

  function withTrainingFacilities(state: GameState, counts: Record<string, number>): GameState {
    const mil = state.militaryOverhaul ?? createDefaultMilitaryState();
    return {
      ...state,
      militaryOverhaul: {
        ...mil,
        logistics: {
          ...mil.logistics,
          installationsBuilt: { ...(mil.logistics?.installationsBuilt ?? {}), ...counts },
        },
      },
    };
  }

  it("returns 0 reduction with no state or no facilities built", () => {
    expect(getTrainingSpeedReduction(undefined)).toBe(0);
    expect(getTrainingSpeedReduction(createInitialState())).toBe(0);
  });

  it("stacks 10% per built facility (any mix, duplicates count) up to the 40% cap", () => {
    const base = createInitialState();
    const one = TRAINING_FACILITIES[0].id;
    const two = TRAINING_FACILITIES[1].id;
    expect(getTrainingSpeedReduction(withTrainingFacilities(base, { [one]: 1 })))
      .toBeCloseTo(TRAINING_SPEED_PER_FACILITY);
    expect(getTrainingSpeedReduction(withTrainingFacilities(base, { [one]: 2, [two]: 1 })))
      .toBeCloseTo(3 * TRAINING_SPEED_PER_FACILITY);
    expect(getTrainingSpeedReduction(withTrainingFacilities(base, { [one]: 99 })))
      .toBe(TRAINING_SPEED_CAP);
  });

  it("ignores non-training installations and malformed counts", () => {
    const base = createInitialState();
    const nonTraining = MILITARY_BUILDINGS.find((d) => d.category !== "training")!;
    const s = withTrainingFacilities(base, {
      [nonTraining.id]: 5,
      [TRAINING_FACILITIES[0].id]: NaN,
    });
    expect(getTrainingSpeedReduction(s)).toBe(0);
  });

  it("shortens unit training ticks, never below 1, and leaves city/military durations alone", () => {
    const base = createInitialState();
    const boosted = withTrainingFacilities(base, { [TRAINING_FACILITIES[0].id]: 99 }); // capped 40%
    const def = UNIT_CATEGORIES.find((d) => d.category === "Special Operations")!; // 8 ticks base
    const baseTicks = getConstructionTicks("unit", def.key);
    const fastTicks = getConstructionTicks("unit", def.key, undefined, boosted);
    expect(fastTicks).toBe(Math.max(1, Math.round(baseTicks * (1 - TRAINING_SPEED_CAP))));
    expect(fastTicks).toBeLessThan(baseTicks);

    // Min 1 tick: even the fastest categories never hit 0.
    for (const d of UNIT_CATEGORIES) {
      expect(getConstructionTicks("unit", d.key, undefined, boosted)).toBeGreaterThanOrEqual(1);
    }

    // City + military durations are untouched by the modifier.
    expect(getConstructionTicks("city", "solarArrays", "energy", boosted)).toBe(
      CITY_CONSTRUCTION_TICKS.energy,
    );
    const mil = MILITARY_BUILDINGS[0];
    expect(getConstructionTicks("military", mil.id, undefined, boosted)).toBe(
      MILITARY_CONSTRUCTION_TICKS[mil.category],
    );
  });

  it("freezes the discounted duration at order time (later facilities don't retro-shorten)", () => {
    const base = createInitialState();
    const boosted = withTrainingFacilities(base, { [TRAINING_FACILITIES[0].id]: 2 }); // -20%
    const def = UNIT_CATEGORIES.find((d) => d.category === "Air Units")!; // 6 ticks base

    const plainOrder = createPendingConstruction({
      kind: "unit", buildingKey: def.key, label: def.label, count: 10,
      orderedTick: 0, state: base,
    });
    const fastOrder = createPendingConstruction({
      kind: "unit", buildingKey: def.key, label: def.label, count: 10,
      orderedTick: 0, state: boosted,
    });
    expect(plainOrder.ticksTotal).toBe(UNIT_TRAINING_TICKS[def.category]);
    expect(fastOrder.ticksTotal).toBe(Math.round(UNIT_TRAINING_TICKS[def.category] * 0.8));
    expect(fastOrder.ticksTotal).toBeLessThan(plainOrder.ticksTotal);

    // An in-flight plain order keeps its frozen timer even if the state now
    // has training facilities: runTick decrements from ticksTotal as-is.
    let s = withOrder(boosted, plainOrder);
    s = runTicks(s, 1);
    expect(s.pendingConstructions![0].ticksRemaining).toBe(plainOrder.ticksTotal - 1);
  });

  it("full-tick proof: a boosted order completes strictly earlier than an unboosted one", () => {
    const base = createInitialState();
    const boosted = withTrainingFacilities(base, { [TRAINING_FACILITIES[0].id]: 99 }); // -40%
    const def = UNIT_CATEGORIES.find((d) => d.category === "Special Operations")!; // 8 → 5 ticks
    const before = (boosted.units as Record<string, number>)[def.key] ?? 0;

    const order = createPendingConstruction({
      kind: "unit", buildingKey: def.key, label: def.label, count: 10,
      orderedTick: boosted.totalTicks, state: boosted,
    });
    const baseTicks = UNIT_TRAINING_TICKS[def.category];
    expect(order.ticksTotal).toBeLessThan(baseTicks);

    // One tick before the discounted deadline: still training.
    let s = runTicks(withOrder(boosted, order), order.ticksTotal - 1);
    expect((s.units as Record<string, number>)[def.key] ?? 0).toBe(before);

    // Discounted deadline: batch lands — well before the base duration.
    s = runTick(s).newState;
    expect((s.units as Record<string, number>)[def.key] ?? 0).toBe(before + 10);
    expect(s.pendingConstructions).toHaveLength(0);
  });
});

// Task #529: the Accelerated Training Doctrine edict is a second lever on
// training speed, stacking with facilities up to a combined 50% cut.
describe("training speed from the Accelerated Training Doctrine edict", () => {
  const TRAINING_FACILITIES = MILITARY_BUILDINGS.filter((d) => d.category === "training");

  function withTrainingFacilities(state: GameState, counts: Record<string, number>): GameState {
    const mil = state.militaryOverhaul ?? createDefaultMilitaryState();
    return {
      ...state,
      militaryOverhaul: {
        ...mil,
        logistics: {
          ...mil.logistics,
          installationsBuilt: { ...(mil.logistics?.installationsBuilt ?? {}), ...counts },
        },
      },
    };
  }

  function withTrainingEdict(state: GameState, ticksRemaining = 16): GameState {
    return {
      ...state,
      activeEdicts: [
        ...(state.activeEdicts ?? []),
        {
          edictId: TRAINING_EDICT_ID,
          ticksRemaining,
          issuedAtTick: state.totalTicks,
          cooldownUntilTick: 0,
        },
      ],
    };
  }

  it("the edict exists in the EDICTS catalog under the pinned id (drift guard)", () => {
    const def = EDICTS.find((e) => e.id === TRAINING_EDICT_ID);
    expect(def).toBeDefined();
    expect(getEdictById(TRAINING_EDICT_ID)).toBe(def);
    // Its per-tick upkeep uses the already-wired creditsPerTick key —
    // the training discount itself is order-time, not an EdictEffect key.
    expect(def!.effects.creditsPerTick).toBeLessThan(0);
    // Description advertises the order-time behavior to the player.
    expect(def!.description).toMatch(/25% faster/);
    expect(def!.description).toMatch(/50%/);
  });

  it("detects the edict only while active with ticks remaining", () => {
    const base = createInitialState();
    expect(isTrainingEdictActive(undefined)).toBe(false);
    expect(isTrainingEdictActive(base)).toBe(false);
    expect(isTrainingEdictActive(withTrainingEdict(base))).toBe(true);
    // Expired instance (0 ticks left) and a cooldown-only entry don't count.
    expect(isTrainingEdictActive(withTrainingEdict(base, 0))).toBe(false);
    const cooldownOnly: GameState = {
      ...base,
      edictCooldowns: { [TRAINING_EDICT_ID]: base.totalTicks + 30 },
    };
    expect(isTrainingEdictActive(cooldownOnly)).toBe(false);
  });

  it("reports the doctrine countdown but never one for permanent facilities", () => {
    const base = createInitialState();
    expect(getTrainingDoctrineRemainingTicks(undefined)).toBeNull();
    expect(getTrainingDoctrineRemainingTicks(base)).toBeNull();
    expect(getTrainingDoctrineRemainingTicks(withTrainingEdict(base, 7))).toBe(7);
    expect(getTrainingDoctrineRemainingTicks(withTrainingEdict(base, 0))).toBeNull();

    const facilityOnly = withTrainingFacilities(base, { [TRAINING_FACILITIES[0].id]: 1 });
    expect(getTrainingDoctrineRemainingTicks(facilityOnly)).toBeNull();
  });

  it("edict alone grants its flat reduction; combined with facilities it caps at 50%", () => {
    const base = createInitialState();
    expect(getTrainingSpeedReduction(withTrainingEdict(base))).toBeCloseTo(TRAINING_EDICT_REDUCTION);

    // Two facilities (-20%) + edict (-25%) = -45%, under the cap.
    const two = withTrainingFacilities(base, { [TRAINING_FACILITIES[0].id]: 2 });
    expect(getTrainingSpeedReduction(withTrainingEdict(two)))
      .toBeCloseTo(2 * TRAINING_SPEED_PER_FACILITY + TRAINING_EDICT_REDUCTION);

    // Maxed facilities (-40%) + edict (-25%) clamps to the combined 50% cap.
    const maxed = withTrainingFacilities(base, { [TRAINING_FACILITIES[0].id]: 99 });
    expect(getFacilityTrainingReduction(maxed)).toBe(TRAINING_SPEED_CAP);
    expect(getTrainingSpeedReduction(withTrainingEdict(maxed))).toBe(TRAINING_COMBINED_CAP);
  });

  it("sources label names the active lever(s)", () => {
    const base = createInitialState();
    expect(getTrainingSpeedSourcesLabel(base)).toBeNull();
    expect(getTrainingSpeedSourcesLabel(withTrainingEdict(base)))
      .toBe("Accelerated Training Doctrine");
    const fac = withTrainingFacilities(base, { [TRAINING_FACILITIES[0].id]: 1 });
    expect(getTrainingSpeedSourcesLabel(fac)).toBe("training facilities");
    expect(getTrainingSpeedSourcesLabel(withTrainingEdict(fac)))
      .toBe("training facilities + Accelerated Training Doctrine");
  });

  it("shortens unit training ticks at order time, never below 1", () => {
    const base = createInitialState();
    const boosted = withTrainingEdict(base);
    const def = UNIT_CATEGORIES.find((d) => d.category === "Special Operations")!; // 8 ticks base
    const baseTicks = getConstructionTicks("unit", def.key);
    const fastTicks = getConstructionTicks("unit", def.key, undefined, boosted);
    expect(fastTicks).toBe(Math.max(1, Math.round(baseTicks * (1 - TRAINING_EDICT_REDUCTION))));
    expect(fastTicks).toBeLessThan(baseTicks);
    for (const d of UNIT_CATEGORIES) {
      expect(getConstructionTicks("unit", d.key, undefined, boosted)).toBeGreaterThanOrEqual(1);
    }
    // City + military durations are untouched by the edict.
    expect(getConstructionTicks("city", "solarArrays", "energy", boosted)).toBe(
      CITY_CONSTRUCTION_TICKS.energy,
    );
    const mil = MILITARY_BUILDINGS[0];
    expect(getConstructionTicks("military", mil.id, undefined, boosted)).toBe(
      MILITARY_CONSTRUCTION_TICKS[mil.category],
    );
  });

  it("full-tick proof: an order placed with the edict active completes earlier", () => {
    const base = createInitialState();
    const boosted = withTrainingEdict(base);
    const def = UNIT_CATEGORIES.find((d) => d.category === "Special Operations")!; // 8 → 6 ticks
    const before = (boosted.units as Record<string, number>)[def.key] ?? 0;

    const order = createPendingConstruction({
      kind: "unit", buildingKey: def.key, label: def.label, count: 10,
      orderedTick: boosted.totalTicks, state: boosted,
    });
    const baseTicks = UNIT_TRAINING_TICKS[def.category];
    expect(order.ticksTotal).toBe(Math.max(1, Math.round(baseTicks * (1 - TRAINING_EDICT_REDUCTION))));
    expect(order.ticksTotal).toBeLessThan(baseTicks);

    // One tick before the discounted deadline: still training.
    let s = runTicks(withOrder(boosted, order), order.ticksTotal - 1);
    expect((s.units as Record<string, number>)[def.key] ?? 0).toBe(before);

    // Discounted deadline: batch lands — earlier than the base duration.
    s = runTick(s).newState;
    expect((s.units as Record<string, number>)[def.key] ?? 0).toBe(before + 10);
    expect(s.pendingConstructions).toHaveLength(0);
  });

  it("frozen at order time: the edict expiring mid-training never lengthens in-flight orders", () => {
    const base = createInitialState();
    // Edict with 1 tick left: still active at order time, expires on tick 1.
    const boosted = withTrainingEdict(base, 1);
    const def = UNIT_CATEGORIES.find((d) => d.category === "Air Units")!; // 6 ticks base
    const order = createPendingConstruction({
      kind: "unit", buildingKey: def.key, label: def.label, count: 10,
      orderedTick: boosted.totalTicks, state: boosted,
    });
    expect(order.ticksTotal).toBeLessThan(UNIT_TRAINING_TICKS[def.category]);

    let s = runTicks(withOrder(boosted, order), 2);
    // Edict is gone, but the frozen discounted timer keeps counting down.
    expect(isTrainingEdictActive(s)).toBe(false);
    expect(s.pendingConstructions![0].ticksRemaining).toBe(order.ticksTotal - 2);
  });
});

describe("createPendingConstruction", () => {
  it("freezes duration, label and count at order time", () => {
    const order = createPendingConstruction({
      kind: "city",
      buildingKey: "solarArrays",
      label: "Solar Arrays",
      count: 3,
      categoryId: "energy",
      orderedTick: 42,
    });
    expect(order.ticksTotal).toBe(CITY_CONSTRUCTION_TICKS.energy);
    expect(order.ticksRemaining).toBe(order.ticksTotal);
    expect(order.count).toBe(3);
    expect(order.orderedTick).toBe(42);
    expect(order.id).toContain("solarArrays");
  });

  it("freezes battlefield role metadata on unit training orders", () => {
    const def = UNIT_CATEGORIES.find((unit) => unit.battlefieldRole === "MEDICAL SUPPORT")!;
    const order = createPendingConstruction({
      kind: "unit",
      buildingKey: def.key,
      label: def.label,
      battlefieldRole: def.battlefieldRole,
      count: def.hireBatch,
      orderedTick: 42,
    });

    expect(order.battlefieldRole).toBe("MEDICAL SUPPORT");
  });

  it("keeps legacy unit orders without role metadata valid", () => {
    const def = UNIT_CATEGORIES[0];
    const order = createPendingConstruction({
      kind: "unit",
      buildingKey: def.key,
      label: def.label,
      count: def.hireBatch,
      orderedTick: 42,
    });

    expect(order.battlefieldRole).toBeUndefined();
    expect(() => runTick(withOrder(createInitialState(), order))).not.toThrow();
  });

  it("floors and clamps count to at least 1", () => {
    const order = createPendingConstruction({
      kind: "city",
      buildingKey: "x",
      label: "X",
      count: 0,
      orderedTick: 0,
    });
    expect(order.count).toBe(1);
  });
});

describe("runTick construction processing", () => {
  it("completes a city order after exactly ticksTotal ticks, once", () => {
    const base = createInitialState();
    const key = "solarArrays";
    const before = (base.buildings as Record<string, number>)[key] ?? 0;
    const order = createPendingConstruction({
      kind: "city",
      buildingKey: key,
      label: "Solar Arrays",
      count: 2,
      categoryId: "energy",
      orderedTick: base.totalTicks,
    });
    let s = withOrder(base, order);

    // One tick short of done: still pending, count unchanged.
    s = runTicks(s, order.ticksTotal - 1);
    expect((s.buildings as Record<string, number>)[key] ?? 0).toBe(before);
    expect(s.pendingConstructions).toHaveLength(1);
    expect(s.pendingConstructions![0].ticksRemaining).toBe(1);

    // The finishing tick: count lands as one batch, order leaves the queue.
    const { newState: done, entries } = runTick(s);
    expect((done.buildings as Record<string, number>)[key] ?? 0).toBe(before + 2);
    expect(done.pendingConstructions).toHaveLength(0);
    const completionEntries = entries.filter((e) => e.label === "Construction Complete");
    expect(completionEntries).toHaveLength(1);
    expect(completionEntries[0].delta).toBe(2);
    expect(completionEntries[0].severity).toBe("positive");

    // Inbox message announces the completion.
    const msg = done.messages.find((m) => m.title === "CONSTRUCTION COMPLETE");
    expect(msg).toBeDefined();
    expect(msg!.body).toContain("Solar Arrays");

    // Extra ticks must not double-land the count.
    const after = runTicks(done, 3);
    expect((after.buildings as Record<string, number>)[key] ?? 0).toBe(before + 2);
  });

  it("completes a military order onto logistics.installationsBuilt", () => {
    const base = createInitialState();
    const def = MILITARY_BUILDINGS[0];
    const state: GameState = {
      ...base,
      militaryOverhaul: base.militaryOverhaul ?? createDefaultMilitaryState(),
    };
    const order = createPendingConstruction({
      kind: "military",
      buildingKey: def.id,
      label: def.name,
      count: 1,
      orderedTick: state.totalTicks,
    });
    const builtBefore =
      (state.militaryOverhaul?.logistics?.installationsBuilt as Record<string, number>)?.[def.id] ?? 0;

    const done = runTicks(withOrder(state, order), order.ticksTotal);
    const builtAfter =
      (done.militaryOverhaul?.logistics?.installationsBuilt as Record<string, number>)?.[def.id] ?? 0;
    expect(builtAfter).toBe(builtBefore + 1);
    expect(done.pendingConstructions).toHaveLength(0);
    const msg = done.messages.find((m) => m.title === "CONSTRUCTION COMPLETE");
    expect(msg).toBeDefined();
    expect(msg!.body).toContain(def.name);
  });

  // Task #524: troop training rides the same pipeline with kind "unit".
  it("completes a unit training order onto state.units exactly once", () => {
    const base = createInitialState();
    const def = UNIT_CATEGORIES[0];
    const before = (base.units as Record<string, number>)[def.key] ?? 0;
    const order = createPendingConstruction({
      kind: "unit",
      buildingKey: def.key,
      label: def.label,
      count: def.hireBatch,
      orderedTick: base.totalTicks,
    });
    expect(order.ticksTotal).toBe(UNIT_TRAINING_TICKS[def.category]);
    let s = withOrder(base, order);

    // One tick short: still training, count unchanged.
    s = runTicks(s, order.ticksTotal - 1);
    expect((s.units as Record<string, number>)[def.key] ?? 0).toBe(before);
    expect(s.pendingConstructions).toHaveLength(1);

    // Finishing tick: whole batch lands at once, distinct training message.
    const { newState: done, entries } = runTick(s);
    expect((done.units as Record<string, number>)[def.key] ?? 0).toBe(before + def.hireBatch);
    expect(done.pendingConstructions).toHaveLength(0);
    const completionEntries = entries.filter((e) => e.label === "Training Complete");
    expect(completionEntries).toHaveLength(1);
    expect(completionEntries[0].delta).toBe(def.hireBatch);
    expect(completionEntries[0].severity).toBe("positive");

    const msg = done.messages.find((m) => m.title === "TRAINING COMPLETE");
    expect(msg).toBeDefined();
    expect(msg!.body).toContain(def.label);

    // Extra ticks must not double-land the batch.
    const after = runTicks(done, 3);
    expect((after.units as Record<string, number>)[def.key] ?? 0).toBe(before + def.hireBatch);
  });

  it("advances multiple orders independently and never touches credits at completion", () => {
    const base = createInitialState();
    const fast = createPendingConstruction({
      kind: "city",
      buildingKey: "hydroFarms",
      label: "Hydro Farms",
      count: 1,
      categoryId: "food", // 5 ticks
      orderedTick: base.totalTicks,
    });
    const slow = createPendingConstruction({
      kind: "city",
      buildingKey: "orbitalLift",
      label: "Orbital Lift",
      count: 1,
      categoryId: "space", // 12 ticks
      orderedTick: base.totalTicks,
    });
    let s = withOrder(withOrder(base, fast), slow);

    s = runTicks(s, fast.ticksTotal);
    expect((s.buildings as Record<string, number>)["hydroFarms"] ?? 0).toBeGreaterThan(0);
    expect(s.pendingConstructions).toHaveLength(1);
    expect(s.pendingConstructions![0].buildingKey).toBe("orbitalLift");

    // Completion never books credits: the finishing tick's Construction
    // Complete entry carries buildings, not credits.
    const { entries } = runTick(runTicks(withOrder(base, fast), fast.ticksTotal - 1));
    for (const e of entries.filter((x) => x.label === "Construction Complete")) {
      expect(e.unit).not.toBe("cr");
    }
  });

  it("tolerates states without the field and drops malformed orders", () => {
    const base = createInitialState();
    const legacy = { ...base } as GameState;
    delete (legacy as Partial<GameState>).pendingConstructions;
    expect(() => runTick(legacy)).not.toThrow();

    const corrupted: GameState = {
      ...base,
      pendingConstructions: [
        { id: "bad", kind: "city", buildingKey: 7 as unknown as string, label: "?", count: 1, ticksTotal: 3, ticksRemaining: 3, orderedTick: 0 },
        { id: "bad2", kind: "city", buildingKey: "x", label: "?", count: NaN, ticksTotal: 3, ticksRemaining: 3, orderedTick: 0 },
      ],
    };
    const { newState } = runTick(corrupted);
    expect(newState.pendingConstructions).toHaveLength(0);
  });
});

describe("save migration", () => {
  it("backfills an empty pending list for legacy saves", () => {
    const base = createInitialState();
    const legacy = { ...base } as GameState;
    delete (legacy as Partial<GameState>).pendingConstructions;
    const migrated = migrateState(legacy);
    expect(migrated.pendingConstructions).toEqual([]);
  });

  it("preserves in-flight orders across save/load migration", () => {
    const base = createInitialState();
    const order = createPendingConstruction({
      kind: "city",
      buildingKey: "solarArrays",
      label: "Solar Arrays",
      count: 1,
      categoryId: "energy",
      orderedTick: 10,
    });
    const migrated = migrateState(withOrder(base, order));
    expect(migrated.pendingConstructions).toHaveLength(1);
    expect(migrated.pendingConstructions![0].id).toBe(order.id);
  });
});

describe("onboarding build beat", () => {
  it("fires at order time so timed construction cannot strand the tutorial", () => {
    const base = createInitialState();
    const startCount =
      (base.buildings as Record<string, number>)[ONBOARDING_BUILD_KEY] ?? 0;
    // The fresh-game baseline ships at the guarded threshold. A completed
    // build crosses it, while a pending matching order is durable proof that
    // the player has already completed the tutorial action.
    expect(startCount).toBe(ONBOARDING_BUILD_BASELINE);

    const order = createPendingConstruction({
      kind: "city",
      buildingKey: ONBOARDING_BUILD_KEY,
      label: "Worker Housing Stacks",
      count: 1,
      categoryId: "housing",
      orderedTick: base.totalTicks,
    });
    let s = withOrder(base, order);
    expect(isBeatActionSatisfied("build", s)).toBe(true);

    s = runTicks(s, order.ticksTotal - 1);
    expect(isBeatActionSatisfied("build", s)).toBe(true);

    s = runTick(s).newState;
    expect(isBeatActionSatisfied("build", s)).toBe(true);
  });
});

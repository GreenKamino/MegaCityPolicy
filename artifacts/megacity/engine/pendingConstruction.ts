// ─── PENDING CONSTRUCTION (Task #500) ─────────────────────────────────
//
//   order (pay upfront) ──► pendingConstructions[] ──► runTick decrements
//                                                       ticksRemaining
//                                                          │
//                                              0 reached ──┴─► count lands
//                                                              + inbox msg
//
// Simple flat build times: every building in a category takes the same
// number of ticks, regardless of batch size. A batch order completes as
// one unit — all copies come online together. Costs are charged in full
// at order time (GameContext); completion never touches credits, so no
// credit-ledger entry is needed here.
//
// Processing lives inside runTick (see formulas.ts "CONSTRUCTION ORDERS"
// section), which means real-time play, turn-based End Turn
// (advanceTurn → runLiveTick → runTick) and offline catch-up
// (processMissedTicks → runTick) all advance timers identically with no
// per-mode code.
//
// This module is a LEAF: it imports only types + data-leaf modules so
// formulas.ts can import it without creating a require cycle (see
// require-cycle-breaking memory).

import type { GameState, PendingConstruction, TickEntry, GameMessage } from "@/engine/types";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import { UNIT_CATEGORIES } from "@/engine/contracts";
import { TECH_MAP } from "@/engine/technologies";
import { POLICY_MAP } from "@/engine/policies";
import { isBigBrotherActive, isBBContentId } from "@/engine/addons/bigBrother";
import { isSixthDayActive, isSDContentId } from "@/engine/addons/sixthDay";
import { reconcileInfrastructureLedger, withInfrastructureLedger } from "@/engine/infrastructureLedger";
import { completeAcademyCourse, getAcademy, getAcademyCourse, getAcademyTrainingReduction } from "@/engine/militaryAcademies";

// Fallback for unknown categories (add-on packs, future categories).
export const DEFAULT_CONSTRUCTION_TICKS = 6;
// A batch is one timed order, so this limit protects save size and queue
// processing without making the player place every copy individually.
export const MAX_PENDING_CONSTRUCTION_ORDERS = 100;
export const MAX_CONSTRUCTION_BATCH = 100;

// Flat per-category durations for city buildings, keyed by the
// construction screen's category ids. Cheap civic stuff finishes in a
// few ticks; major infrastructure takes noticeably longer. In turn-based
// mode a turn is 4 ticks, so these span roughly 1-3 turns.
export const CITY_CONSTRUCTION_TICKS: Record<string, number> = {
  energy: 8,
  water: 6,
  food: 5,
  housing: 6,
  transit: 6,
  industrial: 8,
  security: 5,
  defense: 8,
  research: 8,
  civic: 5,
  upgrades: 4,
  farming: 5,
  cybernetics: 8,
  tourism: 6,
  weaponSystems: 10,
  expansion: 12,
  space: 12,
  commercial: 5,
  infrastructure: 6,
  wasteland: 6,
};

// Flat per-category durations for military installations, keyed by
// MilitaryBuildingCategory (engine/militaryBuildings.ts).
export const MILITARY_CONSTRUCTION_TICKS: Record<string, number> = {
  command: 8,
  training: 5,
  manufacturing: 8,
  research: 8,
  logistics: 4,
  defense: 6,
  security: 5,
  aerospace: 10,
  naval: 10,
  special_projects: 12,
};

// Task #524: flat per-category training durations for recruitable units,
// keyed by UnitCategoryDef.category (engine/contracts.ts). Cheap labor and
// drones roll out in under a turn; elite, aerospace and covert programs
// take 1.5-2 turns (turn = 4 ticks).
export const UNIT_TRAINING_TICKS: Record<string, number> = {
  "Law Enforcement": 3,
  "Riot Control": 3,
  "Elite Units": 6,
  "Drones": 2,
  "Intelligence": 5,
  "Military": 4,
  "Vehicles": 4,
  "Air Units": 6,
  "Workers & Logistics": 2,
  "Medical & Disaster": 3,
  "Industrial Workers": 2,
  "Research & Tech": 5,
  "Special Operations": 8,
  "Civic Staff": 2,
  "Wildlands Operations": 5,
  "Frontier Units": 3,
  "Enforcement Units": 3,
  "Military Expanded": 4,
  "Land Vehicles": 5,
  "Aerial Vehicles": 7,
  "Civic Droids": 3,
  "Construction Droids": 3,
  "Military Droids": 5,
  "Space Navy": 7,
  "Biosphere Units": 3,
};

// Fallback for unit keys outside the recruitment catalog (e.g. legacy
// military-screen requisitions whose keys never got a catalog entry).
export const DEFAULT_TRAINING_TICKS = 3;

// constructionSpeed entries in the technology and city-policy catalogs are
// percentage reductions. They apply when an order is placed, so in-flight
// orders retain their quoted completion time just like training discounts.
export const CONSTRUCTION_SPEED_CAP = 0.90;

/** Fractional construction-time reduction supplied by researched tech and active city policies. */
export function getConstructionSpeedReduction(state?: GameState): number {
  if (!state) return 0;
  let percent = 0;
  for (const id of state.unlockedTechnologies ?? []) {
    percent += TECH_MAP[id]?.effects.constructionSpeed ?? 0;
  }
  const bbOn = isBigBrotherActive(state.addons);
  const sdOn = isSixthDayActive(state.addons);
  for (const id of state.activePolicies ?? []) {
    if ((isBBContentId(id) && !bbOn) || (isSDContentId(id) && !sdOn)) continue;
    percent += POLICY_MAP[id]?.effects.constructionSpeed ?? 0;
  }
  return Math.min(CONSTRUCTION_SPEED_CAP, Math.max(0, percent / 100));
}

// Task #526: training-category military installations speed up troop
// training. Each BUILT training facility (any type, stacking across
// duplicates) shaves 10% off unit training time, capped at 40%. The
// discount is applied at order time — durations are frozen when the order
// is placed by design, so facilities finished mid-training never
// retroactively shorten in-flight orders.
export const TRAINING_SPEED_PER_FACILITY = 0.10;
export const TRAINING_SPEED_CAP = 0.40;

// Task #529: the Accelerated Training Doctrine edict is a second lever on
// training speed — a temporary, upkeep-costed alternative for early-game
// players without installations. While the edict is ACTIVE at order time
// it shaves a further 25% off unit training time; combined with the
// facility route the total reduction is capped at 50%. Like facilities,
// the discount is frozen when the order is placed — an edict expiring
// mid-training never retroactively lengthens in-flight orders. The id
// must match the EDICTS catalog entry in engine/edicts.ts (drift-guarded
// by pendingConstruction.test.ts). NOTE: kept as a string literal here —
// importing edicts.ts would pull the add-on packs into this leaf module.
export const TRAINING_EDICT_ID = "accelerated_training_doctrine";
export const TRAINING_EDICT_REDUCTION = 0.25;
export const TRAINING_COMBINED_CAP = 0.50;

// Task #534: near-expiry heads-up for the doctrine. When the edict has
// exactly this many ticks left (measured AFTER the per-tick decrement in
// runTick's edict loop), the engine emits a one-time inbox advisory
// reminding the player that orders placed after the lapse train at the
// standard pace. The advisory's stable id starts with the prefix below;
// useNewsHeadlines echoes it onto the TV-news ticker once via its
// seen-id gate. Kept in this leaf module (alongside the other doctrine
// constants) so both formulas.ts and the hook can import without pulling
// in the edict catalog.
export const TRAINING_DOCTRINE_WINDDOWN_TICKS = 2;
export const TRAINING_DOCTRINE_WINDDOWN_ID_PREFIX = "training-doctrine-winddown-";

const MILITARY_BUILDINGS_BY_ID = new Map(MILITARY_BUILDINGS.map((d) => [d.id, d]));
const UNIT_CATEGORY_BY_KEY = new Map(UNIT_CATEGORIES.map((d) => [d.key, d.category]));

const TRAINING_FACILITY_IDS = new Set(
  MILITARY_BUILDINGS.filter((d) => d.category === "training").map((d) => d.id),
);

/**
 * Fractional reduction (0..TRAINING_SPEED_CAP) to unit training time from
 * completed training-category military installations. Reads only
 * logistics.installationsBuilt (i.e. facilities that FINISHED building —
 * orders still in the queue don't count).
 */
export function getFacilityTrainingReduction(state?: GameState): number {
  const built = state?.militaryOverhaul?.logistics?.installationsBuilt as
    | Record<string, number>
    | undefined;
  if (!built) return 0;
  let count = 0;
  for (const [id, n] of Object.entries(built)) {
    if (TRAINING_FACILITY_IDS.has(id) && Number.isFinite(n) && n > 0) {
      count += Math.floor(n);
    }
  }
  return Math.min(TRAINING_SPEED_CAP, count * TRAINING_SPEED_PER_FACILITY);
}

/**
 * True when the Accelerated Training Doctrine edict is currently active
 * (Task #529). Reads state.activeEdicts only — cooldown entries and
 * expired instances don't count.
 */
export function isTrainingEdictActive(state?: GameState): boolean {
  const active = state?.activeEdicts;
  if (!Array.isArray(active)) return false;
  return active.some(
    (ae) => ae?.edictId === TRAINING_EDICT_ID && Number.isFinite(ae.ticksRemaining) && ae.ticksRemaining > 0,
  );
}

/**
 * Remaining ticks for the active Accelerated Training Doctrine, or null when
 * the doctrine is not active. Facilities are permanent, so they never expose
 * a countdown through this accessor.
 */
export function getTrainingDoctrineRemainingTicks(state?: GameState): number | null {
  const active = state?.activeEdicts;
  if (!Array.isArray(active)) return null;
  const doctrine = active.find(
    (ae) => ae?.edictId === TRAINING_EDICT_ID && Number.isFinite(ae.ticksRemaining) && ae.ticksRemaining > 0,
  );
  return doctrine ? Math.max(1, Math.floor(doctrine.ticksRemaining)) : null;
}

/**
 * COMBINED fractional reduction (0..TRAINING_COMBINED_CAP) to unit
 * training time: built training facilities (up to 40%) plus the
 * Accelerated Training Doctrine edict while active (+25%), capped at 50%
 * total. Both levers are read at order time only.
 */
export function getTrainingSpeedReduction(state?: GameState): number {
  const facilities = getFacilityTrainingReduction(state);
  const edict = isTrainingEdictActive(state) ? TRAINING_EDICT_REDUCTION : 0;
  return Math.min(TRAINING_COMBINED_CAP, facilities + edict);
}

/**
 * Human label for what's currently speeding up training — used by the
 * order/confirmation modals so the note names the real source(s).
 * Returns null when nothing is active.
 */
export function getTrainingSpeedSourcesLabel(state?: GameState): string | null {
  const fac = getFacilityTrainingReduction(state) > 0;
  const ed = isTrainingEdictActive(state);
  if (fac && ed) return "training facilities + Accelerated Training Doctrine";
  if (ed) return "Accelerated Training Doctrine";
  if (fac) return "training facilities";
  return null;
}

export type CityConstructionBatchValidation = {
  requestedCount: number;
  allowedCount: number;
  maxByBatch: number;
  maxByCredits: number;
  maxBySteel: number;
  availableQueueSlots: number;
  queueLength: number;
  totalCost: number;
  totalSteel: number;
  reasons: string[];
};

/**
 * Resolve the largest safe city-building batch for the current state.
 *
 * The UI uses this for a confirmation preview, while GameContext calls it
 * again inside its state updater so a stale screen cannot overspend credits,
 * steel, or the timed-order queue. A batch consumes one queue slot regardless
 * of its count.
 */
export function validateCityConstructionBatch(
  state: GameState,
  args: { cost: number; steelCost?: number; count: number },
): CityConstructionBatchValidation {
  const requestedCount = Number.isFinite(args.count) ? Math.floor(args.count) : 0;
  const unitCost = Number.isFinite(args.cost) && args.cost >= 0 ? args.cost : NaN;
  const unitSteel = Number.isFinite(args.steelCost ?? 0) && (args.steelCost ?? 0) >= 0
    ? args.steelCost ?? 0
    : NaN;
  const queueLength = Array.isArray(state.pendingConstructions)
    ? state.pendingConstructions.length
    : 0;
  const availableQueueSlots = Math.max(0, MAX_PENDING_CONSTRUCTION_ORDERS - queueLength);
  const maxByBatch = requestedCount > 0 ? MAX_CONSTRUCTION_BATCH : 0;
  const maxByCredits = Number.isFinite(unitCost)
    ? unitCost > 0
      ? Math.max(0, Math.floor(Math.max(0, state.resources.credits) / unitCost))
      : MAX_CONSTRUCTION_BATCH
    : 0;
  const maxBySteel = Number.isFinite(unitSteel)
    ? unitSteel > 0
      ? Math.max(0, Math.floor(Math.max(0, state.resources.steel) / unitSteel))
      : MAX_CONSTRUCTION_BATCH
    : 0;
  const allowedCount = Math.max(
    0,
    Math.min(requestedCount, maxByBatch, maxByCredits, maxBySteel, availableQueueSlots > 0 ? requestedCount : 0),
  );
  const totalCost = Number.isFinite(unitCost) ? unitCost * allowedCount : 0;
  const totalSteel = Number.isFinite(unitSteel) ? unitSteel * allowedCount : 0;
  const reasons: string[] = [];

  if (requestedCount <= 0) reasons.push("Choose at least 1 building.");
  if (requestedCount > MAX_CONSTRUCTION_BATCH) {
    reasons.push(`The maximum batch is ${MAX_CONSTRUCTION_BATCH} buildings.`);
  }
  if (requestedCount > maxByCredits) {
    reasons.push(`Available credits cover ${maxByCredits} at this price.`);
  }
  if (requestedCount > maxBySteel) {
    reasons.push(`Available steel covers ${maxBySteel} at this price.`);
  }
  if (availableQueueSlots <= 0) {
    reasons.push(`The timed-order queue is full (${MAX_PENDING_CONSTRUCTION_ORDERS}/${MAX_PENDING_CONSTRUCTION_ORDERS}).`);
  } else if (queueLength + 1 > MAX_PENDING_CONSTRUCTION_ORDERS) {
    reasons.push(`This batch needs 1 queue slot; ${availableQueueSlots} is available.`);
  }
  if (!Number.isFinite(unitCost) || !Number.isFinite(unitSteel)) {
    reasons.push("This construction recipe has invalid costs.");
  }

  return {
    requestedCount,
    allowedCount,
    maxByBatch,
    maxByCredits,
    maxBySteel,
    availableQueueSlots,
    queueLength,
    totalCost,
    totalSteel,
    reasons,
  };
}

/**
 * Flat build duration in ticks for an order. City orders pass the
 * construction screen's category id; military orders resolve their
 * category from the installation def, so callers can omit it. Unit
 * training orders pass `state` so completed training facilities can
 * shorten the duration (Task #526); without state the base duration is
 * returned.
 */
export function getConstructionTicks(
  kind: PendingConstruction["kind"],
  buildingKey: string,
  categoryId?: string,
  state?: GameState,
): number {
  if (kind === "academy") {
    return getAcademyCourse(buildingKey)?.ticks ?? DEFAULT_CONSTRUCTION_TICKS;
  }
  if (kind === "unit") {
    const cat = UNIT_CATEGORY_BY_KEY.get(buildingKey);
    const base = (cat && UNIT_TRAINING_TICKS[cat]) || DEFAULT_TRAINING_TICKS;
    const reduction = getTrainingSpeedReduction(state);
    const academyReduction = getAcademyTrainingReduction(state, cat);
    if (reduction <= 0 && academyReduction <= 0) return base;
    return Math.max(1, Math.round(base * (1 - Math.min(0.65, reduction + academyReduction))));
  }
  const base = kind === "military"
    ? (() => {
        const def = MILITARY_BUILDINGS_BY_ID.get(buildingKey);
        const cat = def?.category;
        return (cat && MILITARY_CONSTRUCTION_TICKS[cat]) || DEFAULT_CONSTRUCTION_TICKS;
      })()
    : (categoryId && CITY_CONSTRUCTION_TICKS[categoryId]) || DEFAULT_CONSTRUCTION_TICKS;
  const reduction = getConstructionSpeedReduction(state);
  return reduction > 0 ? Math.max(1, Math.round(base * (1 - reduction))) : base;
}

let _orderSeq = 0;

/**
 * Create one pending-construction order. Pure — returns the new entry;
 * the caller appends it to state.pendingConstructions immutably.
 */
export function createPendingConstruction(args: {
  kind: PendingConstruction["kind"];
  buildingKey: string;
  label: string;
  battlefieldRole?: PendingConstruction["battlefieldRole"];
  count: number;
  categoryId?: string;
  orderedTick: number;
  // Task #526: pass the ordering state so unit training orders pick up
  // the training-facility speed discount (frozen at order time).
  state?: GameState;
}): PendingConstruction {
  const ticks = getConstructionTicks(args.kind, args.buildingKey, args.categoryId, args.state);
  _orderSeq = (_orderSeq + 1) % 1_000_000;
  return {
    id: `pc-${args.orderedTick}-${args.buildingKey}-${_orderSeq}-${Math.floor(Math.random() * 1e6)}`,
    kind: args.kind,
    buildingKey: args.buildingKey,
    label: args.label,
    ...(args.kind === "unit" && args.battlefieldRole
      ? { battlefieldRole: args.battlefieldRole }
      : {}),
    count: Math.max(1, Math.floor(args.count)),
    ticksTotal: ticks,
    ticksRemaining: ticks,
    orderedTick: args.orderedTick,
  };
}

export type PendingConstructionResult = {
  // True when at least one CITY order landed this tick (the caller must
  // invalidate the tech-effects cache, exactly like contract completions).
  cityCompleted: boolean;
};

/**
 * One tick of construction progress. Mutates `s.pendingConstructions`
 * via immutable replacement (safe on runTick's per-tick clone — same
 * pattern as miningOperations). Completed city orders land on
 * `s.buildings` (already cloned by runTick); military orders clone the
 * militaryOverhaul.logistics path on write. Emits one inbox message and
 * one positive tick entry per completed order.
 */
export function processPendingConstructions(
  s: GameState,
  entries: TickEntry[],
  pushMessage: (msg: GameMessage) => void,
): PendingConstructionResult {
  const list = s.pendingConstructions ?? [];
  if (list.length === 0) return { cityCompleted: false };

  const remaining: PendingConstruction[] = [];
  const completed: PendingConstruction[] = [];
  for (const order of list) {
    // Defensive: malformed entries (bad count/timer from a tampered or
    // corrupted save) are dropped rather than left to tick forever.
    if (!order || typeof order.buildingKey !== "string" || !(order.count > 0)) continue;
    if (!Number.isFinite(order.ticksRemaining)) continue;
    const ticksLeft = Math.floor(order.ticksRemaining) - 1;
    if (ticksLeft <= 0) {
      completed.push(order);
    } else {
      remaining.push({ ...order, ticksRemaining: ticksLeft });
    }
  }
  s.pendingConstructions = remaining;

  let cityCompleted = false;
  let _milCloned = false;
  for (const order of completed) {
    if (order.kind === "military") {
      const mil = s.militaryOverhaul;
      if (mil?.logistics) {
        if (!_milCloned) {
          s.militaryOverhaul = {
            ...mil,
            logistics: {
              ...mil.logistics,
              installationsBuilt: { ...(mil.logistics.installationsBuilt ?? {}) },
            },
          };
          _milCloned = true;
        }
        const built = s.militaryOverhaul!.logistics.installationsBuilt as Record<string, number>;
        built[order.buildingKey] = (built[order.buildingKey] ?? 0) + order.count;
        const academy = getAcademy(order.buildingKey);
        if (academy) {
          const academies = s.militaryOverhaul!.academies;
          s.militaryOverhaul!.academies = {
            ...(academies ?? { facilities: {}, qualifications: {}, completedCourses: 0, graduationRate: 0, readinessBonus: 0 }),
            facilities: {
              ...(academies?.facilities ?? {}),
              [order.buildingKey]: {
                quality: 0,
                instructors: academies?.facilities?.[order.buildingKey]?.instructors ?? [],
              },
            },
          };
        }
      }
    } else if (order.kind === "academy") {
      completeAcademyCourse(s, order, entries);
      pushMessage({
        id: `constr-done-${order.id}`,
        timestamp: { ...s.gameDate },
        tick: s.totalTicks,
        category: "update",
        title: "ACADEMY GRADUATION",
        body: `${order.label} qualification is complete and recorded in command personnel files.`,
        read: false,
        priority: "normal",
      });
      continue;
    } else if (order.kind === "unit") {
      // Trained units land on state.units (already cloned by runTick).
      const u = s.units as Record<string, number>;
      u[order.buildingKey] = (u[order.buildingKey] ?? 0) + order.count;
    } else {
      const b = s.buildings as Record<string, number>;
      b[order.buildingKey] = (b[order.buildingKey] ?? 0) + order.count;
      cityCompleted = true;
    }

    const countLabel = order.count > 1 ? `${order.count}x ` : "";
    if (order.kind === "unit") {
      pushMessage({
        id: `constr-done-${order.id}`,
        timestamp: { ...s.gameDate },
        tick: s.totalTicks,
        category: "update",
        title: "TRAINING COMPLETE",
        body: `${countLabel}${order.label} have completed training and are ready for duty.`,
        read: false,
        priority: "normal",
      });
      entries.push({
        label: "Training Complete",
        delta: order.count,
        unit: order.count === 1 ? "unit" : "units",
        reason: `${order.label} finished training after ${order.ticksTotal} ticks`,
        severity: "positive",
      });
      continue;
    }
    pushMessage({
      id: `constr-done-${order.id}`,
      timestamp: { ...s.gameDate },
      tick: s.totalTicks,
      category: "update",
      title: "CONSTRUCTION COMPLETE",
      body: order.kind === "military"
        ? `${countLabel}${order.label} is operational. The installation has been handed over to military command.`
        : `${countLabel}${order.label} is now online and contributing to the city.`,
      read: false,
      priority: "normal",
    });
    entries.push({
      label: "Construction Complete",
      delta: order.count,
      unit: order.count === 1 ? "building" : "buildings",
      reason: `${order.label} finished after ${order.ticksTotal} ticks`,
      severity: "positive",
    });
  }

  // Both city and military installation completions are physical assets.
  // Reconcile once after the batch so a completion cannot be counted twice
  // when the same tick is replayed or a save is loaded between orders.
  if (completed.some(order => order.kind === "city" || order.kind === "military")) {
    const ledger = reconcileInfrastructureLedger(s);
    Object.assign(s, withInfrastructureLedger(s, ledger));
  }

  return { cityCompleted };
}

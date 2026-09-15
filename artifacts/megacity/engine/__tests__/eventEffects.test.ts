import { describe, expect, it } from "vitest";

import {
  BIOSPHERE_EVENT_POOL,
  EXPANSION_EVENT_POOL,
} from "@/engine/events";
import { BB_EVENT_POOL } from "@/engine/addons/bigBrother";
import { SD_EVENT_POOL } from "@/engine/addons/sixthDay";
import { EDICTS } from "@/engine/edicts";
import { BB_EDICTS } from "@/engine/addons/bigBrother";
import { SD_EDICTS } from "@/engine/addons/sixthDay";
import { createInitialState } from "@/engine/initialState";
import { OFFICER_RESPONSES, CONDITION_TRIGGERS } from "@/engine/eventTriggers";
import type { GameEvent } from "@/engine/types";

/**
 * One-shot event effects are applied by `applyEventEffects` in events.ts,
 * which only reads a fixed subset of keys. The GameEvent.effects type
 * (types.ts:451) intentionally allows a wider set, but anything outside the
 * applier's if-chain is silently dropped. This test enumerates all event
 * pools and flags usage of those dead keys.
 *
 * Applier handles (events.ts:applyEventEffects):
 *   credits, food, water, power, fuel, unrest, crime, happiness, lawOrder,
 *   corruption, employment, defenseRating, medSupplies, tradeIncome
 *
 * Type allows but applier IGNORES (silent drop):
 *   districtId, populationGrowthRate, foodProduction, powerGeneration,
 *   researchSpeed
 *
 * (`districtId` is allowed by the type as event metadata; if used in
 * `effects` it is not consumed by `applyEventEffects` either.)
 */

const APPLIER_HANDLED_KEYS: ReadonlySet<string> = new Set([
  "credits", "food", "water", "power", "fuel",
  "unrest", "crime", "happiness", "lawOrder", "corruption",
  "employment", "defenseRating", "medSupplies", "tradeIncome",
]);

type EventPool = readonly Omit<GameEvent, "timestamp" | "resolved">[];
const ALL_EVENT_POOLS: { label: string; pool: EventPool }[] = [
  { label: "BIOSPHERE_EVENT_POOL", pool: BIOSPHERE_EVENT_POOL },
  { label: "EXPANSION_EVENT_POOL", pool: EXPANSION_EVENT_POOL },
  { label: "BB_EVENT_POOL", pool: BB_EVENT_POOL },
  { label: "SD_EVENT_POOL", pool: SD_EVENT_POOL },
];

/**
 * Event effect keys currently shipped that the runtime silently drops.
 * Document here as known content debt; remove an entry once the chain is
 * patched (use a handled key) or the applier is extended. ALPHABETISED.
 */
const KNOWN_DEAD_EVENT_EFFECT_KEYS_ALLOWLIST: Set<string> = new Set([
  // GameEvent.effects type allows these but applyEventEffects has no branch
  // for them, so they no-op at runtime. SD_EVENT_POOL ships ~24 events using
  // these keys — all currently inert. Fix is content-side (rewrite to use
  // handled keys) or runtime-side (extend applier). Until then, document
  // here so the guard catches NEW dead keys without burying the existing
  // debt. ALPHABETISED.
  "foodProduction",
  "populationGrowthRate",
  "powerGeneration",
  "researchSpeed",
]);

describe("one-shot event effect integrity", () => {
  it("every pool has events and every event has at least one effect key", () => {
    for (const { label, pool } of ALL_EVENT_POOLS) {
      expect(pool.length, `${label} length`).toBeGreaterThan(0);
      for (const ev of pool) {
        expect(
          Object.keys(ev.effects ?? {}).length,
          `${label}.${ev.id} has no effect keys`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("event ids are unique within each pool", () => {
    const dupes: string[] = [];
    for (const { label, pool } of ALL_EVENT_POOLS) {
      const seen = new Set<string>();
      for (const ev of pool) {
        if (seen.has(ev.id)) dupes.push(`${label} duplicate id: ${ev.id}`);
        seen.add(ev.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("every event effect key is recognised by applyEventEffects", () => {
    const dead: string[] = [];
    for (const { label, pool } of ALL_EVENT_POOLS) {
      for (const ev of pool) {
        for (const key of Object.keys(ev.effects ?? {})) {
          if (!APPLIER_HANDLED_KEYS.has(key) && !KNOWN_DEAD_EVENT_EFFECT_KEYS_ALLOWLIST.has(key)) {
            dead.push(`${label}.${ev.id} effect "${key}"`);
          }
        }
      }
    }
    expect(
      dead,
      "Effect key not handled by applyEventEffects — silently dropped at runtime",
    ).toEqual([]);
  });

  it("KNOWN_DEAD_EVENT_EFFECT_KEYS_ALLOWLIST has no stale entries", () => {
    const allKeys = new Set<string>();
    for (const { pool } of ALL_EVENT_POOLS) {
      for (const ev of pool) for (const k of Object.keys(ev.effects ?? {})) allKeys.add(k);
    }
    const stale = [...KNOWN_DEAD_EVENT_EFFECT_KEYS_ALLOWLIST].filter(
      (k) => !allKeys.has(k) || APPLIER_HANDLED_KEYS.has(k),
    );
    expect(stale, "Allowlist entry no longer needed — remove it").toEqual([]);
  });
});

/**
 * `applyResponseEffects` in events.ts (the player-pick applier) handles a
 * DIFFERENT subset than `applyEventEffects`. Notably `fuel` is missing.
 * Anything outside this set is silently dropped when the player chooses a
 * response option.
 */
const RESPONSE_APPLIER_HANDLED_KEYS: ReadonlySet<string> = new Set([
  "credits", "food", "water", "power",
  "unrest", "crime", "happiness", "lawOrder", "corruption",
  "employment", "defenseRating", "medSupplies", "tradeIncome",
]);

const VALID_SEVERITIES: ReadonlySet<string> = new Set(["low", "medium", "high", "critical"]);

const KNOWN_DEAD_RESPONSE_EFFECT_KEYS_ALLOWLIST: Set<string> = new Set([]);

describe("event response wiring integrity", () => {
  it("every event severity is a valid GameEvent severity", () => {
    const bad: string[] = [];
    for (const { label, pool } of ALL_EVENT_POOLS) {
      for (const ev of pool) {
        if (!VALID_SEVERITIES.has(ev.severity)) {
          bad.push(`${label}.${ev.id} severity="${ev.severity}"`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every event with responseOptions has a non-empty resolved array (no missing RESPONSE_MAP keys)", () => {
    const broken: string[] = [];
    for (const { label, pool } of ALL_EVENT_POOLS) {
      for (const ev of pool) {
        if (!("responseOptions" in ev)) continue;
        const ro = ev.responseOptions;
        // Catches: `responseOptions: RESPONSE_MAP["renamed_id"]` resolving
        // to undefined because the map key was never updated.
        if (ro === undefined || ro === null) {
          broken.push(`${label}.${ev.id} responseOptions=undefined (RESPONSE_MAP miss?)`);
          continue;
        }
        if (!Array.isArray(ro)) {
          broken.push(`${label}.${ev.id} responseOptions is not an array`);
          continue;
        }
        if (ro.length === 0) {
          broken.push(`${label}.${ev.id} responseOptions is empty`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("response option ids are unique within each event", () => {
    const dupes: string[] = [];
    for (const { label, pool } of ALL_EVENT_POOLS) {
      for (const ev of pool) {
        const ro = ev.responseOptions;
        if (!Array.isArray(ro)) continue;
        const seen = new Set<string>();
        for (const r of ro) {
          if (seen.has(r.id)) dupes.push(`${label}.${ev.id} duplicate response id: ${r.id}`);
          seen.add(r.id);
        }
      }
    }
    expect(dupes).toEqual([]);
  });

  it("every response effect key is recognised by applyResponseEffects", () => {
    const dead: string[] = [];
    for (const { label, pool } of ALL_EVENT_POOLS) {
      for (const ev of pool) {
        const ro = ev.responseOptions;
        if (!Array.isArray(ro)) continue;
        for (const resp of ro) {
          for (const key of Object.keys(resp.effects ?? {})) {
            if (
              !RESPONSE_APPLIER_HANDLED_KEYS.has(key) &&
              !KNOWN_DEAD_RESPONSE_EFFECT_KEYS_ALLOWLIST.has(key)
            ) {
              dead.push(`${label}.${ev.id}.${resp.id} effect "${key}"`);
            }
          }
        }
      }
    }
    expect(
      dead,
      "Response effect key not handled by applyResponseEffects — silently dropped when player picks this option",
    ).toEqual([]);
  });

  it("KNOWN_DEAD_RESPONSE_EFFECT_KEYS_ALLOWLIST has no stale entries", () => {
    const allKeys = new Set<string>();
    for (const { pool } of ALL_EVENT_POOLS) {
      for (const ev of pool) {
        const ro = ev.responseOptions;
        if (!Array.isArray(ro)) continue;
        for (const resp of ro) for (const k of Object.keys(resp.effects ?? {})) allKeys.add(k);
      }
    }
    const stale = [...KNOWN_DEAD_RESPONSE_EFFECT_KEYS_ALLOWLIST].filter(
      (k) => !allKeys.has(k) || RESPONSE_APPLIER_HANDLED_KEYS.has(k),
    );
    expect(stale, "Allowlist entry no longer needed — remove it").toEqual([]);
  });
});

/**
 * Edict factionInfluence references the faction by stringly-typed id. TS does
 * not validate it; if the faction id doesn't exist in s.factions, the
 * influence delta is silently dropped at runtime (formulas.ts edict applier).
 */
describe("edict factionInfluence integrity", () => {
  const VALID_FACTION_IDS = new Set(createInitialState().factions.map((f) => f.id));

  const ALL_EDICT_SETS = [
    { label: "EDICTS", edicts: EDICTS },
    { label: "BB_EDICTS", edicts: BB_EDICTS },
    { label: "SD_EDICTS", edicts: SD_EDICTS },
  ];

  it("every factionInfluence.factionId resolves to a real faction", () => {
    const broken: string[] = [];
    for (const { label, edicts } of ALL_EDICT_SETS) {
      for (const ed of edicts) {
        const fi = ed.effects.factionInfluence;
        if (!fi) continue;
        if (!VALID_FACTION_IDS.has(fi.factionId)) {
          broken.push(`${label}.${ed.id} factionInfluence.factionId="${fi.factionId}"`);
        }
      }
    }
    expect(
      broken,
      "Edict references a faction id not in s.factions — influence delta silently dropped",
    ).toEqual([]);
  });
});

/**
 * `eventTriggers.ts` is a separate dispatcher path from the static event
 * pools — it generates events at runtime from CONDITION_TRIGGERS based on
 * game state. The OFFICER_RESPONSES table holds the player-pick options
 * that triggered events offer. Both paths must obey the same effect-key
 * contract as the static pools, but until now they were uncovered. As
 * content pools (weather, religion, education, and the upcoming
 * prison/sports/tourism/transit/sewer/celebrity sets) are added, this
 * guard prevents shipping a trigger or response with a silently-dropped
 * effect key, a missing/renamed RESPONSE_MAP entry, or an invalid
 * severity.
 */
describe("eventTriggers dispatcher integrity", () => {
  it("every OFFICER_RESPONSES entry is a non-empty array of options", () => {
    const broken: string[] = [];
    for (const [key, opts] of Object.entries(OFFICER_RESPONSES)) {
      if (!Array.isArray(opts)) {
        broken.push(`OFFICER_RESPONSES.${key} is not an array`);
        continue;
      }
      if (opts.length === 0) broken.push(`OFFICER_RESPONSES.${key} is empty`);
    }
    expect(broken).toEqual([]);
  });

  it("every OFFICER_RESPONSES option uses only response-applier keys", () => {
    const dead: string[] = [];
    for (const [key, opts] of Object.entries(OFFICER_RESPONSES)) {
      if (!Array.isArray(opts)) continue;
      for (const opt of opts) {
        for (const k of Object.keys(opt.effects ?? {})) {
          if (
            !RESPONSE_APPLIER_HANDLED_KEYS.has(k) &&
            !KNOWN_DEAD_RESPONSE_EFFECT_KEYS_ALLOWLIST.has(k)
          ) {
            dead.push(`OFFICER_RESPONSES.${key}.${opt.id} effect "${k}"`);
          }
        }
      }
    }
    expect(
      dead,
      "Response effect key not handled by applyResponseEffects — silently dropped when player picks this option",
    ).toEqual([]);
  });

  it("response option ids are unique within each OFFICER_RESPONSES entry", () => {
    const dupes: string[] = [];
    for (const [key, opts] of Object.entries(OFFICER_RESPONSES)) {
      if (!Array.isArray(opts)) continue;
      const seen = new Set<string>();
      for (const opt of opts) {
        if (seen.has(opt.id)) dupes.push(`OFFICER_RESPONSES.${key} duplicate response id: ${opt.id}`);
        seen.add(opt.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("CONDITION_TRIGGERS ids are unique", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const t of CONDITION_TRIGGERS) {
      if (seen.has(t.id)) dupes.push(t.id);
      seen.add(t.id);
    }
    expect(dupes, "duplicate trigger id").toEqual([]);
  });

  it("CONDITION_TRIGGERS cooldownTicks are positive", () => {
    const bad: string[] = [];
    for (const t of CONDITION_TRIGGERS) {
      if (!Number.isFinite(t.cooldownTicks) || t.cooldownTicks <= 0) {
        bad.push(`${t.id} cooldownTicks=${t.cooldownTicks}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every trigger generates an event with valid severity, non-empty responseOptions, and applier-handled effect keys", () => {
    // Respect the dispatcher contract: generate() may assume check()
    // passed (e.g. officer triggers index into a non-empty officer pool
    // selected during check). Triggers whose check() is false on the
    // initial state are still validated for id uniqueness, cooldown,
    // and OFFICER_RESPONSES coverage above; only generate-time fields
    // (severity, responseOptions wiring, seed effect keys) are skipped.
    const baseState = createInitialState();
    const broken: string[] = [];
    const dead: string[] = [];
    let exercised = 0;
    for (const t of CONDITION_TRIGGERS) {
      let passes = false;
      try {
        passes = t.check(baseState);
      } catch (err) {
        broken.push(`${t.id} check() threw: ${(err as Error).message}`);
        continue;
      }
      if (!passes) continue;
      exercised++;
      let ev: ReturnType<typeof t.generate>;
      try {
        ev = t.generate(baseState);
      } catch (err) {
        broken.push(`${t.id} generate() threw: ${(err as Error).message}`);
        continue;
      }
      if (!VALID_SEVERITIES.has(ev.severity)) {
        broken.push(`${t.id} severity="${ev.severity}"`);
      }
      if (ev.id !== t.id) {
        // Catches cut-and-paste mistakes where trigger.id and the
        // generated event.id drift apart — the dispatcher uses event.id
        // for cooldown bookkeeping and that mismatch breaks rate-limiting.
        broken.push(`${t.id} generated event.id="${ev.id}" mismatch`);
      }
      const ro = ev.responseOptions;
      if (ro === undefined || ro === null) {
        broken.push(`${t.id} responseOptions=undefined (OFFICER_RESPONSES miss?)`);
      } else if (!Array.isArray(ro)) {
        broken.push(`${t.id} responseOptions is not an array`);
      } else if (ro.length === 0) {
        broken.push(`${t.id} responseOptions is empty`);
      }
      // Event seed effects go through applyEventEffects (the wider applier
      // that includes `fuel`), not applyResponseEffects.
      for (const k of Object.keys(ev.effects ?? {})) {
        if (!APPLIER_HANDLED_KEYS.has(k) && !KNOWN_DEAD_EVENT_EFFECT_KEYS_ALLOWLIST.has(k)) {
          dead.push(`${t.id} seed effect "${k}"`);
        }
      }
    }
    expect(broken, "trigger/event integrity failure").toEqual([]);
    expect(dead, "trigger seed effect key not handled by applyEventEffects").toEqual([]);
    // Sanity: ensure the loop actually exercised some generate() paths.
    // If the initial state ever drifts so that zero triggers fire, this
    // test silently degrades to a no-op without this guard.
    expect(exercised, "no triggers exercised on initial state").toBeGreaterThan(0);
  });
});

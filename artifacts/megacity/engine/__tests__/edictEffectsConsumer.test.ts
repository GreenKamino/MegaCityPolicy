/* eslint-disable no-console */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EDICTS, type EdictEffect } from "@/engine/edicts";

/**
 * Drift guard: EdictEffect ↔ engine consumer wiring.
 *
 * Mirrors the policyEffectsConsumer / eventEffectsConsumer pattern.
 *
 * Sources of truth audited:
 *
 *   1. The EdictEffect type union (engine/edicts.ts top of file) —
 *      defines every legal effect key.
 *   2. The EDICTS catalog — declares which keys are actually used
 *      by at least one edict (silent unused keys are dead surface).
 *   3. The LIVE tick path (engine/formulas.ts: "ACTIVE EDICTS"
 *      block, ~line 2193) — applies edict effects each tick.
 *   4. The CATCHUP / skipped-time path (engine/formulas.ts: ~line
 *      3309) — applies edict effects accumulated during skipped
 *      ticks. Only handles credits-flavored fields (credits,
 *      creditsPerTick, tradeIncome) by design — every other stat
 *      effect is SILENTLY DROPPED during skipped time. This is a
 *      real semantic gap: a player skipping ahead with active
 *      edicts loses all happiness/crime/corruption/etc impact those
 *      edicts would have had. Documented here as known debt; if it
 *      gets addressed, the CATCHUP_SILENTLY_DROPPED list shrinks.
 *
 * Allowlists carry per-key notes documenting WHY they fall in each
 * bucket. Staleness siblings prune entries that no longer apply.
 */

const EDICTS_PATH = "engine/edicts.ts";
const FORMULAS_PATH = "engine/formulas.ts";

interface NotedKey {
  key: keyof EdictEffect;
  note: string;
}

// EdictEffect keys defined in the type but NOT set by any edict in
// the EDICTS catalog. Dead surface — either (a) intentional
// future-proofing for unwritten edicts, or (b) renamed key whose
// old name was left behind. Pin so the situation is visible.
const SILENT_UNUSED_KEYS: readonly NotedKey[] = [
  {
    key: "populationGrowthRate",
    note:
      "Defined alongside populationGrowth (which IS used by some edicts and writes to the same target field cs.populationGrowthRate). Likely a rename whose old/new names both stayed in the type. No edict sets this key.",
  },
];

// Effect keys handled by the LIVE tick path (formulas.ts ~L2193).
// All 19 EdictEffect keys are wired here — no live-path drops.
// Documented for completeness rather than as debt.
const LIVE_PATH_WIRED_COUNT = 19;

// Effect keys handled by the CATCHUP / skipped-time path
// (formulas.ts ~L3309). Only credits-flavored fields. Every other
// EdictEffect key is silently dropped during skipped time — real
// semantic gap.
const CATCHUP_PATH_WIRED: readonly (keyof EdictEffect)[] = [
  "credits",
  "creditsPerTick",
  "tradeIncome",
];

// Keys that the catchup path SILENTLY DROPS during skipped ticks.
// Each is wired in the live path but ignored when the player skips
// ahead, so an edict active during skipped time produces zero stat
// impact.
const CATCHUP_SILENTLY_DROPPED: readonly NotedKey[] = [
  { key: "happiness", note: "Stat effect dropped on skipped ticks." },
  { key: "crime", note: "Stat effect dropped on skipped ticks." },
  { key: "corruption", note: "Stat effect dropped on skipped ticks." },
  { key: "unrest", note: "Stat effect dropped on skipped ticks." },
  { key: "employment", note: "Stat effect dropped on skipped ticks." },
  { key: "populationGrowth", note: "Stat effect dropped on skipped ticks." },
  { key: "populationGrowthRate", note: "Stat effect dropped on skipped ticks (also unused by any edict — see SILENT_UNUSED_KEYS)." },
  { key: "infrastructureRepair", note: "Stat effect dropped on skipped ticks." },
  { key: "lawEnforcement", note: "Stat effect dropped on skipped ticks." },
  { key: "lawOrder", note: "Stat effect dropped on skipped ticks." },
  { key: "defenseRating", note: "Stat effect dropped on skipped ticks." },
  { key: "foodProduction", note: "Rate effect dropped on skipped ticks." },
  { key: "diseaseRisk", note: "Stat effect dropped on skipped ticks (accelerated catch-up tail). Applied live and during fully-simulated catch-up ticks, same as happiness/crime/etc." },
  { key: "researchSpeed", note: "Rate effect dropped on skipped ticks. Used by innovation_grant_burst — its research lift therefore evaporates during catchup; live-only by design (matches happiness/crime/etc. which are also live-only)." },
  { key: "factionInfluence", note: "Faction influence delta dropped on skipped ticks." },
  { key: "bordersClosed", note: "Boolean toggle dropped on skipped ticks." },
];

function extractEdictEffectKeys(): Set<string> {
  // Parse the EdictEffect type literal at the top of edicts.ts.
  const src = readFileSync(EDICTS_PATH, "utf8");
  // Anchor closing `};` at column 0 — the inline object literal in
  // `factionInfluence?: { ... };` contains its own `};` and would
  // otherwise terminate a non-anchored match early.
  const m = src.match(/export type EdictEffect\s*=\s*\{([\s\S]*?)^\};/m);
  if (!m) throw new Error("EdictEffect type not found in edicts.ts");
  const body = m[1];
  const keys = new Set<string>();
  for (const km of body.matchAll(/^\s*(\w+)\?:/gm)) keys.add(km[1]);
  return keys;
}

function extractKeysUsedByEdicts(): Set<string> {
  // Walk every entry's `effects: { ... }` block and collect top-level keys.
  // factionInfluence is an object whose inner fields (factionId, delta)
  // are NOT effect keys — strip those.
  const used = new Set<string>();
  for (const def of EDICTS) {
    for (const k of Object.keys(def.effects)) used.add(k);
  }
  return used;
}

function liveTickPathWiredKeys(): Set<string> {
  // Conservative scan: read the formulas.ts ACTIVE EDICTS block and
  // pick out `fx.<key>` references. Bounds the block by the section
  // header comment at the top and `s.activeEdicts = surviving;` at
  // the bottom.
  const src = readFileSync(FORMULAS_PATH, "utf8");
  const startMarker = "// ─── ACTIVE EDICTS";
  const endMarker = "s.activeEdicts = surviving;";
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker, startIdx);
  if (startIdx < 0 || endIdx < 0)
    throw new Error("Live tick path edict block not found in formulas.ts");
  const block = src.slice(startIdx, endIdx);
  const keys = new Set<string>();
  for (const m of block.matchAll(/\bfx\.(\w+)\b/g)) keys.add(m[1]);
  // populationGrowth / populationGrowthRate are consumed EARLIER in the
  // tick, inside the POPULATION block, as a temporary per-tick modifier
  // (`edFx?.<key>`). They were deliberately removed from the ACTIVE
  // EDICTS block: applying them there mutated cs.populationGrowthRate
  // every active tick with no reversal on expiry — a permanent ratchet
  // that compounded population to the 100B ceiling during offline
  // catch-up. Scan that block too so this guard tracks the real
  // consumer and still trips if someone deletes it.
  const popStart = src.indexOf("// Active-edict growth boosts are TEMPORARY");
  const popEnd = src.indexOf("if (r.food <= 0)", popStart);
  if (popStart < 0 || popEnd < 0)
    throw new Error("Population-block edict boost section not found in formulas.ts");
  const popBlock = src.slice(popStart, popEnd);
  for (const m of popBlock.matchAll(/\bedFx\?\.(\w+)\b/g)) keys.add(m[1]);
  return keys;
}

function catchupPathWiredKeys(): Set<string> {
  // Source-derived extractor for the catchup / skipped-time edict
  // block in formulas.ts (~L3308 onwards). Bounds the block by the
  // edict-specific comment marker and the closing
  // `current.edictCooldowns = cooldowns;`.
  const src = readFileSync(FORMULAS_PATH, "utf8");
  const startMarker = "// Mirror active-edict per-tick credit and trade-income";
  const endMarker = "current.edictCooldowns = cooldowns;";
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker, startIdx);
  if (startIdx < 0 || endIdx < 0)
    throw new Error("Catchup edict block not found in formulas.ts");
  const block = src.slice(startIdx, endIdx);
  const keys = new Set<string>();
  for (const m of block.matchAll(/\bfx\.(\w+)\b/g)) keys.add(m[1]);
  return keys;
}

describe("EdictEffect ↔ engine consumer wiring (drift guard)", () => {
  const definedKeys = extractEdictEffectKeys();
  const usedKeys = extractKeysUsedByEdicts();
  const liveWired = liveTickPathWiredKeys();

  it("EdictEffect type defines exactly 19 keys (surface budget)", () => {
    expect(definedKeys.size).toBe(19);
  });

  it("every EdictEffect key is either USED by an edict or in SILENT_UNUSED_KEYS allowlist", () => {
    const allowed = new Set(SILENT_UNUSED_KEYS.map((e) => e.key));
    const unaccounted = [...definedKeys]
      .filter((k) => !usedKeys.has(k) && !allowed.has(k as keyof EdictEffect))
      .sort();
    if (unaccounted.length > 0)
      console.error("[edicts] unaccounted unused keys:", unaccounted);
    expect(unaccounted).toEqual([]);
  });

  it("SILENT_UNUSED_KEYS staleness — entries must still be defined and unused", () => {
    const stale: string[] = [];
    for (const e of SILENT_UNUSED_KEYS) {
      if (!definedKeys.has(e.key)) {
        stale.push(`${e.key}: removed from EdictEffect type — drop allowlist entry.`);
      } else if (usedKeys.has(e.key)) {
        stale.push(`${e.key}: now used by at least one edict — drop allowlist entry.`);
      }
    }
    if (stale.length > 0) console.error("[edicts] stale silent-unused entries:", stale);
    expect(stale).toEqual([]);
  });

  it("live tick path wires every EdictEffect key (no silent drops live)", () => {
    const missing = [...definedKeys].filter((k) => !liveWired.has(k)).sort();
    if (missing.length > 0)
      console.error("[edicts] live tick path silently drops:", missing);
    expect(missing).toEqual([]);
    expect(liveWired.size).toBeGreaterThanOrEqual(LIVE_PATH_WIRED_COUNT);
  });

  it("catchup-path wired set matches what formulas.ts catchup block actually reads", () => {
    // Source-derived: parse `fx.<key>` references from the catchup
    // block itself rather than asserting against a hardcoded list.
    // Any future expansion or contraction of catchup coverage is
    // detected automatically.
    const sourceWired = catchupPathWiredKeys();
    const expected = [...sourceWired].sort();
    const actual = [...CATCHUP_PATH_WIRED].sort();
    if (expected.join(",") !== actual.join(",")) {
      console.error("[edicts-catchup] catchup block wires:    ", expected);
      console.error("[edicts-catchup] CATCHUP_PATH_WIRED has: ", actual);
    }
    expect(actual).toEqual(expected);
  });

  it("CATCHUP_SILENTLY_DROPPED ∪ CATCHUP_PATH_WIRED partitions EdictEffect keys", () => {
    const wired = new Set(CATCHUP_PATH_WIRED);
    const dropped = new Set(CATCHUP_SILENTLY_DROPPED.map((e) => e.key));
    const overlap = [...wired].filter((k) => dropped.has(k as keyof EdictEffect));
    expect(overlap).toEqual([]);
    const union = new Set<string>([...wired, ...dropped]);
    const missingFromUnion = [...definedKeys].filter((k) => !union.has(k)).sort();
    const extraInUnion = [...union].filter((k) => !definedKeys.has(k)).sort();
    if (missingFromUnion.length > 0)
      console.error("[edicts] EdictEffect keys not classified by either bucket:", missingFromUnion);
    if (extraInUnion.length > 0)
      console.error("[edicts] catchup buckets reference non-existent keys:", extraInUnion);
    expect(missingFromUnion).toEqual([]);
    expect(extraInUnion).toEqual([]);
  });
});

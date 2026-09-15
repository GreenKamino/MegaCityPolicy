/* eslint-disable no-console */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_POLICIES, type PolicyEffect } from "@/engine/policies";

/**
 * Drift guard: PolicyEffect catchup-path coverage.
 *
 * Companion to policyEffectsConsumer.test.ts (which guards the
 * LIVE tick path) and edictEffectsConsumer.test.ts (which guards
 * the equivalent EdictEffect surface). Audits which PolicyEffect
 * keys survive the fast-forward / skipped-time path in
 * engine/formulas.ts (~L3275 onwards).
 *
 * The catchup path does NOT iterate active policies the way the
 * live tick does. Instead it relies on:
 *
 *   - Pre-baked `current.rates.*` snapshots from the last live
 *     tick (which DID fold in policy rate-bonus contributions).
 *     This effectively honors rate-bonus PolicyEffect keys during
 *     skipped time.
 *   - A small carve-out for mining policies (inline credits).
 *
 * Everything else — per-tick stat deltas (crime/unrest/happiness/
 * etc.), populationGrowthRate, researchSpeed, constructionSpeed —
 * is silently dropped during skipped ticks. A player skipping
 * ahead loses all per-tick stat impact those policies would have
 * had. Documented here as known semantic debt.
 */

const POLICIES_PATH = "engine/policies.ts";
const FORMULAS_PATH = "engine/formulas.ts";
const UTILITY_PRODUCTION_PATH = "engine/utilityProduction.ts";

interface NotedKey {
  key: keyof PolicyEffect;
  note: string;
}

// PolicyEffect keys honored during skipped ticks because they were
// already folded into `current.rates.*` by the last live tick.
// Order normalized when comparing.
const CATCHUP_RATE_BAKED: readonly (keyof PolicyEffect)[] = [
  "taxIncome",
  "tradeIncome",
  "foodProduction",
  "waterProduction",
  "powerGeneration",
  "steelProduction",
  "goodsProduction",
  "fuelProduction",
  "medProduction",
];

// PolicyEffect keys silently dropped during skipped ticks. Each is
// wired by the live tick path but the catchup path never re-applies
// them, so an active policy during a skip-ahead window contributes
// zero per-tick effect for these keys.
const CATCHUP_SILENTLY_DROPPED: readonly NotedKey[] = [
  { key: "crime", note: "Per-tick stat delta dropped on skipped ticks." },
  { key: "unrest", note: "Per-tick stat delta dropped on skipped ticks." },
  { key: "happiness", note: "Per-tick stat delta dropped on skipped ticks." },
  { key: "lawOrder", note: "Per-tick stat delta dropped on skipped ticks." },
  { key: "corruption", note: "Per-tick stat delta dropped on skipped ticks." },
  { key: "employment", note: "Per-tick stat delta dropped on skipped ticks." },
  { key: "infrastructureHealth", note: "Per-tick stat delta dropped on skipped ticks." },
  { key: "defenseRating", note: "Per-tick stat delta dropped on skipped ticks." },
  { key: "populationGrowthRate", note: "Population growth contribution dropped on skipped ticks." },
  { key: "researchSpeed", note: "Research-speed contribution dropped on skipped ticks." },
  { key: "constructionSpeed", note: "Defined in PolicyEffect but no live or catchup reader exists in engine/formulas.ts (separate from playerProgression's constructionSpeedBonus)." },
];

function extractPolicyEffectKeys(): Set<string> {
  // PolicyEffect is `Partial<{ ... }>` — different shape from EdictEffect.
  const src = readFileSync(POLICIES_PATH, "utf8");
  const m = src.match(/export type PolicyEffect\s*=\s*Partial<\{([\s\S]*?)\}>;/);
  if (!m) throw new Error("PolicyEffect type not found in policies.ts");
  const body = m[1];
  const keys = new Set<string>();
  for (const km of body.matchAll(/^\s*(\w+):/gm)) keys.add(km[1]);
  return keys;
}

function rateBakedKeysFromLivePath(): Set<string> {
  // Read the rate-bonus loop in the live tick path:
  //
  //   for (const pid of activePols) {
  //     ...
  //     if (fx.taxIncome) rates.taxIncome += fx.taxIncome;
  //     ...
  //   }
  //
  // Bound to between "CITY POLICY RATE BONUSES" header and the
  // closing brace of that loop (followed by MEGA-PROJECT header).
  const src = readFileSync(FORMULAS_PATH, "utf8");
  const startMarker = "// ─── CITY POLICY RATE BONUSES";
  const endMarker = "// ─── MEGA-PROJECT PRODUCTION BONUSES";
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker, startIdx);
  if (startIdx < 0 || endIdx < 0)
    throw new Error("Live policy rate-bonus block not found in formulas.ts");
  const block = src.slice(startIdx, endIdx);
  const keys = new Set<string>();
  for (const m of block.matchAll(/\bfx\.(\w+)\b/g)) keys.add(m[1]);
  // Power and water policy effects are now applied by the shared utility
  // production helper, while the resulting rates remain baked for catch-up.
  const utility = readFileSync(UTILITY_PRODUCTION_PATH, "utf8");
  if (utility.includes("effects.powerGeneration")) keys.add("powerGeneration");
  if (utility.includes("effects.waterProduction")) keys.add("waterProduction");
  return keys;
}

function rateKeysReadByCatchupBlock(): Set<string> {
  // Source-derived: the catchup / skipped-time block in formulas.ts
  // (~L3308 onwards) extrapolates resources via lines like:
  //
  //   r.steel += rates.steelProduction * skipped;
  //   r.food  += (rates.foodProduction - rates.foodConsumption) * skipped;
  //
  // Every `rates.<key>` referenced in the skipped-resource section
  // is a key whose policy contribution survives skipped time
  // (because rates.* was already baked by the prior live tick).
  // Bounded from the top of the BATCH_LIMIT skipped extrapolation
  // (where netTax/netTrade are derived from `rates.taxIncome` /
  // `rates.tradeIncome`) down through the negative-clamp section.
  // A narrower bound would miss those two indirect reads.
  const src = readFileSync(FORMULAS_PATH, "utf8");
  const startMarker = "// Apply same bureaucratic-overhead deduction";
  const endMarker = "if (r.credits < 0) r.credits = 0;";
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker, startIdx);
  if (startIdx < 0 || endIdx < 0)
    throw new Error("Catchup resource extrapolation block not found in formulas.ts");
  const block = src.slice(startIdx, endIdx);
  const keys = new Set<string>();
  for (const m of block.matchAll(/\brates\.(\w+)\b/g)) keys.add(m[1]);
  return keys;
}

describe("PolicyEffect catchup-path coverage (drift guard)", () => {
  const definedKeys = extractPolicyEffectKeys();
  const liveRateBakedKeys = rateBakedKeysFromLivePath();
  const catchupBaked = new Set(CATCHUP_RATE_BAKED);
  const catchupDropped = new Set(CATCHUP_SILENTLY_DROPPED.map((e) => e.key));

  it("PolicyEffect type defines exactly 20 keys (surface budget)", () => {
    expect(definedKeys.size).toBe(20);
  });

  it("CATCHUP_RATE_BAKED matches the live rate-bonus loop's wired keys exactly", () => {
    // Catchup honors a key during skipped time iff the live tick
    // folds it into `rates.*` (which then carries through).
    const expected = [...liveRateBakedKeys].sort();
    const actual = [...CATCHUP_RATE_BAKED].sort();
    if (expected.join(",") !== actual.join(",")) {
      console.error("[policy-catchup] live rate-bonus keys:", expected);
      console.error("[policy-catchup] CATCHUP_RATE_BAKED:    ", actual);
    }
    expect(actual).toEqual(expected);
  });

  it("CATCHUP_RATE_BAKED is exactly the PolicyEffect-named rates the catchup block actually reads", () => {
    // Source-derived end-to-end check: parse `rates.<key>` from the
    // skipped-resource extrapolation block in formulas.ts, intersect
    // with PolicyEffect's key set, then compare. Catches drift even
    // if the live rate-bonus loop and the catchup block fall out of
    // sync (the previous live-loop comparison is necessary but not
    // sufficient for the catchup claim).
    const ratesRead = rateKeysReadByCatchupBlock();
    const policyRatesReadByCatchup = [...ratesRead].filter((k) => definedKeys.has(k)).sort();
    const actual = [...CATCHUP_RATE_BAKED].sort();
    if (policyRatesReadByCatchup.join(",") !== actual.join(",")) {
      console.error("[policy-catchup] catchup block reads PolicyEffect rates:", policyRatesReadByCatchup);
      console.error("[policy-catchup] CATCHUP_RATE_BAKED:                     ", actual);
    }
    expect(actual).toEqual(policyRatesReadByCatchup);
  });

  it("CATCHUP_RATE_BAKED ∪ CATCHUP_SILENTLY_DROPPED partitions PolicyEffect keys exactly", () => {
    const overlap = [...catchupBaked].filter((k) => catchupDropped.has(k as keyof PolicyEffect));
    expect(overlap).toEqual([]);
    const union = new Set<string>([...catchupBaked, ...catchupDropped]);
    const missing = [...definedKeys].filter((k) => !union.has(k)).sort();
    const extra = [...union].filter((k) => !definedKeys.has(k)).sort();
    if (missing.length > 0)
      console.error("[policy-catchup] PolicyEffect keys not classified:", missing);
    if (extra.length > 0)
      console.error("[policy-catchup] catchup buckets reference non-existent keys:", extra);
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("CATCHUP_SILENTLY_DROPPED staleness — every entry must still exist in PolicyEffect", () => {
    const stale = CATCHUP_SILENTLY_DROPPED
      .filter((e) => !definedKeys.has(e.key))
      .map((e) => `${e.key}: removed from PolicyEffect — drop allowlist entry.`);
    if (stale.length > 0) console.error("[policy-catchup] stale dropped entries:", stale);
    expect(stale).toEqual([]);
  });

  it("at least one POLICIES entry exercises each CATCHUP_RATE_BAKED key (sanity)", () => {
    // If a rate-bonus key isn't set by ANY policy, it's a dead key
    // that doesn't belong in CATCHUP_RATE_BAKED. Soft sanity check.
    const setByAny = new Set<string>();
    for (const p of ALL_POLICIES) {
      for (const k of Object.keys(p.effects)) setByAny.add(k);
    }
    const unused = CATCHUP_RATE_BAKED.filter((k) => !setByAny.has(k));
    if (unused.length > 0)
      console.error("[policy-catchup] rate-baked keys with no policy author:", unused);
    expect(unused).toEqual([]);
  });
});

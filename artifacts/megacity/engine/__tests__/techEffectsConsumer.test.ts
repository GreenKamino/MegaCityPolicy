import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { ALL_TECHNOLOGIES } from "@/engine/technologies";

/**
 * Tech effect consumer drift guard.
 *
 * `TechDef.effects` is `Partial<{...20 keys...}>`, but the production-rate
 * functions in engine/formulas.ts and engine/researchBreakdown.ts (the
 * consumers that actually apply tech effects to a tick) read only a subset
 * of those keys via `techEffects.X ?? 0`. Every tech that puts an effect on an unconsumed
 * key is silent content debt — the effect appears in the source and in
 * UI displays driven by `getTotalTechEffects`, but never affects
 * gameplay.
 *
 * This test:
 *   1. Parses the consumed-key set from the tick formula and its leaf
 *      research-breakdown module.
 *   2. Walks ALL_TECHNOLOGIES at runtime to collect every effect key
 *      actually used in tech literals.
 *   3. Computes used \ consumed → the silent-drop set.
 *   4. Allowlists the current debt count (per key) so progress is
 *      tracked. Any NEW unconsumed-key usage fails the test.
 *   5. Staleness sibling: if a key gets wired to formulas.ts, the
 *      allowlist must drop the entry.
 */

const ENGINE_DIR = path.resolve(__dirname, "..");

const formulasSrc = fs.readFileSync(path.join(ENGINE_DIR, "formulas.ts"), "utf8");
const researchBreakdownSrc = fs.readFileSync(path.join(ENGINE_DIR, "researchBreakdown.ts"), "utf8");
const utilityProductionSrc = fs.readFileSync(path.join(ENGINE_DIR, "utilityProduction.ts"), "utf8");
const constructionSrc = fs.readFileSync(path.join(ENGINE_DIR, "pendingConstruction.ts"), "utf8");

/** Keys actually consumed by the tick formula via `techEffects.X` reads. */
const CONSUMED_KEYS: Set<string> = (() => {
  const consumed = new Set<string>();
  const re = /techEffects\.(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(`${formulasSrc}\n${researchBreakdownSrc}`))) consumed.add(m[1]!);
  for (const key of ["powerGeneration", "waterProduction"]) {
    if (utilityProductionSrc.includes(`.${key} ?? 0`)) consumed.add(key);
  }
  if (/TECH_MAP\[id\]\?\.effects\.constructionSpeed/.test(constructionSrc)) {
    consumed.add("constructionSpeed");
  }
  return consumed;
})();

/** Per-key count of techs declaring an effect on that key. */
const USAGE_BY_KEY: Record<string, number> = (() => {
  const usage: Record<string, number> = {};
  for (const tech of ALL_TECHNOLOGIES) {
    for (const key of Object.keys(tech.effects)) {
      usage[key] = (usage[key] ?? 0) + 1;
    }
  }
  return usage;
})();

/**
 * Documented content debt: tech effect keys that are USED in tech literals
 * but NOT consumed by the tick formula. Each entry maps key -> current
 * tech count using that key. New growth or new keys both fail the test.
 *
 * Action items implied by this list (none required for the audit to pass —
 * the allowlist just freezes current state):
 *   - either wire each key into engine/formulas.ts,
 *   - or strip the unused effect from the offending tech literals,
 *   - or (last resort) lower the count here as content shifts.
 */
const SILENT_DROP_ALLOWLIST: Record<string, number> = {};

describe("tech effect keys -> formulas.ts consumer", () => {
  it("formulas.ts consumes the expected production-rate key set", () => {
    // Sanity check on the parsed consumer set so a future formula
    // refactor doesn't silently zero this audit out.
    const expected = new Set([
      "powerGeneration", "foodProduction", "waterProduction",
      "steelProduction", "goodsProduction", "fuelProduction",
      "medProduction", "taxIncome", "tradeIncome", "researchSpeed",
      // Silent-drop keys wired in as scaled per-tick city-stat
      // contributions (see TECH_STAT_DIVISOR block in formulas.ts).
      "crime", "unrest", "happiness", "lawOrder", "corruption",
      "employment", "infrastructureHealth", "defenseRating",
      "populationGrowthRate",
      // Consumed at order time in pendingConstruction.ts.
      "constructionSpeed",
    ]);
    expect([...CONSUMED_KEYS].sort()).toEqual([...expected].sort());
  });

  it("no NEW silent-drop tech effect keys appear (allowlist is exhaustive)", () => {
    const unexpectedKeys: string[] = [];
    for (const key of Object.keys(USAGE_BY_KEY)) {
      if (CONSUMED_KEYS.has(key)) continue;
      if (!(key in SILENT_DROP_ALLOWLIST)) unexpectedKeys.push(key);
    }
    expect(
      unexpectedKeys,
      "New tech effect key used in a tech literal but not consumed by formulas.ts — either wire it up or add it to SILENT_DROP_ALLOWLIST as documented debt",
    ).toEqual([]);
  });

  it("silent-drop usage counts have not grown beyond the allowlist", () => {
    const grew: string[] = [];
    for (const [key, allowed] of Object.entries(SILENT_DROP_ALLOWLIST)) {
      const actual = USAGE_BY_KEY[key] ?? 0;
      if (actual > allowed) grew.push(`${key}: ${allowed} -> ${actual}`);
    }
    expect(
      grew,
      "More techs now declare an unconsumed effect key — every increment is gameplay-invisible content. Wire the key in formulas.ts before adding more usages",
    ).toEqual([]);
  });

  it("staleness sibling: every allowlisted key is still unconsumed and still in use", () => {
    const stale: string[] = [];
    for (const key of Object.keys(SILENT_DROP_ALLOWLIST)) {
      if (CONSUMED_KEYS.has(key)) {
        stale.push(`${key} is now consumed by formulas.ts — drop from allowlist`);
      }
      if ((USAGE_BY_KEY[key] ?? 0) === 0) {
        stale.push(`${key} no longer appears in any tech literal — drop from allowlist`);
      }
    }
    expect(stale).toEqual([]);
  });
});

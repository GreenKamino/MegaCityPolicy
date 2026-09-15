import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_POLICIES, type PolicyEffect } from "@/engine/policies";

/**
 * Drift guard: PolicyEffect consumer coverage in formulas.ts.
 *
 * Findings (2026-05-05 audit, mirrors techEffectsConsumer pattern):
 *
 *   engine/policies.ts declares `PolicyEffect` as a Partial of 20
 *   numeric keys. Every PolicyDef carries an `effects: PolicyEffect`
 *   blob, and formulas.ts iterates `state.activePolicies` at four
 *   sites that read those effects:
 *
 *     - production rates  (formulas.ts:452)  reads 9 keys
 *         taxIncome, tradeIncome, foodProduction, waterProduction,
 *         powerGeneration, steelProduction, goodsProduction,
 *         fuelProduction, medProduction
 *
 *     - population growth (formulas.ts:1115) reads 1 key
 *         populationGrowthRate
 *
 *     - research speed    (formulas.ts:1672) reads 1 key
 *         researchSpeed
 *
 *     - citystat tick     (formulas.ts:2270) reads 8 keys
 *         crime, unrest, happiness, lawOrder, corruption,
 *         employment, infrastructureHealth, defenseRating
 *
 *   Net: 19 of 20 PolicyEffect keys are consumed.
 *
 *   `constructionSpeed` is declared on PolicyEffect but read by no
 *   policy consumer. (It IS consumed for TechDef.effects via the
 *   tech-effect path, but that path does not iterate policies, so
 *   any policy that sets constructionSpeed is silently dropped.)
 *
 *   Current silent-drop policy entries: 1 — `sd_genetic_infrastructure_fund`
 *   sets constructionSpeed: 2 with no runtime effect.
 *
 * This test pins:
 *   1. The PolicyEffect union shape (20 keys).
 *   2. The wired-vs-allowlisted split (19 wired, 1 silent).
 *   3. The current count of policies that touch the unread key, so a
 *      regression that adds more silent setters fires the guard.
 *   4. A staleness sibling: every key on the wired list is actually
 *      referenced in formulas.ts source, every key on the allowlist
 *      is NOT referenced as `fx.<key>` or `effects.<key>` in the
 *      policy consumer sites.
 */

const FORMULAS_PATH = join(__dirname, "..", "formulas.ts");
const FORMULAS_SRC = readFileSync(FORMULAS_PATH, "utf8");
const UTILITY_PRODUCTION_SRC = readFileSync(join(__dirname, "..", "utilityProduction.ts"), "utf8");
const CONSTRUCTION_SRC = readFileSync(join(__dirname, "..", "pendingConstruction.ts"), "utf8");
const CONSUMER_SRC = `${FORMULAS_SRC}\n${UTILITY_PRODUCTION_SRC}\n${CONSTRUCTION_SRC}`;

// All keys declared on PolicyEffect. Pinned here so a future
// declaration drift fails the union-shape test below loudly.
const DECLARED_POLICY_EFFECT_KEYS = [
  "crime",
  "unrest",
  "happiness",
  "lawOrder",
  "corruption",
  "employment",
  "infrastructureHealth",
  "defenseRating",
  "populationGrowthRate",
  "taxIncome",
  "tradeIncome",
  "foodProduction",
  "waterProduction",
  "powerGeneration",
  "steelProduction",
  "goodsProduction",
  "fuelProduction",
  "medProduction",
  "researchSpeed",
  "constructionSpeed",
] as const;

const WIRED_POLICY_EFFECT_KEYS = new Set<string>([
  // production block (formulas.ts:452)
  "taxIncome",
  "tradeIncome",
  "foodProduction",
  "waterProduction",
  "powerGeneration",
  "steelProduction",
  "goodsProduction",
  "fuelProduction",
  "medProduction",
  // growth (formulas.ts:1115)
  "populationGrowthRate",
  // research (formulas.ts:1672)
  "researchSpeed",
  // citystat (formulas.ts:2270)
  "crime",
  "unrest",
  "happiness",
  "lawOrder",
  "corruption",
  "employment",
  "infrastructureHealth",
  "defenseRating",
  // construction order timing (pendingConstruction.ts)
  "constructionSpeed",
]);

const ALLOWLISTED_SILENT_POLICY_EFFECT_KEYS = new Set<string>();

describe("PolicyEffect consumer drift guard", () => {
  it("declared key set matches the pinned union shape (20 keys, no drift)", () => {
    // Pull the actual key set off a sample to keep the test light;
    // PolicyEffect is a Partial so we sniff via the declared list
    // matching what every consumer assumes.
    const sample: Required<PolicyEffect> = {
      crime: 0,
      unrest: 0,
      happiness: 0,
      lawOrder: 0,
      corruption: 0,
      employment: 0,
      infrastructureHealth: 0,
      defenseRating: 0,
      populationGrowthRate: 0,
      taxIncome: 0,
      tradeIncome: 0,
      foodProduction: 0,
      waterProduction: 0,
      powerGeneration: 0,
      steelProduction: 0,
      goodsProduction: 0,
      fuelProduction: 0,
      medProduction: 0,
      researchSpeed: 0,
      constructionSpeed: 0,
    };
    const actual = Object.keys(sample).sort();
    const expected = [...DECLARED_POLICY_EFFECT_KEYS].sort();
    expect(actual).toEqual(expected);
  });

  it("wired ∪ allowlisted == declared (no key falls through the cracks)", () => {
    const covered = new Set([
      ...WIRED_POLICY_EFFECT_KEYS,
      ...ALLOWLISTED_SILENT_POLICY_EFFECT_KEYS,
    ]);
    const missing = DECLARED_POLICY_EFFECT_KEYS.filter((k) => !covered.has(k));
    const extras = [...covered].filter(
      (k) => !DECLARED_POLICY_EFFECT_KEYS.includes(k as (typeof DECLARED_POLICY_EFFECT_KEYS)[number]),
    );
    expect(
      missing,
      `PolicyEffect key(s) declared but not classified as wired or silent: ${missing.join(", ")}. ` +
        `Add to WIRED_POLICY_EFFECT_KEYS (with the formulas.ts site that reads it) or to the ` +
        `ALLOWLISTED_SILENT_POLICY_EFFECT_KEYS set with a comment.`,
    ).toEqual([]);
    expect(
      extras,
      `Wired/silent set references key(s) not on PolicyEffect: ${extras.join(", ")}. ` +
        `Either the type was trimmed or the test sets are stale.`,
    ).toEqual([]);
  });

  it("staleness sibling: every wired key is referenced in formulas.ts; every silent key is not", () => {
    for (const key of WIRED_POLICY_EFFECT_KEYS) {
      // Look across tick formulas and order-time construction consumers.
      const pattern = new RegExp(`\\b(?:fx|effects)\\.${key}\\b`);
      expect(
        pattern.test(CONSUMER_SRC),
        `WIRED_POLICY_EFFECT_KEYS lists '${key}' but no fx.${key} or effects.${key} access ` +
          `appears in formulas.ts. Either the consumer site was deleted (move to allowlist) ` +
          `or the access pattern changed.`,
      ).toBe(true);
    }
    for (const key of ALLOWLISTED_SILENT_POLICY_EFFECT_KEYS) {
      // For silent keys, ensure formulas.ts does NOT consume them in
      // a policy consumer pattern. Note: this is a coarse check —
      // tech consumers may still read the same key under a different
      // accessor. We grep for the policy-flavored access patterns.
      const pattern = new RegExp(`\\bpd\\.effects\\.${key}\\b|\\bfx\\.${key}\\b`);
      expect(
        pattern.test(FORMULAS_SRC),
        `ALLOWLISTED_SILENT_POLICY_EFFECT_KEYS lists '${key}' as silent but formulas.ts ` +
          `appears to consume it via a policy accessor. Promote to WIRED_POLICY_EFFECT_KEYS.`,
      ).toBe(false);
    }
  });

  it("silent-drop budget is empty", () => {
    // Count entries across ALL_POLICIES that touch any allowlisted
    // silent key. Pinned so growth without wiring trips the guard.
    let silentSetterCount = 0;
    const offenders: { policyId: string; key: string; value: number }[] = [];
    for (const policy of ALL_POLICIES) {
      for (const key of ALLOWLISTED_SILENT_POLICY_EFFECT_KEYS) {
        const v = (policy.effects as Record<string, number | undefined>)[key];
        if (v !== undefined && v !== 0) {
          silentSetterCount += 1;
          offenders.push({ policyId: policy.id, key, value: v });
        }
      }
    }
    expect(
      silentSetterCount,
      `Silent-setter budget changed. Currently allowlisted offenders:\n` +
        offenders.map((o) => `  ${o.policyId}: ${o.key}=${o.value}`).join("\n") +
        `\nIf a new policy was added that sets a silent key, either wire the consumer in ` +
        `formulas.ts or accept the drift by bumping this number.`,
    ).toBe(0);
  });
});

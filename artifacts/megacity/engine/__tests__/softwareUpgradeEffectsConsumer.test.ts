import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { SOFTWARE_UPGRADES } from "@/engine/softwareUpgrades";

/**
 * Software upgrade effect consumer drift guard (sibling of
 * techEffectsConsumer.test.ts).
 *
 * `SoftwareUpgradeDef.tiers[].effects` declares 15 possible keys, but the
 * tick in engine/formulas.ts and its research-breakdown leaf (the consumers
 * that apply installed software upgrades to gameplay) read only the keys they
 * access via `swEffects.X`. Before the Steam report fix, NOTHING consumed
 * getTotalEffects — every installed upgrade was a complete no-op. This
 * guard makes sure that class of bug can never silently return:
 *
 *   1. Parses the consumed-key set from the tick formula and its research
 *      breakdown leaf.
 *   2. Walks SOFTWARE_UPGRADES tier literals to collect every effect key
 *      actually used in content.
 *   3. Computes used \ consumed → the silent-drop set.
 *   4. Allowlists the current debt (per tier-literal count). Any NEW
 *      unconsumed-key usage fails the test.
 *   5. Staleness sibling: once a key gets wired into formulas.ts, the
 *      allowlist entry must be dropped.
 */

const ENGINE_DIR = path.resolve(__dirname, "..");

const formulasSrc = fs.readFileSync(path.join(ENGINE_DIR, "formulas.ts"), "utf8");
const researchBreakdownSrc = fs.readFileSync(path.join(ENGINE_DIR, "researchBreakdown.ts"), "utf8");

/** Keys actually consumed by the tick via `swEffects.X` or the shared
 * research breakdown's `softwareEffects.X` reads. */
const CONSUMED_KEYS: Set<string> = (() => {
  const consumed = new Set<string>();
  const re = /(?:swEffects|softwareEffects)\.(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(`${formulasSrc}\n${researchBreakdownSrc}`))) consumed.add(m[1]!);
  return consumed;
})();

/** Per-key count of tier literals declaring an effect on that key. */
const USAGE_BY_KEY: Record<string, number> = (() => {
  const usage: Record<string, number> = {};
  for (const def of SOFTWARE_UPGRADES) {
    for (const tier of def.tiers) {
      for (const key of Object.keys(tier.effects)) {
        usage[key] = (usage[key] ?? 0) + 1;
      }
    }
  }
  return usage;
})();

/**
 * Documented content debt: software upgrade effect keys USED in tier
 * literals but NOT consumed by the tick. Each entry maps key -> current
 * tier-literal count. New growth or new keys both fail the test.
 */
const SILENT_DROP_ALLOWLIST: Record<string, number> = {
  // `intelligence` has no sane per-tick consumer today: the intelligence
  // system's securityLevel/counterIntelRating evolve through operations in
  // tickProcessors.ts, and a flat per-tick addition would pin those 0..100
  // stats instantly. Surveillance/defense upgrades still deliver their
  // OTHER keys (lawOrder, crime, defenseRating...). Drain this entry once
  // the intelligence system grows a passive-bonus input.
  intelligence: 13,
};

describe("software upgrade effect keys -> formulas.ts consumer", () => {
  it("formulas.ts consumes the expected software upgrade key set", () => {
    // Sanity check on the parsed consumer set so a future formula refactor
    // can't silently zero this audit out (the original bug: zero consumers).
    const expected = new Set([
      // flat income
      "taxIncome",
      // percent-scaled efficiency keys
      "tradeEfficiency", "powerEfficiency", "waterEfficiency",
      // per-tick stat contributions (TECH_STAT_DIVISOR block)
      "crime", "unrest", "happiness", "lawOrder", "corruption",
      "employment", "infrastructureHealth", "defenseRating", "publicHealth",
      // research percent bonus
      "researchSpeed",
    ]);
    expect([...CONSUMED_KEYS].sort()).toEqual([...expected].sort());
  });

  it("no NEW silent-drop software upgrade effect keys appear", () => {
    const unexpectedKeys: string[] = [];
    for (const key of Object.keys(USAGE_BY_KEY)) {
      if (CONSUMED_KEYS.has(key)) continue;
      if (!(key in SILENT_DROP_ALLOWLIST)) unexpectedKeys.push(key);
    }
    expect(
      unexpectedKeys,
      "New software upgrade effect key used in a tier literal but not consumed by formulas.ts — wire it up or add it to SILENT_DROP_ALLOWLIST as documented debt",
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
      "More software upgrade tiers now declare an unconsumed effect key — every increment is gameplay-invisible content",
    ).toEqual([]);
  });

  it("staleness sibling: every allowlisted key is still unconsumed and still in use", () => {
    const stale: string[] = [];
    for (const key of Object.keys(SILENT_DROP_ALLOWLIST)) {
      if (CONSUMED_KEYS.has(key)) {
        stale.push(`${key} is now consumed by formulas.ts — drop from allowlist`);
      }
      if ((USAGE_BY_KEY[key] ?? 0) === 0) {
        stale.push(`${key} no longer appears in any tier literal — drop from allowlist`);
      }
    }
    expect(stale).toEqual([]);
  });
});

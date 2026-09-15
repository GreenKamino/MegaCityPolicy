/* eslint-disable no-console */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ARRAY_CAPS } from "@/engine/sanitizer";

/**
 * Drift guard: ARRAY_CAPS surface vs sanitizer.ts consumers.
 *
 * Source-of-truth audit pattern. Three buckets:
 *
 *   1. APPLIED — cap key is referenced inside sanitizer.ts itself
 *      (the canonical save-load chokepoint). These collections are
 *      bounded across save / load cycles.
 *   2. INLINE_CAPPED_ELSEWHERE — cap key is defined in ARRAY_CAPS
 *      but the cap is enforced via a hardcoded slice() outside
 *      sanitizer.ts, NOT by sanitizer. The cap value is duplicated
 *      between ARRAY_CAPS and the inline literal — drift risk.
 *   3. UNAPPLIED — cap key is defined in ARRAY_CAPS but no
 *      consumer exists anywhere. The collection grows unbounded
 *      across save/load cycles — real bug surface.
 *
 * Staleness sibling prunes any allowlist entry whose key has been
 * removed from ARRAY_CAPS or whose situation has changed.
 */

const SANITIZER_PATH = "engine/sanitizer.ts";

interface NotedKey {
  key: keyof typeof ARRAY_CAPS;
  note: string;
}

// Caps defined in ARRAY_CAPS but enforced only inline elsewhere via
// a hardcoded slice() with the same numeric literal. The value is
// duplicated: changing ARRAY_CAPS does NOT change the actual cap.
const INLINE_CAPPED_ELSEWHERE: readonly NotedKey[] = [];

// Caps defined in ARRAY_CAPS but never enforced anywhere. The
// collection grows without bound across save/load cycles — real
// memory regression surface. Currently empty (Task #494 wired the
// last unapplied cap, discoveredLocationIds, into sanitizer.ts):
// every defined cap is either applied by sanitizer.ts or tracked in
// INLINE_CAPPED_ELSEWHERE. Keep it that way — new ARRAY_CAPS entries
// must ship with their sanitizer application in the same change.
const UNAPPLIED_CAPS: readonly NotedKey[] = [];

function appliedKeysInSanitizer(): Set<string> {
  // Conservative scan: every `ARRAY_CAPS.<key>` reference inside
  // sanitizer.ts. Excludes the definition site itself.
  const src = readFileSync(SANITIZER_PATH, "utf8");
  // Drop the export-const block so the definitions don't count as
  // applications. Match starts with `export const ARRAY_CAPS = {`
  // and ends with `} as const;`.
  const defStart = src.indexOf("export const ARRAY_CAPS");
  const defEnd = src.indexOf("} as const;", defStart);
  if (defStart < 0 || defEnd < 0)
    throw new Error("ARRAY_CAPS definition block not found in sanitizer.ts");
  const trimmed = src.slice(0, defStart) + src.slice(defEnd);
  const keys = new Set<string>();
  for (const m of trimmed.matchAll(/\bARRAY_CAPS\.(\w+)\b/g)) keys.add(m[1]);
  return keys;
}

describe("sanitizer ARRAY_CAPS coverage (drift guard)", () => {
  const definedKeys = new Set(Object.keys(ARRAY_CAPS) as (keyof typeof ARRAY_CAPS)[]);
  const appliedKeys = appliedKeysInSanitizer();
  const inlineCapped = new Set(INLINE_CAPPED_ELSEWHERE.map((e) => e.key));
  const unapplied = new Set(UNAPPLIED_CAPS.map((e) => e.key));

  it("ARRAY_CAPS surface budget is exactly 50 entries", () => {
    // Task #480 added newsFeed (applied by sanitizer.ts, both the truthy
    // fast-path slice and the capArray pass).
    // Task #500 added pendingConstructions (applied by sanitizer.ts via
    // the guarded capArray pass).
    // Durable black-market purchase auditing added blackMarketHistory
    // (applied by sanitizeBlackMarketHistory).
    // Prerequisite save hardening added unlockedTechnologies and researchQueue.
    // Mission-mail dismissal tombstones are bounded by the sanitizer too.
    // District command history is capped by sanitizeDistrictCommandHistory.
    expect(definedKeys.size).toBe(50);
  });

  it("every ARRAY_CAPS value is a positive integer", () => {
    const bad: { key: string; value: unknown }[] = [];
    for (const [k, v] of Object.entries(ARRAY_CAPS)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) {
        bad.push({ key: k, value: v });
      }
    }
    if (bad.length > 0) console.error("[caps] non-positive-integer entries:", bad);
    expect(bad).toEqual([]);
  });

  it("APPLIED ∪ INLINE_CAPPED_ELSEWHERE ∪ UNAPPLIED partitions ARRAY_CAPS exactly", () => {
    // No overlaps between the three buckets.
    const overlapInlineApplied = [...inlineCapped].filter((k) => appliedKeys.has(k));
    const overlapUnappliedApplied = [...unapplied].filter((k) => appliedKeys.has(k));
    const overlapInlineUnapplied = [...inlineCapped].filter((k) => unapplied.has(k));
    expect(overlapInlineApplied).toEqual([]);
    expect(overlapUnappliedApplied).toEqual([]);
    expect(overlapInlineUnapplied).toEqual([]);

    // Union covers every defined key with no extras.
    const union = new Set<string>([...appliedKeys, ...inlineCapped, ...unapplied]);
    const missing = [...definedKeys].filter((k) => !union.has(k)).sort();
    const extra = [...union].filter((k) => !(definedKeys as Set<string>).has(k)).sort();
    if (missing.length > 0)
      console.error("[caps] ARRAY_CAPS keys not classified by any bucket:", missing);
    if (extra.length > 0)
      console.error("[caps] allowlist references non-existent ARRAY_CAPS keys:", extra);
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("INLINE_CAPPED_ELSEWHERE staleness — entries must still be defined and unapplied by sanitizer", () => {
    const stale: string[] = [];
    for (const e of INLINE_CAPPED_ELSEWHERE) {
      if (!definedKeys.has(e.key)) {
        stale.push(`${e.key}: removed from ARRAY_CAPS — drop allowlist entry.`);
      } else if (appliedKeys.has(e.key)) {
        stale.push(`${e.key}: now applied by sanitizer.ts — drop allowlist entry.`);
      }
    }
    if (stale.length > 0) console.error("[caps] stale INLINE_CAPPED_ELSEWHERE entries:", stale);
    expect(stale).toEqual([]);
  });

  it("UNAPPLIED_CAPS staleness — entries must still be defined and not applied anywhere in sanitizer", () => {
    const stale: string[] = [];
    for (const e of UNAPPLIED_CAPS) {
      if (!definedKeys.has(e.key)) {
        stale.push(`${e.key}: removed from ARRAY_CAPS — drop allowlist entry.`);
      } else if (appliedKeys.has(e.key)) {
        stale.push(`${e.key}: now applied by sanitizer.ts — drop allowlist entry.`);
      }
    }
    if (stale.length > 0) console.error("[caps] stale UNAPPLIED_CAPS entries:", stale);
    expect(stale).toEqual([]);
  });
});

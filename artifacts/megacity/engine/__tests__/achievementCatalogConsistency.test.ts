/* eslint-disable no-console */
import { describe, expect, it } from "vitest";
import {
  ALL_BASE_ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORY_LABELS,
  toSteamApiName,
} from "@/engine/achievements";

/**
 * Drift guard: cross-source-of-truth consistency for the achievement
 * catalog.
 *
 * Two adjacent sources of truth in engine/achievements.ts:
 *
 *   1. Each achievement entry hardcodes its `steamApiName` literal.
 *   2. The helper `toSteamApiName(id)` derives a canonical form:
 *        "ACH_" + id.toUpperCase().replace(/-/g, "_")
 *
 * If the helper is ever called at runtime (e.g. for an entry that
 * was defined later without a hardcoded steamApiName, or for a
 * Steam-side lookup), it MUST agree with the hardcoded value, or
 * Steam unlocks will fire under one name while save state expects
 * another. This test guarantees the two stay in lockstep.
 *
 * Also pinned: every entry's `category` resolves in
 * ACHIEVEMENT_CATEGORY_LABELS. The types enforce this at compile
 * time today, but a runtime check costs nothing and catches the
 * case where the labels map is loosened or split off later.
 */

describe("achievement catalog cross-source consistency (drift guard)", () => {
  const cat = ALL_BASE_ACHIEVEMENTS;

  it("every entry's hardcoded steamApiName matches toSteamApiName(id)", () => {
    const mismatches: { id: string; hardcoded: string; derived: string }[] = [];
    for (const a of cat) {
      const derived = toSteamApiName(a.id);
      if (a.steamApiName !== derived) {
        mismatches.push({
          id: a.id,
          hardcoded: a.steamApiName,
          derived,
        });
      }
    }
    if (mismatches.length > 0) {
      console.error(
        "[ach] hardcoded steamApiName differs from toSteamApiName(id):",
        mismatches,
      );
    }
    expect(mismatches).toEqual([]);
  });

  it("every entry's category resolves in ACHIEVEMENT_CATEGORY_LABELS", () => {
    const labelKeys = new Set(Object.keys(ACHIEVEMENT_CATEGORY_LABELS));
    const orphans = cat
      .filter((a) => !labelKeys.has(a.category))
      .map((a) => `${a.id} → ${a.category}`);
    if (orphans.length > 0) {
      console.error(
        "[ach] entries with category missing from ACHIEVEMENT_CATEGORY_LABELS:",
        orphans,
      );
    }
    expect(orphans).toEqual([]);
  });

  it("every category in ACHIEVEMENT_CATEGORY_LABELS has at least one entry", () => {
    // Defensive: an unused category in the labels map probably means
    // a recent rename that left orphaned label text behind.
    const used = new Set(cat.map((a) => a.category));
    const unused = Object.keys(ACHIEVEMENT_CATEGORY_LABELS).filter(
      (k) => !used.has(k as keyof typeof ACHIEVEMENT_CATEGORY_LABELS),
    );
    if (unused.length > 0) {
      console.error(
        "[ach] ACHIEVEMENT_CATEGORY_LABELS keys with no achievement entry:",
        unused,
      );
    }
    expect(unused).toEqual([]);
  });

  it("every category label is non-empty", () => {
    const blanks = Object.entries(ACHIEVEMENT_CATEGORY_LABELS)
      .filter(([, v]) => !v || v.trim() === "")
      .map(([k]) => k);
    if (blanks.length > 0)
      console.error("[ach] empty category labels:", blanks);
    expect(blanks).toEqual([]);
  });
});

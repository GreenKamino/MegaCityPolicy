import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_BASE_ACHIEVEMENTS as ACHIEVEMENTS } from "@/engine/achievements";

/**
 * Drift guard: achievement icon coverage vs the Feather glyphmap.
 *
 * Findings (2026-05-05 audit):
 *
 *   The achievements UI (app/(game)/achievements.tsx:143) renders
 *   each entry's icon via:
 *
 *     <Feather name={ach.icon as any} size={16} ... />
 *
 *   The `as any` cast bypasses the Feather IconName union, so any
 *   icon string that is not in the Feather glyphmap renders as a
 *   blank box at runtime — silent UI breakage.
 *
 *   ACHIEVEMENTS uses 91 unique icon names across ~1700 entries.
 *   88 of 91 resolve in @expo/vector-icons Feather. THREE do not:
 *
 *     - "flame"           — engine/achievements.ts:1360
 *         "ARSONIST" (crime, arson >= 300). Best-fit Feather
 *         alternative: "zap" or switch the renderer to
 *         MaterialCommunityIcons "fire".
 *
 *     - "clipboard-check" — engine/achievements.ts:2025
 *         "BLUEPRINTS APPROVED" (milestones, first mega-project
 *         planning started). Best-fit Feather alternative:
 *         "check-square".
 *
 *     - "trophy"          — engine/achievements.ts:2033
 *         "MONUMENT TO AMBITION" (construction, first mega-project
 *         completed). Best-fit Feather alternative: "award" (already
 *         used elsewhere in the catalog).
 *
 *   These three render as blank icons in the achievements list.
 *   Pinned here as known UI debt; a separate gameplay-content task
 *   should pick a fix per entry.
 *
 * Test guards:
 *   1. Catalog has at least one icon-bearing entry (sanity).
 *   2. Every non-allowlisted icon resolves in the Feather glyphmap.
 *      A new icon string that doesn't resolve fails immediately.
 *   3. Allowlist staleness: every BROKEN_ICON_ALLOWLIST entry must
 *      still be both (a) absent from Feather and (b) used by at
 *      least one achievement. Fires when a broken icon is fixed (so
 *      the allowlist gets pruned) or when an entry stops using it
 *      (so we re-check whether it's still a problem).
 */

const FEATHER_GLYPHMAP_PATH = join(
  __dirname,
  "..",
  "..",
  "node_modules",
  "@expo",
  "vector-icons",
  "build",
  "vendor",
  "react-native-vector-icons",
  "glyphmaps",
  "Feather.json",
);

const FEATHER_GLYPHS: Set<string> = new Set(
  Object.keys(JSON.parse(readFileSync(FEATHER_GLYPHMAP_PATH, "utf8"))),
);

// Icons used by ACHIEVEMENTS that do not resolve in the Feather
// glyphmap and therefore render as blank in the achievements list.
// Each entry should be revisited as a content fix (pick a real
// Feather glyph or migrate that row to MaterialCommunityIcons).
const BROKEN_ICON_ALLOWLIST = new Set<string>([
  "flame",
  "clipboard-check",
  "trophy",
]);

describe("achievement icon coverage drift guard", () => {
  it("Feather glyphmap loaded and ACHIEVEMENTS catalog non-empty", () => {
    expect(FEATHER_GLYPHS.size).toBeGreaterThan(200);
    expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
  });

  it("every non-allowlisted icon resolves in the Feather glyphmap", () => {
    const offenders: { id: string; icon: string }[] = [];
    for (const ach of ACHIEVEMENTS) {
      const icon = (ach as { icon?: string }).icon;
      if (!icon) continue;
      if (BROKEN_ICON_ALLOWLIST.has(icon)) continue;
      if (!FEATHER_GLYPHS.has(icon)) {
        offenders.push({ id: ach.id, icon });
      }
    }
    expect(
      offenders,
      `Achievement(s) reference icon strings not in @expo/vector-icons Feather glyphmap. ` +
        `These render as blank icons in the achievements UI:\n` +
        offenders.map((o) => `  ${o.id}: "${o.icon}"`).join("\n") +
        `\nEither pick a valid Feather glyph or migrate the renderer for these entries.`,
    ).toEqual([]);
  });

  it("BROKEN_ICON_ALLOWLIST staleness: each entry must still be (a) absent from Feather and (b) used by at least one achievement", () => {
    const fixedInFeather: string[] = [];
    const unused: string[] = [];
    const usedIcons = new Set(
      ACHIEVEMENTS.map((a) => (a as { icon?: string }).icon).filter(
        (i): i is string => Boolean(i),
      ),
    );
    for (const icon of BROKEN_ICON_ALLOWLIST) {
      if (FEATHER_GLYPHS.has(icon)) fixedInFeather.push(icon);
      if (!usedIcons.has(icon)) unused.push(icon);
    }
    expect(
      fixedInFeather,
      `BROKEN_ICON_ALLOWLIST contains icon(s) that NOW resolve in Feather. ` +
        `Remove them from the allowlist: ${fixedInFeather.join(", ")}`,
    ).toEqual([]);
    expect(
      unused,
      `BROKEN_ICON_ALLOWLIST contains icon(s) no longer used by any achievement. ` +
        `Either remove from the allowlist or restore the achievement entry: ${unused.join(", ")}`,
    ).toEqual([]);
  });

  it("broken-icon budget pinned: exactly 3 distinct broken icons across the catalog", () => {
    // Sniff the catalog directly so the count cannot drift through
    // allowlist edits alone.
    const distinctBroken = new Set<string>();
    for (const ach of ACHIEVEMENTS) {
      const icon = (ach as { icon?: string }).icon;
      if (icon && !FEATHER_GLYPHS.has(icon)) distinctBroken.add(icon);
    }
    expect(
      distinctBroken.size,
      `Distinct-broken-icon count drifted. Current set: ${[...distinctBroken].sort().join(", ")}. ` +
        `Each is rendering as blank in the achievements UI.`,
    ).toBe(3);
  });
});

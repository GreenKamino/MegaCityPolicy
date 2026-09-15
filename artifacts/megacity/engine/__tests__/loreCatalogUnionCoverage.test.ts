import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LORE_ENTRIES,
  LORE_RARITY_WEIGHTS,
  LORE_ZONE_WEIGHTS,
} from "@/engine/loreData";

/**
 * Drift guard: lore catalog union coverage.
 *
 * engine/loreData.ts owns three closed string unions consumed by
 * the in-game LORE archive screen and by scavenge rolls:
 *
 *   LoreCategory   8 members → CATEGORY_LABELS / CATEGORY_ICONS in
 *                              app/(game)/lore.tsx are typed
 *                              Record<LoreCategory,...> (tsc covered)
 *   LoreItemType  14 members → ITEM_TYPE_ICONS in
 *                              app/(game)/lore.tsx is typed
 *                              Record<string,string> (NOT tsc covered)
 *   LoreRarity     4 members → LORE_RARITY_WEIGHTS Record (tsc),
 *                              RARITY_COLORS Record (tsc)
 *
 * The 41-entry LORE_ENTRIES catalog itself is a plain array, so
 * none of its category / itemType / rarity literals participate
 * in any Record check — adding a union member without a single
 * lore entry that uses it (or shipping an entry whose literal
 * exists nowhere in the union) drifts silently. Because the
 * archive screen filters by category and the scavenge roller
 * weights by rarity, an unused union member is unreachable
 * content; an orphan literal is content that never renders.
 *
 * The ITEM_TYPE_ICONS map is the third drift surface: typed
 * Record<string,string>, so missing keys go uncaught by tsc.
 *
 * All sides parsed live from source. No mock can satisfy both
 * sides of any check.
 */

const LORE_DATA_SRC = readFileSync(
  join(__dirname, "..", "loreData.ts"),
  "utf8",
);
const LORE_SCREEN_SRC = readFileSync(
  join(__dirname, "..", "..", "app", "(game)", "lore.tsx"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const LORE_CATEGORIES = parseUnion(LORE_DATA_SRC, "LoreCategory");
const LORE_ITEM_TYPES = parseUnion(LORE_DATA_SRC, "LoreItemType");
const LORE_RARITIES = parseUnion(LORE_DATA_SRC, "LoreRarity");

describe("lore catalog union coverage drift guard", () => {
  it("each lore union has the expected member count (budget pin)", () => {
    expect(LORE_CATEGORIES.length).toBe(8);
    expect(LORE_ITEM_TYPES.length).toBe(14);
    expect(LORE_RARITIES.length).toBe(4);
  });

  it("LORE_ENTRIES catalog count is pinned (budget)", () => {
    expect(LORE_ENTRIES.length).toBe(41);
  });

  it("every LoreCategory union member is used by ≥1 LORE_ENTRIES entry", () => {
    const used = new Set(LORE_ENTRIES.map((e) => e.category));
    const missing = LORE_CATEGORIES.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    // Orphan check: every category literal in LORE_ENTRIES is in the union.
    const unionSet = new Set(LORE_CATEGORIES);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("every LoreItemType union member is used by ≥1 LORE_ENTRIES entry, except documented unused", () => {
    // Documented allowlist: LoreItemType members that exist in
    // the union but are not represented by any LORE_ENTRIES seed.
    // The icon map (ITEM_TYPE_ICONS) and the union still need
    // to handle them — discoveries with these item types could
    // be added later without a code change. Tracked here so a
    // future cleanup either adds an entry or removes the union
    // member deliberately.
    const KNOWN_UNUSED_BY_ENTRIES: readonly string[] = [
      // No founding archive entry uses photograph yet — wasteland
      // photograph drops are referenced by icon and reserved for
      // future seeding.
      "photograph",
    ];

    // Staleness sibling: every allowlist entry must still be in
    // the union — otherwise the comment is stale.
    const unionSet = new Set(LORE_ITEM_TYPES);
    const stale = KNOWN_UNUSED_BY_ENTRIES.filter((t) => !unionSet.has(t));
    expect(stale, "allowlist refers to removed union members").toEqual([]);

    const used = new Set(LORE_ENTRIES.map((e) => e.itemType));
    const allowed = new Set(KNOWN_UNUSED_BY_ENTRIES);
    const missing = LORE_ITEM_TYPES.filter(
      (t) => !used.has(t as never) && !allowed.has(t),
    );
    expect(missing).toEqual([]);
    const orphans = [...used].filter((t) => !unionSet.has(t));
    expect(orphans).toEqual([]);
  });

  it("every LoreRarity union member is used by ≥1 LORE_ENTRIES entry", () => {
    const used = new Set(LORE_ENTRIES.map((e) => e.rarity));
    const missing = LORE_RARITIES.filter((r) => !used.has(r as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(LORE_RARITIES);
    const orphans = [...used].filter((r) => !unionSet.has(r));
    expect(orphans).toEqual([]);
  });

  it("LORE_RARITY_WEIGHTS keys equal the LoreRarity union exactly with positive weights", () => {
    const keys = Object.keys(LORE_RARITY_WEIGHTS);
    expect(keys.sort()).toEqual([...LORE_RARITIES].sort());
    for (const k of LORE_RARITIES) {
      const w = LORE_RARITY_WEIGHTS[k as keyof typeof LORE_RARITY_WEIGHTS];
      expect(w).toBeGreaterThan(0);
    }
  });

  it("LORE_ZONE_WEIGHTS keys are non-empty and all weights are positive", () => {
    const keys = Object.keys(LORE_ZONE_WEIGHTS);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      const w = LORE_ZONE_WEIGHTS[k as keyof typeof LORE_ZONE_WEIGHTS];
      expect(w).toBeGreaterThan(0);
    }
  });

  it("ITEM_TYPE_ICONS in lore screen covers LoreItemType exactly (string-typed Record drift surface)", () => {
    // ITEM_TYPE_ICONS is declared Record<string,string>, so tsc
    // does NOT enforce coverage. Parse it and check both sides.
    const m = LORE_SCREEN_SRC.match(
      /const ITEM_TYPE_ICONS:[^=]*=\s*\{([\s\S]*?)\};/,
    );
    expect(m, "ITEM_TYPE_ICONS not found in lore.tsx").not.toBeNull();
    const body = m![1];
    const keys: string[] = [];
    for (const km of body.matchAll(/(?:^|,|\{)\s*"?([a-zA-Z0-9_-]+)"?\s*:/g)) {
      keys.push(km[1]);
    }
    const unionSet = new Set(LORE_ITEM_TYPES);
    const missing = LORE_ITEM_TYPES.filter((t) => !keys.includes(t));
    const orphans = keys.filter((k) => !unionSet.has(k));
    expect(missing, "ITEM_TYPE_ICONS missing union members").toEqual([]);
    expect(orphans, "ITEM_TYPE_ICONS contains keys not in union").toEqual(
      [],
    );
    // Non-empty icon strings.
    for (const km of body.matchAll(
      /"?([a-zA-Z0-9_-]+)"?\s*:\s*"([^"]*)"/g,
    )) {
      expect(km[2].length, `icon for ${km[1]} is empty`).toBeGreaterThan(0);
    }
  });
});

/* eslint-disable no-console */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join as pjoin } from "node:path";

/**
 * Drift guard: icon string literals across the app/ UI tree.
 *
 * Background (companion to achievementIcons.test.ts):
 *
 * The app renders icons through two glyph fonts — Feather and
 * MaterialCommunityIcons (MCI) — typically via:
 *
 *   <Feather name={x.icon as any} ... />
 *   <MaterialCommunityIcons name={x.icon as any} ... />
 *
 * The `as any` cast bypasses the IconName union, so any icon string
 * not in the renderer's glyphmap silently renders as a blank box.
 *
 * This guard sweeps every `icon: "X"` string literal in app/*.tsx
 * (the dominant shape — tab arrays, CATEGORY_ICONS-style maps,
 * action lists). Each literal must resolve in AT LEAST ONE of the
 * two candidate glyphmaps (Feather or MCI). A literal missing from
 * both is broken regardless of which renderer it is wired to.
 *
 * What this CANNOT catch:
 *   - Cross-renderer mismatches (icon resolves in MCI but is rendered
 *     via <Feather>). That requires per-call-site renderer tracking
 *     which is out of scope here.
 *   - Computed/variable icon names (only literal `icon: "X"` shape).
 *   - Icons rendered via fonts other than Feather / MCI.
 *
 * BROKEN_ICON_ALLOWLIST documents the icons currently used in app/
 * UI that resolve in NEITHER glyphmap — they render as blank boxes
 * in production.
 */

const FEATHER_PATH =
  "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json";
const MCI_PATH =
  "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json";
const APP_DIR = "app";

interface BrokenIconEntry {
  /** The icon string used in app/*.tsx that resolves in neither font. */
  icon: string;
  /** Human-readable note: which UI rows use this icon and why it is broken. */
  note: string;
}

const BROKEN_ICON_ALLOWLIST: readonly BrokenIconEntry[] = [
  {
    icon: "cannon",
    note:
      "MILITARY tab 'ARTILLERY' (military.tsx:440) and DIPLOMACY action 'BOMBARDMENT' (diplomacy.tsx:136). Not in Feather or MCI — renders blank.",
  },
  {
    icon: "explosion",
    note:
      "DIPLOMACY action 'DECLARE WAR' (diplomacy.tsx:97). Not in Feather or MCI — renders blank.",
  },
  {
    icon: "scroll",
    note:
      "DIPLOMACY action 'NEGOTIATE CHARTER' (diplomacy.tsx:124). Not in Feather or MCI — renders blank.",
  },
];

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = pjoin(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsx(full, out);
    } else if (st.isFile() && name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function collectIconLiterals(): Set<string> {
  const files = walkTsx(APP_DIR);
  const literals = new Set<string>();
  const re = /icon:\s*"([a-z0-9-]+)"/g;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      literals.add(m[1]);
    }
  }
  return literals;
}

function loadGlyphmap(path: string): Set<string> {
  const json = JSON.parse(readFileSync(path, "utf8"));
  return new Set(Object.keys(json));
}

describe("app/ icon string literal coverage (drift guard)", () => {
  const featherGlyphs = loadGlyphmap(FEATHER_PATH);
  const mciGlyphs = loadGlyphmap(MCI_PATH);
  const literals = collectIconLiterals();
  const allowlistSet = new Set(BROKEN_ICON_ALLOWLIST.map((e) => e.icon));

  it("loaded both glyphmaps and a non-empty literal set", () => {
    expect(featherGlyphs.size).toBeGreaterThan(200);
    expect(mciGlyphs.size).toBeGreaterThan(2000);
    expect(literals.size).toBeGreaterThan(50);
  });

  it("every non-allowlisted icon literal resolves in Feather OR MCI", () => {
    const missing: string[] = [];
    for (const name of literals) {
      if (allowlistSet.has(name)) continue;
      if (!featherGlyphs.has(name) && !mciGlyphs.has(name)) {
        missing.push(name);
      }
    }
    if (missing.length > 0) {
      console.error(
        `[appIconLiterals] icon literals used in app/ that resolve in NEITHER Feather NOR MCI:\n  ${missing.sort().join("\n  ")}\n` +
          `Either fix the icon string, switch renderer fonts, or add a documented entry to BROKEN_ICON_ALLOWLIST.`,
      );
    }
    expect(missing).toEqual([]);
  });

  it("BROKEN_ICON_ALLOWLIST entries stay justified (staleness sibling)", () => {
    const stale: string[] = [];
    for (const entry of BROKEN_ICON_ALLOWLIST) {
      const stillMissing =
        !featherGlyphs.has(entry.icon) && !mciGlyphs.has(entry.icon);
      const stillUsed = literals.has(entry.icon);
      if (!stillMissing) {
        stale.push(
          `${entry.icon}: now resolves in Feather or MCI — remove from allowlist.`,
        );
      } else if (!stillUsed) {
        stale.push(
          `${entry.icon}: no longer referenced in app/*.tsx — remove from allowlist (or re-investigate if removal was unintentional).`,
        );
      }
    }
    if (stale.length > 0) {
      console.error(
        `[appIconLiterals] stale BROKEN_ICON_ALLOWLIST entries:\n  ${stale.join("\n  ")}`,
      );
    }
    expect(stale).toEqual([]);
  });

  it("count of broken icons in app/ stays pinned (budget)", () => {
    let liveBroken = 0;
    for (const name of literals) {
      if (!featherGlyphs.has(name) && !mciGlyphs.has(name)) liveBroken++;
    }
    // If this drops, prune BROKEN_ICON_ALLOWLIST and lower the budget.
    // If this rises, you introduced a new broken icon.
    expect(liveBroken).toBe(BROKEN_ICON_ALLOWLIST.length);
  });
});

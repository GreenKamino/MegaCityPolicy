/* eslint-disable no-console */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join as pjoin } from "node:path";
import { TUTORIAL_HINTS } from "@/engine/tutorialHints";

/**
 * Drift guard: tutorial hint catalog ↔ inline render parity.
 *
 * Background (engine/tutorialHints.ts top comment):
 *   "Each entry should mirror EXACTLY the message string passed to
 *    the matching <TutorialHint /> component. Keep the two in sync
 *    when adding new hints — the catalog is the single source of
 *    truth for the tips-reviewed UI; the inline render is what the
 *    player sees in context."
 *
 * Two adjacent sources of truth:
 *
 *   - engine/tutorialHints.ts TUTORIAL_HINTS array:
 *       feeds the "TIPS REVIEWED" master list in Settings.
 *   - <TutorialHint id="..."> renders in app/(game)/*.tsx:
 *       what the player actually sees in context.
 *
 * Drift modes this guard catches:
 *   1. Catalog entry with no matching inline render — appears in
 *      "Tips Reviewed" UI but the player never encountered it
 *      in-game. Silent dead entry.
 *   2. Inline render with no catalog entry — player sees the hint
 *      in-game but it's missing from the master list, so they
 *      cannot re-read it from Settings.
 *   3. Duplicate catalog id — second wins, first becomes a ghost
 *      entry referenced from nowhere.
 *   4. Duplicate render id (same id used in two places) — the
 *      hasSeenHint flag is shared, so dismissing one dismisses
 *      both. Usually unintentional.
 *   5. Catalog total drifts from a known-pinned count — caught
 *      independently so allowlist edits alone cannot mask drift.
 *
 * What this CANNOT catch (out of scope, too fragile to parse):
 *   - Message-string drift between the catalog `message:` field
 *     and the inline `<TutorialHint message={...} />` prop. The
 *     message bodies are multi-line template literals embedded in
 *     JSX; a robust extractor would warrant its own tooling.
 *     The catalog file's top comment documents this contract; this
 *     guard pins the IDs only.
 */

const APP_DIR = "app";
const PINNED_HINT_COUNT = 19;

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = pjoin(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsx(full, out);
    else if (st.isFile() && name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function collectRenderedHintIds(): { ids: string[]; perFile: Record<string, string[]> } {
  const ids: string[] = [];
  const perFile: Record<string, string[]> = {};
  // Match <TutorialHint ... id="X" ... /> across multi-line JSX.
  // We look for the literal `id="X"` within ~200 chars after the opening tag.
  const tagRe = /<TutorialHint\b[\s\S]{0,400}?id="([a-z][a-z0-9_-]*)"/g;
  for (const file of walkTsx(APP_DIR)) {
    const src = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    const inFile: string[] = [];
    while ((m = tagRe.exec(src)) !== null) {
      ids.push(m[1]);
      inFile.push(m[1]);
    }
    if (inFile.length > 0) perFile[file] = inFile;
  }
  return { ids, perFile };
}

describe("tutorial hint catalog ↔ inline render parity (drift guard)", () => {
  const catalogIds = TUTORIAL_HINTS.map((h) => h.id);
  const catalogSet = new Set(catalogIds);
  const { ids: renderedIds } = collectRenderedHintIds();
  const renderedSet = new Set(renderedIds);

  it("catalog and render sets are non-empty", () => {
    expect(catalogIds.length).toBeGreaterThan(0);
    expect(renderedIds.length).toBeGreaterThan(0);
  });

  it("catalog ids are unique", () => {
    const seen = new Map<string, number>();
    for (const id of catalogIds) seen.set(id, (seen.get(id) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(
      ([k, n]) => `${k} (×${n})`,
    );
    if (dupes.length > 0) console.error("[hints] duplicate catalog ids:", dupes);
    expect(dupes).toEqual([]);
  });

  it("rendered ids are unique across app/ (no shared dismiss-flag collisions)", () => {
    const seen = new Map<string, number>();
    for (const id of renderedIds) seen.set(id, (seen.get(id) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(
      ([k, n]) => `${k} (×${n})`,
    );
    if (dupes.length > 0)
      console.error("[hints] duplicate rendered ids:", dupes);
    expect(dupes).toEqual([]);
  });

  it("every catalog id has a matching inline render (no silent dead entries)", () => {
    const orphans = catalogIds.filter((id) => !renderedSet.has(id)).sort();
    if (orphans.length > 0)
      console.error(
        "[hints] catalog ids with no <TutorialHint id=…> render:",
        orphans,
      );
    expect(orphans).toEqual([]);
  });

  it("every inline render has a matching catalog entry (no missing tips-reviewed rows)", () => {
    const orphans = renderedIds.filter((id) => !catalogSet.has(id)).sort();
    if (orphans.length > 0)
      console.error(
        "[hints] rendered ids missing from TUTORIAL_HINTS catalog:",
        orphans,
      );
    expect(orphans).toEqual([]);
  });

  it("hint count is pinned at the agreed surface size", () => {
    // Independent of allowlists: sniffs both sources directly.
    // If you intentionally added or removed a hint, bump this number.
    expect(catalogIds.length).toBe(PINNED_HINT_COUNT);
    expect(new Set(renderedIds).size).toBe(PINNED_HINT_COUNT);
  });
});

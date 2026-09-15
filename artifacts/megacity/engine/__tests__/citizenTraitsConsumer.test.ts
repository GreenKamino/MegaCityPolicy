import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CITIZEN_TRAITS } from "@/engine/traits";

/**
 * Drift guard: CITIZEN_TRAITS is presently a flavor-only registry.
 *
 * Findings (2026-05-05 audit):
 *
 *   - engine/traits.ts exports a `TraitEffect` Partial with six numeric
 *     keys (productivity, crime, happiness, loyalty, unrest,
 *     corruption) and 50 CitizenTrait entries each carrying a populated
 *     `effects: TraitEffect` blob.
 *
 *   - NO production code imports CITIZEN_TRAITS. The only importer in
 *     the entire repo is engine/__tests__/characterBios.test.ts, which
 *     uses the catalog as a flavor-coverage reference target.
 *
 *   - The closest thing to a `trait.effects` consumer is
 *     engine/playerProgression.ts:299 `aggregateProgressionEffects`,
 *     but that reads from `getUnlockedTraits(state)` which returns
 *     `UnlockableTrait[]` — the player-progression registry, not
 *     CITIZEN_TRAITS.
 *
 *   - All `.traits` field reads in engine/* operate on either
 *     `officer.traits` (OfficerTrait union, gated by the
 *     officerTraitConsumer guard) or freeform `string[]` arrays on
 *     namedCharacters / profiles, which only flow into bio flavor
 *     text — never into citystat math.
 *
 * Net: every numeric value in every CITIZEN_TRAITS `effects` block is
 * silently dropped at runtime. The catalog functions as a flavor
 * dictionary for citizen-bio coverage and nothing more.
 *
 * This test pins that finding so we either:
 *   (a) wire a consumer and shrink the allowlist below, or
 *   (b) strip the `effects` field entirely and stop pretending.
 *
 * If a future change adds a real consumer, the
 * `citizenTraitsHasNoProductionConsumer` assertion will fail and force
 * an update here.
 */

const ENGINE_DIR = join(__dirname, "..");
const APP_DIR = join(__dirname, "..", "..", "app");

function walkTs(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (name === "__tests__" || name === "node_modules" || name === ".expo") continue;
      walkTs(full, out);
    } else if (stat.isFile() && (name.endsWith(".ts") || name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

const PRODUCTION_FILES = [...walkTs(ENGINE_DIR), ...walkTs(APP_DIR)];

describe("CITIZEN_TRAITS consumer drift guard", () => {
  it("has 50 catalog entries with unique ids and populated effects blobs", () => {
    expect(CITIZEN_TRAITS.length).toBe(50);
    const ids = CITIZEN_TRAITS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const trait of CITIZEN_TRAITS) {
      expect(trait.effects).toBeDefined();
      expect(Object.keys(trait.effects).length).toBeGreaterThan(0);
    }
  });

  it("citizenTraitsHasNoProductionConsumer: CITIZEN_TRAITS is imported by zero production files", () => {
    const importers: string[] = [];
    for (const file of PRODUCTION_FILES) {
      const src = readFileSync(file, "utf8");
      // Match either named or namespaced import of CITIZEN_TRAITS from
      // the traits module. Allowlist comments / doc references.
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
        if (/\bCITIZEN_TRAITS\b/.test(line) && /\bimport\b/.test(line)) {
          importers.push(`${relative(join(__dirname, "..", ".."), file)}:${i + 1}`);
        }
      }
    }
    expect(
      importers,
      `CITIZEN_TRAITS gained a production importer at:\n  ${importers.join("\n  ")}\n` +
        `If this consumer reads trait.effects for gameplay math, update or remove this drift guard. ` +
        `If it is purely flavor (bio text, UI label), document why and adjust the assertion.`,
    ).toEqual([]);
  });

  it("trait.effects keys are confined to the declared TraitEffect union (no typos)", () => {
    const allowed = new Set([
      "productivity",
      "crime",
      "happiness",
      "loyalty",
      "unrest",
      "corruption",
    ]);
    const seen = new Set<string>();
    for (const trait of CITIZEN_TRAITS) {
      for (const k of Object.keys(trait.effects)) {
        seen.add(k);
        expect(
          allowed.has(k),
          `CITIZEN_TRAITS '${trait.id}' uses unknown effect key '${k}'. ` +
            `Allowed keys: ${[...allowed].sort().join(", ")}.`,
        ).toBe(true);
      }
    }
    // Every declared key should be used somewhere — otherwise the
    // TraitEffect Partial has dead members of its own.
    const unused = [...allowed].filter((k) => !seen.has(k));
    expect(
      unused,
      `TraitEffect declares keys never used by any CITIZEN_TRAITS entry: ${unused.join(", ")}. ` +
        `Either populate them or trim the type.`,
    ).toEqual([]);
  });

  it("staleness sibling: total silent-drop budget is pinned (catalog x effect-keys)", () => {
    // If the catalog grows or effect blobs widen without a consumer
    // landing, the silent-drop count rises and this guard fires.
    let totalEffectEntries = 0;
    for (const trait of CITIZEN_TRAITS) {
      totalEffectEntries += Object.keys(trait.effects).length;
    }
    // 50 traits, current sum of per-trait effect-key counts. Frozen
    // here so that adding a new entry without wiring a consumer
    // requires bumping this number AND reading the comment above.
    expect(totalEffectEntries).toBe(111);
  });
});

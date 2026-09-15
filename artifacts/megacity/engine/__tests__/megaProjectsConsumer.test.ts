import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MEGA_PROJECTS } from "@/engine/megaProjects";

/**
 * Drift guard: MEGA_PROJECTS catalog vs three hardcoded consumer
 * surfaces.
 *
 * Findings (2026-05-05 audit):
 *
 *   The MEGA_PROJECTS catalog (engine/megaProjects.ts) declares 12
 *   project ids. Three separate consumer surfaces switch on those ids
 *   or substring-match the catalog text:
 *
 *   A. formulas.ts:471 — per-tick PRODUCTION rates for operational
 *      projects. 10 of 12 ids have a `case` arm. Two are missing by
 *      design:
 *        - orbital_defense: completion-only defense bonus, no per-tick
 *          production stream.
 *        - neural_collective: research-bonus only, applied via
 *          `mpOps.some(p.projectId === "neural_collective")` at
 *          formulas.ts:1699 — no production case needed.
 *
 *   B. megaProjects.ts:520 `applyProjectEffects` — one-shot completion
 *      stat bumps. All 12 ids have a `case` arm. Two are intentional
 *      no-ops (arcology, mega_factory) — their completion effects are
 *      production-rate bonuses applied via path A, not stat bumps.
 *
 *   C. tickProcessors.ts:1604 substring-matcher — duplicate completion
 *      logic that walks `def.completionEffects` and applies fixed
 *      bumps per matched substring:
 *        "happiness" → +15 happiness
 *        "trade"     → +50000 credits
 *        "population"→ +50000 population
 *        "food"      → +60 foodProduction
 *        "power"     → +200 powerGeneration
 *        "defense"   → +10 defenseRating
 *      Brittle: any new label that uses these substrings will silently
 *      trigger; any reword that drops them will silently lose its
 *      completion bonus.
 *
 *   Surface C also DUPLICATES the bonuses already applied by surface
 *   B for several projects (e.g. underground_rail's "+25 happiness"
 *   label adds +15 here AND +25 via the case branch). This audit pins
 *   the current label-coverage numbers so any future change loudly
 *   surfaces the duplication.
 */

const FORMULAS_PATH = join(__dirname, "..", "formulas.ts");
const UTILITY_PRODUCTION_PATH = join(__dirname, "..", "utilityProduction.ts");
const MEGA_PROJECTS_PATH = join(__dirname, "..", "megaProjects.ts");
const TICK_PROCESSORS_PATH = join(__dirname, "..", "tickProcessors.ts");

const FORMULAS_SRC = readFileSync(FORMULAS_PATH, "utf8");
const UTILITY_PRODUCTION_SRC = readFileSync(UTILITY_PRODUCTION_PATH, "utf8");
const MEGA_SRC = readFileSync(MEGA_PROJECTS_PATH, "utf8");
const TICK_SRC = readFileSync(TICK_PROCESSORS_PATH, "utf8");

const ALL_IDS = MEGA_PROJECTS.map((p) => p.id).sort();

const PRODUCTION_SWITCH_ALLOWLIST = new Set<string>([
  // Completion-only defense bump — no per-tick production stream.
  "orbital_defense",
  // Research bonus only, wired separately at formulas.ts:1699 via
  // `mpOps.some(p.projectId === "neural_collective")`.
  "neural_collective",
]);

const SUBSTRING_PATTERNS = [
  "happiness",
  "trade",
  "population",
  "food",
  "power",
  "defense",
] as const;

describe("MEGA_PROJECTS catalog consumer drift guard", () => {
  it("catalog has 12 unique ids (pinned)", () => {
    expect(ALL_IDS.length).toBe(12);
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
  });

  it("formulas.ts production switch (line 471 area) covers 10 of 12 ids; allowlist accounts for the rest", () => {
    // Find the production-rate switch on `p.projectId` and read each
    // case label. We anchor on `switch (p.projectId)` and consume up
    // to the closing brace of that switch.
    const switchStart = FORMULAS_SRC.indexOf("switch (p.projectId)");
    expect(switchStart, "production switch on p.projectId not found in formulas.ts").toBeGreaterThan(-1);
    // Walk forward to the next `}` that closes the switch. A simple
    // brace counter is enough since case bodies use `break`.
    let depth = 0;
    let end = switchStart;
    for (let i = switchStart; i < FORMULAS_SRC.length; i++) {
      const ch = FORMULAS_SRC[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const switchBody = FORMULAS_SRC.slice(switchStart, end);
    const cased = new Set<string>();
    const re = /case\s+"([a-z_]+)"\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(switchBody)) !== null) cased.add(m[1]);
    // Power and water production are composed by the shared utility helper.
    // Treat entries in its megaproject output maps as production consumers too.
    for (const id of ALL_IDS) {
      if (new RegExp(`\\b${id}\\s*:\\s*\\d+`).test(UTILITY_PRODUCTION_SRC)) {
        cased.add(id);
      }
    }

    const missing = ALL_IDS.filter((id) => !cased.has(id) && !PRODUCTION_SWITCH_ALLOWLIST.has(id));
    expect(
      missing,
      `MEGA_PROJECTS id(s) missing from formulas.ts production switch and not allowlisted: ${missing.join(", ")}. ` +
        `Either add a production case or move to PRODUCTION_SWITCH_ALLOWLIST with reasoning.`,
    ).toEqual([]);

    const stale = [...PRODUCTION_SWITCH_ALLOWLIST].filter((id) => cased.has(id));
    expect(
      stale,
      `PRODUCTION_SWITCH_ALLOWLIST is stale — these ids now HAVE a case in formulas.ts and should be removed: ${stale.join(", ")}`,
    ).toEqual([]);

    const unknown = [...cased].filter((id) => !(ALL_IDS as string[]).includes(id));
    expect(
      unknown,
      `formulas.ts production switch has case(s) for ids not in MEGA_PROJECTS: ${unknown.join(", ")}`,
    ).toEqual([]);

    expect(cased.size).toBe(10);
  });

  it("megaProjects.ts applyProjectEffects switch covers all 12 ids", () => {
    // Anchor on the function signature so we don't accidentally pick
    // up other switches.
    const fnStart = MEGA_SRC.indexOf("function applyProjectEffects");
    expect(fnStart, "applyProjectEffects not found").toBeGreaterThan(-1);
    const switchStart = MEGA_SRC.indexOf("switch (projectId)", fnStart);
    expect(switchStart, "switch on projectId inside applyProjectEffects not found").toBeGreaterThan(-1);
    let depth = 0;
    let end = switchStart;
    for (let i = switchStart; i < MEGA_SRC.length; i++) {
      const ch = MEGA_SRC[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = MEGA_SRC.slice(switchStart, end);
    const cased = new Set<string>();
    const re = /case\s+"([a-z_]+)"\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) cased.add(m[1]);

    const missing = ALL_IDS.filter((id) => !cased.has(id));
    expect(
      missing,
      `MEGA_PROJECTS id(s) missing from applyProjectEffects switch (silent on completion): ${missing.join(", ")}`,
    ).toEqual([]);
    expect(cased.size).toBe(ALL_IDS.length);
  });

  it("tickProcessors.ts substring matcher: pinned label-hit counts (brittle duplicate completion logic)", () => {
    // Confirm the substring matcher block exists.
    for (const pat of SUBSTRING_PATTERNS) {
      expect(
        TICK_SRC.includes(`effect.label.includes("${pat}")`),
        `tickProcessors.ts is missing substring matcher for "${pat}". ` +
          `Either the matcher block was refactored (delete this guard) or a pattern was dropped.`,
      ).toBe(true);
    }

    // Walk every completionEffects label and count substring hits per
    // pattern. Pinned counts catch label rewordings that would drop
    // a completion bonus, AND new labels that pick up a duplicate.
    const hits: Record<string, number> = Object.fromEntries(SUBSTRING_PATTERNS.map((p) => [p, 0]));
    for (const proj of MEGA_PROJECTS) {
      for (const eff of proj.completionEffects) {
        const lower = eff.label.toLowerCase();
        for (const pat of SUBSTRING_PATTERNS) {
          if (lower.includes(pat)) hits[pat] += 1;
        }
      }
    }

    // Pinned at audit time. If a future label change shifts these,
    // re-read the duplication note in the file header before bumping.
    const expected: Record<string, number> = {
      happiness: 3,
      trade: 2,
      population: 2,
      food: 3,
      power: 3,
      defense: 2,
    };
    expect(
      hits,
      `Substring-match label coverage shifted. New tally:\n` +
        Object.entries(hits)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n") +
        `\nIf a label was reworded, the substring matcher in tickProcessors.ts:1604 ` +
        `silently drops or duplicates a completion bonus. Audit before bumping.`,
    ).toEqual(expected);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  CompanySector,
  TickIntervalMinutes,
} from "@/engine/types";
import { REALTIME_TICK_INTERVALS } from "@/utils/tickTimingCopy";

/**
 * Drift guard: CompanySector + GameEvent.severity + Policies.mutantPolicy
 * + Policies.welfareRationing + TickIntervalMinutes union coverage.
 *
 *   CompanySector(10)               ↔ engine/companies.ts. Every
 *                                     union member appears as
 *                                     `sector: "..."` in ≥1 company
 *                                     definition.
 *
 *   GameEvent.severity(4)           ↔ engine/*.ts call sites. Every
 *                                     inline union literal appears
 *                                     as `severity: "..."` in ≥1
 *                                     event constructor anywhere
 *                                     in the engine sources.
 *
 *   Policies.mutantPolicy(3)        ↔ initialState.ts default
 *                                     ("contain") + diplomacy/ledger
 *                                     scoring tables ("purge") +
 *                                     achievements.ts checks
 *                                     ("tolerate"). All three
 *                                     literals must surface across
 *                                     the consuming sources.
 *
 *   Policies.welfareRationing(3)    ↔ achievements.ts +
 *                                     economy code paths. All three
 *                                     literals must surface.
 *
 *   TickIntervalMinutes(5)          ↔ shared ticker chip catalog consumed by
 *                                     app/(game)/overview.tsx.
 *                                     Every union member must
 *                                     appear in that array.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const COMPANIES_SRC = readFileSync(
  join(__dirname, "..", "companies.ts"),
  "utf8",
);
const ACHIEVEMENTS_SRC = readFileSync(
  join(__dirname, "..", "achievements.ts"),
  "utf8",
);
const INITIAL_SRC = readFileSync(
  join(__dirname, "..", "initialState.ts"),
  "utf8",
);
const DIPLOMACY_SRC = readFileSync(
  join(__dirname, "..", "diplomacyEngine.ts"),
  "utf8",
);
const LEDGER_SRC = readFileSync(
  join(__dirname, "..", "partnerLedger.ts"),
  "utf8",
);
const PERSONALITY_SRC = readFileSync(
  join(__dirname, "..", "partnerPersonality.ts"),
  "utf8",
);
const OVERVIEW_SRC = readFileSync(
  join(__dirname, "..", "..", "app", "(game)", "overview.tsx"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function parseInlineFieldUnion(
  src: string,
  type: string,
  field: string,
): string[] {
  const re = new RegExp(`${field}\\s*:\\s*((?:"[^"]+"\\s*\\|?\\s*)+);`);
  const block = src.match(new RegExp(`export type ${type}\\s*=\\s*\\{[\\s\\S]*?\\};`));
  expect(block, `type ${type} not found`).not.toBeNull();
  const fm = block![0].match(re);
  expect(fm, `field ${type}.${field} not found`).not.toBeNull();
  return (fm![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function parseTickIntervalNumbers(src: string): number[] {
  const m = src.match(/export type TickIntervalMinutes\s*=\s*([0-9 |]+);/);
  expect(m, "union TickIntervalMinutes not found").not.toBeNull();
  return (m![1].match(/[0-9]+/g) ?? []).map((s) => parseInt(s, 10));
}

const COMPANY_SECTOR = parseUnion(TYPES_SRC, "CompanySector");
const SEVERITY = parseInlineFieldUnion(TYPES_SRC, "GameEvent", "severity");
const MUTANT_POLICY = parseInlineFieldUnion(TYPES_SRC, "Policies", "mutantPolicy");
const WELFARE = parseInlineFieldUnion(TYPES_SRC, "Policies", "welfareRationing");
const TICK_INTERVAL = parseTickIntervalNumbers(TYPES_SRC);

describe("company sector / severity / mutant policy / welfare rationing / tick interval union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(COMPANY_SECTOR.length).toBe(10);
    expect(SEVERITY.length).toBe(4);
    expect(MUTANT_POLICY.length).toBe(3);
    expect(WELFARE.length).toBe(3);
    expect(TICK_INTERVAL.length).toBe(5);
  });

  it("CompanySector — every union member appears as `sector: \"..\"` in companies.ts", () => {
    for (const lit of COMPANY_SECTOR) {
      const re = new RegExp(`sector\\s*:\\s*"${lit}"`);
      expect(
        re.test(COMPANIES_SRC),
        `CompanySector "${lit}" never used in companies.ts`,
      ).toBe(true);
    }
    const sample: CompanySector = "energy";
    expect(COMPANY_SECTOR).toContain(sample);
  });

  it("GameEvent.severity — every union literal emitted as `severity: \"..\"` somewhere in engine sources", () => {
    const haystack = ACHIEVEMENTS_SRC + "\n" + DIPLOMACY_SRC + "\n" +
      readFileSync(join(__dirname, "..", "tickProcessors.ts"), "utf8") + "\n" +
      readFileSync(join(__dirname, "..", "wartimeEvents.ts"), "utf8") + "\n" +
      readFileSync(join(__dirname, "..", "newSystems.ts"), "utf8");
    for (const lit of SEVERITY) {
      const re = new RegExp(`severity\\s*:\\s*"${lit}"`);
      expect(
        re.test(haystack),
        `GameEvent.severity "${lit}" never emitted by any event constructor`,
      ).toBe(true);
    }
  });

  it("Policies.mutantPolicy — all literals surface across initial state, diplomacy, ledger, achievements", () => {
    const haystack = INITIAL_SRC + "\n" + DIPLOMACY_SRC + "\n" + LEDGER_SRC +
      "\n" + ACHIEVEMENTS_SRC + "\n" + PERSONALITY_SRC;
    for (const lit of MUTANT_POLICY) {
      expect(
        haystack.includes(`"${lit}"`),
        `Policies.mutantPolicy "${lit}" never referenced`,
      ).toBe(true);
    }
  });

  it("Policies.welfareRationing — all literals surface in achievements.ts or initialState.ts", () => {
    const haystack = ACHIEVEMENTS_SRC + "\n" + INITIAL_SRC;
    for (const lit of WELFARE) {
      expect(
        haystack.includes(`"${lit}"`),
        `Policies.welfareRationing "${lit}" never referenced`,
      ).toBe(true);
    }
  });

  it("TickIntervalMinutes — shared overview ticker chip catalog covers union 1:1", () => {
    expect(OVERVIEW_SRC).toContain("REALTIME_TICK_INTERVALS.map");
    expect(new Set(REALTIME_TICK_INTERVALS)).toEqual(new Set(TICK_INTERVAL));
    const sample: TickIntervalMinutes = 5;
    expect(TICK_INTERVAL).toContain(sample);
  });
});

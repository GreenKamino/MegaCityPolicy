import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TRAIT_DEFS,
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  RANK_LABELS,
  RANK_ORDER,
} from "@/engine/officers";
import type {
  OfficerTrait,
  OfficerExitReason,
  OfficerRank,
  OfficerDepartment,
  CharacterStatus,
} from "@/engine/types";

/**
 * Drift guard: OfficerTrait + OfficerExitReason + OfficerRank
 * + OfficerDepartment + CharacterStatus union coverage.
 *
 *   OfficerTrait(32)        ↔ TRAIT_DEFS catalog. Each entry id is
 *                             typed as OfficerTrait (TS-enforced)
 *                             and runtime-checked: every union
 *                             literal must appear as the id of ≥1
 *                             TraitDef row, and TRAIT_DEFS may not
 *                             reference unknown literals.
 *
 *   OfficerExitReason(4)    ↔ engine/officerLifecycle.ts +
 *                             engine/officerActions.ts. Every union
 *                             member referenced as a string literal
 *                             (assignment or branch).
 *
 *   OfficerRank(6)          ↔ RANK_LABELS Record (typed
 *                             Record<OfficerRank,…>) + RANK_ORDER
 *                             list. Both must cover the union 1:1.
 *
 *   OfficerDepartment(11)   ↔ DEPARTMENT_LABELS Record (typed
 *                             Record<OfficerDepartment,…>) +
 *                             DEPARTMENT_ORDER list. Both must
 *                             cover the union 1:1.
 *
 *   CharacterStatus(5)      ↔ engine/namedCharacters.ts (writes)
 *                             + engine/criminals.ts (switch arms).
 *                             "active" and "missing" written by
 *                             namedCharacters.ts; "jailed", "dead",
 *                             "exiled" referenced as case arms in
 *                             criminals.ts deriveCriminalStatus —
 *                             all five literals must surface in
 *                             the concatenated source.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const LIFECYCLE_SRC = readFileSync(
  join(__dirname, "..", "officerLifecycle.ts"),
  "utf8",
);
const ACTIONS_SRC = readFileSync(
  join(__dirname, "..", "officerActions.ts"),
  "utf8",
);
const NAMED_SRC = readFileSync(
  join(__dirname, "..", "namedCharacters.ts"),
  "utf8",
);
const CRIMINALS_SRC = readFileSync(
  join(__dirname, "..", "criminals.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const OFFICER_TRAIT = parseUnion(TYPES_SRC, "OfficerTrait");
const EXIT_REASON = parseUnion(TYPES_SRC, "OfficerExitReason");
const RANK = parseUnion(TYPES_SRC, "OfficerRank");
const DEPT = parseUnion(TYPES_SRC, "OfficerDepartment");
const CHAR_STATUS = parseUnion(TYPES_SRC, "CharacterStatus");

describe("officer trait / rank / department / exit reason / character status union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(OFFICER_TRAIT.length).toBe(32);
    expect(EXIT_REASON.length).toBe(4);
    expect(RANK.length).toBe(6);
    expect(DEPT.length).toBe(11);
    expect(CHAR_STATUS.length).toBe(5);
  });

  it("OfficerTrait — TRAIT_DEFS catalog matches union 1:1", () => {
    const known = new Set(OFFICER_TRAIT);
    const used = new Set<string>();
    for (const t of TRAIT_DEFS) {
      expect(known.has(t.id as string), `unknown OfficerTrait id ${t.id}`).toBe(
        true,
      );
      used.add(t.id as string);
    }
    expect(used.size).toBe(OFFICER_TRAIT.length);
    for (const lit of OFFICER_TRAIT) {
      expect(used.has(lit), `OfficerTrait ${lit} missing from TRAIT_DEFS`).toBe(
        true,
      );
    }
    const sample: OfficerTrait = "efficient";
    expect(known.has(sample)).toBe(true);
  });

  it("OfficerExitReason — every union member referenced in officerLifecycle.ts or officerActions.ts", () => {
    const haystack = LIFECYCLE_SRC + "\n" + ACTIONS_SRC;
    for (const lit of EXIT_REASON) {
      expect(
        haystack.includes(`"${lit}"`),
        `OfficerExitReason "${lit}" never referenced`,
      ).toBe(true);
    }
    const sample: OfficerExitReason = "retired";
    expect(EXIT_REASON).toContain(sample);
  });

  it("OfficerRank — RANK_LABELS Record + RANK_ORDER list cover union 1:1", () => {
    const known = new Set(RANK);
    expect(Object.keys(RANK_LABELS).length).toBe(RANK.length);
    expect(RANK_ORDER.length).toBe(RANK.length);
    for (const lit of RANK) {
      expect(
        (RANK_LABELS as Record<string, string>)[lit],
        `RANK_LABELS missing ${lit}`,
      ).toBeDefined();
      expect(
        RANK_ORDER.includes(lit as OfficerRank),
        `RANK_ORDER missing ${lit}`,
      ).toBe(true);
    }
    const sample: OfficerRank = "cadet";
    expect(known.has(sample)).toBe(true);
  });

  it("OfficerDepartment — DEPARTMENT_LABELS Record + DEPARTMENT_ORDER list cover union 1:1", () => {
    const known = new Set(DEPT);
    expect(Object.keys(DEPARTMENT_LABELS).length).toBe(DEPT.length);
    expect(DEPARTMENT_ORDER.length).toBe(DEPT.length);
    for (const lit of DEPT) {
      expect(
        (DEPARTMENT_LABELS as Record<string, string>)[lit],
        `DEPARTMENT_LABELS missing ${lit}`,
      ).toBeDefined();
      expect(
        DEPARTMENT_ORDER.includes(lit as OfficerDepartment),
        `DEPARTMENT_ORDER missing ${lit}`,
      ).toBe(true);
    }
    const sample: OfficerDepartment = "supreme_leadership";
    expect(known.has(sample)).toBe(true);
  });

  it("CharacterStatus — every union member surfaces in namedCharacters.ts (writes) or criminals.ts (branch arms)", () => {
    const haystack = NAMED_SRC + "\n" + CRIMINALS_SRC;
    for (const lit of CHAR_STATUS) {
      expect(
        haystack.includes(`"${lit}"`),
        `CharacterStatus "${lit}" never referenced in namedCharacters.ts or criminals.ts`,
      ).toBe(true);
    }
    const sample: CharacterStatus = "active";
    expect(CHAR_STATUS).toContain(sample);
  });
});

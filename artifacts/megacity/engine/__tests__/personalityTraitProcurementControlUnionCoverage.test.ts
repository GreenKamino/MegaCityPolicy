import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TRAIT_LABEL,
  TRAIT_DESCRIPTION,
} from "@/engine/partnerPersonality";
import { controlStatusLabel } from "@/engine/partnerCityStats";
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  RANK_LABELS,
} from "@/engine/officers";

/**
 * Drift guard: PartnerPersonalityTrait records, KIND_TRAIT_POOLS
 * inline pools, controlStatusLabel exhaustiveness, ProcurementMethod
 * private Records in app/(game)/contracts.tsx, plus DEPARTMENT/RANK
 * label sanity.
 *
 *   PartnerPersonalityTrait 10 ↔ TRAIT_LABEL / TRAIT_DESCRIPTION /
 *                                  TRAIT_VALUES (tsc-enforced; pin
 *                                  count + non-empty + numeric sanity)
 *                              ↔ KIND_TRAIT_POOLS values: every
 *                                  union member used by ≥1 kind
 *                                  (orphan trait would be dead UI)
 *
 *   PartnerControlStatus     3 ↔ controlStatusLabel switch
 *                                  (no Record; manual switch — drift!)
 *
 *   ProcurementMethod        3 ↔ PROCUREMENT_LABELS /
 *                                  PROCUREMENT_DESCRIPTIONS Record
 *                                  literals in app/(game)/contracts.tsx
 *                                  (private; parsed live)
 *
 *   OfficerDepartment       11 ↔ DEPARTMENT_ORDER array completeness
 *                                  (sibling to DEPARTMENT_LABELS Record)
 *   OfficerRank              6 ↔ RANK_LABELS non-empty sanity
 *
 * Counts pinned for budget.
 */

const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);
const PERSONALITY_SRC = readFileSync(
  join(__dirname, "..", "partnerPersonality.ts"),
  "utf8",
);
const CONTRACTS_SCREEN_SRC = readFileSync(
  join(__dirname, "..", "..", "app", "(game)", "contracts.tsx"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

/** Parse the keys of a Record literal initializer by name. */
function parseRecordKeys(src: string, recordName: string): string[] {
  const re = new RegExp(
    `${recordName}[^=]*=\\s*\\{([\\s\\S]*?)^\\};`,
    "m",
  );
  const m = src.match(re);
  expect(m, `Record ${recordName} not found`).not.toBeNull();
  // Match top-level keys only (lines starting with two spaces + identifier:).
  const keys = (m![1].match(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*):/gm) ?? []).map(
    (line) => line.trim().replace(/:$/, ""),
  );
  return keys;
}

/**
 * Parse the trait arrays inside KIND_TRAIT_POOLS. Returns the union of
 * traits referenced across all kinds.
 */
function parseTraitsUsedInPools(src: string): Set<string> {
  const m = src.match(/KIND_TRAIT_POOLS[^=]*=\s*\{([\s\S]*?)^\};/m);
  expect(m, "KIND_TRAIT_POOLS not found").not.toBeNull();
  const tokens = m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? [];
  return new Set(tokens.map((t) => t.replace(/"/g, "")));
}

const PARTNER_PERSONALITY_TRAIT = parseUnion(TYPES_SRC, "PartnerPersonalityTrait");
const PARTNER_CONTROL_STATUS = parseUnion(TYPES_SRC, "PartnerControlStatus");
const PROCUREMENT_METHOD = parseUnion(TYPES_SRC, "ProcurementMethod");
const OFFICER_DEPARTMENT = parseUnion(TYPES_SRC, "OfficerDepartment");
const OFFICER_RANK = parseUnion(TYPES_SRC, "OfficerRank");

const TRAIT_VALUES_KEYS = parseRecordKeys(PERSONALITY_SRC, "TRAIT_VALUES");
const POOL_TRAITS = parseTraitsUsedInPools(PERSONALITY_SRC);

const PROC_LABEL_KEYS = parseRecordKeys(
  CONTRACTS_SCREEN_SRC,
  "PROCUREMENT_LABELS",
);
const PROC_DESC_KEYS = parseRecordKeys(
  CONTRACTS_SCREEN_SRC,
  "PROCUREMENT_DESCRIPTIONS",
);

describe("personality trait / procurement / control / dept / rank union coverage drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(PARTNER_PERSONALITY_TRAIT.length).toBe(10);
    expect(PARTNER_CONTROL_STATUS.length).toBe(3);
    expect(PROCUREMENT_METHOD.length).toBe(3);
    expect(OFFICER_DEPARTMENT.length).toBe(11);
    expect(OFFICER_RANK.length).toBe(6);
  });

  it("TRAIT_LABEL keys equal PartnerPersonalityTrait union exactly with non-empty UPPERCASE labels", () => {
    expect(Object.keys(TRAIT_LABEL).sort()).toEqual([...PARTNER_PERSONALITY_TRAIT].sort());
    for (const [trait, label] of Object.entries(TRAIT_LABEL)) {
      expect(label.length, `${trait} has empty label`).toBeGreaterThan(0);
      expect(label, `${trait} label not uppercase`).toBe(label.toUpperCase());
    }
  });

  it("TRAIT_DESCRIPTION keys equal PartnerPersonalityTrait union exactly with non-empty descriptions", () => {
    expect(Object.keys(TRAIT_DESCRIPTION).sort()).toEqual([...PARTNER_PERSONALITY_TRAIT].sort());
    for (const [trait, desc] of Object.entries(TRAIT_DESCRIPTION)) {
      expect(desc.length, `${trait} has empty description`).toBeGreaterThanOrEqual(20);
    }
  });

  it("TRAIT_VALUES (parsed live) keys equal PartnerPersonalityTrait union exactly", () => {
    // TRAIT_VALUES is module-private; must parse to verify completeness.
    expect([...TRAIT_VALUES_KEYS].sort()).toEqual([...PARTNER_PERSONALITY_TRAIT].sort());
  });

  it("KIND_TRAIT_POOLS (parsed live) references only known traits and exercises every union member", () => {
    const known = new Set(PARTNER_PERSONALITY_TRAIT);
    const unknown = [...POOL_TRAITS].filter((t) => !known.has(t));
    expect(unknown, "KIND_TRAIT_POOLS uses traits not in PartnerPersonalityTrait").toEqual([]);
    const unused = PARTNER_PERSONALITY_TRAIT.filter((t) => !POOL_TRAITS.has(t));
    expect(
      unused,
      "PartnerPersonalityTrait union members not used by any KIND_TRAIT_POOLS pool (orphan UI)",
    ).toEqual([]);
  });

  it("controlStatusLabel returns a unique non-empty UPPERCASE label for every PartnerControlStatus member", () => {
    const labels = PARTNER_CONTROL_STATUS.map((s) =>
      controlStatusLabel(s as never),
    );
    for (const [i, label] of labels.entries()) {
      expect(label.length, `${PARTNER_CONTROL_STATUS[i]} label empty`).toBeGreaterThan(0);
      expect(label, `${PARTNER_CONTROL_STATUS[i]} label not uppercase`).toBe(label.toUpperCase());
    }
    expect(new Set(labels).size).toBe(labels.length);
    // Pin specific mapping so the switch can't be silently shuffled.
    expect(controlStatusLabel("independent" as never)).toBe("INDEPENDENT");
    expect(controlStatusLabel("occupied" as never)).toBe("OCCUPIED");
    expect(controlStatusLabel("annexed" as never)).toBe("ANNEXED");
  });

  it("PROCUREMENT_LABELS and PROCUREMENT_DESCRIPTIONS (parsed live from contracts.tsx) equal ProcurementMethod exactly", () => {
    // These Records are module-private to the screen; if a new
    // procurement method is added to the union but not wired here,
    // the picker silently falls back to the union key string.
    expect([...PROC_LABEL_KEYS].sort()).toEqual([...PROCUREMENT_METHOD].sort());
    expect([...PROC_DESC_KEYS].sort()).toEqual([...PROCUREMENT_METHOD].sort());
  });

  it("DEPARTMENT_LABELS keys + DEPARTMENT_ORDER equal OfficerDepartment union exactly", () => {
    expect(Object.keys(DEPARTMENT_LABELS).sort()).toEqual([...OFFICER_DEPARTMENT].sort());
    expect([...DEPARTMENT_ORDER].sort()).toEqual([...OFFICER_DEPARTMENT].sort());
    // Order array is a permutation, no dupes.
    expect(new Set(DEPARTMENT_ORDER).size).toBe(DEPARTMENT_ORDER.length);
    for (const [k, v] of Object.entries(DEPARTMENT_LABELS)) {
      expect(v.length, `dept ${k} has empty label`).toBeGreaterThan(0);
      expect(v, `dept ${k} not uppercase`).toBe(v.toUpperCase());
    }
  });

  it("RANK_LABELS keys equal OfficerRank union exactly with non-empty UPPERCASE labels", () => {
    expect(Object.keys(RANK_LABELS).sort()).toEqual([...OFFICER_RANK].sort());
    for (const [k, v] of Object.entries(RANK_LABELS)) {
      expect(v.length, `rank ${k} has empty label`).toBeGreaterThan(0);
      expect(v, `rank ${k} not uppercase`).toBe(v.toUpperCase());
    }
  });
});

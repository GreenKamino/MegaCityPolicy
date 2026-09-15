import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Drift guard: PartnerKind record coverage.
 *
 * PartnerKind is a 10-member union exported from engine/types.ts. Two
 * adjacent files declare `Record<PartnerKind, ...>` literals whose
 * keys must stay aligned with the union, otherwise:
 *
 *   - diplomaticFollowUps.ts: missing key → indexed lookup returns
 *     undefined → `pickFromArray(undefined)` → fallback string only
 *     (silent loss of variety) or, in some paths, a runtime crash.
 *
 *   - partnerPersonality.ts: missing key → KIND_TRAIT_POOLS lookup
 *     falls through to KIND_TRAIT_POOLS.megacity, silently giving a
 *     new partner kind the wrong personality pool / manifesto. Type
 *     system would catch a hardcoded `Record<PartnerKind,...>`, but
 *     drift is easy when someone widens the union and forgets a file.
 *
 * Each record is parsed live from source, compared against the union
 * parsed live from types.ts. Both halves are source-derived so the
 * test cannot be fooled by mocking either side.
 */

const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);
const FOLLOWUPS_SRC = readFileSync(
  join(__dirname, "..", "diplomaticFollowUps.ts"),
  "utf8",
);
const PERSONALITY_SRC = readFileSync(
  join(__dirname, "..", "partnerPersonality.ts"),
  "utf8",
);

function parsePartnerKindUnion(): string[] {
  const m = TYPES_SRC.match(/export type PartnerKind\s*=\s*([\s\S]*?);/);
  expect(m).not.toBeNull();
  const members = (m![1].match(/"([a-zA-Z_]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
  return members;
}

function parseRecordKeys(
  src: string,
  recordName: string,
): string[] {
  // Find the literal initializer of this record. Match `name: Record<PartnerKind, ...> = { ... };`
  const pattern = new RegExp(
    `${recordName}\\s*:\\s*Record<PartnerKind,[^>]+>\\s*=\\s*\\{([\\s\\S]*?)^\\};`,
    "m",
  );
  const m = src.match(pattern);
  expect(m, `record ${recordName} not found`).not.toBeNull();
  const body = m![1];
  // Top-level keys: identifier followed by colon at indent 2 (lines starting with optional whitespace, identifier, colon).
  // Use a permissive scan that ignores nested braces by parsing line by line.
  const keys: string[] = [];
  let depth = 0;
  for (const rawLine of body.split("\n")) {
    const line = rawLine;
    if (depth === 0) {
      const km = line.match(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
      if (km) keys.push(km[1]);
    }
    for (const ch of line) {
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
    }
  }
  return keys;
}

const FOLLOWUPS_RECORDS = [
  "KIND_GREETING",
  "FAVOR_REQUESTS_BY_KIND",
  "GOSSIP_LINES_BY_KIND",
  "RETALIATION_LINES_BY_KIND",
];

const PERSONALITY_RECORDS = ["KIND_TRAIT_POOLS", "KIND_MANIFESTOS"];

describe("PartnerKind record coverage drift guard", () => {
  const union = parsePartnerKindUnion();

  it("parses the PartnerKind union from types.ts", () => {
    expect(union.length).toBe(11);
    // Sanity: known anchors must be present so a regex regression
    // that yields the empty set is loud.
    for (const anchor of ["law", "criminal", "megacity", "group"]) {
      expect(union).toContain(anchor);
    }
  });

  it.each(FOLLOWUPS_RECORDS)(
    "diplomaticFollowUps.ts %s covers every PartnerKind exactly once",
    (name) => {
      const keys = parseRecordKeys(FOLLOWUPS_SRC, name);
      expect([...keys].sort()).toEqual([...union].sort());
      expect(new Set(keys).size).toBe(keys.length);
    },
  );

  it.each(PERSONALITY_RECORDS)(
    "partnerPersonality.ts %s covers every PartnerKind exactly once",
    (name) => {
      const keys = parseRecordKeys(PERSONALITY_SRC, name);
      expect([...keys].sort()).toEqual([...union].sort());
      expect(new Set(keys).size).toBe(keys.length);
    },
  );

  it("source files declare the documented record count (catalog pin)", () => {
    // If new Record<PartnerKind,...> literals are added to either
    // file, this pin will fail and the maintainer has to extend the
    // arrays above. That forces explicit coverage.
    const followupsCount = (FOLLOWUPS_SRC.match(/Record<PartnerKind,/g) ?? [])
      .length;
    const personalityCount = (
      PERSONALITY_SRC.match(/Record<PartnerKind,/g) ?? []
    ).length;
    expect(followupsCount).toBe(FOLLOWUPS_RECORDS.length);
    expect(personalityCount).toBe(PERSONALITY_RECORDS.length);
  });
});

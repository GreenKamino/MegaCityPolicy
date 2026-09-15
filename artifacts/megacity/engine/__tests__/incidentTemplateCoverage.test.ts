import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Drift guard: INCIDENT_TEMPLATES coverage of IncidentCategory and
 * IncidentSeverity.
 *
 * engine/diplomacyAdvanced.ts exports two unions and consumes them
 * inside a module-local INCIDENT_TEMPLATES array:
 *
 *   IncidentCategory  8 members (border, espionage, trade, refugee,
 *                     territorial, assassination, sabotage, ideological)
 *   IncidentSeverity  4 members (minor, moderate, major, crisis)
 *
 * The runtime picks templates by random selection. If a category or
 * severity is added to a union but no template uses it, that branch
 * is silently unreachable — players never see it. Adding a `category:`
 * or `severity:` literal that is not in its union would be caught by
 * tsc only as long as the literal type stays narrow; this guard
 * provides a runtime safety net independent of tsc.
 */

const SRC = readFileSync(
  join(__dirname, "..", "diplomacyAdvanced.ts"),
  "utf8",
);

function parseUnion(name: string): string[] {
  const m = SRC.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function extractTemplatesBlock(): string {
  const m = SRC.match(/const INCIDENT_TEMPLATES[\s\S]*?^\];$/m);
  expect(m, "INCIDENT_TEMPLATES block not found").not.toBeNull();
  return m![0];
}

const CATEGORY = parseUnion("IncidentCategory");
const SEVERITY = parseUnion("IncidentSeverity");
const BLOCK = extractTemplatesBlock();

function literalsFor(field: string): string[] {
  const re = new RegExp(`${field}:\\s*"([a-zA-Z_-]+)"`, "g");
  const out: string[] = [];
  for (const m of BLOCK.matchAll(re)) out.push(m[1]);
  return out;
}

describe("INCIDENT_TEMPLATES coverage drift guard", () => {
  it("parses IncidentCategory and IncidentSeverity unions", () => {
    expect(CATEGORY.length).toBe(8);
    expect(SEVERITY.length).toBe(4);
    for (const a of ["border", "espionage", "ideological"]) {
      expect(CATEGORY).toContain(a);
    }
    for (const a of ["minor", "crisis"]) {
      expect(SEVERITY).toContain(a);
    }
  });

  it("template count is pinned (catalog budget)", () => {
    // One `category:` per template entry. Pinning the count forces
    // explicit review when templates are added or removed.
    const count = literalsFor("category").length;
    expect(count).toBe(12);
  });

  it("every IncidentCategory union member is used by at least one template", () => {
    const used = new Set(literalsFor("category"));
    const missing = CATEGORY.filter((c) => !used.has(c));
    expect(missing).toEqual([]);
  });

  it("every IncidentSeverity union member is used by at least one template", () => {
    const used = new Set(literalsFor("severity"));
    const missing = SEVERITY.filter((s) => !used.has(s));
    expect(missing).toEqual([]);
  });

  it("no orphan category literal appears in templates", () => {
    const set = new Set(CATEGORY);
    const orphans = literalsFor("category").filter((c) => !set.has(c));
    expect(orphans).toEqual([]);
  });

  it("no orphan severity literal appears in templates", () => {
    const set = new Set(SEVERITY);
    const orphans = literalsFor("severity").filter((s) => !set.has(s));
    expect(orphans).toEqual([]);
  });

  it("category and severity literal counts match the entry count (one of each per template)", () => {
    // Catches duplicate or missing field via copy-paste.
    const entries = (BLOCK.match(/^  \{$/gm) ?? []).length;
    expect(literalsFor("category").length).toBe(entries);
    expect(literalsFor("severity").length).toBe(entries);
  });
});

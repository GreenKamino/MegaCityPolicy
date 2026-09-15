import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMPANIES,
  COMPANIES_MAP,
  COMPANY_SECTOR_LABELS,
  COMPANY_SECTOR_ICONS,
} from "@/engine/companies";
import { WILDLANDS_PROJECTS } from "@/engine/wildlandsProjects";

/**
 * Drift guard: sanitizer hardcoded Sets vs source unions, company
 * sector Records vs CompanySector union, IntelItemKind vs the kinds
 * intelEngine actually emits, WildlandsProjectKind ↔ catalog.
 *
 *   PartnerStance     8 ↔ sanitizer STANCE_VALID Set<string>
 *                          (hand-typed; drift!)
 *   EcologyStance     4 ↔ sanitizer ECOLOGY_STANCE_VALID Set<string>
 *                          (hand-typed; drift!)
 *
 *   CompanySector    10 ↔ COMPANY_SECTOR_LABELS Record<string,string>
 *                       ↔ COMPANY_SECTOR_ICONS  Record<string,string>
 *                          + every COMPANIES.sector value (typed but
 *                          completeness-of-use not enforced)
 *
 *   IntelItemKind     5 ↔ kinds emitted by intelEngine.ts inline
 *                          (no Record; parse `kind: "..."` literals)
 *
 *   WildlandsProjectKind 9 → WILDLANDS_PROJECTS Record<...> (tsc full
 *                              coverage); pin runtime keys + non-empty
 *                              labels.
 *
 * All sides parsed live from source. Counts pinned for budget.
 */

const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);
const SANITIZER_SRC = readFileSync(
  join(__dirname, "..", "sanitizer.ts"),
  "utf8",
);
const COMPANIES_SRC = readFileSync(
  join(__dirname, "..", "companies.ts"),
  "utf8",
);
const INTEL_ENGINE_SRC = readFileSync(
  join(__dirname, "..", "intelEngine.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

/** Parse the literal Set body: `const NAME = new Set<string>(["a","b"])`. */
function parseSetLiterals(src: string, name: string): string[] {
  const m = src.match(
    new RegExp(`const ${name}\\s*=\\s*new Set<string>\\(\\[([\\s\\S]*?)\\]\\)`),
  );
  expect(m, `Set ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

/** Pull all `kind: "literal"` token values out of a source file. */
function parseEmittedKinds(src: string): string[] {
  const matches = src.match(/kind:\s*"([a-zA-Z0-9_-]+)"/g) ?? [];
  return matches.map((m) => m.match(/"([^"]+)"/)![1]);
}

const PARTNER_STANCE = parseUnion(TYPES_SRC, "PartnerStance");
const ECOLOGY_STANCE = parseUnion(TYPES_SRC, "EcologyStance");
const COMPANY_SECTOR = parseUnion(TYPES_SRC, "CompanySector");
const INTEL_ITEM_KIND = parseUnion(TYPES_SRC, "IntelItemKind");
const WILDLANDS_PROJECT_KIND = parseUnion(TYPES_SRC, "WildlandsProjectKind");

const SANITIZER_STANCE_VALID = parseSetLiterals(SANITIZER_SRC, "STANCE_VALID");
const SANITIZER_ECOLOGY_VALID = parseSetLiterals(
  SANITIZER_SRC,
  "ECOLOGY_STANCE_VALID",
);

const INTEL_EMITTED_KINDS = parseEmittedKinds(INTEL_ENGINE_SRC);

describe("sanitizer / stance / company / intel / wildlands union coverage drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(PARTNER_STANCE.length).toBe(8);
    expect(ECOLOGY_STANCE.length).toBe(4);
    expect(COMPANY_SECTOR.length).toBe(10);
    expect(INTEL_ITEM_KIND.length).toBe(5);
    expect(WILDLANDS_PROJECT_KIND.length).toBe(9);
  });

  it("catalog sizes are pinned (budget)", () => {
    expect(COMPANIES.length).toBe(100);
    expect(Object.keys(WILDLANDS_PROJECTS).length).toBe(9);
  });

  it("sanitizer STANCE_VALID equals PartnerStance union exactly (no drift)", () => {
    // Sanitizer is the load-side gatekeeper; if a new stance is added
    // to the union but not the Set, every save with that stance gets
    // silently demoted on load.
    expect([...SANITIZER_STANCE_VALID].sort()).toEqual([...PARTNER_STANCE].sort());
  });

  it("sanitizer ECOLOGY_STANCE_VALID equals EcologyStance union exactly", () => {
    expect([...SANITIZER_ECOLOGY_VALID].sort()).toEqual(
      [...ECOLOGY_STANCE].sort(),
    );
  });

  it("COMPANY_SECTOR_LABELS keys equal CompanySector union exactly with non-empty values", () => {
    const keys = Object.keys(COMPANY_SECTOR_LABELS).sort();
    expect(keys).toEqual([...COMPANY_SECTOR].sort());
    for (const [k, v] of Object.entries(COMPANY_SECTOR_LABELS)) {
      expect(v.length, `label for ${k} is empty`).toBeGreaterThan(0);
    }
  });

  it("COMPANY_SECTOR_ICONS keys equal CompanySector union exactly with non-empty values", () => {
    const keys = Object.keys(COMPANY_SECTOR_ICONS).sort();
    expect(keys).toEqual([...COMPANY_SECTOR].sort());
    for (const [k, v] of Object.entries(COMPANY_SECTOR_ICONS)) {
      expect(v.length, `icon for ${k} is empty`).toBeGreaterThan(0);
    }
  });

  it("every CompanySector union member is used by ≥1 COMPANIES entry (no orphan UI bucket)", () => {
    const used = new Set(COMPANIES.map((c) => c.sector));
    const unused = COMPANY_SECTOR.filter((s) => !used.has(s as never));
    expect(unused, "company sectors with no entries").toEqual([]);
    const knownSectors = new Set(COMPANY_SECTOR);
    for (const c of COMPANIES) {
      expect(knownSectors.has(c.sector), `company ${c.id} has unknown sector ${c.sector}`).toBe(true);
    }
  });

  it("COMPANIES ids are unique and COMPANIES_MAP indexes every entry 1:1", () => {
    const ids = COMPANIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COMPANIES) {
      expect(COMPANIES_MAP[c.id], `COMPANIES_MAP missing ${c.id}`).toBe(c);
    }
    expect(Object.keys(COMPANIES_MAP).length).toBe(COMPANIES.length);
  });

  it("every CompanyDef has tier in {1,2,3} and non-empty name", () => {
    for (const c of COMPANIES) {
      expect([1, 2, 3]).toContain(c.tier);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it("every IntelItemKind emitted by intelEngine is in the IntelItemKind union", () => {
    // intelEngine.ts emits intel items with inline `kind:` literals.
    // We don't require every union member to be exercised (the engine
    // historically only emits 3-of-5: rumor/intel/warning), but every
    // emitted kind MUST be in the union or sanitizer will silently
    // drop it.
    const emitted = new Set(INTEL_EMITTED_KINDS);
    const known = new Set(INTEL_ITEM_KIND);
    const unknown = [...emitted].filter((k) => !known.has(k));
    expect(unknown, "intelEngine emits IntelItem.kind values not in union").toEqual([]);
    // Sanity: at least three kinds are actively emitted today.
    expect(emitted.size).toBeGreaterThanOrEqual(3);
    // Documented allowlist: "tip" and "secret" are union members the
    // engine does not currently produce. If you remove them from the
    // union, ensure no UI consumer still filters on them first.
    const unused = INTEL_ITEM_KIND.filter((k) => !emitted.has(k));
    expect([...unused].sort()).toEqual(["secret", "tip"]);
  });

  it("WILDLANDS_PROJECTS keys equal WildlandsProjectKind union exactly with non-empty fields", () => {
    const keys = Object.keys(WILDLANDS_PROJECTS).sort();
    expect(keys).toEqual([...WILDLANDS_PROJECT_KIND].sort());
    for (const [k, def] of Object.entries(WILDLANDS_PROJECTS)) {
      expect(def.kind, `${k} kind mismatch`).toBe(k);
      expect(def.name.length, `${k} has empty name`).toBeGreaterThan(0);
      expect(def.short.length, `${k} has empty short`).toBeGreaterThan(0);
      expect(def.description.length, `${k} has empty description`).toBeGreaterThan(0);
      expect(def.resultText.length, `${k} has empty resultText`).toBeGreaterThan(0);
      expect(def.duration).toBeGreaterThan(0);
      expect(def.cost.credits).toBeGreaterThanOrEqual(0);
    }
  });

  it("sanitizer Set hand-counts haven't drifted from documented sizes (budget)", () => {
    // Sanitizer Sets are hand-built literals. Pin sizes so a partial
    // edit (adding one but not the other) gets caught even before the
    // equality assertions above.
    expect(SANITIZER_STANCE_VALID.length).toBe(8);
    expect(SANITIZER_ECOLOGY_VALID.length).toBe(4);
  });
});

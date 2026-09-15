import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMBAT_DOCTRINES,
  ENGAGEMENT_TEMPLATES,
  FORMATIONS,
  ORDNANCE_OPTIONS,
} from "@/engine/combatData";
import type {
  DoctrineId,
  EngagementType,
  FormationId,
  OrdnanceId,
} from "@/engine/combatData";

/**
 * Drift guard: EngagementType + DoctrineId + FormationId + OrdnanceId
 * union coverage.
 *
 *   EngagementType(10) ↔ ENGAGEMENT_TEMPLATES in engine/combatData.ts.
 *                        Every union member used by ≥1 template via
 *                        .type; every emitted type a known literal.
 *
 *   DoctrineId(14)     ↔ COMBAT_DOCTRINES catalog. Catalog covers
 *                        union 1:1 by .id; every emitted id a
 *                        known literal.
 *
 *   FormationId(6)     ↔ FORMATIONS catalog. Catalog covers union
 *                        1:1 by .id; every emitted id a known
 *                        literal.
 *
 *   OrdnanceId(6)      ↔ ORDNANCE_OPTIONS catalog. Catalog covers
 *                        union 1:1 by .id; every emitted id a
 *                        known literal.
 */

const COMBAT_SRC = readFileSync(
  join(__dirname, "..", "combatData.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function assertCatalogCoversUnion(
  union: string[],
  catalog: { id: string }[],
  label: string,
): void {
  const ids = catalog.map((e) => e.id);
  expect(new Set(ids).size, `${label}: catalog has duplicate ids`).toBe(
    ids.length,
  );
  expect(ids.length, `${label}: catalog size != union size`).toBe(union.length);
  for (const lit of union) {
    expect(ids, `${label}: union member ${lit} missing from catalog`).toContain(
      lit,
    );
  }
  for (const id of ids) {
    expect(union, `${label}: catalog id ${id} not in union`).toContain(id);
  }
}

const ENG_TYPE = parseUnion(COMBAT_SRC, "EngagementType");
const DOC_ID = parseUnion(COMBAT_SRC, "DoctrineId");
const FORM_ID = parseUnion(COMBAT_SRC, "FormationId");
const ORD_ID = parseUnion(COMBAT_SRC, "OrdnanceId");

describe("engagement-type / doctrine / formation / ordnance union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(ENG_TYPE.length).toBe(10);
    expect(DOC_ID.length).toBe(14);
    expect(FORM_ID.length).toBe(6);
    expect(ORD_ID.length).toBe(6);
  });

  it("EngagementType — every union member used by ≥1 ENGAGEMENT_TEMPLATES entry", () => {
    const used = new Set<string>();
    for (const t of ENGAGEMENT_TEMPLATES) used.add(t.type as string);
    for (const lit of ENG_TYPE) {
      expect(
        used.has(lit),
        `EngagementType ${lit} unused in ENGAGEMENT_TEMPLATES`,
      ).toBe(true);
    }
    for (const t of used) {
      expect(ENG_TYPE, `unknown EngagementType ${t}`).toContain(t);
    }
    const sample: EngagementType = "skirmish";
    expect(ENG_TYPE).toContain(sample);
  });

  it("DoctrineId — COMBAT_DOCTRINES catalog covers union 1:1", () => {
    assertCatalogCoversUnion(DOC_ID, COMBAT_DOCTRINES, "DoctrineId");
    const sample: DoctrineId = "balanced";
    expect(DOC_ID).toContain(sample);
  });

  it("FormationId — FORMATIONS catalog covers union 1:1", () => {
    assertCatalogCoversUnion(FORM_ID, FORMATIONS, "FormationId");
    const sample: FormationId = "line";
    expect(FORM_ID).toContain(sample);
  });

  it("OrdnanceId — ORDNANCE_OPTIONS catalog covers union 1:1", () => {
    assertCatalogCoversUnion(ORD_ID, ORDNANCE_OPTIONS, "OrdnanceId");
    const sample: OrdnanceId = "standard";
    expect(ORD_ID).toContain(sample);
  });
});

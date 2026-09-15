import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ATTACK_TYPES, TARGET_CATEGORIES } from "@/engine/strikeData";
import { ILLNESSES, ILLNESS_CATEGORIES } from "@/engine/medical";
import { TIER_1_ARCHETYPES } from "@/engine/independentEnterprises";
import type { AttackTypeId, TargetCategoryId } from "@/engine/strikeData";
import type { IllnessCategory } from "@/engine/medical";
import type {
  BusinessCategory,
  BusinessStatus,
} from "@/engine/independentEnterprises";

/**
 * Drift guard: AttackTypeId + TargetCategoryId + IllnessCategory +
 * BusinessCategory + BusinessStatus union coverage.
 *
 *   AttackTypeId(10)    ↔ ATTACK_TYPES catalog in engine/strikeData.ts.
 *                         Catalog covers union 1:1 by .id with no
 *                         duplicates; every emitted id a known
 *                         literal.
 *
 *   TargetCategoryId(5) ↔ TARGET_CATEGORIES catalog. Catalog covers
 *                         union 1:1 by .id with no duplicates;
 *                         every emitted id a known literal.
 *
 *   IllnessCategory(5)  ↔ ILLNESS_CATEGORIES Record (typed
 *                         Record<IllnessCategory,string>) + ILLNESSES
 *                         catalog. Record covers union 1:1; every
 *                         union member used by ≥1 illness entry.
 *
 *   BusinessCategory(14)↔ TIER_1_ARCHETYPES catalog in
 *                         engine/independentEnterprises.ts. Every
 *                         union member used by ≥1 archetype via
 *                         .category; every emitted category a
 *                         known literal.
 *
 *   BusinessStatus(4)   ↔ engine/independentEnterprises.ts. Source-
 *                         parsed: every union member is a known
 *                         literal; runtime "stable" used by initial
 *                         spawn (sanity check).
 */

const STRIKE_SRC = readFileSync(
  join(__dirname, "..", "strikeData.ts"),
  "utf8",
);
const MED_SRC = readFileSync(join(__dirname, "..", "medical.ts"), "utf8");
const ENT_SRC = readFileSync(
  join(__dirname, "..", "independentEnterprises.ts"),
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

const ATK_ID = parseUnion(STRIKE_SRC, "AttackTypeId");
const TGT_ID = parseUnion(STRIKE_SRC, "TargetCategoryId");
const ILL_CAT = parseUnion(MED_SRC, "IllnessCategory");
const BIZ_CAT = parseUnion(ENT_SRC, "BusinessCategory");
const BIZ_STATUS = parseUnion(ENT_SRC, "BusinessStatus");

describe("attack-type / target-category / illness-category / business-category / business-status union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(ATK_ID.length).toBe(10);
    expect(TGT_ID.length).toBe(5);
    expect(ILL_CAT.length).toBe(5);
    expect(BIZ_CAT.length).toBe(14);
    expect(BIZ_STATUS.length).toBe(4);
  });

  it("AttackTypeId — ATTACK_TYPES catalog covers union 1:1", () => {
    assertCatalogCoversUnion(ATK_ID, ATTACK_TYPES, "AttackTypeId");
    const sample: AttackTypeId = "troop_assault";
    expect(ATK_ID).toContain(sample);
  });

  it("TargetCategoryId — TARGET_CATEGORIES catalog covers union 1:1", () => {
    assertCatalogCoversUnion(TGT_ID, TARGET_CATEGORIES, "TargetCategoryId");
    const sample: TargetCategoryId = "military";
    expect(TGT_ID).toContain(sample);
  });

  it("IllnessCategory — ILLNESS_CATEGORIES Record covers union 1:1 + every member used by ≥1 ILLNESSES entry", () => {
    expect(Object.keys(ILLNESS_CATEGORIES).length).toBe(ILL_CAT.length);
    for (const lit of ILL_CAT) {
      expect(
        (ILLNESS_CATEGORIES as Record<string, string>)[lit],
        `ILLNESS_CATEGORIES missing ${lit}`,
      ).toBeDefined();
    }
    const used = new Set<string>();
    for (const ill of ILLNESSES) used.add(ill.category as string);
    for (const lit of ILL_CAT) {
      expect(used.has(lit), `IllnessCategory ${lit} unused in ILLNESSES`).toBe(
        true,
      );
    }
    for (const c of used) {
      expect(ILL_CAT, `unknown IllnessCategory ${c}`).toContain(c);
    }
    const sample: IllnessCategory = "regular";
    expect(ILL_CAT).toContain(sample);
  });

  it("BusinessCategory — every union member used by ≥1 TIER_1_ARCHETYPES entry", () => {
    const used = new Set<string>();
    for (const a of TIER_1_ARCHETYPES) used.add(a.category as string);
    for (const lit of BIZ_CAT) {
      expect(
        used.has(lit),
        `BusinessCategory ${lit} unused in TIER_1_ARCHETYPES`,
      ).toBe(true);
    }
    for (const c of used) {
      expect(BIZ_CAT, `unknown BusinessCategory ${c}`).toContain(c);
    }
    const sample: BusinessCategory = "food_drink";
    expect(BIZ_CAT).toContain(sample);
  });

  it("BusinessStatus — every union member is a known literal; runtime spawn-default in catalog", () => {
    expect(new Set(BIZ_STATUS).size).toBe(BIZ_STATUS.length);
    for (const lit of BIZ_STATUS) {
      expect(typeof lit).toBe("string");
    }
    const spawnDefaults = (
      ENT_SRC.match(/status:\s*"([a-zA-Z0-9_-]+)"/g) ?? []
    ).map((s) => s.replace(/status:\s*"|"/g, ""));
    expect(spawnDefaults.length).toBeGreaterThan(0);
    for (const s of spawnDefaults) {
      expect(BIZ_STATUS, `unknown BusinessStatus ${s}`).toContain(s);
    }
    const sample: BusinessStatus = "stable";
    expect(BIZ_STATUS).toContain(sample);
  });
});

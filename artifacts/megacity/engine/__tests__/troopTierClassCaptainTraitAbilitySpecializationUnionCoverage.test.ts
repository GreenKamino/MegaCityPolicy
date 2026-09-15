import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TIER_DEFS,
  CLASS_DEFS,
  CAPTAIN_TRAITS,
  CAPTAIN_ABILITIES,
  SPECIALIZATIONS,
} from "@/engine/retinueData";
import type {
  TroopTier,
  TroopClassId,
  CaptainTrait,
  CaptainAbilityId,
  SpecializationPath,
} from "@/engine/retinueData";

/**
 * Drift guard: TroopTier + TroopClassId + CaptainTrait + CaptainAbilityId
 * + SpecializationPath union coverage.
 *
 *   TroopTier(6)            ↔ TIER_DEFS catalog (entry tier ids).
 *   TroopClassId(12)        ↔ CLASS_DEFS catalog (entry class ids).
 *   CaptainTrait(8)         ↔ CAPTAIN_TRAITS catalog (entry ids).
 *   CaptainAbilityId(12)    ↔ CAPTAIN_ABILITIES catalog (entry ids).
 *   SpecializationPath(4)   ↔ SPECIALIZATIONS catalog (entry ids).
 *
 *   All five catalogs are typed via the corresponding union
 *   (TS-enforced) and runtime-checked here for 1:1 coverage:
 *   every catalog id is a known literal and every literal
 *   appears as ≥1 catalog entry.
 */

const RETINUE_SRC = readFileSync(
  join(__dirname, "..", "retinueData.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const TROOP_TIER = parseUnion(RETINUE_SRC, "TroopTier");
const TROOP_CLASS = parseUnion(RETINUE_SRC, "TroopClassId");
const CAPTAIN_TRAIT_LIST = parseUnion(RETINUE_SRC, "CaptainTrait");
const CAPTAIN_ABILITY = parseUnion(RETINUE_SRC, "CaptainAbilityId");
const SPECIALIZATION = parseUnion(RETINUE_SRC, "SpecializationPath");

function assertCatalogCoversUnion<T extends { id?: string; tier?: string }>(
  catalog: readonly T[],
  union: string[],
  idField: "id" | "tier",
  label: string,
): void {
  const known = new Set(union);
  const used = new Set<string>();
  for (const row of catalog) {
    const id = row[idField] as string;
    expect(known.has(id), `unknown ${label} ${id}`).toBe(true);
    used.add(id);
  }
  expect(used.size).toBe(union.length);
  for (const lit of union) {
    expect(used.has(lit), `${label} ${lit} missing from catalog`).toBe(true);
  }
}

describe("troop tier / class / captain trait / captain ability / specialization union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(TROOP_TIER.length).toBe(6);
    expect(TROOP_CLASS.length).toBe(12);
    expect(CAPTAIN_TRAIT_LIST.length).toBe(8);
    expect(CAPTAIN_ABILITY.length).toBe(12);
    expect(SPECIALIZATION.length).toBe(4);
  });

  it("TroopTier — TIER_DEFS catalog matches union 1:1", () => {
    assertCatalogCoversUnion(TIER_DEFS, TROOP_TIER, "tier", "TroopTier");
    const sample: TroopTier = "recruit";
    expect(TROOP_TIER).toContain(sample);
  });

  it("TroopClassId — CLASS_DEFS catalog matches union 1:1", () => {
    assertCatalogCoversUnion(CLASS_DEFS, TROOP_CLASS, "id", "TroopClassId");
    const sample: TroopClassId = "infantry";
    expect(TROOP_CLASS).toContain(sample);
  });

  it("CaptainTrait — CAPTAIN_TRAITS catalog matches union 1:1", () => {
    assertCatalogCoversUnion(
      CAPTAIN_TRAITS,
      CAPTAIN_TRAIT_LIST,
      "id",
      "CaptainTrait",
    );
    const sample: CaptainTrait = "tactician";
    expect(CAPTAIN_TRAIT_LIST).toContain(sample);
  });

  it("CaptainAbilityId — CAPTAIN_ABILITIES catalog matches union 1:1", () => {
    assertCatalogCoversUnion(
      CAPTAIN_ABILITIES,
      CAPTAIN_ABILITY,
      "id",
      "CaptainAbilityId",
    );
    const sample: CaptainAbilityId = "rally_cry";
    expect(CAPTAIN_ABILITY).toContain(sample);
  });

  it("SpecializationPath — SPECIALIZATIONS catalog matches union 1:1", () => {
    assertCatalogCoversUnion(
      SPECIALIZATIONS,
      SPECIALIZATION,
      "id",
      "SpecializationPath",
    );
    const sample: SpecializationPath = "assault";
    expect(SPECIALIZATION).toContain(sample);
  });
});

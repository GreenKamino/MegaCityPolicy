import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CAPTAIN_TRAITS,
  CAPTAIN_ABILITIES,
  type CaptainTrait,
  type CaptainAbilityId,
} from "@/engine/retinueData";
import {
  UNIFORM_VARIANTS,
  SIDEARM_VARIANTS,
  type UniformId,
  type SidearmId,
} from "@/engine/wardrobe";
import { BIOMES, type SpeciesRole } from "@/engine/biomes";

/**
 * Drift guard: captain meta + wardrobe + chain action + species role.
 *
 *   CaptainTrait(8)        ↔ CAPTAIN_TRAITS[].id — 1:1, unique;
 *                            requiredTrait fields on CAPTAIN_ABILITIES
 *                            must reference a known trait.
 *   CaptainAbilityId(12)   ↔ CAPTAIN_ABILITIES[].id — 1:1, unique;
 *                            non-empty name/description/icon, positive
 *                            cooldownTicks, requiredLevel ≥ 1.
 *   UniformId(6)           ↔ UNIFORM_VARIANTS[].id — 1:1, unique;
 *                            non-empty label/description/icon.
 *   SidearmId(6)           ↔ SIDEARM_VARIANTS[].id — 1:1, unique.
 *   BusinessChainAction(5) ↔ resolveBusinessChainAction switch — every
 *                            literal must show up as a `case "..."`
 *                            branch in eventChains.ts.
 *   CorporateChainAction(4)↔ same shape, different switch.
 *   SpeciesRole(6)         ↔ BIOMES[*].dominantRoles — every union
 *                            member appears in ≥1 biome's dominant
 *                            roster (no orphan ecology tag).
 */

const RETINUE_SRC = readFileSync(join(__dirname, "..", "retinueData.ts"), "utf8");
const WARDROBE_SRC = readFileSync(join(__dirname, "..", "wardrobe.ts"), "utf8");
const EVENT_CHAINS_SRC = readFileSync(
  join(__dirname, "..", "eventChains.ts"),
  "utf8",
);
const BIOMES_SRC = readFileSync(join(__dirname, "..", "biomes.ts"), "utf8");

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const CAPTAIN_TRAIT = parseUnion(RETINUE_SRC, "CaptainTrait");
const CAPTAIN_ABILITY_ID = parseUnion(RETINUE_SRC, "CaptainAbilityId");
const UNIFORM_ID = parseUnion(WARDROBE_SRC, "UniformId");
const SIDEARM_ID = parseUnion(WARDROBE_SRC, "SidearmId");
const BUSINESS_CHAIN_ACTION = parseUnion(EVENT_CHAINS_SRC, "BusinessChainAction");
const CORPORATE_CHAIN_ACTION = parseUnion(EVENT_CHAINS_SRC, "CorporateChainAction");
const SPECIES_ROLE = parseUnion(BIOMES_SRC, "SpeciesRole");

describe("captain / wardrobe / chain action / species role union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(CAPTAIN_TRAIT.length).toBe(8);
    expect(CAPTAIN_ABILITY_ID.length).toBe(12);
    expect(UNIFORM_ID.length).toBe(6);
    expect(SIDEARM_ID.length).toBe(6);
    expect(BUSINESS_CHAIN_ACTION.length).toBe(5);
    expect(CORPORATE_CHAIN_ACTION.length).toBe(4);
    expect(SPECIES_ROLE.length).toBe(6);
  });

  it("CAPTAIN_TRAITS catalog matches CaptainTrait 1:1; abilities only require known traits", () => {
    const wantTraits = [...CAPTAIN_TRAIT].sort();
    const gotTraits = CAPTAIN_TRAITS.map((t) => t.id as string).sort();
    expect(gotTraits).toEqual(wantTraits);
    const traitIds = new Set<string>();
    for (const t of CAPTAIN_TRAITS) {
      expect(traitIds.has(t.id), `duplicate trait ${t.id}`).toBe(false);
      traitIds.add(t.id);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
    for (const a of CAPTAIN_ABILITIES) {
      if (a.requiredTrait != null) {
        expect(
          traitIds.has(a.requiredTrait),
          `${a.id} requires unknown trait ${a.requiredTrait}`,
        ).toBe(true);
      }
    }
    const sample: CaptainTrait = CAPTAIN_TRAITS[0].id;
    expect(typeof sample).toBe("string");
  });

  it("CAPTAIN_ABILITIES catalog matches CaptainAbilityId 1:1 with sane invariants", () => {
    const want = [...CAPTAIN_ABILITY_ID].sort();
    const got = CAPTAIN_ABILITIES.map((a) => a.id as string).sort();
    expect(got).toEqual(want);
    const ids = new Set<string>();
    for (const a of CAPTAIN_ABILITIES) {
      expect(ids.has(a.id), `duplicate ability ${a.id}`).toBe(false);
      ids.add(a.id);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
      expect(a.icon.length).toBeGreaterThan(0);
      expect(a.cooldownTicks).toBeGreaterThan(0);
      expect(a.requiredLevel).toBeGreaterThanOrEqual(1);
    }
    const sample: CaptainAbilityId = CAPTAIN_ABILITIES[0].id;
    expect(typeof sample).toBe("string");
  });

  it("wardrobe variants — UNIFORM_VARIANTS and SIDEARM_VARIANTS match their unions 1:1", () => {
    const wantU = [...UNIFORM_ID].sort();
    const gotU = UNIFORM_VARIANTS.map((v) => v.id as string).sort();
    expect(gotU).toEqual(wantU);
    const uIds = new Set<string>();
    for (const v of UNIFORM_VARIANTS) {
      expect(uIds.has(v.id), `duplicate uniform ${v.id}`).toBe(false);
      uIds.add(v.id);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
      expect(v.icon.length).toBeGreaterThan(0);
    }
    const wantS = [...SIDEARM_ID].sort();
    const gotS = SIDEARM_VARIANTS.map((v) => v.id as string).sort();
    expect(gotS).toEqual(wantS);
    const sIds = new Set<string>();
    for (const v of SIDEARM_VARIANTS) {
      expect(sIds.has(v.id), `duplicate sidearm ${v.id}`).toBe(false);
      sIds.add(v.id);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
      expect(v.icon.length).toBeGreaterThan(0);
    }
    const u: UniformId = UNIFORM_VARIANTS[0].id;
    const s: SidearmId = SIDEARM_VARIANTS[0].id;
    expect(typeof u).toBe("string");
    expect(typeof s).toBe("string");
  });

  it("BusinessChainAction and CorporateChainAction — every literal has a `case` branch in eventChains.ts", () => {
    for (const a of BUSINESS_CHAIN_ACTION) {
      expect(EVENT_CHAINS_SRC, `BusinessChainAction missing case "${a}"`)
        .toContain(`case "${a}"`);
    }
    for (const a of CORPORATE_CHAIN_ACTION) {
      expect(EVENT_CHAINS_SRC, `CorporateChainAction missing case "${a}"`)
        .toContain(`case "${a}"`);
    }
  });

  it("SpeciesRole — every union member appears in ≥1 BIOMES[*].dominantRoles", () => {
    const known = new Set(SPECIES_ROLE);
    const seen = new Set<string>();
    for (const def of Object.values(BIOMES)) {
      for (const r of def.dominantRoles) {
        expect(known.has(r), `unknown species role ${r}`).toBe(true);
        seen.add(r);
      }
    }
    const orphan = SPECIES_ROLE.filter((r) => !seen.has(r));
    expect(orphan, "SpeciesRole members unused in any biome").toEqual([]);
    const sample: SpeciesRole = "producer";
    expect(known.has(sample)).toBe(true);
  });
});

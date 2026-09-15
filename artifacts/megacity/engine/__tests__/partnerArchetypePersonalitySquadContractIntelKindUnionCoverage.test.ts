import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PARTNER_ARCHETYPES,
  PERSONALITY_ARCHETYPES,
} from "@/engine/partnerDynamics";
import { SQUAD_ROLES } from "@/engine/retinueData";
import type {
  PartnerArchetype,
  PersonalityArchetype,
  ContractCategory,
  IntelItemKind,
} from "@/engine/types";
import type { SquadRole } from "@/engine/retinueData";

/**
 * Drift guard: partner archetype + personality archetype + squad role
 * + contract category + intel item kind unions.
 *
 *   PartnerArchetype(8)      ↔ PARTNER_ARCHETYPES Record (TS-enforced
 *                               via Record<PartnerArchetype,…>) — runtime
 *                               check verifies every union member has
 *                               a non-empty label and flavor row.
 *   PersonalityArchetype(8)  ↔ PERSONALITY_ARCHETYPES Record (TS-enforced)
 *                               — runtime check verifies every union
 *                               member has a non-empty label/flavor row.
 *   SquadRole(5)             ↔ SQUAD_ROLES catalog — every entry id is
 *                               a known literal and every literal
 *                               appears as ≥1 entry id (1:1).
 *   ContractCategory(8)      ↔ engine/contracts.ts — every union member
 *                               appears as a `category: "..."` literal
 *                               in at least one contract template.
 *   IntelItemKind(5)         ↔ engine/intelEngine.ts — every union
 *                               member emitted as `kind: "..."` by
 *                               at least one intel-item generator,
 *                               modulo a documented orphan allowlist
 *                               {tip, secret} (kept in the union for
 *                               forward-compat with deeper intel
 *                               taxonomies; no current generator
 *                               emits them).
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const CONTRACTS_SRC = readFileSync(
  join(__dirname, "..", "contracts.ts"),
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

const PARTNER_ARCH = parseUnion(TYPES_SRC, "PartnerArchetype");
const PERSONALITY = parseUnion(TYPES_SRC, "PersonalityArchetype");
const CONTRACT_CAT = parseUnion(TYPES_SRC, "ContractCategory");
const INTEL_KIND = parseUnion(TYPES_SRC, "IntelItemKind");

const RETINUE_SRC = readFileSync(
  join(__dirname, "..", "retinueData.ts"),
  "utf8",
);
const SQUAD_ROLE_LIST = parseUnion(RETINUE_SRC, "SquadRole");

describe("partner archetype / personality / squad role / contract category / intel kind union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(PARTNER_ARCH.length).toBe(8);
    expect(PERSONALITY.length).toBe(8);
    expect(SQUAD_ROLE_LIST.length).toBe(5);
    expect(CONTRACT_CAT.length).toBe(8);
    expect(INTEL_KIND.length).toBe(5);
  });

  it("PartnerArchetype — PARTNER_ARCHETYPES Record covers union 1:1 with non-empty label + flavor", () => {
    const known = new Set(PARTNER_ARCH);
    for (const lit of PARTNER_ARCH) {
      const row = (PARTNER_ARCHETYPES as Record<string, { label: string; flavor: string }>)[lit];
      expect(row, `PARTNER_ARCHETYPES missing entry ${lit}`).toBeDefined();
      expect(typeof row.label).toBe("string");
      expect(row.label.length).toBeGreaterThan(0);
      expect(typeof row.flavor).toBe("string");
      expect(row.flavor.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PARTNER_ARCHETYPES).length).toBe(PARTNER_ARCH.length);
    const sample: PartnerArchetype = "nomad";
    expect(known.has(sample)).toBe(true);
  });

  it("PersonalityArchetype — PERSONALITY_ARCHETYPES Record covers union 1:1 with non-empty label + flavor", () => {
    const known = new Set(PERSONALITY);
    for (const lit of PERSONALITY) {
      const row = (PERSONALITY_ARCHETYPES as Record<string, { label: string; flavor: string }>)[lit];
      expect(row, `PERSONALITY_ARCHETYPES missing entry ${lit}`).toBeDefined();
      expect(typeof row.label).toBe("string");
      expect(row.label.length).toBeGreaterThan(0);
      expect(typeof row.flavor).toBe("string");
      expect(row.flavor.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PERSONALITY_ARCHETYPES).length).toBe(PERSONALITY.length);
    const sample: PersonalityArchetype = "paranoid";
    expect(known.has(sample)).toBe(true);
  });

  it("SquadRole — SQUAD_ROLES catalog matches union 1:1", () => {
    const known = new Set(SQUAD_ROLE_LIST);
    const used = new Set<string>();
    for (const r of SQUAD_ROLES) {
      expect(known.has(r.id as string), `unknown SquadRole id ${r.id}`).toBe(true);
      expect(typeof r.label).toBe("string");
      expect(r.label.length).toBeGreaterThan(0);
      used.add(r.id as string);
    }
    expect(used.size).toBe(SQUAD_ROLE_LIST.length);
    for (const lit of SQUAD_ROLE_LIST) {
      expect(used.has(lit), `SquadRole ${lit} missing from catalog`).toBe(true);
    }
    const sample: SquadRole = "assault";
    expect(known.has(sample)).toBe(true);
  });

  it("ContractCategory — every union member appears as `category: \"..\"` literal in contracts.ts", () => {
    for (const lit of CONTRACT_CAT) {
      const re = new RegExp(`category\\s*:\\s*"${lit}"`);
      expect(
        re.test(CONTRACTS_SRC),
        `ContractCategory "${lit}" never used in contracts.ts`,
      ).toBe(true);
    }
    const sample: ContractCategory = "construction";
    expect(CONTRACT_CAT).toContain(sample);
  });

  it("IntelItemKind — every union member emitted as `kind: \"..\"` in intelEngine.ts, modulo documented orphans {tip, secret}", () => {
    const KNOWN_INTEL_KIND_ORPHANS = new Set<string>(["tip", "secret"]);
    const used = new Set<string>();
    for (const lit of INTEL_KIND) {
      const re = new RegExp(`kind\\s*:\\s*"${lit}"`);
      if (re.test(INTEL_ENGINE_SRC)) used.add(lit);
    }
    const orphan = INTEL_KIND.filter((c) => !used.has(c));
    expect(
      new Set(orphan),
      "IntelItemKind orphan set drifted from documented allowlist",
    ).toEqual(KNOWN_INTEL_KIND_ORPHANS);
    const sample: IntelItemKind = "rumor";
    expect(INTEL_KIND).toContain(sample);
  });
});

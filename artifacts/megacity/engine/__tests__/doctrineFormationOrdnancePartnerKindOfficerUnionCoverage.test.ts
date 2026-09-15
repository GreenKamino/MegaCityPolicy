import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMBAT_DOCTRINES,
  FORMATIONS,
  ORDNANCE_OPTIONS,
  type DoctrineId,
  type FormationId,
  type OrdnanceId,
} from "@/engine/combatData";
import {
  OFFICER_POSITIONS,
  RANK_LABELS,
  RANK_ORDER,
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
} from "@/engine/officers";

/**
 * Drift guard: combat decision catalogs + partner kind taxonomy
 * + officer hierarchy rosters.
 *
 *   DoctrineId(14)         ↔ COMBAT_DOCTRINES[].id — 1:1, unique;
 *                            non-empty name/description; six modifier
 *                            knobs are finite numbers.
 *   FormationId(6)         ↔ FORMATIONS[].id — 1:1, unique.
 *   OrdnanceId(6)          ↔ ORDNANCE_OPTIONS[].id — 1:1, unique;
 *                            non-negative cost knobs.
 *   PartnerKind(11)        ↔ KIND_TRAIT_POOLS / KIND_MANIFESTOS in
 *                            partnerPersonality.ts (Record keyed by
 *                            PartnerKind) — keys 1:1 with the union,
 *                            every pool and manifesto list non-empty.
 *   OfficerRank(6)         ↔ RANK_LABELS Record + RANK_ORDER list —
 *                            keys 1:1 with the union, ORDER lists
 *                            every member exactly once, in the
 *                            cadet→chief_director ladder.
 *   OfficerDepartment(11)  ↔ DEPARTMENT_LABELS Record + DEPARTMENT_ORDER
 *                            list — same shape; every department
 *                            assigned to ≥1 OFFICER_POSITIONS entry
 *                            (no orphan org chart node).
 */

const COMBAT_SRC = readFileSync(join(__dirname, "..", "combatData.ts"), "utf8");
const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const PERSONALITY_SRC = readFileSync(
  join(__dirname, "..", "partnerPersonality.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const DOCTRINE_ID = parseUnion(COMBAT_SRC, "DoctrineId");
const FORMATION_ID = parseUnion(COMBAT_SRC, "FormationId");
const ORDNANCE_ID = parseUnion(COMBAT_SRC, "OrdnanceId");
const PARTNER_KIND = parseUnion(TYPES_SRC, "PartnerKind");
const OFFICER_RANK = parseUnion(TYPES_SRC, "OfficerRank");
const OFFICER_DEPARTMENT = parseUnion(TYPES_SRC, "OfficerDepartment");

// KIND_TRAIT_POOLS and KIND_MANIFESTOS are module-private Records
// keyed by PartnerKind. Their per-key shape is enforced by the
// TypeScript Record<PartnerKind,...> annotation at compile time;
// here we additionally pin source-shape (each `Record<PartnerKind, ...>`
// literal must list every union member as a top-level key) and
// non-emptiness so silent shrinking of any pool fires this guard.

describe("doctrine / formation / ordnance / partner-kind / officer hierarchy union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(DOCTRINE_ID.length).toBe(14);
    expect(FORMATION_ID.length).toBe(6);
    expect(ORDNANCE_ID.length).toBe(6);
    expect(PARTNER_KIND.length).toBe(11);
    expect(OFFICER_RANK.length).toBe(6);
    expect(OFFICER_DEPARTMENT.length).toBe(11);
  });

  it("COMBAT_DOCTRINES catalog matches DoctrineId 1:1 with finite modifier knobs", () => {
    const want = [...DOCTRINE_ID].sort();
    const got = COMBAT_DOCTRINES.map((d) => d.id as string).sort();
    expect(got).toEqual(want);
    const ids = new Set<string>();
    for (const d of COMBAT_DOCTRINES) {
      expect(ids.has(d.id), `duplicate doctrine ${d.id}`).toBe(false);
      ids.add(d.id);
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      for (const k of [
        "attackMod", "defenseMod", "casualtyMod",
        "moraleMod", "fuelCostMod", "ammoCostMod",
      ] as const) {
        const v = (d as unknown as Record<string, number>)[k];
        expect(Number.isFinite(v), `${d.id}.${k} non-finite`).toBe(true);
      }
    }
    const sample: DoctrineId = COMBAT_DOCTRINES[0].id;
    expect(typeof sample).toBe("string");
  });

  it("FORMATIONS and ORDNANCE_OPTIONS catalogs match their unions 1:1; ordnance costs non-negative", () => {
    const wantF = [...FORMATION_ID].sort();
    const gotF = FORMATIONS.map((v) => v.id as string).sort();
    expect(gotF).toEqual(wantF);
    const fIds = new Set<string>();
    for (const v of FORMATIONS) {
      expect(fIds.has(v.id), `duplicate formation ${v.id}`).toBe(false);
      fIds.add(v.id);
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
    }

    const wantO = [...ORDNANCE_ID].sort();
    const gotO = ORDNANCE_OPTIONS.map((v) => v.id as string).sort();
    expect(gotO).toEqual(wantO);
    const oIds = new Set<string>();
    for (const v of ORDNANCE_OPTIONS) {
      expect(oIds.has(v.id), `duplicate ordnance ${v.id}`).toBe(false);
      oIds.add(v.id);
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
      expect(v.ammoCost).toBeGreaterThanOrEqual(0);
      expect(v.fuelCost).toBeGreaterThanOrEqual(0);
      expect(v.moraleDamage).toBeGreaterThanOrEqual(0);
    }
    const f: FormationId = FORMATIONS[0].id;
    const o: OrdnanceId = ORDNANCE_OPTIONS[0].id;
    expect(typeof f).toBe("string");
    expect(typeof o).toBe("string");
  });

  it("PartnerKind — KIND_TRAIT_POOLS and KIND_MANIFESTOS Records list every union member as a key", () => {
    expect(PERSONALITY_SRC).toContain("Record<PartnerKind, PartnerPersonalityTrait[]>");
    expect(PERSONALITY_SRC).toContain("Record<PartnerKind, string[]>");

    function bodyAfter(marker: string): string {
      const idx = PERSONALITY_SRC.indexOf(marker);
      expect(idx, `marker ${marker} not found`).toBeGreaterThanOrEqual(0);
      // Find the opening brace then walk forward counting braces.
      const braceStart = PERSONALITY_SRC.indexOf("{", idx);
      let depth = 0;
      let i = braceStart;
      for (; i < PERSONALITY_SRC.length; i++) {
        const c = PERSONALITY_SRC[i];
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      return PERSONALITY_SRC.slice(braceStart, i + 1);
    }

    const traitBody = bodyAfter("KIND_TRAIT_POOLS");
    const manifestoBody = bodyAfter("KIND_MANIFESTOS");
    for (const k of PARTNER_KIND) {
      // Top-level key as either bare identifier or quoted, followed by `:`.
      const re = new RegExp(`(^|[\\s,{])(?:"${k}"|${k})\\s*:`, "m");
      expect(re.test(traitBody), `KIND_TRAIT_POOLS missing key ${k}`).toBe(true);
      expect(re.test(manifestoBody), `KIND_MANIFESTOS missing key ${k}`).toBe(true);
    }
  });

  it("OfficerRank — RANK_LABELS Record + RANK_ORDER list cover the union; ladder non-degenerate", () => {
    const want = [...OFFICER_RANK].sort();
    expect(Object.keys(RANK_LABELS).sort()).toEqual(want);
    expect([...RANK_ORDER].sort()).toEqual(want);
    expect(RANK_ORDER.length).toBe(OFFICER_RANK.length); // no dupes
    expect(new Set(RANK_ORDER).size).toBe(RANK_ORDER.length);
    // Pin ladder ends — top of ladder is chief_director, bottom is cadet.
    expect(RANK_ORDER[0]).toBe("cadet");
    expect(RANK_ORDER[RANK_ORDER.length - 1]).toBe("chief_director");
    for (const r of OFFICER_RANK) {
      expect(RANK_LABELS[r as keyof typeof RANK_LABELS].length).toBeGreaterThan(0);
    }
  });

  it("OfficerDepartment — Labels + Order cover the union; every department actually staffed in OFFICER_POSITIONS", () => {
    const want = [...OFFICER_DEPARTMENT].sort();
    expect(Object.keys(DEPARTMENT_LABELS).sort()).toEqual(want);
    expect([...DEPARTMENT_ORDER].sort()).toEqual(want);
    expect(new Set(DEPARTMENT_ORDER).size).toBe(DEPARTMENT_ORDER.length);
    expect(DEPARTMENT_ORDER[0]).toBe("supreme_leadership");

    const staffed = new Set<string>();
    for (const p of OFFICER_POSITIONS) {
      staffed.add(p.department);
    }
    const orphan = OFFICER_DEPARTMENT.filter((d) => !staffed.has(d));
    expect(orphan, "OfficerDepartment members with zero positions").toEqual([]);
    for (const d of OFFICER_DEPARTMENT) {
      expect(DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS].length).toBeGreaterThan(0);
    }
  });
});

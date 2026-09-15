import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TIER_DEFS,
  CLASS_DEFS,
  SQUAD_ROLES,
  type TroopTier,
  type TroopClassId,
  type SquadRole,
} from "@/engine/retinueData";

/**
 * Drift guard: retinue unions vs catalog rosters.
 *
 *   TroopTier(6)     ↔ TIER_DEFS[].tier  (1:1; rank order matches
 *                       union literal order; promotion chain
 *                       recruit→militia→…→champion intact and the
 *                       champion tier has nextTier === null).
 *
 *   TroopClassId(12) ↔ CLASS_DEFS[].id   (1:1).
 *
 *   SquadRole(5)     ↔ SQUAD_ROLES[].id  (1:1; UPPERCASE labels;
 *                       icons + descriptions non-empty).
 */

const RETINUE_SRC = readFileSync(
  join(__dirname, "..", "retinueData.ts"),
  "utf8",
);

function parseUnion(name: string): string[] {
  const m = RETINUE_SRC.match(
    new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`),
  );
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const TROOP_TIER = parseUnion("TroopTier");
const TROOP_CLASS_ID = parseUnion("TroopClassId");
const SQUAD_ROLE = parseUnion("SquadRole");

const TIER_ORDER: TroopTier[] = [
  "recruit",
  "militia",
  "enforcer",
  "veteran",
  "elite",
  "champion",
];

describe("retinue tier / class / squad-role union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(TROOP_TIER.length).toBe(6);
    expect(TROOP_CLASS_ID.length).toBe(12);
    expect(SQUAD_ROLE.length).toBe(5);
  });

  it("TIER_DEFS covers TroopTier exactly, in literal order, with strictly increasing rank/xp/promoteCost", () => {
    expect(TROOP_TIER).toEqual(TIER_ORDER);
    const tiers = TIER_DEFS.map((t) => t.tier as string);
    expect(tiers).toEqual(TIER_ORDER);
    for (let i = 0; i < TIER_DEFS.length; i++) {
      expect(TIER_DEFS[i].rank).toBe(i);
    }
    for (let i = 1; i < TIER_DEFS.length; i++) {
      expect(TIER_DEFS[i].xpRequired).toBeGreaterThan(TIER_DEFS[i - 1].xpRequired);
      expect(TIER_DEFS[i].promoteCost).toBeGreaterThan(TIER_DEFS[i - 1].promoteCost);
      expect(TIER_DEFS[i].combatMult).toBeGreaterThan(TIER_DEFS[i - 1].combatMult);
    }
  });

  it("TIER_DEFS promotion chain forms a single recruit→champion path with null terminator", () => {
    const byTier = new Map(TIER_DEFS.map((t) => [t.tier, t]));
    let cursor: TroopTier | null = "recruit";
    const visited: TroopTier[] = [];
    while (cursor !== null) {
      visited.push(cursor);
      const def = byTier.get(cursor);
      expect(def, `tier ${cursor} missing from TIER_DEFS`).toBeDefined();
      cursor = def!.nextTier;
      if (visited.length > TROOP_TIER.length + 1) break; // cycle guard
    }
    expect(visited).toEqual(TIER_ORDER);
    expect(byTier.get("champion")!.nextTier).toBeNull();
  });

  it("CLASS_DEFS ids equal TroopClassId exactly (1:1, unique, every member used)", () => {
    const ids = CLASS_DEFS.map((c) => c.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...TROOP_CLASS_ID].sort());
    for (const c of CLASS_DEFS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.icon.length).toBeGreaterThan(0);
      expect(c.recruitCost).toBeGreaterThan(0);
    }
  });

  it("SQUAD_ROLES ids equal SquadRole exactly with UPPERCASE labels and non-empty icons/descriptions", () => {
    const ids = SQUAD_ROLES.map((r) => r.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...SQUAD_ROLE].sort());
    for (const r of SQUAD_ROLES) {
      expect(r.label).toBe(r.label.toUpperCase());
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.icon.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
    }
  });

  it("type-side anchors compile", () => {
    const _t: TroopTier[] = TROOP_TIER as TroopTier[];
    const _c: TroopClassId[] = TROOP_CLASS_ID as TroopClassId[];
    const _r: SquadRole[] = SQUAD_ROLE as SquadRole[];
    expect(_t.length + _c.length + _r.length).toBe(
      TROOP_TIER.length + TROOP_CLASS_ID.length + SQUAD_ROLE.length,
    );
  });
});

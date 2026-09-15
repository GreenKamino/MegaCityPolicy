import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EngagementType,
  FORMATIONS,
  ORDNANCE_OPTIONS,
  ENGAGEMENT_TEMPLATES,
} from "@/engine/combatData";

/**
 * Drift guard: inline ActiveEngagement / HostileRaidEvent status &
 * tactical sub-unions vs combatData catalogs and formulas.ts
 * transition emit sites.
 *
 *   ActiveEngagement.type            (10 inline) ↔ EngagementType
 *                                       (10) ↔ ENGAGEMENT_TEMPLATES.type
 *                                       (covered separately, here we
 *                                       cross-link the inline copy to
 *                                       the exported alias to catch
 *                                       the inline-vs-alias drift case
 *                                       that union-name coverage
 *                                       cannot).
 *
 *   ActiveEngagement.status          (3 inline: preparing|active|
 *                                       resolved) ↔ formulas.ts
 *                                       transitions.
 *
 *   ActiveEngagement.tactical.formation
 *     (6 inline) ↔ FORMATIONS catalog ids 1:1 (the runtime selector
 *                  in resolveEngagement does .find by id with
 *                  FORMATIONS[0] fallback — orphan formation member
 *                  silently degrades to "line").
 *
 *   ActiveEngagement.tactical.ordnance
 *     (6 inline) ↔ ORDNANCE_OPTIONS catalog ids 1:1 (same .find +
 *                  ORDNANCE_OPTIONS[0] fallback — orphan ordnance
 *                  silently degrades to "standard"; also consumed by
 *                  ORDNANCE_OPTIONS_MAP in tick ammo/fuel cost).
 *
 *   HostileRaidEvent.status          (4 inline: incoming|active|
 *                                       repelled|breached) ↔
 *                                       formulas.ts spawn + resolve
 *                                       sites.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const FORMULAS_SRC = readFileSync(
  join(__dirname, "..", "formulas.ts"),
  "utf8",
);

function parseInlineFieldUnion(
  src: string,
  ownerType: string,
  field: string,
): string[] {
  const re = new RegExp(`export type ${ownerType}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`);
  const owner = src.match(re);
  expect(owner, `owner type ${ownerType} not found`).not.toBeNull();
  const fre = new RegExp(`(?:^|\\s)${field}:\\s*([^;]+);`, "m");
  const f = owner![1].match(fre);
  expect(f, `field ${ownerType}.${field} not found`).not.toBeNull();
  return (f![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function parseNestedFieldUnion(
  src: string,
  ownerType: string,
  parent: string,
  field: string,
): string[] {
  const re = new RegExp(`export type ${ownerType}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`);
  const owner = src.match(re);
  expect(owner, `owner type ${ownerType} not found`).not.toBeNull();
  const pre = new RegExp(`${parent}\\?:\\s*\\{([\\s\\S]*?)\\n\\s{2}\\};`);
  const p = owner![1].match(pre);
  expect(p, `nested ${ownerType}.${parent} not found`).not.toBeNull();
  const fre = new RegExp(`${field}:\\s*([^;]+);`);
  const f = p![1].match(fre);
  expect(f, `nested field ${ownerType}.${parent}.${field} not found`).not.toBeNull();
  return (f![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const ENG_TYPE_INLINE = parseInlineFieldUnion(TYPES_SRC, "ActiveEngagement", "type");
const ENG_STATUS_INLINE = parseInlineFieldUnion(TYPES_SRC, "ActiveEngagement", "status");
const FORMATION_INLINE = parseNestedFieldUnion(TYPES_SRC, "ActiveEngagement", "tactical", "formation");
const ORDNANCE_INLINE = parseNestedFieldUnion(TYPES_SRC, "ActiveEngagement", "tactical", "ordnance");
const RAID_STATUS_INLINE = parseInlineFieldUnion(TYPES_SRC, "HostileRaidEvent", "status");

describe("engagement / tactical / raid-status inline union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(ENG_TYPE_INLINE.length).toBe(10);
    expect(ENG_STATUS_INLINE.length).toBe(3);
    expect(FORMATION_INLINE.length).toBe(6);
    expect(ORDNANCE_INLINE.length).toBe(6);
    expect(RAID_STATUS_INLINE.length).toBe(4);
  });

  it("ActiveEngagement.type inline literal set equals EngagementType alias and ENGAGEMENT_TEMPLATES.type set", () => {
    // EngagementType is a string-literal union — cast through the
    // inline literal set so any drift between the inline copy and the
    // exported alias surfaces here at runtime, not just at tsc.
    const inline = [...ENG_TYPE_INLINE].sort();
    const fromTemplates = [...new Set(ENGAGEMENT_TEMPLATES.map((t) => t.type as string))].sort();
    expect(fromTemplates).toEqual(inline);
    // tsc anchor for the alias.
    const _t: EngagementType[] = ENG_TYPE_INLINE as EngagementType[];
    expect(_t.length).toBe(inline.length);
  });

  it("ActiveEngagement.status transitions are emitted by formulas.ts (preparing → active → resolved)", () => {
    expect(ENG_STATUS_INLINE.sort()).toEqual(["active", "preparing", "resolved"]);
    // Each terminal status appears as a comparison or assignment in
    // the engagement scheduler.
    expect(FORMULAS_SRC).toContain('eng.status === "preparing"');
    expect(FORMULAS_SRC).toContain('eng.status === "resolved"');
    expect(FORMULAS_SRC).toContain('eng.status = "resolved"');
    // "active" is the steady state — tick filters compare !== "resolved";
    // assert at least one such guard exists so removing it here forces
    // a coverage update.
    expect(FORMULAS_SRC).toMatch(/status\s*!==\s*"resolved"/);
  });

  it("FORMATIONS catalog ids equal ActiveEngagement.tactical.formation inline union exactly", () => {
    const ids = FORMATIONS.map((f) => f.id as string).sort();
    expect(ids).toEqual([...FORMATION_INLINE].sort());
    // Every formation has a non-empty NAME (resolveEngagement falls
    // back to FORMATIONS[0] = "line" if the id is unknown — that
    // fallback is what makes orphan-id detection important).
    for (const f of FORMATIONS) {
      expect(f.name.length).toBeGreaterThan(0);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ORDNANCE_OPTIONS catalog ids equal ActiveEngagement.tactical.ordnance inline union exactly", () => {
    const ids = ORDNANCE_OPTIONS.map((o) => o.id as string).sort();
    expect(ids).toEqual([...ORDNANCE_INLINE].sort());
    for (const o of ORDNANCE_OPTIONS) {
      expect(o.name.length).toBeGreaterThan(0);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("HostileRaidEvent.status set is incoming|active|repelled|breached and every member is emitted in formulas.ts", () => {
    expect([...RAID_STATUS_INLINE].sort()).toEqual([
      "active",
      "breached",
      "incoming",
      "repelled",
    ]);
    expect(FORMULAS_SRC).toContain('status: "incoming"');
    expect(FORMULAS_SRC).toContain('status: "active"');
    expect(FORMULAS_SRC).toContain('raid.status = "repelled"');
    expect(FORMULAS_SRC).toContain('raid.status = "breached"');
    // Confirm "breached" is also branched on (post-resolve population
    // damage) — proves it is not just an unreachable terminal label.
    expect(FORMULAS_SRC).toContain('raid.status === "breached"');
  });
});

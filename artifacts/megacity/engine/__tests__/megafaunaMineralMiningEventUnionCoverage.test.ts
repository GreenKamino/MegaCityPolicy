import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MEGAFAUNA_BOSSES } from "@/engine/megafaunaHunts";
import {
  MINERAL_LABELS,
  MINERAL_COLORS,
  MINING_SITES,
  MINING_EVENT_TEMPLATES,
  type MineralType,
  type MiningEventType,
} from "@/engine/miningData";
import type { MegafaunaId } from "@/engine/types";

/**
 * Drift guard: residual wildlands / mining unions vs runtime
 * catalog usage and template emissions.
 *
 *   MegafaunaId(3)            ↔ MEGAFAUNA_BOSSES Record key set
 *                                (1:1 by tsc); each boss attackTypeId
 *                                follows the `${id}_hunt` convention
 *                                consumed by strikeData / loadout.
 *
 *   MineralType(8)            ↔ MINERAL_LABELS / MINERAL_COLORS
 *                                Records (1:1 by tsc, non-empty);
 *                                MINING_SITES.resourceType usage —
 *                                every union member used by ≥1 site
 *                                (orphan = dead branch in mining UI).
 *
 *   MiningEventType(8)        ↔ MINING_EVENT_TEMPLATES.type 1:1.
 *
 *   MiningEventDef.severity   ↔ inline ("positive|neutral|negative|
 *     (4 inline)                critical") — every member used by ≥1
 *                                template (orphan = dead branch in
 *                                mining-event toast coloring).
 *                                NOTE: this is distinct from
 *                                TickEntry.severity (no "warning"
 *                                tier) and from GameEvent.severity
 *                                (no "low/medium/high" scale).
 */

const MINING_SRC = readFileSync(
  join(__dirname, "..", "miningData.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function parseInlineFieldUnion(
  src: string,
  ownerType: string,
  field: string,
): string[] {
  const re = new RegExp(`export type ${ownerType}\\s*=\\s*\\{([\\s\\S]*?)\\};`);
  const owner = src.match(re);
  expect(owner, `owner type ${ownerType} not found`).not.toBeNull();
  const fre = new RegExp(`${field}:\\s*([^;]+);`);
  const f = owner![1].match(fre);
  expect(f, `field ${ownerType}.${field} not found`).not.toBeNull();
  return (f![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const MINERAL_TYPE = parseUnion(MINING_SRC, "MineralType");
const MINING_EVENT_TYPE = parseUnion(MINING_SRC, "MiningEventType");
const MINING_EVENT_SEVERITY = parseInlineFieldUnion(
  MINING_SRC,
  "MiningEventDef",
  "severity",
);

describe("megafauna / mineral / mining-event union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(MINERAL_TYPE.length).toBe(8);
    expect(MINING_EVENT_TYPE.length).toBe(8);
    expect(MINING_EVENT_SEVERITY.length).toBe(4);
    // MegafaunaId is exposed by Record<MegafaunaId,…> only — assert
    // boss roster size as the budget pin.
    expect(Object.keys(MEGAFAUNA_BOSSES).length).toBe(3);
  });

  it("MEGAFAUNA_BOSSES entries are self-consistent and follow the `<id>_hunt` attack convention", () => {
    for (const [id, boss] of Object.entries(MEGAFAUNA_BOSSES)) {
      expect(boss.id).toBe(id);
      expect(boss.attackTypeId).toBe(`${id}_hunt`);
    }
    const expected: MegafaunaId[] = [
      "tarpit_titan",
      "ridge_tyrant",
      "glassback_whale",
    ];
    expect(Object.keys(MEGAFAUNA_BOSSES).sort()).toEqual([...expected].sort());
  });

  it("MINERAL_LABELS and MINERAL_COLORS cover MineralType exactly with non-empty values", () => {
    const want = [...MINERAL_TYPE].sort();
    expect(Object.keys(MINERAL_LABELS).sort()).toEqual(want);
    expect(Object.keys(MINERAL_COLORS).sort()).toEqual(want);
    for (const t of MINERAL_TYPE) {
      const m = t as MineralType;
      expect(MINERAL_LABELS[m].length).toBeGreaterThan(0);
      // Color is "#RRGGBB" 7 chars.
      expect(MINERAL_COLORS[m]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("MINING_SITES.resourceType values are subset of MineralType; every union member used by ≥1 site", () => {
    const known = new Set(MINERAL_TYPE);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const s of MINING_SITES) {
      expect(known.has(s.resourceType), `${s.id} unknown resourceType ${s.resourceType}`).toBe(true);
      expect(ids.has(s.id), `duplicate site id ${s.id}`).toBe(false);
      ids.add(s.id);
      used.add(s.resourceType);
    }
    const orphan = MINERAL_TYPE.filter((m) => !used.has(m));
    expect(orphan, "MineralType members unused in MINING_SITES").toEqual([]);
  });

  it("MINING_EVENT_TEMPLATES.type values are exactly MiningEventType (1:1) and severities cover the inline union", () => {
    const knownType = new Set(MINING_EVENT_TYPE);
    const knownSev = new Set(MINING_EVENT_SEVERITY);
    const usedType = new Set<string>();
    const usedSev = new Set<string>();
    for (const t of MINING_EVENT_TEMPLATES) {
      expect(knownType.has(t.type), `template emits unknown type ${t.type}`).toBe(true);
      expect(knownSev.has(t.severity), `template emits unknown severity ${t.severity}`).toBe(true);
      usedType.add(t.type);
      usedSev.add(t.severity);
    }
    expect([...usedType].sort()).toEqual([...MINING_EVENT_TYPE].sort());
    const orphanSev = MINING_EVENT_SEVERITY.filter((s) => !usedSev.has(s));
    expect(orphanSev, "MiningEventDef.severity members unused in templates").toEqual([]);
  });

  // tsc reachability anchors.
  it("type-side anchors compile", () => {
    const _m: MineralType[] = MINERAL_TYPE as MineralType[];
    const _e: MiningEventType[] = MINING_EVENT_TYPE as MiningEventType[];
    const _id: MegafaunaId[] = Object.keys(MEGAFAUNA_BOSSES) as MegafaunaId[];
    expect(_m.length + _e.length + _id.length).toBe(
      MINERAL_TYPE.length +
        MINING_EVENT_TYPE.length +
        Object.keys(MEGAFAUNA_BOSSES).length,
    );
  });
});

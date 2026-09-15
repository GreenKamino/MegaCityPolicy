import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ITEM_DEFS,
  RARITY_COLORS,
  RARITY_LABELS,
} from "@/engine/inventoryData";
import { GANGS, GANG_TYPE_LABELS } from "@/engine/gangs";
import type { EquipSlot, ItemCategory, ItemRarity } from "@/engine/inventoryData";
import type { GangType } from "@/engine/gangs";
import type { HapticIntensity } from "@/engine/haptics";

/**
 * Drift guard: ItemCategory + ItemRarity + EquipSlot + HapticIntensity
 * + GangType union coverage.
 *
 *   ItemCategory(6)     ↔ ITEM_DEFS in engine/inventoryData.ts.
 *                         Every union member used by ≥1 entry,
 *                         every emitted category a known literal.
 *
 *   ItemRarity(5)       ↔ ITEM_DEFS + RARITY_COLORS Record + RARITY_LABELS
 *                         Record (both typed Record<ItemRarity,…>).
 *                         Every union member used by ≥1 entry +
 *                         covered by both lookup Records 1:1.
 *
 *   EquipSlot(4)        ↔ ITEM_DEFS optional .equipSlot field.
 *                         Every union member used by ≥1 entry,
 *                         every emitted slot a known literal.
 *
 *   HapticIntensity(4)  ↔ engine/haptics.ts playHaptic switch.
 *                         playHaptic must accept every union
 *                         member without throwing (web fast-path).
 *
 *   GangType(5)         ↔ GANG_TYPE_LABELS Record (typed
 *                         Record<GangType,string>) + GANGS.
 *                         Record covers union 1:1; every union
 *                         member used by ≥1 gang entry.
 */

const INV_SRC = readFileSync(join(__dirname, "..", "inventoryData.ts"), "utf8");
const HAP_SRC = readFileSync(join(__dirname, "..", "haptics.ts"), "utf8");
const GANGS_SRC = readFileSync(join(__dirname, "..", "gangs.ts"), "utf8");

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const ITEM_CAT = parseUnion(INV_SRC, "ItemCategory");
const ITEM_RAR = parseUnion(INV_SRC, "ItemRarity");
const EQ_SLOT = parseUnion(INV_SRC, "EquipSlot");
const HAP_INT = parseUnion(HAP_SRC, "HapticIntensity");
const GANG_T = parseUnion(GANGS_SRC, "GangType");

describe("item-category / item-rarity / equip-slot / haptic-intensity / gang-type union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(ITEM_CAT.length).toBe(6);
    expect(ITEM_RAR.length).toBe(5);
    expect(EQ_SLOT.length).toBe(4);
    expect(HAP_INT.length).toBe(4);
    expect(GANG_T.length).toBe(5);
  });

  it("ItemCategory — every union member used by ≥1 ITEM_DEFS entry", () => {
    const used = new Set<string>();
    for (const it of ITEM_DEFS) used.add(it.category as string);
    for (const lit of ITEM_CAT) {
      expect(used.has(lit), `ItemCategory ${lit} unused in ITEM_DEFS`).toBe(
        true,
      );
    }
    for (const c of used) {
      expect(ITEM_CAT, `unknown ItemCategory ${c}`).toContain(c);
    }
    const sample: ItemCategory = "weapon";
    expect(ITEM_CAT).toContain(sample);
  });

  it("ItemRarity — RARITY_COLORS + RARITY_LABELS Records cover union 1:1 + every member used by ≥1 ITEM_DEFS entry", () => {
    expect(Object.keys(RARITY_COLORS).length).toBe(ITEM_RAR.length);
    expect(Object.keys(RARITY_LABELS).length).toBe(ITEM_RAR.length);
    for (const lit of ITEM_RAR) {
      expect(
        (RARITY_COLORS as Record<string, string>)[lit],
        `RARITY_COLORS missing ${lit}`,
      ).toBeDefined();
      expect(
        (RARITY_LABELS as Record<string, string>)[lit],
        `RARITY_LABELS missing ${lit}`,
      ).toBeDefined();
    }
    const used = new Set<string>();
    for (const it of ITEM_DEFS) used.add(it.rarity as string);
    for (const lit of ITEM_RAR) {
      expect(used.has(lit), `ItemRarity ${lit} unused in ITEM_DEFS`).toBe(true);
    }
    const sample: ItemRarity = "legendary";
    expect(ITEM_RAR).toContain(sample);
  });

  it("EquipSlot — every union member used by ≥1 ITEM_DEFS entry via .equipSlot", () => {
    const used = new Set<string>();
    for (const it of ITEM_DEFS) {
      if (it.equipSlot != null) used.add(it.equipSlot as string);
    }
    for (const lit of EQ_SLOT) {
      expect(
        used.has(lit),
        `EquipSlot ${lit} unused in ITEM_DEFS.equipSlot`,
      ).toBe(true);
    }
    for (const s of used) {
      expect(EQ_SLOT, `unknown EquipSlot ${s}`).toContain(s);
    }
    const sample: EquipSlot = "weapon";
    expect(EQ_SLOT).toContain(sample);
  });

  it("HapticIntensity — engine/haptics.ts playHaptic switch covers every union member", () => {
    const switchBlock = HAP_SRC.match(
      /export function playHaptic[\s\S]*?switch \(intensity\) \{([\s\S]*?)\n\s*\}/,
    );
    expect(switchBlock, "playHaptic switch not found").not.toBeNull();
    const cases = (switchBlock![1].match(/case "([a-zA-Z0-9_-]+)":/g) ?? []).map(
      (s) => s.replace(/case "|":/g, ""),
    );
    expect(new Set(cases).size).toBe(HAP_INT.length);
    for (const lit of HAP_INT) {
      expect(cases, `playHaptic missing case ${lit}`).toContain(lit);
    }
    const sample: HapticIntensity = "medium";
    expect(HAP_INT).toContain(sample);
  });

  it("GangType — GANG_TYPE_LABELS Record covers union 1:1 + every member used by ≥1 GANGS entry", () => {
    expect(Object.keys(GANG_TYPE_LABELS).length).toBe(GANG_T.length);
    for (const lit of GANG_T) {
      expect(
        (GANG_TYPE_LABELS as Record<string, string>)[lit],
        `GANG_TYPE_LABELS missing ${lit}`,
      ).toBeDefined();
    }
    const used = new Set<string>();
    for (const g of GANGS) used.add(g.type as string);
    for (const lit of GANG_T) {
      expect(used.has(lit), `GangType ${lit} unused in GANGS`).toBe(true);
    }
    for (const t of used) {
      expect(GANG_T, `unknown GangType ${t}`).toContain(t);
    }
    const sample: GangType = "street";
    expect(GANG_T).toContain(sample);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ITEM_DEFS,
  RARITY_COLORS,
  RARITY_LABELS,
  type ItemCategory,
  type ItemRarity,
  type EquipSlot,
} from "@/engine/inventoryData";

/**
 * Drift guard: inventory unions vs ITEM_DEFS catalog and the
 * RARITY_COLORS / RARITY_LABELS Record companions.
 *
 *   ItemCategory(6)  ↔ ITEM_DEFS.category — every member used by
 *                       ≥1 def (orphan = dead branch in inventory
 *                       filter UI).
 *
 *   ItemRarity(5)    ↔ ITEM_DEFS.rarity AND RARITY_COLORS /
 *                       RARITY_LABELS Records 1:1; tier ordering
 *                       (common→legendary) preserved.
 *
 *   EquipSlot(4)     ↔ ITEM_DEFS.equipSlot — every member used by
 *                       ≥1 equippable def (orphan = dead loadout
 *                       slot in equip UI). Note: ItemCategory and
 *                       EquipSlot share the literals "weapon" /
 *                       "armor" / "augment" but are distinct types
 *                       (gear/consumable/relic have no slot;
 *                       accessory has no category) — the test
 *                       checks them independently.
 */

const INVENTORY_SRC = readFileSync(
  join(__dirname, "..", "inventoryData.ts"),
  "utf8",
);

function parseUnion(name: string): string[] {
  const m = INVENTORY_SRC.match(
    new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`),
  );
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const ITEM_CATEGORY = parseUnion("ItemCategory");
const ITEM_RARITY = parseUnion("ItemRarity");
const EQUIP_SLOT = parseUnion("EquipSlot");

const RARITY_TIER_ORDER: ItemRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

describe("inventory union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(ITEM_CATEGORY.length).toBe(6);
    expect(ITEM_RARITY.length).toBe(5);
    expect(EQUIP_SLOT.length).toBe(4);
  });

  it("ITEM_RARITY tier order matches the union literal order (common → legendary)", () => {
    expect(ITEM_RARITY).toEqual(RARITY_TIER_ORDER);
  });

  it("RARITY_COLORS and RARITY_LABELS cover ItemRarity exactly with non-empty values", () => {
    const want = [...ITEM_RARITY].sort();
    expect(Object.keys(RARITY_COLORS).sort()).toEqual(want);
    expect(Object.keys(RARITY_LABELS).sort()).toEqual(want);
    for (const r of ITEM_RARITY) {
      const k = r as ItemRarity;
      expect(RARITY_COLORS[k]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(RARITY_LABELS[k]).toBe(r.toUpperCase());
    }
  });

  it("ITEM_DEFS.category values are subset of ItemCategory; every member used by ≥1 def", () => {
    const known = new Set(ITEM_CATEGORY);
    const used = new Set<string>();
    const ids = new Set<string>();
    for (const d of ITEM_DEFS) {
      expect(known.has(d.category), `${d.id} unknown category ${d.category}`).toBe(true);
      expect(ids.has(d.id), `duplicate item id ${d.id}`).toBe(false);
      ids.add(d.id);
      used.add(d.category);
    }
    const orphan = ITEM_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "ItemCategory members unused in ITEM_DEFS").toEqual([]);
  });

  it("ITEM_DEFS.rarity values are subset of ItemRarity; every member used by ≥1 def", () => {
    const known = new Set(ITEM_RARITY);
    const used = new Set<string>();
    for (const d of ITEM_DEFS) {
      expect(known.has(d.rarity), `${d.id} unknown rarity ${d.rarity}`).toBe(true);
      used.add(d.rarity);
    }
    const orphan = ITEM_RARITY.filter((r) => !used.has(r));
    expect(orphan, "ItemRarity members unused in ITEM_DEFS").toEqual([]);
  });

  it("ITEM_DEFS.equipSlot values are subset of EquipSlot; every member used by ≥1 equippable def", () => {
    const known = new Set(EQUIP_SLOT);
    const used = new Set<string>();
    for (const d of ITEM_DEFS) {
      if (d.equipSlot === undefined) continue;
      expect(known.has(d.equipSlot), `${d.id} unknown equipSlot ${d.equipSlot}`).toBe(true);
      used.add(d.equipSlot);
    }
    const orphan = EQUIP_SLOT.filter((s) => !used.has(s));
    expect(orphan, "EquipSlot members unused in ITEM_DEFS").toEqual([]);
  });

  it("category↔equipSlot coupling: consumables never carry a slot; weapon/armor/augment defs always do", () => {
    // Free downstream invariant. "gear" defs split between slotted
    // (e.g. visors → accessory) and unslotted (passive consumables-
    // adjacent), and "relic" defs are unslotted display items in
    // current data — so we only assert the unambiguous edges.
    for (const d of ITEM_DEFS) {
      if (d.category === "consumable") {
        expect(d.equipSlot, `${d.id} (${d.category}) must not declare an equipSlot`).toBeUndefined();
      }
      if (d.category === "weapon" || d.category === "armor" || d.category === "augment") {
        expect(d.equipSlot, `${d.id} (${d.category}) must declare an equipSlot`).toBeDefined();
      }
    }
  });

  it("type-side anchors compile", () => {
    const _c: ItemCategory[] = ITEM_CATEGORY as ItemCategory[];
    const _r: ItemRarity[] = ITEM_RARITY as ItemRarity[];
    const _s: EquipSlot[] = EQUIP_SLOT as EquipSlot[];
    expect(_c.length + _r.length + _s.length).toBe(
      ITEM_CATEGORY.length + ITEM_RARITY.length + EQUIP_SLOT.length,
    );
  });
});

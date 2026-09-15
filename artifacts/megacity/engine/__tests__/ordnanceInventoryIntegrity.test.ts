import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ORDNANCE_INVENTORY,
  ORDNANCE_CATEGORIES,
  type OrdnanceCategory,
} from "@/engine/warRoomData";

/**
 * Ordnance inventory drift guard. The pool is currently a presentation
 * surface (military.tsx UI) with no engine state consumer, but its shape
 * still needs pinning so adding a category to the union without wiring
 * the label record (or vice versa) is caught, and pool entries stay
 * coherent.
 */

const WARROOM_SRC = readFileSync(
  join(__dirname, "..", "warRoomData.ts"),
  "utf8",
);

const DECLARED_CATEGORIES: readonly OrdnanceCategory[] = [
  "small_arms",
  "heavy",
  "explosives",
  "missiles",
  "vehicles",
  "special",
];

describe("Ordnance inventory drift", () => {
  it("OrdnanceCategory union (parsed live) matches the canonical set", () => {
    const m = WARROOM_SRC.match(/export type OrdnanceCategory\s*=\s*([^;]+);/);
    expect(m).not.toBeNull();
    const fromSource = (m![1].match(/"([a-zA-Z_]+)"/g) ?? []).map((s) =>
      s.replace(/"/g, ""),
    );
    expect([...fromSource].sort()).toEqual([...DECLARED_CATEGORIES].sort());
  });

  it("ORDNANCE_CATEGORIES record has one non-empty label per union member", () => {
    expect(Object.keys(ORDNANCE_CATEGORIES).sort()).toEqual(
      [...DECLARED_CATEGORIES].sort(),
    );
    for (const cat of DECLARED_CATEGORIES) {
      expect(ORDNANCE_CATEGORIES[cat].length).toBeGreaterThan(0);
    }
  });

  it("every ORDNANCE_INVENTORY item is well-formed", () => {
    const ids = new Set<string>();
    for (const item of ORDNANCE_INVENTORY) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(
        (DECLARED_CATEGORIES as readonly string[]).includes(item.category),
      ).toBe(true);
      expect(Number.isFinite(item.quantity)).toBe(true);
      expect(item.quantity).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(item.costPerUnit)).toBe(true);
      expect(item.costPerUnit).toBeGreaterThan(0);
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
    }
  });

  it("pool size budget pin and per-category breakdown stay populated", () => {
    expect(ORDNANCE_INVENTORY.length).toBe(30);
    const counts: Record<string, number> = {};
    for (const item of ORDNANCE_INVENTORY) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    for (const cat of DECLARED_CATEGORIES) {
      // Every declared category has at least one item; otherwise the
      // category label is dead config.
      expect(counts[cat] ?? 0).toBeGreaterThan(0);
    }
  });
});

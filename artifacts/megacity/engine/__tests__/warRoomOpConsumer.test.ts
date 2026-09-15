import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WAR_ROOM_OPS,
  WAR_ROOM_OPS_MAP,
  WAR_ROOM_OPS_COUNT_BY_TYPE,
  type WarOpCategory,
} from "@/engine/warRoomData";

/**
 * War room ops drift guard. Pins:
 *   1. WarOpCategory union (10 categories) ↔ tickProcessors handler chain.
 *      Any new category added to the union without a handler branch falls
 *      through to a degenerate `else` and silently drops type-specific
 *      effects (intel/cyber/training/etc.).
 *   2. Every WAR_ROOM_OPS entry uses a category in the declared union and
 *      has a handler branch in the consumer (no orphan ops).
 *   3. defenseBonus is non-negative on every op (sole numeric reward read
 *      in formulas activeOpsBonus and most consumer branches).
 *   4. Pool size budget pin (60) and per-category breakdown stays sane
 *      (every category has at least one op, so handler branches stay live).
 *   5. WAR_ROOM_OPS_MAP is a complete and consistent index of WAR_ROOM_OPS.
 */

const TICK_SRC = readFileSync(
  join(__dirname, "..", "tickProcessors.ts"),
  "utf8",
);
const WARROOM_SRC = readFileSync(
  join(__dirname, "..", "warRoomData.ts"),
  "utf8",
);

const DECLARED_CATEGORIES: readonly WarOpCategory[] = [
  "defensive",
  "offensive",
  "intel",
  "training",
  "special",
  "logistics",
  "siege",
  "naval",
  "aerial",
  "cyber",
];

function parseHandledCategories(): Set<string> {
  // Source-derive: every literal `def.type === "<x>"` in tickProcessors.ts
  // is a handled branch.
  const handled = new Set<string>();
  const re = /def\.type\s*===\s*"([a-zA-Z_]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(TICK_SRC)) !== null) handled.add(m[1]);
  return handled;
}

describe("WarRoomOp consumer drift", () => {
  it("declared category list matches the WarOpCategory union surface", () => {
    // The union itself is parsed from source so adding/removing a member
    // without touching this test is caught.
    const m = WARROOM_SRC.match(/export type WarOpCategory\s*=\s*([^;]+);/);
    expect(m).not.toBeNull();
    const fromSource = (m![1].match(/"([a-zA-Z_]+)"/g) ?? []).map((s) =>
      s.replace(/"/g, ""),
    );
    expect([...fromSource].sort()).toEqual([...DECLARED_CATEGORIES].sort());
  });

  it("tickProcessors handler chain covers every WarOpCategory (no silent drops)", () => {
    const handled = parseHandledCategories();
    for (const cat of DECLARED_CATEGORIES) {
      expect(handled.has(cat)).toBe(true);
    }
    // Staleness sibling: no extra handler branches for categories that
    // were removed from the union.
    for (const cat of handled) {
      expect((DECLARED_CATEGORIES as readonly string[]).includes(cat)).toBe(
        true,
      );
    }
  });

  it("every WAR_ROOM_OPS entry uses a declared, handled category", () => {
    const handled = parseHandledCategories();
    for (const op of WAR_ROOM_OPS) {
      expect((DECLARED_CATEGORIES as readonly string[]).includes(op.type)).toBe(
        true,
      );
      expect(handled.has(op.type)).toBe(true);
    }
  });

  it("defenseBonus is a non-negative integer on every op", () => {
    for (const op of WAR_ROOM_OPS) {
      expect(Number.isInteger(op.defenseBonus)).toBe(true);
      expect(op.defenseBonus).toBeGreaterThanOrEqual(0);
      expect(op.cost).toBeGreaterThan(0);
      expect(op.id.length).toBeGreaterThan(0);
      expect(op.name.length).toBeGreaterThan(0);
    }
  });

  it("pool size + per-category breakdown match budget; every category has at least one op", () => {
    expect(WAR_ROOM_OPS.length).toBe(60);
    for (const cat of DECLARED_CATEGORIES) {
      const n = WAR_ROOM_OPS_COUNT_BY_TYPE[cat] ?? 0;
      expect(n).toBeGreaterThan(0);
    }
    const sum = Object.values(WAR_ROOM_OPS_COUNT_BY_TYPE).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sum).toBe(WAR_ROOM_OPS.length);
  });

  it("WAR_ROOM_OPS_MAP is a faithful index (no missing, no extras, no dupes)", () => {
    const ids = WAR_ROOM_OPS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(WAR_ROOM_OPS_MAP).sort()).toEqual([...ids].sort());
    for (const op of WAR_ROOM_OPS) {
      expect(WAR_ROOM_OPS_MAP[op.id]).toBe(op);
    }
  });
});

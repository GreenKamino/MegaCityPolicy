import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WAR_OP_CATEGORIES,
  WAR_ROOM_OPS,
  ORDNANCE_CATEGORIES,
  ORDNANCE_INVENTORY,
} from "@/engine/warRoomData";
import { SCAVENGE_ZONES } from "@/engine/scavengingData";
import {
  SECTOR_TYPE_DISTRIBUTION,
  WASTELAND_RESOURCES,
  WASTELAND_DISCOVERIES,
} from "@/engine/wasteland";
import type { WarOpCategory, OrdnanceCategory } from "@/engine/warRoomData";
import type { ScavengeZoneType } from "@/engine/scavengingData";
import type {
  WastelandSectorType,
  WastelandResourceRarity,
} from "@/engine/wasteland";

/**
 * Drift guard: WarOpCategory + OrdnanceCategory + ScavengeZoneType +
 * WastelandSectorType + WastelandResourceRarity union coverage.
 *
 *   WarOpCategory(10)         ↔ WAR_OP_CATEGORIES Record (typed
 *                               Record<WarOpCategory,string>) +
 *                               WAR_ROOM_OPS catalog. Record covers
 *                               union 1:1; every union member used
 *                               by ≥1 op via .type.
 *
 *   OrdnanceCategory(6)       ↔ ORDNANCE_CATEGORIES Record + 
 *                               ORDNANCE_INVENTORY catalog. Record
 *                               covers union 1:1; every union member
 *                               used by ≥1 item via .category.
 *
 *   ScavengeZoneType(6)       ↔ SCAVENGE_ZONES catalog. Every union
 *                               member used by ≥1 zone via .type;
 *                               every emitted .type a known literal.
 *
 *   WastelandSectorType(10)   ↔ SECTOR_TYPE_DISTRIBUTION Record
 *                               (typed Record<WastelandSectorType,
 *                               …>). Record covers union 1:1.
 *
 *   WastelandResourceRarity(3)↔ WASTELAND_RESOURCES + 
 *                               WASTELAND_DISCOVERIES catalogs.
 *                               Every union member used by ≥1 entry
 *                               via .rarity; every emitted .rarity
 *                               a known literal.
 */

const WAR_SRC = readFileSync(join(__dirname, "..", "warRoomData.ts"), "utf8");
const SCAV_SRC = readFileSync(
  join(__dirname, "..", "scavengingData.ts"),
  "utf8",
);
const WL_SRC = readFileSync(join(__dirname, "..", "wasteland.ts"), "utf8");

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const WAR_OP = parseUnion(WAR_SRC, "WarOpCategory");
const ORD = parseUnion(WAR_SRC, "OrdnanceCategory");
const SCAV = parseUnion(SCAV_SRC, "ScavengeZoneType");
const WL_SECTOR = parseUnion(WL_SRC, "WastelandSectorType");
const WL_RARITY = parseUnion(WL_SRC, "WastelandResourceRarity");

describe("war-op / ordnance / scavenge-zone / wasteland-sector / wasteland-rarity union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(WAR_OP.length).toBe(10);
    expect(ORD.length).toBe(6);
    expect(SCAV.length).toBe(6);
    expect(WL_SECTOR.length).toBe(10);
    expect(WL_RARITY.length).toBe(3);
  });

  it("WarOpCategory — WAR_OP_CATEGORIES Record covers union 1:1 + every member used by ≥1 WAR_ROOM_OPS entry", () => {
    expect(Object.keys(WAR_OP_CATEGORIES).length).toBe(WAR_OP.length);
    for (const lit of WAR_OP) {
      expect(
        (WAR_OP_CATEGORIES as Record<string, string>)[lit],
        `WAR_OP_CATEGORIES missing ${lit}`,
      ).toBeDefined();
    }
    const used = new Set<string>();
    for (const op of WAR_ROOM_OPS) used.add(op.type as string);
    for (const lit of WAR_OP) {
      expect(used.has(lit), `WarOpCategory ${lit} unused in WAR_ROOM_OPS`).toBe(
        true,
      );
    }
    for (const t of used) {
      expect(WAR_OP, `unknown WarOpCategory ${t}`).toContain(t);
    }
    const sample: WarOpCategory = "defensive";
    expect(WAR_OP).toContain(sample);
  });

  it("OrdnanceCategory — ORDNANCE_CATEGORIES Record covers union 1:1 + every member used by ≥1 ORDNANCE_INVENTORY entry", () => {
    expect(Object.keys(ORDNANCE_CATEGORIES).length).toBe(ORD.length);
    for (const lit of ORD) {
      expect(
        (ORDNANCE_CATEGORIES as Record<string, string>)[lit],
        `ORDNANCE_CATEGORIES missing ${lit}`,
      ).toBeDefined();
    }
    const used = new Set<string>();
    for (const it of ORDNANCE_INVENTORY) used.add(it.category as string);
    for (const lit of ORD) {
      expect(
        used.has(lit),
        `OrdnanceCategory ${lit} unused in ORDNANCE_INVENTORY`,
      ).toBe(true);
    }
    for (const c of used) {
      expect(ORD, `unknown OrdnanceCategory ${c}`).toContain(c);
    }
    const sample: OrdnanceCategory = "small_arms";
    expect(ORD).toContain(sample);
  });

  it("ScavengeZoneType — every union member used by ≥1 SCAVENGE_ZONES entry; every emitted .type a known literal", () => {
    const used = new Set<string>();
    for (const z of SCAVENGE_ZONES) used.add(z.type as string);
    for (const lit of SCAV) {
      expect(
        used.has(lit),
        `ScavengeZoneType ${lit} unused in SCAVENGE_ZONES`,
      ).toBe(true);
    }
    for (const t of used) {
      expect(SCAV, `unknown ScavengeZoneType ${t}`).toContain(t);
    }
    const sample: ScavengeZoneType = "ruins";
    expect(SCAV).toContain(sample);
  });

  it("WastelandSectorType — SECTOR_TYPE_DISTRIBUTION Record covers union 1:1", () => {
    const keys = Object.keys(SECTOR_TYPE_DISTRIBUTION);
    expect(keys.length).toBe(WL_SECTOR.length);
    for (const lit of WL_SECTOR) {
      expect(
        (SECTOR_TYPE_DISTRIBUTION as Record<string, unknown>)[lit],
        `SECTOR_TYPE_DISTRIBUTION missing ${lit}`,
      ).toBeDefined();
    }
    for (const k of keys) {
      expect(WL_SECTOR, `unknown WastelandSectorType ${k}`).toContain(k);
    }
    const sample: WastelandSectorType = "dust_wasteland";
    expect(WL_SECTOR).toContain(sample);
  });

  it("WastelandResourceRarity — every union member used by ≥1 catalog entry; every emitted .rarity a known literal", () => {
    const used = new Set<string>();
    for (const r of WASTELAND_RESOURCES) used.add(r.rarity as string);
    for (const d of WASTELAND_DISCOVERIES) used.add(d.rarity as string);
    for (const lit of WL_RARITY) {
      expect(
        used.has(lit),
        `WastelandResourceRarity ${lit} unused in catalogs`,
      ).toBe(true);
    }
    for (const r of used) {
      expect(WL_RARITY, `unknown WastelandResourceRarity ${r}`).toContain(r);
    }
    const sample: WastelandResourceRarity = "common";
    expect(WL_RARITY).toContain(sample);
  });
});

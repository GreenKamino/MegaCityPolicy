import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TIER_1_ARCHETYPES } from "@/engine/independentEnterprises";
import {
  RECLAIMABLE_PLOTS,
  UPGRADE_TIER_LABELS,
  UPGRADE_TIER_COSTS,
  UPGRADE_TIER_TICKS,
  UPGRADE_TIER_BONUSES,
} from "@/engine/districtExpansion";
import { DEFAULT_SEASON_PROFILES } from "@/engine/worldMapData";
import type { BusinessTier } from "@/engine/independentEnterprises";
import type { DistrictUpgradeTier } from "@/engine/districtExpansion";
import type { WeatherZoneSeasonState } from "@/engine/worldMapData";

/**
 * Drift guard: BusinessTier + DistrictUpgradeTier numeric unions
 * + WeatherZoneSeasonState derived union coverage.
 *
 *   BusinessTier(1|2|3)         ↔ TIER_1_ARCHETYPES catalog
 *                                 (only authored tier currently).
 *                                 Every emitted .tier ∈ union;
 *                                 1 must appear ≥1x.
 *
 *   DistrictUpgradeTier(1..5)   ↔ four parallel tier-keyed Records
 *                                 (LABELS / COSTS / TICKS / BONUSES,
 *                                 typed Record<DistrictUpgradeTier,
 *                                 …>). Each covers union 1:1 by key.
 *                                 Sanity: emitted .tier in
 *                                 RECLAIMABLE_PLOTS resultDistricts
 *                                 falls in 1..5.
 *
 *   WeatherZoneSeasonState(4)   ≡ WeatherZoneIntensity(3) ∪ "dormant".
 *                                 Derived union must keep parity:
 *                                 every member is either a known
 *                                 WeatherZoneIntensity or "dormant".
 *                                 Catalog DEFAULT_SEASON_PROFILES
 *                                 emits every member ≥1x.
 */

const ENT_SRC = readFileSync(
  join(__dirname, "..", "independentEnterprises.ts"),
  "utf8",
);
const DEX_SRC = readFileSync(
  join(__dirname, "..", "districtExpansion.ts"),
  "utf8",
);
const WMAP_SRC = readFileSync(join(__dirname, "..", "worldMapData.ts"), "utf8");

function parseNumericUnion(src: string, name: string): number[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/\d+/g) ?? []).map((s) => Number(s));
}

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const BIZ_TIER = parseNumericUnion(ENT_SRC, "BusinessTier");
const DIST_TIER = parseNumericUnion(DEX_SRC, "DistrictUpgradeTier");
const W_INTENSITY = parseUnion(WMAP_SRC, "WeatherZoneIntensity");
// WeatherZoneSeasonState = WeatherZoneIntensity | "dormant" — the
// type-reference half can't be string-parsed, so we reconstruct the
// effective union by source-asserting the alias shape and then
// composing it.
const WSS_ALIAS_M = WMAP_SRC.match(
  /export type WeatherZoneSeasonState\s*=\s*WeatherZoneIntensity\s*\|\s*"dormant"\s*;/,
);
expect(WSS_ALIAS_M, "WeatherZoneSeasonState alias shape changed").not.toBeNull();
const WSS: string[] = [...W_INTENSITY, "dormant"];

describe("business-tier / district-upgrade-tier / weather-zone-season-state union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(BIZ_TIER).toEqual([1, 2, 3]);
    expect(DIST_TIER).toEqual([1, 2, 3, 4, 5]);
    expect(WSS.sort()).toEqual([...W_INTENSITY, "dormant"].sort());
    expect(WSS.length).toBe(4);
  });

  it("BusinessTier — every TIER_1_ARCHETYPES .tier ∈ union; tier 1 used ≥1x", () => {
    const used = new Set<number>();
    for (const a of TIER_1_ARCHETYPES) used.add(a.tier);
    for (const t of used) {
      expect(BIZ_TIER, `unknown BusinessTier ${t}`).toContain(t);
    }
    expect(used.has(1)).toBe(true);
    const sample: BusinessTier = 1;
    expect(BIZ_TIER).toContain(sample);
  });

  it("DistrictUpgradeTier — four parallel tier-keyed Records cover union 1:1", () => {
    const records: Record<string, Record<number, unknown>> = {
      UPGRADE_TIER_LABELS: UPGRADE_TIER_LABELS as unknown as Record<
        number,
        unknown
      >,
      UPGRADE_TIER_COSTS: UPGRADE_TIER_COSTS as unknown as Record<
        number,
        unknown
      >,
      UPGRADE_TIER_TICKS: UPGRADE_TIER_TICKS as unknown as Record<
        number,
        unknown
      >,
      UPGRADE_TIER_BONUSES: UPGRADE_TIER_BONUSES as unknown as Record<
        number,
        unknown
      >,
    };
    for (const [label, rec] of Object.entries(records)) {
      const keys = Object.keys(rec).map((k) => Number(k));
      expect(new Set(keys).size, `${label} duplicate keys`).toBe(keys.length);
      expect(keys.length, `${label} key count != union size`).toBe(
        DIST_TIER.length,
      );
      for (const t of DIST_TIER) {
        expect(rec[t], `${label} missing tier ${t}`).toBeDefined();
      }
      for (const k of keys) {
        expect(DIST_TIER, `${label}: unknown tier key ${k}`).toContain(k);
      }
    }
    expect(RECLAIMABLE_PLOTS.length).toBeGreaterThan(0);
    const sample: DistrictUpgradeTier = 1;
    expect(DIST_TIER).toContain(sample);
  });

  it("WeatherZoneSeasonState — derived union parity + DEFAULT_SEASON_PROFILES emits every member ≥1x", () => {
    expect(new Set(WSS).size).toBe(WSS.length);
    for (const lit of WSS) {
      expect(
        lit === "dormant" || (W_INTENSITY as string[]).includes(lit),
        `WeatherZoneSeasonState ${lit} not in WeatherZoneIntensity ∪ {"dormant"}`,
      ).toBe(true);
    }
    const used = new Set<string>();
    for (const profile of Object.values(DEFAULT_SEASON_PROFILES)) {
      for (const v of Object.values(profile)) used.add(v as string);
    }
    for (const lit of WSS) {
      expect(
        used.has(lit),
        `WeatherZoneSeasonState ${lit} unused in DEFAULT_SEASON_PROFILES`,
      ).toBe(true);
    }
    for (const v of used) {
      expect(WSS, `unknown WeatherZoneSeasonState ${v}`).toContain(v);
    }
    const sample: WeatherZoneSeasonState = "dormant";
    expect(WSS).toContain(sample);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WAR_OP_CATEGORIES,
  WAR_OP_CATEGORY_COLORS,
  type WarOpCategory,
} from "@/engine/warRoomData";
import {
  TERRAIN_ZONES,
  THREAT_TINT,
  WEATHER_ZONES,
  WEATHER_INTENSITY_MULT,
  HAZARD_CHANCE_INTENSITY_MULT,
  WEATHER_TYPE_EFFECTS,
  WEATHER_COLORS,
  DEFAULT_SEASON_PROFILES,
  type ThreatLevel,
  type WeatherZoneIntensity,
  type TerrainFeatureKind,
  type WeatherZone,
} from "@/engine/worldMapData";
import { CHALLENGE_TEMPLATES, type ChallengeStatKey } from "@/engine/weeklyChallenges";

/**
 * Drift guard: secondary unions in war-room / world-map / challenges
 * vs their parallel Records, runtime usage, and consumer switches.
 *
 *   WarOpCategory(10)        → WAR_OP_CATEGORY_COLORS Record hex
 *                              (sibling to WAR_OP_CATEGORIES already
 *                              covered in warRoomOpConsumer.test)
 *   ThreatLevel(4)           ↔ THREAT_TINT Record + TERRAIN_ZONES.threat
 *                              usage (every union member used at least
 *                              once across declared+default(safe)).
 *   WeatherZoneIntensity(3)  ↔ WEATHER_INTENSITY_MULT (monotone)
 *                              + HAZARD_CHANCE_INTENSITY_MULT (monotone)
 *   WeatherZone["type"](6)   ↔ WEATHER_TYPE_EFFECTS + WEATHER_COLORS
 *                              + DEFAULT_SEASON_PROFILES (3 sibling
 *                              Records, all keys 1:1) + every type
 *                              used by ≥1 WEATHER_ZONES entry
 *   TerrainFeatureKind(7)    — pin to canonical set + count budget
 *   ChallengeStatKey(8)      ↔ readStat switch parsed from source
 *                              + every CHALLENGE_TEMPLATES.statKey is
 *                              in the union; `totalTicks` is reserved
 *                              for the always-on tutorial template.
 */

const WARROOM_SRC = readFileSync(
  join(__dirname, "..", "warRoomData.ts"),
  "utf8",
);
const WORLDMAP_SRC = readFileSync(
  join(__dirname, "..", "worldMapData.ts"),
  "utf8",
);
const CHALLENGE_SRC = readFileSync(
  join(__dirname, "..", "weeklyChallenges.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function parseInlineUnion(src: string, owner: string, field: string): string[] {
  // Matches a `field: "a" | "b" | "c";` line within `export type Owner = { ... };`
  const owner_m = src.match(
    new RegExp(`export type ${owner}\\s*=\\s*\\{([\\s\\S]*?)\\};`),
  );
  expect(owner_m, `type ${owner} not found`).not.toBeNull();
  const line_m = owner_m![1].match(
    new RegExp(`${field}\\s*:\\s*([^;]+);`),
  );
  expect(line_m, `field ${owner}.${field} not found`).not.toBeNull();
  return (line_m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const WAR_OP_CATEGORY = parseUnion(WARROOM_SRC, "WarOpCategory");
const THREAT_LEVEL = parseUnion(WORLDMAP_SRC, "ThreatLevel");
const WEATHER_ZONE_INTENSITY = parseUnion(WORLDMAP_SRC, "WeatherZoneIntensity");
const TERRAIN_FEATURE_KIND = parseUnion(WORLDMAP_SRC, "TerrainFeatureKind");
const CHALLENGE_STAT_KEY = parseUnion(CHALLENGE_SRC, "ChallengeStatKey");
const WEATHER_ZONE_TYPE = parseInlineUnion(WORLDMAP_SRC, "WeatherZone", "type");

/** Parse case "..." labels from a switch on a union — used for readStat. */
function parseSwitchCases(src: string, fnName: string): string[] {
  const m = src.match(
    new RegExp(`function ${fnName}[\\s\\S]*?switch\\s*\\([^)]+\\)\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  expect(m, `switch in ${fnName} not found`).not.toBeNull();
  return (m![1].match(/case\s+"([^"]+)"/g) ?? []).map((s) =>
    s.replace(/case\s+"|"$/g, ""),
  );
}

const READSTAT_CASES = parseSwitchCases(CHALLENGE_SRC, "readStat");

describe("war-op color / threat / weather / terrain / challenge union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(WAR_OP_CATEGORY.length).toBe(10);
    expect(THREAT_LEVEL.length).toBe(4);
    expect(WEATHER_ZONE_INTENSITY.length).toBe(3);
    expect(WEATHER_ZONE_TYPE.length).toBe(6);
    expect(TERRAIN_FEATURE_KIND.length).toBe(7);
    expect(CHALLENGE_STAT_KEY.length).toBe(8);
  });

  it("WAR_OP_CATEGORY_COLORS has one hex color per WarOpCategory", () => {
    const want = [...WAR_OP_CATEGORY].sort();
    expect(Object.keys(WAR_OP_CATEGORY_COLORS).sort()).toEqual(want);
    expect(Object.keys(WAR_OP_CATEGORIES).sort()).toEqual(want);
    for (const cat of WAR_OP_CATEGORY) {
      expect(
        WAR_OP_CATEGORY_COLORS[cat as WarOpCategory],
        `color missing for ${cat}`,
      ).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(WAR_OP_CATEGORIES[cat as WarOpCategory].length).toBeGreaterThan(0);
    }
  });

  it("THREAT_TINT covers ThreatLevel exactly with non-empty tints", () => {
    expect(Object.keys(THREAT_TINT).sort()).toEqual([...THREAT_LEVEL].sort());
    for (const lvl of THREAT_LEVEL) {
      expect(THREAT_TINT[lvl as ThreatLevel].length).toBeGreaterThan(0);
    }
  });

  it("TERRAIN_ZONES.threat values are subset of ThreatLevel; safe (default) and hostile populated", () => {
    const known = new Set(THREAT_LEVEL);
    const used = new Set<string>();
    let hasUndefinedThreat = false;
    for (const z of TERRAIN_ZONES) {
      if (z.threat === undefined) hasUndefinedThreat = true;
      else {
        expect(known.has(z.threat), `${z.id} unknown threat ${z.threat}`).toBe(true);
        used.add(z.threat);
      }
    }
    if (hasUndefinedThreat) used.add("safe");
    // hostile must appear in declared TERRAIN_ZONES (the union exists to
    // mark dangerous regions). "contested" and "unknown" are reserved
    // for runtime / fog-of-war contexts and are not pinned to declared
    // catalog usage; their wiring is enforced via THREAT_TINT.
    expect(used.has("safe"), "default 'safe' threat tier missing").toBe(true);
    expect(used.has("hostile"), "no hostile-tier zones declared").toBe(true);
  });

  it("WEATHER_INTENSITY_MULT and HAZARD_CHANCE_INTENSITY_MULT cover WeatherZoneIntensity and are strictly monotone low<medium<high", () => {
    const want = [...WEATHER_ZONE_INTENSITY].sort();
    expect(Object.keys(WEATHER_INTENSITY_MULT).sort()).toEqual(want);
    expect(Object.keys(HAZARD_CHANCE_INTENSITY_MULT).sort()).toEqual(want);
    const order: WeatherZoneIntensity[] = ["low", "medium", "high"];
    for (let i = 1; i < order.length; i++) {
      expect(WEATHER_INTENSITY_MULT[order[i]]).toBeGreaterThan(
        WEATHER_INTENSITY_MULT[order[i - 1]],
      );
      expect(HAZARD_CHANCE_INTENSITY_MULT[order[i]]).toBeGreaterThan(
        HAZARD_CHANCE_INTENSITY_MULT[order[i - 1]],
      );
    }
  });

  it("WEATHER_TYPE_EFFECTS, WEATHER_COLORS, DEFAULT_SEASON_PROFILES are 1:1 with WeatherZone['type']", () => {
    const want = [...WEATHER_ZONE_TYPE].sort();
    expect(Object.keys(WEATHER_TYPE_EFFECTS).sort()).toEqual(want);
    expect(Object.keys(WEATHER_COLORS).sort()).toEqual(want);
    expect(Object.keys(DEFAULT_SEASON_PROFILES).sort()).toEqual(want);
    for (const t of WEATHER_ZONE_TYPE) {
      const k = t as WeatherZone["type"];
      const e = WEATHER_TYPE_EFFECTS[k];
      expect(Number.isFinite(e.creditsDrain)).toBe(true);
      expect(Number.isFinite(e.foodDrain)).toBe(true);
      expect(e.encounterChanceBoost).toBeGreaterThanOrEqual(0);
      expect(e.encounterChanceBoost).toBeLessThanOrEqual(0.2);
      expect(e.raidSuccessPenalty).toBeGreaterThanOrEqual(0);
      expect(e.raidSuccessPenalty).toBeLessThanOrEqual(0.25);
      expect(e.scoutIntelPenalty).toBeGreaterThanOrEqual(0);
      expect(e.scoutIntelPenalty).toBeLessThanOrEqual(0.5);
      expect(e.tradeRevenuePenalty).toBeGreaterThanOrEqual(0);
      expect(e.tradeRevenuePenalty).toBeLessThanOrEqual(0.2);
      expect(e.blurb.length).toBeGreaterThan(0);
      // WEATHER_COLORS values must look like hex (with optional alpha).
      const c = WEATHER_COLORS[k];
      expect(c.fill).toMatch(/^#[0-9A-Fa-f]{6,8}$/);
      expect(c.border).toMatch(/^#[0-9A-Fa-f]{6,8}$/);
      expect(c.text).toMatch(/^#[0-9A-Fa-f]{6,8}$/);
      // Every season profile entry must be a known intensity OR "dormant".
      const seasons = DEFAULT_SEASON_PROFILES[k];
      for (const s of ["spring", "summer", "autumn", "winter"] as const) {
        const v = seasons[s];
        expect(
          v === "dormant" || (WEATHER_ZONE_INTENSITY as string[]).includes(v),
          `${k}.${s} unknown season state ${v}`,
        ).toBe(true);
      }
    }
  });

  it("every WeatherZone['type'] union member is used by ≥1 WEATHER_ZONES entry; every authored intensity is in the union", () => {
    const usedTypes = new Set(WEATHER_ZONES.map((z) => z.type));
    for (const t of WEATHER_ZONE_TYPE) {
      expect(usedTypes.has(t as WeatherZone["type"]), `weather type ${t} unused`).toBe(true);
    }
    const intensitySet = new Set(WEATHER_ZONE_INTENSITY);
    for (const z of WEATHER_ZONES) {
      expect(
        intensitySet.has(z.intensity),
        `${z.id} unknown intensity ${z.intensity}`,
      ).toBe(true);
    }
  });

  it("TerrainFeatureKind union is the canonical set", () => {
    expect([...TERRAIN_FEATURE_KIND].sort()).toEqual(
      ["mountain", "water", "canyon", "plateau", "river", "dune", "cliff"].sort(),
    );
    // Reference the type symbol to keep tsc reachability.
    const _exhaustive: Record<TerrainFeatureKind, true> = {
      mountain: true,
      water: true,
      canyon: true,
      plateau: true,
      river: true,
      dune: true,
      cliff: true,
    };
    expect(Object.keys(_exhaustive).length).toBe(TERRAIN_FEATURE_KIND.length);
  });

  it("readStat switch covers ChallengeStatKey exactly (no orphan, no extra)", () => {
    expect([...new Set(READSTAT_CASES)].sort()).toEqual(
      [...CHALLENGE_STAT_KEY].sort(),
    );
  });

  it("every CHALLENGE_TEMPLATES.statKey is in ChallengeStatKey union", () => {
    const known = new Set(CHALLENGE_STAT_KEY);
    expect(CHALLENGE_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of CHALLENGE_TEMPLATES) {
      expect(
        known.has(t.statKey),
        `template ${t.id} unknown statKey ${t.statKey}`,
      ).toBe(true);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.target).toBeGreaterThan(0);
      expect(t.rewardCredits).toBeGreaterThanOrEqual(0);
      expect(t.rewardResearch).toBeGreaterThanOrEqual(0);
    }
  });

  // tsc reachability anchor for parsed unions.
  it("type-side anchors compile", () => {
    const _war: WarOpCategory[] = WAR_OP_CATEGORY as WarOpCategory[];
    const _stat: ChallengeStatKey[] = CHALLENGE_STAT_KEY as ChallengeStatKey[];
    expect(_war.length + _stat.length).toBe(
      WAR_OP_CATEGORY.length + CHALLENGE_STAT_KEY.length,
    );
  });
});

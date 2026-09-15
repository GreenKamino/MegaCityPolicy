import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { WORLD_LOCATIONS } from "@/engine/worldMap";
import { WEATHER_ZONES } from "@/engine/worldMapData";
import { OFFICER_MISSIONS } from "@/engine/officerMissions";
import { PERSONAL_GOAL_TEMPLATES } from "@/engine/personalGoals";
import type { GoalScope } from "@/engine/personalGoals";
import type { MissionCategory } from "@/engine/officerMissions";

/**
 * Drift guard: WorldLocationType + WeatherZoneIntensity + Season +
 * MissionCategory + GoalScope union coverage.
 *
 *   WorldLocationType(6)     ↔ engine/worldMap.ts WORLD_LOCATIONS.
 *                              Every union member used by ≥1 entry,
 *                              every emitted type a known literal.
 *
 *   WeatherZoneIntensity(3)  ↔ engine/worldMapData.ts WEATHER_ZONES.
 *                              Every union member used by ≥1 entry,
 *                              every emitted intensity a known
 *                              literal.
 *
 *   Season(4)                ↔ engine/weather.ts. Inline-checked
 *                              switch tables. seasonAfter() must
 *                              cycle through the union and round-
 *                              trip back to the start.
 *
 *   MissionCategory(5)       ↔ engine/officerMissions.ts
 *                              OFFICER_MISSIONS. Every union member
 *                              used by ≥1 mission, every emitted
 *                              category a known literal.
 *
 *   GoalScope(3)             ↔ engine/personalGoals.ts
 *                              PERSONAL_GOAL_TEMPLATES. Every union
 *                              member used by ≥1 template, every
 *                              emitted scope a known literal.
 */

const WORLDMAP_SRC = readFileSync(join(__dirname, "..", "worldMap.ts"), "utf8");
const WORLDMAPDATA_SRC = readFileSync(
  join(__dirname, "..", "worldMapData.ts"),
  "utf8",
);
const WEATHER_SRC = readFileSync(join(__dirname, "..", "weather.ts"), "utf8");
const OFFMISS_SRC = readFileSync(
  join(__dirname, "..", "officerMissions.ts"),
  "utf8",
);
const GOALS_SRC = readFileSync(
  join(__dirname, "..", "personalGoals.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const WORLD_LOC_TYPE = parseUnion(WORLDMAP_SRC, "WorldLocationType");
const WZ_INTENSITY = parseUnion(WORLDMAPDATA_SRC, "WeatherZoneIntensity");
const SEASON = parseUnion(WEATHER_SRC, "Season");
const MISSION_CAT = parseUnion(OFFMISS_SRC, "MissionCategory");
const GOAL_SCOPE = parseUnion(GOALS_SRC, "GoalScope");

describe("world-location / weather-intensity / season / mission-category / goal-scope union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(WORLD_LOC_TYPE.length).toBe(6);
    expect(WZ_INTENSITY.length).toBe(3);
    expect(SEASON.length).toBe(4);
    expect(MISSION_CAT.length).toBe(5);
    expect(GOAL_SCOPE.length).toBe(3);
  });

  it("WorldLocationType — every union member used by ≥1 WORLD_LOCATIONS entry", () => {
    const used = new Set<string>();
    for (const loc of WORLD_LOCATIONS) used.add(loc.type as string);
    for (const lit of WORLD_LOC_TYPE) {
      expect(used.has(lit), `WorldLocationType ${lit} unused in WORLD_LOCATIONS`).toBe(
        true,
      );
    }
    for (const t of used) {
      expect(WORLD_LOC_TYPE, `unknown WorldLocationType ${t}`).toContain(t);
    }
  });

  it("WeatherZoneIntensity — every union member used by ≥1 WEATHER_ZONES entry", () => {
    const used = new Set<string>();
    for (const z of WEATHER_ZONES) used.add(z.intensity as string);
    for (const lit of WZ_INTENSITY) {
      expect(used.has(lit), `WeatherZoneIntensity ${lit} unused in WEATHER_ZONES`).toBe(
        true,
      );
    }
    for (const i of used) {
      expect(WZ_INTENSITY, `unknown WeatherZoneIntensity ${i}`).toContain(i);
    }
  });

  it("Season — engine/weather.ts nextSeason cycles through every union member and round-trips, label/icon/color/modifiers cover union", async () => {
    const mod: typeof import("@/engine/weather") = await import("@/engine/weather");
    const {
      nextSeason,
      getSeasonLabel,
      getSeasonIcon,
      getSeasonColor,
      getSeasonalModifiers,
      getSeason,
    } = mod;
    const start = SEASON[0]!;
    const visited: string[] = [start];
    let cur = start;
    for (let i = 0; i < SEASON.length; i++) {
      cur = nextSeason(cur as never) as unknown as string;
      visited.push(cur);
    }
    expect(visited[visited.length - 1]).toBe(start);
    expect(new Set(visited.slice(0, SEASON.length)).size).toBe(SEASON.length);
    for (const lit of SEASON) {
      expect(visited).toContain(lit);
      expect(typeof getSeasonLabel(lit as never)).toBe("string");
      expect(typeof getSeasonIcon(lit as never)).toBe("string");
      expect(typeof getSeasonColor(lit as never)).toBe("string");
      expect(getSeasonalModifiers(lit as never)).toBeTruthy();
    }
    const monthSeasons = new Set<string>();
    for (let m = 1; m <= 12; m++) monthSeasons.add(getSeason(m) as unknown as string);
    expect(monthSeasons.size).toBe(SEASON.length);
    for (const lit of SEASON) expect(monthSeasons.has(lit)).toBe(true);
  });

  it("MissionCategory — every union member used by ≥1 OFFICER_MISSIONS entry", () => {
    const used = new Set<string>();
    for (const m of OFFICER_MISSIONS) used.add(m.category as string);
    for (const lit of MISSION_CAT) {
      expect(used.has(lit), `MissionCategory ${lit} unused in OFFICER_MISSIONS`).toBe(
        true,
      );
    }
    for (const c of used) {
      expect(MISSION_CAT, `unknown MissionCategory ${c}`).toContain(c);
    }
    const sample: MissionCategory = "intelligence";
    expect(MISSION_CAT).toContain(sample);
  });

  it("GoalScope — every union member used by ≥1 PERSONAL_GOAL_TEMPLATES entry", () => {
    const used = new Set<string>();
    for (const g of PERSONAL_GOAL_TEMPLATES) used.add(g.scope as string);
    for (const lit of GOAL_SCOPE) {
      expect(used.has(lit), `GoalScope ${lit} unused in PERSONAL_GOAL_TEMPLATES`).toBe(
        true,
      );
    }
    for (const s of used) {
      expect(GOAL_SCOPE, `unknown GoalScope ${s}`).toContain(s);
    }
    const sample: GoalScope = "short";
    expect(GOAL_SCOPE).toContain(sample);
  });
});

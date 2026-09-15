import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WORLD_LOCATIONS,
  type WorldLocationType,
} from "@/engine/worldMap";
import type { WildlandsProjectStatus } from "@/engine/types";
import type { Trend, RoleTrend } from "@/engine/wildlandsAggregates";

/**
 * Drift guard: residual world-map / wildlands / aggregate unions vs
 * runtime catalog usage and conditional-assignment expressions.
 *
 *   WorldLocationType(6)        ↔ WORLD_LOCATIONS.type usage. Every
 *                                  union member must be used by ≥1
 *                                  declared location (orphan kind =
 *                                  dead branch in pin/legend code).
 *
 *   WildlandsProjectStatus(2)   ↔ runtime status assignments parsed
 *                                  from wildlandsProjects.ts: both
 *                                  "active" and "completed" must be
 *                                  emitted; nothing else.
 *
 *   Trend(3) / RoleTrend(3)     ↔ assignment ternaries parsed from
 *                                  wildlandsAggregates.ts: every
 *                                  union member appears in the
 *                                  emitted literal set.
 *
 *   Sanity: Trend === RoleTrend value-wise (the two are kept as
 *   separate type aliases for documentation; their literal sets must
 *   stay equal so consumers can't drift).
 */

const WORLDMAP_SRC = readFileSync(
  join(__dirname, "..", "worldMap.ts"),
  "utf8",
);
const WILDLANDS_PROJECTS_SRC = readFileSync(
  join(__dirname, "..", "wildlandsProjects.ts"),
  "utf8",
);
const WILDLANDS_AGGS_SRC = readFileSync(
  join(__dirname, "..", "wildlandsAggregates.ts"),
  "utf8",
);
const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const WORLD_LOCATION_TYPE = parseUnion(WORLDMAP_SRC, "WorldLocationType");
const WILDLANDS_PROJECT_STATUS = parseUnion(TYPES_SRC, "WildlandsProjectStatus");
const TREND = parseUnion(WILDLANDS_AGGS_SRC, "Trend");
const ROLE_TREND = parseUnion(WILDLANDS_AGGS_SRC, "RoleTrend");

describe("world-location / wildlands-status / trend union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(WORLD_LOCATION_TYPE.length).toBe(6);
    expect(WILDLANDS_PROJECT_STATUS.length).toBe(2);
    expect(TREND.length).toBe(3);
    expect(ROLE_TREND.length).toBe(3);
  });

  it("WORLD_LOCATIONS.type values are subset of WorldLocationType; every union member used by ≥1 entry", () => {
    const known = new Set(WORLD_LOCATION_TYPE);
    const used = new Set<string>();
    for (const loc of WORLD_LOCATIONS) {
      expect(known.has(loc.type), `${loc.id} unknown type ${loc.type}`).toBe(true);
      used.add(loc.type);
    }
    const orphan = WORLD_LOCATION_TYPE.filter((t) => !used.has(t));
    expect(orphan, "WorldLocationType members unused in WORLD_LOCATIONS").toEqual([]);
    // Single anchor: there must be exactly one player_city.
    expect(
      WORLD_LOCATIONS.filter((l) => l.type === "player_city").length,
    ).toBe(1);
  });

  it("wildlandsProjects.ts emits exactly the WildlandsProjectStatus union members; both are used", () => {
    const statuses = new Set(
      (WILDLANDS_PROJECTS_SRC.match(/status:\s*"([a-z]+)"/g) ?? []).map(
        (s) => s.match(/"([^"]+)"/)![1],
      ),
    );
    const known = new Set(WILDLANDS_PROJECT_STATUS);
    for (const s of statuses) {
      expect(known.has(s), `wildlandsProjects emits unknown status ${s}`).toBe(true);
    }
    for (const u of known) {
      expect(statuses.has(u), `WildlandsProjectStatus ${u} never emitted`).toBe(true);
    }
  });

  it("Trend and RoleTrend ternary assignments in wildlandsAggregates emit every union member", () => {
    // const trend: Trend = delta > 5 ? "up" : delta < -5 ? "down" : "flat";
    const trendLine = WILDLANDS_AGGS_SRC.match(
      /:\s*Trend\s*=\s*([^;]+);/,
    );
    expect(trendLine, "Trend ternary not found").not.toBeNull();
    const trendEmitted = new Set(
      (trendLine![1].match(/"([a-z]+)"/g) ?? []).map(
        (s) => s.replace(/"/g, ""),
      ),
    );
    expect([...trendEmitted].sort()).toEqual([...TREND].sort());

    // const trendFor = (val: number): RoleTrend => val > 0.5 ? "up" : val < -0.5 ? "down" : "flat";
    const roleLine = WILDLANDS_AGGS_SRC.match(
      /\):\s*RoleTrend\s*=>\s*([^;]+);/,
    );
    expect(roleLine, "RoleTrend ternary not found").not.toBeNull();
    const roleEmitted = new Set(
      (roleLine![1].match(/"([a-z]+)"/g) ?? []).map(
        (s) => s.replace(/"/g, ""),
      ),
    );
    expect([...roleEmitted].sort()).toEqual([...ROLE_TREND].sort());
  });

  it("Trend and RoleTrend literal sets are equal (kept distinct for documentation only)", () => {
    expect([...TREND].sort()).toEqual([...ROLE_TREND].sort());
  });

  // tsc reachability anchors for parsed-only unions.
  it("type-side anchors compile", () => {
    const _wlt: WorldLocationType[] = WORLD_LOCATION_TYPE as WorldLocationType[];
    const _wps: WildlandsProjectStatus[] = WILDLANDS_PROJECT_STATUS as WildlandsProjectStatus[];
    const _t: Trend[] = TREND as Trend[];
    const _rt: RoleTrend[] = ROLE_TREND as RoleTrend[];
    expect(_wlt.length + _wps.length + _t.length + _rt.length).toBe(
      WORLD_LOCATION_TYPE.length +
        WILDLANDS_PROJECT_STATUS.length +
        TREND.length +
        ROLE_TREND.length,
    );
  });
});

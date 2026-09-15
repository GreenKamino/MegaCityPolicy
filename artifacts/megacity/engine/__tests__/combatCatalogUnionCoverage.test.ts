import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMBAT_DOCTRINES,
  FORMATIONS,
  ORDNANCE_OPTIONS,
  ENGAGEMENT_TYPE_LABELS,
  ENGAGEMENT_TYPE_COLORS,
  ZONE_STATUS_COLORS,
} from "@/engine/combatData";

/**
 * Drift guard: combat catalog union coverage.
 *
 * engine/combatData.ts exports five string unions and several
 * adjacent catalogs:
 *
 *   DoctrineId      14 members  →  COMBAT_DOCTRINES[]   ids
 *   FormationId      6 members  →  FORMATIONS[]         ids
 *   OrdnanceId       6 members  →  ORDNANCE_OPTIONS[]   ids
 *   EngagementType  10 members  →  ENGAGEMENT_TEMPLATES type literals
 *                                  +  ENGAGEMENT_TYPE_LABELS / COLORS
 *   ZoneStatus       5 members  →  ZONE_STATUS_COLORS keys
 *                                  +  ZONE_TERRITORIES status literals
 *
 * The Record<...> tables (LABELS / COLORS) are caught by tsc when
 * the union shifts. The plain arrays are NOT — adding a doctrine /
 * formation / ordnance to the union without extending the catalog
 * (or vice versa) silently breaks pickers and dropdowns. Adding an
 * EngagementType used by no template makes that engagement
 * unreachable through normal play.
 *
 * All sides parsed live from source so neither half of any check
 * can be mocked into compliance.
 */

const SRC = readFileSync(
  join(__dirname, "..", "combatData.ts"),
  "utf8",
);

function parseUnion(name: string): string[] {
  const m = SRC.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z_]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function extractArrayBlock(name: string): string {
  const m = SRC.match(
    new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)^\\];`, "m"),
  );
  expect(m, `array ${name} not found`).not.toBeNull();
  return m![1];
}

function literalsFor(block: string, field: string): string[] {
  const out: string[] = [];
  for (const m of block.matchAll(new RegExp(`${field}:\\s*"([a-zA-Z_]+)"`, "g"))) {
    out.push(m[1]);
  }
  return out;
}

const DOCTRINE_IDS = parseUnion("DoctrineId");
const FORMATION_IDS = parseUnion("FormationId");
const ORDNANCE_IDS = parseUnion("OrdnanceId");
const ENGAGEMENT_TYPES = parseUnion("EngagementType");
const ZONE_STATUSES = parseUnion("ZoneStatus");

describe("combat catalog union coverage drift guard", () => {
  it("each combatData union has the expected member count", () => {
    expect(DOCTRINE_IDS.length).toBe(14);
    expect(FORMATION_IDS.length).toBe(6);
    expect(ORDNANCE_IDS.length).toBe(6);
    expect(ENGAGEMENT_TYPES.length).toBe(10);
    expect(ZONE_STATUSES.length).toBe(5);
  });

  it("COMBAT_DOCTRINES catalog ids equal the DoctrineId union exactly", () => {
    const ids = COMBAT_DOCTRINES.map((d) => d.id);
    expect([...ids].sort()).toEqual([...DOCTRINE_IDS].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("FORMATIONS catalog ids equal the FormationId union exactly", () => {
    const ids = FORMATIONS.map((f) => f.id);
    expect([...ids].sort()).toEqual([...FORMATION_IDS].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ORDNANCE_OPTIONS catalog ids equal the OrdnanceId union exactly", () => {
    const ids = ORDNANCE_OPTIONS.map((o) => o.id);
    expect([...ids].sort()).toEqual([...ORDNANCE_IDS].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ENGAGEMENT_TYPE_LABELS and ENGAGEMENT_TYPE_COLORS cover EngagementType exactly", () => {
    expect(Object.keys(ENGAGEMENT_TYPE_LABELS).sort()).toEqual(
      [...ENGAGEMENT_TYPES].sort(),
    );
    expect(Object.keys(ENGAGEMENT_TYPE_COLORS).sort()).toEqual(
      [...ENGAGEMENT_TYPES].sort(),
    );
    // Non-empty labels and colors.
    for (const t of ENGAGEMENT_TYPES) {
      const k = t as keyof typeof ENGAGEMENT_TYPE_LABELS;
      expect(ENGAGEMENT_TYPE_LABELS[k].length).toBeGreaterThan(0);
      expect(ENGAGEMENT_TYPE_COLORS[k].length).toBeGreaterThan(0);
    }
  });

  it("ZONE_STATUS_COLORS covers ZoneStatus exactly", () => {
    expect(Object.keys(ZONE_STATUS_COLORS).sort()).toEqual(
      [...ZONE_STATUSES].sort(),
    );
  });

  it("every EngagementType union member is used by ≥1 ENGAGEMENT_TEMPLATES entry", () => {
    const block = extractArrayBlock("ENGAGEMENT_TEMPLATES");
    const used = new Set(literalsFor(block, "type"));
    const missing = ENGAGEMENT_TYPES.filter((t) => !used.has(t));
    expect(missing).toEqual([]);
    // Staleness sibling: no orphan literal used in templates is
    // outside the current union.
    const unionSet = new Set(ENGAGEMENT_TYPES);
    const orphans = literalsFor(block, "type").filter(
      (t) => !unionSet.has(t),
    );
    expect(orphans).toEqual([]);
  });

  it("every ZoneStatus union member is used by ≥1 ZONE_TERRITORIES entry, except documented unused", () => {
    // Documented allowlist: ZoneStatus members that exist in the
    // union but no ZONE_TERRITORIES entry initializes to. They are
    // still reachable via runtime mutation of zone.status — the
    // guard tracks them so a future cleanup either uses them or
    // removes them deliberately.
    const KNOWN_UNUSED_BY_INITIAL_TERRITORIES: readonly string[] = [
      // "devastated" is set by combat-resolution code paths
      // (e.g. zone destruction flows) but no ZONE_TERRITORIES seed
      // starts in this state. Exists to support post-battle
      // transitions, not initial setup.
      "devastated",
    ];

    // Staleness sibling: every documented allowlist entry must
    // still be in the union — otherwise the comment is stale.
    const unionSet = new Set(ZONE_STATUSES);
    const staleAllow = KNOWN_UNUSED_BY_INITIAL_TERRITORIES.filter(
      (s) => !unionSet.has(s),
    );
    expect(staleAllow, "allowlist refers to removed union members").toEqual(
      [],
    );

    const block = extractArrayBlock("ZONE_TERRITORIES");
    const used = new Set(literalsFor(block, "status"));
    const allowed = new Set(KNOWN_UNUSED_BY_INITIAL_TERRITORIES);
    const missing = ZONE_STATUSES.filter(
      (s) => !used.has(s) && !allowed.has(s),
    );
    expect(missing).toEqual([]);

    // Orphan check: every literal used in territories is in the union.
    const orphans = literalsFor(block, "status").filter(
      (s) => !unionSet.has(s),
    );
    expect(orphans).toEqual([]);
  });

  it("ENGAGEMENT_TEMPLATES catalog count is pinned (budget)", () => {
    const block = extractArrayBlock("ENGAGEMENT_TEMPLATES");
    const entries = (block.match(/^  \{/gm) ?? []).length;
    expect(entries).toBe(18);
  });
});

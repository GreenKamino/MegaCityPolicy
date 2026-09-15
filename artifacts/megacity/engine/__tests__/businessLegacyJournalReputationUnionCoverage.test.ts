import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TIER_1_ARCHETYPES,
  VICE_ARCHETYPE_IDS,
  MAX_BUSINESSES,
  ANNIVERSARY_YEARS,
  type BusinessCategory,
  type BusinessStatus,
} from "@/engine/independentEnterprises";
import {
  LEGACY_BONUSES,
  ECOLOGICAL_LEGACY_BONUSES,
  LEGACY_TIERS,
  type LegacyBonusId,
  type EcologicalLegacyBonusId,
} from "@/engine/prestige";

/**
 * Drift guard: business / legacy / journal / reputation unions vs
 * catalogs and consumer fields.
 *
 *   BusinessCategory       14 ↔ TIER_1_ARCHETYPES.category usage
 *                                  (no Record; orphan category =
 *                                  dead spawn weight bucket)
 *   BusinessStatus          4 ↔ runtime status assignments parsed
 *                                  from independentEnterprises.ts
 *
 *   LegacyBonusId          10 ↔ LEGACY_BONUSES array.id values 1:1
 *   EcologicalLegacyBonusId 5 ↔ ECOLOGICAL_LEGACY_BONUSES array.id
 *                                  values 1:1
 *   LEGACY_TIERS           10 — monotone minLP, unique tier ints,
 *                                  hex colors
 *
 *   ReputationAxis          5 ↔ CommanderReputation field shape
 *                                  (parse type literal: every axis
 *                                  has a numeric field)
 *
 *   JournalEntryKind        4 ↔ JournalSeverity 4 — pin counts;
 *                                  emitted-kinds union check via
 *                                  parsing the source.
 */

const PRESTIGE_SRC = readFileSync(
  join(__dirname, "..", "prestige.ts"),
  "utf8",
);
const POLITICS_SRC = readFileSync(
  join(__dirname, "..", "politicsData.ts"),
  "utf8",
);
const BUSINESS_SRC = readFileSync(
  join(__dirname, "..", "independentEnterprises.ts"),
  "utf8",
);
const JOURNAL_SRC = readFileSync(
  join(__dirname, "..", "personalJournal.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const BUSINESS_CATEGORY = parseUnion(BUSINESS_SRC, "BusinessCategory");
const BUSINESS_STATUS = parseUnion(BUSINESS_SRC, "BusinessStatus");
const LEGACY_BONUS_ID = parseUnion(PRESTIGE_SRC, "LegacyBonusId");
const ECOLOGICAL_LEGACY_BONUS_ID = parseUnion(
  PRESTIGE_SRC,
  "EcologicalLegacyBonusId",
);
const REPUTATION_AXIS = parseUnion(POLITICS_SRC, "ReputationAxis");
const JOURNAL_KIND = parseUnion(JOURNAL_SRC, "JournalEntryKind");
const JOURNAL_SEVERITY = parseUnion(JOURNAL_SRC, "JournalSeverity");

/** Find every `status: "literal"` token assigned in the business module. */
function parseAssignedStatuses(): Set<string> {
  const matches = BUSINESS_SRC.match(/status:\s*"([a-z_]+)"/g) ?? [];
  return new Set(
    matches.map((m) => m.match(/"([^"]+)"/)![1]),
  );
}

const BUSINESS_STATUSES_ASSIGNED = parseAssignedStatuses();

describe("business / legacy / journal / reputation union coverage drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(BUSINESS_CATEGORY.length).toBe(14);
    expect(BUSINESS_STATUS.length).toBe(4);
    expect(LEGACY_BONUS_ID.length).toBe(10);
    expect(ECOLOGICAL_LEGACY_BONUS_ID.length).toBe(5);
    expect(REPUTATION_AXIS.length).toBe(5);
    expect(JOURNAL_KIND.length).toBe(4);
    expect(JOURNAL_SEVERITY.length).toBe(4);
  });

  it("catalog and budget constants are pinned", () => {
    expect(TIER_1_ARCHETYPES.length).toBe(80);
    expect(LEGACY_BONUSES.length).toBe(10);
    expect(ECOLOGICAL_LEGACY_BONUSES.length).toBe(5);
    expect(LEGACY_TIERS.length).toBe(10);
    expect(MAX_BUSINESSES).toBe(1500);
    expect(ANNIVERSARY_YEARS).toEqual([10, 25, 50]);
    expect(VICE_ARCHETYPE_IDS.size).toBeGreaterThan(0);
  });

  it("every BusinessCategory union member is used by ≥1 TIER_1_ARCHETYPES entry; no orphan", () => {
    const known = new Set(BUSINESS_CATEGORY);
    const used = new Set(TIER_1_ARCHETYPES.map((a) => a.category));
    const orphan = [...known].filter((c) => !used.has(c as BusinessCategory));
    expect(orphan, "BusinessCategory members with no archetypes").toEqual([]);
    for (const a of TIER_1_ARCHETYPES) {
      expect(known.has(a.category), `${a.id} unknown category ${a.category}`).toBe(true);
    }
  });

  it("TIER_1_ARCHETYPES ids are unique with non-empty displayName and finite weights/sensitivities", () => {
    const ids = TIER_1_ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of TIER_1_ARCHETYPES) {
      expect(a.displayName.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(a.tier);
      expect(a.weight).toBeGreaterThan(0);
      expect(Number.isFinite(a.weight)).toBe(true);
      expect(a.baseEmployees).toBeGreaterThanOrEqual(0);
      expect(a.minPopulation).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(a.closureSensitivity.crime)).toBe(true);
      expect(Number.isFinite(a.closureSensitivity.unrest)).toBe(true);
      expect(Number.isFinite(a.closureSensitivity.happiness)).toBe(true);
    }
    // VICE_ARCHETYPE_IDS must reference real archetypes.
    const idSet = new Set(ids);
    for (const v of VICE_ARCHETYPE_IDS) {
      expect(idSet.has(v), `VICE_ARCHETYPE_IDS references unknown ${v}`).toBe(true);
    }
  });

  it("every assigned status: \"...\" literal in independentEnterprises is in BusinessStatus union", () => {
    const known = new Set(BUSINESS_STATUS);
    const unknown = [...BUSINESS_STATUSES_ASSIGNED].filter((s) => !known.has(s));
    expect(unknown, "status assignments not in BusinessStatus union").toEqual([]);
    // The runtime spawn path only assigns "stable"; the rest are
    // engine-derived. Pin that "stable" is at least one of the
    // assigned literals so the obvious init can't silently drift.
    expect(BUSINESS_STATUSES_ASSIGNED.has("stable")).toBe(true);
  });

  it("LEGACY_BONUSES.id list equals LegacyBonusId union exactly with shape sanity", () => {
    const ids = LEGACY_BONUSES.map((b) => b.id).sort();
    expect(ids).toEqual([...LEGACY_BONUS_ID].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of LEGACY_BONUSES) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.maxTier).toBeGreaterThan(0);
      expect(b.costPerTier.length).toBe(b.maxTier);
      expect(b.effectPerTier.length).toBe(b.maxTier);
      // Costs must be strictly increasing (later tiers cost more).
      for (let i = 1; i < b.costPerTier.length; i++) {
        expect(
          b.costPerTier[i],
          `${b.id} cost tier ${i} not greater than tier ${i - 1}`,
        ).toBeGreaterThan(b.costPerTier[i - 1]);
      }
    }
  });

  it("ECOLOGICAL_LEGACY_BONUSES.id list equals EcologicalLegacyBonusId union exactly with shape sanity", () => {
    const ids = ECOLOGICAL_LEGACY_BONUSES.map((b) => b.id).sort();
    expect(ids).toEqual([...ECOLOGICAL_LEGACY_BONUS_ID].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of ECOLOGICAL_LEGACY_BONUSES) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.maxTier).toBeGreaterThan(0);
      expect(b.costPerTier.length).toBe(b.maxTier);
      expect(b.effectPerTier.length).toBe(b.maxTier);
    }
    // Sanity: union ID strings retained as compile-time citizens.
    const _exhaustive: Record<EcologicalLegacyBonusId, true> = {
      seeded_biomes: true,
      starting_livestock: true,
      tamed_cohort: true,
      gene_archive: true,
      druid_envoy: true,
    };
    expect(Object.keys(_exhaustive).sort()).toEqual([...ECOLOGICAL_LEGACY_BONUS_ID].sort());
  });

  it("LEGACY_TIERS are monotone-by-minLP with unique tier ints and hex colors", () => {
    expect(LEGACY_TIERS.length).toBe(10);
    const tierInts = LEGACY_TIERS.map((t) => t.tier);
    expect(new Set(tierInts).size).toBe(tierInts.length);
    for (let i = 1; i < LEGACY_TIERS.length; i++) {
      expect(
        LEGACY_TIERS[i].minLP,
        `tier ${LEGACY_TIERS[i].tier} minLP not greater than tier ${LEGACY_TIERS[i - 1].tier}`,
      ).toBeGreaterThan(LEGACY_TIERS[i - 1].minLP);
    }
    for (const t of LEGACY_TIERS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("CommanderReputation type literal in politicsData declares a numeric field for every ReputationAxis", () => {
    // CommanderReputation = { mercy: number; fear: number; ... title: string }
    const m = POLITICS_SRC.match(
      /export type CommanderReputation\s*=\s*\{([\s\S]*?)\};/,
    );
    expect(m, "CommanderReputation type not found").not.toBeNull();
    const body = m![1];
    for (const axis of REPUTATION_AXIS) {
      expect(
        body,
        `CommanderReputation missing axis ${axis}`,
      ).toMatch(new RegExp(`\\b${axis}\\s*:\\s*number`));
    }
  });

  it("JournalEntryKind and JournalSeverity tokens cover the documented sets exactly", () => {
    expect([...JOURNAL_KIND].sort()).toEqual(
      ["event", "message", "strike", "world"].sort(),
    );
    expect([...JOURNAL_SEVERITY].sort()).toEqual(
      ["critical", "high", "low", "normal"].sort(),
    );
  });

  it("LEGACY_BONUSES has no overlapping ids with ECOLOGICAL_LEGACY_BONUSES (separate purchase tracks)", () => {
    const a = new Set<string>(LEGACY_BONUSES.map((b) => b.id));
    const b = new Set<string>(ECOLOGICAL_LEGACY_BONUSES.map((b) => b.id));
    const overlap = [...a].filter((id) => b.has(id));
    expect(overlap, "legacy bonus id collision between tracks").toEqual([]);
  });

  // Reference unused imports so tsc keeps the type-side wired.
  it("type-side anchors compile (tsc reachability)", () => {
    const _bonusIds: LegacyBonusId[] = LEGACY_BONUSES.map((b) => b.id);
    expect(_bonusIds.length).toBe(LEGACY_BONUS_ID.length);
  });
});

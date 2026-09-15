import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  IDEOLOGIES,
  CITIZEN_PSYCHOLOGIES,
  BANNED_CONTENT_LIST,
  BB_EDICTS,
} from "@/engine/addons/bigBrother";
import { SD_EDICTS } from "@/engine/addons/sixthDay";
import {
  AUGMENTS,
  AUGMENT_CATEGORIES,
  AUGMENT_MAP,
} from "@/engine/augments";
import { EDICTS, ALL_EDICTS } from "@/engine/edicts";

/**
 * Drift guard: Big Brother addon + augments + edicts catalog union coverage.
 *
 *   IdeologyType        8 → IDEOLOGIES catalog (id field is union-typed
 *                            but COMPLETENESS is not enforced by tsc)
 *   PsychProfile        8 → CITIZEN_PSYCHOLOGIES catalog (same)
 *   CensorshipLevel     4 → declared but no second catalog source —
 *                            count pinned only
 *   PropagandaChannel   6 → declared, no catalog — count pinned only
 *   AugmentCategory    10 → AUGMENTS (100 entries) + AUGMENT_CATEGORIES
 *                            array {id,label} (id typed, completeness not)
 *
 *   EDICTS catalog is a plain array of EdictDef. The edicts screen
 *   merges ALL_EDICTS = EDICTS + BB_EDICTS + SD_EDICTS; an id
 *   collision across the three sources silently overrides one with
 *   the other in lookups (getEdictById uses Array.find).
 *
 * All sides parsed live from source. Counts pinned for budget.
 */

const BB_SRC = readFileSync(
  join(__dirname, "..", "addons", "bigBrother.ts"),
  "utf8",
);
const AUGMENTS_SRC = readFileSync(
  join(__dirname, "..", "augments.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const IDEOLOGY_TYPES = parseUnion(BB_SRC, "IdeologyType");
const PSYCH_PROFILES = parseUnion(BB_SRC, "PsychProfile");
const CENSORSHIP_LEVELS = parseUnion(BB_SRC, "CensorshipLevel");
const PROPAGANDA_CHANNELS = parseUnion(BB_SRC, "PropagandaChannel");
const AUGMENT_CATS = parseUnion(AUGMENTS_SRC, "AugmentCategory");

describe("Big Brother / augments / edicts catalog union coverage drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(IDEOLOGY_TYPES.length).toBe(8);
    expect(PSYCH_PROFILES.length).toBe(8);
    expect(CENSORSHIP_LEVELS.length).toBe(4);
    expect(PROPAGANDA_CHANNELS.length).toBe(6);
    expect(AUGMENT_CATS.length).toBe(10);
  });

  it("catalog sizes are pinned (budget)", () => {
    expect(IDEOLOGIES.length).toBe(8);
    expect(CITIZEN_PSYCHOLOGIES.length).toBe(8);
    expect(BANNED_CONTENT_LIST.length).toBe(12);
    expect(AUGMENTS.length).toBe(100);
    // Task #529 added accelerated_training_doctrine (100 → 102 count
    // includes the earlier catalog growth pinned here).
    expect(EDICTS.length).toBe(102);
    expect(BB_EDICTS.length).toBe(10);
    expect(SD_EDICTS.length).toBe(20);
    expect(ALL_EDICTS.length).toBe(EDICTS.length + BB_EDICTS.length + SD_EDICTS.length);
  });

  it("IDEOLOGIES catalog ids equal IdeologyType union exactly (1:1, no dupes)", () => {
    const ids = IDEOLOGIES.map((i) => i.id);
    expect([...ids].sort()).toEqual([...IDEOLOGY_TYPES].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of IDEOLOGIES) {
      expect(i.name.length).toBeGreaterThan(0);
      expect(i.description.length).toBeGreaterThan(0);
    }
  });

  it("CITIZEN_PSYCHOLOGIES catalog ids equal PsychProfile union exactly; percentOfPop in [0,1] and sums ~ 1", () => {
    const ids = CITIZEN_PSYCHOLOGIES.map((p) => p.id);
    expect([...ids].sort()).toEqual([...PSYCH_PROFILES].sort());
    expect(new Set(ids).size).toBe(ids.length);
    let sum = 0;
    for (const p of CITIZEN_PSYCHOLOGIES) {
      expect(p.percentOfPop).toBeGreaterThanOrEqual(0);
      expect(p.percentOfPop).toBeLessThanOrEqual(1);
      sum += p.percentOfPop;
    }
    // Lore distribution should sum to ~100% (allow small rounding slack).
    expect(Math.abs(sum - 1)).toBeLessThan(0.01);
  });

  it("BANNED_CONTENT_LIST ids are unique with non-empty fields", () => {
    const ids = BANNED_CONTENT_LIST.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BANNED_CONTENT_LIST) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
    }
  });

  it("AUGMENT_CATEGORIES ids equal AugmentCategory exactly with non-empty labels", () => {
    const ids = AUGMENT_CATEGORIES.map((c) => c.id);
    expect([...ids].sort()).toEqual([...AUGMENT_CATS].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of AUGMENT_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("every AugmentCategory union member is used by ≥1 AUGMENTS entry", () => {
    const used = new Set(AUGMENTS.map((a) => a.category));
    const missing = AUGMENT_CATS.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(AUGMENT_CATS);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("AUGMENTS ids are unique and AUGMENT_MAP indexes every entry", () => {
    const ids = AUGMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of AUGMENTS) {
      expect(AUGMENT_MAP[a.id], `AUGMENT_MAP missing ${a.id}`).toBe(a);
    }
    expect(Object.keys(AUGMENT_MAP).length).toBe(AUGMENTS.length);
  });

  it("ALL_EDICTS ids are unique across base + addon catalogs (no silent override)", () => {
    // EDICTS, BB_EDICTS, SD_EDICTS all merge into ALL_EDICTS; getEdictById
    // returns the FIRST match, so duplicate ids silently shadow each other.
    const ids = ALL_EDICTS.map((e) => e.id);
    const seen = new Map<string, number>();
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(dupes, "duplicate edict ids across base+addon catalogs").toEqual(
      [],
    );
  });

  it("EDICTS, BB_EDICTS, SD_EDICTS each have unique ids within their own catalog", () => {
    for (const [name, list] of [
      ["EDICTS", EDICTS],
      ["BB_EDICTS", BB_EDICTS],
      ["SD_EDICTS", SD_EDICTS],
    ] as const) {
      const ids = list.map((e) => e.id);
      expect(new Set(ids).size, `${name} contains duplicate ids`).toBe(
        ids.length,
      );
    }
  });

  it("every EDICTS / BB_EDICTS / SD_EDICTS entry has non-empty name + description", () => {
    for (const e of ALL_EDICTS) {
      expect(e.name.length, `edict ${e.id} has empty name`).toBeGreaterThan(0);
      expect(
        e.description.length,
        `edict ${e.id} has empty description`,
      ).toBeGreaterThan(0);
    }
  });
});

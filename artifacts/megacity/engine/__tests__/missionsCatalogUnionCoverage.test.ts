import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ILLNESSES,
  ILLNESS_CATEGORIES,
  ILLNESS_CATEGORY_ICONS,
} from "@/engine/medical";
import {
  OFFICER_MISSIONS,
  MISSION_CATEGORY_LABELS,
} from "@/engine/officerMissions";
import { SPY_OPS, SPY_OP_CATEGORIES } from "@/engine/spyOps";
import {
  LAW_MISSIONS,
  LAW_MISSION_CATEGORIES,
} from "@/engine/lawOpsData";

/**
 * Drift guard: missions / illness catalog union coverage.
 *
 * Four "operation menu" systems each pair a closed string union
 * with a plain-array catalog whose category literals are NOT
 * type-checked:
 *
 *   IllnessCategory       5 → ILLNESSES (30 entries)
 *                              ILLNESS_CATEGORIES + ICONS Records (tsc)
 *   MissionCategory       5 → OFFICER_MISSIONS (14 entries)
 *                              MISSION_CATEGORY_LABELS Record (tsc)
 *   MissionId            14 → OFFICER_MISSIONS ids (1:1)
 *   SpyOpCategory        17 → SPY_OPS (100 entries)
 *                              SPY_OP_CATEGORIES Record (tsc)
 *   LawMissionCategory    8 → LAW_MISSIONS (30 entries)
 *                              LAW_MISSION_CATEGORIES Record (tsc)
 *
 * Each catalog drives a UI surface that filters by category. A
 * union member with no entry leaves an empty filter tab; an
 * orphan literal leaves content unfiltered.
 *
 * MissionId is special: typed at definition site, but a missing
 * id (e.g. removing "tactical_recon" from OFFICER_MISSIONS while
 * keeping it in the union) silently breaks any code that searches
 * by id. The 1:1 union ↔ catalog id assertion catches that.
 *
 * All sides parsed live from source. Counts pinned for budget.
 */

const MEDICAL_SRC = readFileSync(
  join(__dirname, "..", "medical.ts"),
  "utf8",
);
const OFFICER_SRC = readFileSync(
  join(__dirname, "..", "officerMissions.ts"),
  "utf8",
);
const SPY_SRC = readFileSync(join(__dirname, "..", "spyOps.ts"), "utf8");
const LAW_SRC = readFileSync(
  join(__dirname, "..", "lawOpsData.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const ILLNESS_CATS = parseUnion(MEDICAL_SRC, "IllnessCategory");
const MISSION_CATS = parseUnion(OFFICER_SRC, "MissionCategory");
const MISSION_IDS = parseUnion(OFFICER_SRC, "MissionId");
const SPY_CATS = parseUnion(SPY_SRC, "SpyOpCategory");
const LAW_CATS = parseUnion(LAW_SRC, "LawMissionCategory");

describe("missions / illness catalog union coverage drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(ILLNESS_CATS.length).toBe(5);
    expect(MISSION_CATS.length).toBe(5);
    expect(MISSION_IDS.length).toBe(14);
    expect(SPY_CATS.length).toBe(17);
    expect(LAW_CATS.length).toBe(8);
  });

  it("catalog sizes are pinned (budget)", () => {
    expect(ILLNESSES.length).toBe(30);
    expect(OFFICER_MISSIONS.length).toBe(14);
    expect(SPY_OPS.length).toBe(100);
    expect(LAW_MISSIONS.length).toBe(30);
  });

  it("ILLNESS_CATEGORIES and ILLNESS_CATEGORY_ICONS keys equal IllnessCategory exactly", () => {
    expect(Object.keys(ILLNESS_CATEGORIES).sort()).toEqual(
      [...ILLNESS_CATS].sort(),
    );
    expect(Object.keys(ILLNESS_CATEGORY_ICONS).sort()).toEqual(
      [...ILLNESS_CATS].sort(),
    );
    for (const c of ILLNESS_CATS) {
      expect(
        ILLNESS_CATEGORIES[c as keyof typeof ILLNESS_CATEGORIES].length,
      ).toBeGreaterThan(0);
      expect(
        ILLNESS_CATEGORY_ICONS[c as keyof typeof ILLNESS_CATEGORY_ICONS]
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it("every IllnessCategory union member is used by ≥1 ILLNESSES entry", () => {
    const used = new Set(ILLNESSES.map((i) => i.category));
    const missing = ILLNESS_CATS.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(ILLNESS_CATS);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("ILLNESSES ids are unique", () => {
    const ids = ILLNESSES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("MISSION_CATEGORY_LABELS keys equal MissionCategory exactly with non-empty labels", () => {
    expect(Object.keys(MISSION_CATEGORY_LABELS).sort()).toEqual(
      [...MISSION_CATS].sort(),
    );
    for (const c of MISSION_CATS) {
      expect(
        MISSION_CATEGORY_LABELS[c as keyof typeof MISSION_CATEGORY_LABELS]
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it("OFFICER_MISSIONS ids equal MissionId union exactly (1:1, no dupes)", () => {
    const ids = OFFICER_MISSIONS.map((m) => m.id);
    expect([...ids].sort()).toEqual([...MISSION_IDS].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every MissionCategory union member is used by ≥1 OFFICER_MISSIONS entry", () => {
    const used = new Set(OFFICER_MISSIONS.map((m) => m.category));
    const missing = MISSION_CATS.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(MISSION_CATS);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("SPY_OP_CATEGORIES keys equal SpyOpCategory exactly with non-empty labels", () => {
    expect(Object.keys(SPY_OP_CATEGORIES).sort()).toEqual(
      [...SPY_CATS].sort(),
    );
    for (const c of SPY_CATS) {
      expect(
        SPY_OP_CATEGORIES[c as keyof typeof SPY_OP_CATEGORIES].length,
      ).toBeGreaterThan(0);
    }
  });

  it("every SpyOpCategory union member is used by ≥1 SPY_OPS entry", () => {
    const used = new Set(SPY_OPS.map((o) => o.category));
    const missing = SPY_CATS.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(SPY_CATS);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("SPY_OPS ids are unique", () => {
    const ids = SPY_OPS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("LAW_MISSION_CATEGORIES keys equal LawMissionCategory exactly with non-empty labels", () => {
    expect(Object.keys(LAW_MISSION_CATEGORIES).sort()).toEqual(
      [...LAW_CATS].sort(),
    );
    for (const c of LAW_CATS) {
      expect(
        LAW_MISSION_CATEGORIES[c as keyof typeof LAW_MISSION_CATEGORIES]
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it("every LawMissionCategory union member is used by ≥1 LAW_MISSIONS entry", () => {
    const used = new Set(LAW_MISSIONS.map((m) => m.category));
    const missing = LAW_CATS.filter((c) => !used.has(c as never));
    expect(missing).toEqual([]);
    const unionSet = new Set(LAW_CATS);
    const orphans = [...used].filter((c) => !unionSet.has(c));
    expect(orphans).toEqual([]);
  });

  it("LAW_MISSIONS ids are unique", () => {
    const ids = LAW_MISSIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

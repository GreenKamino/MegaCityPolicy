import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { POLICY_CATEGORY_LABELS, ALL_POLICIES } from "@/engine/policies";
import { ALL_EDICTS } from "@/engine/edicts";
import {
  LAW_MISSION_CATEGORIES,
  LAW_MISSIONS,
  RISK_COLORS,
} from "@/engine/lawOpsData";
import type { PolicyCategory } from "@/engine/policies";
import type { LawMissionCategory, LawMissionDef } from "@/engine/lawOpsData";

/**
 * Drift guard: PolicyCategory + EdictDef.category + LawMissionCategory
 * + LawMissionDef.risk union coverage.
 *
 *   PolicyCategory(14)        ↔ POLICY_CATEGORY_LABELS Record (typed
 *                               Record<PolicyCategory,…>) + every
 *                               union member used by ≥1 entry in
 *                               ALL_POLICIES.
 *
 *   EdictDef.category(5)      ↔ engine/edicts.ts. Inline union
 *                               (security/economic/social/
 *                               infrastructure/political); every
 *                               literal must be used by ≥1 entry
 *                               in ALL_EDICTS.
 *
 *   LawMissionCategory(8)     ↔ LAW_MISSION_CATEGORIES Record (typed
 *                               Record<LawMissionCategory,string>)
 *                               + every union member used by ≥1
 *                               entry in LAW_MISSIONS.
 *
 *   LawMissionDef.risk(4)     ↔ engine/lawOpsData.ts. Inline union
 *                               (low/medium/high/extreme); every
 *                               literal used by ≥1 LAW_MISSIONS
 *                               entry, and RISK_COLORS lookup
 *                               table covers all four.
 */

const POLICIES_SRC = readFileSync(
  join(__dirname, "..", "policies.ts"),
  "utf8",
);
const EDICTS_SRC = readFileSync(join(__dirname, "..", "edicts.ts"), "utf8");
const LAWOPS_SRC = readFileSync(
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

function parseInlineFieldUnion(
  src: string,
  type: string,
  field: string,
): string[] {
  const block = src.match(new RegExp(`export type ${type}\\s*=\\s*\\{[\\s\\S]*?\\};`));
  expect(block, `type ${type} not found`).not.toBeNull();
  const fm = block![0].match(
    new RegExp(`${field}\\s*:\\s*((?:"[^"]+"\\s*\\|?\\s*)+);`),
  );
  expect(fm, `field ${type}.${field} not found`).not.toBeNull();
  return (fm![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const POLICY_CAT = parseUnion(POLICIES_SRC, "PolicyCategory");
const EDICT_CAT = parseInlineFieldUnion(EDICTS_SRC, "EdictDef", "category");
const LAW_CAT = parseUnion(LAWOPS_SRC, "LawMissionCategory");
const LAW_RISK = parseInlineFieldUnion(LAWOPS_SRC, "LawMissionDef", "risk");

describe("policy category / edict category / law mission category / law mission risk union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(POLICY_CAT.length).toBe(14);
    expect(EDICT_CAT.length).toBe(5);
    expect(LAW_CAT.length).toBe(8);
    expect(LAW_RISK.length).toBe(4);
  });

  it("PolicyCategory — POLICY_CATEGORY_LABELS Record covers union 1:1 + every member used by ≥1 ALL_POLICIES entry", () => {
    const known = new Set(POLICY_CAT);
    expect(Object.keys(POLICY_CATEGORY_LABELS).length).toBe(POLICY_CAT.length);
    for (const lit of POLICY_CAT) {
      expect(
        (POLICY_CATEGORY_LABELS as Record<string, string>)[lit],
        `POLICY_CATEGORY_LABELS missing ${lit}`,
      ).toBeDefined();
    }
    const used = new Set<string>();
    for (const p of ALL_POLICIES) used.add(p.category as string);
    for (const lit of POLICY_CAT) {
      expect(used.has(lit), `PolicyCategory ${lit} unused in ALL_POLICIES`).toBe(
        true,
      );
    }
    const sample: PolicyCategory = "lawEnforcement";
    expect(known.has(sample)).toBe(true);
  });

  it("EdictDef.category — every union member used by ≥1 ALL_EDICTS entry", () => {
    const used = new Set<string>();
    for (const e of ALL_EDICTS) used.add(e.category as string);
    for (const lit of EDICT_CAT) {
      expect(used.has(lit), `EdictDef.category ${lit} unused in ALL_EDICTS`).toBe(
        true,
      );
      expect(EDICT_CAT).toContain(lit);
    }
    for (const cat of used) {
      expect(EDICT_CAT, `unknown EdictDef.category ${cat}`).toContain(cat);
    }
  });

  it("LawMissionCategory — LAW_MISSION_CATEGORIES Record covers union 1:1 + every member used by ≥1 LAW_MISSIONS entry", () => {
    const known = new Set(LAW_CAT);
    expect(Object.keys(LAW_MISSION_CATEGORIES).length).toBe(LAW_CAT.length);
    for (const lit of LAW_CAT) {
      expect(
        (LAW_MISSION_CATEGORIES as Record<string, string>)[lit],
        `LAW_MISSION_CATEGORIES missing ${lit}`,
      ).toBeDefined();
    }
    const used = new Set<string>();
    for (const m of LAW_MISSIONS) used.add(m.category as string);
    for (const lit of LAW_CAT) {
      expect(used.has(lit), `LawMissionCategory ${lit} unused in LAW_MISSIONS`).toBe(
        true,
      );
    }
    const sample: LawMissionCategory = "patrol";
    expect(known.has(sample)).toBe(true);
  });

  it("LawMissionDef.risk — every union member used by ≥1 LAW_MISSIONS entry + covered by RISK_COLORS", () => {
    const used = new Set<string>();
    for (const m of LAW_MISSIONS as LawMissionDef[]) used.add(m.risk as string);
    for (const lit of LAW_RISK) {
      expect(used.has(lit), `LawMissionDef.risk ${lit} unused in LAW_MISSIONS`).toBe(
        true,
      );
      expect(
        (RISK_COLORS as Record<string, string>)[lit],
        `RISK_COLORS missing ${lit}`,
      ).toBeDefined();
    }
    for (const r of used) {
      expect(LAW_RISK, `unknown LawMissionDef.risk ${r}`).toContain(r);
    }
  });
});

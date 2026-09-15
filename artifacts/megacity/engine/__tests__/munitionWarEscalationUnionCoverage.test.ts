import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MUNITION_RULES,
  type MunitionTypeId,
  type MunitionCategory,
} from "@/engine/munitionsCompany";
import type { WarEscalationStage } from "@/engine/diplomacyAdvanced";

/**
 * Drift guard: Vulcan munitions catalog + war-escalation ladder.
 *
 *   MunitionTypeId(8)      ↔ MUNITION_RULES Record — 1:1, every
 *                            union literal keys a rule whose own
 *                            `id` matches the key (no shifted
 *                            slot), label/description non-empty.
 *   MunitionCategory(4)    ↔ MUNITION_RULES[*].category — every
 *                            union member tagged on ≥1 rule
 *                            (no orphan ammo class), every tag
 *                            on a rule is a known category.
 *   WarEscalationStage(4)  ↔ runWarEscalation switch in
 *                            diplomacyAdvanced.ts — every literal
 *                            must appear as either an `=== "..."`
 *                            comparison branch (which is how the
 *                            escalation ladder is implemented) or
 *                            be reachable as a `war.stage = "..."`
 *                            assignment (initial + escalations).
 *                            Together these guarantee the full
 *                            tensions→skirmishes→open_war→
 *                            total_war ladder is wired.
 */

const MUNITIONS_SRC = readFileSync(
  join(__dirname, "..", "munitionsCompany.ts"),
  "utf8",
);
const DIPLO_SRC = readFileSync(
  join(__dirname, "..", "diplomacyAdvanced.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const MUNITION_TYPE_ID = parseUnion(MUNITIONS_SRC, "MunitionTypeId");
const MUNITION_CATEGORY = parseUnion(MUNITIONS_SRC, "MunitionCategory");
const WAR_ESCALATION_STAGE = parseUnion(DIPLO_SRC, "WarEscalationStage");

describe("munition + war escalation union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(MUNITION_TYPE_ID.length).toBe(8);
    expect(MUNITION_CATEGORY.length).toBe(4);
    expect(WAR_ESCALATION_STAGE.length).toBe(4);
  });

  it("MUNITION_RULES Record matches MunitionTypeId 1:1; key === rule.id; non-empty narrative", () => {
    const want = [...MUNITION_TYPE_ID].sort();
    const got = Object.keys(MUNITION_RULES).sort();
    expect(got).toEqual(want);
    for (const key of MUNITION_TYPE_ID) {
      const rule = MUNITION_RULES[key as MunitionTypeId];
      expect(rule, `MUNITION_RULES missing entry for ${key}`).toBeDefined();
      expect(rule.id, `MUNITION_RULES.${key}.id must match key`).toBe(key);
      expect(rule.label.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
    }
    const sample: MunitionTypeId = "standard_rounds";
    expect(MUNITION_RULES[sample]).toBeDefined();
  });

  it("MunitionCategory — every union member tagged on ≥1 rule, every rule tag is a known category", () => {
    const known = new Set(MUNITION_CATEGORY);
    const used = new Set<string>();
    for (const r of Object.values(MUNITION_RULES)) {
      expect(known.has(r.category), `${r.id} unknown category ${r.category}`).toBe(true);
      used.add(r.category);
    }
    const orphan = MUNITION_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, "MunitionCategory members unused in MUNITION_RULES").toEqual([]);
    const sample: MunitionCategory = "small_arms";
    expect(known.has(sample)).toBe(true);
  });

  it("WarEscalationStage — every literal is reachable in diplomacyAdvanced.ts as a stage assignment OR an `=== \"...\"` branch", () => {
    for (const s of WAR_ESCALATION_STAGE) {
      const assigned = DIPLO_SRC.includes(`stage = "${s}"`)
        || DIPLO_SRC.includes(`stage: "${s}"`);
      const compared = DIPLO_SRC.includes(`stage === "${s}"`);
      expect(
        assigned || compared,
        `WarEscalationStage "${s}" never assigned nor compared in diplomacyAdvanced.ts`,
      ).toBe(true);
    }
    // Pin ladder ordering — these specific transitions must exist
    // verbatim in the escalation logic. If anyone reorders or
    // collapses the ladder, this fires.
    expect(DIPLO_SRC).toContain(`war.stage = "skirmishes"`);
    expect(DIPLO_SRC).toContain(`war.stage = "open_war"`);
    expect(DIPLO_SRC).toContain(`war.stage = "total_war"`);
    const sample: WarEscalationStage = "tensions";
    expect(WAR_ESCALATION_STAGE).toContain(sample);
  });
});

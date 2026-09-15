import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TRAIT_DEFS } from "@/engine/officers";
import { BIOMES, type EcologyTier } from "@/engine/biomes";
import type { OfficerTrait, OfficerExitReason, ActiveOperationType } from "@/engine/types";

/**
 * Drift guard: officer trait pool, exit reason ladder, biome
 * ecology tier, and ActiveOperationType template coverage.
 *
 *   OfficerTrait(32)         ↔ TRAIT_DEFS[].id — 1:1, unique;
 *                              non-empty name/description/effects;
 *                              category ∈ administrative/political/
 *                              security/economic/legacy.
 *   OfficerExitReason(4)     ↔ officerLifecycle.ts — every literal
 *                              must be reachable as either a
 *                              `=== "..."` comparison or a literal
 *                              passed to vacateAndReplace / used as
 *                              an exitReason field.
 *   EcologyTier(4)           ↔ BIOMES[*].ecologyTier — every union
 *                              member assigned to ≥1 biome (no
 *                              orphan tier), every tag known.
 *   ActiveOperationType(10)  ↔ OPERATION_TEMPLATES in
 *                              diplomacyEngine.ts — every union
 *                              member appears as a `type: "..."`
 *                              literal in the templates table so
 *                              every operation is constructable.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const LIFECYCLE_SRC = readFileSync(
  join(__dirname, "..", "officerLifecycle.ts"),
  "utf8",
);
const ACTIONS_SRC = readFileSync(
  join(__dirname, "..", "officerActions.ts"),
  "utf8",
);
const DIPLO_SRC = readFileSync(
  join(__dirname, "..", "diplomacyEngine.ts"),
  "utf8",
);
const BIOMES_SRC = readFileSync(join(__dirname, "..", "biomes.ts"), "utf8");

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const OFFICER_TRAIT = parseUnion(TYPES_SRC, "OfficerTrait");
const OFFICER_EXIT_REASON = parseUnion(TYPES_SRC, "OfficerExitReason");
const ECOLOGY_TIER = parseUnion(BIOMES_SRC, "EcologyTier");
const ACTIVE_OPERATION_TYPE = parseUnion(TYPES_SRC, "ActiveOperationType");

const ALLOWED_TRAIT_CATEGORIES = new Set([
  "administrative",
  "political",
  "security",
  "economic",
  "legacy",
]);

describe("officer trait / exit reason / ecology tier / operation type union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(OFFICER_TRAIT.length).toBe(32);
    expect(OFFICER_EXIT_REASON.length).toBe(4);
    expect(ECOLOGY_TIER.length).toBe(4);
    expect(ACTIVE_OPERATION_TYPE.length).toBe(10);
  });

  it("TRAIT_DEFS catalog matches OfficerTrait 1:1; categories restricted; narrative non-empty", () => {
    const want = [...OFFICER_TRAIT].sort();
    const got = TRAIT_DEFS.map((t) => t.id as string).sort();
    expect(got).toEqual(want);
    const ids = new Set<string>();
    for (const t of TRAIT_DEFS) {
      expect(ids.has(t.id), `duplicate trait ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.effects.length).toBeGreaterThan(0);
      expect(
        ALLOWED_TRAIT_CATEGORIES.has(t.category),
        `${t.id} unknown category ${t.category}`,
      ).toBe(true);
    }
    const sample: OfficerTrait = TRAIT_DEFS[0].id;
    expect(typeof sample).toBe("string");
  });

  it("OfficerExitReason — every literal reachable in officerLifecycle.ts or officerActions.ts", () => {
    const both = `${LIFECYCLE_SRC}\n${ACTIONS_SRC}`;
    for (const r of OFFICER_EXIT_REASON) {
      expect(both, `OfficerExitReason "${r}" never referenced`).toContain(`"${r}"`);
    }
    const sample: OfficerExitReason = "retired";
    expect(OFFICER_EXIT_REASON).toContain(sample);
  });

  it("EcologyTier — every union member assigned to ≥1 biome; no orphan tier", () => {
    const known = new Set(ECOLOGY_TIER);
    const seen = new Set<string>();
    for (const def of Object.values(BIOMES)) {
      expect(known.has(def.ecologyTier), `${def.id} unknown tier ${def.ecologyTier}`).toBe(true);
      seen.add(def.ecologyTier);
    }
    const orphan = ECOLOGY_TIER.filter((t) => !seen.has(t));
    expect(orphan, "EcologyTier members unused in any biome").toEqual([]);
    const sample: EcologyTier = "stable";
    expect(known.has(sample)).toBe(true);
  });

  it("ActiveOperationType — every union member surfaces as a `type: \"...\"` template in diplomacyEngine.ts", () => {
    for (const t of ACTIVE_OPERATION_TYPE) {
      expect(DIPLO_SRC, `OPERATION_TEMPLATES missing type literal "${t}"`)
        .toContain(`type: "${t}"`);
    }
    const sample: ActiveOperationType = "blockade";
    expect(ACTIVE_OPERATION_TYPE).toContain(sample);
  });
});

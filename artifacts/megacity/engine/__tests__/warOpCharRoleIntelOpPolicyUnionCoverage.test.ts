import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { WAR_ROOM_OPS } from "@/engine/warRoomData";
import {
  INTEL_POLICY_CATEGORIES,
  INTEL_POLICIES,
} from "@/engine/intelData";
import type { CharacterRole } from "@/engine/types";
import type { WarOpCategory } from "@/engine/warRoomData";
import type { IntelPolicyCategory } from "@/engine/intelData";

/**
 * Drift guard: war room op categories + character role roster +
 * intel policy taxonomy + IntelOperation.type inline union.
 *
 *   WarOpCategory(10)         ↔ WAR_ROOM_OPS[].type. Every union
 *                                member used by ≥1 op.
 *   CharacterRole(9)          ↔ engine/namedCharacters.ts spawn picks
 *                                + engine/assetUpgrades.ts
 *                                followerRoles arrays. Every literal
 *                                must appear at least once across
 *                                those two source files.
 *   IntelPolicyCategory(8)    ↔ INTEL_POLICY_CATEGORIES Record (TS-
 *                                enforced via Record<IntelPolicyCategory,…>)
 *                                cross-checked at runtime + every
 *                                union member used by ≥1 policy in
 *                                INTEL_POLICIES.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const WAR_ROOM_SRC = readFileSync(
  join(__dirname, "..", "warRoomData.ts"),
  "utf8",
);
const NAMED_SRC = readFileSync(
  join(__dirname, "..", "namedCharacters.ts"),
  "utf8",
);
const ASSETS_SRC = readFileSync(
  join(__dirname, "..", "assetUpgrades.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const WAR_OP = parseUnion(WAR_ROOM_SRC, "WarOpCategory");
const CHAR_ROLE = parseUnion(TYPES_SRC, "CharacterRole");
const INTEL_DATA_SRC = readFileSync(
  join(__dirname, "..", "intelData.ts"),
  "utf8",
);
const INTEL_POLICY = parseUnion(INTEL_DATA_SRC, "IntelPolicyCategory");

describe("war op / character role / intel policy union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(WAR_OP.length).toBe(10);
    expect(CHAR_ROLE.length).toBe(9);
    expect(INTEL_POLICY.length).toBe(8);
  });

  it("WarOpCategory — every union member used by ≥1 entry in WAR_ROOM_OPS", () => {
    const known = new Set(WAR_OP);
    const used = new Set<string>();
    for (const op of WAR_ROOM_OPS) {
      expect(known.has(op.type as string), `${op.id} unknown war op type ${op.type}`).toBe(true);
      used.add(op.type as string);
    }
    for (const lit of WAR_OP) {
      expect(used.has(lit), `WarOpCategory ${lit} has no entries in WAR_ROOM_OPS`).toBe(true);
    }
    const sample: WarOpCategory = "defensive";
    expect(known.has(sample)).toBe(true);
  });

  it("CharacterRole — every union member appears in namedCharacters.ts spawn picks or assetUpgrades.ts followerRoles", () => {
    const haystack = NAMED_SRC + "\n" + ASSETS_SRC;
    for (const lit of CHAR_ROLE) {
      expect(
        haystack.includes(`"${lit}"`),
        `CharacterRole "${lit}" never referenced in namedCharacters.ts or assetUpgrades.ts`,
      ).toBe(true);
    }
    const sample: CharacterRole = "gang_lieutenant";
    expect(CHAR_ROLE).toContain(sample);
  });

  it("IntelPolicyCategory — INTEL_POLICY_CATEGORIES Record covers union 1:1 + every member used by ≥1 INTEL_POLICIES entry", () => {
    const known = new Set(INTEL_POLICY);
    for (const lit of INTEL_POLICY) {
      expect(
        Object.prototype.hasOwnProperty.call(INTEL_POLICY_CATEGORIES, lit),
        `INTEL_POLICY_CATEGORIES missing key ${lit}`,
      ).toBe(true);
      const label = (INTEL_POLICY_CATEGORIES as Record<string, string>)[lit];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
    expect(Object.keys(INTEL_POLICY_CATEGORIES).length).toBe(INTEL_POLICY.length);
    const used = new Set<string>();
    for (const p of INTEL_POLICIES) {
      expect(known.has(p.category as string), `${p.id} unknown intel policy category ${p.category}`).toBe(true);
      used.add(p.category as string);
    }
    for (const lit of INTEL_POLICY) {
      expect(used.has(lit), `IntelPolicyCategory ${lit} has no entries in INTEL_POLICIES`).toBe(true);
    }
    const sample: IntelPolicyCategory = "surveillance";
    expect(known.has(sample)).toBe(true);
  });

});

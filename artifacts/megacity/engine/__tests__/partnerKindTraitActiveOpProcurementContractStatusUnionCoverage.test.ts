import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  PartnerKind,
  PartnerPersonalityTrait,
  ActiveOperationType,
  ProcurementMethod,
  ContractStatus,
} from "@/engine/types";

/**
 * Drift guard: PartnerKind + PartnerPersonalityTrait + ActiveOperationType
 * + ProcurementMethod + ContractStatus union coverage.
 *
 *   PartnerKind(11)              ↔ engine/diplomacyEngine.ts —
 *                                   every union member appears as
 *                                   a string literal in the proposal
 *                                   eligibility maps + faction.type
 *                                   branches across diplomacyEngine.ts
 *                                   + diplomacyAdvanced.ts.
 *
 *   PartnerPersonalityTrait(10)  ↔ PARTNER_PERSONALITY_POOL in
 *                                   engine/partnerPersonality.ts —
 *                                   every union member appears in
 *                                   ≥1 archetype trait pool array.
 *
 *   ActiveOperationType(10)      ↔ engine/diplomacyEngine.ts —
 *                                   every union member appears as
 *                                   `type: "..."` in the operation
 *                                   construction blocks.
 *
 *   ProcurementMethod(3)         ↔ engine/types.ts ProcurementPolicies
 *                                   field references — only "directAward"
 *                                   is currently emitted by app code
 *                                   (autoConstruction.ts). The other
 *                                   two are documented orphans
 *                                   {openTender, emergencyAuth} kept
 *                                   for future contract negotiation
 *                                   surfaces.
 *
 *   ContractStatus(6)            ↔ engine/formulas.ts +
 *                                   engine/autoConstruction.ts —
 *                                   "active", "completed" and
 *                                   "expired" (task #581 auto-scrap
 *                                   path) are written; documented
 *                                   orphans {available, cancelled,
 *                                   delayed} exist as taxonomy slots
 *                                   — UI in app/(game)/contracts.tsx
 *                                   tabs into "available" via
 *                                   filtering newly-spawned contracts
 *                                   and cancelling moves contracts
 *                                   off the active list rather than
 *                                   reassigning .status.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const PERSONALITY_SRC = readFileSync(
  join(__dirname, "..", "partnerPersonality.ts"),
  "utf8",
);
const DIP_ENGINE_SRC = readFileSync(
  join(__dirname, "..", "diplomacyEngine.ts"),
  "utf8",
);
const DIP_ADV_SRC = readFileSync(
  join(__dirname, "..", "diplomacyAdvanced.ts"),
  "utf8",
);
const FORMULAS_SRC = readFileSync(
  join(__dirname, "..", "formulas.ts"),
  "utf8",
);
const AUTOCON_SRC = readFileSync(
  join(__dirname, "..", "autoConstruction.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const PARTNER_KIND = parseUnion(TYPES_SRC, "PartnerKind");
const PARTNER_TRAIT = parseUnion(TYPES_SRC, "PartnerPersonalityTrait");
const ACTIVE_OP = parseUnion(TYPES_SRC, "ActiveOperationType");
const PROC_METHOD = parseUnion(TYPES_SRC, "ProcurementMethod");
const CONTRACT_STATUS = parseUnion(TYPES_SRC, "ContractStatus");

describe("partner kind / trait / active op / procurement method / contract status union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(PARTNER_KIND.length).toBe(11);
    expect(PARTNER_TRAIT.length).toBe(10);
    expect(ACTIVE_OP.length).toBe(10);
    expect(PROC_METHOD.length).toBe(3);
    expect(CONTRACT_STATUS.length).toBe(6);
  });

  it("PartnerKind — every union member referenced in diplomacyEngine.ts or diplomacyAdvanced.ts as a string literal", () => {
    const haystack = DIP_ENGINE_SRC + "\n" + DIP_ADV_SRC;
    for (const lit of PARTNER_KIND) {
      expect(
        haystack.includes(`"${lit}"`),
        `PartnerKind "${lit}" never referenced in diplomacy engine sources`,
      ).toBe(true);
    }
    const sample: PartnerKind = "law";
    expect(PARTNER_KIND).toContain(sample);
  });

  it("PartnerPersonalityTrait — every union member appears in ≥1 archetype trait pool in partnerPersonality.ts", () => {
    for (const lit of PARTNER_TRAIT) {
      expect(
        PERSONALITY_SRC.includes(`"${lit}"`),
        `PartnerPersonalityTrait "${lit}" never appears in any trait pool`,
      ).toBe(true);
    }
    const sample: PartnerPersonalityTrait = "proud";
    expect(PARTNER_TRAIT).toContain(sample);
  });

  it("ActiveOperationType — every union member emitted as `type: \"..\"` in diplomacyEngine.ts", () => {
    for (const lit of ACTIVE_OP) {
      const re = new RegExp(`type\\s*:\\s*"${lit}"`);
      expect(
        re.test(DIP_ENGINE_SRC),
        `ActiveOperationType "${lit}" never constructed in diplomacyEngine.ts`,
      ).toBe(true);
    }
    const sample: ActiveOperationType = "blockade";
    expect(ACTIVE_OP).toContain(sample);
  });

  it("ProcurementMethod — emitted methods limited to documented allowlist {directAward}; orphans {openTender, emergencyAuth} pinned", () => {
    const KNOWN_PROC_METHOD_ORPHANS = new Set<string>([
      "openTender",
      "emergencyAuth",
    ]);
    const used = new Set<string>();
    for (const lit of PROC_METHOD) {
      const re = new RegExp(`procurementMethod\\s*:\\s*"${lit}"`);
      if (re.test(AUTOCON_SRC) || re.test(FORMULAS_SRC)) used.add(lit);
    }
    const orphan = PROC_METHOD.filter((c) => !used.has(c));
    expect(
      new Set(orphan),
      "ProcurementMethod orphan set drifted from documented allowlist",
    ).toEqual(KNOWN_PROC_METHOD_ORPHANS);
    const sample: ProcurementMethod = "directAward";
    expect(PROC_METHOD).toContain(sample);
  });

  it("ContractStatus — emitted statuses limited to {active, completed, expired}; orphans {available, cancelled, delayed} pinned", () => {
    const KNOWN_CONTRACT_STATUS_ORPHANS = new Set<string>([
      "available",
      "cancelled",
      "delayed",
    ]);
    const haystack = AUTOCON_SRC + "\n" + FORMULAS_SRC;
    const used = new Set<string>();
    for (const lit of CONTRACT_STATUS) {
      const reAssign = new RegExp(`\\.status\\s*=\\s*"${lit}"`);
      const reInit = new RegExp(`status\\s*:\\s*"${lit}"`);
      if (reAssign.test(haystack) || reInit.test(haystack)) used.add(lit);
    }
    const orphan = CONTRACT_STATUS.filter((c) => !used.has(c));
    expect(
      new Set(orphan),
      "ContractStatus orphan set drifted from documented allowlist",
    ).toEqual(KNOWN_CONTRACT_STATUS_ORPHANS);
    const sample: ContractStatus = "active";
    expect(CONTRACT_STATUS).toContain(sample);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MUNITION_RULES } from "@/engine/munitionsCompany";
import type {
  EnvoyTrait,
  IncidentCategory,
  IncidentSeverity,
  WarEscalationStage,
} from "@/engine/diplomacyAdvanced";
import type { MunitionCategory } from "@/engine/munitionsCompany";

/**
 * Drift guard: IncidentSeverity + IncidentCategory + WarEscalationStage
 * + EnvoyTrait + MunitionCategory union coverage.
 *
 *   IncidentSeverity(4)    ↔ engine/diplomacyAdvanced.ts
 *                            INCIDENT_TEMPLATES const (typed
 *                            severity:IncidentSeverity). Source-parsed:
 *                            every union member used by ≥1 template.
 *
 *   IncidentCategory(8)    ↔ INCIDENT_TEMPLATES const (typed
 *                            category:IncidentCategory). Source-
 *                            parsed: every union member used by ≥1
 *                            template; every emitted category a
 *                            known literal.
 *
 *   WarEscalationStage(4)  ↔ engine/diplomacyAdvanced.ts war-tick
 *                            transitions. Source-parsed: every
 *                            union member appears in ≥1 transition
 *                            comparison.
 *
 *   EnvoyTrait(6)          ↔ ENVOY_TRAITS const array. Source-
 *                            parsed: array covers union 1:1.
 *
 *   MunitionCategory(4)    ↔ MUNITION_RULES Record (typed
 *                            Record<MunitionTypeId,…>). Every
 *                            union member used by ≥1 rule entry;
 *                            every emitted category a known literal.
 */

const DIP_SRC = readFileSync(
  join(__dirname, "..", "diplomacyAdvanced.ts"),
  "utf8",
);
const MUN_SRC = readFileSync(
  join(__dirname, "..", "munitionsCompany.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function sliceConst(src: string, name: string): string {
  const decl = src.indexOf(`const ${name}`);
  expect(decl, `const ${name} not found`).toBeGreaterThan(-1);
  const eq = src.indexOf("=", decl);
  let i = eq + 1;
  while (i < src.length && /\s/.test(src[i]!)) i++;
  expect(src[i], `const ${name} not array-initialized`).toBe("[");
  const start = i;
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`could not slice ${name}`);
}

const INC_SEV = parseUnion(DIP_SRC, "IncidentSeverity");
const INC_CAT = parseUnion(DIP_SRC, "IncidentCategory");
const WAR_STAGE = parseUnion(DIP_SRC, "WarEscalationStage");
const ENV_TRAIT = parseUnion(DIP_SRC, "EnvoyTrait");
const MUN_CAT = parseUnion(MUN_SRC, "MunitionCategory");

const INCIDENT_TEMPLATES_SRC = sliceConst(DIP_SRC, "INCIDENT_TEMPLATES");
const ENVOY_TRAITS_SRC = sliceConst(DIP_SRC, "ENVOY_TRAITS");

describe("incident-severity / incident-category / war-stage / envoy-trait / munition-category union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(INC_SEV.length).toBe(4);
    expect(INC_CAT.length).toBe(8);
    expect(WAR_STAGE.length).toBe(4);
    expect(ENV_TRAIT.length).toBe(6);
    expect(MUN_CAT.length).toBe(4);
  });

  it("IncidentSeverity — every union member used by ≥1 INCIDENT_TEMPLATES entry", () => {
    const used = new Set<string>();
    for (const m of INCIDENT_TEMPLATES_SRC.matchAll(
      /\bseverity:\s*"([a-zA-Z0-9_-]+)"/g,
    )) {
      used.add(m[1]!);
    }
    for (const lit of INC_SEV) {
      expect(used.has(lit), `IncidentSeverity ${lit} unused in INCIDENT_TEMPLATES`).toBe(
        true,
      );
    }
    for (const s of used) {
      expect(INC_SEV, `unknown IncidentSeverity ${s}`).toContain(s);
    }
    const sample: IncidentSeverity = "crisis";
    expect(INC_SEV).toContain(sample);
  });

  it("IncidentCategory — every union member used by ≥1 INCIDENT_TEMPLATES entry", () => {
    const used = new Set<string>();
    for (const m of INCIDENT_TEMPLATES_SRC.matchAll(
      /\bcategory:\s*"([a-zA-Z0-9_-]+)"/g,
    )) {
      used.add(m[1]!);
    }
    for (const lit of INC_CAT) {
      expect(used.has(lit), `IncidentCategory ${lit} unused in INCIDENT_TEMPLATES`).toBe(
        true,
      );
    }
    for (const c of used) {
      expect(INC_CAT, `unknown IncidentCategory ${c}`).toContain(c);
    }
    const sample: IncidentCategory = "border";
    expect(INC_CAT).toContain(sample);
  });

  it("WarEscalationStage — every union member appears in war-tick transitions", () => {
    const stageRefs = new Set<string>();
    for (const m of DIP_SRC.matchAll(
      /\b(?:war\.stage|stage)\s*(?:===|!==|=)\s*"([a-zA-Z0-9_-]+)"/g,
    )) {
      stageRefs.add(m[1]!);
    }
    for (const lit of WAR_STAGE) {
      expect(stageRefs.has(lit), `WarEscalationStage ${lit} unused in war transitions`).toBe(
        true,
      );
    }
    for (const s of stageRefs) {
      expect(WAR_STAGE, `unknown WarEscalationStage ${s}`).toContain(s);
    }
    const sample: WarEscalationStage = "tensions";
    expect(WAR_STAGE).toContain(sample);
  });

  it("EnvoyTrait — ENVOY_TRAITS array covers union 1:1", () => {
    const arr = (ENVOY_TRAITS_SRC.match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
      s.replace(/"/g, ""),
    );
    expect(arr.length).toBe(ENV_TRAIT.length);
    expect(new Set(arr).size).toBe(ENV_TRAIT.length);
    for (const lit of ENV_TRAIT) {
      expect(arr, `EnvoyTrait ${lit} missing from ENVOY_TRAITS`).toContain(lit);
    }
    const sample: EnvoyTrait = "charming";
    expect(ENV_TRAIT).toContain(sample);
  });

  it("MunitionCategory — every union member used by ≥1 MUNITION_RULES entry", () => {
    const used = new Set<string>();
    for (const rule of Object.values(MUNITION_RULES)) {
      used.add((rule as { category: string }).category);
    }
    for (const lit of MUN_CAT) {
      expect(used.has(lit), `MunitionCategory ${lit} unused in MUNITION_RULES`).toBe(
        true,
      );
    }
    for (const c of used) {
      expect(MUN_CAT, `unknown MunitionCategory ${c}`).toContain(c);
    }
    const sample: MunitionCategory = "small_arms";
    expect(MUN_CAT).toContain(sample);
  });
});

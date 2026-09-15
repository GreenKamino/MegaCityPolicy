import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PARTNER_ARCHETYPES,
  PERSONALITY_ARCHETYPES,
} from "@/engine/partnerDynamics";

/**
 * Drift guard: PartnerArchetype, PersonalityArchetype, and
 * PartnerStance union coverage across engine/partnerDynamics.ts.
 *
 * partnerDynamics.ts holds six adjacent surfaces keyed by these
 * three unions:
 *
 *   PARTNER_ARCHETYPES     Record<PartnerArchetype, ...>      (exported)
 *   PERSONALITY_ARCHETYPES Record<PersonalityArchetype, ...>  (exported)
 *   STANCE_LABEL           Record<PartnerStance, ...>         (module-local)
 *   ARCHETYPE_POOL         PartnerArchetype[]                 (module-local)
 *   PERSONALITY_POOL       PersonalityArchetype[]             (module-local)
 *   archDefaults           inline Record<PartnerArchetype,
 *                          PersonalityArchetype[]> (inside
 *                          inferPersonalityArchetype)
 *
 * Adding a new archetype / personality / stance to a union without
 * extending all of these silently:
 *   - drops the new value from the random selection pools,
 *   - falls back through `?? STANCE_LABEL.content` to the wrong
 *     icon and color,
 *   - returns wrong personality defaults for the new archetype.
 *
 * Type system catches `Record<...>` misses today, but ARRAY pools
 * and the inline `archDefaults` literal carry no type-level
 * guarantee. This test source-derives both sides so the pools and
 * inline literal cannot drift.
 */

const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);
const DYN_SRC = readFileSync(
  join(__dirname, "..", "partnerDynamics.ts"),
  "utf8",
);

function parseUnion(name: string): string[] {
  const m = TYPES_SRC.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function parseArrayLiteral(varName: string): string[] {
  const m = DYN_SRC.match(
    new RegExp(`const ${varName}[^=]*=\\s*\\[([\\s\\S]*?)\\];`),
  );
  expect(m, `array ${varName} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function parseInlineRecordKeys(prefix: string): string[] {
  // For literals like `archDefaults: Record<...> = { ... };` inside a
  // function body. Match from the prefix to the matching closing brace
  // line `};`.
  const m = DYN_SRC.match(
    new RegExp(`${prefix}[\\s\\S]*?=\\s*\\{([\\s\\S]*?)\\};`),
  );
  expect(m, `inline record at ${prefix} not found`).not.toBeNull();
  const body = m![1];
  return (body.match(/^\s*"([a-zA-Z_-]+)"\s*:/gm) ?? []).map((s) =>
    s.replace(/^\s*"/, "").replace(/"\s*:$/, ""),
  );
}

const PARTNER_ARCH = parseUnion("PartnerArchetype");
const PERSONALITY_ARCH = parseUnion("PersonalityArchetype");
const PARTNER_STANCE = parseUnion("PartnerStance");

describe("partnerDynamics union coverage drift guard", () => {
  it("each union has the expected member count", () => {
    expect(PARTNER_ARCH.length).toBe(8);
    expect(PERSONALITY_ARCH.length).toBe(8);
    expect(PARTNER_STANCE.length).toBe(8);
  });

  it("PARTNER_ARCHETYPES record covers PartnerArchetype exactly", () => {
    expect(Object.keys(PARTNER_ARCHETYPES).sort()).toEqual(
      [...PARTNER_ARCH].sort(),
    );
  });

  it("PERSONALITY_ARCHETYPES record covers PersonalityArchetype exactly", () => {
    expect(Object.keys(PERSONALITY_ARCHETYPES).sort()).toEqual(
      [...PERSONALITY_ARCH].sort(),
    );
  });

  it("STANCE_LABEL (parsed live) covers PartnerStance exactly", () => {
    // Module-local, not exported. Source-parse the literal block.
    const m = DYN_SRC.match(
      /STANCE_LABEL[^=]*=\s*\{([\s\S]*?)^\};/m,
    );
    expect(m).not.toBeNull();
    const keys = (m![1].match(/^\s*"([a-zA-Z_-]+)"\s*:/gm) ?? []).map(
      (s) => s.replace(/^\s*"/, "").replace(/"\s*:$/, ""),
    );
    expect([...keys].sort()).toEqual([...PARTNER_STANCE].sort());
  });

  it("ARCHETYPE_POOL contains every PartnerArchetype exactly once", () => {
    const pool = parseArrayLiteral("ARCHETYPE_POOL");
    expect([...pool].sort()).toEqual([...PARTNER_ARCH].sort());
    expect(new Set(pool).size).toBe(pool.length);
  });

  it("PERSONALITY_POOL contains every PersonalityArchetype exactly once", () => {
    const pool = parseArrayLiteral("PERSONALITY_POOL");
    expect([...pool].sort()).toEqual([...PERSONALITY_ARCH].sort());
    expect(new Set(pool).size).toBe(pool.length);
  });

  it("inline archDefaults literal covers PartnerArchetype exactly with non-empty PersonalityArchetype lists", () => {
    const keys = parseInlineRecordKeys("archDefaults:\\s*Record<PartnerArchetype");
    expect([...keys].sort()).toEqual([...PARTNER_ARCH].sort());
    // Cross-check: every personality literal used in archDefaults
    // resolves to a current PersonalityArchetype union member.
    const m = DYN_SRC.match(
      /archDefaults:[\s\S]*?=\s*\{([\s\S]*?)\};/,
    );
    expect(m).not.toBeNull();
    const mentioned = new Set(
      (m![1].match(/"([a-zA-Z_-]+)"/g) ?? [])
        .map((s) => s.replace(/"/g, ""))
        .filter((s) => !PARTNER_ARCH.includes(s)),
    );
    const orphans = [...mentioned].filter(
      (p) => !PERSONALITY_ARCH.includes(p),
    );
    expect(orphans).toEqual([]);
  });

  it("PARTNER_ARCHETYPES entries are well-formed (non-empty label/color/flavor, finite affinities in [0,1])", () => {
    for (const key of PARTNER_ARCH) {
      const a = (PARTNER_ARCHETYPES as Record<string, {
        label: string;
        color: string;
        flavor: string;
        warHunger: number;
        tradeAffinity: number;
        expansionDrive: number;
      }>)[key];
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.color.length).toBeGreaterThan(0);
      expect(a.flavor.length).toBeGreaterThan(0);
      for (const v of [a.warHunger, a.tradeAffinity, a.expansionDrive]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

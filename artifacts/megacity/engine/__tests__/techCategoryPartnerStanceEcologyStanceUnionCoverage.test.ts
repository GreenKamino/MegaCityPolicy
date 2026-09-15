import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ALL_TECHNOLOGIES } from "@/engine/technologies";
import type { TechCategory, PartnerStance, EcologyStance } from "@/engine/types";

/**
 * Drift guard: technology category taxonomy + partner stance ladder
 * + ecology stance.
 *
 *   TechCategory(32)  ↔ ALL_TECHNOLOGIES[].category — every union
 *                        member is used by ≥1 tech across the
 *                        merged catalogs (TECHNOLOGIES + SD +
 *                        BB + RELIGION + BIOSPHERE + STORY_ARC +
 *                        ECOLOGY). Zero orphans permitted.
 *   PartnerStance(8)  ↔ STANCE_LABEL Record in partnerDynamics.ts
 *                        — every union literal must appear as a
 *                        top-level key. Source-grep walks the
 *                        matching brace span so any silent removal
 *                        of a stance row fires this guard.
 *   EcologyStance(4)  ↔ ECOLOGY_STANCE_VALID Set in sanitizer.ts
 *                        — every union literal must appear in the
 *                        sanitizer allowlist so a save round-trip
 *                        cannot strip a valid stance.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const PARTNER_DYN_SRC = readFileSync(
  join(__dirname, "..", "partnerDynamics.ts"),
  "utf8",
);
const SANITIZER_SRC = readFileSync(
  join(__dirname, "..", "sanitizer.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const TECH_CATEGORY = parseUnion(TYPES_SRC, "TechCategory");
const PARTNER_STANCE = parseUnion(TYPES_SRC, "PartnerStance");
const ECOLOGY_STANCE = parseUnion(TYPES_SRC, "EcologyStance");

describe("tech category / partner stance / ecology stance union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(TECH_CATEGORY.length).toBe(32);
    expect(PARTNER_STANCE.length).toBe(8);
    expect(ECOLOGY_STANCE.length).toBe(4);
  });

  it("TechCategory — every union member used by ≥1 tech in ALL_TECHNOLOGIES; zero orphans", () => {
    const known = new Set(TECH_CATEGORY);
    const used = new Set<string>();
    for (const t of ALL_TECHNOLOGIES) {
      expect(known.has(t.category as string), `${t.id} unknown category ${t.category}`).toBe(true);
      used.add(t.category as string);
    }
    const orphan = TECH_CATEGORY.filter((c) => !used.has(c));
    expect(orphan, `TechCategory orphan members: ${orphan.join(",")}`).toEqual([]);
    const sample: TechCategory = "energy";
    expect(known.has(sample)).toBe(true);
  });

  it("PartnerStance — STANCE_LABEL Record lists every union member as a key", () => {
    expect(PARTNER_DYN_SRC).toContain(
      "Record<PartnerStance, { label: string; color: string; icon: string }>",
    );
    const idx = PARTNER_DYN_SRC.indexOf("STANCE_LABEL");
    expect(idx).toBeGreaterThanOrEqual(0);
    // Skip past the type annotation braces — find the `=` first,
    // then take the `{` that follows. The Record<...> annotation
    // contains its own brace pair.
    const eqIdx = PARTNER_DYN_SRC.indexOf("=", idx);
    expect(eqIdx).toBeGreaterThan(idx);
    const braceStart = PARTNER_DYN_SRC.indexOf("{", eqIdx);
    let depth = 0;
    let end = braceStart;
    for (; end < PARTNER_DYN_SRC.length; end++) {
      const c = PARTNER_DYN_SRC[end];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = PARTNER_DYN_SRC.slice(braceStart, end + 1);
    for (const s of PARTNER_STANCE) {
      const re = new RegExp(`(^|[\\s,{])(?:"${s}"|${s})\\s*:`, "m");
      expect(re.test(body), `STANCE_LABEL missing key ${s}`).toBe(true);
    }
    const sample: PartnerStance = "content";
    expect(PARTNER_STANCE).toContain(sample);
  });

  it("EcologyStance — ECOLOGY_STANCE_VALID Set in sanitizer.ts whitelists every union member", () => {
    const m = SANITIZER_SRC.match(
      /ECOLOGY_STANCE_VALID\s*=\s*new Set<string>\(\[(.*?)\]\)/s,
    );
    expect(m, "ECOLOGY_STANCE_VALID set literal not found").not.toBeNull();
    const allowlist = new Set(
      (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) => s.replace(/"/g, "")),
    );
    for (const s of ECOLOGY_STANCE) {
      expect(allowlist.has(s), `ECOLOGY_STANCE_VALID missing ${s}`).toBe(true);
    }
    expect(allowlist.size).toBe(ECOLOGY_STANCE.length);
    const sample: EcologyStance = "neutral";
    expect(ECOLOGY_STANCE).toContain(sample);
  });
});

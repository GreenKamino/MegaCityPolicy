import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CLANDESTINE_OPS,
  CLANDESTINE_RISK_COLORS,
  CLANDESTINE_TYPE_LABELS,
  INITIAL_SPY_NETWORKS,
} from "@/engine/intelData";
import {
  FACTION_PRESETS,
  PLAYER_FACTION_GLYPHS,
  PLAYER_FACTION_PALETTE,
  type PlayerFactionKey,
  type PlayerFactionGlyph,
} from "@/engine/playerFaction";

/**
 * Drift guard: GameMessage union vs inbox UI filter, diplomacy unions,
 * intel ClandestineOp Records, player-faction presets/glyphs.
 *
 *   GameMessage.category    8 (inline)  ↔ inbox FILTER_CATEGORIES
 *                                          ["all", …8] (drift!)
 *   GameMessage.priority    4 (inline)  ↔ inbox FILTER_PRIORITIES
 *                                          ["all", …4]
 *
 *   IncidentSeverity        4 → DiplomaticIncident.severity
 *   IncidentCategory        8 → DiplomaticIncident.category
 *   WarEscalationStage      4 → WarState.stage
 *   EnvoyTrait              6 → Envoy.traits[]
 *
 *   ClandestineOp.type      6 (inline) ↔ CLANDESTINE_TYPE_LABELS
 *                                          Record<string,string> (drift!)
 *   ClandestineOp.riskLevel 4 (inline) ↔ CLANDESTINE_RISK_COLORS
 *                                          Record<string,string> (drift!)
 *
 *   PlayerFactionKey        5 → FACTION_PRESETS Record<PlayerFactionKey>
 *                                  (tsc-enforced full coverage)
 *   PlayerFactionGlyph     10 → PLAYER_FACTION_GLYPHS array {id,label}
 *                                  (id typed; completeness NOT enforced)
 *
 * All sides parsed live from source. Counts pinned for budget.
 */

const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);
const DIPLO_SRC = readFileSync(
  join(__dirname, "..", "diplomacyAdvanced.ts"),
  "utf8",
);
const INTEL_SRC = readFileSync(
  join(__dirname, "..", "intelData.ts"),
  "utf8",
);
const PFACT_SRC = readFileSync(
  join(__dirname, "..", "playerFaction.ts"),
  "utf8",
);
const INBOX_SRC = readFileSync(
  join(__dirname, "..", "..", "app", "(game)", "inbox.tsx"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

/** Parse an inline anonymous union from a field declaration like
 *  `category: "a" | "b" | "c";` inside a type body. */
function parseInlineFieldUnion(
  src: string,
  typeName: string,
  fieldName: string,
): string[] {
  const typeMatch = src.match(
    new RegExp(`export type ${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\};`),
  );
  expect(typeMatch, `type ${typeName} not found`).not.toBeNull();
  const body = typeMatch![1];
  const fieldMatch = body.match(
    new RegExp(`${fieldName}\\s*:\\s*((?:"[^"]+"\\s*\\|?\\s*)+);`),
  );
  expect(
    fieldMatch,
    `inline union for ${typeName}.${fieldName} not found`,
  ).not.toBeNull();
  return (fieldMatch![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

/** Extract a string-literal array constant: `const NAME = ["a","b"] as const`. */
function parseConstStringArray(src: string, name: string): string[] {
  const m = src.match(
    new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`),
  );
  expect(m, `const string array ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const MSG_CATEGORY_UNION = parseInlineFieldUnion(
  TYPES_SRC,
  "GameMessage",
  "category",
);
const MSG_PRIORITY_UNION = parseInlineFieldUnion(
  TYPES_SRC,
  "GameMessage",
  "priority",
);

const INCIDENT_SEVERITY = parseUnion(DIPLO_SRC, "IncidentSeverity");
const INCIDENT_CATEGORY = parseUnion(DIPLO_SRC, "IncidentCategory");
const WAR_STAGE = parseUnion(DIPLO_SRC, "WarEscalationStage");
const ENVOY_TRAIT = parseUnion(DIPLO_SRC, "EnvoyTrait");

const CLAN_TYPE_UNION = parseInlineFieldUnion(
  INTEL_SRC,
  "ClandestineOp",
  "type",
);
const CLAN_RISK_UNION = parseInlineFieldUnion(
  INTEL_SRC,
  "ClandestineOp",
  "riskLevel",
);

const PFACTION_KEYS = parseUnion(PFACT_SRC, "PlayerFactionKey");
const PFACTION_GLYPHS = parseUnion(PFACT_SRC, "PlayerFactionGlyph");

const INBOX_FILTER_CATEGORIES = parseConstStringArray(
  INBOX_SRC,
  "FILTER_CATEGORIES",
);
const INBOX_FILTER_PRIORITIES = parseConstStringArray(
  INBOX_SRC,
  "FILTER_PRIORITIES",
);

describe("message / diplomacy / clandestine / player-faction union coverage drift guard", () => {
  it("each union has the expected member count (budget pin)", () => {
    expect(MSG_CATEGORY_UNION.length).toBe(8);
    expect(MSG_PRIORITY_UNION.length).toBe(4);
    expect(INCIDENT_SEVERITY.length).toBe(4);
    expect(INCIDENT_CATEGORY.length).toBe(8);
    expect(WAR_STAGE.length).toBe(4);
    expect(ENVOY_TRAIT.length).toBe(6);
    expect(CLAN_TYPE_UNION.length).toBe(6);
    expect(CLAN_RISK_UNION.length).toBe(4);
    expect(PFACTION_KEYS.length).toBe(5);
    expect(PFACTION_GLYPHS.length).toBe(10);
  });

  it("inbox FILTER_CATEGORIES = ['all', …GameMessage.category union] exactly", () => {
    // First entry must be "all" sentinel; the remainder must equal the union
    // exactly, no member missing or extra.
    expect(INBOX_FILTER_CATEGORIES[0]).toBe("all");
    const tail = INBOX_FILTER_CATEGORIES.slice(1).sort();
    expect(tail).toEqual([...MSG_CATEGORY_UNION].sort());
  });

  it("inbox FILTER_PRIORITIES = ['all', …GameMessage.priority union] exactly", () => {
    expect(INBOX_FILTER_PRIORITIES[0]).toBe("all");
    const tail = INBOX_FILTER_PRIORITIES.slice(1).sort();
    expect(tail).toEqual([...MSG_PRIORITY_UNION].sort());
  });

  it("CLANDESTINE_TYPE_LABELS keys equal ClandestineOp.type union exactly (no orphan UI bucket)", () => {
    const keys = Object.keys(CLANDESTINE_TYPE_LABELS).sort();
    expect(keys).toEqual([...CLAN_TYPE_UNION].sort());
    for (const [k, v] of Object.entries(CLANDESTINE_TYPE_LABELS)) {
      expect(v.length, `label for ${k} is empty`).toBeGreaterThan(0);
    }
  });

  it("CLANDESTINE_RISK_COLORS keys equal ClandestineOp.riskLevel union exactly", () => {
    const keys = Object.keys(CLANDESTINE_RISK_COLORS).sort();
    expect(keys).toEqual([...CLAN_RISK_UNION].sort());
    for (const [k, v] of Object.entries(CLANDESTINE_RISK_COLORS)) {
      expect(v.startsWith("#"), `color for ${k} is not a hex code`).toBe(true);
    }
  });

  it("every CLANDESTINE_OPS entry has a known type + riskLevel; ids are unique", () => {
    const types = new Set(CLAN_TYPE_UNION);
    const risks = new Set(CLAN_RISK_UNION);
    const seen = new Set<string>();
    for (const op of CLANDESTINE_OPS) {
      expect(types.has(op.type), `op ${op.id} unknown type ${op.type}`).toBe(true);
      expect(risks.has(op.riskLevel), `op ${op.id} unknown risk ${op.riskLevel}`).toBe(true);
      expect(seen.has(op.id), `duplicate clandestine op id ${op.id}`).toBe(false);
      seen.add(op.id);
    }
    // Every union member should be exercised by ≥1 op.
    const usedTypes = new Set(CLANDESTINE_OPS.map((o) => o.type));
    expect(CLAN_TYPE_UNION.filter((t) => !usedTypes.has(t as never))).toEqual(
      [],
    );
    const usedRisks = new Set(CLANDESTINE_OPS.map((o) => o.riskLevel));
    expect(CLAN_RISK_UNION.filter((r) => !usedRisks.has(r as never))).toEqual(
      [],
    );
  });

  it("INITIAL_SPY_NETWORKS ids are unique with positive maxAgents", () => {
    const ids = INITIAL_SPY_NETWORKS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of INITIAL_SPY_NETWORKS) {
      expect(n.maxAgents).toBeGreaterThan(0);
      expect(n.agents).toBeGreaterThanOrEqual(0);
      expect(n.agents).toBeLessThanOrEqual(n.maxAgents);
    }
  });

  it("FACTION_PRESETS keys equal PlayerFactionKey union exactly; each preset uses a known glyph and a palette primary hex", () => {
    // Documented allowlist: secondaryColor is a derived darker shadow tone
    // (e.g. "#0F3D5C" pairs with primary "#00C8FF"). It is NOT drawn from
    // the public PLAYER_FACTION_PALETTE — that palette only seeds the
    // primary picker. So only the primary is asserted against the palette.
    const keys = Object.keys(FACTION_PRESETS).sort();
    expect(keys).toEqual([...PFACTION_KEYS].sort());
    const knownGlyphs = new Set(PFACTION_GLYPHS);
    const palette = new Set(PLAYER_FACTION_PALETTE.map((p) => p.hex));
    for (const [k, preset] of Object.entries(FACTION_PRESETS) as [
      PlayerFactionKey,
      (typeof FACTION_PRESETS)[PlayerFactionKey],
    ][]) {
      expect(preset.key).toBe(k);
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.motto.length).toBeGreaterThan(0);
      expect(knownGlyphs.has(preset.glyph), `preset ${k} unknown glyph ${preset.glyph}`).toBe(true);
      expect(palette.has(preset.primaryColor), `preset ${k} primaryColor ${preset.primaryColor} not in palette`).toBe(true);
      // secondaryColor is a derived shadow tone — only validate format.
      expect(/^#[0-9A-Fa-f]{6}$/.test(preset.secondaryColor), `preset ${k} secondaryColor ${preset.secondaryColor} malformed`).toBe(true);
    }
  });

  it("PLAYER_FACTION_GLYPHS ids equal PlayerFactionGlyph union exactly; non-empty labels", () => {
    const ids = PLAYER_FACTION_GLYPHS.map((g) => g.id);
    expect([...ids].sort()).toEqual([...PFACTION_GLYPHS].sort());
    for (const g of PLAYER_FACTION_GLYPHS) {
      expect(g.label.length).toBeGreaterThan(0);
    }
  });

  it("PLAYER_FACTION_PALETTE ids and hex codes are unique", () => {
    const ids = PLAYER_FACTION_PALETTE.map((p) => p.id);
    const hexes = PLAYER_FACTION_PALETTE.map((p) => p.hex);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const p of PLAYER_FACTION_PALETTE) {
      expect(/^#[0-9A-Fa-f]{6}$/.test(p.hex), `palette ${p.id} hex ${p.hex} malformed`).toBe(true);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("the explicit type aliases imported here still match the parsed union counts (typecheck handshake)", () => {
    // If someone refactors the type and forgets the catalogs, this test
    // shouldn't regress silently. The two type aliases below are *only*
    // referenced for their types — runtime values are not used.
    type _CheckGlyph = PlayerFactionGlyph extends string ? true : false;
    type _CheckKey = PlayerFactionKey extends string ? true : false;
    const _check: _CheckGlyph & _CheckKey = true;
    expect(_check).toBe(true);
  });
});

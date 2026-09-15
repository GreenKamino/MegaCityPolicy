import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createInitialState } from "@/engine/initialState";

/**
 * Drift guard: Faction.type inline literal union coverage.
 *
 *   Faction.type is declared inline in engine/types.ts as
 *     "law" | "criminal" | "corporate" | "underclass" | "cult" | "institutional"
 *   (6 members). It is the source-of-truth driving:
 *     - initialState.factions[].type spawn values
 *     - events.ts hasFactionType("…") prereq registrations
 *     - diplomacyAdvanced.ts faction-type opinion factors
 *
 *   No named TS export pins this union, so a careless edit (adding
 *   a sixth member, renaming one, etc.) would silently drift the
 *   three downstream consumers. We re-parse the inline union
 *   straight from types.ts and assert every consumer's literals
 *   are a subset of (and ≥1x cover) the union.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const INIT_SRC = readFileSync(join(__dirname, "..", "initialState.ts"), "utf8");
const EVENTS_SRC = readFileSync(join(__dirname, "..", "events.ts"), "utf8");
const DIPL_SRC = readFileSync(
  join(__dirname, "..", "diplomacyAdvanced.ts"),
  "utf8",
);

function parseInlineFactionType(src: string): string[] {
  // Match the `type:` field inside `export type Faction = { … };`
  const factionBlock = src.match(/export type Faction\s*=\s*\{([\s\S]*?)\};/);
  expect(factionBlock, "Faction shape not found in types.ts").not.toBeNull();
  const typeLine = factionBlock![1].match(/\n\s*type:\s*([^;]+);/);
  expect(typeLine, "Faction.type field not found").not.toBeNull();
  return (typeLine![1].match(/"([a-zA-Z_]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const FACTION_TYPE = parseInlineFactionType(TYPES_SRC);
const FACTION_TYPE_SET = new Set(FACTION_TYPE);

describe("Faction.type inline literal union coverage drift guard", () => {
  it("union member count is budget-pinned (6)", () => {
    expect(FACTION_TYPE.sort()).toEqual(
      ["law", "criminal", "corporate", "underclass", "cult", "institutional"].sort(),
    );
    expect(FACTION_TYPE.length).toBe(6);
    expect(new Set(FACTION_TYPE).size).toBe(FACTION_TYPE.length);
  });

  it("initialState.factions[].type covers every Faction.type member ≥1x", () => {
    const state = createInitialState();
    const used = new Set<string>();
    for (const f of state.factions) used.add(f.type);
    for (const t of used) {
      expect(FACTION_TYPE_SET.has(t), `unknown spawned faction type ${t}`).toBe(
        true,
      );
    }
    for (const t of FACTION_TYPE) {
      expect(used.has(t), `Faction.type ${t} never spawned`).toBe(true);
    }
  });

  it("events.ts hasFactionType('…') literals are a subset of the union and cover every member ≥1x", () => {
    // Match every hasFactionType("xxx") call (also inside cross-faction
    // composite checks like `hasFactionType("law")(s) && hasFactionType("criminal")(s)`).
    const re = /hasFactionType\("([a-zA-Z_]+)"\)/g;
    const used = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(EVENTS_SRC)) !== null) used.add(m[1]);
    expect(used.size).toBeGreaterThan(0);
    for (const t of used) {
      expect(
        FACTION_TYPE_SET.has(t),
        `events.ts hasFactionType("${t}") not in Faction.type union`,
      ).toBe(true);
    }
    for (const t of FACTION_TYPE) {
      expect(
        used.has(t),
        `Faction.type ${t} unused by any events.ts hasFactionType prereq`,
      ).toBe(true);
    }
  });

  it("diplomacyAdvanced.ts faction.type === '…' literals are a subset of the union", () => {
    const re = /faction\.type\s*===\s*"([a-zA-Z_]+)"/g;
    const used = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(DIPL_SRC)) !== null) used.add(m[1]);
    expect(used.size).toBeGreaterThan(0);
    for (const t of used) {
      expect(
        FACTION_TYPE_SET.has(t),
        `diplomacyAdvanced.ts faction.type === "${t}" not in union`,
      ).toBe(true);
    }
  });
});

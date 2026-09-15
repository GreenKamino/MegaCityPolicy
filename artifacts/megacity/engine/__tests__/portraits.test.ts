import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import type { FactionLeader } from "@/engine/types";

/**
 * Portrait assets that are wired into PORTRAIT_MAP but are not referenced by
 * any seeded leader's portraitId nor by any NAME_TO_PORTRAIT mapping. They
 * exist on disk and in code but are unreachable from gameplay — they are
 * leftover from removed or renamed leaders.
 *
 * To clear an entry: either restore the leader (so a portraitId or name
 * mapping points to it) or delete the orphan (the require() in
 * utils/portraits.ts AND the .webp in assets/portraits/), then remove the
 * id below.
 */
const ORPHAN_PORTRAIT_ALLOWLIST = new Set<string>(["rivet_caine"]);

const PORTRAITS_TS = path.resolve(__dirname, "../../utils/portraits.ts");
const PORTRAITS_DIR = path.resolve(__dirname, "../../assets/portraits");

/**
 * Extract the top-level object literal that follows a given declaration name
 * (e.g. "PORTRAIT_MAP"). Walks brace depth so nested literals do not confuse
 * the boundary.
 */
function extractObjectLiteral(src: string, declName: string): string {
  const idx = src.indexOf(declName);
  if (idx < 0) throw new Error(`declaration not found: ${declName}`);
  const open = src.indexOf("{", idx);
  if (open < 0) throw new Error(`opening brace not found for ${declName}`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`closing brace not found for ${declName}`);
}

/**
 * Read PORTRAIT_MAP and NAME_TO_PORTRAIT by evaluating their object literals
 * with `require(...)` stubbed to a sentinel. This is robust to any formatting
 * change in utils/portraits.ts — if the file no longer parses as JS, the test
 * fails loudly rather than silently under-counting.
 */
function readPortraitMaps(): { mapKeys: Set<string>; nameToId: Map<string, string> } {
  const src = fs.readFileSync(PORTRAITS_TS, "utf8");
  const mapLiteral = extractObjectLiteral(src, "PORTRAIT_MAP");
  const nameLiteral = extractObjectLiteral(src, "NAME_TO_PORTRAIT");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evalLiteral = (literal: string): Record<string, any> => {
    // Stub require() so webp imports do not blow up under Node.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const fn = new Function("require", `return (${literal});`);
    return fn(() => "__stub__");
  };

  const mapObj = evalLiteral(mapLiteral);
  const nameObj = evalLiteral(nameLiteral);

  return {
    mapKeys: new Set(Object.keys(mapObj)),
    nameToId: new Map(Object.entries(nameObj) as [string, string][]),
  };
}

function collectLeaders(): FactionLeader[] {
  const leaders: FactionLeader[] = [];
  const state = createInitialState();
  for (const f of state.factions ?? []) if (f.leader) leaders.push(f.leader);
  for (const t of state.townships ?? []) if (t.leader) leaders.push(t.leader);
  for (const m of state.externalMegacities ?? []) if (m.leader) leaders.push(m.leader);
  return leaders;
}

describe("portrait asset registry", () => {
  const { mapKeys, nameToId } = readPortraitMaps();
  const leaders = collectLeaders();

  it("parses both portrait maps with non-trivial entry counts", () => {
    expect(mapKeys.size).toBeGreaterThan(20);
    expect(nameToId.size).toBeGreaterThan(20);
  });

  it("parses the same number of entries the source file textually contains", () => {
    // Defense against any future drift in extractObjectLiteral / evalLiteral:
    // count entries directly in the source text and assert agreement.
    const src = fs.readFileSync(PORTRAITS_TS, "utf8");
    const mapLiteralText = extractObjectLiteral(src, "PORTRAIT_MAP");
    const nameLiteralText = extractObjectLiteral(src, "NAME_TO_PORTRAIT");
    const requireCount = (mapLiteralText.match(/require\s*\(/g) ?? []).length;
    const nameMappingCount = (nameLiteralText.match(/"\s*:\s*"/g) ?? []).length;
    expect(mapKeys.size, "evaluated PORTRAIT_MAP key count vs require() count").toBe(requireCount);
    expect(nameToId.size, "evaluated NAME_TO_PORTRAIT entry count vs colon-string-pair count").toBe(
      nameMappingCount,
    );
  });

  it("PORTRAIT_MAP keys all correspond to a .webp file on disk", () => {
    const onDisk = new Set(
      fs
        .readdirSync(PORTRAITS_DIR)
        .filter((f) => f.endsWith(".webp"))
        .map((f) => f.replace(/\.webp$/, "")),
    );
    const missing = [...mapKeys].filter((k) => !onDisk.has(k));
    expect(
      missing,
      "PORTRAIT_MAP key has no matching .webp file in assets/portraits/",
    ).toEqual([]);
  });

  it("every .webp in assets/portraits/ is wired into PORTRAIT_MAP", () => {
    const onDisk = fs
      .readdirSync(PORTRAITS_DIR)
      .filter((f) => f.endsWith(".webp"))
      .map((f) => f.replace(/\.webp$/, ""));
    const orphanFiles = onDisk.filter((f) => !mapKeys.has(f));
    expect(
      orphanFiles,
      "Portrait .webp on disk has no PORTRAIT_MAP entry — add a require() in utils/portraits.ts or delete the file",
    ).toEqual([]);
  });

  it("NAME_TO_PORTRAIT values all resolve in PORTRAIT_MAP", () => {
    const broken: string[] = [];
    for (const [name, id] of nameToId) {
      if (!mapKeys.has(id)) broken.push(`"${name}" -> ${id}`);
    }
    expect(
      broken,
      "NAME_TO_PORTRAIT entry maps a leader name to a portrait id that PORTRAIT_MAP does not define",
    ).toEqual([]);
  });

  it("NAME_TO_PORTRAIT only references leaders that exist in initialState", () => {
    const seeded = new Set(leaders.map((l) => l.name));
    const stale = [...nameToId.keys()].filter((n) => !seeded.has(n));
    expect(
      stale,
      "NAME_TO_PORTRAIT entry refers to a leader that is no longer seeded — remove it",
    ).toEqual([]);
  });

  it("every seeded leader portraitId is wired into PORTRAIT_MAP", () => {
    const broken: string[] = [];
    for (const leader of leaders) {
      if (!leader.portraitId) continue;
      if (!mapKeys.has(leader.portraitId)) {
        broken.push(`${leader.name} -> ${leader.portraitId}`);
      }
    }
    expect(
      broken,
      "Leader portraitId not present in PORTRAIT_MAP — getPortrait will return null in-game",
    ).toEqual([]);
  });

  it("PORTRAIT_MAP has no unreachable entries beyond the documented allowlist", () => {
    const portraitIdRefs = new Set<string>();
    for (const leader of leaders) {
      if (leader.portraitId) portraitIdRefs.add(leader.portraitId);
    }
    const nameMappingValues = new Set(nameToId.values());

    const unreachable: string[] = [];
    const allowedButReachable: string[] = [];
    for (const key of mapKeys) {
      // Player commander portraits are reachable via the new-game and
      // Character-screen pickers (PLAYER_PORTRAIT_GALLERY in
      // utils/portraits.ts). They have no NPC leader pointing at them, so
      // the "player_" prefix check below is the contract that keeps them out
      // of the orphan list.
      const isPlayerPortrait = key.startsWith("player_");
      const reachable = portraitIdRefs.has(key) || nameMappingValues.has(key) || isPlayerPortrait;
      const isAllowed = ORPHAN_PORTRAIT_ALLOWLIST.has(key);
      if (!reachable && !isAllowed) unreachable.push(key);
      if (reachable && isAllowed) allowedButReachable.push(key);
    }
    expect(
      unreachable,
      "Portrait wired into PORTRAIT_MAP but no leader resolves to it — wire it to a leader or add to ORPHAN_PORTRAIT_ALLOWLIST",
    ).toEqual([]);
    expect(
      allowedButReachable,
      "Portrait now reachable via a leader — remove from ORPHAN_PORTRAIT_ALLOWLIST",
    ).toEqual([]);
  });

  it("ORPHAN_PORTRAIT_ALLOWLIST only references portraits that still exist", () => {
    const stale = [...ORPHAN_PORTRAIT_ALLOWLIST].filter((k) => !mapKeys.has(k));
    expect(
      stale,
      "ORPHAN_PORTRAIT_ALLOWLIST entry no longer exists in PORTRAIT_MAP — remove it",
    ).toEqual([]);
  });
});

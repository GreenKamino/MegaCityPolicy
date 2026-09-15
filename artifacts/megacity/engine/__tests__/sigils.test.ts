import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { WORLD_LOCATIONS } from "@/engine/worldMap";

/**
 * Drift guard for the megacity banner sigils (utils/sigils.ts +
 * assets/sigils/*.webp), mirroring engine/__tests__/portraits.test.ts.
 *
 * Every SIGIL_MAP key must be a real world-map location id (that is the
 * shared id space with externalMegacities), and every sigil file on disk
 * must be wired into the map. Partners without sigil art (Mega-Habana,
 * nations, settlements) intentionally fall back to their vector icon.
 */

const SIGILS_TS = path.resolve(__dirname, "../../utils/sigils.ts");
const SIGILS_DIR = path.resolve(__dirname, "../../assets/sigils");

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

function readSigilMap(): { keys: Set<string>; fileForKey: Map<string, string> } {
  const src = fs.readFileSync(SIGILS_TS, "utf8");
  const literal = extractObjectLiteral(src, "SIGIL_MAP");
  const fileForKey = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function("require", `return (${literal});`);
  const obj = fn((p: string) => p) as Record<string, string>;
  for (const [k, v] of Object.entries(obj)) {
    fileForKey.set(k, path.basename(String(v)));
  }
  return { keys: new Set(Object.keys(obj)), fileForKey };
}

describe("megacity sigil registry", () => {
  const { keys, fileForKey } = readSigilMap();

  it("parses with the expected 11 entries (player city + 10 sigiled megacities)", () => {
    expect(keys.size).toBe(11);
    const src = fs.readFileSync(SIGILS_TS, "utf8");
    const literal = extractObjectLiteral(src, "SIGIL_MAP");
    const requireCount = (literal.match(/require\s*\(/g) ?? []).length;
    expect(keys.size, "evaluated SIGIL_MAP key count vs require() count").toBe(requireCount);
  });

  it("every SIGIL_MAP key is a real world-map location id", () => {
    const locIds = new Set(WORLD_LOCATIONS.map((l) => l.id));
    const unknown = [...keys].filter((k) => !locIds.has(k));
    expect(
      unknown,
      "SIGIL_MAP key does not match any worldMap.ts location id — sigil would never render",
    ).toEqual([]);
  });

  it("every SIGIL_MAP key except the player city is a megacity location", () => {
    const typeById = new Map(WORLD_LOCATIONS.map((l) => [l.id, l.type]));
    const wrongType = [...keys].filter((k) => {
      const t = typeById.get(k);
      return t !== "megacity" && t !== "player_city";
    });
    expect(
      wrongType,
      "SIGIL_MAP is megacity-only art — non-megacity ids do not belong here",
    ).toEqual([]);
  });

  it("every diplomacy partner sigil key matches an externalMegacities id or the player city", () => {
    const state = createInitialState();
    const partnerIds = new Set((state.externalMegacities ?? []).map((m) => m.id));
    // Keys must be reachable from at least one render site: the world map
    // covers all of them; diplomacy additionally needs partner ids to match.
    const partnerBacked = [...keys].filter((k) => partnerIds.has(k));
    expect(
      partnerBacked.length,
      "expected at least the six sheet megacities that are diplomacy partners to key by partner id",
    ).toBeGreaterThanOrEqual(6);
  });

  it("SIGIL_MAP entries all correspond to a .webp file on disk", () => {
    const onDisk = new Set(fs.readdirSync(SIGILS_DIR).filter((f) => f.endsWith(".webp")));
    const missing = [...fileForKey.entries()]
      .filter(([, file]) => !onDisk.has(file))
      .map(([k, file]) => `${k} -> ${file}`);
    expect(missing, "SIGIL_MAP entry has no matching .webp in assets/sigils/").toEqual([]);
  });

  it("every .webp in assets/sigils/ is wired into SIGIL_MAP", () => {
    const wired = new Set(fileForKey.values());
    const orphans = fs
      .readdirSync(SIGILS_DIR)
      .filter((f) => f.endsWith(".webp") && !wired.has(f));
    expect(
      orphans,
      "Sigil .webp on disk has no SIGIL_MAP entry — add a require() in utils/sigils.ts or delete the file",
    ).toEqual([]);
  });
});

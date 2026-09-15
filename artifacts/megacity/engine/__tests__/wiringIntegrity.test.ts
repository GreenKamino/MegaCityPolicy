import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { ALL_EDICTS } from "@/engine/edicts";
import { POLICY_MAP } from "@/engine/policies";
import { TECH_MAP, ALL_TECHNOLOGIES } from "@/engine/technologies";

/**
 * Cross-catalog id-reference drift guard. Many parts of the engine reference
 * ids from other catalogs by string literal:
 *   - achievement check() functions test edict / policy / tech ids
 *   - tech defs declare prerequisites by tech id
 *   - tickProcessors wires officer events to OFFICER_RESPONSE_MAP keys
 * If a referenced id is renamed or removed in its source-of-truth catalog
 * but the consumer is not updated, the lookup silently returns false /
 * undefined and the achievement (or feature) becomes unreachable.
 *
 * This file does static analysis (regex over source) plus runtime catalog
 * lookups so a missing id is a hard test failure rather than a silent dead
 * feature.
 */

const ENGINE_DIR = path.resolve(__dirname, "..");

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(ENGINE_DIR, relPath), "utf8");
}

const VALID_EDICT_IDS = new Set(ALL_EDICTS.map((e) => e.id));
const VALID_POLICY_IDS = new Set(Object.keys(POLICY_MAP));
const VALID_TECH_IDS = new Set(Object.keys(TECH_MAP));

describe("achievements -> source catalog wiring", () => {
  const achievementsSrc = readSource("achievements.ts");

  it("every edictId === \"...\" reference resolves in ALL_EDICTS", () => {
    const broken: string[] = [];
    const re = /edictId\s*===\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(achievementsSrc))) {
      const id = m[1]!;
      if (!VALID_EDICT_IDS.has(id)) broken.push(id);
    }
    expect(
      broken,
      "Achievement check() references an edict id not in ALL_EDICTS — achievement unreachable",
    ).toEqual([]);
  });

  it("every activePolicies.includes(\"...\") reference resolves in POLICY_MAP", () => {
    const broken: string[] = [];
    const re = /activePolicies\??\.includes\("([^"]+)"\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(achievementsSrc))) {
      const id = m[1]!;
      if (!VALID_POLICY_IDS.has(id)) broken.push(id);
    }
    expect(
      broken,
      "Achievement check() references a policy id not in POLICY_MAP — achievement unreachable",
    ).toEqual([]);
  });

  it("every unlockedTechnologies.includes(\"...\") reference resolves in TECH_MAP", () => {
    const broken: string[] = [];
    // Match strict property-chain patterns only — broad regexes bridge
    // across `&&` into unrelated activePolicies.includes calls and produce
    // false positives:
    //   s.unlockedTechnologies.includes("foo")
    //   (s.unlockedTechnologies ?? []).includes("foo")
    //   sdTechCheck("foo")  — closure helper that does the same
    const patterns = [
      /\(s\.unlockedTechnologies\s*\?\?\s*\[\]\)\.includes\("([^"]+)"\)/g,
      /s\.unlockedTechnologies\.includes\("([^"]+)"\)/g,
      /sdTechCheck\("([^"]+)"\)/g,
    ];
    let m: RegExpExecArray | null;
    for (const re of patterns) {
      while ((m = re.exec(achievementsSrc))) {
        const id = m[1]!;
        if (!VALID_TECH_IDS.has(id)) broken.push(id);
      }
    }
    expect(
      broken,
      "Achievement check() references a tech id not in TECH_MAP — achievement unreachable",
    ).toEqual([]);
  });
});

describe("technologies -> TECH_MAP self-consistency", () => {
  it("every prerequisite id resolves in TECH_MAP", () => {
    const broken: string[] = [];
    for (const tech of ALL_TECHNOLOGIES) {
      for (const prereq of tech.prerequisites) {
        if (!VALID_TECH_IDS.has(prereq)) {
          broken.push(`${tech.id} prereq "${prereq}"`);
        }
      }
    }
    expect(
      broken,
      "Tech declares a prerequisite id that doesn't exist — tech permanently unresearchable",
    ).toEqual([]);
  });

  it("no tech lists itself as a prerequisite (immediate cycle)", () => {
    const selfCycles: string[] = [];
    for (const tech of ALL_TECHNOLOGIES) {
      if (tech.prerequisites.includes(tech.id)) selfCycles.push(tech.id);
    }
    expect(selfCycles).toEqual([]);
  });

  it("tech ids are unique across ALL_TECHNOLOGIES (no catalog collisions)", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const tech of ALL_TECHNOLOGIES) {
      if (seen.has(tech.id)) dupes.push(tech.id);
      seen.add(tech.id);
    }
    expect(
      dupes,
      "Same tech id in two catalogs — TECH_MAP entry will be overwritten by load order",
    ).toEqual([]);
  });
});

describe("officer events -> OFFICER_RESPONSE_MAP wiring", () => {
  const tickSrc = readSource("tickProcessors.ts");

  /** Extract OFFICER_RESPONSE_MAP literal keys via brace-walk to avoid
   *  fragile multi-line regex on responses arrays. */
  function extractMapKeys(src: string, declRegex: RegExp): Set<string> {
    const m = declRegex.exec(src);
    if (!m) throw new Error(`OFFICER_RESPONSE_MAP declaration not found`);
    let i = src.indexOf("{", m.index);
    const start = i + 1;
    let depth = 1;
    let end = start;
    while (depth > 0 && i < src.length - 1) {
      i++;
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (depth === 0) { end = i; break; }
    }
    const body = src.slice(start, end);
    const keyRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
    const keys = new Set<string>();
    let km: RegExpExecArray | null;
    // Only top-level keys (depth 0 within the object body).
    let d = 0;
    for (let j = 0; j < body.length; j++) {
      const c = body[j];
      if (c === "{" || c === "[") d++;
      else if (c === "}" || c === "]") d--;
    }
    // Simpler: walk char by char, capture identifiers immediately after a
    // top-level "{" or "," at depth 0.
    let depth2 = 0;
    let pendingKey = true;
    let buf = "";
    for (let j = 0; j < body.length; j++) {
      const c = body[j]!;
      if (c === "{" || c === "[") { depth2++; pendingKey = false; continue; }
      if (c === "}" || c === "]") { depth2--; continue; }
      if (depth2 === 0) {
        if (pendingKey) {
          if (/[a-zA-Z0-9_]/.test(c)) buf += c;
          else if (c === ":") {
            if (buf.length > 0) keys.add(buf);
            buf = "";
            pendingKey = false;
          } else if (/\s/.test(c)) {
            // ignore whitespace within a key
          } else {
            buf = "";
          }
        } else if (c === ",") {
          pendingKey = true;
        }
      }
    }
    // Fallback: if brace-walker failed, try the simple regex.
    if (keys.size === 0) {
      while ((km = keyRe.exec(body))) keys.add(km[1]!);
    }
    return keys;
  }

  const definedKeys = extractMapKeys(tickSrc, /const OFFICER_RESPONSE_MAP\b/);

  it("every consumer-side OFFICER_RESPONSE_MAP[\"...\"] key is defined in the map", () => {
    const consumed: string[] = [];
    const re = /OFFICER_RESPONSE_MAP\["([^"]+)"\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tickSrc))) consumed.push(m[1]!);
    const missing = consumed.filter((k) => !definedKeys.has(k));
    expect(
      missing,
      "tickProcessors consumes an officer response key not present in OFFICER_RESPONSE_MAP — responseOptions=undefined",
    ).toEqual([]);
  });

  it("every defined OFFICER_RESPONSE_MAP key is consumed somewhere (no orphan responses)", () => {
    const consumedSet = new Set<string>();
    const re = /OFFICER_RESPONSE_MAP\["([^"]+)"\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tickSrc))) consumedSet.add(m[1]!);
    const orphans = [...definedKeys].filter((k) => !consumedSet.has(k));
    expect(
      orphans,
      "OFFICER_RESPONSE_MAP defines a response set never wired to any officer event",
    ).toEqual([]);
  });
});

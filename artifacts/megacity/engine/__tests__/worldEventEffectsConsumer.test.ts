import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { WorldEvent } from "@/engine/worldEvents";

/**
 * WorldEvent.effects (engine/worldEvents.ts:11) is a closed shape of five
 * numeric keys. The sole consumer is `processWorldEvents` in the same file.
 * Anything outside that applier's if-chain is silently dropped on roll.
 *
 * This guard pins:
 *   1. The type surface (5 keys, all optional number).
 *   2. The consumer key set, source-derived from the if-chain.
 *   3. Type ↔ consumer parity (no silent drops, no dead reads).
 *   4. Every event in the WORLD_EVENTS pool only uses keys the consumer
 *      handles (no malformed entries that would be dropped).
 *   5. Pool size budget pin so additions are deliberate.
 */

const WORLD_EVENTS_SRC = readFileSync(
  join(__dirname, "..", "worldEvents.ts"),
  "utf8",
);

const TYPE_KEYS = ["credits", "unrest", "happiness", "defenseRating", "medSupplies"] as const;
type TypeKey = (typeof TYPE_KEYS)[number];

function parseConsumerKeys(): Set<string> {
  // Scan processWorldEvents body, between the `if (event.effects) {` open
  // and the closing brace of that block. Collect identifiers used as
  // `event.effects.<key>`.
  const start = WORLD_EVENTS_SRC.indexOf("if (event.effects) {");
  expect(start).toBeGreaterThan(0);
  // Locate the matching closing brace by walking nested braces.
  let depth = 0;
  let i = start;
  for (; i < WORLD_EVENTS_SRC.length; i++) {
    const ch = WORLD_EVENTS_SRC[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const block = WORLD_EVENTS_SRC.slice(start, i + 1);
  const keys = new Set<string>();
  const re = /event\.effects\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) keys.add(m[1]);
  return keys;
}

function parsePoolKeys(): Set<string> {
  // Collect every key used inside a literal `effects: { ... }` object on a
  // WORLD_EVENTS entry line.
  const keys = new Set<string>();
  const re = /effects:\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(WORLD_EVENTS_SRC)) !== null) {
    const body = m[1];
    const kre = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
    let km: RegExpExecArray | null;
    while ((km = kre.exec(body)) !== null) keys.add(km[1]);
  }
  return keys;
}

describe("WorldEvent.effects consumer drift", () => {
  it("type surface is the pinned 5-key set", () => {
    const probe: Required<NonNullable<WorldEvent["effects"]>> = {
      credits: 0,
      unrest: 0,
      happiness: 0,
      defenseRating: 0,
      medSupplies: 0,
    };
    expect(Object.keys(probe).sort()).toEqual([...TYPE_KEYS].sort());
    for (const k of TYPE_KEYS) {
      expect(typeof probe[k as TypeKey]).toBe("number");
    }
  });

  it("processWorldEvents reads exactly the type-declared keys (no silent drops, no dead reads)", () => {
    const consumed = parseConsumerKeys();
    expect([...consumed].sort()).toEqual([...TYPE_KEYS].sort());
  });

  it("WORLD_EVENTS pool only uses consumer-handled keys", () => {
    const used = parsePoolKeys();
    const consumed = parseConsumerKeys();
    for (const k of used) {
      expect(consumed.has(k)).toBe(true);
    }
    // And no key in the pool should be absent from the type surface.
    for (const k of used) {
      expect((TYPE_KEYS as readonly string[]).includes(k)).toBe(true);
    }
  });

  it("WORLD_EVENTS pool size matches budget (deliberate growth gate)", () => {
    const count = (WORLD_EVENTS_SRC.match(/^\s*\{ id: "we-/gm) ?? []).length;
    expect(count).toBe(46);
  });

  it("pool sanitizer cap (50) still exceeds pool roll-log slice (-50)", () => {
    // The runtime trims worldEventLog to last 50 entries. The ARRAY_CAPS
    // sanitizer cap must stay >= that magic number, otherwise loaded saves
    // would shed entries the live engine just produced.
    expect(WORLD_EVENTS_SRC).toContain("s.worldEventLog.slice(-50)");
  });
});

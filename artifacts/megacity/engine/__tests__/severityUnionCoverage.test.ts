import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Drift guard: TickEntry.severity(4) and GameEvent.severity(4)
 * inline unions vs runtime emissions across every engine producer.
 *
 *   TickEntry.severity        ↔ severity:"positive|negative|
 *                                neutral|warning" emissions in
 *                                engine/*.ts. Every union member
 *                                must be emitted by ≥1 engine
 *                                module (orphan = dead branch in
 *                                tick-feed coloring).
 *
 *   GameEvent.severity        ↔ severity:"low|medium|high|
 *                                critical" emissions in engine
 *                                event-catalog files. Every union
 *                                member must be emitted; emitted
 *                                set ⊆ union.
 *
 *   Catalog budgets are pinned to today's emission counts (with
 *   small slack) — accidental drops to zero for any severity, or
 *   massive shifts in distribution, fail the test.
 *
 *   Both unions are inline on their owner type; parsed straight
 *   from types.ts via parseInlineFieldUnion.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");

const TICK_PRODUCERS = [
  "formulas.ts",
  "mapEncounters.ts",
  "tickProcessors.ts",
  "newSystems.ts",
  "overviewWarnings.ts",
  "miningData.ts",
  "megafaunaHunts.ts",
  "diplomacyAdvanced.ts",
  "districtExpansion.ts",
  "diplomacyEngine.ts",
] as const;

const EVENT_PRODUCERS = [
  "events.ts",
  "eventChains.ts",
  "crimeTypes.ts",
  "businessEventChains.ts",
  "eventTriggers.ts",
  "tickProcessors.ts",
  "overviewWarnings.ts",
  "researchEventChain.ts",
  "miningData.ts",
] as const;

function parseInlineFieldUnion(
  src: string,
  ownerType: string,
  field: string,
): string[] {
  const re = new RegExp(`export type ${ownerType}\\s*=\\s*\\{([\\s\\S]*?)\\};`);
  const owner = src.match(re);
  expect(owner, `owner type ${ownerType} not found`).not.toBeNull();
  const fre = new RegExp(`${field}:\\s*([^;]+);`);
  const f = owner![1].match(fre);
  expect(f, `field ${ownerType}.${field} not found`).not.toBeNull();
  return (f![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function readEngine(name: string): string {
  return readFileSync(join(__dirname, "..", name), "utf8");
}

function emitsByPattern(srcs: readonly string[], re: RegExp): Set<string> {
  const out = new Set<string>();
  for (const name of srcs) {
    const src = readEngine(name);
    const matches = src.match(re) ?? [];
    for (const m of matches) {
      const v = m.match(/"([^"]+)"/);
      if (v) out.add(v[1]);
    }
  }
  return out;
}

const TICK_SEVERITY = parseInlineFieldUnion(TYPES_SRC, "TickEntry", "severity");
const EVENT_SEVERITY = parseInlineFieldUnion(TYPES_SRC, "GameEvent", "severity");

describe("severity union coverage drift guard", () => {
  it("inline union member counts are budget-pinned", () => {
    expect([...TICK_SEVERITY].sort()).toEqual(
      ["negative", "neutral", "positive", "warning"].sort(),
    );
    expect([...EVENT_SEVERITY].sort()).toEqual(
      ["critical", "high", "low", "medium"].sort(),
    );
  });

  it("TickEntry.severity emissions across producers cover every union member", () => {
    const re = /severity:\s*"(positive|negative|neutral|warning)"/g;
    const emitted = emitsByPattern(TICK_PRODUCERS, re);
    const known = new Set(TICK_SEVERITY);
    for (const e of emitted) {
      expect(known.has(e), `tick producer emits unknown severity ${e}`).toBe(true);
    }
    for (const u of known) {
      expect(emitted.has(u), `TickEntry.severity ${u} never emitted by any tick producer`).toBe(true);
    }
  });

  it("GameEvent.severity emissions across event catalogs cover every union member", () => {
    const re = /severity:\s*"(low|medium|high|critical)"/g;
    const emitted = emitsByPattern(EVENT_PRODUCERS, re);
    const known = new Set(EVENT_SEVERITY);
    for (const e of emitted) {
      expect(known.has(e), `event producer emits unknown severity ${e}`).toBe(true);
    }
    for (const u of known) {
      expect(emitted.has(u), `GameEvent.severity ${u} never emitted by any event catalog`).toBe(true);
    }
  });

  it("event-catalog severity distribution is non-degenerate (each member ≥ 25 emissions)", () => {
    // Today: low=189, medium=205, high=263, critical=157. Floor at 25 catches
    // an accidental purge of one severity tier without being so tight that
    // ordinary content tuning trips it.
    const counts: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    const re = /severity:\s*"(low|medium|high|critical)"/g;
    for (const name of EVENT_PRODUCERS) {
      const src = readEngine(name);
      const matches = src.match(re) ?? [];
      for (const m of matches) {
        const v = m.match(/"([^"]+)"/)![1];
        counts[v] = (counts[v] ?? 0) + 1;
      }
    }
    for (const sev of EVENT_SEVERITY) {
      expect(counts[sev], `event severity ${sev} dropped to ${counts[sev]} emissions`).toBeGreaterThanOrEqual(25);
    }
  });

  it("tick-feed severity distribution is non-degenerate (each member ≥ 10 emissions)", () => {
    // Today: positive=73, warning=41, negative=30, neutral=25. Floor at 10
    // catches accidental removal of a severity branch.
    const counts: Record<string, number> = {
      positive: 0,
      negative: 0,
      neutral: 0,
      warning: 0,
    };
    const re = /severity:\s*"(positive|negative|neutral|warning)"/g;
    for (const name of TICK_PRODUCERS) {
      const src = readEngine(name);
      const matches = src.match(re) ?? [];
      for (const m of matches) {
        const v = m.match(/"([^"]+)"/)![1];
        counts[v] = (counts[v] ?? 0) + 1;
      }
    }
    for (const sev of TICK_SEVERITY) {
      expect(counts[sev], `tick severity ${sev} dropped to ${counts[sev]} emissions`).toBeGreaterThanOrEqual(10);
    }
  });
});

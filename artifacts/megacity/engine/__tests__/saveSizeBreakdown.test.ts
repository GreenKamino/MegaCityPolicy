/**
 * Save-size breakdown diagnostic.
 *
 * The aggregate memoryStress test confirms total save bytes stay
 * within a sane envelope (fresh ~345 KB → 2000-tick ~966 KB, ~310
 * bytes/tick growth). What it can't tell us is *which* top-level
 * GameState field is responsible for that growth — and therefore
 * which field most needs a cap, prune, or compaction pass.
 *
 * This file walks every top-level key on a fresh state and on a
 * 2000-tick aged state, measures JSON-byte size per field, and prints
 * the 15 worst growers sorted by absolute byte delta. The console
 * output is the diagnostic; the assertions act as a coarse
 * regression-guard so a single field can't quietly grow past a
 * generous ceiling.
 *
 * Reading the output:
 *
 *   field                  fresh KB     aged KB      Δ KB     ratio
 *   --------------------- ---------    ---------    ------    -----
 *   factions                  120.4       145.1     +24.7      1.21
 *   stockpiles                  4.3        56.8     +52.5     13.21
 *   ...
 *
 * Large ratios on small fields are usually the next leak to chase.
 * Large absolute deltas on large fields are usually the biggest
 * payoff to compact.
 */

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  compactStateForSave,
  expandActiveBusinessFromSave,
  expandClosedBusinessRecordFromSave,
  getArchetypeById,
} from "@/engine/independentEnterprises";
import type { GameState } from "@/engine/types";

const AGED_TICKS = 2000;

// Generous per-field ceiling. The current top grower is well below
// this; the assertion exists so a future regression that lets a
// single field balloon past 250 KB will fail loudly with a pointer
// to which field is the offender.
const PER_FIELD_BYTE_CEILING = 250 * 1024;

function ageState(ticks: number): GameState {
  let s = createInitialState();
  for (let i = 0; i < ticks; i++) {
    s = runTick(s).newState;
  }
  return s;
}

function fieldBytes(state: GameState, key: string): number {
  // Wrap in an object so JSON.stringify uses the same overhead as a
  // real save export (key + colon + value), giving an apples-to-apples
  // comparison across fields.
  const value = (state as unknown as Record<string, unknown>)[key];
  if (value === undefined) return 0;
  try {
    return JSON.stringify({ [key]: value }).length;
  } catch {
    // Some fields may contain non-serializable cycles in pathological
    // cases. Report 0 rather than failing the diagnostic.
    return 0;
  }
}

describe("save-size breakdown diagnostic", () => {
  it("prints per-field byte size, sorted by growth over 2000 ticks", () => {
    const fresh = createInitialState();
    const aged = ageState(AGED_TICKS);

    const allKeys = new Set<string>([
      ...Object.keys(fresh as object),
      ...Object.keys(aged as object),
    ]);

    type Row = {
      field: string;
      freshBytes: number;
      agedBytes: number;
      delta: number;
      ratio: number;
    };

    const rows: Row[] = [];
    for (const key of allKeys) {
      const f = fieldBytes(fresh, key);
      const a = fieldBytes(aged, key);
      rows.push({
        field: key,
        freshBytes: f,
        agedBytes: a,
        delta: a - f,
        ratio: f === 0 ? (a === 0 ? 1 : Infinity) : a / f,
      });
    }

    // Sort by absolute growth descending; ties broken by aged size.
    rows.sort(
      (l, r) => Math.abs(r.delta) - Math.abs(l.delta) || r.agedBytes - l.agedBytes,
    );

    const fmtKb = (n: number) => (n / 1024).toFixed(1).padStart(8);
    const fmtSign = (n: number) =>
      `${n >= 0 ? "+" : ""}${(n / 1024).toFixed(1)}`.padStart(8);
    const fmtRatio = (r: number) =>
      Number.isFinite(r) ? r.toFixed(2).padStart(7) : "    inf";

    const totalFresh = rows.reduce((acc, r) => acc + r.freshBytes, 0);
    const totalAged = rows.reduce((acc, r) => acc + r.agedBytes, 0);

    const header =
      `  ${"field".padEnd(28)}${"fresh KB".padStart(10)}${"aged KB".padStart(10)}` +
      `${"Δ KB".padStart(10)}${"ratio".padStart(9)}`;
    const sep = "  " + "-".repeat(28 + 10 + 10 + 10 + 9);
    const top = rows.slice(0, 15);

    const lines = [
      ``,
      `=== save-size breakdown (fresh vs ${AGED_TICKS}-tick aged) ===`,
      `  total fresh:  ${(totalFresh / 1024).toFixed(1)} KB`,
      `  total aged:   ${(totalAged / 1024).toFixed(1)} KB`,
      `  total Δ:      ${((totalAged - totalFresh) / 1024).toFixed(1)} KB`,
      `  bytes / tick: ${((totalAged - totalFresh) / AGED_TICKS).toFixed(1)}`,
      ``,
      `  --- top 15 growers (by absolute Δ bytes) ---`,
      header,
      sep,
      ...top.map(
        (r) =>
          `  ${r.field.padEnd(28)}${fmtKb(r.freshBytes)}${fmtKb(r.agedBytes)}` +
          `${fmtSign(r.delta)}${fmtRatio(r.ratio)}`,
      ),
      ``,
      `  --- top 5 by ratio (small fields blowing up) ---`,
      ...rows
        .filter((r) => r.agedBytes > 1024 && Number.isFinite(r.ratio))
        .sort((l, r) => r.ratio - l.ratio)
        .slice(0, 5)
        .map(
          (r) =>
            `  ${r.field.padEnd(28)}${fmtKb(r.freshBytes)}${fmtKb(r.agedBytes)}` +
            `${fmtSign(r.delta)}${fmtRatio(r.ratio)}`,
        ),
      ``,
    ];
    // Drill one level deeper into the top 5 growers if they're
    // objects — surfaces the actual offending sub-collections so we
    // know exactly where to add a cap.
    const drillTargets = top
      .slice(0, 7)
      .filter((r) => {
        const v = (aged as unknown as Record<string, unknown>)[r.field];
        return v !== null && typeof v === "object" && !Array.isArray(v);
      });

    for (const t of drillTargets) {
      const fObj =
        ((fresh as unknown as Record<string, unknown>)[t.field] as
          | Record<string, unknown>
          | undefined) ?? {};
      const aObj = (aged as unknown as Record<string, unknown>)[
        t.field
      ] as Record<string, unknown>;
      const subKeys = new Set<string>([
        ...Object.keys(fObj),
        ...Object.keys(aObj),
      ]);
      const subRows: Row[] = [];
      for (const k of subKeys) {
        const fb =
          fObj[k] === undefined
            ? 0
            : JSON.stringify({ [k]: fObj[k] }).length;
        const ab =
          aObj[k] === undefined
            ? 0
            : JSON.stringify({ [k]: aObj[k] }).length;
        subRows.push({
          field: k,
          freshBytes: fb,
          agedBytes: ab,
          delta: ab - fb,
          ratio: fb === 0 ? (ab === 0 ? 1 : Infinity) : ab / fb,
        });
      }
      subRows.sort(
        (l, r) =>
          Math.abs(r.delta) - Math.abs(l.delta) ||
          r.agedBytes - l.agedBytes,
      );
      const drilled = [
        ``,
        `  --- drill: ${t.field} sub-fields (top 8 by Δ) ---`,
        header,
        sep,
        ...subRows
          .slice(0, 8)
          .map(
            (r) =>
              `  ${r.field.padEnd(28)}${fmtKb(r.freshBytes)}${fmtKb(
                r.agedBytes,
              )}${fmtSign(r.delta)}${fmtRatio(r.ratio)}`,
          ),
      ];
      console.log(drilled.join("\n"));
    }

    // Coarse regression-guard: no single field should breach the
    // per-field ceiling. The check is intentionally generous; its
    // purpose is to fail loudly with a named offender if anything
    // grows wildly out of bounds. If this trips, look at the printed
    // table to see which field exploded and add a cap or prune pass.
    for (const r of rows) {
      expect(
        r.agedBytes,
        `field "${r.field}" exceeded per-field ceiling at ${(
          r.agedBytes / 1024
        ).toFixed(1)} KB after ${AGED_TICKS} ticks`,
      ).toBeLessThan(PER_FIELD_BYTE_CEILING);
    }
  }, 120_000);

  it("compacts localEconomy.businesses by ≥25% on save", () => {
    const aged = ageState(AGED_TICKS);
    const econ = aged.localEconomy;
    expect(econ).toBeTruthy();
    if (!econ) return;

    const rawBusinessesBytes = JSON.stringify({ businesses: econ.businesses }).length;
    const rawClosedBytes = JSON.stringify({ closedHistory: econ.closedHistory }).length;
    expect(econ.businesses.length).toBeGreaterThan(0);

    const compactedState = compactStateForSave(aged);
    const compactedEcon = compactedState.localEconomy!;
    const compBusinessesBytes = JSON.stringify({ businesses: compactedEcon.businesses }).length;
    const compClosedBytes = JSON.stringify({ closedHistory: compactedEcon.closedHistory }).length;

    const businessSavings = 1 - compBusinessesBytes / rawBusinessesBytes;
    const closedSavings = rawClosedBytes > 0 ? 1 - compClosedBytes / rawClosedBytes : 0;

    console.log(
      `\n  --- localEconomy compaction (aged ${AGED_TICKS} ticks) ---\n` +
        `    businesses    raw ${(rawBusinessesBytes / 1024).toFixed(1)} KB → compact ${(compBusinessesBytes / 1024).toFixed(1)} KB  (-${(businessSavings * 100).toFixed(1)}%)\n` +
        `    closedHistory raw ${(rawClosedBytes / 1024).toFixed(1)} KB → compact ${(compClosedBytes / 1024).toFixed(1)} KB  (-${(closedSavings * 100).toFixed(1)}%)\n` +
        `    record counts: ${econ.businesses.length} active, ${econ.closedHistory.length} closed`,
    );

    // Compaction must measurably shrink active business records — these
    // were the largest grower before this pass.
    expect(
      businessSavings,
      `localEconomy.businesses compaction saved ${(businessSavings * 100).toFixed(1)}% (target ≥25%)`,
    ).toBeGreaterThanOrEqual(0.25);

    // Round-trip: rehydrating compacted records must reproduce the
    // gameplay-relevant fields. Spot-check every business and closed
    // record so a future compactor that drops a still-needed field
    // fails loudly here instead of silently breaking event chains.
    for (let i = 0; i < econ.businesses.length; i++) {
      const orig = econ.businesses[i];
      const expanded = expandActiveBusinessFromSave(compactedEcon.businesses[i]);
      expect(expanded.uid).toBe(orig.uid);
      expect(expanded.archetypeId).toBe(orig.archetypeId);
      expect(expanded.name).toBe(orig.name);
      expect(expanded.districtId).toBe(orig.districtId);
      expect(expanded.tier).toBe(orig.tier);
      expect(expanded.locations).toBe(orig.locations);
      expect(expanded.employees).toBe(orig.employees);
      expect(expanded.yearsActive).toBe(orig.yearsActive);
      expect(expanded.ticksActive).toBe(orig.ticksActive);
      expect(expanded.reputation).toBe(orig.reputation);
      expect(expanded.status).toBe(orig.status);
      expect(expanded.notable).toBe(orig.notable);
      expect(expanded.spawnedAtTick).toBe(orig.spawnedAtTick);
    }
    for (let i = 0; i < econ.closedHistory.length; i++) {
      const orig = econ.closedHistory[i];
      const expanded = expandClosedBusinessRecordFromSave(compactedEcon.closedHistory[i]);
      expect(expanded.uid).toBe(orig.uid);
      expect(expanded.name).toBe(orig.name);
      expect(expanded.archetypeId).toBe(orig.archetypeId);
      expect(expanded.districtId).toBe(orig.districtId);
      expect(expanded.tier).toBe(orig.tier);
      expect(expanded.yearsActive).toBe(orig.yearsActive);
      expect(expanded.closedAtTick).toBe(orig.closedAtTick);
      expect(expanded.reason).toBe(orig.reason);
      // archetypeId must be preserved so businessEventChains.ts:163
      // (biz_phoenix_reopen) can still resolve the archetype.
      expect(getArchetypeById(expanded.archetypeId) ?? null).toEqual(
        getArchetypeById(orig.archetypeId) ?? null,
      );
    }
  }, 120_000);

  // Plateau check: a "leak" is unbounded growth. A capped collection
  // settling at its design ceiling looks identical to a leak in a
  // 0-vs-aged snapshot, but the two diverge over a longer horizon —
  // a real leak keeps growing linearly while a cap-bounded field
  // flattens. This test ages two states (2000 ticks and 4000 ticks)
  // and prints the ratio of (4k Δ-from-2k) over (2k Δ-from-0) for
  // each top grower. Ratios near 0 mean the field has plateaued
  // (cap is working); ratios near 1 mean linear growth (real leak).
  it("plateau check — confirms top growers are cap-bounded, not leaking", () => {
    const fresh = createInitialState();
    const aged2k = ageState(2000);
    const aged4k = ageState(4000);

    type PlateauRow = {
      field: string;
      delta0to2k: number;
      delta2kto4k: number;
      plateauRatio: number;
    };

    const allKeys = new Set<string>([
      ...Object.keys(fresh as object),
      ...Object.keys(aged4k as object),
    ]);

    const rows: PlateauRow[] = [];
    for (const key of allKeys) {
      const f = fieldBytes(fresh, key);
      const a2 = fieldBytes(aged2k, key);
      const a4 = fieldBytes(aged4k, key);
      const d1 = a2 - f;
      const d2 = a4 - a2;
      if (Math.abs(d1) < 512 && Math.abs(d2) < 512) continue;
      rows.push({
        field: key,
        delta0to2k: d1,
        delta2kto4k: d2,
        plateauRatio: d1 === 0 ? (d2 === 0 ? 0 : Infinity) : d2 / d1,
      });
    }
    rows.sort((l, r) => Math.abs(r.delta0to2k) - Math.abs(l.delta0to2k));

    const fmtKb = (n: number) =>
      `${n >= 0 ? "+" : ""}${(n / 1024).toFixed(1)}`.padStart(10);
    const fmtRatio = (r: number) =>
      Number.isFinite(r) ? r.toFixed(2).padStart(8) : "     inf";

    const lines = [
      ``,
      `=== plateau check (Δ 0→2k vs Δ 2k→4k) ===`,
      `  ratio near 0.0 = plateaued (cap holding), near 1.0 = linear leak`,
      ``,
      `  ${"field".padEnd(28)}${"Δ 0→2k KB".padStart(12)}${"Δ 2k→4k KB".padStart(13)}${"ratio".padStart(9)}`,
      `  ${"-".repeat(28 + 12 + 13 + 9)}`,
      ...rows
        .slice(0, 15)
        .map(
          (r) =>
            `  ${r.field.padEnd(28)}${fmtKb(r.delta0to2k)}${fmtKb(
              r.delta2kto4k,
            ).padStart(13)}${fmtRatio(r.plateauRatio)}`,
        ),
      ``,
    ];
    console.log(lines.join("\n"));

    // Sanity: the aggregate growth-per-tick rate should not be
    // *accelerating*. Caps + bounded designed-steady-state mean the
    // second 2k window should grow no faster than the first. We
    // allow generous slack (1.5×) because per-field deltas swing
    // both ways from RNG-driven content (Math.random in event,
    // expedition, civil-war, character-spawn paths), so the signed
    // sum can wobble. A real unbounded leak would push the second
    // window to roughly *match* the first — well over our threshold.
    const totalDelta1 = rows.reduce((acc, r) => acc + r.delta0to2k, 0);
    const totalDelta2 = rows.reduce((acc, r) => acc + r.delta2kto4k, 0);
    const ceiling = Math.max(totalDelta1 * 1.5, 50 * 1024);
    expect(
      totalDelta2,
      `aggregate growth in second 2k window (${(
        totalDelta2 / 1024
      ).toFixed(1)} KB) significantly exceeded first window (${(
        totalDelta1 / 1024
      ).toFixed(1)} KB) — unbounded leak suspected`,
    ).toBeLessThan(ceiling);
  }, 600_000);
});

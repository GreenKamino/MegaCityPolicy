/**
 * Memory + serialization stress tests for the MEGACITY engine.
 *
 * Two dimensions exercised:
 *
 *  1. Memory growth: run thousands of ticks and confirm key unbounded
 *     collections (messages, activeEvents, etc.) stay within sensible
 *     caps — the existing engine code already trims many of these, so
 *     this is a regression guard against accidental cap removal.
 *
 *  2. Save/load round-trip stress: serialize and re-import a real
 *     game state hundreds of times, asserting structural fidelity and
 *     that the per-cycle cost stays well under any user-visible budget.
 *
 * Loose, percentile-friendly assertions intentionally — the goal is to
 * surface catastrophic regressions, not enforce micro-thresholds.
 */

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  parseSaveImport,
  serializeSaveExport,
} from "@/engine/saveExport";
import type { GameState } from "@/engine/types";

function ageState(ticks: number): GameState {
  let s = createInitialState();
  for (let i = 0; i < ticks; i++) {
    s = runTick(s).newState;
  }
  return s;
}

describe("engine memory + save/load stress", () => {
  it(
    "keeps unbounded collections capped over a 5000-tick run",
    // Runs only in `validate:perf` (serial, RUN_STRESS=1); excluded from
    // the default parallel `test` run. Generous hang-guard timeout.
    { timeout: 360_000 },
    () => {
      const aged = ageState(5000);

      const messageCount = (aged.messages ?? []).length;
      const activeEventCount = (aged.activeEvents ?? []).length;
      const completedContracts = (aged.completedContracts ?? []).length;
      const activeContracts = (aged.activeContracts ?? []).length;

      console.log(
        [
          ``,
          `=== memory caps after 5000 ticks ===`,
          `  messages:           ${messageCount}`,
          `  activeEvents:       ${activeEventCount}`,
          `  activeContracts:    ${activeContracts}`,
          `  completedContracts: ${completedContracts}`,
        ].join("\n"),
      );

      // These bounds are deliberately well below the tick count
      // (5000) so a regression that accidentally lets any of these
      // collections grow ~1-per-tick will trip the test instead of
      // silently passing. The current engine trims/caps all of these
      // and a no-input run produces 200 / 30 / 0 / 0 respectively.
      expect(messageCount).toBeLessThan(1_000);
      expect(activeEventCount).toBeLessThan(500);
      expect(activeContracts).toBeLessThan(500);
      expect(completedContracts).toBeLessThan(500);
    },
  );

  it(
    "serialized save size stays bounded after a long run",
    { timeout: 90_000 },
    () => {
      const fresh = createInitialState();
      const aged = ageState(2000);

      const freshJson = serializeSaveExport(fresh, 1);
      const agedJson = serializeSaveExport(aged, 1);

      const freshKb = freshJson.length / 1024;
      const agedKb = agedJson.length / 1024;
      const ratio = agedKb / freshKb;

      console.log(
        [
          ``,
          `=== serialized save size ===`,
          `  fresh state:    ${freshKb.toFixed(1)} KB`,
          `  2000-tick state: ${agedKb.toFixed(1)} KB`,
          `  growth ratio:   ${ratio.toFixed(2)}x`,
        ].join("\n"),
      );

      // A real save shouldn't balloon past a few MB even after a long
      // session. 10 MB is a very loose ceiling — flags only true leaks.
      expect(agedKb).toBeLessThan(10 * 1024);
      // And the post-aged state shouldn't be radically larger than the
      // fresh one (no append-only logging blowing up the save file).
      expect(ratio).toBeLessThan(20);
    },
  );

  it(
    "round-trips save export 200x without drifting",
    { timeout: 180_000 },
    () => {
      // Use a realistically-sized save (2000 ticks → ~940 KB) so
      // round-trip latency reflects an actual mid-game export, not a
      // toy fixture. Also lets us actually compare state payloads to
      // detect drift at depth.
      const aged = ageState(2000);
      const baseline = serializeSaveExport(aged, 1);
      const baselineParsed = parseSaveImport(baseline);
      if (!baselineParsed.ok) {
        throw new Error(`baseline parse failed: ${baselineParsed.error}`);
      }
      // Canonicalize the state payload by re-stringifying through
      // JSON. We deliberately compare the STATE payload only — the
      // envelope contains `exportedAt: Date.now()` which is volatile
      // by design and would always differ.
      const baselineStateJson = JSON.stringify(baselineParsed.envelope.state);

      const samples: number[] = new Array(200);
      let last = baseline;
      for (let i = 0; i < 200; i++) {
        const t0 = performance.now();
        const parsed = parseSaveImport(last);
        if (!parsed.ok) {
          throw new Error(
            `parseSaveImport failed on cycle ${i}: ${parsed.error}`,
          );
        }
        const reSerialized = serializeSaveExport(parsed.envelope.state, 1);
        samples[i] = performance.now() - t0;
        last = reSerialized;
      }

      const sorted = [...samples].sort((a, b) => a - b);
      const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const max = sorted[sorted.length - 1];

      const finalParse = parseSaveImport(last);
      if (!finalParse.ok) {
        throw new Error(`final parse failed: ${finalParse.error}`);
      }
      const finalStateJson = JSON.stringify(finalParse.envelope.state);

      console.log(
        [
          ``,
          `=== save round-trip (200 cycles, 2000-tick aged state) ===`,
          `  mean:  ${mean.toFixed(3)} ms / cycle`,
          `  p95:   ${p95.toFixed(3)} ms`,
          `  max:   ${max.toFixed(3)} ms`,
          `  baseline size: ${(baseline.length / 1024).toFixed(1)} KB`,
          `  final size:    ${(last.length / 1024).toFixed(1)} KB`,
          `  state-payload bytes equal across cycles: ${baselineStateJson.length === finalStateJson.length}`,
        ].join("\n"),
      );

      // Cycles must complete fast enough that a save-on-quit feels
      // instant; 200 ms mean is a generous ceiling for a near-MB save
      // on shared CI.
      expect(mean).toBeLessThan(200);
      // Final must still be re-importable.
      expect(finalParse.ok).toBe(true);
      // REAL drift assertion — the state payload after 200 cycles of
      // serialize → parse → re-serialize must be byte-identical to
      // the baseline parse. Catches encoding asymmetries that the
      // shallow viability checks in parseSaveImport would miss.
      expect(finalStateJson).toBe(baselineStateJson);
    },
  );
});

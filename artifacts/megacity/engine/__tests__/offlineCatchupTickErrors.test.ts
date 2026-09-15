/**
 * Offline catch-up must surface subsystem failures that happen ANYWHERE in
 * the batch, not just on the final tick.
 *
 * runTick() resets the module-global _lastTickErrors at the start of every
 * tick, so before this change a subsystem that failed on (say) tick 1 of a
 * 1500-tick catch-up left no trace once tick 2 began — only the very last
 * tick's errors survived, and runOfflineCatchup never read them anyway.
 *
 * processMissedTicks now snapshots getLastTickErrors() after each tick and
 * returns a deduped aggregate (by subsystem+message) so a system that fails
 * every tick surfaces once, not thousands of times.
 *
 * The throw is injected with the same Proxy-definition trick used by
 * tickIsolation.test.ts: a contract def that returns a benign `id` but
 * throws on every other read, so the Contracts safeSub block trips on each
 * simulated tick.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  processMissedTicks,
  CATCHUP_ERRORS_PER_SUBSYSTEM,
  CATCHUP_ERRORS_TOTAL,
  CATCHUP_ERRORS_OVERFLOW_SUBSYSTEM,
  CATCHUP_ERRORS_SUPPRESSED_SAMPLE,
} from "@/engine/formulas";
import { createInitialState } from "@/engine/initialState";
import { CONTRACT_TEMPLATES_MAP } from "@/engine/contracts";
import type { ContractDef, ContractInstance, GameState } from "@/engine/types";

const SYN_ID = "__synthetic_offline_tick_errors__";

function makeThrowingContractDef(idVal: string, msg: string): ContractDef {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "id") return idVal;
        throw new Error(msg);
      },
      has() {
        return true;
      },
    },
  ) as unknown as ContractDef;
}

// A def whose thrown message embeds an ever-changing counter, defeating the
// subsystem+message dedupe so every failing tick produces a distinct entry.
function makeChangingThrowingContractDef(idVal: string): ContractDef {
  let n = 0;
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "id") return idVal;
        throw new Error(`synthetic contracts failure #${n++}`);
      },
      has() {
        return true;
      },
    },
  ) as unknown as ContractDef;
}

function seedBadContract(state: GameState): GameState {
  const badContract: ContractInstance = {
    id: "bad-1",
    defId: SYN_ID,
    contractorId: "any",
    districtId: "d1",
    status: "active",
    progress: 0,
    startTick: 0,
    ticksElapsed: 0,
    totalPaid: 0,
    procurementMethod: "openTender",
    delaysOccurred: 0,
    overrunCost: 0,
    events: [],
  };
  return { ...state, activeContracts: [badContract] };
}

afterEach(() => {
  delete CONTRACT_TEMPLATES_MAP[SYN_ID];
});

describe("processMissedTicks subsystem-error aggregation", () => {
  it("aggregates and dedupes a subsystem that fails on every catch-up tick", () => {
    CONTRACT_TEMPLATES_MAP[SYN_ID] = makeThrowingContractDef(SYN_ID, "synthetic contracts failure");
    const state = seedBadContract(createInitialState());

    const { tickErrors, allEntries } = processMissedTicks(state, 5, 5);

    // The Contracts block threw on more than one simulated tick (each
    // failing tick emits its own Contracts/error entry)...
    const ticksThatFailed = allEntries.filter((tickEntries) =>
      tickEntries.some((e) => e.label === "Contracts" && e.unit === "error"),
    ).length;
    expect(ticksThatFailed).toBeGreaterThan(1);

    // ...but the cross-tick aggregate dedupes them to a single entry.
    const contractsErrors = tickErrors.filter((e) => e.subsystem === "Contracts");
    expect(contractsErrors).toHaveLength(1);
    expect(contractsErrors[0].error).toContain("synthetic contracts failure");
  });

  it("returns no tick errors for a clean batch (no live-tick regression)", () => {
    const state = createInitialState();
    const { tickErrors } = processMissedTicks(state, 10, 10);
    expect(tickErrors).toEqual([]);
  });

  it("caps a subsystem that emits an ever-changing message and summarizes the rest", () => {
    CONTRACT_TEMPLATES_MAP[SYN_ID] = makeChangingThrowingContractDef(SYN_ID);
    const state = seedBadContract(createInitialState());

    const { allEntries, tickErrors } = processMissedTicks(state, 40, 40);

    // Every failing tick produced a distinct Contracts message (dedupe defeated).
    const ticksThatFailed = allEntries.filter((tickEntries) =>
      tickEntries.some((e) => e.label === "Contracts" && e.unit === "error"),
    ).length;
    expect(ticksThatFailed).toBeGreaterThan(CATCHUP_ERRORS_PER_SUBSYSTEM);

    // ...but the report keeps at most CATCHUP_ERRORS_PER_SUBSYSTEM rows for it.
    const contractsErrors = tickErrors.filter((e) => e.subsystem === "Contracts");
    expect(contractsErrors).toHaveLength(CATCHUP_ERRORS_PER_SUBSYSTEM);

    // The suppressed remainder collapses into a single trailing "+N more" entry.
    const overflow = tickErrors.filter((e) => e.subsystem === CATCHUP_ERRORS_OVERFLOW_SUBSYSTEM);
    expect(overflow).toHaveLength(1);
    expect(overflow[0].error).toMatch(/^\+\d+ more similar error/);

    // The whole list stays bounded regardless of how long the catch-up was.
    expect(tickErrors.length).toBeLessThanOrEqual(CATCHUP_ERRORS_TOTAL + 1);
  });

  it("retains a capped, deduped sample of suppressed errors for the bug-report export", () => {
    CONTRACT_TEMPLATES_MAP[SYN_ID] = makeChangingThrowingContractDef(SYN_ID);
    const state = seedBadContract(createInitialState());

    const { suppressedErrors, suppressedCount } = processMissedTicks(state, 40, 40);

    // The ever-changing message defeated the dedupe, so the on-screen list was
    // capped and a positive number of distinct errors were suppressed.
    expect(suppressedCount).toBeGreaterThan(0);
    // The retained sample is non-empty but never exceeds the cap, and never
    // exceeds the true suppressed count.
    expect(suppressedErrors.length).toBeGreaterThan(0);
    expect(suppressedErrors.length).toBeLessThanOrEqual(CATCHUP_ERRORS_SUPPRESSED_SAMPLE);
    expect(suppressedErrors.length).toBeLessThanOrEqual(suppressedCount);
    // The sample carries real Contracts diagnostics, not the overflow summary.
    expect(suppressedErrors.every((e) => e.subsystem === "Contracts")).toBe(true);
    // The sample is deduped (each retained message is distinct).
    const distinct = new Set(suppressedErrors.map((e) => `${e.subsystem}\u0000${e.error}`));
    expect(distinct.size).toBe(suppressedErrors.length);
  });

  it("returns no suppressed sample for a clean batch", () => {
    const state = createInitialState();
    const { suppressedErrors, suppressedCount } = processMissedTicks(state, 10, 10);
    expect(suppressedErrors).toEqual([]);
    expect(suppressedCount).toBe(0);
  });
});

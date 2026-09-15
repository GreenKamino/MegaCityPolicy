/**
 * Task #169: error isolation contract for the per-tick simulation loop.
 *
 * Several large blocks inside `runTick` are wrapped with `safeSub` so a
 * single bad subsystem (bad lookup, NaN, malformed instance) cannot
 * freeze the whole game. This test injects a synthetic throw inside
 * each newly-wrapped block (Contracts, Edicts, Mega Projects) and
 * asserts that:
 *   1. `runTick` still returns successfully.
 *   2. The failing subsystem is recorded in `getLastTickErrors`.
 *   3. A subsystem-error tick entry is emitted.
 *   4. Downstream work (totalTicks advancing, other entries) still ran.
 *
 * Throws are injected by inserting a Proxy "definition" into the lookup
 * tables / arrays the wrapped blocks consult. The Proxy returns benign
 * values for the identity check (`id`) and throws on every other read,
 * so the throw fires only when the wrapped block actually inspects the
 * record — not during the up-front shallow clones at the top of
 * `runTick` (which bypass the lookup entirely).
 */

import { afterEach, describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { runTick, getLastTickErrors } from "@/engine/formulas";
import { CONTRACT_TEMPLATES_MAP } from "@/engine/contracts";
import { ALL_EDICTS, type EdictDef } from "@/engine/edicts";
import { POLICY_MAP, type PolicyDef, type PolicyEffect } from "@/engine/policies";
import type {
  GameState,
  ContractDef,
  ContractInstance,
  ActiveEdict,
  BankAccount,
  BankLoan,
  Faction,
  IntelligenceState,
  BankingState,
} from "@/engine/types";
import type { MegaProjectInstance } from "@/engine/megaProjects";

const SYN_ID = "__synthetic_tick_isolation__";

function makeThrowingProxy(idVal: string, msg: string): unknown {
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === "id") return idVal;
      throw new Error(msg);
    },
    has() { return true; },
  });
}

function makeThrowingContractDef(idVal: string, msg: string): ContractDef {
  return makeThrowingProxy(idVal, msg) as ContractDef;
}

function makeThrowingEdictDef(idVal: string, msg: string): EdictDef {
  return makeThrowingProxy(idVal, msg) as EdictDef;
}

function freshState(): GameState {
  return createInitialState();
}

afterEach(() => {
  delete CONTRACT_TEMPLATES_MAP[SYN_ID];
  delete POLICY_MAP[SYN_ID];
  for (let i = ALL_EDICTS.length - 1; i >= 0; i--) {
    if (ALL_EDICTS[i]?.id === SYN_ID) ALL_EDICTS.splice(i, 1);
  }
});

describe("Task #169: per-tick subsystem error isolation", () => {
  it("isolates a thrown error inside the contracts loop", () => {
    CONTRACT_TEMPLATES_MAP[SYN_ID] = makeThrowingContractDef(SYN_ID, "synthetic contracts failure");
    const state = freshState();
    const badContract: ContractInstance = {
      id: "bad-1", defId: SYN_ID, contractorId: "any", districtId: "d1",
      status: "active", progress: 0, startTick: 0, ticksElapsed: 0,
      totalPaid: 0, procurementMethod: "openTender",
      delaysOccurred: 0, overrunCost: 0, events: [],
    };
    state.activeContracts = [badContract];

    let result: ReturnType<typeof runTick> | undefined;
    expect(() => { result = runTick(state); }).not.toThrow();
    const { newState, entries } = result!;

    expect(newState.totalTicks).toBeGreaterThan(state.totalTicks);
    expect(getLastTickErrors().some(e => e.subsystem === "Contracts")).toBe(true);
    expect(entries.some(e => e.label === "Contracts" && e.unit === "error")).toBe(true);
    expect(entries.length).toBeGreaterThan(1);
  });

  it("isolates a thrown error inside the active edicts loop", () => {
    ALL_EDICTS.push(makeThrowingEdictDef(SYN_ID, "synthetic edicts failure"));
    const state = freshState();
    const badEdict: ActiveEdict = {
      edictId: SYN_ID, ticksRemaining: 5, issuedAtTick: 0, cooldownUntilTick: 0,
    };
    state.activeEdicts = [badEdict];

    let result: ReturnType<typeof runTick> | undefined;
    expect(() => { result = runTick(state); }).not.toThrow();
    const { newState, entries } = result!;

    expect(newState.totalTicks).toBeGreaterThan(state.totalTicks);
    expect(getLastTickErrors().some(e => e.subsystem === "Edicts")).toBe(true);
    expect(entries.some(e => e.label === "Edicts" && e.unit === "error")).toBe(true);
    expect(entries.length).toBeGreaterThan(1);
  });

  // ─── Task #187: four additional safeSub-wrapped blocks ────────────────

  it("isolates a thrown error inside the city policies block", () => {
    // `POLICY_MAP[pid]` is also read by three unwrapped sites earlier in
    // the tick (rate aggregation, population growth, research speed).
    // Those sites only consult production-side effect keys, so we expose
    // a benign cost + an `effects` object that returns undefined for those
    // keys but throws on the city-stat keys (`crime`, `unrest`, …) that
    // ONLY the wrapped City Policies block at L2329 reads.
    const throwingEffects: PolicyEffect = {};
    const cityStatKeys: Array<keyof PolicyEffect> = [
      "crime", "unrest", "happiness", "lawOrder",
      "corruption", "employment", "infrastructureHealth", "defenseRating",
    ];
    for (const k of cityStatKeys) {
      Object.defineProperty(throwingEffects, k, {
        get() { throw new Error("synthetic policy failure"); },
        enumerable: true, configurable: true,
      });
    }
    const throwingPolicy: PolicyDef = {
      id: SYN_ID,
      name: "SYNTHETIC POLICY",
      category: "lawEnforcement",
      description: "synthetic — only consumed by the city policies isolation test",
      costPerTick: 0,
      effects: throwingEffects,
    };
    POLICY_MAP[SYN_ID] = throwingPolicy;
    const state = freshState();
    state.activePolicies = [SYN_ID];

    let result: ReturnType<typeof runTick> | undefined;
    expect(() => { result = runTick(state); }).not.toThrow();
    const { newState, entries } = result!;

    expect(newState.totalTicks).toBeGreaterThan(state.totalTicks);
    expect(getLastTickErrors().some(e => e.subsystem === "City Policies")).toBe(true);
    expect(entries.some(e => e.label === "City Policies" && e.unit === "error")).toBe(true);
    expect(entries.length).toBeGreaterThan(1);
  });

  it("isolates a thrown error inside the religion auto-build block", () => {
    // Religion auto-build only fires when isDayStart(gameDate) && day % 3 === 0.
    // Note: `s.gameDate = advanceHour(s.gameDate)` runs (L2387) BEFORE the
    // religion block (L2490), and `advanceHour` bumps the hour by 6. So we
    // seed `hour=18, day=2` → after advance it becomes `hour=0, day=3`,
    // satisfying both gates when the wrapped block actually runs.
    const state = freshState();
    if (state.gameDate) {
      state.gameDate = { ...state.gameDate, hour: 18, day: 2 };
    }
    // Inject a cult faction whose `influence` is a BigInt. Mixed
    // BigInt/number COMPARISONS work (so filters like `f.influence >= 25`
    // pass without throwing), but the religion block computes
    // `topCult.influence / 100` — BigInt divided by number throws
    // TypeError, which is caught by the surrounding safeSub. The cult
    // is configured (type="cult", isActive=true, loyalty=50) so it does
    // NOT match the criminal/low-loyalty filters used by event triggers
    // and other subsystems that perform arithmetic on faction influence.
    const badFaction = {
      id: SYN_ID,
      name: "SYNTHETIC CULT",
      type: "cult",
      isActive: true,
      influence: BigInt(99) as unknown as number,
      loyalty: 50,
      threat: 0,
      description: "synthetic",
    } as unknown as Faction;
    state.factions = [badFaction, ...state.factions];

    let result: ReturnType<typeof runTick> | undefined;
    expect(() => { result = runTick(state); }).not.toThrow();
    const { newState, entries } = result!;

    expect(newState.totalTicks).toBeGreaterThan(state.totalTicks);
    expect(getLastTickErrors().some(e => e.subsystem === "Religion Auto-Build")).toBe(true);
    expect(entries.some(e => e.label === "Religion Auto-Build" && e.unit === "error")).toBe(true);
    expect(entries.length).toBeGreaterThan(1);
  });

  it("isolates a thrown error inside the banking block", () => {
    const state = freshState();
    // The top-of-tick clone does `{ ...account }` per account, so a
    // throwing getter here would fire at clone time. Instead we set
    // `balance` to a BigInt — it survives the spread as a plain value
    // but throws TypeError on `Math.floor(balance * interestRate)`
    // inside the wrapped block (mixing BigInt and number is illegal).
    // `lastInterestTick = -1000` ensures the monthly interest gate
    // (`s.totalTicks - acct.lastInterestTick >= 120`) is open on tick 0.
    const badAccount = {
      bankId: "megacity-central" as const,
      balance: BigInt(50_000) as unknown as number,
      interestRate: 0.01,
      lastInterestTick: -1000,
    } as unknown as BankAccount;
    const banking: BankingState = {
      loans: [] as BankLoan[],
      accounts: [badAccount],
      transfers: [],
      creditRating: 700,
      totalInterestPaid: 0,
      totalInterestEarned: 0,
    };
    state.banking = banking;

    let result: ReturnType<typeof runTick> | undefined;
    expect(() => { result = runTick(state); }).not.toThrow();
    const { newState, entries } = result!;

    expect(newState.totalTicks).toBeGreaterThan(state.totalTicks);
    expect(getLastTickErrors().some(e => e.subsystem === "Banking")).toBe(true);
    expect(entries.some(e => e.label === "Banking" && e.unit === "error")).toBe(true);
    expect(entries.length).toBeGreaterThan(1);
  });

  it("isolates a thrown error inside the auto-reconnaissance block", () => {
    const state = freshState();
    // Auto Recon gate: `s.intelligence?.autoRecon && s.totalTicks % 4 === 0`.
    // Build a real intelligence object with autoRecon=true and a throwing
    // `autoReconCostPerTick` getter so the wrapped block actually runs and
    // then trips the synthetic error on the cost lookup.
    // The top-of-tick clone does `{ ...state.intelligence }`, so a
    // throwing getter on `autoReconCostPerTick` would fire at clone
    // time. Instead we set it to a BigInt — it copies through the
    // spread as a value, then trips a TypeError inside the wrapped
    // block on `r.credits -= reconCost` (number minus BigInt).
    const intel: IntelligenceState = {
      assets: [],
      operations: [],
      securityLevel: 0,
      counterIntelRating: 0,
      totalOpsCompleted: 0,
      totalOpsFailed: 0,
      rumors: [],
      interceptedComms: [],
      autoRecon: true,
      autoReconCostPerTick: BigInt(500) as unknown as number,
    };
    state.intelligence = intel;
    // `s.totalTicks++` runs earlier in the tick (L2381) before the Auto
    // Recon block at L3055, so seed totalTicks=3 → after increment it is
    // 4, which satisfies `s.totalTicks % 4 === 0`.
    state.totalTicks = 3;
    // Ensure credits exceed the recon cost so the wrapped block enters
    // the spending branch where the BigInt subtraction throws.
    state.resources.credits = 100_000;

    let result: ReturnType<typeof runTick> | undefined;
    expect(() => { result = runTick(state); }).not.toThrow();
    const { newState, entries } = result!;

    expect(newState.totalTicks).toBeGreaterThan(state.totalTicks);
    expect(getLastTickErrors().some(e => e.subsystem === "Auto Recon")).toBe(true);
    expect(entries.some(e => e.label === "Auto Recon" && e.unit === "error")).toBe(true);
    expect(entries.length).toBeGreaterThan(1);
  });

  it("isolates a thrown error inside the mega projects block", () => {
    const state = freshState();
    // Throwing getter on `projectId` so the switch and the research
    // bonus checks both blow up — both call sites are wrapped now.
    const badProject = {
      phase: "operational" as const,
      progress: 100, totalRequired: 100,
      investedCredits: 0, investedSteel: 0, startedTick: 0,
    };
    Object.defineProperty(badProject, "projectId", {
      get() { throw new Error("synthetic megaproject failure"); },
      enumerable: true, configurable: true,
    });
    state.megaProjects = [badProject as unknown as MegaProjectInstance];

    let result: ReturnType<typeof runTick> | undefined;
    expect(() => { result = runTick(state); }).not.toThrow();
    const { newState, entries } = result!;

    expect(newState.totalTicks).toBeGreaterThan(state.totalTicks);
    const errs = getLastTickErrors();
    expect(
      errs.some(e => e.subsystem === "Mega Projects" || e.subsystem === "Mega Projects (Research)"),
    ).toBe(true);
    expect(
      entries.some(e =>
        (e.label === "Mega Projects" || e.label === "Mega Projects (Research)") &&
        e.unit === "error",
      ),
    ).toBe(true);
    expect(entries.length).toBeGreaterThan(1);
  });
});

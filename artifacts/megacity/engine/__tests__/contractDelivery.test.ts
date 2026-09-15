// Task #581: procurement/contract orders must actually deliver, confirm the
// delivery to the player, and fail loudly instead of squatting in the active
// queue forever.
//
// Determinism: Math.random is pinned to 0.5 — below every delay/corruption
// threshold and every event-spawn roll, so runs are fully deterministic and
// a control run (same state, no contract) isolates exactly what the contract
// delivered. States are cloned via JSON round-trip (same as save/load).
//
// Legacy-save compat note: award() below builds instances WITHOUT the
// stallWarned field, exactly like pre-#581 saves — the stall test doubles as
// the legacy-instance test (falsy ⇒ warning still fires and backfills).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createInitialState } from "../initialState";
import { runTick } from "../formulas";
import {
  CONTRACT_TEMPLATES,
  CONTRACT_EXPIRY_MULTIPLIER,
  CONTRACT_EXPIRY_RECOVERY_RATE,
  computeContractExpiryRecovery,
  summarizeCompletionEffects,
  countFulfilledContracts,
  forecastContractGoodsCommitment,
} from "../contracts";
import { ACHIEVEMENTS } from "../achievements";
import type { ContractInstance, GameState, TickEntry } from "../types";

const contractsScreenSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../app/(game)/contracts.tsx",
  ),
  "utf8",
);
const activeContractCardSource = contractsScreenSource.slice(
  contractsScreenSource.indexOf("function ActiveContractCard"),
  contractsScreenSource.indexOf("function CompletedContractCard"),
);

const originalRandom = Math.random;
beforeEach(() => {
  Math.random = () => 0.5;
});
afterEach(() => {
  Math.random = originalRandom;
});

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

// Mirrors GameContext.awardContract: pay upfront, deduct required materials,
// push a fresh instance (no stallWarned field — see legacy note above).
function award(s: GameState, defId: string): void {
  const def = CONTRACT_TEMPLATES.find((t) => t.id === defId);
  if (!def) throw new Error(`no template ${defId}`);
  const instance: ContractInstance = {
    id: `${defId}-test`,
    defId,
    contractorId: def.contractorId,
    districtId: "district-residential-1",
    status: "active",
    progress: 0,
    startTick: s.totalTicks,
    ticksElapsed: 0,
    totalPaid: def.upfrontCost,
    procurementMethod: "openTender",
    delaysOccurred: 0,
    overrunCost: 0,
    events: [`Tick ${s.totalTicks}: Contract awarded via openTender`],
  };
  s.resources.credits -= def.upfrontCost;
  for (const [mat, amount] of Object.entries(def.requiredMaterials ?? {})) {
    if (amount) {
      (s.resources as Record<string, unknown>)[mat] = Math.max(
        0,
        ((s.resources as unknown as Record<string, number>)[mat] ?? 0) - amount,
      );
    }
  }
  s.activeContracts = [...(s.activeContracts ?? []), instance];
}

function runTicks(s: GameState, n: number): GameState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = runTick(cur).newState;
  return cur;
}

function richBase(): GameState {
  const base = createInitialState();
  base.resources.credits = 500_000;
  base.resources.steel = 5_000;
  base.resources.goods = 5_000;
  // Material storage is structural: this rich fixture needs capacity for its
  // preloaded resources and the procurement delivery it is testing.
  // Leave enough headroom for the control run's ongoing production too, not
  // merely the preloaded 5,000 units.
  base.buildings.supplyChainDistributionCenters = 20;
  return base;
}

describe("contract delivery (task #581)", () => {
  it("construction contract placed at tick T lands its building by the deadline, with inbox + ticker confirmation", () => {
    const defId = "ct-micro-housing-200";
    const def = CONTRACT_TEMPLATES.find((t) => t.id === defId)!;
    const base = richBase();
    const withContract = clone(base);
    award(withContract, defId);
    const control = clone(base);

    // Generous budget; the deadline assert below is on the archived instance.
    const budget = Math.ceil(def.durationTicks * 2);
    const sC = runTicks(withContract, budget);
    const sK = runTicks(control, budget);

    const archived = (sC.completedContracts ?? []).find((c) => c.id === `${defId}-test`);
    expect(archived, "contract never completed").toBeDefined();
    expect(archived!.status).toBe("completed");
    // With materials available and pinned RNG (no delay rolls), the order
    // must land within 1.5× its stated duration — the player-facing promise.
    expect(archived!.ticksElapsed).toBeLessThanOrEqual(Math.ceil(def.durationTicks * 1.5));

    // The purchased building actually landed (control-diff isolates it from
    // auto-construction noise, which is identical under pinned RNG).
    const key = Object.keys(def.completionEffects.buildings!)[0];
    const diff = (sC.buildings[key] ?? 0) - (sK.buildings[key] ?? 0);
    expect(diff).toBe(def.completionEffects.buildings![key]);

    // Delivery confirmation reached the inbox and the TV ticker.
    const inbox = (sC.messages ?? []).filter((m) => m.id.startsWith(`contract-delivered-${defId}-test`));
    expect(inbox.length).toBe(1);
    expect(inbox[0].title).toContain("CONTRACT DELIVERED");
    const ticker = (sC.newsFeed ?? []).filter((n) => n.id.startsWith(`news-contract-delivered-${defId}-test`));
    expect(ticker.length).toBe(1);
  });

  it("a fresh default city sustains and completes the starter housing award without manual goods changes", () => {
    const defId = "ct-micro-housing-200";
    const def = CONTRACT_TEMPLATES.find((t) => t.id === defId)!;
    const base = createInitialState();

    // Pin the economic promise behind the starter procurement flow. The live
    // rate must cover the contract's ongoing draw before the city can lean on
    // its finite starting goods stockpile.
    const ratedFreshCity = runTick(clone(base)).newState;
    const netGoodsIncome =
      ratedFreshCity.rates.goodsProduction - ratedFreshCity.rates.goodsConsumption;
    expect(netGoodsIncome).toBeGreaterThanOrEqual(def.materialPerTick.goods!);

    const withContract = clone(base);
    award(withContract, defId);
    const delivered = runTicks(withContract, Math.ceil(def.durationTicks * 2));

    const archived = (delivered.completedContracts ?? []).find((c) => c.id === `${defId}-test`);
    expect(archived, "fresh-city contract never completed").toBeDefined();
    expect(archived!.status).toBe("completed");
    expect(
      (delivered.messages ?? []).filter((m) => m.id.startsWith(`contract-stalled-${defId}-test`)),
    ).toHaveLength(0);
  });

  it("warns when a second individually sustainable award creates a combined goods deficit", () => {
    const first = CONTRACT_TEMPLATES.find((t) => t.id === "ct-micro-housing-200")!;
    const second = CONTRACT_TEMPLATES.find((t) => t.id === "ct-grid-maintenance")!;
    const netGoodsIncome = 3;
    expect(first.materialPerTick.goods).toBeLessThanOrEqual(netGoodsIncome);
    expect(second.materialPerTick.goods).toBeLessThanOrEqual(netGoodsIncome);

    const active: ContractInstance = {
      id: "first-award",
      defId: first.id,
      contractorId: first.contractorId,
      districtId: "district-residential-1",
      status: "active",
      progress: 10,
      startTick: 0,
      ticksElapsed: 2,
      totalPaid: first.upfrontCost,
      procurementMethod: "openTender",
      delaysOccurred: 0,
      overrunCost: 0,
      events: [],
    };
    const forecast = forecastContractGoodsCommitment([active], second, netGoodsIncome);

    expect(forecast).toEqual({
      activeGoodsPerTick: 2,
      candidateGoodsPerTick: 2,
      combinedGoodsPerTick: 4,
      netGoodsIncome: 3,
      exceedsNetIncome: true,
    });
  });

  it("keeps the available-contract recovery preview tied to policy and marks cancellation non-refundable", () => {
    const recoveryPercent = Math.round(CONTRACT_EXPIRY_RECOVERY_RATE * 100);

    // Source-pin the real Expo screen instead of importing its native/router
    // graph. The percentage expression must remain derived from the shared
    // engine policy, rather than becoming a second hardcoded recovery rate.
    expect(contractsScreenSource).toContain("CONTRACT_EXPIRY_RECOVERY_RATE,");
    expect(contractsScreenSource).toContain(
      "const CONTRACT_EXPIRY_RECOVERY_PERCENT = Math.round(CONTRACT_EXPIRY_RECOVERY_RATE * 100);",
    );
    expect(contractsScreenSource).toContain(
      "`AUTO-SCRAP RECOVERY: At the deadline, recover ${CONTRACT_EXPIRY_RECOVERY_PERCENT}% × `",
    );
    expect(contractsScreenSource).not.toContain(`recover ${recoveryPercent}% ×`);

    // The shared preview is shown from the available-contract award flow and
    // the cancellation path explicitly promises no refund.
    expect(contractsScreenSource).toContain("onAward={handleAward}");
    expect(contractsScreenSource).toContain("${getExpiryRecoveryPreview(def)}");
    expect(contractsScreenSource).toContain("VOLUNTARY CANCELLATION: no refund.");
    expect(contractsScreenSource).toContain("No refund will be issued.");
  });

  it("keeps active-contract recovery guidance tied to policy and distinguishes cancellation", () => {
    // Source-pin the active card separately from the available award preview:
    // its projected recovery is based on live progress and must use the
    // shared policy helper rather than a second recovery percentage.
    expect(contractsScreenSource).toContain("CONTRACT_EXPIRY_RECOVERY_RATE,");
    expect(activeContractCardSource).toContain(
      "computeContractExpiryRecovery(def.upfrontCost, contract.progress)",
    );
    expect(activeContractCardSource).toContain(
      "At current progress, recovery would be +{computeContractExpiryRecovery(def.upfrontCost, contract.progress).toLocaleString()} cr; voluntary cancellation remains non-refundable.",
    );
    expect(activeContractCardSource).toContain(
      "voluntary cancellation remains non-refundable.",
    );
    expect(activeContractCardSource).not.toContain(
      "CONTRACT_EXPIRY_RECOVERY_PERCENT",
    );
    expect(activeContractCardSource).not.toMatch(
      /(?:recover|recovery)[^`\n]*\b\d+%/i,
    );

    // Pin the policy relationship used by the active-card projection so a
    // future change cannot leave the UI wording apparently aligned while the
    // engine calculation drifts.
    expect(computeContractExpiryRecovery(10_000, 40)).toBe(
      Math.floor(10_000 * CONTRACT_EXPIRY_RECOVERY_RATE * 0.6),
    );
  });

  it("supply (procurement) contract delivers the purchased resources by the deadline", () => {
    const defId = "ct-steel-supply";
    const def = CONTRACT_TEMPLATES.find((t) => t.id === defId)!;
    const base = richBase();
    const withContract = clone(base);
    award(withContract, defId);
    const control = clone(base);

    const budget = Math.ceil(def.durationTicks * 2);
    const sC = runTicks(withContract, budget);
    const sK = runTicks(control, budget);

    const archived = (sC.completedContracts ?? []).find((c) => c.id === `${defId}-test`);
    expect(archived, "supply contract never completed").toBeDefined();
    expect(archived!.status).toBe("completed");
    expect(archived!.ticksElapsed).toBeLessThanOrEqual(Math.ceil(def.durationTicks * 1.5));

    // The +500 steel grant is visible against the control run (small
    // tolerance for downstream consumers reacting to the richer stock).
    const grant = def.completionEffects.resources!.steel!;
    const diff = sC.resources.steel - sK.resources.steel;
    expect(diff).toBeGreaterThanOrEqual(grant * 0.8);
    expect(diff).toBeLessThanOrEqual(grant * 1.2);

    // The confirmation names what arrived.
    const inbox = (sC.messages ?? []).find((m) => m.id.startsWith(`contract-delivered-${defId}-test`));
    expect(inbox).toBeDefined();
    expect(inbox!.body).toContain(`+${grant} steel`);
  });

  it("reports actual Steel delivery when a completed procurement contract hits full storage", () => {
    const defId = "ct-steel-supply";
    const base = createInitialState();
    base.resources.credits = 500_000;
    base.resources.steel = 1_000;
    // Keep the store full through the completion tick.
    base.buildings.metalFoundryComplexes = 1;
    award(base, defId);

    const delivered = runTicks(base, 30);
    const inbox = (delivered.messages ?? []).find((m) => m.id.startsWith(`contract-delivered-${defId}-test`));
    expect(inbox).toBeDefined();
    expect(inbox!.body).toContain("+0 steel");
    expect(inbox!.body).toContain("rejected: storage full");
  });

  it("material-starved contract warns once per stall episode, then expires at the 3x deadline with upfront recovery", () => {
    const defId = "ct-micro-housing-200";
    const def = CONTRACT_TEMPLATES.find((t) => t.id === defId)!;
    // A fully depleted, overcrowded city still needs the existing stalled /
    // auto-scrap safety behavior after the starter balance is corrected.
    const base = createInitialState();
    base.resources.credits = 500_000;
    base.resources.goods = 0;
    base.cityStats.population = 2_000_000;
    const withContract = clone(base);
    award(withContract, defId);
    const control = clone(base);

    const horizon = def.durationTicks * CONTRACT_EXPIRY_MULTIPLIER + 5;
    let sC = withContract;
    let expiryEntries: TickEntry[] | undefined;
    let expiryCreditDelta: number | undefined;
    for (let i = 0; i < horizon; i++) {
      const beforeCredits = sC.resources.credits;
      const tick = runTick(sC);
      sC = tick.newState;
      if (!expiryEntries && (sC.completedContracts ?? []).some((c) => c.id === `${defId}-test` && c.status === "expired")) {
        expiryEntries = tick.entries;
        expiryCreditDelta = sC.resources.credits - beforeCredits;
      }
    }
    const sK = runTicks(control, horizon);

    // Stall warning fired — and once per episode, not once per stalled tick.
    const stallMsgs = (sC.messages ?? []).filter((m) => m.id.startsWith(`contract-stalled-${defId}-test`));
    expect(stallMsgs.length).toBeGreaterThanOrEqual(1);
    expect(stallMsgs.length).toBeLessThanOrEqual(3);
    expect(stallMsgs[0].title).toContain("PROCUREMENT STALLED");

    // The award expired instead of squatting in the queue forever.
    expect(sC.activeContracts.find((c) => c.id === `${defId}-test`)).toBeUndefined();
    const archived = (sC.completedContracts ?? []).find((c) => c.id === `${defId}-test`);
    expect(archived, "expired contract not archived").toBeDefined();
    expect(archived!.status).toBe("expired");
    expect(archived!.ticksElapsed).toBe(def.durationTicks * CONTRACT_EXPIRY_MULTIPLIER);
    expect(archived!.progress).toBeLessThan(100);

    // Expiry says so loudly: inbox alert + ticker line.
    const expiredMsg = (sC.messages ?? []).find((m) => m.id.startsWith(`contract-expired-${defId}-test`));
    expect(expiredMsg).toBeDefined();
    expect(expiredMsg!.title).toContain("CONTRACT SCRAPPED");
    const ticker = (sC.newsFeed ?? []).find((n) => n.id.startsWith(`news-contract-expired-${defId}-test`));
    expect(ticker).toBeDefined();

    // Nothing was delivered for the failed award.
    const key = Object.keys(def.completionEffects.buildings!)[0];
    expect((sC.buildings[key] ?? 0) - (sK.buildings[key] ?? 0)).toBe(0);

    // Task #585: a failed award recovers 25% of its original upfront deposit,
    // scaled by the unfinished share, and the credit grant is ledgered in
    // the same tick as the expiry.
    const expectedRecovery = computeContractExpiryRecovery(def.upfrontCost, archived!.progress);
    expect(expectedRecovery).toBe(750);
    expect(expiryEntries).toBeDefined();
    expect(expiryCreditDelta).toBeDefined();
    const recoveryEntry = expiryEntries!.find((e) => e.label === "Contract Scrap Recovery");
    expect(recoveryEntry).toBeDefined();
    expect(recoveryEntry!.delta).toBe(expectedRecovery);
    expect(recoveryEntry!.unit).toBe("credits");
    expect(
      expiryEntries!.filter((e) => e.unit === "credits").reduce((sum, e) => sum + e.delta, 0),
    ).toBe(expiryCreditDelta);

    expect(expiredMsg!.body).toContain(`Recovered: +${expectedRecovery.toLocaleString()} credits`);

    // And the scrap must not advance completion-based progression counters.
    expect((sC.completedContracts ?? []).length).toBe(1);
    expect(countFulfilledContracts(sC.completedContracts)).toBe(0);
  });

  it("expired awards do not advance completion achievements or fulfilled counters", () => {
    const mk = (status: "completed" | "expired", i: number): ContractInstance => ({
      id: `arch-${status}-${i}`,
      defId: "ct-steel-supply",
      contractorId: "freighthub-logistics",
      districtId: "district-1",
      status,
      progress: status === "completed" ? 100 : 40,
      startTick: 0,
      ticksElapsed: 30,
      totalPaid: 1000,
      procurementMethod: "openTender",
      delaysOccurred: 0,
      overrunCost: 0,
      events: [],
    });
    const expired = Array.from({ length: 10 }, (_, i) => mk("expired", i));
    const fulfilled = Array.from({ length: 10 }, (_, i) => mk("completed", i));
    expect(countFulfilledContracts(expired)).toBe(0);
    expect(countFulfilledContracts(fulfilled)).toBe(10);
    expect(countFulfilledContracts(undefined)).toBe(0);
    // Legacy archive entries (pre-#581 saves) never carry "expired" — any
    // entry not explicitly expired still counts, so old totals hold.
    expect(countFulfilledContracts([{} as unknown as ContractInstance])).toBe(1);

    const contractor10 = ACHIEVEMENTS.find((a) => a.id === "contract-10");
    expect(contractor10, "contract-10 achievement def missing").toBeDefined();
    const s = createInitialState();
    s.completedContracts = expired;
    expect(contractor10!.check(s)).toBe(false);
    s.completedContracts = fulfilled;
    expect(contractor10!.check(s)).toBe(true);
  });

  it("summarizeCompletionEffects renders buildings, resources and stockpiles readably", () => {
    const housing = CONTRACT_TEMPLATES.find((t) => t.id === "ct-micro-housing-200")!;
    expect(summarizeCompletionEffects(housing)).toContain("1× Worker Housing Stacks");
    const steel = CONTRACT_TEMPLATES.find((t) => t.id === "ct-steel-supply")!;
    expect(summarizeCompletionEffects(steel)).toContain("+500 steel");
    const wildlands = CONTRACT_TEMPLATES.find((t) => t.id === "ct-wildlands-meat-supply")!;
    expect(summarizeCompletionEffects(wildlands)).toContain("+400 wild meat");
  });
});

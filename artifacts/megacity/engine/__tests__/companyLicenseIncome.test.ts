import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import {
  computeEconomyBreakdown,
  computeCompanyMaintenance,
  computeCompanyTaxOutput,
} from "@/engine/economyBreakdown";
import { COMPANIES_MAP } from "@/engine/companies";
import { applyCompanyLicense } from "@/engine/companyActions";
import type { GameState, TickEntry } from "@/engine/types";

/**
 * Task #582: a purchased commercial license must visibly pay out its stated
 * recurring income (player report: "charges credits but the promised payout
 * never shows up").
 *
 * The engine has credited company taxOutput into rates.taxIncome since the
 * feature shipped — the payout was real but INVISIBLE: folded into the
 * aggregate Tax Revenue line while Company Maintenance showed as its own
 * expense. These tests pin the fix: an itemized COMMERCIAL LICENSING ledger
 * line, breakdown parity, and the credit-ledger sum invariant.
 *
 * (The purchase-side receipt message lives in GameContext.licenseCompany —
 * React-context code, covered by inspection/e2e rather than engine tests.)
 */

const COMPANY_ID = "helios-grid"; // taxOutput 420, maintenanceCost 120

function license(s: GameState, companyId: string = COMPANY_ID): GameState {
  s.companies = [
    ...(s.companies ?? []),
    { companyId, districtId: s.districts[0]?.id ?? "central-command", licenseDate: s.totalTicks },
  ];
  return s;
}

function mk(): GameState {
  const s = createInitialState();
  s.tickPaused = false;
  return s;
}

function entryDelta(entries: TickEntry[], label: string): number {
  return entries.filter((e) => e.label === label).reduce((sum, e) => sum + e.delta, 0);
}

describe("commercial license payout (Task #582)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computeCompanyTaxOutput sums licensed defs and survives junk", () => {
    expect(computeCompanyTaxOutput(undefined)).toBe(0);
    expect(computeCompanyTaxOutput([])).toBe(0);
    const def = COMPANIES_MAP[COMPANY_ID];
    expect(def.taxOutput).toBe(420);
    expect(
      computeCompanyTaxOutput([
        { companyId: COMPANY_ID, districtId: "x", licenseDate: 0 },
        { companyId: "no-such-company", districtId: "x", licenseDate: 0 },
      ]),
    ).toBe(420);
  });

  it("a licensed company raises gross tax by exactly its stated output", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const base = runTick(mk()).newState;
    const licensed = runTick(license(mk())).newState;
    expect(licensed.rates.taxIncome - base.rates.taxIncome).toBe(420);
  });

  it("the tick ledger itemizes COMMERCIAL LICENSING and still sums to the treasury delta", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let s = license(mk());
    for (let i = 0; i < 3; i++) {
      const before = s.resources.credits;
      const { newState, entries } = runTick(s);

      // The itemized line carries the full stated output…
      expect(entryDelta(entries, "Commercial Licensing")).toBe(420);
      // …carved out of (not added on top of) gross tax revenue.
      const bd = computeEconomyBreakdown(newState);
      expect(bd.income.licensedCompanyTax).toBe(420);
      expect(entryDelta(entries, "Tax Revenue")).toBe(bd.income.taxGross - 420);

      // Credit-ledger invariant: every credit entry sums to the real delta.
      const creditSum = entries
        .filter((e) => e.unit === "credits")
        .reduce((sum, e) => sum + e.delta, 0);
      expect(creditSum).toBe(newState.resources.credits - before);
      s = newState;
    }
  });

  it("an owned license accrues more credits than the same city without it", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let base = mk();
    let licensed = license(mk());
    // License fee is charged at purchase time (GameContext), not here —
    // equalize starting treasuries so the delta below is purely recurring.
    licensed.resources.credits = base.resources.credits;

    for (let i = 0; i < 5; i++) {
      base = runTick(base).newState;
      licensed = runTick(licensed).newState;
    }
    // Net advantage: +420 gross tax (overhead-capped at 30%) minus 120
    // maintenance ⇒ at least (420 * 0.7 − 120) = 174/tick.
    const advantage = licensed.resources.credits - base.resources.credits;
    expect(advantage).toBeGreaterThanOrEqual(5 * 174);
  });

  it("the itemized share is clamped to gross tax (never larger, never negative)", () => {
    // A degraded city whose gross tax dips below the licensed output must
    // show the share clamped to the gross — the carve-out can never exceed
    // what is actually booked, and a negative gross carves out nothing.
    const s = license(mk());
    s.rates = { ...s.rates, taxIncome: 100 };
    expect(computeEconomyBreakdown(s).income.licensedCompanyTax).toBe(100);
    s.rates = { ...s.rates, taxIncome: -50 };
    expect(computeEconomyBreakdown(s).income.licensedCompanyTax).toBe(0);
  });

  it("no licensed companies ⇒ no licensing line, tax revenue books the full gross", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { newState, entries } = runTick(mk());
    expect(entries.some((e) => e.label === "Commercial Licensing")).toBe(false);
    const bd = computeEconomyBreakdown(newState);
    expect(bd.income.licensedCompanyTax).toBe(0);
    expect(entryDelta(entries, "Tax Revenue")).toBe(bd.income.taxGross);
  });

  it("quarantined legacy licenses do not contribute tax or maintenance", () => {
    const def = COMPANIES_MAP[COMPANY_ID];
    const quarantined = {
      companyId: COMPANY_ID,
      districtId: "district-removed-from-save",
      licenseDate: 12,
      status: "quarantined" as const,
      quarantineReason: "unknown_district" as const,
    };

    expect(computeCompanyTaxOutput([quarantined])).toBe(0);
    expect(computeCompanyMaintenance([quarantined])).toBe(0);
    expect(computeCompanyTaxOutput([{ companyId: COMPANY_ID, districtId: "x", licenseDate: 0 }])).toBe(def.taxOutput);
  });

  it("rejects an unknown district without partially mutating the license transaction", () => {
    const before = mk();
    const result = applyCompanyLicense(before, COMPANY_ID, "district-that-does-not-exist");

    expect(result).toEqual({
      ok: false,
      state: before,
      reason: "unknown_district",
    });
    expect(result.state).toBe(before);
    expect(before.resources.credits).toBe(mk().resources.credits);
    expect(before.companies).toEqual([]);
    expect(before.messages).toEqual(mk().messages);
  });

  it("still licenses a company to a registered district", () => {
    const before = mk();
    const district = before.districts[0];
    const result = applyCompanyLicense(before, COMPANY_ID, district.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.resources.credits).toBe(before.resources.credits - COMPANIES_MAP[COMPANY_ID].licenseCost);
    expect(result.state.companies).toContainEqual({
      companyId: COMPANY_ID,
      districtId: district.id,
      licenseDate: before.totalTicks,
    });
    expect(result.state.messages).toHaveLength(before.messages.length + 1);
  });
});

// Regression coverage for the lifetime gross-income tracker
// (GameState.totalCreditsEarned). The career/profile screen and the Steam
// `stat_total_credits_earned` read this running total instead of the live
// (spendable) credit balance, so every income path must fold its grant in via
// recordCreditsEarned. These tests pin a representative set of NON-tick income
// sources (helper, expedition reward application, sales, indie-enterprise tax)
// so a future income site added without instrumentation gets caught.

import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { recordCreditsEarned } from "@/engine/creditTracking";
import { applyRewardResources } from "@/engine/expeditionRewards";
import { applyIndependentEnterpriseTax } from "@/engine/independentEnterprises";
import { applyPartnerAndPlayerTickEffects } from "@/engine/partnerCityStats";
import { processMissedTicks } from "@/engine/formulas";
import { resolveMegafaunaHunt, MEGAFAUNA_BOSSES } from "@/engine/megafaunaHunts";
import type { ActiveEdict, GameState, WildlandsProject } from "@/engine/types";

describe("totalCreditsEarned lifetime accrual", () => {
  it("recordCreditsEarned only books positive, finite grants", () => {
    const s = createInitialState();
    s.totalCreditsEarned = 0;

    recordCreditsEarned(s, 1000);
    recordCreditsEarned(s, 250);
    expect(s.totalCreditsEarned).toBe(1250);

    // Spending / negatives / NaN must never lower or pollute the tally.
    recordCreditsEarned(s, -500);
    recordCreditsEarned(s, 0);
    recordCreditsEarned(s, Number.NaN);
    recordCreditsEarned(s, Infinity);
    expect(s.totalCreditsEarned).toBe(1250);
  });

  it("climbs even when the spendable balance is later drained", () => {
    const s = createInitialState();
    s.totalCreditsEarned = 0;
    s.resources.credits = 0;

    // Earn, then spend it all — the lifetime total must hold.
    s.resources.credits += 5000;
    recordCreditsEarned(s, 5000);
    s.resources.credits = 0; // simulate spending everything

    expect(s.resources.credits).toBe(0);
    expect(s.totalCreditsEarned).toBe(5000);
  });

  it("expedition reward application books its credit loot", () => {
    const s = createInitialState();
    s.totalCreditsEarned = 0;
    const startBalance = s.resources.credits;

    applyRewardResources(s, {
      resources: { credits: 3200, steel: 100 },
      items: [],
      troops: [],
      techDiscovery: null,
      loreDiscovery: null,
    });

    expect(s.resources.credits).toBe(startBalance + 3200);
    expect(s.totalCreditsEarned).toBe(3200);
  });

  it("independent-enterprise tax books its per-tick credit income", () => {
    const s = createInitialState();
    s.totalCreditsEarned = 0;
    const startBalance = s.resources.credits;
    s.localEconomy = { ...(s.localEconomy ?? {}), taxPerTick: 1500 } as GameState["localEconomy"];

    applyIndependentEnterpriseTax(s);

    expect(s.resources.credits).toBe(startBalance + 1500);
    expect(s.totalCreditsEarned).toBe(1500);
  });

  it("partner-city occupation tribute books its per-tick income", () => {
    const base = createInitialState();
    const target = (base.externalMegacities ?? [])[0];
    expect(target).toBeDefined();

    const s: GameState = {
      ...base,
      totalCreditsEarned: 0,
      externalMegacities: (base.externalMegacities ?? []).map((m, i) =>
        i === 0
          ? { ...m, controlStatus: "occupied" as const, tributePerTick: 2000, endState: undefined }
          : m,
      ),
    };

    const result = applyPartnerAndPlayerTickEffects(s);

    // tribute folds into both the spendable balance and the lifetime total.
    expect(result.state.resources.credits).toBe(base.resources.credits + 2000);
    expect(result.state.totalCreditsEarned).toBe(2000);
  });

  it("megafauna hunt loot books its credit reward on a kill", () => {
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(0); // force all phases WIN → full_kill
    try {
      const s = createInitialState();
      s.totalCreditsEarned = 0;
      const startBalance = s.resources.credits;
      const boss = MEGAFAUNA_BOSSES.tarpit_titan;

      const project: WildlandsProject = {
        id: "wl-test-hunt",
        kind: "beast_hunt",
        biome: "toxic_marsh",
        ticksRemaining: 0,
        totalTicks: 4,
        status: "active",
        startedAtTick: 0,
        meta: { megafaunaId: "tarpit_titan", loadoutSnapshot: { infantry: 500 } },
      } as unknown as WildlandsProject;

      resolveMegafaunaHunt(s, project, []);

      expect(s.totalCreditsEarned).toBe(boss.loot.credits);
      expect(s.resources.credits).toBe(startBalance + boss.loot.credits);
    } finally {
      randSpy.mockRestore();
    }
  });

  it("offline catchup books gross-POSITIVE edict income, never the net", () => {
    // The catchup extrapolation (count > batchLimit) is the only path that
    // aggregates edict credits. A negative edict must drain the spendable
    // balance WITHOUT erasing positive earnings from the lifetime stat, exactly
    // as the per-tick recordCreditsEarned (≤0 no-op) calls do in runTick.
    const buildEdict = (edictId: string): ActiveEdict => ({
      edictId,
      ticksRemaining: 1000,
      issuedAtTick: 0,
      cooldownUntilTick: 0,
    });

    const make = (edictIds: string[]): GameState => {
      const s = createInitialState();
      s.totalCreditsEarned = 0;
      s.activeEdicts = edictIds.map(buildEdict);
      return s;
    };

    // batchLimit 0 ⇒ no live ticks, pure extrapolation over all 10 skipped ticks
    // (so edict happiness side-effects can't perturb the comparison via tax).
    const positiveOnly = processMissedTicks(make(["credit_printing_spree"]), 10, 0).newState;
    const positivePlusNegative = processMissedTicks(
      make(["credit_printing_spree", "stimulus_package"]),
      10,
      0,
    ).newState;

    // The negative edict drains the spendable balance...
    expect(positivePlusNegative.resources.credits).toBeLessThan(positiveOnly.resources.credits);
    // ...but lifetime earned is identical — the negative never subtracts from it.
    expect(positivePlusNegative.totalCreditsEarned).toBe(positiveOnly.totalCreditsEarned);
    // And the positive edict actually contributed to earned.
    expect(positiveOnly.totalCreditsEarned).toBeGreaterThan(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  processAutoRecruit,
  RECRUIT_INTERVAL,
  getMaxRetinueStrength,
  applyRecruitBatchProposal,
} from "@/engine/autoRecruit";
import { setAutoManagerMode } from "@/engine/autoManagers";
import { applyAcceptProposal } from "@/engine/acceptProposal";
import { runNewSystemTicks } from "@/engine/tickProcessors";
import { createDefaultRetinueState, getClassDef, type TroopClassId } from "@/engine/retinueData";
import { recruitTroop } from "@/engine/retinue";
import type { GameState, TickEntry } from "@/engine/types";

function freshState(): GameState {
  const s = createInitialState();
  // Push current tick well past the interval gate so the very first
  // processAutoRecruit call is not blocked by the lastRecruitTick=0 guard.
  s.totalTicks = 100;
  s.resources.credits = 100000;
  s.retinue = createDefaultRetinueState();
  return s;
}

function appointEnforcer(s: GameState): void {
  if (!s.innerCircle) {
    s.innerCircle = { members: [], whispers: [], lastWhisperTick: 0 };
  }
  s.innerCircle.members = [
    {
      officerId: "officer-enforcer-1",
      role: "enforcer",
      level: 3,
      xp: 0,
      xpToNext: 100,
      perksUnlocked: [],
      appointed: 0,
    },
  ];
}

describe("auto-recruit", () => {
  describe("gating", () => {
    it("does nothing when mode is OFF", () => {
      const s = freshState();
      appointEnforcer(s);
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops).toHaveLength(0);
      expect(entries).toHaveLength(0);
    });

    it("does nothing when no Enforcer is appointed (even in ACT)", () => {
      const s = freshState();
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops).toHaveLength(0);
    });

    it("respects RECRUIT_INTERVAL throttle between hires", () => {
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      // Tight budget so the target ceiling is not satisfied after one
      // call — that lets us observe the throttle on the second call.
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 100, classPriority: ["infantry"], targetStrengthPercent: 100 };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      const after = s.retinue!.troops.length;
      expect(after).toBeGreaterThan(0);
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops.length).toBe(after);
      s.totalTicks += RECRUIT_INTERVAL;
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops.length).toBeGreaterThan(after);
    });
  });

  describe("ACT mode hiring", () => {
    it("hires up to budget when treasury comfortably covers the batch (no double-counting)", () => {
      // Regression: a previous version subtracted spentSoFar from
      // s.resources.credits in ACT, double-counting because recruitTroop
      // already mutates credits each iteration. With 500 credits +
      // 500 budget + 100-cost infantry, all 5 hires must fit.
      const s = freshState();
      appointEnforcer(s);
      s.resources.credits = 500;
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 500, classPriority: ["infantry"], targetStrengthPercent: 100 };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops).toHaveLength(5);
      expect(s.resources.credits).toBe(0);
    });

    it("hires by class priority order until budget is exhausted", () => {
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 250, classPriority: ["infantry"], targetStrengthPercent: 100 };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      // Infantry is 100 cr — budget 250 fits 2 hires.
      expect(s.retinue!.troops).toHaveLength(2);
      expect(s.retinue!.troops.every((t) => t.classId === "infantry")).toBe(true);
    });

    it("emits a per-hire inbox message for each troop in ACT mode", () => {
      // Requirement: emit an update message **for each hire**, not one
      // aggregate message per cycle.
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 300, classPriority: ["infantry"], targetStrengthPercent: 100 };
      const beforeMessageCount = (s.messages ?? []).length;
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      const newMessages = (s.messages ?? []).slice(0, s.messages!.length - beforeMessageCount);
      const recruitMessages = newMessages.filter((m) => m.title === "AUTO-RECRUIT: TROOP HIRED");
      expect(recruitMessages.length).toBe(s.retinue!.troops.length);
      expect(recruitMessages.length).toBeGreaterThanOrEqual(2);
    });

    it("stops hiring once the target strength % ceiling is reached", () => {
      // Roster cap = 4 squads * 8 = 32. Target 25% = floor(32*.25) = 8.
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 100000, targetStrengthPercent: 25, classPriority: ["infantry"] };
      expect(getMaxRetinueStrength(s)).toBe(32);
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops).toHaveLength(8);
    });

    it("scales target with retinue capacity (50% of 32 cap = 16)", () => {
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 100000, targetStrengthPercent: 50, classPriority: ["infantry"] };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops).toHaveLength(16);
    });

    it("prefers higher-priority class affordable within budget", () => {
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 200, targetStrengthPercent: 100, classPriority: ["shocktrooper", "infantry"] };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops.every((t) => t.classId === "infantry")).toBe(true);
      expect(s.retinue!.troops.length).toBe(2);
    });

    it("fills empty squad slots first (slot-first ordering)", () => {
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 500, targetStrengthPercent: 100, classPriority: ["infantry"] };
      s.retinue!.squads = [
        { id: "sq-1", name: "Alpha", role: "assault", captainId: "cap-1", troopIds: [], maxSize: 2, formationBonus: 0, totalKills: 0, deploymentsCompleted: 0, created: 0 },
      ];
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.squads[0].troopIds.length).toBe(2);
      const slotted = s.retinue!.troops.filter((t) => t.squadId === "sq-1");
      expect(slotted.length).toBe(2);
    });
  });

  describe("SUGGEST mode", () => {
    it("enqueues a batched proposal previewing total cost and count", () => {
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "suggest");
      // Budget fits ~5 infantry; target 25% of 32 = 8, so plan caps at 5.
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 500, classPriority: ["infantry"], targetStrengthPercent: 25 };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops).toHaveLength(0);
      expect(s.autoManagers!.queue.length).toBe(1);
      const p = s.autoManagers!.queue[0];
      expect(p.domain).toBe("recruit");
      expect(p.kind).toBe("recruit-batch");
      expect(p.officerId).toBe("officer-enforcer-1");
      const payload = p.payload as { hires: string[] };
      expect(payload.hires.length).toBe(5);
      expect(payload.hires.every((c) => c === "infantry")).toBe(true);
      expect(p.costPreview).toMatch(/500/);
      expect(p.title).toMatch(/Hire 5/);
    });

    it("caps the proposed batch by available credits, not just budget", () => {
      // Treasury can only fund 2 infantry (200c) even though the
      // budget per cycle (1000c) and target ceiling (8 troops) would
      // permit more. The proposal must reflect what is actually
      // affordable so accept doesn't only execute a partial batch.
      const s = freshState();
      appointEnforcer(s);
      s.resources.credits = 250;
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "suggest");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 1000, classPriority: ["infantry"], targetStrengthPercent: 25 };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      const p = s.autoManagers!.queue[0];
      const payload = p.payload as { hires: TroopClassId[] };
      expect(payload.hires.length).toBe(2);
      expect(p.costPreview).toMatch(/200/);
    });

    it("downgrades ACT to SUGGEST under honor mode (interlock)", () => {
      const s = freshState();
      appointEnforcer(s);
      s.honorMode = true;
      s.autoManagers = { ...s.autoManagers!, modes: { recruit: "act" } };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops).toHaveLength(0);
      expect(s.autoManagers!.queue.length).toBe(1);
    });

    it("OFF mode disables auto-hire even when previously SUGGEST/ACT and Enforcer is then removed", () => {
      // Mirrors the UI rule that the OFF button stays interactive without
      // an Enforcer so the player can disable a stale ACT/SUGGEST mode.
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      // Player removes the Enforcer (dismissed/killed/etc.).
      s.innerCircle = { ...s.innerCircle!, members: [] };
      // Then toggles OFF via the still-enabled OFF button.
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "off");
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.retinue!.troops).toHaveLength(0);
      expect(s.autoManagers!.queue.length).toBe(0);
      expect(s.autoManagers!.modes.recruit).toBe("off");
    });

    it("does not enqueue a second SUGGEST proposal while one is still pending", () => {
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "suggest");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 300, classPriority: ["infantry"], targetStrengthPercent: 25 };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.autoManagers!.queue.length).toBe(1);
      // Advance past the cycle interval so the throttle is the only thing
      // preventing a second emission, not the per-cycle cadence.
      s.totalTicks += RECRUIT_INTERVAL;
      s.autoRecruit = { ...s.autoRecruit!, lastRecruitTick: 0 };
      processAutoRecruit(s, entries);
      expect(s.autoManagers!.queue.length).toBe(1);
    });
  });

  describe("proposal acceptance", () => {
    it("hires the proposed batch and deducts credits via applyRecruitBatchProposal", () => {
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "suggest");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 300, classPriority: ["infantry"], targetStrengthPercent: 25 };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      const proposal = s.autoManagers!.queue[0];
      const payload = proposal.payload as { hires: TroopClassId[] };
      expect(payload.hires.length).toBe(3);

      const beforeCredits = s.resources.credits;
      const beforeTroops = s.retinue!.troops.length;
      const totalCost = payload.hires.reduce((sum, cid) => sum + getClassDef(cid).recruitCost, 0);

      const after = applyRecruitBatchProposal(s, proposal);
      expect(after.retinue!.troops.length).toBe(beforeTroops + 3);
      expect(after.resources.credits).toBe(beforeCredits - totalCost);
      // Pure: source state is unchanged so React reducers can swap refs.
      expect(s.retinue!.troops.length).toBe(beforeTroops);
      expect(s.resources.credits).toBe(beforeCredits);
    });

    it("slots accepted hires into open squads first", () => {
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "suggest");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 300, classPriority: ["infantry"], targetStrengthPercent: 25 };
      s.retinue!.squads = [
        { id: "sq-1", name: "Alpha", role: "assault", captainId: "cap-1", troopIds: [], maxSize: 2, formationBonus: 0, totalKills: 0, deploymentsCompleted: 0, created: 0 },
      ];
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      const proposal = s.autoManagers!.queue[0];
      const after = applyRecruitBatchProposal(s, proposal);
      expect(after.retinue!.squads[0].troopIds.length).toBe(2);
    });

    it("end-to-end: SUGGEST → accept removes proposal, mutates state, and records decision tick (single reducer)", () => {
      // Mirrors GameContext.acceptAutoManagerProposal in one pass: apply
      // the recruit batch, then dequeue + record decision tick. This
      // locks the contract that all three happen atomically.
      const s = freshState();
      appointEnforcer(s);
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "suggest");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 300, classPriority: ["infantry"], targetStrengthPercent: 25 };
      const entries: TickEntry[] = [];
      processAutoRecruit(s, entries);
      expect(s.autoManagers!.queue).toHaveLength(1);
      const proposal = s.autoManagers!.queue[0];
      const beforeTroops = s.retinue!.troops.length;

      const am = s.autoManagers!;
      const afterRecruit = applyRecruitBatchProposal(s, proposal);
      const final = {
        ...afterRecruit,
        autoManagers: {
          ...am,
          queue: am.queue.filter((p) => p.id !== proposal.id),
          lastDecisionTick: { ...am.lastDecisionTick, [proposal.domain]: s.totalTicks },
        },
      };

      expect(final.autoManagers.queue).toHaveLength(0);
      expect(final.autoManagers.lastDecisionTick.recruit).toBe(s.totalTicks);
      expect(final.retinue!.troops.length).toBeGreaterThan(beforeTroops);
    });

    it("ignores proposals from other domains/kinds (defensive)", () => {
      const s = freshState();
      const fake = {
        id: "x",
        domain: "logistics",
        kind: "build-batch",
        officerId: undefined,
        title: "",
        summary: "",
        rationale: "",
        payload: { hires: ["infantry"] },
        createdTick: 0,
        expiresAtTick: 0,
        declineable: true,
      } as unknown as Parameters<typeof applyRecruitBatchProposal>[1];
      const after = applyRecruitBatchProposal(s, fake);
      expect(after).toBe(s);
    });
  });

  describe("integration: end-to-end via runNewSystemTicks", () => {
    // The accept flow under test is the exact engine function the React glue
    // (GameContext.acceptAutoManagerProposal) calls for the recruit domain:
    // apply the batch, dequeue the proposal, and stamp the per-domain
    // decision tick — all in one reducer pass.
    const acceptViaDispatch = applyAcceptProposal;

    it("ACT mode hires one troop per full tick across several runNewSystemTicks calls", () => {
      // Drive the real per-tick pipeline (not processAutoRecruit in isolation)
      // so tickProcessors wiring is exercised end-to-end. Budget of 100c =
      // exactly one 100c infantry per tick, so each full tick adds one troop.
      const s = freshState();
      appointEnforcer(s);
      s.resources.credits = 1_000_000;
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoRecruit = {
        ...s.autoRecruit!,
        budgetPerTick: 100,
        classPriority: ["infantry"],
        targetStrengthPercent: 100,
        lastRecruitTick: 0,
      };

      const TICKS = 5;
      for (let i = 0; i < TICKS; i++) {
        s.totalTicks = 100 + i;
        const entries: TickEntry[] = [];
        runNewSystemTicks(s, entries);
        // One hire materialized this tick (budget fits exactly one infantry).
        expect(s.retinue!.troops.length).toBe(i + 1);
      }
      expect(s.retinue!.troops).toHaveLength(TICKS);
      expect(s.retinue!.troops.every((t) => t.classId === "infantry")).toBe(true);
    });

    it("SUGGEST mode materializes a proposal through the pipeline, then accept hires the batch", () => {
      const s = freshState();
      appointEnforcer(s);
      s.resources.credits = 1_000_000;
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "suggest");
      s.autoRecruit = {
        ...s.autoRecruit!,
        budgetPerTick: 500,
        classPriority: ["infantry"],
        targetStrengthPercent: 25, // cap 32 → target 8
        lastRecruitTick: 0,
      };

      // SUGGEST never hires autonomously, only enqueues a briefing.
      s.totalTicks = 100;
      const entries: TickEntry[] = [];
      runNewSystemTicks(s, entries);
      expect(s.retinue!.troops).toHaveLength(0);

      const recruitProposals = s.autoManagers!.queue.filter(
        (p) => p.domain === "recruit" && p.kind === "recruit-batch",
      );
      expect(recruitProposals).toHaveLength(1);
      const proposal = recruitProposals[0];
      const payload = proposal.payload as { hires: TroopClassId[] };
      // Budget 500c funds 5 infantry; target ceiling (8) is not the limiter.
      expect(payload.hires).toHaveLength(5);
      expect(proposal.officerId).toBe("officer-enforcer-1");

      // Accept via the same dispatch path GameContext uses.
      const final = acceptViaDispatch(s, proposal.id);

      expect(final.retinue!.troops).toHaveLength(5);
      expect(final.retinue!.troops.every((t) => t.classId === "infantry")).toBe(true);
      expect(final.autoManagers!.queue).toHaveLength(0);
      expect(final.autoManagers!.lastDecisionTick.recruit).toBe(s.totalTicks);
      // applyRecruitBatchProposal is pure: the source state is untouched so the
      // React reducer can swap refs without aliasing.
      expect(s.retinue!.troops).toHaveLength(0);
    });

    it("ACT then SUGGEST in one session: hires accrue, then a top-up briefing is proposed", () => {
      const s = freshState();
      appointEnforcer(s);
      s.resources.credits = 1_000_000;
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoRecruit = {
        ...s.autoRecruit!,
        budgetPerTick: 100,
        classPriority: ["infantry"],
        targetStrengthPercent: 25, // cap 32 → target 8
        lastRecruitTick: 0,
      };

      // ACT for a few ticks — partial fill toward the target.
      for (let i = 0; i < 3; i++) {
        s.totalTicks = 100 + i;
        runNewSystemTicks(s, []);
      }
      const afterAct = s.retinue!.troops.length;
      expect(afterAct).toBe(3);
      expect(s.autoManagers!.queue).toHaveLength(0);

      // Switch the same session to SUGGEST and raise the budget so a single
      // briefing covers the remaining gap to the target (8 - 3 = 5).
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "suggest");
      s.autoRecruit = { ...s.autoRecruit!, budgetPerTick: 2000, lastRecruitTick: 0 };
      s.totalTicks = 200;
      runNewSystemTicks(s, []);

      // No autonomous hires under SUGGEST; a proposal for the remaining 5 appears.
      expect(s.retinue!.troops).toHaveLength(afterAct);
      const proposal = s.autoManagers!.queue.find(
        (p) => p.domain === "recruit" && p.kind === "recruit-batch",
      )!;
      expect(proposal).toBeDefined();
      const payload = proposal.payload as { hires: TroopClassId[] };
      expect(payload.hires).toHaveLength(8 - afterAct);

      const final = acceptViaDispatch(s, proposal.id);
      expect(final.retinue!.troops).toHaveLength(8);
      expect(final.autoManagers!.queue).toHaveLength(0);
    });
  });

  describe("save/load migration", () => {
    it("seeds autoRecruit with targetStrengthPercent on a fresh initial state", () => {
      const s = createInitialState();
      expect(s.autoRecruit).toBeDefined();
      expect(s.autoRecruit!.targetStrengthPercent).toBeGreaterThan(0);
      expect(s.autoRecruit!.targetStrengthPercent).toBeLessThanOrEqual(100);
      expect(s.autoRecruit!.classPriority.length).toBeGreaterThan(0);
    });
  });
});

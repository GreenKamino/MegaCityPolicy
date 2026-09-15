import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  setAutoManagerMode,
  DOMAIN_ROLES,
  type AutoManagerDomain,
  type AutoManagerProposalKind,
} from "@/engine/autoManagers";
import {
  applyAcceptProposal,
  applyDeclineProposal,
  applySnoozeProposal,
} from "@/engine/acceptProposal";
import { runNewSystemTicks } from "@/engine/tickProcessors";
import type { GameState, TickEntry } from "@/engine/types";

/**
 * End-to-end integration tests for the per-domain auto-managers
 * (engine/autoDomainManagers.ts), modeled on the recruit-domain flow in
 * autoRecruit.test.ts. Each test drives the *real* per-tick pipeline
 * (runNewSystemTicks → processAutoDomainManagers) rather than calling the
 * domain processor in isolation, and exercises the same accept dispatch
 * path GameContext.acceptAutoManagerProposal uses (applyDomainProposal →
 * dequeue → stamp lastDecisionTick).
 *
 * Coverage: research, trade, military, agriculture, edicts, intel,
 * espionage — every domain handled by applyDomainProposal.
 *
 * Exact numeric mutations are asserted in the SUGGEST→accept tests, where
 * the resource snapshot is taken *immediately before* the pure accept call
 * — so unrelated pipeline noise from the tick is already baked into the
 * snapshot and cannot make the delta assertions flaky. ACT tests assert
 * the deterministic signals the ACT path emits (a tick-log entry whose
 * reason is unique to the domain manager, plus the domain's inbox message)
 * rather than post-pipeline resource equality.
 */

function freshState(): GameState {
  const s = createInitialState();
  // Push the tick well past every domain interval gate (max 16) so the
  // first processAutoDomainManagers call is not blocked by lastTick=0.
  s.totalTicks = 100;
  s.resources.credits = 1_000_000;
  return s;
}

/**
 * Appoint the Inner Circle officer whose role gates `domain`. agriculture
 * maps to "agriculture_minister", which is intentionally outside the
 * InnerCircleRole union (unfillable in normal play), so the role is cast.
 */
function appoint(s: GameState, domain: AutoManagerDomain): string {
  const officerId = `officer-${domain}`;
  if (!s.innerCircle) {
    s.innerCircle = { members: [], whispers: [], lastWhisperTick: 0 };
  }
  s.innerCircle.members = [
    {
      officerId,
      role: DOMAIN_ROLES[domain] as never,
      level: 3,
      xp: 0,
      xpToNext: 100,
      perksUnlocked: [],
      appointed: 0,
    },
  ];
  return officerId;
}

function tick(s: GameState): TickEntry[] {
  const entries: TickEntry[] = [];
  runNewSystemTicks(s, entries);
  return entries;
}

function findProposal(s: GameState, domain: AutoManagerDomain, kind: AutoManagerProposalKind) {
  return s.autoManagers!.queue.find((p) => p.domain === domain && p.kind === kind);
}

/**
 * The accept flow under test is the exact engine function the React glue
 * (GameContext.acceptAutoManagerProposal) calls: re-derive + apply the plan
 * from current state, dequeue the proposal, and stamp the per-domain
 * decision tick — all in one reducer pass.
 */
const acceptViaDispatch = applyAcceptProposal;

function expectActEntry(entries: TickEntry[], reasonPrefix: string): void {
  expect(entries.some((e) => e.reason.startsWith(reasonPrefix))).toBe(true);
}

function expectMessage(s: GameState, title: string): void {
  expect((s.messages ?? []).some((m) => m.title === title)).toBe(true);
}

describe("auto-domain-managers integration (runNewSystemTicks)", () => {
  describe("research", () => {
    it("SUGGEST: materializes a research-pick proposal, then accept starts the project", () => {
      const s = freshState();
      appoint(s, "research");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "research", "suggest");
      s.activeResearch = null;
      s.unlockedTechnologies = [];

      const entries = tick(s);

      // SUGGEST never acts autonomously.
      expect(s.activeResearch).toBeNull();
      expectActEntryAbsent(entries, "Auto-research:");
      const proposal = findProposal(s, "research", "research-pick");
      expect(proposal).toBeDefined();
      expect(proposal!.officerId).toBe("officer-research");

      const final = acceptViaDispatch(s, proposal!.id);

      expect(final.activeResearch).not.toBeNull();
      expect(final.activeResearch!.progress).toBe(0);
      expect(final.activeResearch!.cost).toBeGreaterThan(0);
      expect(final.autoManagers!.queue.find((p) => p.id === proposal!.id)).toBeUndefined();
      expect(final.autoManagers!.lastDecisionTick.research).toBe(s.totalTicks);
      // applyDomainProposal is pure: source state untouched.
      expect(s.activeResearch).toBeNull();
    });

    it("ACT: starts a research project autonomously through the pipeline", () => {
      const s = freshState();
      appoint(s, "research");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "research", "act");
      s.activeResearch = null;
      s.unlockedTechnologies = [];

      const entries = tick(s);

      expectActEntry(entries, "Auto-research:");
      expectMessage(s, "AUTO-RESEARCH: PROJECT STARTED");
      expect(s.activeResearch).not.toBeNull();
    });
  });

  describe("trade", () => {
    it("SUGGEST: materializes a trade-accept proposal, then accept sells the surplus", () => {
      const s = freshState();
      appoint(s, "trade");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "trade", "suggest");
      s.resources.goods = 10_000; // target 4000 → surplus, sells min(6000, 1000)=1000 @ 9cr

      const entries = tick(s);

      expectActEntryAbsent(entries, "Auto-trade:");
      const proposal = findProposal(s, "trade", "trade-accept");
      expect(proposal).toBeDefined();
      expect(proposal!.officerId).toBe("officer-trade");

      const beforeCredits = s.resources.credits;
      const beforeGoods = s.resources.goods;
      const final = acceptViaDispatch(s, proposal!.id);

      expect(final.resources.credits).toBe(beforeCredits + 1000 * 9);
      expect(final.resources.goods).toBe(beforeGoods - 1000);
      expect(final.autoManagers!.queue.find((p) => p.id === proposal!.id)).toBeUndefined();
      expect(final.autoManagers!.lastDecisionTick.trade).toBe(s.totalTicks);
      // Pure: source state untouched.
      expect(s.resources.goods).toBe(beforeGoods);
    });

    it("ACT: brokers the export autonomously through the pipeline", () => {
      const s = freshState();
      appoint(s, "trade");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "trade", "act");
      s.resources.goods = 10_000;

      const entries = tick(s);

      expectActEntry(entries, "Auto-trade:");
      expectMessage(s, "AUTO-TRADE: EXPORT BROKERED");
    });
  });

  describe("military", () => {
    it("SUGGEST: materializes a military-topup proposal, then accept restocks", () => {
      const s = freshState();
      appoint(s, "military");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "military", "suggest");
      s.resources.fuel = 0; // target 3000, budget 40000, fuel @ 18 → 2222 units

      const entries = tick(s);

      expectActEntryAbsent(entries, "Auto-military:");
      const proposal = findProposal(s, "military", "military-topup");
      expect(proposal).toBeDefined();

      const beforeCredits = s.resources.credits;
      const beforeFuel = s.resources.fuel;
      const final = acceptViaDispatch(s, proposal!.id);

      expect(final.resources.fuel).toBe(beforeFuel + 2222);
      expect(final.resources.credits).toBe(beforeCredits - 2222 * 18);
      expect(final.autoManagers!.lastDecisionTick.military).toBe(s.totalTicks);
    });

    it("ACT: tops up supplies autonomously through the pipeline", () => {
      const s = freshState();
      appoint(s, "military");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "military", "act");
      s.resources.fuel = 0;

      const entries = tick(s);

      expectActEntry(entries, "Auto-military:");
      expectMessage(s, "AUTO-MILITARY: SUPPLIES RESTOCKED");
    });
  });

  describe("agriculture", () => {
    it("SUGGEST: materializes a farm-contract proposal, then accept secures food", () => {
      const s = freshState();
      appoint(s, "agriculture");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "agriculture", "suggest");
      s.buildings.agriculturalDomeDistrict = 3;
      s.resources.food = 0; // target 6000, budget 25000, food @ 8 → 3125 units

      const entries = tick(s);

      expectActEntryAbsent(entries, "Auto-agriculture:");
      const proposal = findProposal(s, "agriculture", "farm-contract");
      expect(proposal).toBeDefined();

      const beforeCredits = s.resources.credits;
      const beforeFood = s.resources.food;
      const final = acceptViaDispatch(s, proposal!.id);

      expect(final.resources.food).toBe(beforeFood + 3125);
      expect(final.resources.credits).toBe(beforeCredits - 25_000);
      expect(final.autoManagers!.lastDecisionTick.agriculture).toBe(s.totalTicks);
    });

    it("ACT: procures food autonomously through the pipeline", () => {
      const s = freshState();
      appoint(s, "agriculture");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "agriculture", "act");
      s.resources.food = 0;

      const entries = tick(s);

      expectActEntry(entries, "Auto-agriculture:");
      expectMessage(s, "AUTO-AGRICULTURE: RATIONS SECURED");
    });
  });

  describe("edicts", () => {
    it("SUGGEST: materializes an edict-tune proposal, then accept enacts an edict", () => {
      const s = freshState();
      appoint(s, "edicts");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "edicts", "suggest");
      s.activeEdicts = [];
      s.edictCooldowns = {};

      const entries = tick(s);

      expectActEntryAbsent(entries, "Auto-edict:");
      const proposal = findProposal(s, "edicts", "edict-tune");
      expect(proposal).toBeDefined();

      const beforeCredits = s.resources.credits;
      const beforeActive = (s.activeEdicts ?? []).length;
      const final = acceptViaDispatch(s, proposal!.id);

      expect(final.activeEdicts!.length).toBe(beforeActive + 1);
      // First affordable, off-cooldown, authority-met edict in the default
      // priority list is the Economic Stimulus Package (120,000 credits).
      expect(final.resources.credits).toBe(beforeCredits - 120_000);
      expect(final.autoManagers!.lastDecisionTick.edicts).toBe(s.totalTicks);
    });

    it("ACT: enacts an edict autonomously through the pipeline", () => {
      const s = freshState();
      appoint(s, "edicts");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "edicts", "act");
      s.activeEdicts = [];
      s.edictCooldowns = {};

      const entries = tick(s);

      expectActEntry(entries, "Auto-edict:");
      expectMessage(s, "AUTO-EDICTS: EDICT ENACTED");
      expect((s.activeEdicts ?? []).length).toBeGreaterThan(0);
    });
  });

  describe("intel", () => {
    it("SUGGEST: materializes an intel-op proposal, then accept files intel and bills credits", () => {
      const s = freshState();
      appoint(s, "intel");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "intel", "suggest");
      s.intelItems = []; // below target (3) → need exists; factions provide targets

      const entries = tick(s);

      expectActEntryAbsent(entries, "Auto-intel:");
      const proposal = findProposal(s, "intel", "intel-op");
      expect(proposal).toBeDefined();

      const beforeCredits = s.resources.credits;
      const beforeItems = (s.intelItems ?? []).length;
      const final = acceptViaDispatch(s, proposal!.id);

      expect((final.intelItems ?? []).length).toBe(beforeItems + 1);
      expect(final.resources.credits).toBe(beforeCredits - 5000);
      expect(final.autoManagers!.lastDecisionTick.intel).toBe(s.totalTicks);
    });

    it("ACT: runs an intelligence sweep autonomously through the pipeline", () => {
      const s = freshState();
      appoint(s, "intel");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "intel", "act");
      s.intelItems = [];

      const entries = tick(s);

      expectActEntry(entries, "Auto-intel:");
      expectMessage(s, "AUTO-INTEL: OPERATION COMPLETE");
    });
  });

  describe("espionage", () => {
    function makeHostile(s: GameState): void {
      // Espionage only plans when a hostile partner exists (threat > 50).
      if (s.factions && s.factions.length > 0) {
        s.factions[0] = { ...s.factions[0], isActive: true, threat: 99 };
      }
    }

    it("SUGGEST: materializes a counter-op proposal, then accept files intel and bills credits", () => {
      const s = freshState();
      appoint(s, "espionage");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "espionage", "suggest");
      s.intelItems = [];
      makeHostile(s);

      const entries = tick(s);

      expectActEntryAbsent(entries, "Auto-espionage:");
      const proposal = findProposal(s, "espionage", "counter-op");
      expect(proposal).toBeDefined();

      const beforeCredits = s.resources.credits;
      const beforeItems = (s.intelItems ?? []).length;
      const final = acceptViaDispatch(s, proposal!.id);

      expect((final.intelItems ?? []).length).toBe(beforeItems + 1);
      expect(final.resources.credits).toBe(beforeCredits - 6000);
      expect(final.autoManagers!.lastDecisionTick.espionage).toBe(s.totalTicks);
    });

    it("ACT: runs a counter-intel sweep autonomously through the pipeline", () => {
      const s = freshState();
      appoint(s, "espionage");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "espionage", "act");
      s.intelItems = [];
      makeHostile(s);

      const entries = tick(s);

      expectActEntry(entries, "Auto-espionage:");
      expectMessage(s, "AUTO-ESPIONAGE: SWEEP COMPLETE");
    });
  });

  describe("decline (applyDeclineProposal)", () => {
    it("dequeues the proposal and stamps lastDecisionTick without applying the plan", () => {
      const s = freshState();
      appoint(s, "trade");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "trade", "suggest");
      s.resources.goods = 10_000;

      tick(s);

      const proposal = findProposal(s, "trade", "trade-accept");
      expect(proposal).toBeDefined();

      const beforeCredits = s.resources.credits;
      const beforeGoods = s.resources.goods;
      const final = applyDeclineProposal(s, proposal!.id);

      // Dequeued.
      expect(final.autoManagers!.queue.find((p) => p.id === proposal!.id)).toBeUndefined();
      // Per-domain decision tick stamped.
      expect(final.autoManagers!.lastDecisionTick.trade).toBe(s.totalTicks);
      // No domain handler ran: resources untouched.
      expect(final.resources.credits).toBe(beforeCredits);
      expect(final.resources.goods).toBe(beforeGoods);
      // Pure: source state untouched.
      expect(s.autoManagers!.queue.find((p) => p.id === proposal!.id)).toBeDefined();
    });

    it("returns state unchanged for an unknown proposal id", () => {
      const s = freshState();
      appoint(s, "trade");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "trade", "suggest");
      s.resources.goods = 10_000;
      tick(s);

      const final = applyDeclineProposal(s, "no-such-id");
      expect(final).toBe(s);
    });
  });

  describe("snooze (applySnoozeProposal)", () => {
    it("dequeues the proposal and records a snoozedKinds entry with untilTick = now + ticks", () => {
      const s = freshState();
      appoint(s, "trade");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "trade", "suggest");
      s.resources.goods = 10_000;

      tick(s);

      const proposal = findProposal(s, "trade", "trade-accept");
      expect(proposal).toBeDefined();

      const final = applySnoozeProposal(s, proposal!.id, 25);

      // Dequeued.
      expect(final.autoManagers!.queue.find((p) => p.id === proposal!.id)).toBeUndefined();
      // snoozedKinds carries the proposal's kind with the right untilTick.
      const entry = final.autoManagers!.snoozedKinds.find((k) => k.kind === proposal!.kind);
      expect(entry).toBeDefined();
      expect(entry!.untilTick).toBe(s.totalTicks + 25);
      // Snooze does NOT stamp lastDecisionTick.
      expect(final.autoManagers!.lastDecisionTick.trade).toBeUndefined();
      // Pure: source state untouched.
      expect(s.autoManagers!.queue.find((p) => p.id === proposal!.id)).toBeDefined();
    });

    it("replaces an existing snoozedKinds entry for the same kind rather than duplicating it", () => {
      const s = freshState();
      appoint(s, "trade");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "trade", "suggest");
      s.resources.goods = 10_000;

      tick(s);

      const proposal = findProposal(s, "trade", "trade-accept");
      expect(proposal).toBeDefined();
      // Seed a stale snooze entry for the same kind.
      s.autoManagers!.snoozedKinds = [{ kind: proposal!.kind, untilTick: 1 }];

      const final = applySnoozeProposal(s, proposal!.id, 10);

      const matches = final.autoManagers!.snoozedKinds.filter((k) => k.kind === proposal!.kind);
      expect(matches.length).toBe(1);
      expect(matches[0].untilTick).toBe(s.totalTicks + 10);
    });

    it("floors the snooze window at 1 tick when given a non-positive duration", () => {
      const s = freshState();
      appoint(s, "trade");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "trade", "suggest");
      s.resources.goods = 10_000;

      tick(s);

      const proposal = findProposal(s, "trade", "trade-accept");
      expect(proposal).toBeDefined();

      const final = applySnoozeProposal(s, proposal!.id, 0);

      const entry = final.autoManagers!.snoozedKinds.find((k) => k.kind === proposal!.kind);
      expect(entry!.untilTick).toBe(s.totalTicks + 1);
    });

    it("returns state unchanged for an unknown proposal id", () => {
      const s = freshState();
      appoint(s, "trade");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "trade", "suggest");
      s.resources.goods = 10_000;
      tick(s);

      const final = applySnoozeProposal(s, "no-such-id", 10);
      expect(final).toBe(s);
    });
  });
});

function expectActEntryAbsent(entries: TickEntry[], reasonPrefix: string): void {
  expect(entries.some((e) => e.reason.startsWith(reasonPrefix))).toBe(false);
}

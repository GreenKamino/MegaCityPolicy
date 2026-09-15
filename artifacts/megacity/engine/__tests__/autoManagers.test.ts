import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  createDefaultAutoManagerState,
  enqueueProposal,
  getEffectiveMode,
  isKindSnoozed,
  processAutoManagers,
  QUEUE_CAP,
  removeProposal,
  setAlwaysAllow,
  setAutoManagerMode,
  setPauseAllAct,
  shouldAutoAcceptProposal,
  snoozeKind,
  type AutoManagerProposal,
} from "@/engine/autoManagers";
import { migrateState } from "@/engine/saveLoad";
import type { GameState, TickEntry } from "@/engine/types";

function makeProposal(id: string, opts: Partial<AutoManagerProposal> = {}): AutoManagerProposal {
  return {
    id,
    domain: "recruit",
    kind: "recruit-batch",
    title: `Proposal ${id}`,
    summary: "Test summary",
    rationale: "Test rationale",
    createdTick: 0,
    expiresAtTick: 100,
    declineable: true,
    ...opts,
  };
}

describe("auto-manager foundations", () => {
  describe("default state shape", () => {
    it("creates an all-off / empty default", () => {
      const am = createDefaultAutoManagerState();
      expect(am.modes).toEqual({});
      expect(am.queue).toEqual([]);
      expect(am.pauseAllAct).toBe(false);
      expect(am.alwaysAllow).toEqual([]);
      expect(am.snoozedKinds).toEqual([]);
    });

    it("seeds GameState with an autoManagers slice", () => {
      const s = createInitialState();
      expect(s.autoManagers).toBeDefined();
      expect(s.autoManagers!.queue).toEqual([]);
      expect(s.autoManagers!.pauseAllAct).toBe(false);
    });
  });

  describe("mode transitions", () => {
    it("setAutoManagerMode persists per-domain modes", () => {
      let am = createDefaultAutoManagerState();
      am = setAutoManagerMode(am, "recruit", "act");
      am = setAutoManagerMode(am, "research", "suggest");
      expect(am.modes.recruit).toBe("act");
      expect(am.modes.research).toBe("suggest");
      expect(am.modes.intel).toBeUndefined();
    });

    it("coerces ACT → SUGGEST at the mutation point when honor mode is on", () => {
      let am = createDefaultAutoManagerState();
      am = setAutoManagerMode(am, "recruit", "act", true);
      expect(am.modes.recruit).toBe("suggest");
    });

    it("leaves OFF and SUGGEST untouched at the mutation point under honor mode", () => {
      let am = createDefaultAutoManagerState();
      am = setAutoManagerMode(am, "recruit", "off", true);
      am = setAutoManagerMode(am, "research", "suggest", true);
      expect(am.modes.recruit).toBe("off");
      expect(am.modes.research).toBe("suggest");
    });
  });

  describe("getEffectiveMode honor-mode + pause interlocks", () => {
    it("returns OFF when domain is not configured", () => {
      const s = createInitialState();
      expect(getEffectiveMode(s, "recruit")).toBe("off");
    });

    it("passes through SUGGEST and ACT in normal mode", () => {
      const s = createInitialState();
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "research", "suggest");
      expect(getEffectiveMode(s, "recruit")).toBe("act");
      expect(getEffectiveMode(s, "research")).toBe("suggest");
    });

    it("forces ACT → SUGGEST when honorMode is on (read-time defense in depth)", () => {
      const s = createInitialState();
      // Bypass the mutation-point coercion by writing directly, then
      // confirm getEffectiveMode still downgrades.
      s.autoManagers = { ...s.autoManagers!, modes: { recruit: "act" } };
      s.honorMode = true;
      expect(getEffectiveMode(s, "recruit")).toBe("suggest");
    });

    it("forces ACT → SUGGEST when pauseAllAct is on", () => {
      const s = createInitialState();
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoManagers = setPauseAllAct(s.autoManagers!, true);
      expect(getEffectiveMode(s, "recruit")).toBe("suggest");
    });

    it("leaves OFF and SUGGEST untouched under either interlock", () => {
      const s = createInitialState();
      s.honorMode = true;
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "off");
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "research", "suggest");
      expect(getEffectiveMode(s, "recruit")).toBe("off");
      expect(getEffectiveMode(s, "research")).toBe("suggest");
    });
  });

  describe("approval queue", () => {
    it("enqueues proposals up to the cap", () => {
      let am = createDefaultAutoManagerState();
      for (let i = 0; i < QUEUE_CAP; i++) {
        am = enqueueProposal(am, makeProposal(`p${i}`));
      }
      expect(am.queue.length).toBe(QUEUE_CAP);
    });

    it("prunes the oldest declineable proposal when full", () => {
      let am = createDefaultAutoManagerState();
      for (let i = 0; i < QUEUE_CAP; i++) {
        am = enqueueProposal(am, makeProposal(`p${i}`));
      }
      am = enqueueProposal(am, makeProposal("new"));
      expect(am.queue.length).toBe(QUEUE_CAP);
      expect(am.queue.find((p) => p.id === "p0")).toBeUndefined();
      expect(am.queue.find((p) => p.id === "new")).toBeDefined();
    });

    it("drops new proposals when the queue is full of pinned (non-declineable) ones", () => {
      let am = createDefaultAutoManagerState();
      for (let i = 0; i < QUEUE_CAP; i++) {
        am = enqueueProposal(am, makeProposal(`pin${i}`, { declineable: false }));
      }
      am = enqueueProposal(am, makeProposal("new"));
      expect(am.queue.length).toBe(QUEUE_CAP);
      expect(am.queue.find((p) => p.id === "new")).toBeUndefined();
    });

    it("removeProposal pulls an entry by id", () => {
      let am = createDefaultAutoManagerState();
      am = enqueueProposal(am, makeProposal("a"));
      am = enqueueProposal(am, makeProposal("b"));
      am = removeProposal(am, "a");
      expect(am.queue.map((p) => p.id)).toEqual(["b"]);
    });
  });

  describe("snooze + always-allow", () => {
    it("snoozeKind blocks isKindSnoozed until the tick passes", () => {
      let am = createDefaultAutoManagerState();
      am = snoozeKind(am, "recruit-batch", 50);
      expect(isKindSnoozed(am, "recruit-batch", 10)).toBe(true);
      expect(isKindSnoozed(am, "recruit-batch", 60)).toBe(false);
    });

    it("setAlwaysAllow toggles a kind on and off", () => {
      let am = createDefaultAutoManagerState();
      am = setAlwaysAllow(am, "recruit-batch", true);
      expect(am.alwaysAllow).toContain("recruit-batch");
      am = setAlwaysAllow(am, "recruit-batch", false);
      expect(am.alwaysAllow).not.toContain("recruit-batch");
    });
  });

  describe("always-allow replay (shouldAutoAcceptProposal)", () => {
    it("auto-accepts when domain is ACT, kind is on always-allow, and not snoozed", () => {
      const s = createInitialState();
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoManagers = setAlwaysAllow(s.autoManagers!, "recruit-batch", true);
      expect(shouldAutoAcceptProposal(s, makeProposal("p"))).toBe(true);
    });

    it("does not auto-accept when always-allow is unset", () => {
      const s = createInitialState();
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      expect(shouldAutoAcceptProposal(s, makeProposal("p"))).toBe(false);
    });

    it("does not auto-accept when domain is only SUGGEST", () => {
      const s = createInitialState();
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "suggest");
      s.autoManagers = setAlwaysAllow(s.autoManagers!, "recruit-batch", true);
      expect(shouldAutoAcceptProposal(s, makeProposal("p"))).toBe(false);
    });

    it("does not auto-accept under honor mode (kill switch wins)", () => {
      const s = createInitialState();
      s.autoManagers = { ...s.autoManagers!, modes: { recruit: "act" } };
      s.autoManagers = setAlwaysAllow(s.autoManagers!, "recruit-batch", true);
      s.honorMode = true;
      expect(shouldAutoAcceptProposal(s, makeProposal("p"))).toBe(false);
    });

    it("does not auto-accept under pause-all (kill switch wins)", () => {
      const s = createInitialState();
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoManagers = setAlwaysAllow(s.autoManagers!, "recruit-batch", true);
      s.autoManagers = setPauseAllAct(s.autoManagers!, true);
      expect(shouldAutoAcceptProposal(s, makeProposal("p"))).toBe(false);
    });

    it("does not auto-accept while the kind is snoozed", () => {
      const s: GameState = { ...createInitialState(), totalTicks: 10 };
      s.autoManagers = setAutoManagerMode(s.autoManagers!, "recruit", "act");
      s.autoManagers = setAlwaysAllow(s.autoManagers!, "recruit-batch", true);
      s.autoManagers = snoozeKind(s.autoManagers!, "recruit-batch", 100);
      expect(shouldAutoAcceptProposal(s, makeProposal("p"))).toBe(false);
    });
  });

  describe("processAutoManagers tick housekeeping", () => {
    it("fast-bails when nothing is enabled and no queue/snoozes", () => {
      const s = createInitialState();
      const before = s.autoManagers;
      const entries: TickEntry[] = [];
      processAutoManagers(s, entries);
      expect(s.autoManagers).toBe(before);
      expect(entries).toEqual([]);
    });

    it("expires proposals whose TTL passed and emits a tick entry", () => {
      const s: GameState = { ...createInitialState(), totalTicks: 200 };
      s.autoManagers = enqueueProposal(s.autoManagers!, makeProposal("old", { expiresAtTick: 100 }));
      s.autoManagers = enqueueProposal(s.autoManagers!, makeProposal("fresh", { expiresAtTick: 500 }));
      const entries: TickEntry[] = [];
      processAutoManagers(s, entries);
      expect(s.autoManagers!.queue.map((p) => p.id)).toEqual(["fresh"]);
      expect(entries.find((e) => e.label === "Advisor Briefings")).toBeDefined();
    });

    it("garbage-collects expired snoozes", () => {
      const s: GameState = { ...createInitialState(), totalTicks: 100 };
      s.autoManagers = snoozeKind(s.autoManagers!, "recruit-batch", 50);
      s.autoManagers = snoozeKind(s.autoManagers!, "research-pick", 200);
      const entries: TickEntry[] = [];
      processAutoManagers(s, entries);
      expect(s.autoManagers!.snoozedKinds.map((k) => k.kind)).toEqual(["research-pick"]);
    });
  });

  describe("save/load migration", () => {
    it("backfills autoManagers when missing from a legacy save", () => {
      const legacy = createInitialState() as GameState & { autoManagers?: unknown };
      delete legacy.autoManagers;
      const migrated = migrateState(legacy as GameState);
      expect(migrated.autoManagers).toBeDefined();
      expect(migrated.autoManagers!.queue).toEqual([]);
      expect(migrated.autoManagers!.pauseAllAct).toBe(false);
    });
  });
});

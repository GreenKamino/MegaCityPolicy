import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  processAutoDomainManagers,
  applyDomainProposal,
  createDefaultAutoDomainConfigs,
  type AutoDomain,
} from "@/engine/autoDomainManagers";
import { setAutoManagerMode, DOMAIN_ROLES, type AutoManagerProposal } from "@/engine/autoManagers";
import type { GameState, TickEntry } from "@/engine/types";

function freshState(): GameState {
  const s = createInitialState();
  // Push current tick well past every per-domain interval gate so the
  // first processAutoDomainManagers call is not blocked by lastTick=0.
  s.totalTicks = 100;
  s.resources.credits = 1_000_000;
  s.autoDomains = createDefaultAutoDomainConfigs();
  return s;
}

function appoint(s: GameState, domain: AutoDomain, officerId = `officer-${domain}`): void {
  if (!s.innerCircle) {
    s.innerCircle = { members: [], whispers: [], lastWhisperTick: 0 };
  }
  s.innerCircle.members = [
    {
      officerId,
      // agriculture maps to the virtual "agriculture_minister" role, which
      // is not part of the InnerCircleRole union — cast so the gate can
      // still be exercised in tests.
      role: DOMAIN_ROLES[domain] as never,
      level: 3,
      xp: 0,
      xpToNext: 100,
      perksUnlocked: [],
      appointed: 0,
    },
  ];
}

function setMode(s: GameState, domain: AutoDomain, mode: "off" | "suggest" | "act"): void {
  s.autoManagers = setAutoManagerMode(s.autoManagers!, domain, mode);
}

// ── Cross-cutting gating ───────────────────────────────────────────────
// One representative domain per gate; the gate is shared by all specs.

describe("auto-domain-managers: gating", () => {
  it("does nothing when mode is OFF", () => {
    const s = freshState();
    appoint(s, "research");
    const before = JSON.stringify(s.activeResearch);
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(JSON.stringify(s.activeResearch)).toBe(before);
    expect(entries).toHaveLength(0);
    expect(s.autoManagers!.queue).toHaveLength(0);
  });

  it("does nothing in ACT when the required officer is not appointed", () => {
    const s = freshState();
    // No officer appointed at all.
    for (const d of ["research", "intel", "espionage", "agriculture", "trade", "military", "edicts"] as AutoDomain[]) {
      setMode(s, d, "act");
    }
    const before = JSON.stringify(s.resources) + JSON.stringify(s.activeResearch);
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(JSON.stringify(s.resources) + JSON.stringify(s.activeResearch)).toBe(before);
    expect(entries).toHaveLength(0);
  });

  it("respects the per-domain interval throttle", () => {
    const s = freshState();
    appoint(s, "military");
    setMode(s, "military", "act");
    s.resources.fuel = 0;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(entries.length).toBe(1);
    const fuelAfterFirst = s.resources.fuel;
    expect(fuelAfterFirst).toBeGreaterThan(0);
    // Immediate re-run is throttled (lastTick just updated).
    s.resources.fuel = 0;
    const entries2: TickEntry[] = [];
    processAutoDomainManagers(s, entries2);
    expect(entries2).toHaveLength(0);
    expect(s.resources.fuel).toBe(0);
  });

  it("downgrades ACT to SUGGEST under honor mode (interlock)", () => {
    const s = freshState();
    appoint(s, "research");
    s.honorMode = true;
    setMode(s, "research", "act");
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    // No autonomous mutation; a proposal is queued instead.
    expect(s.activeResearch).toBeNull();
    expect(s.autoManagers!.queue.length).toBe(1);
  });
});

// ── RESEARCH ───────────────────────────────────────────────────────────

describe("auto-domain-managers: research", () => {
  it("ACT starts the highest-priority prereq-met project", () => {
    const s = freshState();
    appoint(s, "research");
    setMode(s, "research", "act");
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.activeResearch).not.toBeNull();
    expect(entries.some((e) => e.reason.startsWith("Auto-research"))).toBe(true);
  });

  it("ACT is a no-op when a project is already active", () => {
    const s = freshState();
    appoint(s, "research");
    setMode(s, "research", "act");
    s.activeResearch = { techId: "advanced_fusion_reactors", progress: 0, cost: 2400 };
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.activeResearch.techId).toBe("advanced_fusion_reactors");
    expect(entries).toHaveLength(0);
  });

  it("SUGGEST enqueues a research-pick proposal that applies on accept", () => {
    const s = freshState();
    appoint(s, "research");
    setMode(s, "research", "suggest");
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.activeResearch).toBeNull();
    expect(s.autoManagers!.queue.length).toBe(1);
    const p = s.autoManagers!.queue[0];
    expect(p.domain).toBe("research");
    expect(p.kind).toBe("research-pick");
    expect(p.officerId).toBe("officer-research");
    const next = applyDomainProposal(s, p);
    expect(next.activeResearch).not.toBeNull();
  });
});

// ── INTEL ──────────────────────────────────────────────────────────────

describe("auto-domain-managers: intel", () => {
  it("ACT generates intel and spends the op budget", () => {
    const s = freshState();
    appoint(s, "intel");
    setMode(s, "intel", "act");
    s.intelItems = [];
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect((s.intelItems ?? []).length).toBeGreaterThan(0);
    expect(s.resources.credits).toBeLessThan(creditsBefore);
    expect(entries.some((e) => e.reason.startsWith("Auto-intel"))).toBe(true);
  });

  it("ACT is gated by the live-intel target ceiling", () => {
    const s = freshState();
    appoint(s, "intel");
    setMode(s, "intel", "act");
    // Fill above the default target of 3 with live intel items.
    s.intelItems = Array.from({ length: 5 }, (_, i) => ({
      id: `i-${i}`,
      source: "x",
      sourceId: "x",
      kind: "intel" as const,
      subjectId: "f",
      subjectName: "F",
      content: "c",
      acquiredTick: 100,
      expiresTick: 1000,
      reliability: 50,
      acted: false,
    }));
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.resources.credits).toBe(creditsBefore);
    expect(entries).toHaveLength(0);
  });

  it("SUGGEST enqueues an intel-op proposal that applies on accept", () => {
    const s = freshState();
    appoint(s, "intel");
    setMode(s, "intel", "suggest");
    s.intelItems = [];
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    const p = s.autoManagers!.queue[0];
    expect(p.kind).toBe("intel-op");
    const next = applyDomainProposal(s, p);
    expect((next.intelItems ?? []).length).toBeGreaterThan(0);
  });
});

// ── ESPIONAGE ──────────────────────────────────────────────────────────

describe("auto-domain-managers: espionage", () => {
  it("ACT runs a counter-intel sweep against hostile partners", () => {
    const s = freshState();
    appoint(s, "espionage");
    setMode(s, "espionage", "act");
    s.intelItems = [];
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    // Initial factions include several with threat > 50, so a sweep runs.
    expect((s.intelItems ?? []).length).toBeGreaterThan(0);
    expect(s.resources.credits).toBeLessThan(creditsBefore);
    expect(entries.some((e) => e.reason.startsWith("Auto-espionage"))).toBe(true);
  });

  it("SUGGEST enqueues a counter-op proposal that applies on accept", () => {
    const s = freshState();
    appoint(s, "espionage");
    setMode(s, "espionage", "suggest");
    s.intelItems = [];
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    const p = s.autoManagers!.queue[0];
    expect(p.kind).toBe("counter-op");
    const next = applyDomainProposal(s, p);
    expect((next.intelItems ?? []).length).toBeGreaterThan(0);
  });
});

// ── AGRICULTURE ────────────────────────────────────────────────────────

describe("auto-domain-managers: agriculture", () => {
  it("ACT procures food when the stockpile is below the band", () => {
    const s = freshState();
    appoint(s, "agriculture");
    setMode(s, "agriculture", "act");
    s.resources.food = 0;
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.resources.food).toBeGreaterThan(0);
    expect(s.resources.credits).toBeLessThan(creditsBefore);
    expect(entries.some((e) => e.reason.startsWith("Auto-agriculture"))).toBe(true);
  });

  it("ACT is a no-op when food is at or above target", () => {
    const s = freshState();
    appoint(s, "agriculture");
    setMode(s, "agriculture", "act");
    s.resources.food = 999_999;
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.resources.credits).toBe(creditsBefore);
    expect(entries).toHaveLength(0);
  });

  it("SUGGEST enqueues a farm-contract proposal that applies on accept", () => {
    const s = freshState();
    appoint(s, "agriculture");
    setMode(s, "agriculture", "suggest");
    s.resources.food = 0;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    const p = s.autoManagers!.queue[0];
    expect(p.kind).toBe("farm-contract");
    const next = applyDomainProposal(s, p);
    expect(next.resources.food).toBeGreaterThan(0);
  });
});

// ── TRADE ──────────────────────────────────────────────────────────────

describe("auto-domain-managers: trade", () => {
  it("ACT sells surplus of a priority commodity for credits", () => {
    const s = freshState();
    appoint(s, "trade");
    setMode(s, "trade", "act");
    s.resources.goods = 10_000;
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.resources.goods).toBeLessThan(10_000);
    expect(s.resources.credits).toBeGreaterThan(creditsBefore);
    expect(entries.some((e) => e.reason.startsWith("Auto-trade"))).toBe(true);
  });

  it("ACT is a no-op when no priority commodity is in surplus", () => {
    const s = freshState();
    appoint(s, "trade");
    setMode(s, "trade", "act");
    s.resources.goods = 0;
    s.resources.steel = 0;
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.resources.credits).toBe(creditsBefore);
    expect(entries).toHaveLength(0);
  });

  it("SUGGEST enqueues a trade-accept proposal that applies on accept", () => {
    const s = freshState();
    appoint(s, "trade");
    setMode(s, "trade", "suggest");
    s.resources.goods = 10_000;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    const p = s.autoManagers!.queue[0];
    expect(p.kind).toBe("trade-accept");
    const creditsBefore = s.resources.credits;
    const next = applyDomainProposal(s, p);
    expect(next.resources.credits).toBeGreaterThan(creditsBefore);
  });
});

// ── MILITARY ───────────────────────────────────────────────────────────

describe("auto-domain-managers: military", () => {
  it("ACT tops up the most-deficient readiness resource", () => {
    const s = freshState();
    appoint(s, "military");
    setMode(s, "military", "act");
    s.resources.fuel = 0;
    s.resources.ammo = 5000;
    s.resources.medSupplies = 5000;
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.resources.fuel).toBeGreaterThan(0);
    expect(s.resources.credits).toBeLessThan(creditsBefore);
    expect(entries.some((e) => e.reason.startsWith("Auto-military"))).toBe(true);
  });

  it("ACT is a no-op when all readiness resources are at target", () => {
    const s = freshState();
    appoint(s, "military");
    setMode(s, "military", "act");
    s.resources.fuel = 9999;
    s.resources.ammo = 9999;
    s.resources.medSupplies = 9999;
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.resources.credits).toBe(creditsBefore);
    expect(entries).toHaveLength(0);
  });

  it("SUGGEST enqueues a military-topup proposal that applies on accept", () => {
    const s = freshState();
    appoint(s, "military");
    setMode(s, "military", "suggest");
    s.resources.fuel = 0;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    const p = s.autoManagers!.queue[0];
    expect(p.kind).toBe("military-topup");
    const next = applyDomainProposal(s, p);
    expect(next.resources.fuel).toBeGreaterThan(0);
  });
});

// ── EDICTS ─────────────────────────────────────────────────────────────

describe("auto-domain-managers: edicts", () => {
  it("ACT enacts the next-priority affordable edict", () => {
    const s = freshState();
    appoint(s, "edicts");
    setMode(s, "edicts", "act");
    s.activeEdicts = [];
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect((s.activeEdicts ?? []).length).toBe(1);
    expect(s.resources.credits).toBeLessThan(creditsBefore);
    expect(entries.some((e) => e.reason.startsWith("Auto-edict"))).toBe(true);
  });

  it("ACT is a no-op when the active-edict target is already met", () => {
    const s = freshState();
    appoint(s, "edicts");
    setMode(s, "edicts", "act");
    s.autoDomains = { ...s.autoDomains, edicts: { ...s.autoDomains!.edicts!, target: 0 } };
    const creditsBefore = s.resources.credits;
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    expect(s.resources.credits).toBe(creditsBefore);
    expect(entries).toHaveLength(0);
  });

  it("SUGGEST enqueues an edict-tune proposal that applies on accept", () => {
    const s = freshState();
    appoint(s, "edicts");
    setMode(s, "edicts", "suggest");
    s.activeEdicts = [];
    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);
    const p = s.autoManagers!.queue[0] as AutoManagerProposal;
    expect(p.kind).toBe("edict-tune");
    const next = applyDomainProposal(s, p);
    expect((next.activeEdicts ?? []).length).toBe(1);
  });
});

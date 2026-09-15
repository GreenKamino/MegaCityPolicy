import { describe, expect, it } from "vitest";
import {
  OFFICER_ACTION_RULES,
  OFFICER_ACTION_META,
  OFFICER_ACTION_CATEGORY_ORDER,
  applyOfficerActionEffects,
  applyOfficerActionRipple,
  getOfficerActionIneligibility,
  performOfficerActionTransaction,
  type OfficerActionId,
} from "../officerActions";
import { RANK_ORDER } from "../officers";
import type { GameState, Officer } from "../types";

function makeOfficer(overrides: Partial<Officer> = {}): Officer {
  return {
    id: "test-1",
    name: "Test Officer",
    position: "Test Position",
    department: "civic",
    rank: "officer",
    competence: 70,
    loyalty: 50,
    ambition: 50,
    corruption: 25,
    popularity: 50,
    fearFactor: 30,
    traits: [],
    backstory: "",
    factionAffiliation: null,
    rivals: [],
    appointed: true,
    appointmentMethod: "merit",
    level: 1,
    xp: 0,
    age: 45,
    yearsServed: 3,
    careerLog: [],
    ...overrides,
  };
}

describe("OFFICER_ACTION_RULES (officer sandbox actions)", () => {
  const ids = Object.keys(OFFICER_ACTION_RULES) as OfficerActionId[];

  it("covers Crusader-Kings-style breadth across reward / discipline / covert / removal", () => {
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(ids).toEqual(
      expect.arrayContaining([
        "promote", "decorate", "bribe",
        "reprimand", "demote",
        "investigate", "blackmail",
        "exile",
      ]),
    );
  });

  it("every action has metadata in a known category", () => {
    for (const id of ids) {
      const meta = OFFICER_ACTION_META[id];
      expect(meta, `${id} meta`).toBeDefined();
      expect(meta.label.length, `${id} label`).toBeGreaterThan(0);
      expect(meta.description.length, `${id} description`).toBeGreaterThan(0);
      expect(OFFICER_ACTION_CATEGORY_ORDER, `${id} category`).toContain(meta.category);
      expect(["primary", "secondary", "warning", "danger"]).toContain(meta.variant);
    }
  });

  it("declares cost (>=0) and at least one effect for every action", () => {
    for (const id of ids) {
      const rule = OFFICER_ACTION_RULES[id];
      expect(rule.cost, `${id} cost`).toBeGreaterThanOrEqual(0);
      const e = rule.effects as Record<string, unknown>;
      const stats = ["loyalty", "ambition", "corruption", "popularity", "fearFactor", "competence"]
        .reduce((sum, k) => sum + Math.abs((e[k] as number | undefined) ?? 0), 0);
      const structural = (e.rankDelta ? 1 : 0) + (e.removeOfficer ? 1 : 0) + (e.ripple ? 1 : 0);
      expect(stats + structural, `${id} has zero magnitude`).toBeGreaterThan(0);
    }
  });

  it("promote and demote shift rank by exactly one slot", () => {
    const o = makeOfficer({ rank: "senior_officer" });
    const promoted = applyOfficerActionEffects(o, "promote");
    const demoted = applyOfficerActionEffects(o, "demote");
    expect(RANK_ORDER.indexOf(promoted.rank)).toBe(RANK_ORDER.indexOf("senior_officer") + 1);
    expect(RANK_ORDER.indexOf(demoted.rank)).toBe(RANK_ORDER.indexOf("senior_officer") - 1);
  });

  it("clamps stats to 0..100 after applying large negative effects", () => {
    const o = makeOfficer({ loyalty: 5, ambition: 5, popularity: 5 });
    const after = applyOfficerActionEffects(o, "demote");
    expect(after.loyalty).toBe(0);
    expect(after.ambition).toBe(0);
    expect(after.popularity).toBe(0);
  });

  it("eligibility blocks promote at top rank, demote at bottom rank", () => {
    expect(getOfficerActionIneligibility("promote", makeOfficer({ rank: "chief_director" }))).toBeTruthy();
    expect(getOfficerActionIneligibility("demote", makeOfficer({ rank: "cadet" }))).toBeTruthy();
    expect(getOfficerActionIneligibility("promote", makeOfficer({ rank: "officer", competence: 70 }))).toBeNull();
    expect(getOfficerActionIneligibility("demote", makeOfficer({ rank: "officer" }))).toBeNull();
  });

  it("eligibility blocks promote when competence < 50", () => {
    expect(getOfficerActionIneligibility("promote", makeOfficer({ competence: 49 }))).toBeTruthy();
    expect(getOfficerActionIneligibility("promote", makeOfficer({ competence: 50 }))).toBeNull();
  });

  it("eligibility requires corruption to investigate or blackmail (need cause/leverage)", () => {
    expect(getOfficerActionIneligibility("investigate", makeOfficer({ corruption: 0 }))).toBeTruthy();
    expect(getOfficerActionIneligibility("investigate", makeOfficer({ corruption: 15 }))).toBeNull();
    expect(getOfficerActionIneligibility("blackmail", makeOfficer({ corruption: 19 }))).toBeTruthy();
    expect(getOfficerActionIneligibility("blackmail", makeOfficer({ corruption: 20 }))).toBeNull();
  });

  it("blocks every action against an unappointed officer", () => {
    const vacant = makeOfficer({ appointed: false });
    for (const id of ids) {
      expect(getOfficerActionIneligibility(id, vacant), `${id}`).toBeTruthy();
    }
  });

  it("exile ripple touches other appointed officers but not the target or unappointed seats", () => {
    const target = makeOfficer({ id: "tgt", fearFactor: 30, ambition: 50 });
    const peer = makeOfficer({ id: "peer", fearFactor: 30, ambition: 50 });
    const vacant = makeOfficer({ id: "vac", appointed: false, fearFactor: 30, ambition: 50 });
    const after = applyOfficerActionRipple([target, peer, vacant], "tgt", "exile");
    const a = (id: string) => after.find((o) => o.id === id)!;
    expect(a("tgt").fearFactor).toBe(30); // target untouched
    expect(a("peer").fearFactor).toBe(34);
    expect(a("peer").ambition).toBe(48);
    expect(a("vac").fearFactor).toBe(30); // unappointed untouched
  });

  describe("performOfficerActionTransaction (reducer-level)", () => {
    function makeState(officers: Officer[], credits = 100000): GameState {
      return {
        officers,
        resources: { credits } as GameState["resources"],
        gameDate: { year: 2050, month: 1, day: 1 } as GameState["gameDate"],
        totalTicks: 7,
        messages: [],
      } as unknown as GameState;
    }

    it("rejects an unknown officer without mutating state", () => {
      const state = makeState([makeOfficer({ id: "real" })]);
      const txn = performOfficerActionTransaction(state, "ghost", "promote");
      expect(txn.ok).toBe(false);
      if (!txn.ok) expect(txn.reason).toMatch(/not found/i);
    });

    it("rejects an ineligible action and leaves credits untouched", () => {
      const state = makeState([makeOfficer({ rank: "chief_director" })], 90000);
      const txn = performOfficerActionTransaction(state, "test-1", "promote");
      expect(txn.ok).toBe(false);
      if (!txn.ok) expect(txn.reason).toMatch(/top rank/i);
      // No `next` slice exists on a failure result — credits cannot drift.
      expect(state.resources?.credits).toBe(90000);
    });

    it("rejects insufficient-credit actions and leaves credits untouched", () => {
      const state = makeState([makeOfficer({ rank: "officer", competence: 70 })], 100);
      const txn = performOfficerActionTransaction(state, "test-1", "promote");
      expect(txn.ok).toBe(false);
      if (!txn.ok) expect(txn.reason).toMatch(/insufficient/i);
      expect(state.resources?.credits).toBe(100);
    });

    it("ineligibility short-circuits BEFORE the cost check (no spurious credit-error)", () => {
      // Officer is at top rank AND we have no credits — error must be the
      // ineligibility, not the cost shortfall.
      const state = makeState([makeOfficer({ rank: "chief_director" })], 0);
      const txn = performOfficerActionTransaction(state, "test-1", "promote");
      expect(txn.ok).toBe(false);
      if (!txn.ok) {
        expect(txn.reason).toMatch(/top rank/i);
        expect(txn.reason).not.toMatch(/insufficient/i);
      }
    });

    it("decrements credits exactly once on success and pushes one inbox message", () => {
      const state = makeState([makeOfficer({ rank: "officer", competence: 80 })], 50000);
      const txn = performOfficerActionTransaction(state, "test-1", "promote");
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;
      expect(txn.next.resources?.credits).toBe(50000 - OFFICER_ACTION_RULES.promote.cost);
      expect(txn.next.messages?.length).toBe(1);
      expect(txn.next.messages?.[0].title).toMatch(/PROMOTE/);
      // Original state credits unchanged (helper is pure).
      expect(state.resources?.credits).toBe(50000);
    });

    it("free actions (reprimand) succeed at zero credits without changing them", () => {
      const state = makeState([makeOfficer({ rank: "officer", ambition: 50 })], 0);
      const txn = performOfficerActionTransaction(state, "test-1", "reprimand");
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;
      expect(txn.next.resources?.credits).toBe(0);
    });

    it("exile is a single transaction: cost paid, seat vacated, ripple applied, high-priority message", () => {
      const target = makeOfficer({ id: "tgt", rank: "officer", fearFactor: 30, ambition: 50 });
      const peer = makeOfficer({ id: "peer", fearFactor: 30, ambition: 50 });
      const state = makeState([target, peer], 20000);
      const txn = performOfficerActionTransaction(state, "tgt", "exile");
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;

      expect(txn.next.resources?.credits).toBe(20000 - OFFICER_ACTION_RULES.exile.cost);

      const after = txn.next.officers!;
      const tgtAfter = after.find((o) => o.id === "tgt")!;
      const peerAfter = after.find((o) => o.id === "peer")!;

      // Seat vacated, dismissal recorded.
      expect(tgtAfter.appointed).toBe(false);
      expect(tgtAfter.appointmentMethod).toBeNull();
      expect(tgtAfter.exitReason).toBe("dismissed");
      expect(tgtAfter.exitYear).toBe(2050);

      // Ripple to peer.
      expect(peerAfter.fearFactor).toBe(34);
      expect(peerAfter.ambition).toBe(48);

      // Inbox: high-priority report.
      expect(txn.next.messages?.[0].priority).toBe("high");
      expect(txn.next.messages?.[0].title).toMatch(/EXILE/);
    });

    it("exile records a careerLog entry on the dismissed officer (paper trail)", () => {
      const target = makeOfficer({ id: "tgt", careerLog: [] });
      const state = makeState([target], 20000);
      const txn = performOfficerActionTransaction(state, "tgt", "exile");
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;
      const tgtAfter = txn.next.officers!.find((o) => o.id === "tgt")!;
      expect(tgtAfter.careerLog?.length).toBe(1);
      expect(tgtAfter.careerLog?.[0].text).toMatch(/EXILE/);
      expect(tgtAfter.careerLog?.[0].year).toBe(2050);
    });

    it("blocks every action against an unappointed officer at the reducer layer", () => {
      const state = makeState([makeOfficer({ appointed: false })], 100000);
      for (const id of Object.keys(OFFICER_ACTION_RULES) as OfficerActionId[]) {
        const txn = performOfficerActionTransaction(state, "test-1", id);
        expect(txn.ok, `${id}`).toBe(false);
      }
      // Credits never touched across the full sweep.
      expect(state.resources?.credits).toBe(100000);
    });
  });

  it("every action has a UI label string in the screen registry (drift guard)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, "../../app/(game)/officers.tsx"),
      "utf8",
    );
    // OfficerActionMenu renders OFFICER_ACTION_META directly, so the
    // import is the contract — fail loudly if the menu component is gone.
    expect(src).toMatch(/OFFICER_ACTION_META/);
    expect(src).toMatch(/OfficerActionMenu/);
    expect(src).toMatch(/performOfficerAction/);
  });
});

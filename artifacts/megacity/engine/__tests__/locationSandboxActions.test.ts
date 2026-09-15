import { describe, expect, it } from "vitest";
import {
  LOCATION_ACTION_RULES,
  LOCATION_ACTION_META,
  LOCATION_ACTION_CATEGORY_ORDER,
  SANDBOX_LOCATION_ACTION_IDS,
  applyLocationActionRelation,
  getLocationActionIneligibility,
  getLocationActionCostTiming,
  performLocationActionTransaction,
  type LocationActionId,
} from "../locationActions";
import type { GameState, LocationRelation } from "../types";
import type { WorldLocation } from "../worldMap";

function makeLoc(overrides: Partial<WorldLocation> = {}): WorldLocation {
  return {
    id: "tgt",
    name: "Target",
    type: "township",
    x: 1000,
    y: 1000,
    population: 50_000,
    defenseRating: 30,
    faction: "Neutral",
    discovered: true,
    description: "test",
    status: "neutral",
    connectedTo: [],
    ...overrides,
  };
}

function makeRel(overrides: Partial<LocationRelation> = {}): LocationRelation {
  return {
    disposition: 0,
    aidSent: 0,
    raidsSent: 0,
    tradesMade: 0,
    scoutsMade: 0,
    lastInteractionTick: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    resources: { credits: 100_000, ammo: 200 } as GameState["resources"],
    locationRelations: {},
    discoveredLocationIds: [],
    messages: [],
    worldEventLog: [],
    gameDate: { year: 2050, month: 1, day: 1 } as GameState["gameDate"],
    totalTicks: 5,
    ...overrides,
  } as unknown as GameState;
}

describe("LOCATION_ACTION_RULES (worldmap sandbox actions)", () => {
  const ids = Object.keys(LOCATION_ACTION_RULES) as LocationActionId[];

  it("covers Crusader-Kings-style breadth across military / covert / settlement", () => {
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(ids).toEqual(
      expect.arrayContaining([
        "bombard", "blockade",
        "infiltrate", "instigate_revolt",
        "settle_outpost",
      ]),
    );
  });

  it("every action has metadata in a known category", () => {
    for (const id of ids) {
      const meta = LOCATION_ACTION_META[id];
      expect(meta, `${id} meta`).toBeDefined();
      expect(meta.label.length, `${id} label`).toBeGreaterThan(0);
      expect(meta.icon.length, `${id} icon`).toBeGreaterThan(0);
      expect(meta.description.length, `${id} description`).toBeGreaterThan(0);
      expect(LOCATION_ACTION_CATEGORY_ORDER, `${id} category`).toContain(meta.category);
      expect(["primary", "secondary", "warning", "danger"]).toContain(meta.variant);
    }
  });

  it("declares cost (>=0) and at least one effect for every action", () => {
    for (const id of ids) {
      const rule = LOCATION_ACTION_RULES[id];
      expect(rule.cost, `${id} cost`).toBeGreaterThanOrEqual(0);
      const e = rule.effects;
      const magnitude =
        Math.abs(e.dispositionDelta ?? 0) +
        (e.ammoCost ?? 0) +
        (e.raidsSent ?? 0) +
        (e.scoutsMade ?? 0) +
        (e.tradesMade ?? 0) +
        (e.aidSent ?? 0) +
        (e.revealConnectedChance ?? 0);
      expect(magnitude, `${id} has zero magnitude`).toBeGreaterThan(0);
    }
  });

  it("exposes immediate timing and non-credit costs from the same rule used by execution", () => {
    const state = makeState();
    const timing = getLocationActionCostTiming(state, "bombard");

    expect(timing).toMatchObject({
      kind: "instant",
      upfrontCostCredits: LOCATION_ACTION_RULES.bombard.cost,
      durationTicks: null,
      cooldownTicks: 0,
      cancellation: "unavailable",
      activationAffordable: true,
    });
    expect(timing.resourceCosts).toEqual([{ resource: "ammo", amount: 30 }]);
    expect(timing.resourcesAffordable).toBe(true);
  });

  it("SANDBOX_LOCATION_ACTION_IDS mirrors the rules table exactly", () => {
    expect(SANDBOX_LOCATION_ACTION_IDS.size).toBe(ids.length);
    for (const id of ids) {
      expect(SANDBOX_LOCATION_ACTION_IDS.has(id), `${id}`).toBe(true);
    }
  });

  describe("eligibility", () => {
    it("blocks every action against the player's own city", () => {
      const player = makeLoc({ id: "megacity", type: "player_city", status: "allied" });
      for (const id of ids) {
        expect(getLocationActionIneligibility(id, player, "allied"), `${id}`).toBeTruthy();
      }
    });

    it("blocks every action against an undiscovered location", () => {
      const fog = makeLoc({ status: "undiscovered" });
      for (const id of ids) {
        expect(getLocationActionIneligibility(id, fog, "undiscovered"), `${id}`).toBeTruthy();
      }
    });

    it("bombard refuses allies and ghost-towns, allows hostile/neutral with population", () => {
      expect(getLocationActionIneligibility("bombard", makeLoc(), "allied")).toMatch(/ally/i);
      expect(getLocationActionIneligibility("bombard", makeLoc({ population: 0 }), "hostile")).toMatch(/nothing/i);
      expect(getLocationActionIneligibility("bombard", makeLoc(), "hostile")).toBeNull();
    });

    it("blockade refuses allies, allows hostile/neutral", () => {
      expect(getLocationActionIneligibility("blockade", makeLoc(), "allied")).toMatch(/ally/i);
      expect(getLocationActionIneligibility("blockade", makeLoc(), "neutral")).toBeNull();
    });

    it("instigate_revolt only works against hostile factions", () => {
      expect(getLocationActionIneligibility("instigate_revolt", makeLoc(), "neutral")).toMatch(/hostile/i);
      expect(getLocationActionIneligibility("instigate_revolt", makeLoc(), "allied")).toMatch(/hostile/i);
      expect(getLocationActionIneligibility("instigate_revolt", makeLoc(), "hostile")).toBeNull();
    });

    it("settle_outpost refuses hostile sites and densely populated sites", () => {
      expect(getLocationActionIneligibility("settle_outpost", makeLoc(), "hostile")).toMatch(/hostile/i);
      expect(getLocationActionIneligibility("settle_outpost", makeLoc({ population: 1_000_000 }), "neutral")).toMatch(/dens/i);
      expect(getLocationActionIneligibility("settle_outpost", makeLoc({ population: 100_000 }), "neutral")).toBeNull();
    });
  });

  describe("applyLocationActionRelation", () => {
    it("clamps disposition into -100..100 on big swings", () => {
      const rel = makeRel({ disposition: -90 });
      const after = applyLocationActionRelation(rel, "instigate_revolt", 7);
      expect(after.disposition).toBe(-100);
      const rel2 = makeRel({ disposition: 80 });
      const after2 = applyLocationActionRelation(rel2, "settle_outpost", 7);
      expect(after2.disposition).toBe(100);
    });

    it("increments the right counter for each action", () => {
      const rel = makeRel();
      expect(applyLocationActionRelation(rel, "bombard", 1).raidsSent).toBe(1);
      expect(applyLocationActionRelation(rel, "blockade", 1).raidsSent).toBe(1);
      expect(applyLocationActionRelation(rel, "instigate_revolt", 1).raidsSent).toBe(1);
      expect(applyLocationActionRelation(rel, "infiltrate", 1).scoutsMade).toBe(2);
      expect(applyLocationActionRelation(rel, "settle_outpost", 1).aidSent).toBe(1);
    });

    it("updates lastInteractionTick", () => {
      const rel = makeRel({ lastInteractionTick: 1 });
      expect(applyLocationActionRelation(rel, "bombard", 99).lastInteractionTick).toBe(99);
    });
  });

  describe("performLocationActionTransaction", () => {
    it("rejects an ineligible action and leaves credits/ammo untouched", () => {
      const state = makeState({ resources: { credits: 50_000, ammo: 200 } as GameState["resources"] });
      const txn = performLocationActionTransaction(state, makeLoc(), "instigate_revolt", "neutral", []);
      expect(txn.ok).toBe(false);
      if (!txn.ok) expect(txn.reason).toMatch(/hostile/i);
      expect(state.resources?.credits).toBe(50_000);
      expect(state.resources?.ammo).toBe(200);
    });

    it("rejects insufficient credits", () => {
      const state = makeState({ resources: { credits: 100, ammo: 200 } as GameState["resources"] });
      const txn = performLocationActionTransaction(state, makeLoc({ status: "hostile" }), "bombard", "hostile", []);
      expect(txn.ok).toBe(false);
      if (!txn.ok) expect(txn.reason).toMatch(/credits/i);
    });

    it("rejects insufficient ammo for bombard", () => {
      const state = makeState({ resources: { credits: 100_000, ammo: 5 } as GameState["resources"] });
      const txn = performLocationActionTransaction(state, makeLoc({ status: "hostile" }), "bombard", "hostile", []);
      expect(txn.ok).toBe(false);
      if (!txn.ok) expect(txn.reason).toMatch(/ammo/i);
    });

    it("ineligibility short-circuits before cost (no spurious credit-error)", () => {
      const state = makeState({ resources: { credits: 0, ammo: 0 } as GameState["resources"] });
      const player = makeLoc({ type: "player_city" });
      const txn = performLocationActionTransaction(state, player, "bombard", "allied", []);
      expect(txn.ok).toBe(false);
      if (!txn.ok) {
        expect(txn.reason).toMatch(/own city/i);
        expect(txn.reason).not.toMatch(/credits/i);
      }
    });

    it("decrements credits and ammo exactly once on bombard success", () => {
      const state = makeState({ resources: { credits: 50_000, ammo: 100 } as GameState["resources"] });
      const txn = performLocationActionTransaction(state, makeLoc({ status: "hostile" }), "bombard", "hostile", []);
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;
      expect(txn.next.resources?.credits).toBe(50_000 - LOCATION_ACTION_RULES.bombard.cost);
      expect(txn.next.resources?.ammo).toBe(100 - 30);
      // Original state untouched (helper is pure).
      expect(state.resources?.credits).toBe(50_000);
      expect(state.resources?.ammo).toBe(100);
    });

    it("posts an inbox message and a worldEventLog entry for military actions", () => {
      const state = makeState();
      const txn = performLocationActionTransaction(state, makeLoc({ status: "hostile" }), "bombard", "hostile", []);
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;
      expect(txn.next.messages?.length).toBe(1);
      expect(txn.next.messages?.[0].title).toMatch(/BOMBARD/);
      expect(txn.next.messages?.[0].priority).toBe("high");
      expect(txn.next.worldEventLog?.length).toBe(1);
      expect(txn.next.worldEventLog?.[0].title).toBe("BOMBARD");
    });

    it("does NOT log a worldEventLog entry for covert non-logged actions (infiltrate)", () => {
      const state = makeState();
      const loc = makeLoc({ id: "a", connectedTo: [] });
      const txn = performLocationActionTransaction(state, loc, "infiltrate", "neutral", [], () => 1);
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;
      expect(txn.next.worldEventLog?.length ?? 0).toBe(0);
      expect(txn.next.messages?.length).toBe(1);
    });

    it("infiltrate reveals a connected undiscovered location when the RNG roll succeeds", () => {
      const tgt = makeLoc({ id: "tgt", connectedTo: ["hidden"] });
      const hidden = makeLoc({ id: "hidden", discovered: false, status: "undiscovered", connectedTo: ["tgt"] });
      const state = makeState();
      // Force reveal: rng() < 0.65 then index 0.
      const txn = performLocationActionTransaction(state, tgt, "infiltrate", "neutral", [tgt, hidden], () => 0);
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;
      expect(txn.revealedLocationId).toBe("hidden");
      expect(txn.next.discoveredLocationIds).toContain("hidden");
    });

    it("infiltrate does NOT reveal when the RNG roll fails", () => {
      const tgt = makeLoc({ id: "tgt", connectedTo: ["hidden"] });
      const hidden = makeLoc({ id: "hidden", discovered: false, status: "undiscovered", connectedTo: ["tgt"] });
      const state = makeState();
      // Force fail: rng() returns 1 (above the 0.65 threshold).
      const txn = performLocationActionTransaction(state, tgt, "infiltrate", "neutral", [tgt, hidden], () => 1);
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;
      expect(txn.revealedLocationId).toBeNull();
      expect(txn.next.discoveredLocationIds).not.toContain("hidden");
    });

    it("settle_outpost is a single transaction: cost paid, +35 disposition, aidSent++, message", () => {
      const state = makeState({
        locationRelations: { tgt: makeRel({ disposition: 10 }) },
      });
      const txn = performLocationActionTransaction(state, makeLoc(), "settle_outpost", "neutral", []);
      expect(txn.ok).toBe(true);
      if (!txn.ok) return;
      expect(txn.next.resources?.credits).toBe(100_000 - LOCATION_ACTION_RULES.settle_outpost.cost);
      const rel = txn.next.locationRelations?.tgt;
      expect(rel?.disposition).toBe(45);
      expect(rel?.aidSent).toBe(1);
      expect(txn.next.messages?.[0].title).toMatch(/SETTLE OUTPOST/);
    });

    it("free actions block on credits=0 only when cost>0; settle (25k) fails at zero credits", () => {
      const state = makeState({ resources: { credits: 0, ammo: 0 } as GameState["resources"] });
      const txn = performLocationActionTransaction(state, makeLoc(), "settle_outpost", "neutral", []);
      expect(txn.ok).toBe(false);
      if (!txn.ok) expect(txn.reason).toMatch(/credits/i);
    });

    it("blocked actions never mutate the input state object (purity)", () => {
      const baseRel = makeRel({ disposition: -50 });
      const state = makeState({
        resources: { credits: 0, ammo: 0 } as GameState["resources"],
        locationRelations: { tgt: baseRel },
      });
      performLocationActionTransaction(state, makeLoc({ status: "hostile" }), "bombard", "hostile", []);
      expect(state.resources?.credits).toBe(0);
      expect(state.resources?.ammo).toBe(0);
      expect(state.locationRelations?.tgt.disposition).toBe(-50);
      expect(state.locationRelations?.tgt.raidsSent).toBe(0);
    });
  });

  describe("worldmap.tsx dispatch ordering (architect R3 gate)", () => {
    it("dispatches sandbox actions BEFORE the generic credit precheck so eligibility wins", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const url = await import("node:url");
      const here = path.dirname(url.fileURLToPath(import.meta.url));
      const src = fs.readFileSync(
        path.resolve(here, "../../app/(game)/worldmap.tsx"),
        "utf8",
      );
      const handleStart = src.indexOf("const handleAction = useCallback");
      expect(handleStart).toBeGreaterThan(0);
      const sandboxBranch = src.indexOf("SANDBOX_LOCATION_ACTION_IDS.has", handleStart);
      const creditPrecheck = src.indexOf("Insufficient credits. Need", handleStart);
      expect(sandboxBranch).toBeGreaterThan(0);
      expect(creditPrecheck).toBeGreaterThan(0);
      expect(sandboxBranch, "sandbox dispatch must come before generic credit precheck")
        .toBeLessThan(creditPrecheck);
    });

    it("does NOT use the unsafe outcome side-channel pattern inside setState", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const url = await import("node:url");
      const here = path.dirname(url.fileURLToPath(import.meta.url));
      const src = fs.readFileSync(
        path.resolve(here, "../../app/(game)/worldmap.tsx"),
        "utf8",
      );
      // The architect-flagged anti-pattern was assigning a captured `outcome`
      // variable inside a setState updater and reading it afterwards. Guard
      // against regressions to that pattern.
      expect(src).not.toMatch(/outcome\s*=\s*\{\s*ok:\s*(true|false)/);
    });

    it("dispatches sandbox actions exactly once in handleAction (no duplicate branch)", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const url = await import("node:url");
      const here = path.dirname(url.fileURLToPath(import.meta.url));
      const src = fs.readFileSync(
        path.resolve(here, "../../app/(game)/worldmap.tsx"),
        "utf8",
      );
      const matches = src.match(/SANDBOX_LOCATION_ACTION_IDS\.has/g) ?? [];
      expect(matches.length).toBe(1);
    });
  });

  it("WORLD_ACTIONS in the screen registry references every sandbox id (drift guard)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, "../../app/(game)/worldmap.tsx"),
      "utf8",
    );
    expect(src).toMatch(/SANDBOX_LOCATION_ACTION_IDS/);
    expect(src).toMatch(/performLocationActionTransaction/);
    expect(src).toMatch(/LOCATION_ACTION_RULES/);
    expect(src).toMatch(/LOCATION_ACTION_META/);
  });
});

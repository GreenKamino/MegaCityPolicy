import { describe, expect, it } from "vitest";
import {
  FACTORY_RULES,
  FACTORY_TYPE_IDS,
  MUNITION_RULES,
  PROCUREMENT_TEMPLATES,
  PROCUREMENT_TEMPLATE_IDS,
  VULCAN_PERSONA,
  createDefaultVulcanState,
  getFactoryBuildIneligibility,
  getProcurementIneligibility,
  performBuildFactoryTransaction,
  performCancelProcurementTransaction,
  performSignProcurementTransaction,
  pickVargaszLine,
  tickVulcanProduction,
  type FactoryTypeId,
  type MunitionTypeId,
  type ProcurementTemplateId,
  type VulcanState,
} from "../munitionsCompany";
import type { GameState } from "../types";

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    resources: { credits: 500_000, steel: 2_000, ammo: 0, fuel: 1_000 } as GameState["resources"],
    stockpiles: {},
    messages: [],
    worldEventLog: [],
    totalTicks: 10,
    vulcan: createDefaultVulcanState(),
    ...overrides,
  } as unknown as GameState;
}

let uidCounter = 0;
function deterministicUid(): string {
  uidCounter += 1;
  return `uid-${uidCounter}`;
}

describe("Vulcan Arms Consortium — catalogs", () => {
  it("MUNITION_RULES covers every category requested (small_arms / artillery / rocket / missile)", () => {
    const cats = new Set(Object.values(MUNITION_RULES).map((m) => m.category));
    expect(cats.has("small_arms")).toBe(true);
    expect(cats.has("artillery")).toBe(true);
    expect(cats.has("rocket")).toBe(true);
    expect(cats.has("missile")).toBe(true);
  });

  it("FACTORY_RULES has a build cost, build ticks, and >= 1 output line per factory", () => {
    for (const id of FACTORY_TYPE_IDS) {
      const rule = FACTORY_RULES[id];
      expect(rule.buildCost, `${id} buildCost`).toBeGreaterThan(0);
      expect(rule.buildSteel, `${id} buildSteel`).toBeGreaterThan(0);
      expect(rule.buildTicks, `${id} buildTicks`).toBeGreaterThan(0);
      expect(rule.outputs.length, `${id} outputs`).toBeGreaterThan(0);
      for (const o of rule.outputs) {
        expect(MUNITION_RULES[o.munitionId], `${id} -> ${o.munitionId}`).toBeDefined();
        expect(o.perTick).toBeGreaterThan(0);
      }
    }
  });

  it("PROCUREMENT_TEMPLATES covers every munition type and references a valid id", () => {
    const referenced = new Set<MunitionTypeId>();
    for (const id of PROCUREMENT_TEMPLATE_IDS) {
      const tpl = PROCUREMENT_TEMPLATES[id];
      expect(MUNITION_RULES[tpl.munitionId], `${id} -> ${tpl.munitionId}`).toBeDefined();
      expect(tpl.totalUnits).toBeGreaterThan(0);
      expect(tpl.upfrontCost).toBeGreaterThan(0);
      expect(tpl.unitsPerDelivery).toBeGreaterThan(0);
      expect(tpl.ticksBetweenDeliveries).toBeGreaterThan(0);
      expect(tpl.cancelPenalty).toBeGreaterThanOrEqual(0);
      referenced.add(tpl.munitionId);
    }
    // Every munition type has at least one procurement contract template.
    for (const m of Object.keys(MUNITION_RULES) as MunitionTypeId[]) {
      expect(referenced.has(m), `no contract template for ${m}`).toBe(true);
    }
  });

  it("every factory output references a defined munition rule (drift guard)", () => {
    const munitionIds = new Set(Object.keys(MUNITION_RULES));
    for (const f of Object.values(FACTORY_RULES)) {
      for (const o of f.outputs) {
        expect(munitionIds.has(o.munitionId), `${f.id} -> ${o.munitionId}`).toBe(true);
      }
    }
  });
});

describe("Vulcan persona — communicates through Marshal Vargasz", () => {
  it("exposes a named speaker, title, motto, greeting, and at least 7 voice lines", () => {
    expect(VULCAN_PERSONA.speakerName.length).toBeGreaterThan(0);
    expect(VULCAN_PERSONA.speakerTitle.length).toBeGreaterThan(0);
    expect(VULCAN_PERSONA.bio.length).toBeGreaterThan(0);
    expect(VULCAN_PERSONA.motto.length).toBeGreaterThan(0);
    expect(VULCAN_PERSONA.greeting.length).toBeGreaterThan(0);
    expect(Object.keys(VULCAN_PERSONA.lines).length).toBeGreaterThanOrEqual(7);
    for (const [k, pool] of Object.entries(VULCAN_PERSONA.lines)) {
      expect(Array.isArray(pool), `line ${k} is array`).toBe(true);
      expect(pool.length, `line ${k} pool size`).toBeGreaterThanOrEqual(2);
      for (const line of pool) {
        expect(line.length, `line ${k} entry`).toBeGreaterThan(0);
      }
    }
  });

  it("voices the contract-signed message through the persona", () => {
    const state = makeState();
    const txn = performSignProcurementTransaction(state, "pc-bulk-ammo-1k", deterministicUid);
    expect(txn.ok).toBe(true);
    if (!txn.ok) return;
    const msg = txn.next.messages?.[0];
    expect(msg?.body).toContain("Marshal Vargasz");
    expect(VULCAN_PERSONA.lines.onContractSigned.some((l) => msg?.body.includes(l))).toBe(true);
  });

  it("voices the cancel message through the persona", () => {
    const state = makeState();
    const sign = performSignProcurementTransaction(state, "pc-bulk-ammo-1k", deterministicUid);
    expect(sign.ok).toBe(true);
    if (!sign.ok) return;
    const next = { ...state, ...sign.next } as GameState;
    const uid = (next.vulcan as VulcanState).contracts[0].uid;
    const cancel = performCancelProcurementTransaction(next, uid);
    expect(cancel.ok).toBe(true);
    if (!cancel.ok) return;
    const msg = cancel.next.messages?.[cancel.next.messages.length - 1];
    expect(msg?.body).toContain("Marshal Vargasz");
    expect(VULCAN_PERSONA.lines.onContractCancelled.some((l) => msg?.body.includes(l))).toBe(true);
  });

  it("voices the factory-ordered message through the persona", () => {
    const state = makeState();
    const txn = performBuildFactoryTransaction(state, "ammo_plant", deterministicUid);
    expect(txn.ok).toBe(true);
    if (!txn.ok) return;
    const msg = txn.next.messages?.[0];
    expect(msg?.body).toContain("Marshal Vargasz");
    expect(VULCAN_PERSONA.lines.onFactoryOrdered.some((l) => msg?.body.includes(l))).toBe(true);
  });

  it("rotates Vargasz openers deterministically by seed (same seed → same line, different seeds → coverage)", () => {
    const pool = VULCAN_PERSONA.lines.onContractSigned;
    expect(pickVargaszLine(pool, "uid-A")).toBe(pickVargaszLine(pool, "uid-A"));
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickVargaszLine(pool, `uid-${i}`));
    expect(seen.size).toBe(pool.length);
  });

  it("selects the same Vargasz line for a given uid across the full sign transaction (end-to-end determinism)", () => {
    const a = performSignProcurementTransaction(makeState(), "pc-bulk-ammo-1k", () => "fixed-uid-XYZ");
    const b = performSignProcurementTransaction(makeState(), "pc-bulk-ammo-1k", () => "fixed-uid-XYZ");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.next.messages?.[0]?.body).toBe(b.next.messages?.[0]?.body);
    const matches = VULCAN_PERSONA.lines.onContractSigned.filter((l) => a.next.messages?.[0]?.body.includes(l));
    expect(matches.length).toBe(1);
  });

  it("registers Vargasz in the leader dossier system (slug lookup)", async () => {
    const { LEADER_DOSSIERS } = await import("../leaderDossiers");
    const d = LEADER_DOSSIERS["ilse_vargasz"];
    expect(d).toBeDefined();
    expect(d?.name).toBe(VULCAN_PERSONA.speakerName);
    expect(d?.title).toBe(VULCAN_PERSONA.speakerTitle);
    expect(d?.affiliation).toBe("vulcan-arms-consortium");
    expect(d?.threatLevel).toMatch(/MINIMAL|LOW|MODERATE|HIGH|CRITICAL|UNKNOWN/);
    expect(d?.interceptedQuotes.length).toBeGreaterThanOrEqual(3);
    expect(d?.interceptedQuotes.some((q) => q.includes(VULCAN_PERSONA.motto))).toBe(true);
  });
});

describe("Vulcan eligibility", () => {
  it("blocks signing when credits are insufficient", () => {
    const state = makeState({ resources: { credits: 100, steel: 0 } as GameState["resources"] });
    expect(getProcurementIneligibility("pc-bulk-ammo-1k", state)).toMatch(/credits/i);
  });

  it("blocks signing the same template twice", () => {
    const state = makeState();
    const sign1 = performSignProcurementTransaction(state, "pc-bulk-ammo-1k", deterministicUid);
    expect(sign1.ok).toBe(true);
    if (!sign1.ok) return;
    const next = { ...state, ...sign1.next } as GameState;
    expect(getProcurementIneligibility("pc-bulk-ammo-1k", next)).toMatch(/already in progress/i);
  });

  it("blocks more than 6 simultaneous contracts", () => {
    const state = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        contracts: Array.from({ length: 6 }, (_, i) => ({
          uid: `c${i}`,
          templateId: "pc-shotgun-bulk-500" as ProcurementTemplateId,
          unitsRemaining: 500,
          ticksUntilNextDelivery: 4,
          startedTick: 0,
        })),
      },
    });
    expect(getProcurementIneligibility("pc-bulk-ammo-1k", state)).toMatch(/more than 6/i);
  });

  it("blocks factory build when credits or steel are insufficient", () => {
    const noCredits = makeState({ resources: { credits: 0, steel: 5_000 } as GameState["resources"] });
    expect(getFactoryBuildIneligibility("ammo_plant", noCredits)).toMatch(/credits/i);
    const noSteel = makeState({ resources: { credits: 1_000_000, steel: 0 } as GameState["resources"] });
    expect(getFactoryBuildIneligibility("ammo_plant", noSteel)).toMatch(/steel/i);
  });

  it("blocks more than 8 factories", () => {
    const state = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        factories: Array.from({ length: 8 }, (_, i) => ({
          uid: `f${i}`,
          type: "ammo_plant" as FactoryTypeId,
          status: "active" as const,
          buildTicksRemaining: 0,
          startedTick: 0,
        })),
      },
    });
    expect(getFactoryBuildIneligibility("ammo_plant", state)).toMatch(/more than 8/i);
  });
});

describe("Vulcan transaction helpers — purity + correctness", () => {
  it("performSignProcurementTransaction deducts credits and adds a contract on success", () => {
    const state = makeState({ resources: { credits: 50_000, steel: 0 } as GameState["resources"] });
    const txn = performSignProcurementTransaction(state, "pc-bulk-ammo-1k", deterministicUid);
    expect(txn.ok).toBe(true);
    if (!txn.ok) return;
    expect(txn.next.resources?.credits).toBe(50_000 - PROCUREMENT_TEMPLATES["pc-bulk-ammo-1k"].upfrontCost);
    const v = txn.next.vulcan as VulcanState;
    expect(v.contracts.length).toBe(1);
    expect(v.contracts[0].unitsRemaining).toBe(1000);
    // Input untouched.
    expect(state.resources.credits).toBe(50_000);
    expect((state.vulcan as VulcanState).contracts.length).toBe(0);
  });

  it("performSignProcurementTransaction is pure on failure", () => {
    const state = makeState({ resources: { credits: 0, steel: 0 } as GameState["resources"] });
    const txn = performSignProcurementTransaction(state, "pc-bulk-ammo-1k", deterministicUid);
    expect(txn.ok).toBe(false);
    expect(state.resources.credits).toBe(0);
    expect((state.vulcan as VulcanState).contracts.length).toBe(0);
  });

  it("performCancelProcurementTransaction charges penalty, removes contract, drops reputation", () => {
    const state = makeState();
    const sign = performSignProcurementTransaction(state, "pc-bulk-ammo-1k", deterministicUid);
    expect(sign.ok).toBe(true);
    if (!sign.ok) return;
    const next = { ...state, ...sign.next } as GameState;
    const uid = (next.vulcan as VulcanState).contracts[0].uid;
    const reputationBefore = (next.vulcan as VulcanState).reputation;

    const cancel = performCancelProcurementTransaction(next, uid);
    expect(cancel.ok).toBe(true);
    if (!cancel.ok) return;
    const v = cancel.next.vulcan as VulcanState;
    expect(v.contracts.length).toBe(0);
    expect(v.reputation).toBe(Math.max(0, reputationBefore - 5));
    const expectedCredits = (next.resources.credits as number) - PROCUREMENT_TEMPLATES["pc-bulk-ammo-1k"].cancelPenalty;
    expect(cancel.next.resources?.credits).toBe(expectedCredits);
  });

  it("performBuildFactoryTransaction deducts credits + steel and queues the factory", () => {
    const state = makeState();
    const txn = performBuildFactoryTransaction(state, "missile_works", deterministicUid);
    expect(txn.ok).toBe(true);
    if (!txn.ok) return;
    const v = txn.next.vulcan as VulcanState;
    expect(v.factories.length).toBe(1);
    expect(v.factories[0].status).toBe("building");
    expect(v.factories[0].buildTicksRemaining).toBe(FACTORY_RULES.missile_works.buildTicks);
    expect(txn.next.resources?.credits).toBe(500_000 - FACTORY_RULES.missile_works.buildCost);
    expect(txn.next.resources?.steel).toBe(2_000 - FACTORY_RULES.missile_works.buildSteel);
  });
});

describe("Vulcan tick — production + delivery", () => {
  it("decrements buildTicksRemaining each tick and flips to active when it reaches zero", () => {
    const state = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        factories: [{
          uid: "f1",
          type: "ammo_plant",
          status: "building",
          buildTicksRemaining: 2,
          startedTick: 0,
        }],
      },
    });
    const t1 = tickVulcanProduction(state, 11);
    const v1 = t1.next.vulcan as VulcanState;
    expect(v1.factories[0].buildTicksRemaining).toBe(1);
    expect(v1.factories[0].status).toBe("building");
    expect(t1.newlyActiveFactories).toEqual([]);

    const state2 = { ...state, ...t1.next } as GameState;
    const t2 = tickVulcanProduction(state2, 12);
    const v2 = t2.next.vulcan as VulcanState;
    expect(v2.factories[0].status).toBe("active");
    expect(t2.newlyActiveFactories).toEqual(["f1"]);
    // Persona-voiced "factory online" message added.
    const onlineMsg = (t2.next.messages ?? []).find((m) => m.title.includes("FACTORY ONLINE"));
    expect(onlineMsg?.body).toContain("Marshal Vargasz");
  });

  it("active factories produce munitions into the company reserve every tick", () => {
    const state = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        factories: [{ uid: "f1", type: "ammo_plant", status: "active", buildTicksRemaining: 0, startedTick: 0 }],
      },
    });
    const t = tickVulcanProduction(state, 11);
    const v = t.next.vulcan as VulcanState;
    expect(v.reserve.standard_rounds).toBe(60);
    expect(v.reserve.ap_rounds).toBe(12);
    expect(v.reserve.shotgun_shells).toBe(25);
  });

  it("active contracts deliver from the reserve into the player's stockpiles", () => {
    const state = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        factories: [{ uid: "f1", type: "ammo_plant", status: "active", buildTicksRemaining: 0, startedTick: 0 }],
        contracts: [{
          uid: "c1",
          templateId: "pc-bulk-ammo-1k",
          unitsRemaining: 1000,
          ticksUntilNextDelivery: 1,
          startedTick: 0,
        }],
        reserve: { standard_rounds: 200 },
      },
    });
    const t = tickVulcanProduction(state, 11);
    expect(t.deliveries).toHaveLength(1);
    expect(t.deliveries[0]).toMatchObject({ contractUid: "c1", munitionId: "standard_rounds", units: 100 });
    expect((t.next.stockpiles as Record<string, number>).standard_rounds).toBe(100);
    const v = t.next.vulcan as VulcanState;
    // Reserve = 200 (start) + 60 (production this tick) - 100 (delivered) = 160
    expect(v.reserve.standard_rounds).toBe(160);
    // Contract advanced.
    expect(v.contracts[0].unitsRemaining).toBe(900);
    expect(v.contracts[0].ticksUntilNextDelivery).toBe(PROCUREMENT_TEMPLATES["pc-bulk-ammo-1k"].ticksBetweenDeliveries);
  });

  it("when reserve is dry, the delivery slips one tick and nothing ships", () => {
    const state = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        contracts: [{
          uid: "c1",
          templateId: "pc-cruise-strategic",
          unitsRemaining: 8,
          ticksUntilNextDelivery: 1,
          startedTick: 0,
        }],
        reserve: {},
      },
    });
    const t = tickVulcanProduction(state, 11);
    expect(t.deliveries).toHaveLength(0);
    const v = t.next.vulcan as VulcanState;
    expect(v.contracts[0].unitsRemaining).toBe(8);
    expect(v.contracts[0].ticksUntilNextDelivery).toBe(1);
  });

  it("contract completes when unitsRemaining hits zero — posts persona-voiced fulfilled message + worldEventLog", () => {
    const state = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        contracts: [{
          uid: "c1",
          templateId: "pc-bulk-ammo-1k",
          unitsRemaining: 100,
          ticksUntilNextDelivery: 1,
          startedTick: 0,
        }],
        reserve: { standard_rounds: 200 },
      },
    });
    const t = tickVulcanProduction(state, 99);
    expect(t.completedContracts).toEqual(["c1"]);
    const v = t.next.vulcan as VulcanState;
    expect(v.contracts.length).toBe(0);
    expect(v.reputation).toBe(28); // 25 + 3
    const fulfilled = (t.next.messages ?? []).find((m) => m.title.includes("CONTRACT FULFILLED"));
    expect(fulfilled?.body).toContain("Marshal Vargasz");
    const log = t.next.worldEventLog ?? [];
    expect(log[log.length - 1]).toMatchObject({ tick: 99, title: "VULCAN — CONTRACT CLOSED" });
  });

  it("worldEventLog is capped at 200 entries on tick", () => {
    const huge = Array.from({ length: 250 }, (_, i) => ({
      tick: i, event: "x", type: "x", timestamp: 0,
    }));
    const state = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        contracts: [{
          uid: "c1",
          templateId: "pc-bulk-ammo-1k",
          unitsRemaining: 100,
          ticksUntilNextDelivery: 1,
          startedTick: 0,
        }],
        reserve: { standard_rounds: 200 },
      },
      worldEventLog: huge,
    });
    const t = tickVulcanProduction(state, 99);
    expect((t.next.worldEventLog ?? []).length).toBe(200);
  });

  it("tickVulcanProduction is deterministic — same input yields identical output", () => {
    const build = () => makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        factories: [{ uid: "f1", type: "ammo_plant", status: "active", buildTicksRemaining: 0, startedTick: 0 }],
        contracts: [{
          uid: "c1",
          templateId: "pc-bulk-ammo-1k",
          unitsRemaining: 100,
          ticksUntilNextDelivery: 1,
          startedTick: 0,
        }],
        reserve: { standard_rounds: 200 },
      },
    });
    const a = tickVulcanProduction(build(), 99);
    const b = tickVulcanProduction(build(), 99);
    expect(JSON.stringify(a.next)).toBe(JSON.stringify(b.next));
    expect(a.deliveries).toEqual(b.deliveries);
    expect(a.completedContracts).toEqual(b.completedContracts);
    expect(a.newlyActiveFactories).toEqual(b.newlyActiveFactories);
  });

  it("transaction helpers and tick return fresh nested vulcan substructures (no aliasing)", () => {
    const state = makeState();
    const sign = performSignProcurementTransaction(state, "pc-bulk-ammo-1k", deterministicUid);
    expect(sign.ok).toBe(true);
    if (!sign.ok) return;
    const v0 = state.vulcan as VulcanState;
    const v1 = sign.next.vulcan as VulcanState;
    expect(v1.factories).not.toBe(v0.factories);
    expect(v1.contracts).not.toBe(v0.contracts);
    expect(v1.reserve).not.toBe(v0.reserve);

    const build = performBuildFactoryTransaction(state, "ammo_plant", deterministicUid);
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    const v2 = build.next.vulcan as VulcanState;
    expect(v2.factories).not.toBe(v0.factories);
    expect(v2.reserve).not.toBe(v0.reserve);

    const tickState = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        factories: [{ uid: "f1", type: "ammo_plant", status: "active", buildTicksRemaining: 0, startedTick: 0 }],
        reserve: { standard_rounds: 50 },
      },
    });
    const t = tickVulcanProduction(tickState, 11);
    const vT0 = tickState.vulcan as VulcanState;
    const vT1 = t.next.vulcan as VulcanState;
    expect(vT1.factories).not.toBe(vT0.factories);
    expect(vT1.factories[0]).not.toBe(vT0.factories[0]);
    expect(vT1.reserve).not.toBe(vT0.reserve);
    expect(t.next.stockpiles).not.toBe(tickState.stockpiles);
  });

  it("tickVulcanProduction does not mutate the input state (purity)", () => {
    const state = makeState({
      vulcan: {
        ...createDefaultVulcanState(),
        factories: [{ uid: "f1", type: "ammo_plant", status: "active", buildTicksRemaining: 0, startedTick: 0 }],
        contracts: [{
          uid: "c1",
          templateId: "pc-bulk-ammo-1k",
          unitsRemaining: 1000,
          ticksUntilNextDelivery: 1,
          startedTick: 0,
        }],
        reserve: { standard_rounds: 500 },
      },
    });
    const beforeReserve = { ...(state.vulcan as VulcanState).reserve };
    const beforeStockpiles = { ...(state.stockpiles ?? {}) };
    tickVulcanProduction(state, 11);
    expect((state.vulcan as VulcanState).reserve).toEqual(beforeReserve);
    expect(state.stockpiles).toEqual(beforeStockpiles);
    expect((state.vulcan as VulcanState).contracts[0].unitsRemaining).toBe(1000);
  });
});

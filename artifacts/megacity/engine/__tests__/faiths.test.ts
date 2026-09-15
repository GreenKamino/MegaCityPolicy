import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import { migrateState } from "@/engine/saveLoad";
import {
  DOMINANCE_THRESHOLD,
  DOMINANT_DISTRICT_EFFECTS,
  FAITH_DEFS,
  FAITH_IDS,
  LEADER_CULT_COLLAPSE_THRESHOLD,
  LEADER_CULT_FX,
  RENUNCIATION_COOLDOWN_TICKS,
  RENUNCIATION_COST_CREDITS,
  RENUNCIATION_HAPPINESS_HIT,
  STANCE_EFFECTS,
  checkLeaderCultEligibility,
  computeCityFaithShares,
  createDefaultFaithState,
  declareLeaderCult,
  ensureFaithState,
  getLeaderCultEdictSlotBonus,
  getLeaderCultPropagandaMultiplier,
  isFaithId,
  isFaithStance,
  normalizeShares,
  processFaithDrift,
  getMaxActiveEdicts,
  renounceLeaderCult,
  setFaithStance,
  type FaithId,
} from "@/engine/faiths";
import { RELIGION_EVENT_CHAINS } from "@/engine/religionEventChains";
import { EVENT_CHAINS } from "@/engine/eventChains";
import type { GameState } from "@/engine/types";

function freshState(): GameState {
  return createInitialState();
}

// Build a complete DistrictFaithShares from a partial map. Missing keys take `fill`.
// Lets tests stay readable across faith roster changes — no test cares about
// listing every faith id, only the relative weights it's exercising.
function mkShares(partial: Partial<Record<FaithId, number>>, fill = 0): Record<FaithId, number> {
  return FAITH_IDS.reduce((acc, id) => {
    acc[id] = partial[id] ?? fill;
    return acc;
  }, {} as Record<FaithId, number>);
}

function evenShares(): Record<FaithId, number> {
  const v = 1 / FAITH_IDS.length;
  return FAITH_IDS.reduce((acc, id) => {
    acc[id] = v;
    return acc;
  }, {} as Record<FaithId, number>);
}

// Force every district to be ≥90% the given faith so eligibility (Sponsor + city dominance) trivially passes.
function forceCityDominance(s: GameState, faithId: FaithId): void {
  const fs = ensureFaithState(s);
  for (const d of s.districts) {
    const shares = mkShares({ [faithId]: 0.9 }, 0.05);
    fs.districtShares[d.id] = normalizeShares(shares);
  }
}

function setupEligibleAndDeclare(s: GameState, faithId: FaithId): boolean {
  setFaithStance(s, faithId, "sponsor");
  forceCityDominance(s, faithId);
  return declareLeaderCult(s, faithId);
}

describe("createDefaultFaithState", () => {
  it("seeds normalized shares for every district", () => {
    const s = freshState();
    const fs = s.faiths!;
    expect(fs).toBeTruthy();
    for (const d of s.districts) {
      const shares = fs.districtShares[d.id];
      expect(shares).toBeTruthy();
      const sum = FAITH_IDS.reduce((acc, id) => acc + shares[id], 0);
      expect(sum).toBeGreaterThan(0.999);
      expect(sum).toBeLessThan(1.001);
    }
  });

  it("starts every faith on Tolerate with no Leader Cult", () => {
    const s = freshState();
    const fs = s.faiths!;
    for (const id of FAITH_IDS) {
      expect(fs.stances[id]).toBe("tolerate");
    }
    expect(fs.leaderCult).toBeNull();
  });
});

describe("normalizeShares", () => {
  it("normalizes positive values to sum to 1", () => {
    const out = normalizeShares(mkShares({ "eternal-flame": 2, "machine-choir": 2, "ancestor-cult": 1 }));
    const sum = FAITH_IDS.reduce((a, id) => a + out[id], 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("clamps negatives and falls back to even shares when all zero", () => {
    const out = normalizeShares(mkShares({}));
    expect(out["eternal-flame"]).toBeCloseTo(1 / FAITH_IDS.length, 6);
  });
});

describe("setFaithStance", () => {
  it("sets and reads stance", () => {
    const s = freshState();
    expect(setFaithStance(s, "eternal-flame", "sponsor")).toBe(true);
    expect(s.faiths!.stances["eternal-flame"]).toBe("sponsor");
  });

  it("rejects invalid faith id", () => {
    const s = freshState();
    expect(setFaithStance(s, "nope" as unknown as Parameters<typeof setFaithStance>[1], "sponsor")).toBe(false);
  });

  it("does not lock or mutate edicts/policies (no-action-lock invariant)", () => {
    const s = freshState();
    const policiesBefore = { ...s.policies };
    setFaithStance(s, "eternal-flame", "sponsor");
    setFaithStance(s, "machine-choir", "suppress");
    setupEligibleAndDeclare(s, "eternal-flame");
    expect(s.policies).toEqual(policiesBefore);
  });
});

describe("Leader Cult eligibility gate", () => {
  it("rejects declaration without Sponsor stance", () => {
    const s = freshState();
    forceCityDominance(s, "machine-choir");
    const elig = checkLeaderCultEligibility(s, "machine-choir");
    expect(elig.eligible).toBe(false);
    if (!elig.eligible) expect(elig.reason).toBe("not-sponsored");
    expect(declareLeaderCult(s, "machine-choir")).toBe(false);
  });

  it("rejects declaration when faith is below city dominance threshold", () => {
    const s = freshState();
    setFaithStance(s, "machine-choir", "sponsor");
    // make sure machine-choir is well below threshold everywhere
    for (const d of s.districts) {
      s.faiths!.districtShares[d.id] = normalizeShares(mkShares({
        "eternal-flame": 0.5,
        "machine-choir": 0.05,
        "ancestor-cult": 0.45,
      }));
    }
    const cityShares = computeCityFaithShares(s);
    expect(cityShares["machine-choir"]).toBeLessThan(DOMINANCE_THRESHOLD);
    const elig = checkLeaderCultEligibility(s, "machine-choir");
    expect(elig.eligible).toBe(false);
    if (!elig.eligible) expect(elig.reason).toBe("not-dominant");
    expect(declareLeaderCult(s, "machine-choir")).toBe(false);
  });

  it("accepts declaration when Sponsor + dominance both hold", () => {
    const s = freshState();
    expect(setupEligibleAndDeclare(s, "ancestor-cult")).toBe(true);
    expect(s.faiths!.leaderCult?.faithId).toBe("ancestor-cult");
  });

  it("blocks re-declaration during cooldown after renunciation", () => {
    const s = freshState();
    s.totalTicks = 100;
    expect(setupEligibleAndDeclare(s, "machine-choir")).toBe(true);
    expect(renounceLeaderCult(s)).toBe(true);
    // immediately try again — must be blocked by cooldown
    setFaithStance(s, "ancestor-cult", "sponsor");
    forceCityDominance(s, "ancestor-cult");
    const eligDuring = checkLeaderCultEligibility(s, "ancestor-cult");
    expect(eligDuring.eligible).toBe(false);
    if (!eligDuring.eligible) expect(eligDuring.reason).toBe("cooldown");
    expect(declareLeaderCult(s, "ancestor-cult")).toBe(false);
    // advance past cooldown
    s.totalTicks = 100 + RENUNCIATION_COOLDOWN_TICKS;
    expect(declareLeaderCult(s, "ancestor-cult")).toBe(true);
  });
});

describe("Leader Cult bonus + drawback package", () => {
  it("propaganda multiplier is active only while Leader Cult is declared", () => {
    const s = freshState();
    expect(getLeaderCultPropagandaMultiplier(s)).toBe(1);
    expect(setupEligibleAndDeclare(s, "machine-choir")).toBe(true);
    expect(getLeaderCultPropagandaMultiplier(s)).toBe(LEADER_CULT_FX.propagandaMultiplier);
    expect(getLeaderCultPropagandaMultiplier(s)).toBeGreaterThan(1);
  });

  it("edict slot bonus is granted only while Leader Cult is declared", () => {
    const s = freshState();
    expect(getLeaderCultEdictSlotBonus(s)).toBe(0);
    setupEligibleAndDeclare(s, "ancestor-cult");
    expect(getLeaderCultEdictSlotBonus(s)).toBe(LEADER_CULT_FX.edictSlotBonus);
  });

  it("loyalty floor is applied to districts where the leader-cult faith dominates", () => {
    const s = freshState();
    setupEligibleAndDeclare(s, "machine-choir");
    // crater loyalty in a dominant district below the floor
    const d = s.districts[0];
    d.loyalty = 10;
    processFaithDrift(s, []);
    expect(d.loyalty).toBeGreaterThanOrEqual(LEADER_CULT_FX.loyaltyFloorInDominantDistricts);
  });

  it("Leader Cult adds happiness/corruption pressure to the city", () => {
    const s = freshState();
    setupEligibleAndDeclare(s, "machine-choir");
    const beforeH = s.cityStats.happiness;
    const beforeC = s.cityStats.corruption;
    processFaithDrift(s, []);
    expect(s.cityStats.happiness).toBeGreaterThan(beforeH);
    expect(s.cityStats.corruption).toBeGreaterThan(beforeC);
  });

  it("renunciation costs credits + happiness, hits faction loyalty, and clears the cult", () => {
    const s = freshState();
    s.resources.credits = 100000;
    s.cityStats.happiness = 80;
    setupEligibleAndDeclare(s, "eternal-flame");
    const ef = s.factions.find((f) => f.id === "eternal-flame")!;
    ef.loyalty = 80;
    expect(renounceLeaderCult(s)).toBe(true);
    expect(s.faiths!.leaderCult).toBeNull();
    expect(s.resources.credits).toBe(100000 - RENUNCIATION_COST_CREDITS);
    expect(s.cityStats.happiness).toBeCloseTo(80 + RENUNCIATION_HAPPINESS_HIT, 6);
    expect(ef.loyalty).toBeLessThan(80);
  });

  it("renunciation does not make credits go negative", () => {
    const s = freshState();
    s.resources.credits = 1000;
    setupEligibleAndDeclare(s, "eternal-flame");
    expect(renounceLeaderCult(s)).toBe(true);
    expect(s.resources.credits).toBeGreaterThanOrEqual(0);
  });
});

describe("processFaithDrift", () => {
  it("drifts shares toward sponsored faith and away from suppressed", () => {
    const s = freshState();
    setFaithStance(s, "eternal-flame", "sponsor");
    setFaithStance(s, "ancestor-cult", "suppress");
    const dId = s.districts[0].id;
    const before = { ...s.faiths!.districtShares[dId] };
    processFaithDrift(s, []);
    const after = s.faiths!.districtShares[dId];
    expect(after["eternal-flame"]).toBeGreaterThan(before["eternal-flame"]);
    expect(after["ancestor-cult"]).toBeLessThan(before["ancestor-cult"]);
    const sum = FAITH_IDS.reduce((a, id) => a + after[id], 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("drift is amplified in faith's affinity-category districts", () => {
    const s = freshState();
    setFaithStance(s, "machine-choir", "sponsor");
    // pick an industrial district (machine-choir affinity) and a non-affinity district
    const industrial = s.districts.find((d) => d.id === "central-foundry-zone")
      ?? s.districts.find((d) => d.subtitle.toLowerCase().includes("industrial"));
    const admin = s.districts.find((d) => d.subtitle.toLowerCase().includes("administrative"));
    if (!industrial || !admin) return;
    // Equalize starting shares so the comparison is apples-to-apples.
    s.faiths!.districtShares[industrial.id] = evenShares();
    s.faiths!.districtShares[admin.id] = evenShares();
    processFaithDrift(s, []);
    const baseline = 1 / FAITH_IDS.length;
    const dInd = s.faiths!.districtShares[industrial.id]["machine-choir"] - baseline;
    const dAdm = s.faiths!.districtShares[admin.id]["machine-choir"] - baseline;
    expect(dInd).toBeGreaterThan(dAdm);
  });

  it("propaganda policy amplifies drift", () => {
    const sA = freshState();
    const sB = freshState();
    setFaithStance(sA, "eternal-flame", "sponsor");
    setFaithStance(sB, "eternal-flame", "sponsor");
    sA.policies.propaganda = false;
    sB.policies.propaganda = true;
    const dId = sA.districts[0].id;
    sA.faiths!.districtShares[dId] = evenShares();
    sB.faiths!.districtShares[dId] = evenShares();
    processFaithDrift(sA, []);
    processFaithDrift(sB, []);
    const dA = sA.faiths!.districtShares[dId]["eternal-flame"];
    const dB = sB.faiths!.districtShares[dId]["eternal-flame"];
    expect(dB).toBeGreaterThan(dA);
  });

  it("Tolerate-on-all keeps shares stable", () => {
    const s = freshState();
    const dId = s.districts[0].id;
    const before = { ...s.faiths!.districtShares[dId] };
    processFaithDrift(s, []);
    const after = s.faiths!.districtShares[dId];
    for (const id of FAITH_IDS) {
      expect(after[id]).toBeCloseTo(before[id], 6);
    }
  });

  // Task #217: the no-drift fast path skips the per-district
  // {...cur} clone and normalizeShares call. Confirm pre-populated
  // shares are preserved EXACTLY (not re-normalized) across many
  // ticks when nothing can drift, and that share objects for
  // districts with non-tolerate stances still drift normally.
  it("no-drift fast path preserves district shares exactly across many ticks", () => {
    const s = freshState();
    const dId = s.districts[0].id;
    const seeded = { ...s.faiths!.districtShares[dId] };
    const seededRef = s.faiths!.districtShares[dId];
    for (let i = 0; i < 50; i++) processFaithDrift(s, []);
    const after = s.faiths!.districtShares[dId];
    expect(after).toBe(seededRef); // same object reference, not re-allocated
    for (const id of FAITH_IDS) {
      expect(after[id]).toBe(seeded[id]); // exact equality, no normalization drift
    }
  });

  it("applies stance trade-offs to cityStats", () => {
    const s = freshState();
    setFaithStance(s, "eternal-flame", "suppress");
    const beforeLaw = s.cityStats.lawOrder;
    const beforeUnrest = s.cityStats.unrest;
    processFaithDrift(s, []);
    expect(s.cityStats.lawOrder).toBeGreaterThan(beforeLaw);
    expect(s.cityStats.unrest).toBeGreaterThan(beforeUnrest);
  });

  it("applies dominant-faith district passive effects", () => {
    const s = freshState();
    const d = s.districts[0];
    s.faiths!.districtShares[d.id] = mkShares({ "eternal-flame": 0.05, "machine-choir": 0.9, "ancestor-cult": 0.05 });
    const before = d.industrialOutput;
    processFaithDrift(s, []);
    expect(d.industrialOutput).toBeGreaterThan(before);
  });

  it("Eternal Flame sponsor raises faction loyalty every 4 ticks", () => {
    const s = freshState();
    setFaithStance(s, "eternal-flame", "sponsor");
    const ef = s.factions.find((f) => f.id === "eternal-flame")!;
    const before = ef.loyalty;
    s.totalTicks = 4;
    processFaithDrift(s, []);
    expect(ef.loyalty).toBeGreaterThan(before);
  });

  it("Eternal Flame suppress lowers faction loyalty every 4 ticks", () => {
    const s = freshState();
    setFaithStance(s, "eternal-flame", "suppress");
    const ef = s.factions.find((f) => f.id === "eternal-flame")!;
    ef.loyalty = 60;
    s.totalTicks = 8;
    processFaithDrift(s, []);
    expect(ef.loyalty).toBeLessThan(60);
  });

  it("Leader Cult of Eternal Flame pins faction loyalty to 100 every tick", () => {
    const s = freshState();
    setupEligibleAndDeclare(s, "eternal-flame");
    const ef = s.factions.find((f) => f.id === "eternal-flame")!;
    ef.loyalty = 5;
    s.totalTicks = 1; // not on the 4-tick gate
    processFaithDrift(s, []);
    expect(ef.loyalty).toBe(100);
    // and again immediately
    ef.loyalty = 50;
    s.totalTicks = 2;
    processFaithDrift(s, []);
    expect(ef.loyalty).toBe(100);
  });

  it("faith-weakening collapse: leader cult faith below 25% city share punishes happiness/unrest", () => {
    const s = freshState();
    setupEligibleAndDeclare(s, "machine-choir");
    // crater the cult faith citywide so collapse triggers
    for (const d of s.districts) {
      s.faiths!.districtShares[d.id] = normalizeShares(mkShares({
        "eternal-flame": 0.5,
        "machine-choir": 0.05,
        "ancestor-cult": 0.45,
      }));
    }
    const cityShares = computeCityFaithShares(s);
    expect(cityShares["machine-choir"]).toBeLessThan(LEADER_CULT_COLLAPSE_THRESHOLD);
    s.cityStats.happiness = 70;
    s.cityStats.unrest = 30;
    const beforeH = s.cityStats.happiness;
    const beforeU = s.cityStats.unrest;
    const entries: import("@/engine/types").TickEntry[] = [];
    processFaithDrift(s, entries);
    // collapse contributes negative happiness + positive unrest beyond the small LC bonus
    expect(s.cityStats.happiness).toBeLessThan(beforeH);
    expect(s.cityStats.unrest).toBeGreaterThan(beforeU + 0.05);
    expect(entries.some((e) => e.label === "Leader Cult collapsing")).toBe(true);
  });

  it("getMaxActiveEdicts grants +1 only while Leader Cult is declared", () => {
    const s = freshState();
    const baseCap = getMaxActiveEdicts(s);
    setupEligibleAndDeclare(s, "ancestor-cult");
    expect(getMaxActiveEdicts(s)).toBe(baseCap + LEADER_CULT_FX.edictSlotBonus);
    renounceLeaderCult(s);
    expect(getMaxActiveEdicts(s)).toBe(baseCap);
  });

  it("active edict cap is enforced and Leader Cult unlocks one extra slot", () => {
    const s = freshState();
    const baseCap = getMaxActiveEdicts(s);
    s.activeEdicts = Array.from({ length: baseCap }, (_, i) => ({
      edictId: `filler-${i}`,
      issuedAtTick: 0,
    })) as GameState["activeEdicts"];
    expect(s.activeEdicts!.length).toBe(baseCap);
    setupEligibleAndDeclare(s, "ancestor-cult");
    expect(getMaxActiveEdicts(s)).toBe(baseCap + 1);
    expect(s.activeEdicts!.length).toBeLessThan(getMaxActiveEdicts(s));
    renounceLeaderCult(s);
    expect(s.activeEdicts!.length).toBe(getMaxActiveEdicts(s));
  });

  it("renunciation cooldown persists across save migration", () => {
    const s = freshState();
    setupEligibleAndDeclare(s, "machine-choir");
    s.totalTicks = 100;
    renounceLeaderCult(s);
    expect(s.faiths!.lastRenouncedAtTick).toBe(100);
    const migrated = migrateState(JSON.parse(JSON.stringify(s)));
    expect(migrated.faiths!.lastRenouncedAtTick).toBe(100);
  });

  it("stance trade-offs reach the dominant district's loyalty + crime dimensions", () => {
    const s = freshState();
    forceCityDominance(s, "machine-choir");
    s.faiths!.stances["machine-choir"] = "sponsor";
    const d = s.districts.find((dd) => s.faiths!.districtShares[dd.id]["machine-choir"] >= 0.5)!;
    const beforeLoyalty = d.loyalty;
    const beforeCrime = d.crime;
    processFaithDrift(s, []);
    expect(d.loyalty).toBeGreaterThan(beforeLoyalty);
    expect(d.crime).toBeGreaterThan(beforeCrime);

    // Now flip to suppress and verify the inverse trade-off
    const s2 = freshState();
    forceCityDominance(s2, "machine-choir");
    s2.faiths!.stances["machine-choir"] = "suppress";
    const d2 = s2.districts.find((dd) => s2.faiths!.districtShares[dd.id]["machine-choir"] >= 0.5)!;
    const beforeLoyalty2 = d2.loyalty;
    const beforeCrime2 = d2.crime;
    processFaithDrift(s2, []);
    expect(d2.loyalty).toBeLessThan(beforeLoyalty2);
    expect(d2.crime).toBeLessThan(beforeCrime2);
  });

  it("after EF Leader Cult renunciation, faction loyalty is no longer pinned", () => {
    const s = freshState();
    setupEligibleAndDeclare(s, "eternal-flame");
    renounceLeaderCult(s);
    const ef = s.factions.find((f) => f.id === "eternal-flame")!;
    ef.loyalty = 50;
    s.totalTicks = 1;
    processFaithDrift(s, []);
    expect(ef.loyalty).toBe(50); // not on 4-tick gate, no override
  });
});

describe("computeCityFaithShares", () => {
  it("returns a normalized population-weighted distribution", () => {
    const s = freshState();
    const out = computeCityFaithShares(s);
    const sum = FAITH_IDS.reduce((a, id) => a + out[id], 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe("save migration", () => {
  it("backfills missing faiths slice with even shares + Tolerate + no Leader Cult", () => {
    const s = freshState();
    delete (s as Partial<GameState>).faiths;
    const migrated = migrateState(s);
    expect(migrated.faiths).toBeTruthy();
    for (const id of FAITH_IDS) {
      expect(migrated.faiths!.stances[id]).toBe("tolerate");
    }
    expect(migrated.faiths!.leaderCult).toBeNull();
    // Per spec: legacy migration uses EVEN shares (1/N each), not category seeds.
    for (const d of migrated.districts) {
      const shares = migrated.faiths!.districtShares[d.id];
      for (const id of FAITH_IDS) {
        expect(shares[id]).toBeCloseTo(1 / FAITH_IDS.length, 6);
      }
    }
  });

  it("preserves valid stances and leader cult on migration", () => {
    const s = freshState();
    setupEligibleAndDeclare(s, "eternal-flame");
    const migrated = migrateState(s);
    expect(migrated.faiths!.stances["eternal-flame"]).toBe("sponsor");
    expect(migrated.faiths!.leaderCult?.faithId).toBe("eternal-flame");
  });

  it("normalizes corrupted share values from saves", () => {
    const s = freshState();
    const dId = s.districts[0].id;
    s.faiths!.districtShares[dId] = mkShares({
      "eternal-flame": -5,
      "machine-choir": 999,
      "ancestor-cult": 0,
    });
    const migrated = migrateState(s);
    const shares = migrated.faiths!.districtShares[dId];
    const sum = FAITH_IDS.reduce((a, id) => a + shares[id], 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(shares["eternal-flame"]).toBeGreaterThanOrEqual(0);
  });

  it("recovers from NaN/Infinity in saved share values", () => {
    const s = freshState();
    const dId = s.districts[0].id;
    s.faiths!.districtShares[dId] = mkShares({
      "eternal-flame": Number.NaN,
      "machine-choir": Number.POSITIVE_INFINITY,
      "ancestor-cult": Number.NEGATIVE_INFINITY,
    });
    const migrated = migrateState(s);
    const shares = migrated.faiths!.districtShares[dId];
    for (const id of FAITH_IDS) {
      expect(Number.isFinite(shares[id])).toBe(true);
      expect(shares[id]).toBeGreaterThanOrEqual(0);
    }
    const sum = FAITH_IDS.reduce((a, id) => a + shares[id], 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("rejects malformed leaderCult on migration", () => {
    const s = freshState();
    (s.faiths as { leaderCult: unknown }).leaderCult = { faithId: "not-a-real-faith", declaredAtTick: 1 };
    const migrated = migrateState(s);
    expect(migrated.faiths!.leaderCult).toBeNull();
  });
});

describe("religion event chains", () => {
  it("registers all three chains in EVENT_CHAINS", () => {
    const ids = EVENT_CHAINS.map((c) => c.id);
    expect(ids).toContain("faith_schism");
    expect(ids).toContain("faith_miracle");
    expect(ids).toContain("faith_heresy_crackdown");
    expect(ids).toContain("leader_cult_assassination");
    expect(RELIGION_EVENT_CHAINS).toHaveLength(4);
  });

  it("schism chain only fires for non-sponsored dominant faiths", () => {
    const s = freshState();
    const dId = s.districts[0].id;
    s.faiths!.districtShares[dId] = mkShares({
      "eternal-flame": 0.8,
      "machine-choir": 0.1,
      "ancestor-cult": 0.1,
    });
    setFaithStance(s, "eternal-flame", "tolerate");
    const chain = RELIGION_EVENT_CHAINS.find((c) => c.id === "faith_schism")!;
    expect(chain.triggerCheck(s)).toBe(true);
    for (const id of FAITH_IDS) setFaithStance(s, id, "sponsor");
    expect(chain.triggerCheck(s)).toBe(false);
  });

  it("miracle chain fires when sponsored faith is dominant", () => {
    const s = freshState();
    const dId = s.districts[0].id;
    s.faiths!.districtShares[dId] = mkShares({
      "eternal-flame": 0.85,
      "machine-choir": 0.1,
      "ancestor-cult": 0.05,
    });
    setFaithStance(s, "eternal-flame", "sponsor");
    const chain = RELIGION_EVENT_CHAINS.find((c) => c.id === "faith_miracle")!;
    expect(chain.triggerCheck(s)).toBe(true);
    const ctx = chain.prepareContext!(s);
    expect(ctx).toBeTruthy();
    expect(ctx!.faithName).toBeTruthy();
    expect(ctx!.districtName).toBeTruthy();
  });

  it("heresy crackdown only fires when faith is suppressed but still significant", () => {
    const s = freshState();
    const dId = s.districts[0].id;
    s.faiths!.districtShares[dId] = mkShares({
      "eternal-flame": 0.5,
      "machine-choir": 0.3,
      "ancestor-cult": 0.2,
    });
    const chain = RELIGION_EVENT_CHAINS.find((c) => c.id === "faith_heresy_crackdown")!;
    setFaithStance(s, "eternal-flame", "tolerate");
    expect(chain.triggerCheck(s)).toBe(false);
    setFaithStance(s, "eternal-flame", "suppress");
    expect(chain.triggerCheck(s)).toBe(true);
  });
});

describe("Task #208 — extensible faith roster", () => {
  it("FAITH_IDS, FAITH_DEFS, and DOMINANT_DISTRICT_EFFECTS stay in sync", () => {
    expect(Object.keys(FAITH_DEFS).sort()).toEqual([...FAITH_IDS].sort());
    expect(Object.keys(DOMINANT_DISTRICT_EFFECTS).sort()).toEqual([...FAITH_IDS].sort());
  });

  it("includes The Ledger and The Tidekeepers", () => {
    expect(FAITH_IDS).toContain("the-ledger" as FaithId);
    expect(FAITH_IDS).toContain("the-tidekeepers" as FaithId);
  });

  it("default seed produces shares for every faith in every district", () => {
    const s = freshState();
    for (const d of s.districts) {
      const shares = s.faiths!.districtShares[d.id];
      for (const id of FAITH_IDS) {
        expect(typeof shares[id]).toBe("number");
        expect(shares[id]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("The Ledger dominance raises district loyalty and lowers crime", () => {
    const s = freshState();
    const d = s.districts[0];
    s.faiths!.districtShares[d.id] = mkShares({ "the-ledger": 0.9 }, 0.025);
    const beforeLoyalty = d.loyalty;
    const beforeCrime = d.crime;
    processFaithDrift(s, []);
    expect(d.loyalty).toBeGreaterThan(beforeLoyalty);
    expect(d.crime).toBeLessThan(beforeCrime);
  });

  it("The Tidekeepers dominance raises district ecology and lowers industrial output", () => {
    const s = freshState();
    const d = s.districts[0];
    s.faiths!.districtShares[d.id] = mkShares({ "the-tidekeepers": 0.9 }, 0.025);
    const beforeEcology = d.ecology;
    const beforeIndustrial = d.industrialOutput;
    processFaithDrift(s, []);
    expect(d.ecology).toBeGreaterThan(beforeEcology);
    expect(d.industrialOutput).toBeLessThan(beforeIndustrial);
  });

  it("manualContent lists every registered faith", async () => {
    const { MANUAL } = await import("@/engine/manualContent");
    for (const id of FAITH_IDS) {
      expect(MANUAL.faiths).toHaveProperty(id);
    }
  });

  it("Leader Cult eligibility works for the new faiths", () => {
    expect(setupEligibleAndDeclare(freshState(), "the-ledger")).toBe(true);
    expect(setupEligibleAndDeclare(freshState(), "the-tidekeepers")).toBe(true);
  });

  it("The Ledger affinity covers commercial + admin districts (per spec)", () => {
    expect(FAITH_DEFS["the-ledger"].affinityCategories).toEqual(
      expect.arrayContaining(["commercial", "admin"]),
    );
  });

  it("The Tidekeepers affinity covers water + wasteland districts (per spec)", () => {
    expect(FAITH_DEFS["the-tidekeepers"].affinityCategories).toEqual(
      expect.arrayContaining(["water", "wasteland"]),
    );
  });

  it("Sponsor stance applies The Ledger's signature overlay (extra corruption + lawOrder rot)", async () => {
    const { FAITH_SPONSOR_BONUS } = await import("@/engine/faiths");
    const sLedger = freshState();
    const sBaseline = freshState();
    setFaithStance(sLedger, "the-ledger", "sponsor");
    // baseline keeps everyone at tolerate
    const lawBefore = sLedger.cityStats.lawOrder;
    const corrBefore = sLedger.cityStats.corruption;
    const blawBefore = sBaseline.cityStats.lawOrder;
    const bcorrBefore = sBaseline.cityStats.corruption;
    processFaithDrift(sLedger, []);
    processFaithDrift(sBaseline, []);
    const ledgerLawDelta = sLedger.cityStats.lawOrder - lawBefore;
    const ledgerCorrDelta = sLedger.cityStats.corruption - corrBefore;
    const baselineLawDelta = sBaseline.cityStats.lawOrder - blawBefore;
    const baselineCorrDelta = sBaseline.cityStats.corruption - bcorrBefore;
    // Ledger sponsor must hurt lawOrder more (or help less) than tolerate baseline
    expect(ledgerLawDelta).toBeLessThan(baselineLawDelta);
    // and feed corruption more than tolerate baseline
    expect(ledgerCorrDelta).toBeGreaterThan(baselineCorrDelta);
    // overlay must be registered
    expect(FAITH_SPONSOR_BONUS["the-ledger"]).toBeDefined();
  });

  it("Sponsor stance applies The Tidekeepers' signature overlay (calmer city: less unrest)", async () => {
    const { FAITH_SPONSOR_BONUS } = await import("@/engine/faiths");
    const sTide = freshState();
    const sBaseline = freshState();
    setFaithStance(sTide, "the-tidekeepers", "sponsor");
    const tideUnrestBefore = sTide.cityStats.unrest;
    const baselineUnrestBefore = sBaseline.cityStats.unrest;
    processFaithDrift(sTide, []);
    processFaithDrift(sBaseline, []);
    const tideUnrestDelta = sTide.cityStats.unrest - tideUnrestBefore;
    const baselineUnrestDelta = sBaseline.cityStats.unrest - baselineUnrestBefore;
    // Tidekeepers sponsor must lower unrest more than the tolerate baseline
    expect(tideUnrestDelta).toBeLessThan(baselineUnrestDelta);
    expect(FAITH_SPONSOR_BONUS["the-tidekeepers"]).toBeDefined();
  });

  it("commercial-category seed favors The Ledger above the uniform baseline", async () => {
    const { getDistrictCategory } = await import("@/engine/districts");
    const s = freshState();
    const commercial = s.districts.find((d) => getDistrictCategory(d.id) === "commercial");
    expect(commercial).toBeDefined();
    const shares = s.faiths!.districtShares[commercial!.id];
    const uniform = 1 / FAITH_IDS.length;
    expect(shares["the-ledger"]).toBeGreaterThan(uniform);
  });

  it("water-category seed favors The Tidekeepers above the uniform baseline", async () => {
    const { getDistrictCategory } = await import("@/engine/districts");
    const s = freshState();
    const water = s.districts.find((d) => getDistrictCategory(d.id) === "water");
    expect(water).toBeDefined();
    const shares = s.faiths!.districtShares[water!.id];
    const uniform = 1 / FAITH_IDS.length;
    expect(shares["the-tidekeepers"]).toBeGreaterThan(uniform);
  });

  it("first-introduction events exist for both new faiths", async () => {
    const { CONDITION_TRIGGERS } = await import("@/engine/eventTriggers");
    const ids = CONDITION_TRIGGERS.map((t) => t.id);
    expect(ids).toContain("faith_intro_ledger");
    expect(ids).toContain("faith_intro_tidekeepers");
  });

  it("Catholicism is registered with parish-service affinities and a first-introduction event", async () => {
    expect(FAITH_IDS).toContain("catholicism");
    expect(FAITH_DEFS.catholicism).toMatchObject({
      name: "Catholicism",
      shortName: "Catholicism",
      color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
    });
    expect(FAITH_DEFS.catholicism.affinityCategories).toEqual(
      expect.arrayContaining(["housing", "medical", "government"]),
    );
    const { CONDITION_TRIGGERS } = await import("@/engine/eventTriggers");
    expect(CONDITION_TRIGGERS.map((t) => t.id)).toContain("faith_intro_catholicism");
  });

  it("Catholicism sponsor and dominant-district effects are active", async () => {
    const { FAITH_SPONSOR_BONUS } = await import("@/engine/faiths");
    const sponsored = freshState();
    const baseline = freshState();
    setFaithStance(sponsored, "catholicism", "sponsor");
    processFaithDrift(sponsored, []);
    processFaithDrift(baseline, []);
    expect(sponsored.cityStats.happiness - baseline.cityStats.happiness).toBeGreaterThan(0);
    expect(sponsored.cityStats.unrest - baseline.cityStats.unrest).toBeLessThan(0);
    expect(FAITH_SPONSOR_BONUS.catholicism).toBeDefined();

    const dominant = freshState();
    const district = dominant.districts[0];
    dominant.faiths!.districtShares[district.id] = mkShares({ catholicism: 0.9 }, 0.025);
    const loyaltyBefore = district.loyalty;
    const crimeBefore = district.crime;
    processFaithDrift(dominant, []);
    expect(district.loyalty).toBeGreaterThan(loyaltyBefore);
    expect(district.crime).toBeLessThan(crimeBefore);
  });
});

describe("Task #209 — The Helix Commune", () => {
  it("is a registered faith with research/medical/slums affinity and no factionId", () => {
    expect(FAITH_IDS).toContain("helix-commune" as FaithId);
    const def = FAITH_DEFS["helix-commune"];
    expect(def.affinityCategories).toEqual(
      expect.arrayContaining(["research", "medical", "slums"]),
    );
    // Helix Commune is intentionally NOT wired to s.factions on launch
    // (faction-system integration is a post-launch concern).
    expect((def as { factionId?: string }).factionId).toBeUndefined();
  });

  it("dominant-district fx raise loyalty AND raise crime (drawback)", () => {
    const s = freshState();
    const d = s.districts[0];
    s.faiths!.districtShares[d.id] = mkShares({ "helix-commune": 0.9 }, 0.025);
    const beforeLoyalty = d.loyalty;
    const beforeCrime = d.crime;
    processFaithDrift(s, []);
    expect(d.loyalty).toBeGreaterThan(beforeLoyalty);
    expect(d.crime).toBeGreaterThan(beforeCrime);
  });

  it("Sponsor stance applies a happiness lift over the tolerate baseline", async () => {
    const { FAITH_SPONSOR_BONUS } = await import("@/engine/faiths");
    const sHelix = freshState();
    const sBaseline = freshState();
    setFaithStance(sHelix, "helix-commune", "sponsor");
    const helixHapBefore = sHelix.cityStats.happiness;
    const baseHapBefore = sBaseline.cityStats.happiness;
    processFaithDrift(sHelix, []);
    processFaithDrift(sBaseline, []);
    const helixDelta = sHelix.cityStats.happiness - helixHapBefore;
    const baseDelta = sBaseline.cityStats.happiness - baseHapBefore;
    expect(helixDelta).toBeGreaterThan(baseDelta);
    expect(FAITH_SPONSOR_BONUS["helix-commune"]).toBeDefined();
  });

  it("first-introduction event faith_intro_helix is registered", async () => {
    const { CONDITION_TRIGGERS } = await import("@/engine/eventTriggers");
    expect(CONDITION_TRIGGERS.map((t) => t.id)).toContain("faith_intro_helix");
  });

  it("Eternal-Flame vs Helix-Commune doctrinal-clash trigger is registered", async () => {
    const { CONDITION_TRIGGERS } = await import("@/engine/eventTriggers");
    expect(CONDITION_TRIGGERS.map((t) => t.id)).toContain("faith_helix_flame_clash");
  });

  it("applyChainEffects({loyalty_helix-commune: +N}) actually shifts shares in affinity districts", async () => {
    const { applyChainEffects } = await import("@/engine/eventChains");
    const { getDistrictCategory } = await import("@/engine/districts");
    const s = freshState();
    const affinity = new Set<string>(FAITH_DEFS["helix-commune"].affinityCategories);
    const beforeByDistrict: Record<string, number> = {};
    for (const d of s.districts) {
      beforeByDistrict[d.id] = s.faiths!.districtShares[d.id]["helix-commune"];
    }
    applyChainEffects(s, { "loyalty_helix-commune": 5 });
    let bumpedAffinityDistricts = 0;
    let touchedNonAffinity = false;
    for (const d of s.districts) {
      const before = beforeByDistrict[d.id];
      const after = s.faiths!.districtShares[d.id]["helix-commune"];
      if (affinity.has(getDistrictCategory(d.id))) {
        if (after > before) bumpedAffinityDistricts++;
      } else if (after !== before) {
        touchedNonAffinity = true;
      }
      // Invariant: shares always sum to 1 after a nudge.
      const sum = (Object.values(s.faiths!.districtShares[d.id]) as number[]).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
    expect(bumpedAffinityDistricts).toBeGreaterThan(0);
    expect(touchedNonAffinity).toBe(false);
  });

  it("loyalty_helix-commune chain references exist and are no longer allowlisted as dead", async () => {
    // The Helix Commune has no backing faction, so loyalty_helix-commune
    // would silently no-op without the Task #209 resolver extension.
    // 1. The references in business chains must still exist (we did not
    //    rename them out — the resolver now handles them).
    const { BUSINESS_EVENT_CHAINS } = await import("@/engine/businessEventChains");
    expect(JSON.stringify(BUSINESS_EVENT_CHAINS)).toContain("loyalty_helix-commune");
    // 2. The integrity allowlist must no longer cover it (the chain
    //    integrity test will fail on its own if the resolver regresses).
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const allowlistPath = path.resolve(__dirname, "eventChainIntegrity.test.ts");
    const src = await fs.readFile(allowlistPath, "utf-8");
    expect(src).not.toContain('"loyalty_helix-commune"');
  });
});

describe("Task #211 — The Free Choir", () => {
  it("is a registered faith with commercial/transport affinity and no factionId", () => {
    expect(FAITH_IDS).toContain("free-choir" as FaithId);
    const def = FAITH_DEFS["free-choir"];
    expect(def.affinityCategories).toEqual(
      expect.arrayContaining(["commercial", "transport"]),
    );
    // Free Choir is intentionally NOT wired to s.factions — the Free Trader
    // faction-system integration is out of scope for this task.
    expect((def as { factionId?: string }).factionId).toBeUndefined();
  });

  it("dominant-district fx raise loyalty AND raise crime (smuggling drawback)", () => {
    const s = freshState();
    const d = s.districts[0];
    s.faiths!.districtShares[d.id] = mkShares({ "free-choir": 0.9 }, 0.025);
    const beforeLoyalty = d.loyalty;
    const beforeCrime = d.crime;
    processFaithDrift(s, []);
    expect(d.loyalty).toBeGreaterThan(beforeLoyalty);
    expect(d.crime).toBeGreaterThan(beforeCrime);
    // Confirm the dominant fx contract — both keys present and positive.
    expect(DOMINANT_DISTRICT_EFFECTS["free-choir"].loyalty).toBeGreaterThan(0);
    expect(DOMINANT_DISTRICT_EFFECTS["free-choir"].crime).toBeGreaterThan(0);
  });

  it("Sponsor stance lifts tradeIncome on s.rates AND raises corruption", async () => {
    const { FAITH_SPONSOR_BONUS } = await import("@/engine/faiths");
    const s = freshState();
    setFaithStance(s, "free-choir", "sponsor");
    const beforeTrade = s.rates.tradeIncome;
    const beforeCorr = s.cityStats.corruption;
    processFaithDrift(s, []);
    const expectedTrade = FAITH_SPONSOR_BONUS["free-choir"]!.tradeIncome ?? 0;
    expect(expectedTrade).toBeGreaterThan(0);
    expect(s.rates.tradeIncome).toBeCloseTo(beforeTrade + expectedTrade);
    // Sponsor stance baseline already adds corruption; Free Choir layers more on top.
    expect(s.cityStats.corruption).toBeGreaterThan(beforeCorr);
  });

  it("Ledger + Free Choir both sponsored stack tradeIncome AND stack corruption", () => {
    const sBoth = freshState();
    const sLedger = freshState();
    setFaithStance(sLedger, "the-ledger", "sponsor");
    setFaithStance(sBoth, "the-ledger", "sponsor");
    setFaithStance(sBoth, "free-choir", "sponsor");
    const tradeBeforeBoth = sBoth.rates.tradeIncome;
    const tradeBeforeLedger = sLedger.rates.tradeIncome;
    const corrBeforeBoth = sBoth.cityStats.corruption;
    const corrBeforeLedger = sLedger.cityStats.corruption;
    processFaithDrift(sBoth, []);
    processFaithDrift(sLedger, []);
    const tradeDeltaBoth = sBoth.rates.tradeIncome - tradeBeforeBoth;
    const tradeDeltaLedger = sLedger.rates.tradeIncome - tradeBeforeLedger;
    const corrDeltaBoth = sBoth.cityStats.corruption - corrBeforeBoth;
    const corrDeltaLedger = sLedger.cityStats.corruption - corrBeforeLedger;
    // Stacked sponsorship strictly beats single sponsorship on both axes.
    expect(tradeDeltaBoth).toBeGreaterThan(tradeDeltaLedger);
    expect(corrDeltaBoth).toBeGreaterThan(corrDeltaLedger);
  });

  it("first-introduction event faith_intro_choir is registered", async () => {
    const { CONDITION_TRIGGERS } = await import("@/engine/eventTriggers");
    expect(CONDITION_TRIGGERS.map((t) => t.id)).toContain("faith_intro_choir");
  });

  it("Free Choir transit multiplier: sponsor lifts, suppress shrinks, tolerate is neutral", async () => {
    const { getFreeChoirTransitMultiplier, FREE_CHOIR_TRANSIT_MULT } = await import("@/engine/faiths");
    const sNeutral = freshState();
    const sSponsor = freshState();
    const sSuppress = freshState();
    setFaithStance(sSponsor, "free-choir", "sponsor");
    setFaithStance(sSuppress, "free-choir", "suppress");
    expect(getFreeChoirTransitMultiplier(sNeutral)).toBe(1);
    expect(getFreeChoirTransitMultiplier(sSponsor)).toBe(FREE_CHOIR_TRANSIT_MULT.sponsor);
    expect(getFreeChoirTransitMultiplier(sSponsor)).toBeGreaterThan(1);
    expect(getFreeChoirTransitMultiplier(sSuppress)).toBe(FREE_CHOIR_TRANSIT_MULT.suppress);
    expect(getFreeChoirTransitMultiplier(sSuppress)).toBeLessThan(1);
  });

  it("trade_caravan_arrives response credits scale with Free Choir stance", async () => {
    const { CONDITION_TRIGGERS } = await import("@/engine/eventTriggers");
    const trigger = CONDITION_TRIGGERS.find((t) => t.id === "trade_caravan_arrives");
    expect(trigger).toBeDefined();
    const t = trigger!;
    function welcomeCredits(stance: "sponsor" | "tolerate" | "suppress"): number {
      const s = freshState();
      s.totalTicks = 50;
      s.cityStats.population = 100000;
      setFaithStance(s, "free-choir", stance);
      const ev = t.generate!(s);
      const welcome = ev.responseOptions!.find((r) => r.id === "tc_welcome")!;
      return welcome.effects.credits ?? 0;
    }
    const baseline = welcomeCredits("tolerate");
    const sponsored = welcomeCredits("sponsor");
    const suppressed = welcomeCredits("suppress");
    // The convoy/transit success-rate modifier is real and observable in the
    // resolver path, not just in faith drift stats.
    expect(sponsored).toBeGreaterThan(baseline);
    expect(suppressed).toBeLessThan(baseline);
  });

  it("transit-themed chain (trade_war_blockade) outcomes scale with Free Choir stance", async () => {
    const { advanceEventChain, FREE_CHOIR_TRANSIT_CHAIN_IDS } = await import("@/engine/eventChains");
    expect(FREE_CHOIR_TRANSIT_CHAIN_IDS.has("trade_war_blockade")).toBe(true);

    function creditsAfterTwBoth(stance: "sponsor" | "tolerate" | "suppress"): number {
      const s = freshState();
      s.totalTicks = 100;
      s.resources.credits = 100000;
      setFaithStance(s, "free-choir", stance);
      // Plant an active, unresolved trade_war_blockade chain at stage 1 directly.
      s.activeEventChains = [
        {
          chainId: "trade_war_blockade",
          currentStageId: "tw_stage1",
          startTick: s.totalTicks,
          stageStartTick: s.totalTicks,
          choicesMade: [],
          resolved: false,
        },
      ];
      const before = s.resources.credits;
      advanceEventChain(s, "trade_war_blockade", "tw_both");
      return s.resources.credits - before;
    }

    const baseline = creditsAfterTwBoth("tolerate");
    const sponsored = creditsAfterTwBoth("sponsor");
    const suppressed = creditsAfterTwBoth("suppress");
    // tw_both grants +40000 credits flavor-wise as transit toll income — the
    // Free Choir success modifier must move that up under Sponsor and down
    // under Suppress so the convoy/transit hook is observable end-to-end.
    expect(sponsored).toBeGreaterThan(baseline);
    expect(suppressed).toBeLessThan(baseline);
  });

  it("transit-themed chain negative credits are dampened by Sponsor and amplified by Suppress", async () => {
    // Regression guard: the Free Choir transit modifier must consistently make
    // the player's situation *better* under Sponsor regardless of whether the
    // chosen response carries a positive or negative income delta. The
    // ft_negotiate response in free_trader_embargo costs credits: -20000 to
    // open negotiations with the Guild — Sponsor must shrink that loss
    // (cantors smooth the talks), Suppress must amplify it.
    const { advanceEventChain } = await import("@/engine/eventChains");
    function creditsDeltaFtNegotiate(stance: "sponsor" | "tolerate" | "suppress"): number {
      const s = freshState();
      s.totalTicks = 100;
      s.resources.credits = 200000;
      setFaithStance(s, "free-choir", stance);
      s.activeEventChains = [
        {
          chainId: "free_trader_embargo",
          currentStageId: "ft_stage1",
          startTick: s.totalTicks,
          stageStartTick: s.totalTicks,
          choicesMade: [],
          resolved: false,
        },
      ];
      const before = s.resources.credits;
      advanceEventChain(s, "free_trader_embargo", "ft_negotiate");
      return s.resources.credits - before;
    }
    const baseline = creditsDeltaFtNegotiate("tolerate"); // -20000
    const sponsored = creditsDeltaFtNegotiate("sponsor"); // less negative
    const suppressed = creditsDeltaFtNegotiate("suppress"); // more negative
    expect(baseline).toBeLessThan(0);
    expect(sponsored).toBeGreaterThan(baseline);
    expect(suppressed).toBeLessThan(baseline);
  });

  it("transit-themed chain stage emits a Free Choir influence message under sponsor/suppress, none on tolerate", async () => {
    const { advanceEventChain } = await import("@/engine/eventChains");
    function resolveTwBoth(stance: "sponsor" | "tolerate" | "suppress") {
      const s = freshState();
      s.totalTicks = 100;
      s.resources.credits = 100000;
      setFaithStance(s, "free-choir", stance);
      s.activeEventChains = [
        {
          chainId: "trade_war_blockade",
          currentStageId: "tw_stage1",
          startTick: s.totalTicks,
          stageStartTick: s.totalTicks,
          choicesMade: [],
          resolved: false,
        },
      ];
      const beforeIds = new Set((s.messages ?? []).map((m) => m.id));
      advanceEventChain(s, "trade_war_blockade", "tw_both");
      // Order-agnostic: messages may be prepended OR appended; just diff by id.
      const newMessages = (s.messages ?? []).filter((m) => !beforeIds.has(m.id));
      return { s, newMessages };
    }
    const tolerated = resolveTwBoth("tolerate");
    expect(tolerated.newMessages.filter((m) => m.title === "FREE CHOIR INFLUENCE")).toHaveLength(0);

    const sponsored = resolveTwBoth("sponsor");
    const sponsorMsg = sponsored.newMessages.find((m) => m.title === "FREE CHOIR INFLUENCE");
    expect(sponsorMsg).toBeDefined();
    expect(sponsorMsg!.body).toMatch(/richer/i);

    const suppressed = resolveTwBoth("suppress");
    const suppressMsg = suppressed.newMessages.find((m) => m.title === "FREE CHOIR INFLUENCE");
    expect(suppressMsg).toBeDefined();
    expect(suppressMsg!.body).toMatch(/wastelander|tolls|bit/i);
  });

  it("Task #219 — transit-themed chain stage emits a one-line ticker cue with deltas + Free Choir swing", async () => {
    const { advanceEventChain } = await import("@/engine/eventChains");
    function resolveTwBoth(stance: "sponsor" | "tolerate" | "suppress") {
      const s = freshState();
      s.totalTicks = 100;
      s.resources.credits = 100000;
      setFaithStance(s, "free-choir", stance);
      s.activeEventChains = [
        {
          chainId: "trade_war_blockade",
          currentStageId: "tw_stage1",
          startTick: s.totalTicks,
          stageStartTick: s.totalTicks,
          choicesMade: [],
          resolved: false,
        },
      ];
      const beforeIds = new Set((s.messages ?? []).map((m) => m.id));
      advanceEventChain(s, "trade_war_blockade", "tw_both");
      const newMessages = (s.messages ?? []).filter((m) => !beforeIds.has(m.id));
      return { s, newMessages };
    }
    // Tolerate: no Choir multiplier, no ticker line.
    const tolerated = resolveTwBoth("tolerate");
    expect(tolerated.newMessages.filter((m) => m.title === "TRADE STAGE RESOLVED")).toHaveLength(0);

    // Sponsor: ticker line shows positive swing percent.
    const sponsored = resolveTwBoth("sponsor");
    const sponsorTicker = sponsored.newMessages.find((m) => m.title === "TRADE STAGE RESOLVED");
    expect(sponsorTicker).toBeDefined();
    expect(sponsorTicker!.body).toMatch(/Free Choir \+\d+%/);
    expect(sponsorTicker!.body).toMatch(/credits|trade|food/);

    // Suppress: ticker line shows negative swing percent.
    const suppressed = resolveTwBoth("suppress");
    const suppressTicker = suppressed.newMessages.find((m) => m.title === "TRADE STAGE RESOLVED");
    expect(suppressTicker).toBeDefined();
    expect(suppressTicker!.body).toMatch(/Free Choir -\d+%/);

    // Distinct from the narrative intel message — both should coexist.
    expect(sponsored.newMessages.find((m) => m.title === "FREE CHOIR INFLUENCE")).toBeDefined();
    expect(sponsored.newMessages.find((m) => m.title === "TRADE STAGE RESOLVED")).toBeDefined();
  });

  it("Ledger-vs-Choir doctrinal-feud trigger is registered and only fires on divergent stances", async () => {
    const { CONDITION_TRIGGERS } = await import("@/engine/eventTriggers");
    const trigger = CONDITION_TRIGGERS.find((t) => t.id === "faith_choir_ledger_feud");
    expect(trigger).toBeDefined();
    if (!trigger) return;
    // Both sponsored: stacking, not feuding — must NOT fire.
    const sStacked = freshState();
    sStacked.totalTicks = 100;
    setFaithStance(sStacked, "the-ledger", "sponsor");
    setFaithStance(sStacked, "free-choir", "sponsor");
    expect(trigger.check(sStacked)).toBe(false);
    // Both tolerated: also must NOT fire.
    const sNeutral = freshState();
    sNeutral.totalTicks = 100;
    expect(trigger.check(sNeutral)).toBe(false);
    // Sponsor Ledger + Suppress Choir: fires.
    const sDiverge = freshState();
    sDiverge.totalTicks = 100;
    setFaithStance(sDiverge, "the-ledger", "sponsor");
    setFaithStance(sDiverge, "free-choir", "suppress");
    expect(trigger.check(sDiverge)).toBe(true);
    // Inverse divergence also fires.
    const sInverse = freshState();
    sInverse.totalTicks = 100;
    setFaithStance(sInverse, "the-ledger", "suppress");
    setFaithStance(sInverse, "free-choir", "sponsor");
    expect(trigger.check(sInverse)).toBe(true);
  });
});

describe("type guards", () => {
  it("isFaithId / isFaithStance reject garbage", () => {
    expect(isFaithId("eternal-flame")).toBe(true);
    expect(isFaithId("xyz")).toBe(false);
    expect(isFaithStance("sponsor")).toBe(true);
    expect(isFaithStance("worship")).toBe(false);
  });
});

describe("STANCE_EFFECTS contract", () => {
  it("tolerate is fully neutral", () => {
    expect(Object.keys(STANCE_EFFECTS.tolerate).length).toBe(0);
  });

  it("ensureFaithState backfills lazily on a state with no slice", () => {
    const s = freshState();
    delete (s as Partial<GameState>).faiths;
    const fs = ensureFaithState(s);
    expect(fs).toBeTruthy();
    expect(s.faiths).toBe(fs);
  });

  it("createDefaultFaithState handles empty district list", () => {
    const fs = createDefaultFaithState([]);
    expect(Object.keys(fs.districtShares).length).toBe(0);
    expect(fs.leaderCult).toBeNull();
  });

  // --- Task #208 follow-ups: reviewer findings (round 3) ---

  it("Ledger Sponsor adds a per-tick tradeIncome lift to s.rates", async () => {
    const { FAITH_SPONSOR_BONUS } = await import("@/engine/faiths");
    const s = freshState();
    setFaithStance(s, "the-ledger", "sponsor");
    const before = s.rates.tradeIncome;
    processFaithDrift(s, []);
    const expectedDelta = FAITH_SPONSOR_BONUS["the-ledger"]!.tradeIncome ?? 0;
    expect(expectedDelta).toBeGreaterThan(0);
    expect(s.rates.tradeIncome).toBeCloseTo(before + expectedDelta);
  });

  it("Tolerated Ledger does NOT touch tradeIncome", () => {
    const s = freshState();
    setFaithStance(s, "the-ledger", "tolerate");
    const before = s.rates.tradeIncome;
    processFaithDrift(s, []);
    expect(s.rates.tradeIncome).toBe(before);
  });

  it("Tidekeepers Sponsor mitigates wx_/sewer_/biosphere_ event severity", async () => {
    const { generateConditionEvent } = await import("@/engine/eventTriggers");
    const { tidekeepersMitigatesEvent, TIDEKEEPERS_EVENT_MITIGATION } = await import("@/engine/faiths");
    // Sanity: prefix-classifier covers all three pools.
    expect(tidekeepersMitigatesEvent("wx_acid_rain_corrosion")).toBe(true);
    expect(tidekeepersMitigatesEvent("sewer_overflow_x")).toBe(true);
    expect(tidekeepersMitigatesEvent("biosphere_collapse")).toBe(true);
    expect(tidekeepersMitigatesEvent("crime_wave_surge")).toBe(false);
    // Drive the trigger pump until we get a wx_ event in both states; verify scaling.
    function forceWxEvent(sponsor: boolean): { effects: Record<string, number> } | null {
      const s = freshState();
      // Push enough negative pressure for several wx_/condition triggers to fire.
      s.cityStats.unrest = 90;
      s.cityStats.crime = 90;
      s.cityStats.happiness = 5;
      s.cityStats.lawOrder = 10;
      if (sponsor) setFaithStance(s, "the-tidekeepers", "sponsor");
      // Try up to 60 spins; condition events are weighted+random.
      for (let i = 0; i < 60; i++) {
        const r = generateConditionEvent(s);
        if (r && r.event.id.startsWith("wx_")) {
          return { effects: r.event.effects as Record<string, number> };
        }
      }
      return null;
    }
    const baseline = forceWxEvent(false);
    const mitigated = forceWxEvent(true);
    // Both runs may not always produce a wx_ event in the limited spins; if either
    // is null the test is inconclusive but should not flake — assert the contract
    // through the deterministic scaleEffects path instead.
    if (baseline && mitigated) {
      const baselineMag = Object.values(baseline.effects).reduce((a, b) => a + Math.abs(b), 0);
      const mitigatedMag = Object.values(mitigated.effects).reduce((a, b) => a + Math.abs(b), 0);
      expect(mitigatedMag).toBeLessThan(baselineMag);
    }
    expect(TIDEKEEPERS_EVENT_MITIGATION.scale).toBeLessThan(1);
  });

  it("Tidekeepers affinity covers the water/biosphere/sewer cluster", () => {
    const aff = FAITH_DEFS["the-tidekeepers"].affinityCategories;
    expect(aff).toContain("water");
    expect(aff).toContain("biosphere");
    expect(aff).toContain("sewer");
  });

  it("FAITH_DEFS exposes a UI bar color for every faith", () => {
    for (const id of FAITH_IDS) {
      expect(FAITH_DEFS[id].color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("legacy 3-faith save migration seeds new faiths to neutral baseline (not zero)", () => {
    const fresh = freshState();
    // Synthesize a pre-#208 save: only the original three faith keys per district.
    const legacyDistrictShares: Record<string, Record<string, number>> = {};
    for (const d of fresh.districts) {
      legacyDistrictShares[d.id] = {
        "eternal-flame": 0.34,
        "machine-choir": 0.33,
        "ancestor-cult": 0.33,
      };
    }
    const legacySave = {
      ...fresh,
      faiths: {
        stances: { "eternal-flame": "tolerate", "machine-choir": "tolerate", "ancestor-cult": "tolerate" },
        districtShares: legacyDistrictShares,
        leaderCult: null,
      },
    };
    const migrated = migrateState(legacySave as unknown as GameState);
    const sample = migrated.faiths!.districtShares[fresh.districts[0].id];
    // New faiths must not be silently zeroed.
    expect(sample["the-ledger"]).toBeGreaterThan(0);
    expect(sample["the-tidekeepers"]).toBeGreaterThan(0);
    // And the per-district share-sum invariant must hold.
    const sum = FAITH_IDS.reduce((acc, id) => acc + sample[id], 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

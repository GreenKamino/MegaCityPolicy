import { compressToUTF16 } from "lz-string";
import { describe, expect, it } from "vitest";

import { checkAchievements } from "@/engine/achievements";
import { createInitialState } from "@/engine/initialState";
import {
  BACKUP_SUFFIX,
  computeChecksum,
  migrateState,
  unwrapSave,
  wrapSave,
} from "@/engine/saveLoad";
import {
  addCompanyQuarantineAdvisory,
  LEGACY_COMPANY_QUARANTINE_ADVISORY_ID,
  sanitizeState,
} from "@/engine/sanitizer";
import { TECH_MAP } from "@/engine/technologies";
import { POLICY_MAP } from "@/engine/policies";
import { RESEARCH_COST_MULTIPLIER } from "@/engine/researchConstants";
import {
  getResearchQueueTechIds,
  getResearchQueueUnlockEstimates,
} from "@/engine/researchBreakdown";
import { runTick } from "@/engine/formulas";
import type { GameState } from "@/engine/types";
import { WARTIME_MASTER_EVENTS } from "@/engine/wartimeEventPack";

// These tests guard the slot-load pipeline against any save shape that could
// crash a returning player: corrupted envelopes, tampered checksums, legacy
// schemas missing whole subsystems, garbage in places that used to be safe.
// Anything that passes through unwrapSave -> JSON.parse -> migrateState ->
// sanitizeState must either be rejected cleanly (valid: false), produce a
// fully-shaped GameState, or — for a checksum mismatch over an intact JSON
// payload (the hand-edited-save signature) — load with valid: true and the
// integrityCompromised flag baked in. Never throw.

const wrapV1 = (json: string) =>
  JSON.stringify({ v: 1, checksum: computeChecksum(json), data: json });

describe("saveLoad constants", () => {
  it("BACKUP_SUFFIX is the literal the loader looks for in AsyncStorage", () => {
    expect(BACKUP_SUFFIX).toBe("_backup");
  });
});

describe("unwrapSave envelope handling", () => {
  it("treats raw JSON (pre-envelope era) as valid for back-compat", () => {
    const raw = JSON.stringify({ cityName: "OLD" });
    const out = unwrapSave(raw);
    expect(out.valid).toBe(true);
    expect(out.json).toBe(raw);
  });

  it("round-trips a v=2 wrapped save and reports valid", () => {
    const inner = JSON.stringify({ cityName: "MEGACITY", totalTicks: 42 });
    const wrapped = wrapSave(inner);
    const out = unwrapSave(wrapped);
    expect(out.valid).toBe(true);
    expect(out.json).toBe(inner);
  });

  it("round-trips a v=1 wrapped save (legacy uncompressed envelope)", () => {
    const inner = JSON.stringify({ cityName: "LEGACY" });
    const wrapped = wrapV1(inner);
    const out = unwrapSave(wrapped);
    expect(out.valid).toBe(true);
    expect(out.json).toBe(inner);
  });

  it("loads a v=2 envelope whose checksum was tampered with, flagged as compromised", () => {
    // Intact JSON + wrong checksum = hand-edited save. It must still load
    // (valid: true) so the player keeps their game, but with the silent
    // integrityCompromised mark that stops future achievements.
    const inner = JSON.stringify({ cityName: "MEGACITY" });
    const wrapped = wrapSave(inner);
    const parsed = JSON.parse(wrapped);
    parsed.checksum = "deadbeef";
    const out = unwrapSave(JSON.stringify(parsed));
    expect(out.valid).toBe(true);
    const state = JSON.parse(out.json);
    expect(state.cityName).toBe("MEGACITY");
    expect(state.integrityCompromised).toBe(true);
  });

  it("rejects a v=2 envelope whose compressed payload is corrupted", () => {
    const inner = JSON.stringify({ cityName: "MEGACITY" });
    const wrapped = wrapSave(inner);
    const parsed = JSON.parse(wrapped);
    parsed.data = "garbage that will not decompress";
    const out = unwrapSave(JSON.stringify(parsed));
    expect(out.valid).toBe(false);
  });

  it("loads a v=1 envelope whose checksum was tampered with, flagged as compromised", () => {
    const inner = JSON.stringify({ cityName: "LEGACY" });
    const wrapped = wrapV1(inner);
    const parsed = JSON.parse(wrapped);
    parsed.checksum = "0";
    const out = unwrapSave(JSON.stringify(parsed));
    expect(out.valid).toBe(true);
    const state = JSON.parse(out.json);
    expect(state.cityName).toBe("LEGACY");
    expect(state.integrityCompromised).toBe(true);
  });

  it("loads a v=2 envelope whose PAYLOAD was edited without fixing the checksum, flagged as compromised", () => {
    // The realistic tamper path: decompress, edit a value, recompress —
    // leaving the original checksum stale.
    const inner = JSON.stringify({ cityName: "MEGACITY", credits: 100 });
    const wrapped = wrapSave(inner);
    const parsed = JSON.parse(wrapped);
    const edited = JSON.stringify({ cityName: "MEGACITY", credits: 999999999 });
    parsed.data = compressToUTF16(edited);
    const out = unwrapSave(JSON.stringify(parsed));
    expect(out.valid).toBe(true);
    const state = JSON.parse(out.json);
    expect(state.credits).toBe(999999999);
    expect(state.integrityCompromised).toBe(true);
  });

  it("still rejects a checksum mismatch whose payload is NOT intact JSON (true corruption)", () => {
    const evil = JSON.stringify({ v: 1, checksum: "0", data: "{ not json" });
    const out = unwrapSave(evil);
    expect(out.valid).toBe(false);
  });

  it("integrityCompromised survives migrateState and re-save (mark is permanent)", () => {
    const state = { ...createInitialState(), integrityCompromised: true };
    const migrated = migrateState(state as GameState);
    expect(migrated.integrityCompromised).toBe(true);
    // Round-trip through a normal re-save: the flag is part of the state, so
    // the fresh (now checksum-valid) envelope still carries it.
    const out = unwrapSave(wrapSave(JSON.stringify(migrated)));
    expect(out.valid).toBe(true);
    expect(JSON.parse(out.json).integrityCompromised).toBe(true);
  });

  it("a compromised save earns no new achievements; the same save unflagged does", () => {
    const state = createInitialState();
    // lastSeenVersion satisfies the changelog_seen achievement check.
    state.lastSeenVersion = "1.0.0";
    expect(checkAchievements(state).length).toBeGreaterThan(0);
    const flagged = { ...state, integrityCompromised: true };
    expect(checkAchievements(flagged)).toEqual([]);
  });

  it("rejects entirely non-JSON storage contents without throwing", () => {
    const out = unwrapSave("\u0000\uffff not json at all }}}");
    expect(out.valid).toBe(false);
  });

  it("rejects an envelope with a non-string data field", () => {
    const evil = JSON.stringify({ v: 2, checksum: "x", data: { nested: true } });
    const out = unwrapSave(evil);
    // Falls through to the "raw JSON is valid" branch because data isn't a
    // string, so the loader will hand it to JSON.parse downstream — which is
    // fine, the migrate/sanitize stages will reject the shape.
    expect(out.valid).toBe(true);
  });

  it("treats an unknown envelope version as raw JSON (forward-compat)", () => {
    const evil = JSON.stringify({ v: 99, checksum: "x", data: "abc" });
    const out = unwrapSave(evil);
    expect(out.valid).toBe(true);
    expect(out.json).toBe(evil);
  });

  it("survives an empty-string AsyncStorage entry", () => {
    const out = unwrapSave("");
    expect(out.valid).toBe(false);
  });
});

describe("migrateState legacy schema handling", () => {
  it("rewrites retired names embedded in legacy world-intel records", () => {
    const fresh = createInitialState();
    const legacy = {
      ...fresh,
      worldEventLog: [{
        tick: 12,
        event: "legacy-mexico-city-discovery",
        type: "discovery",
        timestamp: 12,
        title: "Legacy Dusthaven settlement record",
        description: "Dusthaven remains in the archived dispatch description.",
        revealed: "dusthaven",
      }],
    } as GameState;

    const out = migrateState(legacy);
    expect(out.worldEventLog[0]).toMatchObject({
      title: "Legacy Mexico City settlement record",
      description: "Mexico City remains in the archived dispatch description.",
      revealed: "dusthaven",
    });
  });

  it("migrates legacy building keys into their current names", () => {
    const fresh = createInitialState();
    const legacy: GameState = {
      ...fresh,
      buildings: { ...fresh.buildings, housingBlocks: 7, powerPlants: 3 } as any,
    };
    const out = migrateState(legacy);
    expect((out.buildings as any).housingBlocks).toBeUndefined();
    expect((out.buildings as any).powerPlants).toBeUndefined();
    expect(out.buildings.habBlockMegaTowers).toBeGreaterThanOrEqual(7);
    expect(out.buildings.solarTowerFields).toBeGreaterThanOrEqual(3);
  });

  it("adds legacy unit counts onto their renamed counterparts", () => {
    const fresh = createInitialState();
    const baseline = fresh.units.patrolJudges;
    const legacy: GameState = {
      ...fresh,
      units: { ...fresh.units, patrolUnits: 5 } as any,
    };
    const out = migrateState(legacy);
    expect((out.units as any).patrolUnits).toBeUndefined();
    expect(out.units.patrolJudges).toBe(baseline + 5);
  });

  it("backfills cityStats fields that did not exist in older schemas", () => {
    const fresh = createInitialState();
    const stripped = { ...fresh.cityStats } as Record<string, number | undefined>;
    delete stripped.defenseRating;
    delete stripped.education;
    delete stripped.publicHealth;
    delete stripped.biosphere;
    delete stripped.diseaseRisk;
    delete stripped.upliftPopulation;
    const legacy = { ...fresh, cityStats: stripped } as unknown as GameState;
    const out = migrateState(legacy);
    expect(out.cityStats.defenseRating).toBe(55);
    expect(out.cityStats.education).toBe(35);
    expect(out.cityStats.publicHealth).toBe(40);
    expect(out.cityStats.biosphere).toBe(20);
    expect(out.cityStats.diseaseRisk).toBe(45);
    expect(out.cityStats.upliftPopulation).toBe(0);
  });

  it("bounds corrupted external and township relationship scores without losing valid state", () => {
    const legacy = structuredClone(createInitialState());
    const megacity = legacy.externalMegacities.find((city) => city.id === "terminus-prime");
    const township = (legacy.townships ?? []).find((candidate) => candidate.id !== "dusthaven");
    expect(megacity).toBeDefined();
    expect(township).toBeDefined();

    megacity!.influence = 17;
    megacity!.loyalty = 23;
    megacity!.threat = 41;
    megacity!.cityHealth = null as any;
    megacity!.attrition = "corrupted" as any;
    megacity!.controlStatus = "annexed";

    township!.influence = Number.POSITIVE_INFINITY;
    township!.loyalty = -12;
    township!.threat = 999;
    township!.cityHealth = -4;
    township!.attrition = Number.NaN;
    township!.status = "allied";

    const migrated = migrateState(legacy);
    const repairedMegacity = migrated.externalMegacities.find((city) => city.id === megacity!.id);
    const repairedTownship = (migrated.townships ?? []).find((candidate) => candidate.id === township!.id);
    expect(repairedMegacity).toMatchObject({
      influence: 17,
      loyalty: 23,
      threat: 41,
      controlStatus: "annexed",
    });
    expect(repairedTownship).toMatchObject({ status: "allied" });

    for (const entity of [repairedMegacity, repairedTownship]) {
      for (const field of ["influence", "loyalty", "threat", "cityHealth", "attrition"] as const) {
        const value = entity?.[field];
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
    expect(repairedMegacity?.cityHealth).toBe(100);
    expect(repairedMegacity?.attrition).toBe(0);
    expect(repairedTownship?.influence).toBe(
      createInitialState().townships?.find((candidate) => candidate.id === township!.id)?.influence,
    );
    expect(repairedTownship?.loyalty).toBe(0);
    expect(repairedTownship?.threat).toBe(100);
    expect(repairedTownship?.cityHealth).toBe(0);
    expect(repairedTownship?.attrition).toBe(0);
  });

  it("rewrites every legacy player title onto the canonical 'City Commander'", () => {
    const fresh = createInitialState();
    for (const legacyTitle of ["Sector Commander", "Sector Marshal", "Chief Judge"]) {
      const out = migrateState({
        ...fresh,
        player: { ...fresh.player, title: legacyTitle as any },
        playerTitle: legacyTitle as any,
      });
      expect(out.player.title).toBe("City Commander");
      expect(out.playerTitle).toBe("City Commander");
    }
  });

  it("rewrites the legacy 'verdant-enclave' starting region preset", () => {
    const fresh = createInitialState();
    const out = migrateState({ ...fresh, startingRegion: "verdant-enclave" as any });
    expect(out.startingRegion).toBe("region-verdant-enclave");
  });

  it("falls back to 'city-core' when startingRegion is missing", () => {
    const fresh = createInitialState();
    const stripped = { ...fresh } as Record<string, unknown>;
    delete stripped.startingRegion;
    const out = migrateState(stripped as GameState);
    expect(out.startingRegion).toBe("city-core");
  });

  it("backfills missing player fields without mutating valid ones", () => {
    const fresh = createInitialState();
    const partial = { ...fresh.player } as Record<string, unknown>;
    delete partial.age;
    delete partial.sex;
    delete partial.augmentationSlots;
    const out = migrateState({ ...fresh, player: partial as any });
    expect(out.player.age).toBe(35);
    expect(out.player.sex).toBe("male");
    expect(out.player.augmentationSlots).toBeTruthy();
  });

  it("drops unknown technology IDs from unlockedTechnologies and queue", () => {
    const fresh = createInitialState();
    const out = migrateState({
      ...fresh,
      unlockedTechnologies: ["definitely-not-a-real-tech", "another-fake"] as any,
      researchQueue: ["another-fake"] as any,
    });
    expect(out.unlockedTechnologies).toEqual([]);
    expect(out.researchQueue).toEqual([]);
  });

  it("dedupes repeated unlockedTechnologies entries", () => {
    const fresh = createInitialState();
    const known = Object.keys(TECH_MAP)[0];
    expect(known).toBeTruthy();
    const out = migrateState({
      ...fresh,
      unlockedTechnologies: [known, known, known] as any,
    });
    expect(out.unlockedTechnologies).toEqual([known]);
  });

  it.each([
    ["null", null],
    ["object", { id: "not-an-array" }],
    ["string", "not-an-array"],
    ["number", 42],
  ])("normalizes %s technology and policy collection shapes before array consumers", (_label, malformed) => {
    const fresh = createInitialState();
    const out = migrateState({
      ...fresh,
      unlockedTechnologies: malformed as any,
      researchQueue: malformed as any,
      activePolicies: malformed as any,
    });
    expect(out.unlockedTechnologies).toEqual([]);
    expect(out.researchQueue).toEqual([]);
    expect(out.activePolicies).toEqual([]);
  });

  it("normalizes known IDs, preserving queue order while removing duplicate and unknown entries", () => {
    const fresh = createInitialState();
    const [firstTech, secondTech] = Object.keys(TECH_MAP);
    const [firstPolicy, secondPolicy] = Object.keys(POLICY_MAP);
    const out = migrateState({
      ...fresh,
      unlockedTechnologies: [secondTech, "unknown", "toString", firstTech, secondTech, 99] as any,
      researchQueue: [secondTech, "unknown", "toString", firstTech, secondTech, null] as any,
      activePolicies: [secondPolicy, "unknown", "toString", firstPolicy, secondPolicy, {}] as any,
    });
    expect(out.unlockedTechnologies).toEqual([secondTech, firstTech]);
    expect(out.researchQueue).toEqual([secondTech, firstTech]);
    expect(out.activePolicies).toEqual([secondPolicy, firstPolicy]);
  });

  it("normalizes a malformed research queue before deriving its screen ETAs", () => {
    const fresh = createInitialState();
    const [firstTech, secondTech] = Object.keys(TECH_MAP);
    const migrated = migrateState({
      ...fresh,
      researchQueue: [
        secondTech,
        "legacy-removed-tech",
        secondTech,
        null,
        firstTech,
        "toString",
      ] as any,
    });
    const queueTechIds = getResearchQueueTechIds(migrated.researchQueue);
    const costs = queueTechIds.map(
      (id) => TECH_MAP[id].researchCost * RESEARCH_COST_MULTIPLIER,
    );
    const estimates = getResearchQueueUnlockEstimates(costs, 25, 5, 3);

    expect(queueTechIds).toEqual([secondTech, firstTech]);
    expect(costs).toHaveLength(2);
    expect(estimates).toHaveLength(2);
    expect(estimates[0]?.ticksRemaining).toBe(Math.ceil(costs[0] / 25) + 3);
    expect(estimates[1]?.ticksRemaining).toBe(
      Math.ceil(costs[0] / 25) + Math.ceil(costs[1] / 25) + 3,
    );
    expect(estimates.every((estimate) =>
      estimate.ticksRemaining !== null &&
      estimate.minutesRemaining !== null &&
      Number.isFinite(estimate.ticksRemaining) &&
      Number.isFinite(estimate.minutesRemaining),
    )).toBe(true);
  });

  it.each([
    ["null", null, null],
    ["primitive", "bad-shape", null],
    ["unknown technology", { techId: "unknown", progress: 20, cost: 100 }, null],
    ["invalid numbers", { techId: Object.keys(TECH_MAP)[0], progress: Infinity, cost: -1 }, { progress: 0 }],
  ])("normalizes malformed activeResearch %s", (_label, activeResearch, expected) => {
    const fresh = createInitialState();
    const out = migrateState({ ...fresh, activeResearch: activeResearch as any });
    if (expected === null) {
      expect(out.activeResearch).toBeNull();
    } else {
      expect(out.activeResearch).toMatchObject(expected);
      expect(Number.isFinite(out.activeResearch!.cost)).toBe(true);
      expect(out.activeResearch!.cost).toBeGreaterThan(0);
    }
  });

  it("migrates legacy research progress to its canonical current technology cost", () => {
    const fresh = createInitialState();
    const techId = Object.keys(TECH_MAP)[0];
    const tech = TECH_MAP[techId];
    const out = migrateState({
      ...fresh,
      activeResearch: { techId, progress: 25, cost: 100 },
    });
    expect(out.activeResearch).toEqual({
      techId,
      progress: Math.floor(0.25 * tech.researchCost * RESEARCH_COST_MULTIPLIER),
      cost: tech.researchCost * RESEARCH_COST_MULTIPLIER,
    });
  });

  it("keeps normalized research and policy data through a save round-trip", () => {
    const fresh = createInitialState();
    const [techId] = Object.keys(TECH_MAP);
    const [policyId] = Object.keys(POLICY_MAP);
    const migrated = migrateState({
      ...fresh,
      unlockedTechnologies: [techId, techId] as any,
      researchQueue: [techId, techId] as any,
      activeResearch: { techId, progress: 20, cost: 100 },
      activePolicies: [policyId, policyId] as any,
    });
    const loaded = migrateState(JSON.parse(unwrapSave(wrapSave(JSON.stringify(migrated))).json));
    expect(loaded.unlockedTechnologies).toEqual([techId]);
    expect(loaded.researchQueue).toEqual([techId]);
    expect(loaded.activePolicies).toEqual([policyId]);
    expect(loaded.activeResearch).toEqual(migrated.activeResearch);
  });

  it("does not throw when buildings is missing entirely", () => {
    const fresh = createInitialState();
    const stripped = { ...fresh } as Record<string, unknown>;
    delete stripped.buildings;
    expect(() => migrateState(stripped as GameState)).not.toThrow();
    const out = migrateState(stripped as GameState);
    // All fresh defaults must be present so downstream code never hits undefined.
    expect(Object.keys(out.buildings).length).toBe(Object.keys(fresh.buildings).length);
  });

  it("does not throw when buildings/units are non-object garbage", () => {
    const fresh = createInitialState();
    const garbage = { ...fresh, buildings: 42 as any, units: "lolwut" as any };
    expect(() => migrateState(garbage)).not.toThrow();
    const out = migrateState(garbage);
    expect(Object.keys(out.buildings).length).toBe(Object.keys(fresh.buildings).length);
    expect(Object.keys(out.units).length).toBe(Object.keys(fresh.units).length);
  });

  it("does not throw when cityStats is missing or non-object", () => {
    const fresh = createInitialState();
    const a = { ...fresh } as Record<string, unknown>;
    delete a.cityStats;
    expect(() => migrateState(a as GameState)).not.toThrow();
    const out1 = migrateState(a as GameState);
    expect(out1.cityStats.defenseRating).toBe(55);

    const b = { ...fresh, cityStats: null as any };
    expect(() => migrateState(b)).not.toThrow();
    const out2 = migrateState(b);
    expect(out2.cityStats.defenseRating).toBe(55);
    expect(out2.cityStats.education).toBe(35);
  });

  it("quarantines a loaded company whose district was removed without relocating it", () => {
    const fresh = createInitialState();
    const knownDistrict = fresh.districts[0];
    const malformed = {
      ...fresh,
      companies: [
        {
          companyId: "helios-grid",
          districtId: "district-deleted-by-legacy-edit",
          licenseDate: 22,
        },
        {
          companyId: "aurora-solar",
          districtId: knownDistrict.id,
          licenseDate: 23,
        },
      ],
    };

    const loaded = sanitizeState(migrateState(malformed));

    expect(loaded.companies).toEqual([
      {
        companyId: "helios-grid",
        districtId: "district-deleted-by-legacy-edit",
        licenseDate: 22,
        status: "quarantined",
        quarantineReason: "unknown_district",
      },
      {
        companyId: "aurora-solar",
        districtId: knownDistrict.id,
        licenseDate: 23,
      },
    ]);
    expect(loaded.districts).toEqual(fresh.districts);
    expect(loaded.resources).toEqual(fresh.resources);
  });

  it("adds one load advisory for quarantined licenses and replaces duplicates", () => {
    const fresh = createInitialState();
    const quarantined = sanitizeState(
      migrateState({
        ...fresh,
        companies: [
          {
            companyId: "helios-grid",
            districtId: "district-deleted-by-legacy-edit",
            licenseDate: 22,
          },
          {
            companyId: "aurora-solar",
            districtId: "another-deleted-district",
            licenseDate: 23,
          },
        ],
      }),
    );

    const first = addCompanyQuarantineAdvisory(quarantined);
    const advisory = first.messages.find(
      (message) => message.id === LEGACY_COMPANY_QUARANTINE_ADVISORY_ID,
    );
    expect(advisory).toBeDefined();
    expect(advisory?.body).toContain("2 legacy company licenses");
    expect(advisory?.body).toContain("No district was invented or reassigned.");
    expect(advisory?.body).toContain("Commercial Licensing");
    expect(
      first.messages.filter(
        (message) => message.id === LEGACY_COMPANY_QUARANTINE_ADVISORY_ID,
      ),
    ).toHaveLength(1);

    const second = addCompanyQuarantineAdvisory(first);
    expect(
      second.messages.filter(
        (message) => message.id === LEGACY_COMPANY_QUARANTINE_ADVISORY_ID,
      ),
    ).toHaveLength(1);
    expect(second.companies).toEqual(first.companies);
  });

  it("does not add a quarantine advisory when all company districts are valid", () => {
    const fresh = createInitialState();
    const loaded = addCompanyQuarantineAdvisory(sanitizeState(fresh));

    expect(loaded).toEqual(sanitizeState(fresh));
    expect(
      loaded.messages.some(
        (message) => message.id === LEGACY_COMPANY_QUARANTINE_ADVISORY_ID,
      ),
    ).toBe(false);
  });

  it("filters trade agreements / joint projects / pacts that lack id or status", () => {
    const fresh = createInitialState();
    const out = migrateState({
      ...fresh,
      tradeAgreements: [{ id: "good", status: "active" }, { id: "" }, null, { status: "x" }] as any,
      jointProjects: [{ id: "good", status: "open" }, undefined, { id: "missing-status" }] as any,
      diplomaticPacts: [{ id: "good", status: "signed" }, {}, "string"] as any,
    });
    expect(out.tradeAgreements).toEqual([{ id: "good", status: "active" }]);
    expect(out.jointProjects).toEqual([{ id: "good", status: "open" }]);
    expect(out.diplomaticPacts).toEqual([{ id: "good", status: "signed" }]);
  });

  it("backfills entire optional subsystems when a save predates them", () => {
    const fresh = createInitialState();
    const stripped = { ...fresh } as Record<string, unknown>;
    delete stripped.companies;
    delete stripped.activeContracts;
    delete stripped.completedContracts;
    delete stripped.contractCapacity;
    delete stripped.procurementPolicies;
    delete stripped.activeEdicts;
    delete stripped.edictCooldowns;
    delete stripped.personalActionCooldowns;
    delete stripped.tickIntervalMinutes;
    delete stripped.activeEvents;
    delete stripped.eventHistory;
    delete stripped.dailyStreak;
    delete stripped.discoveredLocationIds;
    delete stripped.worldEventLog;
    delete stripped.locationRelations;
    delete stripped.eventTriggerCooldowns;
    delete stripped.strikeHistory;
    delete stripped.savedLoadouts;
    const out = migrateState(stripped as GameState);
    expect(out.companies).toEqual([]);
    expect(out.activeContracts).toEqual([]);
    expect(out.completedContracts).toEqual([]);
    expect(out.contractCapacity).toBe(5);
    expect(out.procurementPolicies).toBeTruthy();
    expect(out.activeEdicts).toEqual([]);
    expect(out.edictCooldowns).toEqual({});
    expect(out.personalActionCooldowns).toEqual({});
    expect(out.personalActionHistory).toEqual({});
    expect(out.tickIntervalMinutes).toBe(15);
    expect(out.activeEvents).toEqual([]);
    expect(out.eventHistory).toEqual([]);
    expect(out.dailyStreak).toEqual({
      current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null,
    });
    expect(out.discoveredLocationIds).toEqual([]);
    expect(out.worldEventLog).toEqual([]);
    expect(out.locationRelations).toEqual({});
    expect(out.eventTriggerCooldowns).toEqual({});
    expect(out.strikeHistory).toEqual([]);
    expect(out.savedLoadouts).toEqual({});
  });

  it("caps oversized discoveredLocationIds keeping the most recent entries (Task #494)", () => {
    // Mirror the real load path: GameContext always runs
    // sanitizeState(migrateState(...)). The cap lives in sanitizeState.
    const fresh = createInitialState();
    const oversized = Array.from({ length: 400 }, (_, i) => `loc_${i}`);
    const out = sanitizeState(migrateState({
      ...fresh,
      discoveredLocationIds: [...oversized, "loc_5", 42, null, "loc_5"] as any,
    }));
    // Deduped (loc_5 kept at first occurrence), non-strings dropped, then
    // capped to the 300 most recently discovered (list appends at the end).
    expect(out.discoveredLocationIds.length).toBe(300);
    expect(out.discoveredLocationIds[0]).toBe("loc_100");
    expect(out.discoveredLocationIds[299]).toBe("loc_399");
    expect(new Set(out.discoveredLocationIds).size).toBe(300);
    // Within-cap lists pass through untouched.
    const small = sanitizeState(migrateState({ ...fresh, discoveredLocationIds: ["a", "b", "c"] }));
    expect(small.discoveredLocationIds).toEqual(["a", "b", "c"]);
  });

  it("merges saved factions with fresh-default factions so new ones appear", () => {
    const fresh = createInitialState();
    if (fresh.factions.length === 0) return; // no factions in defaults; skip
    const onlyFirst = [{ ...fresh.factions[0] }];
    const out = migrateState({ ...fresh, factions: onlyFirst as any });
    // First faction preserved
    expect(out.factions.find((f) => f.id === fresh.factions[0].id)).toBeTruthy();
    // Newer factions get appended
    for (const ff of fresh.factions) {
      expect(out.factions.find((f) => f.id === ff.id)).toBeTruthy();
    }
  });

  it("falls back to fresh districts/officers when saved arrays drifted in length", () => {
    const fresh = createInitialState();
    const out = migrateState({
      ...fresh,
      districts: fresh.districts.slice(0, 1) as any,
      officers: fresh.officers.slice(0, 1) as any,
    });
    expect(out.districts.length).toBe(fresh.districts.length);
    expect(out.officers.length).toBe(fresh.officers.length);
  });

  it("discards malformed or unknown war-event occurrence entries without touching valid budgets", () => {
    const fresh = createInitialState();
    const [knownFaction] = fresh.factions;
    const knownEvent = WARTIME_MASTER_EVENTS[0].id;
    const unknownEvent = "war_evt_not_in_the_pack";

    const out = sanitizeState(migrateState({
      ...fresh,
      warEventOccurrences: {
        [knownFaction.id]: {
          [knownEvent]: 3,
          [unknownEvent]: 2,
          "": 1,
          malformedCount: "three",
          negativeCount: -4,
        },
        unknown_faction: { [knownEvent]: 4 },
        invalid_counts_shape: ["not", "a", "record"],
      } as any,
    }));

    expect(out.warEventOccurrences).toEqual({
      [knownFaction.id]: { [knownEvent]: 3 },
    });
  });

  it("does not throw when given a barely-shaped state with only the three required keys", () => {
    const fresh = createInitialState();
    const minimal = {
      buildings: {},
      units: {},
      cityStats: fresh.cityStats,
    } as unknown as GameState;
    expect(() => migrateState(minimal)).not.toThrow();
  });
});

describe("end-to-end malformed-save resilience", () => {
  it("a wrap -> tamper -> unwrap cycle reports invalid before any parse runs", () => {
    const inner = JSON.stringify({ cityName: "MEGACITY" });
    const wrapped = wrapSave(inner);
    const tampered = wrapped.slice(0, -3) + "ZZ\"";
    const out = unwrapSave(tampered);
    expect(out.valid).toBe(false);
  });

  it("a fresh save round-trips wrap -> unwrap -> migrate -> sanitize without throwing", () => {
    const fresh = createInitialState();
    const wrapped = wrapSave(JSON.stringify(fresh));
    const { json, valid } = unwrapSave(wrapped);
    expect(valid).toBe(true);
    const parsed = JSON.parse(json) as GameState;
    expect(() => sanitizeState(migrateState(parsed))).not.toThrow();
  });

  it("a legacy save with only buildings/units/cityStats migrates and sanitizes cleanly", () => {
    const fresh = createInitialState();
    const ancient = {
      buildings: { housingBlocks: 4, powerPlants: 2 },
      units: { patrolUnits: 3 },
      cityStats: fresh.cityStats,
    } as unknown as GameState;
    const migrated = migrateState(ancient);
    expect(() => sanitizeState(migrated)).not.toThrow();
    expect(migrated.buildings.habBlockMegaTowers).toBeGreaterThanOrEqual(4);
    expect(migrated.units.patrolJudges).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ["arrays replaced by primitives", "bad", { techId: "fake", progress: Infinity, cost: 0 }, { bad: true }],
    ["arrays replaced by null", null, null, null],
    ["arrays containing invalid IDs", ["fake", 42, null], { techId: "fake", progress: 1, cost: 1 }, ["fake", {}]],
  ])("a malformed research/policy save survives its first tick: %s", (_label, ids, activeResearch, policies) => {
    const fresh = createInitialState();
    const loaded = sanitizeState(migrateState({
      ...fresh,
      unlockedTechnologies: ids as any,
      researchQueue: ids as any,
      activeResearch: activeResearch as any,
      activePolicies: policies as any,
    }));
    expect(() => runTick(loaded)).not.toThrow();
    expect(loaded.unlockedTechnologies).toEqual([]);
    expect(loaded.researchQueue).toEqual([]);
    expect(loaded.activeResearch).toBeNull();
    expect(loaded.activePolicies).toEqual([]);
  });
});

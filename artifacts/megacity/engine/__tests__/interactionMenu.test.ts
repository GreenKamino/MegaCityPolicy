import { describe, expect, it } from "vitest";
import {
  PERSONAL_ACTIONS,
  PERSONAL_ACTION_ORDER,
  PERSONAL_DISTRICT_ACTION_ORDER,
  getPersonalActionEffect,
  formatEffectDeltas,
  formatPersonalActionSubtitle,
  affordabilityReason,
  evaluatePersonalAction,
  personalCooldownKey,
  personalCooldownRemaining,
  stampPersonalCooldown,
  personalActionDecayMultiplier,
  stampPersonalActionHistory,
  stampDistrictCommandHistory,
  DISTRICT_COMMAND_HISTORY_CAP,
  PERSONAL_ACTION_DECAY_WINDOW_TICKS,
  FACTION_DIPLOMACY_COOLDOWNS,
  factionDiplomacyCooldownKey,
  factionDiplomacyCooldownRemaining,
  factionDiplomacyCooldownReason,
  stampFactionDiplomacyCooldown,
  applyPersonalInteraction,
  districtPrerequisiteReason,
  getDistrictUnderworldHeat,
  type PersonalActionId,
  type PersonalInteractionTarget,
  type DistrictConditionField,
} from "../interactionMenu";
import { createInitialState } from "../initialState";
import { runTick } from "../formulas";
import { createDefaultRetinueState } from "../retinueData";
import { runOfflineCatchup } from "../offlineCatchup";
import { migrateState, unwrapSave, wrapSave, writeSlotSave } from "../saveLoad";
import { sanitizeState } from "../sanitizer";
import type { GameState } from "../types";
import {
  EVENT_ONLY_ACTION_RULES,
  type DiplomaticActionEffects,
  type EventOnlyActionId,
} from "../diplomacyEngine";

// The unified-menu personal-action catalog (Task #382). These guards keep the
// catalog internally consistent and lock in the pure formatting / eligibility
// helpers that both the Factions and Character screens depend on.

describe("PERSONAL_ACTIONS catalog", () => {
  const ids = Object.keys(PERSONAL_ACTIONS) as PersonalActionId[];

  it("declares a definition for every ordered id and vice versa", () => {
    expect([...PERSONAL_ACTION_ORDER].sort()).toEqual([...ids].sort());
  });

  it("each id matches its key and has label / description / effects", () => {
    for (const id of ids) {
      const def = PERSONAL_ACTIONS[id];
      expect(def.id).toBe(id);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.cost).toBeGreaterThanOrEqual(0);
      // Each verb must actually move at least one relationship field on at
      // least one target kind — otherwise it is a silent no-op in the reducer.
      const factionMoves = Object.values(def.faction).some((v) => v !== 0);
      const officerMoves = Object.values(def.officer).some((v) => v !== 0);
      const populationMoves = Object.values(def.population).some((v) => v !== 0);
      const districtMoves = Object.values(def.district ?? {}).some((v) => v !== 0);
      expect(factionMoves || officerMoves || populationMoves || districtMoves).toBe(true);
    }
  });

  it("only spends credits on the paid verbs (gift / bribe)", () => {
    for (const id of ids) {
      const def = PERSONAL_ACTIONS[id];
      if (["give-gift", "bribe", "share-secrets", "bind-by-debt", "ration-and-reassure", "surveillance-sweep", "declare-amnesty", "population-transfer-orders", "district-reassure", "district-lay-low", "district-surveil", "district-pardon"].includes(id)) {
        expect(def.cost).toBeGreaterThan(0);
      } else {
        expect(def.cost).toBe(0);
      }
    }
  });

  it("derives underworld heat from the stronger local pressure source", () => {
    const base = { crime: 0, gangInfluence: 0 };
    expect(getDistrictUnderworldHeat(base)).toMatchObject({
      band: "quiet",
      label: "Quiet",
      score: 0,
    });
    expect(getDistrictUnderworldHeat({ crime: 29, gangInfluence: 30 })).toMatchObject({
      band: "watched",
      label: "Watched",
      score: 30,
    });
    expect(getDistrictUnderworldHeat({ crime: 60, gangInfluence: 12 })).toMatchObject({
      band: "burning",
      label: "Burning",
      score: 60,
    });
  });

  it("updates the derived heat band after the shared live tick changes gang influence", () => {
    const base = createInitialState();
    const districtId = base.districts[0].id;
    const before = {
      ...base,
      hasCompletedOnboarding: true,
      totalTicks: 120,
      tickPaused: false,
      policies: { ...base.policies, gangsPatrolled: true },
      activeEvents: [],
      eventHistory: [],
      messages: [],
      newsFeed: [],
      calmStartTicks: Number.MAX_SAFE_INTEGER,
      districts: base.districts.map((district) =>
        district.id === districtId
          ? { ...district, crime: 20, gangInfluence: 30, infraQuality: 50 }
          : district,
      ),
    };

    expect(getDistrictUnderworldHeat(before.districts[0])).toMatchObject({
      band: "watched",
      score: 30,
    });
    const after = runTick(before).newState;
    const updated = after.districts.find((district) => district.id === districtId)!;
    expect(updated.gangInfluence).toBeLessThan(30);
    expect(getDistrictUnderworldHeat(updated).band).toBe("quiet");
  });

  it("every verb carries a positive per-target cooldown (Task #393)", () => {
    // Without this, a free verb (flatter / grant-favor / threaten) could be
    // spammed to push a target straight to 100 loyalty.
    for (const id of ids) {
      expect(PERSONAL_ACTIONS[id].cooldownTicks).toBeGreaterThan(0);
    }
  });

  it("keeps every district gate's current-value explanation aligned with the catalog", () => {
    const conditionLabels: Record<DistrictConditionField, string> = {
      crime: "crime",
      unrest: "unrest",
      loyalty: "loyalty",
      infraQuality: "infrastructure",
      gangInfluence: "gang influence",
      wealth: "wealth",
    };
    const baseDistrict = createInitialState().districts[0];

    for (const id of PERSONAL_DISTRICT_ACTION_ORDER) {
      const definition = PERSONAL_ACTIONS[id];
      const prerequisite = definition.districtPrerequisite;
      expect(
        prerequisite,
        `${definition.label} (${id}) is missing its district prerequisite definition`,
      ).toBeDefined();

      const blockedDistrict = { ...baseDistrict };
      for (const group of prerequisite?.groups ?? []) {
        for (const condition of group.conditions) {
          blockedDistrict[condition.field] =
            condition.operator === "atLeast"
              ? condition.value - 1
              : condition.value + 1;
        }
      }

      const reason = districtPrerequisiteReason(id, blockedDistrict);
      expect(
        reason,
        `${definition.label} (${id}) is missing its blocker reason`,
      ).toBeTruthy();
      for (const group of prerequisite?.groups ?? []) {
        for (const condition of group.conditions) {
          const current = Math.round(blockedDistrict[condition.field]);
          expect(
            reason,
            `${definition.label} (${id}) is missing the current value for ${conditionLabels[condition.field]}: ${reason ?? "(no reason)"}`,
          ).toContain(`${conditionLabels[condition.field]} ${current}`);
        }
      }
    }
  });

  it("free verbs cool down at least as long as paid ones", () => {
    const actorIds = ids.filter((id) => Object.values(PERSONAL_ACTIONS[id].faction).some((v) => v !== 0) || Object.values(PERSONAL_ACTIONS[id].officer).some((v) => v !== 0));
    const freeMin = Math.min(
      ...actorIds.filter((id) => PERSONAL_ACTIONS[id].cost === 0).map((id) => PERSONAL_ACTIONS[id].cooldownTicks),
    );
    const paidMax = Math.max(
      ...actorIds.filter((id) => PERSONAL_ACTIONS[id].cost > 0).map((id) => PERSONAL_ACTIONS[id].cooldownTicks),
    );
    expect(freeMin).toBeGreaterThanOrEqual(paidMax);
  });
});

describe("getPersonalActionEffect", () => {
  it("returns actor-specific effects for factions, leaders, officers, civic figures, and captains", () => {
    expect(getPersonalActionEffect("faction", "give-gift")).toBe(PERSONAL_ACTIONS["give-gift"].faction);
    expect(getPersonalActionEffect("leader", "give-gift")).toBe(PERSONAL_ACTIONS["give-gift"].leader);
    expect(getPersonalActionEffect("officer", "give-gift")).toBe(PERSONAL_ACTIONS["give-gift"].officer);
    expect(getPersonalActionEffect("civic", "give-gift")).toBe(PERSONAL_ACTIONS["give-gift"].civic);
    expect(getPersonalActionEffect("captain", "give-gift")).toBe(PERSONAL_ACTIONS["give-gift"].captain);
  });

  it("bribe corrupts officers but not factions", () => {
    const officerEff = getPersonalActionEffect("officer", "bribe") as { corruption?: number };
    const factionEff = getPersonalActionEffect("faction", "bribe") as { corruption?: number };
    expect(officerEff.corruption).toBeGreaterThan(0);
    expect(factionEff.corruption).toBeUndefined();
  });

  it("keeps leader effects on faction relationship fields and civic effects on officer fields", () => {
    const leaderEff = getPersonalActionEffect("leader", "bribe") as Record<string, number | undefined>;
    const civicEff = getPersonalActionEffect("civic", "bribe") as Record<string, number | undefined>;
    expect(leaderEff).toEqual({ loyalty: 6, influence: 4, threat: -2 });
    expect(civicEff).toEqual({ loyalty: 6, corruption: 6 });
    expect("fearFactor" in leaderEff).toBe(false);
    expect("influence" in civicEff).toBe(false);
  });
});

describe("named actor personal interactions", () => {
  it("updates a rival leader through its faction without touching another faction", () => {
    const seeded = createInitialState();
    const faction = seeded.factions.find((f) => f.leader);
    expect(faction).toBeDefined();
    const target = { kind: "leader", id: faction!.id } satisfies PersonalInteractionTarget;
    const before = {
      ...seeded,
      totalTicks: 100,
      messages: [],
      factions: seeded.factions.map((f) =>
        f.id === faction!.id ? { ...f, loyalty: 10, influence: 20, threat: 50 } : f,
      ),
    };

    const after = applyPersonalInteraction(before, target, "bribe");
    const updated = after.factions.find((f) => f.id === faction!.id)!;
    const untouched = after.factions.find((f) => f.id !== faction!.id)!;
    expect(updated).toMatchObject({ loyalty: 16, influence: 24, threat: 48 });
    expect(untouched).toEqual(before.factions.find((f) => f.id !== faction!.id));
    expect(after.messages[0]?.title).toBe(`${faction!.leader!.name}: BRIBE`);
  });

  it("updates a civic figure through officer fields and rejects a leader without a leader record", () => {
    const seeded = createInitialState();
    const civicOfficer = seeded.officers.find((o) => o.department === "civic");
    expect(civicOfficer).toBeDefined();
    const civicTarget = { kind: "civic", id: civicOfficer!.id } satisfies PersonalInteractionTarget;
    const before = {
      ...seeded,
      totalTicks: 100,
      messages: [],
      officers: seeded.officers.map((o) =>
        o.id === civicOfficer!.id ? { ...o, loyalty: 20, corruption: 10 } : o,
      ),
    };

    const after = applyPersonalInteraction(before, civicTarget, "bribe");
    const updated = after.officers.find((o) => o.id === civicOfficer!.id)!;
    expect(updated).toMatchObject({ loyalty: 26, corruption: 16 });
    expect(after.factions).toEqual(before.factions);

    const noLeader = before.factions.find((f) => !f.leader);
    if (noLeader) {
      const unchanged = applyPersonalInteraction(
        before,
        { kind: "leader", id: noLeader.id },
        "flatter",
      );
      expect(unchanged).toBe(before);
    }
  });
});

describe("population personal interactions", () => {
  it("applies a command to citywide political stats and persists its per-audience cooldown", () => {
    const seeded = createInitialState();
    const target: PersonalInteractionTarget = { kind: "population", id: "population" };
    const before = {
      ...seeded,
      totalTicks: 40,
      messages: [],
      resources: { ...seeded.resources, credits: 10_000 },
      cityStats: {
        ...seeded.cityStats,
        crime: 70,
        lawOrder: 30,
        happiness: 60,
        corruption: 10,
      },
    };

    const after = applyPersonalInteraction(before, target, "surveillance-sweep");

    expect(after.resources.credits).toBe(5_000);
    expect(after.cityStats).toMatchObject({
      crime: 62,
      lawOrder: 38,
      happiness: 56,
      corruption: 12,
    });
    expect(after.messages[0]?.title).toBe("THE POPULATION: SURVEILLANCE SWEEP");
    expect(after.personalActionCooldowns?.[personalCooldownKey(target, "surveillance-sweep")]).toBe(72);
    expect(after.personalActionHistory?.[personalCooldownKey(target, "surveillance-sweep")]).toEqual([40]);

    const reloaded = sanitizeState(
      migrateState(JSON.parse(unwrapSave(wrapSave(JSON.stringify(after))).json) as GameState),
    );
    expect(reloaded.cityStats).toMatchObject({ crime: 62, lawOrder: 38, happiness: 56, corruption: 12 });
    expect(reloaded.personalActionCooldowns?.[personalCooldownKey(target, "surveillance-sweep")]).toBe(72);
  });

  it("does not let a stale actor menu execute a population-only action", () => {
    const seeded = createInitialState();
    const faction = seeded.factions[0];
    const before = { ...seeded, messages: [] };
    const after = applyPersonalInteraction(before, { kind: "faction", id: faction.id }, "address-the-masses");
    expect(after).toBe(before);
  });

  it.each([
    ["compulsory-civic-service", { crime: 67, lawOrder: 36, happiness: 55, corruption: 12 }],
    ["weaponize-scarcity", { crime: 74, lawOrder: 30, happiness: 46, corruption: 15, unrest: 1 }],
    ["stage-public-tribunals", { crime: 62, lawOrder: 37, happiness: 48, corruption: 16, unrest: 13 }],
    ["population-transfer-orders", { crime: 66, lawOrder: 38, happiness: 51, corruption: 15, unrest: 3 }],
  ] as const)("applies the new population command %s with explicit tradeoffs", (actionId, expected) => {
    const seeded = createInitialState();
    const before = {
      ...seeded,
      totalTicks: 80,
      messages: [],
      resources: { ...seeded.resources, credits: 20_000 },
      cityStats: {
        ...seeded.cityStats,
        crime: 70,
        lawOrder: 30,
        happiness: 60,
        unrest: 10,
        corruption: 10,
      },
    };
    const target: PersonalInteractionTarget = { kind: "population", id: "population" };

    const after = applyPersonalInteraction(before, target, actionId);

    expect(after.cityStats).toMatchObject(expected);
    expect(after.messages[0]?.title).toBe(`THE POPULATION: ${PERSONAL_ACTIONS[actionId].label}`);
    expect(after.personalActionCooldowns?.[personalCooldownKey(target, actionId)]).toBe(
      80 + PERSONAL_ACTIONS[actionId].cooldownTicks,
    );
    expect(after.resources.credits).toBe(20_000 - PERSONAL_ACTIONS[actionId].cost);
  });
});

describe("district personal interactions", () => {
  it("uses local conditions at exact boundaries and explains every blocked group", () => {
    const seeded = createInitialState();
    const district = {
      ...seeded.districts[0],
      crime: 20,
      unrest: 10,
      loyalty: 50,
      wealth: 50,
      infraQuality: 49,
      gangInfluence: 29,
    };
    const state = {
      ...seeded,
      districts: [district],
      resources: { ...seeded.resources, credits: 100_000 },
      totalTicks: 10,
    };
    const target = { kind: "district" as const, id: district.id };
    const context = {
      target,
      cooldowns: {},
      totalTicks: state.totalTicks,
      state,
    };

    expect(evaluatePersonalAction("district-pressure", 100_000, context)).toEqual({
      eligible: false,
      reason: "Needs crime ≥ 60 or unrest ≥ 60 (current: crime 20, unrest 10)",
    });
    expect(
      evaluatePersonalAction("district-pressure", 100_000, {
        ...context,
        cooldowns: stampPersonalCooldown({}, target, "district-pressure", state.totalTicks),
      }),
    ).toEqual({
      eligible: false,
      reason: "Recently used — wait 40 ticks; Needs crime ≥ 60 or unrest ≥ 60 (current: crime 20, unrest 10)",
    });
    expect(
      evaluatePersonalAction("district-pressure", 100_000, {
        ...context,
        state: { ...state, districts: [{ ...district, crime: 60 }] },
      }),
    ).toEqual({ eligible: true });

    expect(evaluatePersonalAction("district-surveil", 100_000, context)).toEqual({
      eligible: false,
      reason: "Needs infrastructure ≥ 50 (current: infrastructure 49); Needs crime ≥ 30 or gang influence ≥ 30 (current: crime 20, gang influence 29)",
    });
    expect(
      evaluatePersonalAction("district-surveil", 100_000, {
        ...context,
        state: {
          ...state,
          districts: [{ ...district, infraQuality: 50, gangInfluence: 30 }],
        },
      }),
    ).toEqual({ eligible: true });

    expect(
      evaluatePersonalAction("district-pardon", 100_000, {
        ...context,
        state: { ...state, districts: [{ ...district, crime: 29, unrest: 29 }] },
      }),
    ).toEqual({
      eligible: false,
      reason: "Needs crime ≥ 30 or unrest ≥ 30 (current: crime 29, unrest 29)",
    });
    expect(
      districtPrerequisiteReason("district-pardon", { ...district, crime: 30 }),
    ).toBeNull();
  });

  it("keeps commands distinct across prosperous, unstable, criminal, and infrastructure-poor districts", () => {
    const seeded = createInitialState();
    const base = seeded.districts[0];
    const scenarios = {
      prosperous: {
        ...base,
        crime: 8,
        unrest: 8,
        loyalty: 82,
        infraQuality: 90,
        gangInfluence: 4,
        wealth: 78,
      },
      unstable: {
        ...base,
        crime: 25,
        unrest: 65,
        loyalty: 42,
        infraQuality: 70,
        gangInfluence: 12,
        wealth: 45,
      },
      criminal: {
        ...base,
        crime: 72,
        unrest: 18,
        loyalty: 42,
        infraQuality: 65,
        gangInfluence: 48,
        wealth: 50,
      },
      infrastructurePoor: {
        ...base,
        crime: 12,
        unrest: 12,
        loyalty: 70,
        infraQuality: 30,
        gangInfluence: 5,
        wealth: 50,
      },
    };

    const available = (district: typeof base) =>
      PERSONAL_ACTION_ORDER.filter((id) => id.startsWith("district-") && districtPrerequisiteReason(id, district) === null);

    expect(available(scenarios.prosperous)).toEqual([]);
    expect(available(scenarios.unstable)).toEqual([
      "district-pressure",
      "district-reassure",
      "district-pardon",
    ]);
    expect(available(scenarios.criminal)).toEqual([
      "district-pressure",
      "district-lay-low",
      "district-surveil",
      "district-pardon",
    ]);
    expect(available(scenarios.infrastructurePoor)).toEqual(["district-reassure"]);
  });

  it("rechecks local conditions when executing a stale menu action", () => {
    const seeded = createInitialState();
    const district = seeded.districts[0];
    const target = { kind: "district" as const, id: district.id };
    const eligibleState = {
      ...seeded,
      totalTicks: 100,
      messages: [],
      resources: { ...seeded.resources, credits: 10_000 },
      districts: seeded.districts.map((entry) =>
        entry.id === district.id
          ? { ...entry, crime: 30, unrest: 30 }
          : entry,
      ),
    };
    const openedMenuState = {
      ...eligibleState,
      districts: eligibleState.districts.map((entry) =>
        entry.id === district.id ? { ...entry, crime: 19, unrest: 19 } : entry,
      ),
    };

    expect(applyPersonalInteraction(
      openedMenuState,
      target,
      "district-pardon",
    )).toBe(openedMenuState);
    expect(applyPersonalInteraction(
      eligibleState,
      target,
      "district-pardon",
    )).not.toBe(eligibleState);
  });

  it("mutates only the selected district with bounded command consequences", () => {
    const seeded = createInitialState();
    const [district, otherDistrict] = seeded.districts;
    const target = { kind: "district", id: district.id } satisfies PersonalInteractionTarget;
    const before = {
      ...seeded,
      totalTicks: 100,
      messages: [],
      resources: { ...seeded.resources, credits: 10_000 },
      districts: seeded.districts.map((entry) => entry.id === district.id
        ? { ...entry, population: 100, crime: 4, unrest: 3, loyalty: 98, infraQuality: 99, wealth: 2 }
        : entry),
    };

    const after = applyPersonalInteraction(before, target, "district-reassure");
    const updated = after.districts.find((entry) => entry.id === district.id)!;
    expect(after.resources.credits).toBe(6_000);
    expect(updated).toMatchObject({ population: 280, unrest: 0, loyalty: 100, infraQuality: 100, wealth: 0 });
    expect(after.districts.find((entry) => entry.id === otherDistrict.id)).toEqual(
      before.districts.find((entry) => entry.id === otherDistrict.id),
    );
    expect(after.cityStats).toEqual(before.cityStats);
    expect(after.messages[0]?.title).toBe(`${district.name}: RELIEF ALLOCATION`);
    expect(after.messages[0]?.body).toContain("population");
    expect(after.districtCommandHistory).toHaveLength(1);
    expect(after.districtCommandHistory?.[0]).toMatchObject({
      districtId: district.id,
      actionId: "district-reassure",
      tick: 100,
      effects: {
        population: 180,
        unrest: -3,
        loyalty: 2,
        infraQuality: 1,
        wealth: -2,
      },
      cooldownUntilTick: 128,
    });
  });

  it("lays low by lowering crime and gang influence, with one cost, cooldown, and audit entry", () => {
    const seeded = createInitialState();
    const district = seeded.districts[0];
    const target = { kind: "district", id: district.id } satisfies PersonalInteractionTarget;
    const before = {
      ...seeded,
      totalTicks: 100,
      messages: [],
      resources: { ...seeded.resources, credits: 5_000 },
      districts: seeded.districts.map((entry) =>
        entry.id === district.id
          ? { ...entry, crime: 65, gangInfluence: 55 }
          : entry,
      ),
    };

    const after = applyPersonalInteraction(before, target, "district-lay-low");
    const updated = after.districts.find((entry) => entry.id === district.id)!;

    expect(after.resources.credits).toBe(1_500);
    expect(updated).toMatchObject({ crime: 59, gangInfluence: 47 });
    expect(after.personalActionCooldowns?.[personalCooldownKey(target, "district-lay-low")]).toBe(132);
    expect(after.districtCommandHistory?.[0]).toMatchObject({
      districtId: district.id,
      actionId: "district-lay-low",
      effects: { crime: -6, gangInfluence: -8 },
      cooldownUntilTick: 132,
    });

    const reloaded = sanitizeState(migrateState(JSON.parse(
      unwrapSave(wrapSave(JSON.stringify(after))).json,
    ) as GameState));
    const reloadedDistrict = reloaded.districts.find((entry) => entry.id === district.id)!;
    expect(reloadedDistrict).toMatchObject({ crime: 59, gangInfluence: 47 });
    expect(getDistrictUnderworldHeat(reloadedDistrict).label).toBe("Watched");
    expect(reloaded.districtCommandHistory).toEqual(after.districtCommandHistory);
  });

  it("does not let a stale Lay Low menu execute after both heat sources cool below its gate", () => {
    const seeded = createInitialState();
    const district = seeded.districts[0];
    const target = { kind: "district", id: district.id } satisfies PersonalInteractionTarget;
    const before = {
      ...seeded,
      totalTicks: 100,
      messages: [],
      resources: { ...seeded.resources, credits: 5_000 },
      districts: seeded.districts.map((entry) =>
        entry.id === district.id
          ? { ...entry, crime: 29, gangInfluence: 29 }
          : entry,
      ),
    };

    expect(applyPersonalInteraction(before, target, "district-lay-low")).toBe(before);
    expect(evaluatePersonalAction("district-lay-low", 5_000, {
      target,
      cooldowns: {},
      totalTicks: before.totalTicks,
      state: before,
    })).toEqual({
      eligible: false,
      reason: "Needs crime ≥ 30 or gang influence ≥ 30 (current: crime 29, gang influence 29)",
    });
  });

  it("scopes cooldowns and repeat fatigue by district, and retains them through save/load", () => {
    const seeded = createInitialState();
    const [first, second] = seeded.districts;
    const target = { kind: "district", id: first.id } satisfies PersonalInteractionTarget;
    const other = { kind: "district", id: second.id } satisfies PersonalInteractionTarget;
    const before = { ...seeded, totalTicks: 200, messages: [] };
    before.districts = before.districts.map((entry) =>
      entry.id === first.id ? { ...entry, crime: 100, unrest: 100 } : entry,
    );
    const firstUse = applyPersonalInteraction(before, target, "district-pressure");
    expect(evaluatePersonalAction("district-pressure", 0, {
      target, cooldowns: firstUse.personalActionCooldowns, totalTicks: 200,
    })).toEqual({ eligible: false, reason: "Recently used — wait 40 ticks" });
    expect(evaluatePersonalAction("district-pressure", 0, {
      target: other, cooldowns: firstUse.personalActionCooldowns, totalTicks: 200,
    }).eligible).toBe(true);

    const repeat = applyPersonalInteraction(
      { ...firstUse, totalTicks: 240 },
      target,
      "district-pressure",
    );
    expect(repeat.personalActionHistory?.[personalCooldownKey(target, "district-pressure")]).toEqual([200, 240]);
    expect(formatPersonalActionSubtitle("district", "district-pressure", {
      target,
      history: repeat.personalActionHistory,
      totalTicks: 240,
    })).toContain("Reduced effect: 30%");

    const reloaded = sanitizeState(migrateState(JSON.parse(
      unwrapSave(wrapSave(JSON.stringify(repeat))).json,
    ) as GameState));
    expect(reloaded.personalActionCooldowns?.[personalCooldownKey(target, "district-pressure")]).toBe(280);
    expect(reloaded.personalActionHistory?.[personalCooldownKey(target, "district-pressure")]).toEqual([200, 240]);
    expect(reloaded.districtCommandHistory).toEqual(repeat.districtCommandHistory);
  });

  it("keeps the district command audit trail bounded", () => {
    const entry = {
      id: "district-command",
      districtId: "central-command",
      actionId: "district-pressure",
      effects: { crime: -8 },
      tick: 1,
      timestamp: { year: 2030, month: 1, day: 1, hour: 0 },
      cooldownUntilTick: 41,
    } as const;
    let bounded = [] as NonNullable<GameState["districtCommandHistory"]>;
    for (let index = 0; index < DISTRICT_COMMAND_HISTORY_CAP + 1; index++) {
      bounded = stampDistrictCommandHistory(bounded, { ...entry, id: `district-command-${index}`, tick: index });
    }
    expect(bounded).toHaveLength(DISTRICT_COMMAND_HISTORY_CAP);
    expect(bounded[0].tick).toBe(1);
    expect(bounded.at(-1)?.tick).toBe(DISTRICT_COMMAND_HISTORY_CAP);
  });

  it("uses the generic unavailable reason for non-district verbs and credit reason for blocked commands", () => {
    const seeded = createInitialState();
    const target = { kind: "district", id: seeded.districts[0].id } satisfies PersonalInteractionTarget;
    expect(evaluatePersonalAction("flatter", 10_000, {
      target, cooldowns: {}, totalTicks: 0,
    })).toEqual({ eligible: false, reason: "Not available for this target" });
    expect(evaluatePersonalAction("district-surveil", 100, {
      target, cooldowns: {}, totalTicks: 0,
    })).toEqual({ eligible: false, reason: "Need 6,000 credits" });
  });
});

describe("formatEffectDeltas", () => {
  it("signs and orders the moved fields, skipping zero / missing", () => {
    expect(formatEffectDeltas({ loyalty: 8, influence: 2 })).toBe("+8 loyalty | +2 influence");
    expect(formatEffectDeltas({ loyalty: -3, threat: -8 })).toBe("-3 loyalty | -8 threat");
    expect(formatEffectDeltas({ fearFactor: 8, loyalty: -3 })).toBe("-3 loyalty | +8 fear");
  });

  it("returns an empty string when nothing moves", () => {
    expect(formatEffectDeltas({})).toBe("");
    expect(formatEffectDeltas({ loyalty: 0 })).toBe("");
  });
});

describe("formatPersonalActionSubtitle", () => {
  it("appends the credit cost for paid verbs", () => {
    expect(formatPersonalActionSubtitle("faction", "give-gift")).toBe("+8 loyalty | +2 influence | 1,500c");
  });

  it("omits the cost for free verbs", () => {
    expect(formatPersonalActionSubtitle("officer", "flatter")).toBe("+3 loyalty");
  });

  it("explains when a repeated verb has reduced effect", () => {
    const target: PersonalInteractionTarget = { kind: "officer", id: "off-1" };
    const history = stampPersonalActionHistory({}, target, "flatter", 100);
    expect(
      formatPersonalActionSubtitle("officer", "flatter", {
        target,
        history,
        totalTicks: 100,
      }),
    ).toBe("+1.8 loyalty | Reduced effect: 60%");
  });
});

describe("personal action diminishing returns", () => {
  const target: PersonalInteractionTarget = { kind: "faction", id: "syndicate" };

  it("uses the 100% → 60% → 30% → 25% decay curve", () => {
    expect(personalActionDecayMultiplier(undefined, target, "flatter", 100)).toBe(1);
    const once = stampPersonalActionHistory({}, target, "flatter", 100);
    expect(personalActionDecayMultiplier(once, target, "flatter", 100)).toBe(0.6);
    const twice = stampPersonalActionHistory(once, target, "flatter", 101);
    expect(personalActionDecayMultiplier(twice, target, "flatter", 101)).toBe(0.3);
    const thrice = stampPersonalActionHistory(twice, target, "flatter", 102);
    expect(personalActionDecayMultiplier(thrice, target, "flatter", 102)).toBe(0.25);
  });

  it("resets fatigue after the quiet window", () => {
    const usedAt = 100;
    const history = stampPersonalActionHistory({}, target, "flatter", usedAt);
    expect(
      personalActionDecayMultiplier(
        history,
        target,
        "flatter",
        usedAt + PERSONAL_ACTION_DECAY_WINDOW_TICKS,
      ),
    ).toBe(0.6);
    expect(
      personalActionDecayMultiplier(
        history,
        target,
        "flatter",
        usedAt + PERSONAL_ACTION_DECAY_WINDOW_TICKS + 1,
      ),
    ).toBe(1);
  });

  it("applies smaller loyalty gains while preserving the per-target scope", () => {
    const seeded = createInitialState();
    const target = { kind: "faction", id: seeded.factions[0].id } satisfies PersonalInteractionTarget;
    const before = {
      ...seeded,
      totalTicks: 100,
      messages: [],
      factions: seeded.factions.map((faction, index) =>
        index === 0 ? { ...faction, loyalty: 10 } : faction,
      ),
    };
    const first = applyPersonalInteraction(before, target, "flatter");
    const second = applyPersonalInteraction(
      { ...first, totalTicks: 100 + PERSONAL_ACTIONS.flatter.cooldownTicks },
      target,
      "flatter",
    );
    const otherTarget = { kind: "faction", id: seeded.factions[1].id } satisfies PersonalInteractionTarget;
    const other = applyPersonalInteraction(
      { ...second, totalTicks: second.totalTicks + PERSONAL_ACTIONS.flatter.cooldownTicks },
      otherTarget,
      "flatter",
    );

    expect(first.factions[0].loyalty).toBe(13);
    expect(second.factions[0].loyalty).toBe(14.8);
    // The other faction starts with a fresh history and gets the full effect.
    expect(other.factions[1].loyalty).toBe(seeded.factions[1].loyalty + 3);
    expect(second.personalActionHistory?.[personalCooldownKey(target, "flatter")]).toEqual([100, 116]);
  });
});

describe("affordabilityReason", () => {
  it("is null for free actions and when credits cover the cost", () => {
    expect(affordabilityReason(0, 0)).toBeNull();
    expect(affordabilityReason(1500, 1500)).toBeNull();
    expect(affordabilityReason(1500, 5000)).toBeNull();
  });

  it("reports the shortfall when credits are insufficient", () => {
    expect(affordabilityReason(1500, 200)).toBe("Need 1,500 credits");
  });

  it("treats malformed credit balances as unaffordable for paid actions", () => {
    expect(affordabilityReason(1500, Number.NaN)).toBe("Need 1,500 credits");
    expect(affordabilityReason(1500, Number.POSITIVE_INFINITY)).toBe("Need 1,500 credits");
  });
});

describe("evaluatePersonalAction", () => {
  it("gates on affordability when no cooldown context is supplied", () => {
    expect(evaluatePersonalAction("flatter", 0)).toEqual({ eligible: true });
    expect(evaluatePersonalAction("give-gift", 5000)).toEqual({ eligible: true });
    expect(evaluatePersonalAction("give-gift", 100)).toEqual({
      eligible: false,
      reason: "Need 1,500 credits",
    });
  });

  const target: PersonalInteractionTarget = { kind: "faction", id: "syndicate" };

  it("greys a recently used verb with a wait reason, per target", () => {
    const cooldowns = stampPersonalCooldown({}, target, "flatter", 100);
    const wait = PERSONAL_ACTIONS["flatter"].cooldownTicks;
    expect(evaluatePersonalAction("flatter", 0, { target, cooldowns, totalTicks: 100 })).toEqual({
      eligible: false,
      reason: `Recently used — wait ${wait} ticks`,
    });
    // A different verb on the same target is unaffected...
    expect(
      evaluatePersonalAction("grant-favor", 0, { target, cooldowns, totalTicks: 100 }).eligible,
    ).toBe(true);
    // ...and so is the same verb on a different target.
    const other: PersonalInteractionTarget = { kind: "officer", id: "off-1" };
    expect(
      evaluatePersonalAction("flatter", 0, { target: other, cooldowns, totalTicks: 100 }).eligible,
    ).toBe(true);
  });

  it("counts the wait down and frees the verb when the cooldown expires", () => {
    const cooldowns = stampPersonalCooldown({}, target, "threaten", 100);
    const wait = PERSONAL_ACTIONS["threaten"].cooldownTicks;
    const midway = evaluatePersonalAction("threaten", 0, { target, cooldowns, totalTicks: 100 + wait - 1 });
    expect(midway).toEqual({ eligible: false, reason: "Recently used — wait 1 tick" });
    expect(
      evaluatePersonalAction("threaten", 0, { target, cooldowns, totalTicks: 100 + wait }).eligible,
    ).toBe(true);
  });

  it("reports the cooldown reason ahead of affordability", () => {
    const cooldowns = stampPersonalCooldown({}, target, "give-gift", 50);
    const res = evaluatePersonalAction("give-gift", 0, { target, cooldowns, totalTicks: 50 });
    expect(res.eligible).toBe(false);
    expect(res.reason).toContain("Recently used");
  });
});

describe("personal cooldown helpers", () => {
  const target: PersonalInteractionTarget = { kind: "faction", id: "syndicate" };

  it("keys cooldowns by kind, target id and verb", () => {
    expect(personalCooldownKey(target, "flatter")).toBe("faction:syndicate:flatter");
    expect(personalCooldownKey({ kind: "officer", id: "off-1" }, "bribe")).toBe("officer:off-1:bribe");
  });

  it("treats a missing or empty map as ready", () => {
    expect(personalCooldownRemaining(undefined, target, "flatter", 10)).toBe(0);
    expect(personalCooldownRemaining({}, target, "flatter", 10)).toBe(0);
  });

  it("stamping prunes expired entries but keeps live ones", () => {
    const t0 = 100;
    const first = stampPersonalCooldown({}, target, "flatter", t0);
    // Far in the future every entry has expired; stamping a new verb should
    // drop the stale flatter entry instead of letting the record grow forever.
    const later = t0 + 1000;
    const second = stampPersonalCooldown(first, target, "threaten", later);
    expect(Object.keys(second)).toEqual([personalCooldownKey(target, "threaten")]);
    // But a still-live entry survives a new stamp.
    const third = stampPersonalCooldown(first, target, "threaten", t0 + 1);
    expect(Object.keys(third).sort()).toEqual(
      [personalCooldownKey(target, "flatter"), personalCooldownKey(target, "threaten")].sort(),
    );
  });

  it("ignores malformed (non-numeric) entries when stamping", () => {
    const dirty = { junk: "soon" } as unknown as Record<string, number>;
    const out = stampPersonalCooldown(dirty, target, "flatter", 5);
    expect(Object.keys(out)).toEqual([personalCooldownKey(target, "flatter")]);
  });
});

// Per-faction cooldowns for the reused faction-level diplomacy verbs
// (Task #468). Task #393 gated the five PERSONAL verbs; the sandbox catalog
// (EVENT_ONLY_ACTION_RULES) reopened the same loyalty-farming exploit through
// its free/cheap loyalty-raising verbs. These guards lock in exactly which
// verbs are gated and how the gate behaves.
describe("faction diplomacy cooldowns (Task #468)", () => {
  const allIds = Object.keys(EVENT_ONLY_ACTION_RULES) as EventOnlyActionId[];
  const gatedIds = Object.keys(FACTION_DIPLOMACY_COOLDOWNS) as EventOnlyActionId[];

  it("gates exactly the loyalty-raising verbs — no more, no less", () => {
    // The farmable set is derived from the engine table itself: any verb
    // whose accepted effects RAISE loyalty can be repeated to push a faction
    // to 100. Verbs that lower loyalty or trade influence for threat are
    // self-limiting and must stay uncapped (sandbox verbs chain freely).
    const loyaltyRaisers = allIds.filter((id) => {
      const effects = EVENT_ONLY_ACTION_RULES[id].effects as DiplomaticActionEffects;
      return (effects.loyalty ?? 0) > 0;
    });
    expect([...gatedIds].sort()).toEqual([...loyaltyRaisers].sort());
  });

  it("every gated verb has a positive cooldown, and the free one cools longest", () => {
    for (const id of gatedIds) {
      expect(FACTION_DIPLOMACY_COOLDOWNS[id], id).toBeGreaterThan(0);
    }
    const freeMin = Math.min(
      ...gatedIds.filter((id) => EVENT_ONLY_ACTION_RULES[id].cost === 0).map((id) => FACTION_DIPLOMACY_COOLDOWNS[id]!),
    );
    const paidMax = Math.max(
      ...gatedIds.filter((id) => EVENT_ONLY_ACTION_RULES[id].cost > 0).map((id) => FACTION_DIPLOMACY_COOLDOWNS[id]!),
    );
    expect(freeMin).toBeGreaterThanOrEqual(paidMax);
  });

  it("keys share the personalActionCooldowns namespace without colliding", () => {
    expect(factionDiplomacyCooldownKey("syndicate", "negotiate")).toBe("faction:syndicate:negotiate");
    // The two id sets are disjoint, so a personal verb and a diplomacy verb
    // aimed at the same faction can never share a key (grant-favor vs
    // grant-honor being the closest near-miss).
    const personalIds = new Set(Object.keys(PERSONAL_ACTIONS));
    for (const id of allIds) {
      expect(personalIds.has(id), `id collision: ${id}`).toBe(false);
    }
  });

  it("treats a missing map, ungated verbs, and expired stamps as ready", () => {
    expect(factionDiplomacyCooldownRemaining(undefined, "f1", "negotiate", 10)).toBe(0);
    expect(factionDiplomacyCooldownReason({}, "f1", "negotiate", 10)).toBeNull();
    // Ungated hostile verb: even a (stale/foreign) entry never blocks it.
    const stale = { [factionDiplomacyCooldownKey("f1", "suppress")]: 999 };
    expect(factionDiplomacyCooldownRemaining(stale, "f1", "suppress", 10)).toBe(0);
    // Expired stamp frees the verb.
    const stamped = stampFactionDiplomacyCooldown({}, "f1", "negotiate", 100);
    const wait = FACTION_DIPLOMACY_COOLDOWNS["negotiate"]!;
    expect(factionDiplomacyCooldownRemaining(stamped, "f1", "negotiate", 100 + wait)).toBe(0);
  });

  it("blocks a stamped verb with the shared 'Recently used' reason, per faction", () => {
    const stamped = stampFactionDiplomacyCooldown({}, "f1", "negotiate", 100);
    const wait = FACTION_DIPLOMACY_COOLDOWNS["negotiate"]!;
    expect(factionDiplomacyCooldownRemaining(stamped, "f1", "negotiate", 100)).toBe(wait);
    expect(factionDiplomacyCooldownReason(stamped, "f1", "negotiate", 100)).toBe(
      `Recently used — wait ${wait} ticks`,
    );
    expect(factionDiplomacyCooldownReason(stamped, "f1", "negotiate", 100 + wait - 1)).toBe(
      "Recently used — wait 1 tick",
    );
    // A different faction is unaffected...
    expect(factionDiplomacyCooldownRemaining(stamped, "f2", "negotiate", 100)).toBe(0);
    // ...and so is a different gated verb on the same faction.
    expect(factionDiplomacyCooldownRemaining(stamped, "f1", "grant-honor", 100)).toBe(0);
  });

  it("stamping an ungated verb is a no-op; stamping prunes expired entries", () => {
    const before = stampFactionDiplomacyCooldown({}, "f1", "fund", 100);
    expect(stampFactionDiplomacyCooldown(before, "f1", "suppress", 100)).toBe(before);
    // Stamp far in the future: the stale fund entry is pruned.
    const later = stampFactionDiplomacyCooldown(before, "f1", "negotiate", 100 + 1000);
    expect(Object.keys(later)).toEqual([factionDiplomacyCooldownKey("f1", "negotiate")]);
    // Live personal-verb entries survive a diplomacy stamp (shared map).
    const target: PersonalInteractionTarget = { kind: "faction", id: "f1" };
    const mixed = stampFactionDiplomacyCooldown(
      stampPersonalCooldown({}, target, "flatter", 100),
      "f1",
      "negotiate",
      101,
    );
    expect(Object.keys(mixed).sort()).toEqual(
      [personalCooldownKey(target, "flatter"), factionDiplomacyCooldownKey("f1", "negotiate")].sort(),
    );
  });

  it("keeps multiple faction diplomacy scopes intact across simulated and extrapolated resume ticks", () => {
    const seeded = createInitialState();
    const [firstFaction, secondFaction, laterFaction] = seeded.factions;
    const usedAtTick = 400;
    const resumeTicks = 80;
    const intervalMinutes = seeded.tickIntervalMinutes ?? 15;
    const expiredEntries = {
      [factionDiplomacyCooldownKey(firstFaction.id, "negotiate")]:
        usedAtTick + FACTION_DIPLOMACY_COOLDOWNS.negotiate!,
      [factionDiplomacyCooldownKey(secondFaction.id, "grant-honor")]:
        usedAtTick + FACTION_DIPLOMACY_COOLDOWNS["grant-honor"]!,
    };
    const laterEntries = {
      [factionDiplomacyCooldownKey(laterFaction.id, "fund")]:
        usedAtTick + resumeTicks + 20,
      [factionDiplomacyCooldownKey(firstFaction.id, "tax-concession")]:
        usedAtTick + resumeTicks + 30,
    };
    const persisted = {
      ...seeded,
      tickPaused: false,
      totalTicks: usedAtTick,
      lastTickTime: Date.now() - resumeTicks * intervalMinutes * 60_000 - 1,
      messages: [],
      personalActionCooldowns: { ...expiredEntries, ...laterEntries },
    };

    const wrapped = wrapSave(JSON.stringify(persisted));
    const unwrapped = unwrapSave(wrapped);
    expect(unwrapped.valid).toBe(true);
    const reloaded = sanitizeState(
      migrateState(JSON.parse(unwrapped.json) as GameState),
    );

    // Keep the batch below the resume span so both the normal tick loop and
    // the rate-extrapolation branch run during this single resume.
    const { newState, report } = runOfflineCatchup(reloaded, "lite", 20);
    expect(report).not.toBeNull();
    expect(report?.ticksProcessed).toBe(resumeTicks);
    expect(report?.simulatedTicks).toBe(20);
    expect(report?.extrapolatedTicks).toBe(resumeTicks - 20);
    expect(newState.totalTicks).toBe(usedAtTick + resumeTicks);

    for (const [key, factionId, action] of [
      [factionDiplomacyCooldownKey(firstFaction.id, "negotiate"), firstFaction.id, "negotiate"],
      [factionDiplomacyCooldownKey(secondFaction.id, "grant-honor"), secondFaction.id, "grant-honor"],
    ] as const) {
      expect(newState.personalActionCooldowns?.[key]).toBe(expiredEntries[key]);
      expect(
        factionDiplomacyCooldownRemaining(
          newState.personalActionCooldowns,
          factionId,
          action,
          newState.totalTicks,
        ),
      ).toBe(0);
      expect(
        factionDiplomacyCooldownReason(
          newState.personalActionCooldowns,
          factionId,
          action,
          newState.totalTicks,
        ),
      ).toBeNull();
    }

    for (const [key, factionId, action] of [
      [factionDiplomacyCooldownKey(laterFaction.id, "fund"), laterFaction.id, "fund"],
      [factionDiplomacyCooldownKey(firstFaction.id, "tax-concession"), firstFaction.id, "tax-concession"],
    ] as const) {
      const readyAt = laterEntries[key];
      expect(newState.personalActionCooldowns?.[key]).toBe(readyAt);
      expect(
        factionDiplomacyCooldownRemaining(
          newState.personalActionCooldowns,
          factionId,
          action,
          newState.totalTicks,
        ),
      ).toBe(readyAt - newState.totalTicks);
      expect(
        factionDiplomacyCooldownReason(
          newState.personalActionCooldowns,
          factionId,
          action,
          newState.totalTicks,
        ),
      ).toBe(`Recently used — wait ${readyAt - newState.totalTicks} ticks`);
    }
  });
});

describe("applyPersonalInteraction state transition", () => {
  it("preserves per-target action cooldowns through save and load", () => {
    const seeded = createInitialState();
    const target: PersonalInteractionTarget = {
      kind: "faction",
      id: seeded.factions[0].id,
    };
    const unrelatedTarget: PersonalInteractionTarget = {
      kind: "faction",
      id: seeded.factions[1].id,
    };
    const usedAtTick = 400;
    const before = {
      ...seeded,
      totalTicks: usedAtTick,
      messages: [],
    };

    const afterUse = applyPersonalInteraction(before, target, "flatter");
    const cooldownKey = personalCooldownKey(target, "flatter");
    const readyAt = usedAtTick + PERSONAL_ACTIONS.flatter.cooldownTicks;
    expect(afterUse.personalActionCooldowns?.[cooldownKey]).toBe(readyAt);

    // Mirror the production load path rather than only cloning the object:
    // wrap/unwrap verifies the save envelope, while migration and sanitizing
    // cover the current save schema's rehydration steps.
    const wrapped = wrapSave(JSON.stringify(afterUse));
    const unwrapped = unwrapSave(wrapped);
    expect(unwrapped.valid).toBe(true);
    const reloaded = sanitizeState(
      migrateState(JSON.parse(unwrapped.json) as GameState),
    );

    expect(reloaded.personalActionCooldowns?.[cooldownKey]).toBe(readyAt);
    expect(
      evaluatePersonalAction("flatter", 0, {
        target,
        cooldowns: reloaded.personalActionCooldowns,
        totalTicks: usedAtTick,
      }),
    ).toEqual({
      eligible: false,
      reason: `Recently used — wait ${PERSONAL_ACTIONS.flatter.cooldownTicks} ticks`,
    });
    expect(
      evaluatePersonalAction("flatter", 0, {
        target,
        cooldowns: reloaded.personalActionCooldowns,
        totalTicks: readyAt - 1,
      }).eligible,
    ).toBe(false);
    expect(
      evaluatePersonalAction("flatter", 0, {
        target,
        cooldowns: reloaded.personalActionCooldowns,
        totalTicks: readyAt,
      }).eligible,
    ).toBe(true);

    // Cooldowns are scoped to both the target and the action.
    expect(
      evaluatePersonalAction("grant-favor", 0, {
        target,
        cooldowns: reloaded.personalActionCooldowns,
        totalTicks: usedAtTick,
      }).eligible,
    ).toBe(true);
    expect(
      evaluatePersonalAction("flatter", 0, {
        target: unrelatedTarget,
        cooldowns: reloaded.personalActionCooldowns,
        totalTicks: usedAtTick,
      }).eligible,
    ).toBe(true);
  });

  it("expires persisted personal cooldowns during offline catch-up without crossing scopes", () => {
    const seeded = createInitialState();
    const target: PersonalInteractionTarget = {
      kind: "faction",
      id: seeded.factions[0].id,
    };
    const unrelatedTarget: PersonalInteractionTarget = {
      kind: "faction",
      id: seeded.factions[1].id,
    };
    const usedAtTick = 400;
    const cooldownTicks = PERSONAL_ACTIONS.flatter.cooldownTicks;
    const cooldownKey = personalCooldownKey(target, "flatter");
    const unrelatedKey = personalCooldownKey(unrelatedTarget, "flatter");
    const unrelatedReadyAt = usedAtTick + cooldownTicks + 10;
    const intervalMinutes = seeded.tickIntervalMinutes ?? 15;
    const persisted = {
      ...seeded,
      tickPaused: false,
      totalTicks: usedAtTick,
      lastTickTime: Date.now() - (cooldownTicks + 2) * intervalMinutes * 60_000,
      messages: [],
      personalActionCooldowns: {
        [cooldownKey]: usedAtTick + cooldownTicks,
        [unrelatedKey]: unrelatedReadyAt,
      },
      personalActionHistory: {
        [cooldownKey]: [usedAtTick],
      },
    };

    // Exercise the same save envelope and rehydration path as a relaunch.
    const wrapped = wrapSave(JSON.stringify(persisted));
    const unwrapped = unwrapSave(wrapped);
    expect(unwrapped.valid).toBe(true);
    const reloaded = sanitizeState(
      migrateState(JSON.parse(unwrapped.json) as GameState),
    );

    const { newState, report } = runOfflineCatchup(reloaded, "lite");
    expect(report).not.toBeNull();
    expect(newState.totalTicks).toBeGreaterThanOrEqual(usedAtTick + cooldownTicks);
    expect(
      evaluatePersonalAction("flatter", 0, {
        target,
        cooldowns: newState.personalActionCooldowns,
        totalTicks: newState.totalTicks,
      }).eligible,
    ).toBe(true);

    // Catch-up advances the shared clock, but must not reassign another
    // target's cooldown or make that still-cooling-down action available.
    expect(newState.personalActionCooldowns?.[unrelatedKey]).toBe(unrelatedReadyAt);
    expect(newState.personalActionHistory?.[cooldownKey]).toEqual([usedAtTick]);
    expect(
      evaluatePersonalAction("flatter", 0, {
        target: unrelatedTarget,
        cooldowns: newState.personalActionCooldowns,
        totalTicks: newState.totalTicks,
      }).eligible,
    ).toBe(false);
  });

  it("keeps multiple personal cooldown scopes intact across simulated and extrapolated resume ticks", () => {
    const seeded = createInitialState();
    const target = {
      kind: "faction",
      id: seeded.factions[0].id,
    } satisfies PersonalInteractionTarget;
    const otherTarget = {
      kind: "officer",
      id: seeded.officers[0].id,
    } satisfies PersonalInteractionTarget;
    const laterTarget = {
      kind: "faction",
      id: seeded.factions[1].id,
    } satisfies PersonalInteractionTarget;
    const usedAtTick = 400;
    const resumeTicks = 80;
    const intervalMinutes = seeded.tickIntervalMinutes ?? 15;
    const cooldowns = {
      [personalCooldownKey(target, "flatter")]:
        usedAtTick + PERSONAL_ACTIONS.flatter.cooldownTicks,
      [personalCooldownKey(otherTarget, "grant-favor")]:
        usedAtTick + PERSONAL_ACTIONS["grant-favor"].cooldownTicks,
      [personalCooldownKey(laterTarget, "threaten")]: usedAtTick + resumeTicks + 20,
    };
    const persisted = {
      ...seeded,
      tickPaused: false,
      totalTicks: usedAtTick,
      lastTickTime: Date.now() - resumeTicks * intervalMinutes * 60_000 - 1,
      messages: [],
      personalActionCooldowns: cooldowns,
    };

    const wrapped = wrapSave(JSON.stringify(persisted));
    const unwrapped = unwrapSave(wrapped);
    expect(unwrapped.valid).toBe(true);
    const reloaded = sanitizeState(
      migrateState(JSON.parse(unwrapped.json) as GameState),
    );

    // A deliberately small batch limit proves this is not only the ordinary
    // per-tick path: the 80-tick resume must use both simulated and
    // extrapolated processing.
    const { newState, report } = runOfflineCatchup(reloaded, "lite", 20);
    expect(report).not.toBeNull();
    expect(report?.ticksProcessed).toBe(resumeTicks);
    expect(report?.simulatedTicks).toBe(20);
    expect(report?.extrapolatedTicks).toBe(resumeTicks - 20);
    expect(newState.totalTicks).toBe(usedAtTick + resumeTicks);

    const firstReady = evaluatePersonalAction("flatter", 0, {
      target,
      cooldowns: newState.personalActionCooldowns,
      totalTicks: newState.totalTicks,
    });
    const secondReady = evaluatePersonalAction("grant-favor", 0, {
      target: otherTarget,
      cooldowns: newState.personalActionCooldowns,
      totalTicks: newState.totalTicks,
    });
    expect(firstReady.eligible).toBe(true);
    expect(secondReady.eligible).toBe(true);

    const laterKey = personalCooldownKey(laterTarget, "threaten");
    expect(newState.personalActionCooldowns?.[laterKey]).toBe(
      cooldowns[laterKey],
    );
    expect(
      evaluatePersonalAction("threaten", 0, {
        target: laterTarget,
        cooldowns: newState.personalActionCooldowns,
        totalTicks: newState.totalTicks,
      }),
    ).toEqual({
      eligible: false,
      reason: `Recently used — wait ${cooldowns[laterKey] - newState.totalTicks} ticks`,
    });
  });

  it("deducts a paid action once and applies only faction relationship fields", () => {
    const seeded = createInitialState();
    const faction = seeded.factions[0];
    const before = {
      ...seeded,
      resources: { ...seeded.resources, credits: 10_000 },
      factions: seeded.factions.map((f) =>
        f.id === faction.id
          ? { ...f, loyalty: 95, influence: 98, threat: 5 }
          : f,
      ),
      messages: [],
    };
    const target: PersonalInteractionTarget = { kind: "faction", id: faction.id };

    const after = applyPersonalInteraction(before, target, "bribe");
    const changed = after.factions.find((f) => f.id === faction.id)!;

    expect(after.resources.credits).toBe(7_000);
    expect(changed.loyalty).toBe(100);
    expect(changed.influence).toBe(100);
    expect(changed.threat).toBe(3);
    expect(after.officers).toEqual(before.officers);
    expect(after.messages[0].category).toBe("call");
    expect(after.messages[0].title).toContain("BRIBE");
    expect(after.messages).toHaveLength(1);
  });

  it("deducts an officer action once and moves only officer fields, clamped to 0-100", () => {
    const seeded = createInitialState();
    const officer = seeded.officers[0];
    const before = {
      ...seeded,
      resources: { ...seeded.resources, credits: 5_000 },
      officers: seeded.officers.map((o) =>
        o.id === officer.id
          ? { ...o, loyalty: 98, fearFactor: 98, corruption: 98 }
          : o,
      ),
      messages: [],
    };
    const target: PersonalInteractionTarget = { kind: "officer", id: officer.id };

    const after = applyPersonalInteraction(before, target, "bribe");
    const changed = after.officers.find((o) => o.id === officer.id)!;

    expect(after.resources.credits).toBe(2_000);
    expect(changed.loyalty).toBe(100);
    expect(changed.fearFactor).toBe(98);
    expect(changed.corruption).toBe(100);
    expect(after.factions).toEqual(before.factions);
    expect(after.messages[0].category).toBe("call");

    // A separate, cooled-down-safe interaction verifies the lower clamp and
    // the officer-only fear field.
    const lower = applyPersonalInteraction(
      { ...after, totalTicks: after.totalTicks + 100 },
      target,
      "threaten",
    );
    const lowered = lower.officers.find((o) => o.id === officer.id)!;
    expect(lowered.loyalty).toBe(97);
    expect(lowered.fearFactor).toBe(100);
    expect(lowered.corruption).toBe(100);
  });

  it("applies personal actions to a retinue captain's loyalty and persists the relationship", async () => {
    const seeded = createInitialState();
    const retinue = createDefaultRetinueState();
    const captain = {
      id: "captain-personal-test",
      name: "Mara Venn",
      title: "Ashline Captain",
      level: 1,
      xp: 0,
      xpToNext: 100,
      leadership: 60,
      combat: 55,
      tactics: 50,
      loyalty: 40,
      squadId: "squad-test",
      kills: 0,
      battlesWon: 0,
      battlesLost: 0,
      trait: "inspiring" as const,
      status: "active" as const,
      equippedItemIds: [],
      hiredTick: 0,
    };
    retinue.captains = [captain];
    const before = {
      ...seeded,
      retinue,
      resources: { ...seeded.resources, credits: 5_000 },
      messages: [],
    };
    const target: PersonalInteractionTarget = { kind: "captain", id: captain.id };

    const after = applyPersonalInteraction(before, target, "bribe");
    const changed = after.retinue!.captains[0];

    expect(after.resources.credits).toBe(2_000);
    expect(changed.loyalty).toBe(46);
    expect(changed.leadership).toBe(captain.leadership);
    expect(changed.combat).toBe(captain.combat);
    expect(after.officers).toEqual(before.officers);
    expect(after.factions).toEqual(before.factions);
    expect(after.personalActionCooldowns?.[personalCooldownKey(target, "bribe")]).toBe(
      PERSONAL_ACTIONS.bribe.cooldownTicks,
    );
    expect(after.personalActionHistory?.[personalCooldownKey(target, "bribe")]).toEqual([before.totalTicks]);

    const storage = new Map<string, string>();
    const slotStorage = {
      async getItem(key: string) {
        return storage.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        storage.set(key, value);
      },
    };
    const slotKey = "@megacity_captain_relationship_test_1";
    await writeSlotSave(slotStorage, slotKey, after);

    const savedRaw = storage.get(slotKey);
    expect(savedRaw).toBeDefined();
    const savedEnvelope = unwrapSave(savedRaw!);
    expect(savedEnvelope.valid).toBe(true);
    const reloaded = sanitizeState(
      migrateState(JSON.parse(savedEnvelope.json) as GameState),
    );
    const reloadedCaptain = reloaded.retinue!.captains[0];
    expect(reloadedCaptain).toMatchObject({
      id: captain.id,
      loyalty: 46,
      status: "active",
    });
    expect(reloaded.resources.credits).toBe(2_000);
    expect(
      reloaded.personalActionCooldowns?.[personalCooldownKey(target, "bribe")],
    ).toBe(PERSONAL_ACTIONS.bribe.cooldownTicks);
    expect(
      reloaded.personalActionHistory?.[personalCooldownKey(target, "bribe")],
    ).toEqual([before.totalTicks]);

    // Reload must not weaken the stale-menu guard or let a paid action spend
    // credits against a captain who is now KIA.
    const kiaAfterReload = {
      ...reloaded,
      retinue: {
        ...reloaded.retinue!,
        captains: [{ ...reloadedCaptain, status: "kia" as const }],
      },
    };
    const protectedState = applyPersonalInteraction(
      kiaAfterReload,
      target,
      "give-gift",
    );
    expect(protectedState).toBe(kiaAfterReload);
    expect(protectedState.resources.credits).toBe(2_000);
    expect(
      protectedState.personalActionHistory?.[personalCooldownKey(target, "bribe")],
    ).toEqual([before.totalTicks]);

    const kia = {
      ...after,
      retinue: {
        ...after.retinue!,
        captains: [{ ...changed, status: "kia" as const }],
      },
    };
    expect(applyPersonalInteraction(kia, target, "flatter")).toBe(kia);
  });

  it("blocks an unaffordable paid action without changing state except for one alert", () => {
    const seeded = createInitialState();
    const faction = seeded.factions[0];
    const before = {
      ...seeded,
      resources: { ...seeded.resources, credits: 2_999 },
      messages: [],
    };
    const after = applyPersonalInteraction(
      before,
      { kind: "faction", id: faction.id },
      "bribe",
    );

    expect(after.resources).toEqual(before.resources);
    expect(after.factions).toEqual(before.factions);
    expect(after.officers).toEqual(before.officers);
    expect(after.personalActionCooldowns).toEqual(before.personalActionCooldowns);
    expect(after.messages).toHaveLength(1);
    expect(after.messages[0].category).toBe("alert");
    expect(after.messages[0].title).toContain("INSUFFICIENT CREDITS");
  });

  it("keeps both success and blocked messages within the message cap", () => {
    const seeded = createInitialState();
    const faction = seeded.factions[0];
    const fullMessages = Array.from({ length: 200 }, (_, index) => ({
      ...seeded.messages[0],
      id: `existing-${index}`,
    }));
    const full = {
      ...seeded,
      messages: fullMessages,
      resources: { ...seeded.resources, credits: 10_000 },
    };

    const success = applyPersonalInteraction(
      full,
      { kind: "faction", id: faction.id },
      "bribe",
    );
    expect(success.messages).toHaveLength(200);
    expect(success.messages[0].category).toBe("call");

    const blocked = applyPersonalInteraction(
      { ...full, resources: { ...full.resources, credits: 0 } },
      { kind: "faction", id: faction.id },
      "bribe",
    );
    expect(blocked.messages).toHaveLength(200);
    expect(blocked.messages[0].category).toBe("alert");
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  ASSET_UPGRADES,
  getUnitTier,
  getUnitClassStrengthMultiplier,
  buildUnitTierMultiplierMap,
  canApplyAssetUpgrade,
  type AssetUpgradeDef,
} from "@/engine/assetUpgrades";
import {
  computeUnitCompositionStrength,
  UNIT_COMBAT_WEIGHTS,
} from "@/engine/combatData";
import { ITEM_DEFS } from "@/engine/inventoryData";
import { TECHNOLOGIES } from "@/engine/technologies";
import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { migrateState, unwrapSave, wrapSave } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";
import type { GameState } from "@/engine/types";

function makeState(partial: Partial<GameState>): GameState {
  return partial as GameState;
}

describe("ASSET_UPGRADES catalog integrity", () => {
  it("ships at least 20 upgrade entries across units, captains, and followers", () => {
    expect(ASSET_UPGRADES.length).toBeGreaterThanOrEqual(20);
    const units = ASSET_UPGRADES.filter((u) => u.target === "unit");
    const captains = ASSET_UPGRADES.filter((u) => u.target === "captain");
    const followers = ASSET_UPGRADES.filter((u) => u.target === "follower");
    expect(units.length).toBeGreaterThanOrEqual(6);
    expect(captains.length).toBeGreaterThanOrEqual(6);
    expect(followers.length).toBeGreaterThanOrEqual(6);
  });

  it("every unit upgrade targets a known combat unit class", () => {
    const units = ASSET_UPGRADES.filter((u) => u.target === "unit");
    for (const u of units) {
      expect(u.unitClassId).toBeTruthy();
      expect(UNIT_COMBAT_WEIGHTS).toHaveProperty(u.unitClassId!);
    }
  });

  it("every required item id resolves to a real item def", () => {
    const itemIds = new Set(ITEM_DEFS.map((d) => d.id));
    for (const u of ASSET_UPGRADES) {
      for (const req of u.reqs.items) {
        expect(itemIds.has(req.itemDefId)).toBe(true);
      }
    }
  });

  it("every required tech id resolves to a real technology", () => {
    const techIds = new Set(TECHNOLOGIES.map((t) => t.id));
    for (const u of ASSET_UPGRADES) {
      for (const techId of u.reqs.techIds) {
        expect(techIds.has(techId)).toBe(true);
      }
    }
  });

  it("every upgrade id is unique", () => {
    const ids = ASSET_UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every follower upgrade restricts to known character roles", () => {
    const KNOWN_ROLES = new Set([
      "gang_lieutenant",
      "journalist",
      "tycoon",
      "agitator",
      "celebrity",
      "informant",
      "fugitive",
      "preacher",
      "union_boss",
    ]);
    const followers = ASSET_UPGRADES.filter((u) => u.target === "follower");
    for (const u of followers) {
      expect(Array.isArray(u.followerRoles)).toBe(true);
      expect(u.followerRoles!.length).toBeGreaterThan(0);
      for (const role of u.followerRoles!) {
        expect(KNOWN_ROLES.has(role)).toBe(true);
      }
    }
  });

  it("every upgrade carries a non-trivial effect for its target type", () => {
    for (const u of ASSET_UPGRADES) {
      if (u.target === "unit") {
        expect(u.unitClassId).toBeTruthy();
        expect(typeof u.unitMultiplier).toBe("number");
        expect(u.unitMultiplier!).toBeGreaterThan(1);
      } else if (u.target === "captain") {
        expect(u.captainBonus).toBeTruthy();
        const b = u.captainBonus!;
        const sum = (b.leadership ?? 0) + (b.combat ?? 0) + (b.tactics ?? 0);
        expect(sum).toBeGreaterThan(0);
      } else if (u.target === "follower") {
        expect(typeof u.notorietyBonus).toBe("number");
        expect(u.notorietyBonus!).toBeGreaterThan(0);
      }
    }
  });
});

describe("getUnitTier", () => {
  it("returns 0 when state has no tier map", () => {
    expect(getUnitTier(makeState({}), "cityDefenseInfantry")).toBe(0);
  });

  it("returns 0 for an unknown class", () => {
    const s = makeState({ unitUpgradeTiers: { rapidResponseUnits: 2 } });
    expect(getUnitTier(s, "cityDefenseInfantry")).toBe(0);
  });

  it("returns the stored tier", () => {
    const s = makeState({ unitUpgradeTiers: { cityDefenseInfantry: 2 } });
    expect(getUnitTier(s, "cityDefenseInfantry")).toBe(2);
  });
});

describe("getUnitClassStrengthMultiplier", () => {
  it("returns 1.0 when tier is 0", () => {
    const s = makeState({});
    expect(getUnitClassStrengthMultiplier(s, "cityDefenseInfantry")).toBe(1);
  });

  it("applies +20% per tier additively for the infantry upgrade", () => {
    const s1 = makeState({ unitUpgradeTiers: { cityDefenseInfantry: 1 } });
    expect(getUnitClassStrengthMultiplier(s1, "cityDefenseInfantry")).toBeCloseTo(1.2, 5);
    const s2 = makeState({ unitUpgradeTiers: { cityDefenseInfantry: 2 } });
    expect(getUnitClassStrengthMultiplier(s2, "cityDefenseInfantry")).toBeCloseTo(1.4, 5);
    const s3 = makeState({ unitUpgradeTiers: { cityDefenseInfantry: 3 } });
    expect(getUnitClassStrengthMultiplier(s3, "cityDefenseInfantry")).toBeCloseTo(1.6, 5);
  });

  it("applies +30% per tier for the heavy mech upgrade", () => {
    const s = makeState({ unitUpgradeTiers: { heavyRiotMechUnits: 2 } });
    expect(getUnitClassStrengthMultiplier(s, "heavyRiotMechUnits")).toBeCloseTo(1.6, 5);
  });

  it("caps the bonus at the upgrade's maxTier even if the stored tier exceeds it", () => {
    const s = makeState({ unitUpgradeTiers: { heavyRiotMechUnits: 5 } });
    // heavy mech maxTier = 2, so caps at 1 + 0.3*2 = 1.6
    expect(getUnitClassStrengthMultiplier(s, "heavyRiotMechUnits")).toBeCloseTo(1.6, 5);
  });

  it("uses a default +20%/tier fallback for classes with no matching upgrade definition", () => {
    const s = makeState({ unitUpgradeTiers: { madeUpClass: 3 } });
    // 1 + 0.2 * 3 = 1.6 (no maxTier cap when upgrade definition is missing)
    expect(getUnitClassStrengthMultiplier(s, "madeUpClass")).toBeCloseTo(1.6, 5);
  });

  it("ignores negative tiers (treats them as 0)", () => {
    const s = makeState({ unitUpgradeTiers: { cityDefenseInfantry: -1 } });
    expect(getUnitClassStrengthMultiplier(s, "cityDefenseInfantry")).toBe(1);
  });
});

describe("buildUnitTierMultiplierMap", () => {
  it("returns empty when no tiers stored", () => {
    expect(buildUnitTierMultiplierMap(makeState({}))).toEqual({});
  });

  it("returns empty when all tiers are 0", () => {
    const s = makeState({ unitUpgradeTiers: { cityDefenseInfantry: 0, heavyRiotMechUnits: 0 } });
    expect(buildUnitTierMultiplierMap(s)).toEqual({});
  });

  it("includes only classes with non-trivial multipliers", () => {
    const s = makeState({
      unitUpgradeTiers: { cityDefenseInfantry: 1, heavyRiotMechUnits: 0, rapidResponseUnits: 2 },
    });
    const map = buildUnitTierMultiplierMap(s);
    expect(map).toHaveProperty("cityDefenseInfantry");
    expect(map).not.toHaveProperty("heavyRiotMechUnits");
    expect(map).toHaveProperty("rapidResponseUnits");
    expect(map.cityDefenseInfantry).toBeCloseTo(1.2, 5);
    expect(map.rapidResponseUnits).toBeCloseTo(1.4, 5);
  });
});

describe("computeUnitCompositionStrength with tier multipliers", () => {
  it("returns the same total when no multipliers are passed", () => {
    const units = { cityDefenseInfantry: 100 };
    const baseline = computeUnitCompositionStrength(units);
    expect(baseline).toBe(100 * UNIT_COMBAT_WEIGHTS.cityDefenseInfantry);
  });

  it("scales the per-class contribution by the supplied multiplier", () => {
    const units = { cityDefenseInfantry: 100 };
    const baseline = computeUnitCompositionStrength(units);
    const boosted = computeUnitCompositionStrength(units, { cityDefenseInfantry: 1.6 });
    expect(boosted).toBeCloseTo(baseline * 1.6, 5);
  });

  it("only multiplies the class explicitly listed in the multiplier map", () => {
    const units = { cityDefenseInfantry: 100, rapidResponseUnits: 50 };
    const boosted = computeUnitCompositionStrength(units, { cityDefenseInfantry: 1.5 });
    const expected =
      100 * UNIT_COMBAT_WEIGHTS.cityDefenseInfantry * 1.5 +
      50 * UNIT_COMBAT_WEIGHTS.rapidResponseUnits;
    expect(boosted).toBeCloseTo(expected, 5);
  });

  it("ignores non-numeric or non-positive multiplier values, treating as 1.0", () => {
    const units = { cityDefenseInfantry: 100 };
    const baseline = computeUnitCompositionStrength(units);
    expect(computeUnitCompositionStrength(units, { cityDefenseInfantry: 0 })).toBe(baseline);
    expect(computeUnitCompositionStrength(units, { cityDefenseInfantry: -1 })).toBe(baseline);
    // @ts-expect-error testing runtime guard for non-numeric values
    expect(computeUnitCompositionStrength(units, { cityDefenseInfantry: "x" })).toBe(baseline);
  });

  it("a tier-3 squad of 100 hits harder than a tier-0 squad of 100 (acceptance criterion)", () => {
    const units = { cityDefenseInfantry: 100 };
    const tier0 = computeUnitCompositionStrength(units);
    const stateT3 = makeState({ unitUpgradeTiers: { cityDefenseInfantry: 3 } });
    const tier3 = computeUnitCompositionStrength(units, buildUnitTierMultiplierMap(stateT3));
    expect(tier3).toBeGreaterThan(tier0);
    expect(tier3).toBeCloseTo(tier0 * 1.6, 5);
  });

  it("missing unitUpgradeTiers (old saves) yield baseline strength", () => {
    const units = { cityDefenseInfantry: 100, heavyRiotMechUnits: 20 };
    const baseline = computeUnitCompositionStrength(units);
    const oldSave = makeState({});
    const computed = computeUnitCompositionStrength(units, buildUnitTierMultiplierMap(oldSave));
    expect(computed).toBe(baseline);
  });
});

describe("canApplyAssetUpgrade — friendly names in blocked reasons", () => {
  function makeUpgrade(reqs: { techIds?: string[]; items?: { itemDefId: string; count: number }[]; credits?: number }): AssetUpgradeDef {
    return {
      id: "test_upgrade",
      name: "Test Upgrade",
      description: "test",
      target: "unit",
      unitClassId: "cityDefenseInfantry",
      reqs: {
        techIds: reqs.techIds ?? [],
        items: reqs.items ?? [],
        credits: reqs.credits ?? 0,
      },
      maxTier: 3,
    } as AssetUpgradeDef;
  }

  it("uses the human-readable tech name when research is missing", () => {
    const state = makeState({
      unlockedTechnologies: [],
      resources: { credits: 999999 } as any,
      units: { cityDefenseInfantry: 100 },
    });
    const upgrade = makeUpgrade({ techIds: ["advanced_fusion_reactors"] });
    const result = canApplyAssetUpgrade(state, upgrade, "cityDefenseInfantry");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Advanced Fusion Reactors");
      expect(result.reason).not.toContain("advanced_fusion_reactors");
    }
  });

  it("uses the human-readable item name when an item requirement is short", () => {
    const state = makeState({
      unlockedTechnologies: [],
      resources: { credits: 999999 } as any,
      units: { cityDefenseInfantry: 100 },
      inventory: { items: [], capacity: 1000 } as any,
    });
    const upgrade = makeUpgrade({ items: [{ itemDefId: "flak_vest", count: 5 }] });
    const result = canApplyAssetUpgrade(state, upgrade, "cityDefenseInfantry");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Flak Vest");
      expect(result.reason).not.toMatch(/\bflak_vest\b/);
    }
  });

  it("falls back to a humanized id for unknown techs/items", () => {
    const state = makeState({
      unlockedTechnologies: [],
      resources: { credits: 999999 } as any,
      units: { cityDefenseInfantry: 100 },
    });
    const upgrade = makeUpgrade({ techIds: ["never_heard_of_it"] });
    const result = canApplyAssetUpgrade(state, upgrade, "cityDefenseInfantry");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Never Heard Of It");
    }
  });
});

describe("raid garrison defense — tier multiplier wiring", () => {
  function createRaidState(unitUpgradeTiers?: GameState["unitUpgradeTiers"]) {
    const state = createInitialState();
    state.tickPaused = false;
    state.hasCompletedOnboarding = true;
    state.totalTicks = 1;
    state.units = Object.fromEntries(
      Object.keys(state.units).map((unitClassId) => [
        unitClassId,
        unitClassId === "cityDefenseInfantry" ? 100 : 0,
      ]),
    );
    state.unitUpgradeTiers = unitUpgradeTiers;
    state.combat = {
      ...state.combat!,
      zones: state.combat!.zones.map((zone) =>
        zone.id === "sector_alpha"
          ? { ...zone, status: "hostile", garrison: 1, threat: 20 }
          : zone,
      ),
      raidEventQueue: [
        {
          id: "raid-upgrade-regression",
          templateId: "raider_strike",
          name: "Regression Raid",
          description: "A deterministic raid fixture.",
          enemyStrength: 60,
          enemyMorale: 50,
          terrainMod: 1,
          targetZoneId: "sector_alpha",
          factionSource: "raiders",
          populationDamage: 100,
          ticksRemaining: 1,
          status: "active",
        },
      ],
    };

    return state;
  }

  function resolveRaid(unitUpgradeTiers?: GameState["unitUpgradeTiers"]) {
    return runTick(createRaidState(unitUpgradeTiers)).newState;
  }

  function reloadState(state: GameState): GameState {
    const unwrapped = unwrapSave(wrapSave(JSON.stringify(state)));
    expect(unwrapped.valid).toBe(true);
    return sanitizeState(
      migrateState(JSON.parse(unwrapped.json) as GameState),
    );
  }

  it("uses upgraded squads in the live raid resolution and preserves old-save behavior", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const baseline = resolveRaid();
      const upgraded = resolveRaid({ cityDefenseInfantry: 3 });
      const legacy = resolveRaid(undefined);

      const baselineLog = baseline.combat!.battleLog[0];
      const upgradedLog = upgraded.combat!.battleLog[0];
      const legacyLog = legacy.combat!.battleLog[0];

      expect(baselineLog.victory).toBe(false);
      expect(upgradedLog.victory).toBe(true);
      expect(upgraded.cityStats.population).toBeGreaterThan(baseline.cityStats.population);
      expect(legacyLog.victory).toBe(baselineLog.victory);
      expect(legacy.cityStats.population).toBe(baseline.cityStats.population);
    } finally {
      random.mockRestore();
    }
  });

  it("keeps upgraded raid outcomes after a save/load round trip", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const upgradedTiers = { cityDefenseInfantry: 3 };
      const inMemory = resolveRaid(upgradedTiers);
      const reloaded = runTick(reloadState(createRaidState(upgradedTiers))).newState;

      expect(reloaded.unitUpgradeTiers).toEqual(upgradedTiers);
      expect(reloaded.combat!.battleLog[0]).toEqual(inMemory.combat!.battleLog[0]);
      expect(reloaded.cityStats.population).toBe(inMemory.cityStats.population);
    } finally {
      random.mockRestore();
    }
  });

  it("keeps legacy saves without unitUpgradeTiers at baseline after reload", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const baseline = resolveRaid();
      const reloadedLegacy = runTick(reloadState(createRaidState())).newState;

      expect(reloadedLegacy.unitUpgradeTiers).toBeUndefined();
      expect(reloadedLegacy.combat!.battleLog[0]).toEqual(baseline.combat!.battleLog[0]);
      expect(reloadedLegacy.cityStats.population).toBe(baseline.cityStats.population);
    } finally {
      random.mockRestore();
    }
  });
});

describe("routine engagement combat — tier multiplier wiring", () => {
  function resolveSkirmish(unitUpgradeTiers?: GameState["unitUpgradeTiers"]) {
    const state = createInitialState();
    state.tickPaused = false;
    state.hasCompletedOnboarding = true;
    state.totalTicks = 1;
    state.units = { cityDefenseInfantry: 100 };
    state.unitUpgradeTiers = unitUpgradeTiers;
    state.combat = {
      ...state.combat!,
      activeEngagements: [
        {
          id: "skirmish-upgrade-regression",
          templateId: "underhive_skirmish",
          name: "Regression Skirmish",
          type: "skirmish",
          status: "active",
          unitsCommitted: 10,
          enemyStrength: 45,
          enemyMorale: 55,
          terrainMod: 1.2,
          ticksRemaining: 1,
          zoneId: "sector_alpha",
          doctrineId: "balanced",
        },
      ],
      battleLog: [],
    };

    return runTick(state).newState;
  }

  it("uses upgraded squads in the live routine engagement resolution", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const baseline = resolveSkirmish();
      const upgraded = resolveSkirmish({ cityDefenseInfantry: 3 });

      const baselineLog = baseline.combat!.battleLog[0];
      const upgradedLog = upgraded.combat!.battleLog[0];

      expect(baselineLog.victory).toBe(true);
      expect(upgradedLog.victory).toBe(true);
      expect(upgradedLog.dominance).toBeGreaterThan(baselineLog.dominance);
      expect(upgradedLog.enemyCasualties).toBeGreaterThan(baselineLog.enemyCasualties);
    } finally {
      random.mockRestore();
    }
  });
});

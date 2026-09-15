import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createInitialState } from "@/engine/initialState";
import { createDefaultLogisticsState } from "@/engine/militaryOverhaul";
import {
  computeDefenseBreakdown,
  computeDefenseBonus,
  computeMilitaryStrength,
  DEFENSE_BUILDING_WEIGHTS,
  DEFENSE_UNIT_WEIGHTS,
  DEFENSE_EDICT_IDS,
  HIGH_ZONE_THREAT,
  LOW_READINESS_THRESHOLD,
  NUCLEAR_DETERRENT_TECHS,
  type DefenseSuggestionTarget,
} from "@/engine/defenseBreakdown";
import type { GameState, HostileRaidEvent } from "@/engine/types";
import { EDICTS } from "@/engine/edicts";
import { navigateToDefenseSuggestion } from "@/utils/defenseNavigation";
import { router } from "expo-router";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

// ─────────────────────────────────────────────────────────────────────────────
// Defense breakdown — the "diagnose -> one-tap fix" card for the sector's Defense
// Rating, mirroring the power / water / crime pattern. Defense Rating is a 0..100
// stat (higher is better), so instead of a per-tick net the readout lists the
// contributors building the rating and — the headline lesson — the defense being
// forfeited to UNDER-MANNED installations. These tests prove:
//   1. the readout's levers weight the rating exactly like the sim,
//   2. under-manned bases surface a personnel/manning callout, and
//   3. every construction-category deep-link resolves to a real category id, so a
//      rename or removal in construction.tsx is caught here.
// ─────────────────────────────────────────────────────────────────────────────

const engineSource = (rel: string) =>
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), "utf8");

// A clean slate with every defense lever emptied, so each test opts in to exactly
// the contributors it means to exercise.
function baseState(): GameState {
  const s = createInitialState();
  s.buildings = {};
  s.units = {};
  s.megaProjects = [];
  s.unlockedTechnologies = [];
  s.cityStats.defenseRating = 80; // no alarm unless a test lowers it
  return s;
}

function withLogistics(
  s: GameState,
  over: Partial<ReturnType<typeof createDefaultLogisticsState>>,
): void {
  s.militaryOverhaul = {
    ...(s.militaryOverhaul as NonNullable<GameState["militaryOverhaul"]>),
    logistics: { ...createDefaultLogisticsState(), ...over },
  };
}

describe("defense breakdown — contributors mirror the sim", () => {
  it("computeDefenseBonus / computeMilitaryStrength weight the stacks", () => {
    // cityShieldGenerator weight 8, perimeterMegaWalls weight 3.
    expect(computeDefenseBonus({ cityShieldGenerator: 2, perimeterMegaWalls: 3 })).toBe(25);
    // judgeGunships weight 0.5; cityDefenseInfantry weight 0.1.
    expect(computeMilitaryStrength({ judgeGunships: 4 })).toBeCloseTo(2, 5);
    expect(computeMilitaryStrength({ cityDefenseInfantry: 100 })).toBeCloseTo(10, 5);
  });

  it("a strong sector lists its contributors and raises no alarms", () => {
    const s = baseState();
    s.buildings = { cityShieldGenerator: 5 }; // defenseBonus 40
    s.units = { judgeGunships: 100 }; // strength 50 -> unitDefense floor(5) = 5
    s.cityStats.defenseRating = 80;
    const bd = computeDefenseBreakdown(s);
    expect(bd.positives.find((p) => p.label === "Defensive structures")?.amount).toBe(40);
    expect(bd.positives.find((p) => p.label === "City-defense units")?.amount).toBe(5);
    // A strong, fully-manned sector must not nag the Commander.
    expect(bd.suggestions).toHaveLength(0);
  });

  it("nuclear program and stockpile mirror the sim — and the stockpile is gated on the tech", () => {
    const s = baseState();
    s.unlockedTechnologies = ["mil_nuclear_weapons_program", "mil_antimatter_warheads"];
    s.nuclearStockpile = {
      warheads: 10,
      productionRate: 0,
      maintenanceCost: 0,
      deterrenceLevel: 0,
      lastProductionTick: 0,
    };
    const bd = computeDefenseBreakdown(s);
    // 5 (program) + 8 (antimatter) = 13; stockpile min(15, floor(10 * 0.8)) = 8.
    expect(bd.positives.find((p) => p.label === "Nuclear deterrent")?.amount).toBe(13);
    expect(bd.positives.find((p) => p.label === "Nuclear stockpile")?.amount).toBe(8);

    // Warheads with the program tech removed contribute nothing — the sim only
    // folds stockpile deterrence in when the program is unlocked.
    const s2 = baseState();
    s2.unlockedTechnologies = [];
    s2.nuclearStockpile = {
      warheads: 10,
      productionRate: 0,
      maintenanceCost: 0,
      deterrenceLevel: 0,
      lastProductionTick: 0,
    };
    const bd2 = computeDefenseBreakdown(s2);
    expect(bd2.positives.some((p) => p.label === "Nuclear stockpile")).toBe(false);
  });

  it("order doctrine only counts when tilted toward order", () => {
    const s = baseState();
    s.doctrine = { ...s.doctrine, orderVsProsperity: 100 };
    expect(
      computeDefenseBreakdown(s).positives.find((p) => p.label === "Order doctrine")?.amount,
    ).toBe(2);
    // Tilted toward prosperity, the doctrine term is negative, so it is not a
    // positive contributor and must not appear.
    s.doctrine = { ...s.doctrine, orderVsProsperity: 0 };
    expect(computeDefenseBreakdown(s).positives.some((p) => p.label === "Order doctrine")).toBe(
      false,
    );
  });
});

describe("defense breakdown — manning is the headline lesson", () => {
  it("under-manned bases forfeit defense and trigger a personnel callout", () => {
    const s = baseState();
    s.cityStats.defenseRating = 40;
    // 2 missile-defense batteries: 8 defenseBonus each -> 16 fully-manned potential.
    // Half-manned, so the sim's realised bonus is round(16 * 0.5) = 8; 8 forfeited.
    withLogistics(s, {
      installationsBuilt: { missile_defense_battery: 2 },
      garrisonDemand: 80,
      garrisonCoverage: 0.5,
      installationDefenseBonus: 8,
    });
    const bd = computeDefenseBreakdown(s);
    expect(bd.installationDefensePotential).toBe(16);
    expect(bd.installationDefenseRealised).toBe(8);
    expect(bd.garrisonCoverage).toBe(0.5);
    expect(bd.negatives.find((n) => n.label === "Under-manned bases")?.amount).toBe(8);
    expect(bd.positives.find((p) => p.label === "Manned installations")?.amount).toBe(8);

    // The manning fix must lead, name the coverage, call out personnel, and send
    // the Commander to recruitment.
    const first = bd.suggestions[0];
    expect(first.text).toContain("50% manned");
    expect(first.text.toLowerCase()).toContain("personnel");
    expect(first.target).toEqual({ screen: "recruitment" });
  });

  it("a fully-manned base forfeits nothing and raises no manning alarm", () => {
    const s = baseState();
    s.cityStats.defenseRating = 80;
    withLogistics(s, {
      installationsBuilt: { missile_defense_battery: 2 },
      garrisonDemand: 80,
      garrisonCoverage: 1,
      installationDefenseBonus: 16,
    });
    const bd = computeDefenseBreakdown(s);
    expect(bd.negatives.some((n) => n.label === "Under-manned bases")).toBe(false);
    expect(bd.positives.find((p) => p.label === "Manned installations")?.amount).toBe(16);
    expect(bd.suggestions).toHaveLength(0);
  });
});

describe("defense recovery suggestions — deep-links stay valid", () => {
  type ConstructionTarget = Extract<DefenseSuggestionTarget, { screen: "construction" }>;

  // Text-parse the real category ids from construction.tsx (source of truth)
  // rather than importing the RN/expo-router screen, exactly like the power test.
  const constructionSource = engineSource("../../app/(game)/construction.tsx");
  const validCategoryIds = new Set(
    [...constructionSource.matchAll(/id:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]),
  );

  // A weak sector whose bases are built but badly under-manned trips the manning,
  // defensive-structures, and city-defense-unit branches (but NOT build-bases).
  const underMannedState = (): GameState => {
    const s = baseState();
    s.cityStats.defenseRating = 10;
    withLogistics(s, {
      installationsBuilt: { missile_defense_battery: 2 },
      garrisonDemand: 80,
      garrisonCoverage: 0.25,
      installationDefenseBonus: 4,
    });
    return s;
  };

  // A weak sector with no installations at all trips defensive-structures,
  // city-defense-units, and the build-bases branch (but NOT manning).
  const noBasesState = (): GameState => {
    const s = baseState();
    s.cityStats.defenseRating = 10;
    return s;
  };

  it("parses a sane set of construction category ids", () => {
    expect(validCategoryIds.size).toBeGreaterThanOrEqual(10);
    expect(validCategoryIds.has("defense")).toBe(true);
  });

  it("an under-manned sector leads with the personnel fix and offers build/recruit/edict tips", () => {
    const { suggestions } = computeDefenseBreakdown(underMannedState());
    // manning + defensive-structures + city-defense-units + enact-a-defense-edict.
    expect(suggestions).toHaveLength(4);
    // Manning leads.
    expect(suggestions[0].target).toEqual({ screen: "recruitment" });
    expect(suggestions[0].text).toContain("25% manned");
    // One defensive-structures tip into the defense construction category.
    const categories = suggestions
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction")
      .map((t) => t.category);
    expect(categories).toEqual(["defense"]);
    // Bases exist, so the "build installations" tip must NOT fire.
    expect(suggestions.some((s) => s.target?.screen === "military")).toBe(false);
    // With no defense edict active, the card offers enacting one (law screen).
    const edictTip = suggestions.find((s) => s.target?.screen === "law");
    expect(edictTip).toBeDefined();
    expect(edictTip?.text.toLowerCase()).toContain("edict");
  });

  it("a sector with no installations is told to build them (no manning nag)", () => {
    const { suggestions } = computeDefenseBreakdown(noBasesState());
    // defensive-structures + city-defense-units + enact-a-defense-edict + build-bases.
    expect(suggestions).toHaveLength(4);
    expect(suggestions.some((s) => s.target?.screen === "military")).toBe(true);
    // With no bases there is nothing to man, so the manning callout must be absent.
    expect(suggestions.some((s) => /% manned/.test(s.text))).toBe(false);
  });

  it("every construction deep-link resolves to a real category id", () => {
    const targets = [underMannedState(), noBasesState()]
      .flatMap((s) => computeDefenseBreakdown(s).suggestions)
      .map((s) => s.target)
      .filter((t): t is ConstructionTarget => t?.screen === "construction");
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(
        validCategoryIds.has(target.category),
        `defense recovery tip deep-links to construction category "${target.category}", which is not a real CATEGORIES id in construction.tsx`,
      ).toBe(true);
    }
  });

  it("the defensive-structures tip lands on the highest-impact structure", () => {
    const tip = computeDefenseBreakdown(noBasesState())
      .suggestions.map((s) => s.target)
      .find(
        (t): t is ConstructionTarget => t?.screen === "construction" && t.category === "defense",
      );
    // cityShieldGenerator is the heaviest defensive-building weight (8).
    expect(tip?.highlight).toBe("cityShieldGenerator");
  });
});

describe("defense breakdown — raids, readiness, and edicts drive the alarm", () => {
  // A strong, fully-supplied sector that raises no alarms on its own, so each
  // test can opt in to exactly the new trigger it means to exercise.
  const strongState = (): GameState => {
    const s = baseState();
    s.buildings = { cityShieldGenerator: 5 }; // defenseBonus 40
    s.units = { judgeGunships: 100 }; // unitDefense 5
    s.cityStats.defenseRating = 80;
    return s;
  };

  const incomingRaid = (): HostileRaidEvent => ({
    id: "raid-1",
    templateId: "rust_pack_raid",
    name: "Rust-Pack Raiders",
    description: "A war-band is closing on the perimeter.",
    enemyStrength: 40,
    enemyMorale: 60,
    terrainMod: 1,
    targetZoneId: "sector_alpha",
    factionSource: "raiders",
    populationDamage: 0,
    ticksRemaining: 3,
    status: "incoming",
  });

  it("a strong sector stays quiet until something actually threatens it", () => {
    const bd = computeDefenseBreakdown(strongState());
    // The permanent hostile wasteland is the baseline map, not a rising threat.
    expect(bd.raidThreatRising).toBe(false);
    expect(bd.incomingRaids).toBe(0);
    expect(bd.suggestions).toHaveLength(0);
  });

  it("an incoming raid raises the alarm and leads with the raid warning", () => {
    const s = strongState();
    s.combat = { ...s.combat!, raidEventQueue: [incomingRaid()] };
    const bd = computeDefenseBreakdown(s);
    expect(bd.raidThreatRising).toBe(true);
    expect(bd.incomingRaids).toBe(1);
    // The raid warning leads and sends the Commander to the Military screen.
    expect(bd.suggestions[0].text.toLowerCase()).toContain("raid threat is rising");
    expect(bd.suggestions[0].target).toEqual({ screen: "military" });
  });

  it("threat climbing on a player-held zone counts as a rising raid threat", () => {
    const s = strongState();
    s.combat = {
      ...s.combat!,
      zones: s.combat!.zones.map((z) =>
        z.id === "sector_alpha" ? { ...z, threat: HIGH_ZONE_THREAT + 10 } : z,
      ),
    };
    const bd = computeDefenseBreakdown(s);
    expect(bd.raidThreatRising).toBe(true);
    expect(bd.maxFriendlyThreat).toBe(HIGH_ZONE_THREAT + 10);
    expect(bd.suggestions.some((sg) => /your own sectors/.test(sg.text))).toBe(true);
  });

  it("low force readiness raises the alarm and points at supply/crewing", () => {
    const s = strongState();
    s.militaryOverhaul = {
      ...(s.militaryOverhaul as NonNullable<GameState["militaryOverhaul"]>),
      readiness: LOW_READINESS_THRESHOLD - 20,
    };
    const bd = computeDefenseBreakdown(s);
    expect(bd.readiness).toBe(LOW_READINESS_THRESHOLD - 20);
    expect(bd.raidThreatRising).toBe(false);
    const readinessTip = bd.suggestions.find(
      (sg) => sg.target?.screen === "military" && /readiness/i.test(sg.text),
    );
    expect(readinessTip).toBeDefined();
  });

  it("the enact-an-edict tip disappears once a defense edict is in force", () => {
    const s = baseState();
    s.cityStats.defenseRating = 10;
    withLogistics(s, {
      installationsBuilt: { missile_defense_battery: 2 },
      garrisonDemand: 80,
      garrisonCoverage: 0.25,
      installationDefenseBonus: 4,
    });
    s.activeEdicts = [
      { edictId: DEFENSE_EDICT_IDS[0], ticksRemaining: 5, issuedAtTick: 0, cooldownUntilTick: 10 },
    ];
    const { suggestions } = computeDefenseBreakdown(s);
    // manning + defensive-structures + city-defense-units, but NO edict tip.
    expect(suggestions).toHaveLength(3);
    expect(suggestions.some((sg) => sg.target?.screen === "law")).toBe(false);
  });

  it("a defense-boosting edict outside the recommended list still suppresses the tip", () => {
    // The detection derives from the edict table, so ANY defenseRating-boosting
    // edict counts — not only the two named in the recommendation copy.
    const boosting = EDICTS.find(
      (e) =>
        (e.effects.defenseRating ?? 0) > 0 &&
        !(DEFENSE_EDICT_IDS as readonly string[]).includes(e.id),
    );
    expect(boosting).toBeDefined();
    const s = baseState();
    s.cityStats.defenseRating = 10;
    withLogistics(s, {
      installationsBuilt: { missile_defense_battery: 2 },
      garrisonDemand: 80,
      garrisonCoverage: 0.25,
      installationDefenseBonus: 4,
    });
    s.activeEdicts = [
      { edictId: boosting!.id, ticksRemaining: 5, issuedAtTick: 0, cooldownUntilTick: 10 },
    ];
    const { suggestions } = computeDefenseBreakdown(s);
    expect(suggestions.some((sg) => sg.target?.screen === "law")).toBe(false);
  });

  it("every suggested deep-link resolves to a known destination screen", () => {
    const s = strongState();
    s.cityStats.defenseRating = 10; // trip every branch at once
    s.combat = { ...s.combat!, raidEventQueue: [incomingRaid()] };
    s.militaryOverhaul = {
      ...(s.militaryOverhaul as NonNullable<GameState["militaryOverhaul"]>),
      readiness: 20,
    };
    s.buildings = {};
    s.units = {};
    const validScreens = new Set(["construction", "military", "recruitment", "law"]);
    const screens = computeDefenseBreakdown(s)
      .suggestions.map((sg) => sg.target?.screen)
      .filter((x): x is NonNullable<typeof x> => x != null);
    expect(screens.length).toBeGreaterThan(0);
    for (const screen of screens) {
      expect(validScreens.has(screen), `unknown deep-link screen "${screen}"`).toBe(true);
    }
    // The raid, readiness, and edict paths must all be represented.
    expect(screens).toContain("law");
    expect(screens).toContain("military");
  });

  it("navigates every target a worst-case diagnosis can emit — no dead taps", () => {
    const push = router.push as unknown as ReturnType<typeof vi.fn>;
    const state = strongState();
    state.cityStats.defenseRating = 10;
    state.combat = { ...state.combat!, raidEventQueue: [incomingRaid()] };
    state.militaryOverhaul = {
      ...(state.militaryOverhaul as NonNullable<GameState["militaryOverhaul"]>),
      readiness: 20,
    };
    state.buildings = {};
    state.units = {};
    const targets = computeDefenseBreakdown(state)
      .suggestions
      .map((suggestion) => suggestion.target)
      .filter((target): target is NonNullable<typeof target> => !!target);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      push.mockReset();
      navigateToDefenseSuggestion(target);
      expect(push, `defense recovery tip for screen "${target.screen}" did nothing`).toHaveBeenCalledTimes(1);
    }
  });
});

describe("defense weights stay pinned to the sim", () => {
  const formulasSource = engineSource("../formulas.ts");

  // Assert each mirrored weight still appears in formulas.ts's DEFENSE RATING
  // block as `"<key>") * <weight>` — a value change in the sim trips this.
  const pinned = (key: string, weight: number): boolean => {
    const w = String(weight).replace(".", "\\.");
    return new RegExp(`"${key}"\\s*\\)\\s*\\*\\s*${w}\\b`).test(formulasSource);
  };

  it("every defensive-building weight matches the sim", () => {
    for (const [key, weight] of Object.entries(DEFENSE_BUILDING_WEIGHTS)) {
      expect(pinned(key, weight), `defensive building "${key}" (weight ${weight}) drifted`).toBe(
        true,
      );
    }
  });

  it("every city-defense-unit weight matches the sim", () => {
    for (const [key, weight] of Object.entries(DEFENSE_UNIT_WEIGHTS)) {
      expect(pinned(key, weight), `city-defense unit "${key}" (weight ${weight}) drifted`).toBe(
        true,
      );
    }
  });

  it("the nuclear deterrent techs and the manning field are still read by the sim", () => {
    for (const tech of Object.keys(NUCLEAR_DETERRENT_TECHS)) {
      expect(formulasSource.includes(`"${tech}"`), `nuclear tech "${tech}" no longer read`).toBe(
        true,
      );
    }
    // The manning bonus the card leans on must still feed defenseRating.
    expect(/logistics\?\.installationDefenseBonus/.test(formulasSource)).toBe(true);
  });
});

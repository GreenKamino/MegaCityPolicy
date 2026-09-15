import { describe, it, expect } from "vitest";
import { RESEARCH_EVENT_CHAINS } from "@/engine/researchEventChain";
import { EVENT_CHAINS } from "@/engine/eventChains";
import { ALL_TECHNOLOGIES } from "@/engine/technologies";
import { ARRAY_CAPS } from "@/engine/sanitizer";
import type { GameState } from "@/engine/types";

const TECH_IDS: ReadonlySet<string> = new Set(ALL_TECHNOLOGIES.map((t) => t.id));

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    totalTicks: 0,
    unlockedTechnologies: [],
    activeEventChains: [],
    ...overrides,
  } as unknown as GameState;
}

describe("RESEARCH_EVENT_CHAINS catalog integrity", () => {
  it("ships exactly 9 chains (3 EARLY + 3 MID + 3 LATE)", () => {
    expect(RESEARCH_EVENT_CHAINS.length).toBe(9);
  });

  it("every chain id is unique within the research bank", () => {
    const ids = RESEARCH_EVENT_CHAINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every chain id is unique across the merged EVENT_CHAINS pool (no collisions with base or business chains)", () => {
    const allIds = EVENT_CHAINS.map((c) => c.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("every anchor and grant tech id referenced by a chain exists in ALL_TECHNOLOGIES", () => {
    const referenced = new Set<string>();
    for (const chain of RESEARCH_EVENT_CHAINS) {
      for (const stage of chain.stages) {
        for (const response of stage.responses) {
          if (response.unlockTechId) referenced.add(response.unlockTechId);
        }
      }
    }
    const missing = [...referenced].filter((id) => !TECH_IDS.has(id));
    expect(missing).toEqual([]);
  });

  it("every chain has cooldownTicks set to a one-shot value", () => {
    for (const chain of RESEARCH_EVENT_CHAINS) {
      expect(chain.cooldownTicks).toBeGreaterThanOrEqual(9999);
    }
  });
});

describe("RESEARCH_EVENT_CHAINS phase gating", () => {
  // Tech ids referenced as anchors per phase (from the design notes header).
  const EARLY_ANCHORS = ["advanced_fusion_reactors", "mega_vertical_farming", "ultra_efficient_desalination"];
  const MID_ANCHORS = ["smart_grid_load_balancing", "bio_filtration_plants", "food_preservation_nanotech"];
  const LATE_ANCHORS = [
    "autonomous_energy_distribution",
    "stormwater_harvest_systems",
    "advanced_sanitation_chemistry",
    "story_lazarus_protocol",
  ];

  function eligibleChains(s: GameState): string[] {
    return RESEARCH_EVENT_CHAINS.filter((c) => c.triggerCheck(s)).map((c) => c.id);
  }

  it("EARLY-window state with all early anchers fires only early chains", () => {
    const s = baseState({
      totalTicks: 100,
      unlockedTechnologies: [...EARLY_ANCHORS],
    });
    const eligible = eligibleChains(s);
    expect(eligible.sort()).toEqual(["re_brackish_intake", "re_first_harvest", "re_grid_strain"]);
  });

  it("MID-window state with mid anchors fires only mid chains, never early", () => {
    // Pad to 12 unlocked techs to land in the MID techCount band [10..23].
    const padding = ALL_TECHNOLOGIES.slice(0, 12 - MID_ANCHORS.length).map((t) => t.id);
    const s = baseState({
      totalTicks: 200,
      unlockedTechnologies: [...new Set([...MID_ANCHORS, ...padding])],
    });
    const eligible = eligibleChains(s);
    for (const id of eligible) {
      expect(["re_district_audit", "re_microbial_swap", "re_ration_failure"]).toContain(id);
    }
    expect(eligible.length).toBeGreaterThan(0);
  });

  it("LATE-window state fires only late chains, never early or mid", () => {
    // Pad to 26 unlocked techs to land in the LATE band (>=24).
    const padding = ALL_TECHNOLOGIES.slice(0, 26 - LATE_ANCHORS.length).map((t) => t.id);
    const s = baseState({
      totalTicks: 400,
      unlockedTechnologies: [...new Set([...LATE_ANCHORS, ...padding])],
    });
    const eligible = eligibleChains(s);
    for (const id of eligible) {
      expect(["re_geothermal_breach", "re_pipeline_skin", "re_blacksite_signal"]).toContain(id);
    }
    expect(eligible.length).toBeGreaterThan(0);
  });

  it("a player who unlocks a LATE anchor early can still fire the LATE chain once they reach the LATE band", () => {
    // Lazarus unlocked very early, but tech count is still <24.
    const earlyState = baseState({
      totalTicks: 60,
      unlockedTechnologies: ["story_lazarus_protocol"],
    });
    expect(eligibleChains(earlyState)).not.toContain("re_blacksite_signal");

    // Same player later — tech count crosses the LATE threshold.
    const padding = ALL_TECHNOLOGIES.slice(0, 25).map((t) => t.id);
    const lateState = baseState({
      totalTicks: 400,
      unlockedTechnologies: [...new Set(["story_lazarus_protocol", ...padding])],
    });
    expect(eligibleChains(lateState)).toContain("re_blacksite_signal");
  });
});

describe("RESEARCH_EVENT_CHAINS one-shot guard", () => {
  it("a chain stops being eligible once an entry exists in activeEventChains, even if the grant tech was never unlocked", () => {
    // Player picks the non-unlock response (e.g. THROTTLE THE REACTOR).
    // The chain entry remains in activeEventChains; notFiredYet() returns false.
    const before = baseState({
      totalTicks: 100,
      unlockedTechnologies: ["advanced_fusion_reactors"],
    });
    expect(RESEARCH_EVENT_CHAINS.find((c) => c.id === "re_grid_strain")!.triggerCheck(before)).toBe(true);

    const after: GameState = {
      ...before,
      activeEventChains: [
        {
          chainId: "re_grid_strain",
          currentStageId: "rgs_stage1",
          choicesMade: ["rgs_throttle"],
          startTick: 100,
          resolved: true,
        } as any,
      ],
    } as GameState;
    expect(RESEARCH_EVENT_CHAINS.find((c) => c.id === "re_grid_strain")!.triggerCheck(after)).toBe(false);
  });
});

describe("activeEventChains save-load tombstone retention", () => {
  // Each chain that fires (resolved or unresolved) leaves an entry in
  // activeEventChains. The sanitizer caps that array on save/load via
  // capArray (slice(0, cap) — keeps oldest, drops newest). The cap must
  // therefore be large enough to retain every chain a long-running save
  // could plausibly accumulate, otherwise late-game tombstones get
  // dropped and one-shot chains can re-fire.
  it("ARRAY_CAPS.activeEventChains is large enough to hold every defined chain plus headroom", () => {
    const totalChains = EVENT_CHAINS.length;
    expect(ARRAY_CAPS.activeEventChains).toBeGreaterThanOrEqual(totalChains);
  });

  it("ARRAY_CAPS.activeEventChains is sized in the tombstone-array tier (>= 150)", () => {
    expect(ARRAY_CAPS.activeEventChains).toBeGreaterThanOrEqual(150);
  });
});

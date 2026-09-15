import { describe, expect, it } from "vitest";

import { resolveMegafaunaHunt, resolveMegafaunaRetaliation } from "@/engine/megafaunaHunts";
import { processWildlandsProjects } from "@/engine/wildlandsProjects";
import { createInitialState } from "@/engine/initialState";
import { sanitizeWildlandsProject } from "@/engine/sanitizer";
import type { GameState, WildlandsProject, TickEntry } from "@/engine/types";

function makeHuntProject(opts: {
  ticksRemaining?: number;
  loadout?: Record<string, number>;
  megafaunaId?: "tarpit_titan" | "ridge_tyrant" | "glassback_whale";
} = {}): WildlandsProject {
  return {
    id: "hunt-test-1",
    kind: "beast_hunt",
    biome: "ash_forest",
    ticksRemaining: opts.ticksRemaining ?? 0,
    totalTicks: 4,
    status: "active",
    meta: {
      megafaunaId: opts.megafaunaId ?? "ridge_tyrant",
      loadoutSnapshot: opts.loadout ?? { troops: 30, mechWalkers: 4 },
    },
  };
}

function makeRetaliationProject(opts: {
  ticksRemaining?: number;
  huntOutcome?: "wounded_retreat" | "rout";
  originalDeployed?: number;
  megafaunaId?: "tarpit_titan" | "ridge_tyrant" | "glassback_whale";
} = {}): WildlandsProject {
  return {
    id: "retal-test-1",
    kind: "megafauna_retaliation",
    biome: "ash_forest",
    ticksRemaining: opts.ticksRemaining ?? 0,
    totalTicks: 8,
    status: "active",
    meta: {
      megafaunaId: opts.megafaunaId ?? "ridge_tyrant",
      huntOutcome: opts.huntOutcome ?? "rout",
      originalDeployed: opts.originalDeployed ?? 30,
    },
  };
}

function setupState(): GameState {
  const s = createInitialState();
  // Real combat unit keys from UNIT_ROLE_MAP so isCombatUnitKey() recognises them.
  s.units = { cityDefenseInfantry: 200, sectorDefenseTroops: 80 };
  s.resources = {
    ...s.resources,
    food: 500,
    water: 500,
    steel: 500,
    credits: 50000,
  };
  return s;
}

describe("resolveMegafaunaHunt — retaliation scheduling", () => {
  it("schedules a retaliation project when the hunt routs", () => {
    // Force a rout: worst-case rolls + tiny force.
    const orig = Math.random;
    Math.random = () => 0.99;
    try {
      const state = setupState();
      const project = makeHuntProject({ loadout: { cityDefenseInfantry: 1 } });
      const entries: TickEntry[] = [];
      resolveMegafaunaHunt(state, project, entries);
      const retal = (state.wildlandsProjects ?? []).find((p) => p.kind === "megafauna_retaliation");
      expect(retal).toBeDefined();
      expect(retal?.meta?.megafaunaId).toBe("ridge_tyrant");
      expect(retal?.meta?.huntOutcome).toBe("rout");
      expect(retal?.biome).toBe("ash_forest");
      // Rout fuse: 4–8 ticks.
      expect(retal?.ticksRemaining).toBeGreaterThanOrEqual(4);
      expect(retal?.ticksRemaining).toBeLessThanOrEqual(8);
    } finally {
      Math.random = orig;
    }
  });

  it("does NOT schedule a retaliation on a clean kill", () => {
    const orig = Math.random;
    Math.random = () => 0.01; // best-case rolls → full kill
    try {
      const state = setupState();
      const project = makeHuntProject({ loadout: { cityDefenseInfantry: 200, sectorDefenseTroops: 80 } });
      const entries: TickEntry[] = [];
      resolveMegafaunaHunt(state, project, entries);
      const retal = (state.wildlandsProjects ?? []).find((p) => p.kind === "megafauna_retaliation");
      expect(retal).toBeUndefined();
    } finally {
      Math.random = orig;
    }
  });

  it("emits a critical-priority inbox warning when a rout schedules retaliation", () => {
    const orig = Math.random;
    Math.random = () => 0.99;
    try {
      const state = setupState();
      const project = makeHuntProject({ loadout: { cityDefenseInfantry: 1 } });
      resolveMegafaunaHunt(state, project, []);
      const warn = (state.messages ?? []).find((m) =>
        m.title.startsWith("RETALIATION INCOMING"),
      );
      expect(warn).toBeDefined();
      expect(warn?.priority).toBe("critical");
    } finally {
      Math.random = orig;
    }
  });
});

describe("resolveMegafaunaRetaliation — strike effects", () => {
  it("inflicts garrison casualties, civic damage, and stockpile loss on rout-driven retaliation", () => {
    const state = setupState();
    const startFood = state.resources.food;
    const startSteel = state.resources.steel;
    const startHappiness = state.cityStats.happiness;
    const startUnrest = state.cityStats.unrest;
    const startInfantry = state.units!.cityDefenseInfantry!;
    const project = makeRetaliationProject({ huntOutcome: "rout", originalDeployed: 50 });
    const entries: TickEntry[] = [];
    resolveMegafaunaRetaliation(state, project, entries);

    const totalInfantryAfter = (state.units!.cityDefenseInfantry ?? 0) + (state.units!.sectorDefenseTroops ?? 0);
    expect(state.resources.food).toBeLessThan(startFood);
    expect(state.resources.steel).toBeLessThan(startSteel);
    expect(state.cityStats.happiness).toBeLessThan(startHappiness);
    expect(state.cityStats.unrest).toBeGreaterThan(startUnrest);
    expect(totalInfantryAfter).toBeLessThan(startInfantry + (80));
    expect(entries.some((e) => e.label.includes("RETALIATION"))).toBe(true);
    const msg = state.messages?.find((m) => m.title.includes("BREACHED THE LINE"));
    expect(msg).toBeDefined();
    expect(msg?.priority).toBe("critical");
  });

  it("scales damage lower for wounded-retreat retaliation than rout", () => {
    const stateWound = setupState();
    const stateRout = setupState();
    resolveMegafaunaRetaliation(
      stateWound,
      makeRetaliationProject({ huntOutcome: "wounded_retreat", originalDeployed: 50 }),
      [],
    );
    resolveMegafaunaRetaliation(
      stateRout,
      makeRetaliationProject({ huntOutcome: "rout", originalDeployed: 50 }),
      [],
    );
    expect(stateRout.resources.food).toBeLessThan(stateWound.resources.food);
    expect(stateRout.cityStats.happiness).toBeLessThan(stateWound.cityStats.happiness);
  });

  it("uses HIT (not BREACHED) headline for wounded-retreat retaliation", () => {
    const state = setupState();
    resolveMegafaunaRetaliation(
      state,
      makeRetaliationProject({ huntOutcome: "wounded_retreat", originalDeployed: 30 }),
      [],
    );
    const msg = state.messages?.find((m) => m.title.includes("HIT THE PERIMETER"));
    expect(msg).toBeDefined();
    expect(msg?.priority).toBe("high");
  });

  it("returns silently when meta.megafaunaId is missing", () => {
    const state = setupState();
    const proj: WildlandsProject = {
      id: "retal-bad",
      kind: "megafauna_retaliation",
      biome: "ash_forest",
      ticksRemaining: 0,
      totalTicks: 8,
      status: "active",
      meta: {},
    };
    const before = JSON.stringify(state.cityStats);
    resolveMegafaunaRetaliation(state, proj, []);
    expect(JSON.stringify(state.cityStats)).toBe(before);
  });

  it("emboldens cult factions and erodes underclass loyalty", () => {
    const state = setupState();
    state.factions = [
      { id: "cult-a", name: "Cult A", type: "cult", threat: 20, loyalty: 0 } as any,
      { id: "uc-a", name: "Underclass A", type: "underclass", threat: 0, loyalty: 50 } as any,
    ];
    resolveMegafaunaRetaliation(
      state,
      makeRetaliationProject({ huntOutcome: "rout", originalDeployed: 30 }),
      [],
    );
    const cult = state.factions!.find((f: any) => f.id === "cult-a") as any;
    const uc = state.factions!.find((f: any) => f.id === "uc-a") as any;
    expect(cult.threat).toBe(25); // +5 on rout
    expect(uc.loyalty).toBe(47); // -3 on rout
  });
});

describe("processWildlandsProjects — retaliation tick-down", () => {
  it("counts down the retaliation timer and resolves on expiry", () => {
    const state = setupState();
    state.wildlandsProjects = [makeRetaliationProject({ ticksRemaining: 2, huntOutcome: "rout" })];
    const entries: TickEntry[] = [];
    processWildlandsProjects(state, entries);
    // Tick 1: still active.
    expect(state.wildlandsProjects![0].ticksRemaining).toBe(1);
    expect(state.wildlandsProjects![0].status).toBe("active");

    processWildlandsProjects(state, entries);
    // Tick 2: resolved.
    const proj = state.wildlandsProjects!.find((p) => p.kind === "megafauna_retaliation");
    expect(proj?.status).toBe("completed");
    expect(entries.some((e) => e.label.includes("RETALIATION"))).toBe(true);
  });

  it("preserves a retaliation scheduled by hunt resolution through processWildlandsProjects", () => {
    // Architect-flagged regression: hunt resolver mutates state.wildlandsProjects
    // mid-tick; the project array must include the spawned retaliation after
    // the function rewrites the array.
    const orig = Math.random;
    Math.random = () => 0.99; // force rout
    try {
      const state = setupState();
      const hunt: WildlandsProject = {
        id: "hunt-due",
        kind: "beast_hunt",
        biome: "ash_forest",
        ticksRemaining: 1,
        totalTicks: 4,
        status: "active",
        meta: {
          megafaunaId: "ridge_tyrant",
          loadoutSnapshot: { cityDefenseInfantry: 1 },
        },
      };
      state.wildlandsProjects = [hunt];
      processWildlandsProjects(state, []);
      const retal = state.wildlandsProjects!.find((p) => p.kind === "megafauna_retaliation");
      expect(retal).toBeDefined();
      expect(retal?.status).toBe("active");
      expect(retal?.meta?.megafaunaId).toBe("ridge_tyrant");
    } finally {
      Math.random = orig;
    }
  });

  it("skips scheduling a duplicate retaliation when one is already pending for the same boss", () => {
    const orig = Math.random;
    Math.random = () => 0.99;
    try {
      const state = setupState();
      // Pre-existing retaliation for ridge_tyrant.
      state.wildlandsProjects = [
        makeRetaliationProject({ ticksRemaining: 5, huntOutcome: "rout" }),
      ];
      const project = makeHuntProject({ loadout: { cityDefenseInfantry: 1 } });
      resolveMegafaunaHunt(state, project, []);
      const retals = (state.wildlandsProjects ?? []).filter(
        (p) => p.kind === "megafauna_retaliation" && p.meta?.megafaunaId === "ridge_tyrant",
      );
      expect(retals.length).toBe(1);
    } finally {
      Math.random = orig;
    }
  });
});

describe("sanitizer — megafauna_retaliation", () => {
  it("preserves a valid retaliation project with all fields", () => {
    const out = sanitizeWildlandsProject({
      id: "retal-1",
      kind: "megafauna_retaliation",
      biome: "ash_forest",
      ticksRemaining: 5,
      totalTicks: 8,
      status: "active",
      meta: {
        megafaunaId: "ridge_tyrant",
        huntOutcome: "rout",
        originalDeployed: 42,
      },
    });
    expect(out).not.toBeNull();
    expect(out.kind).toBe("megafauna_retaliation");
    expect(out.meta.megafaunaId).toBe("ridge_tyrant");
    expect(out.meta.huntOutcome).toBe("rout");
    expect(out.meta.originalDeployed).toBe(42);
  });

  it("drops a retaliation project missing megafaunaId", () => {
    const out = sanitizeWildlandsProject({
      id: "retal-2",
      kind: "megafauna_retaliation",
      biome: "ash_forest",
      ticksRemaining: 5,
      totalTicks: 8,
      status: "active",
      meta: { huntOutcome: "rout" },
    });
    expect(out).toBeNull();
  });

  it("drops a retaliation project with an invalid megafaunaId", () => {
    const out = sanitizeWildlandsProject({
      id: "retal-3",
      kind: "megafauna_retaliation",
      biome: "ash_forest",
      ticksRemaining: 5,
      totalTicks: 8,
      status: "active",
      meta: { megafaunaId: "not_a_real_boss", huntOutcome: "rout" },
    });
    expect(out).toBeNull();
  });

  it("strips an invalid huntOutcome but keeps the project", () => {
    const out = sanitizeWildlandsProject({
      id: "retal-4",
      kind: "megafauna_retaliation",
      biome: "ash_forest",
      ticksRemaining: 5,
      totalTicks: 8,
      status: "active",
      meta: { megafaunaId: "ridge_tyrant", huntOutcome: "garbage" },
    });
    expect(out).not.toBeNull();
    expect(out.meta.huntOutcome).toBeUndefined();
  });

  it("clamps a negative originalDeployed to zero", () => {
    const out = sanitizeWildlandsProject({
      id: "retal-5",
      kind: "megafauna_retaliation",
      biome: "ash_forest",
      ticksRemaining: 5,
      totalTicks: 8,
      status: "active",
      meta: { megafaunaId: "ridge_tyrant", huntOutcome: "rout", originalDeployed: -50 },
    });
    expect(out.meta.originalDeployed).toBe(0);
  });
});

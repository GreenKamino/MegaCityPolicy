import { describe, it, expect } from "vitest";
import type { Faction } from "@/engine/types";
import type { CommanderReputation } from "@/engine/politicsData";
import {
  createDefaultIntrigueState,
  getIdeologyProfile,
  computeAlignment,
  computeLoyaltyDrift,
  computeRadicalizationDelta,
  computePlotProgressDelta,
  pickPlotType,
  makePlot,
  resolveIntriguePlotResponse,
  IDEOLOGY_AXES,
  PLOT_THRESHOLD,
} from "@/engine/intrigue";
import { sanitizeState } from "@/engine/sanitizer";
import { migrateState } from "@/engine/saveLoad";
import { createInitialState } from "@/engine/initialState";

function rep(partial: Partial<CommanderReputation>): CommanderReputation {
  return {
    mercy: 50,
    fear: 50,
    transparency: 50,
    populism: 50,
    stability: 50,
    title: "Commander",
    ...partial,
  };
}

function faction(partial: Partial<Faction>): Faction {
  return {
    id: "test",
    name: "Test Faction",
    type: "law",
    influence: 50,
    loyalty: 50,
    threat: 0,
    isActive: true,
    ...(partial as any),
  } as Faction;
}

describe("intrigue ideology profiles", () => {
  it("free-traders override diverges from the corporate default", () => {
    const ft = getIdeologyProfile({ id: "free-traders", type: "corporate" });
    const corp = getIdeologyProfile({ id: "corps", type: "corporate" });
    expect(ft.label).not.toBe(corp.label);
    // Free traders despise a fearful crackdown state; MegaCorp tolerates it more.
    expect(ft.target.fear).toBeLessThan(corp.target.fear);
  });

  it("every type profile defines all five axes with weights", () => {
    for (const type of ["law", "criminal", "corporate", "underclass", "cult"] as const) {
      const p = getIdeologyProfile({ id: `x-${type}`, type });
      for (const axis of IDEOLOGY_AXES) {
        expect(typeof p.target[axis]).toBe("number");
        expect(typeof p.weight[axis]).toBe("number");
      }
    }
  });
});

describe("computeAlignment", () => {
  it("returns high when the regime matches what a faction wants", () => {
    // law wants high fear + high stability
    const f = faction({ id: "judges", type: "law" });
    const aligned = computeAlignment(f, rep({ fear: 75, stability: 85, mercy: 30, populism: 30, transparency: 40 }));
    const misaligned = computeAlignment(f, rep({ fear: 10, stability: 15, mercy: 90, populism: 90, transparency: 90 }));
    expect(aligned).toBeGreaterThan(80);
    expect(misaligned).toBeLessThan(40);
    expect(aligned).toBeGreaterThan(misaligned);
  });

  it("is bounded 0-100 and robust to missing axes", () => {
    const f = faction({ id: "u", type: "underclass" });
    const a = computeAlignment(f, rep({}));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(100);
  });
});

describe("computeLoyaltyDrift", () => {
  it("nudges loyalty up when aligned, down when misaligned, zero at neutral", () => {
    expect(computeLoyaltyDrift(100)).toBeGreaterThan(0);
    expect(computeLoyaltyDrift(0)).toBeLessThan(0);
    expect(computeLoyaltyDrift(50)).toBe(0);
  });
});

describe("computeRadicalizationDelta", () => {
  it("rises for a misaligned, disloyal faction in an unrestful city", () => {
    const f = faction({ loyalty: 5, threat: 80 });
    const d = computeRadicalizationDelta(f, /*alignment*/ 5, /*unrest*/ 90);
    expect(d).toBeGreaterThan(0);
  });

  it("falls for an aligned, loyal faction in a calm city", () => {
    const f = faction({ loyalty: 95, threat: 0 });
    const d = computeRadicalizationDelta(f, /*alignment*/ 95, /*unrest*/ 5);
    expect(d).toBeLessThan(0);
  });
});

describe("plot helpers", () => {
  it("picks plot type by faction archetype", () => {
    expect(pickPlotType({ type: "law" })).toBe("coup");
    expect(pickPlotType({ type: "corporate" })).toBe("coup");
    expect(pickPlotType({ type: "cult" })).toBe("terror_cell");
    expect(pickPlotType({ type: "criminal" })).toBe("terror_cell");
    expect(pickPlotType({ type: "underclass" })).toBe("assassination");
  });

  it("plot progress accelerates with radicalization and unrest", () => {
    const low = computePlotProgressDelta(45, 45);
    const high = computePlotProgressDelta(95, 90);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThanOrEqual(0);
  });

  it("makePlot creates a fresh, un-warned, immature plot", () => {
    const p = makePlot(faction({ id: "gangs", name: "The Gangs", type: "criminal" }), 100);
    expect(p.progress).toBe(0);
    expect(p.warnedStages).toEqual([]);
    expect(p.matured).toBe(false);
    expect(p.type).toBe("terror_cell");
    expect(p.instigatorFactionId).toBe("gangs");
  });

  it("PLOT_THRESHOLD is a sane radicalization gate", () => {
    expect(PLOT_THRESHOLD).toBeGreaterThan(0);
    expect(PLOT_THRESHOLD).toBeLessThan(100);
  });
});

describe("resolveIntriguePlotResponse", () => {
  it("a raid removes the plot and cools the instigator", () => {
    const state = createDefaultIntrigueState();
    const plot = makePlot(faction({ id: "gangs", name: "Gangs", type: "criminal" }), 10);
    plot.progress = 66;
    state.plots.push(plot);
    state.radicalization.gangs = 80;

    const res = resolveIntriguePlotResponse(state, plot.id, "intrigue_raid");
    expect(res.instigatorFactionId).toBe("gangs");
    expect(res.threatDelta).toBeGreaterThan(0);
    expect(res.intrigue.plots.find((p) => p.id === plot.id)).toBeUndefined();
    expect(res.intrigue.radicalization.gangs).toBeLessThan(80);
  });

  it("addressing grievances lowers progress and radicalization without necessarily removing", () => {
    const state = createDefaultIntrigueState();
    const plot = makePlot(faction({ id: "mutants", name: "Mutants", type: "underclass" }), 10);
    plot.progress = 66;
    state.plots.push(plot);
    state.radicalization.mutants = 70;

    const res = resolveIntriguePlotResponse(state, plot.id, "intrigue_address");
    const after = res.intrigue.plots.find((p) => p.id === plot.id);
    expect(after?.progress).toBeLessThan(66);
    expect(res.intrigue.radicalization.mutants).toBeLessThan(70);
  });

  it("ignoring a warning increases progress", () => {
    const state = createDefaultIntrigueState();
    const plot = makePlot(faction({ id: "corps", name: "Corps", type: "corporate" }), 10);
    plot.progress = 33;
    state.plots.push(plot);
    state.radicalization.corps = 62;

    const res = resolveIntriguePlotResponse(state, plot.id, "intrigue_ignore");
    const after = res.intrigue.plots.find((p) => p.id === plot.id);
    expect(after?.progress).toBeGreaterThan(33);
  });

  it("no-ops safely for an unknown plot or response", () => {
    const state = createDefaultIntrigueState();
    expect(resolveIntriguePlotResponse(state, "nope", "intrigue_raid").intrigue).toBe(state);
    const plot = makePlot(faction({ id: "gangs", name: "Gangs", type: "criminal" }), 10);
    state.plots.push(plot);
    expect(resolveIntriguePlotResponse(state, plot.id, "not_a_response").intrigue).toBe(state);
  });
});

describe("intrigue state lifecycle", () => {
  it("createInitialState seeds a default intrigue state", () => {
    const s = createInitialState();
    expect(s.intrigue).toBeDefined();
    expect(s.intrigue?.radicalization).toEqual({});
    expect(s.intrigue?.plots).toEqual([]);
  });

  it("survives a save/load round-trip", () => {
    const s = createInitialState();
    s.intrigue = {
      radicalization: { gangs: 72 },
      plots: [makePlot(faction({ id: "gangs", name: "Gangs", type: "criminal" }), 5)],
    };
    s.intrigue.plots[0].progress = 40;
    const restored = migrateState(JSON.parse(JSON.stringify(s)));
    expect(restored?.intrigue?.radicalization.gangs).toBe(72);
    expect(restored?.intrigue?.plots[0]?.progress).toBe(40);
  });

  it("sanitizer clamps radicalization and caps/cleans plots", () => {
    const s: any = createInitialState();
    s.intrigue = {
      radicalization: { gangs: 999, corps: -50, bad: NaN },
      plots: [
        ...Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, type: "coup", instigatorFactionId: "x", instigatorName: "X", progress: 999, startTick: 0, warnedStages: null, matured: 1 })),
        { not: "a plot" },
      ],
    };
    const clean = sanitizeState(s) as any;
    expect(clean.intrigue.radicalization.gangs).toBe(100);
    expect(clean.intrigue.radicalization.corps).toBe(0);
    expect(clean.intrigue.radicalization.bad).toBe(0);
    expect(clean.intrigue.plots.length).toBeLessThanOrEqual(10);
    for (const p of clean.intrigue.plots) {
      expect(p.progress).toBeLessThanOrEqual(100);
      expect(Array.isArray(p.warnedStages)).toBe(true);
      expect(typeof p.matured).toBe("boolean");
    }
  });
});

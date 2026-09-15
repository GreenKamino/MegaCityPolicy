import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  computeCommunicationsBreakdown,
  computeCommunicationsStrength,
  getCommunicationsBand,
  COMMUNICATIONS_STRENGTH_CAP,
  COMMUNICATIONS_LOW_SIGNAL_THRESHOLD,
} from "@/engine/communicationsBreakdown";
import { runTick } from "@/engine/formulas";

const communicationsFixtures = [
  {
    name: "mixed critical signal",
    buildings: { deepSignalTower: 2 },
    units: { commsRelayDroid: 1 },
    strength: 27,
    band: "CRITICAL",
    penalty: true,
  },
  {
    name: "mixed exact low-signal boundary",
    buildings: { deepSignalTower: 2 },
    units: { commsRelayDroid: 2 },
    strength: COMMUNICATIONS_LOW_SIGNAL_THRESHOLD,
    band: "DEGRADED",
    penalty: false,
  },
  {
    name: "mixed degraded signal",
    buildings: { quantumDataCenters: 2 },
    units: { commsRelayDroid: 1 },
    strength: 33,
    band: "DEGRADED",
    penalty: false,
  },
  {
    name: "mixed capped signal",
    buildings: { predictiveAnalyticsSupercomputers: 8 },
    units: { commsRelayDroid: 10 },
    strength: COMMUNICATIONS_STRENGTH_CAP,
    band: "STABLE",
    penalty: false,
  },
] as const;

function makeIsolatedCommunicationsState(
  fixture: (typeof communicationsFixtures)[number],
) {
  const state = createInitialState();
  state.totalTicks = 1;
  // Keep discrete crisis/event systems out of this engine-only contract.
  state.calmStartTicks = Number.MAX_SAFE_INTEGER;
  state.activeEvents = [];
  state.eventHistory = [];
  state.activeContracts = [];
  state.activePolicies = [];
  state.activeEdicts = [];
  state.pendingConstructions = [];
  state.companies = [];
  state.activeMiningPolicies = [];
  state.buildings = { ...fixture.buildings };
  state.units = { ...fixture.units };
  state.policies = {
    ...state.policies,
    corruptionInvestigation: false,
    surveillanceActive: false,
  };
  state.cityStats = {
    ...state.cityStats,
    population: 0,
    crime: 0,
    lawOrder: 50,
    employment: 70,
    corruption: 10,
  };
  return state;
}

describe("communications strength", () => {
  it("stacks Deep Signal Towers and caps the total at 100%", () => {
    expect(computeCommunicationsStrength({ deepSignalTower: 1 }, {})).toBe(12);
    expect(computeCommunicationsStrength({ deepSignalTower: 3 }, {})).toBe(36);
    expect(computeCommunicationsStrength({ deepSignalTower: 20 }, {})).toBe(COMMUNICATIONS_STRENGTH_CAP);
  });

  it("uses explicit status bands and the below-30% consequence", () => {
    expect(getCommunicationsBand(29)).toBe("CRITICAL");
    expect(getCommunicationsBand(30)).toBe("DEGRADED");
    expect(getCommunicationsBand(60)).toBe("STABLE");
    expect(computeCommunicationsBreakdown({}, {}).consequence).toBe("Below 30%: +1 corruption per tick.");
    expect(computeCommunicationsBreakdown({ deepSignalTower: 3 }, {}).consequence).toBe(
      "No low-signal corruption penalty at 30% or higher.",
    );
  });

  it("changes after construction and retains the value after tick recomputation", () => {
    const baseline = createInitialState();
    baseline.buildings = { deepSignalTower: 0, propagandaBroadcastingTowers: 0 };
    baseline.units = { commsRelayDroid: 0 };

    const constructed = createInitialState();
    constructed.buildings = { deepSignalTower: 1, propagandaBroadcastingTowers: 0 };
    constructed.units = { commsRelayDroid: 0 };

    const baselineAfterTick = runTick(baseline).newState;
    const constructedAfterTick = runTick(constructed).newState;

    expect(constructedAfterTick.utilities.commsStrength).toBe(
      baselineAfterTick.utilities.commsStrength + 12,
    );
    expect(constructedAfterTick.utilities.commsStrength).toBe(
      computeCommunicationsStrength(constructed.buildings, constructed.units),
    );
  });

  it("adds the documented corruption penalty during a critical-signal tick", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      const state = createInitialState();
      state.totalTicks = 1;
      // Keep discrete crisis/event systems out of this engine-only assertion.
      state.calmStartTicks = Number.MAX_SAFE_INTEGER;
      state.activeEvents = [];
      state.eventHistory = [];
      state.activeContracts = [];
      state.activePolicies = [];
      state.activeEdicts = [];
      state.pendingConstructions = [];
      state.companies = [];
      state.activeMiningPolicies = [];
      state.buildings = {};
      state.units = {};
      state.policies = {
        ...state.policies,
        corruptionInvestigation: false,
        surveillanceActive: false,
      };
      state.cityStats = {
        ...state.cityStats,
        crime: 0,
        lawOrder: 50,
        employment: 70,
        corruption: 10,
      };

      const corruptionBeforeTick = state.cityStats.corruption;
      const { newState } = runTick(state);

      expect(newState.utilities.commsStrength).toBeLessThan(30);
      expect(newState.cityStats.corruption).toBe(corruptionBeforeTick + 1);
    } finally {
      random.mockRestore();
    }
  });

  it("does not add the low-signal corruption penalty during a recovered communications tick", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      const state = createInitialState();
      state.totalTicks = 1;
      // Keep discrete crisis/event systems out of this engine-only assertion.
      state.calmStartTicks = Number.MAX_SAFE_INTEGER;
      state.activeEvents = [];
      state.eventHistory = [];
      state.activeContracts = [];
      state.activePolicies = [];
      state.activeEdicts = [];
      state.pendingConstructions = [];
      state.companies = [];
      state.activeMiningPolicies = [];
      state.buildings = { deepSignalTower: 3 };
      state.units = {};
      state.policies = {
        ...state.policies,
        corruptionInvestigation: false,
        surveillanceActive: false,
      };
      state.cityStats = {
        ...state.cityStats,
        crime: 0,
        lawOrder: 50,
        employment: 70,
        corruption: 10,
      };

      expect(
        computeCommunicationsStrength(state.buildings, state.units),
      ).toBeGreaterThanOrEqual(COMMUNICATIONS_LOW_SIGNAL_THRESHOLD);

      const corruptionBeforeTick = state.cityStats.corruption;
      const { newState } = runTick(state);

      expect(newState.utilities.commsStrength).toBeGreaterThanOrEqual(
        COMMUNICATIONS_LOW_SIGNAL_THRESHOLD,
      );
      expect(newState.cityStats.corruption).toBe(corruptionBeforeTick);
    } finally {
      random.mockRestore();
    }
  });

  it("does not penalize corruption at exactly the low-signal boundary during a real tick", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      const state = createInitialState();
      state.totalTicks = 1;
      // Keep discrete crisis/event systems out of this engine-only assertion.
      state.calmStartTicks = Number.MAX_SAFE_INTEGER;
      state.activeEvents = [];
      state.eventHistory = [];
      state.activeContracts = [];
      state.activePolicies = [];
      state.activeEdicts = [];
      state.pendingConstructions = [];
      state.companies = [];
      state.activeMiningPolicies = [];
      state.buildings = { deepSignalTower: 2 };
      state.units = { commsRelayDroid: 2 };
      state.policies = {
        ...state.policies,
        corruptionInvestigation: false,
        surveillanceActive: false,
      };
      state.cityStats = {
        ...state.cityStats,
        population: 0,
        crime: 0,
        lawOrder: 50,
        employment: 70,
        corruption: 10,
      };

      expect(
        computeCommunicationsStrength(state.buildings, state.units),
      ).toBe(COMMUNICATIONS_LOW_SIGNAL_THRESHOLD);

      const corruptionBeforeTick = state.cityStats.corruption;
      const { newState, entries } = runTick(state);

      expect(newState.utilities.commsStrength).toBe(
        COMMUNICATIONS_LOW_SIGNAL_THRESHOLD,
      );
      expect(newState.cityStats.corruption).toBe(corruptionBeforeTick);
      expect(entries).toContainEqual(
        expect.objectContaining({
          label: "Utilities",
          severity: "neutral",
          reason: expect.stringContaining(
            `Comms ${COMMUNICATIONS_LOW_SIGNAL_THRESHOLD}%`,
          ),
        }),
      );
    } finally {
      random.mockRestore();
    }
  });

  it.each(communicationsFixtures)(
    "keeps the pure readout and live tick aligned for $name",
    (fixture) => {
      const random = vi.spyOn(Math, "random").mockReturnValue(0.5);

      try {
        const state = makeIsolatedCommunicationsState(fixture);
        const breakdown = computeCommunicationsBreakdown(
          state.buildings,
          state.units,
        );

        expect(breakdown.strength).toBe(fixture.strength);
        expect(breakdown.calculatedStrength).toBe(fixture.strength);
        expect(breakdown.band).toBe(fixture.band);
        expect(breakdown.consequence).toBe(
          fixture.penalty
            ? "Below 30%: +1 corruption per tick."
            : "No low-signal corruption penalty at 30% or higher.",
        );

        const corruptionBeforeTick = state.cityStats.corruption;
        const { newState } = runTick(state);

        expect(newState.utilities.commsStrength).toBe(breakdown.strength);
        expect(getCommunicationsBand(newState.utilities.commsStrength)).toBe(
          breakdown.band,
        );
        expect(newState.cityStats.corruption).toBe(
          corruptionBeforeTick + (fixture.penalty ? 1 : 0),
        );
      } finally {
        random.mockRestore();
      }
    },
  );
});

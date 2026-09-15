import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EVENT_CHAINS, checkEventChainTriggers } from "@/engine/eventChains";
import { MAX_PENDING_CONSTRUCTION_ORDERS } from "@/engine/pendingConstruction";

vi.mock("@react-native-async-storage/async-storage", () => {
  const fail = (op: string) => () => {
    throw new Error(`AsyncStorage.${op} must NOT be called by the demo seeder`);
  };
  return {
    default: {
      getItem: fail("getItem"),
      setItem: fail("setItem"),
      removeItem: fail("removeItem"),
      multiGet: fail("multiGet"),
      multiSet: fail("multiSet"),
      multiRemove: fail("multiRemove"),
      getAllKeys: fail("getAllKeys"),
      clear: fail("clear"),
    },
  };
});

const g = globalThis as unknown as {
  window?: {
    location: { search: string };
    desktop?: {
      saveAndQuitFixture?: boolean;
      communicationsBoundaryFixture?: boolean;
      utilityParityFixture?: boolean;
      researchQueueFixture?: boolean;
      storagePlanFixture?: boolean;
    };
  };
};
const originalWindow = g.window;

function setSearch(
  search: string,
  saveAndQuitFixture = false,
  communicationsBoundaryFixture = false,
  utilityParityFixture = false,
  researchQueueFixture = false,
  storagePlanFixture = false,
) {
  g.window = {
    location: { search },
    ...((saveAndQuitFixture ||
      communicationsBoundaryFixture ||
      utilityParityFixture ||
      researchQueueFixture ||
      storagePlanFixture)
      ? {
          desktop: {
            ...(saveAndQuitFixture ? { saveAndQuitFixture: true } : {}),
            ...(communicationsBoundaryFixture
              ? { communicationsBoundaryFixture: true }
              : {}),
            ...(utilityParityFixture ? { utilityParityFixture: true } : {}),
            ...(researchQueueFixture ? { researchQueueFixture: true } : {}),
            ...(storagePlanFixture ? { storagePlanFixture: true } : {}),
          },
        }
      : {}),
  };
}

describe("createDemoSeededStateIfRequested — regression: ?demo=1 must NOT clobber slot 1", () => {
  beforeEach(() => {
    setSearch("");
  });

  afterEach(() => {
    if (originalWindow === undefined) delete g.window;
    else g.window = originalWindow;
  });

  it("returns the base (un-seeded) initial state when ?demo is absent", async () => {
    setSearch("");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();
    // Demo markers must be absent: the seeder only fires when ?demo=1 is on
    // the URL. hasCompletedOnboarding=true is the field the seeder uniquely
    // sets vs. the base initial state (which defaults it to false). Note:
    // playerTitle ("City Commander") and cityName ("MEGACITY JUAN") both
    // match the base defaults, so neither is a usable "seeder ran" marker.
    expect(state.hasCompletedOnboarding).not.toBe(true);
  });

  it("returns a fully-bootstrapped MEGACITY JUAN state when ?demo=1", async () => {
    setSearch("?demo=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();
    expect(state.cityName).toBe("MEGACITY JUAN");
    expect(state.playerTitle).toBe("City Commander");
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(state.startingRegion).toBeTruthy();
    // Seeder is in-memory only — never persists. The mocked AsyncStorage
    // throws on any access, so reaching here proves no save happened.
    expect(state.discoveredLocationIds?.length ?? 0).toBeGreaterThan(0);
  });

  it("keeps the construction reload fixture quiet through its completion turn", async () => {
    setSearch(
      "?demo=1&constructionbatch=1&constructionbatchphase=reload&constructionbatchreload=load&mode=turnbased",
    );
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();

    expect(state.activeEvents).toEqual([]);
    expect(state.calmStartTicks).toBe(Number.MAX_SAFE_INTEGER);
    expect(Object.keys(state.eventChainCooldowns ?? {})).toHaveLength(EVENT_CHAINS.length);
    expect(
      EVENT_CHAINS.every(
        (chain) => (state.eventChainCooldowns?.[chain.id] ?? 0) > state.totalTicks + 4,
      ),
    ).toBe(true);
    // The second turn reaches tick 8, the normal event-chain cadence. Its
    // cooldowns must still make the intentionally quiet fixture ineligible.
    expect(checkEventChainTriggers({ ...state, totalTicks: 8 })).toBeNull();
  });

  it("does not touch AsyncStorage even when ?demo=1&go=law", async () => {
    setSearch("?demo=1&go=law");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    // If this call triggered any AsyncStorage method, the mock would throw.
    expect(() => createDemoSeededStateIfRequested()).not.toThrow();
  });

  it("seeds a paused active project and two queued technologies for ETA checks", async () => {
    setSearch("?demo=1&researchqueue=1&go=research");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();

    expect(state.tickPaused).toBe(true);
    expect(state.activeResearch).toEqual({
      techId: "advanced_fusion_reactors",
      progress: 120,
      cost: 2400,
    });
    expect(state.researchQueue).toEqual([
      "magnetic_rail_transit",
      "autonomous_freight_networks",
    ]);
    expect(state.tickIntervalMinutes).toBe(15);
    expect(state.difficulty).toBe("medium");
  });

  it("changes one queue ETA input at a time for the browser fixture", async () => {
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");

    setSearch("?demo=1&researchqueue=1&researchqueuevariant=high-output");
    const highOutput = createDemoSeededStateIfRequested();
    expect(highOutput.buildings.advancedResearchLabs).toBe(4);

    setSearch("?demo=1&researchqueue=1&researchqueuevariant=hard");
    const hard = createDemoSeededStateIfRequested();
    expect(hard.difficulty).toBe("hard");
    expect(hard.buildings.advancedResearchLabs).toBe(2);

    setSearch("?demo=1&researchqueue=1&researchqueuevariant=slow");
    const slow = createDemoSeededStateIfRequested();
    expect(slow.tickIntervalMinutes).toBe(60);
    expect(slow.difficulty).toBe("medium");
  });

  it("allows the packaged research queue fixture without touching player storage", async () => {
    vi.stubGlobal("__DEV__", false);
    try {
      setSearch(
        "?demo=1&fixture=research-queue&researchqueue=1&researchQueueReload=save&go=research",
        false,
        false,
        false,
        true,
      );
      const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
      const state = createDemoSeededStateIfRequested();

      expect(state.activeResearch?.techId).toBe("advanced_fusion_reactors");
      expect(state.researchQueue).toEqual([
        "magnetic_rail_transit",
        "autonomous_freight_networks",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("seeds a deterministic housing warning with one affordable recommendation", async () => {
    setSearch("?demo=1&housing=1&go=overview");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { computePopulationPressure } = await import("@/engine/populationPressure");
    const { getBestBuildableHousingCapacityOption } = await import("@/engine/housingCapacity");
    const state = createDemoSeededStateIfRequested();
    const housing = computePopulationPressure(state).metrics.find((metric) => metric.id === "housing");

    expect(state.tickPaused).toBe(true);
    expect(housing?.status).toBe("shortfall");
    expect(getBestBuildableHousingCapacityOption({
      credits: state.resources.credits,
      steel: state.resources.steel,
      availableQueueSlots: 1,
    })).toEqual(expect.objectContaining({
      key: "highDensityResidentialPlatforms",
      label: "HIGH-DENSITY RESIDENTIAL",
    }));
    expect(state.buildings.highDensityResidentialPlatforms).toBe(0);
  });

  it("seeds each housing recommendation blocker for the real-screen regression", async () => {
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { getBestBuildableHousingCapacityOption, getHousingCapacityRecommendationBlocker } =
      await import("@/engine/housingCapacity");

    setSearch("?demo=1&housing=1&housingcase=credits&go=overview");
    const creditsBlocked = createDemoSeededStateIfRequested();
    expect(getBestBuildableHousingCapacityOption({
      credits: creditsBlocked.resources.credits,
      steel: creditsBlocked.resources.steel,
      availableQueueSlots: 1,
    })).toBeNull();
    expect(getHousingCapacityRecommendationBlocker({
      credits: creditsBlocked.resources.credits,
      steel: creditsBlocked.resources.steel,
      availableQueueSlots: 1,
    })).toContain("more credits are required");

    setSearch("?demo=1&housing=1&housingcase=steel&go=overview");
    const steelBlocked = createDemoSeededStateIfRequested();
    expect(getBestBuildableHousingCapacityOption({
      credits: steelBlocked.resources.credits,
      steel: steelBlocked.resources.steel,
      availableQueueSlots: 1,
    })).toBeNull();
    expect(getHousingCapacityRecommendationBlocker({
      credits: steelBlocked.resources.credits,
      steel: steelBlocked.resources.steel,
      availableQueueSlots: 1,
    })).toContain("more steel is required");

    setSearch("?demo=1&housing=1&housingcase=queue&go=overview");
    const queueBlocked = createDemoSeededStateIfRequested();
    expect(queueBlocked.pendingConstructions).toHaveLength(MAX_PENDING_CONSTRUCTION_ORDERS);
    expect(getBestBuildableHousingCapacityOption({
      credits: queueBlocked.resources.credits,
      steel: queueBlocked.resources.steel,
      availableQueueSlots: 0,
    })).toBeNull();
    expect(getHousingCapacityRecommendationBlocker({
      credits: queueBlocked.resources.credits,
      steel: queueBlocked.resources.steel,
      availableQueueSlots: 0,
    })).toContain("timed-order queue is full");
  });

  it("seeds the high-crime recovery variants without persistence", async () => {
    setSearch("?demo=1&crime=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const defaultState = createDemoSeededStateIfRequested();
    expect(defaultState.cityStats.crime).toBe(80);
    expect(defaultState.policies.surveillanceActive).toBe(false);
    expect(defaultState.activeMiningPolicies).toContain("black_market_ore");

    setSearch("?demo=1&crime=1&crimeorder=1");
    const publicOrderState = createDemoSeededStateIfRequested();
    expect(publicOrderState.cityStats.crime).toBe(80);
    expect(publicOrderState.policies.surveillanceActive).toBe(true);
    expect(publicOrderState.buildings).toEqual({});
    expect(publicOrderState.units).toEqual({});
  });

  it("seeds both relationship targets for the fading-boost browser fixture", async () => {
    setSearch("?demo=1&relationshipboosts=1&relationshipboostsphase=repeat");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();
    const officer = state.officers[0];

    expect(state.tickPaused).toBe(true);
    expect(state.innerCircle?.members[0]?.officerId).toBe(officer.id);
    expect(state.personalActionHistory).toEqual({
      [`faction:judges:give-gift`]: [180],
      [`officer:${officer.id}:give-gift`]: [180],
    });
  });

  it("seeds civic and rival relationship cards without persistence", async () => {
    setSearch("?demo=1&relationshiproster=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();

    expect(state.tickPaused).toBe(true);
    expect(state.resources.credits).toBe(0);
    expect(state.officers.find((officer) => officer.id === "urban-services-director")).toEqual(
      expect.objectContaining({
        name: "Director Mira Vale",
        department: "civic",
        appointed: false,
      }),
    );
    expect(state.innerCircle?.members[0]?.officerId).toBe(state.officers[0]?.id);
    expect(state.officers[0]).toEqual(
      expect.objectContaining({
        name: "Chief Marshal Lysa Venn",
        appointed: true,
      }),
    );
    expect(state.factions.find((faction) => faction.id === "gangs")?.leader?.name).toBe("Razor Vex");
  });

  it("seeds deterministic cooldowns for the read-only relationship roster phase", async () => {
    setSearch("?demo=1&relationshiproster=1&relationshiprosterphase=cooldown");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();

    expect(state.personalActionCooldowns).toEqual({
      "civic:urban-services-director:flatter": 128,
      "leader:gangs:flatter": 127,
      [`officer:${state.officers[0].id}:flatter`]: 128,
    });
    expect(state.totalTicks).toBe(120);
    expect(state.tickPaused).toBe(true);
  });

  it("seeds a retinue captain cooldown for the real leadership route", async () => {
    setSearch("?demo=1&retinueleadership=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();

    expect(state.retinue?.captains.find((captain) => captain.id === "demo-leadership-captain")).toEqual(
      expect.objectContaining({
        name: "CAPTAIN RHEA",
        status: "active",
      }),
    );
    expect(state.personalActionCooldowns).toEqual({
      "captain:demo-leadership-captain:flatter": 128,
    });
    expect(state.totalTicks).toBe(120);
    expect(state.tickPaused).toBe(true);
  });

  it("defaults to real-time mode with no crisis when only ?demo=1", async () => {
    setSearch("?demo=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();
    expect(state.gameplayMode).toBe("realtime");
    expect(state.activeEvents.some((e) => e.id === "demo-crisis-1")).toBe(false);
  });

  it("seeds an eligible captain-led operation squad for the browser fixture", async () => {
    setSearch("?demo=1&retinueoperation=1&mode=turnbased");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();
    const squad = state.retinue?.squads.find((candidate) => candidate.id === "demo-operation-squad");
    expect(state.gameplayMode).toBe("turnbased");
    expect(state.tickPaused).toBe(true);
    expect(squad).toMatchObject({
      captainId: "demo-operation-captain",
      doctrine: "assault",
      troopIds: ["demo-operation-infantry", "demo-operation-gunner"],
    });
    expect(state.retinue?.captains.find((captain) => captain.id === squad?.captainId)?.status).toBe("active");
    expect(state.retinue?.troops.filter((troop) => troop.status === "ready")).toHaveLength(2);
  });

  it("allows the explicit save-and-quit fixture in a release build", async () => {
    const previousDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = false;
    try {
      setSearch("?fixture=save-and-quit", true);
      const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
      const state = createDemoSeededStateIfRequested();
      expect(state.hasCompletedOnboarding).toBe(true);
      expect(state.startingRegion).toBeTruthy();
      expect(state.activeEvents.some((event) => event.id === "demo-crisis-1")).toBe(false);
    } finally {
      (globalThis as any).__DEV__ = previousDev;
    }
  });

  it("allows the read-only storage-plan fixture in a release build", async () => {
    const previousDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = false;
    try {
      setSearch(
        "?demo=1&storageplan=1&medicalstorage=1&medicalstoragecase=economy",
        false,
        false,
        false,
        false,
        true,
      );
      const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
      const state = createDemoSeededStateIfRequested();
      expect(state.hasCompletedOnboarding).toBe(true);
      expect(state.resources.medSupplies).toBe(5_000);
      expect(state.gameplayMode).toBe("turnbased");
    } finally {
      (globalThis as any).__DEV__ = previousDev;
    }
  });

  it("does not allow the save-and-quit query without the desktop capability", async () => {
    const previousDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = false;
    try {
      setSearch("?fixture=save-and-quit");
      const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
      const state = createDemoSeededStateIfRequested();
      expect(state.hasCompletedOnboarding).not.toBe(true);
    } finally {
      (globalThis as any).__DEV__ = previousDev;
    }
  });

  it("allows the exact communications boundary fixture in a release build", async () => {
    const previousDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = false;
    try {
      setSearch("?demo=1&boundarycomms=1", false, true);
      const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
      const { COMMUNICATIONS_LOW_SIGNAL_THRESHOLD, getCommunicationsBand } = await import(
        "@/engine/communicationsBreakdown"
      );
      const state = createDemoSeededStateIfRequested();
      expect(state.utilities.commsStrength).toBe(COMMUNICATIONS_LOW_SIGNAL_THRESHOLD);
      expect(getCommunicationsBand(state.utilities.commsStrength)).toBe("DEGRADED");
      expect(state.hasCompletedOnboarding).toBe(true);
    } finally {
      (globalThis as any).__DEV__ = previousDev;
    }
  });

  it("does not allow the communications boundary query without the desktop capability", async () => {
    const previousDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = false;
    try {
      setSearch("?demo=1&boundarycomms=1");
      const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
      const state = createDemoSeededStateIfRequested();
      expect(state.hasCompletedOnboarding).not.toBe(true);
    } finally {
      (globalThis as any).__DEV__ = previousDev;
    }
  });

  it("omits civilian and military production keys for the legacy production fixture", async () => {
    setSearch("?demo=1&legacyproduction=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();

    expect(state.buildings).toEqual({});
    expect(state.buildings).not.toHaveProperty("metalFoundryComplexes");
    expect(state.buildings).not.toHaveProperty("ammunitionPressLines");
    expect(state.militaryOverhaul?.logistics?.installationsBuilt).toEqual({});
    expect(state.militaryOverhaul?.logistics?.installationsBuilt).not.toHaveProperty(
      "ammunition_factory",
    );
  });

  it("pins a critical communications signal without touching saved state", async () => {
    setSearch("?demo=1&criticalcomms=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { COMMUNICATIONS_LOW_SIGNAL_THRESHOLD, getCommunicationsBand } = await import(
      "@/engine/communicationsBreakdown"
    );
    const state = createDemoSeededStateIfRequested();

    expect(state.utilities.commsStrength).toBeLessThan(COMMUNICATIONS_LOW_SIGNAL_THRESHOLD);
    expect(getCommunicationsBand(state.utilities.commsStrength)).toBe("CRITICAL");
    // The AsyncStorage mock above throws if the fixture tries to persist.
    expect(state.cityName).toBe("MEGACITY JUAN");
  });

  it("pins the exact communications boundary without touching saved state", async () => {
    setSearch("?demo=1&boundarycomms=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { COMMUNICATIONS_LOW_SIGNAL_THRESHOLD, getCommunicationsBand } = await import(
      "@/engine/communicationsBreakdown"
    );
    const state = createDemoSeededStateIfRequested();

    expect(state.utilities.commsStrength).toBe(COMMUNICATIONS_LOW_SIGNAL_THRESHOLD);
    expect(getCommunicationsBand(state.utilities.commsStrength)).toBe("DEGRADED");
    expect(state.cityName).toBe("MEGACITY JUAN");
  });

  it("does not allow the utility parity query without the desktop capability", async () => {
    const previousDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = false;
    try {
      setSearch("?demo=1&utilityparity=1");
      const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
      const state = createDemoSeededStateIfRequested();
      expect(state.hasCompletedOnboarding).not.toBe(true);
    } finally {
      (globalThis as any).__DEV__ = previousDev;
    }
  });

  it("seeds the utility parity fixture across the spring/summer boundary", async () => {
    setSearch("?demo=1&utilityparity=1", false, false, true);
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();

    expect(state.gameDate).toEqual({ year: 2030, month: 6, day: 1, hour: 0 });
    expect(state.season).toBe("summer");
    expect(state.tickPaused).toBe(true);
    expect(state.unlockedTechnologies).toContain("resource_allocation_ai");
    expect(state.activePolicies).toContain("publicOwnershipUtilities");
    expect(state.cheats.speedDemon).toBe(true);
    expect(state.prestigeResourceMult).toBe(1.25);
    expect(state.megaProjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId: "fusion_nexus", phase: "operational" }),
        expect.objectContaining({ projectId: "subterranean_reservoir", phase: "operational" }),
      ]),
    );
    expect(state.rates.powerGeneration).toBe(7918);
    expect(state.rates.waterProduction).toBe(3374);
  });

  it("can seed quarantined utility licenses for the read-only browser audit", async () => {
    setSearch("?demo=1&utilityparity=1&utilityparitystatus=quarantined");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();

    expect(state.companies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ companyId: "helios-grid", status: "quarantined" }),
        expect.objectContaining({ companyId: "clearflow-water", status: "quarantined" }),
      ]),
    );
    expect(state.rates.powerGeneration).toBeLessThan(7918);
    expect(state.rates.waterProduction).toBeLessThan(3374);
  });

  it("seeds a deterministic multi-choice credit event", async () => {
    setSearch("?demo=1&multiresponse=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();
    const event = state.activeEvents.find((candidate) => candidate.id === "demo-multi-response-1");

    expect(event).toBeTruthy();
    expect(event?.resolved).toBe(false);
    expect(event?.maxResponses).toBe(2);
    expect(event?.responseOptions).toHaveLength(2);
    expect(event?.responseOptions?.every((response) => (response.effects.credits ?? 0) < 0)).toBe(true);
  });

  it("seeds turn-based mode when ?demo=1&mode=turnbased", async () => {
    setSearch("?demo=1&mode=turnbased");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();
    expect(state.gameplayMode).toBe("turnbased");
    // No crisis injected unless crisis=1 is also present.
    expect(state.activeEvents.some((e) => e.id === "demo-crisis-1")).toBe(false);
  });

  it("composes permanent training facilities with the active doctrine fixture", async () => {
    setSearch("?demo=1&mode=turnbased&trainboost=1&traindoctrine=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { TRAINING_EDICT_ID } = await import("@/engine/pendingConstruction");
    const state = createDemoSeededStateIfRequested();

    expect(state.militaryOverhaul?.logistics?.installationsBuilt?.infantry_training_grounds).toBe(2);
    expect(state.activeEdicts).toContainEqual(
      expect.objectContaining({ edictId: TRAINING_EDICT_ID, ticksRemaining: 12 }),
    );
  });

  it("keeps the training doctrine fixture free of generated interruptions through expiry", async () => {
    setSearch("?demo=1&mode=turnbased&traindoctrine=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { advanceTurn } = await import("@/engine/turnMode");

    // Force every random trigger to take its most eager branch. The fixture's
    // extended calm window must cover the whole 12-tick doctrine lifetime,
    // including ecology and the shared event pump.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      let state = createDemoSeededStateIfRequested();
      for (let turn = 0; turn < 3; turn += 1) {
        const result = advanceTurn(state);
        expect(result.interruptedBy).toBeNull();
        state = result.state;
      }
      expect(state.totalTicks).toBe(12);
      expect(state.activeEvents.every((event) => event.severity !== "high" && event.severity !== "critical")).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("ignores crisis=1 unless turn-based mode is also set", async () => {
    setSearch("?demo=1&crisis=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();
    // Real-time + crisis=1 is an ambiguous fixture; the seeder ignores it.
    expect(state.gameplayMode).toBe("realtime");
    expect(state.activeEvents.some((e) => e.id === "demo-crisis-1")).toBe(false);
  });

  it("arms a real tick-based biosphere risk transition for the TV ticker", async () => {
    setSearch("?demo=1&biosphereticker=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { advanceTurn } = await import("@/engine/turnMode");
    const state = createDemoSeededStateIfRequested();

    expect(state.gameplayMode).toBe("turnbased");
    expect(state.cityStats.biosphere).toBe(67);
    expect(state.lastSeenBiosphereCrisisTier).toBe("low");

    const result = advanceTurn(state);
    const warnings = (result.state.newsFeed ?? []).filter((item) =>
      item.id.startsWith("news-biosphere-risk-rising-"),
    );

    expect(result.interruptedBy).toBeNull();
    expect(result.state.cityStats.biosphere).toBeLessThan(67);
    expect(result.state.lastSeenBiosphereCrisisTier).toBe("easing");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].headline).toContain("NATURE CRISIS RISK RISING");
    expect(warnings[0].headline).not.toContain("!");
  });

  it("injects one unresolved high-severity crisis when ?demo=1&mode=turnbased&crisis=1", async () => {
    setSearch("?demo=1&mode=turnbased&crisis=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { hasBlockingCrisis } = await import("@/engine/turnMode");
    const state = createDemoSeededStateIfRequested();
    expect(state.gameplayMode).toBe("turnbased");
    const crisis = state.activeEvents.find((e) => e.id === "demo-crisis-1");
    expect(crisis).toBeTruthy();
    expect(crisis?.severity).toBe("high");
    expect(crisis?.resolved).toBe(false);
    // The turn-based panel keys off this exact predicate.
    expect(hasBlockingCrisis(state)).toBe(true);
  });

  it("arms a mid-turn crisis with NO pre-seeded event when ?demo=1&mode=turnbased&midturncrisis=1", async () => {
    setSearch("?demo=1&mode=turnbased&midturncrisis=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { hasBlockingCrisis, canAdvanceTurn } = await import("@/engine/turnMode");
    const state = createDemoSeededStateIfRequested();
    expect(state.gameplayMode).toBe("turnbased");
    // The whole point of this fixture: END TURN must start out AVAILABLE (no
    // blocking crisis on the board) so the interrupt happens mid-turn.
    expect(hasBlockingCrisis(state)).toBe(false);
    expect(canAdvanceTurn(state)).toBe(true);
    // The armed conditions: calm-start gate open + biosphere pinned under the
    // deterministic ecosystem-collapse trigger threshold (<= 15).
    expect(state.calmStartTicks).toBe(0);
    expect(state.cityStats.biosphere).toBeLessThanOrEqual(15);
  });

  it("ignores midturncrisis=1 unless turn-based mode is also set", async () => {
    setSearch("?demo=1&midturncrisis=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const state = createDemoSeededStateIfRequested();
    expect(state.gameplayMode).toBe("realtime");
    // Un-armed: the calm-start window and biosphere stay at their defaults.
    expect(state.calmStartTicks).not.toBe(0);
    expect(state.cityStats.biosphere).toBeGreaterThan(15);
  });

  it("resumed turns finish the interrupted day, and a dismissed crisis does not re-interrupt it (real tick pipeline)", async () => {
    // Task #451 + #452: the engine-level guarantee behind e2e FLOW 5.
    // advanceTurn's contract is "a turn interrupted by a crisis leaves the
    // clock mid-day; the next End Turn finishes that day". Before Task #452
    // the fixture's pinned biosphere re-fired the SAME collapse on the first
    // tick of every resumed turn (dismissal never wrote the recent-id
    // lockout), so completing the day took four 1-tick turns — the exact
    // resolve → END TURN → 1-tick interrupt loop the fix removes. Now the
    // dismissal path stamps a per-id trigger cooldown, so ONE dismissal buys
    // the whole rest of the day: the resumed turn walks 06:00 → 00:00 in a
    // single End Turn without the cleared crisis re-interrupting, and the day
    // rolls after exactly TICKS_PER_TURN total ticks. If a regression made a
    // resumed turn restart a fresh day, the clock would reset instead of
    // finishing mid-day; if the cooldown regressed, interruptedBy would be
    // the collapse again after 1 tick.
    setSearch("?demo=1&mode=turnbased&midturncrisis=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { advanceTurn, TICKS_PER_TURN } = await import("@/engine/turnMode");
    const { applyEventDismissal } = await import("@/engine/eventResolution");
    const { isDayStart } = await import("@/engine/clock");

    // Suppress every random spawner (wildlands ecology rolls, condition
    // triggers, officer events…) so the only interrupt candidate is the
    // deterministic stat-gated collapse under test.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      let state = createDemoSeededStateIfRequested();
      const startDay = state.gameDate.day;
      expect(state.gameDate.hour).toBe(0);

      // Turn 1: the armed collapse interrupts on the very first tick (06:00).
      const first = advanceTurn(state);
      expect(first.interruptedBy?.id).toBe("biosphere_ecosystem_collapse");
      expect(first.ticksAdvanced).toBe(1);
      expect(first.state.gameDate.hour).toBe(6);

      // The player clears the crisis on the Events screen (dismissal path).
      state = applyEventDismissal(first.state, first.interruptedBy!.id);

      // Turn 2: the resumed turn finishes the interrupted DAY — 3 more ticks
      // to the boundary (12:00 → 18:00 → 00:00), with NO re-interrupt from
      // the crisis that was just dismissed even though the biosphere is still
      // pinned under the collapse threshold.
      const resumed = advanceTurn(state);
      expect(resumed.interruptedBy).toBeNull();
      expect(resumed.ticksAdvanced).toBe(TICKS_PER_TURN - 1);
      state = resumed.state;

      // The clock RESUMED across turns (no reset to 00:00 mid-day) and the
      // day rolled exactly once, after exactly TICKS_PER_TURN total ticks.
      expect(isDayStart(state.gameDate)).toBe(true);
      expect(state.gameDate.day).not.toBe(startDay);
      expect(state.totalTicks).toBe(TICKS_PER_TURN);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("armed state deterministically interrupts the very next END TURN (real tick pipeline)", async () => {
    // This is the engine-level guarantee the UI e2e test builds on: running
    // the REAL runLiveTick over the armed fixture must stop the turn on tick 1
    // with the critical ecosystem-collapse event as the interrupting crisis.
    // No injected tickFn, no mocked randomness — if a future balance change
    // breaks the determinism of this fixture, this test fails first with a
    // clear signal (instead of the browser e2e flaking).
    setSearch("?demo=1&mode=turnbased&midturncrisis=1");
    const { createDemoSeededStateIfRequested } = await import("@/engine/demoSeeder");
    const { advanceTurn, hasBlockingCrisis, TICKS_PER_TURN } = await import("@/engine/turnMode");
    const state = createDemoSeededStateIfRequested();
    const result = advanceTurn(state);
    expect(result.interruptedBy?.id).toBe("biosphere_ecosystem_collapse");
    expect(result.interruptedBy?.severity).toBe("critical");
    // Stopped on the first tick — genuinely mid-turn, not at the day boundary.
    expect(result.ticksAdvanced).toBe(1);
    expect(result.ticksAdvanced).toBeLessThan(TICKS_PER_TURN);
    // The post-turn state now blocks further advancement until it is resolved
    // (this is what flips the panel to "RESOLVE CRISIS TO CONTINUE").
    expect(hasBlockingCrisis(result.state)).toBe(true);
  });
});

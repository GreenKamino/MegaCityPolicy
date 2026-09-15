import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  runNewSystemTicks,
  BIO_OUTBREAK_DURATION_TICKS,
} from "@/engine/tickProcessors";
import { generateOverviewWarnings } from "@/engine/overviewWarnings";
import {
  processAutoDomainManagers,
  createDefaultAutoDomainConfigs,
} from "@/engine/autoDomainManagers";
import { setAutoManagerMode, DOMAIN_ROLES } from "@/engine/autoManagers";
import { runTick } from "@/engine/formulas";
import type { GameEvent, GameState, TickEntry } from "@/engine/types";

const OUTBREAK_IDS = [
  "biosphere_disease_outbreak",
  "biosphere_toxic_bloom",
  "biosphere_contamination_leak",
];

function fakeOutbreak(id: string, expiresTick?: number): GameEvent {
  const e: GameEvent = {
    id,
    title: id,
    description: "",
    severity: "high",
    effects: {},
    timestamp: 0,
    resolved: false,
  };
  if (typeof expiresTick === "number") e.expiresTick = expiresTick;
  return e;
}

// ── T001: doom-spiral fixes ──────────────────────────────────────────────

describe("ecology easing — outbreak containment", () => {
  it("stamps newly spawned outbreaks with a finite expiry", () => {
    const s = createInitialState();
    s.totalTicks = 8;
    s.cityStats.diseaseRisk = 95;
    s.activeEvents = [];
    s.eventHistory = [];

    runNewSystemTicks(s, []);

    const ob = s.activeEvents.find((e) => e.id === "biosphere_disease_outbreak");
    expect(ob).toBeTruthy();
    expect(ob?.expiresTick).toBe(8 + BIO_OUTBREAK_DURATION_TICKS);
  });

  it("auto-contains an outbreak once it passes its expiry and records it as resolved", () => {
    const s = createInitialState();
    s.totalTicks = 20;
    s.cityStats.diseaseRisk = 10; // low so it cannot immediately respawn
    s.cityStats.biosphere = 60;
    s.activeEvents = [fakeOutbreak("biosphere_disease_outbreak", 18)]; // 18 <= 20
    s.eventHistory = [];

    runNewSystemTicks(s, []);

    expect(s.activeEvents.some((e) => e.id === "biosphere_disease_outbreak")).toBe(false);
    expect(
      s.eventHistory.some((e) => e.id === "biosphere_disease_outbreak" && e.resolved),
    ).toBe(true);
  });

  it("stamps legacy active outbreaks that predate timed containment", () => {
    const s = createInitialState();
    s.totalTicks = 30;
    s.cityStats.diseaseRisk = 10;
    s.cityStats.biosphere = 60;
    s.activeEvents = [fakeOutbreak("biosphere_toxic_bloom")]; // no expiresTick
    s.eventHistory = [];

    runNewSystemTicks(s, []);

    const ob = s.activeEvents.find((e) => e.id === "biosphere_toxic_bloom");
    expect(ob?.expiresTick).toBe(36); // totalTicks + 6, not yet expired
  });
});

describe("ecology easing — capped amplification", () => {
  it("caps outbreak pressure so stacking outbreaks does not multiply the spiral", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      function pressure(n: number) {
        const s = createInitialState();
        // Isolate outbreak amplification from the separate city-density load.
        s.cityStats.population = 750_000;
        s.totalTicks = 5; // odd — biosphere erosion off; processIllnesses idle
        s.cityStats.diseaseRisk = 40;
        s.cityStats.unrest = 30;
        s.cityStats.biosphere = 50;
        s.activeEvents = OUTBREAK_IDS.slice(0, n).map((id) => fakeOutbreak(id, 9999));
        s.eventHistory = [];
        const beforeD = s.cityStats.diseaseRisk;
        const beforeU = s.cityStats.unrest;
        runNewSystemTicks(s, []);
        return {
          d: s.cityStats.diseaseRisk - beforeD,
          u: s.cityStats.unrest - beforeU,
        };
      }

      const one = pressure(1);
      const three = pressure(3);

      // Old behavior scaled with count (ceil(n*0.5) disease, n unrest). The cap
      // makes one and three identical, which is the spiral fix.
      expect(three.d).toBe(one.d);
      expect(three.u).toBe(one.u);
      expect(one.d).toBeLessThanOrEqual(1);
      expect(one.u).toBeLessThanOrEqual(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("ecology easing — gated recovery", () => {
  it("a contained, remediating city ends higher than an unremediated one", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      // Recovery is now continuous: a modest investment (1 dome ~ bioBonus 5)
      // recovers at a small positive rate (~+0.3/tick) that only moves the
      // INTEGER biosphere after several ticks, whereas the old integer step
      // moved it in a single tick. The enduring contract this guards is the
      // DIRECTION — a remediating city ends strictly higher than a neglected one
      // — so we run a short window (totalTicks held fixed so the neglected
      // baseline sits flat at the natural floor) and compare end states.
      function bioAfter(domes: number) {
        const s = createInitialState();
        s.totalTicks = 7;
        s.cityStats.biosphere = 10; // < 25, below the natural floor
        s.cityStats.diseaseRisk = 5;
        s.activeEvents = [];
        s.eventHistory = [];
        (s.buildings as Record<string, number>).biosphereReclamationDomes = domes;
        for (let i = 0; i < 12; i++) runNewSystemTicks(s, []);
        return s.cityStats.biosphere;
      }

      // Any green investment climbs the biosphere (scaling with size), while pure
      // neglect merely holds at the floor — so remediated ends strictly higher.
      expect(bioAfter(1)).toBeGreaterThan(bioAfter(0));
    } finally {
      spy.mockRestore();
    }
  });
});

// ── T002: discoverability warnings ───────────────────────────────────────

describe("ecology easing — overview warnings", () => {
  function ids(s: GameState) {
    return generateOverviewWarnings(s).map((w) => w.id);
  }

  it("warns on rising disease risk before the outbreak threshold", () => {
    const s = createInitialState();
    s.cityStats.diseaseRisk = 60; // >= 55, < 70
    s.cityStats.biosphere = 60;
    expect(ids(s)).toContain("disease-warn");
    expect(ids(s)).not.toContain("disease-crit");
  });

  it("escalates to a critical disease advisory as an outbreak nears", () => {
    const s = createInitialState();
    s.cityStats.diseaseRisk = 75; // >= 70
    s.cityStats.biosphere = 60;
    expect(ids(s)).toContain("disease-crit");
  });

  it("warns on a failing biosphere before collapse", () => {
    const s = createInitialState();
    s.cityStats.biosphere = 30; // <= 35, > 20
    s.cityStats.diseaseRisk = 20;
    expect(ids(s)).toContain("biosphere-warn");
  });

  it("escalates to a critical biosphere advisory near collapse", () => {
    const s = createInitialState();
    s.cityStats.biosphere = 18; // <= 20
    s.cityStats.diseaseRisk = 20;
    expect(ids(s)).toContain("biosphere-crit");
  });

  it("flags combined toxic-bloom risk when biosphere is low and disease elevated", () => {
    const s = createInitialState();
    s.cityStats.biosphere = 28; // <= 30
    s.cityStats.diseaseRisk = 55; // >= 50
    expect(ids(s)).toContain("toxic-warn");
  });
});

// ── T003: Chancellor advisor delegation ──────────────────────────────────

describe("ecology easing — Chancellor health delegation", () => {
  function freshEdictState(): GameState {
    const s = createInitialState();
    s.totalTicks = 100; // past every interval gate
    s.resources.credits = 1_000_000;
    s.autoDomains = createDefaultAutoDomainConfigs();
    s.activeEdicts = [];
    if (!s.innerCircle) {
      s.innerCircle = { members: [], whispers: [], lastWhisperTick: 0 };
    }
    s.innerCircle.members = [
      {
        officerId: "chancellor-1",
        role: DOMAIN_ROLES.edicts as never,
        level: 3,
        xp: 0,
        xpToNext: 100,
        perksUnlocked: [],
        appointed: 0,
      },
    ];
    return s;
  }

  it("ACT enacts an emergency health edict when disease risk is critical", () => {
    const s = freshEdictState();
    s.autoManagers = setAutoManagerMode(s.autoManagers!, "edicts", "act");
    s.cityStats.diseaseRisk = 85;

    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);

    const enacted = (s.activeEdicts ?? []).map((e) => e.edictId);
    expect(enacted).toContain("public_health_emergency");
    expect(entries.some((e) => e.reason.startsWith("Ecology response"))).toBe(true);
  });

  it("SUGGEST briefs the player with an ecology alert instead of auto-acting", () => {
    const s = freshEdictState();
    s.autoManagers = setAutoManagerMode(s.autoManagers!, "edicts", "suggest");
    s.cityStats.diseaseRisk = 85;

    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);

    expect(s.activeEdicts ?? []).toHaveLength(0);
    const titles = s.autoManagers!.queue.map((p) => p.title);
    expect(titles.some((t) => t.startsWith("Ecology alert"))).toBe(true);
  });

  it("prioritizes health edicts when a bio-outbreak is active even at moderate disease risk", () => {
    const s = freshEdictState();
    s.autoManagers = setAutoManagerMode(s.autoManagers!, "edicts", "act");
    s.cityStats.diseaseRisk = 40; // below the standalone thresholds
    s.activeEvents = [fakeOutbreak("biosphere_disease_outbreak", 200)];

    const entries: TickEntry[] = [];
    processAutoDomainManagers(s, entries);

    const enacted = (s.activeEdicts ?? []).map((e) => e.edictId);
    expect(
      enacted.some((id) => id === "public_health_emergency" || id === "mass_vaccination_drive"),
    ).toBe(true);
  });

  it("an active health edict measurably lowers disease risk on a full tick", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      function diseaseAfterTick(withEdict: boolean) {
        const s = createInitialState();
        s.totalTicks = 100;
        s.cityStats.diseaseRisk = 60;
        s.activeEdicts = withEdict
          ? [
              {
                edictId: "public_health_emergency",
                ticksRemaining: 4,
                issuedAtTick: 99,
                cooldownUntilTick: 200,
              },
            ]
          : [];
        return runTick(s).newState.cityStats.diseaseRisk;
      }

      // Same starting state; the only difference is the active health edict.
      expect(diseaseAfterTick(true)).toBeLessThan(diseaseAfterTick(false));
    } finally {
      spy.mockRestore();
    }
  });

  it("ACT Chancellor intervention actually pulls disease pressure down over several ticks", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      function endDiseaseRisk(mode: "act" | "off") {
        let s = freshEdictState();
        s.autoManagers = setAutoManagerMode(s.autoManagers!, "edicts", mode);
        s.cityStats.diseaseRisk = 80;
        for (let i = 0; i < 5; i++) {
          s = runTick(s).newState;
        }
        return s.cityStats.diseaseRisk;
      }

      // With the Chancellor delegated (ACT) the disease spiral is actively
      // contained; left OFF it is not. This is the heart of the "can't
      // delegate" complaint — delegation must do real mechanical work.
      expect(endDiseaseRisk("act")).toBeLessThan(endDiseaseRisk("off"));
    } finally {
      spy.mockRestore();
    }
  });
});

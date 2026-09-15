import { describe, it, expect } from "vitest";
import {
  evaluateEndState,
  processEndStateCheck,
  applyNpcEndStateCheck,
  ASCENSION_TECHS,
  getLivingUnits,
  getDroidCount,
} from "@/engine/endState";
import type { GameState, Township } from "@/engine/types";

function baseState(overrides: Partial<GameState> = {}): GameState {
  const s = {
    cityStats: { population: 1000 },
    buildings: { habBlockMegaTowers: 1 },
    units: {},
    demographics: {},
    unlockedTechnologies: [],
    messages: [],
    totalTicks: 100,
    gameDate: { year: 2030, month: 1, day: 1, hour: 0 },
  } as unknown as GameState;
  return { ...s, ...overrides };
}

describe("endState — biological default", () => {
  it("active when citizens > 0", () => {
    const s = baseState();
    expect(evaluateEndState(s).status).toBe("active");
  });

  it("active when housing > 0 even with citizens 0 (refuge stragglers can repopulate)", () => {
    const s = baseState({ cityStats: { population: 0 } as GameState["cityStats"] });
    expect(evaluateEndState(s).status).toBe("active");
  });

  it("FALLEN when both citizens AND living units are 0", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
    });
    const r = evaluateEndState(s);
    expect(r.status).toBe("fallen");
    expect(r.cause).toMatch(/zero/i);
  });
});

describe("endState — machine ascension exception", () => {
  const machineTechs = [
    ASCENSION_TECHS.mindUpload,
    ASCENSION_TECHS.consciousnessTransfer,
    ASCENSION_TECHS.automatonCiv,
  ];

  it("city survives at zero pop + zero housing if droids exist", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
      units: { combatAssaultDroid: 5 },
      unlockedTechnologies: machineTechs,
    });
    const r = evaluateEndState(s);
    expect(r.survivalMode).toBe("machine");
    expect(r.status).toBe("ascended-machine");
  });

  it("city falls if droids ALSO hit zero", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
      units: {},
      unlockedTechnologies: machineTechs,
    });
    expect(evaluateEndState(s).status).toBe("fallen");
  });

  it("does NOT trigger without all 3 ascension techs", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
      units: { combatAssaultDroid: 5 },
      unlockedTechnologies: [ASCENSION_TECHS.mindUpload, ASCENSION_TECHS.consciousnessTransfer],
    });
    expect(evaluateEndState(s).status).toBe("fallen");
  });
});

describe("endState — bio perpetuation", () => {
  it("bio-only (no machine techs) survives at zero biological pop via synthetic clones", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: { habBlockMegaTowers: 1 },
      units: {},
      demographics: { clonePopulation: 150 } as GameState["demographics"],
      unlockedTechnologies: [ASCENSION_TECHS.perpetualBiogenesis],
    });
    const r = evaluateEndState(s);
    expect(r.survivalMode).toBe("hybrid");
    expect(r.status).toBe("ascended-bio");
  });

  it("bio-only with zero clones but housing still standing → ascended-bio (vats can rebuild)", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: { habBlockMegaTowers: 1 },
      units: {},
      demographics: {} as GameState["demographics"],
      unlockedTechnologies: [ASCENSION_TECHS.perpetualBiogenesis],
    });
    expect(evaluateEndState(s).status).toBe("ascended-bio");
  });

  it("bio-only with zero clones AND zero housing → fallen", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
      units: {},
      demographics: {} as GameState["demographics"],
      unlockedTechnologies: [ASCENSION_TECHS.perpetualBiogenesis],
    });
    expect(evaluateEndState(s).status).toBe("fallen");
  });

  it("machine-mode with housing standing but ZERO droids → fallen (droid count is the survival metric, housing doesn't save you)", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: { habBlockMegaTowers: 5 },
      units: {},
      unlockedTechnologies: [
        ASCENSION_TECHS.mindUpload,
        ASCENSION_TECHS.consciousnessTransfer,
        ASCENSION_TECHS.automatonCiv,
      ],
    });
    const r = evaluateEndState(s);
    expect(r.survivalMode).toBe("machine");
    expect(r.status).toBe("fallen");
  });

  it("hybrid mode survives on synthetic pop when biological pop hits 0", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
      units: {},
      demographics: { clonePopulation: 200 } as GameState["demographics"],
      unlockedTechnologies: [
        ASCENSION_TECHS.mindUpload,
        ASCENSION_TECHS.consciousnessTransfer,
        ASCENSION_TECHS.automatonCiv,
        ASCENSION_TECHS.perpetualBiogenesis,
      ],
    });
    const r = evaluateEndState(s);
    expect(r.survivalMode).toBe("hybrid");
    expect(r.status).toBe("ascended-bio");
  });
});

describe("processEndStateCheck — side effects", () => {
  it("stamps endState and emits an alert + tick entry on transition to fallen", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
    });
    const entries: Parameters<typeof processEndStateCheck>[1] = [];
    processEndStateCheck(s, entries);
    expect(s.endState?.status).toBe("fallen");
    expect(s.endState?.endedAtTick).toBe(100);
    expect(s.messages?.[0]?.title).toBe("CITY FALLEN");
    expect(entries.find((e) => e.label === "City End-State")).toBeTruthy();
  });

  it("is idempotent — no duplicate alert on subsequent ticks", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
    });
    processEndStateCheck(s, []);
    const messageCountAfterFirst = s.messages?.length ?? 0;
    processEndStateCheck(s, []);
    expect(s.messages?.length ?? 0).toBe(messageCountAfterFirst);
  });

  it("preserves the player's acknowledgement while the status is unchanged", () => {
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
    });
    processEndStateCheck(s, []);
    expect(s.endState?.status).toBe("fallen");
    // Player dismisses the end-state modal.
    s.endState!.acknowledged = true;
    // Subsequent ticks must not re-fire the modal.
    processEndStateCheck(s, []);
    expect(s.endState?.acknowledged).toBe(true);
  });

  it("clears acknowledgement on a real status transition so the modal re-fires", () => {
    // Start fallen and acknowledged.
    const s = baseState({
      cityStats: { population: 0 } as GameState["cityStats"],
      buildings: {},
    });
    processEndStateCheck(s, []);
    s.endState!.acknowledged = true;
    // Machine-ascension techs + droids flip the city to ascended-machine.
    s.unlockedTechnologies = [
      ASCENSION_TECHS.mindUpload,
      ASCENSION_TECHS.consciousnessTransfer,
      ASCENSION_TECHS.automatonCiv,
    ];
    s.units = { combatAssaultDroid: 10 } as GameState["units"];
    processEndStateCheck(s, []);
    expect(s.endState?.status).toBe("ascended-machine");
    expect(s.endState?.acknowledged).toBeUndefined();
  });
});

describe("applyNpcEndStateCheck", () => {
  const baseTownship: Township = {
    id: "ash", name: "Ashmouth", description: "", population: 1000,
    loyalty: 50, threat: 10, influence: 5, status: "neutral", factionType: "township",
  };

  it("marks township fallen when population is 0", () => {
    const r = applyNpcEndStateCheck({ ...baseTownship, population: 0 }, 50, { year: 2030, month: 1, day: 1, hour: 0 });
    expect(r.entity.endState).toBe("fallen");
    expect(r.entity.endedAtTick).toBe(50);
    expect(r.alert?.title).toMatch(/FALLEN/);
  });

  it("ignores occupied townships (player annexation, not collapse)", () => {
    const r = applyNpcEndStateCheck({ ...baseTownship, population: 0, controlStatus: "occupied" }, 50, { year: 2030, month: 1, day: 1, hour: 0 });
    expect(r.entity.endState).toBeUndefined();
    expect(r.alert).toBeNull();
  });

  it("does not re-fire alert for already-fallen townships", () => {
    const r = applyNpcEndStateCheck({ ...baseTownship, population: 0, endState: "fallen" }, 50, { year: 2030, month: 1, day: 1, hour: 0 });
    expect(r.alert).toBeNull();
  });
});

describe("helpers", () => {
  it("getLivingUnits sums known housing buildings with their per-unit capacity", () => {
    const s = baseState({ buildings: { habBlockMegaTowers: 1, workerHousingStacks: 2 } });
    expect(getLivingUnits(s)).toBe(8000 + 2 * 4000);
  });

  it("getDroidCount sums *droid units plus 50× robotics fabs", () => {
    const s = baseState({
      units: { combatAssaultDroid: 3, sanitationDroid: 2, infantry: 100 },
      buildings: { roboticsFabricationFacilities: 2 },
    });
    expect(getDroidCount(s)).toBe(3 + 2 + 2 * 50);
  });
});

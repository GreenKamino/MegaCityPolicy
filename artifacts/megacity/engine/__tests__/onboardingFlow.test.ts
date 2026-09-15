// Unit tests for the onboarding flow helpers — primarily the BACK
// affordance and the "skip forward jumps to latest reached beat"
// guarantee that lets a curious player rewind without losing progress.

import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  BEAT_NAME,
  BEAT_ORDER,
  BEAT_ROUTE,
  ONBOARDING_BUILD_BASELINE,
  ONBOARDING_BUILD_KEY,
  ONBOARDING_EDICT_BASELINE,
  ONBOARDING_EDICT_ID,
  ONBOARDING_WELCOME_MESSAGE_ID,
  backwardTargetBeat,
  forwardTargetBeat,
  isBeatActionSatisfied,
  latestReachedBeat,
  type OnboardingBeat,
} from "@/engine/onboardingFlow";

describe("onboarding BEAT_ORDER", () => {
  it("matches the canonical five-beat walkthrough", () => {
    expect(BEAT_ORDER).toEqual([
      "arrival",
      "build",
      "edict",
      "dispatch",
      "summary",
    ]);
  });

  it("has a route mapped for every beat", () => {
    for (const beat of BEAT_ORDER) {
      expect(BEAT_ROUTE[beat]).toMatch(/^\/\(game\)\//);
    }
  });

  it("has a short name for every beat (used by the progress strip)", () => {
    for (const beat of BEAT_ORDER) {
      const name = BEAT_NAME[beat];
      expect(name).toBeTruthy();
      // All-caps, dystopian voice convention.
      expect(name).toBe(name.toUpperCase());
    }
  });
});

describe("backwardTargetBeat", () => {
  it("returns null on the first beat", () => {
    expect(backwardTargetBeat("arrival")).toBeNull();
  });

  it("walks one beat earlier", () => {
    expect(backwardTargetBeat("build")).toBe("arrival");
    expect(backwardTargetBeat("edict")).toBe("build");
    expect(backwardTargetBeat("dispatch")).toBe("edict");
    expect(backwardTargetBeat("summary")).toBe("dispatch");
  });
});

describe("latestReachedBeat", () => {
  it("falls back to the cursor when no flags are set", () => {
    expect(
      latestReachedBeat({ onboardingStep: "build" } as never)
    ).toBe("build");
  });

  it("treats arrival as the floor when cursor is missing", () => {
    expect(latestReachedBeat({} as never)).toBe("arrival");
  });

  it("escalates through completion flags", () => {
    expect(latestReachedBeat({ didBuild: true } as never)).toBe("edict");
    expect(latestReachedBeat({ didEdict: true } as never)).toBe("dispatch");
    expect(latestReachedBeat({ didRead: true } as never)).toBe("summary");
  });

  it("uses the highest completed flag, not the cursor, after BACK", () => {
    // Player did the edict, then walked back to build.
    const state = {
      didBuild: true,
      didEdict: true,
      onboardingStep: "build" as OnboardingBeat,
    };
    expect(latestReachedBeat(state as never)).toBe("dispatch");
  });
});

describe("forwardTargetBeat", () => {
  it("advances one step on a fresh walkthrough", () => {
    expect(forwardTargetBeat("arrival", {} as never)).toBe("build");
    expect(forwardTargetBeat("build", {} as never)).toBe("edict");
  });

  it("returns null past the final beat", () => {
    expect(forwardTargetBeat("summary", {} as never)).toBeNull();
  });

  it("skips straight to the latest reached beat after BACK", () => {
    // Player completed every action, walked all the way back to arrival,
    // and pressed BEGIN ORIENTATION again.
    const state = {
      didBuild: true,
      didEdict: true,
      didRead: true,
      onboardingStep: "arrival" as OnboardingBeat,
    };
    expect(forwardTargetBeat("arrival", state as never)).toBe("summary");
  });

  it("still advances one when the cursor is already at the latest reached beat", () => {
    const state = {
      didBuild: true,
      onboardingStep: "edict" as OnboardingBeat,
    };
    expect(forwardTargetBeat("edict", state as never)).toBe("dispatch");
  });
});

describe("isBeatActionSatisfied — durable action detection", () => {
  it("build: not satisfied at the fresh-game baseline", () => {
    expect(
      isBeatActionSatisfied("build", {
        buildings: { [ONBOARDING_BUILD_KEY]: ONBOARDING_BUILD_BASELINE },
      })
    ).toBe(false);
  });

  it("build: satisfied once one more stack is authorised", () => {
    expect(
      isBeatActionSatisfied("build", {
        buildings: { [ONBOARDING_BUILD_KEY]: ONBOARDING_BUILD_BASELINE + 1 },
      })
    ).toBe(true);
  });

  it("build: stays satisfied above baseline even when the flag was never set (reload gap)", () => {
    // Player authorised the build (count persisted) but the app closed before
    // the banner flipped didBuild. A mount-time baseline would have absorbed
    // the higher count and stranded the beat; the durable baseline still
    // reports the action as done.
    expect(
      isBeatActionSatisfied("build", {
        buildings: { [ONBOARDING_BUILD_KEY]: ONBOARDING_BUILD_BASELINE + 3 },
      })
    ).toBe(true);
  });

  it("build: is satisfied as soon as a timed housing order is authorised", () => {
    expect(
      isBeatActionSatisfied("build", {
        buildings: { [ONBOARDING_BUILD_KEY]: ONBOARDING_BUILD_BASELINE },
        pendingConstructions: [{
          kind: "city",
          buildingKey: ONBOARDING_BUILD_KEY,
          count: 1,
        }],
      }),
    ).toBe(true);
  });

  it("build: ignores unrelated pending construction orders", () => {
    expect(
      isBeatActionSatisfied("build", {
        buildings: { [ONBOARDING_BUILD_KEY]: ONBOARDING_BUILD_BASELINE },
        pendingConstructions: [{
          kind: "city",
          buildingKey: "solarTowerFields",
          count: 1,
        }],
      }),
    ).toBe(false);
  });

  it("edict: not satisfied with no active rations", () => {
    expect(isBeatActionSatisfied("edict", { activeEdicts: [] })).toBe(false);
  });

  it("edict: satisfied once emergency rations is active", () => {
    expect(
      isBeatActionSatisfied("edict", {
        activeEdicts: [{ edictId: ONBOARDING_EDICT_ID }],
      })
    ).toBe(true);
  });

  it("edict: ignores unrelated active edicts", () => {
    expect(
      isBeatActionSatisfied("edict", {
        activeEdicts: [{ edictId: "some_other_edict" }],
      })
    ).toBe(false);
  });

  it("edict: satisfied via cooldown after the issued rations expired (reload gap)", () => {
    // Player issued rations, then a save/quit let offline catch-up expire it
    // before the per-beat flag was set. The cooldown is the durable proof.
    expect(
      isBeatActionSatisfied("edict", {
        activeEdicts: [],
        edictCooldowns: { [ONBOARDING_EDICT_ID]: 42 },
      })
    ).toBe(true);
  });

  it("edict: not satisfied with neither active rations nor a rations cooldown", () => {
    expect(
      isBeatActionSatisfied("edict", { activeEdicts: [], edictCooldowns: {} })
    ).toBe(false);
  });

  it("dispatch: not satisfied while the welcome dispatch is unread", () => {
    expect(
      isBeatActionSatisfied("dispatch", {
        messages: [{ id: ONBOARDING_WELCOME_MESSAGE_ID, read: false }],
      })
    ).toBe(false);
  });

  it("dispatch: satisfied once the welcome dispatch is read", () => {
    expect(
      isBeatActionSatisfied("dispatch", {
        messages: [{ id: ONBOARDING_WELCOME_MESSAGE_ID, read: true }],
      })
    ).toBe(true);
  });

  it("tolerates missing collections (partial / legacy shapes)", () => {
    expect(isBeatActionSatisfied("build", {})).toBe(false);
    expect(isBeatActionSatisfied("edict", {})).toBe(false);
    expect(isBeatActionSatisfied("dispatch", {})).toBe(false);
  });
});

describe("onboarding action baselines stay in lockstep with initialState", () => {
  it("the build baseline equals the fresh-game worker housing stack count", () => {
    const fresh = createInitialState();
    expect(
      (fresh.buildings as Record<string, number>)[ONBOARDING_BUILD_KEY]
    ).toBe(ONBOARDING_BUILD_BASELINE);
  });

  it("a fresh game has no active rations (edict baseline is zero)", () => {
    const fresh = createInitialState();
    const active = fresh.activeEdicts.filter(
      (e) => e.edictId === ONBOARDING_EDICT_ID
    ).length;
    expect(active).toBe(ONBOARDING_EDICT_BASELINE);
  });

  it("a fresh game ships the welcome dispatch unread", () => {
    const fresh = createInitialState();
    const msg = fresh.messages.find((m) => m.id === ONBOARDING_WELCOME_MESSAGE_ID);
    expect(msg?.read).toBe(false);
  });

  it("a fresh game has no emergency_rations cooldown (no false-positive edict completion)", () => {
    const fresh = createInitialState();
    expect(fresh.edictCooldowns[ONBOARDING_EDICT_ID]).toBeUndefined();
  });

  it("a fresh game pre-satisfies none of the action beats", () => {
    const fresh = createInitialState();
    const asAction = {
      buildings: fresh.buildings as Record<string, number>,
      activeEdicts: fresh.activeEdicts,
      edictCooldowns: fresh.edictCooldowns,
      messages: fresh.messages,
    };
    expect(isBeatActionSatisfied("build", asAction)).toBe(false);
    expect(isBeatActionSatisfied("edict", asAction)).toBe(false);
    expect(isBeatActionSatisfied("dispatch", asAction)).toBe(false);
  });
});

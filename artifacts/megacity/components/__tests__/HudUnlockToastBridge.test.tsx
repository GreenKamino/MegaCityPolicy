import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Integration test for the new-player "X UNLOCKED" announcement bridge. The
// pure unlock rules live in engine/hudUnlocks.ts (covered by hudUnlocks.test.ts)
// and are intentionally NOT mocked here — we mount the REAL HudUnlockToastBridge
// and drive it with real GameState shapes, mocking ONLY useGameState +
// useToast. This guards the three ways the opening can silently break:
//   1. a mid-game reload replays unlocks the player already has,
//   2. a newly revealed feature stops announcing (or double-announces),
//   3. orientation completion stacks ~8 toasts instead of one summary line.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `mock`-prefixed so vitest allows the hoisted vi.mock factories to reference it.
const mockGame: { state: any } = { state: {} };
const mockToast: { messages: string[] } = { messages: [] };

vi.mock("@/context/GameContext", () => ({
  useGameState: () => mockGame,
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({
    showToast: (msg: string) => mockToast.messages.push(msg),
  }),
}));

import TestRenderer, { act } from "react-test-renderer";
import HudUnlockToastBridge from "@/components/HudUnlockToastBridge";

type UnlockFields = {
  hasCompletedOnboarding?: boolean;
  didBuild?: boolean;
  didEdict?: boolean;
  didRead?: boolean;
  onboardingStep?: string;
  gameplayMode?: "realtime" | "turnbased";
};

// A fresh-game state still inside the first-run orientation by default.
function mk(over: UnlockFields = {}) {
  return {
    hasCompletedOnboarding: false,
    didBuild: false,
    didEdict: false,
    didRead: false,
    onboardingStep: "arrival",
    ...over,
  };
}

// Mount the bridge against `state` (this is the component's FIRST observation).
function mount(state: any): TestRenderer.ReactTestRenderer {
  mockGame.state = state;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(React.createElement(HudUnlockToastBridge));
  });
  return tree;
}

// Re-render the bridge with a NEW state object so its effect (dep: [state])
// re-runs, mirroring a real GameState update.
function advance(tree: TestRenderer.ReactTestRenderer, state: any) {
  mockGame.state = state;
  act(() => {
    tree.update(React.createElement(HudUnlockToastBridge));
  });
}

beforeEach(() => {
  mockToast.messages = [];
  mockGame.state = {};
});

describe("HudUnlockToastBridge — first observation is silent", () => {
  it("a fresh-game first mount announces nothing", () => {
    mount(mk());
    expect(mockToast.messages).toEqual([]);
  });

  it("a mid-game reload does NOT replay unlocks the player already has", () => {
    // Player reloads deep into orientation (build + law + inbox already open).
    mount(mk({ didBuild: true, didEdict: true }));
    expect(mockToast.messages).toEqual([]);
  });

  it("a completed/veteran save mounting fully-unlocked announces nothing", () => {
    mount(mk({ hasCompletedOnboarding: true }));
    expect(mockToast.messages).toEqual([]);
  });
});

describe("HudUnlockToastBridge — each newly revealed feature announces once", () => {
  it("advancing arrival -> build fires exactly one CONSTRUCTION toast", () => {
    const tree = mount(mk());
    advance(tree, mk({ onboardingStep: "build" }));
    expect(mockToast.messages).toEqual(["CONSTRUCTION UNLOCKED"]);
  });

  it("completing the build beat reveals LAW & ORDER (one toast)", () => {
    const tree = mount(mk({ onboardingStep: "build" }));
    advance(tree, mk({ didBuild: true }));
    expect(mockToast.messages).toEqual(["LAW & ORDER UNLOCKED"]);
  });

  it("completing the edict reveals the DISPATCH INBOX (one toast)", () => {
    const tree = mount(mk({ didBuild: true }));
    advance(tree, mk({ didBuild: true, didEdict: true }));
    expect(mockToast.messages).toEqual(["DISPATCH INBOX UNLOCKED"]);
  });

  it("the summary beat reveals ECONOMY and RESEARCH — one toast each, no more", () => {
    const tree = mount(mk({ didBuild: true, didEdict: true }));
    advance(tree, mk({ didBuild: true, didEdict: true, didRead: true }));
    expect(mockToast.messages.sort()).toEqual([
      "ECONOMY UNLOCKED",
      "RESEARCH UNLOCKED",
    ]);
    expect(mockToast.messages).toHaveLength(2);
  });

  it("CITY / overview is never announced as it unlocks", () => {
    // Walk the whole orientation, beat by beat, and prove CITY never toasts.
    const tree = mount(mk());
    advance(tree, mk({ onboardingStep: "build" }));
    advance(tree, mk({ didBuild: true }));
    advance(tree, mk({ didBuild: true, didEdict: true }));
    advance(tree, mk({ didBuild: true, didEdict: true, didRead: true }));
    for (const msg of mockToast.messages) {
      expect(msg).not.toContain("CITY");
    }
  });

  it("a no-op re-render (same beat) does not re-announce anything", () => {
    const tree = mount(mk());
    advance(tree, mk({ onboardingStep: "build" }));
    expect(mockToast.messages).toEqual(["CONSTRUCTION UNLOCKED"]);
    // Re-render at the same beat: nothing new should fire.
    advance(tree, mk({ onboardingStep: "build" }));
    expect(mockToast.messages).toEqual(["CONSTRUCTION UNLOCKED"]);
  });
});

describe("HudUnlockToastBridge — orientation completion collapses to one line", () => {
  it("fires the single ALL SYSTEMS ONLINE line instead of stacking ~8 toasts", () => {
    const tree = mount(mk({ didBuild: true, didEdict: true, didRead: true }));
    // Orientation finishes: intro lock lifts (everything opens at once).
    advance(tree, mk({ hasCompletedOnboarding: true }));
    expect(mockToast.messages).toEqual([
      "ALL SYSTEMS ONLINE — press Play to begin",
    ]);
  });

  it("nudges End Turn instead of Play in turn-based mode", () => {
    const tree = mount(mk({ gameplayMode: "turnbased", didBuild: true, didEdict: true, didRead: true }));
    advance(tree, mk({ gameplayMode: "turnbased", hasCompletedOnboarding: true }));
    expect(mockToast.messages).toEqual([
      "ALL SYSTEMS ONLINE — press End Turn to begin",
    ]);
  });

  it("collapses even when completing straight from the very first beat (Skip Intro)", () => {
    const tree = mount(mk());
    advance(tree, mk({ hasCompletedOnboarding: true }));
    expect(mockToast.messages).toEqual([
      "ALL SYSTEMS ONLINE — press Play to begin",
    ]);
    // The flood of late-game unlocks must NOT appear individually.
    expect(mockToast.messages).toHaveLength(1);
    expect(mockToast.messages.some((m) => m.includes("UNLOCKED"))).toBe(false);
  });
});

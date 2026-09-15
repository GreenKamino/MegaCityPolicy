import { describe, it, expect } from "vitest";

import {
  HUD_COACH_TIPS,
  HUD_COACH_TIP_TICK_WINDOW,
  coachTipFeatureForRoute,
  coachTipId,
  isCoachTipWindowActive,
  shouldShowHudCoachTip,
  type CoachTipFeatureId,
} from "@/engine/hudCoachTips";
import { ROUTE_FEATURE, type HudFeatureId } from "@/engine/hudUnlocks";
import { TUTORIAL_HINTS } from "@/engine/tutorialHints";

// The state slice the coach-tip gate reads. Defaults describe a fresh GUIDED
// game one tick past orientation: the opt-in is on, onboarding is complete, and
// the early-game window is still open.
type CoachFields = {
  hudCoachTipsActive?: boolean;
  hasCompletedOnboarding?: boolean;
  totalTicks?: number;
  didBuild?: boolean;
  didEdict?: boolean;
  didRead?: boolean;
  onboardingStep?: string;
};

function mk(over: CoachFields = {}) {
  return {
    hudCoachTipsActive: true,
    hasCompletedOnboarding: true,
    totalTicks: 0,
    didBuild: true,
    didEdict: true,
    didRead: true,
    onboardingStep: "summary",
    ...over,
  } as any;
}

describe("hudCoachTips — window gate", () => {
  it("fresh guided game past orientation is inside the window", () => {
    expect(isCoachTipWindowActive(mk())).toBe(true);
  });

  it("is suppressed during orientation (onboarding not complete)", () => {
    // The forced beats already show a banner + intro hint, so coach tips wait
    // until orientation finishes.
    expect(isCoachTipWindowActive(mk({ hasCompletedOnboarding: false }))).toBe(false);
    expect(shouldShowHudCoachTip(mk({ hasCompletedOnboarding: false }), "worldmap")).toBe(false);
  });

  it("closes once the early-game tick window elapses", () => {
    expect(isCoachTipWindowActive(mk({ totalTicks: HUD_COACH_TIP_TICK_WINDOW }))).toBe(true);
    expect(isCoachTipWindowActive(mk({ totalTicks: HUD_COACH_TIP_TICK_WINDOW + 1 }))).toBe(false);
  });

  it("never fires for legacy saves (flag absent)", () => {
    expect(isCoachTipWindowActive(mk({ hudCoachTipsActive: undefined }))).toBe(false);
    expect(shouldShowHudCoachTip(mk({ hudCoachTipsActive: undefined }), "military")).toBe(false);
  });

  it("never fires for veteran starts (flag explicitly false)", () => {
    expect(isCoachTipWindowActive(mk({ hudCoachTipsActive: false }))).toBe(false);
    expect(shouldShowHudCoachTip(mk({ hudCoachTipsActive: false }), "military")).toBe(false);
  });
});

describe("hudCoachTips — per-feature gate", () => {
  it("shows for every coached feature when the window is open", () => {
    const s = mk();
    for (const feature of Object.keys(HUD_COACH_TIPS) as CoachTipFeatureId[]) {
      expect(shouldShowHudCoachTip(s, feature)).toBe(true);
    }
  });

  it("never shows for the always-present CITY/overview tab", () => {
    expect(shouldShowHudCoachTip(mk(), "overview")).toBe(false);
  });
});

describe("hudCoachTips — route resolution", () => {
  it("maps both '/x' and '/(game)/x' route forms to a feature", () => {
    expect(coachTipFeatureForRoute("/worldmap")).toBe("worldmap");
    expect(coachTipFeatureForRoute("/(game)/worldmap")).toBe("worldmap");
    expect(coachTipFeatureForRoute("/construction")).toBe("construction");
  });

  it("returns null for overview, unmapped sub-screens, and empty paths", () => {
    expect(coachTipFeatureForRoute("/overview")).toBeNull();
    expect(coachTipFeatureForRoute("/(game)/overview")).toBeNull();
    expect(coachTipFeatureForRoute("/finances")).toBeNull();
    expect(coachTipFeatureForRoute("/settings")).toBeNull();
    expect(coachTipFeatureForRoute("/")).toBeNull();
    expect(coachTipFeatureForRoute("")).toBeNull();
    expect(coachTipFeatureForRoute(null)).toBeNull();
  });

  it("derives a stable per-feature seen-once id", () => {
    expect(coachTipId("worldmap")).toBe("coach_worldmap");
    expect(coachTipId("military")).toBe("coach_military");
  });
});

describe("hudCoachTips — catalog integrity", () => {
  it("covers every gated HUD feature except overview, with non-empty copy", () => {
    const gated = new Set(Object.values(ROUTE_FEATURE) as HudFeatureId[]);
    gated.delete("overview");
    const coached = new Set(Object.keys(HUD_COACH_TIPS) as HudFeatureId[]);
    expect(coached).toEqual(gated);
    for (const line of Object.values(HUD_COACH_TIPS)) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not duplicate the matching *_intro hint copy", () => {
    // The coach tip must complement, not restate, the verbose bottom-of-screen
    // *_intro hint. Assert the two strings are never identical for any feature
    // that has both.
    const introById = new Map(TUTORIAL_HINTS.map((h) => [h.id, h.message]));
    for (const feature of Object.keys(HUD_COACH_TIPS) as CoachTipFeatureId[]) {
      const intro = introById.get(`${feature}_intro`);
      if (intro) expect(HUD_COACH_TIPS[feature]).not.toBe(intro);
    }
  });
});

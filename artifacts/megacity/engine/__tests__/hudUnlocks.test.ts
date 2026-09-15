import { describe, it, expect } from "vitest";

import {
  getUnlockedHudFeatures,
  isHudFeatureUnlocked,
  isRouteUnlocked,
  isIntroLockActive,
  unlockedHudFeaturesCsv,
} from "@/engine/hudUnlocks";

// The five fields the unlock helpers read off GameState. Defaults describe a
// brand-new game sitting on the very first onboarding beat (arrival).
type UnlockFields = {
  hasCompletedOnboarding?: boolean;
  didBuild?: boolean;
  didEdict?: boolean;
  didRead?: boolean;
  onboardingStep?: string;
};

function mk(over: UnlockFields = {}) {
  return {
    hasCompletedOnboarding: false,
    didBuild: false,
    didEdict: false,
    didRead: false,
    onboardingStep: "arrival",
    ...over,
  } as any;
}

const TOTAL_FEATURES = 14;

describe("hudUnlocks — fresh new-game ramp", () => {
  it("arrival shows only the CITY tab", () => {
    const s = mk();
    expect(isIntroLockActive(s)).toBe(true);
    const u = getUnlockedHudFeatures(s);
    expect([...u]).toEqual(["overview"]);
    expect(unlockedHudFeaturesCsv(s)).toBe("overview");
    expect(isRouteUnlocked("/(game)/overview", s)).toBe(true);
    expect(isRouteUnlocked("/(game)/construction", s)).toBe(false);
    expect(isRouteUnlocked("/(game)/inbox", s)).toBe(false);
  });

  it("reaching the build beat reveals CONSTRUCTION", () => {
    const s = mk({ onboardingStep: "build" });
    const u = getUnlockedHudFeatures(s);
    expect(u.has("construction")).toBe(true);
    expect(u.has("law")).toBe(false);
    expect(isHudFeatureUnlocked("construction", s)).toBe(true);
    expect(isRouteUnlocked("/(game)/construction", s)).toBe(true);
  });

  it("completing build (didBuild) reveals LAW", () => {
    const s = mk({ didBuild: true });
    const u = getUnlockedHudFeatures(s);
    expect(u.has("construction")).toBe(true);
    expect(u.has("law")).toBe(true);
    expect(u.has("inbox")).toBe(false);
  });

  it("completing the edict (didEdict) reveals the DISPATCH INBOX", () => {
    const s = mk({ didBuild: true, didEdict: true });
    const u = getUnlockedHudFeatures(s);
    expect(u.has("inbox")).toBe(true);
    expect(u.has("economy")).toBe(false);
    expect(u.has("research")).toBe(false);
  });

  it("reading the dispatch (didRead -> summary) reveals ECONOMY and RESEARCH", () => {
    const s = mk({ didBuild: true, didEdict: true, didRead: true });
    const u = getUnlockedHudFeatures(s);
    expect(u.has("economy")).toBe(true);
    expect(u.has("research")).toBe(true);
    // Late-game tabs still stay hidden until the orientation is finished.
    expect(u.has("worldmap")).toBe(false);
    expect(u.has("military")).toBe(false);
    expect(u.size).toBeLessThan(TOTAL_FEATURES);
  });
});

describe("hudUnlocks — everything unlocked (safety)", () => {
  it("completed / skipped onboarding unlocks every feature and route", () => {
    const s = mk({ hasCompletedOnboarding: true });
    expect(isIntroLockActive(s)).toBe(false);
    const u = getUnlockedHudFeatures(s);
    expect(u.size).toBe(TOTAL_FEATURES);
    for (const route of ["/(game)/military", "/(game)/worldmap", "/(game)/more", "/(game)/character"]) {
      expect(isRouteUnlocked(route, s)).toBe(true);
    }
    expect(unlockedHudFeaturesCsv(s).split(",").length).toBe(TOTAL_FEATURES);
  });

  it("legacy saves (hasCompletedOnboarding undefined) are never gated", () => {
    const s = mk({ hasCompletedOnboarding: undefined });
    expect(isIntroLockActive(s)).toBe(false);
    expect(getUnlockedHudFeatures(s).size).toBe(TOTAL_FEATURES);
    expect(isRouteUnlocked("/(game)/military", s)).toBe(true);
    expect(isHudFeatureUnlocked("worldmap", s)).toBe(true);
  });
});

describe("hudUnlocks — route helpers", () => {
  it("treats unmapped routes (sub-screens, settings, debug) as always unlocked", () => {
    const s = mk();
    expect(isRouteUnlocked("/(game)/settings", s)).toBe(true);
    expect(isRouteUnlocked("/(game)/some-detail-screen", s)).toBe(true);
  });

  it("accepts both '/x' and '/(game)/x' route forms", () => {
    const s = mk({ hasCompletedOnboarding: true });
    expect(isRouteUnlocked("/military", s)).toBe(true);
    expect(isRouteUnlocked("/(game)/military", s)).toBe(true);
  });

  it("csv is a stable signature for the same unlock state", () => {
    expect(unlockedHudFeaturesCsv(mk())).toBe(unlockedHudFeaturesCsv(mk()));
  });
});

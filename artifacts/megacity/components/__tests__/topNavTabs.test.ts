import { describe, expect, it } from "vitest";

// Pure fit logic for the top nav bar. No RN/expo imports here, so this runs in
// plain Node. Covers: extended tabs stay hidden when disabled or the bar is too
// narrow, appear in priority order as width grows, are capped by available
// width, and always keep MORE pinned last (with core tabs untouched).

import {
  BOTTOM_TAB_DEFS,
  BOTTOM_TAB_ROUTES,
  computeVisibleTabs,
  CORE_TAB_DEFS,
  EXTENDED_TAB_DEFS,
  MORE_TAB_DEF,
  MORE_ROUTE,
  TAB_WIDTH,
  HELP_WIDTH,
} from "@/components/topNavTabs";

const BASE = [...CORE_TAB_DEFS, MORE_TAB_DEF];
const routes = (defs: { route: string }[]) => defs.map((d) => d.route);

describe("computeVisibleTabs", () => {
  it("returns just the base tabs when no extended tabs are eligible", () => {
    const out = computeVisibleTabs({
      containerWidth: 2000,
      baseDefs: BASE,
      extendedDefs: [],
      showHelp: false,
    });
    expect(routes(out)).toEqual(routes(BASE));
  });

  it("returns just the base tabs when the width is unknown (0)", () => {
    const out = computeVisibleTabs({
      containerWidth: 0,
      baseDefs: BASE,
      extendedDefs: EXTENDED_TAB_DEFS,
      showHelp: true,
    });
    expect(routes(out)).toEqual(routes(BASE));
  });

  it("shows no extended tabs on a narrow (phone) bar", () => {
    // 402px phone: base (7) already overflows, so nothing extra fits.
    const out = computeVisibleTabs({
      containerWidth: 402,
      baseDefs: BASE,
      extendedDefs: EXTENDED_TAB_DEFS,
      showHelp: false,
    });
    expect(routes(out)).toEqual(routes(BASE));
  });

  it("reveals all extended tabs on a wide (desktop) bar, MORE pinned last", () => {
    // Wide enough for every extended tab regardless of how many are defined.
    const width = BASE.length * TAB_WIDTH + HELP_WIDTH + EXTENDED_TAB_DEFS.length * TAB_WIDTH + TAB_WIDTH / 2;
    const out = computeVisibleTabs({
      containerWidth: width,
      baseDefs: BASE,
      extendedDefs: EXTENDED_TAB_DEFS,
      showHelp: true,
    });
    // core (6) + all extended + MORE
    expect(out.length).toBe(CORE_TAB_DEFS.length + EXTENDED_TAB_DEFS.length + 1);
    expect(out[out.length - 1].route).toBe(MORE_ROUTE);
    // Core tabs keep their leading order.
    expect(routes(out.slice(0, CORE_TAB_DEFS.length))).toEqual(routes(CORE_TAB_DEFS));
  });

  it("adds extended tabs in priority order and caps by available width", () => {
    // Reserve base (7) + help, then leave room for exactly 3 extended tabs.
    const reserved = BASE.length * TAB_WIDTH + HELP_WIDTH;
    const width = reserved + TAB_WIDTH * 3 + TAB_WIDTH / 2; // 3 fit, not a 4th
    const out = computeVisibleTabs({
      containerWidth: width,
      baseDefs: BASE,
      extendedDefs: EXTENDED_TAB_DEFS,
      showHelp: true,
    });
    const shown = out.filter((d) => EXTENDED_TAB_DEFS.some((e) => e.route === d.route));
    expect(routes(shown)).toEqual(routes(EXTENDED_TAB_DEFS.slice(0, 3)));
    // MORE still last.
    expect(out[out.length - 1].route).toBe(MORE_ROUTE);
  });

  it("inserts extended tabs immediately before MORE", () => {
    // Wide enough for every extended tab regardless of how many are defined.
    const width = BASE.length * TAB_WIDTH + EXTENDED_TAB_DEFS.length * TAB_WIDTH + TAB_WIDTH / 2;
    const out = computeVisibleTabs({
      containerWidth: width,
      baseDefs: BASE,
      extendedDefs: EXTENDED_TAB_DEFS,
      showHelp: false,
    });
    const moreIdx = out.findIndex((d) => d.route === MORE_ROUTE);
    const beforeMore = out[moreIdx - 1];
    // The last extended tab sits directly before MORE.
    expect(beforeMore.route).toBe(EXTENDED_TAB_DEFS[EXTENDED_TAB_DEFS.length - 1].route);
  });

  it("only the first nine extended tabs carry Shift+N badges (slots are exhausted)", () => {
    // HotkeyContext binds shift+1..shift+9 to EXTENDED_TAB_DEFS[0..8]. Any tab
    // past index 8 must NOT claim a shifted-digit badge — later tabs carry the
    // letter key they already own on the bottom quick bar instead.
    EXTENDED_TAB_DEFS.forEach((def, i) => {
      if (i <= 8) {
        expect(def.hotkey, `${def.label} should badge Shift+${i + 1}`).toBe(`⇧${i + 1}`);
      } else {
        expect(def.hotkey.includes("⇧"), `${def.label} must not claim a shifted-digit badge`).toBe(false);
      }
    });
  });

  it("respects an unlock-filtered base without a MORE tab (onboarding)", () => {
    // During onboarding MORE is not yet revealed; extended tabs are also
    // disabled, so the output is exactly the partial base.
    const partial = CORE_TAB_DEFS.slice(0, 3);
    const out = computeVisibleTabs({
      containerWidth: 1280,
      baseDefs: partial,
      extendedDefs: [],
      showHelp: false,
    });
    expect(routes(out)).toEqual(routes(partial));
  });
});

describe("bottom quick tabs", () => {
  it("promotes high-value More destinations without duplicate routes", () => {
    expect(new Set(BOTTOM_TAB_ROUTES).size).toBe(BOTTOM_TAB_ROUTES.length);
    expect(BOTTOM_TAB_ROUTES).toEqual(expect.arrayContaining([
      "/(game)/missions",
      "/(game)/finances",
      "/(game)/officers",
      "/(game)/districts",
      "/(game)/trade",
      "/(game)/stats",
      "/(game)/codex",
    ]));
  });

  it("reuses the shared extended-tab metadata for every bottom destination", () => {
    for (const bottomDef of BOTTOM_TAB_DEFS) {
      const sharedDef = EXTENDED_TAB_DEFS.find((def) => def.route === bottomDef.route);
      expect(sharedDef, `${bottomDef.route} must have shared route metadata`).toBeDefined();
      expect(bottomDef.label).toBe(sharedDef?.label);
      expect(bottomDef.iconName).toBe(sharedDef?.iconName);
      expect(bottomDef.iconSet).toBe(sharedDef?.iconSet);
    }
  });

  it("keeps the established Q-U shortcuts only on their original routes", () => {
    const shortcuts = BOTTOM_TAB_DEFS
      .filter((def) => def.bottomHotkey)
      .map((def) => [def.bottomHotkey, def.route]);
    expect(shortcuts).toEqual([
      ["Q", "/(game)/inbox"],
      ["W", "/(game)/research"],
      ["E", "/(game)/military"],
      ["R", "/(game)/factions"],
      ["T", "/(game)/events"],
      ["Y", "/(game)/wildlands"],
      ["U", "/(game)/character"],
    ]);
  });
});

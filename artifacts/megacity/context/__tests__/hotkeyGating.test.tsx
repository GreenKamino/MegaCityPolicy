import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Integration test for the keyboard / gamepad navigation gating built inside
// HotkeyProvider. We mount the REAL provider, capture the keyMap it hands to
// useKeyboard and the handler bag it hands to useGamepad, then drive them and
// assert that locked routes no-op (with a toast) during the first-run
// orientation, work once unlocked, and that Overview is always reachable.
// engine/hudUnlocks is intentionally NOT mocked.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replace = vi.fn();
const showToast = vi.fn();
const toggleTickPause = vi.fn();
const setTickInterval = vi.fn();
const saveGame = vi.fn();

let currentState: any = {};
let currentPathname = "/(game)/overview";
let capturedKeyMap: Record<string, (...a: any[]) => any> = {};
let capturedGamepad: any = {};

vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (o: any) => o.web ?? o.default },
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => currentPathname,
}));

vi.mock("@/context/GameContext", () => ({
  useGame: () => ({ toggleTickPause, setTickInterval, state: currentState, saveGame }),
}));

vi.mock("@/context/PhotoModeContext", () => ({
  usePhotoMode: () => ({ toggle: vi.fn() }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("@/hooks/useKeyboard", () => ({
  useKeyboard: (keyMap: Record<string, (...a: any[]) => any>) => {
    capturedKeyMap = keyMap;
  },
}));

vi.mock("@/hooks/useGamepad", () => ({
  useGamepad: (cfg: any) => {
    capturedGamepad = cfg;
  },
}));

vi.mock("@/engine/spatialNav", () => ({
  moveFocus: () => false,
  activateFocused: () => {},
  clearFocus: () => false,
}));

vi.mock("@/hooks/useKeyboardHelp", () => ({ openKeyboardHelp: () => {} }));
vi.mock("@/context/ThemeContext", () => {
  const React = require("react");
  const colors = { accent: "#00FF41" };
  const ThemeContext = React.createContext({
    mode: "dark",
    colors,
    toggleTheme: () => {},
    setTheme: () => {},
    isDark: true,
  });
  return {
    ThemeContext,
    useTheme: () => React.useContext(ThemeContext),
  };
});
vi.mock("@/engine/steamBridge", () => ({
  captureSteamScreenshot: async () => ({ ok: true }),
  isDesktopCaptureAvailable: () => false,
}));

import TestRenderer, { act } from "react-test-renderer";
import { HotkeyProvider, useHotkeys } from "@/context/HotkeyContext";

// Grabs the live context so tests can drive setVisibleExtendedRoutes exactly
// like TopNavBar does at runtime.
let capturedCtx: ReturnType<typeof useHotkeys> | null = null;
function CaptureCtx() {
  capturedCtx = useHotkeys();
  return null;
}

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
    tickIntervalMinutes: 5,
    honorMode: false,
    ...over,
  };
}

const OVERVIEW = "/(game)/overview";
const CONSTRUCTION = "/(game)/construction";
const LAW = "/(game)/law";
const INBOX = "/(game)/inbox";

// The full nav-key table. Keys are what useKeyboard receives; routes are where a
// fully-unlocked save must land. Pinning the whole table means a key↔route swap
// among unlocked routes also fails the suite, not just a missing lock.
const KEY_ROUTES: Record<string, string> = {
  "1": "/(game)/overview",
  "2": "/(game)/law",
  "3": "/(game)/economy",
  "4": "/(game)/worldmap",
  "5": "/(game)/construction",
  "6": "/(game)/diplomacy",
  "7": "/(game)/more",
  q: "/(game)/inbox",
  w: "/(game)/research",
  e: "/(game)/military",
  r: "/(game)/factions",
  t: "/(game)/events",
  y: "/(game)/wildlands",
  u: "/(game)/character",
};

// Mount HotkeyProvider against `state` so the captured keyMap/gamepad reflect it.
function mount(state: any, pathname = OVERVIEW) {
  currentState = state;
  currentPathname = pathname;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      React.createElement(HotkeyProvider, null, React.createElement(CaptureCtx, null)),
    );
  });
  // Fail closed: if the provider ever stopped wiring useKeyboard/useGamepad, the
  // captured handlers would be empty and every "does X navigate" assertion would
  // silently pass against a stale map from a prior render.
  if (Object.keys(capturedKeyMap).length === 0) {
    throw new Error("HotkeyProvider did not register a keyMap with useKeyboard");
  }
  if (typeof capturedGamepad.onRB !== "function") {
    throw new Error("HotkeyProvider did not register gamepad handlers");
  }
  return tree;
}

beforeEach(() => {
  replace.mockClear();
  showToast.mockClear();
  capturedKeyMap = {};
  capturedGamepad = {};
  capturedCtx = null;
});

describe("Hotkey nav gating — fresh game (orientation in progress)", () => {
  it("the locked BUILD key (5) shows a hint and does NOT navigate", () => {
    const tree = mount(mk());
    act(() => capturedKeyMap["5"]());
    expect(replace).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toMatch(/lock/i);
    act(() => tree.unmount());
  });

  it("the locked INBOX key (q) shows a hint and does NOT navigate", () => {
    const tree = mount(mk());
    act(() => capturedKeyMap["q"]());
    expect(replace).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it("the always-available CITY key (1) navigates with no lock hint", () => {
    const tree = mount(mk());
    act(() => capturedKeyMap["1"]());
    expect(replace).toHaveBeenCalledWith(OVERVIEW);
    expect(showToast).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("Escape always returns to the City overview, even while locked", () => {
    const tree = mount(mk(), CONSTRUCTION);
    act(() => capturedKeyMap["escape"]());
    expect(replace).toHaveBeenCalledWith(OVERVIEW);
    act(() => tree.unmount());
  });

  it("gamepad route-cycling only walks unlocked routes (never lands on a locked one)", () => {
    const tree = mount(mk(), OVERVIEW);
    // Only Overview is unlocked at arrival, so cycling stays on Overview.
    act(() => capturedGamepad.onRB());
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(OVERVIEW);
    act(() => tree.unmount());
  });
});

describe("Hotkey nav gating — routes unlock as the player advances", () => {
  it("BUILD key works once the build beat is reached", () => {
    const tree = mount(mk({ onboardingStep: "build" }));
    act(() => capturedKeyMap["5"]());
    expect(replace).toHaveBeenCalledWith(CONSTRUCTION);
    expect(showToast).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("INBOX key works once the dispatch beat is reached (didEdict)", () => {
    const tree = mount(mk({ didBuild: true, didEdict: true }));
    act(() => capturedKeyMap["q"]());
    expect(replace).toHaveBeenCalledWith(INBOX);
    expect(showToast).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe("Hotkey nav gating — veterans (safety)", () => {
  it("a completed save maps every nav key to its exact route, with no hint", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }));
    for (const [key, route] of Object.entries(KEY_ROUTES)) {
      replace.mockClear();
      act(() => capturedKeyMap[key]());
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith(route);
    }
    expect(showToast).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("a legacy save (hasCompletedOnboarding undefined) is never gated", () => {
    const tree = mount(mk({ hasCompletedOnboarding: undefined }));
    act(() => capturedKeyMap["5"]());
    act(() => capturedKeyMap["q"]());
    expect(showToast).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(CONSTRUCTION);
    expect(replace).toHaveBeenCalledWith(INBOX);
    act(() => tree.unmount());
  });

  it("gamepad cycling advances through unlocked routes once everything is open", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }), OVERVIEW);
    act(() => capturedGamepad.onRB());
    expect(replace).toHaveBeenCalledWith(LAW);
    act(() => tree.unmount());
  });
});

// Shift+1..9 jump straight to the promoted top-bar tabs, but only when the tab
// is actually on screen at the current width (TopNavBar reports the visible set
// via setVisibleExtendedRoutes). EXTENDED_TAB_DEFS order: 1=Inbox, 2=Stats,
// 3=Research, 4=Missions, 5=Finance, 6=Officers, 7=Sectors, 8=Trade, 9=Codex.
const STATS = "/(game)/stats";
const DIPLOMACY = "/(game)/diplomacy";
const MORE = "/(game)/more";

describe("Promoted-tab shortcuts (Shift+1..9)", () => {
  it("registers a handler for every promoted-tab slot", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }));
    for (let i = 1; i <= 9; i++) {
      expect(typeof capturedKeyMap[`shift+${i}`]).toBe("function");
    }
    act(() => tree.unmount());
  });

  it("no-ops (returns false, no nav) when no promoted tabs are visible", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }));
    let ret: any;
    act(() => { ret = capturedKeyMap["shift+1"](); });
    expect(ret).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("navigates to a promoted tab that is currently visible", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }));
    act(() => capturedCtx!.setVisibleExtendedRoutes([INBOX, STATS]));
    act(() => capturedKeyMap["shift+1"]());
    expect(replace).toHaveBeenCalledWith(INBOX);
    expect(showToast).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("does NOT fire for a promoted tab hidden at the current width", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }));
    // Only Inbox fits the bar; Stats (shift+2) is under MORE.
    act(() => capturedCtx!.setVisibleExtendedRoutes([INBOX]));
    let ret: any;
    act(() => { ret = capturedKeyMap["shift+2"](); });
    expect(ret).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("respects route locks during orientation even when reported visible", () => {
    const tree = mount(mk()); // fresh save: Inbox still locked
    act(() => capturedCtx!.setVisibleExtendedRoutes([INBOX]));
    act(() => capturedKeyMap["shift+1"]());
    expect(replace).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});

// Controller / Steam Deck: LB/RB cycle the top bar and must include the promoted
// tabs currently on screen (same visible set as Shift+1..9), inserted between the
// last core tab (Diplomacy) and MORE.
describe("Promoted-tab controller cycling (LB/RB)", () => {
  it("RB from the last core tab lands on the first visible promoted tab", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }), DIPLOMACY);
    act(() => capturedCtx!.setVisibleExtendedRoutes([INBOX, STATS]));
    act(() => capturedGamepad.onRB());
    expect(replace).toHaveBeenCalledWith(INBOX);
    act(() => tree.unmount());
  });

  it("RB walks through the visible promoted tabs in order", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }), INBOX);
    act(() => capturedCtx!.setVisibleExtendedRoutes([INBOX, STATS]));
    act(() => capturedGamepad.onRB());
    expect(replace).toHaveBeenCalledWith(STATS);
    act(() => tree.unmount());
  });

  it("RB from the last visible promoted tab lands on MORE", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }), STATS);
    act(() => capturedCtx!.setVisibleExtendedRoutes([INBOX, STATS]));
    act(() => capturedGamepad.onRB());
    expect(replace).toHaveBeenCalledWith(MORE);
    act(() => tree.unmount());
  });

  it("LB from the first visible promoted tab returns to the last core tab", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }), INBOX);
    act(() => capturedCtx!.setVisibleExtendedRoutes([INBOX, STATS]));
    act(() => capturedGamepad.onLB());
    expect(replace).toHaveBeenCalledWith(DIPLOMACY);
    act(() => tree.unmount());
  });

  it("skips promoted tabs hidden at the current width (none visible → core→MORE)", () => {
    const tree = mount(mk({ hasCompletedOnboarding: true }), DIPLOMACY);
    // No promoted tabs reported visible: RB jumps straight from Diplomacy to MORE.
    act(() => capturedGamepad.onRB());
    expect(replace).toHaveBeenCalledWith(MORE);
    act(() => tree.unmount());
  });

  it("skips a visible-but-locked promoted tab and lands on the next unlocked one", () => {
    // Fresh save: Inbox is reported visible but still locked during orientation,
    // so RB from Overview skips it and lands on Stats (visible AND unlocked).
    const tree = mount(mk(), OVERVIEW);
    act(() => capturedCtx!.setVisibleExtendedRoutes([INBOX, STATS]));
    act(() => capturedGamepad.onRB());
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(STATS);
    act(() => tree.unmount());
  });
});

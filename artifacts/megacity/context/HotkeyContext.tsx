import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useGame } from "@/context/GameContext";
import { usePhotoMode } from "@/context/PhotoModeContext";
import { useToast } from "@/context/ToastContext";
import { useKeyboard, type KeyMap } from "@/hooks/useKeyboard";
import { useGamepad } from "@/hooks/useGamepad";
import { moveFocus, activateFocused, clearFocus, scrollForDirection, type Direction } from "@/engine/spatialNav";
import { openKeyboardHelp } from "@/hooks/useKeyboardHelp";
import {
  closeCommandPalette,
  isCommandPaletteVisible,
  toggleCommandPalette,
} from "@/hooks/useCommandPalette";
import { useTheme } from "@/context/ThemeContext";
import { captureSteamScreenshot, isDesktopCaptureAvailable } from "@/engine/steamBridge";
import { isRouteUnlocked } from "@/engine/hudUnlocks";
import { BOTTOM_TAB_DEFS, EXTENDED_TAB_DEFS } from "@/components/topNavTabs";

const isWeb = Platform.OS === "web";

// Injects the global focus-ring style once. RN Web renders Pressables as
// focusable elements but ships no visible focus outline, so keyboard/gamepad
// players would have no idea what's selected. We show a high-contrast accent
// ring for keyboard focus (:focus-visible) and — because programmatic .focus()
// from gamepad polling doesn't trigger :focus-visible — also whenever the body
// is in "gamepad mode". Mouse clicks never show the ring.
const FOCUS_STYLE_ID = "megacity-focus-ring";
function ensureFocusStyle(accent: string) {
  if (!isWeb || typeof document === "undefined") return;
  let style = document.getElementById(FOCUS_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = FOCUS_STYLE_ID;
    document.head.appendChild(style);
  }
  const ring = `2px solid ${accent}`;
  style.textContent = `
    /* Only suppress the default ring for non-keyboard (mouse) focus; keyboard
       focus keeps :focus-visible, and gamepad focus is restored below. */
    *:focus:not(:focus-visible) { outline: none; }
    *:focus-visible,
    body.mc-gamepad-active *:focus {
      outline: ${ring} !important;
      outline-offset: 2px !important;
      border-radius: 4px;
      box-shadow: 0 0 0 2px ${accent}55 !important;
    }
  `;
}

type SubTabHandler = {
  prev: () => void;
  next: () => void;
};

type HotkeyContextType = {
  registerSubTabs: (handler: SubTabHandler) => void;
  unregisterSubTabs: () => void;
  // TopNavBar reports which promoted (extended) tab routes are actually visible
  // at the current bar width. The Shift+1..9 shortcuts only fire for routes in
  // this set, so a hidden tab's key is inert (falls back to browser default).
  setVisibleExtendedRoutes: (routes: string[]) => void;
};

const HotkeyContext = createContext<HotkeyContextType | null>(null);

const TOP_ROUTES = [
  "/(game)/overview",
  "/(game)/law",
  "/(game)/economy",
  "/(game)/worldmap",
  "/(game)/construction",
  "/(game)/diplomacy",
  "/(game)/more",
];

// Order MUST match the visible hotkey badges in components/BottomQuickBar.tsx
// so what the player sees on the bar is what the keyboard actually does.
const BOTTOM_HOTKEY_ROUTES = new Map(
  BOTTOM_TAB_DEFS
    .filter((def) => def.bottomHotkey)
    .map((def) => [def.bottomHotkey!.toLowerCase(), def.route]),
);

const TICK_SPEEDS: (1 | 5 | 10 | 15 | 60)[] = [1, 5, 10, 15, 60];

export function HotkeyProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const accent = colors.accent;
  const router = useRouter();
  const pathname = usePathname();
  const { toggleTickPause, setTickInterval, endTurn, state, saveGame } = useGame();

  // Space / controller pause buttons double as "advance" in turn-based mode:
  // there is no running loop to pause, so the natural meaning of the button is
  // End Turn instead.
  const pauseOrEndTurn = useCallback(() => {
    if (state.gameplayMode === "turnbased") endTurn();
    else toggleTickPause();
  }, [state.gameplayMode, endTurn, toggleTickPause]);
  const { showToast } = useToast();
  const { toggle: togglePhotoMode } = usePhotoMode();
  const subTabRef = useRef<SubTabHandler | null>(null);
  // Routes of the promoted tabs currently on-screen. A ref (not state) so the
  // keyMap handlers read the live value without re-memoizing on every resize.
  const visibleExtendedRef = useRef<Set<string>>(new Set());

  const quickSave = useCallback(async () => {
    // Honor Mode forbids manual save/load — the More screen hides the
    // buttons, but the desktop hotkey would otherwise let a player
    // route around it. Block here and surface a clear toast so the
    // player understands why nothing happened.
    if (state.honorMode === true) {
      showToast("Honor Mode: manual save disabled", "warning");
      return;
    }
    try {
      await saveGame();
      showToast("Quick saved", "success");
    } catch (e) {
      console.error("Quick save failed:", e);
      showToast("Quick save failed", "danger");
    }
  }, [saveGame, showToast, state.honorMode]);

  const registerSubTabs = useCallback((handler: SubTabHandler) => {
    subTabRef.current = handler;
  }, []);

  const unregisterSubTabs = useCallback(() => {
    subTabRef.current = null;
  }, []);

  const setVisibleExtendedRoutes = useCallback((routes: string[]) => {
    visibleExtendedRef.current = new Set(routes);
  }, []);

  const nav = useCallback((route: string) => {
    if (isCommandPaletteVisible()) return false;
    router.replace(route as any);
  }, [router]);

  // During the first-run orientation most destinations are still locked. Block
  // keyboard/gamepad navigation to a locked route and tell the player why,
  // mirroring the hidden tabs in the top/bottom bars. Post-orientation (and for
  // every existing save) isRouteUnlocked always returns true, so this is inert.
  const navGated = useCallback((route: string) => {
    if (isCommandPaletteVisible()) return false;
    if (!isRouteUnlocked(route, state)) {
      showToast("Locked — continue your orientation to unlock this", "info");
      return;
    }
    router.replace(route as any);
  }, [router, state, showToast]);

  const cycleSpeed = useCallback((dir: 1 | -1) => {
    const current = state.tickIntervalMinutes ?? 5;
    const idx = TICK_SPEEDS.indexOf(current as any);
    const next = idx === -1 ? 0 : Math.max(0, Math.min(TICK_SPEEDS.length - 1, idx + dir));
    setTickInterval(TICK_SPEEDS[next]);
  }, [state.tickIntervalMinutes, setTickInterval]);

  const toggleFullscreen = useCallback(() => {
    if (Platform.OS !== "web") return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  }, []);

  const captureScreenshot = useCallback(() => {
    // Steam/desktop (Electron) build only. A browser can't silently write
    // files to a folder, so in the web preview F9 is a no-op: returning
    // false makes useKeyboard skip preventDefault, leaving normal browser
    // behavior untouched. The capture itself is async; fire-and-forget and
    // surface the result via a toast.
    if (!isDesktopCaptureAvailable()) return false;
    void (async () => {
      const res = await captureSteamScreenshot();
      if (res.ok) {
        showToast("Screenshot saved to Pictures\\MEGACITY Screenshots", "success");
      } else {
        showToast("Screenshot capture failed", "danger");
      }
    })();
    return undefined;
  }, [showToast]);

  const cycleTopRoute = useCallback((dir: 1 | -1) => {
    // Build the cycle in left-to-right bar order so LB/RB walk exactly what the
    // player sees: the core tabs (overview..diplomacy), then the promoted tabs
    // currently on screen (same visible set the Shift+1..9 keys use, in
    // EXTENDED_TAB_DEFS order), then MORE pinned at the end. Only visible +
    // unlocked routes are reachable, matching the keyboard shortcuts — so a
    // controller never lands on a tab that's hidden under MORE at this width.
    const moreRoute = TOP_ROUTES[TOP_ROUTES.length - 1];
    const coreRoutes = TOP_ROUTES.slice(0, TOP_ROUTES.length - 1);
    const extendedRoutes = EXTENDED_TAB_DEFS
      .map((d) => d.route)
      .filter((r) => visibleExtendedRef.current.has(r));
    const routes = [...coreRoutes, ...extendedRoutes, moreRoute].filter((r) =>
      isRouteUnlocked(r, state),
    );
    if (routes.length === 0) return;
    const idx = routes.findIndex((r) => pathname === r || pathname === r.replace("/(game)", ""));
    const base = idx === -1 ? 0 : idx;
    const next = (base + dir + routes.length) % routes.length;
    nav(routes[next]);
  }, [pathname, nav, state]);

  // Jump to a promoted (extended) tab by its fixed position in
  // EXTENDED_TAB_DEFS (0-based). Only navigates when that tab is currently
  // shown in the bar; otherwise returns false so the keypress falls through to
  // the browser's default (nothing happens off-input) instead of being eaten.
  const navExtended = useCallback((index: number): void | false => {
    const def = EXTENDED_TAB_DEFS[index];
    if (!def || !visibleExtendedRef.current.has(def.route)) return false;
    navGated(def.route);
  }, [navGated]);

  // Shared directional handler for both keyboard arrows and the gamepad
  // D-pad/stick. Tries spatial focus movement first; left/right fall back to
  // sub-tab switching when there's no focusable neighbour in that direction.
  // Returns false (only meaningful for the keyboard path) when nothing
  // happened, so the browser's default scroll is preserved.
  const handleDirection = useCallback((dir: Direction): void | false => {
    if (moveFocus(dir)) return;
    // No focusable neighbour up/down usually means the next list item is
    // below/above the fold (or not rendered yet by a virtualized list) —
    // scroll the list so the next press can reach it. Without this, gamepad
    // D-pad presses on the Steam Deck were silently swallowed and long lists
    // (e.g. the construction building list) were unreachable.
    if ((dir === "up" || dir === "down") && scrollForDirection(dir)) return;
    if ((dir === "left" || dir === "right") && subTabRef.current) {
      if (dir === "left") subTabRef.current.prev();
      else subTabRef.current.next();
      return;
    }
    return false;
  }, []);

  const goBack = useCallback(() => {
    if (isCommandPaletteVisible()) {
      closeCommandPalette();
      return;
    }
    // Gamepad "B" / cancel. If a focus ring is parked on something, clear it
    // first (feels like backing out of a selection); otherwise fall back to
    // returning to the city overview, matching Escape.
    if (clearFocus()) return;
    nav(TOP_ROUTES[0]);
  }, [nav]);

  const keyMap = useMemo<KeyMap>(() => ({
    "1": () => navGated(TOP_ROUTES[0]),
    "2": () => navGated(TOP_ROUTES[1]),
    "3": () => navGated(TOP_ROUTES[2]),
    "4": () => navGated(TOP_ROUTES[3]),
    "5": () => navGated(TOP_ROUTES[4]),
    "6": () => navGated(TOP_ROUTES[5]),
    "7": () => navGated(TOP_ROUTES[6]),

    // Promoted top-bar tabs — the "shifted" siblings of 1-7. Each is pinned to
    // its slot in EXTENDED_TAB_DEFS and only fires when that tab is on-screen.
    "shift+1": () => navExtended(0),
    "shift+2": () => navExtended(1),
    "shift+3": () => navExtended(2),
    "shift+4": () => navExtended(3),
    "shift+5": () => navExtended(4),
    "shift+6": () => navExtended(5),
    "shift+7": () => navExtended(6),
    "shift+8": () => navExtended(7),
    "shift+9": () => navExtended(8),

    "q": () => navGated(BOTTOM_HOTKEY_ROUTES.get("q")!),
    "w": () => navGated(BOTTOM_HOTKEY_ROUTES.get("w")!),
    "e": () => navGated(BOTTOM_HOTKEY_ROUTES.get("e")!),
    "r": () => navGated(BOTTOM_HOTKEY_ROUTES.get("r")!),
    "t": () => navGated(BOTTOM_HOTKEY_ROUTES.get("t")!),
    "y": () => navGated(BOTTOM_HOTKEY_ROUTES.get("y")!),
    "u": () => navGated(BOTTOM_HOTKEY_ROUTES.get("u")!),

    " ": () => pauseOrEndTurn(),
    "=": () => cycleSpeed(1),
    "+": () => cycleSpeed(1),
    "-": () => cycleSpeed(-1),

    "d": () => nav("/(game)/debug"),
    "ctrl+d": () => {
      if (pathname === "/(game)/debug") nav(TOP_ROUTES[0]);
      else nav("/(game)/debug");
    },
    "ctrl+s": () => { quickSave(); },
    "ctrl+k": () => toggleCommandPalette(),
    "f": () => toggleFullscreen(),
    "f9": () => captureScreenshot(),
    "h": () => togglePhotoMode(),

    "arrowup": () => handleDirection("up"),
    "arrowdown": () => handleDirection("down"),
    "arrowleft": () => handleDirection("left"),
    "arrowright": () => handleDirection("right"),
    // Enter is intentionally NOT mapped here: RN Web's Pressable already
    // activates the focused element on Enter/Space natively, so adding a global
    // click() would double-fire onPress.

    "escape": () => {
      if (isCommandPaletteVisible()) closeCommandPalette();
      else nav(TOP_ROUTES[0]);
    },
  }), [nav, navGated, navExtended, pathname, pauseOrEndTurn, cycleSpeed, toggleFullscreen, quickSave, togglePhotoMode, captureScreenshot, handleDirection]);

  useKeyboard(keyMap);

  // Inject the focus-ring stylesheet on the web build, re-injecting whenever
  // the theme's accent color changes so the ring always matches the palette.
  useEffect(() => {
    ensureFocusStyle(accent);
  }, [accent]);

  // Toggle "gamepad mode" body class so the focus ring shows for programmatic
  // (controller-driven) focus, and drops back to mouse behavior on pointer use.
  const setGamepadActive = useCallback(() => {
    if (!isWeb || typeof document === "undefined") return;
    document.body.classList.add("mc-gamepad-active");
  }, []);

  useEffect(() => {
    if (!isWeb || typeof document === "undefined") return;
    const clear = () => document.body.classList.remove("mc-gamepad-active");
    window.addEventListener("mousemove", clear);
    window.addEventListener("mousedown", clear);
    return () => {
      window.removeEventListener("mousemove", clear);
      window.removeEventListener("mousedown", clear);
    };
  }, []);

  // Gamepad layer: maps a connected controller onto the same nav/focus actions
  // as the keyboard. A = activate, B = back/cancel, X = pause, Y = help overlay,
  // shoulders = top tabs, triggers = sub-tabs, Start = pause, Select = help,
  // D-pad/stick = directional focus.
  useGamepad({
    onActivity: setGamepadActive,
    onUp: () => handleDirection("up"),
    onDown: () => handleDirection("down"),
    onLeft: () => handleDirection("left"),
    onRight: () => handleDirection("right"),
    onA: () => activateFocused(),
    onB: () => goBack(),
    onX: () => { if (!isCommandPaletteVisible()) pauseOrEndTurn(); },
    onY: () => { if (!isCommandPaletteVisible()) openKeyboardHelp(); },
    onLB: () => { if (!isCommandPaletteVisible()) cycleTopRoute(-1); },
    onRB: () => { if (!isCommandPaletteVisible()) cycleTopRoute(1); },
    onLT: () => { if (!isCommandPaletteVisible()) subTabRef.current?.prev(); },
    onRT: () => { if (!isCommandPaletteVisible()) subTabRef.current?.next(); },
    onStart: () => { if (!isCommandPaletteVisible()) pauseOrEndTurn(); },
    onSelect: () => toggleCommandPalette(),
  });

  const ctx = useMemo(
    () => ({ registerSubTabs, unregisterSubTabs, setVisibleExtendedRoutes }),
    [registerSubTabs, unregisterSubTabs, setVisibleExtendedRoutes],
  );

  return (
    <HotkeyContext.Provider value={ctx}>
      {children}
    </HotkeyContext.Provider>
  );
}

const NOOP_CTX: HotkeyContextType = {
  registerSubTabs: () => {},
  unregisterSubTabs: () => {},
  setVisibleExtendedRoutes: () => {},
};

export function useHotkeys() {
  const ctx = useContext(HotkeyContext);
  return ctx ?? NOOP_CTX;
}

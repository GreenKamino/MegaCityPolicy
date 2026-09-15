import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import {
  type AutoPauseState,
  buildDocumentTitle,
  handleHidden,
  handleVisible,
  shouldWarnBeforeUnload,
} from "@/hooks/useDesktopPolish.helpers";
import {
  isElectronShell,
  setDesktopCloseGuardState,
} from "@/utils/desktopShell";

const isWeb = Platform.OS === "web";

export type DesktopPolishOptions = {
  // Live game state
  cityName: string;
  pathname: string;
  tickPaused: boolean;
  tickIntervalMinutes: number;
  lastSaveTime: number;

  // Actions
  toggleTickPause: () => void;

  // User preferences
  pauseOnBlurEnabled: boolean;
  confirmOnCloseEnabled: boolean;
};

/**
 * PC desktop quality-of-life bundle (web only):
 *  - Auto-pause when the window/tab loses focus, auto-resume on return.
 *    Only re-resumes if WE were the ones who paused (respects manual pause).
 *  - Live document.title showing current screen + speed/pause state, so the
 *    browser tab is informative when the user is in another tab.
 *  - Block Ctrl+wheel zoom inside the game (the layout doesn't reflow well
 *    when the page itself is zoomed, and PC players bump this constantly).
 *  - beforeunload guard: warn the user before closing the tab if the game is
 *    actively running and there are likely unsaved changes since last save.
 *
 * On native (iOS/Android) every effect is a no-op.
 */
export function useDesktopPolish(opts: DesktopPolishOptions) {
  const {
    cityName,
    pathname,
    tickPaused,
    tickIntervalMinutes,
    lastSaveTime,
    toggleTickPause,
    pauseOnBlurEnabled,
    confirmOnCloseEnabled,
  } = opts;

  // Track whether the auto-pause hook itself was the one that paused, so we
  // never resume a game the user manually paused before alt-tabbing away.
  // Shared with handleHidden/handleVisible helpers — see helpers file for the
  // dedupe state machine.
  const autoPauseStateRef = useRef<AutoPauseState>({ ownsPause: false, tickPaused });
  const tickPausedRef = useRef(tickPaused);
  const toggleRef = useRef(toggleTickPause);

  useEffect(() => {
    tickPausedRef.current = tickPaused;
    autoPauseStateRef.current.tickPaused = tickPaused;
  }, [tickPaused]);

  useEffect(() => {
    toggleRef.current = toggleTickPause;
  }, [toggleTickPause]);

  // --- Live document title ---------------------------------------------------
  useEffect(() => {
    if (!isWeb) return;
    document.title = buildDocumentTitle(cityName, pathname, tickIntervalMinutes, tickPaused);
  }, [cityName, pathname, tickIntervalMinutes, tickPaused]);

  // --- Auto-pause on blur ----------------------------------------------------
  useEffect(() => {
    if (!isWeb || !pauseOnBlurEnabled) return;

    // Dedupe: blur and visibilitychange(hidden) often fire back-to-back, and
    // tickPausedRef updates asynchronously through React state. The pure
    // helpers in useDesktopPolish.helpers own the state machine so the same
    // logic is exercised by unit tests.
    const onHidden = () => {
      if (handleHidden(autoPauseStateRef.current)) toggleRef.current();
    };

    const onVisible = () => {
      if (handleVisible(autoPauseStateRef.current)) toggleRef.current();
    };

    const onVisibilityChange = () => {
      if (document.hidden) onHidden();
      else onVisible();
    };

    window.addEventListener("blur", onHidden);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", onHidden);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // If the hook unmounts while we own the pause, leave the game in
      // whatever state it's in — flipping it back blindly would surprise the
      // user worse than the existing state.
      autoPauseStateRef.current.ownsPause = false;
    };
  }, [pauseOnBlurEnabled]);

  // --- Block Ctrl+wheel zoom inside the game --------------------------------
  useEffect(() => {
    if (!isWeb) return;
    const onWheel = (e: WheelEvent) => {
      // Ctrl/Cmd + wheel is the browser's pinch-zoom shortcut. The game UI
      // doesn't reflow under page zoom, so swallow it here.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    // passive:false is required to call preventDefault on wheel.
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // --- beforeunload warning (plain web only) ---------------------------------
  useEffect(() => {
    if (!isWeb || !confirmOnCloseEnabled) return;
    // Inside the Electron desktop shell a beforeunload veto is honored
    // SILENTLY — the window simply refuses to close with no dialog, which
    // players read as a broken [X] button. The desktop close guard lives in
    // the main process instead (steam/main.js + closeGuard.js) with a real
    // native confirm dialog, fed by the close-guard state effect below.
    if (isElectronShell()) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const warn = shouldWarnBeforeUnload({
        confirmOnClose: true, // effect only runs when the setting is on
        tickPaused: tickPausedRef.current,
        lastSaveTime,
        now: Date.now(),
      });
      if (warn) {
        // Modern browsers ignore the custom string and show a generic prompt,
        // but setting returnValue is still required to trigger the dialog.
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
      return undefined;
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [confirmOnCloseEnabled, lastSaveTime]);

  // --- Electron close-guard state sync ----------------------------------------
  // Reports the live "is the simulation running" + "warn before closing"
  // inputs to the Electron main process, which owns the native close-confirm
  // dialog. This hook only mounts on the in-game route, so the unmount
  // cleanup (back to main menu) correctly reports "not running" and the
  // window closes instantly from the menu.
  useEffect(() => {
    if (!isWeb || !isElectronShell()) return;
    setDesktopCloseGuardState({
      simRunning: !tickPaused,
      confirmOnClose: confirmOnCloseEnabled,
    });
    return () => {
      setDesktopCloseGuardState({
        simRunning: false,
        confirmOnClose: confirmOnCloseEnabled,
      });
    };
  }, [tickPaused, confirmOnCloseEnabled]);
}


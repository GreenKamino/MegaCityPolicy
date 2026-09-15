import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { useGame } from "@/context/GameContext";

type PhotoModeContextType = {
  enabled: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
  // Rule-of-thirds composition grid overlay. Persisted only for the session
  // (resets on app reload) — opting in is intentional per use, not sticky.
  gridEnabled: boolean;
  toggleGrid: () => void;
  // Monotonic counter that ticks up every time photo mode is entered. The
  // overlay watches this to fire its one-shot "PAUSED" flash without needing
  // a separate event bus.
  enterCount: number;
};

const PhotoModeContext = createContext<PhotoModeContextType | null>(null);

export function PhotoModeProvider({ children }: { children: React.ReactNode }) {
  const { state, toggleTickPause } = useGame();
  const [enabled, setEnabled] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [enterCount, setEnterCount] = useState(0);
  // Remember whether the sim was already paused when we entered, so exit
  // restores the player's previous run/pause state instead of always
  // resuming.
  const wasPausedRef = useRef(false);

  const enter = useCallback(() => {
    if (enabled) return;
    wasPausedRef.current = state.tickPaused ?? false;
    if (!state.tickPaused) {
      toggleTickPause();
    }
    setEnabled(true);
    setEnterCount((c) => c + 1);
  }, [enabled, state.tickPaused, toggleTickPause]);

  const exit = useCallback(() => {
    if (!enabled) return;
    setEnabled(false);
    // If the sim was running before photo mode, resume it.
    if (!wasPausedRef.current && state.tickPaused) {
      toggleTickPause();
    }
  }, [enabled, state.tickPaused, toggleTickPause]);

  const toggle = useCallback(() => {
    if (enabled) exit();
    else enter();
  }, [enabled, enter, exit]);

  const toggleGrid = useCallback(() => setGridEnabled((g) => !g), []);

  const value = useMemo(
    () => ({ enabled, enter, exit, toggle, gridEnabled, toggleGrid, enterCount }),
    [enabled, enter, exit, toggle, gridEnabled, toggleGrid, enterCount],
  );

  return <PhotoModeContext.Provider value={value}>{children}</PhotoModeContext.Provider>;
}

const NOOP: PhotoModeContextType = {
  enabled: false,
  enter: () => {},
  exit: () => {},
  toggle: () => {},
  gridEnabled: false,
  toggleGrid: () => {},
  enterCount: 0,
};

export function usePhotoMode(): PhotoModeContextType {
  return useContext(PhotoModeContext) ?? NOOP;
}

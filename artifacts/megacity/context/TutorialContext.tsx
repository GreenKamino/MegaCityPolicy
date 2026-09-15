import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { atomicWriteSlot } from "@/engine/saveLoad";

const STORAGE_KEY = "@megacity_tutorial_seen";

type TutorialContextType = {
  hasSeenHint: (id: string) => boolean;
  markSeen: (id: string) => void;
  resetHints: () => void;
  // True once the persisted "seen" set has hydrated from storage. Consumers that
  // would otherwise flash a one-shot the player already dismissed (e.g. the
  // top-of-screen coach tip) withhold rendering until this is true. The inline
  // TutorialHint can ignore it — a brief late-show at the bottom of a scroll is
  // harmless — but readiness is exposed so cold-start races are opt-out, not
  // baked in.
  loaded: boolean;
};

const TutorialContext = createContext<TutorialContextType | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try { setSeen(new Set(JSON.parse(raw))); } catch {}
        }
      })
      // `finally` so a transient storage read error still flips `loaded` true —
      // otherwise readiness-gated consumers (the coach tip) would withhold
      // forever. On a read failure we proceed with an empty seen set; the worst
      // case is one extra one-shot, not a permanently stuck UI.
      .finally(() => setLoaded(true));
  }, []);

  const hasSeenHint = useCallback((id: string) => seen.has(id), [seen]);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      const next = new Set(prev);
      next.add(id);
      // Atomic write (Task #191): a torn write here would otherwise
      // wipe the player's whole "tips already seen" set and replay
      // every one-shot hint after a crash.
      atomicWriteSlot(AsyncStorage, STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const resetHints = useCallback(() => {
    setSeen(new Set());
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <TutorialContext.Provider value={{ hasSeenHint, markSeen, resetHints, loaded }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) return { hasSeenHint: () => true, markSeen: () => {}, resetHints: () => {}, loaded: true };
  return ctx;
}

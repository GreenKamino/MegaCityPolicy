import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";

import type {
  AtlasCapstoneGranted,
  AtlasRewardGranted,
} from "@/engine/atlasCategoryRewards";

export type AtlasUnlockEvent = {
  id: string;
  granted: AtlasRewardGranted[];
  capstone?: AtlasCapstoneGranted;
};

type AtlasUnlockContextType = {
  current: AtlasUnlockEvent | null;
  pushUnlock: (granted: AtlasRewardGranted[], capstone?: AtlasCapstoneGranted) => void;
  dismiss: () => void;
};

const AtlasUnlockContext = createContext<AtlasUnlockContextType | null>(null);

export type AtlasUnlockAction =
  | { type: "push"; event: AtlasUnlockEvent }
  | { type: "dismiss" };

// Pure queue reducer extracted so the queue mechanics can be unit tested
// without spinning up a React renderer.
export function atlasUnlockReducer(
  state: AtlasUnlockEvent[],
  action: AtlasUnlockAction
): AtlasUnlockEvent[] {
  switch (action.type) {
    case "push": {
      const { event } = action;
      if (event.granted.length === 0 && !event.capstone) return state;
      return [...state, event];
    }
    case "dismiss":
      return state.slice(1);
    default:
      return state;
  }
}

// Pure summary of an unlock event used by AtlasUnlockPopup. Centralizing this
// lets a unit test assert the labels and totals without rendering the modal.
export function summarizeAtlasUnlock(event: AtlasUnlockEvent): {
  headerLabel: string;
  totalXp: number;
  categoryLabels: string[];
  capstoneTitle?: string;
} {
  const isCapstone = !!event.capstone;
  const totalXp =
    event.granted.reduce((sum, g) => sum + g.xp, 0) +
    (event.capstone ? event.capstone.xp : 0);
  return {
    headerLabel: isCapstone ? "WASTELAND ATLAS COMPLETE" : "ATLAS SURVEY UNLOCKED",
    totalXp,
    categoryLabels: event.granted.map((g) => g.label),
    capstoneTitle: event.capstone?.title,
  };
}

export function AtlasUnlockProvider({ children }: { children: React.ReactNode }) {
  const [queue, dispatch] = useReducer(atlasUnlockReducer, [] as AtlasUnlockEvent[]);
  const counterRef = React.useRef(0);

  const pushUnlock = useCallback(
    (granted: AtlasRewardGranted[], capstone?: AtlasCapstoneGranted) => {
      if (granted.length === 0 && !capstone) return;
      const id = `atlas-unlock-${Date.now()}-${++counterRef.current}`;
      dispatch({ type: "push", event: { id, granted, capstone } });
    },
    []
  );

  const dismiss = useCallback(() => {
    dispatch({ type: "dismiss" });
  }, []);

  const value = useMemo<AtlasUnlockContextType>(
    () => ({ current: queue[0] ?? null, pushUnlock, dismiss }),
    [queue, pushUnlock, dismiss]
  );

  return <AtlasUnlockContext.Provider value={value}>{children}</AtlasUnlockContext.Provider>;
}

export function useAtlasUnlock() {
  const ctx = useContext(AtlasUnlockContext);
  if (!ctx) {
    return {
      current: null,
      pushUnlock: (_g: AtlasRewardGranted[], _c?: AtlasCapstoneGranted) => {},
      dismiss: () => {},
    } as AtlasUnlockContextType;
  }
  return ctx;
}

import React, { useEffect, useRef } from "react";

import { useGameState } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import { diffNewlyUnlockedFirsts, unlockedFirstIds } from "@/engine/firsts";

export default function FirstsUnlockToastBridge() {
  const { state } = useGameState();
  const { showToast } = useToast();

  const prevIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (prevIdsRef.current === null) {
      prevIdsRef.current = unlockedFirstIds(state);
      return;
    }
    const newly = diffNewlyUnlockedFirsts(prevIdsRef.current, state);
    if (newly.length === 0) return;
    for (const def of newly) {
      showToast(`FIRST UNLOCKED — ${def.title}`, "success");
      prevIdsRef.current.add(def.id);
    }
  }, [state, showToast]);

  return null;
}

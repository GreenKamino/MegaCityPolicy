import React, { useEffect, useRef } from "react";

import { useGameState } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import {
  FEATURE_UNLOCK_LABEL,
  getUnlockedHudFeatures,
  isIntroLockActive,
  type HudFeatureId,
} from "@/engine/hudUnlocks";

// Announces progressive HUD unlocks during the first-run orientation. Each time
// a new tab/quick-bar feature reveals, a short "X UNLOCKED" toast fires so the
// disclosure feels earned rather than hidden. When the orientation finishes the
// HUD opens fully at once — we collapse that into a single celebratory line and
// nudge the player to start the (paused) clock instead of stacking ~8 toasts.
export default function HudUnlockToastBridge() {
  const { state } = useGameState();
  const { showToast } = useToast();

  const prevRef = useRef<Set<HudFeatureId> | null>(null);
  const wasIntroLockedRef = useRef<boolean>(false);

  useEffect(() => {
    const current = getUnlockedHudFeatures(state);
    const introLocked = isIntroLockActive(state);

    // First observation: snapshot silently so a mid-game reload never replays
    // unlocks the player already has.
    if (prevRef.current === null) {
      prevRef.current = current;
      wasIntroLockedRef.current = introLocked;
      return;
    }

    const prev = prevRef.current;
    const wasLocked = wasIntroLockedRef.current;
    prevRef.current = current;
    wasIntroLockedRef.current = introLocked;

    // Orientation just completed (or was skipped): everything opened at once.
    if (wasLocked && !introLocked) {
      // Turn-based games have no live clock — the player advances with End Turn
      // rather than a Play button, so the nudge must match the mode.
      const startNudge =
        state.gameplayMode === "turnbased"
          ? "ALL SYSTEMS ONLINE — press End Turn to begin"
          : "ALL SYSTEMS ONLINE — press Play to begin";
      showToast(startNudge, "success");
      return;
    }

    // Otherwise announce each newly revealed feature (CITY is always present).
    for (const id of current) {
      if (id === "overview") continue;
      if (!prev.has(id)) {
        showToast(`${FEATURE_UNLOCK_LABEL[id]} UNLOCKED`, "success");
      }
    }
  }, [state, showToast]);

  return null;
}

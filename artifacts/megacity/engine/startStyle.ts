// New-game start style — Guided vs Veteran (Task #335).
//
// When a player begins a fresh game they pick a start style in the char-create
// modal (see app/index.tsx). Guided (the default) keeps the full first-run
// experience that createInitialState sets up: orientation, the calm first day,
// the starter-objective marker, and the per-tab coach tips. Veteran is for
// players who already know the game — it pre-completes orientation (which
// unlocks the full HUD immediately, since the progressive-disclosure gate keys
// off hasCompletedOnboarding — see engine/hudUnlocks.ts), turns off both
// new-player guidance aids, and skips the calm-start grace window so random
// crises resume from tick 0.
//
// SINGLE SOURCE OF TRUTH: all four of the Veteran flips live HERE rather than
// inline in the char-create handler. If they were scattered inside that 4000-
// line screen, a future refactor could silently drop one and quietly hand a
// Veteran player the hand-holding back (orientation, the objective marker,
// coach tips, or a calm Day 1) — a regression that only ever shows on a fresh
// game and is easy to miss. engine/__tests__/startStyle.test.ts pins every
// field so that can't happen unnoticed.

import type { GameState } from "@/engine/types";

export type StartStyle = "guided" | "veteran";

// Applies the chosen start style to a freshly-created game state. Mutates and
// returns `s` (the caller already owns a fresh draft, matching setPlayerFaction).
//
// Guided is intentionally a no-op: the fresh-game defaults from
// createInitialState already describe the Guided experience, so there is
// nothing to change. Veteran applies the four onboarding-suppression fields.
export function applyStartStyle(s: GameState, style: StartStyle): GameState {
  if (style === "veteran") {
    // Orientation already complete → full HUD unlocked (hudUnlocks.isIntroLockActive).
    s.hasCompletedOnboarding = true;
    // No post-orientation starter-objective marker (engine/objectives.ts; strict opt-in).
    s.starterObjectivesActive = false;
    // No per-tab coach tips (engine/hudCoachTips.ts; strict opt-in).
    s.hudCoachTipsActive = false;
    // Skip the calm-start grace window so crises resume immediately (engine/calmStart.ts).
    s.calmStartTicks = 0;
  }
  return s;
}

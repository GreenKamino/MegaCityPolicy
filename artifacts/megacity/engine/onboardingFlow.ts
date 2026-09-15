// Shared helpers for the first-run onboarding walkthrough cursor.
//
// BEAT_ORDER mirrors the discriminated union on GameState.onboardingStep
// (see engine/types.ts). Keep them in lockstep — the test suite asserts
// the two stay in sync.
//
// `latestReachedBeat` derives the furthest beat the player has progressed
// to, using the persisted per-beat completion flags (didBuild / didEdict /
// didRead). This lets the BACK affordance rewind the cursor without losing
// the player's place: pressing the forward control jumps straight back to
// the latest reached beat instead of forcing them to walk every step
// again.

import type { GameState } from "@/engine/types";

export type OnboardingBeat =
  | "arrival"
  | "build"
  | "edict"
  | "dispatch"
  | "summary";

export const BEAT_ORDER: OnboardingBeat[] = [
  "arrival",
  "build",
  "edict",
  "dispatch",
  "summary",
];

// Short, all-caps name for each beat. Used by the progress strip on the
// onboarding screen and the OnboardingBanner so the player can see at a
// glance which beat they're on (e.g. "BEAT 03 OF 05 · GOVERNANCE").
// Keep these in lockstep with the per-beat tags rendered inside
// onboarding.tsx and OnboardingBanner.tsx.
export const BEAT_NAME: Record<OnboardingBeat, string> = {
  arrival: "ARRIVAL",
  build: "INFRASTRUCTURE",
  edict: "GOVERNANCE",
  dispatch: "DISPATCH",
  summary: "SECTOR ONLINE",
};

// Route each beat lives on. `arrival` and `summary` are owned by the
// onboarding screen itself; the middle three live on their real screens
// behind the OnboardingBanner overlay.
export const BEAT_ROUTE: Record<OnboardingBeat, string> = {
  arrival: "/(game)/onboarding",
  build: "/(game)/construction",
  edict: "/(game)/law",
  dispatch: "/(game)/inbox",
  summary: "/(game)/onboarding",
};

// Derive the furthest beat reached from the per-beat completion flags.
// A flag means the player completed that beat's action, so the cursor
// at that moment had already advanced one step beyond it.
export function latestReachedBeat(
  state: Pick<GameState, "didBuild" | "didEdict" | "didRead" | "onboardingStep">
): OnboardingBeat {
  if (state.didRead === true) return "summary";
  if (state.didEdict === true) return "dispatch";
  if (state.didBuild === true) return "edict";
  const cursor = (state.onboardingStep ?? "arrival") as OnboardingBeat;
  return BEAT_ORDER.includes(cursor) ? cursor : "arrival";
}

// Compute the forward target when the player presses the forward control
// (CONTINUE / SKIP BEAT / BEGIN ORIENTATION). If the player is currently
// behind the latest beat they had reached (because they pressed BACK),
// jump straight back to that beat. Otherwise advance one step.
//
// Returns null when there is no further beat (i.e. caller is already on
// summary and should finish onboarding instead).
export function forwardTargetBeat(
  current: OnboardingBeat,
  state: Pick<GameState, "didBuild" | "didEdict" | "didRead" | "onboardingStep">
): OnboardingBeat | null {
  const currentIdx = BEAT_ORDER.indexOf(current);
  const nextIdx = currentIdx + 1;
  const latestIdx = BEAT_ORDER.indexOf(latestReachedBeat(state));
  const targetIdx = Math.max(nextIdx, latestIdx);
  if (targetIdx >= BEAT_ORDER.length) return null;
  if (targetIdx <= currentIdx) return null;
  return BEAT_ORDER[targetIdx];
}

// Compute the backward target. Returns null when on the first beat.
export function backwardTargetBeat(
  current: OnboardingBeat
): OnboardingBeat | null {
  const idx = BEAT_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return BEAT_ORDER[idx - 1];
}

// ── First-run action detection ──────────────────────────────────────────
//
// The middle three beats (build / edict / dispatch) complete when the
// player performs the beat's real in-game action. Detection measures the
// action against a DURABLE fresh-game baseline rather than a value captured
// when the OnboardingBanner mounts.
//
// The old mount-time approach had a reliability gap: if the player took the
// action (e.g. authorised the build, count 5 -> 6) and the app closed — or
// the screen remounted — before the per-beat flag was persisted, the banner
// would re-mount with a baseline that already absorbed the action, so the
// strict greater-than comparison never fired and the beat stranded. Anchoring
// to the known fresh-game baseline means "already satisfied" is detected no
// matter when the banner mounts, so acting a moment early still counts.
//
// The baselines below are kept in lockstep with engine/initialState.ts and
// guarded by onboardingFlow.test.ts so the constants cannot silently drift.

// GameState building counter incremented by the build beat.
export const ONBOARDING_BUILD_KEY = "workerHousingStacks";
// Edict catalog id issued by the edict beat. Keep in sync with engine/edicts.ts.
export const ONBOARDING_EDICT_ID = "emergency_rations";
// Welcome dispatch id read by the dispatch beat. Keep in sync with
// engine/initialState.ts.
export const ONBOARDING_WELCOME_MESSAGE_ID = "msg-welcome";

// Fresh-game baselines (keep in sync with engine/initialState.ts):
//   workerHousingStacks ships at this count; the build beat completes once
//   the player authorises one more. Timed construction records authorization
//   in pendingConstructions before the count lands, so the detector accepts
//   either durable proof.
export const ONBOARDING_BUILD_BASELINE = 5;
//   no emergency_rations edict is active at game start; the edict beat
//   completes once one is (or once it has been — its cooldown proves it was
//   issued even after the active window expires).
export const ONBOARDING_EDICT_BASELINE = 0;

// Minimal structural slice of GameState the detection needs. Kept loose so
// it accepts both real GameState (via the banner) and partial test shapes.
export type OnboardingActionState = {
  buildings?: Record<string, number>;
  pendingConstructions?: ReadonlyArray<{
    kind?: string;
    buildingKey?: string;
    count?: number;
  }>;
  activeEdicts?: ReadonlyArray<{ edictId: string }>;
  edictCooldowns?: Record<string, number>;
  messages?: ReadonlyArray<{ id: string; read?: boolean }>;
};

// True when the player has performed the beat's real in-game action,
// measured against the durable fresh-game baseline (not a mount snapshot).
export function isBeatActionSatisfied(
  beat: "build" | "edict" | "dispatch",
  state: OnboardingActionState
): boolean {
  if (beat === "build") {
    const count = state.buildings?.[ONBOARDING_BUILD_KEY] ?? 0;
    if (count > ONBOARDING_BUILD_BASELINE) return true;
    // Construction is paid and recorded when authorised, but the building
    // count only changes after its timer completes. Do not strand the
    // walkthrough behind a tick in either real-time or turn-based mode.
    return (state.pendingConstructions ?? []).some(
      (order) =>
        order?.kind === "city" &&
        order.buildingKey === ONBOARDING_BUILD_KEY &&
        Number.isFinite(order.count) &&
        (order.count ?? 0) > 0,
    );
  }
  if (beat === "edict") {
    const activeCount = (state.activeEdicts ?? []).filter(
      (e) => e.edictId === ONBOARDING_EDICT_ID
    ).length;
    if (activeCount > ONBOARDING_EDICT_BASELINE) return true;
    // The edict may have already expired before the per-beat flag was set —
    // e.g. offline catch-up ran missed ticks across a save/quit. Its cooldown
    // is a durable record that the player issued it, so honour that too. (The
    // Law tab is gated until this beat, so a fresh game cannot carry a stray
    // emergency_rations cooldown — no false positives.)
    return (state.edictCooldowns ?? {})[ONBOARDING_EDICT_ID] !== undefined;
  }
  // dispatch — the welcome message read flag is already absolute and durable.
  const msg = (state.messages ?? []).find(
    (m) => m.id === ONBOARDING_WELCOME_MESSAGE_ID
  );
  return msg?.read === true;
}

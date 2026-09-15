// Pure helpers for useDesktopPolish — split into their own module so unit
// tests can import them without pulling in `react-native` (which uses Flow's
// `import typeof` syntax that the node-environment vitest setup can't parse).

const SCREEN_LABELS: Record<string, string> = {
  overview: "CITY",
  law: "LAW",
  economy: "ECONOMY",
  worldmap: "MAP",
  construction: "BUILD",
  diplomacy: "DIPLO",
  more: "MORE",
  inbox: "INBOX",
  research: "RESEARCH",
  military: "MILITARY",
  factions: "FACTIONS",
  events: "EVENTS",
  wildlands: "WILDLANDS",
  character: "DOSSIER",
};

export function speedLabel(min: number, paused: boolean): string {
  if (paused) return "PAUSED";
  if (min === 1) return "1M/TICK";
  if (min === 5) return "5M/TICK";
  if (min === 10) return "10M/TICK";
  if (min === 15) return "15M/TICK";
  if (min === 60) return "1H/TICK";
  return "";
}

export function screenLabel(pathname: string): string {
  // pathname looks like "/(game)/military" or "/military"
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  return SCREEN_LABELS[last] ?? last.toUpperCase();
}

export function buildDocumentTitle(
  cityName: string,
  pathname: string,
  tickIntervalMinutes: number,
  tickPaused: boolean,
): string {
  const screen = screenLabel(pathname);
  const speed = speedLabel(tickIntervalMinutes, tickPaused);
  const cityPart = cityName ? ` · ${cityName}` : "";
  const screenPart = screen ? ` · ${screen}` : "";
  const speedPart = speed ? ` · ${speed}` : "";
  const indicator = tickPaused ? "▮▮ " : "";
  return `${indicator}MEGACITY${cityPart}${screenPart}${speedPart}`;
}

// --- Auto-pause state machine (pure) ---------------------------------------
// Extracted so we can unit-test the dedupe behavior without spinning up a DOM.
// The hook keeps the same fields in refs and calls these helpers from event
// handlers; helpers MUTATE the passed state object in-place and return whether
// the caller should invoke toggleTickPause().

export type AutoPauseState = {
  /** True once we have auto-paused; cleared when we auto-resume. */
  ownsPause: boolean;
  /** Mirror of the live tickPaused value (kept in sync via React effect). */
  tickPaused: boolean;
};

/**
 * Handle a "window/tab became hidden" event. Returns true if the caller should
 * toggle pause. Idempotent across rapid duplicate events (blur + visibilitychange).
 */
export function handleHidden(state: AutoPauseState): boolean {
  if (state.ownsPause) return false; // already auto-paused — dedupe
  if (state.tickPaused) return false; // user paused manually — leave it alone
  state.ownsPause = true;
  return true;
}

/**
 * Handle a "window/tab became visible" event. Returns true if the caller should
 * toggle pause (resume). Releases ownership either way.
 */
export function handleVisible(state: AutoPauseState): boolean {
  if (!state.ownsPause) return false; // we don't own this pause
  state.ownsPause = false;
  // Only resume if still paused — user may have manually unpaused while away.
  return state.tickPaused;
}

// --- beforeunload guard (pure) ----------------------------------------------
// Decision logic for the plain-web "warn before closing the tab" guard,
// extracted so the paused / setting-off / stale-save combinations are unit
// testable (hooks/__tests__/desktopCloseGuard.test.ts). The Electron desktop
// shell does NOT use this path — its close guard lives in the main process
// (steam/closeGuard.js) with a real native dialog, because Electron honors a
// beforeunload veto silently (the window just refuses to close with no
// prompt, which players read as a broken [X] button).

/** How long after the last successful save we consider progress "unsaved". */
export const UNSAVED_STALE_MS = 30_000;

export type BeforeUnloadGuardInput = {
  /** The WARN BEFORE CLOSING setting. */
  confirmOnClose: boolean;
  /** Live pause state — a paused game is safe to close silently. */
  tickPaused: boolean;
  /** Epoch ms of the last successful save; 0 = never saved this session. */
  lastSaveTime: number;
  /** Current epoch ms (injected for testability). */
  now: number;
};

export function shouldWarnBeforeUnload(input: BeforeUnloadGuardInput): boolean {
  if (!input.confirmOnClose) return false;
  if (input.tickPaused) return false;
  const stale =
    input.lastSaveTime > 0 && input.now - input.lastSaveTime > UNSAVED_STALE_MS;
  const neverSaved = input.lastSaveTime === 0;
  return stale || neverSaved;
}

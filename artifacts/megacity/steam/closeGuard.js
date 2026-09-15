// Pure decision logic for the desktop (Electron) window-close guard.
//
// Lives in its own leaf module so BOTH sides can share it without pulling in
// Electron: main.js requires it inside the BrowserWindow "close" handler, and
// the vitest suite imports it directly to pin the paused/running/setting-off
// truth table (hooks/__tests__/desktopCloseGuard.test.ts).
//
// The renderer reports { simRunning, confirmOnClose } over IPC whenever the
// game route's pause state or the WARN BEFORE CLOSING setting changes (see
// hooks/useDesktopPolish.ts). `quitConfirmed` is main-process-local: it flips
// to true after the player confirms the native dialog OR uses an explicit
// in-app QUIT button (app-quit-request), so the follow-up close is never
// re-intercepted.
//
// CommonJS on purpose — main.js runs under plain Node/Electron without a
// transpile step.

/**
 * @param {{ simRunning?: boolean, confirmOnClose?: boolean, quitConfirmed?: boolean } | null | undefined} state
 * @returns {boolean} true when the close should be intercepted with a confirm dialog
 */
function shouldConfirmClose(state) {
  if (!state) return false;
  // An already-confirmed quit (dialog "Quit Anyway" or in-app QUIT button)
  // must never be intercepted again.
  if (state.quitConfirmed === true) return false;
  // Only guard when the simulation is actively running AND the player has
  // the "warn before closing" preference enabled. Strict === comparisons so
  // a malformed/missing IPC payload fails safe:
  //   - simRunning defaults to NOT running (close proceeds — the old bug was
  //     a close that silently did nothing, never the reverse),
  //   - confirmOnClose must be explicitly true to guard.
  return state.simRunning === true && state.confirmOnClose === true;
}

module.exports = { shouldConfirmClose };

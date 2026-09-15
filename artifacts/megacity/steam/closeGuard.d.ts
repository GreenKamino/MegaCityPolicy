// Type declarations for closeGuard.js (CommonJS module shared between the
// Electron main process and the vitest suite).

export type CloseGuardState = {
  simRunning?: boolean;
  confirmOnClose?: boolean;
  quitConfirmed?: boolean;
};

export function shouldConfirmClose(
  state: CloseGuardState | null | undefined,
): boolean;

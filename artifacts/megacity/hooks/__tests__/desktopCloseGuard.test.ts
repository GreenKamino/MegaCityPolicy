import { describe, expect, it } from "vitest";

// Main-process side: the Electron window-close guard decision (Task #532).
// steam/closeGuard.js is CommonJS shared with steam/main.js; the .d.ts
// alongside it provides types here.
import { shouldConfirmClose } from "@/steam/closeGuard";

// Renderer side: the plain-web beforeunload guard decision.
import {
  shouldWarnBeforeUnload,
  UNSAVED_STALE_MS,
} from "@/hooks/useDesktopPolish.helpers";

describe("shouldConfirmClose (Electron main-process close guard)", () => {
  it("confirms only when the sim is running AND the warn setting is on", () => {
    // Full truth table over the two renderer-reported inputs.
    expect(shouldConfirmClose({ simRunning: true, confirmOnClose: true })).toBe(true);
    expect(shouldConfirmClose({ simRunning: true, confirmOnClose: false })).toBe(false);
    expect(shouldConfirmClose({ simRunning: false, confirmOnClose: true })).toBe(false);
    expect(shouldConfirmClose({ simRunning: false, confirmOnClose: false })).toBe(false);
  });

  it("never re-intercepts an already-confirmed quit", () => {
    // Both the native dialog's "Quit Anyway" and the in-app QUIT buttons set
    // quitConfirmed before closing — the follow-up close must pass through
    // even in the worst case (running + warn setting on).
    expect(
      shouldConfirmClose({ simRunning: true, confirmOnClose: true, quitConfirmed: true }),
    ).toBe(false);
    expect(
      shouldConfirmClose({ simRunning: false, confirmOnClose: true, quitConfirmed: true }),
    ).toBe(false);
  });

  it("fails safe (close proceeds) on missing or malformed state", () => {
    // The old bug was a close that silently did nothing; a broken IPC payload
    // must never recreate it. Missing fields and non-boolean junk all mean
    // "do not intercept".
    expect(shouldConfirmClose(null)).toBe(false);
    expect(shouldConfirmClose(undefined)).toBe(false);
    expect(shouldConfirmClose({})).toBe(false);
    expect(shouldConfirmClose({ simRunning: true })).toBe(false); // no confirmOnClose
    expect(shouldConfirmClose({ confirmOnClose: true })).toBe(false); // no simRunning
    expect(
      shouldConfirmClose({
        simRunning: "yes" as unknown as boolean,
        confirmOnClose: 1 as unknown as boolean,
      }),
    ).toBe(false);
  });
});

describe("shouldWarnBeforeUnload (plain-web beforeunload guard)", () => {
  const NOW = 1_000_000_000;

  it("warns when running with a stale save", () => {
    expect(
      shouldWarnBeforeUnload({
        confirmOnClose: true,
        tickPaused: false,
        lastSaveTime: NOW - UNSAVED_STALE_MS - 1,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("warns when running and never saved this session", () => {
    expect(
      shouldWarnBeforeUnload({
        confirmOnClose: true,
        tickPaused: false,
        lastSaveTime: 0,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("stays quiet when the save is fresh", () => {
    expect(
      shouldWarnBeforeUnload({
        confirmOnClose: true,
        tickPaused: false,
        lastSaveTime: NOW - 5_000,
        now: NOW,
      }),
    ).toBe(false);
    // Exactly at the threshold is still "fresh" (strict > in the guard).
    expect(
      shouldWarnBeforeUnload({
        confirmOnClose: true,
        tickPaused: false,
        lastSaveTime: NOW - UNSAVED_STALE_MS,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("stays quiet when the game is paused, regardless of save staleness", () => {
    expect(
      shouldWarnBeforeUnload({
        confirmOnClose: true,
        tickPaused: true,
        lastSaveTime: 0,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      shouldWarnBeforeUnload({
        confirmOnClose: true,
        tickPaused: true,
        lastSaveTime: NOW - UNSAVED_STALE_MS * 10,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("stays quiet when the WARN BEFORE CLOSING setting is off", () => {
    expect(
      shouldWarnBeforeUnload({
        confirmOnClose: false,
        tickPaused: false,
        lastSaveTime: 0,
        now: NOW,
      }),
    ).toBe(false);
  });
});

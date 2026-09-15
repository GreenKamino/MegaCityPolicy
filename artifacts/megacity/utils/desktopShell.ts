import { Platform } from "react-native";

// Renderer-side helpers for the desktop (Electron/Steam) shell.
//
// The Electron preload script (steam/preload.js) exposes two bridges:
//   - window.steamworks — Steam SDK surface (achievements, cloud, stats),
//     present in every desktop build, even when Steam itself is offline.
//   - window.desktop    — desktop shell controls added for Task #532
//     (quit, close-guard state reporting, whole-window zoom, screenshots folder).
//
// Every helper here is a safe no-op on native (iOS/Android) and on plain web
// where neither bridge exists, so callers never need their own platform
// guards beyond hiding desktop-only UI.

type DesktopBridge = {
  quitApp?: () => void;
  setCloseGuardState?: (state: { simRunning: boolean; confirmOnClose: boolean }) => void;
  setZoomFactor?: (factor: number) => void;
  openScreenshotsFolder?: () => Promise<boolean> | boolean;
};

function getWindow(): any | null {
  if (Platform.OS !== "web") return null;
  return typeof window !== "undefined" ? (window as any) : null;
}

function getDesktopBridge(): DesktopBridge | null {
  const win = getWindow();
  return (win?.desktop as DesktopBridge | undefined) ?? null;
}

// True when running inside the Electron desktop shell. Detects either bridge
// so older shells that only expose window.steamworks still count as desktop
// (they just fall back to window.close() for quitting).
export function isElectronShell(): boolean {
  try {
    const win = getWindow();
    return !!(win && (win.desktop || win.steamworks));
  } catch {
    return false;
  }
}

// Close the desktop app. Preferred path is the preload bridge, which marks
// the quit as confirmed in the main process FIRST so the close-guard dialog
// never re-prompts a player who already confirmed via an in-app QUIT button.
// Fallback for older shells: window.close(), which Electron honors for the
// main frame (a plain browser tab would ignore it — which is why desktop-only
// UI should gate on isElectronShell()).
export function quitDesktopApp(): void {
  const win = getWindow();
  if (!win) return;
  const bridge = getDesktopBridge();
  if (bridge?.quitApp) {
    try {
      bridge.quitApp();
      return;
    } catch {
      // fall through to window.close()
    }
  }
  try {
    win.close();
  } catch {
    // nothing else we can do from the renderer
  }
}

// Open the folder where the Electron shell stores F9 screenshots.
// Returns false when the bridge is unavailable or the OS rejects the request.
export async function openScreenshotsFolder(): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.openScreenshotsFolder) return false;
  try {
    return (await bridge.openScreenshotsFolder()) === true;
  } catch {
    return false;
  }
}

// Report the live close-guard inputs to the Electron main process, which owns
// the actual window-close confirm dialog (see steam/main.js + closeGuard.js).
export function setDesktopCloseGuardState(state: {
  simRunning: boolean;
  confirmOnClose: boolean;
}): void {
  const bridge = getDesktopBridge();
  if (!bridge?.setCloseGuardState) return;
  try {
    bridge.setCloseGuardState({
      simRunning: state.simRunning === true,
      confirmOnClose: state.confirmOnClose === true,
    });
  } catch {
    // Bridge call failures must never break the game loop.
  }
}

// Apply a whole-interface scale (Task #532). Two implementations:
//   - Electron shell: webContents.setZoomFactor via the bridge — the real
//     Chromium zoom, so window.innerWidth/useWindowDimensions shrink in CSS
//     pixels and every layout reflows exactly like a smaller window. This is
//     the primary path (1440p+ desktop players).
//   - Plain web: CSS zoom on the document root as a best-effort fallback
//     (supported by every current engine). A synthetic resize event nudges
//     react-native-web's Dimensions listeners to re-read the viewport.
// Values outside [1, 2] are clamped; 1 clears any override.
export function applyUiScale(scale: number): void {
  const win = getWindow();
  if (!win) return;
  const raw = Number(scale);
  const clamped = Number.isFinite(raw) ? Math.min(2, Math.max(1, raw)) : 1;
  const bridge = getDesktopBridge();
  if (bridge?.setZoomFactor) {
    try {
      bridge.setZoomFactor(clamped);
      // Make sure a leftover CSS zoom (e.g. from a previous plain-web session
      // restored via backup) never stacks on top of the native zoom.
      if (typeof document !== "undefined") {
        (document.documentElement.style as any).zoom = "";
      }
      return;
    } catch {
      // fall through to the CSS path
    }
  }
  if (typeof document === "undefined") return;
  try {
    (document.documentElement.style as any).zoom =
      clamped === 1 ? "" : String(clamped);
    win.dispatchEvent(new Event("resize"));
  } catch {
    // Older engines without CSS zoom support: silently keep 100%.
  }
}

import { useEffect, useRef } from "react";
import { BackHandler, Platform, Alert, AppState, type AppStateStatus } from "react-native";

// Native lifecycle guards for the in-game session.
//
// Two related but separable surfaces:
//
// 1. Android hardware-back exit confirm. When the player is on the root
//    in-game route (overview) and hits the system BACK button, expo-router
//    would normally pop them out of the app since there's nothing left to
//    navigate back to. We intercept that and show a "Save & Exit" / "Exit
//    Without Saving" / "Cancel" prompt so the player doesn't lose hours of
//    progress to a stray thumb tap. Android-only; iOS has no hardware back
//    button and web back is handled by useDesktopPolish's beforeunload guard.
//
// 2. Native AppState background autosave. When the OS sends the app to the
//    background (home swipe, multitask, lock screen), iOS or Android may
//    suspend or even kill the process before the next periodic autosave
//    fires. We listen for AppState transitions to "background" or "inactive"
//    and run a save right away. Active on both iOS and Android (where the
//    risk is real); no-op on web (the unload path covers that).
//
// Mid-tick guard: both paths consult the `isTickInFlight` ref to skip the
// save if the reducer is currently applying a tick. The save would race the
// tick and could persist a half-applied state. We re-arm a deferred save
// once the tick clears via the AppState transition path.
export function useNativeExitConfirm(opts: {
  // Gates the Android hardware-back confirm prompt. Typically only true on
  // the root in-game route (e.g. /overview) so deeper screens still pop
  // normally without an "exit game?" prompt.
  enabled: boolean;
  // Independently gates the AppState background autosave. Defaults to true
  // because background-save is safe to run anywhere inside the in-game stack
  // (and is the whole point of the hook on routes deeper than /overview).
  // Pass false to opt out (e.g. on screens where there's no save context).
  enableBackgroundSave?: boolean;
  onSaveAndExit: () => void | Promise<void>;
  onExit: () => void;
  // Optional: if the caller knows a tick is in flight (e.g. tracked via a
  // ref that the reducer flips around its work), pass it here so we skip the
  // save until the tick resolves. If omitted, we always save.
  isTickInFlight?: { current: boolean };
  // Silent autosave used by the AppState background path. If omitted, the
  // background-save effect is a no-op (the listener is still installed but
  // nothing runs on background transitions). Pass a `saveGame`-style callback
  // that doesn't navigate or prompt.
  onBackgroundSave?: () => void | Promise<void>;
  // Optional predicate: when provided and returns false, the back-button is
  // treated as "no risk" and we exit without prompting. Defaults to always
  // prompting (back-compat). Web parity: the desktop beforeunload guard only
  // fires when there's risk of losing progress, so we mirror that here.
  shouldPromptConfirm?: () => boolean;
}) {
  const {
    enabled,
    enableBackgroundSave = true,
    onSaveAndExit,
    onExit,
    isTickInFlight,
    onBackgroundSave,
    shouldPromptConfirm,
  } = opts;

  // Stable ref for AppState handler so we don't re-subscribe on every render.
  const lastStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ---- 1. Android hardware-back exit confirm ----
  // Gated by `enabled` so callers can scope the prompt to a specific route.
  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      // Web-parity gate: if the caller says there's no risk (sim paused,
      // no unsaved changes), skip the prompt and exit cleanly. This avoids
      // the "exit game?" prompt firing on every stray back-tap when the
      // player has the game safely paused.
      if (shouldPromptConfirm && !shouldPromptConfirm()) {
        onExit();
        return true;
      }
      Alert.alert(
        "EXIT GAME?",
        "Save your progress and return to the main menu?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Exit Without Saving",
            style: "destructive",
            onPress: () => onExit(),
          },
          {
            text: "Save & Exit",
            onPress: async () => {
              // Mid-tick guard: if the reducer is mid-tick, briefly wait
              // for it to clear before saving. We don't block forever — a
              // single deferred attempt is enough for the normal case.
              if (isTickInFlight?.current) {
                await new Promise((r) => setTimeout(r, 50));
              }
              try {
                await onSaveAndExit();
              } catch (e) {
                console.warn("save-and-exit failed:", e);
              }
            },
          },
        ],
      );
      return true; // we handled the event; suppress default behavior
    });
    return () => sub.remove();
  }, [enabled, onSaveAndExit, onExit, isTickInFlight, shouldPromptConfirm]);

  // ---- 2. Background autosave on iOS + Android ----
  // Independently gated by `enableBackgroundSave` so it stays armed across
  // the whole in-game stack, not just the route that owns the back-confirm.
  useEffect(() => {
    if (!enableBackgroundSave) return;
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    const handle = (next: AppStateStatus) => {
      const prev = lastStateRef.current;
      lastStateRef.current = next;
      // Going to background or inactive means the OS may kill us soon. Save.
      if (prev === "active" && (next === "background" || next === "inactive")) {
        const runSave = async () => {
          if (isTickInFlight?.current) {
            // Tick in flight; wait briefly then try.
            await new Promise((r) => setTimeout(r, 50));
          }
          try {
            if (onBackgroundSave) {
              await onBackgroundSave();
            }
          } catch (e) {
            console.warn("background-save failed:", e);
          }
        };
        runSave();
      }
    };
    const sub = AppState.addEventListener("change", handle);
    return () => sub.remove();
  }, [enableBackgroundSave, isTickInFlight, onBackgroundSave]);
}

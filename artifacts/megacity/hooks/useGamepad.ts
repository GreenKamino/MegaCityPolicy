import { useEffect, useRef } from "react";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

// Standard Gamepad mapping button indices we care about.
export const GP = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

export type GamepadActions = {
  // Discrete edge-triggered actions (fire once per press).
  onA?: () => void;
  onB?: () => void;
  onX?: () => void;
  onY?: () => void;
  onLB?: () => void;
  onRB?: () => void;
  onLT?: () => void;
  onRT?: () => void;
  onStart?: () => void;
  onSelect?: () => void;
  // Directional actions. These auto-repeat while held (D-pad or left stick),
  // so menus/lists feel natural to scroll through.
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  // Fired the first time any gamepad input is seen each frame, so the host can
  // switch the focus-ring styling into "gamepad mode".
  onActivity?: () => void;
};

const STICK_DEADZONE = 0.5;
const REPEAT_INITIAL_MS = 360; // delay before a held direction starts repeating
const REPEAT_INTERVAL_MS = 130; // repeat cadence while held

type DirKey = "up" | "down" | "left" | "right";

// Web-only: polls connected gamepads via requestAnimationFrame and dispatches
// edge/repeat events onto the provided action map. Maps a controller onto the
// same navigation/focus actions the keyboard uses (see HotkeyContext).
export function useGamepad(actions: GamepadActions, enabled: boolean = true) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!isWeb || !enabled) return;
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;

    let raf = 0;
    const prevButtons: boolean[] = [];
    const dirState: Record<DirKey, { active: boolean; nextFire: number }> = {
      up: { active: false, nextFire: 0 },
      down: { active: false, nextFire: 0 },
      left: { active: false, nextFire: 0 },
      right: { active: false, nextFire: 0 },
    };

    const fireDir = (key: DirKey) => {
      const a = actionsRef.current;
      if (key === "up") a.onUp?.();
      else if (key === "down") a.onDown?.();
      else if (key === "left") a.onLeft?.();
      else if (key === "right") a.onRight?.();
    };

    const handleDir = (key: DirKey, pressed: boolean, now: number) => {
      const s = dirState[key];
      if (pressed && !s.active) {
        s.active = true;
        s.nextFire = now + REPEAT_INITIAL_MS;
        actionsRef.current.onActivity?.();
        fireDir(key);
      } else if (pressed && s.active) {
        if (now >= s.nextFire) {
          s.nextFire = now + REPEAT_INTERVAL_MS;
          fireDir(key);
        }
      } else if (!pressed && s.active) {
        s.active = false;
      }
    };

    const edge = (idx: number, pressed: boolean, fn?: () => void) => {
      if (pressed && !prevButtons[idx]) {
        actionsRef.current.onActivity?.();
        fn?.();
      }
      prevButtons[idx] = pressed;
    };

    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.from(pads).find((p) => p && p.connected);
      if (!pad) return;

      const now = performance.now();
      const btn = (i: number) => !!pad.buttons[i] && pad.buttons[i].pressed;
      const a = actionsRef.current;

      // Edge-triggered face / shoulder / system buttons.
      edge(GP.A, btn(GP.A), a.onA);
      edge(GP.B, btn(GP.B), a.onB);
      edge(GP.X, btn(GP.X), a.onX);
      edge(GP.Y, btn(GP.Y), a.onY);
      edge(GP.LB, btn(GP.LB), a.onLB);
      edge(GP.RB, btn(GP.RB), a.onRB);
      edge(GP.LT, btn(GP.LT), a.onLT);
      edge(GP.RT, btn(GP.RT), a.onRT);
      edge(GP.START, btn(GP.START), a.onStart);
      edge(GP.SELECT, btn(GP.SELECT), a.onSelect);

      // Directional input: D-pad buttons OR left analog stick (axes 0/1).
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const up = btn(GP.DPAD_UP) || ay < -STICK_DEADZONE;
      const down = btn(GP.DPAD_DOWN) || ay > STICK_DEADZONE;
      const left = btn(GP.DPAD_LEFT) || ax < -STICK_DEADZONE;
      const right = btn(GP.DPAD_RIGHT) || ax > STICK_DEADZONE;
      handleDir("up", up, now);
      handleDir("down", down, now);
      handleDir("left", left, now);
      handleDir("right", right, now);
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}

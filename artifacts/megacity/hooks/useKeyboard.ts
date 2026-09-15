import { useEffect } from "react";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export type KeyMap = Record<string, () => void | false>;

export function useKeyboard(keyMap: KeyMap) {
  useEffect(() => {
    if (!isWeb) return;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const key = buildKey(e);
      const action = keyMap[key];
      if (action) {
        const result = action();
        if (result !== false) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keyMap]);
}

function buildKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  // Shift + a top-row number: bind by physical key code, not e.key. Shift+1
  // yields "!" on US layouts and other symbols elsewhere, so keying off the
  // symbol would be layout-dependent. e.code ("Digit1".."Digit9") is stable,
  // and no non-shift binding relies on those symbols. Non-digit shift combos
  // (e.g. shift+= → "+") are untouched and keep flowing through e.key below.
  if (e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
    parts.push("shift");
    parts.push(e.code.slice(5));
    return parts.join("+");
  }
  const key = e.key.toLowerCase();
  if (e.shiftKey && key.length > 1) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

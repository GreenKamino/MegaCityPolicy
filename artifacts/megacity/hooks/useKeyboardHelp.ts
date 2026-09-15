import { useState, useEffect } from "react";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

// Custom DOM event so any UI affordance (e.g. the "?" button in the top nav,
// a footer hint in the desktop sidebar, a settings menu entry) can request
// the keyboard-help overlay without prop-drilling or a dedicated context.
export const OPEN_HELP_EVENT = "megacity:openKeyboardHelp";

export function openKeyboardHelp(): void {
  if (!isWeb) return;
  window.dispatchEvent(new Event(OPEN_HELP_EVENT));
}

export function useKeyboardHelp() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isWeb) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    const onOpen = () => setVisible(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_HELP_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_HELP_EVENT, onOpen);
    };
  }, []);

  return { visible, show: () => setVisible(true), hide: () => setVisible(false) };
}

// Web-only helper for horizontal tab/filter strips: a regular mouse wheel
// scrolls vertically, so PC users cannot reach off-screen categories in a
// horizontal ScrollView. Attach the returned callback ref to the ScrollView
// and this hook maps vertical wheel deltas to horizontal scroll, exactly like
// the construction screen's category strip (the reference implementation this
// was extracted from). Implemented as a callback ref so it also works for
// strips that mount conditionally (e.g. inside a tab that renders later).
// No-op on native platforms. Each ScrollView needs its own hook instance.
import { useCallback, useRef } from "react";
import { Platform, ScrollView } from "react-native";

export function useHorizontalWheelScroll() {
  const cleanupRef = useRef<(() => void) | null>(null);
  return useCallback((sv: ScrollView | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (Platform.OS !== "web" || !sv) return;
    const node = sv.getScrollableNode?.() as HTMLElement | undefined;
    if (!node || typeof node.addEventListener !== "function") return;
    const onWheel = (e: WheelEvent) => {
      // If the user is already scrolling horizontally (touchpad shift+wheel,
      // horizontal mouse), let the browser handle it natively.
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      if (e.deltaY === 0) return;
      e.preventDefault();
      node.scrollLeft += e.deltaY;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    cleanupRef.current = () => node.removeEventListener("wheel", onWheel);
  }, []);
}

import { useState, useCallback, useRef } from "react";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export function useHover() {
  const [hovered, setHovered] = useState(false);

  const handlers = isWeb
    ? {
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
      }
    : {};

  return { hovered, handlers };
}

export function useContextMenu(onAction: (action: string) => void) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const onContextMenu = useCallback(
    (e: any) => {
      if (!isWeb) return;
      e.preventDefault?.();
      setPosition({ x: e.nativeEvent?.pageX ?? e.pageX ?? 0, y: e.nativeEvent?.pageY ?? e.pageY ?? 0 });
      setVisible(true);
    },
    []
  );

  const select = useCallback(
    (action: string) => {
      setVisible(false);
      onAction(action);
    },
    [onAction]
  );

  const dismiss = useCallback(() => setVisible(false), []);

  const handler = isWeb
    ? { onContextMenu }
    : {};

  return { visible, position, handler, select, dismiss };
}

export function useScrollZoom(
  onZoom: (delta: number, x: number, y: number) => void
) {
  const handler = isWeb
    ? {
        onWheel: (e: any) => {
          e.preventDefault?.();
          const delta = -e.deltaY * 0.001;
          onZoom(delta, e.nativeEvent?.pageX ?? 0, e.nativeEvent?.pageY ?? 0);
        },
      }
    : {};

  return { handler };
}

export const cursorPointer = isWeb ? { cursor: "pointer" as const } : {};
export const cursorGrab = isWeb ? { cursor: "grab" as const } : {};
export const cursorGrabbing = isWeb ? { cursor: "grabbing" as const } : {};
export { isWeb };

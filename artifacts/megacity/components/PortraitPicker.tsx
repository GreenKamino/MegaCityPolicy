import { useEffect, useRef } from "react";
import { Image, Platform, Pressable, ScrollView, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { getPortrait, PLAYER_PORTRAIT_GALLERY } from "@/utils/portraits";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";

const THUMB_GAP = 8;

interface PortraitPickerProps {
  /** Currently-selected portrait id (ringed in the accent color). */
  selectedId: string | undefined;
  /** Called with the tapped portrait id. */
  onSelect: (id: string) => void;
  /** Thumbnail edge length in px. */
  size?: number;
}

/**
 * Horizontal scrollable thumbnail grid of every player-selectable portrait.
 * Portraits are available to any commander regardless of sex. Used by both the
 * new-game creation flow and the Character screen's change-later picker.
 */
export function PortraitPicker({ selectedId, onSelect, size = 60 }: PortraitPickerProps) {
  const { colors: Colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const wheelRef = useHorizontalWheelScroll();

  // On mount, scroll the already-selected portrait into view. The
  // change-later picker often opens with a selection partway down the list,
  // which would otherwise sit off-screen with no visible highlight. Mount-only
  // so tapping a visible thumbnail does not jerk the strip around.
  useEffect(() => {
    const idx = selectedId ? PLAYER_PORTRAIT_GALLERY.indexOf(selectedId) : -1;
    if (idx <= 0) return;
    const x = Math.max(0, idx * (size + THUMB_GAP) - size);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ x, animated: false }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView
      ref={(sv) => { scrollRef.current = sv; wheelRef(sv); }}
      horizontal
      showsHorizontalScrollIndicator={Platform.OS === "web"}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: THUMB_GAP, paddingHorizontal: 2, paddingVertical: 4 }}
    >
      {PLAYER_PORTRAIT_GALLERY.map((id) => {
        const src = getPortrait(id);
        const selected = id === selectedId;
        return (
          <Pressable
            key={id}
            onPress={() => onSelect(id)}
            accessibilityRole="button"
            accessibilityLabel={`Select portrait ${id}`}
            accessibilityState={{ selected }}
          >
            <View
              style={{
                width: size,
                height: size,
                borderRadius: 8,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? Colors.accent : Colors.border,
                overflow: "hidden",
                backgroundColor: Colors.bgCard,
                opacity: selected ? 1 : 0.85,
              }}
            >
              {src ? (
                <Image source={src} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

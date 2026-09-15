import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePhotoMode } from "@/context/PhotoModeContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

export default function PhotoModeOverlay() {
  const { enabled, exit, gridEnabled, toggleGrid, enterCount } = usePhotoMode();
  const { colors: c } = useTheme();
  const { reducedMotion } = useSettings();
  const insets = useSafeAreaInsets();

  // PAUSED flash: a fade-in/hold/fade-out the moment photo mode is entered,
  // so the player gets a clear "the world stopped" cue rather than wondering
  // why the HUD vanished. Total visible window is ~1.7s (200ms in + 1200ms
  // hold + 300ms out) — long enough to register at a glance without lingering
  // on top of the composition. We watch enterCount (a monotonic counter from
  // PhotoModeContext) so each entry retriggers the animation. Honors
  // reducedMotion: when on, we skip the fades and just hold the badge static
  // for the same total window.
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled || enterCount === 0) return;
    if (reducedMotion) {
      flash.setValue(1);
      const t = setTimeout(() => flash.setValue(0), 1700);
      return () => clearTimeout(t);
    }
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER, easing: Easing.out(Easing.quad) }),
      Animated.delay(1200),
      Animated.timing(flash, { toValue: 0, duration: 300, useNativeDriver: USE_NATIVE_DRIVER, easing: Easing.in(Easing.quad) }),
    ]).start();
  }, [enabled, enterCount, reducedMotion, flash]);

  if (!enabled) return null;

  const captureHint = Platform.select({
    web: "Press PrtSc / Cmd+Shift+4 to capture.",
    ios: "Press both side buttons to capture.",
    android: "Press Power + Volume Down to capture.",
    default: "Use your device's screenshot shortcut.",
  });

  return (
    <View style={[styles.layer, { paddingTop: insets.top + 12, pointerEvents: "box-none" }]}>
      {/* Rule-of-thirds composition grid. Two horizontal + two vertical
          1px lines split the visible area into a 3×3 — the standard
          framing aid in any camera app. Pure visual overlay,
          pointerEvents="none" so it never blocks touches on the world
          underneath. */}
      {gridEnabled ? (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
          <View style={[styles.gridLineV, { left: "33.333%", backgroundColor: c.text + "55" }]} />
          <View style={[styles.gridLineV, { left: "66.666%", backgroundColor: c.text + "55" }]} />
          <View style={[styles.gridLineH, { top: "33.333%", backgroundColor: c.text + "55" }]} />
          <View style={[styles.gridLineH, { top: "66.666%", backgroundColor: c.text + "55" }]} />
        </View>
      ) : null}

      {/* PAUSED flash badge. Centered horizontally, near the top so it
          doesn't fight the top-row controls. Driven by `flash`, fades
          in immediately on entry then fades out. We wrap the badge in a
          full-width centering View because alignSelf: 'center' doesn't
          apply cleanly to absolutely positioned children in RN. */}
      <View
        style={{ position: "absolute", top: insets.top + 70, left: 0, right: 0, alignItems: "center", pointerEvents: "none" }}
      >
        <Animated.View
          style={[
            styles.pausedBadge,
            {
              opacity: flash,
              backgroundColor: c.bg + "DD",
              borderColor: c.warning,
            },
          ]}
        >
          <Feather name="pause" size={12} color={c.warning} />
          <Text style={[styles.pausedText, { color: c.warning }]}>SIM PAUSED</Text>
        </Animated.View>
      </View>

      <View style={[styles.topRow, { pointerEvents: "box-none" }]}>
        <View style={[styles.badge, { backgroundColor: c.bg + "CC", borderColor: c.accent }]}>
          <Feather name="camera" size={12} color={c.accent} />
          <Text style={[styles.badgeText, { color: c.accent }]}>PHOTO MODE</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={toggleGrid}
            style={({ pressed }) => [
              styles.exitBtn,
              {
                backgroundColor: c.bg + "CC",
                borderColor: gridEnabled ? c.accent : c.border,
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel={gridEnabled ? "Hide composition grid" : "Show composition grid"}
          >
            <Feather name="grid" size={14} color={gridEnabled ? c.accent : c.textMuted} />
            <Text style={[styles.exitText, { color: gridEnabled ? c.accent : c.textMuted }]}>GRID</Text>
          </Pressable>
          <Pressable
            onPress={exit}
            style={({ pressed }) => [
              styles.exitBtn,
              { backgroundColor: c.bg + "CC", borderColor: c.danger },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Feather name="x" size={14} color={c.danger} />
            <Text style={[styles.exitText, { color: c.danger }]}>EXIT (H)</Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.hint, { backgroundColor: c.bg + "AA", borderColor: c.accent + "40", marginBottom: insets.bottom + 12 }]}>
        <Text style={[styles.hintText, { color: c.textSecondary }]}>{captureHint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  exitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
  exitText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  hint: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
  },
  hintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
  },
  pausedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
  },
  pausedText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 2,
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
  },
});

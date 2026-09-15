import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";

export function CRTOverlay() {
  const { isDark } = useTheme();
  const { crtEnabled } = useSettings();

  if (!crtEnabled || !isDark || Platform.OS !== "web") return null;

  return (
    <View style={styles.container}>
      <View style={styles.scanlines} />
      <View style={styles.phosphorGlow} />
      <View style={styles.vignette} />
      <View style={styles.screenEdge} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    pointerEvents: "none",
  },
  scanlines: {
    ...StyleSheet.absoluteFillObject,
    backgroundImage:
      "repeating-linear-gradient(0deg, rgba(0,255,65,0.03) 0px, rgba(0,255,65,0.03) 1px, transparent 1px, transparent 3px)",
  } as any,
  phosphorGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundImage:
      "radial-gradient(ellipse at center, rgba(0,255,65,0.02) 0%, transparent 70%)",
  } as any,
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundImage:
      "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)",
  } as any,
  screenEdge: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(0,255,65,0.04)",
    borderRadius: 2,
  },
});

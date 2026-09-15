import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useSettings } from "@/context/SettingsContext";

function ScanlineOverlay() {
  const { scanlineEnabled } = useSettings();

  if (!scanlineEnabled || Platform.OS !== "web") return null;

  return (
    <View style={[styles.overlay, { pointerEvents: "none" }]}>
      <View style={styles.scanlines} />
    </View>
  );
}

export default React.memo(ScanlineOverlay);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    pointerEvents: "none" as any,
    overflow: "hidden",
  },
  scanlines: {
    flex: 1,
    opacity: 0.03,
    backgroundImage:
      "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.15) 2px, rgba(0,255,65,0.15) 4px)" as any,
  },
});

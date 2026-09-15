import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";

type Props = {
  progress: number;
  total: number;
  label?: string;
  color?: string;
  height?: number;
  showPercent?: boolean;
};

function ProgressBar({ progress, total, label, color: colorProp, height = 6, showPercent = true }: Props) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const color = colorProp ?? Colors.accent;
  const pct = total > 0 ? Math.min(progress / total, 1) : 0;
  const widthAnim = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [pct, widthAnim]);

  const widthInterp = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      {(label || showPercent) && (
        <View style={styles.labelRow}>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          {showPercent && (
            <Text style={[styles.pct, { color }]}>
              {Math.round(pct * 100)}%
            </Text>
          )}
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <Animated.View
          style={[styles.fill, { width: widthInterp, backgroundColor: color, height }]}
        />
      </View>
    </View>
  );
}

export default React.memo(ProgressBar);

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: {
    gap: 3,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  pct: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  track: {
    backgroundColor: "rgba(0, 255, 65, 0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    borderRadius: 3,
  },
}));

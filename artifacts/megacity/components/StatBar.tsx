import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

type Props = {
  label: string;
  value: number;
  max?: number;
  invertColor?: boolean;
  showValue?: boolean;
  compact?: boolean;
};

function getBarColor(normalized: number, invert: boolean, c: ThemePalette): string {
  const v = invert ? 1 - normalized : normalized;
  if (v >= 0.65) return c.statHigh;
  if (v >= 0.35) return c.statMid;
  return c.statLow;
}

function StatBarInner({
  label,
  value,
  max = 100,
  invertColor = false,
  showValue = true,
  compact = false,
}: Props) {
  const { colors: c } = useTheme();
  const normalized = Math.max(0, Math.min(1, value / max));
  const color = getBarColor(normalized, invertColor, c);
  const widthAnim = useRef(new Animated.Value(normalized * 100)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isDanger = invertColor ? normalized > 0.8 : normalized < 0.2;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: normalized * 100,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [normalized, widthAnim]);

  useEffect(() => {
    if (isDanger) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: USE_NATIVE_DRIVER }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isDanger, pulseAnim]);

  const animatedWidth = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View style={[styles.container, compact && styles.compact, isDanger && { opacity: pulseAnim }]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: isDanger ? c.statLow : c.textSecondary }, compact && styles.labelSmall]}>{label}</Text>
        {showValue && (
          <Text style={[styles.value, { color }, compact && styles.valueSmall]}>
            {Math.round(value)}
            {max === 100 ? "%" : `/${max}`}
          </Text>
        )}
      </View>
      <View style={[styles.track, { backgroundColor: c.border }, compact && styles.trackCompact]}>
        <Animated.View
          style={[styles.fill, { backgroundColor: color, width: animatedWidth }]}
        />
      </View>
    </Animated.View>
  );
}

const StatBar = React.memo(StatBarInner);
export default StatBar;

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  compact: {
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  labelSmall: {
    fontSize: 11,
  },
  value: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  valueSmall: {
    fontSize: 11,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  trackCompact: {
    height: 4,
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
});

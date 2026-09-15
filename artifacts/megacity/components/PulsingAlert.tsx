import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

type Props = {
  message: string;
  severity: "critical" | "warning" | "caution";
  icon?: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
};

function PulsingAlert({ message, severity, icon, detail, actionLabel, onAction }: Props) {
  const { colors: c } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const severityColors = {
    critical: c.danger,
    warning: c.warning,
    caution: c.textSecondary,
  };

  useEffect(() => {
    if (severity === "critical") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else if (severity === "warning") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 1200, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: USE_NATIVE_DRIVER }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [severity, pulseAnim]);

  const color = severityColors[severity];

  return (
    <Animated.View style={[styles.container, { borderLeftColor: color, borderColor: c.border, backgroundColor: c.bgCard + "B3", opacity: pulseAnim }]}>
      <View style={styles.header}>
        {icon ? <Text style={[styles.icon, { color }]}>{icon}</Text> : null}
        <Text style={[styles.message, { color }]}>{message}</Text>
      </View>
      {detail ? <Text style={[styles.detail, { color: c.textSecondary }]}>{detail}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} for ${message}`}
          style={({ pressed }) => [
            styles.action,
            { borderColor: color + "66", backgroundColor: color + "12" },
            pressed && { opacity: 0.65 },
          ]}
        >
          <Text style={[styles.actionLabel, { color }]}>{actionLabel}</Text>
          <Text style={[styles.actionArrow, { color }]}>›</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

export default React.memo(PulsingAlert);

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  icon: {
    fontSize: 14,
  },
  message: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
    flex: 1,
  },
  detail: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 3,
    marginLeft: 20,
  },
  action: {
    minHeight: 30,
    marginTop: 7,
    marginLeft: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  actionArrow: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    lineHeight: 16,
  },
});

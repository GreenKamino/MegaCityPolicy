import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useToast, type Toast, type ToastType } from "@/context/ToastContext";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

const getTypeColors = (Colors: ThemePalette): Record<ToastType, string> => ({
  info: Colors.info,
  success: Colors.accent,
  warning: Colors.warning,
  danger: Colors.danger,
});

const TYPE_PREFIX: Record<ToastType, string> = {
  info: "//",
  success: ">>",
  warning: "!!",
  danger: "XX",
};

function ToastItem({ toast }: { toast: Toast }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();

    const fadeTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(translateY, { toValue: -10, duration: 500, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();
    }, 2400);

    return () => clearTimeout(fadeTimer);
  }, [opacity, translateY]);

  const borderColor = getTypeColors(Colors)[toast.type];

  return (
    <Animated.View style={[styles.toast, { borderLeftColor: borderColor, opacity, transform: [{ translateY }] }]}>
      <Text style={[styles.prefix, { color: borderColor }]}>{TYPE_PREFIX[toast.type]}</Text>
      <Text style={styles.message} numberOfLines={2}>{toast.message}</Text>
    </Animated.View>
  );
}

export default function GameToastContainer() {
  const styles = useStyles();
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { pointerEvents: "none" }]}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: {
    position: "absolute",
    top: 70,
    left: 16,
    right: 16,
    zIndex: 9998,
    alignItems: "center",
    gap: 6,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 500,
    width: "100%",
    gap: 8,
  },
  prefix: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    flex: 1,
  },
}));

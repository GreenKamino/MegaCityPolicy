import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

type Props = {
  visible: boolean;
  error?: { kind: "quota" | "io"; message: string } | null;
  onErrorPress?: () => void;
};

function SaveIndicator({ visible, error, onErrorPress }: Props) {
  const styles = useStyles();
  const opacity = useRef(new Animated.Value(0)).current;
  const errorOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.delay(1200),
        Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();
    }
  }, [visible, opacity]);

  // Error state stays put until cleared (i.e. until the next successful
  // save) — the player needs to *see* this. Fading it like the green
  // badge would defeat the purpose: we'd be hiding the very signal that
  // tells them their progress isn't being persisted.
  useEffect(() => {
    Animated.timing(errorOpacity, {
      toValue: error ? 1 : 0,
      duration: error ? 200 : 400,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [error, errorOpacity]);

  if (error) {
    const label = error.kind === "quota" ? "STORAGE FULL" : "SAVE FAILED";
    return (
      <Animated.View style={[styles.container, { opacity: errorOpacity }]}>
        <Pressable
          onPress={onErrorPress}
          accessibilityRole="button"
          accessibilityLabel={`${label}. Tap for recovery options.`}
          style={({ pressed }) => [styles.badge, styles.errorBadge, pressed && styles.errorBadgePressed]}
        >
          <Text style={[styles.icon, styles.errorIcon]}>&#x26A0;</Text>
          <Text style={[styles.text, styles.errorText]}>{label}</Text>
          <Text style={[styles.text, styles.errorHint]}>&#x203A;</Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity, pointerEvents: "none" }]}>
      <View style={styles.badge}>
        <Text style={styles.icon}>&#x25C9;</Text>
        <Text style={styles.text}>SAVED</Text>
      </View>
    </Animated.View>
  );
}

export default React.memo(SaveIndicator);

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 52,
    right: 12,
    zIndex: 9990,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.accentDim,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  errorBadge: {
    backgroundColor: "rgba(40, 8, 8, 0.92)",
    borderColor: "#c8323c",
  },
  errorBadgePressed: {
    opacity: 0.7,
  },
  errorHint: {
    color: "#ff8a91",
    marginLeft: 1,
  },
  icon: {
    color: Colors.accent,
    fontSize: 10,
  },
  errorIcon: {
    color: "#ff6b72",
    fontSize: 11,
  },
  text: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: Colors.accent,
    letterSpacing: 2,
  },
  errorText: {
    color: "#ff8a91",
  },
}));

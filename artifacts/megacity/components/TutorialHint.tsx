import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { useTutorial } from "@/context/TutorialContext";
import { useSettings } from "@/context/SettingsContext";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

type Props = {
  id: string;
  message: string;
  position?: "top" | "bottom";
};

function TutorialHint({ id, message, position = "bottom" }: Props) {
  const { colors: c } = useTheme();
  const { hasSeenHint, markSeen } = useTutorial();
  const { tipsEnabled, reducedMotion } = useSettings();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(position === "top" ? -10 : 10)).current;

  const visible = tipsEnabled && !hasSeenHint(id);

  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: USE_NATIVE_DRIVER }),
        ]).start();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [visible, reducedMotion, opacity, translateY]);

  if (!visible) return null;

  const handleDismiss = () => {
    if (reducedMotion) {
      markSeen(id);
      return;
    }
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }).start(() => {
      markSeen(id);
    });
  };

  return (
    <Animated.View style={[styles.container, { borderColor: c.accentDim, backgroundColor: c.accent + "14", opacity, transform: [{ translateY }] }]}>
      <View style={[styles.badge, { backgroundColor: c.accent }]}>
        <Text style={[styles.prefix, { color: c.bg }]}>TIP</Text>
      </View>
      <Text style={[styles.message, { color: c.textSecondary }]}>{message}</Text>
      <Pressable onPress={handleDismiss} style={[styles.dismiss, { borderColor: c.accentDim }]}>
        <Text style={[styles.dismissText, { color: c.accent }]}>GOT IT</Text>
      </Pressable>
    </Animated.View>
  );
}

export default React.memo(TutorialHint);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  badge: {
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  prefix: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  message: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  dismiss: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 3,
  },
  dismissText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
});

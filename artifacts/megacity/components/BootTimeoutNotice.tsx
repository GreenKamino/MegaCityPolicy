import { reloadAppAsync } from "expo";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

// Shown only when the boot safety cap force-dismisses the splash before the
// saved-game hydration milestone completes. It's a brief, non-blocking notice
// so a stuck/slow boot is understandable instead of mysterious. Deliberately
// reassuring — it does not claim data loss, because a hang doesn't tell us
// whether the save is actually bad. Auto-fades and is tap-to-dismiss.
export default function BootTimeoutNotice({
  reason,
  onRetry,
}: {
  reason: "timeout" | "error";
  onRetry: () => Promise<boolean>;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [hidden, setHidden] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(translateY, { toValue: -10, duration: 400, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => setHidden(true));
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = async () => {
    if (restarting) return;
    setRestarting(true);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    try {
      await reloadAppAsync();
    } catch {
      setRestarting(false);
    }
  };

  if (hidden) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: Math.max(insets.top + 8, 16),
          opacity,
          transform: [{ translateY }],
          pointerEvents: "box-none",
        },
      ]}
    >
      <View style={styles.notice} accessibilityRole="alert">
        <Text style={styles.prefix}>!!</Text>
        <View style={styles.content}>
          <Text style={styles.title}>SAVE DATA NOT FULLY LOADED</Text>
          <Text style={styles.message}>
            {reason === "error"
              ? "Local save data could not be restored. Nothing was deleted or overwritten."
              : "Local save data did not finish loading. Nothing was deleted or overwritten."}
            {" "}Retry the load here, or restart the app before starting or loading a city.
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                if (retrying) return;
                setRetrying(true);
                void onRetry().catch(() => false).finally(() => setRetrying(false));
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry save loading"
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>{retrying ? "RETRYING..." : "RETRY LOAD"}</Text>
            </Pressable>
            <Pressable
              onPress={() => { void restart(); }}
              accessibilityRole="button"
              accessibilityLabel="Restart app and retry save loading"
              style={({ pressed }) => [styles.restartButton, pressed && styles.pressed]}
            >
              <Text style={styles.restartText}>{restarting ? "RESTARTING..." : "RESTART APP"}</Text>
            </Pressable>
            <Pressable
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss save loading warning"
              style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
            >
              <Text style={styles.dismissText}>DISMISS</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: "center",
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: 500,
    width: "100%",
    gap: 8,
  },
  prefix: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
    color: Colors.warning,
    marginTop: 1,
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    color: Colors.text,
    flex: 1,
  },
  content: {
    flex: 1,
    gap: 5,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.8,
    color: Colors.warning,
  },
  actions: {
    flexDirection: "row",
    gap: 14,
    marginTop: 3,
  },
  retryButton: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
    paddingVertical: 3,
  },
  retryText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.7,
    color: Colors.accent,
  },
  restartButton: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.textMuted,
    paddingVertical: 3,
  },
  restartText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.7,
    color: Colors.textMuted,
  },
  dismissButton: {
    paddingVertical: 3,
  },
  dismissText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.7,
    color: Colors.textMuted,
  },
  pressed: {
    opacity: 0.65,
  },
}));

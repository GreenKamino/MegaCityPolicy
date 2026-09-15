import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { summarizeAtlasUnlock, useAtlasUnlock } from "@/context/AtlasUnlockContext";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

export default function AtlasUnlockPopup() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const { current, dismiss } = useAtlasUnlock();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (!current) return;
    opacity.setValue(0);
    scale.setValue(0.92);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  }, [current, opacity, scale]);

  if (!current) return null;

  const { granted, capstone } = current;
  const { headerLabel, totalXp } = summarizeAtlasUnlock(current);
  const isCapstone = !!capstone;

  const goToTrophyWall = () => {
    dismiss();
    router.push({ pathname: "/(game)/firsts" as never, params: { cat: "discovery" } as never });
  };

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss atlas unlock"
          />
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <View style={styles.headerRow}>
            <MaterialCommunityIcons
              name={isCapstone ? "trophy-variant" : "map-check"}
              size={18}
              color={Colors.accent}
            />
            <Text style={styles.headerText}>{headerLabel}</Text>
            <Pressable
              onPress={dismiss}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close atlas unlock"
            >
              <Feather name="x" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          {granted.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SURVEYORS HAVE FILED THE FINAL FIELD NOTES FOR</Text>
              {granted.map((g) => (
                <View key={g.id} style={styles.categoryRow}>
                  <Feather name="check-circle" size={12} color={Colors.accent} />
                  <Text style={styles.categoryName}>{g.label}</Text>
                  <Text style={styles.categoryXp}>+{g.xp} XP</Text>
                </View>
              ))}
            </View>
          )}

          {capstone && (
            <View style={[styles.section, styles.capstoneSection]}>
              <Text style={styles.capstoneTitle}>
                Title conferred: &ldquo;{capstone.title}&rdquo;
              </Text>
              <Text style={styles.capstoneBody}>
                Every category in the Wasteland Atlas is now charted. Council awards a +{capstone.xp} XP capstone bonus.
              </Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL AWARDED</Text>
            <Text style={styles.totalValue}>+{totalXp} XP</Text>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.btnPressed]}
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss atlas unlock"
            >
              <Text style={styles.btnGhostText}>DISMISS</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
              onPress={goToTrophyWall}
              accessibilityRole="button"
              accessibilityLabel="View atlas trophy wall"
            >
              <Feather name="award" size={12} color={Colors.bg} />
              <Text style={styles.btnPrimaryText}>VIEW TROPHY WALL</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.accent + "80",
    borderRadius: 6,
    padding: 16,
    shadowColor: Colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerText: {
    flex: 1,
    color: Colors.accent,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.accent + "30",
    marginVertical: 12,
  },
  section: {
    gap: 6,
    marginBottom: 12,
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  categoryName: {
    flex: 1,
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  categoryXp: {
    color: Colors.accent,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 12,
    fontWeight: "700",
  },
  capstoneSection: {
    padding: 10,
    backgroundColor: Colors.accent + "12",
    borderLeftWidth: 2,
    borderLeftColor: Colors.accent,
    borderRadius: 4,
  },
  capstoneTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  capstoneBody: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    marginBottom: 12,
  },
  totalLabel: {
    color: Colors.textMuted,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 10,
    letterSpacing: 1.2,
  },
  totalValue: {
    color: Colors.accent,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 14,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
  },
  btnPressed: {
    opacity: 0.75,
  },
  btnGhost: {
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  btnGhostText: {
    color: Colors.textSecondary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  btnPrimary: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  btnPrimaryText: {
    color: Colors.bg,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
}));

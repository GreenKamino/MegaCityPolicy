import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { ACHIEVEMENTS_MAP } from "@/engine/achievements";

export default function AchievementReport() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { pendingAchievements, dismissAchievementReport } = useGame();
  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  if (pendingAchievements.length === 0) return null;

  const achDefs = pendingAchievements
    .map((id) => ACHIEVEMENTS_MAP[id])
    .filter(Boolean);

  return (
    <Modal
      visible={pendingAchievements.length > 0}
      animationType="fade"
      transparent
      onRequestClose={dismissAchievementReport}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { marginTop: topInset + 20 }]}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Feather name="award" size={20} color={Colors.warning} />
            </View>
            <Text style={styles.title}>ACHIEVEMENT{achDefs.length > 1 ? "S" : ""} UNLOCKED</Text>
            <Pressable onPress={dismissAchievementReport}>
              <Feather name="x" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
            {achDefs.map((ach) => (
              <View key={ach!.id} style={styles.achRow}>
                <View style={styles.achIcon}>
                  <Feather name="star" size={14} color={Colors.warning} />
                </View>
                <View style={styles.achInfo}>
                  <Text style={styles.achName}>{ach!.title}</Text>
                  <Text style={styles.achDesc}>{ach!.description}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.dismissBtn} onPress={dismissAchievementReport}>
            <Text style={styles.dismissText}>ACKNOWLEDGED</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-start",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.warning + "60",
    borderRadius: 8,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.warning + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 2,
  },
  list: {
    maxHeight: 300,
  },
  achRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  achIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.warning + "15",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  achInfo: {
    flex: 1,
  },
  achName: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 2,
  },
  achDesc: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  dismissBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.warning + "40",
    borderRadius: 6,
    backgroundColor: Colors.warning + "10",
    alignItems: "center",
  },
  dismissText: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 2,
  },
}));

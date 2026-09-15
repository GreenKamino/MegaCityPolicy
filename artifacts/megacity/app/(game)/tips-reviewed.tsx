import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { TUTORIAL_HINTS } from "@/engine/tutorialHints";
import { useTutorial } from "@/context/TutorialContext";
import GameModal from "@/components/GameModal";
import { useGameModal } from "@/hooks/useGameModal";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function TipsReviewedScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { hasSeenHint, resetHints } = useTutorial();
  const { modal, showModal, hideModal } = useGameModal();
  // Default to "seen only" to match the strict spec interpretation: this
  // screen is for reviewing tips you've actually dismissed, not browsing
  // upcoming hints. Toggle to ALL exists for players who want a preview.
  const [filter, setFilter] = useState<"seen" | "all">("seen");

  const stats = useMemo(() => {
    const total = TUTORIAL_HINTS.length;
    const seen = TUTORIAL_HINTS.filter((h) => hasSeenHint(h.id)).length;
    return { total, seen };
  }, [hasSeenHint]);

  const visibleHints = useMemo(() => {
    if (filter === "all") return TUTORIAL_HINTS;
    return TUTORIAL_HINTS.filter((h) => hasSeenHint(h.id));
  }, [filter, hasSeenHint]);

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <Text style={[s.headerTitle, { flex: 1 }]}>TIPS REVIEWED</Text>
        <Pressable
          onPress={() => showModal(
            "RESET TIPS?",
            "All dismissed tips will be reset and will reappear as you encounter them again.",
            [
              { text: "CANCEL", style: "cancel" },
              { text: "RESET", style: "destructive", onPress: resetHints },
            ],
          )}
          hitSlop={12}
          accessibilityLabel="Reset all dismissed tips"
          style={({ pressed }) => [s.resetBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="refresh-cw" size={11} color={Colors.warning} />
          <Text style={s.resetText}>RESET</Text>
        </Pressable>
      </View>

      <View style={s.summaryRow}>
        <View style={s.pill}>
          <Text style={s.pillValue}>{stats.seen}</Text>
          <Text style={s.pillLabel}>SEEN</Text>
        </View>
        <View style={s.pill}>
          <Text style={s.pillValue}>{stats.total}</Text>
          <Text style={s.pillLabel}>TOTAL</Text>
        </View>
      </View>

      <Text style={s.intro}>
        {filter === "seen"
          ? "Tips you've dismissed in this run. Hit RESET to make them re-appear."
          : "Every tutorial hint in the game. Faded entries haven't been triggered yet."}
      </Text>

      <View style={s.filterRow}>
        <Pressable
          onPress={() => setFilter("seen")}
          style={[s.filterBtn, filter === "seen" && s.filterBtnActive]}
          accessibilityLabel="Show seen tips only"
        >
          <Text style={[s.filterText, filter === "seen" && s.filterTextActive]}>SEEN</Text>
        </Pressable>
        <Pressable
          onPress={() => setFilter("all")}
          style={[s.filterBtn, filter === "all" && s.filterBtnActive]}
          accessibilityLabel="Show all tips"
        >
          <Text style={[s.filterText, filter === "all" && s.filterTextActive]}>ALL</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {visibleHints.length === 0 && (
          <Text style={s.emptyText}>
            No tips dismissed yet. Play through the game and tips will appear here as
            you encounter them.
          </Text>
        )}
        {visibleHints.map((h) => {
          const seen = hasSeenHint(h.id);
          return (
            <View key={h.id} style={[s.card, !seen && { opacity: 0.55 }]}>
              <View style={s.cardHeader}>
                <Feather
                  name={seen ? "check-circle" : "circle"}
                  size={12}
                  color={seen ? Colors.accent : Colors.textMuted}
                />
                <Text style={s.location}>{h.location}</Text>
              </View>
              <Text style={s.message}>{h.message}</Text>
            </View>
          );
        })}
      </ScrollView>
      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: mono,
    fontSize: 13,
    letterSpacing: 1.5,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.warning + "60",
    backgroundColor: Colors.warning + "12",
  },
  resetText: {
    color: Colors.warning,
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  summaryRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 10 },
  pill: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: "center",
  },
  pillValue: { color: Colors.accent, fontFamily: mono, fontSize: 16, fontWeight: "700" },
  pillLabel: { color: Colors.textMuted, fontSize: 9, letterSpacing: 1, marginTop: 2 },
  intro: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    backgroundColor: Colors.bgCard,
  },
  filterBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18",
  },
  filterText: {
    color: Colors.textMuted,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  filterTextActive: { color: Colors.accent },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  content: { padding: 16, paddingBottom: 80, gap: 10 },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: 4,
    padding: 12,
    gap: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  location: {
    color: Colors.accent,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  message: { color: Colors.text, fontSize: 12, lineHeight: 17 },
}));

export default withScreenBoundary(TipsReviewedScreen, "tips-reviewed");

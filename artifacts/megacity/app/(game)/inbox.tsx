import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import TutorialHint from "@/components/TutorialHint";
import OnboardingBanner from "@/components/OnboardingBanner";
import GameModal from "@/components/GameModal";
import { useGameModal } from "@/hooks/useGameModal";
import { useGame } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { formatDate } from "@/engine/clock";
import type { GameMessage } from "@/engine/types";

const CATEGORY_ICONS: Record<string, string> = {
  report: "file-text",
  call: "phone-incoming",
  mission: "target",
  alert: "alert-triangle",
  update: "info",
  intel: "eye",
  request: "mail",
  "world-news": "globe",
};

const getPriorityColors = (Colors: ThemePalette): Record<string, string> => ({
  low: Colors.textMuted,
  normal: Colors.textSecondary,
  high: Colors.warning,
  critical: Colors.danger,
});

const FILTER_CATEGORIES = ["all", "world-news", "report", "call", "mission", "alert", "update", "intel", "request"] as const;
type FilterCategory = (typeof FILTER_CATEGORIES)[number];

const FILTER_PRIORITIES = ["all", "critical", "high", "normal", "low"] as const;
type FilterPriority = (typeof FILTER_PRIORITIES)[number];

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        active && styles.filterChipActive,
        Platform.OS === "web" && { cursor: "pointer" as any },
      ]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MessageCard({
  message,
  onRead,
  onDismiss,
}: {
  message: GameMessage;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const iconName = CATEGORY_ICONS[message.category] ?? "mail";
  const priorityColor = getPriorityColors(Colors)[message.priority] ?? Colors.textSecondary;

  return (
    <Pressable
      onPress={onRead}
      style={[
        styles.card,
        !message.read && styles.cardUnread,
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Feather name={iconName as any} size={14} color={priorityColor} />
          <Text style={[styles.cardCategory, { color: priorityColor }]}>
            {message.category.toUpperCase()}
          </Text>
          {message.priority === "critical" && (
            <Text style={styles.priorityBadge}>CRITICAL</Text>
          )}
          {message.priority === "high" && (
            <Text style={[styles.priorityBadge, { backgroundColor: Colors.warning + "22", color: Colors.warning }]}>HIGH</Text>
          )}
          {!message.read && <View style={styles.unreadDot} />}
        </View>
        <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss message">
          <Feather name="x" size={14} color={Colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.cardTitle}>{message.title}</Text>
      <Text style={styles.cardBody}>{message.body}</Text>
      <Text style={styles.cardTime}>{formatDate(message.timestamp)}</Text>
    </Pressable>
  );
}

function InboxScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state: rawState, dismissMessage, markMessageRead, markAllMessagesRead, clearAllMessages } = useGame();
  // Inbox actions must be reflected immediately: throttling this state made a
  // confirmed dismissal leave the old card, unread count, and filter counts
  // visible until the next throttle window.
  const state = rawState;
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all");
  const [priorityFilter, setPriorityFilter] = useState<FilterPriority>("all");
  const categoryScrollRef = useHorizontalWheelScroll();
  const priorityScrollRef = useHorizontalWheelScroll();
  const [groupByCategory, setGroupByCategory] = useState(false);
  const { modal, showModal, hideModal } = useGameModal();

  const messages = state.messages ?? [];
  const handleDismiss = (message: GameMessage) => {
    showModal(
      "DELETE MESSAGE?",
      `1 message: "${message.title}"\n\nThis message will be permanently deleted. This cannot be undone.`,
      [
        { text: "CANCEL", style: "cancel" },
        { text: "DELETE", style: "destructive", onPress: () => dismissMessage(message.id) },
      ],
    );
  };
  const handleDeleteAll = () => {
    const count = messages.length;
    showModal(
      "DELETE ALL MESSAGES?",
      `${count} message${count === 1 ? "" : "s"} will be permanently deleted. This cannot be undone.`,
      [
        { text: "CANCEL", style: "cancel" },
        { text: "DELETE ALL", style: "destructive", onPress: clearAllMessages },
      ],
    );
  };
  // Memoized so toggling a filter or scrolling the FlatList doesn't recount the
  // entire message array on every render. Recomputes only when the messages
  // array reference changes (which is whenever the throttled state ticks).
  const unreadCount = useMemo(
    () => messages.filter((m) => !m.read).length,
    [messages],
  );

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && m.priority !== priorityFilter) return false;
      return true;
    });
  }, [messages, categoryFilter, priorityFilter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of messages) {
      counts[m.category] = (counts[m.category] ?? 0) + 1;
    }
    return counts;
  }, [messages]);

  const groupedSections = useMemo(() => {
    if (!groupByCategory) return [];
    const buckets: Record<string, GameMessage[]> = {};
    for (const m of filteredMessages) {
      const key = m.category;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(m);
    }
    return Object.keys(buckets)
      .sort((a, b) => buckets[b].length - buckets[a].length)
      .map((cat) => ({ title: cat, data: buckets[cat] }));
  }, [groupByCategory, filteredMessages]);

  const hasActiveFilter = categoryFilter !== "all" || priorityFilter !== "all";

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>INBOX</Text>
          <Text style={styles.headerSub}>
            {messages.length} MESSAGE{messages.length !== 1 ? "S" : ""} · {unreadCount} UNREAD
            {hasActiveFilter ? ` · ${filteredMessages.length} SHOWN` : ""}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable onPress={markAllMessagesRead} style={styles.actionBtn}>
            <MaterialCommunityIcons name="email-check" size={16} color={Colors.accent} />
            <Text style={styles.actionBtnText}>READ ALL</Text>
          </Pressable>
        )}
        {messages.length > 0 && (
          <Pressable
            onPress={handleDeleteAll}
            style={styles.actionBtn}
          >
            <Feather name="trash-2" size={14} color={Colors.textMuted} />
            <Text style={[styles.actionBtnText, { color: Colors.textMuted }]}>DELETE ALL</Text>
          </Pressable>
        )}
      </View>

      <OnboardingBanner step="dispatch" />
      <TutorialHint
        id="inbox_intro"
        message="Dispatches, intel, and crises land here. Filter by category or priority. Tap a message to read it; swipe the X to archive. Critical entries demand a response within ticks."
      />

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>CATEGORY</Text>
        <ScrollView ref={categoryScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.filterRow}>
          {FILTER_CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              label={cat === "all" ? `ALL (${messages.length})` : `${cat.toUpperCase()} (${categoryCounts[cat] ?? 0})`}
              active={categoryFilter === cat}
              onPress={() => setCategoryFilter(cat)}
            />
          ))}
        </ScrollView>
        <Text style={[styles.filterLabel, { marginTop: 6 }]}>PRIORITY</Text>
        <ScrollView ref={priorityScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.filterRow}>
          {FILTER_PRIORITIES.map((pri) => (
            <FilterChip
              key={pri}
              label={pri.toUpperCase()}
              active={priorityFilter === pri}
              onPress={() => setPriorityFilter(pri)}
            />
          ))}
        </ScrollView>
        <View style={[styles.filterRow, { marginTop: 6 }]}>
          <FilterChip
            label={groupByCategory ? "GROUPED BY CATEGORY ✓" : "GROUP BY CATEGORY"}
            active={groupByCategory}
            onPress={() => setGroupByCategory((v) => !v)}
          />
        </View>
      </View>

      {filteredMessages.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="email-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{hasActiveFilter ? "NO MATCHING MESSAGES" : "NO MESSAGES"}</Text>
          <Text style={styles.emptySubtext}>
            {hasActiveFilter ? "Adjust filters to see more messages" : "Incoming transmissions will appear here"}
          </Text>
        </View>
      ) : groupByCategory ? (
        <SectionList
          sections={groupedSections}
          keyExtractor={(m) => m.id}
          renderItem={({ item: msg }) => (
            <MessageCard
              message={msg}
              onRead={() => markMessageRead(msg.id)}
              onDismiss={() => handleDismiss(msg)}
            />
          )}
          renderSectionHeader={({ section: { title, data } }) => (
            <View style={styles.sectionHeader}>
              <Feather name={(CATEGORY_ICONS[title] ?? "mail") as any} size={11} color={Colors.accent} />
              <Text style={styles.sectionHeaderText}>
                {title.toUpperCase()} — {data.length}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
        />
      ) : (
        <FlatList
          data={filteredMessages}
          keyExtractor={(m) => m.id}
          renderItem={({ item: msg }) => (
            <MessageCard
              message={msg}
              onRead={() => markMessageRead(msg.id)}
              onDismiss={() => handleDismiss(msg)}
            />
          )}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
        />
      )}
      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 2,
  },
  headerSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnDanger: {
    borderColor: Colors.danger,
    backgroundColor: Colors.danger + "18",
  },
  actionBtnText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  filterRow: {
    flexDirection: "row",
    gap: 4,
    paddingBottom: 2,
  },
  filterChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  filterChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18",
  },
  filterChipText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    letterSpacing: 0.8,
  },
  filterChipTextActive: {
    color: Colors.accent,
  },
  priorityBadge: {
    fontSize: 7,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    color: Colors.danger,
    backgroundColor: Colors.danger + "22",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    overflow: "hidden",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 14,
  },
  cardUnread: {
    borderColor: Colors.accent,
    borderLeftWidth: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardCategory: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  cardBody: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  cardTime: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent + "40",
    marginTop: 4,
    marginBottom: 6,
  },
  sectionHeaderText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
}));

export default withScreenBoundary(InboxScreen, "inbox");

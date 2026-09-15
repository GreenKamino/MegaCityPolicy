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

import SectionHeader from "@/components/SectionHeader";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  buildJournalEntries,
  formatGameDate,
  groupJournalByTick,
  type JournalEntry,
  type JournalEntryKind,
  type JournalSeverity,
} from "@/engine/personalJournal";

const KIND_FILTERS: { id: JournalEntryKind | "all"; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "message", label: "MESSAGES" },
  { id: "event", label: "EVENTS" },
  { id: "strike", label: "STRIKES" },
  { id: "world", label: "WORLD" },
];

const KIND_ICONS: Record<JournalEntryKind, string> = {
  message: "mail",
  event: "alert-triangle",
  strike: "target",
  world: "globe",
};

const getSeverityColor = (Colors: ThemePalette): Record<JournalSeverity, string> => ({
  low: Colors.textMuted,
  normal: Colors.accentDim,
  high: Colors.warning,
  critical: Colors.danger,
});

function JournalScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGame();
  const [filter, setFilter] = useState<JournalEntryKind | "all">("all");
  const filterScrollRef = useHorizontalWheelScroll();

  const entries = useMemo(() => buildJournalEntries(state, { limit: 300 }), [state]);
  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.kind === filter);
  }, [entries, filter]);
  const days = useMemo(() => groupJournalByTick(filtered), [filtered]);

  const counts = useMemo(() => {
    const c: Record<JournalEntryKind, number> = { message: 0, event: 0, strike: 0, world: 0 };
    for (const e of entries) c[e.kind]++;
    return c;
  }, [entries]);

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <Text style={s.headerTitle}>ACTIVITY RECORD</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => router.push("/(game)/replay" as never)}
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            borderWidth: 1,
            borderColor: Colors.accent,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 3,
          }}
        >
          <Feather name="rewind" size={12} color={Colors.accent} />
          <Text style={{ color: Colors.accent, fontSize: 10, letterSpacing: 1, fontWeight: "700" }}>
            REPLAY
          </Text>
        </Pressable>
      </View>

      <View style={s.summaryRow}>
        <SummaryPill label="TOTAL" value={entries.length} />
        <SummaryPill label="MSG" value={counts.message} />
        <SummaryPill label="EVT" value={counts.event} />
        <SummaryPill label="STR" value={counts.strike} />
        <SummaryPill label="WRD" value={counts.world} />
      </View>

      <ScrollView
        ref={filterScrollRef}
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === "web"}
        style={s.filterScroll}
        contentContainerStyle={s.filterRow}
      >
        {KIND_FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[s.filterChip, active && s.filterChipActive]}
            >
              <Text style={[s.filterText, active && s.filterTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {days.length === 0 && (
          <View style={s.empty}>
            <Feather name="book-open" size={32} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>NO ENTRIES YET</Text>
            <Text style={s.emptyBody}>Messages, events, strikes, and world updates appear here as they are recorded.</Text>
          </View>
        )}

        {days.map((day) => (
          <View key={day.tick} style={s.dayBlock}>
            <SectionHeader title={day.label} subtitle={`${day.entries.length} entr${day.entries.length === 1 ? "y" : "ies"}`} />
            {day.entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  const s = useStyles();
  return (
    <View style={s.pill}>
      <Text style={s.pillValue}>{value}</Text>
      <Text style={s.pillLabel}>{label}</Text>
    </View>
  );
}

function EntryCard({ entry }: { entry: JournalEntry }) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const color = getSeverityColor(Colors)[entry.severity];
  const dateLabel = formatGameDate(entry.gameDate);
  return (
    <View style={[s.card, { borderLeftColor: color }]}>
      <View style={s.cardHeader}>
        <View style={s.cardTitleRow}>
          <Feather name={KIND_ICONS[entry.kind] as any} size={12} color={color} />
          <Text style={[s.cardTitle, { color: Colors.text }]} numberOfLines={2}>
            {entry.title}
          </Text>
        </View>
        {!!dateLabel && <Text style={s.cardDate}>{dateLabel}</Text>}
      </View>
      <Text style={s.cardBody} numberOfLines={6}>{entry.body}</Text>
      <View style={s.cardFooter}>
        <Text style={[s.cardKind, { color }]}>{entry.kind.toUpperCase()}</Text>
        {!!entry.category && (
          <Text style={s.cardCategory}>· {entry.category.toUpperCase()}</Text>
        )}
      </View>
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
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    letterSpacing: 1.5,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  pill: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingVertical: 6,
    alignItems: "center",
  },
  pillValue: {
    color: Colors.accent,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 14,
    fontWeight: "700",
  },
  pillLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 1,
  },
  filterScroll: { maxHeight: 44, marginTop: 10 },
  filterRow: { paddingHorizontal: 16, gap: 6, alignItems: "center" },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  filterChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentDark,
  },
  filterText: {
    color: Colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1.2,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  filterTextActive: { color: Colors.accent },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 80, gap: Platform.OS === "web" ? 12 : 16 },
  empty: {
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  emptyBody: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  dayBlock: { gap: 8 },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 10,
    gap: 6,
  },
  cardHeader: { gap: 4 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  cardDate: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  cardBody: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardKind: {
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontWeight: "700",
  },
  cardCategory: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
}));

export default withScreenBoundary(JournalScreen, "journal");

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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SectionHeader from "@/components/SectionHeader";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  buildLogbook,
  summarizeCategory,
  summarizeLogbook,
  type LogbookCategory,
  type LogbookCategoryId,
  type LogbookEntry,
} from "@/engine/logbook";

function LogbookScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGame();
  const [activeCat, setActiveCat] = useState<LogbookCategoryId | "all">("all");
  const filterScrollRef = useHorizontalWheelScroll();
  const [showLocked, setShowLocked] = useState(true);
  const [query, setQuery] = useState("");

  const categories = useMemo(() => buildLogbook(state), [state]);
  const totals = useMemo(() => summarizeLogbook(state), [state]);

  const visible: { cat: LogbookCategory; entries: LogbookEntry[] }[] = useMemo(() => {
    const cats = activeCat === "all" ? categories : categories.filter((c) => c.id === activeCat);
    const q = query.trim().toLowerCase();
    // Search only indexed identifiers. Locked entries never expose hidden data.
    const matches = (e: LogbookEntry) => {
      if (!q) return true;
      if (!e.discovered) return false;
      if (e.name.toLowerCase().includes(q)) return true;
      if (e.subtitle && e.subtitle.toLowerCase().includes(q)) return true;
      return false;
    };
    return cats.map((c) => ({
      cat: c,
      entries: c.entries.filter((e) => (showLocked || e.discovered) && matches(e)),
    }));
  }, [categories, activeCat, showLocked, query]);

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <Text style={s.headerTitle}>ENTITY INDEX</Text>
      </View>

      <View style={s.summaryRow}>
        <SummaryPill label="DISCOVERED" value={totals.discovered} />
        <SummaryPill label="CATALOGUED" value={totals.total} />
        <SummaryPill
          label="PCT"
          value={`${Math.floor((totals.discovered / Math.max(1, totals.total)) * 100)}%`}
        />
      </View>

      <View style={s.searchRow}>
        <Feather name="search" size={12} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="SEARCH NAME OR SUBTITLE"
          placeholderTextColor={Colors.textMuted}
          style={s.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search logbook entries"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Feather name="x" size={12} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={filterScrollRef}
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === "web"}
        style={s.filterScroll}
        contentContainerStyle={s.filterRow}
      >
        <FilterChip label="ALL" active={activeCat === "all"} onPress={() => setActiveCat("all")} />
        {categories.map((c) => {
          const sum = summarizeCategory(c);
          return (
            <FilterChip
              key={c.id}
              label={`${c.label} ${sum.discovered}/${sum.total}`}
              active={activeCat === c.id}
              onPress={() => setActiveCat(c.id)}
            />
          );
        })}
      </ScrollView>

      <View style={s.toggleRow}>
        <Pressable onPress={() => setShowLocked((v) => !v)} style={s.togglePill}>
          <Feather name={showLocked ? "eye" : "eye-off"} size={11} color={Colors.accent} />
          <Text style={s.toggleText}>{showLocked ? "SHOWING UNDISCOVERED" : "DISCOVERED ONLY"}</Text>
        </Pressable>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {visible.every((v) => v.entries.length === 0) && (
          <View style={s.empty}>
            <Feather name="book" size={32} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>EMPTY LOGBOOK</Text>
            <Text style={s.emptyBody}>Encountered factions, settlements, people, and locations are indexed here.</Text>
          </View>
        )}
        {visible.map(({ cat, entries }) => {
          if (entries.length === 0) return null;
          const sum = summarizeCategory(cat);
          return (
            <View key={cat.id} style={s.section}>
              <SectionHeader title={cat.label} subtitle={`${sum.discovered} of ${sum.total}`} />
              {entries.map((e) => (
                <EntryCard key={`${cat.id}:${e.id}`} entry={e} icon={cat.icon} />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function SummaryPill({ label, value }: { label: string; value: number | string }) {
  const s = useStyles();
  return (
    <View style={s.pill}>
      <Text style={s.pillValue}>{value}</Text>
      <Text style={s.pillLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const s = useStyles();
  return (
    <Pressable onPress={onPress} style={[s.filterChip, active && s.filterChipActive]}>
      <Text style={[s.filterText, active && s.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

function EntryCard({ entry, icon }: { entry: LogbookEntry; icon: string }) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const accent = entry.discovered ? Colors.accent : Colors.textMuted;
  return (
    <View
      style={[
        s.card,
        {
          borderLeftColor: entry.discovered ? Colors.accent : Colors.border,
          opacity: entry.discovered ? 1 : 0.55,
        },
      ]}
    >
      <View style={s.cardLeft}>
        <View style={s.iconBox}>
          <Feather name={(entry.discovered ? icon : "help-circle") as any} size={16} color={accent} />
        </View>
      </View>
      <View style={s.cardBody}>
        <Text
          style={[s.cardTitle, { color: entry.discovered ? Colors.text : Colors.textSecondary }]}
          numberOfLines={1}
        >
          {entry.discovered ? entry.name : "[REDACTED]"}
        </Text>
        {!!entry.subtitle && entry.discovered && (
          <Text style={s.cardSubtitle} numberOfLines={1}>{entry.subtitle}</Text>
        )}
        {!entry.discovered && (
          <Text style={s.cardDescription} numberOfLines={2}>
            Encounter or survey this entity to add it to the index.
          </Text>
        )}
      </View>
      {entry.discovered && <Feather name="check-circle" size={14} color={Colors.accent} />}
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
  pillValue: {
    color: Colors.accent,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 16,
    fontWeight: "700",
  },
  pillLabel: { color: Colors.textMuted, fontSize: 9, letterSpacing: 1, marginTop: 2 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    padding: 0,
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
  filterChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accentDark },
  filterText: {
    color: Colors.textSecondary,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  filterTextActive: { color: Colors.accent },
  toggleRow: { paddingHorizontal: 16, paddingTop: 8 },
  togglePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  toggleText: {
    color: Colors.accent,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 80, gap: Platform.OS === "web" ? 10 : 12 },
  section: { gap: 8 },
  empty: { alignItems: "center", padding: 32, gap: 12 },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  emptyBody: { color: Colors.textMuted, fontSize: 12, textAlign: "center", lineHeight: 18 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 10,
  },
  cardLeft: { width: 36, alignItems: "center" },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bgElevated,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  cardSubtitle: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.2,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  cardDescription: { color: Colors.textSecondary, fontSize: 11, lineHeight: 15 },
}));

export default withScreenBoundary(LogbookScreen, "logbook");

import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import { resolveInitialAtlasCategory } from "@/engine/atlasDeepLink";
import {
  CATEGORY_LABELS,
  countUnlocked,
  evaluateFirsts,
  groupByCategory,
  type FirstCategory,
  type FirstStatus,
} from "@/engine/firsts";

const getRarityColors = (Colors: ThemePalette): Record<NonNullable<FirstStatus["def"]["rarity"]>, string> => ({
  common: Colors.muted,
  uncommon: "#4CAF50",
  rare: "#2196F3",
  legendary: "#FF9800",
});

function FirstsScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGame();
  const params = useLocalSearchParams<{ cat?: string }>();
  // Allow deep-link entry (e.g. from the atlas survey unlock popup) to land
  // on a specific category filter. Validated against the known categories so
  // a stale or malformed param falls back to "all".
  const initialCat = useMemo<FirstCategory | "all">(
    () => resolveInitialAtlasCategory(params.cat),
    [params.cat]
  );
  const [selectedCat, setSelectedCat] = useState<FirstCategory | "all">(initialCat);
  const filterScrollRef = useHorizontalWheelScroll();
  useEffect(() => {
    setSelectedCat(initialCat);
  }, [initialCat]);
  const [showLocked, setShowLocked] = useState(true);

  const statuses = useMemo(() => evaluateFirsts(state), [state]);
  const grouped = useMemo(() => groupByCategory(statuses), [statuses]);
  const total = useMemo(() => countUnlocked(state), [state]);

  const categories = Object.keys(CATEGORY_LABELS) as FirstCategory[];

  const visibleEntries = useMemo(() => {
    const entries: FirstStatus[] = selectedCat === "all"
      ? statuses
      : grouped[selectedCat] ?? [];
    return showLocked ? entries : entries.filter((e) => e.unlocked);
  }, [selectedCat, statuses, grouped, showLocked]);

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <Text style={s.headerTitle}>TROPHY WALL — FIRSTS</Text>
      </View>

      <View style={s.summaryRow}>
        <SummaryPill label="UNLOCKED" value={total.unlocked} />
        <SummaryPill label="TOTAL" value={total.total} />
        <SummaryPill label="PCT" value={`${Math.floor((total.unlocked / Math.max(1, total.total)) * 100)}%`} />
      </View>

      <ScrollView
        ref={filterScrollRef}
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === "web"}
        style={s.filterScroll}
        contentContainerStyle={s.filterRow}
      >
        <FilterChip label="ALL" active={selectedCat === "all"} onPress={() => setSelectedCat("all")} />
        {categories.map((cat) => {
          const bucket = grouped[cat];
          const count = bucket.filter((b) => b.unlocked).length;
          return (
            <FilterChip
              key={cat}
              label={`${CATEGORY_LABELS[cat]} ${count}/${bucket.length}`}
              active={selectedCat === cat}
              onPress={() => setSelectedCat(cat)}
            />
          );
        })}
      </ScrollView>

      <View style={s.toggleRow}>
        <Pressable onPress={() => setShowLocked((v) => !v)} style={s.togglePill}>
          <Feather name={showLocked ? "eye" : "eye-off"} size={11} color={Colors.accent} />
          <Text style={s.toggleText}>{showLocked ? "SHOWING LOCKED" : "UNLOCKED ONLY"}</Text>
        </Pressable>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {visibleEntries.length === 0 && (
          <View style={s.empty}>
            <Feather name="award" size={32} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>NO FIRSTS YET</Text>
            <Text style={s.emptyBody}>
              Decisions, contracts, arrests, discoveries — every first leaves a mark on this wall.
            </Text>
          </View>
        )}
        {selectedCat !== "all" && visibleEntries.length > 0 && (
          <SectionHeader title={CATEGORY_LABELS[selectedCat]} subtitle={`${visibleEntries.filter((e) => e.unlocked).length} of ${visibleEntries.length}`} />
        )}
        {visibleEntries.map((entry) => (
          <FirstCard key={entry.def.id} entry={entry} />
        ))}
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

function FirstCard({ entry }: { entry: FirstStatus }) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const rarityColor = entry.def.rarity ? getRarityColors(Colors)[entry.def.rarity] : Colors.muted;
  const accent = entry.unlocked ? Colors.accent : Colors.textMuted;
  return (
    <View style={[s.card, { borderLeftColor: entry.unlocked ? rarityColor : Colors.border, opacity: entry.unlocked ? 1 : 0.55 }]}>
      <View style={s.cardLeft}>
        <View style={[s.iconBox, { borderColor: rarityColor + "60" }]}>
          <Feather name={entry.def.icon as any} size={16} color={accent} />
        </View>
      </View>
      <View style={s.cardBody}>
        <Text style={[s.cardTitle, { color: entry.unlocked ? Colors.text : Colors.textSecondary }]} numberOfLines={1}>
          {entry.def.title}
        </Text>
        <Text style={s.cardDescription} numberOfLines={3}>
          {entry.def.description}
        </Text>
        <View style={s.cardMetaRow}>
          {!!entry.def.rarity && (
            <Text style={[s.rarityText, { color: rarityColor }]}>
              {entry.def.rarity.toUpperCase()}
            </Text>
          )}
          <Text style={s.statusText}>
            {entry.unlocked ? "UNLOCKED" : "LOCKED"}
          </Text>
        </View>
      </View>
      {entry.unlocked && <Feather name="check-circle" size={14} color={Colors.accent} />}
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
    paddingVertical: 8,
    alignItems: "center",
  },
  pillValue: {
    color: Colors.accent,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 16,
    fontWeight: "700",
  },
  pillLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
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
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 80, gap: 8 },
  empty: { alignItems: "center", padding: 32, gap: 12 },
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
    width: 32, height: 32, borderRadius: 4,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.bgElevated,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  cardDescription: { color: Colors.textSecondary, fontSize: 11, lineHeight: 15 },
  cardMetaRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  rarityText: {
    fontSize: 9, letterSpacing: 1.2, fontWeight: "700",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  statusText: {
    color: Colors.textMuted, fontSize: 9, letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
}));

export default withScreenBoundary(FirstsScreen, "firsts");

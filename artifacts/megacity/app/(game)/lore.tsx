import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
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
import { useGame } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  LORE_ENTRIES,
  type LoreCategory,
  type LoreRarity,
  type LoreEntry,
} from "@/engine/loreData";

const RARITY_COLORS: Record<LoreRarity, string> = {
  common: "#AAAAAA",
  uncommon: "#4CAF50",
  rare: "#2196F3",
  legendary: "#FF9800",
};

const CATEGORY_LABELS: Record<LoreCategory, string> = {
  "pre-war": "PRE-WAR ERA",
  "city-history": "CITY HISTORY",
  "faction-intel": "FACTION INTEL",
  wasteland: "WASTELAND",
  science: "SCIENCE & TECH",
  personal: "PERSONAL",
  classified: "CLASSIFIED",
  mythology: "MYTHOLOGY",
};

const ITEM_TYPE_ICONS: Record<string, string> = {
  "data-disk": "hard-drive",
  journal: "book-open",
  book: "book",
  "classified-file": "file-text",
  "audio-log": "mic",
  photograph: "image",
  blueprint: "layout",
  "artifact-note": "tag",
  "intercepted-transmission": "radio",
  "graffiti-rubbing": "edit-3",
  manifesto: "file",
  "medical-report": "activity",
  "engineering-schematic": "tool",
  letter: "mail",
};

type FilterCategory = "all" | LoreCategory;

function LoreScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGame();
  const discovered = state.discoveredLore ?? [];

  const [selectedEntry, setSelectedEntry] = useState<LoreEntry | null>(null);
  const [filter, setFilter] = useState<FilterCategory>("all");
  const filterScrollRef = useHorizontalWheelScroll();

  const discoveredEntries = useMemo(() => {
    return LORE_ENTRIES.filter((e) => discovered.includes(e.id));
  }, [discovered]);

  const filteredEntries = useMemo(() => {
    if (filter === "all") return discoveredEntries;
    return discoveredEntries.filter((e) => e.category === filter);
  }, [discoveredEntries, filter]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, { found: number; total: number }> = {};
    for (const cat of Object.keys(CATEGORY_LABELS) as LoreCategory[]) {
      const total = LORE_ENTRIES.filter((e) => e.category === cat).length;
      const found = discoveredEntries.filter((e) => e.category === cat).length;
      if (total > 0) stats[cat] = { found, total };
    }
    return stats;
  }, [discoveredEntries]);

  const rarityStats = useMemo(() => {
    const counts: Record<LoreRarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    for (const e of discoveredEntries) counts[e.rarity]++;
    return counts;
  }, [discoveredEntries]);

  if (selectedEntry) {
    return (
      <View style={[s.root, { paddingTop: topInset }]}>
        <View style={s.header}>
          <Pressable onPress={() => setSelectedEntry(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to archive list">
            <Feather name="arrow-left" size={18} color={Colors.accent} />
          </Pressable>
          <Text style={s.headerTitle} numberOfLines={1}>SURVEY RECORD</Text>
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={s.entryContent} showsVerticalScrollIndicator={false}>
          <View style={s.entryMeta}>
            <View style={[s.rarityBadge, { borderColor: RARITY_COLORS[selectedEntry.rarity] + "60" }]}>
              <Text style={[s.rarityText, { color: RARITY_COLORS[selectedEntry.rarity] }]}>
                {selectedEntry.rarity.toUpperCase()}
              </Text>
            </View>
            <View style={s.typeBadge}>
              <Feather name={ITEM_TYPE_ICONS[selectedEntry.itemType] as any ?? "file"} size={10} color={Colors.textMuted} />
              <Text style={s.typeText}>{selectedEntry.itemType.replace(/-/g, " ").toUpperCase()}</Text>
            </View>
            <View style={s.typeBadge}>
              <Text style={s.typeText}>{CATEGORY_LABELS[selectedEntry.category]}</Text>
            </View>
          </View>

          <Text style={s.entryTitle}>{selectedEntry.title}</Text>
          <Text style={s.entryAuthor}>SOURCE: {selectedEntry.author}</Text>

          <View style={s.divider} />

          <Text style={s.metadataLabel}>RECOVERED FROM</Text>
          <View style={s.zoneRow}>
            {selectedEntry.zoneTypes.map((zone) => (
              <View key={zone} style={s.zoneChip}>
                <Text style={s.zoneText}>{zone.replace(/-/g, " ").toUpperCase()}</Text>
              </View>
            ))}
          </View>
          <Text style={s.recordStatus}>STATUS: DISCOVERED</Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <MaterialCommunityIcons name="script-text-outline" size={18} color={Colors.accent} />
        <Text style={s.headerTitle}>SURVEY RECORDS</Text>
        <Text style={s.headerCount}>{discoveredEntries.length}/{LORE_ENTRIES.length}</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.statsRow}>
          {(["common", "uncommon", "rare", "legendary"] as LoreRarity[]).map((r) => (
            <View key={r} style={[s.statBox, { borderColor: RARITY_COLORS[r] + "30" }]}>
              <Text style={[s.statNumber, { color: RARITY_COLORS[r] }]}>{rarityStats[r]}</Text>
              <Text style={s.statLabel}>{r.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={s.filterBar} contentContainerStyle={s.filterContent}>
          <Pressable
            style={[s.filterChip, filter === "all" && s.filterChipActive]}
            onPress={() => setFilter("all")}
          >
            <Text style={[s.filterText, filter === "all" && s.filterTextActive]}>ALL</Text>
          </Pressable>
          {(Object.keys(CATEGORY_LABELS) as LoreCategory[]).map((cat) => {
            const st = categoryStats[cat];
            if (!st) return null;
            return (
              <Pressable
                key={cat}
                style={[s.filterChip, filter === cat && s.filterChipActive]}
                onPress={() => setFilter(cat)}
              >
                <Text style={[s.filterText, filter === cat && s.filterTextActive]}>
                  {CATEGORY_LABELS[cat]} ({st.found})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredEntries.length === 0 ? (
          <View style={s.empty}>
            <MaterialCommunityIcons name="book-open-blank-variant" size={32} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>NO ENTRIES FOUND</Text>
            <Text style={s.emptyText}>
              {discoveredEntries.length === 0
                ? "Run scavenging expeditions to recover survey records. Source zones determine available records."
                : "No entries match this filter."}
            </Text>
          </View>
        ) : (
          filteredEntries.map((entry) => (
            <Pressable
              key={entry.id}
              style={({ pressed }) => [s.loreItem, pressed && s.pressed]}
              onPress={() => setSelectedEntry(entry)}
            >
              <View style={[s.loreIcon, { borderColor: RARITY_COLORS[entry.rarity] + "40" }]}>
                <Feather
                  name={ITEM_TYPE_ICONS[entry.itemType] as any ?? "file"}
                  size={14}
                  color={RARITY_COLORS[entry.rarity]}
                />
              </View>
              <View style={s.loreInfo}>
                <Text style={s.loreTitle} numberOfLines={1}>{entry.title}</Text>
                <View style={s.loreSubRow}>
                  <Text style={[s.loreRarity, { color: RARITY_COLORS[entry.rarity] }]}>
                    {entry.rarity.toUpperCase()}
                  </Text>
                  <Text style={s.loreSep}>{"\u2022"}</Text>
                  <Text style={s.loreCat}>{CATEGORY_LABELS[entry.category]}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={14} color={Colors.textMuted} />
            </Pressable>
          ))
        )}

        {discoveredEntries.length > 0 && discoveredEntries.length < LORE_ENTRIES.length && (
          <View style={s.progressBox}>
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${(discoveredEntries.length / LORE_ENTRIES.length) * 100}%` }]} />
            </View>
            <Text style={s.progressText}>
              {discoveredEntries.length} / {LORE_ENTRIES.length} SURVEY RECORDS RECOVERED ({Math.floor((discoveredEntries.length / LORE_ENTRIES.length) * 100)}%)
            </Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
    flex: 1,
  },
  headerCount: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  entryContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },

  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderRadius: 4,
  },
  statNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: 1,
  },
  statLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 7,
    letterSpacing: 1.5,
    marginTop: 2,
  },

  filterBar: {
    marginBottom: 12,
    maxHeight: 36,
  },
  filterContent: {
    gap: 6,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  filterChipActive: {
    borderColor: Colors.accent + "60",
    backgroundColor: Colors.accent + "15",
  },
  filterText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
  },
  filterTextActive: {
    color: Colors.accent,
  },

  loreItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 12,
    marginBottom: 6,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: Colors.accent + "10",
  },
  loreIcon: {
    width: 34,
    height: 34,
    borderRadius: 4,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loreInfo: {
    flex: 1,
  },
  loreTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  loreSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  loreRarity: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  loreSep: {
    color: Colors.textMuted,
    fontSize: 6,
  },
  loreCat: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 0.5,
  },

  entryMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  rarityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1,
    backgroundColor: Colors.bgCard,
  },
  rarityText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  typeText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    letterSpacing: 1,
  },
  entryTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  entryAuthor: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.accent + "20",
    marginBottom: 16,
  },
  metadataLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.4,
    marginBottom: 7,
  },
  zoneRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  zoneChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: Colors.bgCard,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 3,
  },
  zoneText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
  },
  recordStatus: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 16,
  },

  empty: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18,
  },

  progressBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.bg,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  progressText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1.5,
    textAlign: "center",
  },
}));

export default withScreenBoundary(LoreScreen, "lore");

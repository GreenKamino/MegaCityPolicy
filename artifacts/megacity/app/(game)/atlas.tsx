import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
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

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import TutorialHint from "@/components/TutorialHint";
import { useGame, useGameActions } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { useAtlasUnlock } from "@/context/AtlasUnlockContext";
import { applyAtlasCategoryRewards } from "@/engine/atlasCategoryRewards";
import {
  CANYON_MARKS,
  CLIFF_EDGES,
  COAST_SEGMENTS,
  DRIED_RIVERS,
  DUNE_FIELDS,
  MOUNTAIN_RANGES,
  PLATEAU_MARKS,
  SCATTER_DOTS,
  TERRAIN_ZONES,
  WATER_BODIES,
} from "@/engine/worldMapData";

type TerrainCategory =
  | "zone"
  | "mountain"
  | "water"
  | "coast"
  | "canyon"
  | "plateau"
  | "river"
  | "dune"
  | "scatter"
  | "cliff";

type TerrainEntry = {
  id: string;
  name: string;
  category: TerrainCategory;
};

const CATEGORY_LABELS: Record<TerrainCategory, string> = {
  zone: "ZONES",
  mountain: "RANGES",
  water: "WATERS",
  coast: "COASTS",
  canyon: "CANYONS",
  plateau: "PLATEAUS",
  river: "DEAD RIVERS",
  dune: "DUNE FIELDS",
  scatter: "SCATTER FIELDS",
  cliff: "CLIFFS",
};

const CATEGORY_ICONS: Record<TerrainCategory, string> = {
  zone: "map-marker-radius",
  mountain: "triangle",
  water: "waves",
  coast: "waves",
  canyon: "vector-triangle",
  plateau: "checkbox-blank-outline",
  river: "waves-arrow-right",
  dune: "weather-windy",
  scatter: "dots-grid",
  cliff: "vector-line",
};

// Each TerrainHotspot in worldmap.tsx tags its discovery id with a category
// prefix (e.g. `mountain-rockies`, `zone-yucatan-jungle`). The atlas must
// derive its entry ids the same way so discovered ids round-trip correctly.
type WithIdLabel = { id: string; label?: string };

function build(prefix: string, source: WithIdLabel[], category: TerrainCategory): TerrainEntry[] {
  const out: TerrainEntry[] = [];
  for (const item of source) {
    if (!item.label) continue;
    out.push({
      id: `${prefix}-${item.id}`,
      name: item.label,
      category,
    });
  }
  return out;
}

const TERRAIN_ENTRIES: TerrainEntry[] = [
  ...build("zone", TERRAIN_ZONES, "zone"),
  ...build("mountain", MOUNTAIN_RANGES, "mountain"),
  ...build("water", WATER_BODIES, "water"),
  ...build("coast", COAST_SEGMENTS, "coast"),
  ...build("canyon", CANYON_MARKS, "canyon"),
  ...build("plateau", PLATEAU_MARKS, "plateau"),
  ...build("river", DRIED_RIVERS, "river"),
  ...build("dune", DUNE_FIELDS, "dune"),
  ...build("scatter", SCATTER_DOTS, "scatter"),
  ...build("cliff", CLIFF_EDGES, "cliff"),
];

type FilterCategory = "all" | TerrainCategory;

function AtlasScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGame();
  const { setState } = useGameActions();
  const { pushUnlock: pushAtlasUnlock } = useAtlasUnlock();
  const discoveredList = state.discoveredTerrain ?? [];
  const discovered = useMemo(() => new Set(discoveredList), [discoveredList]);
  // Backfill: in case a category was completed before the rewards system
  // existed (older saves) or a discovery slipped through without going
  // through worldmap.tsx, sweep on mount/whenever discoveries change. The
  // grant function is idempotent, so this is safe to call repeatedly.
  // Compute reward delta from the current state (read via the snapshot we
  // already have from useGame()), then commit + fire the popup *after* —
  // never inside the setState updater, which React may invoke twice in
  // Strict/Concurrent mode and would double-fire the popup.
  useEffect(() => {
    const { state: next, granted, capstone } = applyAtlasCategoryRewards(state);
    if (granted.length === 0 && !capstone) return;
    setState(next);
    pushAtlasUnlock(granted, capstone);
    // `state` intentionally omitted from deps: discoveredList changing IS
    // the only meaningful trigger; subscribing to the full state object
    // would re-run this effect on every unrelated tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveredList, setState, pushAtlasUnlock]);

  const [selectedEntry, setSelectedEntry] = useState<TerrainEntry | null>(null);
  const [filter, setFilter] = useState<FilterCategory>("all");
  const filterScrollRef = useHorizontalWheelScroll();
  const [searchQuery, setSearchQuery] = useState("");

  const discoveredEntries = useMemo(
    () => TERRAIN_ENTRIES.filter((e) => discovered.has(e.id)),
    [discovered]
  );

  const filteredEntries = useMemo(() => {
    let entries = discoveredEntries;
    if (filter !== "all") {
      entries = entries.filter((e) => e.category === filter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q.length > 0) {
      entries = entries.filter((e) => e.name.toLowerCase().includes(q));
    }
    return entries;
  }, [discoveredEntries, filter, searchQuery]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, { found: number; total: number }> = {};
    for (const cat of Object.keys(CATEGORY_LABELS) as TerrainCategory[]) {
      const total = TERRAIN_ENTRIES.filter((e) => e.category === cat).length;
      const found = discoveredEntries.filter((e) => e.category === cat).length;
      if (total > 0) stats[cat] = { found, total };
    }
    return stats;
  }, [discoveredEntries]);

  if (selectedEntry) {
    return (
      <View style={[s.root, { paddingTop: topInset }]}>
        <View style={s.header}>
          <Pressable onPress={() => setSelectedEntry(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to atlas list">
            <Feather name="arrow-left" size={18} color={Colors.accent} />
          </Pressable>
          <Text style={s.headerTitle} numberOfLines={1}>WASTELAND ATLAS</Text>
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={s.entryContent} showsVerticalScrollIndicator={false}>
          <View style={s.entryMeta}>
            <View style={s.typeBadge}>
              <MaterialCommunityIcons
                name={CATEGORY_ICONS[selectedEntry.category] as any}
                size={10}
                color={Colors.textMuted}
              />
              <Text style={s.typeText}>{CATEGORY_LABELS[selectedEntry.category]}</Text>
            </View>
          </View>
          <Text style={s.entryTitle}>{selectedEntry.name}</Text>
          <Text style={s.entryAuthor}>SURVEY RECORD</Text>
          <View style={s.divider} />
          <Text style={s.entryBody}>CATEGORY: {CATEGORY_LABELS[selectedEntry.category]}</Text>
          <Text style={s.entryBody}>SURVEY ID: {selectedEntry.id.toUpperCase()}</Text>
          <Text style={s.entryBody}>STATUS: CHARTED</Text>
          <View style={s.flavorBox}>
            <Feather name="map-pin" size={12} color={Colors.textMuted} />
            <Text style={s.flavorText}>
              Inspect additional world-map terrain to expand survey coverage and unlock category rewards.
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <MaterialCommunityIcons name="map-outline" size={18} color={Colors.accent} />
        <Text style={s.headerTitle}>ATLAS — WASTELAND TERRAIN</Text>
        <Text style={s.headerCount}>{discoveredEntries.length}/{TERRAIN_ENTRIES.length}</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TutorialHint
          id="atlas_intro"
          message="The Wasteland Atlas catalogues every range, water, coast, canyon, plateau, dead river, dune field, scatter field, cliff, and zone you have inspected on the world map. Tap a terrain feature there to chart it. Completing a category awards XP and a Trophy Wall first; charting every category unlocks a unique commander title."
        />
        {discoveredEntries.length > 0 && (
          <View style={s.searchContainer}>
            <Feather name="search" size={14} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search atlas..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              accessibilityLabel="Search atlas entries"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <Feather name="x" size={14} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
        )}
        <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={s.filterBar} contentContainerStyle={s.filterContent}>
          <Pressable
            style={[s.filterChip, filter === "all" && s.filterChipActive]}
            onPress={() => setFilter("all")}
          >
            <Text style={[s.filterText, filter === "all" && s.filterTextActive]}>ALL</Text>
          </Pressable>
          {(Object.keys(CATEGORY_LABELS) as TerrainCategory[]).map((cat) => {
            const st = categoryStats[cat];
            if (!st) return null;
            const complete = st.found >= st.total;
            return (
              <Pressable
                key={cat}
                style={[
                  s.filterChip,
                  filter === cat && s.filterChipActive,
                  complete && s.filterChipComplete,
                ]}
                onPress={() => setFilter(cat)}
              >
                <Text
                  style={[
                    s.filterText,
                    filter === cat && s.filterTextActive,
                    complete && s.filterTextComplete,
                  ]}
                >
                  {CATEGORY_LABELS[cat]} ({st.found}/{st.total})
                </Text>
                {complete && (
                  <View style={s.completeBadge}>
                    <Feather name="check" size={8} color={Colors.bg} />
                    <Text style={s.completeBadgeText}>COMPLETE</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredEntries.length === 0 ? (
          <View style={s.empty}>
            <MaterialCommunityIcons name="map-search-outline" size={32} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>NO ENTRIES CHARTED</Text>
            <Text style={s.emptyText}>
              {discoveredEntries.length === 0
                ? "Open the world map and tap any landform — coasts, ranges, dunes, craters, dead rivers — to add it to the atlas. On desktop, hover the feature."
                : searchQuery.trim().length > 0
                ? `No entries match "${searchQuery.trim()}".`
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
              <View style={s.loreIcon}>
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[entry.category] as any}
                  size={14}
                  color={Colors.accent}
                />
              </View>
              <View style={s.loreInfo}>
                <Text style={s.loreTitle} numberOfLines={1}>{entry.name}</Text>
                <View style={s.loreSubRow}>
                  <Text style={s.loreCat}>{CATEGORY_LABELS[entry.category]}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={14} color={Colors.textMuted} />
            </Pressable>
          ))
        )}

        {discoveredEntries.length > 0 && discoveredEntries.length < TERRAIN_ENTRIES.length && (
          <View style={s.progressBox}>
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${(discoveredEntries.length / TERRAIN_ENTRIES.length) * 100}%` }]} />
            </View>
            <Text style={s.progressText}>
              {discoveredEntries.length} / {TERRAIN_ENTRIES.length} FEATURES CHARTED ({Math.floor((discoveredEntries.length / TERRAIN_ENTRIES.length) * 100)}%)
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
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },
  entryContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    padding: 0,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  filterChipComplete: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "20",
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
  filterTextComplete: {
    color: Colors.accent,
  },
  completeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
  completeBadgeText: {
    color: Colors.bg,
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 0.8,
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
    borderColor: Colors.accent + "40",
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
  entryBody: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  flavorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 20,
    padding: 12,
    backgroundColor: Colors.accent + "08",
    borderLeftWidth: 2,
    borderLeftColor: Colors.accent + "30",
    borderRadius: 4,
  },
  flavorText: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    fontStyle: "italic",
    flex: 1,
    lineHeight: 18,
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

export default withScreenBoundary(AtlasScreen, "atlas");

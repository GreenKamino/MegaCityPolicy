import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
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

import EmptyState from "@/components/EmptyState";
import SectionHeader from "@/components/SectionHeader";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  CRIMINAL_STATUS_LABELS,
  CRIMINAL_STATUS_ORDER,
  filterCriminals,
  listCriminals,
  summarizeCriminals,
  type CriminalEntry,
  type CriminalStatus,
} from "@/engine/criminals";
import { getCharacterRoleLabel } from "@/engine/namedCharacters";

const getStatusColors = (Colors: ThemePalette): Record<CriminalStatus, string> => ({
  wanted: Colors.warning,
  fugitive: Colors.danger,
  detained: Colors.info,
  probation: Colors.accent,
  missing: Colors.textSecondary,
  executed: Colors.textMuted,
});

const STATUS_ICONS: Record<
  CriminalStatus,
  { name: string; set: "feather" | "mci" }
> = {
  wanted: { name: "alert-triangle", set: "feather" },
  fugitive: { name: "run-fast", set: "mci" },
  detained: { name: "lock", set: "feather" },
  probation: { name: "clipboard-check-outline", set: "mci" },
  missing: { name: "help-circle", set: "feather" },
  executed: { name: "skull", set: "mci" },
};

function CriminalsScreen() {
  const { colors: Colors } = useTheme();
  const STATUS_COLORS = getStatusColors(Colors);
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGame();
  const [activeStatus, setActiveStatus] = useState<CriminalStatus | "all">("all");
  const filterScrollRef = useHorizontalWheelScroll();
  const [query, setQuery] = useState("");

  const allEntries = useMemo(() => listCriminals(state), [state]);
  const totals = useMemo(() => summarizeCriminals(allEntries), [allEntries]);
  const visible = useMemo(
    () => filterCriminals(allEntries, { status: activeStatus, query }),
    [allEntries, activeStatus, query],
  );

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <Text style={s.headerTitle}>CRIMINAL REGISTRY</Text>
      </View>

      <View style={s.summaryRow}>
        <SummaryPill label="ON FILE" value={totals.total} />
        <SummaryPill label="WANTED" value={totals.wanted} />
        <SummaryPill label="HELD" value={totals.detained} />
        <SummaryPill label="LOOSE" value={totals.fugitive} />
      </View>

      <View style={s.searchRow}>
        <Feather name="search" size={12} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="SEARCH NAME, ROLE, LOCATION, RAP SHEET"
          placeholderTextColor={Colors.textMuted}
          style={s.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search criminals by name, role, or location"
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
        <FilterChip
          label={`ALL ${totals.total}`}
          active={activeStatus === "all"}
          onPress={() => setActiveStatus("all")}
        />
        {CRIMINAL_STATUS_ORDER.map((st) => (
          <FilterChip
            key={st}
            label={`${CRIMINAL_STATUS_LABELS[st]} ${totals[st]}`}
            active={activeStatus === st}
            onPress={() => setActiveStatus(st)}
            tint={STATUS_COLORS[st]}
          />
        ))}
      </ScrollView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {visible.length === 0 && (
          <EmptyState
            icon="shield-off"
            title={
              allEntries.length === 0
                ? "NO CRIMINAL ACTIVITY ON FILE"
                : "NO MATCHES"
            }
            message={
              allEntries.length === 0
                ? "Named criminals appear here as they surface in raids, sweeps, and intel reports."
                : "Adjust the status chip or search query to see entries."
            }
          />
        )}
        {visible.length > 0 && (
          <SectionHeader
            title="REGISTRY"
            subtitle={`${visible.length} of ${allEntries.length} on file`}
          />
        )}
        {visible.map((entry) => (
          <CriminalCard key={entry.npc.id} entry={entry} />
        ))}
      </ScrollView>
    </View>
  );
}

function CriminalCard({ entry }: { entry: CriminalEntry }) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const { npc, criminalStatus, rapSheet, lastKnownLocation } = entry;
  const tint = getStatusColors(Colors)[criminalStatus];
  const icon = STATUS_ICONS[criminalStatus];
  const visibleRap = rapSheet.slice(-3).reverse();
  const hasMore = rapSheet.length > 3;

  return (
    <View style={[s.card, { borderLeftColor: tint }]}>
      <View style={s.cardHeader}>
        <View style={s.cardTitleBlock}>
          <Text style={s.cardName} numberOfLines={1}>
            {npc.name.toUpperCase()}
          </Text>
          <Text style={s.cardRole} numberOfLines={1}>
            {getCharacterRoleLabel(npc.role).toUpperCase()}
          </Text>
        </View>
        <View style={[s.statusBadge, { borderColor: tint }]}>
          {icon.set === "feather" ? (
            <Feather name={icon.name as any} size={10} color={tint} />
          ) : (
            <MaterialCommunityIcons name={icon.name as any} size={10} color={tint} />
          )}
          <Text style={[s.statusBadgeText, { color: tint }]}>
            {CRIMINAL_STATUS_LABELS[criminalStatus]}
          </Text>
        </View>
      </View>

      <View style={s.metaRow}>
        <View style={s.metaItem}>
          <Feather name="map-pin" size={10} color={Colors.textMuted} />
          <Text style={s.metaText} numberOfLines={1}>
            {lastKnownLocation.toUpperCase()}
          </Text>
        </View>
        <View style={s.metaItem}>
          <Feather name="activity" size={10} color={Colors.textMuted} />
          <Text style={s.metaText}>NOTORIETY {Math.round(npc.notoriety)}</Text>
        </View>
        <View style={s.metaItem}>
          <Feather name="clock" size={10} color={Colors.textMuted} />
          <Text style={s.metaText}>LAST {npc.lastSeenYear}</Text>
        </View>
      </View>

      {rapSheet.length > 0 && (
        <View style={s.rapHeader}>
          <Text style={s.rapLabel}>
            RAP SHEET{hasMore ? ` (${rapSheet.length})` : ""}
          </Text>
        </View>
      )}
      {visibleRap.map((e, i) => (
        <View key={`rap-${npc.id}-${i}`} style={s.rapRow}>
          <Text style={s.rapText}>
            <Text style={s.rapYear}>{e.year}  </Text>
            {e.text}
          </Text>
        </View>
      ))}
      {hasMore && (
        <Text style={s.rapMore}>
          +{rapSheet.length - 3} earlier entries on record
        </Text>
      )}
      {rapSheet.length === 0 && (
        <Text style={s.rapEmpty}>NO PRIOR OFFENSES ON RECORD.</Text>
      )}
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

function FilterChip({
  label,
  active,
  onPress,
  tint,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tint?: string;
}) {
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.filterChip,
        active && s.filterChipActive,
        active && tint ? { borderColor: tint } : null,
      ]}
    >
      <Text style={[s.filterText, active && s.filterTextActive, active && tint ? { color: tint } : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

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
    fontFamily: MONO,
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
    fontFamily: MONO,
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
    fontFamily: MONO,
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
    fontFamily: MONO,
  },
  filterTextActive: { color: Colors.accent },
  scroll: { flex: 1, marginTop: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitleBlock: { flex: 1, gap: 2 },
  cardName: {
    color: Colors.text,
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cardRole: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: MONO,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: MONO,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: MONO,
  },
  rapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    borderTopWidth: 1,
    borderColor: Colors.border,
    marginTop: 2,
  },
  rapLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.2,
    fontFamily: MONO,
  },
  rapRow: { paddingVertical: 2 },
  rapText: {
    color: Colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  rapYear: {
    color: Colors.accent,
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: "700",
  },
  rapMore: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: MONO,
    fontStyle: "italic",
  },
  rapEmpty: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: MONO,
    fontStyle: "italic",
  },
}));

export default withScreenBoundary(CriminalsScreen, "criminals");

import { Feather } from "@expo/vector-icons";
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
import { useThrottledValue } from "@/hooks/useThrottledValue";
import type { StatSnapshot } from "@/engine/statHistory";

type StatKey = keyof Omit<StatSnapshot, "tick">;

const getStatConfigs = (Colors: ThemePalette): { key: StatKey; label: string; color: string; format?: (v: number) => string }[] => ([
  { key: "population", label: "Population", color: "#4FC3F7", format: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v) },
  { key: "credits", label: "Credits", color: Colors.accent, format: (v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v) },
  { key: "happiness", label: "Happiness", color: "#66BB6A" },
  { key: "crime", label: "Crime", color: "#EF5350" },
  { key: "unrest", label: "Unrest", color: "#FF7043" },
  { key: "employment", label: "Employment", color: "#42A5F5" },
  { key: "health", label: "Health", color: "#AB47BC" },
  { key: "lawOrder", label: "Law & Order", color: "#5C6BC0" },
  { key: "corruption", label: "Corruption", color: "#FFA726" },
  { key: "defenseRating", label: "Defense", color: "#78909C" },
  { key: "infrastructureHealth", label: "Infrastructure", color: "#8D6E63" },
  { key: "food", label: "Food Supply", color: "#9CCC65" },
  { key: "water", label: "Water Supply", color: "#29B6F6" },
  { key: "power", label: "Power Supply", color: "#FFEE58" },
]);

function Sparkline({ data, color, width, height }: { data: number[]; color: string; width: number; height: number }) {
  const styles = useStyles();
  if (data.length < 2) {
    return (
      <View style={[{ width, height }, styles.sparklineEmpty]}>
        <Text style={styles.sparklineEmptyText}>Collecting data...</Text>
      </View>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const barWidth = Math.max(1, Math.floor((width - data.length) / data.length));
  const gap = 1;

  return (
    <View style={[{ width, height }, styles.sparklineContainer]}>
      <View style={styles.sparklineBars}>
        {data.map((val, i) => {
          const normalized = (val - min) / range;
          const barHeight = Math.max(2, normalized * (height - 20));
          return (
            <View
              key={i}
              style={{
                width: barWidth,
                height: barHeight,
                backgroundColor: color + "AA",
                borderRadius: 1,
                marginRight: gap,
                alignSelf: "flex-end",
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function StatCard({ statKey, label, color, data, format }: {
  statKey: StatKey;
  label: string;
  color: string;
  data: StatSnapshot[];
  format?: (v: number) => string;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const values = useMemo(() => data.map((d) => d[statKey] as number), [data, statKey]);
  const current = values.length > 0 ? values[values.length - 1] : 0;
  const previous = values.length > 1 ? values[values.length - 2] : current;
  const trend = current - previous;
  const fmt = format ?? ((v: number) => String(Math.round(v)));

  return (
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        <View style={[styles.statDot, { backgroundColor: color }]} />
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, { color }]}>{fmt(current)}</Text>
        {trend !== 0 && (
          <View style={styles.trendBadge}>
            <Feather
              name={trend > 0 ? "trending-up" : "trending-down"}
              size={10}
              color={trend > 0 ? Colors.accent : Colors.danger}
            />
            <Text style={[styles.trendText, { color: trend > 0 ? Colors.accent : Colors.danger }]}>
              {trend > 0 ? "+" : ""}{fmt(trend)}
            </Text>
          </View>
        )}
      </View>
      <Sparkline data={values} color={color} width={280} height={50} />
      <View style={styles.statRange}>
        <Text style={styles.statRangeText}>
          Low: {fmt(values.length > 0 ? Math.min(...values) : 0)}
        </Text>
        <Text style={styles.statRangeText}>
          High: {fmt(values.length > 0 ? Math.max(...values) : 0)}
        </Text>
      </View>
    </View>
  );
}

function StatsScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state: rawState } = useGame();
  const state = useThrottledValue(rawState, 500);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const history = state.statHistory ?? [];
  const [filter, setFilter] = useState<"all" | "resources" | "city">("all");

  const STAT_CONFIGS = useMemo(() => getStatConfigs(Colors), [Colors]);
  const filtered = useMemo(() => {
    if (filter === "resources") return STAT_CONFIGS.filter((s) => ["credits", "food", "water", "power"].includes(s.key));
    if (filter === "city") return STAT_CONFIGS.filter((s) => !["credits", "food", "water", "power"].includes(s.key));
    return STAT_CONFIGS;
  }, [filter, STAT_CONFIGS]);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="bar-chart-2" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>CITY STATISTICS</Text>
        <Text style={styles.headerSub}>{history.length} data points</Text>
      </View>

      <View style={styles.filterRow}>
        {(["all", "city", "resources"] as const).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterBtnText, filter === f && styles.filterBtnTextActive]}>
              {f.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {history.length < 2 && (
          <View style={styles.emptyBanner}>
            <Feather name="clock" size={14} color={Colors.info} />
            <Text style={styles.emptyText}>
              Statistics are recorded every in-game day. Keep playing to build your city's history.
            </Text>
          </View>
        )}

        <SectionHeader
          title={filter === "resources" ? "Resource Trends" : filter === "city" ? "City Metrics" : "All Statistics"}
          icon={<Feather name="activity" size={14} color={Colors.accent} />}
        />
        {filtered.map((cfg) => (
          <StatCard
            key={cfg.key}
            statKey={cfg.key}
            label={cfg.label}
            color={cfg.color}
            data={history}
            format={cfg.format}
          />
        ))}

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
    paddingHorizontal: Platform.OS === "web" ? 12 : 20,
    paddingVertical: Platform.OS === "web" ? 8 : 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent + "33",
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5 },
  headerSub: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginLeft: "auto" },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: Platform.OS === "web" ? 12 : 20,
    paddingVertical: Platform.OS === "web" ? 6 : 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnActive: {
    backgroundColor: Colors.accent + "20",
    borderColor: Colors.accent,
  },
  filterBtnText: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1 },
  filterBtnTextActive: { color: Colors.accent },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 20, paddingTop: Platform.OS === "web" ? 8 : 16, paddingBottom: 20 },
  emptyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(100,180,255,0.1)",
    borderWidth: 1,
    borderColor: Colors.info,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  emptyText: { color: Colors.info, fontFamily: "Inter_500Medium", fontSize: 12, flex: 1, lineHeight: 18 },
  statCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 8,
    padding: Platform.OS === "web" ? 10 : 14,
    marginBottom: Platform.OS === "web" ? 8 : 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statLabel: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13, flex: 1 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 15 },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 4 },
  trendText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  sparklineContainer: {
    borderRadius: 4,
    backgroundColor: Colors.bg,
    padding: 4,
    overflow: "hidden",
  },
  sparklineBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    flex: 1,
  },
  sparklineEmpty: {
    borderRadius: 4,
    backgroundColor: Colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  sparklineEmptyText: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10 },
  statRange: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  statRangeText: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10 },
}));

export default withScreenBoundary(StatsScreen, "stats");

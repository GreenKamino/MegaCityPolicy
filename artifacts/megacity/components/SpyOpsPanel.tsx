import React, { useState, useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import SectionHeader from "@/components/SectionHeader";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { SPY_OPS, SPY_OP_CATEGORIES, type SpyOpCategory } from "@/engine/spyOps";

const CAT_ICONS: Partial<Record<SpyOpCategory, string>> = {
  reconnaissance: "eye",
  sabotage: "flash",
  assassination: "crosshairs-gps",
  counter_intel: "shield-lock",
  propaganda: "bullhorn",
  infiltration: "account-switch",
  theft: "lock-open-variant",
  cyber: "desktop-classic",
  black_ops: "skull",
  intel_gathering: "magnify",
  special_missions: "star-four-points",
  strategic: "chess-rook",
  psychological: "head-cog",
  advanced_intel: "satellite-uplink",
  extreme: "alert-octagon",
  covert_logistics: "truck-outline",
  ultra_black: "eye-off",
};

function riskColor(level: number, Colors: ThemePalette) {
  if (level >= 9) return Colors.danger;
  if (level >= 7) return Colors.warning;
  if (level >= 5) return "#FF9500";
  if (level >= 3) return "#FFD54F";
  return Colors.accent;
}

function successColor(rate: number, Colors: ThemePalette) {
  if (rate >= 80) return Colors.accent;
  if (rate >= 60) return "#4FC3F7";
  if (rate >= 40) return Colors.warning;
  return Colors.danger;
}

export default function SpyOpsPanel() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const [filter, setFilter] = useState<SpyOpCategory | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filterScrollRef = useHorizontalWheelScroll();

  const filtered = useMemo(
    () => filter === "all" ? SPY_OPS : SPY_OPS.filter(op => op.category === filter),
    [filter]
  );

  const catKeys = Object.keys(SPY_OP_CATEGORIES) as SpyOpCategory[];

  return (
    <View>
      <SectionHeader
        title="Covert Operations Catalog"
        subtitle={`${SPY_OPS.length} operations across ${catKeys.length} divisions`}
        icon={<MaterialCommunityIcons name="incognito" size={14} color="#B855FF" />}
      />

      <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={s.filterRow}>
        <Pressable onPress={() => setFilter("all")} style={[s.chip, filter === "all" && s.chipActive]}>
          <Text style={[s.chipText, filter === "all" && s.chipTextActive]}>ALL ({SPY_OPS.length})</Text>
        </Pressable>
        {catKeys.map(cat => {
          const count = SPY_OPS.filter(op => op.category === cat).length;
          if (count === 0) return null;
          return (
            <Pressable key={cat} onPress={() => setFilter(filter === cat ? "all" : cat)} style={[s.chip, filter === cat && s.chipActive]}>
              <MaterialCommunityIcons name={(CAT_ICONS[cat] ?? "help-circle") as any} size={10} color={filter === cat ? "#B855FF" : Colors.textMuted} />
              <Text style={[s.chipText, filter === cat && s.chipTextActive]}>
                {SPY_OP_CATEGORIES[cat]} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.map(op => (
        <Pressable
          key={op.id}
          onPress={() => setExpanded(expanded === op.id ? null : op.id)}
          style={[s.card, expanded === op.id && s.cardActive]}
        >
          <View style={s.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.opName}>{op.name}</Text>
              <Text style={s.opCat}>{SPY_OP_CATEGORIES[op.category]}</Text>
            </View>
            <View style={s.cardRight}>
              <Text style={s.costText}>{op.cost.toLocaleString()} CR</Text>
              <View style={s.riskRow}>
                <View style={[s.riskDot, { backgroundColor: riskColor(op.riskLevel, Colors) }]} />
                <Text style={[s.riskVal, { color: riskColor(op.riskLevel, Colors) }]}>RISK {op.riskLevel}</Text>
              </View>
            </View>
          </View>

          {expanded === op.id && (
            <View style={s.detail}>
              <Text style={s.desc}>{op.description}</Text>
              <View style={s.statRow}>
                <View style={s.stat}>
                  <Text style={s.statLabel}>COST</Text>
                  <Text style={s.statVal}>{op.cost.toLocaleString()} CR</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>RISK</Text>
                  <Text style={[s.statVal, { color: riskColor(op.riskLevel, Colors) }]}>{op.riskLevel}/10</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>DURATION</Text>
                  <Text style={s.statVal}>{op.duration} ticks</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>SUCCESS</Text>
                  <Text style={[s.statVal, { color: successColor(op.successRate, Colors) }]}>{op.successRate}%</Text>
                </View>
              </View>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  filterRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  chipActive: { borderColor: "#B855FF", backgroundColor: "rgba(184,85,255,0.06)" },
  chipText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.6 },
  chipTextActive: { color: "#B855FF" },
  card: {
    marginHorizontal: 16, marginBottom: 6, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12,
  },
  cardActive: { borderColor: "#B855FF60" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  opName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12 },
  opCat: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, marginTop: 2, letterSpacing: 0.6 },
  cardRight: { alignItems: "flex-end" },
  costText: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 12 },
  riskRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  riskDot: { width: 5, height: 5, borderRadius: 3 },
  riskVal: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.6 },
  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  desc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  statRow: { flexDirection: "row", marginTop: 10, gap: 8 },
  stat: { flex: 1 },
  statLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.6 },
  statVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, marginTop: 2 },
}));

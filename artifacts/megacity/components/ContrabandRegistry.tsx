import React, { useState, useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import SectionHeader from "@/components/SectionHeader";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { CONTRABAND, CONTRABAND_CATEGORIES, type ContrabandCategory } from "@/engine/contraband";

const CAT_ICONS: Record<ContrabandCategory, string> = {
  weapons: "pistol",
  drugs: "needle",
  tech: "chip",
  biological: "biohazard",
  military: "ammunition",
  exotic: "diamond-stone",
  criminal_economy: "cash-multiple",
  dangerous: "alert-octagon",
  rare: "star-four-points",
};

function riskColor(level: number, Colors: ThemePalette) {
  if (level >= 9) return Colors.danger;
  if (level >= 7) return Colors.warning;
  if (level >= 5) return "#FF9500";
  return Colors.textSecondary;
}

export default function ContrabandRegistry() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const [filter, setFilter] = useState<ContrabandCategory | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filterScrollRef = useHorizontalWheelScroll();

  const filtered = useMemo(
    () => filter === "all" ? CONTRABAND : CONTRABAND.filter(c => c.category === filter),
    [filter]
  );

  const catKeys = Object.keys(CONTRABAND_CATEGORIES) as ContrabandCategory[];

  return (
    <View>
      <SectionHeader
        title="Contraband Registry"
        subtitle={`${CONTRABAND.length} items catalogued across ${catKeys.length} categories`}
        icon={<MaterialCommunityIcons name="package-variant-closed" size={14} color={Colors.danger} />}
      />
      <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={s.filterRow}>
        <Pressable onPress={() => setFilter("all")} style={[s.chip, filter === "all" && s.chipActive]}>
          <Text style={[s.chipText, filter === "all" && s.chipTextActive]}>ALL ({CONTRABAND.length})</Text>
        </Pressable>
        {catKeys.map(cat => {
          const count = CONTRABAND.filter(c => c.category === cat).length;
          return (
            <Pressable key={cat} onPress={() => setFilter(filter === cat ? "all" : cat)} style={[s.chip, filter === cat && s.chipActive]}>
              <MaterialCommunityIcons name={CAT_ICONS[cat] as any} size={10} color={filter === cat ? Colors.danger : Colors.textMuted} />
              <Text style={[s.chipText, filter === cat && s.chipTextActive]}>
                {CONTRABAND_CATEGORIES[cat]} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.map(item => (
        <Pressable
          key={item.id}
          onPress={() => setExpanded(expanded === item.id ? null : item.id)}
          style={[s.card, expanded === item.id && s.cardActive]}
        >
          <View style={s.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName}>{item.name}</Text>
              <Text style={s.itemCat}>{CONTRABAND_CATEGORIES[item.category]}</Text>
            </View>
            <View style={s.cardRight}>
              <Text style={s.itemValue}>{item.baseValue.toLocaleString()} CR</Text>
              <View style={[s.riskBadge, { borderColor: riskColor(item.riskLevel, Colors) }]}>
                <Text style={[s.riskText, { color: riskColor(item.riskLevel, Colors) }]}>
                  RISK {item.riskLevel}/10
                </Text>
              </View>
            </View>
          </View>

          {expanded === item.id && (
            <View style={s.detail}>
              <Text style={s.desc}>{item.description}</Text>
              <View style={s.statRow}>
                <View style={s.stat}>
                  <Text style={s.statLabel}>BASE VALUE</Text>
                  <Text style={s.statVal}>{item.baseValue.toLocaleString()} CR</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>RISK LEVEL</Text>
                  <Text style={[s.statVal, { color: riskColor(item.riskLevel, Colors) }]}>{item.riskLevel}/10</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>PENALTY</Text>
                  <Text style={[s.statVal, { color: Colors.danger }]}>{item.penaltyIfCaught.toLocaleString()} CR</Text>
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chipActive: { borderColor: Colors.danger, backgroundColor: "rgba(255,59,48,0.08)" },
  chipText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.6 },
  chipTextActive: { color: Colors.danger },
  card: {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 12,
  },
  cardActive: { borderColor: Colors.danger + "60" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  itemName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12 },
  itemCat: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, marginTop: 2, letterSpacing: 0.6 },
  cardRight: { alignItems: "flex-end" },
  itemValue: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 12 },
  riskBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, marginTop: 3 },
  riskText: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.8 },
  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  desc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  statRow: { flexDirection: "row", marginTop: 10, gap: 12 },
  stat: { flex: 1 },
  statLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8 },
  statVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, marginTop: 2 },
}));

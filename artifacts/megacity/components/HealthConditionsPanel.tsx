import React, { useState, useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import SectionHeader from "@/components/SectionHeader";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { ILLNESSES, ILLNESS_CATEGORIES, type IllnessCategory } from "@/engine/medical";

const CAT_ICONS: Record<IllnessCategory, string> = {
  regular: "hospital-box",
  humorous: "emoticon-lol",
  megacity: "city-variant",
  mutation: "biohazard",
  radiation: "radioactive",
};

const getCatColors = (Colors: ThemePalette): Record<IllnessCategory, string> => ({
  regular: "#4FC3F7",
  humorous: "#FFD54F",
  megacity: Colors.accent,
  mutation: "#B855FF",
  radiation: "#FF6B6B",
});

const EFFECT_LABELS: Record<string, string> = {
  hospitalLoad: "Hospital Load",
  happiness: "Happiness",
  productivity: "Productivity",
  unrest: "Unrest",
  crime: "Crime",
  population: "Population",
};

export default function HealthConditionsPanel() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const CAT_COLORS = getCatColors(Colors);
  const [filter, setFilter] = useState<IllnessCategory | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filterScrollRef = useHorizontalWheelScroll();

  const filtered = useMemo(
    () => filter === "all" ? ILLNESSES : ILLNESSES.filter(i => i.category === filter),
    [filter]
  );

  const catKeys = Object.keys(ILLNESS_CATEGORIES) as IllnessCategory[];

  return (
    <View>
      <SectionHeader
        title="Medical Database"
        subtitle={`${ILLNESSES.length} conditions catalogued`}
        icon={<MaterialCommunityIcons name="medical-bag" size={14} color="#FF6B6B" />}
      />

      <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={s.filterRow}>
        <Pressable onPress={() => setFilter("all")} style={[s.chip, filter === "all" && s.chipActive]}>
          <Text style={[s.chipText, filter === "all" && s.chipTextActive]}>ALL ({ILLNESSES.length})</Text>
        </Pressable>
        {catKeys.map(cat => {
          const count = ILLNESSES.filter(i => i.category === cat).length;
          return (
            <Pressable key={cat} onPress={() => setFilter(filter === cat ? "all" : cat)} style={[s.chip, filter === cat && s.chipActive]}>
              <MaterialCommunityIcons name={CAT_ICONS[cat] as any} size={10} color={filter === cat ? CAT_COLORS[cat] : Colors.textMuted} />
              <Text style={[s.chipText, filter === cat && { color: CAT_COLORS[cat] }]}>
                {ILLNESS_CATEGORIES[cat]} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.map(illness => (
        <Pressable
          key={illness.id}
          onPress={() => setExpanded(expanded === illness.id ? null : illness.id)}
          style={[s.card, expanded === illness.id && s.cardActive]}
        >
          <View style={s.cardTop}>
            <View style={{ flex: 1 }}>
              <View style={s.nameRow}>
                <MaterialCommunityIcons name={CAT_ICONS[illness.category] as any} size={12} color={CAT_COLORS[illness.category]} />
                <Text style={s.illnessName}>{illness.name}</Text>
              </View>
              <Text style={s.illnessCat}>{ILLNESS_CATEGORIES[illness.category]}</Text>
            </View>
            <View style={s.effectPills}>
              {Object.entries(illness.effects).map(([key, val]) => {
                if (!val) return null;
                const isNeg = key === "hospitalLoad" ? val > 0 : val < 0;
                return (
                  <View key={key} style={[s.effectPill, { borderColor: isNeg ? Colors.danger + "60" : Colors.accent + "60" }]}>
                    <Text style={[s.effectPillText, { color: isNeg ? Colors.danger : Colors.accent }]}>
                      {EFFECT_LABELS[key] ?? key} {val > 0 ? `+${val}` : val}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {expanded === illness.id && (
            <View style={s.detail}>
              <Text style={s.desc}>{illness.description}</Text>

              <Text style={s.subHeader}>MEDICATIONS</Text>
              {illness.medications.map((med, i) => (
                <View key={i} style={s.listItem}>
                  <MaterialCommunityIcons name="pill" size={10} color="#4FC3F7" />
                  <Text style={s.listText}>{med}</Text>
                </View>
              ))}

              <Text style={s.subHeader}>PRODUCTION CHAIN</Text>
              {illness.productionChain.map((step, i) => (
                <View key={i} style={s.listItem}>
                  <Text style={s.stepNum}>{i + 1}.</Text>
                  <Text style={s.listText}>{step}</Text>
                </View>
              ))}

              <Text style={s.subHeader}>RESEARCH CHAIN</Text>
              {illness.researchChain.map((step, i) => (
                <View key={i} style={s.listItem}>
                  <MaterialCommunityIcons name="flask" size={10} color={Colors.accent} />
                  <Text style={s.listText}>{step}</Text>
                </View>
              ))}

              {illness.events.length > 0 && (
                <>
                  <Text style={s.subHeader}>TRIGGERED EVENTS</Text>
                  {illness.events.map((evt, i) => (
                    <View key={i} style={s.listItem}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={10} color={Colors.warning} />
                      <Text style={s.listText}>{evt}</Text>
                    </View>
                  ))}
                </>
              )}
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
  chipActive: { borderColor: "#FF6B6B", backgroundColor: "rgba(255,107,107,0.06)" },
  chipText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.6 },
  chipTextActive: { color: "#FF6B6B" },
  card: {
    marginHorizontal: 16, marginBottom: 6, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12,
  },
  cardActive: { borderColor: "#FF6B6B60" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  illnessName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12 },
  illnessCat: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, marginTop: 2, letterSpacing: 0.6, marginLeft: 18 },
  effectPills: { flexDirection: "row", flexWrap: "wrap", gap: 3, maxWidth: 140, justifyContent: "flex-end" },
  effectPill: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  effectPillText: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.4 },
  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  desc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  subHeader: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  listItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  listText: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 11 },
  stepNum: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10, width: 14 },
}));

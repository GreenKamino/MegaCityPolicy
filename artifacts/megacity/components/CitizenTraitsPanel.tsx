import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import SectionHeader from "@/components/SectionHeader";
import { CITIZEN_TRAITS } from "@/engine/traits";

const getEffectLabels = (Colors: ThemePalette): Record<string, { label: string; color: string }> => ({
  productivity: { label: "PROD", color: "#4FC3F7" },
  crime: { label: "CRIME", color: Colors.danger },
  happiness: { label: "HAPPY", color: "#66BB6A" },
  loyalty: { label: "LOYAL", color: Colors.accent },
  unrest: { label: "UNREST", color: Colors.warning },
  corruption: { label: "CORRUPT", color: "#FF9500" },
});

export default function CitizenTraitsPanel() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const EFFECT_LABELS = getEffectLabels(Colors);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <View>
      <SectionHeader
        title="Citizen Trait Database"
        subtitle={`${CITIZEN_TRAITS.length} behavioral profiles catalogued`}
        icon={<MaterialCommunityIcons name="account-details" size={14} color="#B855FF" />}
      />

      <View style={s.grid}>
        {CITIZEN_TRAITS.map(trait => {
          const isOpen = expanded === trait.id;
          const positiveEffects = Object.entries(trait.effects).filter(([k, v]) => {
            if (k === "crime" || k === "unrest" || k === "corruption") return (v ?? 0) < 0;
            return (v ?? 0) > 0;
          });
          const negativeEffects = Object.entries(trait.effects).filter(([k, v]) => {
            if (k === "crime" || k === "unrest" || k === "corruption") return (v ?? 0) > 0;
            return (v ?? 0) < 0;
          });
          const isPositive = positiveEffects.length >= negativeEffects.length;

          return (
            <Pressable
              key={trait.id}
              onPress={() => setExpanded(isOpen ? null : trait.id)}
              style={[s.card, isOpen && s.cardActive]}
            >
              <View style={s.cardTop}>
                <View style={[s.pip, { backgroundColor: isPositive ? Colors.accent + "40" : Colors.danger + "40" }]} />
                <Text style={s.traitName}>{trait.name}</Text>
              </View>

              <View style={s.effectRow}>
                {Object.entries(trait.effects).map(([key, val]) => {
                  if (!val) return null;
                  const cfg = EFFECT_LABELS[key];
                  if (!cfg) return null;
                  const isGood = (key === "crime" || key === "unrest" || key === "corruption") ? val < 0 : val > 0;
                  return (
                    <View key={key} style={s.effectChip}>
                      <Text style={[s.effectLabel, { color: isGood ? Colors.accent : Colors.danger }]}>
                        {cfg.label} {val > 0 ? `+${val}` : val}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {isOpen && (
                <View style={s.detail}>
                  <Text style={s.desc}>{trait.description}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  grid: { paddingHorizontal: 16 },
  card: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, padding: 10, marginBottom: 4,
  },
  cardActive: { borderColor: "#B855FF60" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  pip: { width: 6, height: 6, borderRadius: 3 },
  traitName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11 },
  effectRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  effectChip: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
  },
  effectLabel: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.4 },
  detail: { marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
  desc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15 },
}));

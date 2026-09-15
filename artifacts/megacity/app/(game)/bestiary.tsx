import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { withScreenBoundary } from "@/components/withScreenBoundary";
import { FACTION_SIGNATURE_UNITS } from "@/engine/combatData";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";

const FACTION_DETAILS: Record<string, { label: string; icon: string; tone: keyof ThemePalette }> = {
  gangs: { label: "WASTELAND GANGS", icon: "skull-crossbones", tone: "danger" },
  mutants: { label: "MUTANT WARBANDS", icon: "biohazard", tone: "warning" },
  raiders: { label: "RAIDER WARBANDS", icon: "target", tone: "warning" },
  corporations: { label: "CORPORATE SECURITY", icon: "briefcase", tone: "info" },
  cults: { label: "APOCALYPTIC CULTS", icon: "fire", tone: "danger" },
  rival_cities: { label: "RIVAL CITY LEVIES", icon: "shield", tone: "info" },
  insurgents: { label: "INSURGENT CELLS", icon: "radio", tone: "danger" },
  pirates: { label: "PIRATE CREWS", icon: "anchor", tone: "info" },
};

function BestiaryScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const factions = Object.entries(FACTION_SIGNATURE_UNITS);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <MaterialCommunityIcons name="book-open-page-variant" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>BESTIARY</Text>
        <Text style={styles.headerCount}>{factions.length} FACTIONS</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={styles.kicker}>FIELD INTELLIGENCE · SIGNATURE UNITS</Text>
          <Text style={styles.introText}>
            Combat weights identify the relative strength of recurring hostile formations.
          </Text>
        </View>

        {factions.map(([key, units]) => {
          const detail = FACTION_DETAILS[key];
          const tone = Colors[detail.tone] as string;
          return (
            <View key={key} style={[styles.factionCard, { borderColor: tone + "55" }]}>
              <View style={styles.factionHeader}>
                <View style={[styles.factionIcon, { borderColor: tone + "66", backgroundColor: tone + "14" }]}>
                  <MaterialCommunityIcons name={detail.icon as any} size={19} color={tone} />
                </View>
                <View style={styles.factionTitleWrap}>
                  <Text style={[styles.factionTitle, { color: tone }]}>{detail.label}</Text>
                  <Text style={styles.factionDescription}>
                    {units.length} SIGNATURE FORMATIONS · TOTAL WEIGHT {units.reduce((sum, unit) => sum + unit.weight, 0)}
                  </Text>
                </View>
              </View>
              <View style={styles.unitList}>
                {units.map((unit) => (
                  <View key={unit.id} style={styles.unitRow} accessible accessibilityRole="text" accessibilityLabel={`${unit.displayName}. Combat weight ${unit.weight}.`}>
                    <View style={[styles.unitMarker, { backgroundColor: tone }]} />
                    <View style={styles.unitCopy}>
                      <View style={styles.unitNameRow}>
                        <Text style={styles.unitName}>{unit.displayName}</Text>
                        <Text style={[styles.weight, { color: tone }]}>WT {unit.weight}</Text>
                      </View>
                      <Text style={styles.unitBlurb}>COMBAT WEIGHT {unit.weight}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
        <Text style={styles.footer}>SIGNATURE UNITS ARE IDENTIFIED FROM RAID COMPOSITION INTELLIGENCE.</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 8 : 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgSecondary },
    headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5 },
    headerCount: { marginLeft: "auto", color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.8 },
    scroll: { flex: 1 },
    content: { padding: Platform.OS === "web" ? 12 : 14, paddingBottom: 32, gap: 10 },
    intro: { padding: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 5, backgroundColor: Colors.bgCard },
    kicker: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1, marginBottom: 7 },
    introText: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
    factionCard: { borderWidth: 1, borderRadius: 5, padding: 12, backgroundColor: Colors.bgCard },
    factionHeader: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 10 },
    factionIcon: { width: 38, height: 38, borderWidth: 1, borderRadius: 4, alignItems: "center", justifyContent: "center" },
    factionTitleWrap: { flex: 1 },
    factionTitle: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1 },
    factionDescription: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, marginTop: 3 },
    unitList: { gap: 7 },
    unitRow: { flexDirection: "row", gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    unitMarker: { width: 3, borderRadius: 2, marginVertical: 2 },
    unitCopy: { flex: 1 },
    unitNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    unitName: { flex: 1, color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 11 },
    weight: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
    unitBlurb: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, marginTop: 2 },
    footer: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, letterSpacing: 0.7, textAlign: "center", marginTop: 8 },
  }),
);

export default withScreenBoundary(BestiaryScreen, "bestiary");
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState } from "@/context/GameContext";
import {
  ADMINISTRATIVE_COHORT_LABELS,
  getAdministrativeReadout,
  formatAdministrativeEffectLabel,
  type AdministrativeSurface,
} from "@/engine/administrativeReadout";

const toneColor = (colors: ThemePalette, tone: "good" | "warn" | "bad" | "neutral") =>
  tone === "good" ? colors.accent : tone === "warn" ? colors.warning : tone === "bad" ? colors.danger : colors.textSecondary;

export default function AdministrativeBlocPanel({
  surface,
  detailed = false,
}: {
  surface?: AdministrativeSurface;
  detailed?: boolean;
}) {
  const { state } = useGameState();
  const { colors } = useTheme();
  const styles = useStyles();
  const readout = getAdministrativeReadout(state);
  if (!readout) return null;
  const rows = surface ? readout.surface[surface] : [];
  const cohorts = Object.entries(readout.telemetry.cohorts) as Array<[keyof typeof readout.telemetry.cohorts, typeof readout.telemetry.cohorts[keyof typeof readout.telemetry.cohorts]]>;

  return (
    <View style={styles.card} accessibilityLabel="Administrative Bloc operational readout">
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Feather name="briefcase" size={14} color={colors.info} />
          <View>
            <Text style={styles.title}>ADMINISTRATIVE BLOC</Text>
            <Text style={styles.subtitle}>bureaucratic constituencies · operational telemetry</Text>
          </View>
        </View>
        <View style={[styles.posture, { borderColor: toneColor(colors, readout.posture === "CRITICAL" ? "bad" : readout.posture === "STRAINED" ? "warn" : "good") }]}>
          <Text style={[styles.postureText, { color: toneColor(colors, readout.posture === "CRITICAL" ? "bad" : readout.posture === "STRAINED" ? "warn" : "good") }]}>{readout.posture}</Text>
        </View>
      </View>
      <View style={styles.relationships}>
        <Text style={styles.relationship}>INFLUENCE <Text style={styles.known}>{Math.round(readout.faction.influence)} KNOWN</Text></Text>
        <Text style={styles.relationship}>LOYALTY <Text style={styles.known}>{Math.round(readout.faction.loyalty)} KNOWN</Text></Text>
        <Text style={styles.relationship}>THREAT <Text style={styles.known}>{Math.round(readout.faction.threat)} KNOWN</Text></Text>
        <Text style={styles.relationship}>PRESSURE <Text style={styles.estimated}>{Math.round(readout.telemetry.pressure)} EST.</Text></Text>
      </View>
      {surface && (
        <View style={styles.signalRows}>
          {rows.map(row => (
            <View key={row.label} style={styles.signalRow}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, { color: toneColor(colors, row.tone) }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      )}
      {detailed && (
        <>
          <Text style={styles.note}>{readout.postureNote} Staffing and cohort values are estimated from live city conditions; relationships and treasury are known state.</Text>
          <View style={styles.cohortGrid}>
            {cohorts.map(([id, cohort]) => (
              <View key={id} style={styles.cohort}>
                <Text style={styles.cohortName}>{ADMINISTRATIVE_COHORT_LABELS[id]}</Text>
                <Text style={styles.cohortStats}>
                  {Math.round(cohort.staffing).toLocaleString()} staff est. · {Math.round(cohort.capacity)} cap · {Math.round(cohort.effectiveness)} eff.
                </Text>
                <Text style={styles.cohortStats}>
                  {Math.round(cohort.workload)} workload · {Math.round(cohort.independence)} independence · {Math.round(cohort.corruptionExposure)} exposure
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.demandBox}>
            <Text style={styles.demandLabel}>CURRENT DEMAND</Text>
            <Text style={styles.demandValue}>{readout.demand ? readout.demand.title : "NO ACTIVE DEMAND"}</Text>
            <Text style={styles.demandCopy}>
              {readout.demand ? `${readout.demand.responseOptions?.length ?? 0} responses — each cost and effect is shown before commit.` : "The next demand is selected from workload, corruption, vacancies, treasury, and law-order conditions."}
            </Text>
            {readout.demand?.responseOptions?.map(response => {
              const effects = Object.entries(response.effects)
                .filter(([, value]) => typeof value === "number" && value !== 0)
                .map(([key, value]) => `${formatAdministrativeEffectLabel(key)} ${Number(value) > 0 ? "+" : ""}${value}`)
                .join(" · ");
              return (
                <Text key={response.id} style={styles.demandOption}>
                  {response.label}: {effects || "no stat change"}
                </Text>
              );
            })}
          </View>
        </>
      )}
      {detailed ? (
        <View style={styles.detailState} accessibilityLabel="Administrative Bloc faction details open">
          <Text style={styles.detailStateText}>DETAILS OPEN</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => router.push("/(game)/factions")}
          style={styles.link}
          accessibilityRole="button"
          accessibilityLabel="Open Administrative Bloc faction details"
        >
          <Text style={styles.linkText}>OPEN BLOC DETAILS</Text>
          <Feather name="arrow-up-right" size={11} color={colors.accent} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeThemedStyles((colors: ThemePalette) => StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.info, borderRadius: 5, backgroundColor: colors.bgCard, padding: 12, marginBottom: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title: { color: colors.info, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.1 },
  subtitle: { color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 2 },
  posture: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3 },
  postureText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  relationships: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  relationship: { color: colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
  known: { color: colors.text, fontFamily: "Inter_700Bold" },
  estimated: { color: colors.warning, fontFamily: "Inter_700Bold" },
  signalRows: { marginTop: 8 },
  signalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  rowLabel: { color: colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10 },
  rowValue: { fontFamily: "Inter_700Bold", fontSize: 10 },
  note: { color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, marginTop: 10 },
  cohortGrid: { marginTop: 8, gap: 5 },
  cohort: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 5 },
  cohortName: { color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 10 },
  cohortStats: { color: colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 9, lineHeight: 13 },
  demandBox: { marginTop: 10, padding: 8, borderWidth: 1, borderColor: colors.warning + "66", backgroundColor: colors.warning + "0D", borderRadius: 3 },
  demandLabel: { color: colors.warning, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  demandValue: { color: colors.text, fontFamily: "Inter_700Bold", fontSize: 10, marginTop: 3 },
  demandCopy: { color: colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 9, lineHeight: 13, marginTop: 2 },
  demandOption: { color: colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 9, lineHeight: 13, marginTop: 5 },
  link: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  linkText: { color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  detailState: { alignItems: "center", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  detailStateText: { color: colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
}));
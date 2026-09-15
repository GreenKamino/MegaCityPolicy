import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState } from "@/context/GameContext";
import {
  getRustWardensReadout,
  type EngineeringGroup,
  type EngineeringRoleKind,
} from "@/engine/engineeringReadout";

const toneColor = (colors: ThemePalette, tone: "good" | "warn" | "bad" | "neutral") =>
  tone === "good" ? colors.accent : tone === "warn" ? colors.warning : tone === "bad" ? colors.danger : colors.textSecondary;

const GROUP_LABELS: Record<EngineeringGroup, string> = {
  maintenance: "MAINTENANCE",
  utilities: "UTILITIES",
  construction: "CONSTRUCTION",
  sanitation: "SANITATION",
  heavyIndustry: "HEAVY INDUSTRY",
};

const KIND_LABELS: Record<EngineeringRoleKind, string> = {
  workers: "WORKERS",
  machines: "MACHINES",
  teams: "TEAMS",
  facilities: "FACILITIES",
  "population-estimate": "POP. EST.",
};

const formatCount = (value: number) => value.toLocaleString();

export default function RustWardensPanel({ detailed = false }: { detailed?: boolean }) {
  const { state } = useGameState();
  const { colors } = useTheme();
  const styles = useStyles();
  const readout = getRustWardensReadout(state);
  if (!readout) return null;

  return (
    <View style={styles.card} accessibilityLabel="Rust Wardens operational readout">
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Feather name="tool" size={14} color={colors.warning} />
          <View>
            <Text style={styles.title}>THE RUST WARDENS</Text>
            <Text style={styles.subtitle}>engineers · civic machinists · workers' movement</Text>
          </View>
        </View>
        <View style={[styles.posture, { borderColor: toneColor(colors, readout.posture === "CRITICAL" ? "bad" : readout.posture === "STRAINED" ? "warn" : "good") }]}>
          <Text style={[styles.postureText, { color: toneColor(colors, readout.posture === "CRITICAL" ? "bad" : readout.posture === "STRAINED" ? "warn" : "good") }]}>{readout.posture}</Text>
        </View>
      </View>
      <Text style={styles.description}>{readout.faction.description}</Text>
      <View style={styles.relationships}>
        <Text style={styles.relationship}>INFLUENCE <Text style={styles.known}>{Math.round(readout.faction.influence)} KNOWN</Text></Text>
        <Text style={styles.relationship}>LOYALTY <Text style={styles.known}>{Math.round(readout.faction.loyalty)} KNOWN</Text></Text>
        <Text style={styles.relationship}>THREAT <Text style={styles.known}>{Math.round(readout.faction.threat)} KNOWN</Text></Text>
      </View>
      <View style={styles.signalRows}>
        {readout.signals.map(signal => (
          <View key={signal.label} style={styles.signalRow}>
            <Text style={styles.rowLabel}>{signal.label}</Text>
            <Text style={[styles.rowValue, { color: toneColor(colors, signal.tone) }]}>{signal.value}</Text>
          </View>
        ))}
      </View>
      {detailed && (
        <>
          <View style={styles.ledgerBox}>
            <View style={styles.ledgerHeader}>
              <Text style={styles.noteLabel}>ENGINEERING WORKFORCE LEDGER</Text>
              <Text style={[styles.ledgerScore, { color: toneColor(colors, readout.operationalScore >= 65 ? "good" : readout.operationalScore >= 40 ? "warn" : "bad") }]}>
                {readout.operationalScore}% OPERATIONAL
              </Text>
            </View>
            <View style={styles.ledgerTotals}>
              {(Object.keys(readout.ledger.totals) as EngineeringRoleKind[]).map(kind => (
                <View key={kind} style={styles.ledgerTotal}>
                  <Text style={styles.ledgerTotalLabel}>{KIND_LABELS[kind]}</Text>
                  <Text style={styles.ledgerTotalValue}>{formatCount(readout.ledger.totals[kind])}</Text>
                </View>
              ))}
            </View>
            {(Object.keys(GROUP_LABELS) as EngineeringGroup[]).map(group => (
              <View key={group} style={styles.ledgerGroup}>
                <Text style={styles.groupLabel}>{GROUP_LABELS[group]}</Text>
                {readout.ledger.byGroup[group].map(role => (
                  <View key={role.id} style={styles.ledgerRole}>
                    <Text style={styles.ledgerRoleLabel}>{role.label}</Text>
                    <Text style={styles.ledgerRoleMeta}>{KIND_LABELS[role.kind]} · {role.sourceLabel}</Text>
                    <Text style={styles.ledgerRoleValue}>{formatCount(role.value)}</Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.ledgerWarnings}>
              <Text style={styles.ledgerWarningText}>
                QUEUED WORK: {formatCount(readout.ledger.queuedWorkUnits)} units · {formatCount(readout.ledger.remainingWorkTicks)} work-ticks
              </Text>
              <Text style={styles.ledgerWarningText}>
                SHORTAGE: {readout.ledger.shortage}% · UTILITIES {readout.ledger.utilityShortage}% · CONSTRUCTION {readout.ledger.constructionShortage}%
              </Text>
              <Text style={styles.ledgerWarningText}>
                WATER MARGIN: {readout.waterMargin >= 0 ? "+" : ""}{readout.waterMargin} · WASTE BACKLOG: {formatCount(readout.wasteBacklog)}
              </Text>
            </View>
          </View>
          <View style={styles.noteBox}>
            <Text style={styles.noteLabel}>CURRENT SIGNAL</Text>
            <Text style={styles.note}>{readout.postureNote}</Text>
            <Text style={styles.noteSub}>Internal movement: these readings come from live city infrastructure and workforce conditions, not foreign diplomacy.</Text>
          </View>
        </>
      )}
      {detailed ? (
        <View style={styles.detailState} accessibilityLabel="Rust Wardens faction details open">
          <Text style={styles.detailStateText}>DETAILS OPEN</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => router.push("/(game)/factions")}
          style={styles.link}
          accessibilityRole="button"
          accessibilityLabel="Open Rust Wardens faction details"
        >
          <Text style={styles.linkText}>OPEN WARDEN DETAILS</Text>
          <Feather name="arrow-up-right" size={11} color={colors.accent} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeThemedStyles((colors: ThemePalette) => StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.warning, borderRadius: 5, backgroundColor: colors.bgCard, padding: 12, marginBottom: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title: { color: colors.warning, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.1 },
  subtitle: { color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 2 },
  posture: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3 },
  postureText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  description: { color: colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, marginTop: 10 },
  relationships: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  relationship: { color: colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
  known: { color: colors.text, fontFamily: "Inter_700Bold" },
  signalRows: { marginTop: 8 },
  signalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  rowLabel: { color: colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10 },
  rowValue: { fontFamily: "Inter_700Bold", fontSize: 10 },
  ledgerBox: { marginTop: 10, padding: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, borderRadius: 3 },
  ledgerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  ledgerScore: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
  ledgerTotals: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  ledgerTotal: { minWidth: 58 },
  ledgerTotalLabel: { color: colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.4 },
  ledgerTotalValue: { color: colors.text, fontFamily: "Inter_700Bold", fontSize: 11, marginTop: 2 },
  ledgerGroup: { marginTop: 7 },
  groupLabel: { color: colors.warning, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8, marginBottom: 2 },
  ledgerRole: { position: "relative", paddingVertical: 3, paddingRight: 58 },
  ledgerRoleLabel: { color: colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 9 },
  ledgerRoleMeta: { color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 7, marginTop: 1 },
  ledgerRoleValue: { position: "absolute", right: 0, top: 4, color: colors.text, fontFamily: "Inter_700Bold", fontSize: 9 },
  ledgerWarnings: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  ledgerWarningText: { color: colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.3, lineHeight: 13 },
  noteBox: { marginTop: 10, padding: 8, borderWidth: 1, borderColor: colors.warning + "66", backgroundColor: colors.warning + "0D", borderRadius: 3 },
  noteLabel: { color: colors.warning, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  note: { color: colors.text, fontFamily: "Inter_500Medium", fontSize: 10, lineHeight: 14, marginTop: 3 },
  noteSub: { color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, lineHeight: 13, marginTop: 5 },
  link: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  linkText: { color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  detailState: { alignItems: "center", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  detailStateText: { color: colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
}));
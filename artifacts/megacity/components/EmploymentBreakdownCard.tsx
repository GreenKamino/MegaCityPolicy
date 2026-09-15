import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import {
  computeEmploymentBreakdown,
} from "@/engine/employmentBreakdown";
import type { GameState } from "@/engine/types";
import { navigateToEmploymentSuggestion } from "@/utils/employmentNavigation";
import CrisisReportFrame from "@/components/CrisisReportFrame";

// Shared "diagnose -> one-tap fix" card for Employment, surfaced in the
// Overview advisory area. It mirrors the infrastructure / defense breakdown
// cards: a per-tick headline, two contributor columns, and tappable fixes that
// deep-link to the right screen. For employment, HIGHER is better, so a
// positive net means it is RISING (good) and a negative net means it is
// FALLING (bad). Employment drifts toward a job-slot target, so the headline
// shows both the current rate and the target it is drifting toward.
//
// Navigation is handled inline. The switch is exhaustive: a new
// EmploymentSuggestionTarget variant fails typecheck here until it is handled.
// 0.5-point contributions (the transit drain) need one decimal; whole points don't.
function fmtAmount(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

export default function EmploymentBreakdownCard({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const bd = computeEmploymentBreakdown(state);

  const net = bd.netPerTick; // + = rising (good), - = falling (bad)
  const dir = net > 0.05 ? "rising" : net < -0.05 ? "falling" : "holding";
  const tone = dir === "rising" ? tc.statHigh : dir === "falling" ? tc.danger : tc.warning;
  const chipLabel = dir === "rising" ? "RISING" : dir === "falling" ? "FALLING" : "HOLDING";
  const fmtNet = (n: number) => `${n >= 0 ? "+" : "-"}${fmtAmount(Math.abs(n))}`;

  // The task contract is "every active factor is visible" — never truncate.
  const gains = bd.positives;
  const drains = bd.negatives;
  const tips = bd.suggestions;
  const severity = bd.employment < 20 ? "COLLAPSING" : bd.employment < 40 ? "CRITICAL" : bd.employment < 65 ? "STRAINED" : "STABLE";

  const headline = `${fmtNet(net)} pts / tick · Employment ${Math.round(bd.employment)}/100 · target ${Math.round(bd.targetEmployment)}`;

  return (
    <CrisisReportFrame
      title="EMPLOYMENT BREAKDOWN"
      icon="briefcase"
      tone={tone}
      statusLabel={chipLabel}
      severityLabel={severity}
      headline={`${headline} · ${bd.jobSlots.toLocaleString()} job slots`}
      consequence={bd.transitOverloaded
        ? "Transit overload is cutting access to work every tick; prolonged job loss feeds unrest and crime."
        : "Job shortages erode the tax base and sector stability; prolonged unemployment feeds unrest and crime."}
      actionCount={tips.length}
      detailsLabel="HIRING CAPACITY / JOB LOSSES"
      details={<View style={styles.cols}>
        <View style={styles.col}>
          <Text style={[styles.colLabel, { color: tc.statHigh }]}>HIRING</Text>
          {gains.length === 0 ? (
            <Text style={[styles.empty, { color: tc.textMuted }]}>Nothing yet</Text>
          ) : (
            gains.map((c) => (
              <View key={`g-${c.label}`} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.rowAmt, { color: tc.statHigh }]}>{`+${fmtAmount(Math.round(c.amount * 10) / 10)}`}</Text>
              </View>
            ))
          )}
        </View>
        <View style={styles.col}>
          <Text style={[styles.colLabel, { color: tc.danger }]}>CUTTING</Text>
          {drains.length === 0 ? (
            <Text style={[styles.empty, { color: tc.textMuted }]}>None</Text>
          ) : (
            drains.map((c) => (
              <View key={`d-${c.label}`} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.rowAmt, { color: tc.danger }]}>{`-${fmtAmount(Math.round(c.amount * 10) / 10)}`}</Text>
              </View>
            ))
          )}
        </View>
      </View>}
    >
      {tips.length > 0 ? (
        <View style={styles.tips}>
          {tips.map((t, i) => {
            const tappable = !!t.target;
            const rowContent = (
              <>
                <Text style={[styles.tipDot, { color: tc.textMuted }, tappable && { color: tc.accent }]}>›</Text>
                <Text style={[styles.tipText, { color: tc.textSecondary }, tappable && { color: tc.accent }]}>
                  {t.text}
                </Text>
                {tappable && (
                  <Feather name="chevron-right" size={13} color={tc.accent} style={styles.tipChevron} />
                )}
              </>
            );
            if (!tappable) {
              return (
                <View key={`t-${i}`} style={styles.tipRow}>
                  {rowContent}
                </View>
              );
            }
            return (
              <Pressable
                key={`t-${i}`}
                onPress={() => navigateToEmploymentSuggestion(t.target!)}
                style={({ pressed }) => [styles.tipRow, pressed && { opacity: 0.6 }, Platform.OS === "web" && { cursor: "pointer" as any }]}
                accessibilityRole="button"
                accessibilityLabel={`${t.text} Tap to go there.`}
              >
                {rowContent}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </CrisisReportFrame>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  colLabel: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.8, marginBottom: 4 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 11, fontStyle: "italic" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 11, flex: 1 },
  rowAmt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  tips: { gap: 4 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 3 },
  tipDot: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  tipText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, flex: 1 },
  tipChevron: { marginTop: 2 },
});

import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import {
  computeHealthBreakdown,
} from "@/engine/healthBreakdown";
import type { GameState } from "@/engine/types";
import { navigateToHealthSuggestion } from "@/utils/healthNavigation";
import CrisisReportFrame from "@/components/CrisisReportFrame";

// Shared "diagnose -> one-tap fix" card for Public Health, surfaced in the
// Overview advisory area. It mirrors the infrastructure / defense breakdown
// cards: a per-tick headline, two contributor columns, and tappable recovery
// tips that deep-link to the right screen. For public health, HIGHER is better,
// so a positive net means it is RECOVERING (good) and a negative net means it
// is DECLINING (bad). Every-2nd-tick terms show as 0.5 (their per-tick average).
//
// Navigation is handled inline. The switch is exhaustive: a new
// HealthSuggestionTarget variant fails typecheck here until it is handled.
// 0.5-point (every-2nd-tick) contributions need one decimal; whole points don't.
function fmtAmount(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

export default function HealthBreakdownCard({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const bd = computeHealthBreakdown(state);

  const net = bd.netPerTick; // + = recovering (good), - = declining (bad)
  const dir = net > 0.05 ? "recovering" : net < -0.05 ? "declining" : "holding";
  const tone = dir === "recovering" ? tc.statHigh : dir === "declining" ? tc.danger : tc.warning;
  const chipLabel = dir === "recovering" ? "RECOVERING" : dir === "declining" ? "DECLINING" : "HOLDING";
  const fmtNet = (n: number) => `${n >= 0 ? "+" : "-"}${fmtAmount(Math.abs(n))}`;

  // The task contract is "every active factor is visible" — never truncate.
  const gains = bd.positives;
  const drains = bd.negatives;
  const tips = bd.suggestions;
  const severity = bd.publicHealth < 20 ? "COLLAPSING" : bd.publicHealth < 40 ? "CRITICAL" : bd.publicHealth < 65 ? "STRAINED" : "STABLE";

  return (
    <CrisisReportFrame
      title="PUBLIC HEALTH BREAKDOWN"
      icon="heart"
      tone={tone}
      statusLabel={chipLabel}
      severityLabel={severity}
      headline={`${fmtNet(net)} pts / tick · Public Health ${Math.round(bd.publicHealth)}/100 · medical base ${fmtAmount(Math.round(bd.healthBase * 10) / 10)}`}
      movement={dir === "recovering" ? "improving" : dir === "declining" ? "worsening" : "holding"}
      consequence="Low public health increases disease severity and leaves more residents exposed to lethal outbreaks."
      actionCount={tips.length}
      detailsLabel="CAUSES / MITIGATION PROGRESS"
      details={<View style={styles.cols}>
        <View style={styles.col}>
          <Text style={[styles.colLabel, { color: tc.statHigh }]}>HEALING</Text>
          {gains.length === 0 ? (
            <Text style={[styles.empty, { color: tc.textMuted }]}>Nothing yet</Text>
          ) : (
            gains.map((c) => (
              <View key={`g-${c.label}`} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.rowAmt, { color: tc.statHigh }]}>{`+${fmtAmount(c.amount)}`}</Text>
              </View>
            ))
          )}
        </View>
        <View style={styles.col}>
          <Text style={[styles.colLabel, { color: tc.danger }]}>SICKENING</Text>
          {drains.length === 0 ? (
            <Text style={[styles.empty, { color: tc.textMuted }]}>None</Text>
          ) : (
            drains.map((c) => (
              <View key={`d-${c.label}`} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.rowAmt, { color: tc.danger }]}>{`-${fmtAmount(c.amount)}`}</Text>
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
                onPress={() => navigateToHealthSuggestion(t.target!)}
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

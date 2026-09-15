import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import {
  computeDefenseBreakdown,
} from "@/engine/defenseBreakdown";
import type { GameState } from "@/engine/types";
import { navigateToDefenseSuggestion } from "@/utils/defenseNavigation";
import CrisisReportFrame from "@/components/CrisisReportFrame";

// Shared "diagnose -> one-tap fix" card for the sector's Defense Rating. It lives
// in two places — the Overview advisory area and the Military screen's DEFENSE tab
// — so it is a single shared component (not duplicated JSX) to guarantee the two
// surfaces can never drift. It mirrors the power / water breakdown cards: a
// headline stat, two contributor columns, and tappable recovery tips that
// deep-link to the right screen. Defense Rating is a 0..100 stat (HIGHER is
// better), so the columns are "BUILDING" (contributors raising it) and
// "FORFEITED" (defense lost to under-manned bases) rather than a per-tick net.
//
// Navigation is handled inline (there is only ONE component, so there is nothing
// to keep in sync across files). The switch is exhaustive: a new
// DefenseSuggestionTarget variant fails typecheck here until it is handled.
export default function DefenseBreakdownCard({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const bd = computeDefenseBreakdown(state);

  const rating = bd.defenseRating;
  const dir = rating >= 60 ? "strong" : rating >= 35 ? "moderate" : "weak";
  const tone = dir === "strong" ? tc.statHigh : dir === "moderate" ? tc.warning : tc.danger;
  const chipLabel = dir === "strong" ? "STRONG" : dir === "moderate" ? "MODERATE" : "WEAK";

  const gains = bd.positives.slice(0, 4);
  const forfeits = bd.negatives.slice(0, 4);
  const tips = bd.suggestions.slice(0, 4);
  const severity = rating < 20 ? "COLLAPSING" : rating < 35 ? "CRITICAL" : rating < 60 ? "STRAINED" : "STABLE";

  const mannedPct = bd.garrisonDemand > 0 ? Math.round(bd.garrisonCoverage * 100) : null;
  const headline =
    mannedPct !== null
      ? `Defense rating ${rating}/100 · ${mannedPct}% bases manned`
      : `Defense rating ${rating}/100`;

  // A compact alert line for pressure the rating alone hides: an incoming raid /
  // threat climbing on your own sectors, or forces too under-supplied to fight.
  const alertParts: string[] = [];
  if (bd.raidThreatRising) {
    alertParts.push(
      bd.incomingRaids > 0
        ? `${bd.incomingRaids} raid${bd.incomingRaids === 1 ? "" : "s"} inbound`
        : "Raid threat rising",
    );
  }
  if (bd.readiness < 50) alertParts.push(`Readiness ${Math.round(bd.readiness)}%`);
  const alertText = alertParts.join(" · ");

  return (
    <CrisisReportFrame
      title="DEFENSE READINESS BREAKDOWN"
      icon="shield"
      tone={tone}
      statusLabel={chipLabel}
      severityLabel={severity}
      headline={alertText.length > 0 ? `${headline} · ${alertText}` : headline}
      consequence="Weak or undermanned defenses let raids penetrate the sector, destroying assets and killing residents."
      actionCount={tips.length}
      detailsLabel="DEPLOYED STRENGTH / FORFEITED CAPACITY"
      details={<View style={styles.cols}>
        <View style={styles.col}>
          <Text style={[styles.colLabel, { color: tc.statHigh }]}>BUILDING</Text>
          {gains.length === 0 ? (
            <Text style={[styles.empty, { color: tc.textMuted }]}>Nothing yet</Text>
          ) : (
            gains.map((c) => (
              <View key={`g-${c.label}`} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.rowAmt, { color: tc.statHigh }]}>{`+${Math.round(c.amount)}`}</Text>
              </View>
            ))
          )}
        </View>
        <View style={styles.col}>
          <Text style={[styles.colLabel, { color: tc.danger }]}>FORFEITED</Text>
          {forfeits.length === 0 ? (
            <Text style={[styles.empty, { color: tc.textMuted }]}>None</Text>
          ) : (
            forfeits.map((c) => (
              <View key={`f-${c.label}`} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.rowAmt, { color: tc.danger }]}>{`-${Math.round(c.amount)}`}</Text>
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
                onPress={() => navigateToDefenseSuggestion(t.target!)}
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

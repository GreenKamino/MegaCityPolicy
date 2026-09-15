import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import {
  computeInfrastructureBreakdown,
} from "@/engine/infrastructureBreakdown";
import type { InfrastructureBreakdown } from "@/engine/infrastructureBreakdown";
import type { GameState } from "@/engine/types";
import { navigateToInfraSuggestion } from "@/utils/infrastructureNavigation";
import {
  formatInfrastructureIntegrity,
  formatInfrastructurePoints,
} from "@/utils/infrastructurePresentation";
import CrisisReportFrame from "@/components/CrisisReportFrame";

// Shared "diagnose -> one-tap fix" card for Infrastructure Health, surfaced in the
// Overview advisory area. It mirrors the power / water breakdown cards: a per-tick
// headline, two contributor columns, and tappable recovery tips that deep-link to
// the right screen. For infrastructure, HIGHER is better, so a positive net means
// it is RISING (good) and a negative net means it is DEGRADING (bad).
//
// Navigation is handled inline. The switch is exhaustive: a new
// InfraSuggestionTarget variant fails typecheck here until it is handled.
export default function InfrastructureBreakdownCard({
  state,
  breakdown,
}: {
  state: GameState;
  breakdown?: InfrastructureBreakdown;
}) {
  const { colors: tc } = useTheme();
  const bd = breakdown ?? computeInfrastructureBreakdown(state);

  const net = bd.netPerTick; // + = rising (good), - = degrading (bad)
  // Do not use a tolerance here: even a fractional technology/software
  // modifier is a real applied movement in the next tick, so the arrow and
  // headline must never call a rising/declining stat "holding".
  const dir = bd.trend;
  const tone = dir === "rising" ? tc.statHigh : dir === "degrading" ? tc.danger : tc.warning;
  const chipLabel = bd.atCap && dir === "holding"
    ? "AT CAP"
    : dir === "rising"
      ? "RISING"
      : dir === "degrading"
        ? "DEGRADING"
        : "HOLDING";
  const fmtNet = (n: number) => {
    const displayed = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return `${n > 0 ? "+" : ""}${displayed}`;
  };

  const gains = bd.positives.slice(0, 4);
  const drains = bd.negatives.slice(0, 4);
  const tips = bd.suggestions.slice(0, 4);
  const severity = bd.integrityPercent < 20 ? "COLLAPSING" : bd.integrityPercent < 40 ? "CRITICAL" : bd.integrityPercent < 65 ? "STRAINED" : "STABLE";
  const recentChanges = [bd.recentDamage, bd.recentRepair].filter(
    (change): change is NonNullable<typeof bd.recentDamage> => !!change,
  );
  const formatChange = (change: NonNullable<typeof bd.recentDamage>) => {
    const source = change.source ? change.source.toUpperCase() : null;
    const category = change.category ?? null;
    const scope = source && category
      ? `${source} · ${category}`
      : source ?? category;
    return `${change.kind === "damage" ? "DAMAGE" : "REPAIR"} ${Math.round(change.amount)} pts${scope ? ` · ${scope}` : ""}${change.reason ? ` · ${change.reason}` : ""}`;
  };

  return (
    <CrisisReportFrame
      title="INFRASTRUCTURE HEALTH BREAKDOWN"
      icon="tool"
      tone={tone}
      statusLabel={chipLabel}
      severityLabel={severity}
      headline={`${formatInfrastructurePoints(bd.totalPoints)} total · ${formatInfrastructurePoints(bd.intactPoints)} intact · ${formatInfrastructureIntegrity(bd.integrityPercent)} integrity · ${fmtNet(net)} health pts / tick`}
      movement={dir === "rising" ? "improving" : dir === "degrading" ? "worsening" : "holding"}
      consequence={bd.atCap && dir === "holding"
        ? "100 is the legacy health ceiling. Repairs above the cap do not bank, so keep the grid powered, unrest low, and crews funded to protect the city when conditions worsen."
        : "Degrading infrastructure causes utility failures and compounds casualties during disasters and attacks."}
      actionCount={tips.length}
      detailsLabel="MAINTENANCE / ACTIVE DEGRADATION"
      details={
        <View style={styles.details}>
          <View style={styles.capacity}>
            <Text style={[styles.colLabel, { color: tc.textMuted }]}>LEDGER CAPACITY</Text>
            <Text style={[styles.capacityValue, { color: tc.text }]}>
              {formatInfrastructurePoints(bd.intactPoints)} intact / {formatInfrastructurePoints(bd.totalPoints)} total points
            </Text>
            <Text style={[styles.capacitySub, { color: tc.textSecondary }]}>
              {formatInfrastructureIntegrity(bd.integrityPercent)} integrity
            </Text>
          </View>
          {recentChanges.length > 0 ? (
            <View style={styles.recent}>
              <Text style={[styles.colLabel, { color: tc.textMuted }]}>RECENT LEDGER ACTIVITY</Text>
              {recentChanges.map((change, index) => (
                <Text key={`${change.kind}-${change.tick}-${index}`} style={[styles.recentText, { color: change.kind === "damage" ? tc.danger : tc.statHigh }]} numberOfLines={2}>
                  {formatChange(change)}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={styles.cols}>
            <View style={styles.col}>
              <Text style={[styles.colLabel, { color: tc.statHigh }]}>MAINTAINING</Text>
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
              <Text style={[styles.colLabel, { color: tc.danger }]}>DEGRADING</Text>
              {drains.length === 0 ? (
                <Text style={[styles.empty, { color: tc.textMuted }]}>None</Text>
              ) : (
                drains.map((c) => (
                  <View key={`d-${c.label}`} style={styles.row}>
                    <Text style={[styles.rowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                      {c.label}
                    </Text>
                    <Text style={[styles.rowAmt, { color: tc.danger }]}>{`-${Math.round(c.amount)}`}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>
      }
    >
      {bd.atCap && dir === "holding" ? (
        <Text style={[styles.capNote, { color: tc.textSecondary }]}>
          The city has reached the legacy 100-point health ceiling. The ledger can still contain more than 100 total infrastructure points; preserve the conditions that keep its integrity intact.
        </Text>
      ) : null}
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
                onPress={() => navigateToInfraSuggestion(t.target!)}
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
  details: { gap: 10 },
  capacity: { gap: 2 },
  capacityValue: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  capacitySub: { fontFamily: "Inter_400Regular", fontSize: 11 },
  recent: { gap: 3 },
  recentText: { fontFamily: "Inter_500Medium", fontSize: 10, lineHeight: 14 },
  cols: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  colLabel: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.8, marginBottom: 4 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 11, fontStyle: "italic" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 11, flex: 1 },
  rowAmt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  tips: { gap: 4 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 3 },
  capNote: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16, paddingTop: 2 },
  tipDot: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  tipText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, flex: 1 },
  tipChevron: { marginTop: 2 },
});

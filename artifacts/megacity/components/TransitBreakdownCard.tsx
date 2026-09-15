import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import {
  computeTransitBreakdown,
  TRANSIT_OVERLOAD_EMPLOYMENT_PENALTY,
  TRANSIT_OVERLOAD_HAPPINESS_PENALTY,
} from "@/engine/transitBreakdown";
import type { GameState } from "@/engine/types";
import { getRailNetworkDiagnostics } from "@/engine/railNetwork";
import { navigateToTransitSuggestion } from "@/utils/transitNavigation";
import CrisisReportFrame from "@/components/CrisisReportFrame";

// Shared "diagnose -> one-tap fix" card for the transit grid, surfaced in the
// Overview utility area. It mirrors the power / water breakdown cards: a
// load-vs-capacity headline, two contributor columns (capacity vs load), and
// tappable fixes that deep-link to the right screen. Transit was previously
// invisible in the UI — the sim tracks load vs capacity and silently drains
// Happiness (-1) and Employment (-0.5) every tick while overloaded; this card
// is the first surface where the Commander can actually see it.
//
// Navigation is handled inline. The switch is exhaustive: a new
// TransitSuggestionTarget variant fails typecheck here until it is handled.
export default function TransitBreakdownCard({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const bd = computeTransitBreakdown(state);
  const railDiag = getRailNetworkDiagnostics(state);
  if (railDiag.transitCapacity > 0) {
    bd.transitCapacity += railDiag.transitCapacity;
    bd.headroom += railDiag.transitCapacity;
    bd.capacitySources.push({ label: "Rail Network", amount: railDiag.transitCapacity });
    bd.overloaded = bd.headroom < 0;
  }

  const dir = bd.overloaded ? "overloaded" : bd.suggestions.length > 0 ? "tight" : "clear";
  const tone = dir === "overloaded" ? tc.danger : dir === "tight" ? tc.warning : tc.statHigh;
  const chipLabel = dir === "overloaded" ? "OVERLOADED" : dir === "tight" ? "TIGHT" : "CLEAR";

  // The task contract is "every active factor is visible" — never truncate.
  const capacity = bd.capacitySources;
  const load = bd.loadSources;
  const tips = bd.suggestions;
  const severity = bd.overloaded
    ? (bd.headroom < -Math.max(25, bd.transitCapacity * 0.5) ? "CRITICAL" : "STRAINED")
    : dir === "tight" ? "STRAINED" : "STABLE";

  const headline = `Load ${Math.round(bd.transitLoad)} / capacity ${Math.round(bd.transitCapacity)} · ${
    bd.headroom >= 0 ? `${Math.round(bd.headroom)} headroom` : `${Math.round(-bd.headroom)} over`
  }`;

  return (
    <CrisisReportFrame
      title="TRANSIT GRID BREAKDOWN"
      icon="navigation"
      tone={tone}
      statusLabel={chipLabel}
      severityLabel={severity}
      headline={headline}
      consequence={bd.overloaded
        ? `Overload drains ${TRANSIT_OVERLOAD_HAPPINESS_PENALTY} happiness and ${TRANSIT_OVERLOAD_EMPLOYMENT_PENALTY} employment every tick, isolating workers from jobs and services.`
        : "Headroom keeps residents moving to jobs, clinics, shelters, and emergency response routes."}
      actionCount={tips.length}
      detailsLabel="CAPACITY / ACTIVE LOAD"
      details={<View style={styles.cols}>
        <View style={styles.col}>
          <Text style={[styles.colLabel, { color: tc.statHigh }]}>CAPACITY</Text>
          {capacity.length === 0 ? (
            <Text style={[styles.empty, { color: tc.textMuted }]}>No transit lines yet</Text>
          ) : (
            capacity.map((c) => (
              <View key={`c-${c.label}`} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.rowAmt, { color: tc.statHigh }]}>{`+${Math.round(c.amount)}`}</Text>
              </View>
            ))
          )}
        </View>
        <View style={styles.col}>
          <Text style={[styles.colLabel, { color: tc.danger }]}>LOAD</Text>
          {load.length === 0 ? (
            <Text style={[styles.empty, { color: tc.textMuted }]}>None</Text>
          ) : (
            load.map((c) => (
              <View key={`l-${c.label}`} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.rowAmt, { color: tc.danger }]}>{`${Math.round(c.amount)}`}</Text>
              </View>
            ))
          )}
        </View>
      </View>}
    >
      {railDiag.warnings.length > 0 && (
        <View style={{ marginTop: 8, padding: 8, backgroundColor: tc.danger + "20", borderRadius: 4, borderWidth: 1, borderColor: tc.danger, marginBottom: 8 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: tc.danger, marginBottom: 4 }}>RAIL NETWORK ALERTS</Text>
          {railDiag.warnings.map(w => (
            <Text key={w} style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: tc.danger }}>• {w}</Text>
          ))}
        </View>
      )}
      {railDiag.completed > 0 && (
        <View style={{ marginTop: 8, padding: 8, backgroundColor: tc.info + "10", borderRadius: 4, borderWidth: 1, borderColor: tc.info + "40", marginBottom: 8 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: tc.info, marginBottom: 4 }}>RAIL NETWORK CONSTRAINTS & OPERATIONS</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: tc.textSecondary, marginBottom: 2 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>Passenger Capacity:</Text> {railDiag.passengerCapacity} (Routes: {railDiag.completed})
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: tc.textSecondary, marginBottom: 2 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>Freight Capacity:</Text> {railDiag.freightCapacity}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: tc.textSecondary, marginBottom: 2 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>Operating Cost:</Text> {railDiag.operatingCost} CR / tick
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: tc.textSecondary, marginBottom: 2 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>Safety Rating:</Text> {railDiag.safetyRating}%
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: tc.textSecondary, marginTop: 4 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>Policy Effects:</Text>
            {railDiag.policyEffects.railPublicAccessMandate ? " Public Access Mandate (+Passenger, +Operating Cost)." : ""}
            {railDiag.policyEffects.freightPriorityDispatch ? " Freight Priority (+Freight, -Passenger)." : ""}
            {railDiag.policyEffects.railSafetyAuthority ? " Safety Authority (+Safety, +Operating Cost)." : ""}
            {!railDiag.policyEffects.railPublicAccessMandate && !railDiag.policyEffects.freightPriorityDispatch && !railDiag.policyEffects.railSafetyAuthority && " None active."}
          </Text>
        </View>
      )}
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
                onPress={() => navigateToTransitSuggestion(t.target!)}
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

import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import {
  computeCommunicationsBreakdown,
  COMMUNICATIONS_STRENGTH_CAP,
} from "@/engine/communicationsBreakdown";
import type { GameState } from "@/engine/types";
import CrisisReportFrame from "@/components/CrisisReportFrame";

export default function CommunicationsBreakdownCard({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  const breakdown = useMemo(
    () => computeCommunicationsBreakdown(state.buildings, state.units, state.utilities?.commsStrength),
    [state.buildings, state.units, state.utilities?.commsStrength],
  );
  const tone = breakdown.band === "CRITICAL"
    ? tc.danger
    : breakdown.band === "DEGRADED"
      ? tc.warning
      : tc.statHigh;
  const contributorTotal = breakdown.contributors.reduce((sum, contributor) => sum + contributor.amount, 0);
  const severity = breakdown.strength < 15 ? "COLLAPSING" : breakdown.band === "CRITICAL" ? "CRITICAL" : breakdown.band === "DEGRADED" ? "STRAINED" : "STABLE";

  return (
    <CrisisReportFrame
      title="COMMUNICATIONS STRENGTH"
      icon="radio"
      tone={tone}
      statusLabel={breakdown.band}
      severityLabel={severity}
      headline={`${Math.round(breakdown.strength)}% signal integrity`}
      consequence={breakdown.consequence}
      detailsLabel="SIGNAL CAPACITY / CONTRIBUTING ASSETS"
      details={<>
        <View style={[styles.track, { backgroundColor: tc.border }]}>
          <View style={[styles.fill, { width: `${Math.min(Math.max(breakdown.strength, 0), COMMUNICATIONS_STRENGTH_CAP)}%`, backgroundColor: tone }]} />
        </View>
        <Text style={[styles.subheading, { color: tc.textMuted }]}>
        CONTRIBUTING ASSETS · {Math.min(contributorTotal, COMMUNICATIONS_STRENGTH_CAP)}/{COMMUNICATIONS_STRENGTH_CAP} capacity
        </Text>
        {breakdown.contributors.map((contributor) => (
        <View key={contributor.key} style={styles.contributorRow}>
          <Text style={[styles.contributorLabel, { color: tc.textSecondary }]} numberOfLines={1}>
            {contributor.label} × {contributor.count}
          </Text>
          <Text style={[styles.contributorAmount, { color: contributor.amount > 0 ? tc.statHigh : tc.textMuted }]}>
            +{contributor.amount} ({contributor.perAsset}/each)
          </Text>
        </View>
        ))}
      </>}
    />
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  fill: { height: "100%", borderRadius: 3 },
  subheading: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.7, marginBottom: 4 },
  contributorRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingVertical: 3 },
  contributorLabel: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 10 },
  contributorAmount: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
}));
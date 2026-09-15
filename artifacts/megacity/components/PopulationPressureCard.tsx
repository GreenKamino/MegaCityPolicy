import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import HousingCapacitySummary from "@/components/HousingCapacitySummary";
import {
  computePopulationPressure,
  formatPopulationCapacityValue,
} from "@/engine/populationPressure";
import type { GameState } from "@/engine/types";
import { formatPop } from "@/utils/format";

export default function PopulationPressureCard({
  state,
}: {
  state: GameState;
}) {
  const { colors: tc } = useTheme();
  const snapshot = computePopulationPressure(state);
  const shortfalls = snapshot.metrics.filter(
    (item) => item.status === "shortfall",
  ).length;
  const tight = snapshot.metrics.filter(
    (item) => item.status === "tight",
  ).length;
  const tone = shortfalls > 0
    ? tc.danger
    : tight > 0 || snapshot.approachingNextTier
      ? tc.warning
      : tc.statHigh;
  const chip = shortfalls > 0
    ? `${shortfalls} SHORT`
    : tight > 0
      ? `${tight} TIGHT`
      : "READY";
  const reservePct = Math.round(snapshot.reserveRatio * 100);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tc.bgCard,
          borderColor: tc.border,
          borderLeftColor: tone,
        },
      ]}
    >
      <View style={styles.header}>
        <Feather name="users" size={14} color={tone} />
        <Text style={[styles.title, { color: tone }]}>
          POPULATION CAPACITY PLAN
        </Text>
        <View
          style={[
            styles.chip,
            { backgroundColor: tone + "22", borderColor: tone + "55" },
          ]}
        >
          <Text style={[styles.chipText, { color: tone }]}>{chip}</Text>
        </View>
      </View>

      <Text style={[styles.headline, { color: tc.text }]}>
        {snapshot.tier.label} · {formatPop(snapshot.population)} citizens
      </Text>
      <Text style={[styles.subhead, { color: tc.textMuted }]}>
        Targets include a recommended {reservePct}% reserve
        {snapshot.nextTier
          ? ` · next: ${snapshot.nextTier.label} at ${formatPop(snapshot.nextTier.minPopulation)}`
          : " · highest population band"}
      </Text>

      {snapshot.nextTier && (
        <View style={[styles.progressTrack, { backgroundColor: tc.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: snapshot.approachingNextTier
                  ? tc.warning
                  : tc.accent,
                width: `${Math.round(snapshot.progressToNextTier * 100)}%`,
              },
            ]}
          />
        </View>
      )}

      <HousingCapacitySummary state={state} />

      <View style={styles.grid}>
        {snapshot.metrics.map((item) => {
          if (item.id === "housing") return null;
          const itemTone = item.status === "shortfall"
            ? tc.danger
            : item.status === "tight"
              ? tc.warning
              : tc.statHigh;
          const statusLabel = item.status === "shortfall"
            ? "SHORT"
            : item.status === "tight"
              ? "RESERVE"
              : "READY";
          return (
            <View
              key={item.id}
              style={[styles.metric, { borderColor: tc.border }]}
            >
              <View style={styles.metricHeader}>
                <Text style={[styles.metricLabel, { color: tc.textMuted }]}>
                  {item.label}
                </Text>
                <Text style={[styles.metricStatus, { color: itemTone }]}>
                  {statusLabel}
                </Text>
              </View>
              <Text style={[styles.metricValue, { color: tc.text }]}>
                {formatPopulationCapacityValue(item.actual, item.unit)}
                <Text style={{ color: tc.textMuted }}>
                  {" / "}
                  {formatPopulationCapacityValue(item.reserveTarget, item.unit)}
                </Text>
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    flex: 1,
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.6,
  },
  headline: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  subhead: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  metric: {
    minWidth: 138,
    flexBasis: 150,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  metricLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.7,
  },
  metricStatus: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    marginTop: 3,
  },
});
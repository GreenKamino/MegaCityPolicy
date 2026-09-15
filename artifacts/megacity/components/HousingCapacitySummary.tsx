import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import {
  computeHousingCapacityBreakdown,
  getBestBuildableHousingCapacityOption,
  getHousingCapacityRecommendationBlocker,
  getHousingCapacityRecommendationShortfall,
} from "@/engine/housingCapacity";
import { MAX_PENDING_CONSTRUCTION_ORDERS } from "@/engine/pendingConstruction";
import {
  computePopulationPressure,
  formatPopulationCapacityValue,
} from "@/engine/populationPressure";
import type { GameState } from "@/engine/types";
import { makeThemedStyles } from "@/hooks/useThemedStyles";

export default function HousingCapacitySummary({
  state,
}: {
  state: GameState;
}) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  const snapshot = computePopulationPressure(state);
  const housing = snapshot.metrics.find((item) => item.id === "housing");
  if (!housing) return null;

  const breakdown = computeHousingCapacityBreakdown(state.buildings);
  const gapToDemand = Math.max(0, housing.target - housing.actual);
  const gapToReserve = Math.max(0, housing.reserveTarget - housing.actual);
  const reserveBuffer = Math.max(0, housing.actual - housing.reserveTarget);
  const needsHousing = housing.status === "shortfall" || housing.status === "tight";
  const bestOption = needsHousing
    ? getBestBuildableHousingCapacityOption({
        credits: state.resources?.credits,
        steel: state.resources?.steel,
        availableQueueSlots:
          MAX_PENDING_CONSTRUCTION_ORDERS - (state.pendingConstructions?.length ?? 0),
      })
    : null;
  const recommendationBlocker = needsHousing && !bestOption
    ? getHousingCapacityRecommendationBlocker({
        credits: state.resources?.credits,
        steel: state.resources?.steel,
        availableQueueSlots:
          MAX_PENDING_CONSTRUCTION_ORDERS - (state.pendingConstructions?.length ?? 0),
      })
    : null;
  const recommendationShortfall = needsHousing && !bestOption
    ? getHousingCapacityRecommendationShortfall({
        credits: state.resources?.credits,
        steel: state.resources?.steel,
        availableQueueSlots:
          MAX_PENDING_CONSTRUCTION_ORDERS - (state.pendingConstructions?.length ?? 0),
      })
    : null;
  const statusTone =
    housing.status === "shortfall"
      ? tc.danger
      : housing.status === "tight"
        ? tc.warning
        : tc.statHigh;
  const statusLabel =
    housing.status === "shortfall"
      ? "SHORTFALL"
      : housing.status === "tight"
        ? "RESERVE TIGHT"
        : "RESERVE READY";
  const openHousingBuild = () => {
    const highlight = bestOption
      ? `&highlight=${encodeURIComponent(bestOption.key)}&hl=${Date.now()}`
      : "";
    router.push(`/(game)/construction?category=housing${highlight}`);
  };

  return (
    <View
      style={[
        styles.section,
        { backgroundColor: tc.bgCard, borderColor: tc.border },
      ]}
    >
      <View style={styles.header}>
        <Feather name="home" size={13} color={statusTone} />
        <Text style={[styles.title, { color: statusTone }]}>
          HOUSING CAPACITY DETAIL
        </Text>
        <Text style={[styles.status, { color: statusTone }]}>
          {statusLabel}
        </Text>
      </View>

      <Text style={[styles.explanation, { color: tc.textMuted }]}>
        Permanent housing carries everyday residents. Emergency shelter keeps
        people alive during displacement and crisis; it is not a substitute
        for a permanent housing pipeline.
      </Text>

      <View style={styles.capacitySplit}>
        <View style={[styles.capacityCard, { borderColor: tc.border }]}>
          <Text style={[styles.capacityLabel, { color: tc.textMuted }]}>
            PERMANENT / STANDARD
          </Text>
          <Text style={[styles.capacityValue, { color: tc.text }]}>
            {formatPopulationCapacityValue(
              breakdown.baseline + breakdown.permanent,
              "people",
            )}
          </Text>
          <Text style={[styles.capacityNote, { color: tc.textMuted }]}>
            Includes {formatPopulationCapacityValue(breakdown.baseline, "people")} baseline district shelter
          </Text>
        </View>
        <View style={[styles.capacityCard, { borderColor: tc.border }]}>
          <Text style={[styles.capacityLabel, { color: tc.textMuted }]}>
            EMERGENCY SHELTER
          </Text>
          <Text style={[styles.capacityValue, { color: tc.warning }]}>
            {formatPopulationCapacityValue(breakdown.emergency, "people")}
          </Text>
          <Text style={[styles.capacityNote, { color: tc.textMuted }]}>
            Crisis beds, not permanent homes
          </Text>
        </View>
      </View>

      <View style={styles.readoutGrid}>
        <Readout
          label="CURRENT TOTAL"
          value={formatPopulationCapacityValue(housing.actual, housing.unit)}
          color={tc.text}
          styles={styles}
          tc={tc}
        />
        <Readout
          label="DEMAND TARGET"
          value={formatPopulationCapacityValue(housing.target, housing.unit)}
          color={tc.text}
          styles={styles}
          tc={tc}
        />
        <Readout
          label="RESERVE TARGET"
          value={formatPopulationCapacityValue(housing.reserveTarget, housing.unit)}
          color={tc.text}
          styles={styles}
          tc={tc}
        />
        <Readout
          label="GAP TO DEMAND"
          value={
            gapToDemand > 0
              ? formatPopulationCapacityValue(gapToDemand, housing.unit)
              : "MET"
          }
          color={gapToDemand > 0 ? tc.danger : tc.statHigh}
          styles={styles}
          tc={tc}
        />
        <Readout
          label="GAP TO RESERVE"
          value={
            gapToReserve > 0
              ? formatPopulationCapacityValue(gapToReserve, housing.unit)
              : `${formatPopulationCapacityValue(reserveBuffer, housing.unit)} BUFFER`
          }
          color={gapToReserve > 0 ? tc.warning : tc.statHigh}
          styles={styles}
          tc={tc}
        />
      </View>

      <Text style={[styles.gainTitle, { color: tc.accent }]}>
        PER-BUILDING CAPACITY GAINS
      </Text>
      <View style={styles.gainGrid}>
        {breakdown.contributions.map((entry) => (
          <View
            key={entry.key}
            style={[styles.gainRow, { borderColor: tc.border }]}
          >
            <View style={styles.gainCopy}>
              <Text style={[styles.gainLabel, { color: tc.text }]}>
                {entry.label}
              </Text>
              <Text style={[styles.gainKind, { color: tc.textMuted }]}>
                {entry.kind === "emergency" ? "EMERGENCY SHELTER" : "PERMANENT / STANDARD"}
              </Text>
            </View>
            <Text style={[styles.gainValue, { color: entry.kind === "emergency" ? tc.warning : tc.statHigh }]}>
              +{formatPopulationCapacityValue(entry.perBuilding, "people")}
            </Text>
          </View>
        ))}
      </View>

      {needsHousing && (
        <View style={[styles.recommendation, { borderColor: statusTone + "66", backgroundColor: tc.bgSecondary }]}>
          <View style={styles.recommendationHeader}>
            <Feather name="crosshair" size={12} color={statusTone} />
            <Text style={[styles.recommendationTitle, { color: statusTone }]}>
              CAPACITY RECOMMENDATION
            </Text>
          </View>
          {bestOption ? (
            <>
              <Text style={[styles.recommendationBody, { color: tc.text }]}>
                Prioritize {bestOption.label}
              </Text>
              <Text style={[styles.recommendationDetail, { color: tc.textMuted }]}>
                +{formatPopulationCapacityValue(bestOption.perBuilding, "people")}{" "}
                {bestOption.kind === "emergency"
                  ? "emergency shelter — crisis beds, not permanent homes"
                  : "permanent housing capacity"}
              </Text>
              <Text style={[styles.recommendationCost, { color: tc.text }]}>
                Cost: {bestOption.cost.toLocaleString()} credits +{" "}
                {bestOption.steelCost.toLocaleString()} steel
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.recommendationDetail, { color: tc.textMuted }]}>
                {recommendationBlocker}
              </Text>
              {recommendationShortfall && (
                <Text style={[styles.recommendationCost, { color: tc.text }]}>
                  Minimum needed for {recommendationShortfall.option.label}:{" "}
                  {formatHousingShortfall(recommendationShortfall)}
                </Text>
              )}
            </>
          )}
        </View>
      )}

      {needsHousing && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open housing construction"
          onPress={openHousingBuild}
          style={({ pressed }) => [
            styles.buildAction,
            { borderColor: tc.accent + "66" },
            pressed && { opacity: 0.65 },
            Platform.OS === "web" && { cursor: "pointer" as any },
          ]}
        >
          <Feather name="tool" size={13} color={tc.accent} />
          <Text style={[styles.buildActionText, { color: tc.accent }]}>
            OPEN HOUSING BUILD
          </Text>
          <Feather name="chevron-right" size={14} color={tc.accent} />
        </Pressable>
      )}
    </View>
  );
}

function formatHousingShortfall({
  credits,
  steel,
}: {
  credits: number;
  steel: number;
}): string {
  const missing: string[] = [];
  if (credits > 0) {
    missing.push(
      `${credits.toLocaleString()} more credit${credits === 1 ? "" : "s"}`,
    );
  }
  if (steel > 0) {
    missing.push(
      `${steel.toLocaleString()} more steel`,
    );
  }
  return missing.join(" + ");
}

function Readout({
  label,
  value,
  color,
  styles,
  tc,
}: {
  label: string;
  value: string;
  color: string;
  styles: ReturnType<typeof useStyles>;
  tc: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[styles.readout, { borderColor: tc.border }]}>
      <Text style={[styles.readoutLabel, { color: tc.textMuted }]}>{label}</Text>
      <Text style={[styles.readoutValue, { color }]}>{value}</Text>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors) => StyleSheet.create({
  section: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 5,
  },
  title: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  status: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.5,
  },
  explanation: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 15,
  },
  capacitySplit: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  capacityCard: {
    flex: 1,
    minWidth: 145,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  capacityLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.6,
  },
  capacityValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    marginTop: 3,
  },
  capacityNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
  },
  readoutGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 8,
  },
  readout: {
    flex: 1,
    minWidth: 105,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  readoutLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 0.5,
  },
  readoutValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    marginTop: 3,
  },
  gainTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.7,
    marginTop: 10,
    marginBottom: 5,
  },
  gainGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  gainRow: {
    flex: 1,
    minWidth: 155,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  gainCopy: {
    flex: 1,
  },
  gainLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
  },
  gainKind: {
    fontFamily: "Inter_400Regular",
    fontSize: 7,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  gainValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  recommendation: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginTop: 10,
  },
  recommendationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  recommendationTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.7,
  },
  recommendationBody: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    marginTop: 4,
  },
  recommendationDetail: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    lineHeight: 13,
    marginTop: 2,
  },
  recommendationCost: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    marginTop: 5,
  },
  buildAction: {
    minHeight: 36,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  buildActionText: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.7,
  },
}));
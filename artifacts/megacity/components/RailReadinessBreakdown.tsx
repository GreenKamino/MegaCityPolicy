import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { getRailNetworkDiagnostics } from "@/engine/railNetwork";
import type { GameState } from "@/engine/types";

function formatContribution(
  effect: number | undefined,
  label: string,
): string | null {
  if (!effect) return null;
  return `+${effect} ${label}`;
}

/**
 * Shows the rail train modules that are currently helping the force.
 *
 * The rail engine owns the operational filter: only completed corridors with
 * every accountable job staffed appear in getRailNetworkDiagnostics(). Keeping
 * this component read-only prevents the military screen from inventing a
 * second definition of an active corridor.
 */
export default function RailReadinessBreakdown({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const rail = getRailNetworkDiagnostics(state);

  if (rail.operationalTrainUpgrades.length === 0) return null;

  return (
    <View testID="military-rail-readiness-breakdown" style={[styles.container, { borderColor: tc.border }]}>
      <Text style={[styles.title, { color: tc.info }]}>OPERATIONAL RAIL MODULES</Text>
      {rail.operationalTrainUpgrades.map((upgrade) => {
        const contributions = [
          formatContribution(upgrade.effects.armedSecurityBenefit, "armed security"),
          formatContribution(upgrade.effects.troopTransportCapacity, "troop movement capacity"),
          formatContribution(upgrade.effects.safetyResilience, "rail safety resilience"),
        ].filter((value): value is string => value !== null);

        return (
          <View key={`${upgrade.corridorId}:${upgrade.upgradeId}`} style={styles.row}>
            <View style={styles.copy}>
              <Text style={[styles.name, { color: tc.text }]}>{upgrade.name}</Text>
              <Text style={[styles.route, { color: tc.textMuted }]}>
                {upgrade.endpointName} corridor
              </Text>
            </View>
            <Text style={[styles.effect, { color: tc.statHigh }]}>{contributions.join(" · ")}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 8,
    gap: 5,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.7,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    lineHeight: 14,
  },
  route: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    lineHeight: 12,
  },
  effect: {
    flexShrink: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    lineHeight: 13,
    textAlign: "right",
  },
});
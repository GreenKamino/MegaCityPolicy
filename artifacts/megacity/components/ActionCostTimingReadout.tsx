import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import {
  formatActionCostTiming,
  type ActionCostTiming,
  type ActionCostTimingRow,
} from "@/engine/actionCostTiming";

type Props = {
  model: ActionCostTiming;
  includeBehavior?: boolean;
  compact?: boolean;
};

const BEHAVIOR_KEYS = new Set<ActionCostTimingRow["key"]>([
  "affordability",
  "insufficient-funds",
  "cancellation",
]);

export default function ActionCostTimingReadout({
  model,
  includeBehavior = false,
  compact = false,
}: Props) {
  const { colors } = useTheme();
  const rows = formatActionCostTiming(model).filter(
    (row) => includeBehavior || !BEHAVIOR_KEYS.has(row.key),
  );

  return (
    <View style={[styles.grid, compact && styles.gridCompact]}>
      {rows.map((row) => {
        const warning = row.key === "affordability" || row.key === "cooldown-remaining";
        const positive = row.key === "running-income";
        return (
          <View
            key={row.key}
            style={[
              styles.cell,
              compact && styles.cellCompact,
              { borderColor: colors.border, backgroundColor: colors.bg },
            ]}
          >
            <Text style={[styles.label, { color: warning ? colors.warning : colors.textMuted }]}>
              {row.label}
            </Text>
            <Text
              style={[
                styles.value,
                { color: positive ? colors.accent : warning ? colors.warning : colors.text },
              ]}
            >
              {row.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  gridCompact: {
    gap: 4,
    marginTop: 6,
  },
  cell: {
    minWidth: 132,
    flexGrow: 1,
    flexBasis: "30%",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  cellCompact: {
    minWidth: 112,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  label: {
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 0.8,
  },
  value: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    marginTop: 2,
  },
});
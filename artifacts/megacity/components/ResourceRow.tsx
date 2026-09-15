import React from "react";
import { StyleSheet, Text, View } from "react-native";

import AnimatedNumber from "@/components/AnimatedNumber";
import HoverTooltip from "@/components/HoverTooltip";
import { useTheme } from "@/context/ThemeContext";

type Props = {
  label: string;
  value: number | string;
  unit?: string;
  delta?: number;
  color?: string;
  compact?: boolean;
  tooltip?: string;
  warnBelow?: number;
  criticalBelow?: number;
};

function ResourceRow({ label, value, unit = "", delta, color, compact, tooltip, warnBelow, criticalBelow }: Props) {
  const { colors: c } = useTheme();
  const showDelta = delta !== undefined;
  const deltaColor =
    delta === 0 ? c.textMuted : delta! > 0 ? c.accent : c.danger;
  const deltaPrefix = delta! > 0 ? "+" : "";

  let resolvedColor = color;
  if (!resolvedColor && typeof value === "number") {
    if (criticalBelow !== undefined && value <= criticalBelow) {
      resolvedColor = c.danger;
    } else if (warnBelow !== undefined && value <= warnBelow) {
      resolvedColor = c.warning;
    }
  }

  const row = (
    <View style={[styles.row, { borderBottomColor: c.border }, compact && styles.compactRow]}>
      <Text style={[styles.label, { color: c.textSecondary }, compact && styles.compactLabel]}>{label}</Text>
      <View style={styles.right}>
        {showDelta && (
          <Text style={[styles.delta, { color: deltaColor }]}>
            ({deltaPrefix}
            {delta}
            {unit})
          </Text>
        )}
        {typeof value === "number" ? (
          <View style={styles.valueRow}>
            <AnimatedNumber
              value={value}
              style={[styles.value, { color: resolvedColor ?? c.text }, compact && styles.compactValue]}
            />
            {unit && !showDelta ? (
              <Text style={[styles.unit, { color: c.textMuted }]}> {unit}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.value, { color: resolvedColor ?? c.text }, compact && styles.compactValue]}>
            {value}
            {unit && !showDelta && (
              <Text style={[styles.unit, { color: c.textMuted }]}> {unit}</Text>
            )}
          </Text>
        )}
      </View>
    </View>
  );

  if (tooltip) {
    return <HoverTooltip text={tooltip}>{row}</HoverTooltip>;
  }

  return row;
}

export default React.memo(ResourceRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  compactRow: {
    paddingVertical: 5,
  },
  label: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  compactLabel: {
    fontSize: 11,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  compactValue: {
    fontSize: 12,
  },
  unit: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  delta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});

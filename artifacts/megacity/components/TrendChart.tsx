import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";

type TrendChartProps = {
  data: number[];
  label: string;
  height?: number;
  color?: string;
  showValues?: boolean;
  format?: (v: number) => string;
};

const CHART_CHARS = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];

export default function TrendChart({
  data,
  label,
  height = 40,
  color: colorProp,
  showValues = true,
  format,
}: TrendChartProps) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const color = colorProp ?? Colors.accent;
  const { bars, min, max, current, delta } = useMemo(() => {
    if (data.length === 0) return { bars: "", min: 0, max: 0, current: 0, delta: 0 };
    const mn = Math.min(...data);
    const mx = Math.max(...data);
    const range = mx - mn || 1;
    const barStr = data
      .map((v) => {
        const normalized = Math.floor(((v - mn) / range) * 7);
        return CHART_CHARS[Math.min(7, Math.max(0, normalized))];
      })
      .join("");
    const cur = data[data.length - 1];
    const prev = data.length > 1 ? data[data.length - 2] : cur;
    return { bars: barStr, min: mn, max: mx, current: cur, delta: cur - prev };
  }, [data]);

  const fmt = format ?? ((v: number) => v >= 10000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString());

  if (data.length < 2) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.noData}>Collecting data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {showValues && (
          <View style={styles.valueRow}>
            <Text style={[styles.currentValue, { color }]}>{fmt(current)}</Text>
            <Text style={[styles.delta, { color: delta > 0 ? Colors.accent : delta < 0 ? Colors.danger : Colors.textMuted }]}>
              {delta > 0 ? "\u25B2" : delta < 0 ? "\u25BC" : "\u25C6"}{" "}
              {Math.abs(delta) >= 10000 ? `${(Math.abs(delta) / 1000).toFixed(0)}k` : Math.abs(delta).toLocaleString()}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.sparkline, { color, height }]} numberOfLines={1}>
        {bars}
      </Text>
      <View style={styles.rangeRow}>
        <Text style={styles.rangeText}>L: {fmt(min)}</Text>
        <Text style={styles.rangeText}>H: {fmt(max)}</Text>
      </View>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  label: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  currentValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  delta: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 0.3,
  },
  sparkline: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    letterSpacing: -0.5,
    lineHeight: 22,
    overflow: "hidden",
  },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  rangeText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    letterSpacing: 0.5,
  },
  noData: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 4,
  },
}));

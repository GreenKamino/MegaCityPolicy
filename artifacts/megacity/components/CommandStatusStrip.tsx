import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { type LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useGameStateSelector } from "@/context/GameContext";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { formatDateShort } from "@/engine/clock";
import type { GameEvent, Resources } from "@/engine/types";
import { WIDE_DESKTOP_STATUS_MIN_HEIGHT } from "@/components/desktopCommandLayout";

type Severity = "stable" | "strained" | "critical" | "collapsing";

function toneForSeverity(severity: Severity, c: ThemePalette): string {
  if (severity === "collapsing" || severity === "critical") return c.danger;
  if (severity === "strained") return c.warning;
  return c.accent;
}

function severityForInputs(
  events: GameEvent[],
  resources: Resources,
): { severity: Severity; threatCount: number; cue: string } {
  const critical = events.filter((event) => event.severity === "critical").length;
  const urgent = events.filter((event) => event.severity === "high").length;
  const threatCount = events.length;
  const emptySupplies = [resources.food, resources.water, resources.power].filter(
    (value: unknown) => typeof value === "number" && value <= 0,
  ).length;
  const thinSupplies = [resources.food, resources.water, resources.power].filter(
    (value: unknown) => typeof value === "number" && value < 50,
  ).length;

  if (critical > 0 || emptySupplies >= 2) {
    return {
      severity: "collapsing",
      threatCount,
      cue: critical > 0 ? "COUNTERMEASURES REQUIRED" : "CORE SUPPLIES FAILING",
    };
  }
  if (urgent > 0 || emptySupplies === 1 || thinSupplies >= 2) {
    return {
      severity: "critical",
      threatCount,
      cue: urgent > 0 ? "ACTIVE THREAT / RESPONSE WINDOW" : "SUPPLY MARGINS CRITICAL",
    };
  }
  if (events.length > 0 || thinSupplies > 0) {
    return {
      severity: "strained",
      threatCount,
      cue: events.length > 0 ? "MONITOR INCIDENTS / MITIGATE EARLY" : "RESERVES UNDER PRESSURE",
    };
  }
  return { severity: "stable", threatCount: 0, cue: "NO IMMEDIATE COUNTERMEASURE REQUIRED" };
}

function ResourceReadout({
  label,
  value,
  tone,
  compact,
  onPress,
  actionLabel,
}: {
  label: string;
  value: string;
  tone: string;
  compact: boolean;
  onPress: () => void;
  actionLabel: string;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}. ${actionLabel}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.readout,
        compact && styles.readoutCompact,
        { borderColor: c.border },
        pressed && { backgroundColor: c.bgElevated, borderColor: c.borderBright },
        Platform.OS === "web" && { cursor: "pointer" as any },
      ]}
    >
      <Text style={[styles.readoutLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.readoutValue, { color: tone }]} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

type ResourceKey = "credits" | "food" | "water" | "power";

function navigateToResource(key: ResourceKey): void {
  if (key === "credits") {
    router.push("/(game)/economy");
    return;
  }
  router.push({
    pathname: "/(game)/construction",
    params: { category: key === "power" ? "energy" : key },
  });
}

export default function CommandStatusStrip({ desktopCompact = false }: { desktopCompact?: boolean }) {
  const { colors: c } = useTheme();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const compact = measuredWidth === 0 || measuredWidth < 640;
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setMeasuredWidth((current) => current === nextWidth ? current : nextWidth);
  }, []);
  const city = useGameStateSelector((state) => state.cityName ?? "UNNAMED SECTOR");
  const title = useGameStateSelector((state) => state.playerTitle ?? "SECTOR MARSHAL");
  const tick = useGameStateSelector((state) => state.totalTicks ?? 0);
  const gameDate = useGameStateSelector((state) => state.gameDate);
  const paused = useGameStateSelector((state) => state.tickPaused ?? false);
  const events = useGameStateSelector((state) => state.activeEvents);
  const resources = useGameStateSelector((state) => state.resources);
  const status = useMemo(
    () => severityForInputs(events ?? [], resources ?? ({} as Resources)),
    [events, resources],
  );
  const statusTone = toneForSeverity(status.severity, c);
  const threatLabel = status.threatCount > 0
    ? `${status.threatCount} THREAT${status.threatCount === 1 ? "" : "S"}`
    : status.severity === "stable"
      ? "CLEAR"
      : "SUPPLY ALERT";

  const creditLabel = useMemo(() => Math.floor(resources?.credits ?? 0).toLocaleString(), [resources?.credits]);
  const foodLabel = useMemo(() => Math.floor(resources?.food ?? 0).toLocaleString(), [resources?.food]);
  const waterLabel = useMemo(() => Math.floor(resources?.water ?? 0).toLocaleString(), [resources?.water]);
  const powerLabel = useMemo(() => Math.floor(resources?.power ?? 0).toLocaleString(), [resources?.power]);
  // Each simulation tick advances the in-game clock by six hours, so four
  // completed ticks represent one day. Day 1 is the starting day at tick 0.
  const dayNumber = Math.floor(Math.max(0, tick) / 4) + 1;
  const dateLabel = gameDate ? formatDateShort(gameDate) : "DATE UNKNOWN";
  const resourceAction = (label: string) => `Open ${label.toLowerCase()} management.`;

  return (
    <View
      onLayout={onLayout}
      testID="command-status-strip"
      style={[
        styles.container,
        compact && !desktopCompact && styles.containerCompact,
        desktopCompact && styles.containerDesktopCompact,
        { backgroundColor: c.bgSecondary, borderBottomColor: c.border },
      ]}
    >
      <View style={styles.identity}>
        <View style={[styles.signal, { backgroundColor: statusTone }]} />
        <View style={styles.identityText}>
          <Text style={[styles.city, { color: c.text }]} numberOfLines={1}>
            {city}
          </Text>
          {!desktopCompact ? (
            <>
              <Text style={[styles.role, { color: c.textMuted }]} numberOfLines={1}>
                {title} · TICK {String(tick).padStart(4, "0")}
              </Text>
              <Text style={[styles.date, { color: c.textMuted }]} numberOfLines={1}>
                DAY {String(dayNumber).padStart(3, "0")} · {dateLabel}
              </Text>
            </>
          ) : (
            <Text style={[styles.role, { color: c.textMuted }]} numberOfLines={1}>
              T{String(tick).padStart(4, "0")} · DAY {String(dayNumber).padStart(3, "0")} · {dateLabel}
            </Text>
          )}
        </View>
        <View style={[styles.statusChip, { borderColor: statusTone + "88", backgroundColor: statusTone + "14" }]}>
          <Feather name={paused ? "pause" : "radio"} size={10} color={statusTone} />
          <Text style={[styles.statusText, { color: statusTone }]}>
            {paused ? `PAUSED · ${status.severity.toUpperCase()}` : status.severity.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={[styles.readouts, compact && !desktopCompact && styles.readoutsCompact, desktopCompact && styles.readoutsDesktopCompact]}>
        <ResourceReadout
          label="CREDITS"
          value={creditLabel}
          tone={(resources?.credits ?? 0) <= 0 ? c.danger : c.accent}
          compact={compact && !desktopCompact}
          onPress={() => navigateToResource("credits")}
          actionLabel={resourceAction("credits")}
        />
        <ResourceReadout
          label="FOOD"
          value={foodLabel}
          tone={(resources?.food ?? 0) < 50 ? c.danger : c.accent}
          compact={compact && !desktopCompact}
          onPress={() => navigateToResource("food")}
          actionLabel={resourceAction("food")}
        />
        <ResourceReadout
          label="WATER"
          value={waterLabel}
          tone={(resources?.water ?? 0) < 50 ? c.danger : c.info}
          compact={compact && !desktopCompact}
          onPress={() => navigateToResource("water")}
          actionLabel={resourceAction("water")}
        />
        <ResourceReadout
          label="POWER"
          value={powerLabel}
          tone={(resources?.power ?? 0) < 50 ? c.danger : c.warning}
          compact={compact && !desktopCompact}
          onPress={() => navigateToResource("power")}
          actionLabel={resourceAction("power")}
        />
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${threatLabel}. ${status.cue}`}
          style={[styles.threatReadout, compact && styles.threatReadoutCompact, { borderColor: statusTone + "66" }]}
        >
          <Feather name={status.threatCount > 0 ? "alert-triangle" : "shield"} size={10} color={statusTone} />
          <Text style={[styles.threatValue, { color: statusTone }]}>
            {threatLabel}
          </Text>
          <Text style={[styles.threatCue, { color: c.textMuted }]} numberOfLines={1}>
            {status.cue}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: Platform.OS === "web" ? 44 : 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "web" ? 4 : 6,
    borderBottomWidth: 1,
    gap: Platform.OS === "web" ? 8 : 10,
  },
  containerCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 5,
  },
  containerDesktopCompact: {
    minHeight: WIDE_DESKTOP_STATUS_MIN_HEIGHT,
    paddingVertical: 3,
    gap: 6,
  },
  identity: {
    flex: 1,
    minWidth: 150,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  signal: {
    width: 3,
    height: 28,
  },
  identityText: {
    minWidth: 0,
    flex: 1,
  },
  city: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  role: {
    marginTop: 2,
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  date: {
    marginTop: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.7,
  },
  readouts: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 5,
    maxWidth: Platform.OS === "web" ? 540 : 230,
    flexShrink: 1,
  },
  readoutsCompact: {
    width: "100%",
    maxWidth: undefined,
    flexShrink: 0,
    flexWrap: "wrap",
  },
  readoutsDesktopCompact: {
    maxWidth: 500,
    gap: 3,
  },
  readout: {
    minWidth: 54,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 2,
  },
  readoutCompact: {
    minWidth: 45,
    flexGrow: 1,
  },
  readoutLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 0.65,
  },
  readoutValue: {
    marginTop: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  threatReadout: {
    minWidth: 132,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: 2,
  },
  threatReadoutCompact: {
    flex: 1,
    minWidth: 0,
  },
  threatValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.55,
  },
  threatCue: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 7,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
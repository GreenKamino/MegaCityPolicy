import * as Clipboard from "expo-clipboard";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View, ScrollView } from "react-native";

import GameModal from "@/components/GameModal";
import { type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameActions, useGameState } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import { buildTickErrorReport } from "@/engine/tickErrorReport";

function TickErrorBadge() {
  const styles = useStyles();
  const { lastTickErrors, state, activeSlot } = useGameState();
  const { dismissTickErrors } = useGameActions();
  const { showToast } = useToast();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleCopyReport = useCallback(async () => {
    if (!lastTickErrors) return;
    try {
      const report = buildTickErrorReport({
        tick: lastTickErrors.tick,
        errors: lastTickErrors.errors,
        cityName: state.cityName ?? "MEGACITY",
        totalTicks: state.totalTicks ?? 0,
        saveSlot: activeSlot,
        // Live ticks don't suppress anything today, so these are normally
        // undefined and the export is unchanged. Passing them through keeps the
        // badge in lockstep with the catch-up modal so suppressed errors are
        // included automatically if per-tick capping is ever added.
        suppressedErrors: lastTickErrors.suppressedErrors,
        suppressedCount: lastTickErrors.suppressedCount,
      });
      await Clipboard.setStringAsync(report);
      showToast("Error report copied to clipboard", "success");
    } catch (e) {
      console.warn("Copy tick error report failed:", e);
      showToast("Copy failed", "danger");
    }
  }, [lastTickErrors, state.cityName, state.totalTicks, activeSlot, showToast]);

  if (!lastTickErrors || lastTickErrors.errors.length === 0) return null;

  const count = lastTickErrors.errors.length;
  const label = `${count} SUBSYSTEM ${count === 1 ? "ERROR" : "ERRORS"}`;

  const handleDismiss = () => {
    setDetailsOpen(false);
    dismissTickErrors();
  };

  return (
    <>
      <View style={[styles.container, { pointerEvents: "box-none" }]}>
        <Pressable
          onPress={() => setDetailsOpen(true)}
          style={({ pressed }) => [styles.badge, pressed && styles.badgePressed]}
          accessibilityRole="button"
          accessibilityLabel={`${label}. Tap for details.`}
        >
          <Text style={styles.icon}>&#x26A0;</Text>
          <Text style={styles.text}>{label}</Text>
          <Text style={styles.tickHint}>T{lastTickErrors.tick}</Text>
        </Pressable>
      </View>
      <GameModal
        visible={detailsOpen}
        title="// SUBSYSTEM FAILURES"
        message={`Tick ${lastTickErrors.tick} reported ${count} isolated subsystem ${count === 1 ? "failure" : "failures"}. The simulation continues, but the listed systems were skipped this tick. Please report persistent errors.`}
        onDismiss={() => setDetailsOpen(false)}
        buttons={[
          { text: "COPY REPORT", onPress: handleCopyReport },
          { text: "ACKNOWLEDGE", onPress: handleDismiss },
          { text: "CLOSE", style: "cancel" },
        ]}
      >
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {lastTickErrors.errors.map((e, i) => (
            <View key={`${e.subsystem}-${i}`} style={styles.row}>
              <Text style={styles.rowName}>{e.subsystem}</Text>
              <Text style={styles.rowMsg} numberOfLines={3}>{e.error || "unknown error"}</Text>
            </View>
          ))}
        </ScrollView>
      </GameModal>
    </>
  );
}

export default React.memo(TickErrorBadge);

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 78,
    right: 12,
    zIndex: 9991,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(40, 8, 8, 0.92)",
    borderWidth: 1,
    borderColor: "#c8323c",
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  badgePressed: {
    opacity: 0.7,
  },
  icon: {
    color: "#ff6b72",
    fontSize: 12,
  },
  text: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#ff8a91",
    letterSpacing: 1.5,
  },
  tickHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginLeft: 2,
  },
  list: {
    maxHeight: 240,
    marginBottom: 12,
  },
  listContent: {
    gap: 8,
  },
  row: {
    borderLeftWidth: 2,
    borderLeftColor: "#c8323c",
    paddingLeft: 8,
    paddingVertical: 4,
  },
  rowName: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#ff8a91",
    letterSpacing: 1,
    marginBottom: 2,
  },
  rowMsg: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.text,
    lineHeight: 15,
  },
}));

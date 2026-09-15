import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { getActiveLabourDayBooster } from "@/engine/labourDay";
import { getEdictById } from "@/engine/edicts";
import type { GameState } from "@/engine/types";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";

export default function LabourDayBoosterBanner({ state }: { state: GameState }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const active = getActiveLabourDayBooster(state);
  if (!active) return null;
  const definition = getEdictById(active.edictId);
  if (!definition) return null;

  return (
    <View style={styles.banner} accessibilityRole="summary">
      <Feather name="users" size={13} color={colors.accent} />
      <View style={styles.copy}>
        <Text style={styles.title}>LABOUR DAY BOOSTER ACTIVE</Text>
        <Text style={styles.detail}>
          {definition.name.toUpperCase()} · {active.ticksRemaining} TICKS REMAINING
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeThemedStyles((colors: ThemePalette) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 10,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.accent + "66",
      borderRadius: 4,
      backgroundColor: colors.accent + "12",
    },
    copy: { flex: 1, gap: 2 },
    title: {
      color: colors.accent,
      fontFamily: "Inter_700Bold",
      fontSize: 10,
      letterSpacing: 0.8,
    },
    detail: {
      color: colors.textSecondary,
      fontFamily: "Inter_600SemiBold",
      fontSize: 9,
      letterSpacing: 0.4,
    },
  }),
);
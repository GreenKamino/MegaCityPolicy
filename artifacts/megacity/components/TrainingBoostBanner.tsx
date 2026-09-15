// TRAINING BOOST BANNER (Task #533) ─────────────────────────────────
// Persistent, theme-aware indicator shown on the recruitment / military /
// law screens whenever a training-speed boost is live (training
// facilities and/or the Accelerated Training Doctrine edict), so players
// see the discount BEFORE opening an order dialog. Renders nothing when
// no boost is active. Sources come from getTrainingSpeedSourcesLabel so
// the wording always matches the confirmation modals.
import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import {
  getTrainingSpeedReduction,
  getTrainingSpeedSourcesLabel,
  getTrainingDoctrineRemainingTicks,
} from "@/engine/pendingConstruction";
import type { GameState } from "@/engine/types";

export default function TrainingBoostBanner({ state }: { state: GameState }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const reduction = getTrainingSpeedReduction(state);
  const sources = getTrainingSpeedSourcesLabel(state);
  const doctrineTicks = getTrainingDoctrineRemainingTicks(state);
  if (reduction <= 0 || !sources) return null;
  return (
    <View style={styles.banner}>
      <Feather name="zap" size={11} color={Colors.accent} />
      <Text style={styles.text} numberOfLines={2}>
        TRAINING PROGRAMS −{Math.round(reduction * 100)}%
        <Text style={styles.sources}>  ·  {sources}</Text>
        {doctrineTicks !== null && (
          <Text style={styles.expiry}>  ·  doctrine expires in {doctrineTicks} ticks</Text>
        )}
      </Text>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginHorizontal: 10,
      marginTop: 6,
      marginBottom: 2,
      borderWidth: 1,
      borderColor: Colors.accent + "55",
      borderRadius: 4,
      backgroundColor: Colors.accent + "14",
    },
    text: {
      flex: 1,
      color: Colors.accent,
      fontFamily: "Inter_700Bold",
      fontSize: 10,
      letterSpacing: 0.8,
    },
    sources: {
      color: Colors.textSecondary,
      fontFamily: "Inter_600SemiBold",
      fontSize: 9,
      letterSpacing: 0.4,
    },
    expiry: {
      color: Colors.textSecondary,
      fontFamily: "Inter_600SemiBold",
      fontSize: 9,
      letterSpacing: 0.4,
    },
  }),
);

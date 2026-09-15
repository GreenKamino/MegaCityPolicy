import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import GameModal, { type ModalButton } from "@/components/GameModal";
import { useGame } from "@/context/GameContext";
import { useTheme } from "@/context/ThemeContext";
import { formatPop } from "@/utils/format";

/**
 * Global end-state announcement. Fires once when the player city transitions
 * into a terminal ("fallen") or post-human ("ascended-machine" /
 * "ascended-bio") status, then stays dismissed via `endState.acknowledged`
 * until a *new* status transition clears the flag (see
 * engine/endState.ts → processEndStateCheck).
 *
 * - Fallen: surfaces the run summary plus explicit recovery affordances
 *   (load another save / start a fresh city / stay and survey the ruin).
 * - Ascended: celebrates the post-human transition; the player keeps playing,
 *   so a persistent badge in the overview header marks the new mode.
 */
export default function EndStateModal() {
  const { state, setState, startNewGame } = useGame();
  const { colors } = useTheme();

  const endState = state?.endState;
  const status = endState?.status;
  const isTerminal =
    status === "fallen" || status === "ascended-machine" || status === "ascended-bio";
  const visible = isTerminal && !endState?.acknowledged;

  const acknowledge = React.useCallback(() => {
    setState((prev) =>
      prev.endState
        ? { ...prev, endState: { ...prev.endState, acknowledged: true } }
        : prev,
    );
  }, [setState]);

  if (!isTerminal) return null;

  const peakPop = Math.max(
    state.cityStats?.population ?? 0,
    ...(state.statHistory ?? []).map((s) => s.population ?? 0),
  );
  const ticksSurvived = endState?.endedAtTick ?? state.totalTicks ?? 0;
  const techsUnlocked = (state.unlockedTechnologies ?? []).length;

  const title =
    status === "fallen"
      ? "CITY FALLEN"
      : status === "ascended-machine"
      ? "MACHINE ASCENSION"
      : "BIOLOGICAL PERPETUATION";

  const message =
    status === "fallen"
      ? `${endState?.cause ?? "The city has collapsed."} Your reign as Commander ends here.`
      : status === "ascended-machine"
      ? "Your citizens are gone — but the automaton substrate endures. The city now runs on droids. Survival is measured in machines."
      : "Biological population has zeroed — but engineered lineages and clone vats carry life forward. The city perpetuates beyond flesh.";

  const buttons: ModalButton[] =
    status === "fallen"
      ? [
          {
            text: "LOAD A SAVE",
            onPress: () => router.replace("/?slots=1" as never),
          },
          {
            text: "START OVER",
            style: "destructive",
            haptic: "error",
            onPress: () => {
              startNewGame();
              router.replace("/(game)/overview" as never);
            },
          },
          { text: "SURVEY THE RUIN", style: "cancel" },
        ]
      : [{ text: "CONTINUE REIGN" }];

  const accent = status === "fallen" ? colors.danger : colors.accent;

  return (
    <GameModal
      visible={!!visible}
      title={title}
      message={message}
      buttons={buttons}
      onDismiss={acknowledge}
    >
      <View style={[styles.summary, { borderColor: colors.border }]}>
        <Text style={[styles.summaryHeading, { color: accent }]}>FINAL DISPATCH</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>PEAK POPULATION</Text>
          <Text style={[styles.value, { color: colors.text }]}>{formatPop(peakPop)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>TICKS SURVIVED</Text>
          <Text style={[styles.value, { color: colors.text }]}>
            {ticksSurvived.toLocaleString()}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>TECHS UNLOCKED</Text>
          <Text style={[styles.value, { color: colors.text }]}>{techsUnlocked}</Text>
        </View>
      </View>
    </GameModal>
  );
}

const styles = StyleSheet.create({
  summary: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 6,
  },
  summaryHeading: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.4,
    textAlign: "center",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
});

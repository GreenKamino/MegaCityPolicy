import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/context/ThemeContext";
import { useSettings } from "@/context/SettingsContext";
import { USE_NATIVE_DRIVER } from "@/utils/animation";
import type { GameState } from "@/engine/types";
import {
  STARTER_OBJECTIVES,
  currentStarterObjectiveIndex,
  getCurrentStarterObjective,
  shouldShowStarterObjectives,
} from "@/engine/objectives";

type Props = {
  state: GameState;
  // Permanently dismisses the marker for this save. Owner persists the flag.
  onDismiss: () => void;
};

type CardContent = {
  label: string;
  directive: string;
  index: number;
  total: number;
  current: number;
  target: number;
  ratio: number;
};

// Local thousands formatter — avoids leaning on Intl/toLocaleString, which is
// only partially supported under Hermes on device.
function groupThousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Compact, dismissible "current objective" marker shown to genuinely-new
// players on the Overview right after orientation. Points at the next concrete
// early-game goal and advances in place as each is met. See engine/objectives.ts
// for the gating and ordered goal list.
function StarterObjectiveMarker({ state, onDismiss }: Props) {
  const { colors: c } = useTheme();
  const { tipsEnabled, reducedMotion } = useSettings();
  const opacity = useRef(new Animated.Value(0)).current;

  // Engine decides new-player + window + completion gating; tipsEnabled is a
  // UI-only suppression that hides the marker WITHOUT recording a permanent
  // dismissal (turning tips back on brings it back inside the window).
  const objective = getCurrentStarterObjective(state);
  const active = shouldShowStarterObjectives(state) && tipsEnabled && objective != null;

  // Latest content to render, held in state so the card stays populated through
  // the fade-out — the gate can close because every goal is met, at which point
  // `objective` is null but we still want the last card to fade away gracefully.
  const [card, setCard] = useState<CardContent | null>(null);
  // Whether anything is rendered. Stays true during the fade-out, then unmounts.
  const [mounted, setMounted] = useState(false);
  // Mirror of `mounted` for the fade effect so it can early-out without taking a
  // `mounted` dependency (which would retrigger the animation when it flips).
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  // Refresh the rendered content while active (cheap; runs per tick only for the
  // new-player window — every other player short-circuits on `active`).
  useEffect(() => {
    if (active && objective) {
      const p = objective.progress(state);
      setCard({
        label: objective.label,
        directive: objective.directive,
        index: currentStarterObjectiveIndex(state),
        total: STARTER_OBJECTIVES.length,
        current: p.current,
        target: p.target,
        ratio: p.ratio,
      });
    }
  }, [active, objective, state]);

  // Mount + fade in when active; fade out + unmount once the gate closes
  // (window elapsed, all goals met, dismissed, or tips switched off). Deps
  // exclude the objective/progress so advancing to the next goal updates the
  // text in place rather than restarting the animation every tick.
  useEffect(() => {
    if (active) {
      setMounted(true);
      if (reducedMotion) {
        opacity.setValue(1);
        return;
      }
      const anim = Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: USE_NATIVE_DRIVER,
      });
      anim.start();
      return () => anim.stop();
    }
    // Inactive and nothing showing: no work (the common veteran/legacy path).
    if (!mountedRef.current) return;
    if (reducedMotion) {
      opacity.setValue(0);
      setMounted(false);
      return;
    }
    const anim = Animated.timing(opacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    anim.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => anim.stop();
  }, [active, reducedMotion, opacity]);

  if (!mounted || !card) return null;

  const pct = Math.round(card.ratio * 100);

  return (
    <Animated.View
      style={[
        styles.container,
        { borderColor: c.accentDim, backgroundColor: c.accent + "12", opacity },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.badge, { backgroundColor: c.accent }]}>
          <Feather name="target" size={9} color={c.bg} />
          <Text style={[styles.prefix, { color: c.bg }]}>OBJECTIVE</Text>
        </View>
        <Text style={[styles.step, { color: c.textMuted }]}>
          {card.index} OF {card.total}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss objective marker"
          style={({ pressed }) => [styles.dismiss, pressed && { opacity: 0.6 }]}
        >
          <Feather name="x" size={13} color={c.textMuted} />
        </Pressable>
      </View>

      <Text style={[styles.label, { color: c.accent }]}>{card.label}</Text>
      <Text style={[styles.directive, { color: c.textSecondary }]}>{card.directive}</Text>

      <View style={styles.progressRow}>
        <View style={[styles.track, { backgroundColor: c.accent + "22" }]}>
          <View style={[styles.fill, { backgroundColor: c.accent, width: `${pct}%` }]} />
        </View>
        <Text style={[styles.readout, { color: c.textMuted }]}>
          {groupThousands(card.current)} / {groupThousands(card.target)}
        </Text>
      </View>
    </Animated.View>
  );
}

export default React.memo(StarterObjectiveMarker);

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  prefix: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  step: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  dismiss: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  label: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  directive: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
  readout: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
});

import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePathname } from "expo-router";

import { useTheme } from "@/context/ThemeContext";
import { useSettings } from "@/context/SettingsContext";
import { useTutorial } from "@/context/TutorialContext";
import { useGameStateSelector } from "@/context/GameContext";
import { USE_NATIVE_DRIVER } from "@/utils/animation";
import { FEATURE_UNLOCK_LABEL } from "@/engine/hudUnlocks";
import {
  HUD_COACH_TIPS,
  coachTipFeatureForRoute,
  coachTipId,
  shouldShowHudCoachTip,
} from "@/engine/hudCoachTips";

type CardContent = { label: string; text: string };

// Per-tab "coach tip on unlock" overlay. Shows a short, one-line note the first
// time a genuinely-new player opens each newly-unlocked tab, then never again.
// The engine (engine/hudCoachTips.ts) owns the new-player + early-window + unlock
// gating; this component layers the UI-only checks (tips toggle, storage
// readiness, seen-once) and the fade. See engine/hudCoachTips.ts for why this is
// post-orientation and not a duplicate of the *_intro hints.
function HudCoachTipBridge() {
  const { colors: c } = useTheme();
  const { tipsEnabled, reducedMotion } = useSettings();
  const { hasSeenHint, markSeen, loaded } = useTutorial();
  const pathname = usePathname();
  const opacity = useRef(new Animated.Value(0)).current;

  const feature = coachTipFeatureForRoute(pathname);

  // Authoritative gate, driven off live state. Returns a stable boolean that
  // only flips at the window boundary, so the overlay does not re-render every
  // tick. Closes over `feature`; navigation re-renders via usePathname, so the
  // selector is re-read with the new feature each route change.
  const gateOpen = useGameStateSelector((s) =>
    feature ? shouldShowHudCoachTip(s, feature) : false,
  );

  // tipsEnabled is a UI-only suppression that hides the note WITHOUT recording
  // it as seen (turning tips back on inside the window brings it back). `loaded`
  // withholds the note until the seen-set has hydrated, so a cold start cannot
  // flash a tip the player already dismissed.
  const active =
    gateOpen &&
    loaded &&
    tipsEnabled &&
    feature != null &&
    !hasSeenHint(coachTipId(feature));

  // Hold the rendered content so the card stays populated through the fade-out
  // (the gate closes on dismiss or navigation, when `feature` may be null).
  const [card, setCard] = useState<CardContent | null>(null);
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  useEffect(() => {
    if (active && feature) {
      setCard({ label: FEATURE_UNLOCK_LABEL[feature], text: HUD_COACH_TIPS[feature] });
    }
  }, [active, feature]);

  // Fade in when active; fade out + unmount once the gate closes (dismissed,
  // navigated to a non-eligible tab, window elapsed, or tips switched off).
  useEffect(() => {
    if (active) {
      setMounted(true);
      if (reducedMotion) {
        opacity.setValue(1);
        return;
      }
      const anim = Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        useNativeDriver: USE_NATIVE_DRIVER,
      });
      anim.start();
      return () => anim.stop();
    }
    if (!mountedRef.current) return;
    if (reducedMotion) {
      opacity.setValue(0);
      setMounted(false);
      return;
    }
    const anim = Animated.timing(opacity, {
      toValue: 0,
      duration: 260,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    anim.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => anim.stop();
  }, [active, reducedMotion, opacity]);

  if (!mounted || !card) return null;

  const onDismiss = () => {
    if (feature) markSeen(coachTipId(feature));
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { borderColor: c.accentDim, backgroundColor: c.accent + "12", opacity },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.badge, { backgroundColor: c.accent }]}>
          <Feather name="compass" size={9} color={c.bg} />
          <Text style={[styles.prefix, { color: c.bg }]}>GUIDE</Text>
        </View>
        <Text style={[styles.label, { color: c.accent }]} numberOfLines={1}>
          {card.label}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss coach tip"
          style={({ pressed }) => [styles.dismiss, pressed && { opacity: 0.6 }]}
        >
          <Feather name="x" size={13} color={c.textMuted} />
        </Pressable>
      </View>
      <Text style={[styles.text, { color: c.textSecondary }]}>{card.text}</Text>
    </Animated.View>
  );
}

export default React.memo(HudCoachTipBridge);

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
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
  label: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  dismiss: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
});

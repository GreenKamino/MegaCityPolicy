import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

import { type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { USE_NATIVE_DRIVER } from "@/utils/animation";

const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "Menlo, Consolas, monospace",
});

// Minimal, on-theme boot screen: a dark field with a slowly sweeping radar
// (the Commander is always scanning the grid) and a "LOADING" readout.
// No artwork, no heavy assets — just a few lightweight Animated loops so it
// never slows the startup it's meant to cover.
const RADAR = 140;
const R = RADAR / 2;
const BAR_W = 160;

export const STARTUP_GAMEPLAY_TIPS = [
  "GREEN INFRASTRUCTURE steadily restores a damaged biosphere.",
  "Watch the ticker — it surfaces warnings before a crisis reaches the city.",
  "Timed construction orders are paid up front and complete during future ticks.",
  "Use the advisor breakdowns to find the strongest one-tap fix for a problem.",
  "A stable supply chain keeps civilian production moving when resources get tight.",
  "Dispatch patrols early; unrest and crime are easier to contain before they compound.",
  "The Wasteland Atlas reveals discoveries as you explore the world map.",
  "Save often before major decrees, expeditions, or diplomatic gambits.",
] as const;

type LoadingScreenProps = {
  // 0..1 readiness derived from real boot milestones (fonts, save hydration).
  // When omitted the bar is hidden and the screen reads as a plain animated
  // splash (back-compat for any caller that doesn't wire progress).
  progress?: number;
  // Short status line shown in place of the default "LOADING" readout, e.g.
  // "LOADING ASSETS" / "LOADING SECTOR" / "READY".
  label?: string;
};

export default function LoadingScreen({ progress, label }: LoadingScreenProps = {}) {
  const styles = useStyles();
  const fade = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const ping = useRef(new Animated.Value(0)).current;
  const core = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const [dots, setDots] = useState(1);
  const [tipIndex, setTipIndex] = useState(0);

  const hasProgress = typeof progress === "number";

  // Animate the fill bar toward the real readiness value whenever it advances,
  // so the bar reflects genuine boot milestones rather than a fixed timer.
  // A small floor keeps a visible sliver from the first frame.
  useEffect(() => {
    if (!hasProgress) return;
    const clamped = Math.max(0.06, Math.min(1, progress ?? 0));
    const anim = Animated.timing(bar, {
      toValue: clamped,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [bar, hasProgress, progress]);

  useEffect(() => {
    const fadeAnim = Animated.timing(fade, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: USE_NATIVE_DRIVER,
    });

    const sweepAnim = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        isInteraction: false,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );

    const pingAnim = Animated.loop(
      Animated.timing(ping, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.quad),
        isInteraction: false,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );

    const coreAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(core, {
          toValue: 1,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          isInteraction: false,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(core, {
          toValue: 0,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          isInteraction: false,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ])
    );

    fadeAnim.start();
    sweepAnim.start();
    pingAnim.start();
    coreAnim.start();

    const d = setInterval(() => setDots((x) => (x % 3) + 1), 450);
    return () => {
      clearInterval(d);
      fadeAnim.stop();
      sweepAnim.stop();
      pingAnim.stop();
      coreAnim.stop();
    };
  }, [fade, sweep, ping, core]);

  useEffect(() => {
    const tipRotation = setInterval(() => {
      setTipIndex((index) => (index + 1) % STARTUP_GAMEPLAY_TIPS.length);
    }, 3200);
    return () => clearInterval(tipRotation);
  }, []);

  const rotate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const pingScale = ping.interpolate({ inputRange: [0, 1], outputRange: [0.22, 1.12] });
  const pingOpacity = ping.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 0.45, 0],
  });
  const coreScale = core.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] });
  const coreOpacity = core.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.center, { opacity: fade }]}>
        <View style={styles.radar}>
          <View style={[styles.ring, styles.ringOuter]} />
          <View style={[styles.ring, styles.ringMid]} />
          <View style={[styles.ring, styles.ringInner]} />
          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />

          <Animated.View
            style={[
              styles.ping,
              { transform: [{ scale: pingScale }], opacity: pingOpacity, pointerEvents: "none" },
            ]}
          />

          <Animated.View
            style={[styles.sweepWrap, { transform: [{ rotate }], pointerEvents: "none" }]}
          >
            <View style={styles.sweepGlow} />
            <View style={styles.sweepBeam} />
            <View style={styles.sweepTip} />
          </Animated.View>

          <Animated.View
            style={[styles.core, { transform: [{ scale: coreScale }], opacity: coreOpacity }]}
          />
        </View>

        <Text style={styles.loading} numberOfLines={1}>
          {`${label ?? "LOADING"}${".".repeat(dots)}`}
          <Text style={styles.loadingGhost}>{".".repeat(3 - dots)}</Text>
        </Text>

        {hasProgress ? (
          <View style={styles.barTrack}>
            <Animated.View
              style={[
                styles.barFill,
                {
                  width: bar.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, BAR_W],
                  }),
                },
              ]}
            />
          </View>
        ) : null}

        <View
          style={styles.tip}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Gameplay tip: ${STARTUP_GAMEPLAY_TIPS[tipIndex]}`}
        >
          <Text style={styles.tipLabel}>GAMEPLAY TIP</Text>
          <Text style={styles.tipText}>{STARTUP_GAMEPLAY_TIPS[tipIndex]}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => {
  const GREEN = Colors.accent;
  const GREEN_DIM = Colors.accentDim;
  const BG = Colors.bg;
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  radar: {
    width: RADAR,
    height: RADAR,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: GREEN_DIM,
  },
  ringOuter: {
    top: 0,
    left: 0,
    width: RADAR,
    height: RADAR,
    borderRadius: R,
    opacity: 0.28,
  },
  ringMid: {
    top: (RADAR - 92) / 2,
    left: (RADAR - 92) / 2,
    width: 92,
    height: 92,
    borderRadius: 46,
    opacity: 0.32,
  },
  ringInner: {
    top: (RADAR - 44) / 2,
    left: (RADAR - 44) / 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    opacity: 0.4,
  },
  crosshairH: {
    position: "absolute",
    top: R - 0.5,
    left: 0,
    width: RADAR,
    height: 1,
    backgroundColor: GREEN_DIM,
    opacity: 0.15,
  },
  crosshairV: {
    position: "absolute",
    left: R - 0.5,
    top: 0,
    width: 1,
    height: RADAR,
    backgroundColor: GREEN_DIM,
    opacity: 0.15,
  },
  ping: {
    position: "absolute",
    top: 0,
    left: 0,
    width: RADAR,
    height: RADAR,
    borderRadius: R,
    borderWidth: 1,
    borderColor: GREEN,
  },
  sweepWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    width: RADAR,
    height: RADAR,
  },
  // A bright beam from the centre to the edge, with a soft wide trail behind it
  // and a blip at the outer tip — reads as a radar sweep without any gradient.
  sweepBeam: {
    position: "absolute",
    top: 0,
    left: R - 1,
    width: 2,
    height: R,
    backgroundColor: GREEN,
    opacity: 0.85,
  },
  sweepGlow: {
    position: "absolute",
    top: 0,
    left: R - 11,
    width: 22,
    height: R,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    backgroundColor: GREEN,
    opacity: 0.07,
  },
  sweepTip: {
    position: "absolute",
    top: -3,
    left: R - 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
  },
  core: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GREEN,
  },
  loading: {
    fontFamily: MONO,
    fontSize: 13,
    letterSpacing: 6,
    color: GREEN,
    fontWeight: "700",
  },
  loadingGhost: {
    color: "transparent",
  },
  barTrack: {
    marginTop: 18,
    width: BAR_W,
    height: 3,
    borderRadius: 2,
    backgroundColor: GREEN_DIM,
    opacity: 0.9,
    overflow: "hidden",
  },
  barFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: GREEN,
  },
  tip: {
    width: 280,
    marginTop: 26,
    alignItems: "center",
  },
  tipLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 2,
    color: GREEN_DIM,
    fontWeight: "700",
    marginBottom: 7,
  },
  tipText: {
    fontFamily: MONO,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.3,
    color: GREEN_DIM,
    textAlign: "center",
  },
  });
});

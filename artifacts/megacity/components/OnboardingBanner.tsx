// Live onboarding overlay shown on Construction, Law, and Inbox during the
// first-run walkthrough. Each instance binds to a specific beat (build /
// edict / dispatch). The banner watches GameState for the player's actual
// action — authorising the target build, issuing the target edict, or
// reading the welcome dispatch — then advances `onboardingStep` and routes
// to the next screen. Skipping advances without performing the action.
//
// The banner deliberately performs NO state mutation on the player's
// behalf: every credit, every edict, every read is the player's own.
// This keeps the walkthrough honest (mutations stay confined to the
// player's deliberate inputs) and makes the replay flow trivially
// cosmetic — replay never mounts these banners because hasCompletedOnboarding
// is already true.
//
// A BACK affordance walks the cursor one beat earlier (re-routing as
// needed) without resetting any per-beat completion flag, so the player
// can re-read context without being forced to redo the action. The
// forward control jumps straight to the latest beat they had reached
// (see engine/onboardingFlow.ts) so rewinding never costs progress.
//
// Voice rules (per project conventions): dystopian, terse, no emojis,
// no exclamation marks.

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useGame } from "@/context/GameContext";
import { useTheme } from "@/context/ThemeContext";
import {
  BEAT_NAME,
  BEAT_ORDER,
  BEAT_ROUTE,
  backwardTargetBeat,
  forwardTargetBeat,
  isBeatActionSatisfied,
  latestReachedBeat,
  type OnboardingBeat,
} from "@/engine/onboardingFlow";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

type Step = Extract<OnboardingBeat, "build" | "edict" | "dispatch">;

type Props = {
  step: Step;
};

// Per-beat completion flag on GameState that the banner flips when the
// player's action is detected. Persisted alongside `onboardingStep` so a
// save+quit between "action completed" and "advance fired" still resumes
// forward on next launch instead of losing the in-flight progress.
const FLAG_KEY: Record<Step, "didBuild" | "didEdict" | "didRead"> = {
  build: "didBuild",
  edict: "didEdict",
  dispatch: "didRead",
};

export default function OnboardingBanner({ step }: Props) {
  const { state, setState } = useGame();
  const { colors: c } = useTheme();

  // Only render the banner when the live walkthrough is actively on this
  // beat. Replay mode and completed runs short-circuit here without
  // mounting any DOM at all.
  const active =
    state.hasCompletedOnboarding !== true && state.onboardingStep === step;

  const flagKey = FLAG_KEY[step];
  const alreadyDone = state[flagKey] === true;

  const advance = () => {
    const target = forwardTargetBeat(step, state);
    setState((prev) => ({
      ...prev,
      [flagKey]: prev[flagKey] === true ? prev[flagKey] : true,
      onboardingStep: target ?? "summary",
    }));
    router.replace(BEAT_ROUTE[target ?? "summary"] as never);
  };

  const goBack = () => {
    const prevBeat = backwardTargetBeat(step);
    if (!prevBeat) return;
    // Do NOT clear the per-beat flag — the player has already done the
    // action. They are merely re-reading context.
    setState((prev) => ({ ...prev, onboardingStep: prevBeat }));
    router.replace(BEAT_ROUTE[prevBeat] as never);
  };

  // Watch state for the player's action. When detected, advance.
  //
  // Detection (isBeatActionSatisfied, engine/onboardingFlow.ts) measures the
  // action against the durable fresh-game baseline rather than a value
  // snapshotted at mount. This closes a reliability gap: if the player took
  // the action a moment before this banner (re)mounted — e.g. a save+quit or
  // screen remount between "action done" and "flag set" — the beat still
  // completes instead of stranding on a baseline that already absorbed it.
  //
  // We still do NOT auto-advance when the per-beat flag is already true on
  // mount: that would make BACK useless (stepping back into a completed beat
  // would instantly fire forward again). Players who land here with the flag
  // set — via BACK, or a save+quit between "action done" and "banner
  // advanced" — see a CONTINUE button instead.
  useEffect(() => {
    if (!active) return;
    if (alreadyDone) return;
    if (
      isBeatActionSatisfied(step, {
        buildings: state.buildings as Record<string, number>,
          pendingConstructions: state.pendingConstructions,
        activeEdicts: state.activeEdicts,
        edictCooldowns: state.edictCooldowns,
        messages: state.messages,
      })
    ) {
      advance();
    }
    // setState identity is stable; advance closes over current step which
    // is constant for the lifetime of this banner instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    alreadyDone,
    state.buildings,
    state.pendingConstructions,
    state.activeEdicts,
    state.edictCooldowns,
    state.messages,
  ]);

  if (!active) return null;

  const copy = COPY[step];
  const canGoBack = backwardTargetBeat(step) !== null;
  const forwardLabel = alreadyDone ? "CONTINUE" : "SKIP BEAT";
  const forwardIcon: React.ComponentProps<typeof Feather>["name"] = alreadyDone
    ? "arrow-right"
    : "skip-forward";
  const forwardColor = alreadyDone ? c.accent : c.warning;

  const beatIndex = BEAT_ORDER.indexOf(step);
  const reachedIndex = BEAT_ORDER.indexOf(latestReachedBeat(state));

  return (
    <View
      style={[
        s.root,
        {
          borderColor: c.accent,
          backgroundColor: c.accent + "14",
        },
      ]}
    >
      <View style={s.headerRow}>
        <View style={s.iconBox}>
          <MaterialCommunityIcons name={copy.icon} size={14} color={c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.tag, { color: c.accent }]}>{copy.tag}</Text>
          <Text style={[s.title, { color: c.text }]}>{copy.title}</Text>
        </View>
      </View>
      {/* Mirror the onboarding screen's progress strip so the player keeps
          the same orientation cue when the walkthrough hops onto Construction
          / Law / Inbox via this banner. Three states: current, reached
          (already seen — reachable via BACK), pending. */}
      <View style={s.progressRow}>
        {BEAT_ORDER.map((b, i) => {
          const isCurrent = i === beatIndex;
          const isReached = i < Math.max(beatIndex, reachedIndex) || (i === reachedIndex && i !== beatIndex);
          const dotStyle = isCurrent
            ? { borderColor: c.accent, backgroundColor: c.accent + "33" }
            : isReached
              ? { borderColor: c.accent + "80", backgroundColor: "transparent" }
              : { borderColor: c.border, backgroundColor: "transparent" };
          const textColor = isCurrent ? c.accent : isReached ? c.accent + "C0" : c.textMuted;
          return (
            <View key={b} style={[s.progressDot, dotStyle]}>
              <Text style={[s.progressDotText, { color: textColor }]}>
                {String(i + 1).padStart(2, "0")}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={[s.progressLabel, { color: c.accent }]}>
        {`BEAT ${String(beatIndex + 1).padStart(2, "0")} OF ${String(BEAT_ORDER.length).padStart(2, "0")} · ${BEAT_NAME[step]}`}
      </Text>
      <Text style={[s.body, { color: c.textSecondary }]}>{copy.body}</Text>
      <View style={[s.whyRow, { borderColor: c.accent + "30" }]}>
        <Text style={[s.whyLabel, { color: c.accent }]}>WHY</Text>
        <Text style={[s.whyText, { color: c.textMuted }]}>{copy.why}</Text>
      </View>
      <View style={s.actionRow}>
        {canGoBack ? (
          <Pressable
            onPress={goBack}
            accessibilityLabel="Back to previous onboarding beat"
            style={({ pressed }) => [
              s.ghostBtn,
              { borderColor: c.border, backgroundColor: "transparent" },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Feather name="arrow-left" size={11} color={c.textSecondary} />
            <Text style={[s.ghostText, { color: c.textSecondary }]}>BACK</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={advance}
          accessibilityLabel={alreadyDone ? "Continue onboarding" : "Skip this onboarding beat"}
          style={({ pressed }) => [
            s.skipBtn,
            { borderColor: forwardColor + "60", backgroundColor: forwardColor + "12" },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name={forwardIcon} size={11} color={forwardColor} />
          <Text style={[s.skipText, { color: forwardColor }]}>{forwardLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type CopyEntry = {
  tag: string;
  title: string;
  body: string;
  why: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
};

const COPY: Record<Step, CopyEntry> = {
  build: {
    tag: "BEAT 02 OF 05 · INFRASTRUCTURE",
    title: "AUTHORIZE A WORKER HOUSING STACK",
    body:
      "Find Worker Housing Stack in the Housing category and authorize one. The build is small, the cost is small, the lesson is permanent.",
    why:
      "Housing caps how many citizens the sector can hold. Fall behind and overcrowding turns into unrest.",
    icon: "office-building",
  },
  edict: {
    tag: "BEAT 03 OF 05 · GOVERNANCE",
    title: "ISSUE EMERGENCY RATIONS",
    body:
      "Open the Edicts tab and issue Emergency Rations. Review the full commitment: upfront cost, running charge, duration, total cost, and when cooldown begins.",
    why:
      "Edicts buy outcomes you cannot build. Check the full commitment and current status before authorising one.",
    icon: "gavel",
  },
  dispatch: {
    tag: "BEAT 04 OF 05 · DISPATCH",
    title: "READ THE SECTOR COMMAND DISPATCH",
    body:
      "A welcome transmission is queued. Open it and acknowledge the line. Critical messages do not retire on their own.",
    why:
      "The inbox is your only channel to Sector Command. Ignore it and decisions get made without you.",
    icon: "phone-incoming",
  },
};

const s = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  tag: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: "700",
    marginBottom: 2,
  },
  title: {
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "700",
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
  },
  whyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  whyLabel: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: "700",
    marginTop: 1,
  },
  whyText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  progressRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  progressDot: {
    width: 30,
    height: 22,
    borderRadius: 3,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotText: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "700",
  },
  progressLabel: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: "700",
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  skipText: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  ghostText: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
});

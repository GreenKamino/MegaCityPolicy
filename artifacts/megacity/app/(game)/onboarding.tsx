// First-run onboarding sequence. Five beats walk a new Commander through
// the loop: arrive on the bridge, authorise a build (in Construction),
// issue an edict (in Law), read the welcome dispatch (in Inbox), and
// review the resulting state. Beats 02-04 happen on their REAL screens
// via OnboardingBanner — this screen only owns beat 01 (arrival) and
// beat 05 (summary) in live mode. The walkthrough is gated by
// `state.hasCompletedOnboarding`; the live cursor lives in
// `state.onboardingStep`. See engine/saveLoad.ts for how legacy saves
// bypass the gate.
//
// Replay mode (?replay=1) walks all five beats as narrative-only cards
// with no state mutation. Replay never sets onboardingStep, never sets
// hasCompletedOnboarding, and never routes into Construction / Law /
// Inbox — it is purely cosmetic so a returning player can re-read the
// orientation copy without spending credits or filing a second edict.
//
// Voice rules (per project conventions): dystopian, terse, no emojis,
// no exclamation marks. Keep copy in this file consistent with the rest
// of MEGACITY's UI strings.

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import ActionCostTimingReadout from "@/components/ActionCostTimingReadout";
import { useTheme } from "@/context/ThemeContext";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { getEdictById } from "@/engine/edicts";
import { ACTION_COST_PLAYER_GUIDE, getEdictCostTiming } from "@/engine/actionCostTiming";
import {
  BEAT_NAME,
  BEAT_ORDER,
  BEAT_ROUTE,
  backwardTargetBeat,
  forwardTargetBeat,
  latestReachedBeat,
  type OnboardingBeat,
} from "@/engine/onboardingFlow";
import { formatCredits, formatNumber } from "@/utils/format";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

// Cheap, single-tap building chosen for the build beat. Worker Housing
// Stack is one of the lowest-cost meaningful structures and ships in the
// player's starting buildings inventory, so the increment is a clean
// "+1" against an existing entry. Mirrored in components/OnboardingBanner.tsx.
const ONBOARDING_BUILD_LABEL = "WORKER HOUSING STACK";
const ONBOARDING_BUILD_EFFECT = "+800 housing capacity";

// Low-risk social edict already present in the base catalog. Picked for
// the edict beat because it teaches the cost/benefit pattern without
// the political fallout of a security clamp.
const ONBOARDING_EDICT_ID = "emergency_rations";

const WELCOME_MESSAGE_ID = "msg-welcome";

// Beat identifiers shared with engine/types.ts onboardingStep. The
// authoritative ordering and routing live in engine/onboardingFlow.ts.
type BeatId = OnboardingBeat;

// Type alias for Feather icon names — eliminates the need for `as any`
// casts when threading icon strings through props.
type FeatherName = React.ComponentProps<typeof Feather>["name"];

function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { colors: c } = useTheme();
  const { state, setState } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const params = useLocalSearchParams<{ replay?: string }>();
  // Replay = a player who already finished orientation re-watching it.
  // No state mutation, no route detours, no progress flag changes.
  const isReplay = params.replay === "1";

  // In live mode, the displayed beat is driven by `onboardingStep`. In
  // replay mode, we keep a local cursor that walks all five beats.
  const liveStep: BeatId = (state.onboardingStep ?? "arrival") as BeatId;
  const [replayBeat, setReplayBeat] = useState<BeatId>("arrival");
  // Track the furthest replay beat the player has reached so the progress
  // strip can render the same three states (current / reached / pending)
  // in replay mode that live mode gets via per-beat completion flags.
  const [furthestReplayIdx, setFurthestReplayIdx] = useState(0);
  const beat: BeatId = isReplay ? replayBeat : liveStep;
  const beatIndex = BEAT_ORDER.indexOf(beat);
  // The furthest beat the player has reached so far. Used to distinguish
  // "BACK landed me here" (reached) from "I haven't seen this yet" (pending).
  const reachedIndex = isReplay
    ? furthestReplayIdx
    : BEAT_ORDER.indexOf(latestReachedBeat(state));

  const edictDef = useMemo(() => getEdictById(ONBOARDING_EDICT_ID), []);
  const welcomeMessage = useMemo(
    () => state.messages.find((m) => m.id === WELCOME_MESSAGE_ID),
    [state.messages]
  );

  // Live mode: keep the URL clean of any `replay` param if a different
  // route mutates onboardingStep mid-flight (defensive — no current
  // caller does this, but cheap to enforce).
  useEffect(() => {
    if (!isReplay && state.hasCompletedOnboarding === true && liveStep !== "summary") {
      // Already finished and not on summary — nothing for us to render.
      router.replace("/(game)/overview");
    }
  }, [isReplay, state.hasCompletedOnboarding, liveStep]);

  const advanceReplay = () => {
    const next = BEAT_ORDER[beatIndex + 1];
    if (next) {
      setReplayBeat(next);
      setFurthestReplayIdx((idx) => Math.max(idx, beatIndex + 1));
    }
  };

  const rewindReplay = () => {
    const prev = backwardTargetBeat(beat);
    if (prev) setReplayBeat(prev);
  };

  // Live arrival / live summary BACK → walk the cursor one beat earlier.
  // Per-beat completion flags are preserved so the player isn't asked to
  // redo the action — only to re-read the copy. Routes follow BEAT_ROUTE.
  const goLiveBack = () => {
    const prev = backwardTargetBeat(liveStep);
    if (!prev) return;
    setState((p) => ({ ...p, onboardingStep: prev }));
    router.replace(BEAT_ROUTE[prev] as never);
  };

  // Live arrival → start (or resume) the walkthrough. If the player has
  // already reached a later beat (e.g. they used BACK from summary), the
  // forward control jumps straight to that latest beat instead of forcing
  // them to walk every step again.
  const beginLiveWalkthrough = () => {
    const target = forwardTargetBeat("arrival", state) ?? "build";
    setState((prev) => ({ ...prev, onboardingStep: target }));
    router.replace(BEAT_ROUTE[target] as never);
  };

  // Live summary → set the completion flag and exit to overview.
  const finishLiveOnboarding = () => {
    setState((prev) => ({
      ...prev,
      hasCompletedOnboarding: true,
      onboardingStep: null,
    }));
    router.replace("/(game)/overview");
  };

  // Replay summary → just leave; nothing to flip.
  const finishReplay = () => {
    router.replace("/(game)/overview");
  };

  const handleSkip = () => {
    if (isReplay) {
      // Replay skip is just an early exit. No state mutation.
      router.replace("/(game)/overview");
      return;
    }
    showModal(
      "SKIP ORIENTATION?",
      "You can replay this sequence from settings at any time. The city is already on the clock.",
      [
        { text: "STAY", onPress: hideModal },
        {
          text: "SKIP",
          style: "destructive",
          onPress: () => {
            hideModal();
            finishLiveOnboarding();
          },
        },
      ]
    );
  };

  const renderBeat = () => {
    switch (beat) {
      case "arrival":
        return (
          <BeatCard
            kind="narrative"
            tag="BEAT 01 OF 05 · ARRIVAL"
            title="SECTOR COMMAND, REPORTING"
            body={
              `${state.cityName || "MEGACITY JUAN"}. Nine hundred eighty thousand citizens. Two hundred seventy districts. The sky is the colour of a dead monitor.\n\nThe last Commander did not retire. They were retired. The Council expects results before the fiscal quarter closes. You have credits, factions, and time. Two of those will run out.`
            }
            primary={{
              label: isReplay ? "CONTINUE" : "BEGIN ORIENTATION",
              onPress: isReplay ? advanceReplay : beginLiveWalkthrough,
              icon: "play",
            }}
          />
        );
      // Live mode never owns these middle beats — they render via
      // OnboardingBanner on their real screens. The BeatCards below are
      // for replay mode only.
      case "build":
        return (
          <BeatCard
            kind="narrative"
            tag="BEAT 02 OF 05 · INFRASTRUCTURE"
            title="AUTHORIZE A NEW BUILD"
            body={
              `Construction is how you grow the city. The live Construction card shows the authoritative upfront cost, required materials, and active duration before you confirm.\n\n${ACTION_COST_PLAYER_GUIDE}`
            }
            why="Housing caps how many citizens the sector can hold. Fall behind and overcrowding turns into unrest."
            preview={
              <View style={[s.previewBox, { borderColor: c.border, backgroundColor: c.bgCard }]}>
                <View style={s.previewHeader}>
                  <Feather name="layers" size={12} color={c.accent} />
                  <Text style={[s.previewLabel, { color: c.accent }]}>{ONBOARDING_BUILD_LABEL}</Text>
                </View>
                <Text style={[s.previewBody, { color: c.textSecondary }]}>
                  Stacked modular dormitories. Cramped, ventilated, and structurally sound. The waiting list outpaces every block you authorize.
                </Text>
                <View style={s.previewMetaRow}>
                  <Text style={[s.previewMetaLabel, { color: c.textMuted }]}>EFFECT</Text>
                  <Text style={[s.previewMetaValue, { color: c.text }]}>{ONBOARDING_BUILD_EFFECT}</Text>
                </View>
              </View>
            }
            primary={{
              label: "CONTINUE",
              onPress: advanceReplay,
              icon: "arrow-right",
            }}
            back={{ onPress: rewindReplay }}
          />
        );
      case "edict":
        return (
          <BeatCard
            kind="narrative"
            tag="BEAT 03 OF 05 · GOVERNANCE"
            title="ISSUE YOUR FIRST EDICT"
            body={
              `Edicts are short-term decrees with sharp consequences. Review upfront cost, running cost, active duration, maximum total cost, and the post-expiry cooldown before signing.\n\n${ACTION_COST_PLAYER_GUIDE}`
            }
            why="Edicts buy outcomes you cannot build. The cost and the cooldown are the price of moving fast."
            preview={
              edictDef ? (
                <View style={[s.previewBox, { borderColor: c.border, backgroundColor: c.bgCard }]}>
                  <View style={s.previewHeader}>
                    <MaterialCommunityIcons name="gavel" size={12} color={c.accent} />
                    <Text style={[s.previewLabel, { color: c.accent }]}>{edictDef.name.toUpperCase()}</Text>
                  </View>
                  <Text style={[s.previewBody, { color: c.textSecondary }]}>{edictDef.description}</Text>
                  <ActionCostTimingReadout
                    model={getEdictCostTiming(edictDef, { availableCredits: state.resources.credits })}
                    includeBehavior
                    compact
                  />
                </View>
              ) : (
                <Text style={[s.previewBody, { color: c.textMuted }]}>
                  Edict catalog unavailable. Continue.
                </Text>
              )
            }
            primary={{
              label: "CONTINUE",
              onPress: advanceReplay,
              icon: "arrow-right",
            }}
            back={{ onPress: rewindReplay }}
          />
        );
      case "dispatch":
        return (
          <BeatCard
            kind="narrative"
            tag="BEAT 04 OF 05 · DISPATCH"
            title="READ INCOMING TRANSMISSION"
            body={
              "Every report, intel cable, and faction request lands in your inbox. Critical entries demand a response. The walkthrough opens Inbox so you can acknowledge the line yourself."
            }
            why="The inbox is your only channel to Sector Command. Ignore it and decisions get made without you."
            preview={
              welcomeMessage ? (
                <View style={[s.previewBox, { borderColor: c.danger, backgroundColor: c.bgCard }]}>
                  <View style={s.previewHeader}>
                    <Feather name="phone-incoming" size={12} color={c.danger} />
                    <Text style={[s.previewLabel, { color: c.danger }]}>CRITICAL · CALL</Text>
                  </View>
                  <Text style={[s.dispatchTitle, { color: c.text }]}>{welcomeMessage.title}</Text>
                  <Text style={[s.previewBody, { color: c.textSecondary }]}>{welcomeMessage.body}</Text>
                </View>
              ) : (
                <Text style={[s.previewBody, { color: c.textMuted }]}>
                  No queued dispatches. Continue.
                </Text>
              )
            }
            primary={{
              label: "CONTINUE",
              onPress: advanceReplay,
              icon: "arrow-right",
            }}
            back={{ onPress: rewindReplay }}
          />
        );
      case "summary":
        return (
          <BeatCard
            kind="narrative"
            tag="BEAT 05 OF 05 · SECTOR ONLINE"
            title="ORIENTATION COMPLETE"
            body={
              "The console is yours. From here, the city moves on its own clock — every tick adjusts resources, demographics, and faction tempers. You decide what gets built, signed, or buried.\n\nThere are no neutral choices. Only ones you can defend."
            }
            preview={
              <View style={[s.previewBox, { borderColor: c.border, backgroundColor: c.bgCard }]}>
                <Text style={[s.recapHeader, { color: c.accent }]}>RECAP</Text>
                <RecapRow label="Worker Housing Stack — Construction" colors={c} />
                <RecapRow label="Emergency Rations — Law" colors={c} />
                <RecapRow label="Sector Command dispatch — Inbox" colors={c} />
                <View style={[s.previewMetaRow, { marginTop: 8 }]}>
                  <Text style={[s.previewMetaLabel, { color: c.textMuted }]}>TREASURY</Text>
                  <Text style={[s.previewMetaValue, { color: c.text }]}>{formatNumber(state.resources.credits)} cr</Text>
                </View>
              </View>
            }
            primary={{
              label: isReplay ? "RETURN" : "ENTER MEGACITY",
              onPress: isReplay ? finishReplay : finishLiveOnboarding,
              icon: "log-in",
            }}
            back={{ onPress: isReplay ? rewindReplay : goLiveBack }}
          />
        );
    }
  };

  return (
    <View style={[s.root, { paddingTop: topInset, backgroundColor: c.bg }]}>
      <View style={[s.header, { borderBottomColor: c.border, backgroundColor: c.bgSecondary }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <MaterialCommunityIcons name="city-variant-outline" size={16} color={c.accent} />
          <Text style={[s.headerTitle, { color: c.accent }]}>
            {isReplay ? "ORIENTATION REPLAY" : "FIRST-RUN ORIENTATION"}
          </Text>
        </View>
        <Pressable
          onPress={handleSkip}
          hitSlop={12}
          accessibilityLabel={isReplay ? "Exit orientation replay" : "Skip onboarding"}
          style={({ pressed }) => [
            s.skipBtn,
            { borderColor: c.warning + "60", backgroundColor: c.warning + "12" },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name={isReplay ? "x" : "skip-forward"} size={11} color={c.warning} />
          <Text style={[s.skipText, { color: c.warning }]}>{isReplay ? "EXIT" : "SKIP"}</Text>
        </Pressable>
      </View>

      <View style={[s.progressBlock, { backgroundColor: c.bgSecondary, borderBottomColor: c.border }]}>
        <View style={s.progressRow}>
          {BEAT_ORDER.map((b, i) => {
            // Three states: current (the beat the player is on), reached
            // (already seen, can be returned to via BACK), pending (not
            // yet visited).
            const isCurrent = i === beatIndex;
            const isReached = i < Math.max(beatIndex, reachedIndex) || (i === reachedIndex && i !== beatIndex);
            const dotStyle = isCurrent
              ? { borderColor: c.accent, backgroundColor: c.accent + "33" }
              : isReached
                ? { borderColor: c.accent + "80", backgroundColor: "transparent" }
                : { borderColor: c.border, backgroundColor: c.bgCard };
            const textColor = isCurrent
              ? c.accent
              : isReached
                ? c.accent + "C0"
                : c.textMuted;
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
          {`BEAT ${String(beatIndex + 1).padStart(2, "0")} OF ${String(BEAT_ORDER.length).padStart(2, "0")} · ${BEAT_NAME[beat]}`}
        </Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {renderBeat()}
      </ScrollView>

      <GameModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        buttons={modal.buttons}
        onDismiss={hideModal}
      />
    </View>
  );
}

type BeatCardProps = {
  kind: "narrative" | "action";
  tag: string;
  title: string;
  body: string;
  why?: string;
  preview?: React.ReactNode;
  primary: { label: string; onPress: () => void; icon: FeatherName; disabled?: boolean };
  back?: { onPress: () => void };
};

function BeatCard({ kind, tag, title, body, why, preview, primary, back }: BeatCardProps) {
  const { colors: c } = useTheme();
  const accentBorder = kind === "narrative" ? c.accent : c.accentDim;
  return (
    <View style={[s.card, { backgroundColor: c.bgCard, borderColor: c.border, borderLeftColor: accentBorder }]}>
      <Text style={[s.cardTag, { color: c.accent }]}>{tag}</Text>
      <Text style={[s.cardTitle, { color: c.text }]}>{title}</Text>
      <Text style={[s.cardBody, { color: c.textSecondary }]}>{body}</Text>
      {why ? (
        <View style={[s.whyRow, { borderColor: c.accent + "30" }]}>
          <Text style={[s.whyLabel, { color: c.accent }]}>WHY</Text>
          <Text style={[s.whyText, { color: c.textMuted }]}>{why}</Text>
        </View>
      ) : null}
      {preview ? <View style={{ marginTop: 12 }}>{preview}</View> : null}
      <View style={s.actionRow}>
        {back ? (
          <Pressable
            onPress={back.onPress}
            accessibilityLabel="Back to previous onboarding beat"
            style={({ pressed }) => [
              s.backBtn,
              { borderColor: c.border, backgroundColor: "transparent" },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Feather name="arrow-left" size={13} color={c.textSecondary} />
            <Text style={[s.backBtnText, { color: c.textSecondary }]}>BACK</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={primary.disabled ? undefined : primary.onPress}
          accessibilityLabel={primary.label}
          accessibilityState={{ disabled: !!primary.disabled }}
          style={({ pressed }) => [
            s.primaryBtn,
            {
              borderColor: c.accent,
              backgroundColor: primary.disabled ? c.bgSecondary : c.accent + "22",
            },
            pressed && !primary.disabled && { opacity: 0.7 },
            primary.disabled && { opacity: 0.6 },
          ]}
        >
          <Feather name={primary.icon} size={13} color={primary.disabled ? c.textMuted : c.accent} />
          <Text style={[s.primaryBtnText, { color: primary.disabled ? c.textMuted : c.accent }]}>
            {primary.label}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function RecapRow({ label, colors }: { label: string; colors: { accent: string; textMuted: string; textSecondary: string } }) {
  return (
    <View style={s.recapRow}>
      <Feather name="circle" size={12} color={colors.accent} />
      <Text style={[s.recapText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: mono,
    fontSize: 13,
    letterSpacing: 1.5,
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
  progressBlock: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 6,
  },
  progressRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  progressLabel: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    textAlign: "center",
  },
  progressDot: {
    width: 36,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotText: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "700",
  },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 80 },
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 16,
  },
  cardTag: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: mono,
    fontSize: 16,
    letterSpacing: 1,
    fontWeight: "700",
    marginBottom: 10,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  whyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 10,
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
    fontSize: 12,
    lineHeight: 17,
  },
  previewBox: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    gap: 6,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  previewLabel: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  previewBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  previewMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  previewMetaLabel: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  previewMetaValue: {
    fontFamily: mono,
    fontSize: 11,
    fontWeight: "700",
  },
  dispatchTitle: {
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "700",
    marginBottom: 4,
    marginTop: 2,
  },
  recapHeader: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: 4,
  },
  recapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  recapText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    flexWrap: "wrap",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 4,
    flexGrow: 1,
    justifyContent: "center",
  },
  primaryBtnText: {
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: "700",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 4,
    justifyContent: "center",
  },
  backBtnText: {
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: "700",
  },
});

export default withScreenBoundary(OnboardingScreen, "onboarding");

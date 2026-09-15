import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo } from "react";
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

import SectionHeader from "@/components/SectionHeader";
import { useGame } from "@/context/GameContext";
import { useTheme } from "@/context/ThemeContext";
import { useGameModal } from "@/hooks/useGameModal";
import GameModal from "@/components/GameModal";
import {
  computeDailyReward,
  isClaimAvailable as isDailyClaimAvailable,
  todayKey,
} from "@/engine/dailyStreak";
import {
  getProgress as getWeeklyProgress,
  getTemplate as getWeeklyTemplate,
  isComplete as isWeeklyComplete,
  isoWeekKey,
  refreshWeeklyChallenge,
} from "@/engine/weeklyChallenges";

function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const { state, claimDailyBonus, claimWeeklyChallenge, ensureWeeklyChallengeFresh } = useGame();

  // If the player kept the app open across an ISO-week boundary, persist the
  // rolled-over challenge once so progress can accrue against the new baseline.
  // Re-runs only when the actual week changes.
  const currentWeekKey = isoWeekKey();
  useEffect(() => {
    ensureWeeklyChallengeFresh();
  }, [currentWeekKey, ensureWeeklyChallengeFresh]);
  const { colors: themeColors } = useTheme();
  const { modal, showModal, hideModal } = useGameModal();
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const today = todayKey();
  const streak = state.dailyStreak ?? { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null };
  const dailyAvailable = isDailyClaimAvailable(streak, today);
  const previewStreak = streak.current === 0 || streak.lastClaimedDay !== prevDay(today)
    ? 1
    : streak.current + 1;
  const previewReward = computeDailyReward(previewStreak);

  const challenge = useMemo(
    () => refreshWeeklyChallenge(state.weeklyChallenge, state),
    [state],
  );
  const challengeTpl = getWeeklyTemplate(challenge);
  const progress = getWeeklyProgress(challenge, state);
  const challengeComplete = isWeeklyComplete(challenge, state);
  const challengeClaimable = challengeComplete && !challenge.claimed;

  const onClaimDaily = () => {
    const out = claimDailyBonus();
    if (!out) {
      showModal("ALREADY CLAIMED", "Today's bonus has been claimed. Come back tomorrow.", [{ text: "OK", onPress: hideModal }]);
      return;
    }
    showModal(
      `DAY ${out.streakAfter} BONUS`,
      `${out.message}\n\n+${out.credits.toLocaleString()} credits\n+${out.research} research progress`,
      [{ text: "OK", onPress: hideModal }],
    );
  };

  const onClaimWeekly = () => {
    const out = claimWeeklyChallenge();
    if (!out) {
      showModal("NOT YET", "The weekly challenge isn't complete or has already been claimed.", [{ text: "OK", onPress: hideModal }]);
      return;
    }
    showModal(
      "CHALLENGE COMPLETE",
      `${out.templateTitle}\n\n+${out.credits.toLocaleString()} credits\n+${out.research} research progress`,
      [{ text: "OK", onPress: hideModal }],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: themeColors.bg }]}>
      <View style={[styles.header, { backgroundColor: themeColors.bgSecondary, borderBottomColor: themeColors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={18} color={themeColors.accent} />
        </Pressable>
        <MaterialCommunityIcons name="trophy-award" size={18} color={themeColors.accent} />
        <Text style={[styles.headerTitle, { color: themeColors.accent }]}>CHALLENGES</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionHeader
          title="Daily Check-In"
          icon={<Feather name="calendar" size={14} color={themeColors.accent} />}
        />

        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { color: themeColors.textMuted }]}>CURRENT STREAK</Text>
              <Text style={[styles.cardValue, { color: themeColors.text }]}>{streak.current} {streak.current === 1 ? "DAY" : "DAYS"}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.cardLabel, { color: themeColors.textMuted }]}>LONGEST</Text>
              <Text style={[styles.cardValue, { color: themeColors.accent }]}>{streak.longest} {streak.longest === 1 ? "DAY" : "DAYS"}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <Text style={[styles.cardSub, { color: themeColors.textMuted }]}>
            {dailyAvailable
              ? `Tap to claim today's bonus (Day ${previewStreak}).`
              : "Today's bonus has been claimed. Come back tomorrow to keep your streak alive."}
          </Text>

          {dailyAvailable && (
            <View style={styles.rewardLine}>
              <Text style={[styles.rewardChip, { color: themeColors.warning, borderColor: themeColors.warning }]}>+{previewReward.credits.toLocaleString()} CR</Text>
              <Text style={[styles.rewardChip, { color: themeColors.info, borderColor: themeColors.info }]}>+{previewReward.research} RP</Text>
            </View>
          )}

          <Pressable
            onPress={onClaimDaily}
            disabled={!dailyAvailable}
            style={({ pressed }) => [
              styles.claimBtn,
              { borderColor: dailyAvailable ? themeColors.accent : themeColors.border, backgroundColor: dailyAvailable ? themeColors.accent + "18" : themeColors.bg },
              pressed && dailyAvailable && { opacity: 0.7 },
              !dailyAvailable && { opacity: 0.5 },
            ]}
          >
            <Feather name={dailyAvailable ? "gift" : "check"} size={14} color={dailyAvailable ? themeColors.accent : themeColors.textMuted} />
            <Text style={[styles.claimBtnText, { color: dailyAvailable ? themeColors.accent : themeColors.textMuted }]}>
              {dailyAvailable ? "CLAIM DAILY BONUS" : "CLAIMED TODAY"}
            </Text>
          </Pressable>
        </View>

        <SectionHeader
          title="Weekly Challenge"
          subtitle={challenge.weekKey}
          icon={<MaterialCommunityIcons name="flag-checkered" size={14} color={themeColors.accent} />}
        />

        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <Text style={[styles.challengeTitle, { color: themeColors.text }]}>
            {challengeTpl?.title ?? "WEEKLY CHALLENGE"}
          </Text>
          <Text style={[styles.challengeDesc, { color: themeColors.textMuted }]}>
            {challengeTpl?.description ?? "Generated weekly."}
          </Text>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: challengeComplete ? themeColors.accent : themeColors.accent,
                  width: `${Math.min(100, Math.round((progress / challenge.target) * 100))}%`,
                },
              ]}
            />
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.cardSub, { color: themeColors.textMuted }]}>
              {Math.min(progress, challenge.target)} / {challenge.target}
            </Text>
            {challengeTpl && (
              <View style={[styles.rewardLine, { marginTop: 0 }]}>
                <Text style={[styles.rewardChip, { color: themeColors.warning, borderColor: themeColors.warning }]}>+{challengeTpl.rewardCredits.toLocaleString()} CR</Text>
                <Text style={[styles.rewardChip, { color: themeColors.info, borderColor: themeColors.info }]}>+{challengeTpl.rewardResearch} RP</Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={onClaimWeekly}
            disabled={!challengeClaimable}
            style={({ pressed }) => [
              styles.claimBtn,
              { borderColor: challengeClaimable ? themeColors.accent : themeColors.border, backgroundColor: challengeClaimable ? themeColors.accent + "18" : themeColors.bg },
              pressed && challengeClaimable && { opacity: 0.7 },
              !challengeClaimable && { opacity: 0.5 },
            ]}
          >
            <Feather name={challenge.claimed ? "check" : challengeComplete ? "gift" : "clock"} size={14} color={challengeClaimable ? themeColors.accent : themeColors.textMuted} />
            <Text style={[styles.claimBtnText, { color: challengeClaimable ? themeColors.accent : themeColors.textMuted }]}>
              {challenge.claimed ? "CLAIMED THIS WEEK" : challengeComplete ? "CLAIM REWARD" : "IN PROGRESS"}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.footnote, { color: themeColors.textMuted }]}>
          A new challenge is generated every Monday. Daily streak rewards scale up to Day 14 and reset if you miss a day.
        </Text>
      </ScrollView>

      {modal && <GameModal {...modal} onDismiss={hideModal} />}
    </View>
  );
}

function prevDay(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 8 : 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 2 },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 8, gap: 8 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { fontFamily: "Inter_400Regular", fontSize: 10, letterSpacing: 1 },
  cardValue: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: 1 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 },
  divider: { height: 1, marginVertical: 4 },
  rewardLine: { flexDirection: "row", gap: 8, marginTop: 8 },
  rewardChip: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderRadius: 4 },
  claimBtn: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderWidth: 1, borderRadius: 6 },
  claimBtnText: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.5 },
  challengeTitle: { fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: 1 },
  challengeDesc: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  progressTrack: { height: 8, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", marginTop: 10 },
  progressFill: { height: "100%", borderRadius: 4 },
  footnote: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 16, textAlign: "center" },
});

export default withScreenBoundary(ChallengesScreen, "challenges");

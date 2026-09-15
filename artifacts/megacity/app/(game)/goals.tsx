import { Feather } from "@expo/vector-icons";
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
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import {
  PERSONAL_GOAL_TEMPLATES,
  getGoalProgress,
  getTemplate,
  isGoalComplete,
  type GoalScope,
  type GoalTemplate,
  type PersonalGoalSlot,
} from "@/engine/personalGoals";

const getScopeMeta = (Colors: ThemePalette): Record<GoalScope, { label: string; subtitle: string; color: string; icon: string }> => ({
  short: { label: "SHORT-TERM", subtitle: "Quick objective", color: Colors.info, icon: "zap" },
  mid: { label: "MID-TERM", subtitle: "Steady push", color: Colors.accent, icon: "trending-up" },
  long: { label: "LONG-TERM", subtitle: "Career arc", color: Colors.warning, icon: "award" },
});

const SCOPES: GoalScope[] = ["short", "mid", "long"];

function GoalsScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state, refreshPersonalGoals, claimPersonalGoal } = useGame();
  const { showToast } = useToast();

  // Make sure all three slots are filled when the screen mounts.
  useEffect(() => {
    refreshPersonalGoals();
  }, [refreshPersonalGoals]);

  const goals = state.personalGoals;
  const completed = goals?.completedIds ?? [];
  const totalClaimed = goals?.totalClaimed ?? 0;

  const completionStats = useMemo(() => {
    const total = PERSONAL_GOAL_TEMPLATES.length;
    return { unlocked: completed.length, total };
  }, [completed.length]);

  const handleClaim = (scope: GoalScope) => {
    const result = claimPersonalGoal(scope);
    if (!result) return;
    const tpl = getTemplate(result.templateId);
    showToast(
      `Goal claimed: +${result.credits.toLocaleString()} credits, +${result.xp} XP${tpl ? ` (${tpl.title})` : ""}`,
      "success",
    );
    // Re-fill the slot immediately.
    refreshPersonalGoals();
  };

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <Text style={s.headerTitle}>PERSONAL GOALS</Text>
      </View>

      <View style={s.summaryRow}>
        <SummaryPill label="CLAIMED" value={totalClaimed} />
        <SummaryPill label="UNIQUE" value={completionStats.unlocked} />
        <SummaryPill label="TOTAL" value={completionStats.total} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <SectionHeader title="ACTIVE OBJECTIVES" subtitle="Auto-rotates as you complete them" />

        {SCOPES.map((scope) => {
          const slot = goals?.[scope] ?? null;
          return (
            <GoalCard
              key={scope}
              scope={scope}
              slot={slot}
              state={state}
              onClaim={() => handleClaim(scope)}
            />
          );
        })}

        {completed.length > 0 && (
          <View style={s.historyBlock}>
            <SectionHeader title="COMPLETED" subtitle={`${completed.length} unique goal${completed.length === 1 ? "" : "s"}`} />
            {completed.map((id) => {
              const tpl = getTemplate(id);
              if (!tpl) return null;
              return (
                <View key={id} style={s.historyRow}>
                  <Feather name="check-circle" size={12} color={Colors.accent} />
                  <Text style={s.historyTitle}>{tpl.title}</Text>
                  <Text style={s.historyScope}>{tpl.scope.toUpperCase()}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  const s = useStyles();
  return (
    <View style={s.pill}>
      <Text style={s.pillValue}>{value}</Text>
      <Text style={s.pillLabel}>{label}</Text>
    </View>
  );
}

function GoalCard({
  scope,
  slot,
  state,
  onClaim,
}: {
  scope: GoalScope;
  slot: PersonalGoalSlot | null;
  state: any;
  onClaim: () => void;
}) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const meta = getScopeMeta(Colors)[scope];
  if (!slot) {
    return (
      <View style={[s.card, { borderLeftColor: meta.color }]}>
        <View style={s.cardHeaderRow}>
          <Feather name={meta.icon as any} size={14} color={meta.color} />
          <Text style={[s.scopeLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={s.emptyText}>Generating new objective…</Text>
      </View>
    );
  }
  const tpl = getTemplate(slot.templateId);
  if (!tpl) {
    return (
      <View style={[s.card, { borderLeftColor: meta.color }]}>
        <Text style={s.emptyText}>Unknown goal: {slot.templateId}</Text>
      </View>
    );
  }
  const progress = getGoalProgress(slot, state);
  const complete = isGoalComplete(slot, state);
  const pct = tpl.target > 0 ? Math.min(1, progress.current / tpl.target) : 0;
  return (
    <View style={[s.card, { borderLeftColor: meta.color }]}>
      <View style={s.cardHeaderRow}>
        <Feather name={meta.icon as any} size={14} color={meta.color} />
        <Text style={[s.scopeLabel, { color: meta.color }]}>{meta.label}</Text>
        <Text style={s.scopeSubtitle}>{meta.subtitle}</Text>
      </View>
      <Text style={s.title}>{tpl.title}</Text>
      <Text style={s.body}>{tpl.description}</Text>

      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: meta.color }]} />
      </View>
      <View style={s.progressRow}>
        <Text style={s.progressText}>
          {progress.current.toLocaleString()} / {tpl.target.toLocaleString()}
        </Text>
        <Text style={s.progressPct}>{Math.floor(pct * 100)}%</Text>
      </View>

      <View style={s.rewardRow}>
        <Feather name="dollar-sign" size={11} color={Colors.accentDim} />
        <Text style={s.rewardText}>{tpl.rewardCredits.toLocaleString()}</Text>
        <Feather name="star" size={11} color={Colors.warning} style={{ marginLeft: 8 }} />
        <Text style={s.rewardText}>{tpl.rewardXp} XP</Text>
      </View>

      <Pressable
        onPress={onClaim}
        disabled={!complete}
        style={[s.claimBtn, complete ? s.claimBtnReady : s.claimBtnDisabled]}
      >
        <Text style={[s.claimText, complete ? s.claimTextReady : s.claimTextDisabled]}>
          {complete ? "CLAIM REWARD" : "IN PROGRESS"}
        </Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    letterSpacing: 1.5,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  pill: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: "center",
  },
  pillValue: {
    color: Colors.accent,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 16,
    fontWeight: "700",
  },
  pillLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
  },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 80, gap: Platform.OS === "web" ? 10 : 12 },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 12,
    gap: 8,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scopeLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontWeight: "700",
  },
  scopeSubtitle: {
    color: Colors.textMuted,
    fontSize: 10,
    marginLeft: 6,
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  barTrack: {
    height: 6,
    backgroundColor: Colors.bgElevated,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
  },
  barFill: { height: "100%" },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  progressText: {
    color: Colors.text,
    fontSize: 11,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  progressPct: {
    color: Colors.accentDim,
    fontSize: 11,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  rewardText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  claimBtn: {
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
  },
  claimBtnReady: { backgroundColor: Colors.accentDark, borderColor: Colors.accent },
  claimBtnDisabled: { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  claimText: {
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  claimTextReady: { color: Colors.accent },
  claimTextDisabled: { color: Colors.textMuted },
  emptyText: { color: Colors.textMuted, fontSize: 12 },
  historyBlock: { marginTop: 16, gap: 4 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
  },
  historyTitle: { flex: 1, color: Colors.textSecondary, fontSize: 11 },
  historyScope: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
}));

export default withScreenBoundary(GoalsScreen, "goals");

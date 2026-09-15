import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
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

import EmptyState from "@/components/EmptyState";
import ActionCostTimingReadout from "@/components/ActionCostTimingReadout";
import GameModal from "@/components/GameModal";
import SectionHeader from "@/components/SectionHeader";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  OFFICER_MISSIONS,
  OFFICER_MISSIONS_MAP,
  MISSION_CATEGORY_LABELS,
  calculateSuccessChance,
  getSuccessChanceBreakdown,
  getAvailableOfficersForMission,
  canLaunchMission,
  type MissionCategory,
  type MissionId,
} from "@/engine/officerMissions";
import type { Officer } from "@/engine/types";
import { getTimedActionCostTiming } from "@/engine/actionCostTiming";

type MciName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const CATEGORY_ICONS: Record<MissionCategory, string> = {
  intelligence: "eye-outline",
  diplomatic: "handshake-outline",
  resource: "treasure-chest",
  military: "sword-cross",
  special: "star-four-points",
};

function MissionsScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, launchOfficerMission } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const [selectedCategory, setSelectedCategory] = useState<MissionCategory | "all">("all");
  const catScrollRef = useHorizontalWheelScroll();
  const [selectingOfficerFor, setSelectingOfficerFor] = useState<MissionId | null>(null);
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const allMissions = state.activeMissions ?? [];
  const { activeMissions, resolvedMissions } = useMemo(() => {
    const active: typeof allMissions = [];
    const resolved: typeof allMissions = [];
    for (const m of allMissions) {
      if (m.resolved) resolved.push(m);
      else active.push(m);
    }
    return { activeMissions: active, resolvedMissions: resolved };
  }, [allMissions]);
  // NOTE: keep `[state]` here. `runTick` unconditionally clones
  // `state.officers` every tick (engine/formulas.ts), so narrowing the
  // dep would still re-run every tick — no perf win.
  const availableOfficers = useMemo(() => getAvailableOfficersForMission(state), [state]);

  const filteredMissions = useMemo(() =>
    selectedCategory === "all"
      ? OFFICER_MISSIONS
      : OFFICER_MISSIONS.filter(m => m.category === selectedCategory),
    [selectedCategory],
  );

  const handleSelectMission = (missionId: MissionId) => {
    if (activeMissions.length >= 3) {
      showModal("MISSION LIMIT", "Maximum 3 concurrent missions. Wait for an active mission to complete.", [{ text: "OK" }]);
      return;
    }
    if (availableOfficers.length === 0) {
      showModal("NO OFFICERS", "No appointed officers available. All officers are either unappointed or already on missions.", [{ text: "OK" }]);
      return;
    }
    setSelectingOfficerFor(missionId);
  };

  const handleLaunchMission = (missionId: MissionId, officer: Officer) => {
    const def = OFFICER_MISSIONS_MAP[missionId]!;
    const { eligible, reasons } = canLaunchMission(state, missionId, officer.id);

    if (!eligible) {
      showModal("CANNOT LAUNCH", reasons.join("\n\n"), [{ text: "OK" }]);
      return;
    }

    const chance = calculateSuccessChance(officer, def);
    const breakdown = getSuccessChanceBreakdown(officer, def);
    const breakdownText = breakdown
      .map(f => `    ${f.delta >= 0 ? "+" : ""}${f.delta}%  ${f.label}`)
      .join("\n");

    showModal(
      "LAUNCH MISSION",
      `Deploy ${officer.name} on ${def.name}?\n\n• Duration: ${def.duration} ticks\n• Cost: ${def.creditsCost.toLocaleString()} credits\n• Success chance: ${chance}%\n\nSUCCESS CHANCE BREAKDOWN:\n${breakdownText}\n\n• Officer will be unavailable during mission\n\nRewards on success:\n${def.successRewards.map(r => `  • ${r.label}`).join("\n")}\n\nOn failure: ${def.failureConsequences}`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: `DEPLOY (${def.creditsCost.toLocaleString()} CR)`,
          style: "destructive",
          onPress: () => {
            launchOfficerMission(missionId, officer.id);
            setSelectingOfficerFor(null);
          },
        },
      ]
    );
  };

  const categories: (MissionCategory | "all")[] = ["all", "intelligence", "diplomatic", "resource", "military", "special"];

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="compass-outline" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>OFFICER MISSIONS</Text>
        <Text style={styles.headerCount}>{activeMissions.length}/3 active</Text>
      </View>

      <ScrollView ref={catScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.catScroll} contentContainerStyle={styles.catContent}>
        {categories.map(cat => (
          <Pressable
            key={cat}
            onPress={() => setSelectedCategory(cat)}
            style={[styles.catBtn, selectedCategory === cat && styles.catBtnActive]}
          >
            <Text style={[styles.catBtnText, selectedCategory === cat && styles.catBtnTextActive]}>
              {cat === "all" ? "ALL" : MISSION_CATEGORY_LABELS[cat].toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeMissions.length > 0 && (
          <>
            <SectionHeader
              title="Active Missions"
              icon={<MaterialCommunityIcons name="run-fast" size={14} color={Colors.warning} />}
            />
            {activeMissions.map((m, i) => {
              const def = OFFICER_MISSIONS_MAP[m.missionId];
              if (!def) return null;
              const progress = ((m.duration - m.ticksRemaining) / m.duration) * 100;
              const timing = getTimedActionCostTiming(
                { cost: def.creditsCost, duration: def.duration },
                { activeTicksRemaining: m.ticksRemaining, phase: "active" },
              );
              return (
                <View key={i} style={[styles.card, styles.cardActive]}>
                  <View style={styles.cardHeader}>
                    <MaterialCommunityIcons name={def.icon as MciName} size={18} color={Colors.warning} />
                    <View style={styles.cardTitleWrap}>
                      <Text style={styles.cardName}>{def.name}</Text>
                      <Text style={styles.cardOfficer}>Officer: {m.officerName}</Text>
                    </View>
                    <Text style={styles.ticksLeft}>{m.ticksRemaining}t</Text>
                  </View>
                  <View style={styles.progressWrap}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${progress}%` }]} />
                    </View>
                    <Text style={styles.progressText}>
                      {m.duration - m.ticksRemaining}/{m.duration} ticks ({Math.round(progress)}%)
                    </Text>
                  </View>
                  <ActionCostTimingReadout model={timing} compact />
                </View>
              );
            })}
          </>
        )}

        <SectionHeader
          title={selectedCategory === "all" ? "All Missions" : MISSION_CATEGORY_LABELS[selectedCategory]}
          icon={<MaterialCommunityIcons name="clipboard-list-outline" size={14} color={Colors.accent} />}
        />
        {filteredMissions.length === 0 && (
          <EmptyState
            icon="clipboard-list-outline"
            title="NO MISSIONS IN CATEGORY"
            message="No missions match this category. Try selecting another tab above."
          />
        )}
        {filteredMissions.map(def => {
          const canAfford = state.resources.credits >= def.creditsCost;
          const hasOfficers = availableOfficers.length > 0;
          const atLimit = activeMissions.length >= 3;
          const launchable = canAfford && hasOfficers && !atLimit;
          const timing = getTimedActionCostTiming(
            { cost: def.creditsCost, duration: def.duration },
            { availableCredits: state.resources.credits },
          );

          return (
            <Pressable
              key={def.id}
              onPress={() => handleSelectMission(def.id)}
              style={({ pressed }) => [
                styles.card,
                !launchable && styles.cardDisabled,
                pressed && launchable && styles.cardPressed,
              ]}
              disabled={!launchable}
            >
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons
                  name={def.icon as MciName}
                  size={20}
                  color={launchable ? Colors.accent : Colors.textMuted}
                />
                <View style={styles.cardTitleWrap}>
                  <Text style={[styles.cardName, !launchable && { color: Colors.textMuted }]}>{def.name}</Text>
                  <Text style={styles.catTag}>{MISSION_CATEGORY_LABELS[def.category]}</Text>
                </View>
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{def.duration}t</Text>
                </View>
              </View>
              <Text style={styles.missionDesc}>{def.description}</Text>
              <View style={styles.missionMeta}>
                <Text style={styles.metaItem}>Min Comp: {def.minCompetence}</Text>
              </View>
              <ActionCostTimingReadout model={timing} includeBehavior compact />
              <View style={styles.rewardsWrap}>
                {def.successRewards.map((r, i) => (
                  <Text key={i} style={styles.rewardText}>• {r.label}</Text>
                ))}
              </View>
            </Pressable>
          );
        })}

        {resolvedMissions.length > 0 && (
          <>
            <SectionHeader
              title="Mission History"
              icon={<MaterialCommunityIcons name="history" size={14} color={Colors.textMuted} />}
            />
            {resolvedMissions.slice(-10).reverse().map((m, i) => {
              const def = OFFICER_MISSIONS_MAP[m.missionId];
              if (!def) return null;
              const wasSuccess = m.outcome === "success";
              const hasOutcome = m.outcome !== undefined;
              return (
                <View key={`hist-${i}`} style={[styles.card, styles.historyCard]}>
                  <View style={styles.cardHeader}>
                    <MaterialCommunityIcons
                      name={def.icon as MciName}
                      size={16}
                      color={Colors.textMuted}
                    />
                    <View style={styles.cardTitleWrap}>
                      <Text style={[styles.cardName, { color: Colors.textMuted }]}>{def.name}</Text>
                      <Text style={styles.cardOfficer}>{m.officerName}</Text>
                    </View>
                    <View style={[
                      styles.historyBadge,
                      !hasOutcome
                        ? { backgroundColor: "rgba(100,100,100,0.2)" }
                        : wasSuccess
                          ? { backgroundColor: "rgba(0,200,80,0.15)" }
                          : { backgroundColor: "rgba(255,68,68,0.15)" },
                    ]}>
                      <Text style={[styles.historyBadgeText,
                        !hasOutcome
                          ? { color: Colors.textMuted }
                          : wasSuccess
                            ? { color: "#00c850" }
                            : { color: "#ff4444" }
                      ]}>
                        {!hasOutcome ? "RESOLVED" : wasSuccess ? "SUCCESS" : "FAILED"}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {selectingOfficerFor && (
        <View style={styles.officerOverlay}>
          <View style={styles.officerPanel}>
            <View style={styles.officerPanelHeader}>
              <Text style={styles.officerPanelTitle}>SELECT OFFICER</Text>
              <Pressable onPress={() => setSelectingOfficerFor(null)} accessibilityRole="button" accessibilityLabel="Close officer picker">
                <Feather name="x" size={20} color={Colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.officerList} showsVerticalScrollIndicator={false}>
              {availableOfficers.length === 0 && (
                <Text style={styles.noOfficers}>No officers available</Text>
              )}
              {availableOfficers.map(officer => {
                const def = (selectingOfficerFor ? OFFICER_MISSIONS_MAP[selectingOfficerFor] : undefined);
                const chance = def ? calculateSuccessChance(officer, def) : 0;
                const meetsMin = officer.competence >= (def?.minCompetence ?? 0);
                return (
                  <Pressable
                    key={officer.id}
                    onPress={() => handleLaunchMission(selectingOfficerFor, officer)}
                    style={({ pressed }) => [
                      styles.officerCard,
                      !meetsMin && styles.officerCardWeak,
                      pressed && styles.officerCardPressed,
                    ]}
                  >
                    <View style={styles.officerCardTop}>
                      <View style={styles.officerInfo}>
                        <Text style={styles.officerName} numberOfLines={1}>{officer.name}</Text>
                        <Text style={styles.officerRole} numberOfLines={1}>{officer.position ?? officer.department}</Text>
                      </View>
                      <View style={[
                        styles.chanceBadge,
                        chance >= 70 ? styles.chanceHigh :
                        chance >= 40 ? styles.chanceMed : styles.chanceLow,
                      ]}>
                        <Text style={styles.chanceText}>{chance}%</Text>
                      </View>
                    </View>
                    <View style={styles.officerStats}>
                      <Text style={styles.statText}>C:{officer.competence}</Text>
                      <Text style={styles.statText}>L:{officer.loyalty}</Text>
                      <Text style={styles.statText}>A:{officer.ambition}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 2,
    flex: 1,
  },
  headerCount: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  catScroll: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxHeight: 40,
  },
  catContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    alignItems: "center",
  },
  catBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.bg,
  },
  catBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  catBtnTextActive: {
    color: Colors.accent,
  },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, gap: Platform.OS === "web" ? 10 : 12 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  cardActive: {
    borderColor: Colors.warning,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardPressed: {
    opacity: 0.8,
    borderColor: Colors.accent,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitleWrap: { flex: 1 },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  cardOfficer: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  catTag: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  ticksLeft: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.warning,
  },
  durationBadge: {
    backgroundColor: Colors.bg,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.text,
  },
  missionDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 6,
    marginBottom: 6,
  },
  missionMeta: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 6,
  },
  metaItem: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
  },
  rewardsWrap: { gap: 2 },
  rewardText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.accent,
  },
  progressWrap: { marginTop: 6 },
  progressBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  progressText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 3,
  },
  officerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  officerPanel: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: "70%",
    padding: 16,
  },
  officerPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  officerPanelTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.accent,
    letterSpacing: 2,
  },
  officerList: { flex: 1 },
  noOfficers: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    paddingVertical: 20,
  },
  officerCard: {
    backgroundColor: Colors.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    marginBottom: 6,
    gap: 4,
  },
  officerCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  officerCardWeak: {
    opacity: 0.6,
  },
  officerCardPressed: {
    borderColor: Colors.accent,
  },
  officerInfo: { flex: 1, minWidth: 0 },
  officerName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.text,
  },
  officerRole: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  officerStats: {
    flexDirection: "row",
    gap: 6,
  },
  statText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
  },
  chanceBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chanceHigh: { backgroundColor: "rgba(0,255,65,0.15)" },
  chanceMed: { backgroundColor: "rgba(255,168,0,0.15)" },
  chanceLow: { backgroundColor: "rgba(255,68,68,0.15)" },
  chanceText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: Colors.text,
  },
  historyCard: {
    opacity: 0.6,
    borderColor: Colors.border,
  },
  historyBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  historyBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
  },
}));

export default withScreenBoundary(MissionsScreen, "missions");

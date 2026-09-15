import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ContextMenu from "@/components/ContextMenu";
import GameModal from "@/components/GameModal";
import HoverTooltip from "@/components/HoverTooltip";
import ProgressBar from "@/components/ProgressBar";
import SearchBar from "@/components/SearchBar";
import TutorialHint from "@/components/TutorialHint";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useHotkeys } from "@/context/HotkeyContext";
import { useGameModal } from "@/hooks/useGameModal";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import {
  TECH_CATEGORY_ICONS,
  TECH_CATEGORY_LABELS,
  TECH_MAP,
  TECH_TIER_LABELS,
  canResearch,
  getVisibleTechnologies,
  getTotalTechEffects,
} from "@/engine/technologies";
import {
  getResearchEstimateSnapshot,
  getResearchEstimateTiming,
  getResearchQueueTechIds,
  getResearchQueueUnlockEstimates,
  getResearchUnlockEstimate,
} from "@/engine/researchBreakdown";
import { isSixthDayActive } from "@/engine/addons/sixthDay";
import { RESEARCH_COST_MULTIPLIER } from "@/engine/researchConstants";
import type { TechCategory, TechDef } from "@/engine/types";
import {
  filterTechnologiesByCategory,
  searchAllTechnologies,
} from "@/utils/researchSearch";

const BASE_CATEGORIES: TechCategory[] = [
  "energy", "water", "food", "industrial", "construction", "transport",
  "security", "military", "medical", "research", "civic", "experimental",
  "weapons", "missiles", "ammunition",
  "rocketry", "satellites", "orbitalInfra", "spaceIndustry",
  "colonization", "spaceNavy", "spaceScience", "spaceMissiles",
  "cybernetics", "beautification", "xenobiology", "uplift", "ecology", "religion",
];

const SD_CATEGORIES: TechCategory[] = ["dna", "genetics", "cloning"];

const CTX_ITEMS: { label: string; action: string; danger?: boolean }[] = [
  { label: "Start Research", action: "start" },
  { label: "Add to Queue", action: "queue" },
];

function formatEffects(effects: TechDef["effects"]): string {
  const labels: Record<string, string> = {
    crime: "Crime", unrest: "Unrest", happiness: "Happiness", lawOrder: "Law",
    corruption: "Corruption", employment: "Employment",
    infrastructureHealth: "Infrastructure", defenseRating: "Defense",
    populationGrowthRate: "Pop Growth", foodProduction: "Food",
    waterProduction: "Water", powerGeneration: "Power",
    steelProduction: "Steel", goodsProduction: "Goods",
    fuelProduction: "Fuel", medProduction: "Medical",
    taxIncome: "Tax Income", tradeIncome: "Trade Income",
    researchSpeed: "Research Speed", constructionSpeed: "Construction Speed",
  };
  return Object.entries(effects)
    .filter(([, v]) => v !== undefined && v !== 0)
    .map(([k, v]) => {
      const n = v as number;
      const sign = n > 0 ? "+" : "";
      return `${labels[k] ?? k} ${sign}${n}`;
    })
    .join(", ");
}

function formatResearchTime(minutes: number | null): string {
  if (minutes === null) return "STALLED";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours >= 10 ? hours.toFixed(0) : hours.toFixed(1)} h`;
}

type TechStatus = "unlocked" | "available" | "locked" | "researching";

type ListedTech = TechDef & { categoryLabel?: string };
type FlatTechItem = { type: "tier"; tier: number } | { type: "tech"; tech: ListedTech };

type TechCardProps = {
  tech: TechDef;
  categoryLabel?: string;
  status: TechStatus;
  isExpanded: boolean;
  isQueued: boolean;
  hasActiveResearch: boolean;
  activeResearchProgress: number;
  activeResearchCost: number;
  researchRate: number;
  tickIntervalMinutes: number;
  tickPaused: boolean;
  canQueue: boolean;
  lockedReason?: string;
  onToggle: (id: string) => void;
  onStartResearch: (tech: TechDef) => void;
  onQueueResearch: (tech: TechDef) => void;
  onContextMenu?: (id: string, e: any) => void;
};

const STATUS_COLOR_KEYS: Record<TechStatus, "accent" | "warning" | "info" | "textMuted"> = {
  unlocked: "accent",
  available: "warning",
  researching: "info",
  locked: "textMuted",
};

const statusIcon = (s: TechStatus): string => {
  switch (s) {
    case "unlocked": return "check-circle";
    case "available": return "unlock";
    case "researching": return "loader";
    case "locked": return "lock";
  }
};

const TechCard = React.memo(function TechCard({
  tech, categoryLabel, status, isExpanded, isQueued: queued, hasActiveResearch,
  activeResearchProgress, activeResearchCost, researchRate, tickIntervalMinutes, tickPaused, canQueue, lockedReason, onToggle, onStartResearch, onQueueResearch, onContextMenu,
}: TechCardProps) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  const color = tc[STATUS_COLOR_KEYS[status]];
  return (
    <Pressable
      style={[styles.techCard, { backgroundColor: tc.bgCard, borderColor: tc.border, borderLeftColor: color }]}
      onPress={() => onToggle(tech.id)}
      {...(Platform.OS === "web" && onContextMenu ? { onContextMenu: (e: any) => onContextMenu(tech.id, e) } : {})}
    >
      <View style={styles.techTop}>
        <Feather name={statusIcon(status) as any} size={14} color={color} />
        <View style={styles.techTitleBlock}>
          <Text style={[styles.techName, { color }]} numberOfLines={1}>{tech.name}</Text>
          {categoryLabel && (
            <Text style={[styles.techCategory, { color: tc.textMuted }]} numberOfLines={1}>
              {categoryLabel}
            </Text>
          )}
        </View>
        <Text style={[styles.techCost, { color: tc.textMuted }]}>{tech.researchCost * RESEARCH_COST_MULTIPLIER}pts</Text>
      </View>
      {isExpanded && (
        <View style={[styles.techExpanded, { borderTopColor: tc.border }]}>
          <Text style={[styles.techDesc, { color: tc.textSecondary }]}>{tech.description}</Text>
          <Text style={[styles.techEffects, { color: tc.accent }]}>{formatEffects(tech.effects)}</Text>
          {tech.prerequisites.length > 0 && (
            <Text style={[styles.techPrereqs, { color: tc.textMuted }]}>
              Requires: {tech.prerequisites.map((p) => TECH_MAP[p]?.name ?? p).join(", ")}
            </Text>
          )}
          {status === "available" && (
            <View style={styles.techBtnRow}>
              <Pressable style={[styles.researchBtn, { backgroundColor: tc.accent }]} onPress={() => onStartResearch(tech)}>
                <Feather name="play" size={12} color={tc.bg} />
                <Text style={[styles.researchBtnText, { color: tc.bg }]}>{hasActiveResearch ? "QUEUE" : "BEGIN"}</Text>
              </Pressable>
              {hasActiveResearch && !queued && canQueue && (
                <Pressable style={[styles.queueBtn, { borderColor: tc.accent }]} onPress={() => onQueueResearch(tech)}>
                  <Feather name="plus" size={12} color={tc.accent} />
                  <Text style={[styles.queueBtnText, { color: tc.accent }]}>QUEUE</Text>
                </Pressable>
              )}
              {queued && <Text style={[styles.queuedBadge, { color: tc.accent, borderColor: tc.accent }]}>QUEUED</Text>}
            </View>
          )}
          {status === "locked" && (
            <Text style={[styles.lockedText, { color: tc.textMuted }]}>
              {lockedReason ?? "Prerequisites required"}
            </Text>
          )}
          {status === "unlocked" && <Text style={[styles.unlockedText, { color: tc.accent }]}>RESEARCHED</Text>}
          {status === "researching" && (() => {
            const denom = activeResearchCost > 0 ? activeResearchCost : tech.researchCost * RESEARCH_COST_MULTIPLIER;
            const pct = denom > 0 ? Math.max(0, Math.min(100, (activeResearchProgress / denom) * 100)) : 0;
            const estimate = getResearchUnlockEstimate(
              activeResearchProgress,
              denom,
              researchRate,
              tickIntervalMinutes,
            );
            const timing = getResearchEstimateTiming(estimate, tickPaused);
            return (
              <>
                <View style={[styles.progressBarOuter, { backgroundColor: tc.bgSecondary }]}>
                  <View
                    style={[
                      styles.progressBarInner,
                      { width: `${pct}%`, backgroundColor: tc.info },
                    ]}
                  />
                </View>
                <Text style={[styles.techPrereqs, { color: tc.info, marginTop: 4 }]}>
                  {activeResearchProgress.toFixed(0)} / {denom.toFixed(0)} pts
                </Text>
                <Text style={[styles.techPrereqs, { color: tc.info, marginTop: 2 }]}>
                  {estimate.remainingPoints.toFixed(0)} pts remaining · {researchRate} pts/tick
                  {estimate.ticksRemaining !== null
                    ? tickPaused
                      ? ` · ETA ~${estimate.ticksRemaining} ticks (theoretical ~${formatResearchTime(timing.theoreticalMinutesRemaining)}; PAUSED — no time advances)`
                      : ` · ETA ~${estimate.ticksRemaining} ticks (~${formatResearchTime(timing.advancingMinutesRemaining)})`
                    : " · STALLED"}
                </Text>
              </>
            );
          })()}
        </View>
      )}
    </Pressable>
  );
});

function ResearchScreen() {
  const insets = useSafeAreaInsets();
  const { state: rawState, startResearch, cancelResearch, queueResearch, removeFromQueue, reorderQueue, toggleAutoResearch, researchQueueCapacity } = useGame();
  const state = useThrottledValue(rawState, 500);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { modal, showModal, hideModal } = useGameModal();
  const filterScrollRef = useHorizontalWheelScroll();
  const { cityStats: cs } = state;
  const [selectedCategory, setSelectedCategory] = useState<TechCategory | "all">("all");
  const [expandedTech, setExpandedTech] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const researchEstimates = useMemo(
    () => getResearchEstimateSnapshot(state, getTotalTechEffects(state.unlockedTechnologies)),
    [state],
  );
  const researchBreakdown = researchEstimates.breakdown;
  const researchRate = researchEstimates.researchRate;
  const tickIntervalMinutes = researchEstimates.tickIntervalMinutes;
  const activeResearchEstimate = researchEstimates.activeResearch;
  const isResearchPaused = state.tickPaused ?? false;
  const activeResearchTiming = getResearchEstimateTiming(activeResearchEstimate, isResearchPaused);
  const queueTechIds = useMemo(
    () => getResearchQueueTechIds(state.researchQueue),
    [state.researchQueue],
  );
  const queueEstimates = useMemo(
    () => getResearchQueueUnlockEstimates(
      queueTechIds.map((techId) => (TECH_MAP[techId]?.researchCost ?? 0) * RESEARCH_COST_MULTIPLIER),
      researchRate,
      tickIntervalMinutes,
      activeResearchEstimate?.ticksRemaining ?? 0,
    ),
    [activeResearchEstimate?.ticksRemaining, queueTechIds, researchRate, tickIntervalMinutes],
  );

  const availableTechs = useMemo(() => {
    return getVisibleTechnologies(state.addons, state.unlockedTechnologies);
  }, [state.addons, state.unlockedTechnologies]);
  const ALL_CATEGORIES = useMemo(() => {
    return isSixthDayActive(state.addons) ? [...BASE_CATEGORIES, ...SD_CATEGORIES] : BASE_CATEGORIES;
  }, [state.addons]);

  const techs = useMemo(() => {
    if (searchQuery.trim()) {
      return searchAllTechnologies(availableTechs, searchQuery, TECH_CATEGORY_LABELS);
    }
    return filterTechnologiesByCategory(availableTechs, selectedCategory);
  }, [selectedCategory, availableTechs, searchQuery]);

  const groupedByTier = useMemo(() => {
    const map: Record<number, ListedTech[]> = {};
    for (const t of techs) {
      if (!map[t.tier]) map[t.tier] = [];
      map[t.tier].push(t);
    }
    return map;
  }, [techs]);

  const getTechStatus = useCallback((techId: string): TechStatus => {
    if (state.unlockedTechnologies.includes(techId)) return "unlocked";
    if (state.activeResearch?.techId === techId) return "researching";
    const check = canResearch(techId, state.unlockedTechnologies, state.addons);
    return check.available ? "available" : "locked";
  }, [state.unlockedTechnologies, state.activeResearch?.techId, state.addons]);

  const totalUnlocked = state.unlockedTechnologies.length;
  const totalTechs = availableTechs.length;

  const isQueued = useCallback((techId: string) => queueTechIds.includes(techId), [queueTechIds]);

  const handleQueueResearch = useCallback((tech: TechDef) => {
    if (isQueued(tech.id)) {
      showModal("ALREADY QUEUED", `${tech.name} is already in the research queue.`, [{ text: "OK", style: "cancel" }]);
      return;
    }
    if (queueTechIds.length >= researchQueueCapacity) {
      showModal("QUEUE FULL", `Maximum queue capacity: ${researchQueueCapacity}. Build more Research Labs to expand.`, [{ text: "OK", style: "cancel" }]);
      return;
    }
    queueResearch(tech.id);
  }, [isQueued, queueTechIds.length, researchQueueCapacity, showModal, queueResearch]);

  const handleStartResearch = useCallback((tech: TechDef) => {
    if (state.activeResearch) {
      const canQueue = !isQueued(tech.id) && queueTechIds.length < researchQueueCapacity;
      showModal(
        "RESEARCH IN PROGRESS",
        `Currently researching: ${TECH_MAP[state.activeResearch.techId]?.name ?? "Unknown"}.\n${canQueue ? "Add to research queue instead?" : "Cancel current research first."}`,
        canQueue
          ? [
              { text: "Cancel", style: "cancel" },
              { text: "ADD TO QUEUE", onPress: () => handleQueueResearch(tech) },
            ]
          : [{ text: "OK", style: "cancel" }]
      );
      return;
    }
    if (researchRate <= 0) {
      showModal("NO RESEARCH CAPACITY", "Build Research Labs or hire scientists to generate research output.", [{ text: "OK", style: "cancel" }]);
      return;
    }
    const effectiveCost = tech.researchCost * RESEARCH_COST_MULTIPLIER;
    const ticksNeeded = Math.ceil(effectiveCost / researchRate);
    const tickMinutes = state.tickIntervalMinutes ?? 15;
    const hoursEst = (ticksNeeded * tickMinutes / 60).toFixed(1);
    showModal(
      `COMMENCE RESEARCH?`,
      `${tech.name}\nCost: ${effectiveCost} research points\nEst. ${ticksNeeded} ticks (~${hoursEst}h)\n\nEffects: ${formatEffects(tech.effects)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "BEGIN",
          style: "destructive",
          onPress: () => { startResearch(tech.id); },
        },
      ]
    );
  }, [state.activeResearch, isQueued, queueTechIds.length, researchQueueCapacity, researchRate, showModal, startResearch, handleQueueResearch]);

  const handleCancelResearch = useCallback(() => {
    showModal(
      "CANCEL RESEARCH?",
      "All progress on current research will be lost.",
      [
        { text: "Keep Going", style: "cancel" },
        { text: "Cancel Research", style: "destructive", onPress: cancelResearch },
      ]
    );
  }, [showModal, cancelResearch]);

  const flatTechList = useMemo<FlatTechItem[]>(() => {
    const items: FlatTechItem[] = [];
    for (const tier of [1, 2, 3, 4, 5]) {
      const tierTechs = groupedByTier[tier];
      if (!tierTechs || tierTechs.length === 0) continue;
      items.push({ type: "tier", tier });
      for (const tech of tierTechs) {
        items.push({ type: "tech", tech });
      }
    }
    return items;
  }, [groupedByTier]);

  const onToggleTech = useCallback((id: string) => {
    setExpandedTech((prev) => prev === id ? null : id);
  }, []);

  const [ctx, setCtx] = useState<{ visible: boolean; position: { x: number; y: number }; id: string | null }>(
    { visible: false, position: { x: 0, y: 0 }, id: null }
  );
  const openCtx = useCallback((id: string, e: any) => {
    if (Platform.OS !== "web") return;
    e?.preventDefault?.();
    const x = e?.nativeEvent?.pageX ?? e?.pageX ?? 0;
    const y = e?.nativeEvent?.pageY ?? e?.pageY ?? 0;
    setCtx({ visible: true, position: { x, y }, id });
  }, []);
  const closeCtx = useCallback(() => setCtx((c) => ({ ...c, visible: false })), []);
  const onCtxAction = useCallback((action: string) => {
    const id = ctx.id;
    setCtx((c) => ({ ...c, visible: false }));
    if (!id) return;
    const tech = TECH_MAP[id];
    if (!tech) return;
    if (action === "start") handleStartResearch(tech);
    else if (action === "queue") handleQueueResearch(tech);
  }, [ctx.id, handleStartResearch, handleQueueResearch]);

  const { registerSubTabs, unregisterSubTabs } = useHotkeys();
  useEffect(() => {
    const keys: (TechCategory | "all")[] = ["all", ...ALL_CATEGORIES];
    const idx = keys.indexOf(selectedCategory);
    registerSubTabs({
      prev: () => setSelectedCategory(keys[idx > 0 ? idx - 1 : keys.length - 1]),
      next: () => setSelectedCategory(keys[idx < keys.length - 1 ? idx + 1 : 0]),
    });
    return () => unregisterSubTabs();
  }, [selectedCategory, ALL_CATEGORIES, registerSubTabs, unregisterSubTabs]);

  const { colors: tc } = useTheme();
  const styles = useStyles();

  const queueLength = (state.researchQueue ?? []).length;
  const canQueueMore = queueLength < researchQueueCapacity;

  const renderTechItem = useCallback(({ item }: { item: FlatTechItem }) => {
    if (item.type === "tier") {
      return (
        <View style={styles.tierHeader}>
          <View style={[styles.tierBadge, { backgroundColor: tc.accent }]}>
            <Text style={[styles.tierBadgeText, { color: tc.bg }]}>T{item.tier}</Text>
          </View>
          <Text style={[styles.tierTitle, { color: tc.textSecondary }]}>{TECH_TIER_LABELS[item.tier]}</Text>
        </View>
      );
    }
    const tech = item.tech;
    const status = getTechStatus(tech.id);
    return (
      <TechCard
        tech={tech}
        categoryLabel={tech.categoryLabel}
        status={status}
        isExpanded={expandedTech === tech.id}
        isQueued={isQueued(tech.id)}
        hasActiveResearch={!!state.activeResearch}
        activeResearchProgress={state.activeResearch?.progress ?? 0}
        activeResearchCost={state.activeResearch?.cost ?? 0}
        researchRate={researchRate}
        tickIntervalMinutes={tickIntervalMinutes}
        tickPaused={isResearchPaused}
        canQueue={canQueueMore}
        lockedReason={canResearch(tech.id, state.unlockedTechnologies, state.addons).reason}
        onToggle={onToggleTech}
        onStartResearch={handleStartResearch}
        onQueueResearch={handleQueueResearch}
        onContextMenu={openCtx}
      />
    );
  }, [expandedTech, state.activeResearch, state.unlockedTechnologies, state.addons, canQueueMore, researchRate, tickIntervalMinutes, isResearchPaused, getTechStatus, isQueued, onToggleTech, handleStartResearch, handleQueueResearch, openCtx, tc]);

  const techKeyExtractor = useCallback((item: FlatTechItem, index: number) =>
    item.type === "tier" ? `tier-${item.tier}` : item.tech.id, []);

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: tc.bg }]}>
      <View style={[styles.header, { backgroundColor: tc.bgSecondary, borderBottomColor: tc.border }]}>
        <Feather name="cpu" size={18} color={tc.accent} />
        <Text style={[styles.headerTitle, { color: tc.accent }]}>TECHNOLOGY TREE</Text>
        <Text style={styles.headerCount}>{totalUnlocked}/{totalTechs}</Text>
      </View>

      <FlatList
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        data={flatTechList}
        keyExtractor={techKeyExtractor}
        renderItem={renderTechItem}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        ListHeaderComponent={
          <>
            <TutorialHint
              id="research_intro"
              message="Research unlocks permanent bonuses. Build Research Labs and assign scientists to increase your research rate. Queue technologies to auto-progress."
            />
            <View style={[styles.statusCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              <Text style={[styles.statusLabel, { color: tc.accent }]}>RESEARCH DIVISION</Text>
              <View style={styles.statusRow}>
                <Text style={styles.statLabel}>Research Rate</Text>
                <Text style={[styles.statValue, { color: researchRate > 0 ? tc.accent : tc.danger }]}>
                  {researchRate} pts/tick
                </Text>
              </View>
              <View style={styles.breakdownHeader}>
                <Text style={[styles.breakdownTitle, { color: tc.textSecondary }]}>OUTPUT BREAKDOWN</Text>
                <Text style={[styles.breakdownFormula, { color: tc.textMuted }]}>
                  {researchBreakdown.rawPoints.toFixed(2)} base pts × {researchBreakdown.multiplier.toFixed(2)} = {researchRate} applied
                </Text>
              </View>
              <View style={[styles.breakdownCard, { borderColor: tc.border, backgroundColor: tc.bgSecondary }]}>
                {researchBreakdown.lines.map((line) => (
                  <View key={line.id} style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: tc.textSecondary }]}>{line.label}</Text>
                    <Text style={[styles.breakdownValue, { color: line.value < 0 ? tc.danger : tc.accent }]}>
                      {line.unit === "points"
                        ? `+${line.value.toFixed(2)} pts`
                        : `${line.value >= 0 ? "+" : ""}${line.value.toFixed(1)}%`}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statLabel}>Accumulated</Text>
                <Text style={[styles.statValue, { color: tc.info }]}>{Math.floor(cs.researchProgress)} pts</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statLabel}>Unlocked</Text>
                <Text style={[styles.statValue, { color: tc.accent }]}>{totalUnlocked} / {totalTechs}</Text>
              </View>
            </View>

            {researchRate <= 0 && (
              <View style={styles.warning}>
                <Feather name="alert-triangle" size={14} color={tc.warning} />
                <Text style={styles.warningText}>
                  No research capacity. Build Research Labs in Construction or hire Research Scientists to generate output.
                </Text>
              </View>
            )}

            {state.activeResearch && (
              <View style={styles.activeCard}>
                <View style={styles.activeHeader}>
                  <Feather name="loader" size={14} color={tc.info} />
                  <Text style={styles.activeLabel}>ACTIVE RESEARCH</Text>
                </View>
                <Text style={styles.activeName}>
                  {TECH_MAP[state.activeResearch.techId]?.name ?? "Unknown"}
                </Text>
                <ProgressBar
                  progress={state.activeResearch.progress}
                  total={state.activeResearch.cost}
                  label={`${state.activeResearch.progress} / ${state.activeResearch.cost} pts`}
                  color={tc.info}
                  height={8}
                />
                <View style={styles.statusRow}>
                  <Text style={styles.statLabel}>Remaining</Text>
                  <Text style={[styles.statValue, { color: tc.info }]}>
                    {activeResearchEstimate?.remainingPoints.toFixed(0) ?? "0"} pts
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statLabel}>Current gain</Text>
                  <Text style={[styles.statValue, { color: researchRate > 0 ? tc.accent : tc.danger }]}>
                    {researchRate} pts/active tick
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statLabel}>Estimated unlock</Text>
                  <Text style={[styles.statValue, { color: researchRate > 0 ? tc.info : tc.danger }]}>
                    {activeResearchEstimate && activeResearchEstimate.ticksRemaining !== null
                      ? isResearchPaused
                        ? `~${activeResearchEstimate.ticksRemaining} ticks (theoretical ~${formatResearchTime(activeResearchTiming.theoreticalMinutesRemaining)}; PAUSED)`
                        : `~${activeResearchEstimate.ticksRemaining} ticks (~${formatResearchTime(activeResearchTiming.advancingMinutesRemaining)})`
                      : "STALLED — No research capacity"}
                  </Text>
                </View>
                {isResearchPaused && (
                  <Text style={[styles.pausedResearchHint, { color: tc.warning }]}>
                    PAUSED — research points will not advance until the city resumes. The duration above is theoretical.
                  </Text>
                )}
                <Pressable style={styles.cancelBtn} onPress={handleCancelResearch}>
                  <Text style={styles.cancelBtnText}>CANCEL RESEARCH</Text>
                </Pressable>
              </View>
            )}

            <View style={[styles.queueCard, { backgroundColor: tc.bgCard, borderColor: tc.border, borderLeftColor: tc.accent }]}>
              <View style={styles.queueHeader}>
                <Feather name="list" size={14} color={tc.accent} />
                <Text style={[styles.queueLabel, { color: tc.accent }]}>RESEARCH QUEUE</Text>
                <Text style={[styles.queueCapacity, { color: queueLength >= researchQueueCapacity ? tc.warning : tc.textMuted }]}>{queueLength}/{researchQueueCapacity}</Text>
              </View>
              {queueLength >= researchQueueCapacity && (
                <Text style={[styles.queueEmpty, { color: tc.warning }]}>
                  Queue full. Build more Research Labs in Construction to raise the cap.
                </Text>
              )}
              {queueLength === 0 ? (
                <Text style={styles.queueEmpty}>No items queued. Tap a tech to add it.</Text>
              ) : (
                <>
                  <Text style={styles.queueHint}>
                    Completion estimates include active research and earlier queued projects.
                  </Text>
                  {queueTechIds.map((techId, idx) => {
                  const tech = TECH_MAP[techId];
                  if (!tech) return null;
                  const estimate = queueEstimates[idx];
                  const timing = estimate ? getResearchEstimateTiming(estimate, isResearchPaused) : null;
                  return (
                    <View key={techId} style={styles.queueItem}>
                      <Text style={styles.queueIndex}>{idx + 1}.</Text>
                      <View style={styles.queueItemMain}>
                        <Text style={styles.queueItemName} numberOfLines={1}>{tech.name}</Text>
                        <Text style={styles.queueItemEstimate}>
                          {estimate?.ticksRemaining !== null && estimate
                            ? isResearchPaused
                              ? `ETA ~${estimate.ticksRemaining} ticks (theoretical ~${formatResearchTime(timing?.theoreticalMinutesRemaining ?? null)}; PAUSED)`
                              : `ETA ~${estimate.ticksRemaining} ticks (~${formatResearchTime(timing?.advancingMinutesRemaining ?? null)})`
                            : "ETA STALLED"}
                        </Text>
                      </View>
                      <Text style={styles.queueItemCost}>{tech.researchCost * RESEARCH_COST_MULTIPLIER}pts</Text>
                      {idx > 0 && (
                        <HoverTooltip text="Move up in queue">
                          <Pressable onPress={() => reorderQueue(idx, idx - 1)} style={styles.queueMoveBtn} accessibilityRole="button" accessibilityLabel={`Move ${tech.name} up in research queue`}>
                            <Feather name="chevron-up" size={14} color={tc.accent} />
                          </Pressable>
                        </HoverTooltip>
                      )}
                      {idx < queueLength - 1 && (
                        <HoverTooltip text="Move down in queue">
                          <Pressable onPress={() => reorderQueue(idx, idx + 1)} style={styles.queueMoveBtn} accessibilityRole="button" accessibilityLabel={`Move ${tech.name} down in research queue`}>
                            <Feather name="chevron-down" size={14} color={tc.accent} />
                          </Pressable>
                        </HoverTooltip>
                      )}
                      <HoverTooltip text="Remove from queue">
                        <Pressable onPress={() => showModal(
                          "REMOVE FROM QUEUE?",
                          `${tech.name}\n\nRemoving this queued project will permanently discard its place in the research plan and any progress attached to it. No research points or other costs will be refunded.`,
                          [
                            { text: "CANCEL", style: "cancel" },
                            { text: "REMOVE", style: "destructive", onPress: () => removeFromQueue(techId) },
                          ],
                        )} style={styles.queueRemoveBtn} accessibilityRole="button" accessibilityLabel={`Remove ${tech.name} from research queue`}>
                          <Feather name="x" size={14} color={tc.danger} />
                        </Pressable>
                      </HoverTooltip>
                    </View>
                  );
                  })}
                </>
              )}
              <Pressable style={styles.autoResearchBtn} onPress={toggleAutoResearch}>
                <Feather name={state.autoResearch ? "check-square" : "square"} size={14} color={state.autoResearch ? tc.accent : tc.textMuted} />
                <Text style={[styles.autoResearchText, state.autoResearch && { color: tc.accent }]}>
                  AUTO-RESEARCH {state.autoResearch ? "ON" : "OFF"}
                </Text>
              </Pressable>
              {state.autoResearch && (
                <Text style={styles.autoResearchHint}>When queue is empty, cheapest available tech will auto-start.</Text>
              )}
            </View>

            <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="SEARCH TECHNOLOGIES..." />

            <Text style={styles.filterLabel}>FILTER BY CATEGORY</Text>
            <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.filterRow}>
              <Pressable
                style={[styles.filterChip, { borderColor: tc.border, backgroundColor: tc.bgCard }, selectedCategory === "all" && { backgroundColor: tc.accent, borderColor: tc.accent }]}
                onPress={() => setSelectedCategory("all")}
              >
                <Text style={[styles.filterChipText, { color: tc.textSecondary }, selectedCategory === "all" && { color: tc.bg }]}>
                  ALL ({totalTechs})
                </Text>
              </Pressable>
              {ALL_CATEGORIES.map((cat) => {
                const count = availableTechs.filter((t) => t.category === cat).length;
                const unlocked = state.unlockedTechnologies.filter((id) => TECH_MAP[id]?.category === cat).length;
                return (
                  <Pressable
                    key={cat}
                    style={[styles.filterChip, { borderColor: tc.border, backgroundColor: tc.bgCard }, selectedCategory === cat && { backgroundColor: tc.accent, borderColor: tc.accent }]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Feather
                      name={(TECH_CATEGORY_ICONS[cat] ?? "circle") as any}
                      size={11}
                      color={selectedCategory === cat ? tc.bg : tc.textSecondary}
                    />
                    <Text style={[styles.filterChipText, { color: tc.textSecondary }, selectedCategory === cat && { color: tc.bg }]}>
                      {TECH_CATEGORY_LABELS[cat]} {unlocked}/{count}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        }
        ListFooterComponent={
          <>
            <View style={[styles.docCard, { backgroundColor: tc.bgCard, borderColor: tc.border, borderLeftColor: tc.accent }]}>
              <Text style={[styles.docTitle, { color: tc.accent }]}>RESEARCH MANDATE</Text>
              <Text style={[styles.docText, { color: tc.textSecondary }]}>
                {">"} All research findings are classified Level Omega.{"\n"}
                {">"} Unauthorized access to research terminals: 20 years.{"\n"}
                {">"} Tech deployment requires City Commander approval.{"\n"}
                {">"} Experimental projects carry inherent catastrophic risk.
              </Text>
            </View>
            <View style={{ height: 30 }} />
          </>
        }
      />
      <GameModal {...modal} onDismiss={hideModal} />
      <ContextMenu visible={ctx.visible} position={ctx.position} items={CTX_ITEMS} onSelect={onCtxAction} onDismiss={closeCtx} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5, flex: 1 },
  headerCount: { color: Colors.textSecondary, fontFamily: "Inter_700Bold", fontSize: 12 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },
  statusCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
  },
  statusLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 2,
  },
  breakdownHeader: {
    marginTop: 12,
    marginBottom: 6,
  },
  breakdownTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  breakdownFormula: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 3,
  },
  breakdownCard: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  breakdownLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },
  breakdownValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  statLabel: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 12 },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255,149,0,0.08)",
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  warningText: {
    color: Colors.warning,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  activeCard: {
    backgroundColor: "rgba(0,122,255,0.08)",
    borderWidth: 1,
    borderColor: Colors.info,
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
  },
  activeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  pausedResearchHint: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  activeLabel: {
    color: Colors.info,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.5,
  },
  activeName: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginBottom: 8,
  },
  progressBarOuter: {
    height: 6,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressBarInner: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  cancelBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,59,48,0.15)",
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 3,
    marginTop: 6,
  },
  cancelBtnText: {
    color: Colors.danger,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  filterLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 4,
  },
  filterRow: {
    flexGrow: 0,
    marginBottom: 14,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    marginRight: 6,
    backgroundColor: Colors.bgCard,
  },
  filterChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  filterChipTextActive: {
    color: Colors.bg,
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  tierBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 3,
  },
  tierBadgeText: {
    color: Colors.bg,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  tierTitle: {
    color: Colors.textSecondary,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.5,
  },
  techCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderRadius: 3,
    padding: 10,
    marginBottom: 6,
  },
  techTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  techName: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  techTitleBlock: {
    flex: 1,
  },
  techCategory: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  techCost: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  techExpanded: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  techDesc: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  techEffects: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    marginBottom: 4,
  },
  techPrereqs: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 6,
  },
  researchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: Colors.accent,
    borderRadius: 3,
    marginTop: 4,
  },
  researchBtnText: {
    color: Colors.bg,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  lockedText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
  },
  unlockedText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  docCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: 14,
    marginTop: 16,
  },
  docTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  docText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 20,
  },
  queueCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
  },
  queueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  queueLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.5,
    flex: 1,
  },
  queueCapacity: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  queueEmpty: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 8,
  },
  queueHint: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    fontStyle: "italic",
    marginBottom: 4,
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  queueIndex: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    width: 20,
  },
  queueItemMain: {
    flex: 1,
    minWidth: 0,
  },
  queueItemName: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  queueItemEstimate: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  queueItemCost: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  queueMoveBtn: {
    padding: 4,
  },
  queueRemoveBtn: {
    padding: 4,
  },
  autoResearchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  autoResearchText: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  autoResearchHint: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 4,
    fontStyle: "italic",
  },
  techBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  queueBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 3,
  },
  queueBtnText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  queuedBadge: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 3,
    opacity: 0.6,
  },
}));

export default withScreenBoundary(ResearchScreen, "research");

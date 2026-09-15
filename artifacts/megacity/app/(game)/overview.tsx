import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import ActionCostTimingReadout from "@/components/ActionCostTimingReadout";
import EventCard from "@/components/EventCard";
import Insignia from "@/components/Insignia";
import PulsingAlert from "@/components/PulsingAlert";
import ResourceRow from "@/components/ResourceRow";
import SectionHeader from "@/components/SectionHeader";
import StatBar from "@/components/StatBar";
import LabourDayBoosterBanner from "@/components/LabourDayBoosterBanner";
const TickReportModal = React.lazy(() => import("@/components/TickReportModal"));
import { useGame } from "@/context/GameContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/context/ToastContext";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { getFactionName } from "@/engine/displayNames";
import { getPlayerFaction } from "@/engine/playerFaction";
import { computeFactionTraitMultipliers, computeCityTraitMultipliers } from "@/engine/namedCharacters";
import { getTraitVisual, getTraitDescription } from "@/engine/traitIcons";
import { getSeasonLabel, getSeasonIcon, getSeasonColor, getWeatherVisual } from "@/engine/weather";
import { useGameModal } from "@/hooks/useGameModal";
import { useGameLookups } from "@/hooks/useGameLookups";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { formatDate } from "@/engine/clock";
import { hasBlockingCrisis, TICKS_PER_TURN } from "@/engine/turnMode";
import { CITY_POLICIES, ALL_POLICIES, POLICY_CATEGORY_LABELS, POLICY_MAP, type PolicyCategory } from "@/engine/policies";
import { generateOverviewWarnings } from "@/engine/overviewWarnings";
import { navigateToOverviewWarning } from "@/utils/overviewNavigation";
import { parseOverviewSectionTarget, type OverviewSectionTarget } from "@/utils/overviewSections";
import { getBiosphereTrend } from "@/engine/biosphereTrend";
import { buildTickErrorReport } from "@/engine/tickErrorReport";
import { getBiosphereCrisisRisk } from "@/engine/wildlandsEcology";
import { computeBiosphereBreakdown } from "@/engine/biosphereBreakdown";
import { computeEconomyBreakdown } from "@/engine/economyBreakdown";
import { computeCrimeBreakdown } from "@/engine/crimeBreakdown";
import { computePowerBreakdown, computePowerEta } from "@/engine/powerBreakdown";
import { computeWaterBreakdown } from "@/engine/waterBreakdown";
import { computeInfrastructureBreakdown } from "@/engine/infrastructureBreakdown";
import { navigateToCrimeSuggestion } from "@/utils/crimeNavigation";
import { navigateToPowerSuggestion } from "@/utils/powerNavigation";
import { navigateToWaterSuggestion } from "@/utils/waterNavigation";
import { isBigBrotherActive } from "@/engine/addons/bigBrother";
import { isSixthDayActive } from "@/engine/addons/sixthDay";
import { formatCatchupDuration, formatNumber, formatPop, formatResumedAmount, getOvershootEscalation, isResumeOvershoot, shouldShowCatchupPill } from "@/utils/format";
import { TECH_MAP } from "@/engine/technologies";
import { formatActionCostTimingSummary, getPolicyCostTiming } from "@/engine/actionCostTiming";
import type { GameState } from "@/engine/types";
import { getWorkforceCatalog } from "@/engine/workforceCatalog";
import { getRailNetworkDiagnostics } from "@/engine/railNetwork";
import { computePopulationCohorts } from "@/engine/populationCohorts";
import { getIncarcerationSummary } from "@/engine/custody";
import { getEngineeringLedger } from "@/engine/engineeringReadout";
import {
  formatInfrastructureAccessibilityLabel,
  formatInfrastructurePoints,
  formatInfrastructureSummary,
} from "@/utils/infrastructurePresentation";
import { REALTIME_CLOCK_EXPLANATION, REALTIME_TICK_INTERVALS } from "@/utils/tickTimingCopy";
import TutorialHint from "@/components/TutorialHint";
import StarterObjectiveMarker from "@/components/StarterObjectiveMarker";
import DefenseBreakdownCard from "@/components/DefenseBreakdownCard";
import InfrastructureBreakdownCard from "@/components/InfrastructureBreakdownCard";
import HealthBreakdownCard from "@/components/HealthBreakdownCard";
import TransitBreakdownCard from "@/components/TransitBreakdownCard";
import CommunicationsBreakdownCard from "@/components/CommunicationsBreakdownCard";
import EmploymentBreakdownCard from "@/components/EmploymentBreakdownCard";
import { computeTransitBreakdown } from "@/engine/transitBreakdown";
import PopulationPressureCard from "@/components/PopulationPressureCard";
import InteractionMenu, { type InteractionMenuGroup } from "@/components/InteractionMenu";
import CrisisReportFrame from "@/components/CrisisReportFrame";
import EconomyBreakdownCard from "@/components/EconomyBreakdownCard";
import {
  PERSONAL_ACTIONS,
  PERSONAL_ACTION_DECAY_WINDOW_TICKS,
  PERSONAL_POPULATION_ACTION_ORDER,
  evaluatePersonalAction,
  formatPersonalActionSubtitle,
  COHORT_STEWARDSHIP_TARGETS,
  getCohortStewardshipActions,
  type PersonalActionId,
} from "@/engine/interactionMenu";
import { isCoerciveActionId } from "@/engine/coerciveBacklash";
import type { CohortStewardshipTargetId } from "@/engine/types";


type OverviewTab = "city" | "demographics";

const CITY_SECTIONS = ["Status", "People", "Infrastructure", "Supply", "Governance"] as const;
type CitySection = typeof CITY_SECTIONS[number];
const CITY_SECTION_FOR_TARGET: Record<OverviewSectionTarget, CitySection> = {
  status: "Status",
  people: "People",
  infrastructure: "Infrastructure",
  supply: "Supply",
  governance: "Governance",
};
const SECTION_FOR_SCROLL_KEY: Record<string, CitySection> = {
  health: "Status",
  employment: "People",
  transit: "Infrastructure",
};


// Values are either a route to push, or a "scroll:<key>" sentinel that jumps
// to the matching breakdown card further down this same screen (the key is
// looked up in the overview's breakdown-card position registry).
const STAT_NAV: Record<string, string> = {
  CRIME: "/(game)/districts",
  UNREST: "/(game)/districts",
  HAPPINESS: "/(game)/districts",
  "LAW ORDER": "/(game)/districts",
  CORRUPTION: "/(game)/districts",
  EMPLOYMENT: "scroll:employment",
  BIOSPHERE: "/(game)/overview",
  "PUBLIC HEALTH": "scroll:health",
  "DISEASE RISK": "scroll:health",
};

const STAT_HELP: Record<string, string> = {
  CRIME: "Petty theft, gang violence, and underworld activity. Lower is better. High crime drains income and breeds unrest. Hire law enforcement officers and pass strict edicts to reduce.",
  UNREST: "Public discontent and protest energy. Lower is better. High unrest can spark riots and topple districts. Boost happiness, ease food rationing, or push popular policies.",
  HAPPINESS: "How citizens feel about life under your rule. Higher is better. Driven by jobs, food, water, healthcare, and freedom. Falls fast under shortages or repressive policies.",
  "LAW ORDER": "Effective reach of police, courts, and surveillance. Higher is better. Suppresses crime and unrest, but extreme law order can erode happiness via authoritarian measures.",
  CORRUPTION: "Bribery, embezzlement, and kickbacks across the bureaucracy. Lower is better. Skims tax revenue and degrades law enforcement. Anti-corruption officers and audits help.",
  EMPLOYMENT: "Share of working-age citizens with jobs. Higher is better. Driven by industry, services, and infrastructure. Low employment fuels unrest and welfare costs. Tap this cell to jump to the Employment Breakdown card, which shows exactly what is moving it.",
  BIOSPHERE: "Ecological health — air, water, soil, wildlands. Higher is better. Industry and pollution drag it down. Green tech and sanctuary policies restore it. Crashes trigger plagues.",
  "PUBLIC HEALTH": "Medical wellbeing of the population. Higher is better. Clinics, med supplies, food, water, and sanitation raise it; shortages and disease drag it down. Tap this cell to jump to the Public Health Breakdown card, which shows exactly what is moving it.",
  "DISEASE RISK": "Probability of an outbreak this season. Lower is better. Driven by population density, sanitation, biosphere, and med supply stockpiles. Plagues are catastrophic. Tap this cell to jump to the Public Health Breakdown card.",
};

function StatGrid({ items, onShowHelp, onScrollToCard }: { items: { label: string; value: number; invert?: boolean }[]; onShowHelp?: (label: string, body: string) => void; onScrollToCard?: (key: string) => void }) {
  const { colors: tc } = useTheme();
  return (
    <View style={gridStyles.grid}>
      {items.map((item) => {
        const v = item.invert ? 100 - item.value : item.value;
        const color = v >= 65 ? tc.statHigh : v >= 35 ? tc.statMid : tc.statLow;
        const navTarget = STAT_NAV[item.label];
        const scrollKey = navTarget?.startsWith("scroll:") ? navTarget.slice("scroll:".length) : null;
        const canNav = scrollKey ? !!onScrollToCard : !!(navTarget && navTarget !== "/(game)/overview");
        const help = STAT_HELP[item.label];
        return (
          <Pressable
            key={item.label}
            onPress={() => {
              if (scrollKey) {
                onScrollToCard?.(scrollKey);
                return;
              }
              if (canNav) router.push(navTarget as any);
            }}
            onLongPress={help && onShowHelp ? () => onShowHelp(item.label, help) : undefined}
            accessibilityLabel={`${item.label} ${Math.round(item.value)}${help ? ". Long-press for details." : ""}`}
            style={({ pressed }) => [
              gridStyles.cell,
              { backgroundColor: tc.bgCard, borderColor: tc.border },
              pressed && canNav && { backgroundColor: tc.bgElevated, borderColor: tc.borderBright },
              Platform.OS === "web" && canNav && { cursor: "pointer" as any },
            ]}
          >
            <Text style={[gridStyles.value, { color }]}>{Math.round(item.value)}</Text>
            <View style={gridStyles.labelRow}>
              <Text style={[gridStyles.label, { color: tc.textMuted }]}>{item.label}</Text>
              {canNav && <Feather name="chevron-right" size={8} color={tc.textMuted} />}
              {help && !canNav && <Feather name="info" size={8} color={tc.textMuted} />}
            </View>
            <View style={[gridStyles.track, { backgroundColor: tc.border }]}>
              <View style={[gridStyles.fill, { width: `${item.value}%` as any, backgroundColor: color }]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  cell: {
    width: "30.5%",
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
    marginBottom: 6,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
});

function BiosphereTrendCallout({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const trend = getBiosphereTrend(state);
  if (!trend) return null;
  const recovering = trend.direction === "recovering";
  const accent = recovering ? tc.statHigh : tc.statLow;
  // Compact breakdown: net/tick plus the single biggest gain and drain so the
  // overview reads at a glance; the full contributor list lives on Wildlands.
  const breakdown = computeBiosphereBreakdown(state);
  const fmtNet = (n: number) => `${n >= 0 ? "+" : ""}${(Math.round(n * 10) / 10).toFixed(1)}`;
  const topGain = breakdown.positives[0];
  const topDrain = breakdown.negatives[0];
  const metaParts = [`Net ${fmtNet(breakdown.netPerTick)}/tick`];
  if (topGain) metaParts.push(`top gain ${topGain.label}`);
  if (topDrain) metaParts.push(`top drain ${topDrain.label}`);
  const severity = breakdown.biosphere < 20 ? "COLLAPSING" : breakdown.biosphere < 40 ? "CRITICAL" : breakdown.biosphere < 65 ? "STRAINED" : "STABLE";
  return (
    <CrisisReportFrame
      title="BIOSPHERE"
      icon={recovering ? "trending-up" : "trending-down"}
      tone={accent}
      statusLabel={trend.label}
      severityLabel={severity}
      headline={`${trend.headline} · ${metaParts[0]}`}
      movement={recovering ? "improving" : "worsening"}
      consequence={recovering
        ? "Recovery lowers plague and ecological-collapse risk, but gains can reverse if pollution and extraction rise."
        : "Continued decline raises plague and ecological-collapse risk; severe events can kill residents and destroy capacity."}
      details={<Text style={[bioTrendStyles.detail, { color: tc.textSecondary }]}>{trend.detail} · {metaParts.slice(1).join(" · ")}</Text>}
      detailsLabel="CURRENT MOVEMENT / CAUSES"
    />
  );
}

const bioTrendStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
    marginTop: -4,
    gap: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  badge: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  headline: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
  },
  detail: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
  },
  meta: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
});

function CrimeTrendCallout({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  // Compact crime breakdown mirroring BiosphereTrendCallout: net/tick plus the
  // biggest suppressor and driver, with the first actionable fixes available
  // directly from the City overview. The full contributor list remains on the
  // Law screen. For crime, LOWER is better: negative net = falling (good) and
  // positive = rising.
  const breakdown = computeCrimeBreakdown(state);
  const net = breakdown.netPerTick;
  const dir = net < -0.05 ? "falling" : net > 0.05 ? "rising" : "holding";
  const accent = dir === "falling" ? tc.statHigh : dir === "rising" ? tc.statLow : tc.warning;
  const label = dir === "falling" ? "FALLING" : dir === "rising" ? "RISING" : "HOLDING";
  const fmtNet = (n: number) => `${n >= 0 ? "+" : ""}${(Math.round(n * 10) / 10).toFixed(1)}`;
  const topGain = breakdown.positives[0];
  const topDrain = breakdown.negatives[0];
  const metaParts = [`Net ${fmtNet(net)}/tick`];
  if (topGain) metaParts.push(`top suppressor ${topGain.label}`);
  if (topDrain) metaParts.push(`top driver ${topDrain.label}`);
  const tips = breakdown.suggestions.slice(0, 4);
  const actionCount = tips.filter((tip) => !!tip.target).length;
  const headline = `Crime ${Math.round(breakdown.crime)} · ${fmtNet(net)} / tick`;

  const severity = breakdown.crime >= 85 ? "COLLAPSING" : breakdown.crime >= 65 ? "CRITICAL" : breakdown.crime >= 35 ? "STRAINED" : "STABLE";
  return (
    <CrisisReportFrame
      title="CRIME"
      icon="shield"
      tone={accent}
      statusLabel={label}
      severityLabel={severity}
      headline={headline}
      movement={dir === "falling" ? "improving" : dir === "rising" ? "worsening" : "holding"}
      consequence={breakdown.crime >= 65
        ? "Violence, extortion, and gang control drain income, fuel unrest, and increase deaths during riots and attacks."
        : "Suppression is holding losses down, but weakened enforcement or rising density can reverse the trend."}
      actionCount={actionCount}
      details={<Text style={[crimeTrendStyles.meta, { color: tc.textSecondary }]}>{metaParts.join(" · ")}</Text>}
      detailsLabel="DRIVERS / SUPPRESSION"
    >
      {tips.length > 0 ? (
        <View style={crimeTrendStyles.actions}>
          {tips.map((tip, index) => {
            if (!tip.target) {
              return (
                <View
                  key={`crime-tip-${index}`}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={tip.text}
                  style={crimeTrendStyles.action}
                >
                  <Text style={[crimeTrendStyles.detail, { color: tc.textSecondary }]}>{tip.text}</Text>
                </View>
              );
            }
            return (
              <Pressable
                key={`crime-tip-${index}`}
                onPress={() => navigateToCrimeSuggestion(tip.target!)}
                style={({ pressed }) => [crimeTrendStyles.action, { borderColor: tc.accent + "55" }, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`${tip.text} Tap to go there.`}
              >
                <Text style={[crimeTrendStyles.detail, { color: tc.accent }]}>{tip.text}</Text>
                <Feather name="chevron-right" size={14} color={tc.accent} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </CrisisReportFrame>
  );
}

const crimeTrendStyles = StyleSheet.create({
  actions: {
    gap: 6,
  },
  action: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
    marginTop: -4,
    gap: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  badge: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  chevron: {
    marginLeft: "auto",
  },
  headline: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
  },
  detail: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
  },
  meta: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
});

const powerBrkStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    flex: 1,
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.6,
  },
  headline: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginBottom: 8,
  },
  eta: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    marginTop: -4,
    marginBottom: 8,
  },
  cols: {
    flexDirection: "row",
    gap: 12,
  },
  col: {
    flex: 1,
  },
  colLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  empty: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 2,
  },
  rowLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    flex: 1,
  },
  rowAmt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  tips: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 4,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 3,
  },
  tipDot: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    lineHeight: 17,
  },
  tipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  tipChevron: {
    marginTop: 2,
  },
});

const resolveWeatherColor = (w: string, c: { danger: string; warning: string; accent: string; info: string; textSecondary: string }): string => {
  const visual = getWeatherVisual(w);
  if (visual.customColor) return visual.customColor;
  switch (visual.colorKey) {
    case "danger": return c.danger;
    case "warning": return c.warning;
    case "accent": return c.accent;
    case "info": return c.info;
    default: return c.textSecondary;
  }
};

function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const { state, setState, offlineReport, dismissOfflineReport, dismissEvent, respondToEvent, respondToEventMulti, togglePolicy, setPolicy, toggleCityPolicy, cheatCredits, setTickInterval, toggleTickPause, endTurn, turnRecap, dismissTurnRecap, activeSlot, performPersonalInteraction } = useGame();
  const { offlineSimDepth, setSetting } = useSettings();
  const { showToast } = useToast();
  const { modal, showModal, hideModal } = useGameModal();

  const handlePopulationAction = useCallback((optionId: string) => {
    const id = optionId as PersonalActionId;
    const def = PERSONAL_ACTIONS[id];
    if (!def) return;
    const effects = formatPersonalActionSubtitle("population", id, {
      target: { kind: "population", id: "population" },
      history: state.personalActionHistory,
      totalTicks: state.totalTicks,
    });
    const terms = [
      def.cost > 0 ? `Cost: ${def.cost.toLocaleString()} credits` : "Cost: none",
      `Cooldown: ${def.cooldownTicks} ticks`,
      `Command fatigue: repeats within ${PERSONAL_ACTION_DECAY_WINDOW_TICKS} ticks lose effectiveness`,
    ].join("\n");
    const backlash = isCoerciveActionId(id)
      ? "\n\nWider consequence: coercive backlash will reduce public happiness and diplomatic reputation, raise unrest, and shift faction loyalty and threat."
      : "";
    showModal(
      `${def.label}: THE POPULATION`,
      `${def.description}\n\nDirect effects: ${effects}\n\n${terms}${backlash}`,
      [
        { text: "ABORT", style: "cancel" },
        {
          text: def.label,
          style: def.variant === "danger" ? "destructive" : undefined,
          onPress: () => {
            performPersonalInteraction({ kind: "population", id: "population" }, id);
            showToast(
              isCoerciveActionId(id)
                ? "Coercive order enacted — backlash report added to the inbox"
                : `${def.label} enacted`,
              isCoerciveActionId(id) ? "danger" : "success",
            );
          },
        },
      ],
    );
  }, [performPersonalInteraction, showModal, showToast, state.personalActionHistory, state.totalTicks]);

  const handleCohortAction = useCallback((cohortId: CohortStewardshipTargetId, optionId: string) => {
    const id = optionId as PersonalActionId;
    const def = PERSONAL_ACTIONS[id];
    if (!def) return;
    const target = { kind: "cohort" as const, id: cohortId };
    const effects = formatPersonalActionSubtitle("cohort", id, {
      target,
      history: state.personalActionHistory,
      totalTicks: state.totalTicks,
    });
    const terms = [
      def.cost > 0 ? `Cost: ${def.cost.toLocaleString()} credits` : "Cost: none",
      `Cooldown: ${def.cooldownTicks} ticks`,
      `Command fatigue: repeats within ${PERSONAL_ACTION_DECAY_WINDOW_TICKS} ticks lose effectiveness`,
    ].join("\n");
    const backlash = isCoerciveActionId(id)
      ? "\n\nWider consequence: coercive backlash will reduce public happiness and diplomatic reputation, raise unrest, and shift faction loyalty and threat."
      : "";
    const cohortLabel = cohortId.toUpperCase();
    showModal(
      `${def.label}: ${cohortLabel}`,
      `${def.description}\n\nDirect effects: ${effects}\n\n${terms}${backlash}`,
      [
        { text: "ABORT", style: "cancel" },
        {
          text: def.label,
          style: def.variant === "danger" ? "destructive" : undefined,
          onPress: () => {
            const executed = performPersonalInteraction(target, id);
            if (!executed) {
              showToast("Order no longer available", "warning");
              return;
            }
            showToast(
              isCoerciveActionId(id)
                ? "Coercive order enacted — backlash report added to the inbox"
                : `${def.label} enacted`,
              isCoerciveActionId(id) ? "danger" : "success",
            );
          },
        },
      ],
    );
  }, [performPersonalInteraction, showModal, showToast, state, state.personalActionHistory, state.totalTicks]);

  // ── Pack: one-tap auto-tune of OFFLINE SIM DEPTH (#154) ──
  // Invoked from TickReportModal when the resume-overshoot ring buffer has
  // escalated to the "severe" tier. Drops the depth one notch
  // (deep→standard→lite) and clears BOTH recent-resume ring buffers so the
  // new, lighter depth gets a fresh window to prove itself rather than
  // inheriting the old depth's slow-resume history. A toast confirms the
  // change. No-op at the "lite" floor (the modal already hides the button
  // there), so this is safe to call defensively.
  const autoTuneOfflineSimDepth = useCallback(() => {
    const next =
      offlineSimDepth === "deep"
        ? "standard"
        : offlineSimDepth === "standard"
        ? "lite"
        : null;
    if (!next) return;
    setSetting("offlineSimDepth", next);
    setState((prev) => ({
      ...prev,
      recentResumeOvershoots: [],
      recentResumeSamples: [],
    }));
    const nextLabel = next.charAt(0).toUpperCase() + next.slice(1);
    showToast(`Offline sim depth lowered to ${nextLabel}`, "success");
  }, [offlineSimDepth, setSetting, setState, showToast]);

  // Copy the full catch-up subsystem-error report to the clipboard for a bug
  // report. Unlike the on-screen banner — which is intentionally capped — the
  // exported text includes the suppressed-error count and a capped sample of
  // those suppressed messages, since they're often the most useful diagnostic
  // signal. Reused by both the live offline modal and the reopened snapshot.
  const copyOfflineReport = useCallback(
    async (report: NonNullable<typeof offlineReport>) => {
      try {
        const text = buildTickErrorReport({
          tick: report.simulatedTicks,
          errors: report.subsystemErrors,
          cityName: state.cityName ?? "MEGACITY",
          totalTicks: state.totalTicks ?? 0,
          saveSlot: activeSlot,
          suppressedErrors: report.suppressedErrors,
          suppressedCount: report.suppressedErrorCount,
        });
        await Clipboard.setStringAsync(text);
        showToast("Error report copied to clipboard", "success");
      } catch (e) {
        console.warn("Copy offline error report failed:", e);
        showToast("Copy failed", "danger");
      }
    },
    [state.cityName, state.totalTicks, activeSlot, showToast],
  );
  const [showTickLog, setShowTickLog] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [overviewTab, setOverviewTab] = useState<OverviewTab>("city");
  const { section: sectionParam } = useLocalSearchParams<{ section?: string | string[] }>();
  const requestedCitySection = parseOverviewSectionTarget(sectionParam);
  const [citySection, setCitySection] = useState<CitySection>(
    () => requestedCitySection ? CITY_SECTION_FOR_TARGET[requestedCitySection] : "Status",
  );
  useEffect(() => {
    if (!requestedCitySection) return;
    const nextSection = CITY_SECTION_FOR_TARGET[requestedCitySection];
    setCitySection(current => current === nextSection ? current : nextSection);
  }, [requestedCitySection]);
  const [pendingScrollTo, setPendingScrollTo] = useState<string | null>(null);
  // Active Incidents drop-down (Task #560): with 15+ events the list buries
  // the City Status Matrix below it. Collapsed state lives in component state
  // (starts expanded, holds across ticks while the screen stays mounted).
  const [incidentsCollapsed, setIncidentsCollapsed] = useState(false);
  const [popEditVisible, setPopEditVisible] = useState(false);
  const [popEditValue, setPopEditValue] = useState("");
  // Inline echo of the TickReportModal's "RESUMED N DAYS IN 2.1s" pill.
  // We snapshot the full catch-up report when an offlineReport first arrives
  // and keep the pill on the overview for a short window so players see
  // the lived offline cost even after dismissing the modal. Tapping the pill
  // reopens the same TickReportModal from the snapshot, giving players who
  // dismissed the modal too fast a second chance to read the Sector Report.
  const [catchupPill, setCatchupPill] = useState<typeof offlineReport>(null);
  const [reopenedReport, setReopenedReport] = useState<typeof offlineReport>(null);
  const catchupPillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeenReportRef = useRef<unknown>(null);
  // #152: count of in-flight interactions (hover + press) on the pill.
  // While > 0 the auto-hide timer stays paused so the player has as
  // long as they need to read it; when it returns to 0 the pill
  // restarts a fresh window so it still goes away on its own once
  // they look elsewhere. Tracked as a ref (not state) since touch /
  // hover bursts can fire many times per frame and we don't want to
  // re-render or restart the timer for every event.
  const pillInteractionDepthRef = useRef(0);
  // Mirrors the open-modal state for use inside imperative pause/resume
  // callbacks without re-binding them on every render. We never want to
  // restart the auto-hide while the reopened Sector Report modal is up
  // — its onDismiss handler does that explicitly.
  const reopenedReportRef = useRef<typeof offlineReport>(null);
  // Mirror of catchupPill so resume callbacks can early-return when the
  // pill has already been dismissed without re-binding on every render.
  const catchupPillRef = useRef<typeof offlineReport>(null);

  // Tap-to-breakdown entry points (#516): stat cells and the transit utility
  // readout jump to their breakdown card further down this same scroll view.
  // Card y-positions are captured onLayout (relative to the scroll content,
  // since each registered wrapper is a direct child of the content container).
  const overviewScrollRef = useRef<ScrollView>(null);
  const breakdownCardYRef = useRef<Record<string, number>>({});
  const selectCitySection = useCallback((section: CitySection) => {
    setPendingScrollTo(null);
    setCitySection(section);
    overviewScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const scrollToBreakdownCard = useCallback((key: string) => {
    const section = SECTION_FOR_SCROLL_KEY[key];
    if (!section) return;
    if (citySection !== section) {
      setPendingScrollTo(key);
      setCitySection(section);
      return;
    }
    const y = breakdownCardYRef.current[key];
    if (y != null) {
      overviewScrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }
  }, [citySection]);

  // 8s auto-hide window — reused for the initial show AND when restarting
  // the timer after the player closes the reopened modal. A schedule()
  // helper centralizes the clear+restart so the pill only ever has one
  // pending hide timer at a time.
  const PILL_AUTOHIDE_MS = 8000;
  const clearPillTimer = () => {
    if (catchupPillTimerRef.current) {
      clearTimeout(catchupPillTimerRef.current);
      catchupPillTimerRef.current = null;
    }
  };
  const schedulePillAutoHide = () => {
    clearPillTimer();
    catchupPillTimerRef.current = setTimeout(() => {
      setCatchupPill(null);
      catchupPillTimerRef.current = null;
    }, PILL_AUTOHIDE_MS);
  };
  // Pause the auto-hide while the player is interacting (hovering on
  // web, pressing on mobile). Increments the interaction depth so
  // overlapping events (hover + press, or nested X-button press) don't
  // resume the timer prematurely.
  const pausePillAutoHide = () => {
    pillInteractionDepthRef.current += 1;
    clearPillTimer();
  };
  // Mirror of pausePillAutoHide. Restarts a fresh full window once all
  // interactions have ended, but only when the pill is still showing
  // and the reopened modal isn't up — both cases where a new timer
  // would be wrong.
  const resumePillAutoHide = () => {
    pillInteractionDepthRef.current = Math.max(0, pillInteractionDepthRef.current - 1);
    if (pillInteractionDepthRef.current > 0) return;
    if (reopenedReportRef.current) return;
    if (!catchupPillRef.current) return;
    schedulePillAutoHide();
  };

  useEffect(() => {
    if (!offlineReport) return;
    if (lastSeenReportRef.current === offlineReport) return;
    lastSeenReportRef.current = offlineReport;
    if (!shouldShowCatchupPill(offlineReport.catchupWallMs, offlineReport.ticksProcessed)) {
      return;
    }
    setCatchupPill(offlineReport);
    schedulePillAutoHide();
  }, [offlineReport]);

  // Keep the imperative refs in sync with state so the pause/resume
  // callbacks (which close over the first render) read fresh values
  // without needing to re-bind on every render.
  useEffect(() => { catchupPillRef.current = catchupPill; }, [catchupPill]);
  useEffect(() => { reopenedReportRef.current = reopenedReport; }, [reopenedReport]);

  useEffect(() => () => {
    clearPillTimer();
  }, []);

  // The game shell already owns the web top chrome (top navigation + live
  // ticker), so adding the global 67px web inset here leaves a dead band
  // directly beneath the live feed. Native screens still need their device
  // safe-area inset.
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const throttledResources = useThrottledValue(state.resources, 250);
  const throttledRates = useThrottledValue(state.rates, 250);
  const { colors: themeColors } = useTheme();
  const styles = useStyles();
  const pStyles = usePStyles();
  const { cityStats: cs, cityName, playerTitle, totalTicks, gameDate, messages, policies: p } = state;
  // ── Pack A — derived once per state. getPlayerFaction returns a
  // complete record (preset-derived for legacy saves), so the HUD
  // banner stripe always renders.
  const playerFactionIdentity = getPlayerFaction(state);
  const r = throttledResources;
  const rates = throttledRates;
  // Task #473: net income comes from the shared engine breakdown (income
  // minus every recurring upkeep) instead of a gross income sum.
  const bd = useMemo(() => computeEconomyBreakdown(state), [state]);
  // Keep the overview bar and the full diagnostic card on one authoritative
  // value/trend, including the hard 100-point cap behavior.
  const infrastructureBreakdown = useMemo(() => computeInfrastructureBreakdown(state), [state]);
  const activePolicies = state.activePolicies ?? [];

  const bbActive = isBigBrotherActive(state.addons);
  const sdActive = isSixthDayActive(state.addons);
  const policiesByCategory = useMemo(() => {
    let policies = [...CITY_POLICIES];
    if (bbActive) {
      const bbOnly = ALL_POLICIES.filter((p) => !CITY_POLICIES.some((c) => c.id === p.id) && !p.id.startsWith("sd_"));
      policies = [...policies, ...bbOnly];
    }
    if (sdActive) {
      const sdOnly = ALL_POLICIES.filter((p) => p.id.startsWith("sd_"));
      policies = [...policies, ...sdOnly];
    }
    const grouped: Record<string, typeof CITY_POLICIES> = {};
    for (const pol of policies) {
      if (!grouped[pol.category]) grouped[pol.category] = [];
      grouped[pol.category].push(pol);
    }
    return grouped;
  }, [bbActive, sdActive]);

  const totalPolicyCost = useMemo(() => {
    return activePolicies.reduce((sum, id) => {
      const pd = POLICY_MAP[id];
      return sum + (pd?.costPerTick ?? 0);
    }, 0);
  }, [activePolicies]);
  const unreadCount = useMemo(() => (messages ?? []).filter((m) => !m.read).length, [messages]);
  const warnings = useMemo(() => generateOverviewWarnings(state), [state]);

  const powerNet = rates.powerGeneration - Math.floor(rates.powerDrain);
  const powerStatus = powerNet >= 0 ? "SURPLUS" : "DEFICIT";
  const powerColor = powerNet >= 0 ? themeColors.accent : themeColors.danger;

  // Power grid breakdown — turns a struggling grid into a legible supply/demand
  // readout with tappable recovery tips that deep-link to the energy category
  // (or a power megaproject). Mirrors renderCrimeBreakdownCard on the Law screen.
  const renderPowerBreakdownCard = () => {
    const bd = computePowerBreakdown(state, rates.powerGeneration);
    const net = bd.netPerTick; // + = surplus (good), - = deficit (bad)
    const dir = net > 0.05 ? "surplus" : net < -0.05 ? "deficit" : "balanced";
    const tone = dir === "surplus" ? themeColors.statHigh : dir === "deficit" ? themeColors.danger : themeColors.warning;
    const chipLabel = dir === "surplus" ? "SURPLUS" : dir === "deficit" ? "DEFICIT" : "BALANCED";
    const fmtNet = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n)}`;
    const gains = bd.positives.slice(0, 4);
    const draws = bd.negatives.slice(0, 4);
    const tips = bd.suggestions.slice(0, 3);
    const eta = computePowerEta(bd, bd.power);
    const etaText = eta
      ? eta.kind === "brownout"
        ? `Brownout in ~${eta.ticks} tick${eta.ticks === 1 ? "" : "s"} at this pace`
        : `Grid goes fully dark (${eta.target}) in ~${eta.ticks} tick${eta.ticks === 1 ? "" : "s"} at this pace`
      : null;
    const severity = eta?.kind === "blackout" || bd.power <= -200
      ? "COLLAPSING"
      : dir === "deficit" ? "CRITICAL" : dir === "balanced" ? "STRAINED" : "STABLE";
    return (
      <CrisisReportFrame
        title="POWER GRID BREAKDOWN"
        icon="zap"
        tone={tone}
        statusLabel={chipLabel}
        severityLabel={severity}
        headline={`${fmtNet(net)} MW / tick · ${bd.generation} generated − ${bd.effectiveDrain} drawn${etaText ? ` · ${etaText}` : ""}`}
        consequence={dir === "deficit"
          ? "A sustained deficit triggers brownouts, then blackout conditions that cripple clinics, water systems, industry, and defenses."
          : "Reserve power keeps life-support utilities and emergency systems online when attacks or disasters hit the grid."}
        actionCount={tips.length}
        detailsLabel="GENERATION / ACTIVE DRAW"
        details={<View style={powerBrkStyles.cols}>
          <View style={powerBrkStyles.col}>
            <Text style={[powerBrkStyles.colLabel, { color: themeColors.statHigh }]}>SUPPLYING</Text>
            {gains.length === 0 ? (
              <Text style={[powerBrkStyles.empty, { color: themeColors.textMuted }]}>None yet</Text>
            ) : (
              gains.map((c) => (
                <View key={`s-${c.label}`} style={powerBrkStyles.row}>
                  <Text style={[powerBrkStyles.rowLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[powerBrkStyles.rowAmt, { color: themeColors.statHigh }]}>{`+${Math.round(c.amount)}`}</Text>
                </View>
              ))
            )}
          </View>
          <View style={powerBrkStyles.col}>
            <Text style={[powerBrkStyles.colLabel, { color: themeColors.danger }]}>DRAWING</Text>
            {draws.length === 0 ? (
              <Text style={[powerBrkStyles.empty, { color: themeColors.textMuted }]}>None</Text>
            ) : (
              draws.map((c) => (
                <View key={`d-${c.label}`} style={powerBrkStyles.row}>
                  <Text style={[powerBrkStyles.rowLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[powerBrkStyles.rowAmt, { color: themeColors.danger }]}>{`-${Math.round(c.amount)}`}</Text>
                </View>
              ))
            )}
          </View>
        </View>}
      >
        {tips.length > 0 ? (
          <View style={powerBrkStyles.tips}>
            {tips.map((t, i) => {
              const tappable = !!t.target;
              const rowContent = (
                <>
                  <Text style={[powerBrkStyles.tipDot, { color: themeColors.textMuted }, tappable && { color: themeColors.accent }]}>›</Text>
                  <Text style={[powerBrkStyles.tipText, { color: themeColors.textSecondary }, tappable && { color: themeColors.accent }]}>
                    {t.text}
                  </Text>
                  {tappable && (
                    <Feather name="chevron-right" size={13} color={themeColors.accent} style={powerBrkStyles.tipChevron} />
                  )}
                </>
              );
              if (!tappable) {
                return (
                  <View key={`t-${i}`} style={powerBrkStyles.tipRow}>
                    {rowContent}
                  </View>
                );
              }
              return (
                <Pressable
                  key={`t-${i}`}
                  onPress={() => navigateToPowerSuggestion(t.target!)}
                  style={({ pressed }) => [powerBrkStyles.tipRow, pressed && { opacity: 0.6 }, Platform.OS === "web" && { cursor: "pointer" as any }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.text} Tap to go there.`}
                >
                  {rowContent}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </CrisisReportFrame>
    );
  };

  // Water supply breakdown — turns a dropping water stockpile into a legible
  // supply/demand readout with tappable recovery tips that deep-link to the
  // water construction category (or the Subterranean Reservoir megaproject).
  // Mirrors renderPowerBreakdownCard.
  const renderWaterBreakdownCard = () => {
    const bd = computeWaterBreakdown(state, rates.waterProduction);
    const net = bd.netPerTick; // + = surplus (good), - = shortage (bad)
    const dir = net > 0.05 ? "surplus" : net < -0.05 ? "shortage" : "balanced";
    const tone = dir === "surplus" ? themeColors.statHigh : dir === "shortage" ? themeColors.danger : themeColors.warning;
    const chipLabel = dir === "surplus" ? "SURPLUS" : dir === "shortage" ? "SHORTAGE" : "BALANCED";
    const fmtNet = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n)}`;
    const gains = bd.positives.slice(0, 4);
    const draws = bd.negatives.slice(0, 4);
    const tips = bd.suggestions.slice(0, 3);
    const severity = bd.water <= 0
      ? "COLLAPSING"
      : dir === "shortage" ? "CRITICAL" : dir === "balanced" ? "STRAINED" : "STABLE";
    return (
      <CrisisReportFrame
        title="WATER SUPPLY BREAKDOWN"
        icon="droplet"
        tone={tone}
        statusLabel={chipLabel}
        severityLabel={severity}
        headline={`${fmtNet(net)} / tick · ${bd.production} produced − ${bd.consumption} used`}
        consequence={dir === "shortage"
          ? "A sustained shortage degrades health and sanitation; total depletion leaves residents exposed to lethal disease and unrest."
          : "A water reserve protects sanitation, clinics, firefighting, and survival during siege or contamination events."}
        actionCount={tips.length}
        detailsLabel="PRODUCTION / CONSUMPTION"
        details={<View style={powerBrkStyles.cols}>
          <View style={powerBrkStyles.col}>
            <Text style={[powerBrkStyles.colLabel, { color: themeColors.statHigh }]}>PRODUCING</Text>
            {gains.length === 0 ? (
              <Text style={[powerBrkStyles.empty, { color: themeColors.textMuted }]}>None yet</Text>
            ) : (
              gains.map((c) => (
                <View key={`s-${c.label}`} style={powerBrkStyles.row}>
                  <Text style={[powerBrkStyles.rowLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[powerBrkStyles.rowAmt, { color: themeColors.statHigh }]}>{`+${Math.round(c.amount)}`}</Text>
                </View>
              ))
            )}
          </View>
          <View style={powerBrkStyles.col}>
            <Text style={[powerBrkStyles.colLabel, { color: themeColors.danger }]}>USING</Text>
            {draws.length === 0 ? (
              <Text style={[powerBrkStyles.empty, { color: themeColors.textMuted }]}>None</Text>
            ) : (
              draws.map((c) => (
                <View key={`d-${c.label}`} style={powerBrkStyles.row}>
                  <Text style={[powerBrkStyles.rowLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[powerBrkStyles.rowAmt, { color: themeColors.danger }]}>{`-${Math.round(c.amount)}`}</Text>
                </View>
              ))
            )}
          </View>
        </View>}
      >
        {tips.length > 0 ? (
          <View style={powerBrkStyles.tips}>
            {tips.map((t, i) => {
              const tappable = !!t.target;
              const rowContent = (
                <>
                  <Text style={[powerBrkStyles.tipDot, { color: themeColors.textMuted }, tappable && { color: themeColors.accent }]}>›</Text>
                  <Text style={[powerBrkStyles.tipText, { color: themeColors.textSecondary }, tappable && { color: themeColors.accent }]}>
                    {t.text}
                  </Text>
                  {tappable && (
                    <Feather name="chevron-right" size={13} color={themeColors.accent} style={powerBrkStyles.tipChevron} />
                  )}
                </>
              );
              if (!tappable) {
                return (
                  <View key={`t-${i}`} style={powerBrkStyles.tipRow}>
                    {rowContent}
                  </View>
                );
              }
              return (
                <Pressable
                  key={`t-${i}`}
                  onPress={() => navigateToWaterSuggestion(t.target!)}
                  style={({ pressed }) => [powerBrkStyles.tipRow, pressed && { opacity: 0.6 }, Platform.OS === "web" && { cursor: "pointer" as any }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.text} Tap to go there.`}
                >
                  {rowContent}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </CrisisReportFrame>
    );
  };

  const foodNet = rates.foodProduction - rates.foodConsumption;
  const waterNet = rates.waterProduction - rates.waterConsumption;

  // Threat level
  const threats = [
    cs.crime > 70,
    cs.unrest > 70,
    cs.happiness < 25,
    cs.corruption > 75,
    r.food <= 0,
    r.water <= 0,
    r.power < -200,
  ].filter(Boolean).length;

  const threatColor =
    threats >= 3 ? themeColors.danger : threats >= 1 ? themeColors.warning : themeColors.accent;
  const threatLabel =
    threats >= 3 ? "CRITICAL" : threats >= 1 ? "ELEVATED" : "STABLE";

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: themeColors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.bgSecondary, borderBottomColor: themeColors.border }]}>
        {/* ── Pack A — Faction banner stripe (left edge of HUD). The
            colored bar + glyph reflect the player's customized identity;
            falls back to a derived preset for legacy saves so the
            stripe always renders. */}
        <View style={{ width: 4, backgroundColor: playerFactionIdentity.primaryColor, marginRight: 8, borderRadius: 1 }} />
        <View style={{ width: 36, height: 36, borderRadius: 4, backgroundColor: playerFactionIdentity.secondaryColor, justifyContent: "center", alignItems: "center", marginRight: 10, borderWidth: 1, borderColor: playerFactionIdentity.primaryColor }}>
          <Insignia id={playerFactionIdentity.glyph} size={28} color={playerFactionIdentity.primaryColor} />
        </View>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: themeColors.accent }]}>{cityName}</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.2, color: playerFactionIdentity.primaryColor, marginTop: 1 }} numberOfLines={1}>
            {playerFactionIdentity.name}
          </Text>
          {(state.endState?.status === "ascended-machine" || state.endState?.status === "ascended-bio") && (
            <View style={{ alignSelf: "flex-start", marginTop: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3, borderWidth: 1, borderColor: themeColors.accent, backgroundColor: themeColors.accent + "22" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1, color: themeColors.accent }}>
                {state.endState.status === "ascended-machine" ? "⚙ MACHINE ASCENDED" : "🧬 BIO-PERPETUAL"}
              </Text>
            </View>
          )}
          <Text style={[styles.headerSub, { color: themeColors.textMuted }]}>
            {playerTitle} ·{" "}
            {gameDate ? formatDate(gameDate) : `TICK ${totalTicks}`} ·{" "}
            <Text style={{ color: threatColor }}>STATUS: {threatLabel}</Text>
          </Text>
          <Text
            accessibilityLabel="Active city setting and government"
            style={{ fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.7, color: themeColors.textMuted, marginTop: 2 }}
            numberOfLines={1}
          >
            SETTING: WASTELAND METROPOLIS · GOVERNMENT: SECTOR COMMAND
          </Text>
          {state.season && (
            <Text style={styles.weatherSub}>
              <Text style={{ color: getSeasonColor(state.season), fontFamily: "Inter_600SemiBold" }}>
                {getSeasonIcon(state.season)} {getSeasonLabel(state.season)}
              </Text>
            </Text>
          )}
          {state.weather && (
            <Text style={styles.weatherSub}>
              <Text style={{ color: resolveWeatherColor(state.weather, themeColors) }}>
                {getWeatherVisual(state.weather).icon} {state.weather.toUpperCase()}
              </Text>
              {(() => {
                const w = state.weather;
                let rads = 0;
                const jitter = ((state.totalTicks * 7919 + 31) % 100) / 100;
                if (w.includes("Radiation")) rads = 85 + Math.floor(jitter * 40);
                else if (w.includes("Acid")) rads = 35 + Math.floor(jitter * 25);
                else if (w.includes("Toxic")) rads = 45 + Math.floor(jitter * 30);
                else if (w.includes("Electromagnetic")) rads = 20 + Math.floor(jitter * 15);
                else if (w.includes("Dust")) rads = 8 + Math.floor(jitter * 10);
                else if (w.includes("Smog")) rads = 5 + Math.floor(jitter * 8);
                if (rads <= 0) return null;
                const radColor = rads >= 60 ? themeColors.danger : rads >= 25 ? themeColors.warning : themeColors.textSecondary;
                return (
                  <Text style={{ color: radColor, fontFamily: "Inter_600SemiBold" }}>
                    {"  ☢ "}{rads}{" mSv"}
                  </Text>
                );
              })()}
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push("/(game)/inbox")} style={styles.iconBtn}>
            <Feather name="mail" size={18} color={unreadCount > 0 ? themeColors.accent : themeColors.textSecondary} />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: themeColors.danger }]}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => setShowTickLog(true)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Open tick log">
            <Feather name="file-text" size={18} color={themeColors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => router.push("/(game)/more")} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Open more menu">
            <Feather name="menu" size={18} color={themeColors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Population + treasury banner */}
      <View style={[styles.banner, { backgroundColor: themeColors.bgSecondary, borderBottomColor: themeColors.borderBright }]}>
        <Pressable onLongPress={() => { setPopEditValue(cs.population.toString()); setPopEditVisible(true); }}>
          <BannerStat
            label="POPULATION"
            value={formatPop(cs.population)}
            sub={`${cs.populationGrowthRate >= 0 ? "+" : ""}${(cs.populationGrowthRate * 100).toFixed(2)}%/tick`}
            color={themeColors.text}
          />
        </Pressable>
        <View style={[styles.bannerDivider, { backgroundColor: themeColors.border }]} />
        <BannerStat
          label="TREASURY"
          value={formatNumber(r.credits)}
          sub={`${bd.netIncome >= 0 ? "+" : ""}${bd.netIncome.toLocaleString()} cr/tick`}
          color={r.credits < 5000 ? themeColors.danger : themeColors.accent}
        />
        <View style={[styles.bannerDivider, { backgroundColor: themeColors.border }]} />
        <BannerStat
          label="POWER"
          value={`${powerNet >= 0 ? "+" : ""}${powerNet}`}
          sub={`${powerStatus} · ${rates.powerGeneration}MW gen`}
          color={powerColor}
        />
        <View style={[styles.bannerDivider, { backgroundColor: themeColors.border }]} />
        <BannerStat
          label="DEFENSE"
          value={cs.defenseRating.toString()}
          sub={`${cs.defenseRating >= 70 ? "FORTIFIED" : cs.defenseRating >= 40 ? "MODERATE" : "EXPOSED"}`}
          color={cs.defenseRating >= 70 ? themeColors.accent : cs.defenseRating >= 40 ? themeColors.warning : themeColors.danger}
        />
         <View style={[styles.bannerDivider, { backgroundColor: themeColors.border }]} />
         <BannerStat
           label="INFRASTRUCTURE"
           value={formatInfrastructureSummary(infrastructureBreakdown.totalPoints, infrastructureBreakdown.integrityPercent)}
           sub={`${formatInfrastructurePoints(infrastructureBreakdown.intactPoints)} intact`}
           color={infrastructureBreakdown.integrityPercent >= 70 ? themeColors.accent : infrastructureBreakdown.integrityPercent >= 40 ? themeColors.warning : themeColors.danger}
           accessibilityLabel={formatInfrastructureAccessibilityLabel(infrastructureBreakdown.totalPoints, infrastructureBreakdown.integrityPercent)}
         />
      </View>

      {catchupPill && (() => {
        // ── Pack: Resume-time overshoot warning on the home pill (#150) ──
        // When the catch-up blew past its estimate, repaint the pill in
        // warning colors and append "(N×)" if the player has had multiple
        // recent overruns (#151). The escalation count comes from the
        // current state's ring buffer, which `runOfflineCatchup` just
        // updated when this report arrived — so on a first overshoot the
        // count is 1 ("soft"), and it climbs as repeats land.
        const isOvershoot = isResumeOvershoot(catchupPill.catchupWallMs, catchupPill.estimatedWallMs);
        const overshootCount = (state.recentResumeOvershoots ?? []).length;
        const escalation = getOvershootEscalation(isOvershoot ? overshootCount : 0);
        const pillColor = isOvershoot ? themeColors.warning : themeColors.accent;
        const iconName: keyof typeof Feather.glyphMap = isOvershoot ? "alert-triangle" : "clock";
        const repeatTag = isOvershoot && (escalation === "moderate" || escalation === "severe")
          ? ` (${overshootCount}×)`
          : "";
        const a11yPrefix = isOvershoot ? "Slow resume — " : "";
        return (
          <Pressable
            onPress={() => {
              // #152: tapping opens the modal AND cancels the auto-hide so
              // the pill stays anchored while the player reads. We restart
              // a fresh 8s window when they close the reopened modal so
              // the pill doesn't camp forever.
              clearPillTimer();
              // Reset interaction depth so a stray pressOut firing AFTER
              // the modal closes can't double-decrement and skip restart.
              pillInteractionDepthRef.current = 0;
              setReopenedReport(catchupPill);
            }}
            // #152: pause the auto-hide while the player is reading. On
            // web that's hover; on mobile it's a press-in. When the
            // interaction ends we restart a fresh 8s window via the
            // resume helper, but only if the pill is still showing and
            // the reopened modal isn't up.
            onHoverIn={pausePillAutoHide}
            onHoverOut={resumePillAutoHide}
            onPressIn={pausePillAutoHide}
            onPressOut={resumePillAutoHide}
            accessibilityRole="button"
            accessibilityLabel={`${a11yPrefix}Reopen offline summary: resumed ${formatResumedAmount(catchupPill.ticksProcessed)} in ${formatCatchupDuration(catchupPill.catchupWallMs)}`}
            style={({ pressed }) => [
              styles.catchupPill,
              { backgroundColor: pillColor + "14", borderColor: pillColor + "55" },
              pressed && { backgroundColor: pillColor + "26", borderColor: pillColor + "99" },
              Platform.OS === "web" && { cursor: "pointer" as any },
            ]}
          >
            <Feather name={iconName} size={11} color={pillColor} />
            <Text style={[styles.catchupPillText, { color: pillColor }]}>
              RESUMED {formatResumedAmount(catchupPill.ticksProcessed)} IN {formatCatchupDuration(catchupPill.catchupWallMs)}{repeatTag} · {catchupPill.ticksProcessed} TICK{catchupPill.ticksProcessed !== 1 ? "S" : ""} PROCESSED
            </Text>
            <Feather name="chevron-right" size={11} color={pillColor} />
            {/* #152: small explicit dismiss so players who don't want to
                reopen the modal can clear the pill from the HUD without
                waiting for the auto-hide window. Stops propagation by
                handling onPress before the parent Pressable. */}
            <Pressable
              onPress={() => {
                clearPillTimer();
                setCatchupPill(null);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Dismiss resume-time pill"
              style={({ pressed }) => [
                { paddingHorizontal: 4, paddingVertical: 2, marginLeft: 2 },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Feather name="x" size={11} color={pillColor} />
            </Pressable>
          </Pressable>
        );
      })()}

      <View style={[styles.overviewTabBar, { backgroundColor: themeColors.bgSecondary, borderBottomColor: themeColors.border }]}>
        <Pressable onPress={() => setOverviewTab("city")} style={[styles.overviewTabBtn, overviewTab === "city" && { borderBottomColor: themeColors.accent }]}>
          <Feather name="monitor" size={12} color={overviewTab === "city" ? themeColors.accent : themeColors.textMuted} />
          <Text style={[styles.overviewTabText, { color: overviewTab === "city" ? themeColors.accent : themeColors.textMuted }]}>CITY</Text>
        </Pressable>
        <Pressable onPress={() => setOverviewTab("demographics")} style={[styles.overviewTabBtn, overviewTab === "demographics" && { borderBottomColor: themeColors.accent }]}>
          <MaterialCommunityIcons name="account-multiple-outline" size={12} color={overviewTab === "demographics" ? themeColors.accent : themeColors.textMuted} />
          <Text style={[styles.overviewTabText, { color: overviewTab === "demographics" ? themeColors.accent : themeColors.textMuted }]}>DEMOGRAPHICS</Text>
        </Pressable>
      </View>

      {overviewTab === "city" && (
      <View style={{ paddingTop: Platform.OS === "web" ? 6 : 10, paddingBottom: Platform.OS === "web" ? 6 : 10, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
           <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: Platform.OS === "web" ? 12 : 16 }}>
            {CITY_SECTIONS.map(sec => (
              <Pressable
                key={sec}
                onPress={() => selectCitySection(sec)}
                accessibilityRole="tab"
                accessibilityLabel={`${sec} city section`}
                accessibilityState={{ selected: citySection === sec }}
                style={({ pressed }) => ({
                   minHeight: Platform.OS === "web" ? 36 : 40,
                   paddingHorizontal: Platform.OS === "web" ? 10 : 12,
                   paddingVertical: Platform.OS === "web" ? 5 : 6,
                  borderWidth: 1,
                  borderColor: citySection === sec ? themeColors.accent : themeColors.border,
                  borderRadius: 16,
                  backgroundColor: citySection === sec ? themeColors.accent + "1A" : themeColors.bgSecondary,
                  opacity: pressed ? 0.7 : 1,
                  justifyContent: "center",
                })}
              >
                <Text style={{
                  color: citySection === sec ? themeColors.accent : themeColors.textMuted,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 12,
                }}>
                  {sec}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView ref={overviewScrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {overviewTab === "city" && (<>
        {citySection === "Status" && (<>

        <TutorialHint
          id="overview_welcome"
          message="Sector Command interface online. This is the situation room: monitor resources, manage policies, and respond to events from here. Use the bottom bar to navigate between screens."
        />

        <StarterObjectiveMarker
          state={state}
          onDismiss={() => setState((prev) => ({ ...prev, starterObjectivesDismissed: true }))}
        />

        <LabourDayBoosterBanner state={state} />

        {(() => {
          const responseEvents = state.activeEvents.filter(e => e.responseOptions && e.responseOptions.length > 0);
            const criticalEvents = state.activeEvents.filter(e => e.severity === "critical" && !e.resolved);
            const surfacedEvents = responseEvents.length > 0 ? responseEvents : criticalEvents;
            const hasCritical = surfacedEvents.some(e => e.severity === "critical");
            if (surfacedEvents.length === 0) return null;
          return (
            <Pressable
              onPress={() => router.push("/(game)/events")}
                accessibilityRole="button"
                accessibilityLabel={`${surfacedEvents.length} urgent event${surfacedEvents.length === 1 ? "" : "s"} require attention. Open events.`}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: hasCritical ? themeColors.danger : themeColors.warning,
                borderRadius: 6,
                padding: 12,
                marginBottom: 14,
                backgroundColor: (hasCritical ? themeColors.danger : themeColors.warning) + "12",
                opacity: pressed ? 0.7 : 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              })}
            >
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: (hasCritical ? themeColors.danger : themeColors.warning) + "25",
                justifyContent: "center", alignItems: "center",
              }}>
                <Feather name="alert-triangle" size={14} color={hasCritical ? themeColors.danger : themeColors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  color: hasCritical ? themeColors.danger : themeColors.warning,
                  fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1,
                }}>
                  {responseEvents.length > 0
                    ? `${responseEvents.length} EVENT${responseEvents.length > 1 ? "S" : ""} REQUIRE${responseEvents.length === 1 ? "S" : ""} RESPONSE`
                    : `${criticalEvents.length} CRITICAL EVENT${criticalEvents.length > 1 ? "S" : ""} ACTIVE`}
                </Text>
                <Text style={{
                  color: themeColors.textSecondary, fontFamily: "Inter_400Regular",
                  fontSize: 10, marginTop: 2,
                }}>
                  {surfacedEvents.map(e => e.title).slice(0, 2).join(" · ")}{surfacedEvents.length > 2 ? ` +${surfacedEvents.length - 2} more` : ""}
                </Text>
              </View>
              <Text style={{
                color: hasCritical ? themeColors.danger : themeColors.warning,
                fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.8,
              }}>OPEN EVENTS</Text>
              <Feather name="chevron-right" size={16} color={hasCritical ? themeColors.danger : themeColors.warning} />
            </Pressable>
          );
        })()}

        {/* Smart Warnings */}
        {warnings.length > 0 && (
          <>
            <SectionHeader
              title={`Advisories (${warnings.length})`}
              subtitle={warnings.filter(w => w.severity === "critical").length > 0 ? "CRITICAL ISSUES DETECTED" : "Attention recommended"}
              icon={<Feather name="alert-octagon" size={14} color={warnings[0].severity === "critical" ? themeColors.danger : themeColors.warning} />}
            />
            {warnings.map((w) => (
              <PulsingAlert
                key={w.id}
                message={w.label}
                severity={w.severity as "critical" | "warning" | "caution"}
                detail={w.detail}
                actionLabel={w.action?.label}
                onAction={w.action ? () => navigateToOverviewWarning(w.action!.target) : undefined}
              />
            ))}
          </>
        )}

        {/* Active Events — collapsible so a long incident backlog doesn't
            bury the City Status Matrix below it (mirrors the Law tab's
            drop-down edict category headers). */}
        {state.activeEvents.length > 0 && (() => {
          const respondCount = state.activeEvents.filter((e) => e.responseOptions && e.responseOptions.length > 0).length;
          return (
            <>
              <Pressable
                onPress={() => setIncidentsCollapsed((prev) => !prev)}
                accessibilityRole="button"
                accessibilityState={{ expanded: !incidentsCollapsed }}
                accessibilityLabel={`Active incidents, ${state.activeEvents.length} total${respondCount > 0 ? `, ${respondCount} awaiting response` : ""}. ${incidentsCollapsed ? "Expand" : "Collapse"}.`}
                style={Platform.OS === "web" ? ({ cursor: "pointer" } as any) : undefined}
              >
                <SectionHeader
                  title={`Active Incidents (${state.activeEvents.length})`}
                  subtitle={incidentsCollapsed ? "Tap to expand" : "Requires attention"}
                  icon={<Feather name="alert-triangle" size={14} color={themeColors.danger} />}
                  rightContent={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {incidentsCollapsed && respondCount > 0 && (
                        <View style={{ borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, borderColor: themeColors.warning, backgroundColor: themeColors.warning + "18" }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8, color: themeColors.warning }}>
                            {respondCount} NEED{respondCount === 1 ? "S" : ""} RESPONSE
                          </Text>
                        </View>
                      )}
                      <Feather name={incidentsCollapsed ? "chevron-down" : "chevron-up"} size={13} color={themeColors.textMuted} />
                    </View>
                  }
                />
              </Pressable>
              {!incidentsCollapsed && state.activeEvents.map((e) => (
                <EventCard key={e.id} event={e} onDismiss={dismissEvent} onRespond={respondToEvent} onRespondMulti={respondToEventMulti} />
              ))}
            </>
          );
        })()}

        {state.gameplayMode === "turnbased" ? (
          /* Turn-based command: no live clock. The player advances the sim one
             turn (up to a day) with End Turn, which always halts on a crisis. */
          (() => {
            const crisis = hasBlockingCrisis(state);
            const turnNumber = Math.floor((state.totalTicks ?? 0) / TICKS_PER_TURN) + 1;
            return (
              <>
                <SectionHeader
                  title="Turn-Based Command"
                  subtitle={crisis ? "CRISIS — RESPONSE REQUIRED" : `Turn ${turnNumber} · ${gameDate ? formatDate(gameDate) : `TICK ${totalTicks}`}`}
                  icon={<Feather name="skip-forward" size={14} color={crisis ? themeColors.warning : themeColors.accent} />}
                />
                {crisis ? (
                  <Pressable
                    onPress={() => router.push("/(game)/events")}
                    accessibilityRole="button"
                    accessibilityLabel="Resolve crisis to continue"
                    style={({ pressed }) => [
                      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1 },
                      { borderColor: themeColors.warning, backgroundColor: themeColors.warning + "18" },
                      pressed && { opacity: 0.8 },
                      Platform.OS === "web" && { cursor: "pointer" as any },
                    ]}
                  >
                    <Feather name="alert-triangle" size={16} color={themeColors.warning} />
                    <Text style={{ color: themeColors.warning, fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 1 }}>RESOLVE CRISIS TO CONTINUE</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={endTurn}
                    accessibilityRole="button"
                    accessibilityLabel="End turn"
                    style={({ pressed }) => [
                      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1 },
                      { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "18" },
                      pressed && { opacity: 0.8 },
                      Platform.OS === "web" && { cursor: "pointer" as any },
                    ]}
                  >
                    <Feather name="skip-forward" size={16} color={themeColors.accent} />
                    <Text style={{ color: themeColors.accent, fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 1 }}>END TURN</Text>
                  </Pressable>
                )}
                {turnRecap && (
                  <View style={{ marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: themeColors.bgCard, borderColor: turnRecap.interrupted ? themeColors.warning + "60" : themeColors.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ color: themeColors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 }}>
                        {turnRecap.interrupted ? "TURN INTERRUPTED" : "TURN COMPLETE"}
                      </Text>
                      <Pressable onPress={dismissTurnRecap} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss turn summary" style={Platform.OS === "web" ? { cursor: "pointer" as any } : undefined}>
                        <Feather name="x" size={14} color={themeColors.textMuted} />
                      </Pressable>
                    </View>
                    <Text style={{ color: themeColors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4 }}>
                      Advanced {turnRecap.ticksAdvanced} tick{turnRecap.ticksAdvanced === 1 ? "" : "s"} to {formatDate(turnRecap.toDate)}.
                    </Text>
                    <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
                      <Text style={{ color: turnRecap.creditsDelta >= 0 ? themeColors.statHigh : themeColors.danger, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>
                        {turnRecap.creditsDelta >= 0 ? "+" : ""}{turnRecap.creditsDelta.toLocaleString()} credits
                      </Text>
                      <Text style={{ color: turnRecap.popDelta >= 0 ? themeColors.statHigh : themeColors.danger, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>
                        {turnRecap.popDelta >= 0 ? "+" : ""}{turnRecap.popDelta.toLocaleString()} pop
                      </Text>
                    </View>
                    {turnRecap.interrupted && turnRecap.interruptTitle ? (
                      <Text style={{ color: themeColors.warning, fontFamily: "Inter_600SemiBold", fontSize: 11, marginTop: 6 }}>
                        Stopped for: {turnRecap.interruptTitle}
                      </Text>
                    ) : null}
                    {turnRecap.events.length > 0 ? (
                      <Text style={{ color: themeColors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 6 }}>
                        {turnRecap.events.length} event{turnRecap.events.length === 1 ? "" : "s"} this turn — see the Events screen.
                      </Text>
                    ) : null}
                    {turnRecap.tickErrors.length > 0 ? (
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 }}>
                        <Feather name="alert-triangle" size={12} color={themeColors.danger} style={{ marginTop: 1 }} />
                        <Text style={{ color: themeColors.danger, fontFamily: "Inter_600SemiBold", fontSize: 10, flex: 1 }}>
                          {turnRecap.tickErrors.length} subsystem error{turnRecap.tickErrors.length === 1 ? "" : "s"} during this turn: {turnRecap.tickErrors.map((e) => e.subsystem).join(", ")}.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </>
            );
          })()
        ) : (
          <>
            {/* Ticker Speed Controls */}
            <SectionHeader
              title="Simulation Speed"
              subtitle={state.tickPaused ? "PAUSED" : `${state.tickIntervalMinutes ?? 15} real min per tick`}
              icon={<Feather name="clock" size={14} color={state.tickPaused ? themeColors.warning : themeColors.accent} />}
              rightContent={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Explain how simulation time works"
                  accessibilityHint="Opens real-time tick timing examples"
                  hitSlop={8}
                  onPress={() =>
                    showModal(
                      "HOW SIMULATION TIME WORKS",
                      REALTIME_CLOCK_EXPLANATION,
                      [{ text: "GOT IT", style: "default" }],
                    )
                  }
                  style={({ pressed }) => [
                    {
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                      backgroundColor: themeColors.bgCard,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    pressed && { opacity: 0.7, backgroundColor: themeColors.bgElevated },
                    Platform.OS === "web" && { cursor: "pointer" as any },
                  ]}
                >
                  <Feather name="help-circle" size={15} color={themeColors.accent} />
                </Pressable>
              }
            />
            <View style={styles.tickerRow}>
              <Pressable
                onPress={toggleTickPause}
                style={({ pressed }) => [
                  styles.tickerChip,
                  { backgroundColor: themeColors.bgCard, borderColor: themeColors.border },
                  state.tickPaused && { borderColor: themeColors.warning, backgroundColor: themeColors.warning + "14" },
                  pressed && { opacity: 0.7, backgroundColor: themeColors.bgElevated },
                  Platform.OS === "web" && { cursor: "pointer" as any },
                ]}
              >
                <Feather name={state.tickPaused ? "play" : "pause"} size={12} color={state.tickPaused ? themeColors.warning : themeColors.textMuted} />
                {state.tickPaused && <Text style={{ color: themeColors.warning, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5, marginLeft: 4 }}>PAUSED</Text>}
              </Pressable>
              {REALTIME_TICK_INTERVALS.map((m) => {
                const active = !state.tickPaused && (state.tickIntervalMinutes ?? 15) === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setTickInterval(m)}
                    style={({ pressed }) => [
                      styles.tickerChip,
                      { backgroundColor: themeColors.bgCard, borderColor: themeColors.border },
                      active && { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "14" },
                      pressed && { opacity: 0.7, backgroundColor: themeColors.bgElevated },
                      Platform.OS === "web" && { cursor: "pointer" as any },
                    ]}
                  >
                    <Text style={[styles.tickerChipText, { color: active ? themeColors.accent : themeColors.textMuted }]}>
                      {m === 60 ? "1H" : `${m}M`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* City Status Grid */}
        <SectionHeader title="City Status Matrix" subtitle="Core governance indicators — long-press any cell for help" icon={<Feather name="activity" size={14} color={themeColors.accent} />} />
        <StatGrid
          onShowHelp={(label, body) => showModal(label, body, [{ text: "OK", style: "cancel" }])}
          onScrollToCard={scrollToBreakdownCard}
          items={[
            { label: "CRIME", value: cs.crime, invert: true },
            { label: "UNREST", value: cs.unrest, invert: true },
            { label: "HAPPINESS", value: cs.happiness },
            { label: "LAW ORDER", value: cs.lawOrder },
            { label: "CORRUPTION", value: cs.corruption, invert: true },
            { label: "EMPLOYMENT", value: cs.employment },
            { label: "PUBLIC HEALTH", value: cs.publicHealth },
            { label: "BIOSPHERE", value: cs.biosphere },
            { label: "DISEASE RISK", value: cs.diseaseRisk, invert: true },
          ]}
        />

        {/* Public health breakdown — one-tap fixes. Wrapper registers the card's
            scroll position so the PUBLIC HEALTH / DISEASE RISK stat cells can
            jump straight here. */}
        <View onLayout={(e) => { const y = e.nativeEvent.layout.y; breakdownCardYRef.current.health = y; if (pendingScrollTo === "health") { overviewScrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }); setPendingScrollTo(null); } }}>
          <HealthBreakdownCard state={state} />
        </View>

        {/* Crime trend + one-tap fix, mirroring the Law screen breakdown */}
        <CrimeTrendCallout state={state} />

        {/* Biosphere recovery/degradation reassurance (#359) */}
        <BiosphereTrendCallout state={state} />

        {/* Nature Crisis Risk — glanceable mirror of the Wildlands card */}
        {(() => {
          const risk = getBiosphereCrisisRisk(Math.round(cs.biosphere ?? 0));
          const tone =
            risk.tier === "low" ? themeColors.accent : risk.tier === "easing" ? themeColors.warning : themeColors.danger;
          const tierLabel = risk.tier === "low" ? "LOW" : risk.tier === "easing" ? "EASING" : "HIGH";
          const headline =
            risk.reductionPct <= 0
              ? "Nature crises at full frequency"
              : risk.tier === "low"
              ? "Nature crises held low"
              : "Nature crises easing";
          const sub =
            risk.reductionPct <= 0
              ? "Raise the biosphere with green infrastructure to start calming nature crises."
              : `A healthier biosphere means about ${risk.reductionPct}% fewer nature crises than a barren sector.`;
          const fillPct = Math.min(100, Math.round((risk.reductionPct / 50) * 100));
          return (
            <Pressable
              onPress={() => router.push("/(game)/wildlands" as any)}
              accessibilityLabel={`Nature crisis risk ${tierLabel}. ${headline}. Tap for details.`}
              style={({ pressed }) => [
                styles.crisisRiskRow,
                { backgroundColor: themeColors.bgCard, borderColor: themeColors.border },
                pressed && { backgroundColor: themeColors.bgElevated, borderColor: themeColors.borderBright },
                Platform.OS === "web" && { cursor: "pointer" as any },
              ]}
            >
              <Feather name="shield" size={14} color={tone} />
              <View style={styles.crisisRiskBody}>
                <View style={styles.crisisRiskTop}>
                  <Text style={[styles.crisisRiskTitle, { color: tone }]}>NATURE CRISIS RISK</Text>
                  <View style={[styles.crisisRiskChip, { backgroundColor: tone + "22", borderColor: tone + "55" }]}>
                    <Text style={[styles.crisisRiskChipText, { color: tone }]}>{tierLabel}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.crisisRiskDelta, { color: tone }]}>
                    {risk.reductionPct > 0 ? `-${risk.reductionPct}% crises` : "full odds"}
                  </Text>
                </View>
                <View style={[styles.crisisRiskTrack, { backgroundColor: themeColors.border }]}>
                  <View style={[styles.crisisRiskFill, { width: `${fillPct}%` as any, backgroundColor: tone }]} />
                </View>
                <Text style={[styles.crisisRiskSub, { color: themeColors.textMuted }]}>
                  {headline} — {sub}
                </Text>
              </View>
              <Feather name="chevron-right" size={12} color={themeColors.textMuted} />
            </Pressable>
          );
        })()}

        </>)}

        {citySection === "People" && (<>
        {/* Employment breakdown — one-tap fixes. Wrapper registers the card's
            scroll position so the EMPLOYMENT stat cell can switch here and
            jump straight to the workforce diagnosis. */}
        <View onLayout={(e) => { const y = e.nativeEvent.layout.y; breakdownCardYRef.current.employment = y; if (pendingScrollTo === "employment") { overviewScrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }); setPendingScrollTo(null); } }}>
          <EmploymentBreakdownCard state={state} />
        </View>

        {/* City Jobs Allocation */}
        <CityJobsCard state={state} />

        {/* NPC Influence (trait-driven faction + city multipliers) */}
        <NPCInfluenceCard state={state} />

        {/* Notable Figures */}
        <NotableFiguresCard state={state} />

        <PopulationPressureCard state={state} />

        </>)}

        {citySection === "Infrastructure" && (<>
        {/* Infrastructure & Research */}
        <SectionHeader title="Infrastructure & Research" icon={<Feather name="tool" size={14} color={themeColors.accent} />} />
        <StatBar
          label={`Infrastructure Health · ${infrastructureBreakdown.atCap && infrastructureBreakdown.trend === "holding" ? "AT CAP" : infrastructureBreakdown.trend.toUpperCase()}`}
          value={infrastructureBreakdown.infrastructureHealth}
        />
        <StatBar label="Housing Pressure" value={cs.housingPressure} invertColor />
        <StatBar label="Defense Rating" value={cs.defenseRating} />
        {cs.upliftPopulation > 0 && <StatBar label={`Uplift Citizens: ${cs.upliftPopulation.toLocaleString()}`} value={Math.min(cs.upliftPopulation / 1000, 100)} />}
        <StatBar
          label={`Research (${cs.researchProgress}/${cs.researchTarget})`}
          value={cs.researchProgress}
          max={cs.researchTarget}
          showValue={false}
        />

        {(state.districtExpansion?.activeReclamations?.length ?? 0) > 0 || (state.districtExpansion?.totalReclaimed ?? 0) > 0 || (state.districtExpansion?.activeUpgrades?.length ?? 0) > 0 ? (
          <>
            <SectionHeader title="District Expansion" icon={<MaterialCommunityIcons name="map-marker-radius" size={14} color={themeColors.accent} />} />
            <View style={styles.utilRow}>
              <View style={[styles.utilCell, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                <MaterialCommunityIcons name="hammer-wrench" size={14} color={themeColors.accent} />
                <Text style={[styles.utilLabel, { color: themeColors.textMuted }]}>ACTIVE</Text>
                <Text style={[styles.utilStock, { color: themeColors.accent }]}>{state.districtExpansion?.activeReclamations?.length ?? 0}</Text>
              </View>
              <View style={[styles.utilCell, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                <MaterialCommunityIcons name="check-circle" size={14} color={themeColors.accent} />
                <Text style={[styles.utilLabel, { color: themeColors.textMuted }]}>RECLAIMED</Text>
                <Text style={[styles.utilStock, { color: themeColors.accent }]}>{state.districtExpansion?.totalReclaimed ?? 0}</Text>
              </View>
              <View style={[styles.utilCell, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                <MaterialCommunityIcons name="arrow-up-circle" size={14} color={themeColors.accent} />
                <Text style={[styles.utilLabel, { color: themeColors.textMuted }]}>UPGRADING</Text>
                <Text style={[styles.utilStock, { color: themeColors.accent }]}>{state.districtExpansion?.activeUpgrades?.length ?? 0}</Text>
              </View>
            </View>
          </>
        ) : null}

        {/* Utilities */}
        <SectionHeader title="Utility Status" icon={<Feather name="zap" size={14} color={themeColors.accent} />} />

        <View style={styles.utilRow}>
          <UtilCell
            label="FOOD"
            stockpile={r.food}
            net={foodNet}
            icon="package"
            warn={r.food < 100 || foodNet < 0}
            critical={r.food <= 0}
          />
          <UtilCell
            label="WATER"
            stockpile={r.water}
            net={waterNet}
            icon="droplet"
            warn={r.water < 100 || waterNet < 0}
            critical={r.water <= 0}
          />
          <UtilCell
            label="POWER"
            stockpile={r.power}
            net={powerNet}
            icon="zap"
            warn={powerNet < 0}
            critical={r.power < -200}
            unit="MW"
          />
        </View>

        <CommunicationsBreakdownCard state={state} />

        {/* Transit utility readout — tap to jump to the full breakdown card
            below. Load/capacity previously had no glanceable readout at all. */}
        {(() => {
          const tb = computeTransitBreakdown(state);
          const tTone = tb.overloaded ? themeColors.danger : tb.suggestions.length > 0 ? themeColors.warning : themeColors.accent;
          const tLabel = tb.overloaded ? "OVERLOADED" : tb.suggestions.length > 0 ? "TIGHT" : "CLEAR";
          return (
            <Pressable
              onPress={() => scrollToBreakdownCard("transit")}
              accessibilityRole="button"
              accessibilityLabel={`Transit load ${Math.round(tb.transitLoad)} of capacity ${Math.round(tb.transitCapacity)}, ${tLabel.toLowerCase()}. Tap for the full breakdown.`}
              style={({ pressed }) => [
                {
                  flexDirection: "row" as const,
                  alignItems: "center" as const,
                  gap: 10,
                  borderWidth: 1,
                  borderRadius: 4,
                  padding: 12,
                  marginBottom: 16,
                  backgroundColor: themeColors.bgCard,
                  borderColor: themeColors.border,
                },
                pressed && { backgroundColor: themeColors.bgElevated, borderColor: themeColors.borderBright },
                Platform.OS === "web" && ({ cursor: "pointer" } as any),
              ]}
            >
              <Feather name="navigation" size={14} color={tTone} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.8, color: tTone }}>TRANSIT</Text>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, backgroundColor: tTone + "22", borderColor: tTone + "55" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.6, color: tTone }}>{tLabel}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: themeColors.textMuted }}>
                  Load {Math.round(tb.transitLoad)} / capacity {Math.round(tb.transitCapacity)} — tap for the full breakdown
                </Text>
              </View>
              <Feather name="chevron-right" size={12} color={themeColors.textMuted} />
            </Pressable>
          );
        })()}

        {/* Power grid breakdown — one-tap fixes */}
        {renderPowerBreakdownCard()}

        {/* Water supply breakdown — one-tap fixes */}
        {renderWaterBreakdownCard()}

        {/* Transit grid breakdown — the transit system's first visible full
            readout. Wrapper registers the card's scroll position for the
            transit utility readout and stat entry points. */}
        <View onLayout={(e) => { const y = e.nativeEvent.layout.y; breakdownCardYRef.current.transit = y; if (pendingScrollTo === "transit") { overviewScrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }); setPendingScrollTo(null); } }}>
          <TransitBreakdownCard state={state} />
        </View>

        {/* Defense readiness breakdown — one-tap fixes (also on the Military screen) */}
        <DefenseBreakdownCard state={state} />

        {/* Infrastructure health breakdown — one-tap fixes */}
        <InfrastructureBreakdownCard state={state} breakdown={infrastructureBreakdown} />

        {/* Stockpiles */}
        </>)}

        {citySection === "Supply" && (<>
        <EconomyBreakdownCard state={state} />

        <SectionHeader title="Stockpiles & Supply" icon={<Feather name="box" size={14} color={themeColors.accent} />} />
        <ResourceRow
          label="Credits"
          value={r.credits}
          delta={bd.netIncome}
          color={r.credits < 5000 ? themeColors.danger : themeColors.text}
          tooltip="City treasury — funds construction, military, and trade"
        />
        <ResourceRow label="Steel" value={r.steel} unit="tons" delta={rates.steelProduction} tooltip="Raw construction material — used for buildings and infrastructure" />
        <ResourceRow
          label="Goods"
          value={r.goods}
          unit="units"
          delta={rates.goodsProduction - rates.goodsConsumption}
          tooltip="Consumer goods — keeps citizens happy and commerce flowing"
        />
        <ResourceRow label="Fuel" value={r.fuel} unit="barrels" delta={rates.fuelProduction} color={r.fuel < 30 ? themeColors.danger : themeColors.text} tooltip="Powers industry and military operations" />
        <ResourceRow label="Med Supplies" value={r.medSupplies} unit="units" delta={rates.medProduction} tooltip="Medical supplies — critical for population health" />
        <ResourceRow label="Ammo" value={r.ammo} unit="rounds" color={r.ammo < 100 ? themeColors.danger : themeColors.text} tooltip="Military ammunition — consumed during raids and defense" />

        </>)}

        {citySection === "Governance" && (<>
        <SectionHeader title="Legacy Directives" subtitle="Core system policies" icon={<Feather name="sliders" size={14} color={themeColors.accent} />} />
        <PolicyToggle
          label="LABOR DIRECTIVE"
          sub="Conscript citizens to work (+120 tax/tick, -happiness)"
          active={p.laborDirective}
          onToggle={() => togglePolicy("laborDirective")}
        />
        <PolicyToggle
          label="WELFARE RATIONS: GENEROUS"
          sub="Higher costs — +happiness, -unrest, +loyalty"
          active={p.welfareRationing === "generous"}
          onToggle={() =>
            setPolicy("welfareRationing", p.welfareRationing === "generous" ? "normal" : "generous")
          }
        />
        <PolicyToggle
          label="WELFARE RATIONS: CUT"
          sub="Reduces credits drain — +unrest, -happiness"
          active={p.welfareRationing === "cut"}
          onToggle={() =>
            setPolicy("welfareRationing", p.welfareRationing === "cut" ? "normal" : "cut")
          }
          danger
        />
        <PolicyToggle
          label="FOOD RATIONING"
          sub="Reduces consumption but increases suffering"
          active={p.rationsEnabled}
          onToggle={() => togglePolicy("rationsEnabled")}
          danger
        />

        <SectionHeader
          title="City Policies"
          subtitle={`${activePolicies.length} active — ${totalPolicyCost >= 0 ? "-" : "+"}${Math.abs(totalPolicyCost).toLocaleString()} cr/tick`}
          icon={<Feather name="shield" size={14} color={themeColors.accent} />}
        />

        {(Object.keys(POLICY_CATEGORY_LABELS) as PolicyCategory[]).map((catKey) => {
          const catLabel = POLICY_CATEGORY_LABELS[catKey];
          const policies = policiesByCategory[catKey];
          if (!policies) return null;
          const activeCount = policies.filter((pol) => activePolicies.includes(pol.id)).length;
          const isExpanded = expandedCats[catKey] ?? false;

          return (
            <View key={catKey} style={pStyles.catBlock}>
              <Pressable
                style={[pStyles.catHeaderRow, { backgroundColor: themeColors.accent + "0A" }]}
                onPress={() => setExpandedCats((prev) => ({ ...prev, [catKey]: !prev[catKey] }))}
              >
                <View style={pStyles.catHeaderLeft}>
                  <Feather name={isExpanded ? "chevron-down" : "chevron-right"} size={14} color={themeColors.accent} />
                  <Text style={[pStyles.catLabel, { color: themeColors.accent }]}>{catLabel}</Text>
                </View>
                <View style={[pStyles.catBadge, { backgroundColor: themeColors.accentDark + "44" }]}>
                  <Text style={[pStyles.catBadgeText, { color: themeColors.accent }]}>
                    {activeCount}/{policies.length}
                  </Text>
                </View>
              </Pressable>
              {isExpanded && policies.map((pol) => {
                const isActive = activePolicies.includes(pol.id);
                const effectSummary = formatEffects(pol.effects);
                const hasPrereq = pol.prerequisites && pol.prerequisites.length > 0;
                const prereqMet = !hasPrereq || pol.prerequisites!.every((t) => state.unlockedTechnologies.includes(t));
                const costTiming = getPolicyCostTiming(pol, { active: isActive });
                return (
                  <View key={pol.id} style={[pStyles.policyRow, { borderTopColor: themeColors.border + "66" }, !prereqMet && pStyles.policyLocked]}>
                    <View style={pStyles.policyLeft}>
                      <Text style={[pStyles.policyName, { color: themeColors.text }, isActive && { color: themeColors.accent }]}>{pol.name}</Text>
                      <Text style={[pStyles.policyDesc, { color: themeColors.textMuted }]}>{pol.description}</Text>
                      <View style={pStyles.policyMeta}>
                        <Text style={[pStyles.policyEffects, { color: themeColors.textSecondary }]}>{effectSummary}</Text>
                      </View>
                      <Text style={[pStyles.policyStatus, { color: isActive ? themeColors.accent : themeColors.textMuted }]}>
                        {isActive ? "ACTIVE — effects apply each tick" : "INACTIVE — ready to activate"}
                      </Text>
                      <ActionCostTimingReadout model={costTiming} compact />
                      {!prereqMet && (
                        <Text style={[pStyles.prereqText, { color: themeColors.warning }]}>Requires: {pol.prerequisites!.map(id => TECH_MAP[id]?.name ?? id).join(", ")}</Text>
                      )}
                    </View>
                    <Switch
                      value={isActive}
                      onValueChange={() => {
                        if (!prereqMet) return;
                        if (isActive) {
                          toggleCityPolicy(pol.id);
                          return;
                        }
                        const activationTiming = getPolicyCostTiming(pol);
                        showModal(
                          `ACTIVATE ${pol.name}?`,
                          `${pol.description}\n\nEffects: ${effectSummary || "No direct effects"}\n\n${formatActionCostTimingSummary(activationTiming)}`,
                          [
                            { text: "CANCEL", style: "cancel" },
                            {
                              text: "ACTIVATE",
                              onPress: () => toggleCityPolicy(pol.id),
                            },
                          ],
                        );
                      }}
                      disabled={!prereqMet}
                      trackColor={{ false: themeColors.border, true: themeColors.accentDark }}
                      thumbColor={isActive ? themeColors.accent : themeColors.textMuted}
                      accessibilityLabel={`Toggle policy ${pol.name}`}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={{ height: 20 }} />
        </>)}
        </>
        )}

        {overviewTab === "demographics" && (
          <DemographicsTab
            state={state}
            onToggleImmigration={() => setState((prev) => ({ ...prev, immigrationBanned: !prev.immigrationBanned }))}
            onPopulationAction={handlePopulationAction}
            onCohortAction={handleCohortAction}
          />
        )}
      </ScrollView>

      {offlineReport && (
        <Suspense fallback={null}>
          <TickReportModal
            visible
            entries={offlineReport.summaryEntries}
            tickCount={offlineReport.ticksProcessed}
            simulatedTicks={offlineReport.simulatedTicks}
            extrapolatedTicks={offlineReport.extrapolatedTicks}
            offlineSimDepth={offlineReport.offlineSimDepth}
            catchupWallMs={offlineReport.catchupWallMs}
            estimatedWallMs={offlineReport.estimatedWallMs}
            subsystemErrors={offlineReport.subsystemErrors}
            onCopyReport={() => copyOfflineReport(offlineReport)}
            recentOvershootCount={(state.recentResumeOvershoots ?? []).length}
            onAutoTuneDepth={() => {
              autoTuneOfflineSimDepth();
              dismissOfflineReport();
            }}
            onDismiss={() => {
              dismissOfflineReport();
            }}
          />
        </Suspense>
      )}

      {showTickLog && (
        <Suspense fallback={null}>
          <TickReportModal
            visible={showTickLog}
            entries={state.tickLog}
            tickCount={state.totalTicks}
            onDismiss={() => setShowTickLog(false)}
          />
        </Suspense>
      )}

      {/* Reopened offline summary — shown when the player taps the catch-up
          pill after dismissing the original modal. Renders from the cached
          snapshot so the same Sector Report is restored verbatim. Suppressed
          while the live offlineReport modal is mounted to avoid stacking. */}
      {!offlineReport && reopenedReport && (
        <Suspense fallback={null}>
          <TickReportModal
            visible
            entries={reopenedReport.summaryEntries}
            tickCount={reopenedReport.ticksProcessed}
            simulatedTicks={reopenedReport.simulatedTicks}
            extrapolatedTicks={reopenedReport.extrapolatedTicks}
            offlineSimDepth={reopenedReport.offlineSimDepth}
            catchupWallMs={reopenedReport.catchupWallMs}
            estimatedWallMs={reopenedReport.estimatedWallMs}
            subsystemErrors={reopenedReport.subsystemErrors}
            onCopyReport={() => copyOfflineReport(reopenedReport)}
            recentOvershootCount={(state.recentResumeOvershoots ?? []).length}
            onAutoTuneDepth={() => {
              autoTuneOfflineSimDepth();
              setReopenedReport(null);
              if (catchupPill) schedulePillAutoHide();
            }}
            onDismiss={() => {
              setReopenedReport(null);
              // #152: closing the reopened modal restarts a fresh 8s
              // visibility window on the pill so the player can re-tap
              // (or dismiss) from the HUD without it vanishing instantly.
              if (catchupPill) schedulePillAutoHide();
            }}
          />
        </Suspense>
      )}

      <GameModal
        visible={popEditVisible}
        title="SET POPULATION"
        message="Enter the new population count:"
        buttons={[
          {
            text: "CANCEL",
            style: "cancel",
            onPress: () => setPopEditVisible(false),
          },
          {
            text: "CONFIRM",
            style: "default",
            onPress: () => {
              const parsed = parseInt(popEditValue.replace(/[^0-9]/g, ""), 10);
              if (!isNaN(parsed) && parsed >= 100000) {
                setState((prev) => ({
                  ...prev,
                  cityStats: { ...prev.cityStats, population: parsed },
                }));
              }
              setPopEditVisible(false);
            },
          },
        ]}
        onDismiss={() => setPopEditVisible(false)}
      >
        <TextInput
          style={{
            backgroundColor: themeColors.bg,
            borderWidth: 1,
            borderColor: themeColors.accent,
            borderRadius: 4,
            color: themeColors.accent,
            fontFamily: "Inter_700Bold",
            fontSize: 18,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginTop: 8,
            textAlign: "center",
          }}
          value={popEditValue}
          onChangeText={setPopEditValue}
          keyboardType="number-pad"
          autoFocus
          selectTextOnFocus
          placeholderTextColor={themeColors.textMuted}
          placeholder="e.g. 1000000"
          accessibilityLabel="Population value"
        />
        <Text style={{ color: themeColors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 6, textAlign: "center" }}>
          Minimum: 100,000
        </Text>
      </GameModal>

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

const DemoRow = React.memo(function DemoRow({ label, value, color, unit }: { label: string; value: number | string; color?: string; unit?: string }) {
  const { colors: tc } = useTheme();
  const demoStyles = useDemoStyles();
  return (
    <View style={[demoStyles.row, { borderBottomColor: tc.border + "44" }]}>
      <Text style={[demoStyles.label, { color: tc.textSecondary }]}>{label}</Text>
      <Text style={[demoStyles.value, { color: color ?? tc.text }]}>
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit ? <Text style={[demoStyles.unit, { color: tc.textMuted }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
});

const DemoSectionLabel = React.memo(function DemoSectionLabel({ title }: { title: string }) {
  const { colors: tc } = useTheme();
  const demoStyles = useDemoStyles();
  return (
    <View style={[demoStyles.sectionLabel, { borderColor: tc.border, backgroundColor: tc.accent + "0D" }]}>
      <Text style={[demoStyles.sectionLabelText, { color: tc.accent }]}>{title}</Text>
    </View>
  );
});

function DemographicsTab({
  state,
  onToggleImmigration,
  onPopulationAction,
  onCohortAction,
}: {
  state: GameState;
  onToggleImmigration: () => void;
  onPopulationAction: (optionId: string) => void;
  onCohortAction: (cohortId: CohortStewardshipTargetId, optionId: string) => void;
}) {
  const { colors: tc } = useTheme();
  const demoStyles = useDemoStyles();
  const s = state;
  const cs = state.cityStats;
  const dm = state.demographics;
  const b = state.buildings as Record<string, number>;
  const u = state.units as Record<string, number>;
  const pop = cs.population;
  const cohorts = computePopulationCohorts(state);
  const railDiag = getRailNetworkDiagnostics(state);
  const railJobs = (state.railCorridors || []).reduce((acc, r) => {
    acc.robots += r.staffing.robots;
    acc.engineers += r.staffing.engineers;
    acc.railWorkers += r.staffing.railWorkers;
    acc.security += r.staffing.security;
    acc.ticketing += r.staffing.ticketing;
    acc.admin += r.staffing.admin;
    acc.maintenance += r.staffing.maintenance;
    return acc;
  }, { robots: 0, engineers: 0, railWorkers: 0, security: 0, ticketing: 0, admin: 0, maintenance: 0 });
  const workforce = getWorkforceCatalog(state);
  const roleValue = (id: string) => workforce.roles.find((role) => role.id === id)?.value ?? 0;
  const engineeringLedger = getEngineeringLedger(state);
  const engineeringRoleValue = (id: string) => engineeringLedger.roles.find((role) => role.id === id)?.value ?? 0;
  const humanConsequences = state.humanConsequences;

  const employed = workforce.employedCitizens;
  const unemployed = workforce.unemployedCitizens;
  // Use the authoritative shelter shortfall (population beyond total housing
  // capacity) rather than the smoothed housingPressure proportion, which
  // saturated and made "housed" fall even as the city grew and hid the effect
  // of building housing.
  const homeless = cohorts.homeless;
  const housed = pop - homeless;

  const hospitalized = (b.publicHealthMegaClinics ?? 0) * 120;
  const sick = cohorts.sick;
  const deceased = dm.totalDeaths ?? Math.round(state.totalTicks * 3);
  const birthFactor = Math.max(0.02, dm.birthRate / 40);
  const babies = Math.round(pop * birthFactor);
  const retired = cohorts.retirees;
  const tourists = state.tourism?.touristCount ?? 0;
  const vagrants = Math.max(0, Math.round(homeless * 0.3));
  const criminals = Math.round(pop * (cs.crime / 100) * 0.05);
  const educated = Math.round(pop * (cs.education / 100) * 0.7);
  const uneducated = pop - educated;
  const mutants = Math.round(state.districts.reduce((a: number, d: { population: number; mutationRate?: number }) => a + d.population * ((d.mutationRate ?? 0) / 100), 0));

  const enforcers = (u.patrolJudges ?? 0) + (u.seniorJudges ?? 0) + (u.rookieJudgeCadets ?? 0) + (u.streetPatrolUnits ?? 0) + (u.eliteJudgeStrikeTeams ?? 0);
  const military = (u.cityDefenseInfantry ?? 0) + (u.armoredResponseUnits ?? 0) + (u.heavyWeaponsSquads ?? 0) + (u.riotPoliceSquads ?? 0) + (u.heavyRiotMechUnits ?? 0);
  const droids = (u.surveillanceDrones ?? 0) + (u.tacticalCombatDrones ?? 0) + (u.patrolDrones ?? 0) + (u.riotSuppressionDrones ?? 0);
  const spaceNavy = (u.orbitalSecurityMarines ?? 0) + (u.boardingAssaultTeams ?? 0) + (u.vacuumCombatEngineers ?? 0) + (u.escortFlightCrews ?? 0) + (u.platformDefenseGunners ?? 0);

  const robots = (b.roboticsFabricationFacilities ?? 0) * 50;
  const pets = Math.round(pop * 0.08);
  const cyborgs = (b.augmentationClinics ?? 0) * 40 + (b.cyberSurgeryHospitals ?? 0) * 80;

  const foodWorkers = (b.syntheticFoodPlants ?? 0) * 60 + (b.industrialHydroponicFarms ?? 0) * 25 + (b.verticalFarmingTowers ?? 0) * 30;
  const factoryWorkers = (u.factoryWorkerCrews ?? 0) + (u.materialsProcessingTeams ?? 0);
  const miners = (u.miningCrews ?? 0);
  const engineers = (u.aiSystemsEngineers ?? 0) + (u.powerPlantEngineers ?? 0) + (u.urbanDefenseEngineers ?? 0);
  const scientists = (u.researchScientists ?? 0) + (u.cyberneticsResearchers ?? 0) + (u.experimentalPhysicsTeams ?? 0);
  const doctors = (u.emergencyMedicalTeams ?? 0) + (u.fieldHospitalUnits ?? 0);
  const nurses = (u.diseaseContainmentTeams ?? 0) + (u.biohazardResponseUnits ?? 0);
  const teachers = (b.civicEducationInstitutes ?? 0) * 40;
  const merchants = (b.supplyChainDistributionCenters ?? 0) * 20;
  const storeOwners = Math.round(pop * 0.015);
  const taxiDrivers = Math.round(pop * 0.005);
  const sexWorkers = Math.round(pop * (cs.crime / 100) * 0.01);
  const clergy = Math.round(pop * 0.003);
  const officeWorkers = Math.round(employed * 0.25);
  const mechanics = engineeringRoleValue("mechanics");
  const pilots = (u.judgeGunships ?? 0) * 2 + (u.airbornPatrolUnits ?? 0);
  const refugees = cohorts.refugees;
  const prisoners = cohorts.prisoners;
  const incarceration = getIncarcerationSummary(state);

  const populationActionGroups = useMemo<InteractionMenuGroup[]>(() => [{
    key: "population-command",
    label: "POLITICAL CONTROL",
    options: PERSONAL_POPULATION_ACTION_ORDER.map((id) => {
      const def = PERSONAL_ACTIONS[id];
      const target = { kind: "population" as const, id: "population" };
      const eligibility = evaluatePersonalAction(id, Math.floor(state.resources.credits), {
        target,
        cooldowns: state.personalActionCooldowns,
        history: state.personalActionHistory,
        totalTicks: state.totalTicks,
      });
      return {
        id,
        label: def.label,
        subtitle: formatPersonalActionSubtitle("population", id, {
          target,
          history: state.personalActionHistory,
          totalTicks: state.totalTicks,
        }),
        variant: def.variant,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
      };
    }),
  }], [
    state.personalActionCooldowns,
    state.personalActionHistory,
    state.resources.credits,
    state.totalTicks,
  ]);

  const cohortStewardshipBlocks = useMemo(() => {
    return COHORT_STEWARDSHIP_TARGETS.map(cohortId => {
      const actions = getCohortStewardshipActions(cohortId);
      if (actions.length === 0) return null;

      const target = { kind: "cohort" as const, id: cohortId };
      const options = actions.map(id => {
        const def = PERSONAL_ACTIONS[id];
        const eligibility = evaluatePersonalAction(id, Math.floor(state.resources.credits), {
          target,
          cooldowns: state.personalActionCooldowns,
          history: state.personalActionHistory,
          totalTicks: state.totalTicks,
          state,
        });
        return {
          id,
          label: def.label,
          subtitle: formatPersonalActionSubtitle("cohort", id, { target, history: state.personalActionHistory, totalTicks: state.totalTicks }),
          variant: def.variant,
          eligible: eligibility.eligible,
          reason: eligibility.reason,
        };
      });

      return { id: cohortId, options };
    }).filter(Boolean) as {
      id: CohortStewardshipTargetId;
      options: InteractionMenuGroup["options"];
    }[];
  }, [state]);

  const janitors = Math.round(pop * 0.012);
  const cooks = Math.round(pop * 0.008);
  const bartenders = Math.round(pop * 0.004);
  const barbers = Math.round(pop * 0.003);
  const tattooArtists = Math.round(pop * 0.001);
  const streetVendors = Math.round(pop * 0.006);
  const couriers = Math.round(pop * 0.007);
  const warehouseWorkers = Math.round(pop * 0.009);
  const constructionWorkers = engineeringRoleValue("construction_workers");
  const electricians = engineeringRoleValue("electricians");
  const plumbers = engineeringRoleValue("plumbers");
  const welders = engineeringRoleValue("welders");
  const plasterers = Math.round(pop * 0.002);
  const painters = Math.round(pop * 0.003);
  const architects = Math.round(pop * 0.001);
  const lawyers = Math.round(pop * 0.002);
  const judges = Math.round(pop * 0.0005);
  const accountants = Math.round(pop * 0.003);
  const bankers = Math.round(pop * 0.002);
  const insuranceAgents = Math.round(pop * 0.001);
  const realtors = Math.round(pop * 0.001);
  const journalists = Math.round(pop * 0.002);
  const broadcasters = Math.round(pop * 0.001);
  const propagandists = Math.round(pop * (cs.corruption ?? 0) / 100 * 0.02);
  const hackers = Math.round(pop * (cs.crime / 100) * 0.02);
  const netRunners = Math.round(pop * (cs.crime / 100) * 0.008);
  const dataMiners = Math.round(pop * 0.003);
  const sysAdmins = Math.round(pop * 0.004);
  const programmers = Math.round(pop * 0.006);
  const aiTrainers = Math.round(pop * 0.002);
  const droneOperators = (u.surveillanceDrones ?? 0) + (u.patrolDrones ?? 0);
  const cybersurgeons = (b.cyberSurgeryHospitals ?? 0) * 15;
  const pharmacists = Math.round(pop * 0.002);
  const paramedics = (u.emergencyMedicalTeams ?? 0) * 3;
  const therapists = Math.round(pop * 0.002);
  const dentists = Math.round(pop * 0.001);
  const veterinarians = Math.round(pets * 0.01);
  const geneticists = Math.round(pop * 0.0005);
  const chemists = Math.round(pop * 0.001);
  const physicists = (u.experimentalPhysicsTeams ?? 0) * 5;
  const biologists = Math.round(pop * 0.001);
  const geologists = Math.round(pop * 0.0003);
  const meteorologists = Math.round(pop * 0.0002);
  const firefighters = Math.round(pop * 0.003);
  const emts = Math.round(pop * 0.002);
  const socialWorkers = Math.round(pop * 0.003);
  const psychologists = Math.round(pop * 0.001);
  const librarians = Math.round(pop * 0.001);
  const museumCurators = Math.round(pop * 0.0003);
  const athletes = Math.round(pop * 0.002);
  const entertainers = Math.round(pop * 0.004);
  const musicians = Math.round(pop * 0.003);
  const actors = Math.round(pop * 0.001);
  const dancers = Math.round(pop * 0.001);
  const artists = Math.round(pop * 0.002);
  const photographers = Math.round(pop * 0.001);
  const tailors = Math.round(pop * 0.002);
  const cobblers = Math.round(pop * 0.001);
  const butchers = Math.round(pop * 0.002);
  const bakers = Math.round(pop * 0.002);
  const brewers = Math.round(pop * 0.001);
  const distillers = Math.round(pop * 0.0005);
  const smugglers = Math.round(pop * (cs.crime / 100) * 0.015);
  const fences = Math.round(pop * (cs.crime / 100) * 0.005);
  const hitmen = Math.round(pop * (cs.crime / 100) * 0.002);
  const pickpockets = Math.round(pop * (cs.crime / 100) * 0.01);
  const forgers = Math.round(pop * (cs.crime / 100) * 0.003);
  const drugDealers = Math.round(pop * (cs.crime / 100) * 0.012);
  const armsTraders = Math.round(pop * (cs.crime / 100) * 0.004);
  const scrapDealers = Math.round(pop * 0.004);
  const recyclers = engineeringRoleValue("recyclers");
  const sewageWorkers = Math.round(pop * 0.003);
  const waterTechnicians = engineeringRoleValue("water_technicians");
  const powerTechnicians = engineeringRoleValue("power_technicians");
  const truckDrivers = Math.round(pop * 0.006);
  const trainOperators = Math.round(pop * 0.002);
  const dockWorkers = Math.round(pop * 0.004);
  const shipCrew = Math.round(pop * 0.001);
  const spacePortWorkers = Math.round(pop * 0.001);
  const diplomats = Math.round(pop * 0.0003);
  const spies = Math.round(pop * (cs.corruption ?? 0) / 100 * 0.01);
  const bureaucrats = Math.round(pop * 0.008);
  const taxCollectors = Math.round(pop * 0.002);
  const censusWorkers = Math.round(pop * 0.001);
  const mailCarriers = Math.round(pop * 0.003);
  const cleaners = Math.round(pop * 0.01);
  const securityGuards = Math.round(pop * 0.008);
  const bouncers = Math.round(pop * 0.002);
  const privateInvestigators = Math.round(pop * 0.001);
  const bountyHunters = Math.round(pop * (cs.crime / 100) * 0.003);
  const mercenaries = Math.round(pop * (cs.crime / 100) * 0.005);
  const bodyguards = Math.round(pop * 0.002);
  const nannies = Math.round(pop * 0.004);
  const elderCarers = Math.round(pop * 0.005);
  const undertakers = Math.round(pop * 0.001);
  const gamblers = Math.round(pop * (cs.crime / 100) * 0.008);
  const beggars = Math.round(homeless * 0.4);
  const scavengers = Math.round(homeless * 0.25);
  const streetPerformers = Math.round(pop * 0.001);
  const graffArtists = Math.round(pop * (cs.crime / 100) * 0.005);

  const sanitationEngineers = engineeringRoleValue("sanitation_engineers");
  const wasteDisposal = engineeringRoleValue("waste_disposal");
  const vidScreenOps = Math.round(pop * (cs.corruption ?? 0) / 100 * 0.008);
  const cloneTechnicians = (b.cloningFacilities ?? 0) * 12;
  const droidMechanics = Math.round(droids * 0.3) + Math.round(robots * 0.05);
  const upliftHandlers = Math.round((cs.upliftPopulation ?? 0) * 0.02);
  const wastelandScouts = Math.round(pop * 0.001) + (u.wastelandReconTeams ?? 0);
  const rationOfficers = (b.welfareDistributionCenters ?? 0) * 15 + (b.syntheticFoodPlants ?? 0) * 8;
  const buildingInspectors = Math.round(pop * 0.0008);

  // Independent / local economy & previously-overlooked roles
  const indieEmployees = state.localEconomy?.totalEmployees ?? 0;
  const chainEmployees = state.localEconomy?.chainEmployees ?? 0;
  const indieOnlyEmployees = Math.max(0, indieEmployees - chainEmployees);
  const indieBusinessCount = state.localEconomy?.businesses.length ?? 0;
  const corporateChainCount = state.localEconomy?.corporateChains?.length ?? 0;
  const miningSiteWorkers = (state.miningOperations ?? []).reduce((a: number, m: { workers?: number }) => a + (m.workers ?? 0), 0);
  const prisonGuards = Math.round(prisoners / 30);
  const courtClerks = judges * 8;
  const bailiffs = judges * 4;
  const paralegals = lawyers * 2;
  const farmers = (b.industrialHydroponicFarms ?? 0) * 30 + (b.verticalFarmingTowers ?? 0) * 35;
  const customsOfficers = Math.round(pop * 0.0008);
  const translators = Math.round(pop * 0.0006);
  const propertyManagers = Math.round(pop * 0.001);
  const realEstateDevelopers = Math.round(pop * 0.0004);
  const buildingMaintenance = Math.round(pop * 0.004);
  const ushersConcierges = Math.round(pop * 0.002);

  const residents = housed;

  return (
    <>
      <SectionHeader title="City Demographics" subtitle={`${pop.toLocaleString()} total citizens`} icon={<MaterialCommunityIcons name="account-supervisor" size={14} color={tc.accent} />} />

      <View style={[demoStyles.migrationControl, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
        <View style={demoStyles.migrationHeader}>
          <MaterialCommunityIcons name="account-voice" size={16} color={tc.warning} />
          <Text style={[demoStyles.migrationTitle, { color: tc.warning }]}>COMMAND THE POPULATION</Text>
        </View>
        <Text style={[demoStyles.migrationDesc, { color: tc.textMuted, marginBottom: 8 }]}>
          The city is not a spreadsheet. Address, reassure, monitor, or punish its citizens directly. Every command leaves a political scar.
        </Text>
        <InteractionMenu groups={populationActionGroups} onSelect={onPopulationAction} />
      </View>

      <View style={[demoStyles.migrationControl, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
        <View style={demoStyles.migrationHeader}>
          <MaterialCommunityIcons name="gate" size={16} color={state.bordersClosed ? tc.danger : state.immigrationBanned ? tc.warning : tc.accent} />
          <Text style={[demoStyles.migrationTitle, { color: tc.accent }]}>BORDER CONTROL</Text>
        </View>
        <View style={demoStyles.migrationToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[demoStyles.migrationLabel, { color: tc.text }]}>Allow Immigration</Text>
            <Text style={[demoStyles.migrationDesc, { color: tc.textMuted }]}>
              {state.bordersClosed
                ? "BORDERS SEALED — Edict override active"
                : state.immigrationBanned
                  ? "Immigration halted — growth reduced to natural births only"
                  : "New citizens may enter the city"}
            </Text>
          </View>
          <Switch
            value={!state.immigrationBanned && !state.bordersClosed}
            onValueChange={onToggleImmigration}
            disabled={!!state.bordersClosed}
            trackColor={{ false: tc.bgCard, true: tc.accent + "44" }}
            thumbColor={!state.immigrationBanned && !state.bordersClosed ? tc.accent : tc.textMuted}
            accessibilityLabel="Toggle allow immigration"
          />
        </View>
        {state.bordersClosed && (
          <View style={[demoStyles.migrationWarning, { backgroundColor: tc.danger + "15", borderColor: tc.danger + "33" }]}>
            <MaterialCommunityIcons name="alert" size={12} color={tc.danger} />
            <Text style={[demoStyles.migrationWarningText, { color: tc.danger }]}>Seal All Borders edict is active — all migration suspended</Text>
          </View>
        )}
        {(state.borderClosureTicks ?? 0) > 60 && (
          <View style={[demoStyles.migrationWarning, { backgroundColor: tc.warning + "15", borderColor: tc.warning + "33" }]}>
            <MaterialCommunityIcons name="earth-off" size={12} color={tc.warning} />
            <Text style={[demoStyles.migrationWarningText, { color: tc.warning }]}>
              Borders shut for {state.borderClosureTicks} ticks — reputation, happiness, and loyalty are eroding. The damage escalates the longer the gates stay closed.
            </Text>
          </View>
        )}
        {(state.borderClosureTicks ?? 0) > 0 && (state.borderClosureTicks ?? 0) <= 60 && (
          <View style={[demoStyles.migrationWarning, { backgroundColor: tc.info + "12", borderColor: tc.info + "33" }]}>
            <MaterialCommunityIcons name="timer-sand" size={12} color={tc.info} />
            <Text style={[demoStyles.migrationWarningText, { color: tc.info }]}>
              Borders shut for {state.borderClosureTicks} ticks — the world reacts after 60. Diplomatic and social costs begin then.
            </Text>
          </View>
        )}
        {(state.refugeeBoostTicksRemaining ?? 0) > 0 && (
          <View style={[demoStyles.migrationWarning, { backgroundColor: tc.accent + "12", borderColor: tc.accent + "33" }]}>
            <MaterialCommunityIcons name="account-hard-hat" size={12} color={tc.accent} />
            <Text style={[demoStyles.migrationWarningText, { color: tc.accent }]}>
              Refugee workforce active: +{Math.round((state.refugeeBoostMagnitude ?? 0) * 100)}% goods and steel, +{Math.round((state.refugeeBoostMagnitude ?? 0) * 50)}% food for {state.refugeeBoostTicksRemaining} more ticks
            </Text>
          </View>
        )}
      </View>

      <DemoSectionLabel title="COHORT STEWARDSHIP" />
      {cohortStewardshipBlocks.map(block => {
        const count = cohorts[block.id] ?? 0;
        const meta = {
          homeless: { label: "Homeless / Displaced", color: count > 0 ? tc.danger : tc.textMuted },
          refugees: { label: "Refugees", color: count > 0 ? tc.accent : tc.textMuted },
          prisoners: { label: "Prisoners", color: count > 0 ? tc.warning : tc.textMuted },
          sick: { label: "Active Care", color: count > 0 ? tc.danger : tc.textMuted },
          workers: { label: "Active Workforce", color: tc.accent },
          unemployed: { label: "Unemployed", color: count > pop * 0.2 ? tc.danger : tc.warning },
          elites: { label: "Elites", color: tc.info },
        }[block.id];

        return (
          <View key={block.id} style={[demoStyles.migrationControl, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <View style={demoStyles.migrationHeader}>
              <Text
                accessibilityRole="header"
                style={[demoStyles.migrationTitle, { color: meta.color }]}
              >
                {meta.label.toUpperCase()}
              </Text>
              <Text
                accessibilityLabel={`${meta.label} cohort count ${count.toLocaleString()}`}
                style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: meta.color, marginLeft: "auto" }}
              >
                {count.toLocaleString()}
              </Text>
            </View>
            <InteractionMenu groups={[{ key: block.id, label: "ACTIONS", options: block.options }]} onSelect={(optionId) => onCohortAction(block.id, optionId)} />
          </View>
        );
      })}

      <DemoSectionLabel title="POPULATION OVERVIEW" />
      <DemoRow label="Total Citizens" value={pop} color={tc.accent} />
      <DemoRow label="Residents (Housed)" value={residents} color={tc.accent} />
      <DemoRow label="Homeless / Displaced" value={homeless} color={homeless > 0 ? tc.danger : tc.textMuted} />
      <DemoRow label="Tourists" value={tourists} color={tc.info} />
      <DemoRow label="Refugees" value={refugees} />
      <DemoRow label="Refugees Taken In (Lifetime)" value={state.integratedRefugees ?? 0} color={(state.integratedRefugees ?? 0) > 0 ? tc.accent : tc.textMuted} />
      <DemoRow label="Vagrants" value={vagrants} color={tc.warning} />
      <DemoRow label="Immigration Status" value={state.bordersClosed ? "SEALED" : state.immigrationBanned ? "BANNED" : "OPEN"} color={state.bordersClosed ? tc.danger : state.immigrationBanned ? tc.warning : tc.accent} />

      <DemoSectionLabel title="VITAL STATISTICS" />
      <DemoRow label="Birth Rate" value={`${dm.birthRate.toFixed(1)}‰`} color={tc.accent} />
      <DemoRow label="Death Rate" value={`${dm.deathRate.toFixed(1)}‰`} color={dm.deathRate > dm.birthRate ? tc.danger : tc.textMuted} />
      <DemoRow label="Immigration Rate" value={`${dm.immigrationRate.toFixed(1)}‰`} color={s.immigrationBanned ? tc.danger : tc.accent} />
      <DemoRow label="Emigration Rate" value={`${dm.emigrationRate.toFixed(1)}‰`} color={dm.emigrationRate > 1 ? tc.warning : tc.textMuted} />
      <DemoRow label="Avg Life Expectancy" value={`${dm.averageLifeExpectancy} yrs`} color={dm.averageLifeExpectancy < 50 ? tc.danger : tc.accent} />
      <DemoRow label="Population Growth" value={`${(dm.populationGrowthRate * 100).toFixed(2)}%`} color={dm.populationGrowthRate < 0 ? tc.danger : tc.accent} />

      <DemoSectionLabel title="AGE & LIFECYCLE" />
      <DemoRow label="Babies / Infants" value={babies} />
      <DemoRow label="Educated Adults" value={educated} color={tc.accent} />
      <DemoRow label="Uneducated Adults" value={uneducated} />
      <DemoRow label="Orphans" value={dm.orphanPopulation ?? 0} color={tc.warning} />
      <DemoRow label="Retired / Elderly" value={retired} />
      <DemoRow label="Deceased (Lifetime)" value={deceased} color={tc.textMuted} />

      <DemoSectionLabel title="HEALTH STATUS" />
      <DemoRow label="Hospitalized" value={hospitalized} color={tc.warning} />
      <DemoRow label="Currently Sick" value={Math.max(sick, humanConsequences?.civilianSick ?? 0)} color={tc.danger} />
      <DemoRow label="Wounded / Recovering" value={humanConsequences?.civilianWounded ?? 0} color={tc.warning} />
      <DemoRow label="Missing Persons" value={humanConsequences?.civilianMissing ?? 0} color={tc.danger} />
      <DemoRow label="Military Dead (Lifetime)" value={humanConsequences?.totalMilitaryDeaths ?? 0} color={tc.textMuted} />
      <DemoRow label="Doctors" value={roleValue("doctors")} color={tc.info} />
      <DemoRow label="Nurses" value={roleValue("nurses")} color={tc.info} />

      <DemoSectionLabel title="RAIL NETWORK & CORRIDORS" />
      <DemoRow label="Completed Corridors" value={railDiag.completed} color={tc.accent} />
      <DemoRow label="Transit Capacity Bonus" value={railDiag.transitCapacity} color={tc.info} />
      <DemoRow label="Trade Income Bonus" value={railDiag.tradeIncome} color={tc.statHigh} />
      <DemoRow label="Industrial Output Bonus" value={railDiag.industrialOutput} color={tc.statHigh} />
      <DemoRow label="Passenger Capacity" value={railDiag.passengerCapacity} color={tc.info} />
      <DemoRow label="Freight Capacity" value={railDiag.freightCapacity} color={tc.info} />
      <DemoRow label="Troop Transport Capacity" value={railDiag.troopTransportCapacity} color={tc.info} />
      <DemoRow label="Armed Security Benefit" value={`+${railDiag.armedSecurityBenefit}`} color={tc.statHigh} />
      <DemoRow label="Safety Resilience" value={`+${railDiag.safetyResilience}`} color={tc.statHigh} />
      <DemoRow label="Rail Workers" value={railJobs.railWorkers} />
      <DemoRow label="Rail Engineers" value={railJobs.engineers} />
      <DemoRow label="Rail Security" value={railJobs.security} color={tc.warning} />
      <DemoRow label="Rail Ticketing & Admin" value={railJobs.ticketing + railJobs.admin} />
      <DemoRow label="Rail Maintenance" value={railJobs.maintenance} />
      <DemoRow label="Rail Automated Robots" value={railJobs.robots} />
      {railDiag.warnings.length > 0 && (
        <View style={{ marginTop: 8, padding: 8, backgroundColor: tc.danger + "20", borderRadius: 4, borderWidth: 1, borderColor: tc.danger }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: tc.danger, marginBottom: 4 }}>STAFFING SHORTAGES</Text>
          {railDiag.warnings.map(w => (
            <Text key={w} style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: tc.danger }}>• {w}</Text>
          ))}
        </View>
      )}

      {false && (<>
      <DemoSectionLabel title="EMPLOYMENT OVERVIEW" />
      <DemoRow label="Total Workforce" value={dm.totalWorkforce} color={tc.accent} />
      <DemoRow label="Employed (Sector Jobs)" value={employed} color={tc.accent} />
      <DemoRow label="Local Economy Jobs" value={indieEmployees} color={tc.info} />
      <DemoRow label="Mining Site Workers" value={miningSiteWorkers} color={tc.info} />
      <DemoRow label="Combined Jobs Total" value={employed + indieEmployees + miningSiteWorkers} color={tc.accent} />
      <DemoRow label="Unemployed" value={unemployed} color={unemployed > pop * 0.2 ? tc.danger : tc.warning} />


      <DemoSectionLabel title="RAIL NETWORK & CORRIDORS" />
      <DemoRow label="Completed Corridors" value={railDiag.completed} color={tc.accent} />
      <DemoRow label="Transit Capacity Bonus" value={railDiag.transitCapacity} color={tc.info} />
      <DemoRow label="Trade Income Bonus" value={railDiag.tradeIncome} color={tc.statHigh} />
      <DemoRow label="Industrial Output Bonus" value={railDiag.industrialOutput} color={tc.statHigh} />
      <DemoRow label="Troop Transport Capacity" value={railDiag.troopTransportCapacity} color={tc.info} />
      <DemoRow label="Armed Security Benefit" value={`+${railDiag.armedSecurityBenefit}`} color={tc.statHigh} />
      <DemoRow label="Safety Resilience" value={`+${railDiag.safetyResilience}`} color={tc.statHigh} />
      <DemoRow label="Rail Workers" value={railJobs.railWorkers} />
      <DemoRow label="Rail Engineers" value={railJobs.engineers} />
      <DemoRow label="Rail Security" value={railJobs.security} color={tc.warning} />
      <DemoRow label="Rail Ticketing & Admin" value={railJobs.ticketing + railJobs.admin} />
      <DemoRow label="Rail Maintenance" value={railJobs.maintenance} />
      <DemoRow label="Rail Automated Robots" value={railJobs.robots} />
      {railDiag.warnings.length > 0 && (
        <View style={{ marginTop: 8, padding: 8, backgroundColor: tc.danger + "20", borderRadius: 4, borderWidth: 1, borderColor: tc.danger }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: tc.danger, marginBottom: 4 }}>STAFFING SHORTAGES</Text>
          {railDiag.warnings.map(w => (
            <Text key={w} style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: tc.danger }}>• {w}</Text>
          ))}
        </View>
      )}

      <DemoSectionLabel title="WORKFORCE SECTORS" />
      <DemoRow label="Industrial" value={dm.industrialWorkforce} />
      <DemoRow label="Service" value={dm.serviceWorkforce} />
      <DemoRow label="Government" value={dm.governmentWorkforce} />
      <DemoRow label="Research" value={dm.researchWorkforce} color={tc.info} />
      <DemoRow label="Infrastructure" value={dm.infrastructureWorkforce} />
      <DemoRow label="Security" value={dm.securityWorkforce} color={tc.warning} />
      <DemoRow label="Black Market" value={dm.blackMarketWorkforce} color={tc.danger} />

      <DemoSectionLabel title="FOOD & SERVICE" />
      <DemoRow label="Food Workers" value={foodWorkers} />
      <DemoRow label="Cooks / Chefs" value={cooks} />
      <DemoRow label="Bartenders" value={bartenders} />
      <DemoRow label="Butchers" value={butchers} />
      <DemoRow label="Bakers" value={bakers} />
      <DemoRow label="Brewers" value={brewers} />
      <DemoRow label="Distillers" value={distillers} />
      <DemoRow label="Street Vendors" value={streetVendors} />
      <DemoRow label="Store Owners" value={storeOwners} />
      <DemoRow label="Merchants / Traders" value={merchants} />
      <DemoRow label="Barbers / Stylists" value={barbers} />
      <DemoRow label="Tattoo Artists" value={tattooArtists} />
      <DemoRow label="Tailors" value={tailors} />
      <DemoRow label="Cobblers" value={cobblers} />

      <DemoSectionLabel title="INDUSTRY & LABOR" />
      <DemoRow label="Factory Workers" value={factoryWorkers} />
      <DemoRow label="Miners" value={miners} />
      <DemoRow label="Construction Workers" value={constructionWorkers} />
      <DemoRow label="Warehouse Workers" value={warehouseWorkers} />
      <DemoRow label="Welders" value={welders} />
      <DemoRow label="Electricians" value={electricians} />
      <DemoRow label="Plumbers" value={plumbers} />
      <DemoRow label="Plasterers" value={plasterers} />
      <DemoRow label="Painters (Trade)" value={painters} />
      <DemoRow label="Mechanics" value={mechanics} />
      <DemoRow label="Building Inspectors" value={buildingInspectors} />
      <DemoRow label="Scrap Dealers" value={scrapDealers} />
      <DemoRow label="Recyclers" value={recyclers} />
      <DemoRow label="Janitors / Cleaners" value={janitors} />
      <DemoRow label="Cleaners (Industrial)" value={cleaners} />
      <DemoRow label="Sewage Workers" value={sewageWorkers} />
      <DemoRow label="Sanitation Engineers" value={sanitationEngineers} />
      <DemoRow label="Waste Disposal Crews" value={wasteDisposal} />

      <DemoSectionLabel title="TRANSPORT & LOGISTICS" />
      <DemoRow label="Taxi Drivers" value={taxiDrivers} />
      <DemoRow label="Truck Drivers" value={truckDrivers} />
      <DemoRow label="Train Operators" value={trainOperators} />
      <DemoRow label="Pilots" value={pilots} />
      <DemoRow label="Couriers" value={couriers} />
      <DemoRow label="Dock Workers" value={dockWorkers} />
      <DemoRow label="Ship Crew" value={shipCrew} />
      <DemoRow label="Space Port Workers" value={spacePortWorkers} />
      <DemoRow label="Mail Carriers" value={mailCarriers} />

      <DemoSectionLabel title="OFFICE & PROFESSIONAL" />
      <DemoRow label="Office Workers" value={officeWorkers} />
      <DemoRow label="Lawyers" value={lawyers} />
      <DemoRow label="Judges (Civil)" value={judges} />
      <DemoRow label="Accountants" value={accountants} />
      <DemoRow label="Bankers" value={bankers} />
      <DemoRow label="Insurance Agents" value={insuranceAgents} />
      <DemoRow label="Realtors" value={realtors} />
      <DemoRow label="Architects" value={architects} />

      <DemoSectionLabel title="TECHNOLOGY & CYBER" />
      <DemoRow label="Engineers" value={engineers} color={tc.info} />
      <DemoRow label="Scientists" value={scientists} color={tc.info} />
      <DemoRow label="Programmers" value={programmers} color={tc.info} />
      <DemoRow label="Sys Admins" value={sysAdmins} color={tc.info} />
      <DemoRow label="Data Miners" value={dataMiners} color={tc.info} />
      <DemoRow label="AI Trainers" value={aiTrainers} color={tc.info} />
      <DemoRow label="Drone Operators" value={droneOperators} color={tc.info} />
      <DemoRow label="Physicists" value={physicists} />
      <DemoRow label="Chemists" value={chemists} />
      <DemoRow label="Biologists" value={biologists} />
      <DemoRow label="Geneticists" value={geneticists} />
      <DemoRow label="Geologists" value={geologists} />
      <DemoRow label="Meteorologists" value={meteorologists} />

      <DemoSectionLabel title="MEDICAL & HEALTH" />
      <DemoRow label="Doctors" value={doctors} color={tc.info} />
      <DemoRow label="Nurses" value={nurses} color={tc.info} />
      <DemoRow label="Cybersurgeons" value={cybersurgeons} color={tc.info} />
      <DemoRow label="Paramedics" value={paramedics} />
      <DemoRow label="Pharmacists" value={pharmacists} />
      <DemoRow label="Therapists" value={therapists} />
      <DemoRow label="Dentists" value={dentists} />
      <DemoRow label="Psychologists" value={psychologists} />
      <DemoRow label="Veterinarians" value={veterinarians} />
      <DemoRow label="EMTs" value={emts} />

      <DemoSectionLabel title="EDUCATION & CULTURE" />
      <DemoRow label="Teachers" value={teachers} />
      <DemoRow label="Librarians" value={librarians} />
      <DemoRow label="Museum Curators" value={museumCurators} />
      <DemoRow label="Athletes" value={athletes} />
      <DemoRow label="Entertainers" value={entertainers} />
      <DemoRow label="Musicians" value={musicians} />
      <DemoRow label="Actors" value={actors} />
      <DemoRow label="Dancers" value={dancers} />
      <DemoRow label="Artists (Creative)" value={artists} />
      <DemoRow label="Photographers" value={photographers} />
      <DemoRow label="Street Performers" value={streetPerformers} />

      <DemoSectionLabel title="MEDIA & COMMUNICATIONS" />
      <DemoRow label="Journalists" value={journalists} />
      <DemoRow label="Broadcasters" value={broadcasters} />
      <DemoRow label="Propagandists" value={propagandists} color={tc.warning} />
      <DemoRow label="Vid-Screen Operators" value={vidScreenOps} color={tc.warning} />

      <DemoSectionLabel title="GOVERNMENT & CIVIC" />
      <DemoRow label="Bureaucrats" value={bureaucrats} />
      <DemoRow label="Tax Collectors" value={taxCollectors} />
      <DemoRow label="Census Workers" value={censusWorkers} />
      <DemoRow label="Diplomats" value={diplomats} />
      <DemoRow label="Social Workers" value={socialWorkers} />
      <DemoRow label="Firefighters" value={firefighters} />
      <DemoRow label="Ration Officers" value={rationOfficers} />

      <DemoSectionLabel title="UTILITIES & INFRASTRUCTURE" />
      <DemoRow label="Water Technicians" value={waterTechnicians} />
      <DemoRow label="Power Technicians" value={powerTechnicians} />

      <DemoSectionLabel title="SECURITY & PRIVATE" />
      <DemoRow label="Security Guards" value={securityGuards} />
      <DemoRow label="Bouncers" value={bouncers} />
      <DemoRow label="Private Investigators" value={privateInvestigators} />
      <DemoRow label="Bodyguards" value={bodyguards} />
      <DemoRow label="Bounty Hunters" value={bountyHunters} color={tc.warning} />
      <DemoRow label="Mercenaries" value={mercenaries} color={tc.warning} />
      <DemoRow label="Wasteland Scouts" value={wastelandScouts} color={tc.warning} />

      <DemoSectionLabel title="CARE & DOMESTIC" />
      <DemoRow label="Nannies" value={nannies} />
      <DemoRow label="Elder Carers" value={elderCarers} />
      <DemoRow label="Undertakers" value={undertakers} />
      <DemoRow label="Clergy / Religious" value={clergy} />
      <DemoRow label="Sex Workers" value={sexWorkers} color={tc.textMuted} />

      <DemoSectionLabel title="LAW ENFORCEMENT" />
      <DemoRow label="Enforcers (Total)" value={enforcers} color={tc.accent} />
      <DemoRow label="Military Personnel" value={military} color={tc.warning} />
      <DemoRow label="Prison Guards" value={prisonGuards} color={tc.warning} />
      <DemoRow label="Customs / Border Officers" value={customsOfficers} />

      <DemoSectionLabel title="CIVIL COURT SYSTEM" />
      <DemoRow label="Judges (Civil)" value={judges} color={tc.accent} />
      <DemoRow label="Lawyers" value={lawyers} />
      <DemoRow label="Paralegals" value={paralegals} />
      <DemoRow label="Court Clerks" value={courtClerks} />
      <DemoRow label="Bailiffs" value={bailiffs} />
      <DemoRow label="Translators / Interpreters" value={translators} />

      <DemoSectionLabel title="LOCAL ECONOMY" />
      <DemoRow label="Indie Business Jobs" value={indieOnlyEmployees} color={tc.info} />
      <DemoRow label="Corporate Chain Jobs" value={chainEmployees} color={tc.info} />
      <DemoRow label="Total Local Economy Jobs" value={indieEmployees} color={tc.accent} />
      <DemoRow label="Active Indie Businesses" value={indieBusinessCount} />
      <DemoRow label="Active Corporate Chains" value={corporateChainCount} />
      <DemoRow label="Property Managers" value={propertyManagers} />
      <DemoRow label="Real Estate Developers" value={realEstateDevelopers} />
      <DemoRow label="Building Maintenance" value={buildingMaintenance} />
      <DemoRow label="Ushers / Concierges" value={ushersConcierges} />
      </>)}

      <DemoSectionLabel title="JOB RECONCILIATION" />
      <DemoRow label="Employed citizens (sector allocation)" value={workforce.employedCitizens} color={tc.accent} />
      <DemoRow label="Unemployed citizens" value={workforce.unemployedCitizens} color={workforce.unemployedCitizens > pop * 0.2 ? tc.danger : tc.warning} />
      <DemoRow label="Sector total" value={workforce.sectorTotal} />
      <DemoRow label="Direct detailed capacity" value={workforce.directDetailedRoleTotal} />
      <DemoRow label="Unallocated sector capacity" value={workforce.reconciliation.unallocatedSectorJobs} />
      <DemoRow label="Local economy jobs (included above)" value={workforce.localEconomyJobs} color={tc.info} />
      <DemoRow label="Mining operation jobs (included above)" value={workforce.miningJobs} color={tc.info} />
      <Text style={[demoStyles.migrationDesc, { color: tc.textMuted, marginBottom: 8 }]}>
        Sector totals are the durable workforce model. Detailed population roles are estimates; building and unit roles show direct capacity. Local businesses and mining operations are subsets of employed citizens, not extra citizens.
      </Text>
      {workforce.bySector && Object.entries(workforce.bySector).map(([sector, roles]) => (
        <React.Fragment key={sector}>
          <DemoSectionLabel title={sector === "blackMarket" ? "BLACK MARKET" : sector.toUpperCase()} />
          {roles.map((role) => (
            <View key={role.id} style={demoStyles.row}>
              <Text style={[demoStyles.label, { color: tc.text }]}>{role.label}</Text>
              <Text style={[demoStyles.value, { color: role.source === "population" ? tc.textMuted : tc.info }]}>
                {role.value.toLocaleString()} · {role.sourceLabel}
              </Text>
            </View>
          ))}
        </React.Fragment>
      ))}

      {false && (<>
      <DemoSectionLabel title="AGRICULTURE" />
      <DemoRow label="Farmers (Hydroponic / Vertical)" value={farmers} />

      <DemoSectionLabel title="CRIMINAL UNDERWORLD" />
      <DemoRow label="Criminals (Est.)" value={criminals} color={tc.danger} />
      <DemoRow label="Hackers" value={hackers} color={tc.danger} />
      <DemoRow label="Net Runners" value={netRunners} color={tc.danger} />
      <DemoRow label="Smugglers" value={smugglers} color={tc.danger} />
      <DemoRow label="Drug Dealers" value={drugDealers} color={tc.danger} />
      <DemoRow label="Arms Traders" value={armsTraders} color={tc.danger} />
      <DemoRow label="Fences" value={fences} color={tc.danger} />
      <DemoRow label="Hitmen" value={hitmen} color={tc.danger} />
      <DemoRow label="Pickpockets" value={pickpockets} color={tc.danger} />
      <DemoRow label="Forgers" value={forgers} color={tc.danger} />
      <DemoRow label="Gamblers" value={gamblers} color={tc.warning} />
      <DemoRow label="Spies" value={spies} color={tc.warning} />
      <DemoRow label="Graffiti Artists" value={graffArtists} color={tc.textMuted} />
      <DemoRow label="Inmates / Prisoners" value={prisoners} color={tc.warning} />

      <DemoSectionLabel title="MARGINALIZED" />
      <DemoRow label="Beggars" value={beggars} color={tc.textMuted} />
      <DemoRow label="Scavengers" value={scavengers} color={tc.textMuted} />

      <DemoSectionLabel title="NON-HUMAN & AUGMENTED" />
      <DemoRow label="Robots / Droids" value={robots} color={tc.info} />
      <DemoRow label="Combat Droids" value={droids} color={tc.warning} />
      <DemoRow label="Droid Mechanics" value={droidMechanics} color={tc.info} />
      <DemoRow label="Clone Technicians" value={cloneTechnicians} color={tc.info} />
      <DemoRow label="Uplift Handlers" value={upliftHandlers} color={tc.info} />
      <DemoRow label="Pets" value={pets} />
      <DemoRow label="Cyborgs / Augmented" value={cyborgs} color={tc.info} />
      <DemoRow label="Mutants" value={mutants} color={tc.danger} />

      <DemoSectionLabel title="DEFENSE & SPACE" />
      <DemoRow label="Space Navy" value={spaceNavy} color={tc.info} />
      </>)}

      <DemoSectionLabel title="INCARCERATION" />
      <DemoRow label="Total incarcerated" value={incarceration.total} color={tc.warning} />
      <DemoRow label="Civilian detainees" value={incarceration.civilians} />
      <DemoRow label="Prisoners of war" value={incarceration.pows} color={tc.danger} />
      <DemoRow label="Municipal capacity" value={incarceration.municipalCapacity} color={tc.info} />
      <DemoRow label="Required guards" value={incarceration.requiredGuards} />
      {incarceration.powOrigins.length > 0 && <DemoSectionLabel title="POW ORIGINS" />}
      {incarceration.powOrigins.map((origin) => (
        <DemoRow key={origin.key} label={origin.label} value={origin.count} color={origin.kind === "unknown" ? tc.textMuted : tc.danger} />
      ))}

      <DemoSectionLabel title="INCOME CLASSES" />
      <DemoRow label="Low Income" value={dm.lowIncomePopulation} color={tc.danger} />
      <DemoRow label="Middle Income" value={dm.middleIncomePopulation} color={tc.warning} />
      <DemoRow label="High Income" value={dm.highIncomePopulation} color={tc.accent} />
      <DemoRow label="Corporate Citizens" value={dm.corporateCitizens} color={tc.info} />
      <DemoRow label="Independent Traders" value={dm.independentTraders} />
      <DemoRow label="Registered Businesses" value={dm.registeredBusinesses} />
      <DemoRow label="Avg Citizen Income" value={`¢${dm.averageCitizenIncome.toLocaleString()}`} color={tc.accent} />

      <DemoSectionLabel title="ECONOMIC INDICES" />
      <DemoRow label="Consumer Spending" value={`${dm.consumerSpendingIndex}%`} color={dm.consumerSpendingIndex < 40 ? tc.danger : tc.accent} />
      <DemoRow label="Savings Rate" value={`${dm.savingsRate}%`} />
      <DemoRow label="Debt Level" value={`${dm.debtLevel}%`} color={dm.debtLevel > 60 ? tc.danger : tc.textMuted} />

      <DemoSectionLabel title="SOCIAL INDICES" />
      <DemoRow label="Public Satisfaction" value={`${dm.publicSatisfactionIndex}%`} color={dm.publicSatisfactionIndex < 40 ? tc.danger : tc.accent} />
      <DemoRow label="Fear Index" value={`${dm.fearIndex}%`} color={dm.fearIndex > 50 ? tc.danger : tc.textMuted} />
      <DemoRow label="Loyalty Index" value={`${dm.loyaltyIndex}%`} color={dm.loyaltyIndex < 30 ? tc.danger : tc.accent} />
      <DemoRow label="Unrest Potential" value={`${dm.unrestPotentialIndex}%`} color={dm.unrestPotentialIndex > 50 ? tc.danger : tc.textMuted} />
      <DemoRow label="Civic Engagement" value={`${dm.civicEngagementLevel}%`} />
      <DemoRow label="Political Activism" value={`${dm.politicalActivismRate}%`} color={dm.politicalActivismRate > 40 ? tc.warning : tc.textMuted} />
      <DemoRow label="Crime Participation" value={`${dm.crimeParticipationRate}%`} color={dm.crimeParticipationRate > 20 ? tc.danger : tc.textMuted} />
      <DemoRow label="Gang Affiliation" value={`${dm.gangAffiliationRate}%`} color={dm.gangAffiliationRate > 10 ? tc.danger : tc.textMuted} />
      <DemoRow label="Corruption Exposure" value={`${dm.corruptionExposureRate}%`} color={dm.corruptionExposureRate > 30 ? tc.danger : tc.textMuted} />
      <DemoRow label="Media Influence" value={`${dm.mediaInfluenceLevel}%`} />

      <DemoSectionLabel title="POPULATION QUALITY" />
      <DemoRow label="Literacy Rate" value={`${dm.literacyRate ?? 0}%`} color={(dm.literacyRate ?? 0) < 40 ? tc.danger : tc.accent} />
      <DemoRow label="Substance Abuse" value={`${dm.substanceAbuseRate ?? 0}%`} color={(dm.substanceAbuseRate ?? 0) > 25 ? tc.danger : tc.textMuted} />
      <DemoRow label="Organ Donor Registry" value={dm.organDonorRegistry ?? 0} color={tc.info} />
      <DemoRow label="Displaced by Expansion" value={dm.displacedByExpansion ?? 0} color={(dm.displacedByExpansion ?? 0) > 0 ? tc.warning : tc.textMuted} />

      <DemoSectionLabel title="HEALTH INDICES" />
      <DemoRow label="Public Health Index" value={`${dm.publicHealthIndex}%`} color={dm.publicHealthIndex < 40 ? tc.danger : tc.accent} />
      <DemoRow label="Hospital Capacity" value={`${dm.hospitalCapacityUsage}%`} color={dm.hospitalCapacityUsage > 80 ? tc.danger : tc.textMuted} />
      <DemoRow label="Disease Infection" value={`${dm.diseaseInfectionRate}%`} color={dm.diseaseInfectionRate > 10 ? tc.danger : tc.textMuted} />
      <DemoRow label="Nutrition Level" value={`${dm.nutritionLevel}%`} color={dm.nutritionLevel < 50 ? tc.danger : tc.accent} />
      <DemoRow label="Sanitation Access" value={`${dm.sanitationAccessRate}%`} color={dm.sanitationAccessRate < 50 ? tc.danger : tc.accent} />
      <DemoRow label="Medical Coverage" value={`${dm.medicalCoverageRate}%`} color={dm.medicalCoverageRate < 40 ? tc.danger : tc.accent} />
      <DemoRow label="Mental Health Stress" value={`${dm.mentalHealthStressIndex}%`} color={dm.mentalHealthStressIndex > 60 ? tc.danger : tc.textMuted} />
      <DemoRow label="Emergency Response" value={`${dm.emergencyResponseCoverage}%`} color={dm.emergencyResponseCoverage < 40 ? tc.danger : tc.accent} />
      <DemoRow label="Happiness Index" value={`${dm.populationHappinessIndex}%`} color={dm.populationHappinessIndex < 40 ? tc.danger : tc.accent} />

      {(dm.clonePopulation > 0 || dm.geneticModifiedCitizens > 0) && (
        <>
          <DemoSectionLabel title="CLONING & GENETICS" />
          <DemoRow label="Clone Population" value={dm.clonePopulation} color={tc.info} />
          <DemoRow label="Clone Workers" value={dm.cloneWorkers} color={tc.info} />
          <DemoRow label="Clone Soldiers" value={dm.cloneSoldiers} color={tc.warning} />
          <DemoRow label="Cloned Pets" value={dm.clonedPets} />
          <DemoRow label="Cloned Livestock" value={dm.clonedLivestock} />
          <DemoRow label="Organ Stockpile" value={dm.clonedOrgansStockpile} color={tc.info} />
          <DemoRow label="De-Extinct Species" value={dm.deExtinctSpecies} color={tc.accent} />
          <DemoRow label="Gene-Modified Citizens" value={dm.geneticModifiedCitizens} color={tc.info} />
          <DemoRow label="Chimera Organisms" value={dm.chimeraOrganisms} color={tc.warning} />
          <DemoRow label="Blacksite Projects" value={dm.blacksiteProjects} color={tc.danger} />
        </>
      )}

      <View style={{ height: 20 }} />
    </>
  );
}

const useDemoStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  label: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
  },
  value: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    textAlign: "right",
  },
  unit: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  sectionLabel: {
    backgroundColor: "rgba(0,255,65,0.05)",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  sectionLabelText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  migrationControl: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  migrationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  migrationTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.2,
  },
  migrationToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  migrationLabel: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  migrationDesc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  migrationWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: Colors.danger + "15",
    borderWidth: 1,
    borderColor: Colors.danger + "33",
    borderRadius: 4,
    padding: 8,
  },
  migrationWarningText: {
    color: Colors.danger,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    flex: 1,
  },
}));

function CityJobsCard({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const catalog = getWorkforceCatalog(state);
  const sectors: { label: string; value: number; color?: string }[] = [
    { label: "Industrial", value: catalog.sectorTotals.industrial },
    { label: "Service", value: catalog.sectorTotals.service },
    { label: "Government", value: catalog.sectorTotals.government },
    { label: "Research", value: catalog.sectorTotals.research, color: tc.info },
    { label: "Infrastructure", value: catalog.sectorTotals.infrastructure },
    { label: "Security", value: catalog.sectorTotals.security, color: tc.warning },
    { label: "Black Market", value: catalog.sectorTotals.blackMarket, color: tc.danger },
  ];
  return (
    <>
      <SectionHeader
        title="City Jobs Allocation"
        subtitle={`${catalog.employedCitizens.toLocaleString()} employed citizens · ${catalog.sectorTotal.toLocaleString()} sector jobs`}
        icon={<Feather name="briefcase" size={14} color={tc.accent} />}
      />
      <View style={[jobsStyles.card, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
        <View style={jobsStyles.headerRow}>
          <Text style={[jobsStyles.totalLabel, { color: tc.textMuted }]}>EMPLOYED CITIZENS</Text>
          <Text style={[jobsStyles.totalValue, { color: tc.accent }]}>{catalog.employedCitizens.toLocaleString()}</Text>
        </View>
        <View style={[jobsStyles.divider, { backgroundColor: tc.border }]} />
        {sectors.map((s) => (
          <View key={s.label} style={jobsStyles.row}>
            <Text style={[jobsStyles.label, { color: tc.text }]}>{s.label}</Text>
            <Text style={[jobsStyles.value, { color: s.color ?? tc.text }]}>{s.value.toLocaleString()}</Text>
          </View>
        ))}
        <View style={[jobsStyles.divider, { backgroundColor: tc.border }]} />
        <View style={jobsStyles.row}>
          <Text style={[jobsStyles.label, { color: tc.text }]}>Local economy (included)</Text>
          <Text style={[jobsStyles.value, { color: tc.info }]}>{catalog.localEconomyJobs.toLocaleString()}</Text>
        </View>
        <View style={jobsStyles.row}>
          <Text style={[jobsStyles.label, { color: tc.text }]}>Mining operations (included)</Text>
          <Text style={[jobsStyles.value, { color: tc.info }]}>{catalog.miningJobs.toLocaleString()}</Text>
        </View>
        <View style={jobsStyles.row}>
          <Text style={[jobsStyles.label, { color: tc.text }]}>Direct detailed capacity</Text>
          <Text style={[jobsStyles.value, { color: tc.info }]}>{catalog.directDetailedRoleTotal.toLocaleString()}</Text>
        </View>
        <Text style={[jobsStyles.hint, { color: tc.textMuted }]}>
          Local businesses and mining operations are subsets of the employed-citizen total, never extra citizens.
        </Text>
      </View>
    </>
  );
}

// Direction-aware phrase helpers — mirror factions.tsx so the overview
// summary card and faction detail screen speak with one voice. The
// loyalty/threat helpers fold sign into the noun phrase to avoid double
// negation ("-15% loyalty drag" reads as "less drag"); the bare
// formatNpcMultDelta is kept for the asymmetric contract-delay row,
// where a signed prefix on a neutral noun reads correctly.
// (Tasks #62, #63.)
function formatNpcMultDelta(mult: number): string {
  const pct = (mult - 1) * 100;
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
function formatNpcMultMagnitude(mult: number): string {
  const pct = Math.abs((mult - 1) * 100);
  return `${Math.round(pct)}%`;
}
function npcLoyaltyChipText(mult: number): string {
  return mult > 1
    ? `+${formatNpcMultMagnitude(mult)} loyalty boost`
    : `${formatNpcMultMagnitude(mult)} loyalty drag`;
}
function npcThreatChipText(mult: number): string {
  return mult > 1
    ? `+${formatNpcMultMagnitude(mult)} threat surge`
    : `${formatNpcMultMagnitude(mult)} threat cooling`;
}

// Compact NPC-influence summary card. Surfaces the same trait-driven
// faction and city-wide multipliers exposed on the factions and contracts
// screens, but rolled up so the player sees at a glance which named
// figures are bending the simulation. Renders nothing when every
// multiplier is identity — no clutter when no traits apply. (Task #63.)
function NPCInfluenceCard({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const rows = React.useMemo(() => {
    type Row = { key: string; label: string; phrases: string[]; adverse: boolean };
    const out: Row[] = [];
    const factions = Array.isArray(state.factions) ? state.factions : [];
    for (const f of factions) {
      const m = computeFactionTraitMultipliers(state, f.id);
      const phrases: string[] = [];
      if (m.loyaltyMult !== 1) {
        phrases.push(npcLoyaltyChipText(m.loyaltyMult));
      }
      if (m.threatMult !== 1) {
        phrases.push(npcThreatChipText(m.threatMult));
      }
      if (phrases.length === 0) continue;
      // Adverse for the player when loyalty drags or threat surges.
      const adverse = m.loyaltyMult < 1 || m.threatMult > 1;
      out.push({ key: f.id, label: f.name, phrases, adverse });
    }
    const cm = computeCityTraitMultipliers(state);
    if (cm.contractDelayMult !== 1) {
      out.push({
        key: "__city",
        label: "City contracts",
        phrases: [`${formatNpcMultDelta(cm.contractDelayMult)} contract delivery delay`],
        adverse: cm.contractDelayMult > 1,
      });
    }
    return out;
  }, [state.factions, state.namedCharacters]);

  if (rows.length === 0) return null;

  return (
    <>
      <SectionHeader
        title="NPC Influence"
        subtitle="Named figures bending faction loyalty, threat, and city contracts"
        icon={<Feather name="user-check" size={14} color={tc.accent} />}
      />
      <View style={[jobsStyles.card, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
        {rows.map((r) => {
          const color = r.adverse ? tc.warning : tc.accent;
          return (
            <View key={r.key} style={npcInfluenceStyles.row}>
              <Text style={[npcInfluenceStyles.label, { color: tc.text }]} numberOfLines={1}>
                {r.label}
              </Text>
              <Text style={[npcInfluenceStyles.value, { color }]} numberOfLines={2}>
                {r.phrases.join(", ")}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

const npcInfluenceStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 4,
    gap: 10,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    flexShrink: 1,
  },
  value: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.3,
    textAlign: "right",
    flexShrink: 1,
  },
});

function NotableFiguresCard({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const all = state.namedCharacters ?? [];
  const allActive = all
    .filter((c) => c.status === "active")
    .sort((a, b) => b.notoriety - a.notoriety || b.lastSeenYear - a.lastSeenYear);
  const active = allActive.slice(0, 6);

  const ROLE_LABELS: Record<string, string> = {
    gang_lieutenant: "Gang Lieutenant",
    journalist: "Journalist",
    tycoon: "Industrial Tycoon",
    agitator: "Street Agitator",
    celebrity: "Public Figure",
    informant: "Informant",
    fugitive: "Fugitive",
    preacher: "Underground Preacher",
    union_boss: "Union Boss",
  };

  // Roll-up: classify each notable as ally / rival / neutral by faction stance.
  // Threat overrides loyalty when both are extreme; characters without a faction are neutral.
  const { factionById } = useGameLookups(state);
  const classify = (factionId?: string | null): "ally" | "rival" | "neutral" => {
    if (!factionId) return "neutral";
    const f = factionById.get(factionId);
    if (!f) return "neutral";
    if (f.threat >= 60 || f.loyalty <= 20) return "rival";
    if (f.loyalty >= 60 && f.threat <= 30) return "ally";
    return "neutral";
  };
  let allies = 0, rivals = 0, neutrals = 0;
  for (const c of allActive) {
    const k = classify(c.factionId);
    if (k === "ally") allies++; else if (k === "rival") rivals++; else neutrals++;
  }

  return (
    <>
      <SectionHeader
        title="Notable Figures"
        subtitle={
          active.length > 0
            ? `${active.length} active — tap any name for details`
            : "Watch for emerging figures in the news"
        }
        icon={<Feather name="users" size={14} color={tc.accent} />}
      />
      <View style={[jobsStyles.card, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
        {active.length > 0 && (
          <View style={notableStyles.rollupRow}>
            <View style={[notableStyles.rollupChip, { borderColor: tc.accent + "60", backgroundColor: tc.accent + "12" }]}>
              <Feather name="shield" size={10} color={tc.accent} />
              <Text style={[notableStyles.rollupLabel, { color: tc.accent }]}>{allies} ALLIES</Text>
            </View>
            <View style={[notableStyles.rollupChip, { borderColor: tc.danger + "60", backgroundColor: tc.danger + "12" }]}>
              <Feather name="alert-octagon" size={10} color={tc.danger} />
              <Text style={[notableStyles.rollupLabel, { color: tc.danger }]}>{rivals} RIVALS</Text>
            </View>
            <View style={[notableStyles.rollupChip, { borderColor: tc.textMuted + "60", backgroundColor: tc.textMuted + "12" }]}>
              <Feather name="circle" size={10} color={tc.textMuted} />
              <Text style={[notableStyles.rollupLabel, { color: tc.textMuted }]}>{neutrals} NEUTRAL</Text>
            </View>
          </View>
        )}
        {active.length === 0 ? (
          <Text style={[jobsStyles.hint, { color: tc.textMuted, marginTop: 0 }]}>
            No notable figures yet. As events unfold, named characters will surface here.
          </Text>
        ) : (
          active.map((c) => {
            const isExpanded = expandedId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setExpandedId(isExpanded ? null : c.id)}
                style={({ pressed }) => [
                  notableStyles.row,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={notableStyles.headerLine}>
                  <Text style={[notableStyles.name, { color: tc.text }]}>
                    {c.name}
                    <Text style={[notableStyles.expandHint, { color: tc.textMuted }]}>
                      {isExpanded ? "  ▾" : "  ▸"}
                    </Text>
                  </Text>
                  <Text style={[notableStyles.notoriety, { color: tc.warning }]}>
                    NOT {c.notoriety}
                  </Text>
                </View>
                <Text style={[notableStyles.role, { color: tc.textMuted }]}>
                  {ROLE_LABELS[c.role] ?? c.role}
                  {"  •  "}since Y{c.introducedYear}
                </Text>

                {/* task #51: surface trait chips inline on the collapsed
                    row too, not just on expand, so players can read a
                    figure's character at a glance without tapping in. */}
                {!isExpanded && c.traits && c.traits.length > 0 && (
                  <View style={notableStyles.traitChipRow}>
                    {c.traits.slice(0, 3).map((t, i) => {
                      const v = getTraitVisual(t);
                      const tint = tc[v.color];
                      return (
                        <View
                          key={`inline-${t}-${i}`}
                          style={[notableStyles.traitChip, { borderColor: tint + "55", backgroundColor: tint + "12" }]}
                          accessibilityLabel={`${t}: ${getTraitDescription(t)}`}
                        >
                          <MaterialCommunityIcons name={v.icon} size={10} color={tint} />
                          <Text style={[notableStyles.traitLabel, { color: tint }]}>
                            {t}
                          </Text>
                        </View>
                      );
                    })}
                    {c.traits.length > 3 && (
                      <Text style={[notableStyles.traitLabel, { color: tc.textMuted, alignSelf: "center" }]}>
                        +{c.traits.length - 3} more
                      </Text>
                    )}
                  </View>
                )}

                {isExpanded && (
                  <View style={notableStyles.detail}>
                    {c.factionId ? (
                      <Text style={[notableStyles.detailMeta, { color: tc.textMuted }]}>
                        FACTION: {getFactionName(state.factions, c.factionId)}
                      </Text>
                    ) : null}
                    {c.districtId ? (
                      <Text style={[notableStyles.detailMeta, { color: tc.textMuted }]}>
                        DISTRICT: {state.districts.find((district) => district.id === c.districtId)?.name ?? c.districtId}
                      </Text>
                    ) : null}
                    <Text style={[notableStyles.detailMeta, { color: tc.textMuted }]}>
                      STATUS: {c.status.toUpperCase()}  •  BORN Y{c.bornYear}  •  INTRODUCED Y{c.introducedYear}  •  LAST SEEN Y{c.lastSeenYear}
                    </Text>

                    {c.traits && c.traits.length > 0 && (
                      <>
                        <Text style={[notableStyles.sectionLabel, { color: tc.accent }]}>
                          TRAITS
                        </Text>
                        <View style={notableStyles.traitChipRow}>
                          {c.traits.map((t, i) => {
                            const v = getTraitVisual(t);
                            const tint = tc[v.color];
                            return (
                              <View
                                key={`${t}-${i}`}
                                style={[notableStyles.traitChip, { borderColor: tint + "55", backgroundColor: tint + "12" }]}
                                accessibilityLabel={`${t}: ${getTraitDescription(t)}`}
                              >
                                <MaterialCommunityIcons name={v.icon} size={11} color={tint} />
                                <Text style={[notableStyles.traitLabel, { color: tint }]}>
                                  {t}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </>
                    )}

                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </View>
    </>
  );
}

const notableStyles = StyleSheet.create({
  rollupRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  rollupChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 3,
  },
  rollupLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  traitChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  traitChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 3,
  },
  traitLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.4,
  },
  row: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  name: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  notoriety: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  role: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  recent: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  expandHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
  detail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  detailMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 2,
  },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: 4,
  },
  historyLine: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 3,
  },
});

const jobsStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
  },
  totalLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  totalValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  divider: {
    height: 1,
    opacity: 0.5,
    marginVertical: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  label: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  value: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 8,
    textAlign: "center",
    fontStyle: "italic",
  },
});

const BannerStat = React.memo(function BannerStat({
  label,
  value,
  sub,
  color,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  accessibilityLabel?: string;
}) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.bannerStat} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>
      <Text style={[styles.bannerLabel, { color: tc.textMuted }]}>{label}</Text>
      <Text style={[styles.bannerValue, { color }]}>{value}</Text>
      <Text style={[styles.bannerSub, { color: tc.textMuted }]}>{sub}</Text>
    </View>
  );
});

const UtilCell = React.memo(function UtilCell({
  label,
  stockpile,
  net,
  icon,
  warn,
  critical,
  unit = "units",
}: {
  label: string;
  stockpile: number;
  net: number;
  icon: string;
  warn: boolean;
  critical: boolean;
  unit?: string;
}) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  const borderColor = critical ? tc.danger : warn ? tc.warning : tc.border;
  const netColor = net >= 0 ? tc.accent : tc.danger;
  return (
    <View style={[styles.utilCell, { borderColor, backgroundColor: tc.bgCard }]}>
      <Feather
        name={icon as any}
        size={14}
        color={critical ? tc.danger : warn ? tc.warning : tc.accent}
      />
      <Text style={[styles.utilLabel, { color: tc.textMuted }]}>{label}</Text>
      <Text style={[styles.utilStock, { color: critical ? tc.danger : tc.text }]}>
        {Math.round(stockpile).toLocaleString()}
        <Text style={[styles.utilUnit, { color: tc.textMuted }]}> {unit}</Text>
      </Text>
      <Text style={[styles.utilNet, { color: netColor }]}>
        {net >= 0 ? "+" : ""}
        {net}/tick
      </Text>
    </View>
  );
});

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Platform.OS === "web" ? 12 : 16,
    paddingVertical: Platform.OS === "web" ? 8 : 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerLeft: { flex: 1, minWidth: 180 },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  headerSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  weatherSub: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    marginTop: 1,
    letterSpacing: 0.5,
  },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  iconBtn: { padding: Platform.OS === "web" ? 6 : 8, position: "relative" as const },
  badge: {
    position: "absolute" as const,
    top: 2,
    right: 2,
    backgroundColor: Colors.danger,
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 8,
  },

  banner: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderBright,
  },
  catchupPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  catchupPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.6,
    flex: 1,
  },
  bannerStat: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 96,
    paddingVertical: Platform.OS === "web" ? 6 : 10,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  bannerDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  bannerLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  bannerValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  bannerSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    marginTop: 1,
    textAlign: "center",
  },

  rewardAdBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: Platform.OS === "web" ? 6 : 8,
    backgroundColor: Colors.warning + "10",
    borderTopWidth: 1,
    borderTopColor: Colors.warning + "30",
    borderBottomWidth: 1,
    borderBottomColor: Colors.warning + "30",
  },
  rewardAdText: {
    color: Colors.warning,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  overviewTabBar: {
    flexDirection: "row",
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  overviewTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  overviewTabBtnActive: {
    borderBottomColor: Colors.accent,
  },
  overviewTabText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
  },
  overviewTabTextActive: {
    color: Colors.accent,
  },
  tickerRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
  },
  tickerChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
  },
  tickerChipActive: {
    borderColor: Colors.accent,
    backgroundColor: "rgba(0,255,65,0.08)",
  },
  tickerChipPaused: {
    borderColor: Colors.warning,
    backgroundColor: "rgba(255,149,0,0.08)",
    flexDirection: "row",
  },
  tickerChipPressed: {
    opacity: 0.7,
    backgroundColor: Colors.bgElevated,
  },
  tickerChipText: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  tickerChipTextActive: {
    color: Colors.accent,
  },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Platform.OS === "web" ? 12 : 16,
    paddingTop: Platform.OS === "web" ? 8 : 12,
    paddingBottom: 20,
  },

  utilRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  utilCell: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderRadius: 4,
    padding: Platform.OS === "web" ? 8 : 10,
    alignItems: "center",
    gap: 2,
  },
  utilLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
  },
  utilStock: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginTop: 2,
  },
  utilUnit: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  utilNet: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    marginTop: 1,
  },
  crisisRiskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  crisisRiskBody: {
    flex: 1,
    gap: 6,
  },
  crisisRiskTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  crisisRiskTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  crisisRiskChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  crisisRiskChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.8,
  },
  crisisRiskDelta: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  crisisRiskTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  crisisRiskFill: {
    height: "100%",
    borderRadius: 2,
  },
  crisisRiskSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 14,
  },
}));

const PolicyToggle = React.memo(function PolicyToggle({
  label,
  sub,
  active,
  onToggle,
  danger = false,
}: {
  label: string;
  sub: string;
  active: boolean;
  onToggle: () => void;
  danger?: boolean;
}) {
  const { colors: tc } = useTheme();
  const ptStyles = usePtStyles();
  return (
    <View style={[ptStyles.row, { borderBottomColor: tc.border }]}>
      <View style={ptStyles.left}>
        <Text style={[ptStyles.label, { color: tc.text }, danger && active && { color: tc.danger }]}>{label}</Text>
        <Text style={[ptStyles.sub, { color: tc.textMuted }]}>{sub}</Text>
      </View>
      <Switch
        value={active}
        onValueChange={onToggle}
        trackColor={{ false: tc.border, true: danger ? tc.danger + "66" : tc.accentDark }}
        thumbColor={active ? (danger ? tc.danger : tc.accent) : tc.textMuted}
        accessibilityLabel={`Toggle ${label}`}
      />
    </View>
  );
});

const usePtStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 2,
  },
  left: { flex: 1, paddingRight: 12 },
  label: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  sub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
}));

const EFFECT_LABELS: Record<string, string> = {
  crime: "Crime",
  unrest: "Unrest",
  happiness: "Happy",
  lawOrder: "Law",
  corruption: "Corrupt",
  employment: "Employ",
  infrastructureHealth: "Infra",
  defenseRating: "Defense",
  populationGrowthRate: "Pop Growth",
  taxIncome: "Tax",
  tradeIncome: "Trade",
  foodProduction: "Food",
  waterProduction: "Water",
  powerGeneration: "Power",
  steelProduction: "Steel",
  goodsProduction: "Goods",
  fuelProduction: "Fuel",
  medProduction: "Med",
  researchSpeed: "Research",
};

function formatEffects(effects: Record<string, number | undefined>): string {
  return Object.entries(effects)
    .filter(([, v]) => v !== undefined && v !== 0)
    .map(([k, v]) => {
      const label = EFFECT_LABELS[k] ?? k;
      const sign = (v as number) > 0 ? "+" : "";
      return `${label} ${sign}${v}`;
    })
    .join("  ");
}

const usePStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  catBlock: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    marginBottom: 10,
    overflow: "hidden",
    backgroundColor: Colors.bgCard,
  },
  catHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,255,65,0.04)",
  },
  catHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  catLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
  },
  catBadge: {
    backgroundColor: Colors.accentDark + "44",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catBadgeText: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  policyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border + "66",
  },
  policyLocked: {
    opacity: 0.4,
  },
  policyLeft: {
    flex: 1,
    paddingRight: 12,
  },
  policyName: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  policyDesc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  policyMeta: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    flexWrap: "wrap",
  },
  policyStatus: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    marginTop: 5,
  },
  policyEffects: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    flexShrink: 1,
  },
  prereqText: {
    color: Colors.warning,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    marginTop: 3,
    fontStyle: "italic",
  },
}));

export default withScreenBoundary(OverviewScreen, "overview");

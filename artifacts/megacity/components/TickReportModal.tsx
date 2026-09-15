import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { CATCHUP_ERRORS_OVERFLOW_SUBSYSTEM, type TickSubsystemError } from "@/engine/formulas";
import type { OfflineSimDepth } from "@/engine/offlineSimDepth";
import type { TickEntry } from "@/engine/types";
import {
  formatCatchupDuration,
  formatResumedAmount,
  getOvershootEscalation,
  isResumeOvershoot,
  shouldShowCatchupPill,
} from "@/utils/format";

type Props = {
  visible: boolean;
  entries: TickEntry[];
  tickCount: number;
  onDismiss: () => void;
  simulatedTicks?: number;
  extrapolatedTicks?: number;
  offlineSimDepth?: OfflineSimDepth;
  // Wall-clock duration of the catch-up batch in milliseconds. When supplied
  // (offline-resume reports only), we surface it in human-readable form so
  // players can compare lived resume time against the OFFLINE SIM DEPTH
  // estimate label. Omitted for the live "view current tick" report.
  catchupWallMs?: number;
  // Predicted wall-clock cost of the catch-up batch (rolling per-tick avg
  // × ticks-to-simulate), captured before the batch ran. When supplied
  // alongside catchupWallMs we compare the two and surface a soft warning
  // hint if reality blew well past the estimate (heavy GC, thermal
  // throttle, etc.) so players can self-tune OFFLINE SIM DEPTH.
  estimatedWallMs?: number;
  // How many recent offline catch-ups overshot their estimate (counted
  // from `state.recentResumeOvershoots` by the parent screen, so the
  // modal stays presentational). Includes the current resume, so a
  // value of 1 means "first overshoot in the recent window". Drives
  // the wording escalation: 1 → soft (as before), 2-3 → moderate
  // ("(N× RECENT)"), 4+ → severe ("RESUME PERFORMANCE DEGRADING").
  recentOvershootCount?: number;
  // One-tap "auto-tune" handler the parent wires up. When supplied AND
  // the escalation has hit the severe tier AND the current depth can
  // still be lowered a notch (deep→standard→lite), the modal surfaces a
  // button that drops OFFLINE SIM DEPTH one step, clears the recent
  // overshoot ring buffer (so the new depth gets a fresh window), and
  // confirms via a toast. The parent owns the actual state mutation so
  // this component stays presentational.
  onAutoTuneDepth?: () => void;
  // Subsystem failures aggregated across the whole offline catch-up batch
  // (deduped by subsystem+message). Surfaced as a danger banner so failures
  // that happened mid-batch — not just on the final tick — are visible. Only
  // supplied by offline-resume reports; omitted for the live tick log.
  subsystemErrors?: TickSubsystemError[];
  // When supplied, the subsystem-error banner shows a "COPY REPORT" button so
  // players can grab the full failure report (including suppressed errors that
  // aren't rendered on screen) for a bug report. The parent owns the clipboard
  // write + toast and the full report payload, so the modal stays presentational.
  onCopyReport?: () => void;
};

const DEPTH_LABEL: Record<OfflineSimDepth, string> = {
  lite: "Lite",
  standard: "Standard",
  deep: "Deep",
};

type Category = {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  entries: TickEntry[];
};

const getCategoryRules = (Colors: ThemePalette): { title: string; icon: keyof typeof Feather.glyphMap; color: string; match: string[] }[] => [
  { title: "RESOURCES", icon: "package", color: Colors.accent, match: ["Credits", "Tax", "Trade", "Tourism", "Upkeep", "Steel", "Fuel", "Goods", "Med", "Food", "Water", "Power"] },
  { title: "CITY STATUS", icon: "activity", color: Colors.warning, match: ["Unrest", "Happiness", "Morale", "Crime", "Education", "Health", "Population", "Employment", "Housing", "Biosphere", "Disease"] },
  { title: "MILITARY & SECURITY", icon: "shield", color: "#ff4444", match: ["Combat", "Raid", "Defense", "Military", "Engagement", "Zone", "Skirmish", "Breach", "Detection"] },
  { title: "RESEARCH & TECH", icon: "cpu", color: "#8888ff", match: ["Research", "Tech", "Unlocked"] },
  { title: "INFRASTRUCTURE", icon: "tool", color: "#aaaaaa", match: ["Waste", "Transit", "Sanitation", "Comms", "Infrastructure"] },
];

function categorizeEntries(entries: TickEntry[], Colors: ThemePalette): Category[] {
  const used = new Set<number>();
  const categories: Category[] = [];

  for (const rule of getCategoryRules(Colors)) {
    const matched: TickEntry[] = [];
    entries.forEach((e, i) => {
      if (used.has(i)) return;
      if (rule.match.some((m) => e.label.includes(m) || e.reason.includes(m))) {
        matched.push(e);
        used.add(i);
      }
    });
    if (matched.length > 0) {
      categories.push({ title: rule.title, icon: rule.icon, color: rule.color, entries: matched });
    }
  }

  const remaining = entries.filter((_, i) => !used.has(i));
  if (remaining.length > 0) {
    categories.push({ title: "OTHER", icon: "list", color: Colors.textMuted, entries: remaining });
  }

  return categories;
}

function SummaryBar({ entries }: { entries: TickEntry[] }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const positive = entries.filter((e) => e.severity === "positive").length;
  const negative = entries.filter((e) => e.severity === "negative").length;
  const neutral = entries.length - positive - negative;

  return (
    <View style={styles.summaryBar}>
      {positive > 0 && (
        <View style={styles.summaryItem}>
          <Feather name="trending-up" size={12} color={Colors.accent} />
          <Text style={[styles.summaryText, { color: Colors.accent }]}>{positive}</Text>
        </View>
      )}
      {negative > 0 && (
        <View style={styles.summaryItem}>
          <Feather name="trending-down" size={12} color={Colors.danger} />
          <Text style={[styles.summaryText, { color: Colors.danger }]}>{negative}</Text>
        </View>
      )}
      {neutral > 0 && (
        <View style={styles.summaryItem}>
          <Feather name="minus" size={12} color={Colors.textMuted} />
          <Text style={[styles.summaryText, { color: Colors.textMuted }]}>{neutral}</Text>
        </View>
      )}
    </View>
  );
}

function EntryRow({ entry }: { entry: TickEntry }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const deltaColor =
    entry.severity === "positive"
      ? Colors.accent
      : entry.severity === "negative"
      ? Colors.danger
      : entry.severity === "warning"
      ? Colors.warning
      : Colors.info;

  const prefix = entry.delta > 0 ? "+" : "";

  return (
    <View style={styles.entryRow}>
      <View style={styles.entryLeft}>
        <Text style={styles.entryLabel}>{entry.label}</Text>
        <Text style={styles.entryReason}>{entry.reason}</Text>
      </View>
      <Text style={[styles.entryDelta, { color: deltaColor }]}>
        {prefix}
        {entry.delta} {entry.unit}
      </Text>
    </View>
  );
}

function CategorySection({ category }: { category: Category }) {
  const styles = useStyles();
  return (
    <View style={styles.categorySection}>
      <View style={styles.categoryHeader}>
        <Feather name={category.icon} size={13} color={category.color} />
        <Text style={[styles.categoryTitle, { color: category.color }]}>{category.title}</Text>
        <View style={[styles.categoryLine, { backgroundColor: category.color }]} />
      </View>
      {category.entries.map((e, i) => (
        <EntryRow key={i} entry={e} />
      ))}
    </View>
  );
}

// The next-lower OFFLINE SIM DEPTH notch, or null when already at the
// floor ("lite"). Drives both the auto-tune button label and whether the
// button shows at all.
const NEXT_LOWER_DEPTH: Record<OfflineSimDepth, OfflineSimDepth | null> = {
  deep: "standard",
  standard: "lite",
  lite: null,
};

export default function TickReportModal({ visible, entries, tickCount, onDismiss, simulatedTicks, extrapolatedTicks, offlineSimDepth, catchupWallMs, estimatedWallMs, recentOvershootCount, onAutoTuneDepth, subsystemErrors, onCopyReport }: Props) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const categories = categorizeEntries(entries, Colors);
  const hoursAway = Math.round(tickCount * 0.25);
  // Only show the resume-time pill when we have a real measured duration
  // tied to an offline catch-up batch (catchupWallMs is omitted by the
  // live "current tick" report). Tiny sub-millisecond batches are ignored
  // to avoid noisy "0ms" pills.
  const showCatchupDuration = shouldShowCatchupPill(catchupWallMs, tickCount);
  const catchupDurationLabel = showCatchupDuration ? formatCatchupDuration(catchupWallMs!) : "";
  // Only flag overshoot when this resume itself blew past the estimate.
  // Escalation level — derived from how many recent overshoots have been
  // pinned (parent passes a count from state.recentResumeOvershoots) —
  // controls only the wording, not whether the warning shows.
  const showOvershootWarning = showCatchupDuration && isResumeOvershoot(catchupWallMs, estimatedWallMs);
  const overshootEstimateLabel = showOvershootWarning ? formatCatchupDuration(estimatedWallMs!) : "";
  const overshootEscalation = getOvershootEscalation(recentOvershootCount ?? (showOvershootWarning ? 1 : 0));
  const overshootHeadline = showOvershootWarning
    ? overshootEscalation === "severe"
      ? `RESUME PERFORMANCE DEGRADING (${recentOvershootCount}× RECENT) — ESTIMATED ${overshootEstimateLabel}`
      : overshootEscalation === "moderate"
      ? `TOOK LONGER THAN EXPECTED (${recentOvershootCount}× RECENT) — ESTIMATED ${overshootEstimateLabel}`
      : `TOOK LONGER THAN EXPECTED — ESTIMATED ${overshootEstimateLabel}`
    : "";
  const overshootHint = showOvershootWarning
    ? overshootEscalation === "severe"
      ? "Strongly consider lowering OFFLINE SIM DEPTH in Settings — recent resumes have repeatedly run over budget on this device."
      : "If this keeps happening, lower OFFLINE SIM DEPTH in Settings to shorten future resumes."
    : "";
  // One-tap auto-tune: only offer it once the warning has escalated to
  // the severe tier (the ring buffer says this depth is consistently too
  // aggressive for this device) AND there's a lower notch to drop to.
  // Below "lite" there's nothing left to lower, so the button hides and
  // the player is left with the Settings hint only.
  const autoTuneTarget = offlineSimDepth ? NEXT_LOWER_DEPTH[offlineSimDepth] : null;
  const canAutoTune =
    showOvershootWarning &&
    overshootEscalation === "severe" &&
    !!onAutoTuneDepth &&
    autoTuneTarget !== null;
  const autoTuneLabel = autoTuneTarget
    ? `AUTO-TUNE: LOWER TO ${DEPTH_LABEL[autoTuneTarget].toUpperCase()}`
    : "";
  // Choose the right granularity for the resumed-time pill so a 1-tick
  // resume reads as "15 MIN" rather than the misleading "1 DAY". Each tick
  // is 15 minutes of in-game time.
  const resumedAmountLabel = showCatchupDuration ? formatResumedAmount(tickCount) : "";
  const showExtrapolationNote =
    typeof extrapolatedTicks === "number" &&
    extrapolatedTicks > 0 &&
    typeof simulatedTicks === "number";
  const showDepthNote = showExtrapolationNote && !!offlineSimDepth;
  const depthLabel = offlineSimDepth ? DEPTH_LABEL[offlineSimDepth] : "";
  const depthHint = offlineSimDepth === "deep"
    ? null
    : offlineSimDepth === "standard"
    ? "Switch to Deep in Settings to simulate more on resume."
    : "Switch to Standard or Deep in Settings to simulate more on resume.";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View
          style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>SECTOR REPORT</Text>
              <Text style={styles.subtitle}>
                {tickCount} TICK{tickCount !== 1 ? "S" : ""} PROCESSED
                {hoursAway > 0 ? ` • ~${hoursAway}H ELAPSED` : ""}
              </Text>
            </View>
            <Pressable
              onPress={onDismiss}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close sector report"
            >
              <Feather name="x" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <SummaryBar entries={entries} />

          {subsystemErrors && subsystemErrors.length > 0 && (() => {
            const overflowEntry = subsystemErrors.find((e) => e.subsystem === CATCHUP_ERRORS_OVERFLOW_SUBSYSTEM);
            const shownErrors = subsystemErrors.filter((e) => e.subsystem !== CATCHUP_ERRORS_OVERFLOW_SUBSYSTEM);
            return (
              <View style={styles.subsystemNote}>
                <View style={styles.subsystemHeader}>
                  <Feather name="alert-octagon" size={12} color={Colors.danger} />
                  <Text style={styles.subsystemHeaderText}>
                    {shownErrors.length} SUBSYSTEM {shownErrors.length === 1 ? "ERROR" : "ERRORS"} DURING CATCH-UP
                  </Text>
                </View>
                <Text style={styles.subsystemHint}>
                  These systems were skipped on one or more simulated ticks. The simulation continued — please report persistent failures.
                </Text>
                {shownErrors.map((e, i) => (
                  <View key={`${e.subsystem}-${i}`} style={styles.subsystemRow}>
                    <Text style={styles.subsystemName}>{e.subsystem}</Text>
                    <Text style={styles.subsystemMsg} numberOfLines={3}>{e.error || "unknown error"}</Text>
                  </View>
                ))}
                {overflowEntry && (
                  <Text style={styles.subsystemOverflow}>{overflowEntry.error}</Text>
                )}
                {onCopyReport && (
                  <Pressable
                    onPress={onCopyReport}
                    accessibilityRole="button"
                    accessibilityLabel="Copy full error report"
                    style={({ pressed }) => [
                      styles.copyReportBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Feather name="clipboard" size={12} color={Colors.danger} />
                    <Text style={styles.copyReportText}>COPY REPORT</Text>
                  </Pressable>
                )}
              </View>
            );
          })()}

          {showCatchupDuration && (
            <View style={styles.catchupNote}>
              <Feather name="clock" size={12} color={Colors.accent} />
              <Text style={styles.catchupText}>
                RESUMED {resumedAmountLabel} IN {catchupDurationLabel}
              </Text>
            </View>
          )}

          {showOvershootWarning && (
            <View style={styles.overshootNote}>
              <Feather name="alert-triangle" size={12} color={Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.overshootText}>
                  {overshootHeadline}
                </Text>
                <Text style={styles.overshootHint}>
                  {overshootHint}
                </Text>
                {canAutoTune && (
                  <Pressable
                    onPress={onAutoTuneDepth}
                    accessibilityRole="button"
                    accessibilityLabel={autoTuneLabel}
                    style={({ pressed }) => [
                      styles.autoTuneBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Feather name="sliders" size={12} color={Colors.warning} />
                    <Text style={styles.autoTuneText}>{autoTuneLabel}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {showExtrapolationNote && (
            <View style={styles.extrapolationNote}>
              <Feather name="alert-triangle" size={12} color={Colors.warning} />
              <Text style={styles.extrapolationText}>
                {simulatedTicks} TICK{simulatedTicks !== 1 ? "S" : ""} FULLY SIMULATED • {extrapolatedTicks} ESTIMATED FROM RATES
              </Text>
            </View>
          )}

          {showDepthNote && (
            <View style={styles.depthNote}>
              <Feather name="sliders" size={12} color={Colors.info} />
              <View style={{ flex: 1 }}>
                <Text style={styles.depthText}>
                  OFFLINE DEPTH: {depthLabel.toUpperCase()} — FULLY SIMULATED {simulatedTicks} / {tickCount} TICKS
                </Text>
                {depthHint && (
                  <Text style={styles.depthHint}>{depthHint}</Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.scanline} />

          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {entries.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
                <Text style={{ color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 1.5 }}>NO DATA AVAILABLE</Text>
                <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center", lineHeight: 18, paddingHorizontal: 16 }}>
                  The simulation has not yet generated any report entries. Allow the city ticker to run to receive sector updates.
                </Text>
              </View>
            ) : (
              categories.map((cat) => (
                <CategorySection key={cat.title} category={cat} />
              ))
            )}
          </ScrollView>

          <Pressable onPress={onDismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>ACKNOWLEDGE REPORT</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: Platform.OS === "web" ? "flex-start" : "flex-end",
    paddingTop: Platform.OS === "web" ? 12 : 0,
  },
  panel: {
    backgroundColor: Colors.bgCard,
    borderTopWidth: 2,
    borderTopColor: Colors.accent,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderLeftColor: Colors.borderBright,
    borderRightColor: Colors.borderBright,
    maxHeight: Platform.OS === "web" ? "96%" : "80%",
    paddingHorizontal: Platform.OS === "web" ? 14 : 20,
    paddingTop: Platform.OS === "web" ? 12 : 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  title: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: 2,
  },
  subtitle: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  summaryBar: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  summaryText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  scanline: {
    height: 1,
    backgroundColor: Colors.borderBright,
    marginBottom: 12,
  },
  subsystemNote: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderLeftWidth: 3,
    borderRadius: 3,
    backgroundColor: "rgba(200,50,60,0.10)",
  },
  subsystemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  subsystemHeaderText: {
    flex: 1,
    color: Colors.danger,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  subsystemHint: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  subsystemRow: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.danger,
    paddingLeft: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  subsystemName: {
    color: "#ff8a91",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  subsystemMsg: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
  },
  subsystemOverflow: {
    color: "#ff8a91",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 6,
  },
  copyReportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 3,
    backgroundColor: "rgba(200,50,60,0.12)",
  },
  copyReportText: {
    color: "#ff8a91",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  catchupNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 3,
    backgroundColor: "rgba(0,255,170,0.06)",
  },
  catchupText: {
    flex: 1,
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1,
  },
  overshootNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 3,
    backgroundColor: "rgba(255,170,0,0.08)",
  },
  overshootText: {
    color: Colors.warning,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1,
  },
  overshootHint: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  autoTuneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 3,
    backgroundColor: "rgba(255,170,0,0.12)",
  },
  autoTuneText: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  extrapolationNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 3,
    backgroundColor: "rgba(255,170,0,0.08)",
  },
  extrapolationText: {
    flex: 1,
    color: Colors.warning,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1,
  },
  depthNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.info,
    borderRadius: 3,
    backgroundColor: "rgba(80,160,255,0.08)",
  },
  depthText: {
    color: Colors.info,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1,
  },
  depthHint: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
    marginBottom: 16,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  categoryTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  categoryLine: {
    flex: 1,
    height: 1,
    opacity: 0.3,
  },
  entryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 6,
    paddingLeft: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  entryLeft: {
    flex: 1,
    paddingRight: 12,
  },
  entryLabel: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  entryReason: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  entryDelta: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  dismissBtn: {
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 4,
    padding: 14,
    alignItems: "center",
  },
  dismissText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 2,
  },
}));

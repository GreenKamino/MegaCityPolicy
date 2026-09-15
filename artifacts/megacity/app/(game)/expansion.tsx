import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import SectionHeader from "@/components/SectionHeader";
import StatBar from "@/components/StatBar";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState, useGameActions } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import {
  RECLAIMABLE_PLOTS,
  CONTAMINATION_LABELS,
  CONTAMINATION_COLORS,
  CATEGORY_LABELS,
  PHASE_LABELS,
  UPGRADE_TIER_LABELS,
  UPGRADE_TIER_COSTS,
  UPGRADE_TIER_TICKS,
  UPGRADE_TIER_BONUSES,
  getAvailablePlots,
  canAffordPhase,
  canAffordUpgrade,
  getMaxUpgradeTier,
  getUpgradeCostMult,
  initExpansionState,
  type ReclaimablePlot,
  type DistrictUpgradeTier,
  type ActiveReclamation,
} from "@/engine/districtExpansion";
import type { District } from "@/engine/types";

type TabId = "reclaim" | "upgrade" | "log";

function ExpansionScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGameState();
  const { setState } = useGameActions();
  const { modal, showModal, hideModal } = useGameModal();
  const [tab, setTab] = useState<TabId>("reclaim");
  const [selectedPlot, setSelectedPlot] = useState<ReclaimablePlot | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);
  const [expandedPlotId, setExpandedPlotId] = useState<string | null>(null);

  const exp = state.districtExpansion ?? initExpansionState();
  const available = useMemo(() => getAvailablePlots(state), [state.unlockedTechnologies, state.districtExpansion]);
  const maxTier = getMaxUpgradeTier(state.unlockedTechnologies);
  const upgradeCostMult = getUpgradeCostMult(state.unlockedTechnologies);

  const activeMap = useMemo(() => {
    const m: Record<string, ActiveReclamation> = {};
    for (const r of exp.activeReclamations) m[r.plotId] = r;
    return m;
  }, [exp.activeReclamations]);

  function startReclamation(plot: ReclaimablePlot) {
    const costMult = 1.0;
    const phase = plot.phases[0];
    if (!canAffordPhase(state.resources, phase, costMult)) {
      showModal("INSUFFICIENT RESOURCES", `Cannot afford the ${phase.label} phase for ${plot.name}.`, [
        { text: "DISMISS", onPress: hideModal },
      ]);
      return;
    }

    showModal("BEGIN RECLAMATION", `Start reclamation of ${plot.name}?\n\nPhase 1: ${phase.label}\nCost: ${phase.cost.credits.toLocaleString()}cr, ${phase.cost.steel}st, ${phase.cost.fuel}fu, ${phase.cost.goods}gd\nDuration: ~${phase.ticksRequired} ticks`, [
      { text: "CANCEL", onPress: hideModal },
      {
        text: "BEGIN",
        style: "destructive",
        onPress: () => {
          setState((prev) => {
            const e = prev.districtExpansion ? { ...prev.districtExpansion } : initExpansionState();
            const p = plot.phases[0];
            const res = { ...prev.resources };
            res.credits -= Math.floor(p.cost.credits);
            res.steel -= Math.floor(p.cost.steel);
            res.fuel -= Math.floor(p.cost.fuel);
            res.goods -= Math.floor(p.cost.goods);
            e.activeReclamations = [
              ...e.activeReclamations,
              { plotId: plot.id, currentPhaseIndex: 0, ticksElapsed: 0, paused: false, startedTick: prev.totalTicks },
            ];
            return { ...prev, resources: res, districtExpansion: e };
          });
          hideModal();
        },
      },
    ]);
  }

  function togglePause(plotId: string) {
    setState((prev) => {
      const e = prev.districtExpansion ? { ...prev.districtExpansion } : initExpansionState();
      e.activeReclamations = e.activeReclamations.map((r) =>
        r.plotId === plotId ? { ...r, paused: !r.paused } : r
      );
      return { ...prev, districtExpansion: e };
    });
  }

  function cancelReclamation(plotId: string) {
    const plot = RECLAIMABLE_PLOTS.find((p) => p.id === plotId);
    showModal("CANCEL RECLAMATION", `Abort reclamation of ${plot?.name ?? plotId}? No refunds will be issued.`, [
      { text: "KEEP", onPress: hideModal },
      {
        text: "ABORT",
        style: "destructive",
        onPress: () => {
          setState((prev) => {
            const e = prev.districtExpansion ? { ...prev.districtExpansion } : initExpansionState();
            e.activeReclamations = e.activeReclamations.filter((r) => r.plotId !== plotId);
            return { ...prev, districtExpansion: e };
          });
          hideModal();
        },
      },
    ]);
  }

  function toggleAutoDev() {
    setState((prev) => {
      const e = prev.districtExpansion ? { ...prev.districtExpansion } : initExpansionState();
      return { ...prev, districtExpansion: { ...e, autoDevEnabled: !e.autoDevEnabled } };
    });
  }

  function startUpgrade(dist: District) {
    const currentTier = (exp.districtTiers[dist.id] ?? 0) as number;
    const nextTier = (currentTier + 1) as DistrictUpgradeTier;
    if (nextTier > maxTier || nextTier > 5) {
      showModal("MAX TIER", `${dist.name} cannot be upgraded further with current technology.`, [
        { text: "DISMISS", onPress: hideModal },
      ]);
      return;
    }
    const alreadyUpgrading = exp.activeUpgrades.some((u) => u.districtId === dist.id);
    if (alreadyUpgrading) {
      showModal("ALREADY UPGRADING", `${dist.name} is already being upgraded.`, [
        { text: "DISMISS", onPress: hideModal },
      ]);
      return;
    }
    const cost = UPGRADE_TIER_COSTS[nextTier];
    const adjCredits = Math.floor(cost.credits * upgradeCostMult);
    const adjSteel = Math.floor(cost.steel * upgradeCostMult);
    const adjGoods = Math.floor(cost.goods * upgradeCostMult);
    if (!canAffordUpgrade(state.resources, nextTier, upgradeCostMult)) {
      showModal("INSUFFICIENT RESOURCES", `Cannot afford Tier ${nextTier} upgrade.\n\nCost: ${adjCredits.toLocaleString()}cr, ${adjSteel}st, ${adjGoods}gd`, [
        { text: "DISMISS", onPress: hideModal },
      ]);
      return;
    }
    const bonuses = UPGRADE_TIER_BONUSES[nextTier];
    const bonusText = Object.entries(bonuses)
      .map(([k, v]) => `${k}: ${(v as number) > 0 ? "+" : ""}${v}`)
      .join(", ");

    showModal("UPGRADE DISTRICT", `Upgrade ${dist.name} to ${UPGRADE_TIER_LABELS[nextTier]}?\n\nCost: ${adjCredits.toLocaleString()}cr, ${adjSteel}st, ${adjGoods}gd\nDuration: ~${UPGRADE_TIER_TICKS[nextTier]} ticks\nBonuses: ${bonusText}`, [
      { text: "CANCEL", onPress: hideModal },
      {
        text: "UPGRADE",
        onPress: () => {
          setState((prev) => {
            const e = prev.districtExpansion ? { ...prev.districtExpansion } : initExpansionState();
            const res = { ...prev.resources };
            res.credits -= adjCredits;
            res.steel -= adjSteel;
            res.goods -= adjGoods;
            e.activeUpgrades = [
              ...e.activeUpgrades,
              { districtId: dist.id, targetTier: nextTier, ticksElapsed: 0, ticksRequired: UPGRADE_TIER_TICKS[nextTier] },
            ];
            return { ...prev, resources: res, districtExpansion: e };
          });
          hideModal();
        },
      },
    ]);
  }

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: "reclaim", label: "RECLAIM", icon: "map-pin" },
    { id: "upgrade", label: "UPGRADE", icon: "trending-up" },
    { id: "log", label: "LOG", icon: "file-text" },
  ];

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <GameModal {...modal} onDismiss={hideModal} />

      <SectionHeader title="DISTRICT EXPANSION" subtitle={`${exp.totalReclaimed} reclaimed · ${exp.activeReclamations.length} active · ${state.districts.length} districts`} />

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{available.length}</Text>
          <Text style={styles.statLabel}>AVAILABLE</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{exp.activeReclamations.length}</Text>
          <Text style={styles.statLabel}>IN PROGRESS</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{exp.completedPlotIds.length}</Text>
          <Text style={styles.statLabel}>COMPLETED</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{exp.activeUpgrades.length}</Text>
          <Text style={styles.statLabel}>UPGRADING</Text>
        </View>
      </View>

      <View style={styles.autoDevRow}>
        <View style={styles.autoDevLabel}>
          <Feather name="repeat" size={14} color={Colors.accent} />
          <Text style={styles.autoDevText}>AUTO-DEVELOP</Text>
        </View>
        <Switch
          value={exp.autoDevEnabled}
          onValueChange={toggleAutoDev}
          trackColor={{ false: Colors.bgCard, true: Colors.accent }}
          thumbColor={exp.autoDevEnabled ? Colors.text : Colors.textMuted}
          accessibilityLabel="Toggle auto-develop districts"
        />
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}>
            <Feather name={t.icon as any} size={13} color={tab === t.id ? Colors.accent : Colors.textMuted} />
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {tab === "reclaim" && (
          <>
            {exp.activeReclamations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ACTIVE RECLAMATION</Text>
                {exp.activeReclamations.map((rec) => {
                  const plot = RECLAIMABLE_PLOTS.find((p) => p.id === rec.plotId);
                  if (!plot) return null;
                  const phase = plot.phases[rec.currentPhaseIndex];
                  const progress = phase ? rec.ticksElapsed / phase.ticksRequired : 0;
                  return (
                    <View key={rec.plotId} style={styles.card}>
                      <View style={styles.cardHeader}>
                        <View style={[styles.contaminationBadge, { backgroundColor: CONTAMINATION_COLORS[plot.contaminationType] + "22", borderColor: CONTAMINATION_COLORS[plot.contaminationType] }]}>
                          <Text style={[styles.contaminationText, { color: CONTAMINATION_COLORS[plot.contaminationType] }]}>
                            {CONTAMINATION_LABELS[plot.contaminationType]}
                          </Text>
                        </View>
                        <Text style={styles.cardTitle}>{plot.name}</Text>
                        {rec.paused && <Text style={styles.pausedBadge}>PAUSED</Text>}
                      </View>
                      <Text style={styles.cardSubtitle}>{phase?.label ?? "Complete"} — Phase {rec.currentPhaseIndex + 1}/{plot.phases.length}</Text>
                      <View style={styles.progressWrap}>
                        <View style={styles.progressBg}>
                          <View style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
                        </View>
                        <Text style={styles.progressText}>{Math.floor(progress * 100)}%</Text>
                      </View>
                      <View style={styles.phaseRow}>
                        {plot.phases.map((ph, i) => (
                          <View key={ph.id} style={[styles.phaseIndicator, i < rec.currentPhaseIndex && styles.phaseComplete, i === rec.currentPhaseIndex && styles.phaseCurrent]}>
                            <Text style={[styles.phaseIndicatorText, (i <= rec.currentPhaseIndex) && styles.phaseIndicatorTextActive]}>
                              {i + 1}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.cardActions}>
                        <Pressable onPress={() => togglePause(rec.plotId)} style={styles.actionBtn}>
                          <Feather name={rec.paused ? "play" : "pause"} size={12} color={Colors.accent} />
                          <Text style={styles.actionText}>{rec.paused ? "RESUME" : "PAUSE"}</Text>
                        </Pressable>
                        <Pressable onPress={() => cancelReclamation(rec.plotId)} style={[styles.actionBtn, styles.actionBtnDanger]}>
                          <Feather name="x" size={12} color={Colors.danger} />
                          <Text style={[styles.actionText, styles.actionTextDanger]}>ABORT</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AVAILABLE PLOTS ({available.length})</Text>
              {available.length === 0 && (
                <Text style={styles.emptyText}>No plots available right now.{"\n\n"}HOW TO UNLOCK:{"\n"}• Complete active reclamation projects{"\n"}• Research expansion technologies (City Planning tree){"\n"}• Increase population to trigger new zone surveys{"\n"}• Establish control over contested combat zones</Text>
              )}
              {available.map((plot) => {
                const isExpanded = expandedPlotId === plot.id;
                return (
                  <Pressable key={plot.id} onPress={() => setExpandedPlotId(isExpanded ? null : plot.id)}>
                    <View style={styles.card}>
                      <View style={styles.cardHeader}>
                        <View style={[styles.contaminationBadge, { backgroundColor: CONTAMINATION_COLORS[plot.contaminationType] + "22", borderColor: CONTAMINATION_COLORS[plot.contaminationType] }]}>
                          <Text style={[styles.contaminationText, { color: CONTAMINATION_COLORS[plot.contaminationType] }]}>
                            {CONTAMINATION_LABELS[plot.contaminationType]}
                          </Text>
                        </View>
                        <Text style={styles.cardTitle}>{plot.name}</Text>
                        <View style={styles.severityWrap}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <View key={i} style={[styles.severityDot, i < plot.severity && styles.severityDotActive]} />
                          ))}
                        </View>
                      </View>
                      <Text style={styles.cardSubtitle}>{plot.subtitle}</Text>
                      <Text style={styles.cardCategory}>→ {CATEGORY_LABELS[plot.targetCategory]}</Text>

                      {isExpanded && (
                        <View style={styles.expandedContent}>
                          <Text style={styles.descText}>{plot.description}</Text>

                          <Text style={styles.phasesHeader}>RECLAMATION PHASES</Text>
                          {plot.phases.map((phase, i) => (
                            <View key={phase.id} style={styles.phaseDetail}>
                              <Text style={styles.phaseNum}>{i + 1}.</Text>
                              <View style={styles.phaseInfo}>
                                <Text style={styles.phaseName}>{phase.label}</Text>
                                <Text style={styles.phaseCost}>
                                  {phase.cost.credits.toLocaleString()}cr · {phase.cost.steel}st · {phase.cost.fuel}fu · {phase.cost.goods}gd
                                </Text>
                                <Text style={styles.phaseDuration}>~{phase.ticksRequired} ticks</Text>
                              </View>
                            </View>
                          ))}

                          <Text style={styles.resultHeader}>RESULT DISTRICT</Text>
                          <View style={styles.resultStats}>
                            <StatBar label="Pop" value={plot.resultDistrict.population} max={20000} />
                            <StatBar label="Wealth" value={plot.resultDistrict.wealth} max={100} />
                            <StatBar label="Industry" value={plot.resultDistrict.industrialOutput} max={100} />
                            <StatBar label="Defense" value={plot.resultDistrict.defenseRating} max={100} />
                            <StatBar label="Crime" value={plot.resultDistrict.crime} max={100} invertColor />
                          </View>

                          <Pressable onPress={() => startReclamation(plot)} style={styles.startBtn}>
                            <MaterialCommunityIcons name="hammer-wrench" size={14} color={Colors.bg} />
                            <Text style={styles.startBtnText}>BEGIN RECLAMATION</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {exp.completedPlotIds.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>COMPLETED ({exp.completedPlotIds.length})</Text>
                {exp.completedPlotIds.map((id) => {
                  const plot = RECLAIMABLE_PLOTS.find((p) => p.id === id);
                  if (!plot) return null;
                  return (
                    <View key={id} style={[styles.card, styles.cardComplete]}>
                      <View style={styles.cardHeader}>
                        <Feather name="check-circle" size={14} color={Colors.accent} />
                        <Text style={styles.cardTitle}>{plot.name}</Text>
                      </View>
                      <Text style={styles.cardCategory}>→ {CATEGORY_LABELS[plot.targetCategory]}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {tab === "upgrade" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DISTRICT UPGRADES (Max: Tier {maxTier})</Text>
            <Text style={styles.sectionSubtitle}>Upgrade existing districts to improve their stats. Higher tiers require specific technologies.</Text>

            {exp.activeUpgrades.length > 0 && (
              <View style={styles.upgradeActive}>
                <Text style={styles.upgradeActiveTitle}>UPGRADING</Text>
                {exp.activeUpgrades.map((u) => {
                  const dist = state.districts.find((d) => d.id === u.districtId);
                  const progress = u.ticksElapsed / u.ticksRequired;
                  return (
                    <View key={u.districtId} style={styles.card}>
                      <Text style={styles.cardTitle}>{dist?.name ?? u.districtId}</Text>
                      <Text style={styles.cardSubtitle}>→ {UPGRADE_TIER_LABELS[u.targetTier]}</Text>
                      <View style={styles.progressWrap}>
                        <View style={styles.progressBg}>
                          <View style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
                        </View>
                        <Text style={styles.progressText}>{Math.floor(progress * 100)}%</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {state.districts.map((dist) => {
              const currentTier = (exp.districtTiers[dist.id] ?? 0) as number;
              const nextTier = currentTier + 1;
              const isUpgrading = exp.activeUpgrades.some((u) => u.districtId === dist.id);
              const canUpgrade = nextTier <= maxTier && nextTier <= 5 && !isUpgrading;
              const cost = nextTier <= 5 ? UPGRADE_TIER_COSTS[nextTier as DistrictUpgradeTier] : null;
              return (
                <View key={dist.id} style={styles.upgradeRow}>
                  <View style={styles.upgradeInfo}>
                    <Text style={styles.upgradeName}>{dist.name}</Text>
                    <Text style={styles.upgradeTier}>
                      {currentTier > 0 ? `Tier ${currentTier}` : "Base"} · Pop {dist.population.toLocaleString()} · W{dist.wealth} · I{dist.industrialOutput}
                    </Text>
                  </View>
                  {isUpgrading ? (
                    <View style={styles.upgradeBtnDisabled}>
                      <Text style={styles.upgradeBtnTextDisabled}>UPGRADING</Text>
                    </View>
                  ) : canUpgrade && cost ? (
                    <Pressable onPress={() => startUpgrade(dist)} style={styles.upgradeBtn}>
                      <Text style={styles.upgradeBtnText}>T{nextTier} · {Math.floor(cost.credits * upgradeCostMult).toLocaleString()}cr</Text>
                    </Pressable>
                  ) : currentTier >= maxTier || currentTier >= 5 ? (
                    <View style={styles.upgradeBtnMax}>
                      <Text style={styles.upgradeBtnTextMax}>MAX</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {tab === "log" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>EXPANSION LOG</Text>
            {exp.expansionLog.length === 0 && (
              <Text style={styles.emptyText}>No expansion activity recorded yet. Start reclaiming wasteland plots from the Plots tab to begin logging construction progress here.</Text>
            )}
            {[...exp.expansionLog].reverse().map((entry, i) => (
              <View key={i} style={styles.logEntry}>
                <Text style={styles.logTick}>T{entry.tick}</Text>
                <Text style={styles.logMessage}>{entry.message}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  statsRow: { flexDirection: "row", paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  statBox: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 4, padding: 8, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  statValue: { color: Colors.accent, fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { color: Colors.textMuted, fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, marginTop: 2 },
  autoDevRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.bgCard, marginHorizontal: 12, borderRadius: 4, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  autoDevLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  autoDevText: { color: Colors.text, fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  tabRow: { flexDirection: "row", paddingHorizontal: 12, gap: 4, marginBottom: 8 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, backgroundColor: Colors.bgCard, borderRadius: 4, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  tabText: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  tabTextActive: { color: Colors.accent },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingBottom: 100 },
  section: { marginBottom: 20 },
  sectionTitle: { color: Colors.accent, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 2, marginBottom: 8 },
  sectionSubtitle: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 12, lineHeight: 15 },
  card: { backgroundColor: Colors.bgCard, borderRadius: 4, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  cardComplete: { borderColor: Colors.accent + "40", opacity: 0.7 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { color: Colors.text, fontSize: 12, fontFamily: "Inter_700Bold", flex: 1 },
  cardSubtitle: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 4 },
  cardCategory: { color: Colors.accent, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  contaminationBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  contaminationText: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  severityWrap: { flexDirection: "row", gap: 3 },
  severityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border },
  severityDotActive: { backgroundColor: "#E74C3C", borderColor: "#E74C3C" },
  pausedBadge: { color: "#FF9500", fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 1, backgroundColor: "#FF950015", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  expandedContent: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  descText: { color: Colors.textSecondary, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, marginBottom: 12 },
  phasesHeader: { color: Colors.accent, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2, marginBottom: 8 },
  phaseDetail: { flexDirection: "row", gap: 8, marginBottom: 8 },
  phaseNum: { color: Colors.accent, fontSize: 11, fontFamily: "Inter_700Bold", width: 16 },
  phaseInfo: { flex: 1 },
  phaseName: { color: Colors.text, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  phaseCost: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  phaseDuration: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular" },
  resultHeader: { color: Colors.accent, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2, marginBottom: 8, marginTop: 8 },
  resultStats: { gap: 4, marginBottom: 12 },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.accent, paddingVertical: 10, borderRadius: 4 },
  startBtnText: { color: Colors.bg, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 6 },
  progressBg: { flex: 1, height: 6, backgroundColor: Colors.bgSecondary, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 3 },
  progressText: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_600SemiBold", width: 30, textAlign: "right" },
  phaseRow: { flexDirection: "row", gap: 6, marginVertical: 6 },
  phaseIndicator: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.bgSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  phaseComplete: { backgroundColor: Colors.accent + "30", borderColor: Colors.accent },
  phaseCurrent: { backgroundColor: Colors.accent + "20", borderColor: Colors.accent, borderWidth: 2 },
  phaseIndicatorText: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_700Bold" },
  phaseIndicatorTextActive: { color: Colors.accent },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.bgSecondary, borderRadius: 3, borderWidth: 1, borderColor: Colors.border },
  actionBtnDanger: { borderColor: Colors.danger + "40" },
  actionText: { color: Colors.accent, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  actionTextDanger: { color: Colors.danger },
  upgradeRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bgCard, borderRadius: 4, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: Colors.border },
  upgradeInfo: { flex: 1 },
  upgradeName: { color: Colors.text, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  upgradeTier: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  upgradeBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.accent + "20", borderRadius: 3, borderWidth: 1, borderColor: Colors.accent },
  upgradeBtnText: { color: Colors.accent, fontSize: 9, fontFamily: "Inter_700Bold" },
  upgradeBtnDisabled: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.bgSecondary, borderRadius: 3 },
  upgradeBtnTextDisabled: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_600SemiBold" },
  upgradeBtnMax: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.accent + "10", borderRadius: 3 },
  upgradeBtnTextMax: { color: Colors.accent, fontSize: 9, fontFamily: "Inter_700Bold", opacity: 0.5 },
  upgradeActive: { marginBottom: 16 },
  upgradeActiveTitle: { color: Colors.accent, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2, marginBottom: 8 },
  logEntry: { flexDirection: "row", gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  logTick: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_600SemiBold", width: 50 },
  logMessage: { color: Colors.textSecondary, fontSize: 10, fontFamily: "Inter_400Regular", flex: 1 },
  emptyText: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic", textAlign: "center", paddingVertical: 20 },
}));

export default withScreenBoundary(ExpansionScreen, "expansion");

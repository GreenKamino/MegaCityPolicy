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

import GameModal from "@/components/GameModal";
import SectionHeader from "@/components/SectionHeader";
import TrainingBoostBanner from "@/components/TrainingBoostBanner";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { UNIT_CATEGORIES, getUnitCategoryNames } from "@/engine/contracts";
import { getConstructionTicks, getTrainingSpeedReduction, getTrainingSpeedSourcesLabel } from "@/engine/pendingConstruction";
import { getClassDef, type TroopClassId } from "@/engine/retinueData";
import { getUnitRole, isUnitRole, UNIT_ROLE_ORDER, type UnitRole } from "@/engine/unitRoles";
import { getEffectiveMode } from "@/engine/autoManagers";
import { useGame } from "@/context/GameContext";
import { computeUnitUpkeep } from "@/engine/economyBreakdown";
import { useGameModal } from "@/hooks/useGameModal";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";

const CATEGORY_ICONS: Record<string, string> = {
  "Street Law": "shield",
  "Riot & Crowd Control": "alert-octagon",
  "Specialist Law": "crosshair",
  "Investigation": "search",
  "Surveillance": "eye",
  "Vehicle Fleet": "truck",
  "Air Support": "navigation",
  "Heavy Armor": "target",
  "Support & Logistics": "package",
  "Naval & Maritime": "anchor",
  "Black Ops": "eye-off",
  "Intelligence": "radio",
  "Border & Wasteland": "map",
  "Space Navy": "globe",
  "Rapid Response": "zap",
  "Mutant Ops": "alert-triangle",
  "Cyber Division": "cpu",
  "Propaganda & Morale": "volume-2",
  "Emergency Services": "activity",
  "Medical Corps": "heart",
};

function RecruitmentScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state: rawState, hireUnit, dismissUnit } = useGame();
  const state = useThrottledValue(rawState, 500);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { modal, showModal, hideModal } = useGameModal();

  const categoryNames = useMemo(() => getUnitCategoryNames(), []);
  const [selectedCategory, setSelectedCategory] = useState(categoryNames[0]);
  const [selectedRole, setSelectedRole] = useState<UnitRole | "ALL">("ALL");
  const tabScrollRef = useHorizontalWheelScroll();
  const roleScrollRef = useHorizontalWheelScroll();

  const filteredUnits = useMemo(
    () => UNIT_CATEGORIES.filter(
      (u) =>
        u.category === selectedCategory &&
        (selectedRole === "ALL" || getUnitRole(u) === selectedRole),
    ),
    [selectedCategory, selectedRole]
  );

  // Task #528: overall training-speed reduction (facilities + doctrine),
  // shown as a "boosted" chip on discounted unit cards.
  const trainingReduction = getTrainingSpeedReduction(state);

  // Task #473: show the exact engine charge (difficulty-adjusted) so this
  // header matches the Economy tab and the actual tick deduction.
  const totalUpkeep = useMemo(
    () => computeUnitUpkeep(state.units, state.difficulty),
    [state.units, state.difficulty]
  );

  const totalPersonnel = useMemo(() => {
    let total = 0;
    for (const def of UNIT_CATEGORIES) {
      total += state.units[def.key] ?? 0;
    }
    return total;
  }, [state.units]);

  // Task #524: hires enter a training queue instead of arriving
  // instantly. Aggregate in-flight orders per unit key so each card can
  // show how many are in training and the longest remaining timer.
  const pendingByUnit = useMemo(() => {
    const map: Record<string, { count: number; ticks: number; battlefieldRole?: UnitRole }> = {};
    for (const o of state.pendingConstructions ?? []) {
      if (o.kind !== "unit") continue;
      const cur = map[o.buildingKey];
      map[o.buildingKey] = {
        count: (cur?.count ?? 0) + o.count,
        ticks: Math.max(cur?.ticks ?? 0, o.ticksRemaining),
        battlefieldRole: cur?.battlefieldRole
          ?? (isUnitRole(o.battlefieldRole) ? o.battlefieldRole : undefined),
      };
    }
    return map;
  }, [state.pendingConstructions]);

  const handleHire = (def: typeof UNIT_CATEGORIES[0]) => {
    const totalCost = def.hireCost * def.hireBatch;
    if (state.resources.credits < totalCost) {
      showModal("INSUFFICIENT FUNDS", `Hiring ${def.hireBatch}x ${def.label} costs ${totalCost.toLocaleString()} credits.`, [
        { text: "OK", style: "cancel" },
      ]);
      return;
    }
    const ok = hireUnit(def.key, totalCost, def.hireBatch);
    if (!ok) {
      showModal("HIRE FAILED", "Insufficient funds.", [{ text: "OK", style: "cancel" }]);
    } else {
      const ticks = getConstructionTicks("unit", def.key, undefined, state);
      const reduction = getTrainingSpeedReduction(state);
      const sources = getTrainingSpeedSourcesLabel(state);
      const speedNote = reduction > 0 && sources
        ? ` ${sources === "Accelerated Training Doctrine" ? "The Accelerated Training Doctrine cut" : sources === "training facilities" ? "Training facilities cut" : "Training facilities + the Accelerated Training Doctrine cut"} the program by ${Math.round(reduction * 100)}%.`
        : "";
      showModal(
        "TRAINING ORDERED",
        `${def.hireBatch}x ${def.label} entered training. Ready for duty in ${ticks} tick${ticks === 1 ? "" : "s"}.${speedNote}`,
        [{ text: "OK", style: "cancel" }],
      );
    }
  };

  const handleDismiss = (def: typeof UNIT_CATEGORIES[0]) => {
    const current = state.units[def.key] ?? 0;
    const batch = Math.min(def.hireBatch, current);
    if (batch <= 0) {
      showModal("NONE AVAILABLE", `No ${def.label} to dismiss.`, [{ text: "OK", style: "cancel" }]);
      return;
    }
    const refund = def.dismissRefund * batch;
    showModal(
      `DISMISS: ${def.label}`,
      `Dismiss ${batch} units?\nRefund: ${refund.toLocaleString()} credits`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "DISMISS",
          style: "destructive",
          onPress: () => dismissUnit(def.key, refund, batch),
        },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="users" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>RECRUITMENT & PERSONNEL</Text>
      </View>

      <View style={styles.summaryBar}>
        <SummaryCell label="PERSONNEL" value={totalPersonnel.toLocaleString()} color={Colors.text} />
        <View style={styles.sumDiv} />
        <SummaryCell label="UPKEEP/TICK" value={`-${totalUpkeep.toLocaleString()}`} color={Colors.danger} />
        <View style={styles.sumDiv} />
        <SummaryCell label="TREASURY" value={`${Math.floor(state.resources.credits).toLocaleString()}`} color={Colors.accent} />
      </View>

      <AutoRecruitPanel />

      {/* Task #533: persistent boost indicator visible before opening
          any order dialog; names the active source(s). */}
      <TrainingBoostBanner state={state} />

      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === "web"}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContainer}
      >
        {categoryNames.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setSelectedCategory(cat)}
            style={[styles.tab, selectedCategory === cat && styles.tabActive]}
          >
            <Feather name={(CATEGORY_ICONS[cat] ?? "users") as any} size={10} color={selectedCategory === cat ? Colors.bg : Colors.textMuted} />
            <Text style={[styles.tabText, selectedCategory === cat && styles.tabTextActive]}>
              {cat.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.roleFilterBar}>
        <Text style={styles.filterLabel}>ROLE</Text>
        <ScrollView
          ref={roleScrollRef}
          horizontal
          showsHorizontalScrollIndicator={Platform.OS === "web"}
          style={styles.roleScroll}
          contentContainerStyle={styles.roleContainer}
        >
          <Pressable
            onPress={() => setSelectedRole("ALL")}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedRole === "ALL" }}
            style={[styles.roleChip, selectedRole === "ALL" && styles.roleChipActive]}
          >
            <Text style={[styles.roleChipText, selectedRole === "ALL" && styles.roleChipTextActive]}>
              ALL ROLES
            </Text>
          </Pressable>
          {UNIT_ROLE_ORDER.map((role) => (
            <Pressable
              key={role}
              onPress={() => setSelectedRole(role)}
              accessibilityRole="tab"
              accessibilityLabel={`Filter recruits by ${role.toLowerCase()}`}
              accessibilityState={{ selected: selectedRole === role }}
              style={[styles.roleChip, selectedRole === role && styles.roleChipActive]}
            >
              <Text style={[styles.roleChipText, selectedRole === role && styles.roleChipTextActive]}>
                {role}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SectionHeader title={selectedCategory} icon={<MaterialCommunityIcons name="account-group-outline" size={14} color={Colors.accent} />} />

        {filteredUnits.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="filter" size={16} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>
              NO {selectedRole === "ALL" ? "" : `${selectedRole} `}RECRUITS IN THIS CATEGORY
            </Text>
          </View>
        )}

        {filteredUnits.map((def) => {
          const count = state.units[def.key] ?? 0;
          const unitRole = getUnitRole(def);
          const canAfford = state.resources.credits >= def.hireCost * def.hireBatch;
          const canDismiss = count >= def.hireBatch;
          // Task #528: surface the (possibly discounted) training time on the
          // card itself, not just in the confirmation modal. Compare against
          // the undiscounted base so the min-1-tick clamp doesn't falsely
          // mark an unchanged time as boosted.
          const trainTicks = getConstructionTicks("unit", def.key, undefined, state);
          const baseTrainTicks = getConstructionTicks("unit", def.key);
          const trainBoosted = trainTicks < baseTrainTicks;

          return (
            <View key={def.key} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{def.label}</Text>
                  <Text style={styles.cardDesc}>{def.description}</Text>
                  {unitRole && <Text style={styles.cardRole}>ROLE · {unitRole}</Text>}
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{count}</Text>
                </View>
              </View>

              {pendingByUnit[def.key] && (
                <View style={[styles.trainingRow, { borderColor: Colors.warning + "55", backgroundColor: Colors.warning + "14" }]}>
                  <Feather name="clock" size={10} color={Colors.warning} />
                  <Text style={[styles.trainingText, { color: Colors.warning }]}>
                    {pendingByUnit[def.key].count} IN TRAINING · READY IN {pendingByUnit[def.key].ticks} TICK{pendingByUnit[def.key].ticks === 1 ? "" : "S"}
                    {" · "}ROLE · {pendingByUnit[def.key].battlefieldRole ?? unitRole ?? "UNASSIGNED"}
                  </Text>
                </View>
              )}

              <View style={styles.statsRow}>
                <StatPill label="HIRE COST" value={`${(def.hireCost * def.hireBatch).toLocaleString()} cr`} color={Colors.warning} />
                <StatPill label="BATCH" value={`×${def.hireBatch}`} color={Colors.text} />
                <StatPill label="UPKEEP" value={`${def.upkeepPerUnit}/unit`} color={Colors.danger} />
                <StatPill label="DISMISS" value={`+${def.dismissRefund}/unit`} color={Colors.accent} />
                <StatPill
                  label="TRAINING"
                  value={`${trainTicks} tick${trainTicks === 1 ? "" : "s"}${trainBoosted ? " ▼" : ""}`}
                  color={trainBoosted ? Colors.accent : Colors.text}
                />
                {trainBoosted && (
                  <View style={[styles.boostChip, { borderColor: Colors.accent + "66", backgroundColor: Colors.accent + "14" }]}>
                    <Feather name="zap" size={8} color={Colors.accent} />
                    <Text style={[styles.boostChipText, { color: Colors.accent }]}>
                      BOOSTED −{Math.round(trainingReduction * 100)}%
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.cardFooter}>
                <Pressable
                  onPress={() => handleDismiss(def)}
                  style={[styles.actionBtn, styles.dismissBtn, !canDismiss && styles.actionBtnDisabled]}
                  disabled={!canDismiss}
                >
                  <Feather name="minus" size={14} color={canDismiss ? Colors.danger : Colors.textMuted} />
                  <Text style={[styles.actionBtnText, { color: canDismiss ? Colors.danger : Colors.textMuted }]}>
                    DISMISS
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleHire(def)}
                  style={[styles.actionBtn, styles.hireBtn, !canAfford && styles.actionBtnDisabled]}
                  disabled={!canAfford}
                >
                  <Feather name="plus" size={14} color={canAfford ? Colors.accent : Colors.textMuted} />
                  <Text style={[styles.actionBtnText, { color: canAfford ? Colors.accent : Colors.textMuted }]}>
                    HIRE {def.hireBatch > 1 ? `×${def.hireBatch}` : ""}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <View style={{ height: 20 }} />
      </ScrollView>
      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

// AUTO-HIRE RECRUITMENT (Task #123) ────────────────────────────────
// Per-domain auto-manager panel. Mode (OFF/SUGGEST/ACT) is owned
// by Advisor Briefings (autoManagers.modes.recruit), so this panel
// only exposes the budget/target knobs and surfaces gating state
// (no Enforcer, honor-mode downgrade, current effective mode).
function AutoRecruitPanel() {
  const { colors: Colors } = useTheme();
  const arStyles = useArStyles();
  const { state, setAutoRecruitConfig, setAutoManagerMode } = useGame();
  const config = state.autoRecruit;
  const [expanded, setExpanded] = useState(false);
  const hasEnforcer = (state.innerCircle?.members ?? []).some((m) => m.role === "enforcer");
  const effectiveMode = useMemo(() => getEffectiveMode(state, "recruit"), [state]);
  const rawMode = state.autoManagers?.modes?.recruit ?? "off";
  const downgraded = rawMode === "act" && effectiveMode === "suggest";

  if (!config) return null;

  const BUDGET_OPTIONS = [500, 1000, 2000, 5000, 10000];
  const TARGET_OPTIONS = [25, 50, 75, 100];
  const ALL_CLASSES: TroopClassId[] = config.classPriority;
  // Engine blocks execution without an Enforcer; the panel mirrors that
  // by visually disabling the controls so the player understands why
  // toggling them has no effect.
  const controlsDisabled = !hasEnforcer;

  const moveClass = (classId: TroopClassId, dir: -1 | 1) => {
    if (controlsDisabled) return;
    const list = [...config.classPriority];
    const i = list.indexOf(classId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setAutoRecruitConfig({ classPriority: list });
  };

  const modeColor = effectiveMode === "act" ? Colors.accent : effectiveMode === "suggest" ? "#ffaa00" : Colors.textMuted;
  const modeLabel = effectiveMode === "act" ? "ACT" : effectiveMode === "suggest" ? "SUGGEST" : "OFF";

  return (
    <View style={arStyles.container}>
      <Pressable onPress={() => setExpanded(!expanded)} style={arStyles.header}>
        <Feather name="user-plus" size={12} color={modeColor} />
        <Text style={[arStyles.title, { color: modeColor }]}>AUTO-HIRE: ENFORCER PROTOCOL</Text>
        <View style={[arStyles.modePill, { borderColor: modeColor }]}>
          <Text style={[arStyles.modeText, { color: modeColor }]}>{modeLabel}</Text>
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={12} color={Colors.textMuted} />
      </Pressable>
      {expanded && (
        <View style={arStyles.body}>
          {!hasEnforcer && (
            <Text style={arStyles.warn}>
              Inner Circle: appoint an Enforcer to authorize auto-hire.
              Mode and configuration are locked until an Enforcer is in post.
            </Text>
          )}
          {hasEnforcer && downgraded && (
            <Text style={arStyles.warn}>
              Honor Mode active — ACT downgraded to SUGGEST. Proposals will
              appear in Advisor Briefings for your approval.
            </Text>
          )}
          <Text style={arStyles.sectionLabel}>MODE</Text>
          <View style={arStyles.row}>
            {(["off", "suggest", "act"] as const).map((m) => {
              // OFF stays interactive even without an Enforcer so the player
              // can disable a previously-set ACT/SUGGEST mode without
              // re-appointing first. SUGGEST/ACT remain gated on Enforcer.
              const btnDisabled = controlsDisabled && m !== "off";
              return (
                <Pressable
                  key={m}
                  disabled={btnDisabled}
                  style={[arStyles.btn, rawMode === m && arStyles.btnActive, btnDisabled && arStyles.disabledRow]}
                  onPress={() => setAutoManagerMode("recruit", m)}
                >
                  <Text style={[arStyles.btnText, rawMode === m && arStyles.btnTextActive]}>
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={arStyles.sectionLabel}>BUDGET PER TICK (CREDITS)</Text>
          <View style={[arStyles.row, controlsDisabled && arStyles.disabledRow]}>
            {BUDGET_OPTIONS.map((amt) => (
              <Pressable
                key={amt}
                disabled={controlsDisabled}
                style={[arStyles.btn, config.budgetPerTick === amt && arStyles.btnActive]}
                onPress={() => setAutoRecruitConfig({ budgetPerTick: amt })}
              >
                <Text style={[arStyles.btnText, config.budgetPerTick === amt && arStyles.btnTextActive]}>
                  {amt >= 1000 ? `${amt / 1000}k` : amt}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={arStyles.sectionLabel}>TARGET RETINUE STRENGTH</Text>
          <View style={[arStyles.row, controlsDisabled && arStyles.disabledRow]}>
            {TARGET_OPTIONS.map((n) => (
              <Pressable
                key={n}
                disabled={controlsDisabled}
                style={[arStyles.btn, config.targetStrengthPercent === n && arStyles.btnActive]}
                onPress={() => setAutoRecruitConfig({ targetStrengthPercent: n })}
              >
                <Text style={[arStyles.btnText, config.targetStrengthPercent === n && arStyles.btnTextActive]}>{n}%</Text>
              </Pressable>
            ))}
          </View>
          <Text style={arStyles.sectionLabel}>CLASS PRIORITY (REORDER)</Text>
          {ALL_CLASSES.map((classId, idx) => {
            const def = getClassDef(classId);
            if (!def) return null;
            return (
              <View key={classId} style={arStyles.classRow}>
                <Text style={arStyles.classRank}>{idx + 1}.</Text>
                <Text style={arStyles.className}>{def.name}</Text>
                <Text style={arStyles.classCost}>{def.recruitCost.toLocaleString()}cr</Text>
                <Pressable disabled={controlsDisabled || idx === 0} onPress={() => moveClass(classId, -1)} style={[arStyles.arrowBtn, (controlsDisabled || idx === 0) && arStyles.arrowBtnDisabled]} accessibilityRole="button" accessibilityLabel={`Move ${def.name} up in priority`}>
                  <Feather name="chevron-up" size={12} color={controlsDisabled || idx === 0 ? Colors.border : Colors.accent} />
                </Pressable>
                <Pressable disabled={controlsDisabled || idx === ALL_CLASSES.length - 1} onPress={() => moveClass(classId, 1)} style={[arStyles.arrowBtn, (controlsDisabled || idx === ALL_CLASSES.length - 1) && arStyles.arrowBtnDisabled]} accessibilityRole="button" accessibilityLabel={`Move ${def.name} down in priority`}>
                  <Feather name="chevron-down" size={12} color={controlsDisabled || idx === ALL_CLASSES.length - 1 ? Colors.border : Colors.accent} />
                </Pressable>
              </View>
            );
          })}
          <Text style={arStyles.hint}>
            Auto-hire fills empty squad slots first, then floats new recruits as
            reserves. Hires fire every tick while below target.
          </Text>
        </View>
      )}
    </View>
  );
}

const useArStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: { borderBottomWidth: 1, borderBottomColor: Colors.borderDim },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.bgSecondary },
  title: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 },
  modePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  modeText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  body: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.bgCard },
  sectionLabel: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 1.5, marginBottom: 6, marginTop: 8 },
  row: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  btn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 3, borderWidth: 1, borderColor: Colors.border },
  btnActive: { backgroundColor: Colors.accent + "20", borderColor: Colors.accent },
  btnText: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 10 },
  btnTextActive: { color: Colors.accent },
  classRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderDim },
  classRank: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 10, width: 22 },
  className: { flex: 1, color: Colors.text, fontFamily: "Inter_400Regular", fontSize: 11 },
  classCost: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, marginRight: 6 },
  arrowBtn: { padding: 4, borderWidth: 1, borderColor: Colors.border, borderRadius: 3 },
  arrowBtnDisabled: { borderColor: Colors.borderDim },
  disabledRow: { opacity: 0.4 },
  warn: { color: "#ffaa00", fontFamily: "Inter_400Regular", fontSize: 10, marginBottom: 6, lineHeight: 14 },
  hint: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 8, lineHeight: 14, fontStyle: "italic" },
}));

function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  const sumStyles = useSumStyles();
  return (
    <View style={sumStyles.cell}>
      <Text style={sumStyles.label}>{label}</Text>
      <Text style={[sumStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  const spStyles = useSpStyles();
  return (
    <View style={spStyles.pill}>
      <Text style={spStyles.label}>{label}</Text>
      <Text style={[spStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

const useSumStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  cell: { flex: 1, alignItems: "center", paddingVertical: 8 },
  label: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" },
  value: { fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 1 },
}));

const useSpStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  pill: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: "center",
  },
  label: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 8, letterSpacing: 0.5 },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 10, marginTop: 1 },
}));

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
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5 },

  summaryBar: {
    flexDirection: "row",
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderBright,
  },
  sumDiv: { width: 1, backgroundColor: Colors.border, marginVertical: 8 },

  tabScroll: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
    maxHeight: 44,
  },
  tabContainer: {
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.accentDark,
    borderColor: Colors.accent,
  },
  tabText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  tabTextActive: { color: Colors.accent },

  roleFilterBar: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
    paddingLeft: 12,
  },
  filterLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
    marginRight: 8,
  },
  roleScroll: {
    flex: 1,
    maxHeight: 36,
  },
  roleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 12,
    paddingVertical: 5,
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleChipActive: {
    backgroundColor: Colors.accentDark,
    borderColor: Colors.accent,
  },
  roleChipText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.35,
  },
  roleChipTextActive: { color: Colors.accent },

  scroll: { flex: 1 },
  content: { padding: 14 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 36,
  },
  emptyStateText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
    textAlign: "center",
  },

  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
  },

  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  cardInfo: { flex: 1, minWidth: 0, marginRight: 10 },
  cardName: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    marginBottom: 3,
  },
  cardDesc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  cardRole: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
    marginTop: 5,
  },
  countBadge: {
    backgroundColor: Colors.accentDark,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
  },
  countText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },

  trainingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  trainingText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.5,
  },

  boostChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: "center",
  },
  boostChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.5,
  },

  statsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 10,
  },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
  },
  hireBtn: {
    backgroundColor: "rgba(0,255,65,0.06)",
    borderColor: Colors.accent,
  },
  dismissBtn: {
    backgroundColor: "rgba(255,59,48,0.06)",
    borderColor: Colors.danger,
  },
  actionBtnDisabled: {
    backgroundColor: Colors.bg,
    borderColor: Colors.border,
  },
  actionBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
}));

export default withScreenBoundary(RecruitmentScreen, "recruitment");

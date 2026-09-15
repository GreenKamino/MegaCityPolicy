import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import TutorialHint from "@/components/TutorialHint";
import OnboardingBanner from "@/components/OnboardingBanner";
import MenuButton from "@/components/MenuButton";
import ResourceRow from "@/components/ResourceRow";
import SectionHeader from "@/components/SectionHeader";
import StatBar from "@/components/StatBar";
import TrainingBoostBanner from "@/components/TrainingBoostBanner";
import LabourDayBoosterBanner from "@/components/LabourDayBoosterBanner";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { EDICTS, ALL_EDICTS, getEdictById, type EdictDef } from "@/engine/edicts";
import { formatActionCostTimingSummary, getEdictCostTiming, getPolicyCostTiming } from "@/engine/actionCostTiming";
import { computeCrimeBreakdown } from "@/engine/crimeBreakdown";
import { getConstructionTicks, getTrainingSpeedReduction, getTrainingSpeedSourcesLabel } from "@/engine/pendingConstruction";
import { isCrimeSuggestionNavigable, navigateToCrimeSuggestion } from "@/utils/crimeNavigation";
import { getFactionName } from "@/engine/displayNames";
import { isBigBrotherActive } from "@/engine/addons/bigBrother";
import { GANGS, GANGS_BY_TYPE, GANG_TYPE_LABELS, getGangThreatColor, type GangDef, type GangType } from "@/engine/gangs";
import { useGameModal } from "@/hooks/useGameModal";
import { formatCredits, formatNumber } from "@/utils/format";
import { LAW_OPERATION_SUCCESS_CHANCE, type LawMissionDef } from "@/engine/lawOpsData";
import ActionCostTimingReadout from "@/components/ActionCostTimingReadout";
import type { ActiveEdict } from "@/engine/types";
import ContrabandRegistry from "@/components/ContrabandRegistry";
import FieldOpsPanel from "@/components/FieldOpsPanel";
import FaithsPanel from "@/components/FaithsPanel";
import CommandScreenHeader from "@/components/CommandScreenHeader";
import CrisisReportFrame from "@/components/CrisisReportFrame";
import AdministrativeBlocPanel from "@/components/AdministrativeBlocPanel";
import {
  getSecurityWingSummary,
  SECURITY_WING_DEFS,
  SECURITY_WING_DOCTRINES,
  type SecurityWingDoctrine,
  type SecurityWingId,
} from "@/engine/securityWings";
import {
  BLACKSITE_BUILD_COST,
  BLACKSITE_CAPACITY_PER_FACILITY,
  BLACKSITE_FACILITY_KEY,
  BLACKSITE_STEEL_COST,
  DETAINEE_ACTIONS,
  getBlacksiteSummary,
  getIncarcerationSummary,
  getDetaineeActionAvailability,
  getDetaineeRoster,
  type DetaineeActionId,
  type DetaineeRosterEntry,
} from "@/engine/custody";

type LawTab = "overview" | "contraband" | "fieldops" | "faiths";
const LAW_TABS: { id: LawTab; label: string; icon: string }[] = [
  { id: "overview", label: "OVERVIEW", icon: "shield" },
  { id: "contraband", label: "CONTRABAND", icon: "package" },
  { id: "fieldops", label: "FIELD OPS", icon: "crosshair" },
  { id: "faiths", label: "FAITHS", icon: "sun" },
];

function LawScreen() {
  const insets = useSafeAreaInsets();
  const {
    state: rawState,
    togglePolicy,
    deployUnit,
    issueEdict,
    dispatchLawOperation,
    buildConstruction,
    establishSecurityWing,
    assignSecurityWingSquad,
    unassignSecurityWingSquad,
    appointSecurityWingLeader,
    setSecurityWingDoctrine,
    setSecurityWingJurisdiction,
    deploySecurityWing,
    standDownSecurityWing,
    performDetaineeAction,
  } = useGame();
  const state = useThrottledValue(rawState, 500);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { modal, showModal, hideModal } = useGameModal();
  const [lawTab, setLawTab] = useState<LawTab>("overview");
  const [expandedEdictCats, setExpandedEdictCats] = useState<Record<string, boolean>>({});
  // Deep-link support: /(game)/law?tab=faiths (used by onboarding tip
  // responses). Runs when the param value changes; a later manual tab
  // switch sticks because the effect does not re-fire on state changes.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (typeof tabParam === "string" && LAW_TABS.some((t) => t.id === tabParam)) {
      setLawTab(tabParam as LawTab);
    }
  }, [tabParam]);
  const tabScrollRef = useHorizontalWheelScroll();
  const { cityStats: cs, units: u, policies: p, resources: r, buildings: b } = state;

  const totalJudges = useMemo(() =>
    (u.patrolJudges ?? 0) +
    (u.rookieJudgeCadets ?? 0) +
    (u.seniorJudges ?? 0) +
    (u.eliteJudgeStrikeTeams ?? 0) +
    (u.streetPatrolUnits ?? 0) +
    (u.sectorLawSquads ?? 0), [u]);

  const totalRiot = useMemo(() =>
    (u.riotPoliceSquads ?? 0) +
    (u.riotShieldUnits ?? 0) +
    (u.crowdDispersalTeams ?? 0) +
    (u.heavyRiotMechUnits ?? 0) +
    (u.riotDroneSquads ?? 0) +
    (u.tacticalSuppressionTeams ?? 0), [u]);

  const totalDrones = useMemo(() =>
    (u.surveillanceDrones ?? 0) +
    (u.patrolDrones ?? 0) +
    (u.riotSuppressionDrones ?? 0) +
    (u.investigativeDrones ?? 0), [u]);

  const securityWingSummary = useMemo(() => getSecurityWingSummary(state), [state]);
  const blacksiteSummary = useMemo(() => getBlacksiteSummary(state), [state]);
  const detainees = useMemo(() => getDetaineeRoster(state), [state]);
  const incarceration = useMemo(() => getIncarcerationSummary(state), [state]);
  const prisonCapacity = incarceration.municipalCapacity;
  const prisonPopulation = incarceration.total;

  const handleQuickDeploy = (unit: string, cost: number, label: string) => {
    if (r.credits < cost) {
      showModal("INSUFFICIENT FUNDS", `Deploying ${label} requires ${formatCredits(cost)}.`, [{ text: "OK", style: "cancel" }]);
      return;
    }
    const trainTicks = getConstructionTicks("unit", unit, undefined, state);
    const trainReduction = getTrainingSpeedReduction(state);
    const trainSources = getTrainingSpeedSourcesLabel(state);
    const speedNote = trainReduction > 0 && trainSources ? ` (-${Math.round(trainReduction * 100)}% from ${trainSources})` : "";
    showModal(
      `DEPLOY ${label}?`,
      `Requisition 10 units for ${formatCredits(cost)}.\nTraining time: ${trainTicks} tick${trainTicks === 1 ? "" : "s"}${speedNote}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "DEPLOY",
          style: "destructive",
          onPress: () => {
            const ok = deployUnit(unit, cost);
            if (ok) showModal("TRAINING UNDERWAY", `10x ${label} entered training. They will join the force in ${trainTicks} tick${trainTicks === 1 ? "" : "s"}.`, [{ text: "OK", style: "cancel" }]);
          },
        },
      ]
    );
  };

  const handleSecurityWingResult = (title: string, result: { success: boolean; error?: string }) => {
    if (!result.success) showModal(title, result.error ?? "Command rejected.", [{ text: "ACKNOWLEDGE", style: "cancel" }]);
  };

  const renderSecurityWings = () => {
    const squads = state.retinue?.squads ?? [];
    const assignedSquads = new Set(securityWingSummary.flatMap(({ wing }) => wing?.squadIds ?? []));
    const eligibleOfficers = state.officers.filter((officer) => officer.appointed);
    return (
      <>
        <SectionHeader
          title="Staffed Security Wings"
          subtitle="Named retinue squads only · deployment consumes upkeep"
          icon={<MaterialCommunityIcons name="shield-account" size={14} color={tc.accent} />}
        />
        <View style={[styles.securityWingNote, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <Text style={[styles.securityWingNoteText, { color: tc.textSecondary }]}>
            Wings are command structures, not extra personnel. A squad assigned here cannot be assigned to another wing, and every deployment requires an eligible appointed officer.
          </Text>
        </View>
        {securityWingSummary.map(({ def, wing, report, facilityCount, unlocked }) => {
          const facilityCost = def.id === "civil_security" ? 6000 : 9000;
          const facilitySteel = def.id === "civil_security" ? 35 : 45;
          const deployAction = wing?.status === "deployed"
            ? () => handleSecurityWingResult("STAND DOWN", standDownSecurityWing(def.id))
            : () => handleSecurityWingResult("DEPLOYMENT BLOCKED", deploySecurityWing(def.id));
          return (
            <View key={def.id} style={[styles.securityWingCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              <View style={styles.securityWingHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.securityWingTitle, { color: tc.accent }]}>{def.name.toUpperCase()}</Text>
                  <Text style={[styles.securityWingRole, { color: tc.textSecondary }]}>{def.role}</Text>
                </View>
                <Text style={[styles.securityWingStatus, { color: wing?.status === "deployed" ? tc.statHigh : tc.textMuted }]}>
                  {wing ? wing.status.toUpperCase() : unlocked ? "AVAILABLE" : "LOCKED"}
                </Text>
              </View>
              <Text style={[styles.securityWingDescription, { color: tc.textMuted }]}>{def.description}</Text>
              <Text style={[styles.securityWingRequirement, { color: unlocked ? tc.textSecondary : tc.warning }]}>
                {unlocked ? `FACILITY ${facilityCount}/${1} · ${def.minSquads} squad · ${def.minReadyTroops} ready personnel` : `RESEARCH REQUIRED: ${def.researchId}`}
              </Text>
              {!wing && unlocked && (
                <View style={styles.securityWingActions}>
                  <Pressable
                    style={[styles.securityWingButton, { borderColor: tc.accent }]}
                    onPress={() => handleSecurityWingResult("ESTABLISH WING", establishSecurityWing(def.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Establish ${def.name}`}
                  >
                    <Text style={[styles.securityWingButtonText, { color: tc.accent }]}>ESTABLISH · ¤{def.establishmentCost.credits.toLocaleString()}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.securityWingButton, { borderColor: tc.border }]}
                    onPress={() => buildConstruction(def.facilityKey, facilityCost, 1, facilitySteel, "security")}
                    accessibilityRole="button"
                    accessibilityLabel={`Build ${def.facilityKey}`}
                  >
                    <Text style={[styles.securityWingButtonText, { color: tc.textSecondary }]}>BUILD FACILITY · ¤{facilityCost.toLocaleString()} + {facilitySteel} STEEL</Text>
                  </Pressable>
                </View>
              )}
              {wing && (
                <>
                  <View style={styles.securityWingMetrics}>
                    <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>READINESS {Math.round(report?.readiness ?? 0)}%</Text>
                    <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>READY {report?.readyTroops ?? 0}</Text>
                    <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>ACCOUNTABILITY {wing.accountability}%</Text>
                  </View>
                  <View style={styles.securityWingActions}>
                    <Pressable
                      style={[styles.securityWingButton, { borderColor: wing.status === "deployed" ? tc.warning : tc.statHigh }]}
                      onPress={deployAction}
                      accessibilityRole="button"
                      accessibilityLabel={`${wing.status === "deployed" ? "Stand down" : "Deploy"} ${def.name}`}
                    >
                      <Text style={[styles.securityWingButtonText, { color: wing.status === "deployed" ? tc.warning : tc.statHigh }]}>{wing.status === "deployed" ? "STAND DOWN" : "DEPLOY WING"}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.securityWingButton, { borderColor: tc.border }]}
                      onPress={() => setSecurityWingJurisdiction(def.id, wing.jurisdiction === "citywide" ? "high_risk_districts" : "citywide")}
                      accessibilityRole="button"
                      accessibilityLabel={`Set ${def.name} jurisdiction`}
                    >
                      <Text style={[styles.securityWingButtonText, { color: tc.textSecondary }]}>{wing.jurisdiction === "citywide" ? "JURISDICTION · CITYWIDE" : "JURISDICTION · HIGH-RISK"}</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.securityWingSubhead, { color: tc.textMuted }]}>DOCTRINE</Text>
                  <ScrollView horizontal style={styles.securityWingChipRow} contentContainerStyle={{ gap: 6 }} showsHorizontalScrollIndicator={false}>
                    {(Object.keys(SECURITY_WING_DOCTRINES) as SecurityWingDoctrine[]).map((doctrine) => (
                      <Pressable
                        key={doctrine}
                        style={[styles.securityWingChip, { borderColor: wing.doctrine === doctrine ? tc.accent : tc.border, backgroundColor: wing.doctrine === doctrine ? tc.accent + "22" : "transparent" }]}
                        onPress={() => handleSecurityWingResult("DOCTRINE CHANGE", setSecurityWingDoctrine(def.id, doctrine))}
                        accessibilityRole="button"
                        accessibilityLabel={`Set doctrine ${SECURITY_WING_DOCTRINES[doctrine].label}`}
                      >
                        <Text style={[styles.securityWingChipText, { color: wing.doctrine === doctrine ? tc.accent : tc.textMuted }]}>{SECURITY_WING_DOCTRINES[doctrine].label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={[styles.securityWingSubhead, { color: tc.textMuted }]}>STAFFING · {wing.squadIds.length} SQUAD(S)</Text>
                  {squads.map((squad) => {
                    const assignedHere = wing.squadIds.includes(squad.id);
                    const assignedElsewhere = assignedSquads.has(squad.id) && !assignedHere;
                    return (
                      <Pressable
                        key={squad.id}
                        style={[styles.securityWingSquadRow, { borderBottomColor: tc.border + "66" }]}
                        onPress={() => assignedHere
                          ? handleSecurityWingResult("UNASSIGN SQUAD", unassignSecurityWingSquad(def.id, squad.id))
                          : !assignedElsewhere && handleSecurityWingResult("ASSIGN SQUAD", assignSecurityWingSquad(def.id, squad.id))}
                        disabled={assignedElsewhere}
                        accessibilityRole="button"
                        accessibilityLabel={`${assignedHere ? "Remove" : "Assign"} squad ${squad.name}`}
                      >
                        <Text style={[styles.securityWingSquadName, { color: assignedElsewhere ? tc.textMuted : tc.text }]}>{squad.name}</Text>
                        <Text style={[styles.securityWingSquadAction, { color: assignedHere ? tc.warning : assignedElsewhere ? tc.textMuted : tc.accent }]}>{assignedHere ? "REMOVE" : assignedElsewhere ? "OTHER WING" : "ASSIGN"}</Text>
                      </Pressable>
                    );
                  })}
                  <Text style={[styles.securityWingSubhead, { color: tc.textMuted }]}>COMMAND OFFICER</Text>
                  {eligibleOfficers.filter((officer) => def.leaderPosts.includes(officer.position)).slice(0, 4).map((officer) => (
                    <Pressable
                      key={officer.id}
                      style={[styles.securityWingSquadRow, { borderBottomColor: tc.border + "66" }]}
                      onPress={() => handleSecurityWingResult("COMMAND APPOINTMENT", appointSecurityWingLeader(def.id, officer.id))}
                      accessibilityRole="button"
                      accessibilityLabel={`Appoint ${officer.name} to ${def.name}`}
                    >
                      <Text style={[styles.securityWingSquadName, { color: officer.id === wing.leaderOfficerId ? tc.statHigh : tc.text }]}>{officer.name} · {officer.position}</Text>
                      <Text style={[styles.securityWingSquadAction, { color: officer.id === wing.leaderOfficerId ? tc.statHigh : tc.accent }]}>{officer.id === wing.leaderOfficerId ? "COMMANDING" : "APPOINT"}</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          );
        })}
      </>
    );
  };

  const handleDetaineeAction = (target: DetaineeRosterEntry, actionId: DetaineeActionId) => {
    const definition = DETAINEE_ACTIONS[actionId];
    const availability = getDetaineeActionAvailability(state, target.id, actionId);
    if (!availability.ready) {
      showModal("ACTION BLOCKED", availability.reason ?? "Action unavailable.", [{ text: "ACKNOWLEDGE", style: "cancel" }]);
      return;
    }
    showModal(
      `${definition.label}?`,
      `${definition.description}\n\nTarget: ${target.name}\nCost: ${formatCredits(definition.cost)}\nCooldown: ${definition.cooldown} ticks`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: definition.label,
          style: definition.coercive ? "destructive" : "default",
          onPress: () => {
            if (!performDetaineeAction(target.id, actionId)) {
              showModal("ACTION BLOCKED", "The custody state changed before this order committed.", [{ text: "ACKNOWLEDGE", style: "cancel" }]);
            }
          },
        },
      ],
    );
  };

  const renderCustodyCommand = () => (
    <>
      <SectionHeader
        title="Blacksite & Detainee Command"
        subtitle="Named custody records · explicit costs · controlled outcomes"
        icon={<MaterialCommunityIcons name="lock-alert" size={14} color={tc.accent} />}
      />
      <View style={[styles.securityWingCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
        <View style={styles.securityWingHeader}>
          <MaterialCommunityIcons name="shield-lock" size={20} color={blacksiteSummary.facilities > 0 ? tc.accent : tc.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.securityWingTitle, { color: tc.text }]}>CLASSIFIED DETENTION NETWORK</Text>
            <Text style={[styles.securityWingRole, { color: tc.textMuted }]}>
              {blacksiteSummary.facilities > 0 ? "Operational custody infrastructure" : "No blacksite facility commissioned"}
            </Text>
          </View>
          <Text style={[styles.securityWingStatus, { color: blacksiteSummary.readiness >= 1 ? tc.statHigh : tc.warning }]}>
            {blacksiteSummary.facilities > 0 ? `${Math.round(blacksiteSummary.readiness * 100)}% READY` : "OFFLINE"}
          </Text>
        </View>
        <View style={styles.securityWingMetrics}>
          <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>FACILITIES {blacksiteSummary.facilities}</Text>
          <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>CAPACITY {blacksiteSummary.staffedCapacity}/{blacksiteSummary.nominalCapacity}</Text>
          <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>DETAINEES {blacksiteSummary.detainees}</Text>
          <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>STAFF {blacksiteSummary.availableStaff}/{blacksiteSummary.requiredStaff}</Text>
          <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>UPKEEP ¤{blacksiteSummary.upkeepPerTick.toLocaleString()}/TICK</Text>
        </View>
        <View style={styles.securityWingMetrics}>
          <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>INCARCERATED {incarceration.total}/{incarceration.municipalCapacity}</Text>
          <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>CIVILIAN {incarceration.civilians}</Text>
          <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>POW {incarceration.pows}</Text>
          <Text style={[styles.securityWingMetric, { color: incarceration.overcrowding > 0 ? tc.warning : tc.textSecondary }]}>OVERCROWDING {incarceration.overcrowding}</Text>
          <Text style={[styles.securityWingMetric, { color: tc.textSecondary }]}>GUARD DEMAND {incarceration.requiredGuards}</Text>
        </View>
        {incarceration.powOrigins.map((origin) => (
          <Text key={origin.key} style={[styles.securityWingNoteText, { color: tc.textMuted }]}>
            POW ORIGIN · {origin.label.toUpperCase()} · {origin.count}
          </Text>
        ))}
        {blacksiteSummary.facilities === 0 && (
          <Pressable
            style={[styles.securityWingButton, { borderColor: tc.accent }]}
            onPress={() => {
              const ok = buildConstruction(BLACKSITE_FACILITY_KEY, BLACKSITE_BUILD_COST, 1, BLACKSITE_STEEL_COST, "security");
              if (ok) showModal("BLACKSITE ORDERED", `Construction started. Capacity will come online in approximately ${getConstructionTicks("city", BLACKSITE_FACILITY_KEY, "security", state)} ticks.`, [{ text: "ACKNOWLEDGE", style: "cancel" }]);
            }}
            accessibilityRole="button"
            accessibilityLabel="Construct blacksite detention facility"
          >
            <Text style={[styles.securityWingButtonText, { color: tc.accent }]}>
              BUILD BLACKSITE · ¤{BLACKSITE_BUILD_COST.toLocaleString()} + {BLACKSITE_STEEL_COST} STEEL
            </Text>
          </Pressable>
        )}
        {detainees.length === 0 ? (
          <Text style={[styles.securityWingNoteText, { color: tc.textMuted }]}>No named detainees are currently attached to the custody register.</Text>
        ) : (
          detainees.map((detainee) => (
            <View key={detainee.id} style={[styles.securityWingSquadRow, { borderBottomColor: tc.border + "66", alignItems: "flex-start" }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.securityWingSquadName, { color: tc.text }]}>{detainee.name}</Text>
                <Text style={[styles.securityWingRole, { color: tc.textMuted }]}>
                  {detainee.status.toUpperCase()} · {detainee.location.replace(/_/g, " ").toUpperCase()} · NOTORIETY {detainee.notoriety}
                </Text>
              </View>
              <View style={styles.securityWingActions}>
                {(Object.keys(DETAINEE_ACTIONS) as DetaineeActionId[]).map((actionId) => {
                  const action = DETAINEE_ACTIONS[actionId];
                  const availability = getDetaineeActionAvailability(state, detainee.id, actionId);
                  if (actionId === "exchange" && !detainee.factionId) return null;
                  return (
                    <Pressable
                      key={actionId}
                      style={[styles.securityWingButton, { borderColor: availability.ready ? (action.coercive ? tc.warning : tc.border) : tc.border + "88", opacity: availability.ready ? 1 : 0.55 }]}
                      onPress={() => handleDetaineeAction(detainee, actionId)}
                      accessibilityRole="button"
                      accessibilityLabel={`${action.label} ${detainee.name}`}
                    >
                      <Text style={[styles.securityWingButtonText, { color: availability.ready ? (action.coercive ? tc.warning : tc.textSecondary) : tc.textMuted }]}>{action.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );

  const handleFieldOperation = (mission: LawMissionDef) => {
    const chance = Math.round(LAW_OPERATION_SUCCESS_CHANCE[mission.risk] * 100);
    showModal(
      `DISPATCH ${mission.name.toUpperCase()}?`,
      `${mission.description}\n\nCommit ${mission.requiredUnits} units and ${formatCredits(mission.cost)}. Success chance: ${chance}% (${mission.risk.toUpperCase()} risk).\n\nSuccess: crime -${mission.crimeReduction}, law +${mission.lawBonus}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "DISPATCH",
          style: "destructive",
          onPress: () => {
            const result = dispatchLawOperation(mission.id);
            if (!result.ok) {
              const reason = result.reason === "insufficient_credits"
                ? "Insufficient credits."
                : result.reason === "insufficient_units"
                  ? "Insufficient available units."
                  : result.reason === "cooldown"
                    ? `Operation remains on cooldown for ${result.cooldownRemaining ?? 0} tick(s).`
                    : "Operation unavailable.";
              showModal("DISPATCH BLOCKED", reason, [{ text: "OK", style: "cancel" }]);
              return;
            }
            showModal(
              result.success ? "OBJECTIVES SECURED" : "OPERATION STALLED",
              result.success
                ? `${mission.name} succeeded. Crime ${result.crimeDelta}; law +${result.lawDelta}.`
                : `${mission.name} met organized resistance. The deployment cost was spent, but no citywide gains were secured.`,
              [{ text: "ACKNOWLEDGE", style: "cancel" }],
            );
          },
        },
      ],
    );
  };

  const { colors: tc } = useTheme();
  const styles = useStyles();

  // Task #533: show the (possibly discounted) training duration on the
  // quick-deploy rows themselves, not just in the confirmation modal.
  // Compare against the undiscounted base so the min-1-tick clamp doesn't
  // falsely mark an unchanged time as boosted.
  const trainNote = (unitKey: string) => {
    const ticks = getConstructionTicks("unit", unitKey, undefined, state);
    const base = getConstructionTicks("unit", unitKey);
    const boosted = ticks < base;
    return ` — trains ${ticks} tick${ticks === 1 ? "" : "s"}${boosted ? " ▼" : ""}`;
  };

  const renderCrimeBreakdownCard = () => {
    const bd = computeCrimeBreakdown(state);
    const net = bd.netPerTick; // + = crime rising (bad), - = crime falling (good)
    const dir = net < -0.05 ? "falling" : net > 0.05 ? "rising" : "holding";
    const tone = dir === "falling" ? tc.statHigh : dir === "rising" ? tc.danger : tc.warning;
    const chipLabel = dir === "falling" ? "FALLING" : dir === "rising" ? "RISING" : "HOLDING";
    const fmtNet = (n: number) => `${n >= 0 ? "+" : ""}${(Math.round(n * 10) / 10).toFixed(1)}`;
    const gains = bd.positives.slice(0, 4);
    const drives = bd.negatives.slice(0, 4);
    const tips = bd.suggestions.slice(0, 3);
    return (
      <View style={[styles.crimeBrkCard, { backgroundColor: tc.bgCard, borderColor: tc.border, borderLeftColor: tone }]}>
        <View style={styles.crimeBrkHeader}>
          <MaterialCommunityIcons name="handcuffs" size={14} color={tone} />
          <Text style={[styles.crimeBrkTitle, { color: tone }]}>CRIME BREAKDOWN</Text>
          <View style={[styles.crimeBrkChip, { backgroundColor: tone + "22", borderColor: tone + "55" }]}>
            <Text style={[styles.crimeBrkChipText, { color: tone }]}>{chipLabel}</Text>
          </View>
        </View>
        <Text style={[styles.crimeBrkHeadline, { color: tc.text }]}>
          Crime {Math.round(bd.crime)} · {fmtNet(net)} / tick
        </Text>
        <View style={styles.crimeBrkCols}>
          <View style={styles.crimeBrkCol}>
            <Text style={[styles.crimeBrkColLabel, { color: tc.statHigh }]}>SUPPRESSING</Text>
            {gains.length === 0 ? (
              <Text style={[styles.crimeBrkEmpty, { color: tc.textMuted }]}>None yet</Text>
            ) : (
              gains.map((c) => (
                <View key={`s-${c.label}`} style={styles.crimeBrkRow}>
                  <Text style={[styles.crimeBrkRowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[styles.crimeBrkRowAmt, { color: tc.statHigh }]}>{`-${c.amount}`}</Text>
                </View>
              ))
            )}
          </View>
          <View style={styles.crimeBrkCol}>
            <Text style={[styles.crimeBrkColLabel, { color: tc.danger }]}>DRIVING UP</Text>
            {drives.length === 0 ? (
              <Text style={[styles.crimeBrkEmpty, { color: tc.textMuted }]}>None</Text>
            ) : (
              drives.map((c) => (
                <View key={`d-${c.label}`} style={styles.crimeBrkRow}>
                  <Text style={[styles.crimeBrkRowLabel, { color: tc.textSecondary }]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[styles.crimeBrkRowAmt, { color: tc.danger }]}>{`+${c.amount}`}</Text>
                </View>
              ))
            )}
          </View>
        </View>
        {tips.length > 0 && (
          <View style={[styles.crimeBrkTips, { borderTopColor: tc.border }]}>
            {tips.map((t, i) => {
              const sameScreen = t.target?.screen === "law";
              const tappable = !!t.target && isCrimeSuggestionNavigable(t.target, { alreadyOnLaw: true });
              const tipText = sameScreen
                ? `${t.text} The public-order controls are below.`
                : t.text;
              const rowContent = (
                <>
                  <Text style={[styles.crimeBrkTipDot, { color: tc.textMuted }, tappable && { color: tc.accent }]}>
                    {tappable ? "›" : "•"}
                  </Text>
                  <Text style={[styles.crimeBrkTipText, { color: tc.textSecondary }, tappable && { color: tc.accent }]}>
                    {tipText}
                  </Text>
                  {tappable && (
                    <Feather name="chevron-right" size={13} color={tc.accent} style={styles.crimeBrkTipChevron} />
                  )}
                </>
              );
              if (!tappable) {
                return (
                  <View
                    key={`t-${i}`}
                    style={styles.crimeBrkTipRow}
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={tipText}
                  >
                    {rowContent}
                  </View>
                );
              }
              return (
                <Pressable
                  key={`t-${i}`}
                  onPress={() => navigateToCrimeSuggestion(t.target!, { alreadyOnLaw: true })}
                  style={({ pressed }) => [styles.crimeBrkTipRow, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${tipText} Tap to go there.`}
                >
                  {rowContent}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: tc.bg }]}>
      <CommandScreenHeader
        icon="shield"
        title="LAW / JUSTICE / SECURITY"
        subtitle="edict authority · force readiness · detention"
      />

      <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {LAW_TABS.map((tab) => (
          <Pressable key={tab.id} onPress={() => setLawTab(tab.id)} style={[styles.lawTab, { backgroundColor: tc.bgCard, borderColor: tc.border }, lawTab === tab.id && { borderColor: tc.accent, backgroundColor: tc.accent }]}>
            <Feather name={tab.icon as any} size={11} color={lawTab === tab.id ? tc.bg : tc.textMuted} />
            <Text style={[styles.lawTabText, { color: tc.textMuted }, lawTab === tab.id && { color: tc.bg }]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {lawTab === "contraband" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ContrabandRegistry />
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {lawTab === "fieldops" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <FieldOpsPanel
            credits={r.credits}
            availableUnits={totalJudges + totalRiot + totalDrones}
            totalTicks={state.totalTicks}
            cooldowns={state.lawOperationCooldowns}
            onDispatch={handleFieldOperation}
          />
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {lawTab === "faiths" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <FaithsPanel />
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {lawTab === "overview" && (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OnboardingBanner step="edict" />
        <AdministrativeBlocPanel surface="law" />
        <TutorialHint
          id="law_intro"
          message="Edicts cost credits and run for a fixed number of ticks. Each one carries a risk profile — security clamps unrest but collapses happiness, social spends credits to keep the streets calm. Cooldowns prevent spam."
        />
        <CrisisReportFrame
          title="CRIME RESPONSE POSTURE"
          icon="shield"
          tone={cs.crime >= 65 ? "danger" : cs.crime >= 35 ? "warning" : "statHigh"}
          statusLabel={cs.crime >= 65 ? "CRITICAL" : cs.crime >= 35 ? "STRAINED" : "STABLE"}
          severityLabel={cs.crime >= 85 ? "COLLAPSING" : cs.crime >= 65 ? "CRITICAL" : cs.crime >= 35 ? "STRAINED" : "STABLE"}
          headline={`Crime index ${Math.round(cs.crime)} · enforcement limits losses, not the risk itself`}
          consequence={cs.crime >= 65
            ? "Violence, extortion, and gang control drain income and increase deaths when unrest becomes a riot."
            : "Keep patrol coverage ahead of density. Order suppresses casualties; it does not erase the pressure creating them."}
          details={<Text style={{ color: tc.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11 }}>Use the breakdown below to identify the largest driver and the available suppression route.</Text>}
          detailsLabel="COMMAND NOTE"
        />

        {/* Stats */}
        <SectionHeader title="Security Status" icon={<Feather name="shield" size={14} color={tc.accent} />} />
        <StatBar label="Law & Order" value={cs.lawOrder} />
        <StatBar label="Crime Index" value={cs.crime} invertColor />
        <StatBar label="Corruption" value={cs.corruption} invertColor />
        <StatBar label="Defense Rating" value={cs.defenseRating} />

        {/* Crime breakdown — one-tap fixes */}
        {renderCrimeBreakdownCard()}

        {/* Force summary */}
        <SectionHeader title="Force Summary" icon={<Feather name="crosshair" size={14} color={tc.accent} />} />
        <View style={styles.forceRow}>
          <ForceBox label="ENFORCER FORCE" value={totalJudges} color={tc.accent} />
          <ForceBox label="RIOT UNITS" value={totalRiot} color={tc.warning} />
          <ForceBox label="DRONES" value={totalDrones} color={tc.info} />
          <ForceBox label="IN CUSTODY" value={(prisonPopulation / 1000).toFixed(1) + "k"} color={tc.textSecondary} />
        </View>

        {/* Unit readiness */}
        <StatBar label="Enforcer Readiness" value={u.judgeReadiness ?? 0} />
        <StatBar label="Vehicle Readiness" value={u.vehicleReadiness ?? 0} />

        <ResourceRow label="Patrol Enforcers" value={u.patrolJudges ?? 0} />
        <ResourceRow label="Senior Enforcers" value={u.seniorJudges ?? 0} />
        <ResourceRow label="Riot Squads" value={u.riotPoliceSquads ?? 0} />
        <ResourceRow label="Surveillance Drones" value={u.surveillanceDrones ?? 0} />
        <ResourceRow label="Anti-Gang Task Forces" value={u.antiGangTaskForces ?? 0} />
        <ResourceRow label="Intelligence Officers" value={u.intelligenceOfficers ?? 0} />

        {renderSecurityWings()}
        {renderCustodyCommand()}

        {/* Policies */}
        <SectionHeader title="Active Policies" subtitle="Toggle law enforcement directives" icon={<Feather name="toggle-left" size={14} color={tc.accent} />} />

        <PolicyToggle
          label="SECTOR CURFEW"
          sub="Reduces crime but raises unrest (+1 law, +1 unrest)"
          value={p.curfewEnabled}
          onToggle={() => {
            if (p.curfewEnabled) togglePolicy("curfewEnabled");
            else showModal(
              "ACTIVATE SECTOR CURFEW?",
              `Reduces crime but raises unrest (+1 law, +1 unrest)\n\n${formatActionCostTimingSummary(getPolicyCostTiming({ costPerTick: 0 }, { cancellation: "changes-setting" }))}`,
              [{ text: "CANCEL", style: "cancel" }, { text: "ACTIVATE", onPress: () => togglePolicy("curfewEnabled") }],
            );
          }}
        />
        <PolicyToggle
          label="GANG CRACKDOWN PATROLS"
          sub="Active gang suppression — reduces gang influence per tick"
          value={p.gangsPatrolled}
          onToggle={() => {
            if (p.gangsPatrolled) togglePolicy("gangsPatrolled");
            else showModal(
              "ACTIVATE GANG CRACKDOWN PATROLS?",
              `Active gang suppression — reduces gang influence per tick\n\n${formatActionCostTimingSummary(getPolicyCostTiming({ costPerTick: 0 }, { cancellation: "changes-setting" }))}`,
              [{ text: "CANCEL", style: "cancel" }, { text: "ACTIVATE", onPress: () => togglePolicy("gangsPatrolled") }],
            );
          }}
        />
        <PolicyToggle
          label="CORRUPTION INVESTIGATION"
          sub="IA probing all officials (-2 corruption/tick)"
          value={p.corruptionInvestigation}
          onToggle={() => {
            if (p.corruptionInvestigation) togglePolicy("corruptionInvestigation");
            else showModal(
              "ACTIVATE CORRUPTION INVESTIGATION?",
              `IA probing all officials (-2 corruption/tick)\n\n${formatActionCostTimingSummary(getPolicyCostTiming({ costPerTick: 0 }, { cancellation: "changes-setting" }))}`,
              [{ text: "CANCEL", style: "cancel" }, { text: "ACTIVATE", onPress: () => togglePolicy("corruptionInvestigation") }],
            );
          }}
        />
        <PolicyToggle
          label="SURVEILLANCE GRID ACTIVE"
          sub="Full surveillance active — reduces crime and corruption"
          value={p.surveillanceActive}
          onToggle={() => {
            if (p.surveillanceActive) togglePolicy("surveillanceActive");
            else showModal(
              "ACTIVATE SURVEILLANCE GRID?",
              `Full surveillance active — reduces crime and corruption\n\n${formatActionCostTimingSummary(getPolicyCostTiming({ costPerTick: 0 }, { cancellation: "changes-setting" }))}`,
              [{ text: "CANCEL", style: "cancel" }, { text: "ACTIVATE", onPress: () => togglePolicy("surveillanceActive") }],
            );
          }}
        />
        <PolicyToggle
          label="MARTIAL LAW"
          sub="Maximum order. Severe unrest penalty (+3 unrest/tick)."
          value={p.martialLaw}
          onToggle={() => {
            if (!p.martialLaw) {
              showModal(
                "INITIATE MARTIAL LAW?",
                `Maximum order. Severe unrest penalty (+3 unrest/tick).\n\n${formatActionCostTimingSummary(getPolicyCostTiming({ costPerTick: 0 }, { cancellation: "changes-setting" }))}`,
                [
                  { text: "Stand Down", style: "cancel" },
                  { text: "INITIATE", style: "destructive", onPress: () => togglePolicy("martialLaw") },
                ]
              );
            } else {
              togglePolicy("martialLaw");
            }
          }}
          danger
        />

        {/* Edicts */}
        <SectionHeader title="Sector Edicts" subtitle="One-time directives with temporary effects" icon={<MaterialCommunityIcons name="script-text" size={14} color={tc.accent} />} />
        <LabourDayBoosterBanner state={state} />
        {(state.activeEdicts ?? []).length > 0 && (
          <View style={[styles.activeEdictsBanner, { borderColor: tc.accent, backgroundColor: tc.accent + "10" }]}>
            <View style={styles.activeEdictsHeader}>
              <MaterialCommunityIcons name="script-text-play" size={12} color={tc.accent} />
              <Text style={[styles.activeEdictsTitle, { color: tc.accent }]}>
                ACTIVE EDICTS — {(state.activeEdicts ?? []).length}
              </Text>
            </View>
            {(state.activeEdicts ?? []).map((ae) => {
              const def = getEdictById(ae.edictId);
              if (!def) return null;
              const timing = getEdictCostTiming(def, {
                active: ae,
                cooldownUntilTick: (state.edictCooldowns ?? {})[ae.edictId] ?? 0,
                currentTick: state.totalTicks,
                availableCredits: r.credits,
              });
              return (
                <View key={ae.edictId} style={styles.activeEdictRow}>
                  <Text style={{ color: tc.text, fontFamily: "Inter_700Bold" }}>{def.name}</Text>
                  <ActionCostTimingReadout model={timing} includeBehavior compact />
                </View>
              );
            })}
          </View>
        )}
        {EDICT_CATEGORY_ORDER.map((category) => {
          const availableEdicts = isBigBrotherActive(state.addons) ? ALL_EDICTS : EDICTS;
          const edictsInCategory = availableEdicts.filter((e) => e.category === category);
          if (edictsInCategory.length === 0) return null;
          const catColorKey = CATEGORY_COLOR_KEYS[category];
          const catColor = catColorKey ? tc[catColorKey] : category === "political" ? "#b388ff" : tc.accent;
          const isExpanded = !!expandedEdictCats[category];
          const activeIds = new Set((state.activeEdicts ?? []).map((ae) => ae.edictId));
          const activeCount = edictsInCategory.filter((e) => activeIds.has(e.id)).length;
          const cooldownCount = edictsInCategory.filter((e) => {
            const until = (state.edictCooldowns ?? {})[e.id] ?? 0;
            return !activeIds.has(e.id) && until > state.totalTicks;
          }).length;
          return (
            <View key={category}>
              <Pressable
                onPress={() => setExpandedEdictCats((prev) => ({ ...prev, [category]: !prev[category] }))}
                style={[styles.crimeCatHeader, styles.edictCatHeader, { borderBottomColor: catColor + "40" }]}
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                accessibilityLabel={`${EDICT_CATEGORY_LABELS[category]} edicts, ${edictsInCategory.length} available. ${isExpanded ? "Collapse" : "Expand"}.`}
              >
                <Text style={[styles.crimeCatTitle, { color: catColor }]}>
                  {EDICT_CATEGORY_LABELS[category]} — {edictsInCategory.length}
                </Text>
                <View style={styles.edictCatHeaderRight}>
                  {activeCount > 0 && (
                    <View style={[styles.edictCatBadge, { borderColor: tc.accent, backgroundColor: tc.accent + "18" }]}>
                      <Text style={[styles.edictCatBadgeText, { color: tc.accent }]}>{activeCount} ACTIVE</Text>
                    </View>
                  )}
                  {cooldownCount > 0 && (
                    <View style={[styles.edictCatBadge, { borderColor: tc.textMuted, backgroundColor: tc.textMuted + "18" }]}>
                      <Text style={[styles.edictCatBadgeText, { color: tc.textMuted }]}>{cooldownCount} COOLDOWN</Text>
                    </View>
                  )}
                  <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={13} color={tc.textMuted} />
                </View>
              </Pressable>
              {isExpanded && edictsInCategory.map((edict) => {
                const active = (state.activeEdicts ?? []).find((ae) => ae.edictId === edict.id);
                const cooldowns = state.edictCooldowns ?? {};
                const cooldownUntil = cooldowns[edict.id] ?? 0;
                const meetsAuth = !edict.requiresAuthority || (state.player?.attributes?.authority ?? 0) >= edict.requiresAuthority;
                return (
                  <EdictCard
                    key={edict.id}
                    edict={edict}
                    active={active}
                    cooldownUntilTick={cooldownUntil}
                    currentTick={state.totalTicks}
                    credits={r.credits}
                    meetsAuth={meetsAuth}
                    onIssue={() => {
                      const fxLine = formatEffects(edict.effects);
                      const commitment = formatActionCostTimingSummary(getEdictCostTiming(edict, {
                        active,
                        cooldownUntilTick: cooldownUntil,
                        currentTick: state.totalTicks,
                        availableCredits: r.credits,
                      }));
                      showModal(
                        `ISSUE: ${edict.name.toUpperCase()}?`,
                        `${edict.description}\n\nEFFECTS: ${fxLine || "—"}\n${commitment}`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "AUTHORIZE",
                            style: "destructive",
                            onPress: () => {
                              const ok = issueEdict(edict.id);
                              if (!ok) {
                                setTimeout(() => {
                                  showModal("EDICT FAILED", "Insufficient credits, authority, or edict already active.", [
                                    { text: "Dismiss", style: "cancel" },
                                  ]);
                                }, 50);
                              }
                            },
                          },
                        ]
                      );
                    }}
                  />
                );
              })}
            </View>
          );
        })}

        {/* Quick deploy */}
        <SectionHeader title="Quick Deploy" subtitle="Deploy additional forces (×10 per action)" icon={<MaterialCommunityIcons name="arrow-expand-all" size={14} color={tc.accent} />} />

        {/* Task #533: persistent boost indicator visible before opening
            any deploy dialog; names the active source(s). */}
        <TrainingBoostBanner state={state} />

        <MenuButton
          label="PATROL ENFORCERS ×10"
          subtitle={`4,000 cr — Beat enforcement, -crime${trainNote("patrolJudges")}`}
          onPress={() => handleQuickDeploy("patrolJudges", 4000, "Patrol Enforcers")}
          variant="secondary"
          leftIcon={<Feather name="shield" size={16} color={tc.textSecondary} />}
          rightText={`${u.patrolJudges ?? 0}`}
        />
        <MenuButton
          label="RIOT POLICE SQUADS ×10"
          subtitle={`5,000 cr — Crowd control, -unrest${trainNote("riotPoliceSquads")}`}
          onPress={() => handleQuickDeploy("riotPoliceSquads", 5000, "Riot Police")}
          variant="secondary"
          leftIcon={<Feather name="zap" size={16} color={tc.textSecondary} />}
          rightText={`${u.riotPoliceSquads ?? 0}`}
        />
        <MenuButton
          label="SENIOR ENFORCERS ×10"
          subtitle={`15,000 cr — Elite law, -crime (major)${trainNote("seniorJudges")}`}
          onPress={() => handleQuickDeploy("seniorJudges", 15000, "Senior Enforcers")}
          variant="primary"
          leftIcon={<MaterialCommunityIcons name="gavel" size={16} color={tc.accent} />}
          rightText={`${u.seniorJudges ?? 0}`}
        />
        <MenuButton
          label="SURVEILLANCE DRONES ×10"
          subtitle={`4,000 cr — Aerial monitoring, -crime${trainNote("surveillanceDrones")}`}
          onPress={() => handleQuickDeploy("surveillanceDrones", 4000, "Surveillance Drones")}
          variant="secondary"
          leftIcon={<Feather name="airplay" size={16} color={tc.textSecondary} />}
          rightText={`${u.surveillanceDrones ?? 0}`}
        />
        <MenuButton
          label="ANTI-GANG TASK FORCES ×10"
          subtitle={`7,000 cr — Gang suppression, -crime, -influence${trainNote("antiGangTaskForces")}`}
          onPress={() => handleQuickDeploy("antiGangTaskForces", 7000, "Anti-Gang Task Forces")}
          variant="warning"
          leftIcon={<MaterialCommunityIcons name="police-badge" size={16} color={tc.warning} />}
          rightText={`${u.antiGangTaskForces ?? 0}`}
        />
        <MenuButton
          label="ELITE STRIKE TEAMS ×10"
          subtitle={`20,000 cr — Maximum crime suppression${trainNote("eliteJudgeStrikeTeams")}`}
          onPress={() => handleQuickDeploy("eliteJudgeStrikeTeams", 20000, "Elite Strike Teams")}
          variant="warning"
          leftIcon={<MaterialCommunityIcons name="star-circle" size={16} color={tc.warning} />}
          rightText={`${u.eliteJudgeStrikeTeams ?? 0}`}
        />

        {/* Detention */}
        <SectionHeader title="Detention System" icon={<MaterialCommunityIcons name="handcuffs" size={14} color={tc.accent} />} />
        <ResourceRow label="Prison Capacity" value={prisonCapacity > 0 ? prisonCapacity : "NO FACILITIES"} />
        <ResourceRow
          label="In Custody"
          value={prisonPopulation.toLocaleString()}
          color={prisonCapacity > 0 && prisonPopulation > prisonCapacity * 0.9 ? tc.danger : tc.text}
        />
        {prisonCapacity > 0 && (
          <StatBar
            label="Detention Capacity Used"
            value={prisonPopulation}
            max={prisonCapacity}
            invertColor
          />
        )}

        {/* Gang Intelligence */}
        <SectionHeader title="Gang Intelligence" subtitle="Known gangs operating within city sectors" icon={<MaterialCommunityIcons name="eye-outline" size={14} color={tc.accent} />} />
        {(["street", "cyberCult", "mercenary", "organizedCrime", "specialistCrew"] as GangType[]).map((gangType) => {
          const gangsOfType = GANGS_BY_TYPE[gangType] ?? [];
          return (
            <View key={gangType}>
              <View style={[styles.crimeCatHeader, { borderBottomColor: tc.accent + "40" }]}>
                <Text style={[styles.crimeCatTitle, { color: tc.accent }]}>{GANG_TYPE_LABELS[gangType].toUpperCase()}</Text>
              </View>
              {gangsOfType.map((gang) => (
                <GangRow key={gang.id} gang={gang} />
              ))}
            </View>
          );
        })}

        {/* Crime Demographics */}
        {state.crimeStats && (
          <>
            <SectionHeader title="Crime Demographics" subtitle="Per-tick incident counts across all sectors" icon={<MaterialCommunityIcons name="chart-timeline-variant" size={14} color={tc.accent} />} />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>VIOLENT CRIMES</Text>
            </View>
            <CrimeRow label="Murder" value={state.crimeStats.murder} severity="critical" />
            <CrimeRow label="Manslaughter" value={state.crimeStats.manslaughter} severity="high" />
            <CrimeRow label="Assault" value={state.crimeStats.assault} severity="high" />
            <CrimeRow label="Aggravated Assault" value={state.crimeStats.aggravatedAssault} severity="high" />
            <CrimeRow label="Robbery" value={state.crimeStats.robbery} severity="medium" />
            <CrimeRow label="Armed Robbery" value={state.crimeStats.armedRobbery} severity="high" />
            <CrimeRow label="Kidnapping" value={state.crimeStats.kidnapping} severity="critical" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>PROPERTY CRIMES</Text>
            </View>
            <CrimeRow label="Theft" value={state.crimeStats.theft} severity="low" />
            <CrimeRow label="Grand Theft" value={state.crimeStats.grandTheft} severity="medium" />
            <CrimeRow label="Burglary" value={state.crimeStats.burglary} severity="medium" />
            <CrimeRow label="Vehicle Theft" value={state.crimeStats.vehicleTheft} severity="medium" />
            <CrimeRow label="Arson" value={state.crimeStats.arson} severity="high" />
            <CrimeRow label="Vandalism" value={state.crimeStats.vandalism} severity="low" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>FINANCIAL / FRAUD</Text>
            </View>
            <CrimeRow label="Fraud" value={state.crimeStats.fraud} severity="medium" />
            <CrimeRow label="Identity Fraud" value={state.crimeStats.identityFraud} severity="medium" />
            <CrimeRow label="Extortion" value={state.crimeStats.extortion} severity="high" />
            <CrimeRow label="Blackmail" value={state.crimeStats.blackmail} severity="medium" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>NARCOTICS / WEAPONS</Text>
            </View>
            <CrimeRow label="Drug Possession" value={state.crimeStats.drugPossession} severity="low" />
            <CrimeRow label="Drug Trafficking" value={state.crimeStats.drugTrafficking} severity="high" />
            <CrimeRow label="Weapons Violation" value={state.crimeStats.weaponsViolation} severity="medium" />
            <CrimeRow label="Smuggling" value={state.crimeStats.smuggling} severity="medium" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>ORGANIZED / OTHER</Text>
            </View>
            <CrimeRow label="Cyber Crime" value={state.crimeStats.cyberCrime} severity="medium" />
            <CrimeRow label="Human Trafficking" value={state.crimeStats.humanTrafficking} severity="critical" />
            <CrimeRow label="Organized Crime" value={state.crimeStats.organizedCrime} severity="high" />
            <CrimeRow label="Public Disorder" value={state.crimeStats.publicDisorder} severity="low" />
            <CrimeRow label="Corruption" value={state.crimeStats.corruption} severity="high" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>CYBERNETIC CRIME</Text>
            </View>
            <CrimeRow label="Illegal Augmentation" value={state.crimeStats.illegalAugmentation} severity="medium" />
            <CrimeRow label="Implant Theft" value={state.crimeStats.implantTheft} severity="high" />
            <CrimeRow label="Forced Cyberization" value={state.crimeStats.forcedCyberization} severity="critical" />
            <CrimeRow label="Neural Hijacking" value={state.crimeStats.neuralHijacking} severity="critical" />
            <CrimeRow label="Cyberpsychosis" value={state.crimeStats.cyberpsychosis} severity="high" />
            <CrimeRow label="Augment Sabotage" value={state.crimeStats.augmentSabotage} severity="medium" />
            <CrimeRow label="Black Clinic Operations" value={state.crimeStats.blackClinicOperations} severity="high" />
            <CrimeRow label="Implant Counterfeiting" value={state.crimeStats.implantCounterfeiting} severity="medium" />
            <CrimeRow label="Cyberware Smuggling" value={state.crimeStats.cyberwareSmugging} severity="medium" />
            <CrimeRow label="Neural Identity Spoofing" value={state.crimeStats.neuralIdentitySpoofing} severity="high" />
            <CrimeRow label="Prosthetic Weaponization" value={state.crimeStats.prostheticWeaponization} severity="high" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>DATA & DIGITAL CRIME</Text>
            </View>
            <CrimeRow label="Data Breaches" value={state.crimeStats.dataBreaches} severity="medium" />
            <CrimeRow label="Network Intrusion" value={state.crimeStats.networkIntrusion} severity="medium" />
            <CrimeRow label="AI Manipulation" value={state.crimeStats.aiManipulation} severity="high" />
            <CrimeRow label="Deepfake Fraud" value={state.crimeStats.deepfakeFraud} severity="medium" />
            <CrimeRow label="Crypto Theft" value={state.crimeStats.cryptoTheft} severity="medium" />
            <CrimeRow label="Digital Ransomware" value={state.crimeStats.digitalRansomware} severity="high" />
            <CrimeRow label="Surveillance Hacking" value={state.crimeStats.surveillanceHacking} severity="high" />
            <CrimeRow label="Information Brokering" value={state.crimeStats.informationBrokering} severity="medium" />
            <CrimeRow label="Neural Net Trespass" value={state.crimeStats.neuralNetTrespass} severity="high" />
            <CrimeRow label="Virtual Identity Theft" value={state.crimeStats.virtualIdentityTheft} severity="medium" />
            <CrimeRow label="Illegal Data Mining" value={state.crimeStats.dataMining} severity="low" />
            <CrimeRow label="Grid Tampering" value={state.crimeStats.gridTampering} severity="high" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>STREET CRIME</Text>
            </View>
            <CrimeRow label="Street Racing" value={state.crimeStats.streetRacing} severity="low" />
            <CrimeRow label="Gang Warfare" value={state.crimeStats.gangWarfare} severity="critical" />
            <CrimeRow label="Protection Racketeering" value={state.crimeStats.protectionRacketeering} severity="high" />
            <CrimeRow label="Stim Dealering" value={state.crimeStats.stimDealering} severity="medium" />
            <CrimeRow label="Illegal Gambling" value={state.crimeStats.illegalGambling} severity="low" />
            <CrimeRow label="Street Vendor Extortion" value={state.crimeStats.streetVendorExtortion} severity="medium" />
            <CrimeRow label="Graffiti Bombing" value={state.crimeStats.graffitiBombing} severity="low" />
            <CrimeRow label="Squatting" value={state.crimeStats.squatting} severity="low" />
            <CrimeRow label="Drone Fighting" value={state.crimeStats.droneFighting} severity="medium" />
            <CrimeRow label="Pedestrian Assault" value={state.crimeStats.pedestrianAssault} severity="high" />
            <CrimeRow label="Transit Vandalism" value={state.crimeStats.transitVandalism} severity="medium" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>INDUSTRIAL CRIME</Text>
            </View>
            <CrimeRow label="Industrial Espionage" value={state.crimeStats.industrialEspionage} severity="high" />
            <CrimeRow label="Toxic Dumping" value={state.crimeStats.toxicDumping} severity="high" />
            <CrimeRow label="Factory Sabotage" value={state.crimeStats.factorySabotage} severity="high" />
            <CrimeRow label="Labor Exploitation" value={state.crimeStats.laborExploitation} severity="medium" />
            <CrimeRow label="Supply Chain Tampering" value={state.crimeStats.supplyChainTampering} severity="medium" />
            <CrimeRow label="Patent Theft" value={state.crimeStats.patentTheft} severity="medium" />
            <CrimeRow label="Regulatory Fraud" value={state.crimeStats.regulatoryFraud} severity="medium" />
            <CrimeRow label="Energy Theft" value={state.crimeStats.energyTheft} severity="medium" />
            <CrimeRow label="Automation Sabotage" value={state.crimeStats.automationSabotage} severity="high" />
            <CrimeRow label="Waste Trafficking" value={state.crimeStats.wasteTrafficking} severity="medium" />
            <CrimeRow label="Resource Hoarding" value={state.crimeStats.resourceHoarding} severity="medium" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>MEDICAL CRIME</Text>
            </View>
            <CrimeRow label="Organ Harvesting" value={state.crimeStats.organHarvesting} severity="critical" />
            <CrimeRow label="Illegal Cloning" value={state.crimeStats.illegalCloning} severity="critical" />
            <CrimeRow label="Bioweapon Development" value={state.crimeStats.bioweaponDevelopment} severity="critical" />
            <CrimeRow label="Unlicensed Gene Mods" value={state.crimeStats.unlicensedGeneMods} severity="high" />
            <CrimeRow label="Pharma Counterfeiting" value={state.crimeStats.pharmaceuticalCounterfeiting} severity="medium" />
            <CrimeRow label="Clinical Trial Fraud" value={state.crimeStats.clinicalTrialFraud} severity="medium" />
            <CrimeRow label="Medical Data Trafficking" value={state.crimeStats.medicalDataTrafficking} severity="high" />
            <CrimeRow label="Plague Hoarding" value={state.crimeStats.plagueHoarding} severity="critical" />
            <CrimeRow label="Synthetic Blood Traffic" value={state.crimeStats.syntheticBloodTrafficking} severity="medium" />
            <CrimeRow label="Neurotoxin Distribution" value={state.crimeStats.neurotoxinDistribution} severity="critical" />
            <CrimeRow label="Illegal Psych Surgery" value={state.crimeStats.illegalPsychSurgery} severity="high" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>HIGH LEVEL CRIME</Text>
            </View>
            <CrimeRow label="Corporate Assassination" value={state.crimeStats.corporateAssassination} severity="critical" />
            <CrimeRow label="Government Infiltration" value={state.crimeStats.governmentInfiltration} severity="critical" />
            <CrimeRow label="Mass Manipulation" value={state.crimeStats.massManipulation} severity="high" />
            <CrimeRow label="Election Rigging" value={state.crimeStats.electionRigging} severity="high" />
            <CrimeRow label="Intelligence Selling" value={state.crimeStats.intelligenceSelling} severity="high" />
            <CrimeRow label="Megacorp Warfare" value={state.crimeStats.megacorpWarfare} severity="critical" />
            <CrimeRow label="Judicial Corruption" value={state.crimeStats.judicialCorruption} severity="high" />
            <CrimeRow label="Political Blackmail" value={state.crimeStats.politicalBlackmail} severity="high" />
            <CrimeRow label="Shadow Government" value={state.crimeStats.shadowGovernment} severity="critical" />
            <CrimeRow label="Diplomatic Crimes" value={state.crimeStats.diplomaticCrimes} severity="high" />
            <CrimeRow label="Treason" value={state.crimeStats.treason} severity="critical" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>BLACK MARKET ACTIVITIES</Text>
            </View>
            <CrimeRow label="Unreg. Weapons Sales" value={state.crimeStats.unregisteredWeaponsSales} severity="high" />
            <CrimeRow label="Synth Drug Manufacturing" value={state.crimeStats.syntheticDrugManufacturing} severity="high" />
            <CrimeRow label="Alien Artifact Traffic" value={state.crimeStats.alienArtifactTrafficking} severity="medium" />
            <CrimeRow label="Slave Chip Trading" value={state.crimeStats.slaveChipTrading} severity="critical" />
            <CrimeRow label="Black Market Cybernetics" value={state.crimeStats.blackMarketCybernetics} severity="high" />
            <CrimeRow label="Contrabandeering" value={state.crimeStats.contrabandeering} severity="medium" />
            <CrimeRow label="Forgery Operations" value={state.crimeStats.forgeryOperations} severity="medium" />
            <CrimeRow label="Illegal Bounty Hunting" value={state.crimeStats.illegalBountyHunting} severity="medium" />
            <CrimeRow label="Pit Fighting" value={state.crimeStats.pitFighting} severity="medium" />
            <CrimeRow label="Mutant Trafficking" value={state.crimeStats.mutantTrafficking} severity="critical" />
            <CrimeRow label="Radioactive Smuggling" value={state.crimeStats.radioactiveMaterialSmuggling} severity="critical" />

            <View style={styles.crimeCatHeader}>
              <Text style={styles.crimeCatTitle}>JUSTICE SYSTEM</Text>
            </View>
            <CrimeRow label="Total Arrests" value={state.crimeStats.totalArrests} severity="info" />
            <CrimeRow label="Total Convictions" value={state.crimeStats.totalConvictions} severity="info" />
            <CrimeRow label="Total Incarcerations" value={state.crimeStats.totalIncarcerations} severity="info" />
            <CrimeRow label="Recidivism Rate" value={`${state.crimeStats.recidivismRate}%`} severity={state.crimeStats.recidivismRate > 50 ? "high" : "medium"} />
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
      )}

      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

function ForceBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  const { colors: tc } = useTheme();
  const fStyles = useFStyles();
  return (
    <View style={[fStyles.box, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
      <Text style={[fStyles.value, { color }]}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </Text>
      <Text style={[fStyles.label, { color: tc.textMuted }]}>{label}</Text>
    </View>
  );
}

const SEVERITY_COLOR_KEYS: Record<string, "danger" | "warning" | "textSecondary" | "textMuted" | "info"> = {
  critical: "danger",
  high: "warning",
  medium: "textSecondary",
  low: "textMuted",
  info: "info",
};

function CrimeRow({ label, value, severity }: { label: string; value: number | string; severity: string }) {
  const { colors: tc } = useTheme();
  const crStyles = useCrStyles();
  const colorKey = SEVERITY_COLOR_KEYS[severity];
  const color = colorKey ? tc[colorKey] : tc.text;
  return (
    <View style={[crStyles.row, { borderBottomColor: tc.border + "40" }]}>
      <Text style={[crStyles.label, { color: tc.text }]}>{label}</Text>
      <Text style={[crStyles.value, { color }]}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </Text>
    </View>
  );
}

function GangRow({ gang }: { gang: GangDef }) {
  const { colors: tc } = useTheme();
  const gStyles = useGStyles();
  const threatColor = getGangThreatColor(gang.threatLevel);
  const threatBars = "█".repeat(gang.threatLevel) + "░".repeat(5 - gang.threatLevel);
  return (
    <View style={[gStyles.row, { borderBottomColor: tc.border + "40" }]}>
      <View style={gStyles.left}>
        <View style={gStyles.nameRow}>
          <Text style={[gStyles.name, { color: tc.text }]}>{gang.name}</Text>
          <Text style={[gStyles.threat, { color: threatColor }]}>{threatBars}</Text>
        </View>
        <Text style={[gStyles.desc, { color: tc.textMuted }]}>{gang.description}</Text>
        <Text style={[gStyles.specs, { color: tc.accent }]}>
          {gang.crimeSpecialties.slice(0, 3).join(" · ")}
        </Text>
      </View>
    </View>
  );
}

const useGStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  row: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "40",
  },
  left: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  name: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  threat: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  desc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 2,
  },
  specs: {
    color: Colors.accent,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 0.5,
    opacity: 0.7,
  },
}));

function PolicyToggle({
  label,
  sub,
  value,
  onToggle,
  danger = false,
}: {
  label: string;
  sub: string;
  value: boolean;
  onToggle: () => void;
  danger?: boolean;
}) {
  const { colors: tc } = useTheme();
  const pStyles = usePStyles();
  const timing = getPolicyCostTiming(
    { costPerTick: 0 },
    { active: value, cancellation: "changes-setting" },
  );
  return (
    <View style={[pStyles.row, { borderBottomColor: tc.border }]}>
      <View style={pStyles.left}>
        <Text style={[pStyles.label, { color: tc.text }, danger && { color: tc.danger }]}>{label}</Text>
        <Text style={[pStyles.sub, { color: tc.textMuted }]}>{sub}</Text>
        <ActionCostTimingReadout model={timing} compact />
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: tc.border, true: danger ? tc.danger + "66" : tc.accentDark }}
        thumbColor={value ? (danger ? tc.danger : tc.accent) : tc.textMuted}
        accessibilityLabel={`Toggle ${label}`}
      />
    </View>
  );
}

const CATEGORY_COLOR_KEYS: Record<string, "danger" | "info" | "accent" | "warning"> = {
  security: "danger",
  economic: "info",
  social: "accent",
  infrastructure: "warning",
};

const EDICT_CATEGORY_ORDER: EdictDef["category"][] = ["security", "economic", "social", "infrastructure", "political"];

const EDICT_CATEGORY_LABELS: Record<EdictDef["category"], string> = {
  security: "SECURITY",
  economic: "ECONOMIC",
  social: "SOCIAL",
  infrastructure: "INFRASTRUCTURE",
  political: "POLITICAL",
};

function formatEffects(fx: EdictDef["effects"]): string {
  const parts: string[] = [];
  if (fx.happiness) parts.push(`${fx.happiness > 0 ? "+" : ""}${fx.happiness} happiness`);
  if (fx.crime) parts.push(`${fx.crime > 0 ? "+" : ""}${fx.crime} crime`);
  if (fx.corruption) parts.push(`${fx.corruption > 0 ? "+" : ""}${fx.corruption} corruption`);
  if (fx.unrest) parts.push(`${fx.unrest > 0 ? "+" : ""}${fx.unrest} unrest`);
  if (fx.employment) parts.push(`${fx.employment > 0 ? "+" : ""}${fx.employment} employment`);
  if (fx.lawEnforcement) parts.push(`${fx.lawEnforcement > 0 ? "+" : ""}${fx.lawEnforcement} law`);
  if (fx.creditsPerTick) parts.push(`${fx.creditsPerTick > 0 ? "+" : ""}${fx.creditsPerTick.toLocaleString()} cr/tick`);
  if (fx.infrastructureRepair) parts.push(`+${fx.infrastructureRepair} infra repair`);
  if (fx.factionInfluence) parts.push(`${fx.factionInfluence.delta > 0 ? "+" : ""}${fx.factionInfluence.delta} ${getFactionName(undefined, fx.factionInfluence.factionId)} influence`);
  return parts.join(" | ");
}

function EdictCard({
  edict,
  active,
  cooldownUntilTick,
  currentTick,
  credits,
  meetsAuth,
  onIssue,
}: {
  edict: EdictDef;
  active?: ActiveEdict;
  cooldownUntilTick: number;
  currentTick: number;
  credits: number;
  meetsAuth: boolean;
  onIssue: () => void;
}) {
  const { colors: tc } = useTheme();
  const eStyles = useEStyles();
  const catColorKey = CATEGORY_COLOR_KEYS[edict.category];
  const catColor = catColorKey ? tc[catColorKey] : edict.category === "political" ? "#b388ff" : tc.accent;
  const timing = getEdictCostTiming(edict, {
    active,
    cooldownUntilTick,
    currentTick,
    availableCredits: credits,
  });
  const isActive = timing.phase === "active";
  const onCooldown = timing.phase === "cooldown";
  const disabled = isActive || onCooldown || timing.activationAffordable === false || !meetsAuth;
  const statusLabel = isActive ? "ACTIVE" : onCooldown ? "COOLDOWN" : "AVAILABLE";
  const statusColor = isActive ? tc.accent : onCooldown ? tc.warning : tc.textMuted;

  return (
    <TouchableOpacity
      onPress={onIssue}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        eStyles.card,
        { backgroundColor: tc.bgCard, borderColor: tc.border },
        active && { borderColor: tc.accent, backgroundColor: tc.accent + "10" },
        onCooldown && { borderColor: tc.warning + "60", opacity: 0.6 },
        disabled && !active && !onCooldown && eStyles.cardDisabled,
      ]}
    >
      <View style={eStyles.cardTop}>
        <View style={[eStyles.catBadge, { backgroundColor: catColor + "33" }]}>
          <Text style={[eStyles.catText, { color: catColor }]}>
            {edict.category.toUpperCase()}
          </Text>
        </View>
        <Text style={[eStyles.statusTag, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <Text style={[eStyles.name, { color: tc.text }]}>{edict.name.toUpperCase()}</Text>
      <Text style={[eStyles.desc, { color: tc.textMuted }]}>{edict.description}</Text>
      <Text style={[eStyles.effects, { color: tc.textSecondary }]}>{formatEffects(edict.effects)}</Text>
      <ActionCostTimingReadout model={timing} includeBehavior />
      {edict.requiresAuthority && (
        <Text style={[eStyles.authReq, { color: tc.textSecondary }, !meetsAuth && { color: tc.danger }]}>
          AUTH {edict.requiresAuthority}+
        </Text>
      )}
    </TouchableOpacity>
  );
}

const useEStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: Platform.OS === "web" ? 10 : 12,
    marginBottom: 8,
  },
  cardActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "10",
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardCooldown: {
    borderColor: Colors.warning + "60",
    opacity: 0.6,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  catText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  statusTag: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  name: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  desc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 6,
    lineHeight: 15,
  },
  effects: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    marginBottom: 6,
  },
  authReq: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
}));

const useCrStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "40",
  },
  label: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 12 },
  value: { fontFamily: "Inter_700Bold", fontSize: 12 },
}));

const useFStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    alignItems: "center",
  },
  value: { fontFamily: "Inter_700Bold", fontSize: 16 },
  label: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, letterSpacing: 0.8, marginTop: 2, textAlign: "center" },
}));

const usePStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
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
  label: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 0.5 },
  sub: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
}));

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  crimeBrkCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  crimeBrkHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  crimeBrkTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    flex: 1,
  },
  crimeBrkChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  crimeBrkChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.6,
  },
  crimeBrkHeadline: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginBottom: 8,
  },
  crimeBrkCols: {
    flexDirection: "row",
    gap: 12,
  },
  crimeBrkCol: {
    flex: 1,
  },
  crimeBrkColLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  crimeBrkEmpty: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
  },
  crimeBrkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 2,
  },
  crimeBrkRowLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    flex: 1,
  },
  crimeBrkRowAmt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  crimeBrkTips: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 4,
  },
  crimeBrkTipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 3,
  },
  crimeBrkTipDot: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    lineHeight: 17,
  },
  crimeBrkTipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  crimeBrkTipChevron: {
    marginTop: 2,
  },
  securityWingNote: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  securityWingNoteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  securityWingCard: {
    borderWidth: 1,
    borderRadius: 5,
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  securityWingHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  securityWingTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
  },
  securityWingRole: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    marginTop: 2,
  },
  securityWingStatus: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  securityWingDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
  },
  securityWingRequirement: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.6,
  },
  securityWingMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 4,
  },
  securityWingMetric: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  securityWingActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  securityWingButton: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 9,
    paddingVertical: 7,
    justifyContent: "center",
  },
  securityWingButtonText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.6,
  },
  securityWingSubhead: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
    marginTop: 5,
  },
  securityWingChipRow: {
    flexGrow: 0,
  },
  securityWingChip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  securityWingChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.5,
  },
  securityWingSquadRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  securityWingSquadName: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    flex: 1,
  },
  securityWingSquadAction: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.7,
  },
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Platform.OS === "web" ? 12 : 16,
    paddingVertical: Platform.OS === "web" ? 8 : 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5 },
  tabBar: { borderBottomWidth: 1, borderBottomColor: Colors.border, flexGrow: 0 },
  tabBarContent: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 4 : 8, gap: 5 },
  lawTab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 4 : 6, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  lawTabActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  lawTabText: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.textMuted, letterSpacing: 0.8 },
  lawTabTextActive: { color: Colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 6 : 12, paddingBottom: 20 },
  forceRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: Platform.OS === "web" ? 10 : 16,
  },
  crimeCatHeader: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent + "40",
  },
  crimeCatTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  edictCatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  edictCatHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  edictCatBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  edictCatBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.8,
  },
  activeEdictsBanner: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 4,
  },
  activeEdictsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  activeEdictsTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  activeEdictRow: {
    marginTop: 4,
  },
}));

export default withScreenBoundary(LawScreen, "law");

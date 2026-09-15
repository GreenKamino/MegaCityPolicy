import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState, useMemo, useCallback, useRef } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import EmptyState from "@/components/EmptyState";
import GameModal from "@/components/GameModal";
import InteractionMenu from "@/components/InteractionMenu";
import SectionHeader from "@/components/SectionHeader";
import StatBar from "@/components/StatBar";
import ActionCostTimingReadout from "@/components/ActionCostTimingReadout";
import { buildCaptainInteractionGroups } from "@/components/captainInteraction";
import { useTheme } from "@/context/ThemeContext";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { formatCredits, formatNumber } from "@/utils/format";
import {
  PERSONAL_ACTIONS,
  formatPersonalActionSubtitle,
  type PersonalActionId,
} from "@/engine/interactionMenu";
import {
  type TroopClassId, type TroopTier, type SquadRole, type SquadDoctrine, type SquadOperationId, type CaptainTrait, type Troop, type Captain, type Squad,
  CLASS_DEFS, TIER_DEFS, CAPTAIN_TRAITS, SQUAD_ROLES, SQUAD_DOCTRINES, SQUAD_OPERATIONS, SPECIALIZATIONS, XP_SHARE_RULES,
  getTierDef, getClassDef, createDefaultRetinueState, getSquadDoctrineDef, LEADERLESS_SQUAD_POWER_MULTIPLIER,
} from "@/engine/retinueData";
import {
  UNIT_ROLE_ICON, UNIT_ROLE_ORDER, UNIT_ROLE_SHORT_LABEL, summarizeTroopRoles,
  type UnitRole,
} from "@/engine/unitRoles";
import {
  recruitTroop, hireCaptain, createSquad, assignTroopToSquad, removeTroopFromSquad,
  promoteTroop, startTraining, dismissTroop, dismissCaptain, disbandSquad,
  setSquadDoctrine, getRetinueSummary, distributeXP, appointSquadCaptain, assignSquadDeputy,
  getSquadCompositionBreakdown, getSquadAssignmentPreview, formatSquadSynergyEffect,
  getSquadDeploymentPreview, launchSquadOperation, getTroopPromotionPreview,
  getTroopTrainingPreview,
} from "@/engine/retinue";

type RetinueTab = "overview" | "squads" | "roster" | "recruit" | "tiers";

const TIER_COLORS: Record<TroopTier, string> = {
  recruit: "#888",
  militia: "#AAA",
  enforcer: "#4CAF50",
  veteran: "#2196F3",
  elite: "#FF9800",
  champion: "#FFD700",
};

function RetinueScreen() {
  const insets = useSafeAreaInsets();
  const { state, setState, performPersonalInteraction } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const { colors: T } = useTheme();
  const [tab, setTab] = useState<RetinueTab>("overview");
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [selectedTroopId, setSelectedTroopId] = useState<string | null>(null);
  const [assignmentPreviewSquadId, setAssignmentPreviewSquadId] = useState<string | null>(null);
  const [recruitClass, setRecruitClass] = useState<TroopClassId | null>(null);
  const [captainName, setCaptainName] = useState("");
  const [captainTrait, setCaptainTrait] = useState<CaptainTrait>("tactician");
  const [squadName, setSquadName] = useState("");
  const [squadRole, setSquadRole] = useState<SquadRole>("assault");
  const [squadCaptainId, setSquadCaptainId] = useState<string | null>(null);
  const [operationSquadId, setOperationSquadId] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<SquadOperationId>("recon_sweep");
  const [, forceRetinueRefresh] = useState(0);
  const squadNameInputRef = useRef<TextInput>(null);

  const ret = state.retinue ?? createDefaultRetinueState();
  // NOTE: keep this dep as `[state]`. The retinue engine functions
  // (recruitTroop, assignTroopToSquad, etc.) mutate `s.retinue` in place
  // — `state.retinue` keeps the same reference across actions, so
  // narrowing the deps would yield a stale summary after every action.
  const summary = useMemo(() => getRetinueSummary(state), [state]);

  const doAction = useCallback((fn: (s: any) => { success: boolean; error?: string }) => {
    setState((prev: any) => {
      const s = { ...prev };
      const result = fn(s);
      if (!result.success && result.error) {
        setTimeout(() => showModal("Error", result.error!, [{ text: "OK" }]), 0);
        return prev;
      }
      return s;
    });
    forceRetinueRefresh((version) => version + 1);
  }, [setState, showModal]);

  const handleRecruit = useCallback((classId: TroopClassId) => {
    doAction((s: any) => recruitTroop(s, classId));
  }, [doAction]);

  const handleHireCaptain = useCallback(() => {
    if (!captainName.trim()) { showModal("Error", "Enter a captain name", [{ text: "OK" }]); return; }
    doAction((s: any) => hireCaptain(s, captainName.trim(), captainTrait));
    setCaptainName("");
  }, [doAction, captainName, captainTrait, showModal]);

  const handleCreateSquad = useCallback(() => {
    if (!squadName.trim()) { showModal("Error", "Enter a squad name", [{ text: "OK" }]); return; }
    if (!squadCaptainId) { showModal("Error", "Select a captain", [{ text: "OK" }]); return; }
    doAction((s: any) => createSquad(s, squadName.trim(), squadRole, squadCaptainId));
    setSquadName("");
  }, [doAction, squadName, squadRole, squadCaptainId, showModal]);

  const dismissSquadNameError = useCallback(() => {
    hideModal();
    setTimeout(() => squadNameInputRef.current?.focus(), 0);
  }, [hideModal]);

  const handlePromote = useCallback((troopId: string) => {
    doAction((s: any) => promoteTroop(s, troopId));
  }, [doAction]);

  const handleTrain = useCallback((troopId: string) => {
    doAction((s: any) => startTraining(s, troopId));
  }, [doAction]);

  const handleAssign = useCallback((troopId: string, squadId: string) => {
    doAction((s: any) => assignTroopToSquad(s, troopId, squadId));
  }, [doAction]);

  const handleRemoveFromSquad = useCallback((troopId: string) => {
    doAction((s: any) => removeTroopFromSquad(s, troopId));
  }, [doAction]);

  const handleSetDoctrine = useCallback((squadId: string, doctrine: SquadDoctrine) => {
    doAction((s: any) => setSquadDoctrine(s, squadId, doctrine));
  }, [doAction]);

  const handleLaunchOperation = useCallback((squadId: string, selectedOperationId: SquadOperationId) => {
    const preview = getSquadDeploymentPreview(state, squadId, selectedOperationId);
    if (!preview || !preview.canLaunch) {
      showModal("OPERATION UNAVAILABLE", preview?.reason ?? "Squad or operation not found", [{ text: "OK" }]);
      return;
    }
    const operation = SQUAD_OPERATIONS.find(op => op.id === selectedOperationId);
    showModal(`LAUNCH ${operation?.name.toUpperCase() ?? "OPERATION"}?`, `${preview.duration} ticks · ${preview.successChance}% success · ${preview.projectedCasualtiesOnSuccess}-${preview.projectedCasualtiesOnFailure} troop exposure. The result is committed at launch and resolves when the countdown ends.`, [
      { text: "CANCEL", style: "cancel" },
      {
        text: "LAUNCH",
        onPress: () => {
          doAction((s: any) => launchSquadOperation(s, squadId, selectedOperationId));
          setOperationSquadId(null);
        },
      },
    ]);
  }, [doAction, showModal, state]);

  const handleDismissTroop = useCallback((troopId: string, name?: string) => {
    showModal("DISMISS TROOP?", `Permanently dismiss ${name ?? "this troop"}? This cannot be undone.`, [
      { text: "CANCEL", style: "cancel" },
      { text: "DISMISS", style: "destructive", onPress: () => doAction((s: any) => dismissTroop(s, troopId)) },
    ]);
  }, [doAction, showModal]);

  const handleDismissCaptain = useCallback((captainId: string, name?: string) => {
    showModal("DISMISS CAPTAIN?", `Permanently dismiss ${name ?? "this captain"}? This cannot be undone.`, [
      { text: "CANCEL", style: "cancel" },
      { text: "DISMISS", style: "destructive", onPress: () => doAction((s: any) => dismissCaptain(s, captainId)) },
    ]);
  }, [doAction, showModal]);

  const handleCaptainSelect = useCallback(
    (captain: Pick<Captain, "id" | "name" | "title">, optionId: string) => {
      const pid = optionId as PersonalActionId;
      const def = PERSONAL_ACTIONS[pid];
      if (!def) return;
      const effects = formatPersonalActionSubtitle("captain", pid, {
        target: { kind: "captain", id: captain.id },
        history: state.personalActionHistory,
        totalTicks: state.totalTicks,
      });
      showModal(
        `${def.label}: ${captain.name}`,
        `${def.description}\n\nEffects: ${effects}`,
        [
          { text: "Abort", style: "cancel" },
          {
            text: def.label,
            style: def.variant === "danger" ? "destructive" : undefined,
            onPress: () => performPersonalInteraction({ kind: "captain", id: captain.id }, pid),
          },
        ],
      );
    },
    [performPersonalInteraction, showModal, state.personalActionHistory, state.totalTicks],
  );

  const getAvailableCaptains = useCallback((squadId: string) => (
    ret.captains.filter(c =>
      c.status === "active" &&
      !ret.squads.some(sq => sq.id !== squadId && (sq.captainId === c.id || sq.deputyCaptainId === c.id)),
    )
  ), [ret]);

  const handleAppointCaptain = useCallback((squad: Squad) => {
    const available = getAvailableCaptains(squad.id);
    if (available.length === 0) {
      showModal("NO AVAILABLE CAPTAINS", "Hire an active captain before restoring this squad. Its troops remain operational, but the squad is currently leaderless.", [{ text: "OK" }]);
      return;
    }
    showModal("APPOINT CAPTAIN", `Choose a captain for ${squad.name}.`, [
      ...available.map(c => ({
        text: `${c.name} — LV.${c.level}`,
        onPress: () => doAction((s: any) => appointSquadCaptain(s, squad.id, c.id)),
      })),
      { text: "CANCEL", style: "cancel" },
    ]);
  }, [doAction, getAvailableCaptains, showModal]);

  const handleAssignDeputy = useCallback((squad: Squad) => {
    const available = getAvailableCaptains(squad.id).filter(c => c.id !== squad.captainId);
    showModal("ASSIGN DEPUTY", `Choose a succession captain for ${squad.name}. The deputy takes over automatically if this squad's captain is dismissed.`, [
      ...(squad.deputyCaptainId ? [{ text: "REMOVE CURRENT DEPUTY", style: "destructive" as const, onPress: () => doAction((s: any) => assignSquadDeputy(s, squad.id, null)) }] : []),
      ...available.map(c => ({
        text: `${c.name} — LV.${c.level}`,
        onPress: () => doAction((s: any) => assignSquadDeputy(s, squad.id, c.id)),
      })),
      { text: "CANCEL", style: "cancel" },
    ]);
  }, [doAction, getAvailableCaptains, showModal]);

  const handleDisbandSquad = useCallback((squadId: string, name?: string) => {
    showModal("DISBAND SQUAD?", `Disband ${name ?? "this squad"}? Its troops return to the roster unassigned. This cannot be undone.`, [
      { text: "CANCEL", style: "cancel" },
      { text: "DISBAND", style: "destructive", onPress: () => { doAction((s: any) => disbandSquad(s, squadId)); setSelectedSquadId(null); } },
    ]);
  }, [doAction, showModal]);

  const tabs: { id: RetinueTab; label: string; icon: string }[] = [
    { id: "overview", label: "OVERVIEW", icon: "eye" },
    { id: "squads", label: "SQUADS", icon: "account-group" },
    { id: "roster", label: "ROSTER", icon: "format-list-bulleted" },
    { id: "recruit", label: "RECRUIT", icon: "account-plus" },
    { id: "tiers", label: "TIERS", icon: "stairs" },
  ];
  const reserveTroops = ret.troops.filter(t => !t.squadId && t.status !== "kia");

  const renderTroopRow = (troop: Troop, showActions: boolean = true) => {
    const classDef = getClassDef(troop.classId);
    const tierDef = getTierDef(troop.tier);
    const tierColor = TIER_COLORS[troop.tier];
    const isTraining = ret.trainingQueue.some(q => q.troopId === troop.id);
    const promotionPreview = tierDef.nextTier ? getTroopPromotionPreview(state, troop.id) : null;
    const trainingPreview = getTroopTrainingPreview(state, troop.id);
    const squad = troop.squadId ? ret.squads.find(sq => sq.id === troop.squadId) : null;

    return (
      <View key={troop.id} style={[s.card, { borderLeftWidth: 3, borderLeftColor: tierColor }]}>
        <View style={s.row}>
          <MaterialCommunityIcons name={classDef.icon as any} size={20} color={tierColor} />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
            <Text style={[s.cardTitle, { color: T.text }]}>{troop.customName || classDef.name}</Text>
            <Text style={[s.cardSub, { color: T.textSecondary }]}>
              {tierDef.label} {classDef.name} — Lv.{troop.level} — {troop.status.toUpperCase()}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.statVal, { color: tierColor }]}>⚔ {troop.combat}</Text>
            <Text style={[s.statVal, { color: T.textSecondary }]}>♥ {troop.hp}/{troop.maxHp}</Text>
          </View>
        </View>
        <View style={[s.row, { marginTop: 4 }]}>
          <StatBar label="XP" value={troop.xp} max={troop.xpToNext} />
          <Text style={[s.tinyText, { color: T.textSecondary, marginLeft: 6 }]}>Morale: {troop.morale}</Text>
          <Text style={[s.tinyText, { color: T.textSecondary, marginLeft: 6 }]}>Kills: {troop.kills}</Text>
          {squad && <Text style={[s.tinyText, { color: T.accent, marginLeft: 6 }]}>[{squad.name}]</Text>}
        </View>
        {troop.specialization && (() => {
          const specDef = SPECIALIZATIONS.find(sp => sp.id === troop.specialization);
          return specDef ? (
            <View style={[s.row, { marginTop: 4 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, borderWidth: 1, borderColor: T.accent, backgroundColor: T.accent + "15" }}>
                <MaterialCommunityIcons name={specDef.icon as any} size={10} color={T.accent} />
                <Text style={[s.tinyText, { color: T.accent, marginLeft: 4, letterSpacing: 0.5 }]}>{specDef.name.toUpperCase()}</Text>
              </View>
            </View>
          ) : null;
        })()}
        {(() => {
          let lastAction: string | null = null;
          if (troop.status === "injured") lastAction = `Recovering from wounds — ♥ ${troop.hp}/${troop.maxHp}`;
          else if (troop.status === "training") lastAction = "In training — sharpening drill discipline";
          else if (troop.status === "deployed") lastAction = "Deployed on active operation";
          else if (troop.status === "kia") lastAction = "Killed in action";
          else if (troop.kills >= 50) lastAction = `Veteran kill count — ${troop.kills} confirmed`;
          else if (troop.kills > 0) lastAction = `Last engagement: ${troop.kills} confirmed kill${troop.kills === 1 ? "" : "s"}`;
          else if (troop.morale < 30) lastAction = "Grumbling in the barracks — morale is brittle";
          else lastAction = "Standing by — awaiting orders";
          return (
            <Text style={[s.tinyText, { color: T.textMuted, marginTop: 3, fontStyle: "italic" }]}>{lastAction}</Text>
          );
        })()}
        {showActions && promotionPreview && troop.xp >= (tierDef.nextTier ? getTierDef(tierDef.nextTier).xpRequired : Number.MAX_SAFE_INTEGER) && (
          <ActionCostTimingReadout model={promotionPreview.timing} includeBehavior compact />
        )}
        {showActions && (troop.status === "ready" || isTraining) && (
          <ActionCostTimingReadout model={trainingPreview.timing} includeBehavior compact />
        )}
        {showActions && (
          <View style={[s.row, { marginTop: 6, gap: 6 }]}>
            {tierDef.nextTier && troop.xp >= getTierDef(tierDef.nextTier).xpRequired && (
              <Pressable
                style={[s.btn, { backgroundColor: promotionPreview?.canAct ? T.accent + "30" : T.border }]}
                onPress={() => handlePromote(troop.id)}
                disabled={!promotionPreview?.canAct}
                accessibilityLabel={`Promote ${troop.customName || classDef.name}`}
              >
                <Text style={[s.btnText, { color: T.accent }]}>PROMOTE</Text>
              </Pressable>
            )}
            {troop.status === "ready" && !isTraining && (
              <Pressable style={[s.btn, { backgroundColor: T.info + "30" }]} onPress={() => handleTrain(troop.id)} accessibilityLabel={`Train ${troop.customName || classDef.name}`}>
                <Text style={[s.btnText, { color: T.info }]}>TRAIN (50¢)</Text>
              </Pressable>
            )}
            {troop.status === "ready" && !troop.squadId && ret.squads.length > 0 && (
              <Pressable style={[s.btn, { backgroundColor: T.accent + "30" }]} onPress={() => {
                setSelectedTroopId(troop.id);
                setAssignmentPreviewSquadId(null);
              }} accessibilityLabel={`Assign ${troop.customName || classDef.name} to a squad`}>
                <Text style={[s.btnText, { color: T.accent }]}>ASSIGN</Text>
              </Pressable>
            )}
            {troop.squadId && (
              <Pressable style={[s.btn, { backgroundColor: T.warning + "30" }]} onPress={() => handleRemoveFromSquad(troop.id)} accessibilityLabel={`Unassign ${troop.customName || classDef.name} from squad`}>
                <Text style={[s.btnText, { color: T.warning }]}>UNASSIGN</Text>
              </Pressable>
            )}
            <Pressable style={[s.btn, { backgroundColor: T.danger + "30" }]} onPress={() => handleDismissTroop(troop.id, troop.customName || classDef.name)} accessibilityLabel={`Dismiss ${troop.customName || classDef.name}`}>
              <Text style={[s.btnText, { color: T.danger }]}>DISMISS</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const renderCaptainRow = (captain: Captain) => {
    const traitDef = CAPTAIN_TRAITS.find(t => t.id === captain.trait);
    const squad = ret.squads.find(sq => sq.captainId === captain.id);

    return (
      <View key={captain.id} style={[s.card, { borderLeftWidth: 3, borderLeftColor: "#FFD700" }]}>
        <View style={s.row}>
          <MaterialCommunityIcons name="account-star" size={22} color="#FFD700" />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
            <Text style={[s.cardTitle, { color: T.text }]}>{captain.name}</Text>
            <Text style={[s.cardSub, { color: T.textSecondary }]}>
              {captain.title} — Lv.{captain.level} — {traitDef?.name ?? captain.trait}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.statVal, { color: "#FFD700" }]}>★ {captain.leadership}</Text>
            <Text style={[s.statVal, { color: T.textSecondary }]}>⚔ {captain.combat}</Text>
          </View>
        </View>
        <View style={[s.row, { marginTop: 4 }]}>
          <StatBar label="XP" value={captain.xp} max={captain.xpToNext} />
          <Text style={[s.tinyText, { color: T.textSecondary, marginLeft: 6 }]}>Tactics: {captain.tactics}</Text>
          <Text style={[s.tinyText, { color: T.textSecondary, marginLeft: 6 }]}>Loyalty: {captain.loyalty}</Text>
          {squad && <Text style={[s.tinyText, { color: T.accent, marginLeft: 6 }]}>[{squad.name}]</Text>}
        </View>
        {traitDef && (
          <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 4, fontStyle: "italic" }]}>
            {traitDef.description}
          </Text>
        )}
        {captain.status === "active" && (
          <InteractionMenu
            groups={buildCaptainInteractionGroups(captain.id, state.resources?.credits ?? 0, state.personalActionCooldowns, state.personalActionHistory, state.totalTicks)}
            onSelect={(optionId) => handleCaptainSelect(captain, optionId)}
          />
        )}
        <View style={[s.row, { marginTop: 6, gap: 6 }]}>
          {!squad && (
            <Pressable style={[s.btn, { backgroundColor: T.accent + "30" }]} onPress={() => {
              setSquadCaptainId(captain.id);
              setTab("squads");
            }} accessibilityLabel={`Create squad with ${captain.name}`}>
              <Text style={[s.btnText, { color: T.accent }]}>CREATE SQUAD</Text>
            </Pressable>
          )}
          <Pressable style={[s.btn, { backgroundColor: T.danger + "30" }]} onPress={() => handleDismissCaptain(captain.id, captain.name)} accessibilityLabel={`Dismiss captain ${captain.name}`}>
            <Text style={[s.btnText, { color: T.danger }]}>DISMISS</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderSquadCard = (squad: Squad) => {
    const captain = squad.captainId ? ret.captains.find(c => c.id === squad.captainId) : null;
    const hasActiveCaptain = captain?.status === "active";
    const deputy = squad.deputyCaptainId ? ret.captains.find(c => c.id === squad.deputyCaptainId) : null;
    const troops = squad.troopIds.map(id => ret.troops.find(t => t.id === id)).filter(Boolean) as Troop[];
    const breakdown = getSquadCompositionBreakdown(state, squad.id);
    const power = breakdown.combatPower;
    const roleDef = SQUAD_ROLES.find(r => r.id === squad.role);
    const doctrineDef = getSquadDoctrineDef(squad.doctrine);

    const synergies = breakdown.activeSynergies;

    return (
      <View key={squad.id} style={[s.card, { borderLeftWidth: 3, borderLeftColor: T.accent }]}>
        <View style={s.row}>
          <MaterialCommunityIcons name={(roleDef?.icon ?? "account-group") as any} size={22} color={T.accent} />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
            <Text style={[s.cardTitle, { color: T.text }]}>{squad.name}</Text>
            <Text style={[s.cardSub, { color: T.textSecondary }]}>
              {roleDef?.label ?? squad.role.toUpperCase()} — {troops.length}/{squad.maxSize} troops — COMBAT POWER: {power}
            </Text>
          </View>
        </View>
        {synergies.length > 0 && (
          <View style={[s.synergyCallouts, { marginTop: 6 }]}>
            {synergies.map(syn => (
              <View key={syn.id} style={s.synergyCallout}>
                <MaterialCommunityIcons name="link-variant" size={10} color="#FFD700" />
                <View style={{ flex: 1, marginLeft: 4 }}>
                  <Text style={[s.tinyText, { color: "#FFD700", letterSpacing: 0.4, fontFamily: "Inter_700Bold" }]}>
                    {syn.name.toUpperCase()}
                  </Text>
                  <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 2 }]}>
                    {breakdown.synergyEffects
                      .filter(effect => effect.synergyId === syn.id)
                      .map(effect => formatSquadSynergyEffect(effect).toUpperCase())
                      .join(" · ")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        {breakdown.missingSynergies.length > 0 && (
          <View style={{ marginTop: 6, padding: 6, borderRadius: 4, borderWidth: 1, borderColor: T.warning + "55", backgroundColor: T.warning + "0D" }}>
            <Text style={[s.tinyText, { color: T.warning, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }]}>MISSING COMBINATIONS</Text>
            {breakdown.missingSynergies.slice(0, 4).map(status => (
              <Text key={status.synergy.id} style={[s.tinyText, { color: T.textSecondary, marginTop: 2 }]}>
                {status.synergy.name}: add {status.missingRequirements.map(req => req.label).join(", ")}
              </Text>
            ))}
            {breakdown.missingSynergies.length > 4 && (
              <Text style={[s.tinyText, { color: T.textMuted, marginTop: 2 }]}>+{breakdown.missingSynergies.length - 4} more combinations</Text>
            )}
          </View>
        )}
        {breakdown.statusMessages.length > 0 && (
          <View style={{ marginTop: 6, gap: 2 }}>
            {breakdown.statusMessages.map(message => (
              <Text key={message} style={[s.tinyText, { color: T.warning }]}>! {message}</Text>
            ))}
          </View>
        )}
        <View style={{ marginTop: 4, gap: 3 }}>
          {hasActiveCaptain ? (
            <View style={s.row}>
              <MaterialCommunityIcons name="account-star" size={14} color="#FFD700" />
              <Text style={[s.tinyText, { color: "#FFD700", marginLeft: 4 }]}>{captain.name} (Lv.{captain.level})</Text>
            </View>
          ) : (
            <View style={[s.row, { padding: 5, borderRadius: 4, backgroundColor: T.warning + "18" }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color={T.warning} />
              <Text style={[s.tinyText, { color: T.warning, marginLeft: 4, fontFamily: "Inter_700Bold" }]}>
                LEADERLESS · −{Math.round((1 - LEADERLESS_SQUAD_POWER_MULTIPLIER) * 100)}% POWER
              </Text>
            </View>
          )}
          {deputy && (
            <View style={s.row}>
              <MaterialCommunityIcons name="account-switch-outline" size={14} color={T.accent} />
              <Text style={[s.tinyText, { color: T.accent, marginLeft: 4 }]}>DEPUTY: {deputy.name} (Lv.{deputy.level})</Text>
            </View>
          )}
          {!hasActiveCaptain && (
            <Pressable style={[s.btn, { alignSelf: "flex-start", backgroundColor: T.accent + "30" }]} onPress={() => handleAppointCaptain(squad)} accessibilityLabel={`Appoint a captain for ${squad.name}`}>
              <Text style={[s.btnText, { color: T.accent }]}>APPOINT CAPTAIN</Text>
            </Pressable>
          )}
          {hasActiveCaptain && (
            <Pressable style={[s.btn, { alignSelf: "flex-start", backgroundColor: T.accent + "20" }]} onPress={() => handleAssignDeputy(squad)} accessibilityLabel={`Assign a deputy for ${squad.name}`}>
              <Text style={[s.btnText, { color: T.accent }]}>{deputy ? "CHANGE DEPUTY" : "ASSIGN DEPUTY"}</Text>
            </Pressable>
          )}
          {hasActiveCaptain && captain && (
            <InteractionMenu
              groups={buildCaptainInteractionGroups(captain.id, state.resources?.credits ?? 0, state.personalActionCooldowns, state.personalActionHistory, state.totalTicks)}
              onSelect={(optionId) => handleCaptainSelect(captain, optionId)}
            />
          )}
        </View>
        <View style={{ marginTop: 8, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: T.accent + "45", backgroundColor: T.accent + "0D" }}>
          <View style={s.row}>
            <MaterialCommunityIcons name={doctrineDef.icon as any} size={14} color={T.accent} />
            <Text style={[s.tinyText, { color: T.accent, marginLeft: 5, fontFamily: "Inter_700Bold", letterSpacing: 0.7 }]}>
              DOCTRINE: {doctrineDef.name.toUpperCase()}
            </Text>
          </View>
          <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 3 }]}>{doctrineDef.description}</Text>
          <View style={{ marginTop: 5 }}>
            <Text style={[s.tinyText, { color: "#4CAF50" }]}>BENEFIT: {doctrineDef.benefit}</Text>
            <Text style={[s.tinyText, { color: doctrineDef.id === "balanced" ? T.textSecondary : "#F44336", marginTop: 2 }]}>COST: {doctrineDef.cost}</Text>
          </View>
          <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 7, marginBottom: 3 }]}>SELECT OPERATING DOCTRINE:</Text>
          <View style={[s.row, { flexWrap: "wrap", gap: 4 }]}>
            {SQUAD_DOCTRINES.map(d => (
              <Pressable
                key={d.id}
                style={[s.doctrineBtn, doctrineDef.id === d.id && { backgroundColor: T.accent + "30", borderColor: T.accent }]}
                onPress={() => handleSetDoctrine(squad.id, d.id)}
                accessibilityLabel={`Set ${squad.name} doctrine to ${d.name}`}
                accessibilityState={{ selected: doctrineDef.id === d.id }}
              >
                <Text style={[s.btnText, { color: doctrineDef.id === d.id ? T.accent : T.textSecondary }]}>{d.name.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: 7, gap: 2 }}>
            {SQUAD_DOCTRINES.map(d => (
              <Text key={`${d.id}-tradeoff`} style={[s.tinyText, { color: d.id === doctrineDef.id ? T.text : T.textMuted }]}>
                {d.name}: {d.benefit} · {d.cost}
              </Text>
            ))}
          </View>
        </View>
        <View style={[s.powerLedger, { borderColor: T.border }]}>
          <Text style={[s.tinyText, { color: T.textSecondary, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }]}>POWER LEDGER</Text>
          <View style={[s.row, { flexWrap: "wrap", gap: 8, marginTop: 3 }]}>
            <Text style={[s.breakdownText, { color: T.textSecondary }]}>Captain +{breakdown.captainPower}</Text>
            <Text style={[s.breakdownText, { color: T.textSecondary }]}>Ready troops +{breakdown.troopPower}</Text>
            <Text style={[s.breakdownText, { color: breakdown.synergyPower > 0 ? "#FFD700" : T.textMuted }]}>Combos +{breakdown.synergyPower}</Text>
            {breakdown.formationBonusPct !== 0 && (
              <Text style={[s.breakdownText, { color: T.accent }]}>Formation +{breakdown.formationPower} ({breakdown.formationBonusPct}%)</Text>
            )}
          </View>
          <Text style={[s.tinyText, { color: T.textMuted, marginTop: 3 }]}>
            {breakdown.preDoctrinePower} × {breakdown.doctrineMultiplier} doctrine{breakdown.leaderless ? ` × ${breakdown.leadershipMultiplier} leaderless` : ""} = {breakdown.combatPower} combat power
          </Text>
        </View>
        <BattlefieldRoleCoverage troops={troops} title="BATTLEFIELD ROLE COVERAGE" />
        {ret.activeOperation?.squadId === squad.id && (
          <View style={[s.operationActive, { borderColor: T.accent + "70", backgroundColor: T.accent + "12" }]}>
            <View style={s.row}>
              <MaterialCommunityIcons name="radio-tower" size={14} color={T.accent} />
              <Text style={[s.tinyText, { color: T.accent, marginLeft: 5, fontFamily: "Inter_700Bold" }]}>
                DEPLOYED · {SQUAD_OPERATIONS.find(op => op.id === ret.activeOperation?.operationId)?.name.toUpperCase()}
              </Text>
            </View>
            <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 3 }]}>
              Resolves in {ret.activeOperation.ticksRemaining} tick{ret.activeOperation.ticksRemaining === 1 ? "" : "s"} · squad personnel are unavailable until return.
            </Text>
            {(() => {
              const timing = getSquadDeploymentPreview(
                state,
                ret.activeOperation.squadId,
                ret.activeOperation.operationId,
              )?.timing;
              return timing ? <ActionCostTimingReadout model={timing} includeBehavior compact /> : null;
            })()}
          </View>
        )}
        {operationSquadId === squad.id && !ret.activeOperation && (
          <View style={[s.operationPanel, { borderColor: T.accent + "55", backgroundColor: T.accent + "0D" }]}>
            <View style={s.row}>
              <MaterialCommunityIcons name="briefcase-search" size={14} color={T.accent} />
              <Text style={[s.tinyText, { color: T.accent, marginLeft: 5, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }]}>SELECT OPERATION</Text>
            </View>
            <View style={[s.row, { flexWrap: "wrap", gap: 4, marginTop: 6 }]}>
              {SQUAD_OPERATIONS.map(operation => (
                <Pressable
                  key={operation.id}
                  style={[s.doctrineBtn, operationId === operation.id && { backgroundColor: T.accent + "30", borderColor: T.accent }]}
                  onPress={() => setOperationId(operation.id)}
                  accessibilityLabel={`Select ${operation.name}`}
                  accessibilityState={{ selected: operationId === operation.id }}
                >
                  <Text style={[s.btnText, { color: operationId === operation.id ? T.accent : T.textSecondary }]}>{operation.name.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            {(() => {
              const preview = getSquadDeploymentPreview(state, squad.id, operationId);
              const canLaunch = preview?.canLaunch ?? false;
              return preview ? (
                <View style={{ marginTop: 7 }}>
                  <Text style={[s.tinyText, { color: T.textSecondary }]}>{SQUAD_OPERATIONS.find(operation => operation.id === operationId)?.description}</Text>
                  <View style={[s.row, { flexWrap: "wrap", gap: 10, marginTop: 7 }]}>
                    <View><Text style={[s.tinyText, { color: T.textMuted }]}>DURATION</Text><Text style={[s.statVal, { color: T.text }]}>{preview.duration} TICKS</Text></View>
                    <View><Text style={[s.tinyText, { color: T.textMuted }]}>SUCCESS</Text><Text style={[s.statVal, { color: preview.successChance >= 60 ? "#4CAF50" : T.warning }]}>{preview.successChance}%</Text></View>
                    <View><Text style={[s.tinyText, { color: T.textMuted }]}>CASUALTY EXPOSURE</Text><Text style={[s.statVal, { color: preview.projectedCasualtiesOnFailure > 0 ? T.warning : "#4CAF50" }]}>{preview.projectedCasualtiesOnSuccess}–{preview.projectedCasualtiesOnFailure} / {preview.readyTroopCount}</Text></View>
                  </View>
                   <ActionCostTimingReadout model={preview.timing} includeBehavior compact />
                  <Text style={[s.tinyText, { color: T.textMuted, marginTop: 5 }]}>
                    Doctrine: {Math.round(preview.doctrineModifiers.operationSpeedMultiplier * 100)}% speed · {Math.round(preview.doctrineModifiers.casualtyRiskMultiplier * 100)}% casualty risk · success/failure exposure shown
                  </Text>
                  {!canLaunch && <Text style={[s.tinyText, { color: T.warning, marginTop: 5 }]}>! {preview.reason}</Text>}
                  <Pressable
                    style={[s.actionBtn, { backgroundColor: canLaunch ? T.accent : T.border, marginTop: 7 }]}
                    onPress={() => handleLaunchOperation(squad.id, operationId)}
                    disabled={!canLaunch}
                    accessibilityLabel={`Launch ${SQUAD_OPERATIONS.find(operation => operation.id === operationId)?.name ?? "operation"} with ${squad.name}`}
                  >
                    <Text style={[s.actionBtnText, { color: canLaunch ? T.bg : T.textMuted }]}>LAUNCH OPERATION</Text>
                  </Pressable>
                </View>
              ) : null;
            })()}
          </View>
        )}
        {troops.length > 0 && (
          <View style={{ marginTop: 6 }}>
            {troops.map(t => {
              const cd = getClassDef(t.classId);
              const td = getTierDef(t.tier);
              return (
                <View key={t.id} style={[s.row, { paddingVertical: 2 }]}>
                  <MaterialCommunityIcons name={cd.icon as any} size={12} color={TIER_COLORS[t.tier]} />
                  <Text style={[s.tinyText, { color: T.text, marginLeft: 4, flex: 1 }]}>
                    {t.customName || cd.name} — {td.label} Lv.{t.level}
                  </Text>
                  <Text style={[s.tinyText, { color: T.textSecondary }]}>⚔{t.combat} ♥{t.hp}</Text>
                </View>
              );
            })}
          </View>
        )}
        <View style={[s.row, { marginTop: 6, gap: 6 }]}>
          <Pressable style={[s.btn, { backgroundColor: T.accent + "30" }]} onPress={() => setSelectedSquadId(squad.id)}>
            <Text style={[s.btnText, { color: T.accent }]}>MANAGE</Text>
          </Pressable>
          <Pressable
            style={[s.btn, { backgroundColor: T.accent + "30" }]}
            onPress={() => setOperationSquadId(operationSquadId === squad.id ? null : squad.id)}
            disabled={!!ret.activeOperation}
            accessibilityLabel={`Plan an operation for ${squad.name}`}
          >
            <Text style={[s.btnText, { color: ret.activeOperation ? T.textMuted : T.accent }]}>{operationSquadId === squad.id ? "CLOSE PLAN" : "PLAN OPERATION"}</Text>
          </Pressable>
          <Pressable style={[s.btn, { backgroundColor: "#F4433630" }]} onPress={() => handleDisbandSquad(squad.id, squad.name)} accessibilityLabel={`Disband squad ${squad.name}`}>
            <Text style={[s.btnText, { color: "#F44336" }]}>DISBAND</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: T.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}>
        <SectionHeader title="RETINUE COMMAND" icon={<MaterialCommunityIcons name="sword-cross" size={16} color={T.accent} />} />

        <View style={[s.row, { marginBottom: 8, gap: 4, flexWrap: "wrap", paddingHorizontal: 8 }]}>
          {tabs.map(t => (
            <Pressable key={t.id} style={[s.tabBtn, tab === t.id && { backgroundColor: T.accent + "30", borderColor: T.accent }]} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: tab === t.id }}>
              <MaterialCommunityIcons name={t.icon as any} size={12} color={tab === t.id ? T.accent : T.textSecondary} />
              <Text style={[s.tabText, { color: tab === t.id ? T.accent : T.textSecondary }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "overview" && (
          <View style={{ paddingHorizontal: 8 }}>
            <View style={[s.card, { borderColor: T.accent + "40" }]}>
              <Text style={[s.sectionTitle, { color: T.accent }]}>FORCE STATUS</Text>
              <View style={[s.row, { flexWrap: "wrap", gap: 12, marginTop: 6 }]}>
                <View>
                  <Text style={[s.tinyText, { color: T.textSecondary }]}>SQUADS</Text>
                  <Text style={[s.bigNum, { color: T.text }]}>{summary.activeSquads}/{ret.maxSquads}</Text>
                </View>
                <View>
                  <Text style={[s.tinyText, { color: T.textSecondary }]}>CAPTAINS</Text>
                  <Text style={[s.bigNum, { color: "#FFD700" }]}>{summary.activeCaptains}</Text>
                </View>
                <View>
                  <Text style={[s.tinyText, { color: T.textSecondary }]}>TROOPS</Text>
                  <Text style={[s.bigNum, { color: T.text }]}>{summary.activeTroops}</Text>
                </View>
                <View>
                  <Text style={[s.tinyText, { color: T.textSecondary }]}>TRAINING</Text>
                  <Text style={[s.bigNum, { color: "#2196F3" }]}>{summary.training}</Text>
                </View>
                <View>
                  <Text style={[s.tinyText, { color: T.textSecondary }]}>COMBAT POWER</Text>
                  <Text style={[s.bigNum, { color: T.accent }]}>{formatNumber(summary.totalPower)}</Text>
                </View>
                <View>
                  <Text style={[s.tinyText, { color: T.textSecondary }]}>TOTAL KILLS</Text>
                  <Text style={[s.bigNum, { color: "#F44336" }]}>{formatNumber(summary.totalKills)}</Text>
                </View>
              </View>
            </View>
            {ret.activeOperation && (
              <View style={[s.card, { borderColor: T.accent + "70", backgroundColor: T.accent + "0D" }]}>
                <View style={s.row}>
                  <MaterialCommunityIcons name="radio-tower" size={15} color={T.accent} />
                  <Text style={[s.sectionTitle, { color: T.accent, marginLeft: 6, marginBottom: 0 }]}>ACTIVE OPERATION</Text>
                </View>
                <Text style={[s.cardTitle, { color: T.text, marginTop: 5 }]}>
                  {SQUAD_OPERATIONS.find(operation => operation.id === ret.activeOperation?.operationId)?.name ?? ret.activeOperation.operationId} · {ret.activeOperation.squadName}
                </Text>
                <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 3 }]}>
                  {ret.activeOperation.ticksRemaining} tick{ret.activeOperation.ticksRemaining === 1 ? "" : "s"} remaining · troops are deployed and unavailable.
                </Text>
              </View>
            )}
            {(ret.operationHistory?.length ?? 0) > 0 && (
              <View style={[s.card, { borderColor: T.border }]}>
                <Text style={[s.sectionTitle, { color: T.accent }]}>OPERATION HISTORY</Text>
                {ret.operationHistory!.slice(0, 4).map(record => (
                  <View key={record.id} style={[s.row, { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: T.border }]}>
                    <MaterialCommunityIcons name={record.success ? "check-circle-outline" : "alert-circle-outline"} size={14} color={record.success ? "#4CAF50" : T.warning} />
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Text style={[s.tinyText, { color: T.text }]}>{record.operationName} · {record.squadName}</Text>
                      <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 2 }]}>
                        {record.success ? "SUCCESS" : "FAILURE"} · {record.duration} ticks · {record.wounded} wounded · {record.killed} KIA
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={[s.sectionTitle, { color: T.accent, marginTop: 12 }]}>XP SHARING RULES</Text>
            <View style={[s.card, { borderColor: T.border }]}>
              <Text style={[s.tinyText, { color: T.textSecondary }]}>
                Hierarchical retinue: Captains lead squads of troops.{"\n"}
                • Captain receives {XP_SHARE_RULES.captainSharePct * 100}% of squad XP{"\n"}
                • Troops split remaining {XP_SHARE_RULES.troopSharePct * 100}% equally{"\n"}
                • Captain traits modify share rates and training speed{"\n"}
                • Training costs 50¢ per troop, takes 8 ticks{"\n"}
                • Troops gain passive XP every 4 ticks when in a squad with captain
              </Text>
            </View>

            <Text style={[s.sectionTitle, { color: T.accent, marginTop: 12 }]}>CAPTAINS</Text>
            {ret.captains.filter(c => c.status !== "kia").length === 0 && (
              <EmptyState
                icon="account-star-outline"
                title="NO CAPTAINS HIRED"
                message="Captains lead your squads. Open the RECRUIT tab to hire your first one."
              />
            )}
            {ret.captains.filter(c => c.status !== "kia").map(renderCaptainRow)}
          </View>
        )}

        {tab === "squads" && (
          <View style={{ paddingHorizontal: 8 }}>
            {ret.squads.length < ret.maxSquads && (
              <View style={[s.card, { borderColor: T.accent + "40" }]}>
                <Text style={[s.sectionTitle, { color: T.accent }]}>CREATE NEW SQUAD</Text>
                <TextInput
                  ref={squadNameInputRef}
                  style={[s.input, { color: T.text, borderColor: T.border }]}
                  placeholder="Squad name..."
                  placeholderTextColor={T.textSecondary}
                  value={squadName}
                  onChangeText={setSquadName}
                  accessibilityLabel="Squad name"
                />
                <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 6 }]}>ROLE:</Text>
                <View style={[s.row, { flexWrap: "wrap", gap: 4, marginTop: 4 }]}>
                  {SQUAD_ROLES.map(r => (
                    <Pressable key={r.id} style={[s.tabBtn, squadRole === r.id && { backgroundColor: T.accent + "30", borderColor: T.accent }]} onPress={() => setSquadRole(r.id)}>
                      <Text style={[s.tabText, { color: squadRole === r.id ? T.accent : T.textSecondary }]}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 6 }]}>CAPTAIN:</Text>
                <View style={{ marginTop: 4 }}>
                  {ret.captains.filter(c => c.status === "active" && !ret.squads.some(sq => sq.captainId === c.id)).map(c => (
                    <Pressable key={c.id} style={[s.row, s.selectRow, squadCaptainId === c.id && { backgroundColor: T.accent + "20" }]} onPress={() => setSquadCaptainId(c.id)}>
                      <MaterialCommunityIcons name="account-star" size={14} color="#FFD700" />
                      <Text style={[s.tinyText, { color: T.text, marginLeft: 4 }]}>{c.name} (Lv.{c.level})</Text>
                      {squadCaptainId === c.id && <MaterialCommunityIcons name="check" size={14} color={T.accent} style={{ marginLeft: "auto" }} />}
                    </Pressable>
                  ))}
                  {ret.captains.filter(c => c.status === "active" && !ret.squads.some(sq => sq.captainId === c.id)).length === 0 && (
                    <Text style={[s.tinyText, { color: T.textSecondary }]}>No available captains. Hire one first.</Text>
                  )}
                </View>
                <Pressable style={[s.actionBtn, { backgroundColor: T.accent, marginTop: 8 }]} onPress={handleCreateSquad}>
                  <Text style={[s.actionBtnText, { color: T.bg }]}>CREATE SQUAD</Text>
                </Pressable>
              </View>
            )}

            {ret.squads.map(renderSquadCard)}

            <View style={[s.card, { borderColor: T.border }]}>
              <View style={s.row}>
                <MaterialCommunityIcons name="account-multiple-outline" size={16} color={T.textSecondary} />
                <Text style={[s.sectionTitle, { color: T.accent, marginLeft: 6, marginBottom: 0 }]}>RESERVE LOADOUT</Text>
              </View>
              <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 4 }]}>
                {reserveTroops.length} unassigned troop{reserveTroops.length === 1 ? "" : "s"} available for your next squad.
              </Text>
              <BattlefieldRoleCoverage troops={reserveTroops} title="RESERVE ROLE COVERAGE" />
            </View>

            {ret.squads.length === 0 && (
              <Text style={[s.tinyText, { color: T.textSecondary, padding: 8 }]}>No squads formed. Hire a captain and create one.</Text>
            )}
          </View>
        )}

        {tab === "roster" && (
          <View style={{ paddingHorizontal: 8 }}>
            <Text style={[s.sectionTitle, { color: T.accent }]}>ALL TROOPS ({ret.troops.filter(t => t.status !== "kia").length})</Text>
            {ret.troops.filter(t => t.status !== "kia").length === 0 && (
              <EmptyState
                icon="account-multiple-outline"
                title="NO TROOPS RECRUITED"
                message="Build your retinue from scratch. Open the RECRUIT tab to hire troops by class."
              />
            )}
            {ret.troops.filter(t => t.status !== "kia").map(t => renderTroopRow(t))}
          </View>
        )}

        {tab === "recruit" && (
          <View style={{ paddingHorizontal: 8 }}>
            <Text style={[s.sectionTitle, { color: T.accent }]}>HIRE CAPTAIN (2,000¢)</Text>
            <View style={[s.card, { borderColor: T.border }]}>
              <TextInput
                style={[s.input, { color: T.text, borderColor: T.border }]}
                placeholder="Captain name..."
                placeholderTextColor={T.textSecondary}
                value={captainName}
                onChangeText={setCaptainName}
                accessibilityLabel="Captain name"
              />
              <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 6 }]}>TRAIT:</Text>
              <View style={[s.row, { flexWrap: "wrap", gap: 4, marginTop: 4 }]}>
                {CAPTAIN_TRAITS.map(t => (
                  <Pressable key={t.id} style={[s.tabBtn, captainTrait === t.id && { backgroundColor: "#FFD70030", borderColor: "#FFD700" }]} onPress={() => setCaptainTrait(t.id)}>
                    <Text style={[s.tabText, { color: captainTrait === t.id ? "#FFD700" : T.textSecondary }]}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              {CAPTAIN_TRAITS.find(t => t.id === captainTrait) && (
                <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 4, fontStyle: "italic" }]}>
                  {CAPTAIN_TRAITS.find(t => t.id === captainTrait)!.description}
                </Text>
              )}
              <Pressable style={[s.actionBtn, { backgroundColor: "#FFD700", marginTop: 8 }]} onPress={handleHireCaptain}>
                <Text style={[s.actionBtnText, { color: "#000" }]}>HIRE CAPTAIN — {formatCredits(2000)}</Text>
              </Pressable>
            </View>

            <Text style={[s.sectionTitle, { color: T.accent, marginTop: 12 }]}>RECRUIT TROOPS</Text>
            {CLASS_DEFS.map(cd => {
              const locked = cd.id === "cyber_operative" && !(state.unlockedTechnologies ?? []).includes("basic_cybernetics");
              return (
                <View key={cd.id} style={[s.card, { borderColor: T.border, opacity: locked ? 0.5 : 1 }]}>
                  <View style={s.row}>
                    <MaterialCommunityIcons name={cd.icon as any} size={20} color={T.accent} />
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                      <Text style={[s.cardTitle, { color: T.text }]}>{cd.name}</Text>
                      <Text style={[s.cardSub, { color: T.textSecondary }]}>{cd.description}</Text>
                    </View>
                    <Text style={[s.statVal, { color: T.accent }]}>{formatCredits(cd.recruitCost)}</Text>
                  </View>
                  <View style={[s.row, { marginTop: 4, gap: 8 }]}>
                    <Text style={[s.tinyText, { color: T.textSecondary }]}>⚔ {cd.baseCombat}</Text>
                    <Text style={[s.tinyText, { color: T.textSecondary }]}>♥ {cd.baseHP}</Text>
                    <Text style={[s.tinyText, { color: T.textSecondary }]}>Upkeep: {cd.upkeepPerTick}¢/tick</Text>
                  </View>
                  <View style={[s.row, { marginTop: 4, gap: 4 }]}>
                    {cd.strengths.map((st, i) => (
                      <View key={i} style={[s.tag, { backgroundColor: "#4CAF5020" }]}>
                        <Text style={[s.tagText, { color: "#4CAF50" }]}>{st}</Text>
                      </View>
                    ))}
                    {cd.weaknesses.map((w, i) => (
                      <View key={i} style={[s.tag, { backgroundColor: "#F4433620" }]}>
                        <Text style={[s.tagText, { color: "#F44336" }]}>{w}</Text>
                      </View>
                    ))}
                  </View>
                  {locked ? (
                    <Text style={[s.tinyText, { color: "#F44336", marginTop: 4 }]}>Requires: BASIC CYBERNETICS</Text>
                  ) : (
                    <Pressable style={[s.actionBtn, { backgroundColor: T.accent, marginTop: 6 }]} onPress={() => handleRecruit(cd.id)}>
                      <Text style={[s.actionBtnText, { color: T.bg }]}>RECRUIT — {formatCredits(cd.recruitCost)}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {tab === "tiers" && (
          <View style={{ paddingHorizontal: 8 }}>
            <Text style={[s.sectionTitle, { color: T.accent }]}>PROMOTION TREE</Text>
            <Text style={[s.tinyText, { color: T.textSecondary, marginBottom: 8 }]}>
              Troops progress through tiers as they gain XP. Each promotion costs credits and resources.
            </Text>
            {TIER_DEFS.map((td, i) => (
              <View key={td.tier} style={[s.card, { borderLeftWidth: 3, borderLeftColor: TIER_COLORS[td.tier] }]}>
                <View style={s.row}>
                  <MaterialCommunityIcons name={td.icon as any} size={20} color={TIER_COLORS[td.tier]} />
                  <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                    <Text style={[s.cardTitle, { color: TIER_COLORS[td.tier] }]}>{td.label}</Text>
                    <Text style={[s.cardSub, { color: T.textSecondary }]}>
                      Combat ×{td.combatMult} — XP needed: {td.xpRequired} — Cost: {formatCredits(td.promoteCost)}
                    </Text>
                  </View>
                </View>
                {td.promoteResources && (
                  <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 2 }]}>
                    Resources: {Object.entries(td.promoteResources).map(([k, v]) => `${v} ${k}`).join(", ")}
                  </Text>
                )}
                {td.nextTier && i < TIER_DEFS.length - 1 && (
                  <View style={{ alignItems: "center", marginTop: 4 }}>
                    <MaterialCommunityIcons name="arrow-down" size={16} color={T.textSecondary} />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {selectedTroopId && (
        <GameModal
          visible={!!selectedTroopId}
          title="Preview squad assignment"
          buttons={[{ text: "CANCEL", style: "cancel" }]}
          onDismiss={() => {
            setSelectedTroopId(null);
            setAssignmentPreviewSquadId(null);
          }}
        >
          <Text style={[s.tinyText, { color: T.textSecondary, marginBottom: 6 }]}>
            Select a squad to see its expected composition, combat-power change, and newly gained operational effects before confirming.
          </Text>
          {ret.squads.map(sq => {
            const plan = getSquadAssignmentPreview(state, sq.id, selectedTroopId);
            const selected = assignmentPreviewSquadId === sq.id;
            return (
              <View key={sq.id} style={[s.assignmentOption, { borderColor: selected ? T.accent : T.border }]}>
                <Pressable
                  style={s.assignmentOptionHeader}
                  onPress={() => setAssignmentPreviewSquadId(sq.id)}
                  accessibilityLabel={`Preview assigning troop to ${sq.name}`}
                  accessibilityState={{ selected }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { color: T.text }]}>{sq.name}</Text>
                    <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 2 }]}>
                      {plan.current.troopCount}/{plan.current.capacity} troops → {plan.preview.troopCount}/{plan.preview.capacity} · Power {plan.current.combatPower} → {plan.preview.combatPower}
                    </Text>
                  </View>
                  <Text style={[s.deltaText, { color: plan.delta > 0 ? T.accent : plan.delta < 0 ? T.danger : T.textMuted }]}>
                    {plan.delta > 0 ? "+" : ""}{plan.delta}
                  </Text>
                </Pressable>
                {selected && (
                  <View style={{ marginTop: 5 }}>
                    {!plan.canAssign && (
                      <Text style={[s.tinyText, { color: T.danger }]}>{plan.reason}</Text>
                    )}
                    {plan.canAssign && (
                      <>
                        {plan.preview.activeSynergies.length > 0 && (
                          <View style={s.previewEffects}>
                            {plan.gainedSynergyEffects.length > 0 ? (
                              <>
                                <Text style={[s.tinyText, { color: "#FFD700", fontFamily: "Inter_700Bold" }]}>
                                  NEW COMBINATIONS
                                </Text>
                                {[...new Set(plan.gainedSynergyEffects.map(effect => effect.synergyName))].map(name => (
                                  <Text key={name} style={[s.tinyText, { color: "#FFD700", marginTop: 2 }]}>
                                    {name}: {plan.gainedSynergyEffects
                                      .filter(effect => effect.synergyName === name)
                                      .map(effect => formatSquadSynergyEffect(effect).toUpperCase())
                                      .join(" · ")}
                                  </Text>
                                ))}
                              </>
                            ) : (
                              <Text style={[s.tinyText, { color: T.textSecondary }]}>
                                Active combinations remain unchanged; no new operational effects.
                              </Text>
                            )}
                          </View>
                        )}
                        {plan.preview.statusMessages.map(message => (
                          <Text key={message} style={[s.tinyText, { color: T.warning, marginTop: 2 }]}>! {message}</Text>
                        ))}
                        <Pressable
                          style={[s.confirmAssignmentBtn, { backgroundColor: T.accent }]}
                          onPress={() => {
                            handleAssign(selectedTroopId, sq.id);
                            setSelectedTroopId(null);
                            setAssignmentPreviewSquadId(null);
                          }}
                          accessibilityLabel={`Confirm assigning troop to ${sq.name}`}
                        >
                          <Text style={[s.btnText, { color: T.bg }]}>CONFIRM ASSIGNMENT</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          {ret.squads.length === 0 && (
            <Text style={[s.tinyText, { color: T.textSecondary }]}>No squads formed — create a squad before assigning troops.</Text>
          )}
        </GameModal>
      )}

      <GameModal
        {...modal}
        onDismiss={modal.message === "Enter a squad name" ? dismissSquadNameError : hideModal}
      />
    </View>
  );
}

function BattlefieldRoleCoverage({
  troops,
  title,
}: {
  troops: ReadonlyArray<Pick<Troop, "classId">>;
  title: string;
}) {
  const { colors: T } = useTheme();
  const roleCounts = useMemo(() => summarizeTroopRoles(troops), [troops]);

  return (
    <View style={[s.roleCoverage, { borderColor: T.border, backgroundColor: T.bg }]}>
      <View style={s.row}>
        <MaterialCommunityIcons name="radar" size={13} color={T.accent} />
        <Text style={[s.tinyText, { color: T.accent, marginLeft: 5, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }]}>
          {title}
        </Text>
      </View>
      <View style={s.roleCoverageChips}>
        {UNIT_ROLE_ORDER.map((role: UnitRole) => {
          const count = roleCounts[role];
          const covered = count > 0;
          return (
            <View
              key={role}
              style={[
                s.roleCoverageChip,
                {
                  borderColor: covered ? T.accent + "70" : T.border,
                  backgroundColor: covered ? T.accent + "18" : T.bgElevated,
                },
              ]}
              accessibilityLabel={`${role}: ${count} troop${count === 1 ? "" : "s"}`}
            >
              <MaterialCommunityIcons
                name={UNIT_ROLE_ICON[role] as any}
                size={11}
                color={covered ? T.accent : T.textMuted}
              />
              <Text style={[s.roleCoverageText, { color: covered ? T.text : T.textMuted }]}>
                {UNIT_ROLE_SHORT_LABEL[role]} ×{count}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  card: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 6, padding: 10, marginBottom: 8 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 13 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 1 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1, marginBottom: 6 },
  statVal: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  tinyText: { fontFamily: "Inter_400Regular", fontSize: 10 },
  bigNum: { fontFamily: "Inter_700Bold", fontSize: 20 },
  btn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  actionBtn: { paddingVertical: 8, borderRadius: 6, alignItems: "center" },
  actionBtnText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  tabBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", flexDirection: "row", alignItems: "center", gap: 4 },
  doctrineBtn: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  input: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 6, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 },
  selectRow: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  assignmentOption: { padding: 7, borderRadius: 4, borderWidth: 1, marginVertical: 3 },
  assignmentOptionHeader: { flexDirection: "row", alignItems: "center" },
  synergyCallouts: { gap: 4 },
  synergyCallout: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 6, paddingVertical: 4, borderRadius: 3, borderWidth: 1, borderColor: "#FFD700", backgroundColor: "#FFD70015" },
  previewEffects: { marginTop: 5, padding: 6, borderRadius: 4, borderWidth: 1, borderColor: "#FFD70055", backgroundColor: "#FFD7000D" },
  deltaText: { fontFamily: "Inter_700Bold", fontSize: 11, marginLeft: 8 },
  confirmAssignmentBtn: { paddingVertical: 7, borderRadius: 4, alignItems: "center", marginTop: 5 },
  powerLedger: { marginTop: 8, padding: 7, borderRadius: 4, borderWidth: 1 },
  operationActive: { marginTop: 8, padding: 8, borderRadius: 4, borderWidth: 1 },
  operationPanel: { marginTop: 8, padding: 8, borderRadius: 4, borderWidth: 1 },
  roleCoverage: { marginTop: 7, padding: 7, borderRadius: 4, borderWidth: 1 },
  roleCoverageChips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 5 },
  roleCoverageChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 3, borderWidth: 1 },
  roleCoverageText: { fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.2 },
  breakdownText: { color: "rgba(255,255,255,0.55)", fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.2 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  tagText: { fontFamily: "Inter_500Medium", fontSize: 9 },
});

export default withScreenBoundary(RetinueScreen, "retinue");

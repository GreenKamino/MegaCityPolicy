import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useMemo, useCallback } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import ActionCostTimingReadout from "@/components/ActionCostTimingReadout";
import Insignia from "@/components/Insignia";
import InteractionMenu, { type InteractionMenuGroup } from "@/components/InteractionMenu";
import { buildCaptainInteractionGroups } from "@/components/captainInteraction";
import SectionHeader from "@/components/SectionHeader";
import TutorialHint from "@/components/TutorialHint";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import {
  PERSONAL_ACTIONS,
  PERSONAL_ACTOR_ACTION_ORDER,
  formatPersonalActionSubtitle,
  evaluatePersonalAction,
  type PersonalActionHistory,
  type PersonalActionId,
} from "@/engine/interactionMenu";
import { createDefaultPlayer } from "@/engine/initialState";
import {
  getPlayerFaction,
  PLAYER_FACTION_GLYPHS,
  PLAYER_FACTION_MOTTO_MAX,
  PLAYER_FACTION_NAME_MAX,
  PLAYER_FACTION_PALETTE,
  PLAYER_FACTION_BG_PALETTE,
  rollPlayerFactionMotto,
  setPlayerFaction,
  type PlayerFactionGlyph,
} from "@/engine/playerFaction";
import {
  formatOutfitSummary,
  getPlayerOutfit,
  setPlayerOutfit,
  SIDEARM_VARIANTS,
  UNIFORM_VARIANTS,
  type SidearmId,
  type UniformId,
} from "@/engine/wardrobe";
import { getPortrait } from "@/utils/portraits";
import { pickCustomPortrait } from "@/utils/portraitUpload";
import { PortraitPicker } from "@/components/PortraitPicker";
import OperationalEntitySheet from "@/components/OperationalEntitySheet";
import type { PlayerAttributes, PlayerSkills } from "@/engine/types";
import {
  POLITICAL_DECREES,
  POLITICAL_DECREES_MAP,
  calculateApproval,
  generatePoliticalThreats,
  createDefaultPoliticsState,
  type CommanderReputation,
} from "@/engine/politicsData";
import {
  computeAlignment,
  PLOT_THRESHOLD,
  PLOT_TYPE_LABEL,
} from "@/engine/intrigue";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  INNER_CIRCLE_PERKS,
  createDefaultInnerCircleState,
  type InnerCircleRole,
} from "@/engine/innerCircleData";
import {
  BODYGUARD_DEFS,
  BODYGUARD_XP_TABLE,
  CLASS_LABELS,
  createDefaultBodyguardState,
  xpForBodyguardLevel,
  type BodyguardClass,
  type Bodyguard,
  BODYGUARD_DEFS_MAP,
} from "@/engine/bodyguardData";
import { formatCredits } from "@/utils/format";
import { getRetinueTopics, type DialogueTopic, type DialogueChoice } from "@/engine/retinueDialogue";
import { getCommandTopics, type CommandTopic, type CommandChoice } from "@/engine/commandDialogue";
import {
  type Squad, type Captain, type Troop,
  CLASS_DEFS, CAPTAIN_TRAITS, SQUAD_ROLES,
  getClassDef, getTierDef, createDefaultRetinueState,
  CAPTAIN_TRAITS_MAP,
  SQUAD_ROLES_MAP,
} from "@/engine/retinueData";
import { getSquadCombatPower, getSquadCompositionBreakdown, formatSquadSynergyEffect } from "@/engine/retinue";
import { COMPANION_MISSION_DEFS, COMPANION_MISSION_DEFS_MAP, type CompanionMissionDef } from "@/engine/companionMissions";
import { AUGMENTS, AUGMENT_MAP, type AugmentDef } from "@/engine/augments";
import { getTraitVisual } from "@/engine/traitIcons";
import { installAugmentation, removeAugmentation, getInstalledAugEffects } from "@/engine/playerProgression";
import { getCommanderOrigin } from "@/engine/commanderOrigins";
import { applyDialogueCityEffects } from "@/engine/dialogueEffects";
import { formatActionCostTimingSummary, getDecreeCostTiming } from "@/engine/actionCostTiming";

const ATTR_DEFS: Array<{ key: keyof PlayerAttributes; label: string; icon: string; description: string; effects: (v: number) => string[] }> = [
  { key: "authority", label: "AUTHORITY", icon: "shield", description: "Command presence. Affects law enforcement, order maintenance, and faction compliance.", effects: (v) => [`+${v}% law enforcement`, `+${Math.floor(v * 0.5)}% faction compliance`, `−${Math.floor(v * 0.3)}% unrest growth`] },
  { key: "intelligence", label: "INTELLIGENCE", icon: "cpu", description: "Analytical ability. Boosts research speed, investigation success, and administration efficiency.", effects: (v) => [`+${v}% research speed`, `+${Math.floor(v * 0.5)}% investigation`, `+${Math.floor(v * 0.3)}% tax efficiency`] },
  { key: "charisma", label: "CHARISMA", icon: "users", description: "Personal magnetism. Improves diplomacy, citizen happiness, and faction negotiations.", effects: (v) => [`+${Math.floor(v * 0.5)}% happiness`, `+${v}% diplomacy`, `+${Math.floor(v * 0.3)}% trade deals`] },
  { key: "combat", label: "COMBAT", icon: "crosshair", description: "Tactical and fighting prowess. Enhances military operations, riot suppression, and defense.", effects: (v) => [`+${v}% military ops`, `+${Math.floor(v * 0.5)}% riot suppression`, `+${Math.floor(v * 0.3)}% defense rating`] },
  { key: "endurance", label: "ENDURANCE", icon: "heart", description: "Physical and mental resilience. Reduces crisis penalties and corruption vulnerability.", effects: (v) => [`−${Math.floor(v * 0.5)}% crisis penalty`, `−${Math.floor(v * 0.3)}% corruption`, `+${v}% recovery speed`] },
];

const ATTR_DEFS_BY_KEY = new Map(ATTR_DEFS.map((a) => [a.key, a] as const));

const SKILL_DEFS: Array<{ key: keyof PlayerSkills; label: string; icon: string; attr: keyof PlayerAttributes; description: string }> = [
  { key: "leadership", label: "LEADERSHIP", icon: "flag", attr: "authority", description: "Unit morale and recruitment effectiveness" },
  { key: "tactics", label: "TACTICS", icon: "target", attr: "combat", description: "Combat mission success rate and defense bonuses" },
  { key: "administration", label: "ADMINISTRATION", icon: "clipboard", attr: "intelligence", description: "Tax efficiency, construction speed, contract capacity" },
  { key: "investigation", label: "INVESTIGATION", icon: "search", attr: "intelligence", description: "Crime detection, corruption exposure, intel gathering" },
  { key: "intimidation", label: "INTIMIDATION", icon: "alert-triangle", attr: "authority", description: "Unrest suppression, gang deterrence, fear generation" },
  { key: "diplomacy", label: "DIPLOMACY", icon: "message-circle", attr: "charisma", description: "Faction negotiations, trade deals, corporate relations" },
  { key: "engineering", label: "ENGINEERING", icon: "tool", attr: "intelligence", description: "Infrastructure repair, construction quality, utility efficiency" },
  { key: "medicine", label: "MEDICINE", icon: "activity", attr: "endurance", description: "Population health, disaster casualties, medical unit effectiveness" },
  { key: "logistics", label: "LOGISTICS", icon: "truck", attr: "endurance", description: "Supply chain efficiency, resource production, transport" },
  { key: "surveillance", label: "SURVEILLANCE", icon: "eye", attr: "intelligence", description: "Drone effectiveness, crime prediction, border security" },
  { key: "propaganda", label: "PROPAGANDA", icon: "radio", attr: "charisma", description: "Loyalty generation, happiness manipulation, media control" },
  { key: "blackOps", label: "BLACK OPS", icon: "moon", attr: "combat", description: "Covert operations, assassination, sabotage, black budget efficiency" },
];

const TRAIT_DESCRIPTIONS: Record<string, string> = {
  "Academy Graduate": "Trained at the Enforcement Academy. +1 Tactics, +1 Investigation base.",
  "Iron Will": "Resistant to corruption and morale shocks. +1 Endurance.",
  "Street Veteran": "Years of patrol experience. +2 Intimidation.",
  "Diplomatic Mind": "+2 Diplomacy, natural negotiator.",
  "Technocrat": "+2 Engineering, +1 Administration.",
  "Ruthless": "+2 Intimidation, −1 Diplomacy.",
  "People's Champion": "+2 Charisma, +1 Diplomacy, citizens trust you.",
  "Ghost": "+2 Black Ops, +1 Surveillance.",
};

const REP_AXES: { key: keyof CommanderReputation; label: string; icon: string; lowLabel: string; highLabel: string }[] = [
  { key: "mercy", label: "MERCY", icon: "heart", lowLabel: "Ruthless", highLabel: "Merciful" },
  { key: "fear", label: "FEAR", icon: "alert-triangle", lowLabel: "Beloved", highLabel: "Feared" },
  { key: "transparency", label: "TRANSPARENCY", icon: "eye", lowLabel: "Secretive", highLabel: "Open" },
  { key: "populism", label: "POPULISM", icon: "users", lowLabel: "Elitist", highLabel: "Populist" },
  { key: "stability", label: "STABILITY", icon: "anchor", lowLabel: "Chaotic", highLabel: "Stable" },
];

const ALL_ROLES: InnerCircleRole[] = ["chief_advisor", "spymaster", "war_marshal", "chancellor", "enforcer", "diplomat"];

function dialogueActionLabel(id: string, topicId?: string): string {
  const topicPrefix = topicId ? `${topicId}_` : id.match(/^[^_]+_[^_]+_/)?.[0] ?? "";
  const action = (id.startsWith(topicPrefix) ? id.slice(topicPrefix.length) : id).replace(/[_-]+/g, " ");
  return `ACTION: ${action.toUpperCase()}`;
}

// Build the unified interaction menu for an appointed inner-circle officer: the
// existing command dialogue ("talk", kept in the quick row) plus the new
// personal verbs (gift / flatter / favor / bribe / threaten) behind the
// expander. Ineligible personal verbs are greyed with a reason — either the
// per-target cooldown ("Recently used — wait N ticks") or affordability.
function buildOfficerInteractionGroups(
  officerName: string,
  officerId: string,
  credits: number,
  personalCooldowns: Record<string, number> | undefined,
  personalActionHistory: PersonalActionHistory | undefined,
  totalTicks: number,
  targetKind: "officer" | "civic" = "officer",
): InteractionMenuGroup[] {
  return [
    {
      key: "dialogue",
      label: "DIALOGUE",
      options: [
        {
          id: "talk",
          label: `AUDIENCE WITH ${officerName.toUpperCase()}`,
          subtitle: "Open command dialogue",
          variant: "primary",
          eligible: true,
        },
      ],
    },
    {
      key: "personal",
      label: "PERSONAL",
          options: PERSONAL_ACTOR_ACTION_ORDER.map((id) => {
        const def = PERSONAL_ACTIONS[id];
        const elig = evaluatePersonalAction(id, credits, {
          target: { kind: targetKind, id: officerId },
          cooldowns: personalCooldowns,
          history: personalActionHistory,
          totalTicks,
        });
        return {
          id,
          label: def.label,
          subtitle: formatPersonalActionSubtitle(targetKind, id, {
            target: { kind: targetKind, id: officerId },
            history: personalActionHistory,
            totalTicks,
          }),
          variant: def.variant,
          eligible: elig.eligible,
          reason: elig.reason,
        };
      }),
    },
  ];
}

function buildCivicInteractionGroups(
  officerId: string,
  credits: number,
  personalCooldowns: Record<string, number> | undefined,
  personalActionHistory: PersonalActionHistory | undefined,
  totalTicks: number,
): InteractionMenuGroup[] {
  return buildOfficerInteractionGroups(
    "",
    officerId,
    credits,
    personalCooldowns,
    personalActionHistory,
    totalTicks,
    "civic",
  ).filter((group) => group.key === "personal");
}

const INSIGNIA_OPTIONS: { icon: string; label: string }[] = [
  { icon: "shield", label: "Standard Shield" },
  { icon: "shield-star", label: "Star Command" },
  { icon: "shield-crown", label: "Crown Authority" },
  { icon: "shield-sword", label: "Sword Marshal" },
  { icon: "shield-cross", label: "Iron Cross" },
  { icon: "shield-half-full", label: "Half Shield" },
  { icon: "shield-lock", label: "Lockdown" },
  { icon: "sword-cross", label: "Crossed Blades" },
  { icon: "star-four-points", label: "Quadstar" },
  { icon: "diamond-stone", label: "Black Diamond" },
  { icon: "flare", label: "Solar Flare" },
  { icon: "lightning-bolt", label: "Thunderbolt" },
  { icon: "skull", label: "Death's Head" },
  { icon: "eye-outline", label: "All-Seeing Eye" },
  { icon: "atom-variant", label: "Atomic" },
];

const INVERSE_GOOD_STATS = new Set(["corruption", "unrest", "fear", "crime"]);

type CharTab = "character" | "politics" | "innerCircle" | "retinue";
type RetinueSubTab = "guards" | "squads" | "missions";

function CharacterScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const rtStyles = useRtStyles();
  const dlgStyles = useDlgStyles();
  const chronicleStyles = useChronicleStyles();
  const insets = useSafeAreaInsets();
  const { state, setState, renamePlayer, renameCity, setInsignia, setPlayerPortraitId, setPlayerCustomPortrait, upgradeAttribute, upgradeSkill, issueDecree, appointInnerCircle, removeInnerCircle, recruitBodyguard, dismissBodyguard, performPersonalInteraction } = useGame();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { modal, showModal, hideModal } = useGameModal();

  const player = state.player ?? createDefaultPlayer();
  const commanderOrigin = getCommanderOrigin(state.commanderOrigin);
  const officerById = useMemo(() => {
    const m = new Map<string, typeof state.officers[number]>();
    for (const o of state.officers) m.set(o.id, o);
    return m;
  }, [state.officers]);
  const [editingName, setEditingName] = useState(false);
  const [editingCity, setEditingCity] = useState(false);
  const [nameInput, setNameInput] = useState(player.name);
  const [cityInput, setCityInput] = useState(state.cityName);
  const [activeTab, setActiveTab] = useState<CharTab>("character");
  const [dialogueTarget, setDialogueTarget] = useState<{ classId: BodyguardClass; bg: Bodyguard } | null>(null);
  const [dialogueTopic, setDialogueTopic] = useState<DialogueTopic | null>(null);
  const [dialogueResponse, setDialogueResponse] = useState<{ choice: DialogueChoice } | null>(null);
  const [icDialogueRole, setIcDialogueRole] = useState<InnerCircleRole | null>(null);
  const [icDialogueTopic, setIcDialogueTopic] = useState<CommandTopic | null>(null);
  const [icDialogueResponse, setIcDialogueResponse] = useState<{ choice: CommandChoice } | null>(null);
  const [retinueSubTab, setRetinueSubTab] = useState<RetinueSubTab>("guards");
  const [expandedAxis, setExpandedAxis] = useState<string | null>(null);

  const politics = state.politics ?? createDefaultPoliticsState();
  const rep = politics.reputation;
  const innerCircle = state.innerCircle ?? createDefaultInnerCircleState();
  const bodyguardState = state.bodyguards ?? createDefaultBodyguardState();
  // Filtered every render before; tabs and decree handlers iterate it
  // multiple times. Cheap memo that only re-runs when the roster changes.
  const activeGuards = useMemo(
    () => bodyguardState.roster.filter((b) => b.status !== "kia"),
    [bodyguardState.roster],
  );
  const civicFigures = useMemo(() => {
    const appointedIds = new Set(innerCircle.members.map((member) => member.officerId));
    return state.officers.filter(
      (officer) => officer.department === "civic" && !appointedIds.has(officer.id),
    );
  }, [state.officers, innerCircle.members]);
  const credits = state.resources?.credits ?? 0;
  const unlockedTechs = state.unlockedTechnologies ?? [];

  const approval = useMemo(() => {
    const cs = state.cityStats;
    const avgOfficerLoyalty = state.officers.length > 0 ? state.officers.reduce((s, o) => s + (o.loyalty ?? 50), 0) / state.officers.length : 50;
    const factionAvgRelation = state.factions.length > 0 ? state.factions.reduce((s, f) => s + (f.loyalty ?? 50), 0) / state.factions.length : 50;
    return calculateApproval({
      happiness: cs.happiness,
      unrest: cs.unrest,
      corruption: cs.corruption,
      lawOrder: cs.lawOrder,
      defenseRating: cs.defenseRating,
      avgOfficerLoyalty,
      factionAvgRelation,
    });
  }, [state.cityStats, state.factions, state.officers]);

  const threats = useMemo(() => {
    const cs = state.cityStats;
    return generatePoliticalThreats({
      officers: state.officers.map((o) => ({
        name: o.name,
        loyalty: o.loyalty ?? 50,
        ambition: o.ambition ?? 30,
        corruption: o.corruption ?? 10,
        position: o.position ?? o.rank ?? "Officer",
      })),
      unrest: cs.unrest,
      corruption: cs.corruption,
      happiness: cs.happiness,
      factions: state.factions.map((f) => ({
        name: f.name,
        influence: f.influence ?? 50,
        threat: f.threat ?? 30,
      })),
      totalTicks: state.totalTicks,
    });
  }, [state.cityStats, state.factions, state.officers, state.totalTicks]);

  // Inner-politics readout: how each active faction's ideology aligns with the
  // regime, how radicalized it has become, and any plot it is currently running.
  const factionIntrigue = useMemo(() => {
    const rad = state.intrigue?.radicalization ?? {};
    const plots = state.intrigue?.plots ?? [];
    const rows = state.factions
      .filter((f) => f.isActive)
      .map((f) => ({
        id: f.id,
        name: f.name,
        alignment: computeAlignment(f, rep),
        radicalization: Math.round(rad[f.id] ?? 0),
        plot: plots.find((p) => p.instigatorFactionId === f.id) ?? null,
      }))
      .sort((a, b) => b.radicalization - a.radicalization);
    const activePlots = [...plots].sort((a, b) => b.progress - a.progress);
    return { rows, activePlots };
  }, [state.factions, state.intrigue, rep]);

  const totalAttrPoints = Object.values(player.attributes).reduce((s, v) => s + v, 0);
  const totalSkillPoints = Object.values(player.skills).reduce((s, v) => s + v, 0);
  const xpPct = player.xpToNext > 0 ? Math.min(100, (player.xp / player.xpToNext) * 100) : 0;

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed.length > 0) renamePlayer(trimmed);
    setEditingName(false);
  };

  const handleSaveCity = () => {
    const trimmed = cityInput.trim();
    if (trimmed.length > 0) renameCity(trimmed);
    setEditingCity(false);
  };

  const handleUpgradeAttr = (attr: keyof PlayerAttributes) => {
    if (player.attributePoints <= 0) {
      showModal("NO ATTRIBUTE POINTS", "Level up to earn more attribute points.", [{ text: "OK", style: "cancel" }]);
      return;
    }
    upgradeAttribute(attr);
  };

  const handleUpgradeSkill = (skill: keyof PlayerSkills) => {
    if (player.skillPoints <= 0) {
      showModal("NO SKILL POINTS", "Level up to earn more skill points.", [{ text: "OK", style: "cancel" }]);
      return;
    }
    upgradeSkill(skill);
  };

  const handleDecree = (decreeId: string) => {
    const def = POLITICAL_DECREES_MAP[decreeId];
    if (!def) return;
    const timing = getDecreeCostTiming(def, {
      cooldownUntilTick: politics.decreeCooldowns[decreeId] ?? 0,
      currentTick: state.totalTicks,
      availableCredits: credits,
    });
    if (timing.phase === "cooldown") {
      showModal("ON COOLDOWN", formatActionCostTimingSummary(timing), [{ text: "OK", style: "cancel" }]);
      return;
    }
    if (timing.activationAffordable === false) {
      showModal("INSUFFICIENT FUNDS", formatActionCostTimingSummary(timing), [{ text: "OK", style: "cancel" }]);
      return;
    }
    const effectsList = Object.entries(def.effects)
      .filter(([, v]) => v !== 0 && v !== undefined)
      .map(([k, v]) => `${k}: ${(v as number) > 0 ? "+" : ""}${v}`)
      .join("\n");
    showModal(
      `ISSUE: ${def.name}`,
      `${def.description}\n\nEffects:\n${effectsList}\n\n${formatActionCostTimingSummary(timing)}`,
      [
        { text: "CANCEL", style: "cancel" },
        { text: "ISSUE DECREE", onPress: () => { issueDecree(decreeId); } },
      ]
    );
  };

  // Routes the officer interaction menu. "talk" opens the existing command
  // dialogue; the personal verbs confirm through a modal then apply instantly.
  const handleOfficerSelect = useCallback(
    (role: InnerCircleRole, officer: { id: string; name: string }, optionId: string) => {
      if (optionId === "talk") {
        setIcDialogueRole(role);
        setIcDialogueTopic(null);
        setIcDialogueResponse(null);
        return;
      }
      const pid = optionId as PersonalActionId;
      const def = PERSONAL_ACTIONS[pid];
      if (!def) return;
      const effects = formatPersonalActionSubtitle("officer", pid, {
        target: { kind: "officer", id: officer.id },
        history: state.personalActionHistory,
        totalTicks: state.totalTicks,
      });
      showModal(
        `${def.label}: ${officer.name}`,
        `${def.description}\n\nEffects: ${effects}`,
        [
          { text: "Abort", style: "cancel" },
          {
            text: def.label,
            style: def.variant === "danger" ? "destructive" : undefined,
            onPress: () => performPersonalInteraction({ kind: "officer", id: officer.id }, pid),
          },
        ],
      );
    },
    [showModal, performPersonalInteraction, state.personalActionHistory, state.totalTicks],
  );

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
    [showModal, performPersonalInteraction, state.personalActionHistory, state.totalTicks],
  );

  const handleCivicSelect = useCallback(
    (officer: { id: string; name: string }, optionId: string) => {
      const pid = optionId as PersonalActionId;
      const def = PERSONAL_ACTIONS[pid];
      if (!def) return;
      const effects = formatPersonalActionSubtitle("civic", pid, {
        target: { kind: "civic", id: officer.id },
        history: state.personalActionHistory,
        totalTicks: state.totalTicks,
      });
      showModal(
        `${def.label}: ${officer.name}`,
        `${def.description}\n\nEffects: ${effects}`,
        [
          { text: "Abort", style: "cancel" },
          {
            text: def.label,
            style: def.variant === "danger" ? "destructive" : undefined,
            onPress: () => performPersonalInteraction({ kind: "civic", id: officer.id }, pid),
          },
        ],
      );
    },
    [showModal, performPersonalInteraction, state.personalActionHistory, state.totalTicks],
  );

  const handleAppoint = (role: InnerCircleRole) => {
    const available = state.officers.filter((o) => !innerCircle.members.find((m) => m.officerId === o.id));
    if (available.length === 0) {
      showModal("NO OFFICERS", "No available officers to appoint. Recruit more from Administration.", [{ text: "OK", style: "cancel" }]);
      return;
    }
    const best = available.sort((a, b) => (b.competence ?? 50) - (a.competence ?? 50)).slice(0, 5);
    showModal(
      `APPOINT: ${ROLE_LABELS[role]}`,
      `${ROLE_DESCRIPTIONS[role]}\n\nSelect an officer:\n${best.map((o) => `${o.name} (${o.competence ?? 50}% competence)`).join("\n")}`,
      [
        { text: "CANCEL", style: "cancel" },
        ...best.slice(0, 3).map((o) => ({
          text: o.name.substring(0, 16),
          onPress: () => { appointInnerCircle(o.id, role); },
        })),
      ]
    );
  };

  const renderPoliticsTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <TutorialHint
        id="character_intro"
        message="Your attributes — Authority, Cunning, Charisma, Resolve — gate which edicts you can issue and how factions perceive you. Spend skill points carefully. There is no second draft."
      />
      <View style={styles.repTitleCard}>
        <MaterialCommunityIcons name="crown" size={24} color={Colors.accent} />
        <Text style={styles.repTitleText}>{rep.title}</Text>
        <Text style={styles.repTitleSub}>COMMANDER REPUTATION</Text>
      </View>

      <SectionHeader title="Reputation Axes" icon={<Feather name="bar-chart-2" size={14} color={Colors.accent} />} />
      <Text style={styles.sectionSub}>Tap an axis to see the top decrees that move it.</Text>
      {REP_AXES.map((axis) => {
        const val = typeof rep[axis.key] === "number" ? rep[axis.key] as number : 50;
        const isOpen = expandedAxis === axis.key;
        const inputs = (POLITICAL_DECREES
          .map((d) => ({ name: d.name, delta: (d.effects as Record<string, number | undefined>)[axis.key] ?? 0 }))
          .filter((x) => x.delta !== 0)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .slice(0, 3));
        return (
          <Pressable
            key={axis.key}
            style={styles.repAxisCard}
            onPress={() => setExpandedAxis(isOpen ? null : (axis.key as string))}
          >
            <View style={styles.repAxisTop}>
              <Feather name={axis.icon as any} size={12} color={Colors.accent} />
              <Text style={styles.repAxisLabel}>{axis.label}</Text>
              <Text style={styles.repAxisVal}>{val}</Text>
              <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={12} color={Colors.textMuted} />
            </View>
            <View style={styles.repAxisBar}>
              <Text style={styles.repAxisEnd}>{axis.lowLabel}</Text>
              <View style={styles.repBarBg}>
                <View style={[styles.repBarFill, { width: `${val}%` }]} />
              </View>
              <Text style={styles.repAxisEnd}>{axis.highLabel}</Text>
            </View>
            {isOpen && (
              <View style={styles.repAxisInputs}>
                <Text style={styles.repAxisInputsTitle}>TOP INPUTS</Text>
                {inputs.length === 0 ? (
                  <Text style={styles.repAxisInputEmpty}>No decrees directly move this axis.</Text>
                ) : (
                  inputs.map((inp) => (
                    <View key={inp.name} style={styles.repAxisInputRow}>
                      <Text style={styles.repAxisInputName}>{inp.name}</Text>
                      <Text style={[styles.repAxisInputDelta, { color: inp.delta > 0 ? Colors.accent : Colors.danger }]}>
                        {inp.delta > 0 ? "+" : ""}{inp.delta}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </Pressable>
        );
      })}

      <SectionHeader title="Approval Ratings" icon={<Feather name="thumbs-up" size={14} color={Colors.accent} />} />
      <View style={styles.approvalGrid}>
        {([
          { key: "citizens", label: "CITIZENS", icon: "users" },
          { key: "officers", label: "OFFICERS", icon: "shield" },
          { key: "factions", label: "FACTIONS", icon: "flag" },
          { key: "military", label: "MILITARY", icon: "crosshair" },
        ] as const).map(({ key, label, icon }) => {
          const val = approval[key];
          const color = val >= 60 ? Colors.accent : val >= 40 ? Colors.warning : Colors.danger;
          return (
            <View key={key} style={styles.approvalBox}>
              <Feather name={icon as any} size={14} color={color} />
              <Text style={[styles.approvalVal, { color }]}>{val}%</Text>
              <Text style={styles.approvalLabel}>{label}</Text>
            </View>
          );
        })}
      </View>

      {threats.length > 0 && (
        <>
          <SectionHeader title="Active Threats" icon={<Feather name="alert-triangle" size={14} color={Colors.danger} />} />
          {threats.map((t) => (
            <View key={t.id} style={[styles.threatCard, t.severity === "critical" && { borderColor: Colors.danger }]}>
              <View style={styles.threatTop}>
                <Text style={[styles.threatSev, {
                  color: t.severity === "critical" ? Colors.danger : t.severity === "high" ? Colors.warning : Colors.textMuted
                }]}>{t.severity.toUpperCase()}</Text>
                <Text style={styles.threatSource}>{t.source}</Text>
              </View>
              <Text style={styles.threatDesc}>{t.description}</Text>
            </View>
          ))}
        </>
      )}

      <SectionHeader title="Faction Alignment & Intrigue" icon={<MaterialCommunityIcons name="account-supervisor-circle" size={14} color={Colors.accent} />} />
      <Text style={styles.sectionSub}>
        Alignment affects radicalization. Highly radicalized factions can launch coups, terror cells, or assassination plots.
      </Text>

      {factionIntrigue.activePlots.length > 0 && factionIntrigue.activePlots.map((plot) => {
        const pct = Math.round(plot.progress);
        const nextWarn = pct < 33 ? 33 : pct < 66 ? 66 : 100;
        const stageLabel = plot.matured
          ? "IN MOTION — strike has begun"
          : pct >= 66
            ? "IMMINENT — operatives in position"
            : pct >= 33
              ? "ESCALATING — moving beyond rhetoric"
              : "EARLY — quiet chatter detected";
        return (
          <View key={plot.id} style={styles.plotCard}>
            <View style={styles.plotTop}>
              <Feather name="alert-octagon" size={13} color={Colors.danger} />
              <Text style={styles.plotType}>{PLOT_TYPE_LABEL[plot.type]}</Text>
              <Text style={styles.plotPct}>{plot.matured ? "ACTIVE" : `${pct}%`}</Text>
            </View>
            <Text style={styles.plotDesc}>{plot.instigatorName} — {stageLabel}</Text>
            <View style={styles.repBarBg}>
              <View style={[styles.repBarFill, { width: `${pct}%`, backgroundColor: Colors.danger }]} />
            </View>
            {!plot.matured && (
              <Text style={styles.plotNext}>Next warning sign at {nextWarn}%</Text>
            )}
          </View>
        );
      })}

      {factionIntrigue.rows.map((f) => {
        const alignColor = f.alignment >= 60 ? Colors.accent : f.alignment >= 40 ? Colors.warning : Colors.danger;
        const radColor = f.radicalization >= PLOT_THRESHOLD ? Colors.danger : f.radicalization >= 33 ? Colors.warning : Colors.textMuted;
        return (
          <View key={f.id} style={[styles.fiCard, f.plot && { borderColor: Colors.danger }]}>
            <View style={styles.fiHeader}>
              <Text style={styles.fiName}>{f.name}</Text>
              {f.plot && <Text style={styles.fiPlotBadge}>PLOTTING</Text>}
            </View>
            <View style={styles.fiRow}>
              <Text style={styles.fiLabel}>ALIGN</Text>
              <View style={styles.repBarBg}>
                <View style={[styles.repBarFill, { width: `${f.alignment}%`, backgroundColor: alignColor }]} />
              </View>
              <Text style={[styles.fiVal, { color: alignColor }]}>{f.alignment}</Text>
            </View>
            <View style={styles.fiRow}>
              <Text style={styles.fiLabel}>RADICAL</Text>
              <View style={styles.repBarBg}>
                <View style={[styles.repBarFill, { width: `${f.radicalization}%`, backgroundColor: radColor }]} />
              </View>
              <Text style={[styles.fiVal, { color: radColor }]}>{f.radicalization}</Text>
            </View>
          </View>
        );
      })}

      <SectionHeader title="Power Decrees" icon={<MaterialCommunityIcons name="gavel" size={14} color={Colors.accent} />} />
      <Text style={styles.sectionSub}>
        {politics.totalDecrees} decrees issued total
      </Text>
      {POLITICAL_DECREES.map((def) => {
        const timing = getDecreeCostTiming(def, {
          cooldownUntilTick: politics.decreeCooldowns[def.id] ?? 0,
          currentTick: state.totalTicks,
          availableCredits: credits,
        });
        const onCooldown = timing.phase === "cooldown";
        const canAfford = timing.activationAffordable !== false;
        return (
          <Pressable
            key={def.id}
            style={[styles.decreeCard, (!canAfford || onCooldown) && { opacity: 0.5 }]}
            onPress={() => handleDecree(def.id)}
          >
            <View style={styles.decreeTop}>
              <Text style={styles.decreeName}>{def.name}</Text>
              <Text style={[styles.decreeCat, { color: Colors.textMuted }]}>{def.category.toUpperCase()}</Text>
            </View>
            <Text style={styles.decreeDesc}>{def.description}</Text>
            <View style={styles.decreeEffects}>
              {Object.entries(def.effects).filter(([, v]) => v !== 0).map(([k, v]) => {
                const isGood = INVERSE_GOOD_STATS.has(k) ? (v as number) < 0 : (v as number) > 0;
                return (
                  <Text key={k} style={[styles.decreeEffectTag, { color: isGood ? Colors.accent : Colors.danger }]}>
                    {(v as number) > 0 ? "+" : ""}{v as number} {k.toUpperCase()}
                  </Text>
                );
              })}
            </View>
            <ActionCostTimingReadout model={timing} includeBehavior compact />
          </Pressable>
        );
      })}
      <View style={{ height: 30 }} />
    </ScrollView>
  );


  const circleBonuses = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const member of innerCircle.members) {
      const perks = INNER_CIRCLE_PERKS.filter((p) => p.role === member.role && p.levelRequired <= member.level);
      for (const perk of perks) {
        for (const [k, v] of Object.entries(perk.effects)) {
          totals[k] = (totals[k] ?? 0) + (v as number);
        }
      }
    }
    for (const k of Object.keys(totals)) {
      if (totals[k] === 0) delete totals[k];
    }
    return totals;
  }, [innerCircle.members]);

  const renderInnerCircleTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="INNER CIRCLE" subtitle={`${innerCircle.members.length}/6 seats filled`} icon={<MaterialCommunityIcons name="account-group" size={14} color={Colors.accent} />} />

      {innerCircle.members.length > 0 && Object.keys(circleBonuses).length > 0 && (
        <View style={styles.bonusSummaryCard}>
          <Text style={styles.bonusSummaryTitle}>ACTIVE PERK BONUSES</Text>
          <View style={styles.bonusSummaryGrid}>
            {Object.entries(circleBonuses).map(([k, v]) => {
              const isGood = INVERSE_GOOD_STATS.has(k) ? v < 0 : v > 0;
              const display = k === "tradeMod" ? `${(v * 100).toFixed(0)}%` : `${v > 0 ? "+" : ""}${v}`;
              return (
                <View key={k} style={styles.bonusChip}>
                  <Text style={[styles.bonusChipValue, { color: isGood ? Colors.accent : Colors.danger }]}>
                    {display}
                  </Text>
                  <Text style={styles.bonusChipLabel}>{k === "tradeMod" ? "TRADE" : k === "defenseRating" ? "DEFENSE" : k === "lawOrder" ? "LAW/ORDER" : k.toUpperCase()}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {ALL_ROLES.map((role) => {
        const member = innerCircle.members.find((m) => m.role === role);
        const officer = member ? officerById.get(member.officerId) ?? null : null;
        const perks = INNER_CIRCLE_PERKS.filter((p) => p.role === role);
        const unlockedPerks = member ? perks.filter((p) => member.perksUnlocked.includes(p.id) || p.levelRequired <= member.level) : [];

        return (
          <View key={role} style={[styles.circleCard, member && { borderColor: Colors.accent }]}>
            <View style={styles.circleTop}>
              <MaterialCommunityIcons
                name={role === "spymaster" ? "eye" : role === "war_marshal" ? "sword" : role === "chancellor" ? "cash" : role === "enforcer" ? "shield" : role === "diplomat" ? "handshake" : "star" as any}
                size={20}
                color={member ? Colors.accent : Colors.textMuted}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.circleRole, member && { color: Colors.accent }]}>{ROLE_LABELS[role]}</Text>
                {member && officer ? (
                  <Text style={styles.circleOfficer}>{officer.name} — LVL {member.level}</Text>
                ) : (
                  <Text style={styles.circleEmpty}>VACANT</Text>
                )}
              </View>
              {member ? (
                <Pressable style={styles.circleRemoveBtn} accessibilityRole="button" accessibilityLabel={`Dismiss ${officer?.name ?? "officer"} from ${ROLE_LABELS[role]}`} onPress={() => {
                  showModal(`DISMISS: ${officer?.name ?? "Officer"}`, `Remove from ${ROLE_LABELS[role]}? Their progress will be lost.`, [
                    { text: "KEEP", style: "cancel" },
                    { text: "DISMISS", style: "destructive", onPress: () => removeInnerCircle(member.officerId) },
                  ]);
                }}>
                  <Feather name="x" size={14} color={Colors.danger} />
                </Pressable>
              ) : (
                <Pressable style={styles.circleAppointBtn} accessibilityRole="button" accessibilityLabel={`Appoint ${ROLE_LABELS[role]}`} onPress={() => handleAppoint(role)}>
                  <Feather name="plus" size={14} color={Colors.accent} />
                </Pressable>
              )}
            </View>

            <Text style={styles.circleDesc}>{ROLE_DESCRIPTIONS[role]}</Text>

            {member && officer && (
              <>
                <View style={styles.officerEfficiency}>
                  <Text style={styles.effLabel}>EFFICIENCY</Text>
                  <View style={styles.effTags}>
                    <Text style={styles.effTag}>Competence: {officer.competence ?? 50}%</Text>
                    <Text style={styles.effTag}>Loyalty: {Math.round(officer.loyalty ?? 50)}%</Text>
                    {(officer.corruption ?? 0) > 20 && <Text style={[styles.effTag, { color: Colors.danger }]}>Corrupt: {Math.round(officer.corruption ?? 0)}%</Text>}
                  </View>
                </View>
                <OperationalEntitySheet
                  name={officer.name}
                  kind="appointed officer"
                  summary={`${officer.position} · ${officer.department.replace(/_/g, " ")}`}
                  disclosureLabel="DIRECT ACCESS"
                  evidenceLabel="COMMAND · APPOINTMENT · CAREER RECORD"
                  level="relationship"
                  compact
                  sections={[{
                    title: "OPERATIONAL READOUT",
                    rows: [
                      { label: "COMPETENCE", value: `${Math.round(officer.competence)}%` },
                      { label: "LOYALTY", value: `${Math.round(officer.loyalty)}%` },
                      { label: "CORRUPTION", value: `${Math.round(officer.corruption)}%` },
                      { label: "FACTION", value: officer.factionAffiliation ?? "NONE DECLARED" },
                    ],
                  }]}
                />
                <InteractionMenu
                  groups={buildOfficerInteractionGroups(officer.name, officer.id, credits, state.personalActionCooldowns, state.personalActionHistory, state.totalTicks)}
                  quickIds={["talk"]}
                  onSelect={(optionId) => handleOfficerSelect(role, { id: officer.id, name: officer.name }, optionId)}
                />
              </>
            )}

            {member && (
              <View style={styles.circleXP}>
                <View style={styles.circleXPRow}>
                  <Text style={styles.circleXPLabel}>XP: {member.xp}/{member.xpToNext}</Text>
                  <Text style={styles.circleXPLabel}>LEVEL {member.level}/10</Text>
                </View>
                <View style={styles.xpBarBg}>
                  <View style={[styles.xpBarFill, { width: `${member.xpToNext > 0 ? (member.xp / member.xpToNext) * 100 : 0}%` }]} />
                </View>
              </View>
            )}

            {perks.length > 0 && (
              <View style={styles.perksList}>
                {perks.map((perk) => {
                  const unlocked = member ? perk.levelRequired <= member.level : false;
                  return (
                    <View key={perk.id} style={[styles.perkItem, !unlocked && { opacity: 0.4 }]}>
                      <MaterialCommunityIcons name={unlocked ? "check-circle" : "lock"} size={12} color={unlocked ? Colors.accent : Colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.perkName}>{perk.name}</Text>
                        <Text style={styles.perkDesc}>{perk.description}</Text>
                      </View>
                      <Text style={styles.perkLevel}>LVL {perk.levelRequired}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {civicFigures.length > 0 && (
        <>
          <SectionHeader
            title="CIVIC FIGURES"
            subtitle="Named civic officers outside the Inner Circle"
            icon={<MaterialCommunityIcons name="account-tie" size={14} color={Colors.accent} />}
          />
          {civicFigures.map((officer) => (
            <View key={officer.id} style={styles.civicFigureCard}>
              <View style={styles.civicFigureHeader}>
                <MaterialCommunityIcons name="account-tie" size={16} color={Colors.accent} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.civicFigureName} numberOfLines={1}>{officer.name}</Text>
                  <Text style={styles.civicFigureRole} numberOfLines={1}>
                    {officer.position} · {officer.rank.replace(/_/g, " ").toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.civicFigureStats}>
                <Text style={styles.civicFigureStat}>LOYALTY {Math.round(officer.loyalty)}%</Text>
                <Text style={styles.civicFigureStat}>FEAR {Math.round(officer.fearFactor)}%</Text>
                <Text style={styles.civicFigureStat}>CORRUPTION {Math.round(officer.corruption)}%</Text>
              </View>
              <InteractionMenu
                groups={buildCivicInteractionGroups(
                  officer.id,
                  credits,
                  state.personalActionCooldowns,
                  state.personalActionHistory,
                  state.totalTicks,
                )}
                onSelect={(optionId) => handleCivicSelect(officer, optionId)}
              />
            </View>
          ))}
        </>
      )}

      {innerCircle.whispers.length > 0 && (
        <>
          <SectionHeader title="Whisper Feed" icon={<Feather name="message-circle" size={14} color={Colors.accent} />} />
          {innerCircle.whispers.slice(-8).reverse().map((w, i) => {
            const whisperRole = innerCircle.members.find((m) => {
              const o = officerById.get(m.officerId);
              return o?.name === w.source;
            })?.role;
            return (
              <View key={i} style={styles.whisperCard}>
                <View style={styles.whisperTop}>
                  <Text style={styles.whisperSource}>{w.source}</Text>
                  {whisperRole && <Text style={styles.whisperRole}>{ROLE_LABELS[whisperRole]}</Text>}
                </View>
                <Text style={styles.whisperText}>{w.text}</Text>
                {whisperRole && (
                  <View style={styles.whisperActions}>
                    <Pressable style={styles.whisperBtn} onPress={() => {
                      const member = innerCircle.members.find((m) => m.role === whisperRole);
                      if (member) {
                        const off = officerById.get(member.officerId);
                        if (off) {
                          setState((prev: any) => ({
                            ...prev,
                            officers: prev.officers.map((o: any) =>
                              o.id === off.id ? { ...o, loyalty: Math.min(100, (o.loyalty ?? 50) + 2) } : o
                            ),
                          }));
                        }
                      }
                      showModal("ACKNOWLEDGED", `You acknowledge ${w.source}'s counsel. Their loyalty increases slightly.`, [{ text: "NOTED", style: "cancel" }]);
                    }}>
                      <Text style={styles.whisperBtnText}>ACKNOWLEDGE</Text>
                    </Pressable>
                    <Pressable style={styles.whisperBtn} onPress={() => {
                      setIcDialogueRole(whisperRole);
                      setIcDialogueTopic(null);
                      setIcDialogueResponse(null);
                    }}>
                      <Text style={styles.whisperBtnText}>RESPOND</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );

  const canRecruit = (def: typeof BODYGUARD_DEFS[0]) => {
    if (activeGuards.length >= bodyguardState.maxSlots) return false;
    if (def.requiredTech && !unlockedTechs.includes(def.requiredTech)) return false;
    if (def.requiredLevel && player.level < def.requiredLevel) return false;
    if (credits < def.recruitCost) return false;
    if (activeGuards.find((b) => b.classId === def.classId)) return false;
    return true;
  };

  const handleRecruit = (classId: BodyguardClass) => {
    const def = BODYGUARD_DEFS_MAP[classId];
    if (!def) return;
    showModal(
      `RECRUIT ${def.name}`,
      `Assign a ${def.title} to your retinue?\n\nCost: ${formatCredits(def.recruitCost)}\n\n${def.description}`,
      [
        { text: "CANCEL", style: "cancel", onPress: hideModal },
        {
          text: "RECRUIT",
          onPress: () => {
            hideModal();
            const ok = recruitBodyguard(classId);
            if (!ok) showModal("FAILED", "Recruitment failed. Check requirements and funds.", [{ text: "OK", onPress: hideModal }]);
          },
        },
      ]
    );
  };

  const handleDismiss = (bg: Bodyguard) => {
    showModal(
      "DISMISS OPERATIVE",
      `Discharge ${bg.customName} from your retinue? This action is permanent. They know things. Things about you. Consider the implications.`,
      [
        { text: "KEEP", style: "cancel", onPress: hideModal },
        {
          text: "DISMISS",
          style: "destructive",
          onPress: () => { hideModal(); dismissBodyguard(bg.id); },
        },
      ]
    );
  };

  const getRequirementText = (def: typeof BODYGUARD_DEFS[0]): string | null => {
    if (def.requiredTech && !unlockedTechs.includes(def.requiredTech)) return `REQUIRES TECH: ${def.requiredTech.replace(/_/g, " ").toUpperCase()}`;
    if (def.requiredLevel && player.level < def.requiredLevel) return `REQUIRES LEVEL ${def.requiredLevel}`;
    if (credits < def.recruitCost) return "INSUFFICIENT FUNDS";
    if (activeGuards.find((b) => b.classId === def.classId)) return "ALREADY IN RETINUE";
    return null;
  };

  const ret = state.retinue ?? createDefaultRetinueState();

  const handleSendOnMission = (bg: Bodyguard, missionId: string) => {
    const mission = COMPANION_MISSION_DEFS_MAP[missionId];
    if (!mission) return;
    setState((prev: any) => {
      const bgState = prev.bodyguards ?? createDefaultBodyguardState();
      const roster = bgState.roster.map((b: Bodyguard) =>
        b.id === bg.id ? { ...b, status: "deployed" as const } : b
      );
      const activeMissions = prev.companionMissions ?? [];
      return {
        ...prev,
        bodyguards: { ...bgState, roster },
        companionMissions: [...activeMissions, {
          id: `mission-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          missionId,
          guardId: bg.id,
          guardName: bg.customName,
          startTick: prev.totalTicks,
          endTick: prev.totalTicks + mission.durationTicks,
          completed: false,
        }],
      };
    });
    showModal("OPERATIVE DEPLOYED", `${bg.customName} has been dispatched on ${mission.name}.\n\nDuration: ${mission.durationTicks} ticks\nRisk: ${mission.riskLevel}\n\nThey will report back upon completion.`, [{ text: "ACKNOWLEDGED" }]);
  };

  const guardBonuses = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const bg of activeGuards) {
      if (bg.status !== "active") continue;
      const def = BODYGUARD_DEFS_MAP[bg.classId];
      if (!def) continue;
      for (const ab of def.abilities) {
        if (!bg.unlockedAbilities.includes(ab.id)) continue;
        for (const [k, v] of Object.entries(ab.effects)) {
          totals[k] = (totals[k] ?? 0) + (v as number);
        }
      }
    }
    for (const k of Object.keys(totals)) {
      if (totals[k] === 0) delete totals[k];
    }
    return totals;
  }, [activeGuards]);

  const renderGuardsSubTab = () => (
    <>
      <SectionHeader title="SECURITY DETAIL" subtitle={`${activeGuards.length}/${bodyguardState.maxSlots} operatives`} icon={<MaterialCommunityIcons name="shield-account" size={14} color={Colors.accent} />} />

      {activeGuards.length > 0 && Object.keys(guardBonuses).length > 0 && (
        <View style={styles.bonusSummaryCard}>
          <Text style={styles.bonusSummaryTitle}>SECURITY BONUSES</Text>
          <View style={styles.bonusSummaryGrid}>
            {Object.entries(guardBonuses).map(([k, v]) => {
              const isGood = INVERSE_GOOD_STATS.has(k) ? v < 0 : v > 0;
              return (
                <View key={k} style={styles.bonusChip}>
                  <Text style={[styles.bonusChipValue, { color: isGood ? Colors.accent : Colors.danger }]}>
                    {v > 0 ? "+" : ""}{v}
                  </Text>
                  <Text style={styles.bonusChipLabel}>
                    {k === "assassination_protection" ? "ASSASSN PROT" : k === "defenseRating" ? "DEFENSE" : k === "intel_bonus" ? "INTEL" : k.toUpperCase()}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {activeGuards.length > 0 && (
        <>
          {activeGuards.map((bg) => {
            const def = BODYGUARD_DEFS_MAP[bg.classId];
            if (!def) return null;
            const isDeployed = bg.status === "deployed";
            const activeMission = (state.companionMissions ?? []).find((m: any) => m.guardId === bg.id && !m.completed);
            const missionDef = activeMission ? COMPANION_MISSION_DEFS_MAP[activeMission.missionId] : null;
            return (
              <View key={bg.id} style={rtStyles.guardCard}>
                <View style={rtStyles.guardHeader}>
                  <View style={rtStyles.guardHeaderLeft}>
                    <MaterialCommunityIcons name="shield-account" size={16} color={Colors.accent} />
                    <View>
                      <Text style={rtStyles.guardName}>{bg.customName}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <Text style={rtStyles.guardClass}>{CLASS_LABELS[bg.classId]}</Text>
                        <View style={rtStyles.originBadge}>
                          <Text style={rtStyles.originText}>{(bg.origin ?? def.origin).toUpperCase()}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <View style={rtStyles.guardStatusBadge}>
                    <View style={[rtStyles.statusDot, { backgroundColor: bg.status === "active" ? Colors.accent : bg.status === "deployed" ? "#FF9800" : Colors.danger }]} />
                    <Text style={rtStyles.guardStatus}>{bg.status.toUpperCase()}</Text>
                  </View>
                </View>

                {activeMission && missionDef && (
                  <View style={rtStyles.missionBanner}>
                    <MaterialCommunityIcons name={missionDef.icon as any} size={14} color="#FF9800" />
                    <Text style={rtStyles.missionBannerText}>ON MISSION: {missionDef.name}</Text>
                    <Text style={rtStyles.missionBannerTicks}>{Math.max(0, activeMission.endTick - state.totalTicks)} ticks remaining</Text>
                  </View>
                )}

                {bg.status === "injured" && (
                  <View style={[rtStyles.missionBanner, { backgroundColor: "rgba(244,67,54,0.15)", borderColor: "#F44336" }]}>
                    <MaterialCommunityIcons name="hospital-box" size={14} color="#F44336" />
                    <Text style={[rtStyles.missionBannerText, { color: "#F44336" }]}>RECOVERING FROM INJURY</Text>
                    <Text style={[rtStyles.missionBannerTicks, { color: "#F44336" }]}>{Math.max(0, 4 - (state.totalTicks - (bg.injuredAtTick ?? state.totalTicks)))} ticks</Text>
                  </View>
                )}

                <View style={rtStyles.statsRow}>
                  <View style={rtStyles.statBox}>
                    <Text style={rtStyles.statLabel}>COMBAT</Text>
                    <Text style={rtStyles.statValue}>{bg.combat}</Text>
                  </View>
                  <View style={rtStyles.statBox}>
                    <Text style={rtStyles.statLabel}>LOYALTY</Text>
                    <Text style={rtStyles.statValue}>{Math.round(bg.loyalty)}</Text>
                  </View>
                  <View style={rtStyles.statBox}>
                    <Text style={rtStyles.statLabel}>LEVEL</Text>
                    <Text style={rtStyles.statValue}>{bg.level}</Text>
                  </View>
                  <View style={rtStyles.statBox}>
                    <Text style={rtStyles.statLabel}>KILLS</Text>
                    <Text style={rtStyles.statValue}>{bg.kills}</Text>
                  </View>
                </View>
                <View style={rtStyles.lifetimeRow}>
                  <Text style={rtStyles.lifetimeStat}>MISSIONS: {bg.missionsCompleted ?? 0}</Text>
                  <Text style={rtStyles.lifetimeStat}>TOTAL XP: {(bg.xp ?? 0) + Array.from({ length: bg.level }, (_, i) => xpForBodyguardLevel(i)).reduce((a, b) => a + b, 0)}</Text>
                </View>

                <View style={rtStyles.xpBarBg}>
                  <View style={[rtStyles.xpBarFill, { width: `${Math.min(100, (bg.xp / Math.max(1, bg.xpToNext)) * 100)}%` }]} />
                </View>
                <Text style={rtStyles.xpLabel}>XP: {bg.xp} / {bg.xpToNext}</Text>

                <Text style={rtStyles.abilitiesHeader}>ABILITIES</Text>
                {def.abilities.map((ab) => {
                  const unlocked = bg.unlockedAbilities.includes(ab.id);
                  return (
                    <View key={ab.id} style={[rtStyles.abilityRow, !unlocked && rtStyles.abilityLocked]}>
                      <Feather name={unlocked ? "check-circle" : "lock"} size={10} color={unlocked ? Colors.accent : Colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[rtStyles.abilityName, !unlocked && rtStyles.abilityNameLocked]}>{ab.name}</Text>
                        <Text style={rtStyles.abilityDesc}>{ab.description}</Text>
                      </View>
                    </View>
                  );
                })}

                <View style={rtStyles.actionRow}>
                  <Pressable onPress={() => { setDialogueTarget({ classId: bg.classId, bg }); setDialogueTopic(null); setDialogueResponse(null); }} style={rtStyles.speakBtn} disabled={isDeployed}>
                    <Feather name="message-circle" size={12} color={isDeployed ? Colors.textMuted : Colors.accent} />
                    <Text style={[rtStyles.speakText, isDeployed && { color: Colors.textMuted }]}>SPEAK</Text>
                  </Pressable>
                  {bg.status === "active" && (
                    <Pressable onPress={() => {
                      showModal("DEPLOY ON MISSION", `Select a mission for ${bg.customName}:`, [
                        ...COMPANION_MISSION_DEFS.slice(0, 4).map((m) => ({
                          text: `${m.name} (${m.riskLevel})`,
                          onPress: () => handleSendOnMission(bg, m.id),
                        })),
                        { text: "CANCEL", style: "cancel" as const },
                      ]);
                    }} style={rtStyles.missionBtn}>
                      <MaterialCommunityIcons name="send" size={12} color="#FF9800" />
                      <Text style={rtStyles.missionBtnText}>DEPLOY</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => handleDismiss(bg)} style={rtStyles.dismissBtn}>
                    <Feather name="x" size={12} color={Colors.danger} />
                    <Text style={rtStyles.dismissText}>DISMISS</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </>
      )}

      {activeGuards.length === 0 && (
        <View style={rtStyles.emptyState}>
          <MaterialCommunityIcons name="shield-off-outline" size={32} color={Colors.textMuted} />
          <Text style={rtStyles.emptyTitle}>NO SECURITY DETAIL</Text>
          <Text style={rtStyles.emptyDesc}>You walk the corridors of power unguarded. Every assassin in the city knows your face. Recruit operatives below.</Text>
        </View>
      )}

      <SectionHeader title="RECRUIT OPERATIVES" subtitle="Available personnel" icon={<Feather name="plus-circle" size={14} color={Colors.accent} />} />

      {BODYGUARD_DEFS.map((def) => {
        const available = canRecruit(def);
        const lockReason = getRequirementText(def);
        return (
          <View key={def.classId} style={rtStyles.recruitCard}>
            <View style={rtStyles.recruitHeader}>
              <View style={{ flex: 1 }}>
                <Text style={rtStyles.recruitName}>{def.name}</Text>
                <Text style={rtStyles.recruitTitle}>{def.title}</Text>
              </View>
              <View style={rtStyles.originBadge}>
                <Text style={rtStyles.originText}>{def.origin.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={rtStyles.recruitDesc}>{def.description}</Text>
            <View style={rtStyles.recruitStats}>
              <Text style={rtStyles.recruitStat}>COMBAT: {def.baseCombat}</Text>
              <Text style={rtStyles.recruitStat}>LOYALTY: {def.baseLoyalty}</Text>
              <Text style={rtStyles.recruitStat}>COST: {formatCredits(def.recruitCost)}</Text>
            </View>
            {def.requiredLevel && <Text style={rtStyles.recruitReq}>MIN LEVEL: {def.requiredLevel}</Text>}
            {def.requiredTech && <Text style={rtStyles.recruitReq}>REQUIRES: {def.requiredTech.replace(/_/g, " ").toUpperCase()}</Text>}
            {lockReason && !available ? (
              <View style={rtStyles.lockedBtn}>
                <Feather name="lock" size={11} color={Colors.textMuted} />
                <Text style={rtStyles.lockedText}>{lockReason}</Text>
              </View>
            ) : (
              <Pressable onPress={() => handleRecruit(def.classId)} style={[rtStyles.recruitBtn, !available && rtStyles.recruitBtnDisabled]} disabled={!available}>
                <Feather name="plus" size={12} color={available ? Colors.bg : Colors.textMuted} />
                <Text style={[rtStyles.recruitBtnText, !available && rtStyles.recruitBtnTextDisabled]}>RECRUIT</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </>
  );

  const renderSquadsSubTab = () => {
    const squads = ret.squads ?? [];
    const captains = ret.captains ?? [];
    const troops = ret.troops ?? [];
    const totalPower = squads.reduce((sum, sq) => sum + getSquadCombatPower(state, sq.id), 0);

    return (
      <>
        <SectionHeader title="FORCE OVERVIEW" icon={<MaterialCommunityIcons name="account-group" size={14} color={Colors.accent} />} />
        <View style={rtStyles.forceGrid}>
          <View style={rtStyles.forceBox}>
            <Text style={rtStyles.forceVal}>{squads.length}</Text>
            <Text style={rtStyles.forceLabel}>SQUADS</Text>
          </View>
          <View style={rtStyles.forceBox}>
            <Text style={rtStyles.forceVal}>{troops.filter((t) => t.status !== "kia").length}</Text>
            <Text style={rtStyles.forceLabel}>TROOPS</Text>
          </View>
          <View style={rtStyles.forceBox}>
            <Text style={rtStyles.forceVal}>{captains.filter((c) => c.status === "active").length}</Text>
            <Text style={rtStyles.forceLabel}>CAPTAINS</Text>
          </View>
          <View style={rtStyles.forceBox}>
            <Text style={[rtStyles.forceVal, { color: Colors.accent }]}>{totalPower}</Text>
            <Text style={rtStyles.forceLabel}>POWER</Text>
          </View>
        </View>

        {squads.length > 0 ? (
          <>
            <SectionHeader title="ACTIVE SQUADS" subtitle={`${squads.length}/${ret.maxSquads} capacity`} icon={<MaterialCommunityIcons name="sword" size={14} color={Colors.accent} />} />
            {squads.map((sq) => {
              const captain = captains.find((c) => c.id === sq.captainId);
              const squadTroops = troops.filter((t) => t.squadId === sq.id && t.status !== "kia");
              const breakdown = getSquadCompositionBreakdown(state, sq.id);
              const power = breakdown.combatPower;
              const roleDef = SQUAD_ROLES_MAP[sq.role];

              return (
                <View key={sq.id} style={rtStyles.squadCard}>
                  <View style={rtStyles.squadHeader}>
                    <MaterialCommunityIcons name={roleDef?.icon as any ?? "account-group"} size={18} color={Colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={rtStyles.squadName}>{sq.name}</Text>
                      <Text style={rtStyles.squadRole}>{roleDef?.label ?? sq.role.toUpperCase()} — {breakdown.troopCount}/{breakdown.capacity} troops</Text>
                    </View>
                    <View style={rtStyles.powerBadge}>
                      <Text style={rtStyles.powerVal}>⚔ {power}</Text>
                    </View>
                  </View>
                  {roleDef && (
                    <Text style={rtStyles.roleDesc}>{roleDef.description}</Text>
                  )}
                  {breakdown.activeSynergies.length > 0 && (
                    <View style={rtStyles.synergyCallouts}>
                      {breakdown.activeSynergies.map((syn) => (
                        <View key={syn.id} style={rtStyles.synergyChip}>
                          <MaterialCommunityIcons name="link-variant" size={10} color={Colors.accent} />
                          <View style={{ flex: 1, marginLeft: 3 }}>
                            <Text style={rtStyles.synergyChipText}>{syn.name.toUpperCase()}</Text>
                            <Text style={rtStyles.synergyEffectText}>
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
                    <View style={rtStyles.missingSynergies}>
                      <Text style={rtStyles.missingSynergiesTitle}>MISSING COMBINATIONS</Text>
                      {breakdown.missingSynergies.slice(0, 3).map((status) => (
                        <Text key={status.synergy.id} style={rtStyles.missingSynergyText}>
                          {status.synergy.name}: add {status.missingRequirements.map((req) => req.label).join(", ")}
                        </Text>
                      ))}
                    </View>
                  )}
                  {breakdown.statusMessages.map((message) => (
                    <Text key={message} style={rtStyles.squadStatusMessage}>! {message}</Text>
                  ))}
                  {captain && (() => {
                    const traitDef = CAPTAIN_TRAITS_MAP[captain.trait];
                    return (
                      <View style={rtStyles.captainBlock}>
                        <View style={rtStyles.captainRow}>
                          <MaterialCommunityIcons name="account-star" size={14} color="#FFD700" />
                          <Text style={rtStyles.captainName}>CPT. {captain.name}</Text>
                          <Text style={rtStyles.captainTrait}>{traitDef?.name ?? captain.trait}</Text>
                          <Text style={rtStyles.captainStats}>L:{captain.leadership} C:{captain.combat} T:{captain.tactics}</Text>
                        </View>
                        {captain.status === "active" && (
                          <InteractionMenu
                            groups={buildCaptainInteractionGroups(captain.id, credits, state.personalActionCooldowns, state.personalActionHistory, state.totalTicks)}
                            onSelect={(optionId) => handleCaptainSelect(captain, optionId)}
                          />
                        )}
                        {traitDef && (
                          <View style={rtStyles.traitEffects}>
                            <Text style={rtStyles.traitDesc}>{traitDef.description}</Text>
                            <View style={rtStyles.traitTags}>
                              {traitDef.effects.combatBonus ? <Text style={rtStyles.traitTag}>⚔ +{traitDef.effects.combatBonus}</Text> : null}
                              {traitDef.effects.moraleBonus ? <Text style={[rtStyles.traitTag, traitDef.effects.moraleBonus < 0 && { color: Colors.danger }]}>{traitDef.effects.moraleBonus > 0 ? "+" : ""}{traitDef.effects.moraleBonus} morale</Text> : null}
                              {traitDef.effects.trainingSpeed ? <Text style={rtStyles.traitTag}>+{Math.round(traitDef.effects.trainingSpeed * 100)}% training</Text> : null}
                              {traitDef.effects.xpShareBonus ? <Text style={rtStyles.traitTag}>+{Math.round(traitDef.effects.xpShareBonus * 100)}% XP share</Text> : null}
                              {traitDef.effects.upkeepReduction ? <Text style={rtStyles.traitTag}>−{Math.round(traitDef.effects.upkeepReduction * 100)}% upkeep</Text> : null}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  {squadTroops.length > 0 && (
                    <View style={rtStyles.troopList}>
                      {squadTroops.slice(0, 4).map((t) => {
                        const classDef = getClassDef(t.classId);
                        const tierDef = getTierDef(t.tier);
                        return (
                          <View key={t.id} style={rtStyles.troopRow}>
                            <MaterialCommunityIcons name={classDef.icon as any} size={12} color={Colors.textSecondary} />
                            <Text style={rtStyles.troopName}>{t.customName || classDef.name}</Text>
                            <Text style={rtStyles.troopTier}>{tierDef.label}</Text>
                            <Text style={rtStyles.troopCombat}>⚔{t.combat}</Text>
                          </View>
                        );
                      })}
                      {squadTroops.length > 4 && (
                        <Text style={rtStyles.moreText}>+{squadTroops.length - 4} more...</Text>
                      )}
                    </View>
                  )}
                  <View style={rtStyles.powerBreakdown}>
                    <Text style={rtStyles.breakdownText}>Captain: +{breakdown.captainPower}</Text>
                    <Text style={rtStyles.breakdownText}>Ready: +{breakdown.troopPower}</Text>
                    <Text style={rtStyles.breakdownText}>Combos: +{breakdown.synergyPower}</Text>
                    {breakdown.formationBonusPct !== 0 && (
                      <Text style={rtStyles.breakdownText}>Formation: +{breakdown.formationPower}</Text>
                    )}
                  </View>
                  <View style={rtStyles.squadStats}>
                    <Text style={rtStyles.squadStat}>KILLS: {sq.totalKills}</Text>
                    <Text style={rtStyles.squadStat}>OPS: {sq.deploymentsCompleted}</Text>
                    <Text style={rtStyles.squadStat}>BONUS: +{sq.formationBonus}%</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <View style={rtStyles.emptyState}>
            <MaterialCommunityIcons name="account-group-outline" size={32} color={Colors.textMuted} />
            <Text style={rtStyles.emptyTitle}>NO SQUADS FORMED</Text>
            <Text style={rtStyles.emptyDesc}>Visit the Retinue screen to recruit troops, hire captains, and form squads for military operations.</Text>
          </View>
        )}

        {captains.length > 0 && squads.length === 0 && (
          <>
            <SectionHeader title="AVAILABLE CAPTAINS" icon={<MaterialCommunityIcons name="account-star" size={14} color="#FFD700" />} />
            {captains.filter((c) => c.status === "active").map((c) => (
              <View key={c.id} style={rtStyles.captainCard}>
                <MaterialCommunityIcons name="account-star" size={16} color="#FFD700" />
                <View style={{ flex: 1 }}>
                  <Text style={rtStyles.captainCardName}>{c.name} — {c.title}</Text>
                  <Text style={rtStyles.captainCardStats}>Lead:{Math.round(c.leadership)} Com:{Math.round(c.combat)} Tac:{Math.round(c.tactics)} Loy:{Math.round(c.loyalty)}</Text>
                   <InteractionMenu
                     groups={buildCaptainInteractionGroups(c.id, credits, state.personalActionCooldowns, state.personalActionHistory, state.totalTicks)}
                     onSelect={(optionId) => handleCaptainSelect(c, optionId)}
                   />
                </View>
              </View>
            ))}
          </>
        )}

        {ret.totalKills > 0 && (
          <View style={rtStyles.killBoard}>
            <Text style={rtStyles.killBoardTitle}>COMBAT RECORD</Text>
            <View style={rtStyles.killBoardRow}>
              <Text style={rtStyles.killBoardStat}>Total Kills: {ret.totalKills}</Text>
              <Text style={rtStyles.killBoardStat}>Casualties: {ret.totalCasualties}</Text>
              <Text style={rtStyles.killBoardStat}>Recruits: {ret.totalRecruits}</Text>
              <Text style={rtStyles.killBoardStat}>Promotions: {ret.totalPromotions}</Text>
            </View>
          </View>
        )}
      </>
    );
  };

  const renderMissionsSubTab = () => {
    const activeMissions = (state.companionMissions ?? []).filter((m: any) => !m.completed);
    const completedMissions = (state.companionMissions ?? []).filter((m: any) => m.completed).slice(-10).reverse();

    return (
      <>
        <SectionHeader title="COMPANION MISSIONS" subtitle="Deploy operatives on solo operations" icon={<MaterialCommunityIcons name="map-marker-path" size={14} color={Colors.accent} />} />

        {activeMissions.length > 0 && (
          <>
            <Text style={rtStyles.missionSectionLabel}>ACTIVE OPERATIONS</Text>
            {activeMissions.map((m: any) => {
              const mDef = COMPANION_MISSION_DEFS_MAP[m.missionId];
              const ticksLeft = Math.max(0, m.endTick - state.totalTicks);
              const progress = m.endTick > m.startTick ? Math.min(100, ((state.totalTicks - m.startTick) / (m.endTick - m.startTick)) * 100) : 100;
              return (
                <View key={m.id} style={rtStyles.activeMissionCard}>
                  <View style={rtStyles.activeMissionHeader}>
                    <MaterialCommunityIcons name={mDef?.icon as any ?? "map"} size={16} color="#FF9800" />
                    <View style={{ flex: 1 }}>
                      <Text style={rtStyles.activeMissionName}>{mDef?.name ?? "UNKNOWN OP"}</Text>
                      <Text style={rtStyles.activeMissionAgent}>Agent: {m.guardName}</Text>
                    </View>
                    <Text style={rtStyles.activeMissionTicks}>{ticksLeft > 0 ? `${ticksLeft} ticks` : "COMPLETE"}</Text>
                  </View>
                  <View style={rtStyles.missionProgress}>
                    <View style={[rtStyles.missionProgressFill, { width: `${progress}%` }]} />
                  </View>
                </View>
              );
            })}
          </>
        )}

        <Text style={rtStyles.missionSectionLabel}>AVAILABLE MISSIONS</Text>
        {COMPANION_MISSION_DEFS.map((m) => {
          const availableGuards = activeGuards.filter((bg) => bg.status === "active");
          const hasAvailable = availableGuards.length > 0;
          return (
            <View key={m.id} style={rtStyles.missionCard}>
              <View style={rtStyles.missionCardHeader}>
                <MaterialCommunityIcons name={m.icon as any} size={18} color={Colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={rtStyles.missionCardName}>{m.name}</Text>
                  <Text style={rtStyles.missionCardDesc}>{m.description}</Text>
                </View>
              </View>
              <View style={rtStyles.missionMeta}>
                <Text style={rtStyles.missionMetaText}>Duration: {m.durationTicks} ticks</Text>
                <Text style={[rtStyles.missionMetaText, { color: m.riskColor }]}>Risk: {m.riskLevel}</Text>
                <Text style={rtStyles.missionMetaText}>Rewards: {m.rewardSummary}</Text>
              </View>
              {(m.minCombat > 0 || m.minLevel > 1) && (
                <View style={rtStyles.missionReqs}>
                  {m.minCombat > 0 && <Text style={rtStyles.missionReqText}>Min Combat: {m.minCombat}</Text>}
                  {m.minLevel > 1 && <Text style={rtStyles.missionReqText}>Min Level: {m.minLevel}</Text>}
                  <Text style={rtStyles.missionReqText}>Failure: ~{m.failureChanceBase}%</Text>
                </View>
              )}
              {hasAvailable ? (
                <Pressable onPress={() => {
                  const suitableGuards = availableGuards.map((bg) => {
                    const meetsReqs = bg.combat >= m.minCombat && bg.level >= m.minLevel;
                    const suitability = meetsReqs ? (bg.combat >= m.minCombat * 1.5 ? "IDEAL" : "SUITABLE") : "UNDERQUALIFIED";
                    return { bg, suitability, meetsReqs };
                  }).sort((a, b) => (a.meetsReqs === b.meetsReqs ? 0 : a.meetsReqs ? -1 : 1));
                  showModal("SELECT OPERATIVE", `${m.name}\n\nRisk: ${m.riskLevel} | Min Combat: ${m.minCombat}\nHigher stats = better odds.`, [
                    ...suitableGuards.slice(0, 4).map(({ bg, suitability }) => ({
                      text: `${bg.customName} (C:${bg.combat} L:${bg.level}) [${suitability}]`,
                      onPress: () => handleSendOnMission(bg, m.id),
                    })),
                    { text: "CANCEL", style: "cancel" as const },
                  ]);
                }} style={rtStyles.missionDeployBtn}>
                  <MaterialCommunityIcons name="send" size={12} color={Colors.bg} />
                  <Text style={rtStyles.missionDeployText}>DEPLOY OPERATIVE</Text>
                </Pressable>
              ) : (
                <View style={rtStyles.missionLockedBtn}>
                  <Feather name="lock" size={11} color={Colors.textMuted} />
                  <Text style={rtStyles.missionLockedText}>{activeGuards.length === 0 ? "NO OPERATIVES" : "ALL DEPLOYED"}</Text>
                </View>
              )}
            </View>
          );
        })}

        {completedMissions.length > 0 && (
          <>
            <Text style={rtStyles.missionSectionLabel}>MISSION LOG</Text>
            {completedMissions.map((m: any) => {
              const mDef = COMPANION_MISSION_DEFS_MAP[m.missionId];
              return (
                <View key={m.id} style={rtStyles.completedMissionCard}>
                  <MaterialCommunityIcons name="check-circle" size={14} color={Colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={rtStyles.completedMissionName}>{mDef?.name ?? "UNKNOWN"}</Text>
                    <Text style={rtStyles.completedMissionAgent}>{m.guardName} — Tick {m.endTick}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </>
    );
  };

  const renderRetinueTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={rtStyles.subTabBar}>
        {([
          { key: "guards" as RetinueSubTab, label: "OPERATIVES", icon: "shield-account" },
          { key: "squads" as RetinueSubTab, label: "SQUADS", icon: "account-group" },
          { key: "missions" as RetinueSubTab, label: "MISSIONS", icon: "map-marker-path" },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setRetinueSubTab(tab.key)}
            style={[rtStyles.subTabBtn, retinueSubTab === tab.key && rtStyles.subTabBtnActive]}
          >
            <MaterialCommunityIcons name={tab.icon as any} size={12} color={retinueSubTab === tab.key ? Colors.accent : Colors.textMuted} />
            <Text style={[rtStyles.subTabText, retinueSubTab === tab.key && rtStyles.subTabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {retinueSubTab === "guards" && renderGuardsSubTab()}
      {retinueSubTab === "squads" && renderSquadsSubTab()}
      {retinueSubTab === "missions" && renderMissionsSubTab()}
      <View style={{ height: 30 }} />
    </ScrollView>
  );

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="user" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>DOSSIER</Text>
      </View>

      <View style={styles.tabBar}>
        {([
          { key: "character" as CharTab, label: "PROFILE", icon: "user" },
          { key: "politics" as CharTab, label: "POLITICS", icon: "briefcase" },
          { key: "innerCircle" as CharTab, label: "CIRCLE", icon: "users" },
          { key: "retinue" as CharTab, label: "RETINUE", icon: "shield" },
        ]).map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
          >
            <Feather name={tab.icon as "user"} size={12} color={activeTab === tab.key ? Colors.accent : Colors.textMuted} />
            <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "politics" && renderPoliticsTab()}
      {activeTab === "innerCircle" && renderInnerCircleTab()}
      {activeTab === "retinue" && renderRetinueTab()}

      {activeTab === "character" && (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identityCard}>
          {/* Portrait change-later picker. A scrollable thumbnail grid of every
              player portrait (available to any commander regardless of sex).
              The choice writes through to both player.portraitId and
              profile.portraitId so it survives slot switches and rides along
              with profile export/import. */}
          <View style={styles.portraitSelector}>
            <View style={styles.portraitFrame}>
              {(() => {
                const src = getPortrait(player.portraitId ?? "");
                return src ? (
                  <Image source={src} style={styles.portraitImg} resizeMode="cover" accessibilityLabel={`Portrait of ${player.name}`} />
                ) : (
                  <Feather name="user" size={40} color={Colors.textMuted} />
                );
              })()}
            </View>
          </View>
          {/* Upload a custom photo as the commander portrait. Writes through
              to the active profile (persisted + cloud-synced) via
              setPlayerCustomPortrait; picking a gallery thumbnail below
              switches back to a stock portrait. */}
          <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 10 }}>
            <Pressable
              onPress={async () => {
                const res = await pickCustomPortrait();
                if (res.ok) {
                  if (!setPlayerCustomPortrait(res.dataUri)) {
                    showModal("UPLOAD FAILED", "The photo could not be saved. Try a different image.", [{ text: "OK", style: "cancel" }]);
                  }
                } else if (res.reason === "permission") {
                  showModal("PHOTO ACCESS NEEDED", "Allow photo library access in your device settings to upload a portrait.", [{ text: "OK", style: "cancel" }]);
                } else if (res.reason === "invalid") {
                  showModal("UPLOAD FAILED", "That image could not be processed. Try a different photo.", [{ text: "OK", style: "cancel" }]);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Upload a portrait photo"
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard }}
            >
              <Feather name="upload" size={13} color={Colors.accent} />
              <Text style={{ color: Colors.text, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>UPLOAD PHOTO</Text>
            </Pressable>
          </View>
          <View style={{ marginBottom: 10 }}>
            <PortraitPicker selectedId={player.portraitId} onSelect={setPlayerPortraitId} size={52} />
          </View>
          <View style={styles.insigniaSelector}>
            <Pressable
              onPress={() => {
                const cur = player.insigniaIndex ?? 0;
                const prev = (cur - 1 + INSIGNIA_OPTIONS.length) % INSIGNIA_OPTIONS.length;
                setInsignia(prev);
              }}
              style={styles.insigniaArrow}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Previous insignia"
            >
              <Feather name="chevron-left" size={16} color={Colors.textMuted} />
            </Pressable>
            <View style={styles.avatarBox}>
              <MaterialCommunityIcons
                name={INSIGNIA_OPTIONS[player.insigniaIndex ?? 0]?.icon as any ?? "shield"}
                size={36}
                color={Colors.accent}
              />
              <Text style={styles.insigniaLabel}>{INSIGNIA_OPTIONS[player.insigniaIndex ?? 0]?.label ?? "Standard Shield"}</Text>
            </View>
            <Pressable
              onPress={() => {
                const cur = player.insigniaIndex ?? 0;
                const next = (cur + 1) % INSIGNIA_OPTIONS.length;
                setInsignia(next);
              }}
              style={styles.insigniaArrow}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Next insignia"
            >
              <Feather name="chevron-right" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.identityInfo}>
            {editingName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  autoFocus
                  maxLength={30}
                  placeholderTextColor={Colors.textMuted}
                  accessibilityLabel="Commander name"
                  onSubmitEditing={handleSaveName}
                />
                <Pressable onPress={handleSaveName} style={styles.editSaveBtn} accessibilityRole="button" accessibilityLabel="Save commander name">
                  <Feather name="check" size={14} color={Colors.accent} />
                </Pressable>
                <Pressable onPress={() => { setEditingName(false); setNameInput(player.name); }} style={styles.editCancelBtn} accessibilityRole="button" accessibilityLabel="Cancel name edit">
                  <Feather name="x" size={14} color={Colors.danger} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { setNameInput(player.name); setEditingName(true); }} style={styles.nameRow}>
                <Text style={styles.playerName}>{player.name}</Text>
                <Feather name="edit-2" size={12} color={Colors.textMuted} />
              </Pressable>
            )}

            <Text style={styles.playerTitle}>{player.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Feather name="compass" size={11} color={Colors.accent} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1, color: Colors.accent }}>
                ORIGIN: {commanderOrigin.name}
              </Text>
            </View>
            <View style={styles.bioRow}>
              <Text style={styles.bioLabel}>AGE: <Text style={styles.bioValue}>{player.age ?? "—"}</Text></Text>
              <Text style={styles.bioDivider}>|</Text>
              <Text style={styles.bioLabel}>SEX: <Text style={styles.bioValue}>{(player.sex ?? "—").toUpperCase()}</Text></Text>
            </View>

            {editingCity ? (
              <View style={styles.editRow}>
                <TextInput
                  style={[styles.editInput, { fontSize: 11 }]}
                  value={cityInput}
                  onChangeText={setCityInput}
                  autoFocus
                  maxLength={40}
                  placeholderTextColor={Colors.textMuted}
                  accessibilityLabel="City name"
                  onSubmitEditing={handleSaveCity}
                />
                <Pressable onPress={handleSaveCity} style={styles.editSaveBtn} accessibilityRole="button" accessibilityLabel="Save city name">
                  <Feather name="check" size={14} color={Colors.accent} />
                </Pressable>
                <Pressable onPress={() => { setEditingCity(false); setCityInput(state.cityName); }} style={styles.editCancelBtn} accessibilityRole="button" accessibilityLabel="Cancel city name edit">
                  <Feather name="x" size={14} color={Colors.danger} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { setCityInput(state.cityName); setEditingCity(true); }} style={styles.nameRow}>
                <Text style={styles.cityName}>{state.cityName}</Text>
                <Feather name="edit-2" size={10} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Pack A — Faction Banner editor + Pack B — Player Wardrobe.
            Both are strictly cosmetic; setPlayerFaction / setPlayerOutfit
            validate inputs and never throw, so any bad UI state is
            silently dropped. */}
        <FactionBannerEditor />
        <PlayerWardrobeEditor />

        <View style={styles.levelBar}>
          <View style={styles.levelRow}>
            <Text style={styles.levelLabel}>LEVEL {player.level}</Text>
            <Text style={styles.xpLabel}>{player.xp} / {player.xpToNext} XP</Text>
          </View>
          <View style={styles.xpBarBg}>
            <View style={[styles.xpBarFill, { width: `${xpPct}%` }]} />
          </View>
          <View style={styles.pointsRow}>
            <PointBadge label="ATTR PTS" value={player.attributePoints} color={player.attributePoints > 0 ? Colors.accent : Colors.textMuted} />
            <PointBadge label="SKILL PTS" value={player.skillPoints} color={player.skillPoints > 0 ? Colors.accent : Colors.textMuted} />
          </View>
        </View>

        <View style={styles.statsGrid}>
          <StatBox label="DECISIONS" value={player.totalDecisions} />
          <StatBox label="CONTRACTS" value={player.contractsCompleted} />
          <StatBox label="SENTENCED" value={player.criminalsSentenced} />
          <StatBox label="RIOTS QUELLED" value={player.riotsQuelled} />
        </View>

        <SectionHeader title="Attributes" icon={<Feather name="bar-chart-2" size={14} color={Colors.accent} />} />
        <Text style={styles.sectionSub}>
          Core abilities. {player.attributePoints > 0 ? `${player.attributePoints} point${player.attributePoints > 1 ? "s" : ""} available.` : "Level up for more points."}
        </Text>

        {ATTR_DEFS.map((attr) => {
          const val = player.attributes[attr.key];
          const maxVal = 20;
          const pct = (val / maxVal) * 100;
          const canUpgrade = player.attributePoints > 0;
          return (
            <View key={attr.key} style={styles.attrCard}>
              <View style={styles.attrTop}>
                <View style={styles.attrTitleRow}>
                  <Feather name={attr.icon as any} size={14} color={Colors.accent} />
                  <Text style={styles.attrName}>{attr.label}</Text>
                </View>
                <View style={styles.attrValBox}>
                  <Text style={styles.attrVal}>{val}</Text>
                </View>
              </View>
              <Text style={styles.attrDesc}>{attr.description}</Text>
              <View style={styles.attrEffects}>
                {attr.effects(val).map((e, i) => (
                  <Text key={i} style={styles.attrEffect}>{e}</Text>
                ))}
              </View>
              <View style={styles.attrBarRow}>
                <View style={styles.attrBarBg}>
                  <View style={[styles.attrBarFill, { width: `${pct}%` }]} />
                </View>
                <Pressable
                  onPress={() => handleUpgradeAttr(attr.key)}
                  style={[styles.upgradeBtn, !canUpgrade && styles.upgradeBtnDisabled]}
                  disabled={!canUpgrade}
                  accessibilityRole="button"
                  accessibilityLabel={`Upgrade ${attr.label}`}
                  accessibilityState={{ disabled: !canUpgrade }}
                >
                  <Feather name="plus" size={12} color={canUpgrade ? Colors.accent : Colors.textMuted} />
                </Pressable>
              </View>
            </View>
          );
        })}

        <SectionHeader title="Skills" icon={<Feather name="star" size={14} color={Colors.accent} />} />
        <Text style={styles.sectionSub}>
          Specialized abilities. {player.skillPoints > 0 ? `${player.skillPoints} point${player.skillPoints > 1 ? "s" : ""} available.` : "Level up for more points."}
        </Text>

        {SKILL_DEFS.map((skill) => {
          const val = player.skills[skill.key];
          const maxVal = 15;
          const pct = (val / maxVal) * 100;
          const canUpgrade = player.skillPoints > 0;
          const parentAttr = ATTR_DEFS_BY_KEY.get(skill.attr);
          return (
            <View key={skill.key} style={styles.skillCard}>
              <View style={styles.skillTop}>
                <View style={styles.attrTitleRow}>
                  <Feather name={skill.icon as any} size={12} color={Colors.textSecondary} />
                  <Text style={styles.skillName}>{skill.label}</Text>
                </View>
                <View style={styles.skillMeta}>
                  <Text style={styles.skillAttrTag}>{parentAttr?.label}</Text>
                  <View style={styles.skillValBox}>
                    <Text style={styles.skillVal}>{val}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.skillDesc}>{skill.description}</Text>
              <View style={styles.attrBarRow}>
                <View style={styles.skillBarBg}>
                  <View style={[styles.skillBarFill, { width: `${pct}%` }]} />
                </View>
                <Pressable
                  onPress={() => handleUpgradeSkill(skill.key)}
                  style={[styles.upgradeBtn, !canUpgrade && styles.upgradeBtnDisabled]}
                  disabled={!canUpgrade}
                  accessibilityRole="button"
                  accessibilityLabel={`Upgrade ${skill.label}`}
                  accessibilityState={{ disabled: !canUpgrade }}
                >
                  <Feather name="plus" size={12} color={canUpgrade ? Colors.accent : Colors.textMuted} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {(player.traits ?? []).length > 0 && (
          <>
            <SectionHeader title="Traits" icon={<Feather name="award" size={14} color={Colors.accent} />} />
            {(player.traits ?? []).map((trait) => {
              const visual = getTraitVisual(trait);
              const traitColor = Colors[visual.color] ?? Colors.warning;
              return (
                <Pressable
                  key={trait}
                  style={styles.traitCard}
                  onPress={() =>
                    showModal(trait.toUpperCase(), TRAIT_DESCRIPTIONS[trait] ?? "A defining characteristic of the City Commander.", [
                      { text: "OK", style: "cancel" as const },
                    ])
                  }
                >
                  <View style={styles.traitTop}>
                    <MaterialCommunityIcons name={visual.icon} size={12} color={traitColor} />
                    <Text style={styles.traitName}>{trait}</Text>
                    <Feather name="info" size={11} color={Colors.textMuted} style={{ marginLeft: "auto" }} />
                  </View>
                  <Text style={styles.traitDesc}>
                    {TRAIT_DESCRIPTIONS[trait] ?? "A defining characteristic of the City Commander."}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}

        {(player.decorations ?? []).length > 0 && (
          <>
            <SectionHeader title="Decorations & Commendations" icon={<MaterialCommunityIcons name="medal" size={14} color={Colors.accent} />} />
            {(player.decorations ?? []).map((dec, i) => (
              <View key={i} style={styles.traitCard}>
                <View style={styles.traitTop}>
                  <Feather name="award" size={12} color={Colors.accent} />
                  <Text style={styles.traitName}>{dec}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        <SectionHeader title="Augmentation Slots" icon={<MaterialCommunityIcons name="chip" size={14} color={Colors.accent} />} />
        <Text style={styles.sectionSub}>
          {(player.augmentationSlots ?? []).filter((s) => s.installed).length} / {(player.augmentationSlots ?? []).length} slots installed
        </Text>
        {(["head", "spine", "torso", "arms", "legs", "internal"] as const).map((region) => {
          const regionSlots = (player.augmentationSlots ?? []).filter((s) => s.bodyRegion === region);
          if (regionSlots.length === 0) return null;
          return (
            <View key={region} style={styles.augRegion}>
              <Text style={styles.augRegionLabel}>{region.toUpperCase()}</Text>
              {regionSlots.map((slot) => {
                const installedAug = slot.installed ? AUGMENT_MAP[slot.installed] : null;
                return (
                  <Pressable
                    key={slot.id}
                    style={styles.augSlotCard}
                    onPress={() => {
                      if (slot.installed) {
                        showModal(
                          `REMOVE: ${installedAug?.name ?? slot.installed}`,
                          `Remove this augmentation from ${slot.label}?\n\nCost: 2,000 credits\n\n${installedAug ? Object.entries(installedAug.effects).map(([k, v]) => `${k}: +${v}`).join(", ") : ""}`,
                          [
                            { text: "REMOVE", style: "destructive", onPress: () => {
                              setState((prev: any) => {
                                const copy = JSON.parse(JSON.stringify(prev));
                                const result = removeAugmentation(copy, slot.id);
                                if (!result.success) {
                                  setTimeout(() => showModal("REMOVAL FAILED", result.message, [{ text: "OK", style: "cancel" as const }]), 100);
                                  return prev;
                                }
                                return copy;
                              });
                            }},
                            { text: "CANCEL", style: "cancel" },
                          ],
                        );
                      } else {
                        const compatible = AUGMENTS.filter(a => {
                          const regionMap: Record<string, string[]> = {
                            head: ["brain", "vision", "sensory"],
                            spine: ["speed", "survival"],
                            torso: ["survival", "strength", "experimental"],
                            arms: ["strength", "combat", "utility"],
                            legs: ["speed", "strength"],
                            internal: ["social", "survival", "experimental", "utility"],
                          };
                          return (regionMap[region] ?? []).includes(a.category);
                        });
                        if (compatible.length === 0) {
                          showModal("NO COMPATIBLE AUGMENTS", `No augmentations available for ${region.toUpperCase()} region.`, [{ text: "OK", style: "cancel" }]);
                          return;
                        }
                        const buttons: Array<{ text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }> = compatible.slice(0, 8).map(aug => {
                          const cost = 5000 + Object.values(aug.effects).reduce((s, v) => s + Math.abs(v) * 500, 0);
                          return {
                            text: `${aug.name} (${cost.toLocaleString()}cr)`,
                            onPress: () => {
                              setState((prev: any) => {
                                const copy = JSON.parse(JSON.stringify(prev));
                                const result = installAugmentation(copy, slot.id, aug.id);
                                if (!result.success) {
                                  setTimeout(() => showModal("INSTALL FAILED", result.message, [{ text: "OK", style: "cancel" as const }]), 100);
                                  return prev;
                                }
                                return copy;
                              });
                            },
                          };
                        });
                        buttons.push({ text: "CANCEL", style: "cancel" });
                        showModal(`INSTALL: ${slot.label}`, `Select augmentation for ${region.toUpperCase()} slot:`, buttons);
                      }
                    }}
                  >
                    <View style={styles.augSlotRow}>
                      <MaterialCommunityIcons
                        name={slot.installed ? "chip" : "checkbox-blank-outline"}
                        size={14}
                        color={slot.installed ? Colors.accent : Colors.textMuted}
                      />
                      <Text style={[styles.augSlotLabel, slot.installed && styles.augSlotLabelActive]}>{slot.label}</Text>
                    </View>
                    <Text style={styles.augSlotStatus}>{installedAug?.name ?? (slot.installed || "TAP TO INSTALL")}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        <SectionHeader title="PERSONAL CHRONICLE" subtitle="Your story, told five ways" />
        <View style={chronicleStyles.grid}>
          {[
            { route: "/(game)/journal", icon: "book-open", title: "JOURNAL", body: "Your run, narrated tick by tick." },
            { route: "/(game)/goals", icon: "target", title: "GOALS", body: "Three personal objectives, refreshed as you grow." },
            { route: "/(game)/firsts", icon: "award", title: "TROPHY WALL", body: "Every first you’ve ever achieved." },
            { route: "/(game)/logbook", icon: "book", title: "LOGBOOK", body: "Factions, places and people you’ve met." },
            { route: "/(game)/propaganda", icon: "radio", title: "PROPAGANDA", body: "How the regime tells your story." },
          ].map((c) => (
            <Pressable
              key={c.route}
              onPress={() => router.push(c.route as any)}
              style={chronicleStyles.card}
            >
              <View style={chronicleStyles.iconBox}>
                <Feather name={c.icon as any} size={16} color={Colors.accent} />
              </View>
              <View style={chronicleStyles.cardBody}>
                <Text style={chronicleStyles.cardTitle}>{c.title}</Text>
                <Text style={chronicleStyles.cardText} numberOfLines={2}>{c.body}</Text>
              </View>
              <Feather name="chevron-right" size={14} color={Colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
      )}
      <GameModal {...modal} onDismiss={hideModal} />

      {dialogueTarget && (
        <GameModal
          visible={true}
          title={`${dialogueTarget.bg.customName} — ${CLASS_LABELS[dialogueTarget.classId]}`}
          message=""
          buttons={[{ text: "CLOSE", onPress: () => { setDialogueTarget(null); setDialogueTopic(null); setDialogueResponse(null); } }]}
          onDismiss={() => { setDialogueTarget(null); setDialogueTopic(null); setDialogueResponse(null); }}
        >
          <ScrollView style={{ maxHeight: 400 }}>
            {!dialogueTopic && !dialogueResponse && (
              <View>
                <Text style={dlgStyles.prompt}>Choose a topic of conversation.</Text>
                {(() => {
                  const liveGuard = bodyguardState.roster.find((b) => b.id === dialogueTarget!.bg.id);
                  const usedTopics = liveGuard?.usedDialogueTopics ?? [];
                  return getRetinueTopics(dialogueTarget.classId).map((topic) => {
                    const discussed = usedTopics.includes(topic.id);
                    return (
                      <Pressable key={topic.id} onPress={() => setDialogueTopic(topic)} style={dlgStyles.topicBtn}>
                        <Feather name={discussed ? "check-circle" : "message-circle"} size={14} color={discussed ? Colors.textMuted : Colors.accent} />
                        <Text style={[dlgStyles.topicText, discussed && { color: Colors.textMuted }]}>
                          {topic.title}{discussed ? "  · discussed" : ""}
                        </Text>
                      </Pressable>
                    );
                  });
                })()}
              </View>
            )}
            {dialogueTopic && !dialogueResponse && (
              <View>
                <Text style={dlgStyles.topicText}>{dialogueTopic.title}</Text>
                <Text style={dlgStyles.prompt}>Select an action.</Text>
                <View style={dlgStyles.choiceDivider} />
                {dialogueTopic.choices.map((choice) => (
                  <Pressable
                    key={choice.id}
                    onPress={() => {
                      setDialogueResponse({ choice });
                      const topicId = dialogueTopic.id;
                      setState((prev) => {
                        const bgs = prev.bodyguards ?? createDefaultBodyguardState();
                        const target = bgs.roster.find((b) => b.id === dialogueTarget!.bg.id);
                        // Reward each topic only ONCE per guard. Re-opening a
                        // discussed topic still shows its text (the response
                        // panel above) but grants nothing, closing the
                        // infinite-XP/loyalty/credits dialogue farm.
                        if ((target?.usedDialogueTopics ?? []).includes(topicId)) {
                          return prev;
                        }
                        const newRoster = bgs.roster.map((b) => {
                          if (b.id !== dialogueTarget!.bg.id) return b;
                          return {
                            ...b,
                            loyalty: Math.min(100, Math.max(0, b.loyalty + (choice.effects.loyalty ?? 0))),
                            combat: b.combat + (choice.effects.combat ?? 0),
                            xp: b.xp + (choice.effects.xp ?? 0),
                            usedDialogueTopics: [...(b.usedDialogueTopics ?? []), topicId],
                          };
                        });
                        const next = applyDialogueCityEffects(prev, choice.effects);
                        return {
                          ...next,
                          bodyguards: { ...bgs, roster: newRoster },
                        };
                      });
                    }}
                    style={dlgStyles.choiceBtn}
                  >
                    <Text style={dlgStyles.choiceText}>{dialogueActionLabel(choice.id, dialogueTopic.id)}</Text>
                    <Text style={dlgStyles.effectPreviewLabel}>EFFECTS</Text>
                    <View style={dlgStyles.effectsRow}>
                      {Object.entries(choice.effects)
                        .filter(([, v]) => typeof v === "number" && v !== 0)
                        .map(([k, v]) => (
                          <Text key={k} style={[dlgStyles.effectTag, { color: (v as number) > 0 ? Colors.accent : Colors.danger }]}>
                            {k.toUpperCase()} {(v as number) > 0 ? "+" : ""}{v}
                          </Text>
                        ))}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            {dialogueResponse && (
              <View>
                <Text style={dlgStyles.topicText}>ACTION APPLIED</Text>
                <View style={dlgStyles.effectsRow}>
                  {Object.entries(dialogueResponse.choice.effects).filter(([, v]) => v !== 0).map(([k, v]) => (
                    <Text key={k} style={[dlgStyles.effectTag, { color: (v as number) > 0 ? Colors.accent : Colors.danger }]}>
                      {k.toUpperCase()} {(v as number) > 0 ? "+" : ""}{v}
                    </Text>
                  ))}
                </View>
                <Pressable onPress={() => { setDialogueTopic(null); setDialogueResponse(null); }} style={dlgStyles.backBtn}>
                  <Text style={dlgStyles.backText}>ANOTHER TOPIC</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </GameModal>
      )}

      {icDialogueRole && (
        <GameModal
          visible={true}
          title={`${ROLE_LABELS[icDialogueRole]} — AUDIENCE`}
          message=""
          buttons={[{ text: "CLOSE", onPress: () => { setIcDialogueRole(null); setIcDialogueTopic(null); setIcDialogueResponse(null); } }]}
          onDismiss={() => { setIcDialogueRole(null); setIcDialogueTopic(null); setIcDialogueResponse(null); }}
        >
          <ScrollView style={{ maxHeight: 400 }}>
            {!icDialogueTopic && !icDialogueResponse && (
              <View>
                <Text style={dlgStyles.prompt}>Choose a briefing topic.</Text>
                {getCommandTopics(icDialogueRole).map((topic) => (
                  <Pressable key={topic.id} onPress={() => setIcDialogueTopic(topic)} style={dlgStyles.topicBtn}>
                    <Feather name="briefcase" size={14} color={Colors.accent} />
                    <Text style={dlgStyles.topicText}>{topic.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {icDialogueTopic && !icDialogueResponse && (
              <View>
                <Text style={dlgStyles.topicText}>{icDialogueTopic.title}</Text>
                <Text style={dlgStyles.prompt}>Select an action.</Text>
                <View style={dlgStyles.choiceDivider} />
                {icDialogueTopic.choices.map((choice) => (
                  <Pressable
                    key={choice.id}
                    onPress={() => {
                      setIcDialogueResponse({ choice });
                      setState((prev) => {
                        const member = prev.innerCircle?.members.find((m) => m.role === icDialogueRole);
                        const next = applyDialogueCityEffects(prev, choice.effects);
                        return {
                          ...next,
                          officers: prev.officers.map((officer) => (
                            officer.id === member?.officerId
                              ? {
                                  ...officer,
                                  loyalty: Math.max(0, Math.min(100, officer.loyalty + (choice.effects.loyalty ?? 0))),
                                  competence: Math.max(0, Math.min(100, officer.competence + (choice.effects.competence ?? 0))),
                                }
                              : officer
                          )),
                        };
                      });
                    }}
                    style={dlgStyles.choiceBtn}
                  >
                    <Text style={dlgStyles.choiceText}>{dialogueActionLabel(choice.id, icDialogueTopic.id)}</Text>
                    <Text style={dlgStyles.effectPreviewLabel}>EFFECTS</Text>
                    <View style={dlgStyles.effectsRow}>
                      {Object.entries(choice.effects)
                        .filter(([, v]) => typeof v === "number" && v !== 0)
                        .map(([k, v]) => (
                          <Text key={k} style={[dlgStyles.effectTag, { color: (v as number) > 0 ? Colors.accent : Colors.danger }]}>
                            {k.toUpperCase()} {(v as number) > 0 ? "+" : ""}{v}
                          </Text>
                        ))}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            {icDialogueResponse && (
              <View>
                <Text style={dlgStyles.topicText}>ACTION APPLIED</Text>
                <View style={dlgStyles.effectsRow}>
                  {Object.entries(icDialogueResponse.choice.effects).filter(([, v]) => v !== 0).map(([k, v]) => (
                    <Text key={k} style={[dlgStyles.effectTag, { color: (v as number) > 0 ? Colors.accent : Colors.danger }]}>
                      {k.toUpperCase()} {(v as number) > 0 ? "+" : ""}{v}
                    </Text>
                  ))}
                </View>
                <Pressable onPress={() => { setIcDialogueTopic(null); setIcDialogueResponse(null); }} style={dlgStyles.backBtn}>
                  <Text style={dlgStyles.backText}>ANOTHER TOPIC</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </GameModal>
      )}
    </View>
  );
}

/**
 * ── Pack A — Faction Banner editor.
 *
 * Lets the player rename their banner, edit its motto, and reskin the
 * primary color and glyph. All edits commit straight to state via
 * setPlayerFaction, which validates each field; bad values are dropped
 * silently rather than throwing, so the editor is safe even with
 * stale UI input.
 *
 * This is its own component (rather than inline JSX) so it can call
 * useGame() and re-render only when its slice of state changes — the
 * surrounding character screen is large and we don't want to re-render
 * everything on every keystroke.
 */
function FactionBannerEditor() {
  const { colors: Colors } = useTheme();
  const cosmeticStyles = useCosmeticStyles();
  const { state, setState } = useGame();
  const fact = getPlayerFaction(state);

  // Local mirrors for the text inputs so typing doesn't roundtrip
  // through reducer + JSON serialize on every keystroke. We commit
  // to state on blur; if the player closes the screen without
  // blurring, expo-router unmounts and we lose unsaved text — that's
  // a deliberate trade-off, identical to how the name field above
  // already works (see editingName/handleSaveName).
  const [name, setName] = useState(fact.name);
  const [motto, setMotto] = useState(fact.motto);

  const commit = (patch: Parameters<typeof setPlayerFaction>[1]) => {
    setState((prev) => setPlayerFaction(prev, patch));
  };

  return (
    <View style={cosmeticStyles.card}>
      <View style={cosmeticStyles.cardHeader}>
        <Feather name="flag" size={14} color={fact.primaryColor} />
        <Text style={[cosmeticStyles.cardTitle, { color: fact.primaryColor }]}>FACTION BANNER</Text>
      </View>

      {/* Live preview row */}
      <View style={[cosmeticStyles.previewRow, { borderColor: fact.primaryColor + "60", backgroundColor: fact.secondaryColor + "30" }]}>
        <View style={[cosmeticStyles.glyphSwatch, { backgroundColor: fact.secondaryColor, borderColor: fact.primaryColor }]}>
          <Insignia id={fact.glyph} size={36} color={fact.primaryColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[cosmeticStyles.previewName, { color: fact.primaryColor }]} numberOfLines={1}>{fact.name.toUpperCase()}</Text>
          <Text style={cosmeticStyles.previewMotto} numberOfLines={2}>"{fact.motto}"</Text>
        </View>
      </View>

      <Text style={cosmeticStyles.fieldLabel}>BANNER NAME</Text>
      <TextInput
        style={cosmeticStyles.input}
        value={name}
        onChangeText={setName}
        onBlur={() => { if (name !== fact.name) commit({ name }); }}
        maxLength={PLAYER_FACTION_NAME_MAX}
        autoCorrect={false}
        autoCapitalize="characters"
        placeholderTextColor={Colors.textMuted}
        accessibilityLabel="Banner name"
      />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <Text style={cosmeticStyles.fieldLabel}>MOTTO</Text>
        <Pressable
          onPress={() => {
            const next = rollPlayerFactionMotto(motto);
            setMotto(next);
            commit({ motto: next });
          }}
          accessibilityLabel="Roll a random motto"
          style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: fact.primaryColor, borderRadius: 4 }}
        >
          <MaterialCommunityIcons name="dice-multiple" size={12} color={fact.primaryColor} />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1, color: fact.primaryColor }}>ROLL</Text>
        </Pressable>
      </View>
      <TextInput
        style={cosmeticStyles.input}
        value={motto}
        onChangeText={setMotto}
        onBlur={() => { if (motto !== fact.motto) commit({ motto }); }}
        maxLength={PLAYER_FACTION_MOTTO_MAX}
        autoCorrect={false}
        placeholderTextColor={Colors.textMuted}
        accessibilityLabel="Faction motto"
      />

      <Text style={[cosmeticStyles.fieldLabel, { marginTop: 10 }]}>PRIMARY COLOR</Text>
      <View style={cosmeticStyles.swatchRow}>
        {PLAYER_FACTION_PALETTE.map((c) => {
          const selected = fact.primaryColor === c.hex;
          return (
            <Pressable
              key={c.id}
              onPress={() => commit({ primaryColor: c.hex })}
              accessibilityLabel={`Pick color ${c.label}`}
              style={[cosmeticStyles.colorSwatch, { backgroundColor: c.hex, borderWidth: selected ? 3 : 1, borderColor: selected ? Colors.text : Colors.border }]}
            />
          );
        })}
      </View>

      <Text style={[cosmeticStyles.fieldLabel, { marginTop: 10 }]}>BACKGROUND COLOR</Text>
      <View style={cosmeticStyles.swatchRow}>
        {PLAYER_FACTION_BG_PALETTE.map((c) => {
          const selected = fact.secondaryColor === c.hex;
          return (
            <Pressable
              key={c.id}
              onPress={() => commit({ secondaryColor: c.hex })}
              accessibilityLabel={`Pick background color ${c.label}`}
              style={[cosmeticStyles.colorSwatch, { backgroundColor: c.hex, borderWidth: selected ? 3 : 1, borderColor: selected ? Colors.text : Colors.border }]}
            />
          );
        })}
      </View>

      <Text style={[cosmeticStyles.fieldLabel, { marginTop: 10 }]}>BANNER GLYPH</Text>
      <View style={cosmeticStyles.swatchRow}>
        {PLAYER_FACTION_GLYPHS.map((g) => {
          const selected = fact.glyph === g.id;
          return (
            <Pressable
              key={g.id}
              onPress={() => commit({ glyph: g.id as PlayerFactionGlyph })}
              accessibilityLabel={`Pick glyph ${g.label}`}
              style={[
                cosmeticStyles.glyphCell,
                {
                  backgroundColor: selected ? fact.primaryColor + "22" : Colors.bg,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? fact.primaryColor : Colors.border,
                },
              ]}
            >
              <Insignia id={g.id} size={30} color={selected ? fact.primaryColor : Colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * ── Pack B — Player Wardrobe.
 *
 * Two stepper-style pickers (uniform + sidearm) that walk the
 * UNIFORM_VARIANTS / SIDEARM_VARIANTS arrays. Strictly cosmetic; the
 * helpers in engine/wardrobe coerce unknown ids back to the defaults
 * so saves remain consistent across version changes.
 */
function PlayerWardrobeEditor() {
  const { colors: Colors } = useTheme();
  const cosmeticStyles = useCosmeticStyles();
  const { state, setState } = useGame();
  const outfit = getPlayerOutfit(state);
  const uniformIdx = UNIFORM_VARIANTS.findIndex((u) => u.id === outfit.uniformId);
  const sidearmIdx = SIDEARM_VARIANTS.findIndex((s) => s.id === outfit.sidearmId);

  const stepUniform = (delta: number) => {
    const next = (uniformIdx + delta + UNIFORM_VARIANTS.length) % UNIFORM_VARIANTS.length;
    setState((prev) => setPlayerOutfit(prev, { uniformId: UNIFORM_VARIANTS[next].id as UniformId }));
  };
  const stepSidearm = (delta: number) => {
    const next = (sidearmIdx + delta + SIDEARM_VARIANTS.length) % SIDEARM_VARIANTS.length;
    setState((prev) => setPlayerOutfit(prev, { sidearmId: SIDEARM_VARIANTS[next].id as SidearmId }));
  };

  const u = UNIFORM_VARIANTS[Math.max(0, uniformIdx)];
  const s = SIDEARM_VARIANTS[Math.max(0, sidearmIdx)];

  return (
    <View style={cosmeticStyles.card}>
      <View style={cosmeticStyles.cardHeader}>
        <Feather name="shield" size={14} color={Colors.accent} />
        <Text style={[cosmeticStyles.cardTitle, { color: Colors.accent }]}>WARDROBE</Text>
      </View>
      <Text style={cosmeticStyles.cardSub}>{formatOutfitSummary(outfit)}</Text>

      <Text style={[cosmeticStyles.fieldLabel, { marginTop: 10 }]}>UNIFORM</Text>
      <View style={cosmeticStyles.stepperRow}>
        <Pressable onPress={() => stepUniform(-1)} style={cosmeticStyles.stepBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous uniform">
          <Feather name="chevron-left" size={16} color={Colors.textMuted} />
        </Pressable>
        <View style={cosmeticStyles.stepperValue}>
          <Text style={cosmeticStyles.stepperName}>{u.label}</Text>
          <Text style={cosmeticStyles.stepperBlurb}>{u.description}</Text>
        </View>
        <Pressable onPress={() => stepUniform(1)} style={cosmeticStyles.stepBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next uniform">
          <Feather name="chevron-right" size={16} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Text style={[cosmeticStyles.fieldLabel, { marginTop: 10 }]}>SIDEARM</Text>
      <View style={cosmeticStyles.stepperRow}>
        <Pressable onPress={() => stepSidearm(-1)} style={cosmeticStyles.stepBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous sidearm">
          <Feather name="chevron-left" size={16} color={Colors.textMuted} />
        </Pressable>
        <View style={cosmeticStyles.stepperValue}>
          <Text style={cosmeticStyles.stepperName}>{s.label}</Text>
          <Text style={cosmeticStyles.stepperBlurb}>{s.description}</Text>
        </View>
        <Pressable onPress={() => stepSidearm(1)} style={cosmeticStyles.stepBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next sidearm">
          <Feather name="chevron-right" size={16} color={Colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const useCosmeticStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  card: {
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderRadius: 4, marginBottom: 10 },
  glyphSwatch: { width: 48, height: 48, borderRadius: 4, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  previewName: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.2 },
  previewMotto: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 2, fontStyle: "italic" },
  fieldLabel: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.5, color: Colors.textMuted, marginBottom: 4 },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  colorSwatch: { width: 28, height: 28, borderRadius: 4 },
  glyphCell: { width: 42, height: 42, borderRadius: 4, justifyContent: "center", alignItems: "center" },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, backgroundColor: Colors.bg },
  stepBtn: { width: 28, height: 28, justifyContent: "center", alignItems: "center" },
  stepperValue: { flex: 1 },
  stepperName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, letterSpacing: 0.5 },
  stepperBlurb: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 1 },
}));

const PointBadge = React.memo(function PointBadge({ label, value, color }: { label: string; value: number; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.pointBadge}>
      <Text style={styles.pointLabel}>{label}</Text>
      <Text style={[styles.pointValue, { color }]}>{value}</Text>
    </View>
  );
});

const StatBox = React.memo(function StatBox({ label, value }: { label: string; value: number }) {
  const styles = useStyles();
  return (
    <View style={styles.statBox}>
      <Text style={styles.statBoxValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
});

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
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: Colors.accent },
  tabBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: Colors.textMuted, letterSpacing: 1 },
  tabBtnTextActive: { color: Colors.accent },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 14 },
  sectionSub: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 10, marginTop: -4 },

  repTitleCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 6,
    padding: 16,
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  repTitleText: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: 1.5 },
  repTitleSub: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 1 },

  repAxisCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, marginBottom: 6 },
  repAxisTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  repAxisLabel: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5, flex: 1 },
  repAxisVal: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 13 },
  repAxisBar: { flexDirection: "row", alignItems: "center", gap: 6 },
  repAxisEnd: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, width: 52 },
  repAxisInputs: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  repAxisInputsTitle: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1.2, marginBottom: 4 },
  repAxisInputRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  repAxisInputName: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10, flex: 1 },
  repAxisInputDelta: { fontFamily: "Inter_700Bold", fontSize: 10 },
  repAxisInputEmpty: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, fontStyle: "italic" },
  repBarBg: { flex: 1, height: 6, backgroundColor: Colors.bg, borderRadius: 3, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  repBarFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 2 },

  approvalGrid: { flexDirection: "row", gap: 6, marginBottom: 14 },
  approvalBox: { flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, alignItems: "center", gap: 4 },
  approvalVal: { fontFamily: "Inter_700Bold", fontSize: 18 },
  approvalLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.5 },

  threatCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, marginBottom: 6 },
  threatTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  threatSev: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  threatSource: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10, flex: 1 },
  threatDesc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  plotCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.danger, borderRadius: 4, padding: 10, marginBottom: 6 },
  plotTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  plotType: { color: Colors.danger, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5, flex: 1 },
  plotPct: { color: Colors.danger, fontFamily: "Inter_700Bold", fontSize: 12 },
  plotDesc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginBottom: 6 },
  plotNext: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 5 },
  fiCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, marginBottom: 6 },
  fiHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  fiName: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1 },
  fiPlotBadge: { color: Colors.danger, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5, borderWidth: 1, borderColor: Colors.danger, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  fiRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  fiLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.5, width: 50 },
  fiVal: { fontFamily: "Inter_700Bold", fontSize: 12, width: 28, textAlign: "right" },

  decreeCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  decreeTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  decreeName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5, flex: 1 },
  decreeCat: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 },
  decreeDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 6, lineHeight: 16 },
  decreeEffects: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  decreeEffectTag: { fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.3, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1, overflow: "hidden" },

  bonusSummaryCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.accent, borderRadius: 4, padding: 12, marginBottom: 12 },
  bonusSummaryTitle: { fontFamily: "Inter_700Bold", fontSize: 9, color: Colors.accent, letterSpacing: 1.5, marginBottom: 8 },
  bonusSummaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  bonusChip: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  bonusChipValue: { fontFamily: "Inter_700Bold", fontSize: 10 },
  bonusChipLabel: { fontFamily: "Inter_500Medium", fontSize: 7, color: Colors.textMuted, letterSpacing: 0.3 },

  circleCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 10 },
  circleTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  circleRole: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 },
  circleOfficer: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10 },
  circleEmpty: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10, fontStyle: "italic" },
  circleDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15, marginBottom: 6 },
  circleRemoveBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.danger, borderRadius: 4 },
  circleAppointBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.accent, borderRadius: 4, backgroundColor: Colors.accentDark },
  circleXP: { marginBottom: 8 },
  circleXPRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  circleXPLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.5 },
  xpBarBg: { height: 6, backgroundColor: Colors.bg, borderRadius: 3, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  xpBarFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 2 },
  perksList: { gap: 4 },
  perkItem: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 4 },
  perkName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.3 },
  perkDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9 },
  perkLevel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9 },

  civicFigureCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  civicFigureHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  civicFigureName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.3 },
  civicFigureRole: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 2 },
  civicFigureStats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 },
  civicFigureStat: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.3 },

  whisperCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.accent, borderRadius: 4, padding: 10, marginBottom: 6 },
  whisperTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  whisperSource: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
  whisperRole: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 7, letterSpacing: 0.5, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1, overflow: "hidden" },
  whisperText: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, fontStyle: "italic" },
  whisperActions: { flexDirection: "row", gap: 6, marginTop: 6 },
  whisperBtn: { flex: 1, alignItems: "center", paddingVertical: 4, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, backgroundColor: Colors.accentDark },
  whisperBtnText: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 },

  officerEfficiency: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, padding: 8, marginBottom: 6 },
  effLabel: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1, marginBottom: 4 },
  effTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  effTag: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.3 },

  identityCard: {
    flexDirection: "row",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 4,
    padding: 14,
    marginBottom: 12,
    gap: 14,
  },
  insigniaSelector: { flexDirection: "row", alignItems: "center", gap: 4 },
  portraitSelector: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 6 },
  portraitArrow: { padding: 6 },
  portraitFrame: { width: 96, height: 96, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent, overflow: "hidden", backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center" },
  portraitImg: { width: 96, height: 96 },
  portraitCounter: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, textAlign: "center", letterSpacing: 1, marginBottom: 10 },
  insigniaArrow: { padding: 4, justifyContent: "center", alignItems: "center" },
  insigniaLabel: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 7, letterSpacing: 0.5, marginTop: 3, textAlign: "center" },
  avatarBox: { width: 64, height: 72, backgroundColor: Colors.accentDark, borderWidth: 1, borderColor: Colors.accent, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  identityInfo: { flex: 1, justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  playerName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 16 },
  playerTitle: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  cityName: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  editInput: { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13, paddingHorizontal: 8, paddingVertical: 6 },
  editSaveBtn: { backgroundColor: Colors.accentDark, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, padding: 6 },
  editCancelBtn: { backgroundColor: "rgba(255,59,48,0.08)", borderWidth: 1, borderColor: Colors.danger, borderRadius: 3, padding: 6 },

  levelBar: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12, marginBottom: 12 },
  levelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  levelLabel: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1 },
  xpLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  pointsRow: { flexDirection: "row", gap: 12 },
  pointBadge: { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderBright, borderRadius: 3, paddingVertical: 6, paddingHorizontal: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pointLabel: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 },
  pointValue: { fontFamily: "Inter_700Bold", fontSize: 16 },


  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  statBox: { flex: 1, minWidth: "45%" as any, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, paddingVertical: 10, paddingHorizontal: 10, alignItems: "center" },
  statBoxValue: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 18, marginBottom: 2 },
  statBoxLabel: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 },

  attrCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12, marginBottom: 8 },
  attrTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  attrTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  attrName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 },
  attrValBox: { backgroundColor: Colors.accentDark, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 4, minWidth: 36, alignItems: "center" },
  attrVal: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 16 },
  attrDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15, marginBottom: 4 },
  attrEffects: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  attrEffect: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.3, backgroundColor: Colors.accentDark, borderWidth: 1, borderColor: Colors.accent, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1, overflow: "hidden" },
  attrBarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  attrBarBg: { flex: 1, height: 6, backgroundColor: Colors.bg, borderRadius: 3, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  attrBarFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 2 },
  upgradeBtn: { width: 28, height: 28, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, alignItems: "center", justifyContent: "center", backgroundColor: Colors.accentDark },
  upgradeBtnDisabled: { borderColor: Colors.border, backgroundColor: Colors.bg },

  skillCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, marginBottom: 6 },
  skillTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  skillName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.3 },
  skillMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  skillAttrTag: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.5, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1, overflow: "hidden" },
  skillValBox: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderBright, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 2, minWidth: 28, alignItems: "center" },
  skillVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 13 },
  skillDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, marginBottom: 6 },
  skillBarBg: { flex: 1, height: 4, backgroundColor: Colors.bg, borderRadius: 2, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  skillBarFill: { height: "100%", backgroundColor: Colors.textSecondary, borderRadius: 1 },

  traitCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, marginBottom: 6 },
  traitTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  traitName: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 },
  traitDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, marginLeft: 20 },

  bioRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  bioLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.5 },
  bioValue: { color: Colors.text, fontFamily: "Inter_700Bold" },
  bioDivider: { color: Colors.border, fontFamily: "Inter_400Regular", fontSize: 10 },

  augRegion: { marginBottom: 10 },
  augRegionLabel: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5, marginBottom: 4, paddingLeft: 2 },
  augSlotCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 3 },
  augSlotRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  augSlotLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  augSlotLabelActive: { color: Colors.text },
  augSlotStatus: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 },
}));

const useRtStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  guardCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12, marginBottom: 10 },
  guardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  guardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  guardName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 0.3 },
  guardClass: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 1.2 },
  guardStatusBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  guardStatus: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.5 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox: { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, padding: 6, alignItems: "center" },
  statLabel: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 7, letterSpacing: 1 },
  statValue: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 2 },
  lifetimeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6, paddingHorizontal: 4 },
  lifetimeStat: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.5 },
  xpBarBg: { height: 4, backgroundColor: Colors.bg, borderRadius: 2, borderWidth: 1, borderColor: Colors.border, overflow: "hidden", marginBottom: 2 },
  xpBarFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 1 },
  xpLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.5, textAlign: "right", marginBottom: 8 },
  abilitiesHeader: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.5, marginBottom: 6 },
  abilityRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4, paddingHorizontal: 4, marginBottom: 2 },
  abilityLocked: { opacity: 0.45 },
  abilityName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.3 },
  abilityNameLocked: { color: Colors.textMuted },
  abilityDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, lineHeight: 13 },
  dismissBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.danger, borderRadius: 3 },
  dismissText: { color: Colors.danger, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  emptyState: { alignItems: "center", padding: 30, gap: 8, marginBottom: 12 },
  emptyTitle: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 1 },
  emptyDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center", lineHeight: 16, maxWidth: 280 },
  recruitCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12, marginBottom: 8 },
  recruitHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  recruitName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 },
  recruitTitle: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.5, marginTop: 2 },
  recruitDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15, marginBottom: 8 },
  recruitStats: { flexDirection: "row", gap: 12, marginBottom: 6 },
  recruitStat: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 },
  recruitReq: { color: Colors.warning, fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.5, marginBottom: 3 },
  originBadge: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  originText: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1 },
  recruitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 6, paddingVertical: 8, backgroundColor: Colors.accent, borderRadius: 3 },
  recruitBtnDisabled: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border },
  recruitBtnText: { color: Colors.bg, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5 },
  recruitBtnTextDisabled: { color: Colors.textMuted },
  lockedBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: 3 },
  lockedText: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  speakBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, backgroundColor: Colors.accentDark },
  speakText: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  missionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6, borderWidth: 1, borderColor: "#FF9800", borderRadius: 3, backgroundColor: "rgba(255,152,0,0.08)" },
  missionBtnText: { color: "#FF9800", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  missionBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,152,0,0.1)", borderWidth: 1, borderColor: "#FF9800", borderRadius: 3, padding: 8, marginBottom: 8 },
  missionBannerText: { color: "#FF9800", fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5, flex: 1 },
  missionBannerTicks: { color: "#FF9800", fontFamily: "Inter_500Medium", fontSize: 9 },

  subTabBar: { flexDirection: "row", gap: 4, marginBottom: 14 },
  subTabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, backgroundColor: Colors.bgCard },
  subTabBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentDark },
  subTabText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 },
  subTabTextActive: { color: Colors.accent },

  forceGrid: { flexDirection: "row", gap: 6, marginBottom: 14 },
  forceBox: { flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, alignItems: "center" },
  forceVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 18 },
  forceLabel: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 7, letterSpacing: 0.5, marginTop: 2 },

  squadCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.accent, borderRadius: 4, padding: 12, marginBottom: 8 },
  squadHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  squadName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 0.3 },
  squadRole: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.5 },
  powerBadge: { backgroundColor: Colors.accentDark, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  powerVal: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 11 },
  roleDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, lineHeight: 14, marginBottom: 6, fontStyle: "italic" },
  synergyCallouts: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 5 },
  synergyChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, backgroundColor: Colors.accentDark },
  synergyChipText: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.4 },
  synergyEffectText: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 7, letterSpacing: 0.25, marginTop: 2 },
  missingSynergies: { padding: 5, marginBottom: 5, borderWidth: 1, borderColor: Colors.warning, borderRadius: 3, backgroundColor: Colors.bg },
  missingSynergiesTitle: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.7 },
  missingSynergyText: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 8, marginTop: 2 },
  squadStatusMessage: { color: Colors.warning, fontFamily: "Inter_400Regular", fontSize: 8, marginBottom: 2 },
  captainBlock: { marginBottom: 6 },
  captainRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,215,0,0.06)", borderWidth: 1, borderColor: "rgba(255,215,0,0.2)", borderRadius: 3, padding: 6, marginBottom: 4 },
  traitEffects: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, padding: 6, marginBottom: 4 },
  traitDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, lineHeight: 13, marginBottom: 4 },
  traitTags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  traitTag: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.3, backgroundColor: Colors.accentDark, borderWidth: 1, borderColor: Colors.accent, borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1, overflow: "hidden" },
  powerBreakdown: { flexDirection: "row", gap: 10, marginTop: 4, paddingHorizontal: 4 },
  breakdownText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.3 },
  captainName: { color: "#FFD700", fontFamily: "Inter_700Bold", fontSize: 10, flex: 1 },
  captainTrait: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.5 },
  captainStats: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.5 },
  troopList: { marginBottom: 6 },
  troopRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3, paddingHorizontal: 4 },
  troopName: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 10, flex: 1 },
  troopTier: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 },
  troopCombat: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 9 },
  moreText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, fontStyle: "italic", paddingLeft: 20, paddingVertical: 2 },
  squadStats: { flexDirection: "row", gap: 12, marginTop: 4 },
  squadStat: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.5 },
  captainCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: "rgba(255,215,0,0.3)", borderRadius: 4, padding: 10, marginBottom: 6 },
  captainCardName: { color: "#FFD700", fontFamily: "Inter_700Bold", fontSize: 11 },
  captainCardStats: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 2 },
  killBoard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12, marginTop: 8 },
  killBoardTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1, marginBottom: 6 },
  killBoardRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  killBoardStat: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 0.3 },

  missionSectionLabel: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  activeMissionCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: "#FF9800", borderRadius: 4, padding: 10, marginBottom: 8 },
  activeMissionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  activeMissionName: { color: "#FF9800", fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.3 },
  activeMissionAgent: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 1 },
  activeMissionTicks: { color: "#FF9800", fontFamily: "Inter_600SemiBold", fontSize: 9 },
  missionProgress: { height: 4, backgroundColor: Colors.bg, borderRadius: 2, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  missionProgressFill: { height: "100%", backgroundColor: "#FF9800", borderRadius: 1 },
  missionCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12, marginBottom: 8 },
  missionCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  missionCardName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.3 },
  missionCardDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15, marginTop: 2 },
  missionMeta: { flexDirection: "row", gap: 12, marginBottom: 8 },
  missionMetaText: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.3 },
  missionDeployBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, backgroundColor: Colors.accent, borderRadius: 3 },
  missionDeployText: { color: Colors.bg, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  missionLockedBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: 3 },
  missionLockedText: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 },
  completedMissionCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, padding: 8, marginBottom: 4 },
  completedMissionName: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 10 },
  completedMissionAgent: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9 },
  missionReqs: { flexDirection: "row", gap: 10, marginBottom: 8, paddingHorizontal: 4 },
  missionReqText: { color: Colors.warning, fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.3 },
}));

const useDlgStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  prompt: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 12, textAlign: "center" },
  topicBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12, marginBottom: 6 },
  topicText: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.3 },
  choiceDivider: { height: 1, backgroundColor: Colors.border, marginBottom: 10 },
  choiceBtn: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.accent, borderRadius: 4, padding: 10, marginBottom: 6 },
  choiceText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.3 },
  effectPreviewLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5, marginTop: 6, marginBottom: 4 },
  effectsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  effectTag: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  backBtn: { alignItems: "center", paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: 3 },
  backText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  icSpeakBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6, borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, backgroundColor: Colors.accentDark, marginBottom: 8 },
  icSpeakText: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
}));

const useChronicleStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  grid: { gap: 8, marginTop: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: 4,
    padding: 10,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bgElevated,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  cardText: { color: Colors.textSecondary, fontSize: 11, lineHeight: 15 },
}));

export default withScreenBoundary(CharacterScreen, "character");

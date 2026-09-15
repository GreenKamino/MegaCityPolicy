import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Image,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import LoadoutModal from "@/components/LoadoutModal";
import TutorialHint from "@/components/TutorialHint";
import FaithChip from "@/components/FaithChip";
import ContextMenu from "@/components/ContextMenu";
import HoverTooltip from "@/components/HoverTooltip";
import { useHotkeys } from "@/context/HotkeyContext";
import { isCombatUnit, getRecommendedRoleShares, MILITARY_DIPLO_ATTACK_MAP, ROLE_LABEL, type Loadout, type LoadoutRole } from "@/engine/loadout";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import type { GameState, RailCorridor, RailTrainUpgradeId } from "@/engine/types";
import { getRailTrainUpgradeAvailability, RAIL_TRAIN_UPGRADES } from "@/engine/railNetwork";
import { ATTACK_TYPES, ATTACK_TYPES_MAP, TARGET_CATEGORIES, TARGET_CATEGORIES_MAP } from "@/engine/strikeData";
import type { ExternalMegacity, FactionInfrastructure, Township, TradeAgreement, JointProject, DiplomaticPact } from "@/engine/types";
import { getMegacitySigil } from "@/utils/sigils";
import { canPerformAction, getAcceptanceChance, getDiplomacyCooldownRemaining, getMissingPrerequisites, actionAvailableForKind, DIPLOMATIC_ACTION_RULES, getMilitaryStrikeCost, isMilitaryStrikeId, type DiplomaticActionId } from "@/engine/diplomacyEngine";
import { controlStatusLabel, controlledDispositionLabel } from "@/engine/partnerCityStats";
import { getPartnerKind } from "@/engine/partnerPersonality";
import { PARTNER_ARCHETYPES, PERSONALITY_ARCHETYPES, getStanceMeta, inferArchetype, inferPersonalityArchetype, computeStance, computeConcerns, computeCurrentAction } from "@/engine/partnerDynamics";
import { getDispositionBreakdown, getRelationshipTimeline, getDefaultAdvancedState, getRefugeePopScale, WAR_TICKS_PER_DAY } from "@/engine/diplomacyAdvanced";
import type { WarEscalationStage } from "@/engine/diplomacyAdvanced";
import { getTraitVisual, getTraitDescription } from "@/engine/traitIcons";
import { getOperationalSettlementSections, operationalFromSettlement } from "@/engine/settlementData";
import OperationalEntitySheet from "@/components/OperationalEntitySheet";
import { disclosureEvidenceLabel, getEntityDisclosure } from "@/engine/entitySheets";

const FACTION_ART: Record<string, any> = {
  law: require("@/assets/concept-art/faction-authoritarians.webp"),
  criminal: require("@/assets/concept-art/faction-free-traders.webp"),
  corporate: require("@/assets/concept-art/faction-corporatists.webp"),
  underclass: require("@/assets/concept-art/faction-populists.webp"),
  cult: require("@/assets/concept-art/faction-eternal-flame.webp"),
};

const FACTION_ICONS: Record<string, string> = {
  law: "gavel",
  criminal: "skull-crossbones",
  corporate: "briefcase",
  underclass: "account-alert",
  cult: "eye",
  megacity: "city-variant",
  township: "home-group",
  group: "account-group",
  nation: "earth",
};

const getFactionColor = (Colors: ThemePalette): Record<string, string> => ({
  law: Colors.accent,
  criminal: Colors.danger,
  corporate: Colors.info,
  underclass: Colors.warning,
  cult: "#BB88FF",
  megacity: "#00BFFF",
  township: "#FFD700",
  group: "#FF6B6B",
  nation: "#7B68EE",
});

type DiplomaticAction = {
  // Typed against the shared rules map so a typo or removed action becomes a
  // TypeScript error here. Influence requirement / credit cost / cooldown live
  // exclusively in DIPLOMATIC_ACTION_RULES — read them via getActionRules().
  id: DiplomaticActionId;
  label: string;
  icon: string;
  description: string;
  category: "communication" | "trade" | "intelligence" | "military" | "aid" | "covert" | "attack";
};

const DIPLOMATIC_ACTIONS: DiplomaticAction[] = [
  { id: "open-comms", label: "OPEN COMMUNICATIONS", icon: "message-text", description: "Establish basic communication channel with faction leadership", category: "communication" },
  { id: "request-audience", label: "REQUEST AUDIENCE", icon: "account-tie", description: "Formal meeting with faction representatives", category: "communication" },
  { id: "negotiate-ceasefire", label: "NEGOTIATE CEASEFIRE", icon: "handshake", description: "Propose temporary cessation of hostilities", category: "communication" },
  { id: "propose-alliance", label: "PROPOSE ALLIANCE", icon: "shield-link-variant", description: "Form a strategic alliance with this faction", category: "communication" },
  { id: "trade-agreement", label: "TRADE AGREEMENT", icon: "swap-horizontal", description: "Establish mutual trade route and resource sharing", category: "trade" },
  { id: "resource-exchange", label: "RESOURCE EXCHANGE", icon: "package-variant", description: "One-time exchange of resources at favorable rates", category: "trade" },
  { id: "technology-sharing", label: "TECHNOLOGY SHARING", icon: "chip", description: "Share research data for mutual benefit", category: "trade" },
  { id: "smuggling-deal", label: "SMUGGLING DEAL", icon: "truck-fast", description: "Covert supply chain for restricted goods", category: "trade" },
  { id: "buy-rumors", label: "BUY RUMORS", icon: "ear-hearing", description: "Purchase intelligence about other factions", category: "intelligence" },
  { id: "spy-network", label: "ESTABLISH SPY NETWORK", icon: "binoculars", description: "Plant agents within faction structure", category: "intelligence" },
  { id: "counter-intel", label: "COUNTER-INTELLIGENCE", icon: "shield-search", description: "Deploy operatives to prevent faction espionage", category: "intelligence" },
  { id: "request-intel", label: "REQUEST INTELLIGENCE", icon: "file-search", description: "Ask faction for intel on mutual enemies", category: "intelligence" },
  { id: "joint-research", label: "JOINT RESEARCH PROJECT", icon: "flask", description: "Collaborative research initiative for advanced technology", category: "intelligence" },
  { id: "joint-operation", label: "JOINT MILITARY OPERATION", icon: "sword-cross", description: "Coordinate military action against a common threat", category: "military" },
  { id: "mercenary-contract", label: "MERCENARY CONTRACT", icon: "account-cowboy-hat", description: "Hire faction fighters as mercenaries", category: "military" },
  { id: "arms-deal", label: "ARMS DEAL", icon: "pistol", description: "Purchase military hardware from faction", category: "military" },
  { id: "declare-war", label: "DECLARE WAR", icon: "explosion", description: "Open hostilities against this faction", category: "military" },
  { id: "issue-ultimatum", label: "ISSUE ULTIMATUM", icon: "alert-decagram", description: "Demand compliance or face consequences", category: "military" },
  { id: "send-aid", label: "SEND HUMANITARIAN AID", icon: "heart-plus", description: "Supply food, medicine, and resources", category: "aid" },
  { id: "rebuild-assistance", label: "RECONSTRUCTION AID", icon: "hammer-wrench", description: "Help rebuild faction infrastructure", category: "aid" },
  { id: "refugee-program", label: "REFUGEE PROGRAM", icon: "account-multiple-plus", description: "Accept faction refugees into the city", category: "aid" },
  { id: "medical-mission", label: "MEDICAL MISSION", icon: "hospital-box", description: "Deploy medical teams to faction territory", category: "aid" },
  { id: "impose-blockade", label: "IMPOSE BLOCKADE", icon: "shield-off", description: "Cut off faction supply lines and resource flow", category: "attack" },
  { id: "trade-embargo", label: "TRADE EMBARGO", icon: "cancel", description: "Ban all trade with target faction across your network", category: "attack" },
  { id: "demand-tribute", label: "DEMAND TRIBUTE", icon: "cash-multiple", description: "Force regular payments from a weaker faction", category: "attack" },
  { id: "protection-racket", label: "PROTECTION RACKET", icon: "shield-alert", description: "Offer 'protection' in exchange for ongoing payments", category: "covert" },
  { id: "proxy-war", label: "PROXY WAR", icon: "chess-knight", description: "Fund a third-party force to attack the target", category: "covert" },
  { id: "covert-destabilize", label: "COVERT DESTABILIZATION", icon: "bomb", description: "Fund dissidents and saboteurs within target faction", category: "covert" },
  { id: "cultural-subversion", label: "CULTURAL SUBVERSION", icon: "radio-tower", description: "Broadcast propaganda to erode faction cohesion", category: "covert" },
  { id: "infrastructure-raid", label: "INFRASTRUCTURE RAID", icon: "hammer", description: "Strike critical infrastructure targets", category: "attack" },
  { id: "cyber-attack", label: "CYBER ATTACK", icon: "laptop", description: "Deploy malware against faction systems", category: "covert" },
  { id: "diplomatic-marriage", label: "DIPLOMATIC MARRIAGE", icon: "ring", description: "Political union to forge an unbreakable bond", category: "communication" },
  { id: "hostage-exchange", label: "HOSTAGE EXCHANGE", icon: "account-switch", description: "Swap prisoners to build trust and reduce tensions", category: "communication" },
  { id: "impose-sanctions", label: "IMPOSE SANCTIONS", icon: "gavel", description: "Economic penalties to pressure compliance", category: "attack" },
  { id: "gun-running", label: "GUN RUNNING", icon: "ammunition", description: "Covertly supply arms to build dependency", category: "covert" },
  { id: "false-flag", label: "FALSE FLAG OPERATION", icon: "incognito", description: "Stage an incident to frame the target faction", category: "covert" },
  { id: "request-summit", label: "REQUEST SUMMIT", icon: "account-group", description: "Convene a formal summit between heads of state", category: "communication" },
  { id: "joint-treaty", label: "JOINT TREATY", icon: "file-sign", description: "Sign a binding multi-clause treaty between cities", category: "communication" },
  { id: "diplomatic-recognition", label: "DIPLOMATIC RECOGNITION", icon: "flag", description: "Officially recognize the partner as a sovereign peer", category: "communication" },
  { id: "offer-protection", label: "OFFER PROTECTION", icon: "shield-account", description: "Pledge military protection to a smaller partner", category: "military" },
  { id: "annexation-offer", label: "ANNEXATION OFFER", icon: "city-variant", description: "Offer terms for the partner to join your sphere", category: "communication" },
  { id: "petition-leader", label: "PETITION LEADER", icon: "human-greeting", description: "Send a respectful petition to a faction leader", category: "communication" },
  { id: "rally-support", label: "RALLY SUPPORT", icon: "bullhorn", description: "Rally street-level support among the faction's base", category: "communication" },
  { id: "negotiate-charter", label: "NEGOTIATE CHARTER", icon: "scroll", description: "Draft a charter granting the faction limited autonomy", category: "communication" },
  { id: "demand-cut", label: "DEMAND A CUT", icon: "cash-100", description: "Demand a percentage of the faction's profits", category: "attack" },
  { id: "betray-deal", label: "BETRAY DEAL", icon: "knife", description: "Walk back on a prior agreement for short-term gain", category: "covert" },
  { id: "audit-records", label: "AUDIT RECORDS", icon: "clipboard-text-search", description: "Force a forensic audit of corporate records", category: "intelligence" },
  { id: "joint-patrol", label: "JOINT PATROL", icon: "car-emergency", description: "Pair patrols with the law faction for joint enforcement", category: "military" },
  { id: "buyout-offer", label: "BUYOUT OFFER", icon: "domain", description: "Offer to acquire a corporation outright", category: "trade" },
  { id: "regulatory-capture", label: "REGULATORY CAPTURE", icon: "scale-balance", description: "Quietly install allies inside corporate governance", category: "covert" },
  { id: "land-grant", label: "LAND GRANT", icon: "map-marker-radius", description: "Grant additional land to an underclass community", category: "aid" },
  { id: "amnesty", label: "AMNESTY", icon: "key", description: "Issue a blanket amnesty for past offenses", category: "aid" },
  { id: "shrine-construction", label: "SHRINE CONSTRUCTION", icon: "candelabra", description: "Fund construction of a cult shrine within the city", category: "aid" },
  { id: "prophecy-request", label: "PROPHECY REQUEST", icon: "eye", description: "Petition the cult for a guiding prophecy", category: "intelligence" },
  { id: "rocket-strike", label: "ROCKET STRIKE", icon: "rocket-launch", description: `Long-range missile barrage. Heavy infrastructure damage, civilian casualties, and city destabilization. Requires ${getMilitaryStrikeCost("rocket-strike").ammo} ammo and ${getMilitaryStrikeCost("rocket-strike").fuel} fuel.`, category: "attack" },
  { id: "bombardment", label: "ARTILLERY BOMBARDMENT", icon: "cannon", description: `Sustained heavy artillery fire. Devastates walls and population. Requires ${getMilitaryStrikeCost("bombardment").ammo} ammo and ${getMilitaryStrikeCost("bombardment").fuel} fuel.`, category: "attack" },
  { id: "lay-siege", label: "LAY SIEGE", icon: "fence", description: `Prolonged siege drains the target — slowly raises attrition and erodes city health. Requires ${getMilitaryStrikeCost("lay-siege").ammo} ammo and ${getMilitaryStrikeCost("lay-siege").fuel} fuel.`, category: "attack" },
  { id: "occupy", label: "OCCUPY CITY", icon: "shield-home", description: "Garrison and administer the target city. Requires city health ≤50, walls ≤30, military strength ≥200, and infrastructure foothold ≥50. Generates tribute every tick.", category: "military" },
  { id: "annex", label: "ANNEX TERRITORY", icon: "city-variant", description: "Permanently absorb the city into your domain. Requires the city to already be occupied, with city health ≤30, attrition ≥50, and infrastructure foothold ≥75. Gains population.", category: "military" },
  { id: "send-relief", label: "SEND RELIEF AID", icon: "ambulance", description: "Send medics and engineers to restore city health and ease attrition.", category: "aid" },
  { id: "poaching-deal", label: "POACHING DEAL", icon: "paw-off", description: "Pay poacher factions for wildland captures. Boosts livestock and meat, drains biosphere.", category: "trade" },
  { id: "sanctuary-treaty", label: "SANCTUARY TREATY", icon: "tree", description: "Pledge to protect a wildlands sanctuary. Strong loyalty gains with conservationists and druids; alienates poachers.", category: "communication" },
  { id: "gene-bank-exchange", label: "GENE BANK EXCHANGE", icon: "dna", description: "Trade frozen genome libraries with gene-wright partners. Accelerates ecology research.", category: "trade" },
  { id: "plague-swarm", label: "RELEASE PLAGUE SWARM", icon: "biohazard", description: "Loose engineered swarms on a target. Always succeeds. Devastates target biosphere and infrastructure; severe diplomatic blowback.", category: "attack" },
  { id: "extradition-treaty", label: "EXTRADITION TREATY", icon: "account-arrow-right", description: "Formal cross-border extradition agreement. Partner pledges to hand over fugitives wanted by your courts. Reduces threat and builds rule-of-law trust.", category: "communication" },
  { id: "non-aggression-pact", label: "NON-AGGRESSION PACT", icon: "shield-check", description: "Mutual pledge to refrain from hostile action. Lighter than a full alliance and easier to secure — sharply reduces threat without binding either side to mutual defense.", category: "communication" },
  { id: "cultural-exchange", label: "CULTURAL EXCHANGE", icon: "drama-masks", description: "Exchange artists, scholars, and tradesfolk to build soft-power ties. Modest loyalty and influence gains; no threat change.", category: "communication" },
  { id: "open-borders", label: "OPEN-BORDERS AGREEMENT", icon: "gate-open", description: "Permit free movement of citizens between your sectors and the partner's. Strong loyalty and influence gains; available only between peer polities.", category: "communication" },
];

const getActionRules = (action: DiplomaticAction) => DIPLOMATIC_ACTION_RULES[action.id];

const ACTION_CATEGORIES = [
  { id: "communication", label: "COMMS", icon: "message-text" },
  { id: "trade", label: "TRADE", icon: "swap-horizontal" },
  { id: "intelligence", label: "INTEL", icon: "binoculars" },
  { id: "military", label: "WAR", icon: "sword-cross" },
  { id: "attack", label: "ATTACK", icon: "rocket-launch" },
  { id: "covert", label: "COVERT", icon: "incognito" },
  { id: "aid", label: "AID", icon: "heart-plus" },
];

const FACTION_CTX_ITEMS = [
  { label: "View Details", action: "view" },
];

const DIPLOMACY_TABS = [
  { id: "factions", label: "FACTIONS", icon: "flag" },
  { id: "megacities", label: "MEGACITIES", icon: "globe" },
  { id: "settlements", label: "SETTLEMENTS", icon: "map-pin" },
  { id: "incidents", label: "CRISES", icon: "alert-triangle" },
  { id: "envoys", label: "ENVOYS", icon: "briefcase" },
  { id: "negotiations", label: "TALKS", icon: "message-circle" },
  { id: "wars", label: "WARS", icon: "zap" },
  { id: "agreements", label: "PACTS", icon: "link" },
  { id: "relations", label: "MATRIX", icon: "grid" },
  { id: "recon", label: "RECON", icon: "search" },
];

const StatBar = React.memo(function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statBar}>
      <View style={styles.statBarHeader}>
        <Text style={styles.statBarLabel}>{label}</Text>
        <Text style={[styles.statBarValue, { color }]}>{Math.round(value)}</Text>
      </View>
      <View style={styles.statBarTrack}>
        <View style={[styles.statBarFill, { width: `${Math.min(value, 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
});

const AgreementCard = React.memo(function AgreementCard({ agreement, onCancel }: { agreement: TradeAgreement; onCancel: () => void }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const statusColor = agreement.status === "active" ? Colors.accent : agreement.status === "expired" ? Colors.textMuted : Colors.danger;
  return (
    <View style={[styles.agreementCard, { borderColor: statusColor }]}>
      <View style={styles.agreementHeader}>
        <MaterialCommunityIcons name="swap-horizontal" size={14} color={statusColor} />
        <Text style={[styles.agreementTitle, { color: statusColor }]}>{agreement.partnerName}</Text>
        <Text style={[styles.agreementStatus, { color: statusColor }]}>{agreement.status.toUpperCase()}</Text>
      </View>
      <View style={styles.agreementBody}>
        {agreement.give.length > 0 && (
          <Text style={styles.agreementDetail}>GIVE: {agreement.give.map((g) => `${g.amount} ${g.commodity}`).join(", ")}/tick</Text>
        )}
        {agreement.receive.length > 0 && (
          <Text style={styles.agreementDetail}>RECEIVE: {agreement.receive.map((r) => `${r.amount} ${r.commodity}`).join(", ")}/tick</Text>
        )}
        {agreement.creditsPerTick > 0 && (
          <Text style={[styles.agreementDetail, { color: Colors.accent }]}>+{agreement.creditsPerTick} CR/tick</Text>
        )}
        <Text style={styles.agreementDetail}>
          {agreement.status === "active" ? `${agreement.remainingTicks} ticks remaining` : agreement.status === "expired" ? "Expired" : "Cancelled"}
        </Text>
      </View>
      {agreement.status === "active" && (
        <HoverTooltip text="Cancel this agreement">
          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>CANCEL</Text>
          </Pressable>
        </HoverTooltip>
      )}
    </View>
  );
});

const ProjectCard = React.memo(function ProjectCard({ project, onCancel }: { project: JointProject; onCancel: () => void }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const pct = Math.min(100, Math.floor((project.progress / project.target) * 100));
  const statusColor = project.status === "in_progress" ? Colors.info : project.status === "complete" ? Colors.accent : Colors.danger;
  return (
    <View style={[styles.agreementCard, { borderColor: statusColor }]}>
      <View style={styles.agreementHeader}>
        <MaterialCommunityIcons name="hammer-wrench" size={14} color={statusColor} />
        <Text style={[styles.agreementTitle, { color: statusColor }]}>{project.buildingName}</Text>
        <Text style={[styles.agreementStatus, { color: statusColor }]}>{project.status === "in_progress" ? "BUILDING" : project.status.toUpperCase()}</Text>
      </View>
      <View style={styles.agreementBody}>
        <Text style={styles.agreementDetail}>Partner: {project.partnerName}</Text>
        <Text style={styles.agreementDetail}>Progress: {pct}% ({project.progress}/{project.target})</Text>
        <Text style={styles.agreementDetail}>+{project.contributionPerTick}/tick</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
      </View>
      {project.status === "in_progress" && (
        <HoverTooltip text="Cancel this project">
          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>CANCEL</Text>
          </Pressable>
        </HoverTooltip>
      )}
    </View>
  );
});

const PACT_LABELS: Record<string, string> = {
  "non-aggression": "NON-AGGRESSION",
  "mutual-defense": "MUTUAL DEFENSE",
  "open-borders": "OPEN BORDERS",
  "intelligence-sharing": "INTEL SHARING",
};


const RailCorridorCard = React.memo(function RailCorridorCard({
  corridor,
  partnerName,
  onCancel,
  onRespond,
  onInstallUpgrade,
  state,
}: {
  corridor: RailCorridor;
  partnerName: string;
  onCancel: () => void;
  onRespond: (accepted: boolean) => void;
  onInstallUpgrade: (upgradeId: RailTrainUpgradeId) => void;
  state: GameState;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const statusColor = corridor.status === "completed" ? Colors.accent :
    corridor.status === "under_construction" ? Colors.info :
    corridor.status === "consent_pending" ? Colors.warning : Colors.danger;
  const trainUpgrades = (Object.keys(RAIL_TRAIN_UPGRADES) as RailTrainUpgradeId[]).map(id => ({
    id,
    def: RAIL_TRAIN_UPGRADES[id],
    availability: getRailTrainUpgradeAvailability(state, corridor, id),
  }));

  return (
    <View style={[styles.agreementCard, { borderColor: statusColor }]}>
      <View style={styles.agreementHeader}>
        <MaterialCommunityIcons name="train" size={14} color={statusColor} />
        <Text style={[styles.agreementTitle, { color: statusColor }]}>RAIL CORRIDOR: {partnerName}</Text>
        <Text style={[styles.agreementStatus, { color: statusColor }]}>{corridor.status.replace("_", " ").toUpperCase()}</Text>
      </View>
      <View style={styles.agreementBody}>
        {corridor.status === "consent_pending" && (
          <Text style={styles.agreementDetail}>Awaiting independent consent from {partnerName}.</Text>
        )}
        {corridor.status === "under_construction" && (
          <Text style={styles.agreementDetail}>Progress: {Math.floor(corridor.progressTicks / corridor.totalTicks * 100)}%</Text>
        )}
        {corridor.reason && (
          <Text style={[styles.agreementDetail, { color: Colors.textMuted }]}>Reason: {corridor.reason.replace(/_/g, " ")}</Text>
        )}
        {(corridor.status === "under_construction" || corridor.status === "completed" || corridor.status === "disrupted") && (
          <Text style={[styles.agreementDetail, { color: Colors.textMuted }]}>Staffing: {Object.values(corridor.staffing).reduce((a,b)=>a+(b as number), 0)} assigned</Text>
        )}
        {corridor.status === "completed" && (
          <View style={{ marginTop: 8, gap: 4 }}>
            <Text style={[styles.agreementDetail, { color: Colors.accent }]}>
              TRAIN MODULES: {(corridor.installedTrainUpgrades || []).length
                ? (corridor.installedTrainUpgrades || []).map(id => RAIL_TRAIN_UPGRADES[id]?.name || id).join(" · ")
                : "NONE INSTALLED"}
            </Text>
            {trainUpgrades.map(({ id, def, availability }) => (
              <View key={id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={[styles.agreementDetail, { flex: 1 }]}>
                  {def.name} · {def.credits.toLocaleString()} CR / {def.steel.toLocaleString()} steel
                </Text>
                <Pressable
                  disabled={!availability.available}
                  onPress={() => Alert.alert(
                    `Install ${def.name}?`,
                    `This completed corridor will spend ${def.credits.toLocaleString()} credits and ${def.steel.toLocaleString()} steel.`,
                    [
                      { text: "CANCEL", style: "cancel" },
                      { text: "INSTALL", onPress: () => onInstallUpgrade(id) },
                    ],
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`Install ${def.name}`}
                  style={[styles.cancelBtn, !availability.available && { opacity: 0.45 }, { marginTop: 0 }]}
                >
                  <Text style={styles.cancelBtnText}>
                    {availability.available ? "INSTALL" : availability.reason === "upgrade_already_installed" ? "INSTALLED" : "LOCKED"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
      {corridor.status === "consent_pending" && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <HoverTooltip text="Simulate partner accepting the rail corridor">
            <Pressable onPress={() => onRespond(true)} style={[styles.cancelBtn, { borderColor: Colors.accent }]}>
              <Text style={[styles.cancelBtnText, { color: Colors.accent }]}>PARTNER ACCEPTS</Text>
            </Pressable>
          </HoverTooltip>
          <HoverTooltip text="Simulate partner refusing the rail corridor">
            <Pressable onPress={() => onRespond(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>PARTNER REFUSES</Text>
            </Pressable>
          </HoverTooltip>
        </View>
      )}
      {(corridor.status === "under_construction" || corridor.status === "consent_pending" || corridor.status === "disrupted") && (
        <HoverTooltip text="Cancel this rail corridor">
          <Pressable onPress={onCancel} style={[styles.cancelBtn, { marginTop: 8 }]}>
            <Text style={styles.cancelBtnText}>CANCEL</Text>
          </Pressable>
        </HoverTooltip>
      )}
    </View>
  );
});

const PactCard = React.memo(function PactCard({ pact, onCancel }: { pact: DiplomaticPact; onCancel: () => void }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const statusColor = pact.status === "active" ? "#9B59B6" : pact.status === "expired" ? Colors.muted : Colors.danger;
  const effectStr = [
    pact.effects.threat ? `Threat ${pact.effects.threat > 0 ? "+" : ""}${pact.effects.threat}/tick` : "",
    pact.effects.loyalty ? `Loyalty ${pact.effects.loyalty > 0 ? "+" : ""}${pact.effects.loyalty}/tick` : "",
    pact.effects.crime ? `Crime ${pact.effects.crime > 0 ? "+" : ""}${pact.effects.crime}/tick` : "",
    pact.effects.influence ? `Influence ${pact.effects.influence > 0 ? "+" : ""}${pact.effects.influence}/tick` : "",
  ].filter(Boolean).join(" | ");
  return (
    <View style={[styles.agreementCard, { borderColor: statusColor }]}>
      <View style={styles.agreementHeader}>
        <MaterialCommunityIcons name="handshake" size={14} color={statusColor} />
        <Text style={[styles.agreementTitle, { color: statusColor }]}>{PACT_LABELS[pact.pactType] ?? pact.pactType}</Text>
        <Text style={[styles.agreementStatus, { color: statusColor }]}>{pact.status.toUpperCase()}</Text>
      </View>
      <View style={styles.agreementBody}>
        <Text style={styles.agreementDetail}>Partner: {pact.partnerName}</Text>
        <Text style={styles.agreementDetail}>Effects: {effectStr || "None"}</Text>
        <Text style={styles.agreementDetail}>Remaining: {pact.remainingTicks} ticks</Text>
      </View>
      {pact.status === "active" && (
        <HoverTooltip text="Cancel this pact">
          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>BREAK PACT</Text>
          </Pressable>
        </HoverTooltip>
      )}
    </View>
  );
});

function DiplomacyScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const FACTION_COLOR = getFactionColor(Colors);
  const insets = useSafeAreaInsets();
  const { state: rawState, setState, actionFaction, launchStrike, cancelTradeAgreement, cancelJointProject, cancelDiplomaticPact, resolveIncident, assignEnvoy, recallEnvoy, startNegotiation, resolveNegotiationStep, declareWarAdvanced, proposePeace, acceptPeaceDemand, rejectPeaceDemand, concludePeace, respondToRailConsent, cancelRailCorridor, installRailTrainUpgrade } = useGame();
  const state = useThrottledValue(rawState, 500);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const [selectedFaction, setSelectedFaction] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("communication");
  const [activeTab, setActiveTab] = useState<string>("factions");
  const [attitudeFilter, setAttitudeFilter] = useState<"all" | "allied" | "friendly" | "neutral" | "suspicious" | "hostile">("all");
  const attitudeScrollRef = useHorizontalWheelScroll();
  const { modal, showModal, hideModal } = useGameModal();
  const confirmCancelAgreement = useCallback((agreement: TradeAgreement) => {
    showModal("CANCEL TRADE AGREEMENT", `Cancel the trade agreement with ${agreement.partnerName}?\n\nThis stops the listed GIVE/RECEIVE flows immediately. The agreement will remain in HISTORY as cancelled.`, [
      { text: "CANCEL", style: "cancel" },
      { text: "CANCEL AGREEMENT", style: "destructive", onPress: () => cancelTradeAgreement(agreement.id) },
    ]);
  }, [cancelTradeAgreement, showModal]);
  const confirmCancelProject = useCallback((project: JointProject) => {
    showModal("CANCEL JOINT PROJECT", `Cancel the ${project.buildingName} project with ${project.partnerName}?\n\nProgress and the ${project.contributionPerTick}/tick contribution will be lost. The project will remain in HISTORY as cancelled.`, [
      { text: "CANCEL", style: "cancel" },
      { text: "CANCEL PROJECT", style: "destructive", onPress: () => cancelJointProject(project.id) },
    ]);
  }, [cancelJointProject, showModal]);
  const confirmBreakPact = useCallback((pact: DiplomaticPact) => {
    const effects = [
      pact.effects.threat ? `Threat ${pact.effects.threat > 0 ? "+" : ""}${pact.effects.threat}/tick` : "",
      pact.effects.loyalty ? `Loyalty ${pact.effects.loyalty > 0 ? "+" : ""}${pact.effects.loyalty}/tick` : "",
      pact.effects.crime ? `Crime ${pact.effects.crime > 0 ? "+" : ""}${pact.effects.crime}/tick` : "",
      pact.effects.influence ? `Influence ${pact.effects.influence > 0 ? "+" : ""}${pact.effects.influence}/tick` : "",
    ].filter(Boolean).join(", ");
    showModal("BREAK ACTIVE PACT", `Break the ${PACT_LABELS[pact.pactType] ?? pact.pactType} pact with ${pact.partnerName}?\n\nYou will lose its active effects${effects ? ` (${effects})` : ""} and diplomatic trust may suffer. The pact will remain in HISTORY as broken.`, [
      { text: "CANCEL", style: "cancel" },
      { text: "BREAK PACT", style: "destructive", onPress: () => cancelDiplomaticPact(pact.id) },
    ]);
  }, [cancelDiplomaticPact, showModal]);

  const [ctx, setCtx] = useState<{ visible: boolean; position: { x: number; y: number }; id: string | null; name: string | null }>(
    { visible: false, position: { x: 0, y: 0 }, id: null, name: null }
  );
  const openFactionCtx = useCallback((id: string, name: string, e: any) => {
    if (Platform.OS !== "web") return;
    e?.preventDefault?.();
    const x = e?.nativeEvent?.pageX ?? e?.pageX ?? 0;
    const y = e?.nativeEvent?.pageY ?? e?.pageY ?? 0;
    setCtx({ visible: true, position: { x, y }, id, name });
  }, []);
  const closeCtx = useCallback(() => setCtx((c) => ({ ...c, visible: false })), []);

  const { registerSubTabs, unregisterSubTabs } = useHotkeys();
  useEffect(() => {
    const keys = DIPLOMACY_TABS.map((t) => t.id);
    const idx = keys.indexOf(activeTab);
    const goTo = (id: string) => { setActiveTab(id); setSelectedFaction(null); };
    registerSubTabs({
      prev: () => goTo(keys[idx > 0 ? idx - 1 : keys.length - 1]),
      next: () => goTo(keys[idx < keys.length - 1 ? idx + 1 : 0]),
    });
    return () => unregisterSubTabs();
  }, [activeTab, registerSubTabs, unregisterSubTabs]);

  const yesman = state.cheats?.yesman ?? false;
  const [showDisposition, setShowDisposition] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const factions = state.factions;
  // Memoize the `?? []` fallbacks so identity is stable when the underlying
  // state field is undefined — without this, every render produced a new
  // empty array and silently invalidated the downstream `factionById` /
  // `megacityById` / `townshipById` Maps below.
  const megacities = useMemo(() => state.externalMegacities ?? [], [state.externalMegacities]);
  const townships = useMemo(() => state.townships ?? [], [state.townships]);
  const tradeAgreements = useMemo(() => state.tradeAgreements ?? [], [state.tradeAgreements]);
  const railCorridors = useMemo(() => state.railCorridors ?? [], [state.railCorridors]);
  const jointProjects = useMemo(() => state.jointProjects ?? [], [state.jointProjects]);
  const diplomaticPacts = useMemo(() => state.diplomaticPacts ?? [], [state.diplomaticPacts]);
  const adv = state.diplomacyAdvanced ?? getDefaultAdvancedState();
  const factionById = useMemo(() => new Map(factions.map((f) => [f.id, f])), [factions]);
  const megacityById = useMemo(() => new Map(megacities.map((m) => [m.id, m])), [megacities]);
  const townshipById = useMemo(() => new Map(townships.map((t) => [t.id, t])), [townships]);
  const faction = factionById.get(selectedFaction ?? "");
  const megacity = megacityById.get(selectedFaction ?? "");
  const township = townshipById.get(selectedFaction ?? "");

  const partnerKind = getPartnerKind(faction, megacity, township);
  const cityPartner = megacity ?? township;
  const partnerControlStatus = cityPartner?.controlStatus ?? "independent";
  const OCCUPIED_ALLOWED = new Set(["open-comms", "request-audience", "send-relief", "send-aid", "rebuild-assistance", "medical-mission", "annex"]);
  const filteredActions = DIPLOMATIC_ACTIONS
    .filter((a) => a.category === selectedCategory)
    .filter((a) => !selectedFaction || actionAvailableForKind(a.id, partnerKind))
    .filter((a) => {
      if (partnerControlStatus === "annexed") return false;
      if (partnerControlStatus === "occupied") return OCCUPIED_ALLOWED.has(a.id);
      return true;
    });

  const getInfluence = (): number => {
    if (faction) return faction.influence;
    if (megacity) return megacity.influence;
    if (township) return township.influence;
    return 0;
  };

  const getActionStatus = (action: DiplomaticAction) => {
    if (!selectedFaction) return { blocked: true, reason: "No target selected" };
    const check = canPerformAction(state, selectedFaction, action.id);
    if (!check.allowed) return { blocked: true, reason: check.reason ?? "Blocked", cooldown: check.cooldownRemaining, prerequisite: check.missingPrerequisite };
    const rules = getActionRules(action);
    const inf = getInfluence();
    if (!yesman && inf < rules.requiresInfluence) return { blocked: true, reason: `Need ${rules.requiresInfluence} influence (have ${inf})` };
    if (state.resources.credits < rules.cost) return { blocked: true, reason: `Need ${rules.cost.toLocaleString()} credits` };
    return { blocked: false };
  };

  const handleAction = (action: DiplomaticAction) => {
    if (!selectedFaction) return;
    const status = getActionStatus(action);
    if (status.blocked) {
      showModal("ACTION BLOCKED", status.reason ?? "Cannot perform this action.", [{ text: "ACKNOWLEDGED", style: "cancel" }]);
      return;
    }
    const targetId = selectedFaction;
    const targetName = faction?.name ?? megacity?.name ?? township?.name ?? targetId;
    const factionType = faction?.type ?? (megacity ? "megacity" : township?.factionType ?? "settlement");
    const chance = getAcceptanceChance(state, targetId, action.id);
    const chanceLabel = chance >= 95 ? "GUARANTEED" : chance >= 70 ? "LIKELY" : chance >= 40 ? "UNCERTAIN" : "UNLIKELY";
    // Diplomatic actions that map to a real military strike (rocket-strike,
    // bombardment, lay-siege) get routed through the loadout picker —
    // exactly the same flow as a Strike Center attack — so the player
    // chooses which units take the casualties.
    if (isMilitaryStrikeId(action.id)) {
      const mappedAttackTypeId = MILITARY_DIPLO_ATTACK_MAP[action.id];
      const atk = ATTACK_TYPES_MAP[mappedAttackTypeId];
      const { ammo: ammoCost, fuel: fuelCost } = getMilitaryStrikeCost(action.id);
      if (state.resources.ammo < ammoCost) {
        showModal("INSUFFICIENT MUNITIONS", `${action.label} requires ${ammoCost} ammo and ${fuelCost} fuel.`, [{ text: "ACKNOWLEDGED", style: "cancel" }]);
        return;
      }
      if (state.resources.fuel < fuelCost) {
        showModal("INSUFFICIENT MUNITIONS", `${action.label} requires ${ammoCost} ammo and ${fuelCost} fuel.`, [{ text: "ACKNOWLEDGED", style: "cancel" }]);
        return;
      }
      if (atk && atk.minUnits > 0) {
        const totalCombat = Object.entries(state.units as Record<string, number>)
          .filter(([k]) => isCombatUnit(k))
          .reduce((s, [, v]) => s + (typeof v === "number" ? Math.max(0, v) : 0), 0);
        if (totalCombat < atk.minUnits) {
          showModal("INSUFFICIENT FORCES", `${action.label} requires at least ${atk.minUnits} combat units. You have ${totalCombat}.`, [{ text: "ACKNOWLEDGED", style: "cancel" }]);
          return;
        }
      }
      setDiploStrike({ targetId, targetName, factionType, action, attackTypeId: mappedAttackTypeId });
      return;
    }

    const cost = getActionRules(action).cost;
    showModal(
      "CONFIRM DIPLOMATIC ACTION",
      `${action.label} with ${targetName}\n\nAcceptance: ${chance}% (${chanceLabel})${cost > 0 ? `\nCost: ${cost.toLocaleString()} credits (non-refundable)` : ""}${yesman ? "\n\n[YESMAN: Favorable outcome guaranteed]" : ""}\n\nProceed?`,
      [
        { text: "CANCEL", style: "cancel" },
        { text: "PROCEED", style: "destructive", onPress: () => {
          if (action.id === "declare-war") {
            declareWarAdvanced(targetId, targetName);
          }
          actionFaction(targetId, action.id);
          showModal(
            `${targetName}: ACTION PROCESSED`,
            "Diplomatic dispatch received. Outcome and effects have been delivered to your INBOX.",
            [{ text: "ACKNOWLEDGED" }]
          );
        }},
      ]
    );
  };

  const getLeader = (entityId: string): import("@/engine/types").FactionLeader | undefined => {
    const f = factionById.get(entityId);
    if (f?.leader) return f.leader;
    const m = megacityById.get(entityId);
    if (m?.leader) return m.leader;
    const t = townshipById.get(entityId);
    if (t?.leader) return t.leader;
    return undefined;
  };

  const ATTITUDE_COLOR: Record<string, string> = {
    friendly: Colors.accent,
    neutral: Colors.textMuted,
    suspicious: Colors.warning,
    hostile: Colors.danger,
    fearful: "#BB88FF",
  };

  const [selectedAttackType, setSelectedAttackType] = useState<string | null>(null);
  const [selectedTargetCategory, setSelectedTargetCategory] = useState<string | null>(null);
  const [loadoutTarget, setLoadoutTarget] = useState<{ id: string; name: string; defense: number } | null>(null);
  // When set, the LoadoutModal is in "diplomatic military action" mode rather
  // than "Strike Center attack" mode. Confirming the loadout dispatches the
  // chosen action through actionFaction with the loadout attached.
  const [diploStrike, setDiploStrike] = useState<{
    targetId: string;
    targetName: string;
    factionType: string;
    action: DiplomaticAction;
    attackTypeId: string;
  } | null>(null);

  // Maps the open LoadoutModal context (either a Strike Center launch or a
  // diplomatic military action) to its remembered loadout, if any.
  const activeAttackTypeId: string | null =
    diploStrike?.attackTypeId ?? selectedAttackType ?? null;
  const lastLoadoutForActive: Loadout | null = activeAttackTypeId
    ? (state.savedLoadouts?.[activeAttackTypeId] as Loadout | undefined) ?? null
    : null;
  const activeAttackTypeDef = activeAttackTypeId
    ? ATTACK_TYPES_MAP[activeAttackTypeId] ?? null
    : null;

  const getEntityInfra = (entityId: string): FactionInfrastructure => {
    const f = factionById.get(entityId);
    if (f?.infrastructure) return f.infrastructure;
    const m = megacityById.get(entityId);
    if (m?.infrastructure) return m.infrastructure;
    const t = townships.find((x) => x.id === entityId);
    if (t?.infrastructure) return t.infrastructure;
    return { military: 80, walls: 80, fuel: 80, civilian: 80 };
  };

  const handleLaunchStrike = (entityId: string, entityName: string) => {
    if (!selectedAttackType) return;
    if (!selectedTargetCategory) {
      showModal("NO TARGET CATEGORY", "Select a priority target (INFRASTRUCTURE, POPULATION, or ASSETS) before launching.", [{ text: "OK", style: "cancel" }]);
      return;
    }

    // Open the loadout selector. The actual strike is launched from
    // executeStrikeWithLoadout once the player confirms a force composition.
    const infra = getEntityInfra(entityId);
    const defense = (infra.military ?? 80) + (infra.walls ?? 80);
    setLoadoutTarget({ id: entityId, name: entityName, defense });
  };

  const executeStrikeWithLoadout = (loadout: Loadout) => {
    if (!loadoutTarget || !selectedAttackType || !selectedTargetCategory) {
      setLoadoutTarget(null);
      return;
    }
    const targetId = loadoutTarget.id;
    const result = launchStrike(targetId, selectedAttackType, selectedTargetCategory, loadout);
    setLoadoutTarget(null);
    if (result) {
      const statusMsg = result.intercepted
        ? "Strike was INTERCEPTED. Check inbox for details."
        : result.success
          ? "Strike confirmed. Damage report sent to inbox."
          : "Strike partially missed. Check inbox.";
      showModal(
        result.intercepted ? "STRIKE INTERCEPTED" : "STRIKE LAUNCHED",
        `${statusMsg}\n\nCasualties (ours): ${result.attackerCasualties}\nCivilian casualties: ${result.civilianCasualties.toLocaleString()}\nDiplomatic fallout: ${result.diplomaticFallout}`,
        [{ text: "ACKNOWLEDGED" }]
      );
    } else {
      showModal("STRIKE FAILED", "Unable to execute strike. Check resources and target.", [{ text: "OK" }]);
    }
    setSelectedAttackType(null);
    setSelectedTargetCategory(null);
  };

  const onFactionCtxAction = (action: string) => {
    if (action === "view" && ctx.id) {
      setSelectedFaction(ctx.id);
      setActiveTab("factions");
    }
    closeCtx();
  };

  const renderAttackPanel = (entity: { id: string; name: string }) => {
    const infra = getEntityInfra(entity.id);
    const atk = selectedAttackType ? ATTACK_TYPES_MAP[selectedAttackType] : null;
    const tgt = selectedTargetCategory ? TARGET_CATEGORIES_MAP[selectedTargetCategory] : null;

    return (
      <>
        <View style={{ borderWidth: 1, borderColor: Colors.danger + "40", borderRadius: 4, padding: 12, marginBottom: 12, backgroundColor: Colors.danger + "08" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <MaterialCommunityIcons name="shield-alert" size={16} color={Colors.danger} />
            <Text style={{ color: Colors.danger, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1 }}>TARGET INFRASTRUCTURE</Text>
          </View>
          {[
            { key: "military", label: "MILITARY", icon: "tank" as const, value: infra.military },
            { key: "walls", label: "WALLS", icon: "wall" as const, value: infra.walls },
            { key: "fuel", label: "FUEL", icon: "gas-station" as const, value: infra.fuel },
            { key: "civilian", label: "CIVILIAN", icon: "home-city" as const, value: infra.civilian },
          ].map((item) => (
            <View key={item.key} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name={item.icon} size={12} color={item.value > 50 ? Colors.textSecondary : item.value > 20 ? Colors.warning : Colors.danger} />
                  <Text style={{ color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 }}>{item.label}</Text>
                </View>
                <Text style={{ color: item.value > 50 ? Colors.accent : item.value > 20 ? Colors.warning : Colors.danger, fontFamily: "Inter_700Bold", fontSize: 10 }}>{item.value}/100</Text>
              </View>
              <View style={{ height: 4, backgroundColor: Colors.border, borderRadius: 2 }}>
                <View style={{ height: 4, width: `${item.value}%`, backgroundColor: item.value > 50 ? Colors.accent : item.value > 20 ? Colors.warning : Colors.danger, borderRadius: 2 }} />
              </View>
            </View>
          ))}
        </View>

        <Text style={{ color: Colors.danger, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>1. SELECT ATTACK TYPE</Text>
        {ATTACK_TYPES.map((type) => {
          const isSelected = selectedAttackType === type.id;
          const canAfford = state.resources.credits >= type.creditsCost && state.resources.ammo >= type.ammoCost && state.resources.fuel >= type.fuelCost;
          return (
            <Pressable
              key={type.id}
              onPress={() => setSelectedAttackType(isSelected ? null : type.id)}
              style={[styles.actionCard, isSelected && { borderColor: Colors.danger, backgroundColor: Colors.danger + "10" }, !canAfford && styles.actionCardDisabled]}
            >
              <View style={styles.actionHeader}>
                <MaterialCommunityIcons name={type.icon as any} size={16} color={isSelected ? Colors.danger : canAfford ? Colors.textSecondary : Colors.textMuted} />
                <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                  <Text style={[styles.actionName, isSelected && { color: Colors.danger }, !canAfford && { color: Colors.textMuted }]}>{type.name}</Text>
                  <Text style={styles.actionDesc}>{type.description}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                <Text style={[styles.actionCost, state.resources.credits < type.creditsCost && { color: Colors.danger }]}>{type.creditsCost.toLocaleString()} CR</Text>
                <Text style={[styles.actionCost, state.resources.ammo < type.ammoCost && { color: Colors.danger }]}>{type.ammoCost} AMMO</Text>
                <Text style={[styles.actionCost, state.resources.fuel < type.fuelCost && { color: Colors.danger }]}>{type.fuelCost} FUEL</Text>
                {type.minUnits > 0 && <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9 }}>Min Units: {type.minUnits}</Text>}
                <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9 }}>Intercept: {Math.round(type.interceptChance * 100)}%</Text>
              </View>
            </Pressable>
          );
        })}

        {selectedAttackType && (() => {
          const recShares = getRecommendedRoleShares(selectedAttackType as Parameters<typeof getRecommendedRoleShares>[0]);
          const recEntries = (Object.entries(recShares) as Array<[LoadoutRole, number]>)
            .filter(([, v]) => v && v > 0)
            .sort((a, b) => b[1] - a[1]);
          const recLine = recEntries
            .map(([r, v]) => `${Math.round(v * 100)}% ${ROLE_LABEL[r]}`)
            .join("  ·  ");
          return (
            <View style={{ marginTop: 10, marginBottom: 4, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "08", borderRadius: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={12} color={Colors.accent} />
                <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>RECOMMENDED COMPOSITION</Text>
              </View>
              <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10 }}>{recLine || "Any combat units"}</Text>
            </View>
          );
        })()}

        {selectedAttackType && (
          <>
            <Text style={{ color: Colors.danger, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1, marginTop: 12, marginBottom: 8 }}>2. SELECT TARGET</Text>
            {TARGET_CATEGORIES.map((cat) => {
              const isSelected = selectedTargetCategory === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setSelectedTargetCategory(isSelected ? null : cat.id)}
                  style={[styles.actionCard, isSelected && { borderColor: Colors.warning, backgroundColor: Colors.warning + "10" }]}
                >
                  <View style={styles.actionHeader}>
                    <MaterialCommunityIcons name={cat.icon as any} size={16} color={isSelected ? Colors.warning : Colors.textSecondary} />
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                      <Text style={[styles.actionName, isSelected && { color: Colors.warning }]}>{cat.name}</Text>
                      <Text style={styles.actionDesc}>{cat.description}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                    <Text style={{ color: cat.civilianCasualties > 0.3 ? Colors.danger : Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9 }}>
                      Civ. Risk: {cat.civilianCasualties > 0.3 ? "EXTREME" : cat.civilianCasualties > 0.1 ? "HIGH" : "LOW"}
                    </Text>
                    <Text style={{ color: cat.diplomaticPenalty > 15 ? Colors.danger : Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9 }}>
                      Diplo Penalty: {cat.diplomaticPenalty}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}

        {selectedAttackType && selectedTargetCategory && (
          <Pressable
            onPress={() => handleLaunchStrike(entity.id, entity.name)}
            style={({ pressed }) => ({
              marginTop: 12,
              paddingVertical: 14,
              borderWidth: 2,
              borderColor: Colors.danger,
              borderRadius: 4,
              backgroundColor: pressed ? Colors.danger + "30" : Colors.danger + "15",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
            })}
          >
            <MaterialCommunityIcons name="rocket-launch" size={18} color={Colors.danger} />
            <Text style={{ color: Colors.danger, fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 2 }}>LAUNCH STRIKE</Text>
          </Pressable>
        )}
      </>
    );
  };


  const renderEntityDetail = (entity: { id: string; name: string; description: string; influence: number; loyalty: number; threat: number }, entityType: string) => {
    const color = FACTION_COLOR[entityType] ?? Colors.text;
    const leader = getLeader(entity.id);
    const cityEntity = megacities.find((m) => m.id === entity.id) ?? townships.find((t) => t.id === entity.id);
    const controlledDisposition = controlledDispositionLabel(cityEntity?.controlStatus);
    const controlledColor = cityEntity?.controlStatus === "annexed" ? "#9B59B6" : Colors.warning;
    const entityHistory = (state.diplomaticHistory ?? []).filter((entry) => entry.factionId === entity.id);
    const entityIntel = (state.intelItems ?? []).filter((item) => item.subjectId === entity.id || item.sourceId === entity.id);
    const relation = (state.locationRelations ?? {})[entity.id];
    const disclosure = getEntityDisclosure({
      entityId: entity.id,
      kind: entityType === "megacity" ? "megacity" : entityType === "township" ? "settlement" : entityType === "nation" ? "nation" : "faction",
      isDiscovered: Boolean(cityEntity && (("isActive" in cityEntity ? cityEntity.isActive : true)) && (cityEntity as any).status !== "undiscovered"),
      relation,
      ledger: (state.partnerLedgers ?? {})[entity.id],
      history: entityHistory,
      intel: entityIntel,
    });
    return (
      <>
        <Pressable onPress={() => { setSelectedFaction(null); }} style={styles.backToList}>
          <Feather name="arrow-left" size={14} color={Colors.accent} />
          <Text style={styles.backToListText}>BACK TO LIST</Text>
        </Pressable>

        {entityType === "megacity" || entityType === "township" ? (() => {
          const operational = operationalFromSettlement((cityEntity ?? entity) as ExternalMegacity | Township);

          return (
            <React.Fragment>
            <OperationalEntitySheet
              name={entity.name}
              kind={entityType}
               summary={`${operational.setting.terrain}${operational.setting.coastal ? " · coastal" : ""}${operational.setting.wasteland ? " · wasteland" : ""}`}
              disclosureLabel={disclosure.label}
              evidenceLabel={disclosureEvidenceLabel(disclosure.evidence)}
              level={disclosure.level}
              accent={color}
               accessibilityLabel={`${entity.name} operational facts`}
               sections={getOperationalSettlementSections(operational)}
            />
            </React.Fragment>
          );
        })() : (
          <React.Fragment>
          <OperationalEntitySheet
            name={entity.name}
            kind={entityType}
            summary={entity.description}
            disclosureLabel={disclosure.label}
            evidenceLabel={disclosureEvidenceLabel(disclosure.evidence)}
            level={disclosure.level}
            accent={color}
            sections={[{ title: "OPERATIONAL SUMMARY", rows: [
              { label: "INFLUENCE", value: `${Math.round(entity.influence)}` },
              { label: "LOYALTY", value: `${Math.round(entity.loyalty)}%` },
              { label: "THREAT", value: `${Math.round(entity.threat)}` },
              { label: "LEADER", value: leader ? `${leader.name} · ${leader.title}` : "UNKNOWN" },
            ] }]}
          />
          <View style={[styles.factionDetail, { borderColor: color, overflow: "hidden" }]}>
            {FACTION_ART[entityType] && (
              <Image
                source={FACTION_ART[entityType]}
                style={{ position: "absolute", right: -20, top: -20, width: 140, height: 140, opacity: 0.08, borderRadius: 8 }}
                resizeMode="cover"
                accessible={false}
              />
            )}
            <View style={styles.factionHeader}>
              <MaterialCommunityIcons name={(FACTION_ICONS[entityType] ?? "account-group") as any} size={28} color={color} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                <Text style={[styles.factionDetailName, { color }]}>{entity.name}</Text>
                <Text style={styles.factionType}>{entityType.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <StatBar label="INFLUENCE" value={entity.influence} color={color} />
              <StatBar label="LOYALTY" value={entity.loyalty} color={controlledDisposition ? controlledColor : entity.loyalty > 50 ? Colors.accent : Colors.warning} />
              <StatBar label="THREAT" value={entity.threat} color={controlledDisposition ? Colors.textMuted : entity.threat > 60 ? Colors.danger : Colors.textMuted} />
            </View>

            {(entity as any).leader && (
              <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderWidth: 1, borderColor: color + "40", borderRadius: 4, backgroundColor: Colors.bgCard }}>
                 <MaterialCommunityIcons name="account-tie" size={16} color={color} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11 }}>{(entity as any).leader.name}</Text>
                  <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9 }}>{(entity as any).leader.title}</Text>
                </View>
              </View>
            )}
          </View>
          </React.Fragment>
        )}

        <Pressable
          onPress={() => setShowDisposition(!showDisposition)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderWidth: 1, borderColor: Colors.info + "40", borderRadius: 4, backgroundColor: Colors.info + "10", marginBottom: 8 }}
        >
          <Feather name="bar-chart-2" size={14} color={Colors.info} />
          <Text style={{ color: Colors.info, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 }}>
            {showDisposition ? "HIDE DISPOSITION" : "VIEW DISPOSITION BREAKDOWN"}
          </Text>
          <Feather name={showDisposition ? "chevron-up" : "chevron-down"} size={12} color={Colors.info} />
        </Pressable>

        {showDisposition && (() => {
          const factors = getDispositionBreakdown(state, entity.id);
          const total = factors.reduce((s, f) => s + f.value, 0);
          return (
            <View style={{ borderWidth: 1, borderColor: Colors.info + "30", borderRadius: 4, padding: 12, marginBottom: 12, backgroundColor: Colors.bgCard }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <Feather name="bar-chart-2" size={16} color={Colors.info} />
                <Text style={{ color: Colors.info, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1 }}>DISPOSITION ANALYSIS</Text>
                <Text style={{ color: total >= 0 ? Colors.accent : Colors.danger, fontFamily: "Inter_700Bold", fontSize: 12, marginLeft: "auto" }}>{total >= 0 ? "+" : ""}{total}</Text>
              </View>
              {factors.map((f, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + "30" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 }}>{f.label}</Text>
                    <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 1 }}>{f.description}</Text>
                  </View>
                  <Text style={{ color: f.value > 0 ? Colors.accent : f.value < 0 ? Colors.danger : Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 11, width: 40, textAlign: "right" }}>{f.value > 0 ? "+" : ""}{f.value}</Text>
                </View>
              ))}
            </View>
          );
        })()}

        <Pressable
          onPress={() => setShowTimeline(!showTimeline)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderWidth: 1, borderColor: Colors.warning + "40", borderRadius: 4, backgroundColor: Colors.warning + "10", marginBottom: 12 }}
        >
          <Feather name="clock" size={14} color={Colors.warning} />
          <Text style={{ color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 }}>
            {showTimeline ? "HIDE HISTORY" : "VIEW RELATIONSHIP HISTORY"}
          </Text>
          <Feather name={showTimeline ? "chevron-up" : "chevron-down"} size={12} color={Colors.warning} />
        </Pressable>

        {showTimeline && (() => {
          const timeline = getRelationshipTimeline(state, entity.id);
          return (
            <View style={{ borderWidth: 1, borderColor: Colors.warning + "30", borderRadius: 4, padding: 12, marginBottom: 12, backgroundColor: Colors.bgCard }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <Feather name="clock" size={16} color={Colors.warning} />
                <Text style={{ color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1 }}>RELATIONSHIP TIMELINE</Text>
              </View>
              {timeline.length === 0 && <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10 }}>No diplomatic history recorded with this entity.</Text>}
              {timeline.map((entry, i) => {
                const evtColor = entry.type === "positive" ? Colors.accent : entry.type === "negative" ? Colors.danger : entry.type === "incident" ? Colors.warning : Colors.textMuted;
                return (
                  <View key={i} style={{ flexDirection: "row", marginBottom: 6, paddingLeft: 4 }}>
                    <View style={{ width: 2, backgroundColor: evtColor, marginRight: 8, borderRadius: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: evtColor, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 }}>{entry.event}</Text>
                      <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 8 }}>Tick {entry.tick} | Rep: {entry.impact >= 0 ? "+" : ""}{entry.impact}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })()}



        {(() => {
          const ledger = (state.partnerLedgers ?? {})[entity.id];
          if (!ledger || ledger.recent.length === 0) return null;
          const trendColor = ledger.trustTrend === "rising" ? Colors.accent : ledger.trustTrend === "falling" ? Colors.danger : Colors.textMuted;
          return (
            <View style={{ borderWidth: 1, borderColor: Colors.info + "30", borderRadius: 4, padding: 12, marginBottom: 12, backgroundColor: Colors.bgCard }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <MaterialCommunityIcons name="notebook-outline" size={16} color={Colors.info} />
                <Text style={{ color: Colors.info, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1 }}>RELATIONSHIP LEDGER</Text>
                <Text style={{ marginLeft: "auto", color: trendColor, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>{ledger.trustTrend.toUpperCase()}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 8 }}>
                <View><Text style={{ color: Colors.textMuted, fontSize: 8, fontFamily: "Inter_600SemiBold" }}>FAVORS</Text><Text style={{ color: Colors.accent, fontSize: 14, fontFamily: "Inter_700Bold" }}>{ledger.favors}</Text></View>
                <View><Text style={{ color: Colors.textMuted, fontSize: 8, fontFamily: "Inter_600SemiBold" }}>GRUDGES</Text><Text style={{ color: Colors.danger, fontSize: 14, fontFamily: "Inter_700Bold" }}>{ledger.grudges}</Text></View>
                <View><Text style={{ color: Colors.textMuted, fontSize: 8, fontFamily: "Inter_600SemiBold" }}>DEBTS</Text><Text style={{ color: ledger.debts >= 0 ? Colors.warning : Colors.info, fontSize: 14, fontFamily: "Inter_700Bold" }}>{ledger.debts >= 0 ? "+" : ""}{ledger.debts}</Text></View>
              </View>
              <Text style={{ color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>RECENT INTERACTIONS</Text>
              {ledger.recent.slice(0, 5).map((r, i) => {
                const c = r.outcome === "accepted" ? Colors.accent : r.outcome === "broken" ? Colors.danger : Colors.warning;
                return (
                  <View key={i} style={{ flexDirection: "row", marginBottom: 2 }}>
                    <Text style={{ color: c, fontFamily: "Inter_400Regular", fontSize: 9, width: 70 }}>{r.outcome.toUpperCase()}</Text>
                    <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 9, flex: 1 }}>{r.action.replace(/-/g, " ")}</Text>
                    <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9 }}>T{r.tick}</Text>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {(() => {
          const intel = (state.intelItems ?? []).filter((i) => i.subjectId === entity.id || i.sourceId === entity.id);
          if (intel.length === 0) return null;
          return (
            <View style={{ borderWidth: 1, borderColor: Colors.warning + "30", borderRadius: 4, padding: 12, marginBottom: 12, backgroundColor: Colors.bgCard }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <MaterialCommunityIcons name="file-document-outline" size={16} color={Colors.warning} />
                <Text style={{ color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1 }}>INTEL FILE</Text>
                <Text style={{ marginLeft: "auto", color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_600SemiBold" }}>{intel.length} ITEMS</Text>
              </View>
              {intel.slice(0, 5).map((it) => (
                <View key={it.id} style={{ borderLeftWidth: 2, borderLeftColor: Colors.warning + "60", paddingLeft: 8, marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <Text style={{ color: Colors.warning, fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 1 }}>{it.kind.toUpperCase()}</Text>
                    <Text style={{ color: Colors.textMuted, fontSize: 8, fontFamily: "Inter_400Regular" }}>· REL {it.reliability}%</Text>
                    <Text style={{ marginLeft: "auto", color: it.acted ? Colors.accent : Colors.textMuted, fontSize: 8, fontFamily: "Inter_700Bold" }}>
                      {it.acted ? "REVIEWED" : "ACTIVE"}
                    </Text>
                  </View>
                  <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 9 }}>
                    SOURCE: {it.source} · ACQUIRED T{it.acquiredTick} · EXPIRES T{it.expiresTick}
                  </Text>
                </View>
              ))}
            </View>
          );
        })()}


        <View style={styles.catRow}>
          {ACTION_CATEGORIES.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => setSelectedCategory(cat.id)}
              style={[styles.catChip, selectedCategory === cat.id && styles.catChipActive]}
            >
              <MaterialCommunityIcons name={cat.icon as any} size={12} color={selectedCategory === cat.id ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.catText, selectedCategory === cat.id && styles.catTextActive]}>{cat.label}</Text>
            </Pressable>
          ))}
        </View>

        {partnerControlStatus === "annexed" && (
          <View style={{ padding: 12, borderWidth: 1, borderColor: "#9B59B6", borderRadius: 4, backgroundColor: "#9B59B620", marginTop: 8 }}>
            <Text style={{ color: "#9B59B6", fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>TERRITORY ANNEXED</Text>
            <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11 }}>
              This city is part of our domain. No further diplomatic actions are needed or possible.
            </Text>
          </View>
        )}
        {partnerControlStatus === "occupied" && (
          <View style={{ padding: 10, borderWidth: 1, borderColor: Colors.warning, borderRadius: 4, backgroundColor: Colors.warning + "15", marginTop: 8 }}>
            <Text style={{ color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>UNDER OCCUPATION</Text>
            <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10 }}>
              Garrison forces administer this city. Limited actions available: relief aid, basic comms, or formal annexation.
            </Text>
          </View>
        )}
        {partnerControlStatus !== "annexed" && (selectedCategory === "attack" && partnerControlStatus !== "occupied" ? renderAttackPanel(entity) : (
          filteredActions.map((action) => {
            const status = getActionStatus(action);
            const isBlocked = status.blocked;
            const rules = getActionRules(action);
            const cooldown = selectedFaction ? getDiplomacyCooldownRemaining(state, selectedFaction, action.id) : 0;
            const missingPrereqs = selectedFaction ? getMissingPrerequisites(state, selectedFaction, action.id) : [];
            const chance = selectedFaction ? getAcceptanceChance(state, selectedFaction, action.id) : 0;
            const chanceColor = chance >= 70 ? Colors.accent : chance >= 40 ? Colors.warning : Colors.danger;
            return (
              <Pressable
                key={action.id}
                onPress={() => handleAction(action)}
                style={[styles.actionCard, isBlocked && styles.actionCardDisabled]}
              >
                <View style={styles.actionHeader}>
                  <MaterialCommunityIcons name={action.icon as any} size={16} color={isBlocked ? Colors.textMuted : Colors.accent} />
                  <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                    <Text style={[styles.actionName, isBlocked && { color: Colors.textMuted }]}>{action.label}</Text>
                    <Text style={styles.actionDesc}>{action.description}</Text>
                    {cooldown > 0 && (
                      <Text style={{ color: Colors.warning, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                        COOLDOWN: {cooldown} ticks
                      </Text>
                    )}
                    {missingPrereqs.length > 0 && (
                      <Text style={{ color: Colors.danger, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                        REQUIRES: {missingPrereqs.map((p) => p.replace(/-/g, " ").toUpperCase()).join(", ")}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.actionFooter}>
                  {rules.cost > 0 && (
                    <Text style={[styles.actionCost, state.resources.credits < rules.cost && { color: Colors.danger }]}>
                      {rules.cost.toLocaleString()} CR
                    </Text>
                  )}
                  {rules.requiresInfluence > 0 && (
                    <Text style={[styles.actionReq, (yesman || entity.influence >= rules.requiresInfluence) ? { color: Colors.accent } : { color: Colors.danger }]}>
                      REQ: {rules.requiresInfluence} INF
                    </Text>
                  )}
                  {!isBlocked && (
                    <Text style={{ color: chanceColor, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
                      {chance}%
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })
        ))}
      </>
    );
  };

  const activeAgreements = tradeAgreements.filter((a) => a.status === "active");
  const inactiveAgreements = tradeAgreements.filter((a) => a.status !== "active");
  const activeProjects = jointProjects.filter((p) => p.status === "in_progress");
  const completedProjects = jointProjects.filter((p) => p.status !== "in_progress");
  const activePacts = diplomaticPacts.filter((p) => p.status === "active");
  const inactivePacts = diplomaticPacts.filter((p) => p.status !== "active");

  const activeRail = railCorridors.filter(r => r.status === "consent_pending" || r.status === "under_construction" || r.status === "disrupted" || r.status === "completed");
  const inactiveRail = railCorridors.filter(r => r.status === "cancelled" || r.status === "rejected");
  const getRailPartnerName = (id: string) => {
    return megacityById.get(id)?.name || townshipById.get(id)?.name || id;
  };


  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <GameModal visible={modal.visible} title={modal.title} message={modal.message} buttons={modal.buttons} onDismiss={hideModal} />
      <LoadoutModal
        visible={loadoutTarget !== null || diploStrike !== null}
        state={state}
        attackType={activeAttackTypeDef}
        targetName={loadoutTarget?.name ?? diploStrike?.targetName ?? ""}
        targetDefense={loadoutTarget?.defense ?? (diploStrike ? getEntityInfra(diploStrike.targetId).military + getEntityInfra(diploStrike.targetId).walls : 0)}
        lastLoadout={lastLoadoutForActive}
        onCancel={() => { setLoadoutTarget(null); setDiploStrike(null); }}
        onConfirm={(loadout) => {
          if (diploStrike) {
            const ds = diploStrike;
            actionFaction(ds.targetId, ds.action.id, loadout);
            setDiploStrike(null);
            showModal(
              `${ds.targetName}: ACTION DISPATCHED`,
              "Strike report and casualty count have been delivered to your INBOX.",
              [{ text: "ACKNOWLEDGED" }]
            );
          } else {
            executeStrikeWithLoadout(loadout);
          }
        }}
      />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>DIPLOMACY TERMINAL</Text>
          <Text style={styles.headerSub}>
            {factions.filter((f) => f.isActive).length} FACTIONS · {megacities.length} MEGACITIES · {townships.filter((t) => t.status !== "undiscovered").length} SETTLEMENTS · {activeAgreements.length + activePacts.length} DEALS · REP: {state.diplomaticReputation ?? 50}
            {yesman ? " · YESMAN MODE" : ""}
          </Text>
        </View>
      </View>

      <View style={styles.tabContainer}>
        {[DIPLOMACY_TABS.slice(0, 5), DIPLOMACY_TABS.slice(5)].map((row, ri) => (
          <ScrollView
            key={ri}
            horizontal
            showsHorizontalScrollIndicator={Platform.OS === "web"}
            style={[styles.tabScroller, ri === 0 && styles.tabRowFirst]}
            contentContainerStyle={styles.tabRow}
          >
            {row.map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => { setActiveTab(tab.id); setSelectedFaction(null); }}
                style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
              >
                <Feather name={tab.icon as any} size={10} color={activeTab === tab.id ? Colors.bg : Colors.textMuted} />
                <Text numberOfLines={1} style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TutorialHint
          id="diplomacy_intro"
          message="Other megacities watch your every move. Trade agreements bring resources; pacts stack defensive bonuses; betrayals are remembered for a long time."
        />
        {activeTab === "factions" && !selectedFaction && (
          <>
            <Text style={styles.sectionTitle}>SELECT FACTION</Text>
            <ScrollView ref={attitudeScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
              {(["all", "allied", "friendly", "neutral", "suspicious", "hostile"] as const).map((opt) => {
                const active = attitudeFilter === opt;
                const c = opt === "all" ? Colors.accent : (ATTITUDE_COLOR[opt] ?? Colors.textMuted);
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setAttitudeFilter(opt)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 3,
                      borderWidth: 1,
                      borderColor: active ? c : Colors.border,
                      backgroundColor: active ? c + "25" : Colors.bgCard,
                    }}
                  >
                    <Text style={{ color: active ? c : Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>
                      {opt.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {factions
              .filter((f) => attitudeFilter === "all" || (f.isActive && (f.leader?.attitude ?? "neutral") === attitudeFilter))
              .map((f) => {
              const color = FACTION_COLOR[f.type] ?? Colors.text;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => f.isActive ? (() => { setSelectedFaction(f.id); })() : showModal("UNDISCOVERED", "This faction has not been contacted.", [{ text: "OK", style: "cancel" }])}
                  {...(Platform.OS === "web" && f.isActive ? { onContextMenu: (e: any) => openFactionCtx(f.id, f.name, e) } : {})}
                  style={[styles.factionCard, !f.isActive && styles.factionCardInactive]}
                >
                  <View style={styles.factionHeader}>
                    <MaterialCommunityIcons name={(FACTION_ICONS[f.type] ?? "account-group") as any} size={22} color={f.isActive ? color : Colors.textMuted} />
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                      <Text style={[styles.factionName, { color: f.isActive ? color : Colors.textMuted }]}>{f.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={styles.factionType}>{f.isActive ? f.type.toUpperCase() : "UNDISCOVERED"}</Text>
                        {f.isActive && <FaithChip faithId={f.dominantFaithId} />}
                      </View>
                    </View>
                    {f.isActive && (
                      <View style={styles.factionStats}>
                        <Text style={[styles.miniStat, { color }]}>INF {Math.round(f.influence)}</Text>
                        <Text style={[styles.miniStat, { color: f.threat > 60 ? Colors.danger : Colors.textMuted }]}>THR {Math.round(f.threat)}</Text>
                      </View>
                    )}
                  </View>

                  {f.isActive && f.leader && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border }}>
                      <MaterialCommunityIcons name="account-tie" size={12} color={color} />
                      <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10 }}>
                        {f.leader.name} — {f.leader.title}
                      </Text>
                      <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, backgroundColor: (ATTITUDE_COLOR[f.leader.attitude] ?? Colors.textMuted) + "20" }}>
                        <Text style={{ color: ATTITUDE_COLOR[f.leader.attitude] ?? Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.5 }}>
                          {f.leader.attitude.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  )}
                  {!f.isActive && <Text style={styles.factionDesc}>Contact not established. Send scouts to discover this faction.</Text>}
                </Pressable>
              );
            })}
          </>
        )}

        {activeTab === "factions" && selectedFaction && faction && (
          renderEntityDetail(faction, faction.type)
        )}

        {activeTab === "megacities" && !selectedFaction && (
          <>
            <Text style={styles.sectionTitle}>EXTERNAL MEGACITIES</Text>
            {megacities.length === 0 && <Text style={styles.emptyText}>No megacities discovered yet.</Text>}
            {megacities.map((m) => {
              const color = FACTION_COLOR["megacity"];
              const controlledDisposition = controlledDispositionLabel(m.controlStatus);
              const dispositionColor = m.controlStatus === "annexed" ? "#9B59B6" : Colors.warning;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => m.isActive ? (() => { setSelectedFaction(m.id); })() : showModal("UNDISCOVERED", "This megacity has not been contacted.", [{ text: "OK", style: "cancel" }])}
                  style={[styles.factionCard, !m.isActive && styles.factionCardInactive]}
                >
                  <View style={styles.factionHeader}>
                    {(() => {
                      const sigil = getMegacitySigil(m.id);
                      return sigil ? (
                        <Image
                          source={sigil}
                          style={{ width: 24, height: 30, borderRadius: 2, opacity: m.isActive ? 1 : 0.4 }}
                          resizeMode="cover"
                          accessibilityLabel={`${m.name} sigil`}
                        />
                      ) : (
                        <MaterialCommunityIcons name="city-variant" size={22} color={m.isActive ? color : Colors.textMuted} />
                      );
                    })()}
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                      <Text style={[styles.factionName, { color: m.isActive ? color : Colors.textMuted }]}>{m.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={styles.factionType}>MEGACITY</Text>
                        {m.isActive && <FaithChip faithId={m.dominantFaithId} />}
                      </View>
                    </View>
                    {m.isActive && (
                      <View style={styles.factionStats}>
                        <Text style={[styles.miniStat, { color }]}>INF {Math.round(m.influence)}</Text>
                        <Text style={[styles.miniStat, { color: Colors.accent }]}>LOY {Math.round(m.loyalty)}</Text>
                      </View>
                    )}
                  </View>
                  {m.isActive && (m.controlStatus === "occupied" || m.controlStatus === "annexed") && (
                    <View style={{ alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: m.controlStatus === "annexed" ? "#9B59B6" : Colors.warning, borderRadius: 3, backgroundColor: (m.controlStatus === "annexed" ? "#9B59B6" : Colors.warning) + "15" }}>
                      <Text style={{ color: m.controlStatus === "annexed" ? "#9B59B6" : Colors.warning, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>
                        {m.controlStatus === "annexed" ? "ANNEXED" : `OCCUPIED${m.tributePerTick ? ` · +${m.tributePerTick} CR/TICK` : ""}`}
                      </Text>
                    </View>
                  )}
                  {m.isActive && (() => {
                    const arch = m.archetype ?? inferArchetype(m);
                    const stance = m.stance ?? computeStance(m);
                    const archMeta = PARTNER_ARCHETYPES[arch];
                    const stanceMeta = getStanceMeta(stance);
                    const stanceColor = controlledDisposition ? dispositionColor : stanceMeta.color;
                    return (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: stanceColor, borderRadius: 3 }}>
                          <Feather name={(controlledDisposition ? "shield" : stanceMeta.icon) as any} size={9} color={stanceColor} />
                          <Text style={{ color: stanceColor, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 }}>{controlledDisposition ?? stanceMeta.label}</Text>
                        </View>
                        <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: archMeta.color, borderRadius: 3 }}>
                          <Text style={{ color: archMeta.color, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 }}>{archMeta.label}</Text>
                        </View>
                      </View>
                    );
                  })()}
                  {m.isActive && m.currentAction && (
                    <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 4, fontStyle: "italic" }}>{m.currentAction}</Text>
                  )}
                  {m.isActive && (() => {
                    const operational = operationalFromSettlement(m);
                    return (
                      <View style={{ marginTop: 6, gap: 2 }}>
                        <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10 }}>
                          {operational.population.toLocaleString()} POP · {operational.government.style.toUpperCase()}
                        </Text>
                        {operational.trade.exports.length > 0 && (
                          <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10 }}>
                            EXPORTS: {operational.trade.exports.join(", ").toUpperCase()}
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                  {m.isActive && m.leader && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border }}>
                      <MaterialCommunityIcons name="account-tie" size={12} color={color} />
                      <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10 }}>
                        {m.leader.name} — {m.leader.title}
                      </Text>
                      <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, backgroundColor: (controlledDisposition ? dispositionColor : ATTITUDE_COLOR[m.leader.attitude] ?? Colors.textMuted) + "20" }}>
                        <Text style={{ color: controlledDisposition ? dispositionColor : ATTITUDE_COLOR[m.leader.attitude] ?? Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.5 }}>
                          {controlledDisposition ?? m.leader.attitude.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  )}
                  {m.isActive && (
                    <View style={styles.inventoryRow}>
                      <Text style={styles.inventoryLabel}>TRADE INVENTORY:</Text>
                      <Text style={styles.inventoryItems}>
                        {Object.entries(m.tradeInventory).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        {Object.keys(m.tradeInventory).length > 5 ? ` +${Object.keys(m.tradeInventory).length - 5} more` : ""}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </>
        )}

        {activeTab === "megacities" && selectedFaction && megacity && (
          renderEntityDetail(megacity, megacity.factionType ?? "megacity")
        )}

        {activeTab === "settlements" && !selectedFaction && (
          <>
            <Text style={styles.sectionTitle}>TOWNS, CAMPS & MINOR FACTIONS</Text>
            {townships.filter((t) => t.status !== "undiscovered").length === 0 && (
              <Text style={styles.emptyText}>No settlements discovered yet. Use RECON to scan the wasteland.</Text>
            )}
            {townships.map((t) => {
              const isDiscovered = t.status !== "undiscovered";
              const color = FACTION_COLOR[t.factionType] ?? Colors.textMuted;
              const iconName = FACTION_ICONS[t.factionType] ?? "map-marker";
              const typeLabel = t.factionType.toUpperCase();
              const controlledDisposition = controlledDispositionLabel(t.controlStatus);
              const dispositionColor = t.controlStatus === "annexed" ? "#9B59B6" : Colors.warning;
              const statusColor = controlledDisposition ? dispositionColor : t.status === "allied" ? Colors.accent : t.status === "hostile" ? Colors.danger : t.status === "neutral" ? Colors.warning : Colors.textMuted;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => isDiscovered ? (() => { setSelectedFaction(t.id); })() : showModal("UNDISCOVERED", "This settlement has not been located. Deploy recon sweeps to discover it.", [{ text: "OK", style: "cancel" }])}
                  style={[styles.factionCard, !isDiscovered && styles.factionCardInactive]}
                >
                  <View style={styles.factionHeader}>
                    <MaterialCommunityIcons name={iconName as any} size={22} color={isDiscovered ? color : Colors.textMuted} />
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                      <Text style={[styles.factionName, { color: isDiscovered ? color : Colors.textMuted }]}>{isDiscovered ? t.name : "???"}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={styles.factionType}>{typeLabel}</Text>
                        {isDiscovered && (
                          <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, backgroundColor: statusColor + "20" }}>
                            <Text style={{ color: statusColor, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.5 }}>{controlledDisposition ?? t.status.toUpperCase()}</Text>
                          </View>
                        )}
                        {isDiscovered && <FaithChip faithId={t.dominantFaithId} />}
                      </View>
                    </View>
                    {isDiscovered && (
                      <View style={styles.factionStats}>
                        <Text style={[styles.miniStat, { color }]}>INF {Math.round(t.influence)}</Text>
                        <Text style={[styles.miniStat, { color: Colors.accent }]}>LOY {Math.round(t.loyalty)}</Text>
                      </View>
                    )}
                  </View>
                  {isDiscovered && (t.controlStatus === "occupied" || t.controlStatus === "annexed") && (
                    <View style={{ alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: t.controlStatus === "annexed" ? "#9B59B6" : Colors.warning, borderRadius: 3, backgroundColor: (t.controlStatus === "annexed" ? "#9B59B6" : Colors.warning) + "15" }}>
                      <Text style={{ color: t.controlStatus === "annexed" ? "#9B59B6" : Colors.warning, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>
                        {t.controlStatus === "annexed" ? "ANNEXED" : `OCCUPIED${t.tributePerTick ? ` · +${t.tributePerTick} CR/TICK` : ""}`}
                      </Text>
                    </View>
                  )}
                  {isDiscovered && (() => {
                    const arch = t.archetype ?? inferArchetype(t);
                    const stance = t.stance ?? computeStance(t);
                    const archMeta = PARTNER_ARCHETYPES[arch];
                    const stanceMeta = getStanceMeta(stance);
                    const stanceColor = controlledDisposition ? dispositionColor : stanceMeta.color;
                    return (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: stanceColor, borderRadius: 3 }}>
                          <Feather name={(controlledDisposition ? "shield" : stanceMeta.icon) as any} size={9} color={stanceColor} />
                          <Text style={{ color: stanceColor, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 }}>{controlledDisposition ?? stanceMeta.label}</Text>
                        </View>
                        <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: archMeta.color, borderRadius: 3 }}>
                          <Text style={{ color: archMeta.color, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 }}>{archMeta.label}</Text>
                        </View>
                      </View>
                    );
                  })()}
                  {isDiscovered && t.currentAction && (
                    <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 4, fontStyle: "italic" }}>{t.currentAction}</Text>
                  )}
                  {isDiscovered && (() => {
                    const operational = operationalFromSettlement(t);
                    return (
                      <View style={{ marginTop: 6, gap: 2 }}>
                        <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10 }}>
                          {operational.population.toLocaleString()} POP · {operational.government.style.toUpperCase()}
                        </Text>
                        {operational.resources.length > 0 && (
                          <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10 }}>
                            RESOURCES: {operational.resources.join(", ").toUpperCase()}
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                  {isDiscovered && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border }}>
                      <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10 }}>POP: {t.population.toLocaleString()}</Text>
                      <Text style={{ color: controlledDisposition ? Colors.textMuted : Colors.danger, fontFamily: "Inter_500Medium", fontSize: 10 }}>THR: {Math.round(t.threat)}</Text>
                    </View>
                  )}
                  {isDiscovered && t.leader && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <MaterialCommunityIcons name="account-tie" size={12} color={color} />
                      <Text style={{ color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10 }}>
                        {t.leader.name} — {t.leader.title}
                      </Text>
                      <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, backgroundColor: (controlledDisposition ? dispositionColor : ATTITUDE_COLOR[t.leader.attitude] ?? Colors.textMuted) + "20" }}>
                        <Text style={{ color: controlledDisposition ? dispositionColor : ATTITUDE_COLOR[t.leader.attitude] ?? Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.5 }}>
                          {controlledDisposition ?? t.leader.attitude.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </>
        )}

        {activeTab === "settlements" && selectedFaction && township && (
          renderEntityDetail(township as any, township.factionType)
        )}

        {activeTab === "agreements" && (
          <>
            <Text style={styles.sectionTitle}>ACTIVE TRADE AGREEMENTS ({activeAgreements.length})</Text>
            {activeAgreements.length === 0 && <Text style={styles.emptyText}>No active trade agreements. Negotiate deals with factions or megacities.</Text>}
            {activeAgreements.map((a) => (
              <AgreementCard key={a.id} agreement={a} onCancel={() => confirmCancelAgreement(a)} />
            ))}

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>JOINT PROJECTS ({activeProjects.length})</Text>
            {activeProjects.length === 0 && <Text style={styles.emptyText}>No active joint projects. Propose joint research with allies.</Text>}
            {activeProjects.map((p) => (
              <ProjectCard key={p.id} project={p} onCancel={() => confirmCancelProject(p)} />
            ))}

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>RAIL CORRIDORS ({activeRail.length})</Text>
            {activeRail.length === 0 && <Text style={styles.emptyText}>No active rail corridors. Propose them from the World Map.</Text>}
            {activeRail.map((r) => (
              <RailCorridorCard key={r.id} corridor={r} state={state} partnerName={getRailPartnerName(r.endpointId)} onCancel={() => cancelRailCorridor(r.id)} onRespond={(acc) => respondToRailConsent(r.id, acc)} onInstallUpgrade={(upgradeId) => installRailTrainUpgrade(r.id, upgradeId)} />
            ))}

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>DIPLOMATIC PACTS ({activePacts.length})</Text>
            {activePacts.length === 0 && <Text style={styles.emptyText}>No active pacts. Propose alliances or negotiate ceasefires to establish pacts.</Text>}
            {activePacts.map((p) => (
              <PactCard key={p.id} pact={p} onCancel={() => confirmBreakPact(p)} />
            ))}

            {(inactiveAgreements.length > 0 || completedProjects.length > 0 || inactivePacts.length > 0 || inactiveRail.length > 0) && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>HISTORY</Text>
                {inactiveAgreements.map((a) => (
                  <AgreementCard key={a.id} agreement={a} onCancel={() => {}} />
                ))}
                {completedProjects.map((p) => (
                  <ProjectCard key={p.id} project={p} onCancel={() => {}} />
                ))}
                {inactivePacts.map((p) => (
                  <PactCard key={p.id} pact={p} onCancel={() => {}} />
                ))}
                {inactiveRail.map((r) => (
                  <RailCorridorCard key={r.id} corridor={r} state={state} partnerName={getRailPartnerName(r.endpointId)} onCancel={() => {}} onRespond={() => {}} onInstallUpgrade={() => {}} />
                ))}
              </>
            )}
          </>
        )}

        {activeTab === "incidents" && (() => {
          const activeIncidents = adv.incidents.filter((i) => !i.resolved);
          const resolvedIncidents = adv.incidents.filter((i) => i.resolved).slice(0, 10);
          const SEVERITY_COLOR: Record<string, string> = { minor: Colors.textMuted, moderate: Colors.warning, major: Colors.danger, crisis: "#FF2222" };
          const SEVERITY_ICON: Record<string, string> = { minor: "info", moderate: "alert-triangle", major: "alert-octagon", crisis: "zap" };
          return (
            <>
              <Text style={styles.sectionTitle}>ACTIVE CRISES ({activeIncidents.length})</Text>
              {activeIncidents.length === 0 && <Text style={styles.emptyText}>No active diplomatic incidents. The situation is stable... for now.</Text>}
              {activeIncidents.map((inc) => {
                const color = SEVERITY_COLOR[inc.severity] ?? Colors.warning;
                const ticksLeft = inc.responseDeadline - state.totalTicks;
                return (
                  <View key={inc.id} style={[styles.agreementCard, { borderColor: color }]}>
                    <View style={styles.agreementHeader}>
                      <Feather name={SEVERITY_ICON[inc.severity] as any ?? "alert-triangle"} size={14} color={color} />
                      <Text style={[styles.agreementTitle, { color }]}>{inc.title}</Text>
                      <Text style={[styles.agreementStatus, { color }]}>{inc.severity.toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.agreementDetail, { marginTop: 8, lineHeight: 16 }]}>{inc.description}</Text>
                    <Text style={[styles.agreementDetail, { color: Colors.warning, marginTop: 4 }]}>From: {inc.instigatorName} | Deadline: {ticksLeft > 0 ? `${ticksLeft} ticks` : "EXPIRED"}</Text>
                    <View style={{ gap: 6, marginTop: 10 }}>
                      {inc.responses.map((resp) => {
                        const respColor = resp.style === "aggressive" ? Colors.danger : resp.style === "appeasement" ? Colors.warning : resp.style === "diplomatic" ? Colors.accent : Colors.textSecondary;
                        const effectsList = Object.entries(resp.effects).filter(([, v]) => v !== 0 && v != null).map(([k, v]) => {
                          if (k === "populationGain" && (v as number) > 0) {
                            const scaled = Math.round((v as number) * getRefugeePopScale(state.cityStats.population));
                            return `populationGain: +${scaled.toLocaleString()}`;
                          }
                          return `${k}: ${(v as number) > 0 ? "+" : ""}${v}`;
                        }).join(" | ");
                        return (
                         <Pressable key={resp.id} onPress={() => { showModal("RESPOND TO INCIDENT", `${resp.label}\n\n${resp.description}\n\nEffects: ${effectsList || "None"}`, [{ text: "CANCEL", style: "cancel" }, { text: "CONFIRM", style: "destructive", onPress: () => { resolveIncident(inc.id, resp.id); hideModal(); } }]); }} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.7 }, { borderColor: respColor + "40" }]}>
                            <Text style={[styles.actionName, { color: respColor }]}>{resp.label}</Text>
                            <Text style={styles.actionDesc}>{resp.description}</Text>
                            {effectsList ? <Text style={[styles.actionCost, { marginTop: 4, color: Colors.textMuted }]}>{effectsList}</Text> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              {resolvedIncidents.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>RESOLVED ({resolvedIncidents.length})</Text>
                  {resolvedIncidents.map((inc) => (
                    <View key={inc.id} style={[styles.agreementCard, { borderColor: Colors.border, opacity: 0.6 }]}>
                      <View style={styles.agreementHeader}>
                        <Feather name="check-circle" size={14} color={Colors.textMuted} />
                        <Text style={[styles.agreementTitle, { color: Colors.textMuted }]}>{inc.title}</Text>
                        <Text style={[styles.agreementStatus, { color: Colors.accent }]}>{inc.resolution}</Text>
                      </View>
                      <Text style={[styles.agreementDetail, { marginTop: 4 }]}>Instigator: {inc.instigatorName}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          );
        })()}

        {activeTab === "envoys" && (() => {
          const envoys = adv.envoys;
          const availableTargets = [
            ...factions.filter((f) => f.isActive && !envoys.some((e) => e.targetId === f.id)).map((f) => ({ id: f.id, name: f.name })),
            ...megacities.filter((m) => m.isActive && !envoys.some((e) => e.targetId === m.id)).map((m) => ({ id: m.id, name: m.name })),
          ];
          const TRAIT_COLOR: Record<string, string> = { charming: Colors.accent, intimidating: Colors.danger, cunning: "#BB88FF", scholarly: Colors.info, ruthless: "#FF4444", empathetic: Colors.warning };
          return (
            <>
              <Text style={styles.sectionTitle}>DIPLOMATIC CORPS ({envoys.length}/10)</Text>
              <Text style={styles.emptyText}>Envoys provide passive loyalty and influence bonuses to their assigned faction. Each envoy has unique traits affecting their effectiveness.</Text>
              {envoys.map((env) => (
                <View key={env.id} style={[styles.agreementCard, { borderColor: TRAIT_COLOR[env.trait] ?? Colors.border }]}>
                  <View style={styles.agreementHeader}>
                    <Feather name="briefcase" size={14} color={TRAIT_COLOR[env.trait] ?? Colors.accent} />
                    <Text style={[styles.agreementTitle, { color: TRAIT_COLOR[env.trait] ?? Colors.accent }]}>{env.name}</Text>
                    <Text style={[styles.agreementStatus, { color: Colors.textMuted }]}>SKILL {env.skill}</Text>
                  </View>
                  <View style={styles.agreementBody}>
                    <Text style={styles.agreementDetail}>Assigned to: {env.targetName}</Text>
                    <Text style={styles.agreementDetail}>Trait: {env.trait.toUpperCase()} | Since tick {env.assignedTick}</Text>
                    <Text style={[styles.agreementDetail, { color: Colors.accent }]}>
                      Bonuses: Loyalty {env.bonuses.loyalty > 0 ? "+" : ""}{env.bonuses.loyalty} | Influence {env.bonuses.influence > 0 ? "+" : ""}{env.bonuses.influence} | Trade {env.bonuses.trade > 0 ? "+" : ""}{env.bonuses.trade} | Intel {env.bonuses.intel > 0 ? "+" : ""}{env.bonuses.intel}
                    </Text>
                  </View>
                  <Pressable onPress={() => { showModal("RECALL ENVOY", `Recall ${env.name} from ${env.targetName}? Their diplomatic bonuses will be lost.`, [{ text: "CANCEL", style: "cancel" }, { text: "RECALL", style: "destructive", onPress: () => { recallEnvoy(env.id); hideModal(); } }]); }} style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>RECALL</Text>
                  </Pressable>
                </View>
              ))}
              {availableTargets.length > 0 && envoys.length < 10 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>ASSIGN NEW ENVOY</Text>
                  {availableTargets.map((target) => (
                    <Pressable key={target.id} onPress={() => { const ok = assignEnvoy(target.id, target.name); if (ok) showModal("ENVOY ASSIGNED", `A new envoy has been dispatched to ${target.name}. They will begin building diplomatic relations immediately.`, [{ text: "OK" }]); else showModal("CANNOT ASSIGN", "Maximum envoys reached or one is already assigned there.", [{ text: "OK" }]); }} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.7 }]}>
                      <Text style={[styles.actionName, { color: Colors.accent }]}>DISPATCH TO {target.name.toUpperCase()}</Text>
                      <Text style={styles.actionDesc}>Assign a randomly generated envoy to this faction</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </>
          );
        })()}

        {activeTab === "negotiations" && (() => {
          const activeNegs = adv.negotiations.filter((n) => n.status === "active");
          const completedNegs = adv.negotiations.filter((n) => n.status !== "active").slice(0, 5);
          const canStartNew = activeNegs.length < 2;
          const eligiblePartners = [...factions.filter((f) => f.isActive && f.loyalty >= 15), ...megacities.filter((m) => m.isActive && m.loyalty >= 15)].filter((p) => !activeNegs.some((n) => n.partnerId === p.id));
          return (
            <>
              <Text style={styles.sectionTitle}>ACTIVE NEGOTIATIONS ({activeNegs.length}/2)</Text>
              <Text style={styles.emptyText}>Multi-step diplomatic negotiations with branching outcomes. Each choice affects the next step's success chance.</Text>
              {activeNegs.length === 0 && <Text style={styles.emptyText}>No active negotiations. Open talks with a faction or megacity to begin.</Text>}
              {activeNegs.map((neg) => {
                const step = neg.steps[neg.currentStep];
                if (!step) return null;
                const ticksLeft = neg.deadlineTick - state.totalTicks;
                return (
                  <View key={neg.id} style={[styles.agreementCard, { borderColor: Colors.info }]}>
                    <View style={styles.agreementHeader}>
                      <Feather name="message-circle" size={14} color={Colors.info} />
                      <Text style={[styles.agreementTitle, { color: Colors.info }]}>{neg.title}</Text>
                      <Text style={[styles.agreementStatus, { color: Colors.textMuted }]}>STEP {neg.currentStep + 1}/{neg.steps.length}</Text>
                    </View>
                    <Text style={[styles.agreementDetail, { marginTop: 4 }]}>Partner: {neg.partnerName} | Deadline: {ticksLeft > 0 ? `${ticksLeft} ticks` : "EXPIRED"}</Text>
                    <Text style={[styles.agreementDetail, { marginTop: 4, fontFamily: "Inter_500Medium", color: Colors.textSecondary }]}>{neg.stakesDescription}</Text>
                    <View style={{ backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, marginTop: 10 }}>
                      <Text style={[styles.agreementDetail, { color: Colors.text, fontFamily: "Inter_500Medium", lineHeight: 18, marginBottom: 8 }]}>{step.prompt}</Text>
                      {step.choices.map((ch) => {
                        const chColor = ch.style === "aggressive" ? Colors.danger : ch.style === "generous" ? Colors.accent : ch.style === "deceptive" ? "#BB88FF" : Colors.info;
                        return (
                          <Pressable key={ch.id} onPress={() => { showModal("CHOOSE RESPONSE", `${ch.label}\n\n${ch.description}\n\nSuccess chance: ~${ch.successChance}%`, [{ text: "CANCEL", style: "cancel" }, { text: "CHOOSE", style: "destructive", onPress: () => { resolveNegotiationStep(neg.id, ch.id); hideModal(); } }]); }} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.7 }, { borderColor: chColor + "40", marginBottom: 6 }]}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: chColor }} />
                              <Text style={[styles.actionName, { color: chColor, fontSize: 11 }]}>{ch.label}</Text>
                            </View>
                            <Text style={[styles.actionDesc, { marginTop: 2 }]}>{ch.description}</Text>
                            <Text style={[styles.actionCost, { marginTop: 4, color: Colors.textMuted }]}>~{ch.successChance}% success | Style: {ch.style.toUpperCase()}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {neg.steps.filter((s) => s.chosen).map((s, i) => (
                      <View key={i} style={{ marginTop: 6, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: s.outcome === "SUCCESS" ? Colors.accent : Colors.danger }}>
                        <Text style={[styles.agreementDetail, { color: s.outcome === "SUCCESS" ? Colors.accent : Colors.danger }]}>Step {i + 1}: {s.choices.find((c) => c.id === s.chosen)?.label ?? s.chosen} — {s.outcome}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
              {completedNegs.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>COMPLETED</Text>
                  {completedNegs.map((neg) => (
                    <View key={neg.id} style={[styles.agreementCard, { borderColor: neg.status === "success" ? Colors.accent : Colors.danger, opacity: 0.6 }]}>
                      <View style={styles.agreementHeader}>
                        <Feather name={neg.status === "success" ? "check-circle" : "x-circle"} size={14} color={neg.status === "success" ? Colors.accent : Colors.danger} />
                        <Text style={[styles.agreementTitle, { color: neg.status === "success" ? Colors.accent : Colors.danger }]}>{neg.title}</Text>
                        <Text style={[styles.agreementStatus, { color: Colors.textMuted }]}>{neg.status.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.agreementDetail}>Partner: {neg.partnerName}</Text>
                    </View>
                  ))}
                </>
              )}
              {canStartNew && eligiblePartners.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>OPEN NEW TALKS</Text>
                  <Text style={styles.emptyText}>Requires at least 15 loyalty with the partner.</Text>
                  {eligiblePartners.map((p) => (
                    <Pressable key={p.id} onPress={() => { const ok = startNegotiation(p.id, p.name); if (ok) showModal("TALKS OPENED", `Diplomatic negotiations have begun with ${p.name}. Choose your responses carefully — each step builds on the last.`, [{ text: "BEGIN" }]); else showModal("CANNOT START", "Maximum concurrent negotiations reached or already negotiating.", [{ text: "OK" }]); }} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.7 }]}>
                      <Text style={[styles.actionName, { color: Colors.info }]}>BEGIN TALKS WITH {p.name.toUpperCase()}</Text>
                      <Text style={styles.actionDesc}>Start a multi-step diplomatic negotiation</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </>
          );
        })()}

        {activeTab === "wars" && (() => {
          const wars = adv.wars;
          const conferences = adv.peaceConferences.filter((c) => c.status === "negotiating");
          const STAGE_COLOR: Record<WarEscalationStage, string> = { tensions: Colors.warning, skirmishes: "#FF8800", open_war: Colors.danger, total_war: "#FF0000" };
          const STAGE_LABEL: Record<WarEscalationStage, string> = { tensions: "TENSIONS", skirmishes: "SKIRMISHES", open_war: "OPEN WAR", total_war: "TOTAL WAR" };
          return (
            <>
              <Text style={styles.sectionTitle}>ACTIVE CONFLICTS ({wars.length})</Text>
              {wars.length === 0 && <Text style={styles.emptyText}>No active wars. The peace holds... for now. Declaring war from the faction detail screen will register conflicts here.</Text>}
              {wars.map((war) => {
                const color = STAGE_COLOR[war.stage];
                const conf = conferences.find((c) => c.warId === war.id);
                const elapsedDays = Math.max(0, Math.floor((state.totalTicks - war.startTick) / WAR_TICKS_PER_DAY));
                const elapsedWeeks = Math.floor(elapsedDays / 7);
                const exchangeReports = (war.timeline?.reports ?? [])
                  .filter((report) => report.label.includes("Prisoner exchange completed"))
                  .slice(-3);
                return (
                  <View key={war.id} style={[styles.agreementCard, { borderColor: color }]}>
                    <View style={styles.agreementHeader}>
                      <Feather name="zap" size={14} color={color} />
                      <Text style={[styles.agreementTitle, { color }]}>{war.belligerentNames[0]} vs {war.belligerentNames[1]}</Text>
                      <Text style={[styles.agreementStatus, { color }]}>{STAGE_LABEL[war.stage]}</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.agreementDetail}>Intensity: {Math.round(war.intensity)}/100</Text>
                        <View style={[styles.statBarTrack, { marginTop: 4 }]}>
                          <View style={[styles.statBarFill, { width: `${Math.min(100, war.intensity)}%`, backgroundColor: color }]} />
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.agreementDetail}>War Weariness: {Math.round(war.warWeariness)}/100</Text>
                        <View style={[styles.statBarTrack, { marginTop: 4 }]}>
                          <View style={[styles.statBarFill, { width: `${Math.min(100, war.warWeariness)}%`, backgroundColor: Colors.warning }]} />
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                      <Text style={styles.agreementDetail}>Our casualties: {war.casualties.a.toLocaleString()}</Text>
                      <Text style={styles.agreementDetail}>Their casualties: {war.casualties.b.toLocaleString()}</Text>
                    </View>
                    <Text style={[styles.agreementDetail, { marginTop: 6 }]}>
                      War duration: {elapsedWeeks > 0 ? `${elapsedWeeks} week${elapsedWeeks === 1 ? "" : "s"} (${elapsedDays} days)` : `${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                      <Text style={styles.agreementDetail}>Our infra damage: {war.infrastructureDamage.a}</Text>
                      <Text style={styles.agreementDetail}>Their infra damage: {war.infrastructureDamage.b}</Text>
                    </View>
                    {exchangeReports.length > 0 && (
                      <View style={{ marginTop: 8, padding: 8, borderWidth: 1, borderColor: Colors.accent + "40", borderRadius: 4, backgroundColor: Colors.accent + "08" }}>
                        <Text style={[styles.agreementDetail, { color: Colors.accent, fontFamily: "Inter_700Bold", letterSpacing: 0.8 }]}>CUSTODY DIPLOMACY</Text>
                        {exchangeReports.map((report) => (
                          <Text key={`${war.id}-${report.tick}-${report.label}`} style={[styles.agreementDetail, { marginTop: 3, color: Colors.textSecondary }]}>
                            T{report.tick}: {report.label}
                          </Text>
                        ))}
                      </View>
                    )}
                    {war.peaceOffered && !conf && (
                      <View style={{ marginTop: 8, padding: 8, backgroundColor: Colors.accent + "10", borderRadius: 4, borderWidth: 1, borderColor: Colors.accent + "30" }}>
                        <Text style={[styles.agreementDetail, { color: Colors.accent, fontFamily: "Inter_600SemiBold" }]}>PEACE OFFER AVAILABLE</Text>
                        <Pressable onPress={() => { const ok = proposePeace(war.id); if (ok) showModal("PEACE CONFERENCE", "A peace conference has been convened. Review and respond to demands in the negotiations below.", [{ text: "PROCEED" }]); }} style={({ pressed }) => [styles.cancelBtn, { borderColor: Colors.accent, marginTop: 6 }, pressed && { opacity: 0.7 }]}>
                          <Text style={[styles.cancelBtnText, { color: Colors.accent }]}>OPEN PEACE TALKS</Text>
                        </Pressable>
                      </View>
                    )}
                    {conf && (
                      <View style={{ marginTop: 10, padding: 10, backgroundColor: Colors.bg, borderRadius: 4, borderWidth: 1, borderColor: Colors.info }}>
                        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>PEACE CONFERENCE</Text>
                        {conf.demands.map((d) => (
                          <View key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <Feather name={d.accepted ? "check-square" : "square"} size={16} color={d.accepted ? Colors.accent : Colors.textMuted} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.agreementDetail, { color: Colors.text }]}>{d.demandType.replace(/_/g, " ").toUpperCase()}</Text>
                              <Text style={styles.agreementDetail}>{d.description}</Text>
                            </View>
                            <View style={{ flexDirection: "row", gap: 4 }}>
                              <Pressable onPress={() => acceptPeaceDemand(conf.id, d.id)} style={[styles.cancelBtn, { borderColor: Colors.accent, paddingHorizontal: 8 }]}>
                                <Text style={[styles.cancelBtnText, { color: Colors.accent }]}>ACCEPT</Text>
                              </Pressable>
                              <Pressable onPress={() => rejectPeaceDemand(conf.id, d.id)} style={[styles.cancelBtn, { paddingHorizontal: 8 }]}>
                                <Text style={styles.cancelBtnText}>REJECT</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))}
                        <Pressable onPress={() => { showModal("CONCLUDE PEACE", `Accept ${conf.demands.filter((d) => d.accepted).length}/${conf.demands.length} demands and attempt to end the war? Need majority accepted.`, [{ text: "CANCEL", style: "cancel" }, { text: "CONCLUDE", style: "destructive", onPress: () => { concludePeace(conf.id); hideModal(); } }]); }} style={({ pressed }) => [styles.cancelBtn, { borderColor: Colors.info, marginTop: 8, alignSelf: "center" }, pressed && { opacity: 0.7 }]}>
                          <Text style={[styles.cancelBtnText, { color: Colors.info }]}>CONCLUDE PEACE TALKS</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
              {(adv.concludedWars ?? []).length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 18 }]}>WAR ARCHIVE ({(adv.concludedWars ?? []).length})</Text>
                  <Text style={styles.emptyText}>Concluded conflicts remain here as a compact operational record.</Text>
                  {(adv.concludedWars ?? []).map((history) => {
                    const elapsedDays = Math.floor(Math.max(0, history.concludedTick - history.startTick) / WAR_TICKS_PER_DAY);
                    return (
                      <View key={history.id} style={[styles.agreementCard, { borderColor: Colors.textMuted }]}>
                        <View style={styles.agreementHeader}>
                          <Feather name="archive" size={14} color={Colors.textMuted} />
                          <Text style={[styles.agreementTitle, { color: Colors.text }]}>{history.belligerentNames[0]} vs {history.belligerentNames[1]}</Text>
                          <Text style={[styles.agreementStatus, { color: Colors.textMuted }]}>CONCLUDED</Text>
                        </View>
                        <Text style={[styles.agreementDetail, { marginTop: 6 }]}>{history.outcome} · {elapsedDays} day{elapsedDays === 1 ? "" : "s"} · Final stage: {STAGE_LABEL[history.finalStage]}</Text>
                        <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                          <Text style={styles.agreementDetail}>Casualties: {history.casualties.a.toLocaleString()} / {history.casualties.b.toLocaleString()}</Text>
                          <Text style={styles.agreementDetail}>Infra: {history.infrastructureDamage.a} / {history.infrastructureDamage.b}</Text>
                        </View>
                        <Text style={[styles.agreementDetail, { marginTop: 6, color: Colors.textSecondary }]}>
                          Stages: {history.stages.map((stage) => STAGE_LABEL[stage.stage]).join(" → ")}
                        </Text>
                        {history.reports.map((report) => (
                          <Text key={`${history.id}-${report.tick}-${report.label}`} style={[styles.agreementDetail, { marginTop: 3, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: Colors.border }]}>
                            T{report.tick}: {report.label}
                          </Text>
                        ))}
                      </View>
                    );
                  })}
                </>
              )}
            </>
          );
        })()}

        {activeTab === "relations" && (() => {
          const relations = adv.factionRelations;
          const entityNames: Record<string, string> = {};
          for (const f of factions) entityNames[f.id] = f.name;
          for (const m of megacities) entityNames[m.id] = m.name;
          const REL_COLOR = (d: number) => d >= 70 ? Colors.accent : d >= 50 ? Colors.info : d >= 35 ? Colors.warning : Colors.danger;
          const TREND_ICON = (t: string) => t === "improving" ? "trending-up" : t === "deteriorating" ? "trending-down" : "minus";
          return (
            <>
              <Text style={styles.sectionTitle}>FACTION-TO-FACTION RELATIONS ({relations.length})</Text>
              <Text style={styles.emptyText}>How factions feel about each other — independent of their relationship with you. Relations drift over time and generate autonomous events.</Text>
              {relations.length === 0 && <Text style={styles.emptyText}>No faction relations tracked yet. Relations will initialize automatically.</Text>}
              {relations.map((rel, i) => {
                const nameA = entityNames[rel.factionA] ?? rel.factionA;
                const nameB = entityNames[rel.factionB] ?? rel.factionB;
                const color = REL_COLOR(rel.disposition);
                return (
                  <View key={i} style={[styles.agreementCard, { borderColor: color + "40" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={[styles.actionName, { flex: 1, fontSize: 11 }]}>{nameA}</Text>
                      <View style={{ alignItems: "center", paddingHorizontal: 8 }}>
                        <Text style={[styles.statBarValue, { color, fontSize: 16 }]}>{Math.round(rel.disposition)}</Text>
                        <Feather name={TREND_ICON(rel.trend) as any} size={12} color={rel.trend === "improving" ? Colors.accent : rel.trend === "deteriorating" ? Colors.danger : Colors.textMuted} />
                      </View>
                      <Text style={[styles.actionName, { flex: 1, fontSize: 11, textAlign: "right" }]}>{nameB}</Text>
                    </View>
                    <View style={[styles.statBarTrack, { marginTop: 6 }]}>
                      <View style={[styles.statBarFill, { width: `${Math.min(100, rel.disposition)}%`, backgroundColor: color }]} />
                    </View>
                    {rel.events.length > 0 && (
                      <Text style={[styles.agreementDetail, { marginTop: 6, fontStyle: "italic" }]}>Latest: {rel.events[rel.events.length - 1]}</Text>
                    )}
                  </View>
                );
              })}
            </>
          );
        })()}

        {activeTab === "recon" && (
          <>
            <Text style={styles.sectionTitle}>AUTOMATED RECONNAISSANCE</Text>
            <View style={styles.reconCard}>
              <View style={styles.reconHeader}>
                <Feather name="radio" size={16} color={Colors.accent} />
                <Text style={styles.reconTitle}>AUTO RECON SWEEP</Text>
              </View>
              <Text style={styles.reconDesc}>
                Continuously scan the wasteland for undiscovered settlements, megacities, and points of interest. Sweeps occur every 24 ticks.
              </Text>
              <View style={styles.reconCostRow}>
                <Text style={styles.reconCostLabel}>Cost per sweep:</Text>
                <Text style={styles.reconCostValue}>{state.intelligence?.autoReconCostPerTick ?? 500} CR</Text>
              </View>
              <View style={styles.reconCostRow}>
                <Text style={styles.reconCostLabel}>Discovery chance:</Text>
                <Text style={styles.reconCostValue}>35% per sweep</Text>
              </View>

              {(() => {
                const undiscoveredTownships = (state.townships ?? []).filter(t => t.status === "undiscovered").length;
                const inactiveMegacities = (state.externalMegacities ?? []).filter(m => !m.isActive).length;
                const totalUndiscovered = undiscoveredTownships + inactiveMegacities;
                return (
                  <View style={styles.reconStatsRow}>
                    <View style={styles.reconStatBox}>
                      <Text style={styles.reconStatValue}>{undiscoveredTownships}</Text>
                      <Text style={styles.reconStatLabel}>HIDDEN TOWNSHIPS</Text>
                    </View>
                    <View style={styles.reconStatBox}>
                      <Text style={styles.reconStatValue}>{inactiveMegacities}</Text>
                      <Text style={styles.reconStatLabel}>UNKNOWN MEGACITIES</Text>
                    </View>
                    <View style={styles.reconStatBox}>
                      <Text style={[styles.reconStatValue, { color: totalUndiscovered > 0 ? Colors.warning : Colors.accent }]}>{totalUndiscovered}</Text>
                      <Text style={styles.reconStatLabel}>TOTAL TARGETS</Text>
                    </View>
                  </View>
                );
              })()}

              <Pressable
                onPress={() => {
                  setState((prev) => {
                    const intel = prev.intelligence ?? { assets: [], operations: [], securityLevel: 0, counterIntelRating: 0, totalOpsCompleted: 0, totalOpsFailed: 0, rumors: [], interceptedComms: [] };
                    return {
                      ...prev,
                      intelligence: {
                        ...intel,
                        autoRecon: !intel.autoRecon,
                        autoReconCostPerTick: intel.autoReconCostPerTick ?? 500,
                      },
                    };
                  });
                }}
                style={[styles.reconToggle, state.intelligence?.autoRecon && styles.reconToggleActive]}
              >
                <Feather name={state.intelligence?.autoRecon ? "pause-circle" : "play-circle"} size={16} color={state.intelligence?.autoRecon ? Colors.bg : Colors.accent} />
                <Text style={[styles.reconToggleText, state.intelligence?.autoRecon && styles.reconToggleTextActive]}>
                  {state.intelligence?.autoRecon ? "DEACTIVATE AUTO RECON" : "ACTIVATE AUTO RECON"}
                </Text>
              </Pressable>

              {state.intelligence?.autoRecon && (
                <View style={styles.reconActiveIndicator}>
                  <View style={styles.reconPulse} />
                  <Text style={styles.reconActiveText}>SCANNING... Sweeps every 24 ticks (1 game day)</Text>
                </View>
              )}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>DISCOVERED ENTITIES</Text>
            <View style={styles.reconStatsRow}>
              <View style={styles.reconStatBox}>
                <Text style={styles.reconStatValue}>{state.factions.length}</Text>
                <Text style={styles.reconStatLabel}>FACTIONS</Text>
              </View>
              <View style={styles.reconStatBox}>
                <Text style={styles.reconStatValue}>{(state.externalMegacities ?? []).filter(m => m.isActive).length}</Text>
                <Text style={styles.reconStatLabel}>MEGACITIES</Text>
              </View>
              <View style={styles.reconStatBox}>
                <Text style={styles.reconStatValue}>{(state.townships ?? []).filter(t => t.status !== "undiscovered").length}</Text>
                <Text style={styles.reconStatLabel}>TOWNSHIPS</Text>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      <ContextMenu visible={ctx.visible} position={ctx.position} items={FACTION_CTX_ITEMS} onSelect={onFactionCtxAction} onDismiss={closeCtx} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Platform.OS === "web" ? 12 : 16,
    paddingVertical: Platform.OS === "web" ? 8 : 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 2,
  },
  headerSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  tabContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabScroller: {
    flexGrow: 0,
    minHeight: Platform.OS === "web" ? 40 : 52,
  },
  tabRow: {
    flexDirection: "row",
    flexGrow: 1,
    minHeight: Platform.OS === "web" ? 40 : 52,
  },
  tabRowFirst: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flexGrow: 1,
    minWidth: 120,
    minHeight: Platform.OS === "web" ? 40 : 52,
    paddingVertical: Platform.OS === "web" ? 6 : 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 1,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },
  sectionTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: Platform.OS === "web" ? 8 : 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 12,
    lineHeight: 16,
  },
  factionCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: Platform.OS === "web" ? 10 : 14,
    marginBottom: 8,
  },
  factionCardInactive: { opacity: 0.5 },
  factionHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  factionName: { fontFamily: "Inter_700Bold", fontSize: 14 },
  factionType: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 1, marginTop: 2 },
  factionStats: { alignItems: "flex-end", flexShrink: 0 },
  miniStat: { fontFamily: "Inter_700Bold", fontSize: 10 },
  factionDesc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 8, lineHeight: 16 },
  factionDetailName: { fontFamily: "Inter_700Bold", fontSize: 18 },
  backToList: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backToListText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1 },
  factionDetail: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  statsGrid: { marginTop: 12, gap: 8 },
  statBar: { gap: 4 },
  statBarHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 4 },
  statBarLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 1 },
  statBarValue: { fontFamily: "Inter_700Bold", fontSize: 11 },
  statBarTrack: { height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  statBarFill: { height: 4, borderRadius: 2 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  catChipActive: { borderColor: Colors.accent, backgroundColor: "rgba(0,255,65,0.08)" },
  catText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8 },
  catTextActive: { color: Colors.accent },
  actionCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    marginBottom: 8,
  },
  actionCardDisabled: { opacity: 0.5 },
  actionHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 6 },
  actionName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12 },
  actionDesc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2, lineHeight: 15 },
  actionFooter: { flexDirection: "row", gap: 12, marginTop: 8 },
  actionCost: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 10 },
  actionReq: { fontFamily: "Inter_700Bold", fontSize: 10 },
  inventoryRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  inventoryLabel: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 1, marginBottom: 4 },
  inventoryItems: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 16 },
  agreementCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  agreementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  agreementTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    flex: 1,
  },
  agreementStatus: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
  },
  agreementBody: {
    marginTop: 8,
    gap: 4,
  },
  agreementDetail: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 15,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    marginTop: 8,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  cancelBtn: {
    marginTop: 8,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 4,
  },
  cancelBtnText: {
    color: Colors.danger,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
  },
  reconCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 12,
  },
  reconHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  reconTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.accent,
    letterSpacing: 1,
  },
  reconDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginBottom: 10,
  },
  reconCostRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  reconCostLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
  },
  reconCostValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: Colors.warning,
  },
  reconStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    marginBottom: 10,
  },
  reconStatBox: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 8,
    alignItems: "center",
  },
  reconStatValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.accent,
  },
  reconStatLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 7,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: "center",
  },
  reconToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 4,
    backgroundColor: Colors.accent + "15",
  },
  reconToggleActive: {
    backgroundColor: Colors.accent,
  },
  reconToggleText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.accent,
    letterSpacing: 1,
  },
  reconToggleTextActive: {
    color: Colors.bg,
  },
  reconActiveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Colors.accent + "10",
    borderRadius: 4,
  },
  reconPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  reconActiveText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.accent,
  },
}));

export default withScreenBoundary(DiplomacyScreen, "diplomacy");

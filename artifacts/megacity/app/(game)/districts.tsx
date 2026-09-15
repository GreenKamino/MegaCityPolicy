import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  FlatList,
  Modal,
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
import TutorialHint from "@/components/TutorialHint";
import { useHotkeys } from "@/context/HotkeyContext";
import SearchBar from "@/components/SearchBar";
import SectionHeader from "@/components/SectionHeader";
import StatBar from "@/components/StatBar";
import { useGameState, useGameActions } from "@/context/GameContext";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameModal } from "@/hooks/useGameModal";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { DISTRICT_CATEGORIES, DISTRICT_CATEGORY_LABELS, getDistrictCategory } from "@/engine/districts";
import {
  evaluatePersonalAction,
  formatPersonalActionSubtitle,
  getDistrictUnderworldHeat,
  PERSONAL_DISTRICT_ACTION_ORDER,
  PERSONAL_ACTIONS,
  formatEffectDeltas,
  type PersonalActionId,
  personalCooldownKey,
} from "@/engine/interactionMenu";
import InteractionMenu, { type InteractionMenuGroup } from "@/components/InteractionMenu";
import { listDistrictTraitContributions } from "@/engine/namedCharacters";
import { getTraitVisual, getTraitDescription } from "@/engine/traitIcons";
import type { District, DistrictCommandHistoryEntry, ExternalMegacity, GameState } from "@/engine/types";
import { formatGameDate } from "@/engine/personalJournal";
import AdministrativeBlocPanel from "@/components/AdministrativeBlocPanel";

type HeatFilter = "all" | "watched" | "burning";

const HEAT_FILTERS: { key: HeatFilter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "watched", label: "WATCHED" },
  { key: "burning", label: "BURNING" },
];


const TERRAIN: Record<string, { bg: string; border: string; label: string; icon: string }> = {
  admin:      { bg: "#0F2818", border: "#1A5030", label: "HQ",   icon: "⌘" },
  commercial: { bg: "#1A1C0A", border: "#3A3C1A", label: "MKT",  icon: "¤" },
  research:   { bg: "#0A1220", border: "#1A2840", label: "R&D",  icon: "◈" },
  security:   { bg: "#14141C", border: "#2A2A3A", label: "SEC",  icon: "◆" },
  medical:    { bg: "#0A1818", border: "#1A3030", label: "MED",  icon: "+" },
  industrial: { bg: "#181008", border: "#382818", label: "IND",  icon: "▣" },
  energy:     { bg: "#080E1C", border: "#101C38", label: "PWR",  icon: "⚡" },
  housing:    { bg: "#121410", border: "#242A20", label: "HAB",  icon: "▪" },
  transport:  { bg: "#100A18", border: "#201438", label: "TRN",  icon: "═" },
  water:      { bg: "#081418", border: "#102830", label: "H₂O",  icon: "~" },
  slums:      { bg: "#180808", border: "#381010", label: "SLM",  icon: "▓" },
  frontier:   { bg: "#141008", border: "#2A2010", label: "FRN",  icon: "△" },
  unclaimed:  { bg: "#0C0C0C", border: "#1A1A1A", label: "UNC",  icon: "·" },
  wasteland:  { bg: "#080804", border: "#121208", label: "WST",  icon: "░" },
  empty:      { bg: "#050505", border: "#0A0A0A", label: "",     icon: "" },
};


type CellInfo = { row: number; col: number; dist: number; angle: number };








// Direction-aware multiplier formatting — mirrors factions / overview
// so the district "Influenced By" panel speaks with one voice. (#53)
function formatDistrictMultDelta(mult: number): string {
  const pct = Math.round((mult - 1) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
function describeDistrictAxis(axis: "crime" | "unrest" | "gang", mult: number): string {
  if (axis === "crime") return mult > 1 ? "crime push" : "crime drag";
  if (axis === "unrest") return mult > 1 ? "unrest surge" : "unrest cooling";
  return mult > 1 ? "gang pull" : "gang drag";
}

function UnderworldHeatBadge({
  district,
  compact = false,
}: {
  district: Pick<District, "crime" | "gangInfluence">;
  compact?: boolean;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const heat = getDistrictUnderworldHeat(district);
  const color =
    heat.band === "burning"
      ? Colors.danger
      : heat.band === "watched"
        ? Colors.warning
        : Colors.accent;
  const details = `Derived from crime ${Math.round(district.crime)} · gang influence ${Math.round(district.gangInfluence)}`;

  return (
    <View
      style={[
        styles.underworldHeatBadge,
        compact && styles.underworldHeatBadgeCompact,
        { borderColor: color + "66", backgroundColor: color + "12" },
      ]}
      accessibilityLabel={`Underworld heat: ${heat.label}. ${details}.`}
    >
      <MaterialCommunityIcons name="thermometer" size={compact ? 11 : 13} color={color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.underworldHeatText, { color }]}>
          {compact ? `UNDERWORLD ${heat.label.toUpperCase()}` : `UNDERWORLD HEAT · ${heat.label.toUpperCase()}`}
        </Text>
        {!compact && (
          <Text style={styles.underworldHeatDetail}>
            {details}
          </Text>
        )}
      </View>
    </View>
  );
}

function DistrictDetailModal({ district, state, visible, onClose, onAction }: { district: District | null; state: GameState; visible: boolean; onClose: () => void; onAction: (optionId: PersonalActionId) => void }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const districtActionGroups = useMemo<InteractionMenuGroup[]>(() => {
    if (!district) return [];
    return [{
      key: "district-commands",
      label: "DISTRICT COMMANDS",
      options: PERSONAL_DISTRICT_ACTION_ORDER.map((id) => {
        const def = PERSONAL_ACTIONS[id];
        const target = { kind: "district" as const, id: district.id };
        const eligibility = evaluatePersonalAction(id, Math.floor(state.resources.credits), {
          target,
          cooldowns: state.personalActionCooldowns,
          history: state.personalActionHistory,
          totalTicks: state.totalTicks,
            state,
        });
        const preview = formatPersonalActionSubtitle("district", id, {
          target,
          history: state.personalActionHistory,
          totalTicks: state.totalTicks,
        });
        return {
          id,
          label: def.label,
          subtitle: [preview, `${def.cooldownTicks}T COOLDOWN`].filter(Boolean).join(" | "),
          variant: def.variant,
          eligible: eligibility.eligible,
          reason: eligibility.reason,
        };
      })
    }];
  }, [district, state.resources.credits, state.personalActionCooldowns, state.personalActionHistory, state.totalTicks]);
  if (!district) return null;
  const crimeColor = district.crime > 60 ? Colors.danger : district.crime > 30 ? Colors.warning : Colors.accent;
  const wealthColor = district.wealth > 60 ? Colors.accent : district.wealth > 30 ? Colors.warning : Colors.danger;
  const zone = getDistrictCategory(district.id);
  const terrain = TERRAIN[zone] ?? TERRAIN.empty;
  // task #53 — list named-figure trait contributions shaping this district.
  const traitContributions = listDistrictTraitContributions(state, district.id);
  const commandHistory = (state.districtCommandHistory ?? [])
    .filter((entry) => entry.districtId === district.id)
    .slice(-8)
    .reverse();

  const renderCommandHistoryEntry = (entry: DistrictCommandHistoryEntry) => {
    const actionId = entry.actionId as PersonalActionId;
    const definition = PERSONAL_ACTIONS[actionId];
    const cooldownUntilTick = state.personalActionCooldowns?.[
      personalCooldownKey({ kind: "district", id: district.id }, actionId)
    ] ?? entry.cooldownUntilTick;
    const cooldownRemaining = Math.max(0, cooldownUntilTick - state.totalTicks);
    return (
      <View key={entry.id} style={styles.commandHistoryCard}>
        <View style={styles.commandHistoryHeader}>
          <Text style={styles.commandHistoryTitle}>
            {definition?.label ?? entry.actionId}
          </Text>
          <Text style={styles.commandHistoryTick}>TICK {entry.tick}</Text>
        </View>
        <Text style={styles.commandHistoryDate}>{formatGameDate(entry.timestamp)}</Text>
        <Text style={styles.commandHistoryEffects}>
          {formatEffectDeltas(entry.effects) || "No lasting stat change"}
        </Text>
        <Text style={[
          styles.commandHistoryCooldown,
          { color: cooldownRemaining > 0 ? Colors.warning : Colors.accent },
        ]}>
          {cooldownRemaining > 0
            ? `COOLDOWN · ${cooldownRemaining} TICK${cooldownRemaining === 1 ? "" : "S"}`
            : "READY FOR ANOTHER INTERVENTION"}
        </Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.detailOverlay}>
        <View style={styles.detailModal}>
          <View style={styles.detailModalHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ backgroundColor: terrain.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 }}>
                  <Text style={{ color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>
                    {DISTRICT_CATEGORY_LABELS[zone] ?? zone.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.detailModalTitle}>{district.name}</Text>
              <Text style={styles.detailModalSub}>{district.subtitle}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close district details">
              <Feather name="x" size={20} color={Colors.accent} />
            </Pressable>
          </View>

          <ScrollView style={styles.detailScroll} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.detailStatsRow}>
              <View style={styles.detailStatBox}>
                <Text style={[styles.detailStatValue, { color: Colors.text }]}>{(district.population / 1000).toFixed(0)}k</Text>
                <Text style={styles.detailStatLabel}>POP</Text>
              </View>
              <View style={styles.detailStatBox}>
                <Text style={[styles.detailStatValue, { color: crimeColor }]}>{Math.round(district.crime)}</Text>
                <Text style={styles.detailStatLabel}>CRIME</Text>
              </View>
              <View style={styles.detailStatBox}>
                <Text style={[styles.detailStatValue, { color: district.unrest > 60 ? Colors.danger : Colors.accent }]}>{Math.round(district.unrest)}</Text>
                <Text style={styles.detailStatLabel}>UNREST</Text>
              </View>
              <View style={styles.detailStatBox}>
                <Text style={[styles.detailStatValue, { color: wealthColor }]}>{Math.round(district.wealth)}</Text>
                <Text style={styles.detailStatLabel}>WEALTH</Text>
              </View>
            </View>
            <UnderworldHeatBadge district={district} />

            <StatBar label="Loyalty" value={district.loyalty} compact />
            <StatBar label="Gang Influence" value={district.gangInfluence} invertColor compact />
            <StatBar label="Infrastructure" value={district.infraQuality} compact />
            <StatBar label="Defense Rating" value={district.defenseRating} compact />
            <StatBar label="Mutation Rate" value={district.mutationRate} invertColor compact />
            <StatBar label="Industrial Output" value={district.industrialOutput} compact />
            <StatBar label="Ecology" value={district.ecology} compact />

            {district.gangInfluence > 60 && (
              <View style={styles.alert}>
                <Text style={[styles.alertText, { color: Colors.danger }]}>
                  ALERT: Gang influence critical — sector stability at risk
                </Text>
              </View>
            )}
            {district.crime > 70 && (
              <View style={styles.alert}>
                <Text style={[styles.alertText, { color: Colors.danger }]}>
                  ALERT: Crime index extreme — dispatch reinforcements
                </Text>
              </View>
            )}
            {district.unrest > 70 && (
              <View style={styles.alert}>
                <Text style={[styles.alertText, { color: Colors.warning }]}>
                  WARNING: Unrest approaching riot threshold
                </Text>
              </View>
            )}
            {district.infraQuality < 35 && (
              <View style={styles.alert}>
                <Text style={[styles.alertText, { color: Colors.warning }]}>
                  WARNING: Infrastructure deteriorating rapidly
                </Text>
              </View>
            )}

            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 12 }}>
              <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 4 }}>
                Deploy direct authority to shape this ward. Operations here use dedicated sector cooldowns.
              </Text>
              <InteractionMenu
                groups={districtActionGroups}
                onSelect={(id) => {
                  const actionId = id as PersonalActionId;
                  if (PERSONAL_DISTRICT_ACTION_ORDER.includes(actionId)) onAction(actionId);
                }}
              />
            </View>

            <View style={styles.commandHistorySection}>
              <View style={styles.commandHistorySectionHeader}>
                <Text style={styles.commandHistorySectionTitle}>RECENT REGIME COMMANDS</Text>
                <Text style={styles.commandHistorySectionCount}>{commandHistory.length}/8</Text>
              </View>
              {commandHistory.length > 0 ? (
                commandHistory.map(renderCommandHistoryEntry)
              ) : (
                <Text style={styles.commandHistoryEmpty}>
                  No direct commands have been recorded for this ward.
                </Text>
              )}
            </View>

            {/* task #53 — show which named figures are bending this district */}
            {traitContributions.length > 0 && (
              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.2, marginBottom: 6 }}>
                  INFLUENCED BY
                </Text>
                {traitContributions.map((c, i) => {
                  const v = getTraitVisual(c.trait);
                  const tint = (Colors as any)[v.color] ?? Colors.accent;
                  const phrases: string[] = [];
                  if (c.crimeMult !== undefined && c.crimeMult !== 1) {
                    phrases.push(`${formatDistrictMultDelta(c.crimeMult)} ${describeDistrictAxis("crime", c.crimeMult)}`);
                  }
                  if (c.unrestMult !== undefined && c.unrestMult !== 1) {
                    phrases.push(`${formatDistrictMultDelta(c.unrestMult)} ${describeDistrictAxis("unrest", c.unrestMult)}`);
                  }
                  if (c.gangInfluenceMult !== undefined && c.gangInfluenceMult !== 1) {
                    phrases.push(`${formatDistrictMultDelta(c.gangInfluenceMult)} ${describeDistrictAxis("gang", c.gangInfluenceMult)}`);
                  }
                  // Adverse for the player when any axis is being pushed up.
                  const adverse =
                    (c.crimeMult ?? 1) > 1 ||
                    (c.unrestMult ?? 1) > 1 ||
                    (c.gangInfluenceMult ?? 1) > 1;
                  const valueColor = adverse ? Colors.warning : Colors.accent;
                  return (
                    <View
                      key={`${c.characterId}-${c.trait}-${i}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}
                    >
                      <View
                        style={{
                          flexDirection: "row", alignItems: "center", gap: 3,
                          paddingHorizontal: 6, paddingVertical: 2,
                          borderWidth: 1, borderRadius: 3,
                          borderColor: tint + "55", backgroundColor: tint + "12",
                        }}
                        accessibilityLabel={`${c.trait}: ${getTraitDescription(c.trait)}`}
                      >
                        <MaterialCommunityIcons name={v.icon} size={10} color={tint} />
                        <Text style={{ color: tint, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.4 }}>
                          {c.trait}
                        </Text>
                      </View>
                      <Text style={{ color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 11, flex: 1 }} numberOfLines={1}>
                        {c.characterName}
                      </Text>
                      <Text style={{ color: valueColor, fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.3, textAlign: "right" }} numberOfLines={2}>
                        {phrases.join(", ")}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const DistrictCard = React.memo(function DistrictCard({ district, expanded, onPress, onOpenDetails, onContextMenu, recentActivity, recentActivityTicks }: { district: District; expanded: boolean; onPress: () => void; onOpenDetails?: () => void; onContextMenu?: (id: string, e: any) => void; recentActivity?: boolean; recentActivityTicks?: number }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const wealthColor = district.wealth > 60 ? Colors.accent : district.wealth > 30 ? Colors.warning : Colors.danger;
  const crimeColor = district.crime > 60 ? Colors.danger : district.crime > 30 ? Colors.warning : Colors.accent;

  return (
    <Pressable
      testID={`district-card-${district.id}`}
      onPress={onPress}
      style={[styles.card, expanded && styles.cardExpanded, Platform.OS === "web" && { cursor: "pointer" as any }]}
      {...(Platform.OS === "web" ? { onContextMenu: (e: any) => onContextMenu?.(district.id, e) } : {})}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <View style={[styles.statusDot, { backgroundColor: crimeColor }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.cardName} numberOfLines={1}>{district.name}</Text>
              {recentActivity && (
                <View style={styles.recentActivityBadge}>
                  <Feather name="activity" size={8} color={Colors.warning} />
                  <Text style={styles.recentActivityText}>
                    {recentActivityTicks === 0 ? "ACTIVE NOW" : `${recentActivityTicks}t AGO`}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.cardSubtitle}>{district.subtitle}</Text>
             <UnderworldHeatBadge district={district} compact />
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.popText}>{(district.population / 1000).toFixed(0)}k</Text>
          <Text style={styles.popLabel}>POP</Text>
        </View>
      </View>

      <View style={styles.quickStats}>
        <QuickStat label="CRIME" value={district.crime} color={crimeColor} />
        <QuickStat label="UNREST" value={district.unrest} color={district.unrest > 60 ? Colors.danger : district.unrest > 35 ? Colors.warning : Colors.accent} />
        <QuickStat label="LOYALTY" value={district.loyalty} color={district.loyalty > 60 ? Colors.accent : district.loyalty > 30 ? Colors.warning : Colors.danger} />
        <QuickStat label="WEALTH" value={district.wealth} color={wealthColor} />
      </View>

      {expanded && (
        <View style={styles.detail}>
          <View style={styles.detailDivider} />
          <StatBar label="Gang Influence" value={district.gangInfluence} invertColor compact />
          <StatBar label="Infrastructure" value={district.infraQuality} compact />
          <StatBar label="Defense Rating" value={district.defenseRating} compact />
          <StatBar label="Mutation Rate" value={district.mutationRate} invertColor compact />
          <StatBar label="Industrial Output" value={district.industrialOutput} compact />
          <StatBar label="Ecology" value={district.ecology} compact />

          {district.gangInfluence > 60 && (
            <View style={styles.alert}>
              <Text style={[styles.alertText, { color: Colors.danger }]}>
                ALERT: Gang influence critical — sector stability at risk
              </Text>
            </View>
          )}
          {district.crime > 70 && (
            <View style={styles.alert}>
              <Text style={[styles.alertText, { color: Colors.danger }]}>
                ALERT: Crime index extreme — dispatch reinforcements
              </Text>
            </View>
          )}
          {district.unrest > 70 && (
            <View style={styles.alert}>
              <Text style={[styles.alertText, { color: Colors.warning }]}>
                WARNING: Unrest approaching riot threshold
              </Text>
            </View>
          )}
          {district.infraQuality < 35 && (
            <View style={styles.alert}>
              <Text style={[styles.alertText, { color: Colors.warning }]}>
                WARNING: Infrastructure deteriorating rapidly
              </Text>
            </View>
          )}
          {onOpenDetails && (
            <Pressable
              onPress={onOpenDetails}
              accessibilityRole="button"
              accessibilityLabel={`Open district commands for ${district.name}`}
              style={styles.openDetailsButton}
            >
              <Feather name="crosshair" size={12} color={Colors.accent} />
              <Text style={styles.openDetailsText}>OPEN DISTRICT COMMANDS</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
});

const QuickStat = React.memo(function QuickStat({ label, value, color }: { label: string; value: number; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.qStat}>
      <Text style={[styles.qValue, { color }]}>{Math.round(value)}</Text>
      <Text style={styles.qLabel}>{label}</Text>
    </View>
  );
});

const SummaryBox = React.memo(function SummaryBox({ label, value, color }: { label: string; value: number; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.summaryBox}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
});


type WorldTerrain = "ocean" | "deep_ocean" | "coast" | "plains" | "forest" | "dense_forest" | "mountain" | "peak" | "desert" | "tundra" | "swamp" | "river" | "volcanic" | "ruins" | "radiation" | "wasteland_world";


type WorldCity = {
  id: string;
  name: string;
  row: number;
  col: number;
  color: string;
  isPlayer: boolean;
  discovered: boolean;
};






type BatchAction = {
  id: string;
  label: string;
  icon: string;
  cost: number;
  description: string;
};

const CTX_ITEMS: { label: string; action: string; danger?: boolean }[] = [
  { label: "Toggle Details", action: "toggle" },
  { label: "Go to Construction", action: "construction" },
];

const BATCH_ACTIONS: BatchAction[] = [
  { id: "boost_loyalty", label: "BOOST LOYALTY", icon: "heart", cost: 5000, description: "Deploy propaganda teams to increase loyalty in selected districts (+8 loyalty each)" },
  { id: "deploy_enforcers", label: "DEPLOY ENFORCERS", icon: "shield", cost: 8000, description: "Send enforcer squads to reduce crime in selected districts (-12 crime, +5 defense each)" },
  { id: "emergency_repair", label: "EMERGENCY REPAIR", icon: "tool", cost: 10000, description: "Rush infrastructure repair crews to selected districts (+15 infra each)" },
  { id: "suppress_unrest", label: "SUPPRESS UNREST", icon: "slash", cost: 6000, description: "Crack down on dissent in selected districts (-10 unrest, -3 loyalty each)" },
  { id: "economic_stimulus", label: "ECONOMIC STIMULUS", icon: "trending-up", cost: 12000, description: "Inject credits into local economies of selected districts (+10 wealth each)" },
];

function DistrictsScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { registerSubTabs, unregisterSubTabs } = useHotkeys();
  const { state } = useGameState();
  const { setState, performPersonalInteraction } = useGameActions();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const [tab, setTab] = useState<"map" | "list">("list");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const selectedDistrict = useMemo(() => state.districts.find(d => d.id === selectedDistrictId) ?? null, [state.districts, selectedDistrictId]);
  const [sortBy, setSortBy] = useState<"name" | "population" | "crime" | "unrest" | "wealth" | "loyalty" | "heat">("name");
  const [sortDesc, setSortDesc] = useState(true);
  const [heatFilter, setHeatFilter] = useState<HeatFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { modal, showModal, hideModal } = useGameModal();
  const filterScrollRef = useHorizontalWheelScroll();
  const heatScrollRef = useHorizontalWheelScroll();
  const batchScrollRef = useHorizontalWheelScroll();

  const toggle = (id: string) => setExpanded(expanded === id ? null : id);

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
    if (action === "toggle") {
      setExpanded((prev) => (prev === id ? null : id));
    } else if (action === "construction") {
      router.push("/(game)/construction");
    }
  }, [ctx.id, router]);

  useEffect(() => {
    registerSubTabs({
      prev: () => setTab((t) => (t === "list" ? "map" : "list")),
      next: () => setTab((t) => (t === "list" ? "map" : "list")),
    });
    return () => unregisterSubTabs();
  }, [registerSubTabs, unregisterSubTabs]);

  const cycleSort = (key: typeof sortBy) => {
    if (sortBy === key) setSortDesc(!sortDesc);
    else { setSortBy(key); setSortDesc(key !== "name"); }
  };

  const lastEventTickByDistrict = useMemo(() => {
    const map: Record<string, number> = {};
    const history = state.eventHistory ?? [];
    for (let i = history.length - 1; i >= 0 && i >= history.length - 80; i--) {
      const ev = history[i];
      const dId = ev?.effects?.districtId;
      if (dId && map[dId] === undefined) {
        map[dId] = ev.timestamp;
      }
    }
    return map;
  }, [state.eventHistory]);

  const districtsByCategory = useMemo(() => {
    const map: Record<string, District[]> = {};
    for (const d of state.districts) {
      const cat = getDistrictCategory(d.id);
      if (!map[cat]) map[cat] = [];
      map[cat].push(d);
    }
    return map;
  }, [state.districts]);




  const filteredDistricts = useMemo(() => {
    let base = selectedCategory ? (districtsByCategory[selectedCategory] ?? []) : state.districts;
    if (heatFilter !== "all") {
      base = base.filter((d) => getDistrictUnderworldHeat(d).band === heatFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter((d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
    }
    const sorted = [...base].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "population") cmp = a.population - b.population;
      else if (sortBy === "crime") cmp = a.crime - b.crime;
      else if (sortBy === "unrest") cmp = a.unrest - b.unrest;
      else if (sortBy === "wealth") cmp = a.wealth - b.wealth;
      else if (sortBy === "loyalty") cmp = a.loyalty - b.loyalty;
      else if (sortBy === "heat") cmp = getDistrictUnderworldHeat(a).score - getDistrictUnderworldHeat(b).score;
      if (cmp === 0) cmp = a.name.localeCompare(b.name);
      return sortDesc ? -cmp : cmp;
    });
    return sorted;
  }, [selectedCategory, state.districts, districtsByCategory, sortBy, sortDesc, heatFilter, searchQuery]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredDistricts.map((d) => d.id)));
  }, [filteredDistricts]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const executeBatchAction = useCallback((action: BatchAction) => {
    const count = selectedIds.size;
    if (count === 0) return;
    const totalCost = action.cost * count;
    if (state.resources.credits < totalCost) {
      showModal("INSUFFICIENT FUNDS", `${action.label} on ${count} districts costs ${totalCost.toLocaleString()} cr.\nYou have: ${state.resources.credits.toLocaleString()} cr`, [
        { text: "OK", style: "cancel" },
      ]);
      return;
    }
    showModal(
      `${action.label} — ${count} DISTRICTS`,
      `${action.description}\n\nTotal cost: ${totalCost.toLocaleString()} credits`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "EXECUTE",
          onPress: () => {
            setState((prev) => {
              const updated = { ...prev, resources: { ...prev.resources, credits: prev.resources.credits - totalCost } };
              updated.districts = prev.districts.map((d) => {
                if (!selectedIds.has(d.id)) return d;
                const dd = { ...d };
                switch (action.id) {
                  case "boost_loyalty": dd.loyalty = Math.min(100, dd.loyalty + 8); break;
                  case "deploy_enforcers": dd.crime = Math.max(0, dd.crime - 12); dd.defenseRating = Math.min(100, dd.defenseRating + 5); break;
                  case "emergency_repair": dd.infraQuality = Math.min(100, dd.infraQuality + 15); break;
                  case "suppress_unrest": dd.unrest = Math.max(0, dd.unrest - 10); dd.loyalty = Math.max(0, dd.loyalty - 3); break;
                  case "economic_stimulus": dd.wealth = Math.min(100, dd.wealth + 10); break;
                }
                return dd;
              });
              return updated;
            });
            setSelectedIds(new Set());
            setMultiSelect(false);
          },
        },
      ]
    );
  }, [selectedIds, state.resources.credits, setState, showModal]);

  const n = state.districts.length || 1;
  const avgCrime = Math.round(state.districts.reduce((a, d) => a + d.crime, 0) / n);
  const avgUnrest = Math.round(state.districts.reduce((a, d) => a + d.unrest, 0) / n);
  const criticalDistricts = state.districts.filter((d) => d.crime > 60 || d.unrest > 65).length;
  const totalPop = state.districts.reduce((a, d) => a + d.population, 0);



  const districtKeyExtractor = useCallback((d: District) => d.id, []);

  const extraDataKey = `${expanded}-${multiSelect}-${heatFilter}-${sortBy}-${sortDesc}-${Array.from(selectedIds).sort().join(",")}`;

  const renderDistrictItem = useCallback(({ item: d }: { item: District }) => (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      {multiSelect && (
        <Pressable onPress={() => toggleSelect(d.id)} style={styles.checkboxWrap} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIds.has(d.id) }} accessibilityLabel={`Select ${d.name}`}>
          <Feather
            name={selectedIds.has(d.id) ? "check-square" : "square"}
            size={16}
            color={selectedIds.has(d.id) ? Colors.accent : Colors.textMuted}
          />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <DistrictCard
          district={d}
          expanded={!multiSelect && expanded === d.id}
          onPress={() => multiSelect ? toggleSelect(d.id) : toggle(d.id)}
          onOpenDetails={() => setSelectedDistrictId(d.id)}
          onContextMenu={openCtx}
          recentActivity={lastEventTickByDistrict[d.id] !== undefined && state.totalTicks - lastEventTickByDistrict[d.id] < 10}
          recentActivityTicks={lastEventTickByDistrict[d.id] !== undefined ? Math.max(0, state.totalTicks - lastEventTickByDistrict[d.id]) : undefined}
        />
      </View>
    </View>
  ), [multiSelect, selectedIds, expanded, toggle, toggleSelect, openCtx, state.totalTicks, lastEventTickByDistrict]);

  const districtListHeader = useMemo(() => {
    const worstCrime = state.districts.length > 0 ? state.districts.reduce((w, d) => d.crime > w.crime ? d : w, state.districts[0]) : null;
    const worstUnrest = state.districts.length > 0 ? state.districts.reduce((w, d) => d.unrest > w.unrest ? d : w, state.districts[0]) : null;
    const avgLoyalty = Math.round(state.districts.reduce((a, d) => a + d.loyalty, 0) / n);
    const avgWealth = Math.round(state.districts.reduce((a, d) => a + d.wealth, 0) / n);
    return (
      <>
        {!selectedCategory && (
          <>
            <SectionHeader title="Sector Overview" icon={<MaterialCommunityIcons name="map-marker" size={14} color={Colors.accent} />} />
            <View style={styles.summaryRow}>
              <SummaryBox label="TOTAL POP" value={Math.round(totalPop / 1000)} color={Colors.info} />
              <SummaryBox label="AVG CRIME" value={avgCrime} color={avgCrime > 50 ? Colors.danger : Colors.accent} />
              <SummaryBox label="AVG UNREST" value={avgUnrest} color={avgUnrest > 50 ? Colors.warning : Colors.accent} />
              <SummaryBox label="CRITICAL" value={criticalDistricts} color={criticalDistricts > 0 ? Colors.danger : Colors.accent} />
            </View>
            <View style={styles.summaryRow}>
              <SummaryBox label="AVG WEALTH" value={avgWealth} color={avgWealth > 50 ? Colors.accent : Colors.warning} />
              <SummaryBox label="AVG LOYAL" value={avgLoyalty} color={avgLoyalty > 50 ? Colors.accent : Colors.danger} />
              <SummaryBox label="DISTRICTS" value={state.districts.length} color={Colors.textSecondary} />
              <SummaryBox label="CATEGORIES" value={Object.keys(districtsByCategory).length} color={Colors.textSecondary} />
            </View>
            {((worstCrime && worstCrime.crime > 60) || (worstUnrest && worstUnrest.unrest > 60)) && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                {worstCrime && worstCrime.crime > 60 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 }}>
                    <Feather name="alert-triangle" size={10} color={Colors.danger} />
                    <Text style={{ color: Colors.danger, fontFamily: "Inter_600SemiBold", fontSize: 10 }}>
                      WORST CRIME: {worstCrime.name} ({Math.round(worstCrime.crime)})
                    </Text>
                  </View>
                )}
                {worstUnrest && worstUnrest.unrest > 60 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 }}>
                    <Feather name="alert-triangle" size={10} color={Colors.warning} />
                    <Text style={{ color: Colors.warning, fontFamily: "Inter_600SemiBold", fontSize: 10 }}>
                      WORST UNREST: {worstUnrest.name} ({Math.round(worstUnrest.unrest)})
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
        {selectedCategory && filteredDistricts.length > 0 && (() => {
          const fd = filteredDistricts;
          const fn = fd.length || 1;
          const catPop = fd.reduce((a, d) => a + d.population, 0);
          const catCrime = Math.round(fd.reduce((a, d) => a + d.crime, 0) / fn);
          const catUnrest = Math.round(fd.reduce((a, d) => a + d.unrest, 0) / fn);
          const catWealth = Math.round(fd.reduce((a, d) => a + d.wealth, 0) / fn);
          const catLoyalty = Math.round(fd.reduce((a, d) => a + d.loyalty, 0) / fn);
          return (
            <View style={styles.summaryRow}>
              <SummaryBox label="POP" value={Math.round(catPop / 1000)} color={Colors.info} />
              <SummaryBox label="CRIME" value={catCrime} color={catCrime > 50 ? Colors.danger : Colors.accent} />
              <SummaryBox label="UNREST" value={catUnrest} color={catUnrest > 50 ? Colors.warning : Colors.accent} />
              <SummaryBox label="WEALTH" value={catWealth} color={catWealth > 50 ? Colors.accent : Colors.warning} />
              <SummaryBox label="LOYAL" value={catLoyalty} color={catLoyalty > 50 ? Colors.accent : Colors.danger} />
            </View>
          );
        })()}
        <SectionHeader
          title={selectedCategory ? (DISTRICT_CATEGORY_LABELS[selectedCategory] ?? "SECTORS") : "All Sectors"}
          subtitle={`${filteredDistricts.length} district${filteredDistricts.length !== 1 ? "s" : ""} · Tap to expand`}
          icon={<MaterialCommunityIcons name="map-marker-outline" size={14} color={Colors.accent} />}
        />
      </>
    );
  }, [selectedCategory, filteredDistricts, state.districts, n, totalPop, avgCrime, avgUnrest, criticalDistricts, districtsByCategory]);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="map-marker-multiple" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>SECTOR STATUS</Text>
        {tab === "list" && (
          <HoverTooltip text={multiSelect ? "Exit multi-select mode" : "Select multiple districts for batch actions"}>
            <Pressable
              onPress={() => { setMultiSelect(!multiSelect); setSelectedIds(new Set()); }}
              style={[styles.multiSelectBtn, multiSelect && styles.multiSelectBtnActive]}
            >
              <Feather name={multiSelect ? "x" : "check-square"} size={12} color={multiSelect ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.multiSelectText, multiSelect && styles.multiSelectTextActive]}>
                {multiSelect ? "CANCEL" : "SELECT"}
              </Text>
            </Pressable>
          </HoverTooltip>
        )}
        <Text style={styles.headerCount}>{state.districts.length} DISTRICTS</Text>
      </View>

      <View style={styles.tabRow}>
        <HoverTooltip text="View districts on the sector map">
          <Pressable
            onPress={() => setTab("map")}
            style={[styles.tabBtn, tab === "map" && styles.tabBtnActive]}
          >
            <MaterialCommunityIcons name="earth" size={14} color={tab === "map" ? Colors.accent : Colors.textMuted} />
            <Text style={[styles.tabText, tab === "map" && styles.tabTextActive]}>MAP</Text>
          </Pressable>
        </HoverTooltip>
        <HoverTooltip text="Browse districts as a sortable list">
          <Pressable
            onPress={() => setTab("list")}
            style={[styles.tabBtn, tab === "list" && styles.tabBtnActive]}
          >
            <Feather name="list" size={14} color={tab === "list" ? Colors.accent : Colors.textMuted} />
            <Text style={[styles.tabText, tab === "list" && styles.tabTextActive]}>LIST</Text>
          </Pressable>
        </HoverTooltip>
      </View>

      

      {tab === "list" && (
        <>
        <AdministrativeBlocPanel surface="districts" />
        <View style={styles.filterRow}>
          <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.filterContent}>
            <Pressable
              onPress={() => setSelectedCategory(null)}
              style={[styles.filterChip, !selectedCategory && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, !selectedCategory && styles.filterTextActive]}>ALL</Text>
            </Pressable>
            {DISTRICT_CATEGORIES.map((cat) => {
              const count = districtsByCategory[cat]?.length ?? 0;
              if (count === 0) return null;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
                >
                  <Text style={[styles.filterText, selectedCategory === cat && styles.filterTextActive]}>
                    {DISTRICT_CATEGORY_LABELS[cat] ?? cat.toUpperCase()} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        </>
      )}

      {tab === "list" && (
        <View style={styles.heatRow}>
          <ScrollView
            ref={heatScrollRef}
            horizontal
            showsHorizontalScrollIndicator={Platform.OS === "web"}
            contentContainerStyle={styles.heatContent}
          >
            {HEAT_FILTERS.map((option) => {
              const active = heatFilter === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setHeatFilter(option.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Underworld heat filter: ${option.label}`}
                  accessibilityState={{ selected: active }}
                  testID={`district-heat-filter-${option.key}`}
                  style={[styles.heatChip, active && styles.heatChipActive]}
                >
                  <Text style={[styles.heatText, active && styles.heatTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {tab === "list" && multiSelect && (
        <View style={styles.selectBar}>
          <Pressable onPress={selectAll} style={styles.selectBarBtn}>
            <Feather name="check-square" size={11} color={Colors.accent} />
            <Text style={styles.selectBarBtnText}>ALL</Text>
          </Pressable>
          <Pressable onPress={selectNone} style={styles.selectBarBtn}>
            <Feather name="square" size={11} color={Colors.textMuted} />
            <Text style={styles.selectBarBtnText}>NONE</Text>
          </Pressable>
          <Text style={styles.selectBarCount}>{selectedIds.size} SELECTED</Text>
        </View>
      )}

      {tab === "list" && (
        <TutorialHint
          id="districts_intro"
          message="Each district carries its own demographics, crime, and unrest. Zone for industry, residence, or commerce. Neglect a district and it festers; over-invest and the rest of the city resents it."
        />
      )}

      {tab === "list" && <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="SEARCH DISTRICTS..." />}

      {tab === "list" && (
        <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingBottom: 6, gap: 6 }}>
          {([
            { key: "name" as const, label: "NAME" },
            { key: "population" as const, label: "POP" },
            { key: "crime" as const, label: "CRIME" },
            { key: "unrest" as const, label: "UNREST" },
            { key: "wealth" as const, label: "WEALTH" },
            { key: "loyalty" as const, label: "LOYAL" },
            { key: "heat" as const, label: "HEAT" },
          ]).map((s) => (
            <Pressable
              key={s.key}
              onPress={() => cycleSort(s.key)}
              accessibilityRole="button"
              accessibilityLabel={s.key === "heat" ? "Sort districts by underworld heat" : `Sort districts by ${s.label.toLowerCase()}`}
              testID={`district-sort-${s.key}`}
              style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3, backgroundColor: sortBy === s.key ? Colors.accent + "20" : "transparent", borderWidth: 1, borderColor: sortBy === s.key ? Colors.accent + "40" : Colors.border }}
            >
              <Text style={{ color: sortBy === s.key ? Colors.accent : Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 1 }}>
                {s.label}{sortBy === s.key ? (sortDesc ? " ▼" : " ▲") : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {tab === "map" && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={{ paddingVertical: 8, alignItems: "center", justifyContent: "center", flex: 1, minHeight: 400 }}>
            <View style={{ alignItems: "center", paddingHorizontal: 32, gap: 16 }}>
              <MaterialCommunityIcons name="earth" size={64} color={Colors.textMuted + "40"} />
              <View style={{ borderWidth: 1, borderColor: Colors.warning + "40", backgroundColor: Colors.warning + "08", borderRadius: 6, paddingHorizontal: 20, paddingVertical: 12 }}>
                <Text style={{ color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 2, textAlign: "center" }}>
                  UNDER DEVELOPMENT
                </Text>
              </View>
              <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", lineHeight: 18 }}>
                The Sector & World Map module is currently being developed. This feature will combine sector heat maps with global terrain exploration, megacity discovery, and wasteland expansion routes.
              </Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent }} />
                  <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10 }}>SECTOR MAP</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.warning }} />
                  <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10 }}>WORLD MAP</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textMuted }} />
                  <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10 }}>EXPLORATION</Text>
                </View>
              </View>
              <Text style={{ color: Colors.textMuted + "60", fontFamily: "Inter_400Regular", fontSize: 9, textAlign: "center", marginTop: 4 }}>
                DISTRICT MAP OVERVIEW
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {tab === "list" && (
        <FlatList
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          data={filteredDistricts}
          keyExtractor={districtKeyExtractor}
          renderItem={renderDistrictItem}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={5}
          extraData={extraDataKey}
          ListHeaderComponent={districtListHeader}
          ListFooterComponent={<View style={{ height: multiSelect && selectedIds.size > 0 ? 140 : 20 }} />}
        />
      )}

      {multiSelect && selectedIds.size > 0 && (
        <View style={styles.batchBar}>
          <Text style={styles.batchBarTitle}>{selectedIds.size} DISTRICTS SELECTED — BATCH ACTIONS</Text>
          <ScrollView ref={batchScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.batchBarContent}>
            {BATCH_ACTIONS.map((action) => {
              const totalCost = action.cost * selectedIds.size;
              const canAfford = state.resources.credits >= totalCost;
              return (
                <Pressable
                  key={action.id}
                  style={[styles.batchActionBtn, !canAfford && styles.batchActionBtnDisabled]}
                  onPress={() => executeBatchAction(action)}
                >
                  <Feather name={action.icon as any} size={14} color={canAfford ? Colors.accent : Colors.textMuted} />
                  <Text style={[styles.batchActionLabel, !canAfford && { color: Colors.textMuted }]}>{action.label}</Text>
                  <Text style={styles.batchActionCost}>{(totalCost / 1000).toFixed(0)}k cr</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <DistrictDetailModal
        district={selectedDistrict}
        state={state}
        visible={!!selectedDistrictId}
        onClose={() => setSelectedDistrictId(null)}
        onAction={(id) => {
          if (selectedDistrictId) {
            performPersonalInteraction({ kind: "district", id: selectedDistrictId }, id);
          }
        }}
      />
      <ContextMenu visible={ctx.visible} position={ctx.position} items={CTX_ITEMS} onSelect={onCtxAction} onDismiss={closeCtx} />
      <GameModal {...modal} onDismiss={hideModal} />
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
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
    flex: 1,
  },
  headerCount: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
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
  tabBtnActive: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.5,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  heatRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  heatContent: {
    paddingHorizontal: Platform.OS === "web" ? 12 : 16,
    paddingVertical: Platform.OS === "web" ? 5 : 8,
    gap: 6,
    flexGrow: 0,
  },
  heatChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  heatChipActive: {
    borderColor: Colors.accent,
    backgroundColor: "rgba(0,255,65,0.08)",
  },
  heatText: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  heatTextActive: {
    color: Colors.accent,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 6,
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  filterRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  filterChipActive: {
    borderColor: Colors.accent,
    backgroundColor: "rgba(0,255,65,0.08)",
  },
  filterText: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  filterTextActive: {
    color: Colors.accent,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },

  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 8,
    alignItems: "center",
  },
  summaryValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    letterSpacing: 1,
    marginTop: 2,
  },

  gridContainer: {
    backgroundColor: "#050505",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    overflow: "hidden",
  },

  zoneLegendContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  zoneLegendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "center",
  },
  zoneLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  zoneLegendSwatch: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderRadius: 2,
  },
  zoneLegendText: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    letterSpacing: 0.5,
  },

  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
  },
  cardExpanded: {
    borderColor: Colors.borderBright,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  recentActivityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 2,
    backgroundColor: Colors.warning + "22",
    borderWidth: 1,
    borderColor: Colors.warning + "55",
  },
  recentActivityText: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.6,
  },
  cardName: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  cardSubtitle: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  underworldHeatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  underworldHeatBadgeCompact: {
    alignSelf: "flex-start",
    marginHorizontal: 0,
    marginTop: 5,
    marginBottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  underworldHeatText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.7,
  },
  underworldHeatDetail: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  cardRight: {
    alignItems: "flex-end",
  },
  popText: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  popLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 1,
  },
  quickStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  qStat: {
    alignItems: "center",
    flex: 1,
  },
  qValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  qLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  detail: {
    marginTop: 4,
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  alert: {
    backgroundColor: "rgba(255,59,48,0.08)",
    borderRadius: 3,
    padding: 8,
    marginTop: 6,
  },
  alertText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  openDetailsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "0D",
    borderRadius: 4,
    paddingVertical: 9,
    marginTop: 12,
  },
  openDetailsText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },

  detailOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: Platform.OS === "web" ? "flex-start" : "flex-end",
    paddingTop: Platform.OS === "web" ? 12 : 0,
    paddingHorizontal: Platform.OS === "web" ? 12 : 0,
  },
  detailModal: {
    backgroundColor: Colors.bg,
    borderTopWidth: 2,
    borderTopColor: Colors.accent,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 960 : undefined,
    alignSelf: "center",
    maxHeight: Platform.OS === "web" ? "96%" : "90%",
    paddingHorizontal: Platform.OS === "web" ? 14 : 20,
    paddingBottom: Platform.OS === "web" ? 12 : 20,
  },
  detailScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  detailModalHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: Platform.OS === "web" ? 10 : 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Platform.OS === "web" ? 6 : 12,
  },
  detailModalTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 1,
    marginTop: 4,
  },
  detailModalSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  commandHistorySection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  commandHistorySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  commandHistorySectionTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  commandHistorySectionCount: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
  },
  commandHistoryCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 2,
    borderLeftColor: Colors.accentDim,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  commandHistoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  commandHistoryTitle: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
    flex: 1,
  },
  commandHistoryTick: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
  },
  commandHistoryDate: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    marginTop: 2,
  },
  commandHistoryEffects: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 6,
  },
  commandHistoryCooldown: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.5,
    marginTop: 5,
  },
  commandHistoryEmpty: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 15,
    paddingBottom: 8,
  },
  detailStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  detailStatBox: {
    flexGrow: 1,
    flexBasis: "40%",
    minWidth: 104,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    alignItems: "center",
  },
  detailStatValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  detailStatLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
  },
  multiSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  multiSelectBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  multiSelectText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
  },
  multiSelectTextActive: {
    color: Colors.accent,
  },
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Colors.accent + "10",
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent + "30",
  },
  selectBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectBarBtnText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
  },
  selectBarCount: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    marginLeft: "auto",
  },
  checkboxWrap: {
    paddingTop: 14,
    paddingRight: 8,
    paddingLeft: 4,
  },
  batchBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgSecondary,
    borderTopWidth: 2,
    borderTopColor: Colors.accent,
    paddingTop: 8,
    paddingBottom: 20,
  },
  batchBarTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  batchBarContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  batchActionBtn: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    gap: 4,
    minWidth: 100,
  },
  batchActionBtnDisabled: {
    borderColor: Colors.border,
    opacity: 0.5,
  },
  batchActionLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
    textAlign: "center",
  },
  batchActionCost: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
  },
}));

export default withScreenBoundary(DistrictsScreen, "districts");

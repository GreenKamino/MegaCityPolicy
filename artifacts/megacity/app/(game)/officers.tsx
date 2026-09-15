import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import GameModal from "@/components/GameModal";
import TutorialHint from "@/components/TutorialHint";
import { useGame } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import { playHaptic } from "@/engine/haptics";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { useGameModal } from "@/hooks/useGameModal";
import {
  formatOutfitSummary,
  getOfficerOutfit,
  setOfficerOutfit,
  SIDEARM_VARIANTS,
  UNIFORM_VARIANTS,
  type SidearmId,
  type UniformId,
} from "@/engine/wardrobe";
import {
  APPOINTMENT_METHODS,
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  RANK_LABELS,
  RANK_ORDER,
  TRAIT_MAP,
} from "@/engine/officers";
import { getOfficerBriefing, type OfficerBriefing, type CommandChoice } from "@/engine/commandDialogue";
import {
  OFFICER_ACTION_RULES,
  OFFICER_ACTION_META,
  OFFICER_ACTION_CATEGORY_ORDER,
  OFFICER_ACTION_CATEGORY_LABELS,
  getOfficerActionIneligibility,
  type OfficerActionId,
  type OfficerActionCategory,
} from "@/engine/officerActions";
import type { AppointmentMethod, Officer, OfficerDepartment } from "@/engine/types";
import {
  getOfficerStabilityValue,
  getOfficerThreatScore,
  getThreatBand,
} from "@/engine/officerDossier";
import { applyDialogueCityEffects } from "@/engine/dialogueEffects";
import AdministrativeBlocPanel from "@/components/AdministrativeBlocPanel";
import {
  OFFICER_AUTO_FILL_DOCTRINES,
  getOfficerAutoFillCost,
  getOfficerAutoFillDoctrine,
} from "@/engine/officerAppointmentDoctrines";
import type { OfficerAutoFillDoctrineId } from "@/engine/types";

const getRankColors = (Colors: ThemePalette): Record<string, string> => ({
  cadet: Colors.textMuted,
  officer: Colors.textSecondary,
  senior_officer: Colors.text,
  director: Colors.info,
  commissioner: Colors.warning,
  chief_director: Colors.accent,
});

const TRAIT_CATEGORY_COLORS: Record<string, string> = {
  administrative: "#2196F3",
  political: "#FFD700",
  security: "#F44336",
  economic: "#4CAF50",
};

const signed = (value: number): string => `${value > 0 ? "+" : ""}${value}`;

function CareerLogBlock({ log }: { log: { year: number; text: string }[] }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? [...log].reverse() : log.slice(-4).reverse();
  const hasMore = log.length > 4;
  return (
    <>
      <Pressable onPress={() => hasMore && setExpanded(!expanded)} style={styles.careerLogHeader}>
        <Text style={styles.traitSectionLabel}>CAREER LOG{hasMore ? ` (${log.length})` : ""}</Text>
        {hasMore && (
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={11} color={Colors.textMuted} />
        )}
      </Pressable>
      {visible.map((e, i) => (
        <View key={`cl-${i}`} style={styles.careerLogRow}>
          <Text style={styles.careerLogText}>
            <Text style={styles.careerLogYear}>{e.year}  </Text>
            {e.text}
          </Text>
        </View>
      ))}
      {!expanded && hasMore && (
        <Text style={styles.careerLogMore}>+{log.length - 4} earlier entries — tap to expand</Text>
      )}
    </>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const c = color ?? (value >= 70 ? Colors.accent : value >= 40 ? Colors.warning : Colors.danger);
  return (
    <View style={styles.statPill}>
      <Text style={[styles.statPillValue, { color: c }]}>{Math.round(value)}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

function AssessmentBlock({ officer }: { officer: Officer }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const threat = getOfficerThreatScore(officer);
  const stability = getOfficerStabilityValue(officer);
  const band = getThreatBand(threat);
  const threatColor =
    band === "severe" || band === "elevated" ? Colors.danger : band === "guarded" ? Colors.warning : Colors.accent;

  return (
    <>
      <Text style={styles.traitSectionLabel}>ASSESSMENT</Text>
      <View style={styles.quickStats}>
        <StatPill label="THREAT" value={threat} color={threatColor} />
        <StatPill label="STABILITY" value={stability} />
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>THREAT BAND</Text>
        <Text style={[styles.detailValue, { color: threatColor }]}>{band.toUpperCase()}</Text>
      </View>
    </>
  );
}

type FlatOfficerItem =
  | { type: "dept"; dept: string }
  | { type: "officer"; officer: Officer };

const getVariantColors = (Colors: ThemePalette): Record<string, { border: string; text: string; bg?: string }> => ({
  primary:   { border: Colors.accent,    text: Colors.accent,    bg: Colors.accentDark },
  secondary: { border: Colors.border,    text: Colors.text },
  warning:   { border: Colors.warning,   text: Colors.warning },
  danger:    { border: Colors.danger,    text: Colors.danger },
});

function formatOfficerActionEffects(action: OfficerActionId): string {
  const e = OFFICER_ACTION_RULES[action].effects;
  const parts: string[] = [];
  if (e.rankDelta) parts.push(e.rankDelta > 0 ? "+RANK" : "-RANK");
  for (const [k, label] of [
    ["loyalty", "LOY"],
    ["ambition", "AMB"],
    ["popularity", "POP"],
    ["corruption", "CORPT"],
    ["fearFactor", "FEAR"],
    ["competence", "COMP"],
  ] as const) {
    const v = (e as Record<string, number | undefined>)[k];
    if (v != null && v !== 0) parts.push(`${v > 0 ? "+" : ""}${v} ${label}`);
  }
  if (e.removeOfficer) parts.push("VACATE SEAT");
  if (e.ripple) parts.push("ripple to cabinet");
  return parts.join(" · ");
}

function dialogueActionLabel(id: string): string {
  const topicPrefix = id.match(/^[^_]+_[^_]+_/)?.[0] ?? "";
  const action = (id.startsWith(topicPrefix) ? id.slice(topicPrefix.length) : id).replace(/[_-]+/g, " ");
  return `ACTION: ${action.toUpperCase()}`;
}

function OfficerActionMenu({
  officer,
  credits,
  onPerform,
  onConfirmAction,
}: {
  officer: Officer;
  credits: number;
  onPerform: (action: OfficerActionId) => boolean;
  onConfirmAction?: (action: OfficerActionId) => void;
}) {
  const { colors: Colors } = useTheme();
  const mStyles = useMStyles();
  const VARIANT_COLORS = getVariantColors(Colors);
  const [expanded, setExpanded] = useState(false);

  // Post-success debounce: after an action lands, every button in this menu
  // goes briefly non-interactive so one deliberate tap = exactly one spend.
  const [actionCooldown, setActionCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
  }, []);

  const handleActionPress = (id: OfficerActionId) => {
    if (actionCooldown) return;
    playHaptic("light");
    if ((id === "exile" || id === "demote") && onConfirmAction) {
      onConfirmAction(id);
      return;
    }
    const ok = onPerform(id);
    if (ok) {
      setActionCooldown(true);
      cooldownTimer.current = setTimeout(() => setActionCooldown(false), 650);
    }
  };

  const allIds = Object.keys(OFFICER_ACTION_META) as OfficerActionId[];
  const grouped = useMemo(() => {
    const map = {} as Record<OfficerActionCategory, OfficerActionId[]>;
    for (const cat of OFFICER_ACTION_CATEGORY_ORDER) map[cat] = [];
    for (const id of allIds) map[OFFICER_ACTION_META[id].category].push(id);
    return map;
  }, [allIds]);

  return (
    <View style={mStyles.menuRoot}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={mStyles.moreToggle}>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={12} color={Colors.accent} />
        <Text style={mStyles.moreToggleText}>
          {expanded ? "HIDE ACTIONS" : `MORE ACTIONS (${allIds.length})`}
        </Text>
      </Pressable>

      {expanded && (
        <View style={mStyles.expandedBody}>
          {OFFICER_ACTION_CATEGORY_ORDER.map((cat) => (
            <View key={cat} style={mStyles.categoryGroup}>
              <Text style={mStyles.categoryHeader}>{OFFICER_ACTION_CATEGORY_LABELS[cat]}</Text>
              {grouped[cat].map((id) => {
                const meta = OFFICER_ACTION_META[id];
                const rule = OFFICER_ACTION_RULES[id];
                const ineligible = getOfficerActionIneligibility(id, officer);
                const insufficient = !ineligible && rule.cost > 0 && credits < rule.cost;
                const blocked = ineligible || insufficient;
                const reason = ineligible ?? (insufficient ? `Need ${rule.cost.toLocaleString()}c` : null);
                const colors = VARIANT_COLORS[meta.variant] ?? VARIANT_COLORS.secondary;
                return (
                  <Pressable
                    key={id}
                    onPress={() => !blocked && handleActionPress(id)}
                    style={({ pressed }) => [
                      mStyles.actionBtn,
                      { borderColor: blocked ? Colors.border : colors.border, backgroundColor: blocked ? "transparent" : colors.bg },
                      blocked && mStyles.actionBtnBlocked,
                      pressed && !blocked && mStyles.actionBtnPressed,
                    ]}
                    disabled={Boolean(blocked) || actionCooldown}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={mStyles.actionBtnTopRow}>
                        <Text style={[mStyles.actionBtnLabel, { color: blocked ? Colors.textMuted : colors.text }]}>
                          {meta.label}
                        </Text>
                        {rule.cost > 0 && (
                          <Text style={[mStyles.actionBtnCost, { color: blocked ? Colors.textMuted : Colors.textSecondary }]}>
                            {rule.cost.toLocaleString()}c
                          </Text>
                        )}
                      </View>
                      <Text style={mStyles.actionBtnDesc}>{meta.description}</Text>
                      <Text style={mStyles.actionBtnEffects}>{formatOfficerActionEffects(id)}</Text>
                      {reason && <Text style={mStyles.actionBtnReason}>{reason}</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const useMStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  menuRoot: { marginTop: 10 },
  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    backgroundColor: Colors.bgSecondary,
  },
  moreToggleText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  expandedBody: { marginTop: 8 },
  categoryGroup: { marginTop: 8 },
  categoryHeader: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  actionBtnBlocked: {
    opacity: 0.5,
  },
  actionBtnPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.98 }],
  },
  actionBtnTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  actionBtnLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  actionBtnCost: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
  actionBtnDesc: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 14,
  },
  actionBtnEffects: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  actionBtnReason: {
    color: Colors.warning,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    marginTop: 4,
  },
}));

/**
 * ── Pack B — Officer Wardrobe selector.
 *
 * Compact two-row stepper for the officer's uniform + sidearm. Lives
 * outside React.memo OfficerCard so subscribing to game state here
 * doesn't bust the parent's memoization on every tick. Cosmetic only;
 * setOfficerOutfit validates and silently coerces unknown ids.
 */
function OfficerWardrobeSelector({ officerId }: { officerId: string }) {
  const { colors: Colors } = useTheme();
  const officerWardrobeStyles = useOfficerWardrobeStyles();
  const { state, setState } = useGame();
  const outfit = getOfficerOutfit(state, officerId);
  const uniformIdx = UNIFORM_VARIANTS.findIndex((u) => u.id === outfit.uniformId);
  const sidearmIdx = SIDEARM_VARIANTS.findIndex((s) => s.id === outfit.sidearmId);

  const stepUniform = (delta: number) => {
    const next = (uniformIdx + delta + UNIFORM_VARIANTS.length) % UNIFORM_VARIANTS.length;
    setState((prev) => setOfficerOutfit(prev, officerId, { uniformId: UNIFORM_VARIANTS[next].id as UniformId }));
  };
  const stepSidearm = (delta: number) => {
    const next = (sidearmIdx + delta + SIDEARM_VARIANTS.length) % SIDEARM_VARIANTS.length;
    setState((prev) => setOfficerOutfit(prev, officerId, { sidearmId: SIDEARM_VARIANTS[next].id as SidearmId }));
  };

  const u = UNIFORM_VARIANTS[Math.max(0, uniformIdx)];
  const s = SIDEARM_VARIANTS[Math.max(0, sidearmIdx)];

  return (
    <View style={officerWardrobeStyles.card}>
      <View style={officerWardrobeStyles.headerRow}>
        <Feather name="shield" size={12} color={Colors.accent} />
        <Text style={officerWardrobeStyles.headerText}>WARDROBE</Text>
        <Text style={officerWardrobeStyles.summary}>{formatOutfitSummary(outfit)}</Text>
      </View>
      <View style={officerWardrobeStyles.row}>
        <Pressable onPress={() => stepUniform(-1)} hitSlop={10} style={officerWardrobeStyles.btn} accessibilityRole="button" accessibilityLabel="Previous uniform">
          <Feather name="chevron-left" size={14} color={Colors.textMuted} />
        </Pressable>
        <View style={officerWardrobeStyles.value}>
          <Text style={officerWardrobeStyles.label}>UNIFORM</Text>
          <Text style={officerWardrobeStyles.name}>{u.label}</Text>
        </View>
        <Pressable onPress={() => stepUniform(1)} hitSlop={10} style={officerWardrobeStyles.btn} accessibilityRole="button" accessibilityLabel="Next uniform">
          <Feather name="chevron-right" size={14} color={Colors.textMuted} />
        </Pressable>
      </View>
      <View style={officerWardrobeStyles.row}>
        <Pressable onPress={() => stepSidearm(-1)} hitSlop={10} style={officerWardrobeStyles.btn} accessibilityRole="button" accessibilityLabel="Previous sidearm">
          <Feather name="chevron-left" size={14} color={Colors.textMuted} />
        </Pressable>
        <View style={officerWardrobeStyles.value}>
          <Text style={officerWardrobeStyles.label}>SIDEARM</Text>
          <Text style={officerWardrobeStyles.name}>{s.label}</Text>
        </View>
        <Pressable onPress={() => stepSidearm(1)} hitSlop={10} style={officerWardrobeStyles.btn} accessibilityRole="button" accessibilityLabel="Next sidearm">
          <Feather name="chevron-right" size={14} color={Colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const useOfficerWardrobeStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  card: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    backgroundColor: Colors.bg,
    gap: 6,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  headerText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.5, color: Colors.accent },
  summary: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, textAlign: "right" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  btn: { width: 24, height: 24, justifyContent: "center", alignItems: "center" },
  value: { flex: 1 },
  label: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1.2, color: Colors.textMuted },
  name: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text, marginTop: 1 },
}));

const OfficerCard = React.memo(function OfficerCard({
  officer,
  expanded,
  credits,
  onPress,
  onAppoint,
  onDismiss,
  onConsult,
  onPerformAction,
  onConfirmAction,
}: {
  officer: Officer;
  expanded: boolean;
  credits: number;
  onPress: () => void;
  onAppoint: (method: AppointmentMethod) => void;
  onDismiss: () => void;
  onConsult?: () => void;
  onPerformAction: (action: OfficerActionId) => boolean;
  onConfirmAction?: (action: OfficerActionId) => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const RANK_COLORS = getRankColors(Colors);
  const rankColor = RANK_COLORS[officer.rank] ?? Colors.textSecondary;

  return (
    <Pressable onPress={onPress} style={[styles.card, expanded && styles.cardExpanded]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <View style={[styles.appointDot, { backgroundColor: officer.appointed ? Colors.accent : Colors.textMuted }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardPosition}>{officer.position}</Text>
            <Text style={styles.cardName}>
              {officer.appointed ? officer.name : "— VACANT —"}
            </Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.rankBadge, { color: rankColor, borderColor: rankColor }]}>
            {RANK_LABELS[officer.rank]}
          </Text>
        </View>
      </View>

      {officer.appointed && (
        <>
          <View style={styles.quickStats}>
            <StatPill label="COMP" value={officer.competence} />
            <StatPill label="LOYAL" value={officer.loyalty} />
            <StatPill label="AMBTN" value={officer.ambition} color={officer.ambition > 70 ? Colors.warning : undefined} />
            <StatPill label="CORPT" value={officer.corruption} color={officer.corruption > 30 ? Colors.danger : Colors.accent} />
            <StatPill label="POP" value={officer.popularity} />
          </View>
          {(officer.age != null || (officer.yearsServed ?? 0) > 0) && (
            <Text style={styles.tenureLine}>
              {officer.age != null ? `Age ${officer.age}` : ""}
              {officer.age != null && (officer.yearsServed ?? 0) > 0 ? "  •  " : ""}
              {(officer.yearsServed ?? 0) > 0 ? `${officer.yearsServed}y in office` : ""}
            </Text>
          )}
        </>
      )}

      {expanded && officer.appointed && (
        <View style={styles.detail}>
          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>FEAR FACTOR</Text>
            <Text style={styles.detailValue}>{officer.fearFactor}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>LEVEL</Text>
            <Text style={styles.detailValue}>{officer.level}</Text>
          </View>
          {officer.age != null && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>AGE</Text>
              <Text style={styles.detailValue}>{officer.age}</Text>
            </View>
          )}
          {(officer.yearsServed ?? 0) > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>YEARS SERVED</Text>
              <Text style={styles.detailValue}>{officer.yearsServed}</Text>
            </View>
          )}
          {officer.appointedYear != null && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>APPOINTED</Text>
              <Text style={styles.detailValue}>Year {officer.appointedYear}</Text>
            </View>
          )}
          {officer.appointmentMethod && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>APPOINTMENT</Text>
              <Text style={styles.detailValue}>
                {APPOINTMENT_METHODS.find((m) => m.id === officer.appointmentMethod)?.name ?? officer.appointmentMethod}
              </Text>
            </View>
          )}

          <AssessmentBlock officer={officer} />

          {(officer.careerLog?.length ?? 0) > 0 && (
            <CareerLogBlock log={officer.careerLog ?? []} />
          )}

          {(officer.rivals?.length ?? 0) > 0 && (
            <>
              <Text style={styles.traitSectionLabel}>RIVALS</Text>
              <View style={styles.traitRow}>
                {(officer.rivals ?? []).map((r) => (
                  <View key={r} style={[styles.traitChip, { borderColor: Colors.danger }]}>
                    <Text style={[styles.traitText, { color: Colors.danger }]}>{r}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={styles.traitSectionLabel}>TRAITS</Text>
          <View style={styles.traitRow}>
            {(officer.traits ?? []).map((t) => {
              const def = TRAIT_MAP[t];
              const catColor = def ? TRAIT_CATEGORY_COLORS[def.category] ?? Colors.border : Colors.border;
              return (
                <View key={t} style={[styles.traitChip, { borderColor: catColor }]}>
                  <Text style={[styles.traitText, { color: catColor }]}>{def?.name ?? t}</Text>
                  {def && <Text style={styles.traitEffect}>{def.effects}</Text>}
                </View>
              );
            })}
          </View>

          {officer.factionAffiliation && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>FACTION</Text>
              <Text style={[styles.detailValue, { color: Colors.warning }]}>{officer.factionAffiliation}</Text>
            </View>
          )}

          <View style={styles.actionRow}>
            {onConsult && (
              <Pressable onPress={onConsult} style={styles.consultBtn}>
                <Feather name="message-circle" size={14} color={Colors.accent} />
                <Text style={styles.consultBtnText}>CONSULT</Text>
              </Pressable>
            )}
            <Pressable onPress={onDismiss} style={styles.dismissBtn}>
              <Feather name="x-circle" size={14} color={Colors.danger} />
              <Text style={styles.dismissBtnText}>RELIEVE OF DUTY</Text>
            </Pressable>
          </View>

          <OfficerActionMenu
            officer={officer}
            credits={credits}
            onPerform={onPerformAction}
            onConfirmAction={onConfirmAction}
          />

          {/* Pack B — per-officer wardrobe customization. Cosmetic only. */}
          <OfficerWardrobeSelector officerId={officer.id} />
        </View>
      )}

      {expanded && !officer.appointed && (
        <View style={styles.detail}>
          <View style={styles.detailDivider} />
          <Text style={styles.vacantText}>This position is vacant. Appoint an officer to fill it.</Text>

          <Text style={styles.traitSectionLabel}>CANDIDATE PROFILE</Text>
          <View style={styles.quickStats}>
            <StatPill label="COMP" value={officer.competence} />
            <StatPill label="LOYAL" value={officer.loyalty} />
            <StatPill label="AMBTN" value={officer.ambition} color={officer.ambition > 70 ? Colors.warning : undefined} />
            <StatPill label="CORPT" value={officer.corruption} color={officer.corruption > 30 ? Colors.danger : Colors.accent} />
          </View>
          <View style={styles.traitRow}>
            {(officer.traits ?? []).map((t) => {
              const def = TRAIT_MAP[t];
              return (
                <View key={t} style={styles.traitChip}>
                  <Text style={styles.traitText}>{def?.name ?? t}</Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.traitSectionLabel}>APPOINTMENT METHOD</Text>
          {APPOINTMENT_METHODS.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => onAppoint(m.id)}
              style={styles.appointMethodBtn}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.appointMethodName}>{m.name}</Text>
                <Text style={styles.appointMethodEffect}>{m.effects}</Text>
              </View>
              <Feather name="chevron-right" size={14} color={Colors.accent} />
            </Pressable>
          ))}
        </View>
      )}
    </Pressable>
  );
});

function OfficersScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const cStyles = useCStyles();
  const insets = useSafeAreaInsets();
  const { state: rawState, setState, appointOfficer, dismissOfficer, autoFillVacancies, performOfficerAction } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const { showToast } = useToast();
  const state = useThrottledValue(rawState, 500);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<OfficerDepartment | null>(null);
  const filterScrollRef = useHorizontalWheelScroll();
  const [showAutoFill, setShowAutoFill] = useState(false);
  const [consultOfficer, setConsultOfficer] = useState<Officer | null>(null);
  const [consultBriefing, setConsultBriefing] = useState<OfficerBriefing | null>(null);
  const [consultResponse, setConsultResponse] = useState<{ choice: CommandChoice } | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const officers = state.officers ?? [];

  const officersByDept = useMemo(() => {
    const map: Record<string, Officer[]> = {};
    for (const o of officers) {
      if (!map[o.department]) map[o.department] = [];
      map[o.department].push(o);
    }
    return map;
  }, [officers]);

  const filtered = useMemo(() => {
    if (!selectedDept) return officers;
    return officersByDept[selectedDept] ?? [];
  }, [selectedDept, officers, officersByDept]);

  const appointedCount = officers.filter((o) => o.appointed).length;
  const vacantCount = officers.length - appointedCount;
  const avgCompetence = appointedCount > 0
    ? Math.round(officers.filter((o) => o.appointed).reduce((a, o) => a + o.competence, 0) / appointedCount)
    : 0;
  const avgCorruption = appointedCount > 0
    ? Math.round(officers.filter((o) => o.appointed).reduce((a, o) => a + o.corruption, 0) / appointedCount)
    : 0;

  const toggle = useCallback((id: string) => setExpanded((prev) => prev === id ? null : id), []);

  const handleAppoint = useCallback((officerId: string, method: AppointmentMethod) => {
    appointOfficer(officerId, method);
  }, [appointOfficer]);

  const handleDismiss = useCallback((officerId: string) => {
    dismissOfficer(officerId);
  }, [dismissOfficer]);

  const confirmDismiss = useCallback((officer: Officer) => {
    showModal(
      "RELIEVE OF DUTY",
      `Relieve ${officer.name} from the position of ${officer.position}?\n\nThe seat will become vacant and ${officer.name}'s role-based bonuses and authority will be lost. Their career history will be preserved.`,
      [
        { text: "CANCEL", style: "cancel" },
        { text: "RELIEVE OF DUTY", style: "destructive", onPress: () => handleDismiss(officer.id) },
      ],
    );
  }, [handleDismiss, showModal]);

  const handleConsult = useCallback((officer: Officer) => {
    const briefing = getOfficerBriefing(officer.department);
    if (!briefing) return;
    setConsultOfficer(officer);
    setConsultBriefing(briefing);
    setConsultResponse(null);
  }, []);

  const handlePerformAction = useCallback((officer: Officer, action: OfficerActionId): boolean => {
    const result = performOfficerAction(officer.id, action);
    if (!result.ok) {
      if (result.reason) setActionFeedback(result.reason);
      playHaptic("error");
      return false;
    }
    // Success confirmation: what happened, to whom, the stat effects, and
    // what it cost — built from the same per-action metadata the buttons use.
    const meta = OFFICER_ACTION_META[action];
    const rule = OFFICER_ACTION_RULES[action];
    const effects = formatOfficerActionEffects(action);
    const cost = rule.cost > 0 ? ` · ${rule.cost.toLocaleString()}c spent` : "";
    showToast(`${meta.label}: ${officer.name} — ${effects}${cost}`, "success");
    playHaptic("medium");
    return true;
  }, [performOfficerAction, showToast]);

  const confirmOfficerAction = useCallback((officer: Officer, action: OfficerActionId) => {
    if (action !== "exile" && action !== "demote") return;
    const irreversible = action === "exile";
    const meta = OFFICER_ACTION_META[action];
    const effects = formatOfficerActionEffects(action);
    showModal(
      irreversible ? "EXILE OFFICER" : "DEMOTE OFFICER",
      irreversible
        ? `Permanently exile ${officer.name} from the position of ${officer.position}?\n\nThis cannot be undone. The seat will be vacated, and every other appointed officer will gain +4 FEAR and lose 2 AMBITION. ${OFFICER_ACTION_RULES[action].cost.toLocaleString()}c will be spent.`
        : `Demote ${officer.name} from ${officer.position}?\n\nThis strips one rank and has lasting effects on loyalty, ambition, and popularity (${effects}).`,
      [
        { text: "CANCEL", style: "cancel" },
        { text: meta.label, style: "destructive", onPress: () => handlePerformAction(officer, action) },
      ],
    );
  }, [handlePerformAction, showModal]);

  const credits = state.resources?.credits ?? 0;
  const lastAutoFillResult = state.lastOfficerAutoFillResult;
  const lastAutoFillDoctrine = lastAutoFillResult
    ? getOfficerAutoFillDoctrine(lastAutoFillResult.doctrineId)
    : null;

  const handleAutoFill = useCallback((doctrineId: OfficerAutoFillDoctrineId) => {
    const result = autoFillVacancies(doctrineId);
    if (!result.ok) {
      setActionFeedback(result.reason);
      playHaptic("error");
      return;
    }
    setShowAutoFill(false);
    showToast(
      `${getOfficerAutoFillDoctrine(doctrineId).name}: ${result.result.filled} seats filled · ${result.result.totalCost.toLocaleString()}c spent`,
      "success",
    );
    playHaptic("medium");
  }, [autoFillVacancies, showToast]);

  const flatItems = useMemo<FlatOfficerItem[]>(() => {
    if (selectedDept) {
      const items: FlatOfficerItem[] = [{ type: "dept", dept: selectedDept }];
      for (const o of filtered) items.push({ type: "officer", officer: o });
      return items;
    }
    const items: FlatOfficerItem[] = [];
    for (const dept of DEPARTMENT_ORDER) {
      const deptOfficers = officersByDept[dept];
      if (!deptOfficers || deptOfficers.length === 0) continue;
      items.push({ type: "dept", dept });
      for (const o of deptOfficers) items.push({ type: "officer", officer: o });
    }
    return items;
  }, [selectedDept, filtered, officersByDept]);

  const renderItem = useCallback(({ item }: { item: FlatOfficerItem }) => {
    if (item.type === "dept") {
      return <Text style={styles.sectionTitle}>{DEPARTMENT_LABELS[item.dept as OfficerDepartment]}</Text>;
    }
    const o = item.officer;
    return (
      <OfficerCard
        officer={o}
        expanded={expanded === o.id}
        credits={credits}
        onPress={() => toggle(o.id)}
        onAppoint={(method) => handleAppoint(o.id, method)}
        onDismiss={() => confirmDismiss(o)}
        onConsult={o.appointed && getOfficerBriefing(o.department) ? () => handleConsult(o) : undefined}
        onPerformAction={(action) => handlePerformAction(o, action)}
        onConfirmAction={(action) => confirmOfficerAction(o, action)}
      />
    );
  }, [expanded, credits, toggle, handleAppoint, confirmDismiss, handleConsult, handlePerformAction, confirmOfficerAction]);

  const keyExtractor = useCallback((item: FlatOfficerItem) =>
    item.type === "dept" ? `dept-${item.dept}` : item.officer.id, []);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>OFFICER LOBBY</Text>
          <Text style={styles.headerSub}>
            {appointedCount} APPOINTED · {vacantCount} VACANT · {officers.length} POSITIONS
          </Text>
        </View>
      </View>

      <TutorialHint
        id="officers_intro"
        message="Officers run missions, lead garrisons, and absorb risks you cannot. Recruit, promote, and assign them. They have loyalty, ambition, and a memory — treat them poorly and they will remember."
      />
      <AdministrativeBlocPanel surface="officers" />

      <View style={styles.filterRow}>
        <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.filterContent}>
          <Pressable
            onPress={() => setSelectedDept(null)}
            style={[styles.filterChip, !selectedDept && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, !selectedDept && styles.filterTextActive]}>ALL ({officers.length})</Text>
          </Pressable>
          {DEPARTMENT_ORDER.map((dept) => {
            const count = officersByDept[dept]?.length ?? 0;
            if (count === 0) return null;
            const appointed = (officersByDept[dept] ?? []).filter((o) => o.appointed).length;
            return (
              <Pressable
                key={dept}
                onPress={() => setSelectedDept(selectedDept === dept ? null : dept)}
                style={[styles.filterChip, selectedDept === dept && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, selectedDept === dept && styles.filterTextActive]}>
                  {DEPARTMENT_LABELS[dept]} ({appointed}/{count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <GameModal {...modal} onDismiss={hideModal} />

      {actionFeedback && (
        <GameModal
          visible={true}
          title="ACTION BLOCKED"
          message={actionFeedback}
          buttons={[{ text: "OK", onPress: () => setActionFeedback(null) }]}
          onDismiss={() => setActionFeedback(null)}
        />
      )}

      <Modal visible={showAutoFill} transparent animationType="fade" onRequestClose={() => setShowAutoFill(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SELECT APPOINTMENT DOCTRINE</Text>
            <Text style={styles.modalSub}>
              {vacantCount} vacant position{vacantCount !== 1 ? "s" : ""} will be filled immediately. Costs and consequences apply once on confirmation.
            </Text>
            <ScrollView style={styles.modalMethodScroll} showsVerticalScrollIndicator={false}>
              {OFFICER_AUTO_FILL_DOCTRINES.map((doctrine) => {
                const totalCost = getOfficerAutoFillCost(doctrine.id, vacantCount);
                const affordable = credits >= totalCost;
                return (
                  <Pressable
                    key={doctrine.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${doctrine.name}. ${totalCost.toLocaleString()} credits total. ${doctrine.description}`}
                    accessibilityState={{ disabled: !affordable }}
                    disabled={!affordable}
                    onPress={() => handleAutoFill(doctrine.id)}
                    style={[styles.modalMethodBtn, !affordable && styles.modalMethodBtnDisabled]}
                  >
                    <View style={styles.doctrineHeading}>
                      <Text style={styles.modalMethodName}>{doctrine.name}</Text>
                      <Text style={[styles.doctrineCost, !affordable && styles.doctrineCostBlocked]}>
                        {totalCost.toLocaleString()}c TOTAL
                      </Text>
                    </View>
                    <Text style={styles.modalMethodEffect}>
                      {doctrine.description} · {doctrine.costPerSeat.toLocaleString()}c per seat
                    </Text>
                    <View style={styles.doctrineEffects}>
                      <Text style={styles.doctrineEffect}>COMP {signed(doctrine.competenceDelta)}</Text>
                      <Text style={styles.doctrineEffect}>LOY {signed(doctrine.loyaltyDelta)}</Text>
                      <Text style={styles.doctrineEffect}>CORPT {signed(doctrine.corruptionDelta)}</Text>
                    </View>
                    <Text style={styles.doctrineFaction}>
                      {doctrine.factionConsequence} FACTION LOY {signed(doctrine.factionLoyaltyDelta)}
                      {doctrine.factionInfluenceDelta ? ` · INF ${signed(doctrine.factionInfluenceDelta)}` : ""}
                      {doctrine.factionThreatDelta ? ` · THREAT ${signed(doctrine.factionThreatDelta)}` : ""}
                    </Text>
                    {!affordable && (
                      <Text style={styles.doctrineInsufficient}>
                        INSUFFICIENT FUNDS · SHORT {(totalCost - credits).toLocaleString()}c
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setShowAutoFill(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>CANCEL</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {consultOfficer && consultBriefing && (
        <GameModal
          visible={true}
          title={`${consultOfficer.name} — ${consultBriefing.title}`}
          message=""
          buttons={[{ text: "CLOSE", onPress: () => { setConsultOfficer(null); setConsultBriefing(null); setConsultResponse(null); } }]}
          onDismiss={() => { setConsultOfficer(null); setConsultBriefing(null); setConsultResponse(null); }}
        >
          <ScrollView style={{ maxHeight: 400 }}>
            {!consultResponse && (
              <View>
                <Text style={cStyles.topicText}>{consultBriefing.title}</Text>
                <Text style={cStyles.prompt}>Select an action.</Text>
                <View style={cStyles.divider} />
                {consultBriefing.choices.map((choice) => (
                  <Pressable
                    key={choice.id}
                    onPress={() => {
                      setConsultResponse({ choice });
                      setState((prev) => {
                        const next = applyDialogueCityEffects(prev, choice.effects);
                        return {
                          ...next,
                          officers: prev.officers.map((officer) => (
                            officer.id === consultOfficer.id
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
                    style={cStyles.choiceBtn}
                  >
                    <Text style={cStyles.choiceText}>{dialogueActionLabel(choice.id)}</Text>
                    <Text style={cStyles.effectPreviewLabel}>EFFECTS</Text>
                    <View style={cStyles.effectsRow}>
                      {Object.entries(choice.effects)
                        .filter(([, v]) => typeof v === "number" && v !== 0)
                        .map(([k, v]) => (
                          <Text key={k} style={[cStyles.effectTag, { color: (v as number) > 0 ? Colors.accent : Colors.danger }]}>
                            {k.toUpperCase()} {(v as number) > 0 ? "+" : ""}{v}
                          </Text>
                        ))}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            {consultResponse && (
              <View>
                <Text style={cStyles.topicText}>ACTION APPLIED</Text>
                <View style={cStyles.effectsRow}>
                  {Object.entries(consultResponse.choice.effects).filter(([, v]) => v !== 0).map(([k, v]) => (
                    <Text key={k} style={[cStyles.effectTag, { color: (v as number) > 0 ? Colors.accent : Colors.danger }]}>
                      {k.toUpperCase()} {(v as number) > 0 ? "+" : ""}{v}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </GameModal>
      )}

      <FlatList
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        data={flatItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        ListHeaderComponent={
          <>
            {!selectedDept && (
              <View style={styles.summaryRow}>
                <SummaryBox label="APPOINTED" value={appointedCount} color={Colors.accent} />
                <SummaryBox label="VACANT" value={vacantCount} color={vacantCount > 0 ? Colors.warning : Colors.accent} />
                <SummaryBox label="AVG COMP" value={avgCompetence} color={avgCompetence >= 60 ? Colors.accent : Colors.warning} />
                <SummaryBox label="AVG CORPT" value={avgCorruption} color={avgCorruption > 25 ? Colors.danger : Colors.accent} />
              </View>
            )}
            {!selectedDept && lastAutoFillResult && lastAutoFillDoctrine && (
              <View style={styles.autoFillResult}>
                <View style={styles.doctrineHeading}>
                  <Text style={styles.autoFillResultTitle}>LAST BULK APPOINTMENT</Text>
                  <Text style={styles.autoFillResultYear}>YEAR {lastAutoFillResult.appliedYear}</Text>
                </View>
                <Text style={styles.autoFillResultName}>{lastAutoFillDoctrine.name}</Text>
                <Text style={styles.autoFillResultBody}>
                  {lastAutoFillResult.filled} seats filled · {lastAutoFillResult.totalCost.toLocaleString()}c spent ·
                  {" "}AVG COMP {signed(lastAutoFillResult.averageCompetenceDelta)} ·
                  {" "}LOY {signed(lastAutoFillResult.averageLoyaltyDelta)} ·
                  {" "}CORPT {signed(lastAutoFillResult.averageCorruptionDelta)}
                </Text>
                <Text style={styles.autoFillResultFaction}>
                  {lastAutoFillDoctrine.factionConsequence} Actual average across {lastAutoFillResult.affectedFactionCount} active internal faction{lastAutoFillResult.affectedFactionCount === 1 ? "" : "s"}:
                  {" "}LOY {signed(lastAutoFillResult.factionLoyaltyDelta)} ·
                  {" "}INF {signed(lastAutoFillResult.factionInfluenceDelta)} ·
                  {" "}THREAT {signed(lastAutoFillResult.factionThreatDelta)}.
                </Text>
              </View>
            )}
            {vacantCount > 0 && (
              <Pressable accessibilityLabel="Auto-fill vacant officer positions" onPress={() => setShowAutoFill(true)} style={styles.autoFillBtn}>
                <Feather name="users" size={14} color={Colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.autoFillLabel}>AUTO-FILL {vacantCount} VACANT POSITION{vacantCount !== 1 ? "S" : ""}</Text>
                  <Text style={styles.autoFillSub}>Choose cost, competence, loyalty, corruption, and faction tradeoffs</Text>
                </View>
                <Feather name="chevron-right" size={14} color={Colors.accent} />
              </Pressable>
            )}
          </>
        }
        ListFooterComponent={<View style={{ height: 30 }} />}
      />
    </View>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: number; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.summaryBox}>
      <Text style={[styles.summaryValue, { color }]}>{Math.round(value)}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    marginBottom: 16,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    alignItems: "center",
  },
  summaryValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
  },

  sectionTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    marginBottom: 8,
  },
  cardExpanded: {
    borderColor: Colors.borderBright,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
  },
  appointDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  cardPosition: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  cardName: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    marginTop: 2,
  },
  cardRight: {
    alignItems: "flex-end",
  },
  rankBadge: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  quickStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 4,
  },
  statPill: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.bgSecondary,
    borderRadius: 3,
    paddingVertical: 5,
  },
  statPillValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  statPillLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    letterSpacing: 0.5,
    marginTop: 1,
  },

  detail: {
    marginTop: 8,
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  detailLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  detailValue: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  tenureLine: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 6,
    marginLeft: 16,
  },
  careerLogHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  careerLogMore: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, fontStyle: "italic", marginTop: 2, marginBottom: 4 },
  careerLogRow: {
    paddingVertical: 3,
  },
  careerLogText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 14,
  },
  careerLogYear: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
  },

  traitSectionLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 10,
    marginBottom: 6,
  },
  traitRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  traitChip: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  traitText: {
    color: Colors.info,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  traitEffect: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    marginTop: 2,
  },

  vacantText: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    marginBottom: 10,
  },

  appointMethodBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  appointMethodName: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  appointMethodEffect: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    marginTop: 2,
  },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  consultBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 4,
    backgroundColor: Colors.accentDark,
  },
  consultBtnText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  dismissBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 4,
  },
  dismissBtnText: {
    color: Colors.danger,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },

  autoFillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,255,65,0.06)",
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  autoFillLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  autoFillSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: Platform.OS === "web" ? "flex-start" : "center",
    alignItems: "center",
    paddingHorizontal: Platform.OS === "web" ? 16 : 24,
    paddingTop: Platform.OS === "web" ? 16 : 24,
    paddingBottom: Platform.OS === "web" ? 12 : 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 560 : 400,
    maxHeight: Platform.OS === "web" ? "95%" : undefined,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 6,
    padding: Platform.OS === "web" ? 14 : 20,
  },
  modalTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  modalSub: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginBottom: Platform.OS === "web" ? 10 : 16,
    lineHeight: 18,
  },
  modalMethodScroll: {
    flexShrink: 1,
  },
  modalMethodBtn: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: Platform.OS === "web" ? 9 : 12,
    marginBottom: Platform.OS === "web" ? 5 : 8,
  },
  modalMethodBtnDisabled: {
    opacity: 0.55,
  },
  doctrineHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  doctrineCost: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  doctrineCostBlocked: {
    color: Colors.danger,
  },
  doctrineEffects: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 6,
  },
  doctrineEffect: {
    color: Colors.textSecondary,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.35,
  },
  doctrineFaction: {
    color: Colors.warning,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    lineHeight: 13,
    marginTop: 6,
  },
  doctrineInsufficient: {
    color: Colors.danger,
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.55,
    marginTop: 5,
  },
  modalMethodName: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  modalMethodEffect: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 3,
  },
  modalCancelBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 4,
  },
  modalCancelText: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  autoFillResult: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: 4,
    padding: 10,
    marginBottom: 12,
  },
  autoFillResultTitle: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.8,
  },
  autoFillResultYear: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 8,
  },
  autoFillResultName: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  autoFillResultBody: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
  },
  autoFillResultFaction: {
    color: Colors.warning,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
  },
}));

const useCStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  topicText: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.3, marginBottom: 8 },
  prompt: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 12, textAlign: "center" },
  divider: { height: 1, backgroundColor: Colors.border, marginBottom: 10 },
  choiceBtn: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.accent, borderRadius: 4, padding: 10, marginBottom: 6 },
  choiceText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.3 },
  effectPreviewLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5, marginTop: 6, marginBottom: 4 },
  effectsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  effectTag: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
}));

export default withScreenBoundary(OfficersScreen, "officers");

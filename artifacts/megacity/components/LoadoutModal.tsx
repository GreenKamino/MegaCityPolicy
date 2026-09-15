import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import {
  ROLE_ICON,
  ROLE_LABEL,
  ROLE_ORDER,
  computeLoadoutStrength,
  formatLoadoutSummary,
  getAvailableUnitsByRole,
  loadoutTotalUnits,
  recommendedComposition,
  summarizeLoadoutByRole,
  type Loadout,
  type LoadoutRole,
} from "@/engine/loadout";
import type { AttackTypeDef } from "@/engine/strikeData";
import type { GameState } from "@/engine/types";

type MciName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type Props = {
  visible: boolean;
  state: GameState;
  attackType: AttackTypeDef | null;
  targetName: string;
  targetDefense: number;
  onCancel: () => void;
  onConfirm: (loadout: Loadout) => void;
  // The loadout the player picked the LAST time they ran this attack type.
  // Used to pre-fill on open and surface a "USE LAST" shortcut.
  lastLoadout?: Loadout | null;
};

const STEP_OPTIONS = [1, 5, 25];

export default function LoadoutModal({
  visible,
  state,
  attackType,
  targetName,
  targetDefense,
  onCancel,
  onConfirm,
  lastLoadout,
}: Props) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const [loadout, setLoadout] = useState<Loadout>({});

  // NOTE: keep `[state]` here. `runTick` unconditionally clones
  // `state.units` every tick (engine/formulas.ts), so narrowing the dep
  // to `[state.units]` would still re-run on every tick — no perf win
  // and a misleading dep array.
  const available = useMemo(() => getAvailableUnitsByRole(state), [state]);

  // Build a "lastLoadout clamped to currently-available units" view. This is
  // what we pre-fill with on open and what the USE LAST button restores.
  const clampedLast = useMemo<Loadout | null>(() => {
    if (!lastLoadout) return null;
    const liveByKey: Record<string, number> = {};
    for (const role of ROLE_ORDER) {
      for (const u of available[role]) liveByKey[u.key] = u.available;
    }
    const out: Loadout = {};
    for (const [k, v] of Object.entries(lastLoadout)) {
      if (!v || v <= 0) continue;
      const have = liveByKey[k] ?? 0;
      const take = Math.min(have, Math.floor(v));
      if (take > 0) out[k] = take;
    }
    return Object.keys(out).length > 0 ? out : null;
  }, [lastLoadout, available]);

  // Reset selection whenever the modal is reopened or attack type changes.
  // Pre-fill with the clamped last loadout when one exists; otherwise empty.
  React.useEffect(() => {
    if (visible) setLoadout(clampedLast ? { ...clampedLast } : {});
    // We intentionally don't depend on clampedLast directly to avoid
    // re-resetting selection while the user is editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, attackType?.id]);
  const summary = useMemo(() => summarizeLoadoutByRole(loadout), [loadout]);
  const totalUnits = loadoutTotalUnits(loadout);
  const totalStrength = computeLoadoutStrength(loadout);

  const minUnits = attackType?.minUnits ?? 0;
  const meetsMin = totalUnits >= minUnits;

  const ratio = targetDefense > 0 ? totalStrength / targetDefense : 99;
  const forecast =
    ratio >= 1.6
      ? { label: "OVERWHELMING", color: Colors.accent }
      : ratio >= 1.0
        ? { label: "FAVORABLE", color: Colors.accent }
        : ratio >= 0.6
          ? { label: "UNCERTAIN", color: Colors.warning }
          : { label: "UNFAVORABLE", color: Colors.danger };

  const setUnit = (key: string, next: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, Math.floor(next)));
    setLoadout((prev) => {
      const out = { ...prev };
      if (clamped <= 0) delete out[key];
      else out[key] = clamped;
      return out;
    });
  };

  const autoFill = () => {
    if (!attackType) return;
    // Aim for about 2× the minUnits (or at least 25) so the auto-fill is
    // immediately usable, then cap at what the player actually has.
    const target = Math.max(25, minUnits * 2);
    setLoadout(recommendedComposition(attackType.id, target, state));
  };

  const clearAll = () => setLoadout({});

  if (!attackType) return null;

  const visibleRoles = ROLE_ORDER.filter((r) => available[r].length > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>FORCE LOADOUT</Text>
              <Text style={styles.title}>{attackType.name}</Text>
              <Text style={styles.subtitle}>vs {targetName}</Text>
            </View>
            <Pressable onPress={onCancel} hitSlop={10} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <Stat label="DEPLOYED" value={String(totalUnits)} hint={minUnits > 0 ? `min ${minUnits}` : undefined} ok={meetsMin} />
            <Stat label="STRENGTH" value={String(totalStrength)} hint={`def ${targetDefense}`} ok />
            <Stat label="FORECAST" value={forecast.label} ok color={forecast.color} />
          </View>

          <View style={styles.actionsRow}>
            <Pressable onPress={autoFill} style={styles.smallBtn}>
              <MaterialCommunityIcons name="auto-fix" size={12} color={Colors.accent} />
              <Text style={styles.smallBtnTxt}>AUTO-FILL</Text>
            </Pressable>
            {clampedLast ? (
              <Pressable onPress={() => setLoadout({ ...clampedLast })} style={styles.smallBtn}>
                <MaterialCommunityIcons name="history" size={12} color={Colors.accent} />
                <Text style={styles.smallBtnTxt}>USE LAST</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={clearAll} style={styles.smallBtn}>
              <MaterialCommunityIcons name="close-circle-outline" size={12} color={Colors.textMuted} />
              <Text style={[styles.smallBtnTxt, { color: Colors.textMuted }]}>CLEAR</Text>
            </Pressable>
          </View>

          {visibleRoles.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="alert" size={28} color={Colors.warning} />
              <Text style={styles.emptyTxt}>No combat units available. Recruit forces in the MILITARY screen.</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 8 }}>
              {visibleRoles.map((role) => (
                <RoleSection
                  key={role}
                  role={role}
                  units={available[role]}
                  loadout={loadout}
                  roleSummary={summary[role]}
                  onChange={setUnit}
                />
              ))}
            </ScrollView>
          )}

          {totalUnits > 0 ? (
            <Text style={styles.compositionLine} numberOfLines={2}>
              {formatLoadoutSummary(loadout)}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <Pressable onPress={onCancel} style={[styles.footerBtn, styles.footerCancel]}>
              <Text style={styles.footerCancelTxt}>ABORT</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(loadout)}
              disabled={!meetsMin}
              style={[
                styles.footerBtn,
                styles.footerLaunch,
                !meetsMin && styles.footerLaunchDisabled,
              ]}
            >
              <MaterialCommunityIcons name="rocket-launch" size={14} color={Colors.bg} />
              <Text style={styles.footerLaunchTxt}>LAUNCH STRIKE</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Stat({
  label,
  value,
  hint,
  ok,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  ok: boolean;
  color?: string;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: color ?? (ok ? Colors.accent : Colors.danger) }]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function RoleSection({
  role,
  units,
  loadout,
  roleSummary,
  onChange,
}: {
  role: LoadoutRole;
  units: { key: string; label: string; available: number; weight: number }[];
  loadout: Loadout;
  roleSummary: { count: number; strength: number };
  onChange: (key: string, next: number, max: number) => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.roleBlock}>
      <View style={styles.roleHeader}>
        <MaterialCommunityIcons name={ROLE_ICON[role] as MciName} size={14} color={Colors.accent} />
        <Text style={styles.roleTitle}>{ROLE_LABEL[role]}</Text>
        <View style={{ flex: 1 }} />
        {roleSummary.count > 0 ? (
          <Text style={styles.roleSummary}>
            {roleSummary.count} unit{roleSummary.count === 1 ? "" : "s"} · str {Math.round(roleSummary.strength)}
          </Text>
        ) : null}
      </View>
      {units.map((u) => {
        const v = loadout[u.key] ?? 0;
        return (
          <View key={u.key} style={styles.unitRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.unitLabel} numberOfLines={1}>{u.label}</Text>
              <Text style={styles.unitMeta}>×{u.weight.toFixed(1)} str  ·  {u.available} available</Text>
            </View>
            <View style={styles.stepperRow}>
              {STEP_OPTIONS.map((step) => (
                <Pressable
                  key={`m${step}`}
                  onPress={() => onChange(u.key, v - step, u.available)}
                  disabled={v <= 0}
                  style={[styles.stepBtn, v <= 0 && styles.stepBtnDisabled]}
                >
                  <Text style={styles.stepBtnTxt}>-{step}</Text>
                </Pressable>
              ))}
              <View style={styles.countWrap}>
                <Text style={styles.countTxt}>{v}</Text>
              </View>
              {STEP_OPTIONS.map((step) => (
                <Pressable
                  key={`p${step}`}
                  onPress={() => onChange(u.key, v + step, u.available)}
                  disabled={v >= u.available}
                  style={[styles.stepBtn, v >= u.available && styles.stepBtnDisabled]}
                >
                  <Text style={styles.stepBtnTxt}>+{step}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => onChange(u.key, u.available, u.available)}
                style={[styles.stepBtn, styles.maxBtn]}
              >
                <Text style={[styles.stepBtnTxt, { color: Colors.accent }]}>MAX</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "90%",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.danger + "60",
    borderRadius: 6,
    padding: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  eyebrow: {
    color: Colors.danger,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  title: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  stat: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 8,
    alignItems: "center",
  },
  statLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 2,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  statHint: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
  },
  smallBtnTxt: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  scroll: {
    maxHeight: 360,
  },
  emptyWrap: {
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  emptyTxt: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textAlign: "center",
  },
  roleBlock: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 8,
    backgroundColor: Colors.bg,
  },
  roleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  roleTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  roleSummary: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
  },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  unitLabel: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  unitMeta: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    marginTop: 1,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  stepBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 2,
    minWidth: 28,
    alignItems: "center",
  },
  stepBtnDisabled: {
    opacity: 0.3,
  },
  stepBtnTxt: {
    color: Colors.textSecondary,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
  },
  maxBtn: {
    borderColor: Colors.accent + "60",
  },
  countWrap: {
    minWidth: 36,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: 2,
    alignItems: "center",
  },
  countTxt: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  compositionLine: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footer: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 4,
  },
  footerCancel: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footerCancelTxt: {
    color: Colors.textSecondary,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  footerLaunch: {
    backgroundColor: Colors.danger,
  },
  footerLaunchDisabled: {
    backgroundColor: Colors.danger + "40",
  },
  footerLaunchTxt: {
    color: Colors.bg,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
}));

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SectionHeader from "@/components/SectionHeader";
import { useGame } from "@/context/GameContext";
import { useTheme } from "@/context/ThemeContext";
import {
  AUTO_MANAGER_DOMAINS,
  DOMAIN_DESCRIPTIONS,
  DOMAIN_LABELS,
  DOMAIN_ROLES,
  getEffectiveMode,
  type AutoManagerDomain,
  type AutoManagerMode,
} from "@/engine/autoManagers";
import { AUTO_PRIORITY_LABELS, DEFAULT_AUTO_CONSTRUCTION } from "@/engine/autoConstruction";
import { DEFAULT_AUTO_RECRUIT, getMaxRetinueStrength } from "@/engine/autoRecruit";
import { ROLE_LABELS } from "@/engine/innerCircleData";
import { getClassDef } from "@/engine/retinueData";

const MODES: AutoManagerMode[] = ["off", "suggest", "act"];
const MODE_LABEL: Record<AutoManagerMode, string> = { off: "OFF", suggest: "SUGGEST", act: "ACT" };

function AdvisorBriefingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    state,
    setAutoManagerMode,
    setAutoManagerPauseAllAct,
    acceptAutoManagerProposal,
    declineAutoManagerProposal,
    snoozeAutoManagerProposal,
    setAutoManagerAlwaysAllow,
  } = useGame();
  const { colors: c } = useTheme();
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const am = state.autoManagers ?? { modes: {}, queue: [], pauseAllAct: false, alwaysAllow: [], snoozedKinds: [], lastDecisionTick: {} };
  const honorMode = state.honorMode === true;

  // Officer role -> appointed lookup. A domain whose required role is
  // unfilled is shown but its mode controls are disabled and the card
  // surfaces "APPOINT <ROLE> TO ENABLE".
  const appointedRoles = useMemo(() => {
    const set = new Set<string>();
    for (const m of state.innerCircle?.members ?? []) set.add(m.role);
    return set;
  }, [state.innerCircle]);

  // officerId -> officer name lookup. Proposals carry the originating
  // officer's id; we resolve it here so the player sees who's flagging.
  const officerNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of state.officers ?? []) map.set(o.id, o.name);
    for (const m of state.innerCircle?.members ?? []) {
      const r = m as unknown as { id?: string; name?: string };
      if (r.id && r.name) map.set(r.id, r.name);
    }
    return map;
  }, [state.officers, state.innerCircle]);

  const proposalsSorted = useMemo(
    () => [...am.queue].sort((a, b) => a.expiresAtTick - b.expiresAtTick),
    [am.queue],
  );
  const recruitConfig = state.autoRecruit ?? DEFAULT_AUTO_RECRUIT;
  const constructionConfig = state.autoConstruction ?? DEFAULT_AUTO_CONSTRUCTION;
  const activeTroops = (state.retinue?.troops ?? []).filter((troop) => troop.status !== "kia").length;
  const maxTroops = getMaxRetinueStrength(state);
  const recruitPriority = recruitConfig.classPriority
    .slice(0, 3)
    .map((classId) => getClassDef(classId)?.name ?? classId.replace(/_/g, " "))
    .join(" · ");
  const constructionPriorities = (constructionConfig.priorities ?? [])
    .slice(0, 3)
    .map((priority) => AUTO_PRIORITY_LABELS[priority] ?? priority)
    .join(" · ");

  const onSetMode = useCallback(
    (domain: AutoManagerDomain, mode: AutoManagerMode) => {
      setAutoManagerMode(domain, mode);
    },
    [setAutoManagerMode],
  );

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: c.bg }]}>
      <View style={[styles.header, { backgroundColor: c.bgSecondary, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={20} color={c.accent} />
        </Pressable>
        <MaterialCommunityIcons name="account-tie-voice" size={18} color={c.accent} />
        <Text style={[styles.headerTitle, { color: c.accent }]}>AUTO-MANAGER CONTROL CENTER</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: c.bgCard, borderColor: c.border }]}>
          <View style={[styles.heroIcon, { backgroundColor: c.accent + "18", borderColor: c.accent + "55" }]}>
            <MaterialCommunityIcons name="account-tie-voice-outline" size={22} color={c.accent} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroEyebrow, { color: c.accent }]}>COMMAND DELEGATION</Text>
            <Text style={[styles.heroTitle, { color: c.text }]}>Every automated system, one audit point.</Text>
            <Text style={[styles.heroBody, { color: c.textMuted }]}>
              Review who is acting, what is queued, and where each manager is configured. Detailed controls stay on their existing screens.
            </Text>
          </View>
        </View>

        {honorMode && (
          <View style={[styles.banner, { borderColor: c.warning + "60", backgroundColor: c.warning + "10" }]}>
            <Feather name="shield" size={14} color={c.warning} />
            <Text style={[styles.bannerText, { color: c.warning }]}>HONOR MODE ACTIVE — ACT is locked. Auto-managers run as SUGGEST only.</Text>
          </View>
        )}

        <SectionHeader title="Global Controls" icon={<Feather name="sliders" size={14} color={c.accent} />} />

        <Pressable
          onPress={() => setAutoManagerPauseAllAct(!am.pauseAllAct)}
          style={[styles.toggleRow, { backgroundColor: c.bgCard, borderColor: am.pauseAllAct ? c.warning : c.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, { color: am.pauseAllAct ? c.warning : c.text }]}>
              PAUSE ALL ACT-MODE {am.pauseAllAct ? "ON" : "OFF"}
            </Text>
            <Text style={[styles.toggleSub, { color: c.textMuted }]}>
              Forces every domain into SUGGEST without resetting per-domain modes. Use as a kill switch.
            </Text>
          </View>
          <Feather name={am.pauseAllAct ? "pause-circle" : "play-circle"} size={22} color={am.pauseAllAct ? c.warning : c.accent} />
        </Pressable>

        <SectionHeader title="Manager Roster" icon={<MaterialCommunityIcons name="view-dashboard-outline" size={14} color={c.accent} />} />
        <Text style={[styles.groupLabel, { color: c.textMuted }]}>SPECIALIZED MANAGERS</Text>
        <View style={styles.rosterGrid}>
          <View style={[styles.managerCard, { backgroundColor: c.bgCard, borderColor: c.border }]}>
            <View style={styles.managerCardHead}>
              <View style={[styles.managerIcon, { backgroundColor: c.accent + "18" }]}>
                <Feather name="user-plus" size={15} color={c.accent} />
              </View>
              <View style={styles.managerCardTitle}>
                <Text style={[styles.managerName, { color: c.text }]}>AUTO-RECRUIT</Text>
                <Text style={[styles.managerOwner, { color: c.textMuted }]}>ENFORCER PROTOCOL</Text>
              </View>
              <ModePill mode={getEffectiveMode(state, "recruit")} colors={c} />
            </View>
            <Text style={[styles.managerStatus, { color: c.text }]}>
              {activeTroops.toLocaleString()} / {maxTroops.toLocaleString()} personnel · {recruitConfig.targetStrengthPercent}% target
            </Text>
            <Text style={[styles.managerMeta, { color: c.textMuted }]}>
              {recruitConfig.budgetPerTick.toLocaleString()} credits/tick · Priority: {recruitPriority || "not set"}
            </Text>
            <Text style={[styles.managerGate, { color: appointedRoles.has("enforcer") ? c.accent : c.warning }]}>
              {appointedRoles.has("enforcer") ? "Enforcer appointed" : "UNFILLED — APPOINT ENFORCER TO ENABLE"}
            </Text>
            <OpenButton label="OPEN RECRUITMENT" onPress={() => router.push("/(game)/recruitment" as any)} colors={c} />
          </View>

          <View style={[styles.managerCard, { backgroundColor: c.bgCard, borderColor: c.border }]}>
            <View style={styles.managerCardHead}>
              <View style={[styles.managerIcon, { backgroundColor: constructionConfig.enabled ? c.accent + "18" : c.bg }]}>
                <Feather name="cpu" size={15} color={constructionConfig.enabled ? c.accent : c.textMuted} />
              </View>
              <View style={styles.managerCardTitle}>
                <Text style={[styles.managerName, { color: c.text }]}>AUTO-CONSTRUCTION</Text>
                <Text style={[styles.managerOwner, { color: c.textMuted }]}>ADMINISTRATOR</Text>
              </View>
              <StatusPill label={constructionConfig.enabled ? "ON" : "OFF"} tone={constructionConfig.enabled ? "accent" : "muted"} colors={c} />
            </View>
            <Text style={[styles.managerStatus, { color: constructionConfig.enabled ? c.accent : c.textMuted }]}>
              {constructionConfig.enabled ? "Assessing city needs" : "Delegation is paused"}
            </Text>
            <Text style={[styles.managerMeta, { color: c.textMuted }]}>
              {constructionConfig.budgetPerTick.toLocaleString()} credits/cycle · Priority: {constructionPriorities || "none"}
            </Text>
            <Text style={[styles.managerGate, { color: constructionConfig.enabled ? c.accent : c.warning }]}>
              {constructionConfig.enabled ? "Administrator delegation active" : "OFF — enable on the construction screen"}
            </Text>
            <OpenButton label="OPEN CONSTRUCTION" onPress={() => router.push("/(game)/construction" as any)} colors={c} />
          </View>
        </View>

        <Text style={[styles.groupLabel, { color: c.textMuted }]}>ADVISOR DOMAINS</Text>
        <SectionHeader
          title={`Pending Briefings — ${proposalsSorted.length}`}
          icon={<Feather name="inbox" size={14} color={c.accent} />}
        />

        {proposalsSorted.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: c.bgCard, borderColor: c.border }]}>
            <Feather name="check-circle" size={20} color={c.textMuted} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No pending briefings. Your advisors have nothing to flag.</Text>
          </View>
        ) : (
          proposalsSorted.map((p) => {
            const ticksLeft = Math.max(0, p.expiresAtTick - state.totalTicks);
            const allowed = am.alwaysAllow.includes(p.kind);
            const officerName = p.officerId ? officerNamesById.get(p.officerId) ?? "Unknown Officer" : null;
            return (
              <View key={p.id} style={[styles.proposal, { backgroundColor: c.bgCard, borderColor: c.border }]}>
                <View style={styles.proposalHead}>
                  <Text style={[styles.proposalDomain, { color: c.accent }]}>{DOMAIN_LABELS[p.domain]}</Text>
                  <Text style={[styles.proposalTtl, { color: c.textMuted }]}>{ticksLeft}t left</Text>
                </View>
                <Text style={[styles.proposalTitle, { color: c.text }]}>{p.title}</Text>
                {officerName && (
                  <Text style={[styles.proposalOfficer, { color: c.accent }]}>From: {officerName}</Text>
                )}
                <Text style={[styles.proposalBody, { color: c.textMuted }]}>{p.summary}</Text>
                <Text style={[styles.proposalRationale, { color: c.textMuted }]}>{p.rationale}</Text>
                {p.costPreview ? (
                  <Text style={[styles.proposalCost, { color: c.warning }]}>{p.costPreview}</Text>
                ) : null}

                <View style={styles.proposalActions}>
                  <Pressable
                    onPress={() => acceptAutoManagerProposal(p.id)}
                    style={[styles.actBtn, { backgroundColor: c.accent + "18", borderColor: c.accent }]}
                  >
                    <Text style={[styles.actBtnText, { color: c.accent }]}>APPROVE</Text>
                  </Pressable>
                  {p.declineable && (
                    <Pressable
                      onPress={() => declineAutoManagerProposal(p.id)}
                      style={[styles.actBtn, { backgroundColor: c.bg, borderColor: c.border }]}
                    >
                      <Text style={[styles.actBtnText, { color: c.text }]}>DECLINE</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => snoozeAutoManagerProposal(p.id, 24)}
                    style={[styles.actBtn, { backgroundColor: c.bg, borderColor: c.border }]}
                  >
                    <Text style={[styles.actBtnText, { color: c.textMuted }]}>SNOOZE 24t</Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => setAutoManagerAlwaysAllow(p.kind, !allowed)}
                  style={styles.alwaysRow}
                >
                  <Feather name={allowed ? "check-square" : "square"} size={13} color={allowed ? c.accent : c.textMuted} />
                  <Text style={[styles.alwaysText, { color: allowed ? c.accent : c.textMuted }]}>
                    Always allow this kind of briefing
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}

        <SectionHeader title="Advisor Domain Modes" icon={<MaterialCommunityIcons name="cog-outline" size={14} color={c.accent} />} />

        {AUTO_MANAGER_DOMAINS.filter((domain) => domain !== "recruit").map((domain) => {
          const role = DOMAIN_ROLES[domain];
          const roleLabel = role in ROLE_LABELS ? ROLE_LABELS[role as keyof typeof ROLE_LABELS] : "AGRICULTURE MINISTER";
          const roleAppointed = appointedRoles.has(role);
          const rawMode = am.modes[domain] ?? "off";
          const effectiveMode = getEffectiveMode(state, domain);
          const downgraded = rawMode !== effectiveMode;
          const disabled = !roleAppointed;
          return (
            <View
              key={domain}
              style={[
                styles.domainCard,
                { backgroundColor: c.bgCard, borderColor: c.border, opacity: disabled ? 0.55 : 1 },
                effectiveMode === "act" && { borderColor: c.accent + "80" },
                effectiveMode === "suggest" && { borderColor: c.warning + "60" },
              ]}
            >
              <View style={styles.domainHead}>
                <Text style={[styles.domainLabel, { color: c.text }]}>{DOMAIN_LABELS[domain]}</Text>
                <View
                  style={[
                    styles.modePill,
                    {
                      backgroundColor:
                        effectiveMode === "act"
                          ? c.accent + "22"
                          : effectiveMode === "suggest"
                          ? c.warning + "22"
                          : c.bg,
                      borderColor:
                        effectiveMode === "act" ? c.accent : effectiveMode === "suggest" ? c.warning : c.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modePillText,
                      {
                        color:
                          effectiveMode === "act" ? c.accent : effectiveMode === "suggest" ? c.warning : c.textMuted,
                      },
                    ]}
                  >
                    {MODE_LABEL[effectiveMode]}
                  </Text>
                </View>
              </View>
              <Text style={[styles.domainSub, { color: c.textMuted }]}>{DOMAIN_DESCRIPTIONS[domain]}</Text>
              <Text style={[styles.domainMeta, { color: c.textMuted }]}>
                Requires: {roleLabel} {roleAppointed ? "(appointed)" : "— UNFILLED"}
              </Text>

              {/* Explicit OFF / SUGGEST / ACT buttons. ACT is disabled
                  under honor mode with an inline reason; the mutation
                  point in GameContext also coerces ACT→SUGGEST as a
                  defense-in-depth interlock. */}
              <View style={styles.modeBtnRow}>
                {MODES.map((m) => {
                  const isCurrent = rawMode === m;
                  const actBlocked = m === "act" && honorMode;
                  const btnDisabled = disabled || actBlocked;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => { if (!btnDisabled) onSetMode(domain, m); }}
                      style={[
                        styles.modeBtn,
                        {
                          backgroundColor: isCurrent ? c.accent + "22" : c.bg,
                          borderColor: isCurrent ? c.accent : c.border,
                          opacity: btnDisabled ? 0.4 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeBtnText,
                          { color: isCurrent ? c.accent : c.textMuted },
                        ]}
                      >
                        {MODE_LABEL[m]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {honorMode && (
                <Text style={[styles.domainMeta, { color: c.warning }]}>
                  ACT disabled by Honor Mode.
                </Text>
              )}
              {downgraded && !honorMode && (
                <Text style={[styles.domainMeta, { color: c.warning }]}>
                  Downgraded from {MODE_LABEL[rawMode]} → {MODE_LABEL[effectiveMode]} (Pause All ACT).
                </Text>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn: { padding: 2 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.6 },
  scroll: { flex: 1 },
  content: { padding: 14, gap: 8 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderWidth: 1, borderRadius: 4 },
  bannerText: { fontFamily: "Inter_600SemiBold", fontSize: 11, flex: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderRadius: 4 },
  toggleLabel: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.2 },
  toggleSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4, lineHeight: 15 },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderWidth: 1, borderRadius: 4 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1 },
  proposal: { padding: 12, borderWidth: 1, borderRadius: 4, gap: 4 },
  proposalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  proposalDomain: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.4 },
  proposalTtl: { fontFamily: "Inter_400Regular", fontSize: 10 },
  proposalTitle: { fontFamily: "Inter_700Bold", fontSize: 13, marginTop: 2 },
  proposalOfficer: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.6 },
  proposalBody: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16 },
  proposalRationale: { fontFamily: "Inter_400Regular", fontSize: 11, fontStyle: "italic", lineHeight: 15 },
  proposalCost: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  proposalActions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  actBtn: { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 3 },
  actBtnText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 },
  alwaysRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  alwaysText: { fontFamily: "Inter_400Regular", fontSize: 11 },
  domainCard: { padding: 12, borderWidth: 1, borderRadius: 4, gap: 4 },
  domainHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  domainLabel: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.2 },
  modePill: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderRadius: 3 },
  modePillText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.2 },
  domainSub: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15 },
  domainMeta: { fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14 },
  modeBtnRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  modeBtn: { flex: 1, paddingVertical: 6, borderWidth: 1, borderRadius: 3, alignItems: "center" },
  modeBtnText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.2 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderRadius: 6 },
  heroIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 22 },
  heroCopy: { flex: 1, gap: 3 },
  heroEyebrow: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5 },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 20 },
  heroBody: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15 },
  groupLabel: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.4, marginTop: 4, marginBottom: 1 },
  rosterGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  managerCard: { flexGrow: 1, flexBasis: 270, minWidth: 240, padding: 12, borderWidth: 1, borderRadius: 5, gap: 6 },
  managerCardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  managerIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 4 },
  managerCardTitle: { flex: 1, gap: 2 },
  managerName: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.1 },
  managerOwner: { fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 1.1 },
  managerStatus: { fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 15 },
  managerMeta: { fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14 },
  managerGate: { fontFamily: "Inter_600SemiBold", fontSize: 10, lineHeight: 14 },
  openButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 9, marginTop: 2, borderWidth: 1, borderRadius: 3 },
  openButtonText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.1 },
});

function ModePill({ mode, colors }: { mode: AutoManagerMode; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <StatusPill
      label={MODE_LABEL[mode]}
      tone={mode === "act" ? "accent" : mode === "suggest" ? "warning" : "muted"}
      colors={colors}
    />
  );
}

function StatusPill({
  label,
  tone,
  colors,
}: {
  label: string;
  tone: "accent" | "warning" | "muted";
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const color = tone === "accent" ? colors.accent : tone === "warning" ? colors.warning : colors.textMuted;
  return (
    <View style={[styles.modePill, { backgroundColor: color + "18", borderColor: color }]}>
      <Text style={[styles.modePillText, { color }]}>{label}</Text>
    </View>
  );
}

function OpenButton({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.openButton, { borderColor: colors.accent, backgroundColor: colors.accent + "10" }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.openButtonText, { color: colors.accent }]}>{label}</Text>
      <Feather name="arrow-up-right" size={12} color={colors.accent} />
    </Pressable>
  );
}

export default withScreenBoundary(AdvisorBriefingsScreen, "advisor-briefings");

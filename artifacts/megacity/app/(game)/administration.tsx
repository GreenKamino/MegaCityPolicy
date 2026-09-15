import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GameModal from "@/components/GameModal";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  SOFTWARE_UPGRADES,
  ALL_CATEGORIES,
  UPGRADE_CATEGORY_LABELS,
  UPGRADE_CATEGORY_ICONS,
  createDefaultSoftwareUpgradeState,
  getCurrentTier,
  getNextTier,
  getTotalEffects,
  getUpgradesByCategory,
  type UpgradeCategory,
} from "@/engine/softwareUpgrades";
import { formatCredits } from "@/utils/format";

type AdminTab = "officers" | "diplomacy" | "systems";

function AdministrationScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const sw = useSw();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state, installSoftwareUpgrade } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const [activeTab, setActiveTab] = useState<AdminTab>("officers");
  const tabScrollRef = useHorizontalWheelScroll();
  const [expandedCategory, setExpandedCategory] = useState<UpgradeCategory | null>(null);

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: "officers", label: "OFFICERS", icon: "account-tie" },
    { id: "diplomacy", label: "DIPLOMACY", icon: "handshake" },
    { id: "systems", label: "SYSTEMS", icon: "cog" },
  ];

  const officers = state.officers ?? [];
  const appointed = officers.filter(o => o.appointed);
  const vacant = officers.filter(o => !o.appointed);

  const swState = state.softwareUpgrades ?? createDefaultSoftwareUpgradeState();
  const credits = state.resources?.credits ?? 0;
  const unlockedTechs = state.unlockedTechnologies ?? [];

  const handleInstall = (upgradeId: string) => {
    const def = SOFTWARE_UPGRADES.find((u) => u.id === upgradeId);
    if (!def) return;
    const nextTier = getNextTier(swState, upgradeId);
    if (nextTier === null) return;
    const tierDef = def.tiers.find((t) => t.tier === nextTier);
    if (!tierDef) return;
    showModal(
      `INSTALL ${def.name.toUpperCase()} v${nextTier}.0`,
      `${tierDef.description}\n\nCost: ${formatCredits(tierDef.cost)}`,
      [
        { text: "CANCEL", style: "cancel", onPress: hideModal },
        {
          text: "INSTALL",
          style: "destructive",
          onPress: () => {
            hideModal();
            const ok = installSoftwareUpgrade(upgradeId);
            if (!ok) showModal("INSTALLATION FAILED", "Insufficient funds or missing prerequisites.", [{ text: "OK", onPress: hideModal }]);
          },
        },
      ]
    );
  };

  const totalEffects = getTotalEffects(swState);
  const totalUpgrades = swState.totalInstalled;

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={20} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.textSecondary} />
        </Pressable>
        <MaterialCommunityIcons name="shield-crown" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>ADMINISTRATION</Text>
      </View>

      <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
        {tabs.map(tab => (
          <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tab, activeTab === tab.id && styles.tabActive]}>
            <MaterialCommunityIcons name={tab.icon as any} size={14} color={activeTab === tab.id ? Colors.accent : Colors.textMuted} />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {activeTab === "officers" && (
          <View>
            <Text style={styles.sectionLabel}>// OFFICER ROSTER</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}><Text style={styles.statLabel}>APPOINTED</Text><Text style={styles.statValue}>{appointed.length}</Text></View>
              <View style={styles.statBox}><Text style={styles.statLabel}>VACANT</Text><Text style={[styles.statValue, { color: vacant.length > 0 ? Colors.warning : Colors.accent }]}>{vacant.length}</Text></View>
              <View style={styles.statBox}><Text style={styles.statLabel}>TOTAL</Text><Text style={styles.statValue}>{officers.length}</Text></View>
            </View>
            <Pressable style={styles.navBtn} onPress={() => router.push("/(game)/officers" as any)}>
              <MaterialCommunityIcons name="account-tie" size={16} color={Colors.accent} />
              <Text style={styles.navBtnText}>OPEN FULL OFFICER PANEL</Text>
              <Feather name="chevron-right" size={14} color={Colors.textMuted} />
            </Pressable>
            {appointed.length > 0 && (
              <>
                <Text style={styles.subLabel}>APPOINTED OFFICIALS ({appointed.length})</Text>
                {appointed.slice(0, 10).map(off => (
                  <View key={off.id} style={styles.officerCard}>
                    <View><Text style={styles.officerName}>{off.name}</Text><Text style={styles.officerDetail}>{off.department} — {off.rank}</Text></View>
                    <Text style={[styles.officerLoyalty, { color: off.loyalty > 60 ? Colors.accent : Colors.warning }]}>L:{Math.round(off.loyalty)}</Text>
                  </View>
                ))}
                {appointed.length > 10 && <Text style={styles.moreText}>+ {appointed.length - 10} more...</Text>}
              </>
            )}
          </View>
        )}

        {activeTab === "diplomacy" && (
          <View>
            <Text style={styles.sectionLabel}>// DIPLOMATIC RELATIONS</Text>
            <Pressable style={styles.navBtn} onPress={() => router.push("/(game)/diplomacy" as any)}>
              <MaterialCommunityIcons name="handshake" size={16} color={Colors.accent} />
              <Text style={styles.navBtnText}>OPEN FULL DIPLOMACY PANEL</Text>
              <Feather name="chevron-right" size={14} color={Colors.textMuted} />
            </Pressable>
            <Text style={styles.subLabel}>FACTION CONTACTS</Text>
            {state.factions.filter(f => f.isActive).map(f => (
              <View key={f.id} style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{f.name}</Text>
                  {f.leader && <Text style={styles.contactLeader}>{f.leader.name} — {f.leader.title}</Text>}
                  <View style={styles.contactStats}>
                    <Text style={[styles.contactStat, { color: f.loyalty > 50 ? Colors.accent : Colors.warning }]}>LOY: {Math.round(f.loyalty)}</Text>
                    <Text style={[styles.contactStat, { color: f.threat > 50 ? Colors.danger : Colors.accent }]}>THR: {Math.round(f.threat)}</Text>
                    <Text style={styles.contactStat}>INF: {Math.round(f.influence)}</Text>
                  </View>
                </View>
                {f.leader && (
                  <View style={[styles.attitudeBadge, { backgroundColor: f.leader.attitude === "friendly" ? Colors.accent + "30" : f.leader.attitude === "hostile" ? Colors.danger + "30" : Colors.warning + "30" }]}>
                    <Text style={[styles.attitudeText, { color: f.leader.attitude === "friendly" ? Colors.accent : f.leader.attitude === "hostile" ? Colors.danger : Colors.warning }]}>{f.leader.attitude.toUpperCase()}</Text>
                  </View>
                )}
              </View>
            ))}
            <Text style={styles.subLabel}>MEGACITY CONTACTS</Text>
            {state.externalMegacities.filter(m => m.isActive).map(m => (
              <View key={m.id} style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{m.name}</Text>
                  {m.leader && <Text style={styles.contactLeader}>{m.leader.name} — {m.leader.title}</Text>}
                  <View style={styles.contactStats}>
                    <Text style={[styles.contactStat, { color: m.loyalty > 50 ? Colors.accent : Colors.warning }]}>LOY: {Math.round(m.loyalty)}</Text>
                    <Text style={[styles.contactStat, { color: m.threat > 50 ? Colors.danger : Colors.accent }]}>THR: {Math.round(m.threat)}</Text>
                  </View>
                </View>
                {m.leader && (
                  <View style={[styles.attitudeBadge, { backgroundColor: m.leader.attitude === "friendly" ? Colors.accent + "30" : m.leader.attitude === "hostile" ? Colors.danger + "30" : Colors.warning + "30" }]}>
                    <Text style={[styles.attitudeText, { color: m.leader.attitude === "friendly" ? Colors.accent : m.leader.attitude === "hostile" ? Colors.danger : Colors.warning }]}>{m.leader.attitude.toUpperCase()}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {activeTab === "systems" && (
          <View>
            <Text style={styles.sectionLabel}>// CITY SYSTEMS — SOFTWARE UPGRADES</Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>INSTALLED</Text>
                <Text style={styles.statValue}>{totalUpgrades}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>TOTAL SPENT</Text>
                <Text style={styles.statValue}>{formatCredits(swState.totalSpent)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>AVAILABLE</Text>
                <Text style={styles.statValue}>{formatCredits(credits)}</Text>
              </View>
            </View>

            {Object.keys(totalEffects).length > 0 && (
              <View style={sw.effectsSummary}>
                <Text style={sw.effectsTitle}>ACTIVE BONUSES</Text>
                <View style={sw.effectsGrid}>
                  {Object.entries(totalEffects).map(([key, val]) => (
                    <View key={key} style={sw.effectChip}>
                      <Text style={[sw.effectValue, { color: (val as number) >= 0 ? Colors.accent : Colors.danger }]}>
                        {(val as number) >= 0 ? "+" : ""}{val as number}
                      </Text>
                      <Text style={sw.effectLabel}>{key.replace(/([A-Z])/g, " $1").toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {ALL_CATEGORIES.map((cat) => {
              const upgrades = getUpgradesByCategory(cat);
              const isExpanded = expandedCategory === cat;
              const catInstalled = upgrades.filter((u) => getCurrentTier(swState, u.id) > 0).length;
              return (
                <View key={cat} style={sw.categoryCard}>
                  <Pressable onPress={() => setExpandedCategory(isExpanded ? null : cat)} style={sw.categoryHeader}>
                    <View style={sw.categoryLeft}>
                      <MaterialCommunityIcons name={UPGRADE_CATEGORY_ICONS[cat] as any} size={16} color={Colors.accent} />
                      <View>
                        <Text style={sw.categoryName}>{UPGRADE_CATEGORY_LABELS[cat]}</Text>
                        <Text style={sw.categoryCount}>{catInstalled}/{upgrades.length} modules installed</Text>
                      </View>
                    </View>
                    <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={Colors.textMuted} />
                  </Pressable>

                  {isExpanded && upgrades.map((def) => {
                    const currentTier = getCurrentTier(swState, def.id);
                    const nextTier = getNextTier(swState, def.id);
                    const nextTierDef = nextTier ? def.tiers.find((t) => t.tier === nextTier) : null;
                    const currentTierDef = currentTier > 0 ? def.tiers.find((t) => t.tier === currentTier) : null;
                    const isMaxed = nextTier === null;
                    const canAfford = nextTierDef ? credits >= nextTierDef.cost : false;
                    const hasRequiredTech = nextTierDef?.requiredTech ? unlockedTechs.includes(nextTierDef.requiredTech) : true;
                    const canInstall = !isMaxed && canAfford && hasRequiredTech;

                    return (
                      <View key={def.id} style={sw.upgradeCard}>
                        <View style={sw.upgradeHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={sw.upgradeName}>{def.name}</Text>
                            <View style={sw.tierRow}>
                              {def.tiers.map((t) => (
                                <View key={t.tier} style={[sw.tierDot, t.tier <= currentTier ? sw.tierDotActive : sw.tierDotInactive]}>
                                  <Text style={[sw.tierDotText, t.tier <= currentTier && sw.tierDotTextActive]}>v{t.tier}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                          {isMaxed && (
                            <View style={sw.maxBadge}>
                              <Text style={sw.maxText}>MAX</Text>
                            </View>
                          )}
                        </View>

                        {currentTierDef && (
                          <View style={sw.currentInfo}>
                            <Text style={sw.currentLabel}>INSTALLED: v{currentTier}.0</Text>
                            <Text style={sw.currentDesc}>{currentTierDef.description}</Text>
                            <View style={sw.effectsRow}>
                              {Object.entries(currentTierDef.effects).map(([k, v]) => (
                                <Text key={k} style={[sw.effectSmall, { color: (v as number) >= 0 ? Colors.accent : Colors.danger }]}>
                                  {(v as number) >= 0 ? "+" : ""}{v as number} {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                                </Text>
                              ))}
                            </View>
                          </View>
                        )}

                        {nextTierDef && (
                          <View style={sw.nextInfo}>
                            <Text style={sw.nextLabel}>NEXT: v{nextTier}.0 — {formatCredits(nextTierDef.cost)}</Text>
                            <Text style={sw.nextDesc}>{nextTierDef.description}</Text>
                            {nextTierDef.requiredTech && !hasRequiredTech && (
                              <Text style={sw.reqText}>REQUIRES: {nextTierDef.requiredTech.replace(/_/g, " ").toUpperCase()}</Text>
                            )}
                            <View style={sw.effectsRow}>
                              {Object.entries(nextTierDef.effects).map(([k, v]) => (
                                <Text key={k} style={[sw.effectSmall, { color: (v as number) >= 0 ? Colors.accent : Colors.danger }]}>
                                  {(v as number) >= 0 ? "+" : ""}{v as number} {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                                </Text>
                              ))}
                            </View>
                            {canInstall ? (
                              <Pressable onPress={() => handleInstall(def.id)} style={sw.installBtn}>
                                <Feather name="download" size={12} color={Colors.bg} />
                                <Text style={sw.installBtnText}>INSTALL v{nextTier}.0</Text>
                              </Pressable>
                            ) : (
                              <View style={sw.lockedBtn}>
                                <Feather name="lock" size={11} color={Colors.textMuted} />
                                <Text style={sw.lockedText}>{!canAfford ? "INSUFFICIENT FUNDS" : !hasRequiredTech ? "MISSING TECH" : "LOCKED"}</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
            <View style={{ height: 30 }} />
          </View>
        )}

      </ScrollView>
      <GameModal visible={modal.visible} title={modal.title} message={modal.message} buttons={modal.buttons} onDismiss={hideModal} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 7 : 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent, letterSpacing: 1 },
  tabScroll: { maxHeight: 40, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabContent: { paddingHorizontal: 8, gap: 2, alignItems: "center" },
  tab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 6 : 10 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5 },
  tabTextActive: { color: Colors.accent },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 40 },
  sectionLabel: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.info, letterSpacing: 0.5, marginBottom: 12 },
  subLabel: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.textSecondary, letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  statsRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  statBox: { flex: 1, backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 10, alignItems: "center" },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 7, color: Colors.textMuted, letterSpacing: 0.5 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent, marginTop: 4 },
  navBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 12, borderWidth: 1, borderColor: Colors.accent, marginBottom: 12 },
  navBtnText: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.accent, letterSpacing: 0.5 },
  officerCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: Colors.border },
  officerName: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.text },
  officerDetail: { fontFamily: "Inter_400Regular", fontSize: 8, color: Colors.textMuted, marginTop: 1 },
  officerLoyalty: { fontFamily: "Inter_700Bold", fontSize: 11 },
  moreText: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, textAlign: "center", paddingVertical: 8 },
  contactCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  contactInfo: { flex: 1 },
  contactName: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text },
  contactLeader: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.info, marginTop: 2 },
  contactStats: { flexDirection: "row", gap: 10, marginTop: 4 },
  contactStat: { fontFamily: "Inter_500Medium", fontSize: 8, color: Colors.textMuted },
  attitudeBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  attitudeText: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, fontStyle: "italic", paddingVertical: 8 },
}));

const useSw = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  effectsSummary: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.accent, borderRadius: 4, padding: 12, marginBottom: 12 },
  effectsTitle: { fontFamily: "Inter_700Bold", fontSize: 9, color: Colors.accent, letterSpacing: 1.5, marginBottom: 8 },
  effectsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  effectChip: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  effectValue: { fontFamily: "Inter_700Bold", fontSize: 10 },
  effectLabel: { fontFamily: "Inter_500Medium", fontSize: 7, color: Colors.textMuted, letterSpacing: 0.3 },
  categoryCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, marginBottom: 8, overflow: "hidden" },
  categoryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  categoryLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  categoryName: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text, letterSpacing: 0.5 },
  categoryCount: { fontFamily: "Inter_500Medium", fontSize: 8, color: Colors.textMuted, letterSpacing: 0.3, marginTop: 1 },
  upgradeCard: { borderTopWidth: 1, borderTopColor: Colors.border, padding: 12 },
  upgradeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  upgradeName: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text, letterSpacing: 0.3 },
  tierRow: { flexDirection: "row", gap: 4, marginTop: 4 },
  tierDot: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  tierDotActive: { backgroundColor: Colors.accent + "30", borderColor: Colors.accent },
  tierDotInactive: { backgroundColor: Colors.bg, borderColor: Colors.border },
  tierDotText: { fontFamily: "Inter_600SemiBold", fontSize: 7, color: Colors.textMuted, letterSpacing: 0.3 },
  tierDotTextActive: { color: Colors.accent },
  maxBadge: { backgroundColor: Colors.accent + "20", borderWidth: 1, borderColor: Colors.accent, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  maxText: { fontFamily: "Inter_700Bold", fontSize: 8, color: Colors.accent, letterSpacing: 1 },
  currentInfo: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.accent + "40", borderRadius: 3, padding: 8, marginBottom: 6 },
  currentLabel: { fontFamily: "Inter_700Bold", fontSize: 8, color: Colors.accent, letterSpacing: 0.5, marginBottom: 3 },
  currentDesc: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, lineHeight: 13, marginBottom: 4 },
  nextInfo: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, padding: 8 },
  nextLabel: { fontFamily: "Inter_700Bold", fontSize: 8, color: Colors.warning, letterSpacing: 0.5, marginBottom: 3 },
  nextDesc: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, lineHeight: 13, marginBottom: 4 },
  reqText: { fontFamily: "Inter_600SemiBold", fontSize: 8, color: Colors.danger, letterSpacing: 0.5, marginBottom: 4 },
  effectsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  effectSmall: { fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.3 },
  installBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, backgroundColor: Colors.accent, borderRadius: 3, marginTop: 4 },
  installBtnText: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.bg, letterSpacing: 0.5 },
  lockedBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, marginTop: 4 },
  lockedText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5 },
}));

export default withScreenBoundary(AdministrationScreen, "administration");

import { Feather } from "@expo/vector-icons";
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
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import {
  COMPANIES,
  COMPANIES_MAP,
  COMPANY_SECTOR_ICONS,
  isCompanyOperational,
} from "@/engine/companies";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";

const SECTOR_TABS: Array<{ key: string; label: string; icon: string }> = [
  { key: "active", label: "ACTIVE", icon: "check-circle" },
  { key: "energy", label: "ENERGY", icon: "zap" },
  { key: "water", label: "WATER", icon: "droplet" },
  { key: "food", label: "FOOD", icon: "coffee" },
  { key: "construction", label: "BUILD", icon: "home" },
  { key: "manufacturing", label: "MFCT", icon: "settings" },
  { key: "transport", label: "TRANSIT", icon: "truck" },
  { key: "tech", label: "TECH", icon: "cpu" },
  { key: "medical", label: "MEDICAL", icon: "heart" },
  { key: "finance", label: "FINANCE", icon: "dollar-sign" },
  { key: "civic", label: "CIVIC", icon: "users" },
  { key: "quarantined", label: "QUARANTINED", icon: "alert-triangle" },
];

const getTierColors = (Colors: ThemePalette) => ({
  1: Colors.textSecondary,
  2: Colors.warning,
  3: Colors.accent,
});

const TIER_LABELS = { 1: "T1 — SMALL", 2: "T2 — MID", 3: "T3 — MEGA" };

function CompaniesScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const TIER_COLORS = getTierColors(Colors);
  const insets = useSafeAreaInsets();
  const { state, licenseCompany, shutdownCompany } = useGame();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { modal, showModal, hideModal } = useGameModal();

  const [tab, setTab] = useState("active");
  const tabScrollRef = useHorizontalWheelScroll();

  const activeSet = useMemo(
    () => new Set(state.companies.filter(isCompanyOperational).map((c) => c.companyId)),
    [state.companies],
  );
  const quarantinedSet = useMemo(
    () => new Set(state.companies.filter((c) => !isCompanyOperational(c)).map((c) => c.companyId)),
    [state.companies],
  );

  const sectorActiveCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inst of state.companies) {
      if (!isCompanyOperational(inst)) continue;
      const def = COMPANIES_MAP[inst.companyId];
      if (def) counts[def.sector] = (counts[def.sector] ?? 0) + 1;
    }
    return counts;
  }, [state.companies]);

  const districts = state.districts ?? [];
  const districtNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of districts) m.set(d.id, d.name);
    return m;
  }, [districts]);

  const filtered = useMemo(() => {
    if (tab === "active") {
      return COMPANIES.filter((c) => activeSet.has(c.id));
    }
    if (tab === "quarantined") {
      return COMPANIES.filter((c) => quarantinedSet.has(c.id));
    }
    return COMPANIES.filter((c) => c.sector === tab);
  }, [tab, activeSet, quarantinedSet]);

  // Summary stats
  const totals = useMemo(() => {
    let employment = 0;
    let tax = 0;
    let maint = 0;
    for (const inst of state.companies) {
      if (!isCompanyOperational(inst)) continue;
      const def = COMPANIES_MAP[inst.companyId];
      if (!def) continue;
      employment += def.employment;
      tax += def.taxOutput;
      maint += def.maintenanceCost;
    }
    return { employment, tax, maint };
  }, [state.companies]);

  const handleLicense = (companyId: string) => {
    const def = COMPANIES_MAP[companyId];
    if (!def) return;
    if (state.resources.credits < def.licenseCost) {
      showModal(
        "INSUFFICIENT FUNDS",
        `License fee for ${def.name} is ${def.licenseCost.toLocaleString()} credits. Treasury holds ${Math.floor(state.resources.credits).toLocaleString()}. Application held until the shortfall is closed.`,
        [{ text: "OK", style: "cancel" }]
      );
      return;
    }
    if (districts.length === 0) {
      showModal(
        "NO DISTRICTS",
        "No district registered to host operations. Stand up an administrative district before licensing companies.",
        [{ text: "OK", style: "cancel" }]
      );
      return;
    }
    showModal(
      `LICENSE: ${def.name}`,
      `Assign to district:\n\nCost: ${def.licenseCost.toLocaleString()} credits`,
      [
        ...districts.map((d) => ({
          text: d.name,
          onPress: () => {
            const ok = licenseCompany(companyId, d.id);
            if (ok) {
              showModal(
                "CONTRACT SIGNED",
                `${def.name} is now operating in ${d.name}.\n\nCost: ${def.licenseCost.toLocaleString()} credits deducted.`,
                [{ text: "OK", style: "cancel" }]
              );
            } else {
              showModal(
                "LICENSE REJECTED",
                `${d.name} is no longer registered. No credits were deducted and no company record was created.`,
                [{ text: "OK", style: "cancel" }]
              );
            }
          },
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleShutdown = (companyId: string) => {
    const def = COMPANIES_MAP[companyId];
    if (!def) return;
    showModal(
      `TERMINATE: ${def.name}`,
      `Shutting down this company will immediately end all production bonuses and tax output. The license fee is non-refundable. Proceed?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "TERMINATE CONTRACT",
          style: "destructive",
          onPress: () => shutdownCompany(companyId),
        },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="briefcase" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>COMMERCIAL LICENSING</Text>
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <SummaryCell label="OPERATING" value={activeSet.size} color={Colors.accent} />
        <View style={styles.sumDiv} />
        <SummaryCell label="QUARANTINED" value={quarantinedSet.size} color={quarantinedSet.size > 0 ? Colors.warning : Colors.textMuted} />
        <View style={styles.sumDiv} />
        <SummaryCell label="EMPLOYED" value={totals.employment >= 1000 ? `${(totals.employment / 1000).toFixed(0)}k` : totals.employment} color={Colors.text} />
        <View style={styles.sumDiv} />
        <SummaryCell label="TAX/TICK" value={`+${totals.tax.toLocaleString()}`} color={Colors.accent} />
        <View style={styles.sumDiv} />
        <SummaryCell label="MAINT/TICK" value={`-${totals.maint.toLocaleString()}`} color={totals.maint > 0 ? Colors.danger : Colors.textMuted} />
      </View>

      {/* Sector tabs */}
      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === "web"}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContainer}
      >
        {SECTOR_TABS.map((t) => {
          const count = t.key === "active"
            ? state.companies.length
            : sectorActiveCounts[t.key] ?? 0;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabActive]}
            >
              <Feather name={t.icon as any} size={10} color={tab === t.key ? Colors.bg : Colors.textMuted} />
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.label}
                {count > 0 ? ` (${count})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 && (
          <View style={styles.emptyBox}>
            <Feather name="inbox" size={24} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {tab === "active"
                ? "No active licenses on file.\nSelect a sector tab to browse the licensing register."
                : "No companies on file for this sector."}
            </Text>
          </View>
        )}

        {filtered.map((company) => {
          const isActive = activeSet.has(company.id);
          const isQuarantined = quarantinedSet.has(company.id);
          const instance = state.companies.find((c) => c.companyId === company.id);
          const districtName = instance
            ? districtNameById.get(instance.districtId) ?? instance.districtId
            : null;
          const canAfford = state.resources.credits >= company.licenseCost;

          return (
            <View
              key={company.id}
              style={[styles.card, isActive && styles.cardActive]}
            >
              {/* Card header */}
              <View style={styles.cardTop}>
                <View style={styles.cardTitleRow}>
                  <Feather
                    name={COMPANY_SECTOR_ICONS[company.sector] as any}
                    size={14}
                    color={TIER_COLORS[company.tier]}
                  />
                  <Text style={styles.cardName}>{company.name}</Text>
                </View>
                <View style={styles.tierBadge}>
                  <Text style={[styles.tierText, { color: TIER_COLORS[company.tier] }]}>
                    {TIER_LABELS[company.tier]}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardDesc}>{company.description}</Text>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <StatPill label="TAX" value={`+${company.taxOutput}/tick`} color={Colors.accent} />
                <StatPill label="JOBS" value={`${(company.employment / 1000).toFixed(0)}k`} color={Colors.text} />
                <StatPill label="MAINT" value={`${company.maintenanceCost}/tick`} color={Colors.warning} />
                <StatPill
                  label="CORR RISK"
                  value={company.corruptionRisk <= 2 ? "LOW" : company.corruptionRisk <= 5 ? "MED" : "HIGH"}
                  color={company.corruptionRisk <= 2 ? Colors.accent : company.corruptionRisk <= 5 ? Colors.warning : Colors.danger}
                />
              </View>

              {/* Effects */}
              <View style={styles.effectsRow}>
                {Object.entries(company.effects).map(([key, val]) => {
                  if (!val || val === 0) return null;
                  const label = effectLabel(key, val as number);
                  const color = (val as number) > 0 ? Colors.accent : Colors.danger;
                  return (
                    <View key={key} style={styles.effectPill}>
                      <Text style={[styles.effectText, { color }]}>{label}</Text>
                    </View>
                  );
                })}
              </View>

              {/* District & cost */}
              {isActive ? (
                <View style={styles.cardFooter}>
                  <View style={styles.districtTag}>
                    <Feather name="map-pin" size={10} color={Colors.accent} />
                    <Text style={styles.districtText}>{districtName}</Text>
                  </View>
                  <Text style={[styles.districtText, { color: Colors.accent }]}>
                    PAYING +{company.taxOutput}/tick
                  </Text>
                  <Pressable
                    onPress={() => handleShutdown(company.id)}
                    style={styles.shutdownBtn}
                  >
                    <Text style={styles.shutdownText}>TERMINATE</Text>
                  </Pressable>
                </View>
              ) : isQuarantined ? (
                <View style={styles.cardFooter}>
                  <View style={styles.districtTag}>
                    <Feather name="alert-triangle" size={10} color={Colors.warning} />
                    <Text style={[styles.districtText, { color: Colors.warning }]}>
                      QUARANTINED — DISTRICT MISSING
                    </Text>
                  </View>
                  <Text style={styles.quarantineRef}>
                    ORIGINAL ID: {instance?.districtId ?? "UNKNOWN"}
                  </Text>
                  <Pressable
                    onPress={() => handleShutdown(company.id)}
                    style={styles.shutdownBtn}
                  >
                    <Text style={styles.shutdownText}>REMOVE</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.cardFooter}>
                  <Text style={[styles.costText, { color: canAfford ? Colors.accent : Colors.danger }]}>
                    LICENSE: {company.licenseCost.toLocaleString()} cr
                  </Text>
                  <Pressable
                    onPress={() => handleLicense(company.id)}
                    style={[styles.licenseBtn, !canAfford && styles.licenseBtnDisabled]}
                    disabled={!canAfford}
                  >
                    <Text style={[styles.licenseBtnText, !canAfford && { color: Colors.textMuted }]}>
                      {canAfford ? "LICENSE +" : "INSUFFICIENT"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 20 }} />
      </ScrollView>
      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

function effectLabel(key: string, val: number): string {
  const prefix = val > 0 ? "+" : "";
  const map: Record<string, string> = {
    power: `${prefix}${val} MW power`,
    water: `${prefix}${val} water/tick`,
    food: `${prefix}${val} food/tick`,
    steel: `${prefix}${val} steel/tick`,
    goods: `${prefix}${val} goods/tick`,
    fuel: `${prefix}${val} fuel/tick`,
    med: `${prefix}${val} med/tick`,
    trade: `${prefix}${val} trade/tick`,
    research: `${prefix}${val} research`,
    happiness: `${prefix}${val} happiness`,
    crime: `${prefix}${val} crime`,
    stability: `${prefix}${val} stability`,
  };
  return map[key] ?? `${prefix}${val} ${key}`;
}

function SummaryCell({ label, value, color }: { label: string; value: number | string; color: string }) {
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

  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 14 },

  emptyBox: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
  },
  cardActive: {
    borderColor: Colors.accent,
    borderWidth: 1,
    boxShadow: `0 0 4px ${Colors.accent}26`,
  } as any,

  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  cardName: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    flex: 1,
    flexWrap: "wrap",
  },
  tierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.bg,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Colors.borderBright,
    marginLeft: 8,
  },
  tierText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.5,
  },

  cardDesc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },

  statsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 8,
  },

  effectsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 10,
  },
  effectPill: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.borderBright,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  effectText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    marginTop: 2,
  },
  costText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  licenseBtn: {
    backgroundColor: Colors.accentDark,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  licenseBtnDisabled: {
    backgroundColor: Colors.bg,
    borderColor: Colors.border,
  },
  licenseBtnText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  districtTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,255,65,0.06)",
    borderWidth: 1,
    borderColor: Colors.borderBright,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  districtText: {
    color: Colors.accent,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
  quarantineRef: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 0.4,
  },
  shutdownBtn: {
    backgroundColor: "rgba(255,59,48,0.08)",
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  shutdownText: {
    color: Colors.danger,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
}));

export default withScreenBoundary(CompaniesScreen, "companies");

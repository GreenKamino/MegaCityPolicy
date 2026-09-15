import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
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

import GameTabBar from "@/components/GameTabBar";
import SectionHeader from "@/components/SectionHeader";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { formatNumber } from "@/utils/format";
import {
  type ActiveBusiness,
  type BusinessCategory,
  type ClosedBusinessRecord,
  getArchetypeById,
} from "@/engine/independentEnterprises";
import { CORPORATE_CHAINS, getChainById, type ChainFaction } from "@/engine/corporateChains";

type TabId = "overview" | "directory" | "chains" | "history";

const TAB_DEFS = [
  { key: "overview", label: "OVERVIEW", icon: "bar-chart-2" },
  { key: "directory", label: "DIRECTORY", icon: "list" },
  { key: "chains", label: "CHAINS", icon: "briefcase" },
  { key: "history", label: "IN MEMORIAM", icon: "archive" },
];

const FACTION_LABELS: Record<ChainFaction, string> = {
  corps: "MumCorp",
  judges: "The Authority",
  gangs: "Syndicates",
  "helix-commune": "Helix Commune",
  "aureus-dominion": "Aureus Dominion",
  "verdant-enclave": "Verdant Enclave",
  independent: "Independent",
};

const FACTION_COLORS: Record<ChainFaction, string> = {
  corps: "#FF6B35",
  judges: "#4A90E2",
  gangs: "#E94560",
  "helix-commune": "#7DD3C0",
  "aureus-dominion": "#D4AF37",
  "verdant-enclave": "#7CB342",
  independent: "#9E9E9E",
};

const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  food_drink: "Food & Drink",
  nightlife: "Nightlife",
  entertainment: "Entertainment",
  personal_services: "Personal Services",
  repair_utility: "Repair & Utility",
  retail: "Retail",
  fitness_wellness: "Fitness & Wellness",
  transport: "Transport",
  construction: "Construction",
  education_craft: "Education & Craft",
  professional: "Professional",
  grey_market: "Grey Market",
  cultural_faith: "Cultural & Faith",
  media_tech: "Media & Tech",
};

const CLOSURE_REASON_LABELS: Record<string, string> = {
  rent_hike: "Rent hike",
  smog_tax: "Smog tax",
  no_customers: "No customers",
  extortion: "Extortion",
  riot_damage: "Riot damage",
  owner_retirement: "Owner retired",
  MumCorp_competition: "MumCorp competition",
};

type SortMode = "years" | "name" | "district";

function LocalEconomyScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state } = useGameState();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const [tab, setTab] = useState<TabId>("overview");
  const [sort, setSort] = useState<SortMode>("years");
  const [filterCategory, setFilterCategory] = useState<BusinessCategory | "all">("all");
  const filterScrollRef = useHorizontalWheelScroll();

  const econ = state.localEconomy;
  const districts = state.districts ?? [];
  const districtNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of districts) m.set(d.id, d.name);
    return m;
  }, [districts]);

  const businesses: ActiveBusiness[] = econ?.businesses ?? [];
  const closedHistory: ClosedBusinessRecord[] = econ?.closedHistory ?? [];

  const sortedBusinesses = useMemo(() => {
    const filtered = filterCategory === "all"
      ? businesses
      : businesses.filter((b) => getArchetypeById(b.archetypeId)?.category === filterCategory);

    return [...filtered].sort((a, b) => {
      if (sort === "years") return b.yearsActive - a.yearsActive;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "district") {
        const dnA = districtNameById.get(a.districtId) ?? "";
        const dnB = districtNameById.get(b.districtId) ?? "";
        return dnA.localeCompare(dnB);
      }
      return 0;
    });
  }, [businesses, sort, filterCategory, districtNameById]);

  const landmarkCount = useMemo(() => businesses.filter((b) => b.yearsActive >= 10).length, [businesses]);
  const oldestBusiness = useMemo(() => {
    if (businesses.length === 0) return null;
    return businesses.reduce((acc, b) => (b.yearsActive > acc.yearsActive ? b : acc), businesses[0]);
  }, [businesses]);

  const categoryCounts = econ?.totalsByCategory ?? {};
  const categoryEntries = useMemo(() => {
    const entries = Object.entries(categoryCounts) as [BusinessCategory, number][];
    return entries.sort((a, b) => b[1] - a[1]);
  }, [categoryCounts]);

  const recentOpenings = useMemo(() => {
    const cutoff = (state.totalTicks ?? 0) - 96;
    return businesses.filter((b) => b.spawnedAtTick >= cutoff).length;
  }, [businesses, state.totalTicks]);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="storefront-outline" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>LOCAL ECONOMY</Text>
      </View>

      <GameTabBar tabs={TAB_DEFS} active={tab} onSelect={(k) => setTab(k as TabId)} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!econ || (businesses.length === 0 && tab !== "chains") ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="store-clock-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              No independent businesses yet. The city is still warming up — give the simulation a few minutes for
              shopkeepers, repair benches, and corner cafes to start showing up across the districts.
            </Text>
          </View>
        ) : (
          <>
            {tab === "overview" && (
              <>
                <SectionHeader
                  title="Local Economy Snapshot"
                  subtitle="Independent businesses across the city"
                  icon={<Feather name="bar-chart-2" size={14} color={Colors.accent} />}
                />
                <View style={styles.statGrid}>
                  <StatCard label="Independent Businesses" value={formatNumber(businesses.length)} />
                  <StatCard label="Chain Locations" value={formatNumber(econ.totalLocations ?? 0)} />
                  <StatCard label="Total Employees" value={formatNumber(econ.totalEmployees)} />
                  <StatCard
                    label="Tax / Tick"
                    value={`+${formatNumber(Math.round(econ.taxPerTick))} cr`}
                    color={Colors.accent}
                  />
                  <StatCard label="Landmarks (10yr+)" value={formatNumber(landmarkCount)} color={Colors.warning} />
                  <StatCard label="Recent Openings" value={`${recentOpenings} this year`} />
                </View>

                {(econ.chainTaxPerTick ?? 0) > 0 && (
                  <View style={styles.splitCard}>
                    <View style={styles.splitRow}>
                      <Text style={styles.splitLabel}>Indie tax</Text>
                      <Text style={styles.splitValue}>+{formatNumber(Math.round(econ.taxPerTick - (econ.chainTaxPerTick ?? 0)))} cr/tick</Text>
                    </View>
                    <View style={styles.splitRow}>
                      <Text style={styles.splitLabel}>Corporate chain tax</Text>
                      <Text style={[styles.splitValue, { color: Colors.warning }]}>+{formatNumber(Math.round(econ.chainTaxPerTick ?? 0))} cr/tick</Text>
                    </View>
                  </View>
                )}

                {econ.vibrancyBonus > 0 && (
                  <View style={styles.vibrancyCard}>
                    <Feather name="zap" size={14} color={Colors.warning} />
                    <Text style={styles.vibrancyText}>
                      VIBRANT CITY +{(econ.vibrancyBonus * 100).toFixed(1)}% — variety bonus from a thriving indie scene.
                    </Text>
                  </View>
                )}

                {oldestBusiness && oldestBusiness.yearsActive >= 5 && (
                  <>
                    <SectionHeader
                      title="Longest-Running Establishment"
                      icon={<MaterialCommunityIcons name="trophy-outline" size={14} color={Colors.warning} />}
                    />
                    <View style={styles.featureCard}>
                      <Text style={styles.featureName}>{oldestBusiness.name}</Text>
                      <Text style={styles.featureSub}>
                        {getArchetypeById(oldestBusiness.archetypeId)?.displayName ?? "Independent"} ·{" "}
                        {districtNameById.get(oldestBusiness.districtId) ?? "Unknown district"}
                      </Text>
                      <Text style={styles.featureYears}>{oldestBusiness.yearsActive} years in business</Text>
                    </View>
                  </>
                )}

                <SectionHeader
                  title="By Category"
                  icon={<Feather name="grid" size={14} color={Colors.accent} />}
                />
                {categoryEntries.length === 0 ? (
                  <Text style={styles.emptyInline}>No category data yet.</Text>
                ) : (
                  <View style={styles.categoryList}>
                    {categoryEntries.map(([cat, count]) => (
                      <View key={cat} style={styles.categoryRow}>
                        <Text style={styles.categoryName}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                        <Text style={styles.categoryCount}>{count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {tab === "directory" && (
              <>
                <SectionHeader
                  title="Business Directory"
                  subtitle={`${sortedBusinesses.length} of ${businesses.length} listed`}
                  icon={<Feather name="list" size={14} color={Colors.accent} />}
                />

                <View style={styles.controlRow}>
                  <Text style={styles.controlLabel}>SORT</Text>
                  {(["years", "name", "district"] as SortMode[]).map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => setSort(mode)}
                      style={[styles.chip, sort === mode && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, sort === mode && styles.chipTextActive]}>{mode.toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.controlRow}>
                  <Text style={styles.controlLabel}>FILTER</Text>
                  <Pressable
                    onPress={() => setFilterCategory("all")}
                    style={[styles.chip, filterCategory === "all" && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, filterCategory === "all" && styles.chipTextActive]}>ALL</Text>
                  </Pressable>
                </View>
                <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.filterScroll}>
                  {(Object.keys(CATEGORY_LABELS) as BusinessCategory[]).map((cat) => {
                    const count = categoryCounts[cat] ?? 0;
                    if (count === 0) return null;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setFilterCategory(cat)}
                        style={[styles.chip, filterCategory === cat && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, filterCategory === cat && styles.chipTextActive]}>
                          {CATEGORY_LABELS[cat]} ({count})
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {sortedBusinesses.slice(0, 200).map((b) => {
                  const arch = getArchetypeById(b.archetypeId);
                  const districtName = districtNameById.get(b.districtId) ?? "Unknown";
                  return (
                    <View key={b.uid} style={styles.bizRow}>
                      <View style={styles.bizMain}>
                        <Text style={styles.bizName} numberOfLines={1}>
                          {b.name}
                        </Text>
                        <Text style={styles.bizMeta} numberOfLines={1}>
                          {arch?.displayName ?? "Independent"} · {districtName}
                        </Text>
                      </View>
                      <View style={styles.bizStats}>
                        <Text style={[styles.bizStatusTag, statusStyle(b.status, Colors)]}>{b.status.toUpperCase()}</Text>
                        <Text style={styles.bizYears}>
                          {b.yearsActive}y · {b.employees} jobs
                        </Text>
                      </View>
                    </View>
                  );
                })}
                {sortedBusinesses.length > 200 && (
                  <Text style={styles.emptyInline}>
                    Showing first 200 of {sortedBusinesses.length}. Filter by category to narrow further.
                  </Text>
                )}
              </>
            )}

            {tab === "chains" && (
              <>
                <SectionHeader
                  title="Corporate Chains"
                  subtitle={`${CORPORATE_CHAINS.length} chains operating citywide`}
                  icon={<Feather name="briefcase" size={14} color={Colors.accent} />}
                />
                {(econ.corporateChains ?? [])
                  .slice()
                  .sort((a, b) => b.locationCount - a.locationCount)
                  .map((c) => {
                    const def = getChainById(c.chainId);
                    if (!def) return null;
                    const facColor = FACTION_COLORS[def.faction];
                    const pctOfMax = Math.min(1, c.locationCount / def.maxLocations);
                    return (
                      <View key={c.chainId} style={[styles.chainCard, { borderLeftColor: facColor }]}>
                        <View style={styles.chainHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.chainName}>{def.name}</Text>
                            <Text style={styles.chainTagline}>{c.locationCount} ACTIVE LOCATIONS</Text>
                          </View>
                          <View style={[styles.factionTag, { borderColor: facColor }]}>
                            <Text style={[styles.factionText, { color: facColor }]}>{FACTION_LABELS[def.faction]}</Text>
                          </View>
                        </View>
                        <View style={styles.chainStats}>
                          <Text style={styles.chainStatLabel}>
                            {c.locationCount} / {def.maxLocations} locations · {formatNumber(c.locationCount * def.employeesPerLocation)} jobs · +{formatNumber(c.locationCount * def.taxPerLocation)} cr/tick
                          </Text>
                          <View style={styles.chainBarBg}>
                            <View style={[styles.chainBarFill, { width: `${pctOfMax * 100}%`, backgroundColor: facColor }]} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
              </>
            )}

            {tab === "history" && (
              <>
                <SectionHeader
                  title="In Memoriam"
                  subtitle="Recent closures across the city"
                  icon={<Feather name="archive" size={14} color={Colors.danger} />}
                />
                {closedHistory.length === 0 ? (
                  <Text style={styles.emptyInline}>
                    No businesses have closed yet. The simulation hasn't claimed anyone… yet.
                  </Text>
                ) : (
                  closedHistory.slice(0, 60).map((c) => {
                    const arch = getArchetypeById(c.archetypeId);
                    const districtName = districtNameById.get(c.districtId) ?? "Unknown";
                    return (
                      <View key={c.uid} style={styles.bizRow}>
                        <View style={styles.bizMain}>
                          <Text style={[styles.bizName, { color: Colors.textMuted }]} numberOfLines={1}>
                            {c.name}
                          </Text>
                          <Text style={styles.bizMeta} numberOfLines={1}>
                            {arch?.displayName ?? "Independent"} · {districtName}
                          </Text>
                        </View>
                        <View style={styles.bizStats}>
                          <Text style={[styles.bizStatusTag, { color: Colors.danger, borderColor: Colors.danger + "55" }]}>
                            {CLOSURE_REASON_LABELS[c.reason] ?? c.reason}
                          </Text>
                          <Text style={styles.bizYears}>
                            {c.yearsActive > 0 ? `${c.yearsActive}y run` : "short run"}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function statusStyle(status: ActiveBusiness["status"], Colors: ThemePalette) {
  switch (status) {
    case "thriving":
      return { color: Colors.accent, borderColor: Colors.accent + "55" };
    case "stable":
      return { color: Colors.textSecondary, borderColor: Colors.border };
    case "struggling":
      return { color: Colors.warning, borderColor: Colors.warning + "55" };
    case "closing":
      return { color: Colors.danger, borderColor: Colors.danger + "55" };
  }
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
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 20, paddingTop: Platform.OS === "web" ? 8 : 16, paddingBottom: 40 },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 18,
  },
  emptyInline: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 16,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
  },
  statLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  vibrancyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.warning + "55",
    backgroundColor: Colors.warning + "11",
    borderRadius: 6,
    marginBottom: 12,
  },
  vibrancyText: {
    color: Colors.warning,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    flex: 1,
  },
  featureCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.warning + "55",
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  featureName: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginBottom: 2,
  },
  featureSub: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 6,
  },
  featureYears: {
    color: Colors.warning,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  categoryList: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 12,
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  categoryName: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  categoryCount: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  controlLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    marginRight: 4,
  },
  filterScroll: {
    gap: 6,
    paddingBottom: 8,
    paddingRight: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    backgroundColor: Colors.bgCard,
  },
  chipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "22",
  },
  chipText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
  },
  bizRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    marginBottom: 6,
  },
  bizMain: {
    flex: 1,
    minWidth: 0,
  },
  bizName: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginBottom: 2,
  },
  bizMeta: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },
  bizStats: {
    alignItems: "flex-end",
    gap: 3,
  },
  bizStatusTag: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 3,
  },
  bizYears: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
  splitCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  splitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  splitLabel: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  splitValue: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  chainCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
  },
  chainHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  chainName: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    marginBottom: 2,
  },
  chainTagline: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    fontStyle: "italic",
  },
  factionTag: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 3,
  },
  factionText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  chainFlavor: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  chainStats: {
    gap: 4,
  },
  chainStatLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
  chainBarBg: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  chainBarFill: {
    height: 4,
    borderRadius: 2,
  },
}));

export default withScreenBoundary(LocalEconomyScreen, "local-economy");

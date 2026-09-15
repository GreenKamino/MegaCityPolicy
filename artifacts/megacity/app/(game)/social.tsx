import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ResourceRow from "@/components/ResourceRow";
import SectionHeader from "@/components/SectionHeader";
import StatBar from "@/components/StatBar";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { CITY_POLICIES, ALL_POLICIES, POLICY_CATEGORY_LABELS, POLICY_MAP, type PolicyCategory } from "@/engine/policies";
import { isBigBrotherActive } from "@/engine/addons/bigBrother";
import { isSixthDayActive } from "@/engine/addons/sixthDay";
import { TECH_MAP } from "@/engine/technologies";
import { playSound } from "@/engine/audio";
import { playHaptic } from "@/engine/haptics";
import HealthConditionsPanel from "@/components/HealthConditionsPanel";
import CitizenTraitsPanel from "@/components/CitizenTraitsPanel";

type SocialTab = "overview" | "health" | "traits";
const SOCIAL_TABS: { id: SocialTab; label: string; icon: string }[] = [
  { id: "overview", label: "OVERVIEW", icon: "users" },
  { id: "health", label: "HEALTH", icon: "heart" },
  { id: "traits", label: "TRAITS", icon: "user" },
];

const SOCIAL_CATEGORIES: PolicyCategory[] = ["healthSocial", "civilRights", "cultural", "religion", "utopian"];

const EFFECT_LABELS: Record<string, string> = {
  crime: "Crime", unrest: "Unrest", happiness: "Happy", lawOrder: "Law",
  corruption: "Corrupt", employment: "Employ", infrastructureHealth: "Infra",
  defenseRating: "Defense", populationGrowthRate: "Pop Growth",
  taxIncome: "Tax", tradeIncome: "Trade", foodProduction: "Food",
  waterProduction: "Water", powerGeneration: "Power", steelProduction: "Steel",
  goodsProduction: "Goods", fuelProduction: "Fuel", medProduction: "Med",
  researchSpeed: "Research",
};

function formatEffects(effects: Record<string, number | undefined>): string {
  return Object.entries(effects)
    .filter(([, v]) => v !== undefined && v !== 0)
    .map(([k, v]) => {
      const label = EFFECT_LABELS[k] ?? k;
      const sign = (v as number) > 0 ? "+" : "";
      return `${label} ${sign}${v}`;
    })
    .join("  ");
}

function SocialScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const pStyles = usePStyles();
  const insets = useSafeAreaInsets();
  const { state: rawState, togglePolicy, setPolicy, toggleCityPolicy } = useGame();
  const state = useThrottledValue(rawState, 500);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { cityStats: cs, policies: p, buildings: b } = state;
  const activePolicies = state.activePolicies ?? [];
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [socialTab, setSocialTab] = useState<SocialTab>("overview");
  const tabScrollRef = useHorizontalWheelScroll();

  const bbActive = isBigBrotherActive(state.addons);
  const sdActive = isSixthDayActive(state.addons);

  const socialPolicies = useMemo(() => {
    let base = CITY_POLICIES.filter((pol) => SOCIAL_CATEGORIES.includes(pol.category as PolicyCategory));
    if (bbActive) {
      const bbSocial = ALL_POLICIES.filter(
        (pol) => SOCIAL_CATEGORIES.includes(pol.category as PolicyCategory) && !CITY_POLICIES.some((c) => c.id === pol.id)
      );
      base = [...base, ...bbSocial.filter((pol) => !pol.id.startsWith("sd_"))];
    }
    if (sdActive) {
      const sdSocial = ALL_POLICIES.filter(
        (pol) => SOCIAL_CATEGORIES.includes(pol.category as PolicyCategory) && pol.id.startsWith("sd_")
      );
      base = [...base, ...sdSocial];
    }
    const grouped: Record<string, typeof base> = {};
    for (const pol of base) {
      if (!grouped[pol.category]) grouped[pol.category] = [];
      grouped[pol.category].push(pol);
    }
    return grouped;
  }, [bbActive, sdActive]);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="account-group" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>SOCIAL / CIVIC MANAGEMENT</Text>
      </View>

      <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {SOCIAL_TABS.map((tab) => (
          <Pressable key={tab.id} onPress={() => setSocialTab(tab.id)} style={[styles.socTab, socialTab === tab.id && styles.socTabActive]}>
            <Feather name={tab.icon as any} size={11} color={socialTab === tab.id ? Colors.bg : Colors.textMuted} />
            <Text style={[styles.socTabText, socialTab === tab.id && styles.socTabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {socialTab === "health" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <HealthConditionsPanel />
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {socialTab === "traits" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <CitizenTraitsPanel />
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {socialTab === "overview" && (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionHeader title="Population Status" icon={<MaterialCommunityIcons name="account-multiple" size={14} color={Colors.accent} />} />
        <StatBar label="Happiness / Morale" value={cs.happiness} />
        <StatBar label="Unrest Level" value={cs.unrest} invertColor />
        <StatBar label="Employment" value={cs.employment} />
        <StatBar label="Housing Pressure" value={cs.housingPressure} invertColor />

        <SectionHeader title="Information Control" icon={<MaterialCommunityIcons name="broadcast" size={14} color={Colors.accent} />} />
        <SocialRow
          label="PROPAGANDA BROADCASTS"
          sub="Civic Truth Dept. messaging. -1 unrest, +1 happiness/tick"
          active={p.propaganda}
          onToggle={() => togglePolicy("propaganda")}
          cost="Free (requires Propaganda Hubs)"
        />
        <ResourceRow label="Propaganda Hubs" value={b.propagandaHubs} />

        <SectionHeader title="Welfare Rationing" subtitle="Choose one" icon={<MaterialCommunityIcons name="heart-pulse" size={14} color={Colors.accent} />} />
        <WelfareOption
          label="GENEROUS RATIONS"
          sub="+2 happiness, -2 unrest/tick. Higher cost."
          active={p.welfareRationing === "generous"}
          onSelect={() => setPolicy("welfareRationing", "generous")}
          color={Colors.accent}
        />
        <WelfareOption
          label="STANDARD RATIONS"
          sub="Baseline welfare. No modifier."
          active={p.welfareRationing === "normal"}
          onSelect={() => setPolicy("welfareRationing", "normal")}
          color={Colors.info}
        />
        <WelfareOption
          label="CUT RATIONS"
          sub="-2 happiness, +2 unrest. Saves credits."
          active={p.welfareRationing === "cut"}
          onSelect={() => setPolicy("welfareRationing", "cut")}
          color={Colors.danger}
        />

        <SectionHeader title="Mutant Containment Policy" icon={<MaterialCommunityIcons name="alert-circle-outline" size={14} color={Colors.accent} />} />
        <WelfareOption
          label="TOLERATE MUTANTS"
          sub="Reduces faction threat, increases mutation spread."
          active={p.mutantPolicy === "tolerate"}
          onSelect={() => setPolicy("mutantPolicy", "tolerate")}
          color={Colors.info}
        />
        <WelfareOption
          label="CONTAIN MUTANTS"
          sub="Standard policy. Sectors quarantined."
          active={p.mutantPolicy === "contain"}
          onSelect={() => setPolicy("mutantPolicy", "contain")}
          color={Colors.warning}
        />
        <WelfareOption
          label="PURGE MUTANTS"
          sub="Extreme action. High loyalty from enforcers, extreme unrest."
          active={p.mutantPolicy === "purge"}
          onSelect={() => setPolicy("mutantPolicy", "purge")}
          color={Colors.danger}
        />

        <SectionHeader title="Labor Directives" icon={<MaterialCommunityIcons name="hammer-wrench" size={14} color={Colors.accent} />} />
        <SocialRow
          label="FORCED LABOR DIRECTIVE"
          sub="+120 credits/tick from production output. -happiness"
          active={p.laborDirective}
          onToggle={() => togglePolicy("laborDirective")}
          cost="−5 happiness/tick"
          danger
        />

        <SectionHeader
          title="Social & Civic Policies"
          subtitle={`${activePolicies.filter((id) => {
            const pol = POLICY_MAP[id];
            return pol && SOCIAL_CATEGORIES.includes(pol.category as PolicyCategory);
          }).length} active`}
          icon={<Feather name="shield" size={14} color={Colors.accent} />}
        />

        {SOCIAL_CATEGORIES.map((catKey) => {
          const policies = socialPolicies[catKey];
          if (!policies || policies.length === 0) return null;
          const catLabel = POLICY_CATEGORY_LABELS[catKey];
          const activeCount = policies.filter((pol) => activePolicies.includes(pol.id)).length;
          const isExpanded = expandedCats[catKey] ?? false;

          return (
            <View key={catKey} style={pStyles.catBlock}>
              <Pressable
                style={pStyles.catHeaderRow}
                onPress={() => setExpandedCats((prev) => ({ ...prev, [catKey]: !prev[catKey] }))}
              >
                <View style={pStyles.catHeaderLeft}>
                  <Feather name={isExpanded ? "chevron-down" : "chevron-right"} size={14} color={Colors.accent} />
                  <Text style={pStyles.catLabel}>{catLabel}</Text>
                </View>
                <View style={pStyles.catBadge}>
                  <Text style={pStyles.catBadgeText}>
                    {activeCount}/{policies.length}
                  </Text>
                </View>
              </Pressable>
              {isExpanded && policies.map((pol) => {
                const isActive = activePolicies.includes(pol.id);
                const effectSummary = formatEffects(pol.effects);
                const hasPrereq = pol.prerequisites && pol.prerequisites.length > 0;
                const prereqMet = !hasPrereq || pol.prerequisites!.every((t) => state.unlockedTechnologies.includes(t));
                return (
                  <View key={pol.id} style={[pStyles.policyRow, !prereqMet && pStyles.policyLocked]}>
                    <View style={pStyles.policyLeft}>
                      <Text style={[pStyles.policyName, isActive && { color: Colors.accent }]}>{pol.name}</Text>
                      <Text style={pStyles.policyDesc}>{pol.description}</Text>
                      <View style={pStyles.policyMeta}>
                        <Text style={[pStyles.policyCost, pol.costPerTick < 0 && { color: Colors.accent }]}>
                          {pol.costPerTick >= 0 ? `-${pol.costPerTick}` : `+${Math.abs(pol.costPerTick)}`} cr/tick
                        </Text>
                        <Text style={pStyles.policyEffects}>{effectSummary}</Text>
                      </View>
                      {!prereqMet && (
                        <Text style={pStyles.prereqText}>Requires: {pol.prerequisites!.map(id => TECH_MAP[id]?.name ?? id).join(", ")}</Text>
                      )}
                    </View>
                    <Switch
                      value={isActive}
                      onValueChange={() => { if (prereqMet) { toggleCityPolicy(pol.id); playSound("ui_toggle"); playHaptic("light"); } }}
                      disabled={!prereqMet}
                      trackColor={{ false: Colors.border, true: Colors.accentDark }}
                      thumbColor={isActive ? Colors.accent : Colors.textMuted}
                      accessibilityLabel={`Toggle policy ${pol.name}`}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}

        <SectionHeader title="Population Demographics" icon={<MaterialCommunityIcons name="chart-bar" size={14} color={Colors.accent} />} />
        <ResourceRow label="Total Population" value={(cs.population / 1000).toFixed(0) + "k"} />
        <ResourceRow label="Employment Rate" value={`${cs.employment}%`} color={cs.employment > 60 ? Colors.accent : Colors.warning} />
        <ResourceRow label="Mutation Rate (avg)" value={`${Math.round(state.districts.reduce((a, d) => a + d.mutationRate, 0) / state.districts.length)}%`} color={Colors.warning} />

        <View style={{ height: 20 }} />
      </ScrollView>
      )}
    </View>
  );
}

function SocialRow({
  label, sub, active, onToggle, cost, danger = false,
}: {
  label: string; sub: string; active: boolean; onToggle: () => void; cost?: string; danger?: boolean;
}) {
  const { colors: Colors } = useTheme();
  const sStyles = useSStyles();
  return (
    <View style={sStyles.row}>
      <View style={sStyles.left}>
        <Text style={[sStyles.label, danger && active && { color: Colors.danger }]}>{label}</Text>
        <Text style={sStyles.sub}>{sub}</Text>
        {cost && <Text style={[sStyles.cost, danger && { color: Colors.danger + "99" }]}>{cost}</Text>}
      </View>
      <Switch
        value={active}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: danger ? Colors.danger + "66" : Colors.accentDark }}
        thumbColor={active ? (danger ? Colors.danger : Colors.accent) : Colors.textMuted}
        accessibilityLabel={`Toggle ${label}`}
      />
    </View>
  );
}

function WelfareOption({
  label, sub, active, onSelect, color,
}: {
  label: string; sub: string; active: boolean; onSelect: () => void; color: string;
}) {
  const { colors: Colors } = useTheme();
  const wStyles = useWStyles();
  return (
    <View style={[wStyles.row, active && { borderColor: color, backgroundColor: color + "11" }]}>
      <View style={wStyles.indicator}>
        <View style={[wStyles.dot, { backgroundColor: active ? color : Colors.border }]} />
      </View>
      <View style={wStyles.content}>
        <Text style={[wStyles.label, { color: active ? color : Colors.text }]}>{label}</Text>
        <Text style={wStyles.sub}>{sub}</Text>
      </View>
      <MaterialCommunityIcons
        name={active ? "radiobox-marked" : "radiobox-blank"}
        size={20}
        color={active ? color : Colors.textMuted}
        onPress={onSelect}
      />
    </View>
  );
}

const useSStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 2,
  },
  left: { flex: 1, paddingRight: 12 },
  label: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 0.5 },
  sub: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  cost: { color: Colors.warning, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 3 },
}));

const useWStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
    backgroundColor: Colors.bgCard,
  },
  indicator: { width: 24, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  content: { flex: 1, paddingHorizontal: 12 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 0.5 },
  sub: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
}));

const usePStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  catBlock: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    marginBottom: 10,
    overflow: "hidden",
    backgroundColor: Colors.bgCard,
  },
  catHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,255,65,0.04)",
  },
  catHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  catLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
  },
  catBadge: {
    backgroundColor: Colors.accentDark + "44",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catBadgeText: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  policyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border + "66",
  },
  policyLocked: {
    opacity: 0.4,
  },
  policyLeft: {
    flex: 1,
    paddingRight: 12,
  },
  policyName: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  policyDesc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  policyMeta: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    flexWrap: "wrap",
  },
  policyCost: {
    color: Colors.danger,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  policyEffects: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    flexShrink: 1,
  },
  prereqText: {
    color: Colors.warning,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    marginTop: 3,
    fontStyle: "italic",
  },
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
  tabBar: { borderBottomWidth: 1, borderBottomColor: Colors.border, flexGrow: 0 },
  tabBarContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  socTab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  socTabActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  socTabText: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.textMuted, letterSpacing: 0.8 },
  socTabTextActive: { color: Colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 20, paddingTop: Platform.OS === "web" ? 8 : 16, paddingBottom: 20 },
}));

export default withScreenBoundary(SocialScreen, "social");

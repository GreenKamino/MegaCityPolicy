import React, { useState, useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import SectionHeader from "@/components/SectionHeader";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  INTEL_POLICIES, INTEL_POLICY_CATEGORIES, INTEL_POLICY_COLORS,
  INITIAL_SPY_NETWORKS,
  CLANDESTINE_OPS, CLANDESTINE_RISK_COLORS, CLANDESTINE_TYPE_LABELS,
  type IntelPolicyCategory,
} from "@/engine/intelData";

type SubTab = "policies" | "networks" | "clandestine";
const TABS: { id: SubTab; label: string }[] = [
  { id: "policies", label: "INTEL POLICIES" },
  { id: "networks", label: "SPY NETWORKS" },
  { id: "clandestine", label: "CLANDESTINE" },
];

const getStatusColors = (Colors: ThemePalette): Record<string, string> => ({
  establishing: Colors.warning,
  active: Colors.accent,
  compromised: Colors.danger,
  burned: Colors.textMuted,
});

export default function IntelOpsPanel() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const STATUS_COLORS = getStatusColors(Colors);
  const [subTab, setSubTab] = useState<SubTab>("policies");
  const [policyFilter, setPolicyFilter] = useState<IntelPolicyCategory | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const tabScrollRef = useHorizontalWheelScroll();
  const policyFilterScrollRef = useHorizontalWheelScroll();

  const catKeys = Object.keys(INTEL_POLICY_CATEGORIES) as IntelPolicyCategory[];
  const filteredPolicies = useMemo(
    () => policyFilter === "all" ? INTEL_POLICIES : INTEL_POLICIES.filter(p => p.category === policyFilter),
    [policyFilter]
  );

  return (
    <View style={s.root}>
      <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={s.tabRow}>
        {TABS.map(tab => (
          <Pressable key={tab.id} onPress={() => setSubTab(tab.id)} style={[s.tab, subTab === tab.id && s.tabActive]}>
            <Text style={[s.tabText, subTab === tab.id && s.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {subTab === "policies" && (
        <View>
          <SectionHeader
            title="Intelligence Policies"
            subtitle={`${INTEL_POLICIES.length} directives available`}
            icon={<MaterialCommunityIcons name="shield-lock" size={14} color="#00C8FF" />}
          />
          <ScrollView ref={policyFilterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={s.filterRow}>
            <Pressable onPress={() => setPolicyFilter("all")} style={[s.chip, policyFilter === "all" && s.chipActive]}>
              <Text style={[s.chipText, policyFilter === "all" && s.chipTextActive]}>ALL ({INTEL_POLICIES.length})</Text>
            </Pressable>
            {catKeys.map(cat => {
              const count = INTEL_POLICIES.filter(p => p.category === cat).length;
              const color = INTEL_POLICY_COLORS[cat];
              return (
                <Pressable key={cat} onPress={() => setPolicyFilter(policyFilter === cat ? "all" : cat)} style={[s.chip, policyFilter === cat && { borderColor: color, backgroundColor: color + "10" }]}>
                  <Text style={[s.chipText, policyFilter === cat && { color }]}>
                    {INTEL_POLICY_CATEGORIES[cat]} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {filteredPolicies.map(policy => (
            <Pressable
              key={policy.id}
              onPress={() => setExpanded(expanded === policy.id ? null : policy.id)}
              style={[s.card, expanded === policy.id && { borderColor: INTEL_POLICY_COLORS[policy.category] + "60" }]}
            >
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.policyName}>{policy.name}</Text>
                  <Text style={s.policyCat}>{INTEL_POLICY_CATEGORIES[policy.category]}</Text>
                </View>
                <Text style={s.costText}>{policy.cost.toLocaleString()} CR</Text>
              </View>
              {expanded === policy.id && (
                <View style={s.detail}>
                  <Text style={s.desc}>{policy.description}</Text>
                  <View style={s.effectBox}>
                    <Text style={s.effectLabel}>EFFECT</Text>
                    <Text style={[s.effectVal, { color: INTEL_POLICY_COLORS[policy.category] }]}>{policy.effect}</Text>
                  </View>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {subTab === "networks" && (
        <View>
          <SectionHeader
            title="Spy Networks"
            subtitle={`${INITIAL_SPY_NETWORKS.length} networks established`}
            icon={<MaterialCommunityIcons name="web" size={14} color={Colors.accent} />}
          />
          {INITIAL_SPY_NETWORKS.map(net => (
            <Pressable
              key={net.id}
              onPress={() => setExpanded(expanded === net.id ? null : net.id)}
              style={[s.card, expanded === net.id && s.cardActive]}
            >
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.policyName}>{net.name}</Text>
                  <Text style={s.policyCat}>Target: {net.targetId} ({net.targetType})</Text>
                </View>
                <View style={[s.statusBadge, { borderColor: STATUS_COLORS[net.status] }]}>
                  <Text style={[s.statusText, { color: STATUS_COLORS[net.status] }]}>{net.status.toUpperCase()}</Text>
                </View>
              </View>
              {expanded === net.id && (
                <View style={s.detail}>
                  <View style={s.statRow}>
                    <View style={s.stat}>
                      <Text style={s.statLabel}>AGENTS</Text>
                      <Text style={s.statVal}>{net.agents}/{net.maxAgents}</Text>
                    </View>
                    <View style={s.stat}>
                      <Text style={s.statLabel}>COVER</Text>
                      <Text style={s.statVal}>{net.coverStrength}%</Text>
                    </View>
                    <View style={s.stat}>
                      <Text style={s.statLabel}>INTEL</Text>
                      <Text style={s.statVal}>{net.intelGathered}</Text>
                    </View>
                    <View style={s.stat}>
                      <Text style={s.statLabel}>COST/TICK</Text>
                      <Text style={[s.statVal, { color: Colors.warning }]}>{net.costPerTick} CR</Text>
                    </View>
                  </View>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {subTab === "clandestine" && (
        <View>
          <SectionHeader
            title="Clandestine Operations"
            subtitle={`${CLANDESTINE_OPS.length} classified missions`}
            icon={<MaterialCommunityIcons name="eye-off" size={14} color="#FF6B6B" />}
          />
          {CLANDESTINE_OPS.map(op => (
            <Pressable
              key={op.id}
              onPress={() => setExpanded(expanded === op.id ? null : op.id)}
              style={[s.card, expanded === op.id && s.cardActive]}
            >
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.policyName}>{op.name}</Text>
                  <Text style={s.policyCat}>{CLANDESTINE_TYPE_LABELS[op.type] ?? op.type}</Text>
                </View>
                <View style={s.cardRight}>
                  <Text style={s.costText}>{op.cost.toLocaleString()} CR</Text>
                  <View style={[s.riskBadge, { borderColor: CLANDESTINE_RISK_COLORS[op.riskLevel] }]}>
                    <Text style={[s.riskText, { color: CLANDESTINE_RISK_COLORS[op.riskLevel] }]}>{op.riskLevel.toUpperCase()}</Text>
                  </View>
                </View>
              </View>
              {expanded === op.id && (
                <View style={s.detail}>
                  <Text style={s.desc}>{op.description}</Text>
                  <View style={s.statRow}>
                    <View style={s.stat}>
                      <Text style={s.statLabel}>COST</Text>
                      <Text style={s.statVal}>{op.cost.toLocaleString()} CR</Text>
                    </View>
                    <View style={s.stat}>
                      <Text style={s.statLabel}>SUCCESS</Text>
                      <Text style={[s.statVal, { color: op.successBase >= 60 ? Colors.accent : Colors.warning }]}>{op.successBase}%</Text>
                    </View>
                    <View style={s.stat}>
                      <Text style={s.statLabel}>REWARD</Text>
                      <Text style={[s.statVal, { color: "#4FC3F7" }]}>{op.reward}</Text>
                    </View>
                  </View>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { paddingBottom: 16 },
  tabRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  tabActive: { borderColor: "#00C8FF", backgroundColor: "rgba(0,200,255,0.08)" },
  tabText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 },
  tabTextActive: { color: "#00C8FF" },
  filterRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard, flexDirection: "row", alignItems: "center", gap: 4 },
  chipActive: { borderColor: "#00C8FF", backgroundColor: "rgba(0,200,255,0.06)" },
  chipText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.6 },
  chipTextActive: { color: "#00C8FF" },
  card: { marginHorizontal: 16, marginBottom: 6, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12 },
  cardActive: { borderColor: "#00C8FF60" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardRight: { alignItems: "flex-end" },
  policyName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12 },
  policyCat: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, marginTop: 2, letterSpacing: 0.6 },
  costText: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 12 },
  statusBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 1 },
  statusText: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.8 },
  riskBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, marginTop: 3 },
  riskText: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.8 },
  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  desc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  effectBox: { marginTop: 8 },
  effectLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8 },
  effectVal: { fontFamily: "Inter_700Bold", fontSize: 12, marginTop: 2 },
  statRow: { flexDirection: "row", marginTop: 10, gap: 8 },
  stat: { flex: 1 },
  statLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.6 },
  statVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11, marginTop: 2 },
}));

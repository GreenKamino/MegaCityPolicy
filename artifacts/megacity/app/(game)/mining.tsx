import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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
  MINING_SITES, MINING_VEHICLES, MINING_JOBS, MINING_POLICIES,
  MINERAL_LABELS, MINERAL_COLORS, SURVEY_OUTCOMES,
  type MineralType, type MiningSiteDef,
} from "@/engine/miningData";
import type { MiningEvent, MiningOperation } from "@/engine/types";

type MiningTab = "overview" | "sites" | "fleet" | "events" | "policies";

const TABS: { id: MiningTab; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "sites", label: "SITES" },
  { id: "fleet", label: "FLEET & CREW" },
  { id: "events", label: "EVENTS" },
  { id: "policies", label: "POLICIES" },
];

const RESOURCE_FILTERS: (MineralType | "all")[] = ["all", "gas", "oil", "iron", "copper", "titanium", "uranium", "lithium", "rare-earth"];

function autoFillSite(): { vehicles: Record<string, number>; hiredJobs: Record<string, number> } {
  const vehicles: Record<string, number> = {};
  MINING_VEHICLES.forEach(v => { vehicles[v.id] = 1; });
  const hiredJobs: Record<string, number> = {};
  MINING_JOBS.forEach(j => { hiredJobs[j.id] = 1; });
  return { vehicles, hiredJobs };
}

function MiningScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state, setState } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const [activeTab, setActiveTab] = useState<MiningTab>("overview");
  const [resourceFilter, setResourceFilter] = useState<MineralType | "all">("all");
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const tabScrollRef = useHorizontalWheelScroll();
  const resourceFilterScrollRef = useHorizontalWheelScroll();
  const activePolicies = useMemo(() => new Set(state.activeMiningPolicies ?? []), [state.activeMiningPolicies]);

  const operations: MiningOperation[] = state.miningOperations ?? [];
  const activeOps = useMemo(() => operations.filter(o => o.active), [operations]);
  const { totalWorkers, totalVehicles, totalOutput } = useMemo(() => {
    let workers = 0;
    let vehicles = 0;
    let output = 0;
    for (const o of operations) {
      for (const v of Object.values(o.hiredJobs ?? {})) workers += v;
      for (const v of Object.values(o.vehicles ?? {})) vehicles += v;
      if (o.active) output += o.output;
    }
    return { totalWorkers: workers, totalVehicles: vehicles, totalOutput: output };
  }, [operations]);

  const outputByType: Partial<Record<MineralType, number>> = {};
  activeOps.forEach(o => {
    outputByType[o.resourceType] = (outputByType[o.resourceType] ?? 0) + o.output;
  });

  const activateSite = (site: MiningSiteDef) => {
    if (state.resources.credits < site.setupCost) {
      showModal("INSUFFICIENT FUNDS", `Need ${site.setupCost.toLocaleString()} credits to establish ${site.name}.`, [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    const exists = operations.find(o => o.id === site.id);
    if (exists) {
      showModal("ALREADY EXISTS", `${site.name} is already established.`, [{ text: "OK", style: "default" }]);
      return;
    }
    const vehCount = MINING_VEHICLES.length;
    const jobCount = MINING_JOBS.length;
    showModal(
      `ESTABLISH ${site.name.toUpperCase()}`,
      `Cost: ${site.setupCost.toLocaleString()} CR\nWorkers: ${site.workersNeeded}\nBase Output: ${site.baseOutput}/tick\nDeposit: ${site.depositSize.toLocaleString()} units\n\nIncludes ${vehCount} vehicles and ${jobCount} crew members.\n\n${site.description}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "ESTABLISH", style: "destructive", onPress: () => {
            setState((prev) => {
              const fill = autoFillSite();
              const newOp: MiningOperation = {
                id: site.id,
                resourceType: site.resourceType,
                name: site.name,
                output: site.baseOutput,
                workers: site.workersNeeded,
                efficiency: 100,
                depletionRate: 0.1,
                remainingDeposit: site.depositSize,
                active: true,
                vehicles: fill.vehicles,
                hiredJobs: fill.hiredJobs,
              };
              return {
                ...prev,
                resources: { ...prev.resources, credits: prev.resources.credits - site.setupCost },
                miningOperations: [...(prev.miningOperations ?? []), newOp],
              };
            });
          },
        },
      ]
    );
  };

  const toggleOperation = (opId: string) => {
    setState((prev) => ({
      ...prev,
      miningOperations: (prev.miningOperations ?? []).map((o: MiningOperation) =>
        o.id === opId ? { ...o, active: !o.active } : o
      ),
    }));
  };

  const togglePolicy = (policyId: string) => {
    const policy = MINING_POLICIES.find(p => p.id === policyId);
    if (!policy) return;
    if (!activePolicies.has(policyId) && policy.cost > 0 && state.resources.credits < policy.cost) {
      showModal("INSUFFICIENT FUNDS", `Need ${policy.cost.toLocaleString()} credits.`, [{ text: "OK", style: "default" }]);
      return;
    }
    setState((prev) => {
      const current = new Set(prev.activeMiningPolicies ?? []);
      const isActivating = !current.has(policyId);
      if (isActivating) { current.add(policyId); } else { current.delete(policyId); }
      const creditDelta = isActivating && policy.cost > 0 ? -policy.cost : 0;
      return {
        ...prev,
        activeMiningPolicies: Array.from(current),
        resources: { ...prev.resources, credits: prev.resources.credits + creditDelta },
      };
    });
  };

  const miningEvents: MiningEvent[] = state.miningEvents ?? [];
  const SURVEY_COST = 1500;

  const handleSurvey = (op: MiningOperation) => {
    if (state.resources.credits < SURVEY_COST) {
      showModal("INSUFFICIENT FUNDS", `Survey requires ${SURVEY_COST.toLocaleString()} credits.`, [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    const result = SURVEY_OUTCOMES[Math.floor(Math.random() * SURVEY_OUTCOMES.length)];
    setState((prev) => {
      const newOps = (prev.miningOperations ?? []).map((o: MiningOperation) => {
        if (o.id !== op.id) return o;
        let updated = { ...o, surveyed: true };
        if (result.effects.depositBonus) updated.remainingDeposit += result.effects.depositBonus;
        if (result.effects.efficiencyDelta) updated.efficiency = Math.max(10, Math.min(200, updated.efficiency + result.effects.efficiencyDelta));
        if (result.effects.outputBonus) updated.output += result.effects.outputBonus;
        return updated;
      });
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits - SURVEY_COST + (result.effects.creditsDelta ?? 0) },
        miningOperations: newOps,
      };
    });
    showModal(result.title, `${op.name}\n\n${result.description}`, [{ text: "ACKNOWLEDGED", style: "default" }]);
  };

  const filteredSites = resourceFilter === "all"
    ? MINING_SITES
    : MINING_SITES.filter(s => s.resourceType === resourceFilter);

  const renderTabs = () => (
    <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
      {TABS.map(t => (
        <Pressable key={t.id} onPress={() => setActiveTab(t.id)} style={[styles.tab, activeTab === t.id && styles.tabActive]}>
          <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>{t.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const renderOverview = () => (
    <View>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>ACTIVE SITES</Text>
          <Text style={styles.statValue}>{activeOps.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>TOTAL CREW</Text>
          <Text style={styles.statValue}>{totalWorkers}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>TOTAL VEHICLES</Text>
          <Text style={styles.statValue}>{totalVehicles}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>OUTPUT/TICK</Text>
          <Text style={styles.statValue}>{totalOutput.toLocaleString()}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>PRODUCTION BY RESOURCE</Text>
      {(Object.keys(MINERAL_LABELS) as MineralType[]).map(type => {
        const output = outputByType[type] ?? 0;
        const siteCount = operations.filter(o => o.resourceType === type).length;
        return (
          <View key={type} style={styles.resourceRow}>
            <View style={[styles.resourceDot, { backgroundColor: MINERAL_COLORS[type] }]} />
            <Text style={styles.resourceName}>{MINERAL_LABELS[type]}</Text>
            <Text style={styles.resourceStat}>{siteCount} sites</Text>
            <Text style={[styles.resourceOutput, { color: output > 0 ? Colors.accent : Colors.textMuted }]}>
              {output > 0 ? `+${output}/tick` : "—"}
            </Text>
          </View>
        );
      })}

      {activeOps.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>ACTIVE OPERATIONS</Text>
          {activeOps.map(op => {
            const vCount = Object.values(op.vehicles ?? {}).reduce((a, c) => a + c, 0);
            const jCount = Object.values(op.hiredJobs ?? {}).reduce((a, c) => a + c, 0);
            const siteDef = MINING_SITES.find(s => s.id === op.id);
            const initialDeposit = siteDef?.depositSize ?? Math.max(op.remainingDeposit, 1);
            const depletionPct = Math.max(0, Math.min(100, (op.remainingDeposit / initialDeposit) * 100));
            const ticksUntilDepleted = op.depletionRate > 0 ? Math.ceil(op.remainingDeposit / op.depletionRate) : null;
            const depletionColor = depletionPct > 60 ? Colors.accent : depletionPct > 25 ? Colors.warning : Colors.danger;
            return (
              <Pressable key={op.id} onPress={() => toggleOperation(op.id)} style={styles.opCard}>
                <View style={styles.opHeader}>
                  <View style={[styles.resourceDot, { backgroundColor: MINERAL_COLORS[op.resourceType] }]} />
                  <Text style={styles.opName}>{op.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: Colors.accent + "22" }]}>
                    <Text style={[styles.statusText, { color: Colors.accent }]}>ACTIVE</Text>
                  </View>
                </View>
                <View style={styles.opStats}>
                  <Text style={styles.opStat}>Output: {op.output}/tick</Text>
                  <Text style={styles.opStat}>Vehicles: {vCount}</Text>
                  <Text style={styles.opStat}>Crew: {jCount}</Text>
                  <Text style={styles.opStat}>Deposit: {op.remainingDeposit.toLocaleString()}</Text>
                </View>
                <View style={styles.depletionRow}>
                  <View style={styles.depletionBarOuter}>
                    <View style={[styles.depletionBarInner, { width: `${depletionPct}%`, backgroundColor: depletionColor }]} />
                  </View>
                  <Text style={[styles.depletionLabel, { color: depletionColor }]}>
                    {depletionPct.toFixed(0)}%{ticksUntilDepleted !== null ? ` — ~${ticksUntilDepleted}t left` : ""}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );

  const renderSiteDetail = (op: MiningOperation) => {
    const vCount = Object.values(op.vehicles ?? {}).reduce((a, c) => a + c, 0);
    const jCount = Object.values(op.hiredJobs ?? {}).reduce((a, c) => a + c, 0);
    return (
      <View style={styles.detailContainer}>
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>
            <MaterialCommunityIcons name="truck" size={11} color={Colors.info} /> VEHICLES ({vCount})
          </Text>
          {MINING_VEHICLES.map(v => {
            const count = (op.vehicles ?? {})[v.id] ?? 0;
            return (
              <View key={v.id} style={styles.detailRow}>
                <Text style={styles.detailName}>{v.name}</Text>
                <Text style={[styles.detailCount, { color: count > 0 ? Colors.accent : Colors.textMuted }]}>{count}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>
            <Feather name="users" size={11} color={Colors.info} /> CREW ROSTER ({jCount})
          </Text>
          {MINING_JOBS.map(j => {
            const count = (op.hiredJobs ?? {})[j.id] ?? 0;
            return (
              <View key={j.id} style={styles.detailRow}>
                <Text style={styles.detailName}>{j.name}</Text>
                <Text style={styles.detailWage}>{j.wage} CR/tick</Text>
                <Text style={[styles.detailCount, { color: count > 0 ? Colors.accent : Colors.textMuted }]}>{count}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.detailActions}>
          {!op.surveyed && (
            <Pressable onPress={() => handleSurvey(op)} style={[styles.actionBtn, { backgroundColor: Colors.info }]}>
              <Text style={styles.actionBtnText}>SURVEY — {SURVEY_COST.toLocaleString()} CR</Text>
            </Pressable>
          )}
          {op.surveyed && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.info + "22", marginBottom: 6 }]}>
              <Text style={[styles.statusText, { color: Colors.info }]}>SURVEYED</Text>
            </View>
          )}
          {op.shutdownUntilTick && state.totalTicks < op.shutdownUntilTick && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.danger + "22", marginBottom: 6 }]}>
              <Text style={[styles.statusText, { color: Colors.danger }]}>SHUTDOWN — {op.shutdownUntilTick - state.totalTicks} ticks remaining</Text>
            </View>
          )}
          <Pressable onPress={() => toggleOperation(op.id)} style={[styles.actionBtn, op.active ? styles.actionBtnDanger : styles.actionBtnGreen]}>
            <Text style={styles.actionBtnText}>{op.active ? "SUSPEND" : "ACTIVATE"}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderSites = () => (
    <View>
      <ScrollView ref={resourceFilterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
        {RESOURCE_FILTERS.map(f => (
          <Pressable key={f} onPress={() => setResourceFilter(f)} style={[styles.filterChip, resourceFilter === f && styles.filterChipActive]}>
            {f !== "all" && <View style={[styles.filterDot, { backgroundColor: MINERAL_COLORS[f] }]} />}
            <Text style={[styles.filterText, resourceFilter === f && styles.filterTextActive]}>
              {f === "all" ? "ALL" : MINERAL_LABELS[f].toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filteredSites.map(site => {
        const op = operations.find(o => o.id === site.id);
        const isExpanded = expandedSite === site.id && !!op;
        const vCount = op ? Object.values(op.vehicles ?? {}).reduce((a, c) => a + c, 0) : 0;
        const jCount = op ? Object.values(op.hiredJobs ?? {}).reduce((a, c) => a + c, 0) : 0;
        return (
          <Pressable
            key={site.id}
            onPress={() => op ? setExpandedSite(isExpanded ? null : site.id) : activateSite(site)}
            style={[styles.siteCard, op && styles.siteCardEstablished]}
          >
            <View style={styles.siteHeader}>
              <View style={[styles.resourceDot, { backgroundColor: MINERAL_COLORS[site.resourceType] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.siteName}>{site.name}</Text>
                <Text style={styles.siteType}>{MINERAL_LABELS[site.resourceType]}</Text>
              </View>
              {op ? (
                <View style={[styles.statusBadge, { backgroundColor: op.active ? Colors.accent + "22" : Colors.warning + "22" }]}>
                  <Text style={[styles.statusText, { color: op.active ? Colors.accent : Colors.warning }]}>{op.active ? "ACTIVE" : "SUSPENDED"}</Text>
                </View>
              ) : (
                <Text style={styles.siteCost}>{site.setupCost.toLocaleString()} CR</Text>
              )}
            </View>
            <Text style={styles.siteDesc}>{site.description}</Text>
            <View style={styles.siteStats}>
              <Text style={styles.siteStat}>Output: {site.baseOutput}/tick</Text>
              <Text style={styles.siteStat}>Workers: {site.workersNeeded}</Text>
              <Text style={styles.siteStat}>Deposit: {(op?.remainingDeposit ?? site.depositSize).toLocaleString()}</Text>
            </View>
            {op && (
              <View style={styles.siteQuickStats}>
                <Text style={styles.siteQuickStat}>
                  <MaterialCommunityIcons name="truck" size={10} color={Colors.info} /> {vCount} vehicles
                </Text>
                <Text style={styles.siteQuickStat}>
                  <Feather name="users" size={10} color={Colors.info} /> {jCount} crew
                </Text>
                <Text style={[styles.siteQuickStat, { color: Colors.accent }]}>
                  {isExpanded ? "▲ COLLAPSE" : "▼ DETAILS"}
                </Text>
              </View>
            )}
            {isExpanded && op && renderSiteDetail(op)}
          </Pressable>
        );
      })}
    </View>
  );

  const renderFleet = () => {
    const globalVehicles: Record<string, number> = {};
    const globalJobs: Record<string, number> = {};
    operations.forEach(op => {
      MINING_VEHICLES.forEach(v => {
        globalVehicles[v.id] = (globalVehicles[v.id] ?? 0) + ((op.vehicles ?? {})[v.id] ?? 0);
      });
      MINING_JOBS.forEach(j => {
        globalJobs[j.id] = (globalJobs[j.id] ?? 0) + ((op.hiredJobs ?? {})[j.id] ?? 0);
      });
    });

    return (
      <View>
        <Text style={styles.sectionTitle}>VEHICLE FLEET — {totalVehicles} TOTAL</Text>
        {MINING_VEHICLES.map(v => {
          const total = globalVehicles[v.id] ?? 0;
          return (
            <View key={v.id} style={styles.fleetCard}>
              <View style={styles.fleetHeader}>
                <MaterialCommunityIcons name="truck" size={16} color={Colors.accent} />
                <Text style={styles.fleetName}>{v.name}</Text>
                <Text style={[styles.fleetCount, { color: total > 0 ? Colors.accent : Colors.textMuted }]}>{total}</Text>
              </View>
              <Text style={styles.fleetDesc}>{v.description}</Text>
              <Text style={styles.fleetEffect}>Efficiency: +{v.efficiency}% | Cost: {v.cost.toLocaleString()} CR</Text>
              {total > 0 && (
                <View style={styles.fleetBreakdown}>
                  {operations.filter(op => ((op.vehicles ?? {})[v.id] ?? 0) > 0).map(op => (
                    <Text key={op.id} style={styles.fleetSiteStat}>
                      {op.name}: {(op.vehicles ?? {})[v.id]}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>CREW ROSTER — {totalWorkers} TOTAL</Text>
        {MINING_JOBS.map(j => {
          const total = globalJobs[j.id] ?? 0;
          return (
            <View key={j.id} style={styles.fleetCard}>
              <View style={styles.fleetHeader}>
                <Feather name="user" size={14} color={Colors.accent} />
                <Text style={styles.fleetName}>{j.name}</Text>
                <Text style={[styles.fleetCount, { color: total > 0 ? Colors.accent : Colors.textMuted }]}>{total}</Text>
              </View>
              <Text style={styles.fleetDesc}>{j.description}</Text>
              <Text style={styles.fleetEffect}>Skill: {j.skill.replace("_", " ").toUpperCase()} | Wage: {j.wage} CR/tick</Text>
              {total > 0 && (
                <View style={styles.fleetBreakdown}>
                  {operations.filter(op => ((op.hiredJobs ?? {})[j.id] ?? 0) > 0).map(op => (
                    <Text key={op.id} style={styles.fleetSiteStat}>
                      {op.name}: {(op.hiredJobs ?? {})[j.id]}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderPolicies = () => (
    <View>
      {MINING_POLICIES.map(p => {
        const active = activePolicies.has(p.id);
        return (
          <Pressable key={p.id} onPress={() => togglePolicy(p.id)} style={[styles.policyCard, active && styles.policyCardActive]}>
            <View style={styles.policyHeader}>
              <View style={[styles.policyDot, { backgroundColor: active ? Colors.accent : Colors.textMuted }]} />
              <Text style={styles.policyName}>{p.name}</Text>
              {p.cost > 0 && <Text style={styles.policyCost}>{p.cost.toLocaleString()} CR</Text>}
            </View>
            <Text style={styles.policyDesc}>{p.description}</Text>
            <Text style={[styles.policyEffect, { color: active ? Colors.accent : Colors.info }]}>{p.effect}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const SEVERITY_COLORS: Record<string, string> = { positive: "#4CAF50", neutral: Colors.info, negative: "#FF9800", critical: "#F44336" };

  const renderEvents = () => (
    <View>
      <Text style={styles.sectionTitle}>MINING INCIDENT LOG ({miningEvents.length})</Text>
      {miningEvents.length === 0 && (
        <View style={styles.opCard}>
          <Text style={[styles.opStat, { textAlign: "center", paddingVertical: 20 }]}>No mining events recorded. Establish and operate mines to generate activity.</Text>
        </View>
      )}
      {miningEvents.map(evt => {
        const color = SEVERITY_COLORS[evt.severity] ?? Colors.textMuted;
        return (
          <View key={evt.id} style={[styles.opCard, { borderLeftWidth: 3, borderLeftColor: color }]}>
            <View style={styles.opHeader}>
              <MaterialCommunityIcons
                name={evt.severity === "positive" ? "arrow-up-bold" : evt.severity === "critical" ? "alert-octagon" : evt.severity === "negative" ? "alert" : "information"}
                size={14}
                color={color}
              />
              <Text style={[styles.opName, { color }]}>{evt.type.replace(/_/g, " ").toUpperCase()}</Text>
              <View style={[styles.statusBadge, { backgroundColor: color + "22" }]}>
                <Text style={[styles.statusText, { color }]}>{evt.severity.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={[styles.opStat, { marginTop: 4 }]}>{evt.operationName}</Text>
            <Text style={[styles.opStat, { marginTop: 4 }]}>STATUS: {evt.resolved ? "RESOLVED" : "RECORDED"}</Text>
            <Text style={[styles.opStat, { marginTop: 4, fontStyle: "italic" }]}>Tick {evt.tick}</Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <MaterialCommunityIcons name="pickaxe" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>MINING & EXTRACTION</Text>
      </View>

      {renderTabs()}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {activeTab === "overview" && renderOverview()}
        {activeTab === "sites" && renderSites()}
        {activeTab === "fleet" && renderFleet()}
        {activeTab === "events" && renderEvents()}
        {activeTab === "policies" && renderPolicies()}
      </ScrollView>

      <GameModal visible={modal.visible} title={modal.title} message={modal.message} buttons={modal.buttons} onDismiss={hideModal} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8 },
  backBtn: { marginRight: 4 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent, letterSpacing: 1 },
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent: { paddingHorizontal: Platform.OS === "web" ? 8 : 12, paddingVertical: Platform.OS === "web" ? 4 : 0, gap: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 10 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5 },
  tabTextActive: { color: Colors.accent },
  body: { flex: 1 },
  bodyContent: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 40 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: Platform.OS === "web" ? 10 : 16 },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: Platform.OS === "web" ? 10 : 12 },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 8, color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.accent },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.info, letterSpacing: 0.5, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 4 },
  resourceRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border + "44", gap: 8 },
  resourceDot: { width: 8, height: 8, borderRadius: 4 },
  resourceName: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text, flex: 1 },
  resourceStat: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },
  resourceOutput: { fontFamily: "Inter_700Bold", fontSize: 12, minWidth: 80, textAlign: "right" },
  opCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  opHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  opName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
  opStats: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  depletionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  depletionBarOuter: { flex: 1, height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  depletionBarInner: { height: "100%", borderRadius: 3 },
  depletionLabel: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5, minWidth: 90, textAlign: "right" },
  opStat: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },
  filterBar: { flexGrow: 0, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 12 },
  filterBarContent: { paddingHorizontal: 8, gap: 6 },
  filterChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  filterChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  filterDot: { width: 6, height: 6, borderRadius: 3 },
  filterText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: Colors.textMuted },
  filterTextActive: { color: Colors.accent },
  siteCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  siteCardEstablished: { borderColor: Colors.accent + "44", backgroundColor: Colors.accent + "08" },
  siteHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  siteName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text },
  siteType: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted },
  siteCost: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.warning },
  siteDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 6 },
  siteStats: { flexDirection: "row", gap: 12 },
  siteStat: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },
  siteQuickStats: { flexDirection: "row", gap: 12, marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border + "44" },
  siteQuickStat: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.info },
  detailContainer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  detailSection: { marginBottom: 12 },
  detailSectionTitle: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.info, letterSpacing: 0.5, marginBottom: 6 },
  detailRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + "33" },
  detailName: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text, flex: 1 },
  detailWage: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, marginRight: 10 },
  detailCount: { fontFamily: "Inter_700Bold", fontSize: 12, minWidth: 24, textAlign: "right" },
  detailActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 4, borderWidth: 1, alignItems: "center" },
  actionBtnDanger: { borderColor: Colors.danger, backgroundColor: Colors.danger + "20" },
  actionBtnGreen: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  actionBtnText: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.text, letterSpacing: 0.5 },
  policyCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  policyCardActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "08" },
  policyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  policyDot: { width: 8, height: 8, borderRadius: 4 },
  policyName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, flex: 1 },
  policyCost: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.warning },
  policyDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
  policyEffect: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  fleetCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  fleetHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  fleetName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, flex: 1 },
  fleetCount: { fontFamily: "Inter_700Bold", fontSize: 16 },
  fleetDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  fleetEffect: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.info, marginBottom: 4 },
  fleetBreakdown: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border + "44" },
  fleetSiteStat: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, paddingVertical: 1 },
}));

export default withScreenBoundary(MiningScreen, "mining");

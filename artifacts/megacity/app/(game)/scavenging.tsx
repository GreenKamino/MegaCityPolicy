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
  SCAVENGE_ZONES, SCAVENGE_ACTIONS, SCAVENGE_INFRASTRUCTURE, SCAVENGE_POLICIES,
  ZONE_TYPE_LABELS, ZONE_TYPE_COLORS,
  type ScavengeZoneType, type ScavengeZoneDef,
} from "@/engine/scavengingData";
import type { ScavengeExpedition } from "@/engine/types";
import WastelandIntelPanel from "@/components/WastelandIntelPanel";

type ScavTab = "overview" | "zones" | "expeditions" | "infrastructure" | "policies" | "wasteland";

const TABS: { id: ScavTab; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "zones", label: "ZONES" },
  { id: "expeditions", label: "EXPEDITIONS" },
  { id: "infrastructure", label: "INFRA" },
  { id: "policies", label: "POLICIES" },
  { id: "wasteland", label: "WASTELAND" },
];

const ZONE_FILTERS: (ScavengeZoneType | "all")[] = ["all", "ruins", "wasteland", "underhive", "industrial", "military", "anomaly"];

function ScavengingScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state, setState } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const [activeTab, setActiveTab] = useState<ScavTab>("overview");
  const [zoneFilter, setZoneFilter] = useState<ScavengeZoneType | "all">("all");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const tabScrollRef = useHorizontalWheelScroll();
  const zoneFilterScrollRef = useHorizontalWheelScroll();
  const builtInfra = useMemo(() => new Set(state.scavengingInfrastructure ?? []), [state.scavengingInfrastructure]);
  const activePolicies = useMemo(() => new Set(state.activeScavengingPolicies ?? []), [state.activeScavengingPolicies]);

  const expeditions: ScavengeExpedition[] = state.scavengeExpeditions ?? [];
  const activeExps = expeditions.filter(e => e.status === "active");
  const completedExps = expeditions.filter(e => e.status === "completed");

  const totalLoot: Record<string, number> = {};
  completedExps.forEach(e => {
    Object.entries(e.loot).forEach(([k, v]) => {
      if (!k.startsWith("_")) totalLoot[k] = (totalLoot[k] ?? 0) + v;
    });
  });

  const launchExpedition = (zone: ScavengeZoneDef, actionId: string) => {
    const action = SCAVENGE_ACTIONS.find(a => a.id === actionId);
    if (!action) return;
    if (state.resources.credits < action.cost) {
      showModal("INSUFFICIENT FUNDS", `Need ${action.cost.toLocaleString()} credits.`, [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    showModal(
      `LAUNCH ${action.name.toUpperCase()}`,
      `Zone: ${zone.name}\nCost: ${action.cost.toLocaleString()} CR\nDuration: ${action.ticksDuration} ticks\nDanger: ${zone.dangerLevel}%\nMin Team: ${zone.minTeam}\n\n${action.description}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "LAUNCH", style: "destructive", onPress: () => {
            setState((prev) => {
              const newExp: ScavengeExpedition = {
                id: `exp-${Date.now()}`,
                name: `${action.name} — ${zone.name}`,
                zoneName: zone.name,
                type: action.phase,
                status: "active",
                teamSize: zone.minTeam,
                ticksRemaining: action.ticksDuration,
                loot: {},
                dangerLevel: zone.dangerLevel,
                automated: false,
              };
              return {
                ...prev,
                resources: { ...prev.resources, credits: prev.resources.credits - action.cost },
                scavengeExpeditions: [...(prev.scavengeExpeditions ?? []), newExp],
              };
            });
          },
        },
      ]
    );
  };

  const buildInfra = (infraId: string) => {
    const infra = SCAVENGE_INFRASTRUCTURE.find(i => i.id === infraId);
    if (!infra) return;
    if (builtInfra.has(infraId)) {
      showModal("ALREADY BUILT", `${infra.name} is already operational.`, [{ text: "OK", style: "default" }]);
      return;
    }
    if (state.resources.credits < infra.cost) {
      showModal("INSUFFICIENT FUNDS", `Need ${infra.cost.toLocaleString()} credits.`, [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    showModal(
      `BUILD ${infra.name.toUpperCase()}`,
      `Cost: ${infra.cost.toLocaleString()} CR\nEffect: ${infra.effect}\n\n${infra.description}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "BUILD", style: "destructive", onPress: () => {
            setState((prev) => ({
              ...prev,
              resources: { ...prev.resources, credits: prev.resources.credits - infra.cost },
              scavengingInfrastructure: [...(prev.scavengingInfrastructure ?? []), infraId],
            }));
          },
        },
      ]
    );
  };

  const togglePolicy = (policyId: string) => {
    const policy = SCAVENGE_POLICIES.find(p => p.id === policyId);
    if (!policy) return;
    if (!activePolicies.has(policyId) && policy.cost > 0 && state.resources.credits < policy.cost) {
      showModal("INSUFFICIENT FUNDS", `Need ${policy.cost.toLocaleString()} credits.`, [{ text: "OK", style: "default" }]);
      return;
    }
    setState((prev) => {
      const current = new Set(prev.activeScavengingPolicies ?? []);
      if (current.has(policyId)) { current.delete(policyId); } else { current.add(policyId); }
      return { ...prev, activeScavengingPolicies: Array.from(current) };
    });
  };

  const filteredZones = zoneFilter === "all"
    ? SCAVENGE_ZONES
    : SCAVENGE_ZONES.filter(z => z.type === zoneFilter);

  const renderTabs = () => (
    <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
      {TABS.map(t => (
        <Pressable key={t.id} onPress={() => setActiveTab(t.id)} style={[styles.tab, activeTab === t.id && styles.tabActive]}>
          <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>{t.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const dangerColor = (level: number) => {
    if (level >= 60) return Colors.danger;
    if (level >= 40) return Colors.warning;
    return Colors.accent;
  };

  const renderOverview = () => (
    <View>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>ACTIVE EXPEDITIONS</Text>
          <Text style={styles.statValue}>{activeExps.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>COMPLETED</Text>
          <Text style={styles.statValue}>{completedExps.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>ZONES AVAILABLE</Text>
          <Text style={styles.statValue}>{SCAVENGE_ZONES.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>INFRASTRUCTURE</Text>
          <Text style={styles.statValue}>{builtInfra.size}/{SCAVENGE_INFRASTRUCTURE.length}</Text>
        </View>
      </View>

      {Object.keys(totalLoot).length > 0 && (
        <>
          <Text style={styles.sectionTitle}>RECOVERED MATERIALS</Text>
          {Object.entries(totalLoot).map(([k, v]) => (
            <View key={k} style={styles.lootRow}>
              <Text style={styles.lootName}>{k.replace(/([A-Z])/g, " $1").toUpperCase()}</Text>
              <Text style={styles.lootAmount}>{v.toLocaleString()}</Text>
            </View>
          ))}
        </>
      )}

      {activeExps.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>ACTIVE EXPEDITIONS</Text>
          {activeExps.map(exp => (
            <View key={exp.id} style={styles.expCard}>
              <View style={styles.expHeader}>
                <Text style={styles.expName}>{exp.name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: Colors.info + "22" }]}>
                  <Text style={[styles.statusText, { color: Colors.info }]}>{exp.status.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.expStats}>
                <Text style={styles.expStat}>Team: {exp.teamSize}</Text>
                <Text style={styles.expStat}>Ticks Left: {exp.ticksRemaining}</Text>
                <Text style={[styles.expStat, { color: dangerColor(exp.dangerLevel) }]}>Danger: {exp.dangerLevel}%</Text>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>ZONE THREAT SUMMARY</Text>
      {(Object.keys(ZONE_TYPE_LABELS) as ScavengeZoneType[]).map(type => {
        const zones = SCAVENGE_ZONES.filter(z => z.type === type);
        const avgDanger = Math.round(zones.reduce((s, z) => s + z.dangerLevel, 0) / zones.length);
        return (
          <View key={type} style={styles.threatRow}>
            <View style={[styles.zoneDot, { backgroundColor: ZONE_TYPE_COLORS[type] }]} />
            <Text style={styles.threatName}>{ZONE_TYPE_LABELS[type]}</Text>
            <Text style={styles.threatCount}>{zones.length} zones</Text>
            <Text style={[styles.threatDanger, { color: dangerColor(avgDanger) }]}>Avg Danger: {avgDanger}%</Text>
          </View>
        );
      })}
    </View>
  );

  const renderZones = () => (
    <View>
      <ScrollView ref={zoneFilterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
        {ZONE_FILTERS.map(f => (
          <Pressable key={f} onPress={() => setZoneFilter(f)} style={[styles.filterChip, zoneFilter === f && styles.filterChipActive]}>
            {f !== "all" && <View style={[styles.filterDot, { backgroundColor: ZONE_TYPE_COLORS[f] }]} />}
            <Text style={[styles.filterText, zoneFilter === f && styles.filterTextActive]}>
              {f === "all" ? "ALL" : ZONE_TYPE_LABELS[f]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filteredZones.map(zone => {
        const isSelected = selectedZone === zone.id;
        return (
          <View key={zone.id}>
            <Pressable onPress={() => setSelectedZone(isSelected ? null : zone.id)} style={[styles.zoneCard, isSelected && styles.zoneCardSelected]}>
              <View style={styles.zoneHeader}>
                <View style={[styles.zoneDot, { backgroundColor: ZONE_TYPE_COLORS[zone.type] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.zoneName}>{zone.name}</Text>
                  <Text style={styles.zoneType}>{ZONE_TYPE_LABELS[zone.type]}</Text>
                </View>
                <Text style={[styles.zoneDanger, { color: dangerColor(zone.dangerLevel) }]}>
                  DANGER {zone.dangerLevel}%
                </Text>
              </View>
              <Text style={styles.zoneDesc}>{zone.description}</Text>
              <View style={styles.zoneStats}>
                <Text style={styles.zoneStat}>Discovery: {zone.discoveryChance}%</Text>
                <Text style={styles.zoneStat}>Min Team: {zone.minTeam}</Text>
              </View>
              <View style={styles.lootChips}>
                {zone.possibleLoot.map(l => (
                  <View key={l} style={styles.lootChip}>
                    <Text style={styles.lootChipText}>{l.toUpperCase()}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
            {isSelected && (
              <View style={styles.actionPanel}>
                <Text style={styles.actionPanelTitle}>LAUNCH OPERATION</Text>
                {SCAVENGE_ACTIONS.map(action => (
                  <Pressable key={action.id} onPress={() => launchExpedition(zone, action.id)} style={styles.actionBtn}>
                    <View style={styles.actionBtnHeader}>
                      <Text style={styles.actionBtnName}>{action.name}</Text>
                      <Text style={styles.actionBtnCost}>{action.cost.toLocaleString()} CR</Text>
                    </View>
                    <Text style={styles.actionBtnDesc}>{action.description}</Text>
                    <Text style={styles.actionBtnMeta}>Phase: {action.phase.toUpperCase()} | Duration: {action.ticksDuration} ticks</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );

  const renderExpeditions = () => (
    <View>
      {expeditions.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="compass" size={32} color={Colors.textMuted} />
          <Text style={styles.emptyText}>NO EXPEDITIONS LAUNCHED</Text>
          <Text style={styles.emptySubtext}>Select a zone and launch an operation to begin scavenging</Text>
        </View>
      ) : (
        expeditions.map(exp => (
          <View key={exp.id} style={styles.expCard}>
            <View style={styles.expHeader}>
              <Text style={styles.expName}>{exp.name}</Text>
              <View style={[styles.statusBadge, {
                backgroundColor: exp.status === "active" ? Colors.info + "22"
                  : exp.status === "completed" ? Colors.accent + "22"
                  : exp.status === "failed" ? Colors.danger + "22"
                  : Colors.warning + "22"
              }]}>
                <Text style={[styles.statusText, {
                  color: exp.status === "active" ? Colors.info
                    : exp.status === "completed" ? Colors.accent
                    : exp.status === "failed" ? Colors.danger
                    : Colors.warning
                }]}>{exp.status.toUpperCase()}</Text>
              </View>
            </View>
            <View style={styles.expStats}>
              <Text style={styles.expStat}>Zone: {exp.zoneName}</Text>
              <Text style={styles.expStat}>Type: {exp.type.toUpperCase()}</Text>
              <Text style={styles.expStat}>Team: {exp.teamSize}</Text>
              {exp.status === "active" && <Text style={styles.expStat}>Ticks: {exp.ticksRemaining}</Text>}
            </View>
            {exp.status === "completed" && Object.keys(exp.loot).length > 0 && (
              <View style={styles.expLoot}>
                <Text style={styles.expLootTitle}>RECOVERED:</Text>
                {Object.entries(exp.loot)
                  .filter(([k]) => !k.startsWith("_"))
                  .map(([k, v]) => (
                    <Text key={k} style={styles.expLootItem}>
                      {k.replace(/([A-Z])/g, " $1").toUpperCase()}: +{v.toLocaleString()}
                    </Text>
                  ))}
                {(exp.loot["_items"] ?? 0) > 0 && (
                  <Text style={[styles.expLootItem, { color: Colors.info }]}>
                    ITEMS FOUND: {exp.loot["_items"]}
                  </Text>
                )}
                {(exp.loot["_recruits"] ?? 0) > 0 && (
                  <Text style={[styles.expLootItem, { color: Colors.accent }]}>
                    TROOPS RECRUITED: {exp.loot["_recruits"]}
                  </Text>
                )}
              </View>
            )}
            {exp.status === "failed" && (
              <View style={[styles.expLoot, { borderLeftColor: Colors.danger }]}>
                <Text style={[styles.expLootTitle, { color: Colors.danger }]}>OPERATION FAILED</Text>
                <Text style={[styles.expLootItem, { color: Colors.danger }]}>Team suffered casualties or was lost.</Text>
              </View>
            )}
            {exp.automated && (
              <View style={[styles.statusBadge, { backgroundColor: Colors.accent + "22", marginTop: 6, alignSelf: "flex-start" }]}>
                <Text style={[styles.statusText, { color: Colors.accent }]}>AUTOMATED</Text>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );

  const renderInfra = () => (
    <View>
      {SCAVENGE_INFRASTRUCTURE.map(infra => {
        const built = builtInfra.has(infra.id);
        return (
          <Pressable key={infra.id} onPress={() => !built && buildInfra(infra.id)} style={[styles.infraCard, built && styles.infraCardBuilt]}>
            <View style={styles.infraHeader}>
              <MaterialCommunityIcons name="factory" size={16} color={built ? Colors.accent : Colors.textMuted} />
              <Text style={styles.infraName}>{infra.name}</Text>
              {built ? (
                <View style={[styles.statusBadge, { backgroundColor: Colors.accent + "22" }]}>
                  <Text style={[styles.statusText, { color: Colors.accent }]}>BUILT</Text>
                </View>
              ) : (
                <Text style={styles.infraCost}>{infra.cost.toLocaleString()} CR</Text>
              )}
            </View>
            <Text style={styles.infraDesc}>{infra.description}</Text>
            <Text style={[styles.infraEffect, { color: built ? Colors.accent : Colors.info }]}>{infra.effect}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderPolicies = () => (
    <View>
      {SCAVENGE_POLICIES.map(p => {
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

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <MaterialCommunityIcons name="compass-outline" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>SCAVENGING & RECLAMATION</Text>
      </View>

      {renderTabs()}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {activeTab === "overview" && renderOverview()}
        {activeTab === "zones" && renderZones()}
        {activeTab === "expeditions" && renderExpeditions()}
        {activeTab === "infrastructure" && renderInfra()}
        {activeTab === "policies" && renderPolicies()}
        {activeTab === "wasteland" && <WastelandIntelPanel />}
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
  tabBarContent: { paddingHorizontal: 12, gap: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 10 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5 },
  tabTextActive: { color: Colors.accent },
  body: { flex: 1 },
  bodyContent: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 40 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12 },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 8, color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.accent },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.info, letterSpacing: 0.5, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 4 },
  lootRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + "44" },
  lootName: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text },
  lootAmount: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.accent },
  threatRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border + "44", gap: 8 },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  threatName: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text, flex: 1 },
  threatCount: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },
  threatDanger: { fontFamily: "Inter_700Bold", fontSize: 10, minWidth: 100, textAlign: "right" },
  filterBar: { flexGrow: 0, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 12 },
  filterBarContent: { paddingHorizontal: 8, gap: 6 },
  filterChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  filterChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  filterDot: { width: 6, height: 6, borderRadius: 3 },
  filterText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: Colors.textMuted },
  filterTextActive: { color: Colors.accent },
  zoneCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  zoneCardSelected: { borderColor: Colors.accent },
  zoneHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  zoneName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text },
  zoneType: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted },
  zoneDanger: { fontFamily: "Inter_700Bold", fontSize: 10 },
  zoneDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 6 },
  zoneStats: { flexDirection: "row", gap: 12, marginBottom: 6 },
  zoneStat: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },
  lootChips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  lootChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, backgroundColor: Colors.accent + "15", borderWidth: 1, borderColor: Colors.accent + "33" },
  lootChipText: { fontFamily: "Inter_600SemiBold", fontSize: 8, color: Colors.accent },
  actionPanel: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.accent + "44", borderRadius: 6, padding: 12, marginBottom: 12, marginTop: -4 },
  actionPanelTitle: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.accent, letterSpacing: 1, marginBottom: 8 },
  actionBtn: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, marginBottom: 6 },
  actionBtnHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  actionBtnName: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text },
  actionBtnCost: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.warning },
  actionBtnDesc: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, marginBottom: 2 },
  actionBtnMeta: { fontFamily: "Inter_400Regular", fontSize: 8, color: Colors.info },
  emptyState: { alignItems: "center", padding: 40, gap: 8 },
  emptyText: { fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.textMuted },
  emptySubtext: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center" },
  expCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  expHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  expName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
  expStats: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  expStat: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },
  expLoot: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  expLootTitle: { fontFamily: "Inter_700Bold", fontSize: 9, color: Colors.accent, marginBottom: 4 },
  expLootItem: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.text },
  infraCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  infraCardBuilt: { borderColor: Colors.accent + "44", backgroundColor: Colors.accent + "08" },
  infraHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  infraName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, flex: 1 },
  infraCost: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.warning },
  infraDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
  infraEffect: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  policyCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  policyCardActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "08" },
  policyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  policyDot: { width: 8, height: 8, borderRadius: 4 },
  policyName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, flex: 1 },
  policyCost: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.warning },
  policyDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
  policyEffect: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
}));

export default withScreenBoundary(ScavengingScreen, "scavenging");

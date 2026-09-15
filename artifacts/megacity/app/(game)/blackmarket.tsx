import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { useGameModal } from "@/hooks/useGameModal";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { BM_TABS, type BmTab } from "@/data/blackMarketTabs";
import ContrabandRegistry from "@/components/ContrabandRegistry";
import SpyOpsPanel from "@/components/SpyOpsPanel";
import IntelOpsPanel from "@/components/IntelOpsPanel";
import type { BlackMarketItem as EngineBlackMarketItem } from "@/engine/blackMarketActions";

type BlackMarketItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  riskLevel: number;
  description: string;
  effect: string;
};

const BLACK_MARKET_ITEMS: BlackMarketItem[] = [
  { id: "bm-weapons-cache", name: "Weapons Cache", category: "Arms", price: 5000, riskLevel: 75, description: "Crate of unregistered firearms", effect: "+10 ammo, +5 defense" },
  { id: "bm-smuggled-meds", name: "Smuggled Medical Supplies", category: "Medical", price: 3000, riskLevel: 40, description: "Black market pharmaceuticals", effect: "+50 med supplies" },
  { id: "bm-forged-ids", name: "Forged Identity Papers", category: "Intel", price: 2000, riskLevel: 55, description: "False documentation for operations", effect: "Reduce gang detection by 5%" },
  { id: "bm-stolen-tech", name: "Stolen Research Data", category: "Tech", price: 8000, riskLevel: 65, description: "Corporate espionage data drives", effect: "+15 research progress" },
  { id: "bm-rare-minerals", name: "Rare Mineral Ore", category: "Resources", price: 6000, riskLevel: 30, description: "Unrefined exotic ore from the wastes", effect: "+200 steel" },
  { id: "bm-cyber-implants", name: "Black Market Cybernetics", category: "Tech", price: 12000, riskLevel: 70, description: "Illegal enhancement implants", effect: "Boost random officer stat" },
  { id: "bm-contraband-food", name: "Contraband Food Supply", category: "Resources", price: 2500, riskLevel: 25, description: "Real food, not synth-paste", effect: "+100 food, +5 happiness" },
  { id: "bm-surveillance-jammer", name: "Surveillance Jammer", category: "Tech", price: 7000, riskLevel: 60, description: "Blocks all surveillance in a sector", effect: "-15 law order" },
  { id: "bm-gang-intel", name: "Gang Intelligence Report", category: "Intel", price: 4000, riskLevel: 45, description: "Informant network data on gang activity", effect: "-8 crime" },
  { id: "bm-bribe-fund", name: "Bribe Fund Package", category: "Finance", price: 10000, riskLevel: 50, description: "Untraceable credit chips for bribes", effect: "+15 corruption, -10 unrest" },
  { id: "bm-explosives", name: "Military-Grade Explosives", category: "Arms", price: 8000, riskLevel: 85, description: "High-yield demolition charges", effect: "+20 defense, +10 unrest" },
  { id: "bm-mutant-serum", name: "Mutant Growth Serum", category: "Medical", price: 15000, riskLevel: 90, description: "Experimental mutagen compound", effect: "+10 mutation rate" },
  { id: "bm-informant-network", name: "Informant Network Access", category: "Intel", price: 6000, riskLevel: 55, description: "Access to deep city informant web", effect: "-12 crime, +5 corruption" },
  { id: "bm-stolen-vehicles", name: "Stolen Vehicle Fleet", category: "Arms", price: 9000, riskLevel: 65, description: "Hot vehicles, serial numbers filed off", effect: "+5 patrol cars" },
  { id: "bm-counterfeit-credits", name: "Counterfeit Credits", category: "Finance", price: 1000, riskLevel: 80, description: "Fake credits — high risk of detection", effect: "+5000 credits, +20 corruption risk" },
  { id: "bm-radiation-meds", name: "Radiation Treatment", category: "Medical", price: 5000, riskLevel: 35, description: "Anti-rad medication from outside the wall", effect: "+30 med supplies, -5 mutation" },
  { id: "bm-illegal-broadcast", name: "Illegal Broadcast Equipment", category: "Tech", price: 4500, riskLevel: 50, description: "Pirate radio and holovid equipment", effect: "+10 propaganda effectiveness" },
  { id: "bm-slave-labor", name: "Indentured Labor Contracts", category: "Finance", price: 3000, riskLevel: 70, description: "Illegal labor exploitation agreements", effect: "+15 employment, +10 unrest" },
  { id: "bm-alien-artifact", name: "Unknown Artifact", category: "Special", price: 25000, riskLevel: 50, description: "Origin unknown. Potentially valuable.", effect: "Unknown — random effect" },
  { id: "bm-data-wipe", name: "Criminal Record Wipe", category: "Intel", price: 8000, riskLevel: 60, description: "Delete criminal records from Justice DB", effect: "-5 crime stat, +8 corruption" },
];

const RISK_COLORS = (risk: number, Colors: ThemePalette) =>
  risk >= 80 ? Colors.danger : risk >= 50 ? Colors.warning : Colors.accent;


function BlackMarketScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, performBlackMarketPurchase } = useGame();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const [expanded, setExpanded] = useState<string | null>(null);
  const { modal, showModal, hideModal } = useGameModal();
  const [activeTab, setActiveTab] = useState<BmTab>("market");

  const categories = useMemo(() => {
    const cats = new Set(BLACK_MARKET_ITEMS.map((i) => i.category));
    return Array.from(cats);
  }, []);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const tabScrollRef = useHorizontalWheelScroll();
  const filterScrollRef = useHorizontalWheelScroll();

  const filtered = selectedCat
    ? BLACK_MARKET_ITEMS.filter((i) => i.category === selectedCat)
    : BLACK_MARKET_ITEMS;

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>BLACK MARKET</Text>
          <Text style={styles.headerSub}>
            UNDERWORLD NETWORK · {activeTab === "market" ? `${BLACK_MARKET_ITEMS.length} ITEMS` : activeTab === "audit" ? `${state.blackMarketHistory?.length ?? 0} RECORDS` : activeTab.toUpperCase()}
          </Text>
        </View>
      </View>

      <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.bmTabScroll} contentContainerStyle={styles.bmTabRow}>
        {BM_TABS.map(tab => (
          <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.bmTab, activeTab === tab.id && styles.bmTabActive]}>
            <Text style={[styles.bmTabText, activeTab === tab.id && styles.bmTabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {activeTab === "market" && (
        <>
          <View style={styles.filterRow}>
            <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.filterContent}>
              <Pressable
                onPress={() => setSelectedCat(null)}
                style={[styles.filterChip, !selectedCat && styles.filterChipActive]}
              >
                <Feather name="list" size={9} color={!selectedCat ? Colors.danger : Colors.textMuted} />
                <Text style={[styles.filterText, !selectedCat && styles.filterTextActive]}>ALL</Text>
              </Pressable>
              {categories.map((cat) => {
                const catIcon = ({ Arms: "crosshair", Medical: "heart", Intel: "search", Tech: "cpu", Resources: "box", Finance: "dollar-sign", Special: "star" } as Record<string, string>)[cat] ?? "package";
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setSelectedCat(selectedCat === cat ? null : cat)}
                    style={[styles.filterChip, selectedCat === cat && styles.filterChipActive]}
                  >
                    <Feather name={catIcon as any} size={9} color={selectedCat === cat ? Colors.danger : Colors.textMuted} />
                    <Text style={[styles.filterText, selectedCat === cat && styles.filterTextActive]}>{cat.toUpperCase()}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.warningBanner}>
              <MaterialCommunityIcons name="skull-crossbones" size={14} color={Colors.danger} />
              <Text style={styles.warningText}>
                Black market transactions carry risk of exposure. Higher risk items may trigger investigations and increase corruption.
              </Text>
            </View>

            {filtered.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setExpanded(expanded === item.id ? null : item.id)}
                style={[styles.card, expanded === item.id && styles.cardExpanded]}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardCat}>{item.category.toUpperCase()}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.cardPrice}>{item.price.toLocaleString()} CR</Text>
                    <View style={[styles.riskBadge, { borderColor: RISK_COLORS(item.riskLevel, Colors) }]}>
                      <Text style={[styles.riskText, { color: RISK_COLORS(item.riskLevel, Colors) }]}>RISK {item.riskLevel}%</Text>
                    </View>
                  </View>
                </View>

                {expanded === item.id && (
                  <View style={styles.detail}>
                    <Text style={styles.detailDesc}>{item.description}</Text>
                    <View style={styles.effectRow}>
                      <Text style={styles.effectLabel}>EFFECT:</Text>
                      <Text style={styles.effectValue}>{item.effect}</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        showModal(
                          `PURCHASE: ${item.name.toUpperCase()}`,
                          `Spend ${item.price.toLocaleString()} credits on ${item.name}?\n\nRisk: ${item.riskLevel}% exposure\nEffect: ${item.effect}\n\nBlack-market deals are irreversible. The shipment may be seized, opening an investigation; credits are spent either way.`,
                          [
                            { text: "CANCEL", style: "cancel" },
                            {
                              text: "PURCHASE",
                              style: "destructive",
                              onPress: () => {
                                const result = performBlackMarketPurchase(item as EngineBlackMarketItem);
                                if (!result.ok) {
                                  showModal("INSUFFICIENT", result.reason, [{ text: "OK", style: "cancel" }]);
                                } else if (result.delivered) {
                                  showModal("ACQUIRED", `${item.name} delivered. Effect applied: ${item.effect}`, [{ text: "OK", style: "cancel" }]);
                                } else {
                                  showModal("SEIZED", `${item.name} was seized. The deal failed; an investigation was opened. Credits were spent, but no goods arrived.`, [{ text: "OK", style: "cancel" }]);
                                }
                              },
                            },
                          ],
                        );
                      }}
                      style={styles.buyBtn}
                    >
                      <MaterialCommunityIcons name="cart" size={14} color={Colors.bg} />
                      <Text style={styles.buyBtnText}>PURCHASE — {item.price.toLocaleString()} CR</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            ))}

            <View style={{ height: 30 }} />
          </ScrollView>
        </>
      )}

      {activeTab === "contraband" && (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          <ContrabandRegistry />
        </ScrollView>
      )}

      {activeTab === "spyops" && (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          <SpyOpsPanel />
        </ScrollView>
      )}

      {activeTab === "intel" && (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          <IntelOpsPanel />
        </ScrollView>
      )}

      {activeTab === "audit" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>// BLACK-MARKET AUDIT TRAIL</Text>
          <Text style={styles.sectionSub}>Confirmed purchases remain here after the handoff screen closes. Cancelled reviews never enter this record.</Text>
          {(state.blackMarketHistory ?? []).length === 0 ? (
            <Text style={styles.emptyText}>No confirmed black-market purchases recorded.</Text>
          ) : (
            [...(state.blackMarketHistory ?? [])].reverse().map((entry) => (
              <View key={entry.id} style={styles.auditRow}>
                <View style={styles.auditMain}>
                  <Text style={styles.auditName}>{entry.itemName}</Text>
                  <Text style={styles.auditMeta}>TICK {entry.tick} · {entry.date.year} / {String(entry.date.month).padStart(2, "0")} / {String(entry.date.day).padStart(2, "0")}</Text>
                </View>
                <View style={styles.auditRight}>
                  <Text style={styles.auditCost}>-{entry.cost.toLocaleString()} CR</Text>
                  <Text style={[styles.auditOutcome, { color: entry.outcome === "delivered" ? Colors.accent : Colors.danger }]}>
                    {entry.outcome === "delivered" ? "DELIVERED" : "SEIZED"}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  bmTabScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.border },
  bmTabRow: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 5 : 8, gap: 6 },
  bmTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  bmTabActive: { borderColor: Colors.danger, backgroundColor: "rgba(255,59,48,0.08)" },
  bmTabText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 },
  bmTabTextActive: { color: Colors.danger },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.danger + "40",
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
    color: Colors.danger,
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
  filterContent: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 5 : 8, gap: 6 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  filterChipActive: { borderColor: Colors.danger, backgroundColor: "rgba(255,59,48,0.08)" },
  filterText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8 },
  filterTextActive: { color: Colors.danger },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },
  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255,59,48,0.08)",
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  warningText: { color: Colors.danger, fontFamily: "Inter_500Medium", fontSize: 11, flex: 1, lineHeight: 16 },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    marginBottom: 8,
  },
  cardExpanded: { borderColor: Colors.danger + "60" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 13 },
  cardCat: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 2 },
  cardRight: { alignItems: "flex-end" },
  cardPrice: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 13 },
  riskBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  riskText: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1 },
  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  detailDesc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  effectRow: { flexDirection: "row", marginTop: 8, gap: 6 },
  effectLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  effectValue: { color: Colors.info, fontFamily: "Inter_500Medium", fontSize: 10, flex: 1 },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: Colors.danger,
    borderRadius: 4,
  },
  buyBtnText: { color: Colors.bg, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 },
  sectionLabel: { color: Colors.info, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1, marginTop: 4, marginBottom: 8 },
  sectionSub: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15, marginBottom: 12 },
  emptyText: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, fontStyle: "italic", paddingVertical: 12 },
  auditRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 11, marginBottom: 6 },
  auditMain: { flex: 1, paddingRight: 10 },
  auditName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11 },
  auditMeta: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 8, letterSpacing: 0.5, marginTop: 4 },
  auditRight: { alignItems: "flex-end" },
  auditCost: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 10 },
  auditOutcome: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8, marginTop: 4 },
}));

export default withScreenBoundary(BlackMarketScreen, "blackmarket");

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

import SectionHeader from "@/components/SectionHeader";
import StatBar from "@/components/StatBar";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { AUGMENT_CATEGORIES, getAugmentsByCategory, type AugmentDef } from "@/engine/augments";
import { IMPLANT_CATEGORIES, getImplantsByCategory, type ImplantDef } from "@/engine/implants";
import { ALL_COMMODITIES, type CommodityDef } from "@/engine/commodities";

type TabId = "augments" | "implants" | "commodities" | "overview";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "OVERVIEW", icon: "activity" },
  { id: "augments", label: "AUGMENTS", icon: "zap" },
  { id: "implants", label: "IMPLANTS", icon: "cpu" },
  { id: "commodities", label: "SUPPLY", icon: "package" },
];

const getRarityColors = (Colors: ThemePalette): Record<string, string> => ({
  common: Colors.textMuted,
  uncommon: Colors.accent,
  rare: Colors.info,
  legendary: Colors.warning,
  prototype: "#a855f7",
});

const RARITY_LABELS: Record<string, string> = {
  common: "COMMON",
  uncommon: "UNCOMMON",
  rare: "RARE",
  legendary: "LEGENDARY",
  prototype: "PROTOTYPE",
};

function CyberneticsScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state } = useGameState();
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const tabScrollRef = useHorizontalWheelScroll();
  const [expandedAugCat, setExpandedAugCat] = useState<string | null>(null);
  const [expandedImpCat, setExpandedImpCat] = useState<string | null>(null);

  const b = state.buildings;
  const sp = state.stockpiles ?? {};

  const cyberBuildings = useMemo(() => [
    { key: "augmentationClinics", label: "Augmentation Clinics" },
    { key: "cyberSurgeryHospitals", label: "Cyber-Surgery Hospitals" },
    { key: "neuralResearchLabs", label: "Neural Research Labs" },
    { key: "implantManufacturingPlants", label: "Implant Mfg Plants" },
    { key: "cyberneticRecyclingFacilities", label: "Recycling Facilities" },
    { key: "militaryAugmentationLabs", label: "Military Aug Labs" },
    { key: "aiTrainingDataCenters", label: "AI Training Centers" },
    { key: "nanoFabricationLabs", label: "Nano-Fab Labs" },
    { key: "biotechFarms", label: "Biotech Farms" },
    { key: "blackMarketCyberClinics", label: "Black Market Clinics" },
  ], []);

  const totalCyberBuildings = cyberBuildings.reduce((a, c) => a + (b[c.key] ?? 0), 0);

  const cyberCommodities = useMemo(
    () => ALL_COMMODITIES.filter((c) => c.category === "cybernetics"),
    [],
  );

  const totalCyberStock = cyberCommodities.reduce(
    (a, c) => a + (sp[c.id] ?? 0),
    0,
  );

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="robot-industrial" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>CYBERNETICS DIVISION</Text>
        <Text style={styles.headerCount}>{totalCyberBuildings} FACILITIES</Text>
      </View>

      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === "web"}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContent}
      >
        {TABS.map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Feather
              name={tab.icon as any}
              size={12}
              color={activeTab === tab.id ? Colors.bg : Colors.textMuted}
            />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "overview" && (
          <OverviewTab
            cyberBuildings={cyberBuildings}
            buildings={b}
            totalStock={totalCyberStock}
            totalBuildings={totalCyberBuildings}
          />
        )}
        {activeTab === "augments" && (
          <AugmentsTab expanded={expandedAugCat} setExpanded={setExpandedAugCat} />
        )}
        {activeTab === "implants" && (
          <ImplantsTab expanded={expandedImpCat} setExpanded={setExpandedImpCat} />
        )}
        {activeTab === "commodities" && (
          <CommoditiesTab commodities={cyberCommodities} stockpiles={sp} />
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

function OverviewTab({
  cyberBuildings,
  buildings,
  totalStock,
  totalBuildings,
}: {
  cyberBuildings: { key: string; label: string }[];
  buildings: Record<string, number>;
  totalStock: number;
  totalBuildings: number;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <>
      <SectionHeader title="Cybernetics Overview" subtitle="Facilities & program status" icon={<MaterialCommunityIcons name="chip" size={14} color={Colors.accent} />} />

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalBuildings}</Text>
          <Text style={styles.statLabel}>FACILITIES</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{AUGMENT_CATEGORIES.length * 10}</Text>
          <Text style={styles.statLabel}>AUGMENTS DB</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{IMPLANT_CATEGORIES.length * 10}</Text>
          <Text style={styles.statLabel}>IMPLANTS DB</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{Math.floor(totalStock)}</Text>
          <Text style={styles.statLabel}>STOCKPILE</Text>
        </View>
      </View>

      <SectionHeader title="Facility Status" icon={<MaterialCommunityIcons name="hospital-building" size={14} color={Colors.accent} />} />
      {cyberBuildings.map(({ key, label }) => {
        const count = buildings[key] ?? 0;
        return (
          <View key={key} style={styles.facilityRow}>
            <Text style={styles.facilityLabel}>{label}</Text>
            <StatBar label={`${count}/20`} value={count} max={20} compact />
            <Text style={[styles.facilityCount, count > 0 && { color: Colors.accent }]}>
              {count}
            </Text>
          </View>
        );
      })}
    </>
  );
}

function AugmentsTab({
  expanded,
  setExpanded,
}: {
  expanded: string | null;
  setExpanded: (v: string | null) => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <>
      <SectionHeader title="Augmentation Database" subtitle={`${AUGMENT_CATEGORIES.length} categories — 100 augments`} icon={<MaterialCommunityIcons name="human-male-female" size={14} color={Colors.accent} />} />
      {AUGMENT_CATEGORIES.map((cat) => {
        const augments = getAugmentsByCategory(cat.id);
        const isOpen = expanded === cat.id;
        return (
          <View key={cat.id} style={styles.catBlock}>
            <Pressable
              style={styles.catHeader}
              onPress={() => setExpanded(isOpen ? null : cat.id)}
            >
              <Feather
                name={isOpen ? "chevron-down" : "chevron-right"}
                size={14}
                color={Colors.accent}
              />
              <Text style={styles.catTitle}>{cat.label}</Text>
              <Text style={styles.catCount}>{augments.length}</Text>
            </Pressable>
            {isOpen &&
              augments.map((aug: AugmentDef) => (
                <View key={aug.id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>{aug.name}</Text>
                    <Text style={styles.itemCategory}>
                      {aug.category.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.itemDesc}>{aug.description}</Text>
                  <View style={styles.itemStats}>
                    {Object.entries(aug.effects).map(([stat, value]) => (
                      <Text key={stat} style={styles.itemEffect}>
                        {stat}: {(value ?? 0) > 0 ? "+" : ""}{value}
                      </Text>
                    ))}
                  </View>
                </View>
              ))}
          </View>
        );
      })}
    </>
  );
}

function ImplantsTab({
  expanded,
  setExpanded,
}: {
  expanded: string | null;
  setExpanded: (v: string | null) => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const RARITY_COLORS = getRarityColors(Colors);
  return (
    <>
      <SectionHeader title="Implant Registry" subtitle={`${IMPLANT_CATEGORIES.length} categories — 100 implants`} icon={<MaterialCommunityIcons name="eye-settings-outline" size={14} color={Colors.accent} />} />
      {IMPLANT_CATEGORIES.map((cat) => {
        const implants = getImplantsByCategory(cat.id);
        const isOpen = expanded === cat.id;
        return (
          <View key={cat.id} style={styles.catBlock}>
            <Pressable
              style={styles.catHeader}
              onPress={() => setExpanded(isOpen ? null : cat.id)}
            >
              <Feather
                name={isOpen ? "chevron-down" : "chevron-right"}
                size={14}
                color={Colors.accent}
              />
              <Text style={styles.catTitle}>{cat.label}</Text>
              <Text style={styles.catCount}>{implants.length}</Text>
            </Pressable>
            {isOpen &&
              implants.map((imp: ImplantDef) => (
                <View key={imp.id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>{imp.name}</Text>
                    <Text
                      style={[
                        styles.itemRarity,
                        { color: RARITY_COLORS[imp.rarity] ?? Colors.textMuted },
                      ]}
                    >
                      {RARITY_LABELS[imp.rarity] ?? imp.rarity.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.itemDesc}>{imp.description}</Text>
                  <Text style={styles.itemMeta}>
                    Cost: {imp.cost.toLocaleString()} cr
                  </Text>
                </View>
              ))}
          </View>
        );
      })}
    </>
  );
}

function CommoditiesTab({
  commodities,
  stockpiles,
}: {
  commodities: CommodityDef[];
  stockpiles: Record<string, number>;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <>
      <SectionHeader
        title="Cybernetic Supply Chain"
        subtitle={`${commodities.length} trade goods`}
        icon={<MaterialCommunityIcons name="link-variant" size={14} color={Colors.accent} />}
      />
      {commodities.map((c) => {
        const qty = stockpiles[c.id] ?? 0;
        return (
          <View key={c.id} style={styles.commodityRow}>
            <View style={styles.commodityLeft}>
              <Text style={styles.commodityName}>{c.name}</Text>
            </View>
            <View style={styles.commodityRight}>
              <StatBar label={`${qty}`} value={Math.min(qty, 100)} max={100} compact />
              <Text style={[styles.commodityQty, qty > 0 && { color: Colors.accent }]}>
                {qty}
              </Text>
            </View>
          </View>
        );
      })}
    </>
  );
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
    flex: 1,
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  headerCount: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  tabScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tabLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  tabLabelActive: { color: Colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16 },

  statRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    alignItems: "center",
  },
  statValue: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  statLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    letterSpacing: 1,
    marginTop: 2,
  },

  facilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  facilityLabel: {
    flex: 1,
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  facilityCount: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    width: 40,
    textAlign: "right",
  },

  catBlock: { marginBottom: 8 },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderBright,
    borderRadius: 4,
    padding: 10,
  },
  catTitle: {
    flex: 1,
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  catCount: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },

  itemCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    marginTop: 4,
    marginLeft: 16,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  itemName: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
    flex: 1,
  },
  itemCategory: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  itemRarity: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  itemDesc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginBottom: 6,
  },
  itemStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  itemEffect: {
    color: Colors.accent,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  itemMeta: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 0.5,
  },

  commodityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  commodityLeft: { flex: 1 },
  commodityName: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  commodityRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commodityQty: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    width: 40,
    textAlign: "right",
  },
}));

export default withScreenBoundary(CyberneticsScreen, "cybernetics");

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

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { ALL_COMMODITIES, COMMODITY_CATEGORY_LABELS, type CommodityCategory } from "@/engine/commodities";

type TradeOffer = {
  id: string;
  name: string;
  category: CommodityCategory;
  buyPrice: number;
  sellPrice: number;
  available: number;
  demand: number;
};

function generateTradeOffers(tick: number): TradeOffer[] {
  const rng = (seed: number) => {
    let s = (seed * 16807 + tick * 127) % 2147483647;
    return ((s - 1) / 2147483646);
  };
  return ALL_COMMODITIES.map((c, i) => {
    const r = rng(i * 7919 + tick);
    const basePrice = c.basePrice ?? (50 + (i % 10) * 30);
    const volatility = 0.3 + r * 0.4;
    const contrabandPremium = c.contraband ? 1.4 : 1;
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      buyPrice: Math.round(basePrice * (1 + volatility) * contrabandPremium),
      sellPrice: Math.round(basePrice * (1 - volatility * 0.3) * contrabandPremium),
      available: Math.round(100 + r * 500),
      demand: Math.round(20 + r * 300),
    };
  });
}

const TRADE_CATEGORIES: CommodityCategory[] = [
  "rawOre", "metals", "gases", "chemicals", "plastics", "electronics",
  "foodstuffs", "meats", "crops", "water", "pharmaceuticals", "clothing",
  "consumerGoods", "parts", "industrialGoods", "energy", "construction",
  "livestock", "spaceCommodity", "farming", "cybernetics", "military",
  "textiles", "weaponry", "vehicles", "wasteland", "luxury", "dataMedia", "biotech",
  "dnaSupplies", "geneticEquipment", "cloningMaterials", "bioProducts",
  "geneticMedicine", "cloneGoods", "researchMaterials", "bioWeapons",
  "xenobiology", "upliftGoods",
];
const TRADE_CAT_LABELS = COMMODITY_CATEGORY_LABELS;

function TradeRow({ offer }: { offer: TradeOffer }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const spread = offer.buyPrice - offer.sellPrice;
  const spreadPct = ((spread / offer.buyPrice) * 100).toFixed(0);

  return (
    <View style={styles.tradeRow}>
      <View style={styles.tradeLeft}>
        <Text style={styles.tradeName}>{offer.name}</Text>
        <Text style={styles.tradeCat}>{TRADE_CAT_LABELS[offer.category] ?? offer.category}</Text>
      </View>
      <View style={styles.tradeRight}>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>BUY</Text>
          <Text style={[styles.priceValue, { color: Colors.danger }]}>{offer.buyPrice}</Text>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>SELL</Text>
          <Text style={[styles.priceValue, { color: Colors.accent }]}>{offer.sellPrice}</Text>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>AVAIL</Text>
          <Text style={styles.priceValue}>{offer.available}</Text>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>DEMAND</Text>
          <Text style={[styles.priceValue, { color: offer.demand > 200 ? Colors.warning : Colors.textSecondary }]}>{offer.demand}</Text>
        </View>
      </View>
    </View>
  );
}

function TradeScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state } = useGameState();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const [selectedCat, setSelectedCat] = useState<CommodityCategory | null>(null);
  const filterScrollRef = useHorizontalWheelScroll();

  const offers = useMemo(() => generateTradeOffers(state.totalTicks), [state.totalTicks]);

  const filtered = useMemo(() => {
    if (!selectedCat) return offers;
    return offers.filter((o) => o.category === selectedCat);
  }, [selectedCat, offers]);

  const tradeBalance = state.rates.tradeIncome;

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>TRADE EXCHANGE</Text>
          <Text style={styles.headerSub}>
            {offers.length} COMMODITIES · TRADE INCOME: {tradeBalance}/tick
          </Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.filterContent}>
          <Pressable
            onPress={() => setSelectedCat(null)}
            style={[styles.filterChip, !selectedCat && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, !selectedCat && styles.filterTextActive]}>ALL ({offers.length})</Text>
          </Pressable>
          {TRADE_CATEGORIES.map((cat) => {
            const count = offers.filter((o) => o.category === cat).length;
            if (count === 0) return null;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCat(selectedCat === cat ? null : cat)}
                style={[styles.filterChip, selectedCat === cat && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, selectedCat === cat && styles.filterTextActive]}>
                  {TRADE_CAT_LABELS[cat]} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryRow}>
          <SummaryBox label="CREDITS" value={Math.floor(state.resources.credits).toLocaleString()} color={Colors.accent} />
          <SummaryBox label="TRADE/TICK" value={tradeBalance.toString()} color={tradeBalance > 0 ? Colors.accent : Colors.danger} />
          <SummaryBox label="GOODS" value={state.resources.goods.toString()} color={Colors.info} />
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>ITEM</Text>
          <Text style={styles.tableHeaderText}>BUY</Text>
          <Text style={styles.tableHeaderText}>SELL</Text>
          <Text style={styles.tableHeaderText}>AVAIL</Text>
          <Text style={styles.tableHeaderText}>DEMAND</Text>
        </View>

        {filtered.map((offer) => (
          <TradeRow key={offer.id} offer={offer} />
        ))}

        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={14} color={Colors.info} />
          <Text style={styles.infoText}>
            Prices fluctuate each tick based on supply, demand, and city economic activity. Trade income is calculated automatically.
          </Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: string; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.summaryBox}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    color: Colors.accent,
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
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  filterChipActive: { borderColor: Colors.accent, backgroundColor: "rgba(0,255,65,0.08)" },
  filterText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8 },
  filterTextActive: { color: Colors.accent },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: Platform.OS === "web" ? 10 : 16 },
  summaryBox: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    alignItems: "center",
  },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 16 },
  summaryLabel: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, letterSpacing: 1, marginTop: 2 },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableHeaderText: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
    width: 55,
    textAlign: "center",
  },
  tradeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "40",
    backgroundColor: Colors.bgCard,
  },
  tradeLeft: { flex: 1 },
  tradeName: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  tradeCat: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 2 },
  tradeRight: { flexDirection: "row", gap: 4 },
  priceCol: { width: 55, alignItems: "center" },
  priceLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 7, letterSpacing: 0.5 },
  priceValue: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11, marginTop: 1 },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(0,200,255,0.08)",
    borderWidth: 1,
    borderColor: Colors.info,
    borderRadius: 4,
    padding: 12,
    marginTop: 16,
  },
  infoText: { color: Colors.info, fontFamily: "Inter_400Regular", fontSize: 11, flex: 1, lineHeight: 16 },
}));

export default withScreenBoundary(TradeScreen, "trade");

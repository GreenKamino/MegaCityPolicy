import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { withScreenBoundary } from "@/components/withScreenBoundary";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { useGame } from "@/context/GameContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import {
  listChainResources,
  getProducers,
  getConsumers,
  getProducerStaffing,
  getConsumerDemand,
  getLiveBuildingCount,
  resourceDisplayName,
  type ProductionEconomy,
} from "@/engine/productionInfo";

function economyLabel(e: ProductionEconomy): string {
  return e === "military" ? "ARMY SUPPLY" : "STOCKPILE";
}
function economyColor(e: ProductionEconomy, Colors: ThemePalette): string {
  return e === "military" ? Colors.warning : Colors.accent;
}
function cycleText(ticksPerCycle: number): string {
  return ticksPerCycle > 1 ? `every ${ticksPerCycle} ticks` : "per tick";
}

function ResourceChip({
  id,
  qty,
  onPress,
}: {
  id: string;
  qty: number;
  onPress: (id: string) => void;
}) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  return (
    <Pressable style={s.chip} onPress={() => onPress(id)}>
      <Text style={s.chipQty}>{qty}×</Text>
      <Text style={s.chipName}>{resourceDisplayName(id)}</Text>
      <Feather name="chevron-right" size={11} color={Colors.textMuted} />
    </Pressable>
  );
}

function ProductionChainsScreen() {
  const { colors: Colors } = useTheme();
  const { state } = useGame();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const resources = useMemo(() => listChainResources(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter(
      (r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q),
    );
  }, [resources, query]);

  const producers = useMemo(
    () => (selected ? getProducers(selected) : []),
    [selected],
  );
  const consumers = useMemo(
    () => (selected ? getConsumers(selected) : []),
    [selected],
  );
  const civilianSupply = useMemo(
    () =>
      producers
        .filter((p) => p.economy === "stockpile")
        .reduce((total, p) => {
          const staffing = getProducerStaffing(p, state.units, state.buildings);
          if (staffing) return total + staffing.totalOutputQty;
          return total + p.qty * getLiveBuildingCount(state.buildings, p.buildingKey);
        }, 0),
    [producers, state.buildings, state.units],
  );
  const civilianDemand = useMemo(
    () =>
      consumers
        .filter((c) => c.economy === "stockpile")
        .reduce((total, c) => total + getConsumerDemand(c, state.buildings).demandQty, 0),
    [consumers, state.buildings],
  );

  const select = (id: string) => setSelected(id);

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable
          onPress={() => (selected ? setSelected(null) : router.back())}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <Text style={[s.headerTitle, { flex: 1 }]} numberOfLines={1}>
          {selected ? resourceDisplayName(selected).toUpperCase() : "PRODUCTION CHAINS"}
        </Text>
      </View>

      {!selected ? (
        <>
          <Text style={s.intro}>
            Pick any resource to see which buildings PRODUCE it and which CONSUME
            it. Tap an input or output to trace the chain up- or downstream.
          </Text>
          <View style={s.searchRow}>
            <Feather name="search" size={14} color={Colors.textMuted} />
            <TextInput
              style={s.search}
              placeholder="Search resources…"
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              accessibilityLabel="Search resources"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
                <Feather name="x" size={14} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {filtered.map((r) => (
              <Pressable key={r.id} style={s.listRow} onPress={() => select(r.id)}>
                <Text style={s.listName}>{r.name}</Text>
                <Feather name="chevron-right" size={14} color={Colors.textMuted} />
              </Pressable>
            ))}
            {filtered.length === 0 && (
              <Text style={s.empty}>No resources match "{query}".</Text>
            )}
            <View style={{ height: 30 }} />
          </ScrollView>
        </>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {(selected === "ammo" || selected === "ammunition_crate") && (
            <View style={s.note}>
              <Text style={s.noteTitle}>TWO AMMO ECONOMIES</Text>
              <Text style={s.noteBody}>
                Army ammo (used by your units) comes only from MANNED military
                installations. Ammunition Crates are a trade commodity made by
                civilian Ammunition Press Lines — they do NOT refill the army
                ammo pool.
              </Text>
            </View>
          )}

          {(producers.some((p) => p.economy === "stockpile") ||
            consumers.some((c) => c.economy === "stockpile")) && (
            <View style={s.balance} testID="production-balance-card">
              <Text style={s.balanceTitle}>CIVILIAN STOCKPILE BALANCE</Text>
              <View style={s.balanceMetric}>
                <Text style={s.balanceLabel}>SUPPLY</Text>
                <Text style={s.balanceValue}>~{civilianSupply.toFixed(1)}× per cycle</Text>
              </View>
              <View style={s.balanceMetric}>
                <Text style={s.balanceLabel}>DEMAND</Text>
                <Text style={s.balanceValue}>~{civilianDemand.toFixed(1)}× per cycle</Text>
              </View>
              <Text style={s.balanceNote}>
                Supply reflects staffed output; demand uses recipe quantities across
                constructed buildings. Military army supply is tracked separately.
              </Text>
            </View>
          )}

          <Text style={s.sectionLabel}>PRODUCED BY</Text>
          {producers.length === 0 ? (
            <Text style={s.empty}>
              Raw or imported — no building produces this. Buy it on the Trade
              Exchange or mine/scavenge it.
            </Text>
          ) : (
            producers.map((p, i) => {
              const staffing = getProducerStaffing(p, state.units, state.buildings);
              const buildingCount =
                p.economy === "military"
                  ? getLiveBuildingCount(
                      state.militaryOverhaul?.logistics?.installationsBuilt,
                      p.buildingKey,
                    )
                  : getLiveBuildingCount(state.buildings, p.buildingKey);
              return (
                <View
                  key={`${p.buildingKey}-${p.recipeName ?? i}`}
                  style={s.card}
                  testID="production-producer-card"
                >
                <View style={s.cardTop}>
                  <Text style={s.cardTitle}>{p.buildingName}</Text>
                  <View style={[s.tag, { borderColor: economyColor(p.economy, Colors) }]}>
                    <Text style={[s.tagText, { color: economyColor(p.economy, Colors) }]}>
                      {economyLabel(p.economy)}
                    </Text>
                  </View>
                </View>
                {p.recipeName && <Text style={s.cardSub}>{p.recipeName}</Text>}
                <Text style={s.cardLine}>
                  <Text style={s.cardLabel}>Live status:</Text>{" "}
                  <Text style={s.cardStrong}>
                    {buildingCount > 0
                      ? `${buildingCount.toLocaleString()} ${
                          buildingCount === 1 ? "building" : "buildings"
                        } built`
                      : "NOT BUILT — no live output"}
                  </Text>
                </Text>
                <Text style={s.cardLine}>
                  <Text style={s.cardLabel}>Output:</Text>{" "}
                  <Text style={s.cardStrong}>{p.qty}× {resourceDisplayName(selected)}</Text>
                </Text>
                <Text style={s.cardLine}>
                  <Text style={s.cardLabel}>Cycle:</Text> {cycleText(p.ticksPerCycle)}
                </Text>
                {staffing && (
                  <Text style={s.cardLine}>
                    <Text style={s.cardLabel}>Staffing:</Text>{" "}
                    <Text style={s.cardStrong}>{staffing.workerCount.toLocaleString()}</Text>{" "}
                    {staffing.workersName}
                  </Text>
                )}
                {staffing && (
                  <Text style={s.cardLine}>
                    <Text style={s.cardLabel}>Effective output:</Text>{" "}
                    <Text style={s.cardStrong}>~{staffing.multiplier.toFixed(1)}×</Text>
                  </Text>
                )}
                {staffing && (
                  <Text style={s.cardLine}>
                    <Text style={s.cardLabel}>Staffed output:</Text>{" "}
                    <Text style={s.cardStrong}>
                      ~{staffing.outputQty.toFixed(1)}× {resourceDisplayName(selected)} per cycle
                    </Text>
                  </Text>
                )}
                {staffing && (
                  <Text style={s.cardLine}>
                    <Text style={s.cardLabel}>Total across:</Text>{" "}
                    <Text style={s.cardStrong}>
                      {staffing.buildingCount.toLocaleString()}{" "}
                      {staffing.buildingCount === 1 ? "building" : "buildings"}: ~
                      {staffing.totalOutputQty.toFixed(1)}× {resourceDisplayName(selected)}
                    </Text>
                  </Text>
                )}
                {p.economy === "stockpile" && p.workersName && (
                  <Text style={s.cardNote}>
                    Output is worker-scaled; inputs stay at the base rate.
                  </Text>
                )}
                {p.economy === "military" && (
                  <Text style={s.cardNote}>
                    Needs {p.personnel} personnel to fully man · scales with
                    garrison coverage
                  </Text>
                )}
                {p.inputs.length > 0 && (
                  <>
                    <Text style={s.miniLabel}>NEEDS</Text>
                    <View style={s.chipWrap}>
                      {p.inputs.map((inp) => (
                        <ResourceChip key={inp.id} id={inp.id} qty={inp.qty} onPress={select} />
                      ))}
                    </View>
                  </>
                )}
                </View>
              );
            })
          )}

          <Text style={[s.sectionLabel, { marginTop: 18 }]}>CONSUMED BY</Text>
          {consumers.length === 0 ? (
            <Text style={s.empty}>Not used as an input by any building.</Text>
          ) : (
            consumers.map((c, i) => {
              const demand = getConsumerDemand(c, state.buildings);
              return (
                <View
                  key={`${c.buildingKey}-${c.recipeName ?? i}`}
                  style={s.card}
                  testID="production-consumer-card"
                >
                <View style={s.cardTop}>
                  <Text style={s.cardTitle}>{c.buildingName}</Text>
                  <View style={[s.tag, { borderColor: economyColor(c.economy, Colors) }]}>
                    <Text style={[s.tagText, { color: economyColor(c.economy, Colors) }]}>
                      {economyLabel(c.economy)}
                    </Text>
                  </View>
                </View>
                {c.recipeName && <Text style={s.cardSub}>{c.recipeName}</Text>}
                <Text style={s.cardLine}>
                  <Text style={s.cardLabel}>Live status:</Text>{" "}
                  <Text style={s.cardStrong}>
                    {demand.buildingCount > 0
                      ? `${demand.buildingCount.toLocaleString()} ${
                          demand.buildingCount === 1 ? "building" : "buildings"
                        } built`
                      : "NOT BUILT — no live demand"}
                  </Text>
                </Text>
                <Text style={s.cardLine}>
                  <Text style={s.cardLabel}>Uses:</Text>{" "}
                  <Text style={s.cardStrong}>{c.qty}× {resourceDisplayName(selected)}</Text>
                </Text>
                <Text style={s.cardLine}>
                  <Text style={s.cardLabel}>Cycle:</Text> {cycleText(c.ticksPerCycle)}
                </Text>
                {c.economy === "stockpile" && (
                  <Text style={s.cardLine}>
                    <Text style={s.cardLabel}>Demand across:</Text>{" "}
                    <Text style={s.cardStrong}>
                      {demand.buildingCount.toLocaleString()}{" "}
                      {demand.buildingCount === 1 ? "building" : "buildings"}
                    </Text>
                    : <Text style={s.cardStrong}>~{demand.demandQty.toFixed(1)}×</Text>{" "}
                    {resourceDisplayName(selected)} per cycle
                  </Text>
                )}
                {c.outputs.length > 0 && (
                  <>
                    <Text style={s.miniLabel}>MAKES</Text>
                    <View style={s.chipWrap}>
                      {c.outputs.map((out) => (
                        <ResourceChip key={out.id} id={out.id} qty={out.qty} onPress={select} />
                      ))}
                    </View>
                  </>
                )}
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
     paddingHorizontal: Platform.OS === "web" ? 12 : 16,
     paddingBottom: Platform.OS === "web" ? 8 : 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  intro: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
     paddingHorizontal: Platform.OS === "web" ? 12 : 16,
     paddingTop: Platform.OS === "web" ? 8 : 12,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
     marginHorizontal: Platform.OS === "web" ? 12 : 16,
     marginTop: Platform.OS === "web" ? 8 : 12,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    backgroundColor: Colors.bgCard,
  },
  search: {
    flex: 1,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    paddingVertical: 0,
  },
  scroll: { flex: 1, marginTop: 8 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  listName: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 13 },
  empty: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    paddingVertical: 8,
  },
  note: {
    backgroundColor: Colors.warning + "12",
    borderWidth: 1,
    borderColor: Colors.warning + "50",
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
    gap: 5,
  },
  noteTitle: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.6,
  },
  noteBody: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  balance: {
    backgroundColor: Colors.accent + "10",
    borderWidth: 1,
    borderColor: Colors.accent + "55",
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
    gap: 5,
  },
  balanceTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.6,
  },
  balanceMetric: {
    borderTopWidth: 1,
    borderTopColor: Colors.accent + "30",
    paddingTop: 6,
    gap: 1,
  },
  balanceLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  balanceValue: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    // Native Dynamic Type scales the glyphs, so a fixed line height can clip
    // the largest accessibility sizes. Web keeps the compact browser rhythm.
    lineHeight: Platform.OS === "web" ? 18 : undefined,
  },
  balanceNote: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: Platform.OS === "web" ? 15 : undefined,
  },
  sectionLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  cardTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  cardSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    marginTop: 2,
  },
  cardLine: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: Platform.OS === "web" ? 17 : undefined,
    flexShrink: 1,
    marginTop: 6,
  },
  cardLabel: { color: Colors.textSecondary, fontFamily: "Inter_700Bold" },
  cardStrong: { color: Colors.text, fontFamily: "Inter_700Bold" },
  cardNote: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 3,
    fontStyle: "italic",
  },
  miniLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    backgroundColor: Colors.bgSecondary,
  },
  chipQty: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 10 },
  chipName: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    flexShrink: 1,
  },
  tag: {
    flexShrink: 0,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.6 },
}));

export default withScreenBoundary(ProductionChainsScreen, "production-chains");

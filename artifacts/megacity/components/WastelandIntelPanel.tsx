import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import SectionHeader from "@/components/SectionHeader";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  SECTOR_TYPE_DISTRIBUTION,
  WASTELAND_RESOURCES,
  SCAVENGER_FACTIONS,
  RAIDER_GANGS,
  WASTELAND_STRUCTURES,
  WASTELAND_EVENTS,
  WASTELAND_DISCOVERIES,
  type WastelandSectorType,
  type RaiderGangDef,
} from "@/engine/wasteland";

type SubTab = "overview" | "raiders" | "factions" | "discoveries";
const TABS: { id: SubTab; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "raiders", label: "RAIDERS" },
  { id: "factions", label: "FACTIONS" },
  { id: "discoveries", label: "INTEL" },
];

const getTierColors = (Colors: ThemePalette): Record<string, string> => ({
  standard: Colors.textMuted,
  elite: Colors.warning,
  legendary: "#B855FF",
});

const getRarityColors = (Colors: ThemePalette): Record<string, string> => ({
  common: Colors.textMuted,
  rare: "#4FC3F7",
  very_rare: "#B855FF",
});

function RaiderCard({ gang }: { gang: RaiderGangDef }) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const TIER_COLORS = getTierColors(Colors);
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen(!open)} style={[s.card, open && s.cardActive]}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <View style={s.nameRow}>
            {gang.isCannibal && <MaterialCommunityIcons name="skull" size={12} color={Colors.danger} />}
            <Text style={s.gangName}>{gang.name}</Text>
          </View>
          <Text style={s.gangLeader}>Leader: {gang.leader}</Text>
        </View>
        <View style={[s.tierBadge, { borderColor: TIER_COLORS[gang.tier] }]}>
          <Text style={[s.tierText, { color: TIER_COLORS[gang.tier] }]}>{gang.tier.toUpperCase()}</Text>
        </View>
      </View>
      {open && (
        <View style={s.detail}>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>TERRITORY</Text>
            <Text style={s.detailVal}>{gang.territory}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>TRAIT</Text>
            <Text style={s.detailVal}>{gang.trait}</Text>
          </View>
          {gang.isCannibal && (
            <View style={s.cannibalBanner}>
              <MaterialCommunityIcons name="skull-crossbones" size={10} color={Colors.danger} />
              <Text style={s.cannibalText}>CANNIBAL GANG — Extreme threat</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

export default function WastelandIntelPanel() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const RARITY_COLORS = getRarityColors(Colors);
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [raidTier, setRaidTier] = useState<string | "all">("all");
  const tabScrollRef = useHorizontalWheelScroll();
  const raidFilterScrollRef = useHorizontalWheelScroll();

  const sectorEntries = Object.entries(SECTOR_TYPE_DISTRIBUTION) as [WastelandSectorType, { count: number; label: string }][];
  const totalSectors = sectorEntries.reduce((sum, [, v]) => sum + v.count, 0);

  const filteredRaiders = raidTier === "all"
    ? RAIDER_GANGS
    : RAIDER_GANGS.filter(g => g.tier === raidTier);

  const cannibalCount = RAIDER_GANGS.filter(g => g.isCannibal).length;

  return (
    <View style={s.root}>
      <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={s.tabRow}>
        {TABS.map(tab => (
          <Pressable key={tab.id} onPress={() => setSubTab(tab.id)} style={[s.tab, subTab === tab.id && s.tabActive]}>
            <Text style={[s.tabText, subTab === tab.id && s.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {subTab === "overview" && (
        <View>
          <SectionHeader title="Sector Distribution" subtitle={`${totalSectors} total wasteland sectors`} icon={<MaterialCommunityIcons name="map" size={14} color={Colors.accent} />} />
          {sectorEntries.map(([type, data]) => (
            <View key={type} style={s.sectorRow}>
              <Text style={s.sectorLabel}>{data.label}</Text>
              <View style={s.sectorBarOuter}>
                <View style={[s.sectorBarInner, { width: `${(data.count / 180) * 100}%` }]} />
              </View>
              <Text style={s.sectorCount}>{data.count}</Text>
            </View>
          ))}

          <SectionHeader title="Wasteland Resources" icon={<MaterialCommunityIcons name="treasure-chest" size={14} color={Colors.warning} />} />
          {WASTELAND_RESOURCES.map((res, i) => (
            <View key={i} style={s.resRow}>
              <View style={[s.rarityDot, { backgroundColor: RARITY_COLORS[res.rarity] }]} />
              <Text style={s.resName}>{res.name}</Text>
              <Text style={[s.resRarity, { color: RARITY_COLORS[res.rarity] }]}>{res.rarity.toUpperCase().replace("_", " ")}</Text>
            </View>
          ))}

          <View style={s.summaryRow}>
            <View style={s.summaryBox}>
              <Text style={s.summaryVal}>{RAIDER_GANGS.length}</Text>
              <Text style={s.summaryLabel}>RAIDER GANGS</Text>
            </View>
            <View style={s.summaryBox}>
              <Text style={s.summaryVal}>{SCAVENGER_FACTIONS.length}</Text>
              <Text style={s.summaryLabel}>SCAV FACTIONS</Text>
            </View>
            <View style={s.summaryBox}>
              <Text style={[s.summaryVal, { color: Colors.danger }]}>{cannibalCount}</Text>
              <Text style={s.summaryLabel}>CANNIBALS</Text>
            </View>
          </View>
        </View>
      )}

      {subTab === "raiders" && (
        <View>
          <SectionHeader title="Raider Gangs" subtitle={`${RAIDER_GANGS.length} gangs identified`} icon={<MaterialCommunityIcons name="skull-crossbones" size={14} color={Colors.danger} />} />
          <ScrollView ref={raidFilterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={s.filterRow}>
            {["all", "standard", "elite", "legendary"].map(tier => (
              <Pressable key={tier} onPress={() => setRaidTier(tier)} style={[s.chip, raidTier === tier && s.chipActive]}>
                <Text style={[s.chipText, raidTier === tier && s.chipTextActive]}>
                  {tier.toUpperCase()} {tier !== "all" ? `(${RAIDER_GANGS.filter(g => g.tier === tier).length})` : `(${RAIDER_GANGS.length})`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {filteredRaiders.map(gang => <RaiderCard key={gang.id} gang={gang} />)}
        </View>
      )}

      {subTab === "factions" && (
        <View>
          <SectionHeader title="Scavenger Factions" subtitle={`${SCAVENGER_FACTIONS.length} known groups`} icon={<MaterialCommunityIcons name="account-group" size={14} color={Colors.accent} />} />
          {SCAVENGER_FACTIONS.map(faction => (
            <View key={faction.id} style={s.factionCard}>
              <MaterialCommunityIcons name="flag-variant" size={12} color={Colors.accent} />
              <Text style={s.factionName}>{faction.name}</Text>
            </View>
          ))}
        </View>
      )}

      {subTab === "discoveries" && (
        <View>
          <SectionHeader title="Known Structures" subtitle={`${WASTELAND_STRUCTURES.length} mapped`} icon={<MaterialCommunityIcons name="office-building" size={14} color={Colors.accent} />} />
          <View style={s.discGrid}>
            {WASTELAND_STRUCTURES.slice(0, 30).map(struct => (
              <View key={struct.id} style={s.discChip}>
                <Text style={s.discText}>{struct.name}</Text>
                <Text style={s.discCat}>{struct.category}</Text>
              </View>
            ))}
            {WASTELAND_STRUCTURES.length > 30 && (
              <View style={s.discChip}>
                <Text style={[s.discText, { color: Colors.textMuted }]}>+{WASTELAND_STRUCTURES.length - 30} more...</Text>
              </View>
            )}
          </View>

          <SectionHeader title="Discoveries" subtitle={`${WASTELAND_DISCOVERIES.length} catalogued`} icon={<MaterialCommunityIcons name="magnify" size={14} color="#B855FF" />} />
          {WASTELAND_DISCOVERIES.map(disc => (
            <View key={disc.id} style={s.resRow}>
              <View style={[s.rarityDot, { backgroundColor: RARITY_COLORS[disc.rarity] }]} />
              <Text style={s.resName}>{disc.name}</Text>
              <Text style={[s.resRarity, { color: RARITY_COLORS[disc.rarity] }]}>{disc.rarity.toUpperCase().replace("_", " ")}</Text>
            </View>
          ))}

          <SectionHeader title="Wasteland Events" subtitle={`${WASTELAND_EVENTS.length} event types`} icon={<MaterialCommunityIcons name="alert-circle" size={14} color={Colors.warning} />} />
          <View style={s.discGrid}>
            {WASTELAND_EVENTS.slice(0, 25).map(evt => (
              <View key={evt.id} style={s.discChip}>
                <Text style={s.discText}>{evt.name}</Text>
                <Text style={s.discCat}>{evt.category}</Text>
              </View>
            ))}
            {WASTELAND_EVENTS.length > 25 && (
              <View style={s.discChip}>
                <Text style={[s.discText, { color: Colors.textMuted }]}>+{WASTELAND_EVENTS.length - 25} more...</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { paddingBottom: 16 },
  tabRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  tabActive: { borderColor: Colors.accent, backgroundColor: "rgba(0,255,65,0.08)" },
  tabText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 },
  tabTextActive: { color: Colors.accent },
  filterRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  chipActive: { borderColor: Colors.danger, backgroundColor: "rgba(255,59,48,0.06)" },
  chipText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.6 },
  chipTextActive: { color: Colors.danger },
  card: { marginHorizontal: 16, marginBottom: 4, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10 },
  cardActive: { borderColor: Colors.danger + "60" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  gangName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11 },
  gangLeader: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 2, marginLeft: 17 },
  tierBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 1 },
  tierText: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.8 },
  detail: { marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  detailLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.6 },
  detailVal: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 10 },
  cannibalBanner: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, padding: 6, backgroundColor: "rgba(255,59,48,0.08)", borderRadius: 3, borderWidth: 1, borderColor: Colors.danger + "40" },
  cannibalText: { color: Colors.danger, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.6 },
  sectorRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 4, gap: 8 },
  sectorLabel: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10, width: 150 },
  sectorBarOuter: { flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3 },
  sectorBarInner: { height: 6, backgroundColor: Colors.accent + "80", borderRadius: 3 },
  sectorCount: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10, width: 30, textAlign: "right" },
  resRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 3, gap: 8 },
  rarityDot: { width: 6, height: 6, borderRadius: 3 },
  resName: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 11, flex: 1 },
  resRarity: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.6 },
  summaryRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 16, gap: 8 },
  summaryBox: { flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, alignItems: "center" },
  summaryVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 16 },
  summaryLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 7, letterSpacing: 0.8, marginTop: 2 },
  factionCard: { marginHorizontal: 16, marginBottom: 3, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  factionName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11 },
  discGrid: { paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  discChip: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4 },
  discText: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 9 },
  discCat: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 7, marginTop: 1 },
}));

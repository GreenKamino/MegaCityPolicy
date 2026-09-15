import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState, useMemo, useCallback } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import SectionHeader from "@/components/SectionHeader";
import { useTheme } from "@/context/ThemeContext";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { formatCredits } from "@/utils/format";
import {
  type ItemCategory, type ItemRarity, type EquipSlot,
  ITEM_DEFS, RARITY_COLORS, RARITY_LABELS,
  getItemDef, createDefaultInventoryState,
} from "@/engine/inventoryData";
import { createDefaultRetinueState } from "@/engine/retinueData";
import { equipItemToCaptain, unequipItem, sellItem, addItemToInventory } from "@/engine/retinue";

type InvTab = "all" | "weapons" | "armor" | "gear" | "consumables" | "relics";

const CATEGORY_MAP: Record<InvTab, ItemCategory[] | null> = {
  all: null,
  weapons: ["weapon"],
  armor: ["armor"],
  gear: ["gear", "augment"],
  consumables: ["consumable"],
  relics: ["relic"],
};

function InventoryScreen() {
  const { state, setState } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const { colors: T } = useTheme();
  const [tab, setTab] = useState<InvTab>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [equipTarget, setEquipTarget] = useState<string | null>(null);

  const inv = state.inventory ?? createDefaultInventoryState();
  const ret = state.retinue ?? createDefaultRetinueState();

  const filteredItems = useMemo(() => {
    const cats = CATEGORY_MAP[tab];
    if (!cats) return inv.items;
    return inv.items.filter(item => {
      const def = getItemDef(item.defId);
      return def && cats.includes(def.category);
    });
  }, [inv.items, tab]);

  const selectedItem = selectedItemId ? inv.items.find(i => i.id === selectedItemId) : null;
  const selectedDef = selectedItem ? getItemDef(selectedItem.defId) : null;

  const doAction = useCallback((fn: (s: any) => { success: boolean; error?: string }) => {
    setState((prev: any) => {
      const s = { ...prev };
      const result = fn(s);
      if (!result.success && result.error) {
        setTimeout(() => showModal("Error", result.error!, [{ text: "OK" }]), 0);
        return prev;
      }
      return s;
    });
  }, [setState, showModal]);

  const handleSell = useCallback((itemId: string, qty: number = 1) => {
    doAction((s: any) => sellItem(s, itemId, qty));
    setSelectedItemId(null);
  }, [doAction]);

  const confirmSell = useCallback((itemId: string, qty: number = 1) => {
    const item = inv.items.find((entry) => entry.id === itemId);
    const def = item ? getItemDef(item.defId) : null;
    if (!item || !def) return;
    const value = Math.floor(def.value * 0.4) * qty;
    showModal(
      "SELL ITEM?",
      `${def.name}\nQuantity: ${qty}\nValue: ${formatCredits(value)}\n\nThis item will be permanently removed from your inventory. This cannot be undone.`,
      [
        { text: "CANCEL", style: "cancel" },
        { text: "SELL", style: "destructive", onPress: () => handleSell(itemId, qty) },
      ],
    );
  }, [inv.items, showModal, handleSell]);

  const handleEquip = useCallback((itemId: string, captainId: string) => {
    doAction((s: any) => equipItemToCaptain(s, itemId, captainId));
    setEquipTarget(null);
    setSelectedItemId(null);
  }, [doAction]);

  const handleUnequip = useCallback((itemId: string) => {
    doAction((s: any) => unequipItem(s, itemId));
  }, [doAction]);

  const tabs: { id: InvTab; label: string; icon: string }[] = [
    { id: "all", label: "ALL", icon: "package-variant" },
    { id: "weapons", label: "WEAPONS", icon: "sword" },
    { id: "armor", label: "ARMOR", icon: "shield" },
    { id: "gear", label: "GEAR", icon: "cog" },
    { id: "consumables", label: "USE", icon: "needle" },
    { id: "relics", label: "RELICS", icon: "diamond-stone" },
  ];

  return (
    <View style={[s.container, { backgroundColor: T.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}>
        <SectionHeader title="INVENTORY" icon={<MaterialCommunityIcons name="treasure-chest" size={16} color={T.accent} />} />

        <View style={[s.row, { paddingHorizontal: 8, marginBottom: 4 }]}>
          <Text style={[s.tinyText, { color: T.textSecondary }]}>
            {inv.items.length}/{inv.maxSlots} slots — Found: {inv.totalItemsFound} — Sold: {inv.totalItemsSold}
          </Text>
        </View>

        <View style={[s.row, { marginBottom: 8, gap: 4, flexWrap: "wrap", paddingHorizontal: 8 }]}>
          {tabs.map(t => (
            <Pressable key={t.id} style={[s.tabBtn, tab === t.id && { backgroundColor: T.accent + "30", borderColor: T.accent }]} onPress={() => setTab(t.id)}>
              <MaterialCommunityIcons name={t.icon as any} size={12} color={tab === t.id ? T.accent : T.textSecondary} />
              <Text style={[s.tabText, { color: tab === t.id ? T.accent : T.textSecondary }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: 8 }}>
          {filteredItems.length === 0 && (
            <View style={[s.card, { borderColor: T.border }]}>
              <Text style={[s.tinyText, { color: T.accent, textAlign: "center", fontFamily: "Inter_700Bold", marginBottom: 4 }]}>
                EQUIPMENT LOCKER EMPTY
              </Text>
              <Text style={[s.tinyText, { color: T.textSecondary, textAlign: "center" }]}>
                {tab !== "all" ? `No ${tab} items acquired yet.` : "No equipment, consumables, or artifacts in storage."}{"\n\n"}HOW TO ACQUIRE:{"\n"}• Complete World Map expeditions{"\n"}• Respond to city events and incidents{"\n"}• Unlock achievements and milestones{"\n"}• Trade with external settlements
              </Text>
            </View>
          )}

          {filteredItems.map(item => {
            const def = getItemDef(item.defId);
            if (!def) return null;
            const rarityColor = RARITY_COLORS[def.rarity];
            const equippedCaptain = item.equippedTo ? ret.captains.find(c => c.id === item.equippedTo) : null;

            return (
              <Pressable key={item.id} accessibilityLabel={`View ${def.name} details`} style={[s.card, { borderLeftWidth: 3, borderLeftColor: rarityColor }]} onPress={() => setSelectedItemId(item.id)}>
                <View style={s.row}>
                  <MaterialCommunityIcons name={def.icon as any} size={20} color={rarityColor} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[s.cardTitle, { color: T.text }]}>
                      {def.name}
                      {def.stackable && item.quantity > 1 ? ` ×${item.quantity}` : ""}
                    </Text>
                    <View style={s.row}>
                      <View style={[s.tag, { backgroundColor: rarityColor + "20" }]}>
                        <Text style={[s.tagText, { color: rarityColor }]}>{RARITY_LABELS[def.rarity]}</Text>
                      </View>
                      {def.equipSlot && (
                        <View style={[s.tag, { backgroundColor: T.accent + "20", marginLeft: 4 }]}>
                          <Text style={[s.tagText, { color: T.accent }]}>{def.equipSlot.toUpperCase()}</Text>
                        </View>
                      )}
                      {equippedCaptain && (
                        <View style={[s.tag, { backgroundColor: "#FFD70020", marginLeft: 4 }]}>
                          <Text style={[s.tagText, { color: "#FFD700" }]}>EQUIPPED: {equippedCaptain.name}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[s.statVal, { color: T.textSecondary }]}>{formatCredits(Math.floor(def.value * 0.4))}</Text>
                </View>
                <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 4 }]}>{def.description}</Text>
                <View style={[s.row, { marginTop: 4, gap: 8, flexWrap: "wrap" }]}>
                  {Object.entries(def.effects).map(([key, val]) => (
                    <Text key={key} style={[s.tinyText, { color: (val as number) > 0 ? "#4CAF50" : "#F44336" }]}>
                      {(val as number) > 0 ? "+" : ""}{val as number} {key}
                    </Text>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 8, marginTop: 12 }}>
          <SectionHeader title="ITEM CATALOG" icon={<MaterialCommunityIcons name="book-open-variant" size={14} color={T.accent} />} />
          <Text style={[s.tinyText, { color: T.textSecondary, marginBottom: 8 }]}>
            All discoverable items. Acquire through world map operations, encounters, and achievements.
          </Text>
          {ITEM_DEFS.map(def => {
            const owned = inv.items.some(i => i.defId === def.id);
            const rarityColor = RARITY_COLORS[def.rarity];
            return (
              <View key={def.id} style={[s.card, { borderLeftWidth: 2, borderLeftColor: rarityColor, opacity: owned ? 1 : 0.5 }]}>
                <View style={s.row}>
                  <MaterialCommunityIcons name={def.icon as any} size={16} color={rarityColor} />
                  <Text style={[s.cardTitle, { color: T.text, marginLeft: 6, flex: 1 }]}>{def.name}</Text>
                  <View style={[s.tag, { backgroundColor: rarityColor + "20" }]}>
                    <Text style={[s.tagText, { color: rarityColor }]}>{RARITY_LABELS[def.rarity]}</Text>
                  </View>
                  {owned && <MaterialCommunityIcons name="check-circle" size={14} color="#4CAF50" style={{ marginLeft: 4 }} />}
                </View>
                <Text style={[s.tinyText, { color: T.textSecondary, marginTop: 2 }]}>{def.description}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {selectedItem && selectedDef && (
        <GameModal visible={!!selectedItemId} title={selectedDef.name} buttons={[{ text: "CLOSE", style: "cancel" }]} onDismiss={() => { setSelectedItemId(null); setEquipTarget(null); }}>
          <View>
            <View style={[s.row, { marginBottom: 8 }]}>
              <MaterialCommunityIcons name={selectedDef.icon as any} size={28} color={RARITY_COLORS[selectedDef.rarity]} />
              <View style={{ marginLeft: 10 }}>
                <Text style={{ color: RARITY_COLORS[selectedDef.rarity], fontFamily: "Inter_700Bold", fontSize: 14 }}>{RARITY_LABELS[selectedDef.rarity]}</Text>
                {selectedDef.equipSlot && <Text style={{ color: T.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11 }}>Slot: {selectedDef.equipSlot.toUpperCase()}</Text>}
              </View>
            </View>
            <Text style={{ color: T.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 8 }}>{selectedDef.description}</Text>
            <View style={[s.row, { gap: 8, flexWrap: "wrap", marginBottom: 12 }]}>
              {Object.entries(selectedDef.effects).map(([key, val]) => (
                <Text key={key} style={{ color: (val as number) > 0 ? "#4CAF50" : "#F44336", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                  {(val as number) > 0 ? "+" : ""}{val as number} {key}
                </Text>
              ))}
            </View>

            {selectedItem.equippedTo && (
              <Pressable style={[s.actionBtn, { backgroundColor: "#FF980030", marginBottom: 6 }]} onPress={() => handleUnequip(selectedItem.id)}>
                <Text style={[s.actionBtnText, { color: "#FF9800" }]}>UNEQUIP</Text>
              </Pressable>
            )}

            {selectedDef.equipSlot && !selectedItem.equippedTo && ret.captains.filter(c => c.status === "active").length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ color: T.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 11, marginBottom: 4 }}>EQUIP TO CAPTAIN:</Text>
                {ret.captains.filter(c => c.status === "active").map(cap => (
                  <Pressable key={cap.id} style={[s.selectRow, { marginVertical: 2 }]} onPress={() => handleEquip(selectedItem.id, cap.id)}>
                    <MaterialCommunityIcons name="account-star" size={14} color="#FFD700" />
                    <Text style={{ color: T.text, fontFamily: "Inter_400Regular", fontSize: 12, marginLeft: 6 }}>{cap.name} (Lv.{cap.level})</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {!selectedItem.equippedTo && (
              <Pressable style={[s.actionBtn, { backgroundColor: "#F4433630" }]} onPress={() => confirmSell(selectedItem.id)}>
                <Text style={[s.actionBtnText, { color: "#F44336" }]}>SELL — {formatCredits(Math.floor(selectedDef.value * 0.4))}</Text>
              </Pressable>
            )}
          </View>
        </GameModal>
      )}

      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  card: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 6, padding: 10, marginBottom: 8 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 13 },
  tinyText: { fontFamily: "Inter_400Regular", fontSize: 10 },
  statVal: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  tabBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", flexDirection: "row", alignItems: "center", gap: 4 },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  tagText: { fontFamily: "Inter_500Medium", fontSize: 9 },
  actionBtn: { paddingVertical: 8, borderRadius: 6, alignItems: "center" },
  actionBtnText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  selectRow: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 4, flexDirection: "row", alignItems: "center" },
});

export default withScreenBoundary(InventoryScreen, "inventory");

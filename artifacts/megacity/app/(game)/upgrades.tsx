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
import {
  ASSET_UPGRADES,
  applyAssetUpgrade,
  canApplyAssetUpgrade,
  captainHasUpgrade,
  followerHasUpgrade,
  getUnitTier,
  type AssetUpgradeDef,
  type AssetUpgradeTarget,
} from "@/engine/assetUpgrades";
import { itemDisplayName, techDisplayName } from "@/engine/displayNames";
import { UNIT_ROLE_MAP } from "@/engine/loadout";
import type { GameState } from "@/engine/types";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

const TAB_LABELS: Record<AssetUpgradeTarget, string> = {
  unit: "UNITS",
  captain: "CAPTAINS",
  follower: "FOLLOWERS",
};

const TAB_ICONS: Record<AssetUpgradeTarget, FeatherName> = {
  unit: "shield",
  captain: "user",
  follower: "users",
};

function unitDisplayName(classId: string): string {
  const def = (UNIT_ROLE_MAP as Record<string, { label?: string }>)[classId];
  return def?.label ?? classId;
}

function countItem(state: GameState, defId: string): number {
  const items = state.inventory?.items ?? [];
  let total = 0;
  for (const it of items) if (it.defId === defId) total += it.quantity;
  return total;
}

function reqsMetReadout(state: GameState, upgrade: AssetUpgradeDef): { line: string; ok: boolean }[] {
  const out: { line: string; ok: boolean }[] = [];
  for (const techId of upgrade.reqs.techIds) {
    const ok = (state.unlockedTechnologies ?? []).includes(techId);
    out.push({ line: `RESEARCH: ${techDisplayName(techId)}`, ok });
  }
  for (const req of upgrade.reqs.items) {
    const have = countItem(state, req.itemDefId);
    out.push({ line: `${itemDisplayName(req.itemDefId)} (${have}/${req.count})`, ok: have >= req.count });
  }
  const credits = state.resources?.credits ?? 0;
  out.push({
    line: `${upgrade.reqs.credits.toLocaleString()} CR (have ${Math.floor(credits).toLocaleString()})`,
    ok: credits >= upgrade.reqs.credits,
  });
  return out;
}

function UpgradesScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state, setState } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const [activeTab, setActiveTab] = useState<AssetUpgradeTarget>("unit");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const upgrades = useMemo(() => ASSET_UPGRADES.filter((u) => u.target === activeTab), [activeTab]);

  const captains = useMemo(
    () => (state.retinue?.captains ?? []).filter((c) => c.status === "active"),
    [state.retinue],
  );
  const followers = useMemo(
    () => (state.namedCharacters ?? []).filter((c) => c.status === "active"),
    [state.namedCharacters],
  );

  const handleApply = (upgrade: AssetUpgradeDef, targetId: string, targetLabel: string) => {
    const check = canApplyAssetUpgrade(state, upgrade, targetId);
    if (!check.ok) {
      showModal("UPGRADE BLOCKED", check.reason, [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    const reqLines: string[] = [];
    if (upgrade.reqs.credits > 0) reqLines.push(`Cost: ${upgrade.reqs.credits.toLocaleString()} CR`);
    if (upgrade.reqs.techIds.length > 0) {
      reqLines.push(`Research: ${upgrade.reqs.techIds.map((techId) => techDisplayName(techId)).join(", ")}`);
    }
    if (upgrade.reqs.items.length > 0) {
      reqLines.push(`Consumes: ${upgrade.reqs.items.map((r) => `${r.count}× ${itemDisplayName(r.itemDefId)}`).join(", ")}`);
    }
    showModal(
      upgrade.name.toUpperCase(),
      `Target: ${targetLabel}\n${reqLines.join("\n")}\n\nEffect: ${upgrade.effectSummary}\n\n${upgrade.description}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "APPLY",
          style: "destructive",
          onPress: () => {
            setState((prev) => {
              const next = JSON.parse(JSON.stringify(prev)) as GameState;
              const result = applyAssetUpgrade(next, upgrade, targetId);
              if (!result.ok) {
                setTimeout(() => showModal("UPGRADE FAILED", result.reason, [{ text: "OK", style: "default" }]), 0);
                return prev;
              }
              return next;
            });
          },
        },
      ],
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
        <Feather name="arrow-left" size={18} color={Colors.accent} />
      </Pressable>
      <MaterialCommunityIcons name="arrow-up-bold-circle" size={18} color={Colors.accent} />
      <Text style={styles.headerTitle}>ASSET UPGRADES</Text>
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabRow}>
      {(["unit", "captain", "follower"] as AssetUpgradeTarget[]).map((tab) => {
        const active = tab === activeTab;
        return (
          <Pressable
            key={tab}
            onPress={() => {
              setActiveTab(tab);
              setSelectedTargetId(null);
            }}
            style={[styles.tabBtn, active && styles.tabBtnActive]}
          >
            <Feather name={TAB_ICONS[tab]} size={12} color={active ? Colors.accent : Colors.textMuted} />
            <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{TAB_LABELS[tab]}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderUnitUpgrades = () => {
    if (upgrades.length === 0) {
      return <Text style={styles.emptyText}>No unit upgrades catalogued.</Text>;
    }
    return upgrades.map((upgrade) => {
      const classId = upgrade.unitClassId ?? "";
      const tier = getUnitTier(state, classId);
      const maxTier = upgrade.maxTier ?? 1;
      const count = (state.units ?? {})[classId] ?? 0;
      const reqs = reqsMetReadout(state, upgrade);
      const check = canApplyAssetUpgrade(state, upgrade, classId);
      const maxed = tier >= maxTier;
      return (
        <View key={upgrade.id} style={styles.upgradeCard}>
          <View style={styles.upgradeHeader}>
            <Text style={styles.upgradeName}>{upgrade.name}</Text>
            <Text style={styles.tierChip}>T{tier}/{maxTier}</Text>
          </View>
          <Text style={styles.upgradeTarget}>{unitDisplayName(classId)} · {count.toLocaleString()} fielded</Text>
          <Text style={styles.upgradeDesc}>{upgrade.description}</Text>
          <Text style={styles.effectLine}>EFFECT: {upgrade.effectSummary}</Text>
          <View style={styles.reqList}>
            {reqs.map((r, i) => (
              <View key={i} style={styles.reqRow}>
                <Feather name={r.ok ? "check" : "x"} size={10} color={r.ok ? Colors.accent : Colors.danger} />
                <Text style={[styles.reqText, { color: r.ok ? Colors.text : Colors.textMuted }]}>{r.line}</Text>
              </View>
            ))}
          </View>
          <Pressable
            disabled={!check.ok}
            onPress={() => handleApply(upgrade, classId, unitDisplayName(classId))}
            style={[styles.applyBtn, !check.ok && styles.applyBtnDisabled]}
          >
            <Text style={[styles.applyBtnText, !check.ok && { color: Colors.textMuted }]}>
              {maxed ? "MAX TIER" : check.ok ? "APPLY UPGRADE" : "REQUIREMENTS UNMET"}
            </Text>
          </Pressable>
        </View>
      );
    });
  };

  const renderCaptainTargetPicker = () => {
    if (captains.length === 0) {
      return (
        <Text style={styles.emptyText}>
          No active captains in your retinue. Recruit captains from the Retinue Command screen.
        </Text>
      );
    }
    return (
      <View style={styles.targetPicker}>
        <Text style={styles.targetPickerLabel}>SELECT CAPTAIN</Text>
        <View style={styles.targetChipRow}>
          {captains.map((c) => {
            const active = c.id === selectedTargetId;
            return (
              <Pressable
                key={c.id}
                onPress={() => setSelectedTargetId(c.id)}
                style={[styles.targetChip, active && styles.targetChipActive]}
              >
                <Text style={[styles.targetChipName, active && { color: Colors.accent }]}>{c.name}</Text>
                <Text style={styles.targetChipMeta}>L{c.leadership} · C{c.combat} · T{c.tactics}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const renderFollowerTargetPicker = () => {
    if (followers.length === 0) {
      return (
        <Text style={styles.emptyText}>
          No active followers tracked. Followers emerge through events as the city evolves.
        </Text>
      );
    }
    return (
      <View style={styles.targetPicker}>
        <Text style={styles.targetPickerLabel}>SELECT FOLLOWER</Text>
        <View style={styles.targetChipRow}>
          {followers.map((c) => {
            const active = c.id === selectedTargetId;
            return (
              <Pressable
                key={c.id}
                onPress={() => setSelectedTargetId(c.id)}
                style={[styles.targetChip, active && styles.targetChipActive]}
              >
                <Text style={[styles.targetChipName, active && { color: Colors.accent }]}>{c.name}</Text>
                <Text style={styles.targetChipMeta}>{c.role.replace(/_/g, " ")} · NOT {c.notoriety}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const renderCaptainUpgrades = () => {
    if (!selectedTargetId) {
      return <Text style={styles.helperText}>Select a captain above to view available augments.</Text>;
    }
    const captain = captains.find((c) => c.id === selectedTargetId);
    if (!captain) return null;
    return upgrades.map((upgrade) => {
      const reqs = reqsMetReadout(state, upgrade);
      const check = canApplyAssetUpgrade(state, upgrade, selectedTargetId);
      const owned = captainHasUpgrade(state, selectedTargetId, upgrade.id);
      return (
        <View key={upgrade.id} style={styles.upgradeCard}>
          <View style={styles.upgradeHeader}>
            <Text style={styles.upgradeName}>{upgrade.name}</Text>
            {owned && <Text style={styles.ownedChip}>APPLIED</Text>}
          </View>
          <Text style={styles.upgradeDesc}>{upgrade.description}</Text>
          <Text style={styles.effectLine}>EFFECT: {upgrade.effectSummary}</Text>
          <View style={styles.reqList}>
            {reqs.map((r, i) => (
              <View key={i} style={styles.reqRow}>
                <Feather name={r.ok ? "check" : "x"} size={10} color={r.ok ? Colors.accent : Colors.danger} />
                <Text style={[styles.reqText, { color: r.ok ? Colors.text : Colors.textMuted }]}>{r.line}</Text>
              </View>
            ))}
          </View>
          <Pressable
            disabled={!check.ok}
            onPress={() => handleApply(upgrade, selectedTargetId, captain.name)}
            style={[styles.applyBtn, !check.ok && styles.applyBtnDisabled]}
          >
            <Text style={[styles.applyBtnText, !check.ok && { color: Colors.textMuted }]}>
              {owned ? "ALREADY APPLIED" : check.ok ? "APPLY UPGRADE" : "REQUIREMENTS UNMET"}
            </Text>
          </Pressable>
        </View>
      );
    });
  };

  const renderFollowerUpgrades = () => {
    if (!selectedTargetId) {
      return <Text style={styles.helperText}>Select a follower above to view eligible influence operations.</Text>;
    }
    const follower = followers.find((c) => c.id === selectedTargetId);
    if (!follower) return null;
    return upgrades.map((upgrade) => {
      const reqs = reqsMetReadout(state, upgrade);
      const check = canApplyAssetUpgrade(state, upgrade, selectedTargetId);
      const owned = followerHasUpgrade(state, selectedTargetId, upgrade.id);
      const eligible = !upgrade.followerRoles || upgrade.followerRoles.includes(follower.role);
      return (
        <View key={upgrade.id} style={[styles.upgradeCard, !eligible && { opacity: 0.55 }]}>
          <View style={styles.upgradeHeader}>
            <Text style={styles.upgradeName}>{upgrade.name}</Text>
            {owned && <Text style={styles.ownedChip}>APPLIED</Text>}
          </View>
          {upgrade.followerRoles && (
            <Text style={styles.upgradeTarget}>
              ROLES: {upgrade.followerRoles.map((r) => r.replace(/_/g, " ")).join(", ")}
            </Text>
          )}
          <Text style={styles.upgradeDesc}>{upgrade.description}</Text>
          <Text style={styles.effectLine}>EFFECT: {upgrade.effectSummary}</Text>
          <View style={styles.reqList}>
            {reqs.map((r, i) => (
              <View key={i} style={styles.reqRow}>
                <Feather name={r.ok ? "check" : "x"} size={10} color={r.ok ? Colors.accent : Colors.danger} />
                <Text style={[styles.reqText, { color: r.ok ? Colors.text : Colors.textMuted }]}>{r.line}</Text>
              </View>
            ))}
          </View>
          <Pressable
            disabled={!check.ok}
            onPress={() => handleApply(upgrade, selectedTargetId, follower.name)}
            style={[styles.applyBtn, !check.ok && styles.applyBtnDisabled]}
          >
            <Text style={[styles.applyBtnText, !check.ok && { color: Colors.textMuted }]}>
              {!eligible ? "ROLE NOT ELIGIBLE" : owned ? "ALREADY APPLIED" : check.ok ? "APPLY UPGRADE" : "REQUIREMENTS UNMET"}
            </Text>
          </Pressable>
        </View>
      );
    });
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      {renderHeader()}
      {renderTabs()}
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.banner}>
          <MaterialCommunityIcons name="information-outline" size={14} color={Colors.accent} />
          <Text style={styles.bannerText}>
            Permanent upgrades for units, retinue captains, and named followers. Upgrades consume research, items, and credits — and apply immediately.
          </Text>
        </View>

        {activeTab === "unit" && renderUnitUpgrades()}
        {activeTab === "captain" && (
          <>
            {renderCaptainTargetPicker()}
            {captains.length > 0 && renderCaptainUpgrades()}
          </>
        )}
        {activeTab === "follower" && (
          <>
            {renderFollowerTargetPicker()}
            {followers.length > 0 && renderFollowerUpgrades()}
          </>
        )}
      </ScrollView>

      <GameModal visible={modal.visible} title={modal.title} message={modal.message} buttons={modal.buttons} onDismiss={hideModal} />
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
    gap: 8,
  },
  backBtn: { marginRight: 4 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent, letterSpacing: 1 },

  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    borderRadius: 4,
  },
  tabBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  tabBtnText: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5 },
  tabBtnTextActive: { color: Colors.accent },

  body: { flex: 1 },
  bodyContent: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 60 },

  banner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "55",
    backgroundColor: Colors.accent + "12",
    borderRadius: 4,
    marginBottom: 12,
  },
  bannerText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text, lineHeight: 15 },

  helperText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginVertical: 12, lineHeight: 14 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, marginVertical: 16, lineHeight: 15, textAlign: "center" },

  targetPicker: { marginBottom: 12 },
  targetPickerLabel: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.info, letterSpacing: 0.5, marginBottom: 6 },
  targetChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  targetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    borderRadius: 4,
    minWidth: 120,
  },
  targetChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  targetChipName: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text, letterSpacing: 0.3 },
  targetChipMeta: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 2 },

  upgradeCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  upgradeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  upgradeName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, letterSpacing: 0.3, flex: 1 },
  upgradeTarget: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.info, marginBottom: 6, letterSpacing: 0.3 },
  upgradeDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 8, lineHeight: 14, fontStyle: "italic" },
  effectLine: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.accent, letterSpacing: 0.3, marginBottom: 8 },
  tierChip: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.warning, letterSpacing: 0.5 },
  ownedChip: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: Colors.accent,
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.accent + "55",
    borderRadius: 3,
  },

  reqList: { gap: 4, marginBottom: 10 },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  reqText: { fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, flex: 1 },

  applyBtn: {
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
    borderRadius: 4,
    alignItems: "center",
  },
  applyBtnDisabled: { borderColor: Colors.border, backgroundColor: Colors.bg },
  applyBtnText: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.accent, letterSpacing: 0.5 },
}));

export default withScreenBoundary(UpgradesScreen, "upgrades");

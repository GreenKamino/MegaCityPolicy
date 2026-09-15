import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const prestigeArt = require("@/assets/concept-art/prestige-city-overview.webp");
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import SectionHeader from "@/components/SectionHeader";
import TutorialHint from "@/components/TutorialHint";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import {
  LEGACY_BONUSES,
  LEGACY_TIERS,
  REBIRTH_REQUIREMENTS,
  ECOLOGICAL_LEGACY_BONUSES,
  calculateLegacyPoints,
  calculateEcologicalLegacy,
  calculateReputationScore,
  canPurchaseBonus,
  canPurchaseEcologicalBonus,
  canRebirth,
  createDefaultPrestigeState,
  normalizePrestigeState,
  getCurrentLegacyTier,
  getNextLegacyTier,
  type LegacyBonusId,
  type EcologicalLegacyBonusId,
  type PrestigeState,
} from "@/engine/prestige";

function PrestigeScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, activeProfile, performRebirth, purchasePrestigeBonus } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const [rebirthResult, setRebirthResult] = useState<{
    points: number;
    breakdown: { label: string; points: number }[];
  } | null>(null);
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const prestige: PrestigeState = useMemo(
    () => normalizePrestigeState(activeProfile?.prestigeState) ?? createDefaultPrestigeState(),
    [activeProfile?.prestigeState]
  );
  const currentTier = getCurrentLegacyTier(prestige.totalLegacyPoints);
  const nextTier = getNextLegacyTier(prestige.totalLegacyPoints);
  const { eligible, reasons } = canRebirth(state);
  const preview = useMemo(() => calculateLegacyPoints(state), [state]);
  const ecoPreview = useMemo(() => calculateEcologicalLegacy(state), [state]);
  const reputation = useMemo(() => calculateReputationScore(state), [state]);

  const handlePurchase = (bonusId: LegacyBonusId) => {
    if (!activeProfile) {
      showModal("NO PROFILE", "You must have an active commander profile to purchase legacy bonuses.", [{ text: "OK" }]);
      return;
    }
    const bonus = LEGACY_BONUSES.find(b => b.id === bonusId)!;
    const currentBonusTier = prestige.purchasedBonuses[bonusId] ?? 0;
    if (currentBonusTier >= bonus.maxTier) return;
    const cost = bonus.costPerTier[currentBonusTier];

    showModal(
      "PURCHASE UPGRADE",
      `Spend ${cost} LP to upgrade ${bonus.name} to tier ${currentBonusTier + 1}?\n\nEffect: ${bonus.effectPerTier[currentBonusTier]}`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: `SPEND ${cost} LP`,
          onPress: () => {
            purchasePrestigeBonus(bonusId);
          },
        },
      ]
    );
  };

  const handleEcoPurchase = (bonusId: EcologicalLegacyBonusId) => {
    if (!activeProfile) {
      showModal("NO PROFILE", "You must have an active commander profile to purchase ecological bonuses.", [{ text: "OK" }]);
      return;
    }
    const bonus = ECOLOGICAL_LEGACY_BONUSES.find(b => b.id === bonusId)!;
    const currentBonusTier = prestige.purchasedEcologicalBonuses[bonusId] ?? 0;
    if (currentBonusTier >= bonus.maxTier) return;
    const cost = bonus.costPerTier[currentBonusTier];

    showModal(
      "PURCHASE ECO UPGRADE",
      `Spend ${cost} EL to upgrade ${bonus.name} to tier ${currentBonusTier + 1}?\n\nEffect: ${bonus.effectPerTier[currentBonusTier]}`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: `SPEND ${cost} EL`,
          onPress: () => {
            purchasePrestigeBonus(bonusId);
          },
        },
      ]
    );
  };

  const handleRebirth = () => {
    if (!eligible) {
      showModal("NOT ELIGIBLE", reasons.join("\n\n"), [{ text: "OK" }]);
      return;
    }
    if (!activeProfile) {
      showModal("NO PROFILE", "You must have an active commander profile to perform rebirth.", [{ text: "OK" }]);
      return;
    }

    const previewText = preview.breakdown.map(b => `  ${b.label}: +${b.points} LP`).join("\n");
    const ecoText = ecoPreview.total > 0
      ? `\n\nYou will also earn ${ecoPreview.total} Ecological Legacy:\n${ecoPreview.breakdown.map(b => `  ${b.label}: +${b.points} EL`).join("\n")}`
      : "";
    showModal(
      "⚠ CONFIRM REBIRTH",
      `This will RESET your current city entirely. All buildings, population, resources, and progress will be lost.\n\nYou will earn ${preview.total} Legacy Points:\n${previewText}${ecoText}\n\nYour Legacy Points, Ecological Legacy, and purchased bonuses are permanent and will boost all future cities.\n\nThis cannot be undone.`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "REBIRTH NOW",
          style: "destructive",
          haptic: "heavy",
          onPress: () => {
            const result = performRebirth();
            if (result) {
              setRebirthResult(result);
            }
          },
        },
      ]
    );
  };

  const dismissRebirthResult = () => setRebirthResult(null);

  const tierProgress = nextTier
    ? ((prestige.totalLegacyPoints - currentTier.minLP) / (nextTier.minLP - currentTier.minLP))
    : 1;

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="star-shooting" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>PRESTIGE / REBIRTH</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TutorialHint
          id="prestige_intro"
          message="When your city falls, your legacy persists. Earn Legacy Points from your run and spend them on permanent bonuses for every future regime."
        />
        <View style={[styles.tierCard, { overflow: "hidden" }]}>
          <Image
            source={prestigeArt}
            style={{ position: "absolute", right: -20, top: -20, width: 160, height: 160, opacity: 0.08, borderRadius: 8 }}
            resizeMode="cover"
            accessible={false}
          />
          <View style={styles.tierRow}>
            <Text style={[styles.tierName, { color: currentTier.color }]}>{currentTier.name}</Text>
            <Text style={styles.tierLabel}>Tier {currentTier.tier}</Text>
          </View>
          <View style={styles.lpRow}>
            <Text style={styles.lpValue}>{prestige.totalLegacyPoints}</Text>
            <Text style={styles.lpLabel}>TOTAL LP</Text>
            <View style={styles.lpSpacer} />
            <Text style={styles.lpValue}>{prestige.availableLegacyPoints}</Text>
            <Text style={styles.lpLabel}>AVAILABLE</Text>
          </View>
          {nextTier && (
            <View style={styles.progressWrap}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(100, tierProgress * 100)}%`, backgroundColor: currentTier.color }]} />
              </View>
              <Text style={styles.progressText}>
                {prestige.totalLegacyPoints} / {nextTier.minLP} LP to {nextTier.name}
              </Text>
            </View>
          )}
          {!nextTier && (
            <Text style={[styles.progressText, { color: Colors.warning, marginTop: 6 }]}>MAX TIER ACHIEVED</Text>
          )}
          <View style={styles.statsRow}>
            <Text style={styles.statItem}>Rebirths: {prestige.timesReborn}</Text>
            <Text style={styles.statItem}>Best Run: {prestige.highestLPEarned} LP</Text>
          </View>
          <View style={[styles.lpRow, { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }]}>
            <MaterialCommunityIcons name="leaf" size={16} color="#7FCB6E" />
            <Text style={[styles.lpValue, { color: "#7FCB6E", marginLeft: 6 }]}>{prestige.totalEcologicalLegacy}</Text>
            <Text style={styles.lpLabel}>TOTAL EL</Text>
            <View style={styles.lpSpacer} />
            <Text style={[styles.lpValue, { color: "#7FCB6E" }]}>{prestige.availableEcologicalLegacy}</Text>
            <Text style={styles.lpLabel}>AVAILABLE</Text>
          </View>
          {prestige.highestEcologicalLegacyEarned > 0 && (
            <Text style={[styles.statItem, { marginTop: 4 }]}>Best Eco Run: {prestige.highestEcologicalLegacyEarned} EL</Text>
          )}
        </View>

        <SectionHeader
          title="Legacy Point Preview"
          icon={<MaterialCommunityIcons name="eye-outline" size={14} color={Colors.accent} />}
        />
        <View style={styles.previewCard}>
          <Text style={styles.previewTotal}>You would earn: <Text style={{ color: Colors.warning }}>{preview.total} LP</Text></Text>
          {preview.breakdown.map((b, i) => (
            <View key={i} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{b.label}</Text>
              <Text style={styles.breakdownPts}>+{b.points}</Text>
            </View>
          ))}
          {preview.breakdown.length === 0 && (
            <Text style={styles.dimText}>No points earned yet — grow your city!</Text>
          )}
          {ecoPreview.total > 0 && (
            <>
              <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 8 }} />
              <Text style={[styles.previewTotal, { fontSize: 13 }]}>
                <MaterialCommunityIcons name="leaf" size={12} color="#7FCB6E" /> Ecological Legacy: <Text style={{ color: "#7FCB6E" }}>{ecoPreview.total} EL</Text>
              </Text>
              {ecoPreview.breakdown.map((b, i) => (
                <View key={`eco-${i}`} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{b.label}</Text>
                  <Text style={[styles.breakdownPts, { color: "#7FCB6E" }]}>+{b.points}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        <SectionHeader
          title="Reputation Score"
          subtitle="Current city performance assessment"
          icon={<Feather name="award" size={14} color={Colors.accent} />}
        />
        <View style={styles.previewCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ color: reputation.grade === "S" ? "#FFD700" : reputation.grade === "A" ? Colors.accent : reputation.grade === "B" ? "#44AAFF" : Colors.warning, fontFamily: "Inter_700Bold", fontSize: 28 }}>
              {reputation.grade}
            </Text>
            <Text style={{ color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 18 }}>
              {reputation.score}/100
            </Text>
          </View>
          {reputation.factors.map((f, i) => (
            <View key={i} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{f.label}</Text>
              <Text style={[styles.breakdownPts, { color: f.value >= f.max * 0.8 ? Colors.accent : f.value <= f.max * 0.3 ? Colors.danger : Colors.textSecondary }]}>
                {f.value}/{f.max}
              </Text>
            </View>
          ))}
        </View>

        <SectionHeader
          title="Rebirth Requirements"
          icon={<Feather name="check-circle" size={14} color={Colors.accent} />}
        />
        <View style={styles.reqCard}>
          <ReqRow
            met={state.cityStats.population >= REBIRTH_REQUIREMENTS.minPopulation}
            label={`Population ≥ ${REBIRTH_REQUIREMENTS.minPopulation.toLocaleString()}`}
            current={state.cityStats.population.toLocaleString()}
          />
          <ReqRow
            met={state.totalTicks >= REBIRTH_REQUIREMENTS.minTicks}
            label={`Ticks played ≥ ${REBIRTH_REQUIREMENTS.minTicks}`}
            current={String(state.totalTicks)}
          />
          <ReqRow
            met={(state.unlockedTechnologies?.length ?? 0) >= REBIRTH_REQUIREMENTS.minTechResearched}
            label={`Technologies ≥ ${REBIRTH_REQUIREMENTS.minTechResearched}`}
            current={String(state.unlockedTechnologies?.length ?? 0)}
          />
        </View>

        <Pressable
          onPress={handleRebirth}
          style={({ pressed }) => [
            styles.rebirthBtn,
            !eligible && styles.rebirthBtnDisabled,
            pressed && eligible && styles.rebirthBtnPressed,
          ]}
          disabled={!eligible || !activeProfile}
        >
          <MaterialCommunityIcons
            name="reload"
            size={20}
            color={eligible ? "#000" : Colors.textMuted}
          />
          <Text style={[styles.rebirthBtnText, !eligible && { color: Colors.textMuted }]}>
            {eligible ? `REBIRTH — EARN ${preview.total} LP` : "REQUIREMENTS NOT MET"}
          </Text>
        </Pressable>

        <SectionHeader
          title="Legacy Bonuses"
          icon={<MaterialCommunityIcons name="arrow-up-bold-circle" size={14} color={Colors.accent} />}
        />
        {LEGACY_BONUSES.map(bonus => {
          const owned = prestige.purchasedBonuses[bonus.id] ?? 0;
          const maxed = owned >= bonus.maxTier;
          const canBuy = canPurchaseBonus(prestige, bonus.id);
          const nextCost = maxed ? null : bonus.costPerTier[owned];
          return (
            <Pressable
              key={bonus.id}
              style={({ pressed }) => [
                styles.bonusCard,
                canBuy && styles.bonusCardBuyable,
                pressed && canBuy && styles.bonusCardPressed,
              ]}
              onPress={() => canBuy && handlePurchase(bonus.id)}
              disabled={!canBuy}
            >
              <View style={styles.bonusHeader}>
                <MaterialCommunityIcons name={bonus.icon as React.ComponentProps<typeof MaterialCommunityIcons>["name"]} size={20} color={maxed ? Colors.warning : Colors.accent} />
                <View style={styles.bonusTitleWrap}>
                  <Text style={styles.bonusName}>{bonus.name}</Text>
                  <Text style={styles.bonusDesc}>{bonus.description}</Text>
                </View>
                <View style={styles.bonusTierBadge}>
                  <Text style={[styles.bonusTierText, maxed && { color: Colors.warning }]}>
                    {owned}/{bonus.maxTier}
                  </Text>
                </View>
              </View>
              <View style={styles.bonusTierDots}>
                {Array.from({ length: bonus.maxTier }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.tierDot,
                      i < owned ? styles.tierDotFilled : styles.tierDotEmpty,
                    ]}
                  />
                ))}
              </View>
              {owned > 0 && (
                <Text style={styles.bonusActive}>Active: {bonus.effectPerTier[owned - 1]}</Text>
              )}
              {!maxed && nextCost !== null && (
                <Text style={[styles.bonusCost, canBuy && { color: Colors.accent }]}>
                  Next: {bonus.effectPerTier[owned]} — {nextCost} LP
                </Text>
              )}
              {maxed && (
                <Text style={styles.bonusMaxed}>MAXED</Text>
              )}
            </Pressable>
          );
        })}

        <SectionHeader
          title="Ecological Legacy Bonuses"
          subtitle="Spent with EL earned from biosphere & taming"
          icon={<MaterialCommunityIcons name="leaf" size={14} color="#7FCB6E" />}
        />
        {ECOLOGICAL_LEGACY_BONUSES.map(bonus => {
          const owned = prestige.purchasedEcologicalBonuses[bonus.id] ?? 0;
          const maxed = owned >= bonus.maxTier;
          const canBuy = canPurchaseEcologicalBonus(prestige, bonus.id);
          const nextCost = maxed ? null : bonus.costPerTier[owned];
          return (
            <Pressable
              key={bonus.id}
              style={({ pressed }) => [
                styles.bonusCard,
                canBuy && { borderColor: "#7FCB6E" },
                pressed && canBuy && styles.bonusCardPressed,
              ]}
              onPress={() => canBuy && handleEcoPurchase(bonus.id)}
              disabled={!canBuy}
            >
              <View style={styles.bonusHeader}>
                <MaterialCommunityIcons name={bonus.icon as React.ComponentProps<typeof MaterialCommunityIcons>["name"]} size={20} color={maxed ? Colors.warning : "#7FCB6E"} />
                <View style={styles.bonusTitleWrap}>
                  <Text style={styles.bonusName}>{bonus.name}</Text>
                  <Text style={styles.bonusDesc}>{bonus.description}</Text>
                </View>
                <View style={styles.bonusTierBadge}>
                  <Text style={[styles.bonusTierText, maxed && { color: Colors.warning }]}>
                    {owned}/{bonus.maxTier}
                  </Text>
                </View>
              </View>
              <View style={styles.bonusTierDots}>
                {Array.from({ length: bonus.maxTier }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.tierDot,
                      i < owned ? { backgroundColor: "#7FCB6E", borderColor: "#7FCB6E" } : styles.tierDotEmpty,
                    ]}
                  />
                ))}
              </View>
              {owned > 0 && (
                <Text style={[styles.bonusActive, { color: "#7FCB6E" }]}>Active: {bonus.effectPerTier[owned - 1]}</Text>
              )}
              {!maxed && nextCost !== null && (
                <Text style={[styles.bonusCost, canBuy && { color: "#7FCB6E" }]}>
                  Next: {bonus.effectPerTier[owned]} — {nextCost} EL
                </Text>
              )}
              {maxed && (
                <Text style={styles.bonusMaxed}>MAXED</Text>
              )}
            </Pressable>
          );
        })}

        <SectionHeader
          title="Legacy Tiers"
          icon={<MaterialCommunityIcons name="stairs" size={14} color={Colors.accent} />}
        />
        <View style={styles.tiersCard}>
          {LEGACY_TIERS.map(t => {
            const reached = prestige.totalLegacyPoints >= t.minLP;
            return (
              <View key={t.tier} style={[styles.tierItem, reached && styles.tierItemReached]}>
                <View style={[styles.tierDotBig, { borderColor: t.color, backgroundColor: reached ? t.color : "transparent" }]} />
                <Text style={[styles.tierItemName, reached && { color: t.color }]}>{t.name}</Text>
                <Text style={styles.tierItemLP}>{t.minLP} LP</Text>
              </View>
            );
          })}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <GameModal {...modal} onDismiss={hideModal} />

      {rebirthResult && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <MaterialCommunityIcons name="star-shooting" size={40} color={Colors.warning} />
            <Text style={styles.resultTitle}>REBIRTH COMPLETE</Text>
            <Text style={styles.resultLP}>+{rebirthResult.points} Legacy Points earned</Text>
            {rebirthResult.breakdown.map((b, i) => (
              <Text key={i} style={styles.resultLine}>{b.label}: +{b.points}</Text>
            ))}
            <Text style={styles.resultHint}>Your city has been reset. Legacy bonuses are now active.</Text>
            <Pressable onPress={dismissRebirthResult} style={styles.resultDismiss}>
              <Text style={styles.resultDismissText}>CONTINUE</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function ReqRow({ met, label, current }: { met: boolean; label: string; current: string }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.reqRow}>
      <Feather
        name={met ? "check-circle" : "circle"}
        size={16}
        color={met ? Colors.accent : Colors.danger}
      />
      <Text style={[styles.reqLabel, met && styles.reqLabelMet]}>{label}</Text>
      <Text style={[styles.reqCurrent, met ? { color: Colors.accent } : { color: Colors.danger }]}>{current}</Text>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 2,
    flex: 1,
  },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  tierCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 8,
  },
  tierName: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    letterSpacing: 2,
  },
  tierLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
  },
  lpRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  lpValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.warning,
  },
  lpLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  lpSpacer: { width: 16 },
  progressWrap: { marginTop: 10 },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  statItem: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  previewCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  previewTotal: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 6,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  breakdownLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  breakdownPts: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
  dimText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  reqCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reqLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
  },
  reqLabelMet: {
    color: Colors.text,
  },
  reqCurrent: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  rebirthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.warning,
    borderRadius: 8,
    paddingVertical: 14,
    marginVertical: 4,
  },
  rebirthBtnDisabled: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rebirthBtnPressed: {
    opacity: 0.8,
  },
  rebirthBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#000",
    letterSpacing: 1,
  },
  bonusCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  bonusCardBuyable: {
    borderColor: Colors.accent,
  },
  bonusCardPressed: {
    opacity: 0.8,
  },
  bonusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bonusTitleWrap: {
    flex: 1,
  },
  bonusName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  bonusDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  bonusTierBadge: {
    backgroundColor: Colors.bg,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bonusTierText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: Colors.text,
  },
  bonusTierDots: {
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
    marginBottom: 4,
  },
  tierDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  tierDotFilled: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  tierDotEmpty: {
    backgroundColor: "transparent",
    borderColor: Colors.border,
  },
  bonusActive: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
    marginTop: 2,
  },
  bonusCost: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  bonusMaxed: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.warning,
    letterSpacing: 1,
    marginTop: 4,
  },
  tiersCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 6,
  },
  tierItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    opacity: 0.5,
  },
  tierItemReached: {
    opacity: 1,
  },
  tierDotBig: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  tierItemName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
  },
  tierItemLP: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  resultCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: 24,
    alignItems: "center",
    gap: 8,
    maxWidth: 360,
    width: "100%",
  },
  resultTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.warning,
    letterSpacing: 2,
    marginTop: 4,
  },
  resultLP: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.accent,
  },
  resultLine: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  resultHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 8,
  },
  resultDismiss: {
    backgroundColor: Colors.accent,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  resultDismissText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#000",
    letterSpacing: 1,
  },
}));

export default withScreenBoundary(PrestigeScreen, "prestige");

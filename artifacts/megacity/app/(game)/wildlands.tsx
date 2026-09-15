import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import StatBar from "@/components/StatBar";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { ecologyTierFor, BIOMES } from "@/engine/biomes";
import { getBiomeAggregates, type BiomeAggregate, type Trend } from "@/engine/wildlandsAggregates";
import { WILDLANDS_PROJECTS, canAffordWildlandsProject, startWildlandsProject } from "@/engine/wildlandsProjects";
import {
  MEGAFAUNA_BOSSES,
  CAPTURABLE_BEASTS,
  getCapturableForBiome,
  canAffordMegafaunaHunt,
  canStartBeastCapture,
  buildAutoHuntLoadout,
  startMegafaunaHunt,
  startBeastCapture,
  HUNT_CAPTURE_CONSTANTS,
  type MegafaunaBoss,
  type CapturableBeast,
} from "@/engine/megafaunaHunts";
import { ATTACK_TYPES } from "@/engine/strikeData";
import { getWildlandsDemandSnapshot } from "@/engine/tickProcessors";
import { getBiosphereCrisisRisk, BIOSPHERE_CRISIS_FLOOR } from "@/engine/wildlandsEcology";
import { computeBiosphereBreakdown, computeBiosphereEta } from "@/engine/biosphereBreakdown";
import { navigateToBiosphereSuggestion } from "@/utils/biosphereNavigation";
import { getBiosphereTrend } from "@/engine/biosphereTrend";
import type { WildlandsProjectKind, MegafaunaId } from "@/engine/types";
import CommandScreenHeader from "@/components/CommandScreenHeader";
import CrisisReportFrame from "@/components/CrisisReportFrame";

const KIND_ORDER: WildlandsProjectKind[] = [
  "ranger_patrol",
  "cultivation",
  "restoration",
  "cull",
  "vaccinate",
  "fence",
];

type RoleKey = "flora" | "herbivore" | "predator" | "vermin" | "megafauna" | "scavenger";

const ROLE_LABELS: Record<RoleKey, string> = {
  flora: "FLORA",
  herbivore: "HERB",
  predator: "PRED",
  vermin: "VERM",
  megafauna: "MEGA",
  scavenger: "SCAV",
};

const getRoleColors = (Colors: ThemePalette): Record<RoleKey, string> => ({
  flora: Colors.accent,
  herbivore: Colors.info,
  predator: Colors.warning,
  vermin: Colors.danger,
  megafauna: "#c084fc",
  scavenger: Colors.textMuted,
});

function trendArrow(t: "up" | "flat" | "down", Colors: ThemePalette) {
  if (t === "up") return { name: "arrow-up" as const, color: Colors.accent };
  if (t === "down") return { name: "arrow-down" as const, color: Colors.danger };
  return { name: "minus" as const, color: Colors.textMuted };
}

function formatPop(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return `${n}`;
}

const getTierColors = (Colors: ThemePalette): Record<string, string> => ({
  barren: Colors.danger,
  fragile: Colors.warning,
  stable: Colors.info,
  thriving: Colors.accent,
});

function trendIcon(trend: Trend, Colors: ThemePalette) {
  if (trend === "up") return { name: "trending-up" as const, color: Colors.accent };
  if (trend === "down") return { name: "trending-down" as const, color: Colors.danger };
  return { name: "minus" as const, color: Colors.textMuted };
}

function feedColor(kind: "threat" | "opportunity" | "info", Colors: ThemePalette): string {
  if (kind === "threat") return Colors.danger;
  if (kind === "opportunity") return Colors.accent;
  return Colors.info;
}

type FeatherName = React.ComponentProps<typeof Feather>["name"];

function feedIcon(kind: "threat" | "opportunity" | "info"): FeatherName {
  if (kind === "threat") return "alert-triangle";
  if (kind === "opportunity") return "zap";
  return "info";
}

function WildlandsScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const ROLE_COLORS = getRoleColors(Colors);
  const TIER_COLORS = getTierColors(Colors);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state, setState } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const [selectedBiomeId, setSelectedBiomeId] = useState<string | null>(null);

  const aggregates = useMemo(
    () => getBiomeAggregates(state),
    [state.districts, state.wildlandsProjects, state.wildlandsEcology],
  );
  const projects = state.wildlandsProjects ?? [];
  const activeProjects = projects.filter((p) => p.status === "active");
  const completedProjects = projects.filter((p) => p.status === "completed");

  const totalFlora = aggregates.reduce((s, a) => s + a.totalFlora, 0);
  const totalFauna = aggregates.reduce((s, a) => s + a.totalFauna, 0);
  const avgEcology = aggregates.length === 0 ? 0 : aggregates.reduce((s, a) => s + a.ecologyAvg, 0) / aggregates.length;

  const launchHunt = (boss: MegafaunaBoss, agg: BiomeAggregate) => {
    const at = ATTACK_TYPES.find((a) => a.id === boss.attackTypeId);
    if (!at) return;
    const loadout = buildAutoHuntLoadout(state, boss.id);
    const totalDeployed = Object.values(loadout).reduce((s, n) => s + n, 0);
    const afford = canAffordMegafaunaHunt(state, boss.id, loadout);
    if (!afford.ok) {
      showModal("HUNT NOT READY", afford.reason ?? "Cannot launch this hunt.", [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    const lootParts: string[] = [];
    if (boss.loot.credits) lootParts.push(`${(boss.loot.credits / 1000).toFixed(0)}k credits`);
    if (boss.loot.steel) lootParts.push(`${boss.loot.steel} steel`);
    if (boss.loot.ammo) lootParts.push(`${boss.loot.ammo} ammo`);
    if (boss.loot.medSupplies) lootParts.push(`${boss.loot.medSupplies} meds`);
    if (boss.loot.water) lootParts.push(`${boss.loot.water} water`);
    showModal(
      `HUNT: ${boss.name}`,
      `Biome: ${agg.name}\nCost: ${at.creditsCost.toLocaleString()} CR · ${at.ammoCost} ammo · ${at.fuelCost} fuel\nForce: ${totalDeployed} units (auto-drawn from roster)\nDuration: ${boss.durationTicks} ticks\n\n${boss.description}\n\nLoot on success: ${lootParts.join(", ")}\nFailure penalty: ${boss.ecologyOnFailure} ecology, morale loss, heavy casualties.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "LAUNCH HUNT",
          style: "destructive",
          onPress: () => setState((prev) => startMegafaunaHunt(prev, boss.id, agg.biome, loadout)),
        },
      ],
    );
  };

  const launchCapture = (beast: CapturableBeast, agg: BiomeAggregate) => {
    const check = canStartBeastCapture(state, agg.biome, beast.unitKey);
    if (!check.ok) {
      showModal("CAPTURE NOT READY", check.reason ?? "Cannot launch capture.", [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    const c = HUNT_CAPTURE_CONSTANTS;
    showModal(
      `CAPTURE: ${beast.label}`,
      `Biome: ${agg.name}\nCost: ${c.CAPTURE_BASE_COST.credits.toLocaleString()} CR · ${c.CAPTURE_BASE_COST.fuel} fuel · ${c.CAPTURE_BASE_COST.medSupplies} meds\nWranglers deployed: ${c.WRANGLERS_PER_CAPTURE}\nDuration: ${c.CAPTURE_DURATION_TICKS} ticks attempt + ${beast.tameTicks} ticks taming\n\n${beast.description}\n\nSuccess: ${beast.capturePerAttempt.min}-${beast.capturePerAttempt.max} live specimens enter the taming queue.\nFailure: wranglers lost, ecology damaged.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "LAUNCH CAPTURE",
          style: "destructive",
          onPress: () => setState((prev) => startBeastCapture(prev, agg.biome, beast.unitKey)),
        },
      ],
    );
  };

  const launch = (kind: WildlandsProjectKind, agg: BiomeAggregate) => {
    const def = WILDLANDS_PROJECTS[kind];
    const afford = canAffordWildlandsProject(state, kind);
    if (!afford.ok) {
      showModal("INSUFFICIENT RESOURCES", afford.reason ?? "Cannot afford this operation.", [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    const costParts: string[] = [`${def.cost.credits.toLocaleString()} CR`];
    if (def.cost.fuel) costParts.push(`${def.cost.fuel} fuel`);
    if (def.cost.water) costParts.push(`${def.cost.water} water`);
    if (def.cost.medSupplies) costParts.push(`${def.cost.medSupplies} med`);
    showModal(
      def.name,
      `Biome: ${agg.name}\nCost: ${costParts.join(" · ")}\nDuration: ${def.duration} ticks\n\n${def.description}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "LAUNCH",
          style: "destructive",
          onPress: () => setState((prev) => startWildlandsProject(prev, kind, agg.biome)),
        },
      ],
    );
  };

  const renderHeader = () => (
    <View style={styles.statsGrid}>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>BIOMES TRACKED</Text>
        <Text style={styles.statValue}>{aggregates.length}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>AVG ECOLOGY</Text>
        <Text style={styles.statValue}>{Math.round(avgEcology)}%</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>FLORA POPULATION</Text>
        <Text style={styles.statValue}>{Math.round(totalFlora / 1000).toLocaleString()}K</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>FAUNA POPULATION</Text>
        <Text style={styles.statValue}>{Math.round(totalFauna / 1000).toLocaleString()}K</Text>
      </View>
    </View>
  );

  const renderBiosphereTrendCallout = () => {
    const trend = getBiosphereTrend(state);
    if (!trend) return null;

    const recovering = trend.direction === "recovering";
    const tone = recovering ? Colors.statHigh : Colors.statLow;
    return (
      <View
        style={[styles.bioTrendCard, { borderColor: tone }]}
        accessibilityRole="text"
        accessibilityLabel={`Biosphere ${trend.label}. ${trend.headline} ${trend.detail}`}
      >
        <View style={styles.bioTrendHeader}>
          <Feather
            name={recovering ? "trending-up" : "trending-down"}
            size={14}
            color={tone}
          />
          <Text style={[styles.bioTrendBadge, { color: tone }]}>
            BIOSPHERE · {trend.label}
          </Text>
        </View>
        <Text style={styles.bioTrendHeadline}>{trend.headline}</Text>
        <Text style={styles.bioTrendDetail}>{trend.detail}</Text>
      </View>
    );
  };

  const renderBiosphereBreakdownCard = () => {
    const b = computeBiosphereBreakdown(state);
    const net = b.netPerTick;
    const dir = net > 0.05 ? "recovering" : net < -0.05 ? "degrading" : "holding";
    const tone =
      dir === "recovering" ? Colors.accent : dir === "degrading" ? Colors.danger : Colors.warning;
    const chipLabel =
      dir === "recovering" ? "RECOVERING" : dir === "degrading" ? "DEGRADING" : "HOLDING";
    const fmt = (n: number) => `${n >= 0 ? "+" : ""}${(Math.round(n * 10) / 10).toFixed(1)}`;
    const gains = b.positives.slice(0, 4);
    const drains = b.negatives.slice(0, 4);
    const tips = b.suggestions.slice(0, 3);
    const eta = computeBiosphereEta(b);
    const etaText = eta
      ? eta.direction === "recovering"
        ? `Healthy (${eta.target}) in ~${eta.ticks} tick${eta.ticks === 1 ? "" : "s"} at this pace`
        : `Hits the floor (${eta.target}) in ~${eta.ticks} tick${eta.ticks === 1 ? "" : "s"} at this pace`
      : null;
    return (
      <View style={styles.bioBrkCard}>
        <View style={styles.riskHeader}>
          <MaterialCommunityIcons name="leaf" size={14} color={tone} />
          <Text style={[styles.riskTitle, { color: tone }]}>BIOSPHERE BREAKDOWN</Text>
          <View style={[styles.riskChip, { backgroundColor: tone + "22", borderColor: tone + "55" }]}>
            <Text style={[styles.riskChipText, { color: tone }]}>{chipLabel}</Text>
          </View>
        </View>
        <Text style={styles.riskHeadline}>
          Biosphere {Math.round(b.biosphere)} · {fmt(net)} / tick
        </Text>
        {etaText && (
          <Text style={[styles.bioBrkEta, { color: tone }]}>{etaText}</Text>
        )}
        <View style={styles.bioBrkCols}>
          <View style={styles.bioBrkCol}>
            <Text style={[styles.bioBrkColLabel, { color: Colors.accent }]}>GAINS</Text>
            {gains.length === 0 ? (
              <Text style={styles.bioBrkEmpty}>None yet</Text>
            ) : (
              gains.map((c) => (
                <View key={`g-${c.label}`} style={styles.bioBrkRow}>
                  <Text style={styles.bioBrkRowLabel} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[styles.bioBrkRowAmt, { color: Colors.accent }]}>{fmt(c.amount)}</Text>
                </View>
              ))
            )}
          </View>
          <View style={styles.bioBrkCol}>
            <Text style={[styles.bioBrkColLabel, { color: Colors.danger }]}>DRAINS</Text>
            {drains.length === 0 ? (
              <Text style={styles.bioBrkEmpty}>None</Text>
            ) : (
              drains.map((c) => (
                <View key={`d-${c.label}`} style={styles.bioBrkRow}>
                  <Text style={styles.bioBrkRowLabel} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[styles.bioBrkRowAmt, { color: Colors.danger }]}>{fmt(c.amount)}</Text>
                </View>
              ))
            )}
          </View>
        </View>
        {tips.length > 0 && (
          <View style={styles.bioBrkTips}>
            {tips.map((t, i) => {
              const tappable = !!t.target;
              const rowContent = (
                <>
                  <Text style={[styles.bioBrkTipDot, tappable && { color: Colors.accent }]}>›</Text>
                  <Text style={[styles.bioBrkTipText, tappable && styles.bioBrkTipTextLink]}>
                    {t.text}
                  </Text>
                  {tappable && (
                    <Feather name="chevron-right" size={13} color={Colors.accent} style={styles.bioBrkTipChevron} />
                  )}
                </>
              );
              if (!tappable) {
                return (
                  <View key={`t-${i}`} style={styles.bioBrkTipRow}>
                    {rowContent}
                  </View>
                );
              }
              return (
                <Pressable
                  key={`t-${i}`}
                  onPress={() => navigateToBiosphereSuggestion(t.target!)}
                  style={({ pressed }) => [styles.bioBrkTipRow, styles.bioBrkTipRowTappable, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.text} Tap to go there.`}
                >
                  {rowContent}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderCrisisRiskCard = () => {
    const biosphere = Math.round(state.cityStats?.biosphere ?? 50);
    const risk = getBiosphereCrisisRisk(biosphere);
    const tone =
      risk.tier === "low" ? Colors.accent : risk.tier === "easing" ? Colors.warning : Colors.danger;
    const tierLabel =
      risk.tier === "low" ? "LOW" : risk.tier === "easing" ? "EASING" : "HIGH";
    const headline =
      risk.reductionPct <= 0
        ? "Nature crises at full frequency"
        : risk.tier === "low"
        ? "Nature crises held low"
        : "Nature crises easing";
    const body =
      risk.reductionPct <= 0
        ? `Your biosphere is near its floor, so nature crises fire at full odds. Raise the biosphere with green infrastructure and restoration to start calming them — odds are full at biosphere ${BIOSPHERE_CRISIS_FLOOR} and roughly halved at 100.`
        : `A healthier biosphere is calming nature crises — about ${risk.reductionPct}% fewer than a barren sector. Keep it climbing: odds are full at biosphere ${BIOSPHERE_CRISIS_FLOOR} and roughly halved at 100.`;
    const fillPct = Math.min(100, Math.round((risk.reductionPct / 50) * 100));
    return (
      <View style={styles.riskCard}>
        <View style={styles.riskHeader}>
          <Feather name="shield" size={13} color={tone} />
          <Text style={[styles.riskTitle, { color: tone }]}>NATURE CRISIS RISK</Text>
          <View style={[styles.riskChip, { backgroundColor: tone + "22", borderColor: tone + "55" }]}>
            <Text style={[styles.riskChipText, { color: tone }]}>{tierLabel}</Text>
          </View>
        </View>
        <Text style={styles.riskHeadline}>{headline}</Text>
        <View style={styles.riskTrack}>
          <View style={[styles.riskFill, { width: `${fillPct}%`, backgroundColor: tone }]} />
        </View>
        <View style={styles.riskScale}>
          <Text style={styles.riskScaleText}>Biosphere {biosphere}</Text>
          <Text style={styles.riskScaleText}>
            {risk.reductionPct > 0 ? `-${risk.reductionPct}% crises` : "full crisis odds"}
          </Text>
        </View>
        <Text style={styles.riskSub}>{body}</Text>
      </View>
    );
  };

  const renderDemandCard = () => {
    const snapshot = getWildlandsDemandSnapshot(state);
    if (!snapshot.active) return null;
    const pct = Math.round(snapshot.ratio * 100);
    const tone =
      pct >= 85 ? Colors.accent : pct >= 40 ? Colors.warning : Colors.danger;
    const headline =
      pct >= 85
        ? "Markets well supplied"
        : pct >= 40
        ? "Markets partially supplied"
        : "Markets running short";
    const tracked = snapshot.rows.filter((r) => r.demand > 0).slice(0, 6);
    return (
      <View style={styles.demandCard}>
        <View style={styles.demandHeader}>
          <MaterialCommunityIcons name="basket" size={14} color={tone} />
          <Text style={[styles.demandTitle, { color: tone }]}>CITY DEMAND  {pct}%</Text>
          <Text style={styles.demandHeadline}>{headline}</Text>
        </View>
        <Text style={styles.demandSub}>
          City consumes wildlands goods every tick scaled to population. Meat & livestock add to food, herbs & antitoxin stock clinics and lower disease risk, biomass adds fuel, hides add goods, pelts/ivory/pheromones/gene samples earn credits and research. Persistent shortages cost happiness and add unrest.
        </Text>
        <View style={styles.demandRowsWrap}>
          {tracked.map((row) => {
            const rowPct = row.demand > 0 ? row.satisfied / row.demand : 0;
            const rowColor =
              rowPct >= 0.85 ? Colors.accent : rowPct >= 0.4 ? Colors.warning : Colors.danger;
            return (
              <View key={row.id} style={styles.demandRow}>
                <Text style={styles.demandRowLabel} numberOfLines={1}>{row.label}</Text>
                <Text style={[styles.demandRowValue, { color: rowColor }]}>
                  {row.satisfied >= 1 ? row.satisfied.toFixed(0) : row.satisfied.toFixed(1)} / {row.demand >= 1 ? row.demand.toFixed(0) : row.demand.toFixed(1)} per tick
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderActiveProjects = () => {
    if (activeProjects.length === 0) return null;
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.sectionTitle}>ACTIVE OPERATIONS</Text>
        {activeProjects.map((p) => {
          const def = WILDLANDS_PROJECTS[p.kind];
          const biomeDef = BIOMES[p.biome as keyof typeof BIOMES];
          const pct = Math.round(((p.totalTicks - p.ticksRemaining) / p.totalTicks) * 100);
          return (
            <View key={p.id} style={styles.opCard}>
              <View style={styles.opHeader}>
                <MaterialCommunityIcons name="leaf-maple" size={14} color={Colors.accent} />
                <Text style={styles.opName}>{def.short}</Text>
                <Text style={styles.opBiome}>{biomeDef?.shortName ?? p.biome}</Text>
                <Text style={styles.opTicks}>{p.ticksRemaining} ticks left</Text>
              </View>
              <View style={styles.opTrack}>
                <View style={[styles.opFill, { width: `${pct}%` }]} />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderCompletedFeed = () => {
    if (completedProjects.length === 0) return null;
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.sectionTitle}>RECENT RESULTS</Text>
        {completedProjects.slice(0, 4).map((p) => {
          const def = WILDLANDS_PROJECTS[p.kind];
          const biomeDef = BIOMES[p.biome as keyof typeof BIOMES];
          return (
            <View key={p.id} style={styles.resultRow}>
              <Feather name="check" size={12} color={Colors.accent} />
              <Text style={styles.resultText}>
                <Text style={styles.resultName}>{def.short}</Text>
                {" "}— {biomeDef?.shortName ?? p.biome}: {p.result ?? def.resultText}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="leaf-off" size={36} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>NO WILDLANDS DATA</Text>
      <Text style={styles.emptyText}>
        Your sector has no surveyed biomes yet. Establish district control to begin ecological monitoring.
      </Text>
      <Pressable onPress={() => router.push("/(game)/districts")} style={styles.emptyBtn}>
        <Text style={styles.emptyBtnText}>OPEN SECTOR MAP</Text>
      </Pressable>
    </View>
  );

  const renderBiomeCard = (agg: BiomeAggregate) => {
    const isSelected = selectedBiomeId === agg.biome;
    const tier = ecologyTierFor(agg.ecologyAvg);
    const trendDef = trendIcon(agg.trend, Colors);
    return (
      <View key={agg.biome}>
        <Pressable
          onPress={() => setSelectedBiomeId(isSelected ? null : agg.biome)}
          style={[styles.biomeCard, isSelected && styles.biomeCardSelected]}
        >
          <View style={styles.biomeHeader}>
            <View style={[styles.biomeDot, { backgroundColor: agg.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.biomeName}>{agg.name}</Text>
              <Text style={styles.biomeSub}>
                {agg.districtCount} sector{agg.districtCount === 1 ? "" : "s"} · Dominant: {agg.dominantSpeciesName}
              </Text>
            </View>
            <View style={[styles.tierChip, { backgroundColor: TIER_COLORS[tier] + "22", borderColor: TIER_COLORS[tier] + "55" }]}>
              <Text style={[styles.tierChipText, { color: TIER_COLORS[tier] }]}>{tier.toUpperCase()}</Text>
            </View>
          </View>

          <View style={{ marginTop: 6, marginBottom: 8 }}>
            <StatBar label="ECOLOGY" value={Math.round(agg.ecologyAvg)} compact />
          </View>

          <View style={styles.popRow}>
            {(["flora", "herbivore", "predator", "vermin", "megafauna", "scavenger"] as RoleKey[])
              .filter((r) => r !== "megafauna" || agg.populations.megafauna > 0)
              .map((role) => {
                const pop = agg.populations[role];
                const arrow = trendArrow(agg.populationTrends[role], Colors);
                const color = ROLE_COLORS[role];
                return (
                  <View key={role} style={[styles.popPill, { borderColor: color + "55" }]}>
                    <Text style={[styles.popText, { color }]}>{ROLE_LABELS[role]}</Text>
                    <Text style={styles.popText}>{formatPop(pop)}</Text>
                    <Feather name={arrow.name} size={10} color={arrow.color} />
                  </View>
                );
              })}
            <View style={[styles.popPill, { borderColor: trendDef.color + "55" }]}>
              <Feather name={trendDef.name} size={11} color={trendDef.color} />
              <Text style={[styles.popText, { color: trendDef.color }]}>
                {agg.delta > 0 ? "+" : ""}{Math.round(agg.delta)} vs base
              </Text>
            </View>
            {agg.vaccinated && (
              <View style={[styles.popPill, { borderColor: Colors.info + "55" }]}>
                <MaterialCommunityIcons name="needle" size={10} color={Colors.info} />
                <Text style={[styles.popText, { color: Colors.info }]}>VACCINATED</Text>
              </View>
            )}
            {agg.fenced && (
              <View style={[styles.popPill, { borderColor: Colors.warning + "55" }]}>
                <Feather name="shield" size={10} color={Colors.warning} />
                <Text style={[styles.popText, { color: Colors.warning }]}>FENCED</Text>
              </View>
            )}
          </View>

          {agg.feed.length > 0 && (
            <View style={styles.feedList}>
              {agg.feed.map((item) => (
                <View key={item.id} style={styles.feedRow}>
                  <Feather name={feedIcon(item.kind)} size={11} color={feedColor(item.kind, Colors)} />
                  <Text style={[styles.feedText, { color: feedColor(item.kind, Colors) }]}>{item.text}</Text>
                </View>
              ))}
            </View>
          )}
        </Pressable>

        {isSelected && (
          <View style={styles.actionPanel}>
            <Text style={styles.actionPanelTitle}>OPERATIONS</Text>
            <Text style={styles.actionPanelDesc}>{agg.description}</Text>
            {KIND_ORDER.map((kind) => {
              const def = WILDLANDS_PROJECTS[kind];
              const afford = canAffordWildlandsProject(state, kind);
              const costParts: string[] = [`${def.cost.credits.toLocaleString()} CR`];
              if (def.cost.fuel) costParts.push(`${def.cost.fuel} fuel`);
              if (def.cost.water) costParts.push(`${def.cost.water} water`);
              if (def.cost.medSupplies) costParts.push(`${def.cost.medSupplies} med`);
              return (
                <Pressable
                  key={kind}
                  onPress={() => launch(kind, agg)}
                  disabled={!afford.ok}
                  style={[styles.actionBtn, !afford.ok && styles.actionBtnDisabled]}
                >
                  <View style={styles.actionBtnHeader}>
                    <Text style={styles.actionBtnName}>{def.short}</Text>
                    <Text style={[styles.actionBtnCost, !afford.ok && { color: Colors.danger }]}>{costParts.join(" · ")}</Text>
                  </View>
                  <Text style={styles.actionBtnDesc}>{def.description}</Text>
                  <Text style={styles.actionBtnMeta}>
                    Duration: {def.duration} ticks · +{def.ecologyDelta} ecology to biome sectors
                  </Text>
                </Pressable>
              );
            })}

            {(() => {
              const huntableHere = (Object.values(MEGAFAUNA_BOSSES) as MegafaunaBoss[])
                .filter((b) => b.preferredBiomes.includes(agg.biome));
              if (huntableHere.length === 0 || agg.populations.megafauna <= 0) return null;
              return (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.subSectionTitle}>BIG GAME HUNTS</Text>
                  {huntableHere.map((boss) => {
                    const at = ATTACK_TYPES.find((a) => a.id === boss.attackTypeId);
                    if (!at) return null;
                    const probe = canAffordMegafaunaHunt(state, boss.id, buildAutoHuntLoadout(state, boss.id));
                    return (
                      <Pressable
                        key={boss.id}
                        onPress={() => launchHunt(boss, agg)}
                        disabled={!probe.ok}
                        style={[styles.actionBtn, !probe.ok && styles.actionBtnDisabled, { borderColor: Colors.warning + "55" }]}
                      >
                        <View style={styles.actionBtnHeader}>
                          <Text style={styles.actionBtnName}>{boss.name}</Text>
                          <Text style={[styles.actionBtnCost, { color: Colors.warning }]}>
                            {at.creditsCost.toLocaleString()} CR · {at.minUnits}+ units
                          </Text>
                        </View>
                        <Text style={styles.actionBtnDesc}>{boss.description}</Text>
                        <Text style={[styles.actionBtnMeta, { color: Colors.warning }]}>
                          Duration: {boss.durationTicks} ticks · High risk · Heavy casualties expected
                        </Text>
                        {!probe.ok && (
                          <Text style={[styles.actionBtnMeta, { color: Colors.danger, marginTop: 2 }]}>
                            {probe.reason}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })()}

            {(() => {
              const capturable = getCapturableForBiome(agg.biome);
              if (capturable.length === 0) return null;
              return (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.subSectionTitle}>LIVE CAPTURE</Text>
                  {capturable.map((beast) => {
                    const probe = canStartBeastCapture(state, agg.biome, beast.unitKey);
                    return (
                      <Pressable
                        key={beast.unitKey}
                        onPress={() => launchCapture(beast, agg)}
                        disabled={!probe.ok}
                        style={[styles.actionBtn, !probe.ok && styles.actionBtnDisabled, { borderColor: Colors.info + "55" }]}
                      >
                        <View style={styles.actionBtnHeader}>
                          <Text style={styles.actionBtnName}>{beast.label}</Text>
                          <Text style={[styles.actionBtnCost, { color: Colors.info }]}>
                            {HUNT_CAPTURE_CONSTANTS.CAPTURE_BASE_COST.credits.toLocaleString()} CR · {HUNT_CAPTURE_CONSTANTS.WRANGLERS_PER_CAPTURE} wranglers
                          </Text>
                        </View>
                        <Text style={styles.actionBtnDesc}>{beast.description}</Text>
                        <Text style={[styles.actionBtnMeta, { color: Colors.info }]}>
                          Capture: {beast.capturePerAttempt.min}-{beast.capturePerAttempt.max} units · Tame: {beast.tameTicks} ticks
                        </Text>
                        {!probe.ok && (
                          <Text style={[styles.actionBtnMeta, { color: Colors.danger, marginTop: 2 }]}>
                            {probe.reason}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })()}
          </View>
        )}
      </View>
    );
  };

  const renderTamingQueue = () => {
    const queue = state.tamingQueue ?? [];
    if (queue.length === 0) return null;
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.sectionTitle}>TAMING QUEUE</Text>
        {queue.map((t) => {
          const pct = Math.round(((t.totalTicks - t.ticksRemaining) / t.totalTicks) * 100);
          const biomeDef = BIOMES[t.biome as keyof typeof BIOMES];
          return (
            <View key={t.id} style={styles.opCard}>
              <View style={styles.opHeader}>
                <MaterialCommunityIcons name="paw" size={14} color={Colors.info} />
                <Text style={styles.opName}>{t.beastLabel} ×{t.count}</Text>
                <Text style={styles.opBiome}>{biomeDef?.shortName ?? t.biome}</Text>
                <Text style={styles.opTicks}>{t.ticksRemaining} ticks left</Text>
              </View>
              <View style={styles.opTrack}>
                <View style={[styles.opFill, { width: `${pct}%`, backgroundColor: Colors.info }]} />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <CommandScreenHeader
        icon="globe"
        title="WILDLANDS"
        subtitle="biosphere watch · restoration · frontier operations"
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {aggregates.length === 0 ? (
          renderEmpty()
        ) : (
          <>
            <CrisisReportFrame
              title="BIOSPHERE POSTURE"
              icon="globe"
              tone={avgEcology < 20 ? "danger" : avgEcology < 40 ? "warning" : "statHigh"}
              statusLabel={avgEcology < 20 ? "COLLAPSING" : avgEcology < 40 ? "CRITICAL" : avgEcology < 65 ? "STRAINED" : "STABLE"}
              severityLabel={avgEcology < 20 ? "COLLAPSING" : avgEcology < 40 ? "CRITICAL" : avgEcology < 65 ? "STRAINED" : "STABLE"}
              headline={`Average ecology ${Math.round(avgEcology)}% · restoration lowers crisis pressure over time`}
              consequence="Ecological crises can kill residents and destroy capacity. Restoration reduces frequency and severity; it does not erase the next event."
              details={<Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11 }}>{activeProjects.length} active operation{activeProjects.length === 1 ? "" : "s"} · {aggregates.length} biome{aggregates.length === 1 ? "" : "s"} tracked</Text>}
              detailsLabel="FRONTIER STATUS / MITIGATION"
            />
            {renderHeader()}
            {renderBiosphereTrendCallout()}
            {renderBiosphereBreakdownCard()}
            {renderCrisisRiskCard()}
            {renderDemandCard()}
            {projects.length === 0 && (
              <View style={styles.unlockBanner}>
                <MaterialCommunityIcons name="information-outline" size={14} color={Colors.accent} />
                <Text style={styles.unlockBannerText}>
                  No wildlands operations underway. Dispatch a ranger patrol from any biome below to begin recovering the sector ecology. Dedicated wildlands buildings — apothecaries, tanneries, bioreserves, gene vaults — are available under the Wildlands construction category.
                </Text>
              </View>
            )}
            {renderActiveProjects()}
            {renderTamingQueue()}
            {renderCompletedFeed()}
            <Text style={styles.sectionTitle}>BIOMES</Text>
            <Text style={styles.helperText}>
              Select a biome to dispatch ranger patrols, start cultivation, or run restoration. Tap a card to expand operations.
            </Text>
            {aggregates.map((agg) => renderBiomeCard(agg))}
          </>
        )}
      </ScrollView>

      <GameModal visible={modal.visible} title={modal.title} message={modal.message} buttons={modal.buttons} onDismiss={hideModal} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 8 : 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8 },
  backBtn: { marginRight: 4 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent, letterSpacing: 1 },
  body: { flex: 1 },
  bodyContent: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 60 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: Platform.OS === "web" ? 10 : 16 },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: Platform.OS === "web" ? 10 : 12 },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 8, color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.accent },

  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.info, letterSpacing: 0.5, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 4 },
  riskCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: Platform.OS === "web" ? 10 : 12, marginBottom: Platform.OS === "web" ? 10 : 16 },
  riskHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  riskTitle: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.8, flex: 1 },
  riskChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3, borderWidth: 1 },
  riskChipText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
  riskHeadline: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text, marginBottom: 8 },
  bioBrkEta: { fontFamily: "Inter_600SemiBold", fontSize: 11, marginTop: -4, marginBottom: 8 },
  riskTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden" },
  riskFill: { height: "100%", borderRadius: 3 },
  riskScale: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 8 },
  riskScaleText: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.textMuted, letterSpacing: 0.3 },
  riskSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, lineHeight: 14 },
  bioBrkCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: Platform.OS === "web" ? 10 : 12, marginBottom: Platform.OS === "web" ? 10 : 16 },
  bioBrkCols: { flexDirection: "row", gap: 16, marginTop: 4, marginBottom: 8 },
  bioBrkCol: { flex: 1, gap: 4 },
  bioBrkColLabel: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.6, marginBottom: 2 },
  bioBrkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 },
  bioBrkRowLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, flex: 1 },
  bioBrkRowAmt: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  bioBrkEmpty: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, fontStyle: "italic" },
  bioBrkTips: { gap: 3, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
  bioBrkTipRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  bioBrkTipRowTappable: { paddingVertical: 3 },
  bioBrkTipDot: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.accent, lineHeight: 15 },
  bioBrkTipText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, lineHeight: 15, flex: 1 },
  bioBrkTipTextLink: { color: Colors.text, textDecorationLine: "underline" },
  bioBrkTipChevron: { marginTop: 1 },
  bioTrendCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderRadius: 6, padding: Platform.OS === "web" ? 10 : 12, marginBottom: Platform.OS === "web" ? 10 : 16 },
  bioTrendHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  bioTrendBadge: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.7 },
  bioTrendHeadline: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text, marginBottom: 5 },
  bioTrendDetail: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, lineHeight: 14 },
  demandCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: Platform.OS === "web" ? 10 : 12, marginBottom: Platform.OS === "web" ? 10 : 16 },
  demandHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" },
  demandTitle: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.8 },
  demandHeadline: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, marginLeft: 4 },
  demandSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, lineHeight: 14, marginBottom: 8 },
  demandRowsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  demandRow: { flexBasis: "48%", flexGrow: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 6 },
  demandRowLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.text, flexShrink: 1, marginRight: 6 },
  demandRowValue: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.3 },
  subSectionTitle: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.warning, letterSpacing: 1, marginBottom: 6, marginTop: 2 },
  helperText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 12, lineHeight: 14 },

  opCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 10, marginBottom: 6 },
  opHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  opName: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text, flex: 1 },
  opBiome: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5 },
  opTicks: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.warning },
  opTrack: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: "hidden" },
  opFill: { height: "100%", backgroundColor: Colors.accent },

  resultRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 4 },
  resultText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, lineHeight: 14 },
  resultName: { fontFamily: "Inter_700Bold", color: Colors.accent },

  biomeCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  biomeCardSelected: { borderColor: Colors.accent },
  biomeHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  biomeDot: { width: 10, height: 10, borderRadius: 5 },
  biomeName: { fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.text, letterSpacing: 0.5 },
  biomeSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  tierChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3, borderWidth: 1 },
  tierChipText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },

  popRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  popPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 3, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  popText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: Colors.text, letterSpacing: 0.5 },

  feedList: { borderTopWidth: 1, borderTopColor: Colors.border + "55", paddingTop: 6, gap: 4 },
  feedRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  feedText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14 },

  actionPanel: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.accent + "44", borderRadius: 6, padding: 12, marginBottom: 12, marginTop: -4 },
  actionPanelTitle: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.accent, letterSpacing: 1, marginBottom: 4 },
  actionPanelDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 10, lineHeight: 14, fontStyle: "italic" },
  actionBtn: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, marginBottom: 6 },
  actionBtnDisabled: { opacity: 0.55 },
  actionBtnHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  actionBtnName: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text, letterSpacing: 0.5 },
  actionBtnCost: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.accent },
  actionBtnDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 4, lineHeight: 14 },
  actionBtnMeta: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.info, letterSpacing: 0.3 },

  unlockBanner: {
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
  unlockBannerText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.text,
    lineHeight: 15,
  },
  emptyState: { alignItems: "center", padding: 24, gap: 8, marginTop: 40 },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, letterSpacing: 1, marginTop: 8 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center", lineHeight: 16, marginBottom: 12 },
  emptyBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  emptyBtnText: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.accent, letterSpacing: 1 },
}));

export default withScreenBoundary(WildlandsScreen, "wildlands");

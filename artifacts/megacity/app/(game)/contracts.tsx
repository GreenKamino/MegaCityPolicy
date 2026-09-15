import { Feather } from "@expo/vector-icons";
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
import SectionHeader from "@/components/SectionHeader";
import TutorialHint from "@/components/TutorialHint";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  CONTRACT_TEMPLATES,
  CONTRACT_TEMPLATES_MAP,
  CONTRACTORS_MAP,
  CONTRACT_CATEGORY_LABELS,
  CONTRACT_CATEGORY_ICONS,
  CONTRACT_EXPIRY_MULTIPLIER,
  CONTRACT_EXPIRY_RECOVERY_RATE,
  computeContractExpiryRecovery,
  forecastContractGoodsCommitment,
} from "@/engine/contracts";
import type { ContractDef, ContractInstance, ProcurementMethod } from "@/engine/types";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import {
  computeCityTraitMultipliers,
  listCityTraitContributions,
  type CityTraitContribution,
} from "@/engine/namedCharacters";

function formatTraitLabel(trait: string): string {
  return trait
    .split("_")
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("-");
}

function formatMultDelta(mult: number): string {
  const pct = (mult - 1) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return "+0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function CityTraitInfluenceBanner({
  contractDelayMult,
  contributions,
}: {
  contractDelayMult: number;
  contributions: CityTraitContribution[];
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  if (contractDelayMult === 1) return null;
  if (contributions.length === 0) return null;
  const slows = contractDelayMult > 1;
  const accent = slows ? Colors.warning : Colors.accent;
  const summary = `${formatMultDelta(contractDelayMult)} contract delivery delay`;
  return (
    <View style={[styles.cityInfluenceBox, { borderColor: accent }]}>
      <View style={styles.cityInfluenceHeader}>
        <Feather
          name={slows ? "alert-triangle" : "check-circle"}
          size={12}
          color={accent}
        />
        <Text style={[styles.cityInfluenceTitle, { color: accent }]}>
          NPC INFLUENCE &middot; {summary}
        </Text>
      </View>
      <Text style={styles.cityInfluenceSub}>
        Active named figures shaping city-wide contract delivery:
      </Text>
      {contributions.map((c, idx) => (
        <Text
          key={`${c.characterId}-${c.trait}-${idx}`}
          style={styles.cityInfluenceRow}
          numberOfLines={2}
        >
          <Text style={{ color: Colors.text, fontFamily: "Inter_700Bold" }}>
            {c.characterName}
          </Text>
          <Text style={{ color: Colors.textMuted }}>
            {" "}
            &lsquo;{formatTraitLabel(c.trait)}&rsquo;
          </Text>
          <Text style={{ color: Colors.textSecondary }}> &rarr; </Text>
          <Text style={{ color: accent }}>
            {formatMultDelta(c.contractDelayMult)} delivery delay
          </Text>
        </Text>
      ))}
    </View>
  );
}


type TabKey = "available" | "active" | "completed" | "policies";

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "available", label: "AVAILABLE", icon: "inbox" },
  { key: "active", label: "ACTIVE", icon: "play-circle" },
  { key: "completed", label: "COMPLETED", icon: "check-circle" },
  { key: "policies", label: "POLICIES", icon: "clipboard" },
];

const CATEGORY_TABS: Array<{ key: string; label: string; icon: string }> = [
  { key: "all", label: "ALL", icon: "list" },
  { key: "construction", label: "BUILD", icon: "home" },
  { key: "supply", label: "SUPPLY", icon: "truck" },
  { key: "utility", label: "UTILITY", icon: "zap" },
  { key: "civic", label: "CIVIC", icon: "users" },
  { key: "security", label: "SECURITY", icon: "shield" },
  { key: "industrial", label: "INDUSTRY", icon: "settings" },
  { key: "emergency", label: "EMERGENCY", icon: "alert-triangle" },
  { key: "blackBudget", label: "BLACK OPS", icon: "eye-off" },
];

const PROCUREMENT_LABELS: Record<ProcurementMethod, string> = {
  openTender: "OPEN TENDER",
  directAward: "DIRECT AWARD",
  emergencyAuth: "EMERGENCY AUTH",
};

const PROCUREMENT_DESCRIPTIONS: Record<ProcurementMethod, string> = {
  openTender: "Lower cost, slower start, more transparent",
  directAward: "Faster start, higher corruption risk",
  emergencyAuth: "Instant start, highest cost & scandal risk",
};

const POLICY_DEFS: Array<{ key: string; label: string; description: string; effects: string }> = [
  { key: "lowestBidPriority", label: "LOWEST BID PRIORITY", description: "Prioritize cheapest contractors.", effects: "Cost -15%, Delay +10%, Quality -8%" },
  { key: "qualityFirstProcurement", label: "QUALITY FIRST", description: "Prioritize build quality over speed.", effects: "Quality +10%, Speed -10%" },
  { key: "emergencyFastTrack", label: "EMERGENCY FAST-TRACK", description: "Remove start delay for emergency contracts.", effects: "Emergency speed +30%, Cost +25%" },
  { key: "antiCorruptionOversight", label: "ANTI-CORRUPTION OVERSIGHT", description: "Increase contract oversight and auditing.", effects: "Corruption -20%, Speed -10%, Admin +5%" },
  { key: "civicLaborPreference", label: "CIVIC LABOR PREFERENCE", description: "Prefer public agency contractors.", effects: "Corruption -10%, Speed -15%, Happiness +3%" },
  { key: "corporatePartnerIncentives", label: "CORPORATE PARTNERSHIPS", description: "Incentivize private sector investment.", effects: "Speed +10%, Corruption +8%" },
  { key: "penalLaborConstruction", label: "PENAL LABOR CONSTRUCTION", description: "Use convict labor for construction.", effects: "Cost -40%, Quality -30%, Unrest +10%" },
  { key: "openTenderRequirement", label: "OPEN TENDER REQUIRED", description: "Require open tender for all contracts.", effects: "Corruption -15%, Speed -20%" },
  { key: "securityScreening", label: "SECURITY SCREENING", description: "Background checks on all contractors.", effects: "Corruption -10%, Start delay +1 tick" },
  { key: "blackBudgetWaivers", label: "BLACK BUDGET WAIVERS", description: "Allow classified project authorization.", effects: "Unlocks black budget contracts" },
];

const CONTRACT_EXPIRY_RECOVERY_PERCENT = Math.round(CONTRACT_EXPIRY_RECOVERY_RATE * 100);

function getExpiryRecoveryPreview(def: Pick<ContractDef, "upfrontCost">): string {
  const maximumRecovery = computeContractExpiryRecovery(def.upfrontCost, 0);
  return (
    `AUTO-SCRAP RECOVERY: At the deadline, recover ${CONTRACT_EXPIRY_RECOVERY_PERCENT}% × ` +
    `the unfinished share of the upfront deposit (up to +${maximumRecovery.toLocaleString()} cr if no work is completed). ` +
    `VOLUNTARY CANCELLATION: no refund.`
  );
}

function ContractsScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, awardContract, cancelContract, toggleProcurementPolicy } = useGame();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { modal, showModal, hideModal } = useGameModal();

  // Task #581: land on the award queue when work is in motion — players
  // checking on an order shouldn't have to tab past the catalog first.
  const [mainTab, setMainTab] = useState<TabKey>(() =>
    (state.activeContracts ?? []).length > 0 ? "active" : "available",
  );
  const [categoryFilter, setCategoryFilter] = useState("all");
  const tabScrollRef = useHorizontalWheelScroll();
  const catFilterScrollRef = useHorizontalWheelScroll();

  const activeContracts = state.activeContracts ?? [];
  const completedContracts = state.completedContracts ?? [];
  const maxContracts = state.contractCapacity ?? 5;
  const pp = state.procurementPolicies ?? {};

  const availableContracts = useMemo(() => {
    const activeDefIds = new Set(activeContracts.map((c) => c.defId));
    let filtered = CONTRACT_TEMPLATES.filter((t) => !activeDefIds.has(t.id));
    if (categoryFilter !== "all") {
      filtered = filtered.filter((t) => t.category === categoryFilter);
    }
    if (!pp.blackBudgetWaivers) {
      filtered = filtered.filter((t) => t.category !== "blackBudget");
    }
    return filtered;
  }, [activeContracts, categoryFilter, pp]);

  const totalContractSpend = useMemo(() =>
    activeContracts.reduce((sum, c) => sum + c.totalPaid, 0), [activeContracts]);

  // Both city-trait calcs only inspect `state.namedCharacters`. Narrowing
  // off `state` (which gets a new reference on every tick + every action)
  // means these stop recomputing dozens of times per second.
  const cityMults = useMemo(() => computeCityTraitMultipliers(state), [state.namedCharacters]);
  const cityContributions = useMemo(
    () =>
      cityMults.contractDelayMult !== 1
        ? listCityTraitContributions(state)
        : [],
    [state.namedCharacters, cityMults.contractDelayMult],
  );

  const districts = state.districts ?? [];
  const districtNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of districts) m.set(d.id, d.name);
    return m;
  }, [districts]);

  const handleAward = (def: ContractDef, method: ProcurementMethod) => {
    if (activeContracts.length >= maxContracts) {
      showModal("CONTRACT CAPACITY FULL", `Procurement queue capped at ${maxContracts} active awards. Close or cancel an existing contract before authorizing another.`, [
        { text: "OK", style: "cancel" },
      ]);
      return;
    }
    if (state.resources.credits < def.upfrontCost) {
      showModal("INSUFFICIENT FUNDS", `Treasury short. ${def.upfrontCost.toLocaleString()} credits required up front to authorize this award.`, [
        { text: "OK", style: "cancel" },
      ]);
      return;
    }
    if (districts.length === 0) {
      showModal(
        "NO DISTRICTS",
        "No district registered to receive work. Stand up an administrative district before authorizing contracts.",
        [{ text: "OK", style: "cancel" }]
      );
      return;
    }
    const showDistrictPicker = () => {
      showModal(
        `AWARD: ${def.name}`,
        `Assign to district:\n\nMethod: ${PROCUREMENT_LABELS[method]}\nUpfront: ${def.upfrontCost.toLocaleString()} cr\n\n${getExpiryRecoveryPreview(def)}`,
        [
          ...districts.map((d) => ({
            text: d.name,
            onPress: () => {
              const ok = awardContract(def.id, d.id, method);
              if (ok) {
                showModal(
                  "CONTRACT AWARDED",
                  `${def.name} awarded via ${PROCUREMENT_LABELS[method]}.\n\nUpfront: ${def.upfrontCost.toLocaleString()} cr deducted.\nDuration: ~${def.durationTicks} ticks`,
                  [{ text: "OK", style: "cancel" }]
                );
              }
            },
          })),
          { text: "Cancel", style: "cancel" },
        ]
      );
    };

    const netGoodsIncome = state.rates.goodsProduction - state.rates.goodsConsumption;
    const goodsForecast = forecastContractGoodsCommitment(
      activeContracts,
      def,
      netGoodsIncome,
    );
    if (goodsForecast.exceedsNetIncome) {
      const incomeSummary = netGoodsIncome < 0
        ? `Your goods income is negative (${netGoodsIncome} goods/tick).`
        : `Your goods income is only +${netGoodsIncome} goods/tick.`;
      const commitmentSummary = goodsForecast.activeGoodsPerTick > 0
        ? `Active contracts already need ${goodsForecast.activeGoodsPerTick} goods/tick. Adding ${def.name} (${goodsForecast.candidateGoodsPerTick} goods/tick) raises the combined commitment to ${goodsForecast.combinedGoodsPerTick} goods/tick.`
        : `${def.name} needs ${goodsForecast.candidateGoodsPerTick} goods/tick.`;
      showModal(
        "GOODS SHORTAGE WARNING",
        `${incomeSummary} ${commitmentSummary} The combined commitment exceeds current net income, so existing supplies will run down and construction will stall once the stockpile is empty.\n\nIncrease goods production or award it anyway at your risk.`,
        [
          { text: "GO BACK", style: "cancel" },
          { text: "AWARD ANYWAY", style: "default", onPress: showDistrictPicker },
        ],
      );
      return;
    }

    showDistrictPicker();
  };

  const handleCancel = (contract: ContractInstance) => {
    const def = CONTRACT_TEMPLATES_MAP[contract.defId];
    showModal(
      "CANCEL CONTRACT",
      `Cancel ${def?.name ?? contract.defId}?\n\nProgress: ${contract.progress.toFixed(1)}%\nTotal paid: ${contract.totalPaid.toLocaleString()} cr\n\nNo refund will be issued.`,
      [
        { text: "Keep Contract", style: "cancel" },
        { text: "CANCEL", style: "destructive", onPress: () => cancelContract(contract.id) },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="file-text" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>CONTRACTS / PROCUREMENT</Text>
      </View>

      <View style={styles.summaryBar}>
        <SummaryCell label="ACTIVE" value={`${activeContracts.length}/${maxContracts}`} color={activeContracts.length >= maxContracts ? Colors.warning : Colors.accent} />
        <View style={styles.sumDiv} />
        <SummaryCell label="COMPLETED" value={completedContracts.length} color={Colors.text} />
        <View style={styles.sumDiv} />
        <SummaryCell label="TOTAL SPENT" value={`${Math.floor(totalContractSpend / 1000)}k`} color={Colors.warning} />
        <View style={styles.sumDiv} />
        <SummaryCell label="TREASURY" value={`${Math.floor(state.resources.credits / 1000)}k`} color={Colors.accent} />
      </View>

      <TutorialHint
        id="contracts_intro"
        message="Accept contracts for credits, resources, or political favor. Each carries a deadline. Failing one damages your reputation with the issuing party."
      />

      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === "web"}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContainer}
      >
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setMainTab(t.key)}
            style={[styles.tab, mainTab === t.key && styles.tabActive]}
          >
            <Feather name={t.icon as any} size={10} color={mainTab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[styles.tabText, mainTab === t.key && styles.tabTextActive]}>
              {t.label}
              {t.key === "active" ? ` (${activeContracts.length})` : ""}
              {t.key === "completed" ? ` (${completedContracts.length})` : ""}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {mainTab === "available" && (
        <ScrollView
          ref={catFilterScrollRef}
          horizontal
          showsHorizontalScrollIndicator={Platform.OS === "web"}
          style={styles.catTabScroll}
          contentContainerStyle={styles.tabContainer}
        >
          {CATEGORY_TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setCategoryFilter(t.key)}
              style={[styles.catTab, categoryFilter === t.key && styles.catTabActive]}
              accessibilityLabel={t.label}
            >
              <Feather name={t.icon as any} size={9} color={categoryFilter === t.key ? Colors.bg : Colors.textMuted} />
              <Text style={[styles.catTabText, categoryFilter === t.key && styles.catTabTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {(mainTab === "available" || mainTab === "active") && (
          <CityTraitInfluenceBanner
            contractDelayMult={cityMults.contractDelayMult}
            contributions={cityContributions}
          />
        )}

        {mainTab === "available" && (
          <>
            {availableContracts.length === 0 && (
              <EmptyBox text="No solicitations open in this category. Check back as the procurement docket rotates." />
            )}
            {availableContracts.map((def) => (
              <AvailableContractCard
                key={def.id}
                def={def}
                credits={state.resources.credits}
                onAward={handleAward}
                atCapacity={activeContracts.length >= maxContracts}
                onShowInfo={(title, body) => showModal(title, body, [{ text: "GOT IT", style: "default" }])}
              />
            ))}
          </>
        )}

        {mainTab === "active" && (
          <>
            {activeContracts.length === 0 && (
              <EmptyBox text="No active awards.\nOpen the available list and authorize procurement to put work in motion." />
            )}
            {activeContracts.map((contract) => (
              <ActiveContractCard
                key={contract.id}
                contract={contract}
                onCancel={handleCancel}
                districtName={districtNameById.get(contract.districtId) ?? contract.districtId}
              />
            ))}
          </>
        )}

        {mainTab === "completed" && (
          <>
            {completedContracts.length === 0 && (
              <EmptyBox text="Procurement archive is empty. No awards have closed out yet." />
            )}
            {completedContracts.map((contract, idx) => (
              <CompletedContractCard key={contract.id + idx} contract={contract} />
            ))}
          </>
        )}

        {mainTab === "policies" && (
          <>
            <SectionHeader title="Procurement Policies" icon={<Feather name="clipboard" size={14} color={Colors.accent} />} />
            {POLICY_DEFS.map((policy) => (
              <PolicyToggle
                key={policy.key}
                policy={policy}
                active={!!(pp as Record<string, boolean>)[policy.key]}
                onToggle={() => toggleProcurementPolicy(policy.key)}
              />
            ))}
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

function AvailableContractCard({
  def,
  credits,
  onAward,
  atCapacity,
  onShowInfo,
}: {
  def: ContractDef;
  credits: number;
  onAward: (def: ContractDef, method: ProcurementMethod) => void;
  atCapacity: boolean;
  onShowInfo: (title: string, body: string) => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const contractor = CONTRACTORS_MAP[def.contractorId];
  const canAfford = credits >= def.upfrontCost;
  const [showMethods, setShowMethods] = useState(false);
  const icon = CONTRACT_CATEGORY_ICONS[def.category] || "file";

  const reliabilityLabel = def.reliability >= 80 ? "HIGH" : def.reliability >= 60 ? "MED" : "LOW";
  const reliabilityColor = def.reliability >= 80 ? Colors.accent : def.reliability >= 60 ? Colors.warning : Colors.danger;
  const corruptLabel = def.corruptionRisk <= 15 ? "LOW" : def.corruptionRisk <= 40 ? "MED" : "HIGH";
  const corruptColor = def.corruptionRisk <= 15 ? Colors.accent : def.corruptionRisk <= 40 ? Colors.warning : Colors.danger;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleRow}>
          <Feather name={icon as any} size={14} color={Colors.accent} />
          <Text style={styles.cardName}>{def.name}</Text>
        </View>
        <View style={styles.catBadge}>
          <Text style={styles.catBadgeText}>
            {CONTRACT_CATEGORY_LABELS[def.category]}
          </Text>
        </View>
      </View>

      <Text style={styles.cardDesc}>{def.description}</Text>

      {contractor && (
        <View style={styles.contractorRow}>
          <Feather name="briefcase" size={10} color={Colors.textSecondary} />
          <Text style={styles.contractorName}>{contractor.name}</Text>
          <Text style={styles.contractorRep}>REP: {contractor.reputation}</Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <StatPill label="TOTAL" value={`${def.totalCost.toLocaleString()} cr`} color={Colors.warning} />
        <StatPill label="UPFRONT" value={`${def.upfrontCost.toLocaleString()} cr`} color={Colors.text} />
        <StatPill label="DURATION" value={`${def.durationTicks} ticks`} color={Colors.text} />
        <StatPill label="RELIABILITY" value={reliabilityLabel} color={reliabilityColor} />
        <Pressable
          onPress={() => onShowInfo(
            "CORRUPTION RISK",
            `Risk: ${corruptLabel} (${def.corruptionRisk}/100)\n\n` +
            `Corruption increases the chance of cost overruns, delays, and scandal events during contract execution.\n\n` +
            `LOW (≤15): minor occasional overruns\n` +
            `MEDIUM (16–40): noticeable delays and overruns\n` +
            `HIGH (>40): frequent scandals, major cost spikes, possible faction trust loss\n\n` +
            `Pick OPEN TENDER procurement to lower realized risk; EMERGENCY AUTH raises it.`
          )}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <StatPill label="CORRUPTION" value={`${corruptLabel} ⓘ`} color={corruptColor} />
        </Pressable>
      </View>

      {def.recurringCostPerTick > 0 && (
        <View style={styles.feeRow}>
          <Text style={styles.feeText}>RECURRING: {def.recurringCostPerTick} cr/tick</Text>
        </View>
      )}

      <View style={styles.recoveryBox}>
        <Feather name="rotate-ccw" size={11} color={Colors.warning} />
        <Text style={styles.recoveryText}>{getExpiryRecoveryPreview(def)}</Text>
      </View>

      {Object.keys(def.requiredMaterials).length > 0 && (
        <View style={styles.matRow}>
          <Text style={styles.matLabel}>MATERIALS: </Text>
          {Object.entries(def.requiredMaterials).map(([key, val]) => (
            <Text key={key} style={styles.matItem}>{key} ×{val}  </Text>
          ))}
        </View>
      )}

      {Object.keys(def.materialPerTick).length > 0 && (
        <View style={styles.matRow}>
          <Text style={[styles.matLabel, { color: Colors.warning }]}>PER TICK: </Text>
          {Object.entries(def.materialPerTick).map(([key, val]) => (
            <Text key={key} style={[styles.matItem, { color: Colors.warning }]}>−{val} {key}  </Text>
          ))}
        </View>
      )}

      {def.completionEffects && (
        <View style={styles.effectsRow}>
          {def.completionEffects.buildings &&
            Object.entries(def.completionEffects.buildings).map(([k, v]) => (
              <EffectPill key={k} text={`+${v} ${formatKey(k)}`} positive />
            ))}
          {def.completionEffects.cityStats &&
            Object.entries(def.completionEffects.cityStats).map(([k, v]) => (
              <EffectPill key={k} text={`${(v as number) > 0 ? "+" : ""}${v} ${k}`} positive={(v as number) > 0} />
            ))}
          {def.completionEffects.resources &&
            Object.entries(def.completionEffects.resources).map(([k, v]) => (
              <EffectPill key={k} text={`+${v} ${k}`} positive />
            ))}
        </View>
      )}

      <View style={styles.cardFooter}>
        {!showMethods ? (
          <>
            <Text style={[styles.costText, { color: canAfford ? Colors.accent : Colors.danger }]}>
              UPFRONT: {def.upfrontCost.toLocaleString()} cr
            </Text>
            <Pressable
              onPress={() => setShowMethods(true)}
              style={[styles.awardBtn, (!canAfford || atCapacity) && styles.awardBtnDisabled]}
              disabled={!canAfford || atCapacity}
            >
              <Text style={[styles.awardBtnText, (!canAfford || atCapacity) && { color: Colors.textMuted }]}>
                {atCapacity ? "AT CAPACITY" : canAfford ? "AWARD +" : "INSUFFICIENT"}
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.methodsRow}>
            {(["openTender", "directAward", "emergencyAuth"] as ProcurementMethod[]).map((method) => (
              <Pressable
                key={method}
                onPress={() => { setShowMethods(false); onAward(def, method); }}
                style={styles.methodBtn}
              >
                <Text style={styles.methodBtnLabel}>{PROCUREMENT_LABELS[method]}</Text>
                <Text style={styles.methodBtnSub}>{PROCUREMENT_DESCRIPTIONS[method]}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowMethods(false)} style={styles.methodCancelBtn}>
              <Text style={styles.methodCancelText}>CANCEL</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function ActiveContractCard({
  contract,
  onCancel,
  districtName,
}: {
  contract: ContractInstance;
  onCancel: (c: ContractInstance) => void;
  districtName: string;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const def = CONTRACT_TEMPLATES_MAP[contract.defId];
  const contractor = CONTRACTORS_MAP[contract.contractorId];
  const progressPct = Math.min(100, contract.progress);

  return (
    <View style={[styles.card, styles.cardActive]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleRow}>
          <Feather name="activity" size={14} color={Colors.accent} />
          <Text style={styles.cardName}>{def?.name ?? contract.defId}</Text>
        </View>
        <Text style={styles.progressPct}>{progressPct.toFixed(1)}%</Text>
      </View>

      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
      </View>

      <View style={styles.activeStatsRow}>
        <Text style={styles.activeStat}>Contractor: {contractor?.name ?? "Unknown"}</Text>
        <Text style={styles.activeStat}>District: {districtName}</Text>
        <Text style={styles.activeStat}>Method: {PROCUREMENT_LABELS[contract.procurementMethod]}</Text>
        <Text style={styles.activeStat}>Ticks elapsed: {contract.ticksElapsed}</Text>
        <Text style={styles.activeStat}>Total paid: {contract.totalPaid.toLocaleString()} cr</Text>
        {contract.delaysOccurred > 0 && (
          <Text style={[styles.activeStat, { color: Colors.warning }]}>Delays: {contract.delaysOccurred}</Text>
        )}
        {contract.overrunCost > 0 && (
          <Text style={[styles.activeStat, { color: Colors.danger }]}>Overrun cost: +{contract.overrunCost.toLocaleString()} cr</Text>
        )}
      </View>

      {contract.stallWarned === true && (
        <View style={styles.stalledBox}>
          <View style={styles.stalledRow}>
            <Feather name="alert-triangle" size={12} color={Colors.danger} />
            <Text style={[styles.stalledTitle, { color: Colors.danger }]}>STALLED — CREWS AWAITING MATERIALS</Text>
          </View>
          {def && Object.values(def.materialPerTick ?? {}).some((v) => v) && (
            <Text style={styles.stalledLine}>
              Needs {Object.entries(def.materialPerTick).filter(([, v]) => v).map(([k, v]) => `${v} ${k}/tick`).join(", ")} — restock or cancel. Retainer fees continue.
            </Text>
          )}
          {def && (
            <Text style={styles.stalledLine}>
              Auto-scrapped in {Math.max(0, def.durationTicks * CONTRACT_EXPIRY_MULTIPLIER - contract.ticksElapsed)} ticks if work doesn't resume. At current progress, recovery would be +{computeContractExpiryRecovery(def.upfrontCost, contract.progress).toLocaleString()} cr; voluntary cancellation remains non-refundable.
            </Text>
          )}
        </View>
      )}

      {contract.events.length > 0 && (
        <View style={styles.eventsBox}>
          <Text style={styles.eventsLabel}>CONTRACT LOG:</Text>
          {contract.events.slice(-3).map((e, i) => (
            <Text key={i} style={styles.eventLine}>{e}</Text>
          ))}
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.districtTag}>
          <Feather name="map-pin" size={10} color={Colors.accent} />
          <Text style={styles.districtText}>{districtName}</Text>
        </View>
        <Pressable onPress={() => onCancel(contract)} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CompletedContractCard({ contract }: { contract: ContractInstance }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const def = CONTRACT_TEMPLATES_MAP[contract.defId];
  const contractor = CONTRACTORS_MAP[contract.contractorId];
  // Task #581: the archive now also holds expired (scrapped) awards.
  const isExpired = contract.status === "expired";

  return (
    <View style={[styles.card, styles.cardCompleted]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleRow}>
          <Feather name={isExpired ? "x-circle" : "check-circle"} size={14} color={isExpired ? Colors.danger : Colors.accent} />
          <Text style={styles.cardName}>{def?.name ?? contract.defId}</Text>
        </View>
        <Text style={[styles.catBadgeText, { color: isExpired ? Colors.danger : Colors.accent }]}>{isExpired ? "EXPIRED" : "COMPLETE"}</Text>
      </View>
      {isExpired && (
        <>
          <Text style={{ color: Colors.danger, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, fontStyle: "italic", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 }}>
            Scrapped at {Math.floor(contract.progress)}% — nothing was delivered.
          </Text>
          {def && (
            <Text style={{ color: Colors.warning, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, paddingHorizontal: 12, paddingBottom: 6 }}>
              Auto-scrap recovery: +{computeContractExpiryRecovery(def.upfrontCost, contract.progress).toLocaleString()} cr ({CONTRACT_EXPIRY_RECOVERY_PERCENT}% × unfinished share of upfront deposit). Voluntary cancellation would have returned nothing.
            </Text>
          )}
        </>
      )}
      <View style={styles.activeStatsRow}>
        <Text style={styles.activeStat}>Contractor: {contractor?.name ?? "Unknown"}</Text>
        <Text style={styles.activeStat}>Total cost: {contract.totalPaid.toLocaleString()} cr</Text>
        <Text style={styles.activeStat}>Duration: {contract.ticksElapsed} ticks</Text>
        {contract.delaysOccurred > 0 && (
          <Text style={[styles.activeStat, { color: Colors.warning }]}>Delays: {contract.delaysOccurred}</Text>
        )}
        {contract.overrunCost > 0 && (
          <Text style={[styles.activeStat, { color: Colors.danger }]}>Overrun: +{contract.overrunCost.toLocaleString()} cr</Text>
        )}
      </View>
    </View>
  );
}

function PolicyToggle({
  policy,
  active,
  onToggle,
}: {
  policy: typeof POLICY_DEFS[0];
  active: boolean;
  onToggle: () => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={onToggle} style={[styles.policyCard, active && styles.policyCardActive]}>
      <View style={styles.policyTop}>
        <Feather name={active ? "check-square" : "square"} size={16} color={active ? Colors.accent : Colors.textMuted} />
        <Text style={[styles.policyLabel, active && { color: Colors.accent }]}>{policy.label}</Text>
      </View>
      <Text style={styles.policyDesc}>{policy.description}</Text>
      <Text style={styles.policyEffects}>{policy.effects}</Text>
    </Pressable>
  );
}

function EmptyBox({ text }: { text: string }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.emptyBox}>
      <Feather name="inbox" size={24} color={Colors.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function EffectPill({ text, positive }: { text: string; positive: boolean }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.effectPill}>
      <Text style={[styles.effectText, { color: positive ? Colors.accent : Colors.danger }]}>{text}</Text>
    </View>
  );
}

function SummaryCell({ label, value, color }: { label: string; value: number | string; color: string }) {
  const sumStyles = useSumStyles();
  return (
    <View style={sumStyles.cell}>
      <Text style={sumStyles.label}>{label}</Text>
      <Text style={[sumStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  const spStyles = useSpStyles();
  return (
    <View style={spStyles.pill}>
      <Text style={spStyles.label}>{label}</Text>
      <Text style={[spStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").trim().toLowerCase();
}

const useSumStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  cell: { flex: 1, alignItems: "center", paddingVertical: 8 },
  label: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" },
  value: { fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 1 },
}));

const useSpStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  pill: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: "center",
  },
  label: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 8, letterSpacing: 0.5 },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 10, marginTop: 1 },
}));

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
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5 },

  summaryBar: {
    flexDirection: "row",
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderBright,
  },
  sumDiv: { width: 1, backgroundColor: Colors.border, marginVertical: 8 },

  tabScroll: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
    maxHeight: 44,
  },
  tabContainer: {
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.accentDark,
    borderColor: Colors.accent,
  },
  tabText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  tabTextActive: { color: Colors.accent },

  catTabScroll: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg,
    maxHeight: 40,
  },
  catTab: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.borderDim,
  },
  catTabActive: {
    borderColor: Colors.accentDim,
    backgroundColor: "rgba(0,255,65,0.06)",
  },
  catTabText: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  catTabTextActive: { color: Colors.accent },

  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 14 },

  cityInfluenceBox: {
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 4,
    padding: 10,
    marginBottom: 12,
    backgroundColor: Colors.bgCard,
  },
  cityInfluenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  cityInfluenceTitle: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    flex: 1,
    flexShrink: 1,
  },
  cityInfluenceSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginBottom: 4,
  },
  cityInfluenceRow: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
    paddingVertical: 1,
  },

  emptyBox: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
  },
  cardActive: {
    borderColor: Colors.accent,
    boxShadow: `0 0 4px ${Colors.accent}26`,
  } as any,
  cardCompleted: {
    borderColor: Colors.borderBright,
    opacity: 0.85,
  },

  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  cardName: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    flex: 1,
    flexWrap: "wrap",
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.bg,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Colors.borderBright,
    marginLeft: 8,
  },
  catBadgeText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.5,
  },

  cardDesc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },

  contractorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.bg,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contractorName: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    flex: 1,
  },
  contractorRep: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },

  statsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 8,
  },

  feeRow: {
    marginBottom: 6,
  },
  feeText: {
    color: Colors.warning,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.3,
  },
  recoveryBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 3,
    padding: 8,
    marginBottom: 8,
  },
  recoveryText: {
    color: Colors.warning,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 15,
    flex: 1,
  },

  matRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 8,
  },
  matLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.3,
  },
  matItem: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },

  effectsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 10,
  },
  effectPill: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.borderBright,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  effectText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    marginTop: 2,
  },
  costText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  awardBtn: {
    backgroundColor: Colors.accentDark,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 3,
    paddingVertical: 8,
    alignItems: "center",
  },
  awardBtnDisabled: {
    backgroundColor: Colors.bg,
    borderColor: Colors.border,
  },
  awardBtnText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },

  methodsRow: {
    gap: 6,
  },
  methodBtn: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.borderBright,
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  methodBtnLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  methodBtnSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },
  methodCancelBtn: {
    paddingVertical: 6,
    alignItems: "center",
  },
  methodCancelText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.5,
  },

  progressPct: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.bg,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },

  activeStatsRow: {
    gap: 3,
    marginBottom: 8,
  },
  activeStat: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },

  eventsBox: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    padding: 8,
    marginBottom: 8,
  },
  stalledBox: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 3,
    padding: 8,
    marginBottom: 8,
  },
  stalledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  stalledTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  stalledLine: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 15,
  },
  eventsLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  eventLine: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 16,
  },

  districtTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,255,65,0.06)",
    borderWidth: 1,
    borderColor: Colors.borderBright,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  districtText: {
    color: Colors.accent,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
  cancelBtn: {
    backgroundColor: "rgba(255,59,48,0.08)",
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelText: {
    color: Colors.danger,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },

  policyCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  policyCardActive: {
    borderColor: Colors.accent,
    backgroundColor: "rgba(0,255,65,0.04)",
  },
  policyTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  policyLabel: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  policyDesc: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 4,
    marginLeft: 24,
  },
  policyEffects: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    marginLeft: 24,
  },
}));

export default withScreenBoundary(ContractsScreen, "contracts");

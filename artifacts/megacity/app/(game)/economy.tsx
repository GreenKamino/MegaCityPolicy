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

import GameTabBar from "@/components/GameTabBar";
import TutorialHint from "@/components/TutorialHint";
import ResourceRow from "@/components/ResourceRow";
import SectionHeader from "@/components/SectionHeader";
import { formatNumber } from "@/utils/format";
import StatBar from "@/components/StatBar";
import TrendChart from "@/components/TrendChart";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState } from "@/context/GameContext";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { ALL_COMMODITIES, COMMODITY_CATEGORY_LABELS } from "@/engine/commodities";
import { CRISIS_THRESHOLDS } from "@/engine/crisisThresholds";
import { computeEconomyBreakdown } from "@/engine/economyBreakdown";
import {
  computePowerProductionComponents,
  computeWaterProductionComponents,
  getLicensedCompanyUtilityContributions,
} from "@/engine/utilityProduction";
import CommandScreenHeader from "@/components/CommandScreenHeader";
import CrisisReportFrame from "@/components/CrisisReportFrame";
import AdministrativeBlocPanel from "@/components/AdministrativeBlocPanel";
import {
  FUEL_STORAGE_BUILDING_KEY,
  FUEL_STORAGE_PER_TANK_FARM,
  getMaterialStorageSummary,
  getResourceStoragePlan,
  getResourceStorageStatus,
  getSelectedBuildingStorageStatuses,
  LOGISTICS_STOCKPILE_POLICY,
  RESOURCE_STORAGE_POLICIES,
  STORAGE_PER_DISTRIBUTION_CENTER,
} from "@/engine/resourceStorage";

type TabId = "overview" | "stockpile" | "trends";

const ECONOMY_TABS = [
  { key: "overview", label: "OVERVIEW", icon: "bar-chart-2" },
  { key: "stockpile", label: "STOCKPILE", icon: "package" },
  { key: "trends", label: "TRENDS", icon: "trending-up" },
];

function EconomyScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state } = useGameState();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const r = useThrottledValue(state.resources, 250);
  const rates = useThrottledValue(state.rates, 250);
  const { buildings: b, cityStats: cs } = state;
  const [tab, setTab] = useState<TabId>("overview");
  // Task #473: the entire P&L comes from the shared engine breakdown module
  // — the same functions runTick uses to charge credits — so every number
  // shown here matches what the engine actually charges each tick.
  const bd = useMemo(() => computeEconomyBreakdown(state), [state]);
  const licensedUtilityOutput = useMemo(() => ({
    power: computePowerProductionComponents(state).licensedCorporationOutput,
    water: computeWaterProductionComponents(state).licensedCorporationOutput,
  }), [state]);
  const licensedUtilityCompanies = useMemo(() => ({
    power: getLicensedCompanyUtilityContributions(state, "power"),
    water: getLicensedCompanyUtilityContributions(state, "water"),
  }), [state]);
  const materialStorage = useMemo(() => getMaterialStorageSummary(state), [state.resources, state.buildings]);
  const foodStorage = useMemo(() => getResourceStorageStatus(state, "food"), [state.resources, state.buildings]);
  const fuelStorage = useMemo(() => getResourceStorageStatus(state, "fuel"), [state.resources, state.buildings]);
  const powerStorage = useMemo(() => getResourceStorageStatus(state, "power"), [state.resources, state.buildings]);
  const medicalStorage = useMemo(() => getResourceStorageStatus(state, "medSupplies"), [state.resources, state.buildings]);
  const selectedStorageBuildings = useMemo(() => getSelectedBuildingStorageStatuses(state), [state.buildings]);
  const storagePlan = useMemo(() => getResourceStoragePlan(state), [state.resources, state.buildings]);
  const fuelTankFarms = state.buildings[FUEL_STORAGE_BUILDING_KEY] ?? 0;

  const totalIndustrial = useMemo(() => Object.entries(b).filter(([k]) =>
    ["megaManufacturingPlants", "metalFoundryComplexes", "roboticsFabricationFacilities",
      "constructionMaterialRefineries", "automatedAssemblyLines", "heavyIndustryExpansion",
      "industrialRecyclingFacilities", "advancedMaterialsRefineries", "supplyChainDistributionCenters",
      FUEL_STORAGE_BUILDING_KEY].includes(k)
  ).reduce((a, [, v]) => a + (v as number), 0), [b]);

  const stockpileByCategory = useMemo(() => {
    const grouped: Record<string, { id: string; name: string; qty: number }[]> = {};
    for (const c of ALL_COMMODITIES) {
      const qty = state.stockpiles?.[c.id] ?? 0;
      if (!grouped[c.category]) grouped[c.category] = [];
      grouped[c.category].push({ id: c.id, name: c.name, qty });
    }
    return grouped;
  }, [state.stockpiles]);

  const totalStockpileItems = useMemo(() => {
    return Object.values(stockpileByCategory).reduce((acc, items) => acc + items.reduce((s, i) => s + i.qty, 0), 0);
  }, [stockpileByCategory]);

  const categoriesWithStock = useMemo(() => {
    return Object.entries(stockpileByCategory).filter(([, items]) => items.some((i) => i.qty > 0));
  }, [stockpileByCategory]);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <CommandScreenHeader
        icon="trending-up"
        title="ECONOMY / INDUSTRY / TRADE"
        subtitle="treasury · throughput · reserves"
      />

      <GameTabBar tabs={ECONOMY_TABS} active={tab} onSelect={(k) => setTab(k as TabId)} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TutorialHint
          id="economy_intro"
          message="Tax bands, procurement, and tariffs feed every credit you spend. Raise tax to fill the treasury at the cost of happiness; cut it to appease the populace and watch the deficit grow."
        />
        <AdministrativeBlocPanel surface="economy" />
        <CrisisReportFrame
          title="TREASURY POSTURE"
          icon="database"
          tone={r.credits <= 0 || bd.netIncome < 0 ? "danger" : bd.netIncome < 500 ? "warning" : "statHigh"}
          statusLabel={r.credits <= 0 && bd.netIncome >= 0 ? "RECOVERING" : bd.netIncome < 0 ? "CRITICAL" : bd.netIncome < 500 ? "STRAINED" : "STABLE"}
          severityLabel={r.credits <= 0 ? "COLLAPSING" : bd.netIncome < 0 ? "CRITICAL" : bd.netIncome < 500 ? "STRAINED" : "STABLE"}
          headline={`Net ${bd.netIncome >= 0 ? "+" : ""}${formatNumber(bd.netIncome)} credits per tick · every response has a bill`}
          consequence={bd.netIncome < 0
            ? "A deficit narrows your countermeasure window. Shortages and delayed responses increase duration and casualties."
            : "Positive income extends the response window. It does not prevent supply shocks; keep reserves visible below."}
          details={<Text style={{ color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11 }}>{formatNumber(r.credits)} credits in treasury · {Math.round(r.food)} food · {Math.round(r.water)} water</Text>}
          detailsLabel="RESERVES / RESPONSE WINDOW"
        />

        {tab === "overview" && (
          <>
            <SectionHeader title="Sector P&L — Per Tick" subtitle="Income vs expenditure" icon={<Feather name="dollar-sign" size={14} color={Colors.accent} />} />
            <View style={styles.plCard}>
              <PLRow label="Tax Revenue" value={bd.income.taxGross - bd.income.licensedCompanyTax} color={Colors.accent} />
              {bd.income.licensedCompanyTax > 0 && <PLRow label="Commercial Licensing" value={bd.income.licensedCompanyTax} color={Colors.accent} />}
              {bd.income.overhead > 0 && <PLRow label="Bureaucratic Overhead" value={-bd.income.overhead} color={Colors.danger} />}
              <PLRow label="Trade & Logistics" value={bd.income.tradeGross} color={Colors.accent} />
              {bd.income.portCongestion > 0 && <PLRow label="Port Congestion" value={-bd.income.portCongestion} color={Colors.danger} />}
              {bd.income.tourism > 0 && <PLRow label="Tourism Revenue" value={bd.income.tourism} color={Colors.accent} />}
              {bd.income.reclamationTax > 0 && <PLRow label="Reclamation Tax" value={bd.income.reclamationTax} color={Colors.accent} />}
              {bd.income.blackMarketOre > 0 && <PLRow label="Black Market Ore" value={bd.income.blackMarketOre} color={Colors.accent} />}
              {bd.income.enterpriseTax > 0 && <PLRow label="Enterprise Tax" value={bd.income.enterpriseTax} color={Colors.accent} />}
              {bd.income.zoneTribute > 0 && <PLRow label="Zone Tribute" value={bd.income.zoneTribute} color={Colors.accent} />}
              <View style={styles.plDivider} />
              <PLRow label="Gross Income" value={bd.income.total} color={Colors.accent} bold />
              <PLRow label="Unit Upkeep" value={-bd.expenses.unitUpkeep} color={Colors.danger} />
              <PLRow label="Infrastructure Upkeep" value={-bd.expenses.infraUpkeep} color={Colors.danger} />
              {bd.expenses.policyCost !== 0 && (
                <PLRow label="Policy Costs" value={-bd.expenses.policyCost} color={bd.expenses.policyCost > 0 ? Colors.danger : Colors.accent} />
              )}
              {bd.expenses.companyMaintenance > 0 && <PLRow label="Company Maintenance" value={-bd.expenses.companyMaintenance} color={Colors.danger} />}
              {bd.expenses.installationUpkeep > 0 && <PLRow label="Military Installations" value={-bd.expenses.installationUpkeep} color={Colors.danger} />}
              {bd.expenses.garrisonUpkeep > 0 && <PLRow label="Garrison Upkeep" value={-bd.expenses.garrisonUpkeep} color={Colors.danger} />}
              {bd.expenses.nuclearMaintenance > 0 && <PLRow label="Nuclear Maintenance" value={-bd.expenses.nuclearMaintenance} color={Colors.danger} />}
              {bd.expenses.contractFees > 0 && <PLRow label="Contract Fees" value={-bd.expenses.contractFees} color={Colors.danger} />}
              <View style={styles.plDivider} />
              <View style={styles.netRow}>
                <Text style={styles.netLabel}>NET INCOME / TICK</Text>
                <Text style={[styles.netValue, { color: bd.netIncome >= 0 ? Colors.accent : Colors.danger }]}>
                  {bd.netIncome >= 0 ? "+" : ""}
                  {formatNumber(bd.netIncome)} cr
                </Text>
              </View>
            </View>

            {(bd.scheduled.loanPaymentMonthly > 0 || bd.scheduled.savingsInterestMonthly > 0 || bd.scheduled.autoReconPer4Ticks > 0) && (
              <>
                <SectionHeader title="Scheduled Charges" subtitle="Billed on a cadence — not part of the per-tick net" icon={<Feather name="clock" size={14} color={Colors.accent} />} />
                <View style={styles.plCard}>
                  {bd.scheduled.loanPaymentMonthly > 0 && <PLRow label="Loan Payments" value={-bd.scheduled.loanPaymentMonthly} color={Colors.danger} unit="cr / month" />}
                  {bd.scheduled.savingsInterestMonthly > 0 && <PLRow label="Savings Interest" value={bd.scheduled.savingsInterestMonthly} color={Colors.accent} unit="cr / month" />}
                  {bd.scheduled.autoReconPer4Ticks > 0 && <PLRow label="Auto Recon Sweeps" value={-bd.scheduled.autoReconPer4Ticks} color={Colors.danger} unit="cr every 4 ticks" />}
                </View>
              </>
            )}

            <SectionHeader title="Treasury & Core Resources" icon={<Feather name="database" size={14} color={Colors.accent} />} />
            <ResourceRow
              label="Credits"
              value={r.credits}
              delta={bd.netIncome}
              warnBelow={10000}
              criticalBelow={1000}
              tooltip="Your treasury — spent on construction, upkeep, and recruitment. Delta is net income per tick."
            />
            <ResourceRow label="Steel" value={`${formatNumber(materialStorage.steel.current)} / ${formatNumber(materialStorage.steel.capacity)}`} unit=" tons" delta={rates.steelProduction} color={materialStorage.steel.isFull ? Colors.warning : undefined} tooltip="Construction material — buildings, infrastructure, repairs. Yellow at 100 tons: this is the low-stock threshold." />
            <ResourceRow label="Goods" value={`${formatNumber(materialStorage.goods.current)} / ${formatNumber(materialStorage.goods.capacity)}`} unit=" units" delta={rates.goodsProduction - rates.goodsConsumption} color={materialStorage.goods.isFull ? Colors.warning : undefined} tooltip="Consumer goods — citizens consume these; shortage drops happiness." />
            <ResourceRow label="Fuel" value={`${formatNumber(fuelStorage.current)} / ${formatNumber(fuelStorage.capacity)}`} unit="barrels" delta={rates.fuelProduction} color={fuelStorage.isFull ? Colors.warning : undefined} warnBelow={50} criticalBelow={10} tooltip="City reserve: 5,000 barrels plus 2,000 per Fuel Reserve Tank Farm. Military logistics stockpiles are tracked separately." />
            <ResourceRow label="Med Supplies" value={`${formatNumber(medicalStorage.current)} / ${formatNumber(medicalStorage.capacity)}`} unit="units" delta={rates.medProduction} color={medicalStorage.isFull ? Colors.warning : undefined} warnBelow={50} criticalBelow={10} tooltip="Healthcare stockpile — needed during outbreaks and combat. Capacity expands with medical and response facilities." />
            <ResourceRow label="Ammo" value={r.ammo} unit="rounds" warnBelow={200} criticalBelow={50} tooltip="Military ammunition — consumed during raids and police actions" />
            <ResourceRow label="Food" value={`${formatNumber(foodStorage.current)} / ${formatNumber(foodStorage.capacity)}`} unit="units" delta={rates.foodProduction - rates.foodConsumption} color={foodStorage.isFull ? Colors.warning : undefined} warnBelow={200} criticalBelow={CRISIS_THRESHOLDS.food.trigger} tooltip="Citizen sustenance — a 1,000-unit base reserve expands by 1,000 per Agricultural Dome District." />
            <ResourceRow label="Water" value={r.water} unit="units" delta={rates.waterProduction - rates.waterConsumption} warnBelow={200} criticalBelow={50} tooltip="Drinking and industrial water — zero = riots within ticks" />
            <ResourceRow label="Power" value={`${formatNumber(powerStorage.current)} / ${formatNumber(powerStorage.capacity)}`} unit="MW" delta={rates.powerGeneration - rates.powerDrain} color={powerStorage.current <= CRISIS_THRESHOLDS.power.trigger ? Colors.danger : undefined} warnBelow={100} criticalBelow={CRISIS_THRESHOLDS.power.trigger} tooltip="Grid buffer: 5,000 MW plus 200 MW per Energy Storage Vault. Negative values represent brownout deficit." />

            <SectionHeader title="Production Rates / Tick" icon={<Feather name="repeat" size={14} color={Colors.accent} />} />
            <ResourceRow label="Steel" value={rates.steelProduction} unit="tons/tick" color={Colors.accent} />
            <ResourceRow label="Goods" value={rates.goodsProduction} unit="units/tick" color={Colors.accent} />
            <ResourceRow label="Goods Consumed" value={-rates.goodsConsumption} unit="units/tick" color={Colors.danger} />
            <ResourceRow label="Fuel" value={rates.fuelProduction} unit="barrels/tick" />
            <ResourceRow label="Med Supplies" value={rates.medProduction} unit="units/tick" />
            <ResourceRow label="Industrial Facilities" value={totalIndustrial} unit="buildings" />

            {(licensedUtilityOutput.power > 0 || licensedUtilityOutput.water > 0) && (
              <>
                <SectionHeader
                  title="Licensed Company Output"
                  subtitle="Operational utility contributions included in the shared rates"
                  icon={<Feather name="briefcase" size={14} color={Colors.accent} />}
                />
                {licensedUtilityOutput.power > 0 && (
                  <View style={styles.utilityOutputGroup}>
                    <ResourceRow
                      label="Licensed Company Power"
                      value={licensedUtilityOutput.power}
                      unit="MW/tick"
                      color={Colors.accent}
                    />
                    <View style={styles.utilityCompanyList}>
                      <Text style={styles.utilityCompanyLabel}>POWER SUPPLIERS</Text>
                      {licensedUtilityCompanies.power.map((company, index) => (
                        <View
                          key={`${company.companyId}-${index}`}
                          style={styles.utilityCompanyRow}
                        >
                          <Text style={styles.utilityCompanyName}>{company.name}</Text>
                          <Text style={styles.utilityCompanyAmount}>+{formatNumber(company.amount)} MW/tick</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {licensedUtilityOutput.water > 0 && (
                  <View style={styles.utilityOutputGroup}>
                    <ResourceRow
                      label="Licensed Company Water"
                      value={licensedUtilityOutput.water}
                      unit="units/tick"
                      color={Colors.accent}
                    />
                    <View style={styles.utilityCompanyList}>
                      <Text style={styles.utilityCompanyLabel}>WATER SUPPLIERS</Text>
                      {licensedUtilityCompanies.water.map((company, index) => (
                        <View
                          key={`${company.companyId}-${index}`}
                          style={styles.utilityCompanyRow}
                        >
                          <Text style={styles.utilityCompanyName}>{company.name}</Text>
                          <Text style={styles.utilityCompanyAmount}>+{formatNumber(company.amount)} units/tick</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}

            <SectionHeader title="Material Storage" subtitle="Steel and Goods capacity" icon={<Feather name="archive" size={14} color={Colors.accent} />} />
            <SectionHeader title="Storage Plan" subtitle="Choose general warehouses or specialized reserves" icon={<Feather name="layers" size={14} color={Colors.accent} />} />
            <View style={styles.storageCard}>
              <Text style={styles.storageTitle}>CITY RESERVE CAPACITY / INVESTMENT PATHS</Text>
              <Text style={styles.storageText}>
                Structural capacity is the actual gameplay limit. A legacy overflow stays visible until consumption brings it below that limit. Water, Credits, city Ammo, and open-ended commodity stockpiles remain outside this warehouse plan.
              </Text>
              {storagePlan.map((entry) => {
                const status = entry.legacyOverflow > 0
                  ? `LEGACY OVERFLOW +${formatNumber(entry.legacyOverflow)}`
                  : entry.isFull
                    ? "FULL · positive gains rejected"
                    : `${formatNumber(entry.available)} free`;
                const source = entry.nextUpgrade
                  ? `Next: ${entry.nextUpgrade.label} +${formatNumber(entry.nextUpgrade.capacityPerBuilding)}`
                  : "No expansion source";
                return (
                  <View key={entry.resource} style={styles.storagePlanRow}>
                    <View style={styles.storagePlanHeading}>
                      <Text style={styles.storagePlanLabel}>{entry.label}</Text>
                      <Text style={[styles.storagePlanBalance, (entry.isFull || entry.legacyOverflow > 0) && { color: Colors.warning }]}>
                        {formatNumber(entry.current)} / {formatNumber(entry.capacity)}
                      </Text>
                    </View>
                    <Text style={styles.storageText}>{status} · structural max {formatNumber(entry.structuralCapacity)} · {source}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.storageCard}>
              <Text style={styles.storageTitle}>DISTRIBUTION CENTERS: {materialStorage.distributionCenters}</Text>
              <Text style={styles.storageText}>
                Base capacity is 1,000 tons of Steel and 1,000 units of Goods. Each Supply Chain Distribution Center adds {formatNumber(STORAGE_PER_DISTRIBUTION_CENTER)} capacity to both; selected commercial and logistics buildings add the amounts listed below.
              </Text>
              <Text style={[styles.storageText, materialStorage.steel.isFull && { color: Colors.warning }]}>
                Steel: {formatNumber(materialStorage.steel.current)} / {formatNumber(materialStorage.steel.capacity)}
                {materialStorage.steel.legacyOverflow > 0 ? ` (${formatNumber(materialStorage.steel.legacyOverflow)} legacy overflow; gains paused until below ${formatNumber(materialStorage.steel.structuralCapacity)})` : materialStorage.steel.isFull ? " — FULL: positive gains rejected" : ` (${formatNumber(materialStorage.steel.available)} free)`}
              </Text>
              <Text style={[styles.storageText, materialStorage.goods.isFull && { color: Colors.warning }]}>
                Goods: {formatNumber(materialStorage.goods.current)} / {formatNumber(materialStorage.goods.capacity)}
                {materialStorage.goods.legacyOverflow > 0 ? ` (${formatNumber(materialStorage.goods.legacyOverflow)} legacy overflow; gains paused until below ${formatNumber(materialStorage.goods.structuralCapacity)})` : materialStorage.goods.isFull ? " — FULL: positive gains rejected" : ` (${formatNumber(materialStorage.goods.available)} free)`}
              </Text>
            </View>

            <SectionHeader title="Selected Building Storage" subtitle="Food, steel, and goods capacity contributors" icon={<Feather name="archive" size={14} color={Colors.accent} />} />
            <View style={styles.storageCard}>
              <Text style={styles.storageTitle}>FOOD: {formatNumber(foodStorage.current)} / {formatNumber(foodStorage.capacity)}</Text>
              <Text style={[styles.storageText, foodStorage.isFull && { color: Colors.warning }]}>
                {foodStorage.legacyOverflow > 0
                  ? `${formatNumber(foodStorage.legacyOverflow)} legacy overflow; positive gains pause until below ${formatNumber(foodStorage.structuralCapacity)}.`
                  : foodStorage.isFull
                    ? "FULL: positive food gains are rejected; consumption still applies before production."
                    : `${formatNumber(foodStorage.available)} units free before the next food gain is capped.`}
              </Text>
              {selectedStorageBuildings.map((building) => {
                const contributions = Object.entries(building.capacity)
                  .map(([resource, perBuilding]) => `+${formatNumber((perBuilding ?? 0) * building.count)} ${resource === "food" ? "Food" : resource === "steel" ? "Steel" : "Goods"}`);
                return (
                  <Text key={building.key} style={styles.storageText}>
                    {building.label}: ×{building.count} · {contributions.join(" / ")}
                  </Text>
                );
              })}
              <Text style={styles.storageText}>
                Supply Chain Distribution Centers: ×{materialStorage.distributionCenters} · +{formatNumber(materialStorage.distributionCenters * STORAGE_PER_DISTRIBUTION_CENTER)} Steel / +{formatNumber(materialStorage.distributionCenters * STORAGE_PER_DISTRIBUTION_CENTER)} Goods.
              </Text>
            </View>

            <SectionHeader title="Fuel Reserve Storage" subtitle="Expandable city fuel capacity" icon={<Feather name="truck" size={14} color={Colors.accent} />} />
            <View style={styles.storageCard}>
              <Text style={styles.storageTitle}>FUEL: {formatNumber(fuelStorage.current)} / {formatNumber(fuelStorage.capacity)}</Text>
              <Text style={styles.storageText}>
                Base capacity is 5,000 barrels. Fuel Reserve Tank Farms: ×{fuelTankFarms} · +{formatNumber(fuelTankFarms * FUEL_STORAGE_PER_TANK_FARM)} barrels.
              </Text>
              <Text style={[styles.storageText, fuelStorage.isFull && { color: Colors.warning }]}>
                {fuelStorage.legacyOverflow > 0
                  ? `${formatNumber(fuelStorage.legacyOverflow)} legacy overflow; positive gains pause until below ${formatNumber(fuelStorage.structuralCapacity)}.`
                  : fuelStorage.isFull
                    ? "FULL: positive fuel gains are rejected; consumption still applies."
                    : `${formatNumber(fuelStorage.available)} barrels free before the next fuel gain is capped.`}
              </Text>
            </View>

            <SectionHeader title="Medical Reserve Storage" subtitle="Medical supplies capacity" icon={<Feather name="plus-square" size={14} color={Colors.accent} />} />
            <View style={styles.storageCard}>
              <Text style={styles.storageTitle}>MEDICAL SUPPLIES: {formatNumber(medicalStorage.current)} / {formatNumber(medicalStorage.capacity)}</Text>
              <Text style={styles.storageText}>
                Base capacity is 5,000 medical supplies. Public Health Mega Clinics, Disaster Response HQs, Emergency Service Stations, and Seasonal Emergency Depots expand the reserve.
              </Text>
              <Text style={[styles.storageText, medicalStorage.isFull && { color: Colors.warning }]}>
                {medicalStorage.legacyOverflow > 0
                  ? `${formatNumber(medicalStorage.legacyOverflow)} legacy overflow; positive gains pause until below ${formatNumber(medicalStorage.structuralCapacity)}.`
                  : medicalStorage.isFull
                    ? "FULL: positive medical-supply gains are rejected; consumption still applies."
                    : `${formatNumber(medicalStorage.available)} units free before the next medical supply gain is capped.`}
              </Text>
            </View>

            <SectionHeader title="Core Reserve Rules" subtitle="Gameplay storage policy" icon={<Feather name="book-open" size={14} color={Colors.accent} />} />
            <View style={styles.storageCard}>
              <Text style={styles.storageTitle}>CAPACITY IS SHOWN ONLY WHERE IT BINDS</Text>
              {Object.entries(RESOURCE_STORAGE_POLICIES).map(([resource, policy]) => (
                <Text key={resource} style={styles.storageText}>
                  {resource === "medSupplies" ? "MED SUPPLIES" : resource.toUpperCase()}: {policy.label} — {policy.description}
                </Text>
              ))}
              <Text style={styles.storageText}>
                LOGISTICS STOCKPILE: {LOGISTICS_STOCKPILE_POLICY.description}
              </Text>
            </View>

            <SectionHeader title="Labour & Demographics" icon={<Feather name="users" size={14} color={Colors.accent} />} />
            <StatBar label="Employment Rate" value={cs.employment} />
            <StatBar label="Housing Pressure" value={cs.housingPressure} invertColor />
            <ResourceRow
              label="Population"
              value={(cs.population / 1000).toFixed(1) + "k"}
              delta={Math.floor(cs.population * cs.populationGrowthRate)}
              color={Colors.text}
            />

            {(state.tourism?.tourismCapacity ?? 0) > 0 && (
              <>
                <SectionHeader title="Tourism Sector" subtitle="Visitor economy overview" icon={<Feather name="map-pin" size={14} color={Colors.accent} />} />
                <ResourceRow label="Tourism Capacity" value={state.tourism?.tourismCapacity ?? 0} unit="visitors" />
                <ResourceRow label="Active Visitors" value={state.tourism?.touristCount ?? 0} unit="visitors" color={Colors.accent} />
                <StatBar label="Visitor Satisfaction" value={state.tourism?.tourismSatisfaction ?? 50} />
                <ResourceRow label="Tourism Income" value={state.tourism?.tourismIncome ?? 0} unit="cr/tick" color={Colors.accent} delta={bd.income.tourism} />
              </>
            )}
          </>
        )}

        {tab === "stockpile" && (
          <>
            <SectionHeader title="Supply Chain Stockpile" subtitle={`${totalStockpileItems.toLocaleString()} total units across ${ALL_COMMODITIES.length} commodities`} icon={<Feather name="package" size={14} color={Colors.accent} />} />

            {categoriesWithStock.length === 0 && (
              <View style={styles.emptyCard}>
                <Feather name="inbox" size={24} color={Colors.textMuted} />
                <Text style={[styles.emptyText, { fontFamily: "Inter_700Bold", color: Colors.accent }]}>STOCKPILE EMPTY</Text>
                <Text style={styles.emptyText}>No commodities in stock yet.{"\n\n"}HOW TO BUILD STOCK:{"\n"}• Assign districts to production chains{"\n"}• Import via trade agreements with factions{"\n"}• Mining operations generate raw minerals{"\n"}• Supply chain buildings auto-produce over time</Text>
              </View>
            )}

            {Object.entries(COMMODITY_CATEGORY_LABELS).map(([catKey, catLabel]) => {
              const items = stockpileByCategory[catKey];
              if (!items) return null;
              const withStock = items.filter((i) => i.qty > 0).sort((a, b) => b.qty - a.qty);
              if (withStock.length === 0) return null;
              const catTotal = withStock.reduce((s, i) => s + i.qty, 0);
              const maxQty = withStock[0]?.qty ?? 1;

              return (
                <View key={catKey} style={styles.catSection}>
                  <View style={styles.catHeader}>
                    <Text style={styles.catTitle}>{catLabel}</Text>
                    <Text style={styles.catTotal}>{withStock.length} items · {catTotal.toLocaleString()} units</Text>
                  </View>
                  {withStock.map((item) => (
                    <View key={item.id} style={styles.stockRow}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.stockLabelRow}>
                          <Text style={styles.stockName}>{item.name}</Text>
                          <Text style={[styles.stockQty, item.qty < 10 && { color: Colors.warning }]}>
                            {item.qty.toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.stockBarBg}>
                          <View style={[styles.stockBarFill, { width: `${Math.max(2, (item.qty / maxQty) * 100)}%` }, item.qty < 10 && { backgroundColor: Colors.warning }]} />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}

            <SectionHeader title="All Categories" subtitle="Including empty" icon={<Feather name="list" size={14} color={Colors.accent} />} />
            {Object.entries(COMMODITY_CATEGORY_LABELS).map(([catKey, catLabel]) => {
              const items = stockpileByCategory[catKey];
              if (!items) return null;
              const catTotal = items.reduce((s, i) => s + i.qty, 0);
              return (
                <View key={catKey} style={styles.catSummaryRow}>
                  <Text style={styles.catSummaryLabel}>{catLabel}</Text>
                  <Text style={[styles.catSummaryValue, catTotal === 0 && { color: Colors.textMuted }]}>
                    {catTotal.toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        {tab === "trends" && (
          <>
            <SectionHeader title="Economic Trends" subtitle={`${(state.statHistory ?? []).length} snapshots recorded`} icon={<Feather name="activity" size={14} color={Colors.accent} />} />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.credits)}
              label="Treasury (Credits)"
              color={Colors.accent}
            />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.population)}
              label="Population"
              color="#44AAFF"
            />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.happiness)}
              label="Happiness"
              color="#88CC44"
              format={(v) => `${v}%`}
            />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.crime)}
              label="Crime Rate"
              color={Colors.danger}
              format={(v) => `${v}%`}
            />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.unrest)}
              label="Civil Unrest"
              color={Colors.warning}
              format={(v) => `${v}%`}
            />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.employment)}
              label="Employment"
              color="#66CCAA"
              format={(v) => `${v}%`}
            />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.food)}
              label="Food Reserves"
              color="#CCAA44"
            />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.water)}
              label="Water Reserves"
              color="#4488CC"
            />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.power)}
              label="Power Supply"
              color="#FFAA00"
            />
            <TrendChart
              data={(state.statHistory ?? []).map((s) => s.lawOrder)}
              label="Law & Order"
              color="#8866DD"
              format={(v) => `${v}%`}
            />
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const PLRow = React.memo(function PLRow({
  label,
  value,
  color,
  bold,
  unit,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
  unit?: string;
}) {
  const plStyles = usePlStyles();
  return (
    <View style={plStyles.row}>
      <Text style={[plStyles.label, bold && plStyles.bold]}>{label}</Text>
      <Text style={[plStyles.value, { color }, bold && plStyles.bold]}>
        {value >= 0 ? "+" : ""}
        {formatNumber(value)} {unit ?? "cr"}
      </Text>
    </View>
  );
});

const usePlStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  label: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  value: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  bold: {
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    fontSize: 14,
  },
}));

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Platform.OS === "web" ? 12 : 20,
    paddingVertical: Platform.OS === "web" ? 8 : 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 20, paddingTop: Platform.OS === "web" ? 8 : 16, paddingBottom: 20 },
  plCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: Platform.OS === "web" ? 10 : 14,
    marginBottom: Platform.OS === "web" ? 10 : 16,
  },
  storageCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: Platform.OS === "web" ? 10 : 16,
    gap: 6,
  },
  storageTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.8,
  },
  storageText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  utilityOutputGroup: {
    marginBottom: 4,
  },
  utilityCompanyList: {
    marginLeft: 12,
    marginBottom: 8,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: Colors.borderBright,
    gap: 5,
  },
  utilityCompanyLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  utilityCompanyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  utilityCompanyName: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    flex: 1,
  },
  utilityCompanyAmount: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  storagePlanRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border + "55",
    gap: 2,
  },
  storagePlanHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  storagePlanLabel: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  storagePlanBalance: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  plDivider: {
    height: 1,
    backgroundColor: Colors.borderBright,
    marginVertical: 8,
  },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  netLabel: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 1,
  },
  netValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 10,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    maxWidth: 280,
  },
  catSection: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    backgroundColor: Colors.bgCard,
    overflow: "hidden",
  },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(0,255,65,0.05)",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  catTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  catTotal: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  stockRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  stockLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  stockName: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
  },
  stockQty: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    minWidth: 50,
    textAlign: "right",
  },
  stockBarBg: {
    height: 3,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  stockBarFill: {
    height: 3,
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  catSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  catSummaryLabel: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    flex: 1,
  },
  catSummaryValue: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    minWidth: 50,
    textAlign: "right",
  },
}));


export default withScreenBoundary(EconomyScreen, "economy");

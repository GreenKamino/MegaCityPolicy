// ─────────────────────────────────────────────────────────────────────────────
// Task #473 — Single authority for the recurring per-tick credit breakdown.
//
// Every recurring credit flow the tick charges or earns is computed HERE, and
// runTick (formulas.ts / militaryLogistics.ts) calls these same functions to
// apply the actual charges. The Overview, Economy and Military tabs read
// computeEconomyBreakdown(state), so what the player sees is structurally
// guaranteed to be what the engine charges — there is no second copy of any
// upkeep table anywhere in the app.
//
// Leaf-module rule (see infrastructureBreakdown/powerBreakdown precedents):
// this file may only import DEF/DATA modules and types. It must NEVER import
// formulas.ts, militaryLogistics.ts or any module that transitively pulls the
// tick, or it would create a require cycle.
//
// Excluded from netIncome (event-driven, not recurring): combat loot/victory
// rewards, contract overruns, cult auto-build discounts, mining events,
// one-time construction/hire costs. Periodic-but-not-every-tick flows (loan
// payments, savings interest, auto recon) are surfaced separately in
// `scheduled` with their cadence — averaging them into the per-tick figure
// would make the number disagree with the actual tick-to-tick delta.
// ─────────────────────────────────────────────────────────────────────────────

import { UNIT_CATEGORIES, CONTRACT_TEMPLATES_MAP, CONTRACTORS_MAP } from "@/engine/contracts";
import { POLICY_MAP } from "@/engine/policies";
import { COMPANIES_MAP, isCompanyOperational } from "@/engine/companies";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import { MILITARY_POLICIES } from "@/engine/militaryOverhaul";
import { isBigBrotherActive, isBBContentId } from "@/engine/addons/bigBrother";
import { isSixthDayActive, isSDContentId } from "@/engine/addons/sixthDay";
import type { GameState } from "@/engine/types";

// ─── DIFFICULTY ──────────────────────────────────────────────────────────────
// Mirror of the upkeep column of formulas.ts diffMult (the single place the
// engine scales upkeep). Income scaling stays in formulas because it is baked
// into the persisted rates before the UI ever sees them.
export const UPKEEP_DIFFICULTY_MULT: Record<string, number> = {
  easy: 0.8,
  medium: 1,
  hard: 1.2,
};

export function getUpkeepMult(difficulty: string | undefined): number {
  return UPKEEP_DIFFICULTY_MULT[difficulty ?? "medium"] ?? 1;
}

// ─── UNIT UPKEEP ─────────────────────────────────────────────────────────────
// Derived from the authoritative UNIT_CATEGORIES defs (upkeepPerUnit) — the
// same numbers the Recruitment screen shows on every hire card. The engine
// previously charged a hand-copied 39-key subset; now every unit type with an
// upkeepPerUnit is charged exactly what its def says.
const UNIT_UPKEEP_MAP: Record<string, number> = {};
for (const def of UNIT_CATEGORIES) {
  UNIT_UPKEEP_MAP[def.key] = def.upkeepPerUnit;
}

export function computeUnitUpkeepBase(units: Record<string, number>): number {
  let total = 0;
  for (const key in UNIT_UPKEEP_MAP) {
    const count = units[key];
    if (typeof count !== "number" || count <= 0) continue;
    total += count * UNIT_UPKEEP_MAP[key];
  }
  return total;
}

/** The exact amount the tick deducts: floor(base × difficulty upkeep mult). */
export function computeUnitUpkeep(units: Record<string, number>, difficulty: string | undefined): number {
  return Math.floor(computeUnitUpkeepBase(units) * getUpkeepMult(difficulty));
}

// ─── INFRASTRUCTURE UPKEEP ───────────────────────────────────────────────────
// Moved verbatim from the tick's hardcoded sum — this table is now the only
// copy in the codebase.
export const INFRA_UPKEEP: Record<string, number> = {
  fusionReactors: 80,
  microFusionGenerators: 40,
  megaDesalinationPlants: 30,
  waterRecyclingSuperFacilities: 35,
  syntheticFoodPlants: 25,
  megaManufacturingPlants: 45,
  metalFoundryComplexes: 35,
  advancedResearchLabs: 30,
  quantumDataCenters: 50,
  cityShieldGenerator: 100,
  automatedDroneDefenseGrid: 40,
  centralCityCommandNexus: 60,
  luxurySkyHotels: 25,
  entertainmentMegaPlexes: 20,
  megaCityObservationDecks: 15,
  neonDistrictPromenades: 12,
  augmentationClinics: 20,
  cyberSurgeryHospitals: 35,
  neuralResearchLabs: 40,
  implantManufacturingPlants: 45,
  cyberneticRecyclingFacilities: 15,
  militaryAugmentationLabs: 50,
  aiTrainingDataCenters: 30,
  nanoFabricationLabs: 55,
  biotechFarms: 25,
  blackMarketCyberClinics: 10,
  petrochemicalCrackingTowers: 30,
  acidProductionPlant: 20,
  industrialSolventWorks: 15,
  fertilizerSynthesisPlant: 20,
  explosivesCompoundingFacility: 25,
  adhesivesAndResinsFactory: 15,
  waterTreatmentChemWorks: 18,
  paintAndCoatingsPlant: 12,
  lubricantsAndFluidsMill: 15,
  chemicalStorageTerminal: 10,
  polymerExtrusionPlant: 20,
  injectionMouldingFacility: 25,
  syntheticRubberWorks: 18,
  compositeLaminationMill: 30,
  foamManufacturingPlant: 12,
  bioPlasticsLab: 22,
  consumerGoodsFactory: 20,
  electronicsAssemblyPlant: 25,
  vehicleManufacturingComplex: 35,
  textileMillComplex: 15,
  toolAndDieWorks: 18,
  medicalDeviceFabLab: 22,
  nanoMaterialsResearchLab: 35,
  superconductorFoundry: 30,
  reactorAlloySmeltingBay: 28,
  aerospaceGradeTitaniumMill: 32,
  oreWashingStation: 12,
  deepCoreExcavators: 20,
  quarryAndCrushingPlant: 15,
  coalGasificationPlant: 18,
};

export function computeInfraUpkeepBase(buildings: Record<string, number>): number {
  let total = 0;
  for (const key in INFRA_UPKEEP) {
    const count = buildings[key];
    if (typeof count !== "number" || count <= 0) continue;
    total += count * INFRA_UPKEEP[key];
  }
  return total;
}

/** The exact amount the tick deducts: floor(base × difficulty upkeep mult). */
export function computeInfraUpkeep(buildings: Record<string, number>, difficulty: string | undefined): number {
  return Math.floor(computeInfraUpkeepBase(buildings) * getUpkeepMult(difficulty));
}

// ─── POLICY COSTS ────────────────────────────────────────────────────────────
// Mirrors the tick's active-policy filter, including the add-on content gates.
export function getBillableCityPolicies(
  activePolicies: string[] | undefined,
  addons: Record<string, boolean> | undefined,
): string[] {
  const bbOn = isBigBrotherActive(addons);
  const sdOn = isSixthDayActive(addons);
  return (activePolicies ?? []).filter((pid) => {
    if (isBBContentId(pid) && !bbOn) return false;
    if (isSDContentId(pid) && !sdOn) return false;
    return true;
  });
}

export function computePolicyCost(
  activePolicies: string[] | undefined,
  addons: Record<string, boolean> | undefined,
): number {
  let total = 0;
  for (const pid of getBillableCityPolicies(activePolicies, addons)) {
    const pd = POLICY_MAP[pid];
    if (!pd) continue;
    total += pd.costPerTick;
  }
  return total;
}

// ─── COMPANY MAINTENANCE ─────────────────────────────────────────────────────
/**
 * Gross per-tick tax output from licensed companies (Task #582). This amount
 * is already INCLUDED in rates.taxIncome (formulas adds def.taxOutput per
 * licensed instance), so it is a carve-out for display/ledger itemization —
 * never add it to an income total a second time.
 */
export function computeCompanyTaxOutput(companies: GameState["companies"] | undefined): number {
  let total = 0;
  for (const instance of companies ?? []) {
    if (!isCompanyOperational(instance)) continue;
    const def = COMPANIES_MAP[instance.companyId];
    if (def) total += def.taxOutput;
  }
  return total;
}

export function computeCompanyMaintenance(companies: GameState["companies"] | undefined): number {
  let total = 0;
  for (const instance of companies ?? []) {
    if (!isCompanyOperational(instance)) continue;
    const def = COMPANIES_MAP[instance.companyId];
    if (!def) continue;
    total += def.maintenanceCost;
  }
  return total;
}

// ─── MILITARY INSTALLATIONS + DOCTRINE ───────────────────────────────────────
const INSTALLATION_UPKEEP_MAP: Record<string, number> = {};
for (const b of MILITARY_BUILDINGS) {
  INSTALLATION_UPKEEP_MAP[b.id] = b.upkeep;
}

export function computeInstallationBuildingUpkeep(
  installationsBuilt: Record<string, number> | undefined,
): number {
  let total = 0;
  for (const id in installationsBuilt ?? {}) {
    const n = installationsBuilt![id];
    if (typeof n !== "number" || n <= 0) continue;
    total += n * (INSTALLATION_UPKEEP_MAP[id] ?? 0);
  }
  return total;
}

export function computeDoctrineCreditsDrain(militaryPolicyIds: string[] | undefined): number {
  let total = 0;
  for (const pid of militaryPolicyIds ?? []) {
    const def = MILITARY_POLICIES.find((p) => p.id === pid);
    if (!def) continue;
    total += def.effects.creditsDrain ?? 0;
  }
  return total;
}

/** Full military-side recurring drain: doctrine credits + per-base upkeep. */
export function computeInstallationUpkeep(state: GameState): number {
  const mil = state.militaryOverhaul;
  return (
    computeDoctrineCreditsDrain(mil?.activePolicies) +
    computeInstallationBuildingUpkeep(mil?.logistics?.installationsBuilt)
  );
}

// ─── GARRISONS, NUCLEAR, ZONES, CONTRACTS ────────────────────────────────────
export function computeGarrisonUpkeep(state: GameState): number {
  const zones = state.combat?.zones ?? [];
  let totalGarrison = 0;
  for (const z of zones) totalGarrison += z.garrison;
  return Math.floor(totalGarrison * 2);
}

export function computeNuclearMaintenance(state: GameState): number {
  if (!state.unlockedTechnologies.includes("mil_nuclear_weapons_program")) return 0;
  return (state.nuclearStockpile?.warheads ?? 0) * 200;
}

/** Credits trickling in from friendly combat zones with a resource bonus. */
export function computeZoneTribute(state: GameState): number {
  let total = 0;
  for (const zone of state.combat?.zones ?? []) {
    if (zone.status !== "friendly" || !zone.resourceBonus?.credits) continue;
    total += Math.round(zone.resourceBonus.credits * (zone.controlLevel / 100) * 0.05);
  }
  return total;
}

/** Recurring per-tick fees on active contracts (same math as the tick). */
export function computeContractRecurringFees(state: GameState): number {
  const pp = state.procurementPolicies ?? {};
  let total = 0;
  for (const contract of state.activeContracts ?? []) {
    if (contract.status !== "active") continue;
    const def = CONTRACT_TEMPLATES_MAP[contract.defId];
    if (!def || !(def.recurringCostPerTick > 0)) continue;
    const contractor = CONTRACTORS_MAP[contract.contractorId];
    const costMod = pp.lowestBidPriority ? 0.85 : 1;
    total += Math.floor(def.recurringCostPerTick * costMod * (contractor?.costMultiplier ?? 1));
  }
  return total;
}

// ─── INCOME FRICTION (shared with the tick) ─────────────────────────────────
// Bureaucratic overhead on tax and port congestion on trade — the tick calls
// these, so the P&L's overhead lines are exactly what was withheld.
export function computeTaxAfterOverhead(
  grossTaxIncome: number,
  population: number,
): { net: number; overhead: number; factor: number } {
  const grossTax = Math.max(0, grossTaxIncome);
  const popOver = Math.max(0, population - 200_000);
  const factor = Math.min(0.3, popOver / 4_333_333);
  const overhead = Math.floor(grossTax * factor);
  return { net: Math.max(0, grossTax - overhead), overhead, factor };
}

export function computeTradeAfterCongestion(
  grossTradeIncome: number,
  population: number,
): { net: number; loss: number; factor: number } {
  const grossTrade = Math.max(0, grossTradeIncome);
  const popOver = Math.max(0, population - 200_000);
  const factor = Math.min(0.25, popOver / 5_200_000);
  const loss = Math.floor(grossTrade * factor);
  return { net: Math.max(0, grossTrade - loss), loss, factor };
}

// ─── INDEPENDENT ENTERPRISE TAX ──────────────────────────────────────────────
/** Per-tick tax from the independent local economy — same floor as the tick. */
export function computeEnterpriseTax(state: GameState): number {
  const econ = state.localEconomy;
  if (!econ || econ.taxPerTick <= 0) return 0;
  return Math.max(0, Math.floor(econ.taxPerTick));
}

// ─── MINING POLICY INCOME ────────────────────────────────────────────────────
export function computeMiningPolicyIncome(
  activeMiningPolicies: string[] | undefined,
  steelProduction: number,
): { reclamationTax: number; blackMarketOre: number } {
  const miningPolicies = new Set(activeMiningPolicies ?? []);
  const steelBase = Math.max(0, steelProduction);
  return {
    reclamationTax: miningPolicies.has("reclamation_tax") ? Math.max(2000, Math.floor(steelBase * 8)) : 0,
    blackMarketOre: miningPolicies.has("black_market_ore") ? Math.max(3000, Math.floor(steelBase * 12)) : 0,
  };
}

// ─── FULL BREAKDOWN ─────────────────────────────────────────────────────────
export type EconomyBreakdown = {
  income: {
    /** Tax revenue actually credited (gross minus bureaucratic overhead). */
    tax: number;
    taxGross: number;
    overhead: number;
    /** Trade income actually credited (gross minus port congestion). */
    trade: number;
    tradeGross: number;
    portCongestion: number;
    tourism: number;
    /**
     * Gross tax output from licensed companies — a carve-out of taxGross
     * (already counted there and in `tax`), itemized so commercial licensing
     * income is visible as its own line. NOT additive to `total`.
     */
    licensedCompanyTax: number;
    /** Tax trickle from the independent local economy (shops & chains). */
    enterpriseTax: number;
    reclamationTax: number;
    blackMarketOre: number;
    zoneTribute: number;
    total: number;
  };
  expenses: {
    unitUpkeep: number;
    infraUpkeep: number;
    policyCost: number;
    companyMaintenance: number;
    installationUpkeep: number;
    garrisonUpkeep: number;
    nuclearMaintenance: number;
    contractFees: number;
    total: number;
  };
  /** income.total − expenses.total — the recurring per-tick credit change. */
  netIncome: number;
  /** Flows that fire on a cadence, NOT every tick — shown separately. */
  scheduled: {
    /** Total monthly loan installments currently owed (charged every 120 ticks). */
    loanPaymentMonthly: number;
    /** Interest credited monthly across savings accounts (at current balances). */
    savingsInterestMonthly: number;
    /** Recon sweep cost charged every 4th tick when auto recon is on. */
    autoReconPer4Ticks: number;
  };
};

export function computeEconomyBreakdown(state: GameState): EconomyBreakdown {
  const rates = state.rates;
  const population = state.cityStats.population;

  const taxR = computeTaxAfterOverhead(rates.taxIncome, population);
  // Carve the licensed-company share out of gross tax for itemized display;
  // clamped so a malformed save can never show a share larger than the gross.
  const licensedCompanyTax = Math.min(
    computeCompanyTaxOutput(state.companies),
    Math.max(0, rates.taxIncome),
  );
  const tradeR = computeTradeAfterCongestion(rates.tradeIncome, population);
  const tourism = Math.max(0, rates.tourismIncome ?? 0);
  const mining = computeMiningPolicyIncome(state.activeMiningPolicies, state.rates.steelProduction);
  const zoneTribute = computeZoneTribute(state);
  const enterpriseTax = computeEnterpriseTax(state);

  const incomeTotal =
    taxR.net + tradeR.net + tourism + enterpriseTax +
    mining.reclamationTax + mining.blackMarketOre + zoneTribute;

  const unitUpkeep = computeUnitUpkeep(state.units, state.difficulty);
  const infraUpkeep = computeInfraUpkeep(state.buildings, state.difficulty);
  const policyCost = computePolicyCost(state.activePolicies, state.addons);
  const companyMaintenance = computeCompanyMaintenance(state.companies);
  const installationUpkeep = computeInstallationUpkeep(state);
  const garrisonUpkeep = computeGarrisonUpkeep(state);
  const nuclearMaintenance = computeNuclearMaintenance(state);
  const contractFees = computeContractRecurringFees(state);

  const expensesTotal =
    unitUpkeep + infraUpkeep + policyCost + companyMaintenance +
    installationUpkeep + garrisonUpkeep + nuclearMaintenance + contractFees;

  let loanPaymentMonthly = 0;
  for (const loan of state.banking?.loans ?? []) {
    if (loan.remainingBalance <= 0 || loan.defaulted) continue;
    loanPaymentMonthly += Math.min(loan.monthlyPayment, loan.remainingBalance);
  }
  let savingsInterestMonthly = 0;
  for (const acct of state.banking?.accounts ?? []) {
    if (acct.balance > 0) savingsInterestMonthly += Math.floor(acct.balance * acct.interestRate);
  }
  const autoReconPer4Ticks = state.intelligence?.autoRecon
    ? (state.intelligence.autoReconCostPerTick ?? 500)
    : 0;

  return {
    income: {
      tax: taxR.net,
      taxGross: Math.max(0, rates.taxIncome),
      overhead: taxR.overhead,
      licensedCompanyTax,
      trade: tradeR.net,
      tradeGross: Math.max(0, rates.tradeIncome),
      portCongestion: tradeR.loss,
      tourism,
      enterpriseTax,
      reclamationTax: mining.reclamationTax,
      blackMarketOre: mining.blackMarketOre,
      zoneTribute,
      total: incomeTotal,
    },
    expenses: {
      unitUpkeep,
      infraUpkeep,
      policyCost,
      companyMaintenance,
      installationUpkeep,
      garrisonUpkeep,
      nuclearMaintenance,
      contractFees,
      total: expensesTotal,
    },
    netIncome: incomeTotal - expensesTotal,
    scheduled: {
      loanPaymentMonthly,
      savingsInterestMonthly,
      autoReconPer4Ticks,
    },
  };
}

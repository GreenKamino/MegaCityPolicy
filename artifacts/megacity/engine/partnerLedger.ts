import type { GameState, PartnerLedger, PartnerLedgerEntry, PartnerPersonality } from "./types";

const RECENT_CAP = 12;

const ACTION_WEIGHTS: Record<string, { favor?: number; grudge?: number; debt?: number }> = {
  "send-aid": { favor: 8, debt: -3 },
  "rebuild-assistance": { favor: 14 },
  "refugee-program": { favor: 6 },
  "medical-mission": { favor: 9 },
  "fund": { favor: 7, debt: 2 },
  "trade-agreement": { favor: 4 },
  "resource-exchange": { favor: 3 },
  "technology-sharing": { favor: 12 },
  "joint-research": { favor: 10 },
  "joint-operation": { favor: 12 },
  "propose-alliance": { favor: 18 },
  "negotiate-ceasefire": { favor: 6 },
  "diplomatic-marriage": { favor: 25 },
  "hostage-exchange": { favor: 8, debt: -1 },
  "open-comms": { favor: 1 },
  "request-audience": { favor: 2 },
  "buy-rumors": { debt: 1 },
  "request-intel": { debt: 3 },
  "spy-network": { grudge: 2 },
  "counter-intel": {},
  "smuggling-deal": { favor: 3 },
  "arms-deal": { favor: 4, debt: 2 },
  "gun-running": { favor: 3, debt: 3 },
  "mercenary-contract": { favor: 4 },
  "cultural-subversion": { grudge: 8 },
  "issue-ultimatum": { grudge: 12 },
  "demand-tribute": { grudge: 14 },
  "impose-sanctions": { grudge: 10 },
  "trade-embargo": { grudge: 11 },
  "impose-blockade": { grudge: 18 },
  "protection-racket": { grudge: 9 },
  "cyber-attack": { grudge: 16 },
  "infrastructure-raid": { grudge: 22 },
  "covert-destabilize": { grudge: 17 },
  "proxy-war": { grudge: 25 },
  "false-flag": { grudge: 30 },
  "declare-war": { grudge: 35 },
  "petition-leader": { favor: 1 },
  "rally-support": { favor: 2 },
  "negotiate-charter": { favor: 6 },
  "request-summit": { favor: 4 },
  "joint-treaty": { favor: 12 },
  "diplomatic-recognition": { favor: 10 },
  "offer-protection": { favor: 8 },
  "annexation-offer": { grudge: 4 },
  "audit-records": { grudge: 5 },
  "joint-patrol": { favor: 5 },
  "buyout-offer": { favor: 6 },
  "regulatory-capture": { grudge: 8 },
  "shrine-construction": { favor: 14 },
  "prophecy-request": { favor: 3 },
  "betray-deal": { grudge: 28 },
  "demand-cut": { grudge: 7 },
  "land-grant": { favor: 18 },
  "amnesty": { favor: 12 },
  // Faction-screen sandbox actions (event-only). Mirror EVENT_ONLY_ACTION_RULES
  // in engine/diplomacyEngine.ts — every event-only id should appear here so
  // trust trend tracking reflects sandbox decisions.
  "negotiate": { favor: 3 },
  "suppress": { grudge: 8 },
  "host-banquet": { favor: 8 },
  "grant-honor": { favor: 6 },
  "tax-concession": { favor: 5, debt: -2 },
  "seize-assets": { grudge: 14 },
  "plant-informant": { grudge: 4 },
  "spread-rumors": { grudge: 6 },
  "arrange-accident": { grudge: 30 },
  "arrest-leaders": { grudge: 20 },
  "purge": { grudge: 40 },
};

export function emptyLedger(partnerId: string, tick: number): PartnerLedger {
  return {
    partnerId,
    favors: 0,
    grudges: 0,
    debts: 0,
    lastInteractionTick: tick,
    recent: [],
    reputationLine: "No formal record yet.",
    trustTrend: "steady",
  };
}

export function getOrCreateLedger(state: GameState, partnerId: string): PartnerLedger {
  const ledgers = state.partnerLedgers ?? {};
  return ledgers[partnerId] ?? emptyLedger(partnerId, state.totalTicks);
}

function describeLedger(ledger: PartnerLedger): string {
  if (ledger.grudges > 60) return "Holds deep enmity. Will twist any opening into a knife.";
  if (ledger.grudges > 30) return "Resentful and watchful. Looking for proof of bad faith.";
  if (ledger.favors > 60) return "Considers you a true friend. Doors stay open.";
  if (ledger.favors > 30) return "Warm regard. Recent goodwill remembered.";
  if (ledger.debts > 20) return "Owes you. Knows it. Doesn't always like it.";
  if (ledger.debts < -20) return "Has been generous. Expects reciprocation.";
  if (ledger.recent.length === 0) return "No formal record yet.";
  return "Cordial but transactional.";
}

export function recordPartnerLedger(
  state: GameState,
  partnerId: string,
  action: string,
  outcome: "accepted" | "rejected" | "broken",
  personality: PartnerPersonality | undefined,
): GameState {
  const ledgers = { ...(state.partnerLedgers ?? {}) };
  const previous = ledgers[partnerId] ?? emptyLedger(partnerId, state.totalTicks);

  const weights = ACTION_WEIGHTS[action] ?? {};
  const memMul = personality?.values.loyaltyMemory ?? 1;
  const grudgeMul = personality?.values.grudgeMemory ?? 1;

  let favorDelta = 0;
  let grudgeDelta = 0;
  let debtDelta = 0;
  let entryWeight = 0;

  if (outcome === "accepted") {
    favorDelta = Math.round((weights.favor ?? 0) * memMul);
    grudgeDelta = Math.round((weights.grudge ?? 0) * grudgeMul);
    debtDelta = weights.debt ?? 0;
    entryWeight = favorDelta - grudgeDelta;
  } else if (outcome === "rejected") {
    grudgeDelta = Math.round(((weights.grudge ?? 0) * 0.5 + 1) * grudgeMul);
    favorDelta = -Math.round((weights.favor ?? 0) * 0.3 * memMul);
    entryWeight = -3;
  } else if (outcome === "broken") {
    grudgeDelta = Math.round(((weights.favor ?? 5) + (weights.grudge ?? 0)) * grudgeMul);
    favorDelta = -Math.round((weights.favor ?? 5) * memMul);
    entryWeight = -10;
  }

  const newRecent: PartnerLedgerEntry[] = [
    { action, tick: state.totalTicks, outcome, weight: entryWeight },
    ...previous.recent,
  ].slice(0, RECENT_CAP);

  const recentFavorTrend = newRecent.slice(0, 4).reduce((s, e) => s + e.weight, 0);
  const trustTrend: PartnerLedger["trustTrend"] =
    recentFavorTrend > 4 ? "rising" : recentFavorTrend < -4 ? "falling" : "steady";

  const updated: PartnerLedger = {
    partnerId,
    favors: Math.max(0, Math.min(200, previous.favors + favorDelta)),
    grudges: Math.max(0, Math.min(200, previous.grudges + grudgeDelta)),
    debts: Math.max(-100, Math.min(100, previous.debts + debtDelta)),
    lastInteractionTick: state.totalTicks,
    recent: newRecent,
    reputationLine: "",
    trustTrend,
  };
  updated.reputationLine = describeLedger(updated);

  ledgers[partnerId] = updated;
  return { ...state, partnerLedgers: ledgers };
}

export function ledgerAcceptanceModifier(ledger: PartnerLedger, personality?: PartnerPersonality): number {
  const grudgeMul = personality?.values.grudgeMemory ?? 1;
  const favorMul = personality?.values.loyaltyMemory ?? 1;
  const favorBonus = Math.round((ledger.favors / 8) * favorMul);
  const grudgePenalty = Math.round((ledger.grudges / 5) * grudgeMul);
  const debtBonus = ledger.debts > 0 ? Math.round(ledger.debts / 4) : Math.round(ledger.debts / 6);
  return favorBonus - grudgePenalty + debtBonus;
}

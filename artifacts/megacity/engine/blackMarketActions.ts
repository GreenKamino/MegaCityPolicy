import type { BlackMarketAuditEntry, GameMessage, GameState, TickEntry } from "@/engine/types";

export const BLACK_MARKET_HISTORY_CAP = 100;

export type BlackMarketItemId =
  | "bm-weapons-cache" | "bm-smuggled-meds" | "bm-forged-ids" | "bm-stolen-tech"
  | "bm-rare-minerals" | "bm-cyber-implants" | "bm-contraband-food"
  | "bm-surveillance-jammer" | "bm-gang-intel" | "bm-bribe-fund" | "bm-explosives"
  | "bm-mutant-serum" | "bm-informant-network" | "bm-stolen-vehicles"
  | "bm-counterfeit-credits" | "bm-radiation-meds" | "bm-illegal-broadcast"
  | "bm-slave-labor" | "bm-alien-artifact" | "bm-data-wipe";

export type BlackMarketItem = {
  id: BlackMarketItemId;
  name: string;
  price: number;
  riskLevel: number;
};

export type BlackMarketPurchaseResult =
  | {
      ok: true;
      delivered: boolean;
      next: Pick<GameState, "resources" | "cityStats" | "units" | "messages" | "pendingTickEntries" | "blackMarketHistory">;
    }
  | { ok: false; reason: string };

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function performBlackMarketPurchase(
  prev: GameState,
  item: BlackMarketItem,
  rng: () => number = Math.random,
): BlackMarketPurchaseResult {
  const credits = prev.resources?.credits ?? 0;
  if (!Number.isFinite(credits) || credits < item.price) {
    return { ok: false, reason: `Insufficient credits — need ${item.price.toLocaleString()}c.` };
  }

  const delivered = rng() >= item.riskLevel / 100;
  const resources = { ...prev.resources, credits: credits - item.price };
  const cityStats = { ...prev.cityStats };
  const units = { ...prev.units };
  const apply = (key: keyof typeof resources | keyof typeof cityStats, amount: number) => {
    if (key in resources) (resources as Record<string, number>)[key] = Math.max(0, ((resources as Record<string, number>)[key] ?? 0) + amount);
    else (cityStats as Record<string, number>)[key] = clamp(((cityStats as Record<string, number>)[key] ?? 0) + amount);
  };

  if (delivered) {
    switch (item.id) {
      case "bm-weapons-cache": apply("ammo", 10); apply("defenseRating", 5); break;
      case "bm-smuggled-meds": apply("medSupplies", 50); break;
      case "bm-forged-ids": apply("crime", -5); break;
      case "bm-stolen-tech": apply("researchProgress", 15); break;
      case "bm-rare-minerals": apply("steel", 200); break;
      case "bm-cyber-implants": apply("defenseRating", 3); break;
      case "bm-contraband-food": apply("food", 100); apply("happiness", 5); break;
      case "bm-surveillance-jammer": apply("lawOrder", -15); break;
      case "bm-gang-intel": apply("crime", -8); break;
      case "bm-bribe-fund": apply("corruption", 15); apply("unrest", -10); break;
      case "bm-explosives": apply("defenseRating", 20); apply("unrest", 10); break;
      case "bm-mutant-serum": apply("diseaseRisk", 10); break;
      case "bm-informant-network": apply("crime", -12); apply("corruption", 5); break;
      case "bm-stolen-vehicles": units.patrolCars = (units.patrolCars ?? 0) + 5; break;
      case "bm-counterfeit-credits": resources.credits += 5000; break;
      case "bm-radiation-meds": apply("medSupplies", 30); apply("diseaseRisk", -5); break;
      case "bm-illegal-broadcast": apply("happiness", 10); break;
      case "bm-slave-labor": apply("employment", 15); apply("unrest", 10); break;
      case "bm-alien-artifact": apply("researchProgress", 25); break;
      case "bm-data-wipe": apply("crime", -5); apply("corruption", 8); break;
    }
  } else {
    apply("corruption", 5);
    apply("unrest", 3);
  }

  const tick = prev.totalTicks ?? 0;
  const message: GameMessage = {
    id: `black-market-${item.id}-${tick}-${(prev.pendingTickEntries ?? []).length}`,
    timestamp: { ...prev.gameDate },
    tick,
    category: "alert",
    title: delivered ? `BLACK MARKET: ${item.name} DELIVERED` : `BLACK MARKET: ${item.name} SEIZED`,
    body: delivered
      ? `${item.name} cleared the handoff. The advertised effect was applied.`
      : `${item.name} was seized in transit. The loss triggered an investigation: +5 corruption, +3 unrest.`,
    read: false,
    priority: delivered ? "normal" : "high",
  };
  const entry: TickEntry = {
    label: "Black Market Purchase",
    delta: -item.price,
    unit: "credits",
    reason: `${item.name} — ${delivered ? "delivered" : "seized in transit"}`,
    severity: delivered ? "neutral" : "warning",
  };
  const auditEntry: BlackMarketAuditEntry = {
    id: message.id,
    itemId: item.id,
    itemName: item.name,
    cost: item.price,
    outcome: delivered ? "delivered" : "seized",
    tick,
    date: { ...prev.gameDate },
  };
  return {
    ok: true,
    delivered,
    next: {
      resources,
      cityStats,
      units,
      messages: [message, ...(prev.messages ?? [])].slice(0, 200),
      pendingTickEntries: [...(prev.pendingTickEntries ?? []), entry],
      blackMarketHistory: [...(prev.blackMarketHistory ?? []), auditEntry].slice(-BLACK_MARKET_HISTORY_CAP),
    },
  };
}
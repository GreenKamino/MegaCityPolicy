import type { GameMessage, GameState } from "./types";
import { gameTimestamp as vulcanTimestamp } from "./gameTimestamp";

// Round 4 sandbox-breadth: VULCAN ARMS CONSORTIUM.
//
// A standalone arms manufacturer the player can do business with. Vulcan
// builds and runs its own munitions factories; the player either signs
// procurement contracts (cash up front, deliveries over time) or co-funds
// new factory construction (larger reserve, faster fulfillment).
//
// This module is pure: every transaction helper takes a GameState slice and
// returns a Partial<GameState> on success, never mutating its input.
// Integration with the tick loop and a UI screen are deferred to a follow-up.

// ──────────────────────────────────────────────────────────────────────────
// Catalogs
// ──────────────────────────────────────────────────────────────────────────

export type MunitionTypeId =
  | "standard_rounds"
  | "ap_rounds"
  | "shotgun_shells"
  | "artillery_shells"
  | "tank_shells"
  | "rockets_unguided"
  | "hellfire_missiles"
  | "cruise_missiles";

export type MunitionCategory = "small_arms" | "artillery" | "rocket" | "missile";

export type MunitionRule = {
  id: MunitionTypeId;
  label: string;
  category: MunitionCategory;
  description: string;
};

export const MUNITION_RULES: Record<MunitionTypeId, MunitionRule> = {
  standard_rounds:    { id: "standard_rounds",    label: "Standard Rounds",       category: "small_arms", description: "Bulk 9mm and 7.62 small-arms ammunition. The bread and butter of Vulcan's lines." },
  ap_rounds:          { id: "ap_rounds",          label: "Armor-Piercing Rounds", category: "small_arms", description: "Tungsten-core small-arms rounds. Cuts standard plate." },
  shotgun_shells:     { id: "shotgun_shells",     label: "Shotgun Shells",        category: "small_arms", description: "12-gauge buckshot, slug, and incendiary loads." },
  artillery_shells:   { id: "artillery_shells",   label: "Artillery Shells",      category: "artillery",  description: "155mm HE shells for tube artillery batteries." },
  tank_shells:        { id: "tank_shells",        label: "Tank Shells",           category: "artillery",  description: "120mm sabot and HEAT rounds for armor." },
  rockets_unguided:   { id: "rockets_unguided",   label: "Unguided Rockets",      category: "rocket",     description: "Saturation rocket pods. Fire-and-pray ground support." },
  hellfire_missiles:  { id: "hellfire_missiles",  label: "Hellfire Missiles",     category: "missile",    description: "Laser-guided air-to-ground missiles. Precision strike." },
  cruise_missiles:    { id: "cruise_missiles",    label: "Cruise Missiles",       category: "missile",    description: "Long-range strategic cruise missiles. Use sparingly." },
};

// ──────────────────────────────────────────────────────────────────────────
// Factories
// ──────────────────────────────────────────────────────────────────────────

export type FactoryTypeId =
  | "ammo_plant"
  | "shell_forge"
  | "missile_works"
  | "strategic_arsenal";

export type FactoryRule = {
  id: FactoryTypeId;
  label: string;
  description: string;
  buildCost: number;
  buildSteel: number;
  buildTicks: number;
  upkeepCredits: number;
  upkeepSteel: number;
  upkeepFuel: number;
  // Per-tick output once built. Multiple lines per factory.
  outputs: { munitionId: MunitionTypeId; perTick: number }[];
};

export const FACTORY_RULES: Record<FactoryTypeId, FactoryRule> = {
  ammo_plant: {
    id: "ammo_plant",
    label: "Ammo Plant",
    description: "Small-arms ammunition assembly line. Standard rounds, AP rounds, shotgun shells.",
    buildCost: 80_000,
    buildSteel: 200,
    buildTicks: 24,
    upkeepCredits: 800,
    upkeepSteel: 4,
    upkeepFuel: 2,
    outputs: [
      { munitionId: "standard_rounds", perTick: 60 },
      { munitionId: "ap_rounds",       perTick: 12 },
      { munitionId: "shotgun_shells",  perTick: 25 },
    ],
  },
  shell_forge: {
    id: "shell_forge",
    label: "Shell Forge",
    description: "Heavy-shell foundry. 155mm artillery and 120mm tank rounds.",
    buildCost: 160_000,
    buildSteel: 500,
    buildTicks: 36,
    upkeepCredits: 1_800,
    upkeepSteel: 12,
    upkeepFuel: 6,
    outputs: [
      { munitionId: "artillery_shells", perTick: 8 },
      { munitionId: "tank_shells",      perTick: 4 },
    ],
  },
  missile_works: {
    id: "missile_works",
    label: "Missile Works",
    description: "Tactical missile and rocket assembly. Unguided rockets and Hellfire missiles.",
    buildCost: 240_000,
    buildSteel: 700,
    buildTicks: 48,
    upkeepCredits: 3_000,
    upkeepSteel: 18,
    upkeepFuel: 14,
    outputs: [
      { munitionId: "rockets_unguided",  perTick: 6 },
      { munitionId: "hellfire_missiles", perTick: 2 },
    ],
  },
  strategic_arsenal: {
    id: "strategic_arsenal",
    label: "Strategic Arsenal",
    description: "Cruise missile production line. The crown of Vulcan's portfolio.",
    buildCost: 500_000,
    buildSteel: 1_500,
    buildTicks: 72,
    upkeepCredits: 6_500,
    upkeepSteel: 30,
    upkeepFuel: 28,
    outputs: [
      { munitionId: "cruise_missiles", perTick: 1 },
    ],
  },
};

export const FACTORY_TYPE_IDS: readonly FactoryTypeId[] =
  Object.keys(FACTORY_RULES) as FactoryTypeId[];

// ──────────────────────────────────────────────────────────────────────────
// Procurement contracts
// ──────────────────────────────────────────────────────────────────────────

export type ProcurementTemplateId =
  | "pc-bulk-ammo-1k"
  | "pc-ap-bulk-500"
  | "pc-shotgun-bulk-500"
  | "pc-artillery-pact"
  | "pc-tank-pact"
  | "pc-rocket-bulk"
  | "pc-hellfire-batch"
  | "pc-cruise-strategic";

export type ProcurementTemplate = {
  id: ProcurementTemplateId;
  name: string;
  description: string;
  munitionId: MunitionTypeId;
  totalUnits: number;
  upfrontCost: number;
  unitsPerDelivery: number;
  ticksBetweenDeliveries: number;
  cancelPenalty: number;
};

export const PROCUREMENT_TEMPLATES: Record<ProcurementTemplateId, ProcurementTemplate> = {
  "pc-bulk-ammo-1k":      { id: "pc-bulk-ammo-1k",     name: "Bulk Standard Rounds — 1,000",  description: "Sustained delivery of 9mm and 7.62 rounds.",                 munitionId: "standard_rounds",   totalUnits: 1000, upfrontCost:  18_000, unitsPerDelivery: 100, ticksBetweenDeliveries: 4,  cancelPenalty:  3_000 },
  "pc-ap-bulk-500":       { id: "pc-ap-bulk-500",      name: "AP Bulk — 500",                 description: "Tungsten-core armor-piercing rounds.",                       munitionId: "ap_rounds",         totalUnits:  500, upfrontCost:  22_000, unitsPerDelivery:  50, ticksBetweenDeliveries: 5,  cancelPenalty:  4_500 },
  "pc-shotgun-bulk-500":  { id: "pc-shotgun-bulk-500", name: "Shotgun Shells Bulk — 500",     description: "12-gauge buckshot and slugs.",                                munitionId: "shotgun_shells",    totalUnits:  500, upfrontCost:  14_000, unitsPerDelivery:  50, ticksBetweenDeliveries: 4,  cancelPenalty:  2_800 },
  "pc-artillery-pact":    { id: "pc-artillery-pact",   name: "Artillery Shell Pact — 200",    description: "Sustained delivery of 155mm HE shells.",                     munitionId: "artillery_shells",  totalUnits:  200, upfrontCost:  60_000, unitsPerDelivery:  10, ticksBetweenDeliveries: 6,  cancelPenalty: 12_000 },
  "pc-tank-pact":         { id: "pc-tank-pact",        name: "Tank Round Pact — 100",         description: "120mm sabot/HEAT delivery program.",                         munitionId: "tank_shells",       totalUnits:  100, upfrontCost:  55_000, unitsPerDelivery:   5, ticksBetweenDeliveries: 6,  cancelPenalty: 11_000 },
  "pc-rocket-bulk":       { id: "pc-rocket-bulk",      name: "Unguided Rocket Bulk — 150",    description: "Saturation rocket pods, by the crate.",                      munitionId: "rockets_unguided",  totalUnits:  150, upfrontCost:  48_000, unitsPerDelivery:  10, ticksBetweenDeliveries: 5,  cancelPenalty:  9_500 },
  "pc-hellfire-batch":    { id: "pc-hellfire-batch",   name: "Hellfire Batch — 30",           description: "Laser-guided air-to-ground missile batch.",                  munitionId: "hellfire_missiles", totalUnits:   30, upfrontCost:  90_000, unitsPerDelivery:   3, ticksBetweenDeliveries: 8,  cancelPenalty: 18_000 },
  "pc-cruise-strategic":  { id: "pc-cruise-strategic", name: "Cruise Missile Strategic — 8",  description: "Long-range strategic missiles. Tightly regulated.",          munitionId: "cruise_missiles",   totalUnits:    8, upfrontCost: 240_000, unitsPerDelivery:   1, ticksBetweenDeliveries: 12, cancelPenalty: 60_000 },
};

export const PROCUREMENT_TEMPLATE_IDS: readonly ProcurementTemplateId[] =
  Object.keys(PROCUREMENT_TEMPLATES) as ProcurementTemplateId[];

// ──────────────────────────────────────────────────────────────────────────
// Vulcan state
// ──────────────────────────────────────────────────────────────────────────

export type VulcanFactory = {
  uid: string;
  type: FactoryTypeId;
  status: "building" | "active";
  buildTicksRemaining: number;
  startedTick: number;
};

export type VulcanContract = {
  uid: string;
  templateId: ProcurementTemplateId;
  unitsRemaining: number;
  ticksUntilNextDelivery: number;
  startedTick: number;
};

export type VulcanState = {
  factories: VulcanFactory[];
  contracts: VulcanContract[];
  // Company-internal stockpile of finished goods, separate from the player's
  // resource stockpiles. Procurement contracts draw from this reserve when
  // delivering — if the reserve is empty, the delivery is delayed.
  reserve: Partial<Record<MunitionTypeId, number>>;
  totalRevenue: number;
  reputation: number;
};

export function createDefaultVulcanState(): VulcanState {
  return {
    factories: [],
    contracts: [],
    reserve: {},
    totalRevenue: 0,
    reputation: 25,
  };
}

const VULCAN_NAME = "Vulcan Arms Consortium";

// ──────────────────────────────────────────────────────────────────────────
// Persona — the face Vulcan communicates through
// ──────────────────────────────────────────────────────────────────────────

export type VulcanPersona = {
  speakerName: string;
  speakerTitle: string;
  bio: string;
  motto: string;
  greeting: string;
  lines: {
    onContractSigned: readonly string[];
    onContractCancelled: readonly string[];
    onFactoryOrdered: readonly string[];
    onFactoryOnline: readonly string[];
    onDelivery: readonly string[];
    onContractFulfilled: readonly string[];
    onReserveDry: readonly string[];
    onInsufficientCredits: readonly string[];
  };
};

export const VULCAN_PERSONA: VulcanPersona = {
  speakerName: "Marshal Ilse Vargasz",
  speakerTitle: "Chief Executive Armorer, Vulcan Arms Consortium",
  bio: "Third-generation foundrywoman. Started on the shell-press line at fifteen, took the Consortium at thirty-two after the old board choked on a no-bid scandal. Wears coveralls to shareholder meetings. Doesn't blink.",
  motto: "We do not sell hope. We sell what hope runs out of.",
  greeting: "Commander. Vargasz. State your needs and the tonnage.",
  lines: {
    onContractSigned: [
      "Signed and stamped. Our lines run hot until your order ships.",
      "Ink's dry, Commander. The presses don't sleep until your last crate ships.",
      "Order in the book. Foundry's already drawing steel.",
    ],
    onContractCancelled: [
      "Noted. The penalty clears the books. Don't make a habit of this, Commander.",
      "Cancelled. Penalty's logged. The Consortium remembers indecision longer than it remembers debt.",
      "Pulled. The forfeit settles the ledger. Next time, sign with intent.",
    ],
    onFactoryOrdered: [
      "Ground breaks tomorrow. Steel and concrete don't care what the market thinks.",
      "Rebar's on the rail. The site foreman expects you in a fortnight.",
      "Order placed. The crew works the same hours regardless of weather or war.",
    ],
    onFactoryOnline: [
      "The line is live. First crates are already on the dock.",
      "Commissioned. The presses found their rhythm before the paint dried.",
      "She's running. Output's on schedule, payroll's on time.",
    ],
    onDelivery: [
      "Convoy clear. Inventory updated. Use them well — or use them anyway.",
      "Crates cleared the gate. The freight stops being our problem at the loading bay.",
      "Shipment's signed off. What you do with them is between you and the Marshal of arms.",
    ],
    onContractFulfilled: [
      "Contract closed. Our reputation tracks yours now. Try not to embarrass us both.",
      "Final crate moved. Our names are stamped on the same paperwork — keep that in mind.",
      "Order complete. The Consortium files this one under satisfied. Mostly.",
    ],
    onReserveDry: [
      "Reserve's dry. The line catches up next tick. Pacing problem, not a delivery problem.",
      "Stock's empty for the moment. The presses don't break promises, only schedules.",
      "Reserve cleared. The next batch is forming up on the line.",
    ],
    onInsufficientCredits: [
      "Marshal Vargasz does not run a charity. Find the credits or find another foundry.",
      "The Consortium does not extend credit. Come back with a number, Commander.",
      "We sign on payment, not on promise. Audit your books before you waste my time.",
    ],
  },
};

function vargaszLineSeedHash(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

export function pickVargaszLine(lines: readonly string[], seed: string): string {
  if (lines.length === 0) return "";
  return lines[vargaszLineSeedHash(seed) % lines.length] ?? lines[0]!;
}

function vargaszSay(lines: readonly string[], seed: string): string {
  return `Marshal Vargasz: "${pickVargaszLine(lines, seed)}"`;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function defaultUid(): string {
  return `vulcan-${Math.random().toString(36).slice(2, 10)}`;
}

function getCredits(state: GameState): number {
  return state.resources?.credits ?? 0;
}

function getSteel(state: GameState): number {
  return (state.resources?.steel as number | undefined) ?? 0;
}

export function getVulcanOrDefault(state: GameState): VulcanState {
  const v = (state as unknown as { vulcan?: VulcanState }).vulcan;
  return v ?? createDefaultVulcanState();
}

// ──────────────────────────────────────────────────────────────────────────
// Eligibility
// ──────────────────────────────────────────────────────────────────────────

export function getProcurementIneligibility(
  templateId: ProcurementTemplateId,
  state: GameState,
): string | null {
  const tpl = PROCUREMENT_TEMPLATES[templateId];
  if (!tpl) return "Unknown procurement template.";
  if (getCredits(state) < tpl.upfrontCost) {
    return `Ledger short on credits. ${tpl.upfrontCost.toLocaleString()} up front before we draft a contract.`;
  }
  const v = getVulcanOrDefault(state);
  const sameTemplateOpen = v.contracts.some((c) => c.templateId === templateId);
  if (sameTemplateOpen) return "That line is already in progress. One contract per template — we don't double-book a foundry.";
  if (v.contracts.length >= 6) return "Six lines is six lines. We won't sign more than 6 simultaneous contracts. Close one before you bring another.";
  return null;
}

export function getFactoryBuildIneligibility(
  factoryType: FactoryTypeId,
  state: GameState,
): string | null {
  const rule = FACTORY_RULES[factoryType];
  if (!rule) return "Unknown factory type.";
  if (getCredits(state) < rule.buildCost) {
    return `Ledger short on credits. ${rule.buildCost.toLocaleString()} required before the first beam goes up.`;
  }
  if (getSteel(state) < rule.buildSteel) {
    return `The foundry needs steel before it draws another credit. ${rule.buildSteel.toLocaleString()} required.`;
  }
  const v = getVulcanOrDefault(state);
  if (v.factories.length >= 8) return "Eight floors is the cap. We don't operate more than 8 factories at once — discipline, not lack of ambition.";
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Transaction helpers (pure)
// ──────────────────────────────────────────────────────────────────────────

export type TransactionResult =
  | { ok: true; next: Partial<GameState> }
  | { ok: false; reason: string };

export function performSignProcurementTransaction(
  state: GameState,
  templateId: ProcurementTemplateId,
  uidGen: () => string = defaultUid,
): TransactionResult {
  const reason = getProcurementIneligibility(templateId, state);
  if (reason) return { ok: false, reason };

  const tpl = PROCUREMENT_TEMPLATES[templateId];
  const v = getVulcanOrDefault(state);
  const newContract: VulcanContract = {
    uid: uidGen(),
    templateId,
    unitsRemaining: tpl.totalUnits,
    ticksUntilNextDelivery: tpl.ticksBetweenDeliveries,
    startedTick: state.totalTicks ?? 0,
  };

  const messages: GameMessage[] = [
    ...(state.messages ?? []),
    {
      id: `vulcan-sign-${newContract.uid}`,
      title: `${VULCAN_NAME.toUpperCase()} — CONTRACT SIGNED`,
      body: `${tpl.name}: ${tpl.totalUnits.toLocaleString()} units. Deliveries every ${tpl.ticksBetweenDeliveries} ticks.\n\n${vargaszSay(VULCAN_PERSONA.lines.onContractSigned, newContract.uid)}`,
      tick: state.totalTicks ?? 0,
      timestamp: vulcanTimestamp(state),
      priority: "normal",
      read: false,
      category: "report",
    },
  ];

  return {
    ok: true,
    next: {
      resources: {
        ...(state.resources as GameState["resources"]),
        credits: getCredits(state) - tpl.upfrontCost,
      } as GameState["resources"],
      vulcan: {
        ...v,
        factories: v.factories.map((f) => ({ ...f })),
        contracts: [...v.contracts.map((c) => ({ ...c })), newContract],
        reserve: { ...v.reserve },
        totalRevenue: v.totalRevenue + tpl.upfrontCost,
      },
      messages,
    } as Partial<GameState>,
  };
}

export function performCancelProcurementTransaction(
  state: GameState,
  contractUid: string,
): TransactionResult {
  const v = getVulcanOrDefault(state);
  const contract = v.contracts.find((c) => c.uid === contractUid);
  if (!contract) return { ok: false, reason: "Contract not found." };
  const tpl = PROCUREMENT_TEMPLATES[contract.templateId];
  if (!tpl) return { ok: false, reason: "Contract references an unknown template." };
  const credits = getCredits(state);
  if (credits < tpl.cancelPenalty) {
    return { ok: false, reason: `Cancellation penalty is ${tpl.cancelPenalty.toLocaleString()} credits.` };
  }

  const messages: GameMessage[] = [
    ...(state.messages ?? []),
    {
      id: `vulcan-cancel-${contractUid}`,
      title: `${VULCAN_NAME.toUpperCase()} — CONTRACT CANCELLED`,
      body: `${tpl.name} cancelled. Penalty: ${tpl.cancelPenalty.toLocaleString()} credits. ${contract.unitsRemaining.toLocaleString()} undelivered units forfeit.\n\n${vargaszSay(VULCAN_PERSONA.lines.onContractCancelled, contractUid)}`,
      tick: state.totalTicks ?? 0,
      timestamp: vulcanTimestamp(state),
      priority: "high",
      read: false,
      category: "alert",
    },
  ];

  return {
    ok: true,
    next: {
      resources: {
        ...(state.resources as GameState["resources"]),
        credits: credits - tpl.cancelPenalty,
      } as GameState["resources"],
      vulcan: {
        ...v,
        factories: v.factories.map((f) => ({ ...f })),
        contracts: v.contracts.filter((c) => c.uid !== contractUid).map((c) => ({ ...c })),
        reserve: { ...v.reserve },
        reputation: Math.max(0, v.reputation - 5),
      },
      messages,
    } as Partial<GameState>,
  };
}

export function performBuildFactoryTransaction(
  state: GameState,
  factoryType: FactoryTypeId,
  uidGen: () => string = defaultUid,
): TransactionResult {
  const reason = getFactoryBuildIneligibility(factoryType, state);
  if (reason) return { ok: false, reason };

  const rule = FACTORY_RULES[factoryType];
  const v = getVulcanOrDefault(state);
  const factory: VulcanFactory = {
    uid: uidGen(),
    type: factoryType,
    status: "building",
    buildTicksRemaining: rule.buildTicks,
    startedTick: state.totalTicks ?? 0,
  };

  const messages: GameMessage[] = [
    ...(state.messages ?? []),
    {
      id: `vulcan-build-${factory.uid}`,
      title: `${VULCAN_NAME.toUpperCase()} — FACTORY ORDER PLACED`,
      body: `${rule.label} construction underway. Estimated ${rule.buildTicks} ticks to commissioning.\n\n${vargaszSay(VULCAN_PERSONA.lines.onFactoryOrdered, factory.uid)}`,
      tick: state.totalTicks ?? 0,
      timestamp: vulcanTimestamp(state),
      priority: "normal",
      read: false,
      category: "report",
    },
  ];

  return {
    ok: true,
    next: {
      resources: {
        ...(state.resources as GameState["resources"]),
        credits: getCredits(state) - rule.buildCost,
        steel: getSteel(state) - rule.buildSteel,
      } as GameState["resources"],
      vulcan: {
        ...v,
        factories: [...v.factories.map((f) => ({ ...f })), factory],
        contracts: v.contracts.map((c) => ({ ...c })),
        reserve: { ...v.reserve },
      },
      messages,
    } as Partial<GameState>,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Tick helper (pure)
// ──────────────────────────────────────────────────────────────────────────

export type VulcanTickResult = {
  next: Partial<GameState>;
  newlyActiveFactories: string[];
  deliveries: { contractUid: string; munitionId: MunitionTypeId; units: number }[];
  completedContracts: string[];
};

export function tickVulcanProduction(
  state: GameState,
  currentTick: number,
): VulcanTickResult {
  const v = getVulcanOrDefault(state);

  // Phase 1 — Advance factory builds.
  const newlyActiveFactories: string[] = [];
  const factories = v.factories.map((f) => {
    if (f.status !== "building") return { ...f };
    const remaining = f.buildTicksRemaining - 1;
    if (remaining <= 0) {
      newlyActiveFactories.push(f.uid);
      return { ...f, status: "active" as const, buildTicksRemaining: 0 };
    }
    return { ...f, buildTicksRemaining: remaining };
  });
  // Persona-voiced inbox notice for each newly online factory.
  const factoryOnlineMessages: GameMessage[] = newlyActiveFactories.map((uid) => {
    const f = factories.find((x) => x.uid === uid);
    const rule = f ? FACTORY_RULES[f.type] : null;
    return {
      id: `vulcan-online-${uid}`,
      title: `${VULCAN_NAME.toUpperCase()} — FACTORY ONLINE`,
      body: `${rule ? rule.label : "Factory"} commissioned and producing.\n\n${vargaszSay(VULCAN_PERSONA.lines.onFactoryOnline, uid)}`,
      tick: currentTick,
      timestamp: vulcanTimestamp(state),
      priority: "normal",
      read: false,
      category: "report",
    };
  });

  // Phase 2 — Active factories produce munitions into Vulcan's reserve.
  const reserve: Partial<Record<MunitionTypeId, number>> = { ...v.reserve };
  for (const f of factories) {
    if (f.status !== "active") continue;
    const rule = FACTORY_RULES[f.type];
    for (const out of rule.outputs) {
      reserve[out.munitionId] = (reserve[out.munitionId] ?? 0) + out.perTick;
    }
  }

  // Phase 3 — Active contracts deliver from the reserve to the player.
  const stockpiles: Record<string, number> = { ...(state.stockpiles ?? {}) };
  const deliveries: VulcanTickResult["deliveries"] = [];
  const completedContracts: string[] = [];
  const updatedContracts: VulcanContract[] = [];
  const messages: GameMessage[] = [...(state.messages ?? []), ...factoryOnlineMessages];
  const worldEventLog = [...(state.worldEventLog ?? [])];
  let reputationGain = 0;

  for (const c of v.contracts) {
    const tpl = PROCUREMENT_TEMPLATES[c.templateId];
    if (!tpl) {
      updatedContracts.push({ ...c });
      continue;
    }
    const ticksUntil = c.ticksUntilNextDelivery - 1;
    if (ticksUntil > 0) {
      updatedContracts.push({ ...c, ticksUntilNextDelivery: ticksUntil });
      continue;
    }
    // Delivery window. Pull from reserve, capped by remaining units and reserve stock.
    const want = Math.min(tpl.unitsPerDelivery, c.unitsRemaining);
    const have = reserve[tpl.munitionId] ?? 0;
    const ship = Math.max(0, Math.min(want, have));
    if (ship === 0) {
      // Reserve dry — slip the delivery one tick.
      updatedContracts.push({ ...c, ticksUntilNextDelivery: 1 });
      continue;
    }
    reserve[tpl.munitionId] = have - ship;
    stockpiles[tpl.munitionId] = (stockpiles[tpl.munitionId] ?? 0) + ship;
    deliveries.push({ contractUid: c.uid, munitionId: tpl.munitionId, units: ship });

    const remaining = c.unitsRemaining - ship;
    if (remaining <= 0) {
      completedContracts.push(c.uid);
      reputationGain += 3;
      messages.push({
        id: `vulcan-complete-${c.uid}`,
        title: `${VULCAN_NAME.toUpperCase()} — CONTRACT FULFILLED`,
        body: `${tpl.name} fully delivered.\n\n${vargaszSay(VULCAN_PERSONA.lines.onContractFulfilled, c.uid)}`,
        tick: currentTick,
        timestamp: vulcanTimestamp(state),
        priority: "normal",
        read: false,
        category: "report",
      });
      worldEventLog.push({
        tick: currentTick,
        event: `Vulcan closed ${tpl.name} — final crate signed off`,
        type: "economy",
        timestamp: currentTick,
        title: "VULCAN — CONTRACT CLOSED",
        description: `${tpl.totalUnits.toLocaleString()} units of ${MUNITION_RULES[tpl.munitionId].label} delivered. Crates en route, ledger balanced, Vargasz notified.`,
        revealed: null,
      });
    } else {
      updatedContracts.push({
        ...c,
        unitsRemaining: remaining,
        ticksUntilNextDelivery: tpl.ticksBetweenDeliveries,
      });
    }
  }

  // worldEventLog cap (mirrors round 3 guard).
  const cappedLog = worldEventLog.length > 200 ? worldEventLog.slice(-200) : worldEventLog;

  const nextVulcan: VulcanState = {
    ...v,
    factories,
    contracts: updatedContracts,
    reserve,
    reputation: Math.max(0, Math.min(100, v.reputation + reputationGain)),
  };

  return {
    next: {
      vulcan: nextVulcan,
      stockpiles,
      messages,
      worldEventLog: cappedLog,
    } as Partial<GameState>,
    newlyActiveFactories,
    deliveries,
    completedContracts,
  };
}

import type { GameState, IntelItem, Faction, ExternalMegacity, Township } from "./types";

const INTEL_TTL_TICKS = 144;
const INTEL_CAP = 30;

type AnyPartner = {
  id: string;
  name: string;
  loyalty: number;
  threat: number;
  influence: number;
  kindLabel: string;
  raw: Faction | ExternalMegacity | Township;
};

function collectPartners(state: GameState): AnyPartner[] {
  const out: AnyPartner[] = [];
  for (const f of state.factions ?? []) {
    if (!f.isActive) continue;
    out.push({ id: f.id, name: f.name, loyalty: f.loyalty, threat: f.threat, influence: f.influence, kindLabel: f.type, raw: f });
  }
  for (const m of state.externalMegacities ?? []) {
    if (!m.isActive) continue;
    out.push({ id: m.id, name: m.name, loyalty: m.loyalty, threat: m.threat, influence: m.influence, kindLabel: m.factionType, raw: m });
  }
  for (const t of state.townships ?? []) {
    if (t.status === "undiscovered") continue;
    out.push({ id: t.id, name: t.name, loyalty: t.loyalty, threat: t.threat, influence: t.influence, kindLabel: t.factionType, raw: t });
  }
  return out;
}

// Annexed/occupied partners are under player control — never treat them as
// hostile intel targets even if their threat/grudge numbers stay high.
function isPlayerControlled(p: AnyPartner): boolean {
  const cs = (p.raw as { controlStatus?: string }).controlStatus;
  return cs === "annexed" || cs === "occupied";
}

function pick<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateRumorIntel(
  state: GameState,
  sourceId: string,
  sourceName: string,
  count = 2,
): IntelItem[] {
  const partners = collectPartners(state).filter((p) => p.id !== sourceId);
  if (partners.length === 0) return [];
  const out: IntelItem[] = [];

  for (let i = 0; i < count; i++) {
    const subject = pick(partners);
    if (!subject) continue;

    const ledger = (state.partnerLedgers ?? {})[subject.id];
    const tick = state.totalTicks;
    const possibles: { content: string; reliability: number }[] = [];

    if (subject.threat > 60) {
      possibles.push({
        content: `${sourceName} contacts whisper that ${subject.name}'s war planners are mapping your perimeter. Expect probing within 30 cycles.`,
        reliability: 65,
      });
    }
    if (subject.threat > 40) {
      possibles.push({
        content: `Word from the wastes: ${subject.name} has been quietly stockpiling ammunition through gray-market channels.`,
        reliability: 55,
      });
    }
    if (subject.loyalty < 30) {
      possibles.push({
        content: `${subject.name}'s inner circle calls you "the upstart" in private. Loyalty is hollow at best.`,
        reliability: 70,
      });
    }
    if (subject.loyalty > 70) {
      possibles.push({
        content: `${subject.name}'s council recently voted down a motion to distance themselves from your administration.`,
        reliability: 75,
      });
    }
    if (ledger && ledger.grudges > 40) {
      possibles.push({
        content: `${subject.name}'s leadership keeps a private list of "outstanding accounts." Your name is on it. Twice.`,
        reliability: 80,
      });
    }
    if (ledger && ledger.favors > 40) {
      possibles.push({
        content: `${subject.name}'s elders speak of you with grudging admiration. Goodwill banked, but conditional.`,
        reliability: 75,
      });
    }
    if (subject.kindLabel === "criminal") {
      possibles.push({
        content: `${subject.name} is moving cargo through corridor 7 at night. Tariffs unpaid.`,
        reliability: 60,
      });
    }
    if (subject.kindLabel === "corporate") {
      possibles.push({
        content: `${subject.name}'s board is restructuring around a new acquisition target. Your district appears in their projections.`,
        reliability: 70,
      });
    }
    if (subject.kindLabel === "cult") {
      possibles.push({
        content: `${subject.name} performs a midnight rite this cycle. Local omens hint at a coming "purification."`,
        reliability: 50,
      });
    }
    if (subject.kindLabel === "underclass") {
      possibles.push({
        content: `Tunnel runners report ${subject.name} is organizing across three sectors. Demands are coming.`,
        reliability: 65,
      });
    }
    if (subject.kindLabel === "law") {
      possibles.push({
        content: `${subject.name}'s internal affairs unit has opened a file on one of your appointees. No leak yet, but it exists.`,
        reliability: 70,
      });
    }
    if (subject.kindLabel === "megacity" || subject.kindLabel === "nation") {
      possibles.push({
        content: `${subject.name}'s diplomatic corps drafted a contingency response in case your alliance with them falters.`,
        reliability: 65,
      });
    }
    if (possibles.length === 0) {
      possibles.push({
        content: `${subject.name} runs quietly this cycle. Routine patrols, routine trade. Nothing screams.`,
        reliability: 50,
      });
    }

    const choice = pick(possibles)!;
    out.push({
      id: id("intel"),
      source: sourceName,
      sourceId,
      kind: "rumor",
      subjectId: subject.id,
      subjectName: subject.name,
      content: choice.content,
      acquiredTick: tick,
      expiresTick: tick + INTEL_TTL_TICKS,
      reliability: choice.reliability,
      acted: false,
    });
  }
  return out;
}

export function generateCounterIntel(
  state: GameState,
  sourceId: string,
  sourceName: string,
): IntelItem[] {
  const tick = state.totalTicks;
  const partners = collectPartners(state).filter((p) => p.id !== sourceId);
  const hostile = partners.filter((p) => !isPlayerControlled(p) && (p.threat > 50 || (state.partnerLedgers?.[p.id]?.grudges ?? 0) > 25));
  const out: IntelItem[] = [];

  if (hostile.length === 0) {
    out.push({
      id: id("ci"),
      source: `${sourceName} Counter-Intel`,
      sourceId,
      kind: "warning",
      content: `${sourceName} swept all known channels. No active operations against you detected this cycle. (Absence of evidence is not evidence of absence.)`,
      acquiredTick: tick,
      expiresTick: tick + INTEL_TTL_TICKS,
      reliability: 55,
      acted: true,
    });
    return out;
  }

  const target = pick(hostile)!;
  const ops: { content: string; reliability: number; kind: "warning" | "intel" }[] = [
    {
      content: `${sourceName} intercepted a coded burst from ${target.name}. They were planning to insert sleeper agents into your finance ministry. Plot disrupted.`,
      reliability: 80,
      kind: "warning",
    },
    {
      content: `${sourceName} identified two ${target.name} operatives shadowing your supply convoys. Both quietly removed from circulation. No body bags.`,
      reliability: 75,
      kind: "warning",
    },
    {
      content: `A ${target.name} forgery operation was attempting to mimic your seal on customs paperwork. ${sourceName} traced and destroyed the press.`,
      reliability: 78,
      kind: "warning",
    },
    {
      content: `${target.name} bribed a junior planner for district maps. ${sourceName} fed the planner doctored maps before the courier arrived.`,
      reliability: 70,
      kind: "intel",
    },
  ];
  const op = pick(ops)!;
  out.push({
    id: id("ci"),
    source: `${sourceName} Counter-Intel`,
    sourceId,
    kind: op.kind,
    subjectId: target.id,
    subjectName: target.name,
    content: op.content,
    acquiredTick: tick,
    expiresTick: tick + INTEL_TTL_TICKS,
    reliability: op.reliability,
    acted: false,
  });
  return out;
}

export function generateRequestedIntel(
  state: GameState,
  sourceId: string,
  sourceName: string,
): IntelItem[] {
  const tick = state.totalTicks;
  const partners = collectPartners(state).filter((p) => p.id !== sourceId);
  const target = pick(partners);
  if (!target) return [];

  const ledger = (state.partnerLedgers ?? {})[target.id];
  const isHostile = !isPlayerControlled(target) && (target.threat > 50 || (ledger?.grudges ?? 0) > 25);
  const isFriendly = target.loyalty > 60 || (ledger?.favors ?? 0) > 30;

  let content: string;
  let reliability = 75;
  if (isHostile) {
    content = `${sourceName} formally shares intelligence on ${target.name}: their last three high-value shipments moved on the Lower Ring at 0300. Strike windows are predictable.`;
    reliability = 85;
  } else if (isFriendly) {
    content = `${sourceName} confirms ${target.name}'s public posture matches their private one. They speak well of you in chambers. No daggers detected.`;
    reliability = 90;
  } else {
    content = `${sourceName} reports ${target.name} is internally divided. Their faction council split 4-3 on a recent vote concerning your administration. Influence opportunity exists.`;
    reliability = 70;
  }

  return [{
    id: id("req"),
    source: sourceName,
    sourceId,
    kind: "intel",
    subjectId: target.id,
    subjectName: target.name,
    content,
    acquiredTick: tick,
    expiresTick: tick + INTEL_TTL_TICKS,
    reliability,
    acted: false,
  }];
}

export function generatePassiveSpyIntel(
  state: GameState,
  sourceId: string,
  sourceName: string,
): IntelItem[] {
  if (Math.random() > 0.18) return [];
  return generateRumorIntel(state, sourceId, sourceName, 1);
}

export function pruneIntel(items: IntelItem[], currentTick: number): IntelItem[] {
  return items.filter((i) => i.expiresTick > currentTick).slice(0, INTEL_CAP);
}

export function appendIntel(state: GameState, newItems: IntelItem[]): GameState {
  if (newItems.length === 0) return state;
  const existing = state.intelItems ?? [];
  const combined = pruneIntel([...newItems, ...existing], state.totalTicks);
  return { ...state, intelItems: combined };
}

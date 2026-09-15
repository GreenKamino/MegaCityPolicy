import type { DiplomaticHistoryEntry, GameState } from "@/engine/types";
import { pushNewsItem } from "@/engine/newsFeed";
import type { AggregateCustodyGroup } from "@/engine/custody";
import type { FactionRelation, WarCapture, WarState } from "@/engine/diplomacyAdvanced";

export type WarExchangeTarget = {
  id: string;
  name: string;
  factionId?: string | null;
  aggregateGroup?: Pick<AggregateCustodyGroup, "originKind" | "originId" | "sourceKind" | "sourceId">;
};

type ExchangeChannel = {
  id: string;
  name: string;
};

export type WarExchangeEligibility =
  | { ready: false; reason: string }
  | {
      ready: true;
      channel: ExchangeChannel;
      war: WarState;
      capture?: WarCapture;
    };

function exchangeFactionId(target: WarExchangeTarget): string | null {
  if (target.factionId) return target.factionId;
  const group = target.aggregateGroup;
  return group?.originKind === "faction" && group.originId ? group.originId : null;
}

function getExchangeChannel(state: GameState, factionId: string): ExchangeChannel | null {
  const faction = (state.factions ?? []).find((entry) => entry.id === factionId);
  if (faction) return faction.isActive ? { id: faction.id, name: faction.name } : null;

  const megacity = (state.externalMegacities ?? []).find((entry) => entry.id === factionId);
  if (megacity) return megacity.isActive ? { id: megacity.id, name: megacity.name } : null;

  const township = (state.townships ?? []).find((entry) => entry.id === factionId);
  if (township) {
    const available = township.status !== "undiscovered" && township.endState !== "fallen"
      && township.controlStatus !== "annexed" && township.controlStatus !== "occupied";
    return available ? { id: township.id, name: township.name } : null;
  }

  return null;
}

function activeWarsForChannel(state: GameState, factionId: string): WarState[] {
  return (state.diplomacyAdvanced?.wars ?? [])
    .filter((war) => war.belligerents.includes(factionId))
    .sort((a, b) => b.startTick - a.startTick);
}

export function getWarExchangeEligibility(
  state: GameState,
  target: WarExchangeTarget,
): WarExchangeEligibility {
  const factionId = exchangeFactionId(target);
  if (!factionId || factionId === "player") {
    return { ready: false, reason: "No valid belligerent faction channel is attached to this detainee." };
  }

  const channel = getExchangeChannel(state, factionId);
  if (!channel) {
    return { ready: false, reason: "The detainee's faction channel is inactive or unknown." };
  }

  const wars = activeWarsForChannel(state, factionId);
  if (wars.length === 0) {
    return { ready: false, reason: `${channel.name} is not an active belligerent in an advanced war.` };
  }

  const source = target.aggregateGroup;
  if (source?.sourceKind === "war") {
    if (!source.sourceId) {
      return { ready: false, reason: "This war-origin custody group has no valid capture record." };
    }
    const war = wars.find((entry) => {
      const capture = (entry.captures ?? []).find((candidate) => candidate.id === source.sourceId);
      return capture?.status === "held" || capture?.status === "isolated";
    });
    if (!war) {
      return { ready: false, reason: "The matching war capture is no longer available for exchange." };
    }
    return {
      ready: true,
      channel,
      war,
      capture: war.captures?.find((candidate) => candidate.id === source.sourceId),
    };
  }

  return { ready: true, channel, war: wars[0] };
}

function appendWarReport(war: WarState, tick: number, label: string): void {
  const timeline = war.timeline ?? {
    stages: [{ stage: war.stage, tick: war.startTick }],
    reports: [],
  };
  if (!timeline.reports.some((report) => report.tick === tick && report.label === label)) {
    timeline.reports = [...timeline.reports, { tick, label }].slice(-8);
  }
  war.timeline = timeline;
}

function updateRelation(state: GameState, factionId: string, factionName: string): void {
  const advanced = state.diplomacyAdvanced;
  if (!advanced) return;
  advanced.factionRelations ??= [];
  const event = `Prisoner exchange completed with ${factionName}.`;
  const existing = advanced.factionRelations.find(
    (relation) =>
      (relation.factionA === "player" && relation.factionB === factionId)
      || (relation.factionA === factionId && relation.factionB === "player"),
  );

  if (existing) {
    existing.disposition = Math.max(0, Math.min(100, existing.disposition + 6));
    existing.trend = existing.disposition > 60 ? "improving" : existing.disposition < 35 ? "deteriorating" : "stable";
    existing.lastEventTick = state.totalTicks;
    existing.events = [...existing.events.filter((entry) => entry !== event), event].slice(-10);
    return;
  }

  const relation: FactionRelation = {
    factionA: "player",
    factionB: factionId,
    disposition: 56,
    trend: "improving",
    lastEventTick: state.totalTicks,
    events: [event],
  };
  advanced.factionRelations.push(relation);
}

function updateChannelStanding(state: GameState, factionId: string): void {
  const adjust = <T extends { id: string; loyalty: number; threat: number }>(entries: T[]): T[] =>
    entries.map((entry) =>
      entry.id === factionId
        ? {
            ...entry,
            loyalty: Math.min(100, entry.loyalty + 1),
            threat: Math.max(0, entry.threat - 1),
          }
        : entry,
    );

  state.factions = adjust(state.factions ?? []);
  state.externalMegacities = adjust(state.externalMegacities ?? []);
  state.townships = adjust(state.townships ?? []);
}

export function resolveAdvancedWarExchange(
  state: GameState,
  target: WarExchangeTarget,
): { ok: true; outcome: string } | { ok: false; reason: string } {
  const operationId = `custody-exchange:${target.id}`;
  const custody = state.custody;
  if (custody?.incarceration?.processedOperations?.includes(operationId)) {
    return { ok: false, reason: "This detainee exchange has already been processed." };
  }

  const eligibility = getWarExchangeEligibility(state, target);
  if (!eligibility.ready) return { ok: false, reason: eligibility.reason };

  const { channel, war, capture } = eligibility;
  if (capture) {
    capture.status = "exchanged";
  }
  const report = `Prisoner exchange completed with ${channel.name}; custody transferred through the ${war.belligerentNames[0]}–${war.belligerentNames[1]} war channel.`;
  appendWarReport(war, state.totalTicks, report);

  updateChannelStanding(state, channel.id);
  updateRelation(state, channel.id, channel.name);
  state.diplomaticReputation = Math.max(0, Math.min(100, (state.diplomaticReputation ?? 50) + 2));
  const completed = { ...(state.completedDiplomaticActions ?? {}) };
  completed[channel.id] = [...(completed[channel.id] ?? [])];
  if (!completed[channel.id].includes("hostage-exchange")) {
    completed[channel.id].push("hostage-exchange");
  }
  state.completedDiplomaticActions = completed;
  state.diplomacyCooldowns = {
    ...(state.diplomacyCooldowns ?? {}),
    [`${channel.id}::hostage-exchange`]: state.totalTicks,
  };

  const historyEntry: DiplomaticHistoryEntry = {
    id: operationId,
    tick: state.totalTicks,
    factionId: channel.id,
    factionName: channel.name,
    action: "hostage-exchange",
    outcome: "accepted",
    reputationChange: 2,
  };
  if (!(state.diplomaticHistory ?? []).some((entry) => entry.id === operationId)) {
    state.diplomaticHistory = [historyEntry, ...(state.diplomaticHistory ?? [])].slice(0, 100);
  }

  custody?.incarceration.processedOperations.unshift(operationId);
  if (custody) {
    custody.incarceration.processedOperations = [...new Set(custody.incarceration.processedOperations)].slice(0, 300);
  }
  state.newsFeed = pushNewsItem(state.newsFeed, {
    id: `news-hostage-exchange-${operationId}`,
    headline: `DIPLOMACY DESK: PRISONER EXCHANGE COMPLETED WITH ${channel.name.toUpperCase()} — WAR CUSTODY FILE CLOSED — CHANNELS REMAIN OPEN`,
    tick: state.totalTicks,
  });

  return { ok: true, outcome: `${target.name} exchanged through the active ${channel.name} war channel.` };
}
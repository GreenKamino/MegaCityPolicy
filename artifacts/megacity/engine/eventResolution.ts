import { applyResponseEffects } from "@/engine/events";
import { resolveBiosphereEvent } from "@/engine/wildlandsEcology";
import { applyNpcWarIntervention } from "@/engine/partnerDynamics";
import { advanceEventChain } from "@/engine/eventChains";
import { getFreeChoirTransitMultiplier } from "@/engine/faiths";
import { pushNewsItem, eventResolvedNews, plotFoiledNews } from "@/engine/newsFeed";
import { gameTimestamp } from "@/engine/gameTimestamp";
import { ARRAY_CAPS } from "@/engine/sanitizer";
import { PLOT_TYPE_LABEL, resolveIntriguePlotResponse } from "@/engine/intrigue";
import {
  DISMISS_RECURRENCE_HINT_ID_PREFIX,
  getRecurrenceHintPhrase,
} from "@/engine/recurringEvents";
import { applyFactionDemandResponse } from "@/engine/factionDemands";
import { applyCoerciveBacklash } from "@/engine/coerciveBacklash";
import type { EventResponse, GameEvent, GameState } from "@/engine/types";
import { activateLabourDayBooster } from "@/engine/labourDay";

// Pure reducers for every way a player can clear an event. Extracted from
// GameContext's inline setState callbacks so the biome-resolution wiring can be
// unit-tested against the real code without mounting the provider.
//
// The invariant these three functions must uphold: whenever the cleared event is
// a biosphere/ecology crisis (event.biome set), the originating biome MUST be
// rebalanced and given a post-resolution calm window via resolveBiosphereEvent.
// Biosphere crises are driven by persistent biome populations that
// applyResponseEffects never touches, so skipping this leaves the biome out of
// balance and a sibling crisis re-fires ~80 ticks later. Every full-clear path
// routes its final step through the shared clearEventAndHealBiome tail below, so
// the invariant is structural, not merely convention: a new clearing path
// inherits the healing simply by calling it. A guard test
// (eventClearingHealsBiome.test.ts) still exercises all three paths as a
// backstop so a refactor cannot quietly drop the healing again.
//
// This module lives on its own (importing events + wildlandsEcology and a few
// engine helpers) on purpose: wildlandsEcology already imports from events, so
// putting these here instead of in events.ts avoids an events <-> wildlandsEcology
// cycle. Nothing imports this module back, so no cycle is introduced.

// Shared clear-and-heal tail for every path that fully resolves an event. This
// is the one place the biome-healing invariant lives: if the cleared event is a
// biosphere/ecology crisis (event.biome set), its originating biome is ALWAYS
// rebalanced and given a calm window via resolveBiosphereEvent before the event
// leaves activeEvents. Routing every full-clear path through here makes that
// guarantee structural — a future fourth clearing path only has to call this to
// inherit it, and cannot silently skip the healing.
//
// resolveBiosphereEvent copy-on-writes state.wildlandsEcology, so we shallow-
// clone `state` first (only when there is a biome to heal) to keep any
// caller-shared `prev` untouched — matching the copy-on-write contract each
// caller relied on before.
// Task #562: accepting or countering a ceasefire must actually cool the
// conflict, or the war-event generator (which fires while the instigating
// faction's threat stays >= 70) keeps proposing ceasefires the player already
// accepted. The threat drop is deterministic and modest: enough to fall below
// the hostile threshold so the war winds down, but the faction can re-escalate
// later through the normal threat drivers. Rejecting or stalling leaves the
// conflict hot on purpose.
const CEASEFIRE_EVENT_ID = "war_ceasefire_offer";
const CEASEFIRE_RESOLVING_RESPONSE_IDS = new Set(["ceasefire_accept", "ceasefire_counter"]);

// Task #564: the threat drop above is invisible on its own — the player who
// accepts terms sees only the generic response-effects line and gets no
// confirmation the enemy actually stood down. Whenever the diplomacy applies
// (accept/counter with a resolvable instigator), prepend ONE inbox message
// with this stable id prefix; useNewsHeadlines echoes it onto the scrolling
// ticker exactly once via a seen-id gate (the UI never re-detects the threat
// transition itself). Reject/stall emit nothing — the conflict stays hot on
// purpose, so there is no wind-down to announce.
export const CEASEFIRE_HOLDS_ID_PREFIX = "ceasefire_holds_";

// War events spawned since Task #562 carry event.factionId. Legacy saves hold
// war events from before the stamp, where the instigator only survives in the
// description prefix "[NAME CONFLICT] ..." — parse it as a fallback so a
// pending proposal in an old save still cools the right faction.
function resolveWarEventFactionId(state: GameState, event: GameEvent): string | null {
  if (event.factionId && state.factions.some((f) => f.id === event.factionId)) {
    return event.factionId;
  }
  const m = /^\[(.+?) CONFLICT\]/.exec(event.description ?? "");
  if (!m) return null;
  const name = m[1];
  const match = state.factions.find((f) => (f.name ?? "").toUpperCase() === name);
  return match ? match.id : null;
}

function applyCeasefireDiplomacy(
  state: GameState,
  event: GameEvent | undefined,
  responseIds: string[],
): GameState {
  if (
    !event ||
    event.id !== CEASEFIRE_EVENT_ID ||
    !responseIds.some((r) => CEASEFIRE_RESOLVING_RESPONSE_IDS.has(r))
  ) {
    return state;
  }
  const factionId = resolveWarEventFactionId(state, event);
  if (!factionId) return state;
  const faction = state.factions.find((f) => f.id === factionId);
  const tick = state.totalTicks ?? 0;
  const { [factionId]: _endedConflictOccurrences, ...remainingWarEventOccurrences } =
    state.warEventOccurrences ?? {};
  return {
    ...state,
    factions: state.factions.map((f) =>
      f.id === factionId
        ? { ...f, threat: Math.max(0, Math.min((f.threat ?? 0) - 15, 65)) }
        : f,
    ),
    // A resolving ceasefire always lowers this faction below the hostile
    // threshold. Its next escalation is a new conflict, so discard only this
    // faction's consumed war-event limits; simultaneous wars keep theirs.
    ...(state.warEventOccurrences
      ? { warEventOccurrences: remainingWarEventOccurrences }
      : {}),
    // Task #564: make the wind-down visible. Prepend (not append) so the
    // confirmation lands at the TOP of the inbox, like every other ticker
    // cue, and cap with slice(0, N) to bound growth. The body reads as one
    // ticker-ready sentence — useNewsHeadlines scrolls it verbatim (upper-
    // cased) under the WAR DESK tag via the stable id prefix.
    messages: [
      {
        id: `${CEASEFIRE_HOLDS_ID_PREFIX}${factionId}-${tick}`,
        timestamp: gameTimestamp(state),
        tick,
        category: "world-news" as const,
        title: "CEASEFIRE HOLDS",
        body: `Ceasefire holds — ${faction?.name ?? "enemy"} forces are standing down. The conflict is winding down and hostile activity should taper off.`,
        read: false,
        priority: "normal" as const,
      },
      ...(state.messages ?? []),
    ].slice(0, ARRAY_CAPS.messages),
  };
}

function clearEventAndHealBiome(
  state: GameState,
  event: GameEvent | undefined,
  eventId: string,
  responseIds: string[] = [],
): GameState {
  // Task #452: stamp the cleared event's id into eventTriggerCooldowns so
  // deterministic stat-triggered crises (e.g. biosphere_ecosystem_collapse
  // while biosphere <= 15) cannot re-fire on the VERY NEXT tick after the
  // player dismisses/resolves them. processBiosphere's recent-id lockout only
  // reads eventHistory, which none of the player clearing paths write — so
  // without this stamp a turn-based player gets stuck in a resolve → END TURN
  // → 1-tick interrupt loop until the underlying stat recovers. The stamp is
  // tick-based (readers compare against totalTicks), so a stat that stays
  // critical still re-raises the crisis once its cooldown elapses — it is a
  // breather, not a permanent silence. One-time events use the same durable
  // stamp as their completion marker, while other cooldown readers benefit too:
  // condition triggers re-apply their own cooldownTicks and wildlands ecology
  // its MIN_EVENT_GAP after a player clear.
  let next = event
    ? {
        ...state,
        eventTriggerCooldowns: {
          ...(state.eventTriggerCooldowns ?? {}),
          [event.id]: state.totalTicks ?? 0,
        },
      }
    : state;
  if (event?.biome) {
    resolveBiosphereEvent(next, event.biome, event.id);
  }
  // Intrigue (Task #379): if this event belongs to a plot, apply the chosen
  // response's intrigue outcome (reduce plot progress, cool the instigator's
  // radicalization, clear the plot). applyResponseEffects only understands the
  // 13 stat keys and cannot touch IntrigueState, so — exactly like the biome
  // invariant above — routing this through the shared tail makes plot cleanup
  // structural: any full-clear path inherits it by calling clearEventAndHealBiome.
  if (event?.plotId && next.intrigue) {
    next = resolveIntrigueForClear(next, event.plotId, responseIds);
  }
  // Task #562: ceasefire accept/counter lowers the instigating faction's
  // threat below the hostile threshold so the war-event generator stops
  // proposing ceasefires for a conflict the player already ended.
  next = applyCeasefireDiplomacy(next, event, responseIds);
  return {
    ...next,
    activeEvents: next.activeEvents.filter((e) => e.id !== eventId),
  };
}

// Applies the intrigue outcome(s) of clearing a plot-linked event. With
// responseIds, each response's outcome is applied (progress/radicalization
// adjustments and, for the instigator faction, a threat delta that lives outside
// IntrigueState). With no responseIds (a dismissal), a matured plot — whose
// crisis has already fired — is treated as spent and removed, while an ignored
// warning is left to keep escalating.
function resolveIntrigueForClear(
  state: GameState,
  plotId: string,
  responseIds: string[],
): GameState {
  let intrigue = state.intrigue!;
  let factions = state.factions;
  let factionsChanged = false;

  const applyThreat = (factionId: string | null, delta: number) => {
    if (!factionId || delta === 0) return;
    factions = factions.map((f) =>
      f.id === factionId
        ? { ...f, threat: Math.max(0, Math.min(100, (f.threat ?? 0) + delta)) }
        : f,
    );
    factionsChanged = true;
  };

  const plotBefore = intrigue.plots.find((p) => p.id === plotId);

  if (responseIds.length === 0) {
    if (plotBefore?.matured) {
      intrigue = { ...intrigue, plots: intrigue.plots.filter((p) => p.id !== plotId) };
    }
  } else {
    for (const rid of responseIds) {
      const res = resolveIntriguePlotResponse(intrigue, plotId, rid);
      intrigue = res.intrigue;
      applyThreat(res.instigatorFactionId, res.threatDelta);
    }
  }

  // Task #493: a plot the player dismantled BEFORE it matured is a foiled
  // plot — public headline material (the player already knew about it via the
  // warning event, so nothing secret leaks). Matured plots already made news
  // when their crisis struck, so their cleanup stays quiet here.
  let newsFeed = state.newsFeed;
  const plotRemoved = plotBefore && !intrigue.plots.some((p) => p.id === plotId);
  if (plotBefore && plotRemoved && !plotBefore.matured && responseIds.length > 0) {
    newsFeed = pushNewsItem(
      newsFeed,
      plotFoiledNews(state, plotId, plotBefore.instigatorName, PLOT_TYPE_LABEL[plotBefore.type]),
    );
  }

  return {
    ...state,
    intrigue,
    ...(factionsChanged ? { factions } : {}),
    ...(newsFeed !== state.newsFeed ? { newsFeed } : {}),
  };
}

// Single-response path (GameContext.respondToEvent). `prev` is never mutated:
// applyResponseEffects deep-clones, and the chain/npc-war branches build fresh
// objects before returning.
export function applyEventResponse(
  prev: GameState,
  eventId: string,
  response: EventResponse,
): GameState {
  const event = prev.activeEvents.find((e) => e.id === eventId);
  // Task #562: hard idempotency guard. If the event is no longer active —
  // already resolved, dismissed, expired, or a stale duplicate card from a
  // pre-fix save — applying effects again would let the player farm the same
  // choice repeatedly (the infinite ceasefire-Accept exploit). No effects, no
  // news, no cooldown stamp: the tap is simply a no-op.
  if (!event) return prev;
  // Task #480: reactive news — record the commander's chosen orders on the
  // ticker feed at the moment of resolution. Applied to every branch's return
  // value so chain stages, war interventions, and plain resolutions all
  // surface. No-op when the event is already gone or the response is unnamed.
  const withNews = (s: GameState): GameState =>
    event?.title && response.label
      ? { ...s, newsFeed: pushNewsItem(s.newsFeed, eventResolvedNews(s, eventId, event.title, response.label)) }
      : s;
  const applyResponseBacklash = (s: GameState): GameState =>
    applyCoerciveBacklash(s, {
      actionId: response.id,
      actionKey: `event:${eventId}:${response.id}`,
      targetId: event.factionId ?? event.effects?.districtId,
      targetName: event.title,
      scope: event.effects?.districtId || event.factionId ? "targeted" : "citywide",
      audience: event.effects?.districtId ? "district" : event.factionId ? "internal" : "population",
      label: response.label,
      messageCap: ARRAY_CAPS.messages,
    });
  // Special-case: NPC-vs-NPC war intervention applies diplomatic ripples
  // before standard stat-based effects.
  if (response.id.startsWith("npc-war-int:")) {
    const afterDiplomacy = applyNpcWarIntervention(prev, response.id);
    const updated = applyResponseEffects(afterDiplomacy, response, {
      incidentId: `event:${eventId}:response:${response.id}`,
      reason: `Response "${response.label}" to "${event.title}"`,
    });
    return withNews(clearEventAndHealBiome(updated, event, eventId, [response.id]));
  }
  if (event?.chainId) {
    const s = {
      ...prev,
      resources: { ...prev.resources },
      cityStats: { ...prev.cityStats },
      demographics: { ...prev.demographics },
      activeEvents: [...prev.activeEvents.filter((e) => e.id !== eventId)],
      activeEventChains: (prev.activeEventChains ?? []).map((c) => ({ ...c, choicesMade: [...c.choicesMade] })),
      messages: [...(prev.messages ?? [])],
    };
    const nextEvent = advanceEventChain(s, event.chainId, response.id);
    if (nextEvent && nextEvent.id) {
      s.activeEvents = [...s.activeEvents, nextEvent];
    }
    return withNews(applyResponseBacklash(s));
  }
  const updated = applyFactionDemandResponse(
    applyResponseEffects(prev, response, {
      incidentId: `event:${eventId}:response:${response.id}`,
      reason: `Response "${response.label}" to "${event.title}"`,
    }),
    event,
    response,
  );
  const boosted = response.labourBoosterId
    ? activateLabourDayBooster(updated, response.labourBoosterId)
    : updated;
  // Task #219: trade_caravan_arrives is the non-chain sibling of the
  // transit-themed chains. Its response.effects are already scaled by the
  // Free Choir multiplier at generation time, so post a one-line ticker
  // cue so the modifier is visible on resolution the same way it shows
  // up on EventCard at decision time.
  let messages = boosted.messages;
  if (event?.id === "trade_caravan_arrives") {
    const mult = getFreeChoirTransitMultiplier(boosted);
    if (mult !== 1) {
      const incomeKeys = ["credits", "tradeIncome", "food"] as const;
      const labels: Record<typeof incomeKeys[number], string> = {
        credits: "credits",
        tradeIncome: "trade",
        food: "food",
      };
      const e = response.effects as Record<string, number | undefined>;
      const parts: string[] = [];
      for (const k of incomeKeys) {
        const v = e[k];
        if (typeof v !== "number" || v === 0) continue;
        const sign = v > 0 ? "+" : "";
        parts.push(`${labels[k]} ${sign}${Math.round(v)}`);
      }
      if (parts.length > 0) {
        const pct = Math.round((mult - 1) * 100);
        const swing = pct >= 0 ? `+${pct}%` : `${pct}%`;
        // Prepend (not append) so the ticker cue lands at the TOP of the
        // inbox where the player will see it — the inbox renders messages
        // in array order with no sort, and every other call site in the
        // codebase prepends. Cap with slice(0, N) to bound growth while
        // keeping the new entry.
        messages = [{
          id: `caravan_choir_ticker_${response.id}_${boosted.totalTicks}`,
          timestamp: gameTimestamp(boosted),
          tick: boosted.totalTicks,
          category: "world-news" as const,
          title: "TRADE CARAVAN RESOLVED",
          body: `${parts.join(" · ")} — Free Choir ${swing}`,
          read: false,
          priority: "low" as const,
        }, ...(updated.messages ?? [])].slice(0, ARRAY_CAPS.messages);
      }
    }
  }
  // Route the final clear through the shared tail so the biome-healing invariant
  // holds here too. updated is a deep clone from applyResponseEffects, so the
  // shallow copy inside the helper is safe.
  return withNews(clearEventAndHealBiome(applyResponseBacklash({ ...boosted, messages }), event, eventId, [response.id]));
}

// Dismiss/ignore path (GameContext.dismissEvent). A dismissed biosphere crisis
// otherwise leaves the biome that spawned it out of balance, so a sibling crisis
// re-fires ~80 ticks later. Delegating to clearEventAndHealBiome applies the
// same rebalance + calm window applyEventResponse does, so dismissing actually
// resolves it.
export function applyEventDismissal(prev: GameState, eventId: string): GameState {
  const event = prev.activeEvents.find((e) => e.id === eventId);
  // Task #562: same idempotency guard as the response paths — dismissing an
  // event that is no longer active must not stamp cooldowns or emit hints.
  if (!event) return prev;
  const cleared = clearEventAndHealBiome(prev, event, eventId);
  // Task #456: dismissing a RECURRING stat-triggered crisis only silences it
  // for its re-trigger cooldown (Task #452/#455) — it re-fires while the
  // underlying condition stays critical. Without a cue, the warning "randomly"
  // comes back and the temporary nature of the dismissal is invisible. Post a
  // brief low-priority inbox note (prepended, like every other ticker cue) so
  // the player learns the dismissal is a breather, not a fix; useNewsHeadlines
  // echoes it onto the scrolling news ticker once via the stable id prefix.
  // One-off events (no entry in RECURRING_EVENT_DEFS) and recurring events
  // whose condition has already recovered emit nothing — for them, dismissal
  // genuinely ends the matter. Response paths are untouched: responding is an
  // action, not a snooze, so no hint belongs there.
  if (!event) return cleared;
  const phrase = getRecurrenceHintPhrase(cleared, event);
  if (!phrase) return cleared;
  const tick = cleared.totalTicks ?? 0;
  return {
    ...cleared,
    messages: [
      {
        id: `${DISMISS_RECURRENCE_HINT_ID_PREFIX}${event.id}-${tick}`,
        timestamp: gameTimestamp(cleared),
        tick,
        category: "alert" as const,
        title: "WARNING SUPPRESSED, NOT RESOLVED",
        body: `${event.title} dismissed. This warning will return while ${phrase}.`,
        read: false,
        priority: "low" as const,
      },
      ...(cleared.messages ?? []),
    ].slice(0, ARRAY_CAPS.messages),
  };
}

// Multi-choice path (GameContext.respondToEventMulti). Applies each response's
// effects in order, then routes the final clear through clearEventAndHealBiome
// so a biosphere crisis's biome is rebalanced exactly like the other paths.
//
// `prev` is never mutated: each applyResponseEffects deep-clones, and when
// `responses` is empty (so `s` is still `prev`) the shared tail shallow-clones
// before the copy-on-write resolveBiosphereEvent.
export function applyEventMultiResponses(
  prev: GameState,
  eventId: string,
  responses: EventResponse[],
): GameState {
  const event = prev.activeEvents.find((e) => e.id === eventId);
  // Task #562: same idempotency guard as the single-response path — a stale
  // card for an already-cleared event must not re-apply effects.
  if (!event) return prev;
  let s = prev;
  for (const r of responses) {
    s = applyResponseEffects(s, r, {
      incidentId: `event:${eventId}:response:${r.id}`,
      reason: `Response "${r.label}" to "${event.title}"`,
    });
  }
  const booster = responses.find((response) => response.labourBoosterId)?.labourBoosterId;
  if (booster) s = activateLabourDayBooster(s, booster);
  const cleared = clearEventAndHealBiome(s, event, eventId, responses.map((r) => r.id));
  // Match the single-response path: one resolution fact follows the source
  // event. Multi-choice cards report every selected directive in selection
  // order, rather than silently omitting news or emitting one item per button.
  const responseLabels = responses
    .map((response) => response.label)
    .filter((label) => Boolean(label))
    .join(" + ");
  return event.title && responseLabels
    ? {
        ...cleared,
        newsFeed: pushNewsItem(
          cleared.newsFeed,
          eventResolvedNews(cleared, eventId, event.title, responseLabels),
        ),
      }
    : cleared;
}

import type { GameMessage, GameState } from "./types";
import { normalizePartnerRelationshipScores, type PartnerEntity } from "./partnerDynamics";

export type CoerciveBacklashSeverity = "minor" | "moderate" | "major" | "crisis";

export type CoerciveBacklashInput = {
  actionId: string;
  actionKey: string;
  targetId?: string;
  targetName?: string;
  /** `targeted` affects one audience; `citywide` affects the whole city. */
  scope: "targeted" | "citywide";
  /** Internal factions are domestic power blocs; external targets are foreign entities. */
  audience?: "internal" | "external" | "district" | "population" | "cohort";
  severity?: CoerciveBacklashSeverity;
  label?: string;
  messageCap?: number;
};

export type CoerciveBacklashPreview = {
  severity: CoerciveBacklashSeverity;
  happinessDelta: number;
  unrestDelta: number;
  diplomaticReputationDelta: number;
  targetLoyaltyDelta?: number;
  targetThreatDelta?: number;
  otherFactionLoyaltyDelta: number;
  otherFactionThreatDelta: number;
  districtCrimeDelta: number;
  unrelatedExternalLoyaltyDelta: number;
  unrelatedExternalThreatDelta: number;
};

const SEVERITY_SCORE: Record<CoerciveBacklashSeverity, number> = {
  minor: 1,
  moderate: 2,
  major: 4,
  crisis: 6,
};

const EXPLICIT_COERCIVE_ACTIONS = new Set([
  "declare-war",
  "issue-ultimatum",
  "impose-blockade",
  "trade-embargo",
  "demand-tribute",
  "protection-racket",
  "proxy-war",
  "covert-destabilize",
  "cultural-subversion",
  "infrastructure-raid",
  "cyber-attack",
  "false-flag",
  "impose-sanctions",
  "rocket-strike",
  "bombardment",
  "lay-siege",
  "occupy",
  "annex",
  "plague-swarm",
  "seize-assets",
  "plant-informant",
  "recruit",
  "interrogate",
  "isolate",
  "spread-rumors",
  "arrange-accident",
  "suppress",
  "arrest-leaders",
  "purge",
  "threaten",
  "bind-by-debt",
  "public-humiliation",
  "surveillance-sweep",
  "collective-punishment",
  "compulsory-civic-service",
  "weaponize-scarcity",
  "stage-public-tribunals",
  "population-transfer-orders",
  "ration-enforcement",
  "detention-crackdown",
  "district-pressure",
  "district-surveil",
  "zeroTolerancePatrols",
  "gangSuppressionOps",
  "enhancedSurveillance",
  "mandatorySentencing",
  "militaryDraft",
  "martialMedicalAuth",
  "emergencyCreditFreeze",
  "mandatoryWorship",
  "collectivePunishment",
  "forcedLabourCamps",
  "purgeWeek",
  "mandatoryJournalingProgram",
  "martialLaw",
  "surveillanceActive",
  "curfewEnabled",
  "propaganda",
  "mutantPolicy:purge",
  "troop_assault",
  "missile_strike",
  "full_assault",
  "special_ops",
  "air_strike",
  "artillery_barrage",
  "siege_bombardment",
  "indiscriminate",
]);

const PEACEFUL_OR_REVERSING_ACTION = /^(?:lift|relax|release|amnesty|reform|rights|aid|relief|medical|rebuild|negotiate|tolerate|pardon|reassure|fund|grant|open|trade|alliance|charter|treaty|exchange|concession|recognition|sanctuary|non-aggression|ceasefire)/i;
const COERCIVE_RESPONSE_HINT = /(?:suppress|arrest|purge|martial|lethal|censor|detain|mass[-_ ]?arrest|weaponize|crackdown|militarize|punish|compulsory|surveil|ban[-_ ]?and[-_ ]?arrest|force[-_ ]?labor)/i;

export function isCoerciveActionId(actionId: string): boolean {
  if (!actionId || PEACEFUL_OR_REVERSING_ACTION.test(actionId)) return false;
  return EXPLICIT_COERCIVE_ACTIONS.has(actionId) || COERCIVE_RESPONSE_HINT.test(actionId);
}

export function coerciveBacklashSeverity(actionId: string): CoerciveBacklashSeverity {
  if (/^(?:bombardment|plague-swarm|annex|purge|forcedLabourCamps|purgeWeek|missile_strike|full_assault|indiscriminate)$/.test(actionId)) return "crisis";
  if (/^(?:rocket-strike|lay-siege|occupy|declare-war|collective-punishment|weaponize-scarcity|stage-public-tribunals|population-transfer-orders|martialLaw|mass|lethal|arrest|suppress|troop_assault|special_ops|air_strike|artillery_barrage|siege_bombardment)/i.test(actionId)) return "major";
  if (/^(?:impose-blockade|proxy-war|infrastructure-raid|false-flag|covert-destabilize|arrange-accident|militaryDraft|gangSuppressionOps|seize-assets)/.test(actionId)) return "moderate";
  return "minor";
}

/**
 * Player-facing consequence preview derived from the same severity table used
 * by applyCoerciveBacklash. Keeping this pure prevents confirmation copy from
 * drifting away from the political cost that will actually be committed.
 */
export function getCoerciveBacklashPreview(
  actionId: string,
  scope: CoerciveBacklashInput["scope"],
  audience?: CoerciveBacklashInput["audience"],
  severityOverride?: CoerciveBacklashSeverity,
): CoerciveBacklashPreview | null {
  if (!isCoerciveActionId(actionId)) return null;
  const severity = severityOverride ?? coerciveBacklashSeverity(actionId);
  const score = SEVERITY_SCORE[severity];
  const citywide = scope === "citywide";
  const targetedRelationship = audience === "internal" || audience === "external";
  return {
    severity,
    happinessDelta: -(citywide ? score : Math.max(1, Math.round(score * 0.6))),
    unrestDelta: citywide ? score * 2 : score,
    diplomaticReputationDelta: -(citywide ? score : Math.max(1, Math.round(score * 0.5))),
    targetLoyaltyDelta: targetedRelationship ? -(score * (severity === "crisis" ? 4 : 3)) : undefined,
    targetThreatDelta: targetedRelationship ? score * (severity === "crisis" ? 3 : 2) : undefined,
    otherFactionLoyaltyDelta: -(citywide ? score : Math.max(1, Math.round(score * 0.5))),
    otherFactionThreatDelta: citywide ? Math.max(1, score) : Math.max(1, Math.round(score * 0.5)),
    districtCrimeDelta: Math.max(1, Math.round(score * 0.5)),
    unrelatedExternalLoyaltyDelta: severity === "crisis" ? -1 : 0,
    unrelatedExternalThreatDelta: severity === "crisis" ? 1 : 0,
  };
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function appendMessage(state: GameState, message: GameMessage, cap: number): GameState {
  return { ...state, messages: [message, ...(state.messages ?? [])].slice(0, cap) };
}

/**
 * Apply the durable social and diplomatic cost of a coercive act.
 *
 * The action key is supplied by the caller and must be created once per
 * successful action. Keeping it in state makes this transition idempotent
 * across React updater replays, duplicate taps, save/load, and offline replay.
 */
export function applyCoerciveBacklash(
  prev: GameState,
  input: CoerciveBacklashInput,
): GameState {
  if (!isCoerciveActionId(input.actionId)) return prev;
  const appliedKeys = Array.isArray(prev.coerciveBacklashLog) ? prev.coerciveBacklashLog : [];
  if (appliedKeys.includes(input.actionKey)) return prev;

  const preview = getCoerciveBacklashPreview(
    input.actionId,
    input.scope,
    input.audience,
    input.severity,
  )!;
  const severity = preview.severity;
  const happinessDrop = -preview.happinessDelta;
  const unrestRise = preview.unrestDelta;
  const factionLoyaltyDrop = -preview.otherFactionLoyaltyDelta;
  const factionThreatRise = preview.otherFactionThreatDelta;
  const externalTargetLoyaltyDrop = -(preview.targetLoyaltyDelta ?? 0);
  const externalTargetThreatRise = preview.targetThreatDelta ?? 0;

  const targetIsInternalFaction = input.audience === "internal" && !!input.targetId;
  const factions = (prev.factions ?? []).map((f) => {
    const isTarget = targetIsInternalFaction && f.id === input.targetId;
    return {
      ...f,
      loyalty: clamp((f.loyalty ?? 50) - (isTarget ? externalTargetLoyaltyDrop : factionLoyaltyDrop)),
      threat: clamp((f.threat ?? 30) + (isTarget ? externalTargetThreatRise : factionThreatRise)),
    };
  });

  const isExternalTarget = input.audience === "external" && !!input.targetId;
  const updateExternal = <T extends PartnerEntity>(entity: T): T => {
    const normalized = normalizePartnerRelationshipScores(entity);
    if (entity.id === input.targetId && isExternalTarget) {
      return normalizePartnerRelationshipScores({
        ...normalized,
        loyalty: clamp(normalized.loyalty - externalTargetLoyaltyDrop),
        threat: clamp(normalized.threat + externalTargetThreatRise),
      });
    }
    // A major public abuse damages the wider diplomatic reputation, but does
    // not punish unrelated partners for ordinary targeted pressure.
    return preview.unrelatedExternalLoyaltyDelta !== 0 || preview.unrelatedExternalThreatDelta !== 0
      ? normalizePartnerRelationshipScores({
        ...normalized,
          loyalty: clamp(normalized.loyalty + preview.unrelatedExternalLoyaltyDelta),
          threat: clamp(normalized.threat + preview.unrelatedExternalThreatDelta),
      })
      : normalized;
  };

  const nextState: GameState = {
    ...prev,
    coerciveBacklashLog: [...appliedKeys, input.actionKey].slice(-200),
    cityStats: {
      ...prev.cityStats,
      happiness: clamp((prev.cityStats.happiness ?? 0) - happinessDrop),
      unrest: clamp((prev.cityStats.unrest ?? 0) + unrestRise),
    },
    factions,
    externalMegacities: (prev.externalMegacities ?? []).map(updateExternal),
    townships: (prev.townships ?? []).map(updateExternal),
    diplomaticReputation: clamp((prev.diplomaticReputation ?? 50) + preview.diplomaticReputationDelta),
  };

  if (input.audience === "district" && input.targetId) {
    nextState.districts = prev.districts.map((district) =>
      district.id === input.targetId
        ? {
            ...district,
            loyalty: clamp(district.loyalty - factionLoyaltyDrop),
            unrest: Math.min(200, Math.max(0, Math.round(district.unrest + unrestRise))),
            crime: Math.min(200, Math.max(0, Math.round(district.crime + preview.districtCrimeDelta))),
          }
        : district,
    );
  }

  const target = input.targetName ? ` against ${input.targetName}` : "";
  const label = input.label ?? input.actionId.replace(/[-_]/g, " ").toUpperCase();
  const domestic = `Happiness -${happinessDrop} · Unrest +${unrestRise}`;
  const foreign = isExternalTarget
    ? `\n${input.targetName ?? "Target"}: loyalty -${externalTargetLoyaltyDrop} · threat +${externalTargetThreatRise}`
    : "";
  const message: GameMessage = {
    id: `coercive-backlash-${input.actionKey}`,
    timestamp: prev.gameDate,
    tick: prev.totalTicks,
    category: "world-news",
    title: `BACKLASH: ${label}`,
    body: `The consequences of ${label.toLowerCase()}${target} are being felt across the city.\n\nDomestic response: ${domestic}.${foreign}\nInternal factions are reassessing their loyalty and threat posture. This cost is recorded once for this action.`,
    read: false,
    priority: severity === "crisis" ? "critical" : severity === "major" ? "high" : "normal",
  };
  return appendMessage(nextState, message, input.messageCap ?? 200);
}
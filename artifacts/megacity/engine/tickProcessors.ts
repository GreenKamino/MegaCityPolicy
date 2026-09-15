import { MILITARY_MISSIONS, MILITARY_RESEARCH, type ActiveMission } from "@/engine/militaryOverhaul";
import { createDefaultMilitaryState } from "@/engine/militaryOverhaul";
import { applyPersonnelCasualties } from "@/engine/militaryLogistics";
import { createDefaultPoliticsState, calculateApproval } from "@/engine/politicsData";
import { createDefaultInnerCircleState, generateWhispers, xpForLevel } from "@/engine/innerCircleData";
import type { GameEvent, GameState, GameMessage, TickEntry } from "@/engine/types";
import { processIndependentEnterprises, applyIndependentEnterpriseTax } from "@/engine/independentEnterprises";
import { processCorporateChains } from "@/engine/corporateChains";
import { processWorldEvents } from "@/engine/worldEvents";
import { negativeEventsAllowed } from "@/engine/calmStart";
import {
  pushNewsItem,
  megaProjectCompleteNews,
  coupLaunchedNews,
  terrorStrikeNews,
  assassinationAttemptNews,
  biosphereCrisisRiskRisingNews,
  goldenAgeRecoveryNews,
} from "@/engine/newsFeed";
import { BIOSPHERE_EVENT_POOL, ONE_TIME_EVENT_IDS } from "@/engine/events";
import { processStatHistory } from "@/engine/statHistory";
import { processEventChainDelays, checkEventChainTriggers, startEventChain, EVENT_CHAINS } from "@/engine/eventChains";
import {
  createDefaultIntrigueState,
  computeAlignment,
  computeLoyaltyDrift,
  computeRadicalizationDelta,
  computePlotProgressDelta,
  makePlot,
  buildIntrigueWarningEvent,
  buildTerrorEvent,
  buildAssassinationEvent,
  PLOT_THRESHOLD,
  PLOT_WARN_STAGES,
  PLOT_TYPE_LABEL,
  type IntrigueState,
  type IntriguePlot,
} from "@/engine/intrigue";
import { processAutoConstruction } from "@/engine/autoConstruction";
import { processAutoManagers } from "@/engine/autoManagers";
import { processAutoRecruit } from "@/engine/autoRecruit";
import { processAutoDomainManagers } from "@/engine/autoDomainManagers";
import { processAllNewSystems } from "@/engine/newSystems";
import { processDiplomacyTick } from "@/engine/diplomacyAdvanced";
import { processActiveOperations } from "@/engine/diplomacyEngine";
import { RESOURCE_NODE_DEFS, RESOURCE_NODE_LABELS, RICHNESS_MULT } from "@/engine/resourceNodes";
import { getNodeName } from "@/engine/displayNames";
import { applyZoneBonuses } from "@/engine/zoneControl";
import { processRetinueTick } from "@/engine/retinue";
import { processSecurityWingsTick } from "@/engine/securityWings";
import { processCustodyTick } from "@/engine/custody";
import { processScavengeExpeditions } from "@/engine/expeditionRewards";
import { processWildlandsProjects } from "@/engine/wildlandsProjects";
import { processTamingQueue } from "@/engine/megafaunaHunts";
import { processWildlandsEcology, getBiosphereCrisisRisk, type BiosphereCrisisRiskTier } from "@/engine/wildlandsEcology";
import {
  computeBiosphereBreakdown,
  NATURAL_BIOSPHERE_FLOOR,
  BIOSPHERE_OUTBREAK_EVENT_IDS,
} from "@/engine/biosphereBreakdown";
import { computePopulationDensityPressure } from "@/engine/populationDensity";
import { STAT_WIN_BANDS, computeStatBandRank, type StatBandRank, type StatWinKey } from "@/engine/statWinBands";
import {
  prosperityGateBlock,
  PROSPERITY_GATE_HINT_ID_PREFIX,
} from "@/engine/prosperityTriggers";
import {
  computePowerBreakdown,
  computePowerEta,
  POWER_BROWNOUT_WARN_TICKS,
} from "@/engine/powerBreakdown";
import { processFaithDrift } from "@/engine/faiths";
import { processFactionDemands } from "@/engine/factionDemands";
import { processEndStateCheck } from "@/engine/endState";
import { resolveMission } from "@/engine/companionMissions";
import { xpForBodyguardLevel, BODYGUARD_DEFS } from "@/engine/bodyguardData";
import { xpForLevel as playerXpForLevel } from "@/engine/profiles";
import { appendMissionResultMessage, processOfficerMissionTick } from "@/engine/officerMissions";
import { SPY_OPS } from "@/engine/spyOps";
import { MEGA_PROJECTS, type MegaProjectInstance } from "@/engine/megaProjects";
import { WAR_ROOM_OPS } from "@/engine/warRoomData";
import { ILLNESSES, type IllnessDef } from "@/engine/medical";
import { recordCreditsEarned } from "@/engine/creditTracking";
import { ARRAY_CAPS } from "@/engine/sanitizer";
import { processAdministrativeInstitutions } from "@/engine/administrativeInstitutions";
import { applyResourceDelta, summarizeMedicalStorageGain } from "@/engine/resourceStorage";
import { recordHumanConsequences } from "@/engine/humanConsequences";
import { applyInfrastructureHealthDelta } from "@/engine/infrastructureLedger";

function clamp(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function entry(label: string, delta: number, unit: string, reason: string, severity: TickEntry["severity"]): TickEntry {
  return { label, delta, unit, reason, severity };
}

function applyInfrastructureDelta(
  state: GameState,
  delta: number,
  incidentId: string,
  reason: string,
): void {
  if (!delta) return;
  const next = applyInfrastructureHealthDelta(state, delta, incidentId, reason);
  state.infrastructureLedger = next.infrastructureLedger;
  state.cityStats.infrastructureHealth = next.cityStats.infrastructureHealth;
}

export function processMilitaryMissions(s: GameState, entries: TickEntry[]): void {
  const mil = s.militaryOverhaul ?? createDefaultMilitaryState();
  if (!mil.activeMissions || mil.activeMissions.length === 0) {
    s.militaryOverhaul = mil;
    return;
  }

  const ongoing: ActiveMission[] = [];

  for (const mission of mil.activeMissions) {
    if (mission.status !== "active") {
      ongoing.push(mission);
      continue;
    }
    mission.ticksRemaining -= 1;
    if (mission.ticksRemaining <= 0) {
      const def = MILITARY_MISSIONS.find((m) => m.id === mission.missionId);
      const difficulty = def?.difficulty ?? 5;
      const equipBonus = Math.min(15, (mil.completedResearch?.length ?? 0) * 3);
      const personnelBonus = Math.min(10, Math.floor(mil.totalPersonnel / 100));
      const successChance = Math.min(95, 50 + mil.readiness * 0.3 - difficulty * 5 + equipBonus + personnelBonus);
      const roll = Math.random() * 100;
      if (roll < successChance) {
        mission.status = "completed";
        const creditReward = Math.floor((def?.creditsCost ?? 1000) * 1.5);
        s.resources.credits += creditReward;
        recordCreditsEarned(s, creditReward);
        entries.push(entry("Mission Complete", creditReward, "credits", `${def?.name ?? "Op"} successful. Command sends commendations.`, "positive"));
      } else {
        mission.status = "failed";
        const baseCas = Math.max(2, Math.floor(difficulty * 3));
        const readinessMod = Math.max(0.5, 1 - mil.readiness / 200);
        const casualties = Math.min(mil.totalPersonnel, Math.floor((baseCas + Math.floor(Math.random() * baseCas)) * readinessMod));
        // Task #381: casualties must remove REAL personnel units — totalPersonnel
        // is re-derived from s.units every tick, so decrementing it here alone
        // would be silently resurrected. applyPersonnelCasualties drains the
        // largest troop pools first; report the actual headcount removed.
        const removed = applyPersonnelCasualties(s, casualties);
        mil.totalPersonnel = Math.max(0, mil.totalPersonnel - removed);
        recordHumanConsequences(s, "military", { militaryDeaths: removed });
        entries.push(entry("Mission Failed", -removed, "personnel", `${def?.name ?? "Op"} went south. ${removed} personnel KIA.`, "negative"));
      }
    } else {
      ongoing.push(mission);
    }
  }

  mil.activeMissions = ongoing;
  s.militaryOverhaul = mil;
}

export function processMilitaryResearch(s: GameState, entries: TickEntry[]): void {
  const mil = s.militaryOverhaul ?? createDefaultMilitaryState();
  if (!mil.activeResearchId) {
    s.militaryOverhaul = mil;
    return;
  }

  const def = MILITARY_RESEARCH.find((r) => r.id === mil.activeResearchId);
  if (!def) {
    mil.activeResearchId = null;
    s.militaryOverhaul = mil;
    return;
  }

  mil.researchProgress = (mil.researchProgress ?? 0) + 1;
  if (mil.researchProgress >= def.ticksToComplete) {
    mil.completedResearch.push(mil.activeResearchId);
    if (def.bonuses.defenseRating) {
      s.cityStats.defenseRating = clamp(s.cityStats.defenseRating + def.bonuses.defenseRating, 0, 100);
    }
    entries.push(entry("Military R&D", 0, "", `"${def.name}" operational. Hostiles won't know what hit 'em.`, "positive"));
    mil.activeResearchId = null;
    mil.researchProgress = 0;
  }

  s.militaryOverhaul = mil;
}

export function processArmyReadiness(s: GameState, entries: TickEntry[]): void {
  const mil = s.militaryOverhaul ?? createDefaultMilitaryState();
  if (mil.totalPersonnel <= 0) {
    s.militaryOverhaul = mil;
    return;
  }

  const fuelDrain = Math.floor(mil.totalPersonnel * 0.02);
  const ammoDrain = Math.floor(mil.totalPersonnel * 0.01);
  const rationDrain = Math.floor(mil.totalPersonnel * 0.03);

  const fuelAvail = s.stockpiles?.fuel ?? 0;
  const ammoAvail = s.stockpiles?.ammo ?? 0;
  const rationAvail = s.resources.food ?? 0;

  const fuelShort = fuelDrain > fuelAvail;
  const ammoShort = ammoDrain > ammoAvail;
  const rationShort = rationDrain > rationAvail;

  if (s.stockpiles) {
    s.stockpiles.fuel = Math.max(0, fuelAvail - fuelDrain);
    s.stockpiles.ammo = Math.max(0, ammoAvail - ammoDrain);
  }
  applyResourceDelta(s, "food", -rationDrain);

  let readinessDelta = 0;
  if (fuelShort) readinessDelta -= 3;
  if (ammoShort) readinessDelta -= 4;
  if (rationShort) readinessDelta -= 5;
  if (!fuelShort && !ammoShort && !rationShort) readinessDelta += 1;

  mil.readiness = clamp(mil.readiness + readinessDelta, 0, 100);
  mil.standingArmy = { ...mil.standingArmy, readiness: mil.readiness };

  if (readinessDelta < -5) {
    entries.push(entry("Supply Crisis", readinessDelta, "readiness", "Quartermasters filing complaints in triplicate. Army supply lines faltering.", "warning"));
  }

  s.militaryOverhaul = mil;
}

export function processInnerCircleXP(s: GameState, entries: TickEntry[]): void {
  const ic = s.innerCircle ?? createDefaultInnerCircleState();
  if (ic.members.length === 0) {
    s.innerCircle = ic;
    return;
  }

  const roleXP: Record<string, number> = {
    chief_advisor: 8,
    spymaster: 6,
    war_marshal: 7,
    chancellor: 5,
    enforcer: 6,
    diplomat: 5,
    propagandist: 6,
    science_advisor: 7,
  };

  const cs = s.cityStats;
  const roleStatMod: Record<string, number> = {
    chief_advisor: Math.floor(cs.happiness / 25),
    spymaster: Math.floor(cs.crime / 20),
    war_marshal: Math.floor((s.militaryOverhaul?.readiness ?? 50) / 25),
    chancellor: Math.floor(cs.employment / 25),
    enforcer: Math.floor(cs.lawOrder / 25),
    diplomat: Math.floor((100 - cs.unrest) / 25),
    propagandist: Math.floor((cs.corruption ?? 0) / 20),
    science_advisor: Math.floor(cs.education / 25),
  };

  // PERF: O(N+M) lookup via Map instead of officers.find() inside the member loop.
  // Late-game inner circles + large officer rosters made this O(N*M).
  const officersById = new Map<string, typeof s.officers[number]>();
  for (const o of s.officers) officersById.set(o.id, o);

  for (const member of ic.members) {
    const baseXP = roleXP[member.role] ?? 5;
    const officer = officersById.get(member.officerId);
    const competenceBonus = officer ? Math.floor(officer.competence / 20) : 0;
    const statBonus = roleStatMod[member.role] ?? 0;
    member.xp += baseXP + competenceBonus + statBonus;

    const needed = xpForLevel(member.level);
    if (member.xp >= needed && member.level < 10) {
      member.xp -= needed;
      member.level += 1;
      entries.push(entry("Inner Circle Promotion", member.level, "level", `${officer?.name ?? member.officerId} advanced to level ${member.level}`, "positive"));
    }
  }

  s.innerCircle = ic;
}

export function processWhisperFeed(s: GameState, _entries: TickEntry[]): void {
  const ic = s.innerCircle ?? createDefaultInnerCircleState();
  if (s.totalTicks % 4 !== 0) {
    s.innerCircle = ic;
    return;
  }

  const officerData = s.officers.map((o) => ({
    id: o.id,
    name: o.name,
    loyalty: o.loyalty ?? 50,
    corruption: o.corruption ?? 10,
    ambition: o.ambition ?? 30,
    rivals: o.rivals ?? [],
  }));

  const newWhispers = generateWhispers(ic.members, officerData, s.totalTicks);
  ic.whispers = [...ic.whispers, ...newWhispers].slice(-ARRAY_CAPS.whispers);
  ic.lastWhisperTick = s.totalTicks;
  s.innerCircle = ic;
}

export function processDecreeCooldowns(s: GameState, _entries: TickEntry[]): void {
  const pol = s.politics ?? createDefaultPoliticsState();

  for (const id of Object.keys(pol.decreeCooldowns)) {
    if (pol.decreeCooldowns[id] <= s.totalTicks) {
      delete pol.decreeCooldowns[id];
    }
  }

  s.politics = pol;
}

export function processApprovalRefresh(s: GameState, _entries: TickEntry[]): void {
  const pol = s.politics ?? createDefaultPoliticsState();
  const cs = s.cityStats;
  const avgOfficerLoyalty = s.officers.length > 0
    ? s.officers.reduce((sum, o) => sum + (o.loyalty ?? 50), 0) / s.officers.length
    : 50;
  const factionAvgRelation = s.factions.length > 0
    ? s.factions.reduce((sum, f) => sum + (f.loyalty ?? 50), 0) / s.factions.length
    : 50;

  pol.approval = calculateApproval({
    happiness: cs.happiness,
    unrest: cs.unrest,
    corruption: cs.corruption,
    lawOrder: cs.lawOrder,
    defenseRating: cs.defenseRating,
    avgOfficerLoyalty,
    factionAvgRelation,
  });

  s.politics = pol;
}

// How many ticks an unresolved bio-outbreak festers before emergency teams
// auto-contain it (see processBiosphere). Without timed containment, active
// outbreaks compounded forever and a player who never opened the inbox
// spiralled into an unrecoverable collapse.
export const BIO_OUTBREAK_DURATION_TICKS = 8;

// Task #452: how long a player-cleared (dismissed OR resolved) stat-triggered
// biosphere crisis stays suppressed before the same deterministic gate may
// re-fire it. clearEventAndHealBiome stamps eventTriggerCooldowns[id] on every
// clearing path; processBiosphere's canTrigger compares against this. 12 ticks
// = 3 full turn-based days (TICKS_PER_TURN is 4), so a player who dismisses an
// ECOSYSTEM COLLAPSE WARNING gets a few full turns to act before the still-
// critical stat legitimately re-raises it — instead of a re-interrupt on the
// very next tick.
export const BIO_STAT_RETRIGGER_COOLDOWN_TICKS = 12;

// NATURAL_BIOSPHERE_FLOOR and BIOSPHERE_OUTBREAK_EVENT_IDS now live in the leaf
// module engine/biosphereBreakdown.ts (imported above for use here, alongside
// computeBiosphereBreakdown). Re-exported so existing importers — biosphereTrend.ts
// and its tests — keep importing them from tickProcessors unchanged.
export {
  NATURAL_BIOSPHERE_FLOOR,
  BIOSPHERE_OUTBREAK_EVENT_IDS,
} from "@/engine/biosphereBreakdown";

// Best-to-worst ranking of the crisis-risk tiers. A higher rank is a healthier
// biosphere with fewer crises, so an improving transition is a rank increase.
const BIOSPHERE_CRISIS_TIER_RANK: Record<BiosphereCrisisRiskTier, number> = {
  high: 0,
  easing: 1,
  low: 2,
};

const BIOSPHERE_CRISIS_TIER_NUDGE: Record<
  BiosphereCrisisRiskTier,
  { title: string; body: string } | null
> = {
  // "high" is the worst tier; you never improve INTO it, so no nudge.
  high: null,
  easing: {
    title: "NATURE CRISES EASING",
    body: "Your biosphere investment is paying off. Nature-crisis risk has eased from high to a lower level across the wildlands. Keep restoring the ecology to push it lower still.",
  },
  low: {
    title: "NATURE CRISES AT LOW RISK",
    body: "The wildlands have recovered enough that nature-crisis risk is now low. Your ecological reserves and green infrastructure are holding the biosphere steady.",
  },
};

// Fire a single positive advisory the moment the biosphere crosses a crisis-tier
// boundary in the improving direction (high -> easing -> low). Idempotent: the
// last-seen tier is stored on the game state, so it never repeats for the same
// tier and never fires on degradation.
function emitBiosphereCrisisTierImprovement(s: GameState): void {
  const cs = s.cityStats;
  if (!cs || typeof cs.biosphere !== "number") return;

  const currentTier = getBiosphereCrisisRisk(Math.round(cs.biosphere)).tier;
  const lastTier: BiosphereCrisisRiskTier =
    s.lastSeenBiosphereCrisisTier ?? "high";

  if (currentTier === lastTier) return;

  const improved =
    BIOSPHERE_CRISIS_TIER_RANK[currentTier] >
    BIOSPHERE_CRISIS_TIER_RANK[lastTier];

  // Always record the new tier (even on degradation) so the state tracks the
  // player's current tier and the nudge stays idempotent across saves/reloads.
  s.lastSeenBiosphereCrisisTier = currentTier;

  if (!improved) {
    if (BIOSPHERE_CRISIS_TIER_RANK[currentTier] < BIOSPHERE_CRISIS_TIER_RANK[lastTier]) {
      s.newsFeed = pushNewsItem(
        s.newsFeed,
        biosphereCrisisRiskRisingNews(s, currentTier as "high" | "easing"),
      );
    }
    return;
  }

  const nudge = BIOSPHERE_CRISIS_TIER_NUDGE[currentTier];
  if (nudge) {
    const msg: GameMessage = {
      id: `biosphere-crisis-tier-${currentTier}-${s.totalTicks}`,
      timestamp: s.gameDate,
      tick: s.totalTicks,
      category: "update",
      title: nudge.title,
      body: nudge.body,
      read: false,
      priority: "normal",
    };
    s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
  }
}

// Task #430: fire a single on-screen advisory the moment the power grid's ETA
// first drops into the imminent-brownout window, so a player who is not looking
// at the overview power card still gets a heads-up before the grid browns out.
// Gated by a durable boolean on state: set when the warning fires, cleared once
// the grid recovers to a non-deficit, so it fires once per low-power episode and
// can re-fire after a recovery (mirrors the seen-id transition pattern used by
// the biosphere / stat-band advisories). Reuses computePowerBreakdown /
// computePowerEta so the warning's timing matches the overview power card exactly.
export function emitPowerBrownoutWarning(s: GameState): void {
  const breakdown = computePowerBreakdown(s);
  // Recovery (or a balanced grid): re-arm the warning for the next episode and
  // stop. This uses the SAME dead-band computePowerEta uses to return null once
  // the grid is holding or in surplus, so the two can never disagree on "safe".
  if (breakdown.netPerTick >= -0.05) {
    // Task #436: if we are recovering from an actual warned-about episode (the
    // flag is set), fire ONE positive all-clear so the player who fixed the grid
    // gets confirmation the loop closed — mirrors the biosphere "easing / low
    // risk" recovery advisory. Clearing the flag before returning guarantees it
    // fires exactly once per recovery, and never for a grid that was never in
    // trouble (flag falsy).
    if (s.powerBrownoutWarned) {
      const msg: GameMessage = {
        id: `power-brownout-recovery-${s.totalTicks}`,
        timestamp: s.gameDate,
        tick: s.totalTicks,
        category: "update",
        title: "POWER GRID STABILIZED",
        body: "The power grid is back in surplus and the brownout risk has cleared. Generation now covers demand, so the reserve will hold or rebuild at the current balance.",
        read: false,
        priority: "normal",
      };
      s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
    }
    s.powerBrownoutWarned = false;
    return;
  }

  const eta = computePowerEta(breakdown, breakdown.power);
  // Losing ground, but either already clamped at the dark floor (eta null) or
  // still further out than the warn window: nothing imminent to surface yet.
  if (!eta || eta.ticks > POWER_BROWNOUT_WARN_TICKS) return;
  // Already warned for this low-power episode; do not spam it every tick.
  if (s.powerBrownoutWarned) return;
  s.powerBrownoutWarned = true;

  const tickWord = `${eta.ticks} tick${eta.ticks === 1 ? "" : "s"}`;
  const isBrownout = eta.kind === "brownout";
  const title = isBrownout
    ? "POWER GRID BROWNOUT IMMINENT"
    : "POWER GRID GOING DARK";
  const body = isBrownout
    ? `The power reserve runs out in about ${tickWord} at the current deficit, and the sector will start browning out. Build more generation or cut drain before the grid dips into the red.`
    : `The power grid is browning out and heading for a full blackout in about ${tickWord} at the current deficit. Restore generation or cut drain to pull the grid back into surplus.`;

  const msg: GameMessage = {
    id: `power-brownout-warning-${s.totalTicks}`,
    timestamp: s.gameDate,
    tick: s.totalTicks,
    category: "alert",
    title,
    body,
    read: false,
    priority: "high",
  };
  s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
}

// Per-stat last-seen band accessors. Each tracked stat keeps its OWN durable
// field on GameState (mirrors lastSeenBiosphereCrisisTier), seeded in
// initialState and backfilled in saveLoad.
const STAT_WIN_LAST_SEEN: Record<
  StatWinKey,
  {
    get: (s: GameState) => StatBandRank | undefined;
    set: (s: GameState, rank: StatBandRank) => void;
  }
> = {
  crime: {
    get: (s) => s.lastSeenCrimeBandRank,
    set: (s, rank) => {
      s.lastSeenCrimeBandRank = rank;
    },
  },
  happiness: {
    get: (s) => s.lastSeenHappinessBandRank,
    set: (s, rank) => {
      s.lastSeenHappinessBandRank = rank;
    },
  },
};

// Task #367: fire a single positive advisory the moment a tracked city stat
// crosses into a healthier band (rank 0 -> 1 -> 2). Idempotent: the last-seen
// band rank is stored per stat on the game state, so it never repeats for the
// same band and never fires on degradation. Mirrors
// emitBiosphereCrisisTierImprovement (Task #365).
export function emitStatBandImprovements(s: GameState): void {
  const cs = s.cityStats;
  if (!cs) return;

  for (const band of STAT_WIN_BANDS) {
    const raw = band.read(cs);
    if (typeof raw !== "number") continue;

    const store = STAT_WIN_LAST_SEEN[band.key];
    const currentRank = computeStatBandRank(cs, band);
    const lastRank = store.get(s);

    // First observation on an unseeded save: record the current band without
    // firing, so a legacy/malformed save can never emit a spurious win.
    if (lastRank === undefined) {
      store.set(s, currentRank);
      continue;
    }

    if (currentRank === lastRank) continue;

    // Always record the new band (even on degradation) so state tracks the
    // player's current band and the nudge stays idempotent across saves/reloads.
    store.set(s, currentRank);

    if (currentRank <= lastRank) continue; // degradation: no nudge

    const nudge = band.nudge[currentRank as Exclude<StatBandRank, 0>];
    if (!nudge) continue;

    const msg: GameMessage = {
      id: `stat-band-${band.key}-${currentRank}-${s.totalTicks}`,
      timestamp: s.gameDate,
      tick: s.totalTicks,
      category: "update",
      title: nudge.title,
      body: nudge.body,
      read: false,
      priority: "normal",
    };
    s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
  }
}

// Task #552: per-blocker copy for the one-time prosperity-gate hint. The body
// names the exact term holding the golden-age coverage back and points at the
// fix, so a player who never invested in ecology or housing learns why the
// prosperity stories are not arriving. Copy rules: no emojis, no exclamation
// marks.
const PROSPERITY_GATE_HINT_COPY: Record<
  "biosphere" | "housing" | "both",
  { title: string; body: string }
> = {
  biosphere: {
    title: "GOLDEN-AGE COVERAGE ON HOLD",
    body: "Your city clears every prosperity bar except one: the biosphere is still at wasteland grade. The broadcast desks will not run golden-age stories about a city whose air and wildlands remain wrecked. Invest in wildlands stewardship to lift the biosphere, and the prosperity coverage will start arriving.",
  },
  housing: {
    title: "GOLDEN-AGE COVERAGE ON HOLD",
    body: "Your city clears every prosperity bar except one: housing is under severe pressure. The broadcast desks will not run golden-age stories about a city where citizens sleep in corridors. Expand housing to relieve the pressure, and the prosperity coverage will start arriving.",
  },
  both: {
    title: "GOLDEN-AGE COVERAGE ON HOLD",
    body: "Your city clears every prosperity bar except two: the biosphere is still at wasteland grade and housing is under severe pressure. The broadcast desks will not run golden-age stories until both recover. Invest in wildlands stewardship and expand housing, and the prosperity coverage will start arriving.",
  },
};

// Task #552: fire a single advisor hint the first time the city clears every
// core thriving bar while ONLY the biosphere floor or the housing-pressure cap
// keeps the prosperity stories locked (see prosperityTriggers.cityThriving).
// Idempotent via the durable prosperityGateHintShown flag on state (seeded
// false in initialState, strict-false backfill in saveLoad), so it fires at
// most once per city and never repeats across saves/reloads or offline
// catch-up. Mirrors the biosphere / stat-band one-time advisory pattern.
export function emitProsperityGateHint(s: GameState): void {
  if (s.prosperityGateHintShown) return;

  const block = prosperityGateBlock(s);
  if (!block) return;

  s.prosperityGateHintShown = true;

  const which =
    block.biosphereBlocked && block.housingBlocked
      ? "both"
      : block.biosphereBlocked
        ? "biosphere"
        : "housing";
  const copy = PROSPERITY_GATE_HINT_COPY[which];

  const msg: GameMessage = {
    id: `${PROSPERITY_GATE_HINT_ID_PREFIX}${which}-${s.totalTicks}`,
    timestamp: s.gameDate,
    tick: s.totalTicks,
    category: "update",
    title: copy.title,
    body: copy.body,
    read: false,
    priority: "normal",
  };
  s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
}

export function emitProsperityGateRecoveryNews(s: GameState): void {
  if (s.prosperityGateRecoveryCelebrated) return;
  if (!s.prosperityGateHintShown || prosperityGateBlock(s)) return;

  s.prosperityGateRecoveryCelebrated = true;
  s.newsFeed = pushNewsItem(s.newsFeed, goldenAgeRecoveryNews(s));
}

function processBiosphere(s: GameState, entries: TickEntry[]): void {
  const cs = s.cityStats;
  const bldg = s.buildings as Record<string, number>;
  const unit = s.units as Record<string, number>;
  const policies = s.activePolicies ?? [];
  const b = (key: string) => bldg[key] ?? 0;
  const u = (key: string) => unit[key] ?? 0;
  const hasPolicy = (id: string) => policies.includes(id);
  const densityPressure = computePopulationDensityPressure(s);

  // Continuous biosphere recovery. The shared breakdown (engine/biosphereBreakdown.ts)
  // is the single source of truth for what moves the biosphere and by how much,
  // and it also drives the on-screen readout — so the sim and the UI contributors
  // can never drift. The recovery rate scales with investment and is strictly
  // positive for ANY green investment, which removes the old integer "dead zone"
  // where a moderate investment (bioBonus ~5–15) produced exactly zero recovery.
  const breakdown = computeBiosphereBreakdown(s);
  const bioRate = breakdown.recoveryRate;

  // Accumulate the fractional rate against the integer biosphere: a whole point
  // is applied once the accumulator crosses ±1, and the remainder carries into
  // the next tick — so even a small investment reliably moves the value over time.
  const prevBioProgress =
    typeof cs.biosphereRecoveryProgress === "number" ? cs.biosphereRecoveryProgress : 0;
  const bioProgress = prevBioProgress + bioRate;
  const bioApplied = bioProgress >= 0 ? Math.floor(bioProgress) : Math.ceil(bioProgress);
  cs.biosphereRecoveryProgress = clamp(bioProgress - bioApplied, -1, 1);

  // Neglect/pollution degrade the biosphere, but mere neglect can no longer
  // drain it to a dead zero: nature resists collapse down to a low natural
  // floor. (Active outbreak erosion below can still push under this floor; it
  // then rewilds back up.) Positive gains from infrastructure are unaffected.
  if (bioApplied < 0) {
    const neglectFloor = Math.min(cs.biosphere, NATURAL_BIOSPHERE_FLOOR);
    cs.biosphere = clamp(Math.max(cs.biosphere + bioApplied, neglectFloor), 0, 100);
  } else if (bioApplied > 0) {
    cs.biosphere = clamp(cs.biosphere + bioApplied, 0, 100);
  }

  // Emit the continuous rate (rounded for display) rather than the whole points
  // applied this tick, so the biosphere trend chip reflects the true direction
  // every tick instead of flickering to "no movement" on zero-applied ticks.
  const bioDisplayDelta = Math.round(bioRate * 10) / 10;
  entries.push(entry("Biosphere", bioDisplayDelta, "pts",
    bioDisplayDelta >= 0 ? "Ecological reserves and conservation efforts sustaining biosphere" : "Pollution and neglect degrading biosphere",
    bioDisplayDelta >= 0 ? "positive" : "negative"));

  const diseaseReduction =
    b("xenoVeterinaryHospitals") * 3 +
    b("biosphereReclamationDomes") * 2 +
    b("decontaminationForests") * 2 +
    b("radPurificationWetlands") * 1 +
    b("atmosphericBiofilterStations") * 2 +
    b("radWasteCompostingPlants") * 2 +
    b("bioremediationProcessingPlants") * 3 +
    u("diseaseVectorHunters") * 0.5 +
    u("feralCreatureControlTeams") * 0.3;

  let diseaseDelta = 0;
  if (cs.biosphere < 15) diseaseDelta += 2;
  else if (cs.biosphere < 35) diseaseDelta += 1;
  if (cs.biosphere > 60) diseaseDelta -= 1;
  if (cs.biosphere > 85) diseaseDelta -= 1;
  if (cs.publicHealth > 50) diseaseDelta -= 1;
  if (cs.publicHealth < 20) diseaseDelta += 1;
  diseaseDelta -= Math.floor(diseaseReduction * 0.2);
  diseaseDelta += densityPressure.diseaseRiskPerTick;

  if (hasPolicy("mandatoryBioDecontamination")) diseaseDelta -= 1;
  if (hasPolicy("ecosystemMonitoringNetwork")) diseaseDelta -= 1;
  if (hasPolicy("geneticPoachingCrackdown")) diseaseDelta -= 1;

  cs.diseaseRisk = clamp(cs.diseaseRisk + diseaseDelta, 0, 100);
  entries.push(entry("Disease Risk", diseaseDelta, "pts",
    diseaseDelta <= 0
      ? "Veterinary and biosphere systems controlling disease"
      : densityPressure.active
        ? "Crowding and ecological strain increasing disease exposure"
        : "Low biosphere health increasing disease vectors",
    diseaseDelta <= 0 ? "positive" : "negative"));

  const upliftGrowth =
    b("upliftTrainingAcademies") * 200 +
    b("upliftHabitatBlocks") * 150 +
    b("upliftCivicCenters") * 100;
  const upliftSupport =
    u("upliftLiaisonOfficers") * 30 +
    u("upliftSocialWorkers") * 20;
  let upliftDelta = Math.floor((upliftGrowth + upliftSupport) * 0.015);
  if (hasPolicy("upliftCitizenshipProgram")) upliftDelta += 3;
  if (hasPolicy("upliftBreedingControls")) upliftDelta = Math.max(0, upliftDelta - 2);
  if (hasPolicy("interspeciesIntegration")) upliftDelta += 2;
  if (cs.biosphere > 70) upliftDelta += 1;
  if (upliftGrowth > 0) {
    cs.upliftPopulation += upliftDelta;
    entries.push(entry("Uplift Population", upliftDelta, "citizens",
      "Uplift programs expanding sentient animal citizenry", "positive"));
  }

  const activeOutbreakIds = BIOSPHERE_OUTBREAK_EVENT_IDS as readonly string[];

  // Stamp any outbreak that predates timed containment (legacy saves, or
  // outbreaks spawned through the generic random-event path) with a short grace
  // window so it too eventually burns out instead of festering forever.
  s.activeEvents = s.activeEvents.map((e) =>
    activeOutbreakIds.includes(e.id) && typeof e.expiresTick !== "number"
      ? { ...e, expiresTick: s.totalTicks + 6 }
      : e,
  );

  // Outbreaks burn themselves out. Any past their expiry are contained and moved
  // into eventHistory (so the recent-id lockout briefly blocks an instant
  // respawn). This is what breaks the doom spiral: an unresolved outbreak can no
  // longer compound indefinitely just because the player never opened the inbox.
  const contained = s.activeEvents.filter(
    (e) => activeOutbreakIds.includes(e.id) && typeof e.expiresTick === "number" && e.expiresTick <= s.totalTicks,
  );
  if (contained.length > 0) {
    const containedIds = new Set(contained.map((e) => e.id));
    s.activeEvents = s.activeEvents.filter((e) => !containedIds.has(e.id));
    s.eventHistory = [...s.eventHistory.slice(-20), ...contained.map((e) => ({ ...e, resolved: true }))];
    for (const e of contained) {
      entries.push(entry(e.title, 0, "", "Emergency crews contained the outbreak before it could spread further", "positive"));
    }
  }

  const activeIds = new Set(s.activeEvents.map((e: { id: string }) => e.id));
  const recentIds = new Set(s.eventHistory.slice(-5).map((e: { id: string }) => e.id));
  // Task #452: also respect the per-id trigger cooldown that
  // clearEventAndHealBiome stamps when the player dismisses/resolves an event.
  // These four triggers are deterministic stat gates (no random roll on the
  // negative ones), so without a tick-based cooldown a dismissed crisis
  // re-fires on the VERY NEXT tick while the stat is still bad — in turn-based
  // mode that traps the player in a resolve → END TURN → 1-tick interrupt
  // loop. The cooldown is short by design: a stat that stays critical WILL
  // re-raise the crisis after BIO_STAT_RETRIGGER_COOLDOWN_TICKS; it just gives
  // the player a few full turns of breathing room to act on it first.
  const cooldowns = s.eventTriggerCooldowns ?? {};
  const canTrigger = (id: string) =>
    !activeIds.has(id) &&
    !recentIds.has(id) &&
    !(ONE_TIME_EVENT_IDS.has(id) && cooldowns[id] !== undefined) &&
    s.totalTicks - (cooldowns[id] ?? -9999) >= BIO_STAT_RETRIGGER_COOLDOWN_TICKS;

  const triggerBioEvent = (id: string, reason: string, severity: "positive" | "negative") => {
    const canonical = BIOSPHERE_EVENT_POOL.find((e) => e.id === id);
    if (!canonical) return;
    const spawned = { ...canonical, timestamp: Date.now(), resolved: false };
    // Task #458: a prior eventTriggerCooldowns stamp means the player already
    // cleared this exact id and the still-bad stat legitimately re-raised it —
    // mark it so the UI can say "STILL UNRESOLVED" instead of reading like a
    // brand-new crisis. First-time firings have no stamp and stay unmarked.
    const isRepeat = cooldowns[id] !== undefined;
    if (isRepeat) {
      spawned.repeat = true;
      const returnCount = (s.eventRecurrenceCounts?.[id] ?? 0) + 1;
      spawned.returnCount = returnCount;
      s.eventRecurrenceCounts = {
        ...(s.eventRecurrenceCounts ?? {}),
        [id]: returnCount,
      };
    }
    if (activeOutbreakIds.includes(id)) {
      spawned.expiresTick = s.totalTicks + BIO_OUTBREAK_DURATION_TICKS;
    }
    s.activeEvents = [...s.activeEvents, spawned];
    // Task #464: the spawn-site log entry (which also feeds the news ticker)
    // must not read like a brand-new incident when this is a known crisis
    // re-raising itself. Positive spawns (rare discovery) keep their original
    // wording — "still unresolved" only makes sense for a crisis.
    entries.push(entry(
      canonical.title,
      0,
      "",
      isRepeat && severity === "negative" ? "Known crisis resurfaced — still unresolved" : reason,
      severity,
    ));
  };

  if (negativeEventsAllowed(s) && cs.diseaseRisk >= 75 && canTrigger("biosphere_disease_outbreak")) {
    triggerBioEvent("biosphere_disease_outbreak", "Critical disease risk triggered outbreak event", "negative");
  }
  if (negativeEventsAllowed(s) && cs.biosphere <= 15 && canTrigger("biosphere_ecosystem_collapse")) {
    triggerBioEvent("biosphere_ecosystem_collapse", "Critically low biosphere triggered collapse event", "negative");
  }
  if (cs.biosphere >= 80 && Math.random() < 0.15 && canTrigger("biosphere_rare_discovery")) {
    triggerBioEvent("biosphere_rare_discovery", "Healthy biosphere revealed rare species", "positive");
  }
  if (negativeEventsAllowed(s) && cs.diseaseRisk >= 50 && cs.biosphere <= 30 && Math.random() < 0.2 && canTrigger("biosphere_toxic_bloom")) {
    triggerBioEvent("biosphere_toxic_bloom", "Degraded biosphere triggered toxic bloom event", "negative");
  }

  // Capped outbreak pressure. A single unresolved outbreak still hurts, but
  // stacked outbreaks no longer multiply into an unrecoverable collapse: at most
  // +1 disease and +1 unrest per tick, and biosphere only erodes every other
  // tick. Combined with timed containment above, the spiral is now survivable.
  const activeOutbreaks = s.activeEvents.filter((e: { id: string }) => activeOutbreakIds.includes(e.id)).length;
  if (activeOutbreaks > 0) {
    const outbreakBioLoss = s.totalTicks % 2 === 0 ? 1 : 0;
    cs.diseaseRisk = clamp(cs.diseaseRisk + 1, 0, 100);
    cs.biosphere = clamp(cs.biosphere - outbreakBioLoss, 0, 100);
    cs.unrest = clamp(cs.unrest + 1, 0, 100);
    entries.push(entry("Outbreak Unrest", 1, "pts",
      "Active disease outbreaks causing public unrest", "negative"));
  } else if (cs.biosphere < NATURAL_BIOSPHERE_FLOOR && s.totalTicks % 4 === 0) {
    // (Gentle stabilization for the 15–25 band was folded into the continuous
    // recovery rate above, which already climbs a degraded-but-above-floor
    // biosphere whenever the player has any green investment.)
    // Natural rewilding: with no outbreaks active and no remediation
    // infrastructure at all, an abandoned biosphere still very slowly recovers
    // toward the natural floor (+1 every 4th tick) instead of staying pinned at
    // a dead zero. Deliberately much slower than investment-driven recovery, and
    // capped at the low floor — a healthy biosphere still demands real building.
    cs.biosphere = clamp(cs.biosphere + 1, 0, NATURAL_BIOSPHERE_FLOOR);
    entries.push(entry("Biosphere", 1, "pts",
      "Nature slowly reclaiming neglected wildlands", "positive"));
  }

  // One-time positive nudge the moment the nature-crisis risk improves to a new
  // tier. Uses the SAME shared getBiosphereCrisisRisk ramp the on-screen NATURE
  // CRISIS RISK gauges read, so the message and the gauges never disagree. Fires
  // only on an IMPROVING transition (high -> easing -> low), never on
  // degradation, and only once per tier because the last-seen tier is persisted
  // on the game state (idempotent across saves/reloads).
  emitBiosphereCrisisTierImprovement(s);

  const mediationBonus =
    b("interspeciesMediationCenters") * 0.5 +
    b("upliftCivicCenters") * 0.3;
  if (mediationBonus > 0) {
    const mediationUnrestReduction = Math.floor(mediationBonus * 0.2);
    if (mediationUnrestReduction > 0) {
      cs.unrest = clamp(cs.unrest - mediationUnrestReduction, 0, 100);
    }
  }
}

export const WILDLANDS_DEMAND_PER_MILLION: Record<string, number> = {
  wild_meat: 8,
  wild_hides: 3,
  medicinal_herbs: 4,
  wildlands_biomass: 6,
  wildlands_antitoxin: 0.5,
  wild_livestock: 0.5,
  exotic_pelts: 0.3,
  ivory_tusks: 0.1,
  alpha_pheromones: 0.05,
  gene_vault_samples: 0.02,
};

export const WILDLANDS_DEMAND_LABELS: Record<string, string> = {
  wild_meat: "wildlands meat",
  wild_hides: "wildlands hides",
  medicinal_herbs: "medicinal herbs",
  wildlands_biomass: "wildlands biomass",
  wildlands_antitoxin: "antitoxin",
  wild_livestock: "wildlands livestock",
  exotic_pelts: "exotic pelts",
  ivory_tusks: "ivory tusks",
  alpha_pheromones: "alpha pheromones",
  gene_vault_samples: "gene vault samples",
};

export const WILDLANDS_BUILDING_KEYS = [
  "apexHuntersLodges",
  "wildlandsRangerStations",
  "hydroponicDomes",
  "feralLivestockPens",
  "wildlandsBioreserves",
  "frontierApothecaries",
  "bushTanneries",
  "geneVaults",
];

export function getWildlandsDemandSnapshot(s: GameState): {
  active: boolean;
  popMillions: number;
  ratio: number;
  rows: { id: string; label: string; demand: number; available: number; satisfied: number }[];
} {
  const bldg = (s.buildings ?? {}) as Record<string, number>;
  const hasWildlandsBuilding = WILDLANDS_BUILDING_KEYS.some((k) => (bldg[k] ?? 0) > 0);
  const pop = s.cityStats?.population ?? 0;
  const active = hasWildlandsBuilding || pop >= 500_000;
  const popMillions = Math.max(0.5, pop / 1_000_000);
  const stock = s.stockpiles ?? {};
  let totalDemand = 0;
  let totalSatisfied = 0;
  const rows = Object.entries(WILDLANDS_DEMAND_PER_MILLION).map(([id, perMillion]) => {
    const demand = perMillion * popMillions;
    const available = stock[id] ?? 0;
    const satisfied = Math.min(demand, available);
    totalDemand += demand;
    totalSatisfied += satisfied;
    return {
      id,
      label: WILDLANDS_DEMAND_LABELS[id] ?? id,
      demand,
      available,
      satisfied,
    };
  });
  return {
    active,
    popMillions,
    ratio: totalDemand > 0 ? totalSatisfied / totalDemand : 0,
    rows,
  };
}

export function processWildlandsCityDemand(s: GameState, entries: TickEntry[]): void {
  const bldg = (s.buildings ?? {}) as Record<string, number>;
  const hasWildlandsBuilding = WILDLANDS_BUILDING_KEYS.some((k) => (bldg[k] ?? 0) > 0);
  const pop = s.cityStats?.population ?? 0;

  // Demand only activates once the city has wildlands infrastructure or
  // a population large enough that biological imports are realistic.
  if (!hasWildlandsBuilding && pop < 500_000) return;
  if (!s.stockpiles) return;
  // Validate downstream state up front so we never drain stockpiles
  // without applying the corresponding city benefits.
  const cs = s.cityStats;
  if (!cs) return;

  const popMillions = Math.max(0.5, pop / 1_000_000);

  let totalDemand = 0;
  let totalSatisfied = 0;
  const shortages: string[] = [];

  // Per-unit benefits when a wildlands commodity is consumed by the city.
  // Resource gains (food/medSupplies/fuel/credits/goods) flow into city
  // stockpiles. Disease & research gains accumulate and apply at end of tick.
  let foodGain = 0;
  let medGain = 0;
  let fuelGain = 0;
  let goodsGain = 0;
  let creditsGain = 0;
  let researchGain = 0;
  let diseaseDrop = 0; // accumulated raw, probabilistically rounded later

  let medSupplyDemand = 0;
  let medSupplySatisfied = 0;

  for (const [commodityId, perMillion] of Object.entries(WILDLANDS_DEMAND_PER_MILLION)) {
    const demand = perMillion * popMillions;
    const available = s.stockpiles[commodityId] ?? 0;
    const consumed = Math.min(demand, available);
    if (consumed > 0) {
      s.stockpiles[commodityId] = Math.max(0, available - consumed);
    }
    totalDemand += demand;
    totalSatisfied += consumed;
    if (consumed < demand * 0.25) {
      shortages.push(WILDLANDS_DEMAND_LABELS[commodityId] ?? commodityId);
    }

    // Apply downstream subsystem benefits scaled to amount consumed.
    switch (commodityId) {
      case "wild_meat":
        foodGain += consumed * 0.5;
        break;
      case "wild_livestock":
        foodGain += consumed * 2;
        break;
      case "medicinal_herbs":
        medGain += consumed * 0.1;
        diseaseDrop += consumed * 0.01;
        medSupplyDemand += demand;
        medSupplySatisfied += consumed;
        break;
      case "wildlands_antitoxin":
        medGain += consumed * 1;
        diseaseDrop += consumed * 0.05;
        medSupplyDemand += demand;
        medSupplySatisfied += consumed;
        break;
      case "wildlands_biomass":
        fuelGain += consumed * 0.4;
        break;
      case "wild_hides":
        goodsGain += consumed * 0.2;
        break;
      case "exotic_pelts":
        creditsGain += consumed * 25;
        break;
      case "ivory_tusks":
        creditsGain += consumed * 100;
        break;
      case "alpha_pheromones":
        creditsGain += consumed * 200;
        researchGain += consumed * 0.05;
        break;
      case "gene_vault_samples":
        creditsGain += consumed * 500;
        researchGain += consumed * 0.2;
        break;
    }
  }

  // Apply resource gains (floor to keep counters integer-clean).
  if (s.resources) {
    const r = s.resources;
    const fAdd = Math.floor(foodGain);
    if (fAdd > 0) applyResourceDelta(s, "food", fAdd);
    const mAdd = Math.floor(medGain);
    if (mAdd > 0) {
      const medicalReward = applyResourceDelta(s, "medSupplies", mAdd);
      entries.push(entry(
        "Wildlands Medical Supply",
        medicalReward.applied,
        "medical supplies",
        summarizeMedicalStorageGain(medicalReward),
        medicalReward.rejected > 0 ? "warning" : "positive",
      ));
    }
    const fuAdd = Math.floor(fuelGain);
    if (fuAdd > 0) applyResourceDelta(s, "fuel", fuAdd);
    const gAdd = Math.floor(goodsGain);
    if (gAdd > 0) applyResourceDelta(s, "goods", gAdd);
    const cAdd = Math.floor(creditsGain);
    if (cAdd > 0) { r.credits = Math.max(0, (r.credits ?? 0) + cAdd); recordCreditsEarned(s, cAdd); }
  }

  // Research progress: small steady drip, capped by target.
  if (researchGain > 0 && cs.researchTarget !== undefined) {
    const rAdd = Math.floor(researchGain);
    const probAdd = (researchGain - rAdd) > Math.random() ? 1 : 0;
    const totalAdd = rAdd + probAdd;
    if (totalAdd > 0) {
      cs.researchProgress = Math.min(cs.researchTarget, (cs.researchProgress ?? 0) + totalAdd);
    }
  }

  // Disease risk drop from herbal/antitoxin supply: probabilistic rounding so
  // sub-1 contributions still bite at low pop without runaway reduction.
  if (diseaseDrop > 0) {
    const whole = Math.floor(diseaseDrop);
    const frac = diseaseDrop - whole;
    const drop = whole + (Math.random() < frac ? 1 : 0);
    if (drop > 0) {
      cs.diseaseRisk = clamp(cs.diseaseRisk - drop, 0, 100);
    }
  }

  const ratio = totalDemand > 0 ? totalSatisfied / totalDemand : 0;

  // Positive feedback every 8 ticks, requires near-full supply, to avoid
  // passive stat creep. Negative feedback every 4 ticks so shortages bite faster.
  if (ratio >= 0.95 && s.totalTicks % 8 === 0) {
    cs.happiness = clamp(cs.happiness + 1, 0, 100);
    cs.publicHealth = clamp(cs.publicHealth + 1, 0, 100);
    entries.push(entry(
      "Wildlands Markets",
      1,
      "happiness",
      "Bio-commodities flowing to markets. Citizens ate meat tonight.",
      "positive",
    ));
  }

  // Independent of the overall supply ratio: reliable herbal/antitoxin
  // throughput quietly boosts clinic effectiveness on its own cadence.
  if (
    medSupplyDemand > 0 &&
    medSupplySatisfied / medSupplyDemand >= 0.85 &&
    s.totalTicks % 16 === 0
  ) {
    cs.publicHealth = clamp(cs.publicHealth + 1, 0, 100);
    entries.push(entry(
      "Frontier Apothecaries",
      1,
      "publicHealth",
      "Wildlands medicines stocking clinics. Outbreak risk easing.",
      "positive",
    ));
  }

  if (ratio < 0.4 && s.totalTicks % 4 === 0) {
    cs.happiness = clamp(cs.happiness - 1, 0, 100);
    cs.unrest = clamp(cs.unrest + 1, 0, 100);
    const examples = shortages.slice(0, 3).join(", ");
    const reason = examples
      ? `Markets running dry on ${examples}. Citizens grumble.`
      : "Bio-commodity shelves empty. Citizens grumble.";
    entries.push(entry(
      "Wildlands Shortage",
      -1,
      "happiness",
      reason,
      "warning",
    ));
  }
}

export function processIllnesses(s: GameState, entries: TickEntry[]): void {
  if (!s.activeIllnesses) s.activeIllnesses = [];
  const cs = s.cityStats;

  if (s.totalTicks % 4 === 0 && cs.diseaseRisk > 20) {
    const outbreakChance = cs.diseaseRisk / 200;
    if (Math.random() < outbreakChance && s.activeIllnesses.length < 3) {
      const activeIds = new Set(s.activeIllnesses.map(i => i.illnessId));
      const eligible = ILLNESSES.filter(i => !activeIds.has(i.id));
      if (eligible.length > 0) {
        let pool: IllnessDef[];
        if (cs.diseaseRisk > 70) {
          pool = eligible;
        } else if (cs.diseaseRisk > 50) {
          pool = eligible.filter(i => i.category !== "radiation");
        } else {
          pool = eligible.filter(i => i.category === "regular" || i.category === "humorous");
        }
        if (pool.length === 0) pool = eligible;
        const illness = pool[Math.floor(Math.random() * pool.length)];
        const severity = Math.floor(cs.diseaseRisk * 0.3 + Math.random() * 30);
        s.activeIllnesses.push({ illnessId: illness.id, severity: clamp(severity, 10, 100), ticksActive: 0 });
        entries.push(entry("Disease Outbreak", severity, illness.name,
          `${illness.name}: ${illness.description}`, "negative"));
      }
    }
  }

  const resolved: string[] = [];
  for (let i = 0; i < s.activeIllnesses.length; i++) {
    const active = s.activeIllnesses[i];
    active.ticksActive += 1;
    const def = ILLNESSES.find(d => d.id === active.illnessId);
    if (!def) { resolved.push(active.illnessId); continue; }

    const fx = def.effects;
    const scale = active.severity / 100;
    if (fx.happiness) cs.happiness = clamp(cs.happiness + Math.round(fx.happiness * scale * 0.2), 0, 100);
    if (fx.productivity) cs.employment = clamp(cs.employment + Math.round(fx.productivity * scale * 0.1), 0, 100);
    if (fx.unrest) cs.unrest = clamp(cs.unrest + Math.round(fx.unrest * scale * 0.2), 0, 100);
    if (fx.crime) cs.crime = clamp(cs.crime + Math.round(fx.crime * scale * 0.15), 0, 100);
    if (fx.population) {
      const popLoss = Math.floor(fx.population * scale);
      cs.population = Math.max(1000, cs.population + popLoss);
    }
    if (fx.hospitalLoad) {
      cs.diseaseRisk = clamp(cs.diseaseRisk + Math.round(fx.hospitalLoad * scale * 0.1), 0, 100);
    }

    const recoveryChance = (cs.publicHealth * 0.01 + (100 - active.severity) * 0.005) * 0.15;
    if (active.ticksActive > 8 && Math.random() < recoveryChance) {
      resolved.push(active.illnessId);
      entries.push(entry("Disease Contained", 0, def.name,
        `${def.name} has been contained by medical services`, "positive"));
    }
    if (active.ticksActive > 24) {
      resolved.push(active.illnessId);
      entries.push(entry("Disease Subsided", 0, def.name,
        `${def.name} has run its course`, "positive"));
    }
  }

  if (resolved.length > 0) {
    s.activeIllnesses = s.activeIllnesses.filter(i => !resolved.includes(i.illnessId));
  }
}

export function processOfficerEffects(s: GameState, entries: TickEntry[]): void {
  if (!s.officers || s.officers.length === 0) return;

  const appointed = s.officers.filter((o) => o.appointed);
  if (appointed.length === 0) return;

  const cs = s.cityStats;
  const rates = s.rates;

  const deptAvgCompetence = (dept: string) => {
    const deptOfficers = appointed.filter((o) => o.department === dept);
    if (deptOfficers.length === 0) return 0;
    return deptOfficers.reduce((sum, o) => sum + o.competence, 0) / deptOfficers.length;
  };

  const deptAvgCorruption = (dept: string) => {
    const deptOfficers = appointed.filter((o) => o.department === dept);
    if (deptOfficers.length === 0) return 0;
    return deptOfficers.reduce((sum, o) => sum + o.corruption, 0) / deptOfficers.length;
  };

  const infraComp = deptAvgCompetence("infrastructure");
  if (infraComp > 50) {
    const bonus = Math.floor((infraComp - 40) * 0.5);
    applyResourceDelta(s, "power", bonus);
    s.resources.water += Math.floor(bonus * 0.5);
    applyInfrastructureDelta(
      s,
      1,
      `tick:${s.totalTicks}:officer:infrastructure-competence`,
      "Infrastructure department competence",
    );
  } else if (infraComp > 0 && infraComp < 40) {
    applyInfrastructureDelta(
      s,
      -1,
      `tick:${s.totalTicks}:officer:infrastructure-incompetence`,
      "Infrastructure department underperformance",
    );
  }

  const econComp = deptAvgCompetence("economic");
  if (econComp > 50) {
    const bonus = Math.floor((econComp - 40) * 3);
    s.resources.credits += bonus;
    recordCreditsEarned(s, bonus);
  } else if (econComp > 0 && econComp < 40) {
    s.resources.credits = Math.max(0, s.resources.credits - 50);
  }

  const lawComp = deptAvgCompetence("law_enforcement");
  if (lawComp > 50) {
    cs.crime = clamp(cs.crime - 1, 0, 100);
    cs.lawOrder = clamp(cs.lawOrder + 1, 0, 100);
  } else if (lawComp > 0 && lawComp < 40) {
    cs.crime = clamp(cs.crime + 1, 0, 100);
  }

  const defComp = deptAvgCompetence("defense");
  if (defComp > 50) {
    cs.defenseRating = clamp(cs.defenseRating + 1, 0, 100);
  }

  const civicComp = deptAvgCompetence("civic");
  if (civicComp > 50) {
    cs.happiness = clamp(cs.happiness + 1, 0, 100);
    cs.publicHealth = clamp(cs.publicHealth + 1, 0, 100);
  } else if (civicComp > 0 && civicComp < 40) {
    cs.happiness = clamp(cs.happiness - 1, 0, 100);
  }

  const researchComp = deptAvgCompetence("research");
  if (researchComp > 50) {
    const rBonus = Math.floor((researchComp - 40) * 0.1);
    cs.researchProgress = Math.min(cs.researchTarget, cs.researchProgress + rBonus);
  }

  const judicialComp = deptAvgCompetence("judicial");
  if (judicialComp > 50) {
    cs.lawOrder = clamp(cs.lawOrder + 1, 0, 100);
    cs.corruption = clamp(cs.corruption - 1, 0, 100);
  } else if (judicialComp > 0 && judicialComp < 40) {
    cs.corruption = clamp(cs.corruption + 1, 0, 100);
  }

  const execComp = deptAvgCompetence("executive_council");
  if (execComp > 50) {
    cs.corruption = clamp(cs.corruption - 1, 0, 100);
    const execBonus = Math.floor((execComp - 40) * 1.5);
    s.resources.credits += execBonus;
    recordCreditsEarned(s, execBonus);
  }

  const districtComp = deptAvgCompetence("district");
  if (districtComp > 50) {
    cs.happiness = clamp(cs.happiness + 0.5, 0, 100);
    cs.unrest = clamp(cs.unrest - 0.5, 0, 100);
  } else if (districtComp > 0 && districtComp < 40) {
    cs.unrest = clamp(cs.unrest + 0.5, 0, 100);
  }

  const advisoryComp = deptAvgCompetence("advisory");
  if (advisoryComp > 50) {
    cs.researchProgress = Math.min(cs.researchTarget, cs.researchProgress + 1);
    cs.education = clamp(cs.education + 0.5, 0, 100);
  }

  let traitCreditsLeak = 0;
  let traitCreditsBonus = 0;

  for (const officer of appointed) {
    for (const trait of (officer.traits ?? [])) {
      switch (trait) {
        case "efficient":
          traitCreditsBonus += 15;
          break;
        case "visionary":
          cs.researchProgress = Math.min(cs.researchTarget, cs.researchProgress + 1);
          break;
        case "corrupt":
          traitCreditsLeak += Math.floor(50 + officer.corruption * 2);
          cs.corruption = clamp(cs.corruption + 0.2, 0, 100);
          break;
        case "incompetent":
          applyInfrastructureDelta(
            s,
            -0.3,
            `tick:${s.totalTicks}:officer:${officer.id}:incompetent`,
            "Incompetent officer infrastructure damage",
          );
          break;
        case "loyal":
          cs.corruption = clamp(cs.corruption - 0.15, 0, 100);
          break;
        case "idealistic":
          cs.happiness = clamp(cs.happiness + 0.15, 0, 100);
          cs.lawOrder = clamp(cs.lawOrder - 0.1, 0, 100);
          break;
        case "strict":
          cs.crime = clamp(cs.crime - 0.2, 0, 100);
          cs.happiness = clamp(cs.happiness - 0.1, 0, 100);
          break;
        case "strategist":
          cs.defenseRating = clamp(cs.defenseRating + 0.2, 0, 100);
          break;
        case "aggressive":
          cs.unrest = clamp(cs.unrest + 0.15, 0, 100);
          cs.crime = clamp(cs.crime - 0.3, 0, 100);
          break;
        case "cautious":
          applyInfrastructureDelta(
            s,
            0.1,
            `tick:${s.totalTicks}:officer:${officer.id}:cautious`,
            "Cautious officer maintenance",
          );
          break;
        case "investor_friendly":
          traitCreditsBonus += 20;
          break;
        case "worker_advocate":
          cs.unrest = clamp(cs.unrest - 0.2, 0, 100);
          cs.happiness = clamp(cs.happiness + 0.1, 0, 100);
          break;
        case "budget_hawk":
          traitCreditsBonus += 25;
          cs.happiness = clamp(cs.happiness - 0.1, 0, 100);
          break;
        case "corporate_loyalist":
          traitCreditsBonus += 15;
          cs.corruption = clamp(cs.corruption + 0.1, 0, 100);
          break;
        case "ambitious":
          break;
        case "bureaucratic":
          cs.corruption = clamp(cs.corruption - 0.1, 0, 100);
          applyInfrastructureDelta(
            s,
            -0.1,
            `tick:${s.totalTicks}:officer:${officer.id}:bureaucratic`,
            "Bureaucratic infrastructure neglect",
          );
          break;
      }
    }
  }

  if (traitCreditsBonus > 0) {
    s.resources.credits += traitCreditsBonus;
    recordCreditsEarned(s, traitCreditsBonus);
  }

  if (traitCreditsLeak > 0) {
    s.resources.credits = Math.max(0, s.resources.credits - traitCreditsLeak);
    entries.push(entry("Officer Graft", -traitCreditsLeak, "credits", "Corrupt officers siphoning funds through shell accounts", "negative"));
  }

  const overallCorruption = deptAvgCorruption("supreme_leadership");
  if (overallCorruption > 50) {
    const leak = Math.floor(overallCorruption * 3);
    s.resources.credits = Math.max(0, s.resources.credits - leak);
    entries.push(entry("Leadership Graft", -leak, "credits", "Corrupt leadership skimming from city treasury", "negative"));
  }

  const totalAppointed = appointed.length;
  const totalPositions = s.officers.length;
  const fillRate = totalPositions > 0 ? totalAppointed / totalPositions : 0;
  if (fillRate > 0.5) {
    const efficiencyLabel = fillRate > 0.8 ? "Fully staffed bureaucracy running efficiently" : "Partial staffing providing governance bonuses";
    entries.push(entry("Officer Corps", Math.floor(fillRate * 100), "%", efficiencyLabel, "positive"));
  } else if (totalAppointed > 0) {
    entries.push(entry("Officer Corps", Math.floor(fillRate * 100), "%", "Skeleton staff — critical vacancies slowing governance", "warning"));
  }

  for (const officer of appointed) {
    const traits = officer.traits ?? [];
    const hasCorruptTrait = traits.includes("corrupt");
    const hasLoyalTrait = traits.includes("loyal");
    const hasStrictTrait = traits.includes("strict");
    const hasAmbitiousTrait = traits.includes("ambitious");

    let corruptionDrift = 0;
    if (cs.corruption > 60) corruptionDrift += 0.3;
    else if (cs.corruption > 40) corruptionDrift += 0.1;
    if (cs.lawOrder > 70) corruptionDrift -= 0.2;
    if (hasCorruptTrait) corruptionDrift += 0.2;
    if (hasStrictTrait) corruptionDrift -= 0.15;
    if (hasLoyalTrait) corruptionDrift -= 0.1;
    if (officer.loyalty > 80) corruptionDrift -= 0.1;
    officer.corruption = clamp(officer.corruption + corruptionDrift, 0, 100);

    let loyaltyDrift = 0;
    if (cs.happiness > 70) loyaltyDrift += 0.15;
    else if (cs.happiness < 30) loyaltyDrift -= 0.2;
    if (cs.unrest > 60) loyaltyDrift -= 0.15;
    else if (cs.unrest < 20) loyaltyDrift += 0.1;
    if (officer.corruption > 70) loyaltyDrift -= 0.1;
    if (hasLoyalTrait) loyaltyDrift += 0.1;
    if (officer.ambition > 80 && officer.loyalty < 50) loyaltyDrift -= 0.1;
    officer.loyalty = clamp(officer.loyalty + loyaltyDrift, 0, 100);

    let ambitionDrift = 0.05;
    if (officer.competence > 70) ambitionDrift += 0.05;
    if (hasAmbitiousTrait) ambitionDrift += 0.1;
    if (officer.loyalty > 80) ambitionDrift -= 0.03;
    if (officer.ambition > 90) ambitionDrift *= 0.3;
    officer.ambition = clamp(officer.ambition + ambitionDrift, 0, 100);
  }
}

// Task #455: how long a player-cleared (dismissed OR resolved) officer event
// stays suppressed before its condition gate may re-fire the same id. Officer
// events are random-gated but their CONDITIONS are persistent (a corrupt
// officer stays corrupt for many ticks), so without a per-id cooldown a
// dismissed EMBEZZLEMENT SCANDAL could re-roll on the very next officer-event
// window (every 8 ticks) while nothing about the roster changed. 16 ticks
// guarantees at least one full officer-event window is skipped after a clear,
// no matter where inside the 8-tick cadence the clear landed. Like the
// biosphere cooldown, it is a breather, not a permanent silence: a roster that
// stays problematic legitimately re-raises the incident once it elapses.
export const OFFICER_EVENT_RETRIGGER_COOLDOWN_TICKS = 16;

export function processOfficerEvents(s: GameState, entries: TickEntry[]): void {
  if (!s.officers || s.officers.length === 0) return;
  if (s.totalTicks % 8 !== 0) return;

  const appointed = s.officers.filter((o) => o.appointed);
  if (appointed.length === 0) return;

  const activeIds = new Set(s.activeEvents.map((e: { id: string }) => e.id));
  const recentIds = new Set(s.eventHistory.slice(-8).map((e: { id: string }) => e.id));
  // Task #455: also respect the per-id trigger cooldown that
  // clearEventAndHealBiome stamps on every player clearing path (dismiss,
  // respond, multi-respond) — same contract as processBiosphere's canTrigger.
  const cooldowns = s.eventTriggerCooldowns ?? {};
  const canTrigger = (id: string) =>
    !activeIds.has(id) &&
    !recentIds.has(id) &&
    s.totalTicks - (cooldowns[id] ?? -9999) >= OFFICER_EVENT_RETRIGGER_COOLDOWN_TICKS;

  const triggerOfficerEvent = (evt: Omit<GameEvent, "timestamp" | "resolved">) => {
    // Task #458: same repeat-marking contract as triggerBioEvent — a prior
    // eventTriggerCooldowns stamp for this id means the player already cleared
    // it once and the roster condition is still bad, so this spawn is the SAME
    // known incident resurfacing, not a new one.
    const spawned = { ...evt, timestamp: Date.now(), resolved: false } as GameEvent;
    const isRepeat = cooldowns[evt.id] !== undefined;
    if (isRepeat) {
      spawned.repeat = true;
      const returnCount = (s.eventRecurrenceCounts?.[evt.id] ?? 0) + 1;
      spawned.returnCount = returnCount;
      s.eventRecurrenceCounts = {
        ...(s.eventRecurrenceCounts ?? {}),
        [evt.id]: returnCount,
      };
    }
    s.activeEvents = [...s.activeEvents, spawned];
    // Task #464: repeat spawns get resurfaced wording in the log / ticker so
    // they read as the same known incident returning, not a new one.
    entries.push(entry(
      evt.title,
      0,
      "",
      isRepeat ? "Known officer incident resurfaced — still unresolved" : "Officer incident requires your attention",
      evt.severity === "critical" ? "negative" : "warning",
    ));
  };

  const corruptOfficers = appointed.filter((o) => o.corruption > 25);
  if (corruptOfficers.length > 0 && Math.random() < 0.15 && canTrigger("officer_embezzlement")) {
    const culprit = corruptOfficers[Math.floor(Math.random() * corruptOfficers.length)];
    triggerOfficerEvent({
      id: "officer_embezzlement",
      title: "EMBEZZLEMENT SCANDAL",
      severity: "high",
      effects: { corruption: 4, credits: -5000 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_embezzlement"],
    });
    return;
  }

  const ambitiousOfficers = appointed.filter((o) => o.ambition > 55 && o.loyalty < 50);
  if (ambitiousOfficers.length > 0 && Math.random() < 0.15 && canTrigger("officer_power_grab")) {
    const schemer = ambitiousOfficers[Math.floor(Math.random() * ambitiousOfficers.length)];
    triggerOfficerEvent({
      id: "officer_power_grab",
      title: "OFFICER POWER PLAY",
      severity: "high",
      effects: { unrest: 3, corruption: 2 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_power_grab"],
    });
    return;
  }

  const loyalHighComp = appointed.filter((o) => o.loyalty > 65 && o.competence > 60);
  if (loyalHighComp.length > 0 && Math.random() < 0.12 && canTrigger("officer_excellence")) {
    const star = loyalHighComp[Math.floor(Math.random() * loyalHighComp.length)];
    triggerOfficerEvent({
      id: "officer_excellence",
      title: "OUTSTANDING SERVICE REPORT",
      severity: "low",
      effects: { happiness: 2, lawOrder: 1 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_excellence"],
    });
    return;
  }

  // PERF: Build an id->officer Map once so the rivalry pair scan is O(N + sum(rivals))
  // instead of O(N * R * N) (one .some() per officer per rival id per filter pass).
  // Late-game an officer can have many rivals, and appointed grows over time.
  const appointedById = new Map(appointed.map((o) => [o.id, o] as const));
  const rivalPairs = appointed.filter((o) => (o.rivals ?? []).some((rid) => appointedById.has(rid)));
  if (rivalPairs.length > 0 && Math.random() < 0.15 && canTrigger("officer_rivalry")) {
    const aggressor = rivalPairs[Math.floor(Math.random() * rivalPairs.length)];
    const rivalId = (aggressor.rivals ?? []).find((rid) => appointedById.has(rid));
    const rival = rivalId ? appointedById.get(rivalId) : undefined;
    triggerOfficerEvent({
      id: "officer_rivalry",
      title: "OFFICER RIVALRY ESCALATES",
      severity: "medium",
      effects: { unrest: 2, happiness: -1, lawOrder: -2 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_rivalry"],
    });
    return;
  }

  const lowLoyalty = appointed.filter((o) => o.loyalty < 40 && o.ambition > 45);
  if (lowLoyalty.length > 0 && Math.random() < 0.12 && canTrigger("officer_defection")) {
    const traitor = lowLoyalty[Math.floor(Math.random() * lowLoyalty.length)];
    triggerOfficerEvent({
      id: "officer_defection",
      title: "DEFECTION THREAT",
      severity: "critical",
      effects: { defenseRating: -3, corruption: 3 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_defection"],
    });
    return;
  }

  const fearOfficers = appointed.filter((o) => o.fearFactor > 22);
  if (fearOfficers.length > 0 && Math.random() < 0.1 && canTrigger("officer_brutality")) {
    const brute = fearOfficers[Math.floor(Math.random() * fearOfficers.length)];
    triggerOfficerEvent({
      id: "officer_brutality",
      title: "EXCESSIVE FORCE COMPLAINT",
      severity: "medium",
      effects: { unrest: 3, happiness: -3, crime: -2, lawOrder: 2 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_brutality"],
    });
    return;
  }

  const popularOfficers = appointed.filter((o) => o.popularity > 55);
  if (popularOfficers.length > 0 && Math.random() < 0.1 && canTrigger("officer_popular_hero")) {
    const hero = popularOfficers[Math.floor(Math.random() * popularOfficers.length)];
    triggerOfficerEvent({
      id: "officer_popular_hero",
      title: "OFFICER BECOMES PUBLIC HERO",
      severity: "low",
      effects: { happiness: 3, unrest: -2 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_popular_hero"],
    });
    return;
  }

  const incompetentOfficers = appointed.filter((o) => o.competence < 45);
  if (incompetentOfficers.length >= 3 && Math.random() < 0.12 && canTrigger("officer_systemic_failure")) {
    triggerOfficerEvent({
      id: "officer_systemic_failure",
      title: "SYSTEMIC BUREAUCRATIC FAILURE",
      severity: "high",
      effects: { credits: -8000, happiness: -3, corruption: 3 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_systemic_failure"],
    });
    return;
  }

  const corruptHighRank = appointed.filter((o) => o.corruption > 20 && (o.rank === "chief_director" || o.rank === "commissioner"));
  if (corruptHighRank.length > 0 && Math.random() < 0.1 && canTrigger("officer_corruption_ring")) {
    const kingpin = corruptHighRank[Math.floor(Math.random() * corruptHighRank.length)];
    triggerOfficerEvent({
      id: "officer_corruption_ring",
      title: "CORRUPTION RING UNCOVERED",
      severity: "critical",
      effects: { corruption: 6, credits: -10000, lawOrder: -4 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_corruption_ring"],
    });
    return;
  }

  const loyalOfficers = appointed.filter((o) => o.loyalty > 65);
  if (loyalOfficers.length >= 5 && Math.random() < 0.08 && canTrigger("officer_loyalty_dividend")) {
    triggerOfficerEvent({
      id: "officer_loyalty_dividend",
      title: "LOYALTY DIVIDEND",
      severity: "low",
      effects: { happiness: 2, corruption: -3, lawOrder: 2 },
      responseOptions: OFFICER_RESPONSE_MAP["officer_loyalty_dividend"],
    });
    return;
  }
}

const OFFICER_RESPONSE_MAP: Record<string, import("@/engine/types").EventResponse[]> = {
  officer_embezzlement: [
    { id: "prosecute", label: "PROSECUTE FULLY", effects: { corruption: -4, credits: -2000, happiness: 2 } },
    { id: "quiet_removal", label: "QUIET REMOVAL", effects: { corruption: -1, credits: 2000 } },
    { id: "turn_asset", label: "TURN THEM INTO AN ASSET", effects: { corruption: 2, credits: 3000, lawOrder: -2 } },
  ],
  officer_power_grab: [
    { id: "confront", label: "CONFRONT DIRECTLY", effects: { unrest: -2, happiness: -1, lawOrder: 2 } },
    { id: "outmaneuver", label: "OUTMANEUVER POLITICALLY", effects: { corruption: -1, credits: -3000 } },
    { id: "promote_away", label: "PROMOTE TO IRRELEVANCE", effects: { credits: -1000, unrest: -1 } },
    { id: "let_play_out", label: "LET IT PLAY OUT", effects: { corruption: 2, unrest: 2 } },
  ],
  officer_excellence: [
    { id: "public_commendation", label: "PUBLIC COMMENDATION", effects: { happiness: 3, credits: -1000 } },
    { id: "promote", label: "PROMOTE IMMEDIATELY", effects: { happiness: 2, lawOrder: 1, credits: -2000 } },
    { id: "bonus", label: "PERFORMANCE BONUS", effects: { credits: -3000, happiness: 1 } },
  ],
  officer_rivalry: [
    { id: "mediate", label: "MEDIATE PERSONALLY", effects: { unrest: -2, happiness: 1, lawOrder: 1 } },
    { id: "transfer_one", label: "TRANSFER ONE", effects: { unrest: -1, credits: -1000 } },
    { id: "fire_both", label: "DISMISS BOTH", effects: { lawOrder: 2, happiness: -2, unrest: -3 } },
    { id: "pit_against", label: "ENCOURAGE COMPETITION", effects: { corruption: 2, credits: 1000, unrest: 1 } },
  ],
  officer_defection: [
    { id: "arrest", label: "ARREST IMMEDIATELY", effects: { lawOrder: 3, happiness: -2, defenseRating: 2 } },
    { id: "counter_intel", label: "FEED DISINFORMATION", effects: { defenseRating: 3, credits: -4000 } },
    { id: "buy_loyalty", label: "BUY THEIR LOYALTY BACK", effects: { credits: -8000, corruption: 2, defenseRating: 1 } },
  ],
  officer_brutality: [
    { id: "investigate_brutality", label: "LAUNCH INVESTIGATION", effects: { lawOrder: 2, happiness: 2, crime: 1, credits: -3000 } },
    { id: "back_officer", label: "BACK THE OFFICER", effects: { crime: -3, happiness: -3, unrest: 2, lawOrder: 3 } },
    { id: "sensitivity_training", label: "MANDATE TRAINING", effects: { credits: -2000, happiness: 1, crime: 1 } },
  ],
  officer_popular_hero: [
    { id: "celebrate", label: "CELEBRATE THEM", effects: { happiness: 3, unrest: -2 } },
    { id: "sideline", label: "QUIETLY SIDELINE", effects: { happiness: -2, unrest: 1, corruption: 1 } },
    { id: "promote_spokesperson", label: "MAKE SPOKESPERSON", effects: { happiness: 2, unrest: -1, credits: -1000 } },
  ],
  officer_systemic_failure: [
    { id: "mass_purge", label: "MASS PURGE", effects: { happiness: -2, lawOrder: -2, corruption: -3, credits: -5000 } },
    { id: "training_program", label: "MANDATORY RETRAINING", effects: { credits: -10000, happiness: 1 } },
    { id: "hire_consultants", label: "HIRE OUTSIDE CONSULTANTS", effects: { credits: -8000, corruption: -2 } },
  ],
  officer_corruption_ring: [
    { id: "full_prosecution", label: "FULL PROSECUTION", effects: { corruption: -8, lawOrder: 4, happiness: 3, credits: -5000 } },
    { id: "internal_cleanup", label: "INTERNAL CLEANUP", effects: { corruption: -4, credits: -3000 } },
    { id: "take_cut", label: "TAKE A CUT", effects: { credits: 15000, corruption: 5, lawOrder: -3, happiness: -2 } },
  ],
  officer_loyalty_dividend: [
    { id: "reward_loyalty", label: "REWARD THEM ALL", effects: { credits: -5000, happiness: 2, corruption: -2 } },
    { id: "acknowledge", label: "PUBLIC ACKNOWLEDGMENT", effects: { happiness: 1, lawOrder: 1 } },
  ],
};

/**
 * Passive faction-threat cool-down. Without this, threat accumulated from
 * crackdowns and events stays pinned near 100 forever and the faction
 * panel becomes background noise instead of a meaningful late-game lever.
 *
 * Rules:
 * - Skip factions involved in an active or ceasefire civil war.
 * - High threat decays faster than low threat, so the panel "settles" but
 *   never drops below the inherent friction floor of 5.
 * - Loyal factions cool faster (recovery diplomacy actually pays off).
 */
export function processFactionThreatDecay(s: GameState, _entries: TickEntry[]): void {
  if (!s.factions || s.factions.length === 0) return;
  const ns = s.newSystems;
  const warring = new Set<string>(
    (ns?.civilWars ?? [])
      .filter((w: any) => w?.phase === "active" || w?.phase === "ceasefire")
      .map((w: any) => w.factionId as string)
  );
  for (const f of s.factions) {
    if (!f.isActive) continue;
    if (warring.has(f.id)) continue;
    const t = f.threat ?? 0;
    if (t <= 5) continue;
    const loyaltyTerm = 1 + Math.max(0, (f.loyalty ?? 0) - 50) / 100;
    const decay = Math.max(0.2, ((t - 5) / 100) * loyaltyTerm);
    f.threat = Math.max(5, Math.round((t - decay) * 10) / 10);
  }
}

export function runNewSystemTicks(s: GameState, entries: TickEntry[]): void {
  const tick = s.totalTicks;
  processMilitaryMissions(s, entries);
  processMilitaryResearch(s, entries);
  // Task #381: processArmyReadiness superseded by processMilitaryLogistics
  // (runs inside formulas.runTick). It drained a dead parallel stockpile and
  // used a recruited counter that no longer exists; readiness/supply are now
  // derived from s.units + installations there.
  processInnerCircleXP(s, entries);
  if (tick % 3 === 0) processFactionThreatDecay(s, entries);
  if (tick % 2 === 0) processWhisperFeed(s, entries);
  processDecreeCooldowns(s, entries);
  processApprovalRefresh(s, entries);
  processOfficerEffects(s, entries);
  processAdministrativeInstitutions(s, entries);
  if (tick % 2 === 1) processOfficerEvents(s, entries);
  if (tick % 2 === 0 && negativeEventsAllowed(s)) processWorldEvents(s, entries);
  processBiosphere(s, entries);
  processIllnesses(s, entries);
  if (tick % 4 === 0) processStatHistory(s);
  processEventChainDelays(s, entries);
  processAutoConstruction(s, entries);
  processAutoManagers(s, entries);
  processAutoRecruit(s, entries);
  processAutoDomainManagers(s, entries);
  processAllNewSystems(s, entries);
  processResourceNodes(s, entries);
  if (tick % 4 === 0) applyZoneBonuses(s, entries);
  processScavengeExpeditions(s, entries);
  // Process the existing taming queue first, then resolve wildlands projects.
  // This avoids an off-by-one: when a capture project resolves and enqueues a
  // new TamingEntry, that entry will not have its `ticksRemaining` decremented
  // until the next tick, matching its advertised duration exactly.
  processTamingQueue(s, entries);
  processWildlandsProjects(s, entries);
  processWildlandsEcology(s, entries);
  processWildlandsCityDemand(s, entries);
  processRetinueTick(s, entries);
  processSecurityWingsTick(s, entries);
  processCustodyTick(s, entries);
  processCompanionMissions(s, entries);
  processEventChainTrigger(s, entries);
  processDiplomacyTick(s, entries);
  processActiveOperations(s, entries);
  processPlayerProgression(s, entries);
  processOfficerMissions(s, entries);
  processSpyOps(s, entries);
  processMegaProjects(s, entries);
  processWarRoomOps(s, entries);
  processApprovalConsequences(s, entries);
  const factionDemand = processFactionDemands(s);
  if (factionDemand) {
    s.activeEvents = [...(s.activeEvents ?? []), factionDemand];
    entries.push(entry("FACTION DEMAND", 0, "", `${factionDemand.title} requires a political decision`, "warning"));
  }
  if (tick % 2 === 0) processReputationEffects(s, entries);
  processIntrigueTick(s, entries);
  processFaithDrift(s, entries);
  processCorporateChains(s);
  processIndependentEnterprises(s, entries);
  applyIndependentEnterpriseTax(s, entries);
  // NOTE: end-state check is intentionally NOT called here. It must
  // run AFTER applyPartnerAndPlayerTickEffects (which can drive pop to
  // zero via hostile strikes) — see GameContext.tsx and formulas.ts
  // batch path. processEndStateCheck is idempotent, so calling it
  // strictly post-partner-effects is safe and correct.
}

function processCompanionMissions(s: GameState, entries: TickEntry[]): void {
  const missions = s.companionMissions;
  if (!missions || missions.length === 0) return;
  const bgState = s.bodyguards;
  if (!bgState) return;

  let changed = false;
  const updatedMissions = missions.map((m) => {
    if (m.completed) return m;
    if (s.totalTicks >= m.endTick) {
      changed = true;
      const guard = bgState.roster.find((b) => b.id === m.guardId);
      const combat = guard?.combat ?? 10;
      const level = guard?.level ?? 1;
      const loyalty = guard?.loyalty ?? 50;

      const result = resolveMission(m.missionId, combat, level, loyalty, guard?.classId);

      if (guard) {
        guard.xp += result.xpGained;
        guard.missionsCompleted += 1;
        guard.kills += result.killsGained;
        if (result.injured) {
          guard.status = "injured";
          guard.injuredAtTick = s.totalTicks;
        } else {
          guard.status = "active";
        }
        guard.loyalty = Math.max(0, Math.min(100, guard.loyalty + result.loyaltyChange));
      }

      if (result.creditsGained > 0) {
        s.resources.credits += result.creditsGained;
        recordCreditsEarned(s, result.creditsGained);
      }

      for (const [key, val] of Object.entries(result.resourcesGained)) {
        if (val && val !== 0 && key in s.resources) {
          (s.resources as any)[key] = Math.max(0, ((s.resources as any)[key] ?? 0) + val);
        }
      }

      const rewardLines: string[] = [];
      if (result.xpGained > 0) rewardLines.push(`XP: +${result.xpGained}`);
      if (result.creditsGained > 0) rewardLines.push(`Credits: +${result.creditsGained.toLocaleString()}`);
      if (result.killsGained > 0) rewardLines.push(`Kills: +${result.killsGained}`);
      if (result.loyaltyChange !== 0) rewardLines.push(`Loyalty: ${result.loyaltyChange > 0 ? "+" : ""}${result.loyaltyChange}`);
      for (const [key, val] of Object.entries(result.resourcesGained)) {
        if (val && val > 0) rewardLines.push(`${key}: +${val}`);
        else if (val && val < 0) rewardLines.push(`${key}: ${val} (cost)`);
      }

      if (guard) {
        while (guard.xp >= guard.xpToNext && guard.level < 20) {
          guard.xp -= guard.xpToNext;
          guard.level += 1;
          const combatGain = 3 + Math.floor(Math.random() * 3);
          guard.combat += combatGain;
          guard.xpToNext = xpForBodyguardLevel(guard.level);
          const classDef = BODYGUARD_DEFS.find((d) => d.classId === guard.classId);
          if (classDef) {
            const abilityIndex = guard.level >= 7 ? 2 : guard.level >= 4 ? 1 : 0;
            for (let ai = 0; ai <= abilityIndex; ai++) {
              if (classDef.abilities[ai] && !guard.unlockedAbilities.includes(classDef.abilities[ai].id)) {
                guard.unlockedAbilities.push(classDef.abilities[ai].id);
                rewardLines.push(`ABILITY UNLOCKED: ${classDef.abilities[ai].name}`);
              }
            }
          }
          rewardLines.push(`LEVEL UP: ${guard.customName} is now Level ${guard.level} (Combat +${combatGain})`);
        }
      }

      if (result.outcome === "success" && s.player) {
        const playerXpGain = Math.floor(result.xpGained * 0.5);
        if (playerXpGain > 0) {
          s.player.xp += playerXpGain;
          rewardLines.push(`Commander XP: +${playerXpGain}`);
        }
      }

      const outcomeColor = result.outcome === "success" ? "🟢" : result.outcome === "partial" ? "🟡" : "🔴";

      const msg: import("@/engine/types").GameMessage = {
        id: `mission-${m.id}-result`,
        timestamp: s.gameDate,
        tick: s.totalTicks,
        category: result.outcome === "failure" ? "alert" : "intel",
        title: `${outcomeColor} ${m.guardName}: ${result.title}`,
        body: `${result.narrative}\n\n${rewardLines.length > 0 ? `REWARDS:\n${rewardLines.join("\n")}` : "No rewards recovered."}${result.injured ? `\n\nSTATUS: ${m.guardName} is INJURED and requires recovery time.` : `\n\nSTATUS: ${m.guardName} is back on active duty.`}`,
        read: false,
        priority: result.outcome === "failure" ? "high" : "normal",
      };
      s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);

      const severity = result.outcome === "success" ? "positive" : result.outcome === "partial" ? "neutral" : "negative";
      entries.push({ label: `${m.guardName}: ${result.title}`, delta: result.creditsGained, unit: "cr", reason: "companion_mission", severity });
      return { ...m, completed: true };
    }
    return m;
  });

  if (changed) {
    s.companionMissions = updatedMissions;
  }

  const RECOVERY_TICKS = 4;
  for (const guard of bgState.roster) {
    if (guard.status === "injured") {
      if (!guard.injuredAtTick) {
        guard.injuredAtTick = s.totalTicks;
      }
      if (s.totalTicks - guard.injuredAtTick >= RECOVERY_TICKS) {
        guard.status = "active";
        guard.injuredAtTick = undefined;
        const recoveryMsg: import("@/engine/types").GameMessage = {
          id: `recovery-${guard.id}-${s.totalTicks}`,
          timestamp: s.gameDate,
          tick: s.totalTicks,
          category: "intel",
          title: `🟢 ${guard.customName}: RECOVERED`,
          body: `${guard.customName} has completed medical treatment and is cleared for active duty.`,
          read: false,
          priority: "normal",
        };
        s.messages = [recoveryMsg, ...(s.messages ?? [])].slice(0, 200);
        entries.push({ label: `${guard.customName}: Recovered`, delta: 0, unit: "", reason: "recovery", severity: "positive" });
      }
    }
  }
}

function processResourceNodes(s: GameState, entries: TickEntry[]): void {
  const rn = s.resourceNodes;
  if (!rn) return;
  const exploiting = rn.exploiting;
  if (!exploiting || Object.keys(exploiting).length === 0) return;

  const newExploiting = { ...exploiting };
  const newDepleted = [...(rn.depleted ?? [])];
  const newYielded = { ...(rn.totalYielded ?? {}) };
  let totalCredits = 0;
  let totalFood = 0;
  let totalFuel = 0;
  let totalSteel = 0;
  let totalMed = 0;
  let totalAmmo = 0;

  for (const [nodeId, info] of Object.entries(exploiting)) {
    const def = RESOURCE_NODE_DEFS.find((n) => n.locationId === nodeId);
    if (!def) continue;

    const mult = RICHNESS_MULT[def.richness] ?? 1;
    const y = def.yieldPerTick;
    if (y.credits) { totalCredits += Math.floor(y.credits * mult); }
    if (y.food) { totalFood += Math.floor(y.food * mult); }
    if (y.fuel) { totalFuel += Math.floor(y.fuel * mult); }
    if (y.steel) { totalSteel += Math.floor(y.steel * mult); }
    if (y.medSupplies) { totalMed += Math.floor(y.medSupplies * mult); }
    if (y.ammo) { totalAmmo += Math.floor(y.ammo * mult); }
    newYielded[nodeId] = (newYielded[nodeId] ?? 0) + 1;

    if (def.depletionTicks > 0) {
      const remaining = info.ticksRemaining - 1;
      if (remaining <= 0) {
        newDepleted.push(nodeId);
        delete newExploiting[nodeId];
        const nodeName = getNodeName(nodeId);
        entries.push(entry("Resource Node", 0, "", `${RESOURCE_NODE_LABELS[def.resourceType]} at ${nodeName} depleted`, "warning"));
      } else {
        newExploiting[nodeId] = { ...info, ticksRemaining: remaining };
      }
    }
  }

  if (totalCredits > 0) { s.resources.credits += totalCredits; recordCreditsEarned(s, totalCredits); entries.push(entry("Resource Nodes", totalCredits, "credits", "Extraction income", "positive")); }
  if (totalFood > 0) { applyResourceDelta(s, "food", totalFood); }
  if (totalFuel > 0) { s.stockpiles.fuel = (s.stockpiles.fuel ?? 0) + totalFuel; }
  if (totalSteel > 0) { s.stockpiles.steel = (s.stockpiles.steel ?? 0) + totalSteel; }
  if (totalMed > 0) {
    const medicalReward = applyResourceDelta(s, "medSupplies", totalMed);
    entries.push(entry(
      "Resource Nodes",
      medicalReward.applied,
      "medical supplies",
      `${summarizeMedicalStorageGain(medicalReward)} Extraction yield.`,
      medicalReward.rejected > 0 ? "warning" : "positive",
    ));
  }
  if (totalAmmo > 0) { s.stockpiles.ammo = (s.stockpiles.ammo ?? 0) + totalAmmo; }

  s.resourceNodes = { ...rn, exploiting: newExploiting, depleted: newDepleted, totalYielded: newYielded };
}

function processEventChainTrigger(s: GameState, entries: TickEntry[]): void {
  if (s.totalTicks % 8 !== 0) return;
  const chain = checkEventChainTriggers(s);
  if (!chain) return;
  const event = startEventChain(s, chain);
  if (event) {
    s.activeEvents = [...(s.activeEvents ?? []), event];
    entries.push({
      label: "Event Chain",
      delta: 0,
      unit: "",
      reason: `${chain.name} triggered`,
      severity: "warning",
    });
  }
}

// Coups reuse the existing militarist_coup / authoritarian_purge event chains as
// their crisis payload (Task #379). A chain can only be fired if it is not
// already running and off cooldown — mirror checkEventChainTriggers' gates.
const COUP_CHAIN_IDS = ["militarist_coup", "authoritarian_purge"] as const;
// A faction may drive at most one live plot; keep the global count well under
// the sanitizer plot cap (10) so a save can never wedge on phantom plots.
const MAX_ACTIVE_PLOTS = 6;
// Below this radicalization a not-yet-matured plot fizzles out on its own.
const PLOT_FIZZLE_FLOOR = PLOT_THRESHOLD - 20;

function coupChainAvailable(s: GameState, chainId: string): boolean {
  const active = s.activeEventChains ?? [];
  if (active.some((a) => a.chainId === chainId && !a.resolved)) return false;
  const cd = s.eventChainCooldowns ?? {};
  if ((cd[chainId] ?? 0) > s.totalTicks) return false;
  return true;
}

function pushIntrigueMessage(
  s: GameState,
  id: string,
  title: string,
  body: string,
  priority: "normal" | "high" = "normal",
): void {
  const msg: GameMessage = {
    id,
    timestamp: s.gameDate,
    tick: s.totalTicks,
    category: "intel",
    title,
    body,
    read: false,
    priority,
  };
  s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
}

/**
 * INNER POLITICS, INTRIGUE & COUPS (Task #379).
 *
 * The single passive faction-loyalty-drift source (moved here out of
 * processReputationEffects) plus the radicalization → plot → warning → crisis
 * pipeline. Runs on an 8-tick cadence, offset from the %8===0 crowd so it does
 * not pile onto the same ticks as the other heavy processors. Fully
 * deterministic (no Math.random) so tests are stable.
 */
export function processIntrigueTick(s: GameState, entries: TickEntry[]): void {
  if (s.totalTicks % 8 !== 4) return;
  const rep = s.politics?.reputation;
  if (!rep) return; // no ideology space yet — nothing to align factions against
  const factions = s.factions ?? [];
  if (factions.length === 0) return;

  const prev: IntrigueState = s.intrigue ?? createDefaultIntrigueState();
  const radicalization: Record<string, number> = { ...prev.radicalization };
  let plots: IntriguePlot[] = prev.plots.map((p) => ({ ...p, warnedStages: [...p.warnedStages] }));

  const unrest = s.cityStats?.unrest ?? 0;

  // -- Pass 1: per-faction alignment → loyalty drift, radicalization, plot birth
  for (const f of factions) {
    if (f.isActive === false) continue;
    const alignment = computeAlignment(f, rep);

    const drift = computeLoyaltyDrift(alignment);
    if (drift !== 0) {
      f.loyalty = Math.max(0, Math.min(100, (f.loyalty ?? 50) + drift));
    }

    const rDelta = computeRadicalizationDelta(f, alignment, unrest);
    radicalization[f.id] = Math.max(0, Math.min(100, (radicalization[f.id] ?? 0) + rDelta));

    const hasLivePlot = plots.some((p) => p.instigatorFactionId === f.id);
    if (radicalization[f.id] >= PLOT_THRESHOLD && !hasLivePlot && plots.length < MAX_ACTIVE_PLOTS) {
      const plot = makePlot(f, s.totalTicks);
      plots.push(plot);
      pushIntrigueMessage(
        s,
        `intrigue-hatch-${plot.id}`,
        `INTEL: ${f.name} RADICALIZING`,
        `Chatter from ${f.name} has turned openly hostile to your regime. Analysts believe a ${PLOT_TYPE_LABEL[plot.type].toLowerCase()} is now in its earliest stages. Watch for warning signs.`,
        "normal",
      );
    }
  }

  // -- Pass 2: advance plots, emit warning signs, mature crises
  const surviving: IntriguePlot[] = [];
  for (const plot of plots) {
    if (plot.matured) {
      // Terror/assassination plots linger (matured) until their event is
      // resolved by the eventResolution hook, which removes them.
      surviving.push(plot);
      continue;
    }

    const rad = radicalization[plot.instigatorFactionId] ?? 0;
    if (rad < PLOT_FIZZLE_FLOOR) {
      pushIntrigueMessage(
        s,
        `intrigue-fizzle-${plot.id}-${s.totalTicks}`,
        `INTEL: PLOT COLLAPSES`,
        `The ${PLOT_TYPE_LABEL[plot.type].toLowerCase()} brewing within ${plot.instigatorName} has lost momentum. Cooler heads — or your policies — have prevailed. For now.`,
        "normal",
      );
      continue; // drop the plot
    }

    plot.progress = Math.max(0, Math.min(100, plot.progress + computePlotProgressDelta(rad, unrest)));

    // Warning signs. First stage = a quiet intel note; later stage = an
    // interactive warning event the player can act on to prevent the crisis.
    for (const stage of PLOT_WARN_STAGES) {
      if (plot.progress >= stage && !plot.warnedStages.includes(stage)) {
        plot.warnedStages.push(stage);
        const isLast = stage === PLOT_WARN_STAGES[PLOT_WARN_STAGES.length - 1];
        if (isLast) {
          const warnEvt = buildIntrigueWarningEvent(plot);
          const already = (s.activeEvents ?? []).some((e: { id: string }) => e.id === warnEvt.id);
          if (!already) {
            s.activeEvents = [
              ...(s.activeEvents ?? []),
              { ...warnEvt, timestamp: Date.now(), resolved: false } as GameEvent,
            ];
            entries.push(entry(warnEvt.title, 0, "", "A plot against your regime is escalating", "warning"));
          }
        } else {
          pushIntrigueMessage(
            s,
            `intrigue-warn1-${plot.id}`,
            `WARNING SIGN: ${plot.instigatorName}`,
            `Early indicators of a ${PLOT_TYPE_LABEL[plot.type].toLowerCase()} led by ${plot.instigatorName}. Nothing actionable yet, but the trend is dangerous. Consider easing tensions before it hardens.`,
            "high",
          );
        }
      }
    }

    if (plot.progress >= 100) {
      // Crisis matures. Drop any lingering warning event for this plot first.
      const warnId = buildIntrigueWarningEvent(plot).id;
      s.activeEvents = (s.activeEvents ?? []).filter((e: { id: string }) => e.id !== warnId);

      if (plot.type === "coup") {
        const chainId = COUP_CHAIN_IDS.find((id) => coupChainAvailable(s, id));
        const chainDef = chainId ? EVENT_CHAINS.find((c) => c.id === chainId) : undefined;
        const event = chainDef ? startEventChain(s, chainDef) : null;
        if (event) {
          s.activeEvents = [...(s.activeEvents ?? []), event];
          entries.push(entry("COUP D'ÉTAT", 0, "", `${plot.instigatorName} launches a coup`, "negative"));
          // Task #493: a coup attempt is public knowledge — broadcast it.
          s.newsFeed = pushNewsItem(s.newsFeed, coupLaunchedNews(s, plot.id, plot.instigatorName));
          // The chain is now the consequence; cool the faction and drop the plot.
          radicalization[plot.instigatorFactionId] = Math.max(0, (radicalization[plot.instigatorFactionId] ?? 0) - 35);
          const inst = factions.find((f) => f.id === plot.instigatorFactionId);
          if (inst) inst.threat = Math.max(0, Math.min(100, (inst.threat ?? 0) + 10));
          continue; // remove plot — chain carries the story forward
        }
        // Chain unavailable (already running / on cooldown): hold the plot at
        // 100 and retry next intrigue tick.
        surviving.push(plot);
        continue;
      }

      // Terror / assassination: push the crisis event and keep the matured plot
      // so the resolution hook can find it by plotId and clean it up.
      const crisis = plot.type === "terror_cell" ? buildTerrorEvent(plot) : buildAssassinationEvent(plot);
      const already = (s.activeEvents ?? []).some((e: { id: string }) => e.id === crisis.id);
      if (!already) {
        s.activeEvents = [
          ...(s.activeEvents ?? []),
          { ...crisis, timestamp: Date.now(), resolved: false } as GameEvent,
        ];
        entries.push(entry(crisis.title, 0, "", "A matured plot has struck", "negative"));
        // Task #493: the strike itself is public — the city hears about it the
        // moment it happens, not when the player resolves the aftermath.
        s.newsFeed = pushNewsItem(
          s.newsFeed,
          plot.type === "terror_cell"
            ? terrorStrikeNews(s, plot.id, plot.instigatorName)
            : assassinationAttemptNews(s, plot.id, plot.instigatorName),
        );
      }
      plot.matured = true;
      surviving.push(plot);
      continue;
    }

    surviving.push(plot);
  }

  s.intrigue = { radicalization, plots: surviving };
}

function processOfficerMissions(s: GameState, entries: TickEntry[]): void {
  if (!s.activeMissions || s.activeMissions.length === 0) return;
  const result = processOfficerMissionTick(s);
  Object.assign(s, result.state);
  for (const r of result.results) {
    entries.push({
      label: r.success ? "Mission Complete" : "Mission Failed",
      delta: 0,
      unit: "",
      reason: r.message,
      severity: r.success ? "positive" : "negative",
    });
    Object.assign(s, appendMissionResultMessage(s, r, s.gameDate, s.totalTicks));
  }
}

function processSpyOps(s: GameState, entries: TickEntry[]): void {
  const intel = s.intelligence;
  if (!intel || !intel.operations || intel.operations.length === 0) return;

  const ops = intel.operations;
  let changed = false;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.status !== "active") continue;

    if (op.ticksRemaining > 0) {
      ops[i] = { ...op, ticksRemaining: op.ticksRemaining - 1 };
      if (ops[i].ticksRemaining <= 0) {
        changed = true;
        const def = SPY_OPS.find(d => d.id === op.id);
        const baseRate = def?.successRate ?? 60;
        const skillBonus = (s.player?.skills?.blackOps ?? 0) * 2 + (s.player?.skills?.surveillance ?? 0);
        const roll = Math.random() * 100;
        const success = roll < Math.min(95, baseRate + skillBonus);

        if (success) {
          ops[i] = { ...ops[i], status: "completed" };
          intel.totalOpsCompleted = (intel.totalOpsCompleted ?? 0) + 1;

          let reward = "";
          const cat = def?.category ?? "reconnaissance";
          if (cat === "reconnaissance" || cat === "intel_gathering" || cat === "advanced_intel") {
            intel.securityLevel = Math.min(100, (intel.securityLevel ?? 0) + 3);
            reward = "+3 security level";
          } else if (cat === "sabotage") {
            s.cityStats.defenseRating = Math.min(100, s.cityStats.defenseRating + 2);
            reward = "+2 defense rating";
          } else if (cat === "theft" || cat === "covert_logistics") {
            const loot = Math.floor((def?.cost ?? 1000) * 1.5);
            s.resources.credits += loot;
            recordCreditsEarned(s, loot);
            reward = `+${loot.toLocaleString()} credits recovered`;
          } else if (cat === "propaganda" || cat === "psychological") {
            s.cityStats.happiness = Math.min(100, s.cityStats.happiness + 2);
            s.cityStats.unrest = Math.max(0, s.cityStats.unrest - 2);
            reward = "+2 happiness, -2 unrest";
          } else if (cat === "counter_intel") {
            intel.counterIntelRating = Math.min(100, (intel.counterIntelRating ?? 0) + 5);
            reward = "+5 counter-intel rating";
          } else if (cat === "cyber") {
            s.cityStats.crime = Math.max(0, s.cityStats.crime - 3);
            reward = "-3 crime";
          } else {
            s.resources.credits += 5000;
            recordCreditsEarned(s, 5000);
            reward = "+5,000 credits";
          }

          entries.push({ label: "Spy Op Complete", delta: 0, unit: "", reason: `${def?.name ?? "Operation"} succeeded — ${reward}`, severity: "positive" });
          const msg: GameMessage = {
            id: `spyop-${op.id}-${s.totalTicks}`,
            timestamp: s.gameDate, tick: s.totalTicks, category: "intel",
            title: `INTEL: ${(def?.name ?? "Operation").toUpperCase()} — SUCCESS`,
            body: `Operation completed successfully.\n\n${reward}`,
            read: false, priority: "normal",
          };
          s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
        } else {
          ops[i] = { ...ops[i], status: "failed" };
          intel.totalOpsFailed = (intel.totalOpsFailed ?? 0) + 1;

          const penalty = Math.floor((def?.cost ?? 1000) * 0.3);
          s.resources.credits = Math.max(0, s.resources.credits - penalty);
          intel.securityLevel = Math.max(0, (intel.securityLevel ?? 0) - 2);

          entries.push({ label: "Spy Op Failed", delta: -penalty, unit: "credits", reason: `${def?.name ?? "Operation"} failed — agents compromised`, severity: "negative" });
          const msg: GameMessage = {
            id: `spyop-fail-${op.id}-${s.totalTicks}`,
            timestamp: s.gameDate, tick: s.totalTicks, category: "intel",
            title: `INTEL: ${(def?.name ?? "Operation").toUpperCase()} — FAILED`,
            body: `Operation compromised. Agents lost. Cover blown.\n\n-${penalty.toLocaleString()} credits, -2 security level`,
            read: false, priority: "high",
          };
          s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
        }
      }
    }
  }

  if (changed) {
    intel.operations = ops.filter(o => o.status === "active");
  }
}

function processMegaProjects(s: GameState, entries: TickEntry[]): void {
  const projects = s.megaProjects;
  if (!projects || projects.length === 0) return;

  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    if (proj.phase !== "construction") continue;

    const def = MEGA_PROJECTS.find(d => d.id === proj.projectId);
    if (!def) continue;

    const tickCost = Math.floor(def.constructionCost / def.ticksToComplete);
    const tickSteel = Math.floor(def.steelCost / def.ticksToComplete);

    if (s.resources.credits < tickCost || s.resources.steel < tickSteel) {
      entries.push({ label: "Mega-Project Stalled", delta: 0, unit: "", reason: `${def.name} — insufficient resources`, severity: "warning" });
      continue;
    }

    s.resources.credits -= tickCost;
    s.resources.steel -= tickSteel;
    const newProgress = proj.progress + 1;

    if (newProgress >= proj.totalRequired) {
      projects[i] = { ...proj, phase: "operational", progress: proj.totalRequired, completedTick: s.totalTicks };

      for (const effect of def.completionEffects) {
        if (effect.label.includes("happiness")) s.cityStats.happiness = Math.min(100, s.cityStats.happiness + 15);
        if (effect.label.includes("trade")) { s.resources.credits += 50000; recordCreditsEarned(s, 50000); }
        if (effect.label.includes("population")) s.cityStats.population += 50000;
        if (effect.label.includes("food")) s.rates.foodProduction += 60;
        if (effect.label.includes("power")) s.rates.powerGeneration += 200;
        if (effect.label.includes("defense")) s.cityStats.defenseRating = Math.min(100, s.cityStats.defenseRating + 10);
      }

      entries.push({ label: "MEGA-PROJECT COMPLETE", delta: 0, unit: "", reason: `${def.name} is now operational!`, severity: "positive" });
      const msg: GameMessage = {
        id: `megaproject-${proj.projectId}-${s.totalTicks}`,
        timestamp: s.gameDate, tick: s.totalTicks, category: "alert",
        title: `MEGA-PROJECT COMPLETE: ${def.name.toUpperCase()}`,
        body: `${def.description}\n\n${def.completionEffects.map(e => `${e.label}: ${e.description}`).join("\n")}`,
        read: false, priority: "high",
      };
      s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
      // Task #480: reactive news — mega-project completion is a headline fact.
      s.newsFeed = pushNewsItem(s.newsFeed, megaProjectCompleteNews(s, proj.projectId, def.name));
    } else {
      projects[i] = { ...proj, progress: newProgress, investedCredits: (proj.investedCredits ?? 0) + tickCost, investedSteel: (proj.investedSteel ?? 0) + tickSteel };
    }
  }
}

function processWarRoomOps(s: GameState, entries: TickEntry[]): void {
  const activeOps = s.activeWarOps;
  if (!activeOps || activeOps.length === 0) return;

  const completed: string[] = [];
  for (let i = 0; i < activeOps.length; i++) {
    const op = activeOps[i];
    if (op.ticksRemaining > 0) {
      activeOps[i] = { ...op, ticksRemaining: op.ticksRemaining - 1 };
      if (activeOps[i].ticksRemaining <= 0) {
        completed.push(op.opId);
        const def = WAR_ROOM_OPS.find(d => d.id === op.opId);
        if (def) {
          if (def.type === "intel") {
            const intel = s.intelligence;
            if (intel) intel.securityLevel = Math.min(100, (intel.securityLevel ?? 0) + 3);
            s.cityStats.crime = Math.max(0, s.cityStats.crime - 1);
            entries.push({ label: "Recon Complete", delta: 3, unit: "security", reason: def.name, severity: "positive" });
          } else if (def.type === "cyber") {
            s.cityStats.crime = Math.max(0, s.cityStats.crime - 3);
            s.cityStats.corruption = Math.max(0, s.cityStats.corruption - 1);
            entries.push({ label: "Cyber Op Complete", delta: -3, unit: "crime", reason: def.name, severity: "positive" });
          } else if (def.type === "training") {
            s.cityStats.lawOrder = Math.min(100, (s.cityStats.lawOrder ?? 50) + 3);
            s.cityStats.defenseRating = Math.min(100, s.cityStats.defenseRating + 1);
            entries.push({ label: "Training Complete", delta: 3, unit: "law & order", reason: def.name, severity: "positive" });
          } else if (def.type === "logistics") {
            s.resources.ammo = (s.resources.ammo ?? 0) + Math.floor(def.cost * 0.3);
            applyResourceDelta(s, "fuel", Math.floor(def.cost * 0.1));
            s.resources.credits += Math.floor(def.cost * 0.05);
            recordCreditsEarned(s, Math.floor(def.cost * 0.05));
            entries.push({ label: "Logistics Op Complete", delta: Math.floor(def.cost * 0.3), unit: "ammo", reason: def.name, severity: "positive" });
          } else if (def.type === "special") {
            if (def.id === "propaganda_drop") {
              s.cityStats.unrest = Math.max(0, s.cityStats.unrest - 4);
              s.cityStats.happiness = Math.min(100, s.cityStats.happiness + 1);
              entries.push({ label: "Propaganda Drop", delta: -4, unit: "unrest", reason: def.name, severity: "positive" });
            } else if (def.id === "false_flag_op") {
              const randFaction = (s.factions ?? [])[Math.floor(Math.random() * (s.factions?.length ?? 1))];
              if (randFaction) randFaction.loyalty = Math.max(0, (randFaction.loyalty ?? 50) - 10);
              entries.push({ label: "False Flag Op", delta: -10, unit: "faction loyalty", reason: def.name, severity: "neutral" });
            } else {
              s.cityStats.unrest = Math.max(0, s.cityStats.unrest - 1);
              entries.push({ label: "Special Op Complete", delta: -1, unit: "unrest", reason: def.name, severity: "positive" });
            }
          } else if (def.type === "defensive") {
            const gain = Math.ceil(def.defenseBonus * 0.5);
            s.warOpDefenseBonus = Math.min(30, (s.warOpDefenseBonus ?? 0) + gain);
            entries.push({ label: "Fortification Complete", delta: gain, unit: "defense (permanent)", reason: def.name, severity: "positive" });
          } else if (def.type === "offensive") {
            s.cityStats.unrest = Math.max(0, s.cityStats.unrest - 2);
            const offGain = Math.max(1, Math.ceil(def.defenseBonus * 0.3));
            s.warOpDefenseBonus = Math.min(30, (s.warOpDefenseBonus ?? 0) + offGain);
            entries.push({ label: "Offensive Op Complete", delta: -2, unit: "unrest (show of force)", reason: def.name, severity: "positive" });
          } else if (def.type === "aerial") {
            const aerGain = Math.max(1, Math.ceil(def.defenseBonus * 0.5));
            s.warOpDefenseBonus = Math.min(30, (s.warOpDefenseBonus ?? 0) + aerGain);
            entries.push({ label: "Air Op Complete", delta: aerGain, unit: "defense (permanent)", reason: def.name, severity: "positive" });
          } else if (def.type === "naval") {
            applyResourceDelta(s, "fuel", Math.floor(def.cost * 0.05));
            const navGain = Math.max(1, Math.ceil(def.defenseBonus * 0.4));
            s.warOpDefenseBonus = Math.min(30, (s.warOpDefenseBonus ?? 0) + navGain);
            entries.push({ label: "Naval Op Complete", delta: navGain, unit: "defense (permanent)", reason: def.name, severity: "positive" });
          } else if (def.type === "siege") {
            const siegeGain = Math.max(1, Math.ceil(def.defenseBonus * 0.6));
            s.warOpDefenseBonus = Math.min(30, (s.warOpDefenseBonus ?? 0) + siegeGain);
            s.cityStats.unrest = Math.max(0, s.cityStats.unrest - 1);
            entries.push({ label: "Siege Op Complete", delta: siegeGain, unit: "defense (permanent)", reason: def.name, severity: "positive" });
          } else {
            entries.push({ label: "War Room Op Complete", delta: def.defenseBonus, unit: "defense", reason: def.name, severity: "positive" });
          }
        }
      }
    }
  }

  if (completed.length > 0) {
    s.activeWarOps = activeOps.filter(o => o.ticksRemaining > 0);
  }
}

function processApprovalConsequences(s: GameState, entries: TickEntry[]): void {
  if (s.totalTicks % 8 !== 0) return;

  const pol = s.politics ?? createDefaultPoliticsState();
  const approval = pol.approval?.citizens ?? 50;

  if (approval < 20 && Math.random() < 0.3) {
    s.cityStats.unrest = Math.min(100, s.cityStats.unrest + 3);
    s.cityStats.happiness = Math.max(0, s.cityStats.happiness - 2);
    entries.push({ label: "Low Approval Crisis", delta: 3, unit: "unrest", reason: `Approval at ${approval}% — citizens demand change`, severity: "negative" });

    if (approval < 10 && Math.random() < 0.2) {
      const msg: GameMessage = {
        id: `approval-crisis-${s.totalTicks}`,
        timestamp: s.gameDate, tick: s.totalTicks, category: "alert",
        title: "POLITICAL CRISIS: CONFIDENCE VOTE THREATENED",
        body: `Your approval rating has dropped to ${approval}%. Faction leaders are openly questioning your fitness for command. If this continues, a formal challenge to your authority is inevitable.`,
        read: false, priority: "high",
      };
      s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
    }
  } else if (approval > 80) {
    s.cityStats.happiness = Math.min(100, s.cityStats.happiness + 1);
    if (Math.random() < 0.15) {
      s.cityStats.unrest = Math.max(0, s.cityStats.unrest - 1);
      entries.push({ label: "High Approval Bonus", delta: -1, unit: "unrest", reason: `Approval at ${approval}% — citizens trust your leadership`, severity: "positive" });
    }
  }
}

function processReputationEffects(s: GameState, entries: TickEntry[]): void {
  if (s.totalTicks % 12 !== 0) return;
  const rep = s.politics?.reputation;
  if (!rep) return;

  // NOTE: passive faction-loyalty drift used to live here. Task #379 moved it
  // to processIntrigueTick (computeLoyaltyDrift), which drives loyalty from
  // per-faction ideological alignment rather than a handful of axis thresholds.
  // This function retains only the city-wide cityStats consequences of the
  // regime's reputation.

  if (rep.fear > 80) {
    s.cityStats.unrest = Math.max(0, s.cityStats.unrest - 1);
    s.cityStats.happiness = Math.max(0, s.cityStats.happiness - 1);
  }
  if (rep.mercy > 80) {
    s.cityStats.happiness = Math.min(100, s.cityStats.happiness + 1);
  }
  if (rep.populism > 80 && rep.stability < 40) {
    s.cityStats.unrest = Math.min(100, s.cityStats.unrest + 1);
  }
}

function processPlayerProgression(s: GameState, entries: TickEntry[]): void {
  if (!s.player) return;

  if (s.totalTicks % 4 !== 0) return;

  const baseXp = 1;
  const filledCircle = Math.min(6, (s.innerCircle?.members?.length ?? 0));
  const governanceBonus = Math.floor(filledCircle * 0.5);
  const factionBonus = Math.floor((s.factions?.filter((f: any) => f.loyalty > 60).length ?? 0) * 0.3);
  const tickXp = baseXp + governanceBonus + factionBonus;

  if (tickXp > 0) {
    s.player.xp += tickXp;
  }

  let leveledUp = false;
  while (s.player.xp >= s.player.xpToNext && s.player.level < 50) {
    s.player.xp -= s.player.xpToNext;
    s.player.level += 1;
    s.player.xpToNext = playerXpForLevel(s.player.level);
    s.player.attributePoints += 1;
    if (s.player.level % 3 === 0) {
      s.player.skillPoints += 1;
    }
    leveledUp = true;
  }

  if (leveledUp) {
    const levelMsg: import("@/engine/types").GameMessage = {
      id: `player-levelup-${s.player.level}-${s.totalTicks}`,
      timestamp: s.gameDate,
      tick: s.totalTicks,
      category: "intel",
      title: `⭐ COMMANDER LEVEL ${s.player.level}`,
      body: `Your experience governing this wasteland has been recognized.\n\n+1 Attribute Point${s.player.level % 3 === 0 ? "\n+1 Skill Point" : ""}\n\nVisit DOSSIER to allocate your new points.`,
      read: false,
      priority: "high",
    };
    s.messages = [levelMsg, ...(s.messages ?? [])].slice(0, 200);
    entries.push({ label: `Commander Level ${s.player.level}`, delta: 0, unit: "", reason: "level_up", severity: "positive" });
  }
}

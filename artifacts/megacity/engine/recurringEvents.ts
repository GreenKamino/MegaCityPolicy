import type { GameEvent, GameState } from "@/engine/types";
import { CRISIS_THRESHOLDS } from "@/engine/crisisThresholds";

// Task #459: which player-facing events are RECURRING condition/stat-triggered crises —
// i.e. the deterministic / persistent-condition spawners that Task #452 (bio
// stat gates in processBiosphere) and Task #455 (officer incidents in
// processOfficerEvents) put on a re-trigger cooldown after a player clear.
// Dismissing one of these only buys a breather: the spawner WILL re-raise the
// same id once its cooldown elapses if the underlying condition is still bad.
// One-off events (chains, wildlands rolls, condition-trigger flavor events,
// intrigue plots...) are deliberately NOT listed here — dismissing them is
// final, so no "it will return" hint should ever show for them.
//
// This is a leaf module on purpose (imports types only): eventResolution.ts
// and the EventCard UI both read it, and neither may pull in tickProcessors
// (require-cycle risk). The stillCritical predicates therefore MIRROR the
// trigger conditions in tickProcessors.ts (processBiosphere lines around the
// canTrigger gates, and processOfficerEvents' roster filters). If a threshold
// changes there, update it here too — recurringDismissalHint.test.ts pins the
// biosphere pair against the real tick pipeline as a drift backstop.
//
// Only NEGATIVE recurring events get hints. The positive recurring ids
// (biosphere_rare_discovery, officer_excellence, officer_popular_hero,
// officer_loyalty_dividend) are omitted: "this reward will return" is not a
// warning anyone needs.

type RecurringEventDef = {
  // True while the persistent condition behind the event is still bad enough
  // for the spawner to re-fire it after the re-trigger cooldown.
  stillCritical: (s: GameState) => boolean;
  // Short lowercase phrase completing the sentence
  // "This warning will return while <phrase>."
  phrase: string;
  // Concise, player-facing structural fix. This is deliberately separate from
  // response effects: dismissing a repeat crisis should teach the player what
  // to change without altering what any event response does.
  remediation: string;
};

export type RecurrenceFixTarget =
  | { screen: "wildlands" }
  | { screen: "construction"; category: string; highlight?: string }
  | { screen: "officers" };

const appointed = (s: GameState) => (s.officers ?? []).filter((o) => o.appointed);

// The repeat card stays open while the player visits the management screen, so
// these targets deliberately navigate without resolving the event. Biosphere
// crises point to the most relevant management surface; officer crises all
// share the officer roster.
const RECURRENCE_FIX_TARGETS: Record<string, RecurrenceFixTarget> = {
  biosphere_disease_outbreak: {
    screen: "construction",
    category: "biosphere",
    highlight: "atmosphericBiofilterStations",
  },
  biosphere_ecosystem_collapse: { screen: "wildlands" },
  biosphere_toxic_bloom: {
    screen: "construction",
    category: "biosphere",
    highlight: "atmosphericBiofilterStations",
  },
  officer_embezzlement: { screen: "officers" },
  officer_power_grab: { screen: "officers" },
  officer_rivalry: { screen: "officers" },
  officer_defection: { screen: "officers" },
  officer_brutality: { screen: "officers" },
  officer_systemic_failure: { screen: "officers" },
  officer_corruption_ring: { screen: "officers" },
};

export const RECURRING_EVENT_DEFS: Record<string, RecurringEventDef> = {
  // ── Biosphere stat gates (processBiosphere, Task #452) ──────────────────
  biosphere_disease_outbreak: {
    stillCritical: (s) => (s.cityStats.diseaseRisk ?? 0) >= 75,
    phrase: "disease risk stays critical",
    remediation: "Raise the biosphere with reclamation domes or biofilter stations, and run Mass Vaccination Drive to lower disease risk.",
  },
  biosphere_ecosystem_collapse: {
    stillCritical: (s) => (s.cityStats.biosphere ?? 0) <= 15,
    phrase: "the biosphere stays critical",
    remediation: "Invest in reclamation domes, decontamination forests, and a Wildlands restoration project to rebuild the biosphere.",
  },
  biosphere_toxic_bloom: {
    stillCritical: (s) =>
      (s.cityStats.diseaseRisk ?? 0) >= 50 && (s.cityStats.biosphere ?? 0) <= 30,
    phrase: "disease risk stays high and the biosphere stays degraded",
    remediation: "Build biofilter stations or bioremediation plants, then lower disease risk before toxic blooms recur.",
  },
  // Condition-based core crises (eventTriggers.ts). Dismissing these is only
  // a breather while the same trigger condition remains active. Population
  // boom and the later story triggers are intentionally omitted: they are
  // transient opportunities, not persistent crisis warnings.
  crime_wave_surge: {
    stillCritical: (s) => s.cityStats.crime >= CRISIS_THRESHOLDS.crime.trigger,
    phrase: "crime stays critical",
    remediation: "Invest in security and public services that lower crime instead of relying on another emergency crackdown.",
  },
  food_crisis: {
    stillCritical: (s) => s.resources.food <= CRISIS_THRESHOLDS.food.trigger,
    phrase: "food reserves stay critical",
    remediation: "Expand food production and reserves so the city is not depending on emergency relief.",
  },
  power_crisis: {
    stillCritical: (s) => s.resources.power <= CRISIS_THRESHOLDS.power.trigger,
    phrase: "power output stays critical",
    remediation: "Expand reliable power generation and storage until normal output stays above demand.",
  },
  unrest_boiling: {
    stillCritical: (s) => s.cityStats.unrest >= CRISIS_THRESHOLDS.unrest.trigger,
    phrase: "unrest stays at boiling point",
    remediation: "Address the underlying shortages and public-order pressure; repeated crackdowns only buy time.",
  },
  health_emergency: {
    stillCritical: (s) => s.cityStats.diseaseRisk >= CRISIS_THRESHOLDS.diseaseRisk.trigger,
    phrase: "disease risk stays critical",
    remediation: "Build medical capacity, improve sanitation, and use health edicts to bring disease risk down.",
  },
  corruption_endemic: {
    stillCritical: (s) => s.cityStats.corruption >= CRISIS_THRESHOLDS.corruption.trigger,
    phrase: "corruption stays endemic",
    remediation: "Remove corrupt officials and strengthen oversight so the corruption pressure cannot rebuild.",
  },
  // Condition-based core crisis (eventTriggers.ts). Dismissing it is only a
  // breather while infrastructure remains below the same trigger threshold.
  infrastructure_decay: {
    stillCritical: (s) =>
      (s.cityStats.infrastructureHealth ?? 0) <= CRISIS_THRESHOLDS.infrastructureHealth.trigger,
    phrase: "infrastructure health stays below 30%",
    remediation: "Fund infrastructure construction and maintenance to restore the city's underlying health.",
  },

  // ── Officer incidents (processOfficerEvents, Task #455) ─────────────────
  officer_embezzlement: {
    stillCritical: (s) => appointed(s).some((o) => o.corruption > 25),
    phrase: "corrupt officers remain in post",
    remediation: "Relieve corrupt officers and appoint cleaner replacements; a quiet dismissal alone will not remove the rot.",
  },
  officer_power_grab: {
    stillCritical: (s) => appointed(s).some((o) => o.ambition > 55 && o.loyalty < 50),
    phrase: "ambitious, disloyal officers remain in post",
    remediation: "Reassign or relieve ambitious, disloyal officers and appoint loyal replacements before they consolidate power.",
  },
  officer_rivalry: {
    stillCritical: (s) => {
      const roster = appointed(s);
      const ids = new Set(roster.map((o) => o.id));
      return roster.some((o) => (o.rivals ?? []).some((rid) => ids.has(rid)));
    },
    phrase: "rival officers keep serving together",
    remediation: "Transfer or relieve one of the rivals so the same pair no longer serves in the same command structure.",
  },
  officer_defection: {
    stillCritical: (s) => appointed(s).some((o) => o.loyalty < 40 && o.ambition > 45),
    phrase: "disloyal officers remain in post",
    remediation: "Relieve disloyal officers and appoint loyal replacements; buying loyalty only delays the risk.",
  },
  officer_brutality: {
    stillCritical: (s) => appointed(s).some((o) => o.fearFactor > 22),
    phrase: "fear-driven officers remain in post",
    remediation: "Relieve fear-driven officers and replace them; training cannot fix a command structure built on fear.",
  },
  officer_systemic_failure: {
    stillCritical: (s) => appointed(s).filter((o) => o.competence < 45).length >= 3,
    phrase: "incompetent officers remain in post",
    remediation: "Relieve low-competence officers and fill the posts with capable replacements to clear the bottleneck.",
  },
  officer_corruption_ring: {
    stillCritical: (s) =>
      appointed(s).some(
        (o) => o.corruption > 20 && (o.rank === "chief_director" || o.rank === "commissioner"),
      ),
    phrase: "corrupt senior officers remain in post",
    remediation: "Remove corrupt senior officers and rebuild the chain of command; quiet deals leave the ring intact.",
  },
};

// Stable id prefix for the dismissal-hint inbox message. The news ticker
// (useNewsHeadlines) matches on this prefix to echo the hint on-screen once —
// same pattern as "power-brownout-warning-".
export const DISMISS_RECURRENCE_HINT_ID_PREFIX = "dismiss-recurrence-hint-";

// Returns the "this warning will return" phrase for a recurring stat-triggered
// event whose underlying condition is STILL critical, or null when no hint
// should be shown (one-off event, or the player already fixed the stat so the
// dismissal genuinely ends it).
export function getRecurrenceHintPhrase(
  state: GameState,
  event: Pick<GameEvent, "id">,
): string | null {
  const def = RECURRING_EVENT_DEFS[event.id];
  if (!def) return null;
  return def.stillCritical(state) ? def.phrase : null;
}

// Returns the structural fix for a recurring crisis that is still critical.
// Keeping this alongside getRecurrenceHintPhrase ensures the card never
// recommends a remediation for a recovered condition or a one-off event.
export function getRecurrenceRemediation(
  state: GameState,
  event: Pick<GameEvent, "id">,
): string | null {
  const def = RECURRING_EVENT_DEFS[event.id];
  if (!def) return null;
  return def.stillCritical(state) ? def.remediation : null;
}

// Returns the management screen for a repeat crisis whose condition is still
// active. Keep this gated by the same predicate as the remediation text so a
// stale card cannot offer a misleading fix after the player has recovered.
export function getRecurrenceFixTarget(
  state: GameState,
  event: Pick<GameEvent, "id">,
): RecurrenceFixTarget | null {
  if (!getRecurrenceRemediation(state, event)) return null;
  return RECURRENCE_FIX_TARGETS[event.id] ?? null;
}

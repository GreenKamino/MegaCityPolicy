// Task #480: reactive city news. The engine records short ticker-ready facts
// about what the player and the simulation actually did — edicts enacted or
// lapsed, notable construction, mega-project completions, events resolved with
// the chosen orders, season turnover — into state.newsFeed at the moment the
// fact happens. useNewsHeadlines mirrors each entry onto the scrolling TV-news
// ticker exactly once via a seen-id gate (the established echo pattern: the
// engine emits, the UI never re-detects the transition itself).
//
// Copy rules: dry dystopian broadcast voice, ALL-CAPS tags, no emojis, no
// exclamation marks. Headlines embed specifics (names, counts) so distinct
// facts produce distinct strings — NewsContext dedupes exact strings.

import type { GameState } from "@/engine/types";
import type { Season } from "@/engine/weather";

export type NewsFeedItem = {
  // Stable unique id — callers bake in a discriminator (edict id, building
  // key, event id) plus the tick so two different facts never collide.
  id: string;
  headline: string;
  tick: number;
};

// Ring-buffer cap. The feed is a recent-facts window, not an archive — the
// inbox keeps the full record. Mirrored in sanitizer ARRAY_CAPS.
export const NEWS_FEED_CAP = 30;

// Prepend-and-cap, newest first (same convention as state.messages). Never
// mutates the input array.
export function pushNewsItem(
  feed: NewsFeedItem[] | undefined,
  item: NewsFeedItem,
): NewsFeedItem[] {
  const existing = feed ?? [];
  // Idempotency guard: if the exact id is already present (e.g. a reducer
  // re-runs in React strict mode), keep the feed unchanged.
  if (existing.some((n) => n.id === item.id)) return existing;
  return [item, ...existing].slice(0, NEWS_FEED_CAP);
}

// ── Headline builders ────────────────────────────────────────────────────────
// Centralized so every emission site shares one voice and the copy rules are
// enforced in one place.

export function edictEnactedNews(state: GameState, edictId: string, edictName: string): NewsFeedItem {
  return {
    id: `news-edict-enact-${edictId}-${state.totalTicks}`,
    headline: `COMMAND DESK: EDICT ENACTED — "${edictName.toUpperCase()}" NOW IN FORCE CITYWIDE — COMPLIANCE OFFICES BRIEFED`,
    tick: state.totalTicks,
  };
}

export function edictLapsedNews(state: GameState, edictId: string, edictName: string): NewsFeedItem {
  return {
    id: `news-edict-lapse-${edictId}-${state.totalTicks}`,
    headline: `COMMAND DESK: EDICT "${edictName.toUpperCase()}" HAS RUN ITS COURSE — PROVISIONS STAND DOWN — CLERKS FILE THE PAPERWORK`,
    tick: state.totalTicks,
  };
}

// Task #581: procurement deliveries and failures were invisible — these give
// the TV ticker a line for both outcomes. instanceId keeps ids unique even
// if two awards of the same template land on the same tick.
export function contractDeliveredNews(state: GameState, contractName: string, summary: string, instanceId: string): NewsFeedItem {
  return {
    id: `news-contract-delivered-${instanceId}-${state.totalTicks}`,
    headline: `PROCUREMENT DESK: "${contractName.toUpperCase()}" DELIVERED IN FULL — ${summary.toUpperCase()} — DOCKMASTERS STAMP THE MANIFEST`,
    tick: state.totalTicks,
  };
}

export function contractExpiredNews(state: GameState, contractName: string, instanceId: string): NewsFeedItem {
  return {
    id: `news-contract-expired-${instanceId}-${state.totalTicks}`,
    headline: `PROCUREMENT DESK: CONTRACT "${contractName.toUpperCase()}" SCRAPPED — SCHEDULE BLOWN THREEFOLD, CREWS STOOD DOWN — CLERKS FILE IT UNDER FAILURE`,
    tick: state.totalTicks,
  };
}

// Task #534: themed coverage for the Accelerated Training Doctrine edict —
// the generic enact/lapse lines above don't convey "the barracks are running
// hot / standing down". Same id schemes as the generic builders (enact/lapse
// per edict per tick) so the pushNewsItem idempotency guard holds no matter
// which builder an emission site picks.
export function trainingDoctrineEnactedNews(state: GameState, edictId: string): NewsFeedItem {
  return {
    id: `news-edict-enact-${edictId}-${state.totalTicks}`,
    headline: `GARRISON DESK: ACCELERATED TRAINING DOCTRINE IN FORCE — BARRACKS RUN HOT — DRILL INSTRUCTORS WAIVE REST ROTATIONS AND BILL THE OVERTIME`,
    tick: state.totalTicks,
  };
}

export function trainingDoctrineLapsedNews(state: GameState, edictId: string): NewsFeedItem {
  return {
    id: `news-edict-lapse-${edictId}-${state.totalTicks}`,
    headline: `GARRISON DESK: ACCELERATED TRAINING DOCTRINE LAPSES — BARRACKS STAND DOWN — NEW TRAINING ORDERS RETURN TO THE STANDARD DRILL SCHEDULE`,
    tick: state.totalTicks,
  };
}

export function firstBuildingNews(state: GameState, buildingKey: string, buildingName: string): NewsFeedItem {
  return {
    id: `news-build-first-${buildingKey}-${state.totalTicks}`,
    headline: `CONSTRUCTION: CITY'S FIRST ${buildingName.toUpperCase()} COMMISSIONED — RIBBON CUT, SCAFFOLDING ALREADY RUSTING`,
    tick: state.totalTicks,
  };
}

export function constructionSurgeNews(state: GameState, buildingKey: string, buildingName: string, count: number): NewsFeedItem {
  return {
    id: `news-build-surge-${buildingKey}-${state.totalTicks}`,
    headline: `CONSTRUCTION: ${count} NEW ${buildingName.toUpperCase()} UNITS BREAK GROUND IN ONE ORDER — CREWS ON DOUBLE SHIFTS`,
    tick: state.totalTicks,
  };
}

export function megaProjectCompleteNews(state: GameState, projectId: string, projectName: string): NewsFeedItem {
  return {
    id: `news-mega-complete-${projectId}-${state.totalTicks}`,
    headline: `MEGA-PROJECT OPERATIONAL: ${projectName.toUpperCase()} COMES ONLINE — DECADES OF BUDGET OVERRUNS OFFICIALLY FORGIVEN`,
    tick: state.totalTicks,
  };
}

export function goldenAgeRecoveryNews(state: GameState): NewsFeedItem {
  return {
    id: `news-golden-age-recovery-${state.totalTicks}`,
    headline: "PROSPERITY DESK: GOLDEN-AGE COVERAGE CLEARED FOR BROADCAST — BIOSPHERE AND HOUSING BARRIERS DOWN — CELEBRATIONS AUTHORIZED WITHIN BUDGET",
    tick: state.totalTicks,
  };
}

export function eventResolvedNews(
  state: GameState,
  eventId: string,
  eventTitle: string,
  responseLabel: string,
): NewsFeedItem {
  return {
    id: `news-resolved-${eventId}-${state.totalTicks}`,
    headline: `COMMANDER'S ORDERS: "${eventTitle.toUpperCase()}" RESOLVED — DIRECTIVE: ${responseLabel.toUpperCase()} — STAFF EXECUTE WITHOUT COMMENT`,
    tick: state.totalTicks,
  };
}

export function biosphereCrisisRiskRisingNews(
  state: GameState,
  tier: "high" | "easing",
): NewsFeedItem {
  const copy = tier === "high"
    ? "NATURE CRISIS RISK HIGH — THE BIOSPHERE HAS SLIPPED INTO THE HIGHEST CRISIS BAND — WILDLANDS RESPONSE TEAMS ADVISED"
    : "NATURE CRISIS RISK RISING — BIOSPHERE RECOVERY HAS LOST GROUND — ECOLOGY DESK FLAGS A HIGHER CHANCE OF NEW CRISES";
  return {
    id: `news-biosphere-risk-rising-${tier}-${state.totalTicks}`,
    headline: `NATURE DESK: ${copy}`,
    tick: state.totalTicks,
  };
}

// Task #493: war, diplomacy, and intrigue coverage. Several phrasing variants
// per category, picked deterministically by tick so replays and strict-mode
// double-runs produce the same string for the same fact.
function pick(state: GameState, variants: string[]): string {
  return variants[state.totalTicks % variants.length];
}

export function warDeclaredNews(state: GameState, targetId: string, targetName: string): NewsFeedItem {
  const t = targetName.toUpperCase();
  return {
    id: `news-war-declared-${targetId}-${state.totalTicks}`,
    headline: pick(state, [
      `WAR DESK: MEGACITY DECLARES WAR ON ${t} — MOBILIZATION ORDERS POSTED — CITIZENS ADVISED TO CARRY ON`,
      `WAR DESK: HOSTILITIES OPEN AGAINST ${t} — RECRUITMENT KIOSKS EXTEND HOURS — DIPLOMACY FILED UNDER 'LATER'`,
      `WAR DESK: THE COMMAND DECLARES WAR ON ${t} — SIRENS TESTED TWICE — MORALE OFFICERS DEPLOYED PREEMPTIVELY`,
    ]),
    tick: state.totalTicks,
  };
}

// Task #496: wars the engine starts between rival cities (NPC-initiated —
// the player is not the declarer, so the "MEGACITY DECLARES WAR" copy above
// would be wrong). Neutral third-party phrasing; keyed by war id so it can
// never collide with the player-declaration id (keyed by target id).
export function rivalWarDeclaredNews(state: GameState, warId: string, nameA: string, nameB: string): NewsFeedItem {
  const a = nameA.toUpperCase();
  const b = nameB.toUpperCase();
  return {
    id: `news-war-declared-${warId}-${state.totalTicks}`,
    headline: pick(state, [
      `WAR DESK: ${a} DECLARES WAR ON ${b} — BORDER POSTS REPORTED UNDER FIRE — OBSERVERS DISPATCHED, BINOCULARS ISSUED`,
      `WAR DESK: HOSTILITIES ERUPT BETWEEN ${a} AND ${b} — BOTH CAPITALS BLAME THE OTHER — MAPS UPDATED IN RED INK`,
      `WAR DESK: ${a} AND ${b} ENTER OPEN CONFLICT — TRADE CARAVANS REROUTED — NEUTRALITY DESK FIELDS CALLS FROM BOTH SIDES`,
    ]),
    tick: state.totalTicks,
  };
}

export function warPeaceNews(state: GameState, warId: string, enemyName: string): NewsFeedItem {
  const t = enemyName.toUpperCase();
  return {
    id: `news-war-peace-${warId}-${state.totalTicks}`,
    headline: pick(state, [
      `PEACE ACCORD: TERMS CONCLUDED WITH ${t} — GUNS FALL SILENT — PAPERWORK BEGINS IMMEDIATELY`,
      `PEACE ACCORD: WAR WITH ${t} ENDS AT THE NEGOTIATING TABLE — VETERANS ISSUED COMMEMORATIVE RATION COUPONS`,
      `PEACE ACCORD: CEASEFIRE WITH ${t} SIGNED IN TRIPLICATE — BOTH SIDES CLAIM VICTORY — HISTORIANS UNDECIDED`,
    ]),
    tick: state.totalTicks,
  };
}

// War-driven migrant waves: fired when a war escalates far enough to
// displace civilians toward MegaCity. Keyed by war id + tick.
export function refugeeWaveNews(state: GameState, warId: string, nameA: string, nameB: string): NewsFeedItem {
  const a = nameA.toUpperCase();
  const b = nameB.toUpperCase();
  return {
    id: `news-refugee-wave-${warId}-${state.totalTicks}`,
    headline: pick(state, [
      `MIGRATION DESK: WAR BETWEEN ${a} AND ${b} SENDS THOUSANDS TOWARD MEGACITY — GATES AWAIT THE COMMAND'S DECISION`,
      `MIGRATION DESK: REFUGEE COLUMNS FLEE THE ${a}–${b} FRONT — WALL SENSORS COUNT FEET, NOT FACES`,
      `MIGRATION DESK: DISPLACED CIVILIANS FROM THE ${a}–${b} WAR MASS OUTSIDE THE PERIMETER — SOUP RATIONS PRE-POSITIONED`,
    ]),
    tick: state.totalTicks,
  };
}

export function warExhaustionNews(state: GameState, warId: string, nameA: string, nameB: string): NewsFeedItem {
  const a = nameA.toUpperCase();
  const b = nameB.toUpperCase();
  return {
    id: `news-war-exhaust-${warId}-${state.totalTicks}`,
    headline: pick(state, [
      `WAR DESK: THE WAR BETWEEN ${a} AND ${b} COLLAPSES UNDER ITS OWN WEIGHT — BOTH ARMIES SIMPLY GO HOME`,
      `WAR DESK: HOSTILITIES BETWEEN ${a} AND ${b} END BY EXHAUSTION — NO TREATY, NO PARADE, NO SURVIVING AGENDA`,
    ]),
    tick: state.totalTicks,
  };
}

export function totalWarNews(state: GameState, warId: string, nameA: string, nameB: string): NewsFeedItem {
  const a = nameA.toUpperCase();
  const b = nameB.toUpperCase();
  return {
    id: `news-war-total-${warId}-${state.totalTicks}`,
    headline: pick(state, [
      `WAR DESK: ${a} AND ${b} ESCALATE TO TOTAL WAR — FRONT LINES REDRAWN HOURLY — MAPS SOLD AS-IS`,
      `WAR DESK: TOTAL WAR DECLARED BETWEEN ${a} AND ${b} — ALL RESTRAINT OFFICIALLY RETIRED`,
    ]),
    tick: state.totalTicks,
  };
}

export function warConcludedNews(state: GameState, warId: string, nameA: string, nameB: string): NewsFeedItem {
  const a = nameA.toUpperCase();
  const b = nameB.toUpperCase();
  return {
    id: `news-war-concluded-${warId}-${state.totalTicks}`,
    headline: pick(state, [
      `WAR DESK: HOSTILITIES BETWEEN ${a} AND ${b} END — DISPUTED TERRITORY NOW UNDER MEGACITY ADMINISTRATION`,
      `WAR DESK: WAR BETWEEN ${a} AND ${b} CONCLUDED — FLAGS SWAPPED QUIETLY — OCCUPYING CLERKS MOVE IN`,
    ]),
    tick: state.totalTicks,
  };
}

export function annexationNews(state: GameState, targetId: string, targetName: string): NewsFeedItem {
  const t = targetName.toUpperCase();
  return {
    id: `news-annex-${targetId}-${state.totalTicks}`,
    headline: pick(state, [
      `TERRITORIAL DESK: ${t} FORMALLY ANNEXED — CITIZENS ISSUED NEW ID CHIPS — OLD FLAG ARCHIVED`,
      `TERRITORIAL DESK: ${t} ABSORBED INTO MEGACITY ADMINISTRATION — WELCOME PAMPHLETS PRINTED IN ONE LANGUAGE`,
      `TERRITORIAL DESK: ANNEXATION OF ${t} COMPLETE — BORDERS REDRAWN — CARTOGRAPHERS BILL OVERTIME`,
    ]),
    tick: state.totalTicks,
  };
}

export function occupationNews(state: GameState, targetId: string, targetName: string): NewsFeedItem {
  const t = targetName.toUpperCase();
  return {
    id: `news-occupy-${targetId}-${state.totalTicks}`,
    headline: pick(state, [
      `TERRITORIAL DESK: ${t} PLACED UNDER MILITARY OCCUPATION — GARRISON DEPLOYED — TRIBUTE SCHEDULE POSTED`,
      `TERRITORIAL DESK: OCCUPATION OF ${t} BEGINS — LOCAL LEADERSHIP SURRENDERS — CURFEW EFFECTIVE IMMEDIATELY`,
      `TERRITORIAL DESK: ${t} NOW ADMINISTERED BY MEGACITY — OFFICIAL TERM: 'STABILIZED'`,
    ]),
    tick: state.totalTicks,
  };
}

export function treatySignedNews(state: GameState, negotiationId: string, partnerName: string, dealTitle: string): NewsFeedItem {
  const p = partnerName.toUpperCase();
  const d = dealTitle.toUpperCase();
  return {
    id: `news-treaty-signed-${negotiationId}-${state.totalTicks}`,
    headline: pick(state, [
      `DIPLOMATIC WIRE: "${d}" CONCLUDED WITH ${p} — SIGNATURES DRY — INTERPRETATIONS ALREADY DIVERGING`,
      `DIPLOMATIC WIRE: ACCORD REACHED WITH ${p} — ${d} ENTERS INTO FORCE — AMBASSADORS EXCHANGE GUARDED SMILES`,
      `DIPLOMATIC WIRE: ${p} SIGNS "${d}" — CHAMPAGNE SUBSTITUTE SERVED — RELATIONS DESCRIBED AS 'FUNCTIONAL'`,
    ]),
    tick: state.totalTicks,
  };
}

export function treatyCollapsedNews(state: GameState, negotiationId: string, partnerName: string, dealTitle: string): NewsFeedItem {
  const p = partnerName.toUpperCase();
  const d = dealTitle.toUpperCase();
  return {
    id: `news-treaty-collapsed-${negotiationId}-${state.totalTicks}`,
    headline: pick(state, [
      `DIPLOMATIC WIRE: TALKS WITH ${p} COLLAPSE — "${d}" SHELVED — AMBASSADORS RECALLED FOR 'CONSULTATIONS'`,
      `DIPLOMATIC WIRE: NEGOTIATIONS WITH ${p} FAIL — "${d}" DEAD ON THE TABLE — DELEGATES DEPART SEPARATELY`,
    ]),
    tick: state.totalTicks,
  };
}

export function coupLaunchedNews(state: GameState, plotId: string, factionName: string): NewsFeedItem {
  const f = factionName.toUpperCase();
  return {
    id: `news-coup-${plotId}-${state.totalTicks}`,
    headline: pick(state, [
      `CRISIS DESK: ${f} MOVES AGAINST THE COMMAND — COUP ATTEMPT UNDER WAY — LOYALIST UNITS CONVERGE ON THE SPIRE`,
      `CRISIS DESK: COUP ATTEMPT BY ${f} — GOVERNMENT DISTRICT SEALED — BROADCASTS CONTINUE AS NORMAL, INSISTENTLY`,
    ]),
    tick: state.totalTicks,
  };
}

export function terrorStrikeNews(state: GameState, plotId: string, factionName: string): NewsFeedItem {
  const f = factionName.toUpperCase();
  return {
    id: `news-terror-${plotId}-${state.totalTicks}`,
    headline: pick(state, [
      `CRISIS DESK: TERROR ATTACK STRIKES THE CITY — ${f} CLAIMS RESPONSIBILITY — MARSHALS CORDON THE SECTOR`,
      `CRISIS DESK: EXPLOSION ROCKS THE LOWER LEVELS — ${f} CELL SUSPECTED — CASUALTY FIGURES PENDING CLEARANCE`,
    ]),
    tick: state.totalTicks,
  };
}

export function assassinationAttemptNews(state: GameState, plotId: string, factionName: string): NewsFeedItem {
  const f = factionName.toUpperCase();
  return {
    id: `news-assass-${plotId}-${state.totalTicks}`,
    headline: pick(state, [
      `CRISIS DESK: ASSASSINATION ATTEMPT ON THE COMMANDER — ${f} OPERATIVES IMPLICATED — SECURITY POSTURE ELEVATED`,
      `CRISIS DESK: SHOTS FIRED AT THE COMMAND SPIRE — ${f} PLOT SUSPECTED — OFFICIAL STATUS: 'UNRUFFLED'`,
    ]),
    tick: state.totalTicks,
  };
}

export function plotFoiledNews(state: GameState, plotId: string, factionName: string, plotLabel: string): NewsFeedItem {
  const f = factionName.toUpperCase();
  const l = plotLabel.toUpperCase();
  return {
    id: `news-plot-foiled-${plotId}-${state.totalTicks}`,
    headline: pick(state, [
      `SECURITY DESK: ${l} PLOT BY ${f} DISMANTLED — RINGLEADERS DETAINED — CONFESSIONS SCHEDULED`,
      `SECURITY DESK: MARSHALS BREAK UP ${f} ${l} PLOT — SAFEHOUSES RAIDED — EVIDENCE CATALOGUED IN BULK`,
    ]),
    tick: state.totalTicks,
  };
}

const SEASON_NEWS_COPY: Record<Season, string> = {
  spring:
    "SEASON TURNOVER: SPRING REACHES THE CITY — ATMOSPHERIC PROCESSORS EASE OFF — ONE FLOWER REPORTED IN SECTOR 9, GUARDED",
  summer:
    "SEASON TURNOVER: SUMMER SETTLES OVER THE SPIRES — COOLANT RATIONS ADJUSTED — ROOFTOP EGG-FRYING REMAINS PROHIBITED",
  autumn:
    "SEASON TURNOVER: AUTUMN WINDS OFF THE WASTES — FILTRATION CREWS BRACE FOR LEAF-ADJACENT DEBRIS — MORALE: SEASONAL",
  winter:
    "SEASON TURNOVER: WINTER GRIPS THE LOWER LEVELS — HEATING SUBSIDIES ACTIVATED — CITIZENS ADVISED TO HUDDLE EFFICIENTLY",
};

export function seasonChangeNews(state: GameState, season: Season): NewsFeedItem {
  return {
    id: `news-season-${season}-${state.totalTicks}`,
    headline: SEASON_NEWS_COPY[season],
    tick: state.totalTicks,
  };
}

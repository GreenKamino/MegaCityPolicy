// Personal Propaganda Feed — state-controlled "news" derived from current
// city conditions and recent history. Pure derivation; no new persisted state.
//
// The feed is intentionally biased: even bad news is spun into a positive
// state narrative. This gives the player a flavor read on how their regime
// would publicly describe its own stats.

import type { GameEvent, GameState } from "@/engine/types";
import { countFulfilledContracts } from "@/engine/contracts";

export type PropagandaTone = "triumphant" | "reassuring" | "warning" | "rallying" | "somber";

export type PropagandaItem = {
  id: string;
  headline: string;
  body: string;
  tone: PropagandaTone;
  source: string;
  tick: number;
};

type Template = {
  id: string;
  source: string;
  tone: PropagandaTone;
  applies: (s: GameState) => boolean;
  build: (s: GameState) => { headline: string; body: string };
};

const SOURCES = {
  ministry: "MINISTRY OF TRUTH",
  herald: "CITY HERALD",
  net: "PUBLIC NETCAST",
  voice: "VOICE OF THE PEOPLE",
  guard: "GUARD BULLETIN",
};

const TEMPLATES: Template[] = [
  {
    id: "happiness_high",
    source: SOURCES.herald,
    tone: "triumphant",
    applies: (s) => (s.cityStats?.happiness ?? 0) >= 70,
    build: (s) => ({
      headline: `CITIZENS REPORT RECORD APPROVAL OF ${s.playerTitle?.toUpperCase() ?? "THE LEADER"}`,
      body: `Independent polling confirms a public satisfaction reading of ${Math.round(s.cityStats.happiness)}%. Spontaneous celebrations are reported across multiple districts. Analysts credit firm leadership and visionary policy.`,
    }),
  },
  {
    id: "happiness_low",
    source: SOURCES.ministry,
    tone: "reassuring",
    applies: (s) => (s.cityStats?.happiness ?? 100) < 35,
    build: (s) => ({
      headline: "MINOR DISCONTENT CONTAINED, OFFICIALS SAY",
      body: `Reports of public unease are described as "isolated and exaggerated by hostile networks." Approval is officially recorded at ${Math.round(s.cityStats.happiness)}% pending revised methodology.`,
    }),
  },
  {
    id: "crime_high",
    source: SOURCES.guard,
    tone: "warning",
    applies: (s) => (s.cityStats?.crime ?? 0) >= 60,
    build: (s) => ({
      headline: "ENEMIES OF ORDER IDENTIFIED — CITIZENS URGED TO REMAIN VIGILANT",
      body: `Crime index registers ${Math.round(s.cityStats.crime)}. The Guard reaffirms its commitment to swift justice. Citizens are reminded that reporting suspicious activity is both a duty and a virtue.`,
    }),
  },
  {
    id: "crime_low",
    source: SOURCES.guard,
    tone: "triumphant",
    applies: (s) => (s.cityStats?.crime ?? 100) < 20,
    build: (s) => ({
      headline: "CRIME PURGED FROM OUR STREETS",
      body: `City-wide crime index has fallen to ${Math.round(s.cityStats.crime)}, the lowest figure in living memory. Effigies of the fallen criminal class are scheduled for ceremonial display.`,
    }),
  },
  {
    id: "unrest_high",
    source: SOURCES.ministry,
    tone: "warning",
    applies: (s) => (s.cityStats?.unrest ?? 0) >= 60,
    build: (s) => ({
      headline: "AGITATORS DETAINED AS PUBLIC ORDER REAFFIRMED",
      body: `Several individuals have been peacefully relocated for re-education following destabilizing rhetoric. The vast majority of citizens remain steadfastly loyal.`,
    }),
  },
  {
    id: "wealth_high",
    source: SOURCES.net,
    tone: "triumphant",
    applies: (s) => (s.resources?.credits ?? 0) >= 50000,
    build: (s) => ({
      headline: "TREASURY SURPLUS HERALDS NEW ERA OF PROSPERITY",
      body: `City reserves now exceed ${Math.round(s.resources.credits).toLocaleString()} credits. Ministry economists describe the figure as "structurally sound and morally vindicating."`,
    }),
  },
  {
    id: "wealth_low",
    source: SOURCES.voice,
    tone: "rallying",
    applies: (s) => (s.resources?.credits ?? 1) < 1000,
    build: (s) => ({
      headline: "TIGHTEN OUR BELTS TOGETHER — A CALL TO COLLECTIVE EFFORT",
      body: `Reserves stand at ${Math.round(s.resources.credits).toLocaleString()}. The Ministry calls upon every loyal citizen to redouble production. Sacrifice today secures abundance tomorrow.`,
    }),
  },
  {
    id: "law_order_high",
    source: SOURCES.guard,
    tone: "triumphant",
    applies: (s) => (s.cityStats?.lawOrder ?? 0) >= 80,
    build: (s) => ({
      headline: "LAW & ORDER INDEX AT GENERATIONAL HIGH",
      body: `Law & Order rating has climbed to ${Math.round(s.cityStats.lawOrder)}. Citizens may walk the streets at any hour without fear, except where signs prohibit it.`,
    }),
  },
  {
    id: "lawless",
    source: SOURCES.ministry,
    tone: "warning",
    applies: (s) => (s.cityStats?.lawOrder ?? 100) < 30,
    build: () => ({
      headline: "NEW EMERGENCY MEASURES ANNOUNCED FOR PUBLIC SAFETY",
      body: `Temporary patrol expansions have been authorized in response to externally-funded disturbances. Citizens are encouraged to assist authorities and to remain calm.`,
    }),
  },
  {
    id: "population_milestone",
    source: SOURCES.herald,
    tone: "triumphant",
    applies: (s) => (s.cityStats?.population ?? 0) >= 10000,
    build: (s) => ({
      headline: "POPULATION SOARS — CITY THE ENVY OF THE WASTES",
      body: `Census recorders confirm ${Math.round(s.cityStats.population).toLocaleString()} loyal citizens now call our city home. Refugees from lesser settlements continue to arrive daily.`,
    }),
  },
  {
    id: "missions_won",
    source: SOURCES.guard,
    tone: "triumphant",
    applies: (s) => (s.totalMissionsSucceeded ?? 0) >= 5,
    build: (s) => ({
      headline: "OPERATIONAL VICTORIES MOUNT",
      body: `${s.totalMissionsSucceeded} mission${s.totalMissionsSucceeded === 1 ? "" : "s"} successfully concluded. Honors will be conferred in a public ceremony, attendance mandatory for ranking officers.`,
    }),
  },
  {
    id: "contracts_won",
    source: SOURCES.net,
    tone: "triumphant",
    applies: (s) => countFulfilledContracts(s.completedContracts) >= 5,
    build: (s) => ({
      headline: "INDUSTRIAL OUTPUT EXCEEDS PROJECTIONS",
      body: `${countFulfilledContracts(s.completedContracts)} commercial contracts have been delivered on schedule. Productivity bonuses have been redirected to defense and beautification.`,
    }),
  },
  {
    id: "research_progress",
    source: SOURCES.herald,
    tone: "triumphant",
    applies: (s) => (s.unlockedTechnologies?.length ?? 0) >= 5,
    build: (s) => ({
      headline: "BREAKTHROUGH SCIENCE FUELS THE FUTURE",
      body: `${s.unlockedTechnologies.length} technologies are now in active service. Rival megacities are described by analysts as "lagging dangerously behind."`,
    }),
  },
  {
    id: "recent_event_spin",
    source: SOURCES.ministry,
    tone: "reassuring",
    applies: (s) => (s.eventHistory?.length ?? 0) > 0,
    build: (s) => {
      const ev: GameEvent | undefined = s.eventHistory[s.eventHistory.length - 1];
      const title = ev?.title ?? "RECENT EVENT";
      return {
        headline: `OFFICIAL STATEMENT ON: ${title.toUpperCase()}`,
        body: `Reports concerning the recent matter have been reviewed. Resolution proceeded according to plan. The Ministry thanks citizens for their patience and discretion.`,
      };
    },
  },
  {
    id: "happiness_mid",
    source: SOURCES.voice,
    tone: "rallying",
    applies: (s) => {
      const h = s.cityStats?.happiness;
      return h !== undefined && h >= 35 && h < 70;
    },
    build: (s) => ({
      headline: "STEADY HANDS, STEADY HEARTS — THE WORK CONTINUES",
      body: `Approval holds at ${Math.round(s.cityStats.happiness)}%. The Ministry reminds citizens that consolidation is the prelude to triumph. Every shift completed is a brick in the future.`,
    }),
  },
  {
    id: "unrest_low",
    source: SOURCES.herald,
    tone: "reassuring",
    applies: (s) => (s.cityStats?.unrest ?? 100) < 20,
    build: (s) => ({
      headline: "CIVIC HARMONY HOLDS UNDER WISE GUIDANCE",
      body: `Public unrest measures at ${Math.round(s.cityStats.unrest)}, well within projected operating tolerance. Block wardens report no significant incidents. Discretion remains a civic virtue.`,
    }),
  },
  {
    id: "wealth_mid",
    source: SOURCES.voice,
    tone: "rallying",
    applies: (s) => {
      const c = s.resources?.credits;
      return c !== undefined && c >= 1000 && c < 50000;
    },
    build: (s) => ({
      headline: "EVERY CREDIT EARNED IS A CREDIT INVESTED",
      body: `Treasury reserves stand at ${Math.round(s.resources.credits).toLocaleString()}. Productive labor and disciplined budgeting are the twin engines of progress. The Ministry urges sustained effort.`,
    }),
  },
  {
    id: "population_mid",
    source: SOURCES.herald,
    tone: "reassuring",
    applies: (s) => {
      const p = s.cityStats?.population;
      return p !== undefined && p >= 1000 && p < 10000;
    },
    build: (s) => ({
      headline: "MEASURED GROWTH, MEASURED PROSPERITY",
      body: `Census records ${Math.round(s.cityStats.population).toLocaleString()} loyal citizens. Sustainable expansion remains the official priority. New arrivals are reminded that registration is mandatory.`,
    }),
  },
  {
    id: "veteran_regime",
    source: SOURCES.ministry,
    tone: "somber",
    applies: (s) => (s.totalTicks ?? 0) >= 2000,
    build: (s) => ({
      headline: `${(s.totalTicks ?? 0).toLocaleString()} TICKS OF UNBROKEN ORDER`,
      body: `The historical record now spans ${(s.totalTicks ?? 0).toLocaleString()} ticks of stable governance. Older citizens are reminded that the time before is not to be discussed in mixed company.`,
    }),
  },
  {
    id: "tech_mature",
    source: SOURCES.net,
    tone: "somber",
    applies: (s) => (s.unlockedTechnologies?.length ?? 0) >= 15,
    build: (s) => ({
      headline: "RETROSPECTIVE: HOW WE OUTGREW THE OLD WAYS",
      body: `${s.unlockedTechnologies.length} technologies are now in service. Citizens of advanced years are reminded that nostalgia for unimproved methods is classified as a treatable condition.`,
    }),
  },
  {
    id: "history_long",
    source: SOURCES.herald,
    tone: "somber",
    applies: (s) => (s.eventHistory?.length ?? 0) >= 20,
    build: (s) => ({
      headline: "REFLECTIONS ON A SEASON OF SERVICE",
      body: `${s.eventHistory.length} significant matters have been resolved by the current administration. Records confirm appropriate response in every case. Older files have been archived for historical purposes.`,
    }),
  },
  {
    id: "faction_loyal_present",
    source: SOURCES.ministry,
    tone: "triumphant",
    applies: (s) =>
      (s.factions ?? []).some(
        (f) => f.isActive && (f.loyalty ?? 0) >= 70,
      ),
    build: (s) => {
      const loyal = s.factions.find(
        (f) => f.isActive && (f.loyalty ?? 0) >= 70,
      );
      return {
        headline: `${(loyal?.name ?? "THE FAITHFUL").toUpperCase()} STAND WITH THE STATE`,
        body: `Loyalty assessments confirm enduring partnership with ${loyal?.name ?? "key constituencies"}. Combined effort multiplies civic strength. Citizens are encouraged to follow their example.`,
      };
    },
  },
  {
    id: "faction_threat_present",
    source: SOURCES.guard,
    tone: "warning",
    applies: (s) =>
      (s.factions ?? []).some(
        (f) => f.isActive && (f.threat ?? 0) >= 60,
      ),
    build: (s) => {
      const t = s.factions.find(
        (f) => f.isActive && (f.threat ?? 0) >= 60,
      );
      return {
        headline: `${(t?.name ?? "DISLOYAL ELEMENT").toUpperCase()} UNDER REVIEW`,
        body: `Internal review of ${t?.name ?? "specified actors"} is proceeding. Citizens with relevant information may submit it through standard channels. The state thanks them in advance.`,
      };
    },
  },
  {
    id: "vigilance_routine",
    source: SOURCES.guard,
    tone: "rallying",
    applies: (s) => {
      const t = s.totalTicks ?? 0;
      return t > 0 && t % 50 === 0;
    },
    build: () => ({
      headline: "ROUTINE VIGILANCE BRIEFING — REPORT SUSPICIOUS ACTIVITY",
      body: `Periodic citizen briefing: vigilance is a daily duty. Report anything unusual to your block warden. Anonymity is preserved. Honors await the observant.`,
    }),
  },
  {
    id: "no_news",
    source: SOURCES.voice,
    tone: "somber",
    applies: () => true, // fallback
    build: () => ({
      headline: "ALL IS WELL. CARRY ON.",
      body: `No further bulletins at this hour. Citizens are reminded to report directly to their assigned shifts and to refrain from speculation.`,
    }),
  },
];

export function generatePropagandaFeed(state: GameState, limit = 12): PropagandaItem[] {
  const tick = state.totalTicks ?? 0;
  const items: PropagandaItem[] = [];
  for (const t of TEMPLATES) {
    try {
      if (!t.applies(state)) continue;
    } catch {
      continue;
    }
    let built;
    try {
      built = t.build(state);
    } catch {
      continue;
    }
    items.push({
      id: t.id,
      headline: built.headline,
      body: built.body,
      tone: t.tone,
      source: t.source,
      tick,
    });
  }
  // Always keep at least the fallback.
  if (items.length === 0) {
    const fb = TEMPLATES[TEMPLATES.length - 1];
    const built = fb.build(state);
    items.push({
      id: fb.id,
      headline: built.headline,
      body: built.body,
      tone: fb.tone,
      source: fb.source,
      tick,
    });
  }
  // De-prioritize the no_news fallback if other items exist.
  const real = items.filter((i) => i.id !== "no_news");
  const out = real.length > 0 ? real : items;
  return out.slice(0, limit);
}

export function countTemplates(): number {
  return TEMPLATES.length;
}

// Read-only metadata view for catalog tests. Intentionally omits the
// `applies` and `build` callables so callers can't drive them out of
// band; the propaganda feed is generated only via generatePropagandaFeed.
export function listTemplateMetadata(): ReadonlyArray<{
  id: string;
  tone: PropagandaTone;
  source: string;
}> {
  return TEMPLATES.map((t) => ({ id: t.id, tone: t.tone, source: t.source }));
}

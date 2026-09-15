import type {
  ExternalMegacity,
  Township,
  PartnerArchetype,
  PartnerStance,
  PersonalityArchetype,
  GameState,
  GameMessage,
  GameEvent,
  EventResponse,
  PartnerControlStatus,
} from "./types";
import { pushNewsItem, rivalWarDeclaredNews } from "./newsFeed";

export type PartnerEntity = ExternalMegacity | Township;

function boundedRelationshipScore(value: number | undefined, fallback: number): number {
  const candidate = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, candidate));
}

/**
 * Keep the mutable relationship fields safe at every runtime boundary.
 * Save migration repairs legacy data, but diplomacy and damage actions can
 * still receive an old or malformed entity while a game is running.
 */
export function normalizePartnerRelationshipScores<T extends PartnerEntity>(p: T): T {
  return {
    ...p,
    influence: boundedRelationshipScore(p.influence, 50),
    loyalty: boundedRelationshipScore(p.loyalty, 50),
    threat: boundedRelationshipScore(p.threat, 0),
    cityHealth: boundedRelationshipScore(p.cityHealth, 100),
    attrition: boundedRelationshipScore(p.attrition, 0),
  };
}

export const PARTNER_ARCHETYPES: Record<PartnerArchetype, {
  label: string;
  color: string;
  flavor: string;
  preferredDeals: string[];
  refusedDeals: string[];
  warHunger: number;
  tradeAffinity: number;
  expansionDrive: number;
}> = {
  "nomad": {
    label: "WASTELAND NOMADS",
    color: "#C99A4D",
    flavor: "Mobile clans, no fixed territory. Trade salvage and contraband. Hate static authority.",
    preferredDeals: ["safe-passage", "salvage-rights", "weapons-trade", "intel-trade"],
    refusedDeals: ["formal-alliance", "joint-construction", "cultural-exchange"],
    warHunger: 0.5,
    tradeAffinity: 0.7,
    expansionDrive: 0.3,
  },
  "tech-enclave": {
    label: "TECH ENCLAVE",
    color: "#56A0CC",
    flavor: "Research-focused. Trade rare data, prototypes, augments. Refuse outsider intervention.",
    preferredDeals: ["research-exchange", "tech-trade", "joint-research", "rare-materials"],
    refusedDeals: ["military-intervention", "annexation", "religious-pact"],
    warHunger: 0.2,
    tradeAffinity: 0.5,
    expansionDrive: 0.4,
  },
  "religious-order": {
    label: "RELIGIOUS ORDER",
    color: "#B57FCF",
    flavor: "Faith-driven. Negotiate via cultural and ritual exchange. Suspect of heretics.",
    preferredDeals: ["pilgrimage-rights", "relic-trade", "moral-pact", "humanitarian-aid"],
    refusedDeals: ["sacrilegious-trade", "joint-research", "weapons-trade"],
    warHunger: 0.6,
    tradeAffinity: 0.3,
    expansionDrive: 0.7,
  },
  "corporate-state": {
    label: "CORPORATE STATE",
    color: "#5DC299",
    flavor: "Profit-driven. Sign anything that makes credits. Will betray for better margins.",
    preferredDeals: ["trade-agreement", "exclusive-contract", "monopoly-grant", "joint-venture"],
    refusedDeals: ["humanitarian-aid", "religious-pact"],
    warHunger: 0.3,
    tradeAffinity: 1.0,
    expansionDrive: 0.6,
  },
  "syndicate": {
    label: "SYNDICATE",
    color: "#CC5D78",
    flavor: "Organized crime. Smuggling, extortion, black markets. Loyalty bought, not earned.",
    preferredDeals: ["protection-racket", "smuggling-rights", "weapons-trade", "intel-trade"],
    refusedDeals: ["formal-alliance", "humanitarian-aid", "moral-pact"],
    warHunger: 0.5,
    tradeAffinity: 0.6,
    expansionDrive: 0.4,
  },
  "settlement": {
    label: "AGRARIAN SETTLEMENT",
    color: "#9CC56F",
    flavor: "Subsistence farming and crafts. Want peace, food security, and protection.",
    preferredDeals: ["humanitarian-aid", "trade-agreement", "non-aggression-pact", "protectorate"],
    refusedDeals: ["weapons-trade", "annexation"],
    warHunger: 0.1,
    tradeAffinity: 0.8,
    expansionDrive: 0.1,
  },
  "military-junta": {
    label: "MILITARY JUNTA",
    color: "#A65046",
    flavor: "Garrison state. Discipline above all. Respect strength, despise weakness.",
    preferredDeals: ["mutual-defense", "weapons-trade", "joint-exercise", "tribute"],
    refusedDeals: ["humanitarian-aid", "cultural-exchange"],
    warHunger: 0.9,
    tradeAffinity: 0.4,
    expansionDrive: 0.8,
  },
  "feudal-realm": {
    label: "FEUDAL REALM",
    color: "#7B6BB5",
    flavor: "Hereditary nobility. Traditional, slow to act, value formal protocol.",
    preferredDeals: ["formal-alliance", "marriage-pact", "tribute", "non-aggression-pact"],
    refusedDeals: ["weapons-trade", "smuggling-rights"],
    warHunger: 0.4,
    tradeAffinity: 0.5,
    expansionDrive: 0.5,
  },
};

export const PERSONALITY_ARCHETYPES: Record<PersonalityArchetype, {
  label: string;
  color: string;
  flavor: string;
  warMod: number;
  betrayalMod: number;
  allianceMod: number;
}> = {
  "paranoid": { label: "PARANOID", color: "#A65046", flavor: "Suspects everyone. Reads every gesture as a threat.", warMod: 1.4, betrayalMod: 1.2, allianceMod: 0.5 },
  "mercantile": { label: "MERCANTILE", color: "#5DC299", flavor: "Sees the world in ledgers. Will deal with any flag.", warMod: 0.5, betrayalMod: 0.9, allianceMod: 1.2 },
  "militarist": { label: "MILITARIST", color: "#CC5D78", flavor: "Believes problems are solved with force.", warMod: 1.8, betrayalMod: 1.0, allianceMod: 0.7 },
  "zealot": { label: "ZEALOT", color: "#B57FCF", flavor: "Driven by ideology. Will not compromise on belief.", warMod: 1.5, betrayalMod: 1.4, allianceMod: 0.6 },
  "opportunist": { label: "OPPORTUNIST", color: "#C99A4D", flavor: "Reads every situation for advantage.", warMod: 1.0, betrayalMod: 1.6, allianceMod: 1.0 },
  "isolationist": { label: "ISOLATIONIST", color: "#7B6BB5", flavor: "Wants to be left alone. Will not engage easily.", warMod: 0.4, betrayalMod: 0.5, allianceMod: 0.4 },
  "honorable": { label: "HONORABLE", color: "#56A0CC", flavor: "Keeps their word. Slow to anger, slow to forgive.", warMod: 0.7, betrayalMod: 0.2, allianceMod: 1.5 },
  "ruthless": { label: "RUTHLESS", color: "#7A2C30", flavor: "Whatever it takes. Mercy is a tactical choice.", warMod: 1.6, betrayalMod: 1.8, allianceMod: 0.8 },
};

const ARCHETYPE_POOL: PartnerArchetype[] = [
  "nomad", "tech-enclave", "religious-order", "corporate-state",
  "syndicate", "settlement", "military-junta", "feudal-realm",
];

const PERSONALITY_POOL: PersonalityArchetype[] = [
  "paranoid", "mercantile", "militarist", "zealot",
  "opportunist", "isolationist", "honorable", "ruthless",
];

function hashStringToInt(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

export function inferArchetype(p: PartnerEntity): PartnerArchetype {
  if (p.archetype) return p.archetype;
  const name = (p.name ?? "").toLowerCase();
  const desc = (p.description ?? "").toLowerCase();
  const blob = `${name} ${desc}`;
  if (/nomad|raid|wastel|caravan|drifter|outrider/.test(blob)) return "nomad";
  if (/tech|cyber|enclave|lab|research|prototype|quant/.test(blob)) return "tech-enclave";
  if (/order|temple|cult|saint|shrine|faith|church|mona/.test(blob)) return "religious-order";
  if (/corp|consortium|holdings|industries|conglomerate|inc\b/.test(blob)) return "corporate-state";
  if (/syndic|cartel|family|crew|black market|smuggl/.test(blob)) return "syndicate";
  if (/militia|junta|brigade|garrison|legion|guard|regiment/.test(blob)) return "military-junta";
  if (/duch|kingdom|throne|baron|lord|reign|royal/.test(blob)) return "feudal-realm";
  if ("population" in p && (p.population ?? 0) < 25000) return "settlement";
  return ARCHETYPE_POOL[hashStringToInt(p.id) % ARCHETYPE_POOL.length];
}

export function inferPersonalityArchetype(p: PartnerEntity): PersonalityArchetype {
  if (p.personalityArchetype) return p.personalityArchetype;
  const arch = inferArchetype(p);
  const archDefaults: Record<PartnerArchetype, PersonalityArchetype[]> = {
    "nomad": ["opportunist", "ruthless"],
    "tech-enclave": ["isolationist", "mercantile"],
    "religious-order": ["zealot", "honorable"],
    "corporate-state": ["mercantile", "opportunist"],
    "syndicate": ["ruthless", "opportunist"],
    "settlement": ["honorable", "isolationist"],
    "military-junta": ["militarist", "paranoid"],
    "feudal-realm": ["honorable", "paranoid"],
  };
  const choices = archDefaults[arch] ?? PERSONALITY_POOL;
  return choices[hashStringToInt(p.id + "-pers") % choices.length];
}

const STANCE_LABEL: Record<PartnerStance, { label: string; color: string; icon: string }> = {
  "content": { label: "CONTENT", color: "#9CC56F", icon: "smile" },
  "prosperous": { label: "PROSPEROUS", color: "#5DC299", icon: "trending-up" },
  "opportunistic": { label: "OPPORTUNISTIC", color: "#C99A4D", icon: "eye" },
  "defiant": { label: "DEFIANT", color: "#CC5D78", icon: "shield" },
  "mourning": { label: "MOURNING", color: "#7B6BB5", icon: "cloud-rain" },
  "mobilized": { label: "MOBILIZED", color: "#A65046", icon: "alert-octagon" },
  "hostile": { label: "HOSTILE", color: "#7A2C30", icon: "x-octagon" },
  "desperate": { label: "DESPERATE", color: "#9B59B6", icon: "alert-triangle" },
};

export function getStanceMeta(s: PartnerStance) { return STANCE_LABEL[s] ?? STANCE_LABEL.content; }

export function computeStance(p: PartnerEntity): PartnerStance {
  const ch = p.cityHealth ?? 100;
  const at = p.attrition ?? 0;
  const lo = p.loyalty ?? 50;
  const th = p.threat ?? 0;
  const cs: PartnerControlStatus | undefined = p.controlStatus;
  if (cs === "occupied" || cs === "annexed") return "defiant";
  if (ch <= 0 || at >= 80) return "desperate";
  if (ch < 40 && at >= 50) return "mourning";
  if (lo < 20 && th > 60) return "hostile";
  if (th > 60) return "mobilized";
  if (lo < 35) return "defiant";
  if (ch > 70 && at < 20 && lo > 60) return "prosperous";
  if (lo > 50 && th < 30) return "content";
  return "opportunistic";
}

export function computeConcerns(p: PartnerEntity, state: GameState): string[] {
  const concerns: { text: string; weight: number }[] = [];
  const ch = p.cityHealth ?? 100;
  const at = p.attrition ?? 0;
  const lo = p.loyalty ?? 50;
  const th = p.threat ?? 0;
  const pop = ("population" in p ? (p.population ?? 0) : 0);

  if (ch < 40) concerns.push({ text: "Infrastructure crumbling", weight: 100 - ch });
  if (at >= 60) concerns.push({ text: "Population at breaking point", weight: at });
  if (at >= 30 && at < 60) concerns.push({ text: "Mounting unrest at home", weight: at });
  if (lo < 25) concerns.push({ text: "Distrusts our regime", weight: 80 - lo });
  if (th > 60) concerns.push({ text: "Sees us as a threat", weight: th });
  if (pop > 0 && pop < 15000) concerns.push({ text: "Worried about survival", weight: 60 });

  const adv = state.diplomacyAdvanced;
  if (adv && Array.isArray(adv.wars)) {
    const inWar = adv.wars.find((w) => w.belligerents?.includes(p.id));
    if (inWar) {
      const enemyId = inWar.belligerents.find((b) => b !== p.id);
      const enemyName = enemyId ? (state.externalMegacities?.find((m) => m.id === enemyId)?.name ?? state.townships?.find((t) => t.id === enemyId)?.name ?? "an enemy") : "an enemy";
      concerns.push({ text: `At war with ${enemyName}`, weight: 95 });
    }
  }

  if (adv && Array.isArray(adv.factionRelations)) {
    const rels = adv.factionRelations.filter((r) => (r.factionA === p.id || r.factionB === p.id) && r.disposition < 30);
    for (const r of rels.slice(0, 1)) {
      const otherId = r.factionA === p.id ? r.factionB : r.factionA;
      const other = state.externalMegacities?.find((m) => m.id === otherId)?.name ?? state.townships?.find((t) => t.id === otherId)?.name ?? "neighbor";
      concerns.push({ text: `Tensions with ${other}`, weight: 50 + (30 - r.disposition) });
    }
  }

  if (concerns.length === 0) {
    const arch = inferArchetype(p);
    const archConcerns: Record<PartnerArchetype, string> = {
      "nomad": "Routes need maintenance",
      "tech-enclave": "Research requires rare materials",
      "religious-order": "Awaiting omens",
      "corporate-state": "Quarterly margins under review",
      "syndicate": "Territorial line negotiations",
      "settlement": "Harvest dependencies",
      "military-junta": "Garrison rotation",
      "feudal-realm": "Court intrigue",
    };
    concerns.push({ text: archConcerns[arch], weight: 10 });
  }

  concerns.sort((a, b) => b.weight - a.weight);
  return concerns.slice(0, 3).map((c) => c.text);
}

export function computeCurrentAction(p: PartnerEntity, state: GameState): string {
  const ch = p.cityHealth ?? 100;
  const at = p.attrition ?? 0;
  const lo = p.loyalty ?? 50;
  const th = p.threat ?? 0;
  const cs = p.controlStatus;
  const arch = inferArchetype(p);

  if (cs === "annexed") return "Integrating into our domain.";
  if (cs === "occupied") return "Operating under garrison administration.";

  const adv = state.diplomacyAdvanced;
  if (adv && Array.isArray(adv.wars)) {
    const inWar = adv.wars.find((w) => w.belligerents?.includes(p.id));
    if (inWar) {
      const enemyId = inWar.belligerents.find((b) => b !== p.id);
      const enemyName = enemyId ? (state.externalMegacities?.find((m) => m.id === enemyId)?.name ?? state.townships?.find((t) => t.id === enemyId)?.name ?? "rival") : "rival";
      return `Waging ${inWar.stage?.replace("_", " ") ?? "war"} against ${enemyName}.`;
    }
  }

  if (ch < 30) {
    const archActions: Record<PartnerArchetype, string> = {
      "nomad": "Splintering into smaller bands.",
      "tech-enclave": "Powering down secondary systems.",
      "religious-order": "Processions of penance through ruined districts.",
      "corporate-state": "Liquidating non-essential subsidiaries.",
      "syndicate": "Calling in old debts and consolidating.",
      "settlement": "Rationing what remains of the harvest.",
      "military-junta": "Imposing curfew, conscripting the unwilling.",
      "feudal-realm": "The court holds emergency conclaves.",
    };
    return archActions[arch];
  }

  if (at >= 50) return "Suppressing unrest in the streets.";
  if (th > 70) return "Mobilizing forces along the borders.";
  if (lo < 25) return "Hardening positions against our influence.";

  const archIdle: Record<PartnerArchetype, string[]> = {
    "nomad": ["Caravans crossing the wastes.", "Salvage runs into old ruins.", "Trading at neutral waystations."],
    "tech-enclave": ["Running long-cycle experiments.", "Refining a new prototype.", "Filtering distant signals."],
    "religious-order": ["Holding a festival of ascension.", "Building a new shrine.", "Sending missionaries abroad."],
    "corporate-state": ["Renegotiating supplier contracts.", "Expanding consumer market share.", "Lobbying neighbor regimes."],
    "syndicate": ["Moving contraband across borders.", "Brokering protection deals.", "Quietly buying influence."],
    "settlement": ["Rotating crops in the outer fields.", "Festival of the harvest.", "Refurbishing the main road."],
    "military-junta": ["Drilling reserve battalions.", "Inspecting frontier garrisons.", "Reviewing logistics chains."],
    "feudal-realm": ["Holding court for petitioners.", "Sealing trade charters.", "Consolidating noble allegiance."],
  };
  const choices = archIdle[arch];
  const idx = (state.totalTicks + hashStringToInt(p.id)) % choices.length;
  return choices[idx];
}

export function ensurePartnerArchetypes<T extends PartnerEntity>(p: T): T {
  if (p.archetype && p.personalityArchetype) return p;
  return { ...p, archetype: p.archetype ?? inferArchetype(p), personalityArchetype: p.personalityArchetype ?? inferPersonalityArchetype(p) };
}

export function refreshPartnerDynamics<T extends PartnerEntity>(p: T, state: GameState): T {
  const ensured = normalizePartnerRelationshipScores(ensurePartnerArchetypes(p));
  return {
    ...ensured,
    stance: computeStance(ensured),
    concerns: computeConcerns(ensured, state),
    currentAction: computeCurrentAction(ensured, state),
  };
}

// --- NPC vs NPC processing ---

export function processNpcWorldEvents(state: GameState): { state: GameState; alerts: GameMessage[] } {
  const adv = state.diplomacyAdvanced;
  if (!adv || !Array.isArray(adv.factionRelations) || !Array.isArray(adv.wars)) return { state, alerts: [] };
  const alerts: GameMessage[] = [];
  const all: PartnerEntity[] = [
    ...(state.externalMegacities ?? []).filter((m) => m.isActive),
    ...(state.townships ?? []).filter((t) => t.status !== "undiscovered"),
  ];
  const byId = new Map<string, PartnerEntity>(all.map((p) => [p.id, p]));

  // Work on shallow copies so callers see immutable updates.
  const newWars = [...adv.wars];
  const newRelations = adv.factionRelations.map((r) => ({ ...r }));
  const newEvents: GameEvent[] = [];
  let newNewsFeed = state.newsFeed;

  // AI-vs-AI war declarations from existing relations matrix
  for (const rel of newRelations) {
    const a = byId.get(rel.factionA);
    const b = byId.get(rel.factionB);
    if (!a || !b) continue;
    if (a.controlStatus === "occupied" || a.controlStatus === "annexed") continue;
    if (b.controlStatus === "occupied" || b.controlStatus === "annexed") continue;
    const alreadyAtWar = newWars.some((w) =>
      Array.isArray(w.belligerents)
      && w.belligerents.includes(rel.factionA)
      && w.belligerents.includes(rel.factionB)
    );
    if (alreadyAtWar) continue;

    const aArch = inferArchetype(a);
    const bArch = inferArchetype(b);
    const aPers = inferPersonalityArchetype(a);
    const bPers = inferPersonalityArchetype(b);
    const warHunger = (PARTNER_ARCHETYPES[aArch].warHunger + PARTNER_ARCHETYPES[bArch].warHunger) / 2;
    const persMod = (PERSONALITY_ARCHETYPES[aPers].warMod + PERSONALITY_ARCHETYPES[bPers].warMod) / 2;

    if (rel.disposition < 18) {
      const chance = 0.012 * warHunger * persMod;
      if (Math.random() < chance) {
        const warId = `npc-war-${rel.factionA}-${rel.factionB}-${state.totalTicks}`;
        newWars.push({
          id: warId,
          belligerents: [rel.factionA, rel.factionB],
          belligerentNames: [a.name, b.name],
          stage: "tensions",
          intensity: 10,
          startTick: state.totalTicks,
          lastEscalationTick: state.totalTicks,
          playerInitiated: false,
          casualties: { a: 0, b: 0 },
          infrastructureDamage: { a: 0, b: 0 },
          warWeariness: 0,
          peaceOffered: false,
          timeline: {
            stages: [{ stage: "tensions", tick: state.totalTicks }],
            reports: [{ tick: state.totalTicks, label: "War declared; the conflict entered a tense standoff." }],
          },
        });
        alerts.push({
          id: `news-war-${rel.factionA}-${rel.factionB}-${state.totalTicks}`,
          timestamp: state.gameDate,
          tick: state.totalTicks,
          category: "world-news",
          title: `WAR DECLARED — ${a.name} vs ${b.name}`,
          body: `${a.name} (${PARTNER_ARCHETYPES[aArch].label.toLowerCase()}) and ${b.name} (${PARTNER_ARCHETYPES[bArch].label.toLowerCase()}) have entered open hostilities. Border posts reported under fire. Tensions had been building for weeks.\n\nBoth parties remain independent — but our position will be noted by both sides.`,
          read: false,
          priority: "normal",
        });
        newEvents.push(buildNpcWarInterventionEvent(warId, a, b, state.totalTicks));
        // Task #496: engine-started rival wars are breaking news, not just an
        // inbox alert — push the declaration onto the public ticker feed at
        // the moment the war starts. Player-declared wars are covered by the
        // GameContext action path, which never reaches this loop.
        newNewsFeed = pushNewsItem(newNewsFeed, rivalWarDeclaredNews(state, warId, a.name, b.name));
      }
    } else if (rel.disposition > 80) {
      // Possible alliance event (cosmetic news only — pacts handled elsewhere)
      const chance = 0.006 * (PERSONALITY_ARCHETYPES[aPers].allianceMod + PERSONALITY_ARCHETYPES[bPers].allianceMod) / 2;
      if (Math.random() < chance && (state.totalTicks - rel.lastEventTick) > 40) {
        rel.lastEventTick = state.totalTicks;
        alerts.push({
          id: `news-pact-${rel.factionA}-${rel.factionB}-${state.totalTicks}`,
          timestamp: state.gameDate,
          tick: state.totalTicks,
          category: "world-news",
          title: `ALLIANCE FORMED — ${a.name} & ${b.name}`,
          body: `${a.name} and ${b.name} have signed a public accord. Trade barriers reduced, mutual defense clauses ratified. Their combined influence reshapes the board.`,
          read: false,
          priority: "normal",
        });
      }
    }
  }

  // Occasional internal-event newsfeed for archetype flavor
  if (state.totalTicks % 12 === 0) {
    const candidates = all.filter((p) => p.controlStatus !== "annexed" && p.controlStatus !== "occupied");
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const arch = inferArchetype(pick);
      const flavorByArch: Record<PartnerArchetype, string[]> = {
        "nomad": ["A nomad caravan war breaks out over the south salt route.", "A new clan chief is acclaimed by the tribal council."],
        "tech-enclave": ["A breakthrough in cold-cycle batteries is announced from the labs.", "A research vessel returns with strange salvage from the deep ruins."],
        "religious-order": ["A new prophecy is delivered at the high temple.", "Pilgrims gather in record numbers for the season's rite."],
        "corporate-state": ["A hostile takeover reshuffles the executive board.", "Quarterly results trigger a wave of layoffs and restructuring."],
        "syndicate": ["A turf war erupts in the lower districts.", "A senior lieutenant is found dead in mysterious circumstances."],
        "settlement": ["A bumper harvest fills the granaries.", "A flood damages the irrigation canals."],
        "military-junta": ["A bloodless coup installs a new general at the top.", "A surprise drill mobilizes three reserve regiments."],
        "feudal-realm": ["A royal heir is born; festivities are declared.", "A rival noble house is stripped of its lands."],
      };
      const lines = flavorByArch[arch];
      const line = lines[Math.floor(Math.random() * lines.length)];
      alerts.push({
        id: `news-flavor-${pick.id}-${state.totalTicks}`,
        timestamp: state.gameDate,
        tick: state.totalTicks,
        category: "world-news",
        title: `${pick.name.toUpperCase()} — DISPATCH`,
        body: line,
        read: false,
        priority: "low",
      });
    }
  }

  const newState: GameState = {
    ...state,
    diplomacyAdvanced: { ...adv, wars: newWars, factionRelations: newRelations },
    activeEvents: newEvents.length > 0 ? [...(state.activeEvents ?? []), ...newEvents] : (state.activeEvents ?? []),
    ...(newNewsFeed !== state.newsFeed ? { newsFeed: newNewsFeed } : {}),
  };
  return { state: newState, alerts };
}

// --- Player intervention in NPC-vs-NPC wars ---

function buildNpcWarInterventionEvent(warId: string, a: PartnerEntity, b: PartnerEntity, tick: number): GameEvent {
  return {
    id: `npc-war-int-${warId}`,
    title: `INTERVENE: ${a.name.toUpperCase()} vs ${b.name.toUpperCase()}`,
    severity: "high",
    effects: {},
    timestamp: tick,
    resolved: false,
    responseOptions: [
      {
        id: `npc-war-int:back-a:${warId}`,
        label: `Back ${a.name}`,
        effects: { credits: -250 },
      },
      {
        id: `npc-war-int:back-b:${warId}`,
        label: `Back ${b.name}`,
        effects: { credits: -250 },
      },
      {
        id: `npc-war-int:broker-peace:${warId}`,
        label: `Broker peace`,
        effects: { credits: -600, happiness: 4 },
      },
      {
        id: `npc-war-int:sell-arms:${warId}`,
        label: `Sell arms to both sides`,
        effects: { credits: 400, unrest: 2 },
      },
    ],
  };
}

export function applyNpcWarIntervention(state: GameState, responseId: string): GameState {
  const adv = state.diplomacyAdvanced;
  if (!adv || !Array.isArray(adv.factionRelations) || !Array.isArray(adv.wars)) return state;
  const parts = responseId.split(":");
  if (parts.length < 3 || parts[0] !== "npc-war-int") return state;
  const action = parts[1];
  const warId = parts.slice(2).join(":");
  const war = adv.wars.find((w) => w.id === warId);
  if (!war || !Array.isArray(war.belligerents) || war.belligerents.length < 2) return state;
  const aId = war.belligerents[0];
  const bId = war.belligerents[1];
  if (!aId || !bId || aId === bId) return state;

  // Work on a copy of the relations array so we never mutate prior state.
  const relations = adv.factionRelations.map((r) => ({ ...r }));

  const bumpRel = (factionId: string, delta: number) => {
    let idx = relations.findIndex(
      (r) => (r.factionA === "player" && r.factionB === factionId) || (r.factionB === "player" && r.factionA === factionId)
    );
    if (idx < 0) {
      // Create the missing player↔faction row so the intervention has a real ripple.
      relations.push({
        factionA: "player",
        factionB: factionId,
        disposition: 50,
        lastEventTick: state.totalTicks,
      } as typeof relations[number]);
      idx = relations.length - 1;
    }
    const cur = relations[idx];
    const next = Math.max(0, Math.min(100, (cur.disposition ?? 50) + delta));
    relations[idx] = { ...cur, disposition: next, lastEventTick: state.totalTicks };
  };

  let newWars = adv.wars;
  if (action === "back-a") {
    bumpRel(aId, +18);
    bumpRel(bId, -25);
  } else if (action === "back-b") {
    bumpRel(bId, +18);
    bumpRel(aId, -25);
  } else if (action === "broker-peace") {
    // 70% chance peace holds.
    if (Math.random() < 0.7) {
      newWars = adv.wars.filter((w) => w.id !== warId);
      bumpRel(aId, +12);
      bumpRel(bId, +12);
    } else {
      bumpRel(aId, +4);
      bumpRel(bId, +4);
    }
  } else if (action === "sell-arms") {
    bumpRel(aId, -10);
    bumpRel(bId, -10);
  }

  return {
    ...state,
    diplomacyAdvanced: {
      ...adv,
      wars: newWars,
      factionRelations: relations,
    },
  };
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = (name: string) =>
  readFileSync(resolve(__dirname, `../../app/(game)/${name}.tsx`), "utf8");
const rootScreen = (name: string) =>
  readFileSync(resolve(__dirname, `../../app/${name}.tsx`), "utf8");
const component = (name: string) =>
  readFileSync(resolve(__dirname, `../../components/${name}.tsx`), "utf8");
const engine = (name: string) =>
  readFileSync(resolve(__dirname, `../${name}.ts`), "utf8");

/**
 * Native screen modules cannot be imported in Vitest without pulling in the
 * Expo runtime. These source-level checks keep the compact UI contract while
 * the engine continues to own all biography and history state.
 */
describe("simulation screen prose cleanup", () => {
  it("removes officer narrative dossiers but keeps assessment and career data", () => {
    const source = screen("officers");
    expect(source).not.toContain("buildOfficerDossier");
    expect(source).not.toContain("officer.backstory");
    expect(source).toContain("getOfficerThreatScore");
    expect(source).toContain("getOfficerStabilityValue");
    expect(source).toContain("officer.careerLog");
    expect(source).toContain("officer.traits");
    expect(source).toContain("officer.factionAffiliation");
  });

  it("keeps named-character mechanics and assignments without rendering bios", () => {
    const source = screen("overview");
    expect(source).not.toContain("c.backstory");
    expect(source).not.toContain("c.history.length");
    expect(source).not.toContain("c.history.map");
    expect(source).not.toContain("recent.text");
    expect(source).not.toContain("h.text");
    expect(source).toContain("c.traits");
    expect(source).toContain("c.factionId");
    expect(source).toContain("c.districtId");
    expect(source).toContain("c.status");
  });

  it("removes commander backstory presentation without altering profile mechanics", () => {
    const source = screen("character");
    expect(source).not.toContain("pickDossierFooter");
    expect(source).not.toContain("player.backstory");
    expect(source).toContain("player.attributes");
    expect(source).toContain("player.skills");
    expect(source).toContain("dialogueTopic.choices");
  });

  it("keeps faction operational data and leaders without rendering faction prose", () => {
    const source = screen("factions");
    expect(source).not.toContain("faction.description");
    expect(source).not.toContain("TutorialHint");
    expect(source).not.toContain("CrisisReportFrame");
    expect(source).toContain("faction.infrastructure");
    expect(source).toContain("faction.influence");
    expect(source).toContain("faction.loyalty");
    expect(source).toContain("faction.threat");
    expect(source).toContain("faction.leader.name");
    expect(source).toContain("faction.leader.title");
    expect(source).not.toContain("faction.leader.personalityTraits");
    expect(source).not.toContain("getTraitDescription");
    expect(source).toContain("FactionTraitInfluences");
    expect(source).toContain("FaithChip");
    expect(source).toContain("EVENT_ONLY_ACTION_RULES");
  });

  it("retires the generated faction dossier brief while keeping the live faction screen", () => {
    const source = engine("inboxFlavor");
    expect(source).not.toContain("generateFactionIntelBrief");
    expect(source).not.toContain("FACTION DOSSIER");
    expect(source).not.toContain("KNOWN OBJECTIVES");
    expect(source).toContain("generateEconomicDispatch");
  });

  it("keeps periodic inbox output factual and removes randomized flavor pools", () => {
    const source = engine("inboxFlavor");
    for (const pool of [
      "DAILY_REPORT_OPENERS",
      "DAILY_REPORT_CLOSERS",
      "GOOD_STATUS_COMMENTS",
      "BAD_STATUS_COMMENTS",
      "TICKER_FLAVOR",
      "SYSTEM_MESSAGE_FLAVOR",
      "marketInsights",
      "crimeStories",
      "maintenanceStories",
      "humanStories",
      "weatherStories",
      "officerStories",
      "wastelandReports",
      "threatAssessments",
    ]) {
      expect(source).not.toContain(pool);
    }
    expect(source).not.toContain("pick(");
    expect(source).toContain("OPERATIONS STATUS:");
    expect(source).toContain("CRIME INDEX:");
    expect(source).toContain("ACTIVE EXPEDITIONS:");
  });

  it("shows incident decisions and effects without narrative descriptions", () => {
    const events = screen("events");
    const summary = screen("summary");
    const worldmap = screen("worldmap");
    const card = readFileSync(resolve(__dirname, "../../components/EventCard.tsx"), "utf8");
    expect(events).not.toContain("e.description");
    expect(summary).not.toContain("r.biggestEvent.description");
    expect(worldmap).not.toMatch(/<Text[^>]*>\{evt\.description\}<\/Text>/);
    expect(card).not.toContain("{event.description}");
    expect(card).not.toContain("{resp.description}");
    expect(card).toContain("responseEffectsText");
    expect(card).toContain("displayedEffects");
  });

  it("renders discovered lore as survey metadata rather than entry prose", () => {
    const source = screen("lore");
    expect(source).toContain("SURVEY RECORDS");
    expect(source).toContain("selectedEntry.zoneTypes");
    expect(source).toContain("selectedEntry.author");
    expect(source).toContain("STATUS: DISCOVERED");
    expect(source).not.toContain("selectedEntry.content");
    expect(source).not.toContain("selectedEntry.flavorText");
    expect(source).toContain("discoveredLore");
  });

  it("keeps journal and entity-index records while removing narrative framing", () => {
    const journal = screen("journal");
    const logbook = screen("logbook");
    expect(journal).toContain("ACTIVITY RECORD");
    expect(journal).toContain("buildJournalEntries");
    expect(journal).toContain("entry.body");
    expect(journal).not.toContain("city writes its story");
    expect(logbook).toContain("ENTITY INDEX");
    expect(logbook).toContain("buildLogbook");
    expect(logbook).not.toContain("entry.description");
  });

  it("keeps codex rules but excludes generated gang lore and faction dossiers", () => {
    const source = screen("codex");
    expect(source).not.toContain('id: "fac-lore"');
    expect(source).not.toContain('id: "fac-reliquary-see"');
    expect(source).not.toContain('id: "fac-continuance"');
    expect(source).not.toContain('id: "addons"');
    expect(source).not.toContain("ADDON SYSTEMS");
    expect(source).not.toContain("Encyclopedia: The Civil Service Bureau");
    expect(source).not.toContain("Encyclopedia: Processed Food");
    expect(source).toContain('id: "fac-overview"');
    expect(source).toContain('id: "law-gang-lore"');
    expect(source).toContain("FACTION STATS");
  });

  it("keeps intel records without rendering saved rumor or transmission prose", () => {
    const source = screen("diplomacy");
    expect(source).toContain("state.intelItems");
    expect(source).toContain("it.reliability");
    expect(source).toContain("it.source");
    expect(source).toContain("it.acquiredTick");
    expect(source).toContain("it.expiresTick");
    expect(source).not.toContain("{it.content}");
  });

  it("keeps command and retinue outcomes while removing dialogue prose from modals", () => {
    const character = screen("character");
    const officers = screen("officers");
    const context = readFileSync(resolve(__dirname, "../../context/GameContext.tsx"), "utf8");
    const effects = engine("dialogueEffects");

    for (const source of [character, officers]) {
      expect(source).not.toContain(".opening");
      expect(source).not.toContain(".response");
      expect(source).not.toContain("choice.label");
      expect(source).not.toContain("choice.text");
      expect(source).toContain("ACTION APPLIED");
      expect(source).toContain("choice.effects");
      expect(source).toContain("effectPreviewLabel");
      expect(source).toContain('typeof v === "number" && v !== 0');
    }
    expect(character).toContain("dialogueActionLabel(choice.id, dialogueTopic.id)");
    expect(character).toContain("dialogueActionLabel(choice.id, icDialogueTopic.id)");
    expect(character).toContain("id.slice(topicPrefix.length)");
    expect(character).toContain(".replace(/[_-]+/g, \" \")");
    expect(character).toContain("choice.effects.loyalty");
    expect(character).toContain("choice.effects.competence");
    expect(officers).toContain("dialogueActionLabel(choice.id)");
    expect(officers).toContain("id.match(/^[^_]+_[^_]+_/)");
    expect(officers).toContain("choice.effects.loyalty");
    expect(officers).toContain("choice.effects.competence");
    for (const key of ["credits", "unrest", "corruption", "happiness", "lawOrder", "defenseRating", "research"]) {
      expect(effects).toContain(`effects.${key}`);
    }
    expect(context).not.toContain("FACTION_DIALOGUE");
    expect(context).not.toContain("dialogueLine");
    expect(context).not.toContain("dialogueMap");
    expect(context).toContain("Action accepted.");
    expect(context).toContain("Action rejected.");
  });

  it("uses the shared operational settlement read model in diplomacy summaries", () => {
    const source = screen("diplomacy");
    expect(source).toContain("getOperationalSettlementSections");
    expect(source).toContain("operationalFromSettlement");
    expect(source).not.toContain("derivePartnerSimulationProfile");
    expect(source).not.toContain("SimulationProfileField");
  });

  it("keeps criminal status and rap-sheet data in a bounded factual view", () => {
    const source = screen("criminals");
    expect(source).toContain("CRIMINAL_STATUS_LABELS[criminalStatus]");
    expect(source).toContain("rapSheet.slice(-3).reverse()");
    expect(source).toContain("lastKnownLocation");
    expect(source).not.toContain("setExpanded");
  });

  it("keeps district metrics without rendering catalog flavor prose", () => {
    const source = screen("districts");
    expect(source).not.toContain("getDistrictFlavor");
    expect(source).not.toContain("{flavor}");
    expect(source).toContain("district.population");
    expect(source).toContain("district.crime");
    expect(source).toContain("district.infraQuality");
    expect(source).toContain("district.industrialOutput");
  });

  it("keeps starting-region choices without exposing narrative dossiers", () => {
    const source = rootScreen("index");
    expect(source).not.toContain("REGION DOSSIER");
    expect(source).not.toContain("ccRegion.description");
    expect(source).toContain("ccRegion.startingBonus.summary");
    expect(source).toContain("ccRegion.initialDiscovered.length");
  });

  it("renders atlas and bestiary entries as survey and combat records", () => {
    const atlas = screen("atlas");
    const bestiary = screen("bestiary");
    expect(atlas).not.toContain("selectedEntry.lore");
    expect(atlas).not.toContain("FIELD NOTE");
    expect(atlas).toContain("SURVEY ID:");
    expect(atlas).toContain("STATUS: CHARTED");
    expect(bestiary).not.toContain("detail.description");
    expect(bestiary).not.toContain("unit.blurb");
    expect(bestiary).toContain("TOTAL WEIGHT");
    expect(bestiary).toContain("COMBAT WEIGHT");
  });

  it("keeps terrain discovery interactive without rendering terrain lore", () => {
    const source = screen("worldmap");
    expect(source).toContain("TerrainHotspot");
    expect(source).toContain("RECORDED IN ATLAS");
    expect(source).not.toContain("lore={");
    expect(source).not.toContain("{lore}");
    expect(source).not.toContain("evt.title");
    expect(source).toContain("NO LOCATION CONFIRMED");
  });

  it("keeps construction effects without rendering catalog descriptions", () => {
    const source = screen("construction");
    expect(source).not.toContain("def.description");
    expect(source).toContain("def.effect");
    expect(source).toContain("buildProductionText");
  });

  it("keeps completed contract records without randomized completion flavor", () => {
    const source = screen("contracts");
    expect(source).not.toContain("getCompletionFlavor");
    expect(source).toContain("contract.totalPaid");
    expect(source).toContain("contract.ticksElapsed");
    expect(source).toContain("contract.delaysOccurred");
    expect(source).toContain("contract.overrunCost");
  });

  it("keeps mining incident records without generated incident prose", () => {
    const source = screen("mining");
    expect(source).not.toContain("evt.title");
    expect(source).not.toContain("evt.description");
    expect(source).toContain("evt.type.replace");
    expect(source).toContain("evt.operationName");
    expect(source).toContain("evt.resolved");
    expect(source).toContain("evt.tick");
  });

  it("keeps run outcomes without generated verdict narrative or taglines", () => {
    const source = screen("summary");
    const exportText = engine("runSummaryText");
    for (const content of [source, exportText]) {
      expect(content).not.toContain("stateOfCity.narrative");
      expect(content).not.toContain("archetype.tagline");
    }
    expect(source).toContain("r.stateOfCity.headline");
    expect(source).toContain("r.archetype.name");
    expect(source).toContain("r.milestoneTimeline");
  });

  it("labels faction intrigue as operational alignment rather than ideology prose", () => {
    const source = screen("character");
    expect(source).not.toContain("Faction Ideology");
    expect(source).not.toContain("matches a faction's ideology");
    expect(source).toContain("Faction Alignment & Intrigue");
    expect(source).toContain("f.alignment");
    expect(source).toContain("f.radicalization");
  });

  it("replaces generated comms and propaganda prose with operational status", () => {
    const chatter = component("CommsChatter");
    const propaganda = screen("propaganda");
    expect(chatter).not.toContain("ALL_POOLS");
    expect(chatter).not.toContain("generateTransmission");
    expect(chatter).toContain("VERIFIED OPERATIONAL SIGNALS ONLY");
    expect(propaganda).not.toContain("generatePropagandaFeed");
    expect(propaganda).not.toContain("item.headline");
    expect(propaganda).not.toContain("item.body");
    expect(propaganda).toContain("state.policies?.propaganda");
    expect(propaganda).toContain("propagandaBroadcastingTowers");
    expect(propaganda).toContain("propagandaOfficers");
  });

  it("replaces the global generated headline feed with live city metrics", () => {
    const layout = screen("_layout");
    const overview = screen("overview");
    const ticker = component("NewsTicker");
    expect(layout).not.toContain("useNews()");
    expect(overview).not.toContain("useNewsHeadlines");
    expect(layout).toContain("state.totalTicks");
    expect(layout).toContain("state.cityStats.population");
    expect(layout).toContain("state.resources.credits");
    expect(layout).toContain("state.activeEvents");
    expect(layout).toContain("state.cityStats.unrest");
    expect(layout).toContain("state.cityStats.crime");
    expect(ticker).not.toContain("ALL SYSTEMS NOMINAL");
    expect(ticker).toContain("Live operations ticker");
  });

  it("keeps economy and megaproject mechanics without slogans or flavor fields", () => {
    const economy = screen("local-economy");
    const projects = screen("megaprojects");
    expect(economy).not.toContain("def.tagline");
    expect(economy).not.toContain("def.flavor");
    expect(economy).toContain("def.maxLocations");
    expect(economy).toContain("def.taxPerLocation");
    expect(projects).not.toContain("def.flavorText");
    expect(projects).toContain("def.description");
    expect(projects).toContain("def.requirements");
  });

  it("prevents the reusable city setup from restoring region lore", () => {
    const source = component("CommanderSetupSections");
    expect(source).not.toContain("onOpenRegionLore");
    expect(source).not.toContain("region.description");
    expect(source).toContain("region.startingBonus.summary");
    expect(source).toContain("region.initialDiscovered.length");
  });

  it("removes generated commander backstory presets while preserving optional user notes", () => {
    const root = rootScreen("index");
    const setup = component("CommanderSetupSections");
    for (const source of [root, setup]) {
      expect(source).not.toContain("BACKSTORY_PRESETS");
      expect(source).not.toContain("backstoryPresets");
    }
    expect(root).toContain("profileBackstory");
    expect(setup).toContain("onBackstoryChange");
    expect(setup).toContain("Optional commander note");
  });
});
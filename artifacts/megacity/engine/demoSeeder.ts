import { createInitialState } from "@/engine/initialState";
import { runTick } from "@/engine/formulas";
import { createDefaultLogisticsState, createDefaultMilitaryState } from "@/engine/militaryOverhaul";
import { STARTING_REGIONS, WORLD_LOCATIONS } from "@/engine/worldMap";
import { makeFactionDemandEvent } from "@/engine/factionDemands";
import {
  MAX_PENDING_CONSTRUCTION_ORDERS,
  TRAINING_EDICT_ID,
} from "@/engine/pendingConstruction";
import { HOUSING_CAPACITY_BUILDINGS } from "@/engine/housingCapacity";
import {
  factionDiplomacyCooldownKey,
  PERSONAL_ACTION_DECAY_WINDOW_TICKS,
  personalCooldownKey,
} from "@/engine/interactionMenu";
import { COMMUNICATIONS_LOW_SIGNAL_THRESHOLD } from "@/engine/communicationsBreakdown";
import { ADMINISTRATIVE_BLOC_ID } from "@/engine/administrativeBloc";
import { EVENT_CHAINS } from "@/engine/eventChains";
import { generateMissionMessage, type MissionResult } from "@/engine/officerMissions";
import {
  createDefaultRetinueState,
  type Captain,
  type RetinueState,
  type Troop,
} from "@/engine/retinueData";
import { createDefaultInnerCircleState } from "@/engine/innerCircleData";
import type {
  CompanyInstance,
  GameState,
  GameEvent,
  ContractInstance,
  RailCorridor,
} from "@/engine/types";

// When ?demo=1 is on the URL (web only, dev-only), or when the explicitly
// opted-in packaged save-and-quit fixture is requested, seed a
// fully-bootstrapped in-game state synchronously so smoke tooling can
// navigate directly to an in-game tab without going through the launch flow.
//
// CRITICAL: This must be IN-MEMORY ONLY. Never call startNewGame, never
// touch AsyncStorage. Otherwise visiting /?demo=1 would silently overwrite
// the user's save slot 1. The regression test in __tests__/demoSeeder.test.ts
// locks this contract in place.
//
// `typeof window === "undefined"` is the cross-platform proxy for "are we
// running on web?" — on native there is no window, on SSR there is no window.
// The original Platform.OS check was redundant.
export function createDemoSeededStateIfRequested(): GameState {
  const base = createInitialState();
  if (typeof window === "undefined" || !window.location) return base;
  const params = new URLSearchParams(window.location.search);
  // The packaged Steam smoke test runs against the release bundle, where
  // __DEV__ is false and the normal demo query must stay disabled. Its
  // preload bridge exposes this narrower capability only when the test
  // explicitly opts in, so the fixture remains unavailable to ordinary
  // release launches.
  const isSaveAndQuitFixture =
    params.get("fixture") === "save-and-quit" &&
    (window as any).desktop?.saveAndQuitFixture === true;
  const isRetinueSuccessionFixture =
    params.get("fixture") === "retinue-succession" &&
    (window as any).desktop?.retinueSuccessionFixture === true;
  const isCommunicationsBoundaryFixture =
    params.get("boundarycomms") === "1" &&
    (window as any).desktop?.communicationsBoundaryFixture === true;
  const isMilitaryFoodPoolFixture =
    params.get("militaryfoodpool") === "1" &&
    (window as any).desktop?.militaryFoodPoolFixture === true;
  const isUtilityParityFixture =
    params.get("utilityparity") === "1" &&
    (window as any).desktop?.utilityParityFixture === true;
  const isResearchQueueFixture =
    params.get("researchqueue") === "1" &&
    (window as any).desktop?.researchQueueFixture === true;
  const isHousingBlockerFixture =
    params.get("housing") === "1" &&
    (window as any).desktop?.housingBlockerFixture === true;
  const isRailModulesFixture =
    params.get("railmodules") === "1" &&
    (window as any).desktop?.railModulesFixture === true;
  const isDistrictCommandsFixture =
    params.get("districtcommands") === "1" &&
    (window as any).desktop?.districtCommandsFixture === true;
  const isCrimeRecoveryFixture =
    params.get("crime") === "1" &&
    (window as any).desktop?.crimeRecoveryFixture === true;
  const isMissionMailFixture =
    params.get("missionmail") === "1" &&
    (window as any).desktop?.missionMailFixture === true;
  const isWorldMapEventLogFixture =
    params.get("worldmaplog") === "1" &&
    (window as any).desktop?.worldMapEventLogFixture === true;
  const isMapFoodStorageFixture =
    params.get("mapfoodstorage") === "1" &&
    (window as any).desktop?.mapFoodStorageFixture === true;
  const isStoragePlanFixture =
    params.get("storageplan") === "1" &&
    (window as any).desktop?.storagePlanFixture === true;
  const isPackagedFixture =
    isSaveAndQuitFixture ||
    isRetinueSuccessionFixture ||
    isCommunicationsBoundaryFixture ||
    isMilitaryFoodPoolFixture ||
    isUtilityParityFixture ||
    isResearchQueueFixture ||
    isHousingBlockerFixture ||
    isRailModulesFixture ||
    isDistrictCommandsFixture ||
    isCrimeRecoveryFixture ||
    isMissionMailFixture ||
    isWorldMapEventLogFixture ||
    isMapFoodStorageFixture ||
    isStoragePlanFixture;
  const demoEnabled =
    (typeof __DEV__ === "undefined" || __DEV__) || isPackagedFixture;
  if (!demoEnabled) return base;
  if (params.get("demo") !== "1" && !isPackagedFixture) return base;
  const region = STARTING_REGIONS[0];
  // Optional turn-based override so the UI test (and screenshot tooling) can
  // land directly on the Turn-Based Command panel: ?demo=1&mode=turnbased.
  const turnbased = params.get("mode") === "turnbased";
  // Read-only settlement parity fixture: keep one canonical generic megacity
  // alongside the legacy Mexico City township so both screens exercise the
  // shared operational resolver and its no-nested-record fallback.
  const settlementParityFixture = params.get("settlementparity") === "1";
  // Read-only world-map fixture: preserve the legacy settlement ID in a
  // world-intel entry so the UI must resolve its current public name.
  const worldMapExportRestoreFixture = params.get("worldmaprestore") === "1";
  const worldMapEventLogFixture =
    params.get("worldmaplog") === "1" || worldMapExportRestoreFixture;
  // Optional browser fixture for the map reward storage explanation check:
  // fill the structural food reserve and keep the world-map scout encounter
  // deterministic without touching a player save.
  const mapFoodStorageFixture = params.get("mapfoodstorage") === "1";
  // Optional blocking-crisis injection so the turn-based crisis branch is
  // deterministically reachable: ?demo=1&mode=turnbased&crisis=1 seeds one
  // unresolved high-severity active event. hasBlockingCrisis(state) keys on
  // exactly this (an unresolved high/critical activeEvent), which flips the
  // panel to "RESOLVE CRISIS TO CONTINUE" and disables End Turn. Gated on
  // turn-based mode: a blocking crisis only changes the UI in turn-based, so we
  // ignore a stray crisis=1 in real-time to avoid an ambiguous fixture state.
  const injectCrisis = turnbased && params.get("crisis") === "1";
  // Optional MID-TURN crisis arming so the turn-interrupt path is
  // deterministically reachable: ?demo=1&mode=turnbased&midturncrisis=1 seeds a
  // state with NO active crisis (END TURN stays available) that is guaranteed
  // to spawn one on the very first tick of the next turn. Mechanism:
  // processBiosphere runs on EVERY tick and fires the critical
  // "biosphere_ecosystem_collapse" event whenever cityStats.biosphere <= 15 and
  // negativeEventsAllowed(s) — so we pin biosphere to 5 (updates are
  // incremental, +-1/tick, so it cannot climb past the threshold within a
  // turn) and zero the calm-start window so the gate is open from tick 1.
  // advanceTurn then stops after that first tick with interruptedBy set,
  // which is exactly the "TURN INTERRUPTED" recap the e2e test asserts.
  // Ignored when crisis=1 already injects a blocking event (that fixture
  // blocks END TURN, so a mid-turn interrupt could never be observed).
  const armMidTurnCrisis = turnbased && !injectCrisis && params.get("midturncrisis") === "1";
  // Optional training-speed fixture so the discounted "Training: N ticks"
  // display (Task #528) is deterministically screenshotable:
  // ?demo=1&trainboost=1 seeds two completed Infantry Training Grounds
  // (-20% training time via getTrainingSpeedReduction). This flag composes
  // with traindoctrine=1 for the combined permanent-plus-temporary banner
  // regression fixture.
  const trainBoost = params.get("trainboost") === "1";
  // Optional doctrine fixture for browser-level coverage of the persistent
  // training banner across route transitions:
  // ?demo=1&traindoctrine=1 seeds an active Accelerated Training Doctrine.
  const trainDoctrine = params.get("traindoctrine") === "1";
  // Optional contracts fixture so the task-#581 award states (healthy /
  // STALLED / EXPIRED / COMPLETE) are deterministically screenshotable:
  // ?demo=1&contracts=1. The stalled award needs goods/tick and the fixture
  // zeroes goods — a fresh city's goods income is net-negative, so it stays
  // stalled instead of resuming mid-screenshot.
  const contractsFixture = params.get("contracts") === "1";
  // Optional faction-demand fixture for browser-level coverage:
  // ?demo=1&factiondemand=1 injects a real Free-mode demand card without
  // waiting for the 12-tick cadence.
  const factionDemandFixture = params.get("factiondemand") === "1";
  // Optional multi-response fixture for browser-level rapid-tap coverage:
  // ?demo=1&multiresponse=1 injects one event whose two selectable responses
  // both cost credits, so duplicate confirmation would be visible.
  const multiResponseFixture = params.get("multiresponse") === "1";
  // Optional post-resume fixture for browser-level coverage:
  // ?demo=1&factioncooldowns=1 presents a persisted state after a long resume
  // with one action still cooling down, one expired, and two independently
  // scoped entries (different faction and verb).
  const factionCooldownFixture = params.get("factioncooldowns") === "1";
  // Optional browser fixture for the real-screen relationship boost regression:
  // ?demo=1&relationshipboosts=1&relationshipboostsphase=repeat starts after
  // one gift has been used (the cooldown has elapsed, but the 96-tick fatigue
  // window has not); "recovered" places that use outside the decay window.
  const relationshipBoostFixture = params.get("relationshipboosts") === "1";
  const relationshipBoostPhase = params.get("relationshipboostsphase") ?? "full";
  // Optional browser fixture for the real-screen civic/rival interaction
  // regression. It keeps the city paused and broke so paid actions remain
  // rendered with their affordability reason while the free verbs can still
  // open the shared confirmation menu.
  const relationshipRosterFixture = params.get("relationshiproster") === "1";
  // Complete personal-command smoke fixture: named actors plus a broke,
  // paused city so free actions can be confirmed while paid-action gates stay
  // visible during a refresh-safe, read-only browser run.
  const personalCommandsFixture = params.get("personalcommands") === "1";
  // Optional browser fixture for the real-screen district-command regression.
  // Two wards are deliberately eligible for the same command so the browser
  // check can prove cooldowns are scoped to the district target.
  const districtCommandsFixture = params.get("districtcommands") === "1";
  const districtCommandsCase = params.get("districtcommandscase") ?? "reload";
  const districtCommandsLiveGateFixture = districtCommandsCase === "live-gates";
  const districtCommandsState = districtCommandsFixture
    ? {
        totalTicks: 120,
        tickPaused: districtCommandsLiveGateFixture ? false : true,
        ...(districtCommandsLiveGateFixture ? { tickIntervalMinutes: 1 as const } : {}),
        resources: { ...base.resources, credits: 25_000 },
        districts: base.districts.map((district) =>
          districtCommandsCase === "gates" || districtCommandsLiveGateFixture
            ? district.id === "worker-housing"
              ? {
                  ...district,
                  crime: 20,
                  unrest: 10,
                  loyalty: 50,
                  wealth: 50,
                  infraQuality: districtCommandsLiveGateFixture ? 50 : 49,
                  gangInfluence: districtCommandsLiveGateFixture ? 30 : 29,
                }
              : district.id === "water-processing"
                ? {
                    ...district,
                    crime: 29,
                    unrest: 30,
                    loyalty: 50,
                    wealth: 50,
                    infraQuality: 49,
                    gangInfluence: 29,
                  }
                : district
            : districtCommandsCase === "lay-low-reload"
              ? district.id === "worker-housing"
                ? {
                    ...district,
                    crime: 35,
                    gangInfluence: 37,
                    unrest: 45,
                    loyalty: 25,
                    wealth: 20,
                    infraQuality: 50,
                  }
                : district
            : districtCommandsCase === "heat-sort"
              ? district.id === "worker-housing"
                ? {
                    ...district,
                    crime: 35,
                    gangInfluence: 37,
                    unrest: 45,
                    loyalty: 25,
                    wealth: 20,
                    infraQuality: 50,
                  }
                : district.id === "water-processing"
                  ? {
                      ...district,
                      crime: 62,
                      gangInfluence: 72,
                      unrest: 45,
                      loyalty: 25,
                      wealth: 20,
                      infraQuality: 50,
                    }
                  : {
                      ...district,
                      crime: 12,
                      gangInfluence: 8,
                    }
            : district.id === "worker-housing" || district.id === "water-processing"
              ? {
                  ...district,
                  wealth: 20,
                  unrest: 45,
                  loyalty: 25,
                  infraQuality: 35,
                }
              : district,
        ),
        activeEvents: [],
        messages: [],
        newsFeed: [],
        calmStartTicks: Number.MAX_SAFE_INTEGER,
      }
    : null;
  // Optional browser fixture for the construction batch confirmation flow.
  // `partial` leaves enough credits/steel for only part of a 100-building
  // water-pump batch; `queue` fills every timed-order slot so the same card
  // exercises the visible blocked confirmation path.
  const constructionBatchFixture = params.get("constructionbatch") === "1";
  const constructionBatchPhase = params.get("constructionbatchphase") ?? "partial";
  const constructionBatchReloadFixture =
    constructionBatchFixture &&
    ["save", "load"].includes(params.get("constructionbatchreload") ?? "");
  // Optional browser fixture for the enlarged-text construction quote check.
  // It supplies enough resources for a real storage-building quote while
  // keeping the state paused, event-free, and in-memory only.
  const constructionQuoteFixture = params.get("constructionquote") === "1";
  // Optional browser fixture for the housing warning -> construction-card
  // focus regression. It deliberately removes all built housing capacity,
  // then supplies enough resources for one unambiguous recommendation.
  const housingFixture = params.get("housing") === "1";
  const housingFixtureCase = params.get("housingcase") ?? "full";
  const housingFixtureBuildings = housingFixture
    ? {
        ...base.buildings,
        ...Object.fromEntries(
          HOUSING_CAPACITY_BUILDINGS.map(({ key }) => [key, 0]),
        ),
      }
    : null;
  const housingFixturePendingConstructions =
    housingFixture && housingFixtureCase === "queue"
      ? Array.from({ length: MAX_PENDING_CONSTRUCTION_ORDERS }, (_, index) => ({
          id: `demo-housing-queue-${index}`,
          kind: "city" as const,
          buildingKey: "highDensityResidentialPlatforms",
          label: "HIGH-DENSITY RESIDENTIAL",
          count: 1,
          ticksTotal: 6,
          ticksRemaining: 6,
          orderedTick: base.totalTicks,
        }))
      : [];
  // Optional browser fixture for the full rail-building journey.  It keeps
  // Irongate discovered and allied, unlocks Basic Railways, and supplies
  // enough resources for a real quote/proposal without touching player saves.
  const railCompletionFixture = ["full", "shortage", "upgrades"].includes(params.get("railcompletion") ?? "")
    ? params.get("railcompletion") as "full" | "shortage" | "upgrades"
    : isRailModulesFixture
      ? "upgrades"
      : null;
  const railJourneyFixture = params.get("railjourney") === "1" || !!railCompletionFixture;
  const railJourneyReloadFixture =
    railJourneyFixture &&
    ["save", "load"].includes(params.get("railjourneyreload") ?? "");
  const railCompletionCorridor: RailCorridor | null = railCompletionFixture
    ? {
        version: 1,
        id: "rail:irongate:completion-fixture",
        endpointId: "irongate",
        endpointKind: "township",
        endpointLocationId: "irongate",
        status: "completed",
        proposalTick: Math.max(0, base.totalTicks - 1),
        distance: 44,
        totalTicks: 10,
        progressTicks: 10,
        setbackTicks: 0,
        committedCredits: 2_352,
        committedSteel: 122,
        capabilities: ["commercial", "passenger", "freight", "industrial", "intermodal"],
          staffing: {
          robots: 0,
          engineers: 2,
          railWorkers: 10,
          security: 1,
          ticketing: 1,
          admin: 1,
          maintenance: railCompletionFixture === "shortage" ? 0 : 1,
        },
      }
    : null;
  // Keep the packaged module-reload fixture honest about the engine's
  // operational filter. These corridors carry the same installed IDs as the
  // completed route, but neither is eligible to contribute to readiness:
  // one is still being built and the other is missing an accountable role.
  const railReadinessExcludedCorridors: RailCorridor[] =
    isRailModulesFixture && railCompletionCorridor
      ? [
          {
            ...railCompletionCorridor,
            id: "rail:irongate:readiness-incomplete",
            status: "under_construction",
            progressTicks: 5,
            installedTrainUpgrades: [
              "armored_train_plating",
              "troop_transport_carriages",
              "weaponized_escort_cars",
            ],
          },
          {
            ...railCompletionCorridor,
            id: "rail:irongate:readiness-understaffed",
            status: "completed",
            staffing: { ...railCompletionCorridor.staffing, maintenance: 0 },
            installedTrainUpgrades: [
              "armored_train_plating",
              "troop_transport_carriages",
              "weaponized_escort_cars",
            ],
          },
        ]
      : [];
  // The cooldown phase reuses the same read-only roster but puts the shared
  // FLATTER verb on cooldown for both the civic and rival-leader targets.
  // Save/load phases also seed the cooldown so the browser regression can
  // persist the exact same state before recreating the provider.
  const relationshipRosterCooldownPhase =
    ["cooldown", "save", "load"].includes(params.get("relationshiprosterphase") ?? "");
  // Optional browser fixture for the packaged desktop recovery-link smoke test.
  // It deliberately makes the overview and advisor breakdown cards exercised by
  // the desktop smoke emit actionable suggestions, without touching a real save.
  const recoveryFixture = params.get("recovery") === "1";
  // Optional browser fixture for the crime recovery navigation smoke test.
  // The default variant keeps public-order policies off so the Law screen
  // renders that same-screen recovery hint as guidance. The `crimeorder=1`
  // variant turns surveillance on so the mining hint is also in the visible
  // top-three suggestions.
  const crimeRecoveryFixture = params.get("crime") === "1";
  const crimeRecoveryPublicOrder = params.get("crimeorder") === "1";
  // Optional browser fixture for the real-screen biosphere risk ticker check:
  // start at biosphere 67 (LOW risk) with exactly three points of controlled
  // neglect per tick, then let the real turn-based END TURN action move it into
  // the EASING band and emit the engine's warning news fact.
  const biosphereRiskTickerFixture = params.get("biosphereticker") === "1";
  // Optional browser fixture for the run-summary infrastructure layout check:
  // use million- and billion-scale totals without touching a player save, so
  // compact formatting, exact accessible labels, and responsive metric boxes
  // are exercised by the real screen.
  const summaryExtremeFixture = params.get("summaryextreme") === "1";
  // Optional browser fixture for the medical reserve readout and reward
  // summaries. The case is selected by `medicalstoragecase` so each screen
  // starts from a deterministic, in-memory state: live, offline, event, or
  // wildlands.
  const medicalStorageFixture = params.get("medicalstorage") === "1";
  const medicalStorageCase = params.get("medicalstoragecase") ?? "live";
  // Optional legacy-save fixture for the production-chain browser regression:
  // ?demo=1&legacyproduction=1 deliberately omits every civilian production
  // building key and every military installation key. This must stay
  // in-memory only so the screen can exercise the zero-safe live-state reads
  // without creating or mutating a real save.
  const legacyProductionFixture = params.get("legacyproduction") === "1";
  // Optional browser fixture for the no-capacity research regression:
  // ?demo=1&researchzero=1 keeps the full research catalog visible while
  // removing every facility, specialist, and licensed-company contributor.
  // The active project makes the player-facing STALLED estimate observable.
  const researchZeroCapacityFixture = params.get("researchzero") === "1";
  // Optional browser fixture for the live queue ETA regression:
  // ?demo=1&researchqueue=1&go=research renders one active project followed
  // by two queued technologies. The variant changes one live estimate input
  // at a time so the browser check can prove the cards are not stale.
  const researchQueueFixture = params.get("researchqueue") === "1";
  const researchQueueVariant = params.get("researchqueuevariant") ?? "base";
  const researchQueueCase = params.get("researchqueuecase") === "empty" ? "empty" : "active";
  // Optional browser fixture for the utility production parity regression:
  // ?demo=1&utilityparity=1 combines technology, policy, licensed companies,
  // operational megaprojects, prestige, speed, and a spring->summer boundary.
  const utilityParityFixture = params.get("utilityparity") === "1";
  const utilityParityCompanyStatus =
    params.get("utilityparitystatus") === "quarantined" ? "quarantined" : undefined;
  // Optional browser fixture for the critical communications breakdown:
  // ?demo=1&criticalcomms=1 keeps the normal asset inventory but pins the
  // live signal below the shared low-signal threshold. This is deliberately
  // in-memory only so the desktop wrapper can verify the corruption warning
  // without creating or mutating a real save.
  const criticalCommunicationsFixture = params.get("criticalcomms") === "1";
  // Optional browser fixture for the exact low-signal boundary:
  // ?demo=1&boundarycomms=1 pins the live signal to exactly 30%, where the
  // shared contract moves from CRITICAL to DEGRADED without a penalty.
  const boundaryCommunicationsFixture = params.get("boundarycomms") === "1";
  // Optional browser fixture for the squad assignment/reload regression:
  // ?demo=1&retinue=1 starts with an infantry + heavy gunner squad and a
  // ready marksman waiting in the roster. The assignment browser test saves
  // only after confirming the marksman, then reloads through the normal save
  // pipeline to verify the composition and power remain consistent.
  const retinueAssignmentFixture = params.get("retinue") === "1";
  // Optional browser fixture for the squad leadership/doctrine reload
  // regression: ?demo=1&retinueleadership=1 starts with a leaderless squad
  // and one available captain. The browser test appoints the captain,
  // switches to Assault doctrine, then reloads the isolated save.
  const retinueLeadershipFixture = params.get("retinueleadership") === "1";
  // Optional browser fixture for the squad operation launch/return regression:
  // ?demo=1&retinueoperation=1 starts with an eligible captain-led squad
  // already set to Assault doctrine. Its intentionally high combat power
  // makes the selected operation's success deterministic in the real UI.
  const retinueOperationFixture = params.get("retinueoperation") === "1";
  // Optional browser fixture for the black-market audit save/reload
  // regression: ?demo=1&blackmarketaudit=1 starts with enough credits for a
  // real purchase and an otherwise quiet, empty audit trail.
  const blackMarketAuditFixture = params.get("blackmarketaudit") === "1";
  // Optional browser fixture for the military reserve save/reload regression:
  // ?demo=1&militaryfoodpool=1 keeps the active Army reserves visibly
  // different from the open-ended logistics stockpiles.
  const militaryFoodPoolFixture = params.get("militaryfoodpool") === "1";
  // Optional browser fixture for the mission-success inbox dismissal/reload
  // regression: seed one canonical unread success message without touching a
  // player save slot.
  const missionMailFixture = params.get("missionmail") === "1";
  // Optional browser fixture for the asset-upgrade display-name regression:
  // make the first unit upgrade eligible with a known research unlock and
  // inventory item so the real upgrades screen and apply confirmation can
  // prove they render friendly labels instead of raw IDs.
  const upgradeLabelsFixture = params.get("upgradelabels") === "1";
  const missionMailResult: MissionResult = {
    missionId: "trade_negotiation",
    officerName: "Ada Vance",
    success: true,
    message: "Ada Vance completed Trade Negotiation successfully!",
    rewards: ["+60,000 credits"],
  };
  const missionMailMessage = generateMissionMessage(
    missionMailResult,
    base.gameDate,
    42,
  );
  // Keep this legacy fixture on the standard three-choice demand path. The
  // Administrative Bloc has its own four-choice operational demand contract.
  const factionDemandFaction =
    base.factions.find((faction) => faction.isActive && faction.id !== ADMINISTRATIVE_BLOC_ID) ??
    base.factions.find((faction) => faction.id !== ADMINISTRATIVE_BLOC_ID);
  const factionDemandState = factionDemandFaction
    ? {
        ...base,
        factions: base.factions.map((faction) =>
          faction.id === factionDemandFaction.id
            ? { ...faction, influence: Math.max(25, faction.influence), threat: Math.max(25, faction.threat) }
            : faction,
        ),
      }
    : base;
  const makeFixtureTroop = (id: string, classId: Troop["classId"], squadId: string | null): Troop => ({
    id,
    classId,
    tier: "enforcer",
    level: 1,
    xp: 0,
    xpToNext: 100,
    hp: 100,
    maxHp: 100,
    combat: 10,
    morale: 100,
    kills: 0,
    missionsCompleted: 0,
    status: "ready",
    squadId,
    hiredTick: 0,
  });
  const makeFixtureCaptain = (
    id: string,
    name: string,
    squadId: string,
  ): Captain => ({
    id,
    name,
    title: "Captain",
    level: 1,
    xp: 0,
    xpToNext: 100,
    leadership: 12,
    combat: 10,
    tactics: 8,
    loyalty: 60,
    squadId,
    kills: 0,
    battlesWon: 0,
    battlesLost: 0,
    trait: "tactician",
    status: "active",
    equippedItemIds: [],
    hiredTick: 0,
  });
  const retinueAssignmentState: RetinueState = {
    ...createDefaultRetinueState(),
    squads: [
      {
        id: "demo-assignment-squad",
        name: "COMBINED ARMS",
        role: "assault",
        doctrine: "balanced",
        captainId: null,
        troopIds: ["demo-infantry", "demo-gunner"],
        maxSize: 4,
        formationBonus: 0,
        totalKills: 0,
        deploymentsCompleted: 0,
        created: 0,
      },
    ],
    troops: [
      makeFixtureTroop("demo-infantry", "infantry", "demo-assignment-squad"),
      makeFixtureTroop("demo-gunner", "heavy_gunner", "demo-assignment-squad"),
      makeFixtureTroop("demo-marksman", "marksman", null),
    ],
  };
  const retinueLeadershipSquadId = "demo-leadership-squad";
  const retinueLeadershipState: RetinueState = {
    ...createDefaultRetinueState(),
    squads: [
      {
        id: retinueLeadershipSquadId,
        name: "COMMAND POST",
        role: "assault",
        doctrine: "balanced",
        captainId: null,
        troopIds: ["demo-leadership-infantry", "demo-leadership-gunner"],
        maxSize: 4,
        formationBonus: 0,
        totalKills: 0,
        deploymentsCompleted: 0,
        created: 0,
      },
    ],
    captains: [
      makeFixtureCaptain("demo-leadership-captain", "CAPTAIN RHEA", ""),
    ],
    troops: [
      makeFixtureTroop("demo-leadership-infantry", "infantry", retinueLeadershipSquadId),
      makeFixtureTroop("demo-leadership-gunner", "heavy_gunner", retinueLeadershipSquadId),
    ],
  };
  const retinueOperationSquadId = "demo-operation-squad";
  const retinueOperationCaptainId = "demo-operation-captain";
  const retinueOperationState: RetinueState = {
    ...createDefaultRetinueState(),
    squads: [
      {
        id: retinueOperationSquadId,
        name: "FIELD RESPONSE",
        role: "assault",
        doctrine: "assault",
        captainId: retinueOperationCaptainId,
        troopIds: ["demo-operation-infantry", "demo-operation-gunner"],
        maxSize: 4,
        formationBonus: 0,
        totalKills: 0,
        deploymentsCompleted: 0,
        created: 0,
      },
    ],
    captains: [
      makeFixtureCaptain(
        retinueOperationCaptainId,
        "CAPTAIN VOSS",
        retinueOperationSquadId,
      ),
    ],
    troops: [
      { ...makeFixtureTroop("demo-operation-infantry", "infantry", retinueOperationSquadId), combat: 100 },
      { ...makeFixtureTroop("demo-operation-gunner", "heavy_gunner", retinueOperationSquadId), combat: 100 },
    ],
  };
  const retinueSuccessionSquadId = "demo-succession-squad";
  const retinueSuccessionState: RetinueState = {
    ...createDefaultRetinueState(),
    squads: [
      {
        id: retinueSuccessionSquadId,
        name: "SUCCESSION WATCH",
        role: "assault",
        doctrine: "balanced",
        captainId: "demo-succession-captain",
        deputyCaptainId: null,
        troopIds: ["demo-succession-infantry", "demo-succession-gunner"],
        maxSize: 6,
        formationBonus: 0,
        totalKills: 0,
        deploymentsCompleted: 0,
        created: 0,
      },
    ],
    captains: [
      makeFixtureCaptain(
        "demo-succession-captain",
        "CAPTAIN VOSS",
        retinueSuccessionSquadId,
      ),
      makeFixtureCaptain("demo-succession-deputy", "CAPTAIN ORIN", ""),
      makeFixtureCaptain("demo-succession-reserve", "CAPTAIN HALE", ""),
    ],
    troops: [
      makeFixtureTroop(
        "demo-succession-infantry",
        "infantry",
        retinueSuccessionSquadId,
      ),
      makeFixtureTroop(
        "demo-succession-gunner",
        "heavy_gunner",
        retinueSuccessionSquadId,
      ),
    ],
  };
  const factionCooldownTick = 240;
  const factionCooldownState = {
    totalTicks: factionCooldownTick,
    // Keep the fixture stable while the browser checks the rendered menu.
    tickPaused: true,
    lastTickTime: Date.now(),
    personalActionCooldowns: {
      // Still cooling after resume: 9 ticks remain.
      [factionDiplomacyCooldownKey("judges", "negotiate")]: factionCooldownTick + 9,
      // Same faction, different verb: its own 4-tick cooldown remains.
      [factionDiplomacyCooldownKey("judges", "grant-honor")]: factionCooldownTick + 4,
      // Different faction is ready even though judges/negotiate is cooling.
      [factionDiplomacyCooldownKey("gangs", "negotiate")]: factionCooldownTick - 1,
    },
  };
  const relationshipOfficer = base.officers[0];
  const relationshipBoostTick = 200;
  const relationshipBoostUseTick =
    relationshipBoostPhase === "repeat"
      ? relationshipBoostTick - 20
      : relationshipBoostPhase === "recovered"
        ? relationshipBoostTick - PERSONAL_ACTION_DECAY_WINDOW_TICKS - 1
        : null;
  const relationshipBoostState = relationshipOfficer
    ? {
        totalTicks: relationshipBoostTick,
        tickPaused: true,
        lastTickTime: Date.now(),
        resources: { ...base.resources, credits: 10_000 },
        officers: base.officers.map((officer) =>
          officer.id === relationshipOfficer.id ? { ...officer, appointed: true } : officer,
        ),
        innerCircle: {
          ...createDefaultInnerCircleState(),
          members: [
            {
              officerId: relationshipOfficer.id,
              role: "chief_advisor" as const,
              level: 1,
              xp: 0,
              xpToNext: 100,
              perksUnlocked: [],
              appointed: 0,
            },
          ],
        },
        personalActionHistory:
          relationshipBoostUseTick == null
            ? {}
            : {
                [personalCooldownKey({ kind: "faction", id: "judges" }, "give-gift")]: [
                  relationshipBoostUseTick,
                ],
                [personalCooldownKey({ kind: "officer", id: relationshipOfficer.id }, "give-gift")]: [
                  relationshipBoostUseTick,
                ],
              },
      }
    : null;
  const relationshipRosterState = relationshipRosterFixture
    ? {
        totalTicks: 120,
        tickPaused: true,
        resources: { ...base.resources, credits: 0 },
        officers: base.officers.map((officer) =>
          officer.id === "urban-services-director"
            ? { ...officer, name: "Director Mira Vale", appointed: false }
            : officer.id === base.officers[0]?.id
              ? { ...officer, name: "Chief Marshal Lysa Venn", appointed: true }
              : officer,
        ),
        innerCircle: {
          ...createDefaultInnerCircleState(),
          members: base.officers[0]
            ? [
                {
                  officerId: base.officers[0].id,
                  role: "chief_advisor" as const,
                  level: 1,
                  xp: 0,
                  xpToNext: 100,
                  perksUnlocked: [],
                  appointed: 0,
                },
              ]
            : [],
        },
        ...(relationshipRosterCooldownPhase
          ? {
              personalActionCooldowns: {
                [personalCooldownKey(
                  { kind: "civic", id: "urban-services-director" },
                  "flatter",
                )]: 128,
                [personalCooldownKey({ kind: "leader", id: "gangs" }, "flatter")]: 127,
                ...(base.officers[0]
                  ? {
                      [personalCooldownKey(
                        { kind: "officer", id: base.officers[0].id },
                        "flatter",
                      )]: 128,
                    }
                  : {}),
              },
            }
          : null),
      }
    : null;
  const personalCommandsState = personalCommandsFixture
    ? {
        totalTicks: 120,
        tickPaused: true,
        resources: { ...base.resources, credits: 0 },
        officers: base.officers.map((officer) =>
          officer.id === "urban-services-director"
            ? { ...officer, name: "Director Mira Vale", appointed: false }
            : officer.id === base.officers[0]?.id
              ? { ...officer, name: "Chief Marshal Lysa Venn", appointed: true }
              : officer,
        ),
        innerCircle: {
          ...createDefaultInnerCircleState(),
          members: base.officers[0]
            ? [
                {
                  officerId: base.officers[0].id,
                  role: "chief_advisor" as const,
                  level: 1,
                  xp: 0,
                  xpToNext: 100,
                  perksUnlocked: [],
                  appointed: 0,
                },
              ]
            : [],
        },
        activeEvents: [],
        messages: [],
        newsFeed: [],
        calmStartTicks: Number.MAX_SAFE_INTEGER,
      }
    : null;
  const militaryFoodPoolMilitary =
    base.militaryOverhaul ?? createDefaultMilitaryState();
  const activeEvents: GameEvent[] = injectCrisis
    ? [
        {
          id: "demo-crisis-1",
          title: "DEBUG: Sector Uprising",
          severity: "high",
          effects: { unrest: 10, lawOrder: -5 },
          timestamp: Date.now(),
          resolved: false,
        },
      ]
    : multiResponseFixture
      ? [
          {
            id: "demo-multi-response-1",
            title: "DEBUG: MULTI-CHOICE DECISION",
            severity: "medium",
            effects: {},
            timestamp: 1,
            resolved: false,
            responseOptions: [
              {
                id: "demo-multi-response-relay",
                label: "FUND THE RELAY",
                effects: { credits: -1000, happiness: 1 },
              },
              {
                id: "demo-multi-response-clinic",
                label: "SUPPLY THE CLINIC",
                effects: { credits: -2000, happiness: 1 },
              },
            ],
            maxResponses: 2,
          },
        ]
    : factionDemandFixture && factionDemandFaction
      ? [makeFactionDemandEvent(factionDemandState, factionDemandState.factions.find((faction) => faction.id === factionDemandFaction.id)!)]
      : base.activeEvents;
  return {
    ...base,
    cityName: "MEGACITY JUAN",
    playerTitle: "City Commander",
    startingRegion: region.id,
    playerCityPosition: { x: region.playerX, y: region.playerY },
    discoveredLocationIds: settlementParityFixture || worldMapEventLogFixture
      ? Array.from(new Set([
          ...region.initialDiscovered,
          "terminus-prime",
          "dusthaven",
          "iron-khanate",
          "nova-pacifica",
          "crimson-reach",
          "cheyenne-mountain",
        ]))
      : worldMapExportRestoreFixture
        ? Array.from(new Set([...region.initialDiscovered, "cheyenne-mountain"]))
      : [...region.initialDiscovered],
    difficulty: "medium",
    hasCompletedOnboarding: true,
    onboardingStep: undefined,
    gameplayMode: turnbased ? "turnbased" : base.gameplayMode,
    activeEvents,
    ...(worldMapEventLogFixture
      ? {
          worldEventLog: [
            {
              tick: 1,
              event: "legacy-dusthaven-discovery",
              type: "discovery",
              timestamp: 1,
              title: "Legacy Dusthaven location record",
              description: "Archived cartography still names Dusthaven while retaining the location identifier for compatibility.",
              revealed: "dusthaven",
            },
            {
              tick: 2,
              event: "legacy-iron-khanate-discovery",
              type: "discovery",
              timestamp: 2,
              title: `Legacy ${["Iron", "Khanate"].join(" ")} location record`,
              description: `Archived cartography still names ${["Iron", "Khanate"].join(" ")} while retaining the location identifier for compatibility.`,
              revealed: "iron-khanate",
            },
            {
              tick: 3,
              event: "legacy-nova-pacifica-discovery",
              type: "discovery",
              timestamp: 3,
              title: "Legacy Nova Pacifica location record",
              description: "Archived cartography still names Nova Pacifica while retaining the location identifier for compatibility.",
              revealed: "nova-pacifica",
            },
            {
              tick: 4,
              event: "legacy-crimson-reach-discovery",
              type: "discovery",
              timestamp: 4,
              title: "Legacy Crimson Reach location record",
              description: "Archived cartography still names Crimson Reach while retaining the location identifier for compatibility.",
              revealed: "crimson-reach",
            },
            {
              tick: 5,
              event: "legacy-cheyenne-mountain-discovery",
              type: "discovery",
              timestamp: 5,
              title: "Legacy Cheyenne Mountain location record",
              description: "Archived cartography still names Cheyenne Mountain while retaining the location identifier for compatibility.",
              revealed: "cheyenne-mountain",
            },
          ],
        }
      : null),
    ...(worldMapExportRestoreFixture
      ? {
          // Export the old persisted presentation, then let the real import
          // migration restore the current Mexico City catalog data.
          townships: base.townships?.map((township) =>
            township.id === "dusthaven"
              ? {
                  ...township,
                  name: "Dusthaven",
                  description: "A scrappy frontier settlement.",
                  population: 3000,
                  leader: {
                    name: "Elder Ria Dustwalker",
                    portraitId: "ria_dustwalker",
                    title: "Settlement Elder",
                    attitude: "friendly",
                    goals: ["Secure water supply"],
                    personalityTraits: ["resilient"],
                  },
                }
              : township,
          ),
          tickPaused: true,
          messages: [],
          newsFeed: [],
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(mapFoodStorageFixture
      ? {
          resources: {
            ...base.resources,
            credits: 100_000,
            food: 1_000,
          },
          buildings: {
            ...base.buildings,
            agriculturalDomeDistrict: 0,
          },
          // Keep the target visible and remove every undiscovered neighbor so
          // the scout action reaches the encounter roll without a discovery
          // random draw. The browser then supplies the encounter-roll sequence.
          discoveredLocationIds: WORLD_LOCATIONS.map((location) => location.id),
          activeEvents: [],
          messages: [],
          newsFeed: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(settlementParityFixture
      ? {
          // Deliberately remove the nested operational record from the legacy
          // township. The UI must resolve its safe profile fallback on both
          // Diplomacy and World Map.
          townships: base.townships?.map((township) =>
            township.id === "dusthaven"
              ? { ...township, operational: undefined }
              : township,
          ),
          tickPaused: true,
          messages: [],
          newsFeed: [],
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(factionDemandFixture ? { factions: factionDemandState.factions } : null),
    ...(factionCooldownFixture ? factionCooldownState : null),
    ...(relationshipBoostFixture && relationshipBoostState ? relationshipBoostState : null),
    ...(relationshipRosterFixture && relationshipRosterState ? relationshipRosterState : null),
    ...(personalCommandsFixture && personalCommandsState ? personalCommandsState : null),
    ...(districtCommandsFixture && districtCommandsState ? districtCommandsState : null),
    ...(researchZeroCapacityFixture
      ? {
          buildings: {
            ...base.buildings,
            advancedResearchLabs: 0,
            cyberneticsDevelopmentFacilities: 0,
            forensicScienceInstitutes: 0,
            experimentalTechVaults: 0,
            urbanSystemsAICenters: 0,
            archiveRecoveryLabs: 0,
            medicalResearchComplexes: 0,
            weaponDevelopmentFacilities: 0,
            quantumDataCenters: 0,
            predictiveAnalyticsSupercomputers: 0,
            oracleChambers: 0,
            geneVaults: 0,
          },
          units: {
            ...base.units,
            researchScientists: 0,
            aiSystemsEngineers: 0,
            cyberneticsResearchers: 0,
            experimentalPhysicsTeams: 0,
            dataArchiveAnalysts: 0,
          },
          companies: [],
          activeResearch: {
            techId: "advanced_fusion_reactors",
            progress: 0,
            cost: 2400,
          },
          researchQueue: ["magnetic_rail_transit"],
          activeEvents: [],
          messages: [],
          newsFeed: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(researchQueueFixture
      ? {
          buildings: {
            ...base.buildings,
            advancedResearchLabs: researchQueueVariant === "high-output" ? 4 : 2,
          },
          units: {
            ...base.units,
            researchScientists: 5,
            aiSystemsEngineers: 0,
            cyberneticsResearchers: 0,
            experimentalPhysicsTeams: 0,
            dataArchiveAnalysts: 0,
          },
          difficulty: researchQueueVariant === "hard" ? "hard" : "medium",
          tickIntervalMinutes: researchQueueVariant === "slow" ? 60 : 15,
          activeResearch: researchQueueCase === "empty"
            ? null
            : {
                techId: "advanced_fusion_reactors",
                progress: 120,
                cost: 2400,
              },
          researchQueue: ["magnetic_rail_transit", "autonomous_freight_networks"],
          activeEvents: [],
          messages: [],
          newsFeed: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(retinueAssignmentFixture
      ? {
          retinue: retinueAssignmentState,
          tickPaused: true,
        }
      : null),
    ...(retinueLeadershipFixture
      ? {
          retinue: retinueLeadershipState,
          totalTicks: 120,
          personalActionCooldowns: {
            [personalCooldownKey(
              { kind: "captain", id: "demo-leadership-captain" },
              "flatter",
            )]: 128,
          },
          tickPaused: true,
        }
      : null),
    ...(retinueOperationFixture
      ? {
          retinue: retinueOperationState,
          gameplayMode: "turnbased",
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
          activeEvents: [],
          // Keep the operation browser check focused on the Retinue lifecycle.
          // Event-chain triggers run on an independent eight-tick cadence and
          // would otherwise add an unrelated interactive card during the
          // three-turn completion path.
          eventChainCooldowns: Object.fromEntries(
            EVENT_CHAINS.map((chain) => [chain.id, Number.MAX_SAFE_INTEGER]),
          ),
        }
      : null),
    ...(blackMarketAuditFixture
      ? {
          resources: { ...base.resources, credits: 100_000 },
          blackMarketHistory: [],
          activeEvents: [],
          messages: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(constructionBatchFixture
      ? {
          resources: {
            ...base.resources,
            credits: constructionBatchPhase === "queue" ? 500_000 : 42_000,
            steel: constructionBatchPhase === "queue" ? 5_000 : 300,
          },
          pendingConstructions:
            constructionBatchPhase === "queue"
              ? Array.from({ length: MAX_PENDING_CONSTRUCTION_ORDERS }, (_, index) => ({
                  id: `demo-construction-queue-${index}`,
                  kind: "city" as const,
                  buildingKey: "waterPumpStations",
                  label: "WATER PUMP STATIONS",
                  count: 1,
                  ticksTotal: 6,
                  ticksRemaining: 6,
                  orderedTick: base.totalTicks,
                }))
              : [],
          gameplayMode: constructionBatchReloadFixture ? "turnbased" : base.gameplayMode,
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
          activeEvents: [],
          messages: [],
          newsFeed: [],
          // Keep the reload check focused on construction completion. Event
          // chains use their own eight-tick trigger cadence and do not read
          // the per-save calm-start window, so suppress every chain only in
          // this disposable fixture.
          eventChainCooldowns: Object.fromEntries(
            EVENT_CHAINS.map((chain) => [chain.id, Number.MAX_SAFE_INTEGER]),
          ),
        }
      : null),
    ...(constructionQuoteFixture
      ? {
          resources: {
            ...base.resources,
            credits: 500_000,
            steel: 5_000,
          },
          pendingConstructions: [],
          activeEvents: [],
          messages: [],
          newsFeed: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(housingFixture
      ? {
          buildings: housingFixtureBuildings!,
          resources: {
            ...base.resources,
            credits: housingFixtureCase === "credits" ? 0 : 100_000,
            steel: housingFixtureCase === "steel" ? 0 : 500,
          },
          pendingConstructions: housingFixturePendingConstructions,
          // Keep each housing case focused on the recommendation itself.
          // In particular, a full queue must not surface unrelated events.
          activeEvents: [],
          messages: [],
          newsFeed: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(railJourneyFixture
      ? {
          resources: {
            ...base.resources,
            credits: 250_000,
            steel: 25_000,
          },
           unlockedTechnologies: Array.from(new Set([
             ...(base.unlockedTechnologies || []),
             "basic_railways",
               ...(railCompletionFixture
                ? ["advanced_train_designs", "railway_electrification", "rail_freight_systems", "passenger_intermodal_rail", "magnetic_levitation_rail",
                  ...(railCompletionFixture === "upgrades" ? ["armored_train_plating", "troop_transport_carriages", "weaponized_escort_cars"] : [])]
               : []),
           ])),
          discoveredLocationIds: Array.from(new Set([...(base.discoveredLocationIds || []), "irongate"])),
           railCorridors: railCompletionCorridor
             ? [railCompletionCorridor, ...railReadinessExcludedCorridors]
             : [],
          gameplayMode: railJourneyReloadFixture ? "turnbased" : base.gameplayMode,
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
          activeEvents: [],
          messages: [],
          newsFeed: [],
        }
      : null),
    ...(militaryFoodPoolFixture
      ? {
          militaryOverhaul: {
            ...militaryFoodPoolMilitary,
            standingArmy: {
              ...militaryFoodPoolMilitary.standingArmy,
              readiness: 30,
              morale: 60,
            },
            logistics: {
              ...militaryFoodPoolMilitary.logistics,
              supplyStatus: "critical" as const,
              suppliesTicksRemaining: { ammo: 12, fuel: 2, rations: 8 },
            },
          },
          resources: {
            ...base.resources,
            ammo: 111,
            fuel: 222,
            food: 333,
          },
          stockpiles: {
            ...base.stockpiles,
            ammo: 1_111,
            fuel: 2_222,
            vehicleParts: 3_333,
          },
          activeEvents: [],
          messages: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(missionMailFixture
      ? {
          messages: [missionMailMessage],
          dismissedMessageIds: [],
          activeEvents: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(upgradeLabelsFixture
      ? {
          resources: { ...base.resources, credits: 100_000 },
          units: { ...base.units, cityDefenseInfantry: 1_000 },
          unlockedTechnologies: Array.from(
            new Set([...(base.unlockedTechnologies ?? []), "tactical_exoskeleton_armor"]),
          ),
          inventory: {
            ...(base.inventory ?? {
              items: [],
              maxSlots: 30,
              totalItemsFound: 0,
              totalItemsSold: 0,
            }),
            items: [
              ...(base.inventory?.items ?? []).filter((item) => item.defId !== "flak_vest"),
              { id: "e2e-upgrade-flak-vest", defId: "flak_vest", quantity: 2, equippedTo: null },
            ],
            totalItemsFound: Math.max(2, base.inventory?.totalItemsFound ?? 0),
          },
          activeEvents: [],
          messages: [],
          newsFeed: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
    ...(isRetinueSuccessionFixture
      ? {
          retinue: retinueSuccessionState,
          tickPaused: true,
        }
      : null),
    // One licensed company so commercial-licensing income surfaces in
    // screenshots: the COMMERCIAL LICENSING ledger line on /economy and the
    // PAYING +N/tick footer on the active card in /companies (Task #582).
    companies: [
      {
        companyId: "helios-grid",
        districtId: base.districts[0]?.id ?? "district-1",
        licenseDate: 0,
      },
    ],
    ...(armMidTurnCrisis
      ? {
          calmStartTicks: 0,
          cityStats: { ...base.cityStats, biosphere: 5 },
        }
      : null),
    ...(contractsFixture
      ? (() => {
          const mk = (o: Partial<ContractInstance> & Pick<ContractInstance, "id" | "defId" | "contractorId">): ContractInstance => ({
            districtId: "district-1",
            status: "active",
            progress: 0,
            startTick: 0,
            ticksElapsed: 0,
            totalPaid: 0,
            procurementMethod: "openTender",
            delaysOccurred: 0,
            overrunCost: 0,
            events: [],
            ...o,
          });
          return {
            resources: { ...base.resources, goods: 0 },
            activeContracts: [
              mk({ id: "demo-ct-healthy", defId: "ct-power-substation", contractorId: "voltex-energy", progress: 42, ticksElapsed: 8, totalPaid: 7800, events: ["Tick 0: Contract awarded via openTender"] }),
              mk({ id: "demo-ct-stalled", defId: "ct-micro-housing-200", contractorId: "hab-solutions", progress: 30, ticksElapsed: 25, totalPaid: 8000, stallWarned: true, events: ["Tick 24: Stalled — insufficient materials", "Tick 25: Stalled — insufficient materials"] }),
            ],
            completedContracts: [
              mk({ id: "demo-ct-done", defId: "ct-med-supply", contractorId: "medicore-health", status: "completed", progress: 100, ticksElapsed: 17, totalPaid: 6240 }),
              mk({ id: "demo-ct-expired", defId: "ct-steel-supply", contractorId: "freighthub-logistics", status: "expired", progress: 21, ticksElapsed: 72, totalPaid: 10640, events: ["Tick 72: Contract expired — scrapped at 21% complete, nothing delivered"] }),
            ],
          };
        })()
      : null),
    ...(recoveryFixture
      ? {
          buildings: {},
          units: {},
          companies: [],
          // Keep the infrastructure card's less-common industrial tip within
          // its four-row desktop presentation. The edict branch is already
          // covered by the law destinations on the other recovery cards.
          activeEdicts: [
            {
              edictId: "water_main_emergency",
              ticksRemaining: 4,
              issuedAtTick: 0,
              cooldownUntilTick: 20,
            },
          ],
          activePolicies: [],
          resources: {
            ...base.resources,
            credits: 0,
            steel: 0,
            power: -10,
            medSupplies: 0,
            food: 0,
            water: 0,
          },
          // The overview breakdown consumes the authoritative live rates.
          // Keep this fixture's empty water reserve paired with an actual
          // water shortage so the megaproject recovery action remains visible.
          rates: {
            ...base.rates,
            waterProduction: 0,
            waterConsumption: 102,
          },
          utilities: { ...base.utilities, sanitationLevel: 5 },
          cityStats: {
            ...base.cityStats,
            infrastructureHealth: 10,
            employment: 40,
            population: 600_000,
            publicHealth: 1,
            diseaseRisk: 90,
            biosphere: 5,
            defenseRating: 10,
          },
        }
      : null),
    ...(crimeRecoveryFixture
      ? {
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
          activeEvents: [],
          messages: [],
          newsFeed: [],
          buildings: {},
          units: {},
          policies: {
            ...base.policies,
            martialLaw: false,
            curfewEnabled: false,
            surveillanceActive: crimeRecoveryPublicOrder,
          },
          activeMiningPolicies: ["black_market_ore"],
          resources: {
            ...base.resources,
            food: 0,
          },
          cityStats: {
            ...base.cityStats,
            crime: 80,
            unrest: 80,
            happiness: 20,
            diseaseRisk: 80,
            biosphere: 10,
            lawOrder: 20,
          },
        }
      : null),
    ...(biosphereRiskTickerFixture
      ? {
          gameplayMode: "turnbased",
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
          activeEvents: [],
          activePolicies: [],
          buildings: {},
          units: {},
          cityStats: {
            ...base.cityStats,
            biosphere: 67,
            biosphereRecoveryProgress: 0,
            crime: 80,
            infrastructureHealth: 10,
          },
          lastSeenBiosphereCrisisTier: "low",
          messages: [],
          newsFeed: [],
        }
      : null),
    ...(medicalStorageFixture
      ? (() => {
          const isLive = medicalStorageCase === "live";
          const isOffline = medicalStorageCase === "offline" || medicalStorageCase === "reload";
          const isReload = medicalStorageCase === "reload";
          const isEvent = medicalStorageCase === "event";
          const isWildlands = medicalStorageCase === "wildlands";
          const medicalEvent: GameEvent = {
            id: "demo-medical-storage-event",
            title: "DEBUG: MEDICAL RELIEF SHIPMENT",
            severity: "medium",
            effects: { medSupplies: 400 },
            timestamp: Date.now(),
            resolved: false,
            responseOptions: [{
              id: "demo-medical-storage-response",
              label: "RECEIVE THE SHIPMENT",
              effects: { medSupplies: 400 },
            }],
          };
          return {
            gameplayMode: isOffline ? "realtime" : "turnbased",
            // Turn-based End Turn uses the shared live pipeline directly and
            // must not inherit the base state's paused startup flag. The
            // offline case also needs the unpaused state so the catch-up
            // pipeline takes its real resume branch.
            tickPaused: false,
            lastTickTime: isOffline ? Date.now() - 31 * 60 * 1000 : Date.now(),
            tickIntervalMinutes: 15,
            calmStartTicks: Number.MAX_SAFE_INTEGER,
            activeEvents: isEvent ? [medicalEvent] : [],
            eventHistory: [],
            tickLog: [],
            messages: [],
            buildings: isLive || (isOffline && !isReload)
              ? { medicalResearchComplexes: 27 }
              : isReload
                ? { publicHealthMegaClinics: 1 }
                : {},
            units: {},
            resources: {
              ...base.resources,
              medSupplies: isWildlands || medicalStorageCase === "economy"
                ? 5_000
                : isReload
                  ? 6_000
                  : 4_900,
            },
            rates: {
              ...base.rates,
              medProduction: isLive || isOffline ? 405 : 0,
            },
            cityStats: {
              ...base.cityStats,
              population: 80_000,
            },
            wildlandsProjects: isWildlands
              ? [{
                  id: "demo-medical-storage-wildlands",
                  kind: "restoration" as const,
                  biome: "ash_forest" as const,
                  ticksRemaining: 1,
                  totalTicks: 1,
                  status: "active" as const,
                  startedAtTick: 0,
                }]
              : [],
          };
        })()
      : null),
    ...(trainBoost
      ? (() => {
          // militaryOverhaul is optional on a fresh state (created lazily by
          // the engine), so build defaults before layering the fixture.
          const overhaul = base.militaryOverhaul ?? createDefaultMilitaryState();
          const logistics = overhaul.logistics ?? createDefaultLogisticsState();
          return {
            militaryOverhaul: {
              ...overhaul,
              logistics: {
                ...logistics,
                installationsBuilt: {
                  ...(logistics.installationsBuilt ?? {}),
                  infantry_training_grounds: 2,
                },
              },
            },
          };
        })()
      : null),
    ...(trainDoctrine
      ? {
          // Keep the multi-turn banner regression deterministic: this fixture
          // is about doctrine expiry, not crisis interruption.
          calmStartTicks: Number.MAX_SAFE_INTEGER,
          activeEdicts: [
            {
              edictId: TRAINING_EDICT_ID,
              ticksRemaining: 12,
              issuedAtTick: base.totalTicks,
              cooldownUntilTick: base.totalTicks + 24,
            },
          ],
        }
      : null),
    ...(legacyProductionFixture
      ? (() => {
          // Keep the military state structurally valid while omitting the
          // installation keys that an older save would not have written.
          const overhaul = base.militaryOverhaul ?? createDefaultMilitaryState();
          const logistics = overhaul.logistics ?? createDefaultLogisticsState();
          return {
            buildings: {},
            units: {},
            militaryOverhaul: {
              ...overhaul,
              logistics: {
                ...logistics,
                installationsBuilt: {},
              },
            },
          };
        })()
      : null),
    ...(criticalCommunicationsFixture
      ? {
          utilities: {
            ...base.utilities,
            commsStrength: COMMUNICATIONS_LOW_SIGNAL_THRESHOLD - 5,
          },
        }
      : null),
    ...(boundaryCommunicationsFixture
      ? {
          utilities: {
            ...base.utilities,
            commsStrength: COMMUNICATIONS_LOW_SIGNAL_THRESHOLD,
          },
        }
      : null),
    ...(utilityParityFixture
      ? createUtilityParityFixtureState(base, utilityParityCompanyStatus)
      : null),
    ...(summaryExtremeFixture
      ? {
          buildings: {
            fusionReactors: 1_234_567,
            waterPumpStations: 1_500_000_000,
          },
          units: {
            patrolJudges: 2_345_678,
            streetPatrolUnits: 2_000_000_000,
          },
          districts: base.districts.slice(0, 3),
          cityStats: {
            ...base.cityStats,
            infrastructureHealth: 88,
            defenseRating: 77,
          },
          totalTicks: 123_456,
          activeEvents: [],
          messages: [],
          newsFeed: [],
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
        }
      : null),
  };
}

/**
 * Build the read-only utility parity state used by the browser regression.
 *
 * The fixture deliberately runs one real tick while the calendar is at the
 * spring/summer boundary. Production is therefore calculated with spring's
 * water modifier, while the returned state has already advanced to summer.
 * The overview receives the authoritative rate snapshot and the breakdown
 * must not silently recalculate it from the new season.
 */
export function createUtilityParityFixtureState(
  base: GameState,
  companyStatus?: CompanyInstance["status"],
): GameState {
  const prepared: GameState = {
    ...base,
    activeEvents: [],
    activePolicies: ["publicOwnershipUtilities"],
    unlockedTechnologies: ["resource_allocation_ai"],
    buildings: {
      ...base.buildings,
      fusionReactors: 2,
      waterRecyclingSuperFacilities: 2,
    },
    companies: [
      {
        companyId: "helios-grid",
        districtId: base.districts[0]?.id ?? "central-command",
        licenseDate: 0,
        ...(companyStatus ? { status: companyStatus } : {}),
      },
      {
        companyId: "clearflow-water",
        districtId: base.districts[0]?.id ?? "central-command",
        licenseDate: 0,
        ...(companyStatus ? { status: companyStatus } : {}),
      },
    ],
    megaProjects: [
      {
        projectId: "fusion_nexus",
        phase: "operational",
        progress: 100,
        totalRequired: 100,
        investedCredits: 0,
        investedSteel: 0,
        startedTick: 0,
        completedTick: 0,
      },
      {
        projectId: "subterranean_reservoir",
        phase: "operational",
        progress: 100,
        totalRequired: 100,
        investedCredits: 0,
        investedSteel: 0,
        startedTick: 0,
        completedTick: 0,
      },
    ],
    prestigeResourceMult: 1.25,
    cheats: { ...base.cheats, speedDemon: true },
    gameDate: { year: 2030, month: 5, day: 31, hour: 18 },
    season: "spring",
    weather: "Overcast",
    calmStartTicks: Number.MAX_SAFE_INTEGER,
    messages: [],
    newsFeed: [],
    resources: {
      ...base.resources,
      power: 10_000,
      water: 10_000,
    },
  };

  const ticked = runTick(prepared).newState;
  return {
    ...ticked,
    companies: companyStatus
      ? ticked.companies.map((company) => ({ ...company, status: companyStatus }))
      : ticked.companies,
    tickPaused: true,
    hasCompletedOnboarding: true,
    onboardingStep: undefined,
    lastTickTime: Date.now(),
    activeEvents: [],
    messages: [],
    newsFeed: [],
  };
}

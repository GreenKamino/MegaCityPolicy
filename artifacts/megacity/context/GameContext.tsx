import AsyncStorage from "@react-native-async-storage/async-storage";
import { compressToUTF16, decompressFromUTF16 } from "lz-string";
import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { playSound, startSoundLoop, stopSoundLoop } from "@/engine/audio";
import { playHaptic } from "@/engine/haptics";

import {
  applyEventEffects,
  generateRandomEvent,
} from "@/engine/events";
import { applyCompanyLicense } from "@/engine/companyActions";
import { createDefaultAutoRecruitConfig } from "@/engine/autoRecruit";
import { applyAcceptProposal, applyDeclineProposal, applySnoozeProposal } from "@/engine/acceptProposal";
import {
  performOfficerActionTransaction,
  type OfficerActionId,
} from "@/engine/officerActions";
import { applyOfficerAutoFillDoctrine } from "@/engine/officerAppointmentDoctrines";
import {
  performBlackMarketPurchase,
  type BlackMarketItem,
  type BlackMarketPurchaseResult,
} from "@/engine/blackMarketActions";
import { CONTRACT_TEMPLATES, UNIT_CATEGORIES } from "@/engine/contracts";
import { getEdictById } from "@/engine/edicts";
import {
  dispatchLawOperation as dispatchLawOperationEngine,
  type LawOperationDispatchResult,
} from "@/engine/lawOpsData";
import {
  appointSecurityWingLeader,
  assignSecurityWingSquad,
  deploySecurityWing,
  establishSecurityWing,
  setSecurityWingDoctrine,
  setSecurityWingJurisdiction,
  standDownSecurityWing,
  unassignSecurityWingSquad,
  type SecurityWingDoctrine,
  type SecurityWingId,
  type SecurityWingJurisdiction,
  type SecurityWingResult,
} from "@/engine/securityWings";
import { pushNewsItem, edictEnactedNews, trainingDoctrineEnactedNews, firstBuildingNews, constructionSurgeNews, warDeclaredNews, warPeaceNews, annexationNews, occupationNews } from "@/engine/newsFeed";
import { humanizeBuildingKey } from "@/engine/productionInfo";
import { BB_FACTION as INNER_PARTY_FACTION, isBigBrotherActive, isBBContentId } from "@/engine/addons/bigBrother";
import { isSixthDayActive, isSDContentId } from "@/engine/addons/sixthDay";
import { POLICY_MAP } from "@/engine/policies";
import { checkAchievements } from "@/engine/achievements";
import { initSteamBridge, isSteamAvailable, unlockSteamAchievements, syncSteamAchievements, writeCloudSave, readCloudSave, deleteCloudSave, isSteamCloudAvailable, updateRichPresence, syncGameStats } from "@/engine/steamBridge";
import {
  readEnvelopeMeta,
  reconcileSlot,
  loadSyncBaseline,
  getBaselineChecksum,
  recordSyncBaseline,
  recordSyncBaselineUnlessDeleted,
  clearSyncBaseline,
  clearSyncBaselines,
  hasDeletionTombstone,
  recordDeletionTombstone,
} from "@/engine/cloudSaveSync";
import { runTick, getLastTickErrors, type TickSubsystemError } from "@/engine/formulas";
import { applyEventResponse, applyEventDismissal, applyEventMultiResponses } from "@/engine/eventResolution";
import { RESEARCH_COST_MULTIPLIER } from "@/engine/researchConstants";
import { runOfflineCatchup, type OfflineReport } from "@/engine/offlineCatchup";
import { runLiveTick } from "@/engine/liveTickPipeline";
import { advanceTurn, hasBlockingCrisis, canAdvanceTurn, type TurnResult } from "@/engine/turnMode";
import { recordTickDuration } from "@/engine/tickPerf";
import { invalidateTechCache } from "@/engine/perfCache";
import {
  addCompanyQuarantineAdvisory,
  sanitizeState,
  ARRAY_CAPS,
} from "@/engine/sanitizer";
import { registerPanicSaveAccessor, RECOVERY_SAVE_KEY, clearRecoverySnapshot, readRecoverySnapshotMeta } from "@/engine/panicSave";
import { hydrateCrashReports } from "@/engine/crashReports";
import { createDefaultAugSlots, createDefaultPlayer, createInitialState } from "@/engine/initialState";
import {
  buildConfiguredNewGame,
  type NewCitySetup,
  type NewCommanderSetup,
} from "@/engine/newGameSetup";
import {
  STARTUP_HYDRATION_TIMEOUT_MS,
  StartupHydrationTimeoutError,
  createStartupAttemptGuard,
  withStartupDeadline,
  type BootHydrationStatus,
  type StartupAttemptGuard,
} from "@/engine/startupHydration";
import { STARTING_REGIONS } from "@/engine/worldMap";
import { isEarlyGame, getNextTutorialTip } from "@/engine/tutorial";
import { useSettings, normalizeOfflineSimDepth } from "@/context/SettingsContext";
import type { OfflineSimDepth } from "@/engine/offlineSimDepth";
import { useCheats } from "@/hooks/useCheats";
import { TECH_MAP, canResearch } from "@/engine/technologies";
import { ATTACK_TYPES, TARGET_CATEGORIES, resolveStrike } from "@/engine/strikeData";
import { applyInfrastructureHealthDelta } from "@/engine/infrastructureLedger";
import { computeLoadoutStrength, deductCasualties, formatLoadoutSummary, getCompositionShares, isCombatUnit, loadoutTotalUnits, MILITARY_DIPLO_ATTACK_MAP, type Loadout } from "@/engine/loadout";
import {
  profileSlotKey, createDefaultProfile, syncProfileFromGameState,
  injectProfileIntoGameState, loadProfileIndex, saveProfileIndex,
  loadProfile, loadAllProfilesStrict, saveProfile, deleteProfile as deleteProfileStorage,
  loadActiveProfileId, saveActiveProfileId, loadAllProfiles,
  pruneProfileIndex, MAX_PROFILES, PROFILE_PREFIX, xpForLevel as personalGoalXpForLevel,
} from "@/engine/profiles";
import { pushProfilesToCloud, bootstrapProfilesFromCloudIfEmpty } from "@/engine/profileCloudSync";
import { customPortraitIdFor, registerCustomPortrait, unregisterCustomPortrait } from "@/utils/customPortraits";
import { createDefaultMilitaryState, createDefaultLogisticsState, MILITARY_POLICIES, MILITARY_RESEARCH, MILITARY_MISSIONS, type ActiveMission, type AllocationPriority } from "@/engine/militaryOverhaul";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import {
  academyPrerequisitesMet,
  createAcademyCourseOrder,
  getAcademy,
  getAcademyCourse,
} from "@/engine/militaryAcademies";
import {
  createPendingConstruction,
  TRAINING_EDICT_ID,
  validateCityConstructionBatch,
} from "@/engine/pendingConstruction";
import {
  setFaithStance as engineSetFaithStance,
  declareLeaderCult as engineDeclareLeaderCult,
  renounceLeaderCult as engineRenounceLeaderCult,
  getMaxActiveEdicts,
  type FaithId,
  type FaithStance,
} from "@/engine/faiths";
import { createDefaultPoliticsState, POLITICAL_DECREES } from "@/engine/politicsData";
import { applyDecreeEffects } from "@/engine/decrees";
import { createDefaultInnerCircleState, xpForLevel, type InnerCircleMember } from "@/engine/innerCircleData";
import { createDefaultBodyguardState, createBodyguard, BODYGUARD_DEFS, type BodyguardClass } from "@/engine/bodyguardData";
import { createDefaultSoftwareUpgradeState, SOFTWARE_UPGRADES, getNextTier } from "@/engine/softwareUpgrades";
import type { ContractInstance, FactionInfrastructure, GameState, PlayerAttributes, PlayerProfile, PlayerSkills, ProcurementMethod, SaveSlotMeta, StrikeRecord, TickEntry, WeeklyChallenge } from "@/engine/types";
import { applyDailyClaim, isClaimAvailable as isDailyClaimAvailable, refreshDailyVisit, todayKey } from "@/engine/dailyStreak";
import { refreshWeeklyChallenge, getProgress as getWeeklyProgress, isComplete as isWeeklyComplete, getTemplate as getWeeklyTemplate, type ChallengeTemplate } from "@/engine/weeklyChallenges";
import { claimPersonalGoal as claimPersonalGoalEngine, refreshPersonalGoals as refreshPersonalGoalsEngine, type GoalScope as PersonalGoalScope } from "@/engine/personalGoals";
import {
  serializeSaveExport,
  parseSaveImport,
  suggestedFileName as suggestedSaveExportFileName,
  serializeFullBackup,
  parseFullBackup,
  suggestedFullBackupFileName,
  FULL_BACKUP_MAX_SLOT,
  type SaveExportEnvelope,
  type FullBackupEnvelope,
} from "@/engine/saveExport";
import { APP_VERSION } from "@/constants/version";
import { calculateLegacyPoints, canRebirth, createDefaultPrestigeState, purchaseBonus, getBusinessSpawnIntervalMultiplier, getChainExpansionChanceMultiplier, getAntiMonopolyCapDelta, calculateEcologicalLegacy, normalizePrestigeState, purchaseEcologicalBonus, ECOLOGICAL_LEGACY_BONUSES, type LegacyBonusId, type EcologicalLegacyBonusId } from "@/engine/prestige";
import { beginProject, advanceToConstruction, processMegaProjectTick, generateMegaProjectMessage, type MegaProjectId } from "@/engine/megaProjects";
import {
  appendMissionResultMessage,
  launchMission as launchOfficerMissionEngine,
  processOfficerMissionTick,
  generateMissionMessage,
  type MissionId,
  type MissionResult,
} from "@/engine/officerMissions";
import { canPerformAction, resolveDiplomaticAction, recordDiplomaticAction, isOperationAction, createOperation, actionAvailableForKind, getDiplomaticActionRules, getDiplomaticActionEffects, getEventOnlyActionRules, isEventOnlyActionId, getMilitaryStrikeCost, isMilitaryStrikeId, type EngineDiplomaticActionId } from "@/engine/diplomacyEngine";
import { applyPersonalInteraction, computeFactionActionRelationshipDeltas, factionDiplomacyCooldownRemaining, stampFactionDiplomacyCooldown, type PersonalActionId, type PersonalInteractionTarget } from "@/engine/interactionMenu";
import { applyCoerciveBacklash, isCoerciveActionId } from "@/engine/coerciveBacklash";
import { ensurePersonality, getPartnerKind } from "@/engine/partnerPersonality";
import { recordPartnerLedger, getOrCreateLedger } from "@/engine/partnerLedger";
import { generateRumorIntel, generateCounterIntel, generateRequestedIntel, appendIntel, pruneIntel } from "@/engine/intelEngine";
import { buildPendingResponse, enqueuePendingResponse, processPendingResponses } from "@/engine/diplomaticFollowUps";
import { applyMilitaryDamage, canOccupy, canAnnex, tributeForOccupation, annexationPopulationGain, readCityStats, recoverPartnerStats, applyPartnerAndPlayerTickEffects } from "@/engine/partnerCityStats";
import { processEndStateCheck } from "@/engine/endState";
import { proposeRailCorridor, respondToRailConsent, cancelRailCorridor, configureRailCorridorStaffing, resumeRailCorridor, installRailTrainUpgrade } from "@/engine/railNetwork";
import { performDetaineeAction as performDetaineeActionEngine, type DetaineeActionId } from "@/engine/custody";

// Save load helpers (wrapSave/unwrapSave/migrateState/BACKUP_SUFFIX) live in
// engine/saveLoad.ts so they can be unit-tested against malformed inputs
// without dragging in React/AsyncStorage.
import { wrapSave, unwrapSave, migrateState, BACKUP_SUFFIX, writeSlotSave, writeSlotRaw, patchSlotSave, SaveWriteError, sweepStaleTmpKeys, atomicWriteSlot } from "@/engine/saveLoad";
import { createSlotLock, isSaveSessionCurrent } from "@/engine/saveLock";

const SAVE_KEY_PREFIX = "@megacity_slot_";
const LEGACY_SAVE_KEY = "@megacity_save";
const GLOBAL_ACHIEVEMENTS_KEY = "@megacity_global_achievements";
const FACTION_COOLDOWN_E2E_KEY_PREFIX = "@megacity_e2e_faction_cooldowns_";
const MULTI_RESPONSE_E2E_KEY_PREFIX = "@megacity_e2e_multi_response_";
const BIOSPHERE_RISK_TICKER_E2E_KEY_PREFIX = "@megacity_e2e_biosphere_risk_ticker_";
const RELATIONSHIP_BOOST_E2E_KEY_PREFIX = "@megacity_e2e_relationship_boosts_";
const RELATIONSHIP_ROSTER_E2E_KEY_PREFIX = "@megacity_e2e_relationship_roster_";
const RETINUE_ASSIGNMENT_E2E_KEY_PREFIX = "@megacity_e2e_retinue_assignment_";
const RETINUE_LEADERSHIP_E2E_KEY_PREFIX = "@megacity_e2e_retinue_leadership_";
const RETINUE_OPERATION_E2E_KEY_PREFIX = "@megacity_e2e_retinue_operation_";
const BLACK_MARKET_AUDIT_E2E_KEY_PREFIX = "@megacity_e2e_black_market_audit_";
const MILITARY_FOOD_POOL_E2E_KEY_PREFIX = "@megacity_e2e_military_food_pool_";
const MISSION_MAIL_E2E_KEY_PREFIX = "@megacity_e2e_mission_mail_";
const MISSION_MAIL_E2E_PHASE_KEY = "@megacity_e2e_mission_mail_phase";
const MEDICAL_STORAGE_E2E_KEY_PREFIX = "@megacity_e2e_medical_storage_";
const CONSTRUCTION_BATCH_RELOAD_E2E_KEY_PREFIX = "@megacity_e2e_construction_batch_reload_";
const HOUSING_BLOCKER_RELOAD_E2E_KEY_PREFIX = "@megacity_e2e_housing_blocker_reload_";
const DISTRICT_COMMANDS_RELOAD_E2E_KEY_PREFIX = "@megacity_e2e_district_commands_reload_";
const RAIL_JOURNEY_RELOAD_E2E_KEY_PREFIX = "@megacity_e2e_rail_journey_reload_";
const RAIL_MODULES_RELOAD_E2E_KEY_PREFIX = "@megacity_e2e_rail_modules_reload_";
const RESEARCH_QUEUE_RELOAD_E2E_KEY_PREFIX = "@megacity_e2e_research_queue_reload_";
const UTILITY_PARITY_RELOAD_E2E_KEY_PREFIX = "@megacity_e2e_utility_parity_reload_";
const WORLD_MAP_EXPORT_RESTORE_E2E_KEY_PREFIX = "@megacity_e2e_worldmap_export_restore_";
const WORLD_MAP_EXPORT_RESTORE_EXPORT_KEY = "@megacity_e2e_worldmap_export_restore_export";
const WORLD_MAP_FULL_BACKUP_E2E_KEY_PREFIX = "@megacity_e2e_worldmap_full_backup_";
const WORLD_MAP_FULL_BACKUP_EXPORT_KEY = "@megacity_e2e_worldmap_full_backup_export";

const WORLD_MAP_CLOUD_RESTORE_E2E_KEY_PREFIX = "@megacity_e2e_worldmap_cloud_restore_";
type FactionCooldownE2EPhase = "save" | "load" | "cloud-save" | "cloud-load";
type MultiResponseE2EPhase = "save" | "load";
type BiosphereRiskTickerE2EPhase = "save" | "load" | "cloud-save" | "cloud-load";
type MedicalStorageE2EPhase = "save" | "load" | "offline" | "cloud-save" | "cloud-load";
type ConstructionBatchReloadE2EPhase = "save" | "load";
type HousingBlockerReloadE2EPhase = "save" | "load";
type DistrictCommandsReloadE2EPhase = "save" | "load";
type RailJourneyReloadE2EPhase = "save" | "load";
const RAIL_JOURNEY_E2E_PHASE_STORAGE_KEY = "@megacity_e2e_rail_journey_phase";
type RailModulesReloadE2EPhase = "save" | "load";
type ResearchQueueReloadE2EPhase = "save" | "load";
type UtilityParityReloadE2EPhase = "save" | "load";
type WorldMapExportRestoreE2EPhase =
  | "export"
  | "restore"
  | "full-backup-export"
  | "full-backup-restore"
  | "cloud-save"
  | "cloud-load";
type RelationshipBoostE2EPhase = "save" | "load";
type RelationshipRosterE2EPhase = "save" | "load";
type RetinueAssignmentE2EPhase = "save" | "load";
type RetinueLeadershipE2EPhase = "save" | "load" | "cloud-save" | "cloud-load";
type RetinueOperationE2EPhase = "save" | "load" | "cloud-save" | "cloud-load";
type BlackMarketAuditE2EPhase = "save" | "load";
type BlackMarketAuditE2EOutcome = "delivered" | "seized";
type MilitaryFoodPoolE2EPhase = "save" | "load" | "legacy-load";
type MissionMailE2EPhase = "save" | "load" | "cloud-load";

// This harness is deliberately isolated from player storage. It is only
// reachable from the dev-only browser fixture and uses a separate namespace
// rather than a profile or legacy slot key.
function factionCooldownE2EPhase(): FactionCooldownE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("factioncooldowns") !== "1") return null;
  const phase = params.get("factioncooldownreload");
  return phase === "save" || phase === "load" || phase === "cloud-save" || phase === "cloud-load"
    ? phase
    : null;
}

function multiResponseE2EPhase(): MultiResponseE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("multiresponse") !== "1") return null;
  const phase = params.get("multiresponseload");
  return phase === "save" || phase === "load" ? phase : null;
}

function biosphereRiskTickerE2EPhase(): BiosphereRiskTickerE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("biosphereticker") !== "1") return null;
  const phase = params.get("biospheretickerreload");
  return phase === "save" || phase === "load" || phase === "cloud-save" || phase === "cloud-load"
    ? phase
    : null;
}

function medicalStorageE2EPhase(): MedicalStorageE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("medicalstorage") !== "1") return null;
  const reload = params.get("medicalStorageReload");
  if (reload === "save" || reload === "load" || reload === "cloud-save" || reload === "cloud-load") return reload;
  return params.get("medicalstoragecase") === "offline" ? "offline" : null;
}

function worldMapExportRestoreE2EPhase(): WorldMapExportRestoreE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("worldmaprestore") !== "1") return null;
  const phase = params.get("worldmaprestorereload");
  return phase === "export" ||
    phase === "restore" ||
    phase === "full-backup-export" ||
    phase === "full-backup-restore" ||
    phase === "cloud-save" ||
    phase === "cloud-load"
    ? phase
    : null;
}

function constructionBatchReloadE2EPhase(): ConstructionBatchReloadE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("constructionbatch") !== "1") return null;
  const phase = params.get("constructionbatchreload");
  return phase === "save" || phase === "load" ? phase : null;
}

function housingBlockerReloadE2EPhase(): HousingBlockerReloadE2EPhase | null {
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("housing") !== "1") return null;
  const packagedHousingBlockerFixture =
    (window as any).desktop?.housingBlockerFixture === true;
  if (typeof __DEV__ !== "undefined" && !__DEV__ && !packagedHousingBlockerFixture) {
    return null;
  }
  const phase = params.get("housingreload");
  return phase === "save" || phase === "load" ? phase : null;
}

function districtCommandsReloadE2EPhase(): DistrictCommandsReloadE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("districtcommands") !== "1") return null;
  const phase = params.get("districtcommandsreload");
  return phase === "save" || phase === "load" ? phase : null;
}

function districtCommandsLiveE2EFixture(): boolean {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return false;
  if (typeof window === "undefined" || !window.location) return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("demo") === "1" &&
    params.get("districtcommands") === "1" &&
    params.get("districtcommandscase") === "live-gates"
  );
}

function researchQueueReloadE2EPhase(): ResearchQueueReloadE2EPhase | null {
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("researchqueue") !== "1") return null;
  const packagedResearchQueueFixture =
    (window as any).desktop?.researchQueueFixture === true;
  if (typeof __DEV__ !== "undefined" && !__DEV__ && !packagedResearchQueueFixture) return null;
  const phase = params.get("researchQueueReload");
  return phase === "save" || phase === "load" ? phase : null;
}

function railModulesReloadE2EPhase(): RailModulesReloadE2EPhase | null {
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("railmodules") !== "1") return null;
  const packagedRailModulesFixture =
    (window as any).desktop?.railModulesFixture === true;
  if (typeof __DEV__ !== "undefined" && !__DEV__ && !packagedRailModulesFixture) return null;
  const phase = params.get("railModulesReload");
  return phase === "save" || phase === "load" ? phase : null;
}

function utilityParityReloadE2EPhase(): UtilityParityReloadE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("utilityparity") !== "1") return null;
  const phase = params.get("utilityParityReload");
  return phase === "save" || phase === "load" ? phase : null;
}

function railJourneyReloadE2EPhase(): RailJourneyReloadE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  const stored = window.sessionStorage?.getItem(RAIL_JOURNEY_E2E_PHASE_STORAGE_KEY);
  const hasRailQuery = params.get("demo") === "1" && params.get("railjourney") === "1";
  if (!hasRailQuery && stored !== "save" && stored !== "load") return null;
  const phase = params.get("railjourneyreload");
  if (phase === "save" || phase === "load") return phase;
  return stored === "save" || stored === "load" ? stored : null;
}

function relationshipBoostE2EPhase(): RelationshipBoostE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("relationshipboosts") !== "1") return null;
  const phase = params.get("relationshipboostreload");
  return phase === "save" || phase === "load" ? phase : null;
}

function relationshipRosterE2EPhase(): RelationshipRosterE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("relationshiproster") !== "1") return null;
  const phase = params.get("relationshiprosterphase");
  return phase === "save" || phase === "load" ? phase : null;
}

function retinueAssignmentE2EPhase(): RetinueAssignmentE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("retinue") !== "1") return null;
  const phase = params.get("retinueReload");
  return phase === "save" || phase === "load" ? phase : null;
}

function retinueLeadershipE2EPhase(): RetinueLeadershipE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("retinueleadership") !== "1") return null;
  const phase = params.get("retinueLeadershipReload");
  return phase === "save" || phase === "load" || phase === "cloud-save" || phase === "cloud-load"
    ? phase
    : null;
}

function retinueOperationE2EPhase(): RetinueOperationE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("retinueoperation") !== "1") return null;
  const phase = params.get("retinueOperationReload");
  return phase === "save" || phase === "load" || phase === "cloud-save" || phase === "cloud-load"
    ? phase
    : null;
}

function blackMarketAuditE2EPhase(): BlackMarketAuditE2EPhase | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("blackmarketaudit") !== "1") return null;
  const phase = params.get("blackMarketAuditReload");
  return phase === "save" || phase === "load" ? phase : null;
}

function blackMarketAuditE2EOutcome(): BlackMarketAuditE2EOutcome | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return null;
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("blackmarketaudit") !== "1") return null;
  const outcome = params.get("blackMarketAuditOutcome");
  return outcome === "delivered" || outcome === "seized" ? outcome : null;
}

function militaryFoodPoolE2EPhase(): MilitaryFoodPoolE2EPhase | null {
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1" || params.get("militaryfoodpool") !== "1") return null;
  const packagedFixture = (window as any).desktop?.militaryFoodPoolFixture === true;
  if (typeof __DEV__ !== "undefined" && !__DEV__ && !packagedFixture) return null;
  const phase = params.get("militaryFoodPoolReload");
  return phase === "save" || phase === "load" || phase === "legacy-load" ? phase : null;
}

function missionMailE2EPhase(): MissionMailE2EPhase | null {
  if (typeof window === "undefined" || !window.location) return null;
  const packagedFixture = (window as any).desktop?.missionMailFixture === true;
  if (typeof __DEV__ !== "undefined" && !__DEV__ && !packagedFixture) return null;
  const params = new URLSearchParams(window.location.search);
  const sessionPhase = window.sessionStorage?.getItem(MISSION_MAIL_E2E_PHASE_KEY);
  if (
    params.get("demo") !== "1" &&
    !packagedFixture &&
    !sessionPhase
  ) return null;
  if (params.get("missionmail") !== "1" && !sessionPhase) return null;
  const phase = params.get("missionMailReload") ?? sessionPhase;
  return phase === "save" || phase === "load" || phase === "cloud-load"
    ? phase
    : null;
}

async function loadGlobalAchievements(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(GLOBAL_ACHIEVEMENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function mergeAndSaveGlobalAchievements(newIds: string[]): Promise<string[]> {
  const existing = await loadGlobalAchievements();
  const merged = Array.from(new Set([...existing, ...newIds]));
  // Task #191: atomic swap so a torn write can't wipe the player's
  // cross-profile achievement roll-up. The merge above already includes
  // the prior list, but a crash mid-setItem could leave the key holding
  // half-written JSON; the next load would parse-fail and reset to [].
  await atomicWriteSlot(AsyncStorage, GLOBAL_ACHIEVEMENTS_KEY, JSON.stringify(merged));
  return merged;
}
function getTickIntervalMs(minutes: number): number {
  return minutes * 60 * 1000;
}
// Number of save slots exposed in the UI. Re-exported from saveExport so the
// backup envelope and the slot UI cannot drift apart — change it in one place.
const MAX_SLOTS = FULL_BACKUP_MAX_SLOT;

const _liveStateRef: { current: GameState | null } = { current: null };
const _stateListeners = new Set<() => void>();

function _subscribeState(listener: () => void): () => void {
  _stateListeners.add(listener);
  return () => {
    _stateListeners.delete(listener);
  };
}

// Cloud save status surfaced to the menu so the player knows whether their
// progress is protected by Steam Cloud. Only meaningful on the Steam/desktop
// build — web/mobile never enter a non-"off" state.
export type CloudSaveStatus = "off" | "syncing" | "synced" | "unavailable" | "error";

// A slot whose local and cloud copies diverged independently and that the
// player must resolve. Display-only fields; the raw bytes needed to apply the
// choice are held in a ref, not React state.
export type CloudSaveConflict = {
  slotId: number;
  cityName: string;
  localSavedAt: number;
  cloudSavedAt: number;
  localTotalTicks: number;
  cloudTotalTicks: number;
};

// A short after-action summary shown to the player when a turn (or a turn cut
// short by a crisis) finishes in turn-based mode.
export type TurnRecap = {
  ticksAdvanced: number;
  toDate: GameState["gameDate"];
  events: { id: string; title: string; severity: string }[];
  interrupted: boolean;
  interruptTitle?: string;
  creditsDelta: number;
  popDelta: number;
  // Subsystem failures caught during any tick of the turn (deduped by
  // subsystem+message). Empty when the turn ran clean. Surfaced in the recap so
  // a failure mid-turn isn't silently swallowed in turn-based mode.
  tickErrors: TurnResult["tickErrors"];
};

type GameStateType = {
  state: GameState;
  globalAchievements: string[];
  isLoaded: boolean;
  bootHydrationStatus: BootHydrationStatus;
  hasSave: boolean;
  activeSlot: number;
  slotMetas: SaveSlotMeta[];
  offlineReport: OfflineReport | null;
  turnRecap: TurnRecap | null;
  pendingAchievements: string[];
  activeProfile: PlayerProfile | null;
  allProfiles: PlayerProfile[];
  researchQueueCapacity: number;
  lastSaveTime: number;
  // Last save failure surfaced to the SaveIndicator. `null` means the
  // most recent slot write committed cleanly. Set whenever
  // writeSlotSave throws (quota / native bridge IO error) so the UI
  // doesn't have to scrape console.error.
  lastSaveError: { kind: "quota" | "io"; message: string } | null;
  hasRecoverySnapshot: boolean;
  recoverySnapshotInfo: { savedAt: number | null; cityName: string | null };
  // Steam Cloud save sync status + any per-slot conflicts the player must
  // resolve before they can safely load. Empty / "off" on web/mobile.
  cloudSaveStatus: CloudSaveStatus;
  cloudSaveConflicts: CloudSaveConflict[];
  // Subsystem failures recorded by `safeSub` during the most recent tick.
  // Cleared when the player acknowledges them via `dismissTickErrors`,
  // and overwritten whenever a new tick records its own failures.
  // Includes the tick number for display so consecutive identical failures
  // are visibly distinct.
  // Live ticks don't suppress anything today, so suppressedErrors/suppressedCount
  // are optional and currently unset — they exist for parity with the offline
  // catch-up report so the badge's copy export can pass them straight through if
  // per-tick capping is ever introduced.
  lastTickErrors: {
    tick: number;
    errors: TickSubsystemError[];
    suppressedErrors?: TickSubsystemError[];
    suppressedCount?: number;
  } | null;
};

type GameActionsType = {
  setState: React.Dispatch<React.SetStateAction<GameState>>;
  retryStartupHydration: () => Promise<boolean>;
  createProfile: (name: string, age: number, sex: "male" | "female" | "other", portraitId?: string, customPortraitUri?: string) => Promise<PlayerProfile>;
  setPlayerPortraitId: (portraitId: string) => void;
  setPlayerCustomPortrait: (dataUri: string) => boolean;
  selectProfile: (profileId: string) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
  dismissAchievementReport: () => void;
  dismissOfflineReport: () => void;
  startNewGame: (slot?: number) => void;
  launchConfiguredNewGame: (input: {
    city: NewCitySetup;
    commander?: NewCommanderSetup;
  }) => Promise<void>;
  saveGame: () => Promise<boolean>;
  saveToSlot: (slot: number) => Promise<boolean>;
  loadSlot: (slot: number) => Promise<boolean>;
  loadRecoverySnapshot: () => Promise<boolean>;
  refreshRecoverySnapshot: () => Promise<void>;
  dismissRecoverySnapshot: () => Promise<void>;
  deleteSlot: (slot: number) => Promise<void>;
  refreshSlotMetas: () => Promise<void>;
  // Resolve a per-slot Steam Cloud conflict by keeping either the copy on
  // this device or the cloud copy. The losing side is overwritten only after
  // the player's explicit choice.
  resolveCloudConflict: (slotId: number, keep: "local" | "cloud") => Promise<void>;
  setSaveLabel: (label: string, slot?: number) => Promise<void>;
  // Toggle Honor / Iron Man mode for the current run. Persists into the
  // active save the next time it's written. Once enabled, the more.tsx
  // surface hides manual save and load and shows a HONOR badge on the
  // active slot card.
  setHonorMode: (enabled: boolean) => Promise<void>;
  loadGame: () => Promise<boolean>;
  forceTick: () => void;
  setTickInterval: (minutes: 1 | 5 | 10 | 15 | 60) => void;
  toggleTickPause: () => void;
  endTurn: () => void;
  dismissTurnRecap: () => void;
  cheatHabTowers: () => void;
  cheatHabAll: () => void;
  cheatAddSteel: () => void;
  cheatAddSteelMega: () => void;
  cheatAddWaterFacilities: () => void;
  cheatAddFoodFacilities: () => void;
  cheatAddWasteSewage: () => void;
  cheatRemovePopulation: () => void;
  cheatFactionWar: () => void;
  renameCity: (name: string) => void;
  renamePlayer: (name: string) => void;
  setInsignia: (index: number) => void;
  upgradeAttribute: (attr: keyof PlayerAttributes) => boolean;
  upgradeSkill: (skill: keyof PlayerSkills) => boolean;
  cheatCredits: (amount: number) => void;
  cheatSetStat: (stat: string, value: number) => void;
  cheatMaxResources: () => void;
  cheatReduceUnrest: () => void;
  cheatReduceCrime: () => void;
  setFaithStance: (faithId: FaithId, stance: FaithStance) => void;
  declareLeaderCult: (faithId: FaithId) => boolean;
  renounceLeaderCult: () => void;
  togglePolicy: (key: string) => void;
  setPolicy: <K extends keyof GameState["policies"]>(
    key: K,
    value: GameState["policies"][K]
  ) => void;
  toggleCityPolicy: (policyId: string) => void;
  buildConstruction: (building: string, cost: number, count?: number, steelCost?: number, categoryId?: string) => boolean;
  deployUnit: (unit: string, cost: number) => boolean;
  dispatchLawOperation: (missionId: string) => LawOperationDispatchResult;
  performDetaineeAction: (targetId: string, actionId: DetaineeActionId) => boolean;
  establishSecurityWing: (wingId: SecurityWingId) => SecurityWingResult;
  assignSecurityWingSquad: (wingId: SecurityWingId, squadId: string) => SecurityWingResult;
  unassignSecurityWingSquad: (wingId: SecurityWingId, squadId: string) => SecurityWingResult;
  appointSecurityWingLeader: (wingId: SecurityWingId, officerId: string | null) => SecurityWingResult;
  setSecurityWingDoctrine: (wingId: SecurityWingId, doctrine: SecurityWingDoctrine) => SecurityWingResult;
  setSecurityWingJurisdiction: (wingId: SecurityWingId, jurisdiction: SecurityWingJurisdiction) => SecurityWingResult;
  deploySecurityWing: (wingId: SecurityWingId) => SecurityWingResult;
  standDownSecurityWing: (wingId: SecurityWingId) => SecurityWingResult;
  actionFaction: (factionId: string, action: EngineDiplomaticActionId, loadout?: Loadout) => void;
  performPersonalInteraction: (target: PersonalInteractionTarget, optionId: PersonalActionId) => boolean;
  setSavedLoadout: (key: string, loadout: Loadout) => void;
  dismissEvent: (eventId: string) => void;
  respondToEvent: (eventId: string, response: import("@/engine/types").EventResponse) => boolean;
  respondToEventMulti: (eventId: string, responses: import("@/engine/types").EventResponse[]) => boolean;
  proposeRailCorridor: (endpointId: string, staffing?: Partial<import("@/engine/types").RailCorridor["staffing"]>) => import("@/engine/railNetwork").RailResult;
  respondToRailConsent: (id: string, accepted: boolean) => void;
  cancelRailCorridor: (id: string) => void;
  configureRailCorridorStaffing: (id: string, staffing: Partial<import("@/engine/types").RailCorridor["staffing"]>) => import("@/engine/railNetwork").RailResult;
  resumeRailCorridor: (id: string) => import("@/engine/railNetwork").RailResult;
  installRailTrainUpgrade: (corridorId: string, upgradeId: import("@/engine/types").RailTrainUpgradeId) => import("@/engine/railNetwork").RailResult;
  cheatBulkAmmoWeapons: () => void;
  licenseCompany: (companyId: string, districtId: string) => boolean;
  shutdownCompany: (companyId: string) => void;
  awardContract: (defId: string, districtId: string, method: import("@/engine/types").ProcurementMethod) => boolean;
  cancelContract: (contractId: string) => void;
  hireUnit: (unitKey: string, cost: number, batch: number) => boolean;
  dismissUnit: (unitKey: string, refund: number, batch: number) => boolean;
  toggleProcurementPolicy: (key: string) => void;
  issueEdict: (edictId: string) => boolean;
  startResearch: (techId: string) => boolean;
  cancelResearch: () => void;
  queueResearch: (techId: string) => boolean;
  removeFromQueue: (techId: string) => void;
  reorderQueue: (from: number, to: number) => void;
  toggleAutoResearch: () => void;
  dismissMessage: (messageId: string) => void;
  markMessageRead: (messageId: string) => void;
  markAllMessagesRead: () => void;
  clearAllMessages: () => void;
  appointOfficer: (officerId: string, method: import("@/engine/types").AppointmentMethod) => void;
  dismissOfficer: (officerId: string) => void;
  autoFillVacancies: (
    doctrineId: import("@/engine/types").OfficerAutoFillDoctrineId,
  ) => import("@/engine/officerAppointmentDoctrines").OfficerAutoFillTransaction;
  performOfficerAction: (
    officerId: string,
    action: import("@/engine/officerActions").OfficerActionId,
  ) => { ok: boolean; reason?: string };
  performBlackMarketPurchase: (item: BlackMarketItem) => BlackMarketPurchaseResult;
  toggleCheat: (cheat: string) => void;
  cheatAdd1BCredits: () => void;
  cheatAdd1BSteel: () => void;
  cheatAdd2BCredits: () => void;
  cheatAddPopulation: (amount: number) => void;
  cheatAddUnits: (unitKey: string, amount: number) => void;
  cheatSetDemographic: (key: string, value: number) => void;
  cheatMaxFood: () => void;
  cheatMaxWater: () => void;
  cheatLoadOneMonthSave: () => Promise<void>;
  cheatBulkCommodities: () => void;
  cheatBulkUnits: () => void;
  cheatBulkResources: () => void;
  cheatBulkBuildings: () => void;
  cheatBulkBuildings1000: () => void;
  cheatInfraBuildings1000: () => void;
  cheatMaxLoyaltyAll: () => void;
  cheatInstantAlliance: () => void;
  cheatUnlockAllTrade: () => void;
  cheatForcePeace: () => void;
  cheatRevealIntel: () => void;
  cheatMegacityFriendMax: () => void;
  cheatInstantJointConstruction: () => void;
  cheatDiplomaticImmunity: () => void;
  performRebirth: () => { points: number; breakdown: { label: string; points: number }[] } | null;
  purchasePrestigeBonus: (bonusId: string) => boolean;
  startMegaProject: (projectId: string) => boolean;
  advanceMegaProject: (projectId: string) => boolean;
  launchOfficerMission: (missionId: string, officerId: string) => boolean;
  cheatFactionReset: () => void;
  cheatTradeSurplus: () => void;
  cheatSpyMaster: () => void;
  cheatWarProfiler: () => void;
  cheatPuppetMaster: () => void;
  cheatGoldenTongue: () => void;
  cheatOpenBorders: () => void;
  cheatEveryoneIsDead: () => void;
  cheatTriggerCivilWar: () => void;
  cheatLaunchExpedition: () => void;
  cheatToggleTradeAI: () => void;
  cheatForceSeasonChange: () => void;
  cheatPrestigeBoost: () => void;
  toggleAutoConstruction: () => void;
  setAutoConstructionConfig: (config: Partial<import("@/engine/autoConstruction").AutoConstructionConfig>) => void;
  setAutoRecruitConfig: (config: Partial<import("@/engine/autoRecruit").AutoRecruitConfig>) => void;
  setAutoManagerMode: (domain: import("@/engine/autoManagers").AutoManagerDomain, mode: import("@/engine/autoManagers").AutoManagerMode) => void;
  setAutoManagerPauseAllAct: (paused: boolean) => void;
  acceptAutoManagerProposal: (proposalId: string) => void;
  declineAutoManagerProposal: (proposalId: string) => void;
  snoozeAutoManagerProposal: (proposalId: string, ticks: number) => void;
  setAutoManagerAlwaysAllow: (kind: import("@/engine/autoManagers").AutoManagerProposalKind, allow: boolean) => void;
  cancelTradeAgreement: (agreementId: string) => void;
  cancelJointProject: (projectId: string) => void;
  cancelDiplomaticPact: (pactId: string) => void;
  resolveIncident: (incidentId: string, responseId: string) => void;
  assignEnvoy: (targetId: string, targetName: string) => boolean;
  recallEnvoy: (envoyId: string) => void;
  startNegotiation: (partnerId: string, partnerName: string) => boolean;
  resolveNegotiationStep: (negotiationId: string, choiceId: string) => void;
  declareWarAdvanced: (targetId: string, targetName: string) => void;
  proposePeace: (warId: string) => boolean;
  acceptPeaceDemand: (conferenceId: string, demandId: string) => void;
  rejectPeaceDemand: (conferenceId: string, demandId: string) => void;
  concludePeace: (conferenceId: string) => void;
  toggleAddon: (addonId: string) => void;
  launchStrike: (targetId: string, attackTypeId: string, targetCategoryId: string, loadout?: Loadout) => import("@/engine/strikeData").StrikeResult | null;
  toggleMilitaryPolicy: (policyId: string) => void;
  startMilitaryResearch: (techId: string) => boolean;
  launchMission: (missionId: string) => boolean;
  assignToArmy: (branch: string, count: number) => void;
  buildMilitaryInstallation: (buildingId: string, cost: number) => boolean;
  startAcademyCourse: (courseId: string) => boolean;
  assignAcademyInstructor: (academyId: string) => boolean;
  setMilitaryAllocationPriority: (priority: AllocationPriority) => void;
  issueDecree: (decreeId: string) => boolean;
  appointInnerCircle: (officerId: string, role: import("@/engine/innerCircleData").InnerCircleRole) => boolean;
  removeInnerCircle: (officerId: string) => void;
  recruitBodyguard: (classId: import("@/engine/bodyguardData").BodyguardClass) => boolean;
  dismissBodyguard: (bodyguardId: string) => void;
  installSoftwareUpgrade: (upgradeId: string) => boolean;
  claimDailyBonus: () => { credits: number; research: number; streakAfter: number; message: string } | null;
  claimWeeklyChallenge: () => { credits: number; research: number; templateTitle: string } | null;
  ensureWeeklyChallengeFresh: () => void;
  refreshPersonalGoals: () => void;
  claimPersonalGoal: (scope: PersonalGoalScope) => { credits: number; xp: number; templateId: string } | null;
  exportSlot: (slot: number) => Promise<{ json: string; suggestedName: string } | null>;
  importSlot: (slot: number, json: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  exportFullBackup: () => Promise<{ json: string; suggestedName: string; slotCount: number } | null>;
  importFullBackup: (json: string) => Promise<{ ok: true; slotCount: number } | { ok: false; error: string }>;
  markChangelogSeen: () => void;
  // Acknowledge any subsystem failures surfaced by the most recent tick.
  // Hides the in-game warning UI until a future tick records new errors.
  dismissTickErrors: () => void;
};

type GameContextType = GameStateType & GameActionsType;

const GameStateContext = createContext<GameStateType | null>(null);
const GameActionsContext = createContext<GameActionsType | null>(null);
const SaveTimeContext = createContext<number>(0);

// Demo seeder lives in @/engine/demoSeeder so it can be unit-tested in a
// pure-node vitest environment without pulling in react-native via this
// file. Re-exported here for backward compatibility with existing imports.
export { createDemoSeededStateIfRequested } from "@/engine/demoSeeder";
import { createDemoSeededStateIfRequested } from "@/engine/demoSeeder";

export function GameProvider({ children }: { children: ReactNode }) {
  const { autoSaveMinutes, offlineSimDepth, setSetting: setSettingsValue } = useSettings();
  const offlineSimDepthRef = useRef(offlineSimDepth);
  useEffect(() => { offlineSimDepthRef.current = offlineSimDepth; }, [offlineSimDepth]);
  const [state, setState] = useState<GameState>(createDemoSeededStateIfRequested);
  const stateRef = useRef(state);
  // Mirror state into the module-level live ref synchronously so selector
  // subscribers (useGameStateSelector / useGameStateRef) get the freshest
  // snapshot on first render. This write is idempotent — re-running it
  // during Strict Mode double-renders has no observable effect.
  _liveStateRef.current = state;
  useEffect(() => {
    stateRef.current = state;
    // Notify selector subscribers after commit so they re-render with the
    // latest value. Listeners that rely on shallow-equal selector output
    // will bail out of re-rendering automatically via useSyncExternalStore.
    _stateListeners.forEach((l) => l());
  }, [state]);
  // Expose the latest state to the top-level Error Boundaries so they can
  // snapshot a recovery save if anything throws. Cleared on unmount so a
  // dev-mode hot reload doesn't leak a stale accessor.
  useEffect(() => {
    registerPanicSaveAccessor(() => stateRef.current);
    return () => registerPanicSaveAccessor(null);
  }, []);
  // Skip-save guard: track which state object reference + slot was last persisted.
  // Reference equality means no setState has fired since the last save (state is immutable),
  // so we can safely skip the JSON.stringify + AsyncStorage write.
  const lastSavedStateRef = useRef<{ state: GameState | null; slotKey: string }>({ state: null, slotKey: "" });
  // Concurrency guard: keyed by slot, holds the in-flight save promise. Prevents
  // an autosave + manual save (or two autosaves on a slow device) from racing
  // and writing partial bytes to AsyncStorage. Subsequent callers get the
  // existing promise instead of starting a second write.
  const saveInFlightRef = useRef(createSlotLock());
  const [globalAchievements, setGlobalAchievements] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [bootHydrationStatus, setBootHydrationStatus] = useState<BootHydrationStatus>("pending");
  const startupAttemptRef = useRef<StartupAttemptGuard | null>(null);
  const startupHydrationInFlightRef = useRef<Promise<boolean> | null>(null);
  // Startup may hydrate a save only as a main-menu preview. Until the player
  // explicitly loads that slot (or starts/restores a city), ticking and every
  // save path must stay disabled or the stale preview could be persisted with
  // a fresh timestamp and erase the offline interval before catch-up runs.
  const [isCitySessionActive, setIsCitySessionActive] = useState(false);
  const citySessionActiveRef = useRef(false);
  // Expo Router removes the query string when it pushes the demo route, so
  // capture the fixture phase during the provider's first render.
  const researchReadOnlyE2EQueryRef = useRef(
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "1" &&
    new URLSearchParams(window.location.search).get("go") === "research",
  );
  const settlementParityE2EQueryRef = useRef(
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "1" &&
    new URLSearchParams(window.location.search).get("settlementparity") === "1",
  );
  const worldMapEventLogE2EQueryRef = useRef(
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "1" &&
    new URLSearchParams(window.location.search).get("worldmaplog") === "1",
  );
  const worldMapExportRestoreE2EQueryRef = useRef<WorldMapExportRestoreE2EPhase | null>(
    worldMapExportRestoreE2EPhase(),
  );
  const worldMapCloudRestoreE2EPhaseRef = useRef<WorldMapExportRestoreE2EPhase | null>(null);
  const factionCooldownE2EQueryRef = useRef<FactionCooldownE2EPhase | null>(factionCooldownE2EPhase());
  const factionCooldownE2EPhaseRef = useRef<FactionCooldownE2EPhase | null>(null);
  const multiResponseE2EQueryRef = useRef<MultiResponseE2EPhase | null>(multiResponseE2EPhase());
  const multiResponseE2EPhaseRef = useRef<MultiResponseE2EPhase | null>(null);
  const biosphereRiskTickerE2EQueryRef = useRef<BiosphereRiskTickerE2EPhase | null>(biosphereRiskTickerE2EPhase());
  const biosphereRiskTickerE2EPhaseRef = useRef<BiosphereRiskTickerE2EPhase | null>(null);
  const biosphereRiskTickerE2ECloudSaveHydratedRef = useRef(false);
  const medicalStorageE2EQueryRef = useRef<MedicalStorageE2EPhase | null>(medicalStorageE2EPhase());
  const medicalStorageE2EPhaseRef = useRef<MedicalStorageE2EPhase | null>(null);
  const medicalStorageE2ECloudSaveHydratedRef = useRef(false);
  const constructionBatchReloadE2EQueryRef = useRef<ConstructionBatchReloadE2EPhase | null>(constructionBatchReloadE2EPhase());
  const constructionBatchReloadE2EPhaseRef = useRef<ConstructionBatchReloadE2EPhase | null>(null);
  const housingBlockerReloadE2EQueryRef = useRef<HousingBlockerReloadE2EPhase | null>(housingBlockerReloadE2EPhase());
  const housingBlockerReloadE2EPhaseRef = useRef<HousingBlockerReloadE2EPhase | null>(null);
  const districtCommandsReloadE2EQueryRef = useRef<DistrictCommandsReloadE2EPhase | null>(districtCommandsReloadE2EPhase());
  const districtCommandsReloadE2EPhaseRef = useRef<DistrictCommandsReloadE2EPhase | null>(null);
  const researchQueueReloadE2EQueryRef = useRef<ResearchQueueReloadE2EPhase | null>(researchQueueReloadE2EPhase());
  const researchQueueReloadE2EPhaseRef = useRef<ResearchQueueReloadE2EPhase | null>(null);
  const utilityParityReloadE2EQueryRef = useRef<UtilityParityReloadE2EPhase | null>(utilityParityReloadE2EPhase());
  const utilityParityReloadE2EPhaseRef = useRef<UtilityParityReloadE2EPhase | null>(null);
  const railJourneyReloadE2EQueryRef = useRef<RailJourneyReloadE2EPhase | null>(railJourneyReloadE2EPhase());
  const railJourneyReloadE2EPhaseRef = useRef<RailJourneyReloadE2EPhase | null>(null);
  const railModulesReloadE2EQueryRef = useRef<RailModulesReloadE2EPhase | null>(railModulesReloadE2EPhase());
  const railModulesReloadE2EPhaseRef = useRef<RailModulesReloadE2EPhase | null>(null);
  const relationshipBoostE2EQueryRef = useRef<RelationshipBoostE2EPhase | null>(relationshipBoostE2EPhase());
  const relationshipBoostE2EPhaseRef = useRef<RelationshipBoostE2EPhase | null>(null);
  const relationshipRosterE2EQueryRef = useRef<RelationshipRosterE2EPhase | null>(relationshipRosterE2EPhase());
  const relationshipRosterE2EPhaseRef = useRef<RelationshipRosterE2EPhase | null>(null);
  const retinueAssignmentE2EQueryRef = useRef<RetinueAssignmentE2EPhase | null>(retinueAssignmentE2EPhase());
  const retinueAssignmentE2EPhaseRef = useRef<RetinueAssignmentE2EPhase | null>(null);
  const retinueLeadershipE2EQueryRef = useRef<RetinueLeadershipE2EPhase | null>(retinueLeadershipE2EPhase());
  const retinueLeadershipE2EPhaseRef = useRef<RetinueLeadershipE2EPhase | null>(null);
  const retinueLeadershipE2ECloudSaveHydratedRef = useRef(false);
  const retinueOperationE2EQueryRef = useRef<RetinueOperationE2EPhase | null>(retinueOperationE2EPhase());
  const retinueOperationE2EPhaseRef = useRef<RetinueOperationE2EPhase | null>(null);
  const retinueOperationE2ECloudSaveHydratedRef = useRef(false);
  const blackMarketAuditE2EQueryRef = useRef<BlackMarketAuditE2EPhase | null>(blackMarketAuditE2EPhase());
  const blackMarketAuditE2EPhaseRef = useRef<BlackMarketAuditE2EPhase | null>(null);
  const militaryFoodPoolE2EQueryRef = useRef<MilitaryFoodPoolE2EPhase | null>(militaryFoodPoolE2EPhase());
  const militaryFoodPoolE2EPhaseRef = useRef<MilitaryFoodPoolE2EPhase | null>(null);
  const missionMailE2EQueryRef = useRef<MissionMailE2EPhase | null>(missionMailE2EPhase());
  const missionMailE2EPhaseRef = useRef<MissionMailE2EPhase | null>(null);
  // Monotonic generation used to invalidate queued/in-flight async work when
  // the selected commander or playable city changes.
  const citySessionEpochRef = useRef(0);
  const [hasSave, setHasSave] = useState(false);
  const [activeSlot, setActiveSlot] = useState(1);
  const [lastSaveTime, setLastSaveTime] = useState(0);
  // Surfaced to the SaveIndicator so a quota / IO failure shows a red
  // "SAVE FAILED" badge instead of disappearing into a console.error.
  // null = healthy, last save committed cleanly. Cleared on the next
  // successful write so the indicator flips back to green.
  const [lastSaveError, setLastSaveError] = useState<{ kind: "quota" | "io"; message: string } | null>(null);
  const [slotMetas, setSlotMetas] = useState<SaveSlotMeta[]>([]);
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(null);
  const [turnRecap, setTurnRecap] = useState<TurnRecap | null>(null);
  // Steam Cloud sync state. `cloudSaveStatus` drives a small status line in
  // the menu; `cloudSaveConflicts` drives the keep-local / keep-cloud prompt.
  // The raw bytes needed to apply a resolution are kept in a ref so big save
  // strings don't sit in React state.
  const [cloudSaveStatus, setCloudSaveStatus] = useState<CloudSaveStatus>("off");
  const [cloudSaveConflicts, setCloudSaveConflicts] = useState<CloudSaveConflict[]>([]);
  const conflictRawRef = useRef<Map<number, { slotKey: string; localRaw: string; cloudRaw: string }>>(new Map());
  // Serializes baseline read-modify-write so concurrent slot syncs can't clobber
  // each other's baseline entries (the map is global, saves are only per-slot).
  const baselineLockRef = useRef<Promise<void>>(Promise.resolve());
  // Holds the latest reconcileCloudSaves so earlier-declared callbacks (e.g.
  // selectProfileFn) can trigger a re-sync without a forward declaration.
  const reconcileCloudSavesRef = useRef<((shouldContinue?: () => boolean, profileId?: string | null) => Promise<void>) | null>(null);
  // Per-tick subsystem failure surface. Lives outside GameState because it
  // is transient UI-only data that should not be persisted into save slots
  // — replays / loaded saves shouldn't show stale "Subsystem error" banners
  // from the previous session.
  const [lastTickErrors, setLastTickErrors] = useState<{
    tick: number;
    errors: TickSubsystemError[];
    suppressedErrors?: TickSubsystemError[];
    suppressedCount?: number;
  } | null>(null);
  const dismissTickErrors = useCallback(() => setLastTickErrors(null), []);
  const [pendingAchievements, setPendingAchievements] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState<PlayerProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<PlayerProfile[]>([]);
  const activeProfileRef = useRef<PlayerProfile | null>(null);
  const achQueueRef = useRef<string[]>([]);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>("active");
  const activeSlotRef = useRef(activeSlot);

  useEffect(() => { activeSlotRef.current = activeSlot; }, [activeSlot]);
  useEffect(() => { activeProfileRef.current = activeProfile; }, [activeProfile]);

  // Keep the offline-sim-depth preference in sync between the global settings
  // store (where the UI lives) and the active player profile (where the
  // choice is required to persist per-player). On profile activation, push
  // the profile's stored value into settings if present; otherwise leave
  // settings as-is and write the current setting back to the profile so
  // future loads stay aligned. The `offlineSimDepthSyncedProfileRef` guards
  // against the effect re-running and looping when both directions update.
  const offlineSimDepthSyncedProfileRef = useRef<string | null>(null);
  useEffect(() => {
    const prof = activeProfile;
    if (!prof) {
      offlineSimDepthSyncedProfileRef.current = null;
      return;
    }
    if (offlineSimDepthSyncedProfileRef.current !== prof.id) {
      offlineSimDepthSyncedProfileRef.current = prof.id;
      if (prof.offlineSimDepth) {
        const normalized = normalizeOfflineSimDepth(prof.offlineSimDepth);
        if (normalized !== offlineSimDepth) {
          setSettingsValue("offlineSimDepth", normalized);
          return;
        }
      }
    }
    if (prof.offlineSimDepth !== offlineSimDepth) {
      const updated = { ...prof, offlineSimDepth };
      activeProfileRef.current = updated;
      setActiveProfile(updated);
      saveProfile(updated)
        .then(() => { pushProfilesToCloud().catch(() => {}); })
        .catch(() => {});
    }
  }, [activeProfile, offlineSimDepth, setSettingsValue]);

  const getSlotKey = useCallback((slot: number): string => {
    if (factionCooldownE2EQueryRef.current || factionCooldownE2EPhase()) {
      return `${FACTION_COOLDOWN_E2E_KEY_PREFIX}${slot}`;
    }
    if (multiResponseE2EQueryRef.current || multiResponseE2EPhase()) {
      return `${MULTI_RESPONSE_E2E_KEY_PREFIX}${slot}`;
    }
    if (biosphereRiskTickerE2EQueryRef.current || biosphereRiskTickerE2EPhase()) {
      return `${BIOSPHERE_RISK_TICKER_E2E_KEY_PREFIX}${slot}`;
    }
    if (relationshipBoostE2EQueryRef.current || relationshipBoostE2EPhase()) {
      return `${RELATIONSHIP_BOOST_E2E_KEY_PREFIX}${slot}`;
    }
    if (relationshipRosterE2EQueryRef.current || relationshipRosterE2EPhase()) {
      return `${RELATIONSHIP_ROSTER_E2E_KEY_PREFIX}${slot}`;
    }
    if (retinueAssignmentE2EQueryRef.current || retinueAssignmentE2EPhase()) {
      return `${RETINUE_ASSIGNMENT_E2E_KEY_PREFIX}${slot}`;
    }
    if (retinueLeadershipE2EQueryRef.current || retinueLeadershipE2EPhase()) {
      return `${RETINUE_LEADERSHIP_E2E_KEY_PREFIX}${slot}`;
    }
    if (retinueOperationE2EQueryRef.current || retinueOperationE2EPhase()) {
      return `${RETINUE_OPERATION_E2E_KEY_PREFIX}${slot}`;
    }
    if (blackMarketAuditE2EQueryRef.current || blackMarketAuditE2EPhase()) {
      return `${BLACK_MARKET_AUDIT_E2E_KEY_PREFIX}${slot}`;
    }
    if (militaryFoodPoolE2EQueryRef.current || militaryFoodPoolE2EPhase()) {
      return `${MILITARY_FOOD_POOL_E2E_KEY_PREFIX}${slot}`;
    }
    const missionMailPhase = missionMailE2EQueryRef.current ?? missionMailE2EPhase();
    if (missionMailPhase && missionMailPhase !== "cloud-load") {
      return `${MISSION_MAIL_E2E_KEY_PREFIX}${slot}`;
    }
    if (medicalStorageE2EQueryRef.current || medicalStorageE2EPhase()) {
      return `${MEDICAL_STORAGE_E2E_KEY_PREFIX}${slot}`;
    }
    if (constructionBatchReloadE2EQueryRef.current || constructionBatchReloadE2EPhase()) {
      return `${CONSTRUCTION_BATCH_RELOAD_E2E_KEY_PREFIX}${slot}`;
    }
    if (housingBlockerReloadE2EQueryRef.current || housingBlockerReloadE2EPhase()) {
      return `${HOUSING_BLOCKER_RELOAD_E2E_KEY_PREFIX}${slot}`;
    }
    if (districtCommandsReloadE2EQueryRef.current || districtCommandsReloadE2EPhase()) {
      return `${DISTRICT_COMMANDS_RELOAD_E2E_KEY_PREFIX}${slot}`;
    }
    if (researchQueueReloadE2EQueryRef.current || researchQueueReloadE2EPhase()) {
      return `${RESEARCH_QUEUE_RELOAD_E2E_KEY_PREFIX}${slot}`;
    }
    if (utilityParityReloadE2EQueryRef.current || utilityParityReloadE2EPhase()) {
      return `${UTILITY_PARITY_RELOAD_E2E_KEY_PREFIX}${slot}`;
    }
    const worldMapRestorePhase =
      worldMapExportRestoreE2EQueryRef.current ?? worldMapExportRestoreE2EPhase();
    if (worldMapRestorePhase) {
      if (worldMapRestorePhase === "cloud-save" || worldMapRestorePhase === "cloud-load") {
        return `${WORLD_MAP_CLOUD_RESTORE_E2E_KEY_PREFIX}${slot}`;
      }
      if (worldMapRestorePhase === "full-backup-export" ||
        worldMapRestorePhase === "full-backup-restore") {
        return `${WORLD_MAP_FULL_BACKUP_E2E_KEY_PREFIX}${slot}`;
      }
      return `${WORLD_MAP_EXPORT_RESTORE_E2E_KEY_PREFIX}${slot}`;
    }
    if (railJourneyReloadE2EQueryRef.current || railJourneyReloadE2EPhase()) {
      return `${RAIL_JOURNEY_RELOAD_E2E_KEY_PREFIX}${slot}`;
    }
    if (railModulesReloadE2EQueryRef.current || railModulesReloadE2EPhase()) {
      return `${RAIL_MODULES_RELOAD_E2E_KEY_PREFIX}${slot}`;
    }
    const prof = activeProfileRef.current;
    if (prof) return profileSlotKey(prof.id, slot);
    return `${SAVE_KEY_PREFIX}${slot}`;
  }, []);

  const buildSlotMeta = (slot: number, data: GameState | null): SaveSlotMeta => {
    if (!data) return { slotId: slot, isEmpty: true, playerName: "", cityName: "", label: "", totalTicks: 0, playerLevel: 0, population: 0, lastSaved: 0, honorMode: false };
    return {
      slotId: slot,
      isEmpty: false,
      playerName: data.player?.name ?? "Commander Unknown",
      cityName: data.cityName ?? "MEGACITY JUAN",
      label: data.saveLabel ?? "",
      totalTicks: data.totalTicks ?? 0,
      playerLevel: data.player?.level ?? 1,
      population: data.cityStats?.population ?? 0,
      lastSaved: data.lastTickTime ?? 0,
      // Older saves predate the honorMode field; treat undefined as off so
      // we never accidentally lock a legacy run out of save/load.
      honorMode: data.honorMode === true,
    };
  };

  const readSlotMetas = useCallback(async (
    profileId: string | null = activeProfileRef.current?.id ?? null,
    strict: boolean = false,
  ): Promise<SaveSlotMeta[]> => {
    const metas: SaveSlotMeta[] = [];
    for (let i = 1; i <= MAX_SLOTS; i++) {
      try {
        const slotKey = profileId
          ? profileSlotKey(profileId, i)
          : `${SAVE_KEY_PREFIX}${i}`;
        const raw = await AsyncStorage.getItem(slotKey);
        if (raw) {
          const { json } = unwrapSave(raw);
          const parsed = JSON.parse(json) as GameState;
          metas.push(buildSlotMeta(i, parsed));
        } else {
          metas.push(buildSlotMeta(i, null));
        }
      } catch (error) {
        if (strict) throw error;
        metas.push(buildSlotMeta(i, null));
      }
    }
    return metas;
  }, []);

  const refreshSlotMetas = useCallback(async (
    profileId: string | null = activeProfileRef.current?.id ?? null,
    shouldApply: () => boolean = () => true,
    strict: boolean = false,
  ) => {
    const metas = await readSlotMetas(profileId, strict);
    // A commander transition while the reads were in flight makes this result
    // stale; do not paint mixed/old slot metadata over the new roster.
    if (!shouldApply() || (activeProfileRef.current?.id ?? null) !== profileId) return;
    setSlotMetas(metas);
    setHasSave(metas.some((m) => !m.isEmpty));
  }, [readSlotMetas]);

  // Mutate the cloud-sync baseline map behind a serialized lock. The baseline
  // is a single AsyncStorage key, so concurrent updates from different slots
  // must not interleave their read-modify-write. Best-effort: any failure only
  // risks a future spurious conflict prompt, never data loss.
  const withBaselineLock = useCallback(async (fn: () => Promise<void>) => {
    const prev = baselineLockRef.current;
    const next = (async () => {
      await prev.catch(() => {});
      try {
        await fn();
      } catch {
        /* baseline is a hint; ignore */
      }
    })();
    baselineLockRef.current = next;
    await next;
  }, []);

  // Record a slot's cloud-sync baseline behind the shared lock.
  const recordBaselineLocked = useCallback(
    (slotKey: string, wrapped: string) =>
      withBaselineLock(() => recordSyncBaseline(AsyncStorage, slotKey, wrapped)),
    [withBaselineLock],
  );

  const syncGlobalAchievements = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const merged = await mergeAndSaveGlobalAchievements(ids);
    setGlobalAchievements(merged);
    await unlockSteamAchievements(ids).catch(() => {});
  }, []);

  useEffect(() => {
    loadGlobalAchievements().then(setGlobalAchievements);
    // Recovery snapshot detection happens here so the menu can surface a
    // restore prompt on cold launch right after a crash. We import the
    // reader directly (not the wrapped action) to avoid a hoisting cycle
    // with the action useCallback declared below.
    readRecoverySnapshotMeta()
      .then((meta) => {
        setHasRecoverySnapshot(meta.exists);
        setRecoverySnapshotInfo({ savedAt: meta.savedAt, cityName: meta.cityName });
      })
      .catch(() => {});
  }, []);

  // ─── PROFILE MANAGEMENT ─────────────────────────────────────────────
  const refreshProfiles = useCallback(async () => {
    const profiles = await loadAllProfiles();
    // Hydrate the custom-portrait registry BEFORE the profiles reach any
    // consumer, so a "custom_<id>" portraitId is always resolvable by the
    // time a roster row / menu greeting renders. Invalid or oversized URIs
    // are silently skipped (register validates) and those profiles fall
    // back to the default portrait.
    for (const p of profiles) {
      if (p.customPortraitUri) registerCustomPortrait(p.id, p.customPortraitUri);
    }
    setAllProfiles(profiles);
  }, []);

  const createProfileFn = useCallback(async (name: string, age: number, sex: "male" | "female" | "other", portraitId?: string, customPortraitUri?: string): Promise<PlayerProfile> => {
    // Prune ghost/duplicate index entries FIRST so the cap check counts real,
    // loadable profiles — the same count the roster UI shows. Otherwise a
    // stale index can claim 8 profiles while the screen shows fewer, making
    // creation fail while the button looks available.
    const index = await pruneProfileIndex();
    if (index.length >= MAX_PROFILES) {
      throw new Error(
        `All ${MAX_PROFILES} commander slots are in use. Delete a commander to free a slot.`,
      );
    }
    const profile = createDefaultProfile(name, age, sex, portraitId);
    // Attach an uploaded photo, if any, before the first save so the very
    // first profile blob already carries it. register() validates the data
    // URI and enforces the size cap — on failure the profile simply keeps
    // its gallery portraitId.
    if (customPortraitUri && registerCustomPortrait(profile.id, customPortraitUri)) {
      profile.customPortraitUri = customPortraitUri;
      profile.portraitId = customPortraitIdFor(profile.id);
    }
    await saveProfile(profile);
    const deduped = Array.from(new Set([...index, profile.id]));
    await saveProfileIndex(deduped);
    await saveActiveProfileId(profile.id);
    citySessionEpochRef.current += 1;
    citySessionActiveRef.current = false;
    setIsCitySessionActive(false);
    setActiveProfile(profile);
    activeProfileRef.current = profile;
    await refreshProfiles();
    await refreshSlotMetas();
    pushProfilesToCloud().catch(() => {});
    return profile;
  }, [refreshProfiles, refreshSlotMetas]);

  const selectProfileFn = useCallback(async (profileId: string) => {
    citySessionEpochRef.current += 1;
    citySessionActiveRef.current = false;
    setIsCitySessionActive(false);
    const profile = await loadProfile(profileId);
    if (!profile) return;
    // Idempotent re-register covers cloud-restored profiles whose portrait
    // never passed through refreshProfiles on this device.
    if (profile.customPortraitUri) registerCustomPortrait(profile.id, profile.customPortraitUri);
    setActiveProfile(profile);
    activeProfileRef.current = profile;
    await saveActiveProfileId(profileId);
    // Reconcile the newly active profile's slots against Steam Cloud before we
    // read metas / pick the best slot, so a switched-to profile gets the same
    // pull-newer / conflict-surfacing safety as a cold launch. No-ops off Steam.
    await reconcileCloudSavesRef.current?.().catch((e) => {
      console.warn("[selectProfile] reconcileCloudSaves failed:", e);
    });
    await refreshSlotMetas();
    pushProfilesToCloud().catch(() => {});

    let bestSlot = -1;
    let bestTime = 0;
    for (let i = 1; i <= MAX_SLOTS; i++) {
      const key = profileSlotKey(profileId, i);
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        try {
          const { json: sj } = unwrapSave(raw);
          const parsed = JSON.parse(sj) as GameState;
          const t = parsed.lastTickTime ?? 0;
          if (t > bestTime) { bestTime = t; bestSlot = i; }
        } catch {}
      }
    }

    if (bestSlot > 0) {
      const key = profileSlotKey(profileId, bestSlot);
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        try {
          let { json, valid } = unwrapSave(raw);
          if (!valid) {
            const backupRaw = await AsyncStorage.getItem(key + BACKUP_SUFFIX);
            if (backupRaw) {
              const backup = unwrapSave(backupRaw);
              if (backup.valid) { json = backup.json; }
            }
          }
          const saved = sanitizeState(migrateState(JSON.parse(json) as GameState));
          saved.dailyStreak = refreshDailyVisit(saved.dailyStreak ?? { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null });
          saved.weeklyChallenge = refreshWeeklyChallenge(saved.weeklyChallenge, saved);
          setState(saved);
          setHasSave(true);
          setActiveSlot(bestSlot);
          activeSlotRef.current = bestSlot;
          return;
        } catch (e) {
          // Save is so malformed that even migrate/sanitize threw; treat the
          // profile as having no usable save and let the user start fresh
          // rather than crashing the profile-select flow.
          console.error(`Profile ${profileId} slot ${bestSlot} failed to load:`, e);
        }
      }
    }

    setHasSave(false);
    setActiveSlot(1);
    activeSlotRef.current = 1;
  }, [refreshSlotMetas]);

  const deleteProfileFn = useCallback(async (profileId: string) => {
    // Deleting a commander must also remove that commander's cloud save
    // files, or a later profile restore would resurrect the whole roster of
    // "deleted" cities. Tombstone each slot key first (same crash-safe order
    // as deleteSlot), then attempt the cloud delete; a confirmed delete
    // clears its tombstone. A failed one leaves the tombstone for the
    // orphan-tombstone sweep at the end of reconcileCloudSaves — the per-slot
    // reconcile loop only walks the ACTIVE profile's keys and this profile
    // can never become active again, so the sweep is what retries these.
    if (isSteamAvailable()) {
      for (let i = 1; i <= MAX_SLOTS; i++) {
        const key = profileSlotKey(profileId, i);
        await withBaselineLock(() => recordDeletionTombstone(AsyncStorage, key));
        if (isSteamCloudAvailable()) {
          const ok = await deleteCloudSave(key).catch(() => false);
          if (ok) await withBaselineLock(() => clearSyncBaseline(AsyncStorage, key));
        }
      }
    } else {
      // No Steam, no cloud copy possible — drop any baseline entries (and
      // stale tombstones) for this commander's slot keys in one locked pass,
      // mirroring deleteSlot's non-Steam branch. Leaving them behind would
      // orphan lineage records that a future profile colliding with a
      // recycled slot key could inherit.
      const keys: string[] = [];
      for (let i = 1; i <= MAX_SLOTS; i++) keys.push(profileSlotKey(profileId, i));
      await withBaselineLock(() => clearSyncBaselines(AsyncStorage, keys));
    }
    await deleteProfileStorage(profileId);
    // Drop the deleted commander's uploaded portrait from the in-memory
    // registry. The image bytes themselves lived inline on the profile blob
    // deleteProfileStorage just removed, so this is the only other copy.
    unregisterCustomPortrait(profileId);
    // Read the active profile through the ref, not the `activeProfile` state
    // closure: the actions context is memoized once, so this callback is the
    // first-render version forever. The state closure is permanently null,
    // which silently skipped this branch when deleting the ACTIVE commander
    // and left the menu greeting a deleted profile.
    if (activeProfileRef.current?.id === profileId) {
      citySessionEpochRef.current += 1;
      citySessionActiveRef.current = false;
      setIsCitySessionActive(false);
      setActiveProfile(null);
      activeProfileRef.current = null;
      setHasSave(false);
      setSlotMetas([]);
      await AsyncStorage.removeItem("@megacity_active_profile");
    }
    await refreshProfiles();
    // Await the cloud profile-bundle update so the deleted commander doesn't
    // linger in the cloud roster longer than necessary. Best-effort: a
    // failure here only risks a stale bundle, which the slot tombstones and
    // ghost-index pruning already defend against.
    await pushProfilesToCloud().catch(() => false);
  }, [refreshProfiles, withBaselineLock]);

  // ─── SAVE / LOAD ────────────────────────────────────────────────────
  const saveToSlot = useCallback(async (slot: number): Promise<boolean> => {
    if (!citySessionActiveRef.current) return false;
    const saveSession = {
      epoch: citySessionEpochRef.current,
      profileId: activeProfileRef.current?.id ?? null,
    };
    const saveProfileSnapshot = activeProfileRef.current;
    const slotKey = getSlotKey(slot);
    const requestStillCurrent = () => isSaveSessionCurrent(
      saveSession,
      citySessionEpochRef.current,
      activeProfileRef.current?.id ?? null,
      citySessionActiveRef.current,
    );
    // Concurrency lock: if a save to this slot is already in flight, return its
    // promise. AsyncStorage writes aren't atomic, so two overlapping setItem
    // calls to the same key can interleave and produce corrupted UTF-16 output.
    // Lock is keyed per-slot via the createSlotLock() helper so it can be
    // unit-tested without mounting GameProvider.
    const result = await saveInFlightRef.current.run(slotKey, async (): Promise<boolean> => {
    try {
      if (!requestStillCurrent()) return false;
      // Skip if the state object reference hasn't changed since the last save to this slot.
      // setState always produces a new state object, so reference equality reliably means
      // "nothing has mutated" and re-persisting would be wasted work.
      const current = stateRef.current;
      if (lastSavedStateRef.current.state === current && lastSavedStateRef.current.slotKey === slotKey) {
        return true;
      }
      const sanitized = sanitizeState(current);
      // Mirror the active offline-sim-depth into the slot envelope so a
      // Steam cloud restore on another device can re-apply the same
      // Lite/Standard/Deep preference even when no local profile exists
      // there yet. Profile + settings remain the per-device source of
      // truth; this is just a backup ride-along on the slot bytes.
      const toSave = {
        ...sanitized,
        saveSlot: slot,
        lastTickTime: Date.now(),
        // Keep the capped last-tick ledger so capacity warnings and other
        // player-facing result details remain available after a save/reload.
        offlineSimDepth: normalizeOfflineSimDepth(offlineSimDepthRef.current),
      };
      // Deterministic failure injection for the packaged Electron smoke test.
      // It is only exposed by the preload bridge when the test explicitly
      // launches the shell with MEGACITY_E2E_SAVE_FAILURE=1; ordinary web and
      // native sessions never take this path.
      if (
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        (window as any).desktop?.simulateSaveFailure === true
      ) {
        throw new SaveWriteError("io", "Simulated save failure for packaged desktop smoke test");
      }
      if (toSave.messages && toSave.messages.length > ARRAY_CAPS.messages) toSave.messages = toSave.messages.slice(0, ARRAY_CAPS.messages);
      if (toSave.completedContracts && toSave.completedContracts.length > ARRAY_CAPS.completedContracts) toSave.completedContracts = toSave.completedContracts.slice(-ARRAY_CAPS.completedContracts);
      if (toSave.combat?.battleLog && toSave.combat.battleLog.length > ARRAY_CAPS.battleLog) toSave.combat = { ...toSave.combat, battleLog: toSave.combat.battleLog.slice(0, ARRAY_CAPS.battleLog) };
      // Centralized writer: rotates existing primary into _backup, writes wrapped.
      // A single transient IO blip (native bridge stall, momentary contention)
      // usually clears on a second attempt, so retry exactly once after a short
      // pause when the failure is an "io" SaveWriteError. Quota failures are NOT
      // retried — they won't clear without the player freeing space, so a retry
      // just wastes a write and delays the "STORAGE FULL" feedback.
      const wrapped = await (async () => {
        try {
          return await writeSlotSave(AsyncStorage, slotKey, toSave);
        } catch (err) {
          if (err instanceof SaveWriteError && err.kind === "io") {
            await new Promise((r) => setTimeout(r, 250));
            try {
              const result = await writeSlotSave(AsyncStorage, slotKey, toSave);
              // Telemetry-style breadcrumb: lets QA spot flaky devices where
              // the first write fails but the retry succeeds (invisible to
              // the player, but worth surfacing in logs).
              console.warn("[saveToSlot] Save recovered after retry (transient IO failure on first attempt)");
              return result;
            } catch (retryErr) {
              console.warn("[saveToSlot] Save failed after retry (IO failure persisted across both attempts)");
              throw retryErr;
            }
          }
          throw err;
        }
      })();
      // A commander switch that lands while the local write is in flight may
      // let the old profile's correctly-snapshotted local save finish, but no
      // stale UI/profile/cloud side effects may leak into the new session.
      if (!requestStillCurrent()) return false;
      if (isSteamCloudAvailable() && !conflictRawRef.current.has(slot)) {
        // Push to cloud, then record the synced lineage as the new baseline so
        // a later reconcile can tell a one-sided change from a true conflict.
        // Fire-and-forget: a cloud failure must never block local progress —
        // the local write already committed above. We surface a non-fatal
        // "error" status so the menu can hint that the cloud copy is behind.
        //
        // We deliberately SKIP the cloud push while this slot has an
        // unresolved conflict: blindly pushing would silently overwrite the
        // diverged cloud copy before the player has made their keep-local /
        // keep-cloud choice. Local progress still commits to disk, and the
        // cloud copy is reconciled (or pushed) once the conflict is resolved.
        writeCloudSave(slotKey, wrapped)
          .then(async (ok) => {
            if (ok) {
              await recordBaselineLocked(slotKey, wrapped);
              if (requestStillCurrent()) setCloudSaveStatus("synced");
            } else {
              if (requestStillCurrent()) setCloudSaveStatus("error");
            }
          })
          .catch(() => {
            if (requestStillCurrent()) setCloudSaveStatus("error");
          });
      }
      lastSavedStateRef.current = { state: current, slotKey };
      setActiveSlot(slot);
      setLastSaveTime(Date.now());
      // Successful commit clears any prior failure so the indicator
      // flips back to the green "SAVED" badge.
      setLastSaveError(null);
      playSound("save");
      playHaptic("light");
      await refreshSlotMetas(saveSession.profileId);
      if (!requestStillCurrent()) return false;
      syncGlobalAchievements(toSave.unlockedAchievements ?? []).catch(() => {});

      if (saveProfileSnapshot) {
        const updated = syncProfileFromGameState(saveProfileSnapshot, toSave);
        await saveProfile(updated);
        if (!requestStillCurrent()) return false;
        setActiveProfile(updated);
        activeProfileRef.current = updated;
        pushProfilesToCloud().catch(() => {});
      }
      return true;
    } catch (e) {
      console.error("Save failed:", e);
      // Surface the failure to the SaveIndicator. A SaveWriteError
      // (thrown by atomicWriteSlot) carries a typed kind so the badge
      // can show "STORAGE FULL" specifically; anything else is treated
      // as a generic IO failure. This replaces the prior silent
      // console.error which let the player keep playing assuming their
      // progress was being saved.
      const kind: "quota" | "io" = e instanceof SaveWriteError ? e.kind : "io";
      const message = e instanceof Error ? e.message : String(e);
      setLastSaveError({ kind, message });
      return false;
    }
    });
    return result === true;
  }, [refreshSlotMetas, syncGlobalAchievements, getSlotKey]);

  const saveGame = useCallback(async (): Promise<boolean> => {
    // Read the active slot through the ref, not the `activeSlot` state
    // closure: the actions context is memoized once, so consumers hold the
    // first-render version of this callback forever. The state closure is
    // permanently stuck at slot 1, which would save a slot-2/3 run into
    // slot 1 and silently overwrite it.
    return saveToSlot(activeSlotRef.current);
  }, [saveToSlot]);

  // Stable ref so the AppState background listener (mounted once with []
  // deps) can call the lock-protected saveGame without re-registering on
  // every callback identity change. Direct writeSlotSave from background
  // would race the autosave path's per-slot in-flight lock and risk
  // interleaved writes / corrupted save bytes.
  const saveGameRef = useRef(saveGame);
  useEffect(() => { saveGameRef.current = saveGame; }, [saveGame]);

  const setSaveLabel = useCallback(async (label: string, slot?: number) => {
    const trimmed = label.trim().slice(0, 40);
    // activeSlotRef, not the `activeSlot` state closure: this callback is
    // frozen at first render by the actions-context memo, so the closure
    // would always read slot 1 — mislabeling the wrong slot's save file and
    // skipping the in-memory label update for the actually-active run.
    const currentSlot = activeSlotRef.current;
    const targetSlot = slot ?? currentSlot;
    if (targetSlot === currentSlot) {
      setState((prev) => ({ ...prev, saveLabel: trimmed }));
    }
    try {
      const key = getSlotKey(targetSlot);
      const ok = await patchSlotSave(AsyncStorage, key, (parsed) => {
        parsed.saveLabel = trimmed;
        return parsed;
      });
      if (ok) await refreshSlotMetas();
    } catch (e) {
      console.error("setSaveLabel persist failed:", e);
    }
  }, [getSlotKey, refreshSlotMetas]);

  // Per-run Honor Mode toggle. Updates in-memory state immediately so the
  // UI flips at once, then patches whichever slot file backs the active
  // run so the flag survives reloads. We don't force a full saveToSlot()
  // here because the engine ticks save snapshots on its own cadence;
  // patching the on-disk file directly avoids racing with that cadence.
  const setHonorMode = useCallback(async (enabled: boolean) => {
    setState((prev) => ({ ...prev, honorMode: enabled }));
    try {
      // activeSlotRef, not the `activeSlot` state closure (frozen at first
      // render by the actions-context memo — the closure would always patch
      // slot 1's file, so a slot-2/3 run's Honor Mode flag would not survive
      // a reload).
      const key = getSlotKey(activeSlotRef.current);
      const ok = await patchSlotSave(AsyncStorage, key, (parsed) => {
        parsed.honorMode = enabled;
        return parsed;
      });
      if (ok) await refreshSlotMetas();
    } catch (e) {
      console.error("setHonorMode persist failed:", e);
    }
  }, [getSlotKey, refreshSlotMetas]);

  const [hasRecoverySnapshot, setHasRecoverySnapshot] = useState(false);
  const [recoverySnapshotInfo, setRecoverySnapshotInfo] = useState<{ savedAt: number | null; cityName: string | null }>({ savedAt: null, cityName: null });

  const refreshRecoverySnapshot = useCallback(async () => {
    const meta = await readRecoverySnapshotMeta();
    setHasRecoverySnapshot(meta.exists);
    setRecoverySnapshotInfo({ savedAt: meta.savedAt, cityName: meta.cityName });
  }, []);

  const dismissRecoverySnapshot = useCallback(async () => {
    await clearRecoverySnapshot();
    setHasRecoverySnapshot(false);
    setRecoverySnapshotInfo({ savedAt: null, cityName: null });
  }, []);

  const loadRecoverySnapshot = useCallback(async (): Promise<boolean> => {
    try {
      // Guard: don't apply a recovered snapshot when no profile is selected.
      // The menu UI only surfaces the restore button after profile selection,
      // but this protects API callers from clobbering an empty state with
      // game data that has no owning profile to attach to.
      if (!activeProfileRef.current) {
        console.warn("Recovery load skipped — no active profile");
        return false;
      }
      const raw = await AsyncStorage.getItem(RECOVERY_SAVE_KEY);
      if (!raw) return false;
      const { json, valid } = unwrapSave(raw);
      if (!valid) {
        console.warn("Recovery snapshot checksum mismatch — discarding");
        await clearRecoverySnapshot();
        setHasRecoverySnapshot(false);
        return false;
      }
      const saved = sanitizeState(migrateState(JSON.parse(json) as GameState));
      saved.dailyStreak = refreshDailyVisit(saved.dailyStreak ?? { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null });
      saved.weeklyChallenge = refreshWeeklyChallenge(saved.weeklyChallenge, saved);
      citySessionEpochRef.current += 1;
      citySessionActiveRef.current = true;
      setIsCitySessionActive(true);
      setState(saved);
      setHasSave(true);
      // One-shot: snapshot is consumed on restore so it can't be re-applied
      // accidentally and won't shadow newer autosaves on subsequent crashes.
      await clearRecoverySnapshot();
      setHasRecoverySnapshot(false);
      setRecoverySnapshotInfo({ savedAt: null, cityName: null });
      return true;
    } catch (e) {
      console.error("Recovery load failed:", e);
      return false;
    }
  }, []);

  const loadSlot = useCallback(async (slot: number): Promise<boolean> => {
    try {
      const slotKey = getSlotKey(slot);
      let raw = await AsyncStorage.getItem(slotKey);
      if (!raw && isSteamCloudAvailable()) {
        const cloudRaw = await readCloudSave(slotKey);
        if (cloudRaw) {
          raw = cloudRaw;
          // Restore opaque cloud bytes; backup-rotate any local primary first.
          await writeSlotRaw(AsyncStorage, slotKey, raw);
        }
      }
      if (!raw) return false;

      let { json, valid } = unwrapSave(raw);
      if (!valid) {
        console.warn(`Save checksum mismatch for slot ${slot}, attempting backup...`);
        const backupRaw = await AsyncStorage.getItem(slotKey + BACKUP_SUFFIX);
        if (backupRaw) {
          const backup = unwrapSave(backupRaw);
          if (backup.valid) {
            console.warn("Backup save loaded successfully");
            json = backup.json;
          } else {
            console.warn("Backup also corrupted, using primary save anyway");
          }
        }
      }

      const saved = addCompanyQuarantineAdvisory(
        sanitizeState(migrateState(JSON.parse(json) as GameState)),
      );
      // Refresh "live" per-visit systems: daily streak visit stamp + weekly
      // challenge generator (rolls when ISO week changes).
      saved.dailyStreak = refreshDailyVisit(saved.dailyStreak ?? { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null });
      saved.weeklyChallenge = refreshWeeklyChallenge(saved.weeklyChallenge, saved);
      // Restore the saved offline-sim-depth into the global setting if it
      // differs. This lets a Steam cloud save carry the player's
      // Lite/Standard/Deep preference across devices even when the local
      // profile on this device doesn't have it yet. The existing
      // settings<->profile sync effect will then mirror the new setting
      // back into the active profile so it sticks.
      //
      // We also use this `effectiveDepth` immediately for the first
      // offline catch-up batch below — `setSettingsValue` only updates
      // `offlineSimDepthRef` after the next render/effect, so without
      // this local the just-restored preference would not affect the
      // very first missed-ticks pass on a fresh-device cloud load.
      const effectiveDepth = saved.offlineSimDepth
        ? normalizeOfflineSimDepth(saved.offlineSimDepth)
        : normalizeOfflineSimDepth(offlineSimDepthRef.current);
      if (saved.offlineSimDepth && effectiveDepth !== offlineSimDepthRef.current) {
        setSettingsValue("offlineSimDepth", effectiveDepth);
      }
      // Backfill prestige cache fields from active profile so older saves get
      // updated #19 multipliers (business spawn, chain expansion, monopoly cap).
      const profForCache = activeProfileRef.current;
      if (profForCache?.prestigeState) {
        const ps = profForCache.prestigeState;
        if (saved.prestigeBusinessSpawnMult == null) saved.prestigeBusinessSpawnMult = getBusinessSpawnIntervalMultiplier(ps);
        if (saved.prestigeChainExpansionMult == null) saved.prestigeChainExpansionMult = getChainExpansionChanceMultiplier(ps);
        if (saved.prestigeAntiMonopolyCapDelta == null) saved.prestigeAntiMonopolyCapDelta = getAntiMonopolyCapDelta(ps);
      }
      const global = await loadGlobalAchievements();
      const mergedBase = Array.from(new Set([...(saved.unlockedAchievements ?? []), ...global]));
      saved.unlockedAchievements = mergedBase;
      const { newState: caughtUpState, report } = runOfflineCatchup(saved, effectiveDepth);
      const finalState = addCompanyQuarantineAdvisory(caughtUpState);
      // Keep synchronous consumers in step with the restored save before the
      // React commit. Load callers may immediately replay a completion or
      // dispatch another action after awaiting this function.
      stateRef.current = finalState;
      _liveStateRef.current = finalState;
      setState(finalState);
      citySessionEpochRef.current += 1;
      citySessionActiveRef.current = true;
      setIsCitySessionActive(true);
      syncGlobalAchievements(finalState.unlockedAchievements ?? []).catch(() => {});
      if (report) setOfflineReport(report);
      setActiveSlot(slot);
      setHasSave(true);
      return true;
    } catch (e) {
      console.error("Load failed:", e);
      return false;
    }
  }, [syncGlobalAchievements, setSettingsValue]);

  const loadGame = useCallback(async (): Promise<boolean> => {
    // activeSlotRef, not the `activeSlot` state closure: this callback is
    // frozen at first render by the actions-context memo, so the closure
    // would always reload slot 1 regardless of which run is active.
    return loadSlot(activeSlotRef.current);
  }, [loadSlot]);

  // Browser-only save/load regression harness. The E2E first visits the
  // `save` phase, which exercises the real GameContext save path, then
  // reloads the page into the `load` phase and exercises loadSlot through the
  // wrapped AsyncStorage envelope plus migrate/sanitize pipeline. The
  // `cloud-save`/`cloud-load` phases use the same isolated slot key while the
  // browser fixture supplies a Steam-compatible cloud bridge. The dedicated
  // key is never a player's profile or legacy slot.
  useEffect(() => {
    if (!isLoaded) return;
    // The root demo route pushes /(game)/factions after the root layout mounts.
    // Defer one task turn so the preserved fixture query is visible even when
    // this effect runs before that navigation.
    const timer = setTimeout(() => {
      const phase = factionCooldownE2EPhase() ?? factionCooldownE2EQueryRef.current;
      if (!phase || factionCooldownE2EPhaseRef.current === phase) return;
      factionCooldownE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save" || phase === "cloud-save") {
          // saveToSlot normally requires an explicitly active city session.
          // This dev-only fixture is already a complete in-memory city, so
          // activate that session just for the isolated write.
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[factionCooldownE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[factionCooldownE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  // Browser/packaged mission-success inbox dismissal fixture. The save phase
  // starts with one canonical unread result message; the inbox's real delete
  // action persists the dismissal into this isolated slot. The load phase
  // restores that state and replays the same completion callback to prove the
  // dismissed message is not recreated.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = missionMailE2EPhase() ?? missionMailE2EQueryRef.current;
      if (!phase || missionMailE2EPhaseRef.current === phase) return;
      missionMailE2EPhaseRef.current = phase;

      void (async () => {
        const missionResult: MissionResult = {
          missionId: "trade_negotiation",
          officerName: "Ada Vance",
          success: true,
          message: "Ada Vance completed Trade Negotiation successfully!",
          rewards: ["+60,000 credits"],
        };
        const missionDate = { year: 2030, month: 2, day: 3, hour: 4 };
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const seeded = appendMissionResultMessage(
            stateRef.current,
            missionResult,
            missionDate,
            42,
          );
          stateRef.current = seeded;
          _liveStateRef.current = seeded;
          setState(seeded);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[missionMailE2E] fixture save failed");
          return;
        }

        if (phase === "cloud-load") {
          // The packaged cloud fixture must use the normal profile-scoped
          // slot key. Wait for the player's real Continue/load action to
          // activate that session, then replay the completion callback
          // against the cloud-restored state.
          for (let attempt = 0; attempt < 600 && !citySessionActiveRef.current; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          if (!citySessionActiveRef.current) {
            console.error("[missionMailE2E] cloud restore session did not become active");
            return;
          }
        } else {
          const loaded = await loadSlot(1);
          if (!loaded) {
            console.error("[missionMailE2E] fixture load failed");
            return;
          }
        }
        const replayed = appendMissionResultMessage(
          stateRef.current,
          missionResult,
          missionDate,
          42,
        );
        const messageId = "mission-success-trade_negotiation-42-Ada Vance";
        const recreated = (replayed.messages ?? []).some((message) => message.id === messageId);
        stateRef.current = replayed;
        _liveStateRef.current = replayed;
        setState(replayed);
        if (recreated) {
          console.error("[missionMailE2E] replay recreated dismissed mission mail");
        } else if (phase === "cloud-load") {
          console.info("[missionMailE2E] cloud restore replay preserved dismissed mission mail");
        } else {
          console.info("[missionMailE2E] replay preserved dismissed mission mail");
        }
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(MISSION_MAIL_E2E_PHASE_KEY);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  // Browser-only save/load regression harness for multi-choice event cards.
  // The save phase persists the seeded event, and the load phase recreates the
  // provider before restoring it through the real wrapped save pipeline. This
  // catches regressions where responseOptions or maxResponses are lost during
  // rehydration, while keeping the fixture isolated from player saves.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = multiResponseE2EPhase() ?? multiResponseE2EQueryRef.current;
      if (!phase || multiResponseE2EPhaseRef.current === phase) return;
      multiResponseE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[multiResponseE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[multiResponseE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  // Browser-only save/load regression harness for the biosphere-risk ticker.
  // The save phase waits until the real turn pipeline has emitted the nature
  // warning, then persists that state through the normal wrapped save path.
  // The load phase restores it before the demo route mounts, so
  // useNewsHeadlines can seed its seen-id ref from the persisted state.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = biosphereRiskTickerE2EPhase() ?? biosphereRiskTickerE2EQueryRef.current;
      if (!phase || biosphereRiskTickerE2EPhaseRef.current === phase) return;
      const hasPersistedNatureWarning =
        (stateRef.current.newsFeed ?? []).some((item) => item.id.startsWith("news-biosphere-risk-rising-")) ||
        (stateRef.current.messages ?? []).some((message) => message.id.startsWith("biosphere-crisis-tier-"));
      // Save phases can run before END TURN on a freshly seeded fixture. Wait
      // for the warning rather than saving the initial fixture and falsely
      // testing an empty persisted state.
      if ((phase === "save" || phase === "cloud-save") && !hasPersistedNatureWarning) {
        // The cloud-save page is a new provider instance. Hydrate the warning
        // from the local fixture first so a browser navigation can never let
        // the background-save listener upload the fresh demo state over it.
        if (phase === "cloud-save" && !biosphereRiskTickerE2ECloudSaveHydratedRef.current) {
          biosphereRiskTickerE2ECloudSaveHydratedRef.current = true;
          void loadSlot(1).then((loaded) => {
            if (!loaded) console.error("[biosphereRiskTickerE2E] cloud-save fixture hydration failed");
          });
        }
        return;
      }
      biosphereRiskTickerE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save" || phase === "cloud-save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[biosphereRiskTickerE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[biosphereRiskTickerE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot, state.totalTicks]);

  // Browser-only medical storage fixture. The offline phase drives the report
  // directly in memory; save/load phases first run that same full reserve
  // scenario, then persist and restore it through the normal wrapped slot
  // envelope using a disposable key. Cloud-save hydrates the completed local
  // fixture before uploading so a fresh provider cannot overwrite it with the
  // unmodified demo state during navigation.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = medicalStorageE2EPhase() ?? medicalStorageE2EQueryRef.current;
      if (!phase || medicalStorageE2EPhaseRef.current === phase) return;
      void (async () => {
        if (phase === "offline") {
          medicalStorageE2EPhaseRef.current = phase;
          const { newState, report } = runOfflineCatchup(stateRef.current, "standard");
          setState(newState);
          if (report) setOfflineReport(report);
          return;
        }

        const hasPersistedMedicalReport = (stateRef.current.tickLog ?? []).some((entry) =>
          [entry.label, entry.reason, entry.unit].some((value) =>
            typeof value === "string" && value.toUpperCase().includes("MEDICAL SUPPLIES STORED"),
          ),
        );
        if (phase === "cloud-save" && !hasPersistedMedicalReport) {
          if (!medicalStorageE2ECloudSaveHydratedRef.current) {
            medicalStorageE2ECloudSaveHydratedRef.current = true;
            void loadSlot(1).then((loaded) => {
              if (!loaded) console.error("[medicalStorageE2E] cloud-save fixture hydration failed");
            });
          }
          return;
        }

        medicalStorageE2EPhaseRef.current = phase;
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const { state: newState } = runLiveTick(stateRef.current);
          // saveToSlot reads the ref synchronously; update it before the
          // asynchronous React state commit so the persisted envelope contains
          // the completed medical reserve scenario.
          stateRef.current = newState;
          setState(newState);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[medicalStorageE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) {
          console.error("[medicalStorageE2E] fixture load failed");
          return;
        }
        // Cloud restore writes the opaque bytes before normal hydration. Run
        // one ordinary save after hydration too, matching the first autosave
        // boundary that can otherwise normalize the restored envelope.
        if (phase === "cloud-load") {
          const saved = await saveToSlot(1);
          if (!saved) console.error("[medicalStorageE2E] post-restore fixture save failed");
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot, state.tickLog]);

  // Browser-only regression harness for a player-ordered construction batch.
  // The save phase waits for the real BUILD confirmation to enqueue one
  // multi-building order, then persists it through the wrapped slot path. The
  // load phase restores that isolated envelope so the browser test can verify
  // the batch shape and timer before advancing it to completion.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = constructionBatchReloadE2EPhase() ?? constructionBatchReloadE2EQueryRef.current;
      if (!phase || constructionBatchReloadE2EPhaseRef.current === phase) return;
      const order = stateRef.current.pendingConstructions?.[0];
      if (phase === "save" && (!order || order.kind !== "city" || order.count <= 1)) return;
      constructionBatchReloadE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[constructionBatchReloadE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[constructionBatchReloadE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot, state.pendingConstructions?.length]);

  // Browser and packaged regression harness for housing blocker persistence.
  // The disposable save keeps the seeded resource or queue shortage intact,
  // then the load phase restores it through the normal wrapped slot pipeline.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = housingBlockerReloadE2EPhase() ?? housingBlockerReloadE2EQueryRef.current;
      if (!phase || housingBlockerReloadE2EPhaseRef.current === phase) return;
      housingBlockerReloadE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[housingBlockerReloadE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) {
          console.error("[housingBlockerReloadE2E] fixture load failed");
        } else {
          console.info("[housingBlockerReloadE2E] fixture load complete");
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  // Browser-only save/load regression harness for district commands. The save
  // phase waits for the real district command button to mutate a ward, then
  // persists that result through the wrapped slot path. The load phase
  // restores the isolated envelope so the browser test can verify both the
  // cooldown reason and the district-scoped key after a provider reload.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = districtCommandsReloadE2EPhase() ?? districtCommandsReloadE2EQueryRef.current;
      if (!phase || districtCommandsReloadE2EPhaseRef.current === phase) return;
      if (phase === "save" && (stateRef.current.districtCommandHistory?.length ?? 0) === 0) return;
      districtCommandsReloadE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[districtCommandsE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[districtCommandsE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot, state.districtCommandHistory?.length]);

  // Browser-only save/load regression harness for research queue ETAs.
  // The queue fixture is read-only from the player's perspective: its save
  // uses a disposable namespace while still exercising the real wrapped
  // save/load and migration pipeline.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = researchQueueReloadE2EPhase() ?? researchQueueReloadE2EQueryRef.current;
      if (!phase || researchQueueReloadE2EPhaseRef.current === phase) return;
      researchQueueReloadE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[researchQueueReloadE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[researchQueueReloadE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  // Browser-only save/load regression harness for the season-boundary utility
  // snapshot. The fixture must persist the spring-computed rates after the
  // returned state has advanced into paused June/summer, then hydrate those
  // exact rates through the normal wrapped save/load path.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = utilityParityReloadE2EPhase() ?? utilityParityReloadE2EQueryRef.current;
      if (!phase || utilityParityReloadE2EPhaseRef.current === phase) return;
      utilityParityReloadE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[utilityParityReloadE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[utilityParityReloadE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  // Browser-only save/load regression harness for the complete rail journey.
  // Wait until the real UI has proposed, accepted, and staffed a corridor,
  // then persist it through the wrapped isolated slot path.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = railJourneyReloadE2EPhase() ?? railJourneyReloadE2EQueryRef.current;
      if (!phase || railJourneyReloadE2EPhaseRef.current === phase) return;
      const corridor = stateRef.current.railCorridors?.[0];
      const fullyStaffed = corridor &&
        corridor.status === "under_construction" &&
        corridor.staffing.robots >= 10;
      if (phase === "save" && !fullyStaffed) {
        // The unified first-launch flow replaces the demo seed with the newly
        // created city. Restore only the rail fixture's prerequisites into
        // that real session; do not replace the commander/city state and do
        // not write a normal player slot. Once a corridor exists, leave every
        // subsequent proposal/consent/staffing action entirely to the UI.
        const current = stateRef.current;
        if (corridor || (
          (current.unlockedTechnologies ?? []).includes("basic_railways") &&
          (current.discoveredLocationIds ?? []).includes("irongate")
        )) return;
        const seeded = {
          ...current,
          resources: {
            ...current.resources,
            credits: 250_000,
            steel: 25_000,
          },
          unlockedTechnologies: Array.from(new Set([...(current.unlockedTechnologies ?? []), "basic_railways"])),
          discoveredLocationIds: Array.from(new Set([...(current.discoveredLocationIds ?? []), "irongate"])),
          railCorridors: [],
          gameplayMode: "turnbased" as const,
          tickPaused: true,
          calmStartTicks: Number.MAX_SAFE_INTEGER,
          activeEvents: [],
          messages: [],
          newsFeed: [],
        };
        stateRef.current = seeded;
        _liveStateRef.current = seeded;
        setState(seeded);
        return;
      }
      railJourneyReloadE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[railJourneyE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[railJourneyE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [
    isLoaded,
    loadSlot,
    saveToSlot,
    Boolean(state.railCorridors?.[0]),
    (state.unlockedTechnologies ?? []).includes("basic_railways") &&
      (state.discoveredLocationIds ?? []).includes("irongate"),
  ]);

  // Packaged release smoke coverage for train-module persistence. The runner
  // performs the real UI installs; this harness saves only after all three
  // installed IDs are present, then loads that isolated slot on relaunch.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = railModulesReloadE2EPhase() ?? railModulesReloadE2EQueryRef.current;
      if (!phase || railModulesReloadE2EPhaseRef.current === phase) return;
      const installed = stateRef.current.railCorridors?.[0]?.installedTrainUpgrades ?? [];
      if (phase === "save" &&
          !["armored_train_plating", "troop_transport_carriages", "weaponized_escort_cars"]
            .every((id) => installed.includes(id as typeof installed[number]))) {
        return;
      }
      railModulesReloadE2EPhaseRef.current = phase;
      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[railModulesReloadE2E] fixture save failed");
          return;
        }
        const loaded = await loadSlot(1);
        if (!loaded) console.error("[railModulesReloadE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [
    isLoaded,
    loadSlot,
    saveToSlot,
    (state.railCorridors?.[0]?.installedTrainUpgrades ?? []).join("|"),
  ]);

  // Browser-only save/load regression harness for fading relationship boosts.
  // Persist the seeded recent gift through the normal wrapped save path, then
  // recreate the provider so the factions and character menus prove that the
  // fatigue history survives migration and sanitization.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = relationshipBoostE2EPhase() ?? relationshipBoostE2EQueryRef.current;
      if (!phase || relationshipBoostE2EPhaseRef.current === phase) return;
      relationshipBoostE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[relationshipBoostE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[relationshipBoostE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  // Browser-only save/load regression harness for the relationship roster.
  // Persist the seeded personal-action cooldown map through the normal wrapped
  // slot envelope, then recreate the provider so both roster screens prove the
  // disabled action and its remaining-wait explanation survive migration and
  // sanitization. The dedicated key is never a player's profile or legacy slot.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = relationshipRosterE2EPhase() ?? relationshipRosterE2EQueryRef.current;
      if (!phase || relationshipRosterE2EPhaseRef.current === phase) return;
      relationshipRosterE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[relationshipRosterE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[relationshipRosterE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  // Browser-only save/load regression harness for squad assignment previews.
  // The save phase deliberately waits for the UI-confirmed assignment instead
  // of persisting the initial fixture. The load phase restores that isolated
  // save through the normal wrapped envelope, migration, and sanitization path.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = retinueAssignmentE2EPhase() ?? retinueAssignmentE2EQueryRef.current;
      if (!phase || retinueAssignmentE2EPhaseRef.current === phase) return;
      if (
        phase === "save" &&
        !(stateRef.current.retinue?.squads.some(
          (squad) =>
            squad.id === "demo-assignment-squad" &&
            squad.troopIds.includes("demo-marksman"),
        ) ?? false)
      ) {
        return;
      }
      retinueAssignmentE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[retinueAssignmentE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[retinueAssignmentE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot, state]);

  // Browser-only save/load regression harness for the Military supply card.
  // The fixture seeds distinct top-level reserves and logistics stockpiles,
  // then proves both the current wrapped save/load path and the legacy v1
  // migration path do not swap their ledgers.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = militaryFoodPoolE2EPhase() ?? militaryFoodPoolE2EQueryRef.current;
      if (!phase || militaryFoodPoolE2EPhaseRef.current === phase) return;
      militaryFoodPoolE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[militaryFoodPoolE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[militaryFoodPoolE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  // Browser-only save/load regression harness for an in-flight squad
  // operation. The save phase waits until the real UI has launched the
  // operation, then persists the deployed troop statuses, countdown, and
  // doctrine-resolved mission values through the normal save envelope. The
  // load phase restores that same isolated save before the browser test
  // advances the operation to completion.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = retinueOperationE2EPhase() ?? retinueOperationE2EQueryRef.current;
      if (!phase || retinueOperationE2EPhaseRef.current === phase) return;
      const activeOperation = stateRef.current.retinue?.activeOperation;
      if ((phase === "save" || phase === "cloud-save") && !activeOperation) {
        // Cloud-save opens a new provider instance. Hydrate the operation
        // saved by the previous page before the background-save listener can
        // navigate away and upload the fresh demo state over it.
        if (phase === "cloud-save" && !retinueOperationE2ECloudSaveHydratedRef.current) {
          retinueOperationE2ECloudSaveHydratedRef.current = true;
          void loadSlot(1).then((loaded) => {
            if (!loaded) console.error("[retinueOperationE2E] cloud-save fixture hydration failed");
          });
        }
        return;
      }
      retinueOperationE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save" || phase === "cloud-save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[retinueOperationE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[retinueOperationE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot, state]);

  // Browser-only save/load regression harness for squad leadership and
  // doctrine. The save phase waits for both UI actions before persisting, so
  // the reload phase proves the normal save envelope preserves the captain,
  // doctrine, and derived power ledger together.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = retinueLeadershipE2EPhase() ?? retinueLeadershipE2EQueryRef.current;
      if (!phase || retinueLeadershipE2EPhaseRef.current === phase) return;
      const hasPersistedLeadership =
        stateRef.current.retinue?.squads.some(
          (squad) =>
            squad.id === "demo-leadership-squad" &&
            squad.captainId === "demo-leadership-captain" &&
            squad.doctrine === "assault",
        ) ?? false;
      if (
        (phase === "save" || phase === "cloud-save") &&
        !hasPersistedLeadership
      ) {
        // A cloud-save navigation mounts a fresh provider with the original
        // demo state. Hydrate the completed local fixture before saving so a
        // background save can never upload the unmodified demo over it.
        if (phase === "cloud-save" && !retinueLeadershipE2ECloudSaveHydratedRef.current) {
          retinueLeadershipE2ECloudSaveHydratedRef.current = true;
          void loadSlot(1).then((loaded) => {
            if (!loaded) console.error("[retinueLeadershipE2E] cloud-save fixture hydration failed");
          });
        }
        return;
      }
      retinueLeadershipE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save" || phase === "cloud-save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[retinueLeadershipE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[retinueLeadershipE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot, state]);

  // Browser-only save/load regression harness for black-market audit records.
  // The save phase waits for the real purchase action to append its audit
  // entry, then persists that state through the active-profile save path.
  // The load phase recreates GameProvider and restores the isolated envelope,
  // proving the audit row survives navigation and a profile reload without
  // being duplicated.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = blackMarketAuditE2EPhase() ?? blackMarketAuditE2EQueryRef.current;
      if (!phase || blackMarketAuditE2EPhaseRef.current === phase) return;
      if (phase === "save" && (stateRef.current.blackMarketHistory?.length ?? 0) === 0) {
        return;
      }
      blackMarketAuditE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[blackMarketAuditE2E] fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[blackMarketAuditE2E] fixture load failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot, state]);

  const deleteSlot = useCallback(async (slot: number) => {
    try {
      const slotKey = getSlotKey(slot);
      if (isSteamAvailable()) {
        // Steam build: a cloud copy may exist (even while the cloud is
        // temporarily off/offline). Record a deletion tombstone BEFORE
        // removing the local files, and do both inside ONE locked section:
        //   • tombstone-first means a crash or failed Steam call can never
        //     leave the cloud copy looking like data this device is missing
        //     — that's how deleted saves used to resurrect on relaunch.
        //   • same-lock means the startup reconcile (whose pull/record steps
        //     also run under this lock) can never interleave between the
        //     local removal and the tombstone write and resurrect the slot
        //     mid-delete.
        await withBaselineLock(async () => {
          await recordDeletionTombstone(AsyncStorage, slotKey);
          await AsyncStorage.removeItem(slotKey);
          await AsyncStorage.removeItem(slotKey + BACKUP_SUFFIX);
        });
        let cloudDeleted = false;
        if (isSteamCloudAvailable()) {
          cloudDeleted = await deleteCloudSave(slotKey).catch(() => false);
        }
        if (cloudDeleted) {
          // Cloud copy confirmed gone — the tombstone has done its job.
          await withBaselineLock(() => clearSyncBaseline(AsyncStorage, slotKey));
        }
        // On failure the tombstone stays; the next reconcile retries the
        // cloud delete (push-delete) instead of pulling the save back down.
      } else {
        // No Steam, no cloud copy possible — remove the local files and drop
        // the baseline entry so a re-created save in this slot reconciles
        // cleanly from scratch.
        await withBaselineLock(async () => {
          await clearSyncBaseline(AsyncStorage, slotKey);
          await AsyncStorage.removeItem(slotKey);
          await AsyncStorage.removeItem(slotKey + BACKUP_SUFFIX);
        });
      }
      conflictRawRef.current.delete(slot);
      setCloudSaveConflicts((prev) => prev.filter((c) => c.slotId !== slot));
      await refreshSlotMetas();
    } catch (e) {
      console.error("Delete slot failed:", e);
    }
  }, [refreshSlotMetas, getSlotKey, withBaselineLock]);

  // ─── STEAM CLOUD RECONCILIATION ─────────────────────────────────────
  //
  // On launch, walk every slot for the active profile and reconcile its local
  // copy against the Steam Cloud copy:
  //   • cloud-only  → pull it down so a fresh device gets the player's save.
  //   • local-only  → push it up so it's protected.
  //   • cloud newer (local unchanged since last sync) → pull.
  //   • local newer (cloud unchanged since last sync) → push.
  //   • both changed since last sync → leave both untouched and surface a
  //     keep-local / keep-cloud prompt; we never silently overwrite either.
  // No-ops cleanly when cloud is unavailable (web/mobile, or Steam offline),
  // leaving the game fully playable from the local copy.
  const reconcileCloudSaves = useCallback(async (
    shouldContinue: () => boolean = () => true,
    profileId: string | null = null,
  ) => {
    if (!shouldContinue()) return;
    if (!isSteamCloudAvailable()) {
      // Distinguish "this is the Steam build but the cloud is off/offline"
      // (worth a gentle heads-up) from "not a cloud platform at all" (silent).
      setCloudSaveStatus(isSteamAvailable() ? "unavailable" : "off");
      return;
    }
    setCloudSaveStatus("syncing");
    const conflicts: CloudSaveConflict[] = [];
    conflictRawRef.current = new Map();
    let sawError = false;
    let stoppedEarly = false;
    try {
      slotLoop: for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        if (!shouldContinue()) {
          stoppedEarly = true;
          break;
        }
        const slotKey = profileId ? profileSlotKey(profileId, slot) : getSlotKey(slot);
        let localRaw: string | null = null;
        let cloudRaw: string | null = null;
        try {
          localRaw = await AsyncStorage.getItem(slotKey);
        } catch { sawError = true; }
        if (!shouldContinue()) {
          stoppedEarly = true;
          break;
        }
        try {
          cloudRaw = await readCloudSave(slotKey);
        } catch { sawError = true; }
        if (!shouldContinue()) {
          stoppedEarly = true;
          break;
        }

        // Re-read the baseline map fresh for EVERY slot, after the slot's own
        // local/cloud reads. A single pre-loop snapshot goes stale the moment
        // the player deletes a slot while this reconcile is still running
        // (possible in the first seconds after launch or right after a
        // commander switch) — the stale view misses the fresh deletion
        // tombstone and pulls the just-deleted save back down.
        const baseline = await loadSyncBaseline(AsyncStorage);
        if (!shouldContinue()) {
          stoppedEarly = true;
          break;
        }
        const localMeta = readEnvelopeMeta(localRaw);
        const cloudMeta = readEnvelopeMeta(cloudRaw);
        const tombstoned = hasDeletionTombstone(baseline, slotKey);
        const decision = reconcileSlot(
          localMeta,
          cloudMeta,
          getBaselineChecksum(baseline, slotKey),
          tombstoned,
        );

        try {
          switch (decision.action) {
            case "none":
              // Both sides empty. A leftover tombstone has finished its job
              // (the cloud copy is gone) — drop it so the map stays tidy.
              if (tombstoned) {
                if (!shouldContinue()) {
                  stoppedEarly = true;
                  break slotLoop;
                }
                await withBaselineLock(() => clearSyncBaseline(AsyncStorage, slotKey));
              }
              break;
            case "push-delete":
              // Slot was deleted on this device; the cloud copy must go too,
              // NOT be pulled back down. Only a confirmed delete clears the
              // tombstone — a failure keeps it so the next reconcile retries.
              {
                if (!shouldContinue()) {
                  stoppedEarly = true;
                  break slotLoop;
                }
                const ok = await deleteCloudSave(slotKey).catch(() => false);
                if (!shouldContinue()) {
                  stoppedEarly = true;
                  break slotLoop;
                }
                if (ok) {
                  await withBaselineLock(() => clearSyncBaseline(AsyncStorage, slotKey));
                } else {
                  sawError = true;
                }
              }
              break;
            case "in-sync":
              // Both copies already agree, but on the FIRST launch after this
              // feature shipped there's no baseline recorded yet. Persist one
              // now (using either side's bytes — they're identical) so a later
              // one-sided advance reconciles as a clean pull/push instead of a
              // false conflict. Tombstone-guarded: if the player deleted the
              // slot while we were reading it, recording a baseline here would
              // overwrite the fresh tombstone and resurrect the cloud copy.
              if (!getBaselineChecksum(baseline, slotKey)) {
                const raw = localRaw ?? cloudRaw;
                if (raw) {
                  if (!shouldContinue()) {
                    stoppedEarly = true;
                    break slotLoop;
                  }
                  await withBaselineLock(async () => {
                    if (!shouldContinue()) return;
                    await recordSyncBaselineUnlessDeleted(AsyncStorage, slotKey, raw);
                  });
                }
              }
              break;
            case "pull-cloud":
              if (cloudRaw) {
                // The whole apply runs under the baseline lock with a FRESH
                // tombstone re-check: deleteSlot records its tombstone and
                // removes the local files under this same lock, so either the
                // delete lands first (we see the tombstone and skip — the next
                // reconcile push-deletes the cloud copy) or the pull lands
                // first (the delete then removes it and tombstones the slot).
                // No interleaving can resurrect a just-deleted save.
                const cloudBytes = cloudRaw;
                if (!shouldContinue()) {
                  stoppedEarly = true;
                  break slotLoop;
                }
                await withBaselineLock(async () => {
                  if (!shouldContinue()) return;
                  const fresh = await loadSyncBaseline(AsyncStorage);
                  if (hasDeletionTombstone(fresh, slotKey)) return;
                  if (!shouldContinue()) return;
                  await writeSlotRaw(AsyncStorage, slotKey, cloudBytes);
                  if (!shouldContinue()) return;
                  await recordSyncBaseline(AsyncStorage, slotKey, cloudBytes);
                });
                if (!shouldContinue()) {
                  stoppedEarly = true;
                  break slotLoop;
                }
              }
              break;
            case "push-local":
              if (localRaw) {
                const localBytes = localRaw;
                if (!shouldContinue()) {
                  stoppedEarly = true;
                  break slotLoop;
                }
                const ok = await writeCloudSave(slotKey, localBytes);
                if (!shouldContinue()) {
                  stoppedEarly = true;
                  break slotLoop;
                }
                if (ok) {
                  // Tombstone-guarded: if the slot was deleted after we read
                  // localRaw but before the upload finished, keep the
                  // tombstone so the next reconcile deletes the copy we just
                  // pushed instead of treating it as fresh cloud data.
                  await withBaselineLock(async () => {
                    if (!shouldContinue()) return;
                    await recordSyncBaselineUnlessDeleted(AsyncStorage, slotKey, localBytes);
                  });
                } else sawError = true;
              }
              break;
            case "conflict":
              if (localRaw && cloudRaw && localMeta && cloudMeta) {
                conflictRawRef.current.set(slot, { slotKey, localRaw, cloudRaw });
                conflicts.push({
                  slotId: slot,
                  cityName: cloudMeta.cityName ?? localMeta.cityName ?? "Unknown City",
                  localSavedAt: localMeta.lastTickTime,
                  cloudSavedAt: cloudMeta.lastTickTime,
                  localTotalTicks: localMeta.totalTicks ?? 0,
                  cloudTotalTicks: cloudMeta.totalTicks ?? 0,
                });
              }
              break;
          }
        } catch {
          sawError = true;
        }
      }

      // Sweep tombstones OUTSIDE the active profile's slot keys. The loop
      // above only visits the active profile, but deleting a whole commander
      // tombstones that profile's slot keys — and a deleted profile can never
      // become active again, so those tombstones would otherwise never be
      // retried and their cloud files would linger forever. Best-effort: a
      // failed delete keeps its tombstone for the next launch's sweep.
      try {
        if (!stoppedEarly) {
          const activeKeys = new Set<string>();
          for (let slot = 1; slot <= MAX_SLOTS; slot++) {
            activeKeys.add(profileId ? profileSlotKey(profileId, slot) : getSlotKey(slot));
          }
          // Re-load: the per-slot loop above may have mutated the map.
          const fullBaseline = await loadSyncBaseline(AsyncStorage);
          for (const [key, entry] of Object.entries(fullBaseline)) {
            if (!entry.deleted || activeKeys.has(key)) continue;
            if (!shouldContinue()) {
              stoppedEarly = true;
              break;
            }
            const ok = await deleteCloudSave(key).catch(() => false);
            if (ok && shouldContinue()) {
              await withBaselineLock(async () => {
                if (!shouldContinue()) return;
                await clearSyncBaseline(AsyncStorage, key);
              });
            }
          }
        }
      } catch {
        /* orphan cleanup is opportunistic; tombstones persist until it works */
      }
    } catch {
      sawError = true;
    }
    if (shouldContinue()) {
      setCloudSaveConflicts(conflicts);
      setCloudSaveStatus(sawError || stoppedEarly ? "error" : "synced");
    }
  }, [getSlotKey, withBaselineLock]);
  // Expose the latest reconcile to forward-referencing callbacks (profile switch).
  reconcileCloudSavesRef.current = reconcileCloudSaves;

  // Resolve one slot's conflict by keeping either the local or the cloud copy.
  // The losing side is overwritten only here, after the player's explicit
  // choice, and the baseline is reset to the winner so the two are in sync.
  const resolveCloudConflict = useCallback(async (slotId: number, keep: "local" | "cloud") => {
    const entry = conflictRawRef.current.get(slotId);
    if (!entry) {
      setCloudSaveConflicts((prev) => prev.filter((c) => c.slotId !== slotId));
      return;
    }
    const { slotKey, localRaw, cloudRaw } = entry;
    // Only clear the conflict once the chosen side is actually committed to
    // BOTH stores. Keeping cloud writes local storage (always succeeds);
    // keeping local must push to the cloud, which can fail / be unavailable —
    // in that case we leave the conflict surfaced so the player isn't told it
    // was resolved when the cloud copy still diverges.
    let resolved = false;
    let droppedForDeletion = false;
    try {
      if (keep === "cloud") {
        // Delete and conflict resolution share this lock. The conflict may
        // have been captured before deleteSlot recorded its tombstone, so
        // re-read the baseline after acquiring the lock rather than trusting
        // the snapshot that produced the prompt.
        await withBaselineLock(async () => {
          const fresh = await loadSyncBaseline(AsyncStorage);
          if (hasDeletionTombstone(fresh, slotKey)) {
            droppedForDeletion = true;
            return;
          }
          await writeSlotRaw(AsyncStorage, slotKey, cloudRaw);
          const recorded = await recordSyncBaselineUnlessDeleted(AsyncStorage, slotKey, cloudRaw);
          if (recorded) {
            resolved = true;
          } else {
            droppedForDeletion = true;
          }
        });
      } else {
        await withBaselineLock(async () => {
          const fresh = await loadSyncBaseline(AsyncStorage);
          if (hasDeletionTombstone(fresh, slotKey)) {
            droppedForDeletion = true;
            return;
          }
          if (!isSteamCloudAvailable()) {
            setCloudSaveStatus("unavailable");
            return;
          }
          // Push the CURRENT on-disk local copy, not the snapshot captured
          // at startup: if the player entered the game before resolving,
          // local may have advanced. Fall back to the captured copy if the
          // read fails. The cloud push is what makes this device
          // authoritative.
          let currentLocal = localRaw;
          try {
            const onDisk = await AsyncStorage.getItem(slotKey);
            if (onDisk) currentLocal = onDisk;
          } catch { /* fall back to captured copy */ }
          const ok = await writeCloudSave(slotKey, currentLocal);
          if (ok) {
            const recorded = await recordSyncBaselineUnlessDeleted(AsyncStorage, slotKey, currentLocal);
            if (recorded) {
              resolved = true;
            } else {
              droppedForDeletion = true;
            }
          } else {
            setCloudSaveStatus("error");
          }
        });
      }
    } catch (e) {
      console.warn("[resolveCloudConflict] failed:", e);
      setCloudSaveStatus("error");
    } finally {
      if (resolved || droppedForDeletion) {
        conflictRawRef.current.delete(slotId);
        setCloudSaveConflicts((prev) => {
          const remaining = prev.filter((c) => c.slotId !== slotId);
          // Clear any stale unavailable/error/conflict messaging once the last
          // outstanding conflict is resolved — otherwise the status row keeps
          // showing a problem that no longer exists.
          if (remaining.length === 0 && conflictRawRef.current.size === 0) {
            setCloudSaveStatus("synced");
          }
          return remaining;
        });
        if (resolved) await refreshSlotMetas();
      }
    }
  }, [refreshSlotMetas, withBaselineLock]);

  // ─── STARTUP HYDRATION ──────────────────────────────────────────────
  // The same bounded pipeline serves the initial boot and the in-place retry
  // offered by BootTimeoutNotice. Every read is staged locally and the
  // profile, slot metadata, preview state, and achievements are committed only
  // after the complete attempt finishes inside its deadline.
  const hydrateStartup = useCallback(async (): Promise<boolean> => {
    const attempt = createStartupAttemptGuard();
    startupAttemptRef.current?.abandon();
    startupAttemptRef.current = attempt;
    setBootHydrationStatus("pending");
    setIsLoaded(false);
    const startupDeadline = Date.now() + STARTUP_HYDRATION_TIMEOUT_MS;
    const awaitStartup = <T,>(operation: PromiseLike<T>) =>
      withStartupDeadline(operation, startupDeadline);
    let selectedProfile: PlayerProfile | null = null;

    const finishStartup = (status: Exclude<BootHydrationStatus, "pending">): boolean => {
      if (!attempt.isActive()) return false;
      attempt.abandon();
      if (startupAttemptRef.current === attempt) startupAttemptRef.current = null;
      setBootHydrationStatus(status);
      setIsLoaded(true);
      return true;
    };

    try {
      // Hydrate persisted crash reports from previous sessions so the debug
      // screen shows historical crashes after a hard reload. Best-effort —
      // failures are swallowed inside the helper.
      hydrateCrashReports().catch(() => 0);

      // Bring up the Steam bridge FIRST, before anything that reads/writes
      // the cloud (profile bootstrap + save reconciliation below). Calling
      // it late left those earlier reads racing an uninitialized bridge.
      const startupCloudDeadline = Date.now() + 5000;
      const withinStartupCloudBudget = () => Date.now() < startupCloudDeadline;
      await awaitStartup(initSteamBridge());

      // Prove local profile storage is both readable and genuinely empty
      // before cloud bootstrap is allowed to write anything. The regular
      // profile loader is intentionally lenient; using it first would make
      // malformed local bytes look like a fresh device and risk replacing
      // them with the cloud roster.
      let profiles = await awaitStartup(loadAllProfilesStrict());
      if (profiles.length === 0) {
        await awaitStartup(
          bootstrapProfilesFromCloudIfEmpty(
            () => attempt.isActive() && withinStartupCloudBudget(),
          ).catch(() => 0),
        );
        profiles = await awaitStartup(loadAllProfilesStrict());
      }

      const lastProfileId = await awaitStartup(loadActiveProfileId());
      if (lastProfileId) {
        const prof = profiles.find(p => p.id === lastProfileId);
        if (prof) selectedProfile = prof;
      }

      // Reconcile each slot against Steam Cloud BEFORE we read slot metas or
      // pick the best slot to auto-load, so any save pulled down from the
      // cloud participates in both. The profile id is passed explicitly so
      // this staged attempt never has to publish an uncommitted profile ref.
      await awaitStartup(
        reconcileCloudSaves(
          () => attempt.isActive() && withinStartupCloudBudget(),
          selectedProfile?.id ?? null,
        ).catch((e) => {
          console.warn("[startup hydration] reconcileCloudSaves failed:", e);
        }),
      );

      // Slot metadata is staged alongside the other boot results. The normal
      // refresh action still commits immediately, but a boot/retry attempt
      // must not paint partial metadata if a later read times out.
      const stagedSlotMetas = await awaitStartup(
        readSlotMetas(selectedProfile?.id ?? null, true),
      );

      let previewState: GameState | null = null;
      let bestSlot = -1;
      if (selectedProfile) {
        let bestTime = 0;
        for (let i = 1; i <= MAX_SLOTS; i++) {
          const raw = await awaitStartup(
            AsyncStorage.getItem(profileSlotKey(selectedProfile.id, i)),
          );
          if (raw) {
            try {
              const { json: sj } = unwrapSave(raw);
              const parsed = JSON.parse(sj) as GameState;
              const t = parsed.lastTickTime ?? 0;
              if (t > bestTime) {
                bestTime = t;
                bestSlot = i;
              }
            } catch {}
          }
        }

        if (bestSlot > 0) {
          const bestSlotKey = profileSlotKey(selectedProfile.id, bestSlot);
          const raw = await awaitStartup(AsyncStorage.getItem(bestSlotKey));
          if (raw) {
            let { json: slotJson, valid: slotValid } = unwrapSave(raw);
            if (!slotValid) {
              const backupRaw = await awaitStartup(
                AsyncStorage.getItem(bestSlotKey + BACKUP_SUFFIX),
              );
              if (backupRaw) {
                const backup = unwrapSave(backupRaw);
                if (backup.valid) { slotJson = backup.json; }
              }
            }
            previewState = sanitizeState(migrateState(JSON.parse(slotJson) as GameState));
            // Boot only needs enough state to identify the latest city on
            // the main menu. Running offline catch-up here can synchronously
            // simulate thousands of ticks before React can dismiss the
            // loading screen, which makes slower/older cities look frozen at
            // 50%. Defer the real load + catch-up to CONTINUE/loadSlot.
          }
        }
      }

      const global = await awaitStartup(loadGlobalAchievements());
      if (!attempt.isActive()) return false;

      // Commit the staged local results only after every required startup read
      // completed inside the deadline. A timed-out attempt therefore never
      // paints partial/empty storage results over the menu.
      for (const p of profiles) {
        if (p.customPortraitUri) registerCustomPortrait(p.id, p.customPortraitUri);
      }
      setAllProfiles(profiles);
      setActiveProfile(selectedProfile);
      activeProfileRef.current = selectedProfile;
      setSlotMetas(stagedSlotMetas);
      setHasSave(stagedSlotMetas.some((m) => !m.isEmpty));
      if (previewState && bestSlot > 0) {
        setActiveSlot(bestSlot);
        activeSlotRef.current = bestSlot;
        setState(previewState);
      }
      setGlobalAchievements(global);

      if (!finishStartup("ready")) return false;
      if (global.length > 0) syncSteamAchievements(global).catch(() => {});
      // Cleanup is deliberately launched only after a successful handoff.
      // A timed-out/failed attempt never starts destructive storage work.
      sweepStaleTmpKeys(AsyncStorage, [SAVE_KEY_PREFIX, PROFILE_PREFIX]).catch(() => {});
      return true;
    } catch (e) {
      if (!attempt.isActive()) return false;
      const status = e instanceof StartupHydrationTimeoutError ? "timed_out" : "failed";
      console.error(`Startup hydration ${status}:`, e);
      finishStartup(status);
      return false;
    }
  }, [readSlotMetas, reconcileCloudSaves]);

  const retryStartupHydration = useCallback((): Promise<boolean> => {
    const existing = startupHydrationInFlightRef.current;
    if (existing) return existing;
    const retry = hydrateStartup().finally(() => {
      if (startupHydrationInFlightRef.current === retry) {
        startupHydrationInFlightRef.current = null;
      }
    });
    startupHydrationInFlightRef.current = retry;
    return retry;
  }, [hydrateStartup]);

  // Initial boot uses the same function as the user-triggered retry. The
  // cleanup invalidates any still-pending native-storage promises on unmount.
  useEffect(() => {
    void hydrateStartup();
    return () => {
      startupAttemptRef.current?.abandon();
      startupAttemptRef.current = null;
    };
  }, [hydrateStartup]);

  // The dev-only demo seeder creates a complete in-memory city without
  // touching a real save slot. Mark dev fixtures, plus the explicitly
  // opted-in release-safe save-and-quit fixture, as active city sessions
  // after storage hydration so smoke tests exercise the guarded save path
  // as a started city.
  useEffect(() => {
    if (!isLoaded) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isSaveAndQuitFixture =
      params.get("fixture") === "save-and-quit" &&
      (window as any).desktop?.saveAndQuitFixture === true;
    const isResearchReadOnlyFixture =
      researchReadOnlyE2EQueryRef.current ||
      settlementParityE2EQueryRef.current ||
      worldMapEventLogE2EQueryRef.current ||
      worldMapExportRestoreE2EQueryRef.current ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("demo") === "1" &&
        new URLSearchParams(window.location.search).get("mapfoodstorage") === "1") ||
      (params.get("demo") === "1" && params.get("go") === "research");
    const demoEnabled =
      (typeof __DEV__ === "undefined" || __DEV__) || isSaveAndQuitFixture;
    if (!demoEnabled) return;
    // Read-only screen regressions must not be promoted to playable demo
    // sessions, since that would allow autosave/background-save paths to
    // create a real slot before the browser assertions finish.
    if (
      (params.get("demo") !== "1" && !isSaveAndQuitFixture) ||
      params.get("legacyproduction") === "1" ||
      params.get("contracts") === "1" ||
      params.get("medicalstorage") === "1" ||
      params.get("relationshiproster") === "1" ||
      params.get("personalcommands") === "1" ||
      params.get("districtcommands") === "1" ||
      params.get("rolefilter") === "1" ||
      params.get("utilityparity") === "1" ||
      params.get("housing") === "1" ||
      params.get("researchqueue") === "1" ||
      params.get("worldmaplog") === "1" ||
      params.get("worldmaprestore") === "1" ||
      params.get("mapfoodstorage") === "1" ||
      isResearchReadOnlyFixture ||
      citySessionActiveRef.current
    ) return;
    citySessionEpochRef.current += 1;
    citySessionActiveRef.current = true;
    setIsCitySessionActive(true);
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded || !isCitySessionActive || autoSaveMinutes === 0) return;
    const intervalMs = autoSaveMinutes * 60 * 1000;
    const interval = setInterval(() => {
      saveGame();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isLoaded, isCitySessionActive, saveGame, autoSaveMinutes]);

  const tickIntervalRef = useRef(state.tickIntervalMinutes ?? 15);
  useEffect(() => { tickIntervalRef.current = state.tickIntervalMinutes ?? 15; }, [state.tickIntervalMinutes]);

  // ─── GEIGER LOOP ON RADIATION WEATHER ────────────────────────────────
  const geigerActiveRef = useRef(false);
  const isRadiationWeather = /radiation/i.test(state.weather ?? "");
  useEffect(() => {
    if (isRadiationWeather && !geigerActiveRef.current) {
      geigerActiveRef.current = true;
      startSoundLoop("geiger_loop");
    } else if (!isRadiationWeather && geigerActiveRef.current) {
      geigerActiveRef.current = false;
      stopSoundLoop("geiger_loop");
    }
  }, [isRadiationWeather]);
  useEffect(() => () => { stopSoundLoop("geiger_loop"); }, []);

  // ─── REAL-TIME TICK TIMER ─────────────────────────────────────────────
  useEffect(() => {
    // The live district-gate browser fixture must exercise the real timer
    // without becoming a playable session. Keep citySessionActive false so
    // autosave/background-save paths remain disabled.
    const isReadOnlyLiveFixture = districtCommandsLiveE2EFixture();
    if (!isLoaded || (!isCitySessionActive && !isReadOnlyLiveFixture)) return;
    // Turn-based games never run the real-time loop — progress is driven
    // entirely by endTurn(). Tear down any timer and bail.
    if (state.gameplayMode === "turnbased") {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      return;
    }
    if (state.tickPaused) {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      return;
    }

    const tick = () => {
      setState((prev) => {
        if (prev.tickPaused) return prev;
        const tickStart = performance.now();
        try {
        // The whole pure per-tick simulation now lives in one shared,
        // node-safe module (also used by forceTick + turn-based advanceTurn).
        // Everything below is the impure feedback layer — sounds, haptics,
        // Steam, rich presence, perf timing — driven entirely by its payload.
        const r = runLiveTick(prev);
        const s = r.state;

        if (r.inboxMessages.length > 0) {
          playSound("message_ping");
          playHaptic("light");
        }
        if (r.firedEvent) {
          const eid = r.firedEvent.id;
          if (r.firedEvent.severity === "critical" || r.firedEvent.severity === "high") {
            playSound("alert_warning");
            playHaptic("medium");
          }
          if (eid.includes("riot") || eid.includes("food_fight")) {
            playSound("unrest_high");
          } else if (eid.includes("protest") || eid.includes("rally") || eid.includes("strike")) {
            playSound("protest_chant");
          } else if (eid.includes("explosion") || eid.includes("terror") || eid.includes("collapse")) {
            playSound("explosion_distant");
          } else if (/raid|raider|gang_war|war_|siege|invasion|incursion|ambush|skirmish|assault|shelling|sniper|armed|attack|battle/i.test(eid)) {
            playSound("raider_attack");
          } else if (eid.includes("crime") || eid.includes("unrest") || eid.includes("smuggl")) {
            playSound("unrest_low");
          } else if (eid.includes("siren") || eid.includes("lockdown") || eid.includes("evacuat")) {
            playSound("siren");
          } else if (r.firedEvent.severity === "low" || r.firedEvent.severity === "medium") {
            playSound("city_chatter");
          }
          if (/radiation|nuclear|fallout|radioactive|irradiat|meltdown/i.test(eid)) {
            playSound("geiger_burst");
          }
        }
        if (r.newTechnologies.length > 0) {
          playSound("research");
          playHaptic("medium");
          if (r.newTechnologies.some(t => /nuclear|radiation|fallout|radioactive|irradiat/i.test(t))) {
            playSound("geiger_burst");
          }
        }
        for (const _pid of r.megaCompleted) {
          playSound("build");
        }
        if (r.megaCompleted.length > 0) {
          playHaptic("heavy");
        }
        let anyMissionSuccess = false;
        for (const mr of r.missionResults) {
          if (mr.success) {
            playSound("deploy");
            anyMissionSuccess = true;
          }
        }
        if (anyMissionSuccess) {
          playHaptic("medium");
        }
        if (r.newAchievements.length > 0) {
          achQueueRef.current = [...achQueueRef.current, ...r.newAchievements];
          queueMicrotask(() => setPendingAchievements([...achQueueRef.current]));
          unlockSteamAchievements(r.newAchievements).catch(() => {});
          playSound("achievement");
          playHaptic("heavy");
        }

        if (s.totalTicks % 10 === 0) {
          const totalPop = s.districts.reduce((a: number, d: any) => a + d.population, 0);
          updateRichPresence({
            cityName: s.cityName ?? "MEGACITY",
            day: s.totalTicks,
            population: totalPop,
            season: s.season,
          });
          syncGameStats(s).catch(() => {});
        }

        const tickDuration = performance.now() - tickStart;
        // Dev-only perf canary: a slow tick (>200ms) is interesting for
        // engineering but should not appear in the player's browser /
        // logcat in production builds. recordTickDuration still feeds the
        // offline-sim-depth resume estimator regardless.
        if (__DEV__ && tickDuration > 200) {
          console.warn(`[PERF] Tick ${s.totalTicks} took ${tickDuration.toFixed(1)}ms (threshold: 200ms)`);
        }
        recordTickDuration(tickDuration);

        // Reconcile to the latest tick's subsystem errors so a clean tick
        // clears a stale warning. Deferred to a microtask so we don't nest a
        // setState during this updater's commit phase.
        const tickErrors = r.tickErrors;
        if (tickErrors.length > 0) {
          if (__DEV__) console.warn(`[TICK] ${tickErrors.length} subsystem error(s) in tick ${s.totalTicks}:`, tickErrors.map(e => e.subsystem).join(", "));
          const tickNum = s.totalTicks;
          queueMicrotask(() => setLastTickErrors({ tick: tickNum, errors: tickErrors }));
        } else {
          queueMicrotask(() => setLastTickErrors((prev) => (prev === null ? prev : null)));
        }

        return s;
        } catch (tickError: any) {
          console.error("[TICK] Critical tick failure, state preserved:", tickError?.message ?? tickError);
          return prev;
        }
      });
    };

    const intervalMs = isReadOnlyLiveFixture
      ? 10000
      : getTickIntervalMs(tickIntervalRef.current);
    tickTimerRef.current = setInterval(tick, intervalMs);
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, [isLoaded, isCitySessionActive, state.gameplayMode, state.tickIntervalMinutes, state.tickPaused]);

  // ─── APP STATE (background/foreground) ────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (!citySessionActiveRef.current) {
        appStateRef.current = nextState;
        return;
      }
      if (appStateRef.current !== "active" && nextState === "active") {
        // Coming back from background - check for missed ticks
        setState((prev) => {
          const resumeDepth = normalizeOfflineSimDepth(offlineSimDepthRef.current);
          const { newState: final, report } = runOfflineCatchup(prev, resumeDepth);
          if (report) {
            // Defer the offlineReport setState until after this updater
            // returns so React doesn't see a nested setState during the
            // commit phase.
            queueMicrotask(() => setOfflineReport(report));
          }
          return final;
        });
      }
      if (nextState === "background" || nextState === "inactive") {
        // Route background saves through the lock-protected saveGame path so
        // they cannot interleave with an in-flight autosave on the same slot.
        // Two simultaneous AsyncStorage.setItem calls to the same key can
        // produce corrupted UTF-16 output; the per-slot in-flight lock in
        // saveToSlot serializes them. Fire-and-forget is fine because the
        // OS may kill us at any point after this — saveToSlot does atomic
        // backup rotation before writing.
        // saveToSlot's catch already sets lastSaveError → SaveIndicator
        // shows the red badge, so this log is purely a dev-time aid.
        saveGameRef.current().catch((e) => { if (__DEV__) console.warn("Background save failed:", e); });
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // ─── ACTIONS ─────────────────────────────────────────────────────────
  const startNewGame = useCallback((slot?: number) => {
    // activeSlotRef, not the `activeSlot` state closure (frozen at first
    // render by the actions-context memo): defaulting from the closure would
    // start every no-arg new game in slot 1, wiping that save even when the
    // player was running slot 2/3.
    const targetSlot = slot ?? activeSlotRef.current;
    let fresh = { ...createInitialState(), saveSlot: targetSlot };
    if (activeProfileRef.current) {
      fresh = injectProfileIntoGameState(activeProfileRef.current, fresh);
      const cs = activeProfileRef.current.careerStats;
      const updated = { ...activeProfileRef.current, careerStats: { ...cs, citiesRun: cs.citiesRun + 1 }, lastPlayed: Date.now() };
      saveProfile(updated);
      setActiveProfile(updated);
      activeProfileRef.current = updated;
    }
    fresh.dailyStreak = refreshDailyVisit(fresh.dailyStreak ?? { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null });
    fresh.weeklyChallenge = refreshWeeklyChallenge(undefined, fresh);
    citySessionEpochRef.current += 1;
    citySessionActiveRef.current = true;
    setIsCitySessionActive(true);
    setState(fresh);
    setActiveSlot(targetSlot);
    setHasSave(true);
    setOfflineReport(null);
    writeSlotSave(AsyncStorage, getSlotKey(targetSlot), fresh).then(() => refreshSlotMetas());
  }, [refreshSlotMetas, getSlotKey]);

  const launchConfiguredNewGame = useCallback(async (input: {
    city: NewCitySetup;
    commander?: NewCommanderSetup;
  }): Promise<void> => {
    const previousProfile = activeProfileRef.current;
    let profile = previousProfile;
    let isNewProfile = false;
    let registeredCustomPortrait = false;

    if (input.commander) {
      const index = await pruneProfileIndex();
      if (index.length >= MAX_PROFILES) {
        throw new Error(`All ${MAX_PROFILES} commander slots are in use. Delete a commander to free a slot.`);
      }
      profile = createDefaultProfile(
        input.commander.name.trim() || "Commander Unknown",
        input.commander.age,
        input.commander.sex,
        input.commander.portraitId,
      );
      profile = {
        ...profile,
        attributes: { ...input.commander.attributes },
        attributePoints: input.commander.attributePoints,
        traits: [...input.commander.traits],
        backstory: input.commander.backstory.trim(),
      };
      if (
        input.commander.customPortraitUri &&
        registerCustomPortrait(profile.id, input.commander.customPortraitUri)
      ) {
        profile.customPortraitUri = input.commander.customPortraitUri;
        profile.portraitId = customPortraitIdFor(profile.id);
        registeredCustomPortrait = true;
      }
      isNewProfile = true;
    }

    if (!profile) throw new Error("Choose or create a commander before launching a city.");

    const originalProfile = profile;
    const updatedProfile: PlayerProfile = {
      ...profile,
      careerStats: {
        ...profile.careerStats,
        citiesRun: profile.careerStats.citiesRun + 1,
      },
      lastPlayed: Date.now(),
    };
    let fresh = buildConfiguredNewGame(updatedProfile, input.city);
    fresh.dailyStreak = refreshDailyVisit(
      fresh.dailyStreak ?? {
        current: 0,
        longest: 0,
        lastClaimedDay: null,
        lastVisitedDay: null,
      },
    );
    fresh.weeklyChallenge = refreshWeeklyChallenge(undefined, fresh);

    const slotKey = profileSlotKey(updatedProfile.id, input.city.slot);
    try {
      await saveProfile(updatedProfile);
      await writeSlotSave(AsyncStorage, slotKey, fresh);
      if (isNewProfile) {
        const index = await pruneProfileIndex();
        await saveProfileIndex(Array.from(new Set([...index, updatedProfile.id])));
        await saveActiveProfileId(updatedProfile.id);
      }
    } catch (error) {
      if (isNewProfile) {
        await deleteProfileStorage(updatedProfile.id).catch(() => {});
        if (registeredCustomPortrait) unregisterCustomPortrait(updatedProfile.id);
      } else {
        await saveProfile(originalProfile).catch(() => {});
      }
      throw error;
    }

    citySessionEpochRef.current += 1;
    citySessionActiveRef.current = true;
    setIsCitySessionActive(true);
    setActiveProfile(updatedProfile);
    activeProfileRef.current = updatedProfile;
    setAllProfiles((profiles) => {
      const others = profiles.filter((candidate) => candidate.id !== updatedProfile.id);
      return [...others, updatedProfile];
    });
    setState(fresh);
    stateRef.current = fresh;
    setActiveSlot(input.city.slot);
    activeSlotRef.current = input.city.slot;
    setHasSave(true);
    setOfflineReport(null);
    // The durable profile + slot commit has already succeeded. A metadata
    // refresh failure must not report LAUNCH FAILED or keep the setup page open
    // after the city is safely stored; the normal focus refresh will retry.
    await refreshSlotMetas().catch(() => {});
    pushProfilesToCloud().catch(() => {});
  }, [refreshSlotMetas]);

  const performRebirth = useCallback((): { points: number; breakdown: { label: string; points: number }[] } | null => {
    const currentState = stateRef.current;
    const { eligible } = canRebirth(currentState);
    if (!eligible) return null;

    const { total, breakdown } = calculateLegacyPoints(currentState);
    const eco = calculateEcologicalLegacy(currentState);

    if (activeProfileRef.current) {
      const prof = activeProfileRef.current;
      const synced = syncProfileFromGameState(prof, currentState);
      const existingPrestige = normalizePrestigeState(synced.prestigeState);
      const updatedPrestige = {
        ...existingPrestige,
        totalLegacyPoints: existingPrestige.totalLegacyPoints + total,
        availableLegacyPoints: existingPrestige.availableLegacyPoints + total,
        timesReborn: existingPrestige.timesReborn + 1,
        lastRebirthTick: currentState.totalTicks,
        highestLPEarned: Math.max(existingPrestige.highestLPEarned, total),
        totalEcologicalLegacy: existingPrestige.totalEcologicalLegacy + eco.total,
        availableEcologicalLegacy: existingPrestige.availableEcologicalLegacy + eco.total,
        highestEcologicalLegacyEarned: Math.max(existingPrestige.highestEcologicalLegacyEarned, eco.total),
      };
      const updatedProfile = {
        ...synced,
        prestigeState: updatedPrestige,
        careerStats: { ...synced.careerStats, citiesRun: synced.careerStats.citiesRun + 1 },
        lastPlayed: Date.now(),
      };
      saveProfile(updatedProfile);
      setActiveProfile(updatedProfile);
      activeProfileRef.current = updatedProfile;
    }

    const targetSlot = activeSlotRef.current;
    let fresh = { ...createInitialState(), saveSlot: targetSlot };
    if (activeProfileRef.current) {
      fresh = injectProfileIntoGameState(activeProfileRef.current, fresh);
    }
    fresh.dailyStreak = refreshDailyVisit(fresh.dailyStreak ?? { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null });
    fresh.weeklyChallenge = refreshWeeklyChallenge(undefined, fresh);
    // Prestige reroll wipes the tech list. The tech-effects cache now uses a
    // content hash so this is belt-and-braces, but invalidating explicitly
    // also clears the singleton between runs so memory profilers don't see
    // the previous run's bonuses lingering.
    invalidateTechCache();
    setState(fresh);
    setOfflineReport(null);
    writeSlotSave(AsyncStorage, getSlotKey(targetSlot), fresh).then(() => refreshSlotMetas());

    return { points: total, breakdown };
  }, [refreshSlotMetas, getSlotKey]);

  const purchasePrestigeBonus = useCallback((bonusId: string): boolean => {
    const prof = activeProfileRef.current;
    if (!prof) return false;
    const prestige = normalizePrestigeState(prof.prestigeState);
    const isEcologicalBonus = ECOLOGICAL_LEGACY_BONUSES.some((b) => b.id === bonusId);
    const updated = isEcologicalBonus
      ? purchaseEcologicalBonus(prestige, bonusId as EcologicalLegacyBonusId)
      : purchaseBonus(prestige, bonusId as LegacyBonusId);
    if (!updated) return false;
    const updatedProfile = { ...prof, prestigeState: updated, lastPlayed: Date.now() };
    saveProfile(updatedProfile);
    setActiveProfile(updatedProfile);
    activeProfileRef.current = updatedProfile;
    // Push business-related multipliers into the live game state so newly-bought
    // prestige bonuses take effect immediately rather than after a reload.
    setState((prev) => ({
      ...prev,
      prestigeBusinessSpawnMult: getBusinessSpawnIntervalMultiplier(updated),
      prestigeChainExpansionMult: getChainExpansionChanceMultiplier(updated),
      prestigeAntiMonopolyCapDelta: getAntiMonopolyCapDelta(updated),
    }));
    return true;
  }, []);

  const startMegaProject = useCallback((projectId: string): boolean => {
    const result = beginProject(stateRef.current, projectId as MegaProjectId);
    if (!result) return false;
    setState(result);
    return true;
  }, []);

  const advanceMegaProject = useCallback((projectId: string): boolean => {
    const result = advanceToConstruction(stateRef.current, projectId as MegaProjectId);
    if (!result) return false;
    setState(result);
    return true;
  }, []);

  const launchOfficerMission = useCallback((missionId: string, officerId: string): boolean => {
    const result = launchOfficerMissionEngine(stateRef.current, missionId as MissionId, officerId);
    if (!result) return false;
    setState(result);
    return true;
  }, []);

  const forceTick = useCallback(() => {
    setState((prev) => {
      // Dev/cheat single-step. Runs the exact same shared pipeline as the live
      // loop, minus the audio/Steam feedback (kept quiet so a dev tool cannot
      // taint achievement unlocks). Achievement toasts still queue for the UI.
      const r = runLiveTick(prev);
      if (r.newAchievements.length > 0) {
        achQueueRef.current = [...achQueueRef.current, ...r.newAchievements];
        queueMicrotask(() => setPendingAchievements([...achQueueRef.current]));
      }
      return r.state;
    });
  }, []);

  const setTickInterval = useCallback((minutes: 1 | 5 | 10 | 15 | 60) => {
    // No speed control in turn-based mode — the real-time loop is off entirely.
    if (stateRef.current.gameplayMode === "turnbased") return;
    // Picking a speed also un-pauses. Re-anchor lastTickTime to now so the
    // span spent paused isn't counted as missed time by the next catch-up.
    setState((prev) => ({ ...prev, tickIntervalMinutes: minutes, tickPaused: false, lastTickTime: Date.now() }));
  }, []);

  const toggleTickPause = useCallback(() => {
    // Pause/resume is meaningless in turn-based mode: there is no running loop
    // to pause. End Turn drives progress there instead (see endTurn).
    if (stateRef.current.gameplayMode === "turnbased") return;
    setState((prev) => {
      const next = !prev.tickPaused;
      // On UN-pause, re-anchor lastTickTime to now. Otherwise the gap between
      // un-pausing and the first live tick (up to a full tick interval) could
      // be reclaimed as offline progress if the app is backgrounded in that
      // window. Pausing leaves the anchor as-is (catch-up is gated on the
      // tickPaused flag itself — see runOfflineCatchup).
      return next
        ? { ...prev, tickPaused: true }
        : { ...prev, tickPaused: false, lastTickTime: Date.now() };
    });
  }, []);

  // ─── TURN-BASED: END TURN ─────────────────────────────────────────────
  // Advances the sim one turn (to the next day boundary, capped) via the shared
  // node-safe advanceTurn, stopping early if a crisis appears. No-op unless in
  // turn-based mode with no unresolved crisis (canAdvanceTurn). Fires the same
  // feedback the live loop would, then stashes an after-action recap.
  const endTurn = useCallback(() => {
    setState((prev) => {
      if (!canAdvanceTurn(prev)) return prev;
      const before = prev;
      const result: TurnResult = advanceTurn(prev);
      const after = result.state;

      if (result.newAchievements.length > 0) {
        achQueueRef.current = [...achQueueRef.current, ...result.newAchievements];
        queueMicrotask(() => setPendingAchievements([...achQueueRef.current]));
        unlockSteamAchievements(result.newAchievements).catch(() => {});
        playSound("achievement");
        playHaptic("heavy");
      }
      const hadAlarm =
        !!result.interruptedBy ||
        result.firedEvents.some((e) => e.severity === "high" || e.severity === "critical");
      if (hadAlarm) {
        playSound("alert_warning");
        playHaptic("medium");
      } else {
        playSound("message_ping");
        playHaptic("light");
      }

      const totalPop = (st: GameState) => st.districts.reduce((a, d) => a + d.population, 0);
      const recap: TurnRecap = {
        ticksAdvanced: result.ticksAdvanced,
        toDate: after.gameDate,
        events: result.firedEvents.map((e) => ({ id: e.id, title: e.title, severity: e.severity })),
        interrupted: !!result.interruptedBy,
        interruptTitle: result.interruptedBy?.title,
        creditsDelta: Math.round((after.resources.credits ?? 0) - (before.resources.credits ?? 0)),
        popDelta: totalPop(after) - totalPop(before),
        tickErrors: result.tickErrors,
      };
      queueMicrotask(() => setTurnRecap(recap));

      updateRichPresence({
        cityName: after.cityName ?? "MEGACITY",
        day: after.totalTicks,
        population: totalPop(after),
        season: after.season,
      });
      syncGameStats(after).catch(() => {});

      return after;
    });
  }, []);

  const dismissTurnRecap = useCallback(() => setTurnRecap(null), []);

  const cheats = useCheats(setState, setActiveSlot, setHasSave, refreshSlotMetas, getSlotKey);
  const {
    cheatHabTowers, cheatHabAll, cheatAddSteel, cheatAddSteelMega,
    cheatAddWaterFacilities, cheatAddFoodFacilities, cheatAddWasteSewage,
    cheatRemovePopulation, cheatFactionWar, cheatAdd1BCredits, cheatAdd1BSteel, cheatAdd2BCredits, cheatAddPopulation,
    cheatAddUnits, cheatSetDemographic, cheatMaxFood, cheatMaxWater,
    cheatLoadOneMonthSave, cheatBulkCommodities, cheatBulkUnits, cheatBulkResources,
    cheatBulkAmmoWeapons, cheatCredits, cheatSetStat, cheatMaxResources,
    cheatReduceUnrest, cheatReduceCrime, cheatBulkBuildings, cheatBulkBuildings1000,
    cheatInfraBuildings1000, cheatMaxLoyaltyAll, cheatInstantAlliance,
    cheatUnlockAllTrade, cheatForcePeace, cheatRevealIntel, cheatMegacityFriendMax,
    cheatInstantJointConstruction, cheatDiplomaticImmunity, cheatFactionReset,
    cheatTradeSurplus, cheatSpyMaster, cheatWarProfiler, cheatPuppetMaster,
    cheatGoldenTongue, cheatOpenBorders, cheatEveryoneIsDead,
    cheatTriggerCivilWar, cheatLaunchExpedition, cheatToggleTradeAI,
    cheatForceSeasonChange, cheatPrestigeBoost,
  } = cheats;

  const dismissOfflineReport = useCallback(() => {
    setOfflineReport(null);
  }, []);

  const renameCity = useCallback((name: string) => {
    setState((prev) => ({ ...prev, cityName: name }));
  }, []);

  const renamePlayer = useCallback((name: string) => {
    setState((prev) => ({
      ...prev,
      player: { ...(prev.player ?? createDefaultPlayer()), name },
    }));
  }, []);

  const setPlayerPortraitId = useCallback((portraitId: string) => {
    setState(prev => ({
      ...prev,
      player: { ...(prev.player ?? createDefaultPlayer()), portraitId },
    }));
    // Mirror onto the active profile so the choice survives slot switches
    // and rides along with profile export/import. The profile is the
    // source of truth for the commander's identity (name/age/sex/portrait).
    const prof = activeProfileRef.current;
    if (prof) {
      const updated = { ...prof, portraitId, lastPlayed: Date.now() };
      activeProfileRef.current = updated;
      setActiveProfile(updated);
      saveProfile(updated).catch(() => {});
    }
  }, []);

  // Stores a player-uploaded portrait (small base64 data URI) on the ACTIVE
  // profile and points both player.portraitId and profile.portraitId at the
  // "custom_<profileId>" sentinel. Returns false without touching anything
  // when there is no active profile or the URI fails validation (wrong
  // format / over the ~100 KB cap), so callers can surface a message.
  const setPlayerCustomPortrait = useCallback((dataUri: string): boolean => {
    const prof = activeProfileRef.current;
    if (!prof) return false;
    if (!registerCustomPortrait(prof.id, dataUri)) return false;
    const portraitId = customPortraitIdFor(prof.id);
    setState(prev => ({
      ...prev,
      player: { ...(prev.player ?? createDefaultPlayer()), portraitId },
    }));
    const updated = { ...prof, portraitId, customPortraitUri: dataUri, lastPlayed: Date.now() };
    activeProfileRef.current = updated;
    setActiveProfile(updated);
    saveProfile(updated).catch(() => {});
    return true;
  }, []);

  const setInsignia = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      player: { ...(prev.player ?? createDefaultPlayer()), insigniaIndex: index },
    }));
  }, []);

  const upgradeAttribute = useCallback((attr: keyof PlayerAttributes): boolean => {
    let success = false;
    setState((prev) => {
      const p = prev.player ?? createDefaultPlayer();
      if (p.attributePoints <= 0) return prev;
      success = true;
      return {
        ...prev,
        player: {
          ...p,
          attributePoints: p.attributePoints - 1,
          attributes: { ...p.attributes, [attr]: p.attributes[attr] + 1 },
        },
      };
    });
    return success;
  }, []);

  const upgradeSkill = useCallback((skill: keyof PlayerSkills): boolean => {
    let success = false;
    setState((prev) => {
      const p = prev.player ?? createDefaultPlayer();
      if (p.skillPoints <= 0) return prev;
      success = true;
      return {
        ...prev,
        player: {
          ...p,
          skillPoints: p.skillPoints - 1,
          skills: { ...p.skills, [skill]: p.skills[skill] + 1 },
        },
      };
    });
    return success;
  }, []);

  const setFaithStance = useCallback((faithId: FaithId, stance: FaithStance) => {
    setState((prev) => {
      const next: GameState = { ...prev, faiths: prev.faiths ? { ...prev.faiths, stances: { ...prev.faiths.stances } } : undefined };
      engineSetFaithStance(next, faithId, stance);
      return next;
    });
  }, []);

  const declareLeaderCult = useCallback((faithId: FaithId): boolean => {
    let ok = false;
    setState((prev) => {
      const next: GameState = { ...prev, faiths: prev.faiths ? { ...prev.faiths } : undefined };
      ok = engineDeclareLeaderCult(next, faithId);
      return ok ? next : prev;
    });
    return ok;
  }, []);

  const renounceLeaderCult = useCallback(() => {
    setState((prev) => {
      const next: GameState = { ...prev, faiths: prev.faiths ? { ...prev.faiths } : undefined };
      engineRenounceLeaderCult(next);
      return next;
    });
  }, []);

  const togglePolicy = useCallback((key: string) => {
    setState((prev) => {
      if (isBBContentId(key) && !isBigBrotherActive(prev.addons)) return prev;
      const next = {
        ...prev,
        policies: {
          ...prev.policies,
          [key]: !(prev.policies as Record<string, unknown>)[key],
        },
      };
      const wasActive = !!(prev.policies as Record<string, unknown>)[key];
      return !wasActive && isCoerciveActionId(key)
        ? applyCoerciveBacklash(next, {
            actionId: key,
            actionKey: `policy:${key}:activate:${prev.totalTicks}`,
            scope: "citywide",
            label: key.replace(/([A-Z])/g, " $1").toUpperCase(),
            messageCap: ARRAY_CAPS.messages,
          })
        : next;
    });
  }, []);

  const setPolicy = useCallback(
    <K extends keyof GameState["policies"]>(key: K, value: GameState["policies"][K]) => {
      setState((prev) => {
        const next = {
        ...prev,
        policies: { ...prev.policies, [key]: value },
        };
        const actionId = `${String(key)}:${String(value)}`;
        return isCoerciveActionId(actionId)
          ? applyCoerciveBacklash(next, {
              actionId,
              actionKey: `policy:${actionId}:${prev.totalTicks}`,
              scope: "citywide",
              label: actionId.replace(/[:_-]/g, " ").toUpperCase(),
              messageCap: ARRAY_CAPS.messages,
            })
          : next;
      });
    },
    []
  );

  const toggleCityPolicy = useCallback((policyId: string) => {
    setState((prev) => {
      const active = prev.activePolicies ?? [];
      const isActive = active.includes(policyId);
      const pol = POLICY_MAP[policyId];
      if (!isActive) {
        // All policy activation flows converge here. Never allow an unknown
        // id (or a known policy with unmet research) into activePolicies.
        if (!pol) return prev;
        if ((isBBContentId(policyId) && !isBigBrotherActive(prev.addons)) ||
            (isSDContentId(policyId) && !isSixthDayActive(prev.addons))) return prev;
        if (pol.prerequisites?.length) {
          const unlocked = prev.unlockedTechnologies ?? [];
          if (!pol.prerequisites.every((p: string) => unlocked.includes(p))) return prev;
        }
      }
      const next = {
        ...prev,
        activePolicies: isActive
          ? active.filter((id: string) => id !== policyId)
          : [...active, policyId],
      };
      return !isActive && isCoerciveActionId(policyId)
        ? applyCoerciveBacklash(next, {
            actionId: policyId,
            actionKey: `city-policy:${policyId}:activate:${prev.totalTicks}`,
            scope: "citywide",
            label: pol?.name ?? policyId,
            messageCap: ARRAY_CAPS.messages,
          })
        : next;
    });
  }, []);

  // Task #500: building orders no longer land instantly. Costs are charged
  // in full here at order time; the order joins pendingConstructions and the
  // count only increments when runTick finishes the timer (real-time,
  // turn-based and offline catch-up all advance it identically).
  const buildConstruction = useCallback((building: string, cost: number, count: number = 1, steelCost: number = 0, categoryId?: string): boolean => {
    let success = false;
    setState((prev) => {
      const batch = validateCityConstructionBatch(prev, { cost, steelCost, count });
      if (batch.allowedCount <= 0) return prev;
      const buildCount = batch.allowedCount;
      const totalCost = cost * buildCount;
      const totalSteel = steelCost * buildCount;
      success = true;
      // Task #480: reactive news — notable construction makes the ticker.
      // "Notable" = the city's first building of a kind, or a big batch order.
      // Kept at order time: breaking ground is the newsworthy moment, and the
      // completion already gets its own inbox message from the tick engine.
      const prevCount = (prev.buildings as Record<string, number>)[building] ?? 0;
      let newsFeed = prev.newsFeed;
      if (prevCount === 0) {
        newsFeed = pushNewsItem(newsFeed, firstBuildingNews(prev, building, humanizeBuildingKey(building)));
      } else if (buildCount >= 5) {
        newsFeed = pushNewsItem(newsFeed, constructionSurgeNews(prev, building, humanizeBuildingKey(building), buildCount));
      }
      const order = createPendingConstruction({
        kind: "city",
        buildingKey: building,
        label: humanizeBuildingKey(building),
        count: buildCount,
        categoryId,
        orderedTick: prev.totalTicks,
        state: prev,
      });
      return {
        ...prev,
        resources: {
          ...prev.resources,
          credits: prev.resources.credits - totalCost,
          steel: prev.resources.steel - totalSteel,
        },
        pendingConstructions: [...(prev.pendingConstructions ?? []), order],
        newsFeed,
      };
    });
    if (success) { playSound("credits_loss"); playHaptic("medium"); }
    return success;
  }, []);

  // Task #524: requisitions pay upfront and enter the training queue;
  // units land on state.units when runTick finishes the order.
  const deployUnit = useCallback((unit: string, cost: number): boolean => {
    let success = false;
    setState((prev) => {
      if (prev.resources.credits < cost) return prev;
      success = true;
      const def = UNIT_CATEGORIES.find((d) => d.key === unit);
      const order = createPendingConstruction({
        kind: "unit",
        buildingKey: unit,
        label: def?.label ?? humanizeBuildingKey(unit),
        battlefieldRole: def?.battlefieldRole,
        count: 10,
        orderedTick: prev.totalTicks,
        state: prev,
      });
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits - cost },
        pendingConstructions: [...(prev.pendingConstructions ?? []), order],
      };
    });
    if (success) { playSound("credits_loss"); playHaptic("medium"); }
    return success;
  }, []);

  const dispatchLawOperation = useCallback((missionId: string): LawOperationDispatchResult => {
    const result = dispatchLawOperationEngine(stateRef.current, missionId);
    if (!result.ok) return result;
    setState(result.state);
    playSound(result.success ? "achievement" : "alert_warning");
    playHaptic(result.success ? "medium" : "heavy");
    return result;
  }, []);

  const performDetaineeAction = useCallback((targetId: string, actionId: DetaineeActionId): boolean => {
    let success = false;
    setState((prev) => {
      const result = performDetaineeActionEngine(prev, targetId, actionId);
      if (!result.ok) return prev;
      success = true;
      return result.state;
    });
    return success;
  }, []);

  const updateSecurityWing = useCallback((mutator: (draft: GameState) => SecurityWingResult): SecurityWingResult => {
    let result: SecurityWingResult = { success: false, error: "Security command unavailable" };
    setState((prev) => {
      const draft: GameState = {
        ...prev,
        resources: { ...prev.resources },
        securityWings: prev.securityWings
          ? {
              ...prev.securityWings,
              wings: prev.securityWings.wings.map((wing) => ({ ...wing, squadIds: [...wing.squadIds] })),
            }
          : undefined,
      };
      result = mutator(draft);
      return result.success ? draft : prev;
    });
    if (result.success) {
      playSound("achievement");
      playHaptic("medium");
    }
    return result;
  }, []);

  const establishSecurityWingAction = useCallback((wingId: SecurityWingId) =>
    updateSecurityWing((draft) => establishSecurityWing(draft, wingId)), [updateSecurityWing]);
  const assignSecurityWingSquadAction = useCallback((wingId: SecurityWingId, squadId: string) =>
    updateSecurityWing((draft) => assignSecurityWingSquad(draft, wingId, squadId)), [updateSecurityWing]);
  const unassignSecurityWingSquadAction = useCallback((wingId: SecurityWingId, squadId: string) =>
    updateSecurityWing((draft) => unassignSecurityWingSquad(draft, wingId, squadId)), [updateSecurityWing]);
  const appointSecurityWingLeaderAction = useCallback((wingId: SecurityWingId, officerId: string | null) =>
    updateSecurityWing((draft) => appointSecurityWingLeader(draft, wingId, officerId)), [updateSecurityWing]);
  const setSecurityWingDoctrineAction = useCallback((wingId: SecurityWingId, doctrine: SecurityWingDoctrine) =>
    updateSecurityWing((draft) => setSecurityWingDoctrine(draft, wingId, doctrine)), [updateSecurityWing]);
  const setSecurityWingJurisdictionAction = useCallback((wingId: SecurityWingId, jurisdiction: SecurityWingJurisdiction) =>
    updateSecurityWing((draft) => setSecurityWingJurisdiction(draft, wingId, jurisdiction)), [updateSecurityWing]);
  const deploySecurityWingAction = useCallback((wingId: SecurityWingId) =>
    updateSecurityWing((draft) => deploySecurityWing(draft, wingId)), [updateSecurityWing]);
  const standDownSecurityWingAction = useCallback((wingId: SecurityWingId) =>
    updateSecurityWing((draft) => standDownSecurityWing(draft, wingId)), [updateSecurityWing]);

  const licenseCompany = useCallback((companyId: string, districtId: string): boolean => {
    let success = false;
    setState((prev) => {
      const result = applyCompanyLicense(prev, companyId, districtId);
      if (!result.ok) return prev;
      success = true;
      return result.state;
    });
    if (success) { playSound("credits_loss"); playHaptic("medium"); }
    return success;
  }, []);

  const shutdownCompany = useCallback((companyId: string) => {
    setState((prev) => ({
      ...prev,
      companies: prev.companies.filter((c) => c.companyId !== companyId),
    }));
  }, []);

  const awardContract = useCallback((defId: string, districtId: string, method: ProcurementMethod): boolean => {
    let success = false;
    setState((prev) => {
      const def = CONTRACT_TEMPLATES.find((t) => t.id === defId);
      if (!def) return prev;
      const maxContracts = prev.contractCapacity ?? 5;
      if ((prev.activeContracts ?? []).length >= maxContracts) return prev;
      if (prev.resources.credits < def.upfrontCost) return prev;
      let matOk = true;
      if (def.requiredMaterials) {
        for (const [mat, amount] of Object.entries(def.requiredMaterials)) {
          if (amount && (prev.resources[mat as keyof typeof prev.resources] as number) < amount) {
            matOk = false;
            break;
          }
        }
      }
      if (!matOk) return prev;
      const newResources = { ...prev.resources, credits: prev.resources.credits - def.upfrontCost };
      if (def.requiredMaterials) {
        for (const [mat, amount] of Object.entries(def.requiredMaterials)) {
          if (amount) {
            (newResources as any)[mat] = Math.max(0, (newResources[mat as keyof typeof newResources] as number) - amount);
          }
        }
      }
      const instance: ContractInstance = {
        id: `${defId}-${Date.now()}`,
        defId,
        contractorId: def.contractorId,
        districtId,
        status: "active",
        progress: 0,
        startTick: prev.totalTicks,
        ticksElapsed: 0,
        totalPaid: def.upfrontCost,
        procurementMethod: method,
        delaysOccurred: 0,
        overrunCost: 0,
        events: [`Tick ${prev.totalTicks}: Contract awarded via ${method}`],
      };
      success = true;
      return {
        ...prev,
        resources: newResources,
        activeContracts: [...(prev.activeContracts ?? []), instance],
      };
    });
    return success;
  }, []);

  const cancelContract = useCallback((contractId: string) => {
    setState((prev) => ({
      ...prev,
      activeContracts: (prev.activeContracts ?? []).filter((c) => c.id !== contractId),
    }));
  }, []);

  // Task #524: hiring pays upfront and enqueues a training order; the
  // batch lands on state.units when runTick completes it.
  const hireUnit = useCallback((unitKey: string, cost: number, batch: number): boolean => {
    let success = false;
    setState((prev) => {
      if (prev.resources.credits < cost) return prev;
      success = true;
      const def = UNIT_CATEGORIES.find((d) => d.key === unitKey);
      const order = createPendingConstruction({
        kind: "unit",
        buildingKey: unitKey,
        label: def?.label ?? humanizeBuildingKey(unitKey),
        battlefieldRole: def?.battlefieldRole,
        count: batch,
        orderedTick: prev.totalTicks,
        state: prev,
      });
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits - cost },
        pendingConstructions: [...(prev.pendingConstructions ?? []), order],
      };
    });
    return success;
  }, []);

  const dismissUnit = useCallback((unitKey: string, refund: number, batch: number): boolean => {
    let success = false;
    setState((prev) => {
      const current = prev.units[unitKey] ?? 0;
      if (current < batch) return prev;
      success = true;
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits + refund },
        totalCreditsEarned: (prev.totalCreditsEarned ?? 0) + Math.max(0, refund),
        units: {
          ...prev.units,
          [unitKey]: current - batch,
        },
      };
    });
    if (success) { playSound("credits_gain"); playHaptic("light"); }
    return success;
  }, []);

  const toggleProcurementPolicy = useCallback((key: string) => {
    setState((prev) => ({
      ...prev,
      procurementPolicies: {
        ...(prev.procurementPolicies ?? {}),
        [key]: !(prev.procurementPolicies as Record<string, boolean>)?.[key],
      },
    }));
  }, []);

  const issueEdict = useCallback((edictId: string): boolean => {
    let success = false;
    setState((prev) => {
      if (isBBContentId(edictId) && !isBigBrotherActive(prev.addons)) return prev;
      const def = getEdictById(edictId);
      if (!def) return prev;
      if (prev.resources.credits < def.cost) return prev;
      const edicts = prev.activeEdicts ?? [];
      if (edicts.some((e) => e.edictId === edictId)) return prev;
      // Religion (Task #129): enforce active-edict cap. Leader Cult grants +1 slot.
      if (edicts.length >= getMaxActiveEdicts(prev)) return prev;
      const cooldowns = prev.edictCooldowns ?? {};
      if (cooldowns[edictId] && cooldowns[edictId] > prev.totalTicks) return prev;
      if (def.requiresAuthority && (prev.player?.attributes?.authority ?? 0) < def.requiresAuthority) return prev;
      success = true;
      const newCooldowns = { ...cooldowns };
      delete newCooldowns[edictId];
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits - def.cost },
        activeEdicts: [
          ...edicts,
          {
            edictId,
            ticksRemaining: def.durationTicks,
            issuedAtTick: prev.totalTicks,
            cooldownUntilTick: prev.totalTicks + def.durationTicks + def.cooldownTicks,
          },
        ],
        edictCooldowns: newCooldowns,
        // Task #480: reactive news — enacting an edict makes the ticker.
        // Task #534: the Accelerated Training Doctrine gets themed "barracks
        // run hot" copy instead of the generic enact line.
        newsFeed: pushNewsItem(
          prev.newsFeed,
          edictId === TRAINING_EDICT_ID
            ? trainingDoctrineEnactedNews(prev, edictId)
            : edictEnactedNews(prev, edictId, def.name),
        ),
      };
    });
    if (success) { playSound("credits_loss"); playHaptic("medium"); }
    return success;
  }, []);

  const setSavedLoadout = useCallback((key: string, loadout: Loadout) => {
    setState((prev) => ({
      ...prev,
      savedLoadouts: { ...(prev.savedLoadouts ?? {}), [key]: { ...loadout } },
    }));
  }, []);

  const actionFaction = useCallback((factionId: string, action: EngineDiplomaticActionId, loadout?: Loadout) => {
    const actionKey = `diplomacy:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Closure flag flipped to true ONLY inside the success branch of the main
    // reducer when a real military strike (rocket-strike / bombardment /
    // lay-siege) executes against a valid city target with sufficient
    // munitions. The chained casualty-billing setState below reads this flag
    // — because the second setState's reducer runs strictly after the first
    // one's reducer in React's batched commit, the flag is correctly set by
    // then. This replaces the previous preUnits===prev.units heuristic which
    // could not distinguish "blocked early-return" (units unchanged) from
    // "successful strike" (units also unchanged at this point).
    let didExecuteMilitaryStrike = false;
    setState((prev) => {
      // Credit costs and effects for non-menu, event-driven actions (faction
      // screen and crisis flows) live in EVENT_ONLY_ACTION_RULES in
      // engine/diplomacyEngine.ts and are looked up via
      // getEventOnlyActionRules(). Menu actions come from
      // DIPLOMATIC_ACTION_RULES via getDiplomaticActionRules() /
      // getDiplomaticActionEffects().
      const eventOnlyRules = getEventOnlyActionRules(action);

      const faction = prev.factions.find((f) => f.id === factionId);
      const megacity = prev.externalMegacities?.find((m) => m.id === factionId);
      const township = prev.townships?.find((t) => t.id === factionId);
      const partnerName = faction?.name ?? megacity?.name ?? township?.name ?? factionId;
      const cost = getDiplomaticActionRules(action)?.cost ?? eventOnlyRules?.cost ?? 0;
      const availableCredits = Number.isFinite(prev.resources?.credits)
        ? prev.resources.credits
        : 0;
      if (cost > 0 && availableCredits < cost) {
        const blockedMsg: import("@/engine/types").GameMessage = {
          id: `diplo-blocked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: prev.gameDate,
          tick: prev.totalTicks,
          category: "alert",
          title: `${partnerName}: INSUFFICIENT CREDITS`,
          body: `Cannot perform ${action.replace(/-/g, " ").toUpperCase()} — need ${cost.toLocaleString()} credits (current: ${Math.floor(availableCredits).toLocaleString()}).`,
          read: false,
          priority: "normal",
        };
        return { ...prev, messages: [blockedMsg, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
      }

      const effects = getDiplomaticActionEffects(action) ?? eventOnlyRules?.effects;
      if (!effects) return prev;

      // Influence requirements come from DIPLOMATIC_ACTION_RULES (the same
      // map the menu reads). Event-driven actions like "fund"/"negotiate"/
      // "suppress" aren't in the rules map and have no influence gate, so
      // their requirement defaults to 0.
      const yesmanActive = prev.cheats?.yesman ?? false;
      const entityInfluence = faction?.influence ?? megacity?.influence ?? township?.influence ?? 0;
      const requiredInfluence = getDiplomaticActionRules(action)?.requiresInfluence ?? 0;
      if (!yesmanActive && requiredInfluence > 0 && entityInfluence < requiredInfluence) {
        const blockedMsg: import("@/engine/types").GameMessage = {
          id: `diplo-blocked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: prev.gameDate, tick: prev.totalTicks, category: "alert",
          title: `${partnerName}: INSUFFICIENT INFLUENCE`,
          body: `Cannot perform ${action.replace(/-/g, " ").toUpperCase()} — need ${requiredInfluence} influence (current: ${entityInfluence})`,
          read: false, priority: "normal",
        };
        return { ...prev, messages: [blockedMsg, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
      }

      // Per-faction farming cooldown for loyalty-raising sandbox verbs
      // (Task #468). The faction menu greys these while cooling down, so this
      // reducer gate is the backstop against double-taps and stale UI. Only
      // faction targets carry it — the diplomacy screen's menu actions have
      // their own diplomacyCooldowns machinery.
      if (faction && isEventOnlyActionId(action)) {
        const wait = factionDiplomacyCooldownRemaining(
          prev.personalActionCooldowns, factionId, action, prev.totalTicks,
        );
        if (wait > 0) {
          const blockedMsg: import("@/engine/types").GameMessage = {
            id: `diplo-blocked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: prev.gameDate, tick: prev.totalTicks, category: "alert",
            title: `${partnerName}: TOO SOON`,
            body: `Cannot perform ${action.replace(/-/g, " ").toUpperCase()} again yet — recently used. Wait ${wait} tick${wait === 1 ? "" : "s"}.`,
            read: false, priority: "normal",
          };
          return { ...prev, messages: [blockedMsg, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
        }
      }

      const prereqCheck = canPerformAction(prev, factionId, action);
      if (!prereqCheck.allowed) {
        const blockedMsg: import("@/engine/types").GameMessage = {
          id: `diplo-blocked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: prev.gameDate,
          tick: prev.totalTicks,
          category: "alert",
          title: `${partnerName}: ACTION BLOCKED`,
          body: `Cannot perform ${action.replace(/-/g, " ").toUpperCase()} — ${prereqCheck.reason}`,
          read: false,
          priority: "normal",
        };
        return { ...prev, messages: [blockedMsg, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
      }

      const outcome = resolveDiplomaticAction(prev, factionId, action);
      const relationshipTarget = faction ?? megacity ?? township;
      const acceptedRelationshipDeltas = computeFactionActionRelationshipDeltas({
        current: {
          loyalty: relationshipTarget?.loyalty ?? 50,
          influence: relationshipTarget?.influence ?? 0,
          threat: relationshipTarget?.threat ?? 0,
        },
        playerAttributes: prev.player?.attributes,
        corruption: prev.cityStats.corruption,
      }, effects);

      const yesman = prev.cheats?.yesman ?? false;

      let messageBody: string;
      let messageCategory: string;
      let messagePriority: "normal" | "high" | "critical";
      let messageTitle: string;

      if (outcome.accepted) {
        const loyaltyChange = acceptedRelationshipDeltas.loyalty;
        const influenceChange = acceptedRelationshipDeltas.influence;
        const threatChange = acceptedRelationshipDeltas.threat;
        const effectSummary = [
          loyaltyChange !== 0 ? `Loyalty ${loyaltyChange > 0 ? "+" : ""}${loyaltyChange}` : "",
          influenceChange !== 0 ? `Influence ${influenceChange > 0 ? "+" : ""}${influenceChange}` : "",
          threatChange !== 0 ? `Threat ${threatChange > 0 ? "+" : ""}${threatChange}` : "",
        ].filter(Boolean).join(" | ");
        messageBody = [
          "Action accepted.",
          effectSummary ? `Effects: ${effectSummary}` : "",
          cost > 0 ? `Cost: ${cost.toLocaleString()} credits` : "",
          yesman ? "Outcome override: guaranteed acceptance." : "",
        ].filter(Boolean).join("\n");
        messageCategory = action === "buy-rumors" || action === "spy-network" || action === "request-intel" ? "intel" : action === "declare-war" || action === "issue-ultimatum" ? "alert" : "call";
        messagePriority = action === "declare-war" ? "critical" : action === "propose-alliance" ? "high" : "normal";
        messageTitle = `${partnerName}: ${action.replace(/-/g, " ").toUpperCase()}`;
      } else {
        const counterPart = outcome.counterAction
          ? `\n\nCOUNTER-PROPOSAL: ${outcome.counterReason ?? `They suggest ${outcome.counterAction.replace(/-/g, " ").toUpperCase()} instead.`}`
          : "";
        const chancePart = `\n\nAcceptance probability: ${outcome.acceptChance}%.`;
        messageBody = `Action rejected.${counterPart}${chancePart}${cost > 0 ? `\nCredits spent: ${cost.toLocaleString()} (non-refundable)` : ""}`;
        messageCategory = "alert";
        messagePriority = "normal";
        messageTitle = `${partnerName}: ${action.replace(/-/g, " ").toUpperCase()} — REJECTED`;
      }

      const newMessage: import("@/engine/types").GameMessage = {
        id: `diplo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: prev.gameDate,
        tick: prev.totalTicks,
        category: messageCategory as any,
        title: messageTitle,
        body: messageBody,
        read: false,
        priority: messagePriority,
      };

      let newTradeAgreements = prev.tradeAgreements ?? [];
      if (outcome.accepted && (action === "trade-agreement" || action === "resource-exchange" || action === "arms-deal")) {
        if (township?.acrossWater) {
          const hasWaterCrossing = (prev.unlockedTechnologies ?? []).some((t) =>
            ["portAuthority", "ferryNetwork", "bridgeEngineering", "skyportLandingPlatforms", "droneLogisticsCorridors", "cargoFreightMegaways"].includes(t)
          ) || (prev.buildings?.skyportLandingPlatforms ?? 0) > 0 || (prev.buildings?.cargoFreightMegaways ?? 0) > 0;
          if (!hasWaterCrossing) {
            const blockedMsg: import("@/engine/types").GameMessage = {
              id: `water-block-${Date.now()}`,
              timestamp: prev.gameDate,
              tick: prev.totalTicks,
              category: "alert",
              title: "TRADE ROUTE BLOCKED",
              body: `${partnerName} is located across a major waterway. You need port infrastructure, ferry networks, bridge engineering, or air freight capability to establish trade routes. Build Skyport Landing Platforms, Cargo Freight Megaways, or research relevant technologies.`,
              read: false,
              priority: "normal",
            };
            return { ...prev, resources: { ...prev.resources }, messages: [blockedMsg, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
          }
        }
        const resourceItems: { id: string; qty: number }[] = [];
        const RES_THRESH: [string, keyof typeof prev.resources, number][] = [
          ["__res_food", "food", 50], ["__res_water", "water", 50], ["__res_steel", "steel", 20],
          ["__res_power", "power", 100], ["__res_goods", "goods", 30], ["__res_fuel", "fuel", 20],
          ["__res_medSupplies", "medSupplies", 20], ["__res_ammo", "ammo", 20],
        ];
        for (const [id, key, threshold] of RES_THRESH) {
          if (prev.resources[key] > threshold) resourceItems.push({ id, qty: Math.floor(prev.resources[key]) });
        }

        const playerAvailable = [
          ...Object.entries(prev.stockpiles)
            .filter(([_, qty]) => (qty ?? 0) >= 5)
            .map(([id, qty]) => ({ id, qty: qty as number })),
          ...resourceItems,
        ];

        let partnerAvailable: { id: string; qty: number }[] = [];
        if (megacity) {
          partnerAvailable = Object.entries(megacity.tradeInventory)
            .filter(([_, qty]) => (qty ?? 0) >= 3)
            .map(([id, qty]) => ({ id, qty: qty as number }));
        } else {
          const FACTION_SPECIALTY: Record<string, string[]> = {
            law: ["steel_ingots", "titanium_plates", "copper_wire", "aluminum_sheets", "steel_bars", "__res_steel", "__res_food"],
            criminal: ["gold_bars", "silver_bars", "platinum_bars", "electronic_waste", "scrap_metal", "lead_ingots"],
            corporate: ["steel_sheets", "aluminum_extrusions", "carbon_fiber_sheets", "copper_ingots", "nickel_ingots", "__res_steel"],
            underclass: ["wasteland_salvage", "electronic_waste", "salvaged_machinery", "construction_debris", "scrap_metal", "__res_food"],
            cult: ["rare_earth_minerals", "cobalt_ingots", "chromium_bars", "tungsten_bars", "uranium_ore", "thorium_ore"],
          };
          const fType = faction?.type ?? "law";
          const specialties = FACTION_SPECIALTY[fType] ?? FACTION_SPECIALTY.law;
          partnerAvailable = specialties.map((id) => ({ id, qty: 20 + Math.floor(Math.random() * 30) }));
        }

        if (playerAvailable.length > 0 && partnerAvailable.length > 0) {
          const giveItem = playerAvailable[Math.floor(Math.random() * Math.min(playerAvailable.length, 20))];
          const receiveItem = partnerAvailable[Math.floor(Math.random() * partnerAvailable.length)];
          const giveAmount = Math.min(Math.floor(giveItem.qty * 0.1), 15);
          const receiveAmount = Math.min(Math.floor(receiveItem.qty * 0.1), 10);

          if (giveAmount >= 1 && receiveAmount >= 1) {
            const agreement: import("@/engine/types").TradeAgreement = {
              id: `ta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              partnerId: factionId,
              partnerName,
              partnerType: faction ? "faction" : "megacity",
              give: [{ commodity: giveItem.id, amount: giveAmount }],
              receive: [{ commodity: receiveItem.id, amount: receiveAmount }],
              creditsPerTick: megacity ? 400 + Math.floor(Math.random() * 300) : 150 + Math.floor(Math.random() * 200),
              duration: 48,
              remainingTicks: 48,
              status: "active",
              createdTick: prev.totalTicks,
            };
            newTradeAgreements = [...newTradeAgreements, agreement];
          }
        }
      }

      let newJointProjects = prev.jointProjects ?? [];
      if (outcome.accepted && action === "joint-research") {
        const JOINT_BUILD_OPTIONS = [
          { key: "advancedResearchLabs", name: "Advanced Research Lab", target: 100 },
          { key: "fusionReactors", name: "Fusion Reactor", target: 120 },
          { key: "syntheticFoodPlants", name: "Synthetic Food Plant", target: 90 },
          { key: "megaDesalinationPlants", name: "Mega Desalination Plant", target: 80 },
          { key: "megaManufacturingPlants", name: "Mega Manufacturing Plant", target: 110 },
        ];
        const pick = JOINT_BUILD_OPTIONS[Math.floor(Math.random() * JOINT_BUILD_OPTIONS.length)];
        const partnerLoyalty = faction?.loyalty ?? megacity?.loyalty ?? 50;
        const project: import("@/engine/types").JointProject = {
          id: `jp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          partnerId: factionId,
          partnerName,
          buildingKey: pick.key,
          buildingName: pick.name,
          progress: 0,
          target: pick.target,
          contributionPerTick: Math.max(1, Math.floor(partnerLoyalty / 10)),
          status: "in_progress",
          createdTick: prev.totalTicks,
        };
        newJointProjects = [...newJointProjects, project];
      }

      let newDiplomaticPacts = prev.diplomaticPacts ?? [];
      if (outcome.accepted && (action === "propose-alliance" || action === "negotiate-ceasefire")) {
        const pactTypes: Array<import("@/engine/types").DiplomaticPact["pactType"]> =
          action === "propose-alliance"
            ? ["mutual-defense", "open-borders"]
            : ["non-aggression"];
        const pactType = pactTypes[Math.floor(Math.random() * pactTypes.length)];
        const PACT_EFFECTS: Record<string, { crime?: number; threat?: number; loyalty?: number; influence?: number }> = {
          "non-aggression": { threat: -5 },
          "mutual-defense": { threat: -8, loyalty: 2 },
          "open-borders": { loyalty: 3, influence: 2, crime: 1 },
          "intelligence-sharing": { influence: 3, threat: -3 },
        };
        const pact: import("@/engine/types").DiplomaticPact = {
          id: `dp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          partnerId: factionId,
          partnerName,
          partnerType: faction ? "faction" : "megacity",
          pactType,
          effects: PACT_EFFECTS[pactType],
          duration: 96,
          remainingTicks: 96,
          status: "active",
          createdTick: prev.totalTicks,
        };
        newDiplomaticPacts = [...newDiplomaticPacts, pact];
      }

      const isMegacity = !!megacity;
      const isTownship = !!township;
      const partnerKind = getPartnerKind(faction, megacity, township);

      if (!actionAvailableForKind(action, partnerKind)) {
        const blockedMsg: import("@/engine/types").GameMessage = {
          id: `diplo-blocked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: prev.gameDate, tick: prev.totalTicks, category: "alert",
          title: `${partnerName}: ACTION UNAVAILABLE`,
          body: `${action.replace(/-/g, " ").toUpperCase()} is not appropriate for this kind of partner.`,
          read: false, priority: "normal",
        };
        return { ...prev, messages: [blockedMsg, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
      }

      const isCityPartner = !!(megacity || township);
      const cityEntity = (megacity ?? township) as import("@/engine/types").ExternalMegacity | import("@/engine/types").Township | undefined;
      const playerMilitaryStrength = Object.values(prev.units ?? {}).reduce((s, v) => s + (typeof v === "number" ? Math.max(0, v) : 0), 0);

      let cityStatPatch: Partial<{
        population: number;
        cityHealth: number;
        attrition: number;
        infrastructure: import("@/engine/types").FactionInfrastructure;
        controlStatus: import("@/engine/types").PartnerControlStatus;
        tributePerTick: number;
        occupiedSinceTick: number;
      }> | null = null;
      let playerPopulationGain = 0;
      let extraReportLine = "";

      if (isMilitaryStrikeId(action)) {
        if (!isCityPartner || !cityEntity) {
          const blocked: import("@/engine/types").GameMessage = {
            id: `mil-blocked-${Date.now()}`,
            timestamp: prev.gameDate, tick: prev.totalTicks, category: "alert",
            title: `${partnerName}: NO TARGET`,
            body: `${action.replace(/-/g, " ").toUpperCase()} requires a city, megacity, or township target.`,
            read: false, priority: "normal",
          };
          return { ...prev, messages: [blocked, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
        }
        const { ammo: ammoCost, fuel: fuelCost } = getMilitaryStrikeCost(action);
        if (prev.resources.ammo < ammoCost || prev.resources.fuel < fuelCost) {
          const blocked: import("@/engine/types").GameMessage = {
            id: `mil-noammo-${Date.now()}`,
            timestamp: prev.gameDate, tick: prev.totalTicks, category: "alert",
            title: `${partnerName}: INSUFFICIENT MUNITIONS`,
            body: `${action.replace(/-/g, " ").toUpperCase()} requires ${ammoCost} ammo and ${fuelCost} fuel.`,
            read: false, priority: "normal",
          };
          return { ...prev, messages: [blocked, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
        }
        // We've passed every blocked-path early-return for this military
        // action: target is a valid city, munitions are sufficient. Mark the
        // success flag so the chained casualty-billing setState knows the
        // strike actually executed and the loadout should be charged.
        didExecuteMilitaryStrike = true;
        const report = applyMilitaryDamage(cityEntity, action);
        cityStatPatch = {
          population: Math.max(0, (cityEntity as { population?: number }).population ?? 0) - report.populationKilled,
          cityHealth: report.cityHealthAfter,
          attrition: report.attritionAfter,
          infrastructure: report.infrastructureAfter,
        };
        extraReportLine = `\n\n--- STRIKE EFFECTS ---\nPopulation lost: ${report.populationKilled.toLocaleString()}\nCity health: ${Math.round(report.cityHealthAfter)}/100\nAttrition: ${Math.round(report.attritionAfter)}/100\nInfrastructure: M${report.infrastructureAfter.military} W${report.infrastructureAfter.walls} F${report.infrastructureAfter.fuel} C${report.infrastructureAfter.civilian}\nMunitions: -${ammoCost} ammo, -${fuelCost} fuel`;
        prev = {
          ...prev,
          resources: {
            ...prev.resources,
            ammo: Math.max(0, prev.resources.ammo - ammoCost),
            fuel: Math.max(0, prev.resources.fuel - fuelCost),
          },
        } as typeof prev;
      } else if (action === "occupy") {
        if (!isCityPartner || !cityEntity) {
          const blocked: import("@/engine/types").GameMessage = {
            id: `occ-blocked-${Date.now()}`,
            timestamp: prev.gameDate, tick: prev.totalTicks, category: "alert",
            title: `${partnerName}: INVALID TARGET`,
            body: `OCCUPY requires a city, megacity, or township target.`,
            read: false, priority: "normal",
          };
          return { ...prev, messages: [blocked, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
        }
        const check = canOccupy(cityEntity, entityInfluence, playerMilitaryStrength);
        if (!check.allowed) {
          const blocked: import("@/engine/types").GameMessage = {
            id: `occ-blocked-${Date.now()}`,
            timestamp: prev.gameDate, tick: prev.totalTicks, category: "alert",
            title: `${partnerName}: OCCUPATION BLOCKED`,
            body: check.reason,
            read: false, priority: "normal",
          };
          return { ...prev, messages: [blocked, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
        }
        const tribute = tributeForOccupation(cityEntity);
        cityStatPatch = {
          controlStatus: "occupied",
          tributePerTick: tribute,
          occupiedSinceTick: prev.totalTicks,
        };
        extraReportLine = `\n\n--- OCCUPATION ---\n${partnerName} is now under our administration.\nTribute: ${tribute} credits/tick.\nTheir leadership has surrendered. Garrison forces are deployed.`;
        // Occupation ends any active war with this city — resolve wars whose
        // belligerents include the target and drop linked peace conferences.
        if ((prev.diplomacyAdvanced?.wars ?? []).some((w) => w.belligerents.includes(factionId))) {
          const { endWarsInvolving } = require("@/engine/diplomacyAdvanced") as typeof import("@/engine/diplomacyAdvanced");
          const warEnd = endWarsInvolving(prev.diplomacyAdvanced!, factionId, prev.totalTicks);
          prev = { ...prev, diplomacyAdvanced: warEnd.adv } as typeof prev;
          extraReportLine += `\n\n--- WAR CONCLUDED ---\nThe war with ${partnerName} is over. Hostilities have ceased.`;
        }
        // Task #493: occupation is a major status change — one headline covers
        // both the takeover and any war it ended.
        prev = { ...prev, newsFeed: pushNewsItem(prev.newsFeed, occupationNews(prev, factionId, partnerName)) } as typeof prev;
      } else if (action === "annex") {
        if (!isCityPartner || !cityEntity) {
          const blocked: import("@/engine/types").GameMessage = {
            id: `ann-blocked-${Date.now()}`,
            timestamp: prev.gameDate, tick: prev.totalTicks, category: "alert",
            title: `${partnerName}: INVALID TARGET`,
            body: `ANNEX requires a city, megacity, or township target.`,
            read: false, priority: "normal",
          };
          return { ...prev, messages: [blocked, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
        }
        const check = canAnnex(cityEntity, entityInfluence);
        if (!check.allowed) {
          const blocked: import("@/engine/types").GameMessage = {
            id: `ann-blocked-${Date.now()}`,
            timestamp: prev.gameDate, tick: prev.totalTicks, category: "alert",
            title: `${partnerName}: ANNEXATION BLOCKED`,
            body: check.reason,
            read: false, priority: "normal",
          };
          return { ...prev, messages: [blocked, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages) };
        }
        playerPopulationGain = annexationPopulationGain(cityEntity);
        cityStatPatch = {
          controlStatus: "annexed",
          tributePerTick: 0,
        };
        const stockpileCredits = playerPopulationGain * 5;
        const stockpileAmmo = Math.round(playerPopulationGain / 50);
        const stockpileFuel = Math.round(playerPopulationGain / 80);
        const infrastructure = applyInfrastructureHealthDelta(
          prev,
          5,
          `annexation:${factionId}:${prev.totalTicks}`,
          `Annexation of ${partnerName}`,
        );
        prev = {
          ...prev,
          resources: {
            ...prev.resources,
            credits: prev.resources.credits + stockpileCredits,
            ammo: prev.resources.ammo + stockpileAmmo,
            fuel: prev.resources.fuel + stockpileFuel,
          },
          totalCreditsEarned: (prev.totalCreditsEarned ?? 0) + Math.max(0, stockpileCredits),
          cityStats: infrastructure.cityStats,
          infrastructureLedger: infrastructure.infrastructureLedger,
        } as typeof prev;
        extraReportLine = `\n\n--- ANNEXATION ---\n${partnerName} has been formally absorbed.\n${playerPopulationGain.toLocaleString()} citizens added to our population.\n\n--- CAPTURED STOCKPILES ---\nCredits: +${stockpileCredits.toLocaleString()}\nAmmo: +${stockpileAmmo.toLocaleString()}\nFuel: +${stockpileFuel.toLocaleString()}\nCity Infrastructure: +5\n\nTheir territory is now ours.`;
        // Annexation ends any active war with this city — resolve wars whose
        // belligerents include the target and drop linked peace conferences.
        if ((prev.diplomacyAdvanced?.wars ?? []).some((w) => w.belligerents.includes(factionId))) {
          const { endWarsInvolving } = require("@/engine/diplomacyAdvanced") as typeof import("@/engine/diplomacyAdvanced");
          const warEnd = endWarsInvolving(prev.diplomacyAdvanced!, factionId, prev.totalTicks);
          prev = { ...prev, diplomacyAdvanced: warEnd.adv } as typeof prev;
          extraReportLine += `\n\n--- WAR CONCLUDED ---\nThe war with ${partnerName} is over. Hostilities have ceased.`;
        }
        // Task #493: annexation is a major status change — one headline covers
        // both the absorption and any war it ended.
        prev = { ...prev, newsFeed: pushNewsItem(prev.newsFeed, annexationNews(prev, factionId, partnerName)) } as typeof prev;
      } else if (action === "send-relief") {
        if (isCityPartner && cityEntity) {
          const snap = readCityStats(cityEntity);
          const popRestore = Math.round(snap.population * 0.005);
          cityStatPatch = {
            cityHealth: Math.min(100, snap.cityHealth + 12),
            attrition: Math.max(0, snap.attrition - 10),
            population: snap.population + popRestore,
          };
          extraReportLine = `\n\n--- RELIEF DELIVERED ---\nCity health restored by 12. Attrition reduced by 10.\nReturning refugees: +${popRestore.toLocaleString()} citizens.`;
        }
      }

      if (extraReportLine) {
        newMessage.body = newMessage.body + extraReportLine;
      }

      const partnerPersonality = (faction?.personality ?? megacity?.personality ?? township?.personality)
        ?? ensurePersonality({ id: factionId }, partnerKind);

      const ledgerOutcome: "accepted" | "rejected" = outcome.accepted ? "accepted" : "rejected";

      let stateAfterIntel = prev;
      const intelGenerated: import("@/engine/types").IntelItem[] = [];
      if (outcome.accepted) {
        if (action === "buy-rumors") {
          intelGenerated.push(...generateRumorIntel(prev, factionId, partnerName, 2));
        } else if (action === "spy-network") {
          intelGenerated.push(...generateRumorIntel(prev, factionId, partnerName, 3));
        } else if (action === "request-intel") {
          intelGenerated.push(...generateRequestedIntel(prev, factionId, partnerName));
        } else if (action === "counter-intel") {
          intelGenerated.push(...generateCounterIntel(prev, factionId, partnerName));
        }
      }
      if (intelGenerated.length > 0) {
        stateAfterIntel = appendIntel(stateAfterIntel, intelGenerated);
      }
      stateAfterIntel = { ...stateAfterIntel, intelItems: pruneIntel(stateAfterIntel.intelItems ?? [], stateAfterIntel.totalTicks) };

      stateAfterIntel = recordPartnerLedger(stateAfterIntel, factionId, action, ledgerOutcome, partnerPersonality);
      const updatedLedger = (stateAfterIntel.partnerLedgers ?? {})[factionId];

      const followUp = buildPendingResponse(stateAfterIntel, factionId, partnerName, partnerKind, action, ledgerOutcome, partnerPersonality, updatedLedger);
      if (followUp) {
        stateAfterIntel = enqueuePendingResponse(stateAfterIntel, followUp);
      }

      const diploUpdates = recordDiplomaticAction(stateAfterIntel, factionId, partnerName, action, outcome);

      let newActiveOperations = prev.activeOperations ?? [];
      if (outcome.accepted && isOperationAction(action)) {
        const op = createOperation(prev, action, factionId, partnerName);
        if (op) {
          newActiveOperations = [...newActiveOperations, op];
        }
      }

      const loyaltyDelta = outcome.accepted ? acceptedRelationshipDeltas.loyalty : (outcome.loyaltyPenalty ?? 0);
      const influenceDelta = outcome.accepted ? acceptedRelationshipDeltas.influence : 0;
      const threatDelta = outcome.accepted ? acceptedRelationshipDeltas.threat : 0;

      const intelMsgs: import("@/engine/types").GameMessage[] = intelGenerated.map((it) => ({
        id: `intel-msg-${it.id}`,
        timestamp: prev.gameDate,
        tick: prev.totalTicks,
        category: "intel",
        title: `INTEL FILED: ${it.subjectName ?? "UNATTRIBUTED"}`,
        body: it.content,
        read: false,
        priority: "normal",
      }));

      // Stamp the per-faction farming cooldown (Task #468) for loyalty-raising
      // sandbox verbs. stampFactionDiplomacyCooldown is a no-op for verbs
      // without a configured cooldown, so this is safe to run for every
      // event-only action. Stamped even when the partner rejects — the
      // attempt was made, so retry-spamming is throttled too.
      const stampedDiploCooldowns = faction && isEventOnlyActionId(action)
        ? stampFactionDiplomacyCooldown(prev.personalActionCooldowns, factionId, action, prev.totalTicks)
        : prev.personalActionCooldowns;

      const nextState = {
        ...stateAfterIntel,
        ...diploUpdates,
        personalActionCooldowns: stampedDiploCooldowns,
        messages: [...intelMsgs, newMessage, ...prev.messages].slice(0, ARRAY_CAPS.messages),
        resources: cost > 0
          ? { ...prev.resources, credits: Math.max(0, availableCredits - cost) }
          : prev.resources,
        tradeAgreements: newTradeAgreements,
        jointProjects: newJointProjects,
        diplomaticPacts: newDiplomaticPacts,
        activeOperations: newActiveOperations,
        factions: (isMegacity || isTownship) ? prev.factions : prev.factions.map((f) => {
          if (f.id !== factionId) return f;
          return {
            ...f,
            personality: f.personality ?? partnerPersonality,
            loyalty: Math.max(0, Math.min(100, f.loyalty + loyaltyDelta)),
            influence: Math.max(0, Math.min(100, f.influence + influenceDelta)),
            threat: Math.max(0, Math.min(100, f.threat + threatDelta)),
          };
        }),
        externalMegacities: !isMegacity ? (prev.externalMegacities ?? []) : (prev.externalMegacities ?? []).map((m) => {
          if (m.id !== factionId) return m;
          return {
            ...m,
            personality: m.personality ?? partnerPersonality,
            loyalty: Math.max(0, Math.min(100, m.loyalty + loyaltyDelta)),
            influence: Math.max(0, Math.min(100, m.influence + influenceDelta)),
            threat: Math.max(0, Math.min(100, m.threat + threatDelta)),
            ...(cityStatPatch ?? {}),
          };
        }),
        townships: !isTownship ? (prev.townships ?? []) : (prev.townships ?? []).map((t) => {
          if (t.id !== factionId) return t;
          return {
            ...t,
            personality: t.personality ?? partnerPersonality,
            loyalty: Math.max(0, Math.min(100, (t.loyalty ?? 50) + loyaltyDelta)),
            influence: Math.max(0, Math.min(100, (t.influence ?? 0) + influenceDelta)),
            threat: Math.max(0, Math.min(100, (t.threat ?? 0) + threatDelta)),
            ...(cityStatPatch ?? {}),
          };
        }),
        cityStats: playerPopulationGain > 0
          ? { ...prev.cityStats, population: prev.cityStats.population + playerPopulationGain }
          : prev.cityStats,
      };
      return outcome.accepted && isCoerciveActionId(action)
        ? applyCoerciveBacklash(nextState, {
            actionId: action,
            actionKey,
            targetId: factionId,
            targetName: partnerName,
            scope: "targeted",
            audience: isCityPartner ? "external" : "internal",
            label: action.replace(/[-_]/g, " ").toUpperCase(),
            messageCap: ARRAY_CAPS.messages,
          })
        : nextState;
    });

    // Post-reducer step: charge the chosen loadout for casualties when this
    // diplomatic action is one of the real military strikes (rocket-strike,
    // bombardment, lay-siege). Authoritative success signal is the
    // didExecuteMilitaryStrike closure flag set inside the main reducer's
    // success branch (after every blocked early-return is cleared). This
    // setState's reducer runs strictly after the main reducer in React's
    // batched commit, so the flag reflects the true outcome.
    const attackTypeKey = isMilitaryStrikeId(action) ? MILITARY_DIPLO_ATTACK_MAP[action] : undefined;
    if (loadout && attackTypeKey && Object.keys(loadout).length > 0) {
      const atkDef = ATTACK_TYPES.find((a) => a.id === attackTypeKey);
      if (atkDef) {
        setState((prev) => {
          if (!didExecuteMilitaryStrike) return prev;
          const liveUnits = prev.units as Record<string, number>;
          const validated: Loadout = {};
          for (const [k, v] of Object.entries(loadout)) {
            if (!v || v <= 0) continue;
            const have = Math.max(0, Math.floor(liveUnits[k] ?? 0));
            const take = Math.min(have, Math.floor(v));
            if (take > 0) validated[k] = take;
          }
          const deployedCount = loadoutTotalUnits(validated);
          if (deployedCount === 0) return prev;
          const casualties = Math.max(
            1,
            Math.floor(deployedCount * atkDef.riskToAttacker * (0.5 + Math.random() * 1.0))
          );
          const { updated } = deductCasualties(liveUnits, validated, casualties);
          const summary = formatLoadoutSummary(validated);
          const reportMsg: import("@/engine/types").GameMessage = {
            id: `diplo-strike-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: prev.gameDate ?? { year: 2030, month: 1, day: 1, hour: 0 },
            tick: prev.totalTicks,
            category: "alert" as const,
            title: `STRIKE EXECUTED — ${atkDef.name}`,
            body: `Diplomatic military action carried out.\n\nFORCE COMPOSITION:\n  ${summary}\n  Total deployed: ${deployedCount}\n\nOur Casualties: ${casualties}`,
            read: false,
            priority: "normal",
          };
          return {
            ...prev,
            units: updated as typeof prev.units,
            messages: [reportMsg, ...prev.messages].slice(0, ARRAY_CAPS.messages),
            savedLoadouts: { ...(prev.savedLoadouts ?? {}), [attackTypeKey]: { ...validated } },
          };
        });
      }
    }
  }, []);

  // Personal interactions (Task #382 unified menu). These are the lean, new
  // "aimed at a person" verbs — gift / flatter / grant-favor / bribe / threaten
  // — as opposed to the faction-level diplomacy handled by actionFaction above.
  // They apply an instant relationship change to a single faction's leadership
  // or one of your own officers. No tick-loop wiring: the effect is the change.
  const performPersonalInteraction = useCallback((target: PersonalInteractionTarget, optionId: PersonalActionId) => {
    const prev = stateRef.current;
    const next = applyPersonalInteraction(prev, target, optionId, ARRAY_CAPS.messages);
    if (next === prev) return false;
    // A blocked attempt may still return a new state solely to persist its
    // exact Inbox reason. Only a stamped cooldown proves the action itself
    // committed; blocked alert states must never enter the backlash reducer.
    const actionCommitted = next.personalActionCooldowns !== prev.personalActionCooldowns;
    const actionKey = `personal:${prev.totalTicks}:${target.kind}:${target.id}:${optionId}`;
    const committed = actionCommitted && isCoerciveActionId(optionId)
      ? applyCoerciveBacklash(next, {
          actionId: optionId,
          actionKey,
          targetId: target.id,
          scope: target.kind === "population" ? "citywide" : "targeted",
          audience: target.kind === "district" ? "district" : target.kind === "population" ? "population" : target.kind === "cohort" ? "cohort" : target.kind === "faction" || target.kind === "leader" ? "internal" : undefined,
          label: optionId.replace(/[-_]/g, " ").toUpperCase(),
          messageCap: ARRAY_CAPS.messages,
        })
      : next;
    stateRef.current = committed;
    _liveStateRef.current = committed;
    setState(committed);
    return actionCommitted;
  }, []);

  const dismissEvent = useCallback((eventId: string) => {
    // applyEventDismissal rebalances the originating biome and opens a calm
    // window when a biosphere/ecology crisis is dismissed — the same treatment
    // respondToEvent and respondToEventMulti apply — so dismissing actually
    // resolves it instead of letting a sibling crisis re-fire ~80 ticks later.
    // Extracted to engine/eventResolution.ts so the biome-resolution wiring is
    // unit-testable without mounting the provider.
    setState((prev) => applyEventDismissal(prev, eventId));
  }, []);

  const respondToEvent = useCallback((eventId: string, response: import("@/engine/types").EventResponse): boolean => {
    // applyEventResponse handles the npc-war, event-chain and standard branches
    // and, when the event is a biosphere/ecology crisis, rebalances the
    // originating biome and opens a calm window — the same treatment dismissEvent
    // and respondToEventMulti apply. Extracted to engine/eventResolution.ts so
    // the biome-resolution wiring is unit-testable without mounting the provider.
    let accepted = false;
    setState((prev) => {
      if (!prev.activeEvents.some((event) => event.id === eventId)) return prev;
      accepted = true;
      return applyEventResponse(prev, eventId, response);
    });
    return accepted;
  }, []);


  const proposeRailCorridorAction = useCallback((endpointId: string, staffing: Partial<import("@/engine/types").RailCorridor["staffing"]> = {}) => {
    // Compute against the live ref so callers can immediately inspect the
    // result in the same press handler. React state updater callbacks may run
    // after the handler returns, which previously made this action return null
    // even though the corridor was queued successfully.
    const result = proposeRailCorridor(stateRef.current, endpointId, staffing);
    if (result.ok) {
      stateRef.current = result.state;
      _liveStateRef.current = result.state;
      setState(result.state);
    }
    return result;
  }, []);

  const respondToRailConsentAction = useCallback((id: string, accepted: boolean) => {
    const result = respondToRailConsent(stateRef.current, id, accepted);
    if (result.ok) {
      stateRef.current = result.state;
      _liveStateRef.current = result.state;
      setState(result.state);
    }
  }, []);

  const cancelRailCorridorAction = useCallback((id: string) => {
    const result = cancelRailCorridor(stateRef.current, id);
    if (result.ok) {
      stateRef.current = result.state;
      _liveStateRef.current = result.state;
      setState(result.state);
    }
  }, []);

  const configureRailCorridorStaffingAction = useCallback((id: string, staffing: Partial<import("@/engine/types").RailCorridor["staffing"]>) => {
    const result = configureRailCorridorStaffing(stateRef.current, id, staffing);
    if (result.ok) {
      stateRef.current = result.state;
      _liveStateRef.current = result.state;
      setState(result.state);
    }
    return result;
  }, []);

  const resumeRailCorridorAction = useCallback((id: string) => {
    const result = resumeRailCorridor(stateRef.current, id);
    if (result.ok) {
      stateRef.current = result.state;
      _liveStateRef.current = result.state;
      setState(result.state);
    }
    return result;
  }, []);

  const installRailTrainUpgradeAction = useCallback((corridorId: string, upgradeId: import("@/engine/types").RailTrainUpgradeId) => {
    const result = installRailTrainUpgrade(stateRef.current, corridorId, upgradeId);
    if (result.ok) {
      stateRef.current = result.state;
      _liveStateRef.current = result.state;
      setState(result.state);
    }
    return result;
  }, []);


  const respondToEventMulti = useCallback((eventId: string, responses: import("@/engine/types").EventResponse[]): boolean => {
    // applyEventMultiResponses applies each choice's effects in order and, when
    // the event is a biosphere/ecology crisis, rebalances the originating biome
    // and opens a calm window — the same treatment respondToEvent and
    // dismissEvent apply — so a resolved crisis does not re-fire via a sibling
    // event. Extracted to engine/eventResolution.ts so the biome-resolution
    // wiring is unit-testable without mounting the provider.
    let accepted = false;
    setState((prev) => {
      if (responses.length === 0 || !prev.activeEvents.some((event) => event.id === eventId)) return prev;
      accepted = true;
      return applyEventMultiResponses(prev, eventId, responses);
    });
    return accepted;
  }, []);

  const launchStrike = useCallback((targetId: string, attackTypeId: string, targetCategoryId: string, loadout?: Loadout): import("@/engine/strikeData").StrikeResult | null => {
    const atkDef = ATTACK_TYPES.find((a) => a.id === attackTypeId);
    const tgtDef = TARGET_CATEGORIES.find((t) => t.id === targetCategoryId);
    if (!atkDef || !tgtDef) return null;

    const cur = stateRef.current;
    const r = cur.resources;
    if (r.credits < atkDef.creditsCost || r.ammo < atkDef.ammoCost || r.fuel < atkDef.fuelCost) return null;

    const defaultInfra: FactionInfrastructure = { military: 80, walls: 80, fuel: 80, civilian: 80 };
    const faction = cur.factions.find((f) => f.id === targetId);
    const megacity = (cur.externalMegacities ?? []).find((m) => m.id === targetId);
    const township = (cur.townships ?? []).find((t) => t.id === targetId);
    const entity = faction ?? megacity ?? township;
    if (!entity) return null;

    // Verify the loadout's selected units are actually available on the live state
    // (guards against stale picker selections after a tick recruited or lost units).
    // If the caller supplied a loadout we honor that decision: an empty validated
    // loadout means "the units the player picked are no longer available" and we
    // must NOT silently swap in a full-army strike — that would betray the
    // player's force-composition choice.
    let effectiveLoadout: Loadout | null = null;
    const loadoutSupplied = !!loadout && Object.keys(loadout).length > 0;
    if (loadoutSupplied) {
      const validated: Loadout = {};
      const liveUnits = cur.units as Record<string, number>;
      for (const [key, count] of Object.entries(loadout!)) {
        if (!count || count <= 0) continue;
        const have = Math.max(0, Math.floor(liveUnits[key] ?? 0));
        const take = Math.min(have, Math.floor(count));
        if (take > 0) validated[key] = take;
      }
      effectiveLoadout = validated;
    }

    const playerStrength = effectiveLoadout
      ? computeLoadoutStrength(effectiveLoadout)
      : Object.values(cur.units).reduce((s, v) => s + (typeof v === "number" ? Math.max(0, v) : 0), 0);
    const deployedCount = effectiveLoadout
      ? loadoutTotalUnits(effectiveLoadout)
      : Object.values(cur.units).reduce((s, v) => s + (typeof v === "number" ? Math.max(0, v) : 0), 0);
    // Loadout-driven strikes still need to clear the attack's minUnits floor.
    // Standoff weapons (missile_strike etc.) declare minUnits = 0, so they may
    // launch with an empty deployment.
    if (deployedCount < atkDef.minUnits) return null;
    // If a loadout was supplied but validated to empty AND the attack actually
    // needs forces on the ground, refuse rather than silently launching naked.
    if (loadoutSupplied && deployedCount === 0 && atkDef.minUnits > 0) return null;

    const currentInfra = entity.infrastructure ?? { ...defaultInfra };
    const targetName = entity.name;
    const targetDefense = currentInfra.military + currentInfra.walls;

    const composition = effectiveLoadout ? getCompositionShares(effectiveLoadout) : undefined;
    const result = resolveStrike(atkDef, tgtDef, playerStrength, targetDefense, currentInfra, composition, deployedCount);

    const newInfra: FactionInfrastructure = {
      military: Math.max(0, currentInfra.military - (result.damageDealt.military ?? 0)),
      walls: Math.max(0, currentInfra.walls - (result.damageDealt.walls ?? 0)),
      fuel: Math.max(0, currentInfra.fuel - (result.damageDealt.fuel ?? 0)),
      civilian: Math.max(0, currentInfra.civilian - (result.damageDealt.civilian ?? 0)),
    };

    const damageReport = Object.entries(result.damageDealt)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k.toUpperCase()}: -${v}`)
      .join(" | ");

    const statusLine = result.intercepted
      ? "STATUS: INTERCEPTED — Strike failed to reach target."
      : `STATUS: ${result.success ? "HIT CONFIRMED" : "PARTIAL MISS"}`;

    const avgInfra = (newInfra.military + newInfra.walls + newInfra.fuel + newInfra.civilian) / 4;
    const rubbleLine = avgInfra <= 5 ? "\n\n⚠ TARGET REDUCED TO RUBBLE ⚠" : "";

    const loadoutLine = effectiveLoadout
      ? `\n\nFORCE COMPOSITION:\n  ${formatLoadoutSummary(effectiveLoadout)}\n  Total deployed: ${loadoutTotalUnits(effectiveLoadout)}  ·  Combat strength: ${playerStrength}`
      : "";

    const body = `TARGET: ${targetName}\nATTACK: ${atkDef.name}\nOBJECTIVE: ${tgtDef.name}\n\n${statusLine}\n\n${result.narrative}${loadoutLine}\n\n--- DAMAGE REPORT ---\n${damageReport || "No damage dealt"}\n\nOur Casualties: ${result.attackerCasualties}\nCivilian Casualties: ${result.civilianCasualties.toLocaleString()}\n\nTarget Infrastructure:\n  Military: ${newInfra.military}/100\n  Walls: ${newInfra.walls}/100\n  Fuel: ${newInfra.fuel}/100\n  Civilian: ${newInfra.civilian}/100${rubbleLine}`;

    const msgId = `strike-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const loyaltyDrop = Math.round(result.diplomaticFallout * 0.5);
    const threatIncrease = Math.round(result.diplomaticFallout * 0.8);

    setState((prev) => {
      const message: import("@/engine/types").GameMessage = {
        id: msgId,
        timestamp: prev.gameDate ?? { year: 2030, month: 1, day: 1, hour: 0 },
        tick: prev.totalTicks,
        category: "alert" as const,
        title: result.intercepted ? `STRIKE INTERCEPTED — ${targetName}` : `STRIKE REPORT — ${targetName}`,
        body,
        read: false,
        priority: result.targetRubble ? "critical" : result.civilianCasualties > 500 ? "high" : "normal",
      };

      const strikeRecord: StrikeRecord = {
        id: msgId,
        tick: prev.totalTicks,
        timestamp: prev.gameDate ?? { year: 2030, month: 1, day: 1, hour: 0 },
        attackerId: "player",
        targetId,
        targetName,
        attackType: attackTypeId,
        targetCategory: targetCategoryId,
        success: result.success && !result.intercepted,
        intercepted: result.intercepted,
        damageDealt: result.damageDealt,
        attackerCasualties: result.attackerCasualties,
        civilianCasualties: result.civilianCasualties,
        narrative: result.narrative,
      };

      const totalInfraDamage = (result.damageDealt.military ?? 0) + (result.damageDealt.walls ?? 0) + (result.damageDealt.fuel ?? 0) + (result.damageDealt.civilian ?? 0);
      const cityHealthDrop = Math.round(totalInfraDamage * 0.35) + Math.round(result.civilianCasualties / 200);
      const attritionRise = Math.round(totalInfraDamage * 0.2) + (result.success ? 4 : 1);

      const applyInfra = <T extends { infrastructure?: FactionInfrastructure }>(e: T): T => {
        const cur = (e as { cityHealth?: number; attrition?: number; population?: number });
        return {
          ...e,
          infrastructure: newInfra,
          cityHealth: Math.max(0, Math.min(100, (cur.cityHealth ?? 100) - cityHealthDrop)),
          attrition: Math.max(0, Math.min(100, (cur.attrition ?? 0) + attritionRise)),
          population: Math.max(0, (cur.population ?? 0) - result.civilianCasualties),
        } as T;
      };

      // Deduct attacker casualties from the actual deployed loadout if one was
      // supplied; otherwise the legacy global pool stays untouched (parity with
      // prior behavior).
      let nextUnits = prev.units;
      if (effectiveLoadout && result.attackerCasualties > 0) {
        const liveUnitsRecord = prev.units as Record<string, number>;
        const { updated } = deductCasualties(liveUnitsRecord, effectiveLoadout, result.attackerCasualties);
        nextUnits = updated as typeof prev.units;
      }

      // Remember the chosen loadout for next time the player launches the
      // same attack type. Stored keyed by attackTypeId (which is also the key
      // shared with the diplomatic-action mapping, so e.g. "missile_strike"
      // covers both Strike Center and the rocket-strike diplomatic action).
      const nextSavedLoadouts = effectiveLoadout && Object.keys(effectiveLoadout).length > 0
        ? { ...(prev.savedLoadouts ?? {}), [attackTypeId]: { ...effectiveLoadout } }
        : prev.savedLoadouts;

      const nextState = {
        ...prev,
        units: nextUnits,
        resources: {
          ...prev.resources,
          credits: prev.resources.credits - atkDef.creditsCost,
          ammo: Math.max(0, prev.resources.ammo - atkDef.ammoCost),
          fuel: Math.max(0, prev.resources.fuel - atkDef.fuelCost),
        },
        messages: [message, ...prev.messages].slice(0, ARRAY_CAPS.messages),
        strikeHistory: [strikeRecord, ...(prev.strikeHistory ?? [])].slice(0, ARRAY_CAPS.strikeHistory),
        savedLoadouts: nextSavedLoadouts,
        factions: prev.factions.map((f) =>
          f.id === targetId
            ? { ...applyInfra(f), loyalty: Math.max(0, f.loyalty - loyaltyDrop), threat: Math.min(100, f.threat + threatIncrease) }
            : { ...f, loyalty: Math.max(0, f.loyalty - Math.round(result.diplomaticFallout * 0.15)), threat: Math.min(100, f.threat + Math.round(result.diplomaticFallout * 0.1)) }
        ),
        externalMegacities: (prev.externalMegacities ?? []).map((m) =>
          m.id === targetId
            ? { ...applyInfra(m), loyalty: Math.max(0, m.loyalty - loyaltyDrop), threat: Math.min(100, m.threat + threatIncrease) }
            : { ...m, loyalty: Math.max(0, m.loyalty - Math.round(result.diplomaticFallout * 0.1)) }
        ),
        townships: (prev.townships ?? []).map((t) =>
          t.id === targetId
            ? { ...applyInfra(t), loyalty: Math.max(0, t.loyalty - loyaltyDrop), threat: Math.min(100, t.threat + threatIncrease) }
            : t
        ),
        cityStats: {
          ...prev.cityStats,
          happiness: Math.max(0, prev.cityStats.happiness - Math.round(result.civilianCasualties > 1000 ? 5 : result.civilianCasualties > 100 ? 2 : 0)),
          unrest: Math.min(100, prev.cityStats.unrest + Math.round(result.civilianCasualties > 1000 ? 8 : result.civilianCasualties > 100 ? 3 : 0)),
        },
      };
      return applyCoerciveBacklash(nextState, {
        actionId: attackTypeId,
        actionKey: msgId,
        targetId,
        targetName,
        scope: "targeted",
        audience: megacity || township ? "external" : "internal",
        label: atkDef.name,
        messageCap: ARRAY_CAPS.messages,
      });
    });

    return result;
  }, []);

  // ─── TECHNOLOGY RESEARCH ──────────────────────────────────────────────
  const startResearch = useCallback((techId: string): boolean => {
    const tech = TECH_MAP[techId];
    if (!tech) return false;
    const cur = stateRef.current;
    const check = canResearch(techId, cur.unlockedTechnologies, cur.addons);
    if (!check.available) return false;
    if (cur.activeResearch) return false;
    setState((prev) => ({
      ...prev,
      activeResearch: { techId, progress: 0, cost: tech.researchCost * RESEARCH_COST_MULTIPLIER },
    }));
    return true;
  }, []);

  const cancelResearch = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeResearch: null,
    }));
  }, []);

  const researchQueueCapacity = useMemo(() => {
    const bld = state.buildings as Record<string, number>;
    return 1 +
      (bld.advancedResearchLabs ?? 0) +
      (bld.quantumDataCenters ?? 0) +
      (bld.experimentalTechVaults ?? 0);
  }, [state.buildings]);

  const queueResearch = useCallback((techId: string): boolean => {
    const tech = TECH_MAP[techId];
    if (!tech) return false;
    let added = false;
    setState((prev) => {
      if (!canResearch(techId, prev.unlockedTechnologies, prev.addons).available) return prev;
      if (prev.activeResearch?.techId === techId) return prev;
      const q = prev.researchQueue ?? [];
      if (q.includes(techId)) return prev;
      const bld = prev.buildings as Record<string, number>;
      const cap = 1 + (bld.advancedResearchLabs ?? 0) + (bld.quantumDataCenters ?? 0) + (bld.experimentalTechVaults ?? 0);
      if (q.length >= cap) return prev;
      added = true;
      return { ...prev, researchQueue: [...q, techId] };
    });
    return added;
  }, []);

  const removeFromQueue = useCallback((techId: string) => {
    setState((prev) => ({
      ...prev,
      researchQueue: (prev.researchQueue ?? []).filter((id) => id !== techId),
    }));
  }, []);

  const reorderQueue = useCallback((from: number, to: number) => {
    setState((prev) => {
      const q = [...(prev.researchQueue ?? [])];
      if (from < 0 || from >= q.length || to < 0 || to >= q.length) return prev;
      const [item] = q.splice(from, 1);
      q.splice(to, 0, item);
      return { ...prev, researchQueue: q };
    });
  }, []);

  const toggleAutoResearch = useCallback(() => {
    setState((prev) => ({ ...prev, autoResearch: !prev.autoResearch }));
  }, []);

  const dismissMessage = useCallback((messageId: string) => {
    const current = stateRef.current;
    const messages = current.messages ?? [];
    if (!messages.some((message) => message.id === messageId)) return;
    const dismissedMessageIds = Array.from(new Set([
      ...(current.dismissedMessageIds ?? []),
      messageId,
    ])).slice(-ARRAY_CAPS.dismissedMessageIds);
    const next = {
      ...current,
      messages: messages.filter((message) => message.id !== messageId),
      dismissedMessageIds,
    };
    // Keep the synchronous ref in step with the committed value so the
    // immediate save below cannot serialize the pre-dismissal inbox.
    stateRef.current = next;
    _liveStateRef.current = next;
    setState(next);
    void saveToSlot(activeSlotRef.current);
  }, [saveToSlot]);

  const markMessageRead = useCallback((messageId: string) => {
    setState((prev) => ({
      ...prev,
      messages: (prev.messages ?? []).map((m) =>
        m.id === messageId ? { ...m, read: true } : m
      ),
    }));
  }, []);

  const markAllMessagesRead = useCallback(() => {
    setState((prev) => ({
      ...prev,
      messages: (prev.messages ?? []).map((m) => ({ ...m, read: true })),
    }));
  }, []);

  const clearAllMessages = useCallback(() => {
    const current = stateRef.current;
    const dismissedMessageIds = Array.from(new Set([
      ...(current.dismissedMessageIds ?? []),
      ...(current.messages ?? []).map((message) => message.id),
    ])).slice(-ARRAY_CAPS.dismissedMessageIds);
    const next = { ...current, messages: [], dismissedMessageIds };
    stateRef.current = next;
    _liveStateRef.current = next;
    setState(next);
    void saveToSlot(activeSlotRef.current);
  }, [saveToSlot]);

  const appointOfficer = useCallback((officerId: string, method: import("@/engine/types").AppointmentMethod) => {
    setState((prev) => {
      const year = prev.gameDate?.year ?? 0;
      const log = (text: string) => ({ year, text });
      return {
        ...prev,
        officers: (prev.officers ?? []).map((o) => {
          if (o.id !== officerId) return o;
          const careerLog = [...(o.careerLog ?? []), log(`Appointed (${method}).`)];
          return {
            ...o,
            appointed: true,
            appointmentMethod: method,
            appointedYear: year,
            yearsServed: 0,
            careerLog: careerLog.slice(-24),
          };
        }),
      };
    });
  }, []);

  const dismissOfficer = useCallback((officerId: string) => {
    setState((prev) => {
      const year = prev.gameDate?.year ?? 0;
      return {
        ...prev,
        officers: (prev.officers ?? []).map((o) => {
          if (o.id !== officerId) return o;
          const careerLog = [
            ...(o.careerLog ?? []),
            { year, text: `Dismissed after ${o.yearsServed ?? 0} years of service.` },
          ];
          return {
            ...o,
            appointed: false,
            appointmentMethod: null,
            exitYear: year,
            exitReason: "dismissed" as const,
            careerLog: careerLog.slice(-24),
          };
        }),
      };
    });
  }, []);

  const autoFillVacancies = useCallback((doctrineId: import("@/engine/types").OfficerAutoFillDoctrineId) => {
    const result = applyOfficerAutoFillDoctrine(stateRef.current, doctrineId);
    if (result.ok) {
      stateRef.current = result.next;
      _liveStateRef.current = result.next;
      setState(result.next);
    }
    return result;
  }, []);

  const performOfficerAction = useCallback(
    (officerId: string, action: OfficerActionId): { ok: boolean; reason?: string } => {
      let result: { ok: boolean; reason?: string } = { ok: false, reason: "Officer not found." };
      setState((prev) => {
        const txn = performOfficerActionTransaction(prev, officerId, action);
        if (!txn.ok) {
          result = { ok: false, reason: txn.reason };
          return prev;
        }
        result = { ok: true };
        return { ...prev, ...txn.next };
      });
      return result;
    },
    [],
  );

  const performBlackMarketPurchaseAction = useCallback(
    (item: BlackMarketItem): BlackMarketPurchaseResult => {
      let result: BlackMarketPurchaseResult = { ok: false, reason: "Purchase unavailable." };
      setState((prev) => {
        // The browser regression can pin either real outcome without changing
        // normal gameplay randomness. The engine still receives its normal
        // injectable RNG, which keeps this branch fixture-only.
        const forcedOutcome = blackMarketAuditE2EOutcome();
        const fixtureRng =
          forcedOutcome === "delivered"
            ? () => 1
            : forcedOutcome === "seized"
              ? () => 0
              : undefined;
        result = performBlackMarketPurchase(prev, item, fixtureRng);
        return result.ok ? { ...prev, ...result.next } : prev;
      });
      return result;
    },
    [],
  );

  const toggleCheat = useCallback((cheat: string) => {
    setState((prev) => ({
      ...prev,
      cheats: { ...prev.cheats, [cheat]: !(prev.cheats as Record<string, boolean>)[cheat] },
    }));
  }, []);

  const cancelTradeAgreement = useCallback((agreementId: string) => {
    setState((prev) => ({
      ...prev,
      tradeAgreements: (prev.tradeAgreements ?? []).map((a) =>
        a.id === agreementId ? { ...a, status: "cancelled" as const } : a
      ),
    }));
  }, []);

  const cancelJointProject = useCallback((projectId: string) => {
    setState((prev) => ({
      ...prev,
      jointProjects: (prev.jointProjects ?? []).map((p) =>
        p.id === projectId ? { ...p, status: "cancelled" as const } : p
      ),
    }));
  }, []);

  const cancelDiplomaticPact = useCallback((pactId: string) => {
    setState((prev) => ({
      ...prev,
      diplomaticPacts: (prev.diplomaticPacts ?? []).map((p) =>
        p.id === pactId ? { ...p, status: "broken" as const } : p
      ),
    }));
  }, []);

  const resolveIncidentAction = useCallback((incidentId: string, responseId: string) => {
    setState((prev) => {
      const { resolveIncident: ri } = require("@/engine/diplomacyAdvanced");
      const updates = ri(prev, incidentId, responseId);
      return { ...prev, ...updates };
    });
  }, []);

  const assignEnvoyAction = useCallback((targetId: string, targetName: string): boolean => {
    const cur = stateRef.current;
    const { generateEnvoy, getDefaultAdvancedState } = require("@/engine/diplomacyAdvanced");
    const curAdv = cur.diplomacyAdvanced ?? getDefaultAdvancedState();
    if (curAdv.envoys.length >= 10) return false;
    if (curAdv.envoys.some((e: any) => e.targetId === targetId)) return false;
    setState((prev) => {
      const adv = { ...(prev.diplomacyAdvanced ?? getDefaultAdvancedState()) };
      if (adv.envoys.length >= 10) return prev;
      if (adv.envoys.some((e: any) => e.targetId === targetId)) return prev;
      const envoy = generateEnvoy(targetId, targetName);
      envoy.assignedTick = prev.totalTicks;
      adv.envoys = [...adv.envoys, envoy];
      return { ...prev, diplomacyAdvanced: adv };
    });
    return true;
  }, []);

  const recallEnvoyAction = useCallback((envoyId: string) => {
    setState((prev) => {
      const { getDefaultAdvancedState } = require("@/engine/diplomacyAdvanced");
      const adv = { ...(prev.diplomacyAdvanced ?? getDefaultAdvancedState()) };
      adv.envoys = adv.envoys.filter((e: any) => e.id !== envoyId);
      return { ...prev, diplomacyAdvanced: adv };
    });
  }, []);

  const startNegotiationAction = useCallback((partnerId: string, partnerName: string): boolean => {
    const cur = stateRef.current;
    const { maybeStartNegotiation, getDefaultAdvancedState } = require("@/engine/diplomacyAdvanced");
    const neg = maybeStartNegotiation(cur, partnerId, partnerName);
    if (!neg) return false;
    setState((prev) => {
      const adv = { ...(prev.diplomacyAdvanced ?? getDefaultAdvancedState()) };
      const neg2 = maybeStartNegotiation(prev, partnerId, partnerName);
      if (!neg2) return prev;
      adv.negotiations = [neg2, ...adv.negotiations].slice(0, 10);
      return { ...prev, diplomacyAdvanced: adv };
    });
    return true;
  }, []);

  const resolveNegotiationStepAction = useCallback((negotiationId: string, choiceId: string) => {
    setState((prev) => {
      const { resolveNegotiationChoice } = require("@/engine/diplomacyAdvanced");
      const updates = resolveNegotiationChoice(prev, negotiationId, choiceId);
      return { ...prev, ...updates };
    });
  }, []);

  const declareWarAdvancedAction = useCallback((targetId: string, targetName: string) => {
    setState((prev) => {
      const { startWar, getDefaultAdvancedState } = require("@/engine/diplomacyAdvanced");
      const adv = { ...(prev.diplomacyAdvanced ?? getDefaultAdvancedState()) };
      if (adv.wars.some((w: any) => w.belligerents.includes(targetId))) return prev;
      const war = startWar(prev, targetId, targetName);
      adv.wars = [...adv.wars, war];
      adv.totalWars++;
      // Task #493: a declaration of war is front-page material.
      return {
        ...prev,
        diplomacyAdvanced: adv,
        newsFeed: pushNewsItem(prev.newsFeed, warDeclaredNews(prev, targetId, targetName)),
      };
    });
  }, []);

  const proposePeaceAction = useCallback((warId: string): boolean => {
    const cur = stateRef.current;
    const { startPeaceConference, getDefaultAdvancedState } = require("@/engine/diplomacyAdvanced");
    const conference = startPeaceConference(cur, warId);
    if (!conference) return false;
    setState((prev) => {
      const conf2 = startPeaceConference(prev, warId);
      if (!conf2) return prev;
      const adv = { ...(prev.diplomacyAdvanced ?? getDefaultAdvancedState()) };
      adv.peaceConferences = [conf2, ...adv.peaceConferences].slice(0, 5);
      adv.totalPeaceConferences++;
      return { ...prev, diplomacyAdvanced: adv };
    });
    return true;
  }, []);

  const acceptPeaceDemandAction = useCallback((conferenceId: string, demandId: string) => {
    setState((prev) => {
      const { getDefaultAdvancedState } = require("@/engine/diplomacyAdvanced");
      const adv = { ...(prev.diplomacyAdvanced ?? getDefaultAdvancedState()) };
      const conf = adv.peaceConferences.find((c: any) => c.id === conferenceId);
      if (!conf) return prev;
      const demand = conf.demands.find((d: any) => d.id === demandId);
      if (demand) demand.accepted = true;
      return { ...prev, diplomacyAdvanced: adv };
    });
  }, []);

  const rejectPeaceDemandAction = useCallback((conferenceId: string, demandId: string) => {
    setState((prev) => {
      const { getDefaultAdvancedState } = require("@/engine/diplomacyAdvanced");
      const adv = { ...(prev.diplomacyAdvanced ?? getDefaultAdvancedState()) };
      const conf = adv.peaceConferences.find((c: any) => c.id === conferenceId);
      if (!conf) return prev;
      const demand = conf.demands.find((d: any) => d.id === demandId);
      if (demand) demand.accepted = false;
      return { ...prev, diplomacyAdvanced: adv };
    });
  }, []);

  const concludePeaceAction = useCallback((conferenceId: string) => {
    setState((prev) => {
      const { getDefaultAdvancedState } = require("@/engine/diplomacyAdvanced");
      const adv = { ...(prev.diplomacyAdvanced ?? getDefaultAdvancedState()) };
      const conf = adv.peaceConferences.find((c: any) => c.id === conferenceId);
      if (!conf) return prev;
      const acceptedCount = conf.demands.filter((d: any) => d.accepted).length;
      if (acceptedCount >= Math.ceil(conf.demands.length / 2)) {
        conf.status = "accepted";
        // Task #493: capture the war before it is filtered out so the peace
        // headline can name the enemy.
        const endedWar = adv.wars.find((w: any) => w.id === conf.warId);
        if (endedWar) {
          const { archiveWarHistory } = require("@/engine/diplomacyAdvanced") as typeof import("@/engine/diplomacyAdvanced");
          adv.concludedWars = archiveWarHistory(adv, [endedWar], prev.totalTicks, "Negotiated peace").concludedWars;
        }
        adv.wars = adv.wars.filter((w: any) => w.id !== conf.warId);
        const enemyName = endedWar
          ? (endedWar.belligerentNames.find((n: string) => n !== "MegaCity") ?? endedWar.belligerentNames[1])
          : null;
        return {
          ...prev,
          diplomacyAdvanced: adv,
          ...(endedWar && enemyName
            ? { newsFeed: pushNewsItem(prev.newsFeed, warPeaceNews(prev, endedWar.id, enemyName)) }
            : {}),
        };
      } else {
        conf.status = "collapsed";
      }
      return { ...prev, diplomacyAdvanced: adv };
    });
  }, []);

  const toggleAddon = useCallback((addonId: string) => {
    setState((prev) => {
      const addons = { ...(prev.addons ?? {}) };
      addons[addonId] = !addons[addonId];
      const next = { ...prev, addons };
      if (addonId === "big-brother") {
        if (addons["big-brother"]) {
          const factions = [...(next.factions ?? [])];
          if (!factions.find((f) => f.id === "inner-party")) {
            factions.push({
              ...INNER_PARTY_FACTION,
              loyalty: 50,
              threat: 30,
              influence: 20,
            });
            next.factions = factions;
          }
        } else {
          next.activePolicies = (next.activePolicies ?? []).filter((id) => !isBBContentId(id));
          next.activeEdicts = (next.activeEdicts ?? []).filter((ae) => !isBBContentId(ae.edictId));
          next.factions = (next.factions ?? []).map((f) =>
            f.id === "inner-party" ? { ...f, isActive: false } : f
          );
        }
      }
      return next;
    });
  }, []);

  const toggleAutoConstruction = useCallback(() => {
    setState((prev) => {
      const config = prev.autoConstruction ?? { enabled: false, budgetPerTick: 50000, priorities: ["power", "water", "housing", "food"], lastBuildTick: 0 };
      return { ...prev, autoConstruction: { ...config, enabled: !config.enabled } };
    });
  }, []);

  const setAutoConstructionConfig = useCallback((updates: Partial<import("@/engine/autoConstruction").AutoConstructionConfig>) => {
    setState((prev) => {
      const config = prev.autoConstruction ?? { enabled: false, budgetPerTick: 50000, priorities: ["power", "water", "housing", "food"], lastBuildTick: 0 };
      return { ...prev, autoConstruction: { ...config, ...updates } };
    });
  }, []);

  // Auto-Hire Recruitment (Task #123). Per-domain config persistence.
  // Mode is owned by autoManagers.modes.recruit (set via Advisor Briefings),
  // so we only own the budget/target/priority knobs here.
  const setAutoRecruitConfig = useCallback((updates: Partial<import("@/engine/autoRecruit").AutoRecruitConfig>) => {
    setState((prev) => {
      const config = prev.autoRecruit ?? createDefaultAutoRecruitConfig();
      return { ...prev, autoRecruit: { ...config, ...updates } };
    });
  }, []);

  // ── AUTO-MANAGER FOUNDATIONS (Task #122) ──────────────────────────
  // Thin wrappers around engine/autoManagers helpers. Per-domain
  // auto-managers (Phase 1+) read/mutate state.autoManagers directly
  // from inside their tick processors; the actions below are only the
  // player-facing controls surfaced in the Advisor Briefings UI.
  const setAutoManagerModeAction = useCallback(
    (domain: import("@/engine/autoManagers").AutoManagerDomain, mode: import("@/engine/autoManagers").AutoManagerMode) => {
      setState((prev) => {
        const am = prev.autoManagers ?? { modes: {}, queue: [], pauseAllAct: false, alwaysAllow: [], snoozedKinds: [], lastDecisionTick: {} };
        // Honor-mode interlock at the mutation point: if honor mode
        // is active, ACT is coerced to SUGGEST so even non-UI callers
        // (console, scripts, future automations) can never persist
        // ACT under honor mode.
        const coerced: import("@/engine/autoManagers").AutoManagerMode =
          prev.honorMode === true && mode === "act" ? "suggest" : mode;
        return { ...prev, autoManagers: { ...am, modes: { ...am.modes, [domain]: coerced } } };
      });
    },
    [],
  );

  const setAutoManagerPauseAllAct = useCallback((paused: boolean) => {
    setState((prev) => {
      const am = prev.autoManagers ?? { modes: {}, queue: [], pauseAllAct: false, alwaysAllow: [], snoozedKinds: [], lastDecisionTick: {} };
      return { ...prev, autoManagers: { ...am, pauseAllAct: paused } };
    });
  }, []);

  const acceptAutoManagerProposal = useCallback((proposalId: string) => {
    // Single source of truth lives in engine/acceptProposal so the React
    // glue and the auto-manager tests exercise the exact same accept flow
    // (apply the domain handler → dequeue → stamp lastDecisionTick).
    setState((prev) => applyAcceptProposal(prev, proposalId));
  }, []);

  const declineAutoManagerProposal = useCallback((proposalId: string) => {
    // Single source of truth lives in engine/acceptProposal so the React
    // glue and the auto-manager tests exercise the exact same decline flow
    // (dequeue → stamp lastDecisionTick, no domain handler).
    setState((prev) => applyDeclineProposal(prev, proposalId));
  }, []);

  const snoozeAutoManagerProposal = useCallback((proposalId: string, ticks: number) => {
    // Single source of truth lives in engine/acceptProposal so the React
    // glue and the auto-manager tests exercise the exact same snooze flow
    // (dequeue → replace snoozedKinds entry with untilTick = now + ticks).
    setState((prev) => applySnoozeProposal(prev, proposalId, ticks));
  }, []);

  const setAutoManagerAlwaysAllow = useCallback(
    (kind: import("@/engine/autoManagers").AutoManagerProposalKind, allow: boolean) => {
      setState((prev) => {
        const am = prev.autoManagers ?? { modes: {}, queue: [], pauseAllAct: false, alwaysAllow: [], snoozedKinds: [], lastDecisionTick: {} };
        const alwaysAllow = am.alwaysAllow.filter((k) => k !== kind);
        if (allow) alwaysAllow.push(kind);
        return { ...prev, autoManagers: { ...am, alwaysAllow } };
      });
    },
    [],
  );

  const toggleMilitaryPolicy = useCallback((policyId: string) => {
    setState((prev) => {
      const mil = prev.militaryOverhaul ?? createDefaultMilitaryState();
      const active = [...mil.activePolicies];
      const pol = MILITARY_POLICIES.find((p) => p.id === policyId);
      const idx = active.indexOf(policyId);
      if (idx >= 0) {
        active.splice(idx, 1);
      } else {
        if (pol?.exclusive) {
          for (const ex of pol.exclusive) {
            const ei = active.indexOf(ex);
            if (ei >= 0) active.splice(ei, 1);
          }
        }
        active.push(policyId);
      }
      return { ...prev, militaryOverhaul: { ...mil, activePolicies: active } };
    });
  }, []);

  const startMilitaryResearch = useCallback((techId: string): boolean => {
    const cur = stateRef.current;
    const mil = cur.militaryOverhaul ?? createDefaultMilitaryState();
    if (mil.completedResearch.includes(techId)) return false;
    if (mil.activeResearch) return false;
    const tech = MILITARY_RESEARCH.find((t) => t.id === techId);
    if (!tech) return false;
    if (tech.prerequisite && !mil.completedResearch.includes(tech.prerequisite)) return false;
    if (cur.resources.credits < tech.cost) return false;
    setState((prev) => {
      const m = prev.militaryOverhaul ?? createDefaultMilitaryState();
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits - tech.cost },
        militaryOverhaul: { ...m, activeResearch: { techId, progress: 0, totalTicks: tech.ticksToComplete }, activeResearchId: techId, researchProgress: 0 },
      };
    });
    playSound("credits_loss");
    playHaptic("medium");
    return true;
  }, []);

  const launchMission = useCallback((missionId: string): boolean => {
    const cur = stateRef.current;
    const mil = cur.militaryOverhaul ?? createDefaultMilitaryState();
    const def = MILITARY_MISSIONS.find((m) => m.id === missionId);
    if (!def) return false;
    if (mil.activeMissions.length >= 3) return false;
    const r = cur.resources;
    if (r.credits < def.creditsCost || r.ammo < def.ammoCost || r.fuel < def.fuelCost) return false;
    if (mil.standingArmy.totalStrength - mil.standingArmy.deployedOnMission < def.unitCost) return false;
    setState((prev) => {
      const m = prev.militaryOverhaul ?? createDefaultMilitaryState();
      const mission: ActiveMission = {
        id: `mission-${Date.now()}`,
        missionId: def.id,
        name: def.name,
        unitsDeployed: def.unitCost,
        ticksRemaining: def.duration,
        totalTicks: def.duration,
        status: "active",
      };
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits - def.creditsCost, ammo: prev.resources.ammo - def.ammoCost, fuel: prev.resources.fuel - def.fuelCost },
        militaryOverhaul: {
          ...m,
          activeMissions: [...m.activeMissions, mission],
          standingArmy: { ...m.standingArmy, deployedOnMission: m.standingArmy.deployedOnMission + def.unitCost },
        },
      };
    });
    playSound("credits_loss");
    playHaptic("medium");
    return true;
  }, []);

  const assignToArmy = useCallback((branch: string, count: number) => {
    setState((prev) => {
      const mil = prev.militaryOverhaul ?? createDefaultMilitaryState();
      const army = { ...mil.standingArmy };
      const key = branch as keyof typeof army;
      if (typeof army[key] !== "number") return prev;
      (army as any)[key] = Math.max(0, (army[key] as number) + count);
      army.totalStrength = army.infantry + army.armor * 3 + army.artillery * 4 + army.airSupport * 5 + army.specialOps * 2 + army.support;
      return { ...prev, militaryOverhaul: { ...mil, standingArmy: army } };
    });
  }, []);

  // Task #381 — build a military installation. Task #500: now a timed order
  // (paid upfront here); logistics.installationsBuilt only increments when
  // runTick finishes the construction timer, after which the tick processor
  // derives garrison demand, manned-defense bonus and supply production.
  const buildMilitaryInstallation = useCallback((buildingId: string, cost: number): boolean => {
    let success = false;
    setState((prev) => {
      if (prev.resources.credits < cost) return prev;
      const def = MILITARY_BUILDINGS.find((d) => d.id === buildingId);
      if (!def) return prev;
      if (def.academy) {
        const academy = getAcademy(buildingId);
        if (!academy || !academyPrerequisitesMet(prev, academy)) return prev;
      }
      success = true;
      const order = createPendingConstruction({
        kind: "military",
        buildingKey: buildingId,
        label: def?.name ?? humanizeBuildingKey(buildingId),
        count: 1,
        orderedTick: prev.totalTicks,
        state: prev,
      });
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits - cost },
        pendingConstructions: [...(prev.pendingConstructions ?? []), order],
      };
    });
    if (success) { playSound("credits_loss"); playHaptic("medium"); }
    return success;
  }, []);

  const startAcademyCourse = useCallback((courseId: string): boolean => {
    let success = false;
    setState((prev) => {
      const course = getAcademyCourse(courseId);
      const order = course ? createAcademyCourseOrder(prev, courseId) : null;
      if (!course || !order) return prev;
      const nextResources = { ...prev.resources };
      nextResources.credits -= course.credits;
      nextResources.steel -= course.steel;
      for (const [key, amount] of Object.entries(course.supplies)) {
        const resourceKey = key as keyof typeof nextResources;
        nextResources[resourceKey] = Math.max(0, (nextResources[resourceKey] ?? 0) - (amount ?? 0)) as never;
      }
      success = true;
      return {
        ...prev,
        resources: nextResources,
        pendingConstructions: [...(prev.pendingConstructions ?? []), order],
      };
    });
    if (success) { playSound("credits_loss"); playHaptic("medium"); }
    return success;
  }, []);

  const assignAcademyInstructor = useCallback((academyId: string): boolean => {
    let success = false;
    setState((prev) => {
      const academy = getAcademy(academyId);
      const mil = prev.militaryOverhaul ?? createDefaultMilitaryState();
      if (!academy || !academyPrerequisitesMet(prev, academy)) return prev;
      const current = mil.academies?.facilities?.[academyId] ?? { quality: academy.quality, instructors: [] };
      const built = mil.logistics?.installationsBuilt?.[academyId] ?? 0;
      if (current.instructors.length >= built) return prev;
      const assigned = new Set(Object.values(mil.academies?.facilities ?? {}).flatMap((facility) => facility.instructors));
      const ranks = ["cadet", "officer", "senior_officer", "director", "commissioner", "chief_director"];
      const minRank = ranks.indexOf(academy.instructorRank);
      const instructor = (prev.officers ?? []).find((officer) =>
        !officer.exitReason && !assigned.has(officer.id) && ranks.indexOf(officer.rank) >= minRank,
      );
      if (!instructor) return prev;
      success = true;
      return {
        ...prev,
        militaryOverhaul: {
          ...mil,
          academies: {
            ...(mil.academies ?? { facilities: {}, qualifications: {}, completedCourses: 0, graduationRate: 0, readinessBonus: 0 }),
            facilities: {
              ...(mil.academies?.facilities ?? {}),
              [academyId]: { ...current, instructors: [...current.instructors, instructor.id] },
            },
          },
        },
      };
    });
    if (success) playHaptic("light");
    return success;
  }, []);

  // Task #381 — set how scarce personnel are prioritised between crewing
  // vehicles and manning installations. Read by processMilitaryLogistics.
  const setMilitaryAllocationPriority = useCallback((priority: AllocationPriority) => {
    setState((prev) => {
      const mil = prev.militaryOverhaul ?? createDefaultMilitaryState();
      const log = mil.logistics ?? createDefaultLogisticsState();
      if (log.allocationPriority === priority) return prev;
      return { ...prev, militaryOverhaul: { ...mil, logistics: { ...log, allocationPriority: priority } } };
    });
    playHaptic("light");
  }, []);

  const issueDecree = useCallback((decreeId: string): boolean => {
    const cur = stateRef.current;
    const pol = cur.politics ?? createDefaultPoliticsState();
    const def = POLITICAL_DECREES.find((d) => d.id === decreeId);
    if (!def) return false;
    if (cur.resources.credits < def.cost) return false;
    const cd = pol.decreeCooldowns[decreeId] ?? 0;
    if (cd > cur.totalTicks) return false;
    // Effect application (incl. the officer-loyalty branch) lives in
    // engine/decrees.ts so the player-action path is testable — Task #492.
    setState((prev) => applyDecreeEffects(prev, def));
    return true;
  }, []);

  const appointInnerCircle = useCallback((officerId: string, role: import("@/engine/innerCircleData").InnerCircleRole): boolean => {
    const cur = stateRef.current;
    const ic = cur.innerCircle ?? createDefaultInnerCircleState();
    if (ic.members.length >= 6) return false;
    if (ic.members.find((m) => m.officerId === officerId)) return false;
    if (ic.members.find((m) => m.role === role)) return false;
    const officer = cur.officers.find((o) => o.id === officerId);
    if (!officer) return false;
    setState((prev) => {
      const circle = prev.innerCircle ?? createDefaultInnerCircleState();
      const member: InnerCircleMember = {
        officerId,
        role,
        level: 1,
        xp: 0,
        xpToNext: xpForLevel(2),
        perksUnlocked: [],
        appointed: prev.totalTicks,
      };
      return { ...prev, innerCircle: { ...circle, members: [...circle.members, member] } };
    });
    return true;
  }, []);

  const removeInnerCircle = useCallback((officerId: string) => {
    setState((prev) => {
      const ic = prev.innerCircle;
      if (!ic) return prev;
      return { ...prev, innerCircle: { ...ic, members: ic.members.filter((m) => m.officerId !== officerId) } };
    });
  }, []);

  const recruitBodyguard = useCallback((classId: BodyguardClass): boolean => {
    const cur = stateRef.current;
    const bg = cur.bodyguards ?? createDefaultBodyguardState();
    if (bg.roster.filter((b) => b.status !== "kia").length >= bg.maxSlots) return false;
    if (bg.roster.some((b) => b.classId === classId && b.status !== "kia")) return false;
    const def = BODYGUARD_DEFS.find((d) => d.classId === classId);
    if (!def) return false;
    if (def.requiredTech && !(cur.unlockedTechnologies ?? []).includes(def.requiredTech)) return false;
    if (def.requiredLevel && cur.player.level < def.requiredLevel) return false;
    if ((cur.resources?.credits ?? 0) < def.recruitCost) return false;
    setState((prev) => {
      const bgs = prev.bodyguards ?? createDefaultBodyguardState();
      const newGuard = createBodyguard(classId, prev.totalTicks);
      return {
        ...prev,
        resources: { ...prev.resources, credits: (prev.resources?.credits ?? 0) - def.recruitCost },
        bodyguards: { ...bgs, roster: [...bgs.roster, newGuard] },
      };
    });
    return true;
  }, []);

  const dismissBodyguard = useCallback((bodyguardId: string) => {
    setState((prev) => {
      const bgs = prev.bodyguards;
      if (!bgs) return prev;
      return { ...prev, bodyguards: { ...bgs, roster: bgs.roster.filter((b) => b.id !== bodyguardId) } };
    });
  }, []);

  const installSoftwareUpgrade = useCallback((upgradeId: string): boolean => {
    const cur = stateRef.current;
    const sw = cur.softwareUpgrades ?? createDefaultSoftwareUpgradeState();
    const nextTier = getNextTier(sw, upgradeId);
    if (nextTier === null) return false;
    const def = SOFTWARE_UPGRADES.find((u) => u.id === upgradeId);
    if (!def) return false;
    const tierDef = def.tiers.find((t) => t.tier === nextTier);
    if (!tierDef) return false;
    if (tierDef.requiredTech && !(cur.unlockedTechnologies ?? []).includes(tierDef.requiredTech)) return false;
    if ((cur.resources?.credits ?? 0) < tierDef.cost) return false;
    let success = false;
    setState((prev) => {
      const swState = prev.softwareUpgrades ?? createDefaultSoftwareUpgradeState();
      const prevTier = getNextTier(swState, upgradeId);
      if (prevTier === null || prevTier !== nextTier) return prev;
      if ((prev.resources?.credits ?? 0) < tierDef.cost) return prev;
      if (tierDef.requiredTech && !(prev.unlockedTechnologies ?? []).includes(tierDef.requiredTech)) return prev;
      success = true;
      return {
        ...prev,
        resources: { ...prev.resources, credits: (prev.resources?.credits ?? 0) - tierDef.cost },
        softwareUpgrades: {
          ...swState,
          installed: { ...swState.installed, [upgradeId]: nextTier },
          totalInstalled: swState.totalInstalled + 1,
          totalSpent: swState.totalSpent + tierDef.cost,
        },
      };
    });
    return success;
  }, []);

  const dismissAchievementReport = useCallback(() => { achQueueRef.current = []; setPendingAchievements([]); }, []);

  // ── Daily streak / weekly challenge / save export-import ────────────────
  const claimDailyBonus = useCallback((): { credits: number; research: number; streakAfter: number; message: string } | null => {
    let outcome: { credits: number; research: number; streakAfter: number; message: string } | null = null;
    setState((prev) => {
      const today = todayKey();
      const streak = prev.dailyStreak ?? { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null };
      if (!isDailyClaimAvailable(streak, today)) return prev;
      const { streak: nextStreak, reward } = applyDailyClaim(streak, today);
      outcome = {
        credits: reward.credits,
        research: reward.research,
        streakAfter: reward.streakAfter,
        message: reward.message,
      };
      const nextResources = {
        ...prev.resources,
        credits: (prev.resources?.credits ?? 0) + reward.credits,
      };
      const cityStats = prev.cityStats;
      const nextCityStats = {
        ...cityStats,
        researchProgress: Math.min(
          (cityStats.researchTarget ?? 100),
          (cityStats.researchProgress ?? 0) + reward.research,
        ),
      };
      return {
        ...prev,
        dailyStreak: nextStreak,
        resources: nextResources,
        cityStats: nextCityStats,
        totalCreditsEarned: (prev.totalCreditsEarned ?? 0) + reward.credits,
      };
    });
    return outcome;
  }, []);

  const ensureWeeklyChallengeFresh = useCallback((): void => {
    setState((prev) => {
      const fresh = refreshWeeklyChallenge(prev.weeklyChallenge, prev);
      // Only persist when the week actually rolled over (or there was no
      // challenge yet). Refreshing on the same week is a no-op so we skip
      // the state update to avoid re-baselining mid-week.
      if (
        prev.weeklyChallenge &&
        prev.weeklyChallenge.weekKey === fresh.weekKey &&
        prev.weeklyChallenge.templateId === fresh.templateId
      ) {
        return prev;
      }
      return { ...prev, weeklyChallenge: fresh };
    });
  }, []);

  const claimWeeklyChallenge = useCallback((): { credits: number; research: number; templateTitle: string } | null => {
    let outcome: { credits: number; research: number; templateTitle: string } | null = null;
    setState((prev) => {
      const challenge = prev.weeklyChallenge ? refreshWeeklyChallenge(prev.weeklyChallenge, prev) : refreshWeeklyChallenge(undefined, prev);
      // If the week rolled over (or the slot never had a challenge), persist
      // the freshly-baselined challenge into state even when the player can't
      // claim yet — otherwise every render re-derives a brand-new baseline
      // against the current counters and progress can never accrue.
      const challengeChanged =
        !prev.weeklyChallenge ||
        prev.weeklyChallenge.weekKey !== challenge.weekKey ||
        prev.weeklyChallenge.templateId !== challenge.templateId;
      if (challenge.claimed) {
        return challengeChanged ? { ...prev, weeklyChallenge: challenge } : prev;
      }
      if (!isWeeklyComplete(challenge, prev)) {
        return challengeChanged ? { ...prev, weeklyChallenge: challenge } : prev;
      }
      const tpl = getWeeklyTemplate(challenge);
      if (!tpl) return challengeChanged ? { ...prev, weeklyChallenge: challenge } : prev;
      outcome = { credits: tpl.rewardCredits, research: tpl.rewardResearch, templateTitle: tpl.title };
      const nextResources = {
        ...prev.resources,
        credits: (prev.resources?.credits ?? 0) + tpl.rewardCredits,
      };
      const cityStats = prev.cityStats;
      const nextCityStats = {
        ...cityStats,
        researchProgress: Math.min(
          (cityStats.researchTarget ?? 100),
          (cityStats.researchProgress ?? 0) + tpl.rewardResearch,
        ),
      };
      return {
        ...prev,
        weeklyChallenge: { ...challenge, claimed: true },
        resources: nextResources,
        cityStats: nextCityStats,
        totalCreditsEarned: (prev.totalCreditsEarned ?? 0) + tpl.rewardCredits,
        // Track lifetime weekly clears for achievements + stats screens.
        weeklyChallengesCompleted: (prev.weeklyChallengesCompleted ?? 0) + 1,
      };
    });
    return outcome;
  }, []);

  const refreshPersonalGoals = useCallback((): void => {
    setState((prev) => {
      const next = refreshPersonalGoalsEngine(prev.personalGoals, prev);
      if (
        prev.personalGoals
        && next.short?.templateId === prev.personalGoals.short?.templateId
        && next.mid?.templateId === prev.personalGoals.mid?.templateId
        && next.long?.templateId === prev.personalGoals.long?.templateId
      ) {
        return prev;
      }
      return { ...prev, personalGoals: next };
    });
  }, []);

  const claimPersonalGoal = useCallback((scope: PersonalGoalScope): { credits: number; xp: number; templateId: string } | null => {
    let outcome: { credits: number; xp: number; templateId: string } | null = null;
    setState((prev) => {
      const result = claimPersonalGoalEngine(prev.personalGoals, prev, scope);
      if (!result) return prev;
      outcome = { credits: result.reward.credits, xp: result.reward.xp, templateId: result.templateId };
      // Apply credits + xp (with level-up loop matching tickProcessors).
      const nextResources = {
        ...prev.resources,
        credits: (prev.resources?.credits ?? 0) + result.reward.credits,
      };
      const player = { ...prev.player };
      player.xp = (player.xp ?? 0) + result.reward.xp;
      while (player.xp >= player.xpToNext && player.level < 50) {
        player.xp -= player.xpToNext;
        player.level += 1;
        player.xpToNext = personalGoalXpForLevel(player.level);
        player.attributePoints = (player.attributePoints ?? 0) + 1;
        if (player.level % 3 === 0) {
          player.skillPoints = (player.skillPoints ?? 0) + 1;
        }
      }
      return {
        ...prev,
        resources: nextResources,
        player,
        personalGoals: result.state,
        totalCreditsEarned: (prev.totalCreditsEarned ?? 0) + result.reward.credits,
      };
    });
    return outcome;
  }, []);

  const markChangelogSeen = useCallback(() => {
    setState((prev) => {
      if (prev.lastSeenVersion === APP_VERSION) return prev;
      return { ...prev, lastSeenVersion: APP_VERSION };
    });
  }, []);

  const exportSlot = useCallback(async (slot: number): Promise<{ json: string; suggestedName: string } | null> => {
    try {
      const slotKey = getSlotKey(slot);
      const raw = await AsyncStorage.getItem(slotKey);
      if (!raw) return null;
      const { json, valid } = unwrapSave(raw);
      if (!valid) {
        const backup = await AsyncStorage.getItem(slotKey + BACKUP_SUFFIX);
        if (backup) {
          const u = unwrapSave(backup);
          if (u.valid) {
            const stateObj = JSON.parse(u.json) as GameState;
            const exportJson = serializeSaveExport(stateObj, slot);
            const env = parseSaveImport(exportJson);
            if (env.ok) return { json: exportJson, suggestedName: suggestedSaveExportFileName(env.envelope) };
          }
        }
      }
      const stateObj = JSON.parse(json) as GameState;
      const exportJson = serializeSaveExport(stateObj, slot);
      const env = parseSaveImport(exportJson);
      if (!env.ok) return null;
      return { json: exportJson, suggestedName: suggestedSaveExportFileName(env.envelope) };
    } catch (e) {
      console.error("Export slot failed:", e);
      return null;
    }
  }, [getSlotKey]);

  const importSlot = useCallback(async (slot: number, json: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    const parsed = parseSaveImport(json);
    if (!parsed.ok) return parsed;
    try {
      const migrated = sanitizeState(migrateState(parsed.envelope.state));
      // Stamp into the chosen slot regardless of source.
      migrated.saveSlot = slot;
      const slotKey = getSlotKey(slot);
      await writeSlotSave(AsyncStorage, slotKey, migrated);
      await refreshSlotMetas();
      return { ok: true };
    } catch (e) {
      console.error("Import slot failed:", e);
      return { ok: false, error: "Failed to write imported save to disk." };
    }
  }, [getSlotKey, refreshSlotMetas]);

  // Browser-only export/import regression harness for renamed world locations.
  // The export phase writes only to the dedicated fixture namespace and keeps
  // the JSON export separately. The restore phase imports that JSON through the
  // real parse/migrate path, then reloads the isolated slot so the browser
  // assertion covers both persisted transport and player-facing surfaces.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = worldMapExportRestoreE2EPhase() ?? worldMapExportRestoreE2EQueryRef.current;
      if (phase !== "export" && phase !== "restore") return;
      void (async () => {
        if (phase === "export") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) {
            console.error("[worldMapExportRestoreE2E] fixture save failed");
            return;
          }
          const exported = await exportSlot(1);
          if (!exported) {
            console.error("[worldMapExportRestoreE2E] fixture export failed");
            return;
          }
          await AsyncStorage.setItem(WORLD_MAP_EXPORT_RESTORE_EXPORT_KEY, exported.json);
          return;
        }

        const exportedJson = await AsyncStorage.getItem(WORLD_MAP_EXPORT_RESTORE_EXPORT_KEY);
        if (!exportedJson) {
          console.error("[worldMapExportRestoreE2E] fixture export JSON missing");
          return;
        }
        const imported = await importSlot(1, exportedJson);
        if (!imported.ok) {
          console.error("[worldMapExportRestoreE2E] fixture import failed:", imported.error);
          return;
        }
        const loaded = await loadSlot(1);
        if (!loaded) console.error("[worldMapExportRestoreE2E] fixture restore failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [exportSlot, importSlot, isLoaded, loadSlot, saveToSlot]);

  const exportFullBackup = useCallback(async (): Promise<{ json: string; suggestedName: string; slotCount: number } | null> => {
    try {
      const slotEntries: { slot: number; state: GameState }[] = [];
      for (let i = 1; i <= MAX_SLOTS; i++) {
        const raw = await AsyncStorage.getItem(getSlotKey(i));
        if (!raw) continue;
        const { json, valid } = unwrapSave(raw);
        if (!valid) continue;
        try {
          slotEntries.push({ slot: i, state: JSON.parse(json) as GameState });
        } catch {
          // Skip unparseable slots so the rest of the backup still makes it out.
        }
      }
      if (slotEntries.length === 0) return null;
      // Settings live under a single AsyncStorage key managed by SettingsContext.
      let settings: Record<string, unknown> | null = null;
      try {
        const settingsRaw = await AsyncStorage.getItem("@megacity_settings");
        if (settingsRaw) settings = JSON.parse(settingsRaw);
      } catch {
        settings = null;
      }
      const backupJson = serializeFullBackup(slotEntries, settings);
      const env = parseFullBackup(backupJson);
      if (!env.ok) return null;
      return {
        json: backupJson,
        suggestedName: suggestedFullBackupFileName(env.envelope),
        slotCount: slotEntries.length,
      };
    } catch (e) {
      console.error("Export full backup failed:", e);
      return null;
    }
  }, [getSlotKey]);

  const importFullBackup = useCallback(async (json: string): Promise<{ ok: true; slotCount: number } | { ok: false; error: string }> => {
    const parsed = parseFullBackup(json);
    if (!parsed.ok) return parsed;
    try {
      let imported = 0;
      for (const entry of parsed.envelope.slots) {
        const migrated = sanitizeState(migrateState(entry.state));
        migrated.saveSlot = entry.slot;
        const slotKey = getSlotKey(entry.slot);
        await writeSlotSave(AsyncStorage, slotKey, migrated);
        imported += 1;
      }
      // Restore settings if the envelope carried any. We merge on top of
      // whatever's there rather than wholesale replacing so newly-introduced
      // settings keep their defaults.
      if (parsed.envelope.settings && typeof parsed.envelope.settings === "object") {
        try {
          const existingRaw = await AsyncStorage.getItem("@megacity_settings");
          const existing = existingRaw ? JSON.parse(existingRaw) : {};
          const merged = { ...existing, ...parsed.envelope.settings };
          // Task #191: route through atomicWriteSlot so a torn write
          // during full-backup restore can't silently wipe the player's
          // (just-merged) settings back to defaults on next launch.
          await atomicWriteSlot(AsyncStorage, "@megacity_settings", JSON.stringify(merged));
        } catch {
          // Settings restore is best-effort; ignore parse failures.
        }
      }
      await refreshSlotMetas();
      return { ok: true, slotCount: imported };
    } catch (e) {
      console.error("Import full backup failed:", e);
      return { ok: false, error: "Failed to write backup contents to disk." };
    }
  }, [getSlotKey, refreshSlotMetas]);

  // Browser-only full-backup regression harness for renamed world locations.
  // This deliberately uses a separate fixture namespace from the single-slot
  // harness above so the all-slots envelope and its restore path are covered
  // independently.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = worldMapExportRestoreE2EPhase() ?? worldMapExportRestoreE2EQueryRef.current;
      if (phase !== "full-backup-export" && phase !== "full-backup-restore") return;
      void (async () => {
        if (phase === "full-backup-export") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) {
            console.error("[worldMapExportRestoreE2E] fixture full-backup save failed");
            return;
          }
          const backup = await exportFullBackup();
          if (!backup) {
            console.error("[worldMapExportRestoreE2E] fixture full-backup export failed");
            return;
          }
          await AsyncStorage.setItem(WORLD_MAP_FULL_BACKUP_EXPORT_KEY, backup.json);
          return;
        }

        const exportedJson = await AsyncStorage.getItem(WORLD_MAP_FULL_BACKUP_EXPORT_KEY);
        if (!exportedJson) {
          console.error("[worldMapExportRestoreE2E] fixture full-backup export JSON missing");
          return;
        }
        const imported = await importFullBackup(exportedJson);
        if (!imported.ok) {
          console.error("[worldMapExportRestoreE2E] fixture full-backup import failed:", imported.error);
          return;
        }
        const loaded = await loadSlot(1);
        if (!loaded) console.error("[worldMapExportRestoreE2E] fixture full-backup restore failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [exportFullBackup, importFullBackup, isLoaded, loadSlot, saveToSlot]);

  // Browser-only Steam Cloud regression harness for renamed world locations.
  // The cloud bridge stores opaque bytes independently from local storage, so
  // this exercises the actual cloud restore/hydration path rather than the
  // export/import callbacks above.
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      const phase = worldMapExportRestoreE2EPhase() ?? worldMapExportRestoreE2EQueryRef.current;
      if (phase !== "cloud-save" && phase !== "cloud-load") return;
      if (worldMapCloudRestoreE2EPhaseRef.current === phase) return;
      worldMapCloudRestoreE2EPhaseRef.current = phase;

      void (async () => {
        if (phase === "cloud-save") {
          citySessionActiveRef.current = true;
          setIsCitySessionActive(true);
          const saved = await saveToSlot(1);
          if (!saved) console.error("[worldMapExportRestoreE2E] cloud fixture save failed");
          return;
        }

        const loaded = await loadSlot(1);
        if (!loaded) console.error("[worldMapExportRestoreE2E] cloud fixture restore failed");
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, loadSlot, saveToSlot]);

  const stateValue = useMemo<GameStateType>(() => ({
    state,
    globalAchievements,
    isLoaded,
    bootHydrationStatus,
    hasSave,
    activeSlot,
    slotMetas,
    offlineReport,
    turnRecap,
    pendingAchievements,
    activeProfile,
    allProfiles,
    researchQueueCapacity,
    lastSaveTime,
    lastSaveError,
    hasRecoverySnapshot,
    recoverySnapshotInfo,
    cloudSaveStatus,
    cloudSaveConflicts,
    lastTickErrors,
  }), [state, globalAchievements, isLoaded, bootHydrationStatus, hasSave, activeSlot, slotMetas, offlineReport, pendingAchievements, activeProfile, allProfiles, researchQueueCapacity, lastSaveTime, lastSaveError, hasRecoverySnapshot, recoverySnapshotInfo, cloudSaveStatus, cloudSaveConflicts, lastTickErrors, turnRecap]);

  // ─── ACTIONS CONTEXT ─────────────────────────────────────────────────
  // RULE FOR EVERY ACTION BELOW: this memo's dependency list is deliberately
  // tiny, so consumers receive the FIRST-render version of every callback
  // forever — even callbacks written with correct useCallback deps. Any React
  // state variable read directly in an action's closure (state, activeSlot,
  // activeProfile, allProfiles, ...) is permanently stuck at its initial
  // value. Actions that need current values MUST read them through the
  // matching ref (stateRef, activeSlotRef, activeProfileRef, ...) or use a
  // functional setState(prev => ...) update. Do NOT "fix" a stale closure by
  // widening this dependency list — that would churn the context identity for
  // every consumer on every render.
  const actionsValue = useMemo<GameActionsType>(() => ({
    setState,
    retryStartupHydration,
    createProfile: createProfileFn,
    setPlayerPortraitId,
    setPlayerCustomPortrait,
    selectProfile: selectProfileFn,
    deleteProfile: deleteProfileFn,
    refreshProfiles,
    dismissAchievementReport,
    dismissOfflineReport,
    startNewGame,
    launchConfiguredNewGame,
    saveGame,
    saveToSlot,
    loadSlot,
    loadRecoverySnapshot,
    refreshRecoverySnapshot,
    dismissRecoverySnapshot,
    deleteSlot,
    refreshSlotMetas,
    resolveCloudConflict,
    setSaveLabel,
    setHonorMode,
    loadGame,
    forceTick,
    setTickInterval,
    toggleTickPause,
    endTurn,
    dismissTurnRecap,
    cheatHabTowers,
    cheatHabAll,
    cheatAddSteel,
    cheatAddSteelMega,
    cheatAddWaterFacilities,
    cheatAddFoodFacilities,
    cheatAddWasteSewage,
    cheatRemovePopulation,
    cheatFactionWar,
    renameCity,
    renamePlayer,
    setInsignia,
    upgradeAttribute,
    upgradeSkill,
    cheatCredits,
    cheatSetStat,
    cheatMaxResources,
    cheatReduceUnrest,
    cheatReduceCrime,
    setFaithStance,
    declareLeaderCult,
    renounceLeaderCult,
    togglePolicy,
    toggleCityPolicy,
    setPolicy,
    buildConstruction,
    deployUnit,
    dispatchLawOperation,
    performDetaineeAction,
    establishSecurityWing: establishSecurityWingAction,
    assignSecurityWingSquad: assignSecurityWingSquadAction,
    unassignSecurityWingSquad: unassignSecurityWingSquadAction,
    appointSecurityWingLeader: appointSecurityWingLeaderAction,
    setSecurityWingDoctrine: setSecurityWingDoctrineAction,
    setSecurityWingJurisdiction: setSecurityWingJurisdictionAction,
    deploySecurityWing: deploySecurityWingAction,
    standDownSecurityWing: standDownSecurityWingAction,
    licenseCompany,
    shutdownCompany,
    awardContract,
    cancelContract,
    hireUnit,
    dismissUnit,
    toggleProcurementPolicy,
    issueEdict,
    startResearch,
    cancelResearch,
    queueResearch,
    removeFromQueue,
    reorderQueue,
    toggleAutoResearch,
    dismissMessage,
    markMessageRead,
    markAllMessagesRead,
    clearAllMessages,
    appointOfficer,
    dismissOfficer,
    autoFillVacancies,
    performOfficerAction,
    performBlackMarketPurchase: performBlackMarketPurchaseAction,
    performPersonalInteraction,
    toggleCheat,
    cheatAdd1BCredits,
    cheatAdd1BSteel,
    cheatAdd2BCredits,
    cheatAddPopulation,
    cheatAddUnits,
    cheatSetDemographic,
    cheatMaxFood,
    cheatMaxWater,
    cheatLoadOneMonthSave,
    cheatBulkCommodities,
    cheatBulkUnits,
    cheatBulkResources,
    cheatBulkBuildings,
    cheatBulkBuildings1000,
    cheatInfraBuildings1000,
    cheatMaxLoyaltyAll,
    cheatInstantAlliance,
    cheatUnlockAllTrade,
    cheatForcePeace,
    cheatRevealIntel,
    cheatMegacityFriendMax,
    cheatInstantJointConstruction,
    cheatDiplomaticImmunity,
    performRebirth,
    purchasePrestigeBonus,
    startMegaProject,
    advanceMegaProject,
    launchOfficerMission,
    cheatFactionReset,
    cheatTradeSurplus,
    cheatSpyMaster,
    cheatWarProfiler,
    cheatPuppetMaster,
    cheatGoldenTongue,
    cheatOpenBorders,
    cheatEveryoneIsDead,
    cheatTriggerCivilWar,
    cheatLaunchExpedition,
    cheatToggleTradeAI,
    cheatForceSeasonChange,
    cheatPrestigeBoost,
    toggleAutoConstruction,
    setAutoConstructionConfig,
    setAutoRecruitConfig,
    setAutoManagerMode: setAutoManagerModeAction,
    setAutoManagerPauseAllAct,
    acceptAutoManagerProposal,
    declineAutoManagerProposal,
    snoozeAutoManagerProposal,
    setAutoManagerAlwaysAllow,
    cancelTradeAgreement,
    cancelJointProject,
    cancelDiplomaticPact,
    resolveIncident: resolveIncidentAction,
    assignEnvoy: assignEnvoyAction,
    recallEnvoy: recallEnvoyAction,
    startNegotiation: startNegotiationAction,
    resolveNegotiationStep: resolveNegotiationStepAction,
    declareWarAdvanced: declareWarAdvancedAction,
    proposePeace: proposePeaceAction,
    acceptPeaceDemand: acceptPeaceDemandAction,
    rejectPeaceDemand: rejectPeaceDemandAction,
    concludePeace: concludePeaceAction,
    actionFaction,
    setSavedLoadout,
    dismissEvent,
    respondToEvent,
    proposeRailCorridor: proposeRailCorridorAction,
    respondToRailConsent: respondToRailConsentAction,
    cancelRailCorridor: cancelRailCorridorAction,
    configureRailCorridorStaffing: configureRailCorridorStaffingAction,
    resumeRailCorridor: resumeRailCorridorAction,
    installRailTrainUpgrade: installRailTrainUpgradeAction,
    respondToEventMulti,
    launchStrike,
    cheatBulkAmmoWeapons,
    toggleAddon,
    toggleMilitaryPolicy,
    startMilitaryResearch,
    launchMission,
    assignToArmy,
    buildMilitaryInstallation,
    startAcademyCourse,
    assignAcademyInstructor,
    setMilitaryAllocationPriority,
    issueDecree,
    appointInnerCircle,
    removeInnerCircle,
    recruitBodyguard,
    dismissBodyguard,
    installSoftwareUpgrade,
    claimDailyBonus,
    claimWeeklyChallenge,
    ensureWeeklyChallengeFresh,
    refreshPersonalGoals,
    claimPersonalGoal,
    exportSlot,
    importSlot,
    exportFullBackup,
    importFullBackup,
    markChangelogSeen,
    dismissTickErrors,
  }), [claimDailyBonus, claimWeeklyChallenge, ensureWeeklyChallengeFresh, refreshPersonalGoals, claimPersonalGoal, exportSlot, importSlot, exportFullBackup, importFullBackup, markChangelogSeen, dismissTickErrors, resolveCloudConflict, startAcademyCourse, assignAcademyInstructor]);

  return (
    <GameActionsContext.Provider value={actionsValue}>
      <GameStateContext.Provider value={stateValue}>
        <SaveTimeContext.Provider value={lastSaveTime}>
          {children}
        </SaveTimeContext.Provider>
      </GameStateContext.Provider>
    </GameActionsContext.Provider>
  );
}

export function useGameActions(): GameActionsType {
  const ctx = useContext(GameActionsContext);
  if (!ctx) throw new Error("useGameActions must be used inside GameProvider");
  return ctx;
}

export function useGameState(): GameStateType {
  const ctx = useContext(GameStateContext);
  if (!ctx) throw new Error("useGameState must be used inside GameProvider");
  return ctx;
}

export function useSaveTime(): number {
  return useContext(SaveTimeContext);
}

export function useGame(): GameContextType {
  const stateCtx = useContext(GameStateContext);
  const actionsCtx = useContext(GameActionsContext);
  if (!stateCtx || !actionsCtx) throw new Error("useGame must be used inside GameProvider");
  return useMemo(() => ({ ...stateCtx, ...actionsCtx }), [stateCtx, actionsCtx]);
}

// Subscribe to a single derived slice of GameState. The component re-renders
// only when the selector's output changes by reference (Object.is). Use this
// for hot paths (the world map, dashboards) that today re-render on every
// tick because they consume the full state via useGame()/useGameState().
//
// Selector contract: must be pure and should return either an existing slice
// from `state` (e.g. `s => s.discoveredLocationIds`) or a primitive. Do NOT
// build a new object/array inside the selector — that defeats reference
// equality and re-renders every tick.
export function useGameStateSelector<T>(selector: (s: GameState) => T): T {
  return useSyncExternalStore(
    _subscribeState,
    () => selector(_liveStateRef.current as GameState),
    () => selector(_liveStateRef.current as GameState),
  );
}

// Returns a stable ref that always points to the latest GameState. Reading
// `.current` inside callbacks/effects gives you fresh data without
// subscribing the component to state changes (no re-renders triggered).
// Use this for "read latest on click" cases like action handlers.
export function useGameStateRef(): Readonly<{ current: GameState }> {
  return _liveStateRef as Readonly<{ current: GameState }>;
}

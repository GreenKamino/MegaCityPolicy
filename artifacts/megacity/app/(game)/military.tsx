import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "expo-router";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import EmptyState from "@/components/EmptyState";
import ActionCostTimingReadout from "@/components/ActionCostTimingReadout";
import TutorialHint from "@/components/TutorialHint";
import GameModal from "@/components/GameModal";
import ContextMenu from "@/components/ContextMenu";
import HoverTooltip from "@/components/HoverTooltip";
import { useHotkeys } from "@/context/HotkeyContext";
import SectionHeader from "@/components/SectionHeader";
import StatBar from "@/components/StatBar";
import TrainingBoostBanner from "@/components/TrainingBoostBanner";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useSettings } from "@/context/SettingsContext";
import { useGameModal } from "@/hooks/useGameModal";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { formatCredits, formatNumber } from "@/utils/format";
import {
  MILITARY_POLICIES,
  MILITARY_RESEARCH,
  MILITARY_MISSIONS,
  createDefaultMilitaryState,
  createDefaultLogisticsState,
  calculateArmyStrength,
  type AllocationPriority,
} from "@/engine/militaryOverhaul";
import { getMilitaryReadinessGuidance } from "@/engine/militaryLogistics";
import { buildForcesCommandOverview, type ForceCommandSection } from "@/engine/forcesCommand";
import { listInstallationProduction } from "@/engine/productionInfo";
import {
  getLogisticsStockpileBalance,
  getResourceStorageStatus,
  LOGISTICS_STOCKPILE_POLICY,
} from "@/engine/resourceStorage";
import { getConstructionTicks, getTrainingSpeedReduction, getTrainingSpeedSourcesLabel } from "@/engine/pendingConstruction";
import { getUnitRole, isUnitRole, type UnitRole } from "@/engine/unitRoles";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { buildBattleLogDetailLines, computeUnitCompositionStrength, formatHostilesSpotted, formatLossesByUnit, rankArchetypeKills, FACTION_SIGNATURE_UNITS } from "@/engine/combatData";
import { buildUnitTierMultiplierMap } from "@/engine/assetUpgrades";
import {
  formatActionCostTimingSummary,
  getTimedActionCostTiming,
} from "@/engine/actionCostTiming";

// Task #228: faction filter chips above the lifetime kill tally. Order matches
// the eight factionSource buckets used everywhere else in the engine; labels
// are short enough to fit a horizontal scroll row on phone widths.
const KILL_FACTION_FILTERS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "gangs", label: "Gangs" },
  { key: "mutants", label: "Mutants" },
  { key: "raiders", label: "Raiders" },
  { key: "corporations", label: "Corps" },
  { key: "cults", label: "Cults" },
  { key: "rival_cities", label: "Rival Cities" },
  { key: "insurgents", label: "Insurgents" },
  { key: "pirates", label: "Pirates" },
];
// Task #240: per-faction tint applied to the small faction badges in the
// Hostiles Defeated rows. Gangs (#E94560) and corporations (#FF6B35) reuse
// the palette established in local-economy.tsx (FACTION_COLORS) so the same
// buckets stay recognisable across screens; the rest are picked to harmonise
// with the wasteland theme (toxic green for mutants, rust brown for raiders,
// mystic purple for cults, gold for rival cities, blood red for insurgents,
// cyan for pirates).
const KILL_FACTION_COLORS: Record<string, string> = {
  gangs: "#E94560",
  mutants: "#7CB342",
  raiders: "#8D6E63",
  corporations: "#FF6B35",
  cults: "#B855FF",
  rival_cities: "#D4AF37",
  insurgents: "#C0392B",
  pirates: "#00BCD4",
};
// archetype id → faction key, derived once from FACTION_SIGNATURE_UNITS so we
// don't drift if a roster gains or loses an archetype.
const ARCHETYPE_FACTION_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [faction, list] of Object.entries(FACTION_SIGNATURE_UNITS)) {
    for (const u of list) {
      if (!m.has(u.id)) m.set(u.id, faction);
    }
  }
  return m;
})();
import {
  WAR_ROOM_OPS,
  getWarRoomOpDuration,
  WAR_ROOM_OPS_COUNT_BY_TYPE,
  WAR_OP_CATEGORY_COLORS,
  WAR_OP_CATEGORIES,
  ORDNANCE_INVENTORY,
  ORDNANCE_CATEGORIES,
  type WarOpCategory,
  type OrdnanceCategory,
} from "@/engine/warRoomData";
import MilitaryInstallationsPanel from "@/components/MilitaryInstallationsPanel";
import DefenseBreakdownCard from "@/components/DefenseBreakdownCard";
import CommandScreenHeader from "@/components/CommandScreenHeader";
import CrisisReportFrame from "@/components/CrisisReportFrame";
import RailReadinessBreakdown from "@/components/RailReadinessBreakdown";

type UnitDef = {
  key: string;
  label: string;
  description: string;
  costPer10: number;
  ammoUpkeep?: number;
  fuelUpkeep?: number;
  effects: string;
};

type UnitCategory = {
  id: string;
  label: string;
  icon: string;
  units: UnitDef[];
};

const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: "law",
    label: "LAW",
    icon: "gavel",
    units: [
      { key: "patrolJudges", label: "PATROL ENFORCERS", description: "Standard sector enforcement", costPer10: 4000, ammoUpkeep: 3, effects: "-crime, +lawOrder" },
      { key: "rookieJudgeCadets", label: "ROOKIE CADETS", description: "Training-level enforcement", costPer10: 2000, ammoUpkeep: 1, effects: "-crime (minor)" },
      { key: "streetPatrolUnits", label: "STREET PATROL UNITS", description: "Beat cops and sector enforcers", costPer10: 3000, ammoUpkeep: 2, effects: "-crime, +law presence" },
      { key: "detectiveUnits", label: "DETECTIVE UNITS", description: "Investigative law enforcement", costPer10: 6000, effects: "-crime, +evidence recovery" },
      { key: "undercoverInvestigators", label: "UNDERCOVER INVESTIGATORS", description: "Deep cover criminal infiltration", costPer10: 7000, effects: "-crime, detect hidden threats" },
      { key: "antiGangTaskForces", label: "ANTI-GANG TASK FORCES", description: "Specialized gang suppression", costPer10: 7000, ammoUpkeep: 3, effects: "-gang influence, -crime" },
      { key: "drugEnforcementUnits", label: "DRUG ENFORCEMENT UNITS", description: "Narcotics interdiction teams", costPer10: 5000, effects: "-crime, -corruption" },
      { key: "cybercrimeTeams", label: "CYBERCRIME TEAMS", description: "Digital crime investigations", costPer10: 8000, effects: "-corruption, +intel" },
      { key: "evidenceRecoveryTeams", label: "EVIDENCE RECOVERY TEAMS", description: "Crime scene analysis units", costPer10: 5000, effects: "+conviction rate, -crime" },
      { key: "sectorLawSquads", label: "SECTOR LAW SQUADS", description: "General sector law presence", costPer10: 4000, ammoUpkeep: 2, effects: "-crime, +lawOrder" },
    ],
  },
  {
    id: "riot",
    label: "RIOT",
    icon: "shield-half-full",
    units: [
      { key: "riotPoliceSquads", label: "RIOT POLICE SQUADS", description: "Crowd control specialists", costPer10: 5000, ammoUpkeep: 2, effects: "-unrest, -riot risk" },
      { key: "riotShieldUnits", label: "RIOT SHIELD UNITS", description: "Defensive crowd suppression", costPer10: 4000, effects: "-unrest, high durability" },
      { key: "crowdDispersalTeams", label: "CROWD DISPERSAL TEAMS", description: "Non-lethal crowd breaking", costPer10: 4500, effects: "-unrest, fast response" },
      { key: "sonicCrowdControlUnits", label: "SONIC CROWD CONTROL", description: "Sonic disorientation weapons", costPer10: 6000, effects: "-unrest, area suppression" },
      { key: "gasDeploymentTeams", label: "GAS DEPLOYMENT TEAMS", description: "Chemical crowd dispersal", costPer10: 5000, ammoUpkeep: 2, effects: "-unrest, area effect" },
      { key: "heavyRiotMechUnits", label: "HEAVY RIOT MECH UNITS", description: "Armored riot suppression mechs", costPer10: 18000, ammoUpkeep: 5, fuelUpkeep: 3, effects: "-unrest (massive), -happiness" },
      { key: "riotDroneSquads", label: "RIOT DRONE SQUADS", description: "Aerial crowd suppression", costPer10: 6000, effects: "-unrest, aerial coverage" },
      { key: "tacticalSuppressionTeams", label: "TACTICAL SUPPRESSION TEAMS", description: "Elite riot response units", costPer10: 8000, ammoUpkeep: 3, effects: "-unrest, -riot risk" },
    ],
  },
  {
    id: "elite",
    label: "ELITE",
    icon: "star-circle",
    units: [
      { key: "seniorJudges", label: "SENIOR ENFORCERS", description: "Veteran law enforcement commanders", costPer10: 15000, ammoUpkeep: 5, effects: "-crime (massive), +lawOrder" },
      { key: "eliteJudgeStrikeTeams", label: "ELITE STRIKE TEAMS", description: "High-threat rapid response", costPer10: 20000, ammoUpkeep: 8, effects: "-crime, handles critical events" },
      { key: "rapidResponseUnits", label: "RAPID RESPONSE UNITS", description: "Fast-deploy enforcement squads", costPer10: 12000, ammoUpkeep: 4, effects: "+response speed, -crime" },
      { key: "tacticalBreachSquads", label: "TACTICAL BREACH SQUADS", description: "Urban building entry specialists", costPer10: 14000, ammoUpkeep: 5, effects: "-crime, gang bust bonus" },
      { key: "urbanCombatSpecialists", label: "URBAN COMBAT SPECIALISTS", description: "Close-quarters combat experts", costPer10: 16000, ammoUpkeep: 6, effects: "-crime, city defense bonus" },
      { key: "highThreatArrestUnits", label: "HIGH-THREAT ARREST UNITS", description: "Dangerous criminal apprehension", costPer10: 13000, ammoUpkeep: 4, effects: "-crime, -faction threat" },
      { key: "judgeExecutionTeams", label: "EXECUTION SQUADS", description: "Terminal enforcement authority", costPer10: 18000, ammoUpkeep: 8, effects: "-crime (extreme), +fear, -happiness" },
    ],
  },
  {
    id: "drones",
    label: "DRONES",
    icon: "quadcopter",
    units: [
      { key: "surveillanceDrones", label: "SURVEILLANCE DRONES", description: "Aerial monitoring units", costPer10: 4000, effects: "-crime, +surveillance" },
      { key: "patrolDrones", label: "PATROL DRONES", description: "Automated sector patrol", costPer10: 4500, effects: "-crime, automated coverage" },
      { key: "riotSuppressionDrones", label: "RIOT SUPPRESSION DRONES", description: "Non-lethal crowd dispersal drones", costPer10: 6000, effects: "-unrest, aerial coverage" },
      { key: "tacticalCombatDrones", label: "TACTICAL COMBAT DRONES", description: "Armed combat aerial units", costPer10: 10000, ammoUpkeep: 4, fuelUpkeep: 2, effects: "-crime, +defense" },
      { key: "investigativeDrones", label: "INVESTIGATIVE DRONES", description: "Evidence-gathering aerial units", costPer10: 5000, effects: "-crime, +intel recovery" },
      { key: "smugglingInterceptorDrones", label: "SMUGGLING INTERCEPTORS", description: "Contraband detection and seizure", costPer10: 7000, effects: "-corruption, -crime" },
    ],
  },
  {
    id: "military",
    label: "MILITARY",
    icon: "tank",
    units: [
      { key: "cityDefenseInfantry", label: "CITY DEFENSE INFANTRY", description: "Standard city defense troops", costPer10: 3000, ammoUpkeep: 3, effects: "+defense rating" },
      { key: "armoredResponseUnits", label: "ARMORED RESPONSE UNITS", description: "Armored combat vehicle crews", costPer10: 10000, ammoUpkeep: 5, fuelUpkeep: 3, effects: "+defense, +riot suppression" },
      { key: "sectorDefenseTroops", label: "SECTOR DEFENSE TROOPS", description: "Zone-specific defense forces", costPer10: 4000, ammoUpkeep: 3, effects: "+district defense" },
      { key: "rapidDeploymentInfantry", label: "RAPID DEPLOYMENT INFANTRY", description: "Fast-moving infantry squads", costPer10: 5000, ammoUpkeep: 4, effects: "+response speed, +defense" },
      { key: "heavyWeaponsSquads", label: "HEAVY WEAPONS SQUADS", description: "Crew-served heavy armaments", costPer10: 12000, ammoUpkeep: 8, effects: "+defense (major)" },
      { key: "urbanDefenseEngineers", label: "URBAN DEFENSE ENGINEERS", description: "Fortification and defense specialists", costPer10: 8000, effects: "+defense, +infra repair" },
      { key: "wallDefenseCrews", label: "WALL DEFENSE CREWS", description: "Perimeter wall garrison", costPer10: 4000, ammoUpkeep: 2, effects: "+perimeter defense" },
      { key: "antiVehicleTeams", label: "ANTI-VEHICLE TEAMS", description: "Armored threat neutralization", costPer10: 9000, ammoUpkeep: 5, effects: "+defense vs armored" },
    ],
  },
  {
    id: "vehicles",
    label: "VEHICLES",
    icon: "car",
    units: [
      { key: "patrolBikes", label: "PATROL BIKES", description: "Fast sector patrol vehicles", costPer10: 3000, fuelUpkeep: 2, effects: "+patrol speed, -crime" },
      { key: "patrolCars", label: "PATROL CARS", description: "Standard sector patrol vehicles", costPer10: 4000, fuelUpkeep: 2, effects: "+patrol coverage" },
      { key: "armoredRiotVehicles", label: "ARMORED RIOT VEHICLES", description: "Crowd control heavy vehicles", costPer10: 8000, fuelUpkeep: 4, effects: "-unrest, riot response" },
      { key: "tacticalResponseAPCs", label: "TACTICAL RESPONSE APCs", description: "Armored personnel transport", costPer10: 12000, fuelUpkeep: 5, ammoUpkeep: 3, effects: "+unit deploy speed, +defense" },
      { key: "judgeMotorcycles", label: "ENFORCER CYCLES", description: "High-speed enforcer pursuit bikes", costPer10: 5000, fuelUpkeep: 3, effects: "+chase effectiveness, -crime" },
      { key: "armoredPersonnelCarriers", label: "ARMORED PERSONNEL CARRIERS", description: "Heavy troop transport", costPer10: 15000, fuelUpkeep: 6, ammoUpkeep: 2, effects: "+unit survivability" },
      { key: "transportHaulers", label: "TRANSPORT HAULERS", description: "Logistics and supply vehicles", costPer10: 4000, fuelUpkeep: 3, effects: "+supply efficiency" },
      { key: "droneCarrierTrucks", label: "DRONE CARRIER TRUCKS", description: "Mobile drone deployment", costPer10: 6000, fuelUpkeep: 2, effects: "+drone range and speed" },
    ],
  },
  {
    id: "air",
    label: "AIR",
    icon: "helicopter",
    units: [
      { key: "surveillanceHelicopters", label: "SURVEILLANCE HELICOPTERS", description: "Aerial surveillance platforms", costPer10: 15000, fuelUpkeep: 5, effects: "+surveillance, -crime" },
      { key: "judgeGunships", label: "ENFORCER GUNSHIPS", description: "Armed aerial enforcement", costPer10: 20000, ammoUpkeep: 8, fuelUpkeep: 6, effects: "-crime (massive), +defense" },
      { key: "rapidMedicalFlyers", label: "RAPID MEDICAL FLYERS", description: "Aerial emergency medical response", costPer10: 12000, fuelUpkeep: 3, effects: "+public health, -casualty rate" },
      { key: "tacticalDropShips", label: "TACTICAL DROP SHIPS", description: "Elite unit rapid insertion", costPer10: 18000, fuelUpkeep: 5, ammoUpkeep: 3, effects: "+defense, +rapid response" },
      { key: "airbornPatrolUnits", label: "AIRBORNE PATROL UNITS", description: "Aerial sector patrol squads", costPer10: 14000, fuelUpkeep: 4, effects: "+surveillance coverage" },
    ],
  },
  {
    id: "logistics",
    label: "LOGISTICS",
    icon: "truck",
    units: [
      { key: "supplyTransportCrews", label: "SUPPLY TRANSPORT CREWS", description: "Resource logistics teams", costPer10: 3000, effects: "+supply efficiency" },
      { key: "infrastructureRepairTeams", label: "INFRA REPAIR TEAMS", description: "Infrastructure maintenance crews", costPer10: 4000, effects: "+infra health/tick" },
      { key: "utilityMaintenanceSquads", label: "UTILITY MAINTENANCE SQUADS", description: "Power, water, utility repair", costPer10: 3500, effects: "+infra health, -failure" },
      { key: "constructionCrews", label: "CONSTRUCTION CREWS", description: "Building and repair specialists", costPer10: 4000, effects: "+build speed, +infra" },
      { key: "emergencyRepairUnits", label: "EMERGENCY REPAIR UNITS", description: "Crisis infrastructure response", costPer10: 5000, effects: "+infra health, crisis recovery" },
    ],
  },
  {
    id: "medical",
    label: "MEDICAL",
    icon: "hospital-box",
    units: [
      { key: "emergencyMedicalTeams", label: "EMERGENCY MEDICAL TEAMS", description: "Crisis medical response units", costPer10: 5000, effects: "+happiness, -death rate" },
      { key: "fieldHospitalUnits", label: "FIELD HOSPITAL UNITS", description: "Mobile battlefield medicine", costPer10: 8000, effects: "+public health, -unrest" },
      { key: "disasterResponseCrews", label: "DISASTER RESPONSE CREWS", description: "Multi-hazard emergency response", costPer10: 6000, effects: "-casualty risk, crisis bonus" },
      { key: "diseaseContainmentTeams", label: "DISEASE CONTAINMENT TEAMS", description: "Epidemic control specialists", costPer10: 7000, effects: "-disease spread, +health" },
      { key: "biohazardResponseUnits", label: "BIOHAZARD RESPONSE UNITS", description: "Chemical/biological threat teams", costPer10: 10000, effects: "-crisis severity, +safety" },
    ],
  },
  {
    id: "industrial",
    label: "WORKERS",
    icon: "hard-hat",
    units: [
      { key: "factoryWorkerCrews", label: "FACTORY WORKER CREWS", description: "Industrial production workers", costPer10: 2000, effects: "+goods production, +tax" },
      { key: "miningCrews", label: "MINING CREWS", description: "Raw material extraction teams", costPer10: 2500, effects: "+steel production" },
      { key: "recyclingFacilityWorkers", label: "RECYCLING WORKERS", description: "Material recovery specialists", costPer10: 2000, effects: "+steel from recycling" },
      { key: "materialsProcessingTeams", label: "MATERIALS PROCESSING TEAMS", description: "Advanced material handlers", costPer10: 3000, effects: "+steel, +goods quality" },
      { key: "powerPlantEngineers", label: "POWER PLANT ENGINEERS", description: "Energy system operators", costPer10: 4000, effects: "+power efficiency, +stability" },
    ],
  },
  {
    id: "research",
    label: "RESEARCH",
    icon: "flask",
    units: [
      { key: "researchScientists", label: "RESEARCH SCIENTISTS", description: "General science researchers", costPer10: 8000, effects: "+research pts/tick" },
      { key: "aiSystemsEngineers", label: "AI SYSTEMS ENGINEERS", description: "Artificial intelligence developers", costPer10: 12000, effects: "+research, +AI bonuses" },
      { key: "cyberneticsResearchers", label: "CYBERNETICS RESEARCHERS", description: "Human augmentation scientists", costPer10: 12000, effects: "+research, cybernetics unlock" },
      { key: "experimentalPhysicsTeams", label: "EXPERIMENTAL PHYSICS TEAMS", description: "Advanced physics researchers", costPer10: 15000, effects: "+research (major)" },
      { key: "dataArchiveAnalysts", label: "DATA ARCHIVE ANALYSTS", description: "Pre-war data recovery analysts", costPer10: 6000, effects: "+research, historical data" },
    ],
  },
  {
    id: "special",
    label: "SPECIAL",
    icon: "skull",
    units: [
      { key: "forensicProfilers", label: "FORENSIC PROFILERS", description: "Advanced criminal behavior analysis", costPer10: 25000, effects: "+intel, detect hidden events" },
      { key: "mutantEnforcementSquads", label: "MUTANT ENFORCEMENT SQUADS", description: "Mutant population control units", costPer10: 15000, ammoUpkeep: 5, effects: "-mutation spread, -unrest" },
      { key: "blackOpsUnits", label: "BLACK OPS UNITS", description: "Classified covert operations", costPer10: 30000, effects: "-faction threat, covert ops" },
      { key: "antiCultTaskForces", label: "ANTI-CULT TASK FORCES", description: "Extremist group elimination", costPer10: 12000, ammoUpkeep: 4, effects: "-faction threat, cult control" },
      { key: "rogueJudgeHunters", label: "ROGUE HUNTER UNITS", description: "Tracks rogue enforcers", costPer10: 20000, effects: "-corruption, -rogue unit risk" },
      { key: "experimentalCombatUnits", label: "EXPERIMENTAL COMBAT UNITS", description: "Prototype combat soldiers", costPer10: 35000, ammoUpkeep: 10, effects: "+defense (massive), high upkeep" },
    ],
  },
  {
    id: "civil",
    label: "CIVIL",
    icon: "account-group",
    units: [
      { key: "censusOfficers", label: "CENSUS OFFICERS", description: "Population tracking officials", costPer10: 3000, effects: "+tax efficiency, -corruption" },
      { key: "welfareOfficers", label: "WELFARE OFFICERS", description: "State welfare distribution", costPer10: 3500, effects: "+happiness, -unrest" },
      { key: "propagandaOfficers", label: "PROPAGANDA OFFICERS", description: "Authority narrative control", costPer10: 4000, effects: "-unrest, +loyalty" },
      { key: "civicMediators", label: "CIVIC MEDIATORS", description: "Public grievance handlers", costPer10: 4000, effects: "+happiness, -unrest" },
      { key: "districtAdministrators", label: "DISTRICT ADMINISTRATORS", description: "Local governance officials", costPer10: 5000, effects: "+all district stats, +tax" },
    ],
  },
  {
    id: "wasteland",
    label: "FRONTIER",
    icon: "map",
    units: [
      { key: "wastelandScouts", label: "WASTELAND SCOUTS", description: "Outside-city exploration teams", costPer10: 5000, fuelUpkeep: 2, effects: "+resource discovery" },
      { key: "caravanEscorts", label: "CARAVAN ESCORTS", description: "Trade route security teams", costPer10: 4000, ammoUpkeep: 2, effects: "+trade income, +safety" },
      { key: "borderRangers", label: "BORDER RANGERS", description: "Outer perimeter patrol", costPer10: 6000, ammoUpkeep: 3, effects: "+border security, -smuggling" },
      { key: "salvageCrews", label: "SALVAGE CREWS", description: "Material recovery outside city", costPer10: 4000, effects: "+steel, +rare resources" },
      { key: "explorationTeams", label: "EXPLORATION TEAMS", description: "Unknown sector investigation", costPer10: 7000, fuelUpkeep: 2, effects: "+discovery, +resource" },
    ],
  },
];

type MilTab = "overview" | "units" | "army" | "warops" | "defense" | "ordnance" | "policies" | "production" | "research" | "missions" | "installations";
const MIL_TABS: { key: MilTab; label: string; icon: string }[] = [
  { key: "overview", label: "COMMAND", icon: "sitemap" },
  { key: "units", label: "UNITS", icon: "sword-cross" },
  { key: "army", label: "ARMY", icon: "shield-sword" },
  { key: "warops", label: "WAR OPS", icon: "monitor-dashboard" },
  { key: "defense", label: "DEFENSE", icon: "shield-home" },
  { key: "ordnance", label: "ORDNANCE", icon: "ammunition" },
  { key: "policies", label: "DOCTRINE", icon: "book-open-variant" },
  { key: "production", label: "SUPPLY", icon: "factory" },
  { key: "research", label: "R&D", icon: "flask" },
  { key: "missions", label: "MISSIONS", icon: "map-marker-path" },
  { key: "installations", label: "BASES", icon: "office-building" },
];

const UNIT_CTX_ITEMS: { label: string; action: string; danger?: boolean }[] = [
  { label: "Recruit / Deploy", action: "deploy" },
];

function MilitaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: rawState, setState, deployUnit, toggleMilitaryPolicy, startMilitaryResearch, launchMission, assignToArmy, setMilitaryAllocationPriority } = useGame();
  const state = useThrottledValue(rawState, 500);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { militaryFilters, setSetting } = useSettings();
  const validMilTab = (value: unknown): MilTab =>
    typeof value === "string" && MIL_TABS.some((tab) => tab.key === value) ? value as MilTab : "units";
  const validUnitCategory = (value: unknown): string =>
    typeof value === "string" && UNIT_CATEGORIES.some((category) => category.id === value) ? value : "law";
  const validWarOpsFilter = (value: unknown): WarOpCategory | "all" =>
    value === "all" || (typeof value === "string" && Object.hasOwn(WAR_OP_CATEGORIES, value))
      ? value as WarOpCategory | "all"
      : "all";
  const validOrdnanceFilter = (value: unknown): OrdnanceCategory | "all" =>
    value === "all" || (typeof value === "string" && Object.hasOwn(ORDNANCE_CATEGORIES, value))
      ? value as OrdnanceCategory | "all"
      : "all";
  // Derive these values directly from SettingsContext rather than seeding
  // local state once. Settings hydrate asynchronously, so a one-time
  // initializer would leave the screen on defaults after a cold launch.
  const activeCat = validUnitCategory(militaryFilters?.unitCategory);
  const milTab = validMilTab(militaryFilters?.tab);
  const opFilter = validWarOpsFilter(militaryFilters?.warOps);
  const ordFilter = validOrdnanceFilter(militaryFilters?.ordnance);
  const setActiveCat = useCallback((value: string) => {
    setSetting("militaryFilters", { ...militaryFilters, unitCategory: value });
  }, [militaryFilters, setSetting]);
  const setMilTab = useCallback((value: MilTab) => {
    setSetting("militaryFilters", { ...militaryFilters, tab: value });
  }, [militaryFilters, setSetting]);
  const setOpFilter = useCallback((value: WarOpCategory | "all") => {
    setSetting("militaryFilters", { ...militaryFilters, warOps: value });
  }, [militaryFilters, setSetting]);
  const setOrdFilter = useCallback((value: OrdnanceCategory | "all") => {
    setSetting("militaryFilters", { ...militaryFilters, ordnance: value });
  }, [militaryFilters, setSetting]);
  const { registerSubTabs, unregisterSubTabs } = useHotkeys();
  // Desktop web: let the mouse wheel scroll the horizontal strips. One hook
  // instance per strip (they are separate ScrollViews, some tab-conditional).
  const milTabStripRef = useHorizontalWheelScroll();
  const catStripRef = useHorizontalWheelScroll();
  const killFilterStripRef = useHorizontalWheelScroll();
  const battleLogFilterStripRef = useHorizontalWheelScroll();
  const opFilterStripRef = useHorizontalWheelScroll();
  const ordFilterStripRef = useHorizontalWheelScroll();
  const [ctx, setCtx] = useState<{ visible: boolean; position: { x: number; y: number }; id: string | null }>(
    { visible: false, position: { x: 0, y: 0 }, id: null }
  );
  // Task #228 + #239: which factionSource bucket the Hostiles Defeated tally
  // is filtered to ("all" = unfiltered, default). Persisted on combat state
  // so it rides along with the save; old saves with no stored value fall
  // back to "all".
  const killFactionFilter = rawState.combat?.killFactionFilter ?? "all";
  const setKillFactionFilter = useCallback((next: string) => {
    setState((prev) => {
      if (!prev.combat) return prev;
      if ((prev.combat.killFactionFilter ?? "all") === next) return prev;
      return { ...prev, combat: { ...prev.combat, killFactionFilter: next } };
    });
  }, [setState]);
  // Task #233 + #239: which factionSource bucket the Battle Log is filtered
  // to. Independent from killFactionFilter so players can scope the two
  // sections separately. Persisted alongside it on combat state.
  const logFactionFilter = rawState.combat?.logFactionFilter ?? "all";
  const setLogFactionFilter = useCallback((next: string) => {
    setState((prev) => {
      if (!prev.combat) return prev;
      if ((prev.combat.logFactionFilter ?? "all") === next) return prev;
      return { ...prev, combat: { ...prev.combat, logFactionFilter: next } };
    });
  }, [setState]);
  const { modal, showModal, hideModal } = useGameModal();
  const { colors: tc } = useTheme();
  const styles = useStyles();

  const mil = state.militaryOverhaul ?? createDefaultMilitaryState();
  const log = mil.logistics ?? createDefaultLogisticsState();
  const { units: u, resources: r } = state;
  const cat = UNIT_CATEGORIES.find((c) => c.id === activeCat)!;
  const readinessGuidance = getMilitaryReadinessGuidance(
    mil.standingArmy.readiness,
    mil.standingArmy.morale,
    log,
  );
  const forcesOverview = useMemo(() => buildForcesCommandOverview(state), [state]);
  const [expandedCommandSections, setExpandedCommandSections] = useState<Record<string, boolean>>({ armed: true });
  const openCommandTarget = useCallback((target: ForceCommandSection["action"]["target"]) => {
    if (target === "officers" || target === "retinue" || target === "districts") {
      router.push(`/(game)/${target}` as any);
      return;
    }
    setMilTab(target);
  }, [router, setMilTab]);

  const renderOverviewTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>UNIFIED FORCE STATUS</Text>
      <View style={styles.commandSummary}>
        <StatusChip label="PERSONNEL" value={forcesOverview.personnel.toLocaleString()} color={tc.text} />
        <StatusChip label="READINESS" value={`${forcesOverview.readiness}%`} color={forcesOverview.readiness < 50 ? tc.danger : tc.statHigh} />
        <StatusChip label="SUPPLY" value={forcesOverview.supplyStatus.toUpperCase()} color={["critical", "shortage"].includes(forcesOverview.supplyStatus) ? tc.danger : tc.statHigh} />
      </View>
      {forcesOverview.sections.map((section) => {
        const expanded = !!expandedCommandSections[section.id];
        return (
          <View key={section.id} style={styles.commandSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${section.label}, ${section.commander ? `commanded by ${section.commander}` : "command vacant"}`}
              accessibilityState={{ expanded }}
              onPress={() => setExpandedCommandSections((current) => ({ ...current, [section.id]: !expanded }))}
              style={styles.commandSectionHeader}
            >
              <View style={styles.commandSectionTitle}>
                <MaterialCommunityIcons name={expanded ? "chevron-down" : "chevron-right"} size={18} color={tc.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.commandSectionLabel}>{section.label}</Text>
              <Text style={styles.commandCommander}>{section.commander ?? "COMMAND VACANT"} · {section.vacancies} unfilled posts</Text>
                </View>
              </View>
            </Pressable>
            {expanded && (
              <View style={styles.commandSectionBody}>
                {section.metrics.map((metric) => (
                  <View key={metric.label} style={styles.commandMetric}>
                    <Text style={styles.commandMetricLabel}>{metric.label}</Text>
                    <Text style={[styles.commandMetricValue, metric.alert && { color: tc.danger }]}>{metric.value}</Text>
                  </View>
                ))}
                <View style={styles.commandAssets}>
                  <Text style={styles.commandAssetsLabel}>ASSET COMPOSITION</Text>
                  {section.assets.length === 0 ? (
                    <Text style={styles.commandAssetEmpty}>No assigned assets recorded.</Text>
                  ) : section.assets.map((asset) => (
                    <View key={asset.id} style={styles.commandAssetRow} accessibilityLabel={`${asset.label}, ${asset.count} assigned${asset.statuses.length ? `, ${asset.statuses.join(", ")}` : ""}`}>
                      <View style={styles.commandAssetInfo}>
                        <View style={styles.commandAssetNameRow}>
                          <MaterialCommunityIcons
                            name={asset.kind === "vehicle" ? "car" : asset.kind === "installation" ? "domain" : asset.kind === "officer" ? "account-tie" : asset.kind === "formation" ? "account-group" : "shield"}
                            size={13}
                            color={tc.textMuted}
                          />
                          <Text style={styles.commandAssetName}>{asset.label}</Text>
                        </View>
                        {asset.detail && <Text style={styles.commandAssetDetail}>{asset.detail}</Text>}
                      </View>
                      <View style={styles.commandAssetRight}>
                        <Text style={styles.commandAssetCount}>{asset.count.toLocaleString()}</Text>
                        <View style={styles.commandAssetStatusRow}>
                          {asset.statuses.map((status) => (
                            <Text
                              key={status}
                              style={[
                                styles.commandAssetStatus,
                                { color: ["damaged", "deployed", "leaderless", "undersupplied", "understaffed"].includes(status) ? tc.warning : tc.accent },
                              ]}
                            >
                              {status.toUpperCase()}
                            </Text>
                          ))}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
                <Pressable accessibilityRole="button" onPress={() => openCommandTarget(section.action.target)} style={styles.commandAction}>
                  <Text style={styles.commandActionText}>{section.action.label}</Text>
                  <MaterialCommunityIcons name="arrow-right" size={14} color={tc.accent} />
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );

  // Task #524: requisitions train over several ticks. Aggregate in-flight
  // orders per unit key so each card shows its training queue.
  const pendingByUnit = useMemo(() => {
    const map: Record<string, { count: number; ticks: number; battlefieldRole?: UnitRole }> = {};
    for (const o of state.pendingConstructions ?? []) {
      if (o.kind !== "unit") continue;
      const cur = map[o.buildingKey];
      map[o.buildingKey] = {
        count: (cur?.count ?? 0) + o.count,
        ticks: Math.max(cur?.ticks ?? 0, o.ticksRemaining),
        battlefieldRole: cur?.battlefieldRole
          ?? (isUnitRole(o.battlefieldRole) ? o.battlefieldRole : undefined),
      };
    }
    return map;
  }, [state.pendingConstructions]);

  const totalPersonnel = useMemo(() =>
    Object.entries(u).reduce((sum, [k, v]) => {
      if (["vehicleReadiness", "armoryStock", "prisonPopulation", "judgeReadiness"].includes(k)) return sum;
      return sum + (typeof v === "number" ? v : 0);
    }, 0), [u]);

  const armyStrength = useMemo(() => calculateArmyStrength(mil.standingArmy), [mil.standingArmy]);
  const filteredOps = useMemo(() => opFilter === "all" ? WAR_ROOM_OPS : WAR_ROOM_OPS.filter(o => o.type === opFilter), [opFilter]);
  const filteredOrd = useMemo(() => ordFilter === "all" ? ORDNANCE_INVENTORY : ORDNANCE_INVENTORY.filter(o => o.category === ordFilter), [ordFilter]);

  const executeWarOp = (op: typeof WAR_ROOM_OPS[number]) => {
    if (r.credits < op.cost) {
      showModal("INSUFFICIENT FUNDS", `This operation requires ${formatCredits(op.cost)}.`, [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    const alreadyActive = (state.activeWarOps ?? []).some(w => w.opId === op.id);
    if (alreadyActive) {
      showModal("ALREADY IN PROGRESS", `${op.name} is already underway.`, [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    const duration = getWarRoomOpDuration(op);
    const timing = getTimedActionCostTiming(
      { cost: op.cost, duration },
      { availableCredits: r.credits },
    );
    showModal(
      `AUTHORIZE: ${op.name.toUpperCase()}`,
      `${op.description}\n\n${formatActionCostTimingSummary(timing)}\nType: ${op.type.toUpperCase()}\nDefense Bonus: +${op.defenseBonus}`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "AUTHORIZE", style: "destructive", onPress: () => {
            setState((prev) => {
              if ((prev.activeWarOps ?? []).some(w => w.opId === op.id)) return prev;
              return {
                ...prev,
                resources: { ...prev.resources, credits: prev.resources.credits - op.cost },
                activeWarOps: [...(prev.activeWarOps ?? []), { opId: op.id, ticksRemaining: duration, startedTick: prev.totalTicks }],
              };
            });
          }
        },
      ],
    );
  };

  const handleDeploy = (def: UnitDef) => {
    if (r.credits < def.costPer10) {
      showModal("INSUFFICIENT FUNDS", `Requires ${formatCredits(def.costPer10)}.`, [{ text: "OK", style: "cancel" }]);
      return;
    }
    const upkeepNote = [
      def.ammoUpkeep ? `${def.ammoUpkeep} ammo/tick` : null,
      def.fuelUpkeep ? `${def.fuelUpkeep} fuel/tick` : null,
    ].filter(Boolean).join(", ");

    const trainTicks = getConstructionTicks("unit", def.key, undefined, state);
    const trainReduction = getTrainingSpeedReduction(state);
    const trainSources = getTrainingSpeedSourcesLabel(state);
    const speedNote = trainReduction > 0 && trainSources ? ` (-${Math.round(trainReduction * 100)}% from ${trainSources})` : "";
    const timing = getTimedActionCostTiming(
      { cost: def.costPer10, duration: trainTicks },
      {
        availableCredits: r.credits,
        activeTicksRemaining: pendingByUnit[def.key]?.ticks,
        phase: pendingByUnit[def.key] ? "active" : undefined,
      },
    );
    showModal(
      `REQUISITION: ${def.label}`,
      `${formatActionCostTimingSummary(timing)}${speedNote}\n\nRequisition 10 units.\n\n${def.description}\n\nEffect: ${def.effects}${upkeepNote ? `\nUpkeep: ${upkeepNote}` : ""}`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "REQUISITION",
          style: "destructive",
          onPress: () => {
            const ok = deployUnit(def.key, def.costPer10);
            if (!ok) showModal("FAILED", "Insufficient credits.", [{ text: "OK", style: "cancel" }]);
          },
        },
      ]
    );
  };

  const openCtx = useCallback((id: string, e: any) => {
    if (Platform.OS !== "web") return;
    e?.preventDefault?.();
    const x = e?.nativeEvent?.pageX ?? e?.pageX ?? 0;
    const y = e?.nativeEvent?.pageY ?? e?.pageY ?? 0;
    setCtx({ visible: true, position: { x, y }, id });
  }, []);
  const closeCtx = useCallback(() => setCtx((c) => ({ ...c, visible: false })), []);
  const onCtxAction = useCallback((action: string) => {
    const id = ctx.id;
    setCtx((c) => ({ ...c, visible: false }));
    if (!id) return;
    if (action === "deploy") {
      const def = UNIT_CATEGORIES.flatMap((c) => c.units).find((d) => d.key === id);
      if (def) handleDeploy(def);
    }
  }, [ctx.id, handleDeploy]);

  useEffect(() => {
    const keys = UNIT_CATEGORIES.map((c) => c.id);
    const idx = keys.indexOf(activeCat);
    registerSubTabs({
      prev: () => setActiveCat(keys[idx > 0 ? idx - 1 : keys.length - 1]),
      next: () => setActiveCat(keys[idx < keys.length - 1 ? idx + 1 : 0]),
    });
    return () => unregisterSubTabs();
  }, [activeCat, registerSubTabs, unregisterSubTabs]);

  const renderUnitsTab = () => (
    <>
      <View style={styles.statusStrip}>
        <StatusChip label="CREDITS" value={formatNumber(r.credits)} color={tc.accent} />
        <StatusChip label="AMMO" value={r.ammo.toString()} color={r.ammo < 100 ? tc.danger : tc.info} />
        <StatusChip label="FUEL" value={r.fuel.toString()} color={r.fuel < 30 ? tc.danger : tc.info} />
        <StatusChip label="READINESS" value={`${Math.round(u.vehicleReadiness ?? 0)}%`} color={tc.statMid} />
      </View>

      {/* Task #533: persistent boost indicator visible before opening
          any requisition dialog; names the active source(s). */}
      <TrainingBoostBanner state={state} />

      {r.ammo < 100 && (
        <Pressable
          onPress={() => setMilTab("production")}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 10, marginBottom: 8, padding: 8, borderWidth: 1, borderColor: tc.warning, borderRadius: 4, backgroundColor: tc.bgCard }}
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={tc.warning} />
          <Text style={{ flex: 1, color: tc.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10, lineHeight: 14 }}>
            ARMY AMMO LOW — making {Math.round(log.lastProduction.ammo)}/tick, using {Math.round(log.lastConsumption.ammo)}/tick. Army ammo comes from manned military bases (BASES tab), not civilian factories. Tap here for the full supply breakdown.
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color={tc.warning} />
        </Pressable>
      )}

      <View style={styles.readinessBlock}>
        <StatBar label="Vehicle Readiness" value={u.vehicleReadiness ?? 0} compact />
        <StatBar label="Enforcer Readiness" value={u.judgeReadiness ?? 0} compact />
      </View>

      <ScrollView ref={catStripRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.catScroll} contentContainerStyle={styles.catContent}>
        {UNIT_CATEGORIES.map((c) => {
          const catTotal = c.units.reduce((a, ud) => a + (u[ud.key] ?? 0), 0);
          return (
            <Pressable
              key={c.id}
              style={[styles.catTab, activeCat === c.id && styles.catTabActive]}
              onPress={() => setActiveCat(c.id)}
            >
              <MaterialCommunityIcons name={c.icon as any} size={11} color={activeCat === c.id ? tc.bg : tc.textMuted} />
              <Text style={[styles.catLabel, activeCat === c.id && styles.catLabelActive]}>{c.label}</Text>
              {catTotal > 0 && (
                <View style={styles.catBadge}>
                  <Text style={styles.catBadgeText}>{catTotal > 999 ? "999+" : catTotal}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CrisisReportFrame
          title="FORCE READINESS"
          icon="shield"
          tone={mil.standingArmy.readiness >= 75 ? "statHigh" : mil.standingArmy.readiness >= 50 ? "warning" : "danger"}
          statusLabel={mil.standingArmy.readiness < 25 ? "COLLAPSING" : mil.standingArmy.readiness < 50 ? "CRITICAL" : mil.standingArmy.readiness < 75 ? "STRAINED" : "STABLE"}
          severityLabel={mil.standingArmy.readiness < 25 ? "COLLAPSING" : mil.standingArmy.readiness < 50 ? "CRITICAL" : mil.standingArmy.readiness < 75 ? "STRAINED" : "STABLE"}
          headline={`Readiness ${Math.round(mil.standingArmy.readiness)} · requisitions reduce exposure and response time`}
          consequence="A stronger force reduces casualties, duration, and severity during an engagement. It cannot make an inbound threat harmless."
          details={(
            <View>
              <Text style={{ color: tc.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11 }}>
                {(state.activeWarOps ?? []).length} active war operation{(state.activeWarOps ?? []).length === 1 ? "" : "s"} · {Object.keys(pendingByUnit).length} training queues
              </Text>
              <RailReadinessBreakdown state={state} />
            </View>
          )}
          detailsLabel="FORCE STATUS / MITIGATION"
        />
        <TutorialHint
          id="military_intro"
          message="Garrison strength, drone fleets, and special forces are managed here. Wars are expensive, but defenseless cities get annexed. Maintain a credible deterrent."
        />
        <SectionHeader
          title={cat.label + " UNITS"}
          subtitle={`${cat.units.length} unit types — tap to requisition ×10`}
          icon={<MaterialCommunityIcons name="sword-cross" size={14} color={tc.accent} />}
        />
        {cat.units.map((def) => {
          const count = u[def.key] ?? 0;
          const canAfford = r.credits >= def.costPer10;
          // Task #528: show the (possibly discounted) training time on the
          // row itself, not just in the requisition modal. Compare against
          // the undiscounted base so the min-1-tick clamp doesn't falsely
          // mark an unchanged time as boosted.
          const trainTicks = getConstructionTicks("unit", def.key, undefined, state);
          const baseTrainTicks = getConstructionTicks("unit", def.key);
          const trainBoosted = trainTicks < baseTrainTicks;
          const timing = getTimedActionCostTiming(
            { cost: def.costPer10, duration: trainTicks },
            {
              availableCredits: r.credits,
              activeTicksRemaining: pendingByUnit[def.key]?.ticks,
              phase: pendingByUnit[def.key] ? "active" : undefined,
            },
          );
          return (
            <Pressable
              key={def.key}
              style={({ pressed }) => [styles.unitCard, !canAfford && styles.unitCardMuted, pressed && styles.unitCardPressed]}
              onPress={() => handleDeploy(def)}
              {...(Platform.OS === "web" ? { onContextMenu: (e: any) => openCtx(def.key, e) } : {})}
            >
              <View style={styles.unitLeft}>
                <View style={styles.unitCount}>
                  <Text style={[styles.unitCountText, count > 0 && styles.unitCountActive]}>
                    {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                  </Text>
                </View>
                <View style={styles.unitInfo}>
                  <Text style={[styles.unitLabel, !canAfford && styles.mutedText]}>{def.label}</Text>
                  <Text style={styles.unitDesc}>{def.description}</Text>
                  <Text style={styles.unitEffects}>{def.effects}</Text>
                  <Text style={{ color: trainBoosted ? tc.accent : tc.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, marginTop: 2 }}>
                    TRAINING: {trainTicks} tick{trainTicks === 1 ? "" : "s"}
                    {trainBoosted ? ` · BOOSTED −${Math.round(getTrainingSpeedReduction(state) * 100)}%` : ""}
                  </Text>
                  {pendingByUnit[def.key] && (
                    <Text style={{ color: tc.warning, fontFamily: "Inter_600SemiBold", fontSize: 9, marginTop: 2 }}>
                      {pendingByUnit[def.key].count} IN TRAINING · READY IN {pendingByUnit[def.key].ticks} TICK{pendingByUnit[def.key].ticks === 1 ? "" : "S"}
                      {" · "}ROLE · {pendingByUnit[def.key].battlefieldRole ?? getUnitRole(def) ?? "UNASSIGNED"}
                    </Text>
                  )}
                  <ActionCostTimingReadout model={timing} includeBehavior compact />
                  {(def.ammoUpkeep || def.fuelUpkeep) && (
                    <View style={styles.upkeepRow}>
                      {def.ammoUpkeep && <Text style={styles.upkeepTag}>{def.ammoUpkeep} AMMO/TICK</Text>}
                      {def.fuelUpkeep && <Text style={styles.upkeepTag}>{def.fuelUpkeep} FUEL/TICK</Text>}
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.unitRight}>
                <Text style={[styles.unitCost, !canAfford && styles.mutedText]}>
                  {def.costPer10 >= 1000 ? `${(def.costPer10 / 1000).toFixed(0)}k` : def.costPer10} cr
                </Text>
                <Text style={styles.unitPer}>per 10</Text>
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color={canAfford ? tc.accent : tc.borderDim} />
              </View>
            </Pressable>
          );
        })}
        <View style={{ height: 30 }} />
      </ScrollView>
    </>
  );

  const ARMY_BRANCHES = [
    { key: "infantry", label: "INFANTRY", icon: "walk" },
    { key: "armor", label: "ARMOR", icon: "tank" },
    { key: "artillery", label: "ARTILLERY", icon: "cannon" },
    { key: "airSupport", label: "AIR SUPPORT", icon: "helicopter" },
    { key: "specialOps", label: "SPEC OPS", icon: "ninja" },
    { key: "support", label: "SUPPORT", icon: "wrench" },
  ];

  const renderArmyTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="STANDING ARMY" subtitle={`Total strength: ${armyStrength}`} icon={<MaterialCommunityIcons name="shield-sword" size={14} color={tc.accent} />} />
      <View style={styles.armyStatRow}>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>TOTAL</Text>
          <Text style={styles.armyStatVal}>{mil.standingArmy.totalStrength}</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>DEPLOYED</Text>
          <Text style={[styles.armyStatVal, { color: tc.warning }]}>{mil.standingArmy.deployedOnMission}</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>MORALE</Text>
          <Text style={[styles.armyStatVal, { color: mil.standingArmy.morale >= 70 ? tc.accent : tc.danger }]}>{mil.standingArmy.morale}%</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>READINESS</Text>
          <Text style={[styles.armyStatVal, { color: mil.standingArmy.readiness >= 70 ? tc.accent : tc.danger }]}>{mil.standingArmy.readiness}%</Text>
        </View>
      </View>
      {readinessGuidance && (
        <View
          testID="military-readiness-guidance"
          style={{ borderWidth: 1, borderColor: tc.danger + "70", backgroundColor: tc.danger + "12", borderRadius: 4, padding: 10, marginBottom: 10 }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <MaterialCommunityIcons name={readinessGuidance.icon} size={15} color={tc.danger} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: tc.danger, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.6 }}>
                {readinessGuidance.title}
              </Text>
              <Text style={{ color: tc.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, marginTop: 3 }}>
                {readinessGuidance.detail}
              </Text>
            </View>
            <Pressable
              testID="military-readiness-guidance-action"
              onPress={() => setMilTab(readinessGuidance.actionTab)}
              style={{ borderWidth: 1, borderColor: tc.danger, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 6 }}
            >
              <Text style={{ color: tc.danger, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 }}>
                {readinessGuidance.actionLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <SectionHeader title="MANPOWER & LOGISTICS" subtitle="Personnel crew vehicles and man installations" icon={<MaterialCommunityIcons name="account-group" size={14} color={tc.accent} />} />
      <View style={styles.armyStatRow}>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>PERSONNEL</Text>
          <Text style={styles.armyStatVal}>{log.personnelTotal.toLocaleString()}</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>CREW</Text>
          <Text style={[styles.armyStatVal, { color: log.crewCoverage >= 0.9 ? tc.accent : log.crewCoverage >= 0.6 ? tc.warning : tc.danger }]}>{Math.round(log.crewCoverage * 100)}%</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>GARRISON</Text>
          <Text style={[styles.armyStatVal, { color: log.garrisonCoverage >= 0.9 ? tc.accent : log.garrisonCoverage >= 0.6 ? tc.warning : tc.danger }]}>{Math.round(log.garrisonCoverage * 100)}%</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>COMBAT MOD</Text>
          <Text style={[styles.armyStatVal, { color: log.combatReadinessMod >= 1 ? tc.accent : log.combatReadinessMod >= 0.85 ? tc.warning : tc.danger }]}>×{log.combatReadinessMod.toFixed(2)}</Text>
        </View>
      </View>
      <View style={{ borderWidth: 1, borderColor: tc.border, backgroundColor: tc.bgCard, borderRadius: 4, padding: 10, marginBottom: 8 }}>
        <Text style={{ color: tc.textSecondary, fontFamily: "Inter_500Medium", fontSize: 11 }}>
          Crew demand {log.crewDemand.toLocaleString()} · Garrison demand {log.garrisonDemand.toLocaleString()} · Personnel available {log.personnelTotal.toLocaleString()}
        </Text>
        {(log.crewCoverage < 1 || log.garrisonCoverage < 1) && (
          <Text style={{ color: tc.warning, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 4, lineHeight: 14 }}>
            Personnel shortfall — uncrewed vehicles and unmanned installations contribute reduced strength. Recruit more troops or shift allocation priority below.
          </Text>
        )}
      </View>
      <Text style={[styles.armyStatLabel, { marginBottom: 6, marginLeft: 2 }]}>ALLOCATION PRIORITY</Text>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
        {([
          { key: "balanced" as AllocationPriority, label: "BALANCED" },
          { key: "vehicles_first" as AllocationPriority, label: "CREW FIRST" },
          { key: "installations_first" as AllocationPriority, label: "MAN BASES" },
        ]).map((opt) => {
          const active = log.allocationPriority === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setMilitaryAllocationPriority(opt.key)}
              style={{ flex: 1, borderWidth: 1, borderColor: active ? tc.accent : tc.border, backgroundColor: active ? tc.accent + "1A" : tc.bgCard, borderRadius: 4, paddingVertical: 9, alignItems: "center" }}
            >
              <Text style={{ color: active ? tc.accent : tc.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 }}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {ARMY_BRANCHES.map(({ key, label, icon }) => {
        const val = mil.standingArmy[key as keyof typeof mil.standingArmy] ?? 0;
        return (
          <View key={key} style={styles.branchCard}>
            <View style={styles.branchLeft}>
              <MaterialCommunityIcons name={icon as any} size={18} color={tc.accent} />
              <View>
                <Text style={styles.branchLabel}>{label}</Text>
                <Text style={styles.branchCount}>{val} units</Text>
              </View>
            </View>
            <View style={styles.branchBtns}>
              <HoverTooltip text={`Reassign 10 ${label} units back to the general pool`}>
                <Pressable style={styles.branchBtn} onPress={() => assignToArmy(key, -10)}>
                  <Text style={styles.branchBtnText}>-10</Text>
                </Pressable>
              </HoverTooltip>
              <HoverTooltip text={`Assign 10 units to the ${label} branch`}>
                <Pressable style={styles.branchBtn} onPress={() => assignToArmy(key, 10)}>
                  <Text style={[styles.branchBtnText, { color: tc.accent }]}>+10</Text>
                </Pressable>
              </HoverTooltip>
              <HoverTooltip text={`Assign 50 units to the ${label} branch`}>
                <Pressable style={styles.branchBtn} onPress={() => assignToArmy(key, 50)}>
                  <Text style={[styles.branchBtnText, { color: tc.accent }]}>+50</Text>
                </Pressable>
              </HoverTooltip>
            </View>
          </View>
        );
      })}
      <View style={{ height: 30 }} />
    </ScrollView>
  );

  const renderPoliciesTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="MILITARY DOCTRINE" subtitle={`${mil.activePolicies.length} active policies`} icon={<MaterialCommunityIcons name="book-open-variant" size={14} color={tc.accent} />} />
      {MILITARY_POLICIES.map((pol) => {
        const isActive = mil.activePolicies.includes(pol.id);
        return (
          <Pressable key={pol.id} style={[styles.policyCard, isActive && styles.policyCardActive]} onPress={() => toggleMilitaryPolicy(pol.id)}>
            <View style={styles.policyTop}>
              <Text style={[styles.policyName, isActive && { color: tc.accent }]}>{pol.name}</Text>
              <View style={[styles.policyBadge, isActive && { backgroundColor: tc.accent }]}>
                <Text style={[styles.policyBadgeText, isActive && { color: tc.bg }]}>{isActive ? "ACTIVE" : pol.category.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.policyDesc}>{pol.description}</Text>
            <View style={styles.policyEffects}>
              {Object.entries(pol.effects).filter(([, v]) => v !== 0 && v !== undefined).map(([k, v]) => (
                <Text key={k} style={[styles.effectTag, { color: (v as number) > 0 ? tc.accent : tc.danger }]}>
                  {k}: {(v as number) > 0 ? "+" : ""}{v}
                </Text>
              ))}
            </View>
          </Pressable>
        );
      })}
      <View style={{ height: 30 }} />
    </ScrollView>
  );

  const renderDefenseTab = () => {
    const cbt = state.combat;
    const tierMap = buildUnitTierMultiplierMap(state);
    const baseStr = computeUnitCompositionStrength(state.units as Record<string, number>);
    const upStr = computeUnitCompositionStrength(state.units as Record<string, number>, tierMap);
    const upgradeFactor = baseStr > 0 ? upStr / baseStr : 1;
    const cs = state.cityStats;
    const zones = cbt?.zones ?? [];
    // Task #233: filter the recent battle log by factionSource. Filter
    // before the .slice(0, 10) cap so a faction with only a few fights
    // doesn't get hidden behind ten unrelated recent engagements. Entries
    // without a factionSource (legacy saves / non-raid logs) only appear
    // under "All".
    const logAll = (cbt?.battleLog ?? []).slice().reverse();
    const logFiltered = logFactionFilter === "all"
      ? logAll
      : logAll.filter((b: any) => b.factionSource === logFactionFilter);
    const log = logFiltered.slice(0, 10);
    const activeRaids = (cbt?.raidEventQueue ?? []).filter((r: any) => r.status !== "repelled" && r.status !== "breached");

    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <DefenseBreakdownCard state={state} />
        <SectionHeader
          title="ZONE DEFENSE STATUS"
          subtitle={`Tier upgrade multiplier: ×${upgradeFactor.toFixed(2)}  ·  Base def rating: ${cs.defenseRating}`}
          icon={<MaterialCommunityIcons name="shield-home" size={14} color={tc.accent} />}
        />

        {activeRaids.length > 0 && (
          <View style={{ borderColor: tc.danger, borderWidth: 1, backgroundColor: tc.danger + "1A", padding: 8, marginBottom: 8, borderRadius: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: activeRaids.length > 0 ? 6 : 0 }}>
              <MaterialCommunityIcons name="alert-octagon" size={14} color={tc.danger} />
              <Text style={{ color: tc.danger, fontFamily: "Inter_700Bold", fontSize: 11, marginLeft: 6 }}>
                {activeRaids.length} ACTIVE RAID{activeRaids.length > 1 ? "S" : ""} INBOUND
              </Text>
            </View>
            {/* Task #222: per-raid breakdown so the player sees *who* the
                hostiles are ("Hostiles spotted: 6× Rust-Pack Bikers,
                2× Slag-Cannon Crew") instead of just an enemyStrength
                number. composition is optional on HostileRaidEvent — old
                save-loaded raids fall back to the strength-only line. */}
            {activeRaids.map((r: any) => {
              const zoneName = (cbt?.zones ?? []).find((z: any) => z.id === r.targetZoneId)?.name ?? r.targetZoneId;
              const spotted = r.composition ? formatHostilesSpotted(r.composition, r.factionSource) : "";
              return (
                <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: tc.danger + "33", paddingTop: 6, marginTop: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: tc.text, fontFamily: "Inter_700Bold", fontSize: 11 }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={{ color: tc.danger, fontFamily: "Inter_700Bold", fontSize: 10 }}>
                      STR {r.enemyStrength}
                    </Text>
                  </View>
                  <Text style={{ color: tc.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 1 }} numberOfLines={1}>
                    Target: {zoneName} · ETA {r.ticksRemaining} ticks · {String(r.status).toUpperCase()}
                  </Text>
                  {spotted.length > 0 && (
                    <Text style={{ color: tc.warning, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 3, lineHeight: 14 }}>
                      Hostiles spotted: {spotted}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {zones.length === 0 && (
          <EmptyState
            icon="shield-outline"
            title="NO COMBAT ZONES"
            message="Combat zones appear when factions become hostile or your forces deploy abroad."
          />
        )}

        {zones.map((z: any) => {
          const _g = z.garrison ?? 0;
          const _dr = cs.defenseRating ?? 0;
          const garrisonDef = (_g * 8 + _dr * 3) * upgradeFactor;
          const statusColor =
            z.status === "friendly" ? tc.accent :
            z.status === "contested" ? tc.warning :
            z.status === "hostile" ? tc.danger :
            z.status === "devastated" ? tc.textMuted : tc.text;
          return (
            <View key={z.id} style={{ borderWidth: 1, borderColor: tc.border, backgroundColor: tc.bgCard, padding: 10, marginBottom: 8, borderRadius: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ color: tc.text, fontFamily: "Inter_700Bold", fontSize: 12 }}>{z.name}</Text>
                <Text style={{ color: statusColor, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>{String(z.status).toUpperCase()}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ color: tc.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10 }}>
                  Garrison: {(z.garrison ?? 0).toLocaleString()} / {(z.maxGarrison ?? 0).toLocaleString()}
                </Text>
                <Text style={{ color: tc.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10 }}>
                  Threat: {Math.round(z.threat ?? 0)}
                </Text>
                <Text style={{ color: tc.accent, fontFamily: "Inter_700Bold", fontSize: 10 }}>
                  Eff. Def: {Math.round(garrisonDef ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Task #226: lifetime per-archetype kill tally. Empty until the
            player resolves at least one repelled raid; once populated,
            the new faction archetypes feel like trophies the player has
            personally collected, not just flavor on a single fight. */}
        {(() => {
          const tally = cbt?.enemiesDefeatedByArchetype;
          const rankedAll = rankArchetypeKills(tally);
          if (rankedAll.length === 0) return null;
          // Task #228: filter the ranked list to a single factionSource
          // bucket. Archetypes whose id isn't in any roster (legacy saves /
          // renamed units) only show under "All" so they don't disappear.
          const ranked = killFactionFilter === "all"
            ? rankedAll
            : rankedAll.filter((r) => ARCHETYPE_FACTION_INDEX.get(r.id) === killFactionFilter);
          const top = ranked.slice(0, 8);
          const totalKilled = ranked.reduce((acc, r) => acc + r.count, 0);
          const factionLabel = killFactionFilter === "all"
            ? null
            : (KILL_FACTION_FILTERS.find((f) => f.key === killFactionFilter)?.label ?? killFactionFilter);
          const subtitle = ranked.length === 0
            ? `No ${factionLabel ?? ""} kills recorded yet`.replace(/\s+/g, " ").trim()
            : factionLabel
              ? `${totalKilled.toLocaleString()} ${factionLabel} put down across ${ranked.length} archetype${ranked.length === 1 ? "" : "s"}`
              : `${totalKilled.toLocaleString()} put down across ${ranked.length} archetype${ranked.length === 1 ? "" : "s"}`;
          return (
            <>
              <SectionHeader
                title="HOSTILES DEFEATED TO DATE"
                subtitle={subtitle}
                icon={<MaterialCommunityIcons name="skull-crossbones" size={14} color={tc.accent} />}
              />
              <ScrollView ref={killFilterStripRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.opFilterScroll}>
                <Pressable
                  onPress={() => setKillFactionFilter("all")}
                  style={[styles.opFilterChip, killFactionFilter === "all" && styles.opFilterChipActive]}
                >
                  <Text style={[styles.opFilterText, killFactionFilter === "all" && styles.opFilterTextActive]}>
                    ALL ({rankedAll.length})
                  </Text>
                </Pressable>
                {KILL_FACTION_FILTERS.map((f) => {
                  const count = rankedAll.filter((r) => ARCHETYPE_FACTION_INDEX.get(r.id) === f.key).length;
                  const active = killFactionFilter === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setKillFactionFilter(f.key)}
                      style={[styles.opFilterChip, active && styles.opFilterChipActive]}
                    >
                      <Text style={[styles.opFilterText, active && styles.opFilterTextActive]}>
                        {f.label.toUpperCase()} ({count})
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={{ borderWidth: 1, borderColor: tc.border, backgroundColor: tc.bgCard, padding: 10, marginBottom: 8, borderRadius: 4 }}>
                {ranked.length === 0 && (
                  <Text style={{ color: tc.textMuted, fontFamily: "Inter_400Regular", fontSize: 11 }}>
                    No kills recorded for this faction yet.
                  </Text>
                )}
                {top.map((row, idx) => {
                  // Task #234: show a small faction tag next to each archetype
                  // when viewing "All" so the owning faction is scannable. We
                  // hide it once a faction filter is active because every row
                  // would carry the same tag and just add noise.
                  const factionKey = ARCHETYPE_FACTION_INDEX.get(row.id);
                  const factionTag = killFactionFilter === "all" && factionKey
                    ? (KILL_FACTION_FILTERS.find((f) => f.key === factionKey)?.label ?? null)
                    : null;
                  return (
                    <View
                      key={row.id}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingVertical: 4,
                        borderTopWidth: idx === 0 ? 0 : 1,
                        borderTopColor: tc.border + "55",
                      }}
                    >
                      <Text
                        style={{ color: tc.text, fontFamily: "Inter_500Medium", fontSize: 11, flex: 1 }}
                        numberOfLines={1}
                      >
                        {row.displayName}
                      </Text>
                      {factionTag && (
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: (factionKey && KILL_FACTION_COLORS[factionKey]) || tc.border,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            borderRadius: 3,
                            marginLeft: 6,
                          }}
                        >
                          <Text style={{ color: (factionKey && KILL_FACTION_COLORS[factionKey]) || tc.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 }}>
                            {factionTag.toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={{ color: tc.accent, fontFamily: "Inter_700Bold", fontSize: 11, marginLeft: 8 }}>
                        {row.count.toLocaleString()}×
                      </Text>
                    </View>
                  );
                })}
                {ranked.length > top.length && (
                  <Text style={{ color: tc.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 6 }}>
                    +{ranked.length - top.length} more archetype{ranked.length - top.length === 1 ? "" : "s"}
                  </Text>
                )}
              </View>
            </>
          );
        })()}

        {/* Task #233: faction chip filter for the BATTLE LOG, mirroring
            the row above the Hostiles Defeated tally. Counts reflect the
            number of matching entries in the full reversed log (capped at
            the most recent 10 in the list itself). */}
        {(() => {
          const logFactionLabel = logFactionFilter === "all"
            ? null
            : (KILL_FACTION_FILTERS.find((f) => f.key === logFactionFilter)?.label ?? logFactionFilter);
          const subtitle = logAll.length === 0
            ? "No engagements yet"
            : logFactionLabel
              ? `Last ${log.length} ${logFactionLabel} engagement${log.length === 1 ? "" : "s"} (of ${logFiltered.length} matching)`
              : `Last ${log.length} engagement${log.length === 1 ? "" : "s"}`;
          return (
            <>
              <SectionHeader
                title="BATTLE LOG"
                subtitle={subtitle}
                icon={<MaterialCommunityIcons name="book-open-page-variant" size={14} color={tc.accent} />}
              />
              {logAll.length > 0 && (
                <ScrollView ref={battleLogFilterStripRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.opFilterScroll}>
                  <Pressable
                    onPress={() => setLogFactionFilter("all")}
                    style={[styles.opFilterChip, logFactionFilter === "all" && styles.opFilterChipActive]}
                  >
                    <Text style={[styles.opFilterText, logFactionFilter === "all" && styles.opFilterTextActive]}>
                      ALL ({logAll.length})
                    </Text>
                  </Pressable>
                  {KILL_FACTION_FILTERS.map((f) => {
                    const count = logAll.filter((b: any) => b.factionSource === f.key).length;
                    const active = logFactionFilter === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        onPress={() => setLogFactionFilter(f.key)}
                        style={[styles.opFilterChip, active && styles.opFilterChipActive]}
                      >
                        <Text style={[styles.opFilterText, active && styles.opFilterTextActive]}>
                          {f.label.toUpperCase()} ({count})
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </>
          );
        })()}
        {logAll.length === 0 && (
          <EmptyState
            icon="book-open-page-variant"
            title="NO ENGAGEMENTS YET"
            message="Battle outcomes will be recorded here as your garrisons clash with hostile forces."
          />
        )}
        {logAll.length > 0 && log.length === 0 && (
          <View style={{ borderWidth: 1, borderColor: tc.border, backgroundColor: tc.bgCard, padding: 10, marginBottom: 8, borderRadius: 4 }}>
            <Text style={{ color: tc.textMuted, fontFamily: "Inter_400Regular", fontSize: 11 }}>
              No engagements recorded for this faction yet.
            </Text>
          </View>
        )}
        {log.map((b: any) => {
          const c = b.victory ? tc.accent : tc.danger;
          const dateLabel = b.timestamp ? `Y${b.timestamp.year}.${String(b.timestamp.day).padStart(3, "0")}` : `T${b.tick}`;
          return (
            <Pressable
              key={b.id}
              onPress={() => {
                // Task #223: surface the per-raid composition (and the
                // per-archetype losses we recorded at resolution time) in
                // the debrief modal so the new faction archetypes pay off
                // in the after-action view, not just the inbound card.
                // composition / factionSource / enemyLosses are optional —
                // non-raid log entries and old saves render the original
                // four-line summary unchanged.
                // Task #235: line construction is shared with the engine
                // helper so non-raid engagements get the same Hostiles /
                // Losses-by-unit breakdown raid entries do, and the test
                // suite asserts against the exact same code.
                const lines = buildBattleLogDetailLines(b);
                showModal(
                  `${b.victory ? "VICTORY" : "DEFEAT"}: ${b.engagementName}`,
                  lines.join("\n"),
                  [{ text: "OK", style: "cancel" as const }],
                );
              }}
              style={{ borderWidth: 1, borderColor: c + "60", backgroundColor: c + "10", padding: 8, marginBottom: 6, borderRadius: 4 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: tc.text, fontFamily: "Inter_700Bold", fontSize: 11 }} numberOfLines={1}>
                    {b.engagementName}
                  </Text>
                  <Text style={{ color: tc.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 2 }}>
                    {dateLabel}  ·  {b.doctrineUsed}  ·  Dominance {b.dominance}%
                  </Text>
                </View>
                <Text style={{ color: c, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1, marginLeft: 8 }}>
                  {b.victory ? "WIN" : "LOSS"}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <View style={{ height: 30 }} />
      </ScrollView>
    );
  };

  const renderProductionTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="SUPPLY CHAINS" subtitle="Military production overview" icon={<MaterialCommunityIcons name="factory" size={14} color={tc.accent} />} />
      <View style={styles.armyStatRow}>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>AMMO/TICK</Text>
          <Text style={styles.armyStatVal}>{mil.production.ammoPerTick}</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>FUEL/TICK</Text>
          <Text style={styles.armyStatVal}>{mil.production.fuelPerTick}</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>STEEL/TICK</Text>
          <Text style={styles.armyStatVal}>{mil.production.steelPerTick}</Text>
        </View>
      </View>

      {(() => {
        const st = log.supplyStatus;
        const statusColor = st === "surplus" || st === "stable" ? tc.accent : st === "shortage" ? tc.warning : tc.danger;
        const rows = [
          { key: "ammo", label: "AMMO", prod: log.lastProduction.ammo, cons: log.lastConsumption.ammo, ticks: log.suppliesTicksRemaining.ammo },
          { key: "fuel", label: "FUEL", prod: log.lastProduction.fuel, cons: log.lastConsumption.fuel, ticks: log.suppliesTicksRemaining.fuel },
          { key: "rations", label: `RATIONS → FOOD POOL  ·  ${Math.round(r.food)} FOOD`, prod: log.lastProduction.rations, cons: log.lastConsumption.rations, ticks: log.suppliesTicksRemaining.rations },
        ];
        return (
          <View style={{ borderWidth: 1, borderColor: tc.border, backgroundColor: tc.bgCard, borderRadius: 4, padding: 10, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ color: tc.text, fontFamily: "Inter_700Bold", fontSize: 12 }}>LOGISTICS THROUGHPUT</Text>
              <View style={{ borderWidth: 1, borderColor: statusColor, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: statusColor, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8 }}>{st.toUpperCase()}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", paddingBottom: 4 }}>
              <Text style={{ flex: 1, color: tc.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.6 }}>SUPPLY</Text>
              <Text style={{ width: 56, textAlign: "right", color: tc.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.4 }}>PROD / USE</Text>
              <Text style={{ width: 38, textAlign: "right", color: tc.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.4 }}>NET</Text>
              <Text style={{ width: 38, textAlign: "right", color: tc.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.4 }}>LASTS</Text>
            </View>
            {rows.map((row) => {
              const net = row.prod - row.cons;
              return (
                <View
                  key={row.key}
                  testID={`military-supply-row-${row.key}`}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, borderTopWidth: 1, borderTopColor: tc.border }}
                >
                  <Text
                    testID={`military-supply-label-${row.key}`}
                    style={{ flex: 1, minWidth: 0, color: tc.textSecondary, fontFamily: "Inter_500Medium", fontSize: 11 }}
                  >
                    {row.label}
                  </Text>
                  <Text style={{ width: 56, textAlign: "right", color: tc.textMuted, fontFamily: "Inter_500Medium", fontSize: 10 }}>{Math.round(row.prod)} / {Math.round(row.cons)}</Text>
                  <Text style={{ width: 38, textAlign: "right", color: net >= 0 ? tc.accent : tc.danger, fontFamily: "Inter_700Bold", fontSize: 10 }}>{net >= 0 ? "+" : ""}{Math.round(net)}</Text>
                  <Text style={{ width: 38, textAlign: "right", color: net >= 0 ? tc.textMuted : (row.ticks < 10 ? tc.danger : tc.warning), fontFamily: "Inter_500Medium", fontSize: 10 }}>{net >= 0 ? "∞" : `${Math.round(row.ticks)}t`}</Text>
                </View>
              );
            })}
          </View>
        );
      })()}

      {(() => {
        const foodReserve = getResourceStorageStatus(state, "food");
        const fuelReserve = getResourceStorageStatus(state, "fuel");
        const reserveRows = [
          {
            key: "ammo",
            label: "ARMY AMMUNITION",
            balance: formatNumber(Math.max(0, r.ammo)),
            path: "resources.ammo",
            accounting: "Manned military installations produce it; army ammunition upkeep is charged here.",
          },
          {
            key: "fuel",
            label: "CITY FUEL RESERVE",
            balance: `${formatNumber(fuelReserve.current)} / ${formatNumber(fuelReserve.capacity)}`,
            path: "resources.fuel",
            accounting: "Economy and manned military installations feed this city reserve; Fuel Reserve Tank Farms expand its capacity.",
          },
          {
            key: "food",
            label: "SHARED FOOD RESERVE",
            balance: `${formatNumber(foodReserve.current)} / ${formatNumber(foodReserve.capacity)}`,
            path: "resources.food",
            accounting: "Civilian food and military rations share this reserve; rations are consumed from it.",
          },
        ];
        const stockpileRows = [
          {
            key: "ammo",
            label: "FIELD AMMO",
            accounting: "Zone/resource-node yields; does not refill the Army ammunition reserve.",
          },
          {
            key: "fuel",
            label: "FIELD FUEL",
            accounting: "Zone/resource-node yields; does not refill the city fuel reserve.",
          },
          {
            key: "vehicleParts",
            label: "VEHICLE PARTS",
            accounting: "Manned military installations deposit output here for vehicle logistics.",
          },
        ];
        return (
          <>
            <View testID="military-top-level-reserves" style={{ borderWidth: 1, borderColor: tc.border, backgroundColor: tc.bgCard, borderRadius: 4, padding: 10, marginBottom: 10 }}>
              <Text style={{ color: tc.text, fontFamily: "Inter_700Bold", fontSize: 12, marginBottom: 2 }}>TOP-LEVEL CITY RESERVES</Text>
              <Text style={{ color: tc.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, marginBottom: 7 }}>
                These are the balances used by the active Army supply accounting path.
              </Text>
              {reserveRows.map((row) => (
                <View
                  key={row.key}
                  testID={`military-top-level-reserve-row-${row.key}`}
                  style={{ borderTopWidth: 1, borderTopColor: tc.border, paddingVertical: 6 }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ flex: 1, color: tc.textSecondary, fontFamily: "Inter_700Bold", fontSize: 10 }}>{row.label}</Text>
                    <Text style={{ width: 110, flexShrink: 0, textAlign: "right", color: tc.accent, fontFamily: "Inter_700Bold", fontSize: 10 }}>{row.balance}</Text>
                  </View>
                  <Text style={{ color: tc.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 2 }}>
                    {row.path} · {row.accounting}
                  </Text>
                </View>
              ))}
            </View>

            <View testID="military-logistics-stockpiles" style={{ borderWidth: 1, borderColor: tc.info + "55", backgroundColor: tc.bgCard, borderRadius: 4, padding: 10, marginBottom: 10 }}>
              <Text style={{ color: tc.info, fontFamily: "Inter_700Bold", fontSize: 12, marginBottom: 2 }}>SEPARATE LOGISTICS STOCKPILES</Text>
              <Text style={{ color: tc.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, marginBottom: 7 }}>
                {LOGISTICS_STOCKPILE_POLICY.description} Entries remain independent per-item balances.
              </Text>
              {stockpileRows.map((row) => (
                <View
                  key={row.key}
                  testID={`military-logistics-stockpile-row-${row.key}`}
                  style={{ borderTopWidth: 1, borderTopColor: tc.border, paddingVertical: 6 }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ flex: 1, color: tc.textSecondary, fontFamily: "Inter_700Bold", fontSize: 10 }}>{row.label}</Text>
                    <Text style={{ width: 110, flexShrink: 0, textAlign: "right", color: tc.info, fontFamily: "Inter_700Bold", fontSize: 10 }}>
                      {formatNumber(getLogisticsStockpileBalance(state, row.key))}
                    </Text>
                  </View>
                  <Text style={{ color: tc.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 2 }}>
                    stockpiles.{row.key} · {row.accounting}
                  </Text>
                </View>
              ))}
              <Text testID="military-rations-accounting" style={{ color: tc.warning, fontFamily: "Inter_500Medium", fontSize: 9, lineHeight: 14, marginTop: 4 }}>
                RATIONS ARE NOT A SEPARATE STOCKPILE ITEM — military rations enter and leave resources.food.
              </Text>
            </View>
          </>
        );
      })()}

      <View style={styles.econNote}>
        <Text style={styles.econNoteTitle}>WHERE ARMY SUPPLY COMES FROM</Text>
        <Text style={styles.econNoteBody}>
          Ammo, fuel, rations and vehicle parts for your army are produced by the MANNED military installations below (build them in the BASES tab). Army rations are stored in and consumed from the shared Food pool. Output scales with garrison coverage — currently {Math.round((log.garrisonCoverage ?? 1) * 100)}% staffed, so understaffed bases make less.
        </Text>
        <Text style={styles.econNoteBody}>
          Civilian factories such as Ammunition Press Lines instead make trade commodities (e.g. Ammunition Crates) into your stockpiles. That is a SEPARATE economy — it does NOT refill the army ammo pool. Use the Production Chains screen to trace any resource.
        </Text>
      </View>

      {listInstallationProduction().map((inst) => (
        <View key={inst.id} style={styles.prodCard}>
          <Text style={styles.prodName}>{inst.name.toUpperCase()}</Text>
          <View style={styles.prodIO}>
            <Text style={styles.prodLabel}>OUTPUT / TICK: <Text style={[styles.prodVal, { color: tc.accent }]}>{inst.outputs.map((o) => `${o.qty} ${o.name}`).join(" · ")}</Text></Text>
            <Text style={styles.prodLabel}>MANNING: <Text style={styles.prodVal}>{inst.personnel} personnel each</Text></Text>
            <Text style={styles.prodLabel}>At full manning — output scales with garrison coverage.</Text>
          </View>
        </View>
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
  );

  const renderResearchTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="MILITARY R&D" subtitle={`${mil.completedResearch.length}/${MILITARY_RESEARCH.length} completed`} icon={<MaterialCommunityIcons name="flask" size={14} color={tc.accent} />} />
      {mil.activeResearch && (
        <View style={styles.activeResearchCard}>
          <Text style={styles.activeResLabel}>RESEARCHING: {MILITARY_RESEARCH.find((t) => t.id === mil.activeResearch?.techId)?.name ?? "UNKNOWN"}</Text>
          <StatBar label="Progress" value={mil.activeResearch.totalTicks > 0 ? (mil.activeResearch.progress / mil.activeResearch.totalTicks) * 100 : 0} compact />
          <Text style={styles.activeResTicks}>{mil.activeResearch.progress}/{mil.activeResearch.totalTicks} ticks</Text>
          {(() => {
            const activeTech = MILITARY_RESEARCH.find((t) => t.id === mil.activeResearch?.techId);
            return activeTech ? (
              <ActionCostTimingReadout
                model={getTimedActionCostTiming(
                  { cost: activeTech.cost, duration: activeTech.ticksToComplete },
                  {
                    activeTicksRemaining: Math.max(0, activeTech.ticksToComplete - mil.activeResearch.progress),
                    phase: "active",
                  },
                )}
                compact
              />
            ) : null;
          })()}
        </View>
      )}
      {MILITARY_RESEARCH.map((tech) => {
        const completed = mil.completedResearch.includes(tech.id);
        const prereqMet = !tech.prerequisite || mil.completedResearch.includes(tech.prerequisite);
        const canStart = !completed && !mil.activeResearch && prereqMet && r.credits >= tech.cost;
        const timing = getTimedActionCostTiming(
          { cost: tech.cost, duration: tech.ticksToComplete },
          { availableCredits: r.credits },
        );
        return (
          <Pressable
            key={tech.id}
            style={[styles.techCard, completed && styles.techCompleted, !prereqMet && styles.techLocked]}
            onPress={() => {
              if (completed) return;
              if (!prereqMet) { showModal("LOCKED", `Requires: ${MILITARY_RESEARCH.find((t) => t.id === tech.prerequisite)?.name ?? tech.prerequisite}`, [{ text: "OK", style: "cancel" }]); return; }
              if (mil.activeResearch) { showModal("BUSY", "Another project is in progress.", [{ text: "OK", style: "cancel" }]); return; }
              if (r.credits < tech.cost) { showModal("INSUFFICIENT FUNDS", `Requires ${tech.cost.toLocaleString()} cr.`, [{ text: "OK", style: "cancel" }]); return; }
              showModal(`START: ${tech.name}`, `${tech.description}\n\n${formatActionCostTimingSummary(timing)}`, [
                { text: "CANCEL", style: "cancel" },
                { text: "BEGIN", style: "destructive", onPress: () => startMilitaryResearch(tech.id) },
              ]);
            }}
          >
            <View style={styles.techTop}>
              <Text style={[styles.techName, completed && { color: tc.accent }]}>{tech.name}</Text>
              {completed ? (
                <MaterialCommunityIcons name="check-circle" size={16} color={tc.accent} />
              ) : (
                <Text style={[styles.techCost, canStart ? { color: tc.accent } : { color: tc.textMuted }]}>{tech.cost.toLocaleString()} cr</Text>
              )}
            </View>
            <Text style={styles.techDesc}>{tech.description}</Text>
            <Text style={styles.techTier}>{tech.category.toUpperCase()}</Text>
            {!completed && <ActionCostTimingReadout model={timing} includeBehavior compact />}
          </Pressable>
        );
      })}
      <View style={{ height: 30 }} />
    </ScrollView>
  );

  const renderWarOpsTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="STRATEGIC OPERATIONS" subtitle={`${WAR_ROOM_OPS.length} operations available — authorize for defense bonuses`} icon={<MaterialCommunityIcons name="monitor-dashboard" size={14} color={tc.accent} />} />
      <View style={styles.armyStatRow}>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>DEFENSE</Text>
          <Text style={[styles.armyStatVal, { color: state.cityStats.defenseRating > 50 ? tc.accent : tc.danger }]}>{state.cityStats.defenseRating}</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>CREDITS</Text>
          <Text style={styles.armyStatVal}>{Math.floor(r.credits / 1000)}K</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>AMMO</Text>
          <Text style={[styles.armyStatVal, { color: r.ammo > 100 ? tc.accent : tc.danger }]}>{r.ammo.toLocaleString()}</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>FUEL</Text>
          <Text style={[styles.armyStatVal, { color: r.fuel > 50 ? tc.accent : tc.warning }]}>{r.fuel.toLocaleString()}</Text>
        </View>
      </View>
      {state.nuclearStockpile && state.nuclearStockpile.warheads > 0 && (() => {
        const nuke = state.nuclearStockpile!;
        const tier = nuke.deterrenceLevel >= 75 ? "APOCALYPTIC" : nuke.deterrenceLevel >= 50 ? "STRATEGIC" : nuke.deterrenceLevel >= 25 ? "CREDIBLE" : "MARGINAL";
        const tierColor = nuke.deterrenceLevel >= 75 ? tc.danger : nuke.deterrenceLevel >= 50 ? tc.warning : nuke.deterrenceLevel >= 25 ? tc.info : tc.textMuted;
        return (
          <View style={[styles.warOpCard, { borderColor: tierColor + "60", marginBottom: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.warOpName}>NUCLEAR DETERRENCE</Text>
              <Text style={styles.warOpDesc}>{nuke.warheads} warheads — production {nuke.productionRate}/tick — upkeep {nuke.maintenanceCost.toLocaleString()} cr/tick</Text>
              <View style={[styles.warOpProgressOuter, { backgroundColor: tc.bg, borderColor: tc.border }]}>
                <View style={[styles.warOpProgressInner, { width: `${Math.min(100, nuke.deterrenceLevel)}%`, backgroundColor: tierColor }]} />
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.warOpDef, { color: tierColor }]}>{tier}</Text>
              <Text style={styles.warOpDesc}>{nuke.deterrenceLevel}/100</Text>
            </View>
          </View>
        );
      })()}
      {(state.activeWarOps ?? []).length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[styles.armyStatLabel, { marginBottom: 6 }]}>ACTIVE OPERATIONS</Text>
          {(state.activeWarOps ?? []).map((w) => {
            const opDef = WAR_ROOM_OPS.find(o => o.id === w.opId);
            const totalDuration = opDef ? getWarRoomOpDuration(opDef) : Math.max(1, w.ticksRemaining);
            const timing = opDef
              ? getTimedActionCostTiming(
                { cost: opDef.cost, duration: totalDuration },
                { activeTicksRemaining: w.ticksRemaining, phase: "active" },
              )
              : null;
            const elapsed = Math.max(0, Math.min(totalDuration, totalDuration - w.ticksRemaining));
            const progressPct = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
            return (
              <View key={w.opId} style={[styles.warOpCard, { borderColor: tc.accent + "60" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.warOpName}>{opDef?.name ?? w.opId}</Text>
                  <Text style={styles.warOpDesc}>{elapsed} / {totalDuration} ticks — {w.ticksRemaining} remaining</Text>
                  {timing && <ActionCostTimingReadout model={timing} compact />}
                  <View style={[styles.warOpProgressOuter, { backgroundColor: tc.bg, borderColor: tc.border }]}>
                    <View style={[styles.warOpProgressInner, { width: `${progressPct}%`, backgroundColor: tc.accent }]} />
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.warOpDef, { color: tc.accent }]}>+{opDef?.defenseBonus ?? 0} DEF</Text>
                  <Text style={[styles.warOpDesc, { color: tc.warning }]}>IN PROGRESS</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
      <ScrollView ref={opFilterStripRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.opFilterScroll}>
        <Pressable onPress={() => setOpFilter("all")} style={[styles.opFilterChip, opFilter === "all" && styles.opFilterChipActive]}>
          <Text style={[styles.opFilterText, opFilter === "all" && styles.opFilterTextActive]}>ALL ({WAR_ROOM_OPS.length})</Text>
        </Pressable>
        {(Object.keys(WAR_OP_CATEGORIES) as WarOpCategory[]).map(c => {
          const count = WAR_ROOM_OPS_COUNT_BY_TYPE[c] ?? 0;
          if (count === 0) return null;
          return (
            <Pressable key={c} onPress={() => setOpFilter(c)} style={[styles.opFilterChip, opFilter === c && { backgroundColor: WAR_OP_CATEGORY_COLORS[c] + "30", borderColor: WAR_OP_CATEGORY_COLORS[c] }]}>
              <Text style={[styles.opFilterText, opFilter === c && { color: WAR_OP_CATEGORY_COLORS[c] }]}>{WAR_OP_CATEGORIES[c]} ({count})</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {filteredOps.map(op => {
        const timing = getTimedActionCostTiming(
          { cost: op.cost, duration: getWarRoomOpDuration(op) },
          { availableCredits: r.credits },
        );
        return (
        <Pressable key={op.id} style={styles.warOpCard} onPress={() => executeWarOp(op)}>
          <View style={[styles.warOpBadge, { backgroundColor: (WAR_OP_CATEGORY_COLORS[op.type] ?? tc.accent) + "30" }]}>
            <Text style={[styles.warOpBadgeText, { color: WAR_OP_CATEGORY_COLORS[op.type] ?? tc.accent }]}>{op.type.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.warOpName}>{op.name}</Text>
            <Text style={styles.warOpDesc}>{op.description}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.warOpCost, { color: r.credits >= op.cost ? tc.accent : tc.danger }]}>{op.cost >= 1000 ? (op.cost / 1000).toFixed(0) + "K" : op.cost}</Text>
            <Text style={styles.warOpDef}>+{op.defenseBonus} DEF</Text>
          </View>
          <ActionCostTimingReadout model={timing} compact />
        </Pressable>
        );
      })}
      <View style={{ height: 30 }} />
    </ScrollView>
  );

  const renderOrdnanceTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="ORDNANCE INVENTORY" subtitle={`${ORDNANCE_INVENTORY.length} items in stockpile`} icon={<MaterialCommunityIcons name="ammunition" size={14} color={tc.accent} />} />
      <View style={styles.armyStatRow}>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>ITEMS</Text>
          <Text style={styles.armyStatVal}>{ORDNANCE_INVENTORY.length}</Text>
        </View>
        <View style={styles.armyStat}>
          <Text style={styles.armyStatLabel}>TOTAL VALUE</Text>
          <Text style={[styles.armyStatVal, { color: tc.accent }]}>{(ORDNANCE_INVENTORY.reduce((sum, i) => sum + i.quantity * i.costPerUnit, 0) / 1000000).toFixed(1)}M</Text>
        </View>
      </View>
      <ScrollView ref={ordFilterStripRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.opFilterScroll}>
        <Pressable onPress={() => setOrdFilter("all")} style={[styles.opFilterChip, ordFilter === "all" && styles.opFilterChipActive]}>
          <Text style={[styles.opFilterText, ordFilter === "all" && styles.opFilterTextActive]}>ALL</Text>
        </Pressable>
        {(Object.keys(ORDNANCE_CATEGORIES) as OrdnanceCategory[]).map(c => (
          <Pressable key={c} onPress={() => setOrdFilter(c)} style={[styles.opFilterChip, ordFilter === c && styles.opFilterChipActive]}>
            <Text style={[styles.opFilterText, ordFilter === c && styles.opFilterTextActive]}>{ORDNANCE_CATEGORIES[c]}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {filteredOrd.map(item => (
        <View key={item.id} style={styles.ordCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.warOpName}>{item.name}</Text>
            <Text style={styles.warOpDesc}>{item.description}</Text>
            <Text style={styles.ordMeta}>{ORDNANCE_CATEGORIES[item.category]} — {item.costPerUnit.toLocaleString()} CR/unit</Text>
          </View>
          <View style={{ alignItems: "center", minWidth: 60 }}>
            <Text style={[styles.ordQty, { color: item.quantity > 100 ? tc.accent : item.quantity > 10 ? tc.warning : tc.danger }]}>{item.quantity.toLocaleString()}</Text>
            <Text style={styles.ordQtyLabel}>UNITS</Text>
          </View>
        </View>
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
  );

  const renderMissionsTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="MILITARY OPERATIONS" subtitle={`${mil.activeMissions.length}/3 active`} icon={<MaterialCommunityIcons name="map-marker-path" size={14} color={tc.accent} />} />

      {mil.activeMissions.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>ACTIVE OPERATIONS</Text>
          {mil.activeMissions.map((m) => (
            <View key={m.id} style={styles.activeMission}>
              {(() => {
                const def = MILITARY_MISSIONS.find((candidate) => candidate.id === m.missionId);
                const timing = def
                  ? getTimedActionCostTiming(
                    { cost: def.creditsCost, duration: def.duration },
                    { activeTicksRemaining: m.ticksRemaining, phase: "active" },
                  )
                  : null;
                return (
                  <>
                    <View style={styles.missionTop}>
                      <Text style={styles.missionName}>{m.name}</Text>
                      <Text style={[styles.missionStatus, m.status === "active" ? { color: tc.accent } : { color: tc.warning }]}>{m.status.toUpperCase()}</Text>
                    </View>
                    <StatBar label="Progress" value={m.totalTicks > 0 ? ((m.totalTicks - m.ticksRemaining) / m.totalTicks) * 100 : 0} compact />
                    <Text style={styles.missionMeta}>{m.unitsDeployed} units | {m.ticksRemaining} ticks remaining</Text>
                    {timing && <ActionCostTimingReadout model={timing} compact />}
                  </>
                );
              })()}
            </View>
          ))}
        </>
      )}

      <Text style={styles.sectionLabel}>AVAILABLE OPERATIONS</Text>
      {MILITARY_MISSIONS.map((def) => {
        const canLaunch = mil.activeMissions.length < 3 && r.credits >= def.creditsCost && r.ammo >= def.ammoCost && r.fuel >= def.fuelCost
          && (mil.standingArmy.totalStrength - mil.standingArmy.deployedOnMission) >= def.unitCost;
        const timing = getTimedActionCostTiming(
          { cost: def.creditsCost, duration: def.duration },
          { availableCredits: r.credits },
        );
        return (
          <Pressable
            key={def.id}
            style={[styles.missionCard, !canLaunch && styles.unitCardMuted]}
            onPress={() => {
              if (!canLaunch) {
                showModal("CANNOT LAUNCH", "Insufficient resources, units, or mission slots.", [{ text: "OK", style: "cancel" }]);
                return;
              }
              showModal(`LAUNCH: ${def.name}`, `${def.description}\n\n${formatActionCostTimingSummary(timing)}\nAMMUNITION: ${def.ammoCost}\nFUEL: ${def.fuelCost}\nUNITS COMMITTED: ${def.unitCost}\nDIFFICULTY: ${def.difficulty}`, [
                { text: "CANCEL", style: "cancel" },
                { text: "LAUNCH", style: "destructive", onPress: () => launchMission(def.id) },
              ]);
            }}
          >
            <View style={styles.missionTop}>
              <Text style={styles.missionDefName}>{def.name}</Text>
              <Text style={[styles.missionDiff, def.difficulty >= 7 ? { color: tc.danger } : { color: tc.warning }]}>RISK {def.difficulty}/10</Text>
            </View>
              <Text style={styles.missionDefDesc}>{def.description}</Text>
              <ActionCostTimingReadout model={timing} includeBehavior compact />
            <View style={styles.missionCosts}>
              <Text style={styles.missionCostTag}>{def.ammoCost} ammo</Text>
              <Text style={styles.missionCostTag}>{def.fuelCost} fuel</Text>
              <Text style={styles.missionCostTag}>{def.unitCost} units</Text>
            </View>
          </Pressable>
        );
      })}
      <View style={{ height: 30 }} />
    </ScrollView>
  );

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: tc.bg }]}>
      <CommandScreenHeader
        icon="crosshair"
        title="MILITARY / ARMORY"
        subtitle={`${totalPersonnel.toLocaleString()} personnel · force readiness · war operations`}
      />

      <ScrollView ref={milTabStripRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={[styles.milTabScroll, { backgroundColor: tc.bgSecondary, borderBottomColor: tc.border }]} contentContainerStyle={styles.milTabContent}>
        {MIL_TABS.map((tab) => (
          <Pressable accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: milTab === tab.key }} key={tab.key} style={[styles.milTab, { borderColor: tc.border }, milTab === tab.key && { backgroundColor: tc.accent, borderColor: tc.accent }]} onPress={() => setMilTab(tab.key)}>
            <MaterialCommunityIcons name={tab.icon as any} size={12} color={milTab === tab.key ? tc.bg : tc.textMuted} />
            <Text style={[styles.milTabLabel, { color: tc.textMuted }, milTab === tab.key && { color: tc.bg }]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {milTab === "overview" && renderOverviewTab()}
      {milTab === "units" && renderUnitsTab()}
      {milTab === "army" && renderArmyTab()}
      {milTab === "warops" && renderWarOpsTab()}
      {milTab === "defense" && renderDefenseTab()}
      {milTab === "ordnance" && renderOrdnanceTab()}
      {milTab === "policies" && renderPoliciesTab()}
      {milTab === "production" && renderProductionTab()}
      {milTab === "research" && renderResearchTab()}
      {milTab === "missions" && renderMissionsTab()}
      {milTab === "installations" && <MilitaryInstallationsPanel />}

      <ContextMenu visible={ctx.visible} position={ctx.position} items={UNIT_CTX_ITEMS} onSelect={onCtxAction} onDismiss={closeCtx} />

      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

function StatusChip({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors: tc } = useTheme();
  const chipStyles = useChipStyles();
  return (
    <View style={[chipStyles.chip, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
      <Text style={[chipStyles.label, { color: tc.textMuted }]}>{label}</Text>
      <Text style={[chipStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

const useChipStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  chip: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: 2 },
  label: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8 },
  value: { fontFamily: "Inter_700Bold", fontSize: 13 },
}));

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgSecondary },
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5, flex: 1 },
  headerCount: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },

  milTabScroll: { maxHeight: 40, backgroundColor: Colors.bgSecondary, borderBottomWidth: 1, borderBottomColor: Colors.border },
  milTabContent: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  milTab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: Colors.border },
  milTabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  milTabLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.8 },
  milTabLabelActive: { color: Colors.bg },

  statusStrip: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.bgSecondary, borderBottomWidth: 1, borderBottomColor: Colors.borderDim },
  readinessBlock: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, backgroundColor: Colors.bgSecondary, borderBottomWidth: 1, borderBottomColor: Colors.borderDim },

  catScroll: { maxHeight: 44, backgroundColor: Colors.bgSecondary },
  catContent: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  catTab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: Colors.border },
  catTabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  catLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 },
  catLabelActive: { color: Colors.bg },
  catBadge: { backgroundColor: Colors.danger, borderRadius: 8, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  catBadgeText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 8 },

  scroll: { flex: 1 },
   content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },
   commandSummary: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: Platform.OS === "web" ? 8 : 12 },
  commandSection: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, marginBottom: 8, overflow: "hidden" },
   commandSectionHeader: { padding: Platform.OS === "web" ? 10 : 12, minHeight: Platform.OS === "web" ? 42 : 48, justifyContent: "center" },
  commandSectionTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  commandSectionLabel: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.8 },
  commandCommander: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2 },
   commandSectionBody: { borderTopWidth: 1, borderTopColor: Colors.borderDim, padding: Platform.OS === "web" ? 10 : 12, gap: 8 },
  commandMetric: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  commandMetricLabel: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, flex: 1 },
  commandMetricValue: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11, textAlign: "right" },
  commandAssets: { borderTopWidth: 1, borderTopColor: Colors.borderDim, paddingTop: 9, gap: 6 },
  commandAssetsLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.7 },
  commandAssetEmpty: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, paddingVertical: 4 },
  commandAssetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 5 },
  commandAssetInfo: { flex: 1, minWidth: 0 },
  commandAssetNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  commandAssetName: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 10, flexShrink: 1 },
  commandAssetDetail: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginLeft: 19, marginTop: 2 },
  commandAssetRight: { alignItems: "flex-end", minWidth: 72 },
  commandAssetCount: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11 },
  commandAssetStatusRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 4, marginTop: 2 },
  commandAssetStatus: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.4 },
  commandAction: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: Colors.borderDim, paddingTop: 9, marginTop: 2, minHeight: 44 },
  commandActionText: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.6 },

   unitCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: Platform.OS === "web" ? 10 : 12, marginBottom: 8, gap: 10 },
  unitCardMuted: { opacity: 0.5 },
  unitCardPressed: { backgroundColor: Colors.bgSecondary, borderColor: Colors.accent },
  unitLeft: { flex: 1, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  unitCount: { width: 38, height: 38, backgroundColor: Colors.bgSecondary, borderRadius: 4, borderWidth: 1, borderColor: Colors.borderDim, alignItems: "center", justifyContent: "center" },
  unitCountText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 11 },
  unitCountActive: { color: Colors.accent },
  unitInfo: { flex: 1 },
  unitLabel: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5, marginBottom: 2 },
  unitDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 2 },
  unitEffects: { color: Colors.statHigh, fontFamily: "Inter_500Medium", fontSize: 10, marginBottom: 2 },
  upkeepRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  upkeepTag: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9 },
  unitRight: { alignItems: "flex-end", gap: 2 },
  unitCost: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 13 },
  unitPer: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9 },
  mutedText: { color: Colors.textMuted },

  armyStatRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  armyStat: { flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 10, alignItems: "center", gap: 4 },
  armyStatLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8 },
  armyStatVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 16 },

  branchCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 6 },
  branchLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  branchLabel: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 },
  branchCount: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10 },
  branchBtns: { flexDirection: "row", gap: 4 },
  branchBtn: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  branchBtnText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10 },

  policyCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  policyCardActive: { borderColor: Colors.accent },
  policyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  policyName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5, flex: 1 },
  policyBadge: { backgroundColor: Colors.bgSecondary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  policyBadgeActive: { backgroundColor: Colors.accent },
  policyBadgeText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.5 },
  policyDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 6, lineHeight: 16 },
  policyEffects: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  effectTag: { fontFamily: "Inter_500Medium", fontSize: 10 },

  econNote: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.accent + "40", borderRadius: 6, padding: 12, marginBottom: 10, gap: 6 },
  econNoteTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.6 },
  econNoteBody: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  prodCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  prodName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5, marginBottom: 2 },
  prodDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 6 },
  prodIO: { gap: 2 },
  prodLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10 },
  prodVal: { color: Colors.text, fontFamily: "Inter_700Bold" },

  activeResearchCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.accent, borderRadius: 6, padding: 12, marginBottom: 12 },
  activeResLabel: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  activeResTicks: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 4 },

  techCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  techCompleted: { borderColor: Colors.accent, opacity: 0.7 },
  techLocked: { opacity: 0.4 },
  techTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  techName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5, flex: 1 },
  techCost: { fontFamily: "Inter_700Bold", fontSize: 11 },
  techDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 4, lineHeight: 16 },
  techTier: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.5 },

  opFilterScroll: { flexGrow: 0, marginBottom: 12 },
  opFilterChip: { paddingHorizontal: 10, paddingVertical: 5, marginRight: 4, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgSecondary },
  opFilterChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  opFilterText: { fontFamily: "Inter_500Medium", fontSize: 8, color: Colors.textMuted, letterSpacing: 0.5 },
  opFilterTextActive: { color: Colors.accent },
  warOpCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 10, marginBottom: 4, gap: 8 },
  warOpBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, minWidth: 50, alignItems: "center" },
  warOpBadgeText: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.5 },
  warOpName: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text, letterSpacing: 0.3 },
  warOpDesc: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  warOpProgressOuter: { height: 5, borderRadius: 3, overflow: "hidden", borderWidth: 1, marginTop: 5 },
  warOpProgressInner: { height: "100%", borderRadius: 3 },
  warOpCost: { fontFamily: "Inter_700Bold", fontSize: 12 },
  warOpDef: { fontFamily: "Inter_500Medium", fontSize: 8, color: Colors.info, marginTop: 2 },
  ordCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 10, marginBottom: 4 },
  ordMeta: { fontFamily: "Inter_500Medium", fontSize: 8, color: Colors.info, marginTop: 3, letterSpacing: 0.3 },
  ordQty: { fontFamily: "Inter_700Bold", fontSize: 14 },
  ordQtyLabel: { fontFamily: "Inter_500Medium", fontSize: 7, color: Colors.textMuted, marginTop: 1 },
  sectionLabel: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1, marginTop: 8, marginBottom: 8 },

  activeMission: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.accent, borderRadius: 6, padding: 12, marginBottom: 8 },
  missionTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  missionName: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 },
  missionStatus: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  missionMeta: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 4 },

  missionCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, marginBottom: 8 },
  missionDefName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 },
  missionDiff: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  missionDefDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 6, lineHeight: 16 },
  missionCosts: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  missionCostTag: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10, backgroundColor: Colors.bgSecondary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
}));

export default withScreenBoundary(MilitaryScreen, "military");

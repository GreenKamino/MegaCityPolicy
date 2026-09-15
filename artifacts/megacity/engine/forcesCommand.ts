import type { GameState } from "@/engine/types";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";
import { MILITARY_PERSONNEL_KEYS, PERSONNEL_PER_UNIT, VEHICLE_SPECS } from "@/engine/militaryLogistics";
import { UNIT_CATEGORIES } from "@/engine/contracts";

export type ForceCommandSection = {
  id: "supreme" | "armed" | "security" | "intelligence" | "retinue" | "districts";
  label: string;
  commander: string | null;
  vacancies: number;
  metrics: Array<{ label: string; value: string; alert?: boolean }>;
  assets: ForceCommandAsset[];
  action: { label: string; target: "units" | "army" | "production" | "missions" | "installations" | "officers" | "retinue" | "districts" };
};

export type ForceCommandAssetStatus =
  | "ready"
  | "damaged"
  | "deployed"
  | "leaderless"
  | "undersupplied"
  | "understaffed";

export type ForceCommandAsset = {
  id: string;
  label: string;
  kind: "unit" | "vehicle" | "formation" | "installation" | "officer";
  count: number;
  statuses: ForceCommandAssetStatus[];
  detail?: string;
};

export type ForcesCommandOverview = {
  personnel: number;
  vehicles: number;
  operationalVehicles: number;
  installations: number;
  readiness: number;
  morale: number;
  supplyStatus: string;
  sections: ForceCommandSection[];
};

const n = (value: unknown, max = Number.MAX_SAFE_INTEGER) =>
  Math.min(max, Math.max(0, Number.isFinite(value) ? Number(value) : 0));
const pct = (value: unknown) => Math.round(n(value, 1) * 100);
const countUnits = (units: Record<string, unknown>, keys: Iterable<string>) => {
  let total = 0;
  for (const key of keys) total += n(units[key]);
  return total;
};
const UNIT_LABELS = new Map(UNIT_CATEGORIES.map((unit) => [unit.key, unit.label]));
const labelFor = (key: string) => UNIT_LABELS.get(key) ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").toUpperCase();
const supplyProblem = (supplyStatus: unknown) => supplyStatus === "shortage" || supplyStatus === "critical";
const SECURITY_KEYS = new Set([
  "patrolJudges", "rookieJudgeCadets", "streetPatrolUnits", "detectiveUnits",
  "antiGangTaskForces", "drugEnforcementUnits", "evidenceRecoveryTeams",
  "sectorLawSquads", "riotPoliceSquads", "riotShieldUnits", "crowdDispersalTeams",
  "sonicCrowdControlUnits", "gasDeploymentTeams", "tacticalSuppressionTeams",
]);
const INTELLIGENCE_KEYS = new Set([
  "undercoverInvestigators", "cybercrimeTeams", "blackOpsUnits",
  "antiCultTaskForces", "rogueJudgeHunters", "wastelandScouts", "reconRangers",
  "droneWarfareTeams", "explorationTeams",
  "intelligenceOfficers", "internalAffairsAgents", "counterCorruptionUnits",
  "informantNetworks", "dataAnalysisUnits", "deepSurveillanceAnalysts",
]);

export function buildForcesCommandOverview(state: Partial<GameState>): ForcesCommandOverview {
  const units = state.units && typeof state.units === "object" ? state.units as Record<string, unknown> : {};
  const military = state.militaryOverhaul;
  const logistics = military?.logistics;
  const officers = Array.isArray(state.officers) ? state.officers.filter((officer) => officer && typeof officer === "object") : [];
  const appointed = officers.filter((officer) => officer.appointed);
  const retinue = state.retinue;
  const troops = Array.isArray(retinue?.troops)
    ? retinue.troops.filter((troop) => troop && typeof troop === "object" && troop.status !== "kia")
    : [];
  const captains = Array.isArray(retinue?.captains)
    ? retinue.captains.filter((captain) => captain && typeof captain === "object" && captain.status !== "kia")
    : [];
  const squads = Array.isArray(retinue?.squads)
    ? retinue.squads.filter((squad) => squad && typeof squad === "object")
    : [];
  const districts = Array.isArray(state.districts) ? state.districts.filter((district) => district && typeof district === "object") : [];
  const resources = state.resources && typeof state.resources === "object"
    ? state.resources as Record<string, unknown>
    : {};

  const commanderFor = (position: string) => {
    const officer = appointed.find((candidate) => candidate.position === position);
    return officer && typeof officer.name === "string" && officer.name.trim() ? officer.name : null;
  };

  const personnelUnits = countUnits(units, MILITARY_PERSONNEL_KEYS);
  const securityUnits = countUnits(units, SECURITY_KEYS);
  const intelligenceUnits = countUnits(units, INTELLIGENCE_KEYS);
  const armedUnits = Math.max(0, personnelUnits - securityUnits - intelligenceUnits);
  const personnel = personnelUnits * PERSONNEL_PER_UNIT;
  const vehicles = countUnits(units, Object.keys(VEHICLE_SPECS));
  let operationalVehicles = 0;
  let damagedVehicles = 0;
  for (const key of Object.keys(VEHICLE_SPECS)) {
    const count = n(units[key]);
    operationalVehicles += count * n(logistics?.fleetOperational?.[key], 1);
    if (count > 0 && n(logistics?.fleetCondition?.[key], 100) < 100) damagedVehicles += count;
  }
  const knownBuildings = new Set(MILITARY_BUILDINGS.map((building) => building.id));
  let installations = 0;
  let installationUpkeep = 0;
  for (const [key, value] of Object.entries(logistics?.installationsBuilt ?? {})) {
    if (knownBuildings.has(key)) {
      const count = n(value);
      installations += count;
      installationUpkeep += count * (MILITARY_BUILDINGS.find((building) => building.id === key)?.upkeep ?? 0);
    }
  }
  const leaderless = squads.filter((squad) => !squad.captainId || !captains.some((captain) => captain.id === squad.captainId)).length;
  const criticalDistricts = districts.filter((district) =>
    n(district.crime) >= 70 || n(district.unrest) >= 70 || (Number.isFinite(district.loyalty) && n(district.loyalty, 100) <= 30)
  ).length;
  const supplyStatus = typeof logistics?.supplyStatus === "string" ? logistics.supplyStatus : "stable";
  const supplyAlert = supplyProblem(supplyStatus);
  const assetStatuses = (extra: ForceCommandAssetStatus[] = []) =>
    [...extra, ...(supplyAlert ? ["undersupplied" as const] : [])].filter((status, index, all) => all.indexOf(status) === index);
  const unitAssets = (keys: Iterable<string>, branchStatuses: ForceCommandAssetStatus[] = []): ForceCommandAsset[] =>
    [...keys]
      .map((key) => ({ key, count: n(units[key]) }))
      .filter(({ count }) => count > 0)
      .map(({ key, count }) => ({
        id: `unit-${key}`,
        label: labelFor(key),
        kind: "unit" as const,
        count: Math.round(count),
        statuses: assetStatuses(branchStatuses.length ? branchStatuses : ["ready"]),
        detail: `${Math.round(count * PERSONNEL_PER_UNIT).toLocaleString()} personnel`,
      }));
  const armedUnitKeys = Object.keys(units).filter((key) =>
    MILITARY_PERSONNEL_KEYS.has(key) && !SECURITY_KEYS.has(key) && !INTELLIGENCE_KEYS.has(key),
  );
  const securityUnitKeys = Object.keys(units).filter((key) => SECURITY_KEYS.has(key));
  const intelligenceUnitKeys = Object.keys(units).filter((key) => INTELLIGENCE_KEYS.has(key));
  const vehicleAssets: ForceCommandAsset[] = Object.keys(VEHICLE_SPECS)
    .map((key) => ({ key, count: n(units[key]) }))
    .filter(({ count }) => count > 0)
    .map(({ key, count }) => {
      const condition = Math.round(n(logistics?.fleetCondition?.[key], 100));
      const operational = Math.round(n(logistics?.fleetOperational?.[key], 1) * 100);
      const statuses: ForceCommandAssetStatus[] = [];
      if (condition < 100) statuses.push("damaged");
      if (operational < 100) statuses.push("understaffed");
      if (!statuses.length) statuses.push("ready");
      return {
        id: `vehicle-${key}`,
        label: labelFor(key),
        kind: "vehicle" as const,
        count: Math.round(count),
        statuses: assetStatuses(statuses),
        detail: `${operational}% operational · ${condition}% condition`,
      };
    });
  const officerAssets: ForceCommandAsset[] = appointed.map((officer) => ({
    id: `officer-${officer.id}`,
    label: typeof officer.name === "string" && officer.name.trim() ? officer.name : "UNNAMED OFFICER",
    kind: "officer" as const,
    count: 1,
    statuses: ["ready"],
    detail: officer.position || "Appointed command staff",
  }));
  const retinueAssets: ForceCommandAsset[] = [];
  const assignedTroopIds = new Set<string>();
  for (const squad of squads) {
    const troopIds = Array.isArray(squad.troopIds) ? squad.troopIds : [];
    const activeTroops = troops.filter((troop) => troop.squadId === squad.id || troopIds.includes(troop.id));
    activeTroops.forEach((troop) => assignedTroopIds.add(troop.id));
    const captain = captains.find((candidate) => candidate.id === squad.captainId && candidate.status !== "kia");
    const statuses: ForceCommandAssetStatus[] = [];
    if (!captain) statuses.push("leaderless");
    if (activeTroops.some((troop) => troop.status === "deployed")) statuses.push("deployed");
    if (activeTroops.some((troop) => troop.status === "injured")) statuses.push("damaged");
    if (!statuses.length) statuses.push("ready");
    retinueAssets.push({
      id: `squad-${squad.id}`,
      label: typeof squad.name === "string" && squad.name.trim() ? squad.name : "UNNAMED FORMATION",
      kind: "formation",
      count: activeTroops.length,
      statuses,
      detail: `${activeTroops.length} active troops${captain ? ` · ${captain.name}` : " · no active captain"}`,
    });
  }
  const unassignedTroops = troops.filter((troop) => !assignedTroopIds.has(troop.id));
  if (unassignedTroops.length) {
    retinueAssets.push({
      id: "retinue-unassigned",
      label: "UNASSIGNED RETINUE TROOPS",
      kind: "formation",
      count: unassignedTroops.length,
      statuses: assetStatuses(unassignedTroops.some((troop) => troop.status === "deployed") ? ["deployed"] : ["ready"]),
      detail: "Active troops not attached to a squad",
    });
  }
  const installationAssets: ForceCommandAsset[] = Object.entries(logistics?.installationsBuilt ?? {})
    .filter(([key, value]) => knownBuildings.has(key) && n(value) > 0)
    .map(([key, value]) => {
      const statuses: ForceCommandAssetStatus[] = [];
      if (n(logistics?.garrisonCoverage, 1) < 1) statuses.push("understaffed");
      if (supplyAlert) statuses.push("undersupplied");
      if (!statuses.length) statuses.push("ready");
      return {
        id: `installation-${key}`,
        label: MILITARY_BUILDINGS.find((building) => building.id === key)?.name ?? labelFor(key),
        kind: "installation" as const,
        count: Math.round(n(value)),
        statuses,
        detail: `${Math.round(n(logistics?.garrisonCoverage, 1) * 100)}% garrison coverage`,
      };
    });
  const deployedMissionAsset: ForceCommandAsset[] = n(military?.standingArmy?.deployedOnMission) > 0
    ? [{
        id: "armed-deployed-missions",
        label: "DEPLOYED MISSION STRENGTH",
        kind: "formation",
        count: Math.round(n(military?.standingArmy?.deployedOnMission)),
        statuses: ["deployed"],
        detail: `${Array.isArray(military?.activeMissions) ? military.activeMissions.length : 0} active military missions`,
      }]
    : [];

  return {
    personnel,
    vehicles,
    operationalVehicles: Math.round(operationalVehicles),
    installations,
    readiness: Math.round(n(military?.standingArmy?.readiness, 100)),
    morale: Math.round(n(military?.standingArmy?.morale, 100)),
    supplyStatus,
    sections: [
      {
        id: "supreme", label: "SUPREME COMMAND", commander: commanderFor("Defense High Commander"),
        vacancies: commanderFor("Defense High Commander") ? 0 : 1,
        metrics: [{ label: "Appointed command staff", value: String(appointed.length) }],
        assets: officerAssets,
        action: { label: "MANAGE OFFICERS", target: "officers" },
      },
      {
        id: "armed", label: "ARMED FORCES", commander: commanderFor("Defense Sector Commander"),
        vacancies: commanderFor("Defense Sector Commander") ? 0 : 1,
        metrics: [
          { label: "Assigned personnel", value: (armedUnits * PERSONNEL_PER_UNIT).toLocaleString() },
          { label: "Force readiness", value: `${Math.round(n(military?.standingArmy?.readiness, 100))}%`, alert: n(military?.standingArmy?.readiness, 100) < 50 },
          { label: "Deployed strength", value: String(Math.round(n(military?.standingArmy?.deployedOnMission))) },
          { label: "Operational vehicles", value: `${Math.round(operationalVehicles)} / ${vehicles}`, alert: operationalVehicles + 0.5 < vehicles },
          { label: "Vehicles below full condition", value: String(damagedVehicles), alert: damagedVehicles > 0 },
          { label: "Armaments", value: Math.round(n(resources.armaments)).toLocaleString() },
          { label: "Missiles", value: Math.round(n(resources.missiles)).toLocaleString() },
          { label: "Ammunition", value: Math.round(n(resources.ammo)).toLocaleString(), alert: supplyStatus === "shortage" || supplyStatus === "critical" },
        ],
        assets: [...unitAssets(armedUnitKeys), ...vehicleAssets, ...deployedMissionAsset],
        action: { label: "OPEN ARMY", target: "army" },
      },
      {
        id: "security", label: "CIVIL SECURITY", commander: commanderFor("City Enforcement Commander"),
        vacancies: commanderFor("City Enforcement Commander") ? 0 : 1,
        metrics: [
          { label: "Assigned personnel", value: (securityUnits * PERSONNEL_PER_UNIT).toLocaleString() },
          { label: "Critical districts", value: `${criticalDistricts} / ${districts.length}`, alert: criticalDistricts > 0 },
        ],
        assets: unitAssets(securityUnitKeys),
        action: { label: "OPEN DISTRICTS", target: "districts" },
      },
      {
        id: "intelligence", label: "INTELLIGENCE / COVERT", commander: commanderFor("Strategic Intelligence Director"),
        vacancies: commanderFor("Strategic Intelligence Director") ? 0 : 1,
        metrics: [
          { label: "Assigned personnel", value: (intelligenceUnits * PERSONNEL_PER_UNIT).toLocaleString() },
          { label: "Special operations strength", value: String(Math.round(n(military?.standingArmy?.specialOps))) },
          { label: "Active missions", value: String(Array.isArray(military?.activeMissions) ? military.activeMissions.length : 0) },
        ],
        assets: unitAssets(intelligenceUnitKeys),
        action: { label: "OPEN MISSIONS", target: "missions" },
      },
      {
        id: "retinue", label: "COMMANDER RETINUE", commander: captains[0]?.name ?? null,
        vacancies: leaderless,
        metrics: [
          { label: "Active troops", value: String(troops.length) },
          { label: "Squads", value: String(squads.length) },
          { label: "Leaderless formations", value: String(leaderless), alert: leaderless > 0 },
        ],
        assets: retinueAssets,
        action: { label: "OPEN RETINUE", target: "retinue" },
      },
      {
        id: "districts", label: "DISTRICTS / INSTALLATIONS", commander: commanderFor("District Security Chief"),
        vacancies: commanderFor("District Security Chief") ? 0 : 1,
        metrics: [
          { label: "Installations", value: String(installations) },
          { label: "Installation upkeep", value: `${Math.round(installationUpkeep).toLocaleString()} cr/tick` },
          { label: "Garrison coverage", value: `${pct(logistics?.garrisonCoverage)}%`, alert: pct(logistics?.garrisonCoverage) < 100 },
          { label: "Crew coverage", value: `${pct(logistics?.crewCoverage)}%`, alert: pct(logistics?.crewCoverage) < 100 },
          { label: "Supply status", value: supplyStatus.toUpperCase(), alert: supplyStatus === "shortage" || supplyStatus === "critical" },
        ],
        assets: installationAssets,
        action: { label: "OPEN BASES", target: "installations" },
      },
    ],
  };
}
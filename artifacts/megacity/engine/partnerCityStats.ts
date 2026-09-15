import type {
  ExternalMegacity,
  Township,
  PartnerControlStatus,
  FactionInfrastructure,
  GameState,
  GameMessage,
} from "./types";
import {
  normalizePartnerRelationshipScores,
  refreshPartnerDynamics,
  processNpcWorldEvents,
} from "./partnerDynamics";
import { applyNpcEndStateCheck } from "./endState";

export type PartnerCityEntity = ExternalMegacity | Township;

// Four ticks per in-game day. A controlled megacity only rebels after twelve
// full days of uninterrupted severe discontent.
export const CONTROL_UPRISING_MIN_TICKS = 48;
export const CONTROL_UPRISING_MAX_LOYALTY = 15;
export const CONTROL_UPRISING_MIN_ATTRITION = 75;
export const CONTROL_UPRISING_HOSTILE_THREAT = 60;

export type CityStatsSnapshot = {
  population: number;
  cityHealth: number;
  attrition: number;
  infrastructure: FactionInfrastructure;
  controlStatus: PartnerControlStatus;
  tributePerTick: number;
};

export const DEFAULT_INFRASTRUCTURE: FactionInfrastructure = {
  military: 80,
  walls: 80,
  fuel: 80,
  civilian: 80,
};

const POP_DEFAULTS: Record<string, [number, number]> = {
  megacity: [800_000, 4_500_000],
  nation: [120_000, 600_000],
  group: [3_000, 25_000],
  township: [2_000, 12_000],
  settlement: [500, 4_000],
};

function pickDefault(seed: string, range: [number, number]): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const span = range[1] - range[0];
  return range[0] + (h % span);
}

export function defaultPopulationFor(entity: PartnerCityEntity): number {
  const kind = (entity as ExternalMegacity).factionType ?? (entity as Township).factionType ?? "settlement";
  const range = POP_DEFAULTS[kind] ?? POP_DEFAULTS.settlement;
  return pickDefault(entity.id ?? entity.name ?? "x", range);
}

export function readCityStats(entity: PartnerCityEntity): CityStatsSnapshot {
  const normalized = normalizePartnerRelationshipScores(entity);
  const pop = (normalized as ExternalMegacity).population ?? (normalized as Township).population ?? defaultPopulationFor(normalized);
  const cityHealth = normalized.cityHealth ?? 100;
  const attrition = normalized.attrition ?? 0;
  const infrastructure = normalized.infrastructure ?? { ...DEFAULT_INFRASTRUCTURE };
  const controlStatus = normalized.controlStatus ?? "independent";
  const tributePerTick = normalized.tributePerTick ?? 0;
  return { population: pop, cityHealth, attrition, infrastructure, controlStatus, tributePerTick };
}

export function ensurePartnerCityStats<T extends PartnerCityEntity>(entity: T): T {
  const snap = readCityStats(entity);
  return {
    ...entity,
    population: snap.population,
    cityHealth: snap.cityHealth,
    attrition: snap.attrition,
    infrastructure: snap.infrastructure,
    controlStatus: snap.controlStatus,
    tributePerTick: snap.tributePerTick,
  } as T;
}

export type StrikeIntensity = {
  populationLossPct: number;
  cityHealthDamage: number;
  attritionAdd: number;
  infraDamage: Partial<FactionInfrastructure>;
};

export const STRIKE_PROFILES: Record<string, StrikeIntensity> = {
  "rocket-strike": {
    populationLossPct: 0.005,
    cityHealthDamage: 12,
    attritionAdd: 8,
    infraDamage: { walls: 8, civilian: 10, military: 4 },
  },
  bombardment: {
    populationLossPct: 0.02,
    cityHealthDamage: 22,
    attritionAdd: 18,
    infraDamage: { walls: 18, civilian: 22, military: 10, fuel: 6 },
  },
  "lay-siege": {
    populationLossPct: 0.012,
    cityHealthDamage: 14,
    attritionAdd: 14,
    infraDamage: { walls: 6, civilian: 6, military: 8, fuel: 12 },
  },
};

export type DamageReport = {
  populationKilled: number;
  cityHealthAfter: number;
  attritionAfter: number;
  infrastructureAfter: FactionInfrastructure;
};

export function applyMilitaryDamage(
  entity: PartnerCityEntity,
  profileId: keyof typeof STRIKE_PROFILES | StrikeIntensity
): DamageReport {
  const snap = readCityStats(entity);
  const profile = typeof profileId === "string" ? STRIKE_PROFILES[profileId] : profileId;
  const populationKilled = Math.max(50, Math.floor(snap.population * profile.populationLossPct));
  const newPop = Math.max(0, snap.population - populationKilled);
  const cityHealthAfter = Math.max(0, snap.cityHealth - profile.cityHealthDamage);
  const attritionAfter = Math.min(100, snap.attrition + profile.attritionAdd);
  const infrastructureAfter: FactionInfrastructure = {
    military: Math.max(0, snap.infrastructure.military - (profile.infraDamage.military ?? 0)),
    walls: Math.max(0, snap.infrastructure.walls - (profile.infraDamage.walls ?? 0)),
    fuel: Math.max(0, snap.infrastructure.fuel - (profile.infraDamage.fuel ?? 0)),
    civilian: Math.max(0, snap.infrastructure.civilian - (profile.infraDamage.civilian ?? 0)),
  };
  return {
    populationKilled,
    cityHealthAfter,
    attritionAfter,
    infrastructureAfter,
  };
}

export function applyMinorStrikeDamage(entity: PartnerCityEntity, severity: number): DamageReport {
  const intensity: StrikeIntensity = {
    populationLossPct: 0.0008 * Math.max(1, severity),
    cityHealthDamage: 2 * Math.max(1, severity),
    attritionAdd: 2 * Math.max(1, severity),
    infraDamage: {},
  };
  return applyMilitaryDamage(entity, intensity);
}

export function applyDamageToEntity<T extends PartnerCityEntity>(
  entity: T,
  report: DamageReport
): T {
  const normalized = normalizePartnerRelationshipScores(entity);
  const snap = readCityStats(normalized);
  return {
    ...normalized,
    population: report.populationKilled > 0 ? Math.max(0, snap.population - report.populationKilled) : snap.population,
    cityHealth: report.cityHealthAfter,
    attrition: report.attritionAfter,
    infrastructure: report.infrastructureAfter,
  } as T;
}

export function recoverPartnerStats<T extends PartnerCityEntity>(entity: T): T {
  const normalized = normalizePartnerRelationshipScores(entity);
  const snap = readCityStats(normalized);
  if (snap.controlStatus !== "independent") return normalized;
  if (snap.attrition <= 0 && snap.cityHealth >= 100) return normalized;
  return {
    ...normalized,
    cityHealth: Math.min(100, snap.cityHealth + 0.4),
    attrition: Math.max(0, snap.attrition - 0.3),
  } as T;
}

export type ConditionCheck = { allowed: boolean; reason: string };

export function canOccupy(
  entity: PartnerCityEntity,
  ourInfluence: number,
  ourMilitaryStrength: number
): ConditionCheck {
  const snap = readCityStats(entity);
  if (snap.controlStatus === "occupied") return { allowed: false, reason: "Already under occupation." };
  if (snap.controlStatus === "annexed") return { allowed: false, reason: "Already annexed." };
  if (snap.cityHealth > 50) return { allowed: false, reason: `Target city health too high (${Math.round(snap.cityHealth)}/50). Soften them with strikes first.` };
  if (snap.infrastructure.walls > 30) return { allowed: false, reason: `Target walls still standing (${Math.round(snap.infrastructure.walls)}/30). Bombard the perimeter first.` };
  if (ourInfluence < 50) return { allowed: false, reason: `Need at least 50 influence (current ${ourInfluence}).` };
  if (ourMilitaryStrength < 200) return { allowed: false, reason: `Need a standing force of at least 200 units (current ${ourMilitaryStrength}).` };
  return { allowed: true, reason: "Conditions met for occupation." };
}

export function canAnnex(
  entity: PartnerCityEntity,
  ourInfluence: number
): ConditionCheck {
  const snap = readCityStats(entity);
  if (snap.controlStatus === "annexed") return { allowed: false, reason: "Already annexed." };
  if (snap.cityHealth > 30) return { allowed: false, reason: `Target city health too high (${Math.round(snap.cityHealth)}/30). They will not capitulate.` };
  if (snap.attrition < 50) return { allowed: false, reason: `Target attrition too low (${Math.round(snap.attrition)}/50). They still have fight left.` };
  if (ourInfluence < 75) return { allowed: false, reason: `Need at least 75 influence (current ${ourInfluence}).` };
  if (snap.controlStatus !== "occupied") return { allowed: false, reason: "Must occupy the target before annexing it." };
  return { allowed: true, reason: "Conditions met for annexation." };
}

export function controlStatusLabel(status: PartnerControlStatus): string {
  if (status === "occupied") return "OCCUPIED";
  if (status === "annexed") return "ANNEXED";
  return "INDEPENDENT";
}

export function controlledDispositionLabel(status: PartnerControlStatus | undefined): string | null {
  if (status === "occupied") return "UNDER ADMINISTRATION";
  if (status === "annexed") return "PACIFIED";
  return null;
}

export function tributeForOccupation(entity: PartnerCityEntity): number {
  const snap = readCityStats(entity);
  return Math.max(50, Math.floor(snap.population / 2000));
}

export function annexationPopulationGain(entity: PartnerCityEntity): number {
  const snap = readCityStats(entity);
  return Math.floor(snap.population * 0.6);
}

export type PartnerTickEffectsResult = {
  state: GameState;
  alerts: GameMessage[];
};

export function applyPartnerAndPlayerTickEffects(state: GameState): PartnerTickEffectsResult {
  let s = state;
  let tributeIncome = 0;
  const partnerAlerts: GameMessage[] = [];

  const processPartner = <T extends ExternalMegacity | Township>(
    p: T,
    uprisingEligible: boolean,
  ): T => {
    p = normalizePartnerRelationshipScores(p);
    // Symmetrical city-end check: a non-occupied/non-annexed partner
    // city whose population reaches 0 falls. Runs before tribute/recover
    // logic so a fallen city does not also recover this tick.
    const endCheck = applyNpcEndStateCheck(p, s.totalTicks, s.gameDate);
    if (endCheck.alert) partnerAlerts.push(endCheck.alert);
    p = endCheck.entity;
    if (p.endState === "fallen") return p;
    if (p.controlStatus === "occupied" || p.controlStatus === "annexed") {
      let controlled = p;
      if (uprisingEligible) {
        const city = p as ExternalMegacity;
        const loyalty = Number.isFinite(city.loyalty) ? city.loyalty : 50;
        const attrition = Number.isFinite(city.attrition) ? (city.attrition ?? 0) : 0;
        const isDiscontent =
          loyalty < CONTROL_UPRISING_MAX_LOYALTY
          && attrition >= CONTROL_UPRISING_MIN_ATTRITION;
        const discontentSince = city.uprisingDiscontentSinceTick;

        if (isDiscontent && discontentSince == null) {
          // Legacy saves and newly unhappy cities both start a fresh timer;
          // time spent controlled while conditions were healthy never counts.
          controlled = {
            ...p,
            uprisingDiscontentSinceTick: s.totalTicks,
          } as T;
        } else if (!isDiscontent && discontentSince != null) {
          // Recovery breaks the streak. A later deterioration must sustain a
          // complete new window before another uprising can happen.
          controlled = {
            ...p,
            uprisingDiscontentSinceTick: undefined,
          } as T;
        } else if (isDiscontent && discontentSince != null) {
          const discontentTicks = Math.max(0, s.totalTicks - discontentSince);
          if (discontentTicks >= CONTROL_UPRISING_MIN_TICKS) {
            const formerStatus = p.controlStatus === "annexed" ? "annexation" : "occupation";
            partnerAlerts.push({
              id: `control-uprising-${p.id}-${s.totalTicks}`,
              timestamp: s.gameDate,
              tick: s.totalTicks,
              category: "alert",
              title: `${p.name}: UPRISING`,
              body: `${p.name} has overthrown our ${formerStatus} after ${discontentTicks} ticks of sustained discontent. Local authority has declared independence and hostile forces are mobilizing.\n\nLoyalty: ${Math.round(loyalty)}/100\nAttrition: ${Math.round(attrition)}/100\nControl lost: ${p.controlStatus.toUpperCase()}`,
              read: false,
              priority: "critical",
            });
            return {
              ...p,
              // Deterrence and other world effects can reduce threat or
              // deactivate a city while it is controlled. A successful
              // uprising must restore the normal hostile-gate prerequisites,
              // not merely change the control label.
              isActive: true,
              threat: Math.max(CONTROL_UPRISING_HOSTILE_THREAT, p.threat ?? 0),
              controlStatus: "independent",
              tributePerTick: 0,
              occupiedSinceTick: undefined,
              uprisingDiscontentSinceTick: undefined,
            } as T;
          }
        }
      }
      if (p.controlStatus === "occupied") {
        tributeIncome += p.tributePerTick ?? 0;
      }
      return controlled;
    }
    if (uprisingEligible && (p as ExternalMegacity).uprisingDiscontentSinceTick != null) {
      p = { ...p, uprisingDiscontentSinceTick: undefined } as T;
    }
    const snap = readCityStats(p);
    if (snap.cityHealth <= 0 && snap.attrition >= 60) {
      const tribute = Math.max(5, Math.round(tributeForOccupation(p) / 2));
      partnerAlerts.push({
        id: `collapse-${p.id}-${s.totalTicks}`,
        timestamp: s.gameDate, tick: s.totalTicks, category: "alert",
        title: `${p.name}: CITY COLLAPSED`,
        body: `${p.name} has fallen. Civic authority disintegrated under sustained attrition. Our forces moved into the power vacuum and now garrison the ruins. Tribute: ${tribute} credits/tick.\n\nPopulation: ${snap.population.toLocaleString()}\nAttrition: ${Math.round(snap.attrition)}/100`,
        read: false, priority: "critical",
      });
      return { ...p, controlStatus: "occupied" as const, tributePerTick: tribute, occupiedSinceTick: s.totalTicks };
    }
    return recoverPartnerStats(p) as T;
  };

  const updatedMegacities = (s.externalMegacities ?? []).map((m) => processPartner(m, true));
  const updatedTownships = (s.townships ?? []).map((t) => processPartner(t, false));

  // Refresh per-partner dynamics (stance, concerns, current action, archetypes).
  let mcWithDynamics = updatedMegacities;
  let twWithDynamics = updatedTownships;
  let npcAlerts: GameMessage[] = [];
  let npcAdvanced: GameState["diplomacyAdvanced"] = s.diplomacyAdvanced;
  let npcActiveEvents: GameState["activeEvents"] = s.activeEvents;
  let npcNewsFeed: GameState["newsFeed"] = s.newsFeed;
  try {
    const dynState: GameState = { ...s, externalMegacities: updatedMegacities, townships: updatedTownships };
    mcWithDynamics = updatedMegacities.map((m) => refreshPartnerDynamics(m, dynState));
    twWithDynamics = updatedTownships.map((t) => refreshPartnerDynamics(t, dynState));
    const npcRes = processNpcWorldEvents({ ...dynState, externalMegacities: mcWithDynamics, townships: twWithDynamics });
    npcAlerts = npcRes.alerts;
    npcAdvanced = npcRes.state.diplomacyAdvanced;
    // Task #496: rival war declarations push ticker headlines onto newsFeed
    // inside processNpcWorldEvents — carry them through or they get dropped.
    npcNewsFeed = npcRes.state.newsFeed;
    // Propagate any new INTERVENE events from processNpcWorldEvents (de-duped by id).
    if (Array.isArray(npcRes.state.activeEvents) && npcRes.state.activeEvents !== s.activeEvents) {
      const existingIds = new Set((s.activeEvents ?? []).map((e) => e.id));
      const merged = [...(s.activeEvents ?? [])];
      for (const ev of npcRes.state.activeEvents) {
        if (!existingIds.has(ev.id)) merged.push(ev);
      }
      npcActiveEvents = merged;
    }
  } catch (e) {
    console.warn("[TICK] Partner dynamics failed:", e);
  }

  let playerAttritionDelta = 0;
  let playerPopHit = 0;
  let playerUnrestHit = 0;
  let playerAmmoSiphon = 0;
  let playerFuelSiphon = 0;
  const enemyAlerts: GameMessage[] = [];

  const adv = s.diplomacyAdvanced;
  const wars = (adv && Array.isArray((adv as { wars?: unknown[] }).wars))
    ? (adv as { wars: { status?: string }[] }).wars
    : [];
  const activeWarCount = wars.filter((w) => !w.status || w.status === "active").length;
  if (activeWarCount > 0) playerAttritionDelta += 0.4 * activeWarCount;
  if (s.cityStats.unrest > 60) playerAttritionDelta += 0.2;
  if (playerAttritionDelta === 0 && (s.cityStats.attrition ?? 0) > 0) playerAttritionDelta -= 0.15;

  const hostileMegacities = updatedMegacities.filter((m) => m.isActive && m.loyalty < 15 && m.threat > 50 && m.controlStatus !== "annexed" && m.controlStatus !== "occupied");
  for (const hm of hostileMegacities) {
    if (Math.random() < 0.018) {
      const popHit = 50 + Math.floor(Math.random() * 350);
      const attrHit = 4 + Math.floor(Math.random() * 6);
      const unrestHit = 2 + Math.floor(Math.random() * 4);
      const ammoHit = Math.min(s.resources.ammo, 20 + Math.floor(Math.random() * 60));
      const fuelHit = Math.min(s.resources.fuel, 15 + Math.floor(Math.random() * 50));
      playerPopHit += popHit;
      playerAttritionDelta += attrHit;
      playerUnrestHit += unrestHit;
      playerAmmoSiphon += ammoHit;
      playerFuelSiphon += fuelHit;
      enemyAlerts.push({
        id: `enemy-strike-${hm.id}-${s.totalTicks}`,
        timestamp: s.gameDate, tick: s.totalTicks, category: "alert",
        title: `INCOMING STRIKE — ${hm.name}`,
        body: `${hm.name} launched a hostile strike on our city.\n\n--- DAMAGE ---\nCivilian casualties: ${popHit.toLocaleString()}\nAttrition: +${attrHit}\nUnrest: +${unrestHit}\nMunitions lost in raid: -${ammoHit} ammo, -${fuelHit} fuel`,
        read: false, priority: "high",
      });
    }
  }

  const newAttrition = Math.max(0, Math.min(100, (s.cityStats.attrition ?? 0) + playerAttritionDelta));
  const newPop = Math.max(0, s.cityStats.population - playerPopHit);
  const newUnrest = Math.max(0, Math.min(100, s.cityStats.unrest + playerUnrestHit));

  s = {
    ...s,
    externalMegacities: mcWithDynamics,
    townships: twWithDynamics,
    diplomacyAdvanced: npcAdvanced,
    activeEvents: npcActiveEvents,
    newsFeed: npcNewsFeed,
    totalCreditsEarned: (s.totalCreditsEarned ?? 0) + Math.max(0, tributeIncome),
    resources: {
      ...s.resources,
      credits: s.resources.credits + tributeIncome,
      ammo: Math.max(0, s.resources.ammo - playerAmmoSiphon),
      fuel: Math.max(0, s.resources.fuel - playerFuelSiphon),
    },
    cityStats: {
      ...s.cityStats,
      attrition: newAttrition,
      population: newPop,
      unrest: newUnrest,
    },
  };

  return { state: s, alerts: [...partnerAlerts, ...enemyAlerts, ...npcAlerts] };
}

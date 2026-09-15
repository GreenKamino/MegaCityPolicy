import { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GameState } from "@/engine/types";
import { createDefaultNewSystems, launchExpedition, EXPEDITION_TEMPLATES } from "@/engine/newSystems";
import type { CivilWarState } from "@/engine/newSystems";
import { ALL_COMMODITIES, FOODSTUFFS, CROPS, WATER } from "@/engine/commodities";
import { WEAPONS, ADDITIONAL_AMMO, MISSILES, NUCLEAR_WEAPONS } from "@/engine/weapons";
import { createInitialState, createOneMonthState } from "@/engine/initialState";

const SAVE_KEY_PREFIX = "@megacity_save_slot_";

const INFRA_BUILDINGS = [
  "fusionReactors", "solarTowerFields", "microFusionGenerators", "geothermalWells",
  "powerGridStabilizers", "energyStorageVaults", "emergencyPowerBackup",
  "reactorCoolingTowers", "gridLoadBalancingAI", "hvTransmissionLines",
  "atmosphericHarvestTowers", "megaDesalinationPlants", "waterRecyclingSuperFacilities",
  "sewerPurificationPlants", "undergroundWaterReservoirs", "waterPumpStations",
  "emergencyWaterDepots", "stormwaterCaptureSystems", "aquiferStabilizationDrills",
  "smartWaterDistributionGrid",
  "skyrailTransitLines", "undergroundMaglevSystem", "cargoFreightMegaways",
  "droneLogisticsCorridors", "skyportLandingPlatforms", "automatedFreightTerminals",
  "vehicleMaintenanceDepots", "trafficControlAIGrid", "pedestrianSkybridgeNetworks",
  "rapidEmergencyTransitLines",
  "foodDistributionDepots", "emergencyGrainVaults",
  "constructionMaterialRefineries", "industrialRecyclingFacilities",
  "supplyChainDistributionCenters",
];

export function useCheats(
  setState: React.Dispatch<React.SetStateAction<GameState>>,
  setActiveSlot: React.Dispatch<React.SetStateAction<number>>,
  setHasSave: React.Dispatch<React.SetStateAction<boolean>>,
  refreshSlotMetas: () => Promise<void>,
  getSlotKey: (slot: number) => string,
) {
  const cheatHabTowers = useCallback(() => {
    setState((prev) => ({
      ...prev,
      buildings: { ...prev.buildings, habBlockMegaTowers: (prev.buildings.habBlockMegaTowers ?? 0) + 1000 },
    }));
  }, []);

  const cheatHabAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      buildings: {
        ...prev.buildings,
        habBlockMegaTowers: (prev.buildings.habBlockMegaTowers ?? 0) + 100,
        workerHousingStacks: (prev.buildings.workerHousingStacks ?? 0) + 100,
        slumRehabProjects: (prev.buildings.slumRehabProjects ?? 0) + 100,
        modularHousingFactories: (prev.buildings.modularHousingFactories ?? 0) + 100,
        highDensityResidentialPlatforms: (prev.buildings.highDensityResidentialPlatforms ?? 0) + 100,
        transitIntegratedHousingNodes: (prev.buildings.transitIntegratedHousingNodes ?? 0) + 100,
        refugeeProcessingHousing: (prev.buildings.refugeeProcessingHousing ?? 0) + 100,
        luxuryPenthouseTowers: (prev.buildings.luxuryPenthouseTowers ?? 0) + 100,
        seniorCitizenComplexes: (prev.buildings.seniorCitizenComplexes ?? 0) + 100,
      },
    }));
  }, []);

  const cheatAddSteel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      resources: { ...prev.resources, steel: prev.resources.steel + 100000 },
    }));
  }, []);

  const cheatAddSteelMega = useCallback(() => {
    setState((prev) => ({
      ...prev,
      resources: { ...prev.resources, steel: prev.resources.steel + 500000 },
    }));
  }, []);

  const cheatAddWaterFacilities = useCallback(() => {
    setState((prev) => ({
      ...prev,
      buildings: {
        ...prev.buildings,
        waterRecyclingSuperFacilities: (prev.buildings.waterRecyclingSuperFacilities ?? 0) + 1000,
      },
    }));
  }, []);

  const cheatAddFoodFacilities = useCallback(() => {
    setState((prev) => ({
      ...prev,
      buildings: {
        ...prev.buildings,
        syntheticFoodPlants: (prev.buildings.syntheticFoodPlants ?? 0) + 1000,
      },
    }));
  }, []);

  const cheatAddWasteSewage = useCallback(() => {
    setState((prev) => ({
      ...prev,
      buildings: {
        ...prev.buildings,
        sewerPurificationPlants: (prev.buildings.sewerPurificationPlants ?? 0) + 500,
        automatedWasteProcessing: (prev.buildings.automatedWasteProcessing ?? 0) + 200,
        sewageTreatmentWorks: (prev.buildings.sewageTreatmentWorks ?? 0) + 200,
        wasteIncinerationPlants: (prev.buildings.wasteIncinerationPlants ?? 0) + 100,
      },
    }));
  }, []);

  const cheatRemovePopulation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      cityStats: {
        ...prev.cityStats,
        population: Math.max(100000, prev.cityStats.population - 500000),
      },
    }));
  }, []);

  const cheatFactionWar = useCallback(() => {
    setState((prev) => {
      const activeFactions = prev.factions.filter((f) => f.isActive && f.threat < 80);
      if (activeFactions.length === 0) return prev;
      const target = activeFactions[Math.floor(Math.random() * activeFactions.length)];
      return {
        ...prev,
        factions: prev.factions.map((f) =>
          f.id === target.id ? { ...f, threat: 100, loyalty: 0 } : f
        ),
        messages: [
          ...prev.messages,
          {
            id: `war-${Date.now()}`,
            title: `${target.name} DECLARES WAR`,
            body: `The ${target.name} has declared open hostilities against your administration. Their threat level is now maximum. Prepare for conflict.`,
            timestamp: prev.gameDate ?? { year: 2030, month: 1, day: 1, hour: 0 },
            tick: 0,
            read: false,
            category: "alert" as const,
            priority: "critical" as const,
          },
        ],
      };
    });
  }, []);

  const cheatAdd1BCredits = useCallback(() => {
    setState((prev) => ({
      ...prev,
      resources: { ...prev.resources, credits: prev.resources.credits + 1_000_000_000 },
    }));
  }, []);

  const cheatAdd1BSteel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      resources: { ...prev.resources, steel: prev.resources.steel + 1_000_000_000 },
    }));
  }, []);

  const cheatAdd2BCredits = useCallback(() => {
    setState((prev) => ({
      ...prev,
      resources: { ...prev.resources, credits: prev.resources.credits + 2_000_000_000 },
    }));
  }, []);

  const cheatAddPopulation = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      cityStats: { ...prev.cityStats, population: prev.cityStats.population + amount },
      demographics: { ...prev.demographics, totalPopulation: prev.demographics.totalPopulation + amount },
    }));
  }, []);

  const cheatAddUnits = useCallback((unitKey: string, amount: number) => {
    setState((prev) => ({
      ...prev,
      units: { ...prev.units, [unitKey]: (prev.units[unitKey] ?? 0) + amount },
    }));
  }, []);

  const cheatSetDemographic = useCallback((key: string, value: number) => {
    setState((prev) => ({
      ...prev,
      demographics: { ...prev.demographics, [key]: value },
    }));
  }, []);

  const cheatMaxFood = useCallback(() => {
    setState((prev) => {
      const stockpiles = { ...prev.stockpiles };
      for (const c of [...FOODSTUFFS, ...CROPS]) {
        stockpiles[c.id] = (stockpiles[c.id] ?? 0) + 1_000_000;
      }
      return { ...prev, stockpiles, resources: { ...prev.resources, food: prev.resources.food + 1_000_000 } };
    });
  }, []);

  const cheatMaxWater = useCallback(() => {
    setState((prev) => {
      const stockpiles = { ...prev.stockpiles };
      for (const c of WATER) {
        stockpiles[c.id] = (stockpiles[c.id] ?? 0) + 1_000_000;
      }
      return { ...prev, stockpiles, resources: { ...prev.resources, water: prev.resources.water + 1_000_000 } };
    });
  }, []);

  const cheatLoadOneMonthSave = useCallback(async () => {
    const oneMonth = { ...createOneMonthState(), saveSlot: 1 };
    setState(oneMonth);
    setActiveSlot(1);
    await AsyncStorage.setItem(getSlotKey(1), JSON.stringify(oneMonth));
    const slot2Copy = { ...oneMonth, saveSlot: 2 };
    await AsyncStorage.setItem(getSlotKey(2), JSON.stringify(slot2Copy));
    await refreshSlotMetas();
    setHasSave(true);
  }, [refreshSlotMetas, getSlotKey]);

  const cheatBulkCommodities = useCallback(() => {
    setState((prev) => {
      const stockpiles = { ...prev.stockpiles };
      for (const c of ALL_COMMODITIES) {
        stockpiles[c.id] = (stockpiles[c.id] ?? 0) + 100;
      }
      return { ...prev, stockpiles };
    });
  }, []);

  const cheatBulkUnits = useCallback(() => {
    setState((prev) => {
      const units = { ...prev.units };
      for (const key of Object.keys(units)) {
        units[key] = (units[key] ?? 0) + 100;
      }
      return { ...prev, units };
    });
  }, []);

  const cheatBulkResources = useCallback(() => {
    setState((prev) => ({
      ...prev,
      resources: {
        ...prev.resources,
        credits: prev.resources.credits + 1_000_000,
        steel: (prev.resources.steel ?? 0) + 100,
        goods: (prev.resources.goods ?? 0) + 100,
        fuel: (prev.resources.fuel ?? 0) + 100,
        medSupplies: (prev.resources.medSupplies ?? 0) + 100,
        ammo: (prev.resources.ammo ?? 0) + 100,
      },
    }));
  }, []);

  const cheatBulkAmmoWeapons = useCallback(() => {
    setState((prev) => {
      const stockpiles = { ...prev.stockpiles };
      for (const w of WEAPONS) stockpiles[w.id] = (stockpiles[w.id] ?? 0) + 1000;
      for (const a of ADDITIONAL_AMMO) stockpiles[a.id] = (stockpiles[a.id] ?? 0) + 1000;
      for (const m of MISSILES) stockpiles[m.id] = (stockpiles[m.id] ?? 0) + 1000;
      for (const n of NUCLEAR_WEAPONS) stockpiles[n.id] = (stockpiles[n.id] ?? 0) + 1000;
      return { ...prev, stockpiles };
    });
  }, []);

  const cheatCredits = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      resources: {
        ...prev.resources,
        credits: prev.resources.credits + amount,
      },
    }));
  }, []);

  const cheatSetStat = useCallback((stat: string, value: number) => {
    setState((prev) => ({
      ...prev,
      cityStats: { ...prev.cityStats, [stat]: value },
    }));
  }, []);

  const cheatMaxResources = useCallback(() => {
    setState((prev) => ({
      ...prev,
      resources: {
        credits: 999999,
        food: 9999,
        water: 9999,
        power: 9999,
        steel: 9999,
        goods: 9999,
        fuel: 9999,
        medSupplies: 9999,
        ammo: 9999,
      },
    }));
  }, []);

  const cheatReduceUnrest = useCallback(() => {
    setState((prev) => ({
      ...prev,
      cityStats: { ...prev.cityStats, unrest: Math.max(0, prev.cityStats.unrest - 20) },
    }));
  }, []);

  const cheatReduceCrime = useCallback(() => {
    setState((prev) => ({
      ...prev,
      cityStats: { ...prev.cityStats, crime: Math.max(0, prev.cityStats.crime - 20) },
    }));
  }, []);

  const cheatBulkBuildings = useCallback(() => {
    setState((prev) => {
      const buildings = { ...prev.buildings };
      for (const key of Object.keys(buildings)) {
        if (typeof buildings[key] === "number") {
          buildings[key] = (buildings[key] ?? 0) + 5;
        }
      }
      return { ...prev, buildings };
    });
  }, []);

  const cheatBulkBuildings1000 = useCallback(() => {
    setState((prev) => {
      const buildings = { ...prev.buildings };
      for (const key of Object.keys(buildings)) {
        if (typeof buildings[key] === "number") {
          buildings[key] = (buildings[key] ?? 0) + 1000;
        }
      }
      return { ...prev, buildings };
    });
  }, []);

  const cheatInfraBuildings1000 = useCallback(() => {
    setState((prev) => {
      const buildings = { ...prev.buildings };
      for (const key of INFRA_BUILDINGS) {
        buildings[key] = (buildings[key] ?? 0) + 1000;
      }
      return { ...prev, buildings };
    });
  }, []);

  const cheatMaxLoyaltyAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, loyalty: 100 })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, loyalty: 100 })),
      townships: (prev.townships ?? []).map((t) => t.status === "undiscovered" ? t : { ...t, loyalty: 100 }),
    }));
  }, []);

  const cheatInstantAlliance = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, loyalty: 100, influence: 100, threat: 0 })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, loyalty: 100, influence: 100, threat: 0 })),
      townships: (prev.townships ?? []).map((t) => ({ ...t, loyalty: 100, influence: 100, threat: 0, status: t.status === "undiscovered" ? "neutral" as const : t.status })),
    }));
  }, []);

  const cheatUnlockAllTrade = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, influence: 100, isActive: true })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, influence: 100, isActive: true })),
      townships: (prev.townships ?? []).map((t) => ({ ...t, influence: 100, status: t.status === "undiscovered" ? "neutral" as const : t.status })),
    }));
  }, []);

  const cheatForcePeace = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, threat: 0 })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, threat: 0 })),
      townships: (prev.townships ?? []).map((t) => t.status === "undiscovered" ? t : { ...t, threat: 0 }),
    }));
  }, []);

  const cheatRevealIntel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, isActive: true, influence: Math.max(f.influence, 50) })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, isActive: true, influence: Math.max(m.influence, 50) })),
      townships: (prev.townships ?? []).map((t) => t.status === "undiscovered" ? { ...t, status: "neutral" as const } : t),
    }));
  }, []);

  const cheatMegacityFriendMax = useCallback(() => {
    setState((prev) => ({
      ...prev,
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, loyalty: 100, influence: 100, threat: 0 })),
      townships: (prev.townships ?? []).map((t) => t.status === "undiscovered" ? t : { ...t, loyalty: 100, influence: 100, threat: 0 }),
    }));
  }, []);

  const cheatInstantJointConstruction = useCallback(() => {
    setState((prev) => {
      const buildings = { ...prev.buildings };
      const completedProjects = (prev.jointProjects ?? []).map((jp) => {
        if (jp.status === "in_progress") {
          buildings[jp.buildingKey] = (buildings[jp.buildingKey] ?? 0) + 1;
          return { ...jp, progress: jp.target, status: "complete" as const };
        }
        return jp;
      });
      return { ...prev, buildings, jointProjects: completedProjects };
    });
  }, []);

  const cheatDiplomaticImmunity = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, threat: 0, loyalty: Math.max(f.loyalty, 50) })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, threat: 0, loyalty: Math.max(m.loyalty, 50) })),
      townships: (prev.townships ?? []).map((t) => t.status === "undiscovered" ? t : { ...t, threat: 0, loyalty: Math.max(t.loyalty, 50) }),
    }));
  }, []);

  const cheatFactionReset = useCallback(() => {
    const fresh = createInitialState();
    setState((prev) => ({
      ...prev,
      factions: fresh.factions,
      externalMegacities: fresh.externalMegacities,
      townships: fresh.townships,
      tradeAgreements: [],
      jointProjects: [],
      diplomaticPacts: [],
    }));
  }, []);

  const cheatTradeSurplus = useCallback(() => {
    setState((prev) => {
      const stockpiles = { ...prev.stockpiles };
      for (const key of Object.keys(stockpiles)) {
        stockpiles[key] = (stockpiles[key] ?? 0) + 500;
      }
      return {
        ...prev,
        stockpiles,
        resources: { ...prev.resources, credits: prev.resources.credits + 5_000_000 },
      };
    });
  }, []);

  const cheatSpyMaster = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, isActive: true, influence: 100 })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, isActive: true, influence: 100 })),
      townships: (prev.townships ?? []).map((t) => t.status === "undiscovered" ? { ...t, status: "neutral" as const } : t),
    }));
  }, []);

  const cheatWarProfiler = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, threat: 100 })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, threat: 100 })),
      townships: (prev.townships ?? []).map((t) => t.status === "undiscovered" ? t : { ...t, threat: 100 }),
      resources: { ...prev.resources, credits: prev.resources.credits + 10_000_000 },
    }));
  }, []);

  const cheatPuppetMaster = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, loyalty: 100, influence: 100, threat: 0 })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, loyalty: 100, influence: 100, threat: 0 })),
      townships: (prev.townships ?? []).map((t) => ({ ...t, loyalty: 100, influence: 100, threat: 0, status: t.status === "undiscovered" ? "neutral" as const : t.status })),
    }));
  }, []);

  const cheatGoldenTongue = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, loyalty: Math.min(100, f.loyalty + 30), influence: Math.min(100, f.influence + 20) })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, loyalty: Math.min(100, m.loyalty + 30), influence: Math.min(100, m.influence + 20) })),
      townships: (prev.townships ?? []).map((t) => t.status === "undiscovered" ? t : { ...t, loyalty: Math.min(100, t.loyalty + 30), influence: Math.min(100, t.influence + 20) }),
    }));
  }, []);

  const cheatOpenBorders = useCallback(() => {
    setState((prev) => ({
      ...prev,
      factions: prev.factions.map((f) => ({ ...f, isActive: true })),
      externalMegacities: (prev.externalMegacities ?? []).map((m) => ({ ...m, isActive: true })),
      townships: (prev.townships ?? []).map((t) => t.status === "undiscovered" ? { ...t, status: "neutral" as const } : t),
    }));
  }, []);

  const cheatEveryoneIsDead = useCallback(() => {
    setState((prev) => {
      const gameDate = prev.gameDate ?? { year: 2030, month: 1, day: 1, hour: 0 };
      return {
        ...prev,
        cityStats: {
          ...prev.cityStats,
          population: 1,
          happiness: 0,
          unrest: 100,
          crime: 0,
          lawOrder: 0,
          employment: 0,
          health: 0,
          education: 0,
        },
        demographics: {
          ...prev.demographics,
          totalPopulation: 1,
          birthRate: 0,
          deathRate: 99.9,
        },
        resources: {
          ...prev.resources,
          food: 0,
          water: 0,
          medSupplies: 0,
        },
        messages: [
          ...prev.messages,
          {
            id: `rad-leak-${Date.now()}`,
            title: "CATASTROPHIC RADIATION LEAK",
            body: "A catastrophic radiation leak has swept through the entire city. Reactor containment failure — lethal exposure across all 270 districts. Every citizen, worker, officer, and faction operative is dead. You alone survived in the emergency continuity bunker. The city is yours, Commander. All of it. Every empty corridor, every silent hab-block, every dead screen. Population: 1. Congratulations.",
            timestamp: gameDate,
            tick: prev.totalTicks,
            read: false,
            category: "alert" as const,
            priority: "critical" as const,
          },
        ],
      };
    });
  }, []);

  const cheatTriggerCivilWar = useCallback(() => {
    setState((prev) => {
      const ns = prev.newSystems ?? createDefaultNewSystems();
      const activeFaction = prev.factions.find((f) => f.isActive && !ns.civilWars.some((w) => w.factionId === f.id && w.phase !== "resolved"));
      if (!activeFaction) return prev;
      const war: CivilWarState = {
        factionId: activeFaction.id,
        factionName: activeFaction.name,
        phase: "active",
        intensity: 50,
        ticksRemaining: 30,
        ticksElapsed: 0,
        casualties: 0,
        infrastructureDamage: 0,
        triggerReason: "DEBUG: Forced civil war",
      };
      ns.civilWars = [...ns.civilWars, war];
      ns.totalCivilWars++;
      return { ...prev, newSystems: ns };
    });
  }, []);

  const cheatLaunchExpedition = useCallback(() => {
    setState((prev) => {
      const idx = Math.floor(Math.random() * EXPEDITION_TEMPLATES.length);
      const clone = JSON.parse(JSON.stringify(prev));
      launchExpedition(clone, idx);
      return { ...prev, newSystems: clone.newSystems, resources: clone.resources };
    });
  }, []);

  const cheatToggleTradeAI = useCallback(() => {
    setState((prev) => {
      const ns = prev.newSystems ?? createDefaultNewSystems();
      ns.tradeAIEnabled = !ns.tradeAIEnabled;
      return { ...prev, newSystems: { ...ns } };
    });
  }, []);

  const cheatForceSeasonChange = useCallback(() => {
    setState((prev) => {
      const ns = prev.newSystems ?? createDefaultNewSystems();
      const seasons = ["dust-storm", "acid-rain", "solar-flare", "deep-freeze", "smog-season", "bloom-tide"] as const;
      const seasonId = seasons[Math.floor(Math.random() * seasons.length)];
      const SEASON_DATA: Record<string, { name: string; duration: number; effects: any }> = {
        "dust-storm": { name: "Dust Storm Season", duration: 24, effects: { happiness: -2, foodProduction: -3, healthPenalty: 1, unrest: 1 } },
        "acid-rain": { name: "Acid Rain Season", duration: 20, effects: { happiness: -3, healthPenalty: 2, foodProduction: -2, crime: 1 } },
        "solar-flare": { name: "Solar Flare Event", duration: 12, effects: { powerDrain: 5, researchBonus: -2, unrest: 2 } },
        "deep-freeze": { name: "Deep Freeze", duration: 28, effects: { happiness: -4, foodProduction: -4, powerDrain: 3, crime: 2 } },
        "smog-season": { name: "Industrial Smog Season", duration: 16, effects: { healthPenalty: 3, happiness: -2, tradeBonus: 2 } },
        "bloom-tide": { name: "Bloom Tide", duration: 20, effects: { happiness: 3, foodProduction: 2, healthPenalty: -1, researchBonus: 1 } },
      };
      const data = SEASON_DATA[seasonId];
      ns.seasonalEvent = {
        id: `season-debug-${Date.now()}`,
        name: data.name,
        season: seasonId,
        ticksRemaining: data.duration,
        effects: { ...data.effects },
      };
      return { ...prev, newSystems: { ...ns } };
    });
  }, []);

  const cheatPrestigeBoost = useCallback(() => {
    setState((prev) => {
      const ns = prev.newSystems ?? createDefaultNewSystems();
      for (const path of ns.prestigePaths) {
        path.xp = path.xpToNext;
        path.level = Math.min(10, path.level + 1);
        path.xpToNext = Math.floor(path.xpToNext * 1.5);
      }
      return { ...prev, newSystems: { ...ns } };
    });
  }, []);

  return {
    cheatHabTowers,
    cheatHabAll,
    cheatAddSteel,
    cheatAddSteelMega,
    cheatAddWaterFacilities,
    cheatAddFoodFacilities,
    cheatAddWasteSewage,
    cheatRemovePopulation,
    cheatFactionWar,
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
    cheatBulkAmmoWeapons,
    cheatCredits,
    cheatSetStat,
    cheatMaxResources,
    cheatReduceUnrest,
    cheatReduceCrime,
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
  };
}

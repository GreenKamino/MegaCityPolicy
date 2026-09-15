/**
 * Authoritative infrastructure ledger.
 *
 * This is deliberately a leaf module: it knows about the physical asset
 * catalogs and the persisted ledger shape, but not about ticks, UI, units,
 * personnel, resources, or derived city outputs.  Consumers can therefore
 * reconcile a save or apply an incident without importing the simulation
 * pipeline.
 */

import type { GameState, InfrastructureLedger, InfrastructureAsset, InfrastructureCategory, InfrastructureIncident } from "@/engine/types";
import { MILITARY_BUILDINGS } from "@/engine/militaryBuildings";

export const INFRASTRUCTURE_LEDGER_VERSION = 1;
export const INFRASTRUCTURE_HISTORY_CAP = 100;
export const INFRASTRUCTURE_SUMMARY_CAP = 24;
export const INFRASTRUCTURE_MAX_INTEGRITY = 100;

export type InfrastructureAssetDefinition = {
  key: string;
  category: InfrastructureCategory;
  /** Points supplied by one completed physical asset. */
  points: number;
  label?: string;
  source: "city" | "military" | "rail";
};

// The construction screen is UI-owned and intentionally remains untouched.
// Keep its ordinary physical keys here as an engine-owned exhaustive ledger
// catalog.  Add-on buildings are physical assets too, while units and
// research entries are intentionally absent.
const ORDINARY_BUILDING_KEYS = [
  "fusionReactors", "solarTowerFields", "microFusionGenerators", "geothermalWells", "powerGridStabilizers", "energyStorageVaults", "emergencyPowerBackup", "reactorCoolingTowers",
  "gridLoadBalancingAI", "hvTransmissionLines", "atmosphericHarvestTowers", "megaDesalinationPlants", "waterRecyclingSuperFacilities", "sewerPurificationPlants", "undergroundWaterReservoirs", "waterPumpStations",
  "emergencyWaterDepots", "stormwaterCaptureSystems", "aquiferStabilizationDrills", "smartWaterDistributionGrid", "industrialHydroponicFarms", "syntheticFoodPlants", "nutrientRecyclingCenters", "verticalFarmingTowers",
  "proteinVatFacilities", "foodDistributionDepots", "emergencyGrainVaults", "nutrientPasteProcessingPlants", "algaeBioProteinFarms", "automatedAgriculturalLabs", "populationRegistryCenters", "skyrailTransitLines",
  "undergroundMaglevSystem", "cargoFreightMegaways", "droneLogisticsCorridors", "skyportLandingPlatforms", "automatedFreightTerminals", "vehicleMaintenanceDepots", "trafficControlAIGrid", "pedestrianSkybridgeNetworks",
  "rapidEmergencyTransitLines", "megaManufacturingPlants", "metalFoundryComplexes", "roboticsFabricationFacilities", "constructionMaterialRefineries", "automatedAssemblyLines", "heavyIndustryExpansion", "hazmatContainmentLabs",
  "industrialRecyclingFacilities", "advancedMaterialsRefineries", "supplyChainDistributionCenters", "petrochemicalCrackingTowers", "fuelReserveTankFarms", "acidProductionPlant", "industrialSolventWorks", "fertilizerSynthesisPlant",
  "explosivesCompoundingFacility", "adhesivesAndResinsFactory", "waterTreatmentChemWorks", "paintAndCoatingsPlant", "lubricantsAndFluidsMill", "chemicalStorageTerminal", "polymerExtrusionPlant", "injectionMouldingFacility",
  "syntheticRubberWorks", "compositeLaminationMill", "foamManufacturingPlant", "plasticRecyclingComplex", "bioPlasticsLab", "filamentProductionLine", "pvcPipeAndFittingsPlant", "polycarbonatePanelWorks",
  "oreWashingStation", "deepCoreExcavators", "openPitMineExpansion", "scrapYardProcessingHub", "quarryAndCrushingPlant", "rareEarthSeparationFac", "sandAndSilicaProcessing", "coalGasificationPlant",
  "timberProcessingMill", "saltEvaporationPonds", "consumerGoodsFactory", "electronicsAssemblyPlant", "vehicleManufacturingComplex", "furnitureAndFittingsPlant", "textileMillComplex", "toolAndDieWorks",
  "packagingAndCratingPlant", "glassAndCeramicsWorks", "medicalDeviceFabLab", "printingAndPublishingHub", "nanoMaterialsResearchLab", "smartMaterialsFabrication", "superconductorFoundry", "reactorAlloySmeltingBay",
  "ceramicMatrixCompositeLab", "metamaterialsWorkshop", "aerospaceGradeTitaniumMill", "carbonFibreSpinningPlant", "quantumDotFabricationLab", "industrialDiamondSynthesizer", "sectorHouseHQ", "riotControlCommandCenters",
  "citywideSurveillanceGrid", "aiCrimePredictionCenters", "megaPrisonComplexes", "solitaryDetentionBlocks", "tacticalResponseHangars", "weaponsArmoryDepots", "antiGangEnforcementCenters", "martialLawBunkers",
  "forensicEvidenceVaults", "cybercrimeInterceptionHubs", "undergroundInformantNetworks", "correctionalWorkCamps", "automatedSentryPosts", "witnessProtectionSafeHouses", "perimeterMegaWalls", "defenseTurretTowers",
  "automatedDroneDefenseGrid", "missileDefenseSilos", "rapidResponseBarracks", "cityShieldGenerator", "armoredVehicleGarages", "borderSecurityCheckpoints", "strategicDefenseCommand", "emergencyEvacuationTunnels",
  "advancedResearchLabs", "cyberneticsDevelopmentFacilities", "forensicScienceInstitutes", "experimentalTechVaults", "urbanSystemsAICenters", "archiveRecoveryLabs", "medicalResearchComplexes", "weaponDevelopmentFacilities",
  "quantumDataCenters", "predictiveAnalyticsSupercomputers", "nanotechResearchInstitutes", "xenobiologyLabs", "artificialIntelligenceInstitutes", "climateScienceObservatories", "materialsScienceFoundries", "propagandaBroadcastingTowers",
  "civicEducationInstitutes", "publicHealthMegaClinics", "populationCensusAuthority", "culturalControlCenters", "publicEntertainmentComplexes", "welfareDistributionCenters", "emergencyDisasterResponseHQ", "bureaucraticAdminCenters",
  "centralCityCommandNexus", "youthRehabilitationPrograms", "communityPoliceStations", "automatedCivicServiceKiosks", "publicLegalAidCenters", "veteranReintegrationCenters", "automatedWasteProcessing", "highSpeedFreightElevators",
  "civilianDroneDeliveryGrid", "megaWaterRecyclingNetwork", "highEfficiencyLightingSystems", "verticalLogisticsConveyors", "smartDistrictResourceRouting", "civilDefenseShelterNetwork", "trafficFlowOptimizationAI", "districtHeatingSystems",
  "integratedUtilityMonitoring", "emergencyFloodControlSystems", "advancedFireSuppressionGrid", "atmosphericCoolingTowers", "urbanNoiseDampeningSystems", "expandedRecyclingFacilities", "smartCargoWarehouses", "civicEmergencyAlertNetwork",
  "districtEnergyStorageBatteries", "integratedTransitTicketing", "structuralReinforcementProgram", "automatedBuildingInspections", "wasteHeatRecoverySystems", "citywideDataFiberNetwork", "smartWaterPressureManagement", "publicShelterExpansion",
  "climateControlledPublicZones", "automatedMaintenanceDrones", "districtSecurityLighting", "civicCommunicationsBackbone", "xenofaunaContainmentPens", "radPurificationWetlands", "upliftHabitatBlocks", "bioRemediationPlants", "decontaminationForests",
  "mutantFloraGreenhouses", "fungalSporeFarms", "radCrystalMines", "synthProteinBreweries", "toxinHarvestLabs", "deepRootExtractors", "algaeBloomPonds", "insectProteinHatcheries",
  "crystalSedimentPools", "bioLuminPlantations", "wasteFermentationVats", "aerialPollenCollectors", "chitonShellRanches", "moldCultureChambers", "resinTapStations", "electricEelFarms",
  "mushroomCaveNetworks", "seedBankVaults", "venomMilkingStations", "petrifiedWoodQuarries", "augmentationClinics", "cyberSurgeryHospitals", "neuralResearchLabs", "implantManufacturingPlants",
  "cyberneticRecyclingFacilities", "militaryAugmentationLabs", "aiTrainingDataCenters", "nanoFabricationLabs", "biotechFarms", "blackMarketCyberClinics", "megaCityObservationDecks", "historicalSectorMuseums",
  "luxurySkyHotels", "entertainmentMegaPlexes", "xenoCulturalExhibitionHalls", "guidedUndercityTours", "virtualRealityArcades", "neonDistrictPromenades", "gourmetSynthFoodHalls", "touristInfoKiosks",
  "skylineCableCarRoutes", "exoticFloraGardens", "automatedDefenseTurrets", "antiVehicleCannonTowers", "missileInterceptionGrid", "longRangeArtilleryBatteries", "orbitalDefenseLaserArray", "railgunDefensePlatform",
  "highAltitudeMissileLaunchers", "droneDefenseSwarms", "mobileSiegeCannonUnits", "urbanAntiAirBatteries", "strategicDefenseRadar", "tacticalEMPDefenseTowers", "borderDefenseMissileSilos", "autonomousDefenseMechs",
  "navalHarborDefenseGuns", "highPowerSonicSuppressors", "smartMinefieldSystems", "tacticalLaserDefenseGrid", "mobileRocketArtillery", "orbitalStrikeTargetingSystem", "newOuterResidentialRing", "industrialExpansionSector",
  "megaTransitCorridor", "undergroundTransitNetwork", "deepUtilityTunnelNetwork", "harborExpansionDistrict", "agriculturalDomeDistrict", "verticalHousingArcologies", "researchCampusZone", "civicAdministrativeComplex",
  "borderSecurityWallExtension", "freightLogisticsMegaHub", "entertainmentDistrictExpansion", "culturalHeritageSector", "waterReservoirBasin", "solarPowerFields", "desertResourceExtractionZone", "frontierTradeGate",
  "orbitalLaunchDistrict", "outerDefensePerimeter", "testLaunchPad", "heavyLaunchPad", "boosterAssemblyHangar", "propellantTankFarm", "vehicleIntegrationTower", "guidanceCalibrationLab",
  "launchControlCenter", "recoveryZone", "payloadProcessingFacility", "missileSiloNetwork", "deepSignalTower", "longRangeRelayMast", "satelliteUplinkHub", "orbitalTrackingCenter",
  "signalIntelligenceLab", "spaceTrafficControlCenter", "dataRelayBunker", "diplomaticCommsArray", "secureBroadcastStation", "frontierCommsOutpost", "orbitalDockyard", "stationFabricationRing",
  "zeroGFactory", "orbitalSolarFarm", "fuelCrackingPlant", "vacuumRefinery", "droneServiceBay", "cargoTransferNode", "orbitalWarehouse", "hullAssemblyFacility",
  "orbitalDefensePlatform", "pointDefenseGrid", "marineTrainingSchool", "fleetAcademy", "navalBarracks", "boardingDrillCenter", "spaceSecurityCommand", "escortCraftHangar",
  "orbitalArmory", "strategicWatchPlatform", "orbitalHabitatRing", "stationResidentialCore", "colonyStarterVault", "surfaceHabitatFabricator", "lifeSupportPlant", "hydroponicOrbitalFarm",
  "medicalIsolationModule", "radiationShieldWorks", "colonialAdminHub", "frontierHabComplex", "frontierSurveyAcademy", "orbitalScienceInstitute", "astrometricsLab", "remoteSensorCampus",
  "planetaryFieldSchool", "deepResearchVault", "missionAnalysisCenter", "telescopeComplex", "explorationTrainingYard", "scienceDataArchive", "megaMallComplexes", "corporateOfficeTowers",
  "blackMarketBazaars", "tradeExchangeFloors", "neonSignDistricts", "syntheticMarketHalls", "luxuryBoutiqueArcades", "wholesaleDistributionDepots", "franchiseFoodCourts", "dataServiceBureaus",
  "freightBrokerageHubs", "entertainmentLicensingOffices", "vehicleDealershipLots", "cyberwareRetailChains", "advertisingHoloTowers", "sectorPowerSubstations", "sewageTreatmentWorks", "commsTowerNetworks",
  "undergroundCableConduits", "elevatedHighwayRamps", "wasteIncinerationPlants", "bridgeAndOverpassNetworks", "publicParkAndGreenSpaces", "undergroundParkingMegaStructures", "airPurificationTowers", "publicTransitTerminals",
  "streetLightingGrids", "emergencyServiceStations", "dataBackboneExchanges", "stormDrainMegaSystems", "wastelandScavengerOutposts", "radWasteProcessingPlants", "mutantTradeDepots", "decontaminationStations",
  "salvageTechWorkshops", "borderWallGatehouses", "radResistantFarmDomes", "fossilExcavationSites", "mutantCreatureRanches", "cursedEarthSurveyTeams", "patrolBikeFactories", "apcAssemblyPlants",
  "gunshipHangars", "hoverVehicleWorkshops", "civilianVehiclePlants", "droneManufacturingBays", "vehicleArmorFittingShops", "engineTestingFacilities", "tireTreadFactories", "vehicleRecyclingYards",
  "geneSplicingLabs", "cloningFacilities", "stemCellBanks", "bioReactorFarms", "syntheticBloodBanks", "prionResearchContainment", "geneTherapyClinics", "cryoPreservationVaults",
  "mutagenicTestingLabs", "radBioFilterStations", "woolProcessingMills", "weavingFactories", "kevlarProductionPlants", "leatherTanneries", "nanoweaveSpinners", "uniformTailoringShops",
  "recycledFiberPlants", "syntheticFabricExtruders", "smallArmsFactories", "ammunitionPressLines", "explosivesOrdnancePlants", "bodyArmorForges", "opticsAndSightsLabs", "fieldEquipmentAssembly",
  "energyWeaponForges", "weaponMaintenanceDepots", "fortificationMaterialYards", "specialWeaponsDivision", "cityParks", "botanicalGardens", "publicPlazas", "statueOfCommander",
  "memorialMonuments", "arenaComplex", "zooEnclosures", "megaZoo", "publicTelevisionScreens", "holographicBillboards", "waterFeatures", "sculptureGardens", "streetLighting",
  "communityTheaters", "ecoDomes", "districtTemple", "grandCathedral", "monasteryComplex", "pilgrimageShrines", "inquisitionHQ", "prophetsAcademy", "holyRelicVault",
  "divineBroadcastTower", "sacredGroundPark", "confessionalBureau", "martyrsMemorial", "zealotBarracks", "templeOfCommerce", "oracleChambers", "doomsdayBunkerShrine",
  "biosphereReclamationDomes", "insectBreedingWarrens", "mycologyCultivationCaves", "pollinatorDroneHives", "aquaponicsMegaFacilities", "mutantFloraReserves", "atmosphericBiofilterStations", "xenoVeterinaryHospitals",
  "upliftTrainingAcademies", "geneticSeedVaults", "wildlifeCorridorNetworks", "radWasteCompostingPlants", "upliftCivicCenters", "bioremediationProcessingPlants", "interspeciesMediationCenters", "apexHuntersLodges",
  "wildlandsRangerStations", "hydroponicDomes", "feralLivestockPens", "wildlandsBioreserves", "frontierApothecaries", "bushTanneries", "geneVaults", "expeditionHQ",
  "wastelandGarages", "artifactVaults", "wastelandBeacons", "scavRecyclingPlants", "survivorProcessingCenters", "factionEmbassyComplex", "civilWarBarricadeKit", "factionIntelligenceOffice",
  "neutralZoneMarkets", "factionRehabCenters", "propagandaBroadcastHubs", "districtPlanningOffice", "economicZoneSigns", "specializedWorkerHostels", "automatedLogisticsHubs", "districtPrestigeMonuments",
  "classIntegrationCenters", "radiationShieldingPanels", "acidRainDrainageSystems", "dustStormBreakers", "seasonalEmergencyDepots", "weatherMonitoringNetwork",
  "bb_ministry_of_truth", "bb_ministry_of_love", "bb_ministry_of_peace", "bb_ministry_of_plenty", "bb_telescreen_factory", "bb_thought_police_hq", "bb_memory_hole_facility", "bb_newspeak_institute",
  "bb_children_spy_academy", "bb_public_execution_plaza", "bb_two_minutes_hate_arena", "bb_room_101_complex", "bb_propaganda_broadcast_tower", "bb_book_burning_furnace", "bb_informant_coordination_center", "bb_neural_compliance_lab",
  "bb_state_orphanage", "bb_victory_square", "bb_surveillance_drone_nest", "bb_censorship_bureau", "bb_loyalty_testing_center", "bb_doublethink_training_center", "bb_inner_party_quarters", "bb_unperson_processing", "bb_victory_gin_distillery",
  "sd_dna_sequencing_lab", "sd_gene_therapy_clinic", "sd_clone_production_facility", "sd_genetic_biobank", "sd_crispr_research_center", "sd_organ_cloning_lab", "sd_clone_housing_complex", "sd_genetic_counseling_center",
  "sd_bioethics_tribunal_building", "sd_accelerated_growth_chamber", "sd_genetic_forensics_lab", "sd_synthetic_biology_lab", "sd_clone_conditioning_center", "sd_gm_crop_greenhouse", "sd_livestock_genetics_farm", "sd_stem_cell_research_center",
  "sd_clone_registration_office", "sd_biohazard_containment", "sd_pet_cloning_clinic", "sd_dna_data_center", "sd_genetic_enhancement_spa", "sd_blacksite_lab", "sd_clone_soldier_barracks", "sd_bioprinting_facility",
  "sd_gene_bank_vault", "sd_clone_education_center", "sd_synthetic_meat_plant", "sd_genetic_weapons_lab", "sd_chromosome_factory", "sd_de_extinction_center", "sd_clone_recreation_center", "sd_genetic_surveillance_center",
  "sd_consciousness_transfer_pod", "sd_biomass_recycler", "sd_gene_therapy_hospital", "sd_clone_memorial", "sd_genetic_patent_office", "sd_bioluminescent_garden", "sd_clone_daycare", "sd_genetic_archives",
  "sd_clone_decommissioning_center", "sd_bioreactor_farm", "sd_genetic_casino", "sd_xenobiology_lab", "sd_clone_therapy_center", "sd_genetic_courthouse", "sd_embryo_storage_facility", "sd_neural_imprinting_center",
  "sd_flesh_processing_plant", "sd_genetic_recycling_center", "sd_chimera_containment", "sd_living_building", "sd_clone_marketplace", "sd_genetic_defense_center", "sd_dna_museum", "sd_clone_rights_center",
  "sd_genetic_waste_treatment", "sd_resurrection_chapel", "sd_clone_army_training", "sd_epigenetics_institute",
  "habBlockMegaTowers", "workerHousingStacks", "emergencyShelterBunkers", "slumRehabProjects", "modularHousingFactories", "highDensityResidentialPlatforms",
  "transitIntegratedHousingNodes", "undergroundShelterNetworks", "refugeeProcessingHousing", "luxuryPenthouseTowers", "microApartmentHives", "seniorCitizenComplexes",
  "studentDormitoryBlocks", "constructionCrewBarracks",
] as const;

const TRANSIT_KEYS = new Set([
  "skyrailTransitLines", "undergroundMaglevSystem", "cargoFreightMegaways", "droneLogisticsCorridors",
  "skyportLandingPlatforms", "automatedFreightTerminals", "vehicleMaintenanceDepots", "trafficControlAIGrid",
  "pedestrianSkybridgeNetworks", "rapidEmergencyTransitLines", "megaTransitCorridor", "undergroundTransitNetwork",
  "publicTransitTerminals", "integratedTransitTicketing", "skylineCableCarRoutes",
]);

export const INFRASTRUCTURE_ASSET_CATALOG: readonly InfrastructureAssetDefinition[] = [
  ...ORDINARY_BUILDING_KEYS.map(key => ({
    key,
    category: categoryForKey(key, "city"),
    points: 1,
    source: "city" as const,
  })),
  ...MILITARY_BUILDINGS.map(def => ({
    key: def.id,
    category: "military" as InfrastructureCategory,
    points: 3,
    label: def.name,
    source: "military" as const,
  })),
  {
    key: "rail_corridor",
    category: "transit" as InfrastructureCategory,
    points: 10,
    label: "Completed rail corridor",
    source: "rail" as const,
  },
];

export const INFRASTRUCTURE_CATALOG = INFRASTRUCTURE_ASSET_CATALOG;
export const getInfrastructureAssetDefinition = (key: string, source?: InfrastructureAsset["source"]) =>
  INFRASTRUCTURE_ASSET_CATALOG.find(def => def.key === key && (!source || def.source === source));

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clampIntegrity(value: number, maximum = INFRASTRUCTURE_MAX_INTEGRITY) {
  return Math.max(0, Math.min(Math.max(0, maximum), value));
}
function assetId(source: InfrastructureAsset["source"], key: string) {
  return `${source}:${key}`;
}
function categoryForKey(key: string, source: InfrastructureAsset["source"]): InfrastructureCategory {
  if (source === "military") return "military";
  if (source === "rail" || TRANSIT_KEYS.has(key)) return "transit";
  const value = key.toLowerCase();
  const rules: Array<[InfrastructureCategory, string[]]> = [
    ["energy", ["reactor", "solar", "power", "geothermal", "grid", "fusion"]],
    ["water", ["water", "sewer", "aquifer", "desalination", "stormdrain", "drainage"]],
    ["food", ["food", "hydroponic", "protein", "algae", "agri", "farm", "grain"]],
    ["housing", ["housing", "residential", "shelter", "habitat", "dormitory", "hostel"]],
    ["security", ["prison", "surveillance", "riot", "sentry", "informant", "enforcement", "police"]],
    ["defense", ["defense", "armory", "artillery", "missile", "turret", "cannon", "barricade"]],
    ["research", ["research", "science", "laboratory", "lab", "institute", "academy", "observatory"]],
    ["civic", ["civic", "education", "health", "hospital", "park", "theater", "temple", "cathedral"]],
    ["tourism", ["tour", "hotel", "museum", "mall", "entertainment", "arena", "zoo"]],
    ["commercial", ["market", "trade", "office", "retail", "commercial", "exchange"]],
    ["space", ["orbital", "launch", "zeroG", "colony", "astrometrics", "space"]],
    ["wasteland", ["wasteland", "frontier", "scav", "mutant", "wildlands", "faction"]],
    ["cybernetics", ["cyber", "neural", "augmentation", "implant", "nano"]],
    ["weaponSystems", ["weapon", "gunship", "smallArms", "ordnance", "warhead"]],
    ["expansion", ["expansion", "district", "sector", "corridor", "perimeter"]],
    ["infrastructure", ["utility", "bridge", "highway", "conduit", "backbone", "tower", "terminal"]],
    ["farming", ["farm", "agriculture", "greenhouse", "ranch"]],
    ["industrial", ["factory", "plant", "foundry", "refinery", "mill", "manufactur", "assembly", "processing"]],
  ];
  for (const [category, needles] of rules) if (needles.some(needle => value.includes(needle.toLowerCase()))) return category;
  return "construction";
}
function emptyLedger(): InfrastructureLedger {
  return { version: INFRASTRUCTURE_LEDGER_VERSION, totalPoints: 0, intactPoints: 0, assets: {}, incidents: [], appliedIncidentIds: [], summaries: {} };
}

export function createInfrastructureLedger(state: Pick<GameState, "buildings" | "militaryOverhaul" | "railCorridors">, legacyHealth?: number): InfrastructureLedger {
  const ledger = emptyLedger();
  const definitions = new Map(INFRASTRUCTURE_ASSET_CATALOG.map(def => [`${def.source}:${def.key}`, def]));
  for (const [key, countRaw] of Object.entries(state.buildings ?? {})) {
    const count = Math.max(0, Math.floor(finite(countRaw)));
    if (!count) continue;
    const def = definitions.get(assetId("city", key));
    // The ledger is intentionally allow-listed.  A key in a save that is not
    // in the physical construction catalog is not silently treated as
    // infrastructure (this prevents units, resources, or derived counters
    // from becoming points through a malformed save).
    if (!def) continue;
    ledger.assets[assetId("city", key)] = { id: assetId("city", key), key, source: "city", category: def.category, count, points: count * def.points, maxIntegrity: count * INFRASTRUCTURE_MAX_INTEGRITY, integrity: count * INFRASTRUCTURE_MAX_INTEGRITY };
  }
  const built = state.militaryOverhaul?.logistics?.installationsBuilt ?? {};
  for (const [key, countRaw] of Object.entries(built)) {
    const count = Math.max(0, Math.floor(finite(countRaw)));
    if (!count) continue;
    const def = definitions.get(assetId("military", key)) ?? getInfrastructureAssetDefinition(key, "military");
    if (!def) continue;
    const points = def.points;
    ledger.assets[assetId("military", key)] = { id: assetId("military", key), key, source: "military", category: "military", count, points: count * points, maxIntegrity: count * INFRASTRUCTURE_MAX_INTEGRITY, integrity: count * INFRASTRUCTURE_MAX_INTEGRITY };
  }
  for (const corridor of state.railCorridors ?? []) {
    if (corridor.status !== "completed") continue;
    const id = assetId("rail", corridor.id);
    ledger.assets[id] = { id, key: corridor.id, source: "rail", category: "transit", count: 1, points: 10, maxIntegrity: INFRASTRUCTURE_MAX_INTEGRITY, integrity: INFRASTRUCTURE_MAX_INTEGRITY };
  }
  const rawHealth = Number.isFinite(legacyHealth) ? Math.max(0, Math.min(100, legacyHealth as number)) : undefined;
  // Totals are computed by reconcile below, so inspect the asset set here
  // rather than the still-zero pre-reconciliation total.
  if (rawHealth !== undefined && Object.keys(ledger.assets).length > 0) {
    const ratio = rawHealth / 100;
    for (const asset of Object.values(ledger.assets)) asset.integrity = asset.maxIntegrity * ratio;
  }
  return reconcileInfrastructureLedger(ledger);
}

/** Recompute totals from the completed asset records without resetting damage. */
export function reconcileInfrastructureLedger(ledger: InfrastructureLedger): InfrastructureLedger;
export function reconcileInfrastructureLedger(state: Pick<GameState, "buildings" | "militaryOverhaul" | "railCorridors"> & { infrastructureLedger?: InfrastructureLedger }): InfrastructureLedger;
export function reconcileInfrastructureLedger(input: InfrastructureLedger | (Pick<GameState, "buildings" | "militaryOverhaul" | "railCorridors"> & { infrastructureLedger?: InfrastructureLedger })): InfrastructureLedger {
  if (!("assets" in input)) {
    const canonical = createInfrastructureLedger(input);
    const previous = input.infrastructureLedger;
    if (!previous) return canonical;
    // Counts and points are authoritative in completed state.  Integrity is
    // the only player-facing mutable part and is carried across a count
    // change by preserving the prior asset's integrity ratio.
    for (const [id, asset] of Object.entries(canonical.assets)) {
      const old = previous.assets?.[id];
      if (!old) continue;
      // Existing damage is absolute. New completed capacity arrives intact.
      const damage = Math.max(0, old.maxIntegrity - clampIntegrity(old.integrity, old.maxIntegrity));
      canonical.assets[id] = { ...asset, integrity: Math.max(0, asset.maxIntegrity - damage) };
    }
    canonical.incidents = [...(previous.incidents ?? [])].slice(-INFRASTRUCTURE_HISTORY_CAP);
    canonical.appliedIncidentIds = [...new Set([
      ...(previous.appliedIncidentIds ?? []),
      ...(previous.incidents ?? []).map(incident => incident.id),
    ])];
    canonical.summaries = { ...(previous.summaries ?? {}) };
    return reconcileInfrastructureLedger(canonical);
  }
  const source = input;
  const out: InfrastructureLedger = {
    ...source,
    assets: { ...source.assets },
    incidents: [...(source.incidents ?? [])],
    appliedIncidentIds: [...(source.appliedIncidentIds ?? [])],
    summaries: { ...(source.summaries ?? {}) },
  };
  let total = 0;
  let intact = 0;
  for (const [id, raw] of Object.entries(out.assets)) {
    const count = Math.max(0, Math.floor(finite(raw.count)));
    const points = Math.max(0, finite(raw.points));
    const maxIntegrity = Math.max(0, finite(raw.maxIntegrity, INFRASTRUCTURE_MAX_INTEGRITY));
    const integrity = clampIntegrity(finite(raw.integrity, maxIntegrity), maxIntegrity);
    if (!count || !points) { delete out.assets[id]; continue; }
    out.assets[id] = { ...raw, count, points, maxIntegrity, integrity };
    total += points;
    intact += points * integrity / Math.max(1, maxIntegrity);
  }
  out.version = INFRASTRUCTURE_LEDGER_VERSION;
  out.totalPoints = total;
  out.intactPoints = Math.max(0, Math.min(total, intact));
  return out;
}

export function sanitizeInfrastructureLedger(raw: unknown, state: Pick<GameState, "buildings" | "militaryOverhaul" | "railCorridors">, legacyHealth?: number): InfrastructureLedger {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createInfrastructureLedger(state, legacyHealth);
  const value = raw as Partial<InfrastructureLedger>;
  const base = createInfrastructureLedger(state, legacyHealth);
  const persistedAssets: Record<string, InfrastructureAsset> = {};
  for (const [id, item] of Object.entries(value.assets ?? {})) {
    if (!item || typeof item !== "object") continue;
    const key = typeof item.key === "string" ? item.key : id.split(":").slice(1).join(":");
    const source = item.source === "military" || item.source === "rail" ? item.source : "city";
    const count = Math.max(0, Math.floor(finite(item.count)));
    if (!key || !count) continue;
    const points = Math.max(0, finite(item.points, count * (source === "military" ? 3 : source === "rail" ? 10 : 1)));
    const persistedMax = Math.max(1, finite(item.maxIntegrity, count * INFRASTRUCTURE_MAX_INTEGRITY));
    // Early v1 ledgers used one integrity bar per key. Normalize those
    // records to per-capacity integrity while preserving the damage amount.
    const maxIntegrity = persistedMax <= INFRASTRUCTURE_MAX_INTEGRITY && count > 1
      ? count * INFRASTRUCTURE_MAX_INTEGRITY
      : persistedMax;
    const persistedIntegrity = clampIntegrity(finite(item.integrity, persistedMax), persistedMax);
    const integrity = persistedMax <= INFRASTRUCTURE_MAX_INTEGRITY && count > 1
      ? maxIntegrity - (persistedMax - persistedIntegrity)
      : clampIntegrity(finite(item.integrity, maxIntegrity), maxIntegrity);
    persistedAssets[id] = { id, key, source, category: item.category ?? categoryForKey(key, source), count, points, maxIntegrity, integrity: Math.max(0, integrity) };
  }
  // Rebuild counts/points from the completed state. Existing damage is
  // retained as an absolute loss, so newly completed copies arrive intact.
  const canonical = base.assets;
  const assets: Record<string, InfrastructureAsset> = {};
  for (const [id, current] of Object.entries(canonical)) {
    const persisted = persistedAssets[id];
    if (!persisted) {
      assets[id] = current;
      continue;
    }
    const damage = Math.max(0, persisted.maxIntegrity - clampIntegrity(persisted.integrity, persisted.maxIntegrity));
    assets[id] = { ...current, integrity: Math.max(0, current.maxIntegrity - damage) };
  }
  const incidents = Array.isArray(value.incidents)
    ? value.incidents.filter(incident => incident && typeof incident.id === "string").slice(-INFRASTRUCTURE_HISTORY_CAP)
    : [];
  const appliedIncidentIds = Array.isArray(value.appliedIncidentIds)
    ? value.appliedIncidentIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return reconcileInfrastructureLedger({
    ...base,
    ...value,
    assets,
    incidents,
    appliedIncidentIds: [...new Set([
      ...appliedIncidentIds,
      ...incidents.map(incident => incident.id),
    ])],
    summaries: value.summaries && typeof value.summaries === "object" ? value.summaries : {},
  });
}

function rememberIncident(ledger: InfrastructureLedger, incident: InfrastructureIncident): InfrastructureLedger {
  if (
    (ledger.appliedIncidentIds ?? []).includes(incident.id) ||
    (ledger.incidents ?? []).some(item => item.id === incident.id)
  ) return ledger;
  const summaries = { ...(ledger.summaries ?? {}) };
  summaries[incident.kind] = (summaries[incident.kind] ?? 0) + incident.amount;
  return {
    ...ledger,
    incidents: [...(ledger.incidents ?? []), incident].slice(-INFRASTRUCTURE_HISTORY_CAP),
    appliedIncidentIds: [...(ledger.appliedIncidentIds ?? []), incident.id],
    summaries: Object.fromEntries(Object.entries(summaries).slice(-INFRASTRUCTURE_SUMMARY_CAP)),
  };
}

export type InfrastructureMutation = { incidentId: string; amount: number; assetId?: string; category?: InfrastructureCategory; tick?: number; reason?: string };
export function applyInfrastructureDamage(ledger: InfrastructureLedger, mutation: InfrastructureMutation): InfrastructureLedger {
  if (!mutation.incidentId || (ledger.appliedIncidentIds ?? []).includes(mutation.incidentId) || (ledger.incidents ?? []).some(item => item.id === mutation.incidentId)) return ledger;
  const amount = Math.max(0, finite(mutation.amount));
  if (!amount) return ledger;
  const targets = Object.values(ledger.assets).filter(asset => (!mutation.assetId || asset.id === mutation.assetId) && (!mutation.category || asset.category === mutation.category));
  if (!targets.length) return rememberIncident(ledger, { id: mutation.incidentId, kind: "damage", amount: 0, tick: finite(mutation.tick), reason: mutation.reason });
  let remaining = amount;
  const assets = { ...ledger.assets };
  for (const target of targets) {
    if (remaining <= 0) break;
    const intactPoints = target.points * target.integrity / Math.max(1, target.maxIntegrity);
    const lossPoints = Math.min(intactPoints, remaining);
    const integrityLoss = target.points > 0
      ? lossPoints * target.maxIntegrity / target.points
      : 0;
    assets[target.id] = { ...target, integrity: Math.max(0, target.integrity - integrityLoss) };
    remaining -= lossPoints;
  }
  return rememberIncident(reconcileInfrastructureLedger({ ...ledger, assets }), {
    id: mutation.incidentId,
    kind: "damage",
    amount: amount - remaining,
    tick: finite(mutation.tick),
    reason: mutation.reason,
    assetId: mutation.assetId,
    category: mutation.category ?? (mutation.assetId
      ? ledger.assets[mutation.assetId]?.category
      : undefined),
    source: mutation.assetId
      ? ledger.assets[mutation.assetId]?.source
      : undefined,
  });
}
export function damageInfrastructure(ledger: InfrastructureLedger, mutation: InfrastructureMutation): InfrastructureLedger;
export function damageInfrastructure(ledger: InfrastructureLedger, incidentId: string, amount: number, assetId?: string): InfrastructureLedger;
export function damageInfrastructure(ledger: InfrastructureLedger, mutationOrId: InfrastructureMutation | string, amount?: number, assetId?: string): InfrastructureLedger {
  return applyInfrastructureDamage(ledger, typeof mutationOrId === "string"
    ? { incidentId: mutationOrId, amount: amount ?? 0, assetId }
    : mutationOrId);
}
export function repairInfrastructure(ledger: InfrastructureLedger, mutation: InfrastructureMutation): InfrastructureLedger {
  if (!mutation.incidentId || (ledger.appliedIncidentIds ?? []).includes(mutation.incidentId) || (ledger.incidents ?? []).some(item => item.id === mutation.incidentId)) return ledger;
  const amount = Math.max(0, finite(mutation.amount));
  if (!amount) return ledger;
  const targets = Object.values(ledger.assets).filter(asset => (!mutation.assetId || asset.id === mutation.assetId) && (!mutation.category || asset.category === mutation.category));
  let remaining = amount;
  const assets = { ...ledger.assets };
  for (const target of targets) {
    if (remaining <= 0) break;
    const missingPoints = target.points * (target.maxIntegrity - target.integrity) / Math.max(1, target.maxIntegrity);
    const gainPoints = Math.min(missingPoints, remaining);
    const integrityGain = target.points > 0
      ? gainPoints * target.maxIntegrity / target.points
      : 0;
    assets[target.id] = { ...target, integrity: Math.min(target.maxIntegrity, target.integrity + integrityGain) };
    remaining -= gainPoints;
  }
  return rememberIncident(reconcileInfrastructureLedger({ ...ledger, assets }), {
    id: mutation.incidentId,
    kind: "repair",
    amount: amount - remaining,
    tick: finite(mutation.tick),
    reason: mutation.reason,
    assetId: mutation.assetId,
    category: mutation.category ?? (mutation.assetId
      ? ledger.assets[mutation.assetId]?.category
      : undefined),
    source: mutation.assetId
      ? ledger.assets[mutation.assetId]?.source
      : undefined,
  });
}
export function repairInfrastructureAsset(ledger: InfrastructureLedger, mutation: InfrastructureMutation): InfrastructureLedger {
  return repairInfrastructure(ledger, mutation);
}
export const applyInfrastructureRepair = repairInfrastructure;

export type InfrastructureCapacityMutation = {
  key: string;
  count?: number;
  source?: InfrastructureAsset["source"];
  incidentId?: string;
};
export function addInfrastructureCapacity(ledger: InfrastructureLedger, keyOrMutation: string | InfrastructureCapacityMutation, count = 1, source: InfrastructureAsset["source"] = "city"): InfrastructureLedger {
  const mutation = typeof keyOrMutation === "string" ? { key: keyOrMutation, count, source } : keyOrMutation;
  if (mutation.incidentId && ((ledger.appliedIncidentIds ?? []).includes(mutation.incidentId) || ledger.incidents.some(item => item.id === mutation.incidentId))) return ledger;
  const key = mutation.key;
  count = mutation.count ?? 1;
  source = mutation.source ?? "city";
  const n = Math.max(0, Math.floor(finite(count)));
  if (!key || !n) return ledger;
  const id = assetId(source, key);
  const existing = ledger.assets[id];
  const def = getInfrastructureAssetDefinition(key, source);
  const pointsPerAsset = def?.points ?? (source === "military" ? 3 : source === "rail" ? 10 : 1);
  const assets = { ...ledger.assets };
  if (existing) assets[id] = { ...existing, count: existing.count + n, points: existing.points + n * pointsPerAsset, maxIntegrity: existing.maxIntegrity + n * INFRASTRUCTURE_MAX_INTEGRITY, integrity: existing.integrity + n * INFRASTRUCTURE_MAX_INTEGRITY };
  else assets[id] = { id, key, source, category: def?.category ?? categoryForKey(key, source), count: n, points: n * pointsPerAsset, maxIntegrity: n * INFRASTRUCTURE_MAX_INTEGRITY, integrity: n * INFRASTRUCTURE_MAX_INTEGRITY };
  const out = reconcileInfrastructureLedger({ ...ledger, assets });
  return mutation.incidentId
    ? rememberIncident(out, { id: mutation.incidentId, kind: "capacity_add", amount: n, tick: 0 })
    : out;
}
export function removeInfrastructureCapacity(ledger: InfrastructureLedger, keyOrMutation: string | InfrastructureCapacityMutation, count = 1, source: InfrastructureAsset["source"] = "city"): InfrastructureLedger {
  const mutation = typeof keyOrMutation === "string" ? { key: keyOrMutation, count, source } : keyOrMutation;
  if (mutation.incidentId && ((ledger.appliedIncidentIds ?? []).includes(mutation.incidentId) || ledger.incidents.some(item => item.id === mutation.incidentId))) return ledger;
  const key = mutation.key;
  count = mutation.count ?? 1;
  source = mutation.source ?? "city";
  const id = assetId(source, key);
  const existing = ledger.assets[id];
  if (!existing) return ledger;
  const n = Math.min(existing.count, Math.max(0, Math.floor(finite(count))));
  if (!n) return ledger;
  const ratio = (existing.count - n) / existing.count;
  const damage = Math.max(0, existing.maxIntegrity - existing.integrity);
  const assets = { ...ledger.assets };
  if (existing.count === n) delete assets[id];
  else {
    const maxIntegrity = existing.maxIntegrity * ratio;
    assets[id] = {
      ...existing,
      count: existing.count - n,
      points: existing.points * ratio,
      maxIntegrity,
      integrity: Math.max(0, maxIntegrity - damage),
    };
  }
  const out = reconcileInfrastructureLedger({ ...ledger, assets });
  return mutation.incidentId
    ? rememberIncident(out, { id: mutation.incidentId, kind: "capacity_remove", amount: n, tick: 0 })
    : out;
}
export const addInfrastructurePoints = addInfrastructureCapacity;
export const removeInfrastructurePoints = removeInfrastructureCapacity;
export const initializeInfrastructureLedger = createInfrastructureLedger;
export const reconcileInfrastructure = reconcileInfrastructureLedger;

export function infrastructureHealthPercent(ledger: InfrastructureLedger) {
  return ledger.totalPoints > 0 ? Math.max(0, Math.min(100, ledger.intactPoints / ledger.totalPoints * 100)) : 0;
}
export const getInfrastructureHealth = infrastructureHealthPercent;

/** Attach a ledger and refresh the legacy compatibility mirror immutably. */
export function withInfrastructureLedger<T extends Pick<GameState, "cityStats">>(
  state: T,
  ledger: InfrastructureLedger,
): T & { infrastructureLedger: InfrastructureLedger } {
  return {
    ...state,
    infrastructureLedger: ledger,
    cityStats: {
      ...state.cityStats,
      infrastructureHealth: infrastructureHealthPercent(ledger),
    },
  };
}

/**
 * Apply a legacy percentage-point health delta to the physical ledger.
 *
 * The old simulation expressed infrastructure changes as percentage points
 * while the ledger stores integrity on each physical asset.  Convert the
 * percentage delta to the equivalent amount of asset integrity, then refresh
 * the compatibility mirror through the same immutable helper used by save
 * migration.  Keeping this conversion here prevents callers from accidentally
 * changing the mirror directly (or charging the same change twice).
 */
export function applyInfrastructureHealthDelta<
  T extends Pick<GameState, "cityStats" | "buildings" | "militaryOverhaul" | "railCorridors"> & {
    infrastructureLedger?: InfrastructureLedger;
  },
>(
  state: T,
  delta: number,
  incidentId: string,
  reason?: string,
): T & { infrastructureLedger: InfrastructureLedger } {
  const current = state.infrastructureLedger
    ? reconcileInfrastructureLedger(state)
    : createInfrastructureLedger(state, state.cityStats.infrastructureHealth);
  const safeDelta = finite(delta);
  if (!safeDelta || current.totalPoints <= 0) {
    return withInfrastructureLedger(state, current);
  }
  const mutation: InfrastructureMutation = {
    incidentId,
    // One percentage point is one percent of the city's authoritative physical
    // point capacity. This keeps weighted rail and military assets honest.
    amount: Math.abs(safeDelta) * current.totalPoints / 100,
    tick: "totalTicks" in state && typeof state.totalTicks === "number" ? state.totalTicks : 0,
    reason,
  };
  const next = safeDelta > 0
    ? repairInfrastructure(current, mutation)
    : applyInfrastructureDamage(current, mutation);
  return withInfrastructureLedger(state, next);
}

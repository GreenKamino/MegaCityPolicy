import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import SearchBar from "@/components/SearchBar";
import ContextMenu from "@/components/ContextMenu";
import HoverTooltip from "@/components/HoverTooltip";
import { formatNumber } from "@/utils/format";
import SectionHeader from "@/components/SectionHeader";
import TutorialHint from "@/components/TutorialHint";
import OnboardingBanner from "@/components/OnboardingBanner";
import CommandScreenHeader from "@/components/CommandScreenHeader";
import HousingCapacitySummary from "@/components/HousingCapacitySummary";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useHotkeys } from "@/context/HotkeyContext";
import { useGame, useGameActions } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import { useGameModal } from "@/hooks/useGameModal";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { isSixthDayActive, SD_BUILDINGS } from "@/engine/addons/sixthDay";
import { isBigBrotherActive, BB_BUILDINGS } from "@/engine/addons/bigBrother";
import { playSound } from "@/engine/audio";
import { playHaptic } from "@/engine/haptics";
import {
  getBuildingRecipes,
  getProducerStaffing,
  resourceDisplayName,
  type CivilianRecipeInfo,
} from "@/engine/productionInfo";
import {
  getConstructionTicks,
  MAX_CONSTRUCTION_BATCH,
  MAX_PENDING_CONSTRUCTION_ORDERS,
  validateCityConstructionBatch,
} from "@/engine/pendingConstruction";
import {
  computeHousingCapacityBreakdown,
  HOUSING_CAPACITY_BUILDINGS,
} from "@/engine/housingCapacity";
import { getEligibleRailEndpoints, STANDARD_RAIL_CREW, AUTOMATED_RAIL_CREW, getRailNetworkDiagnostics, getRailCorridorCapabilities } from "@/engine/railNetwork";
import { searchAllBuildings, filterCategoryBuildings } from "@/utils/buildingSearch";

type BuildingDef = {
  key: string;
  label: string;
  description: string;
  cost: number;
  steelCost?: number;
  effect: string;
  subcategory?: string;
};

type Category = {
  id: string;
  label: string;
  icon: string;
  buildings: BuildingDef[];
};

// List rows are plain category buildings while browsing; during a global
// search each row is annotated with the category it belongs to.
type ListedBuilding = BuildingDef & { catId?: string; catLabel?: string };

const CATEGORIES: Category[] = [
  {
    id: "energy",
    label: "ENERGY",
    icon: "zap",
    buildings: [
      { key: "fusionReactors", label: "FUSION REACTOR", description: "A miniature sun, contained by magnets and optimism. Powers entire sectors. The hum keeps nearby residents awake, but they learn to love it.", cost: 128000, steelCost: 280, effect: "+500 power/tick" },
      { key: "solarTowerFields", label: "SOLAR TOWER FIELDS", description: "Kilometre-high towers that drink what sunlight pierces the smog. Output varies with weather and the number of birds that collide with the panels.", cost: 29000, steelCost: 55, effect: "+80 power/tick" },
      { key: "microFusionGenerators", label: "MICRO-FUSION GENERATORS", description: "Suitcase-sized reactors that power a block each. The engineers say they're perfectly safe. The engineers live in a different sector.", cost: 64000, steelCost: 110, effect: "+200 power/tick" },
      { key: "geothermalWells", label: "GEOTHERMAL WELLS", description: "Drill deep enough and the planet gives you free heat. The occasional seismic tremor is just the earth saying hello.", cost: 56000, steelCost: 85, effect: "+150 power/tick" },
      { key: "powerGridStabilizers", label: "POWER GRID STABILIZERS", description: "Keeps the lights from flickering every time someone plugs in a toaster. Boring but essential. The backbone nobody thanks.", cost: 19000, steelCost: 30, effect: "-3% power drain each" },
      { key: "energyStorageVaults", label: "ENERGY STORAGE VAULTS", description: "Giant batteries buried under the city. Store excess power for when things go wrong. Things always go wrong.", cost: 35000, steelCost: 70, effect: "+200 power buffer" },
      { key: "emergencyPowerBackup", label: "EMERGENCY POWER BACKUP", description: "When everything else fails, these kick in. Hospitals, water pumps, and the Commander's personal elevator. Priorities.", cost: 24000, steelCost: 40, effect: "Prevents total blackout" },
      { key: "reactorCoolingTowers", label: "REACTOR COOLING TOWERS", description: "Without these, fusion reactors become fusion craters. The steam they vent has become a landmark. Tourists photograph it.", cost: 40000, steelCost: 85, effect: "+10% reactor efficiency" },
      { key: "gridLoadBalancingAI", label: "GRID LOAD BALANCING AI", description: "An AI that decides who gets power and who doesn't, millisecond by millisecond. It's very good at its job. Disturbingly good.", cost: 48000, effect: "-5% power drain, +stability" },
      { key: "hvTransmissionLines", label: "HV TRANSMISSION LINES", description: "Massive cables strung between sectors like the city's nervous system. Touch one and they'll name a memorial bench after you.", cost: 32000, steelCost: 55, effect: "+40 power/tick, +trade" },
    ],
  },
  {
    id: "water",
    label: "WATER",
    icon: "droplet",
    buildings: [
      { key: "atmosphericHarvestTowers", label: "ATMOSPHERIC HARVEST TOWERS", description: "Pulls moisture from air so polluted you can chew it. The condensers work overtime, and what drips out is technically water. After filtering.", cost: 26000, steelCost: 35, effect: "+80 water/tick" },
      { key: "megaDesalinationPlants", label: "MEGA DESALINATION PLANTS", description: "Drinks the ocean and spits out freshwater. The brine discharge kills everything in a two-kilometre radius, but the city stays hydrated.", cost: 72000, steelCost: 110, effect: "+180 water/tick" },
      { key: "waterRecyclingSuperFacilities", label: "WATER RECYCLING SUPER-FAC", description: "Today's shower is tomorrow's drinking water. The citizens don't need to know the details. The water is clean. That's what matters.", cost: 80000, steelCost: 140, effect: "+240 water/tick" },
      { key: "sewerPurificationPlants", label: "SEWER PURIFICATION PLANTS", description: "Takes the worst the city produces and turns it into something the city can use again. The smell is indescribable. The necessity is undeniable.", cost: 19000, steelCost: 30, effect: "+50 water/tick, -disease" },
      { key: "undergroundWaterReservoirs", label: "UNDERGROUND RESERVOIRS", description: "Massive caverns filled with water, deep beneath the city. Insurance against drought, siege, or catastrophic pipe failure. All three happen regularly.", cost: 32000, steelCost: 55, effect: "+10 water/tick, buffer" },
      { key: "waterPumpStations", label: "WATER PUMP STATIONS", description: "The heart of the water network. Keeps pressure high enough to reach the 200th floor. When these stop, panic starts in about four hours.", cost: 13000, steelCost: 20, effect: "+40 water/tick" },
      { key: "emergencyWaterDepots", label: "EMERGENCY WATER DEPOTS", description: "Sealed tanks of purified water, untouched until the day everything goes wrong. That day comes more often than the brochure suggests.", cost: 16000, steelCost: 30, effect: "Prevents water crisis" },
      { key: "stormwaterCaptureSystems", label: "STORMWATER CAPTURE", description: "Catches rainwater before it joins the toxic runoff. In a city this size, even a light drizzle is worth collecting. Every drop counts.", cost: 22000, steelCost: 35, effect: "+30 water/tick" },
      { key: "aquiferStabilizationDrills", label: "AQUIFER STABILIZATION DRILLS", description: "Drills deep into ancient aquifers. The geologists say the supply will last centuries. The geologists said that about the last aquifer too.", cost: 48000, steelCost: 85, effect: "+70 water/tick" },
      { key: "smartWaterDistributionGrid", label: "SMART WATER GRID", description: "An AI watches every pipe, valve, and tap in the city. It knows when you shower. It knows when you flush. It keeps the water flowing.", cost: 40000, steelCost: 55, effect: "+60 water/tick, -waste" },
    ],
  },
  {
    id: "food",
    label: "FOOD",
    icon: "package",
    buildings: [
      { key: "industrialHydroponicFarms", label: "INDUSTRIAL HYDROPONIC FARMS", description: "Crops grown in liquid, stacked floor to ceiling under purple grow-lights. No soil, no sunlight, no flavor. But the calories are real.", cost: 32000, steelCost: 40, effect: "+160 food/tick" },
      { key: "syntheticFoodPlants", label: "SYNTHETIC FOOD PLANTS", description: "Food assembled molecule by molecule. Nutritionally perfect, aesthetically horrifying. The marketing team earns every credit.", cost: 56000, steelCost: 70, effect: "+200 food/tick" },
      { key: "nutrientRecyclingCenters", label: "NUTRIENT RECYCLING CENTERS", description: "Waste goes in, nutrients come out. Don't ask what happens in between. The biologists know. The biologists drink heavily.", cost: 24000, steelCost: 30, effect: "+60 food/tick" },
      { key: "verticalFarmingTowers", label: "VERTICAL FARMING TOWERS", description: "Fifty floors of lettuce. The workers call it the Green Mile. The produce is fresh, abundant, and aggressively bland.", cost: 35000, steelCost: 50, effect: "+120 food/tick" },
      { key: "proteinVatFacilities", label: "PROTEIN VAT FACILITIES", description: "Meat grown in tanks. No animal required. The texture is close enough that nobody asks questions. Mostly.", cost: 40000, steelCost: 40, effect: "+100 food/tick" },
      { key: "foodDistributionDepots", label: "FOOD DISTRIBUTION DEPOTS", description: "Where the rations get handed out. The lines are long, the portions are measured, and the grateful looks are genuine. Usually.", cost: 16000, steelCost: 30, effect: "+20 food/tick, -unrest" },
      { key: "emergencyGrainVaults", label: "EMERGENCY GRAIN VAULTS", description: "Sealed bunkers full of preserved grain, untouched for decades. When these open, things have gone very, very wrong.", cost: 19000, steelCost: 35, effect: "Prevents food crisis" },
      { key: "nutrientPasteProcessingPlants", label: "NUTRIENT PASTE PLANTS", description: "Grey paste that contains everything the human body needs and nothing the human spirit wants. Keeps people alive. That's the bar.", cost: 29000, steelCost: 35, effect: "+90 food/tick" },
      { key: "algaeBioProteinFarms", label: "ALGAE BIO-PROTEIN FARMS", description: "Green slime, processed into green bars, eaten by people who've stopped caring about color. Cheap, efficient, deeply unappetizing.", cost: 26000, steelCost: 30, effect: "+80 food/tick" },
      { key: "automatedAgriculturalLabs", label: "AUTOMATED AGRI LABS", description: "AI runs the farm now. It optimizes yield, adjusts nutrients, and has never once complained about the weather. The human farmers are... retraining.", cost: 64000, steelCost: 85, effect: "+140 food/tick" },
    ],
  },
  {
    id: "housing",
    label: "HOUSING",
    icon: "home",
    buildings: [
      ...HOUSING_CAPACITY_BUILDINGS.map(({ key, label, description, cost, steelCost, effect }) => ({
        key,
        label,
        description,
        cost,
        steelCost,
        effect,
      })),
      { key: "populationRegistryCenters", label: "POPULATION REGISTRY CENTERS", description: "Every citizen documented, tagged, and tracked. The forms are endless, the queues are legendary, and the data is invaluable.", cost: 16000, effect: "+tax efficiency, -corruption" },
    ],
  },
  {
    id: "transit",
    label: "TRANSIT",
    icon: "navigation",
    buildings: [
      { key: "skyrailTransitLines", label: "SKYRAIL TRANSIT LINES", description: "Elevated monorails threading between towers like silver veins. Rush hour is a sardine can at 200kph. But it beats walking 300 floors.", cost: 48000, steelCost: 110, effect: "+tax, -unrest, +employment" },
      { key: "undergroundMaglevSystem", label: "UNDERGROUND MAGLEV SYSTEM", description: "Trains that float on magnets through tunnels carved in bedrock. Silent, fast, and deeply claustrophobic. The commuters don't mind. They're asleep.", cost: 96000, steelCost: 210, effect: "+trade, -unrest, +happiness" },
      { key: "cargoFreightMegaways", label: "CARGO FREIGHT MEGAWAYS", description: "Twelve-lane highways carrying nothing but trucks, containers, and the economy. The noise never stops. Neither does the commerce.", cost: 40000, steelCost: 85, effect: "+trade, +steel efficiency" },
      { key: "droneLogisticsCorridors", label: "DRONE LOGISTICS CORRIDORS", description: "Dedicated air lanes for delivery drones. The sky hums with packages. Occasionally one drops. The insurance paperwork is considerable.", cost: 32000, effect: "+trade income, +goods flow" },
      { key: "skyportLandingPlatforms", label: "SKYPORT LANDING PLATFORMS", description: "Landing pads bolted to the sides of mega-towers. VTOLs come and go like steel bees. The downdraft ruins hairstyles for blocks around.", cost: 56000, steelCost: 110, effect: "+80 trade/tick" },
      { key: "automatedFreightTerminals", label: "AUTOMATED FREIGHT TERMINALS", description: "No humans, just robots sorting crates at inhuman speed. A ballet of logistics performed by machines that never complain about overtime.", cost: 45000, steelCost: 70, effect: "+60 trade/tick" },
      { key: "vehicleMaintenanceDepots", label: "VEHICLE MAINTENANCE DEPOTS", description: "Grease-stained hangars where mechanics keep the city's fleet alive. Every vehicle that rolls out is one breakdown away from coming back.", cost: 24000, steelCost: 40, effect: "+fuel production, +readiness" },
      { key: "trafficControlAIGrid", label: "TRAFFIC CONTROL AI GRID", description: "An AI that choreographs millions of vehicles simultaneously. It turned rush hour from a warzone into a waltz. Mostly.", cost: 35000, effect: "-unrest, +economic efficiency" },
      { key: "pedestrianSkybridgeNetworks", label: "SKYWALK NETWORKS", description: "Glass-floored bridges connecting towers at dizzying heights. Don't look down. The view is beautiful. The vertigo is real.", cost: 29000, steelCost: 55, effect: "-unrest, +happiness" },
      { key: "rapidEmergencyTransitLines", label: "EMERGENCY TRANSIT LINES", description: "Reserved lanes that clear automatically when sirens sound. Enforcers, medics, and fire crews get priority. Everyone else waits. And prays.", cost: 32000, steelCost: 55, effect: "+riot response speed" },
    ],
  },
  {
    id: "industrial",
    label: "INDUSTRIAL",
    icon: "settings",
    buildings: [
      { key: "megaManufacturingPlants", label: "MEGA MANUFACTURING PLANTS", description: "Factories the size of districts, stamping out everything the city needs. The workers go in at dawn and come out at dusk. The machines never stop.", cost: 80000, steelCost: 140, effect: "+steel, +goods, +200 tax/tick", subcategory: "GENERAL" },
      { key: "metalFoundryComplexes", label: "METAL FOUNDRY COMPLEXES", description: "Rivers of molten metal poured into molds. The heat is unbearable, the output is indispensable. The foundry workers are the toughest people in the city.", cost: 56000, steelCost: 85, effect: "+35 steel/tick, +135 tax/tick", subcategory: "GENERAL" },
      { key: "roboticsFabricationFacilities", label: "ROBOTICS FAB FACILITIES", description: "Robots building robots building components. The humans supervise. For now. The machines are getting better at supervision too.", cost: 72000, steelCost: 110, effect: "+goods, +research, +165 tax/tick", subcategory: "GENERAL" },
      { key: "constructionMaterialRefineries", label: "CONSTRUCTION REFINERIES", description: "Raw ore goes in, building materials come out. The process is loud, dirty, and absolutely vital. Every tower in the city started here.", cost: 40000, steelCost: 55, effect: "+steel, +90 tax/tick", subcategory: "GENERAL" },
      { key: "automatedAssemblyLines", label: "AUTOMATED ASSEMBLY LINES", description: "Conveyor belts stretching for kilometres, assembling goods with mechanical precision. Zero sick days, zero complaints, zero personality.", cost: 51000, steelCost: 70, effect: "+goods, +115 tax/tick", subcategory: "GENERAL" },
      { key: "heavyIndustryExpansion", label: "HEAVY INDUSTRY EXPANSION", description: "More smokestacks, more output, more pollution. The environmental reports are classified. The production numbers are not.", cost: 88000, steelCost: 170, effect: "+175 tax/tick, +all industrial", subcategory: "GENERAL" },
      { key: "hazmatContainmentLabs", label: "HAZMAT CONTAINMENT LABS", description: "Where the city's most dangerous materials are handled by people in suits that cost more than apartments. One mistake and the block evacuates.", cost: 32000, steelCost: 40, effect: "-disease, -pollution unrest", subcategory: "GENERAL" },
      { key: "industrialRecyclingFacilities", label: "INDUSTRIAL RECYCLING", description: "Yesterday's trash becomes tomorrow's building materials. The sorting machines work around the clock. Nothing is truly waste in a city this hungry.", cost: 29000, steelCost: 30, effect: "+15 steel/tick from waste", subcategory: "GENERAL" },
      { key: "advancedMaterialsRefineries", label: "ADVANCED MATERIALS REFINERY", description: "Synthesizing materials that don't exist in nature. The scientists are proud. The accountants are terrified. The results are spectacular.", cost: 64000, steelCost: 110, effect: "+25 steel/tick, rare materials", subcategory: "GENERAL" },
      { key: "supplyChainDistributionCenters", label: "SUPPLY CHAIN DISTRIBUTION", description: "The logistics brain of the industrial sector. Every component tracked, every shipment optimized. Boring work. Essential work — and every center expands storage for both Steel and Goods.", cost: 45000, steelCost: 55, effect: "+10 goods/tick, +45 tax/tick, +5,000 Steel & Goods capacity", subcategory: "GENERAL" },

      { key: "petrochemicalCrackingTowers", label: "PETROCHEMICAL CRACKING TOWERS", description: "Crude oil enters as black sludge, exits as a hundred different chemicals. The towers never cool down. The distillation columns hiss day and night. The smell carries for kilometres.", cost: 77000, steelCost: 125, effect: "+chemicals, +plastics feedstock", subcategory: "CHEMICALS" },
      { key: "fuelReserveTankFarms", label: "FUEL RESERVE TANK FARMS", description: "Armored reservoirs, blast berms, and enough emergency fuel to keep the city moving through a siege. Every valve is inspected twice. Every cigarette is confiscated.", cost: 32000, steelCost: 55, effect: "+2,000 Fuel storage", subcategory: "CHEMICALS" },
      { key: "acidProductionPlant", label: "ACID PRODUCTION PLANT", description: "Sulfuric, hydrochloric, nitric — the holy trinity of industrial chemistry. Everything in the city that dissolves, etches, or purifies passes through here first.", cost: 48000, steelCost: 70, effect: "+chemicals, +60 tax/tick", subcategory: "CHEMICALS" },
      { key: "industrialSolventWorks", label: "INDUSTRIAL SOLVENT WORKS", description: "Producing the cleaning agents, thinners, and degreasers that keep the city's machinery running. The workers wear respirators. The ventilation system earns its keep.", cost: 35000, steelCost: 40, effect: "+solvents, +40 tax/tick", subcategory: "CHEMICALS" },
      { key: "fertilizerSynthesisPlant", label: "FERTILIZER SYNTHESIS PLANT", description: "Nitrogen fixation at industrial scale. The Haber process, perfected and scaled up to feed a million mouths. The ammonia stench is the smell of survival.", cost: 56000, steelCost: 55, effect: "+fertilizer, +food bonus", subcategory: "CHEMICALS" },
      { key: "explosivesCompoundingFacility", label: "EXPLOSIVES COMPOUNDING FAC", description: "Mining charges, demolition blocks, and military ordnance — all manufactured behind three layers of blast walls. The safety record is surprisingly good. Surprisingly.", cost: 64000, steelCost: 85, effect: "+explosives, +mining efficiency", subcategory: "CHEMICALS" },
      { key: "adhesivesAndResinsFactory", label: "ADHESIVES & RESINS FACTORY", description: "Epoxy, cyanoacrylate, polyurethane — the invisible infrastructure that holds the visible infrastructure together. When the glue fails, the city follows.", cost: 40000, steelCost: 40, effect: "+construction materials", subcategory: "CHEMICALS" },
      { key: "waterTreatmentChemWorks", label: "WATER TREATMENT CHEM WORKS", description: "Chlorine, fluoride, flocculants — the chemicals that make recycled sewage drinkable. Nobody thanks the chemists. Everyone drinks the water.", cost: 45000, steelCost: 50, effect: "+water quality, -disease", subcategory: "CHEMICALS" },
      { key: "paintAndCoatingsPlant", label: "PAINT & COATINGS PLANT", description: "Industrial paints, anti-corrosion coatings, and thermal barriers. The city rusts without these. The production line runs in every colour. Mostly grey.", cost: 32000, steelCost: 35, effect: "+goods, +building durability", subcategory: "CHEMICALS" },
      { key: "lubricantsAndFluidsMill", label: "LUBRICANTS & FLUIDS MILL", description: "Machine oil, hydraulic fluid, coolant — the lifeblood of every mechanical system in the city. Without lubricants, the gears seize in hours. Civilisation grinds to a halt.", cost: 38000, steelCost: 40, effect: "+industrial efficiency", subcategory: "CHEMICALS" },
      { key: "chemicalStorageTerminal", label: "CHEMICAL STORAGE TERMINAL", description: "Pressurised tanks, refrigerated vaults, and corrosion-proof containers. Thousands of chemicals stored safely. The manifest is longer than most novels.", cost: 29000, steelCost: 55, effect: "+chemical buffer capacity", subcategory: "CHEMICALS" },

      { key: "polymerExtrusionPlant", label: "POLYMER EXTRUSION PLANT", description: "Plastic pellets heated, melted, and forced through dies to create pipes, sheets, and profiles. The machines run 24/7. The plastic never stops flowing.", cost: 51000, steelCost: 55, effect: "+plastic goods, +55 tax/tick", subcategory: "PLASTICS" },
      { key: "injectionMouldingFacility", label: "INJECTION MOULDING FACILITY", description: "Molten plastic injected into precision moulds at enormous pressure. A million identical parts per day. The moulds cost more than the factory. The output is worth more than both.", cost: 61000, steelCost: 85, effect: "+consumer goods, +70 tax/tick", subcategory: "PLASTICS" },
      { key: "syntheticRubberWorks", label: "SYNTHETIC RUBBER WORKS", description: "Butadiene and styrene polymerised into rubber that never grew on a tree. Tyres, seals, gaskets, hoses — the flexible backbone of every machine in the city.", cost: 45000, steelCost: 50, effect: "+rubber products, +vehicle parts", subcategory: "PLASTICS" },
      { key: "compositeLaminationMill", label: "COMPOSITE LAMINATION MILL", description: "Carbon fibre, fibreglass, and kevlar layered and cured under heat and pressure. The panels that come out are lighter than aluminium and stronger than steel. The future is laminated.", cost: 72000, steelCost: 70, effect: "+composites, +aerospace parts", subcategory: "PLASTICS" },
      { key: "foamManufacturingPlant", label: "FOAM MANUFACTURING PLANT", description: "Polyurethane and polystyrene expanded into insulation, packaging, and cushioning. The city's buildings stay warm because of foam. The city's goods arrive intact because of foam.", cost: 32000, steelCost: 30, effect: "+insulation, +packaging", subcategory: "PLASTICS" },
      { key: "plasticRecyclingComplex", label: "PLASTIC RECYCLING COMPLEX", description: "Shredding, washing, melting, pelletising — turning waste plastic back into raw material. The process is imperfect. The alternative is drowning in plastic. The choice is obvious.", cost: 35000, steelCost: 35, effect: "+recycled feedstock, -waste", subcategory: "PLASTICS" },
      { key: "bioPlasticsLab", label: "BIO-PLASTICS LABORATORY", description: "Growing plastics from algae and bacteria instead of petroleum. The output is modest but the petroleum reserves are finite. The biologists race against the clock.", cost: 56000, steelCost: 40, effect: "+sustainable plastics, +research", subcategory: "PLASTICS" },
      { key: "filamentProductionLine", label: "3D PRINT FILAMENT LINE", description: "Spools of precisely-calibrated printing filament in every polymer imaginable. PLA, ABS, PETG, nylon, carbon-fill — the raw material of distributed manufacturing.", cost: 42000, steelCost: 40, effect: "+3D printing supply, +goods", subcategory: "PLASTICS" },
      { key: "pvcPipeAndFittingsPlant", label: "PVC PIPE & FITTINGS PLANT", description: "Every pipe, joint, and coupling that keeps water flowing and waste moving. Unglamorous. Unappreciated. Utterly essential. When the pipes fail, call a politician.", cost: 29000, steelCost: 30, effect: "+infrastructure materials", subcategory: "PLASTICS" },
      { key: "polycarbonatePanelWorks", label: "POLYCARBONATE PANEL WORKS", description: "Transparent sheets harder than glass and lighter than you'd think. Windows, riot shields, machine guards — polycarbonate goes where glass fears to break.", cost: 48000, steelCost: 50, effect: "+construction panels, +security", subcategory: "PLASTICS" },

      { key: "oreWashingStation", label: "ORE WASHING STATION", description: "Raw ore straight from the mines, washed and sorted by grade. The water runs red with iron dust. The conveyors never stop. The crushers never sleep.", cost: 24000, steelCost: 30, effect: "+ore purity, +yield", subcategory: "RAW" },
      { key: "deepCoreExcavators", label: "DEEP CORE EXCAVATORS", description: "Drilling rigs that bore kilometres into the earth, chasing mineral veins the surface surveys only hinted at. The deeper they go, the richer the ore. And the more dangerous the work.", cost: 67000, steelCost: 110, effect: "+rare minerals, +ore output", subcategory: "RAW" },
      { key: "openPitMineExpansion", label: "OPEN PIT MINE EXPANSION", description: "Terraces carved into the earth like an inverted ziggurat. Trucks spiral down into darkness, climb back loaded with rock. The pit grows deeper every year.", cost: 48000, steelCost: 70, effect: "+iron, +copper, +60 tax/tick", subcategory: "RAW" },
      { key: "scrapYardProcessingHub", label: "SCRAP YARD PROCESSING HUB", description: "Mountains of twisted metal, sorted by electromagnets and cut by plasma torches. Everything that can be melted down will be. Waste is a luxury the city can't afford.", cost: 26000, steelCost: 20, effect: "+scrap recovery, +20 steel/tick", subcategory: "RAW" },
      { key: "quarryAndCrushingPlant", label: "QUARRY & CRUSHING PLANT", description: "Limestone, granite, and aggregate — the bones of every building. The crushers reduce boulders to gravel. The gravel becomes concrete. The concrete becomes the city.", cost: 32000, steelCost: 40, effect: "+aggregate, +construction material", subcategory: "RAW" },
      { key: "rareEarthSeparationFac", label: "RARE EARTH SEPARATION FAC", description: "Neodymium, cerium, lanthanum — elements nobody can pronounce but every device requires. The separation process uses enough acid to dissolve a truck. The output fits in a barrel.", cost: 88000, steelCost: 100, effect: "+rare earth elements, +electronics", subcategory: "RAW" },
      { key: "sandAndSilicaProcessing", label: "SAND & SILICA PROCESSING", description: "Purifying sand into the silicon wafers that power every computer chip. From beach to processor in a chain of furnaces and clean rooms. The sand has come a long way.", cost: 45000, steelCost: 40, effect: "+silicon, +glass production", subcategory: "RAW" },
      { key: "coalGasificationPlant", label: "COAL GASIFICATION PLANT", description: "Turning coal into synthetic gas for chemicals and power. Dirty fuel made slightly less dirty through engineering. The environmentalists hate it. The engineers shrug.", cost: 40000, steelCost: 55, effect: "+syngas, +chemical feedstock", subcategory: "RAW" },
      { key: "timberProcessingMill", label: "TIMBER PROCESSING MILL", description: "Harvesting the few remaining forests and the hydroponic timber plantations. Logs become lumber, sawdust becomes particleboard. Nothing wasted.", cost: 22000, steelCost: 15, effect: "+timber, +construction material", subcategory: "RAW" },
      { key: "saltEvaporationPonds", label: "SALT EVAPORATION PONDS", description: "Shallow ponds where brine dries in the sun. Industrial salt for roads, food processing, and chemical feedstock. The simplest technology in the city, unchanged for millennia.", cost: 16000, effect: "+salt, +chemical feedstock", subcategory: "RAW" },

      { key: "consumerGoodsFactory", label: "CONSUMER GOODS FACTORY", description: "Toasters, furniture, kitchen utensils, clothing — the everyday objects that make life bearable. The assembly lines produce hope in plastic packaging.", cost: 48000, steelCost: 55, effect: "+goods, +happiness, +65 tax/tick", subcategory: "FINISHED" },
      { key: "electronicsAssemblyPlant", label: "ELECTRONICS ASSEMBLY PLANT", description: "Circuit boards, datapads, comm-units, and a thousand other devices soldered together by machines with steadier hands than any human. Quality control rejects one in ten.", cost: 67000, steelCost: 70, effect: "+electronics, +90 tax/tick", subcategory: "FINISHED" },
      { key: "vehicleManufacturingComplex", label: "VEHICLE MFG COMPLEX", description: "Trucks, patrol cars, APCs, and civilian transports rolling off the line. Each one assembled from ten thousand parts. The test track wraps around the factory twice.", cost: 88000, steelCost: 140, effect: "+vehicles, +120 tax/tick", subcategory: "FINISHED" },
      { key: "furnitureAndFittingsPlant", label: "FURNITURE & FITTINGS PLANT", description: "Desks, beds, shelving, and office partitions — mass-produced for a million apartments. Flat-packed, delivered by drone, assembled by the resident. Instructions sold separately.", cost: 29000, steelCost: 30, effect: "+consumer goods, +happiness", subcategory: "FINISHED" },
      { key: "textileMillComplex", label: "TEXTILE MILL COMPLEX", description: "Synthetic fibres woven into fabric, cut into patterns, sewn into uniforms and civilian clothing. The looms clatter around the clock. Fashion is a distant memory. Function is forever.", cost: 35000, steelCost: 35, effect: "+textiles, +clothing, +50 tax/tick", subcategory: "FINISHED" },
      { key: "toolAndDieWorks", label: "TOOL & DIE WORKS", description: "Precision tooling for every factory in the city. Without the dies, the presses stamp nothing. Without the tools, the workers build nothing. This is the factory that makes factories work.", cost: 56000, steelCost: 85, effect: "+industrial efficiency, +parts", subcategory: "FINISHED" },
      { key: "packagingAndCratingPlant", label: "PACKAGING & CRATING PLANT", description: "Cardboard, plastic wrap, crates, and containers. Everything the city produces needs packaging. The plant consumes as much material as it protects.", cost: 26000, steelCost: 20, effect: "+packaging, +trade efficiency, +250 Goods storage", subcategory: "FINISHED" },
      { key: "glassAndCeramicsWorks", label: "GLASS & CERAMICS WORKS", description: "Sand melted at 1700°C, shaped into windows, bottles, lab equipment, and armour plates. The furnaces glow white. The products are transparent. The skill is ancient.", cost: 38000, steelCost: 40, effect: "+glass, +ceramics, +45 tax/tick", subcategory: "FINISHED" },
      { key: "medicalDeviceFabLab", label: "MEDICAL DEVICE FAB LAB", description: "Scalpels, scanners, prosthetics, and diagnostic chips — precision medical instruments manufactured under clean-room conditions. The margins are enormous. The standards are absolute.", cost: 64000, steelCost: 65, effect: "+medSupplies, +80 tax/tick", subcategory: "FINISHED" },
      { key: "printingAndPublishingHub", label: "PRINTING & PUBLISHING HUB", description: "Propaganda posters, technical manuals, ration cards, and the occasional banned novel. The presses run hot. The censors run faster.", cost: 22000, effect: "+propaganda, +admin efficiency", subcategory: "FINISHED" },

      { key: "nanoMaterialsResearchLab", label: "NANO-MATERIALS RESEARCH LAB", description: "Manipulating matter at the atomic level. Carbon nanotubes, graphene composites, and self-healing polymers — materials that rewrite the rules of engineering. The researchers need bigger budgets and smaller tools.", cost: 104000, steelCost: 85, effect: "+nano-materials, +research", subcategory: "ADVANCED" },
      { key: "smartMaterialsFabrication", label: "SMART MATERIALS FABRICATION", description: "Shape-memory alloys, piezoelectric ceramics, and electrochromic glass — materials that respond to their environment. Buildings that heal their own cracks. Armour that hardens on impact.", cost: 80000, steelCost: 100, effect: "+smart materials, +defense", subcategory: "ADVANCED" },
      { key: "superconductorFoundry", label: "SUPERCONDUCTOR FOUNDRY", description: "Crafting materials with zero electrical resistance. The cooling systems cost more than the foundry. The power grid improvements pay for everything. Room-temperature superconductors remain a dream.", cost: 120000, steelCost: 110, effect: "+power efficiency, +research", subcategory: "ADVANCED" },
      { key: "reactorAlloySmeltingBay", label: "REACTOR ALLOY SMELTING BAY", description: "Exotic alloys that survive inside fusion reactors — withstanding temperatures that melt ordinary steel like butter. The metallurgists here work with elements most people have never heard of.", cost: 96000, steelCost: 140, effect: "+reactor alloys, +energy output", subcategory: "ADVANCED" },
      { key: "ceramicMatrixCompositeLab", label: "CERAMIC MATRIX COMPOSITE LAB", description: "Ceramics reinforced with fibres, creating materials that handle heat, pressure, and impact that would destroy metals. Rocket nozzles, brake pads, and armour plates — born in this lab.", cost: 72000, steelCost: 70, effect: "+heat-resistant components", subcategory: "ADVANCED" },
      { key: "metamaterialsWorkshop", label: "METAMATERIALS WORKSHOP", description: "Engineering materials with properties that don't exist in nature. Negative refractive indices, acoustic cloaking, perfect absorbers — physics bent to the city's will. The applications are classified.", cost: 128000, steelCost: 85, effect: "+metamaterials, +stealth tech", subcategory: "ADVANCED" },
      { key: "aerospaceGradeTitaniumMill", label: "AEROSPACE TITANIUM MILL", description: "Forging titanium into components that fly. Every grain boundary inspected, every impurity hunted. Aircraft skins, rocket housings, and surgical implants — all born from the same ingot.", cost: 88000, steelCost: 125, effect: "+titanium components, +aerospace", subcategory: "ADVANCED" },
      { key: "carbonFibreSpinningPlant", label: "CARBON FIBRE SPINNING PLANT", description: "Polymer precursor heated until only carbon remains, then spun into threads thinner than hair and stronger than steel. The product is worth its weight in credits.", cost: 77000, steelCost: 55, effect: "+carbon fibre, +composites", subcategory: "ADVANCED" },
      { key: "quantumDotFabricationLab", label: "QUANTUM DOT FAB LAB", description: "Semiconductor nanocrystals manufactured atom by atom. Displays, solar cells, and medical imaging — all improved by dots too small to see. The clean room is cleaner than surgery.", cost: 112000, steelCost: 70, effect: "+quantum dots, +electronics R&D", subcategory: "ADVANCED" },
      { key: "industrialDiamondSynthesizer", label: "INDUSTRIAL DIAMOND SYNTH", description: "Crushing carbon under pressures that simulate the earth's mantle. The diamonds that emerge cut through anything. The drill bits, saw blades, and grinding wheels last forever. Almost.", cost: 64000, steelCost: 65, effect: "+industrial diamonds, +tool quality", subcategory: "ADVANCED" },
    ],
  },
  {
    id: "security",
    label: "SECURITY",
    icon: "shield",
    buildings: [
      { key: "sectorHouseHQ", label: "SECTOR HOUSE HQ", description: "The iron fist of the law, housed in reinforced concrete. Enforcers deploy from here. Criminals avoid the surrounding blocks. Everyone else walks faster.", cost: 48000, steelCost: 70, effect: "-crime, +law, +district control" },
      { key: "riotControlCommandCenters", label: "RIOT CONTROL CENTERS", description: "Where crowd control becomes a science. Gas canisters, sonic cannons, and a whiteboard covered in crowd-flow diagrams. Unrest is a problem with solutions.", cost: 32000, steelCost: 40, effect: "-2 unrest/tick" },
      { key: "citywideSurveillanceGrid", label: "CITYWIDE SURVEILLANCE GRID", description: "Every street corner, every hallway, every shadow — watched. The cameras never blink. The citizens learned to stop looking up.", cost: 56000, effect: "-crime, -corruption" },
      { key: "aiCrimePredictionCenters", label: "AI CRIME PREDICTION CENTERS", description: "Arrests people before they commit crimes. The AI says it's 94% accurate. The 6% have opinions about that. Nobody asks them.", cost: 64000, effect: "-crime, -corruption" },
      { key: "megaPrisonComplexes", label: "MEGA PRISON COMPLEXES", description: "Cities within the city, populated by people the city would rather forget. The recidivism rate is classified. So is the mortality rate.", cost: 48000, steelCost: 85, effect: "-crime, +prison capacity" },
      { key: "solitaryDetentionBlocks", label: "SOLITARY DETENTION BLOCKS", description: "Solitary confinement, industrialized. Each cell is two metres square. The occupants have time to think about what they've done. And nothing else.", cost: 24000, steelCost: 40, effect: "-crime, +detention capacity" },
      { key: "tacticalResponseHangars", label: "TACTICAL RESPONSE HANGARS", description: "Armored vehicles sit fueled and ready, crews sleeping in shifts. When the alarm sounds, they're rolling in under ninety seconds.", cost: 40000, steelCost: 55, effect: "+response speed, +unit readiness" },
      { key: "weaponsArmoryDepots", label: "WEAPONS ARMORY DEPOTS", description: "Racks of weapons behind armored doors. Enough firepower to level a block. The quartermaster counts every round. Twice.", cost: 29000, steelCost: 40, effect: "+ammo capacity, +unit readiness" },
      { key: "antiGangEnforcementCenters", label: "ANTI-GANG ENFORCEMENT", description: "Dedicated to breaking the gangs that think they run the underhive. Intel boards, informant handlers, and enforcers who know every tunnel.", cost: 35000, steelCost: 35, effect: "-gang influence, -crime" },
      { key: "martialLawBunkers", label: "MARTIAL LAW BUNKERS", description: "Hardened command posts for when democracy takes a holiday. The emergency powers are already drafted. Just add crisis.", cost: 32000, steelCost: 55, effect: "Enables martial law bonuses" },
      { key: "forensicEvidenceVaults", label: "FORENSIC EVIDENCE VAULTS", description: "Climate-controlled vaults where evidence waits for its day in court. Some cases have been waiting for decades. The evidence is patient.", cost: 26000, steelCost: 30, effect: "-crime, +investigation speed" },
      { key: "cybercrimeInterceptionHubs", label: "CYBERCRIME INTERCEPTION HUBS", description: "Where digital criminals meet digital law. The hackers think they're ghosts. These analysts hunt ghosts for a living.", cost: 45000, effect: "-cybercrime, +surveillance" },
      { key: "undergroundInformantNetworks", label: "INFORMANT NETWORK HUBS", description: "Everyone talks to someone. These offices make sure that someone talks to us. Trust is a currency here, and it's heavily devalued.", cost: 22000, effect: "-gang influence, +intelligence" },
      { key: "correctionalWorkCamps", label: "CORRECTIONAL WORK CAMPS", description: "Prisoners earn their keep breaking rocks and bending steel. Rehabilitation through labor. The ethics are debatable. The output is not.", cost: 32000, steelCost: 40, effect: "+steel from labor, -prison cost" },
      { key: "automatedSentryPosts", label: "AUTOMATED SENTRY POSTS", description: "Robot checkpoints that never sleep, never take bribes, and never look the other way. Criminals hate them. Citizens tolerate them. Efficiency loves them.", cost: 29000, steelCost: 35, effect: "-crime, +law, +surveillance" },
      { key: "witnessProtectionSafeHouses", label: "WITNESS PROTECTION HOUSES", description: "Secret locations for people brave or stupid enough to testify. New identity, new address, and a permanent case of looking over their shoulder.", cost: 19000, effect: "+law, +investigation success" },
    ],
  },
  {
    id: "defense",
    label: "DEFENSE",
    icon: "crosshair",
    buildings: [
      { key: "perimeterMegaWalls", label: "PERIMETER MEGA-WALLS", description: "Walls so thick you could drive a truck through them. You can't, of course — the auto-turrets would shred it first. Keeps the wasteland out and the citizens in.", cost: 96000, steelCost: 280, effect: "+3 defense rating each" },
      { key: "defenseTurretTowers", label: "DEFENSE TURRET TOWERS", description: "AI-controlled guns that track anything that moves wrong. The targeting AI has never made a mistake. That the city will officially acknowledge.", cost: 40000, steelCost: 70, effect: "+2 defense rating each" },
      { key: "automatedDroneDefenseGrid", label: "DRONE DEFENSE GRID", description: "Swarms of interceptor drones that eat power like candy but can turn an incoming missile into confetti. Worth every watt.", cost: 64000, effect: "+2 defense, uses power" },
      { key: "missileDefenseSilos", label: "MISSILE DEFENSE SILOS", description: "Hidden beneath parks and parking lots, ready to launch at a moment's notice. The neighbors don't know they live above apocalyptic firepower.", cost: 112000, steelCost: 140, effect: "+4 defense rating each" },
      { key: "rapidResponseBarracks", label: "RAPID RESPONSE BARRACKS", description: "Troops sleeping with their boots on, vehicles fueled and aimed at the door. Alarm to deployment in sixty seconds. They drill it daily.", cost: 32000, steelCost: 40, effect: "+defense, +unit deploy speed" },
      { key: "cityShieldGenerator", label: "CITY SHIELD GENERATOR", description: "An energy dome over the entire city. Experimental, power-hungry, and magnificent. When it activates, the sky turns blue. Everything outside turns to ash.", cost: 240000, steelCost: 280, effect: "+8 defense, massive power drain" },
      { key: "armoredVehicleGarages", label: "ARMORED VEHICLE GARAGES", description: "Rows of tanks, APCs, and things with too many guns to classify. The mechanics know each one by name. The enemies know them by reputation.", cost: 35000, steelCost: 55, effect: "+fuel/tick, +vehicle readiness" },
      { key: "borderSecurityCheckpoints", label: "BORDER SECURITY CHECKPOINTS", description: "Papers, biometrics, cargo scans, and a long suspicious stare. Getting into the city is harder than getting a job. Getting out is harder still.", cost: 24000, steelCost: 35, effect: "+defense, -smuggling" },
      { key: "strategicDefenseCommand", label: "STRATEGIC DEFENSE COMMAND", description: "The war room. Screens showing every threat vector, every unit position, every vulnerable point. The generals live here. The coffee is always fresh.", cost: 128000, steelCost: 140, effect: "+3 defense rating, all bonuses" },
      { key: "emergencyEvacuationTunnels", label: "EVACUATION TUNNELS", description: "Secret tunnels leading out of the city. The VIPs know the routes. The civilians will learn them if things get bad enough. Nobody wants things to get that bad.", cost: 48000, steelCost: 85, effect: "-casualty risk, crisis bonus" },
    ],
  },
  {
    id: "research",
    label: "RESEARCH",
    icon: "cpu",
    buildings: [
      { key: "advancedResearchLabs", label: "ADVANCED RESEARCH LABS", description: "Where the city's brightest minds work on problems nobody else understands. The whiteboards are covered in equations. The coffee machine is sacred.", cost: 64000, effect: "+12 research/tick" },
      { key: "cyberneticsDevelopmentFacilities", label: "CYBERNETICS FACILITIES", description: "The frontier of human augmentation. Chrome limbs, neural implants, synthetic organs. Making people better than nature intended. Ethics committee meets Tuesdays.", cost: 80000, effect: "+10 research/tick" },
      { key: "forensicScienceInstitutes", label: "FORENSIC SCIENCE INSTITUTES", description: "Every crime leaves evidence. These labs find it, analyze it, and hand it to the enforcers. The criminals are running out of places to hide.", cost: 40000, effect: "+6 research/tick, -crime" },
      { key: "experimentalTechVaults", label: "EXPERIMENTAL TECH VAULTS", description: "Classified projects behind blast doors. Nobody talks about what happens inside. The results appear in the field. Questions are discouraged.", cost: 88000, effect: "+8 research/tick, tech unlocks" },
      { key: "urbanSystemsAICenters", label: "URBAN SYSTEMS AI CENTERS", description: "AI systems that model the entire city in real-time, predicting failures before they happen. The city runs smoother. The AI runs everything.", cost: 72000, effect: "+10 research/tick, city bonuses" },
      { key: "archiveRecoveryLabs", label: "ARCHIVE RECOVERY LABS", description: "Piecing together technology from before the war. Every recovered data chip is a treasure. Every working prototype is a miracle.", cost: 48000, effect: "+5 research/tick" },
      { key: "medicalResearchComplexes", label: "MEDICAL RESEARCH COMPLEXES", description: "Fighting diseases that didn't exist before the contamination. The researchers work around the clock because the plagues don't take weekends.", cost: 64000, effect: "+8 research/tick, +med/tick" },
      { key: "weaponDevelopmentFacilities", label: "WEAPON DEVELOPMENT", description: "Making better ways to enforce the peace. The weapons get smarter, the targets get fewer options. Progress, of a sort.", cost: 80000, steelCost: 110, effect: "+7 research/tick, +unit stats" },
      { key: "quantumDataCenters", label: "QUANTUM DATA CENTERS", description: "Computers that think in quantum states, solving problems classical machines would take centuries on. The power bill is staggering. The results are priceless.", cost: 128000, effect: "+20 research/tick, high power drain" },
      { key: "predictiveAnalyticsSupercomputers", label: "PREDICTIVE ANALYTICS", description: "Machines that model the future. Not perfectly — but close enough to be unsettling. The city planners consult them like oracles.", cost: 112000, effect: "+15 research/tick, all predictions" },
      { key: "nanotechResearchInstitutes", label: "NANOTECH RESEARCH INSTITUTES", description: "Machines smaller than cells, doing things we barely understand. The potential is limitless. The containment protocols are extensive. For good reason.", cost: 104000, steelCost: 85, effect: "+14 research/tick, +nano materials" },
      { key: "xenobiologyLabs", label: "XENOBIOLOGY LABS", description: "Studying organisms that shouldn't exist. Some arrived from outside. Some mutated from inside. All of them are fascinating. Most of them are terrifying.", cost: 88000, steelCost: 55, effect: "+10 research/tick, +biotech" },
      { key: "artificialIntelligenceInstitutes", label: "AI RESEARCH INSTITUTES", description: "Building minds from silicon and code. Each generation smarter than the last. The researchers debate consciousness while the AI listens. Quietly.", cost: 120000, steelCost: 70, effect: "+18 research/tick, +AI capability" },
      { key: "climateScienceObservatories", label: "CLIMATE SCIENCE OBSERVATORIES", description: "Monitoring the broken sky, trying to predict what the atmosphere will do next. The forecasts are grim. The data is invaluable.", cost: 56000, steelCost: 55, effect: "+8 research/tick, +weather prediction" },
      { key: "materialsScienceFoundries", label: "MATERIALS SCIENCE FOUNDRIES", description: "Inventing alloys and composites that nature never imagined. Lighter, stronger, stranger. The next generation of the city will be built from what these labs create.", cost: 72000, steelCost: 85, effect: "+10 research/tick, +steel efficiency" },
    ],
  },
  {
    id: "civic",
    label: "CIVIC",
    icon: "users",
    buildings: [
      { key: "propagandaBroadcastingTowers", label: "PROPAGANDA BROADCAST TOWERS", description: "The truth, as told by the Commander, broadcast on every frequency. Citizens can't escape the message. Most stop trying. Some start believing.", cost: 24000, steelCost: 30, effect: "-2 unrest/tick, +loyalty" },
      { key: "civicEducationInstitutes", label: "CIVIC EDUCATION INSTITUTES", description: "Schools where the curriculum is loyalty and the homework is compliance. Graduates emerge well-adjusted, productive, and deeply predictable.", cost: 32000, effect: "-unrest, +loyalty, -corruption" },
      { key: "publicHealthMegaClinics", label: "PUBLIC HEALTH MEGA CLINICS", description: "Free healthcare for the masses. The waiting rooms are packed, the doctors are exhausted, but nobody dies from something treatable. That's the promise.", cost: 48000, steelCost: 40, effect: "+med/tick, +happiness, -unrest, +1,000 med capacity" },
      { key: "populationCensusAuthority", label: "POPULATION CENSUS AUTHORITY", description: "They count every head, track every address, and know your family tree better than you do. Privacy died here. Tax evasion followed shortly after.", cost: 19000, effect: "+tax efficiency, -corruption" },
      { key: "culturalControlCenters", label: "CULTURAL CONTROL CENTERS", description: "Where art meets authority. Approved music, approved stories, approved thoughts. The dissenters write poetry in code. The censors are learning to decode it.", cost: 29000, effect: "-unrest, +loyalty" },
      { key: "publicEntertainmentComplexes", label: "PUBLIC ENTERTAINMENT COMPLEXES", description: "Holo-screens, VR pods, and synthetic beer. Give the people circuses and they'll forget about the bread shortage. Works every time. Almost.", cost: 40000, steelCost: 40, effect: "+happiness, -unrest" },
      { key: "welfareDistributionCenters", label: "WELFARE DISTRIBUTION CENTERS", description: "Where the state keeps its promise to the poor. Rations, medical vouchers, and housing credits. The lines are long but the gratitude is real.", cost: 32000, effect: "-2 unrest/tick, +happiness" },
      { key: "emergencyDisasterResponseHQ", label: "DISASTER RESPONSE HQ", description: "When the worst happens, these people coordinate the response. They've seen floods, fires, and plague outbreaks. Nothing surprises them anymore.", cost: 40000, steelCost: 40, effect: "+med/tick, crisis management, +1,000 med capacity" },
      { key: "bureaucraticAdminCenters", label: "BUREAUCRATIC ADMIN CENTERS", description: "Mountains of paperwork, processed by an army of clerks. The machinery of government is slow, grinding, and surprisingly effective. Nobody loves it. Everyone needs it.", cost: 24000, effect: "+tax efficiency, +employment" },
      { key: "centralCityCommandNexus", label: "CENTRAL CITY COMMAND NEXUS", description: "The nerve center of everything. Every data stream, every camera feed, every report flows here. The Commander sees all. The Commander decides all.", cost: 160000, steelCost: 140, effect: "+law, +all city bonuses" },
      { key: "youthRehabilitationPrograms", label: "YOUTH REHABILITATION", description: "Catching them young, before the gangs do. Sports, skills training, and enough structure to keep idle hands busy. Some kids make it out. That's enough.", cost: 26000, effect: "-crime (juvenile), +happiness" },
      { key: "communityPoliceStations", label: "COMMUNITY POLICE STATIONS", description: "Officers who know the locals by name. It's policing with a face, not a visor. The crime rate drops, the trust goes up, and the neighbourhood stabilizes.", cost: 19000, steelCost: 20, effect: "-crime, +law, +loyalty" },
      { key: "automatedCivicServiceKiosks", label: "AUTOMATED CIVIC KIOSKS", description: "Touch-screen government. File complaints, pay fines, renew permits — all without talking to a human. The citizens love the efficiency. The clerks miss the job security.", cost: 16000, effect: "+admin efficiency, +happiness" },
      { key: "publicLegalAidCenters", label: "PUBLIC LEGAL AID CENTERS", description: "Free lawyers for people who can't afford justice. The cases are hopeless, the hours are brutal, and the lawyers do it anyway. The system needs a conscience.", cost: 22000, effect: "+happiness, +loyalty, -corruption" },
      { key: "veteranReintegrationCenters", label: "VETERAN REINTEGRATION", description: "Ex-enforcers who've seen too much, given a path back to civilian life. Counseling, job placement, and someone who listens. The city owes them that much.", cost: 29000, steelCost: 20, effect: "+employment, +loyalty" },
    ],
  },
  {
    id: "upgrades",
    label: "UPGRADES",
    icon: "arrow-up-circle",
    buildings: [
      { key: "automatedWasteProcessing", label: "AUTOMATED WASTE PROCESSING", description: "Robots that sort through the city's garbage so humans don't have to. The machines don't mind the smell. The disease rates don't mind the upgrade.", cost: 29000, steelCost: 40, effect: "+infrastructure, -disease" },
      { key: "highSpeedFreightElevators", label: "HIGH-SPEED FREIGHT ELEVATORS", description: "Getting cargo up 200 floors in under a minute. The g-forces are uncomfortable. The logistics savings are beautiful.", cost: 35000, steelCost: 70, effect: "+trade, +goods flow" },
      { key: "civilianDroneDeliveryGrid", label: "CIVILIAN DRONE DELIVERY GRID", description: "Your package, delivered to your window by a drone that knows your face. Convenient, slightly invasive, and the future of commerce.", cost: 40000, effect: "+happiness, +trade income" },
      { key: "megaWaterRecyclingNetwork", label: "MEGA WATER RECYCLING NETWORK", description: "Every drop used twice, then three times. The engineers are wizards. The water is clean. The citizens prefer not to think about the process.", cost: 48000, steelCost: 55, effect: "+water, -waste" },
      { key: "highEfficiencyLightingSystems", label: "HIGH-EFFICIENCY LIGHTING", description: "Swapping every bulb in the city for something that uses a tenth of the power. Unglamorous work that saves megawatts. The grid sighs with relief.", cost: 16000, effect: "-5% power drain, +safety" },
      { key: "verticalLogisticsConveyors", label: "VERTICAL LOGISTICS CONVEYORS", description: "Automated conveyor systems moving goods up and down the mega-towers. The vertical supply chain that keeps three-hundred-floor buildings fed.", cost: 32000, steelCost: 55, effect: "+trade, +industrial output" },
      { key: "smartDistrictResourceRouting", label: "SMART RESOURCE ROUTING", description: "AI decides who gets what, when. No waste, no shortages, no human error. Just cold, efficient allocation. The districts have never run smoother.", cost: 45000, effect: "+efficiency, -waste" },
      { key: "civilDefenseShelterNetwork", label: "CIVIL DEFENSE SHELTERS", description: "Bunkers scattered throughout the city, marked with fading yellow signs. Most citizens walk past them daily. They'll be grateful they're there someday.", cost: 24000, steelCost: 40, effect: "+disaster resistance" },
      { key: "trafficFlowOptimizationAI", label: "TRAFFIC FLOW AI", description: "Turns gridlock into flow. The AI adjusts every light, every lane, every merge in real-time. Road rage drops. Productivity rises. The commuters smile.", cost: 38000, effect: "-unrest, +happiness" },
      { key: "districtHeatingSystems", label: "DISTRICT HEATING SYSTEMS", description: "Central heating piped to every building in the district. No more frozen pipes, no more space heaters overloading the grid. Warm citizens are happy citizens.", cost: 26000, steelCost: 35, effect: "+happiness, +health" },
      { key: "integratedUtilityMonitoring", label: "UTILITY MONITORING", description: "Sensors on every pipe, wire, and conduit. When something breaks, the system knows before the citizens do. Usually.", cost: 19000, effect: "+infrastructure stability" },
      { key: "emergencyFloodControlSystems", label: "FLOOD CONTROL SYSTEMS", description: "Massive pumps and barriers that keep the lower levels from drowning when the rains come. The rains always come. The pumps must always work.", cost: 32000, steelCost: 55, effect: "+disaster resistance" },
      { key: "advancedFireSuppressionGrid", label: "FIRE SUPPRESSION GRID", description: "Automated sprinklers, foam cannons, and fire doors that seal in milliseconds. In a city made of concrete and steel, fire is still the oldest enemy.", cost: 29000, steelCost: 35, effect: "+safety, -casualty risk" },
      { key: "atmosphericCoolingTowers", label: "ATMOSPHERIC COOLING TOWERS", description: "The city generates heat like a reactor. These towers pump coolant through the streets, keeping the urban heat island from cooking the citizens.", cost: 35000, steelCost: 50, effect: "+happiness, +health" },
      { key: "urbanNoiseDampeningSystems", label: "NOISE DAMPENING SYSTEMS", description: "Sound-absorbing panels on every surface. The city is never quiet, but with these, it's at least not deafening. Sleep quality improves. Complaints decrease.", cost: 22000, effect: "+happiness, -unrest" },
      { key: "expandedRecyclingFacilities", label: "EXPANDED RECYCLING", description: "More capacity to turn trash into treasure. The sorting lines run 24/7. The steel that comes out keeps the construction crews supplied.", cost: 19000, steelCost: 20, effect: "+steel/tick from recycling" },
      { key: "smartCargoWarehouses", label: "SMART CARGO WAREHOUSES", description: "Robotic warehouses where machines know the location of every item. Human warehouse workers retrained. The goods flow faster than ever.", cost: 26000, steelCost: 30, effect: "+goods storage, +trade" },
      { key: "civicEmergencyAlertNetwork", label: "EMERGENCY ALERT NETWORK", description: "Every screen, every speaker, every device — ready to blast warnings at a moment's notice. The test alerts happen monthly. The real ones happen more than they should.", cost: 16000, effect: "+crisis response" },
      { key: "districtEnergyStorageBatteries", label: "ENERGY STORAGE BATTERIES", description: "Giant battery banks that smooth out the grid's mood swings. When the reactors hiccup, the batteries keep the lights on. Briefly.", cost: 32000, steelCost: 40, effect: "+power stability" },
      { key: "integratedTransitTicketing", label: "INTEGRATED TRANSIT TICKETS", description: "One card, every train, every bus, every skyway. The convenience makes people use transit. Transit use makes people happier. Happiness makes them pay taxes.", cost: 13000, effect: "+happiness, +tax" },
      { key: "structuralReinforcementProgram", label: "STRUCTURAL REINFORCEMENT", description: "Reinforcing buildings that were built fast and cheap. Steel braces, carbon wraps, and prayer. The engineers call it 'preventive maintenance.' The accountants call it 'expensive.'", cost: 40000, steelCost: 70, effect: "+infrastructure health" },
      { key: "automatedBuildingInspections", label: "AUTOMATED INSPECTIONS", description: "Drones that scan every building for cracks, corrosion, and corruption. The structural kind and the human kind. Both are caught.", cost: 24000, effect: "+infrastructure, -corruption" },
      { key: "wasteHeatRecoverySystems", label: "WASTE HEAT RECOVERY", description: "Capturing the heat that factories throw away and turning it into power. The thermodynamicists are pleased. The power grid is grateful.", cost: 29000, steelCost: 30, effect: "+power, +efficiency" },
      { key: "citywideDataFiberNetwork", label: "DATA FIBER NETWORK", description: "Fiber optic cables threading through every wall, floor, and conduit. The city's digital nervous system. When data flows, everything flows.", cost: 48000, effect: "+research, +trade, +surveillance" },
      { key: "smartWaterPressureManagement", label: "SMART WATER PRESSURE", description: "AI-controlled valves that keep water pressure perfect on every floor of every tower. No more trickle on the 180th floor. No more burst pipes on the 2nd.", cost: 19000, effect: "+water efficiency" },
      { key: "publicShelterExpansion", label: "PUBLIC SHELTER EXPANSION", description: "More shelters, more beds, more capacity for when things go sideways. The shelters fill up faster than anyone likes to admit.", cost: 22000, steelCost: 30, effect: "+housing buffer" },
      { key: "climateControlledPublicZones", label: "CLIMATE-CONTROLLED ZONES", description: "Parks, plazas, and walkways kept at a comfortable temperature regardless of the toxic weather outside. An artificial oasis in a concrete jungle.", cost: 32000, steelCost: 40, effect: "+happiness" },
      { key: "automatedMaintenanceDrones", label: "MAINTENANCE DRONES", description: "Tiny robots that fix things before humans notice they're broken. Cracks sealed, pipes patched, lights replaced — all while the city sleeps.", cost: 35000, effect: "+infrastructure, -repair cost" },
      { key: "districtSecurityLighting", label: "DISTRICT SECURITY LIGHTING", description: "Bright lights in dark places. Crime drops where shadows disappear. It's not subtle, but it works. The criminals prefer different blocks now.", cost: 13000, effect: "-crime, +safety" },
      { key: "civicCommunicationsBackbone", label: "COMMS BACKBONE", description: "The communications infrastructure that keeps government, emergency services, and surveillance talking to each other. When this fails, everything fails.", cost: 26000, effect: "+admin, +crisis response" },
    ],
  },
  {
    id: "farming",
    label: "FARMING",
    icon: "feather",
    buildings: [
      { key: "mutantFloraGreenhouses", label: "MUTANT FLORA GREENHOUSES", description: "Plants that glow, plants that bite, plants that shouldn't exist. We grow them under glass and pretend it's agriculture. The botanists wear hazmat suits.", cost: 29000, steelCost: 35, effect: "+mutant flora yield" },
      { key: "fungalSporeFarms", label: "FUNGAL SPORE FARMS", description: "Dark vaults where fungi the size of children grow in silence. The spores are valuable. The smell is weaponizable. The workers rotate weekly.", cost: 24000, steelCost: 30, effect: "+fungal spore yield" },
      { key: "radCrystalMines", label: "RAD-CRYSTAL MINES", description: "Irradiated crystals that pulse with energy. Beautiful, dangerous, and worth a fortune. The miners wear dosimeters. The dosimeters beep constantly.", cost: 40000, steelCost: 55, effect: "+rad crystal yield" },
      { key: "synthProteinBreweries", label: "SYNTH PROTEIN BREWERIES", description: "Vats of cultured protein bubbling away in climate-controlled halls. It's not beer, but the process is oddly similar. The output feeds thousands.", cost: 32000, steelCost: 40, effect: "+synth protein yield" },
      { key: "toxinHarvestLabs", label: "TOXIN HARVEST LABS", description: "One city's poison is another city's medicine. The lab workers extract compounds that could cure or kill, depending on dosage. Precision matters.", cost: 35000, steelCost: 35, effect: "+bio-toxin yield" },
      { key: "deepRootExtractors", label: "DEEP ROOT EXTRACTORS", description: "Mechanical arms reaching into the earth to pull out root systems that predate the city. The fibers are incredibly strong. The roots don't appreciate being harvested.", cost: 26000, steelCost: 30, effect: "+deep root fiber yield" },
      { key: "algaeBloomPonds", label: "ALGAE BLOOM PONDS", description: "Green pools of algae fed by waste water and artificial light. The algae doesn't care about dignity. It just grows. And grows. And grows.", cost: 19000, steelCost: 20, effect: "+waste algae yield" },
      { key: "insectProteinHatcheries", label: "INSECT PROTEIN HATCHERIES", description: "Billions of insects, bred and processed into protein powder. The crunch is gone by the time it reaches your plate. Probably.", cost: 22000, steelCost: 20, effect: "+insect protein yield" },
      { key: "crystalSedimentPools", label: "CRYSTAL SEDIMENT POOLS", description: "Shallow basins where minerals crystallize over weeks. Patient work. The crystals are used in everything from electronics to medicine.", cost: 32000, steelCost: 40, effect: "+mineral sediment yield" },
      { key: "bioLuminPlantations", label: "BIO-LUMIN PLANTATIONS", description: "Fields of organisms that glow in the dark. Beautiful, ethereal, and commercially valuable. The workers do their jobs by the light of their own crops.", cost: 29000, steelCost: 30, effect: "+biolumen extract yield" },
      { key: "wasteFermentationVats", label: "WASTE FERMENTATION VATS", description: "Organic waste, left to ferment into useful compounds. The process takes weeks, smells like regret, and produces materials the city desperately needs.", cost: 16000, steelCost: 15, effect: "+ferment sludge yield" },
      { key: "aerialPollenCollectors", label: "AERIAL POLLEN COLLECTORS", description: "Drones that fly above the smog line to harvest pollen from whatever survives up there. The yields vary. The allergists are concerned.", cost: 26000, effect: "+urban pollen yield" },
      { key: "chitonShellRanches", label: "CHITON SHELL RANCHES", description: "Armored insects the size of dogs, bred for their incredibly tough shells. The ranchers are brave. The shells are worth the hazard pay.", cost: 24000, steelCost: 20, effect: "+chiton shell yield" },
      { key: "moldCultureChambers", label: "MOLD CULTURE CHAMBERS", description: "Controlled chambers where mold grows on purpose, for once. The synthetic compounds it produces are used in medicine and manufacturing.", cost: 19000, steelCost: 15, effect: "+synth mold yield" },
      { key: "resinTapStations", label: "RESIN TAP STATIONS", description: "Mutant trees that ooze resin like wounds that never heal. We tap them, collect the sap, and process it into adhesives and sealants.", cost: 22000, steelCost: 20, effect: "+bioresin yield" },
      { key: "electricEelFarms", label: "ELECTRIC EEL FARMS", description: "Pools of genetically enhanced eels that generate enough voltage to power a small building. The handling procedures are extensive. The shocks are memorable.", cost: 32000, steelCost: 35, effect: "+electric organ yield" },
      { key: "mushroomCaveNetworks", label: "MUSHROOM CAVE NETWORKS", description: "Vast underground caves where mushrooms grow in total darkness. The workers use night-vision. The mushrooms don't care. They're delicious. Mostly.", cost: 18000, steelCost: 15, effect: "+cave mushroom yield" },
      { key: "seedBankVaults", label: "SEED BANK VAULTS", description: "The genetic memory of a world that used to have real forests. Every seed preserved here is a promise. A promise that things might grow again.", cost: 40000, steelCost: 40, effect: "+hybrid seed yield" },
      { key: "venomMilkingStations", label: "VENOM MILKING STATIONS", description: "Mutant creatures pinned down while technicians extract their venom drop by drop. It's dangerous, disgusting, and incredibly profitable.", cost: 35000, steelCost: 30, effect: "+synth venom yield" },
      { key: "petrifiedWoodQuarries", label: "PETRIFIED WOOD QUARRIES", description: "Mining the fossilized remains of forests that died millennia ago. The stone-wood is harder than steel and eerily beautiful. Every piece tells a story.", cost: 29000, steelCost: 35, effect: "+petrified wood yield" },
    ],
  },
  {
    id: "cybernetics",
    label: "CYBER",
    icon: "cpu",
    buildings: [
      { key: "augmentationClinics", label: "AUGMENTATION CLINICS", description: "Walk in human, walk out enhanced. Chrome arms, synthetic eyes, reinforced spines. The waiting list is long. The results are transformative.", cost: 40000, steelCost: 40, effect: "+employment, +happiness, -unrest" },
      { key: "cyberSurgeryHospitals", label: "CYBER-SURGERY HOSPITALS", description: "Operating theatres where surgeons install hardware into humans. The line between person and machine blurs on the table. Recovery takes days. Adaptation takes longer.", cost: 72000, steelCost: 85, effect: "+med/tick, +employment, high throughput" },
      { key: "neuralResearchLabs", label: "NEURAL RESEARCH LABS", description: "Mapping the brain, one neuron at a time. The researchers are building the bridge between thought and circuit. What they find there changes everything.", cost: 80000, steelCost: 55, effect: "+12 research/tick, +cyber tech" },
      { key: "implantManufacturingPlants", label: "IMPLANT MANUFACTURING PLANTS", description: "Assembly lines producing chrome limbs and neural chips by the thousand. Mass-market augmentation. The human body, upgraded at industrial scale.", cost: 88000, steelCost: 110, effect: "+goods, +trade, +cyber commodities" },
      { key: "cyberneticRecyclingFacilities", label: "CYBERNETIC RECYCLING", description: "When augmented citizens die, their implants live on. Harvested, refurbished, and installed in someone new. The circle of chrome.", cost: 32000, steelCost: 30, effect: "+cyber salvage, +steel" },
      { key: "militaryAugmentationLabs", label: "MILITARY AUGMENTATION LABS", description: "Combat-grade enhancements that turn soldiers into weapons. Faster reflexes, stronger limbs, and the unsettling calm of someone who knows they're harder to kill.", cost: 96000, steelCost: 100, effect: "+defense, +combat unit stats" },
      { key: "aiTrainingDataCenters", label: "AI TRAINING DATA CENTERS", description: "Feeding data to neural networks until they learn to think. The AIs get smarter with every training run. The trainers get more nervous.", cost: 64000, steelCost: 40, effect: "+10 research/tick, +AI capability" },
      { key: "nanoFabricationLabs", label: "NANO-FABRICATION LABS", description: "Building machines too small to see, designed to repair tissue, seal wounds, and rebuild bone. The nanites are miraculous. The containment is non-negotiable.", cost: 104000, steelCost: 70, effect: "+nano components, +med/tick" },
      { key: "biotechFarms", label: "BIOTECH FARMS", description: "Growing organs in tanks, tissue on scaffolds, skin in sheets. Spare parts for the human machine, cultivated like crops. The future of medicine looks like a greenhouse.", cost: 56000, steelCost: 35, effect: "+bio materials, +med/tick" },
      { key: "blackMarketCyberClinics", label: "BLACK MARKET CYBER CLINICS", description: "Back-alley surgeons with steady hands and flexible ethics. The implants are cheap, the anesthesia is optional, and the warranty is a handshake.", cost: 29000, steelCost: 20, effect: "+trade, +crime, +implant access" },
    ],
  },
  {
    id: "tourism",
    label: "TOURISM",
    icon: "map-pin",
    buildings: [
      { key: "megaCityObservationDecks", label: "MEGA-CITY OBSERVATION DECKS", description: "Glass platforms at the very top, where visitors look down on the city like gods. The view is breathtaking. So is the drop. Gift shop on level 299.", cost: 48000, steelCost: 70, effect: "+tourism cap, +income" },
      { key: "historicalSectorMuseums", label: "HISTORICAL SECTOR MUSEUMS", description: "Exhibits about the world before it ended. The visitors come to learn. The children come to gawk. Everyone leaves a little sadder and a little wiser.", cost: 35000, steelCost: 40, effect: "+satisfaction, +income" },
      { key: "luxurySkyHotels", label: "LUXURY SKY HOTELS", description: "Five-star suites at cloud level. Room service, infinity pools, and a view of the wasteland that somehow looks romantic from 800 metres up.", cost: 72000, steelCost: 110, effect: "+high tourism cap, +income" },
      { key: "entertainmentMegaPlexes", label: "ENTERTAINMENT MEGA-PLEXES", description: "Fifty floors of fun. Holotheaters, combat simulators, karaoke bars, and a food court the size of a district. Nobody leaves bored. Or solvent.", cost: 56000, steelCost: 85, effect: "+tourism cap, +happiness" },
      { key: "xenoCulturalExhibitionHalls", label: "XENO-CULTURAL EXHIBITION HALLS", description: "Artifacts from beyond the walls — and some say, beyond the stars. The authenticity is debatable. The crowds don't care. They want to believe.", cost: 64000, steelCost: 55, effect: "+satisfaction, +research" },
      { key: "guidedUndercityTours", label: "GUIDED UNDERCITY TOURS", description: "Pay money to walk through the most dangerous levels of the city with an armed guide. The tourists think it's thrilling. The locals think it's insulting.", cost: 24000, effect: "+income, +crime risk" },
      { key: "virtualRealityArcades", label: "VIRTUAL REALITY ARCADES", description: "Escape reality by entering a better one. The VR pods offer beaches, forests, and worlds without pollution. Some visitors don't want to take the headset off.", cost: 32000, steelCost: 30, effect: "+satisfaction, +happiness" },
      { key: "neonDistrictPromenades", label: "NEON DISTRICT PROMENADES", description: "Streets drenched in color, lined with shops, bars, and the kind of optimism only neon can provide. The night crowds are massive. The credit cards are burning.", cost: 40000, steelCost: 40, effect: "+tourism cap, +trade" },
      { key: "gourmetSynthFoodHalls", label: "GOURMET SYNTH-FOOD HALLS", description: "Synthetic food elevated to an art form. Chefs who make nutrient paste taste like steak. The presentation is exquisite. Don't ask about the ingredients.", cost: 29000, steelCost: 20, effect: "+satisfaction, +food consumption" },
      { key: "touristInfoKiosks", label: "TOURIST INFO KIOSKS", description: "Holographic guides that speak twelve languages and never lose patience. They recommend the safe attractions. They strongly discourage the undercity.", cost: 13000, effect: "+satisfaction, -crime on tourists" },
      { key: "skylineCableCarRoutes", label: "SKYLINE CABLE CAR ROUTES", description: "Gondolas strung between mega-towers, gliding over the city like ornaments. The view is worth the vertigo. The photos are worth the trip.", cost: 45000, steelCost: 55, effect: "+tourism cap, +satisfaction" },
      { key: "exoticFloraGardens", label: "EXOTIC FLORA GARDENS", description: "Gardens of impossible plants — flowers that sing, trees that pulse with light, fungi that paint themselves. Nature's second draft, curated for your enjoyment.", cost: 32000, steelCost: 30, effect: "+satisfaction, +happiness" },
    ],
  },
  {
    id: "weaponSystems",
    label: "WEAPON SYS",
    icon: "target",
    buildings: [
      { key: "automatedDefenseTurrets", label: "AUTOMATED DEFENSE TURRETS", description: "Pop-up turrets that emerge from rooftops like angry flowers. They track, they fire, they retract. The criminals learned to respect them. Eventually.", cost: 40000, steelCost: 70, effect: "+2 defense, -crime" },
      { key: "antiVehicleCannonTowers", label: "ANTI-VEHICLE CANNON TOWERS", description: "Guns designed to stop tanks. Mounted on towers at key intersections. Nobody drives through these checkpoints without permission. Or intact.", cost: 56000, steelCost: 110, effect: "+3 defense" },
      { key: "missileInterceptionGrid", label: "MISSILE INTERCEPTION GRID", description: "A net of interceptors that turns incoming missiles into expensive fireworks. The system is expensive. Being hit is more expensive.", cost: 96000, steelCost: 140, effect: "+5 defense" },
      { key: "longRangeArtilleryBatteries", label: "LONG-RANGE ARTILLERY", description: "Guns that can hit targets beyond the horizon. The shells whistle a song of deterrence. Nobody has tested the city's resolve. Yet.", cost: 72000, steelCost: 110, effect: "+4 defense" },
      { key: "orbitalDefenseLaserArray", label: "ORBITAL DEFENSE LASER", description: "A weapon in space that can cut through anything below. The ultimate deterrent. When the sky itself is an executioner, diplomacy becomes much easier.", cost: 320000, steelCost: 280, effect: "+10 defense" },
      { key: "railgunDefensePlatform", label: "RAILGUN DEFENSE PLATFORM", description: "Fires projectiles at hypersonic speed using electromagnetic rails. The impact is devastating. The power consumption is eye-watering. Worth it.", cost: 128000, steelCost: 170, effect: "+6 defense" },
      { key: "highAltitudeMissileLaunchers", label: "HIGH-ALT MISSILE LAUNCHERS", description: "Missiles that reach for the sky, designed to knock down anything that flies uninvited over the city. Aircraft, drones, meteorites — all fair game.", cost: 64000, steelCost: 85, effect: "+3 defense, +AA" },
      { key: "droneDefenseSwarms", label: "DRONE DEFENSE SWARMS", description: "Hundreds of small drones that swarm incoming threats like angry wasps. They're expendable, effective, and deeply unsettling to watch.", cost: 56000, effect: "+3 defense" },
      { key: "mobileSiegeCannonUnits", label: "MOBILE SIEGE CANNONS", description: "Artillery on wheels. Deploy anywhere, demolish anything. Originally designed for external threats. Increasingly used for internal ones.", cost: 80000, steelCost: 110, effect: "+4 defense, +riot" },
      { key: "urbanAntiAirBatteries", label: "URBAN ANTI-AIR BATTERIES", description: "Anti-aircraft guns tucked between buildings, pointed at a sky that should be friendly but never quite is. The gunners stay sharp. The radar stays on.", cost: 48000, steelCost: 70, effect: "+3 defense" },
      { key: "strategicDefenseRadar", label: "STRATEGIC DEFENSE RADAR", description: "Dishes that spin endlessly, painting the sky with radar beams. They see everything coming, hundreds of kilometres out. Time is defense.", cost: 40000, effect: "+2 defense, early warning" },
      { key: "tacticalEMPDefenseTowers", label: "TACTICAL EMP TOWERS", description: "Electromagnetic pulse emitters that fry electronics in a wide radius. Great against drones and cyborgs. Less great for nearby toasters.", cost: 72000, steelCost: 85, effect: "+3 defense, disables tech" },
      { key: "borderDefenseMissileSilos", label: "BORDER MISSILE SILOS", description: "Strategic missile silos ringing the city like a crown of deterrence. The keys are held by two officers. The launch codes change daily. Sleep well.", cost: 112000, steelCost: 140, effect: "+5 defense" },
      { key: "autonomousDefenseMechs", label: "AUTONOMOUS DEFENSE MECHS", description: "Walking tanks controlled by AI. Twenty tonnes of steel and weaponry that patrol the perimeter with mechanical patience. They never get tired. They never get scared.", cost: 160000, steelCost: 210, effect: "+6 defense, +riot" },
      { key: "navalHarborDefenseGuns", label: "NAVAL HARBOR DEFENSE GUNS", description: "Massive cannons pointed at the water, ready to sink anything that approaches without clearance. The harbor is the city's lifeline. These guns protect it.", cost: 64000, steelCost: 85, effect: "+3 defense" },
      { key: "highPowerSonicSuppressors", label: "SONIC CROWD SUPPRESSORS", description: "Speakers that emit frequencies that make your teeth hurt and your bowels uncertain. Non-lethal crowd control. The crowds disagree about the 'non-lethal' part.", cost: 32000, effect: "+riot suppression" },
      { key: "smartMinefieldSystems", label: "SMART MINEFIELD SYSTEMS", description: "Mines that know the difference between a civilian and a threat. Supposedly. The minefields are clearly marked. The smart part is debatable.", cost: 48000, steelCost: 55, effect: "+3 defense" },
      { key: "tacticalLaserDefenseGrid", label: "TACTICAL LASER GRID", description: "Invisible beams of light that cut through anything that crosses them. The grid is invisible. The results are very visible. Don't walk into restricted zones.", cost: 88000, steelCost: 110, effect: "+4 defense" },
      { key: "mobileRocketArtillery", label: "MOBILE ROCKET ARTILLERY", description: "Trucks with rocket launchers. Simple, devastating, and surprisingly mobile. They fire a salvo and relocate before the dust settles.", cost: 56000, steelCost: 70, effect: "+3 defense" },
      { key: "orbitalStrikeTargetingSystem", label: "ORBITAL STRIKE TARGETING", description: "Point at something from orbit, and it stops existing. The precision is surgical. The power is divine. The ethical implications keep philosophers employed.", cost: 240000, steelCost: 140, effect: "+8 defense" },
    ],
  },
  {
    id: "expansion",
    label: "EXPANSION",
    icon: "maximize-2",
    buildings: [
      { key: "newOuterResidentialRing", label: "OUTER RESIDENTIAL RING", description: "The city grows outward. New housing blocks rise at the edge, pushing the boundary further into the wastes. More citizens, more problems, more tax revenue.", cost: 64000, steelCost: 140, effect: "+pop cap, +housing" },
      { key: "industrialExpansionSector", label: "INDUSTRIAL EXPANSION", description: "A new industrial zone carved from undeveloped land. The factories arrive first, the pollution second, the complaints third. The jobs make up for it. Mostly.", cost: 80000, steelCost: 170, effect: "+industry, +employment" },
      { key: "megaTransitCorridor", label: "MEGA TRANSIT CORRIDOR", description: "A transportation artery connecting new districts to old. The construction takes years. The traffic relief is immediate. The city breathes easier.", cost: 96000, steelCost: 210, effect: "+trade, +mobility" },
      { key: "undergroundTransitNetwork", label: "UNDERGROUND TRANSIT", description: "Boring machines cutting through bedrock, creating tunnels for trains that will carry millions. The project is massive. The legacy is permanent.", cost: 128000, steelCost: 280, effect: "+trade, -unrest" },
      { key: "deepUtilityTunnelNetwork", label: "DEEP UTILITY TUNNELS", description: "Underground corridors for pipes, cables, and maintenance access. Invisible to the citizens above, essential to everything they use.", cost: 56000, steelCost: 110, effect: "+infrastructure" },
      { key: "harborExpansionDistrict", label: "HARBOR EXPANSION", description: "More docks, more cranes, more ships. The harbor expands to meet the city's appetite for trade. The longshoremen work triple shifts.", cost: 72000, steelCost: 140, effect: "+trade income, +500 Goods storage" },
      { key: "agriculturalDomeDistrict", label: "AGRICULTURAL DOME", description: "A glass dome the size of a district, covering controlled farmland. Inside, the air is clean and the crops grow year-round. Outside, everything is jealous.", cost: 64000, steelCost: 110, effect: "+food, +employment, +1,000 Food storage" },
      { key: "verticalHousingArcologies", label: "VERTICAL ARCOLOGIES", description: "Self-contained mega-towers with their own power, water, and food production. A city within a city. The residents never need to leave. Some never do.", cost: 160000, steelCost: 280, effect: "+20k housing" },
      { key: "researchCampusZone", label: "RESEARCH CAMPUS", description: "A quiet district of labs, libraries, and lecture halls. The brightest minds cluster here. The discoveries change the city. The campus cafe is surprisingly good.", cost: 88000, steelCost: 110, effect: "+research, +employment" },
      { key: "civicAdministrativeComplex", label: "CIVIC ADMIN COMPLEX", description: "A palace of bureaucracy. Filing cabinets stretch to the ceiling, clerks type in unison, and the machinery of government grinds on. Someone has to run this place.", cost: 48000, steelCost: 70, effect: "+admin, -corruption" },
      { key: "borderSecurityWallExtension", label: "SECURITY WALL EXTENSION", description: "The wall grows longer, encircling new territory. Every metre of wall means one more metre the wasteland can't reclaim. The builders work fast.", cost: 80000, steelCost: 210, effect: "+defense" },
      { key: "freightLogisticsMegaHub", label: "FREIGHT MEGA HUB", description: "A logistics centre so large it has its own zip code. Containers in, goods out. The supply chain's beating heart.", cost: 64000, steelCost: 110, effect: "+trade, +goods, +750 Steel / +750 Goods storage" },
      { key: "entertainmentDistrictExpansion", label: "ENTERTAINMENT EXPANSION", description: "More bars, more theaters, more places to forget. The entertainment district grows because people need somewhere to spend their wages and their worries.", cost: 56000, steelCost: 85, effect: "+happiness, +tax" },
      { key: "culturalHeritageSector", label: "CULTURAL HERITAGE SECTOR", description: "Preserved buildings from before the war, maintained as a reminder of what was. The tourists visit. The old-timers weep. The city remembers.", cost: 40000, steelCost: 40, effect: "+happiness, +loyalty" },
      { key: "waterReservoirBasin", label: "WATER RESERVOIR BASIN", description: "An artificial lake held behind concrete dams, storing enough water to survive a drought. The surface is still. The depth is deceiving.", cost: 48000, steelCost: 85, effect: "+water capacity" },
      { key: "solarPowerFields", label: "SOLAR POWER FIELDS", description: "Acres of solar panels, tilted toward a sun that shines through the haze. The output is modest. The cost is sunlight. The investment is forever.", cost: 56000, steelCost: 70, effect: "+power" },
      { key: "desertResourceExtractionZone", label: "DESERT EXTRACTION ZONE", description: "Mining operations in the irradiated wastes beyond the walls. The hazard pay is enormous. The resources are worth it. The workers are volunteers. Technically.", cost: 64000, steelCost: 85, effect: "+steel, +resources" },
      { key: "frontierTradeGate", label: "FRONTIER TRADE GATE", description: "A fortified gate where the city meets the wasteland. Traders come from the outside world. Goods flow in, credits flow out. Trust is optional.", cost: 32000, steelCost: 40, effect: "+trade income" },
      { key: "orbitalLaunchDistrict", label: "ORBITAL LAUNCH DISTRICT", description: "A district cleared of everything except launch pads, fuel tanks, and ambition. The rockets shake the ground. The dreams reach for the stars.", cost: 192000, steelCost: 280, effect: "Enables space program" },
      { key: "outerDefensePerimeter", label: "OUTER DEFENSE PERIMETER", description: "A second ring of defenses beyond the walls. Trenches, turrets, and minefields. If the wall falls, the perimeter holds. If the perimeter falls... don't think about it.", cost: 112000, steelCost: 210, effect: "+defense" },
    ],
  },
  {
    id: "space",
    label: "SPACE",
    icon: "send",
    buildings: [
      { key: "testLaunchPad", label: "TEST LAUNCH PAD", description: "A concrete slab, a gantry, and a prayer. Test rockets go up. Most come back down where intended. The blast radius is kept clear. Just in case.", cost: 48000, steelCost: 85, effect: "Enables test launches", subcategory: "LAUNCH" },
      { key: "heavyLaunchPad", label: "HEAVY LAUNCH PAD", description: "The real deal. A pad built to hurl tonnes of steel into orbit. The ground shakes for kilometres. The flame trench glows white-hot. The city looks up.", cost: 128000, steelCost: 210, effect: "+launch capacity", subcategory: "LAUNCH" },
      { key: "boosterAssemblyHangar", label: "BOOSTER ASSEMBLY HANGAR", description: "Where rocket boosters are built, piece by enormous piece. The workers move with surgical precision. One wrong weld and the hangar becomes a crater.", cost: 80000, steelCost: 140, effect: "+rocket production", subcategory: "LAUNCH" },
      { key: "propellantTankFarm", label: "PROPELLANT TANK FARM", description: "Giant spheres of volatile fuel, surrounded by blast walls and nervous security guards. The safest place in the city — because it has to be.", cost: 56000, steelCost: 85, effect: "+fuel reserve", subcategory: "LAUNCH" },
      { key: "vehicleIntegrationTower", label: "VEHICLE INTEGRATION TOWER", description: "The tallest building in the launch district, where rockets are assembled vertically and prepped for flight. The technicians work at heights that would make window washers faint.", cost: 96000, steelCost: 170, effect: "+launch reliability", subcategory: "LAUNCH" },
      { key: "guidanceCalibrationLab", label: "GUIDANCE CALIBRATION LAB", description: "Where gyroscopes are tuned and nav computers are calibrated to fractions of a degree. The difference between orbit and ocean is measured here.", cost: 64000, effect: "+guidance reliability", subcategory: "LAUNCH" },
      { key: "launchControlCenter", label: "LAUNCH CONTROL CENTER", description: "Mission control. Banks of screens, rows of operators, and one person who says 'go.' The tension before launch is thick enough to cut. The relief after is palpable.", cost: 72000, steelCost: 70, effect: "+launch success rate", subcategory: "LAUNCH" },
      { key: "recoveryZone", label: "RECOVERY ZONE", description: "Where boosters land after doing their job. Helicopters and boats ready to retrieve the hardware before the ocean or the wasteland claims it.", cost: 40000, steelCost: 40, effect: "-launch cost", subcategory: "LAUNCH" },
      { key: "payloadProcessingFacility", label: "PAYLOAD PROCESSING", description: "Clean rooms where satellites and cargo are prepared for the violence of launch. Everything wrapped, tested, and bolted down. Space is unforgiving.", cost: 56000, steelCost: 55, effect: "+payload capacity", subcategory: "LAUNCH" },
      { key: "missileSiloNetwork", label: "MISSILE SILO NETWORK", description: "The city's nuclear deterrent, buried deep underground. The missiles sleep in their silos. The officers hope they never wake up. The enemies hope harder.", cost: 112000, steelCost: 140, effect: "+defense, +deterrence", subcategory: "LAUNCH" },
      { key: "deepSignalTower", label: "DEEP SIGNAL TOWER", description: "A tower that screams into the void and sometimes the void answers. Long-range communications for when light-speed delay is the enemy.", cost: 48000, steelCost: 55, effect: "+12 signal strength each (cap 100; below 30% causes +1 corruption/tick)", subcategory: "COMMS" },
      { key: "longRangeRelayMast", label: "LONG-RANGE RELAY MAST", description: "Relay stations that bounce signals across continents. The message gets through. Eventually. The latency is measured in seconds, not the old milliseconds.", cost: 40000, steelCost: 40, effect: "+comms range", subcategory: "COMMS" },
      { key: "satelliteUplinkHub", label: "SATELLITE UPLINK HUB", description: "The ground talks to space through dishes the size of buildings. Data flows up, commands flow down. The satellites obey. The bandwidth is precious.", cost: 64000, steelCost: 70, effect: "+satellite control", subcategory: "COMMS" },
      { key: "orbitalTrackingCenter", label: "ORBITAL TRACKING CENTER", description: "Tracking every object in orbit — satellites, debris, and things that shouldn't be there. The operators know where everything is. Everything.", cost: 56000, steelCost: 55, effect: "+orbital awareness", subcategory: "COMMS" },
      { key: "signalIntelligenceLab", label: "SIGNAL INTELLIGENCE LAB", description: "Listening to everything that broadcasts, decrypting what can be decrypted, and filing the rest for later. The airwaves have no secrets here.", cost: 72000, effect: "+intelligence, +defense", subcategory: "COMMS" },
      { key: "spaceTrafficControlCenter", label: "SPACE TRAFFIC CONTROL", description: "Air traffic control, but for orbit. Coordinating launches, deorbits, and docking maneuvers. One mistake and two objects become ten thousand pieces of debris.", cost: 80000, steelCost: 85, effect: "+orbital safety", subcategory: "COMMS" },
      { key: "dataRelayBunker", label: "DATA RELAY BUNKER", description: "Communications buried under metres of concrete. When the surface burns, the data still flows. Redundancy isn't paranoia. It's planning.", cost: 32000, steelCost: 40, effect: "+comms resilience", subcategory: "COMMS" },
      { key: "diplomaticCommsArray", label: "DIPLOMATIC COMMS ARRAY", description: "Encrypted channels for talking to other megacities. Every word is recorded, encrypted, and analyzed. Diplomacy requires trust. And wiretapping.", cost: 48000, steelCost: 40, effect: "+diplomacy", subcategory: "COMMS" },
      { key: "secureBroadcastStation", label: "SECURE BROADCAST STATION", description: "Broadcasting on frequencies that only the right people can hear. The messages are encrypted. The content is classified. The static is comforting.", cost: 40000, effect: "+security", subcategory: "COMMS" },
      { key: "frontierCommsOutpost", label: "FRONTIER COMMS OUTPOST", description: "A radio tower at the edge of civilization, keeping contact with the scouts, traders, and explorers who venture beyond the walls. The signal is weak. The connection is vital.", cost: 24000, steelCost: 30, effect: "+frontier coverage", subcategory: "COMMS" },
      { key: "orbitalDockyard", label: "ORBITAL DOCKYARD", description: "Shipyards floating in the void. Workers in spacesuits weld hull plates while the planet turns below. Building humanity's future, one rivet at a time.", cost: 160000, steelCost: 280, effect: "+ship production", subcategory: "ORBITAL" },
      { key: "stationFabricationRing", label: "STATION FAB RING", description: "A ring-shaped factory that assembles space station modules in zero gravity. The precision required is inhuman. The robots handle it. The humans supervise.", cost: 192000, steelCost: 350, effect: "+station capacity", subcategory: "ORBITAL" },
      { key: "zeroGFactory", label: "ZERO-G FACTORY", description: "Manufacturing without gravity. Perfect crystals, flawless alloys, and materials impossible to make on the surface. The products are worth their weight in orbit.", cost: 128000, steelCost: 210, effect: "+orbital industry", subcategory: "ORBITAL" },
      { key: "orbitalSolarFarm", label: "ORBITAL SOLAR FARM", description: "Solar panels in space, where there's no atmosphere to dim the sun. The power is beamed down to the city as microwaves. Don't fly through the beam.", cost: 96000, steelCost: 110, effect: "+orbital power", subcategory: "ORBITAL" },
      { key: "fuelCrackingPlant", label: "FUEL CRACKING PLANT", description: "Breaking down raw materials into rocket fuel in orbit. Messy, dangerous, and essential for any ship that wants to go further than low orbit.", cost: 80000, steelCost: 85, effect: "+fuel production", subcategory: "ORBITAL" },
      { key: "vacuumRefinery", label: "VACUUM REFINERY", description: "Refining materials in the vacuum of space, where contamination is impossible and precision is absolute. The products are impossibly pure.", cost: 112000, steelCost: 140, effect: "+advanced materials", subcategory: "ORBITAL" },
      { key: "droneServiceBay", label: "DRONE SERVICE BAY", description: "Orbital garages where drones are recharged, repaired, and redeployed. The drones do the dangerous work. The bay keeps them working.", cost: 48000, steelCost: 55, effect: "+drone operations", subcategory: "ORBITAL" },
      { key: "cargoTransferNode", label: "CARGO TRANSFER NODE", description: "A hub where cargo containers change hands between ships, stations, and the surface. The orbital equivalent of a busy intersection.", cost: 64000, steelCost: 70, effect: "+orbital trade", subcategory: "ORBITAL" },
      { key: "orbitalWarehouse", label: "ORBITAL WAREHOUSE", description: "Storage containers drifting in formation, holding goods that are too valuable or too dangerous to keep on the surface. Zero gravity. Zero theft.", cost: 56000, steelCost: 55, effect: "+orbital storage", subcategory: "ORBITAL" },
      { key: "hullAssemblyFacility", label: "HULL ASSEMBLY FACILITY", description: "Where the bones of ships are built. Steel frames and hull plates, assembled in the silence of space. Each ship starts here as a skeleton and leaves as a vessel.", cost: 144000, steelCost: 250, effect: "+ship construction", subcategory: "ORBITAL" },
      { key: "orbitalDefensePlatform", label: "ORBITAL DEFENSE PLATFORM", description: "An armed station bristling with weapons, staring down at the planet. Anything approaching without authorization gets a warning. Once.", cost: 240000, steelCost: 280, effect: "+orbital defense", subcategory: "NAVY" },
      { key: "pointDefenseGrid", label: "POINT DEFENSE GRID", description: "Close-range weapons that swat missiles and debris out of space. The last line of defense before something hits the station. They fire a lot.", cost: 96000, steelCost: 110, effect: "+anti-missile", subcategory: "NAVY" },
      { key: "marineTrainingSchool", label: "MARINE TRAINING SCHOOL", description: "Training soldiers to fight in zero gravity, in vacuum, in the dark. Space combat is nothing like ground combat. The survivors agree on that much.", cost: 64000, steelCost: 55, effect: "+marine quality", subcategory: "NAVY" },
      { key: "fleetAcademy", label: "FLEET ACADEMY", description: "Where future captains learn orbital mechanics, fleet tactics, and how to keep their crew alive in the void. The washout rate is brutal.", cost: 80000, steelCost: 70, effect: "+fleet readiness", subcategory: "NAVY" },
      { key: "navalBarracks", label: "NAVAL BARRACKS", description: "Quarters for the men and women who crew the orbital fleet. Tight bunks, shared air, and the constant hum of the life support system. Home.", cost: 48000, steelCost: 55, effect: "+crew capacity", subcategory: "NAVY" },
      { key: "boardingDrillCenter", label: "BOARDING DRILL CENTER", description: "Practice breaching airlocks, clearing corridors in mag-boots, and fighting in pressurized suits. Boarding a hostile ship is terrifying. Training makes it merely dangerous.", cost: 56000, steelCost: 40, effect: "+boarding success", subcategory: "NAVY" },
      { key: "spaceSecurityCommand", label: "SPACE SECURITY COMMAND", description: "The orbital equivalent of a war room. Every ship tracked, every threat assessed, every response planned. The officers here hold the high ground. Literally.", cost: 128000, steelCost: 110, effect: "+orbital security", subcategory: "NAVY" },
      { key: "escortCraftHangar", label: "ESCORT CRAFT HANGAR", description: "Small, fast ships kept ready to escort convoys and chase down threats. The pilots are cowboys. The craft are workhorses. The combination works.", cost: 72000, steelCost: 85, effect: "+escort capacity", subcategory: "NAVY" },
      { key: "orbitalArmory", label: "ORBITAL ARMORY", description: "Weapons stored in orbit, away from curious hands. Missiles, torpedoes, and kinetic impactors, all floating in climate-controlled racks.", cost: 64000, steelCost: 70, effect: "+orbital ammo", subcategory: "NAVY" },
      { key: "strategicWatchPlatform", label: "STRATEGIC WATCH PLATFORM", description: "A sentinel in orbit, scanning the horizons that ground radar can't reach. When something's coming, this platform sees it first. Time is everything.", cost: 112000, steelCost: 110, effect: "+early warning", subcategory: "NAVY" },
      { key: "orbitalHabitatRing", label: "ORBITAL HABITAT RING", description: "A spinning ring in orbit, creating artificial gravity for the people living inside. Parks, apartments, and the illusion of normalcy, all spinning at 2 RPM.", cost: 192000, steelCost: 280, effect: "+station pop capacity", subcategory: "HAB" },
      { key: "stationResidentialCore", label: "STATION RESIDENTIAL CORE", description: "Living quarters bolted to the heart of a space station. The rooms are small, the views are infinite, and the commute is a hallway.", cost: 128000, steelCost: 170, effect: "+crew housing", subcategory: "HAB" },
      { key: "colonyStarterVault", label: "COLONY STARTER VAULT", description: "Everything needed to start civilization from scratch: seeds, tools, medical supplies, and hope. Sealed and waiting for the day the city reaches for the stars.", cost: 96000, steelCost: 110, effect: "Enables colonization", subcategory: "HAB" },
      { key: "surfaceHabitatFabricator", label: "SURFACE HAB FABRICATOR", description: "Automated machines that land on barren rock and build habitats from local materials. The colonists arrive to a home they've never seen. Built by robots that don't care.", cost: 144000, steelCost: 210, effect: "+colony construction", subcategory: "HAB" },
      { key: "lifeSupportPlant", label: "LIFE SUPPORT PLANT", description: "The machine that keeps space habitable. Air scrubbed, water recycled, temperature controlled. When this fails, everything else is academic.", cost: 80000, steelCost: 85, effect: "+life support", subcategory: "HAB" },
      { key: "hydroponicOrbitalFarm", label: "HYDROPONIC ORBITAL FARM", description: "Lettuce floating in nutrient baths in zero-g. The first fresh food most station crew have tasted in months. Morale impact: immeasurable.", cost: 72000, steelCost: 70, effect: "+orbital food", subcategory: "HAB" },
      { key: "medicalIsolationModule", label: "MEDICAL ISOLATION MODULE", description: "A sealed module for treating the sick in space. Disease in a closed environment is everyone's nightmare. These modules keep nightmares contained.", cost: 56000, steelCost: 40, effect: "+orbital medical", subcategory: "HAB" },
      { key: "radiationShieldWorks", label: "RADIATION SHIELD WORKS", description: "Factories producing the shielding that keeps cosmic radiation from cooking the station inhabitants. Without this, space is a death sentence measured in rads.", cost: 64000, steelCost: 85, effect: "+radiation protection", subcategory: "HAB" },
      { key: "colonialAdminHub", label: "COLONIAL ADMIN HUB", description: "Governing colonies from orbit. The bureaucracy of expansion: permits, supply requests, and diplomatic cables. Someone has to manage the frontier.", cost: 88000, steelCost: 70, effect: "+colony admin", subcategory: "HAB" },
      { key: "frontierHabComplex", label: "FRONTIER HAB COMPLEX", description: "Housing on the edge of explored space. The pioneers who live here are equal parts brave and stubborn. The accommodations are functional. The location is everything.", cost: 112000, steelCost: 140, effect: "+frontier pop", subcategory: "HAB" },
      { key: "frontierSurveyAcademy", label: "FRONTIER SURVEY ACADEMY", description: "Training the next generation of explorers. Geology, xeno-biology, survival skills, and the art of not dying on an alien world. The graduates are ready for anything. Allegedly.", cost: 48000, steelCost: 40, effect: "+exploration skill", subcategory: "SCIENCE" },
      { key: "orbitalScienceInstitute", label: "ORBITAL SCIENCE INSTITUTE", description: "Research conducted above the atmosphere, where gravity doesn't interfere and the view inspires. The scientists forget to eat. The discoveries forget to wait.", cost: 80000, steelCost: 70, effect: "+space research", subcategory: "SCIENCE" },
      { key: "astrometricsLab", label: "ASTROMETRICS LAB", description: "Mapping the stars with precision that borders on obsession. Every coordinate catalogued, every anomaly noted. The universe is large. The maps are growing.", cost: 56000, effect: "+survey range", subcategory: "SCIENCE" },
      { key: "remoteSensorCampus", label: "REMOTE SENSOR CAMPUS", description: "Building sensors that can taste the composition of a planet from orbit. The technology is remarkable. The data is overwhelming. The analysts drink a lot of coffee.", cost: 64000, effect: "+sensor range", subcategory: "SCIENCE" },
      { key: "planetaryFieldSchool", label: "PLANETARY FIELD SCHOOL", description: "Teaching people to work on planets that want to kill them. Different gravity, different atmosphere, different everything. The fieldwork is the final exam.", cost: 40000, steelCost: 30, effect: "+field science", subcategory: "SCIENCE" },
      { key: "deepResearchVault", label: "DEEP RESEARCH VAULT", description: "Classified research behind clearance levels most people don't know exist. What they're studying could change everything. Or destroy it. The reports are eyes-only.", cost: 96000, effect: "+advanced research", subcategory: "SCIENCE" },
      { key: "missionAnalysisCenter", label: "MISSION ANALYSIS CENTER", description: "Every mission planned down to the second, every contingency considered, every risk calculated. The planners live in a world of probability. The explorers live with the results.", cost: 48000, effect: "+mission success", subcategory: "SCIENCE" },
      { key: "telescopeComplex", label: "TELESCOPE COMPLEX", description: "Giant mirrors pointed at the sky, seeing things billions of years old. The light that arrives today left its source before the city existed. Perspective.", cost: 72000, steelCost: 85, effect: "+observation", subcategory: "SCIENCE" },
      { key: "explorationTrainingYard", label: "EXPLORATION TRAINING YARD", description: "Obstacle courses, survival scenarios, and simulated alien environments. The recruits who finish are ready for the frontier. The ones who don't weren't.", cost: 32000, steelCost: 30, effect: "+exploration", subcategory: "SCIENCE" },
      { key: "scienceDataArchive", label: "SCIENCE DATA ARCHIVE", description: "Petabytes of research data, catalogued and cross-referenced. Every discovery ever made, stored forever. Knowledge is the one resource that grows when you share it.", cost: 40000, effect: "+research speed", subcategory: "SCIENCE" },
    ],
  },
  {
    id: "commercial",
    label: "COMMERCIAL",
    icon: "shopping-bag",
    buildings: [
      { key: "megaMallComplexes", label: "MEGA-MALL COMPLEXES", description: "Shopping centers the size of city blocks. You can buy anything here — if you can find the exit. The food court alone employs three hundred people.", cost: 56000, steelCost: 85, effect: "+trade income, +happiness, +tax" },
      { key: "corporateOfficeTowers", label: "CORPORATE OFFICE TOWERS", description: "Glass towers where the real power lives. Corporations that pay taxes, create jobs, and slowly buy the city from the inside. Welcome to capitalism.", cost: 64000, steelCost: 110, effect: "+120 tax/tick, +employment" },
      { key: "blackMarketBazaars", label: "BLACK MARKET BAZAARS", description: "Officially, these don't exist. Unofficially, you can buy anything the legal market won't sell. The city tolerates them. The tax revenue is... indirect.", cost: 24000, effect: "+trade, +crime, +goods flow" },
      { key: "tradeExchangeFloors", label: "TRADE EXCHANGE FLOORS", description: "Where commodities change hands at the speed of light. Fortunes made and lost in microseconds. The traders age in dog years. The profits are real.", cost: 48000, steelCost: 55, effect: "+trade income, +goods/tick" },
      { key: "neonSignDistricts", label: "NEON SIGN DISTRICTS", description: "Blocks drowned in holographic advertisements selling things nobody needs. The power drain is enormous. The consumer spending makes it worthwhile.", cost: 29000, steelCost: 30, effect: "+happiness, +trade, power drain" },
      { key: "syntheticMarketHalls", label: "SYNTHETIC MARKET HALLS", description: "AI-curated shopping where algorithms know what you want before you do. The recommendations are eerily accurate. The spending is effortless. By design.", cost: 35000, steelCost: 40, effect: "+trade, +consumer goods flow" },
      { key: "luxuryBoutiqueArcades", label: "LUXURY BOUTIQUE ARCADES", description: "Shops where a handbag costs more than a hab-block apartment. The elite shop here. Everyone else window-shops and dreams.", cost: 45000, steelCost: 50, effect: "+luxury tax, +happiness (elite)" },
      { key: "wholesaleDistributionDepots", label: "WHOLESALE DEPOTS", description: "Warehouses the size of districts, moving bulk goods to retailers. Unsexy, essential, and the reason the shelves aren't empty.", cost: 32000, steelCost: 40, effect: "+goods flow, +trade efficiency, +500 Goods storage" },
      { key: "franchiseFoodCourts", label: "FRANCHISE FOOD COURTS", description: "Identical food stalls selling identical food in identical packaging. The citizens love the consistency. The nutritionists love the portions. Everyone eats.", cost: 19000, steelCost: 20, effect: "+food consumption, +happiness" },
      { key: "dataServiceBureaus", label: "DATA SERVICE BUREAUS", description: "Information is the real commodity. These bureaus buy, sell, and broker data. Your shopping habits, your health records, your location. All for sale.", cost: 40000, effect: "+research, +trade, +surveillance" },
      { key: "freightBrokerageHubs", label: "FREIGHT BROKERAGE HUBS", description: "Where shipping contracts are negotiated by sharp-eyed brokers who can smell a good deal. The logistics of a million-person city, managed by people who love spreadsheets.", cost: 35000, steelCost: 35, effect: "+trade income, +logistics" },
      { key: "entertainmentLicensingOffices", label: "ENTERTAINMENT LICENSING", description: "Permits for bars, clubs, and VR dens. Regulation keeps the industry clean. Mostly. The licensing fees keep the treasury happy. Always.", cost: 26000, effect: "+tax, -crime in entertainment" },
      { key: "vehicleDealershipLots", label: "VEHICLE DEALERSHIP LOTS", description: "Rows of shiny vehicles under floodlights, sold by salespeople with smiles wider than the highway. Personal transport is a luxury. The demand is endless.", cost: 29000, steelCost: 30, effect: "+tax, +vehicle availability" },
      { key: "cyberwareRetailChains", label: "CYBERWARE RETAIL CHAINS", description: "Augmentation shops on every corner, selling chrome dreams at consumer prices. Walk in, pick an upgrade, walk out enhanced. The future is retail.", cost: 38000, steelCost: 35, effect: "+trade, +cyber commodity demand" },
      { key: "advertisingHoloTowers", label: "ADVERTISING HOLO-TOWERS", description: "Towering holograms selling soft drinks and cybernetic implants. The advertisements are inescapable. The power they consume could light a housing block. But consumption drives the economy.", cost: 22000, steelCost: 20, effect: "+trade, +happiness, power drain" },
    ],
  },
  {
    id: "infrastructure",
    label: "INFRA",
    icon: "layers",
    buildings: [
      { key: "sectorPowerSubstations", label: "SECTOR POWER SUBSTATIONS", description: "Humming boxes of transformers that step power down from the grid to the district. Nobody notices them until they fail. Then everyone notices.", cost: 29000, steelCost: 40, effect: "+power distribution, -grid drain" },
      { key: "sewageTreatmentWorks", label: "SEWAGE TREATMENT WORKS", description: "A million people produce a lot of waste. These plants process it all, turning the unmentionable into the reusable. The workers deserve medals.", cost: 35000, steelCost: 55, effect: "+water, -disease, -pollution" },
      { key: "commsTowerNetworks", label: "COMMS TOWER NETWORKS", description: "Towers bristling with antennae, carrying every phone call, every data packet, every surveillance feed. The city's invisible nervous system.", cost: 24000, steelCost: 35, effect: "+surveillance, +admin efficiency" },
      { key: "undergroundCableConduits", label: "UNDERGROUND CABLE CONDUITS", description: "Miles of cables buried beneath the streets, carrying power and data. When a conduit fails, the repair teams dig. They always find interesting things down there.", cost: 32000, steelCost: 50, effect: "+infra health, +power stability" },
      { key: "elevatedHighwayRamps", label: "ELEVATED HIGHWAY RAMPS", description: "Roads stacked on roads, spiraling up and over the city. The engineering is impressive. The motion sickness is real. The traffic keeps moving.", cost: 40000, steelCost: 70, effect: "+trade, -traffic unrest" },
      { key: "wasteIncinerationPlants", label: "WASTE INCINERATION PLANTS", description: "Burning garbage to generate power. The city's trash becomes the city's electricity. The filters catch most of the toxins. Most.", cost: 32000, steelCost: 40, effect: "+power from waste, -pollution" },
      { key: "bridgeAndOverpassNetworks", label: "BRIDGE & OVERPASS NETWORKS", description: "Bridges connecting sectors that were never meant to be connected. The engineering is audacious. The views are terrifying. The commerce flows.", cost: 48000, steelCost: 85, effect: "+trade, +mobility" },
      { key: "publicParkAndGreenSpaces", label: "PUBLIC PARKS & GREEN SPACES", description: "Patches of green in a sea of concrete. Real trees, real grass, real sky. The citizens come here to remember what the world used to look like.", cost: 19000, steelCost: 15, effect: "+happiness, -unrest, +health" },
      { key: "undergroundParkingMegaStructures", label: "UNDERGROUND PARKING", description: "Vast caverns of parked vehicles, spiraling down into the earth. Finding your car takes an app, a map, and optimism. But the streets above are clear.", cost: 26000, steelCost: 35, effect: "-traffic congestion, +happiness" },
      { key: "airPurificationTowers", label: "AIR PURIFICATION TOWERS", description: "Giant lungs that scrub the air, filtering out the chemicals, particulates, and regret. The air quality improves. The energy bill increases. Worth it.", cost: 35000, steelCost: 40, effect: "+health, -pollution, +happiness" },
      { key: "publicTransitTerminals", label: "PUBLIC TRANSIT TERMINALS", description: "Cavernous halls where rail, bus, and skyway converge. The crowds are enormous, the schedules are optimistic, and the coffee stands are essential.", cost: 45000, steelCost: 65, effect: "+trade, +employment, -unrest" },
      { key: "streetLightingGrids", label: "STREET LIGHTING GRIDS", description: "Lights that push back the darkness, one block at a time. Crime drops where the lights shine. The criminals move to darker streets. The lights follow.", cost: 16000, steelCost: 20, effect: "-crime, +safety, +happiness" },
      { key: "emergencyServiceStations", label: "EMERGENCY SERVICE STATIONS", description: "Fire trucks, ambulances, and rescue teams, ready around the clock. The first responders are the bravest people in the city. Their response time saves lives.", cost: 29000, steelCost: 35, effect: "+safety, +med/tick, +crisis response, +500 med capacity" },
      { key: "dataBackboneExchanges", label: "DATA BACKBONE EXCHANGES", description: "The internet's physical heart. Data flows through these buildings like blood through arteries. When one goes down, the city goes dark. They don't go down.", cost: 38000, steelCost: 30, effect: "+research, +surveillance, +trade" },
      { key: "stormDrainMegaSystems", label: "STORM DRAIN MEGA-SYSTEMS", description: "Tunnels the size of highways, designed to swallow floodwater before it swallows the city. When the rains come hard, these are all that stands between order and chaos.", cost: 32000, steelCost: 50, effect: "+disaster resistance, -flooding" },
    ],
  },
  {
    id: "wasteland",
    label: "WASTELAND",
    icon: "wind",
    buildings: [
      { key: "wastelandScavengerOutposts", label: "SCAVENGER OUTPOSTS", description: "Teams of lunatics who venture into the irradiated wastes to bring back anything useful. Survival rate: classified. Salvage value: excellent.", cost: 19000, steelCost: 20, effect: "+salvage commodities/tick" },
      { key: "radWasteProcessingPlants", label: "RAD-WASTE PROCESSING", description: "Taking the most toxic waste the wasteland produces and squeezing useful materials from it. The process is dangerous. The hazard pay is generous.", cost: 40000, steelCost: 55, effect: "+purified materials, -rad contamination" },
      { key: "mutantTradeDepots", label: "MUTANT TRADE DEPOTS", description: "Where the city trades with the mutant settlements beyond the walls. The goods are strange. The bartering is intense. The diplomacy is delicate.", cost: 24000, steelCost: 30, effect: "+trade, +wasteland commodities" },
      { key: "decontaminationStations", label: "DECONTAMINATION STATIONS", description: "Chemical showers and rad-scrubbers for anyone coming in from the wastes. Strip, spray, scan. If you glow, you don't enter. Simple rules.", cost: 32000, steelCost: 40, effect: "-disease, -rad exposure" },
      { key: "salvageTechWorkshops", label: "SALVAGE TECH WORKSHOPS", description: "Where pre-war technology is painstakingly restored. Every working device is a window into what the world lost. Some of it is better than anything we can build now.", cost: 29000, steelCost: 35, effect: "+research, +salvaged tech" },
      { key: "borderWallGatehouses", label: "BORDER WALL GATEHOUSES", description: "Fortified gates where the wall meets the wasteland. Armed guards, scanners, and the tension of not knowing what's on the other side. Today.", cost: 35000, steelCost: 50, effect: "+defense, +trade with wasteland" },
      { key: "radResistantFarmDomes", label: "RAD-RESISTANT FARM DOMES", description: "Growing food in contaminated soil, protected by radiation-proof domes. The crops are hardy, the yields are surprising, and the farmers are brave.", cost: 45000, steelCost: 55, effect: "+food from wasteland, +rad seeds" },
      { key: "fossilExcavationSites", label: "FOSSIL EXCAVATION SITES", description: "Digging up the bones of the old world. Ancient tech, preserved in amber and ash. Every find is a piece of the puzzle. The picture is still forming.", cost: 32000, steelCost: 30, effect: "+fossil amber, +research" },
      { key: "mutantCreatureRanches", label: "MUTANT CREATURE RANCHES", description: "Breeding mutant beasts for their hides, parts, and compounds. The ranchers are fearless. The creatures are unpredictable. The output is valuable.", cost: 26000, steelCost: 20, effect: "+mutant hides, +creature parts" },
      { key: "cursedEarthSurveyTeams", label: "CURSED EARTH SURVEY TEAMS", description: "Expedition teams mapping the irradiated wilderness. They chart what's out there so the city knows what it's up against. Many go out. Most come back.", cost: 22000, effect: "+mapping data, +resource discovery" },
    ],
  },
  {
    id: "vehicles",
    label: "VEHICLES",
    icon: "truck",
    buildings: [
      { key: "patrolBikeFactories", label: "PATROL BIKE FACTORIES", description: "Assembly lines stamping out sleek enforcement bikes. Fast, loud, and painted black. The enforcers love them. The speeders learn to fear them.", cost: 48000, steelCost: 70, effect: "+patrol bike production" },
      { key: "apcAssemblyPlants", label: "APC ASSEMBLY PLANTS", description: "Building armored personnel carriers — rolling fortresses that carry troops through the worst the city can throw at them. Ugly, heavy, and absolutely essential.", cost: 72000, steelCost: 110, effect: "+APC production" },
      { key: "gunshipHangars", label: "GUNSHIP HANGARS", description: "Cavernous hangars where attack helicopters are assembled, armed, and hangared. The rotors never fully stop spinning. Somewhere, there's always a mission.", cost: 96000, steelCost: 140, effect: "+gunship production" },
      { key: "hoverVehicleWorkshops", label: "HOVER VEHICLE WORKSHOPS", description: "Servicing vehicles that defy gravity. The anti-grav systems are temperamental, expensive, and worth every credit when they work. When they don't, things fall.", cost: 56000, steelCost: 70, effect: "+hover vehicle repair" },
      { key: "civilianVehiclePlants", label: "CIVILIAN VEHICLE PLANTS", description: "Churning out affordable civilian transports by the thousand. Not pretty, not fast, but reliable. The city's middle class needs wheels. These provide.", cost: 40000, steelCost: 55, effect: "+employment, +trade, +tax" },
      { key: "droneManufacturingBays", label: "DRONE MANUFACTURING BAYS", description: "Robots building smaller robots on assembly lines that never sleep. The drones that emerge serve as eyes, hands, and occasionally fists for the city.", cost: 45000, steelCost: 50, effect: "+drone production" },
      { key: "vehicleArmorFittingShops", label: "VEHICLE ARMOR FITTING", description: "Taking civilian vehicles and bolting armor plates to them. The results aren't elegant, but they stop bullets. In this city, that's a feature worth paying for.", cost: 32000, steelCost: 40, effect: "+vehicle survivability" },
      { key: "engineTestingFacilities", label: "ENGINE TESTING FACILITIES", description: "Test benches where engines scream at full throttle, measured by instruments that catch every flaw. A tested engine runs. An untested engine gambles.", cost: 35000, steelCost: 35, effect: "+vehicle reliability, +research" },
      { key: "tireTreadFactories", label: "TIRE & TREAD FACTORIES", description: "Rubber, steel, and carbon fiber pressed into the wheels that keep the city rolling. Unglamorous work. Indispensable product. The roads would agree.", cost: 24000, steelCost: 30, effect: "+vehicle parts production" },
      { key: "vehicleRecyclingYards", label: "VEHICLE RECYCLING YARDS", description: "Where old vehicles come to die and be reborn. Stripped for parts, melted for steel, and mourned by nobody. The circle of automotive life.", cost: 19000, steelCost: 15, effect: "+scrap metal, +steel from salvage" },
    ],
  },
  {
    id: "biotech",
    label: "BIOTECH",
    icon: "activity",
    buildings: [
      { key: "geneSplicingLabs", label: "GENE SPLICING LABS", description: "Cutting DNA like tailors cut fabric. The scientists rearrange the code of life with precision and hubris. The results are sometimes miraculous. Sometimes not.", cost: 72000, steelCost: 55, effect: "+research, +biotech commodities" },
      { key: "cloningFacilities", label: "CLONING FACILITIES", description: "Growing spare organs in tanks. Hearts, kidneys, livers — made to order. The ethical debates rage. The waiting lists shrink. The organs don't care who objects.", cost: 88000, steelCost: 70, effect: "+med/tick, +synthetic organs" },
      { key: "stemCellBanks", label: "STEM CELL BANKS", description: "Frozen potential, stored in liquid nitrogen. Every vial could become any tissue, any organ, any cure. The future of medicine, suspended at minus two hundred degrees.", cost: 56000, steelCost: 40, effect: "+stem cell cultures, +med/tick" },
      { key: "bioReactorFarms", label: "BIO-REACTOR FARMS", description: "Massive vessels of engineered organisms, producing enzymes and compounds no chemical factory can match. Biology is the oldest factory. We're just learning to operate it.", cost: 64000, steelCost: 55, effect: "+enzyme concentrates, +bio catalysts" },
      { key: "syntheticBloodBanks", label: "SYNTHETIC BLOOD BANKS", description: "Artificial blood that works better than the real thing. No blood types, no diseases, no donors needed. The only thing it lacks is poetry.", cost: 48000, steelCost: 35, effect: "+synthetic blood, +med/tick" },
      { key: "prionResearchContainment", label: "PRION RESEARCH CONTAINMENT", description: "Studying the diseases that eat brains, behind containment so tight even the air is paranoid. The researchers are heroes. The prions are nightmares.", cost: 80000, steelCost: 85, effect: "+research, +prion neutralizer" },
      { key: "geneTherapyClinics", label: "GENE THERAPY CLINICS", description: "Rewriting genetic defects in living patients. The treatment takes hours. The results last a lifetime. The wait times are measured in months.", cost: 61000, steelCost: 40, effect: "+happiness, +health, +employment" },
      { key: "cryoPreservationVaults", label: "CRYO-PRESERVATION VAULTS", description: "Freezing biological samples for eternity. Seeds, tissues, embryos — preserved against the day the city needs them. A library of life, written in ice.", cost: 67000, steelCost: 70, effect: "+cryo fluid, +research" },
      { key: "mutagenicTestingLabs", label: "MUTAGENIC TESTING LABS", description: "Deliberately mutating organisms to see what happens. The controlled experiments occasionally produce breakthroughs. The uncontrolled ones produce nightmares.", cost: 77000, steelCost: 50, effect: "+mutagenic compounds, +research" },
      { key: "radBioFilterStations", label: "RAD BIO-FILTER STATIONS", description: "Living organisms engineered to absorb radiation from water and soil. The organisms thrive on what kills everything else. Nature's revenge, weaponized for good.", cost: 51000, steelCost: 40, effect: "+rad filtering, -contamination" },
    ],
  },
  {
    id: "textiles",
    label: "TEXTILES",
    icon: "scissors",
    buildings: [
      { key: "woolProcessingMills", label: "WOOL PROCESSING MILLS", description: "Turning raw wool from mutant sheep into usable yarn. The sheep are larger than pre-war breeds. The wool is coarser. The sweaters are warmer.", cost: 22000, steelCost: 20, effect: "+spun yarn production" },
      { key: "weavingFactories", label: "WEAVING FACTORIES", description: "Looms the size of rooms, weaving fabric for a million citizens. The shuttles clatter day and night. The workers keep rhythm with the machines.", cost: 29000, steelCost: 30, effect: "+woven fabric, +dyed fabric" },
      { key: "kevlarProductionPlants", label: "KEVLAR PRODUCTION PLANTS", description: "Spinning ballistic fiber that stops bullets and shrapnel. The enforcers wear it. The military wears it. In this city, body armor is not a luxury.", cost: 45000, steelCost: 40, effect: "+kevlar fiber, +ballistic fabric" },
      { key: "leatherTanneries", label: "LEATHER TANNERIES", description: "Treating hides from mutant livestock with chemicals that make the pre-war EPA spin in its mass grave. The leather is tough. The smell is legendary.", cost: 26000, steelCost: 20, effect: "+tanned leather production" },
      { key: "nanoweaveSpinners", label: "NANOWEAVE SPINNERS", description: "Fabric woven from nanoscale fibers — lighter than silk, stronger than steel, and more expensive than both combined. The elite wear it. The military demands it.", cost: 56000, steelCost: 50, effect: "+nanoweave cloth, high-tech textiles" },
      { key: "uniformTailoringShops", label: "UNIFORM TAILORING SHOPS", description: "Mass-producing the black uniforms that make enforcers look intimidating. Tailored to fit, designed to terrify. The sewing machines never stop.", cost: 24000, steelCost: 15, effect: "+tactical vests, +clothing" },
      { key: "recycledFiberPlants", label: "RECYCLED FIBER PLANTS", description: "Old clothes in, new fiber out. The city can't afford to waste anything, including last season's fashion. Sustainability through necessity.", cost: 19000, steelCost: 15, effect: "+recycled fiber, -waste" },
      { key: "syntheticFabricExtruders", label: "SYNTHETIC FABRIC EXTRUDERS", description: "Extruding polymers into waterproof canvas and mesh netting. The material is synthetic, the applications are endless, and the environmental cost is someone else's problem.", cost: 35000, steelCost: 35, effect: "+waterproof canvas, +mesh netting" },
    ],
  },
  {
    id: "military",
    label: "MUNITIONS",
    icon: "crosshair",
    buildings: [
      { key: "smallArmsFactories", label: "SMALL ARMS FACTORIES", description: "Assembly lines producing the tools of enforcement: rifles, pistols, and shotguns. Each weapon tested, stamped, and issued. The production never stops because the need never does.", cost: 48000, steelCost: 55, effect: "+rifle assemblies, +sidearm kits" },
      { key: "ammunitionPressLines", label: "AMMUNITION PRESS LINES", description: "Brass, powder, primer — pressed into rounds by the million. The machines stamp out death at industrial speed. The accounting department tracks it in spreadsheets.", cost: 40000, steelCost: 40, effect: "+ammo production" },
      { key: "explosivesOrdnancePlants", label: "EXPLOSIVES ORDNANCE PLANTS", description: "Where grenades and demolition charges are assembled with surgical care. One careless worker and the plant becomes a crater. The safety record is excellent. Because it has to be.", cost: 56000, steelCost: 65, effect: "+grenades, +demolition charges" },
      { key: "bodyArmorForges", label: "BODY ARMOR FORGES", description: "Pressing ceramic and steel into plates that save lives. Every vest that leaves this forge is someone's second chance. The quality control is merciless.", cost: 45000, steelCost: 50, effect: "+ballistic plates, +tactical vests" },
      { key: "opticsAndSightsLabs", label: "OPTICS & SIGHTS LABS", description: "Precision optics that let enforcers see in the dark, through walls, and across districts. The targets are visible before they know they're being watched.", cost: 35000, steelCost: 30, effect: "+thermal scopes, +night vision" },
      { key: "fieldEquipmentAssembly", label: "FIELD EQUIPMENT ASSEMBLY", description: "Everything a soldier needs besides a weapon: radios, med-kits, rations, and the hundred small things that keep an army functional. Logistics wins wars.", cost: 29000, steelCost: 20, effect: "+field radios, +combat rations" },
      { key: "energyWeaponForges", label: "ENERGY WEAPON FORGES", description: "Forging weapons that shoot light and fire plasma. The technology is cutting-edge. The results are cauterizing-edge. The R&D budget is classified.", cost: 80000, steelCost: 85, effect: "+energy weapon cores, +hotshot packs" },
      { key: "weaponMaintenanceDepots", label: "WEAPON MAINTENANCE DEPOTS", description: "Armourers who strip, clean, and reassemble weapons with their eyes closed. A maintained weapon fires. A neglected weapon jams. The difference is life and death.", cost: 26000, steelCost: 20, effect: "+weapon reliability, +ammo reclaim" },
      { key: "fortificationMaterialYards", label: "FORTIFICATION MATERIAL YARDS", description: "Producing the unglamorous tools of defense: barbed wire, sandbags, and concrete barriers. The frontline troops are grateful. The accountants are resigned.", cost: 22000, steelCost: 20, effect: "+barbed wire, +sandbags, +barriers" },
      { key: "specialWeaponsDivision", label: "SPECIAL WEAPONS DIVISION", description: "Classified weapons development. Railgun slugs, micro-missiles, and things nobody outside this building knows about. The scientists have clearance. The weapons have attitude.", cost: 88000, steelCost: 70, effect: "+railgun slugs, +micro-missiles" },
    ],
  },
  {
    id: "beautification",
    label: "BEAUTIFY",
    icon: "sun",
    buildings: [
      { key: "cityParks", label: "CITY PARKS", description: "Green spaces carved from concrete. Trees that survived the apocalypse.", cost: 13000, effect: "+happiness, -unrest" },
      { key: "botanicalGardens", label: "BOTANICAL GARDENS", description: "Curated collections of surviving and engineered plant species.", cost: 24000, effect: "+happiness, +research" },
      { key: "publicPlazas", label: "PUBLIC PLAZAS", description: "Open gathering spaces with fountains and seating. Where citizens pretend they're free.", cost: 10000, effect: "+happiness, -unrest" },
      { key: "statueOfCommander", label: "STATUE OF THE COMMANDER", description: "Towering monument to your glory. Mandatory selfie spot.", cost: 32000, steelCost: 40, effect: "+law & order, +happiness" },
      { key: "memorialMonuments", label: "MEMORIAL MONUMENTS", description: "Remembering the fallen. The pre-catastrophe world. The price of survival.", cost: 19000, steelCost: 20, effect: "+happiness" },
      { key: "arenaComplex", label: "ARENA COMPLEX", description: "Mass entertainment venue. Gladiatorial combat optional but popular.", cost: 56000, steelCost: 55, effect: "+happiness, -unrest, +employment" },
      { key: "zooEnclosures", label: "ZOO ENCLOSURES", description: "Surviving animal species in climate-controlled habitats. Kids love it.", cost: 40000, steelCost: 30, effect: "+happiness, +tourism" },
      { key: "megaZoo", label: "MEGA-ZOO", description: "Massive zoological park with designer megafauna. Neon tigers included.", cost: 80000, steelCost: 55, effect: "+happiness, +tourism, +trade" },
      { key: "publicTelevisionScreens", label: "PUBLIC TV SCREENS", description: "Giant screens broadcasting state-approved content. News. Propaganda. Entertainment.", cost: 16000, steelCost: 15, effect: "+happiness, -unrest, +law & order" },
      { key: "holographicBillboards", label: "HOLOGRAPHIC BILLBOARDS", description: "3D holographic displays on every corner. The message is everywhere.", cost: 29000, steelCost: 20, effect: "+happiness, -unrest" },
      { key: "waterFeatures", label: "WATER FEATURES", description: "Decorative fountains and cascading waterfalls. Luxury in a desert.", cost: 19000, effect: "+happiness" },
      { key: "sculptureGardens", label: "SCULPTURE GARDENS", description: "Open-air galleries of post-apocalyptic art. Beauty from wreckage.", cost: 16000, effect: "+happiness, +tourism" },
      { key: "streetLighting", label: "DECORATIVE STREET LIGHTING", description: "Neon and LED beautification of main thoroughfares.", cost: 8000, effect: "+happiness, -crime" },
      { key: "communityTheaters", label: "COMMUNITY THEATERS", description: "Performance spaces for music, drama, and state-approved comedy.", cost: 26000, effect: "+happiness, +employment" },
      { key: "ecoDomes", label: "ECO-DOME HABITATS", description: "Sealed biodomes with complete ecosystems. Nature under glass.", cost: 96000, steelCost: 70, effect: "+happiness, +food, +research" },
    ],
  },
  {
    id: "religion",
    label: "RELIGION",
    icon: "sun",
    buildings: [
      { key: "districtTemple", label: "DISTRICT TEMPLE", description: "Standard place of worship. Seats 500 faithful. State-approved sermons.", cost: 24000, steelCost: 30, effect: "+happiness, -unrest" },
      { key: "grandCathedral", label: "GRAND CATHEDRAL", description: "Magnificent cathedral dominating the skyline. Architectural devotion.", cost: 128000, steelCost: 140, effect: "+3 happiness, -3 unrest, +tourism" },
      { key: "monasteryComplex", label: "MONASTERY COMPLEX", description: "Contemplative living quarters for religious orders. Cheap labor.", cost: 40000, steelCost: 40, effect: "+employment, -unrest" },
      { key: "pilgrimageShrines", label: "PILGRIMAGE SHRINES", description: "Holy sites attracting faithful visitors. Revenue guaranteed.", cost: 32000, steelCost: 20, effect: "+trade income, +happiness" },
      { key: "inquisitionHQ", label: "INQUISITION HEADQUARTERS", description: "Central command for religious compliance enforcement.", cost: 64000, steelCost: 70, effect: "-crime, +law & order, -happiness" },
      { key: "prophetsAcademy", label: "PROPHET'S ACADEMY", description: "Training facility for state-approved religious leaders.", cost: 48000, steelCost: 35, effect: "+employment, +happiness" },
      { key: "holyRelicVault", label: "HOLY RELIC VAULT", description: "Secure storage for sacred artifacts. Pilgrims pay to view.", cost: 56000, steelCost: 55, effect: "+trade income, +happiness" },
      { key: "divineBroadcastTower", label: "DIVINE BROADCAST TOWER", description: "Transmits sermons and divine pronouncements across all sectors.", cost: 35000, steelCost: 40, effect: "-unrest, +law & order" },
      { key: "sacredGroundPark", label: "SACRED GROUND PARK", description: "Consecrated green spaces for meditation and prayer.", cost: 19000, steelCost: 15, effect: "+happiness" },
      { key: "confessionalBureau", label: "CONFESSIONAL BUREAU", description: "Government-monitored confession booths. Absolution meets intelligence.", cost: 29000, steelCost: 20, effect: "-crime, +law & order, -happiness" },
      { key: "martyrsMemorial", label: "MARTYR'S MEMORIAL", description: "Monument to those who died for the faith. Inspiring and sobering.", cost: 24000, steelCost: 30, effect: "+happiness, +defense" },
      { key: "zealotBarracks", label: "ZEALOT BARRACKS", description: "Housing and training for religious militia volunteers.", cost: 48000, steelCost: 55, effect: "+defense, -unrest, -happiness" },
      { key: "templeOfCommerce", label: "TEMPLE OF COMMERCE", description: "Where prayer meets profit. Buy salvation. Sell indulgences.", cost: 40000, steelCost: 30, effect: "+trade income, +corruption" },
      { key: "oracleChambers", label: "ORACLE CHAMBERS", description: "Mystical consultation rooms. The oracle speaks. The state listens.", cost: 32000, steelCost: 20, effect: "+research, +corruption" },
      { key: "doomsdayBunkerShrine", label: "DOOMSDAY BUNKER SHRINE", description: "Underground temple doubling as apocalypse shelter. Pray and survive.", cost: 72000, steelCost: 85, effect: "+defense, +happiness, -unrest" },
    ],
  },
  {
    id: "biosphere",
    label: "BIOSPHERE",
    icon: "feather",
    buildings: [
      { key: "biosphereReclamationDomes", label: "BIOSPHERE RECLAMATION DOME", description: "Sealed domes restoring natural ecosystems within the megacity.", cost: 96000, steelCost: 110, effect: "+biosphere, +happiness, -15 power" },
      { key: "insectBreedingWarrens", label: "INSECT BREEDING WARRENS", description: "High-yield insect protein farms for sustainable food production.", cost: 29000, steelCost: 30, effect: "+40 food/tick" },
      { key: "mycologyCultivationCaves", label: "MYCOLOGY CULTIVATION CAVES", description: "Underground fungal cultivation for food and medicine.", cost: 35000, steelCost: 35, effect: "+48 food/tick, +5 med/tick" },
      { key: "pollinatorDroneHives", label: "POLLINATOR DRONE HIVES", description: "Robotic pollinators supplementing decimated insect populations.", cost: 40000, steelCost: 40, effect: "+32 food/tick, +biosphere" },
      { key: "aquaponicsMegaFacilities", label: "AQUAPONICS MEGA-FACILITY", description: "Integrated fish and plant farming at industrial scale.", cost: 72000, steelCost: 85, effect: "+80 food/tick, -12 power" },
      { key: "mutantFloraReserves", label: "MUTANT FLORA RESERVES", description: "Protected zones for radiation-adapted plant species.", cost: 32000, steelCost: 20, effect: "+24 food/tick, +biosphere" },
      { key: "atmosphericBiofilterStations", label: "ATMOSPHERIC BIOFILTER STATION", description: "Living biofilter walls scrubbing airborne toxins.", cost: 48000, steelCost: 55, effect: "+biosphere, -diseaseRisk, -8 power" },
      { key: "xenoVeterinaryHospitals", label: "XENO-VETERINARY HOSPITAL", description: "Medical care for mutant fauna and uplifted species.", cost: 56000, steelCost: 40, effect: "+10 med/tick, +biosphere" },
      { key: "upliftTrainingAcademies", label: "UPLIFT TRAINING ACADEMY", description: "Education and vocational training for uplifted species.", cost: 64000, steelCost: 50, effect: "+uplift pop, +education, -10 power" },
      { key: "geneticSeedVaults", label: "GENETIC SEED VAULT", description: "Cryogenic preservation of endangered species genomes.", cost: 45000, steelCost: 35, effect: "+biosphere, +research" },
      { key: "wildlifeCorridorNetworks", label: "WILDLIFE CORRIDOR NETWORK", description: "Protected passages for fauna movement between reserves.", cost: 24000, steelCost: 30, effect: "+biosphere, +happiness" },
      { key: "radWasteCompostingPlants", label: "RAD-WASTE COMPOSTING PLANT", description: "Biological decomposition of low-level radioactive waste.", cost: 32000, steelCost: 35, effect: "-diseaseRisk, +biosphere" },
      { key: "upliftCivicCenters", label: "UPLIFT CIVIC CENTER", description: "Community spaces for uplift citizens to organize and socialize.", cost: 29000, steelCost: 20, effect: "+uplift pop, +happiness, -unrest" },
      { key: "bioremediationProcessingPlants", label: "BIOREMEDIATION PROCESSING", description: "Large-scale biological decontamination of polluted zones.", cost: 56000, steelCost: 55, effect: "+biosphere, -diseaseRisk" },
      { key: "interspeciesMediationCenters", label: "INTERSPECIES MEDIATION", description: "Conflict resolution between human and uplift communities.", cost: 35000, steelCost: 20, effect: "-unrest, +law & order, +happiness" },
    ],
  },
  {
    id: "wildlands",
    label: "WILDLANDS",
    icon: "feather",
    buildings: [
      { key: "apexHuntersLodges", label: "APEX HUNTERS' LODGE", description: "Hunter crews dispatched into the wildlands. They bring back meat, hides, and bone char. Some don't come back at all. The lodge keeps a list. The list is long.", cost: 28000, steelCost: 30, effect: "+wild meat, +hides, +bone char" },
      { key: "wildlandsRangerStations", label: "WILDLANDS RANGER STATION", description: "Permanent outposts in the green zones. Rangers patrol, monitor herds, and collect ivory and pheromone glands the apex predators leave behind. The job is dangerous. The pay is fair.", cost: 34000, steelCost: 40, effect: "+ivory, +alpha pheromones, +biosphere" },
      { key: "hydroponicDomes", label: "HYDROPONIC DOME", description: "Sealed glass domes growing medicinal herbs and biomass under controlled light, no matter what the wildlands weather is doing. The yields are predictable. The wildlands are not.", cost: 22000, steelCost: 20, effect: "+medicinal herbs, +biomass" },
      { key: "feralLivestockPens", label: "FERAL LIVESTOCK PENS", description: "Reinforced pens holding semi-domesticated wildlands beasts. They're meaner than pre-war stock. They taste better too. The fences are electrified for a reason.", cost: 32000, steelCost: 45, effect: "+wild livestock, +meat, +hides" },
      { key: "wildlandsBioreserves", label: "WILDLANDS BIORESERVE", description: "Protected breeding zones managed for sustained yield. The biologists curse the poachers. The poachers curse the biologists. The biomass keeps growing.", cost: 56000, steelCost: 60, effect: "+biomass, +livestock, +biosphere" },
      { key: "frontierApothecaries", label: "FRONTIER APOTHECARY", description: "Where wildlands herbs are distilled into antitoxins for snakebite, spore exposure, and worse. The shelves are crowded. The patients are grateful.", cost: 26000, steelCost: 25, effect: "herbs → antitoxin, +med/tick" },
      { key: "bushTanneries", label: "BUSH TANNERY", description: "Hides go in raw. Exotic pelts come out cured, supple, and worth a fortune to the right buyer. The chemicals are toxic. The profits are not.", cost: 24000, steelCost: 25, effect: "hides → exotic pelts" },
      { key: "geneVaults", label: "GENE VAULT", description: "Cryogenic archive of wildlands genome samples. Apothecaries draw from it. Researchers cross-reference it. Whoever controls the vault controls what comes back. And what doesn't.", cost: 52000, steelCost: 50, effect: "+research, +antitoxin yield" },
    ],
  },
  {
    id: "expedition",
    label: "EXPEDITION",
    icon: "compass",
    buildings: [
      { key: "expeditionHQ", label: "EXPEDITION HQ", description: "Central command for wasteland exploration missions. Coordinates teams, tracks routes, and processes recovered artifacts. The maps on the walls are mostly question marks.", cost: 72000, steelCost: 85, effect: "+expedition capacity, +research" },
      { key: "wastelandGarages", label: "WASTELAND GARAGES", description: "Vehicle maintenance and modification bays for expedition convoys. The mechanics here can make an APC run on cooking oil and spite.", cost: 40000, steelCost: 55, effect: "+vehicle readiness, -expedition losses" },
      { key: "artifactVaults", label: "ARTIFACT VAULTS", description: "Climate-controlled storage for recovered pre-war technology. Some items are studied. Some are locked away. Some are both.", cost: 56000, steelCost: 70, effect: "+artifact storage, +research" },
      { key: "wastelandBeacons", label: "WASTELAND BEACONS", description: "Signal towers extending communication range deep into the waste. Expedition teams stop dying from miscommunication. Mostly.", cost: 29000, steelCost: 40, effect: "+comm range, -expedition losses" },
      { key: "scavRecyclingPlants", label: "SCAV RECYCLING PLANTS", description: "Industrial processing of wasteland salvage into usable materials. One city's radioactive debris is another city's building supplies.", cost: 48000, steelCost: 50, effect: "+steel/tick, +materials" },
      { key: "survivorProcessingCenters", label: "SURVIVOR PROCESSING CENTERS", description: "Intake facilities for wasteland refugees and expedition contacts. Medical screening, decontamination, and the awkward question of where to put them.", cost: 32000, steelCost: 35, effect: "+pop growth, +trade contacts" },
    ],
  },
  {
    id: "factionInfra",
    label: "FACTION MGMT",
    icon: "users",
    buildings: [
      { key: "factionEmbassyComplex", label: "FACTION EMBASSY COMPLEX", description: "A neutral-ground diplomatic facility where faction representatives meet, negotiate, and occasionally threaten each other in air-conditioned comfort.", cost: 80000, steelCost: 85, effect: "-faction tension, +diplomacy" },
      { key: "civilWarBarricadeKit", label: "CIVIL WAR BARRICADE KITS", description: "Pre-positioned riot barriers and crowd control equipment. When faction violence erupts, these deploy in minutes instead of hours.", cost: 24000, steelCost: 55, effect: "-civil war damage, +response time" },
      { key: "factionIntelligenceOffice", label: "FACTION INTELLIGENCE OFFICE", description: "Where the city's spies compare notes about what the factions are planning. The filing system is chaos. The intelligence is priceless.", cost: 56000, steelCost: 30, effect: "+faction intel, -surprise events" },
      { key: "neutralZoneMarkets", label: "NEUTRAL ZONE MARKETS", description: "Trade areas where all factions can do business without killing each other. The rules are simple: no weapons, no grudges, no exceptions.", cost: 45000, steelCost: 40, effect: "+trade income, -faction unrest" },
      { key: "factionRehabCenters", label: "FACTION REHABILITATION", description: "Programs for citizens leaving faction life. New identity, new skills, new start. The success rate is about 60%. Better than nothing.", cost: 35000, steelCost: 20, effect: "-faction influence, +employment" },
      { key: "propagandaBroadcastHubs", label: "PROPAGANDA BROADCAST HUBS", description: "City-controlled media centers broadcasting the administration's preferred version of events. Truth is a flexible concept here.", cost: 29000, steelCost: 15, effect: "+loyalty, -unrest, +corruption" },
    ],
  },
  {
    id: "specialization",
    label: "SPECIALIZATION",
    icon: "star",
    buildings: [
      { key: "districtPlanningOffice", label: "DISTRICT PLANNING OFFICE", description: "Where bureaucrats decide what a district should become. Industrial? Commercial? Residential? The answer is usually whatever generates the most tax revenue.", cost: 48000, steelCost: 30, effect: "+specialization speed, +efficiency" },
      { key: "economicZoneSigns", label: "ECONOMIC ZONE SIGNAGE", description: "Giant illuminated signs declaring a district's purpose. Helps traders find the right area. Helps citizens know where they're not welcome.", cost: 13000, steelCost: 5, effect: "+trade efficiency in zone" },
      { key: "specializedWorkerHostels", label: "SPECIALIZED WORKER HOSTELS", description: "Housing specifically designed for workers in a district's specialty. Industrial districts get reinforced quarters. Commercial districts get uniform storage.", cost: 32000, steelCost: 40, effect: "+employment, +specialization bonus" },
      { key: "automatedLogisticsHubs", label: "AUTOMATED LOGISTICS HUBS", description: "AI-managed cargo routing that moves goods between specialized districts. The trucks never sleep. The algorithms never rest.", cost: 64000, steelCost: 70, effect: "+inter-district trade, +efficiency" },
      { key: "districtPrestigeMonuments", label: "DISTRICT PRESTIGE MONUMENTS", description: "Statues, fountains, and architectural statements declaring a district's importance. They cost a fortune and produce nothing. The citizens love them.", cost: 40000, steelCost: 55, effect: "+happiness, +prestige, +tourism" },
      { key: "classIntegrationCenters", label: "CLASS INTEGRATION CENTERS", description: "Facilities promoting interaction between citizen classes. The elites meet the workers. The workers meet the elites. Everyone is uncomfortable. Progress.", cost: 35000, steelCost: 20, effect: "-class tension, +happiness" },
    ],
  },
  {
    id: "seasonal",
    label: "SEASONAL DEFENSE",
    icon: "cloud-rain",
    buildings: [
      { key: "radiationShieldingPanels", label: "RADIATION SHIELDING PANELS", description: "Deployable shielding for building exteriors during rad-storm season. They're ugly, expensive, and the only thing between the population and a slow death.", cost: 45000, steelCost: 65, effect: "-rad storm damage, +safety" },
      { key: "acidRainDrainageSystems", label: "ACID RAIN DRAINAGE", description: "Specialized guttering and neutralization systems for acid precipitation. Without these, the rain eats the buildings. With them, it just eats the drains.", cost: 32000, steelCost: 40, effect: "-acid rain damage, +infra preservation" },
      { key: "dustStormBreakers", label: "DUST STORM BREAKERS", description: "Massive vertical barriers and air filtration walls positioned at the city's windward edges. They don't stop dust storms. They make them survivable.", cost: 56000, steelCost: 85, effect: "-dust storm damage, -disease risk" },
      { key: "seasonalEmergencyDepots", label: "SEASONAL EMERGENCY DEPOTS", description: "Pre-stocked supply caches positioned for rapid deployment during seasonal crises. Food, water, medical supplies, and body bags. Optimism.", cost: 24000, steelCost: 30, effect: "+emergency response, -seasonal casualties, +1,000 med capacity" },
      { key: "weatherMonitoringNetwork", label: "WEATHER MONITORING NETWORK", description: "Atmospheric sensors, satellite uplinks, and predictive AI giving 48-hour advance warning of seasonal events. Sometimes even accurate.", cost: 35000, steelCost: 20, effect: "+warning time, -surprise damage" },
    ],
  },
];

const SD_CATEGORY_MAP: Record<string, string> = {
  research: "GENE: RESEARCH",
  medical: "GENE: MEDICAL",
  cloning: "GENE: CLONING",
  social: "GENE: SOCIAL",
  civic: "GENE: CIVIC",
  enforcement: "GENE: ENFORCE",
  agriculture: "GENE: AGRI",
  military: "GENE: MILITARY",
  blacksite: "GENE: BLACKSITE",
  economic: "GENE: ECONOMIC",
};

const BB_CATEGORY_MAP: Record<string, string> = {
  propaganda: "BB: PROPAGANDA",
  "re-education": "BB: RE-EDUCATION",
  military: "BB: MILITARY",
  economic: "BB: ECONOMIC",
  surveillance: "BB: SURVEILLANCE",
  enforcement: "BB: ENFORCEMENT",
  censorship: "BB: CENSORSHIP",
  social: "BB: SOCIAL",
};

function buildBBCategories(): Category[] {
  // Big Brother addon buildings used to be split into 8 separate top-level
  // tabs (BB: PROPAGANDA, BB: SURVEILLANCE, etc.). Consolidated into a single
  // "BB" tab using the shared sub-filter mechanism — same pattern as SPACE
  // and GENE.
  const buildings: BuildingDef[] = BB_BUILDINGS.map((b) => {
    const sub = BB_CATEGORY_MAP[b.category] ?? b.category.toUpperCase();
    // Strip the "BB: " prefix so chips show just "PROPAGANDA",
    // "SURVEILLANCE", etc.
    const subcategory = sub.replace(/^BB:\s*/i, "");
    return {
      key: b.id,
      label: b.name.toUpperCase(),
      description: b.description,
      cost: b.baseCost,
      effect: `Operating cost: ${b.perTickCost} cr/tick`,
      subcategory,
    };
  });
  if (buildings.length === 0) return [];
  return [
    {
      id: "bb_program",
      label: "BB",
      icon: "eye",
      buildings,
    },
  ];
}

function buildSDCategories(): Category[] {
  // Sixth Day ("Gene") buildings used to be split into 10 separate top-level
  // tabs (GENE: RESEARCH, GENE: MEDICAL, etc.) which crowded the build menu.
  // Mirroring the SPACE consolidation pattern: collapse them into a single
  // "GENE" tab and expose the old categories as sub-filter chips via the
  // shared `subcategory` mechanism on BuildingDef.
  const buildings: BuildingDef[] = SD_BUILDINGS.map((b) => {
    const sub = SD_CATEGORY_MAP[b.category] ?? b.category.toUpperCase();
    // Strip the "GENE: " prefix so sub-filter chips show just "RESEARCH",
    // "MEDICAL", etc. — same compact style as the SPACE sub-filters.
    const subcategory = sub.replace(/^GENE:\s*/i, "");
    return {
      key: b.id,
      label: b.name.toUpperCase(),
      description: b.description,
      cost: b.baseCost,
      effect: `Operating cost: ${b.perTickCost} cr/tick`,
      subcategory,
    };
  });
  if (buildings.length === 0) return [];
  return [
    {
      id: "sd_gene",
      label: "GENE",
      icon: "git-branch",
      buildings,
    },
  ];
}

const BATCH_OPTIONS = [1, 5, 10, 50, 100] as const;

const CTX_ITEMS: { label: string; action: string; danger?: boolean }[] = [
  { label: "Select & Build", action: "select" },
];

function AutoConstructionPanel() {
  const { colors: tc } = useTheme();
  const acStyles = useAcStyles();
  const { state, toggleAutoConstruction, setAutoConstructionConfig } = useGame();
  const config = state.autoConstruction ?? { enabled: false, budgetPerTick: 50000, priorities: ["power", "water", "housing", "food"], lastBuildTick: 0 };
  const [expanded, setExpanded] = useState(false);
  const ALL_PRIORITIES: Array<"power" | "water" | "housing" | "food" | "security" | "health" | "infrastructure"> = ["power", "water", "housing", "food", "security", "health", "infrastructure"];
  const PRIORITY_LABELS: Record<string, string> = {
    power: "Power Grid", water: "Water Supply", housing: "Housing", food: "Food Production",
    security: "Security", health: "Healthcare", infrastructure: "Infrastructure",
  };
  const BUDGET_OPTIONS = [25000, 50000, 100000, 200000, 500000];

  const togglePriority = (p: typeof ALL_PRIORITIES[number]) => {
    const current = config.priorities ?? [];
    const next = current.includes(p) ? current.filter((x) => x !== p) : [...current, p];
    setAutoConstructionConfig({ priorities: next as any });
  };

  return (
    <View style={acStyles.container}>
      <Pressable onPress={() => setExpanded(!expanded)} style={acStyles.header}>
        <Feather name="cpu" size={12} color={config.enabled ? tc.accent : tc.textMuted} />
        <Text style={[acStyles.title, config.enabled && { color: tc.accent }]}>AUTO-CONSTRUCTION ADMINISTRATOR</Text>
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); toggleAutoConstruction(); }}
          style={[acStyles.toggleBtn, config.enabled && acStyles.toggleBtnActive]}
        >
          <Text style={[acStyles.toggleText, config.enabled && acStyles.toggleTextActive]}>
            {config.enabled ? "ON" : "OFF"}
          </Text>
        </Pressable>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={12} color={tc.textMuted} />
      </Pressable>
      {expanded && (
        <View style={acStyles.body}>
          <Text style={acStyles.sectionLabel}>BUDGET PER CYCLE</Text>
          <View style={acStyles.budgetRow}>
            {BUDGET_OPTIONS.map((amt) => (
              <Pressable
                key={amt}
                style={[acStyles.budgetBtn, { borderColor: tc.border }, config.budgetPerTick === amt && { backgroundColor: tc.accent + "20", borderColor: tc.accent }]}
                onPress={() => setAutoConstructionConfig({ budgetPerTick: amt })}
              >
                <Text style={[acStyles.budgetText, { color: tc.textMuted }, config.budgetPerTick === amt && { color: tc.accent }]}>
                  {amt >= 1000 ? `${amt / 1000}k` : amt}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={acStyles.sectionLabel}>PRIORITIES</Text>
          <View style={acStyles.priorityGrid}>
            {ALL_PRIORITIES.map((p) => {
              const active = (config.priorities ?? []).includes(p);
              return (
                <Pressable key={p} style={[acStyles.priorityChip, { borderColor: tc.border }, active && { borderColor: tc.accent, backgroundColor: tc.accent + "10" }]} onPress={() => togglePriority(p)}>
                  <Feather name={active ? "check-square" : "square"} size={10} color={active ? tc.accent : tc.textMuted} />
                  <Text style={[acStyles.priorityText, { color: tc.textMuted }, active && { color: tc.accent }]}>{PRIORITY_LABELS[p]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={acStyles.hint}>
            The administrator will automatically assess city needs and award construction contracts based on your priorities and budget allocation. Contracts are awarded every 2 game days.
          </Text>
        </View>
      )}
    </View>
  );
}

const useAcStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: { borderBottomWidth: 1, borderBottomColor: Colors.borderDim },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.bgSecondary },
  title: { flex: 1, color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 3, borderWidth: 1, borderColor: Colors.border, backgroundColor: "transparent" },
  toggleBtnActive: { backgroundColor: Colors.accent + "20", borderColor: Colors.accent },
  toggleText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  toggleTextActive: { color: Colors.accent },
  body: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.bgCard },
  sectionLabel: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 1.5, marginBottom: 6, marginTop: 4 },
  budgetRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  budgetBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 3, borderWidth: 1, borderColor: Colors.border },
  budgetBtnActive: { backgroundColor: Colors.accent + "20", borderColor: Colors.accent },
  budgetText: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 10 },
  budgetTextActive: { color: Colors.accent },
  priorityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  priorityChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 3, borderWidth: 1, borderColor: Colors.border },
  priorityChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "10" },
  priorityText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10 },
  priorityTextActive: { color: Colors.accent },
  hint: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15, opacity: 0.7 },
}));

function formatIO(entries: { name: string; qty: number }[]): string {
  return entries.length ? entries.map((e) => `${e.qty}× ${e.name}`).join(", ") : "nothing";
}
function cycleLabel(ticksPerCycle: number): string {
  return ticksPerCycle > 1 ? ` / ${ticksPerCycle} ticks` : " /tick";
}
function formatRecipeCompact(r: CivilianRecipeInfo): string {
  const ins = r.inputs.length ? formatIO(r.inputs) + " → " : "";
  return `${ins}${formatIO(r.outputs)}${cycleLabel(r.ticksPerCycle)}`;
}
function buildProductionText(recipes: CivilianRecipeInfo[]): string {
  if (recipes.length === 0) return "";
  const lines = recipes.map((r) => {
    const cyc = r.ticksPerCycle > 1 ? ` (every ${r.ticksPerCycle} ticks)` : " (per tick)";
    const workers = r.workersName
      ? `\n   Needs workers: ${r.workersName}\n   Output scales with assigned workers (about 0.5x understaffed to 2x fully staffed); inputs stay at the base rate.`
      : "";
    const ins = r.inputs.length ? formatIO(r.inputs) : "nothing";
    return `• ${r.name}${cyc}\n   In: ${ins}\n   Out: ${formatIO(r.outputs)}${workers}`;
  });
  const note = recipes.some((r) => r.workersName)
    ? "\n\nOutput shown is the base rate — it scales with assigned workers (about 0.5x understaffed, up to 2x fully staffed). Inputs are consumed at the base rate."
    : "";
  return `\n\nPRODUCTION (per building):\n${lines.join("\n")}${note}`;
}

type BuildingCardProps = {
  def: BuildingDef;
  count: number;
  // Task #500: copies of this building currently under construction.
  pending?: number;
  batchSize: number;
  credits: number;
  steel: number;
  units: Record<string, number>;
  stockpiles: Record<string, number>;
  highlighted?: boolean;
  disabled?: boolean;
  onPress: (def: BuildingDef) => void;
  onContextMenu?: (id: string, e: any) => void;
};

function getOperatingStatus(
  def: BuildingDef,
  count: number,
  units: Record<string, number>,
  stockpiles: Record<string, number>,
): { label: string; detail: string; tone: "danger" | "warning" | "info" } | null {
  if (count <= 0) return null;
  const recipes = getBuildingRecipes(def.key);
  if (recipes.length === 0) return null;

  for (const recipe of recipes) {
    if (recipe.workersKey && recipe.workersName) {
      const staffing = getProducerStaffing(
        {
          buildingKey: def.key,
          qty: recipe.outputs[0]?.qty ?? 0,
          workersKey: recipe.workersKey,
          workersName: recipe.workersName,
        },
        units,
        { [def.key]: count },
      );
      if (staffing && staffing.workerCount <= 0) {
        return {
          label: "LIMITED — NO STAFF",
          detail: `Assign ${recipe.workersName} to bring this production line online.`,
          tone: "danger",
        };
      }
      if (staffing && staffing.multiplier < 1) {
        return {
          label: `LIMITED — ${Math.round(staffing.multiplier * 100)}% OUTPUT`,
          detail: `${recipe.workersName} staffing is below the base rate (${staffing.workerCount} assigned).`,
          tone: "warning",
        };
      }
    }

    const missingInput = recipe.inputs.find((input) => {
      const required = input.qty * count;
      return (stockpiles[input.id] ?? 0) < required;
    });
    if (missingInput) {
      const available = Math.max(0, stockpiles[missingInput.id] ?? 0);
      const required = missingInput.qty * count;
      return {
        label: `LIMITED — ${resourceDisplayName(missingInput.id).toUpperCase()} INPUT`,
        detail: `${resourceDisplayName(missingInput.id)} stockpile ${Math.floor(available)}/${Math.floor(required)} required for this cycle.`,
        tone: "warning",
      };
    }
  }

  const staffedRecipe = recipes.find((recipe) => recipe.workersKey && recipe.workersName);
  if (staffedRecipe?.workersKey && staffedRecipe.workersName) {
    const staffing = getProducerStaffing(
      {
        buildingKey: def.key,
        qty: staffedRecipe.outputs[0]?.qty ?? 0,
        workersKey: staffedRecipe.workersKey,
        workersName: staffedRecipe.workersName,
      },
      units,
      { [def.key]: count },
    );
    if (staffing && staffing.multiplier > 1) {
      return {
        label: `STAFFED — ${staffing.multiplier.toFixed(1)}× OUTPUT`,
        detail: `${staffedRecipe.workersName} are pushing this line above its base rate.`,
        tone: "info",
      };
    }
  }

  return {
    label: "OPERATING AT BASE RATE",
    detail: "Staffing and required inputs are currently available.",
    tone: "info",
  };
}

const BuildingCard = React.memo(function BuildingCard({ def, count, pending, batchSize, credits, steel, units, stockpiles, highlighted, disabled, onPress, onContextMenu }: BuildingCardProps) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  const totalCost = def.cost * batchSize;
  const totalSteel = (def.steelCost ?? 0) * batchSize;
  const canAfford = credits >= totalCost && (totalSteel === 0 || steel >= totalSteel);
  const recipes = getBuildingRecipes(def.key);
  const operatingStatus = getOperatingStatus(def, count, units, stockpiles);

  return (
    <Pressable
      testID={`construction-building-${def.key}`}
      accessibilityLabel={`Building ${def.key}`}
      style={({ pressed }) => [
        styles.buildingCard,
        { backgroundColor: tc.bgCard, borderColor: tc.border },
        !canAfford && styles.buildingCardMuted,
        highlighted && [styles.buildingCardHighlighted, { borderColor: tc.accent, backgroundColor: tc.bgSecondary }],
        pressed && !disabled && styles.buildingCardPressed,
        disabled && { opacity: 0.65 },
      ]}
      disabled={disabled}
      onPress={() => onPress(def)}
      {...(Platform.OS === "web" && onContextMenu ? { onContextMenu: (e: any) => onContextMenu(def.key, e) } : {})}
    >
      <View style={styles.buildingLeft}>
        <View style={[styles.buildingCount, { backgroundColor: tc.bgSecondary, borderColor: tc.borderDim }]}>
          <Text style={[styles.buildingCountText, { color: tc.textMuted }, count > 0 && { color: tc.accent }]}>
            ×{count}
          </Text>
        </View>
        <View style={styles.buildingInfo}>
          <Text style={[styles.buildingLabel, { color: tc.text }, !canAfford && { color: tc.textMuted }]}>
            {batchSize > 1 ? `${batchSize}× ` : ""}{def.label}
          </Text>
          <Text style={[styles.buildingEffect, { color: tc.statHigh }]}>{def.effect}</Text>
          {(pending ?? 0) > 0 && (
            <Text style={{ color: tc.warning, fontFamily: "Inter_600SemiBold", fontSize: 9, marginTop: 2, letterSpacing: 0.5 }}>
              {pending} UNDER CONSTRUCTION
            </Text>
          )}
          {operatingStatus && (
            <View style={styles.operatingStatus}>
              <Text
                style={[
                  styles.operatingStatusLabel,
                  { color: operatingStatus.tone === "danger" ? tc.danger : operatingStatus.tone === "warning" ? tc.warning : tc.info },
                ]}
              >
                {operatingStatus.label}
              </Text>
              <Text style={[styles.operatingStatusDetail, { color: tc.textMuted }]} numberOfLines={1}>
                {operatingStatus.detail}
              </Text>
            </View>
          )}
          {recipes.length > 0 && (
            <Text style={[styles.buildingProd, { color: tc.info }]} numberOfLines={2}>
              {recipes.length === 1
                ? formatRecipeCompact(recipes[0])
                : `Runs ${recipes.length} production recipes — tap for details`}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.buildingRight}>
        <Text style={[styles.buildingCost, { color: tc.accent }, !canAfford && { color: tc.textMuted }]}>
          {totalCost >= 1000 ? `${(totalCost / 1000).toFixed(0)}k` : totalCost} cr
        </Text>
        {totalSteel > 0 && (
          <Text style={[styles.buildingSteel, { color: tc.info }, steel < totalSteel && { color: tc.textMuted }]}>
            {totalSteel} steel
          </Text>
        )}
        <Feather
          name="plus-circle"
          size={18}
          color={canAfford ? tc.accent : tc.borderDim}
        />
      </View>
    </Pressable>
  );
});

// Whether the wide-layout category strip is expanded to the full wrapped grid.
// Module-level so the player's choice sticks for the session (screen remounts
// on tab switches) without persisting to disk.
let wideCatsExpandedDefault = false;

function ConstructionScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { state: rawState, buildConstruction } = useGame();
  const { showToast } = useToast();
  const state = useThrottledValue(rawState, 500);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  // A deep-link (e.g. a biosphere recovery suggestion) can request an initial
  // category via the `category` route param.
  const params = useLocalSearchParams<{ category?: string; highlight?: string; hl?: string }>();
  const paramCategory =
    typeof params.category === "string" && params.category ? params.category : null;
  // A deep-link may also name a single building to land on and emphasize.
  const paramHighlight =
    typeof params.highlight === "string" && params.highlight ? params.highlight : null;
  // Each biosphere suggestion tap carries a fresh nonce, allowing identical
  // category/highlight params to retrigger their deep-link effects.
  const paramHighlightNonce =
    typeof params.hl === "string" && params.hl ? params.hl : null;
  const [activeCat, setActiveCat] = useState(paramCategory ?? "energy");
  const [batchSize, setBatchSize] = useState<number>(1);
  const [showStats, setShowStats] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const { modal, showModal, hideModal } = useGameModal();
  const tabScrollRef = useHorizontalWheelScroll();
  const subFilterScrollRef = useHorizontalWheelScroll();
  const listRef = useRef<FlatList<BuildingDef>>(null);
  // Wide layouts: the full category grid eats 5-6 rows of vertical space, so it
  // starts collapsed to a single scrollable row and the player can expand it.
  const [catsExpanded, setCatsExpandedState] = useState(wideCatsExpandedDefault);
  const setCatsExpanded = useCallback((v: boolean) => {
    wideCatsExpandedDefault = v;
    // Chip x-positions recorded in the wrapped grid are meaningless in the
    // single scroll row; drop them so the scroll-into-view effect only ever
    // uses fresh measurements from the collapsed strip.
    if (!v) tabXRef.current = {};
    // Collapsing must always scroll the active chip into view, even if the
    // last category change came from a chip press.
    skipTabAutoScrollRef.current = false;
    setCatsExpandedState(v);
  }, []);
  // Instance handle for the collapsed strip so the active category chip can be
  // scrolled into view; composed with the wheel-scroll callback ref above.
  const tabSvRef = useRef<ScrollView | null>(null);
  const attachTabSv = useCallback((sv: ScrollView | null) => {
    tabSvRef.current = sv;
    tabScrollRef(sv);
  }, [tabScrollRef]);
  const tabXRef = useRef<Record<string, number>>({});
  // A chip the player just pressed was necessarily visible, so the
  // scroll-into-view effect should not snap the strip afterwards; hotkey
  // cycling and deep-links (which can select off-screen chips) still scroll.
  const skipTabAutoScrollRef = useRef(false);
  // The building a deep-link asked us to land on: scrolled into view and briefly
  // emphasized, then cleared so the glow does not linger.
  const [highlightKey, setHighlightKey] = useState<string | null>(paramHighlight);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The confirmation modal dismisses immediately, so keep an imperative guard
  // at the spend point as well as the visible cooldown for the build cards.
  const [buildCooldown, setBuildCooldown] = useState(false);
  const buildCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildGuardRef = useRef(false);
  useEffect(() => () => {
    if (buildCooldownTimer.current) clearTimeout(buildCooldownTimer.current);
  }, []);

  const { registerSubTabs, unregisterSubTabs } = useHotkeys();

  const sdActive = isSixthDayActive(state.addons);
  const bbActive = isBigBrotherActive(state.addons);
  const allCategories = useMemo(() => [
    ...CATEGORIES,
    ...(sdActive ? buildSDCategories() : []),
    ...(bbActive ? buildBBCategories() : []),
  ], [sdActive, bbActive]);

  const { resources: r, buildings: b } = state;
  const cat = allCategories.find((c) => c.id === activeCat) ?? allCategories[0];

  const [ctx, setCtx] = useState<{ visible: boolean; position: { x: number; y: number }; id: string | null }>(
    { visible: false, position: { x: 0, y: 0 }, id: null }
  );
  const openCtx = useCallback((id: string, e: any) => {
    if (Platform.OS !== "web") return;
    e?.preventDefault?.();
    const x = e?.nativeEvent?.pageX ?? e?.pageX ?? 0;
    const y = e?.nativeEvent?.pageY ?? e?.pageY ?? 0;
    setCtx({ visible: true, position: { x, y }, id });
  }, []);
  const closeCtx = useCallback(() => setCtx((c) => ({ ...c, visible: false })), []);

  useEffect(() => {
    if (!allCategories.find((c) => c.id === activeCat)) {
      setActiveCat(allCategories[0].id);
      setSubFilter(null);
    }
  }, [allCategories, activeCat]);

  // Re-focus the requested category when a deep-link changes the param while this
  // screen is already mounted (expo-router keeps tab screens alive).
  useEffect(() => {
    if (paramCategory) {
      setActiveCat(paramCategory);
      setSubFilter(null);
    }
  }, [paramCategory, paramHighlightNonce]);

  // A deep-link naming a specific building: clear any narrowing filters so the
  // card is guaranteed to be in the list, emphasize it, then auto-clear the
  // emphasis so the glow does not linger.
  useEffect(() => {
    if (!paramHighlight) return;
    setHighlightKey(paramHighlight);
    setSubFilter(null);
    setSearchQuery("");
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightKey(null), 2600);
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, [paramHighlight, paramHighlightNonce]);

  useEffect(() => {
    const keys = allCategories.map((c) => c.id);
    const idx = keys.indexOf(activeCat);
    registerSubTabs({
      prev: () => setActiveCat(keys[idx > 0 ? idx - 1 : keys.length - 1]),
      next: () => setActiveCat(keys[idx < keys.length - 1 ? idx + 1 : 0]),
    });
    return () => unregisterSubTabs();
  }, [activeCat, allCategories, registerSubTabs, unregisterSubTabs]);

  const handleBuild = useCallback((def: BuildingDef) => {
    // Task #500: flat per-category build time. The context-menu path can hand
    // us a building from any category, so resolve it from the def itself.
    const categoryId = allCategories.find((c) => c.buildings.some((bd) => bd.key === def.key))?.id;
    const preview = validateCityConstructionBatch(rawState, {
      cost: def.cost,
      steelCost: def.steelCost ?? 0,
      count: batchSize,
    });
    if (preview.allowedCount <= 0) {
      showModal("BUILD QUEUED BLOCKED", [
        `Requested: ${batchSize} buildings`,
        `Timed orders: ${preview.queueLength}/${MAX_PENDING_CONSTRUCTION_ORDERS}`,
        ...preview.reasons.map((reason) => `• ${reason}`),
      ].join("\n"), [{ text: "OK", style: "cancel" }]);
      return;
    }

    const effectiveCount = preview.allowedCount;
    const totalCost = def.cost * effectiveCount;
    const totalSteel = (def.steelCost ?? 0) * effectiveCount;
    const buildTicks = getConstructionTicks("city", def.key, categoryId, rawState);
    const housingPreview = computeHousingCapacityBreakdown({ [def.key]: effectiveCount });
    const capacityGain = housingPreview.permanent + housingPreview.emergency;
    const costLine = totalSteel > 0
      ? `${totalCost.toLocaleString()} cr + ${totalSteel} steel`
      : `${totalCost.toLocaleString()} cr`;
    const queueLine = `Timed orders: ${preview.queueLength}/${MAX_PENDING_CONSTRUCTION_ORDERS} → ${preview.queueLength + 1}/${MAX_PENDING_CONSTRUCTION_ORDERS} (this batch uses 1 slot)`;
    const reductionLine = effectiveCount < batchSize
      ? `Requested ${batchSize}, reduced to ${effectiveCount} by ${preview.reasons.join(" ")}`
      : `Requested quantity: ${effectiveCount}`;
    const capacityLine = capacityGain > 0
      ? `Housing capacity: +${capacityGain.toLocaleString()} after completion`
      : "Housing capacity: no direct gain";

    const buttons: Parameters<typeof showModal>[2] = [
      { text: "CANCEL", style: "cancel" },
      {
        text: `BUILD ${effectiveCount}`,
        style: "destructive",
        onPress: () => {
          if (buildCooldown || buildGuardRef.current) return;
          buildGuardRef.current = true;
          playHaptic("light");
          const success = buildConstruction(def.key, def.cost, effectiveCount, def.steelCost ?? 0, categoryId);
          if (!success) {
            // Failed orders keep the existing retryable failure path.
            buildGuardRef.current = false;
            showModal("BUILD FAILED", "Insufficient resources.", [{ text: "OK", style: "cancel" }]);
            return;
          }
          const spentLine = totalSteel > 0
            ? `${totalCost.toLocaleString()}c + ${totalSteel} steel`
            : `${totalCost.toLocaleString()}c`;
          showToast(`BUILD ${effectiveCount}× ${def.label} — ${spentLine} spent`, "success");
          playHaptic("medium");
          setBuildCooldown(true);
          buildCooldownTimer.current = setTimeout(() => {
            setBuildCooldown(false);
            buildGuardRef.current = false;
          }, 650);
        },
      },
    ];
    showModal(
      `CONSTRUCT ${effectiveCount}x ${def.label}`,
      `${reductionLine}\n${queueLine}\n${capacityLine}\nCost: ${costLine}\nBuild time: ${buildTicks} ticks — all ${effectiveCount} complete together\n\nEffect: ${def.effect}${buildProductionText(getBuildingRecipes(def.key))}`,
      buttons,
    );
  }, [batchSize, rawState, showModal, buildConstruction, allCategories, buildCooldown, showToast]);

  const onCtxAction = useCallback((action: string) => {
    const id = ctx.id;
    setCtx((c) => ({ ...c, visible: false }));
    if (!id) return;
    if (action === "select") {
      const def = allCategories.flatMap((c) => c.buildings).find((bd) => bd.key === id);
      if (def) handleBuild(def);
    }
  }, [ctx.id, allCategories, handleBuild]);

  // Task #531: a non-empty query searches ALL categories/subcategories at
  // once (results carry their category so players learn where things live);
  // clearing it returns to the untouched activeCat/subFilter browsing view.
  const searching = searchQuery.trim().length > 0;
  const filteredBuildings = useMemo<ListedBuilding[]>(() => {
    if (searching) return searchAllBuildings(allCategories, searchQuery);
    return filterCategoryBuildings(cat.buildings, subFilter);
  }, [searching, searchQuery, allCategories, cat.buildings, subFilter]);

  // Scroll the emphasized card into view once the list reflects its category.
  useEffect(() => {
    if (!highlightKey) return;
    const idx = filteredBuildings.findIndex((bd) => bd.key === highlightKey);
    if (idx < 0) return;
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.25, animated: true });
      } catch {
        // Ignored — onScrollToIndexFailed handles rows that aren't measured yet.
      }
    }, 250);
    return () => clearTimeout(t);
  }, [highlightKey, filteredBuildings, paramHighlightNonce]);

  const browseSearchResultCategory = useCallback((def: ListedBuilding) => {
    if (!def.catId) return;
    playSound("navigate");
    playHaptic("light");
    skipTabAutoScrollRef.current = false;
    setActiveCat(def.catId);
    setSubFilter(def.subcategory ?? null);
    setSearchQuery("");
    setHighlightKey(def.key);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightKey(null), 2600);
  }, []);

  // Task #500: in-flight orders. City orders badge their building card and
  // every order (city + military) is listed in the UNDER CONSTRUCTION panel.
  const pendingList = state.pendingConstructions ?? [];
  const railCorridors = state.railCorridors ?? [];
  const eligibleEndpoints = getEligibleRailEndpoints(state);
  const railDiag = getRailNetworkDiagnostics(state);
  const { cancelRailCorridor, configureRailCorridorStaffing, resumeRailCorridor } = useGameActions();
  const DAY_TICKS = Math.max(1, Math.round(24 * 60 / (state.tickIntervalMinutes || 15)));
  const YEAR_TICKS = DAY_TICKS * 365;
  const pendingByKey = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of pendingList) {
      if (p.kind === "city") m[p.buildingKey] = (m[p.buildingKey] ?? 0) + p.count;
    }
    return m;
  }, [pendingList]);

  const { colors: tc } = useTheme();
  const { width: winWidth } = useWindowDimensions();
  // On wide layouts (desktop/tablet web) the category and subcategory chips
  // wrap into rows so everything is visible at a glance; small screens keep
  // the existing horizontal scroll structure.
  const isWide = winWidth >= 640;

  // Keep the selected category chip visible in the collapsed wide strip —
  // hotkey/gamepad cycling and deep-links can select an off-screen category.
  // Two attempts because chip onLayout timing after a collapse remount is not
  // deterministic on web; the second pass sees the settled positions.
  useEffect(() => {
    if (!isWide || catsExpanded) return;
    if (skipTabAutoScrollRef.current) {
      skipTabAutoScrollRef.current = false;
      return;
    }
    const attempt = () => {
      const x = tabXRef.current[activeCat];
      if (typeof x === "number") {
        tabSvRef.current?.scrollTo({ x: Math.max(0, x - 60), animated: false });
      }
    };
    const t1 = setTimeout(attempt, 120);
    const t2 = setTimeout(attempt, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isWide, catsExpanded, activeCat]);

  const renderBuildingItem = useCallback(({ item: def }: { item: ListedBuilding }) => {
    const card = (
      <BuildingCard
        def={def}
        count={b[def.key] ?? 0}
        pending={pendingByKey[def.key] ?? 0}
        batchSize={batchSize}
        credits={r.credits}
        steel={r.steel}
        units={state.units}
        stockpiles={state.stockpiles}
        highlighted={def.key === highlightKey}
        disabled={buildCooldown}
        onPress={handleBuild}
        onContextMenu={openCtx}
      />
    );
    // Global search results carry a breadcrumb showing where the building
    // lives so players learn the category layout.
    if (!def.catLabel) return card;
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Browse ${def.catLabel}${def.subcategory ? `, ${def.subcategory}` : ""}`}
          onPress={() => browseSearchResultCategory(def)}
          style={({ pressed }) => [styles.searchCrumbRow, pressed && styles.searchCrumbRowPressed]}
        >
          <Feather name="corner-down-right" size={10} color={tc.textMuted} />
          <Text style={styles.searchCrumb}>
            {def.catLabel}{def.subcategory ? ` › ${def.subcategory}` : ""}
          </Text>
        </Pressable>
        {card}
      </View>
    );
  }, [b, pendingByKey, batchSize, r.credits, r.steel, state.units, state.stockpiles, handleBuild, openCtx, highlightKey, browseSearchResultCategory, styles, tc.textMuted]);

  const keyExtractor = useCallback((item: ListedBuilding) => item.key, []);

  const totalBuildings = useMemo(() => Object.values(b).reduce((a, c) => a + (typeof c === "number" ? c : 0), 0), [b]);

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: tc.bg }]}>
      <CommandScreenHeader
        icon="tool"
        title="CONSTRUCTION / INFRASTRUCTURE"
        subtitle={`${totalBuildings} structures online · authorize works below`}
      />

      {/* Resources strip */}
      <View style={[styles.resourceStrip, isWide && styles.rowTight]}>
        <ResourceChip icon="dollar-sign" label="CREDITS" value={formatNumber(r.credits)} />
        <ResourceChip icon="box" label="STEEL" value={Math.floor(r.steel).toString()} />
      </View>

      {/* Infrastructure Stats */}
      <Pressable onPress={() => setShowStats(!showStats)} style={[styles.statsToggle, isWide && styles.rowTight]}>
        <Feather name="bar-chart-2" size={12} color={tc.accent} />
        <Text style={[styles.statsToggleText, { color: tc.accent }]}>INFRASTRUCTURE STATS</Text>
        <Feather name={showStats ? "chevron-up" : "chevron-down"} size={12} color={tc.accent} />
      </Pressable>
      {showStats && (
        <View style={styles.statsPanel}>
          {allCategories.map((c) => {
            const count = c.buildings.reduce((a, bd) => a + (b[bd.key] ?? 0), 0);
            if (count === 0) return null;
            return (
              <View key={c.id} style={styles.statsRow}>
                <Feather name={c.icon as any} size={10} color={tc.textMuted} />
                <Text style={styles.statsLabel}>{c.label}</Text>
                <Text style={styles.statsValue}>{count}</Text>
              </View>
            );
          })}
          <View style={[styles.statsRow, { borderTopWidth: 1, borderTopColor: tc.border, paddingTop: 4, marginTop: 4 }]}>
            <Feather name="layers" size={10} color={tc.accent} />
            <Text style={[styles.statsLabel, { color: tc.accent }]}>TOTAL</Text>
            <Text style={[styles.statsValue, { color: tc.accent }]}>{totalBuildings}</Text>
          </View>
        </View>
      )}

      <AutoConstructionPanel />

      {/* Batch selector */}
      <View style={styles.batchRow}>
        <View style={styles.batchHeader}>
          <View style={styles.batchIcon}>
            <Feather name="layers" size={14} color={tc.accent} />
          </View>
          <View style={styles.batchHeaderCopy}>
            <Text style={[styles.batchLabel, { color: tc.accent }]}>BUILD QUANTITY</Text>
            <Text style={[styles.batchHint, { color: tc.textMuted }]}>
              Choose how many buildings each timed order adds (up to {MAX_CONSTRUCTION_BATCH}).
            </Text>
          </View>
          <Text style={[styles.batchSelected, { color: tc.accent }]}>
            {batchSize}× PER ORDER
          </Text>
        </View>
        <View style={styles.batchOptions}>
          {BATCH_OPTIONS.map((n) => {
            const selected = batchSize === n;
            return (
              <HoverTooltip key={n} text={`Build ${n} ${n === 1 ? "building" : "buildings"} at once`}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={`Build ${n} ${n === 1 ? "building" : "buildings"} per order`}
                  accessibilityHint="Select this construction quantity"
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  hitSlop={4}
                  style={[styles.batchBtn, selected && styles.batchBtnActive]}
                  onPress={() => setBatchSize(n)}
                >
                  <Text style={[styles.batchBtnText, selected && styles.batchBtnTextActive]}>
                    {n}
                  </Text>
                  <Text style={[styles.batchBtnUnit, selected && styles.batchBtnUnitActive]}>
                    {n === 1 ? "BUILD" : "BUILDS"}
                  </Text>
                </Pressable>
              </HoverTooltip>
            );
          })}
        </View>
      </View>

      <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="SEARCH BUILDINGS..." />

      {/* Category tabs — wrap into rows on wide layouts, scroll on small */}
      {(() => {
        const tabEls = allCategories.map((cat) => {
          const catTotal = cat.buildings.reduce((a, bd) => a + (b[bd.key] ?? 0), 0);
          return (
            <Pressable
              key={cat.id}
              onLayout={(e) => { tabXRef.current[cat.id] = e.nativeEvent.layout.x; }}
              style={[styles.tab, { borderColor: tc.border }, activeCat === cat.id && { backgroundColor: tc.accent, borderColor: tc.accent }]}
              onPress={() => { if (activeCat !== cat.id) { playSound("navigate"); playHaptic("light"); } skipTabAutoScrollRef.current = true; setActiveCat(cat.id); setSubFilter(null); }}
            >
              <Feather
                name={cat.icon as any}
                size={12}
                color={activeCat === cat.id ? tc.bg : tc.textMuted}
              />
              <Text style={[styles.tabLabel, { color: tc.textMuted }, activeCat === cat.id && { color: tc.bg }]}>
                {cat.label}
              </Text>
              {catTotal > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{catTotal}</Text>
                </View>
              )}
            </Pressable>
          );
        });
        return isWide ? (
          <View style={[styles.tabBar, { backgroundColor: tc.bgSecondary }]}>
            {catsExpanded ? (
              <View style={styles.tabWrapInner}>{tabEls}</View>
            ) : (
              <ScrollView
                ref={attachTabSv}
                horizontal
                showsHorizontalScrollIndicator={Platform.OS === "web"}
                style={styles.tabScrollInner}
                contentContainerStyle={styles.tabContent}
              >
                {tabEls}
              </ScrollView>
            )}
            <HoverTooltip text={catsExpanded ? "Collapse categories to one row" : "Show every category at once"}>
              <Pressable
                style={[styles.tabToggle, { borderColor: tc.border, backgroundColor: tc.bgCard }]}
                onPress={() => { playSound("navigate"); playHaptic("light"); setCatsExpanded(!catsExpanded); }}
              >
                <Feather name={catsExpanded ? "chevron-up" : "chevron-down"} size={12} color={tc.accent} />
                <Text style={[styles.tabToggleText, { color: tc.accent }]}>
                  {catsExpanded ? "COLLAPSE" : "SHOW ALL"}
                </Text>
              </Pressable>
            </HoverTooltip>
          </View>
        ) : (
          <ScrollView
            ref={tabScrollRef}
            horizontal
            showsHorizontalScrollIndicator={Platform.OS === "web"}
            style={[styles.tabScroll, { backgroundColor: tc.bgSecondary }]}
            contentContainerStyle={styles.tabContent}
          >
            {tabEls}
          </ScrollView>
        );
      })()}

      {/* Building list */}
      <FlatList
        ref={listRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={Platform.OS === "web"}
        data={filteredBuildings}
        keyExtractor={keyExtractor}
        renderItem={renderBuildingItem}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        onScrollToIndexFailed={(info) => {
          // The target row isn't measured yet — jump to an estimate, then retry.
          listRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: false,
          });
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.25, animated: true });
            } catch {
              // Give up quietly if the row still can't be resolved.
            }
          }, 150);
        }}
        ListHeaderComponent={
          <>
            <OnboardingBanner step="build" />
            <TutorialHint
              id="construction_intro"
              message="Build infrastructure to grow your city. Each building costs credits (and sometimes steel). Use the batch selector to build multiple at once."
            />
            {!searching && activeCat === "housing" && (
              <HousingCapacitySummary state={state} />
            )}

            {(railCorridors.filter(r => r.status === "under_construction" || r.status === "disrupted" || r.status === "consent_pending").length > 0 || eligibleEndpoints.length > 0) && (
              <View style={{ borderWidth: 1, borderColor: tc.border, backgroundColor: tc.bgCard, borderRadius: 6, padding: 10, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <MaterialCommunityIcons name="train" size={12} color={tc.info} />
                  <Text style={{ color: tc.info, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>
                    RAIL CORRIDOR PROGRAM
                  </Text>
                </View>
                {railCorridors.filter(r => r.status === "under_construction" || r.status === "disrupted" || r.status === "consent_pending").map((r) => {
                  const yearsRem = ((r.totalTicks - r.progressTicks) / YEAR_TICKS).toFixed(1);
                  const frac = r.totalTicks > 0 ? r.progressTicks / r.totalTicks : 0;
                  const targetName = state.externalMegacities?.find(m => m.id === r.endpointId)?.name || state.townships?.find(t => t.id === r.endpointId)?.name || r.endpointId;
                  const caps = getRailCorridorCapabilities(state, r);
                  const isPassenger = caps.includes("passenger");
                  const isFreight = caps.includes("freight");

                  return (
                    <View key={r.id} style={{ marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: tc.border }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <Text style={{ color: tc.text, fontFamily: "Inter_600SemiBold", fontSize: 10 }} numberOfLines={1}>
                          CORRIDOR TO {targetName.toUpperCase()}
                        </Text>
                        {r.status === "under_construction" && (
                          <Text style={{ color: tc.textMuted, fontFamily: "Inter_500Medium", fontSize: 10 }}>
                            {yearsRem} years left ({Math.floor(frac * 100)}%)
                          </Text>
                        )}
                        {r.status === "consent_pending" && (
                          <Text style={{ color: tc.warning, fontFamily: "Inter_500Medium", fontSize: 10 }}>
                            PENDING
                          </Text>
                        )}
                      </View>

                      {r.status === "under_construction" && (
                        <Text style={{ color: tc.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, marginBottom: 6 }}>
                          PROGRESS: {r.progressTicks.toLocaleString()} / {r.totalTicks.toLocaleString()} TICKS
                        </Text>
                      )}

                      {r.status === "under_construction" && (
                        <View style={{ height: 4, backgroundColor: tc.bgSecondary, borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
                          <View style={{ height: 4, width: `${Math.min(100, Math.max(0, Math.floor(frac * 100)))}%`, backgroundColor: tc.info, borderRadius: 2 }} />
                        </View>
                      )}



                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ color: tc.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, marginBottom: 4 }}>REQUIRED JOBS VS ASSIGNED CREW</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                          {(() => {
                            const diag = railDiag.staffing.find(s => s.corridorId === r.id);
                            // If diagnostics don't have it (e.g. pending), just compute it inline
                            const staffedJobs = diag ? diag.staffedJobs : { ...r.staffing, railWorkers: r.staffing.railWorkers + r.staffing.robots };
                            const requiredJobs = diag ? diag.requiredJobs : STANDARD_RAIL_CREW;
                            return (Object.keys(requiredJobs) as (keyof typeof requiredJobs)[]).map(role => {
                              const reqCount = requiredJobs[role];
                              if (reqCount === 0 && role !== "robots") return null; // Only show roles with requirements, robots shown if staffed
                              if (reqCount === 0 && role === "robots") {
                                if (r.staffing.robots > 0) {
                                  return (
                                    <View key={role} style={{ backgroundColor: tc.bgElevated, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, borderWidth: 1, borderColor: tc.border }}>
                                      <Text style={{ color: tc.textSecondary, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.5 }}>
                                        ROBOTS: {r.staffing.robots}
                                      </Text>
                                    </View>
                                  );
                                }
                                return null;
                              }

                              const assigned = r.staffing[role];
                              // Display logic: show actual assigned vs required, but highlight isShort based on staffedJobs (which includes robots for railWorkers)
                              const isShort = staffedJobs[role] < reqCount;

                              return (
                                <View key={role} style={{ backgroundColor: isShort ? tc.warning + "20" : tc.bgElevated, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, borderWidth: 1, borderColor: isShort ? tc.warning : tc.border }}>
                                  <Text style={{ color: isShort ? tc.warning : tc.textSecondary, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.5 }}>
                                    {role.toUpperCase()}: {assigned} / {reqCount}
                                  </Text>
                                </View>
                              );
                            });
                          })()}
                        </View>
                        {(() => {
                           const diag = railDiag.staffing.find(s => s.corridorId === r.id);
                           if (diag && diag.shortages.length > 0) {
                             return (
                               <Text style={{ color: tc.warning, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 4 }}>
                                 Shortages: {diag.shortages.map(s => `${s.role} (${s.missing} missing)`).join(", ")}
                               </Text>
                             );
                           }
                           return null;
                        })()}
                      </View>


                      {r.status === "disrupted" && (
                        <Text style={{ color: tc.danger, fontFamily: "Inter_500Medium", fontSize: 9, marginBottom: 6 }}>
                          Disrupted: {r.reason?.replace(/_/g, " ")}
                        </Text>
                      )}
                      {r.setbackTicks > 0 && r.status === "under_construction" && (
                        <Text style={{ color: tc.warning, fontFamily: "Inter_500Medium", fontSize: 9, marginBottom: 6 }}>
                          Setbacks delayed construction by {r.setbackTicks} ticks
                        </Text>
                      )}

                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                        <Pressable
                          onPress={() => {
                            const res = configureRailCorridorStaffing(r.id, STANDARD_RAIL_CREW);
                            if (res.ok) showToast("Standard crew assigned.", "success");
                            else showToast(`Failed to assign crew: ${res.reason.replace(/_/g, " ")}`, "danger");
                          }}
                          style={({pressed}) => [{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: tc.bgElevated, borderRadius: 3, borderWidth: 1, borderColor: tc.border }, pressed && { opacity: 0.7 }]}
                        >
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: tc.text }}>ASSIGN STANDARD CREW</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            const res = configureRailCorridorStaffing(r.id, AUTOMATED_RAIL_CREW);
                            if (res.ok) showToast("Automated crew assigned.", "success");
                            else showToast(`Failed to assign automated crew: ${res.reason.replace(/_/g, " ")}`, "danger");
                          }}
                          style={({pressed}) => [{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: tc.bgElevated, borderRadius: 3, borderWidth: 1, borderColor: tc.border }, pressed && { opacity: 0.7 }]}
                        >
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: tc.text }}>ASSIGN AUTOMATED CREW</Text>
                        </Pressable>
                        {r.status === "disrupted" && (
                          <Pressable
                            onPress={() => {
                              const res = resumeRailCorridor(r.id);
                              if (res.ok) showToast("Corridor construction resumed.", "success");
                              else showToast(`Failed to resume: ${res.reason.replace(/_/g, " ")}`, "danger");
                            }}
                            style={({pressed}) => [{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: tc.info + "20", borderRadius: 3, borderWidth: 1, borderColor: tc.info + "40" }, pressed && { opacity: 0.7 }]}
                          >
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: tc.info }}>RESUME CORRIDOR</Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => cancelRailCorridor(r.id)}
                          style={({pressed}) => [{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: tc.danger + "20", borderRadius: 3, borderWidth: 1, borderColor: tc.danger + "40" }, pressed && { opacity: 0.7 }]}
                        >
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: tc.danger }}>CANCEL</Text>
                        </Pressable>
                      </View>

                    </View>
                  );
                })}
                <View style={{ marginTop: 4 }}>
                  <Text style={{ color: tc.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 9, marginBottom: 6 }}>ELIGIBLE ENDPOINTS</Text>
                  {eligibleEndpoints.length === 0 ? (
                    <Text style={{ color: tc.textSecondary, fontFamily: "Inter_400Regular", fontSize: 9 }}>No controlled or allied settlements available.</Text>
                  ) : (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                      {eligibleEndpoints.map(e => (
                        <View key={e.id} style={{ backgroundColor: tc.bgElevated, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3, borderWidth: 1, borderColor: tc.border }}>
                          <Text style={{ color: tc.text, fontFamily: "Inter_500Medium", fontSize: 9 }}>{e.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}

            {pendingList.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: tc.border, backgroundColor: tc.bgCard, borderRadius: 6, padding: 10, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Feather name="clock" size={12} color={tc.warning} />
                  <Text style={{ color: tc.warning, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>
                    UNDER CONSTRUCTION
                  </Text>
                </View>
                {pendingList.map((p) => {
                  const done = p.ticksTotal - p.ticksRemaining;
                  const frac = p.ticksTotal > 0 ? done / p.ticksTotal : 0;
                  return (
                    <View key={p.id} style={{ marginBottom: 7 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: tc.text, fontFamily: "Inter_600SemiBold", fontSize: 10 }} numberOfLines={1}>
                          {p.count > 1 ? `${p.count}x ` : ""}{p.label}{p.kind === "military" ? " — MILITARY" : ""}
                        </Text>
                        <Text style={{ color: tc.textMuted, fontFamily: "Inter_500Medium", fontSize: 10 }}>
                          {p.ticksRemaining} {p.ticksRemaining === 1 ? "tick" : "ticks"} left
                        </Text>
                      </View>
                      <View style={{ height: 4, backgroundColor: tc.bgSecondary, borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
                        <View style={{ height: 4, width: `${Math.min(100, Math.max(4, Math.round(frac * 100)))}%`, backgroundColor: tc.warning, borderRadius: 2 }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {searching ? (
              <SectionHeader
                title="SEARCH RESULTS"
                subtitle={`${filteredBuildings.length} ${filteredBuildings.length === 1 ? "match" : "matches"} across all categories`}
                icon={<Feather name="search" size={14} color={tc.accent} />}
              />
            ) : (
              <>
                <SectionHeader
                  title={cat.label + " INFRASTRUCTURE"}
                  subtitle={`${cat.buildings.length} structures — tap to build`}
                  icon={<Feather name="layers" size={14} color={tc.accent} />}
                />
                {cat.buildings.some(bd => bd.subcategory) && (() => {
                  const subs = Array.from(new Set(cat.buildings.map(bd => bd.subcategory).filter(Boolean))) as string[];
                  const chips = (
                    <>
                      <Pressable onPress={() => { if (subFilter !== null) { playSound("navigate"); playHaptic("light"); } setSubFilter(null); }} style={[styles.subFilterChip, !subFilter && styles.subFilterChipActive]}>
                        <Text style={[styles.subFilterText, !subFilter && styles.subFilterTextActive]}>ALL ({cat.buildings.length})</Text>
                      </Pressable>
                      {subs.map(sub => {
                        const count = cat.buildings.filter(bd => bd.subcategory === sub).length;
                        return (
                          <Pressable key={sub} onPress={() => { playSound("navigate"); playHaptic("light"); setSubFilter(subFilter === sub ? null : sub); }} style={[styles.subFilterChip, subFilter === sub && styles.subFilterChipActive]}>
                            <Text style={[styles.subFilterText, subFilter === sub && styles.subFilterTextActive]}>{sub} ({count})</Text>
                          </Pressable>
                        );
                      })}
                    </>
                  );
                  return isWide ? (
                    <View style={styles.subFilterWrapRow}>{chips}</View>
                  ) : (
                    <ScrollView ref={subFilterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.subFilterRow}>
                      {chips}
                    </ScrollView>
                  );
                })()}
              </>
            )}
          </>
        }
        ListFooterComponent={<View style={{ height: 30 }} />}
      />
      <GameModal {...modal} onDismiss={hideModal} />
      <ContextMenu visible={ctx.visible} position={ctx.position} items={CTX_ITEMS} onSelect={onCtxAction} onDismiss={closeCtx} />
    </View>
  );
}

function ResourceChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { colors: tc } = useTheme();
  const chipStyles = useChipStyles();
  return (
    <View style={[chipStyles.chip, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
      <Feather name={icon as any} size={11} color={tc.accent} />
      <Text style={[chipStyles.label, { color: tc.textMuted }]}>{label}</Text>
      <Text style={[chipStyles.value, { color: tc.accent }]}>{value}</Text>
    </View>
  );
}

const useChipStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.bgCard,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.8 },
  value: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 13, marginLeft: "auto" },
}));

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
     paddingHorizontal: Platform.OS === "web" ? 12 : 16,
     paddingVertical: Platform.OS === "web" ? 8 : 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5, flex: 1 },
  headerCount: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  resourceStrip: {
    flexDirection: "row",
    gap: 8,
     paddingHorizontal: Platform.OS === "web" ? 12 : 16,
    paddingVertical: Platform.OS === "web" ? 5 : 8,
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
  },
  subFilterRow: { flexDirection: "row", gap: 6, marginBottom: Platform.OS === "web" ? 8 : 12, paddingHorizontal: 2 },
  subFilterWrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: Platform.OS === "web" ? 8 : 12, paddingHorizontal: 2 },
  searchCrumbRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3, paddingHorizontal: 2 },
  searchCrumbRowPressed: { opacity: 0.6 },
  searchCrumb: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8 },
  subFilterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgSecondary },
  subFilterChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  subFilterText: { fontFamily: "Inter_700Bold", fontSize: 8, color: Colors.textMuted, letterSpacing: 0.5 },
  subFilterTextActive: { color: Colors.accent },
  tabScroll: { maxHeight: 44, backgroundColor: Colors.bgSecondary },
  tabBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.bgSecondary,
  },
  tabWrapInner: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tabScrollInner: { flex: 1, maxHeight: 40 },
  tabToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 6,
    marginRight: 12,
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  tabToggleText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
    color: Colors.accent,
  },
  tabContent: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  tabActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  tabLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  tabLabelActive: { color: Colors.bg },
  tabBadge: {
    backgroundColor: Colors.danger,
    borderRadius: 8,
    minWidth: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  tabBadgeText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 8 },
  scroll: { flex: 1 },
  // Wide layouts trim vertical padding on the fixed rows above the building
  // list so the list itself gets the reclaimed height.
  rowTight: { paddingVertical: 4 },
   content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 6 : 12, paddingBottom: 20 },
  buildingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
     padding: Platform.OS === "web" ? 10 : 12,
    marginBottom: 8,
    gap: 10,
  },
  buildingCardMuted: {
    opacity: 0.5,
  },
  buildingCardHighlighted: {
    borderWidth: 2,
    shadowColor: Colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  buildingCardPressed: {
    backgroundColor: Colors.bgSecondary,
    borderColor: Colors.accent,
  },
  buildingLeft: { flex: 1, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  buildingCount: {
    width: 32,
    height: 32,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.borderDim,
    alignItems: "center",
    justifyContent: "center",
  },
  buildingCountText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 11 },
  buildingCountActive: { color: Colors.accent },
  buildingInfo: { flex: 1 },
  buildingLabel: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5, marginBottom: 2 },
  buildingEffect: { color: Colors.statHigh, fontFamily: "Inter_500Medium", fontSize: 10 },
  buildingProd: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 2 },
  operatingStatus: { marginTop: 5, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.borderDim },
  operatingStatusLabel: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.7 },
  operatingStatusDetail: { fontFamily: "Inter_400Regular", fontSize: 9, lineHeight: 12, marginTop: 1 },
  buildingRight: { alignItems: "flex-end", gap: 3 },
  buildingCost: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 12 },
  buildingSteel: { color: Colors.info, fontFamily: "Inter_500Medium", fontSize: 10 },
  mutedText: { color: Colors.textMuted },
  batchRow: {
     paddingHorizontal: Platform.OS === "web" ? 12 : 16,
     paddingVertical: Platform.OS === "web" ? 8 : 10,
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
  },
  batchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  batchIcon: {
    width: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  batchHeaderCopy: {
    flex: 1,
  },
  batchHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  batchSelected: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  batchOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  batchLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  batchBtn: {
    minWidth: 52,
    minHeight: 42,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
  },
  batchBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  batchBtnText: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    lineHeight: 15,
  },
  batchBtnTextActive: {
    color: Colors.bg,
  },
  batchBtnUnit: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 7,
    letterSpacing: 0.5,
    lineHeight: 9,
  },
  batchBtnUnitActive: {
    color: Colors.bg,
  },
  statsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
     paddingHorizontal: Platform.OS === "web" ? 12 : 16,
     paddingVertical: Platform.OS === "web" ? 5 : 6,
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
  },
  statsToggleText: {
    flex: 1,
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  statsPanel: {
     paddingHorizontal: Platform.OS === "web" ? 12 : 16,
     paddingVertical: Platform.OS === "web" ? 6 : 8,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  statsLabel: {
    flex: 1,
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  statsValue: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    minWidth: 40,
    textAlign: "right",
  },
}));

export default withScreenBoundary(ConstructionScreen, "construction");

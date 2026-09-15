import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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

import SectionHeader from "@/components/SectionHeader";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import CommunicationsBreakdownCard from "@/components/CommunicationsBreakdownCard";

type SpaceTab = "overview" | "launch" | "orbital" | "fleet" | "colonies";

const TABS: { key: SpaceTab; label: string; icon: string }[] = [
  { key: "overview", label: "OVERVIEW", icon: "globe" },
  { key: "launch", label: "LAUNCH OPS", icon: "send" },
  { key: "orbital", label: "ORBITAL", icon: "radio" },
  { key: "fleet", label: "FLEET", icon: "anchor" },
  { key: "colonies", label: "COLONIES", icon: "sun" },
];

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color: color ?? Colors.accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AssetRow({ label, count, status, statusColor }: { label: string; count: number; status: string; statusColor?: string }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.assetRow}>
      <View style={styles.assetLeft}>
        <Text style={styles.assetName}>{label}</Text>
        <Text style={[styles.assetStatus, { color: statusColor ?? Colors.textMuted }]}>{status}</Text>
      </View>
      <Text style={styles.assetCount}>{count}</Text>
    </View>
  );
}

function SpaceScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state } = useGameState();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const [tab, setTab] = useState<SpaceTab>("overview");
  const tabScrollRef = useHorizontalWheelScroll();

  const spaceStats = useMemo(() => {
    const b = state.buildings as Record<string, number>;
    const u = state.units as Record<string, number>;

    const launchPads = (b.testLaunchPad ?? 0) + (b.heavyLaunchPad ?? 0);
    const orbitalFacilities = (b.orbitalDockyard ?? 0) + (b.stationFabricationRing ?? 0) +
      (b.zeroGFactory ?? 0) + (b.orbitalSolarFarm ?? 0) + (b.orbitalWarehouse ?? 0) +
      (b.cargoTransferNode ?? 0) + (b.hullAssemblyFacility ?? 0);
    const habModules = (b.orbitalHabitatRing ?? 0) + (b.stationResidentialCore ?? 0) +
      (b.colonyStarterVault ?? 0) + (b.frontierHabComplex ?? 0);
    const defensePlatforms = (b.orbitalDefensePlatform ?? 0) + (b.pointDefenseGrid ?? 0) +
      (b.strategicWatchPlatform ?? 0);
    const navalPersonnel = (u.orbitalSecurityMarines ?? 0) + (u.boardingAssaultTeams ?? 0) +
      (u.vacuumCombatEngineers ?? 0) + (u.escortFlightCrews ?? 0) +
      (u.platformDefenseGunners ?? 0) + (u.fleetSecurityTroops ?? 0) +
      (u.orbitalRangers ?? 0) + (u.shuttleInfantry ?? 0) +
      (u.navalLogisticsCorps ?? 0) + (u.colonyDefenseCohorts ?? 0);
    const commsBuildings = (b.deepSignalTower ?? 0) + (b.satelliteUplinkHub ?? 0) +
      (b.orbitalTrackingCenter ?? 0) + (b.spaceTrafficControlCenter ?? 0);
    const scienceBuildings = (b.orbitalScienceInstitute ?? 0) + (b.astrometricsLab ?? 0) +
      (b.telescopeComplex ?? 0) + (b.deepResearchVault ?? 0);

    const spaceTechs = (state.unlockedTechnologies ?? []).filter((t: string) => {
      const prefixes = ["basic_rocket", "liquid_fuel", "guidance_comp", "heavy_launch",
        "reusable_booster", "multi_stage", "heavy_lift", "precision_orbital", "deep_launch",
        "modular_launch", "guided_strike", "long_range_missile", "precision_warhead",
        "hardened_launch", "interceptor_missile", "smart_defense", "orbital_strike_delivery",
        "anti_satellite", "fleet_missile", "strategic_deterrence",
        "basic_signal_sat", "weather_obs", "survey_sat", "navigation_sat", "recon_sat",
        "industrial_mon", "comms_relay", "early_warning", "defense_sat", "deep_space_probe",
        "orbital_dock", "station_core", "life_support_ring", "orbital_solar",
        "microgravity_fab", "orbital_repair", "orbital_weapons", "orbital_hab",
        "station_expansion", "autonomous_platform",
        "vacuum_materials", "orbital_foundries", "fuel_refinement", "zero_g_electronics",
        "orbital_robotics", "drone_servicer", "hull_fab", "deep_storage", "microgravity_pharma",
        "orbital_factory",
        "long_term_hab", "closed_loop", "radiation_shield", "colony_surface",
        "remote_construction", "extravehicular", "colonial_agriculture", "frontier_governance",
        "colony_security", "permanent_offworld",
        "orbital_security_doctrine", "shuttle_troop", "boarding_tactics", "station_defense_coord",
        "escort_craft", "fleet_logistics", "orbital_marine", "naval_gunnery",
        "patrol_squadron", "strategic_orbital",
        "planetary_survey", "radiation_mapping", "orbital_geology", "astro_chemical",
        "sensor_calibration", "signal_intelligence", "deep_vacuum_bio", "long_range_telescope",
        "gravitic_data", "frontier_science",
      ];
      return prefixes.some((p) => t.startsWith(p));
    }).length;

    return {
      launchPads,
      orbitalFacilities,
      habModules,
      defensePlatforms,
      navalPersonnel,
      commsBuildings,
      scienceBuildings,
      spaceTechs,
    };
  }, [state]);

  const renderOverview = () => (
    <>
      <SectionHeader title="Space Program Status" icon={<Feather name="globe" size={14} color={Colors.accent} />} />
      <View style={styles.statsGrid}>
        <StatBox label="LAUNCH PADS" value={spaceStats.launchPads} />
        <StatBox label="ORBITAL FAC" value={spaceStats.orbitalFacilities} />
        <StatBox label="HAB MODULES" value={spaceStats.habModules} />
        <StatBox label="DEF PLATFORMS" value={spaceStats.defensePlatforms} />
      </View>
      <View style={styles.statsGrid}>
        <StatBox label="NAVAL TROOPS" value={spaceStats.navalPersonnel} color={Colors.info} />
        <StatBox label="COMMS ARRAY" value={spaceStats.commsBuildings} color={Colors.info} />
        <StatBox label="SCIENCE INST" value={spaceStats.scienceBuildings} color={Colors.info} />
        <StatBox label="SPACE TECHS" value={spaceStats.spaceTechs} color={Colors.warning} />
      </View>

      <SectionHeader title="Program Readiness" icon={<Feather name="check-circle" size={14} color={Colors.accent} />} />
      <View style={styles.readinessBar}>
        <Text style={styles.readinessLabel}>LAUNCH CAPABILITY</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.min(spaceStats.launchPads * 25, 100)}%` }]} />
        </View>
        <Text style={styles.readinessPct}>{Math.min(spaceStats.launchPads * 25, 100)}%</Text>
      </View>
      <View style={styles.readinessBar}>
        <Text style={styles.readinessLabel}>ORBITAL PRESENCE</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.min(spaceStats.orbitalFacilities * 10, 100)}%`, backgroundColor: Colors.info }]} />
        </View>
        <Text style={styles.readinessPct}>{Math.min(spaceStats.orbitalFacilities * 10, 100)}%</Text>
      </View>
      <View style={styles.readinessBar}>
        <Text style={styles.readinessLabel}>FLEET STRENGTH</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.min(spaceStats.navalPersonnel * 2, 100)}%`, backgroundColor: Colors.warning }]} />
        </View>
        <Text style={styles.readinessPct}>{Math.min(spaceStats.navalPersonnel * 2, 100)}%</Text>
      </View>
      <View style={styles.readinessBar}>
        <Text style={styles.readinessLabel}>COLONY READINESS</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.min(spaceStats.habModules * 15, 100)}%`, backgroundColor: Colors.danger }]} />
        </View>
        <Text style={styles.readinessPct}>{Math.min(spaceStats.habModules * 15, 100)}%</Text>
      </View>

      <CommunicationsBreakdownCard state={state} />

      <View style={styles.infoBox}>
        <MaterialCommunityIcons name="rocket-launch-outline" size={14} color={Colors.info} />
        <Text style={styles.infoText}>
          Build launch pads, orbital infrastructure, and recruit space navy personnel to expand your space program. Research space tech trees to unlock advanced capabilities.
        </Text>
      </View>
    </>
  );

  const renderLaunch = () => {
    const b = state.buildings as Record<string, number>;
    return (
      <>
        <SectionHeader title="Launch Infrastructure" icon={<MaterialCommunityIcons name="rocket-launch-outline" size={14} color={Colors.accent} />} />
        <AssetRow label="Test Launch Pads" count={b.testLaunchPad ?? 0} status="GROUND OPS" statusColor={Colors.accent} />
        <AssetRow label="Heavy Launch Pads" count={b.heavyLaunchPad ?? 0} status="ORBITAL CAPABLE" statusColor={Colors.accent} />
        <AssetRow label="Booster Assembly Hangars" count={b.boosterAssemblyHangar ?? 0} status="PRODUCTION" />
        <AssetRow label="Propellant Tank Farms" count={b.propellantTankFarm ?? 0} status="FUEL STORAGE" />
        <AssetRow label="Vehicle Integration Towers" count={b.vehicleIntegrationTower ?? 0} status="ASSEMBLY" />
        <AssetRow label="Guidance Calibration Labs" count={b.guidanceCalibrationLab ?? 0} status="SYSTEMS CHECK" />
        <AssetRow label="Launch Control Centers" count={b.launchControlCenter ?? 0} status="MISSION CONTROL" statusColor={Colors.warning} />
        <AssetRow label="Recovery Zones" count={b.recoveryZone ?? 0} status="RECOVERY OPS" />
        <AssetRow label="Payload Processing" count={b.payloadProcessingFacility ?? 0} status="PAYLOAD PREP" />
        <AssetRow label="Missile Silo Network" count={b.missileSiloNetwork ?? 0} status="STRATEGIC" statusColor={Colors.danger} />

        <SectionHeader title="Quick Actions" icon={<Feather name="zap" size={14} color={Colors.accent} />} />
        <Pressable
          onPress={() => router.push("/(game)/construction")}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="tool" size={14} color={Colors.accent} />
          <Text style={styles.actionBtnText}>BUILD LAUNCH INFRASTRUCTURE</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(game)/research")}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="cpu" size={14} color={Colors.info} />
          <Text style={[styles.actionBtnText, { color: Colors.info }]}>RESEARCH ROCKETRY TECH</Text>
        </Pressable>
      </>
    );
  };

  const renderOrbital = () => {
    const b = state.buildings as Record<string, number>;
    return (
      <>
        <SectionHeader title="Orbital Industrial Assets" icon={<MaterialCommunityIcons name="factory" size={14} color={Colors.accent} />} />
        <AssetRow label="Orbital Dockyards" count={b.orbitalDockyard ?? 0} status="SHIPBUILDING" statusColor={Colors.accent} />
        <AssetRow label="Station Fab Rings" count={b.stationFabricationRing ?? 0} status="CONSTRUCTION" />
        <AssetRow label="Zero-G Factories" count={b.zeroGFactory ?? 0} status="MANUFACTURING" />
        <AssetRow label="Orbital Solar Farms" count={b.orbitalSolarFarm ?? 0} status="POWER GEN" statusColor={Colors.warning} />
        <AssetRow label="Fuel Cracking Plants" count={b.fuelCrackingPlant ?? 0} status="FUEL PRODUCTION" />
        <AssetRow label="Vacuum Refineries" count={b.vacuumRefinery ?? 0} status="REFINING" />
        <AssetRow label="Drone Service Bays" count={b.droneServiceBay ?? 0} status="MAINTENANCE" />
        <AssetRow label="Cargo Transfer Nodes" count={b.cargoTransferNode ?? 0} status="LOGISTICS" />
        <AssetRow label="Orbital Warehouses" count={b.orbitalWarehouse ?? 0} status="STORAGE" />
        <AssetRow label="Hull Assembly Facilities" count={b.hullAssemblyFacility ?? 0} status="HULL PROD" />

        <SectionHeader title="Communications Network" icon={<Feather name="radio" size={14} color={Colors.accent} />} />
        <AssetRow label="Deep Signal Towers" count={b.deepSignalTower ?? 0} status="BROADCASTING" />
        <AssetRow label="Satellite Uplink Hubs" count={b.satelliteUplinkHub ?? 0} status="UPLINK ACTIVE" statusColor={Colors.accent} />
        <AssetRow label="Orbital Tracking Centers" count={b.orbitalTrackingCenter ?? 0} status="TRACKING" />
        <AssetRow label="Space Traffic Control" count={b.spaceTrafficControlCenter ?? 0} status="ATC ACTIVE" statusColor={Colors.warning} />
      </>
    );
  };

  const renderFleet = () => {
    const u = state.units as Record<string, number>;
    const b = state.buildings as Record<string, number>;
    const totalNavy = (u.orbitalSecurityMarines ?? 0) + (u.boardingAssaultTeams ?? 0) +
      (u.vacuumCombatEngineers ?? 0) + (u.escortFlightCrews ?? 0) +
      (u.platformDefenseGunners ?? 0) + (u.fleetSecurityTroops ?? 0) +
      (u.orbitalRangers ?? 0) + (u.shuttleInfantry ?? 0) +
      (u.navalLogisticsCorps ?? 0) + (u.colonyDefenseCohorts ?? 0);

    return (
      <>
        <SectionHeader title={`Space Navy Personnel (${totalNavy} total)`} icon={<MaterialCommunityIcons name="account-star-outline" size={14} color={Colors.accent} />} />
        <AssetRow label="Orbital Security Marines" count={u.orbitalSecurityMarines ?? 0} status="STATION GUARD" statusColor={Colors.accent} />
        <AssetRow label="Boarding Assault Teams" count={u.boardingAssaultTeams ?? 0} status="COMBAT READY" statusColor={Colors.danger} />
        <AssetRow label="Vacuum Combat Engineers" count={u.vacuumCombatEngineers ?? 0} status="TECH OPS" />
        <AssetRow label="Escort Flight Crews" count={u.escortFlightCrews ?? 0} status="ON PATROL" statusColor={Colors.warning} />
        <AssetRow label="Platform Defense Gunners" count={u.platformDefenseGunners ?? 0} status="WEAPONS HOT" statusColor={Colors.danger} />
        <AssetRow label="Fleet Security Troops" count={u.fleetSecurityTroops ?? 0} status="INTERNAL SEC" />
        <AssetRow label="Orbital Rangers" count={u.orbitalRangers ?? 0} status="FRONTIER PATROL" statusColor={Colors.warning} />
        <AssetRow label="Shuttle Infantry" count={u.shuttleInfantry ?? 0} status="RAPID DEPLOY" />
        <AssetRow label="Naval Logistics Corps" count={u.navalLogisticsCorps ?? 0} status="SUPPLY OPS" />
        <AssetRow label="Colony Defense Cohorts" count={u.colonyDefenseCohorts ?? 0} status="GARRISON" />

        <SectionHeader title="Naval Facilities" icon={<MaterialCommunityIcons name="shield-star-outline" size={14} color={Colors.accent} />} />
        <AssetRow label="Orbital Defense Platforms" count={b.orbitalDefensePlatform ?? 0} status="ARMED" statusColor={Colors.danger} />
        <AssetRow label="Point Defense Grids" count={b.pointDefenseGrid ?? 0} status="ACTIVE" statusColor={Colors.accent} />
        <AssetRow label="Marine Training Schools" count={b.marineTrainingSchool ?? 0} status="TRAINING" />
        <AssetRow label="Fleet Academies" count={b.fleetAcademy ?? 0} status="EDUCATION" />
        <AssetRow label="Escort Craft Hangars" count={b.escortCraftHangar ?? 0} status="DOCKED" />

        <Pressable
          onPress={() => router.push("/(game)/recruitment")}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="users" size={14} color={Colors.accent} />
          <Text style={styles.actionBtnText}>RECRUIT SPACE NAVY</Text>
        </Pressable>
      </>
    );
  };

  const renderColonies = () => {
    const b = state.buildings as Record<string, number>;
    return (
      <>
        <SectionHeader title="Habitation Infrastructure" icon={<MaterialCommunityIcons name="home-group" size={14} color={Colors.accent} />} />
        <AssetRow label="Orbital Habitat Rings" count={b.orbitalHabitatRing ?? 0} status="ROTATING" statusColor={Colors.accent} />
        <AssetRow label="Station Residential Cores" count={b.stationResidentialCore ?? 0} status="OCCUPIED" />
        <AssetRow label="Colony Starter Vaults" count={b.colonyStarterVault ?? 0} status="SEALED" statusColor={Colors.warning} />
        <AssetRow label="Surface Hab Fabricators" count={b.surfaceHabitatFabricator ?? 0} status="BUILDING" />
        <AssetRow label="Life Support Plants" count={b.lifeSupportPlant ?? 0} status="RECYCLING" statusColor={Colors.accent} />
        <AssetRow label="Hydroponic Orbital Farms" count={b.hydroponicOrbitalFarm ?? 0} status="GROWING" />
        <AssetRow label="Medical Isolation Modules" count={b.medicalIsolationModule ?? 0} status="QUARANTINE" />
        <AssetRow label="Radiation Shield Works" count={b.radiationShieldWorks ?? 0} status="SHIELDING" />
        <AssetRow label="Colonial Admin Hubs" count={b.colonialAdminHub ?? 0} status="GOVERNING" />
        <AssetRow label="Frontier Hab Complexes" count={b.frontierHabComplex ?? 0} status="FRONTIER" statusColor={Colors.warning} />

        <SectionHeader title="Science Outposts" icon={<MaterialCommunityIcons name="flask-outline" size={14} color={Colors.accent} />} />
        <AssetRow label="Orbital Science Institutes" count={b.orbitalScienceInstitute ?? 0} status="RESEARCHING" statusColor={Colors.info} />
        <AssetRow label="Astrometrics Labs" count={b.astrometricsLab ?? 0} status="MAPPING" />
        <AssetRow label="Telescope Complexes" count={b.telescopeComplex ?? 0} status="OBSERVING" />
        <AssetRow label="Deep Research Vaults" count={b.deepResearchVault ?? 0} status="CLASSIFIED" statusColor={Colors.danger} />
      </>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>SPACE COMMAND</Text>
          <Text style={styles.headerSub}>
            ORBITAL OPERATIONS & COLONIAL AFFAIRS
          </Text>
        </View>
        <MaterialCommunityIcons name="rocket-launch-outline" size={22} color={Colors.accent} />
      </View>

      <View style={styles.tabRow}>
        <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={styles.tabContent}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabChip, tab === t.key && styles.tabChipActive]}
            >
              <Feather name={t.icon as any} size={12} color={tab === t.key ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === "overview" && renderOverview()}
        {tab === "launch" && renderLaunch()}
        {tab === "orbital" && renderOrbital()}
        {tab === "fleet" && renderFleet()}
        {tab === "colonies" && renderColonies()}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backBtn: {
    width: 32, height: 32, alignItems: "center", justifyContent: "center",
    borderRadius: 4, borderWidth: 1, borderColor: Colors.border,
  },
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: 2 },
  headerSub: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.8, marginTop: 2 },
  tabRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgSecondary },
  tabContent: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 5 : 8, gap: 6 },
  tabChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  tabChipActive: { borderColor: Colors.accent, backgroundColor: "rgba(0,255,65,0.08)" },
  tabText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8 },
  tabTextActive: { color: Colors.accent },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },
  statsGrid: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox: {
    flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, padding: 10, alignItems: "center",
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  statLabel: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 8, letterSpacing: 1, marginTop: 2 },
  readinessBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, padding: 12, marginBottom: 6,
  },
  readinessLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8, width: 100 },
  barTrack: { flex: 1, height: 8, backgroundColor: Colors.bg, borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 4 },
  readinessPct: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11, width: 36, textAlign: "right" },
  assetRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, padding: 12, marginBottom: 4,
  },
  assetLeft: { flex: 1 },
  assetName: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.5 },
  assetStatus: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8, marginTop: 2 },
  assetCount: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 16 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 4,
    marginTop: 8, backgroundColor: Colors.bgCard,
  },
  actionBtnText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 1 },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(0,200,255,0.08)", borderWidth: 1, borderColor: Colors.info,
    borderRadius: 4, padding: 12, marginTop: 16,
  },
  infoText: { color: Colors.info, fontFamily: "Inter_400Regular", fontSize: 11, flex: 1, lineHeight: 16 },
}));

export default withScreenBoundary(SpaceScreen, "space");

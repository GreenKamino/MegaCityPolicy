import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React from "react";
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

import GameModal from "@/components/GameModal";
import MenuButton from "@/components/MenuButton";
import ResourceRow from "@/components/ResourceRow";
import SectionHeader from "@/components/SectionHeader";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useSettings } from "@/context/SettingsContext";
import { useGameModal } from "@/hooks/useGameModal";
import {
  CrashReport,
  clearCrashReports,
  formatCrashReport,
  getCrashReports,
  subscribeCrashReports,
} from "@/engine/crashReports";

function DebugScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const isDemo = false;
  const {
    state,
    cheatCredits,
    cheatMaxResources,
    cheatReduceUnrest,
    cheatReduceCrime,
    cheatSetStat,
    forceTick,
    toggleCheat,
    cheatAdd1BCredits,
    cheatAdd1BSteel,
    cheatAdd2BCredits,
    cheatAddPopulation,
    cheatAddUnits,
    cheatSetDemographic,
    cheatMaxFood,
    cheatMaxWater,
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
    cheatFactionReset,
    cheatTradeSurplus,
    cheatSpyMaster,
    cheatWarProfiler,
    cheatPuppetMaster,
    cheatGoldenTongue,
    cheatOpenBorders,
    cheatBulkAmmoWeapons,
    cheatHabTowers,
    cheatHabAll,
    cheatAddSteel,
    cheatAddSteelMega,
    cheatAddWaterFacilities,
    cheatAddFoodFacilities,
    cheatAddWasteSewage,
    cheatRemovePopulation,
    cheatFactionWar,
    cheatEveryoneIsDead,
    cheatTriggerCivilWar,
    cheatLaunchExpedition,
    cheatToggleTradeAI,
    cheatForceSeasonChange,
    cheatPrestigeBoost,
  } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const { showTickProfiler, setSetting } = useSettings();
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const [crashReports, setCrashReports] = React.useState<CrashReport[]>(() => getCrashReports());
  React.useEffect(() => {
    return subscribeCrashReports(() => setCrashReports(getCrashReports()));
  }, []);

  const copyCrashReport = async (report: CrashReport) => {
    try {
      await Clipboard.setStringAsync(formatCrashReport(report));
      alert("COPIED", "Crash report copied to clipboard.");
    } catch {
      showModal("COPY FAILED", "Clipboard access was denied.", [{ text: "OK", onPress: hideModal }]);
    }
  };

  const alert = (title: string, msg: string) => showModal(title, msg, [{ text: "OK", style: "cancel" }]);

  const demoBlock = () => showModal("FULL GAME REQUIRED", "Unlock the full version of MEGACITY to use the cheat terminal. All these commands will be yours.", [{ text: "OK", style: "cancel" }]);
  const guard = (fn: () => void) => isDemo ? demoBlock : fn;
  const confirmDestructive = (title: string, message: string, onConfirm: () => void) => {
    showModal(title, message, [
      { text: "CANCEL", style: "cancel" },
      { text: "CONFIRM", style: "destructive", onPress: onConfirm },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <GameModal visible={modal.visible} title={modal.title} message={modal.message} buttons={modal.buttons} onDismiss={hideModal} />
      <View style={styles.header}>
        <Feather name="terminal" size={18} color={isDemo ? Colors.textMuted : Colors.warning} />
        <Text style={[styles.headerTitle, isDemo && { color: Colors.textMuted }]}>DEBUG / CHEAT TERMINAL</Text>
        {isDemo && <View style={styles.demoBadge}><Feather name="lock" size={10} color={Colors.warning} /><Text style={styles.demoBadgeText}>PREVIEW</Text></View>}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isDemo && (
          <View style={styles.demoBanner}>
            <Feather name="eye" size={14} color={Colors.info} />
            <Text style={styles.demoBannerText}>
              You're previewing the cheat terminal. Unlock the full game to activate these commands.
            </Text>
          </View>
        )}
        <View style={styles.warningBanner}>
          <Feather name="alert-octagon" size={14} color={Colors.warning} />
          <Text style={styles.warningText}>
            CITY COMMANDER OVERRIDE TERMINAL — Actions bypass standard authorization. Abuse logged.
          </Text>
        </View>

        <SectionHeader title="Diagnostics" icon={<Feather name="activity" size={14} color={Colors.accent} />} />
        <MenuButton
          label={`TICK PROFILER OVERLAY: ${showTickProfiler ? "ON" : "OFF"}`}
          subtitle="Show per-section runTick cost (avg + p95). Dev tool — no gameplay or save impact."
          onPress={guard(() => { setSetting("showTickProfiler", !showTickProfiler); })}
          variant={showTickProfiler ? "primary" : "secondary"}
          leftIcon={<Feather name="activity" size={14} color={showTickProfiler ? Colors.accent : Colors.textMuted} />}
        />

        <SectionHeader title="Cheat Toggles" icon={<Feather name="toggle-left" size={14} color={Colors.accent} />} />
        <MenuButton
          label={`YESMAN MODE: ${state.cheats?.yesman ? "ON" : "OFF"}`}
          subtitle="Always get favorable answers from factions and negotiations"
          onPress={guard(() => { toggleCheat("yesman"); })}
          variant={state.cheats?.yesman ? "primary" : "secondary"}
          leftIcon={<Feather name="check-circle" size={14} color={state.cheats?.yesman ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`ZOMBIE MODE: ${state.cheats?.zombie ? "ON" : "OFF"}`}
          subtitle="Population always happy — unrest and crime frozen at 0"
          onPress={guard(() => { toggleCheat("zombie"); })}
          variant={state.cheats?.zombie ? "primary" : "secondary"}
          leftIcon={<Feather name="smile" size={14} color={state.cheats?.zombie ? Colors.accent : Colors.textMuted} />}
        />

        <MenuButton
          label={`INFINITE MONEY: ${state.cheats?.infiniteMoney ? "ON" : "OFF"}`}
          subtitle="Credits never decrease — buy everything, forever"
          onPress={guard(() => { toggleCheat("infiniteMoney"); })}
          variant={state.cheats?.infiniteMoney ? "primary" : "secondary"}
          leftIcon={<Feather name="dollar-sign" size={14} color={state.cheats?.infiniteMoney ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`GOD MODE: ${state.cheats?.godMode ? "ON" : "OFF"}`}
          subtitle="Nothing can hurt you. Crime, unrest, corruption all pinned to 0"
          onPress={guard(() => { toggleCheat("godMode"); })}
          variant={state.cheats?.godMode ? "primary" : "secondary"}
          leftIcon={<Feather name="shield" size={14} color={state.cheats?.godMode ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`SPEED DEMON: ${state.cheats?.speedDemon ? "ON" : "OFF"}`}
          subtitle="All production rates tripled. City goes brrrrr"
          onPress={guard(() => { toggleCheat("speedDemon"); })}
          variant={state.cheats?.speedDemon ? "primary" : "secondary"}
          leftIcon={<Feather name="fast-forward" size={14} color={state.cheats?.speedDemon ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`ANARCHY MODE: ${state.cheats?.anarchy ? "ON" : "OFF"}`}
          subtitle="Crime 100, unrest 100, law 0 — total chaos, good luck"
          onPress={guard(() => { toggleCheat("anarchy"); })}
          variant={state.cheats?.anarchy ? "primary" : "secondary"}
          leftIcon={<Feather name="zap-off" size={14} color={state.cheats?.anarchy ? Colors.danger : Colors.textMuted} />}
        />
        <MenuButton
          label={`UTOPIA: ${state.cheats?.utopia ? "ON" : "OFF"}`}
          subtitle="Happiness 100, everyone loves you, everything is fine"
          onPress={guard(() => { toggleCheat("utopia"); })}
          variant={state.cheats?.utopia ? "primary" : "secondary"}
          leftIcon={<Feather name="heart" size={14} color={state.cheats?.utopia ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`UNLOCK ALL TECH: ${state.cheats?.techUnlockAll ? "ON" : "OFF"}`}
          subtitle="All 260+ technologies instantly researched"
          onPress={guard(() => { toggleCheat("techUnlockAll"); })}
          variant={state.cheats?.techUnlockAll ? "primary" : "secondary"}
          leftIcon={<Feather name="cpu" size={14} color={state.cheats?.techUnlockAll ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`POPULATION BOOM: ${state.cheats?.populationBoom ? "ON" : "OFF"}`}
          subtitle="+50,000 citizens every tick. Hope you built enough housing"
          onPress={guard(() => { toggleCheat("populationBoom"); })}
          variant={state.cheats?.populationBoom ? "primary" : "secondary"}
          leftIcon={<Feather name="users" size={14} color={state.cheats?.populationBoom ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`NO UPKEEP: ${state.cheats?.noUpkeep ? "ON" : "OFF"}`}
          subtitle="All unit and building upkeep costs zeroed"
          onPress={guard(() => { toggleCheat("noUpkeep"); })}
          variant={state.cheats?.noUpkeep ? "primary" : "secondary"}
          leftIcon={<Feather name="slash" size={14} color={state.cheats?.noUpkeep ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`MEGA BUILDER: ${state.cheats?.megaBuilder ? "ON" : "OFF"}`}
          subtitle="All construction costs reduced to 1 credit"
          onPress={guard(() => { toggleCheat("megaBuilder"); })}
          variant={state.cheats?.megaBuilder ? "primary" : "secondary"}
          leftIcon={<Feather name="tool" size={14} color={state.cheats?.megaBuilder ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`INVISIBLE CITY: ${state.cheats?.invisibleCity ? "ON" : "OFF"}`}
          subtitle="No faction notices you. Stealth governance"
          onPress={guard(() => { toggleCheat("invisibleCity"); })}
          variant={state.cheats?.invisibleCity ? "primary" : "secondary"}
          leftIcon={<Feather name="eye-off" size={14} color={state.cheats?.invisibleCity ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`FACTION PUPPETS: ${state.cheats?.factionPuppets ? "ON" : "OFF"}`}
          subtitle="All factions have 0 threat and maximum loyalty"
          onPress={guard(() => { toggleCheat("factionPuppets"); })}
          variant={state.cheats?.factionPuppets ? "primary" : "secondary"}
          leftIcon={<Feather name="users" size={14} color={state.cheats?.factionPuppets ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`CORRUPT EVERYONE: ${state.cheats?.corruptEveryone ? "ON" : "OFF"}`}
          subtitle="Corruption maxed out. Everything is bribeable"
          onPress={guard(() => { toggleCheat("corruptEveryone"); })}
          variant={state.cheats?.corruptEveryone ? "primary" : "secondary"}
          leftIcon={<Feather name="alert-triangle" size={14} color={state.cheats?.corruptEveryone ? Colors.warning : Colors.textMuted} />}
        />
        <MenuButton
          label={`MAX DEFENSE: ${state.cheats?.maxDefense ? "ON" : "OFF"}`}
          subtitle="Defense rating permanently 100. Fortress mode"
          onPress={guard(() => { toggleCheat("maxDefense"); })}
          variant={state.cheats?.maxDefense ? "primary" : "secondary"}
          leftIcon={<Feather name="shield" size={14} color={state.cheats?.maxDefense ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`PEACE ON EARTH: ${state.cheats?.peaceOnEarth ? "ON" : "OFF"}`}
          subtitle="No events, no crises, no problems. Boring but safe"
          onPress={guard(() => { toggleCheat("peaceOnEarth"); })}
          variant={state.cheats?.peaceOnEarth ? "primary" : "secondary"}
          leftIcon={<Feather name="sun" size={14} color={state.cheats?.peaceOnEarth ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`SPACE RUSH: ${state.cheats?.spaceRush ? "ON" : "OFF"}`}
          subtitle="Space construction and research 10x faster"
          onPress={guard(() => { toggleCheat("spaceRush"); })}
          variant={state.cheats?.spaceRush ? "primary" : "secondary"}
          leftIcon={<Feather name="send" size={14} color={state.cheats?.spaceRush ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`TRADE GOD: ${state.cheats?.tradeGod ? "ON" : "OFF"}`}
          subtitle="Trade income x10. Capitalism wins"
          onPress={guard(() => { toggleCheat("tradeGod"); })}
          variant={state.cheats?.tradeGod ? "primary" : "secondary"}
          leftIcon={<Feather name="trending-up" size={14} color={state.cheats?.tradeGod ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`PROPAGANDA 100: ${state.cheats?.propaganda100 ? "ON" : "OFF"}`}
          subtitle="Maximum propaganda effectiveness. Citizens believe everything"
          onPress={guard(() => { toggleCheat("propaganda100"); })}
          variant={state.cheats?.propaganda100 ? "primary" : "secondary"}
          leftIcon={<Feather name="radio" size={14} color={state.cheats?.propaganda100 ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`ROBOT OVERLORD: ${state.cheats?.robotOverlord ? "ON" : "OFF"}`}
          subtitle="All droids and robots doubled. Skynet approves"
          onPress={guard(() => { toggleCheat("robotOverlord"); })}
          variant={state.cheats?.robotOverlord ? "primary" : "secondary"}
          leftIcon={<Feather name="cpu" size={14} color={state.cheats?.robotOverlord ? Colors.accent : Colors.textMuted} />}
        />
        <MenuButton
          label={`UNLIMITED WATER: ${state.cheats?.unlimitedWater ? "ON" : "OFF"}`}
          subtitle="Water supply locked at 9999. Never runs dry"
          onPress={guard(() => { toggleCheat("unlimitedWater"); })}
          variant={state.cheats?.unlimitedWater ? "primary" : "secondary"}
          leftIcon={<Feather name="droplet" size={14} color={state.cheats?.unlimitedWater ? Colors.info : Colors.textMuted} />}
        />
        <MenuButton
          label={`UNLIMITED FOOD: ${state.cheats?.unlimitedFood ? "ON" : "OFF"}`}
          subtitle="Food supply locked at 9999. No one starves"
          onPress={guard(() => { toggleCheat("unlimitedFood"); })}
          variant={state.cheats?.unlimitedFood ? "primary" : "secondary"}
          leftIcon={<Feather name="package" size={14} color={state.cheats?.unlimitedFood ? Colors.accent : Colors.textMuted} />}
        />

        <SectionHeader title="Financial Override" icon={<Feather name="dollar-sign" size={14} color={Colors.accent} />} />
        <MenuButton
          label="INJECT 10,000 CREDITS"
          subtitle="Emergency treasury transfer"
          onPress={guard(() => { cheatCredits(10000); alert("INJECTED", "+10,000 credits added to treasury."); })}
          variant="warning"
          leftIcon={<Feather name="dollar-sign" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="INJECT 100,000 CREDITS"
          subtitle="Major financial infusion"
          onPress={guard(() => { cheatCredits(100000); alert("INJECTED", "+100,000 credits."); })}
          variant="warning"
          leftIcon={<Feather name="dollar-sign" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="INJECT 1,000,000 CREDITS"
          subtitle="Massive treasury override"
          onPress={guard(() => { cheatCredits(1000000); alert("INJECTED", "+1,000,000 credits."); })}
          variant="warning"
          leftIcon={<Feather name="dollar-sign" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="ADD 1 BILLION CREDITS"
          subtitle="Massive treasury injection — 1,000,000,000 credits"
          onPress={guard(() => { cheatAdd1BCredits(); alert("INJECTED", "+1,000,000,000 credits. The treasury overflows."); })}
          variant="danger"
          leftIcon={<Feather name="dollar-sign" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="ADD 1 BILLION STEEL"
          subtitle="Enough steel to rebuild the city twice — 1,000,000,000 tons"
          onPress={guard(() => { cheatAdd1BSteel(); alert("INJECTED", "+1,000,000,000 tons of steel. The foundries weep with joy."); })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="iron-board" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="ADD 2 BILLION CREDITS"
          subtitle="Unlimited funds mode — 2,000,000,000 credits"
          onPress={guard(() => { cheatAdd2BCredits(); alert("INJECTED", "+2,000,000,000 credits. You're a trillionaire."); })}
          variant="danger"
          leftIcon={<Feather name="dollar-sign" size={14} color={Colors.danger} />}
        />

        <SectionHeader title="Resource Override" icon={<Feather name="box" size={14} color={Colors.accent} />} />
        <MenuButton
          label="MAX ALL RESOURCES"
          subtitle="Set all stockpiles and credits to maximum"
          onPress={guard(() => { cheatMaxResources(); alert("OVERRIDE", "All resources maximized."); })}
          variant="danger"
          leftIcon={<Feather name="zap" size={14} color={Colors.danger} />}
        />

        <SectionHeader title="Bulk Injection" subtitle="+100 of every item in category" icon={<MaterialCommunityIcons name="needle" size={14} color={Colors.accent} />} />
        <MenuButton
          label="ADD 1M FOOD"
          subtitle="Add 1,000,000 to all foodstuffs, crops, and base food"
          onPress={guard(() => { cheatMaxFood(); alert("APPLIED", "+1,000,000 food added to all stockpiles."); })}
          variant="warning"
          leftIcon={<MaterialCommunityIcons name="food-apple" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="ADD 1M WATER"
          subtitle="Add 1,000,000 to all water commodities and base water"
          onPress={guard(() => { cheatMaxWater(); alert("APPLIED", "+1,000,000 water added to all stockpiles."); })}
          variant="warning"
          leftIcon={<MaterialCommunityIcons name="water" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="ADD 100 OF EVERY COMMODITY"
          subtitle="Inject 100 units of every supply-chain commodity into stockpile"
          onPress={guard(() => { cheatBulkCommodities(); alert("BULK INJECT", "+100 of every commodity added to stockpile."); })}
          variant="warning"
          leftIcon={<Feather name="package" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="ADD 100 OF EVERY UNIT"
          subtitle="Recruit 100 of every unit type currently in service"
          onPress={guard(() => { cheatBulkUnits(); alert("BULK INJECT", "+100 of every unit type deployed."); })}
          variant="warning"
          leftIcon={<Feather name="users" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="ADD 100 OF EVERY RESOURCE"
          subtitle="+1M credits, +100 steel/goods/fuel/med/ammo"
          onPress={guard(() => { cheatBulkResources(); alert("BULK INJECT", "+1M credits and +100 of every base resource."); })}
          variant="warning"
          leftIcon={<Feather name="database" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="ADD 5 OF EVERY BUILDING"
          subtitle="Construct 5 of every building type in the city"
          onPress={guard(() => { cheatBulkBuildings(); alert("BULK BUILD", "+5 of every building added to your city."); })}
          variant="danger"
          leftIcon={<Feather name="home" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="ADD 1000 OF EVERY BUILDING"
          subtitle="Massive infrastructure injection — +1000 of every building type"
          onPress={guard(() => { cheatBulkBuildings1000(); alert("MEGA BUILD", "+1000 of every building added to your city."); })}
          variant="danger"
          leftIcon={<Feather name="home" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="ADD 1000 INFRASTRUCTURE BUILDINGS"
          subtitle="Energy, water, transit, food storage, and logistics only"
          onPress={guard(() => { cheatInfraBuildings1000(); alert("INFRA BOOST", "+1000 infrastructure buildings added (energy, water, transit, logistics)."); })}
          variant="danger"
          leftIcon={<Feather name="tool" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="ADD 1000 OF EVERY WEAPON/AMMO"
          subtitle="+1000 weapons, ammo, missiles, and nuclear weapons to stockpile"
          onPress={guard(() => { cheatBulkAmmoWeapons(); alert("ARSENAL LOADED", "+1000 of every weapon, ammo, missile, and nuclear weapon added."); })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="ammunition" size={14} color={Colors.danger} />}
        />

        <SectionHeader title="Construction Cheats" icon={<MaterialCommunityIcons name="office-building" size={14} color={Colors.accent} />} />
        <MenuButton
          label="ADD 1000 HAB BLOCK MEGA TOWERS"
          subtitle="Instant mass housing — 1000 mega towers constructed"
          onPress={guard(() => { cheatHabTowers(); alert("CONSTRUCTED", "+1,000 Hab Block Mega Towers built."); })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="office-building" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="ADD 100 OF EVERY HAB BUILDING"
          subtitle="+100 of every housing type: mega towers, worker housing, rehab, etc."
          onPress={guard(() => { cheatHabAll(); alert("CONSTRUCTED", "+100 of every hab building type added."); })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="home-group" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="ADD 100,000 STEEL"
          subtitle="Massive steel shipment delivered to stockpile"
          onPress={guard(() => { cheatAddSteel(); alert("DELIVERED", "+100,000 tons of steel added."); })}
          variant="warning"
          leftIcon={<MaterialCommunityIcons name="iron-board" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="ADD 500,000 STEEL"
          subtitle="Mega steel convoy — half a million tons"
          onPress={guard(() => { cheatAddSteelMega(); alert("MEGA DELIVERY", "+500,000 tons of steel. The foundries overflow."); })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="iron-board" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="ADD 1000 WATER FACILITIES"
          subtitle="+1000 Water Recycling Super Facilities (+600 water each)"
          onPress={guard(() => { cheatAddWaterFacilities(); alert("CONSTRUCTED", "+1,000 Water Recycling Super Facilities built."); })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="water" size={14} color={Colors.info} />}
        />
        <MenuButton
          label="ADD 1000 FOOD FACILITIES"
          subtitle="+1000 Synthetic Food Plants (+500 food each)"
          onPress={guard(() => { cheatAddFoodFacilities(); alert("CONSTRUCTED", "+1,000 Synthetic Food Plants built."); })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="food-apple" size={14} color={Colors.accent} />}
        />
        <MenuButton
          label="ADD 1000 WASTE & SEWAGE"
          subtitle="+500 sewer plants, +200 waste processing, +200 sewage works, +100 incinerators"
          onPress={guard(() => { cheatAddWasteSewage(); alert("CONSTRUCTED", "+1,000 waste & sewage treatment facilities built across the city."); })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="recycle" size={14} color={Colors.accent} />}
        />
        <MenuButton
          label="REMOVE 500,000 POPULATION"
          subtitle="Reduce population by 500k (minimum 100k)"
          onPress={guard(() => {
            confirmDestructive(
              "CONFIRM POPULATION PURGE",
              "Remove 500,000 citizens from the census? This destructive debug action cannot be undone.",
              () => { cheatRemovePopulation(); alert("PURGED", "500,000 citizens removed from the census."); },
            );
          })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="account-minus" size={14} color={Colors.danger} />}
        />

        <SectionHeader title="Diplomacy Cheats" subtitle="15 diplomatic overrides" icon={<Feather name="flag" size={14} color={Colors.accent} />} />
        <MenuButton
          label="MAX LOYALTY ALL FACTIONS"
          subtitle="Set all faction and megacity loyalty to 100"
          onPress={guard(() => { cheatMaxLoyaltyAll(); alert("APPLIED", "All loyalty maxed to 100."); })}
          variant="warning"
          leftIcon={<Feather name="heart" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="INSTANT ALLIANCE"
          subtitle="Max loyalty, max influence, zero threat — all entities"
          onPress={guard(() => { cheatInstantAlliance(); alert("APPLIED", "All factions and megacities are now perfect allies."); })}
          variant="danger"
          leftIcon={<Feather name="users" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="UNLOCK ALL TRADE"
          subtitle="Set all influence to 100 and activate all factions"
          onPress={guard(() => { cheatUnlockAllTrade(); alert("APPLIED", "All trade routes unlocked."); })}
          variant="warning"
          leftIcon={<Feather name="unlock" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="FORCE PEACE"
          subtitle="Set all threat levels to zero"
          onPress={guard(() => { cheatForcePeace(); alert("APPLIED", "All threats neutralized. Peace achieved."); })}
          variant="secondary"
          leftIcon={<Feather name="flag" size={14} color={Colors.accent} />}
        />
        <MenuButton
          label="REVEAL ALL INTELLIGENCE"
          subtitle="Discover all megacities, townships, and boost faction influence"
          onPress={guard(() => { cheatRevealIntel(); alert("APPLIED", "All intelligence revealed."); })}
          variant="warning"
          leftIcon={<Feather name="eye" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="MEGACITY FRIENDSHIP MAX"
          subtitle="Max loyalty and influence with all megacities"
          onPress={guard(() => { cheatMegacityFriendMax(); alert("APPLIED", "All megacity relations maximized."); })}
          variant="secondary"
          leftIcon={<Feather name="globe" size={14} color={Colors.accent} />}
        />
        <MenuButton
          label="INSTANT JOINT CONSTRUCTION"
          subtitle="Complete all active joint projects immediately"
          onPress={guard(() => { cheatInstantJointConstruction(); alert("APPLIED", "All joint projects completed instantly."); })}
          variant="danger"
          leftIcon={<Feather name="tool" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="DIPLOMATIC IMMUNITY"
          subtitle="Zero threat, minimum 50 loyalty from all factions and megacities"
          onPress={guard(() => { cheatDiplomaticImmunity(); alert("APPLIED", "Diplomatic immunity activated."); })}
          variant="secondary"
          leftIcon={<Feather name="shield" size={14} color={Colors.accent} />}
        />
        <MenuButton
          label="RANDOM FACTION DECLARES WAR"
          subtitle="A random faction turns hostile — max threat, zero loyalty"
          onPress={guard(() => { cheatFactionWar(); alert("WAR DECLARED", "A faction has turned hostile. Check your messages."); })}
          variant="danger"
          leftIcon={<MaterialCommunityIcons name="sword-cross" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="FACTION RESET"
          subtitle="Reset all factions, megacities, and townships to default"
          onPress={guard(() => {
            confirmDestructive(
              "CONFIRM FACTION RESET",
              "Reset all faction, megacity, and township relations to their default state? This cannot be undone.",
              () => { cheatFactionReset(); alert("APPLIED", "All diplomatic relations reset to initial state."); },
            );
          })}
          variant="danger"
          leftIcon={<Feather name="refresh-cw" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="TRADE SURPLUS"
          subtitle="+500 of all commodities and +5M credits"
          onPress={guard(() => { cheatTradeSurplus(); alert("APPLIED", "Massive trade surplus! +500 all commodities, +5M credits."); })}
          variant="warning"
          leftIcon={<Feather name="trending-up" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="SPY MASTER"
          subtitle="Max influence on all factions, discover all megacities and townships"
          onPress={guard(() => { cheatSpyMaster(); alert("APPLIED", "Full espionage network deployed. All factions known."); })}
          variant="secondary"
          leftIcon={<Feather name="search" size={14} color={Colors.accent} />}
        />
        <MenuButton
          label="WAR PROFITEER"
          subtitle="Set all threats to 100 and gain 10M credits"
          onPress={guard(() => { cheatWarProfiler(); alert("APPLIED", "War economy activated. Threats maxed, +10M credits."); })}
          variant="danger"
          leftIcon={<Feather name="alert-triangle" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="PUPPET MASTER"
          subtitle="Total control over all factions and megacities"
          onPress={guard(() => { cheatPuppetMaster(); alert("APPLIED", "All entities are now puppets. Total control achieved."); })}
          variant="danger"
          leftIcon={<Feather name="git-merge" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="GOLDEN TONGUE"
          subtitle="+30 loyalty, +20 influence for all entities"
          onPress={guard(() => { cheatGoldenTongue(); alert("APPLIED", "Your words are irresistible. Relations improved."); })}
          variant="warning"
          leftIcon={<Feather name="message-circle" size={14} color={Colors.warning} />}
        />
        <MenuButton
          label="OPEN BORDERS"
          subtitle="Activate all megacities and discover all townships"
          onPress={guard(() => { cheatOpenBorders(); alert("APPLIED", "All borders opened. All entities contactable."); })}
          variant="secondary"
          leftIcon={<Feather name="map" size={14} color={Colors.accent} />}
        />

        <SectionHeader title="Population Cheats" icon={<Feather name="users" size={14} color={Colors.accent} />} />
        <MenuButton
          label="ADD 10,000 CITIZENS"
          subtitle="Population boom event"
          onPress={guard(() => { cheatAddPopulation(10000); alert("APPLIED", "+10,000 citizens."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 50,000 CITIZENS"
          subtitle="Mass immigration wave"
          onPress={guard(() => { cheatAddPopulation(50000); alert("APPLIED", "+50,000 citizens."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 200,000 CITIZENS"
          subtitle="Mega resettlement program"
          onPress={guard(() => { cheatAddPopulation(200000); alert("APPLIED", "+200,000 citizens."); })}
          variant="secondary"
        />
        <MenuButton
          label="REMOVE 50,000 CITIZENS"
          subtitle="Population exodus"
          onPress={guard(() => {
            confirmDestructive(
              "CONFIRM POPULATION REMOVAL",
              "Remove 50,000 citizens from the city? This population change cannot be undone.",
              () => { cheatAddPopulation(-50000); alert("APPLIED", "-50,000 citizens departed."); },
            );
          })}
          variant="warning"
        />
        <MenuButton
          label={`EVERYONE IS DEAD, DAVE`}
          subtitle="Catastrophic radiation leak — kills every citizen. Population: 1."
          onPress={guard(() => {
            confirmDestructive(
              "CONFIRM CITYWIDE FATALITY",
              "Kill every citizen, worker, officer, and faction operative in the city? Population will be reduced to 1.",
              () => { cheatEveryoneIsDead(); alert("EVERYONE IS DEAD, DAVE", "A catastrophic radiation leak has swept through all 270 districts. Reactor containment failure — lethal exposure citywide. Every citizen, worker, officer, and faction operative is dead. You alone survived in the emergency continuity bunker.\n\nThe city is yours, Commander. All of it. Every empty corridor, every silent hab-block, every dead screen.\n\nPopulation: 1.\n\nCongratulations."); },
            );
          })}
          variant="warning"
          leftIcon={<MaterialCommunityIcons name="radioactive" size={14} color={Colors.danger} />}
        />

        <SectionHeader title="Unit Deployment Cheats" icon={<MaterialCommunityIcons name="sword-cross" size={14} color={Colors.accent} />} />
        <MenuButton
          label="ADD 50 PATROL ENFORCERS"
          subtitle="Instant enforcer deployment"
          onPress={guard(() => { cheatAddUnits("patrolJudges", 50); alert("DEPLOYED", "+50 Patrol Enforcers."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 20 RIOT SQUADS"
          subtitle="Riot control reinforcement"
          onPress={guard(() => { cheatAddUnits("riotPoliceSquads", 20); alert("DEPLOYED", "+20 Riot Police Squads."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 30 SURVEILLANCE DRONES"
          subtitle="Eye in the sky expansion"
          onPress={guard(() => { cheatAddUnits("surveillanceDrones", 30); alert("DEPLOYED", "+30 Surveillance Drones."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 10 ARMORED UNITS"
          subtitle="Heavy armor deployment"
          onPress={guard(() => { cheatAddUnits("armoredResponseUnits", 10); alert("DEPLOYED", "+10 Armored Response Units."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 25 SENIOR ENFORCERS"
          subtitle="Elite enforcer transfer"
          onPress={guard(() => { cheatAddUnits("seniorJudges", 25); alert("DEPLOYED", "+25 Senior Enforcers."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 50 PATROL CARS"
          subtitle="Vehicle fleet expansion"
          onPress={guard(() => { cheatAddUnits("patrolCars", 50); alert("DEPLOYED", "+50 Patrol Cars."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 15 COMBAT DROIDS"
          subtitle="Robotic enforcement wave"
          onPress={guard(() => { cheatAddUnits("combatDroids", 15); alert("DEPLOYED", "+15 Combat Droids."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 10 FIELD MEDICS"
          subtitle="Medical personnel deployment"
          onPress={guard(() => { cheatAddUnits("fieldMedics", 10); alert("DEPLOYED", "+10 Field Medics."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 20 STREET INFORMANTS"
          subtitle="Intelligence network expansion"
          onPress={guard(() => { cheatAddUnits("streetInformants", 20); alert("DEPLOYED", "+20 Street Informants."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 5 FORENSIC PROFILERS"
          subtitle="Forensic profiler deployment"
          onPress={guard(() => { cheatAddUnits("forensicProfilers", 5); alert("DEPLOYED", "+5 Forensic Profilers."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 100 CIVIL SERVANTS"
          subtitle="Administrative staff boost"
          onPress={guard(() => { cheatAddUnits("civilServants", 100); alert("DEPLOYED", "+100 Civil Servants."); })}
          variant="secondary"
        />
        <MenuButton
          label="ADD 20 HEAVY WEAPONS TEAMS"
          subtitle="Heavy ordnance deployment"
          onPress={guard(() => { cheatAddUnits("heavyWeaponsTeams", 20); alert("DEPLOYED", "+20 Heavy Weapons Teams."); })}
          variant="secondary"
        />

        <SectionHeader title="City Stat Override" icon={<Feather name="sliders" size={14} color={Colors.accent} />} />
        <MenuButton
          label="REDUCE UNREST -20"
          subtitle="Emergency pacification signal broadcast"
          onPress={guard(() => { cheatReduceUnrest(); alert("APPLIED", "Unrest reduced by 20 pts."); })}
          variant="secondary"
        />
        <MenuButton
          label="REDUCE CRIME -20"
          subtitle="Mass crackdown authorization"
          onPress={guard(() => { cheatReduceCrime(); alert("APPLIED", "Crime reduced by 20 pts."); })}
          variant="secondary"
        />
        <MenuButton
          label="SET HAPPINESS TO 80"
          subtitle="Override citizen satisfaction database"
          onPress={guard(() => { cheatSetStat("happiness", 80); alert("APPLIED", "Happiness set to 80."); })}
          variant="secondary"
        />
        <MenuButton
          label="SET LAW ORDER TO 90"
          subtitle="Maximum enforcement presence declared"
          onPress={guard(() => { cheatSetStat("lawOrder", 90); alert("APPLIED", "Law & Order set to 90."); })}
          variant="secondary"
        />
        <MenuButton
          label="HEAL INFRASTRUCTURE (100)"
          subtitle="Emergency repair crews mobilized"
          onPress={guard(() => { cheatSetStat("infrastructureHealth", 100); alert("APPLIED", "Infrastructure health restored."); })}
          variant="secondary"
        />
        <MenuButton
          label="ZERO OUT CORRUPTION"
          subtitle="Purge all corrupt elements (fiction)"
          onPress={guard(() => { cheatSetStat("corruption", 0); alert("APPLIED", "Corruption zeroed."); })}
          variant="secondary"
        />
        <MenuButton
          label="MAX DEFENSE RATING (100)"
          subtitle="Ultimate defense posture"
          onPress={guard(() => { cheatSetStat("defenseRating", 100); alert("APPLIED", "Defense rating maximized."); })}
          variant="secondary"
        />
        <MenuButton
          label="MAX EMPLOYMENT (95%)"
          subtitle="Full employment directive"
          onPress={guard(() => { cheatSetStat("employment", 95); alert("APPLIED", "Employment set to 95%."); })}
          variant="secondary"
        />

        <SectionHeader title="Simulation Override" icon={<Feather name="cpu" size={14} color={Colors.accent} />} />
        <MenuButton
          label="FORCE TICK NOW"
          subtitle="Immediately process one 15-minute simulation tick"
          onPress={guard(() => {
            forceTick();
            alert("TICK PROCESSED", "One simulation tick has been processed.");
          })}
          variant="primary"
          leftIcon={<Feather name="fast-forward" size={14} color={Colors.accent} />}
        />
        <MenuButton
          label="FORCE 5 TICKS"
          subtitle="Process 5 simulation ticks at once"
          onPress={guard(() => {
            for (let i = 0; i < 5; i++) forceTick();
            alert("TICKS PROCESSED", "5 simulation ticks processed.");
          })}
          variant="primary"
          leftIcon={<Feather name="skip-forward" size={14} color={Colors.accent} />}
        />
        <MenuButton
          label="FORCE 24 TICKS (1 DAY)"
          subtitle="Process a full in-game day"
          onPress={guard(() => {
            for (let i = 0; i < 24; i++) forceTick();
            alert("TICKS PROCESSED", "24 ticks — 1 full day processed.");
          })}
          variant="primary"
          leftIcon={<Feather name="skip-forward" size={14} color={Colors.accent} />}
        />
        <MenuButton
          label={`TICK PROFILER OVERLAY: ${showTickProfiler ? "ON" : "OFF"}`}
          subtitle="Floating per-section runTick cost (avg + p95). Dev-only; zero cost when off"
          onPress={() => setSetting("showTickProfiler", !showTickProfiler)}
          variant={showTickProfiler ? "primary" : "secondary"}
          leftIcon={<Feather name="activity" size={14} color={showTickProfiler ? Colors.accent : Colors.textMuted} />}
        />

        <SectionHeader title="State Inspector" icon={<Feather name="search" size={14} color={Colors.accent} />} />
        <ResourceRow label="Total Ticks" value={state.totalTicks} />
        <ResourceRow label="Last Tick Time" value={new Date(state.lastTickTime).toLocaleTimeString()} />
        <ResourceRow label="Active Events" value={state.activeEvents.length} />
        <ResourceRow label="Event History" value={state.eventHistory.length} />
        <ResourceRow label="Credits" value={state.resources.credits} />
        <ResourceRow label="Crime" value={state.cityStats.crime} />
        <ResourceRow label="Unrest" value={state.cityStats.unrest} />
        <ResourceRow label="Happiness" value={state.cityStats.happiness} />
        <ResourceRow label="Law Order" value={state.cityStats.lawOrder} />
        <ResourceRow label="Corruption" value={state.cityStats.corruption} />
        <ResourceRow label="Infrastructure" value={state.cityStats.infrastructureHealth} />
        <ResourceRow label="Population" value={(state.cityStats.population / 1000).toFixed(0) + "k"} />
        <ResourceRow label="Yesman" value={state.cheats?.yesman ? "ON" : "OFF"} />
        <ResourceRow label="Zombie" value={state.cheats?.zombie ? "ON" : "OFF"} />
        <ResourceRow label="Districts" value={state.districts.length} />
        <ResourceRow label="Trade Agreements" value={(state.tradeAgreements ?? []).filter((a) => a.status === "active").length} />
        <ResourceRow label="Joint Projects" value={(state.jointProjects ?? []).filter((p) => p.status === "in_progress").length} />
        <ResourceRow label="Megacities" value={(state.externalMegacities ?? []).length} />
        <ResourceRow label="Civil Wars" value={(state.newSystems?.civilWars ?? []).filter((w) => w.phase !== "resolved").length} />
        <ResourceRow label="Expeditions" value={(state.newSystems?.expeditions ?? []).filter((e) => e.status === "active").length} />
        <ResourceRow label="Season" value={state.newSystems?.seasonalEvent?.name ?? "None"} />
        <ResourceRow label="Trade AI" value={state.newSystems?.tradeAIEnabled ? "ON" : "OFF"} />
        <ResourceRow label="Prestige (Best)" value={Math.max(0, ...(state.newSystems?.prestigePaths ?? []).map((p) => p.level)).toString()} />

        <SectionHeader title="New Systems Cheats" subtitle="Civil wars, expeditions, seasons, prestige" icon={<MaterialCommunityIcons name="lightning-bolt" size={14} color={Colors.accent} />} />
        <MenuButton
          label="TRIGGER CIVIL WAR"
          subtitle="Force a random faction into open revolt"
          onPress={guard(() => { cheatTriggerCivilWar(); alert("CIVIL WAR", "A faction has risen against your administration. Fighting in the streets."); })}
          variant="warning"
          leftIcon={<MaterialCommunityIcons name="sword-cross" size={14} color={Colors.danger} />}
        />
        <MenuButton
          label="LAUNCH RANDOM EXPEDITION"
          subtitle="Send a team into the wasteland"
          onPress={guard(() => { cheatLaunchExpedition(); alert("EXPEDITION LAUNCHED", "A team has been dispatched into the unknown."); })}
          variant="secondary"
        />
        <MenuButton
          label="TOGGLE TRADE AI"
          subtitle={`Auto-buy/sell resources when critical — currently ${state.newSystems?.tradeAIEnabled ? "ON" : "OFF"}`}
          onPress={guard(() => { cheatToggleTradeAI(); alert("TRADE AI", `Trade AI is now ${state.newSystems?.tradeAIEnabled ? "OFF" : "ON"}.`); })}
          variant="secondary"
        />
        <MenuButton
          label="FORCE SEASON CHANGE"
          subtitle="Trigger a random seasonal event"
          onPress={guard(() => { cheatForceSeasonChange(); alert("SEASON CHANGED", "A new seasonal event has begun."); })}
          variant="secondary"
        />
        <MenuButton
          label="PRESTIGE BOOST ALL"
          subtitle="Level up all 5 prestige paths"
          onPress={guard(() => { cheatPrestigeBoost(); alert("PRESTIGE BOOST", "All prestige paths have leveled up."); })}
          variant="secondary"
        />

        <SectionHeader
          title="Crash Reports"
          subtitle={`Last ${crashReports.length} captured (max 10)`}
          icon={<Feather name="alert-octagon" size={14} color={Colors.danger} />}
        />
        {crashReports.length === 0 ? (
          <Text style={styles.crashEmpty}>// No crashes recorded this session.</Text>
        ) : (
          <>
            {crashReports.map((report, idx) => (
              <View key={`${report.timestamp}-${idx}`} style={styles.crashCard}>
                <Text style={styles.crashScreen}>
                  {report.screenName.toUpperCase()} — v{report.appVersion}
                </Text>
                <Text style={styles.crashTime}>
                  {new Date(report.timestamp).toLocaleString()}
                </Text>
                <Text style={styles.crashMessage} numberOfLines={3}>
                  {report.message}
                </Text>
                {report.componentStack.trim().length > 0 && (
                  <Text style={styles.crashStack} numberOfLines={6}>
                    {report.componentStack.trim()}
                  </Text>
                )}
                <Pressable
                  onPress={() => copyCrashReport(report)}
                  style={styles.crashCopyBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy crash report for ${report.screenName}`}
                >
                  <Feather name="clipboard" size={12} color={Colors.accent} />
                  <Text style={styles.crashCopyText}>COPY REPORT</Text>
                </Pressable>
              </View>
            ))}
            <MenuButton
              label="CLEAR CRASH REPORTS"
              subtitle="Empty the in-memory crash buffer"
              onPress={() => {
                confirmDestructive(
                  "CONFIRM CLEAR CRASH REPORTS",
                  "Permanently clear all captured crash reports from this session?",
                  () => { clearCrashReports(); },
                );
              }}
              variant="secondary"
              leftIcon={<Feather name="trash-2" size={14} color={Colors.textMuted} />}
            />
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warning + "66",
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  demoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.warning + "20",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: "auto",
  },
  demoBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: Colors.warning,
    letterSpacing: 1,
  },
  demoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(100,180,255,0.1)",
    borderWidth: 1,
    borderColor: Colors.info,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  demoBannerText: {
    color: Colors.info,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255,149,0,0.1)",
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    color: Colors.warning,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  crashEmpty: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  crashCard: {
    borderWidth: 1,
    borderColor: Colors.danger + "55",
    backgroundColor: "rgba(255,69,58,0.06)",
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  crashScreen: {
    color: Colors.danger,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 2,
  },
  crashTime: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginBottom: 6,
  },
  crashMessage: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginBottom: 6,
  },
  crashStack: {
    color: Colors.textMuted,
    fontFamily: Platform.OS === "web" ? "monospace" : "Inter_400Regular",
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 8,
  },
  crashCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  crashCopyText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
}));

export default withScreenBoundary(DebugScreen, "debug");

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useGlobalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GameModal from "@/components/GameModal";
import Insignia from "@/components/Insignia";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { APP_VERSION, BUILD_NUMBER, DEVELOPER_NAME } from "@/constants/version";
import { CHANGELOG } from "@/data/changelog";
import { MANUAL_INTRO, MANUAL_SECTIONS, MANUAL_OUTRO } from "@/data/manualContent";
import { useGame } from "@/context/GameContext";
import { useSettings } from "@/context/SettingsContext";
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORY_LABELS, type AchievementCategory } from "@/engine/achievements";
import {
  PLAYER_FACTION_GLYPHS,
  PLAYER_FACTION_NAME_MAX,
  PLAYER_FACTION_MOTTO_MAX,
  PLAYER_FACTION_PALETTE,
  PLAYER_FACTION_BG_PALETTE,
  presetForKey,
  rollPlayerFactionMotto,
  type PlayerFactionGlyph,
  type PlayerFactionKey,
} from "@/engine/playerFaction";
import { STARTING_REGIONS, type StartingRegion } from "@/engine/worldMap";
import {
  createMegacityRoster,
  defaultMegacityDisplayName,
  rosterSeedFromString,
  type MegacityRosterMetadata,
} from "@/engine/settlementRoster";
import { type StartStyle } from "@/engine/startStyle";
import {
  COMMANDER_ORIGINS,
  type CommanderOriginId,
} from "@/engine/commanderOrigins";
import type { GameplayMode } from "@/engine/types";
import { startSoundLoop, stopSoundLoop } from "@/engine/audio";
import { MAX_PROFILES, firstEmptyNewGameSlot } from "@/engine/profiles";
import { pickCustomPortrait } from "@/utils/portraitUpload";
import { isElectronShell, quitDesktopApp } from "@/utils/desktopShell";
import { useGameModal } from "@/hooks/useGameModal";
import {
  getDefaultPlayerPortraitId,
  getPortrait,
} from "@/utils/portraits";
import { PortraitPicker } from "@/components/PortraitPicker";
import {
  CitySetupSection,
  CommanderAttributesSection,
  CommanderIdentitySection,
  CommanderTraitsSection,
  type ProfileAttributeKey,
  type StartStyle as SetupStartStyle,
} from "@/components/CommanderSetupSections";

const logoImage = require("@/assets/images/logo.webp");
const isDesktopMenu = Platform.OS === "web";

const DEV_UPDATE_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatDevUpdateDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((p) => Number(p));
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${DEV_UPDATE_MONTHS[m - 1]} ${d}, ${y}`;
}

const FACTION_ART: Record<string, any> = {
  law_enforcement: require("@/assets/concept-art/faction-authoritarians.webp"),
  military: require("@/assets/concept-art/faction-militarists.webp"),
  corporate: require("@/assets/concept-art/faction-corporatists.webp"),
  intelligence: require("@/assets/concept-art/faction-technologists.webp"),
  underground: require("@/assets/concept-art/faction-populists.webp"),
};


type Difficulty = "easy" | "medium" | "hard";


function BlinkingCursor() {
  const styles = useStyles();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: false }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.Text style={[styles.cursor, { opacity }]}>_</Animated.Text>;
}

function formatDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRelative(ts: number): string {
  if (!ts) return "Never saved";
  const diff = Date.now() - ts;
  if (diff < 0) return "Just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 30) return `${day} days ago`;
  return formatDate(ts).split(" ")[0];
}

export default function MainMenu() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const ccStyles = useCcStyles();
  const insets = useSafeAreaInsets();
  const {
    hasSave, startNewGame, launchConfiguredNewGame, loadSlot, deleteSlot, setSaveLabel,
    slotMetas, refreshSlotMetas, activeSlot, state,
    globalAchievements,
    setState,
    activeProfile, allProfiles,
    createProfile, selectProfile, deleteProfile, refreshProfiles,
    hasRecoverySnapshot, recoverySnapshotInfo, loadRecoverySnapshot, dismissRecoverySnapshot,
    cloudSaveStatus, cloudSaveConflicts, resolveCloudConflict,
  } = useGame();
  // `skipIntro` lives on SettingsContext (not GameState). Players who have
  // explicitly opted out of opening sequences via Settings bypass the
  // onboarding flow even on a fresh save. The default is `false`, so the
  // tutorial still runs for first-time players.
  const { skipIntro, defaultStartStyle, setSetting } = useSettings();

  // Main-menu background music. Loops while the title screen is focused and
  // stops when navigating into the game. Modals on this screen render in
  // place (React Native <Modal>) and do NOT blur the route, so the track
  // plays continuously across menu dialogs. Routed through the shared audio
  // engine, so it automatically honors the player's sound mute / volume
  // settings (SettingsContext syncs audioSetMuted/audioSetVolume).
  useFocusEffect(
    useCallback(() => {
      startSoundLoop("menu_music");
      return () => {
        stopSoundLoop("menu_music");
      };
    }, []),
  );

  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;
  // The menu content should sit near the top of the desktop viewport. Keep a
  // small web-only breathing margin instead of using the larger fallback
  // inset that protects modal chrome, while native still honors the actual
  // status-bar/notch inset.
  const menuTopInset = Platform.OS === "web" ? 12 : insets.top;

  const [showSlots, setShowSlots] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [labelEditorSlot, setLabelEditorSlot] = useState<number | null>(null);
  const [labelEditorText, setLabelEditorText] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const [showDifficulty, setShowDifficulty] = useState(false);
  const [showDevUpdates, setShowDevUpdates] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [achCat, setAchCat] = useState<string>("all");
  const [showManual, setShowManual] = useState(false);
  const [manualTab, setManualTab] = useState<"manual" | "controls">("manual");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const { modal, showModal, hideModal } = useGameModal();

  const [showProfileCreate, setShowProfileCreate] = useState(false);
  const [showProfileSelect, setShowProfileSelect] = useState(false);
  const [profileName, setProfileName] = useState("Commander Unknown");
  const [profileAge, setProfileAge] = useState(35);
  const [profileSex, setProfileSex] = useState<"male" | "female" | "other">("male");
  // Optional backstory blurb. Surfaces on the in-game character screen
  // (see app/(game)/character.tsx) and on the codex profile card. The
  // info-step UI offers a preset picker plus a free-text field; the
  // engine treats this as a cosmetic string with no gameplay effect.
  const [profileBackstory, setProfileBackstory] = useState("");
  // Portrait id chosen via the new-game thumbnail picker. Defaults to the
  // first gallery portrait; available to any commander regardless of sex.
  const [profilePortraitId, setProfilePortraitId] = useState<string>(() => getDefaultPlayerPortraitId());
  // Pending uploaded photo (small base64 data URI) for the commander being
  // created. Attached to the profile at createProfile time; picking a
  // gallery portrait clears it so the two choices never fight.
  const [profileCustomPortrait, setProfileCustomPortrait] = useState<string | null>(null);
  const [profileStep, setProfileStep] = useState<"info" | "attributes" | "traits">("info");
  const [profileAttributes, setProfileAttributes] = useState({ authority: 5, intelligence: 4, charisma: 3, combat: 6, endurance: 5 });
  const [profilePointsLeft, setProfilePointsLeft] = useState(3);
  const [profileTraits, setProfileTraits] = useState<string[]>(["Academy Graduate", "Iron Will"]);

  const [showCharCreate, setShowCharCreate] = useState(false);
  const [isUnifiedSetup, setIsUnifiedSetup] = useState(false);
  const [isLaunchingSetup, setIsLaunchingSetup] = useState(false);
  const [charCreateSlot, setCharCreateSlot] = useState(1);
  // Guided vs Veteran start (Task #335). Guided (default) = the full first-run
  // experience: orientation, calm Day 1, the starter-objective marker, and the
  // per-tab coach tips. Veteran = orientation pre-completed with the full HUD
  // available immediately, the calm-start window skipped, and no objective
  // marker or coach tips. Applied at game creation in confirmCharCreate.
  const [startStyle, setStartStyle] = useState<StartStyle>("guided");
  // Whether the start-style pick above should also become the saved Settings
  // default (Task #465). Only shown (and only applied) when the pick differs
  // from the saved default, so a one-off Veteran run no longer silently
  // clobbers a deliberately chosen Settings preference. Defaults to off:
  // players who don't care keep the zero-tap flow and their saved default.
  const [rememberStartStyle, setRememberStartStyle] = useState(false);
  // Real-time (idle) vs turn-based. Chosen once here at new-game creation
  // (Task #438), written onto the save, and never toggled mid-game. Real-time
  // is the classic default; turn-based only advances on End Turn.
  const [newGameMode, setNewGameMode] = useState<GameplayMode>("realtime");
  const [ccCity, setCcCity] = useState("MEGACITY JUAN");
  const [ccFaction, setCcFaction] = useState<PlayerFactionKey>("law_enforcement");
  const [ccRegion, setCcRegion] = useState<StartingRegion>(() => STARTING_REGIONS[Math.floor(Math.random() * STARTING_REGIONS.length)]);
  const [ccOrigin, setCcOrigin] = useState<CommanderOriginId>("none");
  const [ccMegacityRoster, setCcMegacityRoster] = useState<MegacityRosterMetadata>(() =>
    createMegacityRoster(rosterSeedFromString("setup-draft")),
  );
  // ── Pack A — Faction Identity (cosmetic banner). Local-only state
  // until the player hits LAUNCH; we then persist via setState below
  // into state.playerFaction. Defaults snap to the chosen faction's
  // preset whenever ccFaction changes (see useEffect further down).
  const ccPresetInitial = presetForKey("law_enforcement");
  const [ccFactionName, setCcFactionName] = useState(ccPresetInitial.name);
  const [ccMotto, setCcMotto] = useState(ccPresetInitial.motto);
  const [ccPrimary, setCcPrimary] = useState(ccPresetInitial.primaryColor);
  const [ccSecondary, setCcSecondary] = useState(ccPresetInitial.secondaryColor);
  const [ccGlyph, setCcGlyph] = useState<PlayerFactionGlyph>(ccPresetInitial.glyph);

  type FactionOption = { id: PlayerFactionKey; name: string; title: string; desc: string; bonuses: string; icon: string; color: string };
  const FACTION_OPTIONS: FactionOption[] = [
    { id: "law_enforcement", name: "LAW ENFORCEMENT", title: "Justice Commander", desc: "Law-and-order specialization.", bonuses: "+2 Law & Order, +1 Authority", icon: "gavel", color: "#00C8FF" },
    { id: "military", name: "MILITARY COMMAND", title: "War Commander", desc: "Defense and combat specialization.", bonuses: "+2 Defense, +1 Combat, +50 Ammo", icon: "tank", color: "#FF3B30" },
    { id: "corporate", name: "CORPORATE SECTOR", title: "Executive Director", desc: "Credit and negotiation specialization.", bonuses: "+10,000 Credits, +1 Charisma", icon: "briefcase", color: "#FF9500" },
    { id: "intelligence", name: "INTELLIGENCE BUREAU", title: "Shadow Director", desc: "Surveillance and intelligence specialization.", bonuses: "+2 Surveillance, +1 Intelligence", icon: "eye", color: "#B855FF" },
    { id: "underground", name: "UNDERGROUND RISING", title: "People's Marshal", desc: "Public-order and resilience specialization.", bonuses: "-5 Unrest, +1 Endurance, +2 Happiness", icon: "account-group", color: "#00FF41" },
  ];

  const AVAILABLE_TRAITS = [
    "Academy Graduate", "Iron Will", "Street Survivor", "Corporate Exile",
    "Born Leader", "Ruthless Tactician", "People's Champion", "Shadow Operative",
    "Engineering Prodigy", "Medical Background", "Propaganda Expert", "Wasteland Scout",
    "Former Raider", "Ex-Intelligence", "Diplomatic Corps", "Military Veteran",
    "Cyber Augmented", "Negotiator", "Resource Hoarder",
    "Fortification Expert", "Black Market Contact", "Academic Scholar", "Survivalist",
  ];

  const rollProfileAttributes = () => {
    const roll = () => Math.floor(Math.random() * 6) + 2;
    setProfileAttributes({ authority: roll(), intelligence: roll(), charisma: roll(), combat: roll(), endurance: roll() });
    setProfilePointsLeft(3);
  };

  const adjustProfileAttribute = (key: keyof typeof profileAttributes, delta: number) => {
    if (delta > 0 && profilePointsLeft <= 0) return;
    if (delta < 0 && profileAttributes[key] <= 1) return;
    if (delta > 0 && profileAttributes[key] >= 10) return;
    setProfileAttributes(prev => ({ ...prev, [key]: prev[key] + delta }));
    setProfilePointsLeft(prev => prev - delta);
  };

  const toggleProfileTrait = (trait: string) => {
    setProfileTraits(prev => {
      if (prev.includes(trait)) return prev.filter(t => t !== trait);
      if (prev.length >= 3) return prev;
      return [...prev, trait];
    });
  };

  const resetProfileDraft = () => {
    setProfileName("Commander Unknown");
    setProfileAge(35);
    setProfileSex("male");
    setProfilePortraitId(getDefaultPlayerPortraitId());
    setProfileCustomPortrait(null);
    setProfileStep("info");
    setProfileAttributes({ authority: 5, intelligence: 4, charisma: 3, combat: 6, endurance: 5 });
    setProfilePointsLeft(3);
    setProfileTraits(["Academy Graduate", "Iron Will"]);
    setProfileBackstory("");
  };

  const openProfileCreate = () => {
    resetProfileDraft();
    setShowProfileCreate(true);
  };

  const confirmProfileCreate = async () => {
    // Creation can legitimately fail (commander cap reached, storage write
    // error). Without this catch the wizard just sat there doing nothing —
    // the player's "cannot create a commander" bug. Surface the reason and
    // keep the wizard open so nothing they entered is lost.
    try {
      const profile = await createProfile(
        profileName.trim() || "Commander Unknown",
        profileAge,
        profileSex,
        profilePortraitId,
        profileCustomPortrait ?? undefined,
      );
      // Spread keeps profile.portraitId as-is: when a photo was uploaded,
      // createProfile already pointed it at the "custom_<id>" sentinel, and
      // overriding it with the gallery selection here would discard the
      // upload.
      const updated = {
        ...profile,
        attributes: { ...profileAttributes },
        attributePoints: profilePointsLeft,
        traits: [...profileTraits],
        backstory: profileBackstory.trim(),
      };
      const { saveProfile: sp } = await import("@/engine/profiles");
      await sp(updated);
      await selectProfile(updated.id);
      setShowProfileCreate(false);
      await refreshProfiles();
    } catch (e) {
      const msg =
        e instanceof Error && e.message
          ? e.message
          : "Could not create the commander profile. Please try again.";
      showModal("CREATION FAILED", msg, [{ text: "OK", style: "cancel" }]);
    }
  };

  const resetCityDraft = (slot: number) => {
    setCharCreateSlot(slot);
    setCcCity("MEGACITY JUAN");
    // Seed the start-style toggle from the player's remembered preference
    // (Task #336) so anyone who always picks Veteran doesn't have to re-select
    // it for each new city. Defaults to "guided" for first-time players.
    setStartStyle(defaultStartStyle);
    // Reset the "make this my new default" opt-in each time the modal opens
    // (Task #465) so a previous run's checkbox state never leaks forward.
    setRememberStartStyle(false);
    // Every new city starts from the classic real-time default; the player opts
    // into turn-based explicitly on this screen.
    setNewGameMode("realtime");
    setCcFaction("law_enforcement");
    setCcRegion(STARTING_REGIONS[Math.floor(Math.random() * STARTING_REGIONS.length)]);
    setCcOrigin("none");
    setCcMegacityRoster(createMegacityRoster(Math.floor(Math.random() * 0xffffffff)));
    // Snap identity controls back to law_enforcement preset on every
    // re-open so a previous slot's overrides don't leak into a new run.
    const preset = presetForKey("law_enforcement");
    setCcFactionName(preset.name);
    setCcMotto(preset.motto);
    setCcPrimary(preset.primaryColor);
    setCcSecondary(preset.secondaryColor);
    setCcGlyph(preset.glyph);
  };

  const startCharCreate = (slot: number) => {
    resetCityDraft(slot);
    setIsUnifiedSetup(false);
    setRememberStartStyle(false);
    setShowCharCreate(true);
  };

  const startUnifiedSetup = () => {
    resetProfileDraft();
    resetCityDraft(1);
    setIsUnifiedSetup(true);
    setShowCharCreate(true);
  };

  // When the faction radio changes, snap identity controls to the
  // matching preset. Skips the very first render (which already starts
  // at the law_enforcement preset above) — but harmless if it runs.
  useEffect(() => {
    const preset = presetForKey(ccFaction);
    setCcFactionName(preset.name);
    setCcMotto(preset.motto);
    setCcPrimary(preset.primaryColor);
    setCcSecondary(preset.secondaryColor);
    setCcGlyph(preset.glyph);
  }, [ccFaction]);

  const confirmCharCreate = async () => {
    if (isLaunchingSetup) return;
    setIsLaunchingSetup(true);
    const veteran = startStyle === "veteran";
    try {
      await launchConfiguredNewGame({
        city: {
          slot: charCreateSlot,
          cityName: ccCity,
          difficulty,
          startStyle,
          gameplayMode: newGameMode,
          commanderOrigin: ccOrigin,
          backgroundFaction: ccFaction,
          region: ccRegion,
            megacityRoster: ccMegacityRoster,
          factionIdentity: {
            name: ccFactionName,
            motto: ccMotto,
            primaryColor: ccPrimary,
            secondaryColor: ccSecondary,
            glyph: ccGlyph,
          },
        },
        commander: isUnifiedSetup
          ? {
              name: profileName,
              age: profileAge,
              sex: profileSex,
              portraitId: profilePortraitId,
              customPortraitUri: profileCustomPortrait ?? undefined,
              backstory: profileBackstory,
              attributes: { ...profileAttributes },
              attributePoints: profilePointsLeft,
              traits: [...profileTraits],
            }
          : undefined,
      });
      if (rememberStartStyle && startStyle !== defaultStartStyle) {
        setSetting("defaultStartStyle", startStyle);
      }
      setShowCharCreate(false);
      if (veteran) {
        router.push("/(game)/overview");
      } else if (!skipIntro) {
        router.push("/(game)/onboarding");
      } else {
        setState((prev) => ({ ...prev, hasCompletedOnboarding: true }));
        router.push("/(game)/overview");
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Could not safely create the commander and city. Nothing was saved.";
      showModal("LAUNCH FAILED", message, [{ text: "OK", style: "cancel" }]);
    } finally {
      setIsLaunchingSetup(false);
    }
  };

  useEffect(() => {
    refreshSlotMetas();
  }, [refreshSlotMetas]);

  // ── Steam-screenshot/demo fixture routing ─────────────────────────────
  // Web-only escape hatches. Visiting "/?demo=1" is still dev-only. The
  // packaged save-and-quit smoke test has a separate release-safe fixture
  // capability exposed by the Electron preload bridge.
  // Re-runs whenever the URL search params change so the screenshot tool
  // (which navigates within the same browser session via pushState) can
  // visit /?demo=1&go=law, then /?demo=1&go=economy, etc., and re-trigger
  // the seeder + router.push for each new target.
  const searchParams = useGlobalSearchParams<{
    demo?: string;
    fixture?: string;
    go?: string;
    slots?: string;
  }>();
  // Deep-link entry from the end-state "LOAD A SAVE" flow (a fallen city routes
  // here via router.replace("/?slots=1")). Auto-opens the save manager so the
  // player can pick another save or start a fresh city in any slot.
  useEffect(() => {
    if (searchParams.slots === "1") {
      refreshSlotMetas();
      setShowSlots(true);
    }
  }, [searchParams.slots, refreshSlotMetas]);
  const lastDemoTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
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
    const isDistrictCommandsFixture =
      params.get("districtcommands") === "1" &&
      (window as any).desktop?.districtCommandsFixture === true;
    const isUtilityParityFixture =
      params.get("utilityparity") === "1" &&
      (window as any).desktop?.utilityParityFixture === true;
    const isResearchQueueFixture =
      params.get("researchqueue") === "1" &&
      (window as any).desktop?.researchQueueFixture === true;
    const isRailModulesFixture =
      params.get("railmodules") === "1" &&
      (window as any).desktop?.railModulesFixture === true;
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
    const isPackagedFixture =
      isSaveAndQuitFixture ||
      isRetinueSuccessionFixture ||
      isCommunicationsBoundaryFixture ||
      isMilitaryFoodPoolFixture ||
      isDistrictCommandsFixture ||
      isUtilityParityFixture ||
      isResearchQueueFixture ||
      isRailModulesFixture ||
      isCrimeRecoveryFixture ||
      isMissionMailFixture ||
      isWorldMapEventLogFixture ||
      isMapFoodStorageFixture;
    const demoEnabled =
      (typeof __DEV__ === "undefined" || __DEV__) || isPackagedFixture;
    if (!demoEnabled) return;
    if (params.get("demo") !== "1" && !isPackagedFixture) return;

    // Allow callers to deep-link to any tab in one navigation, e.g.
    // "/?demo=1&go=economy" → seeder routes to /(game)/economy. Defaults
    // to overview when no `go` param is provided. Allow-listed against
    // a known set so a malformed param can't push a junk route.
    const ALLOWED_TABS = new Set([
      "overview", "law", "economy", "worldmap", "construction", "production-chains", "diplomacy",
      "more", "districts", "atlas", "megaprojects", "military", "bestiary", "factions",
      "research", "codex", "inbox", "missions", "officers", "retinue",
      "logbook", "events", "achievements", "stats", "summary", "lore",
      "finances", "trade", "companies", "local-economy", "cybernetics",
      "blackmarket", "criminals", "challenges", "goals", "social",
      "scavenging", "wildlands", "mining", "space", "expansion",
      "propaganda", "recruitment", "upgrades", "prestige", "character",
      "journal", "inventory", "administration", "firsts", "contracts",
      "advisor-briefings",
    ]);
    const goRaw = (searchParams.go as string | undefined) ?? params.get("go") ?? "overview";
    const target = ALLOWED_TABS.has(goRaw) ? goRaw : "overview";
    if (lastDemoTargetRef.current === target) return;
    lastDemoTargetRef.current = target;

    // Keep the save/reload fixture's phase query on the destination route.
    // Expo Router otherwise strips the root query while pushing the game
    // screen, before GameProvider can see its isolated storage namespace.
    const reloadPhase = params.get("factioncooldownreload");
    const factionFixtureQuery =
      params.get("factioncooldowns") === "1" &&
      (reloadPhase === "save" || reloadPhase === "load")
        ? `?demo=1&factioncooldowns=1&factioncooldownreload=${reloadPhase}`
        : "";
    const relationshipRosterPhase = params.get("relationshiprosterphase");
    const relationshipRosterFixtureQuery =
      params.get("relationshiproster") === "1" &&
      (relationshipRosterPhase === "save" || relationshipRosterPhase === "load")
        ? `?demo=1&relationshiproster=1&relationshiprosterphase=${relationshipRosterPhase}`
        : "";
    const personalCommandsFixtureQuery =
      params.get("personalcommands") === "1"
        ? "?demo=1&personalcommands=1"
        : "";
    const multiResponseReload = params.get("multiresponseload");
    const multiResponseFixtureQuery =
      params.get("multiresponse") === "1" &&
      (multiResponseReload === "save" || multiResponseReload === "load")
        ? `?demo=1&multiresponse=1&multiresponseload=${multiResponseReload}`
        : "";
    const biosphereRiskTickerReload = params.get("biospheretickerreload");
    const biosphereRiskTickerFixtureQuery =
      params.get("biosphereticker") === "1" &&
      (biosphereRiskTickerReload === "save" ||
        biosphereRiskTickerReload === "load" ||
        biosphereRiskTickerReload === "cloud-save" ||
        biosphereRiskTickerReload === "cloud-load")
        ? `?demo=1&biosphereticker=1&biospheretickerreload=${biosphereRiskTickerReload}`
        : "";
    const retinueLeadershipReload = params.get("retinueLeadershipReload");
    const retinueLeadershipFixtureQuery =
      params.get("retinueleadership") === "1" &&
      (retinueLeadershipReload === "save" ||
        retinueLeadershipReload === "load" ||
        retinueLeadershipReload === "cloud-save" ||
        retinueLeadershipReload === "cloud-load")
        ? `?demo=1&retinueleadership=1&retinueLeadershipReload=${retinueLeadershipReload}`
        : "";
    const blackMarketAuditReload = params.get("blackMarketAuditReload");
    const blackMarketAuditOutcome = params.get("blackMarketAuditOutcome");
    const blackMarketAuditOutcomeQuery =
      blackMarketAuditOutcome === "delivered" || blackMarketAuditOutcome === "seized"
        ? `&blackMarketAuditOutcome=${blackMarketAuditOutcome}`
        : "";
    const blackMarketAuditFixtureQuery =
      params.get("blackmarketaudit") === "1" &&
      (blackMarketAuditReload === "save" || blackMarketAuditReload === "load")
        ? `?demo=1&blackmarketaudit=1&blackMarketAuditReload=${blackMarketAuditReload}${blackMarketAuditOutcomeQuery}`
        : "";
    const militaryFoodPoolReload = params.get("militaryFoodPoolReload");
    const militaryFoodPoolFixtureQuery =
      params.get("militaryfoodpool") === "1" &&
      (militaryFoodPoolReload === "save" ||
        militaryFoodPoolReload === "load" ||
        militaryFoodPoolReload === "legacy-load")
        ? `?demo=1&militaryfoodpool=1&militaryFoodPoolReload=${militaryFoodPoolReload}`
        : "";
    const missionMailReload = params.get("missionMailReload");
    const missionMailFixtureQuery =
      params.get("missionmail") === "1" &&
      (missionMailReload === "save" || missionMailReload === "load")
        ? `?demo=1&missionmail=1&missionMailReload=${missionMailReload}`
        : "";
    if (missionMailFixtureQuery && missionMailReload && typeof window !== "undefined") {
      window.sessionStorage.setItem(
        "@megacity_e2e_mission_mail_phase",
        missionMailReload,
      );
    }
    const legacyProductionFixtureQuery =
      params.get("legacyproduction") === "1"
        ? "?demo=1&legacyproduction=1"
        : "";
    const medicalStorageFixtureQuery =
      params.get("medicalstorage") === "1"
        ? `?demo=1&medicalstorage=1&medicalstoragecase=${encodeURIComponent(params.get("medicalstoragecase") ?? "live")}` +
          (params.get("medicalStorageReload") === "save" || params.get("medicalStorageReload") === "load"
            ? `&medicalStorageReload=${params.get("medicalStorageReload")}`
            : "")
        : "";
    const researchQueueReload = params.get("researchQueueReload");
    const researchQueueFixtureQuery =
      params.get("researchqueue") === "1"
        ? `?demo=1&researchqueue=1&researchqueuecase=${encodeURIComponent(params.get("researchqueuecase") ?? "active")}` +
          `&researchqueuevariant=${encodeURIComponent(params.get("researchqueuevariant") ?? "base")}` +
          (researchQueueReload === "save" || researchQueueReload === "load"
            ? `&researchQueueReload=${researchQueueReload}`
            : "")
        : "";
    const utilityParityReload = params.get("utilityParityReload");
    const utilityParityStatus = params.get("utilityparitystatus");
    const utilityParityFixtureQuery =
      params.get("utilityparity") === "1"
        ? `?demo=1&utilityparity=1` +
          (utilityParityStatus ? `&utilityparitystatus=${encodeURIComponent(utilityParityStatus)}` : "") +
          (utilityParityReload === "save" || utilityParityReload === "load"
            ? `&utilityParityReload=${utilityParityReload}`
            : "")
        : "";
    const upgradeLabelsFixtureQuery =
      params.get("upgradelabels") === "1"
        ? "?demo=1&upgradelabels=1"
        : "";
    const roleFilterFixtureQuery =
      params.get("rolefilter") === "1"
        ? "?demo=1&rolefilter=1"
        : "";
    const housingFixtureQuery =
      params.get("housing") === "1"
        ? "?demo=1&housing=1&category=housing"
        : "";
    const settlementParityFixtureQuery =
      params.get("settlementparity") === "1"
        ? "?demo=1&settlementparity=1"
        : "";
    const worldMapEventLogFixtureQuery =
      params.get("worldmaplog") === "1"
        ? "?demo=1&worldmaplog=1"
        : "";
    const worldMapExportRestoreReload = params.get("worldmaprestorereload");
    const worldMapExportRestoreFixtureQuery =
      params.get("worldmaprestore") === "1" &&
      (
        worldMapExportRestoreReload === "export" ||
        worldMapExportRestoreReload === "restore" ||
        worldMapExportRestoreReload === "full-backup-export" ||
        worldMapExportRestoreReload === "full-backup-restore"
      )
        ? `?demo=1&worldmaprestore=1&worldmaprestorereload=${worldMapExportRestoreReload}`
        : "";
    const mapFoodStorageFixtureQuery =
      params.get("mapfoodstorage") === "1"
        ? "?demo=1&mapfoodstorage=1"
        : "";
    const summaryExtremeFixtureQuery =
      params.get("summaryextreme") === "1"
        ? "?demo=1&summaryextreme=1"
        : "";
    const railCompletionFixtureQuery =
      ["full", "shortage", "upgrades"].includes(params.get("railcompletion") ?? "")
        ? `?demo=1&railcompletion=${encodeURIComponent(params.get("railcompletion")!)}`
        : "";
    const fixtureQuery =
      (isSaveAndQuitFixture ? "?fixture=save-and-quit" : "") ||
      (isRetinueSuccessionFixture ? "?fixture=retinue-succession" : "") ||
      factionFixtureQuery ||
      relationshipRosterFixtureQuery ||
      personalCommandsFixtureQuery ||
      multiResponseFixtureQuery ||
      biosphereRiskTickerFixtureQuery ||
      retinueLeadershipFixtureQuery ||
      blackMarketAuditFixtureQuery ||
      militaryFoodPoolFixtureQuery ||
      missionMailFixtureQuery ||
      legacyProductionFixtureQuery ||
      researchQueueFixtureQuery ||
      utilityParityFixtureQuery ||
      medicalStorageFixtureQuery ||
      upgradeLabelsFixtureQuery ||
      roleFilterFixtureQuery ||
      housingFixtureQuery ||
      settlementParityFixtureQuery ||
      worldMapEventLogFixtureQuery ||
      worldMapExportRestoreFixtureQuery ||
      mapFoodStorageFixtureQuery ||
      summaryExtremeFixtureQuery ||
      railCompletionFixtureQuery;

    // The GameProvider's `createDemoSeededStateIfRequested` initialiser has
    // already seeded an in-memory city for us when ?demo=1 is in the URL —
    // see context/GameContext.tsx. We deliberately do NOT call
    // startNewGame() here: that writes to AsyncStorage slot 1 and would
    // clobber a real dev save. The seeder is purely ephemeral; refreshing
    // the page resets it. We only need to route to the requested tab.
    // Electron's static renderer can take a few seconds to mount the root
    // layout while loading the large dev bundle. Keep that delay for the
    // development screenshot fixture, but do not make the release smoke
    // fixture depend on development-only route timing.
    const navigationDelay = isSaveAndQuitFixture ? 0 : 5000;
    setTimeout(() => router.push(`/(game)/${target}${fixtureQuery}` as never), navigationDelay);
  }, [searchParams.go, searchParams.demo, searchParams.fixture]);

  const handleNewGameSlot = (slot: number) => {
    const meta = slotMetas.find((m) => m.slotId === slot);
    if (meta && !meta.isEmpty) {
      showModal(
        "OVERWRITE SAVE?",
        `Slot ${slot} contains:\n${meta.playerName}\n${meta.cityName}\nTick ${meta.totalTicks}\n\nThis will be permanently erased.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "OVERWRITE",
            style: "destructive",
            onPress: () => {
              setShowSlots(false);
              startCharCreate(slot);
            },
          },
        ]
      );
    } else {
      setShowSlots(false);
      startCharCreate(slot);
    }
  };

  const handleLoadSlot = async (slot: number) => {
    const ok = await loadSlot(slot);
    if (ok) {
      router.push("/(game)/overview");
    } else {
      showModal("LOAD FAILED", "Could not load save data.", [{ text: "OK", style: "cancel" }]);
    }
  };

  const handleDeleteSlot = (slot: number) => {
    const meta = slotMetas.find((m) => m.slotId === slot);
    if (!meta || meta.isEmpty) return;
    showModal(
      "DELETE SAVE?",
      `Permanently delete:\n${meta.playerName}\n${meta.cityName}\nTick ${meta.totalTicks}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "DELETE",
          style: "destructive",
          onPress: () => deleteSlot(slot),
        },
      ]
    );
  };

  const openLabelEditor = (slot: number, current: string) => {
    setLabelEditorSlot(slot);
    setLabelEditorText(current);
  };

  const closeLabelEditor = () => {
    setLabelEditorSlot(null);
    setLabelEditorText("");
  };

  const submitLabelEditor = async () => {
    if (labelEditorSlot == null) return;
    await setSaveLabel(labelEditorText, labelEditorSlot);
    closeLabelEditor();
  };

  const handleContinue = async () => {
    if (isContinuing) return;
    setIsContinuing(true);
    // Let the button repaint before offline catch-up begins. The simulation is
    // synchronous by design, so without this yield a long catch-up gives no
    // visual acknowledgement that CONTINUE was accepted.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const ok = await loadSlot(activeSlot);
    if (ok) {
      router.push("/(game)/overview");
      return;
    }
    setIsContinuing(false);
    showModal("LOAD FAILED", "Could not load save data.", [{ text: "OK", style: "cancel" }]);
  };

  // Quick "NEW GAME" from the main menu. Auto-picks the first provably
  // empty slot so a brand-new player lands straight in city creation
  // without touching the save manager. Falls back to the slot picker
  // whenever a real choice (or caution) is needed: metas not hydrated,
  // no empty slot left, or the candidate slot has an unresolved cloud
  // save conflict.
  const handleQuickNewGame = () => {
    const candidate = firstEmptyNewGameSlot(slotMetas);
    if (candidate != null && !cloudSaveConflicts.some((c) => c.slotId === candidate)) {
      startCharCreate(candidate);
    } else {
      setShowSlots(true);
    }
  };


  // Creation wizard modal, shared by both menu branches: the pre-profile
  // picker AND the main menu (roster -> NEW COMMANDER). Rendering it only
  // in the no-active-profile branch left the roster button silently dead.
  const profileCreateModal = showProfileCreate && (
          <Modal visible animationType="slide" transparent onRequestClose={() => setShowProfileCreate(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>NEW COMMANDER</Text>
                  <Pressable onPress={() => setShowProfileCreate(false)} accessibilityRole="button" accessibilityLabel="Close new commander setup">
                    <Feather name="x" size={20} color={Colors.accent} />
                  </Pressable>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                  {profileStep === "info" && (
                    <View style={ccStyles.stepContent}>
                      <Text style={ccStyles.fieldLabel}>COMMANDER NAME</Text>
                      <TextInput
                        style={ccStyles.textInput}
                        value={profileName}
                        onChangeText={setProfileName}
                        placeholderTextColor={Colors.textMuted}
                        maxLength={30}
                        autoCorrect={false}
                        accessibilityLabel="Commander name"
                      />
                      <Text style={ccStyles.fieldLabel}>AGE</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <Pressable onPress={() => setProfileAge(a => Math.max(18, a - 1))} style={ccStyles.ageBtn} accessibilityRole="button" accessibilityLabel="Decrease age"><Feather name="minus" size={14} color={Colors.accent} /></Pressable>
                        <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 20, minWidth: 40, textAlign: "center" }}>{profileAge}</Text>
                        <Pressable onPress={() => setProfileAge(a => Math.min(80, a + 1))} style={ccStyles.ageBtn} accessibilityRole="button" accessibilityLabel="Increase age"><Feather name="plus" size={14} color={Colors.accent} /></Pressable>
                      </View>
                      <Text style={ccStyles.fieldLabel}>SEX</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                        {(["male", "female", "other"] as const).map(s => (
                          <Pressable
                            key={s}
                            onPress={() => setProfileSex(s)}
                            style={[ccStyles.sexBtn, profileSex === s && ccStyles.sexBtnActive]}
                          >
                            <Text style={[ccStyles.sexBtnText, profileSex === s && ccStyles.sexBtnTextActive]}>{s.toUpperCase()}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={ccStyles.fieldLabel}>PORTRAIT</Text>
                      <View style={{ alignItems: "center", marginBottom: 8 }}>
                        <View style={{ width: 110, height: 110, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent, overflow: "hidden", backgroundColor: Colors.bgCard }}>
                          {profileCustomPortrait ? (
                            <Image source={{ uri: profileCustomPortrait ?? undefined }} style={{ width: 110, height: 110 }} resizeMode="cover" accessibilityLabel="Uploaded portrait preview" />
                          ) : getPortrait(profilePortraitId) ? (
                            <Image source={getPortrait(profilePortraitId)!} style={{ width: 110, height: 110 }} resizeMode="cover" accessibilityLabel="Selected portrait preview" />
                          ) : null}
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                        <Pressable
                          onPress={async () => {
                            const res = await pickCustomPortrait();
                            if (res.ok) {
                              setProfileCustomPortrait(res.dataUri);
                            } else if (res.reason === "permission") {
                              showModal("PHOTO ACCESS NEEDED", "Allow photo library access in your device settings to upload a portrait.", [{ text: "OK", style: "cancel" }]);
                            } else if (res.reason === "invalid") {
                              showModal("UPLOAD FAILED", "That image could not be processed. Try a different photo.", [{ text: "OK", style: "cancel" }]);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Upload a portrait photo"
                          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard }}
                        >
                          <Feather name="upload" size={13} color={Colors.accent} />
                          <Text style={{ color: Colors.text, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>UPLOAD PHOTO</Text>
                        </Pressable>
                        {profileCustomPortrait ? (
                          <Pressable
                            onPress={() => setProfileCustomPortrait(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Remove uploaded photo"
                            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg }}
                          >
                            <Feather name="x" size={13} color={Colors.textMuted} />
                            <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>REMOVE</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <View style={{ marginBottom: 16 }}>
                        <PortraitPicker
                          selectedId={profileCustomPortrait ? undefined : profilePortraitId}
                          onSelect={(id) => { setProfilePortraitId(id); setProfileCustomPortrait(null); }}
                        />
                      </View>
                      <Text style={ccStyles.fieldLabel}>BACKSTORY (OPTIONAL)</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      </View>
                      <TextInput
                        style={[ccStyles.textInput, { minHeight: 70, textAlignVertical: "top" }]}
                        value={profileBackstory}
                        onChangeText={setProfileBackstory}
                        placeholder="Pick a preset above or write your own…"
                        placeholderTextColor={Colors.textMuted}
                        maxLength={400}
                        multiline
                        autoCorrect={false}
                        accessibilityLabel="Commander backstory"
                      />

                      <Pressable onPress={() => setProfileStep("attributes")} style={[ccStyles.nextBtn, { marginTop: 12 }]}>
                        <Text style={ccStyles.nextBtnText}>NEXT: ATTRIBUTES</Text>
                        <Feather name="arrow-right" size={14} color={Colors.bg} />
                      </Pressable>
                    </View>
                  )}

                  {profileStep === "attributes" && (
                    <View style={ccStyles.stepContent}>
                      <Text style={ccStyles.stepDesc}>
                        Roll the dice or spend bonus points to fine-tune your starting attributes.
                      </Text>
                      <View style={ccStyles.rollRow}>
                        <Pressable onPress={rollProfileAttributes} style={ccStyles.rollBtn}>
                          <MaterialCommunityIcons name="dice-multiple" size={18} color={Colors.bg} />
                          <Text style={ccStyles.rollBtnText}>ROLL DICE</Text>
                        </Pressable>
                        <Text style={ccStyles.pointsLeft}>BONUS POINTS: {profilePointsLeft}</Text>
                      </View>
                      {(Object.keys(profileAttributes) as (keyof typeof profileAttributes)[]).map(attr => (
                        <View key={attr} style={ccStyles.attrRow}>
                          <Text style={ccStyles.attrName}>{attr.toUpperCase()}</Text>
                          <View style={ccStyles.attrControls}>
                            <Pressable
                              onPress={() => adjustProfileAttribute(attr, -1)}
                              style={[ccStyles.attrBtn, profileAttributes[attr] <= 1 && ccStyles.attrBtnDisabled]}
                            >
                              <Text style={ccStyles.attrBtnText}>-</Text>
                            </Pressable>
                            <View style={ccStyles.attrValueWrap}>
                              <Text style={ccStyles.attrValue}>{profileAttributes[attr]}</Text>
                              <View style={ccStyles.attrBar}>
                                <View style={[ccStyles.attrBarFill, { width: `${(profileAttributes[attr] / 10) * 100}%` }]} />
                              </View>
                            </View>
                            <Pressable
                              onPress={() => adjustProfileAttribute(attr, 1)}
                              style={[ccStyles.attrBtn, (profilePointsLeft <= 0 || profileAttributes[attr] >= 10) && ccStyles.attrBtnDisabled]}
                            >
                              <Text style={ccStyles.attrBtnText}>+</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                      <View style={ccStyles.navRow}>
                        <Pressable onPress={() => setProfileStep("info")} style={ccStyles.backBtn}>
                          <Feather name="arrow-left" size={14} color={Colors.accent} />
                          <Text style={ccStyles.backBtnText}>BACK</Text>
                        </Pressable>
                        <Pressable onPress={() => setProfileStep("traits")} style={ccStyles.nextBtn}>
                          <Text style={ccStyles.nextBtnText}>NEXT: TRAITS</Text>
                          <Feather name="arrow-right" size={14} color={Colors.bg} />
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {profileStep === "traits" && (
                    <View style={ccStyles.stepContent}>
                      <Text style={ccStyles.stepDesc}>
                        Select up to 3 traits that define your background. These affect gameplay bonuses and story events.
                      </Text>
                      <Text style={ccStyles.traitCount}>{profileTraits.length}/3 SELECTED</Text>
                      <View style={ccStyles.traitGrid}>
                        {AVAILABLE_TRAITS.map(trait => {
                          const selected = profileTraits.includes(trait);
                          const disabled = !selected && profileTraits.length >= 3;
                          return (
                            <Pressable
                              key={trait}
                              onPress={() => !disabled && toggleProfileTrait(trait)}
                              style={[ccStyles.traitChip, selected && ccStyles.traitChipSelected, disabled && ccStyles.traitChipDisabled]}
                            >
                              <Text style={[ccStyles.traitChipText, selected && ccStyles.traitChipTextSelected]}>
                                {trait.toUpperCase()}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={ccStyles.navRow}>
                        <Pressable onPress={() => setProfileStep("attributes")} style={ccStyles.backBtn}>
                          <Feather name="arrow-left" size={14} color={Colors.accent} />
                          <Text style={ccStyles.backBtnText}>BACK</Text>
                        </Pressable>
                        <Pressable onPress={confirmProfileCreate} style={ccStyles.launchBtn}>
                          <MaterialCommunityIcons name="rocket-launch" size={16} color={Colors.bg} />
                          <Text style={ccStyles.launchBtnText}>CREATE COMMANDER</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
  );

  if (!activeProfile && !isUnifiedSetup) {
    return (
      <ScrollView
        style={[styles.root, { backgroundColor: Colors.bg }]}
        contentContainerStyle={[
          styles.container,
          { paddingTop: menuTopInset + 8, paddingBottom: bottomInset + 20 },
        ]}
      >
        <View style={styles.titleBlock}>
          <View style={styles.titleBorder} />
          <View style={styles.cursorRow}>
            <Text style={styles.cursorLabel}>IDENTIFY YOURSELF, COMMANDER</Text>
            <BlinkingCursor />
          </View>
          <View style={styles.earlyAccessBadge}>
            <Text style={styles.earlyAccessText}>EARLY ACCESS</Text>
          </View>
        </View>

        <View style={styles.menuBlock}>
          <Text style={styles.menuHeader}>// COMMANDER PROFILES</Text>

          {allProfiles.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => selectProfile(p.id)}
              accessibilityLabel={`Open commander profile ${p.name}`}
              style={({ pressed }) => [styles.menuBtn, styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Feather name="user" size={16} color={Colors.accent} />
              <View style={styles.btnContent}>
                <Text style={styles.btnText}>{p.name.toUpperCase()}</Text>
                <Text style={styles.btnSub}>
                  Level {p.commanderLevel} — {p.careerStats?.citiesRun ?? 0} cities founded
                </Text>
              </View>
            </Pressable>
          ))}

          {allProfiles.length < MAX_PROFILES && (
            <Pressable
              onPress={startUnifiedSetup}
              accessibilityLabel="Create a new commander profile"
              style={({ pressed }) => [styles.menuBtn, styles.primaryBtn, pressed && styles.pressed]}
            >
              <Feather name="plus" size={16} color={Colors.bg} />
              <View style={styles.btnContent}>
                <Text style={[styles.btnText, { color: Colors.bg }]}>NEW COMMANDER</Text>
                <Text style={[styles.btnSub, { color: "rgba(10,15,10,0.7)" }]}>
                  Define your commander and launch your first city
                </Text>
              </View>
            </Pressable>
          )}
        </View>

        {profileCreateModal}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { marginTop: 8, opacity: 0.7 }]}>
            MEGACITY v{APP_VERSION} · BUILD {BUILD_NUMBER}
          </Text>
        </View>

        <GameModal {...modal} onDismiss={hideModal} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: Colors.bg }]}
      contentContainerStyle={[
        styles.container,
        { paddingTop: menuTopInset + 8, paddingBottom: bottomInset + 20 },
      ]}
    >
      <View style={styles.titleBlock}>
        <View style={styles.titleBorder} />
        <View style={styles.cursorRow}>
          <Text style={styles.cursorLabel}>WELCOME, {(activeProfile?.name ?? profileName).toUpperCase()}</Text>
          <BlinkingCursor />
        </View>
        <View style={styles.earlyAccessBadge}>
          <Text style={styles.earlyAccessText}>EARLY ACCESS</Text>
        </View>
      </View>

      <View style={styles.menuBlock}>
        <Text style={styles.menuHeader}>// MAIN MENU</Text>

        <Pressable
          onPress={() => setShowProfileSelect(true)}
          accessibilityLabel="Switch commander profile"
          style={({ pressed }) => [styles.menuBtn, { borderColor: Colors.info, borderWidth: 1, backgroundColor: "transparent" }, pressed && styles.pressed]}
        >
          <Feather name="user" size={16} color={Colors.info} />
          <View style={styles.btnContent}>
            <Text style={[styles.btnText, { color: Colors.info }]}>{(activeProfile?.name ?? profileName).toUpperCase()}</Text>
            <Text style={styles.btnSub}>Level {activeProfile?.commanderLevel ?? 1} — Tap to switch commander</Text>
          </View>
        </Pressable>

        {hasRecoverySnapshot && (
          <View style={styles.recoveryRow}>
            <Pressable
              onPress={async () => {
                const ok = await loadRecoverySnapshot();
                if (ok) {
                  router.push("/(game)/overview");
                } else {
                  showModal(
                    "RECOVERY FAILED",
                    "The crash recovery snapshot could not be restored. It may be corrupted.",
                    [{ text: "OK", style: "cancel" }],
                  );
                }
              }}
              style={({ pressed }) => [styles.menuBtn, styles.recoveryBtn, pressed && styles.pressed]}
            >
              <Feather name="shield" size={16} color={Colors.accent} />
              <View style={styles.btnContent}>
                <Text style={styles.btnText}>RESTORE FROM BEFORE THE CRASH</Text>
                <Text style={styles.btnSub}>
                  {recoverySnapshotInfo.cityName ? `${recoverySnapshotInfo.cityName} — ` : ""}
                  Saved {formatRelative(recoverySnapshotInfo.savedAt ?? 0)}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => {
                showModal(
                  "DISCARD RECOVERY?",
                  "Discard the crash recovery snapshot? Your normal saves are not affected.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "DISCARD",
                      style: "destructive",
                      onPress: () => { dismissRecoverySnapshot().catch(() => {}); },
                    },
                  ],
                );
              }}
              style={({ pressed }) => [styles.recoveryDismissBtn, pressed && styles.pressed]}
              accessibilityLabel="Discard crash recovery snapshot"
            >
              <Feather name="x" size={16} color={Colors.muted} />
            </Pressable>
          </View>
        )}

        {cloudSaveConflicts.length > 0 && cloudSaveConflicts.map((conflict) => {
          const localNewer = conflict.localSavedAt >= conflict.cloudSavedAt;
          return (
            <View key={`cloud-conflict-${conflict.slotId}`} style={styles.cloudConflictBox}>
              <View style={styles.cloudConflictHeader}>
                <Feather name="cloud" size={16} color={Colors.accent} />
                <Text style={styles.cloudConflictTitle}>CLOUD SAVE CONFLICT — SLOT {conflict.slotId}</Text>
              </View>
              <Text style={styles.cloudConflictBody}>
                {conflict.cityName} has different progress on this device and in Steam Cloud.
                Choose which one to keep — the other copy will be overwritten.
              </Text>
              <View style={styles.cloudConflictChoices}>
                <Pressable
                  onPress={() => { resolveCloudConflict(conflict.slotId, "local").catch(() => {}); }}
                  style={({ pressed }) => [styles.cloudConflictBtn, localNewer && styles.cloudConflictBtnRecommended, pressed && styles.pressed]}
                >
                  <Feather name="smartphone" size={14} color={Colors.text} />
                  <Text style={styles.cloudConflictBtnText}>KEEP THIS DEVICE</Text>
                  <Text style={styles.cloudConflictBtnSub}>
                    Tick {conflict.localTotalTicks} — {formatRelative(conflict.localSavedAt)}{localNewer ? " (newer)" : ""}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => { resolveCloudConflict(conflict.slotId, "cloud").catch(() => {}); }}
                  style={({ pressed }) => [styles.cloudConflictBtn, !localNewer && styles.cloudConflictBtnRecommended, pressed && styles.pressed]}
                >
                  <Feather name="cloud" size={14} color={Colors.text} />
                  <Text style={styles.cloudConflictBtnText}>KEEP CLOUD</Text>
                  <Text style={styles.cloudConflictBtnSub}>
                    Tick {conflict.cloudTotalTicks} — {formatRelative(conflict.cloudSavedAt)}{!localNewer ? " (newer)" : ""}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {(cloudSaveStatus === "unavailable" || cloudSaveStatus === "error") && (
          <View style={styles.cloudStatusRow}>
            <Feather name="cloud-off" size={13} color={Colors.muted} />
            <Text style={styles.cloudStatusText}>
              {cloudSaveStatus === "unavailable"
                ? "Steam Cloud unavailable — playing offline. Progress is saved on this device."
                : "Steam Cloud sync had a problem — your local progress is safe and will re-sync."}
            </Text>
          </View>
        )}

        {hasSave && (
          <Pressable
            onPress={() => { handleContinue().catch(() => setIsContinuing(false)); }}
            disabled={isContinuing}
            style={({ pressed }) => [styles.menuBtn, styles.primaryBtn, pressed && styles.pressed]}
          >
            <Feather name="play" size={16} color={Colors.bg} />
            <View style={styles.btnContent}>
              <Text style={[styles.btnText, { color: Colors.bg }]}>
                {isContinuing ? "RESTORING SECTOR..." : "CONTINUE"}
              </Text>
              <Text style={[styles.btnSub, { color: "rgba(10,15,10,0.7)" }]}>
                {isContinuing
                  ? "Applying offline progress"
                  : `${state.player?.name ?? "Commander Unknown"} — ${state.cityName} — TICK ${state.totalTicks}`}
              </Text>
            </View>
          </Pressable>
        )}

        <Pressable
          onPress={handleQuickNewGame}
          accessibilityLabel="Start a new game"
          style={({ pressed }) => [styles.menuBtn, hasSave ? styles.secondaryBtn : styles.primaryBtn, pressed && styles.pressed]}
        >
          <Feather name="plus" size={16} color={hasSave ? Colors.accent : Colors.bg} />
          <View style={styles.btnContent}>
            <Text style={[styles.btnText, !hasSave && { color: Colors.bg }]}>NEW GAME</Text>
            <Text style={[styles.btnSub, !hasSave && { color: "rgba(10,15,10,0.7)" }]}>
              Found a new city
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setShowSlots(true)}
          accessibilityLabel="Open save slots"
          style={({ pressed }) => [styles.menuBtn, styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Feather name="save" size={16} color={Colors.accent} />
          <View style={styles.btnContent}>
            <Text style={styles.btnText}>SAVE SLOTS</Text>
            <Text style={styles.btnSub}>6 slots — New game, load, or delete saves</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setShowDifficulty(true)}
          accessibilityLabel="Choose difficulty"
          style={({ pressed }) => [styles.menuBtn, styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Feather name="sliders" size={16} color={Colors.accent} />
          <View style={styles.btnContent}>
            <Text style={styles.btnText}>DIFFICULTY</Text>
            <Text style={styles.btnSub}>Current: {difficulty.toUpperCase()}</Text>
          </View>
        </Pressable>

        {hasSave && (
          <Pressable
            onPress={() => {
              showModal(
                "RESET SECTOR",
                "This will wipe your current game and start fresh in the same slot. Proceed?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "RESET",
                    style: "destructive",
                    onPress: () => {
                      startNewGame(activeSlot);
                      router.push("/(game)/overview");
                    },
                  },
                ]
              );
            }}
            accessibilityLabel="Reset sector"
            style={({ pressed }) => [styles.menuBtn, styles.dangerBtn, pressed && styles.pressed]}
          >
            <Feather name="refresh-cw" size={16} color={Colors.danger} />
            <View style={styles.btnContent}>
              <Text style={[styles.btnText, { color: Colors.danger }]}>RESET SECTOR</Text>
              <Text style={[styles.btnSub, { color: Colors.danger + "88" }]}>
                Wipes all progress (Slot {activeSlot})
              </Text>
            </View>
          </Pressable>
        )}

        <Pressable
          onPress={() => { setAchCat("all"); setShowAchievements(true); }}
          accessibilityLabel="Open achievements"
          style={({ pressed }) => [styles.menuBtn, styles.secondaryBtn, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="trophy-outline" size={16} color={Colors.warning} />
          <View style={styles.btnContent}>
            <Text style={[styles.btnText, { color: Colors.warning }]}>ACHIEVEMENTS</Text>
            <Text style={styles.btnSub}>{globalAchievements.length}/{ACHIEVEMENTS.length} unlocked across all saves</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setShowManual(true)}
          accessibilityLabel="Open game manual"
          style={({ pressed }) => [styles.menuBtn, styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Feather name="book-open" size={16} color={Colors.info} />
          <View style={styles.btnContent}>
            <Text style={[styles.btnText, { color: Colors.info }]}>GAME MANUAL</Text>
            <Text style={styles.btnSub}>How to play MEGACITY</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setShowDevUpdates(true)}
          accessibilityLabel="Open development updates"
          style={({ pressed }) => [styles.menuBtn, styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Feather name="radio" size={16} color={Colors.accent} />
          <View style={styles.btnContent}>
            <Text style={styles.btnText}>DEVELOPMENT UPDATES</Text>
            <Text style={styles.btnSub}>Patch notes & roadmap</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setShowAbout(true)}
          accessibilityLabel="Open about information"
          style={({ pressed }) => [styles.menuBtn, styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Feather name="info" size={16} color={Colors.accent} />
          <View style={styles.btnContent}>
            <Text style={styles.btnText}>ABOUT</Text>
            <Text style={styles.btnSub}>Game information</Text>
          </View>
        </Pressable>

        {isElectronShell() && (
          <Pressable
            onPress={() => {
              showModal(
                "QUIT GAME",
                "Close MEGACITY and return to the desktop?",
                [
                  { text: "CANCEL", style: "cancel" },
                  {
                    text: "QUIT",
                    style: "destructive",
                    onPress: () => {
                      hideModal();
                      quitDesktopApp();
                    },
                  },
                ]
              );
            }}
            style={({ pressed }) => [styles.menuBtn, styles.dangerBtn, pressed && styles.pressed]}
          >
            <Feather name="power" size={16} color={Colors.danger} />
            <View style={styles.btnContent}>
              <Text style={[styles.btnText, { color: Colors.danger }]}>QUIT GAME</Text>
              <Text style={styles.btnSub}>Close the game window</Text>
            </View>
          </Pressable>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          SIMULATION TICKS AT CONFIGURABLE INTERVALS (DEFAULT 15 MIN)
        </Text>
        <Text style={styles.footerText}>OFFLINE PROGRESS IS CALCULATED ON RESUME</Text>
        <Text style={[styles.footerText, { marginTop: 8, opacity: 0.7 }]}>
          MEGACITY v{APP_VERSION} · BUILD {BUILD_NUMBER}
        </Text>
        {/* Web/desktop keyboard cheat sheet. Hidden on native because the
            relevant shortcuts (H for photo mode, ESC for back, etc.) only
            fire from the desktop key handler in useDesktopPolish. We render
            this in the menu footer rather than the in-game HUD so it's a
            once-and-done discovery rather than persistent visual noise. */}
        {Platform.OS === "web" ? (
          <>
            <Text style={[styles.footerText, { marginTop: 8, opacity: 0.7 }]}>
              DESKTOP SHORTCUTS
            </Text>
            <Text style={[styles.footerText, { opacity: 0.55 }]}>
              SPACE = PAUSE/RESUME · +/- = CYCLE TICK SPEED · H = PHOTO MODE
            </Text>
            <Text style={[styles.footerText, { opacity: 0.55 }]}>
              1–7 = TOP NAV · Q–U = QUICK NAV · F = FULLSCREEN · ESC = HOME · CTRL+S = QUICK SAVE
            </Text>
          </>
        ) : null}
      </View>

      {/* SAVE SLOTS MODAL */}
      <Modal
        visible={showSlots}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSlots(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SAVE SLOTS</Text>
              <Pressable onPress={() => setShowSlots(false)} accessibilityRole="button" accessibilityLabel="Close save slots">
                <Feather name="x" size={20} color={Colors.accent} />
              </Pressable>
            </View>

            <ScrollView style={styles.slotList} contentContainerStyle={{ paddingBottom: 20 }}>
              {[1, 2, 3, 4, 5, 6].map((slot) => {
                const meta = slotMetas.find((m) => m.slotId === slot);
                const empty = !meta || meta.isEmpty;
                const isActive = slot === activeSlot && hasSave;

                return (
                  <View key={slot} style={[styles.slotCard, isActive && styles.slotCardActive]}>
                    <View style={styles.slotHeader}>
                      <Text style={styles.slotLabel}>SLOT {slot}</Text>
                      {/* Right-aligned badge cluster: HONOR pill (perma-death
                          slot indicator) sits next to the ACTIVE pill so a
                          player can see at a glance which slots are
                          perma-death runs before clicking LOAD. Wrapped in a
                          row so slotHeader's space-between still anchors
                          them to the right edge. */}
                      <View style={styles.slotHeaderBadges}>
                        {!empty && meta!.honorMode && <Text style={styles.slotHonorBadge}>HONOR</Text>}
                        {isActive && <Text style={styles.slotActiveBadge}>ACTIVE</Text>}
                      </View>
                    </View>

                    {empty ? (
                      <View style={styles.slotEmpty}>
                        <Feather name="inbox" size={18} color={Colors.textMuted} />
                        <Text style={styles.slotEmptyText}>EMPTY SLOT</Text>
                      </View>
                    ) : (
                      <View style={styles.slotInfo}>
                        {meta!.label ? (
                          <Text style={styles.slotCustomLabel}>{meta!.label}</Text>
                        ) : null}
                        <Text style={styles.slotName}>{meta!.playerName}</Text>
                        <Text style={styles.slotCity}>{meta!.cityName}</Text>
                        <View style={styles.slotStatsRow}>
                          <Text style={styles.slotStat}>LVL {meta!.playerLevel}</Text>
                          <Text style={styles.slotStat}>TICK {meta!.totalTicks}</Text>
                          <Text style={styles.slotStat}>POP {(meta!.population / 1000).toFixed(0)}k</Text>
                        </View>
                        <Text style={styles.slotDate}>Saved {formatRelative(meta!.lastSaved)}</Text>
                      </View>
                    )}

                    <View style={styles.slotActions}>
                      {!empty && (
                        <Pressable
                          onPress={() => { setShowSlots(false); handleLoadSlot(slot); }}
                          style={[styles.slotBtn, styles.slotLoadBtn]}
                        >
                          <Feather name="download" size={12} color={Colors.accent} />
                          <Text style={styles.slotBtnText}>LOAD</Text>
                        </Pressable>
                      )}
                      {!empty && (
                        <Pressable
                          onPress={() => openLabelEditor(slot, meta!.label ?? "")}
                          style={[styles.slotBtn, styles.slotEditBtn]}
                        >
                          <Feather name="edit-2" size={12} color={Colors.accent} />
                          <Text style={styles.slotBtnText}>EDIT</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => { setShowSlots(false); handleNewGameSlot(slot); }}
                        style={[styles.slotBtn, styles.slotNewBtn]}
                      >
                        <Feather name="plus" size={12} color={Colors.accent} />
                        <Text style={styles.slotBtnText}>{empty ? "NEW GAME" : "NEW"}</Text>
                      </Pressable>
                      {!empty && (
                        <Pressable
                          onPress={() => handleDeleteSlot(slot)}
                          style={[styles.slotBtn, styles.slotDeleteBtn]}
                        >
                          <Feather name="trash-2" size={12} color={Colors.danger} />
                          <Text style={[styles.slotBtnText, { color: Colors.danger }]}>DELETE</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* LABEL EDITOR MODAL */}
      <Modal
        visible={labelEditorSlot != null}
        animationType="fade"
        transparent
        onRequestClose={closeLabelEditor}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.labelEditorBox, { paddingTop: 16, paddingBottom: 16 }]}>
            <Text style={styles.modalTitle}>RENAME SLOT {labelEditorSlot ?? ""}</Text>
            <Text style={styles.labelEditorHint}>Up to 40 characters. Leave blank to clear.</Text>
            <TextInput
              value={labelEditorText}
              onChangeText={setLabelEditorText}
              maxLength={40}
              placeholder="e.g. Iron Run, Reform Era, Pre-War Save"
              placeholderTextColor={Colors.textMuted}
              style={styles.labelEditorInput}
              autoFocus
              onSubmitEditing={submitLabelEditor}
              accessibilityLabel="Save slot label"
            />
            <View style={styles.labelEditorActions}>
              <Pressable onPress={closeLabelEditor} style={[styles.slotBtn, styles.slotNewBtn]}>
                <Text style={styles.slotBtnText}>CANCEL</Text>
              </Pressable>
              <Pressable onPress={submitLabelEditor} style={[styles.slotBtn, styles.slotLoadBtn]}>
                <Feather name="check" size={12} color={Colors.accent} />
                <Text style={styles.slotBtnText}>SAVE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* DIFFICULTY MODAL */}
      <Modal
        visible={showDifficulty}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDifficulty(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>DIFFICULTY</Text>
              <Pressable onPress={() => setShowDifficulty(false)} accessibilityRole="button" accessibilityLabel="Close difficulty selection">
                <Feather name="x" size={20} color={Colors.accent} />
              </Pressable>
            </View>
            <ScrollView style={styles.slotList} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={styles.creditsHeading}>// SELECT DIFFICULTY LEVEL</Text>
              <Text style={styles.creditsSub}>Difficulty affects resource rates, crime severity, faction aggression, and event frequency. This setting can be changed at any time.</Text>

              {([
                { key: "easy" as Difficulty, label: "EASY", icon: "shield" as const, desc: "Reduced crime, slower faction aggression, generous resource rates. Recommended for new commanders.", color: Colors.accent },
                { key: "medium" as Difficulty, label: "MEDIUM", icon: "target" as const, desc: "Standard simulation parameters. Balanced challenge for experienced players.", color: Colors.warning },
                { key: "hard" as Difficulty, label: "HARD", icon: "zap" as const, desc: "Elevated crime, aggressive factions, scarce resources, frequent disasters. For veteran commanders only.", color: Colors.danger },
              ]).map((d) => (
                <Pressable
                  key={d.key}
                  onPress={() => setDifficulty(d.key)}
                  style={[
                    styles.diffCard,
                    difficulty === d.key && { borderColor: d.color },
                  ]}
                >
                  <View style={styles.diffHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Feather name={d.icon} size={16} color={d.color} />
                      <Text style={[styles.diffLabel, { color: d.color }]}>{d.label}</Text>
                    </View>
                    {difficulty === d.key && (
                      <View style={[styles.diffActiveBadge, { backgroundColor: d.color + "20", borderColor: d.color }]}>
                        <Text style={[styles.diffActiveText, { color: d.color }]}>SELECTED</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.diffDesc}>{d.desc}</Text>
                </Pressable>
              ))}

              <View style={styles.diffNote}>
                <Feather name="info" size={12} color={Colors.textMuted} />
                <Text style={styles.diffNoteText}>Difficulty affects income, upkeep, crime, unrest, and research speed.</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GAME MANUAL MODAL */}
      <Modal
        visible={showManual}
        animationType="slide"
        transparent
        onRequestClose={() => setShowManual(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
            <View style={styles.modalHeader}>
              <Feather name="book-open" size={18} color={Colors.info} />
              <Text style={[styles.modalTitle, { flex: 1, color: Colors.info }]}>GAME MANUAL</Text>
              <Pressable onPress={() => setShowManual(false)} accessibilityRole="button" accessibilityLabel="Close game manual">
                <Feather name="x" size={20} color={Colors.accent} />
              </Pressable>
            </View>

            <View style={styles.manualTabBar}>
              <Pressable
                style={[styles.manualTabBtn, manualTab === "manual" && styles.manualTabBtnActive]}
                onPress={() => setManualTab("manual")}
              >
                <Feather name="book-open" size={14} color={manualTab === "manual" ? Colors.bg : Colors.textSecondary} />
                <Text style={[styles.manualTabLabel, manualTab === "manual" && styles.manualTabLabelActive]}>MANUAL</Text>
              </Pressable>
              <Pressable
                style={[styles.manualTabBtn, manualTab === "controls" && styles.manualTabBtnActive]}
                onPress={() => setManualTab("controls")}
              >
                <Feather name="command" size={14} color={manualTab === "controls" ? Colors.bg : Colors.textSecondary} />
                <Text style={[styles.manualTabLabel, manualTab === "controls" && styles.manualTabLabelActive]}>CONTROLS</Text>
              </Pressable>
            </View>

            {manualTab === "manual" ? (
            <ScrollView style={styles.slotList} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
              <Text style={{ color: Colors.warning, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1, textAlign: "center", marginBottom: 12 }}>
                THIS MANUAL IS UNDER DEVELOPMENT AND SUBJECT TO CHANGE ALONG WITH THE GAME
              </Text>
              <View style={styles.devDivider} />

              <Text style={styles.devUpdateVersion}>WELCOME, COMMANDER</Text>
              <Text style={[styles.devUpdateItem, { marginBottom: 12 }]}>{MANUAL_INTRO}</Text>

              {MANUAL_SECTIONS.map((section, sIdx) => (
                <View key={section.title}>
                  <Text
                    style={[
                      styles.devUpdateItem,
                      {
                        color: section.color === "info" ? Colors.info : Colors.accent,
                        fontFamily: "Inter_700Bold",
                        marginTop: sIdx === 0 ? 0 : 12,
                        marginBottom: 4,
                      },
                    ]}
                  >
                    {section.title}
                  </Text>
                  {section.items.map((item, iIdx) => (
                    <Text key={iIdx} style={styles.devUpdateItem}>- {item}</Text>
                  ))}
                </View>
              ))}

              <View style={styles.devDivider} />
              <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center", lineHeight: 18 }}>
                {MANUAL_OUTRO}
              </Text>
            </ScrollView>
            ) : (
            <ScrollView style={styles.slotList} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>

              <Text style={[styles.devUpdateVersion, { color: Colors.accent }]}>KEYBOARD SHORTCUTS</Text>
              <Text style={[styles.devUpdateItem, { color: Colors.info, marginBottom: 8 }]}>Press ? at any time in-game to see the quick shortcut overlay.</Text>

              <View style={styles.controlsSection}>
                <Text style={styles.controlsSectionTitle}>TOP NAVIGATION</Text>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>1</Text><Text style={styles.controlsDesc}>City Overview</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>2</Text><Text style={styles.controlsDesc}>Law & Edicts</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>3</Text><Text style={styles.controlsDesc}>Economy</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>4</Text><Text style={styles.controlsDesc}>World Map</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>5</Text><Text style={styles.controlsDesc}>Construction</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>6</Text><Text style={styles.controlsDesc}>Diplomacy</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>7</Text><Text style={styles.controlsDesc}>More</Text></View>
              </View>

              <View style={styles.controlsSection}>
                <Text style={styles.controlsSectionTitle}>QUICK ACCESS BAR</Text>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>Q</Text><Text style={styles.controlsDesc}>Inbox</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>W</Text><Text style={styles.controlsDesc}>Research</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>E</Text><Text style={styles.controlsDesc}>Military</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>R</Text><Text style={styles.controlsDesc}>Factions</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>T</Text><Text style={styles.controlsDesc}>Events</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>Y</Text><Text style={styles.controlsDesc}>Dossier</Text></View>
              </View>

              <View style={styles.controlsSection}>
                <Text style={styles.controlsSectionTitle}>GAME CONTROLS</Text>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>SPACE</Text><Text style={styles.controlsDesc}>Pause / Resume simulation</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>+</Text><Text style={styles.controlsDesc}>Increase game speed</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>-</Text><Text style={styles.controlsDesc}>Decrease game speed</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>F</Text><Text style={styles.controlsDesc}>Toggle fullscreen</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>D</Text><Text style={styles.controlsDesc}>Debug console</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKey}>ESC</Text><Text style={styles.controlsDesc}>Return to City Overview</Text></View>
              </View>

              <View style={styles.controlsSection}>
                <Text style={styles.controlsSectionTitle}>SUB-TABS</Text>
                <View style={styles.controlsRow}><Text style={styles.controlsKeyWide}>LEFT</Text><Text style={styles.controlsDesc}>Previous sub-tab</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKeyWide}>RIGHT</Text><Text style={styles.controlsDesc}>Next sub-tab</Text></View>
              </View>

              <View style={styles.devDivider} />

              <Text style={[styles.devUpdateVersion, { color: Colors.accent }]}>MOUSE CONTROLS</Text>

              <View style={styles.controlsSection}>
                <Text style={styles.controlsSectionTitle}>GENERAL</Text>
                <View style={styles.controlsRow}><Text style={styles.controlsKeyWide}>LEFT CLICK</Text><Text style={styles.controlsDesc}>Select, navigate, build, deploy</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKeyWide}>HOVER</Text><Text style={styles.controlsDesc}>Show tooltips on resources, stats, buildings</Text></View>
              </View>

              <View style={styles.controlsSection}>
                <Text style={styles.controlsSectionTitle}>WORLD MAP</Text>
                <View style={styles.controlsRow}><Text style={styles.controlsKeyWide}>SCROLL</Text><Text style={styles.controlsDesc}>Zoom in / out</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKeyWide}>DRAG</Text><Text style={styles.controlsDesc}>Pan the map</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKeyWide}>RIGHT CLICK</Text><Text style={styles.controlsDesc}>Context menu on map nodes</Text></View>
              </View>

              <View style={styles.controlsSection}>
                <Text style={styles.controlsSectionTitle}>CURSOR STATES</Text>
                <View style={styles.controlsRow}><Text style={styles.controlsKeyWide}>POINTER</Text><Text style={styles.controlsDesc}>Clickable element</Text></View>
                <View style={styles.controlsRow}><Text style={styles.controlsKeyWide}>GRAB</Text><Text style={styles.controlsDesc}>Draggable map area</Text></View>
              </View>

            </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ACHIEVEMENTS MODAL */}
      <Modal
        visible={showAchievements}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="trophy-outline" size={18} color={Colors.warning} />
              <Text style={[styles.modalTitle, { flex: 1, color: Colors.warning }]}>ACHIEVEMENTS</Text>
              <Text style={[styles.slotLabel, { marginRight: 12 }]}>{globalAchievements.length}/{ACHIEVEMENTS.length}</Text>
              <Pressable onPress={() => setShowAchievements(false)} accessibilityRole="button" accessibilityLabel="Close achievements">
                <Feather name="x" size={20} color={Colors.accent} />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <View style={{ height: 6, backgroundColor: Colors.bgSecondary, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ height: "100%", backgroundColor: Colors.warning, borderRadius: 3, width: `${Math.round((globalAchievements.length / ACHIEVEMENTS.length) * 100)}%` }} />
              </View>
              <Text style={{ color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 1, marginTop: 4, textAlign: "right" }}>
                {Math.round((globalAchievements.length / ACHIEVEMENTS.length) * 100)}% COMPLETE — ALL SAVES COMBINED
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42, borderBottomWidth: 1, borderBottomColor: Colors.border }} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: "center", paddingVertical: 6 }}>
              <Pressable
                onPress={() => setAchCat("all")}
                style={[styles.catChip, achCat === "all" && styles.catChipActive]}
              >
                <Feather name="list" size={10} color={achCat === "all" ? Colors.bg : Colors.textMuted} />
                <Text style={[styles.catChipText, achCat === "all" && styles.catChipTextActive]}>ALL</Text>
              </Pressable>
              {(Object.keys(ACHIEVEMENT_CATEGORY_LABELS) as AchievementCategory[]).map((cat) => {
                const catCount = ACHIEVEMENTS.filter((a) => a.category === cat && globalAchievements.includes(a.id)).length;
                const catTotal = ACHIEVEMENTS.filter((a) => a.category === cat).length;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setAchCat(cat)}
                    style={[styles.catChip, achCat === cat && styles.catChipActive]}
                  >
                    <Text style={[styles.catChipText, achCat === cat && styles.catChipTextActive]}>
                      {ACHIEVEMENT_CATEGORY_LABELS[cat]}
                    </Text>
                    <Text style={[styles.catChipCount, achCat === cat && { color: Colors.bg }]}>
                      {catCount}/{catTotal}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView style={styles.slotList} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 }}>
              {(achCat === "all" ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.category === achCat)).map((ach) => {
                const isUnlocked = globalAchievements.includes(ach.id);
                return (
                  <View key={ach.id} style={[styles.achRow, isUnlocked && styles.achRowUnlocked]}>
                    <View style={[styles.achIconWrap, isUnlocked && styles.achIconWrapUnlocked]}>
                      <Feather name={ach.icon as any} size={14} color={isUnlocked ? Colors.bg : Colors.textMuted + "60"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.achTitle, isUnlocked && styles.achTitleUnlocked]}>{ach.title}</Text>
                      <Text style={[styles.achDesc, isUnlocked && styles.achDescUnlocked]}>{ach.description}</Text>
                    </View>
                    {isUnlocked && <MaterialCommunityIcons name="check-circle" size={16} color={Colors.warning} />}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DEVELOPMENT UPDATES MODAL */}
      <Modal
        visible={showDevUpdates}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDevUpdates(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>DEVELOPMENT UPDATES</Text>
              <Pressable onPress={() => setShowDevUpdates(false)} accessibilityRole="button" accessibilityLabel="Close development updates">
                <Feather name="x" size={20} color={Colors.accent} />
              </Pressable>
            </View>
            <ScrollView style={styles.slotList} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={[styles.devUpdateItem, { color: Colors.info, textAlign: "center", marginBottom: 16, fontSize: 14, fontFamily: "Inter_600SemiBold" }]}>
                This game is under constant development
              </Text>
              <Text style={[styles.devUpdateDate, { textAlign: "center", marginBottom: 20 }]}>
                {formatDevUpdateDate(CHANGELOG[0].date)}
              </Text>

              <View style={styles.devUpdateEntry}>
                <Text style={styles.devUpdateVersion}>CURRENT DEVELOPMENT UPDATE</Text>
                <Text style={styles.devUpdateDate}>SEPTEMBER 2026</Text>
                <View style={styles.devUpdateItems}>
                  <Text style={[styles.devUpdateItem, { color: Colors.accent, fontFamily: "Inter_700Bold", marginTop: 8, marginBottom: 4 }]}>
                    THE CITY KEEPS MOVING
                  </Text>
                  <Text style={styles.devUpdateItem}>
                    MEGACITY is moving from a city-management prototype into a deeper operational sandbox. The current build is focused on making every system survive contact with a real save: infrastructure, utilities, settlements, missions, research, factions, housing, and the world map all have to remain coherent across ticks, reloads, offline catch-up, and Steam Cloud.
                  </Text>
                  <Text style={styles.devUpdateItem}>
                    Development is continuing across the full command loop — clearer warnings, stronger recovery paths, more dependable persistence, and a world that keeps its consequences instead of quietly resetting them. The goal is not just more content. It is a city that can remember what happened to it.
                  </Text>
                  <Text style={styles.devUpdateItem}>
                    The long-term direction remains the same: a darkly funny strategy simulation with real trade-offs, persistent human costs, a living wasteland, and enough bureaucracy to make the apocalypse feel administratively complete.
                  </Text>
                </View>
              </View>
              <View style={styles.devDivider} />

              {CHANGELOG.map((entry, entryIdx) => (
                <View key={entry.version}>
                  {entryIdx > 0 ? <View style={styles.devDivider} /> : null}
                  <View style={styles.devUpdateEntry}>
                    <Text style={styles.devUpdateVersion}>
                      {`v${entry.version}${entry.title ? ` — ${entry.title.toUpperCase()}` : ""}`}
                    </Text>
                    <Text style={styles.devUpdateDate}>{formatDevUpdateDate(entry.date)}</Text>
                    <View style={styles.devUpdateItems}>
                      {entry.sections.map((section) => (
                        <View key={section.heading}>
                          <Text style={[styles.devUpdateItem, { color: Colors.accent, fontFamily: "Inter_700Bold", marginTop: 8, marginBottom: 4 }]}>
                            {section.heading.toUpperCase()}
                          </Text>
                          {section.items.map((item, idx) => (
                            <Text key={idx} style={styles.devUpdateItem}>{`- ${item}`}</Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ABOUT MODAL */}
      <Modal
        visible={showAbout}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAbout(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ABOUT</Text>
              <Pressable onPress={() => setShowAbout(false)} accessibilityRole="button" accessibilityLabel="Close about">
                <Feather name="x" size={20} color={Colors.accent} />
              </Pressable>
            </View>
            <ScrollView style={styles.slotList} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={[styles.aboutValue, { color: Colors.accent, fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 3, textAlign: "center", marginBottom: 4 }]}>
                MEGACITY
              </Text>
              <Text style={[styles.aboutValue, { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", letterSpacing: 1, textAlign: "center", marginBottom: 16 }]}>
                v{APP_VERSION} (build {BUILD_NUMBER})
              </Text>

              <View style={styles.aboutDivider} />

              <Text style={[styles.aboutValue, { color: Colors.accent, fontSize: 13, lineHeight: 22, marginBottom: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" }]}>
                The world ended. The paperwork didn't.
              </Text>
              <Text style={[styles.aboutValue, { color: Colors.textSecondary, fontSize: 12, lineHeight: 20, marginBottom: 12 }]}>
                 You are the Sector Marshal of a vast megacity built on top of a dead world. You did not build this city. You inherited it: crumbling infrastructure, humming reactors, hostile factions, crowded districts, and a population that expects you to keep the lights on.
              </Text>
              <Text style={[styles.aboutValue, { color: Colors.textSecondary, fontSize: 12, lineHeight: 20, marginBottom: 12 }]}>
                 You are part mayor, part warlord, part bureaucrat — the only thing standing between civilization and total urban collapse. This is not a city builder. The city already exists. Your job is to stop it from killing itself.
              </Text>
               {[
                 ["A CITY THAT FIGHTS BACK", "MEGACITY is a dystopian idle and strategy management simulation with the depth of a spreadsheet and the soul of a dark comic. Govern through laws, policies, edicts, budgets, research, construction, diplomacy, espionage, military force, and the occasional act of bureaucratic desperation.\n\nThe simulation tracks the systems that keep a city alive: food, water, power, industry, trade, housing, employment, health, crime, corruption, morale, unrest, infrastructure, weather, radiation, and the biosphere. Every improvement creates new pressures. Every shortcut leaves a bill for someone else."],
                 ["THE PEOPLE BEHIND THE NUMBERS", "Your citizens are not just a population bar. Crime, accidents, disease, disasters, attacks, harsh weather, radiation, and military operations leave human consequences behind.\n\nResidents can be wounded, sick, or missing. Some recover. Some do not. Deaths are recorded by cause, while injured and missing people remain part of the city's ongoing burden. Progress can reduce the damage, but it cannot make catastrophe harmless.\n\nYour officers, advisors, captains, soldiers, workers, and commanders have their own roles, traits, loyalties, and failures. Competence matters. Loyalty matters more."],
                 ["FACTIONS, FAITHS, AND POWER", "Internal factions compete for influence over the city. Negotiate, appease, manipulate, investigate, suppress, or let rivalries turn into open conflict. Factions have leaders, demands, loyalties, threats, beliefs, and changing relationships with one another.\n\nFaiths move through the districts and pull at loyalty, crime, corruption, and unrest. Sponsor a faith, tolerate it, suppress it, or remain secular. If one belief takes hold, you can build a leader cult around yourself — gaining influence while inviting schisms, backlash, corruption, and assassins."],
                 ["MILITARY COMMAND", "Build squads from distinct troop classes and combine them into formations with different strengths. Choose deployment doctrines, match troop composition to the mission, and use captains whose traits change how a squad fights, moves, and survives.\n\nRecruitment and construction take time. Missions have real consequences. Casualties are persistent, injured troops need treatment, and a fallen captain does not have to erase an entire formation. Prepare a successor, preserve the squad, and decide what victory is worth."],
                 ["THE WASTELAND AND THE BIOSPHERE", "Beyond the walls lie irradiated deserts, toxic waterways, overgrown ruins, abandoned infrastructure, strange wildlife, settlements, raiders, salvage, and communities that chose life outside the city's control.\n\nSend expeditions into the wastes, establish trade, recover technology, hunt megafauna, discover lost sites, and decide whether the land is a resource, a threat, or something worth restoring. Weather, radiation, pollution, ecological damage, conservation, and recovery feed back into public health, food, stability, and prosperity."],
                 ["INDUSTRY, RESEARCH, AND THE LONG BUILD", "Expand an interlocking industrial economy through research, infrastructure, contracts, supply chains, trade, and construction. Choose what to manufacture, what to import, which systems to upgrade, and which shortages the city can survive.\n\nBuildings and troop programs take time to complete. Training facilities, software upgrades, mega-projects, orbital infrastructure, and civic investment turn the city into a long-term project instead of a sequence of instant purchases."],
                 ["A LIVING NEWS FEED", "The city reports on itself through a relentless broadcast ticker and a stream of dispatches. War declarations, ceasefires, construction, disasters, ecological shifts, policy changes, faction demands, expeditions, and public scandals become part of the daily record.\n\nExpect dry announcements, impossible headlines, bureaucratic euphemisms, and the occasional story that is funny only because the alternative is screaming."],
                 ["STORIES WITH CONSEQUENCES", "Branching events and multi-stage storylines put people, institutions, factions, and the wider city under pressure. Responses can change resources, relationships, districts, the biosphere, and the future shape of the city.\n\nThere are no universally clean solutions. A compassionate answer may weaken the treasury. A ruthless answer may stabilize a district. A clever compromise may create a problem that arrives several turns later."],
                 ["TWO WAYS TO RUN THE CITY", "Every new city asks one question before the trouble starts: real time or turn based?\n\nREAL TIME — the city lives on its own clock. Ticks pass, crises erupt, and the simulation can continue while you are away. It is the classic idle experience, with offline catch-up when you return.\n\nTURN BASED — nothing advances until you end the turn. Read every report, weigh every decree, and take the time to understand the consequences. When a crisis demands attention, the day waits for your response."],
                 ["IDLE FRIENDLY, WITHOUT BEING HANDS OFF", "Real time mode supports configurable tick pacing, autosave, labeled save slots, backups, and offline simulation. Choose how deeply the city should simulate while you are away, then review what happened when you return.\n\nSteam Cloud keeps saves and commander profiles available across devices. Start at the desktop, continue on a Steam Deck, and return to the same city with its history intact."],
                 ["CRAFTED, NOT GENERATED", "Every event, headline, gang dossier, faction leader, wasteland discovery, and institutional failure is written to give the city a distinct voice. MEGACITY is inspired by deep management games, dark absurdist comics, and the firm belief that strategy games should make you laugh while everything you built catches fire.\n\nNo microtransactions. No pay to win. No loot boxes. No battle passes. Just a city that needs running and a Marshal who signed up for this."],
               ].map(([heading, body]) => (
                 <View key={heading}>
                   <Text style={[styles.aboutLabel, { marginBottom: 6, fontSize: 11 }]}>{heading}</Text>
                   <Text style={[styles.aboutValue, { color: Colors.textSecondary, fontSize: 12, lineHeight: 20, marginBottom: 14 }]}>{body}</Text>
                 </View>
               ))}

              <View style={styles.aboutDivider} />

              <Text style={[styles.aboutValue, { color: Colors.accent, fontSize: 12, lineHeight: 20, marginBottom: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" }]}>
                 Idle-friendly. Strategy-deep. Darkly funny. Always expanding.
              </Text>

              <View style={styles.aboutDivider} />

              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>DEVELOPER</Text>
                <Text style={styles.aboutValue}>{DEVELOPER_NAME}</Text>
              </View>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>GENRE</Text>
                <Text style={styles.aboutValue}>Idle / Strategy / Simulation</Text>
              </View>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>PLATFORM</Text>
                <Text style={styles.aboutValue}>Steam (PC) / Web (PWA)</Text>
              </View>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>PRICING</Text>
                <Text style={styles.aboutValue}>Free to play</Text>
              </View>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>STATUS</Text>
                <Text style={styles.aboutValue}>Active Development</Text>
              </View>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>SOCIAL</Text>
                <Text style={styles.aboutValue}>Instagram @MEGACITYSIM</Text>
              </View>

              <View style={styles.aboutDivider} />

              <Text style={[styles.aboutValue, { fontSize: 10, color: Colors.textMuted, textAlign: "center", lineHeight: 16, marginTop: 4 }]}>
                Built by one person, fuelled by caffeine and spite.{"\n"}
                All rights reserved. {new Date().getFullYear()} {DEVELOPER_NAME}.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCharCreate}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowCharCreate(false);
          if (isUnifiedSetup) setIsUnifiedSetup(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isUnifiedSetup ? "COMMANDER & CITY SETUP" : "NEW CITY"}</Text>
              <Pressable
                onPress={() => {
                  setShowCharCreate(false);
                  if (isUnifiedSetup) setIsUnifiedSetup(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={isUnifiedSetup ? "Close commander and city setup" : "Close new city setup"}
              >
                <Feather name="x" size={20} color={Colors.accent} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
              <View style={ccStyles.stepContent}>
                {isUnifiedSetup && (
                  <>
                    <CommanderIdentitySection
                      styles={ccStyles}
                      Colors={Colors}
                      name={profileName}
                      age={profileAge}
                      sex={profileSex}
                      portraitId={profilePortraitId}
                      customPortrait={profileCustomPortrait}
                      backstory={profileBackstory}
                      onNameChange={setProfileName}
                      onAgeChange={setProfileAge}
                      onSexChange={setProfileSex}
                      onPortraitChange={setProfilePortraitId}
                      onCustomPortraitChange={setProfileCustomPortrait}
                      onBackstoryChange={setProfileBackstory}
                      showModal={showModal}
                      showHeading
                    />
                    <CommanderAttributesSection
                      styles={ccStyles}
                      Colors={Colors}
                      attributes={profileAttributes}
                      pointsLeft={profilePointsLeft}
                      onRoll={rollProfileAttributes}
                      onAdjust={(key, delta) => adjustProfileAttribute(key as keyof typeof profileAttributes, delta)}
                      showHeading
                    />
                    <CommanderTraitsSection
                      styles={ccStyles}
                      Colors={Colors}
                      traits={profileTraits}
                      availableTraits={AVAILABLE_TRAITS}
                      onToggle={toggleProfileTrait}
                      showHeading
                    />
                    <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 24 }} />
                    <Text style={[ccStyles.fieldLabel, { fontSize: 14, marginBottom: 6 }]}>04 — CITY & SECTOR COMMAND</Text>
                  </>
                )}
                {false && isUnifiedSetup && (
                  <View>
                    <Text style={[ccStyles.fieldLabel, { fontSize: 14, marginBottom: 6 }]}>01 — COMMANDER IDENTITY</Text>
                    <Text style={ccStyles.stepDesc}>
                      Define who will hold the badge. These details belong to your commander and carry into every city they lead.
                    </Text>

                    <Text style={ccStyles.fieldLabel}>COMMANDER NAME</Text>
                    <TextInput
                      style={ccStyles.textInput}
                      value={profileName}
                      onChangeText={setProfileName}
                      placeholderTextColor={Colors.textMuted}
                      maxLength={30}
                      autoCorrect={false}
                      accessibilityLabel="Commander name"
                    />
                    <Text style={ccStyles.fieldLabel}>AGE</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <Pressable onPress={() => setProfileAge((age) => Math.max(18, age - 1))} style={ccStyles.ageBtn} accessibilityRole="button" accessibilityLabel="Decrease age">
                        <Feather name="minus" size={14} color={Colors.accent} />
                      </Pressable>
                      <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 20, minWidth: 40, textAlign: "center" }}>{profileAge}</Text>
                      <Pressable onPress={() => setProfileAge((age) => Math.min(80, age + 1))} style={ccStyles.ageBtn} accessibilityRole="button" accessibilityLabel="Increase age">
                        <Feather name="plus" size={14} color={Colors.accent} />
                      </Pressable>
                    </View>

                    <Text style={ccStyles.fieldLabel}>SEX</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                      {(["male", "female", "other"] as const).map((sex) => (
                        <Pressable
                          key={sex}
                          onPress={() => setProfileSex(sex)}
                          accessibilityRole="button"
                          accessibilityLabel={`Commander sex: ${sex}`}
                          accessibilityState={{ selected: profileSex === sex }}
                          style={[ccStyles.sexBtn, profileSex === sex && ccStyles.sexBtnActive]}
                        >
                          <Text style={[ccStyles.sexBtnText, profileSex === sex && ccStyles.sexBtnTextActive]}>{sex.toUpperCase()}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={ccStyles.fieldLabel}>PORTRAIT</Text>
                    <View style={{ alignItems: "center", marginBottom: 8 }}>
                      <View style={{ width: 110, height: 110, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent, overflow: "hidden", backgroundColor: Colors.bgCard }}>
                        {profileCustomPortrait ? (
                          <Image source={{ uri: profileCustomPortrait ?? undefined }} style={{ width: 110, height: 110 }} resizeMode="cover" accessibilityLabel="Uploaded portrait preview" />
                        ) : getPortrait(profilePortraitId) ? (
                          <Image source={getPortrait(profilePortraitId)!} style={{ width: 110, height: 110 }} resizeMode="cover" accessibilityLabel="Selected portrait preview" />
                        ) : null}
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                      <Pressable
                        onPress={async () => {
                          const result = await pickCustomPortrait();
                          if (result.ok) setProfileCustomPortrait(result.dataUri);
                          else if (result.reason === "permission") {
                            showModal("PHOTO ACCESS NEEDED", "Allow photo library access in your device settings to upload a portrait.", [{ text: "OK", style: "cancel" }]);
                          } else if (result.reason === "invalid") {
                            showModal("UPLOAD FAILED", "That image could not be processed. Try a different photo.", [{ text: "OK", style: "cancel" }]);
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Upload a portrait photo"
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard }}
                      >
                        <Feather name="upload" size={13} color={Colors.accent} />
                        <Text style={{ color: Colors.text, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>UPLOAD PHOTO</Text>
                      </Pressable>
                      {profileCustomPortrait ? (
                        <Pressable
                          onPress={() => setProfileCustomPortrait(null)}
                          accessibilityRole="button"
                          accessibilityLabel="Remove uploaded photo"
                          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg }}
                        >
                          <Feather name="x" size={13} color={Colors.textMuted} />
                          <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>REMOVE</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={{ marginBottom: 16 }}>
                      <PortraitPicker
                        selectedId={profileCustomPortrait ? undefined : profilePortraitId}
                        onSelect={(id) => {
                          setProfilePortraitId(id);
                          setProfileCustomPortrait(null);
                        }}
                      />
                    </View>

                    <Text style={ccStyles.fieldLabel}>BACKSTORY (OPTIONAL)</Text>
                    <TextInput
                      style={[ccStyles.textInput, { minHeight: 70, textAlignVertical: "top" }]}
                      value={profileBackstory}
                      onChangeText={setProfileBackstory}
                      placeholder="Optional commander note"
                      placeholderTextColor={Colors.textMuted}
                      maxLength={400}
                      multiline
                      autoCorrect={false}
                      accessibilityLabel="Commander backstory"
                    />

                    <Text style={[ccStyles.fieldLabel, { fontSize: 14, marginTop: 24, marginBottom: 6 }]}>02 — ATTRIBUTES</Text>
                    <Text style={ccStyles.stepDesc}>Roll the dice or spend bonus points to fine-tune your starting attributes.</Text>
                    <View style={ccStyles.rollRow}>
                      <Pressable onPress={rollProfileAttributes} style={ccStyles.rollBtn} accessibilityRole="button" accessibilityLabel="Roll commander attributes">
                        <MaterialCommunityIcons name="dice-multiple" size={18} color={Colors.bg} />
                        <Text style={ccStyles.rollBtnText}>ROLL DICE</Text>
                      </Pressable>
                      <Text style={ccStyles.pointsLeft}>BONUS POINTS: {profilePointsLeft}</Text>
                    </View>
                    {(Object.keys(profileAttributes) as (keyof typeof profileAttributes)[]).map((attribute) => (
                      <View key={attribute} style={ccStyles.attrRow}>
                        <Text style={ccStyles.attrName}>{attribute.toUpperCase()}</Text>
                        <View style={ccStyles.attrControls}>
                          <Pressable
                            onPress={() => adjustProfileAttribute(attribute, -1)}
                            accessibilityRole="button"
                            accessibilityLabel={`Decrease ${attribute}`}
                            style={[ccStyles.attrBtn, profileAttributes[attribute] <= 1 && ccStyles.attrBtnDisabled]}
                          >
                            <Text style={ccStyles.attrBtnText}>-</Text>
                          </Pressable>
                          <View style={ccStyles.attrValueWrap}>
                            <Text style={ccStyles.attrValue}>{profileAttributes[attribute]}</Text>
                            <View style={ccStyles.attrBar}>
                              <View style={[ccStyles.attrBarFill, { width: `${profileAttributes[attribute] * 10}%` }]} />
                            </View>
                          </View>
                          <Pressable
                            onPress={() => adjustProfileAttribute(attribute, 1)}
                            accessibilityRole="button"
                            accessibilityLabel={`Increase ${attribute}`}
                            style={[ccStyles.attrBtn, (profilePointsLeft <= 0 || profileAttributes[attribute] >= 10) && ccStyles.attrBtnDisabled]}
                          >
                            <Text style={ccStyles.attrBtnText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}

                    <Text style={[ccStyles.fieldLabel, { fontSize: 14, marginTop: 24, marginBottom: 6 }]}>03 — TRAITS</Text>
                    <Text style={ccStyles.stepDesc}>Select up to 3 traits that define your background.</Text>
                    <Text style={ccStyles.traitCount}>{profileTraits.length}/3 SELECTED</Text>
                    <View style={ccStyles.traitGrid}>
                      {AVAILABLE_TRAITS.map((trait) => {
                        const selected = profileTraits.includes(trait);
                        const disabled = !selected && profileTraits.length >= 3;
                        return (
                          <Pressable
                            key={trait}
                            onPress={() => !disabled && toggleProfileTrait(trait)}
                            accessibilityRole="button"
                            accessibilityLabel={`Commander trait: ${trait}`}
                            accessibilityState={{ selected, disabled }}
                            style={[ccStyles.traitChip, selected && ccStyles.traitChipSelected, disabled && ccStyles.traitChipDisabled]}
                          >
                            <Text style={[ccStyles.traitChipText, selected && ccStyles.traitChipTextSelected]}>{trait.toUpperCase()}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 24 }} />
                    <Text style={[ccStyles.fieldLabel, { fontSize: 14, marginBottom: 6 }]}>04 — CITY & SECTOR COMMAND</Text>
                  </View>
                )}
                <Text style={ccStyles.stepDesc}>
                  Commander {activeProfile?.name ?? profileName}, designate your new city and choose how this command begins.
                </Text>

                <Text style={ccStyles.fieldLabel}>CITY DESIGNATION</Text>
                <TextInput
                  style={ccStyles.textInput}
                  allowFontScaling
                  value={ccCity}
                  onChangeText={setCcCity}
                  placeholder="Enter city name"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={30}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  accessibilityLabel="City name"
                />

                <Text style={[ccStyles.fieldLabel, { marginTop: 16 }]}>SLOT {charCreateSlot} — DIFFICULTY: {difficulty.toUpperCase()}</Text>

                <Text style={[ccStyles.fieldLabel, { marginTop: 20 }]}>START STYLE</Text>
                <Text style={ccStyles.stepDesc}>
                  Guided eases you in with orientation, a calm first day, and on-screen coaching. Veteran skips all of it and drops you straight into command.
                </Text>
                {([
                  { id: "guided" as const, name: "GUIDED", icon: "compass", desc: "Full orientation, calm Day 1, objective marker, and tab coach tips.", color: Colors.accent },
                  { id: "veteran" as const, name: "VETERAN", icon: "sword-cross", desc: "Full HUD now, no orientation or coaching, crises from the start.", color: Colors.warning },
                ]).map(opt => {
                  const selected = startStyle === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setStartStyle(opt.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Start style: ${opt.name}`}
                      accessibilityState={{ selected }}
                      style={[ccStyles.factionCard, selected && { borderColor: opt.color + "80", backgroundColor: opt.color + "10" }]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <MaterialCommunityIcons name={opt.icon as any} size={22} color={selected ? opt.color : Colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={[ccStyles.factionName, selected && { color: opt.color }]}>
                            {opt.name}{opt.id === "guided" ? "  (RECOMMENDED)" : ""}
                          </Text>
                        </View>
                        {selected && <Feather name="check-circle" size={18} color={opt.color} />}
                      </View>
                      <Text style={ccStyles.factionDesc}>{opt.desc}</Text>
                    </Pressable>
                  );
                })}
                {startStyle !== defaultStartStyle && (
                  <Pressable
                    onPress={() => setRememberStartStyle(prev => !prev)}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Make ${startStyle === "veteran" ? "Veteran" : "Guided"} my new default start style`}
                    accessibilityState={{ checked: rememberStartStyle }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingVertical: 6 }}
                  >
                    <Feather
                      name={rememberStartStyle ? "check-square" : "square"}
                      size={18}
                      color={rememberStartStyle ? Colors.accent : Colors.textMuted}
                    />
                    <Text style={[ccStyles.factionDesc, { flex: 1, marginTop: 0 }, rememberStartStyle && { color: Colors.accent }]}>
                      Make {startStyle === "veteran" ? "VETERAN" : "GUIDED"} my new default (just this city if unchecked)
                    </Text>
                  </Pressable>
                )}

                <Text style={[ccStyles.fieldLabel, { marginTop: 20 }]}>PLAY MODE</Text>
                <Text style={ccStyles.stepDesc}>
                  Real-time runs the city continuously, even while you are away. Turn-based only advances when you press End Turn, and always stops for a crisis so you can respond.
                </Text>
                {([
                  { id: "realtime" as const, name: "REAL-TIME", icon: "play-circle", desc: "The city runs on its own clock and keeps progressing while you are away.", color: Colors.accent },
                  { id: "turnbased" as const, name: "TURN-BASED", icon: "step-forward", desc: "Nothing moves until you press End Turn. A crisis always pauses for your call.", color: Colors.warning },
                ]).map(opt => {
                  const selected = newGameMode === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setNewGameMode(opt.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Play mode: ${opt.name}`}
                      accessibilityState={{ selected }}
                      style={[ccStyles.factionCard, selected && { borderColor: opt.color + "80", backgroundColor: opt.color + "10" }]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <MaterialCommunityIcons name={opt.icon as any} size={22} color={selected ? opt.color : Colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={[ccStyles.factionName, selected && { color: opt.color }]}>
                            {opt.name}
                          </Text>
                        </View>
                        {selected && <Feather name="check-circle" size={18} color={opt.color} />}
                      </View>
                      <Text style={ccStyles.factionDesc}>{opt.desc}</Text>
                    </Pressable>
                  );
                })}

                <Text style={[ccStyles.fieldLabel, { marginTop: 20 }]}>COMMANDER ORIGIN</Text>
                <Text style={ccStyles.stepDesc}>
                  Choose the record that follows you into command. Origins use existing stats and traits, and every advantage carries a cost.
                </Text>
                {COMMANDER_ORIGINS.map(origin => {
                  const selected = ccOrigin === origin.id;
                  const accent = origin.id === "none" ? Colors.textSecondary : Colors.accent;
                  return (
                    <Pressable
                      key={origin.id}
                      onPress={() => setCcOrigin(origin.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Commander origin: ${origin.name}`}
                      accessibilityState={{ selected }}
                      style={[ccStyles.factionCard, selected && { borderColor: accent + "80", backgroundColor: accent + "10" }]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <MaterialCommunityIcons name={origin.icon as any} size={22} color={selected ? accent : Colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={[ccStyles.factionName, selected && { color: accent }]}>{origin.name}</Text>
                        </View>
                        {selected && <Feather name="check-circle" size={18} color={accent} />}
                      </View>
                      <Text style={ccStyles.factionDesc}>{origin.description}</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 }}>
                        <Text style={[ccStyles.factionBonus, { color: Colors.statHigh }]}>{origin.advantage}</Text>
                        <Text style={[ccStyles.factionBonus, { color: Colors.warning }]}>{origin.tradeoff}</Text>
                      </View>
                    </Pressable>
                  );
                })}

                <Text style={[ccStyles.fieldLabel, { marginTop: 20 }]}>BACKGROUND FACTION</Text>
                <Text style={ccStyles.stepDesc}>
                  This determines your starting title, bonuses, and how factions perceive you.
                </Text>

                {FACTION_OPTIONS.map(f => {
                  const selected = ccFaction === f.id;
                  const artSrc = FACTION_ART[f.id];
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => setCcFaction(f.id)}
                      style={[ccStyles.factionCard, selected && { borderColor: f.color + "80", backgroundColor: f.color + "10" }, { overflow: "hidden" }]}
                    >
                      {artSrc && (
                        <Image
                          source={artSrc}
                          style={{ position: "absolute", right: -10, top: -10, width: 90, height: 90, opacity: selected ? 0.15 : 0.06, borderRadius: 6 }}
                          resizeMode="cover"
                          accessible={false}
                        />
                      )}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, zIndex: 1 }}>
                        <MaterialCommunityIcons name={f.icon as any} size={22} color={selected ? f.color : Colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={[ccStyles.factionName, selected && { color: f.color }]}>{f.name}</Text>
                          <Text style={ccStyles.factionTitle}>{f.title}</Text>
                        </View>
                        {selected && <Feather name="check-circle" size={18} color={f.color} />}
                      </View>
                      <Text style={[ccStyles.factionDesc, { zIndex: 1 }]}>{f.desc}</Text>
                      <Text style={[ccStyles.factionBonus, { color: f.color, zIndex: 1 }]}>{f.bonuses}</Text>
                    </Pressable>
                  );
                })}

                <Text style={[ccStyles.fieldLabel, { marginTop: 20 }]}>STARTING REGION</Text>
                <Text style={ccStyles.stepDesc}>
                  Sector Command offers several deployment zones. Step through with PREV / NEXT, or roll for a random assignment.
                </Text>
                <View style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 14, backgroundColor: Colors.bgCard, marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent }}>{ccRegion.name.toUpperCase()}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 }}>
                        Deployment grid ({ccRegion.playerX}, {ccRegion.playerY}) · {ccRegion.initialDiscovered.length} locations pre-scouted
                      </Text>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.textMuted, marginTop: 6 }}>
                        GRID: ({ccRegion.playerX}, {ccRegion.playerY}) — {ccRegion.initialDiscovered.length} locations pre-scouted
                      </Text>
                      {ccRegion.startingBonus?.summary ? (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Feather name="gift" size={12} color={Colors.warning} />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.warning, flex: 1 }}>
                            {ccRegion.startingBonus.summary}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        const idx = STARTING_REGIONS.findIndex(r => r.id === ccRegion.id);
                        const prev = (idx - 1 + STARTING_REGIONS.length) % STARTING_REGIONS.length;
                        setCcRegion(STARTING_REGIONS[prev]);
                      }}
                      style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "10", flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      <Feather name="chevron-left" size={16} color={Colors.accent} />
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.accent }}>PREV</Text>
                    </Pressable>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textMuted }}>
                      {STARTING_REGIONS.findIndex(r => r.id === ccRegion.id) + 1} / {STARTING_REGIONS.length}
                    </Text>
                    <Pressable
                      onPress={() => setCcRegion(STARTING_REGIONS[Math.floor(Math.random() * STARTING_REGIONS.length)])}
                      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "10" }}
                      accessibilityRole="button"
                      accessibilityLabel="Pick a random starting region"
                    >
                      <MaterialCommunityIcons name="dice-multiple" size={18} color={Colors.accent} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const idx = STARTING_REGIONS.findIndex(r => r.id === ccRegion.id);
                        const next = (idx + 1) % STARTING_REGIONS.length;
                        setCcRegion(STARTING_REGIONS[next]);
                      }}
                      style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "10", flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.accent }}>NEXT</Text>
                      <Feather name="chevron-right" size={16} color={Colors.accent} />
                    </Pressable>
                  </View>
                </View>

                <Text style={[ccStyles.fieldLabel, { marginTop: 20 }]}>MEGACITY ROSTER</Text>
                <Text style={ccStyles.stepDesc}>
                  Ten map megacities are fixed for this city. Reserved locations keep their routes; the remaining slot is a deterministic roll. Names are local to this launch and keep their internal IDs.
                </Text>
                <View
                  accessibilityLabel="Megacity roster editor"
                  style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 10, backgroundColor: Colors.bgCard, marginBottom: 8 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.8 }}>
                        {ccMegacityRoster.entries.length} LOCATIONS · SEED {ccMegacityRoster.seed}
                      </Text>
                      <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 3 }}>
                        Reroll changes generated placement only; authored routes stay reserved.
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setCcMegacityRoster(createMegacityRoster(Math.floor(Math.random() * 0xffffffff)))}
                      accessibilityRole="button"
                      accessibilityLabel="Reroll megacity roster"
                      style={{ minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.accent + "70", borderRadius: 5, flexDirection: "row", alignItems: "center", gap: 5 }}
                    >
                      <MaterialCommunityIcons name="dice-multiple" size={15} color={Colors.accent} />
                      <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.8 }}>REROLL</Text>
                    </Pressable>
                  </View>
                  {ccMegacityRoster.entries.map((entry, index) => (
                    <View
                      key={entry.id}
                      style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 6, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: Colors.border + "70" }}
                    >
                      <View style={{ width: 22, alignItems: "center" }}>
                        <Text style={{ color: entry.source === "reserved" ? Colors.textMuted : Colors.warning, fontFamily: "Inter_700Bold", fontSize: 9 }}>
                          {String(index + 1).padStart(2, "0")}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <TextInput
                          value={entry.displayName}
                          onChangeText={(displayName) => setCcMegacityRoster((current) => ({
                            ...current,
                            entries: current.entries.map((candidate) =>
                              candidate.id === entry.id ? { ...candidate, displayName } : candidate,
                            ),
                          }))}
                          maxLength={40}
                          autoCorrect={false}
                          placeholder="Settlement name"
                          placeholderTextColor={Colors.textMuted}
                          accessibilityLabel={`Megacity name, ${entry.displayName}`}
                          style={[ccStyles.textInput, { marginTop: 0, paddingVertical: 7, fontSize: 12 }]}
                        />
                        <Text style={{ color: entry.source === "reserved" ? Colors.textMuted : Colors.warning, fontFamily: "Inter_500Medium", fontSize: 8, marginTop: 2, letterSpacing: 0.5 }}>
                          {entry.source === "reserved" ? "RESERVED ROUTE" : "SEEDED GENERATED SLOT"} · {entry.id}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setCcMegacityRoster((current) => ({
                          ...current,
                          entries: current.entries.map((candidate) =>
                            candidate.id === entry.id
                              ? { ...candidate, displayName: defaultMegacityDisplayName(candidate.id) }
                              : candidate,
                          ),
                        }))}
                        accessibilityRole="button"
                        accessibilityLabel={`Reroll megacity name for ${entry.displayName}`}
                        style={{ minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: 5 }}
                      >
                        <MaterialCommunityIcons name="refresh" size={15} color={Colors.accent} />
                      </Pressable>
                    </View>
                  ))}
                </View>

                {/* ── Pack A — Faction Identity (cosmetic banner). ───────── */}
                <Text style={[ccStyles.fieldLabel, { marginTop: 20 }]}>FACTION IDENTITY</Text>
                <Text style={ccStyles.stepDesc}>
                  Your banner flies above the HUD and stamps every diplomatic broadcast. Cosmetic only.
                </Text>
                <View style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 14, backgroundColor: Colors.bgCard, marginBottom: 8 }}>
                  {/* Live preview row */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                    <View style={{ width: 56, height: 56, borderRadius: 6, backgroundColor: ccSecondary, borderWidth: 1, borderColor: ccPrimary, justifyContent: "center", alignItems: "center" }}>
                      <Insignia id={ccGlyph} size={42} color={ccPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: ccPrimary, letterSpacing: 1 }}>{(ccFactionName || "UNNAMED").toUpperCase()}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4, fontStyle: "italic" }}>
                        {ccMotto ? `"${ccMotto}"` : "— no motto —"}
                      </Text>
                    </View>
                  </View>

                  <Text style={ccStyles.fieldLabel}>BANNER NAME</Text>
                  <TextInput
                    style={ccStyles.textInput}
                    value={ccFactionName}
                    onChangeText={setCcFactionName}
                    placeholder="JUSTICE DEPARTMENT"
                    placeholderTextColor={Colors.textMuted}
                    maxLength={PLAYER_FACTION_NAME_MAX}
                    autoCorrect={false}
                    autoCapitalize="characters"
                    accessibilityLabel="Faction banner name"
                  />

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                    <Text style={ccStyles.fieldLabel}>MOTTO</Text>
                    <Pressable
                      onPress={() => setCcMotto(rollPlayerFactionMotto(ccMotto))}
                      accessibilityLabel="Roll a random motto"
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.accent, borderRadius: 4 }}
                    >
                      <MaterialCommunityIcons name="dice-multiple" size={12} color={Colors.accent} />
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1, color: Colors.accent }}>ROLL</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={ccStyles.textInput}
                    value={ccMotto}
                    onChangeText={setCcMotto}
                    placeholder="Order Above All."
                    placeholderTextColor={Colors.textMuted}
                    maxLength={PLAYER_FACTION_MOTTO_MAX}
                    autoCorrect={false}
                    accessibilityLabel="Faction motto"
                  />

                  <Text style={[ccStyles.fieldLabel, { marginTop: 12 }]}>PRIMARY COLOR</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {PLAYER_FACTION_PALETTE.map((c) => {
                      const selected = ccPrimary === c.hex;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => setCcPrimary(c.hex)}
                          accessibilityLabel={`Pick color ${c.label}`}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 4,
                            backgroundColor: c.hex,
                            borderWidth: selected ? 3 : 1,
                            borderColor: selected ? Colors.text : Colors.border,
                          }}
                        />
                      );
                    })}
                  </View>

                  <Text style={[ccStyles.fieldLabel, { marginTop: 12 }]}>BACKGROUND COLOR</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {PLAYER_FACTION_BG_PALETTE.map((c) => {
                      const selected = ccSecondary === c.hex;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => setCcSecondary(c.hex)}
                          accessibilityLabel={`Pick background color ${c.label}`}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 4,
                            backgroundColor: c.hex,
                            borderWidth: selected ? 3 : 1,
                            borderColor: selected ? Colors.text : Colors.border,
                          }}
                        />
                      );
                    })}
                  </View>

                  <Text style={[ccStyles.fieldLabel, { marginTop: 12 }]}>BANNER GLYPH</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {PLAYER_FACTION_GLYPHS.map((g) => {
                      const selected = ccGlyph === g.id;
                      return (
                        <Pressable
                          key={g.id}
                          onPress={() => setCcGlyph(g.id)}
                          accessibilityLabel={`Pick glyph ${g.label}`}
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 4,
                            justifyContent: "center",
                            alignItems: "center",
                            backgroundColor: selected ? ccPrimary + "22" : Colors.bg,
                            borderWidth: selected ? 2 : 1,
                            borderColor: selected ? ccPrimary : Colors.border,
                          }}
                        >
                          <Insignia id={g.id} size={36} color={selected ? ccPrimary : Colors.textMuted} />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Pressable
                  onPress={confirmCharCreate}
                  disabled={isLaunchingSetup}
                  accessibilityRole="button"
                  accessibilityLabel={isUnifiedSetup ? "Launch commander and city" : "Launch city"}
                  accessibilityState={{ disabled: isLaunchingSetup }}
                  style={[ccStyles.launchBtn, isLaunchingSetup && { opacity: 0.55 }]}
                >
                  <MaterialCommunityIcons name="rocket-launch" size={16} color={Colors.bg} />
                  <Text style={ccStyles.launchBtnText}>
                    {isLaunchingSetup ? "LAUNCHING…" : isUnifiedSetup ? "CREATE COMMANDER & LAUNCH CITY" : "LAUNCH MEGACITY"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showProfileSelect}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProfileSelect(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SWITCH COMMANDER</Text>
              <Pressable onPress={() => setShowProfileSelect(false)} accessibilityRole="button" accessibilityLabel="Close commander selection">
                <Feather name="x" size={20} color={Colors.accent} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
              {allProfiles.map((p) => {
                const isActive = p.id === activeProfile?.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => { selectProfile(p.id); setShowProfileSelect(false); }}
                    style={[styles.slotCard, isActive && styles.slotCardActive]}
                  >
                    <View style={styles.slotHeader}>
                      <Text style={styles.slotLabel}>{p.name.toUpperCase()}</Text>
                      {isActive && <Text style={styles.slotActiveBadge}>ACTIVE</Text>}
                    </View>
                    <View style={styles.slotInfo}>
                      <Text style={styles.slotCity}>Level {p.commanderLevel} | Age {p.age} | {p.sex?.toUpperCase() ?? "?"}</Text>
                      <Text style={styles.slotStat}>{p.careerStats?.citiesRun ?? 0} cities founded</Text>
                    </View>
                    <View style={styles.slotActions}>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          const wasLastProfile = allProfiles.length <= 1;
                          showModal(
                            "DELETE COMMANDER",
                            isActive
                              ? `Permanently delete ${p.name}, your current commander? All associated save data will be lost.`
                              : `Permanently delete commander ${p.name}? All associated save data will be lost.`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "DELETE",
                                style: "destructive",
                                onPress: async () => {
                                  await deleteProfile(p.id);
                                  await refreshProfiles();
                                  // Deleting the last commander leaves nothing to
                                  // pick from — close the roster and go straight
                                  // to the creation wizard.
                                  if (wasLastProfile) {
                                    setShowProfileSelect(false);
                                    openProfileCreate();
                                  }
                                },
                              },
                            ]
                          );
                        }}
                        style={[styles.slotBtn, styles.slotDeleteBtn]}
                      >
                        <Feather name="trash-2" size={12} color={Colors.danger} />
                        <Text style={[styles.slotBtnText, { color: Colors.danger }]}>DELETE</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}

              {allProfiles.length < MAX_PROFILES && (
                <Pressable
                  onPress={() => { setShowProfileSelect(false); openProfileCreate(); }}
                  style={({ pressed }) => [styles.menuBtn, styles.primaryBtn, { marginTop: 12 }, pressed && styles.pressed]}
                >
                  <Feather name="plus" size={16} color={Colors.bg} />
                  <View style={styles.btnContent}>
                    <Text style={[styles.btnText, { color: Colors.bg }]}>NEW COMMANDER</Text>
                  </View>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {profileCreateModal}

      <GameModal {...modal} onDismiss={hideModal} />
    </ScrollView>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  titleBlock: {
    marginBottom: 24,
  },
  preTitle: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  mainTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 48,
    letterSpacing: 6,
    lineHeight: 52,
  },
  subTitle: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 18,
    letterSpacing: 4,
    marginTop: 2,
  },
  logo: {
    width: "100%",
    aspectRatio: 1697 / 927,
    alignSelf: "center",
    marginBottom: 8,
    borderRadius: 6,
  },
  cover: {
    width: "100%",
    maxWidth: 480,
    aspectRatio: 896 / 1280,
    alignSelf: "center",
    marginBottom: 8,
    borderRadius: 6,
  },
  coverLandscape: {
    aspectRatio: 1697 / 927,
    alignSelf: "center",
    marginBottom: 8,
    borderRadius: 6,
  },
  titleBorder: {
    height: 2,
    backgroundColor: Colors.accent,
    marginTop: 6,
    marginBottom: 10,
    width: "40%",
  },
  cursorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cursorLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 1,
  },
  cursor: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  earlyAccessBadge: {
    alignSelf: "flex-end",
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.warning + "50",
    backgroundColor: Colors.warning + "0A",
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  earlyAccessText: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 2,
  },
  menuBlock: {
    marginBottom: 32,
  },
  menuHeader: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 14,
  },
  menuBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  secondaryBtn: {
    backgroundColor: "rgba(0,255,65,0.05)",
    borderColor: Colors.accent,
  },
  recoveryRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginBottom: 10,
  },
  recoveryBtn: {
    flex: 1,
    backgroundColor: "rgba(0,122,255,0.08)",
    borderColor: Colors.accent,
    marginBottom: 0,
  },
  recoveryDismissBtn: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  cloudConflictBox: {
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: "rgba(0,122,255,0.06)",
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  cloudConflictHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cloudConflictTitle: {
    color: Colors.accent,
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cloudConflictBody: {
    color: Colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  cloudConflictChoices: {
    flexDirection: "row",
    gap: 8,
  },
  cloudConflictBtn: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  cloudConflictBtnRecommended: {
    borderColor: Colors.accent,
    backgroundColor: "rgba(0,122,255,0.1)",
  },
  cloudConflictBtnText: {
    color: Colors.text,
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  cloudConflictBtnSub: {
    color: Colors.muted,
    fontSize: 10,
    textAlign: "center",
  },
  cloudStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  cloudStatusText: {
    flex: 1,
    color: Colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  dangerBtn: {
    backgroundColor: "rgba(255,59,48,0.05)",
    borderColor: Colors.danger,
  },
  pressed: {
    opacity: 0.7,
  },
  btnContent: {
    flex: 1,
  },
  btnText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    letterSpacing: 1.5,
  },
  btnSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 16,
    gap: 4,
  },
  footerText: {
    color: Colors.textMuted,
    // Monospaced so the desktop-shortcut footer reads as a terminal
    // cheat sheet (matches the rest of the dystopian HUD typography).
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 10,
    letterSpacing: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
  },
  modalContent: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 16,
  },
  modalTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 2,
    flexShrink: 1,
  },
  slotList: {
    flex: 1,
  },
  slotCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    marginBottom: 12,
  },
  slotCardActive: {
    borderColor: Colors.accent,
  },
  slotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  slotLabel: {
    color: Colors.textSecondary,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1.5,
  },
  slotActiveBadge: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    backgroundColor: Colors.accentDark,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.accent,
    overflow: "hidden",
  },
  slotHeaderBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  slotHonorBadge: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.warning,
    overflow: "hidden",
  },
  slotEmpty: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  slotEmptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 1,
  },
  slotInfo: {
    marginBottom: 10,
  },
  slotCustomLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  slotName: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginBottom: 2,
  },
  slotCity: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginBottom: 6,
  },
  slotStatsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  slotStat: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  slotDate: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 4,
  },
  slotActions: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  slotBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
  },
  slotLoadBtn: {
    backgroundColor: "rgba(0,255,65,0.06)",
    borderColor: Colors.accent,
  },
  slotEditBtn: {
    backgroundColor: "rgba(0,255,65,0.03)",
    borderColor: Colors.borderBright,
  },
  labelEditorBox: {
    width: "88%",
    maxWidth: 460,
    alignSelf: "center",
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingHorizontal: 18,
    gap: 12,
  },
  labelEditorHint: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  labelEditorInput: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 3,
  },
  labelEditorActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  slotNewBtn: {
    backgroundColor: Colors.bgSecondary,
    borderColor: Colors.borderBright,
  },
  slotDeleteBtn: {
    backgroundColor: "rgba(255,59,48,0.06)",
    borderColor: Colors.danger,
  },
  slotBtnText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },

  creditsHeading: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  },
  creditsSub: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  creditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  creditName: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  creditEmptySmall: {
    paddingVertical: 20,
    alignItems: "center",
  },
  creditEmptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 1,
  },
  comingSoonBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  comingSoonText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: 4,
  },
  comingSoonSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  aboutLogo: {
    width: 200,
    height: 160,
    alignSelf: "center",
    marginBottom: 8,
  },
  aboutTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: 3,
    marginBottom: 4,
  },
  aboutVersion: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 16,
  },
  aboutDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  aboutDesc: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  aboutRow: {
    marginBottom: 8,
  },
  aboutLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 8,
    marginBottom: 2,
  },
  aboutValue: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },

  diffCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  diffHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  diffLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 2,
  },
  diffActiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
  },
  diffActiveText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  diffDesc: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  diffNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  diffNoteText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },

  devUpdateEntry: {
    marginBottom: 8,
  },
  devUpdateVersion: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 2,
    marginBottom: 2,
  },
  devUpdateDate: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 12,
  },
  devUpdateItems: {
    gap: 6,
  },
  devUpdateItem: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    paddingLeft: 4,
  },
  devDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 20,
  },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  catChipActive: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  catChipText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    letterSpacing: 0.5,
  },
  catChipTextActive: {
    color: Colors.bg,
  },
  catChipCount: {
    color: Colors.textMuted + "80",
    fontFamily: "Inter_400Regular",
    fontSize: 8,
  },
  achRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
    opacity: 0.5,
  },
  achRowUnlocked: {
    opacity: 1,
    backgroundColor: "rgba(255,149,0,0.04)",
  },
  achIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: Colors.bgSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  achIconWrapUnlocked: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  achTitle: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  achTitleUnlocked: {
    color: Colors.text,
  },
  achDesc: {
    color: Colors.textMuted + "80",
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    marginTop: 2,
  },
  achDescUnlocked: {
    color: Colors.textSecondary,
  },
  manualTabBar: {
    flexDirection: "row",
    gap: 2,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  manualTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  manualTabBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  manualTabLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.textSecondary,
  },
  manualTabLabelActive: {
    color: Colors.bg,
  },
  controlsSection: {
    marginBottom: 16,
  },
  controlsSectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  controlsKey: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: Colors.accent,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    textAlign: "center",
    width: 32,
    paddingVertical: 4,
    overflow: "hidden",
  },
  controlsKeyWide: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.5,
    color: Colors.accent,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    textAlign: "center",
    width: 72,
    paddingVertical: 4,
    overflow: "hidden",
  },
  controlsDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    flex: 1,
  },
}));

const useCcStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  stepContent: { padding: 16, gap: 12 },
  stepDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 4 },
  fieldLabel: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.accent, letterSpacing: 1, marginTop: 8 },
  textInput: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.bg, marginTop: 4 },
  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.accent, borderRadius: 6, paddingVertical: 12, marginTop: 16 },
  nextBtnText: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.bg, letterSpacing: 1 },
  rollRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  rollBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.accent, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 10 },
  rollBtnText: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.bg, letterSpacing: 1 },
  pointsLeft: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.warning, letterSpacing: 0.5 },
  attrRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border + "44" },
  attrName: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text, letterSpacing: 1, minWidth: 100, flexShrink: 1 },
  attrControls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, flexGrow: 1, justifyContent: "flex-end" },
  attrBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  attrBtnDisabled: { borderColor: Colors.border, opacity: 0.3 },
  attrBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.accent },
  attrValueWrap: { alignItems: "center", width: 60 },
  attrValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.accent },
  attrBar: { width: 50, height: 4, backgroundColor: Colors.border, borderRadius: 2, marginTop: 4, overflow: "hidden" },
  attrBarFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 2 },
  navRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginTop: 20, gap: 12 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 6 },
  backBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.accent },
  traitCount: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.warning, letterSpacing: 1 },
  traitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  traitChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgSecondary },
  traitChipSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  traitChipDisabled: { opacity: 0.35 },
  traitChipText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5 },
  traitChipTextSelected: { color: Colors.accent },
  factionCard: { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, padding: 12, gap: 6, backgroundColor: Colors.bgCard },
  factionName: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.text, letterSpacing: 1 },
  factionTitle: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },
  factionDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: 2 },
  factionBonus: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
  summaryBox: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.accent + "44", borderRadius: 6, padding: 12, marginTop: 16, gap: 4 },
  summaryTitle: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.accent, letterSpacing: 1, marginBottom: 4 },
  summaryLine: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text },
  launchBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.accent, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 20, flex: 1 },
  launchBtnText: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.bg, letterSpacing: 1 },
  ageBtn: { width: 36, height: 36, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bgCard },
  sexBtn: { flex: 1, paddingVertical: 10, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bgCard },
  sexBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  sexBtnText: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.textMuted, letterSpacing: 1 },
  sexBtnTextActive: { color: Colors.accent },
}));

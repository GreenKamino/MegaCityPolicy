import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import * as Clipboard from "expo-clipboard";
import {
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
import SectionHeader from "@/components/SectionHeader";
import { useGame } from "@/context/GameContext";
import { useSettings, SETTINGS_GROUPS, isGroupModified, UI_SCALE_OPTIONS, normalizeUiScale, type SettingsGroup, type FontScale, type AutoSaveInterval, type ColorblindMode, type OfflineSimDepth, type StartStyle } from "@/context/SettingsContext";
import { isElectronShell, openScreenshotsFolder, quitDesktopApp } from "@/utils/desktopShell";
import { saveAndQuit } from "@/utils/saveAndQuit";
import { OFFLINE_SIM_DEPTH_BATCH_LIMIT } from "@/engine/offlineSimDepth";
import { getEstimatedMsPerTick, subscribeTickPerf } from "@/engine/tickPerf";
import {
  countSlowResumeSamples,
  formatCatchupDuration,
  isResumeOvershoot,
  shouldSuggestLowerDepth,
} from "@/utils/format";

// Multiplies the per-tick wall-clock cost (sampled live from the engine — see
// engine/tickPerf.ts) by OFFLINE_SIM_DEPTH_BATCH_LIMIT to produce the rough
// resume time the player trades for fidelity. Falls back to a desktop-class
// estimate before any samples have been recorded.
function formatResumeEstimate(depth: OfflineSimDepth, msPerTick: number): string {
  const seconds = (OFFLINE_SIM_DEPTH_BATCH_LIMIT[depth] * msPerTick) / 1000;
  if (seconds < 1) return `~${seconds.toFixed(1)}s`;
  return `~${Math.round(seconds)}s`;
}

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useTutorial } from "@/context/TutorialContext";
import { usePhotoMode } from "@/context/PhotoModeContext";
import { useGameModal } from "@/hooks/useGameModal";
import { getCommandMenuStatuses, type CommandMenuStatus } from "@/engine/commandMenuStatus";
import {
  COMMAND_DESTINATIONS,
  COMMAND_MENU_GROUPS,
  type CommandMenuIcon,
} from "@/engine/commandMenuCatalog";

type NavItem = {
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  route: string;
};

function statusColor(status: CommandMenuStatus | undefined, colors: ThemePalette): string {
  if (!status) return colors.textMuted;
  if (status.tone === "critical") return colors.danger;
  if (status.tone === "ready" || status.tone === "unread") return colors.accent;
  return colors.warning;
}

function commandIcon(icon: CommandMenuIcon, size: number, color: string): React.ReactNode {
  if (icon.set === "feather") {
    return <Feather name={icon.name as any} size={size} color={color} />;
  }
  return <MaterialCommunityIcons name={icon.name as any} size={size} color={color} />;
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
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { state, saveGame, saveToSlot, loadSlot, deleteSlot, setSaveLabel, slotMetas, activeSlot, forceTick, exportSlot, importSlot, exportFullBackup, importFullBackup, setHonorMode } = useGame();
  const honorMode = state.honorMode === true;
  const { modal, showModal, hideModal } = useGameModal();
  const { mode, toggleTheme, isDark, colors: themeColors } = useTheme();
  const styles = useStyles();
  const settings = useSettings();
  const { reloadFromStorage: reloadSettings } = settings;
  const { resetHints } = useTutorial();
  const { enter: enterPhotoMode } = usePhotoMode();
  const [showSaveSlots, setShowSaveSlots] = useState(false);
  const [showLoadSlots, setShowLoadSlots] = useState(false);
  const [labelEditorSlot, setLabelEditorSlot] = useState<number | null>(null);
  const [labelEditorText, setLabelEditorText] = useState("");
  // One-shot flag set by the slot card's onLongPress so the trailing onPress
  // (which RN Pressable still fires on release) doesn't also save the slot.
  const longPressFiredRef = useRef(false);
  const [exportPreview, setExportPreview] = useState<{ json: string; suggestedName: string } | null>(null);
  const [importJsonText, setImportJsonText] = useState("");
  const [importTargetSlot, setImportTargetSlot] = useState<number | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  // The "import full backup" flow re-uses a single text-area modal — when
  // `importFullTarget === true` we treat the textarea as a full-backup
  // payload instead of a single-slot payload.
  const [importFullTarget, setImportFullTarget] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);
  // Live-sampled per-tick wall-clock cost from the engine. Re-renders the
  // OFFLINE SIM DEPTH labels as the rolling average stabilizes during play.
  const msPerTick = useSyncExternalStore(subscribeTickPerf, getEstimatedMsPerTick, getEstimatedMsPerTick);

  const handleCopyExportJson = useCallback(async () => {
    if (!exportPreview) return;
    try {
      await Clipboard.setStringAsync(exportPreview.json);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1400);
    } catch {
      showModal("COPY FAILED", "Clipboard access was denied. Select the JSON and copy manually.", [{ text: "OK", onPress: hideModal }]);
    }
  }, [exportPreview, showModal, hideModal]);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const commandStatuses = useMemo(() => getCommandMenuStatuses(state), [state]);
  // Counters that appear inside nav-item subtitles. Pulled out as locals so
  // the navSections memo can list them as explicit dependencies and stay in
  // sync without rebuilding on every state tick.
  const localBusinessCount = (state.localEconomy?.businesses ?? []).length;
  const activeFactionContacts = state.factions.filter((f) => f.isActive).length;

  type NavSection = { title: string; icon: React.ReactNode; items: NavItem[] };

  // Memoize the entire nav graph — without this, every state tick rebuilds
  // hundreds of inline JSX icons and prop objects, even when nothing visible
  // has changed. Deps cover every value actually read inside the array.
  const navSections: NavSection[] = useMemo(() => {
    const sourceSections: NavSection[] = [
    {
      title: "Command & Intelligence",
      icon: <MaterialCommunityIcons name="monitor-dashboard" size={14} color={themeColors.accent} />,
      items: [
        {
          label: "INBOX",
          subtitle: "Messages, reports, alerts",
          icon: <Feather name="mail" size={18} color={themeColors.accent} />,
          route: "/(game)/inbox",
        },
        {
          label: "EVENTS & REPORTS",
          subtitle: "Incidents, ticker log, history",
          icon: <Feather name="alert-triangle" size={18} color={themeColors.accent} />,
          route: "/(game)/events",
        },
        {
          label: "ADMINISTRATION",
          subtitle: "Officers, diplomacy, city systems, software upgrades",
          icon: <MaterialCommunityIcons name="shield-crown" size={18} color={themeColors.accent} />,
          route: "/(game)/administration",
        },
        {
          label: "AUTO-MANAGER CONTROL CENTER",
          subtitle: "Advisor briefings, all manager modes, approvals, pause-all kill switch",
          icon: <MaterialCommunityIcons name="account-tie-voice" size={18} color={themeColors.accent} />,
          route: "/(game)/advisor-briefings",
        },
        {
          label: "DOSSIER",
          subtitle: "Commander profile, politics, inner circle",
          icon: <Feather name="user" size={18} color={themeColors.accent} />,
          route: "/(game)/character",
        },
        {
          label: "CITY STATISTICS",
          subtitle: "Historical trends, sparklines, city metrics",
          icon: <Feather name="bar-chart-2" size={18} color={themeColors.accent} />,
          route: "/(game)/stats",
        },
      ],
    },
    {
      title: "Operations",
      icon: <Feather name="tool" size={14} color={themeColors.accent} />,
      items: [
        {
          label: "SECTOR MAP",
          subtitle: "District heatmaps, zone stats, population overview",
          icon: <MaterialCommunityIcons name="map-marker-multiple" size={18} color={themeColors.accent} />,
          route: "/(game)/districts",
        },
        {
          label: "CONSTRUCTION",
          subtitle: "Build and expand city infrastructure",
          icon: <Feather name="tool" size={18} color={themeColors.accent} />,
          route: "/(game)/construction",
        },
        {
          label: "PRODUCTION CHAINS",
          subtitle: "Trace what makes what — inputs, outputs, producers, consumers",
          icon: <MaterialCommunityIcons name="sitemap-outline" size={18} color={themeColors.accent} />,
          route: "/(game)/production-chains",
        },
        {
          label: "CONTRACTS / PROCUREMENT",
          subtitle: "Award contracts, manage projects, procurement policies",
          icon: <Feather name="file-text" size={18} color={themeColors.accent} />,
          route: "/(game)/contracts",
        },
        {
          label: "MEGA-PROJECTS",
          subtitle: "City-scale construction — space elevator, arcology, fusion nexus",
          icon: <MaterialCommunityIcons name="city-variant-outline" size={18} color={themeColors.accent} />,
          route: "/(game)/megaprojects",
        },
        {
          label: "WILDLANDS",
          subtitle: "Biomes, species, ecology — ranger patrols and restoration projects",
          icon: <MaterialCommunityIcons name="leaf-maple" size={18} color={themeColors.accent} />,
          route: "/(game)/wildlands",
        },
        {
          label: "SOCIAL & CIVIC",
          subtitle: "Welfare, propaganda, population control",
          icon: <MaterialCommunityIcons name="account-group" size={18} color={themeColors.accent} />,
          route: "/(game)/social",
        },
      ],
    },
    {
      title: "Governance & Commerce",
      icon: <MaterialCommunityIcons name="swap-horizontal-bold" size={14} color={themeColors.accent} />,
      items: [
        {
          label: "FINANCES & BANKING",
          subtitle: "Loans, savings, deposits, diplomatic transfers",
          icon: <MaterialCommunityIcons name="bank" size={18} color={themeColors.accent} />,
          route: "/(game)/finances",
        },
        {
          label: "TRADE EXCHANGE",
          subtitle: "Buy and sell commodities, manage trade routes",
          icon: <MaterialCommunityIcons name="swap-horizontal-bold" size={18} color={themeColors.accent} />,
          route: "/(game)/trade",
        },
        {
          label: "COMMERCIAL LICENSING",
          subtitle: "License companies — 100 corporations across 10 sectors",
          icon: <Feather name="briefcase" size={18} color={themeColors.accent} />,
          route: "/(game)/companies",
        },
        {
          label: "BLACK MARKET",
          subtitle: "Illegal goods, high-risk transactions",
          icon: <MaterialCommunityIcons name="skull-crossbones" size={18} color={themeColors.danger} />,
          route: "/(game)/blackmarket",
        },
        {
          label: "LOCAL ECONOMY",
          subtitle: `Independent businesses — ${localBusinessCount} active`,
          icon: <MaterialCommunityIcons name="storefront-outline" size={18} color={themeColors.accent} />,
          route: "/(game)/local-economy",
        },
      ],
    },
    {
      title: "Security & Personnel",
      icon: <MaterialCommunityIcons name="tank" size={14} color={themeColors.accent} />,
      items: [
        {
          label: "MILITARY & ARMORY",
          subtitle: "Units, vehicles, readiness",
          icon: <MaterialCommunityIcons name="tank" size={18} color={themeColors.accent} />,
          route: "/(game)/military",
        },
        {
          label: "BESTIARY — SIGNATURE UNITS",
          subtitle: "Faction rosters and the enemy units you may meet in raids",
          icon: <MaterialCommunityIcons name="book-open-page-variant" size={18} color={themeColors.warning} />,
          route: "/(game)/bestiary",
        },
        {
          label: "RECRUITMENT & PERSONNEL",
          subtitle: "Hire/dismiss units, vehicles, droids, staff",
          icon: <Feather name="users" size={18} color={themeColors.accent} />,
          route: "/(game)/recruitment",
        },
        {
          label: "OFFICER LOBBY",
          subtitle: "Government officials and appointments",
          icon: <MaterialCommunityIcons name="account-tie" size={18} color={themeColors.accent} />,
          route: "/(game)/officers",
        },
        {
          label: "CRIMINAL REGISTRY",
          subtitle: "Wanted, fugitive, detained — rap sheets and last-known locations",
          icon: <MaterialCommunityIcons name="account-alert" size={18} color={themeColors.accent} />,
          route: "/(game)/criminals",
        },
        {
          label: "OFFICER MISSIONS",
          subtitle: "Deploy officers on intel, diplomatic, and combat ops",
          icon: <MaterialCommunityIcons name="compass-outline" size={18} color={themeColors.accent} />,
          route: "/(game)/missions",
        },
        {
          label: "RETINUE COMMAND",
          subtitle: "Squads, captains, troops — hire, promote, train your loyal forces",
          icon: <MaterialCommunityIcons name="sword-cross" size={18} color={themeColors.accent} />,
          route: "/(game)/retinue",
        },
        {
          label: "ASSET UPGRADES",
          subtitle: "Permanent upgrades for units, captains, followers — gated by tech and items",
          icon: <MaterialCommunityIcons name="arrow-up-bold-circle" size={18} color={themeColors.accent} />,
          route: "/(game)/upgrades",
        },
        {
          label: "INVENTORY",
          subtitle: "Weapons, armor, gear, relics — equip to captains",
          icon: <MaterialCommunityIcons name="treasure-chest" size={18} color={themeColors.accent} />,
          route: "/(game)/inventory",
        },
      ],
    },
    {
      title: "Governance & Diplomacy",
      icon: <MaterialCommunityIcons name="handshake" size={14} color={themeColors.accent} />,
      items: [
        {
          label: "DIPLOMACY",
          subtitle: `Faction relations — ${activeFactionContacts} active contacts`,
          icon: <MaterialCommunityIcons name="handshake" size={18} color={themeColors.accent} />,
          route: "/(game)/diplomacy",
        },
        {
          label: "FACTIONS",
          subtitle: "Manage relationships and threats",
          icon: <MaterialCommunityIcons name="sword-cross" size={18} color={themeColors.accent} />,
          route: "/(game)/factions",
        },
      ],
    },
    {
      title: "World Operations",
      icon: <MaterialCommunityIcons name="pickaxe" size={14} color={themeColors.accent} />,
      items: [
        {
          label: "MINING & EXTRACTION",
          subtitle: "Resource extraction and active sites",
          icon: <MaterialCommunityIcons name="pickaxe" size={18} color={themeColors.accent} />,
          route: "/(game)/mining",
        },
        {
          label: "SCAVENGING & RECLAMATION",
          subtitle: "Wasteland operations and expeditions",
          icon: <MaterialCommunityIcons name="compass-outline" size={18} color={themeColors.accent} />,
          route: "/(game)/scavenging",
        },
        {
          label: "DISTRICT EXPANSION",
          subtitle: "Reclaim wasteland and expand the city",
          icon: <MaterialCommunityIcons name="hammer-wrench" size={18} color={themeColors.accent} />,
          route: "/(game)/expansion",
        },
      ],
    },
    {
      title: "World & Advanced Programs",
      icon: <Feather name="cpu" size={14} color={themeColors.accent} />,
      items: [
        {
          label: "RESEARCH & TECH",
          subtitle: "Unlock advanced capabilities",
          icon: <Feather name="cpu" size={18} color={themeColors.accent} />,
          route: "/(game)/research",
        },
        {
          label: "CYBERNETICS",
          subtitle: "Augments, implants, body modification programs",
          icon: <MaterialCommunityIcons name="robot-industrial" size={18} color={themeColors.accent} />,
          route: "/(game)/cybernetics",
        },
        {
          label: "SPACE COMMAND",
          subtitle: "Launch ops, orbital assets, fleet, colonies",
          icon: <MaterialCommunityIcons name="rocket-launch-outline" size={18} color={themeColors.accent} />,
          route: "/(game)/space",
        },
      ],
    },
    {
      title: "Commander Tools & Progression",
      icon: <MaterialCommunityIcons name="star-shooting" size={14} color={themeColors.warning} />,
      items: [
        {
          label: "CHALLENGES",
          subtitle: "Daily login streak and weekly procedural challenges",
          icon: <MaterialCommunityIcons name="trophy-award" size={18} color={themeColors.accent} />,
          route: "/(game)/challenges",
        },
        {
          label: "CHANGELOG",
          subtitle: "Patch notes and version history",
          icon: <MaterialCommunityIcons name="script-text-outline" size={18} color={themeColors.info} />,
          route: "/(game)/changelog",
        },
        {
          label: "PRESTIGE / REBIRTH",
          subtitle: "Legacy system — earn permanent bonuses across rebirths",
          icon: <MaterialCommunityIcons name="star-shooting" size={18} color={themeColors.warning} />,
          route: "/(game)/prestige",
        },
        {
          label: "ACHIEVEMENTS",
          subtitle: "Milestones, feats, and dark accomplishments",
          icon: <MaterialCommunityIcons name="trophy-outline" size={18} color={themeColors.warning} />,
          route: "/(game)/achievements",
        },
        {
          label: "CODEX — GAME MANUAL",
          subtitle: "Searchable guide to all game systems, mechanics, and strategies",
          icon: <MaterialCommunityIcons name="book-open-variant" size={18} color={themeColors.info} />,
          route: "/(game)/codex",
        },
        {
          label: "LORE — FIELD ARCHIVES",
          subtitle: "Collected data disks, journals, classified files, and intercepted transmissions",
          icon: <MaterialCommunityIcons name="script-text-outline" size={18} color={themeColors.warning} />,
          route: "/(game)/lore",
        },
        {
          label: "ATLAS — WASTELAND TERRAIN",
          subtitle: "Catalogued landforms — coasts, ranges, dead rivers, dune fields, craters",
          icon: <MaterialCommunityIcons name="map-outline" size={18} color={themeColors.warning} />,
          route: "/(game)/atlas",
        },
        {
          label: "DEBUG / CHEATS",
          subtitle: "Force events, inject resources, cheat toggles",
          icon: <Feather name="terminal" size={18} color={themeColors.warning} />,
          route: "/(game)/debug",
        },
      ],
    },
    ];
    const topOnlyRoutes = new Set([
      "/(game)/overview",
      "/(game)/law",
      "/(game)/economy",
      "/(game)/worldmap",
      "/(game)/more",
    ]);
    return COMMAND_MENU_GROUPS.map((group) => ({
      title: group.label,
      icon: commandIcon(group.icon, 14, themeColors.accent),
      items: COMMAND_DESTINATIONS
        .filter((item) => item.group === group.id && !topOnlyRoutes.has(item.route))
        .map((item) => ({
          label: item.label,
          subtitle: item.subtitle,
          icon: commandIcon(item.icon, 18, themeColors.accent),
          route: item.route,
        })),
    }));
  }, [
    themeColors,
    commandStatuses,
    localBusinessCount,
    activeFactionContacts,
  ]);

  // Small per-section reset affordance plus a "modified" indicator. When the
  // group's keys all match their defaults the RESET is de-emphasized and
  // disabled (a no-op reset is confusing); when any key differs we surface a
  // small dot + "MODIFIED" chip so the player can see at a glance which
  // sections they've customized. Restores only the keys in the named group
  // (see SETTINGS_GROUPS) to defaults after a confirm.
  const renderGroupReset = useCallback((group: SettingsGroup, label: string) => {
    const modified = isGroupModified(settings, group);
    return (
      <View style={styles.groupHeaderRight}>
        {modified && (
          <View style={[styles.modifiedChip, { borderColor: themeColors.warning + "60", backgroundColor: themeColors.warning + "1A" }]}>
            <View style={[styles.modifiedDot, { backgroundColor: themeColors.warning }]} />
            <Text style={[styles.modifiedChipText, { color: themeColors.warning }]}>MODIFIED</Text>
          </View>
        )}
        <Pressable
          hitSlop={8}
          disabled={!modified}
          accessibilityState={{ disabled: !modified }}
          accessibilityLabel={modified ? `Reset ${label} settings to defaults` : `${label} settings already match defaults`}
          onPress={() => {
            if (!modified) return;
            showModal(
              `RESET ${label.toUpperCase()}?`,
              `Restore only the ${label} settings to their defaults. Your other sections — and your save slots — are not affected. Continue?`,
              [
                { text: "CANCEL", onPress: hideModal },
                {
                  text: "RESET",
                  style: "destructive",
                  onPress: () => {
                    settings.resetSettingsKeys(SETTINGS_GROUPS[group]);
                    hideModal();
                    showModal("DONE", `${label} settings have been restored to their defaults.`, [
                      { text: "OK", onPress: hideModal },
                    ]);
                  },
                },
              ]
            );
          }}
          style={({ pressed }) => [
            styles.groupResetBtn,
            { borderColor: modified ? themeColors.warning + "60" : themeColors.border },
            !modified && styles.groupResetBtnDisabled,
            pressed && modified && { opacity: 0.6 },
          ]}
        >
          <Feather name="refresh-ccw" size={11} color={modified ? themeColors.warning : themeColors.textMuted} />
          <Text style={[styles.groupResetText, { color: modified ? themeColors.warning : themeColors.textMuted }]}>RESET</Text>
        </Pressable>
      </View>
    );
  }, [showModal, hideModal, settings, themeColors]);

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: themeColors.bg }]}>
      <View style={[styles.header, { backgroundColor: themeColors.bgSecondary, borderBottomColor: themeColors.border }]}>
        <Feather name="grid" size={18} color={themeColors.accent} />
        <Text style={[styles.headerTitle, { color: themeColors.accent }]}>COMMAND MENUS</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {navSections.map((section) => (
          <React.Fragment key={section.title}>
            <SectionHeader title={section.title} icon={section.icon} />
            {section.items.map((item) => {
              const locked = item.route === "";
              const itemStatus = commandStatuses[item.route];
              const itemStatusColor = statusColor(itemStatus, themeColors);
              const isCritical = itemStatus?.tone === "critical";
              return (
                <Pressable
                  key={item.label}
                  onPress={() => {
                    if (locked) {
                      showModal("LOCKED", "The debug terminal is only available in the full version of MEGACITY.", [{ text: "OK", onPress: hideModal }]);
                      return;
                    }
                    router.push(item.route as any);
                  }}
                  style={({ pressed }) => [
                    styles.navItem,
                    { backgroundColor: themeColors.bgCard, borderColor: themeColors.border },
                    isCritical && { borderColor: themeColors.danger, borderWidth: 2, backgroundColor: themeColors.danger + "15" },
                    pressed && styles.navPressed,
                    locked && { opacity: 0.5 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}${itemStatus ? `, ${itemStatus.label.toLowerCase()}` : ""}`}
                >
                  <View style={styles.navLeft}>
                    <View style={[styles.iconWrap, { backgroundColor: themeColors.bg, borderColor: isCritical ? themeColors.danger : themeColors.borderBright }]}>{item.icon}</View>
                    <View style={styles.navText}>
                      <View style={styles.labelRow}>
                        <Text style={[styles.navLabel, { color: isCritical ? themeColors.danger : themeColors.text }]}>{item.label}</Text>
                        {locked && <Feather name="lock" size={10} color={themeColors.textMuted} style={{ marginLeft: 4 }} />}
                      </View>
                      <Text style={[styles.navSub, { color: themeColors.textMuted }]}>{item.subtitle}</Text>
                    </View>
                  </View>
                  {itemStatus && (
                    <View
                      testID={`command-status-${item.route.split("/").pop()}`}
                      style={[
                        styles.statusBadge,
                        {
                          borderColor: itemStatusColor + "80",
                          backgroundColor: itemStatusColor + "18",
                        },
                      ]}
                    >
                      <Text style={[styles.statusBadgeText, { color: itemStatusColor }]} numberOfLines={1}>
                        {itemStatus.label}
                      </Text>
                    </View>
                  )}
                  <Feather name="chevron-right" size={16} color={isCritical ? themeColors.danger : themeColors.textMuted} />
                </Pressable>
              );
            })}
          </React.Fragment>
        ))}

        <SectionHeader title="System" icon={<Feather name="settings" size={14} color={themeColors.accent} />} />

        {/* Honor Mode toggle: when on, manual save/load are hidden so the
            current slot becomes effectively perma-death. The setting persists
            on the active slot via setHonorMode in GameContext, and the slot
            metadata gets a HONOR badge so players see which save is locked. */}
        <Pressable
          onPress={() => {
            if (honorMode) {
              showModal("DISABLE HONOR MODE", "Manual saving and loading will be re-enabled for this slot. Continue?", [
                { text: "CANCEL", onPress: hideModal },
                { text: "DISABLE", style: "destructive", onPress: () => { setHonorMode(false); hideModal(); } },
              ]);
            } else {
              showModal("ENABLE HONOR MODE", "Manual save and load will be hidden for this slot. Auto-save still runs, but every consequence is permanent. Continue?", [
                { text: "CANCEL", onPress: hideModal },
                { text: "ENABLE", style: "destructive", onPress: () => { setHonorMode(true); hideModal(); } },
              ]);
            }
          }}
          style={({ pressed }) => [
            styles.sysBtn,
            { backgroundColor: themeColors.bgCard, borderColor: honorMode ? themeColors.warning : themeColors.border },
            pressed && styles.navPressed,
          ]}
        >
          <Feather name={honorMode ? "shield" : "shield-off"} size={16} color={honorMode ? themeColors.warning : themeColors.textMuted} />
          <Text style={[styles.sysBtnText, { color: honorMode ? themeColors.warning : themeColors.text }]}>
            HONOR MODE {honorMode ? "ON" : "OFF"}
          </Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>
            {honorMode ? "Manual save/load hidden — auto-save only" : "Hide manual save/load · perma-death"}
          </Text>
        </Pressable>

        {!honorMode && (
        <Pressable
          onPress={() => setShowSaveSlots(true)}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, pressed && styles.navPressed]}
        >
          <Feather name="save" size={16} color={themeColors.info} />
          <Text style={[styles.sysBtnText, { color: themeColors.info }]}>SAVE GAME</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Slot {activeSlot}</Text>
        </Pressable>
        )}

        {!honorMode && showSaveSlots && (
          <View style={styles.slotPanel}>
            {[1, 2, 3, 4, 5, 6].map((slot) => {
              const meta = slotMetas.find((m) => m.slotId === slot);
              const empty = !meta || meta.isEmpty;
              const isActive = slot === activeSlot;
              return (
                <Pressable
                  key={slot}
                  onPress={async () => {
                    // RN Pressable still fires onPress on release after a
                    // long-press, so the rename gesture would also save the
                    // slot. The long-press handler sets a one-shot ref that we
                    // consume here to suppress that follow-up save.
                    if (longPressFiredRef.current) {
                      longPressFiredRef.current = false;
                      return;
                    }
                    await saveToSlot(slot);
                    setShowSaveSlots(false);
                    showModal("SAVED", `Game saved to Slot ${slot}.`, [{ text: "OK", onPress: hideModal }]);
                  }}
                  onLongPress={!empty ? () => {
                    longPressFiredRef.current = true;
                    setLabelEditorSlot(slot);
                    setLabelEditorText(meta!.label ?? "");
                  } : undefined}
                  // Clear the one-shot flag at the end of every gesture so a
                  // canceled press (release off-target) can't swallow the next
                  // legitimate tap. Fires after onPress, which is a safe no-op.
                  onPressOut={() => { longPressFiredRef.current = false; }}
                  delayLongPress={400}
                  style={({ pressed }) => [styles.slotCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, isActive && { borderColor: themeColors.accent + "60", backgroundColor: themeColors.accent + "08" }, pressed && styles.navPressed]}
                >
                  <View style={styles.slotCardHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                      <Text style={[styles.slotLabel, { color: themeColors.text }]}>SLOT {slot}{isActive ? " · CURRENT" : ""}</Text>
                      {!empty && meta!.honorMode && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, borderWidth: 1, borderColor: themeColors.warning + "60", backgroundColor: themeColors.warning + "12" }}>
                          <Feather name="shield" size={9} color={themeColors.warning} />
                          <Text style={{ color: themeColors.warning, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1.2 }}>HONOR</Text>
                        </View>
                      )}
                    </View>
                    {!empty && (
                      <Pressable
                        onPress={(e) => { e.stopPropagation?.(); setLabelEditorSlot(slot); setLabelEditorText(meta!.label ?? ""); }}
                        accessibilityLabel={`Edit label for save slot ${slot}`}
                        hitSlop={8}
                        style={styles.slotEditMini}
                      >
                        <Feather name="edit-2" size={11} color={themeColors.accent} />
                        <Text style={[styles.slotEditMiniText, { color: themeColors.accent }]}>EDIT</Text>
                      </Pressable>
                    )}
                  </View>
                  {empty ? (
                    <Text style={[styles.slotInfo, { color: themeColors.textMuted, marginTop: 4 }]}>EMPTY · TAP TO SAVE</Text>
                  ) : (
                    <View style={{ marginTop: 4, gap: 2 }}>
                      {meta!.label ? (
                        <Text style={[styles.slotCardLabel, { color: themeColors.accent }]}>{meta!.label}</Text>
                      ) : null}
                      <Text style={[styles.slotInfo, { color: themeColors.text }]}>{meta!.playerName ?? "Commander"}</Text>
                      <Text style={[styles.slotInfo, { color: themeColors.textMuted }]}>{meta!.cityName ?? "MegaCity"}</Text>
                      <Text style={[styles.slotInfo, { color: themeColors.accent }]}>LVL {meta!.playerLevel} · TICK {meta!.totalTicks} · POP {(meta!.population / 1000).toFixed(0)}k</Text>
                      <Text style={[styles.slotInfo, { color: themeColors.textMuted }]}>Saved {formatRelative(meta!.lastSaved)}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {!honorMode && (
        <Pressable
          onPress={() => setShowLoadSlots(true)}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, pressed && styles.navPressed]}
        >
          <Feather name="download" size={16} color={themeColors.accent} />
          <Text style={[styles.sysBtnText, { color: themeColors.accent }]}>LOAD GAME</Text>
        </Pressable>
        )}

        {!honorMode && showLoadSlots && (
          <View style={styles.slotPanel}>
            {[1, 2, 3, 4, 5, 6].map((slot) => {
              const meta = slotMetas.find((m) => m.slotId === slot);
              const empty = !meta || meta.isEmpty;
              const isActive = slot === activeSlot;
              if (empty) {
                return (
                  <View key={slot} style={[styles.slotCard, { opacity: 0.45, backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                    <Text style={[styles.slotLabel, { color: themeColors.text }]}>SLOT {slot}</Text>
                    <Text style={[styles.slotInfo, { color: themeColors.textMuted, marginTop: 4 }]}>EMPTY</Text>
                  </View>
                );
              }
              return (
                <Pressable
                  key={slot}
                  onPress={async () => {
                    const ok = await loadSlot(slot);
                    setShowLoadSlots(false);
                    if (ok) {
                      showModal("LOADED", `Slot ${slot} loaded successfully.`, [{ text: "OK", onPress: hideModal }]);
                    } else {
                      showModal("ERROR", "Failed to load save.", [{ text: "OK", onPress: hideModal }]);
                    }
                  }}
                  style={({ pressed }) => [styles.slotCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, isActive && { borderColor: themeColors.accent + "60", backgroundColor: themeColors.accent + "08" }, pressed && styles.navPressed]}
                >
                  <View style={styles.slotCardHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                      <Text style={[styles.slotLabel, { color: themeColors.text }]}>SLOT {slot}{isActive ? " · CURRENT" : ""}</Text>
                      {meta!.honorMode && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, borderWidth: 1, borderColor: themeColors.warning + "60", backgroundColor: themeColors.warning + "12" }}>
                          <Feather name="shield" size={9} color={themeColors.warning} />
                          <Text style={{ color: themeColors.warning, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1.2 }}>HONOR</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <Pressable
                        onPress={(e) => { e.stopPropagation?.(); setLabelEditorSlot(slot); setLabelEditorText(meta!.label ?? ""); }}
                        accessibilityLabel={`Edit label for save slot ${slot}`}
                        hitSlop={8}
                        style={styles.slotEditMini}
                      >
                        <Feather name="edit-2" size={11} color={themeColors.accent} />
                        <Text style={[styles.slotEditMiniText, { color: themeColors.accent }]}>EDIT</Text>
                      </Pressable>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          showModal("DELETE SAVE?", `Permanently delete Slot ${slot}?`, [
                            { text: "Cancel", style: "cancel", onPress: hideModal },
                            { text: "DELETE", style: "destructive", onPress: () => { hideModal(); deleteSlot(slot); } },
                          ]);
                        }}
                        accessibilityLabel={`Delete save slot ${slot}`}
                        hitSlop={8}
                        style={styles.slotEditMini}
                      >
                        <Feather name="trash-2" size={11} color={themeColors.danger} />
                        <Text style={[styles.slotEditMiniText, { color: themeColors.danger }]}>DEL</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={{ marginTop: 4, gap: 2 }}>
                    {meta!.label ? (
                      <Text style={[styles.slotCardLabel, { color: themeColors.accent }]}>{meta!.label}</Text>
                    ) : null}
                    <Text style={[styles.slotInfo, { color: themeColors.text }]}>{meta!.playerName ?? "Commander"}</Text>
                    <Text style={[styles.slotInfo, { color: themeColors.textMuted }]}>{meta!.cityName ?? "MegaCity"}</Text>
                    <Text style={[styles.slotInfo, { color: themeColors.accent }]}>LVL {meta!.playerLevel} · TICK {meta!.totalTicks} · POP {(meta!.population / 1000).toFixed(0)}k</Text>
                    <Text style={[styles.slotInfo, { color: themeColors.textMuted }]}>Saved {formatRelative(meta!.lastSaved)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {!honorMode && (
        <Pressable
          onPress={async () => {
            const out = await exportSlot(activeSlot);
            if (!out) {
              showModal("EXPORT FAILED", `Slot ${activeSlot} is empty or could not be read.`, [{ text: "OK", onPress: hideModal }]);
              return;
            }
            if (Platform.OS === "web") {
              try {
                const blob = new Blob([out.json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = out.suggestedName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                showModal("EXPORTED", `Slot ${activeSlot} downloaded as ${out.suggestedName}.`, [{ text: "OK", onPress: hideModal }]);
              } catch {
                setExportPreview(out);
              }
            } else {
              setExportPreview(out);
            }
          }}
          accessibilityLabel={`Export save slot ${activeSlot}`}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, pressed && styles.navPressed]}
        >
          <Feather name="upload" size={16} color={themeColors.warning} />
          <Text style={[styles.sysBtnText, { color: themeColors.warning }]}>EXPORT SAVE</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Slot {activeSlot} — JSON</Text>
        </Pressable>
        )}

        {!honorMode && (
        <Pressable
          onPress={() => {
            if (Platform.OS === "web") {
              try {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "application/json,.json";
                input.onchange = async () => {
                  const file = input.files && input.files[0];
                  if (!file) return;
                  const text = await file.text();
                  setImportJsonText(text);
                  setImportTargetSlot(activeSlot);
                };
                input.click();
              } catch {
                setImportJsonText("");
                setImportTargetSlot(activeSlot);
              }
            } else {
              setImportJsonText("");
              setImportTargetSlot(activeSlot);
            }
          }}
          accessibilityLabel="Import save data"
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, pressed && styles.navPressed]}
        >
          <Feather name="download-cloud" size={16} color={themeColors.warning} />
          <Text style={[styles.sysBtnText, { color: themeColors.warning }]}>IMPORT SAVE</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>JSON file or paste</Text>
        </Pressable>
        )}

        {!honorMode && (
        <Pressable
          onPress={async () => {
            const out = await exportFullBackup();
            if (!out) {
              showModal("BACKUP FAILED", "No save slots contain data. Start a run before backing up.", [{ text: "OK", onPress: hideModal }]);
              return;
            }
            if (Platform.OS === "web") {
              try {
                const blob = new Blob([out.json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = out.suggestedName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                showModal("BACKUP READY", `Downloaded ${out.suggestedName} containing ${out.slotCount} slot${out.slotCount === 1 ? "" : "s"} + settings.`, [{ text: "OK", onPress: hideModal }]);
              } catch {
                setExportPreview({ json: out.json, suggestedName: out.suggestedName });
              }
            } else {
              setExportPreview({ json: out.json, suggestedName: out.suggestedName });
            }
          }}
          accessibilityLabel="Back up all save slots"
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.info }, pressed && styles.navPressed]}
        >
          <Feather name="archive" size={16} color={themeColors.info} />
          <Text style={[styles.sysBtnText, { color: themeColors.info }]}>BACKUP ALL SLOTS</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>All saves + settings — JSON</Text>
        </Pressable>
        )}

        {!honorMode && (
        <Pressable
          onPress={() => {
            if (Platform.OS === "web") {
              try {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "application/json,.json";
                input.onchange = async () => {
                  const file = input.files && input.files[0];
                  if (!file) return;
                  const text = await file.text();
                  setImportJsonText(text);
                  setImportFullTarget(true);
                  setImportTargetSlot(0);
                };
                input.click();
              } catch {
                setImportJsonText("");
                setImportFullTarget(true);
                setImportTargetSlot(0);
              }
            } else {
              setImportJsonText("");
              setImportFullTarget(true);
              setImportTargetSlot(0);
            }
          }}
          accessibilityLabel="Restore a full save backup"
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.info }, pressed && styles.navPressed]}
        >
          <Feather name="rotate-ccw" size={16} color={themeColors.info} />
          <Text style={[styles.sysBtnText, { color: themeColors.info }]}>RESTORE FROM BACKUP</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Overwrite all slots from a backup file</Text>
        </Pressable>
        )}

        <Pressable
          onPress={toggleTheme}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, pressed && styles.navPressed]}
        >
          <Feather name={isDark ? "sun" : "moon"} size={16} color={themeColors.info} />
          <Text style={[styles.sysBtnText, { color: themeColors.info }]}>{isDark ? "LIGHT MODE" : "DARK MODE"}</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>{isDark ? "DECLASSIFIED" : "CLASSIFIED"}</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            showModal(
              "EXIT GAME",
              "Save your progress and return to the main menu?",
              [
                { text: "CANCEL", style: "cancel" },
                {
                  text: "SAVE & EXIT", style: "default", onPress: async () => {
                    await saveGame();
                    hideModal();
                    router.replace("/");
                  },
                },
                {
                  text: "EXIT WITHOUT SAVING", style: "destructive", onPress: () => {
                    hideModal();
                    router.replace("/");
                  },
                },
              ]
            );
          }}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.danger + "15" }, pressed && styles.navPressed]}
        >
          <Feather name="log-out" size={16} color={themeColors.danger} />
          <Text style={[styles.sysBtnText, { color: themeColors.danger }]}>EXIT GAME</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Return to main menu</Text>
        </Pressable>

        {isElectronShell() && (
          <Pressable
            onPress={() => {
              showModal(
                "QUIT TO DESKTOP",
                "Save your progress and close the game?",
                [
                  { text: "CANCEL", style: "cancel" },
                  {
                    text: "SAVE & QUIT", style: "default", onPress: async () => {
                      await saveAndQuit({
                        saveGame,
                        quit: () => {
                          hideModal();
                          // quitApp marks the quit confirmed in the Electron main
                          // process first, so the close-guard dialog never
                          // re-prompts a player who already chose to quit here.
                          quitDesktopApp();
                        },
                        onSaveFailure: () => {
                          showModal(
                            "SAVE FAILED",
                            "Your progress could not be saved. Quit anyway and lose any progress since the last successful save?",
                            [
                              { text: "CANCEL", style: "cancel", onPress: hideModal },
                              {
                                text: "QUIT ANYWAY",
                                style: "destructive",
                                onPress: () => {
                                  hideModal();
                                  quitDesktopApp();
                                },
                              },
                            ],
                          );
                        },
                      });
                    },
                  },
                  {
                    text: "QUIT WITHOUT SAVING", style: "destructive", onPress: () => {
                      hideModal();
                      quitDesktopApp();
                    },
                  },
                ]
              );
            }}
            style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.danger + "15" }, pressed && styles.navPressed]}
          >
            <Feather name="power" size={16} color={themeColors.danger} />
            <Text style={[styles.sysBtnText, { color: themeColors.danger }]}>QUIT TO DESKTOP</Text>
            <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Close the game window</Text>
          </Pressable>
        )}

        <SectionHeader title="Display Settings" icon={<Feather name="monitor" size={14} color={themeColors.accent} />} rightContent={renderGroupReset("display", "Display")} />

        <Pressable
          onPress={() => { enterPhotoMode(); router.push("/(game)/overview" as any); }}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.accent + "30" }, pressed && styles.navPressed]}
        >
          <Feather name="camera" size={16} color={themeColors.accent} />
          <Text style={[styles.sysBtnText, { color: themeColors.text }]}>PHOTO MODE</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Hide HUD + pause sim. Press H to toggle.</Text>
        </Pressable>

        {isElectronShell() && (
          <Pressable
            onPress={async () => {
              const opened = await openScreenshotsFolder();
              if (!opened) {
                showModal("SCREENSHOTS FOLDER", "The screenshots folder could not be opened.", [
                  { text: "CLOSE", style: "cancel" },
                ]);
              }
            }}
            style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.accent + "30" }, pressed && styles.navPressed]}
          >
            <Feather name="folder" size={16} color={themeColors.accent} />
            <Text style={[styles.sysBtnText, { color: themeColors.text }]}>OPEN SCREENSHOTS FOLDER</Text>
            <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>View captures saved with F9.</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => router.push("/(game)/summary" as any)}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.accent + "30" }, pressed && styles.navPressed]}
        >
          <Feather name="award" size={16} color={themeColors.accent} />
          <Text style={[styles.sysBtnText, { color: themeColors.text }]}>RUN SUMMARY</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Shareable recap of your run so far.</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/(game)/replay" as any)}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.accent + "30" }, pressed && styles.navPressed]}
        >
          <Feather name="rewind" size={16} color={themeColors.accent} />
          <Text style={[styles.sysBtnText, { color: themeColors.text }]}>REPLAY TIMELINE</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Scrub through every event you lived through.</Text>
        </Pressable>

        <SettingToggle label="CRT OVERLAY" description="Phosphor glow and vignette effect" value={settings.crtEnabled} onToggle={(v) => settings.setSetting("crtEnabled", v)} />
        <SettingToggle label="SCANLINES" description="Retro scanline effect on screens" value={settings.scanlineEnabled} onToggle={(v) => settings.setSetting("scanlineEnabled", v)} />
        <SettingToggle label="COMMS CHATTER" description="Ambient radio transmissions and faction broadcasts" value={settings.commsChatterEnabled} onToggle={(v) => settings.setSetting("commsChatterEnabled", v)} />
        <SettingToggle label="DESKTOP LAYOUT" description="Center content on wide screens (700px max)" value={settings.wideLayoutEnabled} onToggle={(v) => settings.setSetting("wideLayoutEnabled", v)} />
        <SettingToggle label="HOTKEY HINTS" description="Show keyboard shortcut letters on nav buttons (web)" value={settings.showHotkeys} onToggle={(v) => settings.setSetting("showHotkeys", v)} />
        <SettingToggle label="PAUSE WHEN AWAY" description="Auto-pause when you switch tabs or minimize the window" value={settings.pauseOnBlur} onToggle={(v) => settings.setSetting("pauseOnBlur", v)} />
        <SettingToggle label="WARN BEFORE CLOSING" description="Confirm dialog if you close the tab while the game is running" value={settings.confirmOnClose} onToggle={(v) => settings.setSetting("confirmOnClose", v)} />
        <SettingToggle label="SKIP INTRO" description="Reserved — no opening cinematic exists yet. Toggle is preserved for future intro sequences." value={settings.skipIntro} onToggle={(v) => settings.setSetting("skipIntro", v)} />

        <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={settingStyles.labelWrap}>
            <Text style={[settingStyles.label, { color: themeColors.text }]}>DEFAULT START STYLE</Text>
            <Text style={[settingStyles.desc, { color: themeColors.textMuted }]}>
              Pre-selected start mode for new cities. Guided starts paused with objectives and coach tips; Veteran unlocks everything immediately. You can still switch it when creating a commander.
            </Text>
          </View>
          <View style={settingStyles.optionRow}>
            {(["guided", "veteran"] as StartStyle[]).map((s) => {
              const selected = settings.defaultStartStyle === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => settings.setSetting("defaultStartStyle", s)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Default start style: ${s}`}
                  accessibilityState={{ selected }}
                  style={[settingStyles.optionBtn, { borderColor: themeColors.border }, selected && { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "18" }]}
                >
                  <Text style={[settingStyles.optionText, { color: selected ? themeColors.accent : themeColors.textMuted }]}>{s.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={settingStyles.labelWrap}>
            <Text style={[settingStyles.label, { color: themeColors.text }]}>FONT SCALE</Text>
            <Text style={[settingStyles.desc, { color: themeColors.textMuted }]}>Adjust text size across all screens</Text>
          </View>
          <View style={settingStyles.optionRow}>
            {(["xsmall", "small", "normal", "large", "xlarge", "xxlarge", "xxxlarge"] as FontScale[]).map((s) => (
              <Pressable key={s} onPress={() => settings.setSetting("fontScale", s)} accessibilityRole="radio" accessibilityLabel={`Font scale: ${s}`} accessibilityState={{ selected: settings.fontScale === s }} style={[settingStyles.optionBtn, { borderColor: themeColors.border }, settings.fontScale === s && { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "18" }]}>
                <Text style={[settingStyles.optionText, { color: settings.fontScale === s ? themeColors.accent : themeColors.textMuted }]}>{
                  s === "xsmall" ? "XS" : s === "xxxlarge" ? "3XL" : s === "xxlarge" ? "XXL" : s === "xlarge" ? "XL" : s === "small" ? "S" : s === "large" ? "L" : "M"
                }</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {Platform.OS === "web" && (
          <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
            <View style={settingStyles.labelWrap}>
              <Text style={[settingStyles.label, { color: themeColors.text }]}>UI SCALE</Text>
              <Text style={[settingStyles.desc, { color: themeColors.textMuted }]}>
                Scale the whole interface — text, buttons, and layout together. Made for 1440p and larger monitors. Applies on top of font scale.
              </Text>
            </View>
            <View style={settingStyles.optionRow}>
              {UI_SCALE_OPTIONS.map((s) => {
                const selected = normalizeUiScale(settings.uiScale) === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => settings.setSetting("uiScale", s)}
                    accessibilityRole="radio"
                    accessibilityLabel={`Interface scale: ${Math.round(s * 100)} percent`}
                    accessibilityState={{ selected }}
                    style={[settingStyles.optionBtn, { borderColor: themeColors.border }, selected && { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "18" }]}
                  >
                    <Text style={[settingStyles.optionText, { color: selected ? themeColors.accent : themeColors.textMuted }]}>{Math.round(s * 100)}%</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={settingStyles.labelWrap}>
            <Text style={[settingStyles.label, { color: themeColors.text }]}>AUTO-SAVE</Text>
            <Text style={[settingStyles.desc, { color: themeColors.textMuted }]}>Automatic save interval</Text>
          </View>
          <View style={settingStyles.optionRow}>
            {([1, 5, 0] as AutoSaveInterval[]).map((m) => (
              <Pressable key={m} onPress={() => settings.setSetting("autoSaveMinutes", m)} accessibilityRole="radio" accessibilityLabel={`Auto-save: ${m === 0 ? "off" : `every ${m} minutes`}`} accessibilityState={{ selected: settings.autoSaveMinutes === m }} style={[settingStyles.optionBtn, { borderColor: themeColors.border }, settings.autoSaveMinutes === m && { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "18" }]}>
                <Text style={[settingStyles.optionText, { color: settings.autoSaveMinutes === m ? themeColors.accent : themeColors.textMuted }]}>{m === 0 ? "OFF" : `${m}m`}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={settingStyles.labelWrap}>
            <Text style={[settingStyles.label, { color: themeColors.text }]}>OFFLINE SIM DEPTH</Text>
            <Text style={[settingStyles.desc, { color: themeColors.textMuted }]}>
              How many missed ticks are fully simulated when you return. Numbers below are the rough resume wait after a long absence. Very long absences still extrapolate beyond the chosen depth.
            </Text>
          </View>
          <View style={settingStyles.optionRow}>
            {(["lite", "standard", "deep"] as OfflineSimDepth[]).map((d) => {
              const selected = settings.offlineSimDepth === d;
              const tone = selected ? themeColors.accent : themeColors.textMuted;
              return (
                <Pressable key={d} onPress={() => settings.setSetting("offlineSimDepth", d)} accessibilityRole="radio" accessibilityLabel={`Offline simulation depth: ${d}`} accessibilityState={{ selected }} style={[settingStyles.optionBtn, { borderColor: themeColors.border, alignItems: "center" }, selected && { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "18" }]}>
                  <Text style={[settingStyles.optionText, { color: tone }]}>{d.toUpperCase()}</Text>
                  <Text style={[settingStyles.optionSubText, { color: tone }]}>{formatResumeEstimate(d, msPerTick)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ResumeTrendList samples={state.recentResumeSamples} />

        <View style={{ height: 4 }} />

        <SectionHeader title="Audio" icon={<Feather name="volume-2" size={14} color={themeColors.accent} />} rightContent={renderGroupReset("audio", "Audio")} />

        <SettingToggle label="SOUND EFFECTS" description="Toggle all UI and event sound effects" value={!settings.soundMuted} onToggle={(v) => settings.setSetting("soundMuted", !v)} />

        <SettingToggle label="HAPTIC FEEDBACK" description="Vibrate on taps, completions, and alerts. Reduced motion overrides." value={settings.hapticsEnabled} onToggle={(v) => settings.setSetting("hapticsEnabled", v)} />

        <SettingToggle label="REACTIVE AMBIENCE" description="Living-city soundscape that shifts with unrest and crime — distant sirens, protest chants, calmer hum when stable. Respects volume and reduced motion." value={settings.ambienceEnabled} onToggle={(v) => settings.setSetting("ambienceEnabled", v)} />

        <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={settingStyles.labelWrap}>
            <Text style={[settingStyles.label, { color: themeColors.text }]}>VOLUME</Text>
            <Text style={[settingStyles.desc, { color: themeColors.textMuted }]}>
              {settings.soundMuted ? "MUTED" : `${Math.round(settings.soundVolume * 100)}%`}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {([0.2, 0.4, 0.6, 0.8, 1.0] as const).map((v) => (
              <Pressable
                key={v}
                onPress={() => settings.setSetting("soundVolume", v)}
                accessibilityRole="radio"
                accessibilityLabel={`Sound volume: ${Math.round(v * 100)} percent`}
                accessibilityState={{ selected: settings.soundVolume === v }}
                style={[settingStyles.optionBtn, { borderColor: themeColors.border, minWidth: 36 }, settings.soundVolume === v && { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "18" }]}
              >
                <Text style={[settingStyles.optionText, { color: settings.soundVolume === v ? themeColors.accent : themeColors.textMuted }]}>
                  {Math.round(v * 100)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ height: 4 }} />

        <SectionHeader title="Accessibility" icon={<Feather name="eye" size={14} color={themeColors.accent} />} rightContent={renderGroupReset("accessibility", "Accessibility")} />

        <SettingToggle
          label="REDUCED MOTION"
          description="Disable animations and transitions"
          value={settings.reducedMotion}
          onToggle={(v) => settings.setSetting("reducedMotion", v)}
        />

        <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={settingStyles.labelWrap}>
            <Text style={[settingStyles.label, { color: themeColors.text }]}>COLORBLIND PALETTE</Text>
            <Text style={[settingStyles.desc, { color: themeColors.textMuted }]}>Remap status colors for color vision deficiency</Text>
          </View>
          <View style={settingStyles.optionRow}>
            {(["off", "deuteranopia", "protanopia", "tritanopia"] as ColorblindMode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => settings.setSetting("colorblindMode", m)}
                accessibilityRole="radio"
                accessibilityLabel={`Colorblind palette: ${m === "off" ? "off" : m}`}
                accessibilityState={{ selected: settings.colorblindMode === m }}
                style={[
                  settingStyles.optionBtn,
                  { borderColor: themeColors.border },
                  settings.colorblindMode === m && { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "18" },
                ]}
              >
                <Text style={[settingStyles.optionText, { color: settings.colorblindMode === m ? themeColors.accent : themeColors.textMuted }]}>
                  {m === "off" ? "OFF" : m === "deuteranopia" ? "DEU" : m === "protanopia" ? "PRO" : "TRI"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <SettingToggle
          label="HIGH CONTRAST TEXT"
          description="Brighten secondary text for readability in bright rooms"
          value={settings.highContrastText}
          onToggle={(v) => settings.setSetting("highContrastText", v)}
        />

        <SettingToggle
          label="ONBOARDING TIPS"
          description="Show contextual TIP popovers on screens"
          value={settings.tipsEnabled}
          onToggle={(v) => settings.setSetting("tipsEnabled", v)}
        />

        <Pressable
          onPress={() => {
            showModal("RESET TIPS", "All onboarding tips you've previously dismissed will appear again. Continue?", [
              { text: "CANCEL", onPress: hideModal },
              {
                text: "RESET TIPS",
                style: "destructive",
                onPress: () => {
                  resetHints();
                  hideModal();
                  showModal("DONE", "All tips have been reset and will appear again on relevant screens.", [
                    { text: "OK", onPress: hideModal },
                  ]);
                },
              },
            ]);
          }}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, pressed && styles.navPressed]}
        >
          <Feather name="rotate-ccw" size={16} color={themeColors.accent} />
          <Text style={[styles.sysBtnText, { color: themeColors.text }]}>RESET ALL TIPS</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Re-show every tutorial hint</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/(game)/tips-reviewed")}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, pressed && styles.navPressed]}
        >
          <Feather name="book-open" size={16} color={themeColors.accent} />
          <Text style={[styles.sysBtnText, { color: themeColors.text }]}>TIPS REVIEWED</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Browse every tutorial hint in the game</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            showModal(
              "REPLAY ORIENTATION?",
              "Re-watch the five-beat first-run walkthrough. Replay is cosmetic — no credits are spent, no edicts are issued, no save state is altered.",
              [
                { text: "CANCEL", onPress: hideModal },
                {
                  text: "REPLAY",
                  onPress: () => {
                    hideModal();
                    // Replay is read-only: route with replay=1 query param so
                    // the onboarding screen renders narrative-only beats and
                    // skips all state mutations and inter-screen routing.
                    router.push("/(game)/onboarding?replay=1");
                  },
                },
              ]
            );
          }}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }, pressed && styles.navPressed]}
        >
          <Feather name="play-circle" size={16} color={themeColors.accent} />
          <Text style={[styles.sysBtnText, { color: themeColors.text }]}>REPLAY ONBOARDING</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Re-watch the orientation walkthrough (read-only)</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            showModal(
              "RESET PREFERENCES?",
              "Every setting — display, audio, accessibility, default start style, and more — will be restored to its default. Your save slots are not affected. Continue?",
              [
                { text: "CANCEL", onPress: hideModal },
                {
                  text: "RESET",
                  style: "destructive",
                  onPress: () => {
                    settings.resetSettings();
                    hideModal();
                    showModal("DONE", "All preferences have been restored to their defaults.", [
                      { text: "OK", onPress: hideModal },
                    ]);
                  },
                },
              ]
            );
          }}
          style={({ pressed }) => [styles.sysBtn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.warning + "60" }, pressed && styles.navPressed]}
        >
          <Feather name="refresh-ccw" size={16} color={themeColors.warning} />
          <Text style={[styles.sysBtnText, { color: themeColors.text }]}>RESET TO DEFAULTS</Text>
          <Text style={[styles.sysBtnSub, { color: themeColors.textMuted }]}>Restore every preference to its default</Text>
        </Pressable>

        <View style={{ height: 4 }} />

        <SectionHeader title="Steam Desktop" icon={<MaterialCommunityIcons name="steam" size={14} color={themeColors.textMuted} />} />

        <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border, flexDirection: "column", alignItems: "flex-start", gap: 8 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="award" size={14} color={themeColors.textMuted} />
            <Text style={[settingStyles.label, { color: themeColors.textMuted }]}>ACHIEVEMENT SYNC</Text>
          </View>
          <Text style={[settingStyles.desc, { color: themeColors.textMuted }]}>Steam achievement tracking will sync your in-game milestones to your Steam profile.</Text>
          <View style={{ alignSelf: "flex-end", backgroundColor: themeColors.warning + "18", borderColor: themeColors.warning + "40", borderWidth: 1, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: themeColors.warning, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>COMING SOON</Text>
          </View>
        </View>

        <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border, flexDirection: "column", alignItems: "flex-start", gap: 8 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="cloud" size={14} color={themeColors.textMuted} />
            <Text style={[settingStyles.label, { color: themeColors.textMuted }]}>CLOUD SAVE</Text>
          </View>
          <Text style={[settingStyles.desc, { color: themeColors.textMuted }]}>Steam Cloud saves will allow cross-device continuity between web and desktop clients.</Text>
          <View style={{ alignSelf: "flex-end", backgroundColor: themeColors.warning + "18", borderColor: themeColors.warning + "40", borderWidth: 1, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: themeColors.warning, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>COMING SOON</Text>
          </View>
        </View>

        <View style={[settingStyles.row, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border + "60", flexDirection: "column", alignItems: "center", gap: 4, paddingVertical: 16 }]}>
          <MaterialCommunityIcons name="steam" size={20} color={themeColors.textMuted + "60"} />
          <Text style={{ color: themeColors.textMuted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 2, textAlign: "center" }}>STEAM DESKTOP RELEASE</Text>
          <Text style={{ color: themeColors.textMuted + "80", fontFamily: "Inter_400Regular", fontSize: 9, textAlign: "center" }}>Full desktop client with Steam integration planned for future release.</Text>
        </View>

        <View style={{ height: 4 }} />

        <SectionHeader title="Advanced" icon={<Feather name="terminal" size={14} color={themeColors.warning} />} />

        <Pressable
          onPress={forceTick}
          style={({ pressed }) => [styles.sysBtn, pressed && styles.navPressed]}
        >
          <Feather name="fast-forward" size={16} color={themeColors.warning} />
          <Text style={[styles.sysBtnText, { color: themeColors.warning }]}>FORCE TICK</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/")}
          style={({ pressed }) => [styles.sysBtn, pressed && styles.navPressed]}
        >
          <Feather name="log-out" size={16} color={themeColors.textMuted} />
          <Text style={[styles.sysBtnText, { color: themeColors.textMuted }]}>RETURN TO MAIN MENU</Text>
        </Pressable>

        {/* City stats summary */}
        <SectionHeader title="Quick Status" icon={<Feather name="info" size={14} color={themeColors.accent} />} />
        <View style={styles.statusGrid}>
          <StatusChip label="TICKS" value={state.totalTicks} />
          <StatusChip label="CRIME" value={state.cityStats.crime} color={state.cityStats.crime > 50 ? themeColors.danger : themeColors.accent} />
          <StatusChip label="UNREST" value={state.cityStats.unrest} color={state.cityStats.unrest > 50 ? themeColors.warning : themeColors.accent} />
          <StatusChip label="CREDITS" value={`${Math.floor(state.resources.credits / 1000)}k`} />
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
      <GameModal visible={modal.visible} title={modal.title} message={modal.message} buttons={modal.buttons} onDismiss={hideModal} />

      <Modal
        visible={exportPreview != null}
        animationType="fade"
        transparent
        onRequestClose={() => setExportPreview(null)}
      >
        <View style={styles.labelEditorOverlay}>
          <View style={[styles.labelEditorBox, { backgroundColor: themeColors.bg, borderColor: themeColors.accent, maxHeight: Platform.OS === "web" ? "96%" : "80%" }]}>
            <Text style={[styles.labelEditorTitle, { color: themeColors.accent }]}>EXPORT SAVE — SLOT {activeSlot}</Text>
            <Text style={[styles.labelEditorHint, { color: themeColors.textMuted }]}>
              Suggested filename: {exportPreview?.suggestedName ?? ""}{"\n"}Select all and copy this JSON to back up your save.
            </Text>
            <TextInput
              value={exportPreview?.json ?? ""}
              editable={false}
              multiline
              selectTextOnFocus
              accessibilityLabel="Save export JSON (read-only)"
              style={[styles.labelEditorInput, { backgroundColor: themeColors.bgSecondary, borderColor: themeColors.border, color: themeColors.text, minHeight: Platform.OS === "web" ? 120 : 180, maxHeight: Platform.OS === "web" ? 280 : 320, textAlignVertical: "top", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }]}
            />
            <View style={styles.labelEditorActions}>
              <Pressable
                onPress={handleCopyExportJson}
                style={[styles.labelEditorBtn, { borderColor: themeColors.info, backgroundColor: themeColors.info + "10" }]}
              >
                <Feather name={copyFlash ? "check-circle" : "copy"} size={12} color={themeColors.info} />
                <Text style={[styles.labelEditorBtnText, { color: themeColors.info }]}>{copyFlash ? "COPIED" : "COPY JSON"}</Text>
              </Pressable>
              <Pressable
                onPress={() => setExportPreview(null)}
                style={[styles.labelEditorBtn, { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "10" }]}
              >
                <Feather name="check" size={12} color={themeColors.accent} />
                <Text style={[styles.labelEditorBtnText, { color: themeColors.accent }]}>DONE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={importTargetSlot != null}
        animationType="fade"
        transparent
        onRequestClose={() => { setImportTargetSlot(null); setImportJsonText(""); setImportFullTarget(false); }}
      >
        <View style={styles.labelEditorOverlay}>
          <View style={[styles.labelEditorBox, { backgroundColor: themeColors.bg, borderColor: themeColors.accent, maxHeight: Platform.OS === "web" ? "96%" : "80%" }]}>
            <Text style={[styles.labelEditorTitle, { color: themeColors.accent }]}>
              {importFullTarget ? "RESTORE FULL BACKUP" : `IMPORT SAVE → SLOT ${importTargetSlot ?? ""}`}
            </Text>
            <Text style={[styles.labelEditorHint, { color: themeColors.textMuted }]}>
              {importFullTarget
                ? "Paste a MEGACITY full-backup JSON below. Every slot inside the backup will overwrite the matching slot — existing saves are kept under their backup suffix."
                : "Paste a previously exported MEGACITY save JSON below. The current slot will be backed up automatically."}
            </Text>
            <TextInput
              value={importJsonText}
              onChangeText={setImportJsonText}
              multiline
              autoFocus
              accessibilityLabel="Paste save backup JSON to import"
              placeholder={importFullTarget ? '{"format":"megacity-full-backup", ...}' : '{"format":"megacity-save-export", ...}'}
              placeholderTextColor={themeColors.textMuted}
              style={[styles.labelEditorInput, { backgroundColor: themeColors.bgSecondary, borderColor: themeColors.border, color: themeColors.text, minHeight: Platform.OS === "web" ? 120 : 180, maxHeight: Platform.OS === "web" ? 280 : 320, textAlignVertical: "top", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }]}
            />
            <View style={styles.labelEditorActions}>
              <Pressable
                onPress={() => { setImportTargetSlot(null); setImportJsonText(""); setImportFullTarget(false); }}
                style={[styles.labelEditorBtn, { borderColor: themeColors.border, backgroundColor: themeColors.bgSecondary }]}
              >
                <Text style={[styles.labelEditorBtnText, { color: themeColors.textSecondary }]}>CANCEL</Text>
              </Pressable>
              <Pressable
                disabled={importBusy || !importJsonText.trim()}
                onPress={async () => {
                  if (importTargetSlot == null) return;
                  setImportBusy(true);
                  try {
                    if (importFullTarget) {
                      const result = await importFullBackup(importJsonText);
                      // Only refresh in-memory settings when the import
                      // actually succeeded — failed imports leave disk
                      // untouched, so reloading would be wasted work.
                      if (result.ok) {
                        try { await reloadSettings(); } catch {}
                      }
                      setImportBusy(false);
                      if (result.ok) {
                        setImportTargetSlot(null);
                        setImportJsonText("");
                        setImportFullTarget(false);
                        showModal("BACKUP RESTORED", `Restored ${result.slotCount} slot${result.slotCount === 1 ? "" : "s"} + settings. Tap LOAD GAME to choose a slot.`, [{ text: "OK", onPress: hideModal }]);
                      } else {
                        showModal("RESTORE FAILED", result.error ?? "Invalid backup file.", [{ text: "OK", onPress: hideModal }]);
                      }
                    } else {
                      const result = await importSlot(importTargetSlot, importJsonText);
                      setImportBusy(false);
                      if (result.ok) {
                        const slot = importTargetSlot;
                        setImportTargetSlot(null);
                        setImportJsonText("");
                        showModal("IMPORTED", `Save written to Slot ${slot}. Tap LOAD GAME → Slot ${slot} to begin.`, [{ text: "OK", onPress: hideModal }]);
                      } else {
                        showModal("IMPORT FAILED", result.error ?? "Invalid save file.", [{ text: "OK", onPress: hideModal }]);
                      }
                    }
                  } catch (err: any) {
                    setImportBusy(false);
                    showModal(importFullTarget ? "RESTORE FAILED" : "IMPORT FAILED", String(err?.message ?? err ?? "Unknown error"), [{ text: "OK", onPress: hideModal }]);
                  }
                }}
                style={[styles.labelEditorBtn, { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "10", opacity: importBusy || !importJsonText.trim() ? 0.5 : 1 }]}
              >
                <Feather name={importFullTarget ? "rotate-ccw" : "download"} size={12} color={themeColors.accent} />
                <Text style={[styles.labelEditorBtnText, { color: themeColors.accent }]}>{importBusy ? (importFullTarget ? "RESTORING..." : "IMPORTING...") : (importFullTarget ? "RESTORE" : "IMPORT")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={labelEditorSlot != null}
        animationType="fade"
        transparent
        onRequestClose={() => setLabelEditorSlot(null)}
      >
        <View style={styles.labelEditorOverlay}>
          <View style={[styles.labelEditorBox, { backgroundColor: themeColors.bg, borderColor: themeColors.accent }]}>
            <Text style={[styles.labelEditorTitle, { color: themeColors.accent }]}>RENAME SLOT {labelEditorSlot ?? ""}</Text>
            <Text style={[styles.labelEditorHint, { color: themeColors.textMuted }]}>Up to 40 characters. Leave blank to clear.</Text>
            <TextInput
              value={labelEditorText}
              onChangeText={setLabelEditorText}
              maxLength={40}
              placeholder="e.g. Iron Run, Pre-War Save"
              placeholderTextColor={themeColors.textMuted}
              accessibilityLabel="Save slot label"
              style={[styles.labelEditorInput, { backgroundColor: themeColors.bgSecondary, borderColor: themeColors.border, color: themeColors.text }]}
              autoFocus
              onSubmitEditing={async () => {
                if (labelEditorSlot == null) return;
                await setSaveLabel(labelEditorText, labelEditorSlot);
                setLabelEditorSlot(null);
                setLabelEditorText("");
              }}
            />
            <View style={styles.labelEditorActions}>
              <Pressable
                onPress={() => { setLabelEditorSlot(null); setLabelEditorText(""); }}
                style={[styles.labelEditorBtn, { borderColor: themeColors.border, backgroundColor: themeColors.bgSecondary }]}
              >
                <Text style={[styles.labelEditorBtnText, { color: themeColors.textSecondary }]}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (labelEditorSlot == null) return;
                  await setSaveLabel(labelEditorText, labelEditorSlot);
                  setLabelEditorSlot(null);
                  setLabelEditorText("");
                }}
                style={[styles.labelEditorBtn, { borderColor: themeColors.accent, backgroundColor: themeColors.accent + "10" }]}
              >
                <Feather name="check" size={12} color={themeColors.accent} />
                <Text style={[styles.labelEditorBtnText, { color: themeColors.accent }]}>SAVE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatusChip({ label, value, color }: { label: string; value: number | string; color?: string }) {
  const { colors: tc } = useTheme();
  const chipStyles = useChipStyles();
  return (
    <View style={[chipStyles.chip, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
      <Text style={[chipStyles.value, { color: color ?? tc.text }]}>
        {typeof value === "number" ? value : value}
      </Text>
      <Text style={[chipStyles.label, { color: tc.textMuted }]}>{label}</Text>
    </View>
  );
}

// Compact per-resume trend rendered directly under the OFFLINE SIM
// DEPTH picker. Each row shows ticksProcessed · est · actual + a "slow"
// tag when the same overshoot rule that drives the home pill warning
// fires for that sample. When a majority of recent samples were slow
// we surface a one-line "Consider lowering depth" suggestion above
// the list so the player has a clear next step. Returns null when
// there are no samples yet so first-time players see nothing extra.
function ResumeTrendList({ samples }: { samples: import("@/engine/types").ResumeSampleRecord[] | undefined }) {
  const { colors: tc } = useTheme();
  if (!samples || samples.length === 0) return null;
  const recent = samples.slice(-5);
  const slowCount = countSlowResumeSamples(recent);
  const suggestLower = shouldSuggestLowerDepth(recent);
  // Newest first so players see the most recent resume at the top.
  const ordered = [...recent].reverse();
  return (
    <View
      testID="resume-trend-list"
      style={[trendStyles.wrap, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
    >
      <Text style={[trendStyles.heading, { color: tc.textMuted }]}>RECENT RESUMES</Text>
      {suggestLower ? (
        <Text
          testID="resume-trend-suggestion"
          style={[trendStyles.suggestion, { color: tc.warning }]}
        >
          Consider lowering depth — {slowCount} of the last {recent.length} resumes ran slow.
        </Text>
      ) : null}
      {ordered.map((s, i) => {
        const slow = isResumeOvershoot(s.actualMs, s.estimatedMs);
        const tone = slow ? tc.warning : tc.textMuted;
        return (
          <Text
            key={`${s.atTick}-${i}`}
            testID={`resume-trend-row-${i}`}
            style={[trendStyles.row, { color: tone }]}
          >
            {`${s.ticksProcessed} ticks · est ${formatCatchupDuration(s.estimatedMs)} · actual ${formatCatchupDuration(s.actualMs)}${slow ? " · slow" : ""}`}
          </Text>
        );
      })}
    </View>
  );
}

function SettingToggle({ label, description, value, onToggle }: { label: string; description: string; value: boolean; onToggle: (v: boolean) => void }) {
  const { colors: tc } = useTheme();
  return (
    <Pressable onPress={() => onToggle(!value)} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} style={[settingStyles.row, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
      <View style={settingStyles.labelWrap}>
        <Text style={[settingStyles.label, { color: tc.text }]}>{label}</Text>
        <Text style={[settingStyles.desc, { color: tc.textMuted }]}>{description}</Text>
      </View>
      <View style={[settingStyles.toggle, { borderColor: value ? tc.accent : tc.border, backgroundColor: value ? tc.accent + "30" : tc.bg }]}>
        <View style={[settingStyles.toggleDot, { backgroundColor: value ? tc.accent : tc.textMuted, alignSelf: value ? "flex-end" : "flex-start" }]} />
      </View>
    </Pressable>
  );
}

const settingStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 8,
  },
  labelWrap: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1,
  },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    padding: 2,
    justifyContent: "center",
  },
  toggleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  optionRow: {
    flexDirection: "row",
    // Wrap so long option sets (7 font sizes) stay tappable on narrow
    // phones instead of squeezing or overflowing off-screen. The width cap
    // keeps the row from starving the label column (mid-word wraps); it
    // only bites on option sets too wide to fit on one line.
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
    maxWidth: "62%",
  },
  optionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 4,
  },
  optionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  optionSubText: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    marginTop: 2,
    opacity: 0.85,
  },
});

const trendStyles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: -4,
    marginBottom: 8,
  },
  heading: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 6,
  },
  suggestion: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    marginBottom: 6,
  },
  row: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
});

const useChipStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  chip: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    alignItems: "center",
    flex: 1,
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  label: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
  },
}));

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },

  groupHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modifiedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  modifiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  modifiedChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  groupResetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  groupResetBtnDisabled: {
    opacity: 0.45,
  },
  groupResetText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },

  navItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    marginBottom: 8,
  },
  navPressed: {
    opacity: 0.7,
  },
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.borderBright,
    alignItems: "center",
    justifyContent: "center",
  },
  navText: {
    flex: 1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navLabel: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.8,
  },
  statusBadge: {
    maxWidth: 130,
    minHeight: 22,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    flexShrink: 1,
  },
  statusBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.65,
  },
  navSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  sysBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    marginBottom: 8,
    backgroundColor: Colors.bgCard,
  },
  sysBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 1,
    flex: 1,
  },
  sysBtnSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  slotPanel: {
    marginBottom: 8,
    gap: 6,
  },
  slotBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    backgroundColor: Colors.bgCard,
  },
  slotCard: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    backgroundColor: Colors.bgCard,
  },
  slotCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slotCardLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 0.3,
    color: Colors.accent,
    marginBottom: 2,
  },
  slotEditMini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
  },
  slotEditMiniText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  labelEditorBox: {
    width: "88%",
    maxWidth: 460,
    alignSelf: "center",
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
    maxHeight: Platform.OS === "web" ? "96%" : undefined,
    overflow: "hidden",
  },
  labelEditorOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: Platform.OS === "web" ? "flex-start" : "center",
    paddingTop: Platform.OS === "web" ? 12 : 0,
    paddingBottom: Platform.OS === "web" ? 12 : 0,
  },
  labelEditorTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  labelEditorHint: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
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
  labelEditorBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 3,
    borderWidth: 1,
  },
  labelEditorBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  slotBtnActive: {
    borderColor: Colors.accent + "60",
    backgroundColor: Colors.accent + "08",
  },
  slotLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1,
    color: Colors.text,
  },
  slotInfo: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  statusGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
}));

export default withScreenBoundary(MoreScreen, "more");

import { Tabs, router } from "expo-router";
import { usePathname } from "expo-router";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, View } from "react-native";

import { playSound } from "@/engine/audio";
import { playHaptic } from "@/engine/haptics";
import ChromeBoundary from "@/components/ChromeBoundary";
import { useNativeExitConfirm } from "@/hooks/useNativeExitConfirm";
import DesktopSidebar from "@/components/DesktopSidebar";
import GameErrorBoundary from "@/components/GameErrorBoundary";
import GameToastContainer from "@/components/GameToast";
import FirstsUnlockToastBridge from "@/components/FirstsUnlockToastBridge";
import HudUnlockToastBridge from "@/components/HudUnlockToastBridge";
import HudCoachTipBridge from "@/components/HudCoachTipBridge";
import TickErrorBadge from "@/components/TickErrorBadge";
import { useKeyboardHelp } from "@/hooks/useKeyboardHelp";
import { useCommandPalette } from "@/hooks/useCommandPalette";

const AchievementReport = React.lazy(() => import("@/components/AchievementReport"));
const KeyboardHelp = React.lazy(() => import("@/components/KeyboardHelp"));
const CommandPalette = React.lazy(() => import("@/components/CommandPalette"));
const WhatsNewModal = React.lazy(() => import("@/components/WhatsNewModal"));
import NewsTicker from "@/components/NewsTicker";
import EndStateModal from "@/components/EndStateModal";
import SaveIndicator from "@/components/SaveIndicator";
import GameModal from "@/components/GameModal";
import { useGameModal } from "@/hooks/useGameModal";
import ResponsiveContainer from "@/components/ResponsiveContainer";
import CommsChatter from "@/components/CommsChatter";
import AmbienceDriver from "@/components/AmbienceDriver";
import ScanlineOverlay from "@/components/ScanlineOverlay";
import ScreenLoader from "@/components/ScreenLoader";
import TopNavBar from "@/components/TopNavBar";
import { USE_NATIVE_DRIVER } from "@/utils/animation";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { useDesktopPolish } from "@/hooks/useDesktopPolish";
import { useSaveTime, useGame } from "@/context/GameContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { HotkeyProvider } from "@/context/HotkeyContext";
import { NewsProvider } from "@/context/NewsContext";
import { ToastProvider } from "@/context/ToastContext";
import { AtlasUnlockProvider } from "@/context/AtlasUnlockContext";
import AtlasUnlockPopup from "@/components/AtlasUnlockPopup";
import { TutorialProvider } from "@/context/TutorialContext";
import { PhotoModeProvider, usePhotoMode } from "@/context/PhotoModeContext";
import PhotoModeOverlay from "@/components/PhotoModeOverlay";

function SaveIndicatorBridge() {
  const lastSaveTime = useSaveTime();
  const { lastSaveError, saveGame, exportFullBackup } = useGame();
  const [showSave, setShowSave] = useState(false);
  const { modal, showModal, hideModal } = useGameModal();

  useEffect(() => {
    if (lastSaveTime > 0) {
      setShowSave(true);
      const t = setTimeout(() => setShowSave(false), 2200);
      return () => clearTimeout(t);
    }
  }, [lastSaveTime]);

  // Auto-dismiss the recovery modal the moment a save succeeds. A
  // successful write clears lastSaveError; if the player left this modal
  // open (e.g. a background autosave recovered after they freed space),
  // the guidance is now stale, so close it.
  useEffect(() => {
    if (!lastSaveError && modal.visible) hideModal();
  }, [lastSaveError, modal.visible, hideModal]);

  const handleExportBackup = useCallback(async () => {
    const out = await exportFullBackup();
    if (!out) {
      showModal(
        "NOTHING TO BACK UP",
        "No save slots contain data yet. Start a run before exporting a backup.",
        [{ text: "OK", onPress: hideModal }],
      );
      return;
    }
    if (Platform.OS === "web" && typeof document !== "undefined") {
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
        showModal(
          "BACKUP DOWNLOADED",
          `Saved ${out.suggestedName} (${out.slotCount} slot${out.slotCount === 1 ? "" : "s"} + settings). Keep this file safe — you can re-import it from the System tab.`,
          [{ text: "OK", onPress: hideModal }],
        );
        return;
      } catch {
        // Fall through to the manual-copy path on the System tab.
      }
    }
    // Native (or web download failure): the full export UI with copy-to-
    // clipboard lives on the System tab under "more".
    hideModal();
    router.push("/(game)/more" as never);
  }, [exportFullBackup, showModal, hideModal]);

  const openRecoveryModal = useCallback(() => {
    if (!lastSaveError) return;
    const isQuota = lastSaveError.kind === "quota";
    const title = isQuota ? "STORAGE FULL" : "SAVE FAILED";
    const message = isQuota
      ? "Your device's storage is full, so your latest progress couldn't be saved. Until you free up space, new progress won't be kept.\n\nTo recover:\n• Export a backup you can re-import later\n• Delete an unused save slot to free space\n• Free up space on your device, then retry"
      : "Something went wrong while writing your save to disk, so your latest progress isn't being stored.\n\nTo recover:\n• Export a backup now so nothing is lost\n• Retry the save\n• If it keeps failing, free up storage or restart the app, then retry";
    showModal(title, message, [
      { text: "EXPORT BACKUP", onPress: handleExportBackup },
      { text: "MANAGE SLOTS", onPress: () => router.push("/?slots=1" as never) },
      { text: "RETRY SAVE", onPress: () => { saveGame(); } },
      { text: "CLOSE", style: "cancel", onPress: hideModal },
    ]);
  }, [lastSaveError, showModal, hideModal, handleExportBackup, saveGame]);

  // Error badge persists until the next successful save clears
  // lastSaveError. Keep the green-success animation key tied to the
  // save timestamp so each successful write re-fires the fade.
  return (
    <>
      <SaveIndicator
        visible={showSave}
        error={lastSaveError}
        onErrorPress={openRecoveryModal}
        key={lastSaveTime}
      />
      <GameModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        buttons={modal.buttons}
        onDismiss={hideModal}
      />
    </>
  );
}

function NewsTickerBridge() {
  const { state } = useGame();
  const headlines = useMemo(() => [
    `TICK ${state.totalTicks.toLocaleString()}`,
    `POPULATION ${Math.round(state.cityStats.population).toLocaleString()}`,
    `CREDITS ${Math.round(state.resources.credits).toLocaleString()}`,
    `ACTIVE INCIDENTS ${(state.activeEvents ?? []).length}`,
    `UNREST ${Math.round(state.cityStats.unrest)}`,
    `CRIME ${Math.round(state.cityStats.crime)}`,
  ], [
    state.activeEvents,
    state.cityStats.crime,
    state.cityStats.population,
    state.cityStats.unrest,
    state.resources.credits,
    state.totalTicks,
  ]);
  const throttledHeadlines = useThrottledValue(headlines, 2000);
  return <NewsTicker headlines={throttledHeadlines} />;
}

// Web-only flavor: per-route cursor variants. No-op on native.
// (Browser tab title is already owned by useDesktopPolish — do not write
// to document.title here, that path is the single source of truth.)
const ROUTE_CURSORS: Record<string, string> = {
  "military": "crosshair",
  "wildlands": "crosshair",
  "scavenging": "crosshair",
  "codex": "help",
  "lore": "help",
  "diplomacy": "help",
  "tips-reviewed": "help",
  "districts": "cell",
  "construction": "cell",
  "expansion": "cell",
  "atlas": "cell",
  "worldmap": "cell",
  "blackmarket": "copy",
  "trade": "copy",
};

function WebFlavorBridge() {
  const pathname = usePathname();

  // Per-route cursor on web. Pulls the route segment from pathname and
  // applies a contextual cursor on document.body. Defaults to "" (browser
  // default) when no override matches; per-element `cursor: "pointer"` on
  // Pressables continues to win over the body default.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const seg = (pathname ?? "").split("/").filter(Boolean).pop() ?? "";
    const cursor = ROUTE_CURSORS[seg] ?? "";
    try {
      document.body.style.cursor = cursor;
    } catch {}
    return () => {
      try {
        document.body.style.cursor = "";
      } catch {}
    };
  }, [pathname]);

  return null;
}

function ScreenFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { reducedMotion } = useSettings();
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      // Centralized "window change" click — fires once per actual route change
      // regardless of how navigation was triggered (top nav, sidebar, hotkey,
      // browser back, deep link). Tapping the same tab again does NOT fire,
      // which is correct behavior.
      playSound("navigate");
      playHaptic("light");
      if (reducedMotion) {
        opacity.setValue(1);
        translateY.setValue(0);
        scale.setValue(1);
        return;
      }
      opacity.setValue(0);
      translateY.setValue(6);
      scale.setValue(0.98);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    }
  }, [pathname, reducedMotion, opacity, translateY, scale]);

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }, { scale }] }}>
      {children}
    </Animated.View>
  );
}

function GameLayoutInner() {
  const { visible, hide } = useKeyboardHelp();
  const { visible: paletteVisible, hide: hidePalette } = useCommandPalette();
  const { colors, isDark } = useTheme();
  const { isWideDesktop } = useResponsiveLayout();
  const pathname = usePathname();
  const isWorldMap = pathname?.endsWith("/worldmap") ?? false;
  const { state, toggleTickPause, saveGame } = useGame();
  const lastSaveTime = useSaveTime();
  const { pauseOnBlur, confirmOnClose, skipIntro } = useSettings();
  const { enabled: photoMode } = usePhotoMode();

  // Defensive onboarding gate. Maps the live walkthrough cursor
  // (state.onboardingStep) to the screen the player should be on, and
  // redirects them there if they wander off (or reload mid-flow). Veteran
  // saves are backfilled to true by migrateState so they bypass entirely.
  // Skipped when the player has opted out via skipIntro, when game state
  // hasn't hydrated, or when already on the expected screen.
  //
  // Mapping:
  //   null / "arrival"  → /(game)/onboarding   (start beat 01)
  //   "build"           → /(game)/construction (banner overlays)
  //   "edict"           → /(game)/law          (banner overlays)
  //   "dispatch"        → /(game)/inbox        (banner overlays)
  //   "summary"         → /(game)/onboarding   (final recap)
  useEffect(() => {
    if (skipIntro) return;
    if (!state?.cityName) return;
    if (state.hasCompletedOnboarding === true) return;
    const step = state.onboardingStep ?? "arrival";
    let expected: string;
    if (step === "build") expected = "/(game)/construction";
    else if (step === "edict") expected = "/(game)/law";
    else if (step === "dispatch") expected = "/(game)/inbox";
    else expected = "/(game)/onboarding";
    const tail = expected.split("/").pop();
    if (tail && pathname?.endsWith("/" + tail)) return;
    router.replace(expected as never);
  }, [
    skipIntro,
    state?.cityName,
    state?.hasCompletedOnboarding,
    state?.onboardingStep,
    pathname,
  ]);

  // Android hardware-back exit confirm. Only intercept on the root in-game
  // route ("/(game)/overview" or whatever the current pathname normalizes to
  // "overview"); on subscreens, BACK should pop the stack as usual.
  const isOverviewRoot = pathname?.endsWith("/overview");
  const handleSaveAndExit = useCallback(async () => {
    await saveGame();
    router.replace("/");
  }, [saveGame]);
  const handleExit = useCallback(() => {
    router.replace("/");
  }, []);
  useNativeExitConfirm({
    // Back-button exit confirm is overview-only; AppState background save
    // should run anywhere in the in-game stack, so the hook itself stays
    // mounted whenever there's a live game session.
    enabled: !!isOverviewRoot,
    onSaveAndExit: handleSaveAndExit,
    onExit: handleExit,
    // Background-save is owned exclusively by GameContext's AppState handler
    // (which routes through the lock-protected saveGame path). Two AppState
    // listeners both calling saveGame on background would race and risk
    // interleaved AsyncStorage writes — disable the duplicate path here.
    enableBackgroundSave: false,
    // Mirror the web beforeunload guard: only prompt when the sim is
    // running (unpaused). When the player has explicitly paused, treat
    // a back-tap as a clean exit so we don't nag them on every accidental
    // press.
    shouldPromptConfirm: () => !(state.tickPaused ?? false),
  });

  useDesktopPolish({
    cityName: state.cityName ?? "",
    pathname,
    tickPaused: state.tickPaused ?? false,
    tickIntervalMinutes: state.tickIntervalMinutes ?? 5,
    lastSaveTime,
    toggleTickPause,
    pauseOnBlurEnabled: pauseOnBlur,
    confirmOnCloseEnabled: confirmOnClose,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {isDark && <ScanlineOverlay />}
      {!photoMode && (
        <ChromeBoundary region="toasts">
          <GameToastContainer />
        </ChromeBoundary>
      )}
      <ChromeBoundary region="firsts unlock toast bridge">
        <FirstsUnlockToastBridge />
      </ChromeBoundary>
      <ChromeBoundary region="hud unlock toast bridge">
        <HudUnlockToastBridge />
      </ChromeBoundary>
      {!photoMode && (
        <ChromeBoundary region="atlas popup">
          <AtlasUnlockPopup />
        </ChromeBoundary>
      )}
      {!photoMode && (
        <ChromeBoundary region="save indicator">
          <SaveIndicatorBridge />
        </ChromeBoundary>
      )}
      {!photoMode && (
        <ChromeBoundary region="tick error badge">
          <TickErrorBadge />
        </ChromeBoundary>
      )}
      {!photoMode && (
        <ChromeBoundary region="top nav">
          <TopNavBar />
        </ChromeBoundary>
      )}
      {!photoMode && (
        <ChromeBoundary region="news ticker">
          <NewsTickerBridge />
          <WebFlavorBridge />
        </ChromeBoundary>
      )}
      <View style={{ flex: 1, flexDirection: isWideDesktop ? "row" : "column" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
        {!photoMode && (
          <ChromeBoundary region="hud coach tip">
            <HudCoachTipBridge />
          </ChromeBoundary>
        )}
        <ScreenFade>
        <ResponsiveContainer fullWidth={isWideDesktop}>
        <View style={{ flex: 1 }}>
          {/* Single boundary wraps <Tabs> so navigator state (lazy screen cache,
              tab focus) survives recoverable errors. Keying by pathname was
              considered but would remount the entire Tabs subtree on every
              navigation. Instead the fallback exposes explicit RETRY (clears
              error state in place) and BACK TO OVERVIEW (clears + navigates)
              actions; the fallback UI covers the screen so no other navigation
              pathway is reachable while in error state. */}
          <GameErrorBoundary
            screenName={pathname?.split("/").filter(Boolean).pop() ?? "game"}
            onReturn={isOverviewRoot ? undefined : () => router.replace("/(game)/overview" as never)}
          >
          <Suspense fallback={<ScreenLoader />}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: "none" },
              lazy: true,
            }}
          >
            <Tabs.Screen name="overview" options={{ href: null }} />
            <Tabs.Screen name="law" options={{ href: null }} />
            <Tabs.Screen name="economy" options={{ href: null }} />
            <Tabs.Screen name="districts" options={{ href: null }} />
            <Tabs.Screen name="construction" options={{ href: null }} />
            <Tabs.Screen name="production-chains" options={{ href: null }} />
            <Tabs.Screen name="diplomacy" options={{ href: null }} />
            <Tabs.Screen name="more" options={{ href: null }} />
            <Tabs.Screen name="character" options={{ href: null }} />
            <Tabs.Screen name="worldmap" options={{ href: null }} />
            <Tabs.Screen name="recruitment" options={{ href: null }} />
            <Tabs.Screen name="contracts" options={{ href: null }} />
            <Tabs.Screen name="companies" options={{ href: null }} />
            <Tabs.Screen name="social" options={{ href: null }} />
            <Tabs.Screen name="factions" options={{ href: null }} />
            <Tabs.Screen name="events" options={{ href: null }} />
            <Tabs.Screen name="military" options={{ href: null }} />
            <Tabs.Screen name="research" options={{ href: null }} />
            <Tabs.Screen name="upgrades" options={{ href: null }} />
            <Tabs.Screen name="officers" options={{ href: null }} />
            <Tabs.Screen name="inbox" options={{ href: null }} />
            <Tabs.Screen name="debug" options={{ href: null }} />
            <Tabs.Screen name="trade" options={{ href: null }} />
            <Tabs.Screen name="blackmarket" options={{ href: null }} />
            <Tabs.Screen name="space" options={{ href: null }} />
            <Tabs.Screen name="cybernetics" options={{ href: null }} />
            <Tabs.Screen name="achievements" options={{ href: null }} />
            <Tabs.Screen name="codex" options={{ href: null }} />
            <Tabs.Screen name="lore" options={{ href: null }} />
            <Tabs.Screen name="atlas" options={{ href: null }} />
            <Tabs.Screen name="prestige" options={{ href: null }} />
            <Tabs.Screen name="megaprojects" options={{ href: null }} />
            <Tabs.Screen name="missions" options={{ href: null }} />
            <Tabs.Screen name="finances" options={{ href: null }} />
            <Tabs.Screen name="administration" options={{ href: null }} />
            <Tabs.Screen name="stats" options={{ href: null }} />
            <Tabs.Screen name="mining" options={{ href: null }} />
            <Tabs.Screen name="scavenging" options={{ href: null }} />
            <Tabs.Screen name="wildlands" options={{ href: null }} />
            <Tabs.Screen name="retinue" options={{ href: null }} />
            <Tabs.Screen name="inventory" options={{ href: null }} />
            <Tabs.Screen name="expansion" options={{ href: null }} />
            <Tabs.Screen name="local-economy" options={{ href: null }} />
            <Tabs.Screen name="journal" options={{ href: null }} />
            <Tabs.Screen name="replay" options={{ href: null }} />
            <Tabs.Screen name="summary" options={{ href: null }} />
            <Tabs.Screen name="goals" options={{ href: null }} />
            <Tabs.Screen name="firsts" options={{ href: null }} />
            <Tabs.Screen name="logbook" options={{ href: null }} />
            <Tabs.Screen name="criminals" options={{ href: null }} />
            <Tabs.Screen name="propaganda" options={{ href: null }} />
            <Tabs.Screen name="tips-reviewed" options={{ href: null }} />
            <Tabs.Screen name="onboarding" options={{ href: null }} />
            <Tabs.Screen name="advisor-briefings" options={{ href: null }} />
          </Tabs>
          </Suspense>
          </GameErrorBoundary>
        </View>
        </ResponsiveContainer>
        </ScreenFade>
        </View>
        {isWideDesktop && !photoMode && !isWorldMap && (
          <ChromeBoundary region="sidebar">
            <DesktopSidebar />
          </ChromeBoundary>
        )}
      </View>
      {!photoMode && (
        <ChromeBoundary region="ambience driver">
          <AmbienceDriver />
        </ChromeBoundary>
      )}
      {!isWideDesktop && !photoMode && !isWorldMap && (
        <ChromeBoundary region="comms chatter">
          <CommsChatter compact />
        </ChromeBoundary>
      )}
      {!photoMode && (
        <ChromeBoundary region="achievement report">
          <Suspense fallback={null}>
            <AchievementReport />
          </Suspense>
        </ChromeBoundary>
      )}
      {!photoMode && (
        <ChromeBoundary region="keyboard help">
          <Suspense fallback={null}>
            <KeyboardHelp visible={visible} onClose={hide} />
          </Suspense>
        </ChromeBoundary>
      )}
      {!photoMode && (
        <ChromeBoundary region="command palette">
          <Suspense fallback={null}>
            <CommandPalette visible={paletteVisible} onClose={hidePalette} />
          </Suspense>
        </ChromeBoundary>
      )}
      {!photoMode && (
        <ChromeBoundary region="whats new">
          <Suspense fallback={null}>
            <WhatsNewModal />
          </Suspense>
        </ChromeBoundary>
      )}
      <ChromeBoundary region="end state">
        <EndStateModal />
      </ChromeBoundary>
      <PhotoModeOverlay />
    </View>
  );
}

export default function GameLayout() {
  return (
    <TutorialProvider>
      <NewsProvider>
        <ToastProvider>
          <AtlasUnlockProvider>
            <PhotoModeProvider>
              <HotkeyProvider>
                <GameLayoutInner />
              </HotkeyProvider>
            </PhotoModeProvider>
          </AtlasUnlockProvider>
        </ToastProvider>
      </NewsProvider>
    </TutorialProvider>
  );
}

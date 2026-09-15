import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import BootTimeoutNotice from "@/components/BootTimeoutNotice";
import { CRTOverlay } from "@/components/CRTOverlay";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LoadingScreen from "@/components/LoadingScreen";
import TickProfilerOverlay from "@/components/TickProfilerOverlay";
import ReleaseIntegrityWarning from "@/components/ReleaseIntegrityWarning";
import { GameProvider, useGameActions, useGameState } from "@/context/GameContext";
import type { BootHydrationStatus } from "@/engine/startupHydration";
import { SettingsProvider, useSettings, normalizeUiScale } from "@/context/SettingsContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { applyUiScale } from "@/utils/desktopShell";
import { initReleaseIntegrity } from "@/engine/releaseIntegrity";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} backgroundColor={colors.bg} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(game)" />
      </Stack>
    </>
  );
}

// Applies the persisted whole-interface UI scale (Task #532) on web/desktop.
// Renders nothing and its tree position never varies with settings, so it can
// safely live above the navigators (see the navigator-remount gotcha: wrappers
// must keep identical tree shape across setting changes). On native this is a
// no-op inside applyUiScale.
function UiScaleApplier() {
  const { uiScale } = useSettings();
  useEffect(() => {
    applyUiScale(normalizeUiScale(uiScale));
  }, [uiScale]);
  return null;
}

// Bridges the GameProvider's hydration signal (saved game read from storage)
// up to RootLayout so the LoadingScreen can treat it as a real boot milestone.
// Renders nothing; lives inside the provider purely to read context.
function HydrationReporter({
  onHydrated,
}: {
  onHydrated: (status: BootHydrationStatus) => void;
}) {
  const { isLoaded, bootHydrationStatus } = useGameState();
  useEffect(() => {
    if (isLoaded) onHydrated(bootHydrationStatus);
  }, [isLoaded, bootHydrationStatus, onHydrated]);
  return null;
}

function BootRecoveryNotice({ reason }: { reason: "timeout" | "error" }) {
  const { retryStartupHydration } = useGameActions();
  return <BootTimeoutNotice reason={reason} onRetry={retryStartupHydration} />;
}

export default function RootLayout() {
  // In the exported web build (Electron/Steam) fonts are inlined as data-URI
  // @font-face rules in index.html by steam/scripts/inline-fonts.mjs. expo-font's
  // web loader registers fonts via the FontFace API, whose .ttf fetch fails under
  // Electron's custom app:// scheme — icon glyphs (Feather / MaterialCommunityIcons,
  // which have no system fallback) then render blank. Skipping the loader in
  // production web lets the inlined fonts be authoritative. Dev web and native
  // load fonts normally.
  const skipExpoFontLoader = Platform.OS === "web" && !__DEV__;
  const [fontsLoaded, fontError] = useFonts(
    skipExpoFontLoader
      ? {}
      : {
          Inter_400Regular,
          Inter_500Medium,
          Inter_600SemiBold,
          Inter_700Bold,
          ...Feather.font,
          ...MaterialCommunityIcons.font,
        },
  );

  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontTimeout(true), Platform.OS === "web" ? 3000 : 8000);
    return () => clearTimeout(timer);
  }, []);

  // The GameProvider now mounts *underneath* the LoadingScreen overlay, so
  // its hydration (saved game read from AsyncStorage) is a genuine boot
  // milestone the splash can wait on and reflect, rather than work that only
  // begins once the splash has already been dismissed on a fixed timer.
  const [gameHydrated, setGameHydrated] = useState(false);
  // Mirror the hydration milestone into a ref so the safety-cap timer can read
  // its value at the moment it fires without re-subscribing to state changes.
  // Set synchronously inside the handler (not via a follow-up effect) so there's
  // no window where the timer fires after hydration but before the ref updates.
  const gameHydratedRef = useRef(false);
  const [bootIncomplete, setBootIncomplete] = useState(false);
  const [bootFailureReason, setBootFailureReason] = useState<"timeout" | "error">("timeout");
  const handleHydrated = useCallback((status: BootHydrationStatus) => {
    // The first terminal result owns the boot handoff. If the root safety cap
    // already opened the menu, a stale provider callback cannot clear the
    // warning or re-block the overlay.
    if (gameHydratedRef.current) {
      // A successful in-place retry arrives after the original safety cap has
      // already handed control to the menu. Clear only the recovery notice;
      // the menu and its navigator never need to remount.
      if (status === "ready") {
        setBootIncomplete(false);
      } else if (status !== "pending") {
        setBootIncomplete(true);
        setBootFailureReason(status === "failed" ? "error" : "timeout");
      }
      return;
    }
    gameHydratedRef.current = true;
    setGameHydrated(true);
    if (status !== "ready") {
      setBootIncomplete(true);
      setBootFailureReason(status === "failed" ? "error" : "timeout");
    }
  }, []);

  // Minimum display time for the animated LoadingScreen so it never
  // flashes-and-vanishes jarringly on a warm launch. Kept deliberately short
  // (1200ms — enough for the fade-in plus a little radar motion) so that once
  // the real milestones below are met the splash dismisses promptly instead of
  // sitting on a fixed 2.8s timer.
  //
  // Bypassed entirely (dev only) when "?demo=1" is in the URL so the
  // headless screenshot tool doesn't wait through the splash before
  // the seeder in app/index.tsx can mount and route into the game.
  const skipMinDisplay =
    __DEV__ &&
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "1";
  const [minDisplayElapsed, setMinDisplayElapsed] = useState(skipMinDisplay);
  useEffect(() => {
    if (skipMinDisplay) return;
    const timer = setTimeout(() => setMinDisplayElapsed(true), 1200);
    return () => clearTimeout(timer);
  }, [skipMinDisplay]);

  // Hard safety cap: if some milestone never resolves (e.g. an unexpected
  // hydration hang), force the splash to dismiss anyway so the app is never
  // stuck on the loading screen.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (gameHydratedRef.current) return;
      gameHydratedRef.current = true;
      setGameHydrated(true);
      setBootIncomplete(true);
      setBootFailureReason("timeout");
    }, Platform.OS === "web" ? 10000 : 15000);
    return () => clearTimeout(timer);
  }, []);

  const fontsReady = fontsLoaded || fontError || fontTimeout;

  // Real readiness signals → 0..1 progress for the splash bar. Fonts and the
  // saved-game hydration are weighted equally; the bar advances as each lands.
  const progress = ((fontsReady ? 1 : 0) + (gameHydrated ? 1 : 0)) / 2;
  let bootLabel = "INITIALIZING";
  if (!fontsReady) bootLabel = "LOADING ASSETS";
  else if (!gameHydrated) bootLabel = "LOADING SECTOR";
  else bootLabel = "READY";

  // When the demo seeder is active, skip the LoadingScreen wait entirely
  // (including the fonts-ready check) so MainMenu mounts immediately and
  // the seeder's effect can fire. Fonts may render with system fallbacks
  // for the first frame; that's fine for headless screenshot capture.
  const ready = skipMinDisplay
    ? true
    : fontsReady && gameHydrated && minDisplayElapsed;

  // Hide the native splash as soon as JS has evaluated — do NOT wait on
  // fonts. On Android, font loading (Inter + Feather + MaterialCommunityIcons)
  // can take 5–10s on a cold start, and the native splash is a static image
  // with no progress feedback. Hiding it immediately hands control to the
  // animated LoadingScreen below, so the player always sees the app booting
  // (the radar sweep / "LOADING" readout) instead of a frozen logo.
  // The native splash background (#0A0F0A in app.json) matches Colors.bg,
  // so the visual handoff is seamless.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Fetch the cached desktop verifier result during root startup. Expo/dev
  // builds have no bridge and remain explicitly trusted by default.
  useEffect(() => {
    initReleaseIntegrity().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SettingsProvider>
              <ThemeProvider>
                <GameProvider>
                    <UiScaleApplier />
                    <HydrationReporter onHydrated={handleHydrated} />
                    <RootLayoutNav />
                    <CRTOverlay />
                    <TickProfilerOverlay />
                    {!ready && (
                      <View style={StyleSheet.absoluteFill}>
                        <LoadingScreen progress={progress} label={bootLabel} />
                      </View>
                    )}
                    {ready && bootIncomplete && <BootRecoveryNotice reason={bootFailureReason} />}
                    <ReleaseIntegrityWarning />
                </GameProvider>
              </ThemeProvider>
            </SettingsProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

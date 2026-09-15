import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { useSettings } from "@/context/SettingsContext";
import { useGameStateSelector } from "@/context/GameContext";
import { ROUTE_FEATURE, unlockedHudFeaturesCsv, introLockLifted } from "@/engine/hudUnlocks";
import {
  CORE_TAB_DEFS,
  MORE_TAB_DEF,
  EXTENDED_TAB_DEFS,
  computeVisibleTabs,
  NAV_TAB_LABEL_SIZE,
  NAV_TAB_MIN_WIDTH,
  NAV_TAB_PADDING_HORIZONTAL,
  NAV_TAB_PADDING_VERTICAL,
  NAV_TAB_PADDING_VERTICAL_COMPACT,
  type TabDef,
} from "@/components/topNavTabs";
import { useHover, cursorPointer } from "@/hooks/useMouse";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { openKeyboardHelp } from "@/hooks/useKeyboardHelp";
import { openCommandPalette } from "@/hooks/useCommandPalette";
import { useHotkeys } from "@/context/HotkeyContext";
import { playSound } from "@/engine/audio";
import { playHaptic } from "@/engine/haptics";
import CommandStatusStrip from "@/components/CommandStatusStrip";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

const isWeb = Platform.OS === "web";

// Core tabs plus MORE, in render order — the base set the unlock filter runs
// over. Extended (promoted) tabs are added separately based on available width.
const BASE_TAB_DEFS: TabDef[] = [...CORE_TAB_DEFS, MORE_TAB_DEF];

// Fast membership test for "is this route a promoted/extended tab?" — used to
// pull the currently-visible extended routes out of the rendered set so the
// Shift+1..9 hotkeys only fire for tabs on screen.
const EXTENDED_ROUTES = new Set(EXTENDED_TAB_DEFS.map((d) => d.route));

function TabIcon({ def, active }: { def: TabDef; active: boolean }) {
  const { colors } = useTheme();
  const color = active ? colors.accent : colors.textMuted;
  if (def.iconSet === "feather") {
    return <Feather name={def.iconName as any} size={20} color={color} />;
  }
  return <MaterialCommunityIcons name={def.iconName as any} size={20} color={color} />;
}

function NavTab({ def, isActive, showHotkey }: { def: TabDef; isActive: boolean; showHotkey: boolean }) {
  const router = useRouter();
  const { hovered, handlers } = useHover();
  const { colors } = useTheme();

  return (
    <Pressable
      testID={`top-nav-${def.route.split("/").pop()}`}
      style={[
        styles.tab,
        cursorPointer,
        isActive && { borderBottomWidth: 2, borderBottomColor: colors.accent },
        !isActive && hovered && { backgroundColor: colors.bgElevated },
      ]}
      onPress={() => { router.replace(def.route as any); /* "navigate" click fires from the layout's pathname effect to avoid double-trigger */ }}
      {...handlers}
    >
      <TabIcon def={def} active={isActive} />
      <Text style={[
        styles.label,
        { color: isActive ? colors.accent : colors.textMuted },
        !isActive && hovered && { color: colors.text },
      ]}>
        {def.label}
      </Text>
      {showHotkey && def.hotkey ? (
        <Text style={[styles.hotkey, { color: colors.textMuted }]}>{def.hotkey}</Text>
      ) : null}
    </Pressable>
  );
}

function HelpButton() {
  const { colors } = useTheme();
  const { hovered, handlers } = useHover();
  return (
    <Pressable
      accessibilityLabel="Show keyboard shortcuts"
      onPress={() => { playSound("navigate"); playHaptic("light"); openKeyboardHelp(); }}
      style={[
        styles.helpBtn,
        cursorPointer,
        { borderColor: colors.accent + "33" },
        hovered && { backgroundColor: colors.bgElevated, borderColor: colors.accent + "88" },
      ]}
      {...handlers}
    >
      <Text style={[styles.helpGlyph, { color: hovered ? colors.accent : colors.textMuted }]}>?</Text>
    </Pressable>
  );
}

function PaletteButton() {
  const { colors } = useTheme();
  const { hovered, handlers } = useHover();
  return (
    <Pressable
      testID="command-palette-trigger"
      accessibilityRole="button"
      accessibilityLabel="Open command palette"
      onPress={() => { playSound("navigate"); playHaptic("light"); openCommandPalette(); }}
      style={[
        styles.paletteBtn,
        cursorPointer,
        { borderColor: colors.accent + "55", backgroundColor: colors.accent + "0D" },
        hovered && { backgroundColor: colors.accent + "18", borderColor: colors.accent },
      ]}
      {...handlers}
    >
      <Feather name="search" size={14} color={hovered ? colors.accent : colors.textSecondary} />
      <Text style={[styles.paletteLabel, { color: hovered ? colors.accent : colors.textSecondary }]}>JUMP</Text>
      {isWeb && <Text style={[styles.paletteKey, { color: colors.textMuted }]}>⌘K</Text>}
    </Pressable>
  );
}

export default function TopNavBar() {
  const pathname = usePathname();
  const { colors } = useTheme();
  const { showHotkeys } = useSettings();
  const showHotkey = isWeb && showHotkeys;
  const unlockedCsv = useGameStateSelector(unlockedHudFeaturesCsv);
  const introOff = useGameStateSelector(introLockLifted);
  const { isWideDesktop } = useResponsiveLayout();
  const [barWidth, setBarWidth] = useState(0);
  const { setVisibleExtendedRoutes } = useHotkeys();
  const wheelScrollRef = useHorizontalWheelScroll();

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setBarWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
  };

  const visibleDefs = useMemo(() => {
    const unlocked = new Set(unlockedCsv.split(",").filter(Boolean));
    const baseDefs = BASE_TAB_DEFS.filter((def) => {
      const fid = ROUTE_FEATURE[def.route];
      return !fid || unlocked.has(fid);
    });
    return computeVisibleTabs({
      containerWidth: barWidth,
      baseDefs,
      extendedDefs: introOff ? EXTENDED_TAB_DEFS : [],
      showHelp: isWeb,
    });
  }, [unlockedCsv, introOff, barWidth]);

  // Keep the hotkey layer in sync with what's actually on screen: report the
  // promoted tabs that made the width cut, in their fixed EXTENDED_TAB_DEFS
  // order, so Shift+1..9 only fire for visible tabs.
  useEffect(() => {
    const unlocked = new Set(unlockedCsv.split(",").filter(Boolean));
    const visibleExtended = isWideDesktop && introOff
      ? EXTENDED_TAB_DEFS
          .filter((def) => {
            const feature = ROUTE_FEATURE[def.route];
            return !feature || unlocked.has(feature);
          })
          .map((def) => def.route)
      : visibleDefs
          .filter((d) => EXTENDED_ROUTES.has(d.route))
          .map((d) => d.route);
    setVisibleExtendedRoutes(visibleExtended);
  }, [visibleDefs, unlockedCsv, introOff, isWideDesktop, setVisibleExtendedRoutes]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderBright }]}
      onLayout={onLayout}
    >
      <CommandStatusStrip desktopCompact={isWideDesktop} />
      {!isWideDesktop && <View style={styles.navRow}>
        <ScrollView
          ref={wheelScrollRef}
          horizontal
          style={styles.tabScroll}
          showsHorizontalScrollIndicator={Platform.OS === "web"}
          contentContainerStyle={styles.scroll}
        >
          {visibleDefs.map((def) => {
            const isActive = pathname === def.route || pathname === def.route.replace("/(game)", "");
            return <NavTab key={def.route} def={def} isActive={isActive} showHotkey={showHotkey} />;
          })}
        </ScrollView>
        <PaletteButton />
        {isWeb && <HelpButton />}
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    // Browser text enlargement can scale the command/status chrome beyond a
    // phone viewport. The tab strip owns its horizontal scrolling; the outer
    // shell must clip that chrome so it cannot widen the whole game page.
    overflow: "hidden",
    paddingTop: Platform.OS === "ios" ? 50 : Platform.OS === "android" ? 36 : 0,
  },
  scroll: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tabScroll: {
    flex: 1,
    flexGrow: 1,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: isWeb ? NAV_TAB_PADDING_VERTICAL_COMPACT : NAV_TAB_PADDING_VERTICAL,
    paddingHorizontal: NAV_TAB_PADDING_HORIZONTAL,
    minWidth: NAV_TAB_MIN_WIDTH,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: NAV_TAB_LABEL_SIZE,
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: "uppercase",
  },
  hotkey: {
    position: "absolute",
    top: 2,
    right: 2,
    fontFamily: "Inter_400Regular",
    fontSize: 7,
    opacity: 0.5,
  },
  helpBtn: {
    width: 28,
    height: 28,
    marginLeft: 6,
    marginRight: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
  },
  helpGlyph: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 14,
  },
  paletteBtn: {
    minWidth: Platform.OS === "web" ? 72 : 54,
    height: 34,
    marginHorizontal: 4,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  paletteLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.7,
  },
  paletteKey: {
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 0.3,
  },
});

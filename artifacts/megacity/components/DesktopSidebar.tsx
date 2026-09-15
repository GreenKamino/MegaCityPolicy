import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import CommsChatter from "@/components/CommsChatter";
import { useTheme } from "@/context/ThemeContext";
import { useGameStateSelector } from "@/context/GameContext";
import { ROUTE_FEATURE, unlockedHudFeaturesCsv, introLockLifted } from "@/engine/hudUnlocks";
import { CORE_TAB_DEFS, EXTENDED_TAB_DEFS, MORE_TAB_DEF } from "@/components/topNavTabs";
import {
  DESKTOP_COMMAND_BUTTON_SIZE,
  DESKTOP_COMMAND_PANE_WIDTH,
} from "@/components/desktopCommandLayout";
import { openKeyboardHelp } from "@/hooks/useKeyboardHelp";
import { openCommandPalette } from "@/hooks/useCommandPalette";
import { playSound } from "@/engine/audio";
import { playHaptic } from "@/engine/haptics";

const SIDEBAR_WIDTH = DESKTOP_COMMAND_PANE_WIDTH;

export default function DesktopSidebar() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const unlockedCsv = useGameStateSelector(unlockedHudFeaturesCsv);
  const introOff = useGameStateSelector(introLockLifted);
  const [inspectedRoute, setInspectedRoute] = useState<string | null>(null);
  const navDefs = useMemo(() => {
    const unlocked = new Set(unlockedCsv.split(",").filter(Boolean));
    const extended = introOff
      ? EXTENDED_TAB_DEFS.filter((def) => {
          const feature = ROUTE_FEATURE[def.route];
          return !feature || unlocked.has(feature);
        })
      : [];
    return [...CORE_TAB_DEFS, ...extended, ...(introOff ? [MORE_TAB_DEF] : [])];
  }, [introOff, unlockedCsv]);
  const inspected = navDefs.find((def) => def.route === inspectedRoute);

  return (
    <View
      style={[
        styles.sidebar,
        {
          width: SIDEBAR_WIDTH,
          borderLeftColor: colors.accent + "22",
          backgroundColor: colors.bg,
        },
      ]}
    >
      <View style={[styles.navSection, { borderBottomColor: colors.accent + "18" }]}>
        <View style={styles.navHeadingRow}>
          <Text style={[styles.sectionLabel, { color: colors.accent }]}>COMMAND WINDOWS</Text>
          <View style={styles.headingActions}>
            <Text style={[styles.windowCount, { color: colors.textMuted }]}>{navDefs.length}</Text>
            <Pressable
              testID="desktop-command-palette-trigger"
              accessibilityRole="button"
              accessibilityLabel="Open command palette"
              onPress={() => {
                playSound("navigate");
                playHaptic("light");
                openCommandPalette();
              }}
              style={({ pressed }) => [
                styles.headingButton,
                { borderColor: colors.border, backgroundColor: pressed ? colors.bgElevated : colors.bgSecondary },
              ]}
            >
              <Feather name="search" size={12} color={colors.textMuted} />
            </Pressable>
            <Pressable
              testID="desktop-keyboard-help-trigger"
              accessibilityRole="button"
              accessibilityLabel="Show keyboard shortcuts"
              onPress={() => {
                playSound("navigate");
                playHaptic("light");
                openKeyboardHelp();
              }}
              style={({ pressed }) => [
                styles.headingButton,
                { borderColor: colors.border, backgroundColor: pressed ? colors.bgElevated : colors.bgSecondary },
              ]}
            >
              <Feather name="help-circle" size={12} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
        <View
          testID="desktop-command-grid"
          accessibilityLabel={`${navDefs.length} unlocked command windows`}
          style={styles.navGrid}
        >
          {navDefs.map((def) => {
            const active = pathname === def.route || pathname === def.route.replace("/(game)", "");
            return (
              <Pressable
                key={def.route}
                testID={`desktop-command-${def.route.split("/").pop()}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${def.label}. ${def.description}`}
                onPress={() => router.replace(def.route as any)}
                onHoverIn={() => setInspectedRoute(def.route)}
                onHoverOut={() => setInspectedRoute((current) => current === def.route ? null : current)}
                onFocus={() => setInspectedRoute(def.route)}
                onBlur={() => setInspectedRoute((current) => current === def.route ? null : current)}
                style={[
                  styles.commandButton,
                  { borderColor: colors.border, backgroundColor: active ? colors.accent + "16" : colors.bgSecondary },
                  active && { borderColor: colors.accent, backgroundColor: colors.accent + "22" },
                ]}
              >
                {def.iconSet === "feather" ? (
                  <Feather name={def.iconName as any} size={17} color={active ? colors.accent : colors.textMuted} />
                ) : (
                  <MaterialCommunityIcons name={def.iconName as any} size={17} color={active ? colors.accent : colors.textMuted} />
                )}
                <Text
                  aria-hidden
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.visuallyHiddenLabel}
                >
                  {def.label}
                </Text>
                <Text style={[styles.navKey, { color: active ? colors.accent : colors.text + "45" }]}>{def.hotkey}</Text>
              </Pressable>
            );
          })}
        </View>
        <View
          testID="desktop-command-tooltip"
          accessibilityLiveRegion="polite"
          style={[styles.inspectPanel, { borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
        >
          <Text style={[styles.inspectTitle, { color: inspected ? colors.accent : colors.textMuted }]}>
            {inspected?.label ?? "HOVER OR FOCUS A COMMAND"}
          </Text>
          <Text style={[styles.inspectBody, { color: colors.textMuted }]} numberOfLines={1}>
            {inspected?.description ?? "All unlocked destinations fit in this pane."}
          </Text>
        </View>
      </View>
      <View style={[styles.section, { borderBottomColor: colors.accent + "12" }]}>
        <Text style={[styles.sectionLabel, { color: colors.accent + "80" }]}>
          ▮ COMMS · CHATTER
        </Text>
        <Text style={[styles.sectionHint, { color: colors.text + "55" }]}>
          Live dispatch + faction intercept feed
        </Text>
      </View>
      <View style={styles.commsArea}>
        <CommsChatter />
      </View>
    </View>
  );
}

export { SIDEBAR_WIDTH };

const styles = StyleSheet.create({
  sidebar: {
    flexDirection: "column",
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  section: {
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navSection: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 3,
    marginBottom: 5,
  },
  headingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headingButton: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 3,
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  commandButton: {
    width: DESKTOP_COMMAND_BUTTON_SIZE,
    height: DESKTOP_COMMAND_BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 3,
    position: "relative",
  },
  navKey: {
    position: "absolute",
    right: 2,
    bottom: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 6.5,
    letterSpacing: 0.2,
  },
  visuallyHiddenLabel: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  windowCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
  },
  inspectPanel: {
    minHeight: 36,
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 3,
    justifyContent: "center",
  },
  inspectTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.7,
  },
  inspectBody: {
    marginTop: 2,
    fontFamily: "Inter_400Regular",
    fontSize: 7.5,
    letterSpacing: 0.2,
  },
  sectionLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 1.35,
    textTransform: "uppercase",
  },
  sectionHint: {
    marginTop: 2,
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    letterSpacing: 0.65,
    textTransform: "uppercase",
  },
  commsArea: {
    flex: 1,
    paddingTop: 3,
    overflow: "hidden",
  },
});

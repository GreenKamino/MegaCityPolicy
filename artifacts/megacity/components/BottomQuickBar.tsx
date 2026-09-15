import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { useSettings } from "@/context/SettingsContext";
import { useGameStateSelector } from "@/context/GameContext";
import { ROUTE_FEATURE, introLockLifted, unlockedHudFeaturesCsv } from "@/engine/hudUnlocks";
import { getCommandMenuBadgeCount } from "@/engine/commandMenuStatus";
import { useHover, cursorPointer } from "@/hooks/useMouse";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  BOTTOM_TAB_DEFS,
  NAV_TAB_LABEL_SIZE,
  NAV_TAB_MIN_WIDTH,
  NAV_TAB_PADDING_HORIZONTAL,
  NAV_TAB_PADDING_VERTICAL,
  NAV_TAB_PADDING_VERTICAL_COMPACT,
  type TabDef,
} from "@/components/topNavTabs";

const isWeb = Platform.OS === "web";

type QuickDef = TabDef;

function QuickIcon({ def, active }: { def: QuickDef; active: boolean }) {
  const { colors } = useTheme();
  const color = active ? colors.accent : colors.textMuted;
  if (def.iconSet === "feather") {
    return <Feather name={def.iconName as any} size={20} color={color} />;
  }
  return <MaterialCommunityIcons name={def.iconName as any} size={20} color={color} />;
}

function QuickTab({ def, isActive, showHotkey, badge }: { def: QuickDef; isActive: boolean; showHotkey: boolean; badge?: number }) {
  const router = useRouter();
  const { hovered, handlers } = useHover();
  const { colors } = useTheme();

  return (
    <Pressable
      testID={`bottom-nav-${def.route.split("/").pop()}`}
      accessibilityRole="button"
      accessibilityLabel={`${def.label}${badge ? `, ${badge} pending` : ""}`}
      style={[
        styles.tab,
        cursorPointer,
        isActive && { borderTopWidth: 2, borderTopColor: colors.accent },
        !isActive && hovered && { backgroundColor: colors.bgElevated },
      ]}
      onPress={() => router.replace(def.route as any)}
      {...handlers}
    >
      <QuickIcon def={def} active={isActive} />
      <Text style={[
        styles.label,
        { color: isActive ? colors.accent : colors.textMuted },
        !isActive && hovered && { color: colors.text },
      ]}>
        {def.label}
      </Text>
      {showHotkey && def.bottomHotkey && (
        <Text style={[styles.hotkey, { color: colors.textMuted }]}>{def.bottomHotkey}</Text>
      )}
      {badge !== undefined && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.danger }]}>
          <Text style={[styles.badgeText, { color: colors.bg }]}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function BottomQuickBar() {
  const pathname = usePathname();
  const { colors } = useTheme();
  const { showHotkeys } = useSettings();
  const showHotkey = isWeb && showHotkeys;
  const unlockedCsv = useGameStateSelector(unlockedHudFeaturesCsv);
  const introOff = useGameStateSelector(introLockLifted);
  const wheelScrollRef = useHorizontalWheelScroll();
  const unreadMessages = useGameStateSelector((state) => getCommandMenuBadgeCount(state, "/(game)/inbox") ?? 0);
  const activeEvents = useGameStateSelector((state) => getCommandMenuBadgeCount(state, "/(game)/events") ?? 0);
  const activeMissions = useGameStateSelector((state) => getCommandMenuBadgeCount(state, "/(game)/missions") ?? 0);
  const officerVacancies = useGameStateSelector((state) => getCommandMenuBadgeCount(state, "/(game)/officers") ?? 0);
  const badges: Record<string, number | undefined> = {
    "/(game)/inbox": unreadMessages,
    "/(game)/events": activeEvents,
    "/(game)/missions": activeMissions,
    "/(game)/officers": officerVacancies,
  };
  const visibleDefs = useMemo(() => {
    const unlocked = new Set(unlockedCsv.split(",").filter(Boolean));
    return BOTTOM_TAB_DEFS.filter((def) => {
      // Routes promoted from More should not bypass the gentle first-run
      // reveal merely because they have no dedicated HUD feature flag.
      if (!def.bottomHotkey && !introOff) return false;
      const fid = ROUTE_FEATURE[def.route];
      return !fid || unlocked.has(fid);
    });
  }, [unlockedCsv, introOff]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgSecondary, borderTopColor: colors.borderBright }]}>
      <ScrollView
        ref={wheelScrollRef}
        horizontal
        style={styles.scrollView}
        showsHorizontalScrollIndicator={Platform.OS === "web"}
        contentContainerStyle={styles.scroll}
      >
        {visibleDefs.map((def) => {
          const isActive = pathname === def.route || pathname === def.route.replace("/(game)", "");
          return <QuickTab key={def.route} def={def} isActive={isActive} showHotkey={showHotkey} badge={badges[def.route as keyof typeof badges]} />;
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
  },
  scrollView: {
    flexGrow: 0,
  },
  scroll: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
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
  badge: {
    position: "absolute",
    top: 2,
    left: 4,
    minWidth: 13,
    height: 13,
    paddingHorizontal: 3,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    lineHeight: 9,
  },
});

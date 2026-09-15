import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useHover, cursorPointer } from "@/hooks/useMouse";
import { useHotkeys } from "@/context/HotkeyContext";
import { playSound } from "@/engine/audio";
import { playHaptic } from "@/engine/haptics";
import { ACTIVE_GAME_DENSITY } from "@/components/gameDensity";

export type GameTab = {
  key: string;
  label: string;
  icon?: string;
};

type Props = {
  tabs: GameTab[];
  active: string;
  onSelect: (key: string) => void;
  accentColor?: string;
};

function Tab({ tab, isActive, tint, onSelect }: { tab: GameTab; isActive: boolean; tint: string; onSelect: (key: string) => void }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const { hovered, handlers } = useHover();

  return (
    <Pressable
      onPress={() => { playSound("navigate"); playHaptic("light"); onSelect(tab.key); }}
      {...handlers}
      style={[
        styles.tab,
        cursorPointer,
        isActive && [styles.tabActive, { borderBottomColor: tint }],
        !isActive && hovered && { backgroundColor: Colors.bgElevated, borderBottomColor: Colors.borderBright, borderBottomWidth: 2 },
      ]}
    >
      {tab.icon && (
        <Feather
          name={tab.icon as any}
          size={10}
          color={isActive ? tint : hovered ? Colors.text : Colors.textMuted}
        />
      )}
      <Text style={[styles.tabText, isActive && { color: tint }, !isActive && hovered && { color: Colors.text }]}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

export default function GameTabBar({ tabs, active, onSelect, accentColor }: Props) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const tint = accentColor ?? Colors.accent;
  const { registerSubTabs, unregisterSubTabs } = useHotkeys();

  useEffect(() => {
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((t) => t.key === active);
    registerSubTabs({
      prev: () => {
        const prev = idx > 0 ? idx - 1 : tabs.length - 1;
        onSelect(tabs[prev].key);
      },
      next: () => {
        const next = idx < tabs.length - 1 ? idx + 1 : 0;
        onSelect(tabs[next].key);
      },
    });
    return () => unregisterSubTabs();
  }, [tabs, active, onSelect, registerSubTabs, unregisterSubTabs]);

  return (
    <View style={styles.bar}>
      {tabs.map((t) => (
        <Tab key={t.key} tab={t} isActive={active === t.key} tint={tint} onSelect={onSelect} />
      ))}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: ACTIVE_GAME_DENSITY.tabVertical,
    minHeight: Platform.OS === "web" ? 32 : 44,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: Platform.OS === "web" ? 11 : 12,
    letterSpacing: 1,
  },
}));

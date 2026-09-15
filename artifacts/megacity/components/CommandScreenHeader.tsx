import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useGameStateSelector } from "@/context/GameContext";
import { useTheme } from "@/context/ThemeContext";
import { ACTIVE_GAME_DENSITY } from "@/components/gameDensity";

type Props = {
  title: string;
  subtitle?: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  rightContent?: React.ReactNode;
};

export default function CommandScreenHeader({ title, subtitle, icon, rightContent }: Props) {
  const { colors: c } = useTheme();
  const tick = useGameStateSelector((state) => state.totalTicks ?? 0);
  return (
    <View style={[styles.header, { backgroundColor: c.bgSecondary, borderBottomColor: c.border }]}>
      <View style={[styles.iconFrame, { borderColor: c.accent + "66", backgroundColor: c.accent + "12" }]}>
        <Feather name={icon} size={16} color={c.accent} />
      </View>
      <View style={styles.titleBlock}>
        <Text style={[styles.eyebrow, { color: c.textMuted }]}>SECTOR COMMAND / LIVE WINDOW</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: c.accent }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { color: c.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.right}>
        {rightContent}
        <Text style={[styles.tick, { color: c.textMuted }]}>T{String(tick).padStart(4, "0")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: Platform.OS === "web" ? 40 : 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: Platform.OS === "web" ? ACTIVE_GAME_DENSITY.screenGutter : 14,
    paddingVertical: ACTIVE_GAME_DENSITY.headerVertical,
    borderBottomWidth: 1,
  },
  iconFrame: {
    width: Platform.OS === "web" ? 26 : 29,
    height: Platform.OS === "web" ? 26 : 29,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 3,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 1.1,
    lineHeight: 9,
  },
  title: {
    marginTop: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 1.15,
  },
  subtitle: {
    marginTop: Platform.OS === "web" ? 1 : 2,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 0.35,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tick: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
});
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { ACTIVE_GAME_DENSITY } from "@/components/gameDensity";

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  rightContent?: React.ReactNode;
};

function SectionHeader({ title, subtitle, icon, rightContent }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <View style={styles.left}>
        <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
        {icon && <View>{icon}</View>}
        <View>
          <Text style={[styles.title, { color: colors.textAccent }]}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
        </View>
      </View>
      {rightContent && <View>{rightContent}</View>}
    </View>
  );
}

export default React.memo(SectionHeader);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Platform.OS === "web" ? ACTIVE_GAME_DENSITY.sectionGap - 2 : 10,
    marginBottom: 2,
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: Platform.OS === "web" ? 8 : 10,
  },
  accentBar: {
    width: 3,
    height: Platform.OS === "web" ? 18 : 20,
    borderRadius: 2,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
});

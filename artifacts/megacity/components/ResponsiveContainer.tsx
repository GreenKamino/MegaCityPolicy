import React from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";

import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { RESPONSIVE_BREAKPOINTS } from "@/hooks/useResponsiveLayout";

type Props = {
  children: React.ReactNode;
  enabled?: boolean;
  fullWidth?: boolean;
};

export default function ResponsiveContainer({ children, enabled = true, fullWidth = false }: Props) {
  const { maxContentWidth, wideLayoutEnabled, fontScaleMultiplier } = useSettings();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  const isDesktop = Platform.OS === "web" && width > RESPONSIVE_BREAKPOINTS.desktop;
  const isWideDesktop = Platform.OS === "web" && width >= RESPONSIVE_BREAKPOINTS.wideDesktop;
  const shouldConstrain = !fullWidth && enabled && wideLayoutEnabled && isDesktop;
  const needsScale = Platform.OS === "web" && fontScaleMultiplier !== 1;

  const scaleStyle = needsScale ? ({ zoom: fontScaleMultiplier } as any) : undefined;

  // On wide desktop, allow content to expand beyond the user's narrow cap so
  // multi-column layouts (e.g. screen + sidebar) have room to breathe.
  const cap = isWideDesktop ? Math.max(maxContentWidth, 1200) : maxContentWidth;

  // IMPORTANT: the wrapper structure must be identical whether or not
  // constraining/scaling is active. This component wraps the game's tab
  // navigator; switching between a fragment and a View when a setting
  // changes remounts the whole navigator and kicks the player back to the
  // initial tab mid-settings-change. Styles may vary — the tree shape
  // may not.
  return (
    <View
      style={[
        styles.outer,
        shouldConstrain && { alignItems: "center" as const, backgroundColor: colors.bg },
        scaleStyle,
      ]}
    >
      <View style={[styles.inner, shouldConstrain && { maxWidth: cap }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  inner: {
    flex: 1,
    width: "100%",
  },
});

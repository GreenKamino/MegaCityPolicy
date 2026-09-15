import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";

type Props = {
  compact?: boolean;
};

function CommsChatter({ compact = false }: Props) {
  const { colors } = useTheme();
  const { commsChatterEnabled } = useSettings();
  const containerStyle = useMemo(() => [
    styles.container,
    compact && styles.compactContainer,
    { borderTopColor: colors.accent + "10", pointerEvents: "none" as const },
  ], [colors.accent, compact]);

  if (!commsChatterEnabled) return null;

  return (
    <View testID={compact ? "comms-chatter-compact" : "comms-chatter"} style={containerStyle}>
      <Text style={[styles.line, { color: colors.accent + "70" }]} numberOfLines={1}>
        COMMS MONITOR ACTIVE · VERIFIED OPERATIONAL SIGNALS ONLY
      </Text>
    </View>
  );
}

export default React.memo(CommsChatter);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 1,
  },
  compactContainer: {
    height: 30,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  line: {
    fontFamily: "monospace",
    fontSize: 8,
    lineHeight: 11,
    letterSpacing: 0.3,
  },
});
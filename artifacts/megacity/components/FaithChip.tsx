import React from "react";
import { View, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { FAITH_DEFS } from "@/engine/faiths";
import type { FaithId } from "@/engine/types";

type Props = {
  faithId: FaithId | null | undefined;
  size?: "sm" | "md";
  showLabel?: boolean;
  showNoneState?: boolean;
};

export function FaithChip({ faithId, size = "sm", showLabel = true, showNoneState = true }: Props) {
  const { colors: Colors } = useTheme();
  const faith = faithId ? FAITH_DEFS[faithId] : null;
  if (!faith && !showNoneState) return null;
  const color = faith?.color ?? Colors.textMuted;
  const label = faith ? faith.shortName : "No religion";
  const iconName = faith ? "mosque" : "minus-circle-outline";
  const padV = size === "sm" ? 2 : 3;
  const padH = size === "sm" ? 5 : 7;
  const fontSize = size === "sm" ? 8 : 10;
  const iconSize = size === "sm" ? 9 : 11;
  return (
    <View
      accessibilityLabel={faith ? `Dominant religion: ${faith.name}` : "No dominant religion"}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: padH,
        paddingVertical: padV,
        borderWidth: 1,
        borderColor: color,
        borderRadius: 3,
        backgroundColor: faith ? color + "15" : "transparent",
      }}
    >
      <MaterialCommunityIcons name={iconName as any} size={iconSize} color={color} />
      {showLabel && (
        <Text
          style={{
            color,
            fontFamily: "Inter_700Bold",
            fontSize,
            letterSpacing: 0.5,
          }}
          numberOfLines={1}
        >
          {label.toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export default FaithChip;

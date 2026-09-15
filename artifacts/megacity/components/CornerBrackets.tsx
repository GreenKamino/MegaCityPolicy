import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/context/ThemeContext";

type Props = {
  children: React.ReactNode;
  color?: string;
  style?: any;
};

export default function CornerBrackets({ children, color, style }: Props) {
  const { colors } = useTheme();
  const c = color || colors.border;

  return (
    <View style={[styles.wrapper, style]}>
      <Text style={[styles.corner, styles.tl, { color: c }]}>┌</Text>
      <Text style={[styles.corner, styles.tr, { color: c }]}>┐</Text>
      <Text style={[styles.corner, styles.bl, { color: c }]}>└</Text>
      <Text style={[styles.corner, styles.br, { color: c }]}>┘</Text>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    marginBottom: 8,
  },
  corner: {
    position: "absolute",
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 16,
    opacity: 0.6,
  },
  tl: { top: -2, left: -2 },
  tr: { top: -2, right: -2 },
  bl: { bottom: -2, left: -2 },
  br: { bottom: -2, right: -2 },
  inner: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});

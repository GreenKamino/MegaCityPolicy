import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";

type Props = {
  icon?: string;
  title: string;
  message: string;
};

function EmptyState({ icon = "database-off-outline", title, message }: Props) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name={icon as any} size={36} color={c.textMuted} style={styles.icon} />
      <Text style={[styles.title, { color: c.textSecondary }]}>{title}</Text>
      <Text style={[styles.message, { color: c.textMuted }]}>{message}</Text>
    </View>
  );
}

export default React.memo(EmptyState);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  icon: {
    marginBottom: 12,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 6,
    textAlign: "center",
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18,
  },
});

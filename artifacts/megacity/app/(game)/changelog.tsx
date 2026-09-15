import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SectionHeader from "@/components/SectionHeader";
import { useTheme } from "@/context/ThemeContext";
import { CHANGELOG, type ChangelogSection } from "@/data/changelog";
import { APP_VERSION, BUILD_NUMBER } from "@/constants/version";

const HEADING_COLORS: Record<ChangelogSection["heading"], "accent" | "warning" | "danger" | "info" | "textMuted"> = {
  Added: "accent",
  Changed: "info",
  Fixed: "warning",
  Removed: "danger",
  Notes: "textMuted",
};

function ChangelogScreen() {
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useTheme();
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: themeColors.bg }]}>
      <View style={[styles.header, { backgroundColor: themeColors.bgSecondary, borderBottomColor: themeColors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={18} color={themeColors.accent} />
        </Pressable>
        <MaterialCommunityIcons name="script-text-outline" size={18} color={themeColors.accent} />
        <Text style={[styles.headerTitle, { color: themeColors.accent }]}>CHANGELOG</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.versionTag, { color: themeColors.textMuted }]}>v{APP_VERSION} · BUILD {BUILD_NUMBER}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {CHANGELOG.map((entry) => (
          <View key={entry.version} style={styles.entryWrap}>
            <SectionHeader
              title={`v${entry.version}${entry.title ? ` — ${entry.title}` : ""}`}
              subtitle={entry.date}
              icon={<Feather name="tag" size={14} color={themeColors.accent} />}
            />

            {entry.sections.map((section) => {
              const colorKey = HEADING_COLORS[section.heading];
              const headingColor = (themeColors as any)[colorKey] ?? themeColors.text;
              return (
                <View key={section.heading} style={[styles.sectionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                  <Text style={[styles.sectionHeading, { color: headingColor }]}>{section.heading.toUpperCase()}</Text>
                  {section.items.map((item, idx) => (
                    <View key={idx} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: headingColor }]} />
                      <Text style={[styles.bulletText, { color: themeColors.text }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ))}
        <Text style={[styles.footnote, { color: themeColors.textMuted }]}>
          Mirrored at /CHANGELOG.md in the project repository.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 8 : 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 2 },
  versionTag: { fontFamily: "Inter_400Regular", fontSize: 10, letterSpacing: 1 },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 40 },
  entryWrap: { marginBottom: 8 },
  sectionCard: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, gap: 6 },
  sectionHeading: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5, marginBottom: 4 },
  bulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bullet: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  bulletText: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1, lineHeight: 18 },
  footnote: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 12, textAlign: "center" },
});

export default withScreenBoundary(ChangelogScreen, "changelog");

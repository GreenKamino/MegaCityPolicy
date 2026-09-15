import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useGame } from "@/context/GameContext";
import { useTheme } from "@/context/ThemeContext";
import { CHANGELOG, type ChangelogEntry } from "@/data/changelog";
import { APP_VERSION } from "@/constants/version";

// Pops once after the player updates to a new APP_VERSION. Skipped on
// first-ever launch (lastSeenVersion === undefined) — the modal is for
// returning players, not for someone seeing the patch notes for the first
// time before they've even played a turn.
//
// "Dismiss" calls markChangelogSeen() which writes APP_VERSION into save state.
// "View full history" routes to the existing changelog screen and also marks
// the version as seen so the modal doesn't reopen on next launch.
//
// NOTE: Once-per-build gating is intentionally not user-tunable. Don't wire
// the SettingsContext `skipIntro` flag here — see SettingsContext for the
// rationale on what `skipIntro` actually controls.
function WhatsNewModal() {
  const { state, isLoaded, markChangelogSeen } = useGame();
  const { colors: c } = useTheme();

  const latest: ChangelogEntry | null = useMemo(() => CHANGELOG[0] ?? null, []);

  if (!isLoaded || !latest) return null;
  // First-ever launch: stamp current version silently so we don't surprise
  // a fresh player with patch notes for changes they never experienced.
  // The modal will only fire on the next real version bump.
  if (state.lastSeenVersion === undefined) {
    queueMicrotask(() => markChangelogSeen());
    return null;
  }
  if (state.lastSeenVersion === APP_VERSION) return null;
  if (state.lastSeenVersion === latest.version) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={markChangelogSeen}
    >
      <View style={[styles.backdrop, { backgroundColor: c.bg + "DD" }]}>
        <View style={[styles.card, { backgroundColor: c.bgCard, borderColor: c.accent }]}>
          <View style={styles.header}>
            <MaterialCommunityIcons name="rocket-launch-outline" size={20} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: c.accent }]}>WHAT'S NEW IN MEGACITY {latest.version}</Text>
              <Text style={[styles.title, { color: c.text }]}>{latest.title}</Text>
              <Text style={[styles.date, { color: c.textMuted }]}>{latest.date}</Text>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 12 }}>
            {latest.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={[styles.sectionHeading, { color: c.warning }]}>
                  {section.heading.toUpperCase()}
                </Text>
                {section.items.map((item, idx) => (
                  <View key={idx} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: c.accent }]}>•</Text>
                    <Text style={[styles.bulletText, { color: c.textSecondary }]}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={() => {
                markChangelogSeen();
                router.push("/(game)/changelog" as any);
              }}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: c.bg, borderColor: c.border },
                pressed && styles.btnPressed,
              ]}
            >
              <Feather name="book-open" size={14} color={c.info} />
              <Text style={[styles.btnText, { color: c.info }]}>VIEW FULL HISTORY</Text>
            </Pressable>
            <Pressable
              onPress={markChangelogSeen}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                { backgroundColor: c.accent + "20", borderColor: c.accent },
                pressed && styles.btnPressed,
              ]}
            >
              <Feather name="check" size={14} color={c.accent} />
              <Text style={[styles.btnText, { color: c.accent }]}>DISMISS</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(WhatsNewModal);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "85%",
    borderWidth: 1,
    borderRadius: 4,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  header: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  eyebrow: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  date: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11,
  },
  body: {
    flexShrink: 1,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeading: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 3,
  },
  bulletDot: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  bulletText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 2,
  },
  btnPrimary: {
    minWidth: 110,
    justifyContent: "center",
  },
  btnPressed: {
    opacity: 0.7,
  },
  btnText: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11,
    letterSpacing: 1.2,
  },
});

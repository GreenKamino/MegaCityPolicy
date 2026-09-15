import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, Platform } from "react-native";
import { type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState } from "@/context/GameContext";
import { buildKeyboardSections } from "@/components/keyboardHelpSections";

export { useKeyboardHelp } from "@/hooks/useKeyboardHelp";

const isWeb = Platform.OS === "web";

export default function KeyboardHelp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state } = useGameState();
  const styles = useStyles();
  if (!isWeb || !visible) return null;

  const sections = buildKeyboardSections(state.gameplayMode === "turnbased");

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>KEYBOARD SHORTCUTS</Text>
            <Text style={styles.dismiss}>Press ? to close</Text>
          </View>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.keys.map((binding) => (
                  <View key={binding.key} style={styles.row}>
                    <View style={styles.keyBadge}>
                      <Text style={styles.keyText}>{binding.key}</Text>
                    </View>
                    <Text style={styles.actionText}>{binding.action}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    width: 420,
    maxHeight: "80%",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.accent,
    letterSpacing: 2,
  },
  dismiss: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  scroll: {
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 12,
  },
  keyBadge: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 40,
    alignItems: "center",
  },
  keyText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  actionText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
}));

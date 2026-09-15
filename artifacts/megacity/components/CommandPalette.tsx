import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { useGameState } from "@/context/GameContext";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import {
  getUnlockedCommandDestinations,
  searchCommandDestinations,
  type CommandDestination,
} from "@/engine/commandMenuCatalog";
import {
  getCommandMenuStatuses,
  type CommandMenuStatus,
} from "@/engine/commandMenuStatus";
import { makeThemedStyles } from "@/hooks/useThemedStyles";

type Props = {
  visible: boolean;
  onClose: () => void;
};

function iconFor(item: CommandDestination, color: string) {
  if (item.icon.set === "feather") {
    return <Feather name={item.icon.name as any} size={18} color={color} />;
  }
  return <MaterialCommunityIcons name={item.icon.name as any} size={18} color={color} />;
}

function toneColor(status: CommandMenuStatus | undefined, colors: ThemePalette): string {
  if (!status) return colors.textMuted;
  if (status.tone === "critical") return colors.danger;
  if (status.tone === "pending") return colors.warning;
  return colors.accent;
}

export default function CommandPalette({ visible, onClose }: Props) {
  const router = useRouter();
  const { state } = useGameState();
  const { colors } = useTheme();
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const unlocked = useMemo(() => getUnlockedCommandDestinations(state), [state]);
  const results = useMemo(
    () => searchCommandDestinations(query, unlocked),
    [query, unlocked],
  );
  const statuses = useMemo(() => getCommandMenuStatuses(state), [state]);
  const selected = results[selectedIndex] ?? results[0];

  const run = (item: CommandDestination | undefined) => {
    if (!item) return;
    onClose();
    router.replace(item.route as any);
  };

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setSelectedIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(results.length - 1, current + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        run(selected);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [visible, results.length, selected, onClose]);

  useEffect(() => {
    if (!visible || results.length === 0) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, selectedIndex * 62 - 62),
      animated: false,
    });
  }, [selectedIndex, results.length, visible]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <Pressable
        testID="command-palette-overlay"
        style={styles.overlay}
        onPress={onClose}
        accessibilityLabel="Close command palette"
      >
        <Pressable
          testID="command-palette"
          style={[
            styles.palette,
            {
              width: Math.min(680, Math.max(300, width - 24)),
              maxHeight: Math.min(720, height - 36),
            },
          ]}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>QUICK NAVIGATION</Text>
              <Text style={styles.title}>COMMAND PALETTE</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close command palette"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Feather name="search" size={17} color={colors.accent} />
            <TextInput
              ref={inputRef}
              testID="command-palette-input"
              value={query}
              onChangeText={setQuery}
              placeholder="Search law, money, officers, crises, sectors, research…"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => run(selected)}
              accessibilityLabel="Search command destinations"
            />
            {Platform.OS === "web" && <Text style={styles.keyHint}>ESC</Text>}
          </View>

          <View style={styles.resultMeta}>
            <Text style={styles.resultCount}>
              {results.length} DESTINATION{results.length === 1 ? "" : "S"}
            </Text>
            <Text style={styles.controllerHint}>D-PAD / ARROWS · A / ENTER</Text>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.results}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {results.map((item, index) => {
              const status = statuses[item.statusRoute ?? item.route];
              const statusTone = toneColor(status, colors);
              const active = index === selectedIndex;
              return (
                <Pressable
                  key={item.id}
                  testID={`command-result-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.label}${status ? `, ${status.label.toLowerCase()}` : ""}`}
                  onFocus={() => setSelectedIndex(index)}
                  onHoverIn={() => setSelectedIndex(index)}
                  onPress={() => run(item)}
                  style={[
                    styles.result,
                    active && { borderColor: colors.accent, backgroundColor: colors.accent + "12" },
                    status?.tone === "critical" && { borderLeftColor: colors.danger, borderLeftWidth: 3 },
                  ]}
                >
                  <View style={[styles.iconWrap, { borderColor: active ? colors.accent : colors.borderBright }]}>
                    {iconFor(item, status?.tone === "critical" ? colors.danger : active ? colors.accent : colors.textMuted)}
                  </View>
                  <View style={styles.resultText}>
                    <View style={styles.labelRow}>
                      <Text style={[styles.label, active && { color: colors.accent }]} numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Text style={styles.group}>{item.group.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.subtitle} numberOfLines={1}>{item.subtitle}</Text>
                  </View>
                  {status && (
                    <View style={[styles.status, { borderColor: statusTone + "80", backgroundColor: statusTone + "16" }]}>
                      <Text style={[styles.statusText, { color: statusTone }]} numberOfLines={1}>{status.label}</Text>
                    </View>
                  )}
                  {item.hotkey && (
                    <View style={styles.hotkey}>
                      <Text style={styles.hotkeyText}>{item.hotkey}</Text>
                    </View>
                  )}
                  <Feather name="chevron-right" size={15} color={active ? colors.accent : colors.textMuted} />
                </Pressable>
              );
            })}
            {results.length === 0 && (
              <View style={styles.empty}>
                <Feather name="search" size={22} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>NO MATCHING COMMAND</Text>
                <Text style={styles.emptyText}>Try a system name, role, resource, or destination.</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.76)",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  palette: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: `0 18px 60px ${Colors.bg}CC` } as any,
      default: {},
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  eyebrow: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1.6,
    color: Colors.textMuted,
  },
  title: {
    marginTop: 2,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 1.6,
    color: Colors.accent,
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
  },
  searchBox: {
    minHeight: 48,
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.borderBright,
    backgroundColor: Colors.bg,
    borderRadius: 5,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    outlineStyle: "none",
  } as any,
  keyHint: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.8,
    color: Colors.textMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  resultCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
    color: Colors.textMuted,
  },
  controllerHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    letterSpacing: 0.7,
    color: Colors.textMuted,
  },
  results: {
    flexGrow: 0,
  },
  resultsContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  result: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    backgroundColor: Colors.bgSecondary,
  },
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: Colors.bg,
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    flexShrink: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    color: Colors.text,
  },
  group: {
    flexShrink: 0,
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 0.7,
    color: Colors.textMuted,
  },
  subtitle: {
    marginTop: 3,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textMuted,
  },
  status: {
    maxWidth: 110,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  statusText: {
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 0.6,
  },
  hotkey: {
    minWidth: 26,
    paddingHorizontal: 5,
    paddingVertical: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.borderBright,
    borderRadius: 3,
    backgroundColor: Colors.bg,
  },
  hotkeyText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    color: Colors.textSecondary,
  },
  empty: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.2,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
  },
}));
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo } from "react";
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

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
type PropagandaTone = "triumphant" | "reassuring" | "warning" | "rallying" | "somber";
type OperationalBroadcastMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: PropagandaTone;
};

const TONE_META: Record<PropagandaTone, { color: string; label: string; icon: string }> = {
  triumphant: { color: "#FFD54F", label: "TRIUMPH", icon: "award" },
  reassuring: { color: "#64B5F6", label: "ADVISORY", icon: "shield" },
  warning: { color: "#EF5350", label: "BULLETIN", icon: "alert-triangle" },
  rallying: { color: "#FF8A65", label: "CALL TO DUTY", icon: "flag" },
  somber: { color: "#9E9E9E", label: "NOTICE", icon: "minus-circle" },
};

function PropagandaScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGame();

  const items = useMemo<OperationalBroadcastMetric[]>(() => {
    const policyActive = state.policies?.propaganda === true;
    const towers = Math.max(0, Number(state.buildings?.propagandaBroadcastingTowers) || 0);
    const officers = Math.max(0, Number(state.units?.propagandaOfficers) || 0);
    const happiness = Math.round(Number(state.cityStats?.happiness) || 0);
    const unrest = Math.round(Number(state.cityStats?.unrest) || 0);
    const lawOrder = Math.round(Number(state.cityStats?.lawOrder) || 0);
    return [
      {
        id: "policy",
        label: "BROADCAST POLICY",
        value: policyActive ? "ACTIVE" : "INACTIVE",
        detail: "State propaganda policy status",
        tone: policyActive ? "triumphant" : "somber",
      },
      {
        id: "network",
        label: "BROADCAST NETWORK",
        value: `${Math.round(towers)} TOWERS`,
        detail: `${Math.round(officers)} propaganda officers assigned`,
        tone: towers > 0 ? "reassuring" : "warning",
      },
      {
        id: "public-response",
        label: "PUBLIC RESPONSE",
        value: `${happiness} HAPPINESS`,
        detail: `${unrest} unrest · ${lawOrder} law and order`,
        tone: unrest >= 60 ? "warning" : happiness >= 60 ? "triumphant" : "reassuring",
      },
    ];
  }, [state]);

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>PUBLIC INFORMATION CONTROL</Text>
          <Text style={s.headerSub}>LIVE OPERATIONAL READOUT</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {items.map((it) => (
          <PropagandaCard key={it.id} item={it} />
        ))}
      </ScrollView>
    </View>
  );
}

function PropagandaCard({ item }: { item: OperationalBroadcastMetric }) {
  const s = useStyles();
  const meta = TONE_META[item.tone];
  return (
    <View style={[s.card, { borderLeftColor: meta.color }]}>
      <View style={s.cardHeader}>
        <Feather name={meta.icon as any} size={12} color={meta.color} />
        <Text style={[s.cardSource, { color: meta.color }]}>{item.label}</Text>
        <View style={s.spacer} />
        <Text style={[s.toneLabel, { color: meta.color }]}>{meta.label}</Text>
      </View>
      <Text style={s.cardHeadline}>{item.value}</Text>
      <Text style={s.cardBody}>{item.detail}</Text>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    letterSpacing: 1.5,
  },
  headerSub: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 80, gap: 10 },
  empty: { alignItems: "center", padding: 32, gap: 12 },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  emptyBody: { color: Colors.textMuted, fontSize: 12, textAlign: "center", lineHeight: 18 },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 12,
    gap: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardSource: {
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  spacer: { flex: 1 },
  toneLabel: {
    fontSize: 9,
    letterSpacing: 1.4,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  cardHeadline: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
    lineHeight: 19,
  },
  cardBody: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  cardTick: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 2,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
}));

export default withScreenBoundary(PropagandaScreen, "propaganda");

import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import EventCard from "@/components/EventCard";
import SectionHeader from "@/components/SectionHeader";
import TutorialHint from "@/components/TutorialHint";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import CommandScreenHeader from "@/components/CommandScreenHeader";
import CrisisReportFrame from "@/components/CrisisReportFrame";

function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { state, dismissEvent, respondToEvent, respondToEventMulti } = useGame();
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const lastTickEntries = state.tickLog;
  const reversedHistory = useMemo(() => [...state.eventHistory].reverse(), [state.eventHistory]);

  const { colors: tc } = useTheme();
  const styles = useStyles();

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: tc.bg }]}>
      <CommandScreenHeader
        icon="alert-triangle"
        title="INCIDENTS / REPORTS"
        subtitle="response queue · tick report · archive"
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TutorialHint
          id="events_intro"
          message="Review the operational impact, then commit a response. Every option changes city resources or stability."
        />
        <CrisisReportFrame
          title="INCIDENT REGISTER"
          icon="alert-triangle"
          tone={state.activeEvents.some((event) => event.severity === "critical") ? "danger" : state.activeEvents.length > 0 ? "warning" : "statHigh"}
          statusLabel={state.activeEvents.length > 0 ? "RESPONSE WINDOW" : "CLEAR"}
          severityLabel={state.activeEvents.some((event) => event.severity === "critical") ? "COLLAPSING" : state.activeEvents.some((event) => event.severity === "high") ? "CRITICAL" : state.activeEvents.length > 0 ? "STRAINED" : "STABLE"}
          headline={`${state.activeEvents.length} active incident${state.activeEvents.length === 1 ? "" : "s"} · response required`}
          consequence="Delays and dismissals can increase duration, severity, and casualties."
          details={<Text style={{ color: tc.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11 }}>Review the impact line, then select a countermeasure. Recurring incidents identify the lasting fix.</Text>}
          detailsLabel="RESPONSE PROTOCOL"
        />
        {/* Active events */}
        <SectionHeader
          title="Response Queue"
          subtitle={`${state.activeEvents.length} pending`}
          icon={<Feather name="alert-triangle" size={14} color={tc.danger} />}
        />
        {state.activeEvents.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="check-circle" size={24} color={tc.textMuted} />
            <Text style={[styles.emptyText, { color: tc.accent }]}>ALL SYSTEMS NOMINAL</Text>
            <Text style={[styles.emptyText, { color: tc.textMuted, fontSize: 10, marginTop: 4 }]}>No active incidents. The queue is monitored each tick.</Text>
          </View>
        ) : (
          state.activeEvents.map((e) => (
            <EventCard key={e.id} event={e} onDismiss={dismissEvent} onRespond={respondToEvent} onRespondMulti={respondToEventMulti} />
          ))
        )}

        {/* Last tick log */}
        <SectionHeader
          title="Tick Report"
          subtitle={`Tick #${state.totalTicks}`}
          icon={<Feather name="clock" size={14} color={tc.accent} />}
        />
        {lastTickEntries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: tc.textMuted }]}>No tick report is available yet.</Text>
          </View>
        ) : (
          lastTickEntries.map((entry, i) => {
            const deltaColor =
              entry.severity === "positive"
                ? tc.accent
                : entry.severity === "negative"
                ? tc.danger
                : entry.severity === "warning"
                ? tc.warning
                : tc.info;
            const prefix = entry.delta > 0 ? "+" : "";

            return (
              <View key={i} style={[styles.tickRow, { borderBottomColor: tc.border }]}>
                <View style={styles.tickLeft}>
                  <Text style={[styles.tickLabel, { color: tc.text }]}>{entry.label}</Text>
                  <Text style={[styles.tickReason, { color: tc.textMuted }]}>{entry.reason}</Text>
                </View>
                <Text style={[styles.tickDelta, { color: deltaColor }]}>
                  {prefix}
                  {entry.delta} {entry.unit}
                </Text>
              </View>
            );
          })
        )}

        {/* Event history */}
        <SectionHeader
          title="Incident History"
          subtitle={`${state.eventHistory.length} past events`}
          icon={<Feather name="archive" size={14} color={tc.accent} />}
        />
        {state.eventHistory.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: tc.textMuted }]}>Resolved incidents will appear here.</Text>
          </View>
        ) : (
          reversedHistory.map((e, i) => (
            <View key={i} style={[styles.historyRow, { borderBottomColor: tc.border }]}>
              <View style={[styles.histDot, {
                backgroundColor:
                  e.severity === "critical" ? tc.danger
                  : e.severity === "high" ? tc.warning
                  : e.severity === "medium" ? tc.info
                  : tc.accent
              }]} />
              <View style={styles.histContent}>
                <Text style={[styles.histTitle, { color: tc.text }]}>{e.title}</Text>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },

  empty: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
  },

  tickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tickLeft: { flex: 1, paddingRight: 12 },
  tickLabel: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  tickReason: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  tickDelta: { fontFamily: "Inter_700Bold", fontSize: 13 },

  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  histDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  histContent: { flex: 1 },
  histTitle: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 },
}));

export default withScreenBoundary(EventsScreen, "events");

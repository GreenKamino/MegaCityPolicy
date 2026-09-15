import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  LayoutChangeEvent,
  PanResponder,
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
import {
  buildJournalEntries,
  formatGameDate,
  type JournalEntry,
  type JournalSeverity,
} from "@/engine/personalJournal";

const getSeverityColor = (Colors: ThemePalette): Record<JournalSeverity, string> => ({
  low: Colors.textMuted,
  normal: Colors.accentDim,
  high: Colors.warning,
  critical: Colors.danger,
});

const KIND_ICONS: Record<JournalEntry["kind"], string> = {
  message: "mail",
  event: "alert-triangle",
  strike: "target",
  world: "globe",
};

function ReplayScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGame();

  // Build a tick-grouped timeline from the journal feed. Each tick that has at
  // least one entry becomes a stop on the scrubber. We also surface the latest
  // game date associated with that tick so the player gets a clear "when".
  const stops = useMemo(() => {
    const entries = buildJournalEntries(state, { limit: 1000 });
    const byTick = new Map<number, JournalEntry[]>();
    for (const e of entries) {
      const arr = byTick.get(e.tick) ?? [];
      arr.push(e);
      byTick.set(e.tick, arr);
    }
    const ticks = [...byTick.keys()].sort((a, b) => a - b);
    return ticks.map((t) => {
      const items = byTick.get(t)!;
      const dated = items.find((i) => i.gameDate);
      return {
        tick: t,
        gameDateLabel: dated?.gameDate ? formatGameDate(dated.gameDate) : "",
        entries: items,
      };
    });
  }, [state]);

  // Default the scrubber to the most recent stop so the screen opens on
  // "now" instead of an empty origin tick.
  const [index, setIndex] = useState<number>(() => Math.max(0, stops.length - 1));
  const safeIndex = Math.min(index, Math.max(0, stops.length - 1));
  const current = stops[safeIndex];

  // Custom slider — no slider package in deps. We use PanResponder + onLayout
  // to map gesture x to a discrete tick index. A simple track + handle is
  // enough for a scrubber and works identically on web/iOS/Android.
  const trackWidth = useRef<number>(0);
  const onTrackLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };
  const setFromX = (x: number) => {
    if (stops.length <= 1 || trackWidth.current <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / trackWidth.current));
    const next = Math.round(ratio * (stops.length - 1));
    setIndex(next);
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => setFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => setFromX(evt.nativeEvent.locationX),
    }),
  ).current;

  const handleRatio =
    stops.length <= 1 ? 0 : safeIndex / Math.max(1, stops.length - 1);

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <Text style={s.headerTitle}>REPLAY TIMELINE</Text>
      </View>

      {stops.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>NO HISTORY YET</Text>
          <Text style={s.emptyBody}>
            Play a few ticks and the timeline will fill with the events you
            lived through. Drag the scrubber to revisit any moment.
          </Text>
        </View>
      ) : (
        <>
          <View style={s.snapshotCard}>
            <Text style={s.snapshotLabel}>TICK {current.tick}</Text>
            {current.gameDateLabel ? (
              <Text style={s.snapshotDate}>{current.gameDateLabel}</Text>
            ) : null}
            <View style={s.statsRow}>
              <Stat label="POP" value={fmt(state.cityStats?.population)} />
              <Stat label="CRED" value={fmt(state.resources?.credits)} />
              <Stat label="CRIME" value={pct(state.cityStats?.crime)} />
              <Stat label="UNREST" value={pct(state.cityStats?.unrest)} />
            </View>
            <Text style={s.snapshotNote}>
              Stats reflect your current city — replay shows the events that
              happened at this tick, not a full state rewind.
            </Text>
          </View>

          <View style={s.scrubberRow}>
            <Pressable
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
              hitSlop={10}
              style={s.scrubBtn}
              accessibilityRole="button"
              accessibilityLabel="Previous replay step"
            >
              <Feather name="chevron-left" size={18} color={Colors.accent} />
            </Pressable>
            <View style={s.trackWrap}>
              <View
                style={s.track}
                onLayout={onTrackLayout}
                {...pan.panHandlers}
              >
                <View style={[s.trackFill, { width: `${handleRatio * 100}%` }]} />
                <View
                  style={[
                    s.handle,
                    { left: `${handleRatio * 100}%` },
                  ]}
                />
              </View>
              <View style={s.trackLabels}>
                <Text style={s.trackLabel}>T{stops[0].tick}</Text>
                <Text style={s.trackLabel}>
                  {safeIndex + 1} / {stops.length}
                </Text>
                <Text style={s.trackLabel}>
                  T{stops[stops.length - 1].tick}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() =>
                setIndex((i) => Math.min(stops.length - 1, i + 1))
              }
              hitSlop={10}
              style={s.scrubBtn}
              accessibilityRole="button"
              accessibilityLabel="Next replay step"
            >
              <Feather name="chevron-right" size={18} color={Colors.accent} />
            </Pressable>
          </View>

          <ScrollView
            style={s.feed}
            contentContainerStyle={s.feedContent}
            showsVerticalScrollIndicator={false}
          >
            {current.entries.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function EntryCard({ entry }: { entry: JournalEntry }) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const accent = getSeverityColor(Colors)[entry.severity];
  return (
    <View style={[s.card, { borderLeftColor: accent }]}>
      <View style={s.cardHeader}>
        <Feather name={KIND_ICONS[entry.kind] as never} size={12} color={accent} />
        <Text style={[s.cardTitle, { color: accent }]} numberOfLines={2}>
          {entry.title}
        </Text>
      </View>
      <Text style={s.cardBody}>{entry.body}</Text>
      <View style={s.cardFooter}>
        <Text style={[s.cardKind, { color: accent }]}>
          {entry.kind.toUpperCase()}
        </Text>
        {entry.category ? (
          <Text style={s.cardCategory}>· {entry.category.toUpperCase()}</Text>
        ) : null}
      </View>
    </View>
  );
}

function fmt(n?: number): string {
  if (n == null || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function pct(n?: number): string {
  if (n == null || !isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  headerTitle: {
    color: Colors.accent,
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: "700",
    fontFamily: mono,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.accent,
    fontSize: 13,
    letterSpacing: 2,
    fontFamily: mono,
  },
  emptyBody: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  snapshotCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 12,
    gap: 8,
  },
  snapshotLabel: {
    color: Colors.accent,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 2,
    fontFamily: mono,
  },
  snapshotDate: {
    color: Colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: mono,
  },
  snapshotNote: {
    color: Colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontStyle: "italic",
  },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  stat: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: mono,
  },
  statValue: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: "700",
    fontFamily: mono,
  },
  scrubberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  scrubBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
  },
  trackWrap: { flex: 1, gap: 6 },
  track: {
    height: 28,
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  trackFill: {
    position: "absolute",
    left: 0,
    top: 12,
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  handle: {
    position: "absolute",
    top: 4,
    width: 20,
    height: 20,
    marginLeft: -10,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.bg,
    borderRadius: 10,
  },
  trackLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  trackLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: mono,
  },
  feed: { flex: 1, marginTop: 4 },
  feedContent: { gap: 8, paddingBottom: 24 },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 10,
    gap: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { flex: 1, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  cardBody: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardKind: { fontSize: 9, letterSpacing: 1, fontFamily: mono, fontWeight: "700" },
  cardCategory: { color: Colors.textMuted, fontSize: 9, letterSpacing: 1 },
}));

export default withScreenBoundary(ReplayScreen, "replay");

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useSettings } from "@/context/SettingsContext";
import {
  getProfilerSnapshot,
  setTickProfilingEnabled,
  type ProfilerSnapshot,
} from "@/engine/tickProfiler";
import { getAverageTickMs, getSampleCount } from "@/engine/tickPerf";

// How often the overlay re-reads engine timings. The task calls for a 1s
// refresh — slow enough that the read-side O(n log n) p95 sort over <=120
// samples per section is negligible, and steady enough to read at a glance.
const REFRESH_MS = 1000;

const EMPTY_SNAPSHOT: ProfilerSnapshot = {
  sections: [],
  sumAvg: 0,
  sumMedian: 0,
  maxCount: 0,
};

function fmt(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms >= 100) return ms.toFixed(0);
  if (ms >= 10) return ms.toFixed(1);
  return ms.toFixed(2);
}

function TickProfilerOverlay() {
  const styles = useStyles();
  const { showTickProfiler } = useSettings();
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useState(false);
  const [snapshot, setSnapshot] = useState<ProfilerSnapshot>(EMPTY_SNAPSHOT);
  const [tickAvg, setTickAvg] = useState<number | null>(null);
  const [tickSamples, setTickSamples] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drive the engine-side profiling flag from the persisted setting. This
  // effect runs whether or not the panel is visually rendered (the early
  // `return null` below is AFTER all hooks), so toggling the Debug switch
  // always flips engine instrumentation on/off — even before first paint.
  useEffect(() => {
    setTickProfilingEnabled(showTickProfiler);
    return () => {
      // Tearing down the overlay (e.g. fast-refresh) must not leave the
      // engine recording forever — that would violate the zero-cost-when-off
      // contract for everyone who never opened the overlay again.
      setTickProfilingEnabled(false);
    };
  }, [showTickProfiler]);

  useEffect(() => {
    if (!showTickProfiler) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }
    const poll = () => {
      setSnapshot(getProfilerSnapshot());
      setTickAvg(getAverageTickMs());
      setTickSamples(getSampleCount());
    };
    poll();
    intervalRef.current = setInterval(poll, REFRESH_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [showTickProfiler]);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);

  if (!showTickProfiler) return null;

  const { sections, sumAvg, maxCount } = snapshot;

  return (
    <View
      style={[styles.container, { top: insets.top + 8, pointerEvents: "box-none" }]}
    >
      <View style={styles.panel}>
        <Pressable
          onPress={toggleCollapsed}
          style={styles.header}
          accessibilityRole="button"
          accessibilityLabel={`Tick profiler. ${collapsed ? "Expand" : "Collapse"}.`}
        >
          <Text style={styles.title}>// TICK PROFILER</Text>
          <Text style={styles.headerTotal}>
            {tickAvg != null ? `${fmt(tickAvg)}ms` : "warming…"}
          </Text>
          <Text style={styles.chevron}>{collapsed ? "+" : "–"}</Text>
        </Pressable>

        {!collapsed && (
          <>
            <View style={styles.colHead}>
              <Text style={[styles.colLabel, styles.colName]}>SECTION</Text>
              <Text style={[styles.colLabel, styles.colNum]}>avg</Text>
              <Text style={[styles.colLabel, styles.colNum]}>p95</Text>
            </View>
            {sections.length === 0 ? (
              <Text style={styles.empty}>
                No samples yet — let the sim run a few ticks.
              </Text>
            ) : (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
              >
                {sections.map((s) => {
                  const hot = s.p95 >= 8;
                  return (
                    <View key={s.name} style={styles.row}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Text style={styles.rowNum}>{fmt(s.avg)}</Text>
                      <Text
                        style={[styles.rowNum, hot && styles.rowNumHot]}
                      >
                        {fmt(s.p95)}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Σ sections {fmt(sumAvg)}ms
              </Text>
              <Text style={styles.footerText}>
                {maxCount}/{tickSamples} smpl
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export default React.memo(TickProfilerOverlay);

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  container: {
    position: "absolute",
    left: 8,
    zIndex: 9990,
  },
  panel: {
    width: 218,
    backgroundColor: "rgba(6, 12, 6, 0.94)",
    borderWidth: 1,
    borderColor: Colors.borderBright,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  headerTotal: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.text,
  },
  chevron: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textMuted,
    width: 12,
    textAlign: "center",
  },
  colHead: {
    flexDirection: "row",
    marginTop: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
  },
  colLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  colName: {
    flex: 1,
  },
  colNum: {
    width: 38,
    textAlign: "right",
  },
  list: {
    maxHeight: 260,
    marginTop: 2,
  },
  listContent: {
    paddingVertical: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 1.5,
  },
  rowName: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.text,
  },
  rowNum: {
    width: 38,
    textAlign: "right",
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  rowNumHot: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
  },
  empty: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    paddingVertical: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.borderDim,
  },
  footerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 8.5,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
}));

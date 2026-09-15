import React, { type ReactNode } from "react";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";

export type CrisisReportTone =
  | "accent"
  | "info"
  | "warning"
  | "danger"
  | "muted"
  | "statHigh"
  | "statMid"
  | "statLow"
  | "statNeutral"
  | (string & {});

export type CrisisReportFrameProps = {
  title: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  tone: CrisisReportTone;
  statusLabel: string;
  severityLabel: string;
  headline: string;
  consequence: string;
  eyebrow?: string;
  actionCount?: number;
  details?: ReactNode;
  detailsLabel?: string;
  children?: ReactNode;
  movement?: "improving" | "worsening" | "holding";
};

function movementCopy(movement: CrisisReportFrameProps["movement"]): { arrow: string; label: string } | null {
  if (movement === "improving") return { arrow: "↓", label: "RECOVERING" };
  if (movement === "worsening") return { arrow: "↑", label: "WORSENING" };
  if (movement === "holding") return { arrow: "→", label: "HOLDING" };
  return null;
}

function resolveTone(tone: CrisisReportTone, colors: ThemePalette): string {
  if (tone in colors) {
    return colors[tone as keyof ThemePalette];
  }
  return tone;
}

function tint(color: string, alpha: string): string {
  if (/^#[\da-f]{6}$/i.test(color)) return `${color}${alpha}`;
  if (/^#[\da-f]{8}$/i.test(color)) return `#${color.slice(1, 7)}${alpha}`;
  return color;
}

export default function CrisisReportFrame({
  title,
  icon,
  tone,
  statusLabel,
  severityLabel,
  headline,
  consequence,
  eyebrow,
  actionCount,
  details,
  detailsLabel = "ACTIVE FACTORS",
  children,
  movement,
}: CrisisReportFrameProps) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  const toneColor = resolveTone(tone, tc);
  const hasCountermeasures = React.Children.count(children) > 0;
  const movementSignal = movementCopy(movement);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tc.bgCard,
          borderColor: tc.border,
          borderLeftColor: toneColor,
        },
      ]}
    >
      <View style={styles.topline}>
        <View style={styles.identity}>
          <View
            style={[
              styles.iconFrame,
              { backgroundColor: tint(toneColor, "18"), borderColor: tint(toneColor, "66") },
            ]}
          >
            <Feather name={icon} size={15} color={toneColor} />
          </View>
          <View style={styles.headingBlock}>
            {eyebrow ? (
              <Text style={[styles.eyebrow, { color: tc.textMuted }]} numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: tc.text }]}
              numberOfLines={2}
            >
              {title}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.statusChip,
            { backgroundColor: tint(toneColor, "18"), borderColor: tint(toneColor, "66") },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: toneColor }]} />
          <Text style={[styles.statusLabel, { color: toneColor }]} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.signalRow}>
        <View style={styles.signalCell}>
          <Text style={[styles.signalKey, { color: tc.textMuted }]}>SEVERITY</Text>
          <Text style={[styles.signalValue, { color: toneColor }]} numberOfLines={1}>
            {severityLabel}
          </Text>
        </View>
        {actionCount !== undefined ? (
          <View style={[styles.actionCell, { borderLeftColor: tc.border }]}>
            <Text style={[styles.signalKey, { color: tc.textMuted }]}>COUNTERMEASURES</Text>
            <Text style={[styles.actionValue, { color: tc.info }]}>
              {actionCount} {actionCount === 1 ? "ACTION" : "ACTIONS"}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.headlineRow}>
        <Text style={[styles.headline, { color: tc.text }]}>{headline}</Text>
        {movementSignal ? (
          <View
            accessibilityRole="text"
            accessibilityLabel={`${movementSignal.label} movement`}
            style={[
              styles.movement,
              { borderColor: tint(toneColor, "66"), backgroundColor: tint(toneColor, "12") },
            ]}
          >
            <Text style={[styles.movementText, { color: toneColor }]}>
              {movementSignal.arrow} {movementSignal.label}
            </Text>
          </View>
        ) : null}
      </View>

      {details ? (
        <View style={[styles.detailsBlock, { borderTopColor: tc.border }]}>
          <Text style={[styles.detailsLabel, { color: tc.textMuted }]}>{detailsLabel}</Text>
          <View style={styles.detailsContent}>{details}</View>
        </View>
      ) : null}

      <View
        style={[
          styles.consequenceBlock,
          { backgroundColor: tint(toneColor, "0D"), borderColor: tint(toneColor, "35") },
        ]}
      >
        <View style={styles.consequenceHeader}>
          <View style={[styles.consequenceRule, { backgroundColor: toneColor }]} />
          <Text style={[styles.consequenceLabel, { color: toneColor }]}>IMPACT / FAILURE MODE</Text>
        </View>
        <Text style={[styles.consequence, { color: tc.textSecondary }]}>{consequence}</Text>
      </View>

      {hasCountermeasures ? (
        <View style={[styles.countermeasureBlock, { borderTopColor: tc.border }]}>
          <Text style={[styles.countermeasureLabel, { color: tc.info }]}>AVAILABLE COUNTERMEASURES</Text>
          <View style={styles.countermeasureContent}>{children}</View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) =>
  StyleSheet.create({
    card: {
      width: "100%",
      borderWidth: 1,
      borderLeftWidth: 3,
      borderRadius: 4,
      padding: 12,
      marginBottom: 14,
    },
    topline: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    identity: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    iconFrame: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: 3,
    },
    headingBlock: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
    },
    eyebrow: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 1,
      lineHeight: 11,
      marginBottom: 2,
    },
    title: {
      fontFamily: "Inter_700Bold",
      fontSize: 12,
      letterSpacing: 0.8,
      lineHeight: 15,
    },
    statusChip: {
      flexShrink: 1,
      maxWidth: "43%",
      minHeight: 22,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderWidth: 1,
      borderRadius: 3,
    },
    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    statusLabel: {
      flexShrink: 1,
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 0.65,
    },
    signalRow: {
      flexDirection: "row",
      marginTop: 11,
      marginBottom: 9,
    },
    signalCell: {
      flex: 1,
      minWidth: 0,
    },
    actionCell: {
      flex: 1,
      minWidth: 0,
      borderLeftWidth: 1,
      paddingLeft: 12,
    },
    signalKey: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 0.7,
      lineHeight: 11,
    },
    signalValue: {
      marginTop: 2,
      fontFamily: "Inter_700Bold",
      fontSize: 11,
      letterSpacing: 0.45,
    },
    actionValue: {
      marginTop: 2,
      fontFamily: "Inter_700Bold",
      fontSize: 11,
      letterSpacing: 0.45,
    },
    headline: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      lineHeight: 21,
      letterSpacing: 0.15,
      marginBottom: 10,
    },
    headlineRow: {
      gap: 7,
      marginBottom: 10,
    },
    movement: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderRadius: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    movementText: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 0.65,
    },
    consequenceBlock: {
      borderWidth: 1,
      borderRadius: 3,
      paddingHorizontal: 9,
      paddingVertical: 8,
    },
    detailsBlock: {
      borderTopWidth: 1,
      paddingTop: 9,
      marginBottom: 10,
    },
    detailsLabel: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 0.7,
      marginBottom: 6,
    },
    detailsContent: {
      gap: 5,
    },
    consequenceHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
    },
    consequenceRule: {
      width: 13,
      height: 2,
    },
    consequenceLabel: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 0.7,
    },
    consequence: {
      fontFamily: "Inter_500Medium",
      fontSize: 10,
      lineHeight: 15,
    },
    countermeasureBlock: {
      borderTopWidth: 1,
      marginTop: 11,
      paddingTop: 10,
    },
    countermeasureLabel: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 0.7,
      marginBottom: 6,
    },
    countermeasureContent: {
      gap: 5,
    },
  }),
);
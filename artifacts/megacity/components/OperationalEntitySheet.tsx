import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import type { DisclosureLevel } from "@/engine/entitySheets";

export type OperationalEntityRow = {
  label: string;
  value: string;
  level?: DisclosureLevel;
  accessibilityLabel?: string;
};

export type OperationalEntitySection = {
  title: string;
  rows: OperationalEntityRow[];
};

type Props = {
  name: string;
  kind: string;
  summary?: string;
  disclosureLabel: string;
  evidenceLabel: string;
  level: DisclosureLevel;
  sections: OperationalEntitySection[];
  accent?: string;
  compact?: boolean;
  accessibilityLabel?: string;
};

function OperationalEntitySheet({
  name,
  kind,
  summary,
  disclosureLabel,
  evidenceLabel,
  level,
  sections,
  accent,
  compact = false,
  accessibilityLabel,
}: Props) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const tone = accent ?? c.accent;
  const visibleSections = sections.filter((section) => section.rows.length > 0);

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? `${name} operational entity sheet`}
      style={[styles.sheet, { borderColor: tone + "70", backgroundColor: c.bgCard }, compact && styles.compact]}
    >
      <View style={styles.header}>
        <View style={[styles.marker, { backgroundColor: tone }]} />
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: tone }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.kind, { color: c.textMuted }]}>{kind.toUpperCase()} · {disclosureLabel}</Text>
        </View>
        <MaterialCommunityIcons name="file-eye-outline" size={18} color={tone} />
      </View>
      {summary ? <Text style={[styles.summary, { color: c.textSecondary }]}>{summary}</Text> : null}
      <View style={[styles.evidence, { borderColor: c.border, backgroundColor: c.bgSecondary }]}>
        <Text style={[styles.evidenceLabel, { color: c.textMuted }]}>EVIDENCE</Text>
        <Text style={[styles.evidenceValue, { color: c.textSecondary }]} numberOfLines={2}>
          {evidenceLabel} · DISCLOSURE {level.toUpperCase()}
        </Text>
      </View>
      {visibleSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: tone }]}>{section.title}</Text>
          {section.rows.map((row) => (
            <View
              key={row.label}
              accessibilityLabel={row.accessibilityLabel}
              style={[styles.row, { borderBottomColor: c.border + "70" }]}
            >
              <Text style={[styles.rowLabel, { color: c.textMuted }]}>{row.label}</Text>
              <Text style={[styles.rowValue, { color: c.text }]} numberOfLines={3}>{row.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeThemedStyles((c: ThemePalette) => StyleSheet.create({
  sheet: { borderWidth: 1, borderRadius: 5, padding: 10, marginBottom: 10 },
  compact: { padding: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  marker: { width: 3, height: 28, borderRadius: 2 },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 0.7 },
  kind: { fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.8, marginTop: 2 },
  summary: { fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15, marginTop: 8 },
  evidence: { borderWidth: 1, borderRadius: 3, padding: 7, marginTop: 9 },
  evidenceLabel: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1 },
  evidenceValue: { fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 2, lineHeight: 13 },
  section: { marginTop: 10 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1, marginBottom: 3 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 5, borderBottomWidth: 1 },
  rowLabel: { width: "34%", fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.4 },
  rowValue: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 10, textAlign: "right", lineHeight: 14 },
}));

export default React.memo(OperationalEntitySheet);
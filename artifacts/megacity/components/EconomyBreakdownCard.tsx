import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import CrisisReportFrame from "@/components/CrisisReportFrame";
import { useTheme } from "@/context/ThemeContext";
import { computeEconomyBreakdown } from "@/engine/economyBreakdown";
import type { GameState } from "@/engine/types";

function amount(value: number): string {
  return Math.round(value).toLocaleString();
}

export default function EconomyBreakdownCard({ state }: { state: GameState }) {
  const { colors: tc } = useTheme();
  const bd = computeEconomyBreakdown(state);
  const treasury = state.resources.credits;
  const net = bd.netIncome;
  const statusLabel = net > 0 ? "SURPLUS" : net < 0 ? "DEFICIT" : "BALANCED";
  const severity = treasury <= 0 && net < 0 ? "COLLAPSING" : net < 0 ? "STRAINED" : treasury < 5000 ? "STRAINED" : "STABLE";
  const tone = severity === "COLLAPSING" ? tc.danger : severity === "STRAINED" ? tc.warning : tc.statHigh;
  const incomeRows = ([
    ["Tax", bd.income.tax],
    ["Trade", bd.income.trade],
    ["Tourism", bd.income.tourism],
    ["Local enterprise", bd.income.enterpriseTax],
  ] as Array<[string, number]>).filter(([, value]) => value > 0);
  const expenseRows = ([
    ["Units", bd.expenses.unitUpkeep],
    ["Infrastructure", bd.expenses.infraUpkeep],
    ["Policies", bd.expenses.policyCost],
    ["Military", bd.expenses.installationUpkeep + bd.expenses.garrisonUpkeep],
  ] as Array<[string, number]>).filter(([, value]) => value > 0);

  return (
    <CrisisReportFrame
      title="SECTOR ECONOMY"
      icon="credit-card"
      tone={tone}
      statusLabel={statusLabel}
      severityLabel={severity}
      headline={`${net >= 0 ? "+" : "-"}${amount(Math.abs(net))} cr / tick · treasury ${amount(treasury)}`}
      consequence={net < 0
        ? "A sustained deficit exhausts the treasury, stalls construction, and leaves security, relief, and repairs unfunded."
        : "A positive balance funds the capacity, enforcement, and emergency response needed to survive the next crisis."}
      actionCount={1}
      detailsLabel="REVENUE / RECURRING BURDEN"
      details={
        <View style={styles.cols}>
          <View style={styles.col}>
            <Text style={[styles.colLabel, { color: tc.statHigh }]}>REVENUE</Text>
            {incomeRows.slice(0, 4).map(([label, value]) => (
              <View key={String(label)} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]}>{label}</Text>
                <Text style={[styles.rowAmount, { color: tc.statHigh }]}>+{amount(Number(value))}</Text>
              </View>
            ))}
          </View>
          <View style={styles.col}>
            <Text style={[styles.colLabel, { color: tc.danger }]}>BURDEN</Text>
            {expenseRows.slice(0, 4).map(([label, value]) => (
              <View key={String(label)} style={styles.row}>
                <Text style={[styles.rowLabel, { color: tc.textSecondary }]}>{label}</Text>
                <Text style={[styles.rowAmount, { color: tc.danger }]}>-{amount(Number(value))}</Text>
              </View>
            ))}
          </View>
        </View>
      }
    >
      <Pressable
        onPress={() => router.push("/(game)/economy")}
        accessibilityRole="button"
        accessibilityLabel="Open the Economy screen"
        style={({ pressed }) => [
          styles.action,
          { borderColor: tc.info + "66", backgroundColor: tc.info + "12" },
          pressed && { opacity: 0.6 },
          Platform.OS === "web" && ({ cursor: "pointer" } as any),
        ]}
      >
        <Text style={[styles.actionText, { color: tc.info }]}>OPEN ECONOMY COMMAND</Text>
        <Feather name="chevron-right" size={14} color={tc.info} />
      </Pressable>
    </CrisisReportFrame>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: 12 },
  col: { flex: 1, minWidth: 0 },
  colLabel: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.8, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 3 },
  rowLabel: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11 },
  rowAmount: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  action: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.7 },
});
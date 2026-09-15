import React, { useState, useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import SectionHeader from "@/components/SectionHeader";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  LAW_MISSIONS, LAW_MISSION_CATEGORIES, RISK_COLORS as RISK_COLOR_MAP,
  TEAM_ROLES, getLawOperationAvailability, type LawMissionCategory, type LawMissionDef,
} from "@/engine/lawOpsData";

type FieldOpsPanelProps = {
  credits: number;
  availableUnits: number;
  totalTicks?: number;
  cooldowns?: Record<string, number>;
  onDispatch?: (mission: LawMissionDef) => void;
};

const CAT_ICONS: Record<LawMissionCategory, string> = {
  patrol: "shield-check",
  raid: "flash",
  investigation: "magnify",
  rescue: "ambulance",
  expedition: "compass",
  undercover: "incognito",
  riot: "shield-alert",
  escort: "car-estate",
};

export default function FieldOpsPanel({
  credits,
  availableUnits,
  totalTicks = 0,
  cooldowns = {},
  onDispatch,
}: FieldOpsPanelProps) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const [filter, setFilter] = useState<LawMissionCategory | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filterScrollRef = useHorizontalWheelScroll();

  const filtered = useMemo(
    () => filter === "all" ? LAW_MISSIONS : LAW_MISSIONS.filter(m => m.category === filter),
    [filter]
  );

  const catKeys = Object.keys(LAW_MISSION_CATEGORIES) as LawMissionCategory[];

  return (
    <View>
      <SectionHeader
        title="Field Operations Manual"
        subtitle={`${LAW_MISSIONS.length} ops across ${catKeys.length} categories`}
        icon={<MaterialCommunityIcons name="map-marker-path" size={14} color={Colors.accent} />}
      />

      <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={s.filterRow}>
        <Pressable onPress={() => setFilter("all")} style={[s.chip, filter === "all" && s.chipActive]}>
          <Text style={[s.chipText, filter === "all" && s.chipTextActive]}>ALL ({LAW_MISSIONS.length})</Text>
        </Pressable>
        {catKeys.map(cat => {
          const count = LAW_MISSIONS.filter(m => m.category === cat).length;
          return (
            <Pressable key={cat} onPress={() => setFilter(filter === cat ? "all" : cat)} style={[s.chip, filter === cat && s.chipActive]}>
              <MaterialCommunityIcons name={CAT_ICONS[cat] as any} size={10} color={filter === cat ? Colors.accent : Colors.textMuted} />
              <Text style={[s.chipText, filter === cat && s.chipTextActive]}>
                {LAW_MISSION_CATEGORIES[cat]} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.map(mission => {
        const availability = getLawOperationAvailability(mission, {
          credits,
          availableUnits,
          totalTicks,
          cooldowns,
        });
        const isBlocked = !availability.ready;
        const availabilityLabel = availability.ready
          ? "READY TO DISPATCH"
          : availability.reason === "insufficient_credits"
            ? "INSUFFICIENT CREDITS"
            : availability.reason === "insufficient_units"
              ? "INSUFFICIENT UNITS"
              : availability.reason === "cooldown"
                ? `COOLDOWN — ${availability.cooldownRemaining ?? 0} TICKS`
                : "UNAVAILABLE";
        return (
        <Pressable
          key={mission.id}
          testID={`law-op-${mission.id}`}
          onPress={() => setExpanded(expanded === mission.id ? null : mission.id)}
          style={[s.card, expanded === mission.id && s.cardActive]}
        >
          <View style={s.cardTop}>
            <View style={{ flex: 1 }}>
              <View style={s.nameRow}>
                <MaterialCommunityIcons name={CAT_ICONS[mission.category] as any} size={12} color={Colors.accent} />
                <Text style={s.missionName}>{mission.name}</Text>
              </View>
              <Text style={s.missionCat}>{LAW_MISSION_CATEGORIES[mission.category]}</Text>
            </View>
            <View style={s.cardRight}>
              <Text style={s.costText}>{mission.cost.toLocaleString()} CR</Text>
              <View style={[s.riskBadge, { borderColor: RISK_COLOR_MAP[mission.risk] ?? Colors.textMuted }]}>
                <Text style={[s.riskText, { color: RISK_COLOR_MAP[mission.risk] ?? Colors.textMuted }]}>
                  {mission.risk.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.outcomeStrip} testID={`law-op-outcomes-${mission.id}`}>
            <View style={s.outcome}>
              <Text style={s.outcomeLabel}>CRIME</Text>
              <Text style={[s.outcomeValue, { color: mission.crimeReduction > 0 ? Colors.accent : Colors.textMuted }]}>
                {mission.crimeReduction > 0 ? `-${mission.crimeReduction}` : "—"}
              </Text>
            </View>
            <View style={s.outcome}>
              <Text style={s.outcomeLabel}>LAW</Text>
              <Text style={[s.outcomeValue, { color: mission.lawBonus > 0 ? "#4FC3F7" : Colors.textMuted }]}>
                {mission.lawBonus > 0 ? `+${mission.lawBonus}` : "—"}
              </Text>
            </View>
            <View style={s.outcome}>
              <Text style={s.outcomeLabel}>RISK</Text>
              <Text style={[s.outcomeValue, { color: RISK_COLOR_MAP[mission.risk] ?? Colors.textMuted }]}>
                {mission.risk.toUpperCase()}
              </Text>
            </View>
            <View style={s.outcome}>
              <Text style={s.outcomeLabel}>COST</Text>
              <Text style={s.outcomeValue}>{mission.cost.toLocaleString()} CR</Text>
            </View>
            <View style={s.outcome}>
              <Text style={s.outcomeLabel}>UNITS</Text>
              <Text style={s.outcomeValue}>{mission.requiredUnits}</Text>
            </View>
          </View>

          <View
            style={[
              s.availability,
              isBlocked
                ? s.availabilityBlocked
                : s.availabilityReady,
            ]}
            testID={`law-op-availability-${mission.id}`}
          >
            <MaterialCommunityIcons
              name={isBlocked ? "alert-circle-outline" : "check-circle-outline"}
              size={12}
              color={isBlocked ? Colors.danger : Colors.accent}
            />
            <Text
              style={[
                s.availabilityText,
                { color: isBlocked ? Colors.danger : Colors.accent },
              ]}
            >
              {availabilityLabel}
            </Text>
          </View>

          {expanded === mission.id && (
            <View style={s.detail}>
              <Text style={s.desc}>{mission.description}</Text>
              <View style={s.statRow}>
                <View style={s.stat}>
                  <Text style={s.statLabel}>COST</Text>
                  <Text style={s.statVal}>{mission.cost.toLocaleString()} CR</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>UNITS REQ</Text>
                  <Text style={s.statVal}>{mission.requiredUnits}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>CRIME</Text>
                  <Text style={[s.statVal, { color: mission.crimeReduction > 0 ? Colors.accent : Colors.textMuted }]}>
                    {mission.crimeReduction > 0 ? `-${mission.crimeReduction}` : "—"}
                  </Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>LAW</Text>
                  <Text style={[s.statVal, { color: mission.lawBonus > 0 ? "#4FC3F7" : Colors.textMuted }]}>
                    {mission.lawBonus > 0 ? `+${mission.lawBonus}` : "—"}
                  </Text>
                </View>
              </View>
                <Pressable
                  testID={`law-op-dispatch-${mission.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Dispatch ${mission.name}: ${availabilityLabel}`}
                  accessibilityState={{ disabled: isBlocked }}
                  disabled={isBlocked}
                  style={[s.dispatchButton, isBlocked && s.dispatchButtonDisabled]}
                  onPress={() => onDispatch?.(mission)}
                >
                  <Text style={[s.dispatchText, isBlocked && s.dispatchTextDisabled]}>
                    {availabilityLabel}
                  </Text>
                </Pressable>
            </View>
          )}
        </Pressable>
        );
      })}

      <SectionHeader
        title="Available Team Roles"
        subtitle="Unit types that can be assigned to field operations"
        icon={<MaterialCommunityIcons name="account-group" size={14} color={Colors.accent} />}
      />
      {TEAM_ROLES.map(role => (
        <View key={role.id} style={s.roleCard}>
          <MaterialCommunityIcons name={role.icon as any} size={16} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.roleName}>{role.name}</Text>
            <Text style={s.roleDesc}>{role.description}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  filterRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  chipActive: { borderColor: Colors.accent, backgroundColor: "rgba(0,255,65,0.06)" },
  chipText: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.6 },
  chipTextActive: { color: Colors.accent },
  card: {
    marginHorizontal: 16, marginBottom: 6, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 12,
  },
  cardActive: { borderColor: Colors.accent + "60" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  missionName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12 },
  missionCat: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, marginTop: 2, letterSpacing: 0.6, marginLeft: 18 },
  cardRight: { alignItems: "flex-end" },
  costText: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 12 },
  riskBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, marginTop: 3 },
  riskText: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.8 },
  outcomeStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  outcome: {
    flexGrow: 1,
    minWidth: 52,
  },
  outcomeLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 0.6,
  },
  outcomeValue: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    marginTop: 2,
  },
  availability: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: 1,
  },
  availabilityReady: {
    borderTopColor: Colors.accent + "35",
  },
  availabilityBlocked: {
    borderTopColor: Colors.danger + "45",
  },
  availabilityText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.7,
  },
  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  desc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  statRow: { flexDirection: "row", marginTop: 10, gap: 8 },
  stat: { flex: 1 },
  statLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.6 },
  statVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, marginTop: 2 },
  dispatchButton: {
    marginTop: 12, borderWidth: 1, borderColor: Colors.accent,
    backgroundColor: Colors.bgCard, paddingVertical: 10, paddingHorizontal: 12,
    alignItems: "center",
  },
  dispatchButtonDisabled: { borderColor: Colors.border, opacity: 0.55 },
  dispatchText: {
    color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.8,
  },
  dispatchTextDisabled: { color: Colors.textMuted },
  roleCard: {
    marginHorizontal: 16, marginBottom: 6, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 4,
    padding: 12, flexDirection: "row", alignItems: "center", gap: 10,
  },
  roleName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11 },
  roleDesc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2 },
}));

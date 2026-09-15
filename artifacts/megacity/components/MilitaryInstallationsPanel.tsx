import React, { useState, useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  MILITARY_BUILDINGS, MILITARY_BUILDING_CATEGORIES,
  type MilitaryBuildingCategory,
} from "@/engine/militaryBuildings";
import { hasCoastalAccess } from "@/engine/worldMap";
import { useGame, useGameStateSelector } from "@/context/GameContext";
import { createDefaultLogisticsState } from "@/engine/militaryOverhaul";
import { getInstallationProduction } from "@/engine/productionInfo";
import { getConstructionTicks, TRAINING_SPEED_PER_FACILITY, TRAINING_SPEED_CAP } from "@/engine/pendingConstruction";
import { computeInstallationBuildingUpkeep } from "@/engine/economyBreakdown";
import {
  academyPrerequisitesMet,
  getAcademy,
  getAcademyCourse,
  getAcademyGraduationRate,
  getAcademyQuality,
} from "@/engine/militaryAcademies";

const CAT_ICONS: Record<MilitaryBuildingCategory, string> = {
  command: "crown",
  training: "sword",
  manufacturing: "factory",
  research: "flask",
  logistics: "truck",
  defense: "shield",
  security: "lock",
  aerospace: "rocket-launch",
  naval: "ferry",
  special_projects: "atom",
};

export default function MilitaryInstallationsPanel() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const [filter, setFilter] = useState<MilitaryBuildingCategory | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filterScrollRef = useHorizontalWheelScroll();
  const startingRegion = useGameStateSelector((s) => s.startingRegion);
  const coastalAccess = hasCoastalAccess(startingRegion);
  const { buildMilitaryInstallation, startAcademyCourse, assignAcademyInstructor } = useGame();
  const credits = useGameStateSelector((s) => s.resources.credits);
  // Task #500: military installations are timed orders now — surface the
  // in-flight ones so a second tap doesn't look like the first vanished.
  const pendingConstructions = useGameStateSelector((s) => s.pendingConstructions);
  const pendingById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of pendingConstructions ?? []) {
      if (p.kind === "military") m[p.buildingKey] = (m[p.buildingKey] ?? 0) + p.count;
    }
    return m;
  }, [pendingConstructions]);
  const log = useGameStateSelector((s) => s.militaryOverhaul?.logistics) ?? createDefaultLogisticsState();
  const built = log.installationsBuilt ?? {};
  const fullState = useGameStateSelector((s) => s);
  const ownedTotal = useMemo(() => Object.values(built).reduce((a, b) => a + (b || 0), 0), [built]);
  // Task #473: same function the engine uses to charge base upkeep each tick.
  const installationUpkeep = useMemo(() => computeInstallationBuildingUpkeep(built), [built]);
  const garrisonCoveragePct = Math.round((log.garrisonCoverage ?? 1) * 100);
  const garrisonColor =
    garrisonCoveragePct >= 90 ? Colors.accent :
    garrisonCoveragePct >= 60 ? Colors.warning : Colors.danger;

  const filtered = useMemo(
    () => filter === "all" ? MILITARY_BUILDINGS : MILITARY_BUILDINGS.filter(b => b.category === filter),
    [filter]
  );

  const catKeys = Object.keys(MILITARY_BUILDING_CATEGORIES) as MilitaryBuildingCategory[];

  const availableCount = useMemo(
    () => coastalAccess ? MILITARY_BUILDINGS.length : MILITARY_BUILDINGS.filter(b => b.category !== "naval").length,
    [coastalAccess]
  );
  const totalDefenseBonus = useMemo(
    () => MILITARY_BUILDINGS.filter(b => coastalAccess || b.category !== "naval").reduce((sum, b) => sum + b.defenseBonus, 0),
    [coastalAccess]
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.rootContent} showsVerticalScrollIndicator={false}>
      <View style={s.summaryRow}>
        <View style={s.summaryBox}>
          <Text style={s.summaryVal}>
            {availableCount}
            {availableCount !== MILITARY_BUILDINGS.length && (
              <Text style={s.summaryValMuted}>/{MILITARY_BUILDINGS.length}</Text>
            )}
          </Text>
          <Text style={s.summaryLabel}>INSTALLATIONS</Text>
        </View>
        <View style={s.summaryBox}>
          <Text style={s.summaryVal}>{catKeys.length}</Text>
          <Text style={s.summaryLabel}>CATEGORIES</Text>
        </View>
        <View style={s.summaryBox}>
          <Text style={[s.summaryVal, { color: Colors.accent }]}>+{totalDefenseBonus}</Text>
          <Text style={s.summaryLabel}>MAX DEF BONUS</Text>
        </View>
      </View>

      <View style={s.summaryRow}>
        <View style={s.summaryBox}>
          <Text style={[s.summaryVal, { color: ownedTotal > 0 ? Colors.accent : Colors.textMuted }]}>{ownedTotal}</Text>
          <Text style={s.summaryLabel}>OWNED</Text>
        </View>
        <View style={s.summaryBox}>
          <Text style={[s.summaryVal, { color: garrisonColor }]}>{garrisonCoveragePct}%</Text>
          <Text style={s.summaryLabel}>GARRISON MANNED</Text>
        </View>
        <View style={s.summaryBox}>
          <Text style={[s.summaryVal, { color: Colors.warning }]}>+{Math.round(log.installationDefenseBonus ?? 0)}</Text>
          <Text style={s.summaryLabel}>ACTIVE DEF</Text>
        </View>
        <View style={s.summaryBox}>
          <Text style={[s.summaryVal, { color: installationUpkeep > 0 ? Colors.danger : Colors.textMuted }]}>
            {installationUpkeep > 0 ? `-${installationUpkeep.toLocaleString()}` : "0"}
          </Text>
          <Text style={s.summaryLabel}>UPKEEP/TICK</Text>
        </View>
      </View>

      {ownedTotal > 0 && garrisonCoveragePct < 90 && (
        <View style={s.warnBanner}>
          <MaterialCommunityIcons name="account-alert" size={11} color={Colors.warning} />
          <Text style={s.warnText}>
            UNDER-MANNED — {garrisonCoveragePct}% GARRISON COVERAGE. UNMANNED INSTALLATIONS GIVE REDUCED DEFENSE. RECRUIT MORE PERSONNEL.
          </Text>
        </View>
      )}

      {!coastalAccess && (filter === "all" || filter === "naval") && (
        <View style={s.warnBanner}>
          <MaterialCommunityIcons name="alert" size={11} color={Colors.warning} />
          <Text style={s.warnText}>NO COASTAL ACCESS — NAVAL INSTALLATIONS UNAVAILABLE</Text>
        </View>
      )}

      <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={s.filterRow}>
        <Pressable onPress={() => setFilter("all")} style={[s.chip, filter === "all" && s.chipActive]}>
          <Text style={[s.chipText, filter === "all" && s.chipTextActive]}>ALL</Text>
        </Pressable>
        {catKeys.map(cat => {
          const count = MILITARY_BUILDINGS.filter(b => b.category === cat).length;
          return (
            <Pressable key={cat} onPress={() => setFilter(filter === cat ? "all" : cat)} style={[s.chip, filter === cat && s.chipActive]}>
              <MaterialCommunityIcons name={CAT_ICONS[cat] as any} size={10} color={filter === cat ? Colors.accent : Colors.textMuted} />
              <Text style={[s.chipText, filter === cat && s.chipTextActive]}>
                {MILITARY_BUILDING_CATEGORIES[cat]} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.map(bldg => {
        const navalLocked = bldg.category === "naval" && !coastalAccess;
        const academy = getAcademy(bldg.id);
        const academyLocked = Boolean(academy && !academyPrerequisitesMet(fullState, academy));
        const owned = built[bldg.id] ?? 0;
        const canAfford = credits >= bldg.buildCost && !academyLocked;
        const prod = getInstallationProduction(bldg.id);
        return (
          <Pressable
            key={bldg.id}
            onPress={navalLocked ? undefined : () => setExpanded(expanded === bldg.id ? null : bldg.id)}
            style={[s.card, expanded === bldg.id && s.cardActive, (navalLocked || academyLocked) && s.cardLocked]}
            disabled={navalLocked}
          >
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}>
                <View style={s.nameRow}>
                  <MaterialCommunityIcons
                    name={(navalLocked || academyLocked ? "lock" : CAT_ICONS[bldg.category]) as any}
                    size={12}
                    color={navalLocked || academyLocked ? Colors.textMuted : Colors.accent}
                  />
                  <Text style={[s.bldgName, (navalLocked || academyLocked) && s.lockedText]}>{bldg.name}</Text>
                </View>
                <Text style={[s.bldgCat, (navalLocked || academyLocked) && s.lockedText]}>
                  {academy ? `ACADEMY · ${academy.role.toUpperCase()}` : MILITARY_BUILDING_CATEGORIES[bldg.category]}
                </Text>
              </View>
              <View style={s.badgeCol}>
                {owned > 0 && (
                  <View style={s.ownedBadge}>
                    <Text style={s.ownedText}>×{owned}</Text>
                  </View>
                )}
                {navalLocked ? (
                  <View style={s.lockBadge}>
                    <Text style={s.lockBadgeText}>NO COAST</Text>
                  </View>
                ) : academyLocked ? (
                  <View style={s.lockBadge}>
                    <Text style={s.lockBadgeText}>LOCKED</Text>
                  </View>
                ) : bldg.defenseBonus > 0 ? (
                  <View style={s.defBadge}>
                    <Text style={s.defText}>+{bldg.defenseBonus} DEF</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {expanded === bldg.id && !navalLocked && (
              <View style={s.detail}>
                <Text style={s.desc}>{bldg.description}</Text>
                {academy && (
                  <View style={s.prodBox}>
                    <Text style={s.prodBoxLabel}>ACADEMY OPERATIONS</Text>
                    <Text style={s.prodBoxVal}>
                      CAPACITY {academy.capacity} / FACILITY · {getAcademyQuality(fullState, academy.id)}% QUALITY · {getAcademyGraduationRate(fullState, academy.id)}% GRADUATION
                    </Text>
                    <Text style={s.prodBoxNote}>
                      Requires {academy.prerequisiteTechnologies.join(", ")} and {academy.prerequisiteBuildings.join(", ")}. Courses consume time, credits, steel, and live supplies.
                    </Text>
                  </View>
                )}
                <View style={s.statRow}>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>BUILD COST</Text>
                    <Text style={s.statVal}>{bldg.buildCost.toLocaleString()} CR</Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>UPKEEP/TICK</Text>
                    <Text style={[s.statVal, { color: Colors.warning }]}>{bldg.upkeep.toLocaleString()} CR</Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>PERSONNEL</Text>
                    <Text style={s.statVal}>{bldg.personnel}</Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>DEFENSE</Text>
                    <Text style={[s.statVal, { color: bldg.defenseBonus > 0 ? Colors.accent : Colors.textMuted }]}>
                      {bldg.defenseBonus > 0 ? `+${bldg.defenseBonus}` : "—"}
                    </Text>
                  </View>
                </View>
                {prod && (
                  <View style={s.prodBox}>
                    <Text style={s.prodBoxLabel}>PRODUCES / TICK</Text>
                    <Text style={s.prodBoxVal}>{prod.outputs.map((o) => `${o.qty} ${o.name}`).join(" · ")}</Text>
                    <Text style={s.prodBoxNote}>at full manning · scales with garrison coverage ({garrisonCoveragePct}%)</Text>
                  </View>
                )}
                <Pressable
                  onPress={() => { if (canAfford) buildMilitaryInstallation(bldg.id, bldg.buildCost); }}
                  disabled={!canAfford}
                  style={[s.buildBtn, !canAfford && s.buildBtnDisabled]}
                >
                  <MaterialCommunityIcons name="hammer-wrench" size={12} color={canAfford ? Colors.bg : Colors.textMuted} />
                  <Text style={[s.buildBtnText, !canAfford && { color: Colors.textMuted }]}>
                    {canAfford ? `BUILD — ${bldg.buildCost.toLocaleString()} CR` : `NEED ${bldg.buildCost.toLocaleString()} CR`}
                  </Text>
                </Pressable>
                {academy && owned > 0 && (
                  <>
                    <Pressable
                      onPress={() => assignAcademyInstructor(academy.id)}
                      style={[s.buildBtn, { borderColor: Colors.accent }]}
                    >
                      <Text style={[s.buildBtnText, { color: Colors.accent }]}>ASSIGN ELIGIBLE INSTRUCTOR</Text>
                    </Pressable>
                    {academy.courseIds.map((courseId) => {
                      const course = getAcademyCourse(courseId);
                      const queued = (pendingConstructions ?? []).filter((order) => order.kind === "academy" && order.courseId === courseId).length;
                      if (!course) return null;
                      return (
                        <Pressable
                          key={courseId}
                          onPress={() => startAcademyCourse(courseId)}
                          style={[s.buildBtn, { borderColor: Colors.warning }]}
                          accessibilityLabel={`Start ${course.name} academy course`}
                        >
                          <Text style={[s.buildBtnText, { color: Colors.warning }]}>
                            START {course.name.toUpperCase()} · {course.credits.toLocaleString()} CR · {course.ticks} TICKS
                          </Text>
                          <Text style={s.ownedNote}>Qualification output: {course.qualificationId} · {queued} queued</Text>
                        </Pressable>
                      );
                    })}
                  </>
                )}
                {academyLocked && (
                  <Text style={[s.ownedNote, { color: Colors.warning }]}>
                    Locked until the listed research and prerequisite facility are complete.
                  </Text>
                )}
                <Text style={s.ownedNote}>
                  Build time: {getConstructionTicks("military", bldg.id)} ticks
                </Text>
                {bldg.category === "training" && (
                  <Text style={[s.ownedNote, { color: Colors.accent }]}>
                    Speeds troop training: -{Math.round(TRAINING_SPEED_PER_FACILITY * 100)}% per facility built (max -{Math.round(TRAINING_SPEED_CAP * 100)}%)
                  </Text>
                )}
                {(pendingById[bldg.id] ?? 0) > 0 && (
                  <Text style={[s.ownedNote, { color: Colors.warning }]}>
                    {pendingById[bldg.id]} under construction
                  </Text>
                )}
                {owned > 0 && (
                  <Text style={s.ownedNote}>
                    {owned} built · needs {(bldg.personnel * owned).toLocaleString()} personnel to fully man
                  </Text>
                )}
              </View>
            )}
          </Pressable>
        );
      })}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1 },
  rootContent: { paddingBottom: 16 },
  summaryRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, gap: 8 },
  summaryBox: {
    flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, padding: 10, alignItems: "center",
  },
  summaryVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 16 },
  summaryValMuted: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  summaryLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 7, letterSpacing: 0.8, marginTop: 2 },
  warnBanner: {
    marginHorizontal: 16, marginTop: 10, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.warning + "60", borderStyle: "dashed",
    borderRadius: 4, backgroundColor: Colors.warning + "0E",
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  warnText: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8, flex: 1 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
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
  cardLocked: { opacity: 0.55, borderStyle: "dashed" },
  lockedText: { color: Colors.textMuted },
  lockBadge: {
    borderWidth: 1, borderColor: Colors.warning, borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  lockBadgeText: { color: Colors.warning, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bldgName: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12 },
  bldgCat: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 8, marginTop: 2, letterSpacing: 0.6, marginLeft: 18 },
  badgeCol: { alignItems: "flex-end", gap: 4 },
  defBadge: {
    borderWidth: 1, borderColor: Colors.accent, borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  defText: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8 },
  ownedBadge: {
    backgroundColor: Colors.accent, borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  ownedText: { color: Colors.bg, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
  buildBtn: {
    marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.accent, borderRadius: 4, paddingVertical: 9,
  },
  buildBtnDisabled: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  buildBtnText: { color: Colors.bg, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 },
  ownedNote: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 6, textAlign: "center" },
  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  desc: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  prodBox: { marginTop: 10, backgroundColor: Colors.accent + "12", borderWidth: 1, borderColor: Colors.accent + "40", borderRadius: 4, padding: 8 },
  prodBoxLabel: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 0.8 },
  prodBoxVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, marginTop: 3 },
  prodBoxNote: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 3 },
  statRow: { flexDirection: "row", marginTop: 10, gap: 8 },
  stat: { flex: 1 },
  statLabel: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.6 },
  statVal: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 12, marginTop: 2 },
}));

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
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

import GameModal from "@/components/GameModal";
import SectionHeader from "@/components/SectionHeader";
import TutorialHint from "@/components/TutorialHint";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import {
  MEGA_PROJECTS,
  canStartProject,
  getScaledPlanningCost,
  getScaledConstructionCost,
  getScaledSteelCost,
  getMegaProjectCostScale,
  type MegaProjectId,
  type MegaProjectInstance,
} from "@/engine/megaProjects";
import type { GameState } from "@/engine/types";

type MciName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function MegaProjectsScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, startMegaProject, advanceMegaProject } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const projects = state.megaProjects ?? [];
  const activeCount = projects.filter(p => p.phase === "construction" || p.phase === "planning").length;
  const completedCount = projects.filter(p => p.phase === "operational").length;

  const getProjectInstance = (id: MegaProjectId): MegaProjectInstance | undefined =>
    projects.find(p => p.projectId === id);

  const handleStart = (projectId: MegaProjectId) => {
    const def = MEGA_PROJECTS.find(p => p.id === projectId)!;
    const { eligible, reasons } = canStartProject(state, projectId);

    if (!eligible) {
      showModal("REQUIREMENTS NOT MET", reasons.join("\n\n"), [{ text: "OK" }]);
      return;
    }

    const planning = getScaledPlanningCost(state, def);
    const constr = getScaledConstructionCost(state, def);
    const steel = getScaledSteelCost(state, def);
    const scale = getMegaProjectCostScale(state);
    const scaleNote = scale > 1.05 ? `\n\n(Costs scaled ${scale.toFixed(2)}x for a megacity of this size)` : "";

    showModal(
      "BEGIN PLANNING",
      `Authorize planning phase for ${def.name}?\n\nPlanning cost: ${planning.toLocaleString()} credits\n\nOnce planning completes, you will need to fund construction:\n• ${constr.toLocaleString()} credits\n• ${steel.toLocaleString()} steel\n\nEstimated construction time: ${def.ticksToComplete} ticks${scaleNote}`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: `AUTHORIZE (${planning.toLocaleString()} CR)`,
          style: "destructive",
          onPress: () => { startMegaProject(projectId); },
        },
      ]
    );
  };

  const handleAdvance = (projectId: MegaProjectId) => {
    const def = MEGA_PROJECTS.find(p => p.id === projectId)!;
    const constr = getScaledConstructionCost(state, def);
    const steel = getScaledSteelCost(state, def);

    if (state.resources.credits < constr || state.resources.steel < steel) {
      showModal(
        "INSUFFICIENT RESOURCES",
        `Construction requires:\n• ${constr.toLocaleString()} credits (have ${state.resources.credits.toLocaleString()})\n• ${steel.toLocaleString()} steel (have ${state.resources.steel})`,
        [{ text: "OK" }]
      );
      return;
    }

    showModal(
      "BEGIN CONSTRUCTION",
      `Commit resources to build ${def.name}?\n\n• ${constr.toLocaleString()} credits\n• ${steel.toLocaleString()} steel\n• ${def.workforceRequired.toLocaleString()} workers assigned\n\nEstimated time: ${def.ticksToComplete} ticks\n\nThis cannot be cancelled once started.`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "BEGIN CONSTRUCTION",
          style: "destructive",
          onPress: () => { advanceMegaProject(projectId); },
        },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="city-variant-outline" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>MEGA-PROJECTS</Text>
        <Text style={styles.headerCount}>{completedCount} complete / {activeCount} building</Text>
      </View>

      <View style={styles.resourceStrip}>
        <Text style={styles.resLabel}>CREDITS</Text>
        <Text style={styles.resValue}>{state.resources.credits.toLocaleString()}</Text>
        <View style={styles.resSpacer} />
        <Text style={styles.resLabel}>STEEL</Text>
        <Text style={styles.resValue}>{state.resources.steel.toLocaleString()}</Text>
        <View style={styles.resSpacer} />
        <Text style={styles.resLabel}>POP</Text>
        <Text style={styles.resValue}>{state.cityStats.population.toLocaleString()}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TutorialHint
          id="megaprojects_intro"
          message="Mega projects take many ticks to plan and many more to build. They reshape the city in ways no normal building can. Queue them carefully — once committed, the credits are gone."
        />
        {completedCount > 0 && (
          <>
            <SectionHeader
              title="Operational"
              icon={<MaterialCommunityIcons name="check-decagram" size={14} color={Colors.accent} />}
            />
            {MEGA_PROJECTS.filter(def => {
              const inst = getProjectInstance(def.id);
              return inst?.phase === "operational";
            }).map(def => (
              <ProjectCard
                key={def.id}
                def={def}
                instance={getProjectInstance(def.id)!}
              />
            ))}
          </>
        )}

        {activeCount > 0 && (
          <>
            <SectionHeader
              title="Under Construction"
              icon={<MaterialCommunityIcons name="crane" size={14} color={Colors.warning} />}
            />
            {MEGA_PROJECTS.filter(def => {
              const inst = getProjectInstance(def.id);
              return inst && (inst.phase === "construction" || inst.phase === "planning");
            }).map(def => {
              const inst = getProjectInstance(def.id)!;
              return (
                <ActiveProjectCard
                  key={def.id}
                  def={def}
                  instance={inst}
                  state={state}
                  onAdvance={() => handleAdvance(def.id)}
                />
              );
            })}
          </>
        )}

        <SectionHeader
          title="Available Projects"
          icon={<MaterialCommunityIcons name="clipboard-list" size={14} color={Colors.accent} />}
        />
        {MEGA_PROJECTS.filter(def => !getProjectInstance(def.id)).map(def => {
          const { eligible } = canStartProject(state, def.id);
          return (
            <AvailableProjectCard
              key={def.id}
              def={def}
              eligible={eligible}
              state={state}
              onStart={() => handleStart(def.id)}
            />
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

function ProjectCard({ def, instance }: { def: typeof MEGA_PROJECTS[0]; instance: MegaProjectInstance }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.card, styles.cardOperational]}>
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons name={def.icon as MciName} size={22} color={Colors.warning} />
        <View style={styles.cardTitleWrap}>
          <Text style={[styles.cardName, { color: Colors.warning }]}>{def.name}</Text>
          <View style={[styles.phaseBadge, { backgroundColor: "rgba(0,200,80,0.15)" }]}>
            <Text style={[styles.phaseBadgeText, { color: "#00c850" }]}>OPERATIONAL</Text>
          </View>
        </View>
      </View>
      <Text style={styles.cardDesc}>{def.description}</Text>
      <View style={styles.activeBonusHeader}>
        <Feather name="activity" size={11} color={Colors.accent} />
        <Text style={styles.activeBonusTitle}>ACTIVE BONUSES</Text>
      </View>
      <View style={styles.effectsWrap}>
        {def.completionEffects.map((e, i) => (
          <View key={i} style={styles.effectRow}>
            <Feather name="zap" size={12} color={Colors.accent} />
            <Text style={styles.effectLabel}>{e.label}</Text>
            <Text style={styles.effectDesc}> — {e.description}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ActiveProjectCard({
  def,
  instance,
  state,
  onAdvance,
}: {
  def: typeof MEGA_PROJECTS[0];
  instance: MegaProjectInstance;
  state: GameState;
  onAdvance: () => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const isPlanning = instance.phase === "planning";
  const progress = isPlanning
    ? Math.min(100, (instance.progress / 10) * 100)
    : Math.min(100, (instance.progress / instance.totalRequired) * 100);

  return (
    <View style={[styles.card, styles.cardActive]}>
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons name={def.icon as MciName} size={22} color={Colors.warning} />
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardName}>{def.name}</Text>
          <View style={[styles.phaseBadge, isPlanning
            ? { backgroundColor: "rgba(255,168,0,0.15)" }
            : { backgroundColor: "rgba(60,130,255,0.15)" }
          ]}>
            <Text style={[styles.phaseBadgeText, isPlanning
              ? { color: Colors.warning }
              : { color: "#3c82ff" }
            ]}>
              {isPlanning ? "PLANNING" : "CONSTRUCTION"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {isPlanning
            ? `Planning: ${instance.progress}/10 ticks`
            : `${instance.progress}/${instance.totalRequired} ticks (${Math.round(progress)}%)`
          }
        </Text>
      </View>

      {isPlanning && instance.progress >= 10 && (
        <Pressable
          onPress={onAdvance}
          style={({ pressed }) => [styles.advanceBtn, pressed && styles.advanceBtnPressed]}
        >
          <MaterialCommunityIcons name="arrow-right-bold" size={16} color="#000" />
          <Text style={styles.advanceBtnText}>
            BEGIN CONSTRUCTION ({getScaledConstructionCost(state, def).toLocaleString()} CR + {getScaledSteelCost(state, def)} STEEL)
          </Text>
        </Pressable>
      )}

      {isPlanning && instance.progress < 10 && (
        <Text style={styles.planningHint}>Planning in progress... ({10 - instance.progress} ticks remaining)</Text>
      )}
    </View>
  );
}

function AvailableProjectCard({
  def,
  eligible,
  state,
  onStart,
}: {
  def: typeof MEGA_PROJECTS[0];
  eligible: boolean;
  state: GameState;
  onStart: () => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onStart}
      style={({ pressed }) => [
        styles.card,
        !eligible && styles.cardLocked,
        pressed && eligible && styles.cardPressed,
      ]}
      disabled={!eligible}
    >
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons
          name={def.icon as MciName}
          size={22}
          color={eligible ? Colors.accent : Colors.textMuted}
        />
        <View style={styles.cardTitleWrap}>
          <Text style={[styles.cardName, !eligible && { color: Colors.textMuted }]}>{def.name}</Text>
          <Text style={styles.cardDesc}>{def.description}</Text>
        </View>
      </View>

      <View style={styles.reqWrap}>
        <ReqItem
          met={state.cityStats.population >= def.requirements.minPopulation}
          label={`Pop ≥ ${def.requirements.minPopulation.toLocaleString()}`}
        />
        <ReqItem
          met={state.resources.credits >= def.requirements.minCredits}
          label={`Credits ≥ ${def.requirements.minCredits.toLocaleString()}`}
        />
        <ReqItem
          met={state.resources.steel >= def.requirements.minSteel}
          label={`Steel ≥ ${def.requirements.minSteel}`}
        />
        {def.requirements.requiredTech?.map(techId => (
          <ReqItem
            key={techId}
            met={(state.unlockedTechnologies ?? []).includes(techId)}
            label={`Tech: ${techId.replace(/_/g, " ")}`}
          />
        ))}
        {def.requirements.requiredBuildings && Object.entries(def.requirements.requiredBuildings).map(([bld, count]) => (
          <ReqItem
            key={bld}
            met={(state.buildings[bld] ?? 0) >= count}
            label={`${count}x ${bld}`}
          />
        ))}
      </View>

      <View style={styles.costRow}>
        <Text style={styles.costLabel}>Planning: {getScaledPlanningCost(state, def).toLocaleString()} CR</Text>
        <Text style={styles.costLabel}>Build: {getScaledConstructionCost(state, def).toLocaleString()} CR + {getScaledSteelCost(state, def)} Steel</Text>
      </View>
      {getMegaProjectCostScale(state) > 1.05 && (
        <Text style={[styles.costLabel, { color: Colors.warning, marginTop: 4 }]}>Costs scaled {getMegaProjectCostScale(state).toFixed(2)}x for megacity size</Text>
      )}

      <View style={styles.effectsWrap}>
        {def.completionEffects.map((e, i) => (
          <View key={i} style={styles.effectRow}>
            <Feather name="zap" size={11} color={eligible ? Colors.accent : Colors.textMuted} />
            <Text style={[styles.effectLabel, !eligible && { color: Colors.textMuted }]}>{e.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function ReqItem({ met, label }: { met: boolean; label: string }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.reqItem}>
      <Feather
        name={met ? "check-circle" : "circle"}
        size={12}
        color={met ? Colors.accent : Colors.danger}
      />
      <Text style={[styles.reqText, met && { color: Colors.text }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 2,
    flex: 1,
  },
  headerCount: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  resourceStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  resLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginRight: 4,
  },
  resValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.warning,
  },
  resSpacer: { width: 16 },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, gap: Platform.OS === "web" ? 10 : 12 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  cardOperational: {
    borderColor: Colors.warning,
  },
  cardActive: {
    borderColor: Colors.accent,
  },
  cardLocked: {
    opacity: 0.6,
  },
  cardPressed: {
    opacity: 0.8,
    borderColor: Colors.accent,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 6,
  },
  cardTitleWrap: { flex: 1 },
  cardName: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.text,
  },
  cardDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cardPhase: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.accent,
    letterSpacing: 1,
    marginTop: 2,
  },
  phaseBadge: {
    alignSelf: "flex-start",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 3,
  },
  phaseBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  activeBonusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    marginBottom: 4,
  },
  activeBonusTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.accent,
    letterSpacing: 1,
  },
  effectDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  flavorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: "italic",
    marginBottom: 8,
  },
  reqWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  reqItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reqText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  costRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 6,
  },
  costLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
  },
  effectsWrap: {
    gap: 3,
    marginTop: 4,
  },
  effectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  effectLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
  },
  progressWrap: { marginTop: 6 },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  progressText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  advanceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.warning,
    borderRadius: 6,
    paddingVertical: 10,
    marginTop: 8,
  },
  advanceBtnPressed: { opacity: 0.8 },
  advanceBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#000",
    letterSpacing: 0.5,
  },
  planningHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: "italic",
    marginTop: 6,
  },
}));

export default withScreenBoundary(MegaProjectsScreen, "megaprojects");

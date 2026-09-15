import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
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

import SectionHeader from "@/components/SectionHeader";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGameState } from "@/context/GameContext";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import {
  ALL_BASE_ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORY_LABELS,
  type AchievementCategory,
  type AchievementDef,
} from "@/engine/achievements";

const CATEGORY_ICONS: Record<AchievementCategory, { name: string; lib: "feather" | "mci" }> = {
  milestones: { name: "flag", lib: "feather" },
  construction: { name: "home", lib: "feather" },
  population: { name: "users", lib: "feather" },
  economy: { name: "trending-up", lib: "feather" },
  military: { name: "shield", lib: "feather" },
  crime: { name: "alert-triangle", lib: "feather" },
  diplomacy: { name: "globe", lib: "feather" },
  darkHumor: { name: "skull-crossbones", lib: "mci" },
  exploration: { name: "compass", lib: "feather" },
  endgame: { name: "star", lib: "feather" },
  atrocity: { name: "alert-octagon", lib: "feather" },
  civilRights: { name: "book-open", lib: "feather" },
  religion: { name: "sun", lib: "feather" },
  technology: { name: "cpu", lib: "feather" },
  biosphere: { name: "feather", lib: "feather" },
};

function CatIcon({ cat, size, color }: { cat: AchievementCategory; size: number; color: string }) {
  const cfg = CATEGORY_ICONS[cat];
  if (cfg.lib === "mci") return <MaterialCommunityIcons name={cfg.name as any} size={size} color={color} />;
  return <Feather name={cfg.name as any} size={size} color={color} />;
}

function AchievementsScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state } = useGameState();
  const topInset = Platform.OS === "web" ? 0 : insets.top;

  const unlocked = useMemo(() => new Set(state.unlockedAchievements ?? []), [state.unlockedAchievements]);
  const [selectedCat, setSelectedCat] = useState<AchievementCategory | "all">("all");
  const catScrollRef = useHorizontalWheelScroll();

  const categories = Object.keys(ACHIEVEMENT_CATEGORY_LABELS) as AchievementCategory[];

  const filtered = useMemo(() => {
    if (selectedCat === "all") return ALL_BASE_ACHIEVEMENTS;
    return ALL_BASE_ACHIEVEMENTS.filter((a) => a.category === selectedCat);
  }, [selectedCat]);

  const totalUnlocked = ALL_BASE_ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;
  const pct = Math.round((totalUnlocked / ALL_BASE_ACHIEVEMENTS.length) * 100);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="trophy-outline" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>ACHIEVEMENTS</Text>
        <Text style={styles.headerCount}>{totalUnlocked}/{ALL_BASE_ACHIEVEMENTS.length}</Text>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.progressText}>{pct}% COMPLETE</Text>
      </View>

      <ScrollView ref={catScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.catBar} contentContainerStyle={styles.catBarContent}>
        <Pressable
          onPress={() => setSelectedCat("all")}
          style={[styles.catChip, selectedCat === "all" && styles.catChipActive]}
        >
          <Feather name="list" size={10} color={selectedCat === "all" ? Colors.bg : Colors.textMuted} />
          <Text style={[styles.catChipText, selectedCat === "all" && styles.catChipTextActive]}>ALL</Text>
        </Pressable>
        {categories.map((cat) => {
          const catCount = ALL_BASE_ACHIEVEMENTS.filter((a) => a.category === cat && unlocked.has(a.id)).length;
          const catTotal = ALL_BASE_ACHIEVEMENTS.filter((a) => a.category === cat).length;
          return (
            <Pressable
              key={cat}
              onPress={() => setSelectedCat(cat)}
              style={[styles.catChip, selectedCat === cat && styles.catChipActive]}
            >
              <CatIcon cat={cat} size={10} color={selectedCat === cat ? Colors.bg : Colors.textMuted} />
              <Text style={[styles.catChipText, selectedCat === cat && styles.catChipTextActive]}>
                {ACHIEVEMENT_CATEGORY_LABELS[cat]}
              </Text>
              <Text style={[styles.catChipCount, selectedCat === cat && { color: Colors.bg }]}>
                {catCount}/{catTotal}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {selectedCat !== "all" && (
          <SectionHeader
            title={ACHIEVEMENT_CATEGORY_LABELS[selectedCat]}
            subtitle={`${ALL_BASE_ACHIEVEMENTS.filter((a) => a.category === selectedCat && unlocked.has(a.id)).length}/${ALL_BASE_ACHIEVEMENTS.filter((a) => a.category === selectedCat).length} unlocked`}
            icon={<CatIcon cat={selectedCat} size={14} color={Colors.accent} />}
          />
        )}

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="award" size={28} color={Colors.textMuted + "60"} />
            <Text style={styles.emptyTitle}>NO ENTRIES IN THIS CATEGORY</Text>
            <Text style={styles.emptyDesc}>
              Achievements in this category have not been seeded yet, or your filter has hidden them all. Try the ALL tab to see everything available.
            </Text>
          </View>
        ) : (
          filtered.map((ach) => (
            <AchievementRow key={ach.id} achievement={ach} isUnlocked={unlocked.has(ach.id)} />
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

function AchievementRow({ achievement: ach, isUnlocked }: { achievement: AchievementDef; isUnlocked: boolean }) {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.achRow, isUnlocked && styles.achRowUnlocked]}>
      <View style={[styles.achIconWrap, isUnlocked && styles.achIconWrapUnlocked]}>
        <Feather
          name={ach.icon as any}
          size={16}
          color={isUnlocked ? Colors.bg : Colors.textMuted + "60"}
        />
      </View>
      <View style={styles.achTextCol}>
        <Text style={[styles.achTitle, isUnlocked && styles.achTitleUnlocked]}>{ach.title}</Text>
        <Text style={[styles.achDesc, isUnlocked && styles.achDescUnlocked]}>{ach.description}</Text>
      </View>
      {isUnlocked && (
        <MaterialCommunityIcons name="check-circle" size={16} color={Colors.accent} />
      )}
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.border,
    borderRadius: 4,
    marginTop: 6,
  },
  emptyTitle: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11,
    letterSpacing: 1.4,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
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
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  progressText: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 4,
    textAlign: "right",
  },
  catBar: {
    maxHeight: 42,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  catBarContent: {
    paddingHorizontal: 12,
    gap: 6,
    alignItems: "center",
    paddingVertical: 6,
  },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  catChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  catChipText: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    letterSpacing: 0.5,
  },
  catChipTextActive: {
    color: Colors.bg,
  },
  catChipCount: {
    color: Colors.textMuted + "80",
    fontFamily: "Inter_400Regular",
    fontSize: 8,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: 6, paddingBottom: 20 },
  achRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
    opacity: 0.5,
  },
  achRowUnlocked: {
    opacity: 1,
    backgroundColor: "rgba(0,255,65,0.03)",
  },
  achIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.bgSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  achIconWrapUnlocked: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  achTextCol: {
    flex: 1,
  },
  achTitle: {
    color: Colors.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  achTitleUnlocked: {
    color: Colors.text,
  },
  achDesc: {
    color: Colors.textMuted + "80",
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  achDescUnlocked: {
    color: Colors.textSecondary,
  },
}));

export default withScreenBoundary(AchievementsScreen, "achievements");

import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import GameModal from "@/components/GameModal";
import SectionHeader from "@/components/SectionHeader";
import ActionCostTimingReadout from "@/components/ActionCostTimingReadout";
import { useTheme } from "@/context/ThemeContext";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import {
  formatActionCostTimingSummary,
  normalizeActionCostTiming,
} from "@/engine/actionCostTiming";
import {
  FAITH_DEFS,
  FAITH_IDS,
  FAITH_STANCES,
  RENUNCIATION_COOLDOWN_TICKS,
  RENUNCIATION_COST_CREDITS,
  RENUNCIATION_HAPPINESS_HIT,
  checkLeaderCultEligibility,
  computeCityFaithShares,
  type FaithId,
  type FaithStance,
} from "@/engine/faiths";

const ELIG_REASON: Record<string, string> = {
  "invalid-faith": "Invalid faith.",
  "already-active": "Already leading another cult.",
  "not-sponsored": "Set stance to SPONSOR first.",
  "not-dominant": "Faith must dominate the city (≥45%) before declaration.",
  cooldown: "Recently renounced — wait for the cooldown to expire.",
};

const STANCE_LABEL: Record<FaithStance, string> = {
  sponsor: "SPONSOR",
  tolerate: "TOLERATE",
  suppress: "SUPPRESS",
};

const STANCE_BLURB: Record<FaithStance, string> = {
  sponsor: "+happiness · −unrest · +corruption · +loyalty/+crime in dominant district. Share grows.",
  tolerate: "Neutral. No drift, no city penalty, no district pressure.",
  suppress: "+law & order · +unrest · −happiness · −loyalty/−crime in dominant district. Share shrinks.",
};

// Bar colors come from FAITH_DEFS so a new faith only requires editing
// engine/faiths.ts — no UI edit needed.
const FAITH_BAR_COLOR: Record<FaithId, string> = FAITH_IDS.reduce((acc, id) => {
  acc[id] = FAITH_DEFS[id].color;
  return acc;
}, {} as Record<FaithId, string>);

export default function FaithsPanel() {
  const { colors: tc } = useTheme();
  const { state, setFaithStance, declareLeaderCult, renounceLeaderCult } = useGame();
  const { modal, showModal, hideModal } = useGameModal();
  // Pre-commit preview: a tap arms `pending`, a second tap on the same stance commits.
  // This delivers the "tradeoff preview before commit" UX the spec calls for without
  // hiding the action behind a modal.
  const [pending, setPending] = useState<Record<FaithId, FaithStance | null>>(() =>
    FAITH_IDS.reduce((acc, id) => {
      acc[id] = null;
      return acc;
    }, {} as Record<FaithId, FaithStance | null>),
  );

  const faiths = state.faiths;
  const cityShares = useMemo(() => computeCityFaithShares(state), [state]);

  if (!faiths) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: tc.textMuted }}>Faith data unavailable.</Text>
      </View>
    );
  }

  const cult = faiths.leaderCult;
  const currentTick = state.totalTicks ?? 0;
  const lastRenouncedAtTick = faiths.lastRenouncedAtTick;
  const renunciationTiming = normalizeActionCostTiming({
    kind: "instant",
    upfrontCostCredits: RENUNCIATION_COST_CREDITS,
    cooldownTicks: RENUNCIATION_COOLDOWN_TICKS,
    cooldownStarts: "activation",
    cooldownUntilTick:
      typeof lastRenouncedAtTick === "number"
        ? lastRenouncedAtTick + RENUNCIATION_COOLDOWN_TICKS
        : undefined,
    currentTick,
    availableCredits: state.resources.credits,
    cancellation: "unavailable",
    // Renunciation always completes; the runtime floors the treasury at zero
    // when it cannot cover the requested credit cost.
    activationFundsRule: "charges-up-to-available",
    runningFundsRule: "not-applicable",
  });
  const stanceTiming = normalizeActionCostTiming({
    kind: "toggleable",
    upfrontCostCredits: 0,
    phase: "available",
    cancellation: "changes-setting",
    cooldownStarts: "not-applicable",
    activationFundsRule: "no-upfront-cost",
    runningFundsRule: "not-applicable",
  });
  const leaderCultTiming = normalizeActionCostTiming({
    kind: "toggleable",
    upfrontCostCredits: 0,
    phase: cult ? "active" : undefined,
    cooldownTicks: RENUNCIATION_COOLDOWN_TICKS,
    cooldownStarts: "deactivation",
    cooldownUntilTick:
      typeof lastRenouncedAtTick === "number"
        ? lastRenouncedAtTick + RENUNCIATION_COOLDOWN_TICKS
        : undefined,
    currentTick,
    cancellation: "renunciation-required",
    activationFundsRule: "no-upfront-cost",
    runningFundsRule: "not-applicable",
  });
  const timingSummary = (timing: ReturnType<typeof normalizeActionCostTiming>) =>
    formatActionCostTimingSummary(timing).replace(/\n/g, " · ");
  const renunciationBehavior =
    "Renunciation completes even if credits are insufficient: the runtime deducts the available treasury and floors it at zero. The cooldown starts on renunciation.";

  const handleRenounce = () => {
    showModal(
      "RENOUNCE LEADER CULT?",
      `Stepping down costs ${RENUNCIATION_COST_CREDITS.toLocaleString()} cr, ${Math.abs(RENUNCIATION_HAPPINESS_HIT)} happiness, and angers the renounced faith's faction.\n\n${timingSummary(renunciationTiming)}\n\n${renunciationBehavior}\n\nYou must wait out the cooldown before you can declare any Leader Cult again.`,
      [
        { text: "CANCEL", style: "cancel" },
        { text: "RENOUNCE", style: "destructive", onPress: renounceLeaderCult },
      ],
    );
  };

  const handleDeclare = (faithId: FaithId) => {
    const elig = checkLeaderCultEligibility(state, faithId);
    if (!elig.eligible) return;
    showModal(
      "DECLARE LEADER CULT?",
      `Declare ${FAITH_DEFS[faithId].shortName} as your Leader Cult?\n\nThis declaration is free and remains active until you renounce it.\n\n${timingSummary(leaderCultTiming)}\n\nDeclaration eligibility is checked again by the runtime when you confirm.`,
      [
        { text: "CANCEL", style: "cancel" },
        { text: "DECLARE", onPress: () => declareLeaderCult(faithId) },
      ],
    );
  };

  return (
    <View>
      <SectionHeader
        title="Faiths of the Megacity"
        subtitle="Set a stance per faith. Sponsor grows belief; suppress shrinks it. Tolerate is the neutral path."
        icon={<MaterialCommunityIcons name="candle" size={14} color={tc.accent} />}
      />

      {/* Citywide stacked composition bar */}
      <View style={[styles.compositionWrap, { borderColor: tc.border, backgroundColor: tc.bgCard }]}>
        <Text style={[styles.compositionLabel, { color: tc.textMuted }]}>CITYWIDE COMPOSITION</Text>
        <View style={[styles.compositionBar, { backgroundColor: tc.bg }]}>
          {FAITH_IDS.map((id) => {
            const pct = (cityShares[id] ?? 0) * 100;
            if (pct < 0.5) return null;
            return (
              <View
                key={id}
                style={{
                  width: `${pct}%`,
                  backgroundColor: FAITH_BAR_COLOR[id],
                  height: "100%",
                }}
              />
            );
          })}
        </View>
        <View style={styles.compositionLegend}>
          {FAITH_IDS.map((id) => (
            <View key={id} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: FAITH_BAR_COLOR[id] }]} />
              <Text style={[styles.legendText, { color: tc.textSecondary }]}>
                {FAITH_DEFS[id].shortName} {Math.round((cityShares[id] ?? 0) * 100)}%
              </Text>
            </View>
          ))}
        </View>
      </View>

      {FAITH_IDS.map((id) => {
        const def = FAITH_DEFS[id];
        const stance = faiths.stances[id];
        const cityPct = Math.round((cityShares[id] ?? 0) * 100);
        const isCult = cult?.faithId === id;
        return (
          <View
            key={id}
            style={[styles.card, { borderColor: tc.border, backgroundColor: tc.bgCard }]}
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.faithName, { color: tc.text }]}>
                  {def.name.toUpperCase()}
                </Text>
                <Text style={[styles.faithDesc, { color: tc.textMuted }]}>
                  {def.description}
                </Text>
              </View>
              <View style={[styles.sharePill, { borderColor: tc.border }]}>
                <Text style={[styles.shareText, { color: tc.accent }]}>{cityPct}%</Text>
                <Text style={[styles.shareLabel, { color: tc.textMuted }]}>CITY</Text>
              </View>
            </View>

            <View style={styles.stanceRow}>
              {FAITH_STANCES.map((s) => {
                const active = stance === s;
                const armed = pending[id] === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => {
                      if (s === stance) {
                        setPending((p) => ({ ...p, [id]: null }));
                        return;
                      }
                      if (armed) {
                        setFaithStance(id, s);
                        setPending((p) => ({ ...p, [id]: null }));
                      } else {
                        setPending((p) => ({ ...p, [id]: s }));
                      }
                    }}
                    style={[
                      styles.stanceBtn,
                      { borderColor: tc.border, backgroundColor: tc.bg },
                      active && { borderColor: tc.accent, backgroundColor: tc.accent },
                      armed && { borderColor: tc.accent },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stanceBtnText,
                        { color: tc.textMuted },
                        active && { color: tc.bg },
                        armed && !active && { color: tc.accent },
                      ]}
                    >
                      {armed ? `CONFIRM ${STANCE_LABEL[s]}` : STANCE_LABEL[s]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.stanceBlurb, { color: tc.textSecondary }]}>
              {pending[id]
                ? `PREVIEW (tap again to commit) → ${STANCE_BLURB[pending[id]!]}`
                : `CURRENT → ${STANCE_BLURB[stance]}`}
            </Text>
            {pending[id] && (
              <>
                <Text style={[styles.commitmentText, { color: tc.textMuted }]}>
                  COMMITMENT PREVIEW
                </Text>
                <Text style={[styles.timingSummary, { color: tc.textSecondary }]}>
                  Free setting · active until changed · {timingSummary(stanceTiming)}
                </Text>
                <ActionCostTimingReadout model={stanceTiming} compact />
              </>
            )}

            {isCult && (
              <View style={[styles.cultBadge, { borderColor: tc.accent }]}>
                <Feather name="star" size={10} color={tc.accent} />
                <Text style={[styles.cultBadgeText, { color: tc.accent }]}>LEADER CULT</Text>
              </View>
            )}
          </View>
        );
      })}

      <SectionHeader
        title="District Composition"
        subtitle="Dominant faith in each district. Watch suppressed faiths that still hold majority — that's where heresy crackdowns come from."
        icon={<Feather name="map" size={14} color={tc.accent} />}
      />
      {state.districts.map((d) => {
        const shares = faiths.districtShares[d.id];
        if (!shares) return null;
        let topId: FaithId = FAITH_IDS[0];
        let topShare = shares[topId];
        for (const id of FAITH_IDS) {
          if (shares[id] > topShare) {
            topId = id;
            topShare = shares[id];
          }
        }
        const stance = faiths.stances[topId];
        return (
          <View
            key={d.id}
            style={[styles.districtRow, { borderColor: tc.border, backgroundColor: tc.bgCard }]}
          >
            <Text style={[styles.districtName, { color: tc.text }]} numberOfLines={1}>
              {d.name}
            </Text>
            <View style={styles.districtRight}>
              <Text style={[styles.districtFaith, { color: tc.textSecondary }]} numberOfLines={1}>
                {FAITH_DEFS[topId].shortName}
              </Text>
              <Text style={[styles.districtPct, { color: tc.accent }]}>
                {Math.round(topShare * 100)}%
              </Text>
              <Text style={[styles.districtStance, { color: tc.textMuted }]}>
                {STANCE_LABEL[stance]}
              </Text>
            </View>
          </View>
        );
      })}

      <SectionHeader
        title="Leader Cult"
        subtitle="Declare yourself the avatar of one faith. Strong bonus to that faith — strong drawbacks elsewhere."
        icon={<Feather name="star" size={14} color={tc.accent} />}
      />

      {cult ? (
        <View style={[styles.card, { borderColor: tc.accent, backgroundColor: tc.bgCard }]}>
          <Text style={[styles.faithName, { color: tc.accent }]}>
            ACTIVE: {FAITH_DEFS[cult.faithId].shortName.toUpperCase()}
          </Text>
          <Text style={[styles.faithDesc, { color: tc.textMuted }]}>
            +happiness & corruption per tick. Other faiths breed unrest unless sponsored.
          </Text>
          <Text style={[styles.commitmentText, { color: tc.textMuted }]}>ACTIVE STATUS</Text>
          <Text style={[styles.timingSummary, { color: tc.textSecondary }]}>
            Free declaration · active until renounced
          </Text>
          <ActionCostTimingReadout model={leaderCultTiming} compact />
          <Text style={[styles.commitmentText, { color: tc.textMuted }]}>
            RENUNCIATION COMMITMENT
          </Text>
          <Text style={[styles.timingSummary, { color: tc.textSecondary }]}>
            {renunciationBehavior}
          </Text>
          <ActionCostTimingReadout model={renunciationTiming} includeBehavior compact />
          <Pressable
            onPress={handleRenounce}
            style={[styles.actionBtn, { borderColor: tc.border, backgroundColor: tc.bg }]}
          >
            <Text style={[styles.actionBtnText, { color: tc.text }]}>RENOUNCE LEADER CULT</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.card, { borderColor: tc.border, backgroundColor: tc.bgCard }]}>
          <Text style={[styles.faithDesc, { color: tc.textMuted }]}>
            No Leader Cult declared. A faith must be sponsored AND dominate the city before you can crown yourself its avatar.
          </Text>
          <Text style={[styles.commitmentText, { color: tc.textMuted }]}>DECLARATION TIMING</Text>
          <Text style={[styles.timingSummary, { color: tc.textSecondary }]}>
            Free declaration · active until renounced
          </Text>
          <ActionCostTimingReadout model={leaderCultTiming} compact />
          <Text style={[styles.commitmentText, { color: tc.textMuted }]}>
            RENUNCIATION COST & COOLDOWN
          </Text>
          <Text style={[styles.timingSummary, { color: tc.textSecondary }]}>
            {renunciationBehavior}
          </Text>
          <ActionCostTimingReadout model={renunciationTiming} includeBehavior compact />
          {FAITH_IDS.map((id) => {
            const elig = checkLeaderCultEligibility(state, id);
            const locked = !elig.eligible;
            const reason = elig.eligible ? null : ELIG_REASON[elig.reason] ?? "Not eligible.";
            return (
              <View key={id} style={{ marginTop: 6 }}>
                <Pressable
                  onPress={() => {
                    if (!locked) handleDeclare(id);
                  }}
                  disabled={locked}
                  style={[
                    styles.actionBtn,
                    { borderColor: tc.border, backgroundColor: tc.bg },
                    locked && { opacity: 0.5 },
                  ]}
                >
                  <Text style={[styles.actionBtnText, { color: tc.text }]}>
                    {locked ? "LOCKED — " : "DECLARE: "}
                    {FAITH_DEFS[id].shortName.toUpperCase()}
                  </Text>
                </Pressable>
                {reason ? (
                  <Text style={[styles.lockReason, { color: tc.textMuted }]}>{reason}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8,
  },
  faithName: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  faithDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 6,
  },
  sharePill: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: "center",
    minWidth: 56,
  },
  shareText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  shareLabel: { fontSize: 8, letterSpacing: 1 },
  stanceRow: { flexDirection: "row", gap: 6, marginTop: 4, marginBottom: 6 },
  stanceBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 8,
    alignItems: "center",
  },
  stanceBtnText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1, textAlign: "center" },
  stanceBlurb: { fontSize: 10, marginTop: 2 },
  commitmentText: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1, marginTop: 8 },
  timingSummary: { fontSize: 10, lineHeight: 14, marginTop: 3 },
  lockReason: { fontSize: 10, marginTop: 4, marginLeft: 4, fontStyle: "italic" },
  compositionWrap: { borderWidth: 1, borderRadius: 4, padding: 10, marginBottom: 8 },
  compositionLabel: { fontSize: 9, letterSpacing: 1, marginBottom: 6, fontFamily: "Inter_700Bold" },
  compositionBar: { flexDirection: "row", height: 10, borderRadius: 2, overflow: "hidden" },
  compositionLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 1 },
  legendText: { fontSize: 10 },
  cultBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  cultBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 6,
  },
  actionBtnText: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 },
  districtRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
    gap: 8,
  },
  districtName: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5 },
  districtRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  districtFaith: { fontSize: 10, maxWidth: 110 },
  districtPct: { fontFamily: "Inter_700Bold", fontSize: 11, minWidth: 36, textAlign: "right" },
  districtStance: { fontSize: 9, letterSpacing: 1, minWidth: 60, textAlign: "right" },
});

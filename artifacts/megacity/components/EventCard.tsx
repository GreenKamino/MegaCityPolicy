import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import GameModal from "@/components/GameModal";
import { useTheme } from "@/context/ThemeContext";
import { useGameState } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import { useGameModal } from "@/hooks/useGameModal";
import { playHaptic } from "@/engine/haptics";
import { getOnboardingResponseNav } from "@/engine/events";
import { FREE_CHOIR_TRANSIT_CHAIN_IDS } from "@/engine/eventChains";
import { applyFreeChoirTransitScale, getFreeChoirTransitMultiplier } from "@/engine/faiths";
import {
  getRecurrenceFixTarget,
  getRecurrenceHintPhrase,
  getRecurrenceRemediation,
} from "@/engine/recurringEvents";
import { navigateToRecurrenceFix } from "@/utils/recurringNavigation";
import type { EventResponse, GameEvent } from "@/engine/types";
import { formatAdministrativeEffectLabel } from "@/engine/administrativeReadout";

// Task #218: visualize the Free Choir transit modifier on the response buttons
// of the relevant trade events so the player can see how Sponsor/Suppress will
// tilt credits/tradeIncome/food *before* committing to a response.
//   - trade_caravan_arrives already scales its responseOptions inline at
//     generate-time, so the rendered effects are correct as-is — we only need
//     to add the chip.
//   - chain stages (trade_war_blockade, free_trader_embargo) carry raw
//     base effects through stageToEvent and only get scaled inside
//     advanceEventChain, so we re-scale for display here.
const TRANSIT_INCOME_KEYS = ["credits", "tradeIncome", "food"] as const;
function responseHasTransitIncome(effects: Record<string, number | undefined>): boolean {
  for (const k of TRANSIT_INCOME_KEYS) {
    const v = effects[k];
    if (typeof v === "number" && v !== 0) return true;
  }
  return false;
}

type Props = {
  event: GameEvent;
  onDismiss: (id: string) => void;
  onRespond?: (eventId: string, response: EventResponse) => boolean | void;
  onRespondMulti?: (eventId: string, responses: EventResponse[]) => boolean | void;
};

const severityLabel = {
  low: "LOW",
  medium: "WATCH",
  high: "URGENT",
  critical: "CRITICAL",
};

function EventCardInner({ event, onDismiss, onRespond, onRespondMulti }: Props) {
  const { colors: c } = useTheme();
  const { state } = useGameState();
  const { showToast } = useToast();
  const { modal, showModal, hideModal } = useGameModal();
  const severityColor = {
    low: c.accent,
    medium: c.warning,
    high: c.danger,
    critical: "#FF0044",
  };
  const color = severityColor[event.severity];
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // A response removes its event from the active list, but the card can stay
  // mounted briefly during the state transition. Guard the commit point so a
  // double tap cannot resolve the same costly response twice.
  const [responseCooldown, setResponseCooldown] = useState(false);
  const responseCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (responseCooldownTimer.current) clearTimeout(responseCooldownTimer.current);
  }, []);
  const hasResponses = event.responseOptions && event.responseOptions.length > 0;
  const maxPicks = event.maxResponses ?? 1;
  const isMulti = maxPicks > 1;

  // Task #218: detect Free Choir transit-relevant events. The chip + scaling
  // only render when the player is actually under a non-neutral Choir stance.
  const choirMult = getFreeChoirTransitMultiplier(state);
  const isChainTransit = !!event.chainId && FREE_CHOIR_TRANSIT_CHAIN_IDS.has(event.chainId);
  const isCaravanArrives = event.id === "trade_caravan_arrives";
  const showChoirChip = choirMult !== 1 && (isChainTransit || isCaravanArrives);
  const choirStance = state.faiths?.stances?.["free-choir"];
  const choirChipPct = Math.round((choirMult - 1) * 100); // +25 sponsor, -20 suppress
  const choirChipText = `${choirChipPct > 0 ? "+" : ""}${choirChipPct}% FREE CHOIR`;
  const choirChipColor = choirChipPct > 0 ? c.accent : c.warning;
  const choirStanceLabel = choirStance === "sponsor" ? "SPONSORED" : choirStance === "suppress" ? "SUPPRESSED" : "";

  // Task #456: recurring stat-triggered crises only snooze when dismissed —
  // the spawner re-raises the same id after its re-trigger cooldown while the
  // underlying condition stays critical. Show that up front on the card so the
  // dismissal's temporary nature is visible BEFORE the player taps X (the
  // engine also posts an inbox note + ticker echo at dismissal time). Null for
  // one-off events and for recurring ones whose condition already recovered.
  const recurrencePhrase = getRecurrenceHintPhrase(state, event);
  // A repeat badge means the player has already seen and cleared this crisis.
  // Point those resurfaced cards at the durable system fix, not another
  // dismissal. Keep first-time cards focused and leave response effects alone.
  const recurrenceRemediation =
    (event.repeat || (event.returnCount ?? 0) > 0)
      ? getRecurrenceRemediation(state, event)
      : null;
  const recurrenceFixTarget = recurrenceRemediation
    ? getRecurrenceFixTarget(state, event)
    : null;

  const appointedTraits = new Set<string>();
  for (const o of state.officers ?? []) {
    if (!o.appointed) continue;
    for (const t of o.traits ?? []) appointedTraits.add(t);
  }

  const toggleSelection = (respId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(respId)) {
        next.delete(respId);
      } else if (next.size < maxPicks) {
        next.add(respId);
      }
      return next;
    });
  };

  const finishResponse = (responses: EventResponse[]) => {
    const spent = responses.reduce((total, response) => {
      const credits = response.effects.credits;
      return total + (typeof credits === "number" && credits < 0 ? Math.abs(credits) : 0);
    }, 0);
    if (spent > 0) {
      const labels = responses.map((response) => response.label).join(" + ");
      showToast(`${labels} — ${spent.toLocaleString()}c spent`, "success");
    }
    playHaptic("medium");
    setResponseCooldown(true);
    responseCooldownTimer.current = setTimeout(() => setResponseCooldown(false), 650);
  };

  const commitResponses = (responses: EventResponse[], navTarget?: string, multiCommit = false) => {
    if (responseCooldown) return;
    let accepted = false;
    if (multiCommit && onRespondMulti) {
      accepted = onRespondMulti(event.id, responses) !== false;
    } else if (multiCommit) {
      responses.forEach((r) => onRespond?.(event.id, r));
      accepted = true;
    } else {
      accepted = onRespond?.(event.id, responses[0]) !== false;
    }
    if (accepted) {
      finishResponse(responses);
    }
    // Keep onboarding deep-links consistent with the original response path:
    // navigation is attempted even when a consumer rejects the state update.
    if (navTarget) router.push(navTarget as any);
  };

  const responseEffectsText = (response: EventResponse) => {
    const rawEffects = response.effects as Record<string, number | undefined>;
    const effects = isChainTransit && choirMult !== 1
      ? applyFreeChoirTransitScale(rawEffects, state)
      : rawEffects;
    return Object.entries(effects)
      .filter(([key, value]) => key !== "districtId" && typeof value === "number" && value !== 0)
      .map(([key, value]) => {
        const prefix = (value as number) > 0 ? "+" : "";
        return `${formatAdministrativeEffectLabel(key)}: ${prefix}${value}`;
      })
      .join(", ") || "no stat changes";
  };

  const responseConfirmationMessage = (responses: EventResponse[]) => {
    const spent = responses.reduce((total, response) => {
      const rawEffects = response.effects as Record<string, number | undefined>;
      const effects = isChainTransit && choirMult !== 1
        ? applyFreeChoirTransitScale(rawEffects, state)
        : rawEffects;
      const credits = effects.credits;
      return total + (typeof credits === "number" && credits < 0 ? Math.abs(credits) : 0);
    }, 0);
    const details = responses
      .map((response) => `${response.label}: ${responseEffectsText(response)}`)
      .join("\n");
    return `${details}${spent > 0 ? `\n\nCREDIT SPEND: ${spent.toLocaleString()}c` : ""}`;
  };

  const confirmMulti = () => {
    if (selectedIds.size === 0 || responseCooldown) return;
    const chosen = event.responseOptions!.filter((r) => selectedIds.has(r.id));
    playHaptic("light");
    showModal(
      "CONFIRM RESPONSE",
      responseConfirmationMessage(chosen),
      [
        { text: "CANCEL", style: "cancel" },
        { text: `COMMIT ${chosen.length} RESPONSE${chosen.length > 1 ? "S" : ""}`, style: "destructive", onPress: () => commitResponses(chosen, undefined, true) },
      ],
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: c.bgCard, borderColor: c.border, borderLeftColor: color }]}>
      <Pressable
        onPress={() => hasResponses && setExpanded(!expanded)}
        accessibilityRole={hasResponses ? "button" : undefined}
        accessibilityLabel={hasResponses
          ? `${expanded ? "Collapse" : "Expand"} response options for ${event.title}`
          : undefined}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Feather name="alert-triangle" size={14} color={color} />
            <Text style={[styles.severity, { color }]}>
              {severityLabel[event.severity]}
            </Text>
            {event.repeat && (
              <View style={[styles.repeatBadge, { backgroundColor: c.warning + "22", borderColor: c.warning + "66" }]}>
                <Feather name="rotate-cw" size={9} color={c.warning} />
                <Text style={[styles.repeatBadgeText, { color: c.warning }]} numberOfLines={1}>
                  {event.returnCount
                    ? `RETURNED ${event.returnCount} ${event.returnCount === 1 ? "TIME" : "TIMES"}`
                    : "STILL UNRESOLVED"}
                </Text>
              </View>
            )}
            {hasResponses && (
              <View style={[styles.responseBadge, { backgroundColor: c.accent + "22", borderColor: c.accent + "44" }]}>
                <Text style={[styles.responseBadgeText, { color: c.accent }]}>
                  {isMulti ? `RESPOND (UP TO ${maxPicks})` : "RESPOND"}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            {hasResponses && (
              <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={c.textMuted} />
            )}
            <Pressable
              onPress={() => showModal(
                 "DISMISS INCIDENT?",
                 `No response will be recorded.${recurrencePhrase
                  ? ` This event will return while ${recurrencePhrase}.`
                  : ""}`,
                [
                  { text: "CANCEL", style: "cancel" },
                  { text: "DISMISS", style: "destructive", onPress: () => onDismiss(event.id) },
                ],
              )}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${event.title}`}
              style={styles.dismissBtn}
            >
              <Feather name="x" size={16} color={c.textMuted} />
            </Pressable>
          </View>
        </View>
        <Text style={[styles.title, { color: c.text }]}>{event.title}</Text>
      </Pressable>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <Text style={[styles.effects, { color: c.textMuted }]}>
           {Object.entries(event.effects)
            .filter(([k]) => k !== "districtId")
            .map(([k, v]) => {
              const prefix = (v as number) > 0 ? "+" : "";
               return `${formatAdministrativeEffectLabel(k)}: ${prefix}${v}`;
            })
            .join("  |  ")}
        </Text>
        {recurrencePhrase && (
          <View style={styles.recurrenceRow}>
            <Feather name="rotate-cw" size={9} color={c.warning} />
            <Text style={[styles.recurrenceHint, { color: c.warning }]}>
              RECURRING — IF DISMISSED, RETURNS WHILE {recurrencePhrase.toUpperCase()}
            </Text>
          </View>
        )}
        {recurrenceRemediation && (
          <View style={styles.remediationRow}>
            <Feather name="tool" size={10} color={c.accent} />
            <View style={styles.remediationContent}>
              <Text style={[styles.remediationHint, { color: c.accent }]}>
                LASTING FIX: {recurrenceRemediation}
              </Text>
              {recurrenceFixTarget && (
                <Pressable
                  onPress={() => navigateToRecurrenceFix(recurrenceFixTarget)}
                  style={({ pressed }) => [
                    styles.fixLink,
                    { borderColor: c.accent + "66", backgroundColor: c.accent + "12" },
                    pressed && styles.fixLinkPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${recurrenceFixTarget.screen === "construction"
                    ? `${recurrenceFixTarget.category} construction`
                    : recurrenceFixTarget.screen}`}
                >
                  <Feather name="external-link" size={10} color={c.accent} />
                  <Text style={[styles.fixLinkText, { color: c.accent }]}>
                    {recurrenceFixTarget.screen === "construction"
                      ? "OPEN BIOSPHERE BUILDINGS"
                      : recurrenceFixTarget.screen === "wildlands"
                        ? "OPEN WILDLANDS"
                        : "OPEN OFFICERS"}
                  </Text>
                  <Feather name="chevron-right" size={11} color={c.accent} />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      {expanded && hasResponses && (
        <View style={styles.responseSection}>
          <View style={[styles.responseDivider, { backgroundColor: c.accent + "33" }]} />
          <Text style={[styles.responseHeader, { color: c.accent }]}>
            {isMulti ? `SELECT UP TO ${maxPicks} RESPONSES` : "RESPONSE OPTIONS"}
          </Text>
          {event.responseOptions!.map((resp) => {
            const isSelected = selectedIds.has(resp.id);
            const traitLocked =
              !!resp.requiresOfficerTrait && !appointedTraits.has(resp.requiresOfficerTrait);
            // Task #218: choose what numbers to render. For chain stages we
            // re-scale here because advanceEventChain only scales at apply
            // time; for trade_caravan_arrives the generator already scaled
            // resp.effects so we render them as-is.
            const baseEffects = resp.effects as Record<string, number | undefined>;
            const displayedEffects = isChainTransit && choirMult !== 1
              ? applyFreeChoirTransitScale(baseEffects, state)
              : baseEffects;
            const showRespChoirChip = showChoirChip && responseHasTransitIncome(baseEffects);
            return (
              <Pressable
                key={resp.id}
                disabled={traitLocked || responseCooldown}
                onPress={() => {
                  if (traitLocked || responseCooldown) return;
                  if (isMulti) {
                    toggleSelection(resp.id);
                  } else {
                    playHaptic("light");
                    // Onboarding-style responses promise "OPEN <SCREEN>" —
                    // honour the deep-link after resolving the event, or the
                    // button silently does nothing visible (reported bug).
                    // Saves written before navigateTo existed carry frozen
                    // responseOptions, so fall back to the static lookup.
                    const navTarget = resp.navigateTo ?? getOnboardingResponseNav(resp.id);
                    showModal(
                      "CONFIRM RESPONSE",
                      responseConfirmationMessage([resp]),
                      [
                        { text: "CANCEL", style: "cancel" },
                        { text: "COMMIT RESPONSE", style: "destructive", onPress: () => commitResponses([resp], navTarget) },
                      ],
                    );
                  }
                }}
                style={({ pressed }) => [
                  styles.responseBtn,
                  { backgroundColor: c.bg, borderColor: c.border },
                   !traitLocked && !responseCooldown && pressed && styles.responseBtnPressed,
                  isMulti && isSelected && !traitLocked && { borderColor: c.accent, backgroundColor: c.accent + "15" },
                   (traitLocked || responseCooldown) && { opacity: 0.45 },
                ]}
              >
                <View style={styles.responseLabelRow}>
                  {traitLocked ? (
                    <Feather name="lock" size={11} color={c.textMuted} />
                  ) : isMulti ? (
                    <View style={[styles.checkbox, { borderColor: c.accent + "66" }, isSelected && { backgroundColor: c.accent, borderColor: c.accent }]}>
                      {isSelected && <Feather name="check" size={10} color={c.bg} />}
                    </View>
                  ) : (
                    <Feather name="chevron-right" size={12} color={c.accent} />
                  )}
                  <Text style={[styles.responseLabel, { color: traitLocked ? c.textMuted : c.accent }]}>{resp.label}</Text>
                  {showRespChoirChip && (
                    <View
                      style={[
                        styles.choirChip,
                        { backgroundColor: choirChipColor + "22", borderColor: choirChipColor + "66" },
                      ]}
                    >
                      <Text style={[styles.choirChipText, { color: choirChipColor }]} numberOfLines={1}>
                        {choirChipText}
                      </Text>
                    </View>
                  )}
                </View>
                {traitLocked && (
                  <Text style={[styles.responseLockHint, { color: c.warning }]}>
                    REQUIRES APPOINTED OFFICER WITH {resp.requiresOfficerTrait!.replace(/_/g, " ").toUpperCase()} TRAIT
                  </Text>
                )}
                <Text style={[styles.responseEffects, { color: c.textMuted }]}>
                  {Object.entries(displayedEffects)
                    .filter(([, v]) => typeof v === "number" && v !== 0)
                    .map(([k, v]) => {
                      const prefix = (v as number) > 0 ? "+" : "";
                      return `${formatAdministrativeEffectLabel(k)}: ${prefix}${v}`;
                    })
                    .join("  |  ")}
                </Text>
                {showRespChoirChip && choirStanceLabel && (
                  <Text style={[styles.choirHint, { color: choirChipColor }]}>
                    {choirStanceLabel} • TRANSIT YIELD ALREADY {choirChipPct > 0 ? "BOOSTED" : "REDUCED"} BY {Math.abs(choirChipPct)}%
                  </Text>
                )}
              </Pressable>
            );
          })}
          {isMulti && selectedIds.size > 0 && (
            <Pressable
              onPress={confirmMulti}
              disabled={responseCooldown}
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: c.accent + "22", borderColor: c.accent },
                pressed && !responseCooldown && styles.confirmBtnPressed,
                responseCooldown && { opacity: 0.45 },
              ]}
            >
              <Text style={[styles.confirmBtnText, { color: c.accent }]}>
                CONFIRM {selectedIds.size} RESPONSE{selectedIds.size > 1 ? "S" : ""}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  severity: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  responseBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 4,
  },
  responseBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  repeatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
  },
  repeatBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  responseLockHint: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  dismissBtn: {
    padding: 2,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    marginBottom: 6,
  },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  effects: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  recurrenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  recurrenceHint: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
    flex: 1,
  },
  remediationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 6,
  },
  remediationHint: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    lineHeight: 14,
    flex: 1,
  },
  remediationContent: {
    flex: 1,
    gap: 6,
  },
  fixLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  fixLinkPressed: {
    opacity: 0.65,
  },
  fixLinkText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  responseSection: {
    marginTop: 8,
  },
  responseDivider: {
    height: 1,
    marginBottom: 8,
  },
  responseHeader: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  responseBtn: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  responseBtnPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.98 }],
  },
  responseLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  responseLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  responseDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4,
  },
  responseEffects: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  choirChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
  },
  choirChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  choirHint: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.6,
    marginTop: 4,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderRadius: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmBtn: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  confirmBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1,
  },
  confirmBtnPressed: {
    backgroundColor: "#ffffff22",
  },
});

const EventCard = React.memo(EventCardInner);
export default EventCard;

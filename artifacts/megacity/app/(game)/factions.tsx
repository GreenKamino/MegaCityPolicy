import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
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

import CornerBrackets from "@/components/CornerBrackets";
import GameModal from "@/components/GameModal";
import Insignia from "@/components/Insignia";
import SectionHeader from "@/components/SectionHeader";
import StatBar from "@/components/StatBar";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import type { AdministrativeInstitutions, Faction, PartnerLedger } from "@/engine/types";
import {
  EVENT_ONLY_ACTION_RULES,
  type DiplomaticActionEffects,
  type EventOnlyActionId,
} from "@/engine/diplomacyEngine";
import InteractionMenu, {
  type InteractionMenuGroup,
} from "@/components/InteractionMenu";
import {
  PERSONAL_ACTIONS,
  PERSONAL_ACTOR_ACTION_ORDER,
  computeFactionActionRelationshipDeltas,
  computePersonalFactionRelationshipDeltas,
  formatEffectDeltas,
  personalActionDecayMultiplier,
  evaluatePersonalAction,
  affordabilityReason,
  FACTION_DIPLOMACY_COOLDOWNS,
  factionDiplomacyCooldownReason,
  type PersonalActionId,
  type PersonalActionHistory,
  type FactionRelationshipPreviewContext,
} from "@/engine/interactionMenu";
import {
  getCoerciveBacklashPreview,
  isCoerciveActionId,
} from "@/engine/coerciveBacklash";
import {
  computeFactionTraitMultipliers,
  listFactionTraitContributions,
  type FactionTraitContribution,
} from "@/engine/namedCharacters";
import { getTraitVisual } from "@/engine/traitIcons";
import FaithChip from "@/components/FaithChip";
import CommandScreenHeader from "@/components/CommandScreenHeader";
import AdministrativeBlocPanel from "@/components/AdministrativeBlocPanel";
import RustWardensPanel from "@/components/RustWardensPanel";
import { isInternalFaction } from "@/engine/factionScope";
import OperationalEntitySheet from "@/components/OperationalEntitySheet";
import { disclosureEvidenceLabel, getEntityDisclosure } from "@/engine/entitySheets";

const FACTION_COLOR_KEYS: Record<string, "accent" | "danger" | "info" | "warning"> = {
  law: "accent",
  criminal: "danger",
  corporate: "info",
  underclass: "warning",
};

function formatTraitLabel(trait: string): string {
  return trait
    .split("_")
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("-");
}

function formatMultMagnitude(mult: number): string {
  const pct = Math.abs((mult - 1) * 100);
  return `${Math.round(pct)}%`;
}

// Direction-encoded chip text for trait multiplier rows. The trailing
// noun ("drag", "cooling") already conveys negative direction, so a
// signed minus prefix on top of it would double-negate ("-15% loyalty
// drag" reads as "less drag"). Amplifying multipliers keep the explicit
// "+" so a positive gain still feels like a gain. (Task #62.)
function loyaltyChipText(mult: number): string {
  return mult > 1
    ? `+${formatMultMagnitude(mult)} loyalty boost`
    : `${formatMultMagnitude(mult)} loyalty drag`;
}
function threatChipText(mult: number): string {
  return mult > 1
    ? `+${formatMultMagnitude(mult)} threat surge`
    : `${formatMultMagnitude(mult)} threat cooling`;
}

// Sandbox action catalog. Every key is auto-derived to EventOnlyActionId, so
// adding an entry to EVENT_ONLY_ACTION_RULES that isn't listed here surfaces
// a TypeScript error at build (see Required<...> below). Effects come from
// the engine table — we only declare presentation, copy, and gating here.
type FactionActionCategory = "diplomatic" | "economic" | "covert" | "hostile";
type FactionActionVariant = "primary" | "secondary" | "warning" | "danger";

type FactionActionMeta = {
  label: string;
  category: FactionActionCategory;
  variant: FactionActionVariant;
  // Optional: gate by faction.type. Currently only `fund` is corporate-only.
  requiresType?: Faction["type"];
};

const FACTION_ACTIONS: Record<EventOnlyActionId, FactionActionMeta> = {
  // Diplomatic
  "negotiate":        { label: "NEGOTIATE",        category: "diplomatic", variant: "secondary" },
  "host-banquet":     { label: "HOST BANQUET",     category: "diplomatic", variant: "secondary" },
  "grant-honor":      { label: "GRANT HONOR",      category: "diplomatic", variant: "secondary" },
  // Economic
  "fund":             { label: "FUND",             category: "economic",   variant: "warning",   requiresType: "corporate" },
  "tax-concession":   { label: "TAX CONCESSION",   category: "economic",   variant: "warning" },
  "seize-assets":     { label: "SEIZE ASSETS",     category: "economic",   variant: "danger" },
  // Covert
  "plant-informant":  { label: "PLANT INFORMANT",  category: "covert",     variant: "warning" },
  "spread-rumors":    { label: "SPREAD RUMORS",    category: "covert",     variant: "warning" },
  "arrange-accident": { label: "ARRANGE ACCIDENT", category: "covert",     variant: "danger" },
  // Hostile
  "suppress":         { label: "SUPPRESS",         category: "hostile",    variant: "danger" },
  "arrest-leaders":   { label: "ARREST LEADERS",   category: "hostile",    variant: "danger" },
  "purge":            { label: "PURGE",            category: "hostile",    variant: "danger" },
};

const ACTION_CATEGORY_ORDER: FactionActionCategory[] = ["diplomatic", "economic", "covert", "hostile"];
const ACTION_CATEGORY_LABEL: Record<FactionActionCategory, string> = {
  diplomatic: "DIPLOMATIC",
  economic:   "ECONOMIC",
  covert:     "COVERT",
  hostile:    "HOSTILE",
};

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

type FactionBacklashContext = {
  faction: Faction;
  happiness: number;
  unrest: number;
  diplomaticReputation: number;
  acceptedDirectDeltas?: { loyalty: number; influence: number; threat: number };
};

function clampedDelta(current: number, requested: number): number {
  return Math.max(0, Math.min(100, current + requested)) - current;
}

function formatBacklashPreview(
  action: string,
  context: FactionBacklashContext,
): string | null {
  const preview = getCoerciveBacklashPreview(action, "targeted", "internal");
  if (!preview) return null;
  const targetAfterDirect = context.acceptedDirectDeltas
    ? {
        loyalty: context.faction.loyalty + context.acceptedDirectDeltas.loyalty,
        threat: context.faction.threat + context.acceptedDirectDeltas.threat,
      }
    : null;
  const targetLoyalty = targetAfterDirect
    ? signed(clampedDelta(targetAfterDirect.loyalty, preview.targetLoyaltyDelta ?? 0))
    : `up to ${signed(preview.targetLoyaltyDelta ?? 0)}`;
  const targetThreat = targetAfterDirect
    ? signed(clampedDelta(targetAfterDirect.threat, preview.targetThreatDelta ?? 0))
    : `up to ${signed(preview.targetThreatDelta ?? 0)}`;
  return [
    `Coercive backlash (${preview.severity})`,
    `city happiness ${signed(clampedDelta(context.happiness, preview.happinessDelta))}`,
    `unrest ${signed(clampedDelta(context.unrest, preview.unrestDelta))}`,
    `diplomatic reputation ${signed(clampedDelta(context.diplomaticReputation, preview.diplomaticReputationDelta))}`,
    `target loyalty ${targetLoyalty}`,
    `target threat ${targetThreat}`,
    `other factions up to ${signed(preview.otherFactionLoyaltyDelta)} loyalty / ${signed(preview.otherFactionThreatDelta)} threat each`,
    ...(preview.unrelatedExternalLoyaltyDelta || preview.unrelatedExternalThreatDelta
      ? [`external partners up to ${signed(preview.unrelatedExternalLoyaltyDelta)} loyalty / ${signed(preview.unrelatedExternalThreatDelta)} threat each`]
      : []),
  ].join(" · ");
}

function formatCost(cost: number): string {
  return cost > 0 ? `${cost.toLocaleString()} credits` : "Free";
}

function formatActionEffects(
  action: EventOnlyActionId,
  faction: Faction,
  playerAttributes: FactionRelationshipPreviewContext["playerAttributes"],
  corruption: number,
): string {
  // The literal `as const` shape of EVENT_ONLY_ACTION_RULES makes each
  // entry's `effects` a narrow object whose key set varies per id. Cast to
  // the canonical DiplomaticActionEffects to read fields generically.
  const rule = EVENT_ONLY_ACTION_RULES[action];
  const effects = rule.effects as DiplomaticActionEffects;
  const resolved = computeFactionActionRelationshipDeltas({
    current: {
      loyalty: faction.loyalty,
      influence: faction.influence,
      threat: faction.threat,
    },
    playerAttributes,
    corruption,
  }, effects);
  const parts: string[] = [];
  if (resolved.loyalty) parts.push(`${signed(resolved.loyalty)} loyalty`);
  if (resolved.influence) parts.push(`${signed(resolved.influence)} influence`);
  if (resolved.threat) parts.push(`${signed(resolved.threat)} threat`);
  return parts.join(" | ");
}

function formatFactionCommitmentPreview(
  action: EventOnlyActionId,
  meta: FactionActionMeta,
  faction: Faction,
  playerAttributes: FactionRelationshipPreviewContext["playerAttributes"],
  corruption: number,
  backlashState: Omit<FactionBacklashContext, "faction" | "acceptedDirectDeltas">,
): string {
  const rule = EVENT_ONLY_ACTION_RULES[action];
  const cooldown = FACTION_DIPLOMACY_COOLDOWNS[action];
  const prerequisite = meta.requiresType
    ? `${meta.requiresType.charAt(0).toUpperCase()}${meta.requiresType.slice(1)} faction`
    : "Any faction";
  const acceptedDirectDeltas = computeFactionActionRelationshipDeltas({
    current: {
      loyalty: faction.loyalty,
      influence: faction.influence,
      threat: faction.threat,
    },
    playerAttributes,
    corruption,
  }, rule.effects as DiplomaticActionEffects);
  const parts = [
    `Cost: ${formatCost(rule.cost)}${rule.cost > 0 ? " (charged on attempt)" : ""}`,
    `Prerequisite: ${prerequisite}`,
    `Cooldown: ${cooldown ? `${cooldown} ticks after attempt` : "None"}`,
    `Expected relationship if accepted: ${formatActionEffects(action, faction, playerAttributes, corruption) || "No direct change"}`,
  ];
  const backlash = formatBacklashPreview(action, {
    ...backlashState,
    faction,
    acceptedDirectDeltas,
  });
  if (backlash) parts.push(`If accepted: ${backlash}`);
  return parts.join("\n");
}

function formatPersonalCommitmentPreview(
  targetKind: "leader" | "faction",
  id: PersonalActionId,
  factionId: string,
  history: PersonalActionHistory | undefined,
  totalTicks: number,
  backlashContext: FactionBacklashContext,
): string {
  const def = PERSONAL_ACTIONS[id];
  const target = { kind: targetKind, id: factionId } as const;
  const acceptedDirectDeltas = computePersonalFactionRelationshipDeltas(
    targetKind,
    id,
    {
      loyalty: backlashContext.faction.loyalty,
      influence: backlashContext.faction.influence,
      threat: backlashContext.faction.threat,
    },
    {
      target,
      history,
      totalTicks,
    },
  );
  const effectText = formatEffectDeltas(acceptedDirectDeltas);
  const decayMultiplier = personalActionDecayMultiplier(
    history,
    target,
    id,
    totalTicks,
  );
  const effects = [
    effectText,
    decayMultiplier < 1 ? `Reduced effect: ${Math.round(decayMultiplier * 100)}%` : "",
  ].filter(Boolean).join(" | ");
  const parts = [
    `Cost: ${formatCost(def.cost)}`,
    `Prerequisite: ${targetKind === "leader" ? "Named faction leader" : "Faction contact"}`,
    `Cooldown: ${def.cooldownTicks} ticks`,
    `Expected relationship: ${effects || "No direct change"}`,
  ];
  const backlash = formatBacklashPreview(id, {
    ...backlashContext,
    acceptedDirectDeltas,
  });
  if (backlash) parts.push(backlash);
  return parts.join("\n");
}

// Eligibility for a faction-level diplomacy action. Unlike the old
// listActionsForFaction (which HID actions the faction couldn't take), this
// returns a reason so the unified menu can grey the button and explain why —
// e.g. "Corporate factions only" for `fund`, or "Need N credits" when broke.
// Loyalty-raising verbs also carry a per-faction cooldown (Task #468) so they
// can't be spammed to farm relationship gains; the cooldown reason is checked
// ahead of affordability to mirror evaluatePersonalAction's precedence.
function factionActionEligibility(
  id: EventOnlyActionId,
  faction: Faction,
  credits: number,
  personalCooldowns: Record<string, number> | undefined,
  totalTicks: number,
): { eligible: boolean; reason?: string } {
  const meta = FACTION_ACTIONS[id];
  if (meta.requiresType && faction.type !== meta.requiresType) {
    const t = meta.requiresType;
    return { eligible: false, reason: `${t.charAt(0).toUpperCase()}${t.slice(1)} factions only` };
  }
  const cooling = factionDiplomacyCooldownReason(personalCooldowns, faction.id, id, totalTicks);
  if (cooling) return { eligible: false, reason: cooling };
  const afford = affordabilityReason(EVENT_ONLY_ACTION_RULES[id].cost, credits);
  return afford ? { eligible: false, reason: afford } : { eligible: true };
}

const FactionTraitInfluences = React.memo(function FactionTraitInfluences({
  contributions,
  loyaltyMult,
  threatMult,
}: {
  contributions: FactionTraitContribution[];
  loyaltyMult: number;
  threatMult: number;
}) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  if (contributions.length === 0) return null;
  if (loyaltyMult === 1 && threatMult === 1) return null;
  return (
    <View
      style={[
        styles.influenceBox,
        { borderColor: tc.border, backgroundColor: tc.bg + "55" },
      ]}
    >
      <View style={styles.influenceHeader}>
        <MaterialCommunityIcons name="account-star" size={11} color={tc.warning} />
        <Text style={[styles.influenceTitle, { color: tc.warning }]}>NPC INFLUENCE</Text>
      </View>
      {contributions.map((c, idx) => {
        const parts: string[] = [];
        if (c.loyaltyMult !== undefined && c.loyaltyMult !== 1) {
          parts.push(loyaltyChipText(c.loyaltyMult));
        }
        if (c.threatMult !== undefined && c.threatMult !== 1) {
          parts.push(threatChipText(c.threatMult));
        }
        if (parts.length === 0) return null;
        const visual = getTraitVisual(c.trait);
        const traitColor = tc[visual.color];
        return (
          <View
            key={`${c.characterId}-${c.trait}-${idx}`}
            style={styles.influenceRow}
          >
            <MaterialCommunityIcons
              name={visual.icon}
              size={11}
              color={traitColor}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[styles.influenceText, { color: tc.textSecondary, flex: 1 }]}
              numberOfLines={2}
            >
              <Text style={{ color: tc.text, fontFamily: "Inter_700Bold" }}>
                {c.characterName}
              </Text>
              <Text style={{ color: traitColor }}>
                {" "}
                &lsquo;{formatTraitLabel(c.trait)}&rsquo;
              </Text>
              <Text style={{ color: tc.textSecondary }}> &rarr; </Text>
              <Text style={{ color: tc.warning }}>{parts.join(", ")}</Text>
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const FactionCard = React.memo(function FactionCard({
  faction,
  contributions,
  loyaltyMult,
  threatMult,
  ledger,
  totalTicks,
  credits,
  personalCooldowns,
  personalActionHistory,
  playerAttributes,
  corruption,
  backlashState,
  administrativeInstitutions,
  onSelect,
}: {
  faction: Faction;
  contributions: FactionTraitContribution[];
  loyaltyMult: number;
  threatMult: number;
  ledger?: PartnerLedger;
  totalTicks: number;
  credits: number;
  personalCooldowns: Record<string, number> | undefined;
  personalActionHistory: PersonalActionHistory | undefined;
  playerAttributes: FactionRelationshipPreviewContext["playerAttributes"];
  corruption: number;
  backlashState: Omit<FactionBacklashContext, "faction" | "acceptedDirectDeltas">;
  administrativeInstitutions?: AdministrativeInstitutions;
  onSelect: (factionId: string, optionId: string) => void;
}) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  const colorKey = FACTION_COLOR_KEYS[faction.type];
  const color = faction.color ?? (colorKey ? tc[colorKey] : faction.type === "cult" ? "#BB88FF" : tc.text);
  const threatHigh = faction.threat > 60;

  const trustTrend = ledger?.trustTrend ?? "steady";
  const trendColor = trustTrend === "rising" ? tc.accent : trustTrend === "falling" ? tc.danger : tc.textMuted;
  const trendArrow = trustTrend === "rising" ? "▲" : trustTrend === "falling" ? "▼" : "▶";
  const ticksSince = ledger ? Math.max(0, totalTicks - ledger.lastInteractionTick) : null;
  const interactionLabel = ticksSince === null
    ? "No interactions yet"
    : ticksSince === 0
    ? "Last interaction: this tick"
    : `Last interaction: ${ticksSince} tick${ticksSince === 1 ? "" : "s"} ago`;

  const infra = faction.infrastructure;
  const disclosure = getEntityDisclosure({
    entityId: faction.id,
    kind: "faction",
    ledger,
  });

  return (
    <CornerBrackets color={threatHigh ? tc.danger : color} style={[styles.card, { backgroundColor: tc.bgCard }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Insignia id={faction.id as any} size={28} color={color} />
          <View style={styles.cardInfo}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.cardName, { color }]} numberOfLines={1}>{faction.name}</Text>
              {ledger ? (
                <Text style={{ color: trendColor, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 }}>
                  {trendArrow} {trustTrend.toUpperCase()}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={[styles.cardType, { color: tc.textMuted }]}>{faction.type.toUpperCase()}</Text>
              <FaithChip faithId={faction.dominantFaithId} />
            </View>
          </View>
        </View>
        {threatHigh && (
          <View style={[styles.threatBadge, { backgroundColor: tc.danger }]}>
            <Text style={styles.threatText}>THREAT</Text>
          </View>
        )}
      </View>

      {faction.leader && (
        <View style={styles.leaderRow}>
          <Text style={[styles.leaderLabel, { color: tc.textMuted }]}>LEADER</Text>
          <Text style={[styles.leaderValue, { color: tc.text }]}>
            {faction.leader.name} · {faction.leader.title}
          </Text>
        </View>
      )}

      <Text style={[styles.lastInteraction, { color: tc.textMuted }]}>{interactionLabel}</Text>

      {faction.mechanicalRole && faction.domains && faction.domains.length > 0 ? (
        <View style={[styles.domainBox, { borderColor: tc.border, backgroundColor: tc.bg + "55" }]}>
          <Text style={[styles.domainRole, { color }]}>{faction.mechanicalRole.replace(/_/g, " ").toUpperCase()}</Text>
          <Text style={[styles.domainText, { color: tc.textSecondary }]}>
            {faction.domains.map((domain) => domain.replace(/_/g, " ")).join(" · ")}
          </Text>
        </View>
      ) : null}

      <OperationalEntitySheet
        name={faction.name}
        kind="internal faction"
        summary={faction.mechanicalRole ? `${faction.mechanicalRole.replace(/_/g, " ")} · ${faction.domains?.join(" · ") ?? "city operations"}` : undefined}
        disclosureLabel={disclosure.label}
        evidenceLabel={disclosureEvidenceLabel(disclosure.evidence)}
        level={disclosure.level}
        accent={color}
        compact
        sections={[{
          title: "OPERATIONAL READOUT",
          rows: [
            { label: "INFLUENCE", value: `${Math.round(faction.influence)}` },
            { label: "LOYALTY", value: `${Math.round(faction.loyalty)}%` },
            { label: "THREAT", value: `${Math.round(faction.threat)}` },
            { label: "LEADER", value: faction.leader ? `${faction.leader.name} · ${faction.leader.title}` : "UNKNOWN" },
          ],
        }]}
      />

      <View style={styles.statsRow}>
        <StatBar label="Influence" value={faction.influence} compact />
        <View style={{ height: 4 }} />
        <StatBar label="Loyalty" value={faction.loyalty} compact />
        <View style={{ height: 4 }} />
        <StatBar label="Threat" value={faction.threat} invertColor compact />
      </View>

      {infra && (
        <View style={[styles.infraBox, { borderColor: tc.border, backgroundColor: tc.bg + "55" }]}>
          <View style={styles.infraHeader}>
            <MaterialCommunityIcons name="domain" size={11} color={tc.info} />
            <Text style={[styles.infraTitle, { color: tc.info }]}>INFRASTRUCTURE</Text>
          </View>
          <View style={styles.infraGrid}>
            <View style={styles.infraCell}>
              <Text style={[styles.infraVal, { color: tc.text }]}>{Math.round(infra.military)}</Text>
              <Text style={[styles.infraLabel, { color: tc.textMuted }]}>MIL</Text>
            </View>
            <View style={styles.infraCell}>
              <Text style={[styles.infraVal, { color: tc.text }]}>{Math.round(infra.walls)}</Text>
              <Text style={[styles.infraLabel, { color: tc.textMuted }]}>WALLS</Text>
            </View>
            <View style={styles.infraCell}>
              <Text style={[styles.infraVal, { color: tc.text }]}>{Math.round(infra.fuel)}</Text>
              <Text style={[styles.infraLabel, { color: tc.textMuted }]}>FUEL</Text>
            </View>
            <View style={styles.infraCell}>
              <Text style={[styles.infraVal, { color: tc.text }]}>{Math.round(infra.civilian)}</Text>
              <Text style={[styles.infraLabel, { color: tc.textMuted }]}>CIV</Text>
            </View>
          </View>
        </View>
      )}

      <FactionTraitInfluences
        contributions={contributions}
        loyaltyMult={loyaltyMult}
        threatMult={threatMult}
      />

      <FactionActionMenu
        faction={faction}
        credits={credits}
        personalCooldowns={personalCooldowns}
        personalActionHistory={personalActionHistory}
        playerAttributes={playerAttributes}
        corruption={corruption}
        backlashState={backlashState}
        totalTicks={totalTicks}
        onSelect={onSelect}
      />
    </CornerBrackets>
  );
});

const FactionActionMenu = React.memo(function FactionActionMenu({
  faction,
  credits,
  personalCooldowns,
  personalActionHistory,
  playerAttributes,
  corruption,
  backlashState,
  totalTicks,
  onSelect,
}: {
  faction: Faction;
  credits: number;
  personalCooldowns: Record<string, number> | undefined;
  personalActionHistory: PersonalActionHistory | undefined;
  playerAttributes: FactionRelationshipPreviewContext["playerAttributes"];
  corruption: number;
  backlashState: Omit<FactionBacklashContext, "faction" | "acceptedDirectDeltas">;
  totalTicks: number;
  onSelect: (factionId: string, optionId: string) => void;
}) {
  const styles = useStyles();
  // The unified menu groups the new personal verbs first, then the reused
  // faction-level diplomacy actions by category. Ineligible options are kept
  // visible (greyed, with a reason) rather than hidden.
  const groups = useMemo<InteractionMenuGroup[]>(() => {
    const out: InteractionMenuGroup[] = [];
    // The card represents a faction's named leader when one exists. Keep the
    // target identity distinct from broad faction actions while applying only
    // the faction relationship fields already present in the state.
    const personalTargetKind = faction.leader ? "leader" : "faction";

    out.push({
      key: "personal",
      label: "PERSONAL",
      options: PERSONAL_ACTOR_ACTION_ORDER.map((id) => {
        const def = PERSONAL_ACTIONS[id];
        const elig = evaluatePersonalAction(id, credits, {
          target: { kind: personalTargetKind, id: faction.id },
          cooldowns: personalCooldowns,
          history: personalActionHistory,
          totalTicks,
        });
        return {
          id,
          label: def.label,
          subtitle: formatPersonalCommitmentPreview(
            personalTargetKind,
            id,
            faction.id,
            personalActionHistory,
            totalTicks,
            { ...backlashState, faction },
          ),
          variant: def.variant,
          eligible: elig.eligible,
          reason: elig.reason,
        };
      }),
    });

    for (const cat of ACTION_CATEGORY_ORDER) {
      const ids = (Object.keys(FACTION_ACTIONS) as EventOnlyActionId[]).filter(
        (id) => FACTION_ACTIONS[id].category === cat,
      );
      if (ids.length === 0) continue;
      out.push({
        key: cat,
        label: ACTION_CATEGORY_LABEL[cat],
        options: ids.map((id) => {
          const meta = FACTION_ACTIONS[id];
          const elig = factionActionEligibility(id, faction, credits, personalCooldowns, totalTicks);
          return {
            id,
            label: meta.label,
            subtitle: formatFactionCommitmentPreview(
              id,
              meta,
              faction,
              playerAttributes,
              corruption,
              backlashState,
            ),
            variant: meta.variant,
            eligible: elig.eligible,
            reason: elig.reason,
          };
        }),
      });
    }

    return out;
  }, [faction, credits, personalCooldowns, personalActionHistory, playerAttributes, corruption, backlashState, totalTicks]);

  // Quick-row keeps the original primary verbs visible: a handshake, a stick,
  // and (for corporates) a carrot. Everything else lives behind the expander.
  const quickIds =
    faction.type === "corporate"
      ? ["negotiate", "suppress", "fund"]
      : ["negotiate", "suppress"];

  const handleSelect = useCallback(
    (optionId: string) => onSelect(faction.id, optionId),
    [onSelect, faction.id],
  );

  return (
    <View style={styles.actions}>
      <InteractionMenu groups={groups} quickIds={quickIds} onSelect={handleSelect} />
    </View>
  );
});

function FactionsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state: rawState, actionFaction, performPersonalInteraction } = useGame();
  const state = useThrottledValue(rawState, 500);
  const credits = Math.floor(state.resources.credits);
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { modal, showModal, hideModal } = useGameModal();
  const filterScrollRef = useHorizontalWheelScroll();
  const [typeFilter, setTypeFilter] = useState<"all" | "internal" | "law" | "criminal" | "corporate" | "underclass" | "cult">("all");
  const [highThreatOnly, setHighThreatOnly] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const pendingInboxIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const previousIds = pendingInboxIdsRef.current;
    if (!previousIds) return;
    const result = rawState.messages.find((message) =>
      !previousIds.has(message.id) &&
      (
        message.id.startsWith("diplo-") ||
        message.id.startsWith("personal-")
      ),
    );
    if (!result) return;
    const firstLine = result.body.split("\n")[0]?.trim();
    setActionFeedback(`${result.title}${firstLine ? ` — ${firstLine}` : ""}`);
    pendingInboxIdsRef.current = null;
  }, [rawState.messages]);

  const factionById = useMemo(() => {
    const m = new Map(state.factions.map((f) => [f.id, f]));
    return m;
  }, [state.factions]);

  // Single entry point from the unified menu. Personal verbs route to the new
  // performPersonalInteraction reducer; everything else is a faction-level
  // diplomacy action handled by actionFaction. Both show a confirm modal.
  const handleSelect = useCallback((factionId: string, optionId: string) => {
    const faction = factionById.get(factionId);
    if (!faction) return;

    if (optionId in PERSONAL_ACTIONS) {
      const pid = optionId as PersonalActionId;
      const def = PERSONAL_ACTIONS[pid];
      const personalTargetKind = faction.leader ? "leader" : "faction";
      const commitment = formatPersonalCommitmentPreview(
        personalTargetKind,
        pid,
        factionId,
        state.personalActionHistory,
        state.totalTicks,
        {
          faction,
          happiness: state.cityStats.happiness,
          unrest: state.cityStats.unrest,
          diplomaticReputation: state.diplomaticReputation ?? 50,
        },
      );
      const targetName = faction.leader?.name ?? faction.name;
      const coercive = isCoerciveActionId(pid);
      showModal(
        `${coercive ? "CONFIRM COERCIVE ACTION: " : ""}${def.label}: ${targetName}`,
        `${coercive ? "WARNING: This action causes durable social and political backlash.\n\n" : ""}${def.description}\n\n${commitment}`,
        [
          { text: "Abort", style: "cancel" },
          {
            text: def.label,
            style: coercive || def.variant === "danger" ? "destructive" : undefined,
            onPress: () => {
              pendingInboxIdsRef.current = new Set(rawState.messages.map((message) => message.id));
              performPersonalInteraction({ kind: personalTargetKind, id: factionId }, pid);
            },
          },
        ],
      );
      return;
    }

    const action = optionId as EventOnlyActionId;
    const meta = FACTION_ACTIONS[action];
    if (!meta) return;
    const commitment = formatFactionCommitmentPreview(
      action,
      meta,
      faction,
      state.player?.attributes,
      state.cityStats.corruption,
      {
        happiness: state.cityStats.happiness,
        unrest: state.cityStats.unrest,
        diplomaticReputation: state.diplomaticReputation ?? 50,
      },
    );
    const isDestructive = isCoerciveActionId(action);

    showModal(
      `${isDestructive ? "CONFIRM COERCIVE ACTION: " : ""}${meta.label}: ${faction.name}`,
      `${isDestructive ? "WARNING: This action causes durable social and political backlash.\n\n" : ""}${commitment}`,
      [
        { text: "Abort", style: "cancel" },
        {
          text: meta.label,
          style: isDestructive ? "destructive" : undefined,
          onPress: () => {
            pendingInboxIdsRef.current = new Set(rawState.messages.map((message) => message.id));
            actionFaction(factionId, action);
          },
        },
      ]
    );
  }, [factionById, showModal, actionFaction, performPersonalInteraction, rawState.messages, state.personalActionHistory, state.player?.attributes, state.cityStats, state.diplomaticReputation, state.totalTicks]);

  const highThreats = useMemo(() => state.factions.filter((f) => f.threat > 60), [state.factions]);
  const loyalFactions = useMemo(() => state.factions.filter((f) => f.loyalty > 65), [state.factions]);

  // PERF: Memoize the per-faction trait computation. Without this, every state
  // tick re-ran computeFactionTraitMultipliers + listFactionTraitContributions
  // for every visible faction, which scales with factions × characters × traits.
  const factionRows = useMemo(() => {
    return state.factions
      .filter((f) => !isInternalFaction(f) && (typeFilter === "all" || f.type === typeFilter) && (!highThreatOnly || f.threat > 60))
      .map((f) => {
        const mults = computeFactionTraitMultipliers(state, f.id);
        const contributions =
          mults.loyaltyMult !== 1 || mults.threatMult !== 1
            ? listFactionTraitContributions(state, f.id)
            : [];
        return (
          <FactionCard
            key={f.id}
            faction={f}
            contributions={contributions}
            loyaltyMult={mults.loyaltyMult}
            threatMult={mults.threatMult}
            ledger={state.partnerLedgers?.[f.id]}
            totalTicks={state.totalTicks}
            credits={credits}
            personalCooldowns={state.personalActionCooldowns}
            personalActionHistory={state.personalActionHistory}
            playerAttributes={state.player?.attributes}
            corruption={state.cityStats.corruption}
            backlashState={{
              happiness: state.cityStats.happiness,
              unrest: state.cityStats.unrest,
              diplomaticReputation: state.diplomaticReputation ?? 50,
            }}
            administrativeInstitutions={state.administrativeInstitutions}
            onSelect={handleSelect}
          />
        );
      });
  }, [state.factions, state.namedCharacters, state.partnerLedgers, state.totalTicks, state.personalActionCooldowns, state.personalActionHistory, state.administrativeInstitutions, credits, typeFilter, highThreatOnly, handleSelect]);

  const internalFactionPanels = useMemo(() => {
    if (typeFilter !== "all" && typeFilter !== "internal") return null;
    const show = (f: Faction) => !highThreatOnly || f.threat > 60;
    const administrative = state.factions.find((f) => f.id === "administrative-bloc");
    const rustWardens = state.factions.find((f) => f.id === "rust-wardens");
    return (
      <>
        {administrative && isInternalFaction(administrative) && show(administrative) ? <AdministrativeBlocPanel detailed /> : null}
        {rustWardens && isInternalFaction(rustWardens) && show(rustWardens) ? <RustWardensPanel detailed /> : null}
      </>
    );
  }, [state.factions, typeFilter, highThreatOnly]);

  const { colors: tc } = useTheme();

  return (
    <View style={[styles.root, { paddingTop: topInset, backgroundColor: tc.bg }]}>
      <CommandScreenHeader
        icon="users"
        title="FACTIONS / CIVIC & EXTERNAL AFFAIRS"
        subtitle="internal operations · influence · loyalty · threat"
      />
      {actionFeedback ? (
        <View
          accessibilityRole="alert"
          style={[styles.actionFeedback, { borderColor: tc.accent, backgroundColor: tc.accent + "1A" }]}
        >
          <MaterialCommunityIcons name="check-circle-outline" size={14} color={tc.accent} />
          <Text style={[styles.actionFeedbackText, { color: tc.text }]}>{actionFeedback}</Text>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <SectionHeader title="Faction Overview" icon={<MaterialCommunityIcons name="flag-variant" size={14} color={tc.accent} />} />
        <View style={styles.summaryRow}>
          <View style={[styles.summaryBox, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <Text style={[styles.summaryVal, { color: tc.danger }]}>{highThreats.length}</Text>
            <Text style={[styles.summaryLabel, { color: tc.textMuted }]}>HIGH THREAT</Text>
          </View>
          <View style={[styles.summaryBox, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <Text style={[styles.summaryVal, { color: tc.accent }]}>{loyalFactions.length}</Text>
            <Text style={[styles.summaryLabel, { color: tc.textMuted }]}>LOYAL</Text>
          </View>
          <View style={[styles.summaryBox, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <Text style={[styles.summaryVal, { color: tc.text }]}>{state.factions.length}</Text>
            <Text style={[styles.summaryLabel, { color: tc.textMuted }]}>TOTAL</Text>
          </View>
        </View>

        {highThreats.length > 0 && (
          <View style={[styles.alertBanner, { borderColor: tc.danger, backgroundColor: tc.danger + "1A" }]}>
            <MaterialCommunityIcons name="alert" size={14} color={tc.danger} />
            <Text style={[styles.alertText, { color: tc.danger }]}>
              {highThreats.length} faction(s) at critical threat level. Immediate action recommended.
            </Text>
          </View>
        )}

        <SectionHeader
          title="Browse Factions"
          subtitle="internal groups are separated from outside powers"
          icon={<MaterialCommunityIcons name="account-group-outline" size={14} color={tc.accent} />}
        />

        <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
          {(["all", "internal", "law", "criminal", "corporate", "underclass", "cult"] as const).map((opt) => {
            const active = typeFilter === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setTypeFilter(opt)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 3,
                  borderWidth: 1,
                  borderColor: active ? tc.accent : tc.border,
                  backgroundColor: active ? tc.accent + "25" : tc.bgCard,
                }}
              >
                <Text style={{ color: active ? tc.accent : tc.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>
                  {opt.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setHighThreatOnly((v) => !v)}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 3,
              borderWidth: 1,
              borderColor: highThreatOnly ? tc.danger : tc.border,
              backgroundColor: highThreatOnly ? tc.danger + "25" : tc.bgCard,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <MaterialCommunityIcons name="alert" size={10} color={highThreatOnly ? tc.danger : tc.textMuted} />
            <Text style={{ color: highThreatOnly ? tc.danger : tc.textMuted, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>
              HIGH THREAT
            </Text>
          </Pressable>
        </ScrollView>

        {(typeFilter === "all" || typeFilter === "internal") && (
          <>
            <SectionHeader
              title="Internal Factions"
              subtitle="city institutions and worker movements"
              icon={<MaterialCommunityIcons name="city-variant-outline" size={14} color={tc.warning} />}
            />
            {internalFactionPanels}
          </>
        )}

        {typeFilter !== "internal" && (
          <>
            <SectionHeader
              title="Other Factions"
              subtitle="independent groups handled through faction relations"
              icon={<MaterialCommunityIcons name="account-multiple-outline" size={14} color={tc.accent} />}
            />
            {factionRows}
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
      <GameModal {...modal} onDismiss={hideModal} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1.5 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 12, paddingBottom: 20 },

  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    alignItems: "center",
  },
  summaryVal: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,59,48,0.1)",
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  alertText: {
    color: Colors.danger,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
  },
  actionFeedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginHorizontal: Platform.OS === "web" ? 12 : 16,
    marginTop: 8,
  },
  actionFeedbackText: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    lineHeight: 16,
  },
  card: {
    backgroundColor: Colors.bgCard,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  cardType: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  domainBox: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginBottom: 12,
  },
  domainRole: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  domainText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    textTransform: "capitalize",
  },
  institutionBox: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 9,
    marginBottom: 12,
  },
  institutionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1.1,
    marginBottom: 7,
  },
  institutionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 7,
  },
  institutionCell: {
    minWidth: 46,
  },
  institutionValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  institutionLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 7,
    letterSpacing: 0.6,
  },
  institutionCohorts: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    lineHeight: 13,
    textTransform: "capitalize",
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 10,
  },
  leaderLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1.1,
  },
  leaderValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  statsRow: {
    marginBottom: 12,
  },
  actions: {},
  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  moreToggleText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  categoryGroup: {
    marginTop: 8,
  },
  categoryHeader: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.4,
    marginBottom: 4,
    paddingLeft: 2,
  },
  threatBadge: {
    backgroundColor: Colors.danger,
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  threatText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  influenceBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  influenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  influenceTitle: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  influenceRow: {
    paddingVertical: 2,
  },
  influenceText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
  },
  lastInteraction: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  infraBox: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  infraHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  infraTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  infraGrid: {
    flexDirection: "row",
    gap: 6,
  },
  infraCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 2,
  },
  infraVal: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  infraLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    letterSpacing: 0.8,
    marginTop: 1,
  },
}));

export default withScreenBoundary(FactionsScreen, "factions");

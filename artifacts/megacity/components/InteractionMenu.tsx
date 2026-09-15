import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import MenuButton from "@/components/MenuButton";
import { useTheme } from "@/context/ThemeContext";

// Shared, presentation-only interaction menu (Task #382). Both the Factions
// screen and the Character screen build a list of grouped options and hand them
// to this component. It knows nothing about factions, officers, or the engine —
// it just renders a quick row plus an expandable set of category groups, greys
// out ineligible options (showing WHY rather than hiding them), and reports the
// chosen option id back through onSelect.

export type InteractionMenuOption = {
  id: string;
  label: string;
  // Commitment preview shown under the label. Disabled options keep this
  // preview beneath the exact blocker so costs and consequences remain visible.
  subtitle?: string;
  variant?: "primary" | "secondary" | "danger" | "warning" | "muted";
  // When false the button is greyed and disabled, and `reason` is shown in
  // place of the subtitle so the player understands the gate.
  eligible: boolean;
  reason?: string;
};

export type InteractionMenuGroup = {
  key: string;
  label: string;
  options: InteractionMenuOption[];
};

type Props = {
  groups: InteractionMenuGroup[];
  onSelect: (optionId: string) => void;
  // Option ids surfaced in the always-visible quick row. Anything not listed
  // lives behind the "MORE ACTIONS" expander, grouped by category. Omit to show
  // every option grouped and expanded (no quick row).
  quickIds?: string[];
};

function OptionButton({
  option,
  onSelect,
}: {
  option: InteractionMenuOption;
  onSelect: (id: string) => void;
}) {
  return (
    <MenuButton
      label={option.label}
      subtitle={option.eligible
        ? option.subtitle
        : [`BLOCKED: ${option.reason ?? "Requirements not met"}`, option.subtitle]
            .filter(Boolean)
            .join("\n")}
      variant={option.eligible ? option.variant ?? "secondary" : "muted"}
      disabled={!option.eligible}
      onPress={() => onSelect(option.id)}
    />
  );
}

function InteractionMenu({ groups, onSelect, quickIds }: Props) {
  const { colors: tc } = useTheme();

  const quickSet = useMemo(() => new Set(quickIds ?? []), [quickIds]);

  // Quick-row order follows the caller's quickIds array (not group order) so the
  // primary verbs stay where the caller placed them.
  const quickOptions = useMemo(() => {
    if (!quickIds || quickIds.length === 0) return [] as InteractionMenuOption[];
    const byId = new Map<string, InteractionMenuOption>();
    for (const g of groups) {
      for (const o of g.options) byId.set(o.id, o);
    }
    const out: InteractionMenuOption[] = [];
    for (const id of quickIds) {
      const o = byId.get(id);
      if (o) out.push(o);
    }
    return out;
  }, [groups, quickIds]);

  const moreGroups = useMemo(() => {
    return groups
      .map((g) => ({ ...g, options: g.options.filter((o) => !quickSet.has(o.id)) }))
      .filter((g) => g.options.length > 0);
  }, [groups, quickSet]);

  const moreCount = useMemo(
    () => moreGroups.reduce((n, g) => n + g.options.length, 0),
    [moreGroups],
  );

  const hasQuickRow = quickOptions.length > 0;
  const showToggle = hasQuickRow && moreCount > 0;
  const [expanded, setExpanded] = useState(!hasQuickRow);

  const groupsVisible = !showToggle || expanded;

  return (
    <View style={styles.root}>
      {quickOptions.map((o) => (
        <OptionButton key={o.id} option={o} onSelect={onSelect} />
      ))}

      {showToggle && (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={[styles.moreToggle, { borderColor: tc.border }]}
        >
          <MaterialCommunityIcons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={tc.textMuted}
          />
          <Text style={[styles.moreToggleText, { color: tc.textMuted }]}>
            {expanded ? "FEWER ACTIONS" : `MORE ACTIONS (${moreCount})`}
          </Text>
        </Pressable>
      )}

      {groupsVisible &&
        moreGroups.map((g) => (
          <View key={g.key} style={styles.categoryGroup}>
            <Text style={[styles.categoryHeader, { color: tc.textMuted }]}>{g.label}</Text>
            {g.options.map((o) => (
              <OptionButton key={o.id} option={o} onSelect={onSelect} />
            ))}
          </View>
        ))}
    </View>
  );
}

export default React.memo(InteractionMenu);

const styles = StyleSheet.create({
  root: {
    marginTop: 4,
  },
  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 4,
  },
  moreToggleText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  categoryGroup: {
    marginTop: 4,
  },
  categoryHeader: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
  },
});

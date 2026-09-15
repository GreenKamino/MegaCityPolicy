import { router } from "expo-router";

import type { DefenseSuggestionTarget } from "@/engine/defenseBreakdown";

/** Route every defense recovery target to its actionable screen. */
export function navigateToDefenseSuggestion(target: DefenseSuggestionTarget): void {
  switch (target.screen) {
    case "construction":
      router.push({
        pathname: "/(game)/construction",
        params: {
          category: target.category,
          ...(target.highlight ? { highlight: target.highlight } : {}),
        },
      });
      return;
    case "military":
      router.push("/(game)/military");
      return;
    case "recruitment":
      router.push("/(game)/recruitment");
      return;
    case "law":
      router.push("/(game)/law");
      return;
    default: {
      const _exhaustive: never = target;
      void _exhaustive;
      return;
    }
  }
}
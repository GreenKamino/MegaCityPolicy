import { router } from "expo-router";

import type { TransitSuggestionTarget } from "@/engine/transitBreakdown";

/** Route every transit recovery target to its actionable screen. */
export function navigateToTransitSuggestion(target: TransitSuggestionTarget): void {
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
    case "recruitment":
      router.push("/(game)/recruitment");
      return;
    default: {
      const _exhaustive: never = target;
      void _exhaustive;
      return;
    }
  }
}
import { router } from "expo-router";

import type { InfraSuggestionTarget } from "@/engine/infrastructureBreakdown";

/** Route every infrastructure recovery target to its actionable screen. */
export function navigateToInfraSuggestion(target: InfraSuggestionTarget): void {
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
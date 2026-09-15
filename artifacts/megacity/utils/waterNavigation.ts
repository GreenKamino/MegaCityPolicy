import { router } from "expo-router";

import type { WaterSuggestionTarget } from "@/engine/waterBreakdown";

/** Route every water recovery target to the screen that can resolve it. */
export function navigateToWaterSuggestion(target: WaterSuggestionTarget): void {
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
    case "megaprojects":
      router.push("/(game)/megaprojects" as any);
      return;
    default: {
      const _exhaustive: never = target;
      void _exhaustive;
      return;
    }
  }
}
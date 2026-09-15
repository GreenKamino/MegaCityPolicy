import { router } from "expo-router";

import type { EmploymentSuggestionTarget } from "@/engine/employmentBreakdown";

/** Route every employment recovery target to its actionable screen. */
export function navigateToEmploymentSuggestion(target: EmploymentSuggestionTarget): void {
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
    case "law":
      router.push("/(game)/law");
      return;
    case "companies":
      router.push("/(game)/companies");
      return;
    default: {
      const _exhaustive: never = target;
      void _exhaustive;
      return;
    }
  }
}
import { router } from "expo-router";

import type { BiosphereSuggestionTarget } from "@/engine/biosphereBreakdown";

// Route params are compared by value, so repeated taps on the same recovery
// target need a changing value to re-trigger the construction deep-link.
let lastHighlightNonce = 0;

function nextHighlightNonce(): string {
  const now = Date.now();
  lastHighlightNonce = Math.max(now, lastHighlightNonce + 1);
  return String(lastHighlightNonce);
}

/** Route every biosphere recovery target to the screen that can resolve it. */
export function navigateToBiosphereSuggestion(target: BiosphereSuggestionTarget): void {
  switch (target.screen) {
    case "construction":
      router.push({
        pathname: "/(game)/construction",
        params: {
          category: target.category,
          hl: nextHighlightNonce(),
          ...(target.highlight ? { highlight: target.highlight } : {}),
        },
      });
      return;
    case "law":
      router.push("/(game)/law");
      return;
    case "inbox":
      router.push("/(game)/inbox");
      return;
    default: {
      const _exhaustive: never = target;
      void _exhaustive;
      return;
    }
  }
}
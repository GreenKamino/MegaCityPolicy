import { router } from "expo-router";

import type { RecurrenceFixTarget } from "@/engine/recurringEvents";

// Construction screens use a nonce so tapping the same fix again after
// returning to the card still re-runs their category/highlight effect.
let lastFixNonce = 0;

function nextFixNonce(): string {
  const now = Date.now();
  lastFixNonce = Math.max(now, lastFixNonce + 1);
  return String(lastFixNonce);
}

/** Navigate to the management surface for a repeat crisis without resolving it. */
export function navigateToRecurrenceFix(target: RecurrenceFixTarget): void {
  switch (target.screen) {
    case "wildlands":
      router.push("/(game)/wildlands");
      return;
    case "construction":
      router.push({
        pathname: "/(game)/construction",
        params: {
          category: target.category,
          hl: nextFixNonce(),
          ...(target.highlight ? { highlight: target.highlight } : {}),
        },
      });
      return;
    case "officers":
      router.push("/(game)/officers");
      return;
    default: {
      const _exhaustive: never = target;
      void _exhaustive;
    }
  }
}
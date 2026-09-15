import { router } from "expo-router";

import type { CrimeSuggestionTarget } from "@/engine/crimeBreakdown";

// Single source of truth for turning a crime recovery suggestion's deep-link
// target into a route jump. Shared by the Law screen (law.tsx) and the overview
// (overview.tsx) so the two can never drift: previously each screen kept its own
// near-identical copy, and a new CrimeSuggestionTarget variant could quietly go
// unhandled in one of them, leaving a tapped tip doing nothing.
//
// This lives in utils/ (NOT under app/) on purpose: in this expo-router version
// every file under app/ except _layout is treated as a route, so a helper module
// placed there would become a phantom route.
//
// `alreadyOnLaw` makes the "law" target non-navigational — the Law screen is
// already showing the public-order policies, so there is nowhere to jump —
// while the overview routes to the Law screen.
//
// The switch is exhaustive: the `never` default is a compile-time guard, so
// adding a new variant to CrimeSuggestionTarget in engine/crimeBreakdown.ts
// fails typecheck here until this one shared helper handles it. Both call sites
// stay in sync for free (see crimeReversibility.test.ts for the runtime guard).
export function isCrimeSuggestionNavigable(
  target: CrimeSuggestionTarget,
  opts?: { alreadyOnLaw?: boolean },
): boolean {
  return !(target.screen === "law" && opts?.alreadyOnLaw);
}

export function navigateToCrimeSuggestion(
  target: CrimeSuggestionTarget,
  opts?: { alreadyOnLaw?: boolean },
): void {
  if (!isCrimeSuggestionNavigable(target, opts)) return;

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
    case "mining":
      router.push("/(game)/mining");
      return;
    case "law":
      router.push("/(game)/law");
      return;
    default: {
      // Exhaustiveness guard: a new CrimeSuggestionTarget variant lands here as a
      // type error until it is handled above.
      const _exhaustive: never = target;
      void _exhaustive;
      return;
    }
  }
}

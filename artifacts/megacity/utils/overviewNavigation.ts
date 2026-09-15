import { router } from "expo-router";

import type { OverviewWarningTarget } from "@/engine/overviewWarnings";
import type { OverviewSectionTarget } from "@/utils/overviewSections";

let constructionLinkNonce = 0;

/** Open City at a supported internal section without changing its route identity. */
export function navigateToOverviewSection(section: OverviewSectionTarget): void {
  router.push({
    pathname: "/(game)/overview",
    params: { section },
  } as any);
}

function nextConstructionLinkNonce(): string {
  constructionLinkNonce += 1;
  return String(constructionLinkNonce);
}

/** Navigate from a City warning to the screen that can address it. */
export function navigateToOverviewWarning(target: OverviewWarningTarget): void {
  switch (target.screen) {
    case "construction":
      router.push({
        pathname: "/(game)/construction",
        params: {
          category: target.category,
          hl: nextConstructionLinkNonce(),
        },
      } as any);
      return;
    case "law":
      router.push("/(game)/law");
      return;
    case "economy":
      router.push("/(game)/economy");
      return;
    case "districts":
      router.push("/(game)/districts");
      return;
    case "military":
      router.push("/(game)/military");
      return;
    case "wildlands":
      router.push("/(game)/wildlands");
      return;
    default: {
      const _exhaustive: never = target;
      void _exhaustive;
    }
  }
}